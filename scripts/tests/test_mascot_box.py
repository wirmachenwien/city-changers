"""Mascot callouts keep their artwork and formatted text in both book formats."""
import importlib.util
import json
from pathlib import Path
import sys
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from handbook.book import markdown_to_html


def load_builder(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts/bin" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


PDF = load_builder("build-pdf")
EPUB = load_builder("build-epub")
POSES = json.loads((ROOT / "src/data/mascots.json").read_text())


class MascotBoxTest(unittest.TestCase):
    def test_think_hold_frame_keeps_the_idea_rays_fully_visible(self):
        frame = POSES["think"]["holdFrame"]
        for treatment in ("ink", "linen"):
            animation = json.loads((ROOT / f"src/assets/mascot/lottie/green-fix-think-{treatment}.json").read_text())
            self.assertLess(frame, animation["op"])
            rays = next(layer for layer in animation["layers"] if layer["nm"] == "Idea rays")
            keyframe = next(key for key in rays["ks"]["o"]["k"] if key["t"] == frame)
            self.assertEqual(keyframe["s"], [100])

    def test_every_pose_has_a_real_still_and_any_declared_animation(self):
        for pose, assets in POSES.items():
            for treatment in ("ink", "linen"):
                self.assertTrue((ROOT / f"src/assets/mascot/static/{treatment}/{assets['still']}.svg").is_file(), pose)
                if assets["animation"]:
                    self.assertTrue((ROOT / f"src/assets/mascot/lottie/green-fix-{assets['animation']}-{treatment}.json").is_file(), pose)

    def test_pdf_falls_back_to_ink_for_every_pose_even_if_animated_or_linen(self):
        for pose, assets in POSES.items():
            source = f'<MascotBox pose="{pose}" animated treatment="linen" title="A & B">\n\nTry **one street**.\n\n- Ask a neighbour\n- Make a plan\n\n</MascotBox>'
            body = markdown_to_html(PDF.convert_mdx(source, "en"), "en")
            self.assertIn((ROOT / f"src/assets/mascot/static/ink/{assets['still']}.png").as_uri(), body)
            self.assertIn('<strong>one street</strong>', body)
            self.assertIn('<li>Ask a neighbour</li>', body)
            self.assertIn('A &amp; B', body)
            self.assertNotIn('MascotBox', body)
            self.assertNotIn('markdown=', body)
            self.assertNotIn('<button', body)

    def test_epub_registers_matching_png_and_never_embeds_animation(self):
        for pose, assets in POSES.items():
            book = EPUB.EpubBook("en", {"title": "Test"}, Path("unused.epub"))
            body = markdown_to_html(book.convert_mdx(f'<MascotBox pose="{pose}" animated>\n\nA **helpful** tip.\n\n</MascotBox>'), "en")
            self.assertIn(f'images/mascot-{assets["still"]}.png', body)
            self.assertIn('<strong>helpful</strong>', body)
            self.assertEqual(len(book.images), 1)
            self.assertTrue(all(path.endswith('.png') for path in book.images))
            self.assertNotIn('MascotBox', body)
            self.assertNotIn('<script', body)
            ET.fromstring(f'<section>{EPUB.as_xhtml(body)}</section>')

    def test_epub_void_image_normalization_handles_paths_and_existing_xhtml(self):
        for image in ('<img src="images/mascot-think.png" alt="">',
                      '<img src="images/mascot-think.png" alt="" />',
                      '<img src="images/mascot-think.png" alt="a > b">'):
            ET.fromstring(EPUB.as_xhtml(image))

    def test_default_and_multiple_boxes_keep_text_and_title(self):
        book = EPUB.EpubBook("en", {"title": "Test"}, Path("unused.epub"))
        source = '<MascotBox title={"First tip"}>\n\nFirst **body**.\n\n</MascotBox>\n\nBetween.\n\n<MascotBox pose="wave">\n\nSecond body.\n\n</MascotBox>'
        body = markdown_to_html(book.convert_mdx(source), "en")
        self.assertEqual(body.count('class="mascot-box"'), 2)
        self.assertIn('First tip', body)
        self.assertIn('First <strong>body</strong>', body)
        self.assertIn('Between.', body)
        self.assertIn('Second body.', body)
        self.assertEqual(len(book.images), 2)

    def test_unknown_pose_cannot_be_used_as_an_asset_path(self):
        with self.assertRaisesRegex(ValueError, "Unknown mascot pose"):
            PDF.convert_mdx('<MascotBox pose="../../private">Text</MascotBox>')

    def test_real_chapter_tip_is_present_in_every_language(self):
        for lang in ("en", "de", "sl"):
            source = (ROOT / f"src/content/book/{lang}/01.mdx").read_text()
            self.assertIn('<MascotBox', source)
            self.assertIn('pose="think" animated', source)
            book = EPUB.EpubBook(lang, {"title": "Test"}, Path("unused.epub"))
            self.assertIn('images/mascot-think.png', book.convert_mdx(source))


if __name__ == "__main__":
    unittest.main()
