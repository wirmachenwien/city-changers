// Reveal a full-viewport stroke without scaling its hand-drawn geometry.
const initialized = new WeakSet<HTMLElement>();

export function initReadingProgress(): void {
  const bar = document.querySelector<HTMLElement>('[data-reading-progress]');
  if (!bar || initialized.has(bar)) return;
  initialized.add(bar);
  bar.hidden = false;
  const paint = (): void => {
    const total = document.documentElement.scrollHeight - innerHeight;
    const ratio = total > 0 ? Math.min(1, Math.max(0, scrollY / total)) : 0;
    bar.style.setProperty('--reading-progress', `${ratio * 100}%`);
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
