import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { readFileSync } from 'node:fs';
import { initPaginationUnderlines } from '../../src/scripts/pagination-underlines.ts';

test('pagination arrows nudge in their pointing direction on hover and keyboard focus without moving labels', () => {
  const css = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');
  assert.match(css, /@media screen and \(prefers-reduced-motion: no-preference\) \{\s*\.pagination a > \.icon \{\s*transition: transform 180ms ease-out;/);
  assert.match(css, /\.pagination \.prev:is\(:hover, :focus-visible\) > \.icon \{\s*transform: translate\(-0\.25rem, 0\.15rem\);/);
  assert.match(css, /\.pagination \.next:is\(:hover, :focus-visible\) > \.icon \{\s*transform: translate\(0\.25rem, 0\.15rem\);/);
  assert.doesNotMatch(css, /\.pagination (?:a|\[data-pagination-label\]):is\(:hover, :focus-visible\)\s*\{[^}]*transform:/);
});

function environment({ supported = true } = {}) {
  const { document } = parseHTML('<html><body><nav class="pagination"><a href="/next" data-link-underline="pagination"><span data-pagination-label><span data-pagination-text>03 Tactical urbanism and street design</span></span></a></nav></body></html>');
  const label = document.querySelector('[data-pagination-label]');
  const text = document.querySelector('[data-pagination-text]');
  let left = 100, top = 200, resized, selected;
  let lines = [{ left: 0, top: 0, width: 190, height: 22 }, { left: 0, top: 30, width: 115, height: 22 }];
  const frames = [], observed = new Set();
  label.getBoundingClientRect = () => ({ left, top, width: 200, height: 60 });
  document.createRange = () => ({
    selectNodeContents(node) { selected = node; },
    getClientRects() {
      assert.equal(selected, text, 'only the text is measured, never the label container or decorative paint');
      return lines.map(line => ({ left: left + line.left, bottom: top + line.top + line.height, width: line.width, height: line.height }));
    },
  });
  const globals = {
    document,
    window: { ...(supported ? { ResizeObserver: true } : {}), addEventListener() {} },
    requestAnimationFrame: callback => frames.push(callback),
    ResizeObserver: class {
      constructor(callback) { resized = callback; }
      observe(node) { observed.add(node); }
    },
  };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  return {
    document, label, observed,
    flush() { for (const frame of frames.splice(0)) frame(); },
    resize() { resized([{ target: label }]); },
    move() { left += 40; top += 200; },
    setLines(value) { lines = value; },
    cleanup() {
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

test('wrapped pagination gets exactly one stroke of the actual width under each text line', () => {
  const env = environment();
  try {
    initPaginationUnderlines();
    initPaginationUnderlines();
    env.flush();
    const layer = env.label.querySelector('.pagination__rules');
    assert.equal(layer.getAttribute('aria-hidden'), 'true');
    assert.equal(layer.children.length, 2);
    assert.equal(layer.children[0].style.width, '190px');
    assert.equal(layer.children[1].style.width, '115px', 'the second line does not inherit the chapter number or container width');
    assert.equal(layer.children[0].style.top, '22px');
    assert.equal(layer.children[1].style.top, '52px');
    assert.equal(env.document.querySelector('a').dataset.paginationReady, '');
    assert.equal(env.observed.size, 1, 'only the label is observed, not page-height changes');
    const first = layer.firstElementChild;
    env.move();
    env.resize();
    env.flush();
    assert.equal(layer.firstElementChild, first, 'page movement needs no repaint and cannot corrupt local positioning');
  } finally { env.cleanup(); }
});

test('right-aligned wrapping follows each line start and refreshes when text rewraps', () => {
  const env = environment();
  try {
    initPaginationUnderlines();
    env.flush();
    env.setLines([{ left: 10, top: 0, width: 190, height: 22 }, { left: 85, top: 30, width: 115, height: 22 }]);
    env.resize();
    env.flush();
    const layer = env.label.querySelector('.pagination__rules');
    assert.equal(layer.children[0].style.left, '10px');
    assert.equal(layer.children[1].style.left, '85px');
    assert.equal(layer.children[1].style.width, '115px');
    env.setLines([{ left: 0, top: 0, width: 300, height: 22 }]);
    env.resize();
    env.flush();
    assert.equal(layer.children.length, 1);
    assert.equal(layer.firstElementChild.style.width, '300px');
  } finally { env.cleanup(); }
});

test('initial pagination paint still works without ResizeObserver', () => {
  const env = environment({ supported: false });
  try {
    initPaginationUnderlines();
    env.flush();
    assert.equal(env.label.querySelector('.pagination__rules').children.length, 2);
    assert.equal(env.observed.size, 0);
  } finally { env.cleanup(); }
});
