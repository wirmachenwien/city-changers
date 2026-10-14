// While the viewport resizes, reflowing layout under a stationary cursor
// strobes :hover states, so hover-revealed controls (skill edit/delete,
// add rows, pencils, remove buttons) flicker and replay their animations.
// Mark the root during active resizing so CSS can freeze hover
// hit-testing until the layout settles. Keyboard focus is unaffected.
const RESIZE_CLASS = 'is-resizing';
const SETTLE_DELAY = 300;

export function initResizeGuard(): void {
  let timer: number | undefined;
  window.addEventListener(
    'resize',
    () => {
      document.documentElement.classList.add(RESIZE_CLASS);
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        document.documentElement.classList.remove(RESIZE_CLASS);
        timer = undefined;
      }, SETTLE_DELAY);
    },
    { passive: true },
  );
}
