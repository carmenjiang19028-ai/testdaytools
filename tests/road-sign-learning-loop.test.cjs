const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
let browser;
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
after(async () => { await browser.close(); });
async function open(width, concept = '', seed, returnParams = {}) {
  const context = await browser.newContext({ viewport: { width, height: 850 } });
  await context.route(/^https?:/, route => route.abort());
  if (seed) await context.addInitScript(seed);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const url = pathToFileURL(path.resolve('road-sign-learning-loop.html'));
  if (concept) url.searchParams.set('concept', concept);
  for (const [name, value] of Object.entries(returnParams)) url.searchParams.set(name, value);
  await page.goto(url.href);
  return { context, page, errors };
}
test('targeted session contains only its three questions', async () => {
  const { page, context } = await open(1280, 'merge-lane-ends');
  for (let i = 0; i < 3; i++) { await answer(page); await page.locator('[data-loop-next]').click(); }
  assert.equal(Object.keys((await state(page, 'merge-lane-ends')).answers).length, 3);
  await context.close();
});
test('legacy study sheet links keep their destination even with a return mode', async () => {
  const { page, context } = await open(1280, 'merge-lane-ends', undefined, {
    return: 'dmv-road-signs-cheat-sheet.html', return_mode: 'road-signs-core',
  });
  try {
    for (let i = 0; i < 3; i++) { await answer(page); await page.locator('[data-loop-next]').click(); }
    assert.equal(await page.getByRole('link', { name: 'Return to the study sheet' }).getAttribute('href'), 'dmv-road-signs-cheat-sheet.html');
  } finally { await context.close(); }
});

