const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const url = pathToFileURL(path.resolve(__dirname, "../sat-test-day-timing-guide.html")).href;
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function withPage(width, javaScriptEnabled, run) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await context.route(/^https?:/, route => route.abort());
    await page.goto(url);
    await run(page, page.locator("#sat-arrival-plan"));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

const setFields = async (tool, values) => {
  for (const [index, field] of ["time", "travel", "walk", "buffer"].entries()) {
    await tool.locator(`[data-arrival-${field}]`).fill(values[index]);
  }
};

const times = tool => tool.locator("[data-arrival-result] li span").allTextContents();

for (const width of [390, 1280]) {
  test(`${width}px: use the actual arrival time once and calculate departure, site, and check-in`, () =>
    withPage(width, true, async (page, tool) => {
      await page.getByRole("link", { name: "Plan your departure", exact: true }).press("Enter");
      await page.waitForURL(url + "#sat-arrival-plan");
      const heading = await tool.getByRole("heading", { level: 2 }).boundingBox();
      const header = await page.locator(".site-header").boundingBox();
      assert.ok(heading.y >= header.y + header.height);
      const snapshot = () => page.evaluate(() => [Object.entries(localStorage), Object.entries(sessionStorage), window.dataLayer?.length]);
      const before = await snapshot();
      const calculate = tool.getByRole("button", { name: "Calculate departure" });
      await calculate.press("Enter");
      assert.equal(await tool.locator("[data-arrival-time]:focus").getAttribute("aria-invalid"), "true");
      assert.equal(await tool.locator("[data-arrival-result]").isVisible(), false);
      await setFields(tool, ["07:45", "32", "8", "10"]);
      await calculate.press("Enter");
      assert.deepEqual(await times(tool), ["6:55 AM", "7:27 AM", "7:35 AM"]);
      assert.match(await tool.getByRole("status").innerText(), /10-minute buffer/);
      await tool.getByLabel("Confirmed arrival time").fill("07:15");
      assert.equal(await tool.locator("[data-arrival-result]").isVisible(), false);
      await calculate.press("Enter");
      assert.deepEqual(await times(tool), ["6:25 AM", "6:57 AM", "7:05 AM"]);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      assert.deepEqual(await snapshot(), before);
      if (process.env.VERIFY_SCREENSHOTS_DIR) {
        await tool.evaluate(element => element.scrollIntoView({ block: "start" }));
        await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `arrival-${width}.png`) });
        if (width === 390) {
          await tool.getByRole("status").evaluate(element => element.scrollIntoView({ block: "center" }));
          await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, "arrival-result-390.png") });
        }
      }
    }));
}

test("midnight rollover is explicit and invalid inputs cannot retain a calculated plan", () =>
  withPage(390, true, async (page, tool) => {
    await page.setViewportSize({ width: 390, height: 620 });
    const calculate = tool.getByRole("button", { name: "Calculate departure" });
    await setFields(tool, ["00:10", "35", "5", "10"]);
    await calculate.click();
    assert.deepEqual(await times(tool), ["11:20 PM (previous day)", "11:55 PM (previous day)", "12:00 AM"]);
    const status = await tool.getByRole("status").boundingBox();
    const header = await page.locator(".site-header").boundingBox();
    assert.ok(status.y >= header.y + header.height && status.y + status.height <= 620);
    const travel = tool.getByLabel("Travel to the site");
    for (const value of ["", "-1", "4.5", "721"]) {
      await travel.fill(value);
      assert.equal(await tool.locator("[data-arrival-result]").isVisible(), false);
      await calculate.click();
      assert.equal(await travel.getAttribute("aria-invalid"), "true");
      assert.match(await tool.getByRole("status").innerText(), /whole number of minutes/);
    }
    await setFields(tool, ["12:00", "0", "0", "0"]);
    await calculate.click();
    assert.deepEqual(await times(tool), ["12:00 PM", "12:00 PM", "12:00 PM"]);
    assert.match(await tool.getByRole("status").innerText(), /No extra buffer/);
  }));

test("examples, the source links and the within-module rule work without JavaScript", () =>
  withPage(390, false, async (page, tool) => {
    assert.equal(await tool.getByRole("button", { name: "Calculate departure" }).count(), 0);
    await page.getByRole("link", { name: "See arrival examples" }).press("Enter");
    await page.waitForURL(url + "#sat-arrival-cases");
    const examples = page.locator("#sat-arrival-cases");
    assert.equal(await examples.locator("article").count(), 3);
    assert.match(await examples.innerText(), /Leave by 6:55 a.m./);
    assert.match(await examples.innerText(), /Leave by 6:25 a.m./);
    assert.match(await examples.innerText(), /Weekend defaults are not a substitute/);
    assert.equal(await page.getByRole("link", { name: "Bluebook: Time and module navigation" }).getAttribute("href"),
      "https://bluebook.collegeboard.org/help-center/how-does-timing-work-bluebook");
    const moduleTable = page.locator("section.tool-block").filter({ has: page.getByRole("heading", { name: /Standard SAT module time/ }) }).getByRole("table");
    assert.match(await moduleTable.innerText(), /32 \+ 32.*35 \+ 35/s);
    assert.match(await page.locator("main").innerText(), /marked questions do not carry over/);
  }));

test("the SAT checklist deep link lands at the arrival calculator", () =>
  withPage(390, true, async (page, tool) => {
    await page.goto(new URL("digital-sat-checklist.html", url).href);
    await page.getByRole("link", { name: "Plan your departure", exact: true }).click();
    await page.waitForURL(url + "#sat-arrival-plan");
    const heading = await tool.getByRole("heading", { level: 2 }).boundingBox();
    const header = await page.locator(".site-header").boundingBox();
    assert.ok(heading.y >= header.y + header.height);
    assert.equal(await tool.getByLabel("Confirmed arrival time").inputValue(), "");
  }));
