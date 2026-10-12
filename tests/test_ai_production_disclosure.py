import json
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "content/site_data.json").read_text())
TRUST_PAGES = {page["slug"]: page for page in DATA["trustPages"]}


class AIProductionDisclosureTest(unittest.TestCase):
    def test_about_explains_actual_ai_assistance_and_unofficial_status(self):
        section = next(
            item for item in TRUST_PAGES["about"]["content"]
            if item["heading"] == "AI-assisted production"
        )
        for wording in ("draft text", "develop code", "study illustrations", "unofficial study material"):
            self.assertIn(wording, section["text"])
        self.assertIn("official sources remain the authority", section["text"])

    def test_editorial_policy_does_not_invent_expert_review(self):
        section = next(
            item for item in TRUST_PAGES["editorial-policy"]["content"]
            if item["heading"] == "AI assistance and its limits"
        )
        self.assertIn("AI-assisted tools", section["text"])
        self.assertIn("Automated checks", section["text"])
        self.assertIn("do not establish that every item has been reviewed", section["text"])
        self.assertIn("where this site conflicts with an official source, use the official source", section["text"])

    def test_disclosures_and_dates_are_in_generated_pages_and_sitemap(self):
        ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        sitemap = ET.parse(ROOT / "sitemap.xml")
        dates = {
            node.findtext("s:loc", namespaces=ns): node.findtext("s:lastmod", namespaces=ns)
            for node in sitemap.findall("s:url", ns)
        }
        for slug, heading in (
            ("about", "AI-assisted production"),
            ("editorial-policy", "AI assistance and its limits"),
        ):
            with self.subTest(slug=slug):
                source = TRUST_PAGES[slug]
                section = next(item for item in source["content"] if item["heading"] == heading)
                page = (ROOT / f"{slug}.html").read_text()
                self.assertIn(f"<h2>{heading}</h2>", page)
                self.assertIn(section["text"], page)
                self.assertEqual(source["lastUpdated"], "October 12, 2026")
                self.assertIn("<time>October 12, 2026</time>", page)
                self.assertEqual(dates[f"https://testdaytools.com/{slug}.html"], "2026-10-12")


if __name__ == "__main__":
    unittest.main()
