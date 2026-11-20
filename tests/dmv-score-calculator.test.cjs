const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function openScore(viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  await context.route(/^https?:/, (route) => route.abort());
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.join(root, "dmv-permit-test-passing-score-calculator.html")).href);
  return { context, page };
}

const score = (page) => page.locator("[data-score-status]").textContent();
const check = (page) => page.locator("[data-score-check]").click();
const correctInput = (page) => page.locator("[data-score-input-correct]");
const totalInput = (page) => page.locator("[data-score-input-total]");
const useLength = (page) => page.locator("[data-score-use-official]");
const tracked = (page) => page.evaluate(() => (window.dataLayer || [])
  .filter((entry) => entry[0] === "event" && entry[1] === "dmv_score_checked")
  .map((entry) => entry[2]));

test("no state invents a practice score; a length shortcut cannot turn 39 correct into 40", async () => {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const { context, page } = await openScore(viewport);
    try {
      const state = page.locator("[data-score-state]");
      assert.equal(await correctInput(page).inputValue(), "");
      assert.equal(await totalInput(page).inputValue(), "");
      assert.equal(await useLength(page).isEnabled(), false);
      await state.selectOption("florida");
      assert.equal(await correctInput(page).inputValue(), "");
      await check(page);
      assert.equal(await page.locator("[data-score-next]").isVisible(), false);
      assert.equal((await tracked(page)).length, 0);
      await correctInput(page).fill("39");
      await totalInput(page).fill("40");
      await check(page);
      assert.match(await score(page), /^Above/);
      await useLength(page).click();
      assert.equal(await correctInput(page).inputValue(), "39");
      assert.equal(await totalInput(page).inputValue(), "50");
      assert.equal(await page.locator("[data-score-next]").isVisible(), false);
      await check(page);
      assert.match(await score(page), /1 more correct answer needed/);
      assert.equal((await tracked(page)).at(-1).practice_correct, 39);
      await state.selectOption("new-york");
      assert.equal(await correctInput(page).inputValue(), "");
      assert.equal(await totalInput(page).inputValue(), "");
      await useLength(page).click();
      assert.equal(await correctInput(page).inputValue(), "");
      assert.equal(await page.locator("[data-score-section]").isVisible(), true);
      await state.selectOption("california");
      await correctInput(page).fill("0");
      await totalInput(page).fill("10");
      await check(page);
      assert.match(await score(page), /8 more correct/);
    } finally { await context.close(); }
  }
});

test("New York requires the included sign score, with no false full-target result", async () => {
  const { context, page } = await openScore();
  try {
    await page.locator("[data-score-state]").selectOption("new-york");
    await useLength(page).click();
    await correctInput(page).fill("14");
    await check(page);
    assert.match(await score(page), /not checked/);
    assert.match(await page.locator("[data-score-next-link]").getAttribute("href"), /practice/);
    await page.locator("[data-score-section-correct]").fill("1");
    await check(page);
    assert.match(await score(page), /1 more road-sign answer needed/);
    await page.locator("[data-score-section-correct]").fill("2");
    await check(page);
    assert.match(await score(page), /^Meets/);
    assert.match(await page.locator("[data-score-next-link]").getAttribute("href"), /checklist/);
    assert.deepEqual((await tracked(page)).map((event) => event.result),
      ["section_unverified", "below_target", "target_met"]);
    await page.locator("[data-score-input-correct]").fill("18");
    await page.locator("[data-score-section-correct]").fill("1");
    await check(page);
    assert.match(await page.locator("[data-score-message]").textContent(), /do not match/);
    assert.equal((await tracked(page)).length, 3, "Impossible counts do not emit a checked-score event");
    assert.equal(await page.locator("[data-score-next]").isVisible(), false);
  } finally { await context.close(); }
});

for (const rule of [
  { state: "georgia", correct: "15", signs: "15", failingSigns: "14", label: "Road rules correct" },
  { state: "virginia", correct: "24", signs: "10", failingSigns: "9", label: "General knowledge correct" },
]) {
  test(`${rule.state}: each required section must reach its own target`, async () => {
    const { context, page } = await openScore();
    try {
      await page.locator("[data-score-state]").selectOption(rule.state);
      assert.equal(await page.locator("[data-score-correct-label]").textContent(), rule.label);
      assert.match(await page.locator("[data-score-length-note]").textContent(), /this section only/);
      await useLength(page).click();
      await page.locator("[data-score-input-correct]").fill(rule.correct);
      await check(page);
      assert.match(await score(page), /not checked/);
      await page.locator("[data-score-section-correct]").fill(rule.failingSigns);
      await check(page);
      assert.match(await score(page), /more road-sign/);
      await page.locator("[data-score-section-correct]").fill(rule.signs);
      await check(page);
      assert.match(await score(page), /^Meets/);
      await page.locator("[data-score-input-correct]").fill(String(Number(rule.correct) - 1));
      await check(page);
      assert.match(await score(page), /1 more correct answer needed/);
    } finally { await context.close(); }
  });
}

