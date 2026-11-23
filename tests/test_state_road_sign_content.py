import json
import unittest
from pathlib import Path
from urllib.parse import urlsplit
from xml.etree import ElementTree
from scripts.build import dmv_requirement_records, render_sign_recall, render_state_rule_practice


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

    def test_north_carolina_recall_uses_both_official_chart_groups(self):
        slug = "north-carolina-dmv-road-signs-practice"
        lesson = self.tools[slug]["toolWidget"]
        page = (ROOT / f"{slug}.html").read_text()
        self.assertEqual([card["image"] for card in lesson["cards"]], ["stop", "signal-ahead", "yield", "slippery"])
        self.assertEqual([card["cue"].split(":")[0] for card in lesson["cards"]], ["Regulatory", "Warning"] * 2)
        self.assertEqual(
            [source["url"].rsplit("/", 1)[-1] for source in lesson["sources"]],
            ["regulatory-signs.pdf", "warning-signs.pdf"],
        )
        self.assertIn(render_sign_recall(lesson), page)
        self.assertIn('href="#north-carolina-sign-recall"', page)
        self.assertIn('href="road-signs-practice-test.html?mode=road-signs-core#practice"', page)

    def test_virginia_left_on_red_lesson_keeps_round_and_arrow_rules_distinct(self):
        slug = "virginia-dmv-road-signs-practice"
        lesson = self.tools[slug]["stateRulePractice"]
        page = (ROOT / f"{slug}.html").read_text()
        allowed, two_way, banned, arrow = lesson["scenarios"]
        self.assertIn("steady round red", allowed["question"])
        self.assertIn("after a full stop and after yielding", allowed["answer"])
        self.assertIn("Both streets must be one-way", two_way["answer"])
        self.assertIn("posted restriction overrides", banned["answer"])
        self.assertIn("No sign permits", arrow["question"])
        self.assertIn("wait for a signal", arrow["answer"])
        self.assertIn("Left on Red Arrow After Stop", arrow["answer"])
        self.assertEqual([urlsplit(source["url"]).netloc for source in lesson["sources"]],
                         ["www.dmv.virginia.gov", "law.lis.virginia.gov"])
        self.assertIn(render_state_rule_practice(lesson), page)
        self.assertIn('href="#virginia-left-on-red"', page)
        self.assertIn('href="#virginia-knowledge-retest"', page)

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

    def test_new_jersey_move_over_cases_cover_the_amended_scope_and_safe_fallback(self):
        slug = "new-jersey-mvc-road-signs-practice"
        lesson = self.tools[slug]["stateRulePractice"]
        page = (ROOT / f"{slug}.html").read_text()
        asset = lesson["imageAsset"]
        svg = ElementTree.parse(ROOT / asset["src"]).getroot()
        self.assertEqual(svg.get("viewBox"), f'0 0 {asset["width"]} {asset["height"]}')
        clear, blocked, officer = lesson["scenarios"]
        self.assertIn("stationary vehicles displaying flashing or blinking lights", clear["answer"])
        self.assertIn("change to the lane that is not next to the stopped car", clear["answer"])
        self.assertIn("below the posted limit", blocked["answer"])
        self.assertIn("be ready to stop", blocked["answer"])
        self.assertIn("Follow the officer's direction", officer["answer"])
        self.assertTrue(lesson["sources"][0]["url"].endswith("/AL25/248_.PDF"))
        self.assertIn(render_state_rule_practice(lesson), page)
        self.assertIn('data-total="20" data-pass-score="16"', page)
        permit = (ROOT / "new-jersey-mvc-permit-practice-test.html").read_text()
        self.assertIn(f'href="{slug}.html#new-jersey-move-over"', permit)

    def test_florida_course_paths_separate_course_and_exam(self):
        slug = "florida-class-e-knowledge-exam-tlsae"
        course_paths = next(group for group in self.tools[slug]["cardGroups"] if group.get("id") == "florida-course-path")
        teen, adult, other = course_paths["items"]
        self.assertIn("Under 18", teen["label"])
        self.assertIn("is not a substitute", teen["text"])
        self.assertIn("18 or older", adult["label"])
        self.assertIn("another jurisdiction", adult["text"])
        self.assertIn("one year from course completion", other["text"])
        complete = self.tools[slug]["cardGroups"][1]["items"][0]
        self.assertIn("class-e-knowledge-exam-driving-skills-test", complete["href"])
        for name in ("florida-dmv-permit-practice-test", "florida-dmv-road-signs-practice", "florida-dmv-permit-documents-checklist"):
            with self.subTest(page=name):
                page = (ROOT / f"{name}.html").read_text()
                self.assertIn(f'href="{slug}.html#florida-course-path"', page)
                self.assertNotIn("TLSAE may be required", page)

    def test_florida_scored_course_questions_match_the_current_paths(self):
        for bank, age, answer in (("florida", "16-year-old", "DETS"), ("floridaMock", "22-year-old", "TLSAE")):
            with self.subTest(bank=bank):
                item, = [q for q in self.data["quizzes"][bank] if q.get("category") == "Florida licensing"]
                self.assertIn(age, item["q"])
                self.assertIn(answer, item["choices"][item["answer"]])
                self.assertIn("Class E", item["explanation"])
                self.assertEqual(len(item["choices"]), 3)
        page = (ROOT / "florida-dmv-permit-practice-test.html").read_text()
        self.assertNotIn("first-time Florida applicants must complete a TLSAE course", page)
        self.assertIn("Use 32 of 40 as the target for this site", page)
        self.assertIn("Knowledge Exam requires 40 of 50", page)

    def test_florida_exam_language_guidance_is_sourced_and_not_a_course_rule(self):
        page = (ROOT / "florida-class-e-knowledge-exam-tlsae.html").read_text()
        self.assertIn("statewide update effective February 6, 2026", page)
        self.assertIn("A translated study guide is not a translated exam", page)
        self.assertIn("https://www.hillstaxfl.gov/news/statewide-policy-change-", page)
        self.assertIn("https://www.flsenate.gov/Laws/Statutes/2026/0322.095", page)
        self.assertIn("https://www.flsenate.gov/Laws/Statutes/2026/322.1615", page)

    def test_michigan_manual_edition_and_testing_choices_do_not_overlap(self):
        slug = "michigan-sos-road-signs-practice"
        tool = self.tools[slug]
        page = (ROOT / f"{slug}.html").read_text()
        self.assertNotIn("October 2025", page)
        self.assertIn("November 2026 English edition", page)
        self.assertIn("older editions", page)
        self.assertIn("page 28", page)
        self.assertIn("page 73", page)
        group = tool["cardGroups"][0]
        teen, adult, language = group["items"]
        self.assertIn("Segment 1", teen["text"])
        self.assertTrue(teen["href"].endswith("/new-drivers-under-18"))
        self.assertIn("Passing online does not issue a permit", adult["text"])
        self.assertIn("webcam", adult["text"])
        self.assertTrue(adult["href"].endswith("/new-drivers-18-older"))
        self.assertTrue(language["href"].endswith("/language-services"))
        self.assertIn(f'id="{group["id"]}"', page)
        self.assertIn(f'href="#{group["id"]}"', page)

    def test_michigan_left_cases_keep_the_two_routes_and_signals_distinct(self):
        slug = "michigan-sos-road-signs-practice"
        lesson = self.tools[slug]["stateRulePractice"]
        page = (ROOT / f"{slug}.html").read_text()
        main, side, red = lesson["scenarios"]
        self.assertIn("Go straight through", main["answer"])
        self.assertIn("turn right onto the cross street", main["answer"])
        self.assertIn("Turn right onto the main road first", side["answer"])
        self.assertIn("there is no final right turn", side["answer"])
        self.assertIn("Wait at the crossover", red["answer"])
        self.assertTrue(lesson["sources"][1]["url"].endswith("/michigan-lefts"))
        asset = lesson["imageAsset"]
        svg = ElementTree.parse(ROOT / asset["src"]).getroot()
        self.assertEqual(svg.get("viewBox"), f'0 0 {asset["width"]} {asset["height"]}')
        self.assertIn(render_state_rule_practice(lesson), page)
        self.assertIn('href="#michigan-left-practice"', page)
        self.assertNotIn("data-quiz=", page)

    def test_active_pages_do_not_contain_internal_sign_study_copy(self):
        sitemap = ElementTree.parse(ROOT / "sitemap.xml")
        locations = sitemap.findall("m:url/m:loc", {"m": "http://www.sitemaps.org/schemas/sitemap/0.9"})
        self.assertTrue(locations)
        names = [urlsplit(loc.text).path.lstrip("/") or "index.html" for loc in locations]
        names += ["texas-dmv-permit-practice-test.html", "illinois-dmv-permit-practice-test.html"]
        for name in names:
            with self.subTest(page=name):
                self.assertNotRegex((ROOT / name).read_text(),
                                    r"(?i)search-result competitors|high-intent facts|many people search DMV|a useful practice site should")

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
