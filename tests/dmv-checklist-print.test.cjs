const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const origin = "http://testdaytools.test";
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
    for (const [state, label, source] of states) {
      await page.locator("[data-dmv-checklist-state]").selectOption(state);
      for (const [id, name] of paths) {
        await page.locator("[data-dmv-pack-type]").selectOption(id);
        const eligible = await page.locator("[data-dmv-pack-item]:visible").count();
        const entries = inspectPdf(await page.pdf({ format: "Letter", preferCSSPageSize: true }));
        const caseName = `${label} /${name}`;
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
