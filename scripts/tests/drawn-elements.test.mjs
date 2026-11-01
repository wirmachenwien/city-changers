import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { initDrawnMedia } from '../../src/scripts/drawn-media.ts';
import { initDrawnTables } from '../../src/scripts/drawn-tables.ts';
import { rehypeDrawnContainers } from '../../src/lib/rehype-drawn-containers.mjs';
import { framePath } from '../../design/elements/geometry.js';

test('share controls use a soft-green pebble paint layer without an outline', () => {
  const css = readFileSync(new URL('../../src/styles/drawn-elements.css', import.meta.url), 'utf8');
  assert.match(css, /:is\(\.share-btn, \.share a, \.copy-btn, \.language-switcher a, \.slides \.slide-nav button\)::before\s*\{\s*mask: url\('[^']*share-pebble\.svg'\) center \/ 100% 100% no-repeat;/);
  assert.match(css, /:is\(\.share-btn, \.share a, \.copy-btn, \.language-switcher a, \.slides \.slide-nav button, \.visual-toc > a\)::after \{ display: none; \}/);
  const share = css.match(/:is\(\.share-btn, \.share \.share-btn, \.share a, \.copy-btn, \.language-switcher a, \.slides \.slide-nav button, \.visual-toc > a\):hover\s*\{([^}]+)\}/)[1];
  assert.match(share, /--drawn-fill: var\(--pebble-hover\)/);
  assert.match(share, /color: var\(--pebble-hover-ink\)/);
  assert.match(share, /background: transparent/);
  const svg = readFileSync(new URL('../../design/elements/frames/share-pebble.svg', import.meta.url), 'utf8');
  assert.match(svg, /preserveAspectRatio="none"/);
  assert.match(svg, /fill="currentColor"/);
});

test('spoiler highlight extends past text padding and never fades an unmasked background', () => {
  const global = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');
  const drawn = readFileSync(new URL('../../src/styles/drawn-elements.css', import.meta.url), 'utf8');
  const text = global.match(/\.spoiler-text\s*\{([^}]+)\}/)[1];
  assert.match(text, /transition:\s*color 0\.15s ease-in;/);
  assert.doesNotMatch(text, /transition:[^;]*(?:background|all)/);
  const highlight = [...drawn.matchAll(/\.spoiler\[aria-expanded="true"\] \.spoiler-text::before\s*\{([^}]+)\}/g)].at(-1)[1];
  assert.match(highlight, /inset-inline:\s*-0\.3rem;/);
  assert.match(highlight, /inset-block:\s*-0\.15rem;/);
  assert.match(highlight, /background:\s*var\(--accent-soft\)/);
});

