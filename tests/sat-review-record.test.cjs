const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const url = pathToFileURL(path.resolve(__dirname, "../sat-practice-test-review-template.html")).href;
const scoringGuide = pathToFileURL(path.resolve(__dirname, "../digital-sat-scoring-explained.html")).href;
const template = [
  "Test / module / question:",
  "Section / domain / skill:",
  "Missed, guessed, or slow:",
  "My answer and why I chose it:",
  "Correct answer and reasoning:",
  "Next drill (skill and action):",
  "Recheck (when and on which new questions):",
  "Recheck result and next step:",
].join("\n");
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function withPage(options, setup, run) {
  const context = await browser.newContext(options);
  try {
    await context.route(/^https?:/, (route) => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    if (setup) await page.addInitScript(setup);
    await page.goto(url);
    await run(page);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

const record = (page) => page.getByRole("textbox", { name: "Blank review record" });
const copy = (page) => page.getByRole("button", { name: "Copy blank record" });
const footprint = (page) => page.evaluate(() => ({
  events: (window.dataLayer || []).filter((entry) => entry[0] === "event").length,
  stored: Object.entries(localStorage),
}));

test("copies only the blank record without adding analytics or storage", () => withPage({}, () => {
  Object.defineProperty(navigator, "clipboard", { value: {
    async writeText(text) { window.copiedRecord = text; },
  } });
}, async (page) => {
  const initial = await footprint(page);
  assert.equal(await record(page).inputValue(), template);
  assert.equal(await record(page).isEditable(), false);
  await copy(page).focus();
  await copy(page).press("Enter");
  await page.getByText("Blank record copied.").waitFor();
  assert.equal(await page.evaluate(() => window.copiedRecord), template);
  assert.deepEqual(await footprint(page), initial);
}));

test("selects the entire note when automatic copy is unavailable", () => withPage({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
}, () => {
  Object.defineProperty(navigator, "clipboard", { value: {
    async writeText() { throw new Error("Clipboard blocked"); },
  } });
}, async (page) => {
  await copy(page).tap();
  await page.getByText("Automatic copy is unavailable. Copy the selected text.").waitFor();
  assert.deepEqual(await record(page).evaluate((input) => [
    document.activeElement === input, input.selectionStart, input.selectionEnd,
  ]), [true, 0, template.length]);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}));

test("shows the worksheet, both examples, and official next steps without JavaScript", () => withPage({
  viewport: { width: 320, height: 750 }, javaScriptEnabled: false,
}, null, async (page) => {
  assert.equal(await record(page).isVisible(), true);
  assert.equal(await record(page).inputValue(), template);
  assert.equal(await page.locator("[data-sat-review-copy]").isVisible(), false);

  const examples = page.getByRole("region", { name: "Two filled review records" }).getByRole("article");
  assert.equal(await examples.count(), 2);
  assert.match(await examples.nth(0).innerText(), /Linear equations in one variable[\s\S]*x = 7[\s\S]*three unseen equations[\s\S]*mixed algebra set/);
  assert.match(await examples.nth(1).innerText(), /Expression of Ideas \/ Transitions[\s\S]*Guessed correctly[\s\S]*Therefore[\s\S]*three unseen transition questions/);
  assert.equal(await page.getByRole("link", { name: "My Practice", exact: true }).getAttribute("href"), "https://mypractice.collegeboard.org/");
  assert.equal(await page.getByRole("link", { name: "Student Question Bank", exact: true }).getAttribute("href"), "https://satsuite.collegeboard.org/practice/student-question-bank");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}));

for (const width of [320, 1280]) {
  test(`${width}px: scoring cases separate counts, routes and reported scores, then reach the review record`, () =>
    withPage({ viewport: { width, height: 850 }, javaScriptEnabled: false }, null, async page => {
      await page.goto(scoringGuide);
      const section = page.locator(".tool-block").filter({
        has: page.getByRole("heading", { name: /Questions shown versus questions scored/ }),
      });
      const counts = section.getByRole("table");
      assert.match(await counts.getByRole("row", { name: /Reading and Writing/ }).innerText(),
        /54 \(27 per module\).*50 \(25 per module\)/s);
      assert.match(await counts.getByRole("row", { name: /Math/ }).innerText(),
        /44 \(22 per module\).*40 \(20 per module\)/s);

      await page.getByRole("link", { name: "Try three scoring cases", exact: true }).press("Enter");
      await page.waitForURL(scoringGuide + "#sat-scoring-cases");
      const cases = page.locator("#sat-scoring-cases");
      const heading = await cases.locator("h2").boundingBox();
      const header = await page.locator(".site-header").boundingBox();
      assert.ok(heading.y >= header.y + header.height && heading.y < 850);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.equal(await cases.locator("article").count(), 3);
      const scoringSource = "https://satsuite.collegeboard.org/scores/what-scores-mean/how-scores-calculated";
      const expectations = [
        [/same questions correctly.*pattern of responses/is, /same sitting.*1,330 total/is, scoringSource],
        [/both second-module routes.*score uses responses.*both modules/is, /Use the reported section scores/is, scoringSource],
        [/two pretest questions in each module.*does not tell you where/is, /50 are used.*count, not the positions/is,
          "https://satsuite.collegeboard.org/media/pdf/assessment-framework-for-digital-sat-suite.pdf"],
      ];
      for (const [index, [reason, answer, source]] of expectations.entries()) {
        const card = cases.locator("article").nth(index);
        const reasoning = card.locator("details").first();
        const check = card.locator("details").last();
        assert.equal(await reasoning.locator("li").first().isVisible(), false);
        assert.equal(await check.locator("p").isVisible(), false);
        await reasoning.locator("summary").press("Enter");
        assert.match(await reasoning.innerText(), reason);
        assert.equal(await check.locator("p").isVisible(), false);
        await check.locator("summary").press("Enter");
        assert.match(await check.innerText(), answer);
        assert.equal(await card.getByRole("link").getAttribute("href"), source);
      }
      await page.getByRole("link", { name: "Open the practice-test review record", exact: true }).press("Enter");
      await page.waitForURL(url + "#sat-review-record");
      assert.equal(await record(page).inputValue(), template);
      assert.equal(await record(page).isVisible(), true);
    }));
}
