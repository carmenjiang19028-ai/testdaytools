# TestDayTools Growth Action - 2026-09-01

## Decision

Move the SAT dates search entry from the closing September 12 registration window to the October 3 window, and keep the August SAT traffic page useful through score release.

This was chosen because the latest readable GSC 28-day window ended 2026-08-29 with 61 clicks and 10,570 impressions (0.6% CTR, average position 26.6). That is about 2.18 clicks per day. The SAT dates page had 987 impressions but only 1 click, while the August SAT page remained the largest entry with 24 clicks and 4,059 impressions.

## Data quality

- GSC: authenticated report readable through 2026-08-29.
- GA4: a fresh Organic Search-only report could not be read because the authenticated browser session detached. The last reliable GA4 snapshot remains complete through 2026-08-18, so no new funnel or product-value claim is made here.
- Recent 24-hour GSC comparison was not readable in this run and is intentionally omitted.
- Official deadline source: College Board lists October 3, 2026 with a September 18 regular deadline and September 22 late deadline.

## Changes

- `sat-test-dates-2026-2027.html`
  - Title, description, H1, deadline facts, countdown, decision cards, and official action now lead with October 3.
  - September 12 remains in the full schedule, with copy explaining that registration closes after September 1.
- `sat-august-22-2026-planning.html`
  - Keeps the September 4 score-release intent.
  - Static retake guidance now prioritizes October and later dates after the September registration window.
  - The primary hero action now points to the actual planner anchor (`#sat-date-planner`).
- `sat-tools.html` and generated cross-links now use the current October wording.

## Verification

- Static build completed.
- JSON, Python, JavaScript, and diff checks passed.
- Playwright verified the October title/H1, countdown, official College Board link, fixed hero anchor, and an October 3 planner result when the date is simulated as September 2.
- Desktop and 390px mobile checks found no horizontal overflow; screenshots were visually reviewed.

## Measurement window

- Quick read: after 7 complete GSC days, only check whether October deadline queries and clicks begin replacing expired September intent.
- Decision read: compare equal 14-day windows after GSC is complete, no earlier than 2026-09-16.
- Initial pass signal: at least 3 clicks or page CTR of at least 0.4% without a material loss of impressions. Do not change the title again from a one-day fluctuation.
- Refresh GA4 Organic Search before judging planner generation, second actions, or return behavior.

## Revenue implication

At 2.18 organic clicks per day, TestDayTools still needs about 4.6 times its current search traffic to reach 10 clicks per day. AdSense code is not the current bottleneck; qualified, durable search demand is.
