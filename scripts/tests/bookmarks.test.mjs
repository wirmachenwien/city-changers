import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { parseHTML } from 'linkedom';

// Exercise the real event handlers with DOM/storage/layout stubs. Transpile
// locally so Node need not resolve Astro's extensionless TypeScript imports.
const script = ts.transpileModule(readFileSync(new URL('../../src/scripts/bookmarks.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function environment({ hash = '', touch = false } = {}) {
  const { document, HTMLElement, Event } = parseHTML(`<html lang="en"><body>
    <main><h1>Chapter</h1><div data-bookmark-gutter><button data-bookmark-add><svg></svg></button></div>
    <div data-prose><p id="first">First paragraph</p><p id="second">Second paragraph</p></div></main>
    <aside data-bookmark-nav><ul data-bookmark-list></ul></aside></body></html>`);
  const path = '/book/02-superblocks.html';
  const storage = new Map([['toolbox.bookmarks', JSON.stringify([
    { page: path, url: `${path}#first`, anchor: 'first', title: 'Chapter', excerpt: 'First paragraph' },
  ])]]);
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const location = { pathname: path, hash };
  const scrolls = [];
  const windowEvents = new Map();
  const window = {
    scrollY: 0,
    scrollTo: value => scrolls.push(value),
    matchMedia: () => ({ matches: touch }),
    addEventListener: (name, handler) => windowEvents.set(name, handler),
  };
  HTMLElement.prototype.getBoundingClientRect = function () {
    const top = this.id === 'first' ? 100 : this.id === 'second' ? 200 : 0;
    const width = this.hasAttribute('data-prose') ? 700 : 900;
    return { top, bottom: top + 80, left: 0, right: width, width, height: 80 };
  };
  const pending = document.querySelector('[data-bookmark-add]');
  let active = null;
  let keyboard = false;
  Object.defineProperty(document, 'activeElement', { get: () => active });
  const matches = pending.matches.bind(pending);
  pending.matches = selector => selector === ':focus-visible' ? active === pending && keyboard : matches(selector);
  const exports = {};
  const imports = {
    '../lib/site': { DEFAULT_LANG: 'en' },
    '../data/locales': { languages: ['en', 'de', 'sl'] },
    '../lib/i18n': { t: (_lang, _key, fallback) => fallback },
    '../lib/icons.ts': { iconSvg: () => '<svg class="icon"></svg>' },
    '../lib/bookmark-title': {
      bookmarkExcerpt: element => element.textContent.trim(), plainBookmarkText: value => value,
    },
  };
  runInNewContext(script, {
    exports, require: name => {
      assert.ok(name in imports, `Unexpected import: ${name}`);
      return imports[name];
    },
    document, HTMLElement, window, location, localStorage,
    sessionStorage: { getItem: () => null },
    getComputedStyle: () => ({ direction: 'ltr' }),
    requestAnimationFrame: callback => callback(),
    CustomEvent: Event, URL,
    history: { pushState: (_state, _title, url) => { location.hash = new URL(url, 'https://example.org').hash; } },
  });
  exports.initBookmarks();
  function event(target, type, properties = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, properties);
    target.dispatchEvent(event);
  }
  return {
    document, pending, scrolls, event,
    pins: () => document.querySelectorAll('[data-bookmark-saved]').length,
    highlighted: () => document.querySelectorAll('.is-bookmark-target').length,
    move: (x, y) => event(document.querySelector('main'), 'mousemove', { clientX: x, clientY: y }),
    focus: (keyboardFocus = false) => { active = pending; keyboard = keyboardFocus; event(pending, 'focus'); },
    history: name => windowEvents.get(name)?.(),
  };
}

test('opening and navigating to a bookmark scrolls without highlighting it', () => {
  const env = environment({ hash: '#first' });
  assert.equal(env.pins(), 1);
  assert.equal(env.highlighted(), 0);
  assert.ok(env.scrolls.length);
  const count = env.scrolls.length;
  env.move(720, 110);
  assert.equal(env.highlighted(), 1);
  const link = env.document.querySelector('[data-bookmark-list] a');
  link.href = new URL(link.getAttribute('href'), 'https://example.org').href;
  env.event(link, 'click');
  assert.equal(env.scrolls.length, count + 1);
  assert.equal(env.highlighted(), 0);
  assert.equal(env.pins(), 1);
  env.history('hashchange');
  env.history('popstate');
  assert.equal(env.highlighted(), 0);
});

test('saving keeps the pin, but mouse focus does not latch the highlight', () => {
  const env = environment();
  assert.equal(env.pending.classList.contains('is-active'), false);
  env.move(720, 210);
  assert.equal(env.pending.classList.contains('is-active'), true);
  env.focus();
  env.event(env.pending, 'click');
  assert.equal(env.pins(), 2);
  assert.equal(env.highlighted(), 1);
  env.move(300, 210);
  assert.equal(env.pending.classList.contains('is-active'), false);
  assert.equal(env.highlighted(), 0);
  assert.equal(env.pins(), 2);
  env.move(720, 210);
  assert.equal(env.pending.classList.contains('is-active'), true);
  assert.equal(env.highlighted(), 1);
  env.event(env.document.querySelector('main'), 'mouseleave');
  assert.equal(env.pending.classList.contains('is-active'), false);
  assert.equal(env.highlighted(), 0);
});

test('touch save clears selection feedback without removing the saved pin', () => {
  const env = environment({ touch: true });
  env.event(env.document.getElementById('second'), 'click');
  assert.equal(env.pending.classList.contains('is-active'), true);
  assert.equal(env.highlighted(), 1);
  env.focus();
  env.event(env.pending, 'click');
  assert.equal(env.pending.classList.contains('is-active'), false);
  assert.equal(env.highlighted(), 0);
  assert.equal(env.pins(), 2);
});

test('keyboard aiming still highlights the focused line and clears on blur', () => {
  const env = environment();
  env.focus(true);
  assert.equal(env.pending.classList.contains('is-active'), true);
  assert.equal(env.highlighted(), 1);
  env.event(env.pending, 'keydown', { key: 'ArrowDown' });
  assert.equal(env.highlighted(), 1);
  env.event(env.pending, 'blur');
  assert.equal(env.pending.classList.contains('is-active'), false);
  assert.equal(env.highlighted(), 0);
});
