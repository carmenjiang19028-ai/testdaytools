const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { chromium } = require("playwright");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const fs = require("node:fs");

let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function withRound(query, width, run) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  try {
    await context.route(/^https?:/, (route) => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const url = pathToFileURL(path.resolve(__dirname, "../road-signs-practice-test.html"));
    url.search = query;
    await page.goto(url.href);
    await run(page, page.locator("[data-mode-panel].is-active [data-quiz]"));
    assert.deepEqual(errors, []);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  } finally { await context.close(); }
}

async function answer(round, correct) {
  const question = round.locator(".question.is-active");
  const answerIndex = Number(await question.getAttribute("data-answer"));
  await question.locator(`button[data-choice="${correct ? answerIndex : (answerIndex + 1) % 4}"]`).click();
}

async function answerRound(round, count, missed = []) {
  for (let i = 0; i < count; i++) {
    await answer(round, !missed.includes(i));
    if (i + 1 < count) await round.locator("[data-quiz-forward]").click();
  }
}

const completions = (page) => page.evaluate(() => (window.dataLayer || [])
  .filter((entry) => entry[0] === "event" && entry[1] === "quiz_complete")
  .map((entry) => entry[2]));

for (const width of [390, 1280]) {
  test(`${width}px: one of two signs is a focus result, not a passing round`, () =>
    withRound("?mode=road-signs-starter&focus=Warning%20signs", width, async (page, round) => {
      await answerRound(round, 2, [1]);
      assert.match(await round.locator("[data-quiz-result]").textContent(), /^1 of 2 correct/);
      assert.match(await round.locator("[data-quiz-next]").textContent(), /Focused review/);
      assert.doesNotMatch(await round.locator("[data-quiz-next]").textContent(), /Practice pass/);
      assert.equal((await completions(page)).at(-1).passed, false);
      const completed = await page.evaluate(() => JSON.parse(localStorage.getItem("tdt-dmv-journey:v1")).sessions[0]);
      assert.match(completed.label, /Warning signs/);
      assert.equal(completed.total, 2);
      assert.equal(completed.href, "road-signs-practice-test.html?mode=road-signs-starter&focus=Warning+signs#practice");
      if (process.env.VERIFY_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
        await round.locator("[data-quiz-result]").scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `focused-${width}.png`) });
      }
    }));
}

test("an error outside the current focus stays saved but is not a current weak area", () =>
  withRound("?mode=road-signs-core", 1280, async (page, round) => {
    const filter = round.locator("[data-quiz-filter]");
    await filter.selectOption("Regulatory signs");
    await answer(round, false);
    await filter.selectOption("Warning signs");
    await answerRound(round, 7);
    assert.match(await round.locator("[data-quiz-breakdown]").textContent(), /No missed categories/);
    assert.match(await round.locator("[data-quiz-mistakes]").textContent(), /Regulatory signs/);
    assert.match(await round.locator("[data-quiz-next-title]").textContent(), /all questions/i);
    const link = round.locator("[data-quiz-next-action]");
    assert.equal(await link.getAttribute("href"), "road-signs-practice-test.html?mode=road-signs-core#practice");
    await link.click();
    assert.equal(await filter.inputValue(), "all");
    assert.match(await round.locator("[data-quiz-position]").textContent(), /Question 1 of 40/);
    assert.match(await round.locator("[data-quiz-mistakes]").textContent(), /Regulatory signs/);
    assert.equal(await page.locator(".question.is-active h3:focus").count(), 1);
  }));

test("a full round continues to assess the published practice target", () =>
  withRound("?mode=road-signs-starter", 1280, async (page, round) => {
    await answerRound(round, 10, [1, 2]);
    assert.match(await round.locator("[data-quiz-next]").textContent(), /Practice target met: 8 of 10/);
    assert.equal((await completions(page)).at(-1).passed, true);
    await round.locator("[data-quiz-reset]").click();
    await answerRound(round, 10, [1, 2, 3]);
    assert.match(await round.locator("[data-quiz-next]").textContent(), /Practice target: 8 of 10/);
    assert.equal((await completions(page)).at(-1).passed, false);
  }));

test("re-answering one saved mistake is focused review, not a pass", () =>
  withRound("?mode=road-signs-starter", 390, async (page, round) => {
    await answer(round, false);
    await round.locator("[data-quiz-filter]").selectOption("saved");
    await answer(round, true);
    assert.match(await round.locator("[data-quiz-result]").textContent(), /^1 of 1 correct/);
    assert.match(await round.locator("[data-quiz-next]").textContent(), /Focused review/);
    assert.equal((await completions(page)).at(-1).passed, false);
    await round.getByRole("link", { name: "Return to original round" }).click();
    assert.equal(await round.locator("[data-quiz-answered]").textContent(), "1 of 10 answered");
    assert.match(await round.locator(".question.is-active .feedback").textContent(), /^Not quite\./);
  }));
