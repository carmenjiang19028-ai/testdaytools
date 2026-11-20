const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { chromium } = require("playwright");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const fs = require("node:fs");

let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome" }); });
after(async () => { await browser?.close(); });

const active = page => page.locator("[data-flashcard].is-active");
const reveal = page => active(page).locator("[data-flashcard-flip]");
const known = page => page.locator("[data-flashcard-known-button]");
const review = page => page.locator("[data-flashcard-review-button]");
const queue = page => page.locator("[data-flashcard-filter]");
const marked = page => page.evaluate(() => window.dataLayer.filter(event => event[0] === "event" && event[1] === "flashcard_mark").length);

async function withDeck(width, run, seed = null) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.route(/^https?:/, route => route.abort());
  if (seed) {
    await context.addInitScript(stored => {
      const key = "tdt-road-sign-flashcards";
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(stored));
    }, seed);
  }
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, "../dmv-road-sign-flashcards.html")).href);
    await run(page);
    assert.deepEqual(errors, []);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  } finally { await context.close(); }
}

for (const width of [390, 1280]) {
  test(`${width}px: picture clues precede the answer and keyboard reveal does not record a mark`, () =>
    withDeck(width, async page => {
      await page.getByRole("searchbox", { name: "Search cards" }).fill("lane ends");
      const card = active(page);
      assert.equal(await card.getAttribute("data-card-id"), "lane-ends");
      assert.equal(await reveal(page).getAttribute("aria-expanded"), "false");
      assert.equal(await card.getByRole("img", { name: /yellow diamond.*lines/i }).count(), 1);
      assert.equal(await card.locator(".flashcard-front strong").count(), 0);
      assert.equal(await card.getByText("Lane Ends", { exact: true }).isVisible(), false);
      assert.equal(await known(page).isDisabled(), true);
      assert.equal(await review(page).isDisabled(), true);
      if (process.env.VERIFY_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
        await card.scrollIntoViewIfNeeded();
        await card.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `recall-${width}.png`) });
      }
      await reveal(page).press("Enter");
      assert.equal(await reveal(page).getAttribute("aria-expanded"), "true");
      assert.equal(await card.getByText("Lane Ends", { exact: true }).isVisible(), true);
      assert.equal(await card.getByRole("img").count(), 0);
      assert.equal(await marked(page), 0);
      assert.equal(await review(page).isEnabled(), true);
      await review(page).click();
      assert.equal(await marked(page), 1);
      assert.equal(await page.locator("[data-flashcard-review]").textContent(), "1");
    }));
}

test("saved review cards can be revisited, and a known card leaves the saved queue", () =>
  withDeck(390, async page => {
    assert.equal(await queue(page).locator('option[value="review"]').count(), 1);
    await queue(page).selectOption("review");
    assert.equal(await active(page).getAttribute("data-card-id"), "merge");
    assert.equal(await page.locator("[data-flashcard-visible]").textContent(), "2");
    await reveal(page).click();
    await page.locator("[data-flashcard-next]").click();
    assert.equal(await active(page).getAttribute("data-card-id"), "lane-ends");
    assert.equal(await reveal(page).getAttribute("aria-expanded"), "false");
    await reveal(page).click();
    await known(page).click();
    assert.equal(await active(page).getAttribute("data-card-id"), "merge");
    assert.equal(await reveal(page).getAttribute("aria-expanded"), "false");
    assert.equal(await page.locator("[data-flashcard-visible]").textContent(), "1");
    await page.reload();
    await queue(page).selectOption("review");
    assert.equal(await active(page).getAttribute("data-card-id"), "merge");
    await reveal(page).click();
    await known(page).click();
    assert.equal(await page.locator("[data-flashcard-visible]").textContent(), "0");
    assert.match(await page.locator("[data-flashcard-empty]").textContent(), /No saved review cards/);
    assert.equal(await known(page).isDisabled(), true);
  }, { known: ["stop"], review: ["merge", "lane-ends"], updatedAt: 1 }));

test("a flashcard opens the same picture group as the printable reference", () =>
  withDeck(1280, async page => {
    await page.getByRole("searchbox", { name: "Search cards" }).fill("hospital");
    await active(page).getByRole("link", { name: "Practice this group" }).click();
    await page.waitForURL(url => url.searchParams.get("focus") === "sheet-school-work-service");
    assert.match(await page.locator("[data-mode-panel].is-active [data-quiz-position]").textContent(), /of 7/);
  }));
