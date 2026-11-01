import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { initReadingProgress } from '../../src/scripts/reading-progress.ts';

test('progress reveals the line, clamps overscroll and follows changing page height', () => {
  const { document } = parseHTML('<html><body><div data-reading-progress hidden></div></body></html>');
  const bar = document.querySelector('[data-reading-progress]');
  const frames = [], events = new Map();
  let height = 2000, resized;
  Object.defineProperty(document.documentElement, 'scrollHeight', { get: () => height });
  const globals = {
    document, window: { ResizeObserver: true }, innerHeight: 800, scrollY: 0,
    requestAnimationFrame: callback => frames.push(callback),
    addEventListener: (name, callback) => events.set(name, callback),
    ResizeObserver: class { constructor(callback) { resized = callback; } observe() {} },
  };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const flush = () => { for (const frame of frames.splice(0)) frame(); };
  try {
    initReadingProgress();
    initReadingProgress();
    assert.equal(bar.hidden, false);
    assert.equal(document.documentElement.style.getPropertyValue('--reading-progress'), '0%');
    assert.equal(document.documentElement.dataset.scrollEdge, 'header');
    assert.equal(document.documentElement.dataset.scrollable, 'true');
    assert.equal(bar.style.getPropertyValue('--reading-progress'), '', 'the bar inherits the shared value instead of keeping a separate copy');
    for (const [position, expected] of [[600, '50%'], [1200, '100%'], [1500, '100%'], [-20, '0%']]) {
      globalThis.scrollY = position;
      events.get('scroll')();
      events.get('scroll')();
      assert.equal(frames.length, 1, 'scroll events coalesce into one paint');
      flush();
      assert.equal(document.documentElement.style.getPropertyValue('--reading-progress'), expected);
      assert.equal(document.documentElement.dataset.scrollEdge, position >= 1200 ? 'footer' : 'header');
    }
    globalThis.scrollY = 600;
    height = 3200;
    resized();
    flush();
    assert.equal(document.documentElement.style.getPropertyValue('--reading-progress'), '25%');
    height = 600;
    events.get('resize')();
    flush();
    assert.equal(document.documentElement.style.getPropertyValue('--reading-progress'), '0%');
    assert.ok(!bar.style.transform, 'the shared stroke must never be horizontally squashed');
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('brand guide mounts the same decorative green progress component used by book pages', () => {
  const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  assert.ok(read('src/pages/brand/index.astro').includes('<ReadingProgress />'));
  assert.ok(read('src/layouts/BookLayout.astro').includes('<ReadingProgress />'));
  assert.match(read('src/components/ReadingProgress.astro'), /aria-hidden="true" hidden/);
  const css = read('src/styles/global.css');
  assert.match(css, /\.reading-progress \{[^}]*background: var\(--accent\);/);
  assert.ok(css.includes('clip-path: inset(0 calc(100% - var(--reading-progress, 0%)) 0 0)'));
  const component = read('src/components/ReadingProgress.astro');
  assert.match(component, /import boundary from '[^']*divider-strong\.svg\?raw'/);
  assert.ok(component.includes("const fillPath = `M0 0${boundaryPath.replace(/^M/, 'L')}V0Z`"));
  assert.ok(component.includes('<path d={fillPath} fill="currentColor" />'));
  assert.ok(component.includes('stroke="currentColor"'));
  const drawn = read('src/styles/drawn-elements.css');
  assert.ok(drawn.includes('.reading-progress { block-size: 6px; background: transparent; color: var(--accent); }'));
  assert.match(drawn, /\.reading-progress__line \{\s*display: block;[^}]*inset-block-start: -2px;[^}]*block-size: 12px;/);
});

test('overscroll edge colors also update without a progress bar, including non-scrolling pages', () => {
  const { document } = parseHTML('<html><body><div class="page-canvas">Short page</div></body></html>');
  const frames = [], events = new Map(), counts = new Map();
  let height = 2000;
  Object.defineProperty(document.documentElement, 'scrollHeight', { get: () => height });
  const globals = {
    document, window: {}, innerHeight: 800, scrollY: 0,
    requestAnimationFrame: callback => frames.push(callback),
    addEventListener: (name, callback) => { events.set(name, callback); counts.set(name, (counts.get(name) ?? 0) + 1); },
  };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  try {
    initReadingProgress(); initReadingProgress();
    assert.equal(counts.get('scroll'), 1);
    assert.equal(counts.get('resize'), 1);
    assert.equal(document.documentElement.dataset.scrollEdge, 'header');
    for (const [position, expected] of [[1200, 'footer'], [1500, 'footer'], [-20, 'header']]) {
      globalThis.scrollY = position;
      events.get('scroll')();
      frames.splice(0).forEach(callback => callback());
      assert.equal(document.documentElement.dataset.scrollEdge, expected);
    }
    height = 800;
    for (const [position, expected] of [[20, 'footer'], [-20, 'header'], [0, 'header']]) {
      globalThis.scrollY = position;
      events.get('scroll')();
      frames.splice(0).forEach(callback => callback());
      assert.equal(document.documentElement.dataset.scrollEdge, expected);
      assert.equal(document.documentElement.dataset.scrollable, 'false');
    }
    assert.equal(document.documentElement.style.getPropertyValue('--reading-progress'), '', 'no progress fill is invented on pages without a bar');
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('the top overscroll fill shares progress geometry/direction and the bottom stays footer-colored', () => {
  const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const css = read('src/styles/global.css');
  const layout = read('src/layouts/BaseLayout.astro');
  assert.match(layout, /<div class="page-canvas">[\s\S]*<Masthead[\s\S]*<Footer[\s\S]*<\/div>/);
  assert.match(css, /body \{ background: transparent; \}/);
  assert.match(css, /\.page-canvas \{[^}]*background: var\(--paper\);/);
  assert.match(css, /html::before \{[^}]*position: fixed;[^}]*z-index: -1;[^}]*pointer-events: none;/);
  assert.match(css, /linear-gradient\(var\(--overscroll-direction\), var\(--accent\) 0%, var\(--accent\) var\(--reading-progress, 0%\), var\(--accent-soft\) var\(--reading-progress, 0%\)/);
  assert.match(css, /html\[dir="rtl"\] \{ --overscroll-direction: to left; \}/);
  assert.match(css, /html\[data-scroll-edge="footer"\] \{ --overscroll-surface: var\(--warm-soft\); \}/);
  assert.match(css, /html\[data-scrollable="true"\]\[data-scroll-edge="footer"\]::before \{ background-size: 100% 0%, 100% 100%; \}/);
  assert.match(css, /\.reading-progress \{[^}]*transition: none;/);
  assert.doesNotMatch(css, /overscroll-behavior(?:-y)?:\s*(?:none|contain)/);
  assert.doesNotMatch(read('src/components/Footer.astro'), /ReadingProgress|data-reading-progress/);
});
