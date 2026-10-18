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

async function checkEvent(page, count, tool, slug) {
  const tracked = await events(page);
  assert.equal(tracked.length, count);
  for (const event of tracked) {
    assert.deepEqual(event, { name: 'skills_answer_checked', params: { tool, page_path: `/${slug}.html` } });
  }
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
    assert.deepEqual(await events(page), [], 'Generating a question or round is not an answer');
    await page.locator(selector).first().click();
    await checkEvent(page, 1, tool, slug);
    await page.locator(selector).first().dispatchEvent('click');
    await checkEvent(page, 1, tool, slug);
    await page.screenshot({ path: path.join(output, `${tool}-${viewport.width}.png`), fullPage: true });
    await page.reload();
    assert.deepEqual(await events(page), [], 'Restoring saved feedback must not replay an answer');
    await page.locator('[data-new]').click();
    if (tool === 'filing_order') await page.locator('[data-rule]').selectOption('date');
    else await page.locator('input[value="untimed"]').check();
    assert.deepEqual(await events(page), [], 'Changing a mode or rule is not an answer');
    await page.locator(selector).first().click();
    await checkEvent(page, 1, tool, slug);
    await page.locator('[data-new]').click();
    await page.evaluate(() => { window.gtag = undefined; });
    await page.locator(selector).first().click();
    assert.equal(await page.locator('[data-feedback]').isVisible(), true);
    await checkEvent(page, 1, tool, slug);
    await page.locator('[data-new]').click();
    await page.evaluate(() => { window.gtag = () => { throw new Error('Analytics blocked'); }; });
    await page.locator(selector).first().click();
    assert.equal(await page.locator('[data-feedback]').isVisible(), true);
    await checkEvent(page, 1, tool, slug);
    await page.locator('[data-new]').click();
    await page.evaluate(() => { delete window.trackSkillAnswer; });
    await page.locator(selector).first().click();
    assert.equal(await page.locator('[data-feedback]').isVisible(), true);
    await checkEvent(page, 1, tool, slug);
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
  } finally { await context.close(); }
}

async function expired(browser, viewport) {
  const { context, page, errors } = await isolatedPage(browser, viewport);
  try {
    await assertPageTag(page, 'clerical-checking-practice');
    await page.evaluate(() => {
      Object.defineProperty(performance, 'now', { value: () => 1e9 });
      document.querySelector('[data-answer]').click();
    });
    assert.deepEqual(await events(page), [], 'An expired round must not record an answer');
    assert.equal(await page.locator('[data-feedback]').isVisible(), false);
    assert.deepEqual(errors, []);
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
    }
    console.log(JSON.stringify({ status: 'passed', scenarios: passed, externalAnalyticsRequestsSent: 0, screenshots: output }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
