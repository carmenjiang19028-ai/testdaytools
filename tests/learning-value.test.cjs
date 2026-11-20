const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
let browser;
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
after(async () => { await browser.close(); });
for (const [file, nextAnchor] of [['road-signs-practice-test.html', '#practice'], ['dmv-road-signs-cheat-sheet.html', '']]) {
  for (const width of [390, 1280]) {
    test(`${file} at ${width}px: choose a pair, practice it, then return`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.route(/^https?:/, route => route.abort());
      try {
        const page = await context.newPage();
        await page.goto(pathToFileURL(path.resolve(file)).href);
        const choices = page.getByRole('region', { name: 'Practice a confusing sign pair' });
        const links = choices.getByRole('link');
        assert.deepEqual(await links.allTextContents(), ['Stop vs. Yield', 'Do Not Enter vs. Wrong Way', 'Merge vs. Lane Ends']);
        for (const [i, concept] of ['stop-yield', 'do-not-enter-wrong-way', 'merge-lane-ends'].entries()) {
          const url = new URL(await links.nth(i).getAttribute('href'), page.url());
          assert.equal(url.searchParams.get('concept'), concept);
          assert.equal(url.searchParams.get('return'), file);
        }
        if (!nextAnchor) {
          assert.equal(await choices.evaluate(el => !!(el.compareDocumentPosition(document.querySelector('#printable-sheet')) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
          assert.equal(await page.getByRole('link', { name: 'Download PDF', exact: true }).count(), 1);
          await page.emulateMedia({ media: 'print' });
          assert.equal(await choices.isVisible(), false);
          assert.equal(await page.locator('#printable-sheet').isVisible(), true);
          await page.emulateMedia({ media: 'screen' });
        }
        if (process.env.VERIFY_SCREENSHOTS_DIR) {
          fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
          await choices.evaluate(section => {
            const header = document.querySelector('.site-header').getBoundingClientRect().height;
            window.scrollTo(0, section.getBoundingClientRect().top + scrollY - header - 12);
          });
          await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `${file}-${width}-contrast-entry.png`) });
        }
        await links.nth(1).click();
        await page.waitForURL(/road-sign-learning-loop\.html\?/);
        assert.equal(await page.locator('[data-loop-question]').getAttribute('data-loop-question'), 'entry-direction-distinction');
        assert.match(await page.locator('[data-loop-progress]').textContent(), /0 of 3 questions/);
        for (let i = 0; i < 3; i++) {
          await page.locator('[data-loop-option="0"]').click();
          await page.locator('[data-loop-next]').click();
          await page.locator('[data-loop-next]').click();
        }
        const returnLink = page.getByRole('link', { name: nextAnchor ? 'Return to picture practice' : 'Return to the study sheet', exact: true });
        assert.equal(await returnLink.getAttribute('href'), `${file}${nextAnchor}`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await returnLink.click();
        await page.waitForURL(url => url.pathname.endsWith(`/${file}`) && url.hash === nextAnchor);
        assert.equal(await page.locator(nextAnchor || '#printable-sheet').count(), 1);
      } finally { await context.close(); }
    });
  }
}
for (const width of [390, 1280]) {
  test(`${width}: all six situations with external requests blocked`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve('road-sign-learning-loop.html')).href);
    assert.deepEqual(errors, []);
    for (let i = 0; i < 9; i++) {
      await page.locator('[data-loop-option="0"]').click();
      await page.locator('[data-loop-next]').click();
      await page.locator('[data-loop-next]').click();
    }
    assert.match(await page.locator('.learning-complete').textContent(), /all 6/);
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('tdt-learning-loop:v2:all')));
    assert.equal(Object.keys(state.answers).length, 9);
    assert.equal(Object.values(state.exposures).every(n => n === 1), true);
    assert.deepEqual(errors, []);
    await context.close();
  });
}
for (const pageName of ['sat-math-score-guide', 'sat-reading-writing-score-guide']) {
  for (const width of [390, 1280]) {
    test(`${pageName}: examples are usable`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.route(/^https?:/, route => route.abort());
      const page = await context.newPage();
      await page.goto(pathToFileURL(path.resolve(`${pageName}.html`)).href);
      assert.equal(await page.locator('.worked-examples article').count(), 2);
      for (const detail of await page.locator('.worked-examples details').all()) {
        await detail.locator('summary').click();
        assert.equal(await detail.getAttribute('open'), '');
      }
      assert.equal(await page.locator('.worked-examples details').count(), 4);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (process.env.VERIFY_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
        await page.locator('.worked-examples').evaluate(section => {
          const header = document.querySelector('.site-header').getBoundingClientRect().height;
          window.scrollTo(0, section.getBoundingClientRect().top + scrollY - header - 12);
        });
        await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `${pageName}-${width}.png`) });
      }
      await context.close();
    });
  }
}
test('curriculum covers each sign with a separate application and reason for each choice', () => {
  const data = JSON.parse(fs.readFileSync('content/road_sign_cases.json', 'utf8'));
  const applications = data.lessons.flatMap(lesson => lesson.applications);
  assert.equal(data.lessons.length, 3);
  assert.equal(applications.length, 6);
  assert.deepEqual(new Set(applications.flatMap(q => q.images)), new Set(['stop', 'yield', 'do-not-enter', 'wrong-way', 'merge', 'lane-ends']));
  const questions = data.lessons.flatMap(lesson => [lesson.diagnosis, ...lesson.applications]);
  assert.equal(new Set(questions.map(q => q.id)).size, 9);
  for (const q of questions) {
    assert.equal(q.options.length, 3);
    assert.equal(new Set(q.options.map(choice => choice.why)).size, 3);
    assert.ok(q.options.every(choice => choice.text.trim() && choice.why.trim()));
  }
});
test('examples retain solvable changed problems and explicit reasoning', () => {
  const data = JSON.parse(fs.readFileSync('content/study_examples.json', 'utf8'));
  for (const page of Object.values(data)) {
    assert.equal(page.examples.length, 2);
    for (const example of page.examples) {
      for (const key of ['title', 'question', 'mistake', 'check', 'answer']) assert.ok(example[key].trim());
      assert.ok(example.steps.length >= 3);
    }
  }
  assert.equal(4 * (2 * 4 - 3), 20);
  assert.equal(3 * (2 * 6 - 5), 21);
  assert.equal(3 * 2 + 8, 14);
  assert.equal(5 * 3 + 12, 27);
  assert.equal((50 + 72) / 2, 61);
  assert.equal((48 + 82) / 2, 65);
});
