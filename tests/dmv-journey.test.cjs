const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");

const origin = "http://testdaytools.test";
const root = path.resolve(__dirname, "..");
const { home: homeContent, tools } = require("../content/site_data.json");
const visitChecks = tools.find(tool => tool.slug === "dmv-test-day-checklist").toolWidget.items.map(item => item.id);
const now = Date.UTC(2026, 10, 20, 9);
const day = 86400000;
const journeyKey = "tdt-dmv-journey:v1";
const masteryKey = "tdt-dmv-mastery:v1";
const ny = "new-york-dmv-permit-practice-test.html";
const dashboard = "[data-dmv-journey]";
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function withSite(width, run, options = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, ...options });
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

for (const width of [320, 1280]) {
  test(`${width}px: DMV workbench changes the official destination and never promises a mixed practice set for a guide`, () =>
    withSite(width, async (page) => {
      await page.goto(`${origin}/dmv-practice.html`);
      const picker = page.locator('[data-workbench-state]');
      const source = page.locator('[data-workbench-source]');
      const primary = page.locator('[data-workbench-primary]');
      const next = page.locator('[data-workbench-checklist]');
      const cases = [
        ['Georgia', 'dds.georgia.gov', 'Permit steps', /\/how-do-i-learners-permit$/],
        ['North Carolina', 'www.ncdot.gov', 'Permit steps', /north-carolina-dmv-road-signs-practice\.html#north-carolina-first-permit$/],
        ['Ohio', 'www.bmv.ohio.gov', 'Permit steps', /dl-identity-documents\.aspx$/],
        ['Virginia', 'www.dmv.virginia.gov', 'Permit steps', /\/learners\/apply$/],
        ['Michigan', 'www.michigan.gov', 'Permit steps', /michigan-sos-road-signs-practice\.html#michigan-test-path$/],
        ['Arizona', 'azdot.gov', 'Permit steps', /arizona-mvd-road-signs-practice\.html#arizona-permit-path$/],
      ];
      await picker.selectOption('New York');
      for (const [label, host, stepLabel, stepPattern] of cases) {
        await picker.selectOption(label);
        assert.equal(new URL(await source.getAttribute('href')).hostname, host, label);
        assert.equal(await primary.textContent(), 'Study guide', label);
        assert.equal(await next.textContent(), stepLabel, label);
        assert.match(await next.getAttribute('href'), stepPattern, label);
      }
      await page.reload();
      assert.equal(await picker.inputValue(), 'Arizona');
      assert.equal(new URL(await source.getAttribute('href')).hostname, 'azdot.gov');
      await next.click();
      await page.waitForURL(url => url.hash === '#arizona-permit-path');
      assert.ok(await page.locator('#arizona-permit-path').isVisible());
      await page.goBack();
      await picker.selectOption('Illinois');
      assert.equal(await primary.textContent(), 'Road sign practice');
      await picker.selectOption('Florida');
      assert.equal(await primary.textContent(), 'Permit practice');
      assert.equal(await next.textContent(), 'Checklist');
      assert.match(await next.getAttribute('href'), /dmv-test-day-checklist\.html\?state=florida#dmv-checklist$/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }));
}

for (const scripts of ['disabled', 'blocked']) {
  test(`workbench uses the existing state list when scripts are ${scripts}`, () =>
    withSite(320, async (page) => {
      if (scripts === 'blocked') await page.route('**/assets/app.js', route => route.abort());
      await page.goto(`${origin}/dmv-practice.html`);
      assert.equal(await page.locator('[data-workbench-state]').isDisabled(), true);
      const browse = page.getByRole('link', { name: 'Browse all state guides' });
      assert.equal(await browse.getAttribute('href'), '#state-paths');
      await browse.press('Enter');
      await page.waitForURL(url => url.hash === '#state-paths');
      const guide = page.locator('#state-paths a[href="michigan-sos-road-signs-practice.html"]');
      assert.ok(await guide.isVisible());
      await guide.press('Enter');
      await page.waitForURL('**/michigan-sos-road-signs-practice.html');
      assert.ok(await page.locator('#michigan-test-path').isVisible());
    }, { javaScriptEnabled: scripts !== 'disabled' }));
}

for (const resume of [false, true]) {
  test(`a focused score becomes one full local round ${resume ? "after resuming the next day" : "without a reload"}`, () =>
    withSite(resume ? 1280 : 390, async (page) => {
      await page.goto(`${origin}/${ny}?mode=mock&focus=Parking#practice`);
      const quiz = page.locator('[data-mode-panel="mock"].is-active [data-quiz]');
      const filter = quiz.locator("[data-quiz-filter]");
      const answerCurrent = () => quiz.locator(".question.is-active").evaluate(question =>
        question.querySelector(`[data-choice="${question.dataset.answer}"]`).click());
      assert.equal(await quiz.locator("[data-quiz-jump]").count(), 1);
      await answerCurrent();
      const started = (await getJourney(page)).sessions[0];
      assert.equal(started.total, 1);
      assert.equal(started.fullRound, false);
      await filter.selectOption("all");
      if (resume) {
        await answerCurrent();
        await page.clock.setFixedTime(now + day);
        await page.goto(origin + "/dmv-practice.html");
        const resumeLink = page.locator("[data-recent-practice-link]");
        const href = new URL(await resumeLink.getAttribute("href"), page.url());
        assert.equal(href.searchParams.get("resume"), "1");
        await resumeLink.click();
        await page.waitForURL(href.href);
        await page.waitForFunction(() => document.querySelector(
          '[data-mode-panel="mock"].is-active [data-quiz-answered]',
        )?.textContent === "2 of 40 answered", null, { timeout: 4000 });
      }
      await quiz.locator('[data-quiz-jump="0"]').click();
      assert.match(await finishRound(page, 40), /40 of 40 correct/);
      await filter.selectOption("Parking");
      await filter.selectOption("all");
      const updated = await getJourney(page);
      assert.equal(updated.sessions.length, 1);
      assert.equal(updated.sessions[0].roundId, started.roundId);
      assert.equal(updated.sessions[0].total, 40);
      assert.equal(updated.sessions[0].correct, 40);
      assert.equal(updated.sessions[0].fullRound, true);
      assert.equal(updated.sessions[0].practiceTargetMet, true);
      const days = Object.values(updated.days);
      assert.equal(days.reduce((sum, item) => sum + item.sessions, 0), 1);
      assert.equal(days.reduce((sum, item) => sum + item.answered, 0), 40);
      const analytics = await page.evaluate(() => JSON.stringify(window.dataLayer));
      assert(!analytics.includes(started.roundId));
      const completions = await page.evaluate(() => window.dataLayer
        .filter(event => event[0] === "event" && event[1] === "quiz_complete")
        .map(event => [event[2].focus, event[2].total]));
      assert.deepEqual(completions, resume ? [] : [["Parking", 1]]);
      await page.goto(origin + "/dmv-practice.html");
      assert.equal(await passes(page).textContent(), "1 of 2");
    }));
}

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
    const florida = page.locator(".pocket-tool-list").getByRole("link", { name: /Florida regulatory signs/ });
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

for (const width of [320, 390, 1280]) {
  test(`${width}px: homepage goes straight to the state picker or printable worksheet`, () =>
    withSite(width, async (page) => {
      const home = origin + "/";
      await page.goto(home);
      const preview = page.locator("#state-paths-preview");
      const state = page.locator("#state-paths");
      assert.equal(await preview.getByRole("link", { name: "Choose your state", exact: true }).getAttribute("href"), "#state-paths");
      assert.equal(await preview.evaluate(el => el.nextElementSibling.id), "state-paths");
      assert.equal(await page.locator(".home-start, .home-popular, .home-value-brief, .home-value-cards").count(), 0);
      const visibleRoutes = await page.locator("main a[href]").evaluateAll(links =>
        links.filter(link => link.getClientRects().length).map(link => link.getAttribute("href")));
      for (const { href } of [...homeContent.startHere, ...homeContent.popular]) {
        assert.ok(visibleRoutes.includes(href), `homepage still offers ${href}`);
      }
      await preview.getByRole("link", { name: "Choose your state", exact: true }).press("Enter");
      await page.waitForURL(home + "#state-paths");
      const search = state.getByRole("searchbox", { name: "Find your state" });
      assert.ok(await search.isVisible());
      await search.fill("Georgia");
      assert.equal(await state.locator("[data-state-card]:visible").count(), 1);
      const guide = state.getByRole("link", { name: "State guide", exact: true });
      assert.equal(await guide.getAttribute("href"), "georgia-dds-road-signs-practice.html");
      await guide.press("Enter");
      await page.waitForURL("**/georgia-dds-road-signs-practice.html");

      await page.goto(home);
      const earlyLinks = page.locator(".home-quick-links");
      assert.equal(await earlyLinks.locator("a").count(), 3);
      assert.ok(await earlyLinks.getByRole("link", { name: "Work skills practice preview", exact: true }).isVisible());
      const worksheet = earlyLinks.getByRole("link", { name: "Road signs worksheet", exact: true });
      assert.ok(await worksheet.isVisible());
      const box = await worksheet.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width && box.y + box.height <= 900);
      await worksheet.press("Enter");
      await page.waitForURL("**/dmv-road-signs-cheat-sheet.html#online-worksheet");
      assert.ok(await page.getByRole("heading", { name: "Road signs worksheet: online self-check" }).isVisible());
    }));
}

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

for (const width of [390, 1280]) {
  test(`${width}px: a cleared review queue leads to unseen baseline questions and resumes its draft`, () =>
    withSite(width, async (page) => {
      const home = origin + "/index.html";
      const baselineHref = "road-signs-practice-test.html?mode=road-signs-core&focus=baseline#practice";
      const primary = page.locator(`${dashboard} [data-journey-primary]`);
      const round = page.locator("[data-mode-panel].is-active [data-quiz]");
      const current = round.locator(".question.is-active");
      const answerCurrent = async () => {
        const answer = await current.getAttribute("data-answer");
        await current.locator(`button[data-choice="${answer}"]`).click();
      };
      const readMastery = () => page.evaluate((key) => Object.values(JSON.parse(localStorage.getItem(key)).items), masteryKey);
      await page.goto(home);
      await page.locator("[data-journey-state]").selectOption("new-york");
      await primary.click();
      const firstPrompt = await current.getAttribute("data-prompt");
      await answerCurrent();
      await page.clock.setFixedTime(now + day);
      await page.goto(home);
      await primary.click();
      await page.waitForLoadState("load");
      assert.equal(await round.locator("[data-quiz-filter]").inputValue(), "due");
      assert.equal(await round.locator("[data-quiz-position]").textContent(), "Question 1 of 1");
      await answerCurrent();
      assert.equal((await readMastery()).length, 1);
      assert.match((await getJourney(page)).sessions[0].href, /focus=due/);
      await page.goto(home);
      assert.equal(await page.locator('[data-journey-step="warmup"] [data-journey-step-status]').textContent(), "1 of 10");
      assert.equal(await primary.getAttribute("href"), baselineHref);
      if (process.env.VERIFY_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
        await page.locator(".journey-priority").screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `baseline-${width}.png`) });
      }
      await primary.click();
      await page.waitForLoadState("load");
      assert.equal(await round.locator("[data-quiz-position]").textContent(), "Question 1 of 9");
      assert.notEqual(await current.getAttribute("data-prompt"), firstPrompt);
      await answerCurrent();
      await round.locator("[data-quiz-forward]").click();
      const nextPrompt = await current.getAttribute("data-prompt");
      const savedMastery = await readMastery();
      await page.goto(home);
      assert.match(await primary.getAttribute("href"), /focus=baseline&resume=1/);
      await primary.click();
      await page.waitForLoadState("load");
      assert.equal(await current.getAttribute("data-prompt"), nextPrompt);
      assert.equal(await round.locator("[data-quiz-position]").textContent(), "Question 2 of 9");
      assert.equal(await round.locator("[data-quiz-answered]").textContent(), "1 of 9 answered");
      assert.deepEqual(await readMastery(), savedMastery);
      for (let i = 1; i < 9; i++) {
        await answerCurrent();
        if (i < 8) await round.locator("[data-quiz-forward]").click();
      }
      assert.equal((await readMastery()).length, 10);
      const last = (await getJourney(page)).sessions[0];
      assert.equal(last.fullRound, false);
      assert.equal(last.practiceTargetMet, false);
      await round.locator("[data-quiz-next-action]").click();
      await page.waitForLoadState("load");
      assert.equal(await page.locator('[data-journey-step="warmup"] [data-journey-step-status]').textContent(), "Complete");
      assert.equal(await passes(page).textContent(), "0 of 2");
      assert.match(await primary.getAttribute("href"), /new-york-dmv-permit-practice-test\.html\?mode=mock/);
      await page.goto(origin + "/" + baselineHref);
      assert.match(await round.locator("[data-quiz-next]").textContent(), /already complete/);
    }));
}

test("the baseline counts the same shared and state question once and resets to only new items", () =>
  withSite(390, async (page) => {
    const home = origin + "/index.html";
    await page.goto(home);
    await page.locator("[data-journey-state]").selectOption("new-york");
    const primary = page.locator(`${dashboard} [data-journey-primary]`);
    await primary.click();
    const round = page.locator("[data-mode-panel].is-active [data-quiz]");
    const current = round.locator(".question.is-active");
    const answer = await current.getAttribute("data-answer");
    await current.locator(`button[data-choice="${answer}"]`).click();
    await page.evaluate((key) => {
      const mastery = JSON.parse(localStorage.getItem(key));
      const [id, record] = Object.entries(mastery.items)[0];
      mastery.items[id.replace(/^general\|/, "new-york|")] = { ...record, state: "new-york" };
      mastery.items["florida|other question|other answer"] = { ...record, state: "florida" };
      localStorage.setItem(key, JSON.stringify(mastery));
      localStorage.removeItem("tdt-recent-practice");
    }, masteryKey);
    await page.goto(home);
    assert.equal(await page.locator('[data-journey-step="warmup"] [data-journey-step-status]').textContent(), "1 of 10");
    await primary.click();
    await page.waitForLoadState("load");
    assert.equal(await round.locator("[data-quiz-position]").textContent(), "Question 1 of 9");
    const prompt = await current.getAttribute("data-prompt");
    const correct = await current.getAttribute("data-answer");
    await current.locator(`button[data-choice="${correct}"]`).click();
    await round.locator("[data-quiz-reset]").click();
    assert.equal(await round.locator("[data-quiz-position]").textContent(), "Question 1 of 8");
    assert.notEqual(await current.getAttribute("data-prompt"), prompt);
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

for (const [width, entry, state] of [[320, "index.html", "illinois"], [1280, "dmv-practice.html", "texas"]]) {
  test(`${width}px: the study dashboard counts only current, unique visit checks and stops reopening a completed list`, () =>
    withSite(width, async (page) => {
      const key = `tdt-dmv-test-day:${state}`;
      await page.goto(`${origin}/${entry}`);
      const items = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [
        `baseline-${i}`, { state: "general", dueAt: now + day },
      ]));
      await page.evaluate(({ masteryKey, key, items, checks }) => {
        localStorage.setItem(masteryKey, JSON.stringify({ items }));
        localStorage.setItem(key, JSON.stringify({ checked: checks }));
      }, { masteryKey, key, items, checks: ["documents", "official-source", ...visitChecks.filter(id => id !== "identity")] });
      await page.locator("[data-journey-state]").selectOption(state);
      const ready = page.locator('[data-journey-step="ready"]');
      const progress = ready.locator("[data-journey-step-status]");
      const next = page.locator("[data-journey-primary]");
      assert.equal(await progress.textContent(), `${visitChecks.length - 1} of ${visitChecks.length}`);
      assert.equal(await ready.evaluate(element => element.classList.contains("is-complete")), false);
      assert.match(await next.getAttribute("href"), new RegExp(`dmv-test-day-checklist.html\\?state=${state}#dmv-checklist$`));

      const checklist = await page.context().newPage();
      await checklist.goto(`${origin}/dmv-test-day-checklist.html?state=${state}#dmv-checklist`);
      assert.equal(await checklist.locator("[data-dmv-ready-score]").textContent(), `${Math.round((visitChecks.length - 1) * 100 / visitChecks.length)}%`);
      assert.match(await checklist.locator('[data-dmv-check][value="mock-score"]').locator("xpath=..").innerText(), /If your visit includes a knowledge test.*If only sign practice is available/is);
      await checklist.locator('[data-dmv-check][value="identity"]').check();
      await page.waitForFunction(total => document.querySelector('[data-journey-step="ready"] [data-journey-step-status]')?.textContent === `${total} of ${total}`, visitChecks.length);
      assert.equal(await ready.evaluate(element => element.classList.contains("is-complete")), true);
      assert.equal(await checklist.locator("[data-dmv-ready-score]").textContent(), "100%");
      assert.equal(await passes(page).textContent(), "Not available");
      assert.match(await next.getAttribute("href"), new RegExp(`${state}-dmv-road-signs-practice.html$`));
      assert.match(await page.locator("[data-journey-copy]").textContent(), /reviewing signs alone does not establish full exam readiness/i);
      if (process.env.VERIFY_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
        await page.locator(".journey-priority").screenshot({
          path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `visit-progress-${width}.png`),
        });
      }
      await checklist.locator('[data-dmv-check][value="identity"]').uncheck();
      await page.waitForFunction(total => document.querySelector('[data-journey-step="ready"] [data-journey-step-status]')?.textContent === `${total - 1} of ${total}`, visitChecks.length);
      assert.equal(await ready.evaluate(element => element.classList.contains("is-complete")), false);
      assert.match(await next.getAttribute("href"), /dmv-test-day-checklist/);
      await checklist.close();
    }));
}

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
        assert.equal(await page.locator("[data-study-signs]").getAttribute("href"), signs);
        const baselineHref = await page.getByRole("link", { name: "Start 10 sign questions" }).getAttribute("href");
        const recheck = page.locator("[data-study-plan-list] li").filter({ hasText: "Recheck rules and signs separately" });
        assert.equal(await recheck.getByRole("link", { name: "Repeat the 10-sign baseline" }).getAttribute("href"), baselineHref);
        assert.match(await recheck.innerText(), /as recall, not as readiness for a full exam/);
        assert.match(await recheck.getByRole("link", { name: "Check the official manual" }).getAttribute("href"), /^https:\/\//);
        await page.locator("[data-study-days]").selectOption("3");
        const finalDay = page.locator("[data-study-plan-list] li").last();
        assert.equal(await finalDay.getByRole("link", { name: "Repeat the 10-sign baseline" }).getAttribute("href"), baselineHref);
        assert.equal(await finalDay.getByRole("link", { name: "Check the official manual" }).count(), 1);

        await page.goto(pathFor("passing-score-calculator", state));
        assert.equal(await page.locator("[data-score-practice]").textContent(), "Road-sign practice");
        assert.equal(await page.locator("[data-score-practice]").getAttribute("href"), signs);
        await page.locator("[data-score-input-correct]").fill("10");
        await page.locator("[data-score-input-total]").fill("20");
        await page.locator("[data-score-check]").click();
        assert.match(await page.locator("[data-score-next-copy]").textContent(), /not a full knowledge test/);
        const followup = page.locator("[data-score-next-link]");
        if (state === "illinois") {
          assert.equal(await followup.getAttribute("href"), "https://www.ilsos.gov/content/dam/publications/pdf_publications/dsd_a112.pdf#page=39");
          assert.equal(await followup.textContent(), "Open Illinois study questions");
        } else {
          assert.equal(await followup.getAttribute("href"), signs);
        }
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

const additionalRequirementPaths = [
  ["georgia", "Georgia", /two 20-question tests/i, /15 correct out of 20 on each part/i, "dds.georgia.gov", "georgia-dds-road-signs-practice.html", /school/i],
  ["ohio", "Ohio", /40 multiple-choice questions/i, /30 correct out of 40/i, "www.bmv.ohio.gov", "ohio-bmv-road-signs-practice.html", /in person/i],
  ["virginia", "Virginia", /10 sign questions, then 30 general questions/i, /10 of 10 signs, then 24 of 30/i, "www.dmv.virginia.gov", "virginia-dmv-road-signs-practice.html", /two proofs/i],
  ["arizona", "Arizona", /30 multiple-choice questions/i, /24 correct out of 30/i, "azdot.gov", "arizona-mvd-road-signs-practice.html", /original/i],
  ["north-carolina", "North Carolina", /separate knowledge and sign tests/i, /80% on knowledge and 9 of 12 signs.*regular Class C/i, "www.ncdot.gov", "north-carolina-dmv-road-signs-practice.html#north-carolina-sign-recall", /limited learner permit/i],
];

for (const width of [390, 1280]) {
  test(`${width}px: state requirements opens all five existing additional study routes`, () =>
    withSite(width, async (page) => {
      const requirements = "/dmv-permit-test-requirements-by-state.html";
      const selector = page.locator("[data-requirements-state]");
      for (const [state, label, format, passing, officialHost, signs, documents] of additionalRequirementPaths) {
        await page.goto(`${origin}${requirements}?state=${state}#requirements-finder`);
        assert.equal(await selector.inputValue(), state);
        assert.equal(await selector.locator("option").count(), 12);
        assert.match(await page.locator("[data-requirements-format]").innerText(), format);
        assert.match(await page.locator("[data-requirements-pass]").innerText(), passing);
        assert.match(await page.locator("[data-requirements-documents]").innerText(), documents);
        for (const action of ["source", "checklist"]) {
          const link = page.locator(`[data-requirements-${action}]`);
          assert.equal(new URL(await link.getAttribute("href")).hostname, officialHost);
        }
        assert.equal(await page.locator("[data-requirements-checklist]").innerText(), "Permit steps");
        assert.equal(await page.locator("[data-requirements-signs]").getAttribute("href"), signs);
        assert.equal(await page.locator("[data-requirements-practice]").isVisible(), false);
        assert.equal(await page.locator("[data-requirements-target]").innerText(), "No full mixed practice set here");
        const score = page.locator("[data-requirements-score]");
        const scoreUrl = new URL(await score.getAttribute("href"), page.url());
        assert.equal(scoreUrl.searchParams.get("state"), state);
        const row = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: label, exact: true }) });
        assert.match(await row.innerText(), passing);
        assert.equal(await row.getByRole("link", { name: "Mixed practice", exact: true }).count(), 0);
        assert.equal(await row.getByRole("link", { name: "Road signs", exact: true }).getAttribute("href"), signs);
        await score.click();
        await page.waitForURL(scoreUrl.href);
        assert.equal(await page.locator("[data-score-state]").inputValue(), state);
      }
      await page.goto(origin + requirements);
      const filter = page.getByRole("searchbox", { name: "Filter table" });
      await filter.fill("North Carolina");
      const shown = page.locator("[data-requirements-row]:visible");
      assert.equal(await shown.count(), 1);
      assert.equal(await shown.getByRole("rowheader").innerText(), "North Carolina");
      await selector.selectOption("virginia");
      assert.match(await page.locator("[data-requirements-pass]").innerText(), /10 of 10 signs/);
      await selector.selectOption("new-york");
      assert.equal(await page.locator("[data-requirements-practice]").isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }));
}
