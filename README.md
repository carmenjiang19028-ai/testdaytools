# TestDayTools

Unofficial static MVP for AP, SAT, and DMV planning tools.

Planned GitHub Pages URL:

`https://testdaytools.com/`

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
