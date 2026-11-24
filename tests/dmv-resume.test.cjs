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
const core = quizUrl + "?mode=road-signs-core";
const revisedYieldIndex = 23;
const retiredYield = [
  "Why should permit-test practice include both sign meaning and driver action?",
  "1", "A useful practice round connects each sign to the safe action: stop, yield, merge, slow, watch, or avoid a prohibited movement.",
  "Test strategy", null, "image:yield",
  "Because signs only matter on highways",
  "Because test questions often ask what to do, not just what the sign is called",
  "Because colors are never tested",
  "Because state manuals do not explain signs",
];
const retiredRegulatoryYield = [
  "What is the most useful way to study regulatory traffic signs for a permit test?",
  "1", "Permit-test questions often ask what a driver should do. Pair each regulatory sign with the required or prohibited action.",
  "Permit-test strategy", null, "Yield sign used for permit-test strategy",
  "Memorize color only and ignore driver action",
  "Connect each sign to the action it requires or prohibits",
  "Study only blue service signs",
  "Skip state handbook wording completely",
];
const retiredNewYorkDrowsy = [
  "If you are drowsy while driving, the safest choice is to:",
  "0", "Drowsiness slows reaction time. Resting is safer than forcing yourself to continue.",
  "Driver fitness", null, null,
  "Pull over safely and rest", "Drink water and keep going no matter what", "Follow another car closely",
];
const retiredPictureDecisions = [
  [37, "When traffic is merging, what creates the safest gap?", "Traffic flow warning signs", [
    "Matching traffic speed while adjusting space early", "Stopping in the through lane",
    "Blocking the merging lane", "Driving beside another vehicle through the merge point",
  ]],
  [39, "What should you do when a no-passing zone begins before a hill or curve?", "Passing signs", [
    "Finish any pass only if you can do so without entering the prohibited zone",
    "Start a pass because traffic is slower uphill", "Use the shoulder to pass",
    "Ignore the sign when the center line is visible",
  ]],
];
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
  test(`${width}px: resume v${version} round but require a new answer to the original YIELD scenario`, () =>
    withSite(width, async page => {
      const quiz = active(page);
      await page.goto(core + "#practice");
      await answer(quiz, false);
      const saved = await read(page, recentKey);
      await page.evaluate(({ recentKey, saved, retiredYield, index, version }) => {
        const previous = JSON.parse(saved.draft.signature);
        previous[index] = retiredYield;
        if (version === 1) previous.forEach(row => { row[5] = null; });
        saved.draft.signature = JSON.stringify(previous);
        saved.draft.version = version;
        saved.draft.picks.push([index, 1]);
        saved.draft.position = saved.draft.sequence.indexOf(index);
        saved.answered = 2;
        saved.correct = 1;
        localStorage.setItem(recentKey, JSON.stringify(saved));
      }, { recentKey, saved, retiredYield, version, index: revisedYieldIndex });
      const stored = await read(page, recentKey);
      const mastery = await read(page, masteryKey);
      await page.goto(study);
      await resume(page);
      assert.equal(await progress(quiz), "1 of 40 answered");
      assert.equal(await cursor(quiz), String(revisedYieldIndex));
      assert.match(await quiz.locator("[data-quiz-next]").innerText(), /updated YIELD question needs a fresh answer/);
      assert.match(await question(quiz).getByRole("heading").innerText(), /car hides the next lane/);
      assert.equal(await question(quiz).locator("[data-choice]:enabled").count(), 4);
      assert.equal(await question(quiz).locator("[data-quiz-source]").isVisible(), false);
      assert.deepEqual(await read(page, recentKey), stored);
      assert.deepEqual(await read(page, masteryKey), mastery);
      assert.deepEqual(await milestones(page), []);
      await question(quiz).getByRole("button", { name: /Wait until you can check all lanes/ }).press("Enter");
      assert.equal(await progress(quiz), "2 of 40 answered");
      assert.match(await question(quiz).locator(".feedback").innerText(), /^Correct\..*wave does not stop traffic/);
      assert.match(await question(quiz).getByRole("link", { name: /PennDOT Driver Manual/ }).getAttribute("href"), /managing-space$/);
      const shots = process.env.DMV_RESUME_SCREENSHOTS_DIR;
      if (shots) {
        fs.mkdirSync(shots, { recursive: true });
        await question(quiz).screenshot({ path: path.join(shots, `yield-decision-${width}.png`) });
      }
      const current = await read(page, recentKey);
      assert.equal(current.correct, 1);
      assert.equal(current.missed, 1);
      assert.notEqual(current.draft.signature, stored.draft.signature);
      assert.deepEqual(await milestones(page), []);
    }));

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

test("a retired strategy item no longer leaves a stale due count or review question", () =>
  withSite(390, async page => {
    await page.goto(core + "#practice");
    await page.evaluate(({ masteryKey, retiredYield }) => {
      const now = Date.now();
      const id = ["general", retiredYield[0].toLowerCase(), retiredYield[7].toLowerCase()].join("|");
      const record = {
        state: "general", prompt: retiredYield[0], category: "Test strategy",
        href: "road-signs-practice-test.html?mode=road-signs-core&focus=due#practice",
        dueAt: now - 1, updatedAt: now - 100, misses: 1, attempts: 1,
      };
      localStorage.setItem(masteryKey, JSON.stringify({ items: { [id]: record } }));
    }, { masteryKey, retiredYield });
    const oldMastery = await read(page, masteryKey);
    await page.goto(study);
    assert.equal(await page.locator("[data-journey-due]").innerText(), "0 questions");
    await page.goto(core + "&focus=due#practice");
    assert.equal(await active(page).locator("[data-quiz-jump]").count(), 0);
    assert.deepEqual(await read(page, masteryKey), oldMastery);
  }));

