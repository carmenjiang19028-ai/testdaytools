const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { chromium } = require("playwright");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const fs = require("node:fs");

const root = path.resolve(__dirname, "..");
const worksheetUrl = pathToFileURL(path.join(root, "dmv-road-signs-cheat-sheet.html")).href + "#online-worksheet";
const site = JSON.parse(fs.readFileSync(path.join(root, "content/site_data.json"), "utf8"));
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function withSheet(width, run) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  try {
    await context.route(/^https?:/, (route) => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(pathToFileURL(path.join(root, "dmv-road-signs-cheat-sheet.html")).href);
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

const paths = [
  ["Regulatory traffic signs", "regulatory-traffic-signs-practice-test", "regulatory-signs-core", "all", 16],
  ["Warning signs", "road-signs-practice-test", "road-signs-core", "sheet-warning", 20],
  ["School, work-zone, and service signs", "road-signs-practice-test", "road-signs-core", "sheet-school-work-service", 6],
];

for (const [label, slug, mode, focus, count] of paths) {
  test(`printable sheet to ${label}: exact picture family with ${count} questions`, () =>
    withSheet(label === "Warning signs" ? 390 : 1280, async page => {
      const source = site.tools.find(t => t.slug === "road-signs-practice-test");
      const pictures = new Set(source.signLibrary.groups.find(g => g.label === label).signs.map(sign => sign.image));
      const group = page.locator(".cheat-group").filter({ has: page.getByRole("heading", { name: label, exact: true }) });
      const link = group.getByRole("link", { name: `Practice ${count} questions: ${label}`, exact: true });
      assert.equal(await link.count(), 1);
      if (process.env.VERIFY_SCREENSHOTS_DIR && label === "Warning signs") {
        fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
        await group.locator(".cheat-group-head").scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, "group-link-390.png") });
      }
      await link.click();
      await page.waitForURL(url => url.pathname.endsWith(`/${slug}.html`) && url.searchParams.get("mode") === mode);
      const quiz = page.locator(`[data-mode-panel="${mode}"].is-active [data-quiz]`);
      await quiz.waitFor({ state: "visible" });
      assert.equal(await quiz.locator("[data-quiz-filter]").inputValue(), focus);
      assert.match(await quiz.locator("[data-quiz-position]").textContent(), new RegExp(`^Question 1 of ${count}$`));
      const selected = site.tools.find(t => t.slug === slug).quizModes.find(m => m.id === mode);
      const questions = [...site.quizzes[selected.quiz], ...(site.quizzes[selected.appendQuiz] || [])];
      const seen = new Set();
      for (const jump of await quiz.locator("[data-quiz-jump]").all()) {
        await jump.click();
        const index = Number(await quiz.locator(".question.is-active").getAttribute("data-question-index"));
        seen.add(questions[index].image);
      }
      assert.deepEqual(seen, pictures);
      if (focus !== "all") {
        assert.equal(await quiz.locator("[data-quiz-jump]").count(), count);
        await quiz.locator("[data-quiz-filter]").selectOption("all");
        assert.match(await quiz.locator("[data-quiz-position]").textContent(), /Question 1 of 40/);
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }));
}

