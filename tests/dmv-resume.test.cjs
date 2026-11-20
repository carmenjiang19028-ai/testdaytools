const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { before, after, test } = require("node:test");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const origin = "http://testdaytools.test";
const study = origin + "/dmv-practice.html";
const quizUrl = origin + "/road-signs-practice-test.html";
const resumeLink = "[data-recent-practice-link]";
const recentKey = "tdt-recent-practice";
const masteryKey = "tdt-dmv-mastery:v1";
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function withSite(width, run) {
  const ctx = await browser.newContext({ viewport: { width, height: 850 } });
  try {
    await ctx.route(/^https?:/, route => route.abort());
    await ctx.route(origin + "/**", route => {
      const name = new URL(route.request().url()).pathname.slice(1) || "index.html";
      return route.fulfill({ path: path.join(root, name) });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
}

const active = (page) => page.locator("[data-mode-panel].is-active [data-quiz]");
const question = (quiz) => quiz.locator(".question.is-active");
const progress = (quiz) => quiz.locator("[data-quiz-answered]").textContent();
const cursor = (quiz) => question(quiz).getAttribute("data-question-index");
const read = (page, key) => page.evaluate(name => JSON.parse(localStorage.getItem(name)), key);
const resume = async (page) => {
  await page.locator(resumeLink).click();
  await page.waitForLoadState("load");
};
const milestones = (page) => page.evaluate(() => (window.dataLayer || [])
  .filter(event => event[0] === "event" && /^quiz_(start|halfway|complete)$/.test(event[1])).map(event => event[1]));

async function answer(quiz, correct) {
  const result = Number(await question(quiz).getAttribute("data-answer"));
  await question(quiz).locator(`[data-choice="${correct ? result : (result + 1) % 4}"]`).click();
}

for (const width of [390, 1280]) {
  test(`${width}px: resume preserves results, feedback and cursor without replaying activity`, async () =>
    withSite(width, async page => {
      await page.goto(quizUrl + "?mode=road-signs-starter#practice");
      for (let i = 0; i < 6; i += 1) {
        await answer(active(page), i !== 0);
        await active(page).locator("[data-quiz-forward]").click();
      }
      assert.deepEqual(await milestones(page), ["quiz_start", "quiz_halfway"]);
      const savedMastery = await read(page, masteryKey);
      const savedCursor = await cursor(active(page));
      await page.goto(study);
      const link = page.locator(resumeLink);
      assert.equal(await link.textContent(), "Resume unfinished round");
      assert.match(await link.getAttribute("href"), /mode=road-signs-starter&resume=1#practice$/);
      await resume(page);
      assert.equal(await active(page).getAttribute("data-mode-id"), "road-signs-starter");
      assert.equal(await progress(active(page)), "6 of 10 answered");
      assert.equal(await cursor(active(page)), savedCursor);
      assert.match(await active(page).locator(".question").first().locator(".feedback").textContent(), /^Not quite\./);
      assert.equal(await active(page).locator(".question").first().locator("button:disabled").count(), 4);
      assert.deepEqual(await milestones(page), []);
      assert.deepEqual(await read(page, masteryKey), savedMastery);
      const shots = process.env.DMV_RESUME_SCREENSHOTS_DIR;
      if (shots) {
        fs.mkdirSync(shots, { recursive: true });
        await page.locator("[data-quiz-next]:visible").scrollIntoViewIfNeeded();
        await page.screenshot({path: path.join(shots, `resumed-${width}.png`)});
      }
      for (let i = 6; i < 10; i += 1) {
        await answer(active(page), true);
        if (i < 9) await active(page).locator("[data-quiz-forward]").click();
      }
      assert.match(await active(page).locator("[data-quiz-result]").textContent(), /9 of 10 correct/);
      assert.deepEqual(await milestones(page), ["quiz_complete"]);
      const sessions = (await read(page, "tdt-dmv-journey:v1")).sessions;
      assert.equal(sessions.length, 1);
      assert.equal(sessions[0].correct, 9);
      await page.goto(study);
      assert.equal(await link.textContent(), "Open practice set");
      assert.doesNotMatch(await link.getAttribute("href"), /resume/);
    }));
}

test("resume selects the saved full mode and preserves shuffled focused order", async () =>
  withSite(390, async page => {
    await page.goto(quizUrl + "?mode=road-signs-core#practice");
    const quiz = active(page);
    await quiz.locator("[data-quiz-filter]").selectOption("Warning signs");
    await quiz.locator("[data-quiz-shuffle]").click();
    await answer(quiz, true);
    await quiz.locator("[data-quiz-forward]").click();
    const saved = await read(page, recentKey);
    const savedCursor = await cursor(quiz);
    assert.match(saved.href, /mode=road-signs-core&focus=Warning\+signs/);
    await page.goto(study);
    await resume(page);
    assert.equal(await quiz.getAttribute("data-mode-id"), "road-signs-core");
    assert.equal(await quiz.locator("[data-quiz-filter]").inputValue(), "Warning signs");
    assert.equal(await cursor(quiz), savedCursor);
    assert.equal(await progress(quiz), `1 of ${saved.total} answered`);
    await quiz.locator('[data-quiz-jump="2"]').click();
    assert.equal(await cursor(quiz), String(saved.draft.sequence[2]));
    await quiz.locator("[data-quiz-reset]").click();
    await page.goto(study);
    assert.equal(await page.locator(resumeLink).textContent(), "Open practice set");
  }));

test("legacy results and incompatible drafts never claim to restore answers", async () =>
  withSite(1280, async page => {
    await page.goto(study);
    await page.evaluate(({key}) => {
      localStorage.setItem(key, JSON.stringify({label:"Old result", href:"road-signs-practice-test.html#practice", total:40, answered:3, correct:2, missed:1}));
    }, {key: recentKey});
    await page.reload();
    assert.equal(await page.locator(resumeLink).textContent(), "Open practice set");
    await page.goto(quizUrl + "?mode=road-signs-core#practice");
    await answer(active(page), true);
    await page.reload();
    assert.equal(await progress(active(page)), "0 of 40 answered", "a normal link remains a fresh round");
    await page.evaluate(key => {
      const saved = JSON.parse(localStorage.getItem(key));
      saved.draft.signature += "changed questions";
      localStorage.setItem(key, JSON.stringify(saved));
    }, recentKey);
    await page.goto(study);
    await resume(page);
    assert.equal(await progress(active(page)), "0 of 40 answered");
    assert.match(await active(page).locator("[data-quiz-next]").textContent(), /no longer available/);
    assert.deepEqual(await milestones(page), []);
  }));

test("a browser that blocks storage can still answer and open a fresh round", async () =>
  withSite(390, async page => {
    await page.addInitScript(() => {
      for (const name of ["getItem", "setItem"]) {
        Object.defineProperty(Storage.prototype, name, {value() { throw Error("Storage unavailable"); }});
      }
    });
    await page.goto(quizUrl + "?mode=road-signs-starter#practice");
    await answer(active(page), true);
    assert.equal(await progress(active(page)), "1 of 10 answered");
    await page.goto(study);
    assert.equal(await page.locator(resumeLink).textContent(), "Start road signs");
  }));
