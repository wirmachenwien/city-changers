"""Publication front-matter checks; no PDF renderer or browser required."""

import importlib.util
from pathlib import Path
import re
import sys
import unittest
from unittest.mock import patch
import json

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))


def load_builder(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts/bin" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


PDF = load_builder("build-pdf")
EPUB = load_builder("build-epub")
TITLE = 'Toolbox & "City" Changers'
WORK = {
    "title": TITLE,
    "subtitle": "A handbook by partner organisations",
    "creator": "CREATOR LINE MUST NOT APPEAR",
    "publisher": "PUBLISHER LINE MUST NOT APPEAR",
    "contributor": "Alice & Bob",
}
FILES = ["0-0-cover", "0-1-titlepage"]


class FrontmatterTest(unittest.TestCase):
    def test_partner_assets_resolve_and_are_packaged(self):
        book = EPUB.EpubBook("en", WORK, Path("unused.epub"))
        partners = json.loads((ROOT / "src/data/partners.json").read_text())
        for partner in partners:
            name = Path(partner["src"]).name
            with self.subTest(name=name):
                source = ROOT / "src/assets/site" / name
                self.assertEqual(PDF.image_uri(name), source.as_uri())
                self.assertEqual(book.add_image(name), f"images/{name}")
                self.assertIn(source.resolve().as_posix(), book.images)

    def check_markup(self, cover, title):
        self.assertNotIn("handbook-mascot", cover)
        self.assertNotIn("handbook-lockup", cover)
        self.assertIn("<h1>", cover)
        self.assertNotIn("handbook-mascot", title)
        self.assertEqual(title.count("<h1"), 1)
        self.assertIn('class="handbook-lockup"', title)
        self.assertIn("logo-lockup.png", title)
        self.assertIn('alt="Toolbox &amp; &quot;City&quot; Changers"', title)
        heading = re.search(r"<h1\b[^>]*>(.*?)</h1>", title, re.S).group(1)
        self.assertTrue(heading.strip().startswith("<img"))
        self.assertIn('class="title-page-details"', title)
        self.assertIn('class="title-page-partners"', title)
        for organisation in ["Wir machen Wien", "Changing Cities", "Prostorož"]:
            self.assertIn(f'alt="{organisation}"', title)
        self.assertIn("Alice &amp; Bob", title)
        self.assertIn('class="title-page-label">Contributors</span>', title)
        self.assertNotIn(WORK["creator"], title)
        self.assertNotIn(WORK["publisher"], title)
        self.assertNotIn(WORK["subtitle"], title)
        self.assertLess(title.index("title-page-heading"), title.index("title-page-details"))

    def test_pdf_cover_and_title_page(self):
        with patch.multiple(PDF,
                            load_works=lambda: {"en": WORK},
                            chapter_lists=lambda _: (FILES, []),
                            front_opener=lambda _: "",
                            cover_resolution_warning=lambda _: None,
                            image_uri=lambda name: f"file:///fixtures/{name}",
                            cc_badge_html=lambda: "",
                            licence_html=lambda _: "",
                            print_css=lambda: "",
                            pdf_notes_mode=lambda: "footnotes"):
            document = PDF.build_document("en")
        sections = re.findall(r"<section\b[^>]*>(.*?)</section>", document, re.S)
        self.check_markup(*sections)

    def test_epub_cover_and_title_page(self):
        book = EPUB.EpubBook("en", WORK, Path("unused.epub"))
        with patch.multiple(EPUB,
                            chapter_lists=lambda _: (FILES, []),
                            front_opener=lambda _: "",
                            katex_font_files=lambda: [],
                            licence_html=lambda *_: ""), \
             patch.object(book, "add_font"), \
             patch.object(book, "add_image", side_effect=lambda name: f"images/{name}"), \
             patch.object(book, "cc_badge_html", return_value=""):
            book.build_chapters()
        self.check_markup(*(chapter["body"] for chapter in book.chapters))


if __name__ == "__main__":
    unittest.main()
