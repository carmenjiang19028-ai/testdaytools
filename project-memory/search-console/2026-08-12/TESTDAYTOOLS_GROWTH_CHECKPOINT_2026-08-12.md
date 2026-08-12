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
