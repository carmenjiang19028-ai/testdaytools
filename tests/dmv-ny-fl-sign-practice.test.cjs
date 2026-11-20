const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const states = [
  {
    name: "New York",
    slug: "new-york-dmv",
    rounds: [["ny-four-sign-checkpoint", 4, 2], ["ny-signs-starter", 8, 6], ["signs", 25, 20]],
    fullCount: 25,
  },
  {
    name: "Florida",
    slug: "florida-dmv",
    rounds: [["florida-regulatory-starter", 8, 6], ["signs", 24, 19]],
    fullCount: 24,
  },
];
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function withSigns(state, width, run) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
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
  for (const width of [390, 1280]) {
    test(`${state.name} ${width}px study directions match the existing sign rounds`, () =>
      withSigns(state, width, async (page) => {
        const brief = await page.locator(".exam-brief").textContent();
        const steps = await page.locator(".study-path-grid").textContent();
        assert.doesNotMatch(steps, /15-question/);
        assert.match(steps, /8-question/);
        assert.match(steps, new RegExp(`${state.fullCount}-question`));
        assert.match(steps, /separate 40-question mixed practice below/);
        if (state.name === "New York") {
          assert.match(steps, /four-sign checkpoint/);
          assert.match(brief, /20 of 25 image signs/);
          const details = await page.locator("#official-details").textContent();
          assert.match(details, /20 of 25 image signs/);
          assert.doesNotMatch(brief + details, /32 of 40/);
          assert.match(details, /14 correct overall and at least 2 of the 4 road-sign questions/);
        }
        for (const [id, count, target] of state.rounds) {
          await page.locator(`[data-mode-button="${id}"]`).click();
          const quiz = page.locator(`[data-mode-panel="${id}"].is-active [data-quiz]`);
          assert.equal(await quiz.locator(".question").count(), count);
          assert.equal(await quiz.getAttribute("data-pass-score"), String(target));
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      }));

    test(`${state.name} ${width}px mixed entry opens the separate existing 40-question round`, () =>
      withSigns(state, width, async (page) => {
        const mixed = page.getByRole("link", { name: /Open the 40-question mixed practice/ });
        assert.equal(await mixed.count(), 1);
        assert.equal(await mixed.getAttribute("href"), `${state.slug}-permit-practice-test.html?mode=mock#practice`);
        const label = await mixed.textContent();
        assert.match(label, /Site practice target: 32 of 40/);
        assert.match(label, new RegExp(`separate from the ${state.fullCount}-question sign drill`));
        await mixed.click();
        await page.waitForURL((url) => url.pathname.endsWith(`/${state.slug}-permit-practice-test.html`));
        const quiz = page.locator("[data-mode-panel=mock].is-active [data-quiz]");
        await quiz.waitFor({ state: "visible" });
        assert.equal(await quiz.locator(".question").count(), 40);
        assert.equal(await quiz.getAttribute("data-pass-score"), "32");
        assert.equal(await page.locator("[data-mode-button=mock]").getAttribute("aria-selected"), "true");
      }));
  }
}

for (const width of [390, 1280]) {
  test(`Florida ${width}px grades the teen and adult course scenarios separately`, () =>
    withSigns(states[1], width, async (page) => {
      const file = pathToFileURL(path.join(root, "florida-dmv-permit-practice-test.html"));
      for (const [mode, age, course, total, target] of [
        ["quick", "16-year-old", /6-hour.*DETS/, 15, 12],
        ["mock", "22-year-old", /4-hour.*TLSAE/, 40, 32],
      ]) {
        file.searchParams.set("mode", mode);
        await page.goto(file.href);
        const quiz = page.locator(`[data-mode-panel="${mode}"].is-active [data-quiz]`);
        assert.equal(await quiz.locator(".question").count(), total);
        assert.equal(await quiz.getAttribute("data-pass-score"), String(target));
        await quiz.getByRole("button", { name: "Go to question 3", exact: true }).click();
        const q = quiz.locator(".question.is-active");
        assert.ok((await q.locator("h3").textContent()).includes(age));
        await q.getByRole("button", { name: /No course if the applicant passes/ }).click();
        assert.match(await q.locator(".feedback").textContent(), /^Not quite\..*Class E/);
        const good = q.locator("button.is-correct");
        assert.match(await good.textContent(), course);
        await quiz.locator("[data-quiz-reset]").click();
        await quiz.getByRole("button", { name: "Go to question 3", exact: true }).click();
        await q.getByRole("button", { name: course }).first().click();
        assert.match(await q.locator(".feedback").textContent(), /^Correct\./);
        assert.deepEqual(await quiz.locator("[data-quiz-correct]").allTextContents(), ["1", "1"]);
      }
    }));
}
