const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
let browser;
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
after(async () => { await browser.close(); });
async function open(width, concept = '', seed) {
  const context = await browser.newContext({ viewport: { width, height: 850 } });
  await context.route(/^https?:/, route => route.abort());
  if (seed) await context.addInitScript(seed);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const url = pathToFileURL(path.resolve('road-sign-learning-loop.html'));
  if (concept) url.searchParams.set('concept', concept);
  await page.goto(url.href);
  return { context, page, errors };
}
test('targeted session contains only its three questions', async () => {
  const { page, context } = await open(1280, 'merge-lane-ends');
  for (let i = 0; i < 3; i++) { await answer(page); await page.locator('[data-loop-next]').click(); }
  assert.equal(Object.keys((await state(page, 'merge-lane-ends')).answers).length, 3);
  await context.close();
});
test('keyboard works', async () => {
  const { page, context } = await open(1280);
  await page.locator('[data-loop-option="0"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-loop-next]').focus();
  await page.keyboard.press('Enter');
  assert.match(await page.locator('[data-loop-feedback]').textContent(), /Correct/);
  await context.close();
});
test('blocked storage does not break practice', async () => {
  const { page, context, errors } = await open(1280, '', () => Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }));
  await answer(page);
  assert.deepEqual(errors, []);
  await context.close();
});
test('corrupt saved state is ignored', async () => {
  const { page, context } = await open(1280, '', () => localStorage.setItem('tdt-learning-loop:v2:all', '{'));
  await answer(page);
  await context.close();
});
test('print is stubbed', async () => {
  const { page, context } = await open(1280);
  await answer(page);
  await page.evaluate(() => { window.print = () => { window.called = true; }; });
  await page.locator('[data-loop-print]').click();
  assert.equal(await page.evaluate(() => window.called), true);
  await context.close();
});
test('copy fallback works', async () => {
  const { page, context } = await open(1280);
  await answer(page);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('blocked'); } } }));
  await page.locator('[data-loop-copy-record]').click();
  assert.equal(await page.locator('[data-loop-report-text]').isVisible(), true);
  assert.match(await page.locator('[data-loop-copy-status]').textContent(), /selected/);
  await context.close();
});
test('clipboard copy contains the submitted choice and its reason', async () => {
  const { page, context } = await open(1280);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedText = text; } } }));
  await answer(page, 1);
  await page.locator('[data-loop-copy-record]').click();
  assert.match(await page.evaluate(() => window.copiedText), /Review needed/);
  assert.match(await page.evaluate(() => window.copiedText), /This treats STOP as conditional/);
  await context.close();
});
test('edited saved index cannot bypass unanswered questions', async () => {
  const { page, context } = await open(1280, '', () => localStorage.setItem('tdt-learning-loop:v2:all', JSON.stringify({ version: '2026-11-20', index: 12, answers: {} })));
  assert.equal(await page.locator('[data-loop-question]').getAttribute('data-loop-question'), 'stop-yield-distinction');
  assert.equal(await page.locator('.learning-complete').count(), 0);
  await context.close();
});
test('static explanations and sources work without JavaScript', async () => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.route(/^https?:/, route => route.abort());
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.resolve('road-sign-learning-loop.html')).href);
  assert.equal(await page.locator('.contrast-lesson').count(), 3);
  assert.equal(await page.locator('.contrast-lesson .contrast-source a').count(), 3);
  await context.close();
});
async function answer(page, n = 0) {
  await page.locator(`[data-loop-option="${n}"]`).click();
  await page.locator('[data-loop-next]').click();
}
async function state(page, concept = '') { return page.evaluate(c => JSON.parse(localStorage.getItem(`tdt-learning-loop:v2:${c || 'all'}`)), concept); }
for (const width of [390, 1280]) {
  test(`${width}: mixed outcomes cover every situation and preserve review after reload`, async () => {
    const { page, context } = await open(width);
    for (let index = 0; index < 9; index++) {
      await answer(page, index % 2 ? 0 : 1);
      await page.locator('[data-loop-next]').click();
      if (await page.locator('[data-loop-phase-label]').textContent().then(text => /Phase 2/.test(text))) {
        await page.locator('[data-loop-next]').click();
      }
    }
    assert.match(await page.locator('.learning-complete').textContent(), /all 6/);
    assert.equal(await page.locator('.learning-record-answer').count(), 9);
    assert.equal(await page.locator('.learning-record-answer strong').filter({ hasText: 'Review needed' }).count(), 5);
    await page.reload();
    assert.match(await page.locator('.learning-complete').textContent(), /all 6/);
    assert.equal(await page.locator('.learning-record-answer').count(), 9);
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('[data-learning-loop]').isVisible(), false);
    assert.equal(await page.locator('[data-loop-report]').isVisible(), true);
    if (process.env.VERIFY_SCREENSHOTS_DIR) {
      fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `record-print-${width}.png`), fullPage: true });
    }
    await page.emulateMedia({ media: 'screen' });
    await page.locator('[data-loop-reset]').click();
    assert.equal(Object.keys((await state(page)).answers).length, 0);
    assert.equal(await page.locator('[data-loop-report]').isVisible(), false);
    await context.close();
  });
  test(`${width}: feedback remains until Continue`, async () => {
    const { page, context, errors } = await open(width);
    await answer(page, 1);
    assert.match(await page.locator('[data-loop-feedback]').textContent(), /Not quite/);
    assert.equal(await page.locator('[data-loop-option]:disabled').count(), 3);
    await page.locator('[data-loop-next]').click();
    assert.match(await page.locator('[data-loop-phase-label]').textContent(), /Phase 2/);
    assert.deepEqual(errors, []);
    await context.close();
  });
  test(`${width}: every sign is covered`, async () => {
    const { page, context } = await open(width);
    const ids = [];
    for (let i = 0; i < 9; i++) { ids.push(await page.locator('[data-loop-question]').getAttribute('data-loop-question')); await answer(page); await page.locator('[data-loop-next]').click(); }
    assert.equal(new Set(ids).size, 9);
    assert.match(await page.locator('.learning-complete').textContent(), /all 6/);
    await context.close();
  });
  test(`${width}: reload restores answer`, async () => {
    const { page, context } = await open(width);
    await answer(page);
    await page.reload();
    assert.match(await page.locator('[data-loop-feedback]').textContent(), /Correct/);
    assert.equal((await state(page)).exposures['stop-yield-distinction'], 1);
    await context.close();
  });
  test(`${width}: double click deduplicates`, async () => {
    const { page, context } = await open(width);
    await page.locator('[data-loop-option="0"]').click();
    await page.locator('[data-loop-next]').dblclick();
    assert.equal((await state(page)).exposures['stop-yield-distinction'], 1);
    await context.close();
  });
  test(`${width}: unsubmitted selection is not saved`, async () => {
    const { page, context } = await open(width);
    await page.locator('[data-loop-option="0"]').click();
    await page.reload();
    assert.equal(Object.keys((await state(page)).answers).length, 0);
    await context.close();
  });
  test(`${width}: legacy data is untouched`, async () => {
    const { page, context } = await open(width, '', () => localStorage.setItem('tdt-learning-loop:v1:all', 'old'));
    assert.equal(await page.evaluate(() => localStorage.getItem('tdt-learning-loop:v1:all')), 'old');
    assert.equal(Object.keys((await state(page)).answers).length, 0);
    await context.close();
  });
  test(`${width}: report contains reasons`, async () => {
    const { page, context } = await open(width);
    await answer(page, 1);
    assert.match(await page.locator('[data-loop-report]').textContent(), /Your answer/);
    await context.close();
  });
  test(`${width}: layout does not overflow`, async () => {
    const { page, context } = await open(width);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.VERIFY_SCREENSHOTS_DIR) { fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `after-${width}.png`) }); }
    await context.close();
  });
}
