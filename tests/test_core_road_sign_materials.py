import json
import unittest
from pathlib import Path
from xml.etree import ElementTree as ET

from pypdf import PdfReader
from scripts.build import SIGN_SVGS, road_sign_image_records, road_sign_materials, render_contrast_lessons
from scripts.build_road_sign_classroom_pack import CLASSROOM_SIGNS

ROOT = Path(__file__).resolve().parents[1]


def drawing(node, root=False):
    attrs = {k: v for k, v in node.attrib.items() if not (root and k in {"aria-hidden", "width", "height"})}
    return (node.tag.rsplit("}", 1)[-1], sorted(attrs.items()), (node.text or "").strip(),
            [drawing(c) for c in node if c.tag.rsplit("}", 1)[-1] != "title"])


class CoreMaterialTests(unittest.TestCase):
    def test_all31_exports_match_the_shared_art(self):
        records = road_sign_image_records()
        self.assertEqual(len(records), 31)
        for sign in records:
            with self.subTest(sign=sign["image"]):
                asset = ET.parse(ROOT / f'assets/road-signs/{sign["image"]}-road-sign.svg').getroot()
                self.assertEqual(drawing(asset, True), drawing(ET.fromstring(SIGN_SVGS[sign["image"]]), True))

    def test_classroom_uses_eight_existing_signs_including_shared_school(self):
        self.assertEqual(len(CLASSROOM_SIGNS), 8)
        self.assertEqual(CLASSROOM_SIGNS["school"], "school-crossing")
        polygon = ET.fromstring(SIGN_SVGS[CLASSROOM_SIGNS["school"]]).find("polygon")
        self.assertEqual(len(polygon.attrib["points"].split()), 5)
        self.assertTrue(all(key in SIGN_SVGS for key in CLASSROOM_SIGNS.values()))

    def test_do_not_enter_has_two_legible_lines(self):
        text = ET.fromstring(SIGN_SVGS["do-not-enter"]).findall("text")
        self.assertEqual([t.text for t in text], ["DO NOT", "ENTER"])
        self.assertEqual([t.attrib["y"] for t in text], ["57", "119"])

    def test_keep_right_wording_above_direction_diagram(self):
        root = ET.fromstring(SIGN_SVGS["keep-right"])
        self.assertEqual(root.find("text").text, "KEEP RIGHT")
        self.assertEqual(root.find("text").attrib["y"], "43")
        self.assertIn("l-14-22z", root.findall("path")[1].attrib["d"])

    def test_lane_reduction_retains_boundaries_without_merge_arrow(self):
        paths = ET.fromstring(SIGN_SVGS["lane-ends"]).findall("path")
        self.assertEqual(len(paths), 1)
        self.assertEqual(paths[0].attrib["d"].count("M"), 2)
        self.assertEqual(paths[0].attrib["fill"], "none")

    def test_slippery_has_vehicle_and_two_separate_skid_tracks(self):
        paths = ET.fromstring(SIGN_SVGS["slippery"]).findall("path")
        self.assertEqual(paths[0].attrib["fill"], "#111")
        self.assertEqual(paths[1].attrib["fill"], "#f6d54a")
        self.assertEqual(paths[-1].attrib["d"].count("M"), 2)
        self.assertEqual(paths[-1].attrib["fill"], "none")

    def test_exact_three_existing_contrasts_have_explanations_and_sources(self):
        m = road_sign_materials()
        self.assertEqual({x["id"] for x in m["lessons"]}, {"stop-yield", "do-not-enter-wrong-way", "merge-lane-ends"})
        sources = {x["id"] for x in m["sources"]}
        for lesson in m["lessons"]:
            self.assertIn(lesson["source"], sources)
            for key in ["scene", "cue", "decision", "mistake", "reason", "transfer", "explanation", "sourceSections"]:
                self.assertTrue(lesson[key].strip(), (lesson["id"], key))
        self.assertIn("not a driving-instructor assessment", m["responsibility"])

    def test_lab_bounded_static_region_matches_data(self):
        text = (ROOT / "road-sign-learning-loop.html").read_text()
        rendered = text.split("<!-- CORE MATERIAL LESSONS START -->")[1].split("<!-- CORE MATERIAL LESSONS END -->")[0].strip()
        self.assertEqual(rendered, render_contrast_lessons())
        self.assertEqual(text.count('class="contrast-lesson"'), 3)

    def test_core_pages_have_single_review_and_unchanged_canonical_destinations(self):
        for slug in ["road-signs-practice-test", "dmv-road-signs-cheat-sheet", "road-sign-learning-loop"]:
            text = (ROOT / f"{slug}.html").read_text()
            self.assertEqual(text.count('id="material-review"'), 1)
            self.assertIn(f'rel="canonical" href="https://testdaytools.com/{slug}.html"', text)
        for slug in ["road-signs-practice-test", "dmv-road-signs-cheat-sheet"]:
            text = (ROOT / f"{slug}.html").read_text()
            for lesson in road_sign_materials()["lessons"]:
                self.assertIn(f'road-sign-learning-loop.html#lesson-{lesson["id"]}', text)

    def test_pdfs_remain_three_pages_with_check_record(self):
        for name in ["dmv-road-signs-cheat-sheet.pdf", "dmv-road-signs-classroom-worksheet.pdf"]:
            pdf = PdfReader(ROOT / name)
            self.assertEqual(len(pdf.pages), 3, name)
            text = " ".join(p.extract_text() for p in pdf.pages)
            self.assertIn("2026-10-28", text)
            self.assertNotIn("qualified instructor approved", text.lower())

    def test_classroom_embeds_all_eight_shared_pictures(self):
        pdf = PdfReader(ROOT / "dmv-road-signs-classroom-worksheet.pdf")
        self.assertEqual(len(list(pdf.pages[0].images)), 8)
        text = pdf.pages[2].extract_text()
        for answer in ["1. B -", "2. A -", "3. A -", "4. A -", "5. B -", "6. A -", "7. B -", "8. B -"]:
            self.assertIn(answer, text)


if __name__ == "__main__":
    unittest.main()
