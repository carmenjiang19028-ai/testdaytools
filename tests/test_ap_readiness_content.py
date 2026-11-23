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

    def test_check_in_at_another_school_and_storage_are_not_optional_policy(self):
        pack = next(table for table in TOOL["tables"] if table["caption"] == "AP exam day packing guide")
        rows = {row[0]: " ".join(row[1:]) for row in pack["rows"]}
        self.assertIn("Required when testing at a school you do not attend", rows["Photo ID"])
        self.assertIn("government-issued or school-issued photo ID", rows["Photo ID"])
        self.assertIn("Not permitted in the exam room", rows["Phone or smartwatch"])
        self.assertIn("Outside the exam room", rows["Snack and water"])
        self.assertIn("Ask the proctor", rows["Snack and water"])
        self.assertNotIn("Photo ID if your school requires it", PAGE)

    def test_2027_arrival_and_packing_cases_distinguish_subjects_and_sections(self):
        body = {section["heading"]: section["text"] for section in TOOL["body"]}
        start = body["Confirm the 2027 session before planning your arrival"]
        self.assertIn("Session 1 or Session 2", start)
        self.assertIn("Alaska's sessions start at 7 a.m. and 11 a.m.", start)
        self.assertIn("reporting time and room from your AP coordinator", start)
        calculator = body["Check calculator type and section, not just the subject"]
        self.assertIn("Biology and Environmental Science, leave handheld graphing calculators at home", calculator)
        self.assertIn("For AP Statistics, a nongraphing model is not allowed", calculator)
        self.assertIn("only available in calculator-required parts", calculator)
        example = body["Example: AP Statistics at another school"]
        self.assertIn("government-issued or school-issued photo ID", example)
        self.assertIn("fully digital 2027 exam", example)
        self.assertIn("Bluebook's graphing calculator", example)
        self.assertIn("sight-singing response in Bluebook", body["Fully digital and hybrid are not the same packing plan"])
        for section in (start, calculator, example):
            self.assertIn(html.escape(section), PAGE)

    def test_specific_primary_sources_are_linked(self):
        urls = {source["url"] for source in TOOL["sources"]}
        for url in (
            "https://apstudents.collegeboard.org/exam-policies-guidelines/what-to-bring-on-exam-day",
            "https://bluebook.collegeboard.org/students/ap-exams",
            "https://apstudents.collegeboard.org/exam-policies-guidelines/calculator-policies",
            "https://apcentral.collegeboard.org/exam-administration-ordering-scores/exam-dates",
            "https://apcentral.collegeboard.org/exam-administration-ordering-scores/exam-dates/start-times",
            "https://apcentral.collegeboard.org/about-ap/ap-coordinators/important-updates",
        ):
            self.assertIn(url, urls)
            self.assertIn(f'href="{url}"', PAGE)

    def test_2027_subject_checks_match_tasks_to_the_right_deadline(self):
        groups = {group["label"]: group for group in TOOL["apSubjectChecks"]["groups"]}
        april = "2027-04-30T23:59:00-04:00"
        may = "2027-05-07T23:59:00-04:00"
        language = groups["Chinese, French, German, Italian, Japanese, or Spanish Language and Culture"]
        self.assertEqual(language["deadline"], april)
        self.assertIn("PPR", language["before"])
        self.assertIn("printout", language["before"])
        self.assertIn("wired headset with a microphone", language["exam"])
        self.assertIn("Chinese or Japanese", language["exam"])
        spanish_lit = groups["Spanish Literature and Culture"]
        self.assertNotIn("deadline", spanish_lit)
        self.assertIn("does not require a PPR", spanish_lit["before"])
        self.assertIn("do not need a microphone", spanish_lit["exam"])
        music = groups["Music Theory"]
        self.assertNotIn("deadline", music)
        self.assertIn("wired headphones", music["before"])
        self.assertIn("speaker and microphone, not the headset", music["exam"])
        self.assertIn("paper booklet", music["exam"])
        combined = groups["Computer Science Principles or Seminar"]
        self.assertEqual(combined["deadline"], april)
        self.assertIn("Create task components", combined["before"])
        self.assertIn("end-of-course exam in Bluebook", combined["exam"])
        self.assertEqual(groups["Research"]["deadline"], april)
        self.assertIn("oral defense", groups["Research"]["before"])
        art = groups["Art and Design (2-D, 3-D, or Drawing)"]
        self.assertEqual(art["deadline"], may)
        self.assertIn("all three", art["before"])
        for group in (groups["Research"], art):
            self.assertIn("No end-of-course Bluebook exam", group["exam"])
        self.assertEqual(PAGE.count(f'datetime="{april}"'), 3)
        self.assertEqual(PAGE.count(f'datetime="{may}"'), 1)
        self.assertIn("April 30, 2027 at 11:59 p.m. ET", PAGE)
        self.assertIn("May 7, 2027 at 11:59 p.m. ET", PAGE)

    def test_2027_conflict_examples_separate_dates_accommodations_and_fees(self):
        group = next(group for group in TOOL["cardGroups"] if group["id"] == "ap-schedule-conflicts")
        same, different, extended = group["items"]
        self.assertIn("Both are in Session 2 on May 4, 2027", same["text"])
        self.assertIn("European History on May 17, Session 1", same["text"])
        self.assertIn("Microeconomics on May 19, Session 1", same["text"])
        self.assertIn("no additional late-testing fee", same["text"])
        self.assertIn("new exam order is a separate policy", same["text"])
        self.assertIn("U.S. Government and Politics is in Session 1", different["text"])
        self.assertIn("Microeconomics is in Session 2", different["text"])
        self.assertIn("not a same-session clash", different["text"])
        self.assertIn("approved extended time", extended["text"])
        self.assertIn("move one subject to late testing", extended["text"])
        self.assertIn("known cases by March 12, 2027", extended["text"])
        self.assertIn("switch existing orders later if something unexpected", extended["text"])
        section = PAGE.split('id="ap-schedule-conflicts"', 1)[1].split("</section>", 1)[0]
        self.assertIn('href="#ap-schedule-conflicts"', PAGE)
        self.assertNotIn("<form", section)
        for item in group["items"]:
            self.assertIn(html.escape(item["text"]), section)
            self.assertIn(f'href="{item["href"]}"', section)
        archive = (ROOT / "2026-ap-exam-schedule.html").read_text()
        self.assertIn('href="ap-exam-day-checklist.html#ap-schedule-conflicts"', archive)
        self.assertIn("historical reference only", archive)
        self.assertIn("2026 AP exam schedule by date (archive)", archive)

    def test_submission_states_keep_the_right_answers_and_device(self):
        section = next(group for group in TOOL.get("cardGroups", []) if group["id"] == "ap-answer-submission")
        cases = {item["label"]: item for item in section["items"]}
        self.assertEqual(set(cases), {
            "In the room: pending",
            "In the room: incomplete",
            "After dismissal: official email",
        })
        self.assertIn("handing in the paper booklet", section["intro"])
        self.assertIn("Bluebook answers", section["intro"])
        pending = cases["In the room: pending"]
        self.assertIn("Do not try to submit again", pending["text"])
        self.assertIn("proctor", pending["text"])
        self.assertNotIn("Submit Answers", pending["text"])
        incomplete = cases["In the room: incomplete"]
        self.assertIn("Raise your hand", incomplete["text"])
        self.assertIn("Do not switch devices", incomplete["text"])
        self.assertIn("time has ended", incomplete["text"])
        after = cases["After dismissal: official email"]
        for detail in ("three calendar days", "same device you finished on", "Your Tests",
                       "Submit Answers", "Past", "AP coordinator", "school device"):
            self.assertIn(detail, after["text"])
        self.assertEqual(pending["href"], "https://bluebook.collegeboard.org/help-center/what-if-students-answers-arent-submitted")
        self.assertEqual(incomplete["href"], "https://bluebook.collegeboard.org/students/ap-exams")
        self.assertEqual(after["href"], "https://bluebook.collegeboard.org/fix-answer-submission-issues-ap-exams")

    def test_submission_check_is_a_static_destination_from_the_top(self):
        self.assertIn('href="#ap-answer-submission"', PAGE)
        self.assertEqual(PAGE.count('id="ap-answer-submission"'), 1)
        section = PAGE.split('id="ap-answer-submission"', 1)[1].split("</section>", 1)[0]
        self.assertEqual(section.count("<h3>"), 3)
        self.assertNotIn("<form", section)
        self.assertNotIn("<input", section)
        self.assertNotIn("<script", section)
        for item in next(group for group in TOOL["cardGroups"] if group["id"] == "ap-answer-submission")["items"]:
            self.assertIn(html.escape(item["text"]), section)
            self.assertIn(f'href="{item["href"]}"', section)
        timeline = next(table for table in TOOL["tables"] if table["caption"] == "Night-before and morning timeline")
        check = next(row for row in timeline["rows"] if row[0] == "Before leaving the exam room")
        self.assertIn("Do not close the testing device", check[1])
        self.assertIn("proctor", check[1])
        self.assertIn("incomplete", check[2])

    def test_subject_checks_are_near_top_and_link_to_primary_sources(self):
        region = PAGE.split('id="ap-subject-checks"', 1)[1].split("</section>", 1)[0]
        self.assertIn('href="#ap-subject-checks"', PAGE)
        self.assertLess(PAGE.index('id="ap-subject-checks"'), PAGE.index("AP exam day packing guide"))
        self.assertIn("do not bring a personal headset", region)
        self.assertEqual(region.count("<details>"), len(TOOL["apSubjectChecks"]["groups"]))
        for url in (
            "https://apstudents.collegeboard.org/ap-exams-what-to-know/digital-testing-exam-modes",
            "https://apstudents.collegeboard.org/exam-dates",
            "https://apcentral.collegeboard.org/exam-administration-ordering-scores/administering-exams/subject-specific/headsets",
            "https://apcentral.collegeboard.org/exam-administration-ordering-scores/administering-exams/subject-specific/world-languages-and-cultures",
        ):
            self.assertIn(f'href="{url}"', region)

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
