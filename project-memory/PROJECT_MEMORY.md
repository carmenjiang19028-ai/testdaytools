# TestDayTools Project Memory

Last updated: 2026-05-09
Workspace: /Users/carmen/Documents/New project 3

## Project Goal

Build an English static website that gets organic search traffic from practical "how/when/checklist/practice" queries and later monetizes with AdSense ads.

The user wants:
- Low build complexity.
- Low long-term maintenance.
- Natural search traffic.
- Ads revenue in USD.
- Project context saved in files so future model/context changes do not lose the plan.

## Current Chosen Strategy

Build a tool-first exam preparation site under the working brand `TestDayTools`.

Positioning:
Free test-day tools, schedules, checklists, countdowns, and practice quizzes for U.S. exams and permit tests.

Do not build a broad encyclopedia or daily blog. Each page should solve a clear search intent and include a tool-like element.

## Why This Strategy

This direction was selected after comparing:
- Tax calculator site: higher RPM potential, but harder YMYL trust problem and slower traffic.
- Game guide site: faster traffic possible, but higher maintenance and lower RPM.
- Exam/DMV tool site: better balance of search demand, low maintenance, reusable templates, and AdSense suitability.

Final logic:
- AP provides short-term search opportunity around score release.
- DMV provides evergreen traffic.
- SAT provides stable year-round support content.

## MVP Pages

Core pages:
1. AP Score Release Date 2026
2. 2026 AP Exam Schedule
3. AP Exam Day Checklist
4. SAT Test Dates 2026-2027
5. Digital SAT Checklist
6. SAT Score Release Guide
7. California DMV Permit Practice Test
8. New York DMV Permit Practice Test

Trust/legal pages:
1. About
2. Privacy
3. Contact
4. Disclaimer

Home page:
- Should act as a practical tool hub with direct entry points to AP, SAT, and DMV tools.
- Do not make a marketing-style landing page.

## Page Requirements

Every core page should include several of:
- Clear title and search-focused description.
- Tool component: countdown, date table, checklist, quiz, or guide flow.
- FAQ.
- Source citations where relevant.
- Last updated date.
- Internal links to related pages.
- Clear unofficial/non-affiliated disclaimer where AP/SAT/DMV terms appear.

## Data And Maintenance Strategy

Build the site as configuration-driven:
- AP/SAT dates in data files.
- Checklists in data files.
- DMV quiz questions in data files.
- FAQ content in data files where practical.
- Shared components for countdowns, date tables, checklists, quizzes, source citations, and ad placeholders.

Maintenance target:
- First month after launch: check Search Console weekly, about 1-2 hours per week.
- Stable phase: about 1 hour per month.
- Annual updates: AP/SAT dates and quiz refresh, about half a day to one day.

## SEO Strategy

Primary long-tail keywords:
- ap score release date 2026
- when do ap scores come out 2026
- 2026 ap exam schedule
- ap exam day checklist
- sat dates 2026 2027
- digital sat checklist
- sat score release
- california dmv practice test
- ny permit practice test
- road signs practice test

Do not target only broad terms like "SAT" or "DMV test" at first.

Measure success through Google Search Console:
- Indexed pages.
- Impressions.
- Clicks.
- Queries with positions 5-30 that can be improved.

Decision checkpoints:
- 30 days: confirm indexing.
- 60 days: review impressions and early clicks.
- 90 days: decide whether to expand, revise titles/content, or pivot.
- 180 days: if traffic is still weak, reuse the template for another tool-site niche.

## Monetization Strategy

Do not add real AdSense code in the first build.

First:
1. Build site.
2. Publish.
3. Submit to Search Console.
4. Wait for indexing and some natural traffic.
5. Add About, Privacy, Contact, Disclaimer.
6. Apply for AdSense after the site looks useful and complete.

Ad placement principles:
- Use conservative ad slots.
- Do not place ads next to quiz answer buttons or action buttons.
- Avoid accidental clicks.
- Prioritize user trust and page usefulness before ad density.

Expected earnings are not guaranteed. A rough working model:
- 10,000 pageviews/month: about $20-$120.
- 50,000 pageviews/month: about $100-$600.
- 100,000 pageviews/month: about $200-$1,200.

These are planning assumptions, not promises.

## Compliance And Risk Notes

Important:
- Do not use official College Board, AP, SAT, DMV, or state logos.
- Do not copy official AP/SAT/DMV questions.
- DMV quiz questions must be original or based on general safe-driving knowledge.
- Do not imply official affiliation.
- Domain should not include protected marks such as CollegeBoard, AP, SAT, or official DMV wording.
- Add disclaimer: fan-made/unofficial, not affiliated with College Board, state DMV agencies, or any official testing body.
- Do not collect personal information from students or permit-test users.
- Do not require accounts.
- If storing quiz progress, use local browser storage only.

## Main Risks And Fixes

Risk: AP/SAT competition is strong.
Fix: Target long-tail pages and tool formats, not broad keywords.

Risk: AP score page is seasonal.
Fix: Use AP for short-term traffic, DMV for evergreen traffic, SAT for year-round support.

Risk: DMV could expand into 50-state maintenance.
Fix: Start with California and New York only. Expand only if Search Console validates DMV traffic.

Risk: Content could be too thin.
Fix: Each page must include a real tool, examples, FAQ, citations, and internal links.

Risk: AdSense may not approve or earnings may be low.
Fix: Launch without ads, improve usefulness first, apply after indexing and early traffic.

Risk: Context loss across model changes.
Fix: Keep this file updated after major strategy or implementation decisions.

