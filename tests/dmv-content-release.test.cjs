const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const origin = "https://testdaytools.com";
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function checkoutContext(width, options) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, ...options });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (/^\/(?:_|content\/|scripts\/|tests\/|project-memory\/)/.test(url.pathname)) {
      return route.fulfill({ status: 404, body: "Not found" });
    }
    const destination = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    if (!destination.startsWith(root + path.sep) || !fs.existsSync(destination)) {
      return route.fulfill({ status: 404, body: "Not found" });
    }
    return route.fulfill({ path: destination });
  });
  return context;
}

for (const width of [320, 1280]) {
  test(`${width}px: canonical links, read-only state questions, and a table-first calculator`, async () => {
    const context = await checkoutContext(width, { javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(origin);
      assert.equal(await page.locator("[data-state-card]").count(), 8);
      await page.locator("[data-state-card]").filter({ hasText: "New York" }).getByRole("link", { name: "Permit practice" }).click();
      assert.equal(new URL(page.url()).pathname, "/new-york-dmv-road-signs-practice.html");
      assert.equal(await page.locator("[data-guide-question=state]").count(), 10);
      assert.equal(await page.locator("[data-guide-question=sign]").count(), 10);
      const sign = page.locator(".state-sign-question").first();
      assert.ok(await sign.locator("img").isVisible());
      await sign.locator("summary").click();
      assert.ok(await sign.getByText("Answer:", { exact: true }).isVisible());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.locator(".site-header").getByRole("link", { name: "Can I miss?" }).click();
      assert.equal(await page.locator("#score-table tbody tr").count(), 7);
      const top = await page.locator("#score-table").boundingBox();
      const calc = await page.locator("#score-calculator").boundingBox();
      assert.ok(top.y < 700 && top.y < calc.y);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    } finally { await context.close(); }
  });
}

test("canonical practice links retain the selected mode on deliberate navigation", async () => {
  const context = await checkoutContext(1100);
  try {
    const page = await context.newPage();
    await page.goto(origin);
    const choice = page.locator('a[data-route-query*="mode=road-signs-starter"]').first();
    assert.equal(await choice.getAttribute("href"), origin + "/road-signs-practice-test.html");
    await choice.click();
    const selected = new URL(page.url());
    assert.equal(selected.pathname, "/road-signs-practice-test.html");
    assert.equal(selected.searchParams.get("mode"), "road-signs-starter");
    assert.equal(selected.hash, "#practice");
  } finally { await context.close(); }
});

test("exact Pennsylvania threshold and New York's separate sign condition still work", async () => {
  const context = await checkoutContext(1100);
  try {
    const page = await context.newPage();
    await page.goto(origin + "/dmv-permit-test-passing-score-calculator.html");
    const states = page.locator("[data-score-state]");
    const total = page.locator("[data-score-input-total]");
    const correct = page.locator("[data-score-input-correct]");
    const result = page.locator("[data-score-status]");
    const submit = page.locator("[data-score-check]");
    await states.selectOption("pennsylvania");
    await total.fill("18");
    await correct.fill("15");
    await submit.click();
    assert.match(await result.textContent(), /meet|pass/i);
    await states.selectOption("new-york");
    await total.fill("20");
    await correct.fill("14");
    await page.locator("[data-score-section-correct]").fill("1");
    await submit.click();
    assert.match(await result.textContent(), /1 more road-sign answer needed/i);
  } finally { await context.close(); }
});

test("the protected printable sheet still opens and scores its focused warning-sign round", async () => {
  const context = await checkoutContext(390);
  try {
    const page = await context.newPage();
    await page.goto(origin + "/dmv-road-signs-cheat-sheet.html");
    const link = page.getByRole("link", { name: "Practice 20 questions: Warning signs", exact: true });
    assert.equal(await link.getAttribute("href"), origin + "/road-signs-practice-test.html");
    await link.click();
    await page.waitForURL(url => url.searchParams.get("focus") === "sheet-warning");
    const quiz = page.locator('[data-mode-panel="road-signs-core"].is-active [data-quiz]');
    assert.equal(await quiz.locator("[data-quiz-filter]").inputValue(), "sheet-warning");
    assert.match(await quiz.locator("[data-quiz-position]").textContent(), /Question 1 of 20/);
    const question = quiz.locator(".question.is-active");
    const expected = await question.getAttribute("data-answer");
    await question.locator(`[data-choice="${expected}"]`).click();
    assert.match(await question.locator(".feedback").textContent(), /Correct/);
  } finally { await context.close(); }
});

test("the protected worksheet still returns from a contrast drill to the chosen answer", async () => {
  const context = await checkoutContext(390);
  try {
    const page = await context.newPage();
    await page.goto(origin + "/dmv-road-signs-cheat-sheet.html#online-worksheet");
    const part = page.locator("#online-worksheet .worksheet-part").nth(1);
    if (!(await part.evaluate(node => node.open))) await part.locator(":scope > summary").press("Enter");
    const answer = part.locator("details").filter({ hasText: "Check decision 1" });
    await answer.locator("summary").press("Enter");
    await answer.getByRole("link", { name: "Compare STOP and YIELD" }).press("Enter");
    await page.waitForURL(url => url.hash === "#lesson-stop-yield");
    await page.locator("#lesson-stop-yield").getByRole("link", { name: "Practice this distinction" }).press("Enter");
    await page.waitForURL(url => url.searchParams.get("concept") === "stop-yield");
    for (let i = 0; i < 3; i++) {
      await page.locator('[data-loop-option="0"]').press("Enter");
      await page.locator("[data-loop-next]").press("Enter");
      await page.locator("[data-loop-next]").press("Enter");
    }
    await page.getByRole("link", { name: "Return to this worksheet answer" }).press("Enter");
    await page.waitForURL(url => url.hash === "#worksheet-decision-1");
    assert.ok(await page.getByText("Check decision 1", { exact: true }).isVisible());
  } finally { await context.close(); }
});

test("old state and requirements URLs take visitors to the corresponding new page", async () => {
  const context = await checkoutContext(1100);
  try {
    const page = await context.newPage();
    for (const [old, current] of [
      ["new-york-dmv-permit-practice-test", "new-york-dmv-road-signs-practice"],
      ["dmv-permit-test-requirements-by-state", "dmv-permit-test-passing-score-calculator"],
    ]) {
      await page.goto(origin + "/" + old + ".html");
      await page.waitForURL(origin + "/" + current + ".html");
      assert.ok(await page.locator("h1").isVisible());
    }
    for (const retired of [
      "/ap-tools.html", "/sat-tools.html", "/skills-practice.html",
      "/virginia-dmv-road-signs-practice.html", "/_archive/step-1/ap-tools.html",
    ]) {
      assert.equal((await page.goto(origin + retired)).status(), 404);
    }
  } finally { await context.close(); }
});
