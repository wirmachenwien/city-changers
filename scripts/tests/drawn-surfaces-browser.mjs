// Cross-browser geometry and pixel regression. Start Chrome (CDP 9223) or
// Firefox (--remote-debugging-port 9225), then pass BROWSER=firefox if needed.
// Desktop narrow viewports are NOT a substitute for Firefox Android testing.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const firefox = process.env.BROWSER === 'firefox';
const browser = firefox ? 'firefox' : 'chromium';
const site = process.env.SITE_URL || 'http://localhost:4321';
const output = process.env.SCREENSHOT_DIR;
const tab = firefox ? null : await (await fetch(`${process.env.CHROME_URL || 'http://127.0.0.1:9223'}/json/new?about:blank`, { method: 'PUT' })).json();
const socket = new WebSocket(firefox ? (process.env.FIREFOX_WS || 'ws://127.0.0.1:9225/session') : tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
const pending = new Map();
let sequence = 0, context;
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data), task = pending.get(message.id);
  if (!task) return;
  pending.delete(message.id); clearTimeout(task.timeout);
  if (message.error || message.type === 'error') task.reject(new Error(JSON.stringify(message)));
  else task.resolve(message.result);
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 30000);
  pending.set(id, { resolve, reject, timeout }); socket.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression) {
  const result = firefox
    ? await call('script.evaluate', { expression, target: { context }, awaitPromise: true, resultOwnership: 'none' })
    : await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails || result.type === 'exception') throw new Error(JSON.stringify(result));
  return result.result.value;
}
const settle = () => evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');

