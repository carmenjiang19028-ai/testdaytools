const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { before, after, test } = require("node:test");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const origin = "http://testdaytools.test";
const sheet = origin + "/dmv-road-signs-cheat-sheet.html";
const deck = origin + "/dmv-road-sign-flashcards.html";
const selectionKey = "tdt-road-sign-sheet-selection:v1";
const marksKey = "tdt-road-sign-flashcards";
const panel = page => page.locator("[data-sheet-selection]");
const select = (page, id) => page.locator(`[data-sheet-sign][value="${id}"]`);
const selectedIds = page => page.locator("[data-sheet-sign]:checked").evaluateAll(inputs => inputs.map(input => input.value));
const currentCard = page => page.locator("[data-flashcard].is-active");
const currentId = page => currentCard(page).getAttribute("data-card-id");
const filters = page => page.locator("[data-flashcard-filter]");
let browser;

before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function withSite(width, run, javaScriptEnabled = true) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled });
  try {
    await context.route(/^https?:/, route => route.abort());
    await context.route(origin + "/**", route => route.fulfill({ path: path.join(root, new URL(route.request().url()).pathname) }));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await run(page);
    assert.deepEqual(errors, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  } finally { await context.close(); }
}

for (const width of [320, 1280]) {
  test(`${width}px: select signs across groups, review exactly those pictures, return and reset only the list`, () =>
    withSite(width, async page => {
      await page.goto(sheet + "#printable-sheet");
      const mark = { known: ["curve"], review: ["lane-ends"], updatedAt: 1 };
      await page.evaluate(({ marksKey, mark }) => localStorage.setItem(marksKey, JSON.stringify(mark)), { marksKey, mark });
      const ids = await page.locator("[data-sheet-sign]").evaluateAll(inputs => inputs.map(input => input.value));
      assert.equal(new Set(ids).size, 31);
      assert.match(await panel(page).innerText(), /No signs selected/);
      assert.equal(await panel(page).getByRole("link", { name: "Review selected flashcards" }).isVisible(), false);
      assert.equal(await select(page, "stop").getAttribute("aria-label"), "Select for review: Stop");
      await select(page, "stop").press("Space");
      await select(page, "curve").press("Space");
      await select(page, "lane-ends").press("Space");
      await select(page, "curve").press("Space");
      assert.deepEqual(await selectedIds(page), ["stop", "lane-ends"]);
      await page.reload();
      assert.deepEqual(await selectedIds(page), ["stop", "lane-ends"]);
      assert.match(await panel(page).innerText(), /2 signs selected/);
      assert.equal(await panel(page).locator("[data-sheet-sign-names]").innerText(), "Stop, Lane Ends");
      const group = page.locator(".cheat-group").filter({ has: select(page, "lane-ends") });
      await group.getByRole("link", { name: "Go to selected signs" }).press("Enter");
      await page.waitForURL(sheet + "#sheet-selection");
      const top = await panel(page).boundingBox();
      const header = await page.locator(".site-header").boundingBox();
      assert.ok(top.y >= header.y + header.height && top.y < 900);
      const snapshots = process.env.SHEET_SELECTION_SCREENSHOTS_DIR;
      if (snapshots) {
        fs.mkdirSync(snapshots, { recursive: true });
        await panel(page).screenshot({ path: path.join(snapshots, `sheet-selection-${width}.png`) });
        await select(page, "stop").locator("xpath=ancestor::article").screenshot({ path: path.join(snapshots, `sheet-card-${width}.png`) });
      }
      const openDeck = panel(page).getByRole("link", { name: "Review selected flashcards" });
      assert.equal(await openDeck.getAttribute("href"), "dmv-road-sign-flashcards.html#sheet-selection-cards");
      await openDeck.press("Enter");
      await page.waitForURL(deck + "#sheet-selection-cards", { waitUntil: "load" });
      assert.equal(await filters(page).inputValue(), "sheet");
      assert.deepEqual(await page.locator("[data-flashcard]").evaluateAll(cards => cards.map(card => card.dataset.cardId)), ids);
      assert.equal(await currentId(page), "stop");
      const second = page.locator("[data-flashcard-next]");
      assert.match(await page.locator("[data-flashcard-position]").textContent(), /1 of 2/);
      assert.equal(await currentCard(page).locator(".flashcard-back").isVisible(), false);
      await currentCard(page).getByRole("button", { name: "Reveal answer" }).press("Enter");
      assert.equal(await currentCard(page).locator(".flashcard-back").isVisible(), true);
      await second.press("Enter");
      assert.equal(await currentId(page), "lane-ends");
      assert.equal(await second.isDisabled(), true);
      assert.equal(await currentCard(page).locator(".flashcard-back").isVisible(), false);
      assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), marksKey), mark);
      assert.equal(await page.evaluate(() => window.dataLayer.filter(e => e[1] === "flashcard_mark").length), 0);
      if (snapshots) await currentCard(page).screenshot({ path: path.join(snapshots, `selected-flashcard-${width}.png`) });
      await page.getByRole("link", { name: "Back to selected signs on the sheet" }).press("Enter");
      await page.waitForURL(sheet + "#sheet-selection", { waitUntil: "load" });
      assert.deepEqual(await selectedIds(page), ["stop", "lane-ends"]);
      await panel(page).getByRole("button", { name: "Clear selection" }).press("Enter");
      assert.equal(await panel(page).getByRole("heading").evaluate(element => element === document.activeElement), true);
      assert.deepEqual(await selectedIds(page), []);
      assert.equal(await panel(page).locator("[data-sheet-sign-names]").isVisible(), false);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), selectionKey), null);
      assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), marksKey), mark);
    }));
}