for (const width of [320, 1280]) {
  test(`${width}px: STOP sight lines and a one-lane YIELD decision work without scripts`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 850 }, javaScriptEnabled: false });
    try {
      await context.route(/^https?:/, route => route.abort());
      const page = await context.newPage();
      const lessonUrl = pathToFileURL(path.resolve('road-sign-learning-loop.html'));
      lessonUrl.hash = 'lesson-stop-yield';
      await page.goto(lessonUrl.href);
      const lesson = page.locator('#lesson-stop-yield');
      const signs = lesson.locator('.contrast-sign-pair img');
      assert.deepEqual(await signs.evaluateAll(images => images.map(img => [
        img.src.split('/').pop(), img.complete && img.naturalWidth > 0,
      ])), [['stop-road-sign.svg', true], ['yield-road-sign.svg', true]]);
      const blocked = lesson.locator('details').filter({ hasText: 'A hedge blocks your view' });
      const bridge = lesson.locator('details').filter({ hasText: 'TO ONCOMING TRAFFIC' });
      assert.equal(await blocked.locator('p').isVisible(), false);
      await blocked.locator('summary').press('Enter');
      assert.match(await blocked.locator('p').innerText(), /Stop before your front bumper reaches the line.*Yield to anyone crossing.*edge forward carefully.*Check again/);
      assert.equal(await bridge.locator('p').isVisible(), false);
      await bridge.locator('summary').press('Space');
      assert.match(await bridge.locator('p').innerText(), /Wait outside the narrow section until the approaching car clears it/);
      assert.match(await lesson.locator('.contrast-source a').getAttribute('href'), /^https:\/\/www\.pa\.gov\//);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (process.env.STOP_YIELD_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.STOP_YIELD_SCREENSHOTS_DIR, { recursive: true });
        await lesson.screenshot({ path: path.join(process.env.STOP_YIELD_SCREENSHOTS_DIR, `stop-yield-${width}.png`) });
      }
    } finally { await context.close(); }
  });

  test(`${width}px: decision pictures describe symbols before grading and name them in feedback`, async () => {
    const { page, context, errors } = await open(width, 'merge-lane-ends');
    try {
      const question = page.locator('[data-loop-question]');
      const next = page.locator('[data-loop-next]');
      const figures = question.locator('figure');
      const captions = () => figures.locator('figcaption').allTextContents();
      assert.deepEqual(await captions(), ['Picture 1', 'Picture 2']);
      await answer(page, 1);
      assert.deepEqual(await captions(), ['Merge', 'Lane Ends']);
      await next.press('Enter');
      const worked = page.locator('[data-loop-stage]');
      assert.match(await worked.getByRole('heading').innerText(), /A worked situation/);
      assert.deepEqual(await worked.locator('figcaption').allTextContents(), ['Merge', 'Lane Ends']);
      await next.press('Enter');
      assert.equal(await question.getAttribute('data-loop-question'), 'merge-main-road');
      assert.deepEqual(await captions(), ['Picture 1']);
      const picture = question.getByRole('img');
      assert.equal(await picture.getAttribute('alt'),
        'Yellow diamond with a straight upward arrow. A separate black line curves toward it from the right.');
      assert.match(await picture.getAttribute('src'), /\/merge-road-sign\.svg$/);
      assert.equal(await question.getByRole('img', { name: 'Merge road sign', exact: true }).count(), 0);
      await question.locator('[data-loop-option="0"]').press('Enter');
      assert.deepEqual(await captions(), ['Picture 1']);
      const shots = process.env.VERIFY_SCREENSHOTS_DIR;
      if (shots) {
        fs.mkdirSync(shots, { recursive: true });
        await question.screenshot({ path: path.join(shots, `before-feedback-${width}.png`) });
      }
      await next.press('Enter');
      assert.deepEqual(await captions(), ['Merge']);
      assert.equal(await question.getByRole('img', { name: 'Merge road sign', exact: true }).count(), 1);
      assert.match(await question.locator('[data-loop-feedback]').innerText(), /Correct.*joining traffic/is);
      await page.reload();
      assert.deepEqual(await captions(), ['Merge']);
      assert.match(await question.locator('[data-loop-feedback]').innerText(), /Correct/);
      assert.deepEqual(errors, []);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    } finally { await context.close(); }
  });
}
test('unrecognized return mode leaves the plain picture practice link usable', async () => {
  const { page, context } = await open(1280, 'merge-lane-ends', undefined, {
    return: 'road-signs-practice-test.html', return_mode: 'not-a-picture-round',
  });
  try {
    for (let i = 0; i < 3; i++) { await answer(page); await page.locator('[data-loop-next]').click(); }
    assert.equal(await page.getByRole('link', { name: 'Return to picture practice' }).getAttribute('href'), 'road-signs-practice-test.html#practice');
  } finally { await context.close(); }
});
test('keyboard works', async () => {
  const { page, context } = await open(1280);
  await page.locator('[data-loop-option="0"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-loop-next]').focus();
  await page.keyboard.press('Enter');
  const feedback = page.getByRole('group', { name: 'Correct in this situation.' });
  assert.ok(await feedback.evaluate(el => document.activeElement === el));
  assert.equal(await feedback.getAttribute('aria-describedby'), 'loop-feedback-reason');
  await context.close();
});

for (const width of [320, 390, 1280]) {
  test(`${width}px: submitted feedback gets focus with the reason, and Continue is still reachable`, async () => {
    const { page, context } = await open(width, 'stop-yield');
    try {
      const next = page.locator('[data-loop-next]');
      await page.locator('[data-loop-option="1"]').press('Enter');
      await next.press('Enter');
      const feedback = page.getByRole('group', { name: 'Not quite. Review this decision.' });
      assert.equal(await feedback.count(), 1);
      assert.equal(await feedback.evaluate(el => document.activeElement === el), true);
      const inspector = await page.context().newCDPSession(page);
      try {
        const { root } = await inspector.send('DOM.getDocument');
        const { nodeId } = await inspector.send('DOM.querySelector', { nodeId: root.nodeId, selector: ':focus' });
        const { nodes } = await inspector.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
        assert.equal(nodes[0].name.value, 'Not quite. Review this decision.');
        assert.match(nodes[0].description.value, /This treats STOP as conditional.*Keep this rule/);
      } finally { await inspector.detach(); }
      const feedbackTop = (await feedback.boundingBox()).y;
      const header = await page.locator('.site-header').boundingBox();
      assert.ok(feedbackTop >= header.y + header.height && feedbackTop < 850);
      assert.notEqual(await feedback.evaluate(el => getComputedStyle(el).outlineStyle), 'none');
      const shots = process.env.VERIFY_SCREENSHOTS_DIR;
      if (shots) {
        fs.mkdirSync(shots, { recursive: true });
        await page.screenshot({ path: path.join(shots, `focused-feedback-${width}.png`) });
      }
      await page.keyboard.press('Tab');
      assert.equal(await feedback.getByRole('link').evaluate(el => document.activeElement === el), true);
      await page.keyboard.press('Tab');
      assert.equal(await next.evaluate(el => document.activeElement === el), true);
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('[data-loop-question-title]').evaluate(el => document.activeElement === el), true);
      assert.match(await page.locator('[data-loop-phase-label]').innerText(), /Phase 2/);
    } finally { await context.close(); }
  });
}

