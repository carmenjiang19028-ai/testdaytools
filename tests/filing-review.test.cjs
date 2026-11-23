const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");

const url = pathToFileURL(path.join(__dirname, "..", "filing-practice.html")).href;
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("tdt-skills-filing-v2")));
const next = (page) => page.getByRole("button", { name: "New question" }).click();
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome" }); });
after(async () => { await browser?.close(); });

async function practice(width, run, init) {
  const context = await browser.newContext({ viewport: { width, height: 880 } });
  await context.route(/^https?:/, route => route.abort());
  if (init) await context.addInitScript(init);
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(url);
    await run(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

for (const width of [320, 1280]) {
  test(`${width}px: wrong records and the exact rule survive a new question, rule switch and reload`, () =>
    practice(width, async (page) => {
      const rule = page.getByRole("combobox", { name: "Rule" });
      await rule.selectOption("alpha");
      const { current } = await saved(page);
      const incorrect = current.rows.findIndex(row => /-0\d$/.test(row.code));
      const chosen = current.rows[incorrect];
      const first = current.rows[current.correct];
      assert.equal(chosen.code.replace("-0", "-"), first.code);
      await page.locator("[data-choice]").nth(incorrect).press("Enter");
      assert.equal(await page.locator(":focus").getAttribute("data-feedback"), "");
      assert.match(await page.locator("[data-feedback]").textContent(), /fewer leading zeros/);

      await next(page);
      await rule.selectOption("date");
      await page.reload();
      assert.equal(await rule.inputValue(), "date");
      const details = page.locator("[data-errors] details");
      const opener = details.locator("summary");
      assert.equal(await details.count(), 1);
      assert.equal(await details.locator("p").first().isVisible(), false);
      await opener.press("Enter");
      assert.deepEqual(await details.locator("p").allTextContents(), [
        `You chose: ${chosen.code} · ${chosen.id}`,
        `File first: ${first.code} · ${first.id}`,
        `The digits have the same value (${Number(first.code.split("-")[1])}). ${first.code} comes first because its digit chunk has fewer leading zeros.`,
      ]);
      assert.equal(await page.locator("[data-done]").textContent(), "1");
      assert.deepEqual(await page.evaluate(() => window.dataLayer.filter(x => x[0] === "event")), []);
      if (process.env.FILING_REVIEW_DIR) {
        fs.mkdirSync(process.env.FILING_REVIEW_DIR, { recursive: true });
        await details.screenshot({ path: path.join(process.env.FILING_REVIEW_DIR, `review-${width}.png`) });
      }
    }));
}

test("earlier entries keep their earned counts, without invented record details", () =>
  practice(390, async (page) => {
    assert.equal(await page.locator("[data-done]").textContent(), "2");
    assert.equal(await page.locator("[data-correct]").textContent(), "1");
    assert.equal(await page.locator("[data-errors] details").count(), 0);
    assert.match(await page.locator("[data-errors]").textContent(), /Date: chose B; first was A.*not available/);
    const payload = await saved(page);
    assert.equal(payload.schema, 2);
    assert.equal(payload.history.length, 2);
  }, () => {
    localStorage.setItem("tdt-skills-filing-v1", JSON.stringify({
      history: [
        { ok: true, rule: "name", chosen: 1, correct: 1 },
        { ok: false, rule: "date", chosen: 1, correct: 0 },
      ],
    }));
  }));

test("the latest five corrections are retained without trimming practice counts", () =>
  practice(1280, async (page) => {
    for (let index = 0; index < 7; index++) {
      const { current } = await saved(page);
      await page.locator("[data-choice]").nth((current.correct + 1) % 4).click();
      if (index < 6) await next(page);
    }
    const state = await saved(page);
    assert.equal(state.history.length, 7);
    assert.equal(state.history.filter(entry => entry.review).length, 5);
    assert(!state.history[0].review && !state.history[1].review);
    await page.reload();
    assert.equal(await page.locator("[data-errors] details").count(), 5);
    assert.equal(await page.locator("[data-done]").textContent(), "7");
  }));

test("blocked storage does not stop answer feedback or the next exercise", () =>
  practice(390, async (page) => {
    const notice = page.locator("[data-filing-storage-notice]");
    assert.equal(await notice.isVisible(), true);
    assert.match(await notice.textContent(), /new results will not be saved/);
    for (let answer = 0; answer < 2; answer++) {
      await page.locator("[data-choice]").first().click();
      assert.equal(await page.locator("[data-feedback]").isVisible(), true);
      assert.equal(await page.getByRole("list", { name: "Full filing order" }).getByRole("listitem").count(), 4);
      assert.equal(await page.locator("[data-done]").textContent(), String(answer + 1));
      assert.equal(await page.locator("[data-choice]:enabled").count(), 0);
      if (answer === 0) await next(page);
    }
    assert.equal(await saved(page), null);
    await page.reload();
    assert.equal(await page.locator("[data-done]").textContent(), "0");
  }, () => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "tdt-skills-filing-v2") throw new DOMException("Unavailable", "QuotaExceededError");
      return setItem.call(this, key, value);
    };
  }));
