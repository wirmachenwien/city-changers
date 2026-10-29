// Reading bookmarks + last-visit toast, stored in localStorage.
//
// Book pages render a bookmark gutter directly next to the text
// (see BookmarkAdd.astro): one pending pin follows the mouse vertically,
// snaps to the nearest text line and highlights it; clicking pins a saved
// bookmark to that line. Saved pins swap their icon to an x icon on hover and
// delete on click. The sidebar lists stay in sync via renderBookmarkLists.
import { DEFAULT_LANG } from '../lib/site';
import { languages, type Language } from '../data/locales';
import { t } from '../lib/i18n';
import { bookmarkExcerpt, plainBookmarkText } from '../lib/bookmark-title';
const VISITS_KEY = 'toolbox.last-visit';
const DISMISSED_KEY = 'toolbox.last-visit-dismissed';
const MARKS_KEY = 'toolbox.bookmarks';
const TARGET_HIGHLIGHT = 'is-bookmark-target';
/** Same stroke-X icon as Icon name="x" (used for every close affordance). */
const X_ICON_SVG =
  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 4l16 16" /><path d="M20 4L4 20" /></svg>';

interface StoredMark {
  page: string;
  url: string;
  title: string;
  excerpt: string;
  note: string;
  at: string;
  anchor?: string;
}

function readMarks(): StoredMark[] {
  let raw: Partial<StoredMark>[] = [];
  try {
    raw = JSON.parse(localStorage.getItem(MARKS_KEY) ?? '[]') as Partial<StoredMark>[];
  } catch {
    return [];
  }
  return raw.map((mark) => {
    const page = typeof mark.page === 'string' ? mark.page : location.pathname;
    const url = typeof mark.url === 'string' ? mark.url : page;
    const anchor = typeof mark.anchor === 'string' && mark.anchor ? mark.anchor : anchorFromUrl(url);
    return {
      page,
      url,
      title: typeof mark.title === 'string' ? plainBookmarkText(mark.title) : '',
      excerpt: typeof mark.excerpt === 'string' ? plainBookmarkText(mark.excerpt) : '',
      note: typeof mark.note === 'string' ? mark.note : '',
      at: typeof mark.at === 'string' ? mark.at : '',
      anchor,
    };
  });
}

function writeMarks(marks: StoredMark[]): void {
  try {
    localStorage.setItem(MARKS_KEY, JSON.stringify(marks));
  } catch {
    /* storage unavailable */
  }
}

/** Language of a stored URL by path segment (the default language has
 *  no language prefix). */
