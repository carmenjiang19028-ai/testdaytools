import json
import unittest
from pathlib import Path
from urllib.parse import urlsplit
from xml.etree import ElementTree
from scripts.build import dmv_requirement_records, render_state_rule_practice


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

    def test_texas_work_zone_drawing_and_answers_agree(self):
        slug = "texas-dmv-road-signs-practice"
        lesson = self.tools[slug]["stateRulePractice"]
        page = (ROOT / f"{slug}.html").read_text()
        asset = lesson["imageAsset"]
        svg = ElementTree.parse(ROOT / asset["src"]).getroot()
        ns = {"s": "http://www.w3.org/2000/svg"}
        self.assertEqual(svg.get("viewBox"), f'0 0 {asset["width"]} {asset["height"]}')
        self.assertEqual(
            [(pattern.get("id"), pattern.get("patternTransform")) for pattern in svg.findall(".//s:pattern", ns)],
            [("down-right", "rotate(-45)"), ("down-left", "rotate(45)")],
        )
        self.assertEqual([rect.get("fill") for rect in svg.findall("s:rect", ns)], ["url(#down-right)", "url(#down-left)"])
        self.assertIn("lower right", lesson["imageLabel"])
        self.assertIn("lower left", lesson["imageLabel"])
        barricade, panel, flagger = lesson["scenarios"]
        self.assertIn("A descends toward your right", barricade["answer"])
        self.assertIn("B descends toward your left", panel["answer"])
        self.assertIn("Stop in your lane and wait", flagger["answer"])
        self.assertIn("Chapter 5, p. 36", lesson["sources"][0]["label"])
        self.assertIn(render_state_rule_practice(lesson), page)
        self.assertIn('href="#texas-work-zone-panels"', page)
        self.assertIn('data-total="20" data-pass-score="16"', page)
        self.assertNotIn("Search-result competitors", page)

    def test_pennsylvania_school_bus_cases_include_effective_date_and_both_roadways(self):
        slug = "pennsylvania-dmv-road-signs-practice"
        lesson = self.tools[slug]["stateRulePractice"]
        page = (ROOT / f"{slug}.html").read_text()
        asset = lesson["imageAsset"]
        svg = ElementTree.parse(ROOT / asset["src"]).getroot()
        self.assertEqual(svg.get("viewBox"), f'0 0 {asset["width"]} {asset["height"]}')
        painted, divided, amber = lesson["scenarios"]
        self.assertIn("Drivers in both directions must stop", painted["answer"])
        self.assertIn("10 feet through October 21, 2027", painted["answer"])
        self.assertIn("15 feet on October 22, 2027", painted["answer"])
        self.assertIn("children to reach safety", painted["answer"])
        self.assertIn("Only the driver on the opposite roadway", divided["answer"])
        self.assertIn("same roadway and must stop", divided["answer"])
        self.assertIn("Slow down and be ready to stop", amber["answer"])
        self.assertEqual(len(lesson["sources"]), 3)
        self.assertIn(render_state_rule_practice(lesson), page)
        self.assertIn('data-total="20" data-pass-score="16"', page)
        permit = (ROOT / "pennsylvania-dmv-permit-practice-test.html").read_text()
        self.assertIn(f'href="{slug}.html#pennsylvania-school-bus"', permit)

    def test_active_pages_do_not_contain_internal_sign_study_copy(self):
        sitemap = ElementTree.parse(ROOT / "sitemap.xml")
        locations = sitemap.findall("m:url/m:loc", {"m": "http://www.sitemaps.org/schemas/sitemap/0.9"})
        self.assertTrue(locations)
        for loc in locations:
            name = urlsplit(loc.text).path.lstrip("/") or "index.html"
            with self.subTest(page=name):
                self.assertNotIn("Search-result competitors", (ROOT / name).read_text())

    def test_full_mixed_benchmark_matches_an_available_quiz(self):
        records = dmv_requirement_records()
        self.assertEqual(len(records), 7)
        unavailable = set()
        for item in records:
            if not item["mixedPracticeUrl"]:
                unavailable.add(item["value"])
                self.assertEqual(item["practiceTarget"], "No full mixed practice set here")
                continue
            target = urlsplit(item["mixedPracticeUrl"])
            page = (ROOT / target.path).read_text()
            self.assertNotIn('name="robots" content="noindex', page)
            self.assertEqual((target.query, target.fragment), ("mode=mock", "practice"))
            self.assertIn('data-mode-button="mock"', page)
            self.assertIn('data-total="40" data-pass-score="32"', page)
            self.assertEqual(item["practiceTarget"], "32 of 40 in the full mixed set")
        self.assertEqual(unavailable, {"texas", "illinois"})


if __name__ == "__main__":
    unittest.main()
