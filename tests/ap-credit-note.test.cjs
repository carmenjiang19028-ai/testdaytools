const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const url = pathToFileURL(path.resolve(__dirname, "../ap-credit-after-scores-guide.html")).href;
const releaseUrl = pathToFileURL(path.resolve(__dirname, "../ap-score-release-date-2026.html")).href;
const berkeley = "https://engineering.berkeley.edu/students/undergraduate-guide/exams/";
const apStudents = "https://apstudents.collegeboard.org";
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

for (const width of [320, 390, 1280]) {
  test(`${width}px: AP score sends have distinct deadlines and decisions without JavaScript`, async () => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 850 } });
    try {
      await context.route(/^https?:/, route => route.abort());
      const page = await context.newPage();
      const decisions = page.locator("#ap-score-send-cases");
      await page.goto(url);
      assert.equal(await decisions.count(), 1);
      await page.getByRole("link", { name: "Compare score-send options" }).press("Enter");
      await page.waitForURL(url + "#ap-score-send-cases");
      const cases = decisions.locator("article");
      assert.equal(await cases.count(), 3);
      assert.match(await decisions.innerText(), /June 20, 2027.*11:59 p\.m\. Eastern.*July 2027/s);
      assert.match(await cases.nth(0).innerText(), /scores from this year and earlier years/);
      assert.match(await cases.nth(1).innerText(), /\$15 per report.*\$10 per score per recipient.*not available on the free send/s);
      assert.match(await cases.nth(2).innerText(), /permanent.*June 15, 2027.*11:59 p\.m\. Eastern/s);
      assert.deepEqual(await cases.getByRole("link").evaluateAll(links => links.map(link => link.href)), [
        `${apStudents}/sending-scores/free-score-send`,
        `${apStudents}/score-reporting-services/withhold-scores`,
        `${apStudents}/score-reporting-services/cancel-scores`,
      ]);
      assert.equal(await page.evaluate(() => {
        const section = document.querySelector("#ap-score-send-cases");
        return section.getBoundingClientRect().top >= document.querySelector(".site-header").getBoundingClientRect().bottom - 1;
      }), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      if (process.env.VERIFY_SCREENSHOTS_DIR && width !== 320) {
        await decisions.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `ap-score-send-${width}.png`) });
      }
      await page.goto(releaseUrl);
      await page.getByRole("link", { name: "Compare your score-send options" }).press("Enter");
      await page.waitForURL(url + "#ap-score-send-cases");
      assert.equal(await decisions.isVisible(), true);
    } finally { await context.close(); }
  });

  test(`${width}px: policy cases and advising note work without JavaScript`, async () => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width, height: 800 },
      isMobile: width < 760,
      hasTouch: width < 760,
    });
    try {
      await context.route(/^https?:/, route => route.abort());
      const page = await context.newPage();
      await page.goto(url);
      await page.getByRole("link", { name: "See how to read a credit policy" }).press("Enter");
      await page.waitForURL(url + "#ap-credit-cases");
      const cases = page.locator("#ap-credit-cases");
      assert.equal(await cases.locator("article").count(), 3);
      assert.match(await cases.innerText(), /2\.68 units but no fulfilled requirement/);
      assert.match(await cases.innerText(), /Civil Engineering students entering Fall 2019 or later/);
      assert.match(await cases.innerText(), /consider taking MATH 52 anyway/);
      assert.deepEqual(await cases.getByRole("link").evaluateAll(links => links.map(link => link.href)),
        [berkeley, berkeley + "#apexam-note2", berkeley + "#apexam-note7"]);
      await page.getByRole("link", { name: "Open the advising note" }).press("Enter");
      await page.waitForURL(url + "#ap-credit-note");
      const note = page.getByRole("textbox", { name: "Blank advising note" });
      assert.ok(await note.isVisible());
      assert.ok(await note.evaluate(el => el.readOnly && el.form === null && !el.name));
      const value = await note.inputValue();
      assert.equal(value.split("\n").length, 8);
      assert.ok(value.split("\n").every(line => line.endsWith("___")));
      assert.match(value, /Official score report status and college deadline/);
      assert.match(value, /Exact degree requirement met, or none/);
      await note.press("ControlOrMeta+a");
      assert.equal(await note.evaluate(el => el.selectionEnd - el.selectionStart), value.length);
      const viewport = await page.evaluate(() => innerWidth);
      const box = await note.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= viewport);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (process.env.VERIFY_SCREENSHOTS_DIR && width !== 320) {
        await page.goto(url + "#ap-credit-note");
        await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `ap-credit-note-${width}.png`) });
        await page.goto(url + "#ap-credit-cases");
        await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `ap-credit-cases-${width}.png`) });
      }
    } finally {
      await context.close();
    }
  });
}
