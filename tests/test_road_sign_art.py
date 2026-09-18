import unittest
from xml.etree import ElementTree

from reportlab.graphics.shapes import Circle, Line, String

from scripts.build import SIGN_SVGS
from scripts.build_road_sign_classroom_pack import YELLOW, sign_drawing


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
        shapes = sign_drawing("railroad").contents
        self.assertEqual(len(shapes), 5)
        self.assertEqual([shape.text for shape in shapes if isinstance(shape, String)], ["R", "R"])
        self.assertEqual(len([shape for shape in shapes if isinstance(shape, Line)]), 2)
        circle = next(shape for shape in shapes if isinstance(shape, Circle))
        self.assertEqual(circle.fillColor, YELLOW)


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

    def test_divided_highway_island_noses_are_on_opposite_ends(self):
        for name, island, arrows in (
            (
                "divided-highway",
                "M101 43 H119 V76 L110 91 L101 76 Z",
                "M65 98 L84 118 L98 98 Z M122 59 L136 38 L154 56 Z",
            ),
            (
                "divided-highway-ends",
                "M110 69 L119 84 V121 H101 V84 Z",
                "M65 98 L84 118 L98 98 Z M122 59 L136 38 L154 56 Z",
            ),
        ):
            with self.subTest(name=name):
                root = ElementTree.fromstring(SIGN_SVGS[name])
                paths = root.findall("path")
                self.assertEqual(paths[-1].attrib["d"], island)
                self.assertEqual(paths[1].attrib["d"], arrows)


if __name__ == "__main__":
    unittest.main()
