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

test("mobile score and both document shortcuts follow the selected state despite stale checklist storage", () =>
  withSite(390, async (page) => {
    const home = origin + "/index.html";
    await page.goto(home);
    const readShortcuts = () => page.locator("[data-home-state-shortcut]").evaluateAll((links) =>
      links.map((link) => new URL(link.href).searchParams.get("state")));
    assert.deepEqual(await readShortcuts(), [null, null, null, null]);
    await page.locator("[data-journey-state]").selectOption("new-york");
    assert.deepEqual(await readShortcuts(), ["new-york", "new-york", "new-york", "new-york"]);
    await page.evaluate(() => localStorage.setItem("tdt-dmv-test-day:last-state", "florida"));
    await page.reload();
    const score = page.locator(".pocket-tabs").getByRole("link", { name: "Score", exact: true });
    await score.click();
    await page.waitForLoadState("load");
    const scoreUrl = new URL(page.url());
    assert.equal(scoreUrl.searchParams.get("state"), "new-york");
    assert.equal(scoreUrl.searchParams.get("source"), "home_pocket_tab");
    assert.equal(scoreUrl.hash, "#score-calculator");
    assert.equal(await page.locator("[data-score-state]").inputValue(), "new-york");
    assert.match(await page.locator("[data-score-rule]").textContent(), /14 correct out of 20.*at least 2 road-sign/);
    for (const [selector, name] of [[".pocket-tabs", "Docs"], [".home-bottom-nav", "Checklist"]]) {
      await page.goto(home);
      await page.locator(selector).getByRole("link", { name, exact: true }).click();
      await page.waitForLoadState("load");
      assert.equal(new URL(page.url()).hash, "#dmv-checklist");
      assert.equal(await page.locator("[data-dmv-checklist-state]").inputValue(), "new-york");
    }
  }));

test("the desktop checklist preview changes on state switch and preserves explicit Florida links", () =>
  withSite(1280, async (page) => {
    await page.goto(origin + "/index.html");
    const state = page.locator("[data-journey-state]");
    await state.selectOption("new-york");
    await state.selectOption("california");
    const link = page.locator("#state-paths-preview").getByRole("link", { name: "Checklist", exact: true });
    assert.match(await link.getAttribute("href"), /\?state=california#dmv-checklist$/);
    const florida = page.getByRole("link", { name: "Florida regulatory signs", exact: true });
    assert.equal(await florida.getAttribute("href"), "florida-dmv-road-signs-practice.html");
    await link.click();
    await page.waitForLoadState("load");
    assert.equal(await page.locator("[data-dmv-checklist-state]").inputValue(), "california");
  }));

test("a current homepage selection still routes correctly when browser storage is unavailable", () =>
  withSite(390, async (page) => {
    await page.addInitScript(() => {
      for (const method of ["getItem", "setItem"]) {
        Storage.prototype[method] = () => { throw new Error("Storage is unavailable"); };
      }
    });
    await page.goto(origin + "/index.html");
    await page.locator("[data-journey-state]").selectOption("new-york");
    await page.locator(".pocket-tabs").getByRole("link", { name: "Docs", exact: true }).click();
    await page.waitForLoadState("load");
    assert.equal(await page.locator("[data-dmv-checklist-state]").inputValue(), "new-york");
  }));

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

test("immediate repeats cannot skip the next-day review, and an on-time recall schedules the weekly check", () =>
  withSite(390, async (page) => {
    const practice = "/road-signs-practice-test.html?mode=road-signs-starter#practice";
    await page.goto(origin + practice);
    const round = page.locator("[data-mode-panel].is-active [data-quiz]");
    async function answerCurrent() {
      const current = round.locator(".question.is-active");
      const correct = await current.getAttribute("data-answer");
      await current.locator(`button[data-choice="${correct}"]`).click();
    }
    const record = () => page.evaluate((key) => Object.values(JSON.parse(localStorage.getItem(key)).items)[0], masteryKey);
    await answerCurrent();
    assert.equal((await record()).dueAt, now + day);
    await round.locator("[data-quiz-reset]").click();
    await answerCurrent();
    assert.equal((await record()).attempts, 2);
    assert.equal((await record()).correctStreak, 1);
    assert.equal((await record()).reliableAt, 0);
    assert.equal((await record()).dueAt, now + day);
    await page.clock.setFixedTime(now + day - 1);
    await round.locator("[data-quiz-reset]").click();
    await answerCurrent();
    assert.equal((await record()).dueAt, now + day, "early practice must not postpone the original due time");
    await page.goto(origin + "/index.html");
    assert.equal(await page.locator("[data-journey-due]").textContent(), "0 questions");

    await page.clock.setFixedTime(now + day);
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
    assert.equal((await record()).reliableAt, now + day);
    assert.equal((await record()).dueAt, now + 8 * day);
    if (process.env.VERIFY_SCREENSHOTS_DIR) {
      const panel = round.locator("[data-quiz-mastery]");
      await panel.evaluate(element => element.scrollIntoView({ block: "center" }));
      await panel.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, "weekly-390.png") });
    }
    await page.clock.setFixedTime(now + 4 * day);
    await page.goto(origin + practice);
    await answerCurrent();
    assert.equal((await record()).dueAt, now + 8 * day, "an early weekly answer does not reset the timer");

    await page.clock.setFixedTime(now + 8 * day);
    await page.goto(origin + "/dmv-practice.html");
    assert.equal(await page.locator("[data-journey-due]").textContent(), "1 question");
    await route.click();
    await answerCurrent();
    assert.equal((await record()).dueAt, now + 15 * day);
    await page.goto(origin + "/dmv-practice.html");
    assert.equal(await page.locator("[data-journey-due]").textContent(), "0 questions");
    assert.equal(await page.locator("[data-journey-reliable]").locator("..").locator("dt").textContent(), "Weekly review");
  }));

