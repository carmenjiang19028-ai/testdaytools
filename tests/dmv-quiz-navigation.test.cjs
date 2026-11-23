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
      const clue = "Yellow diamond with a straight upward arrow and a separate curved stem joining from the right";
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
      assert.match((await accessibleFocus(page)).description?.value, /right stroke bends closer to the left/);
    } finally { await context.close(); }
  });
}

test("each quiz mode describes an image in its own question and leaves text-only prompts alone", async () => {
  const { context, page } = await openQuiz(1280, "california-dmv-permit-practice-test", "quick");
  try {
    const associations = await page.locator("[data-quiz] .question").evaluateAll(questions => {
      const ids = new Set();
      let picture = 0, text = 0, mismatches = 0;
      for (const question of questions) {
        const ref = question.querySelector("h3").getAttribute("aria-describedby");
        const image = question.querySelector(".question-visual [role='img']");
        if (image) {
          picture++;
          if (!ref || ids.has(ref) || document.getElementById(ref) !== image || !image.getAttribute("aria-label")) mismatches++;
          ids.add(ref);
        } else {
          text++;
          if (ref) mismatches++;
        }
      }
      return { picture, text, mismatches };
    });
    assert.ok(associations.picture > 0 && associations.text > 0);
    assert.equal(associations.mismatches, 0);
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