test('restart requires a separate confirmation and does not clear another practice session', async () => {
  const concept = 'stop-yield';
  const { page, context } = await open(320, concept);
  try {
    const otherKey = 'tdt-learning-loop:v2:all';
    await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ preserved: true })), otherKey);
    await answer(page, 1);
    const saved = await state(page, concept);
    const restart = page.getByRole('button', { name: 'Restart session', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Restart this practice?' });
    await restart.press('Enter');
    assert.equal(await dialog.count(), 1);
    assert.deepEqual(await state(page, concept), saved);
    assert.equal(await dialog.getByRole('button', { name: 'Keep my answers' }).evaluate(el => document.activeElement === el), true);
    const box = await dialog.boundingBox();
    assert.ok(box.x >= 16 && box.x + box.width <= 304);
    const shots = process.env.VERIFY_SCREENSHOTS_DIR;
    if (shots) {
      fs.mkdirSync(shots, { recursive: true });
      await page.screenshot({ path: path.join(shots, 'restart-confirmation-320.png') });
    }
    await page.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(), false);
    assert.deepEqual(await state(page, concept), saved);
    assert.equal(await restart.evaluate(el => document.activeElement === el), true);
    await restart.press('Enter');
    await dialog.getByRole('button', { name: 'Keep my answers' }).press('Enter');
    assert.deepEqual(await state(page, concept), saved);
    await restart.press('Enter');
    await dialog.getByRole('button', { name: 'Restart practice', exact: true }).press('Enter');
    assert.deepEqual((await state(page, concept)).answers, {});
    assert.equal(await page.locator('[data-loop-report]').isVisible(), false);
    assert.equal(await page.locator('[data-loop-question-title]').evaluate(el => document.activeElement === el), true);
    assert.deepEqual(await page.evaluate(k => JSON.parse(localStorage.getItem(k)), otherKey), { preserved: true });
  } finally { await context.close(); }
});
for (const width of [320, 1280]) {
  test(`${width}px: an answer in a stale tab preserves newer answers and resumes the right step`, async () => {
    const concept = 'stop-yield';
    const { page, context } = await open(width, concept);
    try {
      const stale = await context.newPage();
      await stale.goto(page.url());
      await answer(page);
      await page.locator('[data-loop-next]').click();
      await answer(page);
      const current = await state(page, concept);
      assert.equal(Object.keys(current.answers).length, 2);

      await answer(stale, 1);
      assert.deepEqual(await state(page, concept), current);
      const status = stale.locator('[data-loop-status]');
      assert.match(await status.innerText(), /changed in another tab.*last action was not applied/i);
      assert.equal(await status.evaluate(el => el === document.activeElement), true);
      assert.equal(await stale.locator('[data-loop-progress]').innerText(), '2 of 3 questions');
      assert.equal(await stale.locator('[data-loop-question]').getAttribute('data-loop-question'),
        await page.locator('[data-loop-question]').getAttribute('data-loop-question'));
      const shots = process.env.VERIFY_SCREENSHOTS_DIR;
      if (shots) {
        fs.mkdirSync(shots, { recursive: true });
        await stale.screenshot({ path: path.join(shots, `restored-progress-${width}.png`) });
      }

      await stale.locator('[data-loop-next]').click();
      await answer(stale);
      await stale.locator('[data-loop-next]').click();
      assert.equal(Object.keys((await state(stale, concept)).answers).length, 3);
      assert.equal(await stale.locator('[data-loop-phase-label]').innerText(), 'Session complete');

      // The older first tab also cannot erase a completed round by requesting a restart.
      await page.getByRole('button', { name: 'Restart session' }).click();
      assert.equal(await page.getByRole('dialog').isVisible(), false);
      assert.equal(await page.locator('[data-loop-phase-label]').innerText(), 'Session complete');
      assert.equal(Object.keys((await state(page, concept)).answers).length, 3);
    } finally { await context.close(); }
  });
}
test('a restart dialog opened before a new answer cannot clear the updated record', async () => {
  const concept = 'stop-yield';
  const { page, context } = await open(390, concept);
  try {
    await answer(page);
    const peer = await context.newPage();
    await peer.goto(page.url());
    const restart = page.getByRole('button', { name: 'Restart session' });
    const dialog = page.getByRole('dialog', { name: 'Restart this practice?' });
    await restart.click();
    await peer.locator('[data-loop-next]').click();
    await answer(peer, 1);
    const updated = await state(peer, concept);
    await dialog.getByRole('button', { name: 'Restart practice', exact: true }).click();
    assert.equal(await dialog.isVisible(), false);
    assert.deepEqual(await state(page, concept), updated);
    assert.match(await page.locator('[data-loop-status]').innerText(), /latest saved progress is shown/);
    await restart.click();
    await dialog.getByRole('button', { name: 'Restart practice', exact: true }).click();
    assert.deepEqual((await state(page, concept)).answers, {});

    await peer.locator('[data-loop-next]').click();
    assert.deepEqual((await state(peer, concept)).answers, {});
    assert.equal(await peer.locator('[data-loop-progress]').innerText(), '0 of 3 questions');
    assert.equal(await peer.locator('[data-loop-next]').isDisabled(), true);
  } finally { await context.close(); }
});
test('blocked storage does not break practice', async () => {
  const { page, context, errors } = await open(1280, '', () => Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }));
  await answer(page);
  assert.deepEqual(errors, []);
  await context.close();
});
test('corrupt saved state is ignored', async () => {
  const { page, context } = await open(1280, '', () => localStorage.setItem('tdt-learning-loop:v2:all', '{'));
  await answer(page);
  await context.close();
});
test('print is stubbed', async () => {
  const { page, context } = await open(1280);
  await answer(page);
  await page.evaluate(() => { window.print = () => { window.called = true; }; });
  await page.locator('[data-loop-print]').click();
  assert.equal(await page.evaluate(() => window.called), true);
  await context.close();
});
test('copy fallback works', async () => {
  const { page, context } = await open(1280);
  await answer(page);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('blocked'); } } }));
  await page.locator('[data-loop-copy-record]').click();
  assert.equal(await page.locator('[data-loop-report-text]').isVisible(), true);
  assert.match(await page.locator('[data-loop-copy-status]').textContent(), /selected/);
  await context.close();
});
test('clipboard copy contains the submitted choice and its reason', async () => {
  const { page, context } = await open(1280);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedText = text; } } }));
  await answer(page, 1);
  await page.locator('[data-loop-copy-record]').click();
  assert.match(await page.evaluate(() => window.copiedText), /Review needed/);
  assert.match(await page.evaluate(() => window.copiedText), /This treats STOP as conditional/);
  await context.close();
});
test('edited saved index cannot bypass unanswered questions', async () => {
  const { page, context } = await open(1280, '', () => localStorage.setItem('tdt-learning-loop:v2:all', JSON.stringify({ version: '2026-11-20', index: 12, answers: {} })));
  assert.equal(await page.locator('[data-loop-question]').getAttribute('data-loop-question'), 'stop-yield-distinction');
  assert.equal(await page.locator('.learning-complete').count(), 0);
  await context.close();
});
test('static explanations and sources work without JavaScript', async () => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.route(/^https?:/, route => route.abort());
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.resolve('road-sign-learning-loop.html')).href);
  const lessons = page.locator('.contrast-lesson');
  assert.equal(await lessons.count(), 3);
  for (const lesson of await lessons.all()) {
    assert.ok(await lesson.locator(':scope > .contrast-source a').isVisible());
  }
  await context.close();
});

