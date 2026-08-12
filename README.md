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
- No runtime dependencies and no collection of names, emails, license numbers, or test scores

## Update content

Edit `content/site_data.json`, then run:

```bash
python3 scripts/build.py
```

The script regenerates root HTML pages, `sitemap.xml`, and `robots.txt`.

Canonical URLs are generated from the `site.url` value in `content/site_data.json`.

After changing the printable road-sign sheet, regenerate its downloadable PDF:

```bash
python3 scripts/build_road_sign_pdf.py
python3 scripts/build_road_sign_classroom_pack.py
```

The PDF builder uses an installed Chrome or Chromium binary and writes
`dmv-road-signs-cheat-sheet.pdf` at the site root.

The classroom-pack builder uses ReportLab and writes
`dmv-road-signs-classroom-worksheet.pdf` at the site root.

## Local preview

Open `index.html` directly, or run:

```bash
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.
