const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const cases = {
  "florida-dmv": [
    [11, /paved center turn lane/, /full stop/, /at least 5 feet of unpaved/, "flsenate.gov"],
    [16, /cross traffic still work/, /stop at the stop line/i, /only your signal is out/, "www.flsenate.gov"],
    [34, /two feet of clearance/, /at least three feet/, /stay behind/, "www.flsenate.gov"],
  ],
  "pennsylvania-dmv": [
    [22, /stopped at a red light/, /stopping where you can safely remain/, /still counts as driving/, "www.pa.gov"],
    [24, /double yellow line/, /at least four feet/, /permits crossing/, "www.pa.gov"],
    [38, /November 2026/, /^10 feet$/, /15 feet on October 22, 2027/, "www.pa.gov"],
  ],
  "new-jersey-mvc": [
    [19, /posted at 20 mph/, /no more than 20 mph/, /25 mph or the lower posted limit/, "pub.njleg.state.nj.us"],
    [33, /raised median/, /10 mph until completely past/, /at least 25 feet away/, "www.nj.gov"],
    [36, /disabled car on the shoulder/, /below the posted limit/, /with hazard lights is covered/, "pub.njleg.state.nj.us"],
  ],
};
const brakingCases = [
  ["florida-dmv", "mock", 21, "www.flhsmv.gov"],
  ["pennsylvania-dmv", "quick", 12, "www.pa.gov"],
  ["pennsylvania-dmv", "mock", 11, "www.pa.gov"],
  ["new-jersey-mvc", "quick", 9, "www.nj.gov"],
];
const sameDirectionCA = {
  condition: /following the stopped bus.*another lane going your way/is,
  reason: /full stop.*red lights stop flashing.*opposite side of a divided or qualifying multilane highway does not apply/is,
  previous: "Flashing red school bus lights mean children may be entering or leaving the roadway.",
  source: "https://www.dmv.ca.gov/portal/handbook/california-driver-handbook/laws-and-rules-of-the-road-cont1/",
};
const schoolBusCases = [
  ["california-dmv", "quick", 11, 15, sameDirectionCA],
  ["california-dmv", "mock", 11, 40, sameDirectionCA],
  ["new-york-dmv", "mock", 27, 40, {
    condition: /opposite side of a divided highway.*concrete median/is,
    reason: /stop before reaching the bus.*recommends leaving at least 20 feet.*bus moves or the bus driver or a police officer/is,
    previous: "Flashing red school bus lights warn that children may be entering or leaving the road.",
    source: "https://dmv.ny.gov/new-york-state-drivers-manual-and-practice-tests/chapter-6-passing",
  }],
  ["florida-dmv", "quick", 8, 15, {
    condition: /behind the stopped bus.*raised median/is,
    reason: /full stop.*withdraws its stop signal.*opposite direction.*does not excuse a driver behind the bus/is,
    previous: "Flashing red school-bus lights mean children may be entering or leaving the bus. Stop when required by law. Confirm exact wording in the Official Florida Driver License Handbook.",
    source: "https://www.flsenate.gov/Laws/Statutes/2026/316.172",
  }],
];
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

for (const width of [320, 1280]) {
  for (const [state, mode, index, total, lesson] of schoolBusCases) {
    test(`${state} ${mode} ${width}px uses the local school-bus rule before and after a saved answer`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 850 } });
      try {
        await context.route(/^https?:/, route => route.abort());
        const page = await context.newPage();
        const url = pathToFileURL(path.join(__dirname, "..", `${state}-permit-practice-test.html`));
        url.searchParams.set("mode", mode);
        url.hash = "practice";
        await page.goto(url.href);
        const quiz = page.locator(`[data-mode-panel=${mode}].is-active [data-quiz]`);
        await quiz.getByRole("button", { name: `Go to question ${index}`, exact: true }).press("Enter");
        const question = quiz.locator(".question.is-active");
        const condition = question.locator("[data-quiz-condition]");
        const source = question.locator("[data-quiz-source] a");
        const feedback = question.locator(".feedback");
        assert.ok(await condition.isVisible());
        assert.match(await condition.innerText(), lesson.condition);
        assert.equal(await question.locator("h3").getAttribute("aria-describedby"), await condition.getAttribute("id"));
        assert.equal(await source.isVisible(), false);
        const correct = question.getByRole("button", { name: "Stop as required and watch for children", exact: true });
        assert.equal(await correct.getAttribute("data-choice"), await question.getAttribute("data-answer"));
        await question.locator("button[data-choice]:not([data-choice='0'])").first().press("Enter");
        assert.match(await feedback.innerText(), /^Not quite\./);
        assert.match(await feedback.innerText(), lesson.reason);
        assert.ok(await source.isVisible());
        assert.equal(await source.getAttribute("href"), lesson.source);
        await feedback.press("Tab");
        assert.ok(await source.evaluate(link => document.activeElement === link));

        const legacy = await page.evaluate(([questionIndex, explanation]) => {
          const key = "tdt-recent-practice";
          const record = JSON.parse(localStorage.getItem(key));
          const rows = JSON.parse(record.draft.signature);
          rows[questionIndex][2] = explanation;
          record.draft.signature = JSON.stringify(rows);
          localStorage.setItem(key, JSON.stringify(record));
          return record;
        }, [index - 1, lesson.previous]);
        assert.equal(legacy.draft.picks.length, 1);
        url.searchParams.set("resume", "1");
        await page.goto(url.href);
        assert.equal(await quiz.locator("[data-quiz-answered]").innerText(), `1 of ${total} answered`);
        assert.match(await feedback.innerText(), /^Not quite\./);
        assert.match(await feedback.innerText(), lesson.reason);
        assert.ok(await source.isVisible());
        const replayed = await page.evaluate(() => (window.dataLayer || [])
          .filter(entry => entry[0] === "event" && /^(quiz_|study_)/.test(entry[1])));
        assert.deepEqual(replayed, []);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      } finally {
        await context.close();
      }
    });
  }
}