## Expansion Plan

If DMV works:
1. Texas DMV Practice Test
2. Florida DMV Practice Test
3. Illinois DMV Practice Test
4. Road Signs Practice Test
5. DMV Signs by State

If AP/SAT works:
1. ACT Test Dates
2. GED Practice Test
3. AP Score Calculator
4. SAT Study Plan Generator
5. Digital SAT Device Checklist

If the whole exam direction underperforms:
- Reuse the same static-site template for another "self-serve tool" niche.
- Candidate niches: travel checklists, AI prompt tools, game/tool guide databases, licensing exam practice tools.

## Current Implementation Status

As of 2026-05-09:
- A separate code worker agent named "Kuhn" built the first static MVP.
- The parent agent reviewed and improved the MVP before GitHub upload.
- Local git repository was initialized and the first local commit was created.
- GitHub repository created by user: https://github.com/carmenjiang19028-ai/testdaytools
- GitHub Pages project URL: https://carmenjiang19028-ai.github.io/testdaytools/
- Custom domain purchased and DNS configured: https://testdaytools.com/
- Canonical production URL after domain setup: https://testdaytools.com/
- Sitemap after domain setup: https://testdaytools.com/sitemap.xml
- Custom domain verification from local checks:
  - `https://testdaytools.com/` returns HTTP 200 from GitHub Pages.
  - `https://www.testdaytools.com/` redirects to `https://testdaytools.com/`.
  - `https://testdaytools.com/sitemap.xml` returns the custom-domain sitemap.

Important review fixes already made:
- Initially changed canonical/sitemap URL from `https://testdaytools.com` to the GitHub Pages project URL for first launch.
- After purchasing `testdaytools.com`, changed canonical/sitemap URL back to the custom domain and added a root `CNAME` file for GitHub Pages.
- Updated SAT spring 2027 date from March 13, 2027 to March 6, 2027 based on College Board's SAT dates page.
- Changed the AP score source to the College Board score release calendar page.
- Expanded the 2026 AP schedule page from broad week windows to a subject-by-subject date table.
- Expanded California and New York DMV quiz pages from 5 questions each to 15 questions each.
- Mixed answer positions in the DMV quizzes so the first answer is not always correct.
- Removed `rel="nofollow"` from official source citations.
- Removed the placeholder domain email from the contact page and marked GitHub as the temporary project contact path until a real domain email exists.

Current assessment:
- Good enough to publish as a free MVP and start Search Console indexing.
- The site now has a real `.com` domain, which improves trust and avoids a later domain migration.
- Not yet ready to apply for AdSense because there is no real domain email, no traffic history, and content depth should be improved after initial indexing.
- Before AdSense, add a real contact email on the domain or another credible contact method.

## One-Week SEO Sprint Status

As of 2026-05-09, the site has been expanded from the original 8 core tool pages to 14 tool pages plus trust pages.

New sprint pages added locally:
1. AP Scores Delayed or Missing 2026
2. AP Credit After Scores Guide
3. SAT August 22, 2026 Planning Guide
4. Digital SAT Bluebook Checklist
5. California DMV Road Signs Practice
6. New York DMV Road Signs Practice

UX/product improvements added locally:
- Homepage now has "Start here" and "What to use today" sections.
- Pages now support quick facts, timelines, card groups, checklists, tables, quizzes, FAQs, sources, and related links.
- DMV quizzes include category labels and weak-area feedback.
- The contact page includes a public GitHub project link until a domain email is available.

## Product Restructure: Hub-First Site

As of 2026-05-09, after reviewing the live site from a user and monetization perspective, the product direction was tightened.

Problem found:
- The site was technically live and useful, but it still felt like a collection of simple pages instead of a focused tool site.
- AP/SAT/DMV were not clearly unified for a first-time visitor.
- DMV practice, the most evergreen traffic engine, was not prominent enough.

Fix implemented:
- Homepage now sends visitors into three clear paths: DMV practice, AP tools, and SAT tools.
- Added three hub pages:
  1. `/dmv-practice.html`
  2. `/ap-tools.html`
  3. `/sat-tools.html`
- Navigation now points to the hub pages instead of individual deep pages.
- DMV quiz pages now show practice questions immediately after quick facts, before long explanatory content.
- DMV quizzes now have a visible score panel, progress bar, completion feedback, and weak-area guidance.
- Sitemap now includes the hub pages.

Current product assessment:
- The site is no longer just a thin MVP. It now has a clearer user journey and stronger internal structure.
- It is still not guaranteed to earn traffic or ad revenue quickly; the next priority is Search Console setup and indexing checks.
- Do not apply to AdSense until indexing and basic traffic signals are visible, unless the user explicitly wants to test early.

## UI/Product Quality Pass

As of 2026-05-09, the user reviewed the live DMV page and correctly identified that the site still did not feel like a useful tool site.

Problems found:
- Long DMV quizzes were displayed as a full list of questions, which made the page feel like raw content instead of an interactive tool.
- On wide desktop screens, content sections could collapse into vertical letter-by-letter text because `max-width` was applied to the full section while the section also had large responsive side padding.
- The primary DMV user action was not high enough on the page.

Fix implemented:
- DMV quiz pages now put the interactive practice tool immediately after the unofficial notice, before quick facts and explanatory content.
- Quiz UI is now one-question-at-a-time with progress, answered count, result panel, weak-area feedback, disabled next button until the user answers, and previous/next controls.
- Answer choices are now stacked and labeled A/B/C for readability instead of being squeezed into three columns.
- The result/status panel uses a right-side desktop layout and single-column mobile layout.
- The content-section layout bug was fixed by keeping sections full-width and limiting only the inner text width.
- Full-page overflow checks passed for 22 HTML pages on desktop width 1440 and mobile width 390.

