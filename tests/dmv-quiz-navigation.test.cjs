const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { before, after, test } = require("node:test");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function openQuiz(width, slug, mode) {
  const context = await browser.newContext({ viewport: { width, height: 820 } });
  await context.route(/^https?:/, route => route.abort());
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.join(root, slug + ".html")).href + `?mode=${mode}#practice`);
  return { context, page, quiz: page.locator(`[data-mode-panel="${mode}"] [data-quiz]`) };
}

async function assertFocusedAndVisible(page, target, before = target) {
  assert.equal(await target.evaluate(el => document.activeElement === el), true);
  const above = await before.boundingBox();
  const selected = await target.boundingBox();
  const header = await page.locator(".site-header").boundingBox();
  assert.ok(above.y >= header.y + header.height);
  assert.ok(selected.y + selected.height <= 820);
  assert.notEqual(await target.evaluate(el => getComputedStyle(el).outlineStyle), "none");
}

async function accessibleFocus(page) {
  const inspector = await page.context().newCDPSession(page);
  try {
    const { root } = await inspector.send("DOM.getDocument");
    const { nodeId } = await inspector.send("DOM.querySelector", { nodeId: root.nodeId, selector: ":focus" });
    const { nodes } = await inspector.send("Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false });
    return nodes[0];
  } finally { await inspector.detach(); }
}

const statePracticePages = [
  "california-dmv-permit-practice-test", "california-dmv-road-signs-practice",
  "florida-dmv-permit-practice-test", "florida-dmv-road-signs-practice",
  "illinois-dmv-road-signs-practice",
  "new-jersey-mvc-permit-practice-test", "new-jersey-mvc-road-signs-practice",
  "new-york-dmv-permit-practice-test", "new-york-dmv-road-signs-practice",
  "pennsylvania-dmv-permit-practice-test", "pennsylvania-dmv-road-signs-practice",
  "texas-dmv-road-signs-practice",
];

for (const javaScriptEnabled of [false, true]) {
  test(javaScriptEnabled ? "state study samples work when the quiz script fails to load"
    : "state study samples work without scripts or a simulated score", async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 820 }, javaScriptEnabled });
    try {
      await context.route(/^(https?:|file:.*\/assets\/app\.js$)/, route => route.abort());
      const page = await context.newPage();
      for (const slug of statePracticePages) {
        await page.goto(pathToFileURL(path.join(root, slug + ".html")).href + "#practice");
        const practice = page.locator("#practice");
        const sample = practice.locator("[data-practice-fallback]");
        assert.ok(await sample.isVisible(), slug);
        assert.equal(await practice.locator("[data-choice]:visible").count(), 0, slug);
        assert.equal(await sample.locator("input, button").count(), 0, slug);
        const answer = sample.locator("details");
        assert.equal(await answer.locator("p").first().isVisible(), false, slug);
        await answer.locator("summary").press("Enter");
        const correct = (await answer.locator("strong").innerText()).trim();
        assert.ok((await sample.locator("li").allTextContents()).includes(correct), slug);
        const prompt = await sample.locator("h3").textContent();
        const sourceQuestion = practice.locator("[data-question-index]").filter({ hasText: prompt }).first();
        assert.equal(await sourceQuestion.locator("[data-choice]").nth(Number(await sourceQuestion.getAttribute("data-answer"))).textContent(), correct, slug);
        assert.ok(await answer.locator("p").nth(1).isVisible(), slug);
        assert.ok(await sample.getByRole("link", { name: "Continue with the road signs worksheet" }).isVisible(), slug);
      }
    } finally { await context.close(); }
  });
}

for (const slug of statePracticePages) {
  test("the scored round replaces the static preview after initialization: " + slug, async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
    try {
      await context.route(/^https?:/, route => route.abort());
      const page = await context.newPage();
      await page.goto(pathToFileURL(path.join(root, slug + ".html")).href + "#practice");
      const practice = page.locator("#practice");
      assert.ok(await practice.locator("[data-practice-controls]").isVisible(), slug);
      assert.equal(await practice.locator("[data-practice-fallback]").isVisible(), false, slug);
      const quiz = practice.locator("[data-quiz]:visible");
      await quiz.locator(".question.is-active [data-choice]").first().click();
      assert.match(await quiz.locator("[data-quiz-answered]").textContent(), /^1 of \d+ answered$/);
    } finally { await context.close(); }
  });
}

