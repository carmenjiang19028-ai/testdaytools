const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function openScore(viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  await context.route(/^https?:/, (route) => route.abort());
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.join(root, "dmv-permit-test-passing-score-calculator.html")).href);
  return { context, page };
}

const score = (page) => page.locator("[data-score-status]").textContent();
const check = (page) => page.locator("[data-score-check]").click();
const correctInput = (page) => page.locator("[data-score-input-correct]");
const totalInput = (page) => page.locator("[data-score-input-total]");
const useLength = (page) => page.locator("[data-score-use-official]");
const nextLink = (page) => page.locator("[data-score-next-link]");
const resultMessage = (page) => page.locator("[data-score-message]");
const tracked = (page) => page.evaluate(() => (window.dataLayer || [])
  .filter((entry) => entry[0] === "event" && entry[1] === "dmv_score_checked")
  .map((entry) => entry[2]));

const directSources = {
  california: "https://www.dmv.ca.gov/portal/driver-licenses-identification-cards/learners-permits/",
  "new-york": "https://dmv.ny.gov/new-york-state-drivers-manual-and-practice-tests/chapter-1-driver-licenses",
  "new-jersey": "https://www.nj.gov/mvc/license/sample_knowledge_test.htm",
  "north-carolina": "https://www.oah.nc.gov/documents/rules/nc-register/volume-36-issue-11/open#page=101",
};
const wholeKnowledgeSamples = {
  ohio: "https://www.bmv.ohio.gov/dl-sample-test.aspx",
  arizona: "https://azdot.gov/mvd/services/driver-services/tests-manuals-and-driving-schools/practice-tests",
};

for (const width of [320, 1280]) {
  test(`${width}px: score and requirements distinguish a supported visit from an unlisted state`, async () => {
    const origin = "http://tdt-score.test";
    const context = await browser.newContext({ viewport: { width, height: 850 } });
    await context.route(/^https?:/, route => route.abort());
    await context.route(origin + "/**", route => route.fulfill({
      path: path.join(root, new URL(route.request().url()).pathname.slice(1)),
    }));
    try {
      const page = await context.newPage();
      const hub = origin + "/dmv-practice.html";
      await page.goto(hub);
      await page.locator("[data-workbench-state]").selectOption("Arizona");
      await page.locator(".site-header nav").getByRole("link", { name: "Can I miss?", exact: true }).click();
      await page.waitForLoadState("load");
      assert.equal(await page.locator("[data-score-state]").inputValue(), "arizona");
      assert.match(await page.locator("[data-score-rule]").textContent(), /24 correct out of 30/);
      const scoreUrl = origin + "/dmv-permit-test-passing-score-calculator.html";
      const requirementsUrl = origin + "/dmv-permit-test-requirements-by-state.html";
      await page.goto(requirementsUrl);
      assert.equal(await page.locator("[data-requirements-state]").inputValue(), "arizona");
      assert.match(await page.locator("[data-requirements-state-title]").textContent(), /Arizona/);
      await page.goto(hub);
      await page.locator("[data-workbench-state]").selectOption("Michigan");
      for (const [url, type, details] of [
        [scoreUrl, "score", "[data-score-check]"],
        [requirementsUrl + "?state=michigan", "requirements", "[data-requirements-pass]"],
      ]) {
        await page.goto(url);
        const state = page.locator(`[data-${type}-state]`);
        const alternative = page.locator("[data-dmv-state-alternative]");
        assert.equal(await state.inputValue(), "");
        assert.equal(await alternative.getByRole("heading", { name: "Michigan permit steps" }).isVisible(), true);
        assert.equal(await alternative.getByRole("link", { name: "Open Michigan permit steps" }).getAttribute("href"),
          "michigan-sos-road-signs-practice.html#michigan-test-path");
        assert.equal(await page.locator(details).isVisible(), false);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.deepEqual(await tracked(page), []);
        await state.selectOption("new-york");
        assert.equal(await alternative.isVisible(), false);
        assert.equal(await page.locator(details).isVisible(), true);
      }
      await page.goto(scoreUrl + "?state=new-york");
      assert.equal(await page.locator("[data-score-state]").inputValue(), "new-york");
      await page.goto(scoreUrl + "?state=oregon");
      assert.equal(await page.locator("[data-score-state]").inputValue(), "");
      assert.equal(await page.locator("[data-dmv-state-alternative]").getByRole("link", { name: "Browse state permit guides" }).isVisible(), true);
      assert.equal(await page.locator("[data-score-check]").isVisible(), false);
    } finally { await context.close(); }
  });
}