Current product assessment:
- DMV pages now feel substantially more like a real tool.
- The next product gap is visual differentiation and richer task-specific utilities for AP/SAT, not more generic text pages.
- Real ad code remains disabled; there are no visible ad placeholders.

Validation already passed locally:
- Static build succeeds.
- JSON parses successfully.
- Python generator compiles successfully.
- 19 HTML pages are generated.
- Internal links have no missing local targets.
- Desktop and mobile viewport width checks show no horizontal overflow.
- Official source links returned HTTP 200 in the worker check.

Current strategic target:
- Do not promise one-week or three-day ranking.
- Use a 3-day content completion sprint to finish a useful, indexable, ad-friendly base quickly.
- After the content base is live, submit sitemap and priority URLs, then wait for Search Console data.
- The practical goal is not "traffic by a fixed date"; it is "content done quickly, then let Google produce real signals."

Supporting sprint docs:
- `project-memory/THREE_DAY_CONTENT_SPRINT.md`
- `project-memory/ONE_WEEK_SEO_SPRINT.md`

## Next Actions

1. Submit the live URL and sitemap to Google Search Console.
2. Track indexing and query impressions.
3. Improve the thin AP/SAT pages before applying for AdSense.
4. Improve whichever page gets early impressions.
5. Add a real contact email before applying for AdSense.
6. Apply for AdSense only after indexing and initial organic traffic.

## DMV Practice Engine V2

As of 2026-05-09, the DMV side was upgraded from a simple quiz page into the main product experience.

User concern:
- The site looked too simple and did not yet feel like a real, useful tool site.
- DMV road-sign questions needed visual prompts, not only text.
- The work should be done as a full product pass, not tiny incremental tweaks.

Fix implemented:
- Homepage and `/dmv-practice.html` now lead with a DMV-first practice launcher.
- California and New York permit pages now have three modes:
  1. Quick Practice: 15 questions.
  2. Road Signs: 20 original image-based SVG sign questions.
  3. Mock Exam: 40 mixed questions with a pass threshold.
- California and New York road-sign pages now open directly into a 20-question image quiz.
- Quiz UX now supports mode switching, one-question-at-a-time flow, disabled next button until answering, instant explanation, weak-area chips, progress meter, result status, and restart.
- Road-sign visuals are original inline SVG illustrations for common sign types such as stop, yield, do not enter, one way, school crossing, railroad, slippery road, merge, work zone, and signal ahead.

Validation passed locally:
- Static build succeeds.
- `assets/app.js` syntax check passes.
- `scripts/build.py` compiles.
- `content/site_data.json` parses.
- DMV mode interaction test passed: quick mode has 15 questions, signs mode has 20 image questions, mock mode has 40 questions, answer gating works, weak-area feedback appears, and restart resets the quiz.
- All 22 HTML pages passed desktop and mobile viewport checks with no layout overflow outside intentional table scroll areas.
- Internal link check found no missing local targets.

Current product assessment:
- DMV now feels like the strongest traffic and monetization entry point.
- This still does not guarantee fast ranking or ad revenue; traffic must be validated with Search Console after deployment.
- Next high-leverage improvements are more DMV state coverage, analytics/search-console setup, and improving whichever page gets early impressions.

## DMV Competitor-Informed Content Pass

As of 2026-05-09, after the user said the site still did not feel strong enough, a competitor-informed DMV pass was added.

Reference patterns observed:
- Strong DMV practice pages make the state exam context visible before or near the quiz.
- Road-sign pages feel more useful when they include a visual sign library, not only multiple-choice questions.
- Permit pages need a clear practice sequence: handbook, quick round, sign drill, mock exam.
- Trust signals matter: official source link, no copied official questions, no account required, and browser-only scoring.

Fix implemented:
- DMV permit pages now include an exam snapshot section before the mode selector.
- DMV road-sign pages open directly into the image quiz, then show a categorized road-sign library.
- The road-sign library groups original SVG signs into regulatory/control, warning, and school/rail/work-zone categories.
- DMV hub copy was tightened to describe the new state snapshot, image-sign, and mock-exam flow.

Validation passed locally:
- Static build succeeds.
- JavaScript syntax check passes.
- Python generator compiles.
- JSON parses.
- 22 HTML pages pass desktop and mobile viewport overflow checks.
- Internal link check found no missing local targets.
- DMV interaction check passed for New York signs mode: 20 image questions, disabled next before answer, weak-area feedback after a missed answer, and correct next-question advance.

## DMV State Expansion Pass

As of 2026-05-09, the DMV cluster was expanded from 2 state paths to 7 state paths.

Why this was done:
- State-specific DMV searches are the most natural long-tail pattern for this site.
- More state pages create more organic entry points without adding a complex backend.
- The maintenance model stays simple because pages are generated from `content/site_data.json`.

New state coverage:
- Texas DMV Permit Practice Test and Texas DMV Road Signs Practice.
- Florida DMV Permit Practice Test and Florida DMV Road Signs Practice.
- Illinois DMV Permit Practice Test and Illinois DMV Road Signs Practice.
- Pennsylvania DMV Permit Practice Test and Pennsylvania DMV Road Signs Practice.
- New Jersey MVC Permit Practice Test and New Jersey MVC Road Signs Practice.

