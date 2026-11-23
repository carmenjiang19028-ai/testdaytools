const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { chromium } = require("playwright");
const { readFileSync } = require("node:fs");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const national = {
  "Practice in the national picture quiz": "road-signs-practice-test.html",
  "Practice in the national regulatory quiz": "regulatory-traffic-signs-practice-test.html",
};
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome" }); });
after(async () => { await browser?.close(); });

async function withPage(run) {
  const context = await browser.newContext({ viewport: { width: 390, height: 820 } });
  await context.route(/^https?:/, route => route.abort());
  try {
    await run(await context.newPage());
  } finally {
    await context.close();
  }
}

async function activeGroup(page) {
  return page.locator("#practice [data-quiz]:visible").evaluate(quiz => {
    const focus = quiz.querySelector("[data-quiz-filter]").value;
    const pictures = Array.from(quiz.querySelectorAll(".question"))
      .filter(question => question.dataset.category === focus)
      .map(question => question.querySelector(".sign-art svg")?.outerHTML);
    return { focus, pictures, jumpCount: quiz.querySelectorAll("[data-quiz-jump]").length };
  });
}

test("every finder card with an exact drill opens a group containing its picture", async () =>
  withPage(async page => {
    const sitemap = readFileSync(path.join(root, "sitemap.xml"), "utf8");
    const files = [...sitemap.matchAll(/<loc>https:\/\/testdaytools.com\/([^<]+\.html)<\/loc>/g)]
      .map(match => match[1])
      .filter(file => readFileSync(path.join(root, file), "utf8").includes('class="sign-lookup-card" data-sign-card'));
    assert(files.includes("road-signs-practice-test.html") && files.includes("florida-dmv-road-signs-practice.html"));
    for (const file of files) {
      await page.goto(pathToFileURL(path.join(root, file)).href);
      const cards = await page.locator("[data-sign-card]").evaluateAll(cards => cards.map(card => ({
        title: card.querySelector("strong").textContent,
        svg: card.querySelector("svg").outerHTML,
        link: card.querySelector("a")?.href,
        label: card.querySelector("a")?.textContent,
      })));
      const checked = new Map();
      for (const card of cards) {
        const where = `${file}: ${card.title}`;
        assert(card.link, where);
        const destination = new URL(card.link);
        assert(destination.pathname.endsWith("/" + (national[card.label] || file)), where);
        assert.equal(destination.hash, "#practice", where);
        if (!checked.has(card.link)) {
          await page.goto(card.link);
          checked.set(card.link, await activeGroup(page));
        }
        const group = checked.get(card.link);
        assert.equal(group.focus, destination.searchParams.get("focus"), where);
        assert(group.pictures.length > 0, where);
        assert.equal(group.jumpCount, group.pictures.length, where);
        if (card.label === "Practice related turn signs") {
          assert.equal(file, "florida-dmv-road-signs-practice.html");
          assert.equal(card.title, "Right Turn Only");
          assert.equal(group.focus, "Turn signs");
          assert(!group.pictures.includes(card.svg), where);
        } else {
          assert(card.label in national || card.label === "Practice this group", where);
          assert(group.pictures.includes(card.svg), where);
        }
      }
    }
  }));

test("a learner can search for the railroad sign and open its exact picture question", async () =>
  withPage(async page => {
    await page.goto(pathToFileURL(path.join(root, "road-signs-practice-test.html")).href);
    await page.locator("[data-sign-search]").fill("crossing railroad");
    const card = page.locator("[data-sign-card]:visible");
    const image = await card.locator("svg").evaluate(svg => svg.outerHTML);
    const link = card.getByRole("link", { name: "Practice this group" });
    const url = new URL(await link.getAttribute("href"), page.url());
    await link.click();
    await page.waitForURL(url.href);
    await page.waitForFunction(({ mode, focus }) => {
      const quiz = document.querySelector(".mode-panel.is-active [data-quiz]");
      return quiz?.dataset.modeId === mode && quiz.querySelector("[data-quiz-filter]").value === focus;
    }, { mode: url.searchParams.get("mode"), focus: url.searchParams.get("focus") });
    const group = await activeGroup(page);
    const position = group.pictures.indexOf(image);
    assert(position >= 0, "the pictured railroad sign is in the selected group");
    const quiz = page.locator("#practice [data-quiz]:visible");
    await quiz.locator(`[data-quiz-jump="${position}"]`).click();
    assert.equal(await quiz.locator(".question.is-active .sign-art svg").evaluate(svg => svg.outerHTML), image);
  }));
