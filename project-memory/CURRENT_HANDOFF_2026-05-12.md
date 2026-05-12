# TestDayTools Current Handoff Backup

Date: 2026-05-12
Project path: `/Users/carmen/Documents/New project 3`
Production domain: `https://testdaytools.com/`
GitHub repo: `https://github.com/carmenjiang19028-ai/testdaytools`

## Purpose

This file is the current project handoff backup for future Codex/model changes.
Do not rely on old chat history. Read this file together with:

- `project-memory/PROJECT_MEMORY.md`
- `project-memory/STRATEGY_RISK_AUDIT_2026-05-09.md`
- `project-memory/ONE_WEEK_SEO_SPRINT.md`
- `project-memory/THREE_DAY_CONTENT_SPRINT.md`
- `content/site_data.json`
- `scripts/build.py`
- `assets/app.js`
- `assets/styles.css`

## Current Product Direction

TestDayTools is now being refocused as a low-maintenance, English, tool-first SEO site.

The strongest current direction is DMV/permit-test tooling:

- Road signs practice.
- Regulatory traffic signs practice.
- State permit practice pages.
- State road-sign pages.
- DMV test-day checklist and state manual finder.

AP and SAT pages still exist and should remain useful, but recent strategy shifted toward DMV because the first Search Console signal was DMV-related and evergreen.

## Search Console Snapshot From User

The user manually checked Google Search Console and shared screenshots.

At that point:

- Performance, last 3 months: 0 clicks, 1 impression, average position 81.
- Query shown: `regulatory traffic signs florida`.
- Page indexing: 6 not indexed, 0 indexed.
- Reasons shown: 1 alternate page with proper canonical, 5 crawled but not indexed.

Interpretation:

- There was at least one real Google impression, not a user visit.
- The first meaningful query signal pointed to Florida regulatory signs.
- The site still needed stronger tool usefulness and better internal loops before relying on indexing.

## Current Site Architecture

This is a static site generated from data and templates.

Important files:

- `content/site_data.json`: primary page, tool, quiz, checklist, source, FAQ, and hub data.
- `scripts/build.py`: static generator and shared rendering logic.
- `assets/app.js`: interactive behavior for quizzes, focus filters, saved mistakes, mini diagnostics, recent progress, checklist state selection, SAT widgets.
- `assets/styles.css`: shared layout and component styling.
- Generated `.html` files at repo root are committed outputs.
- `sitemap.xml` is generated.

Build command:

```bash
python3 scripts/build.py
```

Useful validation commands:

```bash
python3 -m py_compile scripts/build.py
node --check assets/app.js
git diff --check
```

The local link/JSON-LD validator used in prior runs reported:

```text
Validated 45 HTML files, 127 JSON-LD blocks, 45 sitemap URLs, local links OK.
```

## Recent Commit Timeline

Latest confirmed pushed commit:

```text
834f683 Connect state DMV pages to checklist
```

Recent relevant commits:

- `834f683` Connect state DMV pages to checklist
- `11f1ebb` Add DMV test day checklist
- `14005fc` Connect diagnostic practice flow
- `874112b` Expand DMV practice controls
- `4d6e8ed` Stabilize mobile workspace layout
- `90725b9` Build DMV practice workspace
- `f63e822` Reframe site around DMV road sign practice
- `d2e1aa2` Add road signs practice hub
- `f490dcb` Optimize Florida regulatory signs page
- `c3f5ca7` Execute SAT growth sprint foundation
- `b122b16` Upgrade DMV tool UI experience

Local and remote were confirmed aligned at `834f683`.

## What Was Recently Built

### DMV Road Signs And Practice Reframe

The site was reframed around DMV-first practice rather than a generic exam hub.

Key changes:

- Homepage now emphasizes DMV road-sign practice and state practice.
- DMV hub exists at `dmv-practice.html`.
- Road signs hub exists at `road-signs-practice-test.html`.
- Regulatory signs page exists at `regulatory-traffic-signs-practice-test.html`.
- State DMV permit pages and road-sign pages exist for:
  - California
  - New York
  - Texas
  - Florida
  - Illinois
  - Pennsylvania
  - New Jersey

### Practice Engine Upgrades

Shared quiz functionality now includes:

- Practice modes.
- Focus-area filtering.
- Saved mistakes on the current browser.
- Shuffle within the active focus area.
- 10-minute practice timer.
- Question navigator with answered/correct/wrong/active states.
- Recent-practice return card.

