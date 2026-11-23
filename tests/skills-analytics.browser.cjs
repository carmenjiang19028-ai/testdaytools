const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const base = 'https://testdaytools.com';
const output = process.env.SKILLS_QA_DIR || '/private/tmp/testdaytools-skills-analytics-2026-10-18';
const measurementId = JSON.parse(fs.readFileSync(path.join(root, 'content/site_data.json'), 'utf8')).site.analytics.ga4MeasurementId;
const googleTag = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
const events = page => page.evaluate(() => (window.dataLayer || []).filter(item => item[0] === 'event').map(item => ({ name: item[1], params: item[2] })));
const startChecking = page => page.getByRole('button', { name: 'Start 90-second round' }).click();

async function isolatedPage(browser, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const unexpected = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.href === googleTag) return route.fulfill({ contentType: 'text/javascript', body: '' });
    // Local fixtures only: test page views and answers never reach Google.
    if (url.origin !== base) {
      unexpected.push(url.href);
      return route.abort();
    }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
    return route.fulfill({ path: file, contentType: 'text/html' });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return { context, page, errors, unexpected };
}

async function assertPageTag(page, slug) {
  await page.goto(`${base}/${slug}.html`);
  assert.equal(await page.locator('script[src]').count(), 1);
  assert.equal(await page.locator('script[src]').getAttribute('src'), googleTag);
  const configs = await page.evaluate(() => (window.dataLayer || []).filter(item => item[0] === 'config').map(item => item[1]));
  assert.deepEqual(configs, [measurementId]);
  assert.deepEqual(await events(page), [], 'Page load is not an answer');
  const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(size.scroll <= size.width + 1, `Horizontal overflow on ${slug}`);
}

async function checkEvent(page, expected, tool, slug, attemptType = 'first', offset = 0) {
  const tracked = (await events(page)).slice(offset);
  assert.deepEqual(tracked, expected.map(name => ({
    name,
    params: name === 'skills_practice_start'
      ? { tool, page_path: `/${slug}.html`, attempt_type: attemptType }
      : { tool, page_path: `/${slug}.html` },
  })));
}

async function hub(browser, viewport) {
  const { context, page, errors, unexpected } = await isolatedPage(browser, viewport);
  try {
    await assertPageTag(page, 'skills-practice');
    await page.evaluate(() => window.trackSkillAnswer('unknown_tool'));
    assert.deepEqual(await events(page), []);
    await page.screenshot({ path: path.join(output, `hub-${viewport.width}.png`), fullPage: true });
    await page.locator('a[href="filing-practice.html"]').first().click();
    assert.deepEqual(await events(page), [], 'Following a tool link is not an answer');
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
  } finally { await context.close(); }
}

async function practice(browser, viewport, slug, tool, selector) {
  const { context, page, errors, unexpected } = await isolatedPage(browser, viewport);
  try {
    await assertPageTag(page, slug);
    await page.locator('[data-new]').click();
    if (tool === 'filing_order') await page.locator('[data-rule]').selectOption('date');
    assert.deepEqual(await events(page), [], 'Generating a question or round is not an answer');
    if (tool === 'clerical_checking') {
      await startChecking(page);
      assert.deepEqual(await events(page), [], 'Starting the clock is not an answer');
    }
    await page.locator(selector).first().click();
    const firstExpected = ['skills_practice_start', 'skills_answer_checked'];
    if (tool === 'filing_order') firstExpected.push('skills_practice_complete');
    await checkEvent(page, firstExpected, tool, slug);
    await page.locator(selector).first().dispatchEvent('click');
    await checkEvent(page, firstExpected, tool, slug);
    if (tool === 'clerical_checking') {
      for (let n = 1; n < 12; n += 1) {
        await page.locator('[data-next]').click();
        await page.locator(selector).first().click();
      }
      await page.locator('[data-next]').click();
      const completed = ['skills_practice_start', ...Array(12).fill('skills_answer_checked'), 'skills_practice_complete'];
      await checkEvent(page, completed, tool, slug);
      await page.locator('[data-next]').dispatchEvent('click');
      await checkEvent(page, completed, tool, slug);
    }
    await page.screenshot({ path: path.join(output, `${tool}-${viewport.width}.png`), fullPage: true });
    const beforeRetry = (await events(page)).length;
    await page.locator('[data-new]').click();
    await checkEvent(page, ['skills_practice_retry'], tool, slug, 'retry', beforeRetry);
    if (tool === 'clerical_checking') await startChecking(page);
    await page.locator(selector).first().click();
    const retryExpected = ['skills_practice_retry', 'skills_practice_start', 'skills_answer_checked'];
    if (tool === 'filing_order') retryExpected.push('skills_practice_complete');
    await checkEvent(page, retryExpected, tool, slug, 'retry', beforeRetry);
    await page.reload();
    assert.deepEqual(await events(page), [], 'Refreshing saved feedback must not replay an answer or completion');
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
  } finally { await context.close(); }
}

