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
const log = origin + "/dmv-permit-test-mistake-log.html";
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

async function saveNote(page, state, topic, prompt) {
  await page.locator("[data-mistake-state]").selectOption(state);
  await page.locator("[data-mistake-topic]").selectOption(topic);
  await page.locator("[data-mistake-prompt]").fill(prompt);
  await page.getByRole("button", { name: "Save mistake" }).click();
}

for (const width of [390, 1280]) {
  test(`${width}px: the manual mistake log opens the saved topic and state, not a generic quiz`, () =>
    withSite(width, async (page, quiz) => {
      await page.goto(log);
      const list = page.locator("[data-mistake-list]");
      for (const [topic, prompt, label, slug, category] of [
        ["wrong-way-entry", "Entered a ramp the wrong way", "Practice entry-control signs", "regulatory-traffic-signs-practice-test.html", "Prohibited entry signs"],
        ["one-way-lane-direction", "Confused a lane arrow and a One Way sign", "Practice direction signs", "regulatory-traffic-signs-practice-test.html", "Lane and direction signs"],
        ["school-pedestrian-crossing", "Missed the school crossing", "Practice crossing signs", signs, "School and pedestrian signs"],
        ["right-of-way", "Unsure which driver yields", "Practice New York right-of-way rules", newYork, "Right of way"],
      ]) {
        await saveNote(page, "new-york", topic, prompt);
        const link = list.getByRole("article").filter({ hasText: prompt }).getByRole("link", { name: label, exact: true });
        await link.press("Enter");
        await page.waitForURL(url => url.pathname === "/" + slug && url.searchParams.get("focus") === category);
        assert.equal(await activeQuestion(quiz).getAttribute("data-category"), category);
        await page.goto(log);
      }
      await saveNote(page, "new-york", "speed-advisory-speed", "Treated an advisory as a posted limit");
      await list.getByRole("link", { name: "Compare posted and advisory speeds", exact: true }).press("Enter");
      await page.waitForURL(log + "#speed-sign-decision");
      const decision = page.locator("#speed-sign-decision");
      assert.ok(await decision.getByRole("heading", { name: "Same number, different speed decision" }).isVisible());
      await decision.getByText("Check the decision", { exact: true }).press("Enter");
      assert.match(await decision.locator("details[open]").innerText(), /does not replace the posted limit/);
      assert.equal(await decision.getByRole("link").count(), 2);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await saveNote(page, "new-york", "score", "New York score");
      await saveNote(page, "florida", "documents-appointment", "Florida address proof");
      assert.equal(await page.locator("[data-mistake-top-label]").textContent(), "Top Florida weak area");
      assert.equal(await page.locator("[data-mistake-top-topic]").textContent(), "Documents or appointment confusion");
      assert.equal(await list.getByRole("article").filter({ hasText: "Florida address proof" }).getByRole("link").getAttribute("href"),
        "florida-dmv-permit-documents-checklist.html#florida-document-route");
      const score = list.getByRole("article").filter({ hasText: "New York score" }).getByRole("link");
      await score.press("Enter");
      await page.waitForURL(url => url.hash === "#score-calculator" && url.searchParams.get("state") === "new-york");
      assert.equal(await page.locator("[data-score-state]").inputValue(), "new-york");
    }));
}

