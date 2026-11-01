// Share one paint value between the hand-drawn stroke and its overscroll
// continuation. The same scheduler also selects edge colors on non-book pages.
const initialized = new WeakSet<Document>();

export function initReadingProgress(): void {
  const bar = document.querySelector<HTMLElement>('[data-reading-progress]');
  if (initialized.has(document)) return;
  initialized.add(document);
  const root = document.documentElement;
  if (bar) bar.hidden = false;
  const paint = (): void => {
    const total = root.scrollHeight - innerHeight;
    const ratio = total > 0 ? Math.min(1, Math.max(0, scrollY / total)) : 0;
    const scrollable = String(total > 0);
    if (root.dataset.scrollable !== scrollable) root.dataset.scrollable = scrollable;
    const edge = (total > 0 ? ratio > 0.5 : scrollY > 0) ? 'footer' : 'header';
    if (root.dataset.scrollEdge !== edge) root.dataset.scrollEdge = edge;
    if (bar) {
      const progress = `${ratio * 100}%`;
      if (root.style.getPropertyValue('--reading-progress') !== progress) {
        root.style.setProperty('--reading-progress', progress);
      }
    }
  };
  let queued = false;
  const schedule = (): void => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; paint(); });
  };
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  if ('ResizeObserver' in window) new ResizeObserver(schedule).observe(document.body);
  paint();
}
