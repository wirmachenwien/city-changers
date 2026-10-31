import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('search submit uses the full shared button style and a measurable inline text label', () => {
  const form = read('src/components/SearchForm.astro');
  assert.match(form, /<button class="button-link" type="submit"><span>/);
  const css = read('src/styles/global.css');
  assert.match(css, /\.search-form \.button-link \{[^}]*margin: 0;/);
  assert.match(css, /\.search-form \.button-link > span:not\(\.drawn-link-rule\) \{\s*display: inline-block;/);
  assert.doesNotMatch(css, /\.search-form button \{\s*font: inherit;/);
});

test('search input disables native inset chrome but retains explicit colors, borders and focus', () => {
  const css = read('src/styles/global.css');
  const input = css.split('.search-form input[type="search"] {')[1].split('}')[0];
  assert.match(input, /appearance: none;/);
  assert.match(input, /box-shadow: none;/);
  assert.match(input, /background: var\(--paper\);/);
  assert.match(input, /color: var\(--ink\);/);
  assert.match(input, /border: 1px solid var\(--ink\);/);
  assert.doesNotMatch(input, /outline:\s*(?:none|0)/);
});
