const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const signs = ["stop", "yield", "merge", "railroad", "no-right-turn", "school-crossing"];

const svgData = file => `data:image/svg+xml;base64,${fs.readFileSync(file).toString("base64")}`;
const escapeHtml = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

async function renderPreview(browser) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  try {
    await page.route(/^https?:/, (route) => route.abort());
    const images = signs.map((key) => {
      return `<img src="${svgData(path.join(root, "assets/road-signs", `${key}-road-sign.svg`))}" alt="" width="330" height="240">`;
    });
    await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8">
      <title>Road signs practice preview</title><style>
        * { box-sizing: border-box; }
        body { margin: 0; width: 1200px; height: 630px; background: #fff; }
        main { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, 1fr); height: 100%; padding: 30px; }
        img { display: block; width: 330px; height: 240px; object-fit: contain; margin: auto; }
      </style></head><body><main>${images.join("")}</main></body></html>`);
    await page.locator("img").evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
    return await page.screenshot();
  } finally {
    await page.close();
  }
}

async function renderReferencePreview(browser) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  try {
    await page.route(/^https?:/, route => route.abort());
    await page.goto(pathToFileURL(path.join(root, "dmv-road-signs-cheat-sheet.html")).href);
    const heading = await page.locator(".printable-sheet-head h2").textContent();
    const cards = await page.locator(".cheat-sign-card").evaluateAll(items => items.map(card => ({
      image: card.querySelector("img").getAttribute("src"),
      name: card.querySelector("strong").textContent,
      meaning: card.querySelector("p").textContent,
    })));
    const excerpt = cards.slice(0, 4).map(card =>
      `<article><img width="176" height="128" src="${svgData(path.join(root, card.image))}" alt=""><div><h2>${escapeHtml(card.name)}</h2><p>${escapeHtml(card.meaning)}</p></div></article>`).join("");
    await page.setContent(`<!doctype html><html lang="en"><meta charset="utf-8"><title>${escapeHtml(heading)}</title>
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; padding: 38px 48px; font: 24px Arial,sans-serif; color: #18242b; background: #fff; }
        header { border-bottom: 2px solid #18242b; padding-bottom: 18px; margin-bottom: 20px; }
        header p { margin: 0; color: #176551; font-size: 20px; font-weight: 700; }
        h1 { margin: 10px 0 8px; font-size: 54px; }
        h2 { margin: 0 0 7px; font-size: 30px; }
        article p { margin: 0; font-size: 22px; line-height: 1.32; color: #384851; }
        main { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; }
        article { display: grid; grid-template-columns: 176px 1fr; align-items: center; gap: 16px; min-height: 160px; padding: 14px 16px; border: 1px solid #ccd4d8; border-radius: 6px; }
        footer { margin-top: 22px; font-weight: 700; font-size: 20px; }
      </style><header><p>TestDayTools printable reference</p><h1>${escapeHtml(heading)}</h1>
      <div>${cards.length} original sign illustrations with driver actions</div></header>
      <main>${excerpt}</main><footer>TestDayTools.com</footer></html>`);
    await page.locator("img").evaluateAll(images => Promise.all(images.map(image => image.decode())));
    if (await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)) {
      throw new Error("Printable preview exceeds its image height");
    }
    return await page.screenshot();
  } finally {
    await page.close();
  }
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const [filename, render] of [
      ["assets/road-signs-practice-test-preview.png", renderPreview],
      ["assets/dmv-road-signs-cheat-sheet-preview.png", renderReferencePreview],
    ]) {
      const png = await render(browser);
      fs.writeFileSync(path.join(root, filename), png);
      console.log(`Built ${filename} (${png.length} bytes).`);
    }
  } finally {
    await browser.close();
  }
}

module.exports = { renderPreview, renderReferencePreview, signs };
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
