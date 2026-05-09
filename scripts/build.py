#!/usr/bin/env python3
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "content" / "site_data.json").read_text())
SITE = DATA["site"]
TOOL_BY_SLUG = {tool["slug"]: tool for tool in DATA["tools"]}
HUBS = DATA.get("hubs", [])

SIGN_SVGS = {
    "stop": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="82,12 138,12 184,46 202,100 174,145 46,145 18,100 36,46" fill="#c7312f" stroke="#981f1d" stroke-width="6"/><text x="110" y="94" text-anchor="middle" fill="#fff" font-size="38" font-weight="900" font-family="Arial, sans-serif">STOP</text></svg>',
    "yield": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,148 202,18 18,18" fill="#fff" stroke="#c7312f" stroke-width="12"/><text x="110" y="76" text-anchor="middle" fill="#c7312f" font-size="28" font-weight="900" font-family="Arial, sans-serif">YIELD</text></svg>',
    "do-not-enter": '<svg viewBox="0 0 220 160" aria-hidden="true"><circle cx="110" cy="80" r="62" fill="#c7312f"/><rect x="54" y="66" width="112" height="28" rx="3" fill="#fff"/><text x="110" y="128" text-anchor="middle" fill="#fff" font-size="18" font-weight="900" font-family="Arial, sans-serif">DO NOT ENTER</text></svg>',
    "wrong-way": '<svg viewBox="0 0 220 160" aria-hidden="true"><rect x="40" y="42" width="140" height="76" rx="5" fill="#c7312f" stroke="#981f1d" stroke-width="5"/><text x="110" y="74" text-anchor="middle" fill="#fff" font-size="26" font-weight="900" font-family="Arial, sans-serif">WRONG</text><text x="110" y="104" text-anchor="middle" fill="#fff" font-size="26" font-weight="900" font-family="Arial, sans-serif">WAY</text></svg>',
    "no-u-turn": '<svg viewBox="0 0 220 160" aria-hidden="true"><rect x="38" y="20" width="144" height="120" rx="8" fill="#fff" stroke="#222" stroke-width="4"/><path d="M90 116 V58 a25 25 0 0 1 50 0 v14" fill="none" stroke="#111" stroke-width="12" stroke-linecap="round"/><path d="M124 72 h32 l-16 24z" fill="#111"/><circle cx="110" cy="80" r="58" fill="none" stroke="#c7312f" stroke-width="11"/><line x1="69" y1="121" x2="151" y2="39" stroke="#c7312f" stroke-width="11"/></svg>',
    "one-way": '<svg viewBox="0 0 220 160" aria-hidden="true"><rect x="28" y="46" width="164" height="68" rx="6" fill="#111827"/><path d="M58 80 h78" stroke="#fff" stroke-width="12" stroke-linecap="round"/><path d="M126 50 170 80 126 110z" fill="#fff"/><text x="78" y="105" text-anchor="middle" fill="#fff" font-size="18" font-weight="900" font-family="Arial, sans-serif">ONE WAY</text></svg>',
    "speed-limit": '<svg viewBox="0 0 220 160" aria-hidden="true"><rect x="66" y="16" width="88" height="128" rx="4" fill="#fff" stroke="#222" stroke-width="4"/><text x="110" y="48" text-anchor="middle" fill="#111" font-size="17" font-weight="900" font-family="Arial, sans-serif">SPEED</text><text x="110" y="68" text-anchor="middle" fill="#111" font-size="17" font-weight="900" font-family="Arial, sans-serif">LIMIT</text><text x="110" y="118" text-anchor="middle" fill="#111" font-size="48" font-weight="900" font-family="Arial, sans-serif">35</text></svg>',
    "school-crossing": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,12 190,54 172,142 48,142 30,54" fill="#f6d54a" stroke="#222" stroke-width="5"/><circle cx="84" cy="55" r="9" fill="#111"/><circle cx="130" cy="53" r="9" fill="#111"/><path d="M82 68 l-18 38 M82 68 l24 18 M130 66 l-18 42 M130 66 l26 18" stroke="#111" stroke-width="8" stroke-linecap="round"/><path d="M92 108 h56" stroke="#111" stroke-width="8" stroke-linecap="round"/></svg>',
    "pedestrian-crossing": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><circle cx="112" cy="50" r="10" fill="#111"/><path d="M108 65 l-20 32 M109 66 l28 22 M92 98 l-18 24 M100 96 l34 28" stroke="#111" stroke-width="9" stroke-linecap="round"/></svg>',
    "merge": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><path d="M84 126 V38" stroke="#111" stroke-width="11" stroke-linecap="round"/><path d="M136 126 C136 94 118 88 96 78" fill="none" stroke="#111" stroke-width="11" stroke-linecap="round"/><path d="M70 48 84 28 98 48z" fill="#111"/></svg>',
    "lane-ends": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><path d="M82 126 V40 M138 126 C124 96 116 74 110 42" stroke="#111" stroke-width="10" stroke-linecap="round" fill="none"/><path d="M68 50 82 30 96 50z" fill="#111"/></svg>',
    "slippery": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><path d="M74 54 h72 v28 H74z" fill="#111"/><circle cx="90" cy="90" r="9" fill="#111"/><circle cx="132" cy="90" r="9" fill="#111"/><path d="M68 116 c18-18 38 18 56 0s36 16 52 0" fill="none" stroke="#111" stroke-width="7" stroke-linecap="round"/></svg>',
    "railroad": '<svg viewBox="0 0 220 160" aria-hidden="true"><circle cx="110" cy="80" r="64" fill="#fff" stroke="#222" stroke-width="5"/><text x="110" y="52" text-anchor="middle" fill="#111" font-size="17" font-weight="900" font-family="Arial, sans-serif">RAILROAD</text><text x="110" y="76" text-anchor="middle" fill="#111" font-size="17" font-weight="900" font-family="Arial, sans-serif">CROSSING</text><path d="M68 106 h84 M82 92 l56 28 M138 92 l-56 28" stroke="#111" stroke-width="6" stroke-linecap="round"/></svg>',
    "work-zone": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f59e2e" stroke="#222" stroke-width="5"/><circle cx="104" cy="47" r="8" fill="#111"/><path d="M100 58 l-20 35 M101 60 l32 22 M85 94 h62 M76 118 h78" stroke="#111" stroke-width="8" stroke-linecap="round"/></svg>',
    "signal-ahead": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><rect x="88" y="36" width="44" height="88" rx="8" fill="#222"/><circle cx="110" cy="58" r="11" fill="#e53935"/><circle cx="110" cy="82" r="11" fill="#f4c430"/><circle cx="110" cy="106" r="11" fill="#22a35a"/></svg>',
    "divided-highway": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><path d="M86 126 C86 98 102 86 102 58" stroke="#111" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M134 126 C134 98 118 86 118 58" stroke="#111" stroke-width="10" fill="none" stroke-linecap="round"/><rect x="102" y="62" width="16" height="42" fill="#111"/></svg>',
    "no-passing": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="64,18 156,18 198,80 156,142 64,142 22,80" fill="#fff" stroke="#c7312f" stroke-width="8"/><text x="110" y="65" text-anchor="middle" fill="#111" font-size="20" font-weight="900" font-family="Arial, sans-serif">DO NOT</text><text x="110" y="94" text-anchor="middle" fill="#111" font-size="20" font-weight="900" font-family="Arial, sans-serif">PASS</text></svg>',
    "roundabout": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><path d="M83 63 a36 36 0 0 1 58 5 M146 89 a36 36 0 0 1-57 12 M93 57 l-20 2 10-18 M151 88 l-4 20 20-8" fill="none" stroke="#111" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    "hospital": '<svg viewBox="0 0 220 160" aria-hidden="true"><rect x="48" y="26" width="124" height="108" rx="8" fill="#0f5fa8"/><text x="110" y="108" text-anchor="middle" fill="#fff" font-size="76" font-weight="900" font-family="Arial, sans-serif">H</text></svg>',
    "deer-crossing": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><path d="M78 106 l22-42 25 14 22-18 M100 64 l-12-20 M107 66 l8-24 M125 78 l20 30 M112 82 l-4 34" stroke="#111" stroke-width="8" stroke-linecap="round" fill="none"/><circle cx="143" cy="58" r="7" fill="#111"/></svg>',
}


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


