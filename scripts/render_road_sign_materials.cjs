const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');

async function render(mode, output, keys = []) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 880, height: 640 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    if (mode === 'art') {
      fs.mkdirSync(output, { recursive: true });
      for (const key of keys) {
        if (!/^[a-z-]+$/.test(key)) throw new Error('Invalid sign key');
        const svg = fs.readFileSync(path.join(root, 'assets/road-signs', `${key}-road-sign.svg`));
        await page.setContent('<style>body{margin:0;background:white}img{display:block;width:880px;height:640px}</style>'
          + `<img alt="" src="data:image/svg+xml;base64,${svg.toString('base64')}">`);
        await page.locator('img').evaluate(image => image.decode());
        await page.screenshot({ path: path.join(output, `${key}.png`) });
      }
    } else if (mode === 'reference') {
      await page.goto(pathToFileURL(path.join(root, 'dmv-road-signs-cheat-sheet.html')).href);
      await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
      await page.emulateMedia({ media: 'print' });
      await page.pdf({ path: output, format: 'Letter', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false });
    } else { throw new Error('Expected art or reference rendering mode'); }
    await context.close();
  } finally { await browser.close(); }
}

module.exports = { render };
if (require.main === module) {
  const [mode, output, ...keys] = process.argv.slice(2);
  render(mode, output, keys).catch(error => { console.error(error); process.exitCode = 1; });
}
