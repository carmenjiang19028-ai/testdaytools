const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const origin = "http://testdaytools.test";
const url = origin + "/sat-superscore-guide.html";
const control = (page, name) => page.locator(`[data-superscore-${name}]`);
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function withComparison(width, run, javaScriptEnabled = true) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled });
  try {
    await context.route(/^https?:/, route => route.abort());
    await context.route(origin + "/**", route => {
      const name = new URL(route.request().url()).pathname.slice(1);
      return route.fulfill({ path: path.join(root, name) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(url);
    await run(page);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

const scores = (page, index) => control(page, "sitting").nth(index).locator("input");
async function fillPair(page, index, rw, math) {
  await scores(page, index).nth(0).fill(String(rw));
  await scores(page, index).nth(1).fill(String(math));
}

for (const width of [360, 1280]) {
  test(`${width}px: compare the two official score reports without claiming an unverified college accepts the combination`, () =>
    withComparison(width, async page => {
      const requests = [];
      page.on("request", request => {
        if (request.url() !== origin + "/favicon.svg") requests.push(request.url());
      });
      const snapshot = await page.evaluate(() => ({
        local: Object.entries(localStorage),
        session: Object.entries(sessionStorage),
        commands: JSON.stringify(window.dataLayer || []),
      }));
      assert.equal(await control(page, "single").textContent(), "--");
      assert.equal(await page.locator("[data-sat-superscore] form :is(input, select)[name]").count(), 0);
      await fillPair(page, 0, 680, 640);
      assert.equal(await control(page, "single").textContent(), "1,320");
      assert.match(await control(page, "status").textContent(), /One sitting/);
      await fillPair(page, 1, 650, 710);
      assert.equal(await control(page, "single").textContent(), "1,360");
      assert.equal(await control(page, "single-source").textContent(), "Sitting 2");
      assert.equal(await control(page, "combined").textContent(), "1,390");
      assert.match(await control(page, "combined-source").textContent(), /680.*Sitting 1.*710.*Sitting 2/);
      assert.match(await control(page, "status").textContent(), /30 points higher/);
      assert.match(await control(page, "guidance").textContent(), /Verify the college/);
      await control(page, "policy").selectOption("single");
      assert.match(await control(page, "guidance").textContent(), /Use the single-date total/);
      await control(page, "policy").selectOption("combined");
      assert.match(await control(page, "guidance").textContent(), /complete reports that include both highs/);
      await page.getByRole("button", { name: "Compare scores" }).click();
      assert.equal(page.url(), url);
      assert.equal(await page.locator(".sat-superscore-result").evaluate(result => result === document.activeElement), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      assert.deepEqual(await page.evaluate(() => ({
        local: Object.entries(localStorage),
        session: Object.entries(sessionStorage),
        commands: JSON.stringify(window.dataLayer || []),
      })), snapshot);
      assert.deepEqual(requests, []);
      const shots = process.env.SAT_COMPARE_SHOTS;
      if (shots) {
        await page.locator("#sat-superscore-compare").screenshot({ path: path.join(shots, `comparison-${width}.png`) });
      }
    }));

  test(`${width}px: do not combine a partial or invalid report, preserve ties and clear the comparison on reset`, () =>
    withComparison(width, async page => {
      await fillPair(page, 0, 800, 200);
      await fillPair(page, 1, 200, 800);
      assert.equal(await control(page, "single-source").textContent(), "Sitting 1 / Sitting 2");
      assert.equal(await control(page, "combined").textContent(), "1,600");
      await scores(page, 2).nth(0).fill("800");
      assert.equal(await control(page, "combined").textContent(), "--");
      await page.getByRole("button", { name: "Compare scores" }).click();
      const missing = scores(page, 2).nth(1);
      assert.equal(await missing.getAttribute("aria-invalid"), "true");
      assert.equal(await missing.evaluate(input => input === document.activeElement), true);
      for (const invalid of ["190", "805", "705", "700.5"]) {
        await missing.fill(invalid);
        assert.equal(await control(page, "single").textContent(), "--", invalid);
        assert.equal(await missing.getAttribute("aria-invalid"), "true", invalid);
      }
      await missing.fill("800");
      await control(page, "policy").selectOption("combined");
      assert.equal(await control(page, "single").textContent(), "1,600");
      assert.match(await control(page, "guidance").textContent(), /One date can supply both highs: Sitting 3/);
      assert.match(await control(page, "status").textContent(), /does not increase/);
      await page.getByRole("button", { name: "Clear scores" }).click();
      assert.equal(await control(page, "combined").textContent(), "--");
      assert.equal(await control(page, "policy").inputValue(), "unknown");
      assert.equal(await page.locator("#sat-superscore-compare [aria-invalid]").count(), 0);
    }));
}

test("a whole-report example and primary-source links are available without JavaScript", () =>
  withComparison(360, async page => {
    const example = page.locator("section").filter({
      has: page.getByRole("heading", { name: /^Worked example:/ }),
    }).locator("table");
    assert.match(await example.textContent(), /1,320.*1,360.*1,390/s);
    assert.match(await page.locator("main").textContent(), /scores by test date, not by section/);
    assert.equal(await page.getByRole("link", { name: /why SAT score sends include the whole test date/i }).count(), 1);
    assert.equal(await page.getByRole("link", { name: /Yale Undergraduate Admissions/ }).count(), 1);
    assert.equal(await page.getByRole("link", { name: /Georgetown Undergraduate Admissions/ }).count(), 1);
    assert.match(await page.locator("#sat-superscore-compare noscript").textContent(), /worked score comparison/);
  }, false));