for (const width of [320, 390, 1280]) {
  test(`${width}px: study entrances reach the two speed sign decisions without JavaScript`, async () => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 850 } });
    try {
      await context.route(/^https?:/, route => route.abort());
      const page = await context.newPage();
      const destination = pathToFileURL(path.resolve('road-sign-learning-loop.html')).href + '#speed-sign-comparison';
      for (const entrance of ['road-signs-practice-test', 'dmv-road-signs-cheat-sheet', 'dmv-permit-test-mistake-log']) {
        await page.goto(pathToFileURL(path.resolve(entrance + '.html')).href);
        const link = page.getByRole('link', { name: 'Compare posted and advisory speeds with pictures', exact: true });
        assert.equal(await link.count(), 1, entrance);
        await link.press('Enter');
        await page.waitForURL(destination);
      }
      const lesson = page.locator('#speed-sign-comparison');
      const heading = await lesson.getByRole('heading', { level: 2 }).boundingBox();
      const header = await page.locator('.site-header').boundingBox();
      assert.ok(heading.y >= header.y + header.height, 'heading clears the sticky navigation');
      assert.ok(heading.x >= 16, 'heading keeps a readable gutter');
      const images = lesson.getByRole('img');
      assert.equal(await images.count(), 2);
      assert.deepEqual(await images.evaluateAll(items => items.map(i => [i.complete && i.naturalWidth > 0, i.alt])), [
        [true, 'White rectangular sign reading SPEED LIMIT 35'],
        [true, 'Yellow right-curve diamond with a separate yellow 35 MPH plaque underneath'],
      ]);
      assert.equal(await lesson.locator('details[open]').count(), 0);
      await lesson.getByText('Check which sign sets the limit', { exact: true }).press('Enter');
      await lesson.getByText('Check what changes in rain', { exact: true }).press('Enter');
      assert.match(await lesson.locator('details[open]').nth(0).innerText(), /white sign sets the posted limit/);
      assert.match(await lesson.locator('details[open]').nth(1).innerText(), /Slow before the curve and go below 35/);
      assert.equal(await lesson.locator('a[href^="https://mutcd.fhwa.dot.gov/"]').count(), 2);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const shots = process.env.VERIFY_SCREENSHOTS_DIR;
      if (shots) {
        fs.mkdirSync(shots, { recursive: true });
        await page.goto('about:blank');
        await page.goto(destination);
        await page.screenshot({ path: path.join(shots, `speed-comparison-${width}.png`) });
      }
    } finally { await context.close(); }
  });
}