### Diagnostic Handoff

Homepage and DMV hub mini diagnostics now hand off to a focused road-sign practice round.

Example behavior:

- Missing a regulatory sign can route to:
  - `road-signs-practice-test.html?focus=regulatory#practice`

The destination page reads the `focus` query parameter and preselects that category.

### DMV Test-Day Checklist Tool

New page:

```text
dmv-test-day-checklist.html
```

Functionality:

- Choose a state.
- Open the official manual/source.
- Jump to matching state permit practice.
- Jump to matching state road signs.
- Save checklist progress in browser local storage.
- Show readiness percentage.
- Show the next unchecked item.
- Remember last selected state.

Supported state selector values:

- `california`
- `new-york`
- `texas`
- `florida`
- `illinois`
- `pennsylvania`
- `new-jersey`

State preselection now works through URL query:

```text
dmv-test-day-checklist.html?state=florida#dmv-checklist
```

Browser validation confirmed this URL preselected Florida and showed:

```text
Official Florida Driver License Handbook
```

### Reverse Links From State Pages

Latest commit `834f683` connected state pages back to the checklist.

Each supported state permit page and state road-sign page now has:

- A `Test-day checklist` hero action.
- A `Before test day` bridge section.
- Links to:
  - State-preselected checklist.
  - Paired practice page.
  - Official state source.

Live checks confirmed:

- Florida permit page contains:
  - `dmv-test-day-checklist.html?state=florida#dmv-checklist`
  - `Florida DMV test-day path`
- New Jersey road-sign page contains:
  - `dmv-test-day-checklist.html?state=new-jersey#dmv-checklist`
  - `New Jersey DMV test-day path`

## Current Dirty Worktree Boundary

Important: after the latest pushed commit, the git status still shows old unrelated files:

```text
 M README.md
?? LICENSE
?? articles/
?? examples/
?? go/
?? tools/
```

These came from an older seller/e-commerce tooling direction and were intentionally not committed in the DMV refactor commits.

Do not revert or commit them unless the user explicitly asks.

The current TestDayTools site should be understood from `project-memory`, `content/site_data.json`, `scripts/build.py`, `assets/app.js`, `assets/styles.css`, and the committed generated HTML pages.

## Deployment Notes

Command-line `git push` failed earlier because this environment could not read GitHub credentials over HTTPS:

```text
fatal: could not read Username for 'https://github.com': Device not configured
```

GitHub Desktop was used successfully to push commits because it was logged in.

If future command-line push fails the same way:

1. Commit locally with a narrow file set.
2. Use GitHub Desktop's `Push origin` button.
3. Confirm:

```bash
git rev-parse HEAD origin/main
git log --oneline -3 --decorate
```

## Most Recent Verification

After commit `834f683`, these checks passed:

- Static generator built pages successfully.
- `scripts/build.py` compiled.
- `assets/app.js` syntax check passed.
- `git diff --check` passed.
- Local validator passed:

```text
Validated 45 HTML files, 127 JSON-LD blocks, 45 sitemap URLs, local links OK.
```

- Browser test passed:

```text
Checklist URL state preselect OK: florida, Official Florida Driver License Handbook
```

- Live checks passed for:
  - Florida permit page checklist bridge.
  - New Jersey road-sign page checklist bridge.
  - `assets/app.js` state query handling.
  - `assets/styles.css` bridge styling.

## Strategic Next Step

Best next move:

Expand the DMV checklist page into a stronger long-tail tool surface for queries such as:

- `what to bring to dmv permit test`
- `dmv test day checklist`
- `documents for permit test`
- `what documents do I need for learner permit`
- `dmv written test checklist`

Recommended implementation:

- Add a documents/test-day requirements section to `dmv-test-day-checklist.html`.
- Keep it general and clearly unofficial.
- Add state-specific official-source links rather than overclaiming exact requirements.
- Add compact FAQ around documents, ID, proof of residency, payment, appointments, glasses/contacts, and retake policy.
- Add a printable or copyable checklist only if it stays low-maintenance.

Lower priority:

- More AP/SAT pages.
- More states beyond the current 7.
- Real ad code.

Do not add AdSense yet. Wait for indexing and more natural traffic.

## Response Preference Reminder

The user requested responses in two sections:

- `直接执行：`
- `深度交互：`

Keep working quietly unless reporting a stage result or blocker.
