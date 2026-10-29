"""FeatureBox has the same default/warm variants in web and book exports."""
import importlib.util
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from handbook.mdx import feature_open_html


def load_builder(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts/bin" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


PDF = load_builder("build-pdf")
EPUB = load_builder("build-epub")


class FeatureBoxTest(unittest.TestCase):
    def test_only_warm_tone_adds_a_variant_attribute(self):
        self.assertNotIn("data-tone", feature_open_html(None))
        self.assertIn('data-tone="warm"', feature_open_html(None, tone="warm"))
        self.assertNotIn("data-tone", feature_open_html(None, tone='invalid" tone'))

    def test_both_exporters_preserve_tone_title_and_content(self):
        for tone in ("default", "warm"):
            source = f'<FeatureBox title="Remember" tone="{tone}">\n\nA **helpful** note.\n\n1. Listen\n2. Act\n\n</FeatureBox>'
            book = EPUB.EpubBook("en", {"title": "Test"}, Path("unused.epub"))
            for name, converted in (("pdf", PDF.convert_mdx(source, "en")),
                                    ("epub", book.convert_mdx(source))):
                with self.subTest(format=name, tone=tone):
                    self.assertIn('class="feature-box"', converted)
                    self.assertEqual('data-tone="warm"' in converted, tone == "warm")
                    self.assertIn("<strong>Remember</strong>", converted)
                    self.assertIn("A **helpful** note.", converted)
                    self.assertIn("1. Listen\n2. Act", converted)
                    self.assertNotIn("FeatureBox", converted)


if __name__ == "__main__":
    unittest.main()
