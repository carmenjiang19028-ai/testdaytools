import json
import unittest
from functools import lru_cache
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit
from unittest.mock import patch
from xml.etree import ElementTree

from scripts import build


class PageMetadata(HTMLParser):
    canonical = None
    noindex = False

    def __init__(self):
        super().__init__()
        self.ids = set()
        self.links = []
        self.json_ld = []
        self.has_scored_quiz = False
        self.json_script = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonical = attrs.get("href")
        if tag == "meta" and attrs.get("name") == "robots":
            self.noindex = "noindex" in attrs.get("content", "").lower().replace(",", " ").split()
        if attrs.get("id"):
            self.ids.add(attrs["id"])
        if tag == "a" and attrs.get("href"):
            self.links.append(attrs["href"])
        if "data-quiz" in attrs:
            self.has_scored_quiz = True
        if tag == "script" and attrs.get("type") == "application/ld+json":
            self.json_script = []

    def handle_data(self, data):
        if self.json_script is not None:
            self.json_script.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.json_script is not None:
            self.json_ld.append(json.loads("".join(self.json_script)))
            self.json_script = None


class StaticBuildTest(unittest.TestCase):
    def test_checked_in_outputs_match_without_writing(self):
        with patch.object(Path, "write_bytes", side_effect=AssertionError("Build check wrote a file")), \
             patch.object(Path, "write_text", side_effect=AssertionError("Build check wrote a file")):
            count, drift = build.check_build()
        self.assertGreater(count, 63)
        self.assertEqual(drift, [])

    def test_check_reports_stale_file_and_missing_output(self):
        original_read = Path.read_bytes
        original_exists = Path.is_file

        def read(path):
            if path.name == "sitemap.xml":
                return b"<stale/>"
            return original_read(path)

        def exists(path):
            return path.name != "filing-practice.html" and original_exists(path)

        with patch.object(Path, "read_bytes", read), patch.object(Path, "is_file", exists):
            _, drift = build.check_build()
        self.assertEqual(set(drift), {"sitemap.xml", "filing-practice.html"})

    def test_sitemap_covers_the_published_canonical_pages(self):
        ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        sitemap = ElementTree.parse(build.ROOT / "sitemap.xml")
        listed = [node.text for node in sitemap.findall("s:url/s:loc", ns)]
        expected = set()
        for page in build.ROOT.glob("*.html"):
            meta = PageMetadata()
            meta.feed(page.read_text())
            url = build.url_for("/" if page.name == "index.html" else f"/{page.name}")
            self.assertEqual(meta.canonical, url)
            if not meta.noindex:
                expected.add(url)
        self.assertEqual(len(listed), len(set(listed)))
        self.assertEqual(set(listed), expected)

    def test_sitemap_dates_the_existing_contrast_lab(self):
        sitemap = ElementTree.parse(build.ROOT / "sitemap.xml")
        entries = [
            entry for entry in sitemap.findall("./{*}url")
            if entry.findtext("{*}loc") == build.url_for("/road-sign-learning-loop.html")
        ]
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0].findtext("{*}lastmod"), "2026-11-24")

    def test_sitemap_pages_link_to_existing_internal_files_and_anchors(self):
        site = urlsplit(build.SITE["url"])

        @lru_cache(maxsize=None)
        def inspect(file):
            page = PageMetadata()
            page.feed(file.read_text())
            return page

        def page_path(url_path):
            path = unquote(url_path).lstrip("/")
            if not path or path.endswith("/"):
                path += "index.html"
            return build.ROOT / path

        sitemap = ElementTree.parse(build.ROOT / "sitemap.xml")
        broken = set()
        for loc in sitemap.findall("./{*}url/{*}loc"):
            source = page_path(urlsplit(loc.text).path)
            for link in inspect(source).links:
                target = urlsplit(urljoin(loc.text, link))
                if target.scheme not in {"http", "https"} or target.hostname not in {site.hostname, f"www.{site.hostname}"}:
                    continue
                file = page_path(target.path)
                anchor = unquote(target.fragment).split(":~:", 1)[0]
                if not file.is_file() or (anchor and file.suffix == ".html" and anchor not in inspect(file).ids):
                    broken.add((source.name, link))
        self.assertEqual(broken, set())

    def test_only_indexable_quiz_pages_describe_themselves_as_practice_tests(self):
        sitemap = ElementTree.parse(build.ROOT / "sitemap.xml")
        comparisons = []
        for loc in sitemap.findall("./{*}url/{*}loc"):
            name = urlsplit(loc.text).path.lstrip("/") or "index.html"
            page = PageMetadata()
            page.feed((build.ROOT / name).read_text())
            claims_test = any(item.get("learningResourceType") == "Practice test"
                              for item in page.json_ld)
            comparisons.append(page.has_scored_quiz)
            with self.subTest(page=name):
                self.assertEqual(claims_test, page.has_scored_quiz)
        self.assertIn(True, comparisons)
        self.assertIn(False, comparisons)

    def test_dmv_practice_distinguishes_local_answers_from_analytics_totals(self):
        for tool in build.TOOL_BY_SLUG.values():
            if tool.get("category") != "DMV":
                continue
            notice = build.render_trust_strip(tool)
            with self.subTest(page=tool["slug"]):
                if tool.get("quiz") or tool.get("quizModes"):
                    self.assertIn("Selected answers stay in this browser", notice)
                    self.assertIn("Google Analytics may receive totals, including correct and missed counts.", notice)
                    self.assertIn('href="privacy.html"', notice)
                else:
                    self.assertNotIn("Google Analytics may receive totals", notice)

    def test_accurately_labeled_resources_keep_their_existing_breadcrumb(self):
        cases = {
            "ap-exam-day-checklist": "Checklist",
            "digital-sat-checklist": "Checklist",
            "digital-sat-bluebook-checklist": "Checklist",
            "dmv-test-day-checklist": "Checklist",
            "florida-dmv-permit-documents-checklist": "Checklist",
            "sat-test-dates-2026-2027": "Planning tool",
            "sat-august-22-2026-planning": "Planning tool",
            "sat-practice-test-review-template": "Worksheet",
            "road-sign-shapes-and-colors-finder": "Reference guide",
            "dmv-road-sign-flashcards": "Flashcards",
            "dmv-permit-test-question-of-the-day": "Practice questions",
            "dmv-permit-test-mistake-log": "Mistake log",
            "dmv-permit-test-study-plan": "Study plan",
            "dmv-road-signs-cheat-sheet": ["Cheat sheet", "Worksheet", "Answer key"],
            "digital-sat-score-calculator": None,
            "2026-ap-exam-schedule": None,
        }
        for slug, kind in cases.items():
            with self.subTest(page=slug):
                page = PageMetadata()
                page.feed((build.ROOT / f"{slug}.html").read_text())
                resource, breadcrumbs = page.json_ld[:2]
                self.assertEqual(resource["url"], page.canonical)
                self.assertEqual(resource["@type"], "LearningResource" if kind else "WebPage")
                self.assertEqual(resource.get("learningResourceType"), kind)
                self.assertEqual(breadcrumbs["@type"], "BreadcrumbList")
                self.assertEqual(breadcrumbs["itemListElement"][-1]["item"], page.canonical)

    def test_retired_snapshots_are_not_generated(self):
        outputs = {}
        build.build(outputs.__setitem__)
        for tool in build.DATA["tools"]:
            if tool.get("indexable", True):
                continue
            filename = f'{tool["slug"]}.html'
            self.assertNotIn(filename, outputs)
            meta = PageMetadata()
            meta.feed((build.ROOT / filename).read_text())
            self.assertTrue(meta.noindex, filename)


if __name__ == "__main__":
    unittest.main()
