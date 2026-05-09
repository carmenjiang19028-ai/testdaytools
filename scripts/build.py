#!/usr/bin/env python3
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "content" / "site_data.json").read_text())
SITE = DATA["site"]
TOOL_BY_SLUG = {tool["slug"]: tool for tool in DATA["tools"]}


def esc(value):
    return html.escape(str(value), quote=True)


def url_for(path):
    return SITE["url"].rstrip("/") + path


def href_for(path):
    if path == "/":
        return "index.html"
    return path.lstrip("/")


def page_shell(title, description, path, body, extra_class=""):
    nav = "".join(
        f'<a href="{esc(href_for(item["href"]))}">{esc(item["label"])}</a>'
        for item in DATA["navigation"]
    )
    canonical = url_for(path)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(description)}">
  <link rel="canonical" href="{esc(canonical)}">
  <link rel="stylesheet" href="assets/styles.css">
  <script src="assets/app.js" defer></script>
  <script type="application/ld+json">{json.dumps(schema(title, description, canonical), separators=(",", ":"))}</script>
</head>
<body class="{esc(extra_class)}">
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <a class="brand" href="index.html" aria-label="TestDayTools home">
      <span class="brand-mark">T</span>
      <span>{esc(SITE["name"])}</span>
    </a>
    <nav aria-label="Main navigation">{nav}</nav>
  </header>
  <main id="main">
    {body}
  </main>
  <footer class="site-footer">
    <p>{esc(SITE["disclaimer"])}</p>
    <p><a href="privacy.html">Privacy</a> <a href="contact.html">Contact</a> <a href="disclaimer.html">Disclaimer</a></p>
  </footer>
</body>
</html>
"""


def schema(title, description, canonical):
    return {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": title,
        "description": description,
        "url": canonical,
        "publisher": {"@type": "Organization", "name": SITE["name"]},
        "isAccessibleForFree": True
    }


def render_last_updated():
    return f'<p class="last-updated">Last updated: <time>{esc(SITE["lastUpdated"])}</time></p>'


def render_ad(label="Advertisement"):
    return f'<aside class="ad-slot" aria-label="{esc(label)}"><span>{esc(label)} placeholder</span></aside>'


def render_sources(sources):
    if not sources:
        return ""
    items = "".join(f'<li><a href="{esc(src["url"])}" rel="nofollow">{esc(src["label"])}</a></li>' for src in sources)
    return f'<section class="sources"><h2>Sources</h2><ul>{items}</ul></section>'


def render_faq(faq):
    if not faq:
        return ""
    items = "".join(
        f'<details><summary>{esc(item["q"])}</summary><p>{esc(item["a"])}</p></details>'
        for item in faq
    )
    faq_schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": item["q"], "acceptedAnswer": {"@type": "Answer", "text": item["a"]}}
            for item in faq
        ]
    }
    return f'<section class="faq"><h2>FAQ</h2>{items}<script type="application/ld+json">{json.dumps(faq_schema, separators=(",", ":"))}</script></section>'


def render_checklist(items):
    if not items:
        return ""
    lis = "".join(f'<li><label><input type="checkbox"> <span>{esc(item)}</span></label></li>' for item in items)
    return f'<section class="tool-block"><h2>Checklist</h2><ul class="checklist">{lis}</ul></section>'


def render_tables(tables):
    output = []
    for table in tables or []:
        headers = "".join(f"<th>{esc(h)}</th>" for h in table["headers"])
        rows = "".join("<tr>" + "".join(f"<td>{esc(cell)}</td>" for cell in row) + "</tr>" for row in table["rows"])
        output.append(f'<section class="tool-block"><h2>{esc(table["caption"])}</h2><div class="table-wrap"><table><thead><tr>{headers}</tr></thead><tbody>{rows}</tbody></table></div></section>')
    return "".join(output)


def render_countdown(countdown):
    if not countdown:
        return ""
    return f"""<section class="countdown" data-countdown="{esc(countdown["date"])}">
  <div>
    <p class="eyebrow">{esc(countdown["label"])}</p>
    <strong data-countdown-value>Loading...</strong>
  </div>
  <time datetime="{esc(countdown["date"])}">{esc(countdown["date"].split("T")[0])}</time>
</section>"""


def render_quiz(quiz_key):
    if not quiz_key:
        return ""
    questions = DATA["quizzes"][quiz_key]
    cards = []
    for index, q in enumerate(questions):
        choices = "".join(
            f'<button type="button" data-choice="{choice_index}">{esc(choice)}</button>'
            for choice_index, choice in enumerate(q["choices"])
        )
        cards.append(f"""<article class="question" data-answer="{q["answer"]}" data-explanation="{esc(q["explanation"])}">
  <h3>{index + 1}. {esc(q["q"])}</h3>
  <div class="choices">{choices}</div>
  <p class="feedback" aria-live="polite"></p>
