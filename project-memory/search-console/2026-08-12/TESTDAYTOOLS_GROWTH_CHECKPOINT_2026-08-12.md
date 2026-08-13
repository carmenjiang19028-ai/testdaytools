# TestDayTools Growth Checkpoint - 2026-08-12

## Data availability

- Google Search Console latest complete day: 2026-08-09.
- The live 90-day GSC view was updated about six hours before this checkpoint.
- GA4 latest complete day used for the operating baseline: 2026-08-10.

## Current search baseline

### Last 28 days

- 47 clicks
- 5,616 impressions
- 0.8% CTR
- 33.2 average position
- 1.68 organic clicks per day
- Gap to the 10-click-per-day operating target: 5.95x

### Latest complete 7 days: 2026-08-03 to 2026-08-09

- 18 clicks
- 1,255 impressions
- 1.4% CTR
- 31.0 average position

The earlier 2026-08-01 to 2026-08-07 comparison showed 17 clicks / 1,373 impressions / 1.2% CTR / 34.0 average position versus 10 / 1,554 / 0.6% / 35.5 in the preceding equal window. Click efficiency and ranking improved, but impression coverage did not expand.

### Live 90-day context

- 94 clicks
- 15,275 impressions
- 0.6% CTR
- 33.3 average position

Top visible queries remain dominated by road-sign intent. The visible query set included `road signs for permit test`, `road signs permit test`, `permit test signs`, `dmv road signs test`, `traffic signs test`, `road sign practice test`, and `road signs quiz`.

## Product baseline

GA4 Organic Search for 2026-08-04 to 2026-08-10:

- 28 sessions
- 12 engaged sessions
- 42.86% engagement rate
- 3m 40s average engagement time

The product-value signal is stronger than the acquisition signal. The site is capable of producing meaningful interaction after a qualified visitor lands, while search coverage and first-page ranking remain the main constraints.

## Current page decisions

### New York road signs

The 2026-08-01 to 2026-08-07 window reached 7 clicks / 282 impressions / 2.5% CTR / 19.3 average position, compared with 6 / 353 / 1.7% / 27.6. It crossed the predeclared position-under-20 line. Keep the page indexed and do not merge it into the generic road-sign page.

### Generic road-sign practice

The same window reached 3 clicks / 59 impressions / 5.1% CTR / 19.2 average position, compared with 0 / 47 / 0% / 21.3. It improved, but the 25.5% impression gain remained below the 30% hard line and average position remained outside the top 15. Do not change the title before the full equal-window review.

### SAT dates

The same window reached 1 click / 247 impressions / 0.4% CTR / 34.7 average position, compared with 0 / 235 / 0% / 34.8. The planner has not yet produced enough Organic Search events for a conversion judgment.

### August 22 SAT page

- Indexed before the August window.
- Latest known page baseline: 0 clicks / 16 impressions / average position 13.0.
- The August 11 late-registration deadline has passed; the page's live tool already switches to preparation status and routes unregistered users to the September backup date.
- Keep the title and indexed body frozen through the next complete-data read. The homepage now routes registered students to this page using post-deadline wording.

### DMV answer tools

`dmv-permit-test-question-of-the-day.html`, `dmv-permit-test-study-plan.html`, and `dmv-permit-test-passing-score-calculator.html` were recognized and indexed by Google on 2026-08-11. Do not repeat indexing requests or rewrite their titles before first-query evidence appears.

## Distribution status

- MERLOT: public and Google-indexed.
- OER Commons: still pending at the latest checked state.
- Library outreach: no confirmed public link yet.
- GSC external links: still 0 at the latest checked state.
- Second library batch was sent on 2026-08-09; do not follow up before five business days and allow at most one targeted follow-up after seven business days.

## Next decision gate

Run the full equal-window review when GSC has a complete post-release window. Do not treat 2026-08-12 as a 14-day result because GSC is complete only through 2026-08-09.

Pass or stop rules:

1. Generic road-sign page: pass if average position enters the top 15, or impressions rise at least 30% without ranking deterioration.
2. New York page: retain the win if average position remains inside 20 or impressions rise at least 30% without ranking deterioration.
3. August SAT page through August 22: require at least 50 cumulative impressions and either 3 clicks or 4% CTR, with average position no worse than 12. If it remains near page one but does not reach 50 impressions, stop expanding the topic and classify demand as small.
4. SAT date planner: do not judge conversion until Organic Search records at least 10 `sat_plan_generated` events. Then require at least 20% second-action rate and 10% save or download rate.
5. Newly indexed DMV tools: first require impressions and query discovery. Do not optimize CTR before a query reaches enough impressions and an actionable position.