async function expired(browser, viewport) {
  const { context, page, errors } = await isolatedPage(browser, viewport);
  try {
    await assertPageTag(page, 'clerical-checking-practice');
    await startChecking(page);
    await page.evaluate(() => {
      Object.defineProperty(performance, 'now', { value: () => 1e9 });
      document.querySelector('[data-answer]').click();
    });
    assert.deepEqual(await events(page), [], 'An expired round must not record an answer');
    assert.equal(await page.locator('[data-feedback]').isVisible(), false);
    assert.match(await page.locator('[data-timeout]').innerText(), /0 of 12 answered.*12 not reached/s);
    assert.equal(await page.locator('[data-timeout-errors] li').count(), 0);
    assert.match(await page.locator('[data-timeout-tip]').innerText(), /untimed mode/i);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

async function timedReview(browser, viewport) {
  const { context, page, errors, unexpected } = await isolatedPage(browser, viewport);
  try {
    const key = 'tdt-skills-checking-v1';
    const stats = 'tdt-skills-checking-stats-v1';
    const read = key => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    await assertPageTag(page, 'clerical-checking-practice');
    await startChecking(page);
    const { items } = await read(key);
    const [wrong, flagged, correct] = items;
    const next = page.locator('[data-next]');
    const report = page.getByRole('region', { name: 'Time up: review this round' });
    for (const choice of [wrong.truth === 'match' ? 'mismatch' : 'match', 'unsure', correct.truth]) {
      await page.locator(`[data-answer="${choice}"]`).click();
      await next.click();
    }
    assert.equal(await report.isVisible(), false);
    await page.locator('[data-answer="match"]').focus();
    await page.evaluate(() => Object.defineProperty(performance, 'now', { value: () => 1e9 }));
    await report.waitFor();
    assert.match(await report.locator('[data-timeout-summary]').innerText(), /3 of 12 answered.*1 correct.*1 wrong.*1 flagged.*9 not reached/);
    const rows = await report.getByRole('listitem').allTextContents();
    assert.equal(rows.length, 2);
    assert.ok(rows[0].includes('Comparison 1'));
    assert.ok(rows[0].includes(`Source: ${wrong.left}`));
    assert.ok(rows[0].includes(`Copy: ${wrong.right}`));
    assert.ok(rows[0].includes(wrong.why));
    assert.ok(rows[1].includes('Comparison 2'));
    assert.ok(rows[1].includes('Flagged for review'));
    assert.ok(rows[1].includes(flagged.why));
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'checking-timeout-title');
    assert.equal(await next.isDisabled(), true);
    assert.equal(await page.locator('[data-question]').isVisible(), false);
    assert.equal(await next.isVisible(), false);
    const layout = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    assert.ok(layout[0] <= layout[1] + 1);
    assert.equal(await read(stats), null, 'Partial rounds are not completed rounds');
    await checkEvent(page, ['skills_practice_start', ...Array(3).fill('skills_answer_checked')], 'clerical_checking', 'clerical-checking-practice');
    await page.screenshot({ path: path.join(output, `clerical-timeout-${viewport.width}.png`), fullPage: true });
    await page.reload();
    assert.deepEqual(await report.getByRole('listitem').allTextContents(), rows);
    assert.deepEqual(await events(page), []);
    await page.locator('[data-new]').click();
    assert.equal(await report.isVisible(), false);
    assert.equal(await page.locator('[data-done]').innerText(), '0 / 12');
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
  } finally { await context.close(); }
}

async function finishAtTimeLimit(browser, viewport) {
  const { context, page, errors, unexpected } = await isolatedPage(browser, viewport);
  try {
    await assertPageTag(page, 'clerical-checking-practice');
    await startChecking(page);
    const next = page.locator('[data-next]');
    const match = page.locator('[data-answer="match"]');
    for (let n = 0; n < 12; n += 1) {
      await match.click();
      if (n < 11) await next.click();
    }
    await page.evaluate(() => Object.defineProperty(performance, 'now', { value: () => 1e9 }));
    await page.getByRole('button', { name: 'Time up', exact: true }).waitFor();
    assert.equal(await page.locator('[data-timeout]').isVisible(), false);
    await next.click();
    assert.match(await page.locator('[data-history]').innerText(), /^1 saved round.*12 comparisons/);
    await next.dispatchEvent('click');
    await checkEvent(page, ['skills_practice_start', ...Array(12).fill('skills_answer_checked'), 'skills_practice_complete'], 'clerical_checking', 'clerical-checking-practice');
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
  } finally { await context.close(); }
}

async function checkingQuality(browser, viewport) {
  const { context, page, errors, unexpected } = await isolatedPage(browser, viewport);
  try {
    await assertPageTag(page, 'clerical-checking-practice');
    const rounds = await page.evaluate(() => Array.from({ length: 40 }, () => {
      document.querySelector('[data-new]').click();
      return JSON.parse(localStorage.getItem('tdt-skills-checking-v1')).items;
    }));
    for (const round of rounds) {
      assert.equal(round.length, 12);
      assert.equal(new Set(round.map(q => q.left)).size, 12);
      const kinds = new Set();
      let exact = 0;
      for (const q of round) {
        const [leftName, leftCode] = q.left.split(' · ');
        const [rightName, rightCode] = q.right.split(' · ');
        const nameDiffers = leftName !== rightName, codeDiffers = leftCode !== rightCode;
        assert.equal(nameDiffers && codeDiffers, false);
        assert.equal(q.truth, nameDiffers || codeDiffers ? 'mismatch' : 'match');
        if (!nameDiffers && !codeDiffers) exact++;
        if (nameDiffers) kinds.add('name');
        if (codeDiffers) {
          const changes = [...leftCode].flatMap((c, i) => c !== rightCode[i] ? [i] : []);
          if (changes.length === 1) {
            assert.match(leftCode[changes[0]] + rightCode[changes[0]], /^\d\d$/);
            kinds.add('digit');
          } else {
            assert.equal(changes.length, 2);
            const [a, b] = changes;
            assert.equal(a + 1, b);
            assert.equal(leftCode[a] + leftCode[b], rightCode[b] + rightCode[a]);
            kinds.add('swap');
          }
        }
      }
      assert.ok(exact >= 5 && exact <= 7);
      assert.deepEqual([...kinds].sort(), ['digit', 'name', 'swap']);
    }
    const next = page.locator('[data-next]');
    const match = page.getByRole('button', { name: 'Match exactly' });
    const pause = page.locator('[data-pause]');
    await startChecking(page);
    await pause.click();
    assert.equal(await page.locator('#left').innerText(), 'Paused');
    assert.equal(await match.isDisabled(), true);
    assert.equal(await next.isDisabled(), true);
    await match.dispatchEvent('click');
    assert.deepEqual(await events(page), []);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    assert.equal(await match.isEnabled(), true);

    await page.getByRole('radio', { name: 'Untimed' }).check();
    const records = await page.evaluate(() => JSON.parse(localStorage.getItem('tdt-skills-checking-v1')).items);
    const [sourceCell, copyCell] = await page.locator('.compare-cell').all();
    const sourceBox = await sourceCell.boundingBox(), copyBox = await copyCell.boundingBox();
    if (viewport.width > 760) {
      assert.equal(sourceBox.y, copyBox.y);
      assert.ok(sourceBox.x + sourceBox.width < copyBox.x);
    } else {
      assert.equal(sourceBox.x, copyBox.x);
      assert.ok(sourceBox.y + sourceBox.height < copyBox.y);
    }
    let shownSwap = false;
    for (let i = 0; i < records.length; i++) {
      const { left, right, truth, why } = records[i];
      assert.equal(await page.locator('mark').count(), 0);
      await page.locator(`[data-answer="${truth}"]`).click();
      assert.equal(await page.locator('#left').innerText(), left);
      assert.equal(await page.locator('#right').innerText(), right);
      assert.equal(await page.locator('[data-feedback]').innerText(), `Correct decision. ${why}`);
      if (!shownSwap && why.includes('trade places')) {
        assert.deepEqual(await page.locator('mark').allTextContents(), await page.evaluate(() => {
          const a = document.querySelector('#left').textContent, b = document.querySelector('#right').textContent;
          const first = [...a].findIndex((c, j) => c !== b[j]);
          return [a.slice(first, first + 2), b.slice(first, first + 2)];
        }));
        await page.screenshot({ path: path.join(output, `clerical-near-match-${viewport.width}.png`), fullPage: true });
        shownSwap = true;
      }
      if (i < records.length - 1) await next.click();
    }
    assert.equal(shownSwap, true);
    await page.evaluate(() => { window.trackSkillComplete = undefined; });
    await next.click();
    await next.dispatchEvent('click');
    assert.equal(await next.innerText(), 'Round saved');
    assert.match(await page.locator('[data-history]').innerText(), /^1 saved round.*12 comparisons.*12 correct/);

    await page.evaluate(() => {
      localStorage.setItem('tdt-skills-checking-v1', JSON.stringify({ seed: 37, items: [
        { left: 'Avery Chen · KLM-552', right: 'Drew Carter · KLM-553', truth: 'mismatch', why: 'At least one visible character differs.' },
        { left: 'Morgan Ellis · AX-2049', right: 'Morgan Ellis · AX-2049', truth: 'match', why: 'All visible characters match.' },
      ], answers: [{ choice: 'mismatch', ok: true }], i: 0, roundActive: true, elapsed: 30, mode: 'untimed', startedTracked: true }));
    });
    await page.reload();
    assert.equal(await page.getByRole('radio', { name: 'Untimed' }).isChecked(), true);
    assert.equal(await page.locator('[data-done]').innerText(), '1 / 12');
    assert.match(await page.locator('[data-feedback]').innerText(), /Name: Avery Chen versus Drew Carter\. Record code: KLM-552 versus KLM-553/);
    assert.deepEqual(await events(page), []);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await next.click();
    assert.equal(await page.locator('#left').innerText(), 'Morgan Ellis · AX-2049');
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
  } finally { await context.close(); }
}

async function filingQuality(browser, viewport) {
  const { context, page, errors, unexpected } = await isolatedPage(browser, viewport);
  try {
    await assertPageTag(page, 'filing-practice');
    const rule = page.getByRole('combobox', { name: 'Rule' });
    const next = page.getByRole('button', { name: 'New question' });
    const results = page.getByRole('list', { name: 'Full filing order' });
    const current = () => page.evaluate(() => JSON.parse(localStorage.getItem('tdt-skills-filing-v2')).current);
    await rule.selectOption('date');
    const date = await current();
    await page.reload();
    assert.equal(await rule.inputValue(), 'date');
    assert.equal(await page.getByRole('heading', { name: 'Date', exact: true }).isVisible(), true);
    assert.equal(await page.getByRole('heading', { name: 'Name', exact: true }).isVisible(), false);
    assert.deepEqual(await current(), date);
    assert.equal(await results.isVisible(), false);
    await next.click();
    assert.equal((await current()).rule, 'date');
    assert.deepEqual(await events(page), []);

    await rule.selectOption('alpha');
    const samples = new Map();
    for (let i = 0; i < 4; i++) {
      const q = await current();
      const codes = q.rows.map(row => row.code);
      const kind = codes.some(code => /-0\d$/.test(code)) ? 'zeros' : codes.some(code => /\dB$/.test(code)) ? 'prefix' : new Set(codes).size < 4 ? 'ID' : 'number';
      samples.set(kind, q);
      if (i < 3) await next.click();
    }
    assert.deepEqual([...samples.keys()].sort(), ['ID', 'number', 'prefix', 'zeros']);
    assert.deepEqual(await events(page), []);
    for (let i = 0; i < 3 && !(await current()).rows.some(row => /-0\d$/.test(row.code)); i++) await next.click();
    const { rows } = await current();
    const loser = rows.findIndex(row => /-0\d$/.test(row.code));
    assert.notEqual(loser, -1);
    const winner = rows.findIndex(row => row.code === rows[loser].code.replace('-0', '-'));
    assert.notEqual(winner, -1);
    assert.equal(await results.isVisible(), false);
    await page.getByRole('button', { name: `File ${String.fromCharCode(65 + loser)} first`, exact: true }).click();
    await checkEvent(page, ['skills_practice_start', 'skills_answer_checked', 'skills_practice_complete'], 'filing_order', 'filing-practice');
    assert.match(await page.locator('[data-feedback]').innerText(), /^Not quite\..*same value.*fewer leading zeros/);
    const ordered = await results.getByRole('listitem').allTextContents();
    assert.equal(ordered.length, 4);
    assert.equal(ordered[0], `${String.fromCharCode(65 + winner)}: ${rows[winner].code} · ${rows[winner].id}`);
    assert.equal(ordered[1], `${String.fromCharCode(65 + loser)}: ${rows[loser].code} · ${rows[loser].id}`);
    await page.reload();
    assert.equal(await rule.inputValue(), 'alpha');
    assert.equal(await page.getByRole('heading', { name: 'Alphanumeric', exact: true }).isVisible(), true);
    assert.deepEqual(await results.getByRole('listitem').allTextContents(), ordered);
    assert.equal(await page.locator('[data-recent]').innerText(), '0 / 1');
    assert.deepEqual(await events(page), []);
    await page.screenshot({ path: path.join(output, `filing-tie-break-${viewport.width}.png`), fullPage: true });
    await next.click();
    assert.equal(await results.isVisible(), false);
    assert.equal((await current()).rule, 'alpha');
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
  } finally { await context.close(); }
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
  let passed = 0;
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await hub(browser, viewport); passed++;
      await practice(browser, viewport, 'clerical-checking-practice', 'clerical_checking', '[data-answer]'); passed++;
      await practice(browser, viewport, 'filing-practice', 'filing_order', '[data-choice]'); passed++;
      await expired(browser, viewport); passed++;
      await timedReview(browser, viewport); passed++;
      await finishAtTimeLimit(browser, viewport); passed++;
      await checkingQuality(browser, viewport); passed++;
      await filingQuality(browser, viewport); passed++;
    }
    console.log(JSON.stringify({ status: 'passed', scenarios: passed, externalAnalyticsRequestsSent: 0, screenshots: output }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
