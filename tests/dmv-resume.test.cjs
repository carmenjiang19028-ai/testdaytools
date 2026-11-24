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
