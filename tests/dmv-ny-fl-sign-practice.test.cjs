const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const site = JSON.parse(fs.readFileSync(path.join(root, "content/site_data.json"), "utf8"));
const states = [
  {
    name: "New York",
    slug: "new-york-dmv",
    rounds: [["ny-four-sign-checkpoint", 4, 2], ["ny-four-sign-retest", 4, 2], ["ny-signs-starter", 8, 6], ["signs", 25, 20]],
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
  test(`New York ${width}px offers a different four-sign retest and keeps the whole-test threshold separate`, () =>
    withSigns(states[0], width, async page => {
      const a = "ny-four-sign-checkpoint";
      const b = "ny-four-sign-retest";
      const openRound = id => page.locator(`[data-mode-panel="${id}"].is-active [data-quiz]`);
      const signsIn = quiz => quiz.locator("[data-quiz-image-key]").evaluateAll(images => images.map(img => img.dataset.quizImageKey));
      const answer = async (quiz, index, correct = true) => {
        await quiz.getByRole("button", { name: `Go to question ${index}`, exact: true }).press("Enter");
        const q = quiz.locator(".question.is-active");
        const key = Number(await q.getAttribute("data-answer"));
        const choice = correct ? key : (key + 1) % await q.locator("[data-choice]").count();
        await q.locator(`[data-choice="${choice}"]`).press("Enter");
        return q;
      };
      const first = openRound(a);
      const original = ["stop", "yield", "do-not-enter", "wrong-way"];
      assert.deepEqual(await signsIn(first), original);
      await answer(first, 1);
      const activeUrl = new URL(page.url());
      activeUrl.searchParams.set("mode", a);
      activeUrl.searchParams.set("resume", "1");
      activeUrl.hash = "practice";
      await page.goto(activeUrl.href);
      assert.match(await first.locator("[data-quiz-result]").innerText(), /^Score: 1 of 1 answered/);
      for (let n = 2; n <= 4; n++) await answer(first, n);
      const retest = first.getByRole("link", { name: "Try four different signs", exact: true });
      await retest.press("Enter");
      await page.waitForURL(url => url.searchParams.get("mode") === b && url.hash === "#practice");
      const second = openRound(b);
      const alternate = ["railroad", "signal-ahead", "keep-right", "hill-ahead"];
      assert.deepEqual(await signsIn(second), alternate);
      assert.equal(await second.getAttribute("data-pass-score"), "2");
      assert.match(await second.locator(".section-intro").innerText(), /not an official permit.test score/i);
      const rail = await answer(second, 1);
      assert.match(await rail.locator(".feedback").innerText(), /round sign is advance warning.*crossbuck/i);
      assert.match(await rail.locator("[data-quiz-source] a").getAttribute("href"), /dmv\.ny\.gov/);
      for (let n = 2; n <= 4; n++) await answer(second, n, n === 2);
      assert.match(await second.locator("[data-quiz-result]").innerText(), /^2 of 4 correct/);
      assert.match(await second.locator("[data-quiz-next]").innerText(), /not an official exam result/i);
      assert.equal(await second.locator("[data-quiz-next-action]").innerText(), "Retry saved questions");
      await second.locator("[data-quiz-reset]").click();
      for (let n = 1; n <= 4; n++) await answer(second, n);
      const full = second.getByRole("link", { name: "Continue to all 25 signs", exact: true });
      await full.press("Enter");
      await page.waitForURL(url => url.searchParams.get("mode") === "signs");
      const complete = openRound("signs");
      assert.equal((await signsIn(complete)).length, 25);
      assert.equal(await complete.getAttribute("data-pass-score"), "20");
      assert.match(await page.locator("#official-details").innerText(), /14 correct overall and at least 2 of the 4 road-sign questions/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const dir = process.env.VERIFY_SCREENSHOTS_DIR;
      if (dir) {
        fs.mkdirSync(dir, { recursive: true });
        await page.getByRole("tablist", { name: "Practice modes" }).screenshot({path: path.join(dir, `ny-retest-tabs-${width}.png`)});
      }
      const legacy = new URL(page.url());
      legacy.search = new URLSearchParams({ focus: "Railroad signs" }).toString();
      await page.goto(legacy.href);
      assert.equal(await complete.locator("[data-quiz-filter]").inputValue(), "Railroad signs");
    }));
}

test("all shared full sign banks use the same practice target from both routes", () => {
  let compared = 0;
  for (const mixed of site.tools.filter(tool => tool.slug.endsWith("-permit-practice-test"))) {
    const signPage = site.tools.find(tool => tool.slug === mixed.slug.replace("-permit-practice-test", "-road-signs-practice"));
    const fullFromMixed = mixed.quizModes?.find(mode => mode.id === "signs");
    const fullFromSigns = signPage?.quizModes?.find(mode => mode.id === "signs");
    if (!fullFromMixed || !fullFromSigns || fullFromMixed.quiz !== fullFromSigns.quiz) continue;
    assert.equal(fullFromMixed.passScore, fullFromSigns.passScore, mixed.slug);
    assert.equal(fullFromMixed.maxQuestions, fullFromSigns.maxQuestions, mixed.slug);
    compared += 1;
  }
  assert.equal(compared, 7);
});

for (const width of [390, 1280]) {
  test(`Florida ${width}px applies the same 19-of-24 result in both full sign rounds`, () =>
    withSigns(states[1], width, async page => {
      for (const [slug, right] of [
        ["florida-dmv-permit-practice-test", 18],
        ["florida-dmv-road-signs-practice", 18],
        ["florida-dmv-permit-practice-test", 19],
        ["florida-dmv-road-signs-practice", 19],
      ]) {
        const url = pathToFileURL(path.join(root, `${slug}.html`)).href;
        await page.goto(url + "?mode=signs#practice");
        const quiz = page.locator('[data-mode-panel="signs"].is-active [data-quiz]');
        assert.equal(await quiz.locator(".question").count(), 24);
        assert.equal(await quiz.getAttribute("data-pass-score"), "19");
        assert.match(await quiz.locator(".section-intro").textContent(), /practice target (?:of 19 correct|is 19 of 24).*not the official/i);
        assert.doesNotMatch(await quiz.locator(".section-intro").textContent(), /20 image/);
        for (const [index, jump] of (await quiz.locator("[data-quiz-jump]").all()).entries()) {
          await jump.click();
          const question = quiz.locator(".question.is-active");
          const answer = Number(await question.getAttribute("data-answer"));
          const count = await question.locator("[data-choice]").count();
          const choice = index < right ? answer : (answer + 1) % count;
          await question.locator(`[data-choice="${choice}"]`).click();
        }
        assert.deepEqual(await quiz.locator("[data-quiz-correct]").allTextContents(), [String(right), String(right)]);
        const feedback = await quiz.locator("[data-quiz-next]").textContent();
        assert.match(feedback, right === 18 ? /^Practice target: 19 of 24.*Review/ : /^Practice target met: 19 of 24.*not an official exam result/);
      }
    }));
}

test("New York's illustrated-question count matches the actual dedicated round", () =>
  withSigns(states[0], 390, async page => {
    const url = pathToFileURL(path.join(root, "new-york-dmv-permit-practice-test.html")).href;
    await page.goto(url + "?mode=signs#practice");
    const quiz = page.locator('[data-mode-panel="signs"].is-active [data-quiz]');
    assert.equal(await quiz.locator(".question .sign-art").count(), 25);
    assert.match(await page.locator(".fact-section").innerText(), /25 illustrated sign questions/);
    assert.match(await page.locator(".fact-section").innerText(), /Official test\s+20 questions/i);
  }));

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