Product structure per new state:
- 15-question quick practice.
- 20-question road-sign image quiz.
- 40-question mock exam.
- Official exam snapshot with source, format, pass rule, and high-risk topics.
- Categorized road-sign library using original SVG sign illustrations.
- Score interpretation table, weak-area table, FAQ, source links, and related-tool links.

Homepage and hub changes:
- Homepage and DMV hub now show 7 state paths live.
- Sitemap includes all new DMV pages.
- DMV launcher stats now show 140 road-sign image prompts and 3 modes per state.

Validation passed locally:
- Static build succeeds.
- `content/site_data.json` parses.
- `scripts/build.py` compiles.
- `assets/app.js` syntax check passes.
- `git diff --check` passes.
- All 32 HTML pages passed mobile and desktop overflow checks.
- Internal link check found no missing local targets.
- Texas signs mode interaction passed: signs tab activates, image prompt exists, answer gating works, and next question advances.
- Screenshot checks were reviewed for the expanded homepage, Texas mobile permit page, and Florida mobile road-sign page.

## DMV SERP Gap Optimization Pass

As of 2026-05-09, after reviewing Google results for DMV permit practice and road-sign searches, a second DMV content-depth pass was added.

SERP gap observed:
- Ranking pages do not only show quizzes; they usually show exam format, pass rule, test-day process, official source, topic groups, and road-sign study patterns.
- Strong pages create a sense of scale with topic modules and a complete study path.
- Road-sign pages teach shapes, colors, markings, and driver actions, not only multiple-choice answers.
- Permit pages need above-the-fold actions so the user can start practicing without scrolling through all explanatory content.

Fix implemented:
- Added hero quick actions on DMV tool pages:
  - Start practice.
  - Official test facts.
  - Study by topic or shape/color guide.
- Added `examDetails` modules for DMV pages with state-specific official facts.
- Added `practiceTopics` modules on permit pages with 8 topic cards:
  - Road signs and traffic controls.
  - Right of way.
  - Speed and following distance.
  - Intersections and turns.
  - Parking and curbs.
  - Bad weather and night driving.
  - Pedestrians, school buses, and cyclists.
  - Alcohol, drugs, and distractions.
- Added `signStudy` modules to teach signs by shape, color, and markings.
- Added state-specific checklist content for permit pages and road-sign pages.
- Adjusted page order so permit pages show exam snapshot, then practice, then deeper official facts and topic study content. Road-sign pages still open directly into the image quiz.

Validation passed locally:
- Static build succeeds.
- JSON parses.
- Python generator compiles.
- JavaScript syntax check passes.
- `git diff --check` passes.
- All 32 HTML pages passed desktop and mobile overflow checks.
- Florida DMV permit page sample showed 3 hero actions, 4 official fact cards, 8 topic cards, and a working `#practice` anchor.
- Florida signs interaction remained intact: signs mode has 20 image questions, answers record correctly, and next-question advance works.

## DMV Tool Site V2 Product/UI Upgrade

As of 2026-05-09, the DMV pages were upgraded from content-heavy practice pages into a more product-like DMV practice tool experience.

Why this was done:
- The site needed to feel like a useful tool, not a simple article list.
- Competitor-style DMV pages win by getting users into a practice loop quickly, then showing progress, explanations, saved mistakes, and official-source context.
- The monetization goal depends on longer sessions and more related page views, not only one quick visit.

Implemented:
- Homepage now has a DMV-first practice-lab hero with state launch links, no-signup messaging, and live coverage stats.
- DMV hub now has a stronger state/mode launcher and anchored sections for permit tests and road-sign pages.
- DMV tool pages now have a split hero with a practice summary panel, quick actions, official-source facts, and visible practice-mode counts.
- DMV pages now include a trust strip for source context, local-browser privacy, original questions, and last-updated date.
- Practice sections now show a four-step practice flow before the quiz.
- Road-sign-only pages now use the same practice-engine framing instead of dropping straight into a plain quiz.
- Quiz summaries now show Correct, Missed, and Left counters.
- Missed questions are saved to local browser storage by page and mode, displayed as a small mistake bank, and can be cleared by the user.
- Correctly answering a previously saved question removes it from the saved mistake bank.
- Added LearningResource structured data for DMV tool pages and BreadcrumbList structured data for generated pages.
- Added scroll-margin support so hero action anchors do not hide section headings behind the sticky header.

Validation passed locally:
- Static build succeeds.
- `content/site_data.json` parses.
- `scripts/build.py` compiles.
- `assets/app.js` syntax check passes.
- `git diff --check` passes.
- Internal local-link and anchor check found no missing targets.
- Representative pages passed desktop and mobile overflow checks at 1440px and 390px:
  - Homepage.
  - DMV hub.
  - Florida permit page.
  - Florida road-sign page.
  - AP score release page.
- CDP interaction test confirmed a wrong Florida quick-practice answer updates the score, records a missed count, writes a saved mistake to local storage, and shows the explanation.
- Screenshots reviewed:
  - Homepage desktop.
  - Florida permit page desktop.
  - Florida permit page mobile.
  - Florida practice section desktop.

## End-of-Day Checkpoint 2026-05-09

Current live project:
- Site: https://testdaytools.com
- GitHub repo: https://github.com/carmenjiang19028-ai/testdaytools
- Local workspace: `/Users/carmen/Documents/New project 3`
- Publishing: GitHub Pages from `main` branch root, with custom domain `testdaytools.com`.
- Latest pushed commit: `e2fb02c Upgrade DMV tool experience v2`.

