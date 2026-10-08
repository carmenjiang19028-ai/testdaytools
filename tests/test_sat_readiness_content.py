import json
import unittest
from pathlib import Path


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
                self.assertIn("For SAT Weekend, bring", items[0])
                self.assertIn("printed copy is preferred", items[0])
                self.assertNotIn("if", items[0])
                self.assertIn(items[0], (ROOT / f"{slug}.html").read_text())

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

    def test_corrections_leave_search_titles_and_descriptions_intact(self):
        expected = {
            "digital-sat-checklist": ("Digital SAT Checklist", "A digital SAT checklist for devices, Bluebook setup, ID, admission ticket, calculator, and test morning logistics."),
            "digital-sat-bluebook-checklist": ("Digital SAT Bluebook Checklist", "A Bluebook-focused digital SAT checklist for approved devices, setup timing, battery life, admission ticket, and test-day troubleshooting."),
            "sat-device-troubleshooting-guide": ("Digital SAT Device Troubleshooting Guide", "Troubleshoot common Digital SAT device issues before test day, including Bluebook access, battery, approved devices, passwords, updates, and admission ticket setup."),
        }
        for slug, (title, description) in expected.items():
            with self.subTest(slug=slug):
                self.assertEqual(TOOLS[slug]["title"], title)
                self.assertEqual(TOOLS[slug]["description"], description)
                self.assertEqual(TOOLS[slug]["lastUpdated"], "October 8, 2026")


if __name__ == "__main__":
    unittest.main()
