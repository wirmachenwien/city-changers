import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { initSearchFocus } from '../../src/scripts/search-focus.ts';

test('only pointer-focused search fields suppress their ring, with Tab and blur restoring native focus behavior', () => {
  const { document, window } = parseHTML('<html><body><span class="search-box"><input type="search"></span><input type="text"></body></html>');
  const globals = { document, Element: window.Element, HTMLElement: window.HTMLElement };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  try {
    initSearchFocus();
    initSearchFocus();
    const input = document.querySelector('input[type="search"]');
    const other = document.querySelector('input[type="text"]');
    const key = value => {
      const event = new window.Event('keydown', { bubbles: true });
      event.key = value;
      input.dispatchEvent(event);
    };
    assert.equal(input.hasAttribute('data-search-pointer-focus'), false, 'programmatic/autofocus keeps the native ring');
    other.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    assert.equal(other.hasAttribute('data-search-pointer-focus'), false);
    input.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    assert.equal(input.hasAttribute('data-search-pointer-focus'), true);
    key('a');
    assert.equal(input.hasAttribute('data-search-pointer-focus'), true, 'typing after a click does not reintroduce the ring');
    key('Tab');
    assert.equal(input.hasAttribute('data-search-pointer-focus'), false, 'keyboard navigation restores the standard ring');
    input.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    input.dispatchEvent(new window.Event('focusout', { bubbles: true }));
    assert.equal(input.hasAttribute('data-search-pointer-focus'), false);
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('focus border uses brand green, with pointer-only ring suppression excluded from forced colors', () => {
  const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const css = read('src/styles/global.css');
  const drawn = read('src/styles/drawn-elements.css');
  assert.match(css, /\.search-box > input\[type="search"\]:focus \{\s*border-color: var\(--accent\);/);
  assert.match(css, /@media screen and \(forced-colors: none\) \{\s*\.search-box > input\[type="search"\]\[data-search-pointer-focus\]:focus \{\s*outline: none;/);
  assert.match(css, /:focus-visible \{\s*outline: 3px solid var\(--focus\);/);
  assert.ok(drawn.includes('.search-box:focus-within { --drawn-stroke: var(--accent); }'));
  assert.ok(drawn.includes('.search-box.drawn-ready > input[type="search"]:focus { border-color: transparent; }'));
});

test('search border turns green only on focus, while the magnifier also turns green on hover', () => {
  const css = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.search-box:hover > input\[type="search"\]/);
  const drawn = readFileSync(new URL('../../src/styles/drawn-elements.css', import.meta.url), 'utf8');
  assert.doesNotMatch(drawn, /\.search-box:hover/);
  assert.match(css, /\.search-box:hover > \.icon,\s*\.search-box:focus-within > \.icon \{\s*color: var\(--accent\);\s*opacity: 1;/);
});

test('search icon grows subtly on hover or focus without shifting its centered position', () => {
  const css = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.search-box > \.icon \{ transition: transform 160ms ease-out, color 160ms ease-out, opacity 160ms ease-out; \}/);
  assert.ok(css.includes('.search-box > input[type="search"] { transition: border-color 160ms ease-out; }'));
  assert.ok(css.includes('.search-box::after { transition: background-color 160ms ease-out; }'));
  assert.match(css, /\.search-box:hover > \.icon,\s*\.search-box:focus-within > \.icon \{ transform: translateY\(-50%\) scale\(1\.1\); \}/);
});

test('navigation search keeps its active fill while hovered, focused or populated and fills its mobile row', () => {
  const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const css = read('src/styles/global.css');
  assert.match(css, /\.site-head \.search-box \{\s*--search-surface: var\(--accent-soft\);/);
  assert.match(css, /\.site-head \.search-box:is\(:hover, :focus-within\),\s*\.site-head \.search-box:has\(> input:not\(:placeholder-shown\)\) \{\s*--search-surface: var\(--paper\);/);
  const mobile = css.match(/\.site-head-tools \.search-form--mini \{([^}]+)\}/)[1];
  assert.match(mobile, /flex: 1 1 100%;/);
  assert.match(mobile, /inline-size: 100%;/);
  assert.match(mobile, /max-inline-size: none;/);
  assert.match(read('src/styles/drawn-elements.css'), /--drawn-fill: var\(--search-surface, var\(--paper\)\)/);
});
