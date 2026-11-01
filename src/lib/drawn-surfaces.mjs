// One actual-size path per surface: no independently rasterized tile joins.
// Plain ESM is shared by Astro and the standalone element library.
import { framePath, compactPath, bubblePath } from '../../design/elements/geometry.js';

const initialized = new WeakSet();
const ns = 'http://www.w3.org/2000/svg';
export const surfaceSelector = '.accordion, .question, .visual-toc > a, .license-box, .mascot-box__bubble, .showcase-demo, .showcase-icons > li, .content-popup, .last-visit-toast, .drawn-scroll-shell, .figure__media, .button-link, .accordion-controls button, .question button[type="submit"], .search-form button:not(.search-submit), .search-box, .shape, .spoiler-text';
const compactSelector = '.button-link, .accordion-controls button, .question button[type="submit"], .search-form button, .search-box, .shape[data-shape="compact"], .spoiler-text';

export function initDrawnSurfaces() {
  if (initialized.has(document) || !window.ResizeObserver || !window.CSS?.supports('mask-image', 'url("")')) return;
  initialized.add(document);
  const active = new Map(), cache = new WeakMap(), headers = new Map(), pending = new Set();
  let frame = 0, sequence = 0;
  const svgNode = (tag, attributes = {}) => {
    const node = document.createElementNS(ns, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    return node;
  };
  function schedule(host) {
    pending.add(host);
    if (!frame) frame = window.requestAnimationFrame(flush);
  }
  function flush() {
    frame = 0;
    // Read all layout before writing any geometry or readiness classes.
    const measurements = [...pending].map(host => {
      const drawing = active.get(host);
      if (!drawing || !host.isConnected) return null;
      const box = drawing.svg.getBoundingClientRect();
      return { host, drawing, box, headerEnd: drawing.header ? drawing.header.getBoundingClientRect().bottom - box.top : 0,
        top: host.dataset.tail === 'top' || (host.matches('.mascot-box__bubble') && window.matchMedia('(max-width: 30rem)').matches),
        rtl: window.getComputedStyle(host).direction === 'rtl' };
    });
    pending.clear();
    for (const measurement of measurements) {
      if (!measurement) continue;
      const { host, drawing, box, headerEnd, top, rtl } = measurement;
      const { width, height } = box;
      if (width < 8 || height < 8) continue;
      const bubble = host.matches('.mascot-box__bubble, .shape[data-shape="bubble"]');
      const compact = host.matches(compactSelector);
      const signature = `${width}/${height}/${bubble}/${compact}/${top}/${rtl}/${headerEnd}`;
      if (drawing.signature === signature) continue;
      drawing.signature = signature;
      const path = bubble ? bubblePath(width, height, top) : compact ? compactPath(width, height) : framePath(width, height);
      drawing.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      drawing.path.setAttribute('d', path);
      drawing.path.setAttribute('stroke-width', bubble || compact ? '2' : '1.5');
      drawing.path.setAttribute('transform', bubble && rtl && !top ? `translate(${width} 0) scale(-1 1)` : '');
      if (drawing.stops) {
        const end = Math.max(0, Math.min(1, headerEnd / height));
        drawing.stops.forEach(stop => stop.setAttribute('offset', end));
      }
      if (drawing.stage) drawing.stage.style.clipPath = `path('${path}')`;
      host.classList.add('drawn-ready');
    }
  }
  const observer = new window.ResizeObserver(entries => {
    for (const { target } of entries) schedule(headers.get(target) || target);
  });
  function syncHeader(host, drawing) {
    const header = host.querySelector(':scope > .table-scroll thead');
    if (drawing.header === header) return;
    if (drawing.header) { observer.unobserve(drawing.header); headers.delete(drawing.header); }
    drawing.header = header;
    drawing.signature = null;
    if (header) {
      if (!drawing.stops) {
        const id = `drawn-header-${++sequence}`;
        const defs = svgNode('defs'), gradient = svgNode('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: '0', y1: '0', x2: '0', y2: '100%' });
        drawing.stops = [svgNode('stop', { 'stop-color': 'var(--panel)' }), svgNode('stop', { 'stop-color': 'var(--panel)', 'stop-opacity': '0' })];
        drawing.gradientId = id;
        gradient.append(...drawing.stops);
        defs.append(gradient);
        drawing.svg.prepend(defs);
      }
      drawing.path.style.fill = `url(#${drawing.gradientId})`;
      headers.set(header, host);
      observer.observe(header);
    } else drawing.path.style.removeProperty('fill');
    schedule(host);
  }
  function wire(host) {
    if (active.has(host)) return;
    let drawing = cache.get(host);
    if (!drawing) {
      const svg = svgNode('svg', { class: 'drawn-surface', 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'none' });
      const path = svgNode('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      drawing = { svg, path, stage: host.querySelector(':scope > .figure__stage') };
      svg.append(path);
      (host.querySelector(':scope > summary > .drawn-frame') || host).prepend(svg);
      cache.set(host, drawing);
    }
    active.set(host, drawing);
    observer.observe(host);
    syncHeader(host, drawing);
    if (drawing.header) { headers.set(drawing.header, host); observer.observe(drawing.header); }
    schedule(host);
  }
  function scan(root) {
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.matches?.(surfaceSelector)) wire(root);
    root.querySelectorAll(surfaceSelector).forEach(wire);
  }
  scan(document);
  new window.MutationObserver(records => {
    let removed = false;
    for (const record of records) {
      if (record.target.closest?.('.drawn-surface')) continue;
      if (record.type === 'attributes') {
        if (record.attributeName === 'dir') active.forEach((_, host) => schedule(host));
        else if (active.has(record.target)) schedule(record.target);
      } else {
        record.addedNodes.forEach(scan);
        removed ||= record.removedNodes.length > 0;
        const shell = record.target.closest?.('.drawn-scroll-shell');
        if (shell && active.has(shell)) syncHeader(shell, active.get(shell));
      }
    }
    if (!removed) return;
    for (const [host, drawing] of active) {
      if (host.isConnected) continue;
      observer.unobserve(host);
      if (drawing.header) { observer.unobserve(drawing.header); headers.delete(drawing.header); }
      active.delete(host);
      pending.delete(host);
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'open', 'dir', 'data-tail'] });
  // A bubble can cross the tail breakpoint without changing its own size.
  window.matchMedia('(max-width: 30rem)').addEventListener('change', () => active.forEach((_, host) => schedule(host)));
}
