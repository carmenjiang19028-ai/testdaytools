const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const url = pathToFileURL(path.resolve(__dirname, "../digital-sat-score-calculator.html")).href;
const inputs = ["rw", "math", "target"];
const outputs = ["total", "gap", "rw-needed", "math-needed"];
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function withCalculator(run, viewport = { width: 1280, height: 900 }) {
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

const field = (page, name) => page.locator(`[data-sat-${name}]`);
const read = (page) => Promise.all(outputs.map((name) => field(page, name).textContent()));
const status = (page) => field(page, "score-status").textContent();
async function enter(page, values) {
  for (const [index, name] of inputs.entries()) {
    await field(page, name).fill(String(values[index]));
  }
}

test("adds reported scores and calculates both independent section targets", () => withCalculator(async (page) => {
  assert.deepEqual(await read(page), ["--", "--", "--", "--"]);
  await enter(page, [620, 700, 1400]);
  await field(page, "target").press("Enter");
  assert.equal(page.url(), url);
  assert.deepEqual(await read(page), ["1320", "80 points", "700", "780"]);
  assert.match(await status(page), /other score stays the same/);
  await enter(page, [760, 740, 1550]);
  assert.deepEqual(await read(page), ["1500", "50 points", "810 (over 800)", "790"]);
  await enter(page, [740, 760, 1550]);
  assert.deepEqual(await read(page), ["1500", "50 points", "790", "810 (over 800)"]);
}));

test("handles score-scale boundaries and a met or exceeded target", () => withCalculator(async (page) => {
  await enter(page, [200, 200, 400]);
  assert.deepEqual(await read(page), ["400", "0 points", "No increase", "No increase"]);
  assert.match(await status(page), /matches your target/);
  await enter(page, [800, 800, 1600]);
  assert.deepEqual(await read(page), ["1600", "0 points", "No increase", "No increase"]);
  await enter(page, [790, 800, 1600]);
  assert.deepEqual(await read(page), ["1590", "10 points", "800", "810 (over 800)"]);
  await enter(page, [800, 800, 1550]);
  assert.deepEqual(await read(page), ["1600", "0 points", "No increase", "No increase"]);
  assert.match(await status(page), /50 points above/);
}));

test("withholds and clears results for missing or invalid entries", () => withCalculator(async (page) => {
  await page.getByRole("button", { name: "Calculate score gap" }).click();
  assert.equal(await field(page, "rw").evaluate((input) => input === document.activeElement), true);
  for (const [name, value] of [
    ["rw", "40"], ["rw", "195"], ["math", "810"], ["math", "700.5"],
    ["target", "390"], ["target", "1610"], ["target", "1405"], ["target", ""],
  ]) {
    await enter(page, [620, 700, 1400]);
    await field(page, name).fill(value);
    await page.getByRole("button", { name: "Calculate score gap" }).click();
    assert.deepEqual(await read(page), ["--", "--", "--", "--"]);
    assert.equal(await field(page, name).getAttribute("aria-invalid"), "true");
    assert.match(await status(page), /steps of 10/);
  }
  await enter(page, [620, 700, 1400]);
  assert.deepEqual(await read(page), ["1320", "80 points", "700", "780"]);
  for (const name of inputs) assert.equal(await field(page, name).getAttribute("aria-invalid"), null);
}));

test("mobile results fit and score inputs do not add analytics events", () => withCalculator(async (page) => {
  const analytics = () => page.evaluate(() => (window.dataLayer || []).filter((entry) => entry[0] === "event").length);
  const initialEvents = await analytics();
  await enter(page, [200, 200, 1600]);
  await page.getByRole("button", { name: "Calculate score gap" }).click();
  assert.deepEqual(await read(page), ["400", "1200 points", "1400 (over 800)", "1400 (over 800)"]);
  assert.equal(await analytics(), initialEvents);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}, { width: 390, height: 844 }));