function markLang(url: string): string {
  const segments = url.split(/[?#]/)[0].split('/');
  for (const lang of languages) {
    if (lang !== DEFAULT_LANG && segments.includes(lang)) return lang;
  }
  return DEFAULT_LANG;
}

function currentLanguage(): Language {
  const lang = document.documentElement.lang as Language;
  return languages.includes(lang) ? lang : 'en';
}

function collapseText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function formatChapterTitle(title: string): string {
  return title.replace(/^(\d+)(?!\.)\s+/, '$1. ');
}

function isChapterUrl(url: string): boolean {
  const pathname = withoutTextFragment(url).split(/[?#]/)[0];
  const prefixes = languages
    .filter((lang) => lang !== DEFAULT_LANG)
    .map((lang) => `${lang}/`)
    .join('|');
  return new RegExp(`\\/book\\/(?:${prefixes})?\\d+\\.html$`).test(pathname);
}

/** Drop browser text-fragment directives (`#:~:text=...`) to avoid the
 *  native yellow page highlight when opening saved bookmarks. */
function withoutTextFragment(url: string): string {
  return url.replace(/:~:text=.*$/, '');
}

function anchorFromUrl(url: string): string {
  const hash = withoutTextFragment(url).split('#')[1] ?? '';
  try {
    return decodeURIComponent(hash);
  } catch {
    return hash;
  }
}

/** Leading-words excerpt identifying a target block. */
function excerptFor(element: HTMLElement, maxWords = 25): string {
  const lang = currentLanguage();
  return bookmarkExcerpt(element, {
    video: t(lang, 'bookmarks.component-labels.video', 'Video'),
    image: t(lang, 'bookmarks.component-labels.image', 'Image'),
    slideshow: t(lang, 'bookmarks.component-labels.slideshow', 'Slideshow'),
    table: t(lang, 'bookmarks.component-labels.table', 'Table'),
    quote: t(lang, 'bookmarks.component-labels.quote', 'Quote'),
    tip: t(lang, 'bookmarks.component-labels.tip', 'Tip'),
    accordion: t(lang, 'bookmarks.component-labels.accordion', 'Details'),
    copy: t(lang, 'bookmarks.component-labels.copy', 'Text to copy'),
    qr: t(lang, 'bookmarks.component-labels.qr', 'QR code'),
  }, maxWords);
}

/** Render every sidebar bookmark list for the active language. */
function renderBookmarkLists(): void {
  const lang = document.documentElement.lang;
  const marks = readMarks();
  for (const list of document.querySelectorAll<HTMLElement>('[data-bookmark-list]')) {
    const listLang = list.dataset.lang ?? lang;
    const items = marks.filter((mark) => markLang(mark.url || mark.page) === listLang);
    const section = list.closest('[data-bookmark-nav]');
    list.innerHTML = '';
    if (items.length === 0) {
      if (section instanceof HTMLElement) section.hidden = true;
      continue;
    }
    if (section instanceof HTMLElement) section.hidden = false;
    const deleteLang = languages.includes(listLang as Language) ? (listLang as Language) : currentLanguage();
    const deleteLabel = list.dataset.deleteLabel ?? t(deleteLang, 'bookmarks.delete-bookmark', 'Delete');
    for (const item of items) {
      const entry = document.createElement('li');
      const link = document.createElement('a');
      link.href = withoutTextFragment(item.url);
      const excerpt = document.createElement('span');
      excerpt.className = 'bookmark-excerpt';
      excerpt.textContent = item.excerpt || item.title || item.url;
      link.append(excerpt);
      if (item.excerpt && item.title) {
        const page = document.createElement('span');
        page.className = 'bookmark-page';
        page.textContent = formatChapterTitle(item.title);
        link.append(page);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'bookmark-delete';
      remove.innerHTML = X_ICON_SVG;
      remove.title = deleteLabel;
      remove.setAttribute('aria-label', `${deleteLabel}: ${item.excerpt || item.title}`);
      remove.addEventListener('click', () => {
        writeMarks(readMarks().filter((mark) => mark.url !== item.url));
        renderBookmarkLists();
        document.querySelector('[data-bookmark-gutter]')?.dispatchEvent(
          new CustomEvent('bookmarks:changed', { bubbles: true }),
        );
      });
      entry.append(link, remove);
      list.append(entry);
    }
  }
}

interface StoredVisit {
  url: string;
  title: string;
}

/** Read the stored visit. */
function readVisit(): StoredVisit | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(VISITS_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredVisit>;
    if (parsed && typeof parsed.url === 'string') {
      return { url: parsed.url, title: typeof parsed.title === 'string' ? parsed.title : '' };
    }
  } catch {
    return null;
  }
  return null;
}

/** Block-level lines a bookmark can pin to: direct prose children, with
 *  lists and description lists expanded to their items so each bullet and
 *  each glossary term/definition is its own line. */
function collectTargets(prose: HTMLElement): HTMLElement[] {
  const targets: HTMLElement[] = [];
  for (const child of prose.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.hasAttribute('data-bookmark-gutter')) continue;
    const tag = child.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE') continue;
    if (tag === 'UL' || tag === 'OL' || tag === 'DL') {
      let any = false;
      for (const item of child.children) {
        if (item instanceof HTMLElement && collapseText(item.textContent ?? '')) {
          targets.push(item);
          any = true;
        }
      }
      if (!any) targets.push(child);
      continue;
    }
    if (!collapseText(child.textContent ?? '') && !child.querySelector('img, svg, video')) continue;
    targets.push(child);
  }
  return targets;
}

/** Wire the line-pinning gutter: pending pin follows the pointer, saved
 *  pins stay anchored to their lines. */
function initBookmarkGutter(): void {
  const gutter = document.querySelector<HTMLElement>('[data-bookmark-gutter]');
  if (!gutter) return;
  const article = gutter.closest('main');
  const prose = article?.querySelector<HTMLElement>('[data-prose]');
  const pending = gutter.querySelector<HTMLButtonElement>('[data-bookmark-add]');
  if (!article || !prose || !pending) return;
  // Non-nullable aliases: narrowing of the query results above is not
  // preserved inside the nested closures below.
  const articleEl: HTMLElement = article;
  const proseEl: HTMLElement = prose;
  const pendingBtn: HTMLButtonElement = pending;
  const gutterEl: HTMLElement = gutter;
  const lang = currentLanguage();
  const addLabel = gutter.dataset.addLabel ?? t(lang, 'bookmarks.bookmark', 'Bookmark');
  const deleteLabel = gutter.dataset.deleteLabel ?? t(lang, 'bookmarks.delete-bookmark', 'Delete');

  let targets = collectTargets(proseEl);
  let pendingIndex: number | null = null;
  let anchorCounter = 0;
  /** Gutter strip the pointer must be in for aim mode (px, article-relative). */
  let pinLeft = 0;
  let aiming = false;
  const STRIP_MARGIN = 14;

  const pageMarks = (): StoredMark[] =>
    readMarks().filter((mark) => (mark.page || '') === location.pathname);

  function setHighlight(index: number | null): void {
    targets.forEach((target, i) =>
      target.classList.toggle(TARGET_HIGHLIGHT, i === index),
    );
  }

  function placePin(pin: HTMLElement, target: HTMLElement): void {
    const articleRect = articleEl.getBoundingClientRect();
    const proseRect = proseEl.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const pinHeight = pin.offsetHeight || 32;
    const pinWidth = pin.offsetWidth || 32;
    const top = rect.top - articleRect.top + Math.max(0, Math.min(4, (rect.height - pinHeight) / 2));
    const rtl = getComputedStyle(articleEl).direction === 'rtl';
    const gap = 10;
    let left: number;
    if (!rtl) {
      left = proseRect.right - articleRect.left + gap;
      left = Math.min(left, articleRect.width - pinWidth - 2);
    } else {
      left = proseRect.left - articleRect.left - pinWidth - gap;
      left = Math.max(2, left);
    }
    pin.style.top = `${Math.max(0, top)}px`;
    pin.style.left = `${Math.max(2, left)}px`;
    // All pins share one gutter column; remember it for the aim strip.
    pinLeft = Math.max(2, left);
  }

  /** A line already carrying a saved pin can't be bookmarked again. */
  function isSavedLine(index: number): boolean {
    const target = targets[index];
    if (!target) return false;
    return pageMarks().some((mark) => resolveTarget(mark) === target);
  }

  /** Park the pending pin on a line without highlighting it. */
  function parkPin(index: number): void {
    const target = targets[index];
    if (!target) return;
    pendingIndex = index;
    placePin(pendingBtn, target);
    pendingBtn.classList.toggle('is-behind', isSavedLine(index));
    const excerpt = excerptFor(target);
    pendingBtn.title = addLabel;
    pendingBtn.setAttribute('aria-label', excerpt ? `${addLabel}: ${excerpt.slice(0, 80)}` : addLabel);
  }

  /** Park the pending pin and highlight its line (aiming feedback). */
  function showPending(index: number): void {
    if (!targets[index]) return;
    parkPin(index);
    pendingBtn.classList.add('is-active');
    setHighlight(index);
  }

  function nearestIndex(clientY: number): number | null {
    if (targets.length === 0) return null;
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    targets.forEach((target, i) => {
      const rect = target.getBoundingClientRect();
      const dist =
        clientY >= rect.top && clientY <= rect.bottom
          ? 0
          : Math.min(Math.abs(clientY - rect.top), Math.abs(clientY - rect.bottom));
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best;
  }

  /** Re-find the line a stored mark belongs to (id first, text fallback). */
  function resolveTarget(mark: StoredMark): HTMLElement | null {
    if (mark.anchor) {
      const byId = document.getElementById(mark.anchor);
      if (byId instanceof HTMLElement && targets.includes(byId)) return byId;
    }
    if (!mark.excerpt) return null;
    const head = mark.excerpt.slice(0, 60);
    for (const target of targets) {
      const text = collapseText(target.textContent ?? '');
      if (text.startsWith(head) || (head.length > 20 && text.includes(head))) return target;
    }
    return null;
  }

  function positionSaved(): void {
    for (const pin of gutterEl.querySelectorAll<HTMLElement>('[data-bookmark-saved]')) {
      const url = pin.dataset.bookmarkSaved;
      const mark = pageMarks().find((entry) => entry.url === url);
      const target = mark ? resolveTarget(mark) : null;
      if (mark && target) placePin(pin, target);
      else pin.remove();
    }
  }

  function renderSaved(): void {
    gutterEl.querySelectorAll('[data-bookmark-saved]').forEach((node) => node.remove());
    const icon = pendingBtn.querySelector('svg');
    for (const mark of pageMarks()) {
      const target = resolveTarget(mark);
      // Adopt the found line so future lookups are exact.
      if (target && !target.id && mark.anchor) target.id = mark.anchor;
      if (!target) continue;
      if (!target.id) {
        anchorCounter += 1;
        target.id = `bm-${Date.now().toString(36)}-${anchorCounter}`;
        mark.anchor = target.id;
      }
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'bookmark-pin is-saved';
      pin.dataset.bookmarkSaved = mark.url;
      if (icon) pin.append(icon.cloneNode(true));
      const close = document.createElement('span');
      close.className = 'pin-close';
      close.setAttribute('aria-hidden', 'true');
      close.innerHTML = X_ICON_SVG;
      pin.append(close);
      const label = `${deleteLabel}: ${mark.excerpt || formatChapterTitle(mark.title)}`;
      pin.title = deleteLabel;
      pin.setAttribute('aria-label', label);
      const index = targets.indexOf(target);
      pin.addEventListener('mouseenter', () => setHighlight(index));
      pin.addEventListener('focus', () => setHighlight(index));
      pin.addEventListener('mouseleave', () => {
        if (document.activeElement !== pendingBtn) setHighlight(null);
      });
      pin.addEventListener('blur', () => {
        if (document.activeElement !== pendingBtn) setHighlight(null);
      });
      pin.addEventListener('click', () => {
        writeMarks(readMarks().filter((entry) => entry.url !== mark.url));
        renderBookmarkLists();
        renderSaved();
      });
      gutterEl.append(pin);
      placePin(pin, target);
    }
    // A deleted or relocated line may free (or take) the parked line.
    if (pendingIndex !== null && targets[pendingIndex]) parkPin(pendingIndex);
  }

  function scrollToAnchor(anchor: string): void {
    if (!anchor) return;
    const target = document.getElementById(anchor);
    if (!(target instanceof HTMLElement)) return;
    setHighlight(null);
    requestAnimationFrame(() => {
      const header = document.querySelector<HTMLElement>('.site-head');
      const headerHeight = header?.getBoundingClientRect().height ?? 0;
      const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 16;
      window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
    });
  }

  function scrollToCurrentHash(): void {
    const anchor = anchorFromUrl(location.hash);
    scrollToAnchor(anchor);
  }

  // Aim mode lives only in the gutter strip: hovering the pin — or the
  // zone directly above/below it — snaps the pin to the nearest line and
  // highlights it. Moving over the text itself does nothing.
  function inStrip(clientX: number): boolean {
    const articleRect = articleEl.getBoundingClientRect();
    const pinWidth = pendingBtn.offsetWidth || 32;
    const x = clientX - articleRect.left;
    return x >= pinLeft - STRIP_MARGIN && x <= pinLeft + pinWidth + STRIP_MARGIN;
  }

  function setAiming(on: boolean): void {
    aiming = on;
    pendingBtn.classList.toggle('is-active', on || pendingBtn.matches(':focus-visible'));
    if (!on && !pendingBtn.matches(':focus-visible')) setHighlight(null);
  }

  let scheduled = false;
  let lastY = 0;
  articleEl.addEventListener('mousemove', (event) => {
    if (!inStrip(event.clientX)) {
      setAiming(false);
      return;
    }
    setAiming(true);
    lastY = event.clientY;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (!aiming) return;
      const index = nearestIndex(lastY);
      if (index !== null) showPending(index);
    });
  });
  articleEl.addEventListener('mouseleave', () => setAiming(false));

  pendingBtn.addEventListener('focus', () => {
    showPending(pendingIndex ?? 0);
  });
  pendingBtn.addEventListener('blur', () => {
    if (!aiming) pendingBtn.classList.remove('is-active');
    setHighlight(null);
  });
  pendingBtn.addEventListener('keydown', (event) => {
    if (pendingIndex === null) return;
    let next: number | null = null;
    if (event.key === 'ArrowDown') next = Math.min(pendingIndex + 1, targets.length - 1);
    else if (event.key === 'ArrowUp') next = Math.max(pendingIndex - 1, 0);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = targets.length - 1;
    if (next !== null) {
      event.preventDefault();
      showPending(next);
      pendingBtn.focus();
    }
  });
  pendingBtn.addEventListener('click', () => {
    if (pendingIndex === null) return;
    const target = targets[pendingIndex];
    if (!target) return;
    const page = location.pathname;
    const heading = document.querySelector<HTMLElement>('main h1');
    const title = formatChapterTitle(heading ? excerptFor(heading, Number.MAX_SAFE_INTEGER) : plainBookmarkText(document.title));
    const excerpt = excerptFor(target);
    let anchor = target.id;
    if (!anchor) {
      anchorCounter += 1;
      anchor = `bm-${Date.now().toString(36)}-${anchorCounter}`;
      target.id = anchor;
    }
    const url = `${page}#${anchor}`;
    const marks = readMarks();
    if (!marks.some((mark) => mark.url === url || (mark.page === page && mark.anchor === anchor))) {
      marks.push({
        page,
        url,
        title,
        excerpt: excerpt.slice(0, 200),
        note: '',
        at: new Date().toISOString(),
        anchor,
      });
      writeMarks(marks);
    }
    renderBookmarkLists();
    renderSaved();
    if (!aiming) {
      pendingBtn.classList.remove('is-active');
      setHighlight(null);
    }
  });

  // Touch devices have no hover: tapping a line parks the pending pin
  // there (with highlight as selection feedback), tapping the pin saves.
  if (window.matchMedia('(hover: none)').matches) {
    proseEl.addEventListener('click', (event) => {
      let node = event.target as HTMLElement | null;
      while (node && node !== proseEl) {
        const index = targets.indexOf(node);
        if (index !== -1) {
          showPending(index);
          return;
        }
        node = node.parentElement;
      }
    });
  }

  function reposition(): void {
    targets = collectTargets(proseEl);
    if (pendingIndex !== null && targets[pendingIndex]) parkPin(pendingIndex);
    positionSaved();
  }

  gutterEl.addEventListener('bookmarks:changed', renderSaved);
  window.addEventListener('resize', reposition);
  window.addEventListener('load', reposition);
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => reposition());
    observer.observe(articleEl);
  }
  if (document.fonts?.ready) {
    void document.fonts.ready.then(() => {
      reposition();
      scrollToCurrentHash();
    });
  }
  renderSaved();
  // Prepare the hidden add button for hover or keyboard focus on the first
  // unsaved line (or behind a saved pin if every line is taken).
  if (targets.length === 0) {
    pendingBtn.classList.add('is-behind');
  } else {
    const initial = targets.findIndex((_, i) => !isSavedLine(i));
    parkPin(initial === -1 ? 0 : initial);
  }
  scrollToCurrentHash();

  document.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('[data-bookmark-list] a');
    if (!link) return;
    const url = new URL(link.href);
    if (url.pathname !== location.pathname || !url.hash) return;
    event.preventDefault();
    history.pushState(null, '', `${url.pathname}${url.hash}`);
    scrollToAnchor(anchorFromUrl(url.hash));
  });

  // Navigation never latches a highlight; only gutter hover/focus owns it.
  window.addEventListener('hashchange', () => setHighlight(null));
  window.addEventListener('popstate', () => setHighlight(null));
}