test("California, New York and New Jersey verification links lead to the direct published rules", async () => {
  const { context, page } = await openScore();
  try {
    const selector = page.locator("[data-score-state]");
    assert.equal(await page.locator("[data-score-fallback]").isVisible(), false);
    assert.equal(await selector.isVisible(), true);
    assert.equal(await page.locator("#score-filter").isVisible(), true);
    for (const [state, url] of Object.entries(directSources)) {
      await selector.selectOption(state);
      assert.equal(await page.locator("[data-score-source]").getAttribute("href"), url);
      assert.equal(await page.locator(`#${state}-permit-test-passing-score`).getByText("Verify official rule").getAttribute("href"), url);
      const label = await selector.locator(`option[value="${state}"]`).textContent();
      const row = page.locator("#score-table tbody tr").filter({ has: page.getByRole("rowheader", { name: label, exact: true }) });
      assert.equal(await row.locator("td:last-child a").getAttribute("href"), url);
    }
    await selector.selectOption("california");
    await totalInput(page).fill("37");
    assert.match(await page.locator("[data-score-count-answer]").innerText(), /37 questions: need 30 correct; can miss up to 7/);
    assert.deepEqual(await tracked(page), []);
  } finally { await context.close(); }
});

for (const [width, scriptsOff] of [[320, true], [1280, false]]) {
  test(`${width}px: manual score math and direct state rules stay usable with ${scriptsOff ? "JavaScript disabled" : "script load failure"}`, async () => {
    const origin = "http://tdt-score.test";
    const context = await browser.newContext({ viewport: { width, height: 860 }, javaScriptEnabled: !scriptsOff });
    await context.route(/^https?:/, route => route.abort());
    await context.route(origin + "/**", route => {
      const file = new URL(route.request().url()).pathname.slice(1);
      if (!scriptsOff && file === "assets/app.js") return route.abort();
      return route.fulfill({ path: path.join(root, file) });
    });
    try {
      const page = await context.newPage();
      await page.goto(`${origin}/dmv-permit-test-passing-score-calculator.html?state=new-york#score-calculator`);
      assert.equal(await page.locator("[data-score-check]").isVisible(), false);
      assert.equal(await page.locator("[data-score-state]").isVisible(), false);
      assert.equal(await page.locator("#score-filter").isVisible(), false);
      assert.equal(await page.locator("#score-table table").isVisible(), true);
      const fallback = page.locator("[data-score-fallback]");
      await fallback.getByRole("link", { name: "See a worked miss-limit example" }).press("Enter");
      await page.waitForURL(url => url.hash === "#score-manual-math");
      const example = page.locator("#score-manual-math");
      assert.match(await example.innerText(), /multiply.*round.*up.*subtract/is);
      assert.match(await example.innerText(), /37 questions.*80%.*29\.6.*30 correct.*7 misses.*example.*not an official test length/is);
      const ny = page.locator("#new-york-permit-test-passing-score");
      assert.match(await ny.innerText(), /at least 2 of the 4 sign questions/i);
      assert.equal(await ny.getByText("Verify official rule").getAttribute("href"), directSources["new-york"]);
      const nc = page.locator("#north-carolina-permit-test-passing-score");
      assert.match(await nc.innerText(), /3 of 12 road signs.*separate knowledge score must be at least 80%/is);
      assert.equal(await nc.getByText("Verify official rule").getAttribute("href"), directSources["north-carolina"]);
      const ncRow = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "North Carolina", exact: true }) });
      assert.match(await ncRow.innerText(), /actual knowledge count; 12 signs separately/);
      for (const [state, url] of Object.entries(wholeKnowledgeSamples)) {
        const card = page.locator(`#${state}-permit-test-passing-score`);
        assert.equal(await card.getByRole("link", { name: /sample practice/ }).getAttribute("href"), url);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const screenshots = process.env.VERIFY_SCREENSHOTS_DIR;
      if (screenshots) await example.screenshot({ path: path.join(screenshots, `manual-score-${width}.png`) });
      await page.goto(`${origin}/dmv-permit-test-requirements-by-state.html?state=michigan#requirements-finder`);
      assert.equal(await page.locator("[data-requirements-state]").isVisible(), false);
      assert.equal(await page.locator("[data-requirements-pass]").isVisible(), false);
      await page.getByRole("link", { name: "Compare published state rules" }).press("Enter");
      await page.waitForURL(url => url.hash === "#compare-states");
      assert.ok(await page.locator("#compare-states").getByRole("rowheader", { name: "New York" }).isVisible());
      assert.equal(await page.getByRole("link", { name: /approved knowledge and sign rules/ }).getAttribute("href"),
        directSources["north-carolina"]);
      await page.goto(`${origin}/north-carolina-dmv-road-signs-practice.html#sources`);
      const official = page.locator("#sources").getByRole("link", { name: /approved knowledge and sign rules/ });
      assert.equal(await official.getAttribute("href"), directSources["north-carolina"]);
      assert.equal(await official.isVisible(), true);
    } finally { await context.close(); }
  });
}

