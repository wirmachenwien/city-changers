import test from 'node:test';
import assert from 'node:assert/strict';

test('mascot visibility uses exact artwork/navbar boundaries and cleans up listeners', async () => {
  const keys = ['window', 'document', 'HTMLElement', 'customElements', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const original = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let Player;
  let navbarBottom = 130.25;
  let top = 54.25;
  const resizes = [];
  const frames = new Map();
  let nextFrame = 0;
  const listeners = new Map();
  const reduced = { matches: false, addEventListener() {}, removeEventListener() {} };
  const header = { getBoundingClientRect: () => ({ bottom: navbarBottom, height: 100 }) };
  const artwork = { getBoundingClientRect: () => ({ top, bottom: top + 100, left: 0, right: 100, width: 100, height: 100 }) };
  const button = { hidden: true, addEventListener() {}, removeEventListener() {} };
  const globals = {
    window: {
      matchMedia: () => reduced,
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: name => listeners.delete(name),
    },
    document: { querySelector: () => header, documentElement: { clientWidth: 800, clientHeight: 600 } },
    HTMLElement: class {
      dataset = { animation: '/mascot.json' };
      isConnected = true;
      querySelector(selector) { return selector === 'button' ? button : artwork; }
      removeAttribute() {}
    },
    customElements: { get() {}, define(_name, ctor) { Player = ctor; } },
    ResizeObserver: class {
      targets = [];
      constructor(callback) { this.callback = callback; resizes.push(this); }
      observe(target) { this.targets.push(target); }
      disconnect() { this.disconnected = true; }
    },
    requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
  };
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback();
  };
  const scrollTo = value => { top = value; listeners.get('scroll')(); flush(); };
  try {
    for (const [key, value] of Object.entries(globals)) {
      Object.defineProperty(globalThis, key, { value, configurable: true });
    }
    await import('../../src/scripts/mascot-player.ts');
    const player = new Player();
    let plays = 0;
    player.replay = async () => { plays++; };
    player.connectedCallback();
    flush();
    assert.deepEqual(resizes[0].targets, [header, artwork]);
    assert.equal(plays, 0, '24 visible pixels do not trigger');
    scrollTo(55.234375);
    assert.equal(plays, 0, 'one layout subpixel below 25% does not trigger');
    scrollTo(55.25);
    assert.equal(plays, 1, 'exactly 25 visible pixels trigger');
    scrollTo(31.25);
    assert.equal(player.entered, true, 'one visible pixel does not reset the visit');
    scrollTo(30.25);
    assert.equal(player.entered, false, 'exact edge contact behind the navbar resets');
    scrollTo(55.25);
    assert.equal(plays, 2);

    navbarBottom = 150.5;
    top = 75.5;
    resizes[0].callback();
    flush();
    assert.equal(plays, 2, 'navbar resize does not replay an existing visit');
    scrollTo(50.5);
    scrollTo(75.484375);
    assert.equal(plays, 2);
    scrollTo(75.5);
    assert.equal(plays, 3, 'fractional navbar resizing preserves the exact boundary');
    scrollTo(600);
    scrollTo(576);
    assert.equal(plays, 3, '24 pixels at the bottom do not trigger');
    scrollTo(575);
    assert.equal(plays, 4, '25 pixels at the bottom trigger');

    listeners.get('scroll')();
    listeners.get('resize')();
    assert.equal(frames.size, 1, 'geometry checks are batched per frame');
    reduced.matches = true;
    player.motionPreference();
    assert.equal(resizes[0].disconnected, true);
    assert.equal(listeners.size, 0);
    assert.equal(frames.size, 0);
    reduced.matches = false;
    player.motionPreference();
    player.disconnectedCallback();
    assert.equal(resizes.at(-1).disconnected, true);
    assert.equal(listeners.size, 0);
    assert.equal(frames.size, 0);
  } finally {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
