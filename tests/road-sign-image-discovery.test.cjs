const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const { createServer } = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const sharp = require("sharp");
const { renderPreview, renderReferencePreview, signs } = require("../scripts/build_road_sign_preview.cjs");

const root = path.resolve(__dirname, "..");
const screenshots = process.env.VERIFY_SCREENSHOTS_DIR;
const pages = ["road-signs-practice-test.html", "dmv-road-signs-cheat-sheet.html"];
let browser;
let printServer;
let printOrigin;

const printFixtures = new Map([
  ["/dmv-road-signs-cheat-sheet.html", "text/html"],
  ["/assets/styles.css", "text/css"],
  ["/assets/app.js", "text/javascript"],
  ["/dmv-road-signs-cheat-sheet.pdf", "application/pdf"],
  ["/dmv-road-signs-classroom-worksheet.pdf", "application/pdf"],
]);

before(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  printServer = createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const contentType = printFixtures.get(pathname);
    if (!contentType) return response.writeHead(404).end();
    response.writeHead(200, { "Content-Type": contentType });
    response.end(fs.readFileSync(path.join(root, pathname)));
  });
  await new Promise((resolve, reject) => {
    printServer.once("error", reject).listen(0, "127.0.0.1", resolve);
  });
  printOrigin = `http://127.0.0.1:${printServer.address().port}`;
  if (screenshots) fs.mkdirSync(screenshots, { recursive: true });
});
after(async () => {
  await browser?.close();
  printServer?.close();
});

async function openPage(file, viewport = { width: 1280, height: 900 }, options = {}) {
  const { javaScriptEnabled, withoutPrint, served } = options;
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, javaScriptEnabled });
  await context.route(/^https?:/, (route) => (
    served && new URL(route.request().url()).origin === printOrigin ? route.continue() : route.abort()
  ));
  const page = await context.newPage();
  if (withoutPrint) await page.addInitScript(() => { window.print = undefined; });
  await page.goto(served ? `${printOrigin}/${file}` : pathToFileURL(path.join(root, file)).href);
  return { context, page };
}

async function decodeImages(page) {
  await page.locator("img").evaluateAll((images) => Promise.all(images.map((image) => {
    image.loading = "eager";
    return image.decode();
  })));
}

async function screenshot(page, name) {
  if (!screenshots) return;
  await page.screenshot({ path: path.join(screenshots, name) });
  await page.screenshot({ path: path.join(screenshots, name.replace(".png", "-full.png")), fullPage: true });
}

for (const file of pages) {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    test(`${file}: ${viewport.width}px images load without changing their aspect ratio or overflowing`, async () => {
      const { context, page } = await openPage(file, viewport);
      try {
        if (file === pages[1]) {
          const worksheet = page.locator('#online-worksheet');
          await worksheet.getByText("1. Name eight road signs", { exact: true }).click();
          assert.equal(await worksheet.locator('.worksheet-pictures img:visible').count(), 8);
        }
        await decodeImages(page);
        const images = await page.locator('img[src^="assets/road-signs/"]').evaluateAll((images) => images.map((image) => {
          const box = image.getBoundingClientRect();
          return { src: image.getAttribute("src"), loaded: image.complete && image.naturalWidth > 0, alt: image.alt, width: box.width, height: box.height, right: box.right };
        }));
        assert.equal(new Set(images.map(image => image.src)).size, 31);
        for (const image of images) {
          assert.equal(image.loaded, true);
          assert.ok(image.alt.length > 0);
          assert.ok(image.width > 0 && image.height > 0);
          assert.ok(Math.abs(image.width / image.height - 220 / 160) < 0.01);
          assert.ok(image.right <= viewport.width + 1);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await screenshot(page, `${path.basename(file, ".html")}-${viewport.width}.png`);
      } finally { await context.close(); }
    });
  }
}

test("all exported sign artwork visually matches its original inline SVG", async () => {
  const original = JSON.parse(execFileSync("python3", ["-c",
    "import json; from scripts.build import SIGN_SVGS, road_sign_image_records; print(json.dumps({s['image']:SIGN_SVGS[s['image']] for s in road_sign_image_records()}))",
  ], { cwd: root, encoding: "utf8" }));
  const { context, page } = await openPage(pages[0], { width: 440, height: 160 });
  try {
    const mismatches = [];
    for (const [key, svg] of Object.entries(original)) {
      const src = pathToFileURL(path.join(root, "assets/road-signs", `${key}-road-sign.svg`)).href;
      await page.setContent(`<style>body{margin:0;display:flex;background:white}div,svg,img{display:block;width:220px;height:160px;flex-shrink:0}</style><div>${svg}</div><img src="${src}" alt="">`);
      await decodeImages(page);
      const inline = await page.locator("div").screenshot();
      const exported = await page.locator("img").screenshot();
      const a = await sharp(inline).raw().toBuffer();
      const b = await sharp(exported).raw().toBuffer();
      if (Buffer.compare(a, b) !== 0) {
        let changedPixels = 0;
        let maxDelta = 0;
        let totalDelta = 0;
        for (let index = 0; index < a.length; index += 3) {
          let pixelChanged = false;
          for (let channel = 0; channel < 3; channel += 1) {
            const delta = Math.abs(a[index + channel] - b[index + channel]);
            pixelChanged ||= delta > 0;
            maxDelta = Math.max(maxDelta, delta);
            totalDelta += delta;
          }
          if (pixelChanged) changedPixels += 1;
        }
        // Inline painting and image rasterization differ at a few antialiased edges.
        const matches = changedPixels / (220 * 160) <= 0.001 && maxDelta <= 64 && totalDelta / a.length < 0.01;
        if (!matches) mismatches.push({ key, changedPixels, maxDelta, meanDelta: totalDelta / a.length });
        if (!matches && screenshots) {
          fs.writeFileSync(path.join(screenshots, `${key}-inline.png`), inline);
          fs.writeFileSync(path.join(screenshots, `${key}-external.png`), exported);
        }
      }
    }
    assert.deepEqual(mismatches, [], "Exported artwork must match apart from minor edge antialiasing");
  } finally { await context.close(); }
});

