const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const origin = "http://testdaytools.test";
const PA_PERMIT_SOURCE = "https://www.pa.gov/services/dmv/get-a-learners-permit";
const TX_LEARNER_SOURCE = "https://www.dps.texas.gov/section/driver-license/texas-learners-license-teen";
const REAL_ID_SOURCES = {
  california: "https://www.dmv.ca.gov/portal/driver-licenses-identification-cards/real-id/real-id-checklist/",
  "new-york": "https://dmv.ny.gov/driver-license/enhanced-or-real-id",
  texas: "https://www.dps.texas.gov/apps/DriverLicense/RealID",
  florida: "https://www.flhsmv.gov/driver-licenses-id-cards/what-to-bring/",
  illinois: "https://www.ilsos.gov/content/realid/us/en/checklist.html",
  pennsylvania: "https://www.pa.gov/agencies/dmv/driver-services/real-id/real-id-document-check",
  "new-jersey": "https://www.nj.gov/mvc/realid/selector.html",
};
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome" }); });
after(async () => { await browser?.close(); });

function inspectPdf(bytes) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "tdt-checklist-print-"));
  try {
    const file = path.join(fixture, "printed.pdf");
    fs.writeFileSync(file, bytes);
    return JSON.parse(execFileSync(process.env.PYTHON_BIN || "python3", ["-c", `
import json, sys
from pypdf import PdfReader
pdf = PdfReader(sys.argv[1])
print(json.dumps([{
    "text": " ".join(page.extract_text().split()),
    "size": [float(page.mediabox.width), float(page.mediabox.height)],
    "links": [a.get_object().get("/A", {}).get("/URI") for a in page.get("/Annots", [])],
} for page in pdf.pages]))
`, file], { encoding: "utf8", timeout: 10000 }));
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

async function localContext(width) {
  const context = await browser.newContext({ viewport: { width, height: 850 } });
  await context.route(/^https?:/, route => route.abort());
  await context.route(origin + "/**", route => route.fulfill({
    path: path.join(root, new URL(route.request().url()).pathname.slice(1)),
  }));
  return context;
}

for (const [width, state, label, applicant, hasConsent, source] of [
  [320, "new-york", "New York", "minor", true, "https://dmv.ny.gov/driver-license/drivers-manual-practice-tests"],
  [1280, "florida", "Florida", "renewal-transfer", false, "https://www.flhsmv.gov/resources/handbooks-manuals/"],
]) {
  test(`${width}px: print one ${label} checklist with the selected path and actual marks`, async () => {
    const context = await localContext(width);
    try {
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.printCalls = 0;
        window.print = () => { window.printCalls += 1; };
      });
      await page.goto(`${origin}/dmv-test-day-checklist.html?state=${state}`);
      const plan = page.locator("[data-dmv-print-plan]");
      const checks = page.locator("[data-dmv-check]");
      const packItems = page.locator("[data-dmv-pack-item]:visible");
      await page.locator("[data-dmv-pack-type]").selectOption(applicant);
      await checks.first().check();
      await checks.last().check();
      await packItems.first().check();
      const packCount = await packItems.count();
      await page.reload();
      await page.locator("[data-dmv-pack-type]").selectOption(applicant);
      assert.equal(await plan.isVisible(), false);
      const print = page.getByRole("button", { name: "Print plan" });
      if (hasConsent) {
        await print.click();
        assert.equal(await page.evaluate(() => window.printCalls), 1);
        assert.match(await plan.locator("[data-dmv-print-title]").textContent(), /^New York/);
      }
      // Browser-menu printing also fires beforeprint, without using the in-page button.
      const bytes = await page.pdf({ format: "Letter", preferCSSPageSize: true });
      const [printed, ...extra] = inspectPdf(bytes);
      assert.equal(extra.length, 0);
      assert.deepEqual(printed.size, [612, 792]);
      assert.match(printed.text, new RegExp(`^TestDayTools.*${label} DMV test-day plan`));
      assert.match(printed.text, /2 of 12 marked ready/);
      assert.match(printed.text, new RegExp(`1 of ${packCount} marked ready`));
      assert.match(printed.text, /X Open the official state source/);
      assert.match(printed.text, /X Stop cramming and sleep/);
      assert.match(printed.text, /X Identity and date of birth/);
      assert.match(printed.text, /Appointment date and time:.*Office or testing location:/);
      assert.match(printed.text, /Marks are your preparation notes, not proof of eligibility/);
      assert.deepEqual(printed.links, [source]);
      assert.equal(printed.text.includes("Parent or guardian consent"), hasConsent);
      assert.equal(printed.text.includes("Existing permit or license"), !hasConsent);
      assert.equal(printed.text.includes("Check with the state before you go"), hasConsent);
      assert.equal(printed.text.includes("knowledge test for this visit"), !hasConsent);
      if (!hasConsent) assert.doesNotMatch(printed.text, /50 multiple-choice|Parent Proctoring Form/);
      assert.doesNotMatch(printed.text, /Want more practice|Open official source|California Driver's Handbook|Privacy|What to bring checklist map/);
      assert.equal(await plan.isVisible(), false);
      assert.equal(await print.isVisible(), true);
      assert.equal(await checks.first().isChecked(), true);
      assert.equal(await packItems.first().isChecked(), true);
      if (process.env.CHECKLIST_PRINT_DIR) {
        fs.mkdirSync(process.env.CHECKLIST_PRINT_DIR, { recursive: true });
        fs.writeFileSync(path.join(process.env.CHECKLIST_PRINT_DIR, `${state}-${width}.pdf`), bytes);
      }
    } finally { await context.close(); }
  });
}

