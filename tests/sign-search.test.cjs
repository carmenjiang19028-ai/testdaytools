const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { chromium } = require("playwright");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome" }); });
after(async () => { await browser?.close(); });

async function visit(file, width, check) {
  const context = await browser.newContext({ viewport: { width, height: 820 } });
  await context.route(/^https?:/, route => route.abort());
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(path.resolve(__dirname, "..", file)).href);
    await check(page);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  } finally {
    await context.close();
  }
}

const turnQueries = ["no u-turn", "no u turn", "NO U\u2013TURN", "no uturn", "turn\u00a0no u"];

for (const width of [320, 1280]) {
  for (const [file, label] of [
    ["road-signs-practice-test.html", /No U-Turn/i],
    ["road-sign-shapes-and-colors-finder.html", /Circle or slash/i],
  ]) {
    test(`${width}px: ${file} finds the same target for common U-turn spellings`, () =>
      visit(file, width, async (page) => {
        const finder = page.locator("[data-sign-lookup]").first();
        const search = finder.getByRole("searchbox");
        const results = finder.locator("[data-sign-card]:visible");
        for (const query of turnQueries) {
          await search.fill(query);
          assert.equal(await results.count(), 1, query);
          assert.match(await results.locator("strong").textContent(), label, query);
        }
        await search.fill("qzx-unmatched-example");
        assert.equal(await results.count(), 0);
        assert(await finder.locator("[data-sign-empty]").isVisible());
        assert.equal(await page.evaluate(() => JSON.stringify(window.dataLayer).includes("qzx-unmatched-example")), false);
      }));
  }

  test(`${width}px: flashcard spelling variants respect the saved review group`, () =>
    visit("dmv-road-sign-flashcards.html", width, async (page) => {
      const search = page.locator("[data-flashcard-search]");
      const active = page.locator("[data-flashcard].is-active");
      const queue = page.locator("[data-flashcard-filter]");
      const count = page.locator("[data-flashcard-visible]");
      for (const query of turnQueries) {
        await search.fill(query);
        assert.equal(await active.getAttribute("data-card-id"), "no-u-turn", query);
        assert.equal(await count.textContent(), "1", query);
      }
      await queue.selectOption("review");
      assert.equal(await count.textContent(), "0");
      await queue.selectOption("all");
      await active.locator("[data-flashcard-flip]").click();
      await page.locator("[data-flashcard-review-button]").click();
      await queue.selectOption("review");
      await search.fill("no u turn");
      assert.equal(await count.textContent(), "1");
      await search.fill("crossing railroad");
      assert.equal(await count.textContent(), "0");
      await queue.selectOption("all");
      assert.equal(await active.getAttribute("data-card-id"), "railroad");
    }));
}

test("word order is flexible but picture search still respects the selected group", () =>
  visit("road-signs-practice-test.html", 390, async (page) => {
    const finder = page.locator("[data-sign-lookup]").first();
    const search = finder.getByRole("searchbox");
    const cards = finder.locator("[data-sign-card]:visible");
    const regulatory = finder.getByRole("button", { name: "Regulatory traffic signs" });
    const warning = finder.getByRole("button", { name: "Warning signs" });
    await search.fill("crossing railroad");
    assert.equal(await cards.count(), 1);
    assert.match(await cards.locator("strong").textContent(), /Railroad Crossing Ahead/);
    await regulatory.press("Enter");
    assert.equal(await regulatory.getAttribute("aria-pressed"), "true");
    assert.equal(await warning.getAttribute("aria-pressed"), "false");
    assert.equal(await cards.count(), 0);
    await warning.press("Enter");
    assert.equal(await warning.getAttribute("aria-pressed"), "true");
    assert.equal(await cards.count(), 1);
    await search.fill("!!!");
    assert((await cards.count()) > 1);
  }));
