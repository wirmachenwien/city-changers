"""PDF/EPUB materialize the same registry without custom-property support."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from handbook.book import resolve_color_tokens
from color_registry import load_colors


class ColorExportTest(unittest.TestCase):
    def test_exports_resolve_all_color_variables_to_registered_values(self):
        palette = json.loads((ROOT / "src/data/colors.generated.json").read_text())
        for filename in ("print.css", "epub.css"):
            with self.subTest(filename=filename):
                css = resolve_color_tokens((ROOT / "src/styles" / filename).read_text())
                self.assertNotIn("var(--", css)
                self.assertIn(palette["themes"]["print"]["warn"], css)
                self.assertIn(palette["themes"]["print"]["warn-soft"], css)
                self.assertNotIn("#8a5a00", css)
                self.assertNotIn("#faf3e8", css)
                self.assertNotIn("#eef5ef", css)
                self.assertIn(f'color: {palette["themes"]["print"]["accent"]}', css)
                self.assertIn(f'background: {palette["themes"]["print"]["paper"]}', css)

    def test_unknown_color_variables_fail_instead_of_shipping_broken_css(self):
        with self.assertRaisesRegex(ValueError, "Unregistered export color token"):
            resolve_color_tokens("a { color: var(--unregistered); }")

    def test_direct_python_entrypoints_reject_stale_generated_colors(self):
        temporary_root = Path(tempfile.gettempdir()) / "opencode"
        temporary_root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=temporary_root) as directory:
            root = Path(directory)
            for relative in ("design/colors.json", "src/data/colors.generated.json"):
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((ROOT / relative).read_bytes())
            self.assertEqual(load_colors(root)["themes"]["light"]["accent"], load_colors()["themes"]["light"]["accent"])
            with (root / "design/colors.json").open("a") as source:
                source.write("\n")
            with self.assertRaisesRegex(ValueError, "Generated colors are outdated"):
                load_colors(root)


if __name__ == "__main__":
    unittest.main()
