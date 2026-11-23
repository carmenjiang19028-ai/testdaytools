const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const pages = ["sat-test-dates-2026-2027.html", "sat-august-22-2026-planning.html"];
const fallDates = ["2027-08-28", "2027-09-18", "2027-10-09", "2027-11-06", "2027-12-04"];
const studentReleaseDates = ["2026-09-04", "2026-09-25", "2026-10-16", "2026-11-20",
  "2026-12-18", "2027-03-19", "2027-05-14", "2027-06-21"];
const unfold = (ics) => ics.replace(/\r\n[ \t]/g, "");
const calendarEvents = (ics) => unfold(ics).split("BEGIN:VEVENT\r\n").slice(1).map(event => event.split("END:VEVENT")[0]);
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
      assert.deepEqual(events.map((event) => event.scoreReleaseDate), studentReleaseDates);
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
      assert.equal(await page.locator("[data-sat-primary-score]").textContent(), "Scheduled student score release: November 20, 2026.");
      assert.match(await page.locator("[data-sat-retake-window]").textContent(), /Do not count on regular registration.*late registration by November 24, 2026/);
      assert.match(await page.locator("[data-sat-primary-deadline]").textContent(), /October 23, 2026.*October 27, 2026/);
      assert.match(await page.locator("[data-sat-plan-reason]").textContent(), /may be too late for early applications/);
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download primary date & deadlines" }).click();
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), "sat-2026-11-07.ics");
      const calendar = fs.readFileSync(await download.path(), "utf8");
      assert.match(calendar, /DTSTART;VALUE=DATE:20261107/);
      assert.match(unfold(calendar), /October 23/);
      assert.equal(calendarEvents(calendar).length, 3);
      assert.match(calendar, /DTSTART:20261024T035900Z/);
      assert.match(calendar, /DTSTART:20261028T035900Z/);
      assert.doesNotMatch(calendar, /device request cutoff/i);
      const deadlineLines = (entry) => entry.match(/^(?:UID|DTSTART):[^\r\n]+/gm);
      const season = calendarEvents(fs.readFileSync(path.join(root, "sat-test-dates-2026-2027.ics"), "utf8"));
      assert.deepEqual(calendarEvents(calendar).slice(1).map(deadlineLines),
        season.filter(entry => entry.includes("UID:sat-20261107-")).map(deadlineLines));
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

const satPlanStorage = "tdt-sat-date-plan:v1";
const storedPlan = (page) => page.evaluate(key => localStorage.getItem(key), satPlanStorage);
const planOutputEvents = (page) => page.evaluate(() => (window.dataLayer || []).filter(event =>
  event[0] === "event" && ["sat_plan_saved", "sat_date_selected", "resource_download"].includes(event[1])));

for (const [file, action, width, timezone] of [
  [pages[0], "save", 320, "Pacific/Auckland"],
  [pages[1], "calendar", 1280, "America/Los_Angeles"],
]) {
  test(`${file}: ${action} rechecks the Eastern late deadline in an already-open tab`, async () => {
    const { context, page } = await openPage(file, "2026-11-20T16:00:00Z", { width, height: 900 }, timezone);
    try {
      const save = page.locator("[data-sat-plan-save]");
      const calendar = page.locator("[data-sat-date-calendar]");
      const build = page.locator("[data-sat-plan-button]");
      const headline = page.locator("[data-sat-plan-headline]");
      await page.locator("[data-sat-stage]").selectOption("senior");
      await page.locator("[data-sat-readiness]").selectOption("ready");
      await build.click();
      await save.click();
      assert.equal(JSON.parse(await storedPlan(page)).primary.date, "2026-12-05");
      const control = action === "save" ? save : calendar;
      await page.clock.setSystemTime(new Date("2026-11-25T04:59:00Z"));
      if (action === "calendar") {
        const next = page.waitForEvent("download");
        await control.click();
        assert.equal((await next).suggestedFilename(), "sat-2026-12-05.ics");
      } else {
        await control.click();
      }
      assert.match(await page.locator("[data-sat-primary-deadline]").innerText(), /Regular deadline passed.*November 24, 2026/);
      const saved = await storedPlan(page);
      const before = await planOutputEvents(page);
      const unexpected = [];
      page.on("download", download => unexpected.push(download.suggestedFilename()));
      await page.clock.setSystemTime(new Date("2026-11-25T05:00:00Z"));
      await control.click();
      assert.match(await headline.textContent(), /December 5, 2026 no longer fits/);
      assert.match(await page.locator("[data-sat-plan-reason]").textContent(),
        /late registration deadline on November 24, 2026 has passed.*Build a new plan/);
      assert.equal(await headline.evaluate(el => document.activeElement === el), true);
      assert.equal(await page.locator("[data-sat-plan-picks]").isVisible(), false);
      assert.equal(await save.isDisabled(), true);
      assert.equal(await calendar.isDisabled(), true);
      assert.equal(await storedPlan(page), saved);
      assert.deepEqual(await planOutputEvents(page), before);
      assert.deepEqual(unexpected, []);
      await build.click();
      assert.equal(await page.locator("[data-sat-primary-date]").textContent(), "March 6, 2027");
      assert.equal(await calendar.isDisabled(), false);
      assert.equal(await storedPlan(page), saved);
    } finally { await context.close(); }
  });
}

