import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { initLinkUnderlines, underlineLines } from '../../src/scripts/link-underlines.ts';

test('underline fragments merge on the same line, preserving wrapped and RTL lines', () => {
  assert.deepEqual(underlineLines([
    { left: 60, right: 90, top: 0, bottom: 20 },
    { left: 10, right: 60, top: 0, bottom: 20 },
    { left: 0, right: 80, top: 30, bottom: 50 },
    { left: 0, right: 0, top: 0, bottom: 20 },
  ]), [
    { left: 10, right: 90, top: 0, bottom: 20 },
    { left: 0, right: 80, top: 30, bottom: 50 },
  ]);
});

function environment({ supported = true, external = false, css = false } = {}) {
  const { document, window } = parseHTML(`<html><body><a href="/test">Wrapped <em>link</em>${external ? '<span class="external-link-icon" aria-hidden="true">↗</span><span class="external-link-notice"> (opens in a new tab)</span>' : ''}</a><a href="/button" class="button-link">Button</a></body></html>`);
  const link = document.querySelector('a');
  if (css) for (const candidate of document.querySelectorAll('a')) candidate.dataset.cssUnderline = 'text';
  let resized, mutated, selected, measurements = 0, textGrowth = 0;
  const frames = [];
  const observed = new Set();
  const styleReads = new Map();
  document.createRange = () => ({
    selectNodeContents(node) { selected = node; },
    getClientRects() {
      measurements++;
      if (selected?.parentElement?.matches('.external-link-notice, .external-link-icon')) {
        return [{ left: 0, right: 500, top: 10, bottom: 30 }];
      }
      return selected?.textContent === 'link'
        ? [{ left: 20, right: 65 + textGrowth, top: 35, bottom: 55 }]
        : [{ left: 40, right: 110 + textGrowth, top: 10, bottom: 30 }];
    },
  });
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.matches('.drawn-link-rule') && this.closest('[data-link-rule][data-link-underline]') && this.style.display !== 'block') return { left: 0, top: 0 };
    return { left: 40, top: 10 };
  };
  const globals = {
    document, HTMLElement: window.HTMLElement, Element: window.Element,
    NodeFilter: { SHOW_TEXT: 4 },
    window: { ...(supported ? { ResizeObserver: true } : {}), CSS: { supports: () => true }, addEventListener() {} },
    getComputedStyle: node => {
      styleReads.set(node, (styleReads.get(node) ?? 0) + 1);
      return { textDecorationLine: node.matches('button, .button-link, .no-underline') ? 'none' : 'underline', textDecorationStyle: 'solid', position: 'static' };
    },
    requestAnimationFrame: callback => frames.push(callback),
    ResizeObserver: class {
      constructor(callback) { resized = callback; }
      observe(node) { observed.add(node); }
      unobserve(node) { observed.delete(node); }
    },
    MutationObserver: class { constructor(callback) { mutated = callback; } observe() {} },
  };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  return {
    document, link, observed, styleReads, Event: window.Event,
    resize: () => resized([{ target: link, contentRect: { width: 90, height: 45 } }]),
    growText: value => { textGrowth = value; },
    pageResize: (width, height) => resized([{ target: document.body, contentRect: { width, height } }]),
    get measurements() { return measurements; },
    mutate: records => mutated(records.map(record => ({ addedNodes: [], removedNodes: [], ...record }))),
    flush() { for (const frame of frames.splice(0)) frame(); },
    cleanup() {
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

test('CSS-owned prose and pebble links are neither observed nor measured by the JS renderer', () => {
  const env = environment({ css: true });
  try {
    const button = env.document.querySelector('.button-link');
    button.dataset.cssUnderline = 'pebble';
    const original = env.link.innerHTML;
    initLinkUnderlines();
    env.flush();
    assert.equal(env.measurements, 0);
    assert.equal(env.observed.has(env.link), false);
    assert.equal(env.observed.has(button), false);
    assert.equal(env.link.innerHTML, original);
    env.link.dispatchEvent(new env.Event('pointerover', { bubbles: true }));
    env.link.dispatchEvent(new env.Event('focusin', { bubbles: true }));
    env.pageResize(700, 1200);
    env.flush();
    assert.equal(env.measurements, 0);
    assert.equal(env.link.querySelector('.drawn-link-rule'), null);
  } finally { env.cleanup(); }
});

test('Quiet rule paint follows wrapped text and button labels without altering content', () => {
  const env = environment();
  try {
    initLinkUnderlines();
    initLinkUnderlines();
    env.flush();
    const layer = env.link.querySelector('.drawn-link-rule');
    assert.ok(layer);
    assert.equal(layer.getAttribute('aria-hidden'), 'true');
    assert.equal(layer.children.length, 2);
    assert.equal(layer.children[0].style.width, '70px');
    assert.equal(layer.children[1].style.left, '0px');
    assert.equal(env.link.textContent, 'Wrapped link');
    assert.equal(env.link.getAttribute('href'), '/test');
    assert.equal(env.link.querySelectorAll('em').length, 1);
    assert.ok(env.document.querySelector('.button-link .drawn-link-rule'));
    assert.equal(env.document.querySelector('.button-link').dataset.linkUnderline, 'button');
    env.resize();
    env.flush();
    assert.equal(env.link.querySelectorAll('.drawn-link-rule').length, 1);
    env.link.classList.add('no-underline');
    env.resize();
    env.flush();
    assert.equal(env.link.querySelector('.drawn-link-rule'), null, 'hover-only decoration clears when the underline state ends');
    assert.equal(env.link.hasAttribute('data-link-rule'), false);
    env.link.classList.remove('no-underline');
    env.resize();
    env.flush();
    assert.ok(env.link.querySelector('.drawn-link-rule'));
    env.link.remove();
    env.mutate([{ target: env.document.body, type: 'childList', addedNodes: [], removedNodes: [env.link] }]);
    env.flush();
    assert.equal(env.observed.has(env.link), false);
    assert.equal(env.link.hasAttribute('data-link-rule'), false);
  } finally { env.cleanup(); }
});

test('missing measurement support retains native underlines', () => {
  const env = environment({ supported: false });
  try {
    initLinkUnderlines();
    env.flush();
    assert.equal(env.document.querySelector('.drawn-link-rule'), null);
    assert.equal(env.observed.size, 0);
  } finally { env.cleanup(); }
});

test('accordion-like page height changes do not remeasure links or rebuild decoration', () => {
  const env = environment();
  try {
    initLinkUnderlines();
    env.flush();
    env.pageResize(900, 1000);
    env.flush();
    const reads = env.measurements;
    const layer = env.link.querySelector('.drawn-link-rule');
    const stroke = layer.firstElementChild;
    for (let height = 1000; height <= 1600; height += 20) {
      env.pageResize(900, height);
      env.flush();
    }
    assert.equal(env.measurements, reads, 'a fold must not trigger page-wide Range measurements every frame');
    env.resize();
    env.flush();
    assert.equal(layer.firstElementChild, stroke, 'unchanged local geometry reuses the existing paint nodes');
    env.pageResize(700, 1600);
    env.flush();
    assert.ok(env.measurements > reads, 'actual wrapping width changes still refresh underlines');
  } finally { env.cleanup(); }
});

test('hover refreshes only the affected link, not every link on the page', () => {
  const env = environment();
  try {
    initLinkUnderlines();
    env.flush();
    env.styleReads.clear();
    env.link.dispatchEvent(new env.Event('pointerover', { bubbles: true }));
    env.flush();
    assert.deepEqual([...env.styleReads.keys()], [env.link]);
  } finally { env.cleanup(); }
});

test('ancillary hover underlines are prepared before hover and need no pointer redraw', () => {
  const env = environment();
  try {
    env.link.classList.add('no-underline'); // Fixture computes no idle underline.
    env.link.dataset.linkUnderline = 'hover';
    initLinkUnderlines();
    env.flush();
    const layer = env.link.querySelector('.drawn-link-rule');
    assert.ok(layer, 'hover-only links have their Quiet rule ready before interaction');
    env.styleReads.clear();
    env.link.dispatchEvent(new env.Event('pointerover', { bubbles: true }));
    env.flush();
    assert.equal(env.styleReads.size, 0, 'CSS handles declared hover states immediately');
    assert.equal(env.link.querySelector('.drawn-link-rule'), layer);
  } finally { env.cleanup(); }
});

test('button labels prepare one hover stroke, while text-link hovers add a second Quiet rule', () => {
  const env = environment();
  try {
    const button = env.document.createElement('button');
    button.className = 'copy-btn';
    button.textContent = 'Copy';
    env.document.body.append(button);
    initLinkUnderlines();
    env.flush();
    assert.equal(button.dataset.linkUnderline, 'button');
    assert.ok(button.querySelector('.drawn-link-rule'));
    env.styleReads.clear();
    button.dispatchEvent(new env.Event('pointerover', { bubbles: true }));
    env.flush();
    assert.equal(env.styleReads.size, 0, 'button hover is also a CSS-only paint change');
  } finally { env.cleanup(); }
});

test('component-owned pagination stays outside the generic underline enhancer', () => {
  const env = environment();
  try {
    env.link.dataset.linkUnderline = 'pagination';
    initLinkUnderlines();
    env.flush();
    assert.equal(env.link.querySelector('.drawn-link-rule'), null);
    assert.equal(env.observed.has(env.link), false);
    assert.equal(env.link.hasAttribute('data-link-rule-position'), false);
    assert.equal(env.link.getAttribute('href'), '/test');
  } finally { env.cleanup(); }
});

test('remeasuring hidden hover paint never uses its zero-sized display:none origin', () => {
  const env = environment();
  try {
    env.link.dataset.linkUnderline = 'hover';
    initLinkUnderlines();
    env.flush();
    const layer = env.link.querySelector('.drawn-link-rule');
    assert.equal(layer.style.left, '-20px');
    env.growText(10);
    env.resize();
    env.flush();
    assert.equal(layer.style.left, '-20px', 'idle hover paint must retain its actual local origin after a font/wrapping change');
    assert.equal(layer.style.top, '0px');
    assert.ok(!layer.style.display);
    assert.ok(!layer.style.visibility);
    assert.equal(layer.children[0].style.width, '80px');
  } finally { env.cleanup(); }
});

test('external-link notices and icons never extend the visible text underline', () => {
  const env = environment({ external: true });
  try {
    initLinkUnderlines();
    env.flush();
    const strokes = env.link.querySelector('.drawn-link-rule').children;
    assert.equal(strokes.length, 2);
    assert.equal(strokes[0].style.width, '70px');
    assert.equal(strokes[1].style.width, '45px');
    assert.equal(env.link.querySelector('.external-link-notice').textContent, ' (opens in a new tab)', 'the accessible notice is preserved');
  } finally { env.cleanup(); }
});

test('local text edits remeasure only their owning link', () => {
  const env = environment();
  try {
    initLinkUnderlines();
    env.flush();
    env.styleReads.clear();
    const text = env.link.firstChild;
    text.textContent = 'Changed ';
    env.mutate([{ type: 'characterData', target: text }]);
    env.flush();
    assert.deepEqual([...env.styleReads.keys()], [env.link]);
    env.styleReads.clear();
    const unrelated = env.document.createElement('p');
    unrelated.textContent = 'Not a link';
    env.document.body.append(unrelated);
    env.mutate([{ type: 'childList', target: env.document.body, addedNodes: [unrelated] }]);
    env.flush();
    assert.equal(env.styleReads.size, 0);
  } finally { env.cleanup(); }
});

test('added subtrees wire only new links; removed subtrees release them and reinsertion resumes', () => {
  const env = environment();
  try {
    initLinkUnderlines();
    env.flush();
    const group = env.document.createElement('div');
    group.innerHTML = '<a href="/new">New link</a>';
    const added = group.querySelector('a');
    env.styleReads.clear();
    env.document.body.append(group);
    env.mutate([{ type: 'childList', target: env.document.body, addedNodes: [group] }]);
    env.flush();
    assert.deepEqual([...env.styleReads.keys()], [added]);
    assert.ok(added.querySelector('.drawn-link-rule'));
    group.remove();
    env.mutate([{ type: 'childList', target: env.document.body, removedNodes: [group] }]);
    env.flush();
    assert.equal(env.observed.has(added), false);
    env.document.body.append(group);
    env.mutate([{ type: 'childList', target: env.document.body, addedNodes: [group] }]);
    env.flush();
    assert.ok(env.observed.has(added));
    assert.equal(added.querySelectorAll('.drawn-link-rule').length, 1);
  } finally { env.cleanup(); }
});

test('decorative mutations never schedule more measurements', () => {
  const env = environment();
  try {
    initLinkUnderlines();
    env.flush();
    const layer = env.link.querySelector('.drawn-link-rule');
    env.styleReads.clear();
    env.mutate([
      { type: 'childList', target: env.link, addedNodes: [layer] },
      { type: 'childList', target: layer, addedNodes: [layer.firstChild] },
    ]);
    env.flush();
    assert.equal(env.styleReads.size, 0);
  } finally { env.cleanup(); }
});

test('paint uses the existing Quiet rule and currentColor, never a wavy decoration', () => {
  const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const global = read('src/styles/global.css');
  const drawn = read('src/styles/drawn-elements.css');
  assert.doesNotMatch(global, /text-decoration-style:\s*wavy/);
  assert.match(drawn, /\.drawn-link-rule > span::after\s*\{[^}]*background: currentColor;[^}]*mask: url\('[^']*lines\/divider\.svg'\)/);
  assert.match(drawn, /mask: url\('[^']*lines\/divider\.svg'\) center \/ max\(100%, 480px\) 100% no-repeat;/, 'short links crop the natural-width source rather than compressing it');
  assert.match(drawn, /\.drawn-link-rule \{ display: none; \}/);
  assert.match(drawn, /\[data-link-rule\] \{ text-decoration-color: transparent; \}/);
  assert.match(global, /text-decoration: underline dotted;/);
});