export function initBookmarks(): void {
  // Record this visit (with its title), then offer to jump back to the
  // previous one wherever the last-visit toast is rendered (start page).
  const here = `${location.pathname}${location.hash}`;
  const title = formatChapterTitle(document.querySelector('main h1')?.textContent?.trim() || document.title);
  const previous = readVisit();
  if (isChapterUrl(here)) {
    try {
      localStorage.setItem(VISITS_KEY, JSON.stringify({ url: here, title }));
    } catch {
      /* storage unavailable */
    }
  }

  const toast = document.querySelector<HTMLElement>('[data-last-visit]');
  // Dismissal lives in sessionStorage (per tab): clicking the toast away
  // hides it until the site is opened in a new tab.
  let dismissed: string | null = null;
  try {
    dismissed = sessionStorage.getItem(DISMISSED_KEY);
  } catch {
    /* storage unavailable */
  }
  const prompt = toast?.dataset.prompt ?? t(currentLanguage(), 'bookmarks.last-location-prompt', 'Continue from your last visit?');
  const text = toast?.querySelector('[data-last-visit-text]');
  const link = toast?.querySelector<HTMLAnchorElement>('[data-last-visit-link]');
  const close = toast?.querySelector<HTMLButtonElement>('[data-last-visit-close]');
  const currentLang = currentLanguage();
  if (
    toast &&
    link &&
    previous &&
    isChapterUrl(previous.url) &&
    previous.url !== here &&
    dismissed !== previous.url &&
    markLang(previous.url) === currentLang
  ) {
    if (previous.title && text) {
      text.textContent = `${prompt} `;
      link.textContent = formatChapterTitle(previous.title);
    } else {
      text?.remove();
      link.textContent = prompt;
    }
    link.href = previous.url;
    close?.addEventListener('click', () => {
      try {
        sessionStorage.setItem(DISMISSED_KEY, previous.url);
      } catch {
        /* storage unavailable */
      }
      toast.hidden = true;
    });
    toast.hidden = false;
  }

  initBookmarkGutter();
  renderBookmarkLists();
}
