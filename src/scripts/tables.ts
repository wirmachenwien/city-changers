// Wrap bare tables in a scroll container for small screens.
export function initTables(): void {
  for (const table of document.querySelectorAll('table')) {
    if (table.closest('.table-scroll')) continue;
    const wrapper = document.createElement('div');
    wrapper.className = 'table-scroll';
    const shell = document.createElement('div');
    shell.className = 'drawn-scroll-shell';
    table.replaceWith(shell);
    shell.append(wrapper);
    wrapper.append(table);
  }
}
