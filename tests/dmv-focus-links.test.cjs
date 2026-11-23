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
const reviewPaths = [
  ["california-dmv-permit-practice-test", "california-dmv-road-signs-practice", "practice", "ca-curb-checkpoint"],
  ["california-dmv-road-signs-practice", "california-dmv-road-signs-practice", "practice", "ca-curb-checkpoint"],
  ["new-york-dmv-permit-practice-test", "new-york-dmv-road-signs-practice", "new-york-right-on-red"],
  ["new-york-dmv-road-signs-practice", "new-york-dmv-road-signs-practice", "practice", "ny-four-sign-checkpoint"],
  ["florida-dmv-permit-practice-test", "florida-dmv-road-signs-practice", "practice", "florida-regulatory-starter"],
  ["florida-dmv-road-signs-practice", "road-sign-learning-loop", "lesson-do-not-enter-wrong-way"],
  ["illinois-dmv-road-signs-practice", "illinois-dmv-road-signs-practice", "illinois-school-zone"],
  ["pennsylvania-dmv-permit-practice-test", "pennsylvania-dmv-permit-practice-test", "practice", "signs"],
  ["pennsylvania-dmv-road-signs-practice", "road-sign-learning-loop", "lesson-merge-lane-ends"],
  ["new-jersey-mvc-permit-practice-test", "new-jersey-mvc-permit-practice-test", "practice", "signs"],
  ["new-jersey-mvc-road-signs-practice", "regulatory-traffic-signs-practice-test", "practice", null, "Lane and direction signs"],
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

for (const width of [320, 1280]) {
  test(`${width}px: Florida opens the named sign round and removes editorial search copy`, () =>
    open(width, async page => {
      const file = "florida-dmv-road-signs-practice.html";
      for (const [initial, label, targetMode, count, score] of [
        ["signs", "Start 8-sign round", "florida-regulatory-starter", 8, "6"],
        ["florida-regulatory-starter", "Open full 24-sign round", "signs", 24, "19"],
      ]) {
        await page.goto(urlFor(file, { mode: initial }).href);
        assert.equal(await mode(page).getAttribute("data-mode-panel"), initial);
        await page.getByRole("link", { name: label, exact: true }).press("Enter");
        await page.waitForURL(url => url.searchParams.get("mode") === targetMode && url.hash === "#practice");
        assert.equal(await mode(page).getAttribute("data-mode-panel"), targetMode);
        const quiz = mode(page).locator("[data-quiz]");
        assert.equal(await quiz.locator(".question").count(), count);
        assert.equal(await quiz.getAttribute("data-pass-score"), score);
        assert.ok(await quiz.locator(".question.is-active").isVisible());
      }
      assert.doesNotMatch(await page.locator("main").innerText(),
        /official-source queries|if your search is|built for common Florida sign searches|this wording is intentional|sign searches this page answers/i);
      assert.equal(await page.getByRole("link", { name: "FDOT sign library", exact: true }).getAttribute("href"),
        "https://www.fdot.gov/traffic/trafficservices/sign_library/highway-sign-library");
    }));

  test(`${width}px: Florida right-turn cases give different decisions for lane, sign and signal without scripts`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 850 }, javaScriptEnabled: false });
    try {
      await context.route(/^https?:/, route => route.abort());
      const page = await context.newPage();
      const guide = urlFor("florida-dmv-road-signs-practice.html").href;
      await page.goto(guide);
      await page.getByRole("link", { name: "Work through right-turn cases", exact: true }).press("Enter");
      await page.waitForURL(guide + "#florida-right-turn-decisions");
      const lesson = page.locator("#florida-right-turn-decisions");
      const heading = await lesson.getByRole("heading", { level: 2 }).boundingBox();
      const header = await page.locator(".site-header").boundingBox();
      assert.ok(heading.y >= header.y + header.height && heading.y < 850);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const cases = lesson.locator("article");
      assert.equal(await cases.count(), 2);
      const expected = [
        [/turn-only instruction.*not make the through movement available.*does not give you priority.*reroute/is,
          /NO TURN ON RED tells you to wait/i, "074"],
        [/NO RIGHT TURN sign still prohibits.*circular green/is,
          /no longer blocks the turn.*still must yield to the pedestrian/is, "075"],
      ];
      for (const [index, [reason, answer, section]] of expected.entries()) {
        const card = cases.nth(index);
        const reasoning = card.locator("details").first();
        const check = card.locator("details").last();
        assert.equal(await reasoning.locator("li").first().isVisible(), false);
        assert.equal(await check.locator("p").isVisible(), false);
        await reasoning.locator("summary").press("Enter");
        assert.match(await reasoning.innerText(), reason);
        await check.locator("summary").press("Enter");
        assert.match(await check.innerText(), answer);
        assert.equal(await card.getByRole("link").getAttribute("href"),
          `https://www.flsenate.gov/Laws/Statutes/2026/316.${section}`);
      }
    } finally { await context.close(); }
  });
}

