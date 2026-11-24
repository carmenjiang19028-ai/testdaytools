const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { before, after, test } = require('node:test');
const { chromium } = require('playwright');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const sharp = require('sharp');
const { render } = require('../scripts/render_road_sign_materials.cjs');
const root = path.resolve(__dirname, '..');
const localRules = [
  ['illinois-dmv-road-signs-practice', 'illinois-school-zone', 'Illinois school zones', 2, [[20, 16]]],
  ['new-york-dmv-road-signs-practice', 'new-york-right-on-red', 'NY right on red', 3, [[4, 2], [8, 6], [25, 20]]],
  ['texas-dmv-road-signs-practice', 'texas-work-zone-panels', 'Texas work-zone cases', 3, [[20, 16]]],
  ['pennsylvania-dmv-road-signs-practice', 'pennsylvania-school-bus', 'PA school bus cases', 3, [[20, 16]],
    ['pennsylvania-dmv-permit-practice-test', 'Try the school bus cases']],
  ['new-jersey-mvc-road-signs-practice', 'new-jersey-move-over', 'NJ Move Over cases', 3, [[20, 16]],
    ['new-jersey-mvc-permit-practice-test', 'Try the New Jersey Move Over cases']],
  ['michigan-sos-road-signs-practice', 'michigan-left-practice', 'Try the Michigan Left cases', 3, []],
];
let browser;
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
after(async () => { await browser?.close(); });

test('the single-curve symbol bends only one way and stays inside its warning diamond', async () => {
  const svg = fs.readFileSync(path.join(root, 'assets/road-signs/curve-road-sign.svg'));
  const { data, info } = await sharp(svg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let outside = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (Math.abs(x - 110) / 80 + Math.abs(y - 80) / 66 > 1.09
          && Math.max(...data.subarray(i, i + 3)) < 65 && data[i + 3] > 180) outside++;
    }
  }
  assert.equal(outside, 0, 'the symbol must not break through the diamond border');
  const page = await browser.newPage();
  try {
    await page.setContent(svg.toString());
    const xs = await page.locator('path[fill="none"]').evaluate(stem => (
      Array.from({ length: 33 }, (_, i) => stem.getPointAtLength(stem.getTotalLength() * i / 32).x)
    ));
    assert.ok(xs.at(-1) > xs[0] + 25 && xs.every((x, i) => i === 0 || x >= xs[i - 1] - 0.01));
  } finally { await page.close(); }
});

for (const width of [320, 1280]) {
  test(`${width}px: printable route compares three curve signs and gives a way to practice without changing scoring`, async () => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 850 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    try {
      const sheet = pathToFileURL(path.join(root, 'dmv-road-signs-cheat-sheet.html')).href;
      await page.goto(sheet);
      await page.getByRole('link', { name: 'Compare curve warnings' }).press('Enter');
      await page.waitForURL(sheet + '#curve-warning-check');
      const lesson = page.getByRole('region', { name: 'One curve, reverse curves, or a winding road?' });
      const images = lesson.getByRole('img');
      assert.equal(await images.count(), 3);
      assert.match(await images.nth(0).getAttribute('alt'), /right-bending arrow/i);
      assert.match(await images.nth(1).getAttribute('aria-label'), /right.*left/i);
      assert.match(await images.nth(2).getAttribute('alt'), /several bends/i);
      const details = lesson.locator('details');
      assert.equal(await details.count(), 2);
      await details.nth(0).locator('summary').press('Enter');
      assert.match(await details.nth(0).innerText(), /right first.*then left/i);
      await details.nth(1).locator('summary').press('Enter');
      assert.match(await details.nth(1).innerText(), /slow before the first bend.*stay in your lane/i);
      assert.equal(await lesson.getByRole('link', { name: 'Practice curve warning signs' }).getAttribute('href'),
        'road-signs-practice-test.html?mode=road-signs-core&focus=Alignment+warning+signs#practice');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (process.env.VERIFY_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
        await lesson.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `curve-check-${width}.png`) });
      }
    } finally { await context.close(); }
  });
}

test('the curve lesson opens the existing alignment set with unchanged grading', { timeout: 15000 }, async () => {
  const context = await browser.newContext();
  await context.route(/^https?:/, route => route.abort());
  const page = await context.newPage();
  try {
    await page.goto(pathToFileURL(path.join(root, 'dmv-road-signs-cheat-sheet.html')).href + '#curve-warning-check');
    await page.getByRole('link', { name: 'Practice curve warning signs' }).click();
    const quiz = page.locator('[data-mode-panel="road-signs-core"].is-active [data-quiz]');
    assert.equal(await quiz.locator('[data-quiz-filter]').inputValue(), 'Alignment warning signs');
    assert.equal(await quiz.locator('.question').count(), 40);
    assert.equal(await quiz.getAttribute('data-pass-score'), '32');
    const curve = quiz.locator('.question[data-flashcard-key="curve"]');
    assert.ok(await curve.isVisible());
    const quizArt = await curve.locator('svg path[fill="none"]').getAttribute('d');
    await curve.getByRole('button', { name: 'Reduce speed before the road bends', exact: true }).press('Enter');
    assert.match(await curve.locator('.feedback').innerText(), /^Correct\..*bends right once\./);
    assert.ok(await curve.locator('[data-quiz-source] a').isVisible());
    const libraryImage = page.locator('img[src$="curve-road-sign.svg"]').first();
    assert.ok(await libraryImage.evaluate(async img => {
      img.loading = 'eager';
      await img.decode();
      return img.naturalWidth === 220;
    }));
    const flashPage = pathToFileURL(path.join(root, 'dmv-road-sign-flashcards.html')).href;
    await page.goto(flashPage);
    const flashArt = page.locator('[data-flashcard][data-card-id="curve"] svg path[fill="none"]').first();
    assert.equal(await flashArt.getAttribute('d'), quizArt);
  } finally { await context.close(); }
});

for (const width of [390, 1280]) {
  test(`${width}px: entry control and wrong-way feedback teach different decisions`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 850 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    try {
      await page.goto(pathToFileURL(path.join(root, 'road-signs-practice-test.html')).href + '?mode=road-signs-core#practice');
      const quiz = page.locator('[data-mode-panel="road-signs-core"].is-active [data-quiz]');
      for (const [key, choice, explanation, official] of [
        ['do-not-enter', 'Do not drive into this roadway or ramp',
          /entry from this approach is prohibited.*even if the road looks empty/i,
          'https://www.pa.gov/agencies/dmv/driver-services/pennsylvania-drivers-manual/online-drivers-manual/signs'],
        ['wrong-way', 'Pull over safely and correct your direction when safe',
          /do not continue against traffic.*pull over.*do not assume a U-turn is safe or permitted/i,
          'https://www.mass.gov/info-details/wrong-way-driving-program'],
      ]) {
        const question = quiz.locator(`.question[data-flashcard-key="${key}"]`).first();
        await quiz.locator(`[data-quiz-jump="${await question.getAttribute('data-question-index')}"]`).press('Enter');
        const source = question.locator('[data-quiz-source] a');
        assert.equal(await source.isVisible(), false);
        await question.getByRole('button', { name: choice, exact: true }).press('Enter');
        assert.match(await question.locator('.feedback').innerText(), explanation);
        assert.match(await question.locator('.feedback').innerText(), /^Correct\./);
        assert.equal(await source.getAttribute('href'), official);
        assert.ok(await source.isVisible());
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    } finally { await context.close(); }
  });

  test(`${width}px: Lane Ends feedback distinguishes preparation from the actual merge point`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 850 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    try {
      await page.goto(pathToFileURL(path.join(root, 'road-signs-practice-test.html')).href + '?mode=road-signs-core#practice');
      const quiz = page.locator('[data-mode-panel="road-signs-core"].is-active [data-quiz]');
      const question = quiz.locator('.question[data-flashcard-key="lane-ends"]');
      const index = await question.getAttribute('data-question-index');
      await quiz.locator(`[data-quiz-jump="${index}"]`).press('Enter');
      assert.ok(await question.isVisible());
      const source = question.locator('[data-quiz-source] a');
      assert.equal(await source.isVisible(), false);
      await question.getByRole('button', { name: 'A lane will end and traffic must merge', exact: true }).press('Enter');
      const explanation = await question.locator('.feedback').innerText();
      assert.match(explanation, /^Correct\./);
      assert.match(explanation, /follow posted directions and lane markings.*backed-up work zone.*take turns at the merge point/i);
      assert.match(explanation, /without a backup.*safe to move over earlier/i);
      assert.equal(await source.getAttribute('href'), 'https://www.dot.state.mn.us/zippermerge/');
      assert.ok(await source.isVisible());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    } finally { await context.close(); }
  });
}

