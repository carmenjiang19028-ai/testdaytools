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

As of this memory file:
- A separate code worker agent named "Kuhn" was spawned to build the MVP static site.
- The worker was asked to implement the pages, reusable templates, data configuration, SEO basics, and ad placeholders.
- Parent agent should review worker output before finalizing.

## Next Actions

1. Let the code worker finish the first implementation.
2. Review the generated site structure and content.
3. Run build/check commands.
4. Open the site locally and visually inspect important pages.
5. Fix layout, SEO metadata, and content gaps.
6. Decide domain name.
7. Publish to GitHub Pages or another static host.
8. Submit to Google Search Console.
9. Track 30/60/90-day performance.
