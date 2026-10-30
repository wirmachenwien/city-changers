import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { initBrandToc } from '../../src/scripts/brand-toc.ts';

const names = ['document', 'window', 'requestAnimationFrame'];
const originals = names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
afterEach(() => {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});

function environment() {
  const { document, HTMLElement } = parseHTML(`<html><body>
    <nav data-scroll-toc><ul class="nav-list"></ul></nav>
    <main class="brand-guide">
      <h2 id="identity">Identity</h2><h3>Logo</h3><h3>Logo</h3>
      <div class="showcase-demo"><h2>Demo title</h2><h3>Demo subsection</h3></div>
      <details><summary>Technical reference</summary><h2>Hidden reference</h2></details>
      <h2>Components</h2><h3>Figure</h3>
      <h2 id="downloads">Downloads</h2>
    </main></body></html>`);
  const events = new Map();
  const positions = new Map();
  const headings = [...document.querySelectorAll('h2, h3')].filter((el) => !el.closest('.showcase-demo, details'));
  headings.forEach((heading, i) => positions.set(heading, i * 1000));
  const window = { scrollY: 0, innerHeight: 600, addEventListener: (name, fn) => events.set(name, fn) };
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: 6500 });
  HTMLElement.prototype.getBoundingClientRect = function () {
    return positions.has(this)
      ? { top: positions.get(this) - window.scrollY, bottom: positions.get(this) - window.scrollY + 30 }
      : { top: 0, bottom: 500 };
  };
  for (const [name, value] of Object.entries({ document, window, requestAnimationFrame: (fn) => fn() })) {
    Object.defineProperty(globalThis, name, { value, configurable: true });
  }
  initBrandToc();
  return { document, window, events };
}

test('TOC derives two levels, creates unique anchors and excludes demo/reference headings', () => {
  const { document } = environment();
  const nav = document.querySelector('[data-scroll-toc]');
  assert.deepEqual([...nav.querySelectorAll('a')].map((el) => el.textContent), ['Identity', 'Logo', 'Logo', 'Components', 'Figure', 'Downloads']);
  assert.deepEqual([...nav.querySelectorAll('.nav-list--nested a')].map((el) => el.getAttribute('href')), ['#logo', '#logo-2', '#figure']);
  assert.equal(nav.querySelector('[aria-current="location"]').textContent, 'Identity');
  assert.equal(nav.querySelectorAll('.nav-list--nested:not([hidden])').length, 1);
  assert.equal(nav.querySelector('.nav-list--nested:not([hidden])').parentElement.firstElementChild.textContent, 'Identity');
});

test('scroll tracking handles large jumps, scrolling back, and the document bottom', () => {
  const { document, window, events } = environment();
  const nav = document.querySelector('[data-scroll-toc]');
  const current = () => nav.querySelector('[aria-current="location"]')?.textContent;
  window.scrollY = 4200;
  events.get('scroll')();
  assert.equal(current(), 'Figure');
  assert.equal(nav.querySelector('.is-active-parent').textContent, 'Components');
  assert.equal(nav.querySelectorAll('.nav-list--nested:not([hidden])').length, 1);
  assert.equal(nav.querySelector('.nav-list--nested:not([hidden])').parentElement.firstElementChild.textContent, 'Components');
  window.scrollY = 1500;
  events.get('scroll')();
  assert.equal(current(), 'Logo');
  assert.equal(nav.querySelectorAll('.nav-list--nested:not([hidden])').length, 1);
  assert.equal(nav.querySelector('.nav-list--nested:not([hidden])').parentElement.firstElementChild.textContent, 'Identity');
  window.scrollY = 6000;
  events.get('scroll')();
  assert.equal(current(), 'Downloads');
  assert.equal(nav.querySelectorAll('.nav-list--nested:not([hidden])').length, 0);
  assert.equal(nav.querySelectorAll('[aria-current]').length, 1);
});