for (const width of [320, 1280]) {
  test(`${width}px: the railroad lesson separates escape, safe calling, and the missing-sign fallback`, async () => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 850 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    try {
      const finder = pathToFileURL(path.join(root, 'road-sign-shapes-and-colors-finder.html')).href;
      await page.goto(finder + '#railroad-crossing-check');
      await page.getByRole('link', { name: 'What if a vehicle stalls on the tracks?' }).press('Enter');
      await page.waitForURL(finder + '#railroad-stall-response');
      const lesson = page.getByRole('region', { name: /get everyone out first/ });
      const heading = await lesson.getByRole('heading').boundingBox();
      const header = await page.locator('.site-header').boundingBox();
      assert.ok(heading.y >= header.y + header.height);
      assert.match(await lesson.locator(':scope > p').innerText(), /leave the vehicle.*move everyone away.*even if you do not see a train/i);
      const picture = lesson.getByRole('img', { name: /train approaches from the left.*arrow points diagonally.*away from the rails/i });
      assert.ok(await picture.evaluate(img => img.complete && img.naturalWidth === 432 && img.naturalHeight === 230));
      const approaching = lesson.locator('details').nth(0);
      const notVisible = lesson.locator('details').nth(1);
      assert.equal(await approaching.locator('p').isVisible(), false);
      assert.equal(await notVisible.locator('p').isVisible(), false);
      await approaching.locator('summary').press('Space');
      assert.match(await approaching.locator('p').innerText(), /diagonally away from the tracks.*down and left, not straight left along the rails.*safe distance, call 911/i);
      await notVisible.locator('summary').press('Enter');
      assert.match(await notVisible.locator('p').innerText(), /get out and move clear first.*safe place, call the railroad number.*posted crossing ID.*then directs you to call 911/i);
      assert.match(await notVisible.locator('p').innerText(), /not safely visible, call 911.*do not go back onto the tracks/i);
      assert.equal(await lesson.getByRole('link', { name: /FRA: blue-and-white/ }).getAttribute('href'),
        'https://railroads.dot.gov/railroad-safety/divisions/crossing-safety-and-trespass-prevention/emergency-notification');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (process.env.TRAIN_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.TRAIN_SCREENSHOTS_DIR, { recursive: true });
        await lesson.screenshot({ path: path.join(process.env.TRAIN_SCREENSHOTS_DIR, `railroad-stall-${width}.png`) });
      }
    } finally { await context.close(); }
  });

  test(`${width}px: the scored California railroad answer keeps its grading and cites the full escape instruction`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 850 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    try {
      await page.goto(pathToFileURL(path.join(root, 'california-dmv-permit-practice-test.html')).href + '?mode=mock#practice');
      const quiz = page.locator('[data-mode-panel="mock"].is-active [data-quiz]');
      const question = quiz.locator('[data-prompt="If your vehicle stalls on railroad tracks and a train is coming, you should:"]');
      await quiz.locator(`[data-quiz-jump="${await question.getAttribute('data-question-index')}"]`).press('Enter');
      const source = question.getByRole('link', { name: /Disabled Vehicles on Railroad Tracks/ });
      assert.equal(await source.isVisible(), false);
      await question.getByRole('button', { name: 'Leave the vehicle and move away from the tracks at an angle' }).press('Enter');
      assert.match(await question.locator('.feedback').innerText(), /^Correct\..*out immediately.*diagonally away.*do not run along the rails.*call 911 from a safe distance/i);
      assert.equal(await source.getAttribute('href'), 'https://www.dmv.ca.gov/portal/handbook/california-driver-handbook/safe-driving-cont2/');
      assert.ok(await source.isVisible());
      assert.equal(await quiz.getAttribute('data-pass-score'), '32');
      assert.equal(await quiz.getAttribute('data-total'), '40');
    } finally { await context.close(); }
  });

  test(`${width}px: compare downhill and blind-crest warnings without scripts`, async () => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 850 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    try {
      const finder = pathToFileURL(path.join(root, 'road-sign-shapes-and-colors-finder.html')).href;
      await page.goto(finder + '#shape-reference');
      await page.getByRole('link', { name: 'Compare two hill warnings' }).press('Enter');
      assert.equal(new URL(page.url()).hash, '#hill-warning-check');
      const lesson = page.locator('#hill-warning-check');
      const hill = lesson.getByRole('img', { name: /truck angled down to the left above a solid slope/ });
      const crest = lesson.getByRole('img', { name: /diamond reading Hill Blocks View/ });
      assert.ok(await hill.isVisible());
      assert.ok(await crest.isVisible());
      const first = lesson.locator('details').nth(0);
      const second = lesson.locator('details').nth(1);
      assert.equal(await first.locator('p').isVisible(), false);
      await first.locator('summary').press('Space');
      assert.match(await first.locator('p').innerText(), /warns of a steep descent.*reduce speed before the downgrade/i);
      assert.equal(await second.locator('p').isVisible(), false);
      await second.locator('summary').press('Enter');
      assert.match(await second.locator('p').innerText(), /crest limits how far you can see.*stop within the visible road.*do not pull out to pass/i);
      assert.equal(await lesson.getByRole('link', { name: /Figure 2C-5/ }).getAttribute('href'),
        'https://mutcd.fhwa.dot.gov/pdfs/11th_Editionr1/Chapter2cr1.pdf#page=23');
      const onward = new URL(await lesson.getByRole('link', { name: /Practice the descent sign/ }).getAttribute('href'), page.url());
      assert.match(onward.pathname, /new-york-dmv-road-signs-practice\.html$/);
      assert.equal(onward.searchParams.get('focus'), 'Road condition signs');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (process.env.HILL_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.HILL_SCREENSHOTS_DIR, { recursive: true });
        await lesson.screenshot({ path: path.join(process.env.HILL_SCREENSHOTS_DIR, `hill-lesson-${width}.png`) });
      }
    } finally { await context.close(); }
  });

  test(`${width}px: the downhill sign is consistent and contained across all four state quiz surfaces`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 850 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    try {
      await page.goto(pathToFileURL(path.join(root, 'road-sign-shapes-and-colors-finder.html')).href + '#hill-warning-check');
      const art = await page.locator('#hill-warning-check [role="img"]').first().locator('svg').evaluate(svg => svg.outerHTML);
      const raster = art.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="160" ');
      const { data, info } = await sharp(Buffer.from(raster)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let glyphPixels = 0;
      let outside = 0;
      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          const p = (y * info.width + x) * info.channels;
          if (data[p] >= 26 || data[p + 1] >= 26 || data[p + 2] >= 26 || data[p + 3] < 236) continue;
          glyphPixels++;
          if (Math.abs(x - 110) / 80 + Math.abs(y - 80) / 66 > 0.94) outside++;
        }
      }
      assert.ok(glyphPixels > 900, 'the truck and slope are visible');
      assert.equal(outside, 0, 'the black glyph never crosses the diamond edge');
      for (const state of ['california', 'new-york']) {
        for (const entry of ['permit-practice-test', 'road-signs-practice']) {
          const guideEntry = state === 'new-york' && entry === 'road-signs-practice';
          if (guideEntry) {
            await page.goto(pathToFileURL(path.join(root, 'road-sign-shapes-and-colors-finder.html')).href + '#hill-warning-check');
            await page.locator('#hill-warning-check').getByRole('link', { name: /Practice the descent sign/ }).press('Enter');
            await page.waitForURL('**/new-york-dmv-road-signs-practice.html?mode=signs&focus=Road%20condition%20signs#practice');
          } else {
            await page.goto(pathToFileURL(path.join(root, `${state}-dmv-${entry}.html`)).href + '?mode=signs#practice');
          }
          const quiz = page.locator('[data-mode-panel="signs"].is-active [data-quiz]');
          const question = quiz.locator('.question').filter({ has: page.locator('[data-quiz-image-key="hill-ahead"]') });
          let index = await question.getAttribute('data-question-index');
          if (guideEntry) {
            assert.equal(await quiz.locator('[data-quiz-filter]').inputValue(), 'Road condition signs');
            index = await question.evaluate(el => Array.from(el.parentElement.querySelectorAll('.question'))
              .filter(q => q.dataset.category === 'Road condition signs').indexOf(el));
            assert.ok(index >= 0);
          }
          await quiz.locator(`[data-quiz-jump="${index}"]`).press('Enter');
          const picture = question.getByRole('img', { name: /truck angled down to the left above a solid slope/ });
          assert.ok(await picture.isVisible(), `${state} ${entry}`);
          assert.equal(await picture.locator('svg').evaluate(svg => svg.outerHTML), art);
          assert.equal(await question.getAttribute('data-answer'), '0');
          const source = question.getByRole('link', { name: /FHWA: Hill sign/ });
          assert.equal(await source.isVisible(), false);
          await question.locator('[data-choice="0"]').press('Enter');
          assert.match(await question.locator('.feedback').innerText(), /^Correct\..*steep downgrade.*before descending.*passenger car/is);
          assert.ok(await source.isVisible());
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        }
      }
    } finally { await context.close(); }
  });

  test(`${width}px: classroom worksheet is usable by keyboard without scripts or a download`, async () => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 850 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    try {
      await page.goto(pathToFileURL(path.join(root, 'dmv-road-signs-cheat-sheet.html')).href);
      const anchor = page.locator('.printable-resource-hero').getByRole('link', { name: 'Use the online worksheet' });
      await anchor.press('Enter');
      assert.equal(new URL(page.url()).hash, '#online-worksheet');
      const sheet = page.locator('#online-worksheet');
      const heading = await sheet.getByRole('heading', { level: 2 }).boundingBox();
      const header = await page.locator('.site-header').boundingBox();
      assert.ok(heading.y >= header.y + header.height && heading.y < 850);
      const parts = sheet.locator('.worksheet-part');
      assert.equal(await parts.count(), 3);
      assert.equal(await sheet.locator('.worksheet-part[open]').count(), 0);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator(':focus').innerText(), '1. Name eight road signs');
      await page.keyboard.press('Space');
      const pictures = sheet.locator('.worksheet-pictures > li');
      assert.equal(await pictures.count(), 8);
      const image = pictures.first().getByRole('img', { name: /Red octagon with the word STOP in white/ });
      assert.equal(await image.isVisible(), true);
      assert.equal(await image.evaluate(img => img.decode().then(() => img.naturalWidth > 0)), true);
      const signReveal = pictures.first().getByText('Check sign 1', { exact: true });
      assert.equal(await pictures.first().locator('details p').first().isVisible(), false);
      const practice = pictures.first().getByRole('link', { name: 'Practice the sign group for Stop', includeHidden: true });
      assert.equal(await practice.isVisible(), false);
      await signReveal.press('Enter');
      assert.match(await pictures.first().locator('details p').first().innerText(), /Come to a complete stop/);
      assert.ok(await practice.isVisible());
      await signReveal.press('Enter');
      assert.equal(await pictures.first().locator('details p').first().isVisible(), false);
      if (process.env.CLASSROOM_SHOTS) {
        await page.screenshot({ path: path.join(process.env.CLASSROOM_SHOTS, `worksheet-${width}.png`) });
      }
      await parts.nth(1).locator(':scope > summary').press('Enter');
      const decisions = sheet.locator('.worksheet-decisions > li');
      assert.equal(await decisions.count(), 8);
      assert.equal(await decisions.first().locator('ol[type="A"] > li').count(), 3);
      await decisions.first().locator('summary').press('Space');
      assert.match(await decisions.first().locator('details p').first().innerText(), /^B\. Stop before the line.*clear view/i);
      assert.ok(await decisions.first().getByRole('link', { name: 'Compare STOP and YIELD' }).isVisible());
      await parts.nth(2).locator(':scope > summary').press('Enter');
      await parts.nth(2).getByText('Check your reasoning', { exact: true }).press('Enter');
      assert.match(await parts.nth(2).locator('details p').first().innerText(), /joining traffic and leave space/);
      assert.ok(await parts.nth(2).getByRole('link', { name: 'Try the Added Lane comparison' }).isVisible());
      assert.equal(await sheet.getByRole('link', { name: /PennDOT/ }).isVisible(), true);
      assert.equal(await sheet.getByRole('link', { name: /FHWA/ }).isVisible(), true);
      assert.equal(await sheet.getByRole('link', { name: 'Try the 10-question picture quiz' }).getAttribute('href'),
        'road-signs-practice-test.html?mode=road-signs-starter#practice');
      assert.equal(await sheet.evaluate(el =>
        [...el.querySelectorAll('summary,li,img')].every(node => node.getBoundingClientRect().right <= innerWidth)), true);
      await page.emulateMedia({ media: 'print' });
      assert.equal(await sheet.isVisible(), false);
      assert.equal(await page.locator('#printable-sheet').isVisible(), true);
      assert.equal(await page.locator('#printable-sheet .cheat-sign-card').count(), 31);
    } finally { await context.close(); }
  });
}

