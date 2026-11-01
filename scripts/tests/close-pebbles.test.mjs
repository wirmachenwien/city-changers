import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const drawn = read('src/styles/drawn-elements.css');
const global = read('src/styles/global.css');
const section = drawn.split('/* X controls')[1].split('/* Icon toggles')[0];

test('popup, continue-reading and bookmark X controls share CSS-only pebble paint', () => {
  for (const selector of ['.content-popup-close-face', '.last-visit-toast button', '.bookmark-pin', '.bookmark-delete']) {
    assert.ok(section.includes(selector), selector);
  }
  assert.match(section, /border-radius: 0/);
  assert.match(section, /border-color: transparent/);
  assert.match(section, /box-shadow: none/);
  assert.match(section, /mask: url\('\.\.\/\.\.\/design\/elements\/frames\/share-pebble\.svg'\)/);
  assert.match(section, /::before,[\s\S]+::after \{[\s\S]+pointer-events: none;[\s\S]+mask:/);
  assert.doesNotMatch(section, /border-radius:\s*(?:50%|999px)|clip-path:|outline:\s*none/);
});

test('close pebble colors preserve inverse surfaces and accessible hover/focus feedback', () => {
  assert.match(section, /\.last-visit-toast button \{ --x-pebble-fill: var\(--ink\); --x-pebble-edge: var\(--paper\); \}/);
  assert.match(section, /\.last-visit-toast button:is\(:hover, :focus-visible\) \{\s*--x-pebble-fill: var\(--paper\);\s*background: transparent;\s*color: var\(--ink\);/);
  assert.match(section, /\.content-popup-close:focus-visible \.content-popup-close-face \{\s*--x-pebble-fill: var\(--accent\);/);
  assert.match(section, /\.content-popup-close:active:focus-visible \.content-popup-close-face \{\s*--x-pebble-fill: var\(--ink\);/);
  assert.match(section, /\.bookmark-pin\.is-pending:is\(:hover, :focus-visible\) \{ color: var\(--paper\); \}/);
  assert.match(section, /\.bookmark-pin\.is-saved:is\(:hover, :focus-visible\) \{ --x-pebble-edge: var\(--ink\); \}/);
});

test('pebble paint preserves close-button targets, gutter positioning, animation and native fallbacks', () => {
  const popup = global.match(/\.content-popup-close \{([^}]+)\}/)[1];
  assert.match(popup, /inline-size: 2\.75rem/);
  assert.match(popup, /block-size: 2\.75rem/);
  assert.match(global, /\.article \.bookmark-pin \{\s*position: absolute;/);
  assert.doesNotMatch(section, /(?:inline-size|block-size|padding|margin|inset-inline-start|inset-block-start):/);
  assert.match(drawn, /@media screen and \(forced-colors: none\) \{\s*@supports \(mask-image:/);
  assert.match(section, /@media \(prefers-reduced-motion: no-preference\)/);
  assert.match(global, /@keyframes popup-close-in/);
  assert.match(read('src/components/LastVisit.astro'), /data-last-visit-close aria-label=\{closeLabel\}><Icon name="x"/);
  assert.match(read('src/scripts/content-popup.ts'), /closer.setAttribute\('aria-label', options.closeLabel\)/);
  assert.match(read('src/scripts/bookmarks.ts'), /pin.className = 'bookmark-pin is-saved'/);
});
