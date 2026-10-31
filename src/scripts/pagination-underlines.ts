// Pagination is a component-owned enhancement, independent of the global link
// initializer. Range returns the actual text fragments, not the flex-item box.
const initialized = new WeakSet<Document>();

export function initPaginationUnderlines(): void {
  if (initialized.has(document) || typeof document.createRange().getClientRects !== 'function') return;
  initialized.add(document);
  const labels = [...document.querySelectorAll<HTMLElement>('.pagination [data-pagination-label]')];
  if (!labels.length) return;
  const paint = new WeakMap<HTMLElement, { layer: HTMLElement; signature: string }>();
  const dirty = new Set<HTMLElement>();
  let queued = false;

  function draw(label: HTMLElement): void {
    const text = label.querySelector<HTMLElement>('[data-pagination-text]');
    const link = label.closest<HTMLElement>('a');
    if (!text || !link || !label.isConnected) return;
    const box = label.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(text);
    const lines = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0)
      .map(rect => ({ left: rect.left - box.left, top: rect.bottom - box.top, width: rect.width }));
    if (!lines.length) return;
    const signature = JSON.stringify(lines);
    if (paint.get(label)?.signature === signature) return;
    const layer = paint.get(label)?.layer ?? document.createElement('span');
    layer.className = 'pagination__rules';
    layer.setAttribute('aria-hidden', 'true');
    layer.replaceChildren(...lines.map(line => {
      const stroke = document.createElement('span');
      stroke.style.left = `${line.left}px`;
      stroke.style.top = `${line.top}px`;
      stroke.style.width = `${line.width}px`;
      return stroke;
    }));
    if (layer.parentElement !== label) label.append(layer);
    paint.set(label, { layer, signature });
    link.dataset.paginationReady = '';
  }
  function schedule(changed: Iterable<HTMLElement> = labels): void {
    for (const label of changed) dirty.add(label);
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const pending = [...dirty];
      dirty.clear();
      pending.forEach(draw);
    });
  }
  if ('ResizeObserver' in window) {
    const sizes = new ResizeObserver(entries => schedule(entries.map(entry => entry.target as HTMLElement)));
    labels.forEach(label => sizes.observe(label));
  }
  schedule();
  window.addEventListener('resize', () => schedule());
  document.fonts?.ready.then(() => schedule());
}