const retiredRedCurb = [
  "What does a red curb usually mean?", "2", "Old red curb explanation", "Parking signs", null, null,
  "Loading zone for passengers only", "Parking allowed for a short time", "No stopping, standing, or parking",
];
const retiredPassingDuplicate = [
  "If a vehicle behind you wants to pass on a two-lane road, you should:", "0", "Old passing explanation", "Passing", null, null,
  "Keep right and do not increase speed", "Move toward the center line", "Brake suddenly",
];

for (const [retired, slug, state, mode, index, total, pass, topic, explanation, source] of [
  [retiredRedCurb, "florida-dmv", "florida", "quick", 4, 15, 12, /outside a Florida municipality/, /off the traveled part/, /Florida Statutes/],
  [retiredRedCurb, "pennsylvania-dmv", "pennsylvania", "mock", 34, 40, 32, /17 inches from the right curb/, /within 12 inches/, /PennDOT/],
  [retiredRedCurb, "new-jersey-mvc", "new-jersey", "mock", 29, 40, 32, /closest point of your car to a fire hydrant/, /within 10 feet/, /New Jersey MVC/],
  [retiredPassingDuplicate, "florida-dmv", "florida", "mock", 29, 40, 32, /60 feet ahead/, /100 feet of a railroad crossing/, /Florida Statutes/],
  [retiredPassingDuplicate, "pennsylvania-dmv", "pennsylvania", "mock", 19, 40, 32, /police car with flashing lights/, /at least 20 mph below/, /PennDOT/],
  [retiredPassingDuplicate, "new-jersey-mvc", "new-jersey", "mock", 14, 40, 32, /onto another one-way street/, /left lane of the street you enter/, /New Jersey MVC/],
]) {
  const replacingParking = retired === retiredRedCurb;
  const item = replacingParking ? "generic curb" : "duplicate passing";
  test(`${state} ${mode}: replaces the ${item} item without losing other saved answers`, () =>
    withSite(mode === "quick" ? 390 : 1280, async page => {
      const url = `${origin}/${slug}-permit-practice-test.html?mode=${mode}`;
      const quiz = active(page);
      await page.goto(url + "#practice");
      const replacement = quiz.locator(`[data-question-index="${index}"]`);
      assert.match(await replacement.locator("h3").textContent(), topic);
      assert.equal(await quiz.locator("[data-question-index]").count(), total);
      assert.equal(await quiz.getAttribute("data-pass-score"), String(pass));
      if (!replacingParking) {
        assert.equal(await quiz.locator("h3").filter({ hasText: "If you are being passed, you should:" }).count(), 1);
        assert.equal(await quiz.locator("h3").filter({ hasText: retired[0] }).count(), 0);
      }
      await quiz.locator('[data-quiz-jump="0"]').click();
      await answer(quiz, true);
      const saved = await read(page, recentKey);
      const rows = JSON.parse(saved.draft.signature);
      rows[index] = retired;
      saved.draft.signature = JSON.stringify(rows);
      saved.draft.picks.push([index, Number(retired[1])]);
      saved.draft.position = saved.draft.sequence.indexOf(index);
      saved.answered = 2;
      saved.correct = 2;
      await page.evaluate(({ recentKey, saved }) => localStorage.setItem(recentKey, JSON.stringify(saved)), { recentKey, saved });
      const mastery = await read(page, masteryKey);
      await page.goto(url + "&resume=1#practice");
      assert.equal(await progress(quiz), `1 of ${total} answered`);
      assert.equal(await cursor(quiz), String(index));
      assert.equal(await quiz.locator('[data-question-index="0"] [data-choice]:disabled').count(), 3);
      assert.equal(await replacement.locator("[data-choice]:enabled").count(), 3);
      assert.deepEqual(await read(page, recentKey), saved);
      assert.deepEqual(await read(page, masteryKey), mastery);
      assert.deepEqual(await milestones(page), []);
      await answer(quiz, true);
      assert.match(await replacement.locator(".feedback").innerText(), /^Correct\./);
      assert.match(await replacement.locator(".feedback").innerText(), explanation);
      assert.equal(await replacement.getByRole("link", { name: source }).isVisible(), true);
      assert.equal(await progress(quiz), `2 of ${total} answered`);

      if (replacingParking) {
        await page.goto(url + "&focus=Parking+signs#practice");
        assert.equal(await quiz.locator("[data-quiz-filter]").inputValue(), "Parking");
        const jumps = await quiz.locator("[data-quiz-jump]").all();
        const focusedIndexes = [];
        for (const jump of jumps) {
          await jump.click();
          focusedIndexes.push(await cursor(quiz));
        }
        assert.ok(focusedIndexes.includes(String(index)));
      }
    }));
}

