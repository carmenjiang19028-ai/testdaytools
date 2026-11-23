const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { chromium } = require("playwright");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome" }); });
after(async () => { await browser?.close(); });

function fileUrl(file, fragment = "") {
  const url = pathToFileURL(path.resolve(__dirname, "..", file));
  url.hash = fragment;
  return url.href;
}

async function withPage(width, run, javaScriptEnabled = true) {
  const context = await browser.newContext({ viewport: { width, height: 780 }, javaScriptEnabled, reducedMotion: "reduce" });
  await context.route(/^https?:/, route => route.abort());
  try {
    await run(await context.newPage());
  } finally {
    await context.close();
  }
}

function visibleTitle(page, id, sticky) {
  return page.waitForFunction(({ id, sticky }) => {
    const header = document.querySelector(".site-header");
    const rect = header.getBoundingClientRect();
    const target = document.getElementById(id);
    const title = target?.matches("h2,h3") ? target : target?.querySelector("h2,h3");
    if (!title) return false;
    const bounds = title.getBoundingClientRect();
    const position = getComputedStyle(header).position;
    return (sticky ? position === "sticky" && Math.abs(rect.top) < 2 : position === "static" && rect.bottom <= 0)
      && bounds.top >= Math.max(0, rect.bottom) && bounds.bottom <= innerHeight;
  }, { id, sticky }, { timeout: 3000 });
}

for (const width of [320, 390, 761, 1280]) {
  const sticky = width > 760;
  for (const [file, id] of [
    ["dmv-practice.html", "permit-tests"],
    ["road-signs-practice-test.html", "sign-meaning-finder"],
    ["new-jersey-mvc-permit-practice-test.html", "official-details"],
    ["sat-superscore-guide.html", "sat-superscore-compare"],
  ]) {
    test(`${width}px: keyboard jump to ${file}#${id} exposes the entire heading`, () =>
      withPage(width, async page => {
        await page.goto(fileUrl(file));
        const link = page.locator(`a[href="#${id}"]`).first();
        await link.focus();
        await page.keyboard.press("Enter");
        await page.waitForURL(url => url.hash === `#${id}`);
        await visibleTitle(page, id, sticky);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }));
  }
}

for (const [file, id] of [
  ["dmv-test-day-checklist.html", "documents-map"],
  ["dmv-permit-test-passing-score-calculator.html", "score-calculator"],
  ["dmv-road-signs-cheat-sheet.html", "printable-sheet"],
  ["ap-exam-day-checklist.html", "ap-subject-checks"],
]) {
  test(`direct mobile link to ${file}#${id} is readable with scripts disabled`, () =>
    withPage(320, async page => {
      await page.goto(fileUrl(file, id));
      await visibleTitle(page, id, false);
    }, false));
}