for (const width of [320, 1280]) {
  test(`${width}px: custom practice scores lead to the right preparation, not final readiness`, async () => {
    const { context, page } = await openScore({ width, height: 844 });
    try {
      const state = page.locator("[data-score-state]");
      const nextTitle = page.locator("[data-score-next-title]");
      for (const [name, total, correct, destination, expectedStatus] of [
        ["florida", "10", "8", "florida-dmv-permit-practice-test.html?mode=mock#practice", "Meets the scaled practice target"],
        ["florida", "40", "32", "https://www.flhsmv.gov/resources/handbooks-manuals/", "Meets the scaled practice target"],
        ["ohio", "10", "8", wholeKnowledgeSamples.ohio, "Meets the scaled practice target"],
        ["georgia", "10", "7", "https://dds.georgia.gov/testing-and-training/practice-test", "1 more correct answer needed"],
        ["georgia", "10", "9", "https://dds.georgia.gov/testing-and-training/practice-test", "Scaled practice target met; road-sign rule not checked"],
      ]) {
        await state.selectOption(name);
        await totalInput(page).fill(total);
        await correctInput(page).fill(correct);
        await check(page);
        assert.equal(await score(page), expectedStatus, name);
        assert.equal(await nextLink(page).getAttribute("href"), destination, name);
        assert.doesNotMatch(await nextTitle.textContent(), /final readiness|permit steps/i);
      }
      await state.selectOption("florida");
      await useLength(page).click();
      await correctInput(page).fill("40");
      await check(page);
      assert.equal(await score(page), "Meets the selected state target");
      assert.match(await nextLink(page).getAttribute("href"), /dmv-test-day-checklist\.html\?state=florida/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    } finally { await context.close(); }
  });

  test(`${width}px: Illinois distinguishes a minimum exam length from a fixed example`, async () => {
    const { context, page } = await openScore({ width, height: 844 });
    try {
      const state = page.locator("[data-score-state]");
      await state.selectOption("illinois");
      const count = page.locator("[data-score-count-answer]");
      assert.equal(await page.locator("[data-score-length-label]").textContent(), "Minimum written-test length");
      assert.equal(await page.locator("[data-score-questions]").textContent(), "35+");
      assert.match(await page.locator("[data-score-source]").getAttribute("href"), /092010300000800R\.html$/);
      assert.equal(await useLength(page).textContent(), "Example: 35 questions");
      const card = page.locator("#illinois-permit-test-passing-score");
      assert.match(await card.innerText(), /at least 35.*80%.*28 correct.*miss 7/s);
      assert.match(await page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Illinois", exact: true }) }).innerText(), /At least 35 questions/);

      await totalInput(page).fill("34");
      assert.match(await count.innerText(), /need 28 correct; can miss up to 6.*below the 35-question minimum/);
      await correctInput(page).fill("30");
      await check(page);
      assert.match(await score(page), /scaled practice target/);
      assert.equal(await nextLink(page).getAttribute("href"), "https://www.ilsos.gov/content/dam/publications/pdf_publications/dsd_a112.pdf#page=39");
      assert.equal(await nextLink(page).textContent(), "Open Illinois study questions");
      assert.match(await page.locator("[data-score-next-title]").textContent(), /longer Illinois practice/);
      await useLength(page).click();
      assert.equal(await totalInput(page).inputValue(), "35");
      assert.match(await count.innerText(), /need 28 correct; can miss up to 7.*35 is the minimum/);

      await totalInput(page).fill("41");
      assert.match(await count.innerText(), /need 33 correct; can miss up to 8.*35 is the minimum/);
      assert.doesNotMatch(await count.innerText(), /not the official test format/);
      await correctInput(page).fill("32");
      await check(page);
      assert.match(await score(page), /1 more correct answer needed/);
      await correctInput(page).fill("33");
      await check(page);
      assert.match(await score(page), /^Meets/);
      assert.match(await resultMessage(page).innerText(), /35 is the minimum, not a fixed length/);
      assert.match(await nextLink(page).getAttribute("href"), /dmv-test-day-checklist\.html\?state=illinois/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    } finally { await context.close(); }
  });

  test(`${width}px: four state score paths never borrow another state's checklist`, async () => {
    const { context, page } = await openScore({ width, height: 900 });
    try {
      const startUrl = page.url();
      const state = page.locator("[data-score-state]");
      const prep = page.locator("[data-score-checklist]");
      await page.evaluate(() => localStorage.setItem("tdt-dmv-test-day:last-state", "florida"));
      for (const row of [
        ["georgia", "Georgia", "15", "15", "https://dds.georgia.gov/georgia-licenses-ids-and-permits/new-license-id-or-permit/how-do-i-learners-permit"],
        ["ohio", "Ohio", "30", "", "ohio-bmv-road-signs-practice.html#ohio-knowledge-cases"],
        ["virginia", "Virginia", "24", "10", "https://www.dmv.virginia.gov/licenses-ids/learners/apply"],
        ["arizona", "Arizona", "24", "", "arizona-mvd-road-signs-practice.html#arizona-permit-path"],
      ]) {
        const [id, label, correct, signs, href] = row;
        await page.goto(`${startUrl}?state=${id}#score-calculator`);
        assert.equal(await state.inputValue(), id);
        const card = page.locator(`#${id}-permit-test-passing-score`);
        const expectedLabel = `${label} permit steps`;
        const cardLink = card.locator(".score-answer-actions a").last();
        assert.equal(await cardLink.getAttribute("href"), href);
        assert.equal(await cardLink.innerText(), expectedLabel);
        assert.equal(await prep.innerText(), expectedLabel);
        assert.equal(await prep.getAttribute("href"), href);
        await useLength(page).click();
        await correctInput(page).fill(correct);
        if (signs) await page.locator("[data-score-section-correct]").fill(signs);
        await check(page);
        assert.match(await score(page), /^Meets/);
        assert.equal(await nextLink(page).innerText(), expectedLabel);
        assert.equal(await nextLink(page).getAttribute("href"), href);
        assert.match(await page.locator("[data-score-next-copy]").innerText(), /practice.*not.*permit/i);
        if (!href.startsWith("https:")) {
          await nextLink(page).click();
          await page.waitForLoadState("load");
          await page.waitForURL(`**/${href}`);
          const section = page.locator(new URL(page.url()).hash);
          assert.equal(await section.isVisible(), true);
          assert.match(await section.locator("h2").innerText(), new RegExp(label));
        }
      }
      await page.goto(`${startUrl}?state=arizona#score-calculator`);
      await state.selectOption("new-york");
      assert.equal(await prep.innerText(), "Test-day checklist");
      assert.equal(await prep.getAttribute("href"), "dmv-test-day-checklist.html?state=new-york#dmv-checklist");
      await useLength(page).click();
      await correctInput(page).fill("14");
      await page.locator("[data-score-section-correct]").fill("2");
      await check(page);
      assert.equal(await nextLink(page).getAttribute("href"), "dmv-test-day-checklist.html?state=new-york#dmv-checklist");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    } finally { await context.close(); }
  });

  test(`${width}px: a total alone answers how many you can miss without grading a score`, async () => {
    const { context, page } = await openScore({ width, height: 844 });
    try {
      const state = page.locator("[data-score-state]");
      const count = page.locator("[data-score-count-answer]");
      assert.equal(await count.isVisible(), false);
      await state.selectOption("california");
      await totalInput(page).fill("36");
      assert.match(await count.innerText(), /36 questions: need 29 correct; can miss up to 7.*Confirm your current test length/);
      assert.equal(await correctInput(page).inputValue(), "");
      assert.equal(await score(page), "Enter your practice score.");
      assert.equal(await page.locator("[data-score-next]").isVisible(), false);
      await check(page);
      assert.match(await count.innerText(), /can miss up to 7/);
      assert.equal((await tracked(page)).length, 0);
      await state.selectOption("texas");
      assert.equal(await count.isVisible(), false);
      await totalInput(page).fill("31");
      assert.match(await count.innerText(), /31 questions: need 22 correct; can miss up to 9/);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      for (const invalid of ["", "0", "10.5", "101"]) {
        await totalInput(page).fill(invalid);
        assert.equal(await count.isVisible(), false);
        assert.equal(await count.textContent(), "");
      }
      assert.equal((await tracked(page)).length, 0);
    } finally { await context.close(); }
  });

  test(`${width}px: a near miss does not round to the passing mark and Enter checks the result`, async () => {
    const { context, page } = await openScore({ width, height: 844 });
    try {
      const url = page.url();
      const displayed = page.locator("[data-score-percent]");
      await page.locator("[data-score-state]").selectOption("california");
      await totalInput(page).fill("83");
      await correctInput(page).fill("66");
      assert.equal(await displayed.innerText(), "79.52%");
      assert.equal(await nextLink(page).isVisible(), false);
      await correctInput(page).press("Enter");
      assert.equal(page.url(), url);
      assert.match(await score(page), /1 more correct answer needed/);
      assert.ok(await nextLink(page).isVisible());
      assert.deepEqual((await tracked(page)).map(event => event.result), ["below_target"]);

      await correctInput(page).fill("67");
      assert.equal(await displayed.innerText(), "80.72%");
      assert.equal(await nextLink(page).isVisible(), false);
      await totalInput(page).press("Enter");
      assert.match(await score(page), /^Meets/);
      assert.ok(await nextLink(page).isVisible());
      assert.deepEqual((await tracked(page)).map(event => event.result), ["below_target", "target_met"]);

      await totalInput(page).fill("10.5");
      await totalInput(page).press("Enter");
      assert.equal(await score(page), "Check the question counts");
      assert.equal(await nextLink(page).isVisible(), false);
      assert.equal((await tracked(page)).length, 2);

      await page.locator("[data-score-state]").selectOption("florida");
      await useLength(page).click();
      await correctInput(page).fill("40");
      await check(page);
      assert.equal(await displayed.innerText(), "80%");
      assert.match(await score(page), /^Meets/);
      assert.equal((await tracked(page)).length, 3);
    } finally { await context.close(); }
  });
}

for (const width of [320, 1280]) {
  test(`${width}px: low Ohio and Arizona knowledge scores lead to the official whole-subject samples`, async () => {
    const { context, page } = await openScore({ width, height: 844 });
    try {
      for (const [state, total, needed, guide] of [
        ["ohio", 40, 30, "ohio-bmv-road-signs-practice.html"],
        ["arizona", 30, 24, "arizona-mvd-road-signs-practice.html"],
      ]) {
        await page.locator("[data-score-state]").selectOption(state);
        await useLength(page).click();
        assert.equal(await totalInput(page).inputValue(), String(total));
        await correctInput(page).fill(String(needed - 1));
        await check(page);
        assert.equal(await score(page), "1 more correct answer needed");
        assert.equal(await nextLink(page).getAttribute("href"), wholeKnowledgeSamples[state]);
        assert.match(await page.locator("[data-score-next-copy]").innerText(), /driving rules and road signs.*not an official retake/);
        assert.equal(await page.getByRole("link", { name: "Road-sign practice", exact: true }).getAttribute("href"), guide);
        if (process.env.SAMPLE_ROUTE_SCREENSHOTS_DIR) {
          await page.locator(".score-panel").screenshot({ path: path.join(process.env.SAMPLE_ROUTE_SCREENSHOTS_DIR, `${state}-score-${width}.png`) });
        }
        await correctInput(page).fill(String(needed));
        await check(page);
        assert.equal(await score(page), "Meets the selected state target");
        assert.ok((await nextLink(page).getAttribute("href")).startsWith(guide + "#"));
      }
      assert.deepEqual((await tracked(page)).map(event => event.result), ["below_target", "target_met", "below_target", "target_met"]);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    } finally { await context.close(); }
  });
}

test("miss counts retain separate sign requirements and distinguish scaled practice", async () => {
  const { context, page } = await openScore();
  try {
    const state = page.locator("[data-score-state]");
    const count = page.locator("[data-score-count-answer]");
    for (const [name, exact] of [
      ["new-york", /20 questions: need 14 correct; can miss up to 6/],
      ["georgia", /20 questions on road rules: need 15 correct; can miss up to 5/],
      ["virginia", /30 questions on general knowledge: need 24 correct; can miss up to 6/],
    ]) {
      await state.selectOption(name);
      await useLength(page).click();
      assert.match(await count.innerText(), exact);
      assert.match(await count.innerText(), /road-sign requirement still applies/);
      assert.doesNotMatch(await count.innerText(), /scaled practice/);
      await totalInput(page).fill("10");
      assert.match(await count.innerText(), /road-sign requirement still applies.*scaled practice math, not the official test format/);
    }
    assert.equal((await tracked(page)).length, 0);
  } finally { await context.close(); }
});

test("no state invents a practice score; a length shortcut cannot turn 39 correct into 40", async () => {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const { context, page } = await openScore(viewport);
    try {
      const state = page.locator("[data-score-state]");
      assert.equal(await correctInput(page).inputValue(), "");
      assert.equal(await totalInput(page).inputValue(), "");
      assert.equal(await useLength(page).isEnabled(), false);
      await state.selectOption("florida");
      assert.equal(await correctInput(page).inputValue(), "");
      await check(page);
      assert.equal(await page.locator("[data-score-next]").isVisible(), false);
      assert.equal((await tracked(page)).length, 0);
      await correctInput(page).fill("39");
      await totalInput(page).fill("40");
      await check(page);
      assert.match(await score(page), /^Above/);
      await useLength(page).click();
      assert.equal(await correctInput(page).inputValue(), "39");
      assert.equal(await totalInput(page).inputValue(), "50");
      assert.equal(await page.locator("[data-score-next]").isVisible(), false);
      await check(page);
      assert.match(await score(page), /1 more correct answer needed/);
      assert.equal((await tracked(page)).at(-1).practice_correct, 39);
      await state.selectOption("new-york");
      assert.equal(await correctInput(page).inputValue(), "");
      assert.equal(await totalInput(page).inputValue(), "");
      await useLength(page).click();
      assert.equal(await correctInput(page).inputValue(), "");
      assert.equal(await page.locator("[data-score-section]").isVisible(), true);
      await state.selectOption("california");
      await correctInput(page).fill("0");
      await totalInput(page).fill("10");
      await check(page);
      assert.match(await score(page), /8 more correct/);
    } finally { await context.close(); }
  }
});

test("New York requires the included sign score, with no false full-target result", async () => {
  const { context, page } = await openScore();
  try {
    await page.locator("[data-score-state]").selectOption("new-york");
    await useLength(page).click();
    await correctInput(page).fill("14");
    await check(page);
    assert.match(await score(page), /not checked/);
    assert.equal(await nextLink(page).getAttribute("href"), "#score-section-correct");
    assert.equal(await nextLink(page).getAttribute("data-dmv-state-link"), null);
    await nextLink(page).press("Enter");
    await page.waitForURL(/#score-section-correct$/);
    assert.equal(await page.evaluate(() => document.activeElement.id), "score-section-correct");
    await page.locator("[data-score-section-correct]").fill("1");
    await check(page);
    assert.match(await score(page), /1 more road-sign answer needed/);
    assert.equal(await nextLink(page).getAttribute("href"), "new-york-dmv-road-signs-practice.html#practice");
    assert.equal(await nextLink(page).getAttribute("data-dmv-path"), "road_signs");
    await page.locator("[data-score-section-correct]").fill("2");
    await check(page);
    assert.match(await score(page), /^Meets/);
    assert.match(await page.locator("[data-score-next-link]").getAttribute("href"), /checklist/);
    assert.deepEqual((await tracked(page)).map((event) => event.result),
      ["section_unverified", "below_target", "target_met"]);
    await page.locator("[data-score-input-correct]").fill("18");
    await page.locator("[data-score-section-correct]").fill("1");
    await check(page);
    assert.match(await page.locator("[data-score-message]").textContent(), /do not match/);
    assert.equal((await tracked(page)).length, 3, "Impossible counts do not emit a checked-score event");
    assert.equal(await page.locator("[data-score-next]").isVisible(), false);
  } finally { await context.close(); }
});

for (const rule of [
  {
    state: "georgia", correct: "15", signs: "15", failingSigns: "14", label: "Road rules correct",
    guide: "georgia-dds-road-signs-practice.html", topic: "road rules",
    sample: "https://dds.georgia.gov/testing-and-training/practice-test",
  },
  {
    state: "virginia", correct: "24", signs: "10", failingSigns: "9", label: "General knowledge correct",
    guide: "virginia-dmv-road-signs-practice.html", topic: "general knowledge",
    sample: "https://www.dmv.virginia.gov/licenses-ids/exams/practice-exam",
  },
]) {
  test(`${rule.state}: each required section must reach its own target`, async () => {
    const { context, page } = await openScore();
    try {
      await page.locator("[data-score-state]").selectOption(rule.state);
      assert.equal(await page.locator("[data-score-correct-label]").textContent(), rule.label);
      assert.match(await page.locator("[data-score-length-note]").textContent(), /this section only/);
      await useLength(page).click();
      await page.locator("[data-score-input-correct]").fill(rule.correct);
      await check(page);
      assert.match(await score(page), /not checked/);
      assert.equal(await nextLink(page).getAttribute("href"), "#score-section-correct");
      await page.locator("[data-score-section-correct]").fill(rule.failingSigns);
      await check(page);
      assert.match(await score(page), /more road-sign/);
      assert.equal(await nextLink(page).getAttribute("href"), rule.guide);
      await page.locator("[data-score-section-correct]").fill(rule.signs);
      await check(page);
      assert.match(await score(page), /^Meets/);
      await page.locator("[data-score-input-correct]").fill(String(Number(rule.correct) - 1));
      await check(page);
      assert.match(await score(page), /1 more correct answer needed/);
      assert.equal(await nextLink(page).getAttribute("href"), rule.sample);
      assert.match(await page.locator("[data-score-percent]").innerText(), new RegExp(`on ${rule.topic}`));
      assert.match(await page.locator("[data-score-next-title]").innerText(), new RegExp(rule.topic));
      await page.locator("[data-score-section-correct]").fill(rule.failingSigns);
      await check(page);
      assert.equal(await nextLink(page).getAttribute("href"), rule.guide);
      assert.match(await page.locator("[data-score-next-copy]").innerText(), /also needs work/);
    } finally { await context.close(); }
  });

  test(`${rule.state}: a sign-only result does not invent a score for the other section`, async () => {
    const { context, page } = await openScore({ width: 390, height: 844 });
    try {
      await page.locator("[data-score-state]").selectOption(rule.state);
      await useLength(page).click();
      const signs = page.locator("[data-score-section-correct]");
      await signs.fill(rule.failingSigns);
      await check(page);
      assert.match(await score(page), /1 more road-sign answer needed/);
      assert.match(await resultMessage(page).innerText(), new RegExp(`No ${rule.topic} score entered`));
      assert.match(await page.locator("[data-score-percent]").innerText(), /on signs/);
      assert.equal(await nextLink(page).getAttribute("href"), rule.guide);
      await signs.fill(rule.signs);
      await check(page);
      assert.equal(await score(page), "Road-sign target met; one section not checked");
      assert.equal(await nextLink(page).getAttribute("href"), rule.sample);
      assert.equal(await correctInput(page).inputValue(), "");
      assert.equal((await tracked(page)).length, 0);
      await signs.fill("999");
      await check(page);
      assert.match(await resultMessage(page).innerText(), /whole-number road-sign score/);
      assert.equal(await nextLink(page).isVisible(), false);
      assert.equal((await tracked(page)).length, 0);
      await signs.fill(rule.signs);
      await correctInput(page).fill(rule.correct);
      await check(page);
      assert.match(await score(page), /^Meets/);
      assert.equal((await tracked(page)).length, 1);
    } finally { await context.close(); }
  });
}

test("custom-length rounds do not establish separate official section targets", async () => {
  const { context, page } = await openScore();
  try {
    await page.locator("[data-score-state]").selectOption("new-york");
    await page.locator("[data-score-input-total]").fill("10");
    await page.locator("[data-score-input-correct]").fill("10");
    await check(page);
    assert.equal(await page.locator("[data-score-section]").isVisible(), false);
    assert.match(await score(page), /not checked/);
    assert.match(await page.locator("[data-score-message]").textContent(), /only checks the practice percentage/);
    assert.equal((await tracked(page))[0].result, "section_unverified");
  } finally { await context.close(); }
});

for (const width of [390, 1280]) {
  test(`${width}px: North Carolina keeps the 80% knowledge math and 9-of-12 sign check separate`, async () => {
    const { context, page } = await openScore({ width, height: 870 });
    try {
      await page.goto(pathToFileURL(path.join(root, "north-carolina-dmv-road-signs-practice.html")).href);
      await page.getByRole("link", { name: "Check knowledge and sign scores", exact: true }).press("Enter");
      await page.waitForURL(url => url.searchParams.get("state") === "north-carolina" && url.hash === "#score-calculator");
      assert.equal(await page.locator("[data-score-state]").inputValue(), "north-carolina");
      assert.equal(await totalInput(page).inputValue(), "");
      assert.equal(await useLength(page).isEnabled(), false);
      assert.equal(await page.locator("[data-score-source]").getAttribute("href"), directSources["north-carolina"]);
      const signs = page.locator("[data-score-section-correct]");
      const signPractice = "north-carolina-dmv-road-signs-practice.html#north-carolina-sign-recall";
      assert.equal(await signs.isVisible(), true);
      await signs.fill("8");
      await check(page);
      assert.equal(await score(page), "1 more road-sign answer needed");
      assert.match(await resultMessage(page).innerText(), /No knowledge score entered/);
      assert.equal(await totalInput(page).getAttribute("aria-invalid"), "false");
      assert.equal(await nextLink(page).getAttribute("href"), signPractice);
      await signs.fill("9");
      await check(page);
      assert.equal(await score(page), "Road-sign target met; one section not checked");
      assert.deepEqual(await tracked(page), []);
      await signs.fill("13");
      await check(page);
      assert.match(await resultMessage(page).innerText(), /whole-number road-sign score from 0 to 12/);
      assert.deepEqual(await tracked(page), []);

      await totalInput(page).fill("22");
      await correctInput(page).fill("18");
      await signs.fill("");
      await check(page);
      assert.match(await page.locator("[data-score-count-answer]").textContent(), /22 questions on knowledge: need 18 correct; can miss up to 4/);
      assert.match(await score(page), /road-sign rule not checked/);
      assert.equal(await nextLink(page).getAttribute("href"), "#score-section-correct");
      await signs.fill("8");
      await check(page);
      assert.equal(await score(page), "1 more road-sign answer needed");
      assert.equal(await nextLink(page).getAttribute("href"), signPractice);
      await signs.fill("9");
      await check(page);
      assert.equal(await score(page), "Practice scores meet both thresholds");
      assert.match(await resultMessage(page).innerText(), /not a verified official length/);
      assert.match(await nextLink(page).getAttribute("href"), /license-learner-permit\.aspx$/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      if (process.env.SCORE_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.SCORE_SCREENSHOTS_DIR, { recursive: true });
        await page.locator(".score-panel").screenshot({ path: path.join(process.env.SCORE_SCREENSHOTS_DIR, `north-carolina-${width}.png`) });
      }
      await correctInput(page).fill("17");
      await check(page);
      assert.equal(await score(page), "1 more correct answer needed");
      assert.match(await nextLink(page).getAttribute("href"), /\/test\.aspx$/);
      assert.deepEqual((await tracked(page)).map(event => event.result), ["section_unverified", "below_target", "target_met", "below_target"]);
    } finally { await context.close(); }
  });
}

test("the New York result opens the four-sign checkpoint at mobile width", async () => {
  const { context, page } = await openScore({ width: 390, height: 844 });
  try {
    await page.locator("[data-score-state]").selectOption("new-york");
    await useLength(page).click();
    await correctInput(page).fill("14");
    await page.locator("[data-score-section-correct]").fill("1");
    await check(page);
    const examples = page.locator(".score-query-guide");
    assert.equal(await examples.locator("article").count(), 3);
    assert.match(await examples.innerText(), /A section not taken is not a score of zero/);
    await nextLink(page).click();
    await page.waitForURL(/new-york-dmv-road-signs-practice\.html#practice$/);
    assert.ok(await page.locator("#practice").isVisible());
    assert.match(await page.locator("#practice").innerText(), /4-sign checkpoint/i);
  } finally { await context.close(); }
});

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`${viewport.width}px: published mixed-set goal and official comparison never stand in for one another`, async () => {
    const { context, page } = await openScore(viewport);
    try {
      const state = page.locator("[data-score-state]");
      const mixed = page.locator("[data-score-mixed-result]");
      assert.deepEqual(await state.locator("option[data-mixed-correct]:not([data-mixed-correct=''])").evaluateAll(options =>
        options.map(option => [option.value, Number(option.dataset.mixedQuestions), Number(option.dataset.mixedCorrect)])),
        ["california", "new-york", "florida", "pennsylvania", "new-jersey"].map(value => [value, 40, 32]));
      await state.selectOption("pennsylvania");
      await totalInput(page).fill("40");
      await correctInput(page).fill("32");
      assert.equal(await mixed.isVisible(), false);
      await check(page);
      assert.equal(await mixed.isVisible(), true);
      assert.match(await score(page), /2 more correct answers needed/);
      assert.match(await page.locator("[data-score-message]").textContent(), /not an official-format score/);
      assert.match(await mixed.textContent(), /If you took our full mixed set.*32\/40: goal met/);
      assert.match(await page.locator("[data-score-next-copy]").textContent(), /already met its practice goal/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      assert.deepEqual((await tracked(page)).map(event => event.result), ["below_target"]);
      if (process.env.SCORE_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.SCORE_SCREENSHOTS_DIR, { recursive: true });
        await page.locator(".score-panel").screenshot({ path: path.join(process.env.SCORE_SCREENSHOTS_DIR, `pennsylvania-${viewport.width}.png`) });
      }
      await state.selectOption("new-york");
      await totalInput(page).fill("40");
      await correctInput(page).fill("28");
      await check(page);
      assert.match(await score(page), /road-sign rule not checked/);
      assert.match(await mixed.textContent(), /32\/40: 4 more correct answers/);
      await correctInput(page).fill("31");
      assert.equal(await mixed.isVisible(), false);
      await check(page);
      assert.match(await mixed.textContent(), /32\/40: 1 more correct answer to reach it/);
      await useLength(page).click();
      await correctInput(page).fill("14");
      await page.locator("[data-score-section-correct]").fill("2");
      await check(page);
      assert.match(await score(page), /^Meets/);
      assert.equal(await mixed.isVisible(), false);
      await state.selectOption("ohio");
      await useLength(page).click();
      await correctInput(page).fill("30");
      await check(page);
      assert.match(await score(page), /^Meets/);
      assert.equal(await mixed.isVisible(), false, "40 questions alone do not imply a site mixed set");
    } finally { await context.close(); }
  });
}

test("single-section rules remain correct and rounded published percentages do not overstate targets", async () => {
  const { context, page } = await openScore();
  try {
    await page.locator("[data-score-state]").selectOption("florida");
    await useLength(page).click();
    await correctInput(page).fill("40");
    await check(page);
    assert.match(await score(page), /^Meets/);
    assert.equal(await page.locator("[data-score-section]").isVisible(), false);
    await page.locator("[data-score-input-correct]").fill("39");
    await check(page);
    assert.match(await score(page), /1 more correct/);
    await page.locator("[data-score-state]").selectOption("pennsylvania");
    await page.locator("[data-score-input-total]").fill("36");
    await page.locator("[data-score-input-correct]").fill("30");
    await check(page);
    assert.match(await score(page), /^Meets/);
  } finally { await context.close(); }
});

test("invalid and fractional counts do not silently become passing scores or tracked usage", async () => {
  const { context, page } = await openScore();
  try {
    await page.locator("[data-score-state]").selectOption("florida");
    for (const [correct, total] of [["", "50"], ["51", "50"], ["40.5", "50"], ["40", "0"], ["40", ""], ["-1", "50"]]) {
      await page.locator("[data-score-input-total]").fill(total);
      await page.locator("[data-score-input-correct]").fill(correct);
      await check(page);
      assert.equal(await score(page), "Check the question counts");
      assert.equal(await page.locator("[data-score-next]").isVisible(), false);
    }
    assert.equal((await tracked(page)).length, 0);
    await page.locator("[data-score-state]").selectOption("new-york");
    await useLength(page).click();
    await correctInput(page).fill("14");
    for (const signs of ["-1", "5", "2.5"]) {
      await page.locator("[data-score-section-correct]").fill(signs);
      await check(page);
      assert.equal(await score(page), "Check the question counts");
      assert.equal(await page.locator("[data-score-section-correct]").getAttribute("aria-invalid"), "true");
    }
    assert.equal((await tracked(page)).length, 0);
  } finally { await context.close(); }
});

test("state changes clear stale section scores; desktop and mobile fit", async () => {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const { context, page } = await openScore(viewport);
    try {
      for (const state of ["new-york", "georgia", "virginia", "florida"]) {
        await page.locator("[data-score-state]").selectOption(state);
        assert.equal(await page.locator("[data-score-section-correct]").inputValue(), "");
        await useLength(page).click();
        await check(page);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
        if (process.env.VERIFY_SCREENSHOTS_DIR) {
          fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
          await page.locator("[data-score-check]").scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `score-${state}-${viewport.width}.png`) });
        }
        if (state !== "florida") await page.locator("[data-score-section-correct]").fill("1");
      }
    } finally { await context.close(); }
  }
});