for (const width of [390, 1280]) {
  test(`${width}px: practice tabs permit keyboard navigation without changing the round until activation`, async () => {
    const { context, page, quiz } = await openQuiz(width, "road-signs-practice-test", "road-signs-core");
    try {
      const list = page.getByRole("tablist", { name: "Practice modes" });
      const starter = list.getByRole("tab", { name: /Permit starter/ });
      const full = list.getByRole("tab", { name: /Full signs test/ });
      assert.equal(await full.count(), 1);
      assert.equal(await full.getAttribute("aria-selected"), "true");
      assert.equal(await full.getAttribute("tabindex"), "0");
      assert.equal(await starter.getAttribute("tabindex"), "-1");
      const fullPanel = page.getByRole("tabpanel", { name: /Full signs test/ });
      assert.equal(await fullPanel.getAttribute("id"), await full.getAttribute("aria-controls"));
      await quiz.locator(".question.is-active [data-choice]").first().click();
      await full.press("ArrowRight");
      const focused = await accessibleFocus(page);
      assert.equal(focused.role.value, "tab");
      assert.match(focused.name.value, /Permit starter/);
      assert.equal(await starter.getAttribute("aria-selected"), "false");
      await page.keyboard.press("Tab");
      assert.ok(await fullPanel.evaluate(el => document.activeElement === el));
      await page.keyboard.press("Shift+Tab");
      assert.ok(await full.evaluate(el => document.activeElement === el));
      await page.keyboard.press("Home");
      await page.keyboard.press("Space");
      assert.equal(await starter.getAttribute("aria-selected"), "true");
      assert.equal(await fullPanel.isVisible(), false);
      assert.ok(await page.getByRole("tabpanel", { name: /Permit starter/ }).isVisible());
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      assert.match(await quiz.locator("[data-quiz-answered]").textContent(), /^1 of 40 answered$/);
      await page.keyboard.press("ArrowLeft");
      assert.ok(await starter.evaluate(el => document.activeElement === el));
    } finally { await context.close(); }
  });
}

test("the optional timer follows elapsed time and keeps its ticks out of announcements", async () => {
  const { context, page, quiz } = await openQuiz(390, "road-signs-practice-test", "road-signs-core");
  try {
    await page.clock.install();
    const timer = quiz.getByRole("timer");
    const announce = quiz.locator("[data-quiz-timer-announcement]");
    const start = quiz.getByRole("button", { name: "Start 10-min timer" });
    assert.equal(await timer.count(), 1);
    assert.equal(await timer.getAttribute("aria-live"), "off");
    assert.ok(await timer.evaluate(el => !el.parentElement.closest('[aria-live="polite"], [role="status"]')));
    await start.press("Enter");
    assert.match(await announce.textContent(), /10-minute timer started/);
    await page.clock.fastForward(61_000);
    assert.match(await timer.textContent(), /8:59 left/);
    assert.match(await announce.textContent(), /10-minute timer started/);
    await quiz.getByRole("button", { name: "Pause timer" }).press("Enter");
    assert.match(await timer.textContent(), /Paused at 8:59/);
    assert.match(await announce.textContent(), /Timer paused/);
    await page.clock.fastForward(120_000);
    assert.match(await timer.textContent(), /Paused at 8:59/);
    await quiz.getByRole("button", { name: "Resume timer" }).press("Enter");
    assert.match(await announce.textContent(), /Timer resumed/);
    await page.clock.fastForward(541_000);
    assert.match(await timer.textContent(), /Time is up/);
    assert.match(await announce.textContent(), /Time is up/);
    await quiz.locator(".question.is-active [data-choice]").first().press("Enter");
    assert.match(await quiz.locator(".question.is-active .feedback").innerText(), /Correct\.|Not quite\./);
    await quiz.getByRole("button", { name: "Restart timer" }).press("Enter");
    assert.match(await timer.textContent(), /10:00 left/);
  } finally { await context.close(); }
});