for (const width of [390, 1280]) {
  test(`${width}px: three retired picture answers do not discard the rest of the saved round`, () =>
    withSite(width, async page => {
      await page.goto(core + "#practice");
      const quiz = active(page);
      await quiz.locator('[data-quiz-jump="0"]').click();
      await answer(quiz, true);
      const draft = await read(page, recentKey);
      const rows = JSON.parse(draft.draft.signature);
      rows[revisedYieldIndex] = retiredYield;
      for (const [index, prompt, category, choices] of retiredPictureDecisions) {
        const row = rows[index];
        rows[index] = [prompt, "0", row[2], category, row[4], row[5], ...choices];
      }
      draft.draft.signature = JSON.stringify(rows);
      draft.draft.picks.push([revisedYieldIndex, 1], [37, 0], [39, 0]);
      draft.draft.position = draft.draft.sequence.indexOf(37);
      draft.answered = 4;
      draft.correct = 4;
      await page.evaluate(({ recentKey, draft }) => localStorage.setItem(recentKey, JSON.stringify(draft)), { recentKey, draft });
      const mastery = await read(page, masteryKey);
      await page.goto(core + "&resume=1#practice");
      assert.equal(await progress(quiz), "1 of 40 answered");
      assert.equal(await cursor(quiz), "37");
      assert.match(await quiz.locator("[data-quiz-next]").innerText(), /3 updated questions need fresh answers/);
      assert.equal(await quiz.locator('[data-question-index="0"] [data-choice]:disabled').count(), 4);
      for (const index of [revisedYieldIndex, 37, 39]) {
        assert.equal(await quiz.locator(`[data-question-index="${index}"] [data-choice]:enabled`).count(), 4);
      }
      assert.deepEqual(await read(page, recentKey), draft);
      assert.deepEqual(await read(page, masteryKey), mastery);
      assert.deepEqual(await milestones(page), []);

      const merge = question(quiz);
      await merge.getByRole("button", { name: "Yield, adjust speed, and merge only when a safe gap opens" }).press("Enter");
      assert.match(await merge.locator(".feedback").innerText(), /^Correct\..*Matching speed alone/s);
      assert.equal(await merge.getByRole("link", { name: /California DMV: merging/ }).isVisible(), true);
      await quiz.locator('[data-quiz-jump="39"]').click();
      const passing = question(quiz);
      await passing.getByRole("button", { name: "Stay behind the slower car until passing is permitted and safe" }).press("Enter");
      assert.match(await passing.locator(".feedback").innerText(), /^Correct\..*does not cancel the posted restriction/s);
      assert.equal(await passing.getByRole("link", { name: /FHWA: DO NOT PASS/ }).isVisible(), true);
      assert.equal(await progress(quiz), "3 of 40 answered");
      assert.equal(await quiz.getAttribute("data-pass-score"), "32");
    }));
}

test("a full regulatory draft keeps the other answers and does not grade the retired strategy answer again", () =>
  withSite(390, async page => {
    const url = origin + "/regulatory-traffic-signs-practice-test.html?mode=regulatory-signs-core";
    await page.goto(url + "#practice");
    const quiz = active(page);
    await answer(quiz, true);
    const saved = await read(page, recentKey);
    const replaced = 15;
    await page.evaluate(({ saved, recentKey, masteryKey, old, index }) => {
      const rows = JSON.parse(saved.draft.signature);
      rows[index] = old;
      saved.draft.signature = JSON.stringify(rows);
      saved.draft.picks.push([index, 1]);
      saved.draft.position = saved.draft.sequence.indexOf(index);
      saved.answered = 2;
      saved.correct = 2;
      localStorage.setItem(recentKey, JSON.stringify(saved));

      const mastery = JSON.parse(localStorage.getItem(masteryKey));
      const id = ["general", old[0].toLowerCase(), old[7].toLowerCase()].join("|");
      mastery.items[id] = {
        state: "general", prompt: old[0], category: old[3], dueAt: Date.now() - 1, misses: 1, attempts: 1,
      };
      localStorage.setItem(masteryKey, JSON.stringify(mastery));
    }, { saved, recentKey, masteryKey, old: retiredRegulatoryYield, index: replaced });
    const before = await read(page, recentKey);
    const mastery = await read(page, masteryKey);
    await page.goto(study);
    assert.equal(await page.locator("[data-journey-due]").innerText(), "0 questions");
    await resume(page);
    assert.equal(await progress(quiz), "1 of 16 answered");
    assert.equal(await cursor(quiz), String(replaced));
    assert.equal(await quiz.locator('[data-question-index="0"] [data-choice]:disabled').count(), 4);
    assert.equal(await question(quiz).locator("[data-choice]:enabled").count(), 4);
    assert.equal(await question(quiz).locator("[data-quiz-source]").isVisible(), false);
    assert.deepEqual(await read(page, recentKey), before);
    assert.deepEqual(await read(page, masteryKey), mastery);
    assert.deepEqual(await milestones(page), []);
    await question(quiz).getByRole("button", { name: /Yield to the person, then turn only/ }).press("Enter");
    assert.equal(await progress(quiz), "2 of 16 answered");
    assert.match(await question(quiz).locator(".feedback").innerText(), /^Correct\..*through lanes does not control this separate turn/);
    assert.equal(await question(quiz).getByRole("link", { name: /PennDOT Driver Manual/ }).isVisible(), true);
    assert.equal(await quiz.getAttribute("data-pass-score"), "13");
  }));

