const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const base = 'https://testdaytools.com';
const output = process.env.SKILLS_QA_DIR || '/private/tmp/testdaytools-skills-home-entry';

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      const errors = [];
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== base) return route.fulfill({ contentType: 'text/javascript', body: '' });
        const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
        const contentType = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
        return route.fulfill({ path: file, contentType });
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      const failed = [];
      page.on('requestfailed', request => failed.push(new URL(request.url()).pathname));
      try {
        await page.goto(base + '/');
        const entry = page.locator('.home-quick-links a[href="skills-practice.html"]');
        assert.equal(await entry.isVisible(), true, 'Existing skills entry must be reachable on mobile and desktop');
        const other = page.locator('.home-quick-links a:not([href="skills-practice.html"])');
        for (const link of await other.all()) assert.equal(await link.isVisible(), viewport.width > 760, 'Preserve existing DMV shortcut visibility');
        const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
        assert.ok(size.scroll <= size.width + 1, 'Homepage must not overflow horizontally');
        await page.screenshot({ path: path.join(output, `home-entry-${viewport.width}.png`) });
        await entry.click();
        assert.equal(page.url(), base + '/skills-practice.html');
        for (const slug of ['clerical-checking-practice', 'filing-practice']) {
          await page.goto(base + '/skills-practice.html');
          await page.locator(`a[href="${slug}.html"]`).first().click();
          assert.equal(page.url(), `${base}/${slug}.html`);
        }
        assert.deepEqual(errors, []);
        assert.deepEqual(failed, []);
        console.log(JSON.stringify({ viewport: viewport.width, homeAndBothToolEntries: 'passed', runtimeErrors: 0, failedResources: 0, liveAnalyticsRequestsSent: 0 }));
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
