const assert = require("node:assert/strict");
const fs = require("node:fs");
const { before, after, test } = require("node:test");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const file = (slug) => pathToFileURL(path.join(root, `${slug}.html`)).href;
const caPermit = "https://www.dmv.ca.gov/portal/driver-licenses-identification-cards/learners-permits/";
const caRenewal = "https://www.dmv.ca.gov/portal/driver-education-and-safety/online-learning-and-tests/";
const caRetake = "https://www.dmv.ca.gov/portal/handbook/california-driver-handbook/the-testing-process/";
const azTest = "https://azdot.gov/mvd/services/driver-license-ID/permit-test";
const azTeen = "https://azdot.gov/mvd/services/driver-services/teen-drivers/permit-and-license-requirements";
const gaExam = "https://dds.georgia.gov/testing-and-training/test-and-exams-information";
const gaLanguages = "https://dds.georgia.gov/list-languages";
const ohPermit = "https://www.bmv.ohio.gov/dl-gdl.aspx";
const ohDrivingLog = "https://dam.assets.ohio.gov/image/upload/publicsafety.ohio.gov/bmv5791.pdf";
const ohTrainingLaw = "https://codes.ohio.gov/ohio-revised-code/section-4507.21";
const floridaDocuments = "florida-dmv-permit-documents-checklist";
const hillsboroughAddress = "https://www.hillstaxfl.gov/drivers-license-id/document-requirements/";
const hillsboroughForms = "https://www.hillstaxfl.gov/forms/";
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

for (const width of [320, 1280]) {
  test(`${width}px: Ohio separates permit supervision, training hours, and first road retest without scripts`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 850 }, javaScriptEnabled: false });
    try {
      await context.route(/^https?:/, route => route.abort());
      const page = await context.newPage();
      const guide = file("ohio-bmv-road-signs-practice");
      await page.goto(guide);
      assert.match(await page.locator("#ohio-knowledge-cases article").last().innerText(),
        /only after issuance.*At 18 or older.*licensed driver age 21 or older/is);
      await page.getByRole("link", { name: "After your Ohio permit", exact: true }).press("Enter");
      await page.waitForURL(guide + "#ohio-after-permit");
      const section = page.locator("#ohio-after-permit");
      assert.match(await section.locator(".section-intro").innerText(), /Non-Renewable\/Non-Transferable.*limited-term/);
      const examples = [
        [/four months.*six-month holding period.*TIPIC was issued/is, ohPermit],
        [/45 practice hours including eight at night.*five supervised hours, at least two of them at night.*50-hour log.*10 hours at night.*separate from the Class D course.*24 hours.*eight driving hours.*BMV 5791.*does not apply/is, ohDrivingLog],
        [/failed maneuverability.*initial driver's license.*12 months before your application.*abbreviated adult course.*not a response to failing the written test/is, ohTrainingLaw],
      ];
      const cards = section.locator("article");
      assert.equal(await cards.count(), examples.length);
      for (const [index, [text, href]] of examples.entries()) {
        const card = cards.nth(index);
        assert.match(await card.innerText(), text);
        assert.equal(await card.getByRole("link").getAttribute("href"), href);
      }
      const heading = await section.getByRole("heading", { level: 2 }).boundingBox();
      const header = await page.locator(".site-header").boundingBox();
      assert.ok(heading.y >= header.y + header.height);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.equal(await page.locator("[data-quiz]").count(), 0);
    } finally { await context.close(); }
  });
}

