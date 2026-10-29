// Shared, non-modal explanatory popups for definitions and footnotes.
// Fixed positioning is recalculated from the trigger on every scroll frame.
import { iconSvg } from '../lib/icons.ts';
interface PopupOptions {
  content: () => string | Node;
  label: string;
  closeLabel: string;
  action?: { href: string; label: string };
  onToggle?: (open: boolean) => void;
}

let nextId = 0;
interface PopupState {
  trigger: HTMLElement;
  pinned: boolean;
  close: (restoreFocus?: boolean) => void;
  pin: () => void;
  cancelDismiss: () => void;
  dismissPreview: () => void;
}
const openPopups = new Map<HTMLElement, PopupState>();
let preview: PopupState | undefined;

export function bindContentPopup(trigger: HTMLElement, options: PopupOptions): void {
  const id = `content-popup-${++nextId}`;
  const describedBy = trigger.getAttribute('aria-describedby');
  trigger.removeAttribute('title');
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');

  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    const existing = openPopups.get(trigger);
    if (existing) {
      existing.pin();
      return;
    }
    open(true);
  });
  trigger.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'touch') return;
    const existing = openPopups.get(trigger);
    if (existing) existing.cancelDismiss();
    else open(false);
  });
  trigger.addEventListener('pointerleave', () => {
    openPopups.get(trigger)?.dismissPreview();
  });

  function restoreDescription(): void {
    if (describedBy) trigger.setAttribute('aria-describedby', describedBy);
    else trigger.removeAttribute('aria-describedby');
  }

  function open(pinned: boolean): void {
    preview?.close();

    const popup = document.createElement('div');
    popup.id = id;
    popup.className = pinned ? 'content-popup' : 'content-popup content-popup--preview';
    // Hover cards with a navigation action are non-modal dialogs rather
    // than ARIA tooltips, which must not contain interactive controls.
    popup.setAttribute('role', pinned || options.action ? 'dialog' : 'tooltip');
    if (pinned || options.action) popup.setAttribute('aria-label', options.label);
    const closer = document.createElement('button');
    closer.type = 'button';
    closer.className = 'content-popup-close';
    closer.hidden = !pinned;
    closer.setAttribute('aria-label', options.closeLabel);
    closer.innerHTML = `<span class="content-popup-close-face">${iconSvg('x')}</span>`;
    const body = document.createElement('div');
    body.className = 'content-popup-body';
    body.append(options.content());
    if (options.action) {
      const jump = document.createElement('a');
      jump.className = 'content-popup-action';
      jump.href = options.action.href;
      jump.setAttribute('aria-label', options.action.label);
      jump.addEventListener('click', (event) => {
        event.preventDefault();
        const href = jump.href;
        close();
        window.location.assign(href);
      });
      // Downward counterpart of the footnote's corner-up-left backlink.
      jump.innerHTML = iconSvg('footnote-down');
      body.append(' ', jump);
    }
    popup.append(closer, body);
    document.body.append(popup);

    let frame: number | undefined;
    let observer: ResizeObserver | undefined;
    let anchorOffset: { top: number; left: number } | undefined;
    let placementDirty = true;
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;
    function cancelDismiss(): void {
      clearTimeout(dismissTimer);
      dismissTimer = undefined;
    }
    function dismissPreview(): void {
      if (pinned) return;
      cancelDismiss();
      // Bridge the gap between the trigger and popup so the text is hoverable.
      dismissTimer = setTimeout(() => close(), 150);
    }
    function pin(): void {
      cancelDismiss();
      if (pinned) {
        closer.focus({ preventScroll: true });
        return;
      }
      pinned = true;
      state.pinned = true;
      if (preview === state) preview = undefined;
      popup.className = 'content-popup';
      popup.setAttribute('role', 'dialog');
      popup.setAttribute('aria-label', options.label);
      closer.hidden = false;
      restoreDescription();
      trigger.setAttribute('aria-expanded', 'true');
      trigger.setAttribute('aria-controls', id);
      options.onToggle?.(true);
      position();
      if (popup.isConnected) closer.focus({ preventScroll: true });
    }
    function close(restoreFocus = false): void {
      cancelDismiss();
      if (frame !== undefined) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', layoutChanged);
      document.removeEventListener('keydown', escape);
      popup.remove();
      trigger.setAttribute('aria-expanded', 'false');
      trigger.removeAttribute('aria-controls');
      restoreDescription();
      options.onToggle?.(false);
      openPopups.delete(trigger);
      if (preview === state) preview = undefined;
      if (restoreFocus) trigger.focus({ preventScroll: true });
    }

    function position(): void {
      frame = undefined;
      const rect = trigger.getBoundingClientRect();
      const viewport = document.documentElement;
      const navbarBottom = Math.max(0, document.querySelector('.site-head')?.getBoundingClientRect().bottom ?? 0);
      const outsideViewport = rect.bottom <= navbarBottom || rect.top >= viewport.clientHeight ||
        rect.right <= 0 || rect.left >= viewport.clientWidth;
      if (!trigger.isConnected || rect.width === 0 || rect.height === 0 ||
          (!pinned && outsideViewport)) {
        close();
        return;
      }
      const gap = 8;
      // Reserve the close control's space even while hidden in a hover
      // preview, so revealing it never shifts or resizes the popup.
      const corner = parseFloat(getComputedStyle(closer).inlineSize) / 2;
      const column = trigger.closest('[data-prose], .prose') ?? trigger.closest('main');
      const bounds = column?.getBoundingClientRect();
      const minLeft = Math.max(gap + corner, bounds?.left ?? gap + corner);
      const maxRight = Math.min(viewport.clientWidth - gap - corner, bounds?.right ?? viewport.clientWidth - gap - corner);
      popup.style.maxInlineSize = `min(20rem, ${Math.max(0, maxRight - minLeft)}px)`;
      const minTop = navbarBottom + gap + corner;
      const maxBottom = viewport.clientHeight - gap;
      popup.style.maxBlockSize = `${Math.max(0, maxBottom - minTop)}px`;
      const size = popup.getBoundingClientRect();
      const anchorGap = 3;
      const below = rect.bottom + anchorGap;
      const above = rect.top - anchorGap - size.height;
      const preferred = below + size.height <= maxBottom ? below : above;
      let left = Math.max(minLeft, Math.min(rect.left, maxRight - size.width));
      let top = Math.max(minTop, Math.min(preferred, maxBottom - size.height));
      if (pinned) {
        // Fit once, then travel with the term, even beyond the viewport. Do
        // not clamp on scroll: that would make the popup stick to the navbar.
        if (!anchorOffset || (placementDirty && !outsideViewport)) {
          anchorOffset = { top: top - rect.top, left: left - rect.left };
        }
        top = rect.top + anchorOffset.top;
        left = rect.left + anchorOffset.left;
      }
      // Pinned cards still follow their reference vertically, but may never
      // drift into the sidebar or bookmark gutter as the layout changes.
      left = Math.max(minLeft, Math.min(left, maxRight - size.width));
      placementDirty = false;
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
    }

    function schedule(): void {
      if (frame === undefined) frame = requestAnimationFrame(position);
    }
    function layoutChanged(): void {
      placementDirty = true;
      schedule();
    }
    function onScroll(event: Event): void {
      if (event.target instanceof Node && popup.contains(event.target)) return;
      schedule();
    }
    function escape(event: KeyboardEvent): void {
      if (!pinned && event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    }

    const state = { trigger, pinned, close, pin, cancelDismiss, dismissPreview };
    openPopups.set(trigger, state);
    if (!pinned) preview = state;
    if (pinned || options.action) {
      trigger.setAttribute('aria-expanded', 'true');
      trigger.setAttribute('aria-controls', id);
      if (pinned) options.onToggle?.(true);
    }
    if (!pinned) {
      trigger.setAttribute('aria-describedby', [describedBy, id].filter(Boolean).join(' '));
    }
    popup.addEventListener('pointerenter', cancelDismiss);
    popup.addEventListener('pointerleave', dismissPreview);
    closer.addEventListener('click', () => close(true));
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', layoutChanged);
    document.addEventListener('keydown', escape);
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(layoutChanged);
      observer.observe(trigger);
      observer.observe(popup);
      const column = trigger.closest('[data-prose], .prose') ?? trigger.closest('main');
      if (column) observer.observe(column);
      const header = document.querySelector('.site-head');
      if (header) observer.observe(header);
    }
    position();
    if (pinned && popup.isConnected) closer.focus({ preventScroll: true });
  }
}