test('lettering stays inside its red field and above the Keep Right diagram', async () => {
  const context = await browser.newContext();
  await context.route(/^https?:/, route => route.abort());
  const page = await context.newPage();
  try {
    await page.setContent(fs.readFileSync(path.join(root, 'assets/road-signs/do-not-enter-road-sign.svg'), 'utf8'));
    const inside = await page.locator('svg').evaluate(svg => {
      const c = svg.querySelector('circle');
      const cx = Number(c.getAttribute('cx')), cy = Number(c.getAttribute('cy')), r = Number(c.getAttribute('r'));
      return [...svg.querySelectorAll('text')].every(text => {
        const b = text.getBBox();
        return [[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]]
          .every(([x,y]) => Math.hypot(x-cx,y-cy) < r);
      });
    });
    assert.equal(inside, true);
    await page.setContent(fs.readFileSync(path.join(root, 'assets/road-signs/keep-right-road-sign.svg'), 'utf8'));
    assert.equal(await page.locator('svg').evaluate(svg => {
      const text = svg.querySelector('text').getBBox();
      return [...svg.querySelectorAll('path')].every(p => p.getBBox().y > text.y + text.height + 3);
    }), true);
  } finally { await context.close(); }
});

test('the Merge symbol joins two approaches into one arrow clear of the diamond border', async () => {
  const svg = fs.readFileSync(path.join(root, 'assets/road-signs/merge-road-sign.svg'));
  const { data, info } = await sharp(svg, { density: 144 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const scale = info.width / 220;
  const points = [];
  const runs = new Map();
  for (let y = 0; y < info.height; y++) {
    let runsOnRow = 0;
    let lastWasInk = false;
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      // The artwork uses #111 for the symbol and #222 for the outline.
      const ink = data[i] === 17 && data[i + 1] === 17 && data[i + 2] === 17 && data[i + 3] === 255;
      if (ink) points.push([(x + 0.5) / scale, (y + 0.5) / scale]);
      if (ink && !lastWasInk) runsOnRow++;
      lastWasInk = ink;
    }
    runs.set(y, runsOnRow);
  }
  assert.ok(points.length > 500, 'the symbol must render');
  const clearance = Math.min(...points.map(([x, y]) =>
    (1 - Math.abs(x - 110) / 80 - Math.abs(y - 80) / 66) / Math.hypot(1 / 80, 1 / 66)));
  assert.ok(clearance >= 8, `the symbol must clear the border (got ${clearance.toFixed(1)} px)`);
  assert.equal(runs.get(108 * scale), 2, 'two distinct approaches below the join');
  assert.equal(runs.get(74 * scale), 1, 'a single lane above the join');
  assert.equal(runs.get(56 * scale), 1, 'a single arrowhead');
  const widthAt = n => points.filter(([, y]) => Math.floor(y) === n).length;
  assert.ok(widthAt(56) > widthAt(71) * 1.5, 'the arrowhead must widen beyond the stem');
});

test('all eight classroom PDF images exactly preserve rendered shared SVG pixels', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tdt-art-test-'));
  try {
    const keys = ['stop','yield','do-not-enter','speed-limit','merge','school-crossing','railroad','slippery'];
    await render('art', directory, keys);
    const expected = [];
    for (const key of keys) {
      const raw = await sharp(path.join(directory, `${key}.png`)).removeAlpha().raw().toBuffer();
      expected.push(crypto.createHash('sha256').update(raw).digest('hex'));
    }
    const actual = JSON.parse(execFileSync(process.env.PYTHON_BIN || 'python3', ['-c',
      'import json,hashlib;from pypdf import PdfReader;from pathlib import Path;p=PdfReader(Path("dmv-road-signs-classroom-worksheet.pdf"));print(json.dumps([hashlib.sha256(x.image.convert("RGB").tobytes()).hexdigest() for x in p.pages[0].images]))',
    ], { cwd: root, encoding: 'utf8' }));
    assert.deepEqual(actual.sort(), expected.sort());
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

for (const width of [1280, 390]) {
  test(`${width}px: roundabout arrows run counterclockwise and bicycle stays inside the sign`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    const local = name => pathToFileURL(path.join(root, name + '.html')).href;
    try {
      await page.goto(local('road-signs-practice-test') + '?mode=road-signs-core#practice');
      const quiz = page.locator('[data-mode-panel="road-signs-core"] [data-quiz]');
      const signs = [
        ['roundabout', 'At a roundabout warning sign, which action should come first?', 'Yellow diamond with three black arrows curving counterclockwise around the center.', 'Slow down and look for traffic already circulating', /yield to traffic already circulating.*counterclockwise/],
        ['bicycle-crossing', 'What hazard does this bicycle sign warn about?', 'Yellow diamond with a black bicycle drawn with two outlined wheels.', 'Bicyclists may enter or cross the roadway', /fluorescent yellow-green background can give the same warning/],
      ];
      for (const [key, prompt, description, answer, reason] of signs) {
        const question = quiz.locator(`.question[data-flashcard-key="${key}"][data-prompt="${prompt}"]`);
        await quiz.locator(`[data-quiz-jump="${await question.getAttribute('data-question-index')}"]`).click();
        const svg = question.getByRole('img', { name: description, exact: true }).locator('svg');
        if (key === 'roundabout') {
          const directions = await svg.evaluate(el => [...el.querySelectorAll('g')].map(group => {
            const arc = group.querySelector('path'), pts = group.querySelector('polygon').points;
            const length = arc.getTotalLength(), from = arc.getPointAtLength(length / 2), to = arc.getPointAtLength(length / 2 + 1);
            const before = arc.getPointAtLength(length - 1), end = arc.getPointAtLength(length);
            const tip = pts.getItem(0), b1 = pts.getItem(1), b2 = pts.getItem(2);
            const turn = (from.x - 110) * (to.y - from.y) - (from.y - 80) * (to.x - from.x);
            const forward = (tip.x - (b1.x + b2.x) / 2) * (end.x - before.x) + (tip.y - (b1.y + b2.y) / 2) * (end.y - before.y);
            return { turn, forward, rotation: group.transform.baseVal.getItem(0).angle };
          }));
          assert.deepEqual(directions.map(d => d.rotation), [0, 120, 240]);
          assert.ok(directions.every(d => d.turn < 0 && d.forward > 0));
        } else {
          const wheelsAndFrameInside = await svg.evaluate(el => [...el.querySelectorAll('circle,path')].every(shape => {
            const { x, y, width, height } = shape.getBBox(), margin = Number(shape.getAttribute('stroke-width')) / 2;
            return [x - margin, x + width + margin].every(a => [y - margin, y + height + margin].every(b => Math.abs(a - 110) / 80 + Math.abs(b - 80) / 66 < 0.96));
          }));
          assert.equal(wheelsAndFrameInside, true);
        }
        await question.getByRole('button', { name: answer, exact: true }).click();
        assert.match(await question.locator('.feedback').innerText(), /^Correct\./);
        assert.match(await question.locator('.feedback').innerText(), reason);
      }
      await page.goto(local('dmv-road-sign-flashcards'));
      await page.getByRole('searchbox', { name: 'Search cards' }).fill('roundabout');
      const card = page.locator('[data-flashcard][data-card-id="roundabout"]');
      assert.equal(await card.getByRole('img', { name: /three black arrows curving counterclockwise/ }).isVisible(), true);
      await card.getByRole('button', { name: 'Reveal answer', exact: true }).click();
      assert.match(await card.innerText(), /yield before entering a roundabout/);
      if (process.env.WARNING_ART_SHOTS) await card.screenshot({ path: path.join(process.env.WARNING_ART_SHOTS, `roundabout-${width}.png`) });
    } finally { await context.close(); }
  });

  test(`${width}px: two corrected warnings agree in quiz, flashcards, and print`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    const local = name => pathToFileURL(path.join(root, name + '.html')).href;
    try {
      await page.goto(local('road-signs-practice-test') + '?mode=road-signs-core#practice');
      const quiz = page.locator('[data-mode-panel="road-signs-core"] [data-quiz]');
      const target = quiz.locator('.question[data-flashcard-key="stop-ahead"]');
      await quiz.locator(`[data-quiz-jump="${await target.getAttribute('data-question-index')}"]`).click();
      const diagram = target.getByRole('img', { name: /upward arrow above a plain red octagon/ });
      const arrow = await diagram.locator('path').boundingBox();
      const octagon = await diagram.locator('polygon[fill="#c7312f"]').boundingBox();
      assert.ok(arrow.y + arrow.height < octagon.y);
      assert.equal(await diagram.locator('text').count(), 0);
      await target.getByRole('button', { name: 'Prepare to stop completely at the stop sign ahead' }).click();
      assert.match(await target.locator('.feedback').innerText(), /^Correct\..+not beside the yellow warning sign/);
      await page.goto(local('dmv-road-sign-flashcards'));
      await page.getByRole('searchbox', { name: 'Search cards' }).fill('stop ahead');
      const card = page.locator('[data-flashcard][data-card-id="stop-ahead"]');
      assert.equal(await card.isVisible(), true);
      assert.equal(await card.getByRole('img', { name: /black upward arrow above a plain red octagon/ }).isVisible(), true);
      await card.getByRole('button', { name: 'Reveal answer', exact: true }).click();
      assert.match(await card.innerText(), /Slow now; stop at the actual control/);
      await page.getByRole('searchbox', { name: 'Search cards' }).fill('two-way traffic');
      const twoWay = page.locator('[data-flashcard][data-card-id="two-way-traffic"]');
      assert.equal(await twoWay.getByRole('img', { name: /pointing down on the left and up on the right/ }).isVisible(), true);
      await twoWay.getByRole('button', { name: 'Reveal answer', exact: true }).click();
      assert.match(await twoWay.innerText(), /Keep right and expect oncoming traffic/);
      await page.goto(local('dmv-road-signs-cheat-sheet') + '#printable-sheet');
      await page.emulateMedia({ media: 'print' });
      const printCard = page.locator('.cheat-sign-card').filter({ has: page.getByRole('img', { name: 'Stop Ahead road sign', exact: true }) });
      assert.match(await printCard.innerText(), /above a red octagon.*Slow now/);
      const art = printCard.getByRole('img');
      assert.equal(await art.getAttribute('src'), 'assets/road-signs/stop-ahead-road-sign.svg');
      await art.evaluate(img => img.decode());
      if (process.env.STOP_AHEAD_SHOTS) {
        await printCard.screenshot({ path: path.join(process.env.STOP_AHEAD_SHOTS, `stop-ahead-${width}.png`) });
      }
    } finally { await context.close(); }
  });

  test(`${width}px: the red ALL WAY plaque matches feedback, aliases and the print reference`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    const local = name => pathToFileURL(path.join(root, name + '.html')).href;
    try {
      for (const [file, mode, answer] of [
        ['regulatory-traffic-signs-practice-test', 'regulatory-signs-core', 'Every approach has a stop sign, so drivers must stop and use right-of-way order'],
        ['florida-dmv-road-signs-practice', 'florida-regulatory-starter', 'All approaches must stop, then use right-of-way order'],
      ]) {
        await page.goto(local(file) + `?mode=${mode}#practice`);
        const quiz = page.locator('[data-mode-panel].is-active [data-quiz], [data-quiz]:visible');
        const item = quiz.locator('.question[data-prompt*="ALL WAY"]');
        await quiz.locator(`[data-quiz-jump="${await item.getAttribute('data-question-index')}"]`).click();
        const diagram = item.getByRole('img', { name: /red plaque below it reading ALL WAY in white/ });
        assert.deepEqual(await diagram.locator('text').allTextContents(), ['STOP', 'ALL WAY']);
        const gap = await diagram.evaluate(art => {
          const octagon = art.querySelector('polygon').getBoundingClientRect();
          const plaque = art.querySelector('rect[fill="#c7312f"]').getBoundingClientRect();
          return plaque.top - octagon.bottom;
        });
        assert.ok(gap > 0, `Expected a visible gap in ${file}; got ${gap}px`);
        const source = item.getByRole('link', { name: 'FHWA: ALL WAY sign diagram' });
        assert.equal(await source.isVisible(), false);
        await item.getByRole('button', { name: answer, exact: true }).click();
        assert.match(await item.locator('.feedback').innerText(), /^Correct\..*ALL WAY/);
        assert.match(await source.getAttribute('href'), /Chapter2br1\.pdf#page=10$/);
        assert.equal(await source.isVisible(), true);
      }
      await page.goto(local('dmv-road-sign-flashcards'));
      const search = page.getByRole('searchbox', { name: 'Search cards' });
      const card = page.locator('[data-card-id="four-way-stop"]');
      for (const name of ['all way stop', '4-way stop', 'four-way stop']) {
        await search.fill(name);
        assert.equal(await card.isVisible(), true);
      }
      assert.match(await card.getByRole('img').getAttribute('aria-label'), /red plaque.*ALL WAY in white/);
      await card.getByRole('button', { name: 'Reveal answer', exact: true }).click();
      assert.match(await card.innerText(), /All-Way Stop.*ALL WAY means every approach stops/s);
      if (process.env.VERIFY_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
        await card.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `all-way-${width}.png`) });
      }
      await page.goto(local('dmv-road-signs-cheat-sheet') + '#printable-sheet');
      const printCard = page.locator('.cheat-sign-card').filter({ has: page.getByRole('img', { name: 'All-Way Stop road sign', exact: true }) });
      assert.match(await printCard.innerText(), /ALL WAY means every approach stops/);
      await printCard.getByRole('img').evaluate(img => img.decode());
    } finally { await context.close(); }
  });

  test(`${width}px: compare the two passing signs and still score the rectangular sign correctly`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    try {
      const local = (name) => pathToFileURL(path.join(root, name + '.html')).href;
      await page.goto(local('road-sign-shapes-and-colors-finder'));
      const comparison = page.locator('#passing-sign-check');
      await page.locator('[data-sign-search]').fill('pennant');
      await page.getByRole('link', { name: 'Compare the two signs' }).click();
      assert.equal(new URL(page.url()).hash, '#passing-sign-check');
      const heading = await comparison.locator('h2').boundingBox();
      const header = await page.locator('.site-header').boundingBox();
      assert.ok(heading.y >= header.y + header.height);
      assert.equal(await comparison.getByRole('img', {name: /white rectangle/}).locator('rect').getAttribute('fill'), '#fff');
      assert.equal(await comparison.getByRole('img', {name: /yellow pennant/}).locator('polygon').getAttribute('fill'), '#f6d54a');
      assert.deepEqual(await comparison.getByRole('img', {name: /yellow pennant/}).locator('text').allTextContents(), ['NO', 'PASSING', 'ZONE']);
      const explanation = comparison.locator('details').first();
      assert.equal(await explanation.locator('p').isVisible(), false);
      await explanation.locator('summary').press('Enter');
      assert.match(await explanation.locator('p').innerText(), /start of the zone on the left/);
      const clearRoad = comparison.locator('details').filter({ hasText: 'The road is clear, but the white sign is posted' });
      assert.equal(await clearRoad.count(), 1);
      await clearRoad.locator('summary').press('Enter');
      assert.match(await clearRoad.locator('p').innerText(), /Stay behind the car.*A clear view does not cancel.*yellow pennant/is);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      if (process.env.PASSING_SIGN_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.PASSING_SIGN_SCREENSHOTS_DIR, { recursive: true });
        await page.screenshot({path: path.join(process.env.PASSING_SIGN_SCREENSHOTS_DIR, `passing-${width}.png`)});
      }
      await comparison.getByRole('link', {name: 'Practice the white Do Not Pass sign'}).click();
      await page.waitForLoadState('load');
      assert.equal(new URL(page.url()).searchParams.get('focus'), 'Passing signs');
      const regulatory = page.locator('.mode-panel.is-active .question.is-active[data-category="Passing signs"]');
      await regulatory.getByRole('button', { name: 'Passing another vehicle in this zone', exact: true }).press('Enter');
      assert.match(await regulatory.locator('.feedback').innerText(), /^Correct\..*do not pass the car ahead even if the road looks clear/i);
      assert.ok(await regulatory.getByRole('link', { name: 'FHWA 2B.36: Do Not Pass' }).isVisible());
      await page.goto(local('road-signs-practice-test') + '?mode=road-signs-core#practice');
      const quiz = page.locator('[data-mode-panel="road-signs-core"] [data-quiz]');
      const target = quiz.locator('.question', {hasText: 'What does this white rectangular sign mean?'});
      await quiz.locator(`[data-quiz-jump="${await target.getAttribute('data-question-index')}"]`).click();
      assert.equal(await target.evaluate(node => node.classList.contains('is-active')), true);
      await target.getByRole('button', {name: /No passing is allowed in this zone/}).click();
      assert.match(await target.locator('.feedback').innerText(), /^Correct\..+yellow NO PASSING ZONE pennant is a different sign/);
    } finally { await context.close(); }
  });

  test(`${width}px: state sign feedback distinguishes a posted restriction from road visibility`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    try {
      const url = pathToFileURL(path.join(root, 'florida-dmv-road-signs-practice.html')).href;
      await page.goto(url + '?mode=signs#practice');
      const quiz = page.locator('[data-mode-panel="signs"].is-active [data-quiz]');
      const question = quiz.locator('.question[data-category="Passing signs"]');
      await quiz.locator(`[data-quiz-jump="${await question.getAttribute('data-question-index')}"]`).press('Enter');
      await question.getByRole('button', { name: 'Pass other vehicles in this zone', exact: true }).press('Enter');
      assert.match(await question.locator('.feedback').innerText(), /^Correct\..*do not pass the car ahead even if the road looks clear/i);
      const source = question.getByRole('link', { name: 'FHWA 2B.36: Do Not Pass' });
      assert.ok(await source.isVisible());
      assert.equal(await source.getAttribute('href'), 'https://mutcd.fhwa.dot.gov/pdfs/11th_Editionr1/Chapter2br1.pdf#page=38');
    } finally { await context.close(); }
  });

  test(`${width}px: find the crossbuck and decide whether to enter when traffic backs up`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    try {
      await page.goto(pathToFileURL(path.join(root, 'road-sign-shapes-and-colors-finder.html')).href);
      const search = page.locator('[data-sign-search]');
      const results = page.locator('[data-sign-card]:visible');
      assert.equal(await results.count(), 13);
      const columns = await page.locator('.shape-finder .sign-lookup-grid').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length);
      assert.equal(columns, width <= 680 ? 1 : 3);
      for (const term of ['crossbuck', 'white x']) {
        await search.fill(term);
        assert.equal(await results.count(), 1);
        assert.match(await results.innerText(), /crossbuck.*crossing/is);
      }
      await results.getByRole('link', { name: 'Compare railroad signs' }).click();
      assert.equal(new URL(page.url()).hash, '#railroad-crossing-check');
      const compare = page.getByRole('region', { name: 'Railroad warning ahead or crossing here?' });
      const [heading, header] = await Promise.all([compare.getByRole('heading').boundingBox(), page.locator('.site-header').boundingBox()]);
      assert.ok(heading.y >= header.y + header.height);
      assert.equal(await compare.getByRole('img', { name: /yellow circle/ }).count(), 1);
      const crossbuck = compare.getByRole('img', { name: /white X-shaped/ });
      assert.deepEqual(await crossbuck.locator('svg text').allTextContents(), ['RAIL', 'ROAD', 'CROSSING']);
      const fit = await crossbuck.locator('svg').evaluate(svg => [...svg.querySelectorAll('g')].every(blade => {
        const r = blade.querySelector('rect').getBBox();
        return [...blade.querySelectorAll('text')].every(text => {
          const box = text.getBBox();
          return box.x >= r.x && box.x + box.width <= r.x + r.width && box.y >= r.y && box.y + box.height <= r.y + r.height;
        });
      }));
      assert.ok(fit);
      const [decision, transfer] = await compare.locator('details').all();
      assert.equal(await decision.locator('p').isVisible(), false);
      await decision.locator('summary').press('Enter');
      assert.match(await decision.innerText(), /before the tracks.*entire vehicle.*clear the last rail/is);
      assert.match(await decision.innerText(), /do not enter.*lights.*flashing.*gate/is);
      await transfer.locator('summary').press('Enter');
      assert.match(await transfer.innerText(), /prepare to stop.*look both ways.*listen/is);
      assert.ok(await compare.getByRole('link', { name: /FHWA./ }).count());
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      if (process.env.RAILROAD_SIGN_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.RAILROAD_SIGN_SCREENSHOTS_DIR, { recursive: true });
        await compare.getByRole('heading').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(process.env.RAILROAD_SIGN_SCREENSHOTS_DIR, `railroad-${width}.png`) });
      }
      const practice = compare.getByRole('link', { name: 'Practice the round advance warning sign' });
      await practice.click();
      assert.equal(new URL(page.url()).searchParams.get('focus'), 'Warning signs');
    } finally { await context.close(); }
  });

  test(`${width}px: distinguish the median signs and apply both cues in the picture quiz`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    try {
      await page.goto(pathToFileURL(path.join(root, 'road-sign-shapes-and-colors-finder.html')).href);
      await page.getByRole('link', { name: 'Try the median signs', exact: true }).click();
      assert.equal(new URL(page.url()).hash, '#divided-highway-check');
      const compare = page.locator('#divided-highway-check');
      const heading = await compare.getByRole('heading').boundingBox();
      const header = await page.locator('.site-header').boundingBox();
      assert.ok(heading.y >= header.y + header.height);
      const pair = compare.locator('.contrast-sign-pair [role="img"] > svg');
      assert.equal(await pair.count(), 2);
      const metrics = await pair.evaluateAll(signs => signs.map(sign => {
        const median = sign.querySelector(':scope > path').getBBox();
        const [left, right] = [...sign.querySelectorAll('g')].map(arrow => {
          const shaft = arrow.querySelector('path');
          const tail = shaft.getPointAtLength(0);
          const tip = arrow.querySelector('polygon').points.getItem(0);
          return {tailX: tail.x, tailY: tail.y, tipX: tip.x, tipY: tip.y};
        });
        return {medianY: median.y + median.height / 2, left, right};
      }));
      assert.ok(metrics.every(({left, right}) => left.tipY > left.tailY && right.tipY < right.tailY));
      assert.ok(metrics[0].medianY < 80 && metrics[0].right.tipX > metrics[0].right.tailX);
      assert.ok(metrics[1].medianY > 80 && metrics[1].right.tipX < metrics[1].right.tailX);
      const detail = compare.locator('details');
      assert.equal(await detail.locator('p').first().isVisible(), false);
      await detail.locator('summary').press('Enter');
      assert.match(await detail.innerText(), /B, Divided Highway Ends\..*instead of across a physical barrier/s);
      assert.match(await detail.innerText(), /A, Divided Highway\..*warning, not a Keep Right sign/s);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      if (process.env.MEDIAN_SIGN_SHOTS) await compare.screenshot({path: path.join(process.env.MEDIAN_SIGN_SHOTS, `median-${width}.png`)});
      await compare.getByRole('link', {name: 'Practice both signs in the full California picture set'}).click();
      assert.equal(new URL(page.url()).searchParams.get('mode'), 'signs');
      const quiz = page.locator('[data-mode-panel="signs"] [data-quiz]');
      for (const [cue, answer, feedback] of [
        ['widens toward a black divider at the top', 'A divided roadway or median begins', /bends outward/],
        ['narrows above a black divider at the bottom', 'The median or divider ends and opposing traffic will be closer', /bends toward the center/],
      ]) {
        const question = quiz.locator('.question').filter({has: page.locator(`[role="img"][aria-label*="${cue}"]`)});
        await quiz.locator(`[data-quiz-jump="${await question.getAttribute('data-question-index')}"]`).click();
        await question.getByRole('button', {name: answer, exact: true}).click();
        const reply = await question.locator('.feedback').innerText();
        assert.match(reply, /^Correct\./);
        assert.match(reply, feedback);
      }
    } finally { await context.close(); }
  });

  test(`${width}px: printed study links point to live groups and the scan lands below the header`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 840 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    try {
      await page.goto(pathToFileURL(path.join(root, 'dmv-road-signs-cheat-sheet.html')).href + '#printable-sheet');
      const heading = await page.locator('#printable-sheet h2').first().boundingBox();
      const header = await page.locator('.site-header').boundingBox();
      assert.ok(heading.y >= header.y + header.height);
      assert.equal(await page.locator('.print-practice-access').isVisible(), false);
      const screenLinks = await page.locator('.cheat-group-practice-link').evaluateAll(links =>
        links.map(link => new URL(link.getAttribute('href'), 'https://testdaytools.com/').href));
      const printLinks = page.locator('.cheat-print-group-link');
      assert.equal(await printLinks.first().isVisible(), false);
      await page.emulateMedia({ media: 'print' });
      assert.equal(await page.locator('.print-practice-access').isVisible(), true);
      assert.equal(await page.locator('.cheat-group-practice-link').first().isVisible(), false);
      assert.deepEqual(await printLinks.evaluateAll(links => links.map(link => link.href)), screenLinks);
      assert.ok(await page.locator('.print-practice-access img').evaluate(img => img.complete && img.naturalWidth > 0));
    } finally { await context.close(); }
  });

  test(`${width}px: Illinois rendered warning signs match the shared art cues`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    try {
      await page.goto(pathToFileURL(path.join(root, 'illinois-dmv-road-signs-practice.html')).href + '#sign-library');
      const library = page.locator('#sign-library');
      const lane = library.getByRole('img', {name: 'Lane Ends', exact: true});
      const slippery = library.getByRole('img', {name: 'Slippery When Wet', exact: true});
      assert.equal(await lane.locator('path[stroke-dasharray]').count(), 1);
      assert.equal(await lane.locator('path[fill="none"]').count(), 2);
      assert.equal(await lane.locator('polygon').count(), 1);
      assert.equal(await slippery.locator('path').last().evaluate(path => (path.getAttribute('d').match(/M/g) || []).length), 2);
      const setBack = await lane.locator('svg').evaluate(svg => {
        const outline = svg.querySelector('polygon');
        for (const path of svg.querySelectorAll('path')) {
          const length = path.getTotalLength();
          const radius = Number(path.getAttribute('stroke-width')) / 2 + 2.5;
          for (let i = 0; i <= 160; i++) {
            const p = path.getPointAtLength(length * i / 160);
            for (let j = 0; j < 16; j++) {
              const a = j * Math.PI / 8;
              if (!outline.isPointInFill(new DOMPoint(p.x + radius * Math.cos(a), p.y + radius * Math.sin(a)))) return false;
            }
          }
        }
        return true;
      });
      assert.equal(setBack, true);
      if (process.env.VERIFY_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
        await lane.locator('..').screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `lane-ends-${width}.png`) });
        await slippery.locator('..').screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `slippery-${width}.png`) });
      }
    } finally { await context.close(); }
  });

  for (const [slug, id, label, count, quizModes, reviewEntry] of localRules) {
    test(`${width}px: ${slug} local cases are keyboard-readable and separate from the quiz`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: false });
      await context.route(/^https?:/, route => route.abort());
      const page = await context.newPage();
      try {
        if (reviewEntry) {
          const [entrySlug, entryLabel] = reviewEntry;
          await page.goto(pathToFileURL(path.join(root, `${entrySlug}.html`)).href);
          await page.getByRole('link', {name: entryLabel, exact: true}).click();
          await page.waitForURL(url => url.pathname.endsWith(`/${slug}.html`) && url.hash === `#${id}`);
          await page.locator(`#${id}`).getByRole('heading', {level: 2}).waitFor();
        }
        await page.goto(pathToFileURL(path.join(root, `${slug}.html`)).href);
        const lesson = page.locator(`#${id}`);
        await page.getByRole('link', {name: label, exact: true}).click();
        assert.equal(new URL(page.url()).hash, `#${id}`);
        const heading = await lesson.locator('h2').boundingBox();
        const header = await page.locator('.site-header').boundingBox();
        assert.ok(heading.y >= header.y + header.height);
        assert(await lesson.getByRole('img').evaluate(img => img.complete && img.naturalWidth > 0));
        if (reviewEntry && process.env.VERIFY_SCREENSHOTS_DIR) {
          fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
          await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `${id}-arrival-${width}.png`) });
        }
        const cases = await lesson.locator('details').all();
        assert.equal(cases.length, count);
        for (const item of cases) {
          assert.equal(await item.locator('p').isVisible(), false);
          await item.locator('summary').focus();
          await page.keyboard.press('Enter');
          assert.equal(await item.locator('p').isVisible(), true);
        }
        assert.deepEqual(await page.locator('[data-quiz]').evaluateAll(quizzes => quizzes.map(q => [
          q.querySelectorAll('.question').length, Number(q.dataset.passScore),
        ])), quizModes);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        if (process.env.VERIFY_SCREENSHOTS_DIR) {
          fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
          await lesson.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `${id}-${width}.png`) });
        }
      } finally { await context.close(); }
    });
  }

  test(`${width}px: North Carolina sign recall works with JavaScript off and hides each answer independently`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: false });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    try {
      await page.goto(pathToFileURL(path.join(root, 'north-carolina-dmv-road-signs-practice.html')).href);
      await page.getByRole('link', {name: 'Try the no-choice sign drill', exact: true}).click();
      assert.equal(new URL(page.url()).hash, '#north-carolina-sign-recall');
      const drill = page.locator('#north-carolina-sign-recall');
      const heading = await drill.locator('h2').boundingBox();
      const header = await page.locator('.site-header').boundingBox();
      assert.ok(heading.y >= header.y + header.height);
      assert.deepEqual(await drill.getByRole('img').evaluateAll(images => images.map(img => [
        img.getAttribute('src').split('/').at(-1), Boolean(img.alt && img.complete && img.naturalWidth),
      ])), ['stop', 'signal-ahead', 'yield', 'slippery'].map(key => [`${key}-road-sign.svg`, true]));
      assert.equal(await page.locator('[data-quiz], #north-carolina-sign-recall :is(input, select, button)').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      if (process.env.RECALL_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.RECALL_SCREENSHOTS_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.RECALL_SCREENSHOTS_DIR, `recall-${width}-arrival.png`) });
      }
      const cards = await drill.locator('details').all();
      const actions = [/complete stop/, /Follow the actual traffic light/, /give the right-of-way/, /avoid sudden braking/];
      assert.equal(cards.length, actions.length);
      for (const [index, card] of cards.entries()) {
        const action = card.locator('p').last();
        assert.equal(await action.isVisible(), false);
        await card.locator('summary').focus();
        await page.keyboard.press('Enter');
        assert.equal(await action.isVisible(), true);
        assert.match(await action.textContent(), actions[index]);
        assert.equal(await drill.locator('details[open]').count(), 1);
        if (index === 0 && process.env.RECALL_SCREENSHOTS_DIR) {
          await page.screenshot({ path: path.join(process.env.RECALL_SCREENSHOTS_DIR, `recall-${width}-answer.png`) });
        }
        await page.keyboard.press('Enter');
        assert.equal(await action.isVisible(), false);
      }
    } finally { await context.close(); }
  });

  test(`${width}px: the shape finder distinguishes same-color signs and opens the right practice`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    try {
      const file = 'road-sign-shapes-and-colors-finder.html';
      await page.goto(pathToFileURL(path.join(root, file)).href);
      await page.getByRole('link', {name: 'Compare crossings'}).click();
      const drill = page.locator('#crossing-shape-check');
      const polygons = drill.locator('svg polygon');
      assert.deepEqual(await polygons.evaluateAll(nodes => nodes.map(node => [
        node.getAttribute('fill'), node.points.numberOfItems,
      ])), [['#c7e644', 4], ['#c7e644', 5]]);
      assert.equal(await polygons.first().evaluate(polygon => {
        const path = polygon.parentNode.querySelector('path');
        const length = path.getTotalLength();
        for (let i = 0; i <= 400; i++) {
          const p = path.getPointAtLength(i * length / 400);
          for (let j = 0; j < 16; j++) {
            const a = j * Math.PI / 8;
            if (!polygon.isPointInFill(new DOMPoint(p.x + 7 * Math.cos(a), p.y + 7 * Math.sin(a)))) return false;
          }
        }
        return true;
      }), true);
      assert.equal(await drill.getByRole('img').count(), 2);
      assert.equal(await drill.getByText('B is the school sign.').isVisible(), false);
      await drill.getByText('Compare the shape and symbol').focus();
      await page.keyboard.press('Enter');
      assert.equal(await drill.getByText('B is the school sign.').isVisible(), true);
      assert.equal(await drill.getByRole('link', {name: 'Compare the plaques below the school sign'}).getAttribute('href'),
        '#school-crossing-location');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      if (process.env.VERIFY_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
        await drill.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `crossing-check-${width}.png`) });
      }
      await drill.getByRole('link', {name: 'Practice school and pedestrian signs'}).click();
      await page.waitForURL(/road-signs-practice-test\.html\?focus=School%20and%20pedestrian%20signs#practice$/);
      const jumps = page.locator('[data-quiz-jump]:visible');
      assert.equal(await jumps.count(), 3);
      for (const jump of await jumps.all()) {
        await jump.click();
        const visible = page.locator('.question.is-active:visible');
        assert.equal(await visible.count(), 1);
        assert.equal(await visible.getAttribute('data-category'), 'School and pedestrian signs');
      }
    } finally { await context.close(); }
  });
  test(`${width}px: a direct lesson link clears the sticky site header`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    try {
      await page.goto(pathToFileURL(path.join(root, 'road-sign-learning-loop.html')).href + '#lesson-merge-lane-ends');
      const heading = await page.locator('#lesson-merge-lane-ends h3').boundingBox();
      const header = await page.locator('.site-header').boundingBox();
      assert.ok(heading.y >= header.y + header.height, JSON.stringify({ heading, header }));
      if (process.env.VERIFY_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `lesson-entry-${width}.png`) });
      }
    } finally { await context.close(); }
  });
  test(`${width}px: distinguish an added lane from a merge without JavaScript`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: false });
    try {
      await context.route(/^https?:/, route => route.abort());
      const page = await context.newPage();
      const url = pathToFileURL(path.join(root, 'road-sign-learning-loop.html')).href;
      await page.goto(url + '#lesson-merge-lane-ends');
      const transfer = page.getByRole('region', { name: 'Does the ramp traffic get its own lane?' });
      const sign = transfer.getByRole('img', { name: /arrows? .*stay separated/ });
      await sign.evaluate(image => image.decode());
      assert.equal(await sign.isVisible(), true);
      assert.equal(await sign.getAttribute('src'), 'assets/road-sign-materials/added-lane.svg');
      assert.match(await transfer.innerText(), /paths join into one arrow/);
      const explanation = transfer.getByText(/This is Added Lane/);
      assert.equal(await explanation.isVisible(), false);
      await transfer.locator('summary').press('Enter');
      assert.equal(await explanation.isVisible(), true);
      assert.match(await explanation.textContent(), /gets its own lane.*No merge or lane change.*Compare Merge.*Lane Ends/);
      assert.equal(await transfer.getByRole('link').getAttribute('href'), 'https://mutcd.fhwa.dot.gov/pdfs/11th_Editionr1/Chapter2cr1.pdf#page=38');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (process.env.VERIFY_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
        await transfer.evaluate(section => {
          const header = document.querySelector('.site-header');
          scrollBy(0, section.getBoundingClientRect().top - header.getBoundingClientRect().bottom - 12);
        });
        await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `added-lane-${width}.png`) });
      }
    } finally { await context.close(); }
  });
  for (const file of ['road-signs-practice-test.html', 'dmv-road-signs-cheat-sheet.html', 'road-sign-learning-loop.html']) {
    test(`${file} ${width}px: material record, images and unscored explanations`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.route(/^https?:/, route => route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(pathToFileURL(path.join(root, file)).href);
        await page.locator('img').evaluateAll(images => Promise.all(images.map(image => { image.loading = 'eager'; return image.decode(); })));
        assert.equal(await page.locator('#material-review').count(), 1);
        assert.match(await page.locator('#material-review').textContent(), /not a driving-instructor assessment/);
        if (file === 'road-sign-learning-loop.html') {
          assert.equal(await page.locator('.contrast-lesson').count(), 3);
          const savedPractice = () => page.evaluate(() => ['v1', 'v2'].map(version => localStorage.getItem(`tdt-learning-loop:${version}:all`)));
          const oldState = await savedPractice();
          for (const detail of await page.locator('.contrast-transfer').all()) {
            await detail.locator('summary').click();
            assert.equal(await detail.getAttribute('open'), '');
          }
          assert.deepEqual(await savedPractice(), oldState);
          assert.equal(await page.locator('.contrast-lesson .contrast-sign-pair img').count(), 6);
        } else {
          assert.equal(await page.locator('.material-links a[href^="road-sign-learning-loop.html#lesson-"]:visible').count(), 3);
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        assert.equal(overflow, false);
        if (process.env.VERIFY_SCREENSHOTS_DIR) {
          fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
          await page.locator(file === 'road-sign-learning-loop.html' ? '[aria-labelledby="contrast-lessons-title"]' : '#material-review').screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `${file}-${width}.png`) });
        }
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  }
}
