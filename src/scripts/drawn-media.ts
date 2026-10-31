// Boxes/controls are CSS-only. Measurement is reserved for exact media clipping.
import { framePath } from '../../design/elements/geometry.js';

const initialized = new WeakSet<Document>();
const ns = 'http://www.w3.org/2000/svg';
type Drawing = { svg: SVGSVGElement; path: SVGPathElement; stage: HTMLElement };

export function initDrawnMedia(): void {
  if (!('ResizeObserver' in window) || !window.CSS?.supports('mask-image', 'url("")') || initialized.has(document)) return;
  initialized.add(document);
  const cache = new WeakMap<HTMLElement, Drawing>();
  const active = new Map<HTMLElement, Drawing>();

  function paint(box: HTMLElement): void {
    const drawing = active.get(box);
    if (!drawing || !box.isConnected) return;
    const { width, height } = drawing.svg.getBoundingClientRect();
    if (width < 8 || height < 8) return;
    const path = framePath(width, height);
    drawing.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    drawing.path.setAttribute('d', path);
    drawing.stage.style.clipPath = `path('${path}')`;
    box.classList.add('drawn-ready');
  }
  const sizes = new ResizeObserver(entries => entries.forEach(entry => paint(entry.target as HTMLElement)));

  function enhance(box: HTMLElement): void {
    if (active.has(box)) return;
    let drawing = cache.get(box);
    if (!drawing) {
      const stage = box.querySelector<HTMLElement>(':scope > .figure__stage');
      if (!stage) return;
      const svg = document.createElementNS(ns, 'svg');
      svg.classList.add('drawn-outline');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      const path = document.createElementNS(ns, 'path');
      svg.append(path);
      box.append(svg);
      drawing = { svg, path, stage };
      cache.set(box, drawing);
    }
    active.set(box, drawing);
    sizes.observe(box);
    paint(box);
  }
  function candidates(root: ParentNode): HTMLElement[] {
    const boxes = [...root.querySelectorAll<HTMLElement>('.figure__media')];
    if (root instanceof HTMLElement && root.matches('.figure__media')) boxes.unshift(root);
    return boxes;
  }
  function scan(root: ParentNode): void {
    // Legacy/raw HTML images get the same media-only wrappers as Figure.astro.
    const figures = [...root.querySelectorAll<HTMLElement>('.figure')];
    if (root instanceof HTMLElement && root.matches('.figure')) figures.unshift(root);
    for (const figure of figures) {
      if (figure.querySelector(':scope > .figure__media')) continue;
      const image = figure.querySelector(':scope > img, :scope > picture');
      if (!image) continue;
      const media = document.createElement('div');
      media.className = 'figure__media';
      const stage = document.createElement('div');
      stage.className = 'figure__stage';
      image.before(media);
      stage.append(image);
      media.append(stage);
    }
    candidates(root).forEach(enhance);
  }
  scan(document);
  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) if (node instanceof HTMLElement && node.isConnected) scan(node);
      for (const node of record.removedNodes) if (node instanceof HTMLElement) {
        for (const box of candidates(node)) if (!box.isConnected) {
          sizes.unobserve(box);
          active.delete(box);
        }
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}