for (const [state, mode, index, sourceHost] of brakingCases) {
  test(`${state} ${mode} gives the braking condition before the learner answers`, async () => {
    const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
    try {
      await context.route(/^https?:/, route => route.abort());
      const page = await context.newPage();
      const url = pathToFileURL(path.join(__dirname, "..", `${state}-permit-practice-test.html`));
      url.searchParams.set("mode", mode);
      await page.goto(url.href);
      const quiz = page.locator(`[data-mode-panel=${mode}].is-active [data-quiz]`);
      await quiz.getByRole("button", { name: `Go to question ${index}`, exact: true }).click();
      const question = quiz.locator(".question.is-active");
      const condition = question.locator("[data-quiz-condition]");
      assert.equal(await condition.isVisible(), true);
      assert.match(await condition.textContent(), /conventional (?:disc or drum )?brakes/i);
      const descriptionId = await condition.getAttribute("id");
      assert.equal(await question.locator("h3").getAttribute("aria-describedby"), descriptionId);
      assert.equal(await page.locator(`[id="${descriptionId}"]`).count(), 1);
      assert.equal(await condition.evaluate((note) => note.nextElementSibling.classList.contains("choices")), true);
      const source = question.locator("[data-quiz-source] a");
      assert.equal(await source.isVisible(), false);
      const correct = question.getByRole("button", { name: /^Pump the brakes, shift lower/ });
      assert.equal(await correct.getAttribute("data-choice"), await question.getAttribute("data-answer"));
      await correct.press("Enter");
      const feedback = question.locator(".feedback");
      assert.match(await feedback.textContent(), /^Correct\..*working .*ABS/i);
      assert.match(await feedback.textContent(), /steady pressure|continuous pressure/i);
      assert.equal(await source.isVisible(), true);
      const href = new URL(await source.getAttribute("href"));
      assert.equal(href.protocol, "https:");
      assert.equal(href.hostname, sourceHost);
      await feedback.press("Tab");
      assert.equal(await source.evaluate((link) => document.activeElement === link), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    } finally {
      await context.close();
    }
  });
}

for (const width of [390, 1280]) {
  for (const [state, questions] of Object.entries(cases)) {
    test(`${state} ${width}px grades the local decisions and shows the applicable source after answering`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      try {
        await context.route(/^https?:/, route => route.abort());
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        const url = pathToFileURL(path.join(__dirname, "..", `${state}-permit-practice-test.html`));
        url.searchParams.set("mode", "mock");
        await page.goto(url.href);
        const quiz = page.locator("[data-mode-panel=mock].is-active [data-quiz]");
        assert.equal(await quiz.getAttribute("data-pass-score"), "32");
        assert.equal(await quiz.locator(".question").count(), 40);
        assert.equal(await quiz.locator("[data-quiz-source]").count(), state === "new-jersey-mvc" ? 3 : 4);
        for (const [question, prompt, answer, explanation, sourceHost] of questions) {
          await quiz.getByRole("button", { name: `Go to question ${question}`, exact: true }).click();
          const active = quiz.locator(".question.is-active");
          const feedback = active.locator(".feedback");
          const source = active.locator("[data-quiz-source] a");
          assert.match(await active.locator("h3").textContent(), prompt);
          assert.equal(await source.isVisible(), false);
          const answerText = active.getByRole("button", { name: answer });
          const correct = await active.getAttribute("data-answer");
          assert.equal(await answerText.getAttribute("data-choice"), correct);
          await active.locator(`button[data-choice]:not([data-choice="${correct}"])`).first().click();
          assert.match(await feedback.textContent(), /^Not quite\./);
          assert.match(await feedback.textContent(), explanation);
          assert.equal(await source.isVisible(), true);
          const href = new URL(await source.getAttribute("href"));
          assert.equal(href.protocol, "https:");
          assert.equal(href.hostname, sourceHost);
          await feedback.press("Tab");
          assert.equal(await source.evaluate(link => document.activeElement === link), true);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await quiz.locator("[data-quiz-reset]").click();
        assert.equal(await quiz.locator("[data-quiz-source]:visible").count(), 0);
        assert.equal(await quiz.locator("[data-quiz-answered]").textContent(), "0 of 40 answered");
        const [question, , answer] = questions[0];
        await quiz.getByRole("button", { name: `Go to question ${question}`, exact: true }).click();
        await quiz.locator(".question.is-active").getByRole("button", { name: answer }).click();
        assert.match(await quiz.locator(".question.is-active .feedback").textContent(), /^Correct\./);
        assert.equal(await quiz.locator(".question.is-active [data-quiz-source] a").isVisible(), true);
        assert.deepEqual(errors, []);
      } finally {
        await context.close();
      }
    });
  }
}
