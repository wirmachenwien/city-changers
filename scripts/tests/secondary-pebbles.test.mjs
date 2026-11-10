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

test('language picker follows desktop chapters but leads the mobile drawer, not the header', () => {
  assert.doesNotMatch(read('src/components/Masthead.astro'), /LanguageMenu/);
  assert.doesNotMatch(read('src/components/DrawnSelect.astro'), /outlined/);
  assert.doesNotMatch(read('src/styles/drawn-elements.css'), /pebble--outlined|share-pebble-stroke/);
  for (const [file, id] of [['SideNav.astro', 'side-language'], ['NavDrawer.astro', 'drawer-language']]) {
    const source = read(`src/components/${file}`);
    const chapterNav = source.indexOf('<ChapterNavLinks links={section.links} />');
    assert.ok(chapterNav !== -1, `${file} renders the shared chapter navigation`);
    if (file === 'SideNav.astro') {
      assert.ok(source.indexOf(`id="${id}"`) > chapterNav);
    } else {
      assert.ok(source.indexOf(`id="${id}"`) < chapterNav);
    }
    assert.match(source, /kind: 'page' \| 'book'/);
    assert.match(source, /file: string/);
  }
  assert.match(read('src/layouts/BaseLayout.astro'), /<div class="nav-language"><LanguageMenu[^>]+\/><\/div>\s*<ul class="nav-list" \/>/);
});

test('desktop navigation separates front matter from chapter one and keeps space before the language picker', () => {
  const css = read('src/styles/global.css');
  assert.match(css, /\.side-nav\s*\{[^}]*--nav-chapter-group-gap: 1rem;/);
  assert.match(css, /\.side-nav \.nav-chapter-group-start\s*\{\s*margin-block-start: var\(--nav-chapter-group-gap\);/);
  const linkPadding = css.match(/\.nav-list a\s*\{[^}]*padding-block:\s*([^;]+);/)[1];
  const languageGap = css.match(/\.side-nav \.nav-list--chapters \+ \.nav-language\s*\{([^}]+)\}/)[1];
  assert.ok(languageGap.includes(`margin-block: calc(var(--nav-chapter-group-gap) + ${linkPadding}) 0;`));
  const source = read('src/components/ChapterNavLinks.astro');
  assert.match(source, /'nav-chapter-group-start': link\.chapterNumber !== undefined && index > 0 && links\[index - 1\]\.chapterNumber === undefined/);
});

test('shared chapter navigation keeps numbers decorative and underlines on labels only', () => {
  const source = read('src/components/ChapterNavLinks.astro');
  assert.match(source, /<ul class="nav-list nav-list--chapters">/);
  assert.match(source, /link.chapterNumber !== undefined && \(/);
  assert.match(source, /class="nav-chapter__number" aria-hidden="true"/);
  assert.match(source, /data-link-underline=\{link.chapterNumber !== undefined \? 'hover' : undefined\}/);
  assert.doesNotMatch(source, /nav-chapter__number--empty/);
  assert.match(source, /<span class="nav-chapter__label">/);
  const css = read('src/styles/global.css');
  assert.doesNotMatch(css, /\.nav-chapter__number--empty/);
  assert.match(css, /\.nav-list--chapters a\.nav-chapter\s*\{[^}]*text-decoration-line: none;/);
  assert.match(css, /\.nav-list--chapters a\.nav-chapter:is\(:hover, :focus-visible, :active\) \.nav-chapter__label\s*\{\s*text-decoration-line: underline;/);
});

test('ordinary navigation lines retain their shape and use the chapter pebble state palette', () => {
  const drawn = read('src/styles/drawn-elements.css');
  const line = drawn.match(/\.nav-list--chapters a:not\(\.nav-chapter\)::before,\s*\.nav-list--chapters a\[aria-current\]:not\(\.nav-chapter\)::before\s*\{([^}]+)\}/)[1];
  assert.match(line, /inline-size: 0\.65rem/);
  assert.match(line, /inset-inline-start: 1\.325rem/);
  assert.match(line, /opacity: 0/);
  assert.match(line, /background: var\(--accent\)/);
  assert.match(line, /mask: var\(--rail-source\)/);
  assert.match(drawn, /\.nav-list--chapters a:not\(\.nav-chapter\):is\(\[aria-current\], :hover, :focus-visible, :active\)::before\s*\{\s*background: var\(--accent\);\s*opacity: 1;/);
});

test('navigation lines have a subtle tilt without scaling or overriding reduced motion', () => {
  const drawn = read('src/styles/drawn-elements.css');
  assert.match(drawn, /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.nav-list--chapters a:not\(\.nav-chapter\)::before\s*\{\s*transition: opacity 180ms ease-out, transform 160ms ease-out;/);
  assert.match(drawn, /\.nav-list--chapters a:not\(\.nav-chapter\):is\(:hover, :focus-visible\)::before\s*\{\s*transform: rotate\(-2deg\);/);
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