def render_ad(label="future ad"):
    return f"<!-- Reserved {esc(label).lower()} slot. Real ads are intentionally disabled for the static launch. -->"


def render_quick_facts(facts):
    if not facts:
        return ""
    items = "".join(
        f'<div><dt>{esc(item["label"])}</dt><dd>{esc(item["value"])}</dd></div>'
        for item in facts
    )
    return f'<section class="fact-section"><h2>Quick facts</h2><dl class="fact-grid">{items}</dl></section>'


def render_exam_brief(tool):
    brief = tool.get("examBrief")
    if not brief:
        return ""
    facts = "".join(
        f'<article><span>{esc(item["label"])}</span><strong>{esc(item["value"])}</strong><p>{esc(item.get("note", ""))}</p></article>'
        for item in brief.get("facts", [])
    )
    path = "".join(
        f'<li><span>{esc(item["step"])}</span><strong>{esc(item["title"])}</strong><p>{esc(item["text"])}</p></li>'
        for item in brief.get("path", [])
    )
    return f"""<section class="exam-brief">
  <div class="exam-brief-head">
    <p class="eyebrow">{esc(brief.get("kicker", "Exam snapshot"))}</p>
    <h2>{esc(brief["heading"])}</h2>
    <p class="section-intro">{esc(brief.get("intro", ""))}</p>
  </div>
  <div class="exam-stat-grid">{facts}</div>
  <ol class="study-path-grid">{path}</ol>
</section>"""


