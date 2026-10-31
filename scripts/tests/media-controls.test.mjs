import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createServer } from 'vite';

// Use the app's bundler to resolve its extensionless TS and JSON imports.
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom' });
let initVideos, initCopy, initSpoiler;
try {
  ({ initVideos } = await server.ssrLoadModule('/src/scripts/videos.ts'));
  ({ initCopy } = await server.ssrLoadModule('/src/scripts/copy.ts'));
  ({ initSpoiler } = await server.ssrLoadModule('/src/scripts/spoiler.ts'));
} finally { await server.close(); }

function environment(body) {
  const { document, window } = parseHTML(`<html lang="en"><body>${body}</body></html>`);
  const timers = new Map();
  let timer = 0;
  const values = {
    document, Node: window.Node,
    window: { setTimeout: callback => { timers.set(++timer, callback); return timer; }, clearTimeout: id => timers.delete(id) },
    navigator: { clipboard: { writeText: async () => {} } },
  };
  const previous = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true });
  return { document, window, timers, clipboard: values.navigator.clipboard, cleanup() {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  } };
}

test('playback replaces only the facade button, once, preserving stage, caption and outline', () => {
  const env = environment('<figure data-video data-embed="https://www.youtube-nocookie.com/embed/test?autoplay=1"><div class="figure__media"><div class="figure__stage"><button data-play aria-label="Play a talk">Play</button></div><svg class="drawn-outline"></svg></div><figcaption>A talk</figcaption></figure>');
  try {
    const { document, window } = env;
    const figure = document.querySelector('figure');
    const outline = document.querySelector('svg');
    const button = document.querySelector('button');
    initVideos();
    initVideos();
    assert.equal(document.querySelector('iframe'), null, 'player is not loaded until requested');
    button.dispatchEvent(new window.Event('click'));
    assert.equal(document.querySelectorAll('iframe').length, 1);
    assert.equal(document.querySelector('.figure__stage > iframe').title, 'Play a talk');
    assert.equal(document.querySelector('svg'), outline);
    assert.equal(document.querySelector('figcaption').textContent, 'A talk');
    assert.equal(figure.dataset.loaded, 'true');
  } finally { env.cleanup(); }
});

test('local video playback uses native controls and inline autoplay', () => {
  const env = environment('<figure data-video data-video-file="/talk.MP4?download=1"><div><button data-play>Play</button></div></figure>');
  try {
    initVideos();
    env.document.querySelector('button').dispatchEvent(new env.window.Event('click'));
    const video = env.document.querySelector('video');
    assert.equal(video.src, '/talk.MP4?download=1');
    assert.equal(video.controls, true);
    assert.equal(video.autoplay, true);
    assert.equal(video.playsInline, true);
    assert.equal(env.document.querySelector('iframe'), null);
  } finally { env.cleanup(); }
});

test('spoiler keeps native reveal semantics and localized hints when decorated', () => {
  const env = environment('<button class="spoiler" data-spoiler aria-expanded="false" data-show-label="Show secret" data-hide-label="Hide secret"><span class="spoiler-text">A secret</span><span data-spoiler-hint>Show secret</span></button>');
  try {
    const button = env.document.querySelector('button');
    initSpoiler();
    initSpoiler();
    button.dispatchEvent(new env.window.Event('click'));
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.equal(button.title, 'Hide secret');
    assert.equal(button.querySelector('[data-spoiler-hint]').textContent, 'Hide secret');
    button.dispatchEvent(new env.window.Event('click'));
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(button.title, 'Show secret');
    assert.equal(button.querySelector('.spoiler-text').textContent, 'A secret');
  } finally { env.cleanup(); }
});

test('copy success and failure preserve icons and decoration and restore the original label', async () => {
  const env = environment('<button data-copy="value"><svg data-copy-icon></svg>Copy<svg class="drawn-outline"></svg></button>');
  try {
    const button = env.document.querySelector('button');
    const icons = [...button.querySelectorAll('svg')];
    let copied;
    env.clipboard.writeText = async value => { copied = value; };
    initCopy();
    initCopy();
    assert.equal(button.querySelectorAll('[data-copy-text]').length, 1);
    button.dispatchEvent(new env.window.Event('click'));
    await Promise.resolve();
    assert.equal(copied, 'value');
    assert.equal(button.querySelector('[data-copy-text]').textContent, 'Copied');
    assert.deepEqual([...button.querySelectorAll('svg')], icons);
    [...env.timers.values()].forEach(callback => callback());
    assert.equal(button.querySelector('[data-copy-text]').textContent, 'Copy');
    env.clipboard.writeText = async () => { throw new Error('Denied'); };
    button.dispatchEvent(new env.window.Event('click'));
    await Promise.resolve();
    assert.notEqual(button.querySelector('[data-copy-text]').textContent, 'Copy');
    assert.deepEqual([...button.querySelectorAll('svg')], icons);
  } finally { env.cleanup(); }
});