test("custom-length rounds do not establish separate official section targets", async () => {
  const { context, page } = await openScore();
  try {
    await page.locator("[data-score-state]").selectOption("new-york");
    await page.locator("[data-score-input-total]").fill("10");
    await page.locator("[data-score-input-correct]").fill("10");
    await check(page);
    assert.equal(await page.locator("[data-score-section]").isVisible(), false);
    assert.match(await score(page), /not checked/);
    assert.match(await page.locator("[data-score-message]").textContent(), /only checks the practice percentage/);
    assert.equal((await tracked(page))[0].result, "section_unverified");
  } finally { await context.close(); }
});

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`${viewport.width}px: published mixed-set goal and official comparison never stand in for one another`, async () => {
    const { context, page } = await openScore(viewport);
    try {
      const state = page.locator("[data-score-state]");
      const mixed = page.locator("[data-score-mixed-result]");
      assert.deepEqual(await state.locator("option[data-mixed-correct]:not([data-mixed-correct=''])").evaluateAll(options =>
        options.map(option => [option.value, Number(option.dataset.mixedQuestions), Number(option.dataset.mixedCorrect)])),
        ["california", "new-york", "florida", "pennsylvania", "new-jersey"].map(value => [value, 40, 32]));
      await state.selectOption("pennsylvania");
      await totalInput(page).fill("40");
      await correctInput(page).fill("32");
      assert.equal(await mixed.isVisible(), false);
      await check(page);
      assert.equal(await mixed.isVisible(), true);
      assert.match(await score(page), /2 more correct answers needed/);
      assert.match(await page.locator("[data-score-message]").textContent(), /not an official-format score/);
      assert.match(await mixed.textContent(), /If you took our full mixed set.*32\/40: goal met/);
      assert.match(await page.locator("[data-score-next-copy]").textContent(), /already met its practice goal/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      assert.deepEqual((await tracked(page)).map(event => event.result), ["below_target"]);
      if (process.env.SCORE_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.SCORE_SCREENSHOTS_DIR, { recursive: true });
        await page.locator(".score-panel").screenshot({ path: path.join(process.env.SCORE_SCREENSHOTS_DIR, `pennsylvania-${viewport.width}.png`) });
      }
      await state.selectOption("new-york");
      await totalInput(page).fill("40");
      await correctInput(page).fill("28");
      await check(page);
      assert.match(await score(page), /road-sign rule not checked/);
      assert.match(await mixed.textContent(), /32\/40: 4 more correct answers/);
      await correctInput(page).fill("31");
      assert.equal(await mixed.isVisible(), false);
      await check(page);
      assert.match(await mixed.textContent(), /32\/40: 1 more correct answer to reach it/);
      await useLength(page).click();
      await correctInput(page).fill("14");
      await page.locator("[data-score-section-correct]").fill("2");
      await check(page);
      assert.match(await score(page), /^Meets/);
      assert.equal(await mixed.isVisible(), false);
      await state.selectOption("ohio");
      await useLength(page).click();
      await correctInput(page).fill("30");
      await check(page);
      assert.match(await score(page), /^Meets/);
      assert.equal(await mixed.isVisible(), false, "40 questions alone do not imply a site mixed set");
    } finally { await context.close(); }
  });
}

test("single-section rules remain correct and rounded published percentages do not overstate targets", async () => {
  const { context, page } = await openScore();
  try {
    await page.locator("[data-score-state]").selectOption("florida");
    await useLength(page).click();
    await correctInput(page).fill("40");
    await check(page);
    assert.match(await score(page), /^Meets/);
    assert.equal(await page.locator("[data-score-section]").isVisible(), false);
    await page.locator("[data-score-input-correct]").fill("39");
    await check(page);
    assert.match(await score(page), /1 more correct/);
    await page.locator("[data-score-state]").selectOption("pennsylvania");
    await page.locator("[data-score-input-total]").fill("36");
    await page.locator("[data-score-input-correct]").fill("30");
    await check(page);
    assert.match(await score(page), /^Meets/);
  } finally { await context.close(); }
});

test("invalid and fractional counts do not silently become passing scores or tracked usage", async () => {
  const { context, page } = await openScore();
  try {
    await page.locator("[data-score-state]").selectOption("florida");
    for (const [correct, total] of [["", "50"], ["51", "50"], ["40.5", "50"], ["40", "0"], ["40", ""], ["-1", "50"]]) {
      await page.locator("[data-score-input-total]").fill(total);
      await page.locator("[data-score-input-correct]").fill(correct);
      await check(page);
      assert.equal(await score(page), "Check the question counts");
      assert.equal(await page.locator("[data-score-next]").isVisible(), false);
    }
    assert.equal((await tracked(page)).length, 0);
    await page.locator("[data-score-state]").selectOption("new-york");
    await useLength(page).click();
    await correctInput(page).fill("14");
    for (const signs of ["-1", "5", "2.5"]) {
      await page.locator("[data-score-section-correct]").fill(signs);
      await check(page);
      assert.equal(await score(page), "Check the question counts");
      assert.equal(await page.locator("[data-score-section-correct]").getAttribute("aria-invalid"), "true");
    }
    assert.equal((await tracked(page)).length, 0);
  } finally { await context.close(); }
});

test("state changes clear stale section scores; desktop and mobile fit", async () => {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const { context, page } = await openScore(viewport);
    try {
      for (const state of ["new-york", "georgia", "virginia", "florida"]) {
        await page.locator("[data-score-state]").selectOption(state);
        assert.equal(await page.locator("[data-score-section-correct]").inputValue(), "");
        await useLength(page).click();
        await check(page);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
        if (process.env.VERIFY_SCREENSHOTS_DIR) {
          fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
          await page.locator("[data-score-check]").scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `score-${state}-${viewport.width}.png`) });
        }
        if (state !== "florida") await page.locator("[data-score-section-correct]").fill("1");
      }
    } finally { await context.close(); }
  }
});
