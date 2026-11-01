// Browser regression without third-party automation dependencies.
// Serve dist and start headless Chrome with --remote-debugging-port=9223 first.
// SITE_URL and CHROME_URL may override the local defaults.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const svgPath = file => readFileSync(new URL(`../../design/elements/${file}`, import.meta.url), 'utf8').match(/<path[^>]*\sd="([^"]+)"/)[1];
const pebblePath = svgPath('frames/share-pebble.svg');
const quietPath = svgPath('lines/divider.svg');
const selectShell = '.side-nav .drawn-select';
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
    pointer: style.pointerEvents, decoration: style.textDecorationLine, outline: style.outlineStyle,
    tokens: Object.fromEntries(['paper', 'accent-soft', 'accent', 'accent-ink', 'pebble-hover', 'pebble-hover-ink', 'pebble-selected-hover', 'pebble-selected-hover-ink', 'warm', 'warm-soft'].map(name => [name, token(name)])) };
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
    assert.ok(await evaluate(`(() => {
      const input = document.querySelector('.site-head input[type="search"]');
      const submit = input.parentElement.querySelector('.search-submit');
      const empty = getComputedStyle(submit).display === 'none';
      input.value = 'bike lanes';
      const typed = ['flex', 'inline-flex'].includes(getComputedStyle(submit).display);
      input.value = '';
      return empty && typed && getComputedStyle(submit).display === 'none' && submit.type === 'submit' && Boolean(submit.getAttribute('aria-label'));
    })()`), 'search submit appears only with text, even without page JavaScript');
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
      const select = document.querySelector('.side-nav .drawn-select > select');
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
    const picker = await inspect(selectShell);
    assert.ok(await evaluate(`(() => {
      const language = document.querySelector('.side-nav .nav-language');
      return !document.querySelector('.site-head .lang-menu') && language.parentElement.firstElementChild === language
        && document.querySelectorAll('#side-language').length === 1 && document.querySelectorAll('#drawer-language').length === 1;
    })()`), 'language picker sits at the top of the sidebar TOC with unique control IDs');
    const header = await evaluate(`(() => {
      const head = document.querySelector('.site-head');
      const paths = head.querySelectorAll('.site-head__edge > path');
      return { background: getComputedStyle(head).backgroundImage,
        safeArea: getComputedStyle(head, '::before').backgroundColor,
        edgeFill: getComputedStyle(paths[0]).fill, edgeStroke: getComputedStyle(paths[1]).stroke };
    })()`);
    assert.ok(header.background.includes(picker.tokens['accent-soft']));
    assert.equal(header.safeArea, picker.tokens['accent-soft']);
    assert.equal(header.edgeFill, picker.tokens['accent-soft']);
    assert.equal(header.edgeStroke, picker.tokens.accent);
    const themeToggle = '.site-head .theme-toggle';
    await hover(themeToggle, []);
    const searchBox = '.site-head .search-box';
    await evaluate(`document.querySelector('.site-head input[type="search"]').blur()`);
    const idleSearch = await inspect(searchBox);
    assert.equal(idleSearch.fill, picker.tokens['accent-soft'], 'idle navigation search blends into the header');
    await hover(searchBox);
    assert.equal((await inspect(searchBox)).fill, picker.tokens.paper, 'hover reveals the paper search fill');
    await hover(searchBox, []);
    await evaluate(`document.querySelector('.site-head input[type="search"]').focus()`);
    assert.equal((await inspect(searchBox)).fill, picker.tokens.paper, 'focused navigation search keeps its original paper fill');
    assert.equal((await inspect('.site-head input[type="search"]')).background, transparent, 'only the shaped paint layer fills the search box');
    const submitted = await evaluate(`(() => {
      const input = document.querySelector('.site-head input[type="search"]');
      const form = input.form;
      const button = form.querySelector('.search-submit');
      input.value = 'bike lanes';
      input.blur();
      const populatedFill = getComputedStyle(input.parentElement, '::before').backgroundColor;
      const field = input.getBoundingClientRect();
      const box = button.getBoundingClientRect();
      let result;
      form.addEventListener('submit', event => {
        event.preventDefault();
        result = { query: new FormData(form).get(input.name), method: form.method,
          action: form.action, submitter: event.submitter === button,
          populatedFill,
          outline: getComputedStyle(button, '::after').display,
          inside: box.left >= field.left && box.right <= field.right && box.top >= field.top && box.bottom <= field.bottom,
          width: box.width, height: box.height };
      }, { once: true });
      button.click();
      input.value = '';
      return result;
    })()`);
    assert.equal(submitted.query, 'bike lanes');
    assert.equal(submitted.method, 'get');
    assert.equal(submitted.populatedFill, picker.tokens.paper, 'populated search keeps the active fill after blur');
    assert.equal(submitted.outline, 'none', 'search submit has no drawn box around its pebble');
    assert.ok(submitted.action.endsWith('/search.html') && submitted.submitter && submitted.inside);
    assert.ok(submitted.width >= 44 && submitted.height >= 44, 'inside submit retains a full touch target');
    await evaluate(`document.querySelector('.site-head input[type="search"]').blur()`);
    const restingToggle = await inspect(themeToggle);
    assert.equal(restingToggle.fill, picker.tokens['accent-soft'], 'desktop theme pebble blends into the header');
    assert.ok(decodeURIComponent(restingToggle.mask).includes(pebblePath));
    for (const pseudo of ['hover', 'focus-visible']) {
      await hover(themeToggle, [pseudo]);
      const revealed = await inspect(themeToggle);
      assert.equal(revealed.fill, picker.tokens['pebble-hover'], 'desktop theme pebble appears on hover/focus');
      assert.equal(revealed.background, transparent, 'no rectangular hover background');
      if (pseudo === 'focus-visible') assert.equal(revealed.outline, 'solid');
    }
    await hover(themeToggle, []);
    for (const selector of ['.copy-btn', '.share a', '.share .share-btn', '.language-switcher a:not([aria-current="true"])', '.slides .slide-nav button', '.visual-toc > a', selectShell]) {
      await hover(selector, []);
      const idle = await inspect(selector);
      assert.equal(idle.fill, idle.tokens['accent-soft'], `${theme}: ${selector} idle fill`);
      if (selector === '.visual-toc > a') assert.match(idle.mask, /frame-fill/);
      else assert.ok(decodeURIComponent(idle.mask).includes(pebblePath), `${selector}: shared pebble artwork`);
      assert.equal(idle.after, 'none', `${selector} has no drawn outline`);
      assert.equal(idle.transform, 'none', `${selector} content stays untransformed`);
      assert.equal(idle.duration, '0s', 'reduced motion disables paint transitions');
      if (selector !== selectShell) {
        assert.equal(idle.color, idle.tokens.accent);
        assert.match(idle.font, /Fraunces/);
        assert.ok(idle.height >= 44);
      }
      await hover(selector);
      const hot = await inspect(selector);
      assert.equal(hot.fill, hot.tokens['pebble-hover'], `${theme}: ${selector} hover fill`);
      if (selector !== selectShell) assert.equal(hot.color, hot.tokens['pebble-hover-ink']);
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
  assert.equal((await inspect(`${selectShell} > select`)).appearance, 'none');
  assert.ok(await evaluate(`(() => {
    const shell = document.querySelector('.side-nav .drawn-select');
    const select = shell.querySelector('select');
    const chevron = shell.querySelector('.drawn-select__chevron');
    return parseFloat(getComputedStyle(select).paddingInlineEnd) >= 36
      && getComputedStyle(chevron).pointerEvents === 'none'
      && chevron.getAttribute('aria-hidden') === 'true';
  })()`));
  await hover(selectShell);
  assert.ok(await evaluate(`(() => {
    const shell = document.querySelector('.side-nav .drawn-select');
    const rule = getComputedStyle(shell.querySelector('[data-select-value]'), '::after');
    return rule.content !== 'none' && decodeURIComponent(rule.maskImage).includes(${JSON.stringify(quietPath)})
      && rule.width === getComputedStyle(shell.querySelector('[data-select-value]')).width;
  })()`), 'select hover rule follows the selected-text mirror');
  await hover(selectShell, []);
  // Motion moves paint only, with a non-rotating panel/primary-button exception.
  await call('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  for (const selector of ['.copy-btn', '.share a', '.language-switcher a', '.slides .slide-nav button', selectShell, '.visual-toc > a', '.button-link', '.question button[type="submit"]', '.search-form .button-link']) {
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
  await call('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const menuToggle = '.site-head [data-drawer-toggle]';
  await hover(menuToggle, []);
  const restingMenu = await inspect(menuToggle);
  assert.equal(restingMenu.fill, restingMenu.tokens['accent-soft'], 'mobile menu blends into the header');
  await hover(menuToggle);
  assert.equal((await inspect(menuToggle)).fill, restingMenu.tokens['pebble-hover']);
  await hover(menuToggle, []);
  await evaluate(`document.querySelector('.site-head [data-drawer-toggle]').click()`);
  assert.ok(await evaluate(`(() => {
    const drawer = document.querySelector('[data-drawer]');
    const language = drawer.querySelector('.nav-language');
    const select = language.querySelector('select');
    return !drawer.hidden && language.parentElement.firstElementChild === language
      && select.getBoundingClientRect().width > 0 && language.querySelector('.lang-menu > .icon').getBoundingClientRect().width > 0
      && document.querySelector('label[for="drawer-language"]');
  })()`), 'mobile drawer keeps an accessible language picker above its TOC items');
  for (const selector of ['.theme-toggle--float', '.drawer-toggle-float']) {
    await hover(selector, []);
    const resting = await inspect(selector);
    assert.equal(resting.fill, resting.tokens.paper, 'drawer toggle blends into the paper surface');
    assert.ok(decodeURIComponent(resting.mask).includes(pebblePath));
    for (const pseudo of ['hover', 'focus-visible']) {
      await hover(selector, [pseudo]);
      const revealed = await inspect(selector);
      assert.equal(revealed.fill, resting.tokens['accent-soft']);
      assert.equal(revealed.background, transparent);
      if (pseudo === 'focus-visible') assert.equal(revealed.outline, 'solid');
    }
    await hover(selector, []);
  }
  for (const width of [320, 390]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    assert.ok(await evaluate(`(() => {
      const row = document.querySelector('.site-head-tools').getBoundingClientRect();
      const search = document.querySelector('.site-head .search-form--mini').getBoundingClientRect();
      return Math.abs(search.left - row.left) < 1 && Math.abs(search.right - row.right) < 1;
    })()`), `${width}px: navigation search fills the available mobile row`);
    for (const dir of ['ltr', 'rtl']) {
      await evaluate(`document.documentElement.dir = '${dir}'; Promise.all(document.querySelector('[data-drawer]').getAnimations().map(animation => animation.finished))`);
      const row = await evaluate(`(() => {
        const drawer = document.querySelector('[data-drawer]').getBoundingClientRect();
        const selectors = ['#drawer-language', '.theme-toggle--float', '.drawer-toggle-float'];
        const boxes = selectors.map(selector => {
          const box = document.querySelector(selector).getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, width: box.width, height: box.height };
        });
        return { drawer: {left:drawer.left, right:drawer.right}, boxes };
      })()`);
      assert.ok(row.boxes.every(box => box.width > 0 && box.height >= 44
        && Math.abs(box.top - row.boxes[0].top) < 1
        && box.left >= row.drawer.left && box.right <= row.drawer.right), `${width}px ${dir}: controls share the top row inside the drawer: ${JSON.stringify(row)}`);
      for (let a = 0; a < row.boxes.length; a++) for (let b = a + 1; b < row.boxes.length; b++) {
        assert.ok(row.boxes[a].right <= row.boxes[b].left || row.boxes[b].right <= row.boxes[a].left, 'drawer controls never overlap');
      }
    }
  }
  await evaluate(`document.documentElement.dir = 'ltr'`);
  await evaluate(`document.querySelector('.drawer-toggle-float').click()`);
  console.log('Desktop/sidebar and mobile/drawer language placement passed');
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  const chapterLoaded = new Promise(resolve => events.set('Page.loadEventFired', resolve));
  await call('Page.navigate', { url: `${site}/book/02-the-power-of-superblocks.html` });
  await chapterLoaded;
  await evaluate('document.fonts.ready');
  for (const direction of ['prev', 'next']) {
    const selector = `.pagination .${direction}`;
    for (const pseudo of ['hover', 'focus-visible']) {
      await hover(selector, []);
      await evaluate(`Promise.all(document.querySelector('${selector} > .icon').getAnimations().map(animation => animation.finished))`);
      const before = await evaluate(`(() => { const link=document.querySelector('${selector}'); const anchor=link.getBoundingClientRect(); const box=link.querySelector('[data-pagination-label]').getBoundingClientRect(); return {x:box.x-anchor.x,y:box.y-anchor.y,height:box.height}; })()`);
      await hover(selector, [pseudo]);
      await evaluate(`Promise.all(document.querySelector('${selector} > .icon').getAnimations().map(animation => animation.finished))`);
      const after = await evaluate(`(() => { const link=document.querySelector('${selector}'); const anchor=link.getBoundingClientRect(); const box=link.querySelector('[data-pagination-label]').getBoundingClientRect(); return {x:box.x-anchor.x,y:box.y-anchor.y,height:box.height,transform:getComputedStyle(link.querySelector('.icon')).transform}; })()`);
      assert.deepEqual({ x:after.x, y:after.y, height:after.height }, before, 'pagination labels never shift');
      const matrix = after.transform.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
      assert.equal(matrix[4], direction === 'prev' ? -4 : 4, `${direction}: arrow moves in its pointing direction`);
    }
    await hover(selector, []);
  }
  await call('Emulation.setEmulatedMedia', { media:'screen', features:[{ name:'prefers-reduced-motion', value:'reduce' }] });
  await hover('.pagination .next');
  const reducedArrow = await evaluate(`getComputedStyle(document.querySelector('.pagination .next > .icon')).transform`);
  assert.equal(Number(reducedArrow.match(/matrix\(([^)]+)\)/)[1].split(',')[4]), 0, 'reduced motion keeps the arrow stationary');
  console.log('Pagination arrow hover/focus motion, stationary labels and reduced motion passed');
} finally {
  await call('Page.close');
  socket.close();
}
