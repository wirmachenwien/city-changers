"""EPUB media stays small without touching the approved source images."""
import base64
import io
import os
import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from test_figure_media import builder


def noisy_jpeg(path: Path, size: tuple[int, int] = (2400, 1800)) -> Path:
    """Incompressible pixels make the size reduction assertion meaningful."""
    image = Image.frombytes("RGB", size, os.urandom(size[0] * size[1] * 3))
    image.save(path, "JPEG", quality=95)
    return path


class EpubMediaTest(unittest.TestCase):
    def setUp(self):
        self.epub = builder("build-epub")
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = noisy_jpeg(self.root / "photo.jpg")
        self.original = self.source.read_bytes()

    def book(self):
        return self.epub.EpubBook("en", {"title": "Test"}, self.root / "unused.epub")

    def add_figure(self, book, source: Path, **kwargs):
        with patch.object(self.epub, "find_asset", return_value=source):
            return book.add_figure(str(source), **kwargs)

    def embedded(self, svg: str) -> bytes:
        match = re.search(r'xlink:href="data:image/[^;]+;base64,([^"]+)"', svg)
        self.assertIsNotNone(match)
        return base64.b64decode(match.group(1))

    def test_figures_embed_a_2x_derivative_and_leave_the_original_alone(self):
        book = self.book()
        href = self.add_figure(book, self.source, size="small")
        svg = book.drawn_images[href]
        self.assertIn('width="288"', svg)
        embedded = self.embedded(svg)
        with Image.open(io.BytesIO(embedded)) as image:
            self.assertEqual(image.width, 576)
            self.assertEqual(image.height, 432)
        self.assertLess(len(embedded), len(self.original) / 2)
        self.assertEqual(self.source.read_bytes(), self.original)

    def test_repeated_figures_reuse_the_cached_derivative(self):
        book = self.book()
        first = self.add_figure(book, self.source, size="small")
        second = self.add_figure(book, self.source, size="small")
        self.assertNotEqual(first, second)
        self.assertEqual(len(book._derivatives), 1)
        self.assertEqual(book.drawn_images[first], book.drawn_images[second])

    def test_large_packaged_images_are_bounded_and_small_ones_are_untouched(self):
        book = self.book()
        packed = book.packaged_image_bytes(str(self.source))
        self.assertLess(len(packed), len(self.original))
        with Image.open(io.BytesIO(packed)) as image:
            self.assertEqual(image.width, self.epub.EPUB_MAX_IMAGE_WIDTH)

        small = self.root / "icon.png"
        Image.new("RGBA", (32, 32), (255, 0, 0, 128)).save(small)
        self.assertEqual(book.packaged_image_bytes(str(small)), small.read_bytes())

    def test_png_figures_keep_png_bytes_and_alpha(self):
        source = self.root / "diagram.png"
        Image.frombytes("RGBA", (1200, 900), os.urandom(1200 * 900 * 4)).save(source)
        book = self.book()
        href = self.add_figure(book, source, size="medium")
        svg = book.drawn_images[href]
        self.assertIn("data:image/png;base64,", svg)
        with Image.open(io.BytesIO(self.embedded(svg))) as image:
            self.assertEqual(image.format, "PNG")
            self.assertEqual(image.mode, "RGBA")
            self.assertEqual(image.width, 896)


if __name__ == "__main__":
    unittest.main()
