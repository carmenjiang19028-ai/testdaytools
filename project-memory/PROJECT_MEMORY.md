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
