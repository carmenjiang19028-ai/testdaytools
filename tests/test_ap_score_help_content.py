import json
import runpy
import unittest
from pathlib import Path
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]
RELEASE = "ap-score-release-date-2026"
MISSING = "ap-scores-delayed-missing-2026"
OFFICIAL_HELP = "https://apstudents.collegeboard.org/help-center/some-my-scores-are-not-yet-available-what-do-i-do"
BUILD = runpy.run_path(str(ROOT / "scripts/build.py"))
TOOLS = BUILD["TOOL_BY_SLUG"]
PAGES = {slug: (ROOT / f"{slug}.html").read_text() for slug in (RELEASE, MISSING)}


class APScoreHelpContentTest(unittest.TestCase):
    def test_release_is_historical_and_routes_to_current_information(self):
        page = PAGES[RELEASE]
        self.assertIn("Monday, July 6, 2026", page)
        self.assertIn("That release has passed", page)
        self.assertNotIn("data-countdown", page)
        self.assertNotIn("Wait for official updates before contacting support", page)
        self.assertIn('href="https://apstudents.collegeboard.org/calendar"', page)
        self.assertIn(f'href="{MISSING}.html"', page)

    def test_missing_score_is_not_the_same_as_pending_college_processing(self):
        rows = TOOLS[MISSING]["tables"][0]["rows"]
        self.assertIn("Contact AP Services", rows[0][2])
        self.assertIn("checkpoint for 2026 has passed", rows[0][2])
        self.assertIn("Account Help", rows[1][2])
        self.assertIn("admissions or registrar", rows[2][2])
        self.assertIn("matched and processed", rows[2][2])
        self.assertIn("different year", rows[3][0])
        self.assertNotIn("AP EAMCET", PAGES[MISSING])

    def test_examples_and_private_worksheet_are_available_without_signin(self):
        examples = json.loads((ROOT / "content/study_examples.json").read_text())[MISSING]
        self.assertEqual(len(examples["examples"]), 3)
        page = PAGES[MISSING]
        self.assertIn(f'href="#{examples["id"]}"', page)
        self.assertIn(f'id="{examples["id"]}"', page)
        self.assertIn("Copy into a private note", page)
        self.assertIn("never include your password", page)
        self.assertNotIn("<form ", page)
        self.assertNotIn("<textarea", page)

    def test_pages_and_sitemap_keep_existing_urls_and_ad_boundary(self):
        sitemap = ElementTree.parse(ROOT / "sitemap.xml")
        urls = {row[0].text for row in sitemap.getroot()}
        self.assertIn("https://testdaytools.com/skills-practice.html", urls)
        self.assertIn("https://testdaytools.com/clerical-checking-practice.html", urls)
        self.assertIn("https://testdaytools.com/filing-practice.html", urls)
        for slug, page in PAGES.items():
            url = f"https://testdaytools.com/{slug}.html"
            self.assertIn(url, urls)
            self.assertIn(f'rel="canonical" href="{url}"', page)
            self.assertIn(f'href="{OFFICIAL_HELP}"', page)
            self.assertEqual(page, BUILD["render_tool"](TOOLS[slug]))
            self.assertEqual(page.count('name="google-adsense-account"'), 1)
            self.assertEqual(page.count("googletagmanager.com/gtag/js"), 1)
            self.assertNotIn("pagead2.googlesyndication.com", page)


if __name__ == "__main__":
    unittest.main()