def render_sign_library(tool):
    library = tool.get("signLibrary")
    if not library:
        return ""
    groups = []
    for group in library.get("groups", []):
        signs = []
        for item in group.get("signs", []):
            svg = SIGN_SVGS.get(item["image"], "")
            if not svg:
                continue
            signs.append(f"""<article class="sign-tile">
  <div class="sign-thumb" role="img" aria-label="{esc(item["title"])}">{svg}</div>
  <div><strong>{esc(item["title"])}</strong><p>{esc(item["meaning"])}</p></div>
</article>""")
        groups.append(f"""<article class="sign-group">
  <div class="sign-group-head">
    <span>{esc(group["label"])}</span>
    <p>{esc(group["text"])}</p>
  </div>
  <div class="sign-mini-grid">{"".join(signs)}</div>
</article>""")
    return f"""<section class="sign-library">
  <div class="tool-section-head">
    <span class="eyebrow">{esc(library.get("kicker", "Road sign library"))}</span>
    <h2>{esc(library["heading"])}</h2>
    <p class="section-intro">{esc(library.get("intro", ""))}</p>
  </div>
  <div class="sign-library-grid">{"".join(groups)}</div>
</section>"""


def render_timeline(timeline):
    if not timeline:
        return ""
    heading = timeline.get("heading", "Planning timeline")
    items = "".join(
        f'<li><span>{esc(item["label"])}</span><strong>{esc(item["title"])}</strong><p>{esc(item["text"])}</p></li>'
        for item in timeline.get("items", [])
    )
    return f'<section class="timeline-section"><h2>{esc(heading)}</h2><ol class="timeline">{items}</ol></section>'


def render_card_groups(groups):
    if not groups:
        return ""
    output = []
    for group in groups:
        intro = f'<p class="section-intro">{esc(group["intro"])}</p>' if group.get("intro") else ""
        cards = "".join(
            f'<article class="info-card"><span>{esc(item.get("label", ""))}</span><h3>{esc(item["title"])}</h3><p>{esc(item["text"])}</p></article>'
            for item in group.get("items", [])
        )
        output.append(f'<section class="card-group"><h2>{esc(group["heading"])}</h2>{intro}<div class="card-grid">{cards}</div></section>')
    return "".join(output)


