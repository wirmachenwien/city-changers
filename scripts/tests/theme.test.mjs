// Node-only tests with minimal DOM/storage stubs. No browser is launched.
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { initTheme } from '../../src/scripts/theme.ts';

const descriptors = new Map(['document', 'window', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
afterEach(() => {
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

function environment({ dark = false, stored = null, blocked = false } = {}) {
  const root = { dataset: {} };
  const events = new Map();
  const buttonEvents = new Map();
  const attributes = new Map();
  const meta = new Map();
  const button = {
    dataset: { labelToLight: 'Light', labelToDark: 'Dark' },
    setAttribute: (key, value) => attributes.set(key, value),
    addEventListener: (name, fn) => buttonEvents.set(name, fn),
  };
  const media = { matches: dark, addEventListener: (_, fn) => events.set('os-change', fn) };
  const document = {
    documentElement: root,
    querySelectorAll: () => [button],
    head: { querySelector: () => ({ setAttribute: (key, value) => meta.set(key, value) }) },
  };
  const window = {
    matchMedia: () => media,
    addEventListener: (name, fn) => events.set(name, fn),
  };
  const localStorage = {
    getItem: () => { if (blocked) throw new Error('Storage disabled'); return stored; },
    setItem: (_, value) => { if (blocked) throw new Error('Storage disabled'); stored = value; },
  };
  for (const [key, value] of Object.entries({ document, window, localStorage })) {
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  initTheme();
  return {
    click: () => buttonEvents.get('click')(),
    shown: () => attributes.get('data-mode'),
    label: () => attributes.get('aria-label'),
    paper: () => meta.get('content'),
    mode: () => root.dataset.theme,
    osChange: (next) => { media.matches = next; events.get('os-change')(); },
    storage: (next, key = 'wmw-theme') => { stored = next; events.get('storage')({ key }); },
    restore: next => { stored = next; events.get('pageshow')(); },
  };
}

for (const dark of [false, true]) {
  for (const stored of [null, 'system', 'light', 'dark']) {
    test(`every click changes the visible theme: OS=${dark ? 'dark' : 'light'}, stored=${stored}`, () => {
      const env = environment({ dark, stored });
      const initial = env.shown();
      env.click();
      assert.notEqual(env.shown(), initial);
      assert.equal(env.label(), env.shown() === 'dark' ? 'Light' : 'Dark');
      assert.equal(env.paper(), env.shown() === 'dark' ? '#161511' : '#fdfcf9');
      env.click();
      assert.equal(env.shown(), initial);
    });
  }
}

test('disabled localStorage still allows repeated toggles', () => {
  const env = environment({ blocked: true });
  env.click(); assert.equal(env.shown(), 'dark');
  env.click(); assert.equal(env.shown(), 'light');
  env.click(); assert.equal(env.shown(), 'dark');
});

test('system changes and cleared storage remain in sync', () => {
  const env = environment();
  env.osChange(true); assert.equal(env.shown(), 'dark');
  env.click(); assert.equal(env.shown(), 'light');
  env.osChange(false); assert.equal(env.mode(), undefined);
  env.storage('dark'); assert.equal(env.shown(), 'dark');
  env.storage(null, null); assert.equal(env.mode(), undefined);
  assert.equal(env.shown(), 'light');
});

test('restoring a suspended page picks up theme changes made in another tab', () => {
  const env = environment();
  env.restore('dark');
  assert.equal(env.shown(), 'dark');
  env.restore(null);
  assert.equal(env.shown(), 'light');
});

test('restoring a page with disabled storage preserves its in-memory choice', () => {
  const env = environment({ blocked: true });
  env.click();
  env.restore(null);
  assert.equal(env.shown(), 'dark');
});