for (const width of [390, 1280]) {
  test(`${width}px: New York school bus cases distinguish the median exception and link official guidance`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      await context.route(/^https?:/, route => route.abort());
      const page = await context.newPage();
      page.setDefaultTimeout(6000);
      await page.goto(file("new-york-dmv-permit-practice-test"));
      await page.locator(".hero-actions").getByRole("link", { name: "NY school bus cases", exact: true }).click();
      assert.equal(new URL(page.url()).hash, "#new-york-school-bus");
      const section = page.getByRole("region", { name: "Must you stop across a median in New York?" });
      const diagram = section.getByRole("img", { name: /painted center lines.*concrete median/i });
      assert.ok(await diagram.evaluate(image => image.complete && image.naturalWidth > 0));
      const header = await page.locator(".site-header").boundingBox();
      const heading = await section.getByRole("heading", { level: 2 }).boundingBox();
      assert.ok(heading.y >= header.y + header.height);
      const [ny, pa, wait] = await section.locator("details").all();
      assert.equal(await ny.locator("p").isVisible(), false);
      await ny.locator("summary").press("Enter");
      assert.match(await ny.locator("p").innerText(), /Both roads.*before reaching the bus.*at least 20 feet/is);
      await pa.locator("summary").press("Enter");
      assert.match(await pa.locator("p").innerText(), /Pennsylvania.*without stopping.*opposite.*painted lines/is);
      await wait.locator("summary").press("Enter");
      assert.match(await wait.locator("p").innerText(), /bus moves again.*driver or a police officer/is);
      assert.equal(await section.getByRole("link", { name: /section 1174/ }).getAttribute("href"), "https://www.nysenate.gov/legislation/laws/VAT/1174");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (process.env.NY_SCHOOL_BUS_EVIDENCE_DIR) {
        const fs = require("node:fs");
        fs.mkdirSync(process.env.NY_SCHOOL_BUS_EVIDENCE_DIR, { recursive: true });
        await section.screenshot({ path: path.join(process.env.NY_SCHOOL_BUS_EVIDENCE_DIR, `ny-school-bus-${width}.png`) });
      }
      await page.goto(file("new-york-dmv-permit-practice-test") + "?mode=mock#practice");
      const quiz = page.locator('[data-mode-panel="mock"] [data-quiz]');
      const question = quiz.locator(".question", { hasText: "If you see a school bus with red lights flashing" });
      const index = await question.getAttribute("data-question-index");
      await quiz.locator(`[data-quiz-jump="${index}"]`).click();
      await question.getByRole("button", { name: "Stop as required and watch for children" }).click();
      assert.match(await question.locator(".feedback").innerText(), /^Correct\./);
      const source = question.getByRole("link", { name: /School Buses.*stop even across a median/ });
      assert.equal(await source.isVisible(), true);
      assert.match(await source.getAttribute("href"), /chapter-6-passing/);
      await page.goto(file("new-york-dmv-permit-practice-test") + "?mode=mock&resume=1#practice");
      assert.equal(await question.isVisible(), true);
      assert.match(await question.locator(".feedback").innerText(), /^Correct\./);
      assert.equal(await source.isVisible(), true);
      const save = page.locator(".faq details").filter({ hasText: "Does the quiz save my results?" });
      await save.locator("summary").click();
      assert.match(await save.innerText(), /in this browser.*counts.*not your selected answers/is);
    } finally { await context.close(); }
  });
}

const scoreCalculator = "dmv-permit-test-passing-score-calculator";
const scoreEntrances = [
  ["new-york-dmv-road-signs-practice", "Check passing score", "new-york", /14 correct out of 20, including at least 2 road-sign/],
  ["texas-dmv-road-signs-practice", "Passing score", "texas", /70% or better/],
  ["illinois-dmv-road-signs-practice", "Passing score", "illinois", /80% correct; at least 35 questions/],
  ["pennsylvania-dmv-road-signs-practice", "Passing score", "pennsylvania", /15 correct out of 18/],
  ["new-jersey-mvc-road-signs-practice", "Passing score", "new-jersey", /40 correct out of 50/],
  ["florida-dmv-permit-practice-test", "Passing score", "florida", /40 correct out of 50/],
  ["florida-dmv-permit-practice-test", "Open score calculator", "florida", /40 correct out of 50/],
];

