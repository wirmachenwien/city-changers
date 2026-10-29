import test from 'node:test';
import assert from 'node:assert/strict';
import { bindContentPopup } from '../../src/scripts/content-popup.ts';

function environment() {
  class Events {
    listeners = new Map();
    addEventListener(name, callback) {
      const callbacks = this.listeners.get(name) ?? new Set();
      callbacks.add(callback);
      this.listeners.set(name, callbacks);
    }
    removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
    emit(name, event = {}) {
      for (const callback of [...(this.listeners.get(name) ?? [])]) callback({ preventDefault() {}, ...event });
    }
  }
  class Element extends Events {
    children = [];
    attributes = new Map();
    style = {};
    offsetWidth = 44;
    isConnected = false;
    rect = { top: 250.25, bottom: 278.25, left: 100, right: 200, width: 100, height: 28 };
    constructor(tagName = 'div') { super(); this.tagName = tagName; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    append(...nodes) {
      for (const node of nodes) {
        this.children.push(node);
        if (node instanceof Element) { node.parent = this; node.isConnected = true; }
      }
    }
    remove() {
      this.isConnected = false;
      if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    }
    contains(node) { return node === this || this.children.some(child => child instanceof Element && child.contains(node)); }
    focus() { document.activeElement = this; }
    getBoundingClientRect() {
      return this.className?.split(' ').includes('content-popup') ? { width: 320, height: 120 } : this.rect;
    }
  }
  const document = Object.assign(new Events(), {
    body: new Element('body'),
    documentElement: { clientWidth: 800, clientHeight: 600 },
    createElement: tagName => new Element(tagName),
    querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 100.25 }) }),
  });
  const window = new Events();
  const frames = new Map();
  let nextFrame = 0;
  const globals = {
    window, document, Node: Element,
    getComputedStyle: () => ({ inlineSize: '44px' }),
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
  };
  const original = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  return {
    document, window, frames,
    trigger: (describedBy, action) => {
      const trigger = new Element('button');
      trigger.setAttribute('title', 'Native duplicate');
      if (describedBy) trigger.setAttribute('aria-describedby', describedBy);
      document.body.append(trigger);
      bindContentPopup(trigger, { content: () => 'Definition', label: 'Term', closeLabel: 'Close', action });
      return trigger;
    },
    popup: () => document.body.children.find(child => child.className?.split(' ').includes('content-popup')),
    popups: () => document.body.children.filter(child => child.className?.split(' ').includes('content-popup')),
    flush: () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); },
    cleanup: () => {
      document.emit('keydown', { key: 'Escape' });
      for (const child of [...document.body.children]) {
        if (child.className?.split(' ').includes('content-popup')) child.children[0].emit('click');
      }
      for (const [key, descriptor] of original) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

test('pinned popup follows the trigger precisely and remains open offscreen without sticking', () => {
  const env = environment();
  try {
    const trigger = env.trigger();
    trigger.emit('click');
    assert.equal(trigger.getAttribute('title'), null);
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(env.popup().getAttribute('role'), 'dialog');
    assert.equal(env.popup().style.top, '281.25px');
    trigger.rect.top -= 20.5;
    trigger.rect.bottom -= 20.5;
    env.window.emit('scroll');
    env.window.emit('scroll');
    assert.equal(env.frames.size, 1);
    env.flush();
    assert.equal(env.popup().style.top, '260.75px');
    trigger.rect.top = 73.25;
    trigger.rect.bottom = 101.25;
    env.window.emit('scroll');
    env.flush();
    assert.ok(env.popup(), 'one visible pixel keeps the popup open');
    trigger.rect.top = 72.25;
    trigger.rect.bottom = 100.25;
    env.window.emit('scroll');
    env.flush();
    assert.ok(env.popup(), 'pinned popup stays open behind the navbar');
    assert.equal(env.popup().style.top, '103.25px', 'popup follows the trigger instead of clamping to the navbar');
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    trigger.rect.top = -250;
    trigger.rect.bottom = -222;
    env.window.emit('scroll');
    env.flush();
    assert.ok(env.popup(), 'pinned popup survives scrolling fully offscreen');
    assert.equal(env.popup().style.top, '-219px');
    trigger.rect.top = 250.25;
    trigger.rect.bottom = 278.25;
    env.window.emit('scroll');
    env.flush();
    assert.equal(env.popup().style.top, '281.25px', 'scrolling back restores the original position');
  } finally { env.cleanup(); }
});

test('hover previews have no close button, are hoverable, and dismiss on leave', async () => {
  const env = environment();
  try {
    const trigger = env.trigger('original-note');
    trigger.emit('pointerenter', { pointerType: 'mouse' });
    const popup = env.popup();
    assert.equal(popup.getAttribute('role'), 'tooltip');
    assert.equal(popup.children[0].hidden, true);
    assert.match(trigger.getAttribute('aria-describedby'), /^original-note content-popup-/);
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    trigger.emit('pointerleave');
    popup.emit('pointerenter');
    await new Promise(resolve => setTimeout(resolve, 180));
    assert.equal(env.popup(), popup, 'moving onto the tooltip keeps it readable');
    popup.emit('pointerleave');
    await new Promise(resolve => setTimeout(resolve, 180));
    assert.equal(env.popup(), undefined);
    assert.equal(trigger.getAttribute('aria-describedby'), 'original-note');
    trigger.emit('pointerenter', { pointerType: 'touch' });
    assert.equal(env.popup(), undefined, 'touch does not produce a hover preview');
  } finally { env.cleanup(); }
});

test('click pins an existing preview and adds its close button without replacing it', async () => {
  const env = environment();
  try {
    const trigger = env.trigger();
    trigger.emit('pointerenter', { pointerType: 'mouse' });
    const popup = env.popup();
    trigger.emit('click');
    assert.equal(env.popup(), popup);
    assert.equal(popup.getAttribute('role'), 'dialog');
    assert.equal(popup.children[0].hidden, false);
    assert.equal(trigger.getAttribute('aria-describedby'), null);
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    trigger.emit('pointerleave');
    popup.emit('pointerleave');
    await new Promise(resolve => setTimeout(resolve, 180));
    assert.equal(env.popup(), popup, 'pinned popup persists after leaving');
    const second = env.trigger();
    second.emit('pointerenter', { pointerType: 'mouse' });
    assert.equal(env.popup(), popup, 'hovering another term does not replace a pinned popup');
    trigger.emit('click');
    assert.equal(env.popup(), popup, 'clicking a pinned trigger does not close it');
    popup.children[0].emit('click');
    assert.equal(popup.isConnected, false);
  } finally { env.cleanup(); }
});

test('hover previews reserve corner space on both sides so pinning never moves the box', () => {
  const env = environment();
  try {
    for (const left of [0, 750]) {
      const trigger = env.trigger();
      trigger.rect = { top: 550, bottom: 578, left, right: left + 40, width: 40, height: 28 };
      trigger.emit('pointerenter', { pointerType: 'mouse' });
      const preview = { ...env.popup().style };
      assert.equal(preview.left, left === 0 ? '30px' : '450px');
      trigger.emit('click');
      assert.deepEqual(env.popup().style, preview, 'revealing the circle preserves preview geometry');
      env.popup().children[0].emit('click');
    }
  } finally { env.cleanup(); }
});

test('multiple pinned popups only close through their own X controls', () => {
  const env = environment();
  try {
    const first = env.trigger();
    const second = env.trigger();
    first.emit('click');
    const oldPopup = env.popup();
    second.emit('click');
    assert.equal(oldPopup.isConnected, true);
    assert.equal(first.getAttribute('aria-expanded'), 'true');
    assert.equal(env.popups().length, 2);
    const secondPopup = env.popups()[1];
    second.emit('click');
    assert.equal(env.popups().length, 2, 'repeated trigger activation does not duplicate or close');
    env.document.emit('keydown', { key: 'Escape' });
    assert.equal(env.popups().length, 2);
    env.document.emit('pointerdown', { target: env.document.body });
    assert.equal(env.popups().length, 2);
    env.document.emit('focusin', { target: second });
    assert.equal(env.popups().length, 2);
    oldPopup.children[0].emit('click');
    assert.equal(first.getAttribute('aria-expanded'), 'false');
    assert.equal(env.document.activeElement, first);
    assert.equal(secondPopup.isConnected, true);
    assert.equal(env.popups().length, 1);
    secondPopup.children[0].emit('click');
    assert.equal(env.popups().length, 0);
    assert.equal(env.document.activeElement, second);
  } finally { env.cleanup(); }
});

test('footnote navigation actions are labelled native links, including in hover cards', () => {
  const env = environment();
  try {
    const trigger = env.trigger('note-1', { href: '#listed-note-1', label: 'Jump to footnote' });
    trigger.emit('pointerenter', { pointerType: 'mouse' });
    const popup = env.popup();
    assert.equal(popup.getAttribute('role'), 'dialog', 'interactive hover cards are not ARIA tooltips');
    assert.equal(popup.children[0].hidden, true);
    const jump = popup.children[1].children.at(-1);
    assert.equal(jump.tagName, 'a');
    assert.equal(jump.href, '#listed-note-1');
    assert.equal(jump.getAttribute('aria-label'), 'Jump to footnote');
    trigger.emit('click');
    assert.equal(env.popup(), popup);
    assert.equal(popup.children[0].hidden, false);
    assert.equal(popup.children[1].children.at(-1), jump, 'pinning preserves the navigation action');
  } finally { env.cleanup(); }
});

test('popup flips above and clamps to viewport edges without covering the navbar', () => {
  const env = environment();
  try {
    const trigger = env.trigger();
    trigger.rect = { top: 550, bottom: 578, left: 750, right: 790, width: 40, height: 28 };
    trigger.emit('click');
    assert.equal(env.popup().style.top, '427px');
    assert.equal(env.popup().style.left, '450px');
    assert.equal(env.popup().style.maxBlockSize, '461.75px');
    env.popup().children[0].emit('click');
    assert.equal(env.popup(), undefined);
    assert.equal(env.document.activeElement, trigger);
  } finally { env.cleanup(); }
});