What was completed today:
- Bought/connected the custom domain `testdaytools.com`.
- Configured DNS records for GitHub Pages:
  - `www` CNAME to `carmenjiang19028-ai.github.io`.
  - Root `@` A records to GitHub Pages IPs.
- Confirmed the site is accessible on the custom domain.
- Expanded the DMV cluster from California/New York to 7 state paths:
  - California, New York, Texas, Florida, Illinois, Pennsylvania, New Jersey.
- Added permit practice and road-sign practice pages for those state paths.
- Added 3 practice modes for permit pages:
  - Quick practice.
  - Road signs image practice.
  - Mock exam.
- Added original SVG road-sign illustrations and image-based sign questions.
- Performed a SERP/content gap pass after reviewing DMV competitor patterns.
- Performed a V2 product/UI upgrade so the site now behaves more like a practice tool.
- Pushed all changes to GitHub and verified the live site contains the V2 content.

Important live verification after push:
- `https://testdaytools.com/?deploy=e2fb02c` showed:
  - `Practice lab`
  - `Start a free DMV round`
  - `DMV practice tests with road-sign images`
- `https://testdaytools.com/florida-dmv-permit-practice-test.html?deploy=e2fb02c` showed:
  - `Saved mistakes`
  - `Practice status`
  - `Answers stay in this browser`
  - `LearningResource`
- `https://testdaytools.com/florida-dmv-road-signs-practice.html?deploy=e2fb02c` showed:
  - `Image practice engine`
  - `Saved mistakes`
  - `single-mode-tool`
  - `LearningResource`

Current technical status:
- Latest pushed commit: `e2fb02c Upgrade DMV tool experience v2`.
- Latest local checkpoint commit: `7e213e7 Record end of day project checkpoint`.
- Local branch is ahead of `origin/main` because the checkpoint memory commit has not been pushed yet.
- `git status -sb` showed `## main...origin/main [ahead 1]` before the Search Console update.
- Build source remains `content/site_data.json` plus `scripts/build.py`.
- Generated HTML pages are committed because GitHub Pages publishes the static root.
- Command-line `git push` still fails due to missing GitHub credentials:
  - `fatal: could not read Username for 'https://github.com': Device not configured`
- GitHub Desktop is the working push path. Use it or set up a GitHub token/credential helper later.

Validation completed today:
- Static build succeeds.
- JSON parses.
- Python generator compiles.
- JavaScript syntax check passes.
- `git diff --check` passes.
- Local links and same-page anchors were checked.
- Representative pages passed mobile and desktop overflow checks.
- A browser interaction test confirmed wrong answers update score, missed count, saved mistakes, local storage, and explanation text.

Strategic status:
- The project is now a DMV-first practice tool site, not a broad AP/SAT/DMV directory.
- AP and SAT pages still exist, but short-term SEO and monetization focus is DMV permit practice and road signs.
- The near-term monetization path is still AdSense, but do not apply yet.
- First priority is indexing and Search Console data, then content/UX refinement based on real impressions.

Search Console setup completed:
- Domain property `testdaytools.com` was verified with DNS TXT:
  - `google-site-verification=4tktvcmqutPVXoEsU8E1SCivL131QuQRmdf2eg3UnGI`
- Sitemap already appears submitted successfully:
  - `https://testdaytools.com/sitemap.xml`
- Search Console showed 32 discovered pages in the sitemap.
- The following priority URLs were inspected and requested for indexing:
  - `https://testdaytools.com/`
  - `https://testdaytools.com/dmv-practice.html`
  - `https://testdaytools.com/florida-dmv-permit-practice-test.html`
  - `https://testdaytools.com/florida-dmv-road-signs-practice.html`
  - `https://testdaytools.com/texas-dmv-permit-practice-test.html`
  - `https://testdaytools.com/california-dmv-permit-practice-test.html`

Next step:
- Wait for Google to crawl/index the priority pages.
- Check Search Console over the next 24-72 hours:
  - Pages report for indexed/not indexed changes.
  - Performance report for impressions and query terms.
- After early impressions appear, decide the next content expansion by real query data instead of guessing.
- Add analytics/traffic tracking only after deciding whether to use GA4, Plausible, or another lightweight option.

Do not forget:
- User wants low-maintenance, ad-friendly, English static site.
- User cares about real earning potential, not just building pages.
- Keep decisions and progress in project-memory files instead of relying on chat history.
- Avoid adding real ad code until indexing/traffic/trust signals are stronger and privacy policy is updated for ads/analytics.

## Checkpoint 2026-05-10

Current status:
- Site: https://testdaytools.com
- Repository: https://github.com/carmenjiang19028-ai/testdaytools
- Local workspace: `/Users/carmen/Documents/New project 3`
- Current branch: `main`
- Latest synced commit before this checkpoint: `3925bcf Record Search Console indexing setup`
- Local and GitHub were aligned before writing this checkpoint:
  - `git status -sb` showed `## main...origin/main`

Completed today:
- Confirmed the two memory/checkpoint commits from 2026-05-09 were pushed through GitHub Desktop.
- Confirmed `origin/main` points to `3925bcf Record Search Console indexing setup`.
- Reconfirmed that Search Console is the first traffic-analysis source for now.
- Discussed GA4 tracking:
  - GA4 is acceptable later.
  - Decision: do not install GA4 yet.
  - Reason: the site is freshly submitted for indexing and likely has little or no traffic; installing GA4 now adds code/privacy maintenance before it provides much value.