test("a due draft skips the retired item without completing or rewriting the old round", () =>
  withSite(390, async page => {
    const quiz = active(page);
    await page.goto(core + "#practice");
    await answer(quiz, false);
    const dueKey = `${recentKey}:due`;
    const duePath = "road-signs-practice-test.html?mode=road-signs-core&focus=due#practice";
    const dueUrl = core + "&focus=due&resume=1#practice";
    const saved = await read(page, recentKey);
    const oldRows = JSON.parse(saved.draft.signature);
    oldRows[revisedYieldIndex] = retiredYield;
    saved.href = duePath;
    saved.draft.signature = JSON.stringify(oldRows);
    const firstPick = saved.draft.picks[0][0];
    const another = [0, 1].find(index => index !== firstPick);
    saved.draft.sequence = [firstPick, revisedYieldIndex, another];
    saved.draft.position = 1;
    saved.total = 3;
    await page.evaluate(({ dueKey, saved }) => localStorage.setItem(dueKey, JSON.stringify(saved)), { dueKey, saved });
    await page.goto(dueUrl);
    assert.equal(await progress(quiz), "1 of 2 answered");
    assert.equal(await cursor(quiz), String(another));
    assert.match(await quiz.locator("[data-quiz-next]").innerText(), /retired YIELD item was left out/);
    assert.deepEqual(await read(page, dueKey), saved);
    assert.deepEqual(await milestones(page), []);

    saved.draft.sequence.pop();
    saved.total = 2;
    await page.evaluate(({ dueKey, saved }) => localStorage.setItem(dueKey, JSON.stringify(saved)), { dueKey, saved });
    await page.reload();
    assert.equal(await quiz.locator(`[data-quiz-jump="${revisedYieldIndex}"]`).count(), 0);
    await quiz.locator("[data-quiz-reset]").click();
    assert.deepEqual(await read(page, dueKey), saved);
    assert.deepEqual(await milestones(page), []);
  }));

