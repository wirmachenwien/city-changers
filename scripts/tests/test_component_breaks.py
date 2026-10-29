"""Export component titles carry the classes used to keep them with content."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from handbook.mdx import quiz_html, strip_static_handlers


class ComponentBreakTest(unittest.TestCase):
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

    def test_quiz_title_is_a_marked_paragraph(self):
        converted = quiz_html(
            "Ready?",
            '{ label: "Yes", correct: true }, { label: "No" }',
            "Answers",
        )
        self.assertIn(
            '<p class="quiz-title"><strong>Quiz: Ready?</strong></p>',
            converted,
        )

    def test_export_styles_keep_component_titles_with_content(self):
        for name in ("print.css", "epub.css"):
            with self.subTest(stylesheet=name):
                css = (ROOT / "src" / "styles" / name).read_text(encoding="utf-8")
                for selector in ("accordion-title", "quiz-title", "feature-box__title", "mascot-box__title"):
                    self.assertIn(f".{selector}", css)
                self.assertRegex(css, r"break-after:\s*avoid")

    def test_accordion_title_gap_is_tightened(self):
        expected_gap = {"print.css": "margin: 0 0 3pt;", "epub.css": "margin: 0 0 0.2em;"}
        for name, gap in expected_gap.items():
            with self.subTest(stylesheet=name):
                css = (ROOT / "src" / "styles" / name).read_text(encoding="utf-8")
                self.assertIn(".accordion-title {", css)
                self.assertIn(gap, css)
                self.assertIn(".accordion-title + * {", css)


if __name__ == "__main__":
    unittest.main()
