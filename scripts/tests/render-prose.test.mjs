import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { renderProse } from '../../src/lib/render-prose.mjs';
import { glossaryTerms } from '../../src/data/glossary.ts';
import { languages } from '../../handbook.config.ts';

const render = (html, options = {}) => parseHTML(`<html><body>${renderProse(html, { lang: 'en', ...options })}</body></html>`).document;
const explicit = (term, definition = 'Author-supplied definition') => `<dfn><button type="button" class="definition-term" data-definition="${definition}" title="${definition}">${term}</button></dfn>`;

test('heading permalinks exist in rendered HTML with stable IDs, localized labels and decorative icons', () => {
  const document = render('<h1 id="title">Title</h1><h2 id="already-stable">A <em>heading</em></h2><aside><h3 id="component-heading">Component heading</h3></aside><h3>No ID</h3><h4 id="small">Small</h4>', { anchorLabel: 'Link zum Abschnitt' });
  assert.deepEqual([...document.querySelectorAll('[data-heading-anchor]')].map(anchor => anchor.getAttribute('href')), ['#already-stable', '#component-heading']);
  for (const anchor of document.querySelectorAll('[data-heading-anchor]')) {
    assert.equal(anchor.getAttribute('aria-label'), 'Link zum Abschnitt');
    assert.equal(anchor.querySelector('svg').getAttribute('aria-hidden'), 'true');
    assert.equal(anchor.querySelector('svg').getAttribute('focusable'), 'false');
  }
  assert.equal(document.querySelector('h2 em').textContent, 'heading');
  assert.equal(document.querySelector('h2').id, 'already-stable');
});

test('existing heading and glossary-list permalinks remain untouched and enhancement is idempotent', () => {
  const html = '<h2 id="existing">Heading<a data-heading-anchor href="#existing" aria-label="Existing">#</a></h2><dl class="glossary"><dt id="term">Term<a data-heading-anchor href="#term">#</a></dt></dl>';
  const once = renderProse(html, { lang: 'en' });
  assert.equal(renderProse(once, { lang: 'en' }), once);
  assert.equal(render(once).querySelectorAll('[data-heading-anchor]').length, 2);
});

for (const lang of languages) {
  test(`${lang}: first glossary occurrence uses existing forms, labels and definition fallback`, () => {
    const entry = glossaryTerms[lang][0];
    const form = entry.forms[0];
    const document = render(`<h1>${form}</h1><p>${form} then ${form.toUpperCase()}.</p><aside><p>${form}</p></aside>`, { lang, glossary: true });
    const marks = [...document.querySelectorAll('[data-definition]')];
    assert.equal(marks.length, 1);
    assert.equal(marks[0].textContent, form);
    assert.equal(marks[0].getAttribute('data-definition'), entry.definition);
    assert.equal(marks[0].getAttribute('title'), entry.definition);
    assert.equal(marks[0].getAttribute('type'), 'button');
    assert.equal(marks[0].parentElement.tagName, 'DFN');
    assert.equal(document.querySelector('h1 [data-definition]'), null);
    assert.equal(document.querySelector('aside [data-definition]'), null);
  });
}

test('automatic matching is opt-in; explicit definitions remain available everywhere', () => {
  const form = glossaryTerms.en[0].forms[0];
  const document = render(`<p>${form}</p>${explicit(form)}`);
  assert.equal(document.querySelector('p [data-definition]'), null);
  assert.equal(document.querySelector('[data-definition]').getAttribute('data-definition'), 'Author-supplied definition');
});

test('excluded content never consumes an automatic first occurrence', () => {
  const form = glossaryTerms.en[0].forms[0];
  const document = render(`<h1>${form}</h1><a href="/">${form}</a><button>${form}</button><code>${form}</code><pre>${form}</pre><dfn>${form}</dfn><dl><dt>${form}</dt><dd>${form}</dd></dl><div class="glossary"><p>${form}</p></div><script>const term = "${form}";</script><style>/* ${form} */</style><p id="first">${form}</p>`, { glossary: true });
  assert.equal(document.querySelectorAll('[data-definition]').length, 1);
  assert.ok(document.querySelector('#first [data-definition]'));
  assert.equal(document.querySelector('script').textContent, `const term = "${form}";`);
});

