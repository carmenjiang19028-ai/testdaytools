const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const pages = ["sat-test-dates-2026-2027.html", "sat-august-22-2026-planning.html"];
const fallDates = ["2027-08-28", "2027-09-18", "2027-10-09", "2027-11-06", "2027-12-04"];
let browser;

before(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
});
after(async () => { await browser?.close(); });

async function openPage(file, date, viewport = { width: 1280, height: 900 }, timezoneId = "America/New_York") {
  const context = await browser.newContext({ timezoneId, viewport });
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
      await page.reload();
      assert.match(await page.locator("[data-sat-saved-status]").textContent(), /^Saved in this browser: November 7, 2026/);
      await page.clock.setSystemTime(new Date("2026-10-28T16:00:00Z"));
      await page.reload();
      assert.equal(await page.locator("[data-sat-primary-date]").textContent(), "December 5, 2026");
      assert.match(await page.locator("[data-sat-saved-status]").textContent(), /not saved yet/);
      await page.locator("[data-sat-readiness]").selectOption("starting");
      assert.equal(await page.locator("[data-sat-plan-save]").isDisabled(), true);
      assert.equal(await page.locator("[data-sat-date-calendar]").isDisabled(), true);
      assert.equal(await page.locator("[data-sat-plan-picks]").isVisible(), false);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("tdt-sat-date-plan:v1")).primary.date), "2026-11-07");
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

test("anticipated fall dates are public information, not registrable dates or calendar events", async () => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  await context.route(/^https?:/, (route) => route.abort());
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(path.join(root, pages[0])).href);
    const section = page.locator("#sat-fall-2027");
    assert.equal(await section.count(), 1);
    assert.match(await section.getByRole("heading").first().textContent(), /anticipated/i);
    assert.deepEqual(await section.locator("time").evaluateAll(nodes => nodes.map(node => node.dateTime)), fallDates);
    assert.match(await section.textContent(), /not.*confirmed.*calendar/i);
    assert.equal(await section.locator("[data-sat-fall-deadline]").isVisible(), false);
    const active = JSON.parse(await page.locator("[data-sat-date-data]").textContent());
    assert.equal(active.length, 8);
    assert(!active.some(e => fallDates.includes(e.date)));
    const ics = fs.readFileSync(path.join(root, "sat-test-dates-2026-2027.ics"), "utf8");
    assert.equal((ics.match(/^BEGIN:VEVENT\r?$/gm) || []).length, 8);
    for (const date of fallDates) assert.doesNotMatch(ics, new RegExp(date.replaceAll("-", "")));
  } finally { await context.close(); }
});

for (const [width, timezone] of [[390, "Pacific/Auckland"], [1280, "America/New_York"]]) {
  test(`${width}: a deadline compares calendar days without guessing score release or retaining input`, async () => {
    const { context, page } = await openPage(pages[0], "2026-11-20T09:00:00Z", { width, height: 900 }, timezone);
    try {
      await page.getByRole("link", { name: "Plan for fall 2027", exact: true }).click();
      await page.waitForURL(/#sat-fall-2027$/);
      const section = page.locator("#sat-fall-2027");
      const deadline = section.getByLabel("College score deadline", { exact: true });
      const gaps = () => section.locator("[data-sat-fall-gap]").allTextContents();
      const before = await page.evaluate(() => ({ entries: window.dataLayer.length, keys: Object.keys(localStorage) }));
      await deadline.fill("2027-10-15");
      assert.deepEqual(await gaps(), ["48 days before", "27 days before", "6 days before", "After deadline", "After deadline"]);
      await deadline.fill("2027-11-06");
      assert.equal((await gaps())[3], "Same calendar day");
      await deadline.fill("2027-11-08");
      assert.equal((await gaps())[3], "2 days before");
      assert.deepEqual(await page.evaluate(() => ({ entries: window.dataLayer.length, keys: Object.keys(localStorage) })), before);
      await deadline.fill("");
      assert.deepEqual(await gaps(), Array(5).fill("--"));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (process.env.VERIFY_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
        await deadline.fill("2027-10-15");
        await section.screenshot({ path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `fall-2027-${width}.png`) });
      }
    } finally { await context.close(); }
  });
}

