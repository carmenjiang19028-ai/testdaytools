const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const origin = "http://testdaytools.test";
const daily = origin + "/dmv-permit-test-question-of-the-day.html";
const current = page => page.locator("[data-daily-card].is-active");
const stateSelect = page => page.locator("[data-daily-state]");
const activeQuiz = page => page.locator("[data-mode-panel].is-active [data-quiz], [data-quiz]:not([data-mode-panel] [data-quiz])");
const next = page => page.locator("[data-daily-next]").click();
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function withSite(width, run, javaScriptEnabled = true) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, timezoneId: "America/Los_Angeles", javaScriptEnabled });
  try {
    await context.route(/^https?:/, route => route.abort());
    await context.route(origin + "/**", route => {
      const name = new URL(route.request().url()).pathname.slice(1);
      return route.fulfill({ path: path.join(root, name) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.clock.setFixedTime(new Date("2026-11-20T16:30:00Z"));
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

for (const width of [390, 1280]) {
  test(`${width}px: Texas and Illinois deep links override a saved state and route licensing facts separately from signs`, () =>
    withSite(width, async page => {
      await page.addInitScript(() => localStorage.setItem("tdt-dmv-journey:v1", JSON.stringify({ state: "florida" })));
      for (const [state, category, rule] of [
        ["texas", "Learner license rules", /dps\.texas\.gov\/section\/driver-license\/texas-learners-license-teen/],
        ["illinois", "Exam readiness", /passing-score-calculator\.html\?state=illinois#score-calculator/],
      ]) {
        if (state === "texas") {
          await page.goto(origin + "/texas-dmv-road-signs-practice.html");
          await page.getByRole("link", { name: "Open Texas rules practice", exact: true }).click();
          await page.waitForURL(daily + "?state=texas#daily-question");
        } else {
          await page.goto(daily + "?state=" + state);
        }
        assert.equal(await stateSelect(page).inputValue(), state);
        const cards = page.locator(`[data-daily-card][data-state="${state}"]`);
        assert.equal(await cards.count(), state === "texas" ? 4 : 2);
        assert.equal(await current(page).getAttribute("data-state"), state);
        const factLink = cards.and(page.locator(`[data-category="${category}"]`)).locator("[data-daily-practice]");
        assert.match(await factLink.getAttribute("href"), rule, category);
        for (let i = 0; i < await cards.count() && !await current(page).locator(".sign-art").count(); i++) await next(page);
        const signLink = current(page).locator("[data-daily-practice]");
        const focus = await current(page).getAttribute("data-category");
        assert.match(await signLink.getAttribute("href"), new RegExp(`^${state}-dmv-road-signs-practice\\.html\\?focus=`));
        await signLink.click();
        await page.waitForLoadState("load");
        const quiz = activeQuiz(page);
        assert.equal(await quiz.locator("[data-quiz-filter]").inputValue(), focus);
      }
      await page.goto(daily);
      assert.equal(await stateSelect(page).inputValue(), "florida");
      await page.goto(daily + "?state=unsupported");
      assert.equal(await stateSelect(page).inputValue(), "all");
      assert.equal(await current(page).getAttribute("data-state"), "all");
    }));

  test(`${width}px: Texas rotates through three distinct rule decisions and a sign`, () =>
    withSite(width, async page => {
      await page.goto(daily + "?state=texas");
      const card = current(page);
      const cases = new Map([
        ["Learner license rules", [/at least one year of driving experience/, /licensed for that type of vehicle.*awake, sober/s, /TN\.521\.htm$/]],
        ["Night driving", [/Switch to low beams now/, /300-foot.*500 feet/s, /TN\.547\.htm$/]],
        ["Parking", [/left wheels within 18 inches/, /allows either curb.*local restrictions/s, /TN\.545\.htm$/]],
      ]);
      const start = await card.locator("h3").textContent();
      const prompts = new Set();
      for (let i = 0; i < 4; i++) {
        prompts.add(await card.locator("h3").textContent());
        const category = await card.getAttribute("data-category");
        const lesson = cases.get(category);
        if (lesson) {
          const [answer, explanation, href] = lesson;
          const source = card.locator("[data-daily-source] a");
          assert.equal(await source.isVisible(), false);
          await card.getByRole("button", { name: answer }).press("Enter");
          const feedback = card.locator("[data-daily-feedback]");
          assert.equal(await feedback.textContent(), "Correct.");
          assert.match(await card.locator("[data-daily-explanation]").innerText(), explanation);
          await feedback.press("Tab");
          assert.equal(await source.evaluate(node => node === document.activeElement), true);
          assert.match(await source.getAttribute("href"), href);
          cases.delete(category);
        } else {
          assert.equal(await card.locator(".sign-art").count(), 1);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await next(page);
      }
      assert.equal(cases.size, 0);
      assert.equal(prompts.size, 4);
      assert.equal(await card.locator("h3").textContent(), start);
      assert.match(await page.locator("[data-daily-note]").textContent(), /Prompt 1 of 4/);
    }));

  test(`${width}px: the three sourced decks rotate without erasing feedback and reach the exact practice topic`, () =>
    withSite(width, async page => {
      for (const [state, total] of [["florida", 5], ["pennsylvania", 6], ["new-jersey", 6]]) {
        await page.goto(daily + "?state=" + state);
        const question = current(page);
        const prompts = new Set();
        let focusedCase;
        for (let i = 0; i < total; i++) {
          const prompt = await question.locator("h3").textContent();
          prompts.add(prompt);
          if (await question.locator("[data-daily-source]").count()) {
            const source = question.locator("[data-daily-source] a");
            const feedback = question.locator("[data-daily-feedback]");
            const target = new URL(await question.locator("[data-daily-practice]").getAttribute("href"), daily);
            assert.equal(target.searchParams.get("mode"), "mock");
            assert.equal(target.searchParams.get("focus"), await question.getAttribute("data-category"));
            assert.equal(await source.isVisible(), false);
            const correct = await question.getAttribute("data-answer");
            await question.locator(`[data-daily-choice]:not([data-daily-choice="${correct}"])`).first().click();
            assert.match(await feedback.textContent(), /^Not quite\./);
            assert.equal(await question.locator("[data-daily-explanation]").isVisible(), true);
            assert.equal(await source.isVisible(), true);
            await feedback.press("Tab");
            assert.equal(await source.evaluate(link => link === document.activeElement), true);
            if (!focusedCase || target.searchParams.get("focus") === "Parking") {
              focusedCase = { prompt, target, correct, source: await source.getAttribute("href") };
            }
          }
          await next(page);
        }
        assert.equal(prompts.size, total);
        assert.equal(await page.locator("[data-daily-note]").textContent(), `Prompt 1 of ${total}`);
        assert.ok(focusedCase);
        if (state !== "florida") assert.equal(focusedCase.target.searchParams.get("focus"), "Parking");
        for (let i = 0; i < total && await question.locator("h3").textContent() !== focusedCase.prompt; i++) await next(page);
        assert.equal(await question.locator("h3").textContent(), focusedCase.prompt);
        assert.match(await question.locator("[data-daily-feedback]").textContent(), /^Not quite\./);
        assert.equal(await question.locator("[data-daily-choice]:enabled").count(), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await question.locator("[data-daily-practice]").click();
        const quiz = page.locator("[data-mode-panel=mock].is-active [data-quiz]");
        assert.equal(await quiz.locator("[data-quiz-filter]").inputValue(), focusedCase.target.searchParams.get("focus"));
        const same = quiz.locator(".question").filter({ has: page.locator("h3").filter({ hasText: focusedCase.prompt }) });
        assert.equal(await same.count(), 1);
        assert.equal(await same.getAttribute("data-answer"), focusedCase.correct);
        assert.equal(await same.locator("[data-quiz-source] a").getAttribute("href"), focusedCase.source);
      }
    }));
}

test("the daily New Jersey Move Over item uses the same current source and answer as the mock", () =>
  withSite(390, async page => {
    await page.goto(daily + "?state=new-jersey");
    const card = current(page);
    for (let i = 0; i < 6 && await card.getAttribute("data-category") !== "Move Over"; i++) await next(page);
    assert.equal(await card.getAttribute("data-category"), "Move Over");
    const label = "Reduce to a safe speed below the posted limit and be ready to stop";
    await card.getByRole("button", { name: label, exact: true }).press("Enter");
    assert.match(await card.locator("[data-daily-feedback]").textContent(), /^Correct/);
    const answer = await card.locator("[data-daily-explanation]").innerText();
    assert.match(answer, /does not set one fixed reduction/);
    const source = await card.locator("[data-daily-source] a").getAttribute("href");
    assert.equal(source, "https://pub.njleg.state.nj.us/Bills/2024/AL25/248_.PDF");
    await card.locator("[data-daily-practice]").press("Enter");
    await page.waitForURL(url => url.pathname.endsWith("/new-jersey-mvc-permit-practice-test.html") && url.searchParams.get("focus") === "Move Over");
    const quiz = activeQuiz(page);
    assert.equal(await quiz.locator("[data-quiz-filter]").inputValue(), "Move Over");
    const question = quiz.locator(".question.is-active");
    assert.equal(await question.getAttribute("data-explanation"), answer);
    assert.equal(await question.locator("[data-quiz-source] a").getAttribute("href"), source);
  }));

test("national visitors get only common signs and the daily prompt changes at local midnight", () =>
  withSite(390, async page => {
    await page.clock.setFixedTime(new Date("2026-11-21T07:59:00Z"));
    await page.goto(daily);
    assert.equal(await stateSelect(page).inputValue(), "all");
    assert.equal(await page.locator("[data-daily-card]").count(), 31);
    const prompts = new Set();
    for (let i = 0; i < 4; i++) {
      assert.equal(await current(page).getAttribute("data-state"), "all");
      prompts.add(await current(page).locator("h3").textContent());
      await next(page);
    }
    assert.equal(prompts.size, 4);
    const previous = await current(page).locator("h3").textContent();
    assert.match(await page.locator("[data-daily-date]").textContent(), /Nov 20.*Today's question/);
    await page.clock.setFixedTime(new Date("2026-11-21T08:01:00Z"));
    await page.reload();
    assert.match(await page.locator("[data-daily-date]").textContent(), /Nov 21.*Today's question/);
    assert.notEqual(await current(page).locator("h3").textContent(), previous);
  }));

for (const [width, blocking] of [[320, "disabled"], [1280, "failed"]]) {
  test(`${width}px: the initial warm-up can be answered without scripts (${blocking})`, () =>
    withSite(width, async page => {
      if (blocking === "failed") await page.route(origin + "/assets/app.js", route => route.abort());
      await page.goto(daily);
      const card = current(page);
      assert.equal(await card.getAttribute("data-state"), "all");
      assert.equal(await stateSelect(page).isVisible(), false);
      assert.equal(await card.locator("[data-daily-choice]:visible").count(), 0);
      const fallback = card.locator("[data-daily-self-check]");
      assert.ok(await fallback.isVisible());
      assert.equal(await fallback.getByRole("listitem").count(), 4);
      assert.ok(await card.getByRole("img", { name: /Red octagon.*STOP/ }).isVisible());
      assert.equal(await fallback.locator("details p").isVisible(), false);
      await fallback.getByText("Check the answer", { exact: true }).press("Enter");
      assert.match(await fallback.locator("details p").innerText(), /Come to a complete stop/);
      assert.ok(await card.locator("[data-daily-practice]").isVisible());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }, blocking !== "disabled"));
}

test("the focused image prompt exposes its graphic clue before the answer choices", () =>
  withSite(390, async page => {
    await page.goto(daily + "?state=all");
    assert.ok(await stateSelect(page).isVisible());
    assert.equal(await page.locator("[data-daily-self-check]:visible").count(), 0);
    await page.locator("[data-daily-next]").press("Enter");
    const question = current(page);
    const heading = question.getByRole("heading");
    const clue = question.getByRole("img");
    assert.equal(await heading.getAttribute("aria-describedby"), await clue.getAttribute("id"));
    assert.ok(await heading.evaluate(el => el === document.activeElement));
    const inspector = await page.context().newCDPSession(page);
    try {
      const { root } = await inspector.send("DOM.getDocument");
      const { nodeId } = await inspector.send("DOM.querySelector", { nodeId: root.nodeId, selector: ":focus" });
      const { nodes } = await inspector.send("Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false });
      assert.ok(nodes[0].description?.value);
      assert.equal(nodes[0].description.value, await clue.getAttribute("aria-label"));
    } finally { await inspector.detach(); }
    await page.keyboard.press("Tab");
    assert.ok(await question.locator("[data-daily-choice]").first().evaluate(el => el === document.activeElement));
  }));

test("all daily practice destinations honor their authored topic or state", () =>
  withSite(390, async page => {
    await page.goto(daily);
    const hrefs = await page.locator("[data-daily-practice]").evaluateAll(links => links.map(link => link.getAttribute("href")));
    const external = new Set();
    for (const href of new Set(hrefs)) {
      const url = new URL(href, daily);
      if (url.origin !== origin) {
        external.add(url.hostname);
        continue;
      }
      const response = await page.goto(url.href);
      assert.ok(response?.ok(), href);
      if (url.hash === "#practice") {
        assert.equal(await activeQuiz(page).locator("[data-quiz-filter]").inputValue(), url.searchParams.get("focus"), href);
      } else if (url.hash === "#score-calculator") {
        assert.equal(await page.locator("#score-calculator select").first().inputValue(), url.searchParams.get("state"), href);
      } else {
        assert.match(await page.locator("main h1").textContent(), /Florida Class E/);
      }
    }
    assert.deepEqual([...external].sort(), ["www.dps.texas.gov", "www.nj.gov"]);
  }));