for (const [slug, name, state, rule] of scoreEntrances) {
  test(`${slug}: ${name} opens the matching state rule`, async () => {
    const context = await browser.newContext({ viewport: { width: state === "new-york" ? 390 : 1280, height: 850 } });
    try {
      await context.route(/^https?:/, route => route.abort());
      const page = await context.newPage();
      await page.goto(file(slug));
      const link = page.locator(name === "Open score calculator" ? "main" : ".hero-actions").getByRole("link", { name, exact: true });
      assert.equal(await link.getAttribute("href"), `${scoreCalculator}.html?state=${state}#score-calculator`);
      if (state === "new-york") {
        assert.match(await page.locator(".exam-brief").innerText(), /14\+ of 20, including 2\+ signs/);
      }
      await link.click();
      await page.waitForURL(`${file(scoreCalculator)}?state=${state}#score-calculator`);
      await page.waitForLoadState("load");
      assert.equal(await page.locator("[data-score-state]").inputValue(), state);
      assert.match(await page.locator("[data-score-rule]").innerText(), rule);
    } finally { await context.close(); }
  });
}

test("New York mixed-practice summaries count the signs inside the overall minimum", async () => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    await page.goto(file("new-york-dmv-permit-practice-test"));
    const main = await page.locator("main").innerText();
    assert.equal((main.match(/14\+ of 20, including 2\+ signs/g) || []).length, 3);
    assert.doesNotMatch(main, /14 correct (?:plus|and) 2 sign questions/);
  } finally { await context.close(); }
});

test("published practice pages omit the generic editorial console without losing their quiz modes", async () => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    for (const slug of [
      "california-dmv-permit-practice-test",
      "new-york-dmv-permit-practice-test",
      "florida-dmv-permit-practice-test",
      "pennsylvania-dmv-permit-practice-test",
      "new-jersey-mvc-permit-practice-test",
      "california-dmv-road-signs-practice",
      "florida-dmv-road-signs-practice",
      "regulatory-traffic-signs-practice-test",
    ]) {
      await page.goto(file(slug));
      assert.equal(await page.locator("main .task-console").count(), 0, slug);
      assert.ok(await page.getByRole("heading", { name: "Choose a practice mode" }).isVisible(), slug);
      assert.ok(await page.locator("#practice").count(), slug);
    }
    await page.goto(file("road-signs-practice-test"));
    assert.ok(await page.getByRole("heading", { name: "Review the reason behind a missed sign" }).isVisible());
    await page.goto(file("new-york-dmv-road-signs-practice"));
    assert.ok(await page.getByRole("heading", { name: "Can you turn right on red in New York?" }).isVisible());
  } finally { await context.close(); }
});

for (const width of [390, 1280]) {
  test(`${width}px: permit guides link to the real decision without advertising a quiz`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 850 }, javaScriptEnabled: false });
    try {
      await context.route(/^https?:/, route => route.abort());
      const page = await context.newPage();
      for (const [slug, action, anchor, heading] of [
        ["florida-class-e-knowledge-exam-tlsae", "Choose a course", "florida-course-path", /course/i],
        [floridaDocuments, "Find your document route", "florida-document-route", /steps that apply to your visit/i],
      ]) {
        await page.goto(file(slug));
        const main = page.locator("main");
        assert.ok(await main.getByRole("complementary", { name: "Permit guide summary" }).isVisible());
        assert.doesNotMatch(await main.innerText(), /Original practice questions|Instant feedback|Choose a round|Use this practice page/);
        await main.getByRole("link", { name: action, exact: true }).press("Enter");
        await page.waitForURL(`${file(slug)}#${anchor}`);
        assert.match(await main.locator(`#${anchor}`).getByRole("heading", { level: 2 }).innerText(), heading);
        assert.ok(await main.locator('a[href^="https://www.flhsmv.gov/"]').count());
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), slug);
      }
      await page.goto(file("dmv-test-day-checklist"));
      const main = page.locator("main");
      assert.ok(await main.getByRole("complementary", { name: "Checklist summary" }).isVisible());
      assert.equal(await main.locator(".task-console, .trust-strip").count(), 0);
      assert.ok(await main.locator("#dmv-checklist").isVisible());
    } finally { await context.close(); }
  });
}

