import test from 'node:test';
import assert from 'node:assert/strict';
import { glossaryMarkdown, glossaryText } from '../../src/lib/glossary-markdown.mjs';
import { smartQuotes } from '../../src/lib/smart-quotes.ts';
import { renderProse } from '../../src/lib/render-prose.mjs';
import { parseHTML } from 'linkedom';

test('glossary definitions render inline Markdown and preserve PDF URLs', () => {
  const source = 'A **helpful** *tool*. [Download (PDF)](/resources/Awesome%20Street%20Radar%20English.pdf).';
  assert.equal(glossaryMarkdown(source), 'A <strong>helpful</strong> <em>tool</em>. <a href="/resources/Awesome%20Street%20Radar%20English.pdf">Download (PDF)</a>.');
  assert.equal(glossaryText(source), 'A helpful tool. Download (PDF).');
});

test('quotes are localised in labels, not link destinations', () => {
  assert.equal(glossaryMarkdown('["Guide"](/resources/author\'s.pdf "A guide")', text => smartQuotes(text, 'en')),
    '<a href="/resources/author\'s.pdf" title="A guide">“Guide”</a>');
});

test('reference links work and raw HTML and unsafe URLs cannot execute', () => {
  assert.equal(glossaryMarkdown('[Guide][pdf]\n\n[pdf]: /resources/guide.pdf').trim(), '<a href="/resources/guide.pdf">Guide</a>');
  assert.equal(glossaryMarkdown('[Bad](javascript:alert) [Bad](data:text/html,test)'), 'Bad Bad');
  assert.equal(glossaryMarkdown('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('automatic definition popups show link labels instead of Markdown syntax', () => {
  const rendered = renderProse('<p>Leiwande Straßen Radar</p>', { lang: 'en', glossary: true });
  assert.match(rendered, /Download PDF/);
  const { document } = parseHTML(`<html><body>${rendered}</body></html>`);
  const term = document.querySelector('[data-definition]');
  assert.doesNotMatch(term.dataset.definition, /\/resources\/|\]\(/);
  const popup = document.createElement('div');
  popup.innerHTML = term.dataset.definitionHtml;
  assert.equal(popup.querySelector('a').getAttribute('href'), '/resources/awesome-street-radar-en.pdf');
  assert.equal(popup.querySelector('a').dataset.cssUnderline, 'text');
  assert.match(popup.querySelector('[data-text-link-label]').textContent, /Download/);
});
