"""Web and book exports share automatic numbering in configured chapter order."""
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from handbook.mdx import question_numbers, question_html, question_html


class QuestionNumberingTest(unittest.TestCase):
    def test_web_and_exports_agree(self):
        script = '''
import { readFileSync, existsSync } from 'node:fs';
import { questionNumbers } from './src/lib/question-numbering.mjs';
const works = JSON.parse(readFileSync('src/data/works.json', 'utf8'));
const numbers = questionNumbers(works, (lang, file) => {
  const path = `src/content/book/${lang}/${file}.mdx`;
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
});
console.log(JSON.stringify(Object.fromEntries(numbers)));
'''
        result = subprocess.run(["node", "--input-type=module", "-e", script],
                                cwd=ROOT, check=True, capture_output=True, text=True)
        self.assertEqual(json.loads(result.stdout), question_numbers())
        for lang in ("en", "de", "sl"):
            numbers = [number for identifier, number in question_numbers().items()
                       if identifier.startswith(f"{lang}-")]
            self.assertTrue(numbers)
            self.assertEqual(numbers, list(range(1, len(numbers) + 1)))

    def test_numbering_updates_after_inserting_questions(self):
        subprocess.run(["node", "--test", "scripts/tests/question-numbering.test.mjs"],
                       cwd=ROOT, check=True, capture_output=True, text=True)

    def test_both_export_components_use_numbered_titles(self):
        for identifier, number in question_numbers().items():
            with self.subTest(identifier=identifier):
                expected = f'<strong>Question {number}: Ready?</strong>'
                self.assertIn(expected, question_html("Ready?", '{ label: "Yes", correct: true }', "",
                                                 "Answers", identifier))
                self.assertIn(expected, question_html("Ready?", '"Yes", "No"', "0",
                                                     "Answers", identifier))
