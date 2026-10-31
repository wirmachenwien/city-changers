// Text inputs can match :focus-visible even after a pointer click. Suppress
// only that pointer-origin ring; keyboard/programmatic focus keeps the fallback.
const initialized = new WeakSet<Document>();
const selector = '.search-box > input[type="search"]';

export function initSearchFocus(): void {
  if (initialized.has(document)) return;
  initialized.add(document);
  document.addEventListener('pointerdown', event => {
    if (!(event.target instanceof Element)) return;
    const input = event.target.closest<HTMLInputElement>(selector);
    if (input) input.dataset.searchPointerFocus = '';
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    for (const input of document.querySelectorAll<HTMLInputElement>(`${selector}[data-search-pointer-focus]`)) {
      delete input.dataset.searchPointerFocus;
    }
  }, true);
  document.addEventListener('focusout', event => {
    if (event.target instanceof HTMLElement && event.target.matches(selector)) {
      delete event.target.dataset.searchPointerFocus;
    }
  });
}
