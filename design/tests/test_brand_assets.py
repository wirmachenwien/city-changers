"""Local identity checks: python3 -m unittest discover -s design/tests."""

from pathlib import Path
import struct
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "src/assets/site"
PUBLIC = ROOT / "public"
SVG = "{http://www.w3.org/2000/svg}"


class BrandAssetsTest(unittest.TestCase):
    def test_exported_svgs_are_accessible_and_clean(self):
        for name in ["logo.svg", "logo-dark.svg", "logo-lockup.svg", "logo-lockup-dark.svg", "logo-small.svg"]:
            with self.subTest(name=name):
                root = ET.parse(ASSETS / name).getroot()
                self.assertEqual(root.get("role"), "img")
                self.assertIsNotNone(root.find(f"{SVG}title"))
                for tag in ["text", "image", "filter"]:
                    self.assertFalse(list(root.iter(f"{SVG}{tag}")))

    def test_imported_geometry_and_inheritance_are_preserved(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("exporter", ROOT / "design/scripts/build-brand-assets.py")
        exporter = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(exporter)
        source = exporter.normalize(ET.parse(ASSETS / "logo-lockup-new.svg").getroot())
        active = ET.parse(ASSETS / "logo-lockup.svg").getroot()
        def tree(element):
            return (element.tag, {k: v for k, v in element.attrib.items() if k != "id"},
                    [tree(child) for child in element])
        self.assertEqual([tree(e) for e in source], [tree(e) for e in active.findall(f"{SVG}g")])
        for key in ["fill-rule", "clip-rule", "stroke-linecap"]:
            self.assertEqual(source.get(key), active.get(key))
        import hashlib
        digest = hashlib.sha256((ASSETS / "logo-lockup-new.svg").read_bytes()).hexdigest()
        self.assertEqual((ROOT / "design/logo/imports" / digest[:12] / "source.svg").read_bytes(),
                         (ASSETS / "logo-lockup-new.svg").read_bytes())

    def test_green_fix_is_the_selected_mascot(self):
        active = ET.parse(ASSETS / "logo.svg").getroot()
        lockup_mascot = ET.parse(ASSETS / "logo-lockup.svg").getroot().find(f"{SVG}g")
        self.assertEqual([ET.tostring(e) for e in list(active)[1:]],
                         [ET.tostring(e) for e in lockup_mascot])

    def test_exported_image_sizes(self):
        cases = [(PUBLIC / "favicon.png", (48, 48)),
                 (PUBLIC / "apple-touch-icon.png", (180, 180)),
                 (PUBLIC / "icon-192.png", (192, 192)),
                 (PUBLIC / "icon-512.png", (512, 512)),
                 (ASSETS / "og-image.png", (1200, 630)),
                 (ASSETS / "logo.png", (512, 512)),
                 (ASSETS / "logo-lockup.png", (2400, 640))]
        for path, expected in cases:
            with self.subTest(path=path.name):
                raw = path.read_bytes()
                self.assertEqual(raw[:8], b"\x89PNG\r\n\x1a\n")
                self.assertEqual(struct.unpack(">II", raw[16:24]), expected)

    def test_dark_variant_keeps_face_legible(self):
        root = ET.parse(ASSETS / "logo-dark.svg").getroot()
        self.assertEqual(root.find(f"{SVG}g").get("fill"), "#cbbf9f")
        self.assertTrue(all(e.get("fill") == "#20221c" for e in root.iter(f"{SVG}ellipse")))
        mouth = next(e for e in root.iter(f"{SVG}path") if e.get("id") == "mouth")
        self.assertEqual(mouth.get("stroke"), "#20221c")
        lockup = ET.parse(ASSETS / "logo-lockup-dark.svg").getroot()
        self.assertTrue(all(e.get("fill") != "#20221c" for e in lockup.findall(f"{SVG}g")[1].iter()))

    def test_title_page_lockup_has_no_background(self):
        from PIL import Image
        with Image.open(ASSETS / "logo-lockup.png") as image:
            self.assertEqual(image.mode, "RGBA")
            for point in [(0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1)]:
                self.assertEqual(image.getpixel(point)[3], 0)

    def test_svg_favicon_is_transparent_and_theme_adaptive(self):
        root = ET.parse(PUBLIC / "favicon.svg").getroot()
        self.assertFalse(list(root.iter(f"{SVG}rect")))
        style = root.find(f"{SVG}style").text
        self.assertIn("prefers-color-scheme: dark", style)
        self.assertIn("#cbbf9f", style)
        self.assertEqual(root.find(f"{SVG}g").get("class"), "favicon-boots")
        mouth = next(e for e in root.iter(f"{SVG}path") if e.get("id") == "mouth")
        self.assertIsNone(mouth.get("class"))
        self.assertEqual(mouth.get("stroke"), "#20221c")

    def test_raster_favicon_and_app_icons_keep_their_backgrounds(self):
        from PIL import Image
        for name in ["favicon.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png"]:
            with self.subTest(name=name), Image.open(PUBLIC / name) as image:
                self.assertEqual(image.convert("RGBA").getpixel((0, 0)), (253, 252, 249, 255))

    def test_small_icon_is_simpler(self):
        full = ET.parse(ASSETS / "logo.svg").getroot()
        small = ET.parse(ASSETS / "logo-small.svg").getroot()
        self.assertLess(len(list(small)), len(list(full)))
        self.assertTrue(all(e.get("rx") == "5" for e in small.iter(f"{SVG}ellipse")))


if __name__ == "__main__":
    unittest.main()