test('explicit and automatic definitions share document-order deduplication', () => {
  const form = glossaryTerms.en[0].forms[0];
  for (const [html, expected] of [
    [`${explicit(form)}<p>${form}</p>${explicit(form)}`, 'Author-supplied definition'],
    [`<p>${form}</p>${explicit(form)}${explicit(form)}`, glossaryTerms.en[0].definition],
  ]) {
    const document = render(html, { glossary: true });
    assert.equal(document.querySelectorAll('[data-definition]').length, 1);
    assert.equal(document.querySelectorAll('dfn').length, 1);
    assert.equal(document.querySelector('[data-definition]').getAttribute('data-definition'), expected);
    assert.equal(document.body.textContent, form.repeat(3));
    const once = renderProse(html, { lang: 'en', glossary: true });
    assert.equal(renderProse(once, { lang: 'en', glossary: true }), once);
  }
});

test('title definitions do not consume the first prose occurrence and custom terms are preserved', () => {
  const form = glossaryTerms.en[0].forms[0];
  const document = render(`<h1>${explicit(form)}</h1><p>${form}</p>${explicit('Custom author term')}`, { glossary: true });
  assert.equal(document.querySelectorAll('[data-definition]').length, 3);
  assert.ok(document.querySelector('p [data-definition]'));
  assert.equal(document.querySelectorAll('button')[2].textContent, 'Custom author term');
});

test('word boundaries, longest variants, separators, and repeated matches retain surrounding text', () => {
  const document = render('<p>Medienmonitoring; Bellermannkiezblock; Superblocks, Superblock. Street-Design und Street Design.</p>', { lang: 'de', glossary: true });
  assert.equal(document.body.textContent, 'Medienmonitoring; Bellermannkiezblock; Superblocks, Superblock. Street-Design und Street Design.');
  assert.deepEqual([...document.querySelectorAll('[data-definition]')].map(term => term.textContent), ['Superblocks', 'Street-Design']);
});

test('one pass combines heading, glossary and external-link markup without nesting interactive elements', () => {
  const form = glossaryTerms.en[0].forms[0];
  const document = render(`<h2 id="topic">${form}</h2><p><a href="https://example.org">${form}</a><img src="street.jpg" alt="Street"></p>`, {
    glossary: true, external: { site: 'https://city.example/', notice: 'Opens in a new tab' },
  });
  assert.ok(document.querySelector('h2 > dfn > button[data-definition]'));
  assert.ok(document.querySelector('h2 > a[data-heading-anchor]'));
  assert.equal(document.querySelector('a button, button a'), null);
  assert.equal(document.querySelector('p a').getAttribute('target'), '_blank');
  assert.ok(document.querySelector('p a .external-link-icon'));
  assert.ok(document.querySelector('img'));
});

test('all prose routes use the shared renderer and client initialization only wires popup interaction', () => {
  const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  for (const path of ['src/layouts/BookLayout.astro', 'src/layouts/PageLayout.astro', 'src/pages/brand/index.astro']) {
    assert.match(read(path), /<Prose\s/);
  }
  assert.match(read('src/components/Prose.astro'), /renderProse\(await Astro.slots.render\('default'\)/);
  assert.doesNotMatch(read('src/scripts/app.ts'), /initHeadings|initGlossaryTerms|glossary-terms/);
  assert.match(read('src/scripts/app.ts'), /initDefinitions\(\)/);
  assert.doesNotMatch(read('src/scripts/definitions.ts'), /buildGlossaryMatcher|glossary\.json/);
});
