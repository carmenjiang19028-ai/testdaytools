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


if __name__ == "__main__":
    unittest.main()
