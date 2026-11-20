import unittest
from html.parser import HTMLParser
from pathlib import Path
from unittest.mock import patch
from xml.etree import ElementTree

from scripts import build


class PageMetadata(HTMLParser):
    canonical = None
    noindex = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonical = attrs.get("href")
        if tag == "meta" and attrs.get("name") == "robots":
            self.noindex = "noindex" in attrs.get("content", "").lower().replace(",", " ").split()


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
            if page.name == "road-sign-learning-loop.html":
                # The independently maintained lab keeps its existing listing policy.
                continue
            meta = PageMetadata()
            meta.feed(page.read_text())
            url = build.url_for("/" if page.name == "index.html" else f"/{page.name}")
            self.assertEqual(meta.canonical, url)
            if not meta.noindex:
                expected.add(url)
        self.assertEqual(len(listed), len(set(listed)))
        self.assertEqual(set(listed), expected)

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