test("existing TX and IL notes open sourced local cases without rewriting notes", () =>
  withSite(1280, async page => {
    await page.goto(log);
    const saved = [
      { state: "texas", stateLabel: "Texas", topic: "right-of-way", topicLabel: "Right-of-way rules", prompt: "Texas priority", fix: "My Texas note", practiceUrl: "texas-dmv-road-signs-practice.html" },
      { state: "illinois", stateLabel: "Illinois", topic: "right-of-way", topicLabel: "Right-of-way rules", prompt: "Illinois priority", fix: "My Illinois note", practiceUrl: "illinois-dmv-road-signs-practice.html" },
    ];
    await page.evaluate(notes => localStorage.setItem("tdt-dmv-mistake-log", JSON.stringify(notes)), saved);
    await page.reload();
    const list = page.locator("[data-mistake-list]");
    for (const [state, hash, answer, law] of [
      ["Texas", "#right-of-way-texas", /Stop and yield to the highway vehicle/, "https://statutes.capitol.texas.gov/"],
      ["Illinois", "#right-of-way-illinois", /You yield to the driver on your right/, "https://www.ilga.gov/"],
    ]) {
      await list.getByRole("link", { name: `Review the ${state} right-of-way case` }).press("Enter");
      await page.waitForURL(log + hash);
      const lesson = page.locator(hash);
      await lesson.getByText("Check the decision", { exact: true }).press("Enter");
      assert.match(await lesson.locator("details[open]").innerText(), answer);
      assert.equal(await lesson.locator(`a[href^="${law}"]`).count(), 1);
    }
    assert.match(await list.innerText(), /My Texas note/);
    assert.match(await list.innerText(), /My Illinois note/);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("tdt-dmv-mistake-log"))), saved);
  }));

test("right-of-way notes in the other four active mixed banks load their actual filtered questions", () =>
  withSite(1280, async (page, quiz) => {
    for (const [state, slug] of [
      ["california", "california-dmv-permit-practice-test.html"],
      ["florida", florida],
      ["pennsylvania", "pennsylvania-dmv-permit-practice-test.html"],
      ["new-jersey", "new-jersey-mvc-permit-practice-test.html"],
    ]) {
      await page.goto(log);
      const prompt = `Priority in ${state}`;
      await saveNote(page, state, "right-of-way", prompt);
      const row = page.locator("[data-mistake-list] article").filter({ hasText: prompt });
      await row.getByRole("link").click();
      await page.waitForURL(url => url.pathname === "/" + slug && url.searchParams.get("mode") === "mock");
      assert.equal(await activeQuestion(quiz).getAttribute("data-category"), "Right of way");
    }
  }));

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

test("uncovered image misses go back to the exact saved questions", () =>
  withSite(1280, async (page, quiz) => {
    await open(page, signs, { mode: "road-signs-starter", focus: "Regulatory signs" });
    const sameConcept = async q => (await q.getAttribute("data-concept-id")) === "stop-yield";
    await finish(quiz, sameConcept);
    assert.match(await nextStudy(quiz).getAttribute("href"), /concept=stop-yield&return=/);
    await quiz.locator("[data-quiz-reset]").click();
    await finish(quiz, async q => await sameConcept(q) || !(await q.getAttribute("data-concept-id")));
    assert.equal(await nextStudy(quiz).getAttribute("href"), signs + "?mode=road-signs-starter&focus=saved#practice");
    const missed = await quiz.locator("[data-quiz-missed]").first().textContent();
    await nextStudy(quiz).click();
    assert.match(await quiz.locator("[data-quiz-position]").textContent(), new RegExp(` of ${missed}$`));
    assert.equal(await quiz.locator("[data-quiz-filter]").inputValue(), "saved");
  }));

