const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const url = pathToFileURL(path.resolve(__dirname, "../sat-score-goal-planner.html")).href;
const key = "testdaytools_sat_goal_plan_v1";
const baseline = { current: 1200, target: 1360, weeks: 8, hours: 4 };
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function withPlanner(run, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  try {
    await context.route(/^https?:/, (route) => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    await run(page);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

const field = (page, name) => page.locator(`[data-goal-${name}]`);
const read = (page) => Promise.all(["gap", "weekly", "total-hours"].map((name) => field(page, name).textContent()));
const savedPlan = (page) => page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
const goalEvents = (page) => page.evaluate(() => (window.dataLayer || [])
  .filter((entry) => entry[0] === "event" && /^sat_goal_/.test(entry[1]))
  .map((entry) => {
    const { page_path, transport_type, ...params } = entry[2];
    return [entry[1], params];
  }));

async function enter(page, values) {
  for (const [name, value] of Object.entries(values)) await field(page, name).fill(String(value));
}

test("calculates, saves, and restores valid plans without changing their events", () => withPlanner(async (page) => {
  await enter(page, baseline);
  assert.deepEqual(await read(page), ["160 points", "20 points", "32 hours"]);
  assert.deepEqual(await goalEvents(page), []);
  await field(page, "button").click();
  await field(page, "save").click();
  assert.deepEqual(JSON.parse(await savedPlan(page)), baseline);
  assert.deepEqual(await goalEvents(page), [
    ["sat_goal_generated", { score_gap: 160, weeks: 8, weekly_hours: 4, points_per_week: 20 }],
    ["sat_goal_saved", { score_gap: 160, weeks: 8, weekly_hours: 4 }],
  ]);

  await page.reload();
  for (const [name, value] of Object.entries(baseline)) assert.equal(await field(page, name).inputValue(), String(value));
  assert.deepEqual(await read(page), ["160 points", "20 points", "32 hours"]);
  assert.match(await field(page, "saved-status").textContent(), /Saved plan loaded/);
  assert.deepEqual(await goalEvents(page), []);
  await enter(page, { target: 1200 });
  assert.deepEqual(await read(page), ["0 points", "Maintain", "32 hours"]);
}));

test("blank or invalid input never produces a plan, an event, or a replacement save", () => withPlanner(async (page) => {
  await enter(page, baseline);
  await field(page, "save").click();
  for (const [name, value] of [
    ["current", ""], ["target", ""], ["weeks", ""], ["hours", ""],
    ["current", "390"], ["target", "1365"], ["target", "1610"],
    ["weeks", "0"], ["weeks", "25"], ["hours", "1.5"], ["hours", "31"],
  ]) {
    await field(page, name).fill(value);
    assert.equal(await field(page, name).getAttribute("aria-invalid"), "true");
    assert.deepEqual(await read(page), ["--", "--", "--"]);
    assert.equal(await field(page, "plan").locator("li").count(), 0);
    assert.equal(await field(page, "button").isDisabled(), true);
    assert.equal(await field(page, "save").isDisabled(), true);
    assert.equal(await field(page, "saved-status").isVisible(), false);
    await field(page, "button").dispatchEvent("click");
    await field(page, "save").dispatchEvent("click");
    assert.deepEqual(JSON.parse(await savedPlan(page)), baseline);
    assert.equal((await goalEvents(page)).length, 1);
    await field(page, name).fill(String(baseline[name]));
    assert.equal(await field(page, name).getAttribute("aria-invalid"), null);
    assert.equal(await field(page, "save").isEnabled(), true);
  }
  await field(page, "target").fill("");
  await page.reload();
  assert.equal(await field(page, "target").inputValue(), "1360");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
}, { width: 390, height: 844 }));

test("invalid stored plans are not clamped, restored, or overwritten", () => withPlanner(async (page) => {
  for (const bad of [{ ...baseline, target: 1365 }, { ...baseline, weeks: 0 }, { ...baseline, hours: null }]) {
    const raw = JSON.stringify(bad);
    await page.evaluate(([storageKey, value]) => localStorage.setItem(storageKey, value), [key, raw]);
    await page.reload();
    assert.equal(await field(page, "current").inputValue(), "1180");
    assert.equal(await field(page, "target").inputValue(), "1350");
    assert.equal(await field(page, "saved-status").isVisible(), false);
    assert.equal(await savedPlan(page), raw);
    assert.deepEqual(await goalEvents(page), []);
  }
}));

test("weekly gap is rounded planning math, not a feasibility verdict", () => withPlanner(async (page) => {
  await enter(page, { ...baseline, target: 1370 });
  assert.deepEqual(await read(page), ["170 points", "30 points", "32 hours"]);
  const guidance = await field(page, "next-step").textContent();
  assert.match(guidance, /rounded up to a multiple of 10/);
  assert.match(guidance, /not a score prediction/);
  await enter(page, { hours: 3 });
  assert.equal(await field(page, "next-step").textContent(), guidance);
  assert.deepEqual(await read(page), ["170 points", "30 points", "24 hours"]);
}));
