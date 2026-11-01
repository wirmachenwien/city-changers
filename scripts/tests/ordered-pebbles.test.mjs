import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { rehypeDrawnContainers } from '../../src/lib/rehype-drawn-containers.mjs';

const css = readFileSync(new URL('../../src/styles/drawn-elements.css', import.meta.url), 'utf8');
const selector = '.prose ol:not([class]):not(.footnotes ol)';

test('ordered pebbles retain native numbering and exclude utility lists and footnotes', () => {
  assert.ok(css.includes(`${selector} > li::marker { font-size: 0; }`));
  assert.match(css, /content: counter\(list-item\) \/ '';/);
  assert.doesNotMatch(css, /counter-(?:reset|increment):\s*list-item/);
  assert.ok(css.indexOf(selector) > css.indexOf('@media screen and (forced-colors: none)'));
});

test('breadcrumb lists are classified as navigation, not prose ordered lists', () => {
  const source = readFileSync(new URL('../../src/components/Breadcrumbs.astro', import.meta.url), 'utf8');
  assert.ok(source.includes('<ol class="crumbs__list">'));
  const { document } = parseHTML('<div class="prose"><nav class="crumbs"><ol class="crumbs__list"><li>Home</li></ol></nav><ol><li>Step</li></ol></div>');
  assert.equal(document.querySelectorAll(`${selector} > li`).length, 1);
  assert.equal(document.querySelector(`${selector} > li`).textContent, 'Step');
});

test('markers share aligned logical geometry, centered Fraunces and semantic green colors', () => {
  const number = css.split(`${selector} > li::before {`)[1].split('}')[0];
  assert.match(number, /display: grid;/);
  assert.match(number, /place-items: center;/);
  assert.match(number, /font-family: var\(--font-title\);/);
  assert.match(number, /font-variation-settings: var\(--fraunces-vars\);/);
  assert.match(number, /color: var\(--accent\);/);
  assert.match(number, /font-variant-numeric: lining-nums tabular-nums;/);
  const pebble = css.split(`${selector} > li::after {`).at(-1).split('}')[0];
  assert.match(pebble, /background: var\(--accent-soft\);/);
  assert.match(pebble, /mask: url\('[^']*share-pebble\.svg'\)/);
  assert.match(css, /padding-inline-start: 2\.85em;/);
  assert.match(css, /inset-inline-start: -2\.85em;/);
});

test('single-character pebbles are narrower but retain the shared marker center', () => {
  const single = css.split('> li:nth-child(-n+9)::after {')[1].split('}')[0];
  assert.match(single, /inline-size: 1\.5em;/);
  assert.match(single, /inset-inline-start: -2\.475em;/);
  assert.ok(Math.abs((-2.475 + 1.5 / 2) - (-2.85 + 2.25 / 2)) < 1e-10);
});

test('warm FeatureBox markers use the semantic brown palette', () => {
  assert.ok(css.includes('.prose .feature-box[data-tone="warm"] ol:not([class]) > li::before { color: var(--warm); }'));
  assert.ok(css.includes('.prose .feature-box[data-tone="warm"] ol:not([class]) > li::after { background: var(--warm-soft); }'));
});

test('standard lists get upright markers directly from CSS, without generated attributes', () => {
  const fallback = `${selector}:not([start]):not([reversed]):not(:has(> li[value])) > li:nth-child(-n+9)`;
  assert.ok(css.includes(`${fallback}::before,`));
  assert.ok(css.includes(`${fallback}::after {`));
  const { document } = parseHTML(`<div class="prose"><ol>${Array.from({ length: 12 }, () => '<li>Step</li>').join('')}</ol><ol start="10"><li>Ten</li></ol><ol reversed><li>Reverse</li></ol><ol><li value="20">Twenty</li></ol></div>`);
  assert.equal(document.querySelectorAll(fallback).length, 9);
});

test('build-time marker hints follow actual numbers, including starts, overrides and reversed lists', () => {
  const check = (properties, values, expected) => {
    const items = values.map(value => ({ type: 'element', tagName: 'li', properties: value === undefined ? {} : { value }, children: [] }));
    const tree = { type: 'root', children: [{ type: 'element', tagName: 'ol', properties, children: items }] };
    rehypeDrawnContainers()(tree);
    assert.deepEqual(items.map(item => item.properties.dataMarkerSingle === ''), expected);
  };
  check({ start: 9 }, [undefined, undefined, undefined], [true, false, false]);
  check({ reversed: true, start: 10 }, [undefined, undefined, undefined], [false, true, true]);
  check({}, [undefined, 10, undefined, 3], [true, false, false, true]);
  check({ reversed: true }, [undefined, undefined], [true, true]);
  check({ start: -1 }, [undefined, undefined, undefined], [false, true, true]);
});