function environment(extra = '') {
  const { document, window: dom } = parseHTML(`<html><body>
    <details class="accordion"><summary><span class="drawn-frame" aria-hidden="true"></span>Open</summary><p>Body</p></details>
    <form class="question"><input type="checkbox"><button>Check</button></form>
    <aside class="mascot-box__bubble">A thought</aside>
    <span class="drawn-select"><select><option>English</option></select></span>
    <div class="drawn-scroll-shell"><div class="table-scroll"><table><thead><tr><th>Heading</th></tr></thead></table></div></div>
    ${extra}</body></html>`);
  const size = { width: 320.5, height: 180.25 };
  const create = document.createElementNS.bind(document);
  document.createElementNS = (...args) => {
    const node = create(...args);
    node.getBoundingClientRect = () => size;
    return node;
  };
  const observed = new Set();
  let resized, mutated;
  const ResizeObserver = class {
    constructor(callback) { resized = callback; }
    observe(node) { observed.add(node); }
    unobserve(node) { observed.delete(node); }
  };
  const globals = {
    document, window: { ResizeObserver, CSS: { supports: () => true } }, ResizeObserver, HTMLElement: dom.HTMLElement,
    MutationObserver: class { constructor(callback) { mutated = callback; } observe() {} },
  };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  return {
    document, observed, size,
    resize: () => resized([...observed].map(target => ({ target }))),
    mutate: records => mutated(records.map(record => ({ addedNodes: [], removedNodes: [], ...record }))),
    cleanup() {
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

const media = '<figure class="figure"><div class="figure__media"><div class="figure__stage"><img src="street.jpg" alt="A street"></div></div><figcaption>Caption</figcaption></figure>';

test('CSS boxes, native controls and tables are never observed or modified by media enhancement', () => {
  const env = environment();
  try {
    const before = env.document.body.innerHTML;
    initDrawnMedia();
    assert.equal(env.document.body.innerHTML, before);
    assert.equal(env.observed.size, 0);
    const popup = env.document.createElement('div');
    popup.className = 'content-popup';
    env.document.body.append(popup);
    env.mutate([{ addedNodes: [popup] }]);
    assert.equal(popup.innerHTML, '');
    assert.equal(env.observed.size, 0);
  } finally { env.cleanup(); }
});

test('only media gets measured SVG geometry, preserving text and captions', () => {
  const env = environment(media);
  try {
    const before = env.document.body.textContent;
    initDrawnMedia();
    const box = env.document.querySelector('.figure__media');
    assert.deepEqual([...env.observed], [box]);
    const svg = box.querySelector('svg');
    assert.equal(svg.getAttribute('aria-hidden'), 'true');
    assert.equal(svg.getAttribute('focusable'), 'false');
    assert.equal(svg.getAttribute('viewBox'), '0 0 320.5 180.25');
    const stage = box.querySelector('.figure__stage');
    assert.equal(stage.style.clipPath, `path('${framePath(320.5, 180.25)}')`);
    Object.assign(env.size, { width: 480, height: 270 });
    env.resize();
    assert.equal(stage.style.clipPath, `path('${framePath(480, 270)}')`);
    assert.equal(env.document.body.textContent, before);
    assert.equal(env.document.querySelector('figcaption svg'), null);
  } finally { env.cleanup(); }
});

test('detached media releases observation and resumes without duplicate SVGs on reinsertion', () => {
  const env = environment(media);
  try {
    initDrawnMedia();
    const figure = env.document.querySelector('figure');
    const box = figure.querySelector('.figure__media');
    figure.remove();
    env.mutate([{ removedNodes: [figure] }]);
    assert.equal(env.observed.size, 0);
    env.document.body.append(figure);
    env.mutate([{ addedNodes: [figure] }]);
    initDrawnMedia();
    assert.ok(env.observed.has(box));
    assert.equal(box.querySelectorAll('svg').length, 1);
  } finally { env.cleanup(); }
});

test('without ResizeObserver all CSS boxes and media fallback markup remain untouched', () => {
  const env = environment(media);
  try {
    delete window.ResizeObserver;
    const before = env.document.body.innerHTML;
    initDrawnMedia();
    assert.equal(env.document.body.innerHTML, before);
  } finally { env.cleanup(); }
});

test('raw figures retain a media-only wrapper upgrade', () => {
  const env = environment('<figure class="figure"><img src="street.jpg" alt="Street"><figcaption>Caption</figcaption></figure>');
  try {
    initDrawnMedia();
    assert.ok(env.document.querySelector('.figure > .figure__media > .figure__stage > img'));
    assert.ok(env.document.querySelector('.figure > figcaption'));
  } finally { env.cleanup(); }
});

test('table and code wrappers are built once, without changing native semantics', () => {
  const element = (tagName, children = []) => ({ type: 'element', tagName, properties: {}, children });
  const table = element('table', [element('thead')]);
  const code = element('pre', [element('code')]);
  const explicitTable = element('table');
  const tree = { type: 'root', children: [table, code, { type: 'mdxJsxFlowElement', name: 'TableWrap', children: [explicitTable] }] };
  const transform = rehypeDrawnContainers();
  transform(tree);
  const snapshot = JSON.stringify(tree);
  transform(tree);
  assert.equal(JSON.stringify(tree), snapshot, 'idempotent wrapper transformation');
  assert.equal(tree.children[0].children[0].children[0], table);
  assert.equal(tree.children[1].children[0], code);
  assert.equal(tree.children[2].children[0], explicitTable, 'TableWrap supplies its own shell');
});

test('CSS frames and measured surfaces never replace native high-contrast boundaries', () => {
  const css = readFileSync(new URL('../../src/styles/drawn-elements.css', import.meta.url), 'utf8');
  assert.match(css, /@media screen and \(forced-colors: none\)/);
  assert.match(css, /mask-image: var\(--drawn-stroke-mask\)/);
  assert.match(css, /@media print, \(forced-colors: active\)/);
  assert.match(css, /clip-path: none !important/);
  assert.doesNotMatch(css, /\.drawn-host|#[0-9a-f]{3,8}\b/i);
});

test('table header measurement paints only a decorative surface, including on resize', () => {
  const env = environment();
  try {
    const shell = env.document.querySelector('.drawn-scroll-shell');
    const header = shell.querySelector('thead');
    let bottom = 44;
    shell.getBoundingClientRect = () => ({ ...env.size, top: 10 });
    header.getBoundingClientRect = () => ({ bottom });
    const text = shell.textContent;
    initDrawnTables();
    const surface = shell.querySelector(':scope > .drawn-table-surface');
    assert.equal(surface.getAttribute('aria-hidden'), 'true');
    assert.equal(surface.style.getPropertyValue('--drawn-header-end'), '34px');
    assert.ok(shell.classList.contains('drawn-table-ready'));
    assert.deepEqual(new Set(env.observed), new Set([shell, header]));
    bottom = 80;
    env.resize();
    assert.equal(surface.style.getPropertyValue('--drawn-header-end'), '70px');
    assert.equal(shell.textContent, text);
    assert.equal(shell.querySelector('table').style.getPropertyValue('clip-path'), '');
    assert.equal(shell.querySelector('.table-scroll').style.getPropertyValue('clip-path'), '');
    assert.equal(shell.querySelector('table .drawn-table-surface'), null);
  } finally { env.cleanup(); }
});

test('table surfaces release observers, resume on reinsertion and track replaced headers', () => {
  const env = environment();
  try {
    const shell = env.document.querySelector('.drawn-scroll-shell');
    const header = shell.querySelector('thead');
    shell.getBoundingClientRect = () => ({ ...env.size, top: 0 });
    header.getBoundingClientRect = () => ({ bottom: 40 });
    initDrawnTables();
    initDrawnTables();
    assert.equal(shell.querySelectorAll('.drawn-table-surface').length, 1);
    shell.remove();
    env.mutate([{ removedNodes: [shell] }]);
    assert.equal(env.observed.size, 0);
    assert.equal(shell.querySelector('.drawn-table-surface'), null);
    env.document.body.append(shell);
    env.mutate([{ addedNodes: [shell] }]);
    assert.equal(env.observed.size, 2);
    const replacement = env.document.createElement('thead');
    replacement.getBoundingClientRect = () => ({ bottom: 60 });
    const table = header.parentElement;
    header.replaceWith(replacement);
    env.mutate([{ target: table, addedNodes: [replacement], removedNodes: [header] }]);
    assert.equal(env.observed.has(header), false);
    assert.ok(env.observed.has(replacement));
    assert.equal(shell.querySelectorAll('.drawn-table-surface').length, 1);
    assert.equal(shell.querySelector('.drawn-table-surface').style.getPropertyValue('--drawn-header-end'), '60px');
  } finally { env.cleanup(); }
});

test('missing ResizeObserver leaves table markup and CSS boundaries untouched', () => {
  const env = environment();
  try {
    delete window.ResizeObserver;
    const before = env.document.body.innerHTML;
    initDrawnTables();
    assert.equal(env.document.body.innerHTML, before);
  } finally { env.cleanup(); }
});
