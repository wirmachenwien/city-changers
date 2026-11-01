"""The same Figure src contract applies to the website, PDF and EPUB."""
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from handbook.media import figure_video_url, figure_video_export_url


def builder(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts/bin" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FigureMediaTest(unittest.TestCase):
    def test_shared_url_contract(self):
        for case in json.loads((Path(__file__).parent / "fixtures/figure-media.json").read_text()):
            with self.subTest(src=case["src"]):
                self.assertEqual(figure_video_url(case["src"]), case["url"])

    def test_both_exporters_emit_video_links_without_packaging_images(self):
        pdf, epub = builder("build-pdf"), builder("build-epub")
        for src in ["https://youtu.be/87JUbbq48r8?t=3", "https://player.vimeo.com/video/123456", "/talk.MP4?download=1"]:
            for tag in ("Figure", "FigureBox"):
                with self.subTest(src=src, tag=tag):
                    source = f'<{tag} src="{src}" caption="A talk" />'
                    book = epub.EpubBook("en", {"title": "Test"}, Path("unused.epub"))
                    for output in (pdf.convert_mdx(source, "en"), book.convert_mdx(source)):
                        self.assertIn(figure_video_export_url(src), output)
                        self.assertIn("A talk", output)
                        self.assertNotIn("<img", output)
                    self.assertEqual(book.images, {})

    def test_export_urls_use_the_public_origin_and_base(self):
        config = {"site": "https://example.com", "base": "/handbook/"}
        cases = {
            "talk.webm": "https://example.com/handbook/talk.webm",
            "./videos/talk.mp4?download=1#t=3": "https://example.com/handbook/videos/talk.mp4?download=1#t=3",
            "/videos/talk.mp4": "https://example.com/videos/talk.mp4",
            "//cdn.example.com/talk.mp4": "https://cdn.example.com/talk.mp4",
            "https://other.example/talk.mov": "https://other.example/talk.mov",
            "https://youtu.be/87JUbbq48r8": "https://www.youtube.com/watch?v=87JUbbq48r8",
            "street.jpg": None,
        }
        with patch("handbook.media.load_config", return_value=config):
            for source, expected in cases.items():
                with self.subTest(source=source):
                    self.assertEqual(figure_video_export_url(source), expected)

    def test_both_exporters_resolve_local_media_before_rendering_links(self):
        pdf, epub = builder("build-pdf"), builder("build-epub")
        config = {"site": "https://example.com", "base": "/handbook/"}
        with patch("handbook.media.load_config", return_value=config):
            book = epub.EpubBook("en", {"title": "Test"}, Path("unused.epub"))
            for src in ("talk.mp4", "/videos/talk.webm?download=1#t=3"):
                source = f'<Figure src="{src}" caption="A talk" />'
                for output in (pdf.convert_mdx(source, "en"), book.convert_mdx(source)):
                    self.assertIn(figure_video_export_url(src), output)
                    self.assertNotIn(f"]({src})", output)


if __name__ == "__main__":
    unittest.main()