def render_tool_links(slugs):
    links = []
    for slug in slugs:
        tool = TOOL_BY_SLUG[slug]
        links.append(
            f'<a href="{esc(slug)}.html"><strong>{esc(tool["title"])}</strong><span>{esc(tool["description"])}</span></a>'
        )
    return "".join(links)


def render_sources(sources):
    if not sources:
        return ""
    items = "".join(f'<li><a href="{esc(src["url"])}">{esc(src["label"])}</a></li>' for src in sources)
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


def render_sign_visual(question):
    key = question.get("image")
    if not key:
        return ""
    svg = SIGN_SVGS.get(key)
    if not svg:
        return ""
    label = question.get("imageAlt", "Road sign illustration")
    return f"""<figure class="question-visual">
  <div class="sign-art" role="img" aria-label="{esc(label)}">{svg}</div>
  <figcaption>Look at the sign, then choose the safest meaning or driver action.</figcaption>
</figure>"""


def render_quiz(quiz_key, options=None):
    if not quiz_key:
        return ""
    options = options or {}
    questions = DATA["quizzes"][quiz_key]
    cards = []
    for index, q in enumerate(questions):
        category = q.get("category", "Permit basics")
        visual = render_sign_visual(q)
        visual_block = f"\n  {visual}" if visual else ""
        choices = "".join(
            f'<button type="button" data-choice="{choice_index}">{esc(choice)}</button>'
            for choice_index, choice in enumerate(q["choices"])
        )
        cards.append(f"""<article class="question" data-question-index="{index}" data-answer="{q["answer"]}" data-category="{esc(category)}" data-explanation="{esc(q["explanation"])}">
  <p class="question-meta">Category: {esc(category)}</p>{visual_block}
  <h3>{index + 1}. {esc(q["q"])}</h3>
  <div class="choices">{choices}</div>
  <p class="feedback" aria-live="polite"></p>
</article>""")
    total = len(questions)
    pass_score = options.get("passScore") or options.get("pass_score") or max(total - 2, 1)
    title = options.get("title", "Practice questions")
    intro = options.get("description", "Answer one question at a time. Your result stays in this browser session and points you to weak areas.")
    kicker = options.get("kicker", "Interactive practice")
    quiz_label = options.get("label", title)
    mode_id = options.get("id", quiz_key)
    summary = f"""<aside class="quiz-summary" aria-live="polite">
  <p class="quiz-kicker">Practice status</p>
  <div>
    <strong data-quiz-result>Score: 0 of 0 answered</strong>
    <span data-quiz-next>Answer the questions first, then review the categories you missed.</span>
  </div>
  <div class="quiz-meter" aria-hidden="true"><span data-quiz-meter></span></div>
  <div class="quiz-breakdown" data-quiz-breakdown></div>
  <button type="button" class="quiz-reset" data-quiz-reset>Restart this mode</button>
</aside>"""
    controls = """<div class="quiz-controls">
  <button type="button" class="quiz-nav-button" data-quiz-prev>Previous</button>
  <button type="button" class="quiz-nav-button primary" data-quiz-forward>Next question</button>
</div>"""
    return f"""<section class="quiz tool-block" data-quiz data-total="{total}" data-pass-score="{esc(pass_score)}" data-quiz-label="{esc(quiz_label)}" data-mode-id="{esc(mode_id)}">
  <div class="tool-section-head">
    <span class="eyebrow">{esc(kicker)}</span>
    <h2>{esc(title)}</h2>
    <p class="section-intro">{esc(intro)}</p>
  </div>
  <div class="quiz-shell">
    <div class="quiz-workspace">
      <div class="quiz-topbar">
        <span data-quiz-position>Question 1 of {total}</span>
        <span data-quiz-answered>0 answered</span>
      </div>
      <div class="quiz-stage">{"".join(cards)}</div>
      {controls}
    </div>
    {summary}
  </div>
</section>"""


