import unittest
from xml.etree import ElementTree

from unittest.mock import patch

from scripts.build import SIGN_SVGS
from scripts.build_road_sign_classroom_pack import CLASSROOM_SIGNS, sign_drawing


class RailroadAdvanceWarningSignTest(unittest.TestCase):
    def test_shared_svg_is_yellow_circle_with_crossed_tracks_and_two_rs(self):
        root = ElementTree.fromstring(SIGN_SVGS["railroad"])
        svg = "{http://www.w3.org/2000/svg}"
        circles = root.findall(f"{svg}circle") or root.findall("circle")
        paths = root.findall(f"{svg}path") or root.findall("path")
        letters = root.findall(f"{svg}text") or root.findall("text")
        self.assertEqual(len(circles), 1)
        self.assertEqual(circles[0].attrib["fill"], "#f6d54a")
        self.assertIn("L132 112 M132 48 L88 112", paths[0].attrib["d"])
        self.assertEqual([letter.text for letter in letters], ["R", "R"])

    def test_classroom_pdf_icon_matches(self):
        self.assertEqual(CLASSROOM_SIGNS["railroad"], "railroad")
        with patch("scripts.build_road_sign_classroom_pack.Image") as image:
            sign_drawing("railroad", 72, "/tmp/shared-signs")
        image.assert_called_once_with("/tmp/shared-signs/railroad.png", width=72, height=72 * 160 / 220, mask="auto")


class DoNotPassSignTest(unittest.TestCase):
    def test_shared_svg_is_white_vertical_rectangle_with_black_legend(self):
        root = ElementTree.fromstring(SIGN_SVGS["no-passing"])
        svg = "{http://www.w3.org/2000/svg}"
        rectangles = root.findall(f"{svg}rect") or root.findall("rect")
        letters = root.findall(f"{svg}text") or root.findall("text")
        self.assertEqual(len(rectangles), 1)
        self.assertEqual(rectangles[0].attrib["fill"], "#fff")
        self.assertEqual(rectangles[0].attrib["stroke"], "#222")
        self.assertGreater(int(rectangles[0].attrib["height"]), int(rectangles[0].attrib["width"]))
        self.assertEqual([letter.text for letter in letters], ["DO", "NOT", "PASS"])


class DirectionSignTest(unittest.TestCase):
    def test_prohibited_turns_point_to_the_prohibited_movement(self):
        arrows = {
            "no-right-turn": ("M88 112 V80 Q88 62 106 62 H140", "M134 46 L160 62 L134 78 Z"),
            "no-left-turn": ("M132 112 V80 Q132 62 114 62 H80", "M86 46 L60 62 L86 78 Z"),
            "no-u-turn": ("M140 112 V76 C140 38 90 38 90 76 V89", "M74 82 L90 108 L106 82 Z"),
        }
        for name, (stem, head) in arrows.items():
            with self.subTest(name=name):
                root = ElementTree.fromstring(SIGN_SVGS[name])
                paths = root.findall("path")
                slash = root.find("line")
                self.assertEqual([path.attrib["d"] for path in paths], [stem, head])
                self.assertEqual(
                    (slash.attrib["x1"], slash.attrib["y1"], slash.attrib["x2"], slash.attrib["y2"]),
                    ("69", "39", "151", "121"),
                )

    def test_divided_highway_medians_and_arrow_directions_match_the_two_cases(self):
        for name, island, outward in (
            (
                "divided-highway",
                "M99 43 H121 C121 63 117 76 110 76 C103 76 99 63 99 43 Z",
                True,
            ),
            (
                "divided-highway-ends",
                "M99 117 H121 C121 97 117 84 110 84 C103 84 99 97 99 117 Z",
                False,
            ),
        ):
            with self.subTest(name=name):
                root = ElementTree.fromstring(SIGN_SVGS[name])
                self.assertEqual(root.find("path").attrib["d"], island)
                left, right = root.findall("g")
                for arrow, upward in ((left, False), (right, True)):
                    tail_x = int(arrow.find("path").attrib["d"].split()[0][1:])
                    tip_x, tip_y, _, base_y, _, _ = map(int, arrow.find("polygon").attrib["points"].replace(",", " ").split())
                    self.assertNotEqual(tip_x, tail_x)
                    self.assertEqual(tip_y < base_y, upward)
                    self.assertEqual(tip_x < 110, not upward)
                    upper_x, lower_x = (tip_x, tail_x) if upward else (tail_x, tip_x)
                    self.assertEqual(abs(upper_x - 110) > abs(lower_x - 110), outward)


if __name__ == "__main__":
    unittest.main()