test("the 14-day threshold uses Eastern calendar dates, not rounded local hours", async () => {
  const { context, page } = await openPage(pages[0], "2026-11-21T20:00:00Z", undefined, "Pacific/Auckland");
  try {
    await page.locator("[data-sat-stage]").selectOption("senior");
    await page.locator("[data-sat-deadline]").selectOption("regular");
    await page.locator("[data-sat-readiness]").selectOption("ready");
    await page.locator("[data-sat-plan-button]").click();
    assert.equal(await page.locator("[data-sat-primary-date]").textContent(), "December 5, 2026");
    assert.match(await page.locator("[data-sat-plan-reason]").textContent(), /14 calendar days/);
    assert.match(await page.locator("[data-sat-primary-deadline]").textContent(), /Regular deadline passed/);
    await page.clock.setSystemTime(new Date("2026-11-22T15:00:00Z"));
    await page.locator("[data-sat-plan-button]").click();
    assert.equal(await page.locator("[data-sat-primary-date]").textContent(), "March 6, 2027");
  } finally { await context.close(); }
});

for (const [i, file] of pages.entries()) {
  test(`${file}: a device request uses its own Eastern calendar deadline`, async () => {
    const { context, page } = await openPage(file, "2026-11-06T04:59:00Z", { width: i ? 320 : 1280, height: 900 }, "Pacific/Auckland");
    try {
      const build = page.locator("[data-sat-plan-button]");
      const loan = page.getByRole("checkbox", { name: "I still need to request a College Board device" });
      const primary = page.locator("[data-sat-primary-date]");
      const primaryDevice = page.locator("[data-sat-primary-device]");
      const backupDevice = page.locator("[data-sat-backup-device]");
      const save = page.locator("[data-sat-plan-save]");
      await page.locator("[data-sat-stage]").selectOption("senior");
      await page.locator("[data-sat-deadline]").selectOption("regular");
      await page.locator("[data-sat-readiness]").selectOption("ready");
      await loan.check();
      await build.click();
      assert.equal(await primary.textContent(), "December 5, 2026");
      assert.match(await primaryDevice.innerText(), /November 5, 2026.*not guaranteed/);
      assert.match(await backupDevice.innerText(), /February 4, 2027/);
      const download = page.waitForEvent("download");
      await page.locator("[data-sat-date-calendar]").click();
      assert.match(fs.readFileSync(await (await download).path(), "utf8"), /device request by November 5\\, 2026/);
      await save.click();
      await page.clock.setSystemTime(new Date("2026-11-06T05:00:01Z"));
      await page.reload();
      assert.equal(await loan.isChecked(), true);
      assert.equal(await primary.textContent(), "March 6, 2027");
      assert.match(await primaryDevice.innerText(), /February 4, 2027/);
      assert.match(await backupDevice.innerText(), /April 1, 2027/);
      assert.match(await page.locator("[data-sat-saved-status]").innerText(), /not saved yet/);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("tdt-sat-date-plan:v1")).primary.date), "2026-12-05");
      await loan.uncheck();
      assert.equal(await save.isDisabled(), true);
      await build.click();
      assert.equal(await primary.textContent(), "December 5, 2026");
      assert.equal(await primaryDevice.isVisible(), false);
      assert.equal(await backupDevice.isVisible(), false);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    } finally { await context.close(); }
  });
}