test("an incorrect answer is due now and its immediate correction requires a later recall", () =>
  withSite(1280, async (page) => {
    await page.goto(origin + "/road-signs-practice-test.html?mode=road-signs-starter#practice");
    const round = page.locator("[data-mode-panel].is-active [data-quiz]");
    const current = round.locator(".question.is-active");
    const answer = await current.getAttribute("data-answer");
    const correct = current.locator(`[data-choice="${answer}"]`);
    const record = () => page.evaluate((key) => Object.values(JSON.parse(localStorage.getItem(key)).items)[0], masteryKey);
    await current.locator(`[data-choice]:not([data-choice="${answer}"])`).first().click();
    assert.equal((await record()).dueAt, now);
    await round.locator("[data-quiz-review-mistakes]").click();
    await correct.click();
    assert.equal((await record()).misses, 1);
    assert.equal((await record()).dueAt, now + day);
    await round.locator("[data-quiz-reset]").click();
    await correct.click();
    assert.equal((await record()).reliableAt, 0);
    assert.equal((await record()).dueAt, now + day);
    assert.match(await round.locator("[data-quiz-mastery]").innerText(), /24 hours/);
    assert.match(await round.locator("[data-quiz-mastery]").innerText(), /not an exam result/);
  }));

test("an existing weekly item's date is preserved until it is checked or missed", () =>
  withSite(1280, async (page) => {
    const practice = "/road-signs-practice-test.html?mode=road-signs-starter#practice";
    await page.goto(origin + practice);
    const round = page.locator("[data-mode-panel].is-active [data-quiz]");
    const current = round.locator(".question.is-active");
    const answer = await current.getAttribute("data-answer");
    const correct = current.locator(`[data-choice="${answer}"]`);
    await correct.click();
    await page.evaluate(({ key, now, day }) => {
      const saved = JSON.parse(localStorage.getItem(key));
      Object.assign(Object.values(saved.items)[0], { correctStreak: 2, reliableAt: now, dueAt: now + 7 * day });
      localStorage.setItem(key, JSON.stringify(saved));
    }, { key: masteryKey, now, day });
    const read = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), masteryKey);
    const legacy = await read();
    await page.clock.setFixedTime(now + day);
    await page.reload();
    assert.deepEqual(await read(), legacy);
    assert.equal(await round.locator("[data-quiz-mastery-reliable]").textContent(), "1");
    if (process.env.VERIFY_SCREENSHOTS_DIR) {
      const panel = round.locator("[data-quiz-mastery]");
      await panel.evaluate(element => element.scrollIntoView({ block: "center" }));
      await panel.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, "weekly-1280.png") });
    }
    await correct.click();
    assert.equal(Object.values((await read()).items)[0].dueAt, now + 7 * day);
    await round.locator("[data-quiz-reset]").click();
    await current.locator(`[data-choice]:not([data-choice="${answer}"])`).first().click();
    const missed = Object.values((await read()).items)[0];
    assert.equal(missed.reliableAt, 0);
    assert.equal(missed.dueAt, now + day);
    assert.equal(await round.locator("[data-quiz-mastery-due]").textContent(), "1");
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

