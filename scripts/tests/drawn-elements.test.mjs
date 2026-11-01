import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseHTML } from 'linkedom';
import { initDrawnSurfaces, surfaceSelector } from '../../src/lib/drawn-surfaces.mjs';
import { framePath, compactPath, bubblePath } from '../../design/elements/geometry.js';
import { cssFrameFiles } from '../../design/elements/build-css-frames.mjs';

// Use Astro's existing optional SVG rasterizer, not a browser or a new test
// dependency. Structural crop assertions still run if it is unavailable.
let sharp;
try { sharp = createRequire(import.meta.resolve('astro/package.json'))('sharp'); } catch {}

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

test('measured surface CSS has no tile joins; header overlaps and native fallbacks remain', () => {
  const css = readFileSync(new URL('../../src/styles/drawn-elements.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /mask-position:|mask-size:|frames\.css|--drawn-fill-mask/);
  assert.match(css, /calc\(100% - \.375rem \+ 1px\)/);
  assert.match(css, /\.drawn-surface \{ display: none; \}/);
  assert.match(css, /@media screen and \(forced-colors: none\)/);
  assert.match(css, /prefers-reduced-motion: no-preference/);
  assert.match(css, /share-pebble\.svg/);
});

test('first-paint masks inline all nine crops per profile using the shared geometry', () => {
  const files = cssFrameFiles();
  const css = files.get('frames.css');
  assert.equal(css, readFileSync(new URL('../../design/elements/frames/frames.css', import.meta.url), 'utf8'));
  assert.doesNotMatch(css, /url\(['"]?\.\//, 'baseline needs no SVG network requests');
  const profiles = {
    frame: framePath(320, 180), compact: compactPath(144, 44),
    'bubble-side': bubblePath(320, 180, false), 'bubble-top': bubblePath(320, 180, true),
  };
  for (const [profile, path] of Object.entries(profiles)) {
    for (const paint of ['fill', 'stroke']) {
      const value = css.match(new RegExp(`--${profile}-${paint}-mask: ([^;]+);`))[1];
      const crops = [...value.matchAll(/url\("data:image\/svg\+xml,([^"]+)"\)/g)];
      assert.equal(crops.length, 9);
      const boxes = new Set();
      for (const [, encoded] of crops) {
        const { document } = parseHTML(decodeURIComponent(encoded));
        const svg = document.querySelector('svg');
        boxes.add(`${svg.getAttribute('viewBox')}/${svg.querySelector('path').getAttribute('transform')}`);
        assert.equal(svg.querySelector('path').getAttribute('d'), path);
        assert.equal(svg.querySelector('path').getAttribute(paint), 'white');
        const [, , width, height] = svg.getAttribute('viewBox').split(' ').map(Number);
        assert.ok(width > 0 && height > 0);
        assert.equal(svg.getAttribute('viewBox'), `0 0 ${width} ${height}`);
        assert.equal(svg.getAttribute('width'), String(width));
        assert.equal(svg.getAttribute('height'), String(height));
        assert.equal(svg.getAttribute('overflow'), 'hidden');
        assert.equal(svg.querySelector('g').getAttribute('clip-path'), 'url(#crop)');
        assert.equal(svg.querySelector('#crop rect').getAttribute('width'), String(width));
        assert.equal(svg.querySelector('#crop rect').getAttribute('height'), String(height));
      }
      assert.equal(boxes.size, 9, 'each crop has its own viewport');
    }
    assert.match(css, new RegExp(`--${profile}-mask-size:`));
  }
});

test('every measured surface has a CSS baseline, with details and media handled separately', () => {
  const css = readFileSync(new URL('../../src/styles/drawn-baseline.css', import.meta.url), 'utf8');
  for (const selector of surfaceSelector.split(', ')) {
    assert.ok(css.includes(selector), `missing baseline: ${selector}`);
  }
  assert.match(css, /@media screen and \(forced-colors: none\)/);
  assert.match(css, /@supports \(mask-image:/);
  assert.match(css, /\.accordion:not\(\.drawn-ready\) > summary > \.drawn-frame/);
  assert.match(css, /\.figure__media:not\(\.drawn-ready\) > \.figure__stage/);
  assert.match(css, /mask-image: var\(--baseline-fill-mask\)/);
  assert.match(css, /pointer-events: none/);
  assert.doesNotMatch(css, /visibility:\s*hidden|opacity:\s*0|outline:\s*none/);
  const layout = readFileSync(new URL('../../src/layouts/BaseLayout.astro', import.meta.url), 'utf8');
  assert.ok(layout.indexOf("import '../styles/drawn-baseline.css'") > layout.indexOf("import '../styles/drawn-elements.css'"));
});

test('nine-slice masks tile without gaps or overlaps, including asymmetric speech tails', () => {
  const css = cssFrameFiles().get('frames.css');
  for (const profile of ['frame', 'compact', 'bubble-side', 'bubble-top']) {
    const property = name => css.match(new RegExp(`--${profile}-${name}: ([^;]+);`))[1];
    const sizes = property('mask-size').split(', ').map(size => size.match(/calc\([^)]*\)|\d+px/g));
    const positions = property('mask-position').split(', ').map(position => position.split(' '));
    assert.equal(positions.length, 9);
    const pixels = (value, length) => value.startsWith('calc(')
      ? length - Number(value.match(/- (\d+)px/)[1]) : Number.parseFloat(value);
    const offset = (value, length, size) => value.endsWith('%')
      ? (length - size) * Number.parseFloat(value) / 100 : Number.parseFloat(value);
    for (const [width, height] of [[144, 140], [320, 180], [721.5, 433.25]]) {
      const tiles = positions.map(([x, y], i) => {
        const w = pixels(sizes[i][0], width), h = pixels(sizes[i][1], height);
        return { x: offset(x, width, w), y: offset(y, height, h), w, h };
      });
      for (let row = 0; row < 3; row++) {
        const [left, middle, right] = tiles.slice(row * 3, row * 3 + 3);
        assert.equal(left.x, 0);
        assert.equal(left.x + left.w, middle.x, `${profile}: left/middle join`);
        assert.equal(middle.x + middle.w, right.x, `${profile}: middle/right join`);
        assert.equal(right.x + right.w, width);
      }
      for (let col = 0; col < 3; col++) {
        const [top, middle, bottom] = [tiles[col], tiles[col + 3], tiles[col + 6]];
        assert.equal(top.y, 0);
        assert.equal(top.y + top.h, middle.y, `${profile}: top/middle join`);
        assert.equal(middle.y + middle.h, bottom.y, `${profile}: middle/bottom join`);
        assert.equal(bottom.y + bottom.h, height);
      }
    }
  }
  const baseline = readFileSync(new URL('../../src/styles/drawn-baseline.css', import.meta.url), 'utf8');
  for (const profile of ['frame', 'compact', 'bubble-side', 'bubble-top']) {
    assert.ok(baseline.includes(`--baseline-mask-position: var(--${profile}-mask-position)`));
  }
  assert.equal([...baseline.matchAll(/mask-position: var\(--baseline-mask-position\)/g)].length, 2, 'decoration and media clipping both use profile positions');
});

test('CSS-only table fill uses the actual header with a straight lower edge, not the whole table', () => {
  const css = cssFrameFiles().get('frames.css');
  const property = name => css.match(new RegExp(`--${name}: ([^;]+);`))[1];
  const headerMasks = [...property('frame-header-fill-mask').matchAll(/url\("data:image\/svg\+xml,([^"]+)"\)/g)].map(match => match[1]);
  const frameMasks = [...property('frame-fill-mask').matchAll(/url\("data:image\/svg\+xml,([^"]+)"\)/g)].map(match => match[1]);
  assert.deepEqual(headerMasks, frameMasks.slice(0, 6), 'reuse clipped top and middle tiles; omit rounded bottom tiles');
  const sizes = property('frame-header-mask-size').split(', ').map(size => size.match(/calc\([^)]*\)|\d+px/g));
  const positions = property('frame-header-mask-position').split(', ').map(position => position.split(' '));
  for (const [width, height] of [[240, 40], [721.5, 88.25], [320, 132]]) {
    const pixels = (value, length) => value.startsWith('calc(')
      ? length - Number(value.match(/- (\d+)px/)[1]) : Number.parseFloat(value);
    const tiles = sizes.map(([w, h], index) => {
      const tileWidth = pixels(w, width), tileHeight = pixels(h, height);
      const [x, y] = positions[index];
      return { x: x === '100%' ? width - tileWidth : Number.parseFloat(x), y: Number.parseFloat(y), w: tileWidth, h: tileHeight };
    });
    for (let col = 0; col < 3; col++) {
      assert.equal(tiles[col].y, 0);
      assert.equal(tiles[col].y + tiles[col].h, tiles[col + 3].y);
      assert.equal(tiles[col + 3].y + tiles[col + 3].h, height, 'fill ends at actual header height');
    }
    for (const row of [tiles.slice(0, 3), tiles.slice(3)]) {
      assert.equal(row[0].x, 0);
      assert.equal(row[0].x + row[0].w, row[1].x);
      assert.equal(row[1].x + row[1].w, row[2].x);
      assert.equal(row[2].x + row[2].w, width);
    }
  }
  const baseline = readFileSync(new URL('../../src/styles/drawn-baseline.css', import.meta.url), 'utf8');
  assert.match(baseline, /\.drawn-scroll-shell:not\(\.drawn-ready\) \.table-scroll thead::before \{[^}]*pointer-events: none;[^}]*mask-image: var\(--frame-header-fill-mask\)/);
  assert.doesNotMatch(baseline, /\.drawn-scroll-shell:has\(> \.table-scroll\):not\(\.drawn-ready\) \{ --drawn-fill: var\(--panel\)/);
});

test('CSS baseline and measured controls share paint-only hover and keyboard-focus feedback', () => {
  const baseline = readFileSync(new URL('../../src/styles/drawn-baseline.css', import.meta.url), 'utf8');
  const measured = readFileSync(new URL('../../src/styles/drawn-elements.css', import.meta.url), 'utf8');
  assert.match(baseline, /@media \(prefers-reduced-motion: no-preference\) \{\s*:is\([^}]+\):not\(\.drawn-ready\)/);
  assert.match(baseline, /&:is\(:hover, :focus-visible\)::before,\s*&:is\(:hover, :focus-visible\)::after \{ transform: scale\(1\.025, 1\.04\); \}/);
  assert.match(measured, /:is\(:hover, :focus-visible\) > \.drawn-surface > path \{ transform: scale\(1\.025, 1\.04\); \}/);
  assert.match(measured, /transform-box: view-box; transform-origin: center/);
  assert.doesNotMatch(baseline, /outline:\s*none|clip-path:\s*(?:path|polygon)/);
});

test('SVG mask crops contain their paint even when viewport overflow is exposed', { skip: !sharp && 'Astro optional sharp rasterizer unavailable' }, async () => {
  const css = cssFrameFiles().get('frames.css');
  let controlsWithLeaks = 0;
  for (const profile of ['frame', 'compact', 'bubble-side', 'bubble-top']) {
    for (const paint of ['fill', 'stroke']) {
      const value = css.match(new RegExp(`--${profile}-${paint}-mask: ([^;]+);`))[1];
      for (const [, encoded] of value.matchAll(/url\("data:image\/svg\+xml,([^"]+)"\)/g)) {
        let svg = decodeURIComponent(encoded);
        const [, ws, hs] = svg.match(/width="(\d+)" height="(\d+)"/);
        const width = Number(ws), height = Number(hs), margin = 32;
        // Do not round-trip SVG through an HTML DOM: that can lowercase
        // clipPath and accidentally disable the very crop being tested.
        svg = svg.replace('<svg ', `<svg x="${margin}" y="${margin}" `)
          .replace('overflow="hidden"', 'overflow="visible"');
        async function leakedPixels(inner) {
          const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${width + margin * 2}" height="${height + margin * 2}">${inner}</svg>`;
          const { data, info } = await sharp(Buffer.from(source)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
          let count = 0;
          for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
            const outside = x < margin || x >= margin + width || y < margin || y >= margin + height;
            if (outside && data[(y * info.width + x) * info.channels + 3] > 1) count++;
          }
          return count;
        }
        assert.equal(await leakedPixels(svg), 0, `${profile}/${paint}: artwork leaked outside its tile`);
        if (await leakedPixels(svg.replace(' clip-path="url(#crop)"', '')) > 0) controlsWithLeaks++;
      }
    }
  }
  assert.equal(controlsWithLeaks, 72, 'unclipped controls reproduce the repeated/spilling artwork');
});
