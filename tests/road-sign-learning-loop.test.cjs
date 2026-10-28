const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { before, after, test } = require('node:test');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const screenshots = process.env.VERIFY_SCREENSHOTS_DIR;
const stateKey = concept => `tdt-learning-loop:v1:${concept || 'all'}`;
let browser;

before(async () => {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  if (screenshots) fs.mkdirSync(screenshots, { recursive: true });
});
after(async () => { await browser?.close(); });

async function open(width = 1280, concept = '', legacy) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
  await context.route(/^https?:/, route => route.abort());
  if (legacy) await context.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
  }, { key: stateKey(concept), value: legacy });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = pathToFileURL(path.join(root, 'road-sign-learning-loop.html'));
  if (concept) url.searchParams.set('concept', concept);
  await page.goto(url.href);
  return { context, page, errors };
}

async function saved(page, concept = '') {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), stateKey(concept));
}

async function check(page, answer = 0) {
  await page.locator(`[data-loop-option="${answer}"]`).click();
  assert.equal(await page.locator('[data-loop-next]').textContent(), 'Check answer');
  await page.locator('[data-loop-next]').click();
}

async function advance(page) {
  await page.locator('[data-loop-next]').click();
}

async function optionOrder(page) {
  return page.locator('[data-loop-option]').evaluateAll(buttons => buttons.map(button => ({
    answer: Number(button.dataset.loopOption), text: button.textContent,
  })));
}

async function capture(page, name) {
  if (!screenshots) return;
  await page.screenshot({ path: path.join(screenshots, `${name}.png`), fullPage: true });
}