for (const width of [390, 1280]) {
  test(`${width}px: California and New York study links open the named round from another active mode`, () =>
    open(width, async page => {
      const paths = [
        ["california", "signs", "Start 5-color checkpoint", "ca-curb-checkpoint", 5, 4],
        ["california", "signs", "Start curb checkpoint", "ca-curb-checkpoint", 5, 4],
        ["california", "ca-curb-checkpoint", "Open full 28-sign round", "signs", 28, 23],
        ["new-york", "signs", "Start 4-sign checkpoint", "ny-four-sign-checkpoint", 4, 2],
        ["new-york", "ny-four-sign-checkpoint", "Open full 25-sign round", "signs", 25, 20],
      ];
      for (const [state, starting, label, destination, total, target] of paths) {
        await page.goto(urlFor(`${state}-dmv-road-signs-practice.html`, { mode: starting }).href);
        assert.equal(await mode(page).getAttribute("data-mode-panel"), starting);
        await page.getByRole("link", { name: label, exact: true }).press("Enter");
        await page.waitForURL(url => url.searchParams.get("mode") === destination && url.hash === "#practice");
        assert.equal(await mode(page).getAttribute("data-mode-panel"), destination, label);
        const quiz = mode(page).locator("[data-quiz]");
        assert.equal(await quiz.locator(".question").count(), total, label);
        assert.equal(await quiz.getAttribute("data-pass-score"), String(target), label);
        assert.ok(await quiz.locator(".question.is-active").isVisible(), label);
        if (state === "new-york") {
          assert.doesNotMatch(await page.locator("main").innerText(), /search console|concrete and searchable/i);
          assert.equal(await page.getByRole("link", { name: "Compare New York right-turn cases" }).getAttribute("href"),
            "#new-york-right-on-red");
        }
      }
    }));
}

for (const width of [320, 1280]) {
  test(`${width}px: California curb examples apply the rule when the situation changes without scripts`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 850 }, javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await context.route(/^https?:/, route => route.abort());
      const guide = urlFor("california-dmv-road-signs-practice.html").href;
      await page.goto(guide);
      await page.getByRole("link", { name: "Work through curb decisions", exact: true }).press("Enter");
      await page.waitForURL(guide + "#california-curb-decisions");
      const lesson = page.locator("#california-curb-decisions");
      const heading = await lesson.locator("h2").boundingBox();
      const header = await page.locator(".site-header").boundingBox();
      assert.ok(heading.y >= header.y + header.height && heading.y < 850);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const cases = lesson.locator("article");
      assert.equal(await cases.count(), 2);
      const expected = [
        [/not for waiting for someone to arrive/, /Stay within the posted 15 minutes/,
          "https://www.dmv.ca.gov/portal/handbook/california-driver-handbook/navigating-the-roads-cont1/"],
        [/valid placard.*Keep the striped access aisle clear/is, /not yours to use for your own trip/,
          "https://www.dmv.ca.gov/portal/vehicle-registration/license-plates-decals-and-placards/disabled-person-parking-placards-plates/"],
      ];
      for (const [i, [reason, answer, source]] of expected.entries()) {
        const card = cases.nth(i);
        const reasoning = card.locator("details").first();
        const check = card.locator("details").last();
        assert.equal(await reasoning.locator("li").first().isVisible(), false);
        assert.equal(await check.locator("p").isVisible(), false);
        await reasoning.locator("summary").press("Enter");
        assert.match(await reasoning.innerText(), reason);
        await check.locator("summary").press("Enter");
        assert.match(await check.innerText(), answer);
        assert.equal(await card.getByRole("link").getAttribute("href"), source);
      }
    } finally { await context.close(); }
  });
}

