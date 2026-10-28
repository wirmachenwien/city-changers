"""Standalone delivery checks; no image/render dependencies needed."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
import sys

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/package-brand-kit.py"
sys.path.insert(0, str(SCRIPT.parent))
SPEC = importlib.util.spec_from_file_location("package_brand_kit", SCRIPT)
PACKAGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACKAGE)


class BrandHandoffTest(unittest.TestCase):
    def test_allowlist_is_complete_and_safe(self):
        files = PACKAGE.asset_map()
        self.assertEqual(len([p for p in files if p.endswith(".mov")]), 12)
        self.assertEqual(len([p for p in files if p.startswith("03-animation/lottie/")]), 12)
        self.assertEqual(len([p for p in files if p.startswith("02-mascot-stills/")]), 24)
        for destination, source in files.items():
            with self.subTest(file=destination):
                self.assertTrue(source.is_file(), source)
                self.assertNotIn("..", Path(destination).parts)
                self.assertFalse(any(part.startswith(".") for part in Path(destination).parts))
                self.assertNotIn(source.suffix, {".zip", ".py", ".tsx"})
        for family in ("ClarityCity", "Fraunces", "Newsreader"):
            self.assertIn(f"04-fonts/OFL-{family}.txt", files)

    def test_packaged_files_match_sources_and_zip(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            PACKAGE.build(output)
            kit = output / "city-changers-brand-kit"
            inventory = json.loads((kit / "inventory.json").read_text())["assets"]
            for item in inventory:
                data = (kit / item["file"]).read_bytes()
                self.assertEqual(hashlib.sha256(data).hexdigest(), item["sha256"])
                self.assertEqual(len(data), item["bytes"])
                self.assertEqual(data, (PACKAGE.ROOT / item["source"]).read_bytes())
            with zipfile.ZipFile(output / "city-changers-brand-kit.zip") as archive:
                self.assertIsNone(archive.testzip())
                expected = {str(p.relative_to(output)) for p in kit.rglob("*") if p.is_file()}
                self.assertEqual(set(archive.namelist()), expected)
                for name in archive.namelist():
                    self.assertEqual(archive.read(name), (output / name).read_bytes())
            (kit / "recipient-notes.txt").write_text("Keep me")
            with self.assertRaises(FileExistsError):
                PACKAGE.build(output)
            self.assertEqual((kit / "recipient-notes.txt").read_text(), "Keep me")

    def test_missing_input_does_not_create_release(self):
        original = PACKAGE.asset_map
        try:
            PACKAGE.asset_map = lambda: {"missing.png": PACKAGE.ROOT / "does-not-exist.png"}
            with tempfile.TemporaryDirectory() as temporary:
                output = Path(temporary) / "release"
                with self.assertRaises(FileNotFoundError):
                    PACKAGE.build(output)
                self.assertFalse(output.exists())
        finally:
            PACKAGE.asset_map = original
