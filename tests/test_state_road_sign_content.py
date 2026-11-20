import json
import unittest
from pathlib import Path
from scripts.build import render_state_rule_practice


ROOT = Path(__file__).resolve().parents[1]
STATE_SLUGS = (
    "georgia-dds-road-signs-practice",
    "north-carolina-dmv-road-signs-practice",
    "ohio-bmv-road-signs-practice",
    "virginia-dmv-road-signs-practice",
    "michigan-sos-road-signs-practice",
    "arizona-mvd-road-signs-practice",
)


class StateRoadSignContentTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / "content/site_data.json").read_text())
        cls.tools = {tool["slug"]: tool for tool in cls.data["tools"]}
        cls.sitemap = (ROOT / "sitemap.xml").read_text()

    def test_duplicate_shared_quiz_is_removed_but_state_guides_remain_indexable(self):
        for slug in STATE_SLUGS:
            with self.subTest(slug=slug):
                tool = self.tools[slug]
                page = (ROOT / f"{slug}.html").read_text()
                self.assertFalse(tool.get("quiz"))
                self.assertFalse(tool.get("quizModes"))
                self.assertTrue(tool.get("body"))
                self.assertGreaterEqual(len(tool.get("faq", [])), 2)
                self.assertGreaterEqual(len(tool.get("sources", [])), 1)
                self.assertIn(f"/{slug}.html", self.sitemap)
                self.assertNotIn('name="robots" content="noindex', page)
                self.assertNotIn("data-mode-panel=", page)
                self.assertNotIn("Start image quiz", page)
                self.assertNotIn("24-question", page)
                self.assertIn("road-signs-practice-test.html", page)
                self.assertIn('id="sources"', page)

    def test_ads_txt_uses_the_configured_publisher_id(self):
        publisher_id = self.data["site"]["adsenseVerification"]["publisherId"]
        expected = f"google.com, {publisher_id.removeprefix('ca-')}, DIRECT, f08c47fec0942fa0\n"
        self.assertEqual((ROOT / "ads.txt").read_text(), expected)

    def test_illinois_school_case_is_distinct_from_the_twenty_question_drill(self):
        slug = "illinois-dmv-road-signs-practice"
        tool = self.tools[slug]
        page = (ROOT / f"{slug}.html").read_text()
        lesson = tool["stateRulePractice"]
        self.assertEqual(len(lesson["scenarios"]), 2)
        for value in ["6:30 a.m.", "4 p.m.", "20 mph", "posted"]:
            self.assertIn(value, lesson["scenarios"][0]["answer"])
        self.assertIn("appropriate posted signs", lesson["scenarios"][1]["answer"])
        self.assertIn(render_state_rule_practice(lesson), page)
        self.assertIn('href="#illinois-school-zone"', page)
        self.assertEqual(tool["quizModes"][0]["passScore"], 16)
        self.assertIn('data-total="20" data-pass-score="16"', page)

    def test_ny_cases_cover_city_default_yield_and_red_arrow(self):
        slug = "new-york-dmv-road-signs-practice"
        lesson = self.tools[slug]["stateRulePractice"]
        page = (ROOT / f"{slug}.html").read_text()
        city, crossing, arrow = lesson["scenarios"]
        self.assertIn("Queens is in New York City", city["answer"])
        self.assertIn("after a full stop and yielding", city["answer"])
        self.assertIn("yield", crossing["answer"])
        self.assertIn("Do not turn in the direction of a steady red arrow", arrow["answer"])
        self.assertIn(render_state_rule_practice(lesson), page)
        self.assertIn('href="#new-york-right-on-red"', page)


if __name__ == "__main__":
    unittest.main()
