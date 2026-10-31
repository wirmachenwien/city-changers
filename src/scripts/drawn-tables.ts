// Measure header height only. The background uses the exact same CSS nine-slice
// mask as its outer frame, never a clip on table content or the scroll viewport.
const initialized = new WeakSet<Document>();
type Surface = { header: HTMLElement; paint: HTMLElement };

export function initDrawnTables(): void {
  if (!('ResizeObserver' in window) || !window.CSS?.supports('mask-image', 'url("")') || initialized.has(document)) return;
  initialized.add(document);
  const active = new Map<HTMLElement, Surface>();
  const owners = new Map<HTMLElement, HTMLElement>();

  function paint(shell: HTMLElement): void {
    const surface = active.get(shell);
    if (!surface || !shell.isConnected) return;
    const box = shell.getBoundingClientRect();
    const bottom = surface.header.getBoundingClientRect().bottom - box.top;
    if (box.width < 8 || box.height < 8 || !Number.isFinite(bottom) || bottom <= 0) return;
    surface.paint.style.setProperty('--drawn-header-end', `${Math.min(box.height, bottom)}px`);
    shell.classList.add('drawn-table-ready');
  }
  const sizes = new ResizeObserver(entries => {
    const changed = new Set<HTMLElement>();
    for (const entry of entries) {
      const owner = owners.get(entry.target as HTMLElement);
      if (owner) changed.add(owner);
    }
    changed.forEach(paint);
  });

  function release(shell: HTMLElement): void {
    const surface = active.get(shell);
    if (!surface) return;
    for (const node of [shell, surface.header]) {
      sizes.unobserve(node);
      owners.delete(node);
    }
    active.delete(shell);
    shell.classList.remove('drawn-table-ready');
    surface.paint.remove();
  }
  function enhance(shell: HTMLElement): void {
    const header = shell.querySelector<HTMLElement>(':scope > .table-scroll > table > thead');
    if (active.get(shell)?.header !== header) release(shell);
    if (!header) return;
    if (!active.has(shell)) {
      const decoration = document.createElement('span');
      decoration.className = 'drawn-table-surface';
      decoration.setAttribute('aria-hidden', 'true');
      active.set(shell, { header, paint: decoration });
      shell.append(decoration);
      for (const node of [shell, header]) {
        owners.set(node, shell);
        sizes.observe(node);
      }
    }
    paint(shell);
  }
  function shells(root: ParentNode): HTMLElement[] {
    const nodes = [...root.querySelectorAll<HTMLElement>('.drawn-scroll-shell')];
    if (root instanceof HTMLElement && root.matches('.drawn-scroll-shell')) nodes.unshift(root);
    return nodes;
  }
  shells(document).forEach(enhance);
  new MutationObserver(records => {
    for (const record of records) {
      // Reconcile headers inserted/replaced inside an already mounted table.
      const owner = record.target instanceof HTMLElement ? record.target.closest<HTMLElement>('.drawn-scroll-shell') : null;
      if (owner?.isConnected) enhance(owner);
      for (const node of record.addedNodes) if (node instanceof HTMLElement && node.isConnected) shells(node).forEach(enhance);
      for (const node of record.removedNodes) if (node instanceof HTMLElement) {
        for (const shell of shells(node)) if (!shell.isConnected) release(shell);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}