## Operating decision

No additional title or body change is justified today. The shortest growth action already shipped on 2026-08-12: homepage internal traffic was reallocated toward New York road signs and the August SAT page, with `home_priority_path_click` measurement. The next action must be selected from the equal-window page and query data, not from a single daily movement.

## 2026-08-12 follow-up release

Commit `8c26f64` strengthened the remaining August SAT window without changing the indexed page's title or body:

- promoted the August 22 SAT planner to the first action in `sat-tools.html`;
- added a contextual related-tool link from `sat-test-day-timing-guide.html`;
- added a contextual related-tool link from `sat-device-troubleshooting-guide.html`;
- increased distinct internal source pages for the August SAT URL from seven to ten;
- preserved the existing title/body experiment and its page-level attribution boundary;
- verified all 63 pages for title, one H1, canonical, and internal-link integrity;
- verified the SAT hub at 1440px and 390px with no horizontal overflow or browser errors;
- confirmed GitHub Pages deployment and submitted the three source pages plus the target URL to IndexNow (HTTP 200).

Do not add another internal-link or title change before the next complete GSC read. The August SAT stop rule remains cumulative 50 impressions plus either 3 clicks or 4% CTR, with average position no worse than 12 through August 22.

## 2026-08-12 evergreen score-intent release

Commit `49cd3c4` created a separate evergreen acquisition experiment for the newly indexed permit-test passing-score calculator. It does not change the title, description, canonical, H1, or body of the road-sign, New York, or August SAT pages under observation.

- Renamed the site-wide navigation command from the generic `Score` to the user question `Can I miss?` and sends that click directly to the calculator.
- Sends the mobile home score tab directly to the calculator rather than its page top.
- Added five first-screen answer paths on the calculator page: Florida, New York, New Jersey, Pennsylvania, and a variable-length calculator path.
- Added `score_tool_entry_click` for internal acquisition and `score_direct_answer_click` for state-answer selection; retain the existing `dmv_score_checked` event for calculator completion.
- Preserved the calculator page's indexed title and H1 so first-query evidence remains attributable to the August 9 content release.
- Verified 63 HTML pages for one title, one H1, one canonical, and valid internal HTML targets.
- Verified the score page and site navigation at 1440x1000 and 390x844 with no horizontal overflow or browser errors.
- Confirmed GitHub Pages deployment and IndexNow acceptance for the homepage and score calculator (HTTP 200).

Judgment window:

1. Indexing gate: the calculator must remain indexed and begin receiving query impressions; do not infer failure before GSC has a complete post-release window.
2. Acquisition gate: in GA4 Organic Search, look for `score_tool_entry_click`, then `dmv_score_checked`. Treat the latter as the primary useful-action event.
3. Product gate: after at least 10 Organic Search sessions on this page, require at least 20% to fire `dmv_score_checked`; use `score_direct_answer_click` only as a diagnostic step, not the conversion.
4. Search gate: after at least 50 page impressions, separate queries by average position. If a `how many can I miss` or state passing-score query reaches position 20 or better but CTR remains below 1%, then test the title. If average position stays worse than 25, improve query coverage or authority instead of blaming CTR.
5. Stop rule: if the page remains indexed but receives fewer than 20 impressions by 2026-08-23, treat discovery as weak and audit contextual authority from DMV/state pages before adding more copy or another overlapping URL.

## 2026-08-12 classroom-resource release

Commit `b2f6678` upgraded the existing printable road-sign page into a more complete education resource without changing its indexed title, description, canonical, or H1.

- Added a separate three-page US Letter PDF with an eight-sign recognition worksheet, eight driver-action questions, a facilitator answer key, and a 10-minute teaching plan.
- Kept the existing cheat-sheet PDF and URL intact; the new classroom pack is an additional download, not a replacement or competing HTML page.
- Added two visible download paths and records both with `resource_download`, using `resource=dmv_road_signs_classroom_worksheet_pdf` and `target=/dmv-road-signs-classroom-worksheet.pdf`.
- Expanded the page's `LearningResource` metadata to describe a cheat sheet, worksheet, answer key, classroom review, and instruction while retaining the existing educational-use license URL.
- Updated the page date and sitemap date to 2026-08-12.
- Verified all three PDF pages by rendered-image review and text extraction; the final PDF is 71,390 bytes, Letter size, unencrypted, and contains no JavaScript.
- Verified the live page at 1440x1000 and 390x844 with no horizontal overflow or browser errors; verified the PDF response as HTTP 200 `application/pdf` and verified the real browser download plus GA4 event payload.
- Confirmed GitHub Pages deployment and submitted the resource page and PDF to IndexNow (HTTP 200).

