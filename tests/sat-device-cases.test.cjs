const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

for (const width of [390, 1280]) {
  test(`${width}px: both SAT checklists lead to readable source-backed device cases without JavaScript`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 850 }, javaScriptEnabled: false });
    try {
      await context.route(/^https?:/, route => route.abort());
      const page = await context.newPage();
      for (const [slug, link] of [["digital-sat-checklist", "Check device options"], ["digital-sat-bluebook-checklist", "Resolve a device problem"]]) {
        await page.goto(pathToFileURL(path.join(root, `${slug}.html`)).href);
        await page.getByRole("link", { name: link, exact: true }).click();
        await page.waitForURL(/sat-device-troubleshooting-guide\.html#sat-device-cases$/);
        const section = page.locator("#sat-device-cases");
        const header = page.locator(".site-header");
        assert.ok((await section.boundingBox()).y >= (await header.boundingBox()).height);
        assert.equal(await section.locator("article").count(), 3);
        const examples = section.locator("article");
        for (const [i, heading, reasoning, answer] of [
          [0, /Windows 10.*18 days/, /deadline.*already passed/, /at least 30 days/],
          [1, /Chromebook fails Verified Mode/, /school.*technology team/, /school.*sign-in instructions/],
          [2, /replacement.*admission ticket/, /complete exam setup on that replacement/, /Tell your proctor/],
        ]) {
          const example = examples.nth(i);
          assert.match(await example.locator("h3").textContent(), heading);
          await example.getByText("Show reasoning", { exact: true }).press("Enter");
          assert.match(await example.locator("details[open]").first().textContent(), reasoning);
          await example.getByText("Check", { exact: true }).press("Enter");
          assert.match(await example.locator("details[open]").last().textContent(), answer);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        assert.equal(await page.getByRole("link", { name: "Bluebook: Staff-supervised device swaps" }).count(), 1);
      }
      const images = process.env.SAT_DEVICE_SHOTS;
      if (images) await page.locator("#sat-device-cases").screenshot({ path: path.join(images, `device-cases-${width}.png`) });
    } finally {
      await context.close();
    }
  });
}
