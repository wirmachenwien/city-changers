import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveRegistry } from '../lib/colors.mjs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const brighten = color => '#' + color.slice(1).match(/../g).map(channel => Math.min(255, Math.round(parseInt(channel, 16) * 1.1)).toString(16).padStart(2, '0')).join('');

test('text-link hover matches solid button background brightness in both themes', () => {
  const { themes } = resolveRegistry(JSON.parse(read('design/colors.json')));
  for (const theme of ['light', 'dark']) {
    const base = themes[theme].accent;
    assert.equal(themes[theme]['link-hover'], brighten(base));
  }
  const css = read('src/styles/global.css');
  assert.match(css, /a:hover \{\s*color: var\(--link-hover\);/);
  assert.match(css, /\.button-link:hover \{\s*color: var\(--accent-ink\);\s*filter: brightness\(1\.1\);/);
  assert.ok(css.includes('a[x-apple-data-detectors]:hover { color: var(--link-hover); }'));
});

test('footer hover brightens its own muted color by the same 10%, not to green', () => {
  const { themes } = resolveRegistry(JSON.parse(read('design/colors.json')));
  for (const theme of ['light', 'dark']) {
    assert.equal(themes[theme]['footer-link-hover'], brighten(themes[theme]['ink-soft']));
    assert.notEqual(themes[theme]['footer-link-hover'], themes[theme]['link-hover']);
  }
  assert.match(read('src/styles/global.css'), /\.site-footer a:hover \{\s*color: var\(--footer-link-hover\);/);
});
