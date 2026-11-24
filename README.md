# TestDayTools

Free, no-signup DMV, AP, and SAT planning and practice tools. The current product focus is visual DMV road-sign learning for permit-test students, families, driving educators, libraries, and homeschool resource pages.

Live site: [testdaytools.com](https://testdaytools.com/)

Popular resources:

- [DMV road signs practice test](https://testdaytools.com/road-signs-practice-test.html) - 10-question starter plus a 40-question picture round
- [Free printable DMV road signs cheat sheet](https://testdaytools.com/dmv-road-signs-cheat-sheet.html) - 31 original sign illustrations and plain-English meanings
- [DMV road sign flashcards](https://testdaytools.com/dmv-road-sign-flashcards.html) - 31 browser-saved visual review cards
- [DMV permit test tools](https://testdaytools.com/dmv-practice.html)
- [SAT test dates, deadlines, and free calendar](https://testdaytools.com/sat-test-dates-2026-2027.html)

## What the DMV tools do

- Pair each road-sign picture with a driver decision and immediate explanation
- Save missed questions and mastery progress locally in the visitor's browser
- Route learners from a broad national round into regulatory signs, flashcards, printable review, or state-specific practice
- Link state pages to official driver handbooks for final wording and requirements
- Work on mobile and desktop without an account, email gate, or payment

Road-sign names and categories are checked against the [FHWA Manual on Uniform Traffic Control Devices](https://mutcd.fhwa.dot.gov/) and official state sources. Questions and simplified SVG illustrations are original TestDayTools study material, not copied official exam questions.

Educators and resource curators may link directly to the live practice test or printable cheat sheet. The live pages remain free and do not require student registration.

## Stack

- Plain static HTML, CSS, and JavaScript
- Python standard-library site build script; ReportLab is used only to regenerate the optional classroom PDF
- Core practice does not need an account or a third-party script. Selected quiz answers stay in the browser; Google Analytics may receive practice counts. See the [privacy policy](https://testdaytools.com/privacy.html) for details.

## Update content

Edit `content/site_data.json`, then run:

```bash
python3 scripts/build.py
```

The script regenerates active HTML pages (including the three skills pages),
`sitemap.xml`, and `robots.txt`. Retired noindex pages are kept as checked-in
snapshots; the build does not edit them. Before publishing, verify checked-in
outputs without editing them:

```bash
python3 scripts/build.py --check
```

Canonical URLs are generated from the `site.url` value in `content/site_data.json`.

SAT date planners use the registration dates in the calendar data. The August
score page references the full-year schedule through `toolWidget.scheduleSource`;
its archived August calendar file stays separate. Keep past dates as historical
entries, not as upcoming registration targets.

After a SAT schedule or planner change, build the site and run the browser checks
with Playwright installed and Google Chrome available:

```bash
node --test tests/sat-date-planner.test.cjs
```

The checks cover both planners, Eastern-time deadline boundaries, saved-plan
refresh, calendar downloads, and mobile/desktop layouts. Set
`VERIFY_SCREENSHOTS_DIR` to retain local verification screenshots.

After changing the printable road-sign sheet, regenerate its downloadable PDF:

```bash
python3 scripts/build_road_sign_pdf.py
python3 scripts/build_road_sign_classroom_pack.py
```

The PDF builder uses Google Chrome via Playwright and writes
`dmv-road-signs-cheat-sheet.pdf` at the site root. To catch stale artwork,
layout, or click targets without rewriting the download, run:

```bash
python3 scripts/build_road_sign_pdf.py --check
```

This check also needs Poppler's `pdftoppm` (or set `PDFTOPPM_BIN`), Pillow,
and pypdf. Run with the same Chrome and font setup as the PDF builder.
If the comparison fails, review the difference before regenerating.

The classroom-pack builder uses ReportLab and writes
`dmv-road-signs-classroom-worksheet.pdf` at the site root.

The site build also exports the existing road-sign illustrations to
`assets/road-signs/`. The picture-test and printable pages reuse these SVG files
with image entries in the existing sitemap. Quiz artwork stays inline.
After changing the artwork, rebuild the picture-test and printable reference
previews with Playwright:

```bash
node scripts/build_road_sign_preview.cjs
node --test tests/road-sign-image-discovery.test.cjs
```

### Check the learner release

Run these from the repository root. Use a local Python environment with
`pytest`, `pypdf`, `Pillow`, and `reportlab`; make that same `python3`
available on `PATH` for the browser PDF checks. The browser suite uses
`playwright`, `sharp`, and installed Google Chrome.

```bash
python3 scripts/build.py --check
PYTHONPATH=scripts python3 -m pytest -q
node --test --test-concurrency=4 tests/*.test.cjs
```

Use the `*.test.cjs` glob for this local pass. The separate `*.browser.cjs`
scripts exercise production and are not required to verify a release.
The legacy all-page AdSense marker assertion still checks four independently
maintained pages against an older requirement. A marker assertion is not an
account review result.

## Local preview

Open `index.html` directly, or run:

```bash
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.
