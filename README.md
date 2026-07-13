# TestDayTools

Unofficial AP, SAT, and DMV planning and practice tools.

Live site: [testdaytools.com](https://testdaytools.com/)

Popular resources:

- [DMV road signs practice test](https://testdaytools.com/road-signs-practice-test.html)
- [Free printable DMV road signs cheat sheet](https://testdaytools.com/dmv-road-signs-cheat-sheet.html)
- [DMV permit test tools](https://testdaytools.com/dmv-practice.html)

## Stack

- Plain static HTML, CSS, and JavaScript
- Python standard-library build script
- No runtime dependencies and no personal data collection

## Update content

Edit `content/site_data.json`, then run:

```bash
python3 scripts/build.py
```

The script regenerates root HTML pages, `sitemap.xml`, and `robots.txt`.

Canonical URLs are generated from the `site.url` value in `content/site_data.json`.

## Local preview

Open `index.html` directly, or run:

```bash
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.