test("the online worksheet routes each sign and decision to matching practice", () =>
  withSheet(390, async page => {
    const signKeys = ["stop", "yield", "do-not-enter", "speed-limit", "merge", "school-crossing", "railroad", "slippery"];
    const decisionTargets = [
      ["road-sign-learning-loop", "lesson-stop-yield", /Stop vs. Yield/],
      ["road-sign-learning-loop", "lesson-stop-yield", /Stop vs. Yield/],
      ["road-sign-learning-loop", "lesson-merge-lane-ends", /Merge vs. Lane Ends/],
      ["road-sign-shapes-and-colors-finder", "crossing-shape-check", /different crossing signs/],
      ["road-signs-practice-test", "practice", null],
      ["road-sign-shapes-and-colors-finder", "railroad-crossing-check", /Railroad warning ahead/],
      ["texas-dmv-road-signs-practice", "texas-work-zone-panels", /work zone|work-zone/i],
      ["florida-dmv-road-signs-practice", "florida-right-turn-decisions", /require, prohibit, or delay/],
    ];
    const parts = page.locator("#online-worksheet .worksheet-part");
    const openPart = async (index) => {
      await page.goto(worksheetUrl);
      const part = parts.nth(index);
      if (!(await part.evaluate(element => element.open))) await part.locator(":scope > summary").press("Enter");
      return part;
    };
    const matchPicture = async (key) => {
      const quiz = page.locator('[data-mode-panel="road-signs-core"].is-active [data-quiz]');
      await quiz.waitFor({ state: "visible" });
      assert.notEqual(await quiz.locator("[data-quiz-filter]").inputValue(), "all");
      for (const jump of await quiz.locator("[data-quiz-jump]").all()) {
        await jump.press("Enter");
        if (await quiz.locator(".question.is-active").getAttribute("data-flashcard-key") === key) return;
      }
      assert.fail(`The active practice group does not include ${key}`);
    };
    const returnToAnswer = async (id, scope) => {
      const link = scope.getByRole("link", { name: "Return to this worksheet answer", exact: true });
      assert.equal(await link.count(), 1);
      assert.equal(await link.getAttribute("href"), `dmv-road-signs-cheat-sheet.html#${id}`);
      await link.press("Enter");
      await page.waitForURL(url => url.pathname.endsWith("/dmv-road-signs-cheat-sheet.html") && url.hash === `#${id}`);
      const destination = page.locator(`#${id}`);
      assert.equal(await destination.isVisible(), true);
      assert.equal(await destination.evaluate(node => document.activeElement === node), true);
      const box = await destination.boundingBox();
      const header = await page.locator(".site-header").boundingBox();
      assert.ok(box.y >= header.y + header.height);
    };
    const core = page.locator('[data-mode-panel="road-signs-core"].is-active');
    for (const [index, key] of signKeys.entries()) {
      const part = await openPart(0);
      const answer = part.locator(".worksheet-pictures > li details").nth(index);
      const link = answer.locator("a");
      assert.equal(await link.isVisible(), false);
      await answer.locator("summary").press("Enter");
      await link.press("Enter");
      await page.waitForURL(url => url.pathname.endsWith("/road-signs-practice-test.html") && url.hash === "#practice");
      await matchPicture(key);
      await returnToAnswer(`worksheet-sign-${index + 1}`, core);
    }
    for (const [index, [slug, anchor, heading]] of decisionTargets.entries()) {
      const part = await openPart(1);
      const answer = part.locator(".worksheet-decisions > li details").nth(index);
      const link = answer.locator("a");
      assert.equal(await link.isVisible(), false);
      await answer.locator("summary").press("Enter");
      await link.press("Enter");
      await page.waitForURL(url => url.pathname.endsWith(`/${slug}.html`) && url.hash === `#${anchor}`);
      if (heading) {
        const section = page.locator(`#${anchor}`);
        assert.ok(await section.getByRole("heading", { name: heading }).isVisible());
        if (slug !== "road-sign-learning-loop") await returnToAnswer(`worksheet-decision-${index + 1}`, section);
      } else {
        await matchPicture("slippery");
        await returnToAnswer(`worksheet-decision-${index + 1}`, core);
      }
    }
    const transfer = await openPart(2);
    await transfer.getByText("Check your reasoning", { exact: true }).press("Enter");
    await transfer.getByRole("link", { name: "Try the Added Lane comparison" }).press("Enter");
    await page.waitForURL(url => url.pathname.endsWith("/road-sign-learning-loop.html") && url.hash === "#lesson-merge-lane-ends");
    assert.ok(await page.getByText("Does the ramp traffic get its own lane?", { exact: true }).isVisible());
  }));

test("a direct or mismatched lesson URL does not impersonate a worksheet route", () =>
  withSheet(1280, async page => {
    const lesson = pathToFileURL(path.join(root, "texas-dmv-road-signs-practice.html")).href;
    const returns = page.getByRole("link", { name: "Return to this worksheet answer", exact: true });
    for (const query of ["", "?return=worksheet-decision-8", "?return=worksheet-sign-2", "?return=https://example.com/"]) {
      await page.goto(lesson + query + "#texas-work-zone-panels");
      assert.equal(await returns.count(), 0);
    }
    await page.goto(lesson + "?return=worksheet-decision-7#texas-work-zone-panels");
    assert.equal(await returns.count(), 1);
    assert.equal(await returns.getAttribute("href"), "dmv-road-signs-cheat-sheet.html#worksheet-decision-7");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  }));

test("a completed speed-sign drill still returns to the original worksheet answer", () =>
  withSheet(1280, async page => {
    await page.goto(worksheetUrl);
    const worksheet = page.locator("#online-worksheet");
    await worksheet.getByText("1. Name eight road signs", { exact: true }).press("Enter");
    await worksheet.getByText("Check sign 4", { exact: true }).press("Enter");
    await worksheet.getByRole("link", { name: "Practice the sign group for Speed Limit" }).press("Enter");
    await page.waitForURL(url => url.searchParams.get("return") === "worksheet-sign-4");
    const quiz = page.locator('[data-mode-panel="road-signs-core"].is-active [data-quiz]');
    const count = await quiz.locator("[data-quiz-jump]").count();
    assert.ok(count > 0 && count < 40);
    for (const jump of await quiz.locator("[data-quiz-jump]").all()) {
      await jump.press("Enter");
      const question = quiz.locator(".question.is-active");
      const key = await question.getAttribute("data-answer");
      await question.locator(`button[data-choice="${key}"]`).press("Enter");
    }
    assert.match(await quiz.locator("[data-quiz-result]").textContent(), new RegExp(`${count} (of|/) ${count}`));
    const link = quiz.getByRole("link", { name: "Return to this worksheet answer", exact: true });
    if (process.env.VERIFY_SCREENSHOTS_DIR) {
      await quiz.locator(".quiz-next-plan").screenshot({
        path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, "worksheet-quiz-return-1280.png"),
      });
    }
    await link.press("Enter");
    await page.waitForURL(url => url.hash === "#worksheet-sign-4");
    assert.match(await page.locator("#worksheet-sign-4:focus").innerText(), /Speed Limit.*posted legal maximum/);
  }));