test("an open planner rejects an expired loaner cutoff even while regular registration is open", async () => {
  const { context, page } = await openPage(pages[0], "2026-11-04T16:00:00Z");
  try {
    const save = page.locator("[data-sat-plan-save]");
    await page.locator("[data-sat-stage]").selectOption("senior");
    await page.locator("[data-sat-readiness]").selectOption("ready");
    await page.locator("[data-sat-device-loan]").check();
    await page.locator("[data-sat-plan-button]").click();
    assert.equal(await page.locator("[data-sat-primary-date]").textContent(), "December 5, 2026");
    assert.match(await page.locator("[data-sat-primary-device]").textContent(), /November 5, 2026/);
    await page.clock.setSystemTime(new Date("2026-11-06T04:59:00Z"));
    await save.click();
    const valid = await storedPlan(page);
    assert.equal(JSON.parse(valid).needsDevice, true);
    const before = await planOutputEvents(page);
    await page.clock.setSystemTime(new Date("2026-11-06T05:00:00Z"));
    await save.click();
    assert.match(await page.locator("[data-sat-plan-reason]").textContent(),
      /device request cutoff on November 5, 2026 has passed/);
    assert.equal(await save.isDisabled(), true);
    assert.equal(await page.locator("[data-sat-date-calendar]").isDisabled(), true);
    assert.equal(await storedPlan(page), valid);
    assert.deepEqual(await planOutputEvents(page), before);
  } finally { await context.close(); }
});