for (const width of [320, 1280]) {
  test(`${width}px: the New York mock replaces only the duplicate and never reuses its saved answer`, () => withSite(width, async page => {
    const url = origin + "/new-york-dmv-permit-practice-test.html?mode=mock";
    const slot = 39;
    await page.goto(url + "#practice");
    const quiz = active(page);
    assert.equal(await quiz.getAttribute("data-pass-score"), "32");
    assert.equal(await quiz.locator(".question").count(), 40);
    assert.equal(await quiz.locator('.question[data-prompt*="are tired while driving"]').count(), 1);
    assert.equal(await quiz.locator('.question[data-prompt*="are drowsy while driving"]').count(), 0);
    await answer(quiz, true);
    const saved = await read(page, recentKey);
    const firstIndex = saved.draft.picks[0][0];
    await page.evaluate(({ saved, recentKey, masteryKey, old, slot }) => {
      const rows = JSON.parse(saved.draft.signature);
      rows[slot] = old;
      saved.draft.signature = JSON.stringify(rows);
      saved.draft.picks.push([slot, 0]);
      saved.draft.position = saved.draft.sequence.indexOf(slot);
      saved.answered = 2;
      saved.correct = 2;
      localStorage.setItem(recentKey, JSON.stringify(saved));
      const mastery = JSON.parse(localStorage.getItem(masteryKey));
      mastery.items[["new-york", old[0].toLowerCase(), old[6].toLowerCase()].join("|")] = {
        state: "new-york", prompt: old[0], category: old[3], dueAt: Date.now() - 1, misses: 1, attempts: 1,
      };
      localStorage.setItem(masteryKey, JSON.stringify(mastery));
    }, { saved, recentKey, masteryKey, old: retiredNewYorkDrowsy, slot });
    const before = await read(page, recentKey);
    const mastery = await read(page, masteryKey);
    await page.goto(study);
    assert.equal(await page.locator("[data-journey-due]").innerText(), "0 questions");
    await resume(page);
    assert.equal(await progress(quiz), "1 of 40 answered");
    assert.equal(await cursor(quiz), String(slot));
    assert.match(await question(quiz).getAttribute("data-prompt"), /paved shoulder/);
    assert.equal(await quiz.locator(`[data-question-index="${firstIndex}"] [data-choice]:disabled`).count(), 3);
    assert.equal(await question(quiz).locator("[data-choice]:enabled").count(), 3);
    assert.match(await quiz.locator("[data-quiz-next]").innerText(), /updated New York passing question needs a fresh answer/);
    assert.deepEqual(await read(page, recentKey), before);
    assert.deepEqual(await read(page, masteryKey), mastery);
    assert.deepEqual(await milestones(page), []);
    await question(quiz).getByRole("button", { name: "Wait behind the car in the travel lane" }).press("Enter");
    assert.equal(await progress(quiz), "2 of 40 answered");
    assert.match(await question(quiz).locator(".feedback").innerText(), /^Correct\..*paved shoulder is not a travel lane/);
    assert.equal(await question(quiz).getByRole("link", { name: /New York DMV.*Passing/ }).isVisible(), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (process.env.NY_PASSING_SCREENSHOTS_DIR) {
      await question(quiz).screenshot({ path: path.join(process.env.NY_PASSING_SCREENSHOTS_DIR, `ny-passing-${width}.png`) });
    }
  }));
}

for (const width of [320, 1280]) {
  test(`${width}px: New York red-arrow and bike-lane cases preserve the other mock answers`, () =>
    withSite(width, async page => {
      const route = origin + "/new-york-dmv-permit-practice-test.html?mode=mock";
      const replacements = [
        {
          slot: 18,
          old: [
            "If a traffic light turns yellow as you approach, the safest general choice is to:",
            "0", "Yellow warns that red is coming. Stop if it is safe to do so.", "Signals", null, null,
            "Stop if you can do so safely", "Accelerate no matter the distance", "Close your eyes through the intersection",
          ],
          correct: "Wait for the signal to permit the right turn",
          wrong: "Stop, then turn if you can yield",
          explanation: /A red arrow is different/,
          source: "https://dmv.ny.gov/new-york-state-drivers-manual-and-practice-tests/chapter-4-traffic-control",
        },
        {
          slot: 19,
          old: [
            "When passing a bicyclist, you should:",
            "0", "Bicyclists can move around hazards, so drivers should leave space.", "Vulnerable road users", null, null,
            "Leave safe space and pass only when legal and safe", "Pass as closely as possible", "Drive on the sidewalk",
          ],
          correct: "Wait for the bicyclist to pass, then check again before opening the door",
          wrong: "Open the door now if it will not extend into the car lane",
          explanation: /A bike lane carries moving traffic/,
          source: "https://www.nysenate.gov/legislation/laws/VAT/1214",
        },
      ];
      await page.goto(route + "#practice");
      const quiz = active(page);
      assert.equal(await quiz.getAttribute("data-pass-score"), "32");
      assert.equal(await quiz.locator(".question").count(), 40);
      assert.equal(await quiz.locator('.question[data-prompt^="A steady yellow traffic light"]').count(), 1);
      assert.equal(await quiz.locator('.question[data-prompt^="If you see a bicyclist ahead"]').count(), 1);
      const unchanged = Number(await cursor(quiz));
      await answer(quiz, false);
      await page.evaluate(({ recentKey, replacements }) => {
        const saved = JSON.parse(localStorage.getItem(recentKey));
        const rows = JSON.parse(saved.draft.signature);
        for (const { slot, old } of replacements) {
          rows[slot] = old;
          saved.draft.picks.push([slot, 0]);
        }
        saved.draft.signature = JSON.stringify(rows);
        saved.draft.position = saved.draft.sequence.indexOf(replacements[0].slot);
        saved.answered += replacements.length;
        saved.correct += replacements.length;
        localStorage.setItem(recentKey, JSON.stringify(saved));
      }, { recentKey, replacements });
      const before = await read(page, recentKey);
      await page.goto(route + "&resume=1#practice");
      assert.equal(await progress(quiz), "1 of 40 answered");
      assert.equal(await cursor(quiz), String(replacements[0].slot));
      assert.equal(await quiz.locator(`[data-question-index="${unchanged}"] [data-choice]:disabled`).count(), 3);
      assert.deepEqual(await read(page, recentKey), before);
      assert.deepEqual(await milestones(page), []);
      for (const { slot, old, correct, wrong, explanation, source } of replacements) {
        assert.equal(await quiz.getByRole("heading", { name: old[0], exact: true }).count(), 0);
        await quiz.locator(`[data-quiz-jump="${slot}"]`).click();
        const item = question(quiz);
        assert.equal(await item.locator("[data-choice]:enabled").count(), 3);
        assert.equal(await item.getByRole("button", { name: correct, exact: true }).getAttribute("data-choice"), "0");
        await item.getByRole("button", { name: wrong, exact: true }).click();
        assert.match(await item.locator(".feedback").innerText(), /^Not quite\./);
        assert.match(await item.locator(".feedback").innerText(), explanation);
        assert.equal(await item.locator(`a[href="${source}"]`).isVisible(), true);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
    }));
}

test("a regulatory draft and its misses still read the former ONE WAY and KEEP RIGHT cues", () =>
  withSite(390, async page => {
    const mode = "regulatory-signs-core";
    const route = `${origin}/regulatory-traffic-signs-practice-test.html?mode=${mode}`;
    const mistakeKey = `tdt-mistakes:/regulatory-traffic-signs-practice-test.html:${mode}`;
    const quiz = active(page);
    await page.goto(route + "#practice");
    const labels = {};
    for (const key of ["one-way", "keep-right"]) {
      const visual = `[data-quiz-image-key="${key}"]`;
      const item = quiz.locator("[data-question-index]").filter({ has: page.locator(visual) });
      assert.equal(await item.count(), 1);
      const index = await item.getAttribute("data-question-index");
      const art = item.locator(visual);
      labels[`image:${key}`] = await art.getAttribute("data-quiz-previous-cue");
      assert.ok(labels[`image:${key}`]);
      assert.notEqual(labels[`image:${key}`], await art.getAttribute("aria-label"));
      await quiz.locator(`[data-quiz-jump="${index}"]`).click();
      await answer(quiz, false);
    }
    await page.evaluate(({ labels, recentKey, mistakeKey }) => {
      const draft = JSON.parse(localStorage.getItem(recentKey));
      const signature = JSON.parse(draft.draft.signature);
      for (const row of signature) if (labels[row[5]]) row[5] = labels[row[5]];
      draft.draft.signature = JSON.stringify(signature);
      localStorage.setItem(recentKey, JSON.stringify(draft));
      const misses = JSON.parse(localStorage.getItem(mistakeKey));
      for (const entry of misses) {
        const id = JSON.parse(entry.questionId);
        if (labels[id[2]]) id[2] = labels[id[2]];
        entry.questionId = JSON.stringify(id);
      }
      localStorage.setItem(mistakeKey, JSON.stringify(misses));
    }, { labels, recentKey, mistakeKey });
    await page.goto(route + "&resume=1#practice");
    assert.equal(await progress(quiz), "2 of 16 answered");
    assert.equal(await quiz.locator("[data-quiz-mistakes] article").count(), 2);
    assert.deepEqual(await milestones(page), []);
    await quiz.locator("[data-quiz-filter]").selectOption("saved");
    assert.equal(await quiz.locator("[data-quiz-jump]").count(), 2);
    await answer(quiz, true);
    assert.equal((await read(page, mistakeKey)).length, 1);
  }));

for (const [width, original] of [[390, true], [1280, false]]) {
  test(`${width}px: restores answers and saved mistakes from ${original ? "before" : "after"} the text clue release`, () =>
    withSite(width, async page => {
      const quiz = active(page);
      const mistakeKey = "tdt-mistakes:/road-signs-practice-test.html:road-signs-starter";
      await page.goto(starter + "#practice");
      await answer(quiz, false);
      await quiz.locator("[data-quiz-forward]").click();
      await answer(quiz, false);
      const labels = await quiz.locator(".question").evaluateAll((items, original) => items.map(item => {
        const art = item.querySelector("[data-quiz-image-key]");
        return art ? [`image:${art.dataset.quizImageKey}`, original ? art.dataset.quizLegacyLabel : art.getAttribute("aria-label")] : [null, null];
      }), original);
      await page.evaluate(({ labels, recentKey, mistakeKey }) => {
        const record = JSON.parse(localStorage.getItem(recentKey));
        const rows = JSON.parse(record.draft.signature);
        rows.forEach((row, index) => { row[5] = labels[index][1]; });
        record.draft.signature = JSON.stringify(rows);
        localStorage.setItem(recentKey, JSON.stringify(record));
        const translated = new Map(labels);
        const entries = JSON.parse(localStorage.getItem(mistakeKey));
        const legacy = entries.map(item => {
          const parts = JSON.parse(item.questionId);
          parts[2] = translated.get(parts[2]);
          return { ...item, questionId: JSON.stringify(parts) };
        });
        localStorage.setItem(mistakeKey, JSON.stringify([...legacy, entries[0]]));
      }, { labels, recentKey, mistakeKey });
      const oldDraft = await read(page, recentKey);
      const mastery = await read(page, masteryKey);
      await page.goto(study);
      await resume(page);
      assert.equal(await progress(quiz), "2 of 10 answered");
      assert.equal(await cursor(quiz), String(oldDraft.draft.sequence[oldDraft.draft.position]));
      assert.deepEqual(await milestones(page), []);
      assert.deepEqual(await read(page, masteryKey), mastery);
      assert.equal(await quiz.locator("[data-quiz-mistakes] article").count(), 2);
      await quiz.locator("[data-quiz-filter]").selectOption("saved");
      assert.equal(await quiz.locator("[data-quiz-jump]").count(), 2);
      await answer(quiz, true);
      const remaining = await read(page, mistakeKey);
      assert.equal(remaining.length, 1);
      assert.match(remaining[0].questionId, /image:yield/);
    }));
}

test("changing the accessible description again does not invalidate a stable picture draft", () =>
  withSite(390, async page => {
    await page.goto(starter + "#practice");
    await answer(active(page), false);
    await serveRevisedFirstQuestion(page, card => card.replace(/aria-label="[^"]+"/, 'aria-label="White STOP on a red octagon."'));
    await page.goto(study);
    await resume(page);
    assert.equal(await progress(active(page)), "1 of 10 answered");
    assert.deepEqual(await milestones(page), []);
  }));

for (const [label, revision] of [
  ["a changed correct answer", card => card.replace(/data-answer="\d+"/, 'data-answer="3"')],
  ["a changed choice", card => card.replace(">Slow down only if traffic is present<", ">Slow briefly before yielding<")],
  ["a different picture", card => card.replace('data-quiz-image-key="stop"', 'data-quiz-image-key="yield"')],
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

for (const width of [390, 1280]) {
  test(`${width}px: viewing a completed category cannot erase the unfinished round`, async () =>
    withSite(width, async page => {
      await page.goto(starter + "#practice");
      const quiz = active(page);
      await answer(quiz, false);
      await quiz.locator('[data-quiz-jump="6"]').click();
      await answer(quiz, true);
      assert.equal(await progress(quiz), "2 of 10 answered");
      await quiz.locator("[data-quiz-filter]").selectOption("Speed signs");
      assert.equal(await progress(quiz), "1 of 1 answered");
      const saved = await read(page, recentKey);
      assert.deepEqual([saved.answered, saved.total, saved.correct, saved.missed], [2, 10, 1, 1]);
      assert.equal(saved.draft.picks.length, 2);
      assert.doesNotMatch(saved.href, /focus=/);
      const mastery = await read(page, masteryKey);
      await page.goto(study);
      assert.equal(await page.locator(resumeLink).textContent(), "Resume unfinished round");
      await resume(page);
      assert.equal(await progress(quiz), "2 of 10 answered");
      assert.equal(await cursor(quiz), "6");
      assert.match(await question(quiz).locator(".feedback").innerText(), /^Correct\./);
      await quiz.locator('[data-quiz-jump="0"]').click();
      assert.match(await question(quiz).locator(".feedback").innerText(), /^Not quite\./);
      assert.deepEqual(await milestones(page), []);
      assert.deepEqual(await read(page, masteryKey), mastery);
    }));
}

test("answers across two category views resume together in the original mode", async () =>
  withSite(390, async page => {
    await page.goto(starter + "&focus=Warning%20signs#practice");
    const quiz = active(page);
    await answer(quiz, true);
    assert.equal(await progress(quiz), "1 of 2 answered");
    assert.match((await read(page, recentKey)).href, /focus=Warning\+signs/);
    await quiz.locator("[data-quiz-filter]").selectOption("Regulatory signs");
    assert.equal(await progress(quiz), "0 of 5 answered");
    await answer(quiz, false);
    assert.equal(await progress(quiz), "1 of 5 answered");
    const saved = await read(page, recentKey);
    assert.deepEqual(saved.draft.picks.map(([index]) => index), [0, 8]);
    await page.goto(study);
    await resume(page);
    assert.equal(await quiz.getAttribute("data-mode-id"), "road-signs-starter");
    assert.equal(await progress(quiz), "2 of 10 answered");
    assert.equal(await cursor(quiz), "0");
    assert.deepEqual(await milestones(page), []);
  }));

test("the only answered question and shuffled order survive a completed category view", async () =>
  withSite(1280, async page => {
    await page.goto(starter + "#practice");
    const quiz = active(page);
    await quiz.locator("[data-quiz-shuffle]").click();
    const position = await quiz.locator("[data-quiz-jump]").evaluateAll(buttons => buttons.length);
    for (let i = 0; i < position; i += 1) {
      await quiz.locator(`[data-quiz-jump="${i}"]`).click();
      if (await cursor(quiz) === "6") break;
    }
    assert.equal(await cursor(quiz), "6");
    await answer(quiz, true);
    const before = await read(page, recentKey);
    await quiz.locator("[data-quiz-filter]").selectOption("Speed signs");
    assert.equal(await progress(quiz), "1 of 1 answered");
    const saved = await read(page, recentKey);
    assert.equal(saved.answered, 1);
    assert.deepEqual(saved.draft.sequence, before.draft.sequence);
    assert.equal(saved.draft.position, before.draft.position);
    await page.goto(study);
    await resume(page);
    assert.equal(await progress(quiz), "1 of 10 answered");
    assert.equal(await cursor(quiz), "6");
  }));

for (const width of [390, 1280]) {
  test(`${width}px: reviewing saved mistakes preserves the unfinished picture round`, () =>
    withSite(width, async page => {
      await page.goto(starter + "#practice");
      const quiz = active(page);
      const filter = quiz.locator("[data-quiz-filter]");
      const result = quiz.locator("[data-quiz-result]");
      await answer(quiz, false);
      await quiz.locator("[data-quiz-forward]").click();
      await answer(quiz, false);
      await quiz.locator("[data-quiz-forward]").click();
      const saved = await read(page, recentKey);
      const originalCursor = await cursor(quiz);
      const originalScore = await result.textContent();

      await filter.selectOption("saved");
      assert.equal(await progress(quiz), "0 of 2 answered");
      await answer(quiz, true);
      assert.equal(await progress(quiz), "1 of 2 answered");
      assert.deepEqual(await read(page, recentKey), saved, "a review answer must not replace the unfinished round");
      const returnLink = quiz.getByRole("link", { name: "Return to original round" });
      assert.equal(await returnLink.getAttribute("href"), "road-signs-practice-test.html?mode=road-signs-starter#practice");
      const shots = process.env.RESUME_SCREENSHOTS_DIR;
      if (shots) {
        fs.mkdirSync(shots, { recursive: true });
        await returnLink.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(shots, `review-return-${width}.png`) });
      }
      const practiceEvents = await milestones(page);
      if (width === 390) await returnLink.press("Enter");
      else await filter.selectOption("all");
      assert.equal(await progress(quiz), "2 of 10 answered");
      assert.equal(await cursor(quiz), originalCursor);
      assert.equal(await result.textContent(), originalScore);
      assert.deepEqual(await milestones(page), practiceEvents, "restoring answers must not replay attempts");
      const first = quiz.locator('[data-question-index="0"]');
      assert.match(await first.locator(".feedback").textContent(), /^Not quite\./, "the original round is still scored as answered");
      assert.ok(!(await quiz.locator("[data-quiz-mistakes]").textContent()).includes(await first.getAttribute("data-prompt")),
        "the correct review answer still clears that question from the mistake list");
      await page.goto(study);
      await resume(page);
      assert.equal(await progress(quiz), "2 of 10 answered");
      assert.equal(await cursor(quiz), originalCursor);
      assert.deepEqual(await milestones(page), []);
    }));
}

test("a deep link to saved mistakes in another tab leaves the original resume intact", () =>
  withSite(390, async page => {
    await page.goto(starter + "#practice");
    const quiz = active(page);
    await answer(quiz, false);
    await quiz.locator("[data-quiz-forward]").click();
    const saved = await read(page, recentKey);
    const peer = await page.context().newPage();
    try {
      await peer.goto(starter + "&focus=saved#practice");
      assert.equal(await progress(active(peer)), "0 of 1 answered");
      await answer(active(peer), true);
      assert.equal(await progress(active(peer)), "1 of 1 answered");
      assert.deepEqual(await read(peer, recentKey), saved);
      await peer.goto(study);
      await resume(peer);
      assert.equal(await progress(active(peer)), "1 of 10 answered");
      assert.equal(await cursor(active(peer)), "1");
      assert.deepEqual(await milestones(peer), []);
    } finally { await peer.close(); }
  }));

test("due review pauses the original round's clock and does not use its remaining time", () =>
  withSite(1280, async page => {
    await page.goto(starter + "#practice");
    const quiz = active(page);
    const timer = quiz.getByRole("timer");
    await page.clock.install();
    await quiz.getByRole("button", { name: "Start 10-min timer" }).click();
    await answer(quiz, false);
    await quiz.locator("[data-quiz-forward]").click();
    await page.clock.fastForward(61_000);
    await quiz.locator("[data-quiz-review-mistakes]").click();
    assert.equal(await quiz.locator("[data-quiz-filter]").inputValue(), "due");
    assert.equal(await timer.textContent(), "Untimed practice");
    assert.equal(await progress(quiz), "0 of 1 answered");
    await quiz.getByRole("button", { name: "Start 10-min timer" }).click();
    await page.clock.fastForward(61_000);
    await answer(quiz, true);
    await quiz.getByRole("link", { name: "Return to original round" }).click();
    assert.equal(await progress(quiz), "1 of 10 answered");
    assert.equal(await cursor(quiz), "1");
    assert.match(await timer.textContent(), /^Paused at 8:(57|58|59)$/);
    await quiz.getByRole("button", { name: "Resume timer" }).click();
    await page.clock.fastForward(60_000);
    assert.match(await timer.textContent(), /^7:(57|58|59) left/);
  }));

test("an unseen baseline exercise cannot replace an unfinished full round", () =>
  withSite(390, async page => {
    await page.goto(quizUrl + "?mode=road-signs-core#practice");
    const quiz = active(page);
    await answer(quiz, true);
    await quiz.locator("[data-quiz-forward]").click();
    const saved = await read(page, recentKey);
    await quiz.locator("[data-quiz-filter]").selectOption("baseline");
    assert.notEqual(await cursor(quiz), "0");
    await answer(quiz, false);
    assert.deepEqual(await read(page, recentKey), saved);
    await quiz.getByRole("link", { name: "Return to original round" }).click();
    assert.equal(await progress(quiz), "1 of 40 answered");
    assert.equal(await cursor(quiz), "1");
  }));

test("returning from review to a completed category does not record a new completed round", () =>
  withSite(390, async page => {
    await page.goto(starter + "#practice");
    const quiz = active(page);
    await answer(quiz, false);
    await quiz.locator('[data-quiz-jump="6"]').click();
    await answer(quiz, true);
    const filter = quiz.locator("[data-quiz-filter]");
    await filter.selectOption("saved");
    assert.equal(await progress(quiz), "0 of 1 answered");
    const events = await milestones(page);
    const localState = await page.evaluate(() => JSON.stringify(localStorage));
    await filter.selectOption("Speed signs");
    assert.equal(await progress(quiz), "1 of 1 answered");
    assert.deepEqual(await milestones(page), events);
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), localState);
  }));

test("a saved-mistakes draft made before review records were separated can still resume and reset", () =>
  withSite(390, async page => {
    await page.goto(starter + "#practice");
    const quiz = active(page);
    await answer(quiz, false);
    await quiz.locator("[data-quiz-forward]").click();
    await answer(quiz, false);
    await quiz.locator("[data-quiz-filter]").selectOption("saved");
    await answer(quiz, true);
    await quiz.locator("[data-quiz-forward]").click();
    await page.evaluate(key => {
      const savedKey = `${key}:saved`;
      const draft = localStorage.getItem(savedKey);
      if (!JSON.parse(draft)?.draft) throw new Error("No incomplete saved-mistakes practice");
      localStorage.setItem(key, draft);
      localStorage.removeItem(savedKey);
    }, recentKey);
    await page.goto(study);
    assert.match(await page.locator(resumeLink).getAttribute("href"), /focus=saved&resume=1/);
    await resume(page);
    assert.equal(await progress(quiz), "1 of 2 answered");
    assert.deepEqual(await milestones(page), []);
    await quiz.locator("[data-quiz-reset]").click();
    assert.equal(await progress(quiz), "0 of 2 answered");
    assert.equal((await read(page, recentKey)).draft, undefined);
    assert.deepEqual(await milestones(page), []);
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
