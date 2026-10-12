// Navigation drawer (modeless sheet). The sheet covers the sticky
// masthead when open; the body-level floating toggle pins at the header
// hamburger's exact spot while the sheet slides in underneath, doubling
// as the close control. Both toggles share data-drawer-toggle and morph
// between menu and close icons via the aria-expanded state kept in sync
// below. A plain div is used instead of <dialog> on purpose: open dialogs
// render in the top layer, above any z-index.
export function initDrawer(): void {
  const drawer = document.querySelector<HTMLElement>('[data-drawer]');
  const backdrop = document.querySelector<HTMLElement>('[data-drawer-backdrop]');
  const toggles = document.querySelectorAll<HTMLElement>('[data-drawer-toggle]');
  if (!drawer || toggles.length === 0) return;
  // Page behind the sheet: hidden from keyboard and assistive tech
  // while the drawer is open. The header stays out of this except for
  // the toggle itself, which remains the visible close control.
  const page = [...document.querySelectorAll<HTMLElement>('.shell, .site-footer, .brand, .site-head-tools')];

  const setExpanded = (open: boolean): void => {
    for (const toggle of toggles) toggle.setAttribute('aria-expanded', String(open));
  };

  const isOpen = (): boolean => !drawer.hasAttribute('hidden');

  const close = (): void => {
    if (!isOpen()) return;
    drawer.setAttribute('hidden', '');
    backdrop?.setAttribute('hidden', '');
    document.body.classList.remove('drawer-open');
    for (const landmark of page) landmark.removeAttribute('inert');
    setExpanded(false);
    toggles[0]?.focus({ preventScroll: true });
  };

  const open = (): void => {
    if (isOpen()) return;
    drawer.removeAttribute('hidden');
    backdrop?.removeAttribute('hidden');
    document.body.classList.add('drawer-open');
    for (const landmark of page) landmark.setAttribute('inert', '');
    setExpanded(true);
    // Focus the dialog itself (tabindex="-1", outline suppressed in CSS)
    // so assistive tech enters it without flashing a focus ring on the
    // first link for pointer/touch users.
    drawer.focus({ preventScroll: true });
  };

  for (const toggle of toggles) {
    toggle.addEventListener('click', () => {
      if (isOpen()) close();
      else open();
    });
  }
  backdrop?.addEventListener('click', close);
  // Links inside the sheet navigate away (page reload discards the sheet
  // anyway) or — for same-page targets like drawer bookmarks — scroll in
  // place via pushState, which would otherwise leave the sheet open over
  // the target. Dismiss on any drawer link click.
  drawer.addEventListener('click', (event) => {
    if ((event.target as Element | null)?.closest('a')) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  // A resize past the mobile breakpoint strands an open sheet over the
  // side navigation: close it instead.
  const wide = window.matchMedia('(min-width: 60rem)');
  wide.addEventListener('change', (event) => {
    if (event.matches) close();
  });
}
