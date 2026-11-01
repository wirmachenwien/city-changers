// Measured fallback for controls, pagination-independent navigation and dynamic
// links. Server-labelled prose/pebble links paint in CSS and are never measured.
// Local absolute paint follows scrolling and sticky positioning.
const initialized = new WeakSet<Document>();
const buttonSelector = '.button-link, .copy-btn, .share-btn, .share a, .accordion-controls button, .slides .slide-nav button, .question button[type="submit"], .search-form button, .video-facade button, .last-visit-toast button, .language-switcher a, .visual-toc > a';
const selector = `a[href]:not([data-link-underline="pagination"]), ${buttonSelector}`;
type Line = { left: number; right: number; top: number; bottom: number };

export function underlineLines(rects: Iterable<Line>): Line[] {
  const lines: Line[] = [];
  for (const rect of [...rects].filter(rect => rect.right > rect.left && rect.bottom > rect.top).sort((a, b) => a.top - b.top || a.left - b.left)) {
    const line = lines.find(line => Math.abs(line.bottom - rect.bottom) < 3 && rect.left <= line.right + 3);
    if (line) {
      line.left = Math.min(line.left, rect.left);
      line.right = Math.max(line.right, rect.right);
      line.top = Math.min(line.top, rect.top);
      line.bottom = Math.max(line.bottom, rect.bottom);
    } else lines.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
  }
  return lines;
}

