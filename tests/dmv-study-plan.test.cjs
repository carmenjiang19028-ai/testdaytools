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
}

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
