const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { chromium } = require("playwright");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const fs = require("node:fs");

let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function openPlan(width, query, run) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.route(/^https?:/, (route) => route.abort());
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const url = new URL(query, pathToFileURL(path.resolve(__dirname, "../dmv-permit-test-study-plan.html")));
    await page.goto(url.href);
    await run(page);
    assert.deepEqual(errors, []);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  } finally { await context.close(); }
}

const rows = page => page.locator("[data-study-plan-list] > li");
const score = page => page.locator("[data-study-score]");

async function openMock(page, file, focus) {
  const url = pathToFileURL(path.resolve(__dirname, "..", file));
  url.search = new URLSearchParams(focus ? { mode: "mock", focus } : { mode: "mock" });
  await page.goto(url.href);
  return page.locator('[data-mode-panel="mock"].is-active [data-quiz]');
}

async function completeMock(quiz, count, shouldMiss) {
  for (let i = 0; i < count; i++) {
    const question = quiz.locator(".question.is-active");
    const category = await question.getAttribute("data-category");
    const answer = await question.getAttribute("data-answer");
    const current = `[data-choice="${answer}"]`;
    await question.locator(`button[data-choice]${shouldMiss(category, i) ? `:not(${current})` : current}`).first().click();
    if (i < count - 1) await quiz.locator("[data-quiz-forward]").click();
  }
  assert(await quiz.evaluate(el => el.classList.contains("is-complete")));
}

