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

test("flashcard disclosures distinguish local card identity, measured marks and the analytics opt-out", () =>
  withDeck(390, async page => {
    await queue(page).selectOption("warning");
    await page.getByRole("searchbox", { name: "Search cards" }).fill("lane ends");
    assert.equal(await active(page).getAttribute("data-card-id"), "lane-ends");
    await reveal(page).click();
    assert.equal(await marked(page), 0);
    await known(page).click();
    await review(page).click();
    const measures = await page.evaluate(() => window.dataLayer
      .filter(event => event[0] === "event" && event[1] === "flashcard_mark")
      .map(event => event[2]));
    const visibleCards = Number(await page.locator("[data-flashcard-visible]").textContent());
    assert.deepEqual(measures.map(event => event.status), ["known", "review"]);
    for (const event of measures) {
      assert.deepEqual(Object.keys(event).sort(),
        ["filter", "page_path", "status", "tool", "transport_type", "visible_cards"]);
      assert.equal(event.filter, "warning");
      assert.equal(event.visible_cards, visibleCards);
      assert.doesNotMatch(JSON.stringify(event), /lane[- ]ends/i);
    }
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("tdt-road-sign-flashcards")));
    assert.deepEqual(saved.review, ["lane-ends"]);
    assert.deepEqual(saved.known, []);
    const faq = page.locator(".faq details").filter({ hasText: "What does the flashcard deck save or share?" });
    await faq.locator("summary").click();
    assert.match(await faq.locator("p").innerText(), /saved in this browser.*selected group.*number of cards shown.*does not include the particular card/i);

    await page.locator(".site-footer").getByRole("link", { name: "Privacy" }).click();
    const choices = page.locator("section").filter({ has: page.getByRole("heading", { name: "Flashcard use and analytics choices" }) });
    assert.match(await choices.locator("p").innerText(), /separate from Google Ads Settings/);
    const optOut = page.getByRole("link", { name: "Google Analytics opt-out browser add-on" });
    assert.equal(await optOut.getAttribute("href"), "https://support.google.com/analytics/answer/181881?hl=en");
    assert.equal(await page.getByRole("link", { name: "Google Ads Settings", exact: true }).isVisible(), true);
  }));
