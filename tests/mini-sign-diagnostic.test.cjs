const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

let browser;
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
after(async () => { await browser?.close(); });

for (const file of ['index.html', 'dmv-practice.html']) {
  for (const width of [390, 1280]) {
    test(`${file} at ${width}px: diagnose four signs without skipping or carrying feedback forward`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.route(/^https?:/, route => route.abort());
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(pathToFileURL(path.resolve(file)).href);
        const drill = page.locator('[data-mini-sign-drill]');
        const active = drill.locator('.mini-question.is-active');
        const next = drill.locator('[data-mini-drill-next]');
        const feedback = drill.getByRole('status');
        const route = drill.locator('[data-mini-drill-focus-link]');
        const recorded = () => page.evaluate(() => (window.dataLayer || []).filter(row => row[0] === 'event' && row[1] === 'mini_diagnostic_answer').map(row => row[2]));
        assert.equal(await route.isVisible(), true);
        for (const [index, choice] of [0, 0, 1, 1].entries()) {
          assert.equal(await next.isDisabled(), true);
          await next.dispatchEvent('click');
          assert.match(await active.textContent(), new RegExp(`Question ${index + 1} of 4`));
          assert.equal(await feedback.textContent(), "Choose the driver's action.");
          if (index === 0) {
            await active.locator(`[data-mini-choice="${choice}"]`).press('Enter');
          } else {
            await active.locator(`[data-mini-choice="${choice}"]`).click();
          }
          assert.equal(await next.isEnabled(), true);
          assert.match(await feedback.textContent(), index ? /^Correct\./ : /^Not quite\./);
          const backgrounds = await active.locator('[data-mini-choice]').evaluateAll(buttons => buttons.map(button => getComputedStyle(button).backgroundColor));
          const correctIndex = Number(await active.getAttribute('data-mini-answer'));
          assert.notEqual(backgrounds[correctIndex], backgrounds[2]);
          if (choice !== correctIndex) assert.notEqual(backgrounds[choice], backgrounds[2]);
          assert.equal((await recorded()).length, index + 1);
          if (index < 3) {
            assert.doesNotMatch(await feedback.textContent(), /Round complete/);
            await next.press('Enter');
            assert.equal(await active.locator('[data-mini-prompt]').evaluate(el => el === document.activeElement), true);
          }
        }
        assert.match(await feedback.textContent(), /A speed limit sign.*Round complete: 3 correct out of 4\./);
        const events = await recorded();
        assert.deepEqual(events.map(event => [event.question_index, event.answered, event.correct]), [[1, 1, false], [2, 2, true], [3, 3, true], [4, 4, true]]);
        assert.equal(new URL(await route.getAttribute('href'), page.url()).searchParams.get('focus'), 'Regulatory signs');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (process.env.VERIFY_SCREENSHOTS_DIR) {
          fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
          await drill.evaluate(el => {
            const header = document.querySelector('.site-header').getBoundingClientRect().height;
            window.scrollTo(0, el.getBoundingClientRect().top + scrollY - header - 10);
          });
          await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `${file}-${width}-complete.png`) });
        }
        assert.equal(await next.textContent(), 'Restart drill');
        await next.click();
        assert.equal(await next.isDisabled(), true);
        assert.equal(await drill.locator('[data-mini-drill-score]').textContent(), '0/4');
        assert.equal(await drill.locator('[data-mini-choice]:disabled').count(), 0);
        assert.equal(await drill.locator('.mini-question [data-mini-choice].is-wrong').count(), 0);
        assert.equal(await route.textContent(), 'Full road signs test');
        assert.equal((await recorded()).length, 4);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  }
}

for (const [file, width] of [['index.html', 390], ['dmv-practice.html', 1280]]) {
  test(`${file} at ${width}px: every missed topic keeps its own useful follow-up`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route(/^https?:/, route => route.abort());
    try {
      const page = await context.newPage();
      await page.goto(pathToFileURL(path.resolve(file)).href);
      const drill = page.locator('[data-mini-sign-drill]');
      const next = drill.locator('[data-mini-drill-next]');
      const active = drill.locator('.mini-question.is-active');
      const practice = drill.locator('[data-mini-drill-focus-link]');
      const speed = drill.getByRole('link', { name: 'Compare posted and advisory speeds', exact: true });
      const answerRound = async choices => {
        for (const [index, choice] of choices.entries()) {
          await active.locator(`[data-mini-choice="${choice}"]`).press('Enter');
          if (index < choices.length - 1) await next.press('Enter');
        }
      };
      assert.equal(await speed.count(), 0, 'no missed-speed link before answering');
      await answerRound([0, 0, 1, 0]);
      assert.equal(await drill.locator('[data-mini-drill-score]').textContent(), '2/4');
      assert.equal(await speed.count(), 1, 'keep speed review even when another area was also missed');
      const regulation = new URL(await practice.getAttribute('href'), page.url());
      assert.equal(regulation.searchParams.get('mode'), 'road-signs-core');
      assert.equal(regulation.searchParams.get('focus'), 'Regulatory signs');
      await next.press('Enter');
      assert.equal(await speed.count(), 0, 'restart clears the prior recommendations');
      assert.equal(await practice.textContent(), 'Full road signs test');

      await answerRound([1, 0, 1, 0]);
      assert.equal(await drill.locator('[data-mini-drill-score]').textContent(), '3/4');
      assert.equal(await practice.isVisible(), false, 'only the missed area is suggested');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await speed.press('Enter');
      await page.waitForURL('**/road-sign-learning-loop.html#speed-sign-comparison');
      const section = page.locator('#speed-sign-comparison');
      assert.equal(await section.getByRole('img').count(), 2);
      await section.getByText('Check which sign sets the limit', { exact: true }).press('Enter');
      assert.match(await section.innerText(), /the yellow plaque advises a speed/i);
    } finally { await context.close(); }
  });
}