async function answer(page, n = 0) {
  await page.locator(`[data-loop-option="${n}"]`).click();
  await page.locator('[data-loop-next]').click();
}
async function restartPractice(page) {
  await page.getByRole('button', { name: 'Restart session', exact: true }).click();
  await page.getByRole('dialog', { name: 'Restart this practice?' })
    .getByRole('button', { name: 'Restart practice', exact: true }).click();
}
async function state(page, concept = '') { return page.evaluate(c => JSON.parse(localStorage.getItem(`tdt-learning-loop:v2:${c || 'all'}`)), concept); }
const displayedOrder = page => page.locator('[data-loop-option]').evaluateAll(buttons =>
  buttons.map(button => Number(button.dataset.loopOption)));

test('alternating third and second cannot reliably answer a fresh contrast round', async () => {
  const { page, context } = await open(390, '', () => {
    const values = [0.99, 0.99, 0, 0.99, 0.99, 0];
    let draw = 0;
    Math.random = () => values[draw++ % values.length];
  });
  try {
    const correctPositions = [];
    for (let index = 0; index < 9; index++) {
      const order = await displayedOrder(page);
      assert.deepEqual([...order].sort(), [0, 1, 2]);
      correctPositions.push(order.indexOf(0));
      await page.locator('[data-loop-option]').nth(index % 2 ? 1 : 2).click();
      await page.locator('[data-loop-next]').click();
      await page.locator('[data-loop-next]').click();
      if (/Phase 2/.test(await page.locator('[data-loop-phase-label]').innerText())) {
        await page.locator('[data-loop-next]').click();
      }
    }
    assert.deepEqual([...new Set(correctPositions)].sort(), [0, 1, 2]);
    const saved = await state(page);
    assert.equal(Object.keys(saved.answers).length, 9);
    assert.ok(Object.values(saved.answers).some(answer => !answer.correct));
    assert.match(await page.locator('.learning-complete').innerText(), /all 6/);
  } finally {
    await context.close();
  }
});