Current operating plan:
- Wait for Google indexing and first Search Console signals.
- Check Search Console after 24-72 hours for:
  - Indexed/not indexed page movement.
  - Impressions.
  - Query terms.
  - Pages receiving impressions.
- Use real Search Console data to decide the next expansion instead of guessing.
- Install GA4 only after there is measurable traffic or a clear need to analyze user behavior beyond Search Console.

Next practical tasks:
- Review Search Console Pages and Performance reports.
- If priority pages remain unindexed, inspect reasons before adding more content.
- If impressions appear, expand the DMV cluster around the exact queries and states that Google starts testing.
- Keep AdSense postponed until the site has more trust signals, more content depth, and at least early organic traction.

## Checkpoint 2026-05-10 V3 UI Upgrade

User direction:
- User said to keep working silently unless blocked or a clear milestone is complete.
- User had low confidence in the old UI because it looked too simple and not like a useful tool site.
- The goal of this pass was to make the DMV cluster feel more like a real usable practice tool, while keeping the site static and low-maintenance.

Implemented locally:
- Added a stronger DMV-first hero on the homepage.
- Added road-sign preview art to the homepage, DMV hub, and DMV tool hero panels.
- Added a state finder/filter on the homepage and DMV hub so users can quickly locate California, New York, Texas, Florida, Illinois, Pennsylvania, or New Jersey.
- Added a "Practice console" section to DMV permit pages that explains the user's task flow: choose a round, answer one at a time, review weak-area chips, confirm official rules.
- Added a "Road sign lab" console to road-sign pages so those pages feel like visual practice tools instead of plain content pages.
- Tightened tool UI styling: cleaner header, utility-style cards, stronger quiz shell, better sign image treatment, more restrained public-service/exam-tool visual language.
- Updated site last-updated date to May 10, 2026.

Validation completed:
- Static generator builds successfully.
- JSON parses.
- Python generator compiles.
- JavaScript syntax check passes.
- `git diff --check` passes.
- Link and anchor check passes.
- CDP browser layout checks passed for desktop and mobile on:
  - `index.html`
  - `dmv-practice.html`
  - `california-dmv-permit-practice-test.html`
  - `california-dmv-road-signs-practice.html`
- Mobile overflow check passed: document scroll width equals viewport width at 390px.
- Homepage state filter interaction passed: typing `tex` leaves only Texas visible.
- Quiz interaction test passed:
  - Wrong answer shows explanation.
  - Missed count updates.
  - Road Signs mode tab activates.
  - Road-sign visual prompt appears.

Current state:
- Changes are local and not yet committed or pushed.
- The local preview server was used on `127.0.0.1:8017`.
- Next step is to review final diff, commit, and push when ready.

## Checkpoint 2026-05-10 SAT Growth Sprint Foundation

User direction:
- Execute the attached "TestDayTools Strategic Growth Plan" for the current TestDayTools site.
- Focus first on site-controlled work: more useful SAT content, reusable tools, SEO structure, and technical checks.
- Do not start AdSense submission, community seeding, or GA4 unless the user confirms those account/platform actions.

Implemented locally:
- Added 10 SAT support pages:
  - `digital-sat-score-calculator.html`
  - `digital-sat-scoring-explained.html`
  - `sat-score-goal-planner.html`
  - `sat-reading-writing-score-guide.html`
  - `sat-math-score-guide.html`
  - `sat-superscore-guide.html`
  - `sat-practice-test-review-template.html`
  - `sat-study-plan-by-score-gap.html`
  - `sat-test-day-timing-guide.html`
  - `sat-device-troubleshooting-guide.html`
- Added two reusable static SAT widgets:
  - Digital SAT score planning estimator.
  - SAT score goal planner.
- Expanded each new SAT page to substantial guide depth with quick facts, tables, action sections, FAQ, official-source links, and related internal links.
- Updated the SAT hub to prioritize the calculator, goal planner, scoring guides, study guides, and test-day readiness pages.
- Updated the homepage SAT section so the new SAT tools are easier to discover.
- Regenerated `sitemap.xml` and all affected static pages.

Validation completed:
- Static generator builds successfully.
- JSON parses.
- Python generator compiles.
- JavaScript syntax check passes.
- `git diff --check` passes.
- Internal link and JSON-LD validation passes across all 42 generated HTML pages.
- Local browser checks passed on desktop and mobile widths for:
  - `index.html`
  - `sat-tools.html`
  - `digital-sat-score-calculator.html`
  - `sat-score-goal-planner.html`
  - `sat-reading-writing-score-guide.html`
- SAT calculator interaction test passed.
- SAT goal planner interaction test passed.

Not done yet:
- No GA4 tracking installed. User previously decided to wait until there is traffic.
- No AdSense application submitted. The site still needs indexing and early traffic signals first.
- No Reddit/Quora/Discord community seeding performed. This needs user/account confirmation.

## Checkpoint 2026-05-12 Search Console First Signal

Search Console status checked manually in the user's logged-in Chrome account:
- Property: `testdaytools.com`
- Time range viewed: 3 months
- Search performance:
  - Clicks: 0
  - Impressions: 1
  - CTR: 0%
  - Average position: 81
- First visible query:
  - `regulatory traffic signs florida`
- Matching page:
  - `https://testdaytools.com/florida-dmv-road-signs-practice.html`
- Country/device:
  - United States
  - Desktop
- Sitemap:
  - `https://testdaytools.com/sitemap.xml`
  - Status: success
  - Discovered pages: 42
