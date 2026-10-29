"""Approved vector sources, generated UI assets and archived originals."""
import json
from pathlib import Path
import re
import subprocess
import unittest
import xml.etree.ElementTree as ET

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ICONS = ROOT / "design/icons"
ASSETS = ROOT / "src/assets/icons"


class IconTest(unittest.TestCase):
    def test_generated_svg_png_and_runtime_outputs_are_fresh(self):
        result = subprocess.run(["node", "design/icons/build-icons.mjs", "--check"],
                                cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_selected_sources_are_exported_exactly_and_pngs_are_transparent(self):
        manifest = json.loads((ICONS / "manifest.json").read_text())
        runtime = json.loads((ROOT / "src/data/icons.generated.json").read_text())
        names = {icon["id"] for icon in manifest["icons"]}
        self.assertEqual(names, set(runtime))
        self.assertEqual(names, {path.stem for path in ASSETS.glob("*.svg")})
        for name in names:
            with self.subTest(icon=name):
                source = ICONS / "drawn" / f"{name}.svg"
                self.assertEqual(source.read_bytes(), (ASSETS / f"{name}.svg").read_bytes())
                self.assertEqual(ET.parse(source).getroot().get("viewBox"), "0 0 24 24")
                self.assertIn('aria-hidden="true"', runtime[name])
                self.assertIn('class="icon"', runtime[name])
                for theme in ("light", "dark"):
                    with Image.open(ASSETS / "png" / theme / f"{name}.png") as png:
                        self.assertEqual(png.size, (manifest["pngSize"], manifest["pngSize"]))
                        self.assertEqual(png.mode, "RGBA")
                        self.assertIsNotNone(png.getchannel("A").getbbox())
                        self.assertEqual(png.getpixel((0, 0))[3], 0)

    def test_old_archive_is_retained_without_alternate_families(self):
        self.assertTrue((ICONS / "old/search.svg").is_file())
        self.assertFalse((ICONS / "current").exists())
        self.assertFalse((ICONS / "pebble").exists())
        self.assertFalse((ICONS / "soft").exists())
        self.assertNotEqual((ICONS / "old/link.svg").read_bytes(), (ICONS / "drawn/link.svg").read_bytes())

    def test_all_source_links_exist_and_artwork_copies_are_unchanged(self):
        script = (ICONS / "catalog.js").read_text()
        catalog = json.loads(re.search(r"window.iconCatalog = ([\s\S]+?);\nwindow.iconArtwork", script).group(1))
        artwork = json.loads(re.search(r"window.iconArtwork = ([\s\S]+);", script).group(1))
        for icon in catalog:
            self.assertIn("svg", icon)
            for source in icon["sources"]:
                self.assertTrue((ROOT / source).is_file(), source)
        for filename, source in artwork:
            self.assertEqual((ICONS / "artwork" / filename).read_bytes(), (ROOT / source).read_bytes())

    def test_all_twelve_decorative_icons_have_plain_names(self):
        runtime = json.loads((ROOT / "src/data/icons.generated.json").read_text())
        for name in ("sprout", "spark", "steps", "flag", "crosswalk", "pebble"):
            for suffix in ("", "-outline"):
                self.assertIn(f"{name}{suffix}", runtime)
        manifest = json.loads((ICONS / "manifest.json").read_text())
        for icon in manifest["icons"]:
            self.assertNotIn("bullet-", icon["id"])
            self.assertFalse(icon["label"].startswith(("Marker:", "Bullet:")))
        self.assertFalse(list(ASSETS.rglob("bullet-*")))
