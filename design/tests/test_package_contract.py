"""Small, stdlib-only portability contract; never builds production artwork."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath, PureWindowsPath
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "design/scripts"))
import asset_library as ASSETS
import brand_release as BRAND
from package_format import KIT_FORMAT_VERSION, archive_members, json_bytes, posix_name, text_bytes
from color_registry import load_colors

PACKAGE = BRAND.load_script("package-brand-kit")


class CaseFoldPath(type(Path())):
    """Exercise Windows-style native ordering on every test platform."""
    def __lt__(self, other):
        return self.as_posix().casefold() < other.as_posix().casefold()


def portability_result(path_type=Path):
    with tempfile.TemporaryDirectory(prefix="brand-contract-") as temporary:
        root = path_type(temporary)
        for file in (*BRAND.PACKAGING_INPUTS, "design/colors.json"):
            (root / file).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / file, root / file)
        (root / "design/manifest.json").write_bytes(json_bytes({"groups": [
            {"title": "Approved fixture — Grüße", "source": "assets", "include": ["*.txt", "nested/*.dat"], "destination": ""}
        ]}))
        (root / "design/edition.json").write_bytes(json_bytes({"date": "2026-11-14", "revision": 0}))
        files = {"START-HERE.txt": text_bytes("Grüße from the fixture.\nRead this first.\n"),
                 "Zeta.txt": b"uppercase member\n", "alpha.txt": b"lowercase member\n",
                 "nested/binary.dat": bytes(range(256)) * 4}
        for name, content in files.items():
            file = root / "assets" / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(content)
        (root / "assets/ignored.TXT").write_bytes(b"Case-sensitive selection must exclude this on Windows too")
        with patch.object(ASSETS, "ROOT", root), patch.object(ASSETS, "DESIGN", root / "design"), \
             patch.object(BRAND, "ROOT", root), patch.object(BRAND, "DESIGN", root / "design"), \
             patch.object(PACKAGE, "ROOT", root), patch.object(PACKAGE, "load_colors", side_effect=lambda: load_colors(root)):
            inventory = BRAND.inventory()
            PACKAGE.build(root / "output")
        archive = root / "output" / BRAND.KIT_NAME
        with zipfile.ZipFile(archive) as zipped:
            names = zipped.namelist()
            assert names == sorted(names)
            assert not any("ignored.TXT" in name for name in names)
            assert all(member.compress_type == zipfile.ZIP_STORED for member in zipped.infolist())
            kit_inventory = json.loads(zipped.read("city-changers-brand-kit/inventory.json"))
            assert kit_inventory["format"] == KIT_FORMAT_VERSION
            assert all("\\" not in record["source"] for record in kit_inventory["assets"])
        return {"format": KIT_FORMAT_VERSION, "inventoryFingerprint": inventory["fingerprint"],
                "zipSha256": hashlib.sha256(archive.read_bytes()).hexdigest(), "members": names}


class PackageContractTest(unittest.TestCase):
    def test_paths_and_serialization_have_no_native_defaults(self):
        self.assertEqual(posix_name(PureWindowsPath("assets\\nested\\file.txt")), "assets/nested/file.txt")
        self.assertEqual(posix_name(PurePosixPath("assets/nested/file.txt")), "assets/nested/file.txt")
        self.assertEqual(json_bytes({"z": "Grüße", "a": 1}), json_bytes({"a": 1, "z": "Grüße"}))
        self.assertEqual(text_bytes("one\r\ntwo\rthree\n"), b"one\ntwo\nthree\n")

    def test_member_order_does_not_use_native_path_comparisons(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = CaseFoldPath(temporary)
            names = ["START-HERE.html", "inventory.json", "Zeta.txt", "alpha.txt"]
            for name in names:
                (root / name).write_bytes(b"fixture")
            self.assertEqual([file.name for file in archive_members(root)], sorted(names))

    def test_complete_inventory_and_zip_are_portable_not_just_individual_fields(self):
        self.assertEqual(portability_result(), portability_result(CaseFoldPath))

    def test_fingerprinted_text_and_binary_assets_survive_autocrlf_checkout(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "source"
            root.mkdir()
            (root / ".gitattributes").write_bytes((ROOT / ".gitattributes").read_bytes())
            text_files = ["design/scripts/package_format.py", "design/brand-guide.mdx", "design/colors.json",
                          "src/data/colors.generated.json", "src/assets/site/logo.svg", "src/assets/book/figure.svg",
                          "src/assets/mascot/static/ink/fixture.svg", "src/assets/mascot/lottie/green-fix-fixture.json",
                          "src/assets/fonts/OFL-fixture.txt", "public/site.webmanifest", "public/favicon.svg", "LICENSE"]
            files = {name: b"first\nsecond\n" for name in text_files}
            files["src/assets/mascot/video/fixture.mov"] = b"\0first\nsecond\r\n"
            for name, content in files.items():
                (root / name).parent.mkdir(parents=True, exist_ok=True)
                (root / name).write_bytes(content)
            def git(*args):
                return subprocess.run(["git", *args], cwd=root, check=True, capture_output=True)
            git("init", "--quiet")
            git("add", ".")
            git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "--quiet", "-m", "fixture")
            checkout = Path(temporary) / "checkout"
            git("clone", "--quiet", "--config", "core.autocrlf=true", str(root), str(checkout))
            for name, content in files.items():
                with self.subTest(file=name):
                    self.assertEqual((checkout / name).read_bytes(), content)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--write-result", type=Path)
    args, remaining = parser.parse_known_args()
    if args.write_result:
        args.write_result.parent.mkdir(parents=True, exist_ok=True)
        args.write_result.write_bytes(json_bytes(portability_result()))
    else:
        unittest.main(argv=[sys.argv[0], *remaining])
