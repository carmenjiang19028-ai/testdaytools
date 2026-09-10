const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const base = 'https://testdaytools.com';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.png': 'image/png' };
const events = page => page.evaluate(() => (window.dataLayer || []).filter(item => item[0] === 'event').map(item => ({ name: item[1], params: item[2] })));

async function isolatedPage(browser, viewport) {
  const context = await browser.newContext({ viewport, acceptDownloads: true, serviceWorkers: 'block' });
  // Serve only local project files. Every external request, including analytics, is blocked.
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
    await route.fulfill({ path: file, contentType: mime[path.extname(file)] || 'application/octet-stream' });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return { context, page, errors };
}

async function downloadFirst(page) {
  await page.goto(base + '/dmv-road-signs-cheat-sheet.html');
  assert.equal((await events(page)).length, 0, 'Opening the resource alone is not a tool action');
  const downloaded = page.waitForEvent('download');
  await page.locator('[data-resource-download="dmv_road_signs_cheat_sheet_pdf"]').click();
  const download = await downloaded;
  assert.equal(download.suggestedFilename(), 'dmv-road-signs-cheat-sheet.pdf');
  assert.equal(await download.failure(), null);
  await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('tdt-value-path:v1') || 'null')?.actions.length === 1);
  const tracked = await events(page);
  assert.equal(tracked.filter(event => event.name === 'resource_download').length, 1);
  assert.equal(tracked.filter(event => event.name === 'study_value_milestone').length, 0);
  return tracked;
}

async function assertFits(page, label) {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(dimensions.scroll <= dimensions.width + 1, `${label} horizontal overflow: ${JSON.stringify(dimensions)}`);
}

async function quizPath(browser, viewport) {
  const { context, page, errors } = await isolatedPage(browser, viewport);
  try {
    await downloadFirst(page);
    await assertFits(page, 'Printable resource');
    await page.getByRole('link', { name: 'Take the picture quiz', exact: true }).click();
    const quiz = page.locator('[data-quiz][data-mode-id="road-signs-starter"]');
    for (let i = 0; i < 10; i++) {
      const question = quiz.locator('.question.is-active');
      const answer = await question.getAttribute('data-answer');
      await question.locator(`[data-choice="${answer}"]`).click();
      if (i < 9) await quiz.locator('[data-quiz-forward]').click();
    }
    const tracked = await events(page);
    const milestones = tracked.filter(event => event.name === 'study_value_milestone');
    assert.equal(milestones.filter(event => event.params.milestone === 'second_tool_action').length, 1);
    assert.equal(milestones.filter(event => event.params.milestone === 'ten_questions_attempted').length, 1);
    assert.equal(tracked.filter(event => event.name === 'quiz_complete').length, 1);
    assert.equal(tracked.find(event => event.name === 'quiz_complete').params.answered, 10);
    await assertFits(page, 'Ten-question result');
    assert.deepEqual(errors, []);
    return { viewport, path: 'pdf-to-quiz', status: 'passed' };
  } finally { await context.close(); }
}

async function flashcardPath(browser, viewport) {
  const { context, page, errors } = await isolatedPage(browser, viewport);
  try {
    await downloadFirst(page);
    await page.getByRole('link', { name: 'Open flashcards', exact: true }).click();
    await page.locator('[data-flashcard-known-button]').click();
    await page.evaluate(() => new Promise(resolve => window.setTimeout(resolve, 0)));
    const tracked = await events(page);
    const milestone = tracked.filter(event => event.name === 'study_value_milestone' && event.params.milestone === 'second_tool_action');
    assert.equal(tracked.filter(event => event.name === 'flashcard_mark').length, 1);
    assert.equal(milestone.length, 1, 'PDF download then flashcard marking is a second tool action');
    assert.equal(milestone[0].params.first_action, 'resource_download');
    assert.equal(milestone[0].params.second_action, 'flashcard_mark');
    assert.equal(milestone[0].params.page_path, '/dmv-road-sign-flashcards.html');
    await assertFits(page, 'Marked flashcard');
    assert.deepEqual(errors, []);
    return { viewport, path: 'pdf-to-flashcards', status: 'passed' };
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      console.log(JSON.stringify(await quizPath(browser, viewport)));
      console.log(JSON.stringify(await flashcardPath(browser, viewport)));
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