for (const width of [390, 1280]) {
  test(`${width}px: finish picture practice, study only matched cards, then retry the saved questions`, () =>
    withSite(width, async (page, quiz) => {
      await open(page, signs, { mode: "road-signs-starter", focus: "Regulatory signs" });
      const review = quiz.locator("[data-quiz-missed-cards]");
      assert.equal(await review.isVisible(), false);
      await finish(quiz, async q => ["stop", "no-passing"].includes(await q.getAttribute("data-flashcard-key")));
      assert.equal(await review.innerText(), "Review 2 missed sign cards");
      assert.equal(await nextStudy(quiz).getAttribute("href"), signs + "?mode=road-signs-starter&focus=saved#practice");
      await review.click();
      await page.waitForURL("**/dmv-road-sign-flashcards.html#missed-sign-cards");
      await page.locator("[data-flashcard-filter] option[value=missed]:checked").waitFor({ state: "attached" });
      assert.deepEqual(await page.evaluate(() => JSON.parse(sessionStorage.getItem("tdt-missed-sign-cards"))),
        { mode: "road-signs-starter", signIds: ["stop", "no-passing"] });
      const group = page.locator("[data-flashcard-filter]");
      const current = page.locator(".flashcard.is-active");
      assert.equal(await group.inputValue(), "missed");
      assert.equal(await page.locator("[data-flashcard-visible]").innerText(), "2");
      assert.equal(await current.getAttribute("data-card-id"), "stop");
      const banner = await page.locator("[data-flashcard-missed-summary]").boundingBox();
      const header = await page.locator(".site-header").boundingBox();
      const picture = await current.locator(".flashcard-sign").boundingBox();
      assert.ok(banner.y >= header.y + header.height && picture.y + picture.height <= 870);
      const secondTool = () => page.evaluate(() => (window.dataLayer || [])
        .filter(event => event[0] === "event" && event[1] === "study_second_tool_used")
        .map(event => event[2]));
      assert.deepEqual(await secondTool(), []);
      const directory = process.env.VERIFY_SCREENSHOTS_DIR;
      if (directory) {
        fs.mkdirSync(directory, { recursive: true });
        await page.screenshot({ path: path.join(directory, `missed-sign-cards-${width}.png`) });
      }
      await page.locator("[data-flashcard-next]").click();
      assert.equal(await current.getAttribute("data-card-id"), "no-passing");
      await current.getByRole("button", { name: "Reveal answer" }).click();
      await page.getByRole("button", { name: "I know this" }).click();
      assert.equal(await page.locator("[data-flashcard-visible]").innerText(), "2");
      await page.waitForFunction(() => window.dataLayer.some(event => event[1] === "study_second_tool_used"),
        undefined, { timeout: 2000 });
      const uses = await secondTool();
      assert.equal(uses.length, 1);
      assert.equal(uses[0].second_tool, "sign_flashcards");
      assert.doesNotMatch(JSON.stringify(uses), /signIds|no-passing/);
      await group.selectOption("all");
      assert.equal(await page.locator("[data-flashcard-visible]").innerText(), "31");
      assert.equal(await page.locator("[data-flashcard-missed-return]").isVisible(), false);
      await page.reload();
      assert.equal(await group.inputValue(), "missed");
      assert.equal(await page.locator("[data-flashcard-visible]").innerText(), "2");
      await page.getByRole("link", { name: "Retry saved questions from this mode" }).click();
      await page.waitForURL("**/road-signs-practice-test.html?mode=road-signs-starter&focus=saved#practice");
      assert.match(await quiz.locator("[data-quiz-position]").innerText(), /1 of 2/);
      assert.equal(await quiz.locator("[data-quiz-filter]").inputValue(), "saved");
      assert.equal(await review.isVisible(), false);
    }));
}

test("unmatched sign art does not open an unrelated card; duplicates open one card", () =>
  withSite(1280, async (page, quiz) => {
    await open(page, signs, { mode: "road-signs-core", focus: "Warning signs" });
    const review = quiz.locator("[data-quiz-missed-cards]");
    await finish(quiz, async q => !(await q.getAttribute("data-flashcard-key")));
    assert.equal(await quiz.locator("[data-quiz-missed]").first().innerText(), "1");
    assert.equal(await review.isVisible(), false);
    assert.match(await nextStudy(quiz).getAttribute("href"), /focus=saved/);
    await open(page, signs, { mode: "road-signs-core" });
    await finish(quiz, async q => (await q.getAttribute("data-flashcard-key")) === "merge");
    assert.equal(await quiz.locator("[data-quiz-missed]").first().innerText(), "3");
    assert.equal(await review.innerText(), "Review 1 missed sign card");
    await review.click();
    await page.waitForURL("**/dmv-road-sign-flashcards.html#missed-sign-cards");
    await page.locator("[data-flashcard-filter] option[value=missed]:checked").waitFor({ state: "attached" });
    assert.equal(await page.locator(".flashcard.is-active").getAttribute("data-card-id"), "merge");
    assert.deepEqual(await page.evaluate(() => JSON.parse(sessionStorage.getItem("tdt-missed-sign-cards"))),
      { mode: "road-signs-core", signIds: ["merge"] });
  }));

