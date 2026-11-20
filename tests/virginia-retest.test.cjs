const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { after, before, test } = require("node:test");
const { chromium } = require("playwright");

const url = pathToFileURL(path.join(__dirname, "../virginia-dmv-road-signs-practice.html")).href;
const id = "#virginia-knowledge-retest";
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome" }); });
after(async () => { await browser?.close(); });

async function withPage(width, javaScriptEnabled, run) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled });
  await context.route(/^https?:/, route => route.abort());
  const page = await context.newPage();
  try {
    await page.clock.setFixedTime(new Date("2026-11-20T03:00:00Z"));
    await page.goto(url);
    await page.getByRole("link", { name: "Check retake timing", exact: true }).click();
    await page.waitForURL(url + id);
    const tool = page.locator(id);
    const heading = await tool.getByRole("heading", { level: 2 }).boundingBox();
    const header = await page.locator(".site-header").boundingBox();
    assert.ok(heading.y >= header.y + header.height);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await run(page, tool);
  } finally { await context.close(); }
}

for (const width of [390, 1280]) {
  test(`${width}px: Virginia dates, training gate, and age transition are not conflated`, () =>
    withPage(width, true, async (page, tool) => {
      const date = tool.getByLabel("Date of most recent failure");
      const age = tool.getByLabel("Age group");
      const failures = tool.getByLabel("Official knowledge exams failed");
      const result = tool.getByRole("status");
      const submit = tool.getByRole("button", { name: "Check retake timing" });
      const analyticsBefore = await page.evaluate(() => window.dataLayer.length);

      await submit.click();
      assert.match(await result.textContent(), /Choose your age situation/);
      await age.selectOption("minor");
      await failures.selectOption("one-two");
      await submit.click();
      assert.match(await result.textContent(), /Enter a valid/);
      assert.equal(await date.getAttribute("max"), "2026-11-19");
      for (const [entered, expected] of [
        ["2026-01-01", "January 17, 2026"],
        ["2024-02-29", "March 16, 2024"],
        ["2026-03-07", "March 23, 2026"],
      ]) {
        await date.fill(entered);
        await submit.click();
        assert.ok((await result.textContent()).includes(expected), entered);
      }
      await age.selectOption("adult");
      assert.doesNotMatch(await result.textContent(), /March 23/);
      await date.fill("2026-11-19");
      await submit.click();
      assert.match(await result.textContent(), /November 20, 2026/);
      await date.fill("2026-11-20");
      await submit.click();
      assert.match(await result.textContent(), /valid past or current Virginia exam date/);
      await age.selectOption("turning");
      assert.equal(await date.isEnabled(), false);
      assert.equal(await date.inputValue(), "");
      await submit.click();
      assert.match(await result.textContent(), /does not select a date/);
      await failures.selectOption("three-plus");
      await submit.click();
      assert.match(await result.textContent(), /training after your third failure/);
      assert.doesNotMatch(await result.textContent(), /Earliest/);
      assert.equal(await page.evaluate(() => window.dataLayer.length), analyticsBefore);
      assert.equal(page.url(), url + id);
      if (process.env.VERIFY_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
        await page.getByRole("heading", {name: "Find your earliest Virginia knowledge-test retake date"}).evaluate(h =>
          h.parentElement.parentElement.scrollIntoView());
        await page.screenshot({path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `virginia-retest-${width}.png`)});
      }
    }));
}

test("Virginia retake rules and training link remain available without JavaScript", () =>
  withPage(390, false, async (_page, tool) => {
    assert.equal(await tool.getByRole("button", { name: "Check retake timing" }).count(), 0);
    assert.match(await tool.innerText(), /January 1 failure, January 17 earliest retake/);
    assert.match(await tool.getByRole("link", {name: "Virginia-approved driver training schools"}).getAttribute("href"),
      /dmv\.virginia\.gov\/licenses-ids\/training\/driver-training-schools$/);
  }));