test("picture quiz, sign lookup and mode switching still work", async () => {
  const { context, page } = await openPage(pages[0]);
  try {
    await page.locator("[data-sign-search]").fill("railroad");
    assert.ok(await page.locator("[data-sign-card]:visible").count() > 0);
    await page.locator("[data-sign-search]").fill("");
    const quiz = page.locator("[data-quiz]:visible").first();
    const question = quiz.locator("[data-question-index]:visible").first();
    const answer = await question.getAttribute("data-answer");
    await question.locator(`[data-choice="${answer}"]`).click();
    assert.match(await quiz.locator("[data-quiz-result]").textContent(), /Score: 1 of 1 answered/);
    assert.match(await question.locator(".feedback").textContent(), /^Correct\./);
    await quiz.locator("[data-quiz-forward]").click();
    assert.match(await quiz.locator("[data-quiz-position]").textContent(), /Question 2 of/);
    const secondMode = page.locator("[data-mode-button]").nth(1);
    await secondMode.click();
    assert.equal(await secondMode.getAttribute("aria-selected"), "true");
    assert.ok(await page.locator("[data-quiz]:visible .sign-art svg").count() > 0);
  } finally { await context.close(); }
});

test("print resource retains printable images, PDF links and a functioning print control", async () => {
  const { context, page } = await openPage(pages[1]);
  try {
    await page.evaluate(() => { window.print = () => { window.printRequested = true; }; });
    await page.locator("[data-print-page]").click();
    assert.equal(await page.evaluate(() => window.printRequested), true);
    const links = await page.locator("[data-resource-download]").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    assert.ok(links.includes("dmv-road-signs-cheat-sheet.pdf"));
    assert.ok(links.includes("dmv-road-signs-classroom-worksheet.pdf"));
    await page.emulateMedia({ media: "print" });
    await decodeImages(page);
    assert.equal(await page.locator("#printable-sheet .cheat-sign-visual img:visible").count(), 31);
    assert.equal(await page.locator(".site-header").isVisible(), false);
    assert.equal(await page.locator(".cheat-sign-visual img").first().evaluate((image) => image.getBoundingClientRect().width), 68);
    await screenshot(page, "dmv-road-signs-cheat-sheet-print.png");
  } finally { await context.close(); }
});

for (const options of [
  { width: 390, javaScriptEnabled: false, label: "without scripts" },
  { width: 1280, withoutPrint: true, label: "without browser printing" },
]) {
  test(`print resource offers both PDF downloads ${options.label}`, async () => {
    const { context, page } = await openPage(pages[1], { width: options.width, height: 844 }, { ...options, served: true });
    try {
      assert.equal(await page.locator("[data-print-page]").isVisible(), false);
      for (const name of ["Download PDF", "Classroom worksheet + answer key"]) {
        const link = page.getByRole("link", { name, exact: true });
        assert.equal(await link.isVisible(), true);
        const [download] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), link.click()]);
        assert.equal(download.suggestedFilename(), await link.getAttribute("href"));
        assert.equal(fs.readFileSync(await download.path()).subarray(0, 5).toString(), "%PDF-");
      }
      assert.equal(await page.locator("#printable-sheet .cheat-sign-card").count(), 31);
    } finally { await context.close(); }
  });
}

test("printable preview matches an excerpt of the current reference and four real signs", async () => {
  const filename = path.join(root, "assets/dmv-road-signs-cheat-sheet-preview.png");
  const { data, info } = await sharp(filename).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 1200);
  assert.equal(info.height, 630);
  const expected = await sharp(await renderReferencePreview(browser)).removeAlpha().raw().toBuffer();
  assert.equal(data.length, expected.length);
  let changed = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    if ([0, 1, 2].some(i => Math.abs(data[offset + i] - expected[offset + i]) > 80)) changed += 1;
  }
  assert.ok(changed < info.width * info.height * 0.02, `${changed} pixels differ from the current reference`);
});

test("picture-test preview contains six real sign illustrations at the declared dimensions", async () => {
  const preview = path.join(root, "assets/road-signs-practice-test-preview.png");
  const { data, info } = await sharp(preview).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 1200);
  assert.equal(info.height, 630);
  const expected = await sharp(await renderPreview(browser)).removeAlpha().raw().toBuffer();
  assert.equal(data.length, expected.length);
  const staleSigns = [];
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      let colored = 0;
      let changed = 0;
      for (let y = row * 315; y < (row + 1) * 315; y += 1) {
        for (let x = col * 400; x < (col + 1) * 400; x += 1) {
          const offset = (y * info.width + x) * info.channels;
          const rgb = [expected[offset], expected[offset + 1], expected[offset + 2]];
          if (rgb.some(channel => channel < 235)) colored += 1;
          if (rgb.some((channel, i) => Math.abs(channel - data[offset + i]) > 80)) changed += 1;
        }
      }
      const sign = signs[row * 3 + col];
      assert.ok(colored > 5000, `The ${sign} source must not be blank`);
      // Tolerate minor edge or font rasterization differences, not a changed symbol.
      if (changed / colored > 0.02) staleSigns.push({ sign, changed, colored });
    }
  }
  assert.deepEqual(staleSigns, [], "Rebuild the preview after changing its source illustrations");
});
