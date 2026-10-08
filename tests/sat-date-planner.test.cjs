const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const pages = ["sat-test-dates-2026-2027.html", "sat-august-22-2026-planning.html"];
let browser;

before(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
});
after(async () => { await browser?.close(); });

async function openPage(file, date, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ timezoneId: "America/New_York", viewport });
  await context.route(/^https?:/, (route) => route.abort());
  const page = await context.newPage();
  await page.clock.install({ time: new Date(date) });
  await page.goto(pathToFileURL(path.join(root, file)).href);
  return { context, page };
}

for (const file of pages) {
  test(`${file}: full schedule, current primary/backup, and calendar download`, async () => {
    const { context, page } = await openPage(file, "2026-10-08T16:00:00Z");
    try {
      const events = JSON.parse(await page.locator("[data-sat-date-data]").textContent());
      assert.equal(events.length, 8);
      const schedule = JSON.parse(fs.readFileSync(path.join(root, "content/site_data.json"), "utf8"))
        .tools.find((tool) => tool.slug === "sat-test-dates-2026-2027").calendarDownload.events;
      assert.deepEqual(events.map(({ date, registrationDate, lateDate }) => ({ date, registrationDate, lateDate })),
        schedule.map(({ date, registrationDate, lateDate }) => ({ date, registrationDate, lateDate })));
      if (file === pages[0]) {
        assert.match(await page.title(), /^SAT Test Dates 2026-2027:/);
        assert.equal(await page.locator("[data-countdown]").count(), 0);
      }
      assert(events.some((event) => event.date === "2026-12-05"));
      assert(events.some((event) => event.date === "2027-06-05"));
      await page.locator("[data-sat-stage]").selectOption("senior");
      await page.locator("[data-sat-readiness]").selectOption("ready");
      await page.locator("[data-sat-plan-button]").click();
      assert.equal(await page.locator("[data-sat-primary-date]").textContent(), "November 7, 2026");
      assert.equal(await page.locator("[data-sat-backup-date]").textContent(), "December 5, 2026");
      assert.match(await page.locator("[data-sat-primary-deadline]").textContent(), /October 23, 2026.*October 27, 2026/);
      assert.match(await page.locator("[data-sat-plan-reason]").textContent(), /may be too late for early applications/);
      const downloadPromise = page.waitForEvent("download");
      await page.locator("[data-sat-date-calendar]").click();
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), "sat-2026-11-07.ics");
      const calendar = fs.readFileSync(await download.path(), "utf8");
      assert.match(calendar, /DTSTART;VALUE=DATE:20261107/);
      assert.match(calendar, /October 23/);
      await page.locator("[data-sat-plan-save]").click();
      await page.clock.setSystemTime(new Date("2026-10-28T16:00:00Z"));
      await page.reload();
      assert.equal(await page.locator("[data-sat-primary-date]").textContent(), "December 5, 2026");
      await page.locator("[data-sat-readiness]").selectOption("starting");
      await page.locator("[data-sat-plan-button]").click();
      assert.equal(await page.locator("[data-sat-primary-date]").textContent(), "March 6, 2027");
    } finally { await context.close(); }
  });
}

test("registration status honors Eastern time at regular and late deadline boundaries", async () => {
  const { context, page } = await openPage(pages[0], "2026-10-08T16:00:00Z");
  try {
    const statuses = await page.evaluate(() => {
      const event = { registrationDate: "2026-10-23", lateDate: "2026-10-27" };
      return ["2026-10-24T03:59:59Z", "2026-10-24T04:00:00Z", "2026-10-28T03:59:59Z", "2026-10-28T04:00:00Z"]
        .map((instant) => satRegistrationStatus(event, new Date(instant)));
    });
    assert.deepEqual(statuses, ["regular", "late", "late", "closed"]);
  } finally { await context.close(); }
});

test("desktop and mobile layouts fit before and after generating plans", async () => {
  for (const file of pages) {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const { context, page } = await openPage(file, "2026-10-08T16:00:00Z", viewport);
      try {
        for (const built of [false, true]) {
          if (built) await page.locator("[data-sat-plan-button]").click();
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
          if (process.env.VERIFY_SCREENSHOTS_DIR) {
            fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
            await page.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `${file}-${viewport.width}-${built ? "plan" : "initial"}.png`) });
          }
        }
      } finally { await context.close(); }
    }
  }
});