Judgment window:

1. Keep the existing cheat-sheet title frozen. The classroom pack is a distribution and usefulness experiment, not a new keyword page.
2. In GA4, separate `dmv_road_signs_classroom_worksheet_pdf` from the existing cheat-sheet PDF. Report Organic Search and Referral independently, and do not count owner testing as demand.
3. After at least 10 qualified landing sessions on the resource page, use classroom-pack download rate as the primary product signal. A 10% or greater rate is the initial usefulness threshold.
4. Treat a public educator/library link, a non-owner MERLOT/OER/library Referral, or the first GSC external-link record as stronger validation than raw PDF downloads.
5. Do not create another printable asset before this one is used in the next eligible targeted follow-up. The immediate constraint is distribution, not the number of files available.

## 2026-08-12 classroom-PDF discovery release

Commit `bff9348` added an explicit HTML `<link rel="alternate" type="application/pdf">` from the canonical resource page to the classroom worksheet PDF. This provides a machine-readable discovery path in addition to the two visible download links, without creating another indexable HTML URL or changing the resource page title, description, canonical, H1, or body experiment.

- Verified all 63 HTML pages after regeneration; title, one H1, canonical, and internal targets remained valid.
- Confirmed the alternate PDF link on the live GitHub Pages deployment.
- Submitted the resource page and classroom PDF to IndexNow again after the discovery link was live (HTTP 200).
- A focused live search of the first- and second-batch library domains did not find a public TestDayTools link as of this check. This only rules out a currently discoverable public link; it does not establish whether a librarian replied privately.
- Gmail's signed-in search did not return a reliable readable state during this run, so no follow-up was sent without current reply/bounce evidence. Preserve the one-follow-up limit and recheck the mailbox before any message.

## 2026-08-12 first-batch final follow-up

The Gmail state became reliable later in the same operating day and was checked before any external action:

- A focused sender search returned no replies from Ellsworth, Somerset, London, Richard Sugden, or Atglen.
- A focused mailer-daemon search returned no bounce involving those five addresses.
- Sent Mail confirmed the three first-batch messages to Ellsworth, Somerset, and London were sent on 2026-07-31 at 22:00 and had not previously been followed up.
- Live public-domain searches still did not show a TestDayTools link on the first- or second-batch library sites.

At 19:56-19:59 Asia/Shanghai on 2026-08-12, one reply was sent in each original first-batch thread:

1. Ellsworth Public Library, `cherfindahl@ellsworthlibrary.org`.
2. Somerset Public Library, `mrua-larsen@sailsinc.org`.
3. London Public Library, `mwood@mylondonlibrary.org`.

Each message described only the material upgrade since the original note: the three-page student worksheet, eight driver-action questions, facilitator answer key, 10-minute teaching plan, no-sign-up access, and noncommercial educational sharing permission. Each message explicitly said no reply was needed if the resource was not a fit and that TestDayTools would not follow up again.

Operating boundary:

- Do not send another message to these three recipients, regardless of silence.
- Monitor only replies, bounces, public page changes, qualified Referral, and GSC external links.
- The second batch sent 2026-08-09 remains untouched until its own seven-business-day window; do not reuse the first-batch timing.

## 2026-08-13 August SAT time-intent pivot

The latest complete GSC date remains 2026-08-09, so the established equal-window page judgments are unchanged. Fresh last-24-hours data provided a narrower, time-sensitive signal:

- all site: 1 click / 224 impressions / 0.4% CTR / 30.3 average position;
- `sat-august-22-2026-planning.html`: 0 clicks / 34 impressions / 0% CTR / 10.0 average position;
- the visible page query was `august 22 sat time`;
- College Board's official August 22 page lists 7:45 a.m. local, while its general test-day schedule says the admission ticket is authoritative for the exact address and arrival instruction.

This is a search-intent phase change rather than enough evidence to declare a general CTR failure. The August 11 registration deadline has expired, but the indexed URL is now close to page one for a current test-time query. The existing URL was therefore updated instead of creating a competing page:

- title and H1: `August 22 SAT 2026: Test Time, Ticket & Checklist`;
- description and first screen now lead with arrival time, admission ticket, Bluebook setup, physical ID, device, and route checks;
- expired registration actions now route missed-deadline users to the September 12 backup date;
- the official action links to College Board's August 22 date page;
- a direct time answer and matching FAQ were added from official sources;
- GA4 `study_next_step_click` now records `action=official_august_sat_time` for the official-time path;
- the canonical URL remains unchanged and no competing August SAT URL was created.

