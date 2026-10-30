"""Export component titles carry the classes used to keep them with content."""
import sys
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from handbook.mdx import question_html, strip_static_handlers


class ComponentBreakTest(unittest.TestCase):
    def test_share_links_are_a_utility_list_not_an_editorial_bullet_list(self):
        source = (ROOT / "src/components/Share.astro").read_text()
        self.assertIn('<ul class="share-links">', source)
        self.assertNotIn('<ul>', source)

    def test_code_blocks_do_not_inherit_inline_code_chips_or_fixed_shiki_colors(self):
        css = (ROOT / "src/styles/global.css").read_text()
        inline = re.search(r"\.prose :not\(pre\) > code\s*\{([^}]+)\}", css).group(1)
        block = re.search(r"\.prose pre\s*\{([^}]+)\}", css).group(1)
        code = re.search(r"\.prose pre code\s*\{([^}]+)\}", css).group(1)
        spans = re.search(r"\.prose pre span\s*\{([^}]+)\}", css).group(1)
        self.assertIn("background: var(--panel);", inline)
        self.assertIn("overflow-x: auto;", block)
        self.assertIn("ui-monospace", block)
        self.assertIn("background: var(--panel) !important;", block)
        self.assertIn("color: var(--ink) !important;", block)
        self.assertIn("padding: 0;", code)
        self.assertIn("background: none;", code)
        self.assertIn("font: inherit;", code)
        self.assertIn("color: inherit !important;", spans)

    def test_editorial_bullets_use_generous_sparks_without_replacing_list_semantics(self):
        for name in ("global.css", "print.css", "epub.css"):
            with self.subTest(stylesheet=name):
                css = (ROOT / "src/styles" / name).read_text()
                self.assertIn("ul:not([class]) > li::marker", css)
                self.assertIn("list-style-type: disc;", css)
                self.assertIn("1.1rem", css)
                self.assertIn("icons/spark", css)
                self.assertIn("icons/spark-outline", css)
                self.assertNotIn("pebble", css)
                marker = re.search(r"ul:not\(\[class\]\) > li::before\s*\{([^}]+)\}", css).group(1)
                self.assertIn("1.1rem", marker)

    def test_sidebar_bookmarks_stick_below_the_header_and_fit_the_viewport(self):
        css = (ROOT / "src/styles/global.css").read_text()
        bookmarks = re.search(r"\.side-nav \[data-bookmark-nav\]\s*\{([^}]+)\}", css).group(1)
        self.assertIn("position: sticky;", bookmarks)
        self.assertIn("inset-block-start: var(--scroll-offset, 5rem);", bookmarks)
        self.assertIn("max-block-size: calc(100dvb - var(--scroll-offset, 5rem) - 1rem);", bookmarks)
        self.assertIn("overflow-y: auto;", bookmarks)

    def test_styles_use_root_relative_instead_of_element_relative_units(self):
        for path in (ROOT / "src/styles").glob("*.css"):
            with self.subTest(stylesheet=path.name):
                self.assertNotRegex(path.read_text(), r"\d(?:\.\d+)?em\b")

    def test_web_question_only_adds_feedback_space_when_populated(self):
        css = (ROOT / "src/styles/global.css").read_text()
        question = re.search(r"^\.question\s*\{([^}]+)\}", css, re.MULTILINE).group(1)
        self.assertIn("padding: 1.75rem 1.25rem;", question)
        feedback = re.search(r"\.question \.question-feedback\s*\{([^}]+)\}", css).group(1)
        self.assertNotIn("min-block-size", feedback)
        self.assertIn("margin: 0 0 0.75rem;", feedback)
        empty = re.search(r"\.question \.question-feedback:empty\s*\{([^}]+)\}", css).group(1)
        self.assertIn("margin: 0;", empty)
        self.assertNotIn("display: none", empty)

    def test_accordion_title_is_a_marked_paragraph(self):
        converted = strip_static_handlers(
            '<Accordion title="1. Introduction">Body copy</Accordion>'
        )
        self.assertIn(
            '<p class="accordion-title"><strong>1. Introduction</strong></p>',
            converted,
        )

    def test_accordion_title_is_escaped(self):
        converted = strip_static_handlers(
            '<Accordion title="People & places">Body copy</Accordion>'
        )
        self.assertIn("People &amp; places", converted)

    def test_question_title_is_a_marked_paragraph(self):
        converted = question_html(
            "Ready?",
            '{ label: "Yes", correct: true }, { label: "No" }',
            "",
            "Answers",
        )
        self.assertIn(
            '<p class="question-title"><strong>Question: Ready?</strong></p>',
            converted,
        )

    def test_export_styles_keep_component_titles_with_content(self):
        for name in ("print.css", "epub.css"):
            with self.subTest(stylesheet=name):
                css = (ROOT / "src" / "styles" / name).read_text(encoding="utf-8")
                for selector in ("accordion-title", "question-title", "feature-box__title", "mascot-box__title"):
                    self.assertIn(f".{selector}", css)
                self.assertRegex(css, r"break-after:\s*avoid")

    def test_accordion_title_gap_is_tightened(self):
        expected_gap = {"print.css": "margin: 0 0 3pt;", "epub.css": "margin: 0 0 0.2rem;"}
        for name, gap in expected_gap.items():
            with self.subTest(stylesheet=name):
                css = (ROOT / "src" / "styles" / name).read_text(encoding="utf-8")
                self.assertIn(".accordion-title {", css)
                self.assertIn(gap, css)
                self.assertIn(".accordion-title + * {", css)


if __name__ == "__main__":
    unittest.main()