for (const width of [390, 1280]) {
  test(`${width}px: the state survives the trip from planner to score calculator`, () =>
    openPlan(width, "?state=new-york", async page => {
      assert.equal(await page.locator("[data-study-state]").inputValue(), "new-york");
      const url = new URL(await score(page).getAttribute("href"), page.url());
      assert.equal(url.searchParams.get("state"), "new-york");
      assert.equal(url.hash, "#score-calculator");
      await score(page).click();
      await page.waitForURL(/state=new-york#score-calculator$/);
      assert.equal(await page.locator("[data-score-state]").inputValue(), "new-york");
      assert.match(await page.locator("[data-score-rule]").textContent(), /14 correct out of 20/);
    }));

  test(`${width}px: a New York note keeps its state and returns to the same plan`, () =>
    openPlan(width, "?state=new-york&focus=rules#study-plan", async page => {
      await page.locator("[data-study-days]").selectOption("14");
      await page.getByRole("link", { name: "Record a missed rule" }).click();
      await page.waitForURL(/state=new-york&days=14&focus=rules#mistake-log$/);
      assert.equal(await page.locator("[data-mistake-state]").inputValue(), "new-york");
      assert.equal(await page.locator("[data-mistake-state-label]").innerText(), "New York");
      await page.getByLabel("Missed question or cue").fill("Local practice note");
      await page.getByRole("button", { name: "Save mistake" }).click();
      const entries = await page.evaluate(() => JSON.parse(localStorage.getItem("tdt-dmv-mistake-log")));
      assert.equal(entries.length, 1);
      assert.equal(entries[0].state, "new-york");
      const plan = page.locator("[data-mistake-plan]");
      assert.doesNotMatch(await plan.getAttribute("href"), /practice.note/i);
      await plan.click();
      await page.waitForURL(/state=new-york&days=14&focus=rules#study-plan$/);
      assert.equal(await page.locator("[data-study-state]").inputValue(), "new-york");
      assert.equal(await page.locator("[data-study-days]").inputValue(), "14");
      assert.equal(await page.locator("[data-study-weak]").inputValue(), "rules");
      assert.equal(await rows(page).last().locator("[data-study-range]").textContent(), "Day 14");
    }));

  test(`${width}px: Texas links back to the same 10 pictures rather than a 20-question drill`, () =>
    openPlan(width, "?state=texas#study-plan", async page => {
      const baseline = page.getByRole("link", { name: "Start 10 sign questions" });
      const repeat = page.getByRole("link", { name: "Repeat the 10-sign baseline" });
      const open = async label => {
        await page.getByRole("link", { name: label }).click();
        const questions = page.locator('[data-mode-panel="road-signs-starter"].is-active .question');
        assert.equal(await questions.count(), 10);
        return questions.evaluateAll(items => items.map(item => item.dataset.prompt));
      };
      const url = page.url();
      assert.equal(await repeat.getAttribute("href"), await baseline.getAttribute("href"));
      const first = await open("Start 10 sign questions");
      await page.goto(url);
      assert.deepEqual(await open("Repeat the 10-sign baseline"), first);
    }));

  for (const [file, topic, count, heading] of [
    ["florida-dmv-permit-practice-test.html", "Exam readiness", 2, /Florida Class E exam/],
    ["florida-dmv-permit-practice-test.html", "Florida licensing", 1, /Florida Class E exam/],
    ["pennsylvania-dmv-permit-practice-test.html", "Exam readiness", 3, /PennDOT/],
    ["new-jersey-mvc-permit-practice-test.html", "MVC process", 1, /New Jersey documents/],
  ]) {
    test(`${width}px: ${file} sends only ${topic} misses to its own test details`, () =>
      openPlan(width, "", async page => {
        const quiz = await openMock(page, file, topic);
        await completeMock(quiz, count, category => {
          assert.equal(category, topic);
          return true;
        });
        const action = quiz.getByRole("link", { name: "Read the state test details" });
        assert.equal(await action.getAttribute("href"), "#official-details");
        assert.match(await quiz.locator("[data-quiz-result]").textContent(), new RegExp(`0 of ${count} correct`));
        await action.click();
        await page.waitForURL(url => url.pathname.endsWith(file) && url.hash === "#official-details");
        assert.match(await page.locator("#official-details h2").textContent(), heading);
        assert.match(await quiz.locator("[data-quiz-result]").textContent(), new RegExp(`0 of ${count} correct`));
      }));
  }
}

test("a full round with both a permit-process and a driving-rule miss still opens a rules plan", () =>
  openPlan(1280, "", async page => {
    const quiz = await openMock(page, "pennsylvania-dmv-permit-practice-test.html");
    const count = await quiz.locator(".question").count();
    const missed = new Set();
    await completeMock(quiz, count, category => {
      if (!["Exam readiness", "Emergencies"].includes(category) || missed.has(category)) return false;
      missed.add(category);
      return true;
    });
    assert.deepEqual([...missed], ["Exam readiness", "Emergencies"]);
    assert.match(await quiz.locator("[data-quiz-result]").textContent(), /38 of 40 correct/);
    const next = quiz.getByRole("link", { name: "Build a focused plan" });
    assert.equal(await next.getAttribute("href"), "dmv-permit-test-study-plan.html?state=pennsylvania&focus=rules#study-plan");
  }));

test("each horizon schedules a baseline, a deliberate recheck and a final day", () =>
  openPlan(390, "?state=new-york", async page => {
    for (const days of [3, 7, 14, 21]) {
      await page.locator("[data-study-days]").selectOption(String(days));
      const ranges = (await rows(page).locator("[data-study-range]").allTextContents()).map(s => s.match(/\d+/g).map(Number));
      const covered = ranges.flatMap(([start, end = start]) => Array.from({ length: end - start + 1 }, (_, n) => start + n));
      assert.deepEqual(covered, Array.from({ length: days }, (_, n) => n + 1));
      assert.match(await rows(page).first().textContent(), /appointment.*10-question/i);
      assert.match(await rows(page).last().textContent(), /documents.*appointment/i);
      assert.match(await rows(page).locator("a[href*='state=new-york#score-calculator']").first().getAttribute("href"), /state=new-york#score-calculator$/);
      assert.match(await rows(page).allTextContents().then(text => text.join(" ")), /2 of 4 sign questions/);
      assert.equal(await page.getByRole("link", { name: "Repeat the 10-sign baseline" }).getAttribute("href"),
        await page.getByRole("link", { name: "Start 10 sign questions" }).getAttribute("href"));
    }
    if (process.env.VERIFY_SCREENSHOTS_DIR) {
      fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
      await rows(page).first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, "planner-390.png") });
    }
  }));

test("a quiz can open the rules plan directly, and changing focus changes the assignment", () =>
  openPlan(1280, "?state=florida&focus=rules#study-plan", async page => {
    const focus = page.locator("[data-study-weak]");
    assert.equal(await focus.inputValue(), "rules");
    assert.match(await rows(page).nth(1).textContent(), /missed rule/);
    await focus.selectOption("road-signs");
    assert.match(await rows(page).nth(1).textContent(), /name.*driver action/i);
    await focus.selectOption("documents");
    assert.match(await rows(page).nth(1).textContent(), /missing/);
    await focus.selectOption("score");
    assert.match(await rows(page).nth(1).textContent(), /same length/);
    await page.locator("[data-study-state]").selectOption("pennsylvania");
    assert.match(await score(page).getAttribute("href"), /state=pennsylvania#score-calculator$/);
    assert.doesNotMatch((await rows(page).allTextContents()).join(" "), /Florida|New York/);
    if (process.env.VERIFY_SCREENSHOTS_DIR) {
      fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
      await rows(page).first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, "planner-1280.png") });
    }
  }));