test("all seven states and four applicant paths stay on one Letter page", async () => {
  const context = await localContext(390);
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/dmv-test-day-checklist.html`);
    const states = await page.locator("[data-dmv-checklist-state] option").evaluateAll(options =>
      options.map(option => [option.value, option.textContent.trim(), option.dataset.manualUrl]));
    const paths = await page.locator("[data-dmv-pack-type] option").evaluateAll(options =>
      options.map(option => [option.value, option.textContent.trim()]));
    assert.equal(states.length, 7);
    assert.equal(paths.length, 4);
    for (const [state, label, manual] of states) {
      await page.locator("[data-dmv-checklist-state]").selectOption(state);
      for (const [id, name] of paths) {
        await page.locator("[data-dmv-pack-type]").selectOption(id);
        const eligible = await page.locator("[data-dmv-pack-item]:visible").count();
        const entries = inspectPdf(await page.pdf({ format: "Letter", preferCSSPageSize: true }));
        const caseName = `${label} /${name}`;
        const permitSource = { pennsylvania: PA_PERMIT_SOURCE, texas: TX_LEARNER_SOURCE }[state];
        const source = id === "real-id" ? REAL_ID_SOURCES[state]
          : ["first-permit", "minor"].includes(id) && permitSource ? permitSource : manual;
        assert.equal(await page.locator("[data-dmv-pack-official]").getAttribute("href"), source, caseName);
        assert.equal(await page.locator("[data-dmv-manual-link]").getAttribute("href"), manual, caseName);
        assert.equal(entries.length, 1, caseName);
        assert.deepEqual(entries[0].size, [612, 792], caseName);
        // Chromium can emit two link annotations when the official URL wraps.
        assert.deepEqual([...new Set(entries[0].links)], [source], caseName);
        assert.ok(entries[0].text.includes(`${label} DMV test-day plan`), caseName);
        assert.ok(entries[0].text.includes(name) && entries[0].text.includes(`0 of ${eligible} marked ready`), caseName);
      }
    }
  } finally { await context.close(); }
});

for (const width of [320, 1280]) {
  test(`${width}px: Pennsylvania permit checks survive copy and print without inheriting old generic marks`, async () => {
    const context = await localContext(width);
    try {
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.copyResults = [];
        Object.defineProperty(navigator, "clipboard", {
          value: { writeText: async text => { window.copyResults.push(text); } },
        });
        if (!sessionStorage.getItem("test-seeded")) {
          localStorage.setItem("tdt-dmv-document-pack:pennsylvania:first-permit", JSON.stringify({
            checked: ["application-form", "ssn-evidence", "identity-date-birth"],
          }));
          localStorage.setItem("tdt-dmv-document-pack:pennsylvania:minor", JSON.stringify({
            checked: ["application-form", "parent-consent", "identity-date-birth"],
          }));
          sessionStorage.setItem("test-seeded", "yes");
        }
      });
      await page.goto(`${origin}/dmv-test-day-checklist.html?state=pennsylvania`);
      const type = page.locator("[data-dmv-pack-type]");
      const state = page.locator("[data-dmv-checklist-state]");
      const pack = page.locator("#document-pack-builder");
      const physical = pack.locator('input[value="pa-dl-180-physical"]');
      const consent = pack.locator('input[value="pa-dl-180td-consent"]');
      const social = pack.locator('input[value="pa-signed-social-security-card"]');
      const identity = pack.locator('input[value="identity-date-birth"]');
      assert.equal(await identity.isChecked(), true);
      assert.equal(await physical.isVisible(), true);
      assert.equal(await physical.isChecked(), false);
      assert.equal(await social.isChecked(), false);
      assert.equal(await consent.isVisible(), false);
      assert.equal(await pack.locator('input[value="application-form"]').isVisible(), false);
      for (const omitted of ["course-school-proof", "online-provider-record"]) {
        assert.equal(await pack.locator(`input[value="${omitted}"]`).isVisible(), false);
      }

      await type.selectOption("minor");
      assert.equal(await consent.isVisible(), true);
      assert.equal(await consent.isChecked(), false);
      assert.equal(await physical.isChecked(), false);
      assert.equal(await identity.isChecked(), true);
      assert.match(await consent.locator("xpath=..").innerText(), /examiner.*must sign before a notary/s);
      await physical.check();
      await page.reload();
      await type.selectOption("minor");
      assert.equal(await physical.isChecked(), true);
      assert.equal(await consent.isChecked(), false);
      for (const check of await page.locator("[data-dmv-check]").all()) await check.check();
      assert.equal(await page.locator("[data-dmv-ready-score]").textContent(), "100%");
      assert.match(await page.locator("[data-dmv-ready-message]").textContent(), /Check your document pack and verify eligibility/);
      assert.equal(await consent.isChecked(), false);
      assert.equal(await pack.locator("[data-dmv-pack-official]").getAttribute("href"), PA_PERMIT_SOURCE);
      await page.locator("[data-dmv-copy-checklist]").click();
      await pack.locator("[data-dmv-copy-pack]").click();
      const copies = await page.evaluate(() => window.copyResults);
      assert.equal(copies.length, 2);
      for (const copy of copies) {
        assert.match(copy, /Document pack: Under 18 applicant|DMV document pack: Pennsylvania - Under 18 applicant/);
        assert.match(copy, /Ready:\n[^]*- DL-180 physical exam completed\n\nStill to confirm:[^]*DL-180TD: examiner or notary/);
        assert.match(copy, /Signed Social Security card/);
        assert.doesNotMatch(copy, /Course, school, or attendance proof|Online test or provider record/);
      }
      const [printed, ...extra] = inspectPdf(await page.pdf({ format: "Letter", preferCSSPageSize: true }));
      assert.equal(extra.length, 0);
      assert.deepEqual([...new Set(printed.links)], [PA_PERMIT_SOURCE]);
      assert.match(printed.text, /X DL-180 physical exam completed/);
      assert.match(printed.text, /DL-180TD: examiner or notary.*Get DL-180TD notarized if the signer cannot attend/is);
      assert.doesNotMatch(printed.text, /Course, school, or attendance proof|Online test or provider record/);

      await type.selectOption("first-permit");
      assert.equal(await physical.isChecked(), false);
      assert.equal(await consent.isVisible(), false);
      await type.selectOption("real-id");
      assert.equal(await physical.isVisible(), false);
      assert.equal(await social.isVisible(), false);
      assert.equal(await pack.locator('input[value="application-form"]').isVisible(), true);
      await type.selectOption("minor");
      await state.selectOption("new-york");
      assert.equal(await physical.isVisible(), false);
      assert.equal(await consent.isVisible(), false);
      assert.equal(await pack.locator('input[value="parent-consent"]').isVisible(), true);
      assert.equal(await pack.locator('input[value="online-provider-record"]').isVisible(), true);
      await state.selectOption("pennsylvania");
      assert.equal(await physical.isChecked(), true);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    } finally { await context.close(); }
  });
}

for (const width of [320, 1280]) {
  test(`${width}px: Texas signs lead to the teen learner packet and keep independent saved paths`, async () => {
    const context = await localContext(width);
    try {
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.copyResults = [];
        Object.defineProperty(navigator, "clipboard", {
          value: { writeText: async text => window.copyResults.push(text) },
        });
        if (!sessionStorage.getItem("seeded")) {
          for (const type of ["first-permit", "minor"]) {
            localStorage.setItem(`tdt-dmv-document-pack:texas:${type}`, JSON.stringify({
              checked: ["identity-date-birth", "course-school-proof", "parent-consent", "online-provider-record"],
            }));
          }
          sessionStorage.setItem("seeded", "yes");
        }
      });
      await page.goto(`${origin}/texas-dmv-road-signs-practice.html`);
      await page.getByRole("link", { name: "Open the Texas teen document pack", exact: true }).press("Enter", { timeout: 5000 });
      await page.waitForURL("**/dmv-test-day-checklist.html?state=texas#document-pack-builder");
      const pack = page.locator("#document-pack-builder");
      const type = pack.locator("[data-dmv-pack-type]");
      const state = page.locator("[data-dmv-checklist-state]");
      const check = id => pack.locator(`input[value="${id}"]`);
      const text = id => check(id).locator("xpath=..").innerText();
      const source = pack.locator("[data-dmv-pack-official]");
      const course = check("tx-teen-course-certificate");
      const voe = check("tx-teen-school-record");
      assert.equal(await state.inputValue(), "texas");
      assert.equal(await type.inputValue(), "first-permit");
      assert.equal(await source.getAttribute("href"), TX_LEARNER_SOURCE);
      assert.match(await pack.locator("[data-dmv-pack-summary]").innerText(), /ages 15-17.*18 or older/);
      assert.match(await text("tx-teen-course-certificate"), /6 hours.*24 hours.*DE-964/s);
      assert.match(await text("tx-teen-school-record"), /diploma.*GED.*30 days.*90 days.*issued June through August/s);
      assert.match(await text("tx-teen-knowledge"), /passed in your course.*otherwise plan to test at DPS/is);
      assert.match(await text("tx-teen-consent"), /come with you.*signed and had notarized.*waiver/is);
      assert.equal(await check("identity-date-birth").isChecked(), true);
      assert.equal(await course.isChecked(), false);
      assert.equal(await voe.isChecked(), false);
      assert.equal(await check("course-school-proof").isVisible(), false);
      assert.equal(await check("online-provider-record").isVisible(), false);
      await course.check();
      await type.selectOption("minor");
      assert.equal(await course.isChecked(), false);
      assert.equal(await check("identity-date-birth").isChecked(), true);
      await voe.check();
      await pack.locator("[data-dmv-copy-pack]").click();
      await page.locator("[data-dmv-copy-checklist]").click();
      const copies = await page.evaluate(() => window.copyResults);
      assert.equal(copies.length, 2);
      for (const copy of copies) {
        assert.ok(copy.includes(TX_LEARNER_SOURCE));
        assert.match(copy, /- School record: diploma, GED or VOE\n\nStill to confirm:[^]*- Texas teen course certificate: 6h concurrent \/ 24h block/);
        assert.doesNotMatch(copy, /Course, school, or attendance proof|Online test or provider record/);
      }
      const bytes = await page.pdf({ format: "Letter", preferCSSPageSize: true });
      const [printed, ...extra] = inspectPdf(bytes);
      assert.equal(extra.length, 0);
      assert.deepEqual([...new Set(printed.links)], [TX_LEARNER_SOURCE]);
      assert.match(printed.text, /X School record: diploma, GED or VOE/);
      assert.match(printed.text, /Texas teen course certificate: 6h concurrent \/ 24h block/);
      assert.match(printed.text, /Social Security number for DPS/);
      assert.match(printed.text, /not proof of eligibility/);
      const dir = process.env.CHECKLIST_PRINT_DIR;
      if (dir) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `texas-learner-${width}.pdf`), bytes);
        await pack.locator("[data-dmv-pack-title]").scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(dir, `texas-learner-${width}.png`) });
      }
      await page.reload();
      assert.equal(await course.isChecked(), true);
      assert.equal(await voe.isChecked(), false);
      await type.selectOption("minor");
      assert.equal(await voe.isChecked(), true);
      assert.equal(await course.isChecked(), false);
      for (const path of ["real-id", "renewal-transfer"]) {
        await type.selectOption(path);
        assert.equal(await course.isVisible(), false);
        assert.equal(await voe.isVisible(), false);
        assert.notEqual(await source.getAttribute("href"), TX_LEARNER_SOURCE);
      }
      await type.selectOption("minor");
      await state.selectOption("pennsylvania");
      assert.equal(await course.isVisible(), false);
      assert.equal(await source.getAttribute("href"), PA_PERMIT_SOURCE);
      assert.equal(await check("pa-dl-180-physical").isVisible(), true);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    } finally { await context.close(); }
  });
}

test("REAL ID copies the document link without carrying it into another path", async () => {
  const context = await localContext(320);
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.copyResults = [];
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: async text => { window.copyResults.push(text); } },
      });
    });
    await page.goto(`${origin}/dmv-test-day-checklist.html?state=new-jersey`);
    const selector = page.locator("[data-dmv-pack-type]");
    const states = page.locator("[data-dmv-checklist-state]");
    await selector.selectOption("real-id");
    for (const [state, url] of Object.entries(REAL_ID_SOURCES)) {
      await states.selectOption(state);
      const pack = page.locator("[data-dmv-pack-official]");
      assert.match(await pack.textContent(), /REAL ID document requirements/);
      await page.locator("[data-dmv-copy-pack]").click();
      await page.locator("[data-dmv-copy-checklist]").click();
      const copied = await page.evaluate(() => window.copyResults.slice(-2));
      assert.equal(copied.length, 2);
      assert.ok(copied.every(text => text.split("\n")[1] === `Official source: ${url}`), state);
    }
    await selector.selectOption("first-permit");
    await page.locator("[data-dmv-copy-pack]").click();
    const copy = await page.evaluate(() => window.copyResults.at(-1));
    assert.equal(copy.split("\n")[1], "Official source: https://www.nj.gov/mvc/pdf/license/drivermanual.pdf");
  } finally { await context.close(); }
});
