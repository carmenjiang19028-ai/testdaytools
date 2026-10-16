import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from unittest.mock import patch
from xml.etree import ElementTree

from scripts import build


class PageImages(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []
        self.meta = {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "img":
            self.images.append(attrs)
        if tag == "meta":
            self.meta[attrs.get("property", attrs.get("name"))] = attrs.get("content")


def artwork(element):
    return (
        element.tag.rsplit("}", 1)[-1],
        element.attrib,
        element.text,
        [artwork(child) for child in element],
    )


class RoadSignImageDiscoveryTest(unittest.TestCase):
    def test_assets_preserve_every_original_shape_and_label(self):
        records = build.road_sign_image_records()
        self.assertEqual(len(records), 31)
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(build, "ROOT", Path(directory)):
                build.write_road_sign_images()
                for sign in records:
                    with self.subTest(sign=sign["image"]):
                        asset = Path(directory) / build.road_sign_image_path(sign["image"])
                        root = ElementTree.fromstring(asset.read_text())
                        original = ElementTree.fromstring(build.SIGN_SVGS[sign["image"]])
                        self.assertEqual(root.tag, "{http://www.w3.org/2000/svg}svg")
                        self.assertEqual(root.attrib["viewBox"], original.attrib["viewBox"])
                        self.assertNotIn("aria-hidden", root.attrib)
                        self.assertEqual(root[0].text, f"{sign['title']} road sign")
                        self.assertEqual([artwork(child) for child in root][1:], [artwork(child) for child in original])

    def test_unknown_artwork_fails_instead_of_creating_a_broken_url(self):
        with self.assertRaises(ValueError):
            build.road_sign_image_path("missing")

    def test_image_markup_has_dimensions_alt_and_print_safe_loading(self):
        for lazy in (True, False):
            with self.subTest(lazy=lazy):
                parser = PageImages()
                parser.feed(build.render_road_sign_image("stop", 'Stop & "yield"', lazy=lazy))
                image, = parser.images
                self.assertEqual(image["alt"], 'Stop & "yield" road sign')
                self.assertEqual((image["width"], image["height"]), ("220", "160"))
                self.assertEqual(image.get("loading"), "lazy" if lazy else None)

    def test_only_pilot_page_libraries_use_external_images(self):
        for tool in build.DATA["tools"]:
            if not tool.get("signLibrary"):
                continue
            with self.subTest(slug=tool["slug"]):
                parser = PageImages()
                parser.feed(build.render_sign_library(tool))
                self.assertEqual(len(parser.images), 31 if tool["slug"] == build.ROAD_SIGN_PICTURE_SLUG else 0)

    def test_pilot_pages_use_the_same_31_urls_and_keep_existing_print_preview(self):
        paths = set(build.road_sign_images_for_page(f"/{build.ROAD_SIGN_PICTURE_SLUG}.html"))
        for name in (build.ROAD_SIGN_PICTURE_SLUG, build.ROAD_SIGN_CHEAT_SHEET_SLUG):
            with self.subTest(page=name):
                parser = PageImages()
                parser.feed((build.ROOT / f"{name}.html").read_text())
                self.assertEqual(len(parser.images), 34)
                self.assertEqual({image["src"] for image in parser.images}, paths)
                for image in parser.images:
                    self.assertTrue((build.ROOT / image["src"]).is_file())
                expected = build.ROAD_SIGN_PICTURE_PREVIEW if name == build.ROAD_SIGN_PICTURE_SLUG else "assets/dmv-road-signs-cheat-sheet-preview.png"
                self.assertEqual(parser.meta["og:image"], build.url_for(f"/{expected}"))
                self.assertEqual(parser.meta["twitter:image"], parser.meta["og:image"])
                self.assertNotIn("robots", parser.meta)
                if name == build.ROAD_SIGN_CHEAT_SHEET_SLUG:
                    self.assertTrue(all("loading" not in image for image in parser.images))

    def test_existing_sitemap_keeps_60_pages_with_images_only_on_the_pilot(self):
        root = ElementTree.parse(build.ROOT / "sitemap.xml").getroot()
        ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9", "image": "http://www.google.com/schemas/sitemap-image/1.1"}
        entries = root.findall("s:url", ns)
        self.assertEqual(len(entries), 60)
        self.assertEqual(len({entry.findtext("s:loc", namespaces=ns) for entry in entries}), 60)
        pilots = set()
        for entry in entries:
            page = entry.findtext("s:loc", namespaces=ns)
            images = entry.findall("image:image/image:loc", ns)
            if not images:
                continue
            pilots.add(page)
            expected = {build.url_for(f"/{path}") for path in build.road_sign_images_for_page(page.removeprefix(build.SITE["url"]))}
            self.assertEqual({image.text for image in images}, expected)
            self.assertEqual(len(images), 31)
        self.assertEqual(pilots, {build.url_for(f"/{slug}.html") for slug in (build.ROAD_SIGN_PICTURE_SLUG, build.ROAD_SIGN_CHEAT_SHEET_SLUG)})

    def test_quiz_art_and_other_hero_previews_stay_inline(self):
        question = {"image": "stop", "imageAlt": "Stop sign"}
        self.assertIn("<svg", build.render_sign_visual(question))
        self.assertNotIn("<img", build.render_sign_visual(question))
        self.assertIn("<svg", build.render_sign_preview_strip())


if __name__ == "__main__":
    unittest.main()
