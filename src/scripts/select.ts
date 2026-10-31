// Select lists navigate to the chosen option.
export function initSelect(): void {
  for (const root of document.querySelectorAll<HTMLElement>('[data-select-list]')) {
    const select = root.querySelector<HTMLSelectElement>('[data-select]');
    if (!select || root.dataset.wired) continue;
    root.dataset.wired = 'true';
    const value = root.querySelector<HTMLElement>('[data-select-value]');
    const syncLabel = () => {
      if (value) value.textContent = select.selectedOptions[0]?.textContent ?? '';
    };
    syncLabel();
    select.addEventListener('input', syncLabel);
    select.addEventListener('change', () => {
      syncLabel();
      if (select.value) location.href = select.value;
    });
  }
}
