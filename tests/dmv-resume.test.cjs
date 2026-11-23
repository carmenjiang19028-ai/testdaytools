const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { before, after, test } = require("node:test");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const origin = "http://testdaytools.test";
const study = origin + "/dmv-practice.html";
const quizUrl = origin + "/road-signs-practice-test.html";
const resumeLink = "[data-recent-practice-link]";
const recentKey = "tdt-recent-practice";
const masteryKey = "tdt-dmv-mastery:v1";
const starter = quizUrl + "?mode=road-signs-starter";
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function withSite(width, run) {
  const ctx = await browser.newContext({ viewport: { width, height: 850 } });
  try {
    await ctx.route(/^https?:/, route => route.abort());
    await ctx.route(origin + "/**", route => {
      const name = new URL(route.request().url()).pathname.slice(1) || "index.html";
      return route.fulfill({ path: path.join(root, name) });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
}

const active = (page) => page.locator("[data-mode-panel].is-active [data-quiz]");
const question = (quiz) => quiz.locator(".question.is-active");
const progress = (quiz) => quiz.locator("[data-quiz-answered]").textContent();
const cursor = (quiz) => question(quiz).getAttribute("data-question-index");
const read = (page, key) => page.evaluate(name => JSON.parse(localStorage.getItem(name)), key);
const resume = async (page) => {
  await page.locator(resumeLink).click();
  await page.waitForLoadState("load");
};
const milestones = (page) => page.evaluate(() => (window.dataLayer || [])
  .filter(event => event[0] === "event" && /^quiz_(start|halfway|complete)$/.test(event[1])).map(event => event[1]));

async function answer(quiz, correct) {
  const result = Number(await question(quiz).getAttribute("data-answer"));
  await question(quiz).locator(`[data-choice="${correct ? result : (result + 1) % 4}"]`).click();
}

async function serveRevisedFirstQuestion(page, revision) {
  const original = fs.readFileSync(path.join(root, "road-signs-practice-test.html"), "utf8");
  const revised = original.replace(/<article class="question" data-question-index="0"[\s\S]+?<\/article>/, revision);
  assert.notEqual(revised, original);
  const pathName = new URL(quizUrl).pathname;
  await page.route(url => url.origin === origin && url.pathname === pathName && url.searchParams.get("resume") === "1",
    route => route.fulfill({ contentType: "text/html", body: revised }));
}

test("a fresh page cannot reset an unfinished round from another tab", async () =>
  withSite(390, async owner => {
    await owner.goto(starter + "#practice");
    await answer(active(owner), false);
    const original = await read(owner, recentKey);
    assert.equal(original.draft.picks.length, 1);
    const mastery = await read(owner, masteryKey);
    const fresh = await owner.context().newPage();
    await fresh.goto(starter + "#practice");
    assert.equal(await progress(active(fresh)), "0 of 10 answered");
    await active(fresh).locator("[data-quiz-reset]").click();
    assert.deepEqual(await read(fresh, recentKey), original);
    await active(owner).locator("[data-quiz-reset]").click();
    assert.equal(await progress(active(owner)), "0 of 10 answered");
    assert.equal((await read(owner, recentKey)).draft, undefined);
    assert.deepEqual(await read(owner, masteryKey), mastery);
    await owner.goto(study);
    assert.equal(await owner.locator(resumeLink).textContent(), "Open practice set");
    assert.doesNotMatch(await owner.locator(resumeLink).getAttribute("href"), /resume/);
  }));

test("a stale tab cannot discard a newer save of the same resumed round", async () =>
  withSite(1280, async stale => {
    await stale.goto(starter + "#practice");
    await answer(active(stale), false);
    const original = await read(stale, recentKey);
    const latest = await stale.context().newPage();
    await latest.goto(starter + "&resume=1#practice");
    assert.equal(await progress(active(latest)), "1 of 10 answered");
    await active(latest).locator("[data-quiz-forward]").click();
    await answer(active(latest), true);
    const current = await read(latest, recentKey);
    assert.equal(current.draft.picks.length, 2);
    assert.notEqual(current.draft.revision, original.draft.revision);
    const analytics = await latest.evaluate(() => JSON.stringify(window.dataLayer));
    assert(!analytics.includes(current.draft.revision));
    await active(stale).locator("[data-quiz-reset]").click();
    assert.deepEqual(await read(latest, recentKey), current);
    await latest.goto(study);
    await resume(latest);
    assert.equal(await progress(active(latest)), "2 of 10 answered");
    assert.deepEqual(await milestones(latest), []);
  }));

test("an explicitly restored pre-revision draft can still be reset by its tab", async () =>
  withSite(390, async page => {
    await page.goto(starter + "#practice");
    await answer(active(page), false);
    await page.evaluate(key => {
      const previous = JSON.parse(localStorage.getItem(key));
      delete previous.draft.revision;
      localStorage.setItem(key, JSON.stringify(previous));
    }, recentKey);
    await page.goto(study);
    await resume(page);
    assert.equal(await progress(active(page)), "1 of 10 answered");
    assert.deepEqual(await milestones(page), []);
    await active(page).locator("[data-quiz-reset]").click();
    assert.equal(await progress(active(page)), "0 of 10 answered");
    assert.equal((await read(page, recentKey)).draft, undefined);
    assert.deepEqual(await milestones(page), []);
  }));

for (const width of [390, 1280]) {
  test(`${width}px: resume preserves results, feedback and cursor without replaying activity`, async () =>
    withSite(width, async page => {
      await page.goto(quizUrl + "?mode=road-signs-starter#practice");
      for (let i = 0; i < 6; i += 1) {
        await answer(active(page), i !== 0);
        await active(page).locator("[data-quiz-forward]").click();
      }
      assert.deepEqual(await milestones(page), ["quiz_start", "quiz_halfway"]);
      const savedMastery = await read(page, masteryKey);
      const savedCursor = await cursor(active(page));
      await page.goto(study);
      const link = page.locator(resumeLink);
      assert.equal(await link.textContent(), "Resume unfinished round");
      assert.match(await link.getAttribute("href"), /mode=road-signs-starter&resume=1#practice$/);
      await resume(page);
      assert.equal(await active(page).getAttribute("data-mode-id"), "road-signs-starter");
      assert.equal(await progress(active(page)), "6 of 10 answered");
      assert.equal(await cursor(active(page)), savedCursor);
      assert.match(await active(page).locator(".question").first().locator(".feedback").textContent(), /^Not quite\./);
      assert.equal(await active(page).locator(".question").first().locator("button:disabled").count(), 4);
      assert.deepEqual(await milestones(page), []);
      assert.deepEqual(await read(page, masteryKey), savedMastery);
      const shots = process.env.DMV_RESUME_SCREENSHOTS_DIR;
      if (shots) {
        fs.mkdirSync(shots, { recursive: true });
        await page.locator("[data-quiz-next]:visible").scrollIntoViewIfNeeded();
        await page.screenshot({path: path.join(shots, `resumed-${width}.png`)});
      }
      for (let i = 6; i < 10; i += 1) {
        await answer(active(page), true);
        if (i < 9) await active(page).locator("[data-quiz-forward]").click();
      }
      assert.match(await active(page).locator("[data-quiz-result]").textContent(), /9 of 10 correct/);
      assert.deepEqual(await milestones(page), ["quiz_complete"]);
      const sessions = (await read(page, "tdt-dmv-journey:v1")).sessions;
      assert.equal(sessions.length, 1);
      assert.equal(sessions[0].correct, 9);
      await page.goto(study);
      assert.equal(await link.textContent(), "Open practice set");
      assert.doesNotMatch(await link.getAttribute("href"), /resume/);
    }));
}

for (const [width, version] of [[390, 1], [1280, 2]]) {
  test(`${width}px: editorial feedback changes preserve v${version} saved answers and show the revised reason`, async () =>
    withSite(width, async page => {
      const quiz = active(page);
      await page.goto(quizUrl + "?mode=road-signs-starter#practice");
      await answer(quiz, false);
      await quiz.locator("[data-quiz-forward]").click();
      await answer(quiz, true);
      if (version === 1) {
        await page.evaluate(key => {
          const record = JSON.parse(localStorage.getItem(key));
          const rows = JSON.parse(record.draft.signature);
          rows.forEach(row => { row[5] = null; });
          record.draft.version = 1;
          record.draft.signature = JSON.stringify(rows);
          localStorage.setItem(key, JSON.stringify(record));
        }, recentKey);
      }
      const saved = await read(page, recentKey);
      assert.equal(saved.draft.version, version);
      const mastery = await read(page, masteryKey);
      await serveRevisedFirstQuestion(page, card => card.replace(/data-explanation="[^"]*"/,
        'data-explanation="Come to a full stop before the marked line; then check traffic."'));
      await page.goto(study);
      await resume(page);
      assert.equal(await progress(quiz), "2 of 10 answered");
      assert.equal(await cursor(quiz), String(saved.draft.sequence[saved.draft.position]));
      await quiz.locator('[data-quiz-jump="0"]').click();
      await question(quiz).getByRole("heading").waitFor();
      assert.match(await question(quiz).locator(".feedback").innerText(), /^Not quite\. Come to a full stop before the marked line/);
      assert.equal(await question(quiz).locator("[data-choice]:disabled").count(), 4);
      assert.deepEqual(await milestones(page), []);
      assert.deepEqual(await read(page, masteryKey), mastery);
    }));
}

for (const [label, revision] of [
  ["a changed correct answer", card => card.replace(/data-answer="\d+"/, 'data-answer="3"')],
  ["a changed choice", card => card.replace(">Slow down only if traffic is present<", ">Slow briefly before yielding<")],
  ["a changed picture clue", card => card.replace('aria-label="Red octagon reading STOP in white"', 'aria-label="White triangle with a red border"')],
]) {
  test(`${label} does not restore the previous round`, async () =>
    withSite(390, async page => {
      await page.goto(quizUrl + "?mode=road-signs-starter#practice");
      await answer(active(page), false);
      await serveRevisedFirstQuestion(page, revision);
      await page.goto(study);
      await resume(page);
      assert.equal(await progress(active(page)), "0 of 10 answered");
      assert.match(await active(page).locator("[data-quiz-next]").textContent(), /no longer available/);
      assert.deepEqual(await milestones(page), []);
    }));
}

test("resume selects the saved full mode and preserves shuffled focused order", async () =>
  withSite(390, async page => {
    await page.goto(quizUrl + "?mode=road-signs-core#practice");
    const quiz = active(page);
    await quiz.locator("[data-quiz-filter]").selectOption("Warning signs");
    await quiz.locator("[data-quiz-shuffle]").click();
    await answer(quiz, true);
    await quiz.locator("[data-quiz-forward]").click();
    const saved = await read(page, recentKey);
    const savedCursor = await cursor(quiz);
    assert.match(saved.href, /mode=road-signs-core&focus=Warning\+signs/);
    await page.goto(study);
    await resume(page);
    assert.equal(await quiz.getAttribute("data-mode-id"), "road-signs-core");
    assert.equal(await quiz.locator("[data-quiz-filter]").inputValue(), "Warning signs");
    assert.equal(await cursor(quiz), savedCursor);
    assert.equal(await progress(quiz), `1 of ${saved.total} answered`);
    await quiz.locator('[data-quiz-jump="2"]').click();
    assert.equal(await cursor(quiz), String(saved.draft.sequence[2]));
    await quiz.locator("[data-quiz-reset]").click();
    await page.goto(study);
    assert.equal(await page.locator(resumeLink).textContent(), "Open practice set");
  }));

test("legacy results and incompatible drafts never claim to restore answers", async () =>
  withSite(1280, async page => {
    await page.goto(study);
    await page.evaluate(({key}) => {
      localStorage.setItem(key, JSON.stringify({label:"Old result", href:"road-signs-practice-test.html#practice", total:40, answered:3, correct:2, missed:1}));
    }, {key: recentKey});
    await page.reload();
    assert.equal(await page.locator(resumeLink).textContent(), "Open practice set");
    await page.goto(quizUrl + "?mode=road-signs-core#practice");
    await answer(active(page), true);
    await page.reload();
    assert.equal(await progress(active(page)), "0 of 40 answered", "a normal link remains a fresh round");
    await page.evaluate(key => {
      const saved = JSON.parse(localStorage.getItem(key));
      saved.draft.signature += "changed questions";
      localStorage.setItem(key, JSON.stringify(saved));
    }, recentKey);
    await page.goto(study);
    await resume(page);
    assert.equal(await progress(active(page)), "0 of 40 answered");
    assert.match(await active(page).locator("[data-quiz-next]").textContent(), /no longer available/);
    assert.deepEqual(await milestones(page), []);
  }));

test("a browser that blocks storage can still answer and open a fresh round", async () =>
  withSite(390, async page => {
    await page.addInitScript(() => {
      for (const name of ["getItem", "setItem"]) {
        Object.defineProperty(Storage.prototype, name, {value() { throw Error("Storage unavailable"); }});
      }
    });
    await page.goto(quizUrl + "?mode=road-signs-starter#practice");
    await answer(active(page), true);
    assert.equal(await progress(active(page)), "1 of 10 answered");
    await page.goto(study);
    assert.equal(await page.locator(resumeLink).textContent(), "Start road signs");
  }));
