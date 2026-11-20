import importlib.util
import json
from html.parser import HTMLParser
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("skill_builder", ROOT / "scripts/build_skill_tools.py")
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)
MEASUREMENT_ID = json.loads((ROOT / "content/site_data.json").read_text())["site"]["analytics"]["ga4MeasurementId"]


class Scripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources = []
        self.footer = False
        self.footer_links = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script" and attrs.get("src"):
            self.sources.append(attrs["src"])
        if tag == "footer":
            self.footer = True
        if self.footer and tag == "a" and attrs.get("href"):
            self.footer_links.append(attrs["href"])

    def handle_endtag(self, tag):
        if tag == "footer":
            self.footer = False


@pytest.mark.parametrize("slug", ["skills-practice", "clerical-checking-practice", "filing-practice"])
def test_skills_pages_have_one_existing_google_tag_and_no_ad_script(slug):
    html = (ROOT / f"{slug}.html").read_text()
    scripts = Scripts()
    scripts.feed(html)
    assert scripts.sources == [f"https://www.googletagmanager.com/gtag/js?id={MEASUREMENT_ID}"]
    assert html.count(f"gtag('config', {json.dumps(MEASUREMENT_ID)})") == 1
    assert "adsbygoogle" not in html
    assert "window.trackSkillAnswer = function(tool)" in html
    assert scripts.footer_links.count("privacy.html") == 1
    assert "Google Analytics measures limited usage." in html
    assert "No account, no real personal data" not in html


@pytest.mark.parametrize("analytics", [{}, {"ga4MeasurementId": ""}, {"ga4MeasurementId": "not-configured"}])
def test_missing_analytics_configuration_does_not_invent_an_account(monkeypatch, analytics):
    monkeypatch.setattr(BUILDER, "SITE", {"analytics": analytics})
    assert BUILDER.render_analytics_tag() == ""
    page = BUILDER.shell("Practice", "Fictional records", "<h1>Practice</h1>")
    assert "Google Analytics measures limited usage." not in page
    assert 'href="privacy.html"' in page


def test_custom_events_only_send_tool_page_path_and_attempt_type():
    tag = BUILDER.render_analytics_tag()
    assert "Object.assign({tool: tool, page_path: window.location.pathname}, extra || {})" in tag
    assert "'skills_practice_start'" in tag
    assert "'skills_practice_complete'" in tag
    assert "'skills_practice_retry'" in tag
    assert "attempt_type: attemptType || 'first'" in tag
    assert "['clerical_checking', 'filing_order'].includes(tool)" in tag
    assert "localStorage" not in tag
    assert "sessionStorage" not in tag
    assert "send_page_view" not in tag
