import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { initFeatureBrackets } from '../../src/scripts/feature-brackets.ts';

function environment({ supported = true } = {}) {
  const { document, window } = parseHTML('<html><body><aside class="feature-box" data-tone="default"><span class="feature-box__bracket"></span><p>One line.</p></aside></body></html>');
  const box = document.querySelector('.feature-box');
  let height = 56, resized, mutated;
  box.getBoundingClientRect = () => ({ height });
  const observed = new Set();
  const globals = {
    document, HTMLElement: window.HTMLElement,
    window: supported ? { ResizeObserver: true } : {},
    ResizeObserver: class {
      constructor(callback) { resized = callback; }
      observe(node) { observed.add(node); }
      unobserve(node) { observed.delete(node); }
    },
    MutationObserver: class {
      constructor(callback) { mutated = callback; }
      observe() {}
    },
  };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  return {
    box, document, observed,
    resize(value) { height = value; resized([{ target: box }]); },
    mutate(record) { mutated([{ addedNodes: [], removedNodes: [], ...record }]); },
    cleanup() {
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

test('brackets follow full box height without changing content or inline layout styles', () => {
  const env = environment();
  try {
    const content = env.box.innerHTML;
    initFeatureBrackets();
    initFeatureBrackets();
    assert.equal(env.observed.size, 1);
    for (const [height, expected] of [[56, 'short'], [79.9, 'short'], [80, 'medium'], [104, 'medium'], [136, 'tall'], [480, 'tall'], [56, 'short']]) {
      env.resize(height);
      assert.equal(env.box.dataset.bracketSize, expected);
      assert.equal(env.box.innerHTML, content);
      assert.equal(env.box.getAttribute('style'), null);
    }
    env.resize(0);
    assert.equal(env.box.dataset.bracketSize, 'short', 'closed content retains its last valid size');
  } finally { env.cleanup(); }
});

test('detached brackets release observation and reinsertion resumes it', () => {
  const env = environment();
  try {
    initFeatureBrackets();
    env.box.remove();
    env.mutate({ removedNodes: [env.box] });
    assert.equal(env.observed.size, 0);
    assert.equal(env.box.dataset.bracketSize, undefined);
    env.document.body.append(env.box);
    env.mutate({ addedNodes: [env.box] });
    assert.equal(env.observed.size, 1);
    assert.equal(env.box.dataset.bracketSize, 'short');
  } finally { env.cleanup(); }
});

test('missing ResizeObserver leaves the CSS accent-line fallback intact', () => {
  const env = environment({ supported: false });
  try {
    initFeatureBrackets();
    assert.equal(env.observed.size, 0);
    assert.equal(env.box.dataset.bracketSize, undefined);
  } finally { env.cleanup(); }
});

test('all variants have fixed caps, decorative semantics and CSS-only tone/RTL behavior', () => {
  const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const component = read('src/components/FeatureBox.astro');
  const css = read('src/styles/drawn-elements.css');
  assert.match(component, /aria-hidden="true"/);
  assert.match(component, /vector-effect="non-scaling-stroke"/);
  assert.match(css, /grid-template-rows: 24px minmax\(0, 1fr\) 24px/);
  for (const size of ['short', 'medium', 'tall']) {
    assert.ok(css.includes(`[data-bracket-size="${size}"] [data-bracket-variant="${size}"]`));
  }
  assert.match(css, /\.feature-box\[data-bracket-size\]::before \{ display: none; \}/);
  assert.match(css, /\[dir="rtl"\] \.feature-box__bracket \{ transform: scaleX\(-1\); \}/);
});
