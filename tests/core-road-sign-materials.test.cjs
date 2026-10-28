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
let browser;
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
after(async () => { await browser?.close(); });

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
          const oldState = await page.evaluate(() => localStorage.getItem('tdt-learning-loop:v1:all'));
          for (const detail of await page.locator('.contrast-transfer').all()) {
            await detail.locator('summary').click();
            assert.equal(await detail.getAttribute('open'), '');
          }
          assert.equal(await page.evaluate(() => localStorage.getItem('tdt-learning-loop:v1:all')), oldState);
          assert.equal(await page.locator('.contrast-sign-pair img').count(), 6);
        } else { assert.equal(await page.locator('.material-links a').count(), 3); }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        assert.equal(overflow, false);
        if (process.env.VERIFY_SCREENSHOTS_DIR) {
          fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
          await page.locator(file === 'road-sign-learning-loop.html' ? '.contrast-lessons' : '#material-review').screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `${file}-${width}.png`) });
        }
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  }
}