for (const width of [390, 1280]) {
  test(`${width}px: checklist keeps URL, saved and changed states on the score shortcut`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 850 } });
    try {
      await context.route(/^https?:/, route => route.abort());
      const page = await context.newPage();
      const checklist = file("dmv-test-day-checklist");
      await page.goto(`${checklist}?state=new-york#dmv-checklist`);
      const link = page.locator("[data-checklist-score-link]");
      const checkDestination = async state => {
        const target = new URL(await link.getAttribute("href"), page.url());
        assert.equal(target.hash, "#score-calculator");
        assert.equal(target.searchParams.get("source"), "checklist_hero");
        assert.equal(target.searchParams.get("state"), state);
      };
      await checkDestination("new-york");
      await page.locator("[data-dmv-checklist-state]").selectOption("pennsylvania");
      await checkDestination("pennsylvania");
      await page.goto(checklist);
      assert.equal(await page.locator("[data-dmv-checklist-state]").inputValue(), "pennsylvania");
      await checkDestination("pennsylvania");
      await page.goto(`${checklist}?state=florida`);
      await checkDestination("florida");
      await link.click();
      await page.waitForURL(`${file(scoreCalculator)}?source=checklist_hero&state=florida#score-calculator`);
      await page.waitForLoadState("load");
      assert.equal(await page.locator("[data-score-state]").inputValue(), "florida");
    } finally { await context.close(); }
  });
}

