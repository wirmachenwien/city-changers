// Select artwork by the full box height; decoration never changes its layout.
const initialized = new WeakSet<Document>();

export function initFeatureBrackets(): void {
  if (!('ResizeObserver' in window) || initialized.has(document)) return;
  initialized.add(document);
  const active = new Set<HTMLElement>();
  const selector = '.feature-box[data-tone]';

  function paint(box: HTMLElement): void {
    if (!box.isConnected) return;
    const height = box.getBoundingClientRect().height;
    if (!Number.isFinite(height) || height <= 0) return;
    const size = height < 80 ? 'short' : height < 136 ? 'medium' : 'tall';
    if (box.dataset.bracketSize !== size) box.dataset.bracketSize = size;
  }
  const observer = new ResizeObserver(entries => {
    for (const { target } of entries) if (active.has(target as HTMLElement)) paint(target as HTMLElement);
  });
  function boxes(root: ParentNode): HTMLElement[] {
    const matches = [...root.querySelectorAll<HTMLElement>(selector)];
    if (root instanceof HTMLElement && root.matches(selector)) matches.unshift(root);
    return matches;
  }
  function enhance(box: HTMLElement): void {
    if (active.has(box) || !box.querySelector('.feature-box__bracket')) return;
    active.add(box);
    observer.observe(box);
    paint(box);
  }
  boxes(document).forEach(enhance);
  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof HTMLElement && node.isConnected) boxes(node).forEach(enhance);
      }
      for (const node of record.removedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        for (const box of boxes(node)) {
          if (box.isConnected || !active.delete(box)) continue;
          observer.unobserve(box);
          delete box.dataset.bracketSize;
        }
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}
