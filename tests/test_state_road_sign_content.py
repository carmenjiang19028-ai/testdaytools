import json
import unittest
from pathlib import Path


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


if __name__ == "__main__":
    unittest.main()
