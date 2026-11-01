// Serve the site and start Chrome with --remote-debugging-port=9223.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

const site = process.env.SITE_URL ?? 'http://localhost:4321';
const chrome = process.env.CHROME_URL ?? 'http://127.0.0.1:9223';
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method: 'PUT' })).json();
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0, loaded;
const pending = new Map();
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === 'Page.loadEventFired') loaded?.();
  const task = pending.get(message.id);
  if (!task) return;
  pending.delete(message.id);
  clearTimeout(task.timeout);
  message.error ? task.reject(message.error) : task.resolve(message.result);
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timeout = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 15000);
  pending.set(id, { resolve, reject, timeout });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const state = () => evaluate(`(() => {
  const logo = document.querySelector('.site-head [data-brand-animation]');
  const image = [...logo.querySelectorAll(':scope > img')].find(node => getComputedStyle(node).display !== 'none');
  const animation = logo.querySelector('.brand-art__mascot');
  const rect = image.getBoundingClientRect();
  const box = animation.getBoundingClientRect();
  return { ready: logo.hasAttribute('data-brand-ready'), clip: getComputedStyle(image).clipPath,
    display: getComputedStyle(animation).display, svgs: animation.querySelectorAll('svg').length,
    label: logo.getAttribute('aria-label'), buttons: logo.querySelectorAll('button').length,
    width: rect.width, height: rect.height,
    mascotWidth: box.width, mascotHeight: box.height, top: box.top - rect.top,
    light: getComputedStyle(animation.querySelector('.brand-art__light')).display,
    dark: getComputedStyle(animation.querySelector('.brand-art__dark')).display };
})()`);

try {
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const ready = new Promise(resolve => loaded = resolve);
  await call('Page.navigate', { url: `${site}/` });
  await ready;
  const still = await state();
  assert.equal(still.ready, false);
  assert.equal(still.clip, 'none');
  assert.equal(still.svgs, 0, 'reduced motion never initializes Lottie');
  assert.ok(still.label && still.buttons === 0, 'logo retains one accessible name without a nested control');

  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await evaluate(`new Promise((resolve, reject) => {
    const logo = document.querySelector('.site-head [data-brand-animation]');
    if (logo.hasAttribute('data-brand-ready')) return resolve();
    const timeout = setTimeout(() => { observer.disconnect(); reject(new Error('Logo animation did not become ready')); }, 8000);
    const observer = new MutationObserver(() => {
      if (logo.hasAttribute('data-brand-ready')) { clearTimeout(timeout); observer.disconnect(); resolve(); }
    });
    observer.observe(logo, { attributes: true });
  })`);
  const animated = await state();
  assert.equal(animated.svgs, 2, 'light and dark artwork are both ready for instant theme switching');
  assert.notEqual(animated.clip, 'none');
  assert.equal(animated.width, still.width, 'wordmark and overall lockup do not move');
  assert.equal(animated.height, still.height);
  assert.ok(Math.abs(animated.mascotWidth - still.width * 256 / 960) < .01);
  assert.ok(Math.abs(animated.mascotHeight - still.height) < .01 && Math.abs(animated.top) < .01, 'animation aligns to the mascot master');
  for (const theme of ['light', 'dark']) {
    await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
    const current = await state();
    assert.equal(current[theme], 'block');
    assert.equal(current[theme === 'light' ? 'dark' : 'light'], 'none');
    if (process.env.SCREENSHOT_DIR) {
      const rect = await evaluate(`(() => { const r=document.querySelector('.site-head .brand-art').getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,scale:2}; })()`);
      const image = await call('Page.captureScreenshot', { format: 'png', clip: rect });
      writeFileSync(`${process.env.SCREENSHOT_DIR}/animated-logo-${theme}.png`, Buffer.from(image.data, 'base64'));
    }
  }
  await call('Emulation.setEmulatedMedia', { media: 'print', features: [] });
  assert.equal((await state()).clip, 'none');
  assert.equal((await state()).display, 'none');
  await call('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal((await state()).clip, 'none');
  assert.equal((await state()).display, 'none');
  console.log('Header mascot animation, framing, themes, static fallback, reduced motion and print passed');
} finally {
  await call('Page.close');
  socket.close();
}