for (const width of [390, 1280]) {
  test(`${width}px: answer feedback, next, previous, and jump keep the active picture question in view`, async () => {
    const { context, page, quiz } = await openQuiz(width, "road-signs-practice-test", "road-signs-core");
    try {
      const active = quiz.locator(".question.is-active");
      const heading = active.locator("h3");
      const feedback = active.locator(".feedback");
      const forward = quiz.locator("[data-quiz-forward]");
      await active.locator("[data-choice]").first().press("Enter");
      await assertFocusedAndVisible(page, feedback);
      assert.match(await feedback.textContent(), /Correct\.|Not quite\./);
      await page.keyboard.press("Tab");
      assert.equal(await forward.evaluate(el => document.activeElement === el), true);
      await page.keyboard.press("Enter");
      assert.match(await heading.textContent(), /^2\./);
      await assertFocusedAndVisible(page, heading, active);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      const shots = process.env.QUIZ_FOCUS_SCREENSHOTS_DIR;
      if (shots) {
        fs.mkdirSync(shots, { recursive: true });
        await page.screenshot({ path: path.join(shots, `active-question-${width}.png`) });
      }
      await page.keyboard.press("Tab");
      assert.equal(await active.locator("[data-choice]").first().evaluate(el => document.activeElement === el), true);
      await quiz.locator("[data-quiz-prev]").press("Enter");
      assert.match(await heading.textContent(), /^1\./);
      await assertFocusedAndVisible(page, heading, active);
      assert.equal(await active.locator("[data-choice]:disabled").count(), 4);
      await quiz.locator('[data-quiz-jump="2"]').press("Enter");
      assert.match(await heading.textContent(), /^3\./);
      await assertFocusedAndVisible(page, heading, active);
      assert.equal(await quiz.locator("[data-quiz-answered]").textContent(),
        `1 of ${await quiz.getAttribute("data-total")} answered`);
    } finally { await context.close(); }
  });

  test(`${width}px: focusing a picture question exposes the graphic clue before its choices`, async () => {
    const { context, page, quiz } = await openQuiz(width, "road-signs-practice-test", "road-signs-core");
    try {
      await quiz.locator('[data-quiz-jump="8"]').press("Enter");
      const question = quiz.locator(".question.is-active");
      const heading = question.locator("h3");
      const clue = "Yellow diamond with a straight upward arrow. A separate black line curves toward it from the right.";
      const img = question.getByRole("img", { name: clue, exact: true });
      assert.equal(await img.count(), 1);
      assert.equal(await heading.getAttribute("aria-describedby"), await img.getAttribute("id"));
      const node = await accessibleFocus(page);
      assert.equal(node.role.value, "heading");
      assert.match(node.name.value, /What should this yellow sign make you expect/);
      assert.equal(node.description?.value, clue);
      await page.keyboard.press("Tab");
      assert.equal(await question.locator("[data-choice]").first().evaluate(el => document.activeElement === el), true);
      await question.getByRole("button", { name: "Traffic entering or joining your lane", exact: true }).press("Enter");
      assert.match(await question.locator(".feedback").innerText(), /^Correct\./);
      await quiz.locator('[data-quiz-jump="9"]').press("Enter");
      assert.match((await accessibleFocus(page)).description?.value, /left line stays straight and the right line bends inward/);
    } finally { await context.close(); }
  });
}

test("each quiz question describes its own artwork and conditions without leaking descriptions across modes", async () => {
  const { context, page } = await openQuiz(1280, "california-dmv-permit-practice-test", "quick");
  try {
    const associations = await page.locator("[data-quiz] .question").evaluateAll(questions => {
      const ids = new Set();
      let picture = 0, text = 0, conditioned = 0;
      const mismatches = [];
      for (const question of questions) {
        const refs = question.querySelector("h3").getAttribute("aria-describedby")?.split(/\s+/) || [];
        const image = question.querySelector(".question-visual [role='img']");
        const condition = question.querySelector("[data-quiz-condition]");
        const descriptions = [image, condition].filter(Boolean);
        if (image) picture++;
        if (condition) conditioned++;
        if (!descriptions.length) text++;
        const valid = refs.length === descriptions.length && descriptions.every((node, index) =>
          node.id && !ids.has(node.id) && node.id === refs[index] &&
          document.getElementById(node.id) === node &&
          (node === image ? node.getAttribute("aria-label")?.trim() : node.textContent.trim()));
        descriptions.forEach(node => ids.add(node.id));
        if (!valid) mismatches.push({ prompt: question.dataset.prompt, refs });
      }
      return { picture, text, conditioned, mismatches };
    });
    assert.ok(associations.picture > 0 && associations.text > 0 && associations.conditioned > 0);
    assert.deepEqual(associations.mismatches, []);
  } finally { await context.close(); }
});