- Indexing:
  - Indexed pages: 0
  - Not indexed pages: 6
  - Reason 1: alternate page with proper canonical tag, 1 URL, `http://testdaytools.com/`; this is expected because HTTP canonicalizes to HTTPS.
  - Reason 2: crawled, currently not indexed, 5 URLs:
    - `https://testdaytools.com/california-dmv-permit-practice-test.html`
    - `https://testdaytools.com/texas-dmv-permit-practice-test.html`
    - `https://testdaytools.com/florida-dmv-permit-practice-test.html`
    - `https://testdaytools.com/dmv-practice.html`
    - `https://testdaytools.com/`

Decision made:
- Do not expand broadly yet.
- Do not apply for AdSense yet.
- Use the first real query signal to strengthen the Florida road-sign page before asking Google to reconsider indexing.

Implemented locally:
- Retitled `florida-dmv-road-signs-practice.html` from generic Florida road signs to `Florida Regulatory Traffic Signs Practice Test`.
- Updated the page meta description, H1, hero copy, image quiz heading, sign-library heading, sign-study section, weak-area table, FAQ, and internal links to align with `Florida regulatory traffic signs`.
- Added explanatory copy for what counts as a Florida regulatory traffic sign, including stop, yield, do not enter, wrong way, one way, speed limit, no U-turn, and do not pass signs.
- Regenerated static HTML. Related homepage, DMV hub, and Florida permit-page links now use the new title/description.

Validation completed:
- Static generator builds successfully.
- `content/site_data.json` parses.
- `scripts/build.py` compiles.
- `assets/app.js` syntax check passes.
- `git diff --check` passes.
- HTML metadata and JSON-LD validation passes across all 42 HTML files.
- Internal link check passes across all 42 HTML files.

Current caution:
- The local worktree still contains unrelated dirty/untracked e-commerce tool files from an older task, including `README.md`, `tools/`, `examples/`, `articles/`, `go/`, and `LICENSE`.
- Do not commit or push everything blindly.
- For the next TestDayTools commit, stage only relevant files unless the unrelated files are intentionally cleaned or moved first.

## Checkpoint 2026-05-12 Road Signs Hub Expansion

Goal:
- Move the site closer to AdSense-readiness by making the DMV section feel more like a useful tool system and less like isolated pages.
- Strengthen the road-sign topic because Search Console's first real query signal was `regulatory traffic signs florida`.

Implemented locally:
- Added a new generic page: `/road-signs-practice-test.html`.
- Added a 24-question image-based road signs quiz covering regulatory traffic signs, warning signs, railroad signs, school/pedestrian signs, work-zone signs, guide/service signs, and test strategy.
- Added a sign-shape/color study guide and a grouped road-sign library.
- Linked the new generic road-sign page from the homepage hero, homepage popular tools, DMV hub, sitemap, and related DMV pages.
- Updated related links on state DMV pages so road-sign traffic can flow from generic intent to state-specific practice pages.
- Fixed the single-mode DMV quiz renderer so pages no longer emit duplicate `id="practice"` anchors.

Strategic note:
- This is a better next step than expanding to more states because it consolidates the first validated topic and improves internal linking with low maintenance cost.
- Do not apply for AdSense yet. First request indexing for the new road-sign page and the strengthened Florida regulatory signs page, then wait for Search Console indexing and query movement.

## Checkpoint 2026-05-12 DMV-First Monetization Reframe

Goal:
- Move the site closer to the long-term goal: natural search traffic that can eventually support ad revenue.
- Treat the project as a DMV-first tool site instead of a broad AP/SAT/DMV portal.

Implemented locally:
- Retitled the homepage around `Free DMV Practice Tests and Road Signs Practice`.
- Added `Road Signs` to the main navigation.
- Added a new page: `/regulatory-traffic-signs-practice-test.html`.
- Added a 12-question image quiz for regulatory signs: stop, yield, do not enter, wrong way, speed limit, one way, no U-turn, and do not pass.
- Added regulatory sign study guidance, FAQ, source links, and related links into the road-sign cluster.
- Updated the DMV hub so users can start with road signs, regulatory signs, or state-specific permit practice.

Strategic note:
- This is a topic-architecture change, not a cosmetic redesign.
- The intended SEO cluster is now:
  - `/road-signs-practice-test.html`
  - `/regulatory-traffic-signs-practice-test.html`
  - `/florida-dmv-road-signs-practice.html`
  - state DMV road-sign pages
- AP and SAT remain as support sections, but DMV/road signs should be the primary growth path until Search Console proves another direction.

## Checkpoint 2026-05-12 Practice Workspace Refactor

Goal:
- Respond to the product critique that the site still looked like an SEO page collection, not a real useful tool site.
- Make the first screen behave like a DMV practice workspace with immediate user action.

Implemented locally:
- Replaced the homepage and DMV hub hero-side launcher with a practice workspace.
- Added a four-question road-sign diagnostic directly in the first viewport.
- Added a state selector that routes users to the selected state's permit practice and road-sign practice pages.
- Added direct mode links for road signs, regulatory signs, and state practice paths.
- Added JavaScript for mini-diagnostic scoring, answer feedback, and dynamic state route links.
- Added responsive styling for the new workspace, choices, controls, and route cards.

Validation completed:
- Static generator builds successfully.
- `scripts/build.py` compiles.
- `assets/app.js` syntax check passes.
- `git diff --check` passes.
- HTML metadata, JSON-LD, sitemap count, and local-link validation passes across all 44 HTML files.