def render_dmv_mode_tool(tool):
    modes = tool.get("quizModes")
    if not modes:
        return render_quiz(tool.get("quiz"))
    if len(modes) == 1:
        return render_quiz(modes[0]["quiz"], modes[0])
    tabs = []
    panels = []
    for index, mode in enumerate(modes):
        active = index == 0
        selected = "true" if active else "false"
        active_class = " is-active" if active else ""
        hidden = "false" if active else "true"
        tabs.append(f'<button type="button" class="mode-tab{active_class}" data-mode-button="{esc(mode["id"])}" aria-selected="{selected}"><span>{esc(mode["label"])}</span><strong>{esc(mode.get("short", mode["title"]))}</strong></button>')
        quiz = render_quiz(mode["quiz"], mode)
        panels.append(f'<div class="mode-panel{active_class}" data-mode-panel="{esc(mode["id"])}" aria-hidden="{hidden}">{quiz}</div>')
    overview_items = "".join(
        f'<li><strong>{esc(mode["label"])}</strong><span>{esc(mode.get("description", ""))}</span></li>'
        for mode in modes
    )
    return f"""<section class="dmv-mode-tool" data-mode-tool>
  <div class="tool-section-head">
    <span class="eyebrow">DMV practice engine</span>
    <h2>Choose a practice mode</h2>
    <p class="section-intro">Start with a short quiz, switch to image-based road signs, or run a longer mock exam when you want a realistic score check.</p>
  </div>
  <div class="mode-tabs" role="tablist" aria-label="Practice modes">{"".join(tabs)}</div>
  <ul class="mode-overview">{overview_items}</ul>
  <div class="mode-panels">{"".join(panels)}</div>
</section>"""


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
    quiz = render_dmv_mode_tool(tool) if tool.get("category") == "DMV" else render_quiz(tool.get("quiz"))
    dmv_quiz_first = tool.get("category") == "DMV" and quiz
    dmv_single_mode = tool.get("category") == "DMV" and len(tool.get("quizModes", [])) == 1
    exam_brief = render_exam_brief(tool)
    sign_library = render_sign_library(tool)
    body_sections = "".join(
        f'<section class="content-section"><h2>{esc(section["heading"])}</h2><p>{esc(section["text"])}</p></section>'
        for section in tool.get("body", [])
    )
    dmv_sections = []
    if dmv_quiz_first:
        if dmv_single_mode:
            dmv_sections.extend([quiz, sign_library, exam_brief])
        else:
            dmv_sections.extend([exam_brief, quiz, sign_library])
    else:
        dmv_sections.extend([exam_brief, sign_library])
    lower_sections = [
        render_quick_facts(tool.get("quickFacts")),
        render_countdown(tool.get("countdown")),
        render_timeline(tool.get("timeline")),
        render_tables(tool.get("tables")),
        body_sections,
        render_card_groups(tool.get("cardGroups")),
        render_checklist(tool.get("checklist")),
        "" if dmv_quiz_first else quiz,
        render_ad(),
        render_faq(tool.get("faq")),
        render_sources(tool.get("sources")),
        render_related(tool.get("related")),
    ]
    page_sections = "".join(section for section in dmv_sections + lower_sections if section)
    body = f"""<section class="hero tool-hero">
  <div>
    <p class="eyebrow">{esc(tool["heroKicker"])}</p>
    <h1>{esc(tool["title"])}</h1>
    <p class="lede">{esc(tool["summary"])}</p>
    {render_last_updated()}
  </div>
</section>
<section class="notice"><strong>Unofficial tool.</strong> {esc(SITE["disclaimer"])}</section>
{page_sections}"""
    return page_shell(tool["title"], tool["description"], f'/{tool["slug"]}.html', body, "tool-page")