try {
  if (firefox) {
    await call('session.new', { capabilities: {} });
    ({ context } = await call('browsingContext.create', { type: 'tab' }));
    await call('browsingContext.navigate', { context, url: `${site}/brand.html`, wait: 'complete' });
  } else {
    await call('Page.enable');
    await call('Page.navigate', { url: `${site}/brand.html` });
    // Resolve after navigation commits, not in the outgoing about:blank realm.
    await call('Runtime.evaluate', { expression: `new Promise(resolve => document.readyState === 'complete' ? resolve() : window.addEventListener('load', resolve, { once:true }))`, awaitPromise: true });
  }
  await evaluate('document.fonts.ready.then(() => true)');
  await settle();
  await evaluate(`(() => {
    const style = document.createElement('style');
    style.textContent = '* { transition: none !important; animation: none !important; } #surface-regression { position: fixed; inset: 170.25px auto auto 16.375px; z-index: 1000; display: grid; gap: 12.375px; } #surface-regression > * { position: relative; inset: auto; margin: 0; box-shadow: none; padding: 16px; width: 280.375px; height: 90.625px; max-width: none; box-sizing: border-box; --drawn-fill: var(--ink); --drawn-stroke: var(--ink); color: var(--paper); }';
    document.head.append(style);
    const fixture=document.createElement('div'); fixture.id='surface-regression';
    fixture.innerHTML='<div class="last-visit-toast">Toast</div><div class="question">Panel</div><a class="button-link" href="#main">Compact</a>';
    document.body.append(fixture);
    return true;
  })()`);
  for (const width of [390, 1280]) for (const density of [1, 1.5, 2]) for (const theme of ['light', 'dark']) {
    if (firefox) await call('browsingContext.setViewport', { context, viewport: { width, height: 900 }, devicePixelRatio: density });
    else await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: density, mobile: false });
    await evaluate(`document.documentElement.dataset.theme='${theme}'`);
    await settle();
    const state = JSON.parse(await evaluate(`JSON.stringify((() => {
      const fixtures=[...document.querySelectorAll('#surface-regression > *')];
      return fixtures.map(host => {
        const svg=host.querySelector('.drawn-surface'), path=svg.querySelector('path'), box=svg.getBoundingClientRect();
        const view=svg.viewBox.baseVal;
        return { ready: host.classList.contains('drawn-ready'), width:box.width, height:box.height, viewWidth:view.width, viewHeight:view.height,
          paths:svg.querySelectorAll('path').length, mask:getComputedStyle(host).maskImage, fill:getComputedStyle(path).fill,
          box:{x:box.x,y:box.y,width:box.width,height:box.height} };
      });
    })())`));
    for (const surface of state) {
      assert.ok(surface.ready);
      assert.equal(surface.paths, 1);
      assert.equal(surface.mask, 'none');
      assert.ok(Math.abs(surface.width - surface.viewWidth) < .01);
      assert.ok(Math.abs(surface.height - surface.viewHeight) < .01);
    }
    const boundary = JSON.parse(await evaluate(`JSON.stringify((() => {
      const edge=document.querySelector('.site-head__edge');
      return { top:edge.getBoundingClientRect().top, fill:getComputedStyle(edge.querySelector('path')).fill };
    })())`));
    const shot = firefox
      ? await call('browsingContext.captureScreenshot', { context, origin: 'viewport', format: { type: 'image/png' } })
      : await call('Page.captureScreenshot', { format: 'png' });
    if (output) { mkdirSync(output, { recursive: true }); writeFileSync(join(output, `${browser}-${width}-${density}-${theme}.png`), Buffer.from(shot.data, 'base64')); }
    // Compare actual screenshot pixels with the computed ink. Scan the complete
    // clear interior below the label, including the former bottom tile join.
    const pixels = JSON.parse(await evaluate(`(async () => {
      const image=new Image(); image.src='data:image/png;base64,${shot.data}'; await image.decode();
      const canvas=document.createElement('canvas'); canvas.width=image.width; canvas.height=image.height;
      const ctx=canvas.getContext('2d'); ctx.drawImage(image,0,0);
      const scale=image.width/innerWidth, surfaces=${JSON.stringify(state)};
      const errors=surfaces.map(surface => {
        const b=surface.box, expected=surface.fill.match(/\\d+/g).slice(0,3).map(Number);
        let bad=0;
        for(let y=Math.ceil((b.y+b.height-30)*scale);y<Math.floor((b.y+b.height-12)*scale);y++) {
          for(let x=Math.ceil((b.x+20)*scale);x<Math.floor((b.x+b.width-20)*scale);x++) {
            const pixel=ctx.getImageData(x,y,1,1).data;
            if(expected.some((value,i)=>Math.abs(value-pixel[i])>2)) bad++;
          }
        }
        return bad;
      });
      const boundary=${JSON.stringify(boundary)}, expected=boundary.fill.match(/\\d+/g).slice(0,3).map(Number);
      let bad=0;
      for(let y=Math.floor(boundary.top*scale)-1;y<Math.ceil((boundary.top+2)*scale);y++) {
        for(let x=10;x<image.width-10;x++) {
          const pixel=ctx.getImageData(x,y,1,1).data;
          if(expected.some((value,i)=>Math.abs(value-pixel[i])>2)) bad++;
        }
      }
      errors.push(bad);
      return JSON.stringify(errors);
    })()`));
    assert.deepEqual(pixels, [0, 0, 0, 0], `${browser}/${width}/${density}/${theme}: no transparent panel or header seams`);
    console.log(`${browser}: ${width}px, DPR ${density}, ${theme}: continuous geometry and screenshot pixels passed`);
  }
  // Reflow closed/open details and RTL without touching native content/focus.
  await evaluate(`document.querySelector('.accordion').open=true; document.documentElement.dir='rtl'`);
  await settle();
  assert.equal(await evaluate(`(() => {const host=document.querySelector('.accordion');const svg=host.querySelector('.drawn-surface');return Math.abs(svg.viewBox.baseVal.height-svg.getBoundingClientRect().height)<.01;})()`), true);
  const tail = JSON.parse(await evaluate(`JSON.stringify((() => {
    const bubble=document.querySelector('.mascot-box__bubble'), svg=bubble.querySelector('.drawn-surface'), path=svg.querySelector('path');
    const box=svg.getBoundingClientRect(), paint=path.getBoundingClientRect();
    return { right:paint.right-box.right, left:paint.left-box.left, transform:path.getAttribute('transform') };
  })())`));
  assert.ok(Math.abs(tail.right-15)<2 && tail.left>0 && tail.left<15, `RTL mirrors the side tail without shifting the bubble: ${JSON.stringify(tail)}`);
  if (process.env.PREVIEW_URL) {
    if (firefox) await call('browsingContext.navigate', { context, url: process.env.PREVIEW_URL, wait: 'complete' });
    else {
      await call('Page.navigate', { url: process.env.PREVIEW_URL });
      await evaluate(`new Promise(resolve => document.readyState === 'complete' ? resolve(true) : window.addEventListener('load', () => resolve(true), { once:true }))`);
    }
    await evaluate('document.fonts.ready.then(() => true)'); await settle();
    assert.equal(await evaluate(`document.querySelectorAll('.shape.drawn-ready').length===document.querySelectorAll('.shape').length`), true, 'standalone preview uses the production renderer');
    await evaluate(`document.querySelector('#shape-text').click(); const slider=document.querySelector('#shape-width'); slider.value='70'; slider.dispatchEvent(new Event('input')); true`);
    await settle();
    assert.equal(await evaluate(`[...document.querySelectorAll('.shape')].every(host => {const svg=host.querySelector('.drawn-surface');return Math.abs(svg.viewBox.baseVal.width-svg.getBoundingClientRect().width)<.01 && Math.abs(svg.viewBox.baseVal.height-svg.getBoundingClientRect().height)<.01;})`), true, 'standalone preview remeasures longer text and width changes');
    console.log(`${browser}: standalone preview resize/content controls passed`);
  }
} finally {
  if (firefox && context) { await call('browsingContext.close', { context }); await call('session.end'); }
  else if (!firefox) await call('Page.close');
  socket.close();
}
