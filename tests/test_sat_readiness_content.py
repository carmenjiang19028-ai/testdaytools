import json
from datetime import datetime
from html import escape
from xml.etree import ElementTree
import unittest
from pathlib import Path
from scripts.build import render_examples


ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "content/site_data.json").read_text())
TOOLS = {tool["slug"]: tool for tool in DATA["tools"]}
CHECKLISTS = ("digital-sat-checklist", "digital-sat-bluebook-checklist")


class SATReadinessContentTest(unittest.TestCase):
    def test_weekend_ticket_is_required_not_a_center_option(self):
        for slug in CHECKLISTS:
            with self.subTest(slug=slug):
                items = [item for item in TOOLS[slug]["checklist"] if "admission ticket" in item]
                self.assertEqual(len(items), 1)
                self.assertIn("For SAT Weekend with a device you bring, carry", items[0])
                self.assertIn("printed copy is preferred", items[0])
                self.assertIn("approved College Board loaner, get the ticket at pickup after setup", items[0])
                self.assertIn("For approved paper testing", items[0])
                self.assertNotIn("if the test center", items[0])
                self.assertIn(escape(items[0]), (ROOT / f"{slug}.html").read_text())

    def test_weekend_setup_and_physical_id_are_explicit(self):
        items = TOOLS["digital-sat-checklist"]["checklist"]
        self.assertTrue(any("SAT Weekend" in item and "1-5 days" in item for item in items))
        self.assertTrue(any("physical photo ID" in item and "not an electronic copy" in item for item in items))

    def test_college_board_lending_has_its_own_deadline_and_exception(self):
        tool = TOOLS["sat-device-troubleshooting-guide"]
        loaner = next(section["text"] for section in tool["body"] if section["heading"] == "Make a backup conversation early")
        self.assertIn("SAT Weekend", loaner)
        self.assertIn("at least 30 days", loaner)
        self.assertIn("does not guarantee approval", loaner)
        self.assertIn("30 minutes before standard check-in", loaner)
        self.assertIn("complete Bluebook exam setup", loaner)
        self.assertIn("https://satsuite.collegeboard.org/sat/device-lending", [source["url"] for source in tool["sources"]])
        page = (ROOT / "sat-device-troubleshooting-guide.html").read_text()
        self.assertIn(loaner, page)
        self.assertNotIn("Test morning is too late to solve hardware access", page)

    def test_photo_id_cases_distinguish_name_age_location_and_school_day(self):
        tool = TOOLS["digital-sat-checklist"]
        page = (ROOT / "digital-sat-checklist.html").read_text()
        group = next(group for group in tool["cardGroups"] if group.get("id") == "sat-id-cases")
        name, age, travel, form, school_day = group["items"]
        self.assertIn("at least 30 days", name["text"])
        self.assertIn("6 p.m. Eastern on the Monday", name["text"])
        self.assertIn("Do not assume the later time guarantees", name["text"])
        self.assertTrue(name["href"].endswith("/changing-registration-info"))
        self.assertIn("even if you registered at age 20", age["text"])
        self.assertIn("valid passport", travel["text"])
        self.assertIn("under 21 testing at a U.S. center", form["text"])
        self.assertIn("homeschooled students", school_day["text"])
        self.assertIn("follow your coordinator", school_day["text"])
        self.assertTrue(school_day["href"].endswith("/in-school-assessments/what-to-bring"))
        self.assertIn('href="#sat-id-cases"', page)
        self.assertIn('id="sat-id-cases"', page)
        self.assertIn("30+", tool["timeline"]["items"][0]["label"])
        self.assertIn("compare your registration name", tool["timeline"]["items"][0]["text"])
        for item in group["items"]:
            self.assertIn(escape(item["text"]), page)
            self.assertIn(f'href="{escape(item["href"])}"', page)

    def test_device_check_precedes_loan_deadline_on_both_checklists(self):
        for slug in CHECKLISTS:
            with self.subTest(slug=slug):
                tool = TOOLS[slug]
                page = (ROOT / f"{slug}.html").read_text()
                self.assertIn("30+", tool["timeline"]["items"][0]["label"])
                self.assertIn("at least 30 days", page)
                self.assertIn("1-5 days", page)
                self.assertIn("SAT School Day", page)
                self.assertIn("at pickup", page)
                self.assertIn('href="sat-device-troubleshooting-guide.html#sat-device-cases"', page)
                self.assertNotIn("2 weeks out", page)
                self.assertNotIn("1-2 weeks before", page)

    def test_device_guide_covers_current_requirements_and_three_fictional_cases(self):
        tool = TOOLS["sat-device-troubleshooting-guide"]
        page = (ROOT / "sat-device-troubleshooting-guide.html").read_text()
        self.assertIn(render_examples(tool), page)
        self.assertIn('id="sat-device-cases"', page)
        self.assertEqual(page.count("<summary>Show reasoning</summary>"), 3)
        for requirement in ("Windows 11 24H2", "macOS 15", "iPadOS 18", "ChromeOS 144", "Verified Mode"):
            self.assertIn(requirement, page)
        self.assertIn("non-family adult verification", page)
        self.assertIn("after timed testing has started", page)
        self.assertIn("complete exam setup on that replacement", page)
        self.assertIn("how-do-i-complete-device-swap", page)

    def test_corrections_leave_search_titles_and_descriptions_intact(self):
        expected = {
            "digital-sat-checklist": ("Digital SAT Checklist", "A digital SAT checklist for devices, Bluebook setup, ID, admission ticket, calculator, and test morning logistics."),
            "digital-sat-bluebook-checklist": ("Digital SAT Bluebook Checklist", "A Bluebook-focused digital SAT checklist for approved devices, setup timing, battery life, admission ticket, and test-day troubleshooting."),
            "sat-device-troubleshooting-guide": ("Digital SAT Device Troubleshooting Guide", "Troubleshoot common Digital SAT device issues before test day, including Bluebook access, battery, approved devices, passwords, updates, and admission ticket setup."),
            "sat-test-day-timing-guide": ("SAT Test Day Timing Guide", "Plan SAT test morning timing, arrival margin, check-in, breaks, device setup, pacing, and post-test next steps."),
        }
        sitemap = {
            item.findtext("{*}loc"): item.findtext("{*}lastmod")
            for item in ElementTree.parse(ROOT / "sitemap.xml").getroot()
        }
        for slug, (title, description) in expected.items():
            with self.subTest(slug=slug):
                self.assertEqual(TOOLS[slug]["title"], title)
                self.assertEqual(TOOLS[slug]["description"], description)
                last_updated = datetime.strptime(TOOLS[slug]["lastUpdated"], "%B %d, %Y").date().isoformat()
                self.assertEqual(sitemap[f"https://testdaytools.com/{slug}.html"], last_updated)

    def test_test_center_cases_use_confirmed_weekend_assignments(self):
        slug = "sat-test-day-timing-guide"
        tool = TOOLS[slug]
        page = (ROOT / f"{slug}.html").read_text()
        cases = next(group for group in tool["cardGroups"] if group.get("id") == "sat-center-changes")
        unlisted, moved, closed, makeup = cases["items"]
        self.assertIn("fully closed centers", unlisted["text"])
        self.assertIn("not confirm", unlisted["text"])
        self.assertEqual(moved["href"], "#sat-arrival-plan")
        self.assertIn("neither is guaranteed", closed["text"])
        self.assertIn("before paying for another registration", closed["text"])
        self.assertIn("updated admission ticket", makeup["text"])
        self.assertIn("entire test", makeup["text"])
        self.assertIn("For SAT School Day", cases["intro"])
        self.assertIn('href="#sat-center-changes"', page)
        for case in cases["items"]:
            self.assertIn(escape(case["text"]), page)

    def test_score_release_cases_distinguish_official_and_illustrative_dates(self):
        tool = TOOLS["sat-score-release-guide"]
        examples = json.loads((ROOT / "content/study_examples.json").read_text())[tool["slug"]]
        page = (ROOT / "sat-score-release-guide.html").read_text()
        self.assertIn("December 18, 2026", examples["intro"])
        self.assertIn("fictional", examples["intro"])
        self.assertEqual(len(examples["examples"]), 3)
        self.assertIn(render_examples(tool), page)
        self.assertIn('href="#score-deadline-cases"', page)
        self.assertIn("Deadline and time zone: ___", page)
        self.assertIn("nine days after testing", page)
        self.assertIn("three days after testing", page)
        self.assertEqual({source["url"].rsplit("/", 1)[-1] for source in tool["sources"]},
                         {"score-release-dates", "weekend", "rush-reporting", "there-fee-sending-scores"})


if __name__ == "__main__":
    unittest.main()
