import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { textLinkMarkup } from '../../src/lib/text-link-underlines.mjs';
import { renderProse } from '../../src/lib/render-prose.mjs';
import { readRegistry, resolveRegistry, generateOutputs } from '../lib/colors.mjs';
import { fileURLToPath } from 'node:url';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const documentFor = html => parseHTML(`<html><body>${textLinkMarkup(html)}</body></html>`).document;

test('inline prose labels preserve wrapping markup, text, link semantics and accessible names', () => {
  const document = documentFor('<a href="/chapter#section" download="chapter.html" aria-label="Full chapter">A long <em>formatted</em> link</a>');
  const link = document.querySelector('a');
  assert.equal(link.dataset.cssUnderline, 'text');
  assert.equal(link.querySelectorAll('[data-text-link-label]').length, 1);
  assert.equal(link.textContent, 'A long formatted link');
  assert.equal(link.querySelector('em').textContent, 'formatted');
  assert.equal(link.getAttribute('aria-label'), 'Full chapter');
  assert.equal(link.getAttribute('href'), '/chapter#section');
  assert.equal(link.getAttribute('download'), 'chapter.html');
  assert.equal(textLinkMarkup(textLinkMarkup(link.outerHTML)), textLinkMarkup(link.outerHTML));
});

test('icons, images, hidden notices and measured navigation/control labels stay outside CSS prose paint', () => {
  const document = documentFor('<a href="/">Read this<svg aria-hidden="true"><path d="M0 0"/></svg><span class="external-link-notice"> (new tab)</span></a><a href="/image"><img src="street.jpg" alt="Street"></a><a class="button-link" href="/go">Go</a><nav><a href="/nav">Nav</a></nav><div class="pagination"><a href="/next">Next</a></div><a href="#title" data-heading-anchor>#</a><a href="/hover" data-link-underline="hover">Hover</a><a href="/card"><div>Card</div></a>');
  assert.equal(document.querySelectorAll('[data-css-underline="text"]').length, 1);
  const label = document.querySelector('[data-text-link-label]');
  assert.equal(label.textContent, 'Read this');
  assert.equal(label.querySelector('svg, .external-link-notice'), null);
  assert.equal(document.querySelector('a').textContent, 'Read this (new tab)');
});

test('rendered component links receive CSS labels after external-link enhancement', () => {
  const html = renderProse('<aside><p><a href="https://outside.example">Component link</a></p></aside>', {
    lang: 'en', external: { site: 'https://city.example', notice: 'New tab' },
  });
  const { document } = parseHTML(html);
  assert.equal(document.querySelector('[data-text-link-label]').textContent, 'Component link');
  assert.equal(document.querySelector('[data-text-link-label] .external-link-icon'), null);
  assert.equal(document.querySelector('a').getAttribute('target'), '_blank');
});

test('icons nested inside formatted link labels are also excluded without flattening formatting', () => {
  const document = documentFor('<a href="/"><em>Before <svg aria-hidden="true"><path d="M0 0"/></svg> after</em></a>');
  assert.equal(document.querySelector('a').textContent, 'Before  after');
  assert.equal(document.querySelector('em').children.length, 3);
  assert.equal(document.querySelector('[data-text-link-label] svg'), null);
  assert.equal(document.querySelectorAll('em > [data-text-link-label]').length, 2);
});

test('Quiet-rule background images use registry colors and the actual shared SVG path in every theme', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const registry = readRegistry(root), resolved = resolveRegistry(registry);
  const css = generateOutputs(registry, resolved, read('design/brand-guide.mdx')).get('src/styles/colors.generated.css');
  const path = read('design/elements/lines/divider.svg').match(/<path d="([^"]+)"/)[1];
  for (const token of registry.linkUnderlines.tokens) {
    const values = [...css.matchAll(new RegExp(`--link-rule-${token}: url\\("data:image/svg\\+xml,([^\"]+)"\\);`, 'g'))];
    assert.equal(values.length, 5, `${token}: default, explicit light/dark, OS dark, print`);
    for (const [index, [, encoded]] of values.entries()) {
      const mode = ['light', 'light', 'dark', 'dark', 'print'][index];
      const svg = decodeURIComponent(encoded);
      assert.ok(svg.includes(`stroke="${resolved.themes[mode][token]}"`));
      assert.ok(svg.includes(`d="${path}"`));
      assert.ok(svg.includes('viewBox="0 0 480 24"'));
    }
  }
});

test('CSS fragments prose labels and paints pebble/dropdown hover and keyboard focus without layout measurement', () => {
  const css = read('src/styles/text-link-underlines.css');
  assert.match(css, /box-decoration-break: clone/);
  assert.match(css, /background-size: max\(100%, 480px\) 12px, max\(100%, 480px\) 12px/);
  assert.match(css, /\[data-css-underline="pebble"\]:is\(:hover, :focus-visible\) > \[data-pebble-label\]::after/);
  assert.match(css, /background: currentColor/);
  assert.match(css, /:is\(\.copy-btn, \.share-btn, \.share a, \.language-switcher a\)\[data-css-underline="pebble"\]:is\(:hover, :focus-visible\) \{\s*text-decoration-line: none;/);
  assert.match(css, /@media screen and \(forced-colors: none\)/);
  assert.doesNotMatch(css, /outline:\s*none|text-decoration-style:\s*wavy/);
  const drawn = read('src/styles/drawn-elements.css');
  assert.match(drawn, /\.drawn-select:is\(:hover, :focus-within\) > \.drawn-select__value::after/);
  for (const component of ['Share', 'CopyText', 'LanguageSwitcher']) {
    const source = read(`src/components/${component}.astro`);
    assert.ok(source.includes('data-css-underline="pebble"'));
    assert.ok(source.includes('data-pebble-label'));
  }
  assert.match(read('src/components/DrawnSelect.astro'), /data-select-value aria-hidden="true"/);
});