for (const width of [390, 1280]) {
  test(`${width}px: DMV planning tools distinguish mixed practice from signs`, () =>
    withSite(width, async (page) => {
      const pathFor = (slug, state) => `${origin}/dmv-permit-test-${slug}.html?state=${state}`;
      for (const state of ["texas", "illinois"]) {
        const signs = `${state}-dmv-road-signs-practice.html`;
        await page.goto(pathFor("requirements-by-state", state));
        assert.equal(await page.locator("[data-requirements-target]").textContent(), "No full mixed practice set here");
        assert.equal(await page.locator("[data-requirements-practice]").isVisible(), false);
        assert.equal(await page.locator("[data-requirements-signs]").getAttribute("href"), signs);
        assert.doesNotMatch(await page.locator("[data-requirements-format-note]").textContent(), /40-question practice target|32 of 40/);
        if (state === "texas" && process.env.VERIFY_SCREENSHOTS_DIR) {
          fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
          await page.locator(".requirements-grid").screenshot({
            path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `requirements-sign-only-${width}.png`),
          });
        }

        await page.goto(`${origin}/dmv-test-day-checklist.html?state=${state}`);
        assert.equal(await page.locator("[data-dmv-permit-link]").isVisible(), false);
        assert.equal(await page.locator("[data-dmv-sign-link]").getAttribute("href"), signs);
        assert.doesNotMatch(await page.locator("[data-dmv-exam-format]").textContent(), /40-question practice target|32 of 40/);

        await page.goto(pathFor("study-plan", state));
        assert.equal(await page.locator("[data-study-practice]").isVisible(), false);
        const recheck = page.locator("[data-study-plan-list] li").filter({ hasText: "Recheck rules and signs separately" });
        assert.equal(await recheck.getByRole("link", { name: "Recheck road signs" }).getAttribute("href"), signs);
        assert.match(await recheck.getByRole("link", { name: "Check the official manual" }).getAttribute("href"), /^https:\/\//);
        await page.locator("[data-study-days]").selectOption("3");
        const finalDay = page.locator("[data-study-plan-list] li").last();
        assert.match(await finalDay.textContent(), /earlier set of the same scope/);
        assert.equal(await finalDay.getByRole("link", { name: "Check the official manual" }).count(), 1);

        await page.goto(pathFor("passing-score-calculator", state));
        assert.equal(await page.locator("[data-score-practice]").textContent(), "Road-sign practice");
        assert.equal(await page.locator("[data-score-practice]").getAttribute("href"), signs);
        await page.locator("[data-score-input-correct]").fill("10");
        await page.locator("[data-score-input-total]").fill("20");
        await page.locator("[data-score-check]").click();
        assert.match(await page.locator("[data-score-next-copy]").textContent(), /not a full knowledge test/);
        assert.equal(await page.locator("[data-score-next-link]").getAttribute("href"), signs);
      }

      await page.goto(`${origin}/dmv-test-day-checklist.html?state=new-york`);
      assert.equal(await page.locator("[data-dmv-permit-link]").isVisible(), true);
      assert.equal(await page.locator("[data-dmv-permit-link]").getAttribute("href"), `${ny}?mode=mock#practice`);

      await page.goto(pathFor("requirements-by-state", "new-york"));
      const link = page.locator("[data-requirements-practice]");
      assert.equal(await link.textContent(), "Mixed practice");
      assert.equal(await page.locator("[data-requirements-target]").textContent(), "32 of 40 in the full mixed set");
      assert.equal(await link.getAttribute("href"), `${ny}?mode=mock#practice`);
      await link.click();
      await page.waitForLoadState("load");
      const quiz = page.locator('[data-mode-panel="mock"].is-active [data-quiz]');
      assert.equal(await quiz.getAttribute("data-total"), "40");
      assert.equal(await quiz.getAttribute("data-pass-score"), "32");
    }));
}
