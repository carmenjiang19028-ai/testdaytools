# Strategy Risk Audit - 2026-05-09

## Short Answer

We do not have 100% confidence that this site will make money.

We do have high confidence that the current version is suitable as a low-cost MVP to publish, index, and test organic traffic.

The practical goal is not "guaranteed profit." The practical goal is:
- Publish quickly.
- Keep maintenance low.
- Avoid obvious SEO/compliance mistakes.
- Measure real Google Search Console data.
- Expand only if the data supports it.

## Current Site State

Working brand: TestDayTools

Repository:
https://github.com/carmenjiang19028-ai/testdaytools

Planned GitHub Pages URL:
https://carmenjiang19028-ai.github.io/testdaytools/

Local workspace:
/Users/carmen/Documents/New project 3

Static site type:
- Plain HTML/CSS/JS.
- Python standard-library generator.
- No runtime dependencies.
- Data-driven content in `content/site_data.json`.

## Audit Results

Automated checks passed on 2026-05-09:
- Build completed with `python3 scripts/build.py`.
- Python build script compiled with `python3 -m py_compile scripts/build.py`.
- 13 HTML pages generated.
- No broken internal links found.
- Every HTML page has a title, meta description, canonical URL, and H1.
- Canonical URLs point to the GitHub Pages project URL.
- All 8 tool pages include FAQ, source links, related links, and unofficial/disclaimer language.
- DMV quiz pages now contain 15 questions each.
- No real AdSense code is installed yet.
- No account system or personal data collection exists.

## Confidence Loop

### Loop 1: Can the site be technically launched?

Risk:
The first generated version was usable but had launch issues:
- Canonical URL assumed `testdaytools.com`.
- Contact page used a domain email that does not exist yet.
- Some generated source links used `nofollow`.

Fix:
- Canonical and sitemap now use the GitHub Pages project URL.
- Placeholder domain email was removed.
- Official source links no longer use `nofollow`.

Current confidence:
High. The site is technically ready to publish once GitHub authentication and Pages are set up.

### Loop 2: Is the content too thin for Google or AdSense?

Risk:
Thin pages are unlikely to rank or pass monetization review.

Fix:
- AP score page has a countdown, checklist, FAQ, sources, and related links.
- AP schedule page was expanded to a subject-by-subject 2026 schedule table.
- SAT dates page has a date table, countdown, FAQ, and official source links.
- DMV pages were expanded from 5 to 15 original questions per state.

Remaining weakness:
The site is still an MVP. More depth may be needed before AdSense approval.

Current confidence:
Good for indexing and testing. Not yet enough to guarantee AdSense approval.

### Loop 3: Are there factual/date risks?

Risk:
Wrong dates would hurt trust and search performance.

Fix:
- AP schedule was checked against College Board's 2026 AP exam dates.
- SAT spring 2027 date was corrected from March 13, 2027 to March 6, 2027.
- AP score page source changed to the College Board score release calendar.

Remaining weakness:
Official dates can still change.

Mitigation:
Review AP/SAT official pages before major traffic periods and update `content/site_data.json`.

Current confidence:
Good for current MVP, with an annual/seasonal review requirement.

### Loop 4: Is there trademark/compliance risk?

Risk:
AP, SAT, College Board, and DMV are official names/trademarks/public agency terms.

Fix:
- Domain/brand does not include AP, SAT, College Board, or DMV.
- No official logos are used.
- The site repeatedly says it is unofficial and unaffiliated.
- DMV questions are original general safe-driving questions, not copied official test questions.

Remaining weakness:
Even descriptive use of official names must stay careful.

Mitigation:
Keep the brand generic. Use official names only to describe the topic users are searching for.

Current confidence:
Acceptable for a small unofficial information/tool site.

### Loop 5: Can this make money with ads?

Risk:
Organic traffic, RPM, AdSense approval, and click behavior are not controllable.

Fix:
- Do not apply for AdSense immediately.
- First publish, submit to Search Console, and wait for indexing and early traffic.
- Keep ad placeholders only. Add real ads later if the site has traffic and looks trustworthy.
- Avoid placing future ads near quiz answer buttons or action areas.

Remaining weakness:
Revenue is not guaranteed.

Mitigation:
Use 30/60/90/180-day decision points.

Current confidence:
Not 100% for profit. High confidence for a low-cost traffic experiment.

### Loop 6: Is maintenance likely to stay simple?

Risk:
Exam sites can become high-maintenance if expanded too broadly.

Fix:
- Content lives in one main data file.
- Pages are generated from reusable templates.
- Current MVP only covers AP, SAT, California DMV, and New York DMV.
- Do not expand to 50-state DMV until Search Console shows the DMV pages have real demand.

Current confidence:
High. Maintenance should stay light if expansion is data-driven.

## Final Position

Do not claim 100% confidence in revenue.

Do claim high confidence in this next step:
Publish the current MVP, enable GitHub Pages, submit to Google Search Console, and observe real search data.

This is the most honest "factually near-100%" version of the strategy:
The project is worth launching as a low-cost validation test, and the remaining major risks are market risks rather than obvious implementation mistakes.

## Current Blockers

1. GitHub authentication/push needs to be completed by the user.
2. GitHub Pages needs to be enabled after the push.
3. Search Console needs to be set up after the site is live.
4. A real domain and contact email should be added before AdSense application.

## Next Recommended Actions

1. Push local repo to GitHub.
2. Enable GitHub Pages from `main` branch root.
3. Verify live URL and all core pages.
4. Submit sitemap to Google Search Console:
   `https://carmenjiang19028-ai.github.io/testdaytools/sitemap.xml`
5. Wait for indexing.
6. Improve whichever page first gets impressions.
7. Apply for AdSense only after indexing and some organic traffic.
