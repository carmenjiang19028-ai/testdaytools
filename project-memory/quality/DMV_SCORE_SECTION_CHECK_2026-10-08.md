# DMV Score Calculator Section Checks

Date: 2026-10-08
Scope: existing passing-score calculator correctness, not a search-title experiment.

## Verified Problem

The calculator checked only the primary score. It could show a full-target result when an additional road-sign condition was missing or failed. Invalid or fractional input was silently clamped. Pennsylvania's rounded percentage could overstate a custom-length target.

## Official Rules Rechecked

- New York: at least 14 of 20 overall, including at least 2 of 4 road signs. Source: https://dmv.ny.gov/book/export/html/1556
- Georgia: at least 15 of 20 in each of Road Rules and Road Signs. Source: https://dds.georgia.gov/testing-and-training/test-and-exams-information
- Virginia: all 10 road signs, plus at least 24 of 30 general questions. Source: https://www.dmv.virginia.gov/licenses-ids/exams/know-exam

## Changes

- Added optional road-sign input only where the selected official format requires it.
- Missing section results remain unverified; failed sections route to practice rather than the final checklist.
- Reject impossible, blank, out-of-range and fractional counts without emitting a checked-score event.
- Distinguish the primary section length from the full two-part exam.
- Scale known passing fractions exactly rather than using rounded published percentages.
- Existing dmv_score_checked now includes result=target_met/below_target/section_unverified and the sign score when supplied. These events do not establish that someone passed an official exam.
- Search title, description and H1 remain unchanged. Only the calculator last-updated date and its sitemap lastmod changed. Do not restart prior search experiments or record this as traffic growth.

## Verification

- Static build, JavaScript syntax, Python syntax and whitespace checks passed.
- 20 Node tests passed, including 7 calculator regressions and existing SAT/value-path checks.
- 5 Python road-sign-art tests passed with the bundled dependency runtime.
- 4 desktop/mobile PDF-to-quiz and PDF-to-flashcard paths passed.
- Desktop 1280x900 and mobile 390x844 screenshots inspected; no horizontal overflow.
- All browser tests blocked external requests, including analytics. No live tool clicks were used for self-checking.

## Growth Context

Current authenticated evidence is recorded separately in project-memory/search-console/2026-10-08/artifact.json. GSC complete through October 5: 80 clicks over 28 days (2.86/day), approximately 3.5 times short of the initial 10/day target. This correctness repair does not prove more clicks or ad revenue.
