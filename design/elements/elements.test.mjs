import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parseHTML } from 'linkedom';
import * as drawing from './geometry.js';
import { cssFrameFiles } from './build-css-frames.mjs';

const root = new URL('./', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
const html = read('index.html');
const files = readdirSync(new URL('lines/', root)).filter(file => file.endsWith('.svg'));
const pathOf = file => read(file).match(/<path d="([^"]+)"/)[1];

test('header and footer boundary stroke reaches both viewport edges without oversizing its box', () => {
  const boundary = pathOf('lines/divider-strong.svg');
  assert.ok(boundary.startsWith('M0 12'));
  assert.ok(boundary.endsWith('960 12'));
  assert.match(read('lines/divider-strong.svg'), /viewBox="0 0 960 24"/);
  assert.match(read('../../src/components/Masthead.astro'), /import boundary from '[^']*lines\/divider-strong\.svg\?raw'/);
  assert.match(read('../../src/styles/drawn-elements.css'), /\.site-footer::before \{[^}]*divider-strong\.svg/);
});

test('all eleven active SVGs are used in production; restored studies stay separate', () => {
  assert.equal(files.length, 11);
  const sources = read('../../src/styles/drawn-elements.css') + read('../../src/components/FeatureBox.astro');
  const imports = new Set([...sources.matchAll(/design\/elements\/lines\/([\w-]+\.svg)/g)].map(match => match[1]));
  assert.deepEqual(new Set(files), imports);
  const { document } = parseHTML(html);
  for (const file of files) {
    assert.equal(document.querySelectorAll(`a[download][href="lines/${file}"]`).length, 1);
    assert.equal(document.querySelectorAll(`img[src="lines/${file}"]`).length, 1);
    const svg = read(`lines/${file}`);
    assert.match(svg, /currentColor/);
    assert.doesNotMatch(svg, /<script|<text|#[0-9a-f]{3,8}\b/i);
    if (!file.startsWith('bracket')) assert.match(svg, /preserveAspectRatio="none"/);
  }
  for (const obsolete of ['variations', 'shapes', 'frames.js', 'containers.css', 'build-variations.mjs']) {
    assert.equal(existsSync(new URL(obsolete, root)), false, `${obsolete} must not remain in the selected library`);
  }
});

test('restored archive catalogues every original SVG without replacing active masters', () => {
  const { document } = parseHTML(read('archive/index.html'));
  runInNewContext(read('archive/catalog.js'), { document });
  const archived = readdirSync(new URL('archive/', root), { recursive: true }).filter(file => file.endsWith('.svg'));
  assert.equal(archived.length, 41);
  assert.equal(document.querySelectorAll('a[download]').length, 41);
  for (const file of archived) {
    assert.equal(document.querySelectorAll(`a[download][href="${file}"]`).length, 1);
    assert.match(read(`archive/${file}`), /currentColor/);
  }
  assert.equal(read('lines/bracket.svg'), read('archive/lines/bracket.svg'));
  assert.notEqual(read('lines/divider.svg'), read('archive/lines/divider.svg'));
});

test('short verticals are exact Natural crops; medium alone uses Gentle', () => {
  const gentle = {
    'vertical-rule': 'M12 6C8 62 16 103 12 151S11 207 12 234',
    'accent-bar': 'M9 4C8 55 11 94 8 141S9 207 8 236L15 235C16 191 13 161 16 116S14 41 16 5Z',
  };
  for (const family of ['vertical-rule', 'accent-bar']) {
    assert.equal(pathOf(`lines/${family}-short.svg`), pathOf(`lines/${family}.svg`));
    assert.match(read(`lines/${family}-short.svg`), /viewBox="0 44 24 32"/);
    assert.match(read(`lines/${family}-medium.svg`), /viewBox="0 92 24 80"/);
    assert.equal(pathOf(`lines/${family}-medium.svg`), gentle[family]);
    assert.notEqual(pathOf(`lines/${family}.svg`), gentle[family]);
  }
});

test('Natural is the sole shape implementation, with constant-size tails and corners', () => {
  assert.deepEqual(Object.keys(drawing).sort(), ['bubblePath', 'compactPath', 'framePath']);
  assert.ok(drawing.framePath(320, 180).startsWith('M15.75 3.75'));
  assert.ok(drawing.compactPath(144, 44).startsWith('M7.9 2.9'));
  for (const [width, height] of [[240, 144], [320.5, 180.25], [900, 680]]) {
    for (const path of [drawing.framePath(width, height), drawing.compactPath(width, height), ...[false, true].map(top => drawing.bubblePath(width, height, top))]) {
      assert.equal((path.match(/M/g) || []).length, 1);
      assert.ok(path.endsWith('Z'));
      assert.doesNotMatch(path, /NaN|Infinity/);
    }
    assert.match(drawing.bubblePath(width, height, false), / 80L-15 56L9 48/);
    assert.match(drawing.bubblePath(width, height, true), /48 9L56 -15L80 9/);
  }
});

test('the library uses production CSS without measuring shapes or changing content', () => {
  const { document, window } = parseHTML(html);
  const before = document.getElementById('shape-previews').textContent;
  runInNewContext(read('preview.js'), { document });
  assert.equal(document.getElementById('shape-previews').textContent, before);
  assert.equal(document.querySelectorAll('[data-shape] svg').length, 0);
  assert.match(html, /src\/styles\/drawn-elements\.css/);
  const toggle = document.getElementById('shape-text');
  toggle.dispatchEvent(new window.Event('click'));
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(document.querySelectorAll('.extra[hidden]').length, 0);
  const slider = document.getElementById('shape-width');
  slider.value = '70';
  slider.dispatchEvent(new window.Event('input'));
  assert.equal(document.getElementById('shape-previews').style.getPropertyValue('--preview-width'), '70%');
});

test('CSS masks are fresh, palette-free nine-slice exports of the selected masters', () => {
  for (const [name, expected] of cssFrameFiles()) {
    const actual = read(`frames/${name}`);
    assert.equal(actual, expected, name);
    assert.doesNotMatch(actual, /#[0-9a-f]{3,8}\b/i);
    if (name.endsWith('.svg')) {
      const { document } = parseHTML(actual);
      assert.equal(document.querySelectorAll('view').length, 9);
      assert.equal(document.querySelectorAll('path').length, 1);
    }
  }
});

test('all page links resolve and print/forced-color fallbacks remain explicit', () => {
  const { document } = parseHTML(html);
  for (const node of document.querySelectorAll('[href], [src]')) {
    const reference = node.getAttribute('href') ?? node.getAttribute('src');
    if (reference.startsWith('#')) assert.ok(document.getElementById(reference.slice(1)));
    else if (!/^https?:/.test(reference)) assert.ok(existsSync(new URL(reference, root)), reference);
  }
  assert.match(html, /@media print, \(forced-colors: active\)/);
  assert.match(read('../../src/styles/drawn-elements.css'), /pointer-events: none/);
  assert.doesNotMatch(html, /data-level|squiggle-studies/);
});