test("when the last test is open but the device cutoff passed, show a next step and no plan", async () => {
  const { context, page } = await openPage(pages[0], "2027-05-07T15:00:00Z");
  try {
    await page.locator("[data-sat-readiness]").selectOption("ready");
    const build = page.locator("[data-sat-plan-button]");
    await build.click();
    assert.equal(await page.locator("[data-sat-primary-date]").textContent(), "June 5, 2027");
    await page.locator("[data-sat-device-loan]").check();
    await build.click();
    assert.match(await page.locator("[data-sat-plan-headline]").textContent(), /No listed date still fits the device request deadline/);
    assert.match(await page.locator("[data-sat-plan-reason]").textContent(), /later date.*school/);
    assert.equal(await page.locator("[data-sat-plan-picks]").isVisible(), false);
    assert.equal(await page.locator("[data-sat-plan-save]").isDisabled(), true);
    assert.equal(await page.locator("[data-sat-date-calendar]").isDisabled(), true);
    assert.equal(await page.evaluate(() => localStorage.getItem("tdt-sat-date-plan:v1")), null);
  } finally { await context.close(); }
});

for (const width of [320, 390, 1280]) {
  test(`${width}px: SAT tools leads to the planner without hiding its heading`, async () => {
    const { context, page } = await openPage("sat-tools.html", "2026-11-20T18:00:00Z", { width, height: 844 });
    try {
      assert.ok(await page.getByRole("link", { name: /August 22 SAT 2026 Scores and Retake Plan/ }).count());
      await page.getByRole("link", { name: /SAT Dates and Registration Planner/ }).click();
      await page.waitForURL(/sat-test-dates-2026-2027\.html#sat-date-planner$/);
      await page.waitForLoadState("load");
      const heading = await page.locator("[data-sat-date-planner] h2").boundingBox();
      const header = await page.locator(".site-header").boundingBox();
      assert.ok(heading.y >= header.y + header.height && heading.y + heading.height < 844, JSON.stringify({ heading, header }));
      const novemberRow = page.getByRole("row").filter({ hasText: "November 7, 2026" });
      assert.match(await novemberRow.textContent(), /Past date/);
    } finally { await context.close(); }
  });
}

test("the planner rejects a date only 13 calendar days away", async () => {
  const { context, page } = await openPage(pages[0], "2026-11-22T18:00:00Z");
  try {
    await page.locator("[data-sat-stage]").selectOption("senior");
    await page.locator("[data-sat-deadline]").selectOption("regular");
    await page.locator("[data-sat-readiness]").selectOption("ready");
    await page.locator("[data-sat-plan-button]").click();
    assert.equal(await page.locator("[data-sat-primary-date]").textContent(), "March 6, 2027");
  } finally { await context.close(); }
});

test("primary-date calendar has a next-day end in a UTC+13 browser", async () => {
  const { context, page } = await openPage(pages[0], "2026-11-20T18:00:00Z", undefined, "Pacific/Auckland");
  try {
    await page.locator("[data-sat-stage]").selectOption("senior");
    await page.locator("[data-sat-deadline]").selectOption("regular");
    await page.locator("[data-sat-readiness]").selectOption("ready");
    await page.locator("[data-sat-plan-button]").click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("[data-sat-date-calendar]").click();
    const calendar = fs.readFileSync(await (await downloadPromise).path(), "utf8");
    assert.match(calendar, /DTSTART;VALUE=DATE:20261205\r?\nDTEND;VALUE=DATE:20261206/);
  } finally { await context.close(); }
});

test("a final available junior retake does not promise a backup", async () => {
  const { context, page } = await openPage(pages[0], "2027-04-25T16:00:00Z");
  try {
    await page.locator("[data-sat-stage]").selectOption("junior_retake");
    await page.locator("[data-sat-readiness]").selectOption("ready");
    await page.locator("[data-sat-plan-button]").click();
    assert.equal(await page.locator("[data-sat-primary-date]").textContent(), "June 5, 2027");
    assert.equal(await page.locator("[data-sat-backup-date]").textContent(), "No later listed date");
    assert.doesNotMatch(await page.locator("[data-sat-plan-reason]").textContent(), /leaves a later administration/);
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