for (const width of [1280, 390]) {
  test(`${width}px: feedback remains readable before advancing from a wrong diagnosis`, async () => {
    const { context, page, errors } = await open(width);
    try {
      await check(page, 1);
      assert.match(await page.locator('[data-loop-phase-label]').textContent(), /Phase 1/);
      assert.match(await page.locator('[data-loop-feedback]').textContent(), /Not quite/);
      assert.equal(await page.locator('[data-loop-option]:disabled').count(), 3);
      assert.equal(await page.locator('.learning-review-card').count(), 1);
      await capture(page, `feedback-${width}`);
      await advance(page);
      assert.match(await page.locator('[data-loop-phase-label]').textContent(), /Phase 2/);
      assert.equal(await page.locator('[data-loop-feedback]').textContent(), '');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test(`${width}px: every contrast receives transfer even when diagnosis is correct`, async () => {
    const { context, page, errors } = await open(width);
    try {
      for (let index = 0; index < 3; index++) {
        assert.match(await page.locator('[data-loop-phase-label]').textContent(), /Phase 1/);
        await check(page);
        await advance(page);
        assert.match(await page.locator('[data-loop-phase-label]').textContent(), /Phase 3/);
        await check(page);
        assert.equal(await page.locator('.learning-complete').count(), 0);
        await advance(page);
      }
      const state = await saved(page);
      assert.equal(Object.keys(state.answers).filter(key => key.startsWith('1:')).length, 3);
      assert.equal(Object.keys(state.answers).filter(key => key.startsWith('3:')).length, 3);
      assert.equal(state.completed, true);
      assert.match(await page.locator('.learning-complete').textContent(), /3 sign contrasts/);
      const exposures = state.exposures;
      await page.reload();
      assert.equal(await page.locator('[data-loop-next]').textContent(), 'Session complete');
      assert.deepEqual((await saved(page)).exposures, exposures);
      await capture(page, `complete-${width}`);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test(`${width}px: wrong transfer appears in review and survives completion/reload/print`, async () => {
    const concept = 'stop-yield';
    const { context, page, errors } = await open(width, concept);
    try {
      await check(page);
      await advance(page);
      await check(page, 1);
      assert.match(await page.locator('[data-loop-feedback]').textContent(), /Not quite/);
      assert.match(await page.locator('[data-loop-status]').textContent(), /Added to the local review sheet/);
      assert.equal(await page.locator('[data-loop-review]').isVisible(), true);
      assert.equal(await page.locator('.learning-review-card').count(), 1);
      const exposures = (await saved(page, concept)).exposures;
      await page.reload();
      assert.match(await page.locator('[data-loop-feedback]').textContent(), /Not quite/);
      assert.deepEqual((await saved(page, concept)).exposures, exposures);
      await capture(page, `missed-transfer-${width}`);
      await advance(page);
      await page.reload();
      assert.equal((await saved(page, concept)).completed, true);
      assert.equal(await page.locator('.learning-review-card').count(), 1);
      await page.evaluate(() => { window.print = () => { window.printRequested = true; }; });
      await page.locator('[data-loop-print]').click();
      assert.equal(await page.evaluate(() => window.printRequested), true);
      assert.equal(await page.locator('.learning-review-card').count(), 1);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test(`${width}px: misses in diagnosis, practice and transfer deduplicate into one review card`, async () => {
    const { context, page } = await open(width, 'merge-lane-ends');
    try {
      for (const phase of [1, 2, 3]) {
        assert.match(await page.locator('[data-loop-phase-label]').textContent(), new RegExp(`Phase ${phase}`));
        await check(page, 1);
        assert.equal(await page.locator('.learning-review-card').count(), 1);
        await advance(page);
      }
      assert.equal((await saved(page, 'merge-lane-ends')).completed, true);
      assert.equal(await page.locator('.learning-review-card').count(), 1);
      await page.locator('[data-loop-reset]').click();
      const reset = await saved(page, 'merge-lane-ends');
      assert.equal(reset.completed, false);
      assert.deepEqual(reset.answers, {});
      assert.deepEqual(reset.exposures, {});
      assert.equal(await page.locator('.learning-review-card').count(), 0);
    } finally { await context.close(); }
  });

  test(`${width}px: double-click records once and refresh restores submitted feedback`, async () => {
    const { context, page } = await open(width, 'do-not-enter-wrong-way');
    try {
      await page.locator('[data-loop-option="0"]').click();
      await page.locator('[data-loop-next]').dblclick();
      let state = await saved(page, 'do-not-enter-wrong-way');
      assert.equal(state.phase, 1);
      assert.equal(state.submitted, true);
      assert.equal(state.exposures['1:do-not-enter-wrong-way:do-not-enter'], 1);
      await page.reload();
      assert.match(await page.locator('[data-loop-feedback]').textContent(), /Good/);
      assert.equal(await page.locator('[data-loop-option]:disabled').count(), 3);
      assert.equal(await page.locator('[data-loop-next]').textContent(), 'Continue');
      state = await saved(page, 'do-not-enter-wrong-way');
      assert.equal(state.exposures['1:do-not-enter-wrong-way:do-not-enter'], 1);
      await advance(page);
      assert.match(await page.locator('[data-loop-phase-label]').textContent(), /Phase 3/);
      assert.equal(await page.locator('[data-loop-next]').isDisabled(), true);
    } finally { await context.close(); }
  });

  test(`${width}px: page images and controls remain within the viewport`, async () => {
    const { context, page, errors } = await open(width);
    try {
      await page.locator('[data-loop-stage] img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
      assert.equal(await page.locator('[data-loop-stage] img').count(), 2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      for (const button of await page.locator('[data-loop-next], [data-loop-reset], [data-loop-print]').all()) {
        const box = await button.boundingBox();
        assert.ok(box.width > 0 && box.x >= 0 && box.x + box.width <= width + 1);
      }
      await capture(page, `start-${width}`);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

test('legacy partial session resumes missing transfer without erasing answers or exposures', async () => {
  const legacy = { misses: [], phase: 3, index: 2,
    answers: { '1:stop-yield:stop': true, '1:do-not-enter-wrong-way:do-not-enter': true,
      '1:merge-lane-ends:merge': true, '3:merge-lane-ends:merge': true },
    exposures: { '1:stop-yield:stop': 2, '3:merge-lane-ends:merge': 1 } };
  const { context, page } = await open(1280, '', legacy);
  try {
    const state = await saved(page);
    assert.equal(state.completed, false);
    assert.equal(state.index, 0);
    assert.equal(state.phase, 3);
    assert.deepEqual(state.answers, legacy.answers);
    assert.deepEqual(state.exposures, legacy.exposures);
    assert.match(await page.locator('[data-loop-stage] h3').textContent(), /no visible traffic/);
    assert.equal(await page.locator('.learning-complete').count(), 0);
  } finally { await context.close(); }
});

test('legacy missed transfer is recovered into review instead of silently discarded', async () => {
  const legacy = { misses: [], phase: 3, index: 0,
    answers: { '1:stop-yield:stop': true, '3:stop-yield:stop': false },
    exposures: { '1:stop-yield:stop': 1, '3:stop-yield:stop': 1 } };
  const { context, page } = await open(1280, 'stop-yield', legacy);
  try {
    assert.equal(await page.locator('.learning-review-card').count(), 1);
    assert.equal((await saved(page, 'stop-yield')).answers['3:stop-yield:stop'], false);
    assert.deepEqual((await saved(page, 'stop-yield')).exposures, legacy.exposures);
    assert.equal(await page.locator('[data-loop-review]').isVisible(), true);
  } finally { await context.close(); }
});

test('mixed full session completes all transfer checks and preserves each missed distinction', async () => {
  const { context, page } = await open();
  try {
    await check(page, 1); await advance(page);
    await check(page); await advance(page);
    await check(page, 1); await advance(page);
    await check(page); await advance(page);
    await check(page); await advance(page);
    await check(page, 1); await advance(page);
    await check(page, 1); await advance(page);
    await check(page); await advance(page);
    const state = await saved(page);
    assert.equal(state.completed, true);
    assert.equal(Object.keys(state.answers).filter(key => key.startsWith('3:')).length, 3);
    assert.equal(state.misses.length, 2);
    assert.equal(await page.locator('.learning-review-card').count(), 2);
    assert.equal(Object.values(state.exposures).every(value => value === 1), true);
  } finally { await context.close(); }
});

test('keyboard submission retains feedback until a separate Continue action', async () => {
  const { context, page } = await open(1280, 'stop-yield');
  try {
    await page.locator('[data-loop-option="0"]').focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-loop-next]').focus();
    await page.keyboard.press('Enter');
    assert.equal((await saved(page, 'stop-yield')).phase, 1);
    assert.equal((await saved(page, 'stop-yield')).submitted, true);
    assert.match(await page.locator('[data-loop-feedback]').textContent(), /Good/);
    await page.keyboard.press('Enter');
    assert.equal((await saved(page, 'stop-yield')).phase, 3);
    assert.equal(await page.locator('[data-loop-next]').isDisabled(), true);
  } finally { await context.close(); }
});

test('unsubmitted selection does not become an answer after refresh', async () => {
  const { context, page } = await open(1280, 'stop-yield');
  try {
    await page.locator('[data-loop-option="1"]').click();
    await page.reload();
    const state = await saved(page, 'stop-yield');
    assert.deepEqual(state.answers, {});
    assert.deepEqual(state.exposures, {});
    assert.equal(state.submitted, false);
    assert.equal(await page.locator('[data-loop-next]').isDisabled(), true);
  } finally { await context.close(); }
});

for (const width of [1280, 390]) {
  test(`${width}px: correct positions vary while each question order and grading survive refresh`, async () => {
    const correctPositions = new Set();
    for (const concept of ['stop-yield', 'do-not-enter-wrong-way', 'merge-lane-ends']) {
      const { context, page, errors } = await open(width, concept);
      try {
        for (const phase of [1, 2, 3]) {
          const order = await optionOrder(page);
          assert.deepEqual(order.map(option => option.answer).sort(), [0, 1, 2]);
          correctPositions.add(order.findIndex(option => option.answer === 0));
          await page.reload();
          assert.deepEqual(await optionOrder(page), order);
          const answer = phase === 3 ? 0 : 1;
          await check(page, answer);
          assert.match(await page.locator('[data-loop-feedback]').textContent(), phase === 3 ? /Correct for this wording/ : /Not quite/);
          const beforeReload = await saved(page, concept);
          const selectedText = order.find(option => option.answer === answer).text;
          await page.reload();
          assert.deepEqual(await optionOrder(page), order);
          assert.equal(await page.locator('[data-loop-option].is-selected').textContent(), selectedText);
          const afterReload = await saved(page, concept);
          assert.deepEqual(afterReload.answers, beforeReload.answers);
          assert.deepEqual(afterReload.exposures, beforeReload.exposures);
          if (concept === 'stop-yield' && phase === 1) await capture(page, `option-order-${width}`);
          await advance(page);
        }
        assert.equal((await saved(page, concept)).completed, true);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    assert.deepEqual([...correctPositions].sort(), [0, 1, 2]);
  });

  test(`${width}px: selecting only the first displayed option cannot record an all-correct session`, async () => {
    const { context, page } = await open(width);
    try {
      let state = await saved(page);
      let checked = 0;
      while (!state.completed && checked < 10) {
        const answer = Number(await page.locator('[data-loop-option]').first().getAttribute('data-loop-option'));
        await page.locator('[data-loop-option]').first().click();
        await page.locator('[data-loop-next]').click();
        assert.match(await page.locator('[data-loop-feedback]').textContent(), answer === 0 ? /Good|Correct for this wording/ : /Not quite/);
        await advance(page);
        state = await saved(page);
        checked += 1;
      }
      assert.equal(state.completed, true);
      assert.ok(Object.values(state.answers).includes(false));
      assert.ok(Object.values(state.answers).includes(true));
      assert.ok(state.misses.length > 0);
      assert.ok(Object.values(state.exposures).every(count => count === 1));
    } finally { await context.close(); }
  });
}

test('a submitted prior-version answer keeps its meaning, highlight and feedback after reordering', async () => {
  const legacy = { flowVersion: 2, misses: [], phase: 1, index: 0, submitted: true,
    selectedOption: 0, completed: false, answers: { '1:stop-yield:stop': true },
    exposures: { '1:stop-yield:stop': 1 } };
  const { context, page } = await open(1280, 'stop-yield', legacy);
  try {
    assert.match(await page.locator('[data-loop-option].is-selected').textContent(), /Stop requires a complete stop/);
    assert.match(await page.locator('[data-loop-feedback]').textContent(), /Good/);
    const order = await optionOrder(page);
    await page.reload();
    assert.deepEqual(await optionOrder(page), order);
    const state = await saved(page, 'stop-yield');
    assert.deepEqual(state.answers, legacy.answers);
    assert.deepEqual(state.exposures, legacy.exposures);
    assert.equal(state.selectedOption, 0);
    await advance(page);
    assert.equal((await saved(page, 'stop-yield')).phase, 3);
  } finally { await context.close(); }
});

test('the same question has the same order in full and concept-specific sessions', async () => {
  const full = await open();
  const focused = await open(1280, 'do-not-enter-wrong-way');
  try {
    await check(full.page); await advance(full.page);
    await check(full.page); await advance(full.page);
    assert.equal((await saved(full.page)).index, 1);
    assert.deepEqual(await optionOrder(full.page), await optionOrder(focused.page));
  } finally {
    await full.context.close();
    await focused.context.close();
  }
});
