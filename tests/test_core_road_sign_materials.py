import json
import unittest
from pathlib import Path
from xml.etree import ElementTree as ET

from pypdf import PdfReader
from scripts.build import (
    DATA, SIGN_SVGS, TOOL_BY_SLUG, road_sign_image_records, road_sign_materials, road_sign_shape_records,
    render_contrast_lessons, render_crossing_shape_drill, render_passing_sign_drill, road_sign_group_practice_href, url_for,
)
from scripts.build_road_sign_classroom_pack import (
    CLASSROOM_SIGNS, DECISION_CASES, DECISION_REVIEWED, FHWA_FLAGGER_URL,
    PENNDOT_SIGNS_URL, TRANSFER_KEY, TRANSFER_PROMPT,
)
from scripts.road_sign_print_links import PRACTICE_DISPLAY, PRACTICE_URL

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

    def test_school_warning_color_is_consistent_in_inline_art_and_recall_cue(self):
        school = ET.fromstring(SIGN_SVGS["school-crossing"]).find("polygon")
        # FHWA MUTCD 7B.01(05): fluorescent yellow-green, not general warning yellow.
        self.assertEqual(school.attrib["fill"], "#c7e644")
        self.assertIn("#f6d54a", SIGN_SVGS["merge"])
        cues = json.loads((ROOT / "content/road_sign_recall_cues.json").read_text())
        self.assertIn("yellow-green", cues["school-crossing"])
        self.assertIn(cues["school-crossing"], (ROOT / "dmv-road-sign-flashcards.html").read_text())
        marker = f'points="{school.attrib["points"]}" fill="'
        affected = set()
        for path in ROOT.glob("*.html"):
            text = path.read_text()
            if marker in text:
                affected.add(path.name)
                self.assertEqual(text.count(marker), text.count(marker + '#c7e644"'), path.name)
            self.assertNotIn("yellow school crossing sign", text, path.name)
        self.assertIn("road-signs-practice-test.html", affected)
        self.assertIn("dmv-road-sign-flashcards.html", affected)

    def test_do_not_enter_has_two_legible_lines(self):
        text = ET.fromstring(SIGN_SVGS["do-not-enter"]).findall("text")
        self.assertEqual([t.text for t in text], ["DO NOT", "ENTER"])
        self.assertEqual([t.attrib["y"] for t in text], ["57", "119"])

    def test_stop_ahead_uses_symbol_not_lettering_and_print_preserves_the_action(self):
        art = ET.fromstring(SIGN_SVGS["stop-ahead"])
        diamond, symbol = art.findall("polygon")
        self.assertEqual(diamond.attrib["fill"], "#f6d54a")
        self.assertEqual(len(diamond.attrib["points"].split()), 4)
        self.assertEqual(symbol.attrib["fill"], "#c7312f")
        self.assertEqual(len(symbol.attrib["points"].split()), 8)
        self.assertEqual(art.find("path").attrib["fill"], "#111")
        self.assertIsNone(art.find(".//text"))
        self.assertEqual(ET.fromstring(SIGN_SVGS["stop"]).find("text").text, "STOP")
        question = next(q for q in DATA["quizzes"]["roadSignsChallenge"] if q["image"] == "stop-ahead")
        self.assertEqual(question["choices"][question["answer"]], "Prepare to stop completely at the stop sign ahead")
        self.assertIn("not beside the yellow warning sign", question["explanation"])
        pdf = PdfReader(ROOT / "dmv-road-signs-cheat-sheet.pdf")
        self.assertIn("Slow now; stop at the actual control.", " ".join(pdf.pages[1].extract_text().split()))

    def test_two_way_traffic_leaves_the_upward_arrow_on_the_drivers_right(self):
        art = ET.fromstring(SIGN_SVGS["two-way-traffic"])
        heads = art.find("path[@fill='#111']").attrib["d"].split("M")[1:]
        left, right = [list(map(int, head.replace("L", " ").replace("H", " ").replace("Z", " ").split())) for head in heads]
        self.assertLess(left[0], right[0])
        self.assertGreater(left[1], left[3])
        self.assertLess(right[1], right[3])
        for path in ROOT.glob("*.html"):
            self.assertNotIn('M72 52 l16-24 16 24z M116 108 l16 24 16-24z', path.read_text(), path.name)
        pdf = PdfReader(ROOT / "dmv-road-signs-cheat-sheet.pdf")
        self.assertIn("The left arrow points down and the right arrow up.", " ".join(pdf.pages[1].extract_text().split()))

    def test_roundabout_and_bicycle_figures_replace_old_art_on_sitemap_pages(self):
        circle = ET.fromstring(SIGN_SVGS["roundabout"])
        self.assertEqual(len(circle.findall("g/path")), 3)
        self.assertEqual(len(circle.findall("g/polygon")), 3)
        marks = ('M83 63 a36 36', 'cx="76" cy="103" r="22"')
        sitemap = ET.parse(ROOT / "sitemap.xml")
        for loc in sitemap.findall("./{*}url/{*}loc"):
            path = loc.text.removeprefix("https://testdaytools.com/") or "index.html"
            html = (ROOT / path).read_text()
            for mark in marks:
                self.assertNotIn(mark, html, path)
        pdf = PdfReader(ROOT / "dmv-road-signs-cheat-sheet.pdf")
        page = " ".join(pdf.pages[1].extract_text().split())
        self.assertIn("Follow the arrows counterclockwise.", page)
        self.assertIn("Yellow-green can carry the same warning.", page)

    def test_no_turn_on_red_uses_unobscured_lettering_and_signal_below(self):
        art = ET.fromstring(SIGN_SVGS["no-turn-on-red"])
        lettering = art.findall(".//text")
        self.assertEqual([t.text for t in lettering], ["NO", "TURN", "ON RED"])
        self.assertIsNone(art.find(".//line"))
        signal = art.find("circle")
        self.assertGreater(int(signal.attrib["cy"]) - int(signal.attrib["r"]), int(lettering[-1].attrib["y"]))
        for path in ROOT.glob("*.html"):
            text = path.read_text()
            if '<meta name="robots" content="noindex' not in text:
                self.assertNotIn('x1="65" y1="128" x2="155" y2="38"', text, path.name)

    def test_shape_finder_addresses_same_color_without_changing_regular_pedestrian_art(self):
        page = (ROOT / "road-sign-shapes-and-colors-finder.html").read_text()
        self.assertIn(render_crossing_shape_drill(), page)
        self.assertIn("fill=\"#f6d54a\"", SIGN_SVGS["pedestrian-crossing"])
        pentagon = next(item for item in road_sign_shape_records() if item["key"] == "pentagon")
        self.assertIn("Color alone is not enough", pentagon["meaning"])
        self.assertNotIn("pentagon or fluorescent yellow-green", page)

    def test_keep_right_wording_above_direction_diagram(self):
        root = ET.fromstring(SIGN_SVGS["keep-right"])
        self.assertEqual(root.find("text").text, "KEEP RIGHT")
        self.assertEqual(root.find("text").attrib["y"], "43")
        self.assertIn("l-14-22z", root.findall("path")[1].attrib["d"])

    def test_all_way_plaque_uses_current_art_and_has_replaced_the_print_label(self):
        art = ET.fromstring(SIGN_SVGS["four-way-stop"])
        labels = art.findall("text")
        self.assertEqual([node.text for node in labels], ["STOP", "ALL WAY"])
        self.assertEqual(labels[-1].attrib["fill"], "#fff")
        self.assertEqual(art.find("rect").attrib["fill"], "#c7312f")
        self.assertEqual(art.findall("rect")[-1].attrib["stroke"], "#fff")
        for loc in ET.parse(ROOT / "sitemap.xml").findall("./{*}url/{*}loc"):
            path = loc.text.removeprefix("https://testdaytools.com/") or "index.html"
            self.assertNotIn(">4-WAY</text>", (ROOT / path).read_text(), path)
        reference = PdfReader(ROOT / "dmv-road-signs-cheat-sheet.pdf")
        reference_text = " ".join(" ".join(page.extract_text().split()) for page in reference.pages)
        self.assertEqual(len(reference.pages), 3)
        self.assertIn("All-Way Stop", reference_text)
        self.assertIn("ALL WAY means every approach stops", reference_text)
        self.assertNotIn("4-Way Stop", reference_text)

    def test_workers_symbol_and_driver_action_agree_in_the_reference(self):
        art = ET.fromstring(SIGN_SVGS["work-zone"])
        self.assertEqual(art.find("polygon").attrib["fill"], "#f59e2e")
        self.assertEqual(len(art.findall("path")), 3)
        self.assertIn("L143 105", art.findall("path")[1].attrib["d"])
        cues = json.loads((ROOT / "content/road_sign_recall_cues.json").read_text())
        self.assertIn("shovel beside a pile", cues["work-zone"])
        legacy = 'M85 94 h62 M76 118 h78'
        for loc in ET.parse(ROOT / "sitemap.xml").findall("./{*}url/{*}loc"):
            path = loc.text.removeprefix("https://testdaytools.com/") or "index.html"
            self.assertNotIn(legacy, (ROOT / path).read_text(), path)
        text = (ROOT / "dmv-road-signs-cheat-sheet.html").read_text()
        self.assertIn("Figure 6H-1 and section 6H.18", text)
        pdf = PdfReader(ROOT / "dmv-road-signs-cheat-sheet.pdf")
        page = " ".join(pdf.pages[2].extract_text().split())
        self.assertIn("Workers (Work Zone)", page)
        self.assertIn("The shovel warns of workers in or near the road.", page)

    def test_rectangular_do_not_pass_question_and_pennant_remain_distinct(self):
        question = next(q for q in DATA["quizzes"]["roadSignsCore"] if q["image"] == "no-passing")
        self.assertIn("white rectangular sign", question["q"])
        self.assertEqual(question["choices"][question["answer"]], "No passing is allowed in this zone")
        self.assertIn("different sign", question["explanation"])
        self.assertEqual(ET.fromstring(SIGN_SVGS["no-passing"]).find("rect").attrib["fill"], "#fff")
        picture_quiz = (ROOT / "road-signs-practice-test.html").read_text()
        self.assertIn(question["q"], picture_quiz)
        self.assertNotIn("pennant-style sign", picture_quiz)
        finder = (ROOT / "road-sign-shapes-and-colors-finder.html").read_text()
        self.assertIn(render_passing_sign_drill(), finder)
        self.assertIn('href="#passing-sign-check"', finder)

    def test_lane_reduction_retains_boundaries_without_merge_arrow(self):
        paths = ET.fromstring(SIGN_SVGS["lane-ends"]).findall("path")
        self.assertEqual(len(paths), 2)
        self.assertEqual(paths[0].attrib["d"].count("M"), 2)
        self.assertEqual(paths[1].attrib["stroke-dasharray"], "6 4")
        self.assertTrue(all(path.attrib["fill"] == "none" for path in paths))

    def test_public_inline_warning_art_excludes_superseded_signs(self):
        for path in ROOT.glob("*.html"):
            text = path.read_text()
            if '<meta name="robots" content="noindex' in text:
                continue
            with self.subTest(page=path.name):
                self.assertNotIn("M82 126 V40 M138 126 C124 96 116 74 110 42", text)
                self.assertNotIn("M88 120 V41 M137 120 V91 L121 65 V41", text)
                self.assertNotIn("M68 116 c18-18 38 18 56", text)
                for sign in ("lane-ends", "slippery"):
                    marker = ET.fromstring(SIGN_SVGS[sign]).find("path").attrib["d"]
                    self.assertEqual(text.count(marker), text.count(SIGN_SVGS[sign]))

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

    def test_classroom_student_and_teacher_pages_match_decision_cases(self):
        pdf = PdfReader(ROOT / "dmv-road-signs-classroom-worksheet.pdf")
        student, teacher = [" ".join(pdf.pages[index].extract_text().split()) for index in (1, 2)]
        self.assertIn(f"DECISION EDITION {DECISION_REVIEWED}", student)
        self.assertIn(f"DECISION EDITION {DECISION_REVIEWED}", teacher)
        self.assertEqual([answer for _, _, answer, _ in DECISION_CASES], [1, 0, 2, 0, 1, 0, 2, 1])
        for number, (prompt, choices, answer, reason) in enumerate(DECISION_CASES, 1):
            with self.subTest(number=number):
                self.assertIn(prompt, student)
                self.assertEqual(len(set(choices)), 3)
                for letter, choice in zip("ABC", choices):
                    self.assertIn(f"{letter}. {choice}", student)
                self.assertIn(f"{number}. {'ABC'[answer]} - {reason}", teacher)
                self.assertNotIn(reason, student)
        self.assertIn(TRANSFER_PROMPT, student)
        self.assertIn(TRANSFER_KEY, teacher)
        self.assertNotIn(TRANSFER_KEY, student)
        self.assertIn("meaning and action are both correct", teacher)
        self.assertIn("Score 1 point for each correct choice", teacher)

    def test_printed_material_links_and_readable_fallback_match_online_practice(self):
        def uris(page):
            return {a.get_object().get("/A", {}).get("/URI")
                    for a in page.get("/Annots", [])
                    if a.get_object().get("/A", {}).get("/S") == "/URI"}

        groups = TOOL_BY_SLUG["road-signs-practice-test"]["signLibrary"]["groups"]
        links = [url_for("/" + road_sign_group_practice_href(group)) for group in groups]
        reference, classroom = [
            PdfReader(ROOT / f"dmv-road-signs-{name}.pdf")
            for name in ("cheat-sheet", "classroom-worksheet")
        ]
        self.assertEqual(len(links), 3)
        self.assertEqual(PRACTICE_URL, url_for("/dmv-road-signs-cheat-sheet.html") + "#printable-sheet")
        self.assertEqual([uris(page) for page in reference.pages],
                         [{links[0], PRACTICE_URL}, {links[1]}, {links[2]}])
        self.assertEqual(uris(classroom.pages[0]), {PRACTICE_URL})
        self.assertEqual(uris(classroom.pages[2]), {PENNDOT_SIGNS_URL, FHWA_FLAGGER_URL})
        for pdf in [reference, classroom]:
            self.assertIn(PRACTICE_DISPLAY, pdf.pages[0].extract_text())
            text = " ".join(" ".join(page.extract_text().split()) for page in pdf.pages)
            self.assertIn("No resale, rebranding, or adaptation.", text)


if __name__ == "__main__":
    unittest.main()
