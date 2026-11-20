const assert = require("node:assert/strict");
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
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

for (const width of [390, 1280]) {
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
          await page.getByText("At least 24 of 30", { exact: true }).waitFor();
          assert.equal(await page.getByRole("link", { name: "Nationwide picture quiz", exact: true }).getAttribute("href"),
            "road-signs-practice-test.html?mode=road-signs-core#practice");
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