test('old submitted choices retain their placement, reason and exposure after the update', async () => {
  const questionId = 'stop-yield-distinction';
  const { page, context } = await open(390, '', () => {
    if (localStorage.getItem('tdt-learning-loop:v2:all')) return;
    localStorage.setItem('tdt-learning-loop:v2:all', JSON.stringify({
      version: '2026-11-20', index: 0,
      answers: { 'stop-yield-distinction': { selected: 1, correct: false } },
      exposures: { 'stop-yield-distinction': 1 },
    }));
  });
  try {
    assert.deepEqual(await displayedOrder(page), [1, 2, 0]);
    assert.equal(await page.locator('[data-loop-option="1"]').getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('[data-loop-feedback]').innerText(), /treats STOP as conditional/);
    await page.reload();
    assert.deepEqual(await displayedOrder(page), [1, 2, 0]);
    assert.equal((await state(page)).exposures[questionId], 1);
    assert.equal(await page.locator('.learning-record-answer').count(), 1);
  } finally {
    await context.close();
  }
});

test('refresh keeps a valid displayed order, and restarting draws a fresh one', async () => {
  const id = 'entry-direction-distinction';
  const concept = 'do-not-enter-wrong-way';
  const { page, context } = await open(1280, concept, () => {
    const values = [0.99, 0.99];
    let draw = 0;
    Math.random = () => values[draw++ % values.length];
    const key = 'tdt-learning-loop:v2:do-not-enter-wrong-way';
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, JSON.stringify({
      version: '2026-11-20', index: 0, answers: {},
      optionOrders: { 'entry-direction-distinction': [2, 0, 1] },
    }));
  });
  try {
    assert.deepEqual(await displayedOrder(page), [2, 0, 1]);
    await answer(page, 2);
    await page.reload();
    assert.deepEqual(await displayedOrder(page), [2, 0, 1]);
    assert.equal((await state(page, concept)).answers[id].selected, 2);
    await restartPractice(page);
    assert.deepEqual(await displayedOrder(page), [0, 1, 2]);
    assert.deepEqual((await state(page, concept)).answers, {});
  } finally {
    await context.close();
  }
});

test('a duplicate stored choice order cannot hide an option', async () => {
  const { page, context } = await open(1280, '', () => localStorage.setItem('tdt-learning-loop:v2:all',
    JSON.stringify({
      version: '2026-11-20', index: 0, answers: {},
      optionOrders: { 'stop-yield-distinction': [0, 0, 1] },
    })));
  try {
    assert.deepEqual((await displayedOrder(page)).sort(), [0, 1, 2]);
    await answer(page, 1);
    assert.match(await page.locator('[data-loop-feedback]').innerText(), /treats STOP as conditional/);
  } finally {
    await context.close();
  }
});

