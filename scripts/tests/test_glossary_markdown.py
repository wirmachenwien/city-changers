import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from handbook.glossary import glossary_markdown
from handbook.mdx import glossary_lang_html
from handbook.book import markdown_to_html
from handbook.config import load_config


class GlossaryMarkdownTest(unittest.TestCase):
    def test_links_and_inline_formatting(self):
        self.assertEqual(
            glossary_markdown('A **helpful** *tool*. [Download (PDF)](/resources/Awesome%20Street%20Radar%20English.pdf).'),
            'A <strong>helpful</strong> <em>tool</em>. <a href="/resources/Awesome%20Street%20Radar%20English.pdf">Download (PDF)</a>.')

    def test_plain_text_and_html(self):
        self.assertEqual(glossary_markdown('Safety & comfort'), 'Safety &amp; comfort')
        self.assertEqual(glossary_markdown('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;')
        self.assertEqual(glossary_markdown('[Bad](javascript:alert)'), 'Bad')

    def test_code_spans_escape_literal_characters_only_once(self):
        self.assertEqual(glossary_markdown('`<x>` and `a & b`'), '<code>&lt;x&gt;</code> and <code>a &amp; b</code>')

    def test_shared_glossary_uses_markdown(self):
        rendered = glossary_lang_html('en', {'en': [{'term': 'Radar', 'definition': '[Download](/resources/radar.pdf)'}]})
        self.assertIn('<dd><a href="/resources/radar.pdf">Download</a></dd>', rendered)

    def test_exports_link_to_online_resources(self):
        result = markdown_to_html('[Download](/resources/radar.pdf)', 'en')
        self.assertIn(load_config()['site'].rstrip('/') + '/resources/radar.pdf', result)


if __name__ == '__main__':
    unittest.main()
