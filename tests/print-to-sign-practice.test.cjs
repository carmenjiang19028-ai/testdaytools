const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { chromium } = require("playwright");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const fs = require("node:fs");

const root = path.resolve(__dirname, "..");
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
  ["Warning signs", "road-signs-practice-test", "road-signs-core", "sheet-warning", 19],
  ["School, work-zone, and service signs", "road-signs-practice-test", "road-signs-core", "sheet-school-work-service", 7],
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