for (const width of [390, 1280]) {
  test(`${width}: mixed outcomes cover every situation and preserve review after reload`, async () => {
    const { page, context } = await open(width);
    for (let index = 0; index < 9; index++) {
      await answer(page, index % 2 ? 0 : 1);
      await page.locator('[data-loop-next]').click();
      if (await page.locator('[data-loop-phase-label]').textContent().then(text => /Phase 2/.test(text))) {
        await page.locator('[data-loop-next]').click();
      }
    }
    assert.match(await page.locator('.learning-complete').textContent(), /all 6/);
    assert.equal(await page.locator('.learning-record-answer').count(), 9);
    assert.equal(await page.locator('.learning-record-answer strong').filter({ hasText: 'Review needed' }).count(), 5);
    await page.reload();
    assert.match(await page.locator('.learning-complete').textContent(), /all 6/);
    assert.equal(await page.locator('.learning-record-answer').count(), 9);
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('[data-learning-loop]').isVisible(), false);
    assert.equal(await page.locator('[data-loop-report]').isVisible(), true);
    if (process.env.VERIFY_SCREENSHOTS_DIR) {
      fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `record-print-${width}.png`), fullPage: true });
    }
    await page.emulateMedia({ media: 'screen' });
    await restartPractice(page);
    assert.equal(Object.keys((await state(page)).answers).length, 0);
    assert.equal(await page.locator('[data-loop-report]').isVisible(), false);
    await context.close();
  });
  test(`${width}: feedback remains until Continue`, async () => {
    const { page, context, errors } = await open(width);
    await answer(page, 1);
    assert.match(await page.locator('[data-loop-feedback]').textContent(), /Not quite/);
    assert.equal(await page.locator('[data-loop-option]:disabled').count(), 3);
    await page.locator('[data-loop-next]').click();
    assert.match(await page.locator('[data-loop-phase-label]').textContent(), /Phase 2/);
    assert.deepEqual(errors, []);
    await context.close();
  });
  test(`${width}: every sign is covered`, async () => {
    const { page, context } = await open(width);
    const ids = [];
    for (let i = 0; i < 9; i++) { ids.push(await page.locator('[data-loop-question]').getAttribute('data-loop-question')); await answer(page); await page.locator('[data-loop-next]').click(); }
    assert.equal(new Set(ids).size, 9);
    assert.match(await page.locator('.learning-complete').textContent(), /all 6/);
    await context.close();
  });
  test(`${width}: reload restores answer`, async () => {
    const { page, context } = await open(width);
    await answer(page);
    await page.reload();
    assert.match(await page.locator('[data-loop-feedback]').textContent(), /Correct/);
    assert.equal((await state(page)).exposures['stop-yield-distinction'], 1);
    await context.close();
  });
  test(`${width}: double click deduplicates`, async () => {
    const { page, context } = await open(width);
    await page.locator('[data-loop-option="0"]').click();
    await page.locator('[data-loop-next]').dblclick();
    assert.equal((await state(page)).exposures['stop-yield-distinction'], 1);
    await context.close();
  });
  test(`${width}: unsubmitted selection is not saved`, async () => {
    const { page, context } = await open(width);
    await page.locator('[data-loop-option="0"]').click();
    await page.reload();
    assert.equal(Object.keys((await state(page)).answers).length, 0);
    await context.close();
  });
  test(`${width}: legacy data is untouched`, async () => {
    const { page, context } = await open(width, '', () => localStorage.setItem('tdt-learning-loop:v1:all', 'old'));
    assert.equal(await page.evaluate(() => localStorage.getItem('tdt-learning-loop:v1:all')), 'old');
    assert.equal(Object.keys((await state(page)).answers).length, 0);
    await context.close();
  });
  test(`${width}: report contains reasons`, async () => {
    const { page, context } = await open(width);
    await answer(page, 1);
    assert.match(await page.locator('[data-loop-report]').textContent(), /Your answer/);
    await context.close();
  });
  test(`${width}: layout does not overflow`, async () => {
    const { page, context } = await open(width);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.VERIFY_SCREENSHOTS_DIR) { fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `after-${width}.png`) }); }
    await context.close();
  });
}
