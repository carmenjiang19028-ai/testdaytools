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

for (const width of [390, 1280]) {
  test(`${width}px: score deadline cases are reachable and readable without JavaScript`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: false });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    try {
      await page.goto(pathToFileURL(path.join(root, "sat-score-release-guide.html")).href);
      await page.getByRole("link", { name: "Compare three deadline cases" }).click();
      assert.equal(new URL(page.url()).hash, "#score-deadline-cases");
      const cases = page.locator("#score-deadline-cases");
      const heading = await cases.locator("h2").boundingBox();
      const header = await page.locator(".site-header").boundingBox();
      assert.ok(heading.y >= header.y + header.height);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      const shots = process.env.SCORE_RELEASE_SCREENSHOTS_DIR;
      if (shots) {
        fs.mkdirSync(shots, { recursive: true });
        await page.screenshot({ path: path.join(shots, `cases-arrival-${width}.png`) });
      }
      const reasoning = cases.locator("article details:first-of-type");
      const expected = [/self-reporting field/, /5 to 10 business days.*1 to 4 business days/s, /released scores only/];
      assert.equal(await reasoning.count(), expected.length);
      for (const [index, disclosure] of (await reasoning.all()).entries()) {
        assert.equal(await disclosure.locator("ol").isVisible(), false);
        await disclosure.locator("summary").focus();
        await page.keyboard.press("Enter");
        assert.match(await disclosure.locator("ol").innerText(), expected[index]);
        assert.equal(await disclosure.locator("ol").isVisible(), true);
      }
      assert.equal(await cases.locator("button, form, input").count(), 0);
      if (shots) {
        await cases.locator("article").nth(1).evaluate(article =>
          window.scrollTo(0, article.getBoundingClientRect().top + window.scrollY - 160));
        await page.screenshot({ path: path.join(shots, `deadline-${width}.png`) });
      }
    } finally { await context.close(); }
  });
}