def render_hub(hub):
    if hub.get("slug") == "dmv-practice":
        return render_dmv_hub(hub)
    primary = "".join(
        f'<a class="hub-action" href="{esc(action["href"])}"><span>{esc(action["label"])}</span><strong>{esc(action["title"])}</strong><p>{esc(action["text"])}</p></a>'
        for action in hub.get("primaryActions", [])
    )
    primary_section = f'<section class="hub-primary"><h2>Start with one clear next step</h2><div class="hub-action-grid">{primary}</div></section>' if primary else ""
    body_sections = "".join(
        f'<section class="content-section"><h2>{esc(section["heading"])}</h2><p>{esc(section["text"])}</p></section>'
        for section in hub.get("body", [])
    )
    collections = []
    for section in hub.get("sections", []):
        intro = f'<p class="section-intro">{esc(section["intro"])}</p>' if section.get("intro") else ""
        links = render_tool_links(section.get("links", []))
        collections.append(f'<section class="hub-section"><h2>{esc(section["heading"])}</h2>{intro}<div class="tool-grid">{links}</div></section>')
    body = f"""<section class="hero hub-hero">
  <div>
    <p class="eyebrow">{esc(hub["heroKicker"])}</p>
    <h1>{esc(hub["title"])}</h1>
    <p class="lede">{esc(hub["summary"])}</p>
    {render_last_updated()}
  </div>
</section>
<section class="notice"><strong>Independent site.</strong> {esc(SITE["disclaimer"])}</section>
{primary_section}
{''.join(collections)}
{body_sections}
{render_ad("Future ad")}"""
    return page_shell(hub["title"], hub["description"], f'/{hub["slug"]}.html', body, "hub-page")


def render_dmv_launcher(heading="Choose a DMV practice path"):
    launch = DATA["home"].get("dmvLaunch", {})
    states = launch.get("states", [])
    stats = launch.get("stats", [])
    modes = launch.get("modes", [])
    state_cards = "".join(
        f'<a class="state-card" href="{esc(state["href"])}"><span>{esc(state["label"])}</span><strong>{esc(state["title"])}</strong><p>{esc(state["text"])}</p><em>{esc(state["cta"])}</em></a>'
        for state in states
    )
    stat_cards = "".join(
        f'<div><strong>{esc(item["value"])}</strong><span>{esc(item["label"])}</span></div>'
        for item in stats
    )
    mode_cards = "".join(
        f'<article><span>{esc(item["label"])}</span><strong>{esc(item["title"])}</strong><p>{esc(item["text"])}</p></article>'
        for item in modes
    )
    return f"""<section class="dmv-launch">
  <div class="section-head-row">
    <div>
      <p class="eyebrow">DMV practice engine</p>
      <h2>{esc(heading)}</h2>
      <p class="section-intro">{esc(launch.get("intro", "Pick a state, then practice road rules, image signs, and mock exam questions with instant feedback."))}</p>
    </div>
    <div class="launch-stats">{stat_cards}</div>
  </div>
  <div class="state-grid">{state_cards}</div>
  <div class="mode-card-grid">{mode_cards}</div>
</section>"""


def render_dmv_hub(hub):
    collections = []
    for section in hub.get("sections", []):
        links = render_tool_links(section.get("links", []))
        collections.append(f'<section class="hub-section"><h2>{esc(section["heading"])}</h2><div class="tool-grid">{links}</div></section>')
    body_sections = "".join(
        f'<section class="content-section"><h2>{esc(section["heading"])}</h2><p>{esc(section["text"])}</p></section>'
        for section in hub.get("body", [])
    )
    body = f"""<section class="hero hub-hero dmv-hub-hero">
  <div>
    <p class="eyebrow">{esc(hub["heroKicker"])}</p>
    <h1>{esc(hub["title"])}</h1>
    <p class="lede">{esc(hub["summary"])}</p>
    {render_last_updated()}
  </div>
</section>
<section class="notice"><strong>Independent site.</strong> {esc(SITE["disclaimer"])}</section>
{render_dmv_launcher("Start with your state")}
{''.join(collections)}
{body_sections}
{render_ad("Future ad")}"""
    return page_shell(hub["title"], hub["description"], f'/{hub["slug"]}.html', body, "hub-page dmv-hub-page")


