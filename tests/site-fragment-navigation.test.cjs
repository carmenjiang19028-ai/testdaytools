const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { chromium } = require("playwright");
const fs = require("node:fs");
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
    ["pennsylvania-dmv-permit-practice-test.html", "pennsylvania-first-permit"],
    ["digital-sat-checklist.html", "sat-id-cases"],
    ["sat-superscore-guide.html", "sat-superscore-compare"],
    ["ap-exam-day-checklist.html", "ap-answer-submission"],
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

for (const width of [320, 1280]) {
  test(`${width}px: Pennsylvania applicants can read the permit steps with scripts off`, () =>
    withPage(width, async page => {
      await page.goto(fileUrl("pennsylvania-dmv-permit-practice-test.html"));
      await page.getByRole("link", { name: "First permit visit", exact: true }).press("Enter");
      await page.waitForURL(url => url.hash === "#pennsylvania-first-permit");
      await visibleTitle(page, "pennsylvania-first-permit", width > 760);
      const cases = page.locator("#pennsylvania-first-permit article");
      assert.equal(await cases.count(), 3);
      assert.match(await cases.nth(0).innerText(), /physical exam.*one year from the exam date/s);
      assert.match(await cases.nth(1).innerText(), /in front of a notary.*in front of the examiner/s);
      assert.match(await cases.nth(2).innerText(), /original proof.*two proofs of Pennsylvania residency/s);
      for (const [index, suffix] of ["/dl-180.pdf", "/dl-180td.pdf", "/get-a-learners-permit"].entries()) {
        const source = new URL(await cases.nth(index).getByRole("link").getAttribute("href"));
        assert.equal(source.origin, "https://www.pa.gov");
        assert.ok(source.pathname.endsWith(suffix));
      }
      assert.equal(await page.locator("#pennsylvania-first-permit input").count(), 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }, false));
}

for (const [file, id] of [
  ["dmv-test-day-checklist.html", "documents-map"],
  ["dmv-permit-test-passing-score-calculator.html", "score-calculator"],
  ["dmv-road-signs-cheat-sheet.html", "printable-sheet"],
  ["digital-sat-checklist.html", "sat-id-cases"],
  ["ap-exam-day-checklist.html", "ap-subject-checks"],
  ["ap-exam-day-checklist.html", "ap-answer-submission"],
]) {
  test(`direct mobile link to ${file}#${id} is readable with scripts disabled`, () =>
    withPage(320, async page => {
      await page.goto(fileUrl(file, id));
      await visibleTitle(page, id, false);
    }, false));
}

for (const width of [320, 1280]) {
  test(`${width}px: the AP archive delivers current conflict decisions without scripts`, () =>
    withPage(width, async page => {
      await page.goto(fileUrl("2026-ap-exam-schedule.html"));
      assert.match(await page.locator("h1").innerText(), /2026 AP Exam Schedule/);
      assert.equal(await page.getByRole("link", { name: "View official 2027 AP exam dates" }).getAttribute("href"),
        "https://apcentral.collegeboard.org/exam-administration-ordering-scores/exam-dates");
      await page.getByRole("link", { name: "Compare 2027 scheduling conflicts" }).press("Enter");
      await page.waitForURL(fileUrl("ap-exam-day-checklist.html", "ap-schedule-conflicts"));
      await visibleTitle(page, "ap-schedule-conflicts", width > 760);
      const region = page.locator("#ap-schedule-conflicts");
      const cards = region.locator("article");
      assert.equal(await cards.count(), 3);
      assert.match(await cards.nth(0).innerText(), /Session 2 on May 4, 2027.*May 17, Session 1.*May 19, Session 1.*no additional late-testing fee/s);
      assert.match(await cards.nth(1).innerText(), /Session 1 on May 4, 2027.*Session 2.*not a same-session clash/s);
      assert.match(await cards.nth(2).innerText(), /approved extended time.*move one subject to late testing.*March 12, 2027/s);
      assert.deepEqual(await cards.getByRole("link").evaluateAll(links => links.map(link => new URL(link.href).pathname)), [
        "/exam-administration-ordering-scores/exam-dates/late-testing-dates",
        "/exam-administration-ordering-scores/exam-dates/start-times",
        "/media/pdf/ap-coordinators-manual-part-1.pdf",
      ]);
      assert.equal(await region.locator("input, form").count(), 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (process.env.AP_CONFLICT_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.AP_CONFLICT_SCREENSHOTS_DIR, { recursive: true });
        await region.screenshot({ path: path.join(process.env.AP_CONFLICT_SCREENSHOTS_DIR, `ap-conflicts-${width}.png`) });
      }
      await page.goto(fileUrl("ap-exam-day-checklist.html"));
      await page.getByRole("link", { name: "Compare scheduling conflicts", exact: true }).press("Enter");
      await page.waitForURL(fileUrl("ap-exam-day-checklist.html", "ap-schedule-conflicts"));
      assert(await region.isVisible());
    }, false));

  test(`${width}px: AP answers use three distinct recovery paths without scripts`, () =>
    withPage(width, async page => {
      await page.goto(fileUrl("ap-exam-day-checklist.html", "ap-answer-submission"));
      const section = page.locator("#ap-answer-submission");
      const cases = [
        ["The screen says Answer Submission Pending", /Do not try to submit again.*proctor/],
        ["Bluebook shows an error at the end", /Raise your hand.*Do not switch devices/],
        ["College Board says answers are still missing", /three calendar days.*same device.*AP coordinator/],
      ];
      for (const [heading, instruction] of cases) {
        const card = section.locator("article").filter({ has: page.getByRole("heading", { name: heading, exact: true }) });
        assert.equal(await card.count(), 1);
        assert.match(await card.locator("p").innerText(), instruction);
        assert.equal(await card.getByRole("link").count(), 1);
        assert.match(await card.getByRole("link").getAttribute("href"), /^https:\/\/bluebook\.collegeboard\.org\//);
      }
      assert(await section.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }, false));
}
