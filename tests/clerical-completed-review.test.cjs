const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");

const url = pathToFileURL(path.join(__dirname, "..", "clerical-checking-practice.html")).href;
const activeKey = "tdt-skills-checking-v1";
const totalsKey = "tdt-skills-checking-stats-v1";
const read = (page, key) => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const events = (page) => page.evaluate(() => window.dataLayer.filter(e => e[0] === "event").map(e => e[1]));
const feedback = (page) => page.locator("[data-feedback]");
const review = (page) => page.getByRole("region", { name: "Completed round review" });
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
  test(`${width}px: completed review preserves exact mistakes after reload without recounting`, () =>
    practice(width, async (page) => {
      const { items } = await read(page, activeKey);
      const next = page.locator("[data-next]");
      for (const [index, q] of items.entries()) {
        const answer = index === 0 ? (q.truth === "match" ? "mismatch" : "match")
          : index === 1 ? "unsure" : q.truth;
        await page.locator(`[data-answer="${answer}"]`).click();
        await next.click();
      }
      const report = review(page);
      assert.equal(await report.isVisible(), true);
      assert.equal(await page.locator(":focus").getAttribute("id"), "checking-completed-title");
      assert.match(await report.locator("[data-completed-summary]").textContent(), /12 of 12 answered: 10 correct, 1 wrong, 1 flagged/);
      const misses = await report.getByRole("listitem").allTextContents();
      assert.equal(misses.length, 2);
      for (let index = 0; index < misses.length; index++) {
        assert(misses[index].includes(`Source: ${items[index].left}`));
        assert(misses[index].includes(`Copy: ${items[index].right}`));
        assert(misses[index].includes(items[index].why));
      }
      assert.equal(await page.locator("[data-timeout]").isVisible(), false);
      assert.equal(await page.locator("[data-question]").isVisible(), false);
      assert.equal(await next.isDisabled(), true);
      assert.equal(await next.textContent(), "Round saved");
      assert.equal((await read(page, activeKey)).roundActive, false);
      const totals = await read(page, totalsKey);
      assert.equal(totals.rounds, 1);
      assert.equal(totals.correct, 10);
      assert.equal((await events(page)).filter(name => name === "skills_practice_complete").length, 1);
      if (process.env.CLERICAL_REVIEW_DIR) {
        fs.mkdirSync(process.env.CLERICAL_REVIEW_DIR, { recursive: true });
        await report.screenshot({ path: path.join(process.env.CLERICAL_REVIEW_DIR, `completed-${width}.png`) });
      }
      await page.reload();
      assert.deepEqual(await report.getByRole("listitem").allTextContents(), misses);
      await next.dispatchEvent("click");
      assert.deepEqual(await read(page, totalsKey), totals);
      assert.deepEqual(await events(page), []);
      await page.getByRole("button", { name: "New round" }).click();
      assert.equal(await report.isVisible(), false);
      assert.equal(await page.locator("[data-done]").textContent(), "0 / 12");
    }));
}

test("denied reads and writes allow a complete session with an honest result", () =>
  practice(390, async (page) => {
    const notice = page.locator("[data-checking-storage-notice]");
    await page.getByRole("radio", { name: "Untimed" }).check();
    assert.match(await notice.textContent(), /only in this visit/);
    assert.equal(await notice.isVisible(), true);
    assert.notEqual(await page.locator("#left").textContent(), "");
    const next = page.locator("[data-next]");
    for (let index = 0; index < 12; index++) {
      await page.locator('[data-answer="unsure"]').click();
      assert.equal(await feedback(page).isVisible(), true);
      await next.click();
    }
    assert.match(await review(page).textContent(), /12 flagged/);
    assert.equal(await next.textContent(), "Round complete");
    assert.match(await page.locator("[data-history]").textContent(), /^1 round/);
    await page.reload();
    assert.equal(await review(page).isVisible(), false);
    assert.equal(await page.locator("[data-done]").textContent(), "0 / 12");
  }, () => {
    for (const method of ["getItem", "setItem", "removeItem"]) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (key, ...args) {
        if (key.startsWith("tdt-skills-checking")) throw new DOMException("Unavailable", "SecurityError");
        return original.call(this, key, ...args);
      };
    }
  }));

test("a corrupt draft does not prevent practice or discard valid totals", () =>
  practice(390, async (page) => {
    assert.equal(await page.locator("[data-checking-storage-notice]").isVisible(), false);
    assert.match(await page.locator("[data-history]").textContent(), /2 saved rounds.*24 comparisons.*16 correct/);
    await page.locator('[data-answer="match"]').click();
    assert.equal(await feedback(page).isVisible(), true);
    assert.equal(await page.locator("[data-done]").textContent(), "1 / 12");
  }, () => {
    localStorage.setItem("tdt-skills-checking-v1", "{");
    localStorage.setItem("tdt-skills-checking-stats-v1", JSON.stringify({ rounds: 2, checks: 24, correct: 16, errors: { false_match: 8 } }));
  }));

test("a history write failure does not erase a saved completed review or replay it", () =>
  practice(390, async (page) => {
    const { items } = await read(page, activeKey);
    for (const q of items) {
      await page.locator(`[data-answer="${q.truth}"]`).click();
      await page.locator("[data-next]").click();
    }
    const report = review(page);
    assert.match(await report.textContent(), /Every comparison was correct/);
    assert.equal(await page.locator("[data-checking-storage-notice]").isVisible(), true);
    assert.equal((await read(page, activeKey)).roundActive, false);
    assert.equal(await read(page, totalsKey), null);
    await page.reload();
    assert.equal(await report.isVisible(), true);
    assert.match(await page.locator("[data-history]").textContent(), /No rounds in this history yet/);
    assert.deepEqual(await events(page), []);
  }, () => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "tdt-skills-checking-stats-v1") throw new DOMException("Unavailable", "QuotaExceededError");
      return write.call(this, key, value);
    };
  }));
