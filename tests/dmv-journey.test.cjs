const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");

const origin = "http://testdaytools.test";
const root = path.resolve(__dirname, "..");
const now = Date.UTC(2026, 10, 20, 9);
const day = 86400000;
const journeyKey = "tdt-dmv-journey:v1";
const masteryKey = "tdt-dmv-mastery:v1";
const ny = "new-york-dmv-permit-practice-test.html";
const dashboard = "[data-dmv-journey]";
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function withSite(width, run) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  try {
    await context.route(/^https?:/, (route) => route.abort());
    await context.route(`${origin}/**`, (route) => {
      const { pathname } = new URL(route.request().url());
      return route.fulfill({ path: path.join(root, pathname === "/" ? "index.html" : pathname.slice(1)) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.setFixedTime(now);
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

async function finishRound(page, correctCount) {
  await page.waitForLoadState("load");
  return page.locator('[data-mode-panel="mock"].is-active [data-quiz]').evaluate((round, count) => {
    const total = Number(round.dataset.total);
    for (let i = 0; i < total; i++) {
      const question = round.querySelector(".question.is-active");
      const correct = Number(question.dataset.answer);
      const choice = i < count ? correct : (correct + 1) % 4;
      question.querySelector(`button[data-choice="${choice}"]`).click();
      if (i + 1 < total) round.querySelector("[data-quiz-forward]").click();
    }
    return round.querySelector("[data-quiz-result]").textContent;
  }, correctCount);
}

const getJourney = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), journeyKey);
const passes = (page) => page.locator(`${dashboard} [data-journey-step="passes"] [data-journey-step-status]`);

for (const width of [390, 1280]) {
  test(`${width}px: only this state's full mixed practice advances the readiness path`, () =>
    withSite(width, async (page) => {
      await page.goto(origin + "/index.html");
      const mockHref = `${ny}?mode=mock#practice`;
      const picked = {
        state: "new-york", href: mockHref, mode: "mock", fullRound: true,
        practiceTargetMet: true, total: 40, correct: 36, percent: 90, completedAt: now,
      };
      const legacy = { state: "new-york", href: mockHref, total: 40, correct: 40, percent: 100, completedAt: now };
      const oldRounds = [
        { ...picked, mode: "signs", href: `${ny}?mode=signs#practice` },
        { ...picked, mode: "quick", href: `${ny}?mode=quick#practice` },
        { ...picked, mode: "road-signs-core", href: "road-signs-practice-test.html?mode=road-signs-core#practice" },
        { ...picked, href: "florida-dmv-permit-practice-test.html?mode=mock#practice" },
        { ...picked, state: "florida" },
        { ...picked, fullRound: false },
        { ...picked, practiceTargetMet: false },
        { ...picked, completedAt: now - 15 * day },
        legacy,
      ];
      const items = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [
        `baseline-${i}`, { state: "new-york", dueAt: now + day },
      ]));
      await page.evaluate(({ oldRounds, items, journeyKey, masteryKey }) => {
        localStorage.setItem(journeyKey, JSON.stringify({ state: "new-york", sessions: oldRounds }));
        localStorage.setItem(masteryKey, JSON.stringify({ items }));
      }, { oldRounds, items, journeyKey, masteryKey });
      await page.reload();
      assert.equal(await passes(page).textContent(), "0 of 2");
      assert.deepEqual((await getJourney(page)).sessions, oldRounds);
      const next = page.locator(`${dashboard} [data-journey-primary]`);
      assert.equal(await next.getAttribute("href"), mockHref);
      assert.match(await next.textContent(), /New York mixed practice/);
      if (process.env.VERIFY_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
        await page.locator(dashboard).screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `journey-${width}.png`) });
      }
      await next.click();
      assert.equal(new URL(page.url()).searchParams.get("mode"), "mock");
      assert.match(await finishRound(page, 40), /40 of 40/);
      const first = (await getJourney(page)).sessions[0];
      assert.deepEqual([first.href, first.mode, first.fullRound, first.practiceTargetMet], [mockHref, "mock", true, true]);
      await page.goto(origin + "/dmv-practice.html");
      assert.equal(await passes(page).textContent(), "1 of 2");
      await next.click();
      await finishRound(page, 40);
      await page.goto(origin + "/index.html");
      assert.equal(await passes(page).textContent(), "2 of 2");
      assert.match(await next.getAttribute("href"), /dmv-test-day-checklist\.html\?state=new-york/);
      assert.deepEqual((await getJourney(page)).sessions.slice(2), oldRounds);
    }));
}

