// Browser regression without third-party automation dependencies.
// Serve dist and start headless Chrome with --remote-debugging-port=9223 first.
// SITE_URL and CHROME_URL may override the local defaults.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const svgPath = file => readFileSync(new URL(`../../design/elements/${file}`, import.meta.url), 'utf8').match(/<path[^>]*\sd="([^"]+)"/)[1];
const pebblePath = svgPath('frames/share-pebble.svg');
const quietPath = svgPath('lines/divider.svg');
const site = process.env.SITE_URL ?? 'http://127.0.0.1:18765';
const chrome = process.env.CHROME_URL ?? 'http://127.0.0.1:9223';
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method: 'PUT' })).json();
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0;
const pending = new Map();
const events = new Map();
socket.addEventListener('message', event => {
  const data = JSON.parse(event.data);
  if (data.method) events.get(data.method)?.();
  if (!data.id) return;
  const task = pending.get(data.id);
  pending.delete(data.id);
  if (!task) return;
  clearTimeout(task.timeout);
  data.error ? task.reject(data.error) : task.resolve(data.result);
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 15000);
  pending.set(id, { resolve, reject, timeout });
  socket.send(JSON.stringify({ id: sequence, method, params }));
});
const evaluate = async expression => {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
// requestAnimationFrame callbacks do not run with page JavaScript disabled.
const settle = () => call('Page.captureScreenshot', { format: 'png' });
const transparent = 'rgba(0, 0, 0, 0)';
const hover = async (selector, pseudoClasses = ['hover']) => {
  const { root } = await call('DOM.getDocument');
  const { nodeId } = await call('DOM.querySelector', { nodeId: root.nodeId, selector });
  assert.ok(nodeId, `missing browser fixture: ${selector}`);
  await call('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: pseudoClasses });
};
const inspect = selector => evaluate(`(() => {
  const node = document.querySelector(${JSON.stringify(selector)});
  const style = getComputedStyle(node);
  const before = getComputedStyle(node, '::before');
  const after = getComputedStyle(node, '::after');
  const token = name => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--' + name + ')';
    node.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  };
  return { fill: before.backgroundColor, mask: before.maskImage, after: after.display,
    background: style.backgroundColor, border: style.borderTopColor,
    color: style.color, font: style.fontFamily, height: parseFloat(style.minBlockSize),
    align: style.alignItems, justify: style.justifyContent, padding: parseFloat(style.paddingBlockStart),
    transform: style.transform, paintTransform: before.transform, strokeTransform: after.transform,
    duration: before.transitionDuration, appearance: style.appearance,
    pointer: style.pointerEvents, decoration: style.textDecorationLine,
    tokens: Object.fromEntries(['accent-soft', 'accent', 'accent-ink', 'pebble-hover', 'pebble-hover-ink', 'pebble-selected-hover', 'pebble-selected-hover-ink', 'warm', 'warm-soft'].map(name => [name, token(name)])) };
})()`);

try {
  await call('Page.enable');
  await call('DOM.enable');
  await call('CSS.enable');
  await call('Emulation.setScriptExecutionDisabled', { value: true });
  const loaded = new Promise(resolve => events.set('Page.loadEventFired', resolve));
  await call('Page.navigate', { url: `${site}/brand.html` });
  await loaded;
  for (const width of [390, 1280]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await settle();
    const state = await evaluate(`(() => {
      const question = document.querySelector('.question');
      const bubble = document.querySelector('.mascot-box__bubble');
      const button = document.querySelector('.button-link');
      const accordion = document.querySelector('.accordion');
      const paint = node => ({ border: getComputedStyle(node).borderTopColor, stroke: getComputedStyle(node, '::after').maskImage, fill: getComputedStyle(node, '::before').backgroundColor, position: getComputedStyle(node, '::after').maskPosition });
      return { question: paint(question), bubble: paint(bubble), button: paint(button), accordion: paint(accordion.querySelector('.drawn-frame')), mediaReady: document.querySelectorAll('.figure__media.drawn-ready').length,
        mediaFallback: [...document.querySelectorAll('.figure__media')].every(node => getComputedStyle(node,'::before').display==='none' && getComputedStyle(node,'::after').display==='none' && getComputedStyle(node).borderTopStyle==='solid' && getComputedStyle(node).borderTopColor===getComputedStyle(question,'::after').backgroundColor),
        selects: [...document.querySelectorAll('.lang-menu select, .select-list select')].every(node => node.parentElement.matches('.drawn-select')),
        tables: [...document.querySelectorAll('.prose table')].every(node => node.closest('.drawn-scroll-shell')) };
    })()`);
    assert.equal(state.question.border, transparent);
    assert.match(state.question.stroke, /frame-stroke.*#nw/);
    assert.match(state.button.stroke, /compact-stroke.*#nw/);
    assert.notEqual(state.button.fill, transparent);
    assert.match(state.bubble.stroke, width <= 480 ? /bubble-top-stroke/ : /bubble-side-stroke/);
    assert.match(state.accordion.stroke, /frame-stroke/);
    assert.notEqual(state.question.position, Array(9).fill('0% 0%').join(', '), 'all nine slices have distinct positions');
    assert.equal(state.mediaReady, 0, 'page JavaScript is disabled');
    assert.ok(state.mediaFallback, 'media has a normal same-color border until measured clipping is ready');
    assert.ok(state.selects && state.tables);
    assert.ok(await evaluate(`(() => { const node=document.querySelector('.spoiler-text'); return node && getComputedStyle(node).maskImage==='none' && getComputedStyle(node).color!=='rgba(0, 0, 0, 0)'; })()`), 'spoilers remain readable with no JS');
    console.log(`CSS-only boxes, controls, speech and wrappers passed at ${width}px`);
  }
  assert.ok(await evaluate(`(() => { const node=document.querySelector('.mascot-box__bubble'); document.documentElement.dir='rtl'; const mirrored=getComputedStyle(node,'::after').transform.startsWith('matrix(-1'); document.documentElement.dir='ltr'; return mirrored && getComputedStyle(node).transform==='none'; })()`));
  // Check resolved tokens, not an intermediate frame of the theme-color transition.
  assert.ok(await evaluate(`(() => { const node=document.querySelector('.question'); document.documentElement.dataset.theme='light'; const light=getComputedStyle(node).getPropertyValue('--drawn-fill'); document.documentElement.dataset.theme='dark'; const dark=getComputedStyle(node).getPropertyValue('--drawn-fill'); delete document.documentElement.dataset.theme; return light!==dark; })()`));
  console.log('RTL decoration and semantic dark-theme fills passed');
  // Native details toggling changes the full frame height without redrawing.
  assert.ok(await evaluate(`(() => { const node=document.querySelector('.accordion'); const before=node.offsetHeight; node.open=true; return node.offsetHeight>before && getComputedStyle(node.querySelector('.drawn-frame'),'::after').maskImage!=='none'; })()`));
  // Check final footer colors, not an intermediate theme/media transition.
  await evaluate(`document.querySelector('.site-footer').style.transition = 'none'`);
  for (const mode of ['print', 'forced-colors']) {
    await call('Emulation.setEmulatedMedia', mode === 'print' ? { media: 'print' } : { media: 'screen', features: [{ name: 'forced-colors', value: 'active' }] });
    assert.ok(await evaluate(`(() => { const node=document.querySelector('.question'); return getComputedStyle(node,'::after').maskImage==='none' && getComputedStyle(node).borderTopStyle==='solid'; })()`));
    assert.ok(await evaluate(`(() => {
      const select = document.querySelector('.drawn-select > select');
      const arrow = select.parentElement.querySelector('.drawn-select__chevron');
      return getComputedStyle(select).appearance !== 'none' && getComputedStyle(arrow).display === 'none';
    })()`), 'selects retain native arrows when drawn decoration is disabled');
    console.log(`${mode} native boundaries passed`);
    if (mode === 'print') {
      const footer = await inspect('.site-footer');
      assert.equal(footer.border, footer.tokens.warm, 'native footer border uses warm');
      assert.equal(footer.background, footer.tokens['warm-soft'], 'footer background uses warm-soft');
    }
  }
  await call('Emulation.setEmulatedMedia', { media: 'screen', features: [] });
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.ok(await evaluate(`(() => { const node=document.querySelector('.button-link'); node.focus(); return document.activeElement===node && node.matches(':focus-visible') && getComputedStyle(node).outlineStyle==='solid' && getComputedStyle(node).clipPath==='none'; })()`));
  console.log('Unclipped keyboard focus passed');
  await call('Emulation.setScriptExecutionDisabled', { value: false });
  const reload = new Promise(resolve => events.set('Page.loadEventFired', resolve));
  await call('Page.reload');
  await reload;
  await settle();
  await evaluate('document.fonts.ready');
  // Assert the browser's final cascade rather than selector spelling/order.
  // Reduced motion gives immediate state changes and deterministic paint checks.
  await call('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  for (const theme of ['light', 'dark']) {
    await evaluate(`document.documentElement.dataset.theme = '${theme}'; document.body.style.transition = 'none'`);
    for (const selector of ['.copy-btn', '.share a', '.share .share-btn', '.language-switcher a:not([aria-current="true"])', '.slides .slide-nav button', '.visual-toc > a', '.drawn-select']) {
      await hover(selector, []);
      const idle = await inspect(selector);
      assert.equal(idle.fill, idle.tokens['accent-soft'], `${theme}: ${selector} idle fill`);
      if (selector === '.visual-toc > a') assert.match(idle.mask, /frame-fill/);
      else assert.ok(decodeURIComponent(idle.mask).includes(pebblePath), `${selector}: shared pebble artwork`);
      assert.equal(idle.after, 'none', `${selector} has no drawn outline`);
      assert.equal(idle.transform, 'none', `${selector} content stays untransformed`);
      assert.equal(idle.duration, '0s', 'reduced motion disables paint transitions');
      if (selector !== '.drawn-select') {
        assert.equal(idle.color, idle.tokens.accent);
        assert.match(idle.font, /Fraunces/);
        assert.ok(idle.height >= 44);
      }
      await hover(selector);
      const hot = await inspect(selector);
      assert.equal(hot.fill, hot.tokens['pebble-hover'], `${theme}: ${selector} hover fill`);
      if (selector !== '.drawn-select') assert.equal(hot.color, hot.tokens['pebble-hover-ink']);
      assert.equal(hot.transform, 'none', 'only decoration may move');
      await hover(selector, []);
    }
    const selected = '.language-switcher a[aria-current="true"]';
    const idle = await inspect(selected);
    assert.equal(idle.fill, idle.tokens.accent);
    assert.equal(idle.color, idle.tokens['accent-ink']);
    await hover(selected);
    const hot = await inspect(selected);
    assert.equal(hot.fill, hot.tokens['pebble-selected-hover']);
    assert.equal(hot.color, hot.tokens['pebble-selected-hover-ink']);
    await hover(selected, []);
  }
  const card = await inspect('.visual-toc > a');
  assert.ok(card.height >= 88 && card.padding >= 16);
  assert.equal(card.align, 'flex-start');
  assert.equal(card.justify, 'flex-start');
  assert.equal((await inspect('.drawn-select > select')).appearance, 'none');
  assert.ok(await evaluate(`(() => {
    const shell = document.querySelector('.drawn-select');
    const select = shell.querySelector('select');
    const chevron = shell.querySelector('.drawn-select__chevron');
    return parseFloat(getComputedStyle(select).paddingInlineEnd) >= 36
      && getComputedStyle(chevron).pointerEvents === 'none'
      && chevron.getAttribute('aria-hidden') === 'true';
  })()`));
  await hover('.drawn-select');
  assert.ok(await evaluate(`(() => {
    const shell = document.querySelector('.drawn-select');
    const rule = getComputedStyle(shell.querySelector('[data-select-value]'), '::after');
    return rule.content !== 'none' && decodeURIComponent(rule.maskImage).includes(${JSON.stringify(quietPath)})
      && rule.width === getComputedStyle(shell.querySelector('[data-select-value]')).width;
  })()`), 'select hover rule follows the selected-text mirror');
  await hover('.drawn-select', []);
  // Motion moves paint only, with a non-rotating panel/primary-button exception.
  await call('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  for (const selector of ['.copy-btn', '.share a', '.language-switcher a', '.slides .slide-nav button', '.drawn-select', '.visual-toc > a', '.button-link', '.question button[type="submit"]', '.search-form button']) {
    await hover(selector);
    // Let the finite CSS transition complete without arbitrary wall-clock sleeps.
    await evaluate(`Promise.all(document.querySelector(${JSON.stringify(selector)}).getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})))`);
    const state = await inspect(selector);
    assert.equal(state.transform, 'none');
    assert.notEqual(state.paintTransform, 'none');
    const primary = selector.includes('button-link') || selector.includes('submit') || selector.includes('search-form');
    const rotates = !primary && selector !== '.visual-toc > a';
    const matrix = state.paintTransform.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
    assert.equal(Math.abs(matrix[1]) > .001, rotates, `${selector}: expected paint rotation`);
    if (primary) assert.equal(state.strokeTransform, state.paintTransform, 'primary fill/stroke grow together');
    await hover(selector, []);
  }
  console.log('Computed select/button colors, typography, sizing, motion and reduced-motion states passed');
  await call('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  // Underlines are checked as actual pseudo-element paint, including utility
  // exceptions. No test depends on the full selector list or markup formatting.
  for (const [selector, double] of [['.brand-guide p a[href]', true], ['.icon-downloads a', true], ['.footer-text p a', true], ['.crumbs a', false], ['.side-nav .nav-list a', false], ['.button-link', false]]) {
    await hover(selector);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new Event('pointerover', { bubbles: true }))`);
    await settle();
    assert.ok(await evaluate(`(() => {
      const link = document.querySelector(${JSON.stringify(selector)});
      const layer = link.querySelector('.drawn-link-rule');
      const stroke = layer?.firstElementChild;
      return stroke && getComputedStyle(layer).display !== 'none'
        && decodeURIComponent(getComputedStyle(stroke, '::before').maskImage).includes(${JSON.stringify(quietPath)})
        && (getComputedStyle(stroke, '::after').content !== 'none') === ${double};
    })()`), `${selector}: expected hover strokes`);
    await hover(selector, []);
  }
  for (const theme of ['light', 'dark']) {
    await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
    const panel = await inspect('.site-footer');
    assert.equal(panel.background, panel.tokens['warm-soft'], `${theme}: footer background uses warm-soft`);
    assert.equal(panel.fill, panel.tokens.warm, `${theme}: drawn footer border uses warm`);
    const idle = await inspect('.footer-text p a');
    await hover('.footer-text p a');
    const footer = await inspect('.footer-text p a');
    await hover('.brand-guide p a[href]');
    const bodyHover = await inspect('.brand-guide p a[href]');
    const bright = idle.color.match(/\d+/g).slice(0, 3).map(channel => Math.min(255, Math.round(Number(channel) * 1.1)));
    assert.equal(footer.color, `rgb(${bright.join(', ')})`, `${theme}: footer hover brightens its own color by 10%`);
    assert.notEqual(footer.color, bodyHover.color, 'footer hover stays neutral, not green');
    await hover('.footer-text p a', []);
    await hover('.brand-guide p a[href]', []);
  }
  const pagination = '.pagination a[data-link-underline="pagination"]';
  await hover(pagination);
  assert.ok(await evaluate(`(() => {
    const link = document.querySelector(${JSON.stringify(pagination)});
    const label = link.querySelector('[data-pagination-label]');
    const range = document.createRange();
    range.selectNodeContents(link.querySelector('[data-pagination-text]'));
    const lines = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
    const strokes = [...label.querySelectorAll('.pagination__rules > span')];
    return link.hasAttribute('data-pagination-ready') && !link.querySelector('.drawn-link-rule')
      && lines.length > 0 && lines.length === strokes.length
      && strokes.every((stroke, index) => Math.abs(parseFloat(stroke.style.width) - lines[index].width) < 1)
      && getComputedStyle(link).textDecorationLine === 'none';
  })()`), 'pagination owns one measured stroke per actual title line');
  await hover(pagination, []);
  console.log('Computed prose, download, navigation and button underline states passed');
  assert.ok(await evaluate(`(() => {
    const button=document.querySelector('[data-spoiler]');
    const text=button.querySelector('.spoiler-text');
    const hidden=getComputedStyle(text).maskImage.includes('compact-fill') && getComputedStyle(text).color==='rgba(0, 0, 0, 0)';
    button.click();
    text.style.transition='none';
    const highlight=getComputedStyle(text,'::before');
    const probe=document.createElement('span');
    probe.style.background='var(--accent-soft)';
    text.append(probe);
    const revealed=button.getAttribute('aria-expanded')==='true'
      && getComputedStyle(text).maskImage==='none'
      && getComputedStyle(text).color!=='rgba(0, 0, 0, 0)'
      && highlight.maskImage.includes('compact-fill')
      && highlight.backgroundColor===getComputedStyle(probe).backgroundColor;
    probe.remove();
    button.click();
    return hidden && revealed && button.getAttribute('aria-expanded')==='false' && getComputedStyle(button).maskImage==='none';
  })()`), 'spoiler paint is hand-drawn, revealable, and does not mask its native button');
  console.log('Hand-drawn spoiler masking and soft-green reveal highlight passed');
  assert.ok(await evaluate(`document.querySelectorAll('.figure__media.drawn-ready').length>0 && document.querySelectorAll('.question .drawn-outline, .accordion .drawn-outline, .mascot-box__bubble .drawn-outline').length===0`));
  assert.ok(await evaluate(`(() => {
    const shells=[...document.querySelectorAll('.drawn-table-ready')].filter(node=>node.getBoundingClientRect().width>0);
    return shells.length>0 && shells.every(shell=>{
      const surface=shell.querySelector(':scope > .drawn-table-surface');
      const header=shell.querySelector('thead');
      const end=parseFloat(surface.style.getPropertyValue('--drawn-header-end'));
      return getComputedStyle(surface).maskImage===getComputedStyle(shell,'::before').maskImage
        && Math.abs(end-(header.getBoundingClientRect().bottom-shell.getBoundingClientRect().top))<1
        && getComputedStyle(header.querySelector('th')).backgroundColor==='rgba(0, 0, 0, 0)'
        && getComputedStyle(shell.querySelector('table')).clipPath==='none'
        && getComputedStyle(shell.querySelector('.table-scroll')).clipPath==='none';
    });
  })()`));
  console.log('Measured header backgrounds share the CSS frame mask; content remains unclipped');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: false });
  await settle();
  assert.ok(await evaluate(`(() => {
    const shell=[...document.querySelectorAll('.drawn-table-ready')].find(node=>node.getBoundingClientRect().width>0);
    const end=parseFloat(shell.querySelector('.drawn-table-surface').style.getPropertyValue('--drawn-header-end'));
    return Math.abs(end-(shell.querySelector('thead').getBoundingClientRect().bottom-shell.getBoundingClientRect().top))<1;
  })()`));
  for (const mode of ['print', 'forced-colors']) {
    await call('Emulation.setEmulatedMedia', mode === 'print' ? { media: 'print' } : { media: 'screen', features: [{ name: 'forced-colors', value: 'active' }] });
    assert.ok(await evaluate(`[...document.querySelectorAll('.drawn-table-surface')].every(node=>getComputedStyle(node).display==='none')`));
  }
  console.log('Header resize and native print/forced-colors fallbacks passed');
} finally {
  await call('Page.close');
  socket.close();
}