export function initLinkUnderlines(): void {
  if (initialized.has(document) || !('ResizeObserver' in window) || !window.CSS?.supports('mask-image', 'url("")')) return;
  if (typeof document.createRange().getClientRects !== 'function') return;
  initialized.add(document);
  const active = new Set<HTMLElement>();
  const paint = new Map<HTMLElement, HTMLElement>();
  const geometry = new WeakMap<HTMLElement, string>();
  const dirty = new Set<HTMLElement>();
  let queued = false;

  function clear(link: HTMLElement): void {
    paint.get(link)?.remove();
    paint.delete(link);
    geometry.delete(link);
    delete link.dataset.linkRule;
    delete link.dataset.linkRulePosition;
  }
  function draw(link: HTMLElement): void {
    if (!link.isConnected) return;
    const style = getComputedStyle(link);
    if (link.matches(buttonSelector) && link.dataset.linkUnderline !== 'button') link.dataset.linkUnderline = 'button';
    const declared = ['hover', 'button'].includes(link.dataset.linkUnderline ?? '');
    if ((!declared && !style.textDecorationLine.includes('underline')) || ['dotted', 'dashed', 'double'].includes(style.textDecorationStyle)) {
      clear(link);
      return;
    }
    const rects: DOMRect[] = [];
    const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim() || node.parentElement?.closest('[aria-hidden="true"], [hidden], .visually-hidden, .external-link-notice, svg, script, style')) continue;
      range.selectNodeContents(node);
      rects.push(...range.getClientRects());
    }
    const lines = underlineLines(rects);
    if (!lines.length) { clear(link); return; }
    const left = Math.min(...lines.map(line => line.left));
    const top = Math.min(...lines.map(line => line.top));
    // Ignore viewport movement: local paint already travels with its link.
    // Reading unchanged geometry must not rebuild DOM or force another layout.
    const signature = JSON.stringify(lines.map(line => [line.left - left, line.right - left, line.top - top, line.bottom - top].map(value => Math.round(value * 100) / 100)));
    if (paint.has(link) && geometry.get(link) === signature) return;
    let layer = paint.get(link);
    if (!layer) {
      layer = document.createElement('span');
      layer.className = 'drawn-link-rule';
      layer.setAttribute('aria-hidden', 'true');
      paint.set(link, layer);
    }
    if (layer.parentElement !== link) link.append(layer);
    if (style.position === 'static') link.dataset.linkRulePosition = '';
    // Hover-only paint is display:none at rest. Give it a real, invisible box
    // during measurement; a hidden box reports viewport (0,0), not its origin.
    layer.style.visibility = 'hidden';
    layer.style.display = 'block';
    layer.style.left = '0px';
    layer.style.top = '0px';
    const origin = layer.getBoundingClientRect();
    layer.style.left = `${left - origin.left}px`;
    layer.style.top = `${top - origin.top}px`;
    layer.replaceChildren(...lines.map(line => {
      const stroke = document.createElement('span');
      stroke.style.left = `${line.left - left}px`;
      stroke.style.top = `${line.bottom - top - 5}px`;
      stroke.style.width = `${line.right - line.left}px`;
      return stroke;
    }));
    link.dataset.linkRule = '';
    layer.style.removeProperty('display');
    layer.style.removeProperty('visibility');
    geometry.set(link, signature);
  }
  function schedule(links: Iterable<HTMLElement> = active): void {
    for (const link of links) if (active.has(link)) dirty.add(link);
    if (!dirty.size) return;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const changed = [...dirty];
      dirty.clear();
      for (const link of changed) if (active.has(link)) draw(link);
    });
  }
  let pageWidth: number | undefined;
  const sizes = new ResizeObserver(entries => {
    for (const entry of entries) {
      if (entry.target === document.body) {
        // Accordion folds change page height every frame, not text wrapping.
        if (entry.contentRect.width !== pageWidth) {
          pageWidth = entry.contentRect.width;
          schedule();
        }
      } else schedule([entry.target as HTMLElement]);
    }
  });
  sizes.observe(document.body);
  function candidates(root: ParentNode): HTMLElement[] {
    const links = [...root.querySelectorAll<HTMLElement>(selector)];
    if (root instanceof HTMLElement && root.matches(selector)) links.unshift(root);
    return links.filter(link => !link.hasAttribute('data-css-underline'));
  }
  function scan(root: ParentNode): void {
    const links = candidates(root);
    for (const link of links) if (!active.has(link)) {
      active.add(link);
      sizes.observe(link);
    }
    schedule(links);
  }
  scan(document);
  new MutationObserver(records => {
    for (const record of records) {
      const parent = record.target instanceof HTMLElement ? record.target : record.target.parentElement;
      // Ignore decorative writes, including the insertion/removal of a layer.
      if (parent?.closest('.drawn-link-rule, .pagination__rules')) continue;
      const contentNodes = [...record.addedNodes, ...record.removedNodes]
        .filter(node => !(node instanceof HTMLElement && node.matches('.drawn-link-rule, .pagination__rules')));
      if (record.type !== 'characterData' && !contentNodes.length) continue;
      const owner = parent?.closest<HTMLElement>(selector);
      if (owner) schedule([owner]);
      for (const node of record.addedNodes) {
        if (node instanceof HTMLElement && node.isConnected && contentNodes.includes(node)) scan(node);
      }
      for (const node of record.removedNodes) {
        if (!(node instanceof HTMLElement) || !contentNodes.includes(node)) continue;
        for (const link of candidates(node)) if (!link.isConnected && active.delete(link)) {
          sizes.unobserve(link);
          dirty.delete(link);
          clear(link);
        }
      }
    }
  }).observe(document.body, { childList: true, characterData: true, subtree: true });
  for (const event of ['pointerover', 'pointerout', 'focusin', 'focusout']) {
    document.addEventListener(event, event => {
      const link = event.target instanceof Element ? event.target.closest<HTMLElement>(selector) : null;
      if (link?.hasAttribute('data-css-underline')) return;
      // Declared ancillary links are prepared ahead of hover. CSS switches
      // their paint immediately, without even a one-frame native-line flash.
      if (link && !link.dataset.linkUnderline) schedule([link]);
    });
  }
  // Closed details cannot be measured. Refresh just the revealed/hidden links,
  // once per toggle, rather than following the height animation frame by frame.
  document.addEventListener('toggle', event => {
    if (event.target instanceof Element && event.target.matches('details')) {
      schedule(event.target.querySelectorAll<HTMLElement>(selector));
    }
  }, true);
  window.addEventListener('resize', () => schedule());
  document.fonts?.ready.then(() => schedule());
}
