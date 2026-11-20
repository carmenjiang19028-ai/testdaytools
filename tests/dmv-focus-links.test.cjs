const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { chromium } = require("playwright");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const fs = require("node:fs");

const root = path.resolve(__dirname, "..");
const targets = [
  ["road-signs-practice-test.html", "School and pedestrian signs", "road-signs-core"],
  ["california-dmv-road-signs-practice.html", "Directional signs", "signs"],
  ["new-york-dmv-road-signs-practice.html", "Warning signs", "signs"],
  ["florida-dmv-road-signs-practice.html", "Work zone signs", "signs"],
  ["regulatory-traffic-signs-practice-test.html", "Permit-test strategy", "regulatory-signs-core"],
];
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome" }); });
after(async () => { await browser?.close(); });

async function open(width, run) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.route(/^https?:/, (route) => route.abort());
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

const urlFor = (file, params = {}) => {
  const url = pathToFileURL(path.join(root, file));
  url.search = new URLSearchParams(params).toString();
  return url;
};
const mode = page => page.locator("[data-mode-panel].is-active");
const filter = page => mode(page).locator("[data-quiz-filter]");

test("the shape guide reaches school and pedestrian questions on mobile", () =>
  open(390, async page => {
    await page.goto(urlFor("road-sign-shapes-and-colors-finder.html").href);
    await page.locator('a[href*="focus=School%20and%20pedestrian%20signs"]').first().click();
    await page.waitForURL(url => url.searchParams.get("focus") === "School and pedestrian signs");
    await mode(page).locator(".question.is-active").waitFor({ state: "visible" });
    assert.equal(await mode(page).getAttribute("data-mode-panel"), "road-signs-core");
    assert.equal(await filter(page).inputValue(), "School and pedestrian signs");
    assert.equal(await mode(page).locator(".question.is-active").getAttribute("data-category"), "School and pedestrian signs");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (process.env.VERIFY_SCREENSHOTS_DIR) {
      fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
      await mode(page).locator(".question.is-active").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, "school-focus-390.png") });
    }
  }));

for (const [file, focus, expected] of targets) {
  test(`${file}: focus-only link activates the round that actually contains ${focus}`, () =>
    open(1280, async page => {
      await page.goto(urlFor(file, { focus }).href);
      assert.equal(await mode(page).getAttribute("data-mode-panel"), expected);
      assert.equal(await filter(page).inputValue(), focus);
      assert.equal(await mode(page).locator(".question.is-active").getAttribute("data-category"), focus);
      assert.equal(await page.evaluate(() => window.dataLayer.filter(e => e[0] === "event" && e[1] === "practice_mode_select").length), 0);
    }));
}

test("explicit modes, compatible starter filters and unknown focus keep their original behavior", () =>
  open(1280, async page => {
    const file = targets[0][0];
    for (const [params, expectedMode, expectedFilter] of [
      [{}, "road-signs-starter", "all"],
      [{ focus: "Warning signs" }, "road-signs-starter", "Warning signs"],
      [{ focus: "  SCHOOL AND PEDESTRIAN SIGNS " }, "road-signs-core", "School and pedestrian signs"],
      [{ focus: "Unrecognized filter" }, "road-signs-starter", "all"],
      [{ mode: "road-signs-starter", focus: "School and pedestrian signs" }, "road-signs-starter", "all"],
      [{ mode: "road-signs-core", focus: "saved" }, "road-signs-core", "saved"],
      [{ focus: "due" }, "road-signs-starter", "due"],
    ]) {
      await page.goto(urlFor(file, params).href);
      assert.equal(await mode(page).getAttribute("data-mode-panel"), expectedMode);
      assert.equal(await filter(page).inputValue(), expectedFilter);
    }
  }));

test("all authored category shortcuts on the affected pages land in that category", () =>
  open(1280, async page => {
    const files = targets.map(([file]) => file);
    const urls = new Set();
    for (const file of [...files, "road-sign-shapes-and-colors-finder.html"]) {
      await page.goto(urlFor(file).href);
      const links = await page.locator("a[href*=focus]").evaluateAll(nodes => nodes.map(a => a.href));
      for (const href of links) {
        const url = new URL(href);
        if (files.some(file => url.pathname.endsWith(`/${file}`)) && url.searchParams.has("focus")) urls.add(href);
      }
    }
    assert(urls.size >= 38);
    for (const href of urls) {
      await page.goto(href);
      const focus = new URL(href).searchParams.get("focus");
      assert.equal(await filter(page).inputValue(), focus, href);
    }
  }));
