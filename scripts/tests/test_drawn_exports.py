"""Drawn styling reaches both static builders without browser-only features."""
import re
import sys
import unittest
from pathlib import Path
from urllib.parse import unquote
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from color_registry import load_colors
from handbook.book import markdown_to_html
from handbook.drawn import drawn_css, bracket_svg, frame_paths, media_svg, pdf_document, table_svg
from handbook.markers import marker_hints
from test_figure_media import builder


class DrawnExportTest(unittest.TestCase):
    def test_exports_do_not_use_or_package_clarity_city(self):
        for filename in ('print.css', 'epub.css', 'export-drawn.css'):
            with self.subTest(stylesheet=filename):
                css = (ROOT / 'src/styles' / filename).read_text()
                self.assertNotIn('Clarity', css)
                self.assertNotIn('sans-serif', css)
        epub = builder('build-epub')
        self.assertTrue(all(font.startswith(('Newsreader', 'Fraunces')) for font in epub.EPUB_FONTS))
        browser_print = (ROOT / 'src/styles/global.css').read_text().rsplit('@media print {', 1)[1]
        self.assertIn('--font-ui: "Newsreader"', browser_print)

    def test_export_component_headings_and_copy_use_serif_families(self):
        from weasyprint import HTML

        pdf = builder('build-pdf')
        body = ('<figure><figcaption>Caption</figcaption></figure>'
                '<blockquote class="pullquote">Quote<footer>Citation</footer></blockquote>'
                '<div class="question"><p class="question-title">Question title</p><p>Question copy</p></div>'
                '<p class="mascot-box__title">Mascot title</p>'
                '<table><thead><tr><th>Column title</th></tr></thead><tbody><tr><td>Table copy</td></tr></tbody></table>')
        doc = HTML(string=f'<style>{pdf.print_css()}</style>{body}').render()
        text = [box for box in doc.pages[0]._page_box.descendants() if hasattr(box, 'text')]
        for label in ('Caption', 'Citation', 'Question copy', 'Table copy'):
            box = next(box for box in text if box.text == label)
            self.assertEqual(box.style['font_family'][0], 'Newsreader')
        for label in ('Question title', 'Mascot title', 'Column title'):
            box = next(box for box in text if box.text == label)
            self.assertIn('Fraunces', box.style['font_family'])
            self.assertEqual(box.style['font_weight'], 700)

    def test_svg_decoration_is_self_contained_and_uses_print_tokens(self):
        css = drawn_css()
        self.assertNotIn('url("drawn/', css)
        self.assertNotIn("var(--", css)
        self.assertNotIn("mask-image", css)
        images = re.findall(r'url\("data:image/svg\+xml,([^"]+)"\)', css)
        self.assertGreaterEqual(len(images), 9)
        for image in images:
            svg = unquote(image)
            ElementTree.fromstring(svg)
            self.assertNotIn("currentColor", svg)
        colors = load_colors()["themes"]["print"]
        decoded = unquote(css)
        for token in ("accent", "accent-soft", "warm", "warm-soft", "line", "panel"):
            self.assertIn(colors[token], decoded)

    def test_both_builders_preserve_white_figure_treatment(self):
        pdf, epub = builder("build-pdf"), builder("build-epub")
        book = epub.EpubBook("en", {"title": "Test"}, Path("unused.epub"))
        source = '<Figure src="erasmus-plus_en.png" alt="Partners" frame="white" size="small" float="center" />'
        for output in (pdf.convert_mdx(source), book.convert_mdx(source)):
            for name in ("figure--framed", "figure--small", "figure--float-center"):
                self.assertIn(name, output)
        self.assertEqual(len(book.drawn_images), 1)
        svg = next(iter(book.drawn_images.values()))
        self.assertIn('clip-path="url(#frame)"', svg)
        self.assertIn('x="16" y="16"', svg)
        self.assertIn(load_colors()['themes']['light']['line'], svg)

    def test_credit_and_footnote_rules_are_drawn_without_warm_credit_fill(self):
        css = (ROOT / 'src/styles/export-drawn.css').read_text()
        credits = re.search(r'\.title-page-licence\s*\{([^}]+)', css)[1]
        self.assertIn('background: transparent;', credits)
        self.assertNotIn('warm', credits)
        self.assertIn('.title-page-licence::before, .footnotes::before', css)
        footnote = re.search(r'@footnote\s*\{([^}]+)', css)[1]
        self.assertIn('border-top: 0;', footnote)
        self.assertIn('drawn/lines/divider.svg?stroke=line', footnote)
        self.assertIn('view=4,0,472,24', footnote)
        rule = re.search(r'\.title-page-licence::before, \.footnotes::before\s*\{([^}]+)', css)[1]
        self.assertIn('view=4,0,472,24', rule)

    def test_title_page_and_glossary_use_requested_serif_faces(self):
        from weasyprint import HTML

        pdf = builder('build-pdf')
        source = ('<div class="title-page-details"><span class="title-page-label">Contributors</span>'
                  '<p>People behind this book</p><div class="title-page-licence"><p>CC BY 4.0</p></div></div>'
                  '<dl class="glossary"><dt>Superblock</dt><dd>A neighbourhood.</dd></dl>')
        doc = HTML(string=f'<style>{pdf.print_css()}</style>{source}').render()
        text = [box for box in doc.pages[0]._page_box.descendants() if hasattr(box, 'text')]
        for label in ('Contributors', 'People behind this book', 'CC BY 4.0'):
            box = next(box for box in text if box.text == label)
            self.assertEqual(box.style['font_family'][0], 'Newsreader')
        term = next(box for box in text if box.text == 'Superblock')
        self.assertEqual(term.style['font_family'][0], 'Fraunces')
        self.assertEqual(term.style['font_weight'], 700)
        epub = (ROOT / 'src/styles/epub.css').read_text()
        self.assertIn('"Newsreader"', re.search(r'\.title-page-details\s*\{([^}]+)', epub)[1])
        self.assertTrue(any('"Fraunces Display"' in rule for rule in re.findall(r'dl\.glossary dt\s*\{([^}]+)', epub)))

    def test_bracket_caps_use_web_variants_and_fixed_24px_ends(self):
        for height, native in [(60, 56), (110, 104), (250, 160)]:
            for warm in (False, True):
                svg = ElementTree.fromstring(bracket_svg(height, warm))
                layers = list(svg)
                self.assertEqual([float(layer.get('height')) for layer in layers], [24, height - 48, 24])
                self.assertEqual(layers[-1].get('viewBox'), f'0 {native - 24} 32 24')
                self.assertEqual(svg.get('stroke'), load_colors()['themes']['print']['warm' if warm else 'accent'])

    def test_marker_hints_follow_nested_reversed_and_explicit_numbering(self):
        source = '<ol start="9"><li>Nine<ul><li>Bullet</li></ul></li><li>Ten</li><li value="2">Two</li></ol><ol reversed><li>Two</li><li>One</li></ol>'
        hinted = marker_hints(source)
        self.assertIn('data-marker-number="9" data-marker-single=""', hinted)
        self.assertIn('data-marker-number="10">Ten', hinted)
        self.assertIn('<ul><li>Bullet</li></ul>', hinted)
        self.assertEqual(hinted.count('data-marker-single'), 4)
        css = (ROOT / 'src/styles/export-drawn.css').read_text()
        single = re.search(r'li\[data-marker-single\]::before\s*\{([^}]+)', css)[1]
        self.assertIn('width: 1.5em;', single)
        self.assertIn('left: -2.475em;', single)
        self.assertIn('height: 1.65em;', css)

    def test_header_paint_and_media_share_exact_web_paths_not_scaled_corners(self):
        path = frame_paths([(400, 160)])[0]
        table = ElementTree.fromstring(table_svg(400, 160, 32, path))
        ns = {'s': 'http://www.w3.org/2000/svg'}
        self.assertEqual(table.find('s:defs/s:clipPath/s:path', ns).get('d'), path)
        self.assertEqual(table.find('s:rect', ns).get('clip-path'), 'url(#frame)')
        source = (ROOT / 'src/assets/book/erasmus-plus_en.png').as_uri()
        media = ElementTree.fromstring(media_svg(source, 400, 160, path))
        outline = media.findall('s:path', ns)[-1]
        self.assertEqual(outline.get('d'), path)
        self.assertEqual(outline.get('stroke'), load_colors()['themes']['light']['line'])
        self.assertEqual(media.find('s:image', ns).get('clip-path'), 'url(#frame)')

    def test_weasyprint_renders_brackets_bubble_frames_and_native_counters(self):
        pdf = builder("build-pdf")
        source = '''<FeatureBox title="A tip" tone="warm">

1. First step
2. Second step

</FeatureBox>

<MascotBox title="Think about it" pose="think">

A useful reminder.

</MascotBox>

> A community voice.

<ol start="9"><li>Nine</li><li value="12">Twelve</li></ol>

<div class="question"><p>Ready?</p><ol><li>Yes</li></ol></div>

| One | Two |
| --- | --- |
| First | Second |

<Figure src="erasmus-plus_en.png" alt="Partners" size="small" />

---
'''
        body = markdown_to_html(pdf.convert_mdx(source), "en")
        self.assertIn('class="mascot-box__title"', body)
        self.assertIn('start="9"', body)
        self.assertIn('value="12"', body)
        doc, final = pdf_document(f"<html><head><style>{pdf.print_css()}</style></head><body>{body}</body></html>")
        self.assertEqual(len(doc.pages), 1)
        self.assertIn('data-drawn-table=', final)
        self.assertIn('.feature-box[data-drawn-bracket="0"]::before', final)
        boxes = list(doc.pages[0]._page_box.descendants())
        quote = next(box for box in boxes if box.element_tag == 'blockquote')
        self.assertEqual(quote.padding_left, 24)
        self.assertEqual(quote.style['background_size'][0][1].value, 240)
        bracket = next(box for box in boxes if box.element_tag == 'div::before' and box.element.get('data-tone') == 'warm')
        self.assertEqual(len(bracket.style['background_image']), 1)
        feature = next(box for box in boxes if box.element_tag == 'div' and box.element.get('data-tone') == 'warm')
        self.assertEqual(feature.border_top_width, 0)
        self.assertEqual(feature.border_bottom_width, 0)
        self.assertEqual(feature.padding_left, 40)
        item = next(box for box in boxes if box.element_tag == 'li' and box.__class__.__name__ == 'BlockBox'
                    and box.element.get('data-marker-number') == '9')
        pebble = next(box for box in item.children if box.element_tag == 'li::before')
        line = next(box for box in item.descendants() if box.__class__.__name__ == 'LineBox')
        self.assertAlmostEqual(pebble.position_y + pebble.height / 2, line.position_y + line.height / 2)
        question = next(box for box in boxes if box.element_tag == 'div' and box.element.get('class') == 'question')
        marker = next(box for box in question.descendants() if box.element_tag == 'li::before')
        from tinycss2.color4 import parse_color
        self.assertEqual(marker.style['color'], parse_color(load_colors()['themes']['print']['warm']))
        text = " ".join(box.text for box in doc.pages[0]._page_box.descendants() if hasattr(box, "text"))
        for label in ("A tip", "A useful reminder.", "Nine", "Twelve"):
            self.assertIn(label, text)
        # Painting catches border-image failures that layout alone does not.
        self.assertTrue(doc.write_pdf().startswith(b"%PDF"))


if __name__ == "__main__":
    unittest.main()
