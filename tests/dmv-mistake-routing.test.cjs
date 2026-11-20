const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");

const origin = "http://testdaytools.test";
const root = path.resolve(__dirname, "..");
const california = "california-dmv-road-signs-practice.html";
const florida = "florida-dmv-permit-practice-test.html";
const newYork = "new-york-dmv-permit-practice-test.html";
const signs = "road-signs-practice-test.html";
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function withSite(width, run) {
  const context = await browser.newContext({ viewport: { width, height: 870 } });
  try {
    await context.route(/^https?:/, route => route.abort());
    await context.route(origin + "/**", route => {
      const name = new URL(route.request().url()).pathname.slice(1);
      return route.fulfill({ path: path.join(root, name || "index.html") });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await run(page, page.locator("[data-mode-panel].is-active [data-quiz]"));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

const activeQuestion = quiz => quiz.locator(".question.is-active");
const mistakes = quiz => quiz.locator("[data-quiz-mistakes] article");
const nextStudy = quiz => quiz.locator("[data-quiz-next-action]");
const open = (page, name, params) => page.goto(origin + "/" + name + "?" + new URLSearchParams(params) + "#practice");

async function answer(quiz, correct) {
  const q = activeQuestion(quiz);
  const key = await q.getAttribute("data-answer");
  await q.locator(correct ? `[data-choice="${key}"]` : `[data-choice]:not([data-choice="${key}"])`).first().click();
}

async function finish(quiz, miss) {
  while (true) {
    const q = activeQuestion(quiz);
    await answer(quiz, !(await miss(q)));
    const forward = quiz.locator("[data-quiz-forward]");
    if (await forward.textContent() === "Review result") break;
    await forward.click();
  }
}

async function seedSaved(page, name, mode, indexes) {
  await open(page, name, { mode });
  await page.evaluate(({ mode, indexes }) => {
    const bank = document.querySelector(`[data-mode-panel="${mode}"]`);
    const saved = indexes.map(index => {
      const q = bank.querySelector(`[data-question-index="${index}"]`);
      return { prompt: q.dataset.prompt, category: q.dataset.category, conceptId: q.dataset.conceptId || "", savedAt: Date.now() };
    });
    localStorage.setItem(`tdt-mistakes:${location.pathname}:${mode}`, JSON.stringify(saved));
  }, { mode, indexes });
}

for (const width of [390, 1280]) {
  test(`${width}px: two signs with the same prompt remain separate and resolve independently`, () =>
    withSite(width, async (page, quiz) => {
      await open(page, california, { mode: "signs" });
      await quiz.locator('[data-quiz-jump="1"]').click();
      const stem = await activeQuestion(quiz).getAttribute("data-prompt");
      await answer(quiz, false);
      await quiz.locator('[data-quiz-jump="21"]').click();
      assert.equal(await activeQuestion(quiz).getAttribute("data-prompt"), stem);
      await answer(quiz, false);
      assert.equal(await mistakes(quiz).count(), 2);
      const directory = process.env.VERIFY_SCREENSHOTS_DIR;
      if (directory) {
        fs.mkdirSync(directory, { recursive: true });
        await quiz.locator(".mistake-bank").screenshot({ path: path.join(directory, `saved-mistakes-${width}.png`) });
      }

      await open(page, california, { mode: "signs", focus: "saved" });
      assert.match(await quiz.locator("[data-quiz-position]").textContent(), /1 of 2/);
      assert.match(await activeQuestion(quiz).locator(".sign-art").getAttribute("aria-label"), /yield/i);
      await answer(quiz, true);
      assert.equal(await mistakes(quiz).count(), 1);
      assert.match(await mistakes(quiz).textContent(), /Directional signs/);
      await page.reload();
      assert.match(await quiz.locator("[data-quiz-position]").textContent(), /1 of 1/);
      assert.match(await activeQuestion(quiz).locator(".sign-art").getAttribute("aria-label"), /keep right/i);
    }));
}

test("legacy prompt and category identify one sign rather than every identical prompt", () =>
  withSite(1280, async (page, quiz) => {
    await seedSaved(page, california, "signs", [21]);
    await open(page, california, { mode: "signs", focus: "saved" });
    assert.match(await quiz.locator("[data-quiz-position]").textContent(), /1 of 1/);
    assert.match(await activeQuestion(quiz).locator(".sign-art").getAttribute("aria-label"), /keep right/i);
  }));

test("slippery-road rule errors lead to a state rules plan instead of flashcards", () =>
  withSite(390, async (page, quiz) => {
    await open(page, newYork, { mode: "mock", focus: "Road conditions" });
    await finish(quiz, async q => (await q.getAttribute("data-prompt")).startsWith("When roads are wet"));
    assert.match(await quiz.locator("[data-quiz-result]").textContent(), /^5 of 6 correct/);
    assert.match(await nextStudy(quiz).getAttribute("href"), /state=new-york&focus=rules#study-plan$/);
  }));

test("mixed image and text misses return to this mode's saved questions", () =>
  withSite(1280, async (page, quiz) => {
    await seedSaved(page, florida, "mock", [3, 31]);
    await open(page, florida, { mode: "mock", focus: "saved" });
    assert.match(await quiz.locator("[data-quiz-position]").textContent(), /1 of 2/);
    assert.equal(await quiz.locator(".question.is-active .sign-art").count(), 1);
    await answer(quiz, false);
    await quiz.locator("[data-quiz-forward]").click();
    assert.equal(await quiz.locator(".question.is-active .sign-art").count(), 0);
    await answer(quiz, false);
    assert.equal(await nextStudy(quiz).getAttribute("href"), florida + "?mode=mock&focus=saved#practice");
    await nextStudy(quiz).focus();
    await page.keyboard.press("Enter");
    assert.match(await quiz.locator("[data-quiz-result]").textContent(), /^Score: 0 of 0/);
    assert.match(await quiz.locator("[data-quiz-position]").textContent(), /1 of 2/);
    assert.equal(await quiz.locator(".question.is-active h3:focus").count(), 1);
  }));

test("a targeted lesson covers all the current misses, not just one of them", () =>
  withSite(1280, async (page, quiz) => {
    await open(page, signs, { mode: "road-signs-starter", focus: "Regulatory signs" });
    const sameConcept = async q => (await q.getAttribute("data-concept-id")) === "stop-yield";
    await finish(quiz, sameConcept);
    assert.match(await nextStudy(quiz).getAttribute("href"), /concept=stop-yield&return=/);
    await quiz.locator("[data-quiz-reset]").click();
    await finish(quiz, async q => await sameConcept(q) || !(await q.getAttribute("data-concept-id")));
    assert.equal(await nextStudy(quiz).getAttribute("href"), "dmv-road-sign-flashcards.html");
  }));