test("live quiz and daily question expose sign features, not the answer name", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 820 } });
  try {
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    const local = slug => pathToFileURL(path.join(root, slug + ".html")).href;
    await page.goto(local("illinois-dmv-road-signs-practice") + "?focus=Warning%20signs#practice");
    const question = page.locator("[data-quiz] .question.is-active");
    const clue = question.getByRole("img", { name: /yellow diamond.*upward arrow.*curves toward it from the right/i });
    assert.equal(await clue.count(), 1);
    const clueId = await clue.getAttribute("id");
    assert.ok((await question.locator("h3").getAttribute("aria-describedby")).split(/\s+/).includes(clueId));
    assert.equal(await question.getByRole("img", { name: /merge warning sign/i }).count(), 0);

    await page.goto(local("dmv-permit-test-question-of-the-day") + "?state=illinois");
    const daily = page.locator("[data-daily-card].is-active");
    if (!await daily.getByRole("img").count()) await page.locator("[data-daily-next]").click();
    assert.equal(await daily.getByRole("img", { name: "Yellow circle with a black X and an R on each side.", exact: true }).count(), 1);
    assert.equal(await daily.getByRole("img", { name: "railroad crossing sign", exact: true }).count(), 0);
  } finally { await context.close(); }
});

test("touch navigation reveals the next question's whole image and heading", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 820 }, hasTouch: true });
  await context.route(/^https?:/, route => route.abort());
  const page = await context.newPage();
  try {
    await page.goto(pathToFileURL(path.join(root, "road-signs-practice-test.html")).href + "?mode=road-signs-core#practice");
    const quiz = page.locator('[data-mode-panel="road-signs-core"] [data-quiz]');
    const active = quiz.locator(".question.is-active");
    await active.locator("[data-choice]").first().tap();
    await quiz.locator("[data-quiz-forward]").tap();
    const image = await active.getByRole("img").boundingBox();
    const title = await active.locator("h3").boundingBox();
    const header = await page.locator(".site-header").boundingBox();
    assert.ok(image.y >= header.y + header.height);
    assert.ok(title.y > image.y && title.y + title.height <= 820);
  } finally { await context.close(); }
});

test("short viewports prioritize the focused prompt when the picture and prompt cannot both fit", async () => {
  const { context, page, quiz } = await openQuiz(390, "road-signs-practice-test", "road-signs-core");
  try {
    await page.setViewportSize({ width: 390, height: 370 });
    await quiz.locator(".question.is-active [data-choice]").first().press("Enter");
    await quiz.locator("[data-quiz-forward]").press("Enter");
    const heading = quiz.locator(".question.is-active h3");
    const box = await heading.boundingBox();
    const header = await page.locator(".site-header").boundingBox();
    assert.ok(box.y >= header.y + header.height && box.y + box.height <= 370);
    assert.equal(await heading.evaluate(el => document.activeElement === el), true);
  } finally { await context.close(); }
});

test("finish a keyboard-driven starter round and move focus to its score", async () => {
  const { context, page, quiz } = await openQuiz(390, "road-signs-practice-test", "road-signs-starter");
  try {
    const active = quiz.locator(".question.is-active");
    const next = quiz.locator("[data-quiz-forward]");
    const total = Number(await quiz.getAttribute("data-total"));
    for (let index = 0; index < total; index += 1) {
      const answer = await active.getAttribute("data-answer");
      await active.locator(`[data-choice="${answer}"]`).press("Enter");
      if (index < total - 1) await next.press("Enter");
    }
    assert.equal(await next.textContent(), "Review result");
    await next.press("Enter");
    const result = quiz.locator("[data-quiz-result]");
    assert.match(await result.textContent(), new RegExp(`${total} of ${total} correct`));
    await assertFocusedAndVisible(page, result);
    const events = await page.evaluate(() => (window.dataLayer || [])
      .filter(entry => entry[0] === "event" && /^quiz_(start|complete)$/.test(entry[1]))
      .map(entry => entry[1]));
    assert.deepEqual(events, ["quiz_start", "quiz_complete"]);
  } finally { await context.close(); }
});
