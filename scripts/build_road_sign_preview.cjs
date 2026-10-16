const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const signs = ["stop", "yield", "merge", "railroad", "no-right-turn", "school-crossing"];

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.route(/^https?:/, (route) => route.abort());
    const images = signs.map((key) => {
      const svg = fs.readFileSync(path.join(root, "assets/road-signs", `${key}-road-sign.svg`));
      return `<img src="data:image/svg+xml;base64,${svg.toString("base64")}" alt="" width="330" height="240">`;
    });
    await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8">
      <title>Road signs practice preview</title><style>
        * { box-sizing: border-box; }
        body { margin: 0; width: 1200px; height: 630px; background: #fff; }
        main { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, 1fr); height: 100%; padding: 30px; }
        img { display: block; width: 330px; height: 240px; object-fit: contain; margin: auto; }
      </style></head><body><main>${images.join("")}</main></body></html>`);
    await page.locator("img").evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
    const output = path.join(root, "assets/road-signs-practice-test-preview.png");
    await page.screenshot({ path: output });
    console.log(`Built ${path.relative(root, output)} (${fs.statSync(output).size} bytes).`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
