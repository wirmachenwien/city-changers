import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('all pebble hover colors come from registered, contrast-checked brand recipes', () => {
  const registry = JSON.parse(read('design/colors.json'));
  for (const token of ['pebble-hover', 'pebble-hover-ink', 'pebble-selected-hover', 'pebble-selected-hover-ink']) assert.ok(registry.tokens[token]);
  assert.ok(registry.contrast.text.some(pair => pair[0] === 'pebble-hover-ink' && pair[1] === 'pebble-hover'));
  assert.ok(registry.contrast.text.some(pair => pair[0] === 'pebble-selected-hover-ink' && pair[1] === 'pebble-selected-hover'));
});

test('language picker leads desktop and mobile navigation, not the header', () => {
  assert.doesNotMatch(read('src/components/Masthead.astro'), /LanguageMenu/);
  assert.doesNotMatch(read('src/components/DrawnSelect.astro'), /outlined/);
  assert.doesNotMatch(read('src/styles/drawn-elements.css'), /pebble--outlined|share-pebble-stroke/);
  for (const [file, id] of [['SideNav.astro', 'side-language'], ['NavDrawer.astro', 'drawer-language']]) {
    const source = read(`src/components/${file}`);
    assert.match(source, new RegExp(`<section class="nav-section">\\s*<div class="nav-language">\\s*<LanguageMenu[^>]*id="${id}"`));
    const chapterNav = source.indexOf('<ChapterNavLinks links={section.links} />');
    assert.ok(chapterNav !== -1, `${file} renders the shared chapter navigation`);
    assert.ok(source.indexOf(`id="${id}"`) < chapterNav);
    assert.match(source, /kind: 'page' \| 'book'/);
    assert.match(source, /file: string/);
  }
  assert.match(read('src/layouts/BaseLayout.astro'), /<div class="nav-language"><LanguageMenu[^>]+\/><\/div>\s*<ul class="nav-list" \/>/);
});

test('shared chapter navigation keeps numbers decorative and underlines on labels only', () => {
  const source = read('src/components/ChapterNavLinks.astro');
  assert.match(source, /<ul class="nav-list nav-list--chapters">/);
  assert.match(source, /class="nav-chapter__number" aria-hidden="true"/);
  assert.match(source, /data-link-underline=\{link.chapterNumber !== undefined \? 'hover' : undefined\}/);
  assert.match(source, /<span class="nav-chapter__label">/);
  const css = read('src/styles/global.css');
  assert.match(css, /\.nav-list--chapters a\.nav-chapter\s*\{[^}]*text-decoration-line: none;/);
  assert.match(css, /\.nav-list--chapters a\.nav-chapter:is\(:hover, :focus-visible, :active\) \.nav-chapter__label\s*\{\s*text-decoration-line: underline;/);
});

test('all header surfaces and the drawn boundary use the accent palette', () => {
  const css = read('src/styles/global.css');
  const header = css.match(/\.site-head\s*\{([^}]+)\}/)[1];
  assert.match(header, /border-block-end: 2px solid var\(--accent\)/);
  assert.match(header, /background: var\(--accent-soft\)/);
  assert.match(css.match(/\.site-head::before\s*\{([^}]+)\}/)[1], /background: var\(--accent-soft\)/);
  assert.match(read('src/styles/drawn-elements.css'), /\.site-head \{ background: linear-gradient\(var\(--accent-soft\), var\(--accent-soft\)\)/);
  const source = read('src/components/Masthead.astro');
  assert.match(source, /fill="var\(--accent-soft\)"/);
  assert.match(source, /stroke="var\(--accent\)"/);
});

test('front pages do not duplicate the language switcher above the opening image', () => {
  const layout = read('src/layouts/PageLayout.astro');
  assert.doesNotMatch(layout, /LanguageSwitcher|home-language/);
});

test('mobile drawer language picker shares the theme and close control row', () => {
  const css = read('src/styles/global.css');
  const language = css.match(/\.drawer \.nav-language\s*\{([^}]+)\}/)[1];
  const theme = css.match(/body\.drawer-open \.theme-toggle--float\s*\{([^}]+)\}/)[1];
  const close = css.match(/body\.drawer-open \.drawer-toggle-float\s*\{([^}]+)\}/)[1];
  const top = rule => rule.match(/inset-block-start:\s*([^;]+)/)[1];
  assert.equal(top(language), top(theme));
  assert.equal(top(language), top(close));
  assert.match(language, /position: fixed/);
  assert.match(language, /inset-inline-start: calc\(100dvw - min\(22rem, 85dvw\) \+ 1\.25rem\)/);
  assert.match(language, /inset-inline-end: auto/);
  assert.match(language, /max-inline-size: calc\(min\(22rem, 85dvw\) - 9\.25rem\)/);
});

test('theme and mobile menu toggles reveal surface-colored pebble paint on hover and focus', () => {
  const css = read('src/styles/global.css');
  assert.match(css, /--toggle-surface: var\(--accent-soft\)/);
  assert.match(css, /--toggle-hover: var\(--pebble-hover\)/);
  const drawn = read('src/styles/drawn-elements.css');
  const idle = drawn.match(/\.theme-toggle::before, \.menu-toggle::before\s*\{([^}]+)\}/)[1];
  assert.match(idle, /background: var\(--toggle-surface, var\(--paper\)\)/);
  assert.match(idle, /mask: url\('[^']*share-pebble\.svg'\)/);
  assert.match(idle, /pointer-events: none/);
  assert.match(drawn, /\.theme-toggle:is\(:hover, :focus-visible\)::before, \.menu-toggle:is\(:hover, :focus-visible\)::before\s*\{\s*background: var\(--toggle-hover, var\(--accent-soft\)\)/);
});
