import html
import json
import re
import runpy
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "content/site_data.json").read_text())
TOOL = next(tool for tool in DATA["tools"] if tool["slug"] == "ap-exam-day-checklist")
PAGE = (ROOT / "ap-exam-day-checklist.html").read_text()


class APReadinessContentTest(unittest.TestCase):
    def test_school_and_personal_device_paths_are_separate(self):
        table = next(table for table in TOOL["tables"] if table["caption"] == "Digital or hybrid AP: confirm your device path")
        rows = {row[0]: " ".join(row[1:]) for row in table["rows"]}
        self.assertIn("AP coordinator", rows["Confirm the exam format"])
        self.assertIn("other exam formats", rows["Confirm the exam format"])
        self.assertIn("school-managed device", rows["School provides the device"])
        self.assertIn("installed", rows["School provides the device"])
        self.assertIn("approved device", rows["You bring your own device"])
        self.assertIn("Bluebook", rows["You bring your own device"])
        self.assertIn("charge", rows["You bring your own device"])
        self.assertIn("charging cord", rows["You bring your own device"])

    def test_digital_and_hybrid_response_and_keyboard_rules(self):
        body = {section["heading"]: section["text"] for section in TOOL["body"]}
        formats = body["Fully digital and hybrid are not the same packing plan"]
        self.assertIn("all answers in Bluebook", formats)
        self.assertIn("multiple-choice answers in Bluebook", formats)
        self.assertIn("free-response answers in an exam booklet", formats)
        self.assertIn("required for fully digital", formats)
        self.assertIn("recommended for hybrid", formats)
        self.assertIn("not permitted with a laptop", formats)

    def test_account_and_device_readiness_are_actionable(self):
        text = " ".join(section["text"] for section in TOOL["body"])
        self.assertIn("College Board student account", text)
        self.assertIn("saved password", text)
        self.assertIn("Your Tests", text)
        self.assertIn("4 hours", text)
        self.assertIn("outlet", text)
        self.assertTrue(any("who supplies" in item for item in TOOL["checklist"]))
        self.assertTrue(any("school-provided" in item for item in TOOL["checklist"]))
        self.assertTrue(any("own device" in item and "charging cord" in item for item in TOOL["checklist"]))
        self.assertTrue(any("sign in" in item and "College Board" in item for item in TOOL["checklist"]))

    def test_specific_primary_sources_are_linked(self):
        urls = {source["url"] for source in TOOL["sources"]}
        for url in (
            "https://apstudents.collegeboard.org/exam-policies-guidelines/what-to-bring-on-exam-day",
            "https://bluebook.collegeboard.org/students/ap-exams",
        ):
            self.assertIn(url, urls)
            self.assertIn(f'href="{url}"', PAGE)

    def test_title_url_and_existing_basics_are_preserved(self):
        self.assertEqual(TOOL["title"], "AP Exam Day Checklist")
        self.assertEqual(TOOL["description"], "A practical AP exam day checklist covering what to bring, what to avoid, and how to prepare the night before.")
        self.assertIn('rel="canonical" href="https://testdaytools.com/ap-exam-day-checklist.html"', PAGE)
        for item in (
            "Several No. 2 pencils with erasers.",
            "Black or dark blue pens for written responses if required.",
            "Approved calculator for exams that allow one.",
        ):
            self.assertIn(item, TOOL["checklist"])
        self.assertNotIn("admission ticket", json.dumps(TOOL).lower())
        self.assertNotIn("30 days", json.dumps(TOOL))

    def test_only_existing_analytics_and_no_ad_loader(self):
        self.assertEqual(PAGE.count('src="https://www.googletagmanager.com/gtag/js?id=G-ME9YY0NVEB"'), 1)
        self.assertEqual(PAGE.count('name="google-adsense-account"'), 1)
        self.assertNotIn("pagead2.googlesyndication.com", PAGE)
        self.assertNotIn("adsbygoogle", PAGE)

    def test_generated_page_matches_current_content(self):
        module = runpy.run_path(str(ROOT / "scripts/build.py"))
        self.assertEqual(PAGE, module["render_tool"](TOOL))
        for item in TOOL["checklist"]:
            self.assertIn(html.escape(item, quote=True), PAGE)
        labels = re.findall(r'<label><input type="checkbox"[^>]*>\s*<span>(.*?)</span></label>', PAGE)
        self.assertEqual(len(labels), len(TOOL["checklist"]))


if __name__ == "__main__":
    unittest.main()
