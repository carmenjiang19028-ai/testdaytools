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
const deckUrl = pathToFileURL(path.resolve(__dirname, "../dmv-road-sign-flashcards.html")).href;
const savedMarks = page => page.evaluate(() => JSON.parse(localStorage.getItem("tdt-road-sign-flashcards")));

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
    await page.goto(deckUrl);
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

for (const width of [320, 1280]) {
  test(`${width}px: clearing marks requires explicit confirmation and never resets another tool`, () =>
    withDeck(width, async page => {
      const reset = page.getByRole("button", { name: "Clear saved marks" });
      const dlg = page.getByRole("dialog", { name: "Clear all saved marks?" });
      const search = page.getByRole("searchbox", { name: "Search cards" });
      await queue(page).selectOption("warning");
      await search.fill("lane ends");
      await reveal(page).click();
      const other = { "tdt-dmv-test-day:california": '{"checked":["sample"]}',
        "tdt-dmv-mistake-log": '[]', "tdt-recent-practice": '{"correct":8,"total":10}' };
      await page.evaluate(entries => {
        for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
      }, other);
      const before = await savedMarks(page);
      await reset.press("Enter");
      assert.equal(await dlg.isVisible(), true);
      assert.equal(await page.locator(":focus").innerText(), "Keep my marks");
      assert.deepEqual(await savedMarks(page), before);
      if (process.env.VERIFY_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `clear-marks-${width}.png`) });
      }
      await page.keyboard.press("Escape");
      await dlg.waitFor({state: "hidden"});
      assert.deepEqual(await savedMarks(page), before);
      assert.equal(await page.locator(":focus").innerText(), "Clear saved marks");
      await reset.click();
      await dlg.getByRole("button", { name: "Keep my marks" }).click();
      assert.deepEqual(await savedMarks(page), before);
      await reset.click();
      await dlg.getByRole("button", { name: "Clear all marks" }).click();
      await page.getByText("Saved marks cleared.", { exact: true }).waitFor();
      assert.deepEqual((await savedMarks(page)).known, []);
      assert.deepEqual((await savedMarks(page)).review, []);
      assert.equal(await queue(page).inputValue(), "warning");
      assert.equal(await search.inputValue(), "lane ends");
      assert.equal(await reveal(page).getAttribute("aria-expanded"), "true");
      assert.equal(await reset.isDisabled(), true);
      assert.deepEqual(await page.evaluate(keys =>
        Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(other)), other);
      assert.equal(await marked(page), 0);
      await page.reload();
      await page.locator("[data-flashcard-reset]:disabled").waitFor();
      assert.equal(await reset.isDisabled(), true);
    }, { known: ["stop"], review: ["lane-ends"], updatedAt: 1 }));
}

test("two open tabs preserve each other's marks and update an open review queue", async () => {
  const context = await browser.newContext();
  await context.route(/^https?:/, route => route.abort());
  try {
    const a = await context.newPage();
    const b = await context.newPage();
    await a.goto(deckUrl);
    await b.goto(deckUrl);
    await queue(a).selectOption("review");
    await b.getByRole("searchbox", { name: "Search cards" }).fill("lane ends");
    await reveal(b).click();
    await review(b).click();
    await a.waitForFunction(() => document.querySelector("[data-flashcard].is-active")?.dataset.cardId === "lane-ends");
    await reveal(a).click();
    await b.getByRole("searchbox", { name: "Search cards" }).fill("hospital");
    await reveal(b).click();
    await known(b).click();
    await a.waitForFunction(() => document.querySelector("[data-flashcard-known]").textContent === "1");
    assert.equal(await reveal(a).getAttribute("aria-expanded"), "true");
    assert.deepEqual((await savedMarks(a)).known, ["hospital"]);
    assert.deepEqual((await savedMarks(a)).review, ["lane-ends"]);
    assert.equal(await marked(a), 0);
    assert.equal(await marked(b), 2);
    await known(a).click();
    await a.getByText("No saved review cards.", { exact: true }).waitFor();
    assert.deepEqual((await savedMarks(a)).known, ["hospital", "lane-ends"]);
    await b.getByRole("button", { name: "Clear saved marks" }).click();
    await b.getByRole("button", { name: "Clear all marks" }).click();
    await a.waitForFunction(() => document.querySelector("[data-flashcard-known]").textContent === "0");
    assert.equal(await marked(a), 1);
    assert.equal(await marked(b), 2);
  } finally { await context.close(); }
});

test("a failed storage write does not discard marks from the current session", async () => {
  const context = await browser.newContext();
  await context.route(/^https?:/, route => route.abort());
  await context.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "tdt-road-sign-flashcards") throw new DOMException("Unavailable", "QuotaExceededError");
      return setItem.call(this, key, value);
    };
  });
  try {
    const page = await context.newPage();
    await page.goto(deckUrl);
    const search = page.getByRole("searchbox", { name: "Search cards" });
    await search.fill("lane ends");
    await reveal(page).click();
    await review(page).click();
    assert.match(await page.locator("[data-flashcard-message]").textContent(), /^Marked for review.*stay in this session\.$/);
    await search.fill("hospital");
    await reveal(page).click();
    await known(page).click();
    assert.equal(await page.locator("[data-flashcard-known]").textContent(), "1");
    assert.equal(await page.locator("[data-flashcard-review]").textContent(), "1");
    assert.equal(await savedMarks(page), null);
    await page.getByRole("button", { name: "Clear saved marks" }).click();
    await page.getByRole("button", { name: "Clear all marks" }).click();
    await page.getByText("Marks cleared for this session only. Browser storage could not be updated.").waitFor();
  } finally { await context.close(); }
});

test("a flashcard opens the same picture group as the printable reference", () =>
  withDeck(1280, async page => {
    await page.getByRole("searchbox", { name: "Search cards" }).fill("hospital");
    await active(page).getByRole("link", { name: "Practice this group" }).click();
    await page.waitForURL(url => url.searchParams.get("focus") === "sheet-school-work-service");
    assert.match(await page.locator("[data-mode-panel].is-active [data-quiz-position]").textContent(), /of 6/);
  }));

test("the former Animal Crossing name still finds the Deer Crossing card in the warning group", () =>
  withDeck(320, async page => {
    await queue(page).selectOption("warning");
    await page.getByRole("searchbox", { name: "Search cards" }).fill("animal crossing");
    assert.equal(await active(page).getAttribute("data-card-id"), "deer-crossing");
    await reveal(page).press("Enter");
    assert.equal(await active(page).getByText("Deer Crossing", { exact: true }).isVisible(), true);
    await active(page).getByRole("link", { name: "Practice this group", exact: true }).click();
    await page.waitForURL(url => url.searchParams.get("focus") === "sheet-warning");
    assert.match(await page.locator("[data-mode-panel].is-active [data-quiz-position]").textContent(), /of 20/);
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
