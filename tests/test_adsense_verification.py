import unittest
from html.parser import HTMLParser
from pathlib import Path
from unittest.mock import patch

from scripts import build


class HeadParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_head = False
        self.account_tags = []
        self.script_sources = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "head":
            self.in_head = True
        if tag == "meta" and attrs.get("name") == "google-adsense-account":
            self.account_tags.append((self.in_head, attrs.get("content")))
        if tag == "script" and attrs.get("src"):
            self.script_sources.append(attrs["src"])

    def handle_endtag(self, tag):
        if tag == "head":
            self.in_head = False


class AdSenseVerificationTest(unittest.TestCase):
    def test_official_account_renders_only_a_meta_tag(self):
        self.assertEqual(
            build.render_adsense_verification_tag(),
            '  <meta name="google-adsense-account" content="ca-pub-9419021437320877">\n',
        )

    def test_missing_configuration_renders_nothing(self):
        with patch.dict(build.SITE, {"adsenseVerification": {}}):
            self.assertEqual(build.render_adsense_verification_tag(), "")

    def test_malformed_ids_fail_closed(self):
        for publisher_id in ("pub-9419021437320877", "ca-pub-123", "ca-pub-941902143732087x", 'ca-pub-9419021437320877"'):
            with self.subTest(publisher_id=publisher_id):
                with patch.dict(build.SITE, {"adsenseVerification": {"publisherId": publisher_id}}):
                    with self.assertRaises(ValueError):
                        build.render_adsense_verification_tag()

    def test_all_generated_pages_have_one_head_tag_and_no_ad_loader(self):
        pages = list(Path(build.ROOT).glob("*.html"))
        self.assertTrue(pages)
        for page in pages:
            with self.subTest(page=page.name):
                parser = HeadParser()
                parser.feed(page.read_text())
                self.assertEqual(parser.account_tags, [(True, "ca-pub-9419021437320877")])
                self.assertFalse(any("googlesyndication.com" in src for src in parser.script_sources))


if __name__ == "__main__":
    unittest.main()
