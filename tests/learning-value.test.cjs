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
        const sourceUrl = pathToFileURL(path.resolve(file)).href;
        await page.goto(sourceUrl);
        const choices = page.getByRole('region', { name: 'Compare signs that look alike' });
        for (const [label, concept] of [
          ['Stop vs. Yield', 'stop-yield'],
          ['Do Not Enter vs. Wrong Way', 'do-not-enter-wrong-way'],
          ['Merge vs. Lane Ends', 'merge-lane-ends'],
        ]) {
          const link = choices.getByRole('link', { name: label, exact: true });
          const url = new URL(await link.getAttribute('href'), sourceUrl);
          assert.ok(url.pathname.endsWith('/road-sign-learning-loop.html'));
          assert.equal(url.searchParams.get('concept'), concept);
          assert.equal(url.searchParams.get('return'), file);
        }
        for (const [label, destination, fragment] of [
          ['Compare posted and advisory speeds with pictures', 'road-sign-learning-loop.html', 'speed-sign-comparison'],
          ['Compare intersection warnings', 'road-sign-shapes-and-colors-finder.html', 'intersection-warning-check'],
          ['Compare school crossing plaques with pictures', 'road-sign-shapes-and-colors-finder.html', 'school-crossing-location'],
        ]) {
          await choices.getByRole('link', { name: label, exact: true }).click();
          await page.waitForURL(url => url.pathname.endsWith(`/${destination}`) && url.hash === `#${fragment}`);
          assert.ok(await page.locator(`#${fragment}`).isVisible());
          await page.goto(sourceUrl);
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
        await choices.getByRole('link', { name: 'Do Not Enter vs. Wrong Way', exact: true }).click();
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
for (const width of [320, 1280]) {
  test(`New York headlight cases work without JavaScript at ${width}px`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: false });
    try {
      await context.route(/^https?:/, route => route.abort());
      const page = await context.newPage();
      const url = pathToFileURL(path.resolve('new-york-dmv-permit-practice-test.html'));
      await page.goto(url.href);
      await page.getByRole('link', { name: 'When to use headlights', exact: true }).press('Enter');
      await page.waitForURL('**/new-york-dmv-permit-practice-test.html#ny-headlight-cases');
      const lesson = page.locator('#ny-headlight-cases');
      const rain = lesson.getByRole('article').filter({ hasText: 'Bright afternoon' });
      const night = lesson.getByRole('article').filter({ hasText: 'Two cars, two distances' });
      assert.equal(await lesson.getByRole('article').count(), 2);
      for (const example of [rain, night]) {
        assert.equal(await example.locator('details[open]').count(), 0);
        await example.getByText('Show reasoning', { exact: true }).press('Enter');
        await example.getByText('Check', { exact: true }).press('Enter');
        assert.equal(await example.locator('details[open]').count(), 2);
      }
      assert.match(await rain.innerText(), /wipers because of weather.*headlight requirement/);
      assert.match(await rain.innerText(), /1,000 feet ahead independently requires headlights.*low beam/);
      assert.match(await night.innerText(), /500 feet of an oncoming vehicle/);
      assert.match(await night.innerText(), /within 200 feet, even if the vehicle ahead is in another lane/);
      assert.match(await rain.locator('a').getAttribute('href'), /^https:\/\/dmv\.ny\.gov\//);
      assert.equal(await night.locator('a').getAttribute('href'), 'https://www.nysenate.gov/legislation/laws/VAT/375');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      if (process.env.VERIFY_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
        await lesson.evaluate(section => section.scrollIntoView());
        await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `ny-headlight-cases-${width}.png`) });
      }
    } finally {
      await context.close();
    }
  });
}

test('New York mock explains the dimming distances after the answer without changing the score', async () => {
  const context = await browser.newContext();
  try {
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    const url = pathToFileURL(path.resolve('new-york-dmv-permit-practice-test.html'));
    url.searchParams.set('mode', 'mock');
    url.hash = 'practice';
    await page.goto(url.href);
    const quiz = page.locator('[data-mode-panel="mock"].is-active [data-quiz]');
    assert.equal(await quiz.locator('.question').count(), 40);
    assert.equal(await quiz.getAttribute('data-pass-score'), '32');
    const item = quiz.locator('.question[data-prompt="At night, high beams should be dimmed when:"]');
    const index = Number(await item.getAttribute('data-question-index')) + 1;
    await quiz.getByRole('button', { name: `Go to question ${index}`, exact: true }).press('Enter');
    assert.equal(await item.getAttribute('data-answer'), '0');
    assert.equal(await item.locator('[data-quiz-source]').isVisible(), false);
    await item.getByRole('button', { name: 'Approaching or following other vehicles closely', exact: true }).press('Enter');
    assert.match(await item.locator('.feedback').innerText(), /500 feet of an oncoming vehicle or within 200 feet of a vehicle ahead/);
    assert.equal(await item.getByRole('link', { name: 'NY DMV Driver Manual: Night Driving' }).isVisible(), true);
    assert.match(await quiz.locator('[data-quiz-result]').innerText(), /^Score: 1 of 1 answered/);
  } finally {
    await context.close();
  }
});

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
test('examples retain distinct worked and transfer problems on their published pages', async () => {
  const data = JSON.parse(fs.readFileSync('content/study_examples.json', 'utf8'));
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    for (const [slug, { examples }] of Object.entries(data)) {
      assert.ok(examples.length >= 2, slug);
      assert.equal(new Set(examples.map(example => example.title)).size, examples.length, slug);
      await page.goto(pathToFileURL(path.resolve(`${slug}.html`)).href);
      for (const example of examples) {
        for (const key of ['title', 'question', 'mistake', 'check', 'answer']) assert.ok(example[key].trim(), slug);
        assert.ok(example.steps.length >= 2 && example.steps.every(step => step.trim()), slug);
        assert.notEqual(example.check, example.question, slug);
        assert.ok(await page.getByRole('heading', { name: example.title, exact: true }).isVisible(), `${slug}: ${example.title}`);
      }
    }
  } finally {
    await context.close();
  }
  assert.equal(4 * (2 * 4 - 3), 20);
  assert.equal(3 * (2 * 6 - 5), 21);
  assert.equal(3 * 2 + 8, 14);
  assert.equal(5 * 3 + 12, 27);
  assert.equal((50 + 72) / 2, 61);
  assert.equal((48 + 82) / 2, 65);
});