for (const width of [390, 1280]) {
  test(`${width}px: Florida course paths distinguish age and land clear of the sticky header`, () =>
    open(width, async page => {
      const slug = "florida-class-e-knowledge-exam-tlsae";
      for (const [from, label] of [
        [slug, "Choose a course"],
        ["florida-dmv-permit-practice-test", "Check the Florida course paths"],
        ["florida-dmv-road-signs-practice", "Check course requirements"],
        ["florida-dmv-permit-documents-checklist", "Check course requirements"],
      ]) {
        await page.goto(urlFor(`${from}.html`).href);
        await page.getByRole("link", {name: label, exact: true}).click();
        await page.waitForURL(url => url.pathname.endsWith(`/${slug}.html`) && url.hash === "#florida-course-path");
        const group = page.locator("#florida-course-path");
        const h = await group.getByRole("heading", {level: 2}).boundingBox();
        const header = await page.locator(".site-header").boundingBox();
        assert.ok(h && header && h.y >= header.y + header.height, from);
        const cards = group.locator("article");
        assert.equal(await cards.count(), 3);
        assert.match(await cards.nth(0).innerText(), /6-hour DETS/);
        assert.match(await cards.nth(0).getByRole("link").getAttribute("href"), /^https:\/\/www\.fldoe\.org\//);
        assert.match(await cards.nth(1).innerText(), /4-hour TLSAE/);
        assert.match(await cards.nth(1).getByRole("link").getAttribute("href"), /^https:\/\/www\.pinellastaxcollector\.gov\//);
        assert.match(await cards.nth(2).innerText(), /Verify your record/);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, from);
        if (from === slug && process.env.VERIFY_SCREENSHOTS_DIR) {
          fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, {recursive: true});
          await page.screenshot({path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `course-arrival-${width}.png`)});
        }
      }
    }));
}

for (const width of [390, 1280]) {
  test(`${width}px: study-guide next steps open all eleven intended lessons or drills`, () =>
    open(width, async page => {
      for (const [from, to, anchor, expectedMode, focus] of reviewPaths) {
        await page.goto(urlFor(`${from}.html`).href);
        const introduction = page.locator("#sign-study .tool-section-head");
        assert.doesNotMatch(await introduction.innerText(), /search.result competitors/i, from);
        const link = introduction.getByRole("link");
        if (from === "new-york-dmv-permit-practice-test" && process.env.VERIFY_SCREENSHOTS_DIR) {
          fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
          await introduction.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `study-guide-${width}.png`) });
        }
        await link.click();
        await page.waitForURL(url => url.pathname.endsWith(`/${to}.html`) && url.hash === `#${anchor}`);
        assert.equal(await page.locator(`#${anchor}`).isVisible(), true, from);
        if (expectedMode) {
          assert.equal(await mode(page).getAttribute("data-mode-panel"), expectedMode, from);
          await mode(page).locator(".question.is-active").waitFor({ state: "visible" });
        }
        if (focus) {
          assert.equal(await filter(page).inputValue(), focus, from);
          assert.equal(await mode(page).locator(".question.is-active").getAttribute("data-category"), focus, from);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, from);
      }
    }));
}

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