Verification completed before release:

- static build, JSON parse, Python compile, JavaScript syntax, and `git diff --check` passed;
- all 63 HTML pages retained exactly one title, one H1, one canonical, and valid internal HTML targets;
- desktop 1440x1000 and mobile 390x844 checks returned HTTP 200, no browser errors, no horizontal overflow, and the expected official link and backup guidance;
- sitemap `lastmod` for the target URL is 2026-08-13.

Judgment boundary:

1. Do not change this page's title or body again before at least 48 hours of complete post-release GSC data are available.
2. Through August 22, retain the existing pass line: at least 50 cumulative impressions and either 3 clicks or 4% CTR, with average position no worse than 12.
3. Separate `august 22 sat time`, ticket, arrival, Bluebook setup, and expired registration queries. The pivot passes only if current test-day intent gains clicks or qualified engagement; impressions alone are not enough.
4. In GA4 Organic Search, check `sat_august_plan_generated`, `sat_august_plan_saved`, `resource_download` with `resource=sat_august_2026_timeline`, and `study_next_step_click` with `action=official_august_sat_time`. Do not judge conversion before 10 landing sessions.
5. After August 22, reuse the same URL for the September 4 score-release and retake-decision phase; do not create an overlapping score-date URL.

## 2026-08-13 California state-value release

Latest complete GSC date is 2026-08-10. The latest equal seven-day windows show a real efficiency gain but not broad coverage growth:

- All site: 20 clicks / 1,325 impressions / 1.5% CTR / 31.6 average position, versus 8 / 1,622 / 0.5% / 36.6. Clicks rose 150% and ranking improved 5 positions, while impressions fell 18.3%.
- Generic road-sign page: 5 clicks / 61 impressions / 8.2% CTR / 20.7 position, versus 0 / 49 / 0% / 23.6. Picture-practice intent is now a validated direction even though impressions grew 24.5%, just below the prior 30% hard line.
- California road-sign page: 1 click / 53 impressions in the latest seven days, versus 0 / 49. GA4's unfiltered seven-day page card also showed California as the most-viewed page with 10 views; this is directional only, not an Organic Search conversion claim.
- New York: 6 clicks / 228 impressions / 2.6% CTR / 21.1 position, versus 3 / 348 / 0.9% / 27.1. Most current clicks come from broad road-sign queries rather than New York-specific terms, so New York does not justify cloning the same page into more states.
- Twenty-eight-day site total: 48 clicks / 5,615 impressions / 0.9% CTR / 33.1 position, about 1.71 clicks per day and still about 5.8 times short of 10 clicks per day.
- GA4 with Session primary channel group = Organic Search for the latest 28-day report: 61 sessions, 36 engaged sessions, 59.02% engagement rate, 2m28s average engagement per session, 6.34 events per session, 387 events, and USD 0 revenue. Acquisition volume, not basic on-site engagement, remains the main constraint.

Release boundary:

- Keep the indexed California title and H1 unchanged.
- Expand the shared California image bank from 20 to 28 original sign questions.
- Add a separate five-question, five-color California curb checkpoint using current California DMV handbook rules for white, green, yellow, red, and blue curbs.
- Replace the stale fixed 36-question / 30-correct statement with the current official 80% passing rule and tell users to confirm the exact format for their applicant path.
- Add direct California DMV sources for colored-curb rules and additional road-sign testing materials.
- Track the curb checkpoint through existing quiz events with `mode=ca-curb-checkpoint`; track the full image round with `mode=signs`; track the page PDF with `resource=ca_road_signs_pdf`.

Evaluation boundary:

- Before 2026-08-27, confirm deployment, crawl, event parameters, and usability only. Do not change the California title or copy from a short sample.
- On or after 2026-08-27, compare equal 14-day page windows. Pass if California reaches at least 2 clicks and either impressions grow 30% without ranking loss or average position improves at least 5 positions; treat the current 1 click / 53 impressions latest-seven-day result as a directional baseline, not a release baseline.
- Only judge product behavior after at least 10 Organic Search California quiz starters. Then require at least 25% of starters to reach halfway, at least 10% to complete, and at least 15% to produce a second tool action such as switching mode or downloading the PDF.
- Do not build another state page from this release. If California gains only broad road-sign queries, strengthen the generic-to-state routing; if it gains California-specific curb or sign queries, deepen this existing URL before considering another state.
