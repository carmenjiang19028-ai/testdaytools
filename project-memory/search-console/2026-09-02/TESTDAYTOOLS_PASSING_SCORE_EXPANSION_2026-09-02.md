# TestDayTools Passing-Score Expansion - 2026-09-02

## Decision

Expand the existing passing-score calculator from 7 to 11 verified state paths without changing its title, description, or canonical URL.

The page is indexed and has enough exposure for a content-depth decision: the latest complete 28-day GSC window ended 2026-08-30 with 397 impressions, 0 clicks, and average position 30.4. The visible queries already match the page's title, including `dmv test passing score`, `permit test pass rate`, and variants of `what score do you need to pass your permit test`. This is a ranking and coverage problem, not an indexing problem or a reason to rewrite the title again.

## Current Site Baseline

- GSC complete through 2026-08-30: 61 clicks, 10,487 impressions, 0.6% CTR, average position 26.6.
- Current pace: about 2.18 organic clicks per day.
- Gap to 10 clicks per day: about 4.6x.
- GA4 complete through 2026-09-01, filtered to `Session primary channel group = Organic Search`: 86 sessions, 50 engaged sessions, and $0 revenue.
- The score calculator has one organic `score_tool_entry_click`, but no visible organic `dmv_score_checked` or `score_direct_answer_click` yet.

## SERP Gap

Current search results include direct-answer articles and calculators with broader state coverage, including an all-50-state calculator. TestDayTools already has a strong exact-intent title and useful calculator, but only seven static state answers. The shortest evidence-backed content move is to add states for which a current official source gives a clear rule.

North Carolina and Michigan were not added. Their currently reviewed official pages did not expose a sufficiently clear current non-commercial question-count and passing-score pair for an exact miss-limit answer.

## Added State Answers

- Georgia: two 20-question parts, 15 correct required on each, so up to 5 misses on each part.
  - Source: https://dds.georgia.gov/testing-and-training/test-and-exams-information
- Ohio: 40 questions, 75% required, so 30 correct and up to 10 misses.
  - Source: https://www.bmv.ohio.gov/dl-gdl.aspx
- Virginia: all 10 sign questions correct, then 24 of 30 general questions, so 0 sign misses and up to 6 general misses.
  - Source: https://www.dmv.virginia.gov/licenses-ids/exams/know-exam
- Arizona: 30 questions, 80% required, so 24 correct and up to 6 misses.
  - Source: https://azdot.gov/mvd/services/driver-license-ID/permit-test

Each matching state road-sign page now includes a contextual related-tool link to the calculator. The calculator's visible update date and sitemap lastmod are 2026-09-02.

## Verification

- Static build completed.
- Python compile, JSON parse, JavaScript syntax, and diff checks passed.
- Generated page contains 11 calculator options and 11 state-answer sections.
- All JSON-LD blocks parse successfully.
- Desktop 1440x900 and mobile 390x844 browser checks show no horizontal overflow.
- Selecting Virginia renders the special two-part rule correctly: 30 general questions, 24 correct, `0 signs; 6 general`.
- The four new state pages contain contextual links to the passing-score calculator.

## Measurement Window

- Do not change the calculator title or description before 2026-09-09.
- Quick check after 7 complete GSC days: look for Georgia, Ohio, Virginia, or Arizona passing-score and can-miss query impressions.
- Decision check after 14 complete GSC days, no earlier than 2026-09-16.
- Initial pass signal: at least 20 impressions from the four new state-intent groups, or page average position improves from 30.4 to 25 or better without losing total impressions.
- Do not call the expansion a product-value win until organic `dmv_score_checked` or `score_direct_answer_click` appears from more than one user.

## Revenue Implication

This is an acquisition-depth action, not an advertising action. At 2.18 organic clicks per day and $0 measured revenue, installing more ad code would not solve the economic bottleneck. The immediate job remains increasing durable search entry volume while preserving official-source accuracy.