def render_home():
    start_items = "".join(
        f'<a class="start-card" href="{esc(item["href"])}"><span>{esc(item["label"])}</span><strong>{esc(item["title"])}</strong><p>{esc(item["text"])}</p></a>'
        for item in DATA["home"].get("startHere", [])
    )
    start_section = f'<section class="home-start"><h2>Choose your test</h2><p class="section-intro">Most visitors should start from one of these three paths, then jump into the specific tool they need.</p><div class="start-grid">{start_items}</div></section>' if start_items else ""
    popular_items = "".join(
        f'<a class="popular-row" href="{esc(item["href"])}"><span>{esc(item["label"])}</span><strong>{esc(item["title"])}</strong><em>{esc(item["text"])}</em></a>'
        for item in DATA["home"].get("popular", [])
    )
    popular_section = f'<section class="home-popular"><h2>High-value tools</h2><div class="popular-list">{popular_items}</div></section>' if popular_items else ""
    cards = []
    for section in DATA["home"]["sections"]:
        links = render_tool_links(section["links"])
        cards.append(f'<section class="home-group"><h2>{esc(section["heading"])}</h2><div class="tool-grid">{links}</div></section>')
    body = f"""<section class="hero home-hero dmv-home-hero">
  <div>
    <p class="eyebrow">DMV-first practice tools</p>
    <h1>DMV practice tests with road-sign images and instant feedback.</h1>
    <p class="lede">Pick a state, switch into image-based road signs, then use a longer mock exam to find weak areas before rereading the official manual.</p>
  </div>
</section>
<section class="notice"><strong>Independent site.</strong> {esc(SITE["disclaimer"])}</section>
{render_dmv_launcher()}
{start_section}
{popular_section}
{''.join(cards)}
{render_ad("Future ad")}"""
    return page_shell(DATA["home"]["title"], DATA["home"]["description"], "/", body, "home-page")


def render_trust(page):
    content = "".join(
        f'<section class="content-section"><h2>{esc(section["heading"])}</h2><p>{esc(section["text"])}</p></section>'
        for section in page["content"]
    )
    links = ""
    if page.get("links"):
        items = "".join(f'<li><a href="{esc(link["url"])}">{esc(link["label"])}</a></li>' for link in page["links"])
        links = f'<section class="sources"><h2>Useful links</h2><ul>{items}</ul></section>'
    body = f"""<section class="hero slim-hero">
  <div>
    <p class="eyebrow">TestDayTools</p>
    <h1>{esc(page["title"])}</h1>
    <p class="lede">{esc(page["description"])}</p>
    {render_last_updated()}
  </div>
</section>
{content}
{links}"""
    return page_shell(page["title"], page["description"], f'/{page["slug"]}.html', body, "trust-page")


def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def build():
    write("index.html", render_home())
    for hub in HUBS:
        write(f'{hub["slug"]}.html', render_hub(hub))
    for tool in DATA["tools"]:
        write(f'{tool["slug"]}.html', render_tool(tool))
    for page in DATA["trustPages"]:
        write(f'{page["slug"]}.html', render_trust(page))

    urls = ["/"] + [f'/{hub["slug"]}.html' for hub in HUBS] + [f'/{tool["slug"]}.html' for tool in DATA["tools"]] + [f'/{page["slug"]}.html' for page in DATA["trustPages"]]
    sitemap_urls = "".join(f"<url><loc>{esc(url_for(path))}</loc></url>" for path in urls)
    write("sitemap.xml", f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{sitemap_urls}</urlset>')
    write("robots.txt", f"User-agent: *\nAllow: /\nSitemap: {SITE['url'].rstrip('/')}/sitemap.xml\n")


if __name__ == "__main__":
    build()
    print("Built static site pages.")
