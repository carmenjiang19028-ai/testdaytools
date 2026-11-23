import json
import unittest
import xml.etree.ElementTree as ET
from datetime import datetime
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
                updated = source["lastUpdated"]
                self.assertIn(f"<time>{updated}</time>", page)
                self.assertEqual(dates[f"https://testdaytools.com/{slug}.html"],
                                 datetime.strptime(updated, "%B %d, %Y").date().isoformat())

    def test_editorial_dates_and_material_corrections_are_verifiable(self):
        policy = TRUST_PAGES["editorial-policy"]
        sections = {section["heading"]: section["text"] for section in policy["content"]}
        self.assertIn("a change to that page", sections["Update process"])
        self.assertIn("date next to a source", sections["Update process"])
        self.assertNotIn("site-wide", sections["Update process"])
        self.assertIn("not a review of every road rule", sections["Road-sign correction record"])
        self.assertIn("PDF title and page number", sections["Corrections"])
        href = "road-sign-learning-loop.html#material-review"
        self.assertIn(href, {link["url"] for link in policy["links"]})
        self.assertIn(f'href="{href}"', (ROOT / "editorial-policy.html").read_text())
        record = (ROOT / "road-sign-learning-loop.html").read_text().split('id="material-review"', 1)[1]
        self.assertIn("classroom school sign now uses the shared five-sided artwork", record)
        self.assertIn("Corrected Stop Ahead", record)


if __name__ == "__main__":
    unittest.main()
