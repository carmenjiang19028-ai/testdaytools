const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const origin = "http://testdaytools.test";
const sets = ["california-dmv", "florida-dmv", "illinois-dmv", "new-jersey-mvc", "new-york-dmv", "pennsylvania-dmv", "texas-dmv"];
const quizUrl = set => `${origin}/${set}-permit-practice-test.html?mode=mock`;
const activeQuiz = page => page.locator("[data-mode-panel=mock].is-active [data-quiz]");
let browser;

before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function withSite(width, run) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  try {
    await context.route(/^https?:/, route => route.abort());
    await context.route(origin + "/**", route => {
      const name = new URL(route.request().url()).pathname.slice(1);
      return route.fulfill({ path: path.join(root, name) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await run(page);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function seedDisplay(page, legacyFirst = false) {
  await page.addInitScript(legacy => {
    if (legacy && !new URLSearchParams(location.search).has("resume")) {
      Math.random = () => 0.99999;
      return;
    }
    let seed = 8128;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }, legacyFirst);
}

test("all seven mixed practice modes require more than clicking a fixed position", () =>
  withSite(1280, async page => {
    await seedDisplay(page);
    for (const set of sets) {
      await page.goto(quizUrl(set));
      const quiz = activeQuiz(page);
      assert.equal(await quiz.getAttribute("data-pass-score"), "32", set);
      const positions = await quiz.locator(".question").evaluateAll(questions => questions.map(q => {
        const ids = [...q.querySelectorAll("[data-choice]")].map(button => Number(button.dataset.choice));
        if (ids.length < 2 || ids.some((id, index) => !ids.includes(index))) {
          throw new Error("Choice identity was lost or duplicated");
        }
        return ids.indexOf(Number(q.dataset.answer));
      }));
      assert.equal(positions.length, 40, set);
      assert.equal(new Set(positions).size, 3, set);
      for (const position of new Set(positions)) {
        assert.ok(positions.filter(actual => actual === position).length < 32, `${set}: position ${position + 1}`);
      }
    }
  }));

test("first-button clicks actually finish below target in the Florida mixed set", () =>
  withSite(390, async page => {
    await seedDisplay(page);
    await page.goto(quizUrl("florida-dmv"));
    const quiz = activeQuiz(page);
    for (let i = 0; i < 40; i++) {
      await quiz.locator(".question.is-active [data-choice]").first().click();
      if (i < 39) await quiz.locator("[data-quiz-forward]").click();
    }
    const result = await quiz.locator("[data-quiz-result]").textContent();
    const count = /^(\d+) of 40 correct/.exec(result);
    assert.ok(count && Number(count[1]) < 32, result);
    assert.match(await quiz.locator("[data-quiz-next]").textContent(), /Practice target: 32 of 40/);
  }));

test("restarting a mixed round changes positions without changing its answer keys", () =>
  withSite(390, async page => {
    await seedDisplay(page);
    await page.goto(quizUrl("florida-dmv"));
    const quiz = activeQuiz(page);
    const readPositions = () => quiz.locator(".question").evaluateAll(questions => questions.map(q => [
      q.dataset.answer,
      [...q.querySelectorAll("[data-choice]")].map(button => button.dataset.choice),
    ]));
    const before = await readPositions();
    const first = quiz.locator(".question").first();
    await first.locator(`[data-choice="${before[0][0]}"]`).click();
    await quiz.locator("[data-quiz-reset]").click();
    const after = await readPositions();
    assert.notDeepEqual(after, before);
    assert.deepEqual(after.map(row => row[0]), before.map(row => row[0]));
    assert.equal(await quiz.locator("[data-quiz-answered]").textContent(), "0 of 40 answered");
    await first.locator(`[data-choice="${after[0][0]}"]`).click();
    assert.match(await first.locator(".feedback").textContent(), /^Correct\./);
  }));

for (const width of [390, 1280]) {
  test(`${width}px: a draft saved in authored display order restores the same selected answers after reordering`, () =>
    withSite(width, async page => {
      await seedDisplay(page, true);
      await page.goto(quizUrl("florida-dmv"));
      const quiz = activeQuiz(page);
      const first = quiz.locator(".question").nth(0);
      const second = quiz.locator(".question").nth(1);
      const order = question => question.locator("[data-choice]").evaluateAll(buttons => buttons.map(button => button.dataset.choice));
      const initialOrder = await order(first);
      assert.deepEqual(initialOrder, ["0", "1", "2"]);
      const correct = await first.getAttribute("data-answer");
      const wrong = String((Number(await second.getAttribute("data-answer")) + 1) % 3);
      await first.locator(`[data-choice="${correct}"]`).click();
      await quiz.locator("[data-quiz-forward]").click();
      const wrongChoice = second.locator(`[data-choice="${wrong}"]`);
      const wrongText = await wrongChoice.textContent();
      await wrongChoice.click();
      const mastery = await page.evaluate(() => localStorage.getItem("tdt-dmv-mastery:v1"));

      await page.goto(quizUrl("florida-dmv") + "&resume=1#practice");
      assert.notDeepEqual(await order(first), initialOrder);
      assert.equal(await quiz.locator("[data-quiz-answered]").textContent(), "2 of 40 answered");
      assert.match(await first.locator(".feedback").textContent(), /^Correct\./);
      assert.match(await second.locator(".feedback").textContent(), /^Not quite\./);
      assert.equal(await second.locator(".is-wrong").textContent(), wrongText);
      assert.equal(await second.locator(".is-wrong").getAttribute("data-choice"), wrong);
      assert.equal(await page.evaluate(() => localStorage.getItem("tdt-dmv-mastery:v1")), mastery);
      assert.deepEqual(await page.evaluate(() => (window.dataLayer || [])
        .filter(event => event[0] === "event" && /^quiz_(start|halfway|complete)$/.test(event[1])).map(event => event[1])), []);
    }));
}