test("unknown or repeated IDs never narrow other deck filters, and stale links show the normal deck", () =>
  withSite(390, async page => {
    await page.goto(sheet);
    await page.evaluate(key => localStorage.setItem(key, JSON.stringify(["curve", "curve", "not-a-card", {}])), selectionKey);
    await page.goto(deck);
    assert.equal(await filters(page).inputValue(), "all");
    assert.equal(await filters(page).locator('[value="sheet"]').count(), 0);
    await page.goto(deck + "?test=same-deck#sheet-selection-cards");
    assert.equal(await filters(page).inputValue(), "sheet");
    assert.equal(await currentId(page), "curve");
    assert.match(await page.locator("[data-flashcard-position]").textContent(), /1 of 1/);
    await filters(page).selectOption("all");
    assert.equal(await page.locator("[data-flashcard-visible]").textContent(), "31");
    await filters(page).selectOption("sheet");
    assert.equal(await currentId(page), "curve");
    await page.evaluate(key => localStorage.setItem(key, "[bad json"), selectionKey);
    await page.reload();
    assert.equal(await filters(page).inputValue(), "all");
    assert.match(await page.locator("[data-flashcard-sheet-summary]").innerText(), /regular deck is shown/);
  }));

test("another tab can clear the sheet list without clearing the deck's saved marks", () =>
  withSite(390, async page => {
    await page.goto(sheet);
    await select(page, "lane-ends").check();
    await select(page, "stop").check();
    const openDeck = await page.context().newPage();
    try {
      await openDeck.goto(deck + "#sheet-selection-cards");
      assert.equal(await openDeck.locator("[data-flashcard-visible]").textContent(), "2");
      await panel(page).getByRole("button", { name: "Clear selection" }).click();
      await openDeck.getByText("No signs are selected on the study sheet. The regular deck is shown.", { exact: true }).waitFor();
      assert.equal(await filters(openDeck).inputValue(), "all");
      assert.equal(await openDeck.locator("[data-flashcard-visible]").textContent(), "31");
    } finally { await openDeck.close(); }
  }));

test("print keeps the reference and QR link without including the digital selection controls", () =>
  withSite(390, async page => {
    await page.goto(sheet);
    await select(page, "stop").check();
    await page.emulateMedia({ media: "print" });
    assert.equal(await panel(page).isVisible(), false);
    assert.equal(await page.locator("[data-sheet-sign-picker]:visible").count(), 0);
    assert.equal(await page.locator(".cheat-sign-card:visible").count(), 31);
    assert.ok(await page.locator(".print-practice-access img").isVisible());
    await page.emulateMedia({ media: "screen" });
    assert.deepEqual(await selectedIds(page), ["stop"]);
  }));

for (const reason of ["scripts disabled", "storage blocked"]) {
  test(`${reason}: both PDF links and sign meanings remain without unavailable controls`, () =>
    withSite(320, async page => {
      if (reason === "storage blocked") {
        await page.addInitScript(() => {
          Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage blocked"); } });
        });
      }
      await page.goto(sheet);
      assert.equal(await panel(page).isVisible(), false);
      assert.equal(await page.locator("[data-sheet-sign]:visible").count(), 0);
      assert.equal(await page.locator(".cheat-sign-card:visible").count(), 31);
      assert.ok(await page.getByRole("link", { name: "Download PDF", exact: true }).isVisible());
      assert.ok(await page.getByRole("link", { name: "Classroom worksheet + answer key", exact: true }).isVisible());
    }, reason !== "scripts disabled"));
}