</article>""")
    return f'<section class="quiz tool-block" data-quiz><h2>Practice questions</h2>{"".join(cards)}<p class="quiz-score" aria-live="polite"></p></section>'


def render_related(slugs):
    cards = []
    for slug in slugs or []:
        tool = TOOL_BY_SLUG.get(slug)
        if tool:
            cards.append(f'<a class="related-card" href="{esc(slug)}.html"><span>{esc(tool["category"])}</span><strong>{esc(tool["title"])}</strong></a>')
    if not cards:
        return ""
    return f'<section class="related"><h2>Related tools</h2><div class="related-grid">{"".join(cards)}</div></section>'


def render_tool(tool):
    body_sections = "".join(
        f'<section class="content-section"><h2>{esc(section["heading"])}</h2><p>{esc(section["text"])}</p></section>'
        for section in tool.get("body", [])
    )
    body = f"""<section class="hero tool-hero">
  <div>
    <p class="eyebrow">{esc(tool["heroKicker"])}</p>
    <h1>{esc(tool["title"])}</h1>
    <p class="lede">{esc(tool["summary"])}</p>
    {render_last_updated()}
  </div>
</section>
<section class="notice"><strong>Unofficial tool.</strong> {esc(SITE["disclaimer"])}</section>
{render_countdown(tool.get("countdown"))}
{render_tables(tool.get("tables"))}
{body_sections}
{render_checklist(tool.get("checklist"))}
{render_quiz(tool.get("quiz"))}
{render_ad()}
{render_faq(tool.get("faq"))}
{render_sources(tool.get("sources"))}
{render_related(tool.get("related"))}"""
    return page_shell(tool["title"], tool["description"], f'/{tool["slug"]}.html', body, "tool-page")


def render_home():
    cards = []
    for section in DATA["home"]["sections"]:
        links = "".join(
            f'<a href="{esc(slug)}.html"><strong>{esc(TOOL_BY_SLUG[slug]["title"])}</strong><span>{esc(TOOL_BY_SLUG[slug]["description"])}</span></a>'
            for slug in section["links"]
        )
        cards.append(f'<section class="home-group"><h2>{esc(section["heading"])}</h2><div class="tool-grid">{links}</div></section>')
    body = f"""<section class="hero home-hero">
  <div>
    <p class="eyebrow">Unofficial test planning tools</p>
    <h1>AP, SAT, and DMV tools without the clutter.</h1>
    <p class="lede">Scan dates, pack smarter, and practice common permit-test concepts. No accounts, no official logos, no personal data collection.</p>
  </div>
</section>
<section class="notice"><strong>Independent site.</strong> {esc(SITE["disclaimer"])}</section>
{''.join(cards)}
{render_ad("Future ad")}"""
    return page_shell(DATA["home"]["title"], DATA["home"]["description"], "/", body, "home-page")


def render_trust(page):
    content = "".join(
        f'<section class="content-section"><h2>{esc(section["heading"])}</h2><p>{esc(section["text"])}</p></section>'
        for section in page["content"]
    )
    body = f"""<section class="hero slim-hero">
  <div>
    <p class="eyebrow">TestDayTools</p>
    <h1>{esc(page["title"])}</h1>
    <p class="lede">{esc(page["description"])}</p>
    {render_last_updated()}
  </div>
</section>
{content}"""
    return page_shell(page["title"], page["description"], f'/{page["slug"]}.html', body, "trust-page")


def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def build():
    write("index.html", render_home())
    for tool in DATA["tools"]:
        write(f'{tool["slug"]}.html', render_tool(tool))
    for page in DATA["trustPages"]:
        write(f'{page["slug"]}.html', render_trust(page))

    urls = ["/"] + [f'/{tool["slug"]}.html' for tool in DATA["tools"]] + [f'/{page["slug"]}.html' for page in DATA["trustPages"]]
    sitemap_urls = "".join(f"<url><loc>{esc(url_for(path))}</loc></url>" for path in urls)
    write("sitemap.xml", f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{sitemap_urls}</urlset>')
    write("robots.txt", f"User-agent: *\nAllow: /\nSitemap: {SITE['url'].rstrip('/')}/sitemap.xml\n")


if __name__ == "__main__":
    build()
    print("Built static site pages.")