test("reliable questions return on the exact weekly due date and reschedule after review", () =>
  withSite(390, async (page) => {
    const practice = "/road-signs-practice-test.html?mode=road-signs-starter#practice";
    await page.goto(origin + practice);
    const round = page.locator("[data-mode-panel].is-active [data-quiz]");
    async function answerCurrent() {
      const current = round.locator(".question.is-active");
      const correct = await current.getAttribute("data-answer");
      await current.locator(`button[data-choice="${correct}"]`).click();
    }
    await answerCurrent();
    await round.locator("[data-quiz-reset]").click();
    await answerCurrent();
    const record = () => page.evaluate((key) => Object.values(JSON.parse(localStorage.getItem(key)).items)[0], masteryKey);
    assert.equal((await record()).reliableAt, now);
    assert.equal((await record()).dueAt, now + 7 * day);
    await page.clock.setFixedTime(now + 7 * day - 1);
    await page.goto(origin + "/index.html");
    assert.equal(await page.locator("[data-journey-due]").textContent(), "0 questions");

    await page.clock.setFixedTime(now + 7 * day);
    await page.reload();
    assert.equal(await page.locator("[data-journey-due]").textContent(), "1 question");
    const route = page.locator("[data-journey-review-link]");
    assert.match(await route.getAttribute("href"), /mode=road-signs-starter&focus=due/);
    await route.click();
    await page.waitForLoadState("load");
    assert.equal(await round.locator("[data-quiz-filter]").inputValue(), "due");
    assert.equal(await round.locator("[data-quiz-position]").textContent(), "Question 1 of 1");
    assert.equal(await round.locator("[data-quiz-mastery-due]").textContent(), "1");
    await answerCurrent();
    assert.equal(await round.locator("[data-quiz-mastery-due]").textContent(), "0");
    assert.equal((await record()).dueAt, now + 14 * day);
    await page.goto(origin + "/dmv-practice.html");
    assert.equal(await page.locator("[data-journey-due]").textContent(), "0 questions");
  }));

test("Texas and Illinois do not substitute a signs-only page for mixed practice", () =>
  withSite(390, async (page) => {
    await page.goto(origin + "/dmv-practice.html");
    const select = page.locator("[data-journey-state]");
    const routes = await select.locator("option").evaluateAll(options => Object.fromEntries(
      options.map(option => [option.value, option.dataset.mixedPracticeUrl]),
    ));
    assert.deepEqual(routes, {
      california: "california-dmv-permit-practice-test.html",
      "new-york": ny,
      texas: "",
      florida: "florida-dmv-permit-practice-test.html",
      illinois: "",
      pennsylvania: "pennsylvania-dmv-permit-practice-test.html",
      "new-jersey": "new-jersey-mvc-permit-practice-test.html",
    });
    const items = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [
      `baseline-${i}`, { state: "general", dueAt: now + day },
    ]));
    await page.evaluate(({ masteryKey, items }) => {
      localStorage.setItem(masteryKey, JSON.stringify({ items }));
    }, { masteryKey, items });
    for (const state of ["texas", "illinois"]) {
      await select.selectOption(state);
      assert.equal(await passes(page).textContent(), "Not available");
      assert.equal(await page.locator("[data-journey-primary]").getAttribute("href"), `dmv-test-day-checklist.html?state=${state}#dmv-checklist`);
      assert.match(await page.locator("[data-journey-source]").getAttribute("href"), /^https:\/\//);
      assert.match(await page.locator("[data-journey-copy]").textContent(), /not a full state mixed round/);
    }
  }));
