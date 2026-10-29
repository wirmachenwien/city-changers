"""Static handoff integrity; run with the other local design checks."""
from io import BytesIO
import importlib.util
import json
from pathlib import Path
import unittest
import tempfile
from unittest.mock import patch
import xml.etree.ElementTree as ET

import cairosvg
from PIL import Image, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[2]
KIT = ROOT / "src/assets/mascot"
POSES = ROOT / "design/assets/mascot/source/poses.json"
LOGO = ROOT / "src/assets/site/logo.svg"
NS = "{http://www.w3.org/2000/svg}"
SPEC = importlib.util.spec_from_file_location("build_mascot_kit", ROOT / "design/scripts/build-mascot-kit.py")
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)


class MascotKitTest(unittest.TestCase):
    def assert_preview_artwork_equal(self, actual, expected):
        self.assertEqual(actual.size, expected.size)
        self.assertEqual(actual.mode, expected.mode)
        difference = ImageChops.difference(actual, expected)
        # Measured macOS/Linux differences: peak 7/255, mean < 0.008/255
        # per channel. Bound both local outliers and widespread color changes.
        self.assertLessEqual(max(high for low, high in difference.getextrema()), 8,
                             "Preview artwork has a large pixel difference")
        self.assertLessEqual(max(ImageStat.Stat(difference).mean), 0.02,
                             "Preview artwork has widespread pixel differences")

    def test_preview_tolerance_only_accepts_minor_rasterization_differences(self):
        expected = Image.new("RGB", (100, 100), (100, 100, 100))
        minor = expected.copy()
        minor.putpixel((50, 50), (107, 100, 100))
        self.assert_preview_artwork_equal(minor, expected)
        self.assert_preview_artwork_equal(expected, expected)
        outlier = expected.copy()
        outlier.putpixel((50, 50), (109, 100, 100))
        for changed in (outlier, Image.new("RGB", expected.size, (101, 100, 100))):
            with self.assertRaises(AssertionError):
                self.assert_preview_artwork_equal(changed, expected)

    def test_pose_source_stays_in_design_not_in_outputs(self):
        self.assertTrue(POSES.is_file())
        self.assertFalse((KIT / "source").exists())

    def test_all_poses_have_transparent_exports_in_both_treatments(self):
        poses = BUILDER.load_poses()
        self.assertEqual(set(poses), {"neutral", "wave", "point", "celebrate", "think", "skeptical", "step"})
        for treatment in ["ink", "linen"]:
            for name in poses:
                with self.subTest(treatment=treatment, pose=name):
                    svg = ET.parse(KIT / "static" / treatment / f"{name}.svg").getroot()
                    self.assertEqual(svg.get("role"), "img")
                    self.assertIsNotNone(svg.find(NS + "title"))
                    for tag in ["rect", "image", "text", "filter"]:
                        self.assertFalse(list(svg.iter(NS + tag)))
                    with Image.open(KIT / "static" / treatment / f"{name}.png") as png:
                        self.assertEqual(png.size, (1080, 1080))
                        self.assertEqual(png.mode, "RGBA")
                        alpha = png.getchannel("A")
                        bounds = alpha.getbbox()
                        self.assertGreater(min(bounds[0], bounds[1]), 20)
                        self.assertLess(max(bounds[2], bounds[3]), 1060)

    def test_neutral_preserves_the_original_artwork(self):
        original = ET.parse(LOGO).getroot()
        original.set("viewBox", "-16 -16 288 288")
        expected = cairosvg.svg2png(bytestring=ET.tostring(original), output_width=1080, output_height=1080)
        with Image.open(BytesIO(expected)) as image, Image.open(KIT / "static/ink/neutral.png") as actual:
            self.assertEqual(image.convert("RGBA").tobytes(), actual.tobytes())

    def test_skeptical_preserves_the_previous_think_geometry(self):
        old = json.loads(POSES.read_text())["think"]
        skeptical = BUILDER.load_poses()["skeptical"]
        for key in old.keys() - {"label", "use"}:
            self.assertEqual(skeptical[key], old[key], key)

    def test_think_has_the_animated_idea_hand_smile_and_yellow_rays(self):
        for treatment in ("ink", "linen"):
            root = ET.parse(KIT / "static" / treatment / "think.svg").getroot()
            arm = root.find(".//*[@id='right-arm']")
            self.assertEqual(arm.get("d"), "M152,163C188,178 226,150 224,112")
            self.assertEqual(arm.get("transform"), "translate(3.2 0)")
            rays = root.find(".//*[@id='idea-rays']")
            self.assertEqual(rays.get("stroke"), "#ffd84f")
            self.assertEqual(rays.get("d"), "M237,112L246,108M238,124L250,124M234,136L244,142")
            self.assertEqual(root.find(".//*[@id='mouth']").get("d"), "M115,178C124,191 134,191 143,176")

    def test_shared_rig_matches_source_geometry(self):
        source = ET.parse(LOGO).getroot()
        rig = BUILDER.build_rig()
        for source_element, shape in zip(list(source)[3:5], rig["body"], strict=True):
            self.assertEqual(source_element.attrib, shape["attrs"])

    def test_build_writes_only_media_exports(self):
        with tempfile.TemporaryDirectory() as temporary:
            kit = Path(temporary) / "outputs"
            poses = Path(temporary) / "poses.json"
            poses.write_bytes(POSES.read_bytes())
            with patch.object(BUILDER, "KIT", kit), patch.object(BUILDER, "POSES", poses):
                BUILDER.build()
            self.assertEqual({path.name for path in kit.iterdir()}, {"static", "overview.png"})
            expected = {path.relative_to(KIT / "static") for path in (KIT / "static").rglob("*") if path.is_file()}
            actual = {path.relative_to(kit / "static") for path in (kit / "static").rglob("*") if path.is_file()}
            self.assertEqual(actual, expected)
            for relative in expected:
                self.assertEqual((kit / "static" / relative).read_bytes(),
                                 (KIT / "static" / relative).read_bytes())
            # Text rasterization varies between macOS and Linux, and resized
            # artwork has small pixel differences too. Exclude text and allow
            # only measured rounding noise here; standalone exports above and
            # same-host repeatability below remain exact.
            with Image.open(kit / "overview.png") as actual_board, Image.open(KIT / "overview.png") as expected_board:
                self.assertEqual(actual_board.size, expected_board.size)
                self.assertEqual(actual_board.mode, expected_board.mode)
                for index, name in enumerate(BUILDER.load_poses()):
                    x, y = 60 + (index % 3) * 570, 255 + (index // 3) * 540
                    artwork = (x, y, x + 550, y + 400)
                    with self.subTest(pose=name):
                        self.assert_preview_artwork_equal(actual_board.crop(artwork),
                                                          expected_board.crop(artwork))
            # The complete sheet, including text, must still be deterministic
            # when generated twice using the same host toolchain.
            first_board = (kit / "overview.png").read_bytes()
            with patch.object(BUILDER, "KIT", kit), patch.object(BUILDER, "POSES", poses):
                BUILDER.build()
            self.assertEqual((kit / "overview.png").read_bytes(), first_board)


if __name__ == "__main__":
    unittest.main()
