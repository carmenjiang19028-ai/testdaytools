import subprocess
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
from xml.etree import ElementTree

from scripts import build


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.links = []
        self.ids = set()
        self.title = []
        self.h1 = []
        self._heading = None
        self.canonical = None
        self.indexable = True
        self.refresh = None
        self.questions = []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "a" and attrs.get("href"):
            self.links.append(attrs["href"])
        if attrs.get("id"):
            self.ids.add(attrs["id"])
        if tag in {"title", "h1"}:
            self._heading = getattr(self, tag)
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonical = attrs["href"]
        if tag == "meta" and attrs.get("name") == "robots":
            self.indexable = "noindex" not in attrs.get("content", "").lower()
        if tag == "meta" and attrs.get("http-equiv") == "refresh":
            self.refresh = attrs.get("content")
        if tag == "details" and "data-guide-question" in attrs:
            self.questions.append(attrs["data-guide-question"])

    def handle_endtag(self, tag):
        if tag in {"title", "h1"}:
            self._heading = None

    def handle_data(self, value):
        if self._heading is not None:
            self._heading.append(value)


class DMVContentRelease(unittest.TestCase):
    def test_sitemap_keeps_only_canonical_indexable_pages(self):
        urls = {
            row.text for row in ElementTree.parse(build.ROOT / "sitemap.xml").findall("./{*}url/{*}loc")
        }
        files = {
            p for p in build.ROOT.glob("*.html")
            if p.stem not in build.UNPUBLISHED_SNAPSHOTS and p.stem not in build.MERGED_SLUGS
        }
        self.assertEqual(urls, {build.url_for("/" if p.name == "index.html" else "/" + p.name) for p in files})
        for path in files:
            with self.subTest(path=path.name):
                text = path.read_text()
                page = Page(text)
                self.assertTrue(page.indexable)
                self.assertEqual(page.canonical, build.url_for("/" if path.name == "index.html" else "/" + path.name))
                self.assertNotRegex(text, "fan-made|College Board")
                self.assertLessEqual(text.count("Last updated:"), 1)
                self.assertIn(build.url_for("/terms.html"), page.links)
                for href in page.links:
                    parts = urlsplit(href)
                    if parts.netloc and parts.netloc != "testdaytools.com" or parts.scheme == "mailto":
                        continue
                    if href.startswith("#"):
                        self.assertIn(parts.fragment, page.ids)
                        continue
                    target = parts.path.strip("/")
                    self.assertFalse(parts.query)
                    if not target or target.endswith(".html"):
                        self.assertEqual(parts.scheme, "https")
                        self.assertEqual(parts.netloc, "testdaytools.com")
                        self.assertFalse(parts.fragment)
                        self.assertNotIn(Path(target).stem, build.MERGED_SLUGS)
                    self.assertTrue((build.ROOT / (target or "index.html")).is_file(), href)
                    self.assertNotIn(Path(target).stem, build.ARCHIVED_SLUGS | build.ARCHIVED_STATES | build.UNPUBLISHED_SNAPSHOTS)

    def test_archive_and_github_pages_redirect_fallback(self):
        for slug in build.ARCHIVED_SLUGS | build.ARCHIVED_STATES:
            with self.subTest(slug=slug):
                self.assertFalse((build.ROOT / (slug + ".html")).exists())
                self.assertEqual(len(list((build.ROOT / "_archive").rglob(slug + ".html"))), 1)
        for old, new in build.MERGED_SLUGS.items():
            page = Page((build.ROOT / (old + ".html")).read_text())
            target = build.url_for("/" + new + ".html")
            self.assertEqual(page.canonical, target)
            self.assertEqual(page.refresh, "0; url=" + target)
            self.assertEqual(page.links, [target])

    def test_every_state_guide_contains_answers_before_javascript(self):
        self.assertEqual(len(build.STATE_GUIDES), 8)
        for slug, guide in build.STATE_GUIDES.items():
            with self.subTest(state=guide["state"]):
                text = (build.ROOT / (slug + ".html")).read_text()
                page = Page(text)
                self.assertEqual(page.questions, ["state"] * 10 + ["sign"] * 10)
                self.assertEqual(text.count("<strong>Answer:</strong>"), 20)
                self.assertEqual(text.count("<strong>Manual:</strong>"), 20)
                self.assertEqual(text.count("Last updated:"), 1)
                self.assertIn("Checked against:", text)
                self.assertGreaterEqual(len(guide["rules"]), 5)
                self.assertIn("".join(page.h1), "".join(page.title))
                self.assertTrue(all(source in text for _, _, source in guide["facts"]))
        self.assertEqual((build.ROOT / "index.html").read_text().count("data-state-card "), 8)

    def test_core_page_identity_survives_and_score_table_precedes_calculator(self):
        for slug in (build.ROAD_SIGN_CHEAT_SHEET_SLUG, build.ROAD_SIGN_PICTURE_SLUG):
            current = Page((build.ROOT / (slug + ".html")).read_text())
            baseline = Page(subprocess.check_output(["git", "show", "fa049ce:" + slug + ".html"], cwd=build.ROOT, text=True))
            self.assertEqual((current.title, current.h1, current.canonical), (baseline.title, baseline.h1, baseline.canonical))
        score = (build.ROOT / (build.DMV_SCORE_SLUG + ".html")).read_text()
        parsed = Page(score)
        self.assertEqual(parsed.title, parsed.h1)
        self.assertLess(score.index('id="score-table"'), score.index('id="score-calculator"'))
        self.assertIn("At least 2 of the 4 road-sign questions", score)
        self.assertIn("7 if given 35", score)

    def test_operational_transparency(self):
        about = (build.ROOT / "about.html").read_text()
        contact = (build.ROOT / "contact.html").read_text()
        self.assertIn("jiangxianxian", about)
        self.assertIn("checked manually against official state driver handbooks", about)
        self.assertIn("mailto:carmen@cmpanda.com", about)
        self.assertIn("mailto:carmen@cmpanda.com", contact)
        self.assertTrue((build.ROOT / "terms.html").is_file())


if __name__ == "__main__":
    unittest.main()
