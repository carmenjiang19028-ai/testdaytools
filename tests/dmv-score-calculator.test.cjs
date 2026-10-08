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
const tracked = (page) => page.evaluate(() => (window.dataLayer || [])
  .filter((entry) => entry[0] === "event" && entry[1] === "dmv_score_checked")
  .map((entry) => entry[2]));

test("New York requires the included sign score, with no false full-target result", async () => {
  const { context, page } = await openScore();
  try {
    await page.locator("[data-score-state]").selectOption("new-york");
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

test("single-section rules remain correct and rounded published percentages do not overstate targets", async () => {
  const { context, page } = await openScore();
  try {
    await page.locator("[data-score-state]").selectOption("florida");
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