for (const [width, timezone] of [[320, "Pacific/Auckland"], [1280, "America/New_York"]]) {
  test(`${width}: May score cannot be used to wait for the June loaner cutoff`, async () => {
    const { context, page } = await openPage(pages[0], "2026-11-23T12:00:00Z", { width, height: 900 }, timezone);
    try {
      const wait = page.locator("[data-sat-wait-for-score]");
      const loan = page.locator("[data-sat-device-loan]");
      const build = page.locator("[data-sat-plan-button]");
      const primary = page.locator("[data-sat-primary-date]");
      const backup = page.locator("[data-sat-backup-date]");
      const note = page.locator("[data-sat-retake-window]");
      await page.locator("[data-sat-stage]").selectOption("junior_retake");
      await loan.check();
      await build.click();
      const focus = await page.locator(":focus").evaluate(el => ({
        headline: el.hasAttribute("data-sat-plan-headline"),
        top: el.getBoundingClientRect().top,
        bottom: document.querySelector(".site-header").getBoundingClientRect().bottom,
      }));
      assert(focus.headline && focus.top >= focus.bottom && focus.top < 900);
      assert.equal(await primary.textContent(), "May 1, 2027");
      assert.equal(await backup.textContent(), "June 5, 2027");
      assert.match(await page.locator("[data-sat-primary-score]").textContent(), /May 14, 2027/);
      assert.match(await page.locator("[data-sat-backup-score]").textContent(), /June 21, 2027/);
      assert.match(await note.textContent(), /device request cutoff is May 6, 2027, before.*May 14, 2027.*Reserve before/);
      if (process.env.VERIFY_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.VERIFY_SCREENSHOTS_DIR, { recursive: true });
        await page.locator(".sat-date-result").screenshot({
          path: path.join(process.env.VERIFY_SCREENSHOTS_DIR, `retake-window-${width}.png`),
          style: ".site-header { visibility: hidden; }",
        });
      }
      await wait.check();
      assert.equal(await note.isVisible(), false);
      await build.click();
      assert.equal(await primary.textContent(), "May 1, 2027");
      assert.equal(await backup.textContent(), "No listed date fits after scores");
      assert.equal(await page.locator("[data-sat-backup-score]").isVisible(), false);
      assert.match(await note.textContent(), /Skipped June 5, 2027.*May 6, 2027.*May 14, 2027/);
      await page.locator("[data-sat-plan-save]").click();
      await page.reload();
      assert.equal(await wait.isChecked(), true);
      assert.equal(await loan.isChecked(), true);
      assert.equal(await backup.textContent(), "No listed date fits after scores");
      await loan.uncheck();
      await build.click();
      assert.equal(await backup.textContent(), "June 5, 2027");
      assert.match(await note.textContent(), /before the backup's regular registration cutoff on May 21, 2027/);
      await page.locator("[data-sat-retake]").uncheck();
      assert.equal(await wait.isDisabled(), true);
      await build.click();
      assert.equal(await backup.textContent(), "Not requested");
      assert.equal(await note.isVisible(), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    } finally { await context.close(); }
  });
}

test("waiting for a September SAT result skips the October registration cutoff", async () => {
  const { context, page } = await openPage(pages[0], "2026-08-29T13:00:00Z");
  try {
    const build = page.locator("[data-sat-plan-button]");
    await page.locator("[data-sat-stage]").selectOption("senior");
    await page.locator("[data-sat-readiness]").selectOption("ready");
    await build.click();
    assert.equal(await page.locator("[data-sat-primary-date]").textContent(), "September 12, 2026");
    assert.equal(await page.locator("[data-sat-backup-date]").textContent(), "October 3, 2026");
    assert.match(await page.locator("[data-sat-retake-window]").textContent(), /September 22, 2026, before.*September 25, 2026/);
    await page.locator("[data-sat-wait-for-score]").check();
    await build.click();
    assert.equal(await page.locator("[data-sat-backup-date]").textContent(), "November 7, 2026");
    assert.match(await page.locator("[data-sat-retake-window]").textContent(), /Skipped October 3, 2026.*regular registration cutoff on October 23, 2026/);
    const events = await page.evaluate(() => window.dataLayer
      .filter(event => event[0] === "event" && event[1] === "sat_plan_generated")
      .map(event => Object.keys(event[2]).sort()));
    assert.equal(events.length, 2);
    assert.deepEqual(events[0], events[1]);
    assert(!events.flat().some(key => /wait|loan|score/i.test(key)));
  } finally { await context.close(); }
});

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
    const calendar = calendarEvents(ics);
    assert.equal(calendar.filter(event => event.includes("DTSTART;VALUE=DATE:")).length, 8);
    assert.equal(calendar.length, 24);
    for (const cutoff of ["20261024T035900Z", "20261125T045900Z", "20270220T045900Z", "20270421T035900Z"]) {
      assert.ok(calendar.some(event => event.includes(`DTSTART:${cutoff}\r\n`)), cutoff);
    }
    assert.equal(new Set(calendar.map(event => event.match(/^UID:(.+)$/m)[1])).size, calendar.length);
    assert.match(await page.locator("#sat-calendar").innerText(), /11:59 p\.m\. U\.S\. Eastern time/);
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
      const calendar = fs.readFileSync(await (await download).path(), "utf8");
      assert.match(unfold(calendar), /device request by November 5\\, 2026/);
      assert.equal(calendarEvents(calendar).length, 4);
      const loanEvent = calendarEvents(calendar).find(event => /SUMMARY:SAT device request cutoff/i.test(event));
      assert.match(loanEvent, /DTSTART;VALUE=DATE:20261105\r\nDTEND;VALUE=DATE:20261106/);
      assert.match(loanEvent, /device-lending/);
      assert.match(calendar, /DTSTART:20261121T045900Z/);
      assert.match(calendar, /DTSTART:20261125T045900Z/);
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
    assert.match(calendar, /DTSTART:20261125T045900Z/);
    assert.ok(calendar.trimEnd().split("\r\n").every(line => Buffer.byteLength(line) <= 75));
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