Strategic note:
- This is a usability refactor, not just more content.
- Next meaningful product step is to expand the first-viewport diagnostic into a reusable adaptive practice component that can power state pages, road-sign pages, and weak-area review without requiring high maintenance.

## Checkpoint 2026-05-12 Practice Function Expansion

Goal:
- Expand real functionality so TestDayTools feels more like a usable DMV practice tool and less like static SEO content.
- Improve repeat use, session depth, and weak-area review without creating high-maintenance one-off features.

Implemented locally:
- Added a practice control toolbox to every generated quiz.
- Added focus-area filtering by question category.
- Added a saved-mistakes review mode that loads only questions missed on the current device.
- Added shuffle for the active focus area.
- Added a 10-minute practice timer.
- Added a question navigator with answered, correct, wrong, and active states.
- Updated quiz scoring so filtered rounds show progress for the current focus area.

Validation completed:
- Static generator builds successfully.
- `scripts/build.py` compiles.
- `assets/app.js` syntax check passes.
- `git diff --check` passes.
- HTML metadata, JSON-LD, sitemap count, and local-link validation passes across all 44 HTML files.
- Browser interaction test on `road-signs-practice-test.html` verified filter options, question navigation, shuffle, timer start, answer feedback, wrong-answer state, and saved-mistakes review mode.

Strategic note:
- This feature set should raise engagement across all DMV pages because it upgrades the shared practice engine instead of one page at a time.
- Next useful step is to make the homepage mini diagnostic hand off into a pre-filtered practice round, then add a lightweight progress summary on return visits.

## Checkpoint 2026-05-12 Diagnostic Handoff and Return Path

Goal:
- Turn the homepage mini diagnostic into a real practice handoff instead of a dead-end teaser.
- Give return visitors a simple way to continue the last practice round saved on their device.

Implemented locally:
- Added focus metadata to each homepage and DMV hub mini diagnostic question.
- Updated the mini diagnostic CTA so missed signs route into `/road-signs-practice-test.html?focus=...#practice`.
- Added URL focus handling to generated quiz pages so a `focus` query parameter preselects the matching category.
- Added lightweight local progress storage after answered quiz questions.
- Added a recent-practice block to the homepage and DMV hub practice workspace.

Validation completed:
- Static generator builds successfully.
- `scripts/build.py` compiles.
- `assets/app.js` syntax check passes.
- `git diff --check` passes.
- HTML metadata, JSON-LD, sitemap count, and local-link validation passes across all 44 HTML files.
- Browser interaction test verified: a missed homepage stop-sign question routes to the regulatory-signs focus round, the road-sign quiz opens filtered to 5 regulatory-sign questions, answered progress is saved, and the homepage return card updates to continue that focused round.

Strategic note:
- This improves the visit loop: answer a visible diagnostic, enter the matching drill, then return directly to the saved round.
- Next useful step is to add one more high-intent tool surface, likely a DMV test-day readiness checklist or a state/manual finder, before adding more low-intent article pages.

## Checkpoint 2026-05-12 DMV Test-Day Checklist Tool

Goal:
- Add a high-intent DMV tool surface that helps visitors finish a real task before permit-test day.
- Combine a state official-source finder with a saved readiness checklist, instead of adding another generic article.

Implemented locally:
- Added `/dmv-test-day-checklist.html`.
- Added the page to top navigation, homepage hero CTA, homepage start cards, homepage high-value list, homepage DMV tool group, DMV hub hero CTA, DMV hub permit-test section, and sitemap.
- Added an interactive state selector for California, New York, Texas, Florida, Illinois, Pennsylvania, and New Jersey.
- Added official-source links, state permit-practice links, and state road-sign links for each selector state.
- Added a browser-saved readiness checklist with progress score, next-step text, reset, and last-state persistence.
- Added dedicated styling for the checklist, source panel, readiness score, and action links.

Validation completed:
- Static generator builds successfully.
- `scripts/build.py` compiles.
- `assets/app.js` syntax check passes.
- `git diff --check` passes.
- HTML metadata, JSON-LD, sitemap count, and local-link validation passes across all 45 HTML files.
- Browser interaction test verified: selecting Florida updates the official source and state links, checking two items saves `29%` readiness progress, reload restores Florida and the checked items, and homepage checklist links render in nav, hero, and workbench.

Strategic note:
- This page supports high-intent queries such as DMV test day checklist, permit test checklist, what to bring to DMV test, and state driver manual finder.
- It also improves internal flow by sending users from final-readiness mode back into state practice and road-sign drills.

## Checkpoint 2026-05-12 DMV Checklist Reverse Links

Goal:
- Make state DMV landing pages hand visitors into the final-readiness checklist instead of leaving the checklist isolated.
- Improve internal circulation from search-entry permit and road-sign pages into one saved, high-intent tool.

Implemented locally:
- Added a `Test-day checklist` hero action to each supported state permit page and each supported state road-sign page.
- Added a `Before test day` bridge section to supported state pages with three actions: state checklist, paired practice page, and official source.
- Added `?state=` support to `/dmv-test-day-checklist.html` so incoming state links preselect the correct manual and checklist state.
- Kept generic DMV road-sign pages unchanged except for shared script/style support.

Validation completed:
- Static generator builds successfully.
- `scripts/build.py` compiles.
- `assets/app.js` syntax check passes.

Strategic note:
- This strengthens the site as a tool network: state pages now lead to a practical next step, and the checklist sends users back to practice.
- Next useful step is to verify the state-preselected checklist behavior in a browser and then commit/push this internal-linking layer separately.
