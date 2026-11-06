const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const states = [
  { name: "Illinois", slug: "illinois-dmv" },
  { name: "Pennsylvania", slug: "pennsylvania-dmv", mixed: true },
  { name: "New Jersey", slug: "new-jersey-mvc", mixed: true },
];
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function withSigns(state, viewport, run) {
  const context = await browser.newContext({ viewport });
  try {
    await context.route(/^https?:/, (route) => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(pathToFileURL(path.join(root, `${state.slug}-road-signs-practice.html`)).href);
    await run(page);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

for (const state of states) {
  test(`${state.name} explains the shared 20-question practice without implying an official score`, () =>
    withSigns(state, { width: 390, height: 844 }, async (page) => {
      const intro = await page.locator(".tool-hero .lede").textContent();
      assert.match(intro, /shared, unofficial 20-question/);
      assert.match(intro, /16 of 20/);
      const quiz = page.locator("[data-quiz]");
      assert.equal(await quiz.count(), 1);
      assert.equal(await quiz.locator(".question").count(), 20);
      assert.equal(await quiz.getAttribute("data-pass-score"), "16");
      const context = await page.locator("#official-details").textContent();
      assert.match(context, /16 of 20/);
      assert.doesNotMatch(context, /32 of 40|long mixed round/);
      const main = await page.locator("main").textContent();
      assert.doesNotMatch(main, /15-question round|40-question mode|switch to road signs/i);
      assert.equal((main.match(/32 of 40|40-question mixed/g) || []).length, state.mixed ? 2 : 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    }));

  if (state.mixed) {
    test(`${state.name} places 32 of 40 beside a direct entry to the separate mixed round`, () =>
      withSigns(state, { width: 1280, height: 900 }, async (page) => {
        const mixed = page.getByRole("link", { name: /Open the 40-question mixed practice/ });
        assert.equal(await mixed.count(), 1);
        assert.match(await mixed.textContent(), /Site practice target: 32 of 40/);
        assert.equal(await mixed.getAttribute("href"), `${state.slug}-permit-practice-test.html?mode=mock#practice`);
        await mixed.click();
        const quiz = page.locator("[data-mode-panel=mock].is-active [data-quiz]");
        assert.equal(await quiz.locator(".question").count(), 40);
        assert.equal(await quiz.getAttribute("data-pass-score"), "32");
        assert.equal(await page.locator("[data-mode-button=mock]").getAttribute("aria-selected"), "true");
      }));
  }
}