test("a reported rule miss leads to the right state and assignment", () =>
  openPlan(1280, "", async page => {
    const url = pathToFileURL(path.resolve(__dirname, "../new-york-dmv-permit-practice-test.html"));
    url.search = "mode=mock&focus=Right+of+way";
    await page.goto(url.href);
    const quiz = page.locator("[data-mode-panel=mock].is-active [data-quiz]");
    const count = await quiz.locator('.question[data-category="Right of way"]').count();
    assert(count > 0);
    for (let i = 0; i < count; i++) {
      const question = quiz.locator(".question.is-active");
      const correct = await question.getAttribute("data-answer");
      if (i === 0) await question.locator(`button[data-choice]:not([data-choice="${correct}"])`).first().click();
      else await question.locator(`button[data-choice="${correct}"]`).click();
      if (i < count - 1) await quiz.locator("[data-quiz-forward]").click();
    }
    const next = quiz.locator("[data-quiz-next-action]");
    assert.match(await next.getAttribute("href"), /state=new-york&focus=rules#study-plan$/);
    await next.click();
    await page.waitForURL(/focus=rules#study-plan$/);
    assert.equal(await page.locator("[data-study-weak]").inputValue(), "rules");
    assert.match(await rows(page).nth(1).textContent(), /missed rule/);
  }));

test("invalid plan preferences neither replace defaults nor appear in a return link", () =>
  openPlan(390, "?state=not-a-state&days=400&focus=not-a-topic#study-plan", async page => {
    assert.equal(await page.locator("[data-study-state]").inputValue(), "florida");
    assert.equal(await page.locator("[data-study-days]").inputValue(), "7");
    assert.equal(await page.locator("[data-study-weak]").inputValue(), "mixed");
    await page.goto(pathToFileURL(path.resolve(__dirname, "../dmv-permit-test-mistake-log.html")).href +
      "?state=not-a-state&days=400&focus=not-a-topic#mistake-log");
    assert.equal(await page.locator("[data-mistake-state]").inputValue(), "florida");
    assert.equal(await page.locator("[data-mistake-plan]").getAttribute("href"),
      "dmv-permit-test-study-plan.html?state=florida#study-plan");
  }));

test("the example plan uses the same baseline and repeat links without JavaScript", async () => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
  try {
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    await page.goto(pathToFileURL(path.resolve(__dirname, "../dmv-permit-test-study-plan.html")).href);
    const baseline = page.getByRole("link", { name: "Start 10 sign questions" });
    const recheck = page.getByRole("link", { name: "Repeat the 10-sign baseline" });
    assert.equal(await recheck.getAttribute("href"), await baseline.getAttribute("href"));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  } finally {
    await context.close();
  }
});
