const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { after, before, test } = require("node:test");
const { chromium } = require("playwright");

let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome" }); });
after(async () => { await browser?.close(); });

const file = page => pathToFileURL(path.resolve(__dirname, "..", page + ".html")).href;
const anchor = "school-crossing-location";

for (const width of [320, 1280]) {
  test(`${width}px: study both crossing assemblies from the existing reference without JavaScript`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: false });
    await context.route(/^https?:/, route => route.abort());
    try {
      const page = await context.newPage();
      for (const from of ["dmv-road-signs-cheat-sheet", "road-signs-practice-test"]) {
        await page.goto(file(from));
        await page.getByRole("link", { name: "Compare school crossing plaques with pictures" }).click();
        await page.waitForURL(file("road-sign-shapes-and-colors-finder") + "#" + anchor);
      }
      const section = page.locator("#" + anchor);
      const heading = await section.getByRole("heading").boundingBox();
      const header = await page.locator(".site-header").boundingBox();
      assert.ok(heading.y >= header.y + header.height);
      const ahead = section.getByRole("img", { name: /AHEAD plaque/ });
      const arrow = section.getByRole("img", { name: /arrow pointing diagonally down and left/ });
      assert.equal(await ahead.locator("svg").count(), 2);
      assert.equal(await ahead.locator("svg text").textContent(), "AHEAD");
      const head = await arrow.locator("svg").last().locator("path").evaluate(path => {
        const start = path.getPointAtLength(0);
        const end = path.getPointAtLength(Math.hypot(24, 25));
        return [end.x < start.x, end.y > start.y];
      });
      assert.deepEqual(head, [true, true]);
      assert.deepEqual(await section.locator("svg rect").evaluateAll(rects =>
        rects.map(rect => rect.getAttribute("fill"))), ["#c7e644", "#c7e644"]);
      assert.ok((await ahead.boundingBox()).height > 65);
      assert.ok((await arrow.boundingBox()).height > 65);
      const exact = section.getByText("A warns before the crossing. B marks the crossing location.");
      assert.equal(await exact.isVisible(), false);
      await section.getByText("Check where the crossing is").press("Enter");
      assert.equal(await exact.isVisible(), true);
      await section.getByText("Does either plaque set a speed limit?").press("Enter");
      assert.equal(await section.getByText(/Look for a separate speed-limit sign/).isVisible(), true);
      assert.match(await section.getByRole("link", { name: /FHWA/ }).getAttribute("href"), /part7r1\.pdf$/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      if (process.env.VERIFY_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
        await section.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `crossing-location-${width}.png`) });
      }
    } finally {
      await context.close();
    }
  });
}