test("a direct card link without the local handoff leaves the regular deck available", () =>
  withSite(390, async (page) => {
    await page.addInitScript(() => Object.defineProperty(window, "sessionStorage", {
      get() { throw new Error("blocked in test"); },
    }));
    await page.goto(origin + "/dmv-road-sign-flashcards.html#missed-sign-cards");
    assert.equal(await page.locator("[data-flashcard-filter]").inputValue(), "all");
    assert.equal(await page.locator("[data-flashcard-visible]").innerText(), "31");
    assert.match(await page.locator("[data-flashcard-missed-note]").innerText(), /regular deck/);
    assert.equal(await page.locator("[data-flashcard-missed-return]").isVisible(), false);
    await page.locator(".flashcard.is-active").getByRole("button", { name: "Reveal answer" }).click();
    assert.equal(await page.getByRole("button", { name: "Review again" }).isEnabled(), true);
  }));

for (const width of [390, 1280]) {
  test(`${width}px: contrast practice returns to the original starter mode and its missed signs`, () =>
    withSite(width, async (page, quiz) => {
      await open(page, signs, { mode: "road-signs-starter", focus: "Regulatory signs" });
      await finish(quiz, async q => (await q.getAttribute("data-concept-id")) === "stop-yield");
      const action = nextStudy(quiz);
      const card = mistakes(quiz).first().getByRole("link", { name: "Compare this distinction" });
      assert.equal(await card.getAttribute("href"), await action.getAttribute("href"));
      await action.click();
      await page.waitForURL("**/road-sign-learning-loop.html?*#learning-loop");
      for (let i = 0; i < 3; i++) {
        await page.locator('[data-loop-option="0"]').click();
        await page.locator("[data-loop-next]").click();
        await page.locator("[data-loop-next]").click();
      }
      const retry = page.locator("[data-loop-stage] a");
      assert.equal(await retry.getAttribute("href"), signs + "?mode=road-signs-starter&focus=saved#practice");
      assert.equal(await retry.textContent(), "Retry saved mistakes in this round");
      assert.equal(await page.locator("[data-loop-title]:focus").textContent(), "Review your decisions");
      const header = await page.locator(".site-header").boundingBox();
      const heading = await page.locator("[data-loop-title]").boundingBox();
      const retryBox = await retry.boundingBox();
      assert.ok(heading.y >= header.y + header.height && retryBox.y + retryBox.height < 870);
      const directory = process.env.VERIFY_SCREENSHOTS_DIR;
      if (directory) {
        await page.screenshot({ path: path.join(directory, `comparison-return-${width}.png`) });
      }
      await retry.click();
      await page.waitForURL("**/road-signs-practice-test.html?mode=road-signs-starter&focus=saved#practice");
      assert.equal(await quiz.locator("[data-quiz-filter]").inputValue(), "saved");
      assert.match(await quiz.locator("[data-quiz-position]").textContent(), /1 of 2/);
      assert.equal(await activeQuestion(quiz).getAttribute("data-concept-id"), "stop-yield");
      await answer(quiz, true);
      await page.reload();
      assert.match(await quiz.locator("[data-quiz-position]").textContent(), /1 of 1/);
    }));
}

test("all forty misses survive refresh and the saved focus can revisit them", () =>
  withSite(1280, async (page, quiz) => {
    await open(page, signs, { mode: "road-signs-core" });
    await finish(quiz, () => true);
    assert.match(await quiz.locator("[data-quiz-result]").textContent(), /^0 of 40 correct/);
    await open(page, signs, { mode: "road-signs-core", focus: "saved" });
    assert.match(await quiz.locator("[data-quiz-position]").textContent(), /1 of 40/);
    assert.match(await quiz.locator("[data-quiz-mistakes]").textContent(), /Showing 5 of 40/);
    await answer(quiz, true);
    await page.reload();
    assert.match(await quiz.locator("[data-quiz-position]").textContent(), /1 of 39/);
  }));
