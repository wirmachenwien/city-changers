import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { initDrawnSurfaces } from '../../src/lib/drawn-surfaces.mjs';
import { framePath, compactPath, bubblePath } from '../../design/elements/geometry.js';

function environment() {
  const { document } = parseHTML(`<html><body>
    <details class="accordion"><summary><span class="drawn-frame"></span>Open</summary><p>Body</p></details>
    <form class="question"><input><button type="submit">Check</button></form>
    <aside class="mascot-box__bubble">Thought</aside>
    <span class="drawn-select"><select><option>English</option></select></span>
    <div class="drawn-scroll-shell"><div class="table-scroll"><table><thead><tr><th>Heading</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table></div></div>
    <div class="figure__media"><div class="figure__stage"><img alt="Street"></div></div>
    <button class="spoiler"><span class="spoiler-text">Secret</span></button>
    <button class="copy-btn">Copy</button></body></html>`);
  const size = { width: 320.5, height: 180.25, top: 20 };
  const create = document.createElementNS.bind(document);
  document.createElementNS = (...args) => {
    const node = create(...args);
    node.getBoundingClientRect = () => size;
    return node;
  };
  document.querySelector('thead').getBoundingClientRect = () => ({ bottom: 72.75 });
  const observed = new Set(), frames = [];
  let resized, mutated, mediaChanged, observers = 0;
  const window = {
    CSS: { supports: () => true },
    ResizeObserver: class {
      constructor(callback) { resized = callback; observers++; }
      observe(node) { observed.add(node); }
      unobserve(node) { observed.delete(node); }
    },
    MutationObserver: class { constructor(callback) { mutated = callback; } observe() {} },
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    getComputedStyle: () => ({ direction: document.documentElement.dir || 'ltr' }),
    matchMedia: () => ({ matches: false, addEventListener(_, callback) { mediaChanged = callback; } }),
  };
  const previous = new Map(['document', 'window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, { document, window });
  return {
    document, window, size, frames, observed, get observers() { return observers; },
    flush() { frames.splice(0).forEach(callback => callback()); },
    resize(targets = [...observed]) { resized(targets.map(target => ({ target }))); },
    mutate(records) { mutated(records.map(record => ({ type: 'childList', target: document.body, addedNodes: [], removedNodes: [], ...record }))); },
    mediaChanged: () => mediaChanged(),
    cleanup() { for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } },
  };
}

test('one batched observer paints continuous fractional geometry, preserving native content', () => {
  const env = environment();
  try {
    const text = env.document.body.textContent;
    initDrawnSurfaces();
    initDrawnSurfaces();
    assert.equal(env.observers, 1);
    assert.equal(env.frames.length, 1);
    assert.equal(env.document.querySelectorAll('.drawn-ready').length, 0);
    env.flush();
    assert.equal(env.document.body.textContent, text);
    for (const selector of ['.question', '.accordion', '.figure__media']) {
      const host = env.document.querySelector(selector);
      assert.equal(host.querySelector('.drawn-surface > path').getAttribute('d'), framePath(320.5, 180.25));
      assert.ok(host.classList.contains('drawn-ready'));
    }
    assert.equal(env.document.querySelector('.spoiler-text path').getAttribute('d'), compactPath(320.5, 180.25));
    assert.equal(env.document.querySelector('.mascot-box__bubble path').getAttribute('d'), bubblePath(320.5, 180.25, false));
    assert.ok(env.document.querySelector('.accordion > summary > .drawn-frame > svg'));
    assert.equal(env.document.querySelector('.figure__stage').style.clipPath, `path('${framePath(320.5, 180.25)}')`);
    assert.equal(env.document.querySelector('.copy-btn svg, .drawn-select svg'), null);
    assert.ok(!env.observed.has(env.document.body));
    env.resize(); env.resize();
    assert.equal(env.frames.length, 1);
    env.flush();
    const path = env.document.querySelector('.question path');
    let writes = 0;
    const setAttribute = path.setAttribute.bind(path);
    path.setAttribute = (...args) => { writes++; return setAttribute(...args); };
    env.resize(); env.flush();
    assert.equal(writes, 0, 'unchanged geometry does not rebuild paint');
  } finally { env.cleanup(); }
});

test('table header uses two coincident gradient stops on the same filled and stroked path', () => {
  const env = environment();
  try {
    initDrawnSurfaces(); env.flush();
    const shell = env.document.querySelector('.drawn-scroll-shell');
    const stops = [...shell.querySelectorAll('stop')];
    assert.equal(shell.querySelectorAll('path').length, 1);
    assert.equal(stops.length, 2);
    assert.equal(shell.querySelector('linearGradient').getAttribute('gradientUnits'), 'userSpaceOnUse');
    assert.equal(Number(stops[0].getAttribute('offset')), 52.75 / 180.25);
    assert.equal(stops[0].getAttribute('offset'), stops[1].getAttribute('offset'));
    assert.ok(env.observed.has(shell.querySelector('thead')));
    assert.equal(shell.querySelector('.table-scroll svg'), null);
    const oldHeader = shell.querySelector('thead');
    const nextHeader = env.document.createElement('thead');
    nextHeader.getBoundingClientRect = () => ({ bottom: 100.125 });
    oldHeader.replaceWith(nextHeader);
    env.mutate([{ target: shell.querySelector('table'), addedNodes: [nextHeader], removedNodes: [oldHeader] }]); env.flush();
    assert.ok(!env.observed.has(oldHeader) && env.observed.has(nextHeader));
    assert.equal(Number(stops[0].getAttribute('offset')), 80.125 / 180.25);
  } finally { env.cleanup(); }
});

test('hidden surfaces wait; resize, reinsertion and dynamic content reuse their SVG', () => {
  const env = environment();
  try {
    env.size.width = 0;
    initDrawnSurfaces(); env.flush();
    assert.equal(env.document.querySelectorAll('.drawn-ready').length, 0);
    env.size.width = 400.125; env.resize(); env.flush();
    const shell = env.document.querySelector('.drawn-scroll-shell'), svg = shell.querySelector('svg'), header = shell.querySelector('thead');
    shell.remove(); env.mutate([{ removedNodes: [shell] }]);
    assert.ok(!env.observed.has(shell) && !env.observed.has(header));
    env.document.body.append(shell); env.mutate([{ addedNodes: [shell] }]); env.flush();
    assert.equal(shell.querySelector('svg'), svg);
    assert.equal(shell.querySelectorAll('svg').length, 1);
    const popup = env.document.createElement('div'); popup.className = 'content-popup';
    env.document.body.append(popup); env.mutate([{ addedNodes: [popup] }]); env.flush();
    assert.ok(popup.classList.contains('drawn-ready'));
    env.mutate([{ target: svg, addedNodes: [svg.querySelector('path')] }]);
    assert.equal(env.frames.length, 0, 'decorative mutations do not schedule work');
    env.document.documentElement.dir = 'rtl';
    env.mutate([{ type: 'attributes', target: env.document.documentElement, attributeName: 'dir' }]); env.flush();
    assert.match(env.document.querySelector('.mascot-box__bubble path').getAttribute('transform'), /scale\(-1 1\)/);
    env.mediaChanged(); assert.equal(env.frames.length, 1);
  } finally { env.cleanup(); }
});

test('missing observation or mask support leaves markup untouched', () => {
  for (const missing of ['observer', 'mask']) {
    const env = environment();
    try {
      if (missing === 'observer') delete env.window.ResizeObserver;
      else env.window.CSS.supports = () => false;
      const before = env.document.body.innerHTML;
      initDrawnSurfaces(); assert.equal(env.document.body.innerHTML, before);
    } finally { env.cleanup(); }
  }
});

test('surface CSS has no tile joins; header overlaps and native fallbacks remain', () => {
  const css = readFileSync(new URL('../../src/styles/drawn-elements.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /mask-position:|mask-size:|frames\.css|--drawn-fill-mask/);
  assert.match(css, /calc\(100% - \.375rem \+ 1px\)/);
  assert.match(css, /\.drawn-surface \{ display: none; \}/);
  assert.match(css, /@media screen and \(forced-colors: none\)/);
  assert.match(css, /prefers-reduced-motion: no-preference/);
  assert.match(css, /share-pebble\.svg/);
});