test("a 40-question recorded score opens the full round, and group links do not change print layout", () =>
  withSheet(390, async page => {
    const link = page.getByRole("link", { name: "Start the full 40-question round", exact: true });
    assert.equal(await link.count(), 1);
    await page.emulateMedia({ media: "print" });
    const legend = page.locator(".cheat-legend");
    assert.deepEqual(await legend.locator("strong").allTextContents(), [
      "Red", "Yellow", "Orange", "Yellow-green", "White", "Blue",
    ]);
    assert.match(await legend.innerText(), /Orange\s+Temporary traffic control/);
    assert.match(await legend.innerText(), /Yellow-green\s+School warnings and some pedestrian or bicycle warnings/);
    assert.match(await page.locator(".cheat-legend-note").innerText(), /does not set a school speed limit/);
    assert.deepEqual(await page.locator(".cheat-legend .legend-swatch").evaluateAll(nodes =>
      nodes.map(node => getComputedStyle(node).printColorAdjust)), Array(6).fill("exact"));
    assert.equal(await legend.locator(".legend-orange").evaluate(node => getComputedStyle(node).backgroundColor), "rgb(245, 158, 46)");
    assert.equal(await legend.locator(".legend-yellow-green").evaluate(node => getComputedStyle(node).backgroundColor), "rgb(199, 230, 68)");
    assert.equal(await page.locator("#printable-sheet").isVisible(), true);
    assert.equal(await page.locator(".cheat-group-practice-link").first().isVisible(), false);
    assert.equal(await link.isVisible(), false);
    await page.emulateMedia({ media: "screen" });
    await link.click();
    const quiz = page.locator('[data-mode-panel="road-signs-core"].is-active [data-quiz]');
    await quiz.waitFor({ state: "visible" });
    assert.match(await quiz.locator("[data-quiz-position]").textContent(), /Question 1 of 40/);
  }));

for (const width of [390, 1280]) {
  test(`${width}px: a worksheet explanation leads to a focused round and back to the same answer`, () =>
    withSheet(width, async page => {
      page.setDefaultTimeout(6000);
      const cases = [
        [1, "Check decision 1", "Compare STOP and YIELD", "stop-yield", "worksheet-decision-1"],
        [1, "Check decision 2", "Compare STOP and YIELD", "stop-yield", "worksheet-decision-2"],
        [1, "Check decision 3", "Compare Merge and Lane Ends", "merge-lane-ends", "worksheet-decision-3"],
        [2, "Check your reasoning", "Try the Added Lane comparison", "merge-lane-ends", "worksheet-transfer"],
      ];
      for (const [partIndex, answerName, reviewName, concept, answerId] of cases) {
        await page.goto(worksheetUrl);
        const part = page.locator("#online-worksheet .worksheet-part").nth(partIndex);
        if (!(await part.evaluate(node => node.open))) await part.locator(":scope > summary").press("Enter");
        const answer = part.locator("details").filter({
          has: page.getByText(answerName, { exact: true }),
        });
        if (!(await answer.evaluate(node => node.open))) await answer.getByText(answerName, { exact: true }).press("Enter");
        await answer.getByRole("link", { name: reviewName, exact: true }).press("Enter");
        await page.waitForURL(url => url.hash === `#lesson-${concept}`);
        const lesson = page.locator(`#lesson-${concept}`);
        const start = lesson.getByRole("link", { name: "Practice this distinction", exact: true });
        assert.equal(await start.count(), 1, "the related explanation has a visible next step");
        await start.press("Enter");
        await page.waitForURL(url => url.hash === "#learning-loop" && url.searchParams.get("concept") === concept);
        const progress = page.locator("[data-loop-progress]");
        if (answerId === "worksheet-decision-1" || answerId === "worksheet-decision-3") {
          assert.equal(await progress.textContent(), "0 of 3 questions");
          for (let i = 0; i < 3; i++) {
            await page.locator('[data-loop-option="0"]').press("Enter");
            await page.locator("[data-loop-next]").press("Enter");
            await page.locator("[data-loop-next]").press("Enter");
          }
        }
        assert.equal(await progress.textContent(), "3 of 3 questions");
        await page.getByRole("link", { name: "Return to this worksheet answer", exact: true }).press("Enter");
        await page.waitForURL(url => url.pathname.endsWith("/dmv-road-signs-cheat-sheet.html") && url.hash === `#${answerId}`);
        assert.equal(await answer.getByText(answerName, { exact: true }).isVisible(), true);
        assert.equal(await answer.getByRole("link", { name: reviewName, exact: true }).isVisible(), true);
        const destination = page.locator(`#${answerId}`);
        assert.equal(await destination.evaluate(node => document.activeElement === node), true);
        const { y } = await destination.boundingBox();
        const header = await page.locator(".site-header").boundingBox();
        assert.ok(y >= header.y + header.height, "the returned answer is not hidden under navigation");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
    }));
}