for (const width of [390, 1280]) {
  test(`${width}px: Florida document routes distinguish address, consent, proctor and appointment`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 850 }, javaScriptEnabled: false });
    try {
      await context.route(/^https?:/, (route) => route.abort());
      const page = await context.newPage();
      await page.goto(file(floridaDocuments));
      await page.getByRole("link", { name: "Find your document route", exact: true }).press("Enter");
      await page.waitForURL(`${file(floridaDocuments)}#florida-document-route`);
      const section = page.locator("#florida-document-route");
      const heading = await section.getByRole("heading", { level: 2 }).boundingBox();
      const header = await page.locator(".site-header").boundingBox();
      assert.ok(heading.y >= header.y + header.height, `heading at ${heading.y}px must clear ${header.height}px navigation`);
      assert.equal(await section.getByRole("article").count(), 7);
      for (const [name, guidance, href] of [
        ["Bring two accepted proofs in your name", /including the apartment number/, hillsboroughAddress],
        ["Confirm the minor's family-document route", /Hillsborough lists two proofs.*proof of relationship.*Check your office/, hillsboroughAddress],
        ["Check the certification route", /71120.*one property or lease document and one accepted supporting document.*Two utility bills alone do not meet/, hillsboroughForms],
        ["Prepare parental consent for the application", /71142.*sign in front of licensing staff.*separate from witnessing/, "https://www.hillstaxfl.gov/drivers-license-id/class-e-learner-driver-license/"],
        ["If you tested online as a minor, check both forms", /71144.*notarized or examiner-witnessed signature.*does not replace/, hillsboroughForms],
        ["Book for the step you are actually on", /Orange County.*book the written test.*book a driver license appointment.*your own office/, "https://www.octaxcol.com/about-driver-licenses/first-time-drivers/"],
      ]) {
        const card = section.getByRole("article").filter({ has: page.getByRole("heading", { name, exact: true }) });
        assert.match(await card.innerText(), guidance);
        assert.equal(await card.getByRole("link").getAttribute("href"), href);
      }
      for (const form of ["71120", "71142", "71144"]) {
        assert.equal(await page.locator(`.sources a[href="https://www.flhsmv.gov/pdf/forms/${form}.pdf"]`).count(), 1);
      }
      assert.equal(await page.locator("main :is(form, input:not([type=checkbox]), textarea)").count(), 0);
      const addressCheck = page.getByRole("checkbox", { name: /Prepare two approved address proofs/ });
      await addressCheck.check();
      assert.equal(await addressCheck.isChecked(), true);
      await page.locator("#florida-document-route").evaluate((element) => element.scrollIntoView());
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      if (process.env.PERMIT_PATH_SHOTS) {
        await page.screenshot({ path: path.join(process.env.PERMIT_PATH_SHOTS, `${floridaDocuments}-${width}.png`) });
      }
    } finally {
      await context.close();
    }
  });

  for (const [slug, link, id, cases] of [
    ["california-dmv-permit-practice-test", "First permit or renewal?", "california-permit-path", [
      [/driver-education proof.*Renewal eLearning does not replace it/, caPermit],
      [/noncommercial Class C renewal offers eLearning/, caRenewal],
      [/seven days.*excluding the date you failed.*three knowledge-test attempts/, caRetake],
    ]],
    ["arizona-mvd-road-signs-practice", "Arizona test and permit paths", "arizona-permit-path", [
      [/15 years and 6 months.*under 18.*parent or legal guardian/, azTest],
      [/teen home-test path is not for you.*MVD office/, azTest],
      [/June 20 starts.*not June 3.*December 20.*not automatic eligibility/, azTeen],
    ]],
    ["georgia-dds-road-signs-practice", "Georgia exam and retake cases", "georgia-knowledge-cases", [
      [/initial knowledge exam.*at the computer by 4:30 p\.m\./, gaExam],
      [/33 combined correct answers do not pass.*the next day.*seven calendar days.*retest appointment/, gaExam],
      [/26 options for both.*display different wording.*Confirm your language for each section/, gaLanguages],
    ]],
    ["ohio-bmv-road-signs-practice", "Ohio test and permit cases", "ohio-knowledge-cases", [
      [/computer with a working webcam.*supervising adult.*until you turn 19/, `${ohPermit}?sub_id=1690296`],
      [/six-month period.*24 hours.*eligible applicants can use in-person testing/, ohPermit],
      [/vision screening.*within 60 days of passing.*only after issuance/, ohPermit],
    ]],
  ]) {
    test(`${width}px: ${slug} leads to the right official steps without JavaScript`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 850 }, javaScriptEnabled: false });
      try {
        await context.route(/^https?:/, (route) => route.abort());
        const page = await context.newPage();
        await page.goto(file(slug));
        const entry = page.getByRole("link", { name: link, exact: true });
        await entry.press("Enter");
        await page.waitForURL(`${file(slug)}#${id}`);
        const cards = page.locator(`#${id} article`);
        assert.equal(await cards.count(), cases.length);
        for (const [i, [text, href]] of cases.entries()) {
          const card = cards.nth(i);
          assert.match(await card.innerText(), text);
          assert.equal(await card.getByRole("link").getAttribute("href"), href);
        }
        const heading = await page.locator(`#${id} h2`).boundingBox();
        const header = await page.locator(".site-header").boundingBox();
        assert.ok(heading.y >= header.y + header.height, `heading at ${heading.y}px must clear the ${header.height}px sticky navigation`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        if (slug.startsWith("california")) {
          assert.match(await page.locator("#official-details").innerText(), /both use 80%/);
          assert.match(await page.locator("#official-details").innerText(), /32 of 40/);
          assert.equal(await page.getByRole("link", { name: "Start practice", exact: true }).getAttribute("href"), "#practice");
        } else {
          assert.equal(await page.getByRole("link", { name: "Nationwide picture quiz", exact: true }).getAttribute("href"),
            "road-signs-practice-test.html?mode=road-signs-core#practice");
          if (slug.startsWith("arizona")) await page.getByText("At least 24 of 30", { exact: true }).waitFor();
          if (slug.startsWith("georgia")) assert.match(await page.locator("#official-details").innerText(), /15 correct on each part/);
          if (slug.startsWith("ohio")) {
            assert.match(await page.locator("#official-details").innerText(), /30 of 40 \(75%\)/);
            assert.equal(await page.getByRole("link", { name: "Official Ohio sample test", exact: true }).getAttribute("href"),
              "https://www.bmv.ohio.gov/dl-sample-test.aspx");
          }
        }
        if (process.env.PERMIT_PATH_SHOTS) {
          await page.screenshot({ path: path.join(process.env.PERMIT_PATH_SHOTS, `${slug}-${width}.png`) });
        }
      } finally {
        await context.close();
      }
    });
  }
}

