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
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
KIT = ROOT / "src/assets/mascot"
POSES = ROOT / "design/assets/mascot/source/poses.json"
LOGO = ROOT / "src/assets/site/logo.svg"
NS = "{http://www.w3.org/2000/svg}"
SPEC = importlib.util.spec_from_file_location("build_mascot_kit", ROOT / "design/scripts/build-mascot-kit.py")
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)


class MascotKitTest(unittest.TestCase):
    def test_pose_source_stays_in_design_not_in_outputs(self):
        self.assertTrue(POSES.is_file())
        self.assertFalse((KIT / "source").exists())

    def test_all_poses_have_transparent_exports_in_both_treatments(self):
        poses = json.loads(POSES.read_text())
        self.assertEqual(set(poses), {"neutral", "wave", "point", "celebrate", "think", "step"})
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
            self.assertEqual((kit / "overview.png").read_bytes(), (KIT / "overview.png").read_bytes())


if __name__ == "__main__":
    unittest.main()