test("the Georgia homepage entry promises only the available guide and shared practice", async () => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 850 } });
  try {
    await context.route(/^https?:/, (route) => route.abort());
    const page = await context.newPage();
    await page.goto(file("index"));
    const entry = page.getByRole("link", { name: /Georgia DDS Road Signs Guide.*shared picture practice/ });
    assert.equal(await entry.getAttribute("href"), "georgia-dds-road-signs-practice.html");
    assert.doesNotMatch(await page.locator("main").innerText(), /24 picture questions with Georgia/i);
    await entry.click();
    await page.waitForURL(file("georgia-dds-road-signs-practice"));
    assert.equal(await page.locator("[data-quiz]").count(), 0);
    assert.equal(await page.getByRole("link", { name: "Nationwide picture quiz", exact: true }).count(), 1);
  } finally {
    await context.close();
  }
});

test("the shared checklist and requirements views carry the same California path", async () => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    await context.route(/^https?:/, (route) => route.abort());
    const page = await context.newPage();
    await page.goto(file("dmv-test-day-checklist"));
    const california = page.locator("option[value='california'][data-retake]");
    assert.match(await california.getAttribute("data-retake"), /three knowledge-test attempts.*Minors wait seven days.*not counting the failure day/);
    await page.goto(file("dmv-permit-test-requirements-by-state"));
    assert.equal(await page.locator("[data-requirements-state] option[value='california']").getAttribute("data-format"),
      "Knowledge test for original licenses");
  } finally {
    await context.close();
  }
});

test("the five current mixed-practice pages explain the state decision and where to study next", async () => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    await context.route(/^https?:/, (route) => route.abort());
    const page = await context.newPage();
    for (const [slug, official, next] of [
      ["california-dmv", /separate, even though both use 80%/, /curb-color checkpoint/],
      ["new-york-dmv", /only one correct road-sign answer is not enough/, /compare NYC and other locations/],
      ["florida-dmv", /official Class E exam, not the course/, /DETS, TLSAE, or prior schooling/],
      ["pennsylvania-dmv", /official test uses the 15-of-18 passing mark/, /compare the two road layouts/],
      ["new-jersey-mvc", /ID requirements before visiting/, /safe lane change with a blocked lane/],
    ]) {
      await page.goto(file(`${slug}-permit-practice-test`));
      assert.match(await page.locator("#official-details .section-intro").innerText(), official);
      assert.match(await page.locator("#practice-topics .section-intro").innerText(), next);
      assert.doesNotMatch(await page.locator("main").innerText(), /high-intent facts|Search-result competitors|A useful practice site should/i);
    }
  } finally {
    await context.close();
  }
});

test("the two legacy mixed rounds distinguish practice from official requirements and lead to real sign lessons", async () => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 850 } });
  try {
    await context.route(/^https?:/, (route) => route.abort());
    const page = await context.newPage();
    for (const [state, official, recovery, lesson] of [
      ["texas", /Teen applicants:.*bring proof.*driver license office.*not proof/s, /Separate a sign.*from a rule/s, "texas-work-zone-panels"],
      ["illinois", /28 correct at 80 percent.*35 as the minimum.*32 correct as a study target only/s, /identify.*actions you chose incorrectly/s, "illinois-school-zone"],
    ]) {
      await page.goto(file(`${state}-dmv-permit-practice-test`));
      assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex,follow");
      assert.match(await page.locator("#official-details .section-intro").innerText(), official);
      assert.match(await page.locator("#practice-topics .section-intro").innerText(), recovery);
      assert.equal(await page.locator('[data-mode-panel="mock"] [data-quiz]').getAttribute("data-pass-score"), "32");
      const link = page.locator(`#sign-study a[href$="#${lesson}"]`);
      await link.click();
      assert.equal(new URL(page.url()).hash, `#${lesson}`);
      assert.equal(await page.locator(`#${lesson} h2`).isVisible(), true);
    }
    assert.equal(await page.locator('meta[name="robots"][content*="noindex"]').count(), 0);
    assert.match(await page.locator("#official-details .section-intro").innerText(), /does not cover the whole written test/);
    assert.equal(await page.locator('.sources a[href*="/commission/jcar/admincode/"]').count(), 1);
  } finally {
    await context.close();
  }
});

for (const width of [320, 1280]) {
  test(`${width}px: Florida exam wording exercises teach each condition without changing the scored quiz`, async () => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 900 } });
    try {
      await context.route(/^https?:/, (route) => route.abort());
      const page = await context.newPage();
      await page.goto(file("florida-dmv-permit-practice-test"));
      assert.equal(await page.locator('[data-mode-panel="mock"] [data-quiz]').getAttribute("data-total"), "40");
      assert.equal(await page.locator('[data-mode-panel="mock"] [data-quiz]').getAttribute("data-pass-score"), "32");
      await page.getByRole("link", { name: "Practice English exam wording", exact: true }).click();
      const target = new URL(page.url());
      assert.ok(target.pathname.endsWith("/florida-class-e-knowledge-exam-tlsae.html"));
      assert.equal(target.hash, "#florida-read-test-questions");
      assert.equal(await page.locator("main [data-quiz]").count(), 0);
      assert.equal(await page.getByRole("link", { name: "Choose a course", exact: true }).getAttribute("href"), "#florida-course-path");
      const lesson = page.locator(target.hash);
      const heading = await lesson.getByRole("heading", { level: 2 }).boundingBox();
      const header = await page.locator(".site-header").boundingBox();
      assert.ok(heading.y >= header.y + header.height);
      assert.match(await lesson.locator(":scope > p").innerText(), /not official questions/);
      assert.equal(await lesson.locator(":scope > article").count(), 3);
      for (const [index, word, reasoning, followup, law] of [
        [0, /^Unless:/, /This sign does/, /still have to yield/, "316.075"],
        [1, /^Not less than:/, /stay a safe distance behind/, /Better visibility does not remove/, "316.083"],
        [2, /^Until:/, /stop signal is withdrawn/, /opposing traffic separated by a raised median/, "316.172"],
      ]) {
        const card = lesson.locator("article").nth(index);
        assert.match(await card.getByRole("heading", { level: 3 }).innerText(), word);
        const reasons = card.locator("details").first();
        assert.equal(await reasons.locator("ol").isVisible(), false);
        await reasons.locator("summary").press("Enter");
        assert.equal(await reasons.locator("ol").isVisible(), true);
        assert.match(await reasons.locator("ol").innerText(), reasoning);
        const check = card.locator("details").last();
        assert.equal(await check.locator("p").isVisible(), false);
        await check.locator("summary").press("Enter");
        assert.equal(await check.locator("p").isVisible(), true);
        assert.match(await check.locator("p").innerText(), followup);
        const source = new URL(await card.getByRole("link").getAttribute("href"));
        assert.equal(source.hostname, "www.flsenate.gov");
        assert.equal(source.pathname.split("/").pop(), law);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      if (process.env.VERIFY_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
        await lesson.evaluate(section => section.scrollIntoView({ block: "start" }));
        await page.screenshot({
          path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `florida-wording-${width}.png`),
        });
      }
    } finally {
      await context.close();
    }
  });
}
