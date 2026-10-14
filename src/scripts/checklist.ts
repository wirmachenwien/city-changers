const STORAGE_PREFIX = 'wmw-checklist:';

function storageKey(name: string): string {
  return `${STORAGE_PREFIX}${name}`;
}

function readState(key: string): boolean | string | number | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as boolean | string | number | null;
    return value ?? undefined;
  } catch {
    return undefined;
  }
}

function writeValue(name: string, value: boolean | string | number): void {
  try {
    localStorage.setItem(storageKey(name), JSON.stringify(value));
  } catch {
    // Browsers may deny storage in private contexts; the checklist still works for the session.
  }
}

function removeValue(name: string): void {
  try {
    localStorage.removeItem(storageKey(name));
  } catch {}
}

function fieldName(field: HTMLInputElement | HTMLTextAreaElement): string {
  return field.dataset.checklistField || field.name;
}

function syncField(name: string, value: boolean | string, except?: HTMLInputElement | HTMLTextAreaElement): void {
  for (const field of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(`[data-checklist-field="${CSS.escape(name)}"]`)) {
    // Row edits commit in place and must never rebuild their own list
    // mid-gesture; peers still sync normally.
    if (except && field === except) continue;
    if (field instanceof HTMLInputElement && field.type === 'checkbox' && typeof value === 'boolean') {
      field.checked = value;
    }
    if (field instanceof HTMLTextAreaElement && typeof value === 'string') {
      field.value = value;
      const commitRoot = field.closest<HTMLElement>('[data-commit-root]');
      if (commitRoot) renderCommitDisplay(commitRoot);
    }
    if (field instanceof HTMLInputElement && field.type === 'text' && typeof value === 'string') {
      field.value = value;
      if (field.hasAttribute('data-tags-value')) renderTagsForValue(field);
      const commitRoot = field.closest<HTMLElement>('[data-commit-root]');
      if (commitRoot) renderCommitDisplay(commitRoot);
    }
  }
  // Peers sharing the same list row may have been reindexed; re-evaluate
  // lock state without stealing focus from the actively edited cell.
  for (const root of document.querySelectorAll<HTMLElement>('[data-commit-root]')) {
    if (root.contains(document.activeElement)) continue;
    refreshCommitLock(root);
  }
}

// --- Tags (chips) cells: comma-separated storage, chip UI with free typing ---

const PENCIL_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon" aria-hidden="true" focusable="false"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>';

function setPencilIcon(button: HTMLButtonElement): void {
  button.innerHTML = PENCIL_SVG;
}

function tagLabelFromAction(action: HTMLElement): string {
  const row = action.closest('.initiative-tag-row, .initiative-commit-item');
  return row?.querySelector('.initiative-tag-row-label, .initiative-commit-label')?.textContent ?? '';
}

function exitRowEdit(row: HTMLElement): void {
  row.classList.remove('is-editing');
  const input = row.querySelector<HTMLInputElement>('[data-tag-row-input]');
  if (input) {
    input.hidden = true;
    input.value = '';
    delete input.dataset.original;
  }
}

// Row editing happens inline: the row itself becomes the input, so the
// skill never leaves its position. Marks live only in DOM classes and die
// with every list re-render — no stale edit state can misroute a commit.
function activateRowEdit(root: HTMLElement, tag: string): void {
  const typing = tagsInput(root);
  const wanted = tag.trim().toLocaleLowerCase();
  let target: HTMLElement | null = null;
  for (const row of root.querySelectorAll('.initiative-tag-row')) {
    if (!(row instanceof HTMLElement)) continue;
    const label = row.querySelector('.initiative-tag-row-label')?.textContent ?? '';
    if (row.classList.contains('is-editing')) {
      // Settle a previous row edit first (in place, no rebuild involved).
      if (label.trim().toLocaleLowerCase() !== wanted) commitRowInput(root, row, 'blur');
      else target = row;
      continue;
    }
    if (!target && label.trim().toLocaleLowerCase() === wanted) target = row;
  }
  if (!target) {
    typing?.focus();
    return;
  }
  const input = target.querySelector<HTMLInputElement>('[data-tag-row-input]');
  const label = target.querySelector('.initiative-tag-row-label')?.textContent?.trim() ?? tag;
  if (!input) {
    typing?.focus();
    return;
  }
  input.value = label;
  input.dataset.original = label;
  target.classList.add('is-editing');
  input.hidden = false;
  input.focus();
  try {
    input.select();
  } catch {}
}

function removeTagFromRoot(root: HTMLElement, label: string, row: HTMLElement | null): void {
  pinOpen(root);
  animateRowExit(row, () => {
    const valueInput = root.querySelector<HTMLInputElement>('input[data-tags-value][data-checklist-field]');
    if (!valueInput) return;
    const tags = parseTags(valueInput.value).filter((tag) => tag !== label);
    commitTags(root, tags);
    tagsInput(root)?.focus();
  });
}

function commitRowInput(root: HTMLElement, row: HTMLElement, mode: 'enter' | 'blur'): void {
  const input = row.querySelector<HTMLInputElement>('[data-tag-row-input]');
  const valueInput = root.querySelector<HTMLInputElement>('input[data-tags-value][data-checklist-field]');
  const labelEl = row.querySelector('.initiative-tag-row-label');
  const editBtn = row.querySelector<HTMLButtonElement>('[data-tags-edit]');
  if (!input || !valueInput || !labelEl) {
    exitRowEdit(row);
    return;
  }
  const original = (input.dataset.original ?? '').trim();
  const candidate = input.value.trim().replace(/\s+/g, ' ');
  if (!candidate) {
    if (mode === 'enter') {
      // Explicit clear = delete, same as the row's remove button.
      removeTagFromRoot(root, labelEl.textContent ?? original, row);
    } else {
      // Abandoned edit: the stored tag was never touched.
      exitRowEdit(row);
    }
    return;
  }
  const parts = parseTags(candidate);
  const name = fieldName(valueInput);
  const current = parseTags(valueInput.value);
  const index = current.findIndex((tag) => tag.toLocaleLowerCase() === original.toLocaleLowerCase());
  if (parts.length === 1 && index >= 0) {
    const same = parts[0].toLocaleLowerCase() === original.toLocaleLowerCase();
    const clash = current.some((tag, i) => i !== index && tag.toLocaleLowerCase() === parts[0].toLocaleLowerCase());
    if (same || !clash) {
      if (!same) {
        const next = [...current];
        next[index] = parts[0];
        valueInput.value = next.join(', ');
        writeValue(name, valueInput.value);
        // Sync peers, but never re-render this list: the focused row input
        // (or its blur target) must survive the commit.
        syncField(name, valueInput.value, valueInput);
        labelEl.textContent = parts[0];
        const editLabel = `Bearbeiten: ${parts[0]}`;
        const removeLabel = `Entfernen: ${parts[0]}`;
        if (editBtn) {
          editBtn.setAttribute('aria-label', editLabel);
          editBtn.title = editLabel;
        }
        const removeBtn = row.querySelector<HTMLButtonElement>('[data-tags-remove]');
        if (removeBtn) {
          removeBtn.setAttribute('aria-label', removeLabel);
          removeBtn.title = removeLabel;
        }
      }
      exitRowEdit(row);
      if (mode === 'enter') editBtn?.focus();
      return;
    }
    // Renaming onto an existing tag: keep stored value, just exit.
    exitRowEdit(row);
    if (mode === 'enter') editBtn?.focus();
    return;
  }
  // Comma-separated paste or stale mark: rebuild around the same position.
  const next = [...current];
  if (index >= 0) next.splice(index, 1, ...parts);
  else next.push(...parts);
  commitTags(root, [...new Set(next)]);
  if (mode === 'enter') tagsInput(root)?.focus();
}

// Row-button interactions (edit/delete/add) re-render the list under the
// cursor, so hover can flicker and the reveals would snap shut mid-click.
// Pinning keeps actions + add row visible briefly, independent of hover.
const KEEP_OPEN_MS = 1500;
const keepOpenTimers = new WeakMap<HTMLElement, number>();

function pinOpen(root: HTMLElement): void {
  const cell = root.closest<HTMLElement>('[data-commit-root]') ?? root;
  cell.setAttribute('data-keep-open', 'true');
  const pending = keepOpenTimers.get(cell);
  if (pending !== undefined) window.clearTimeout(pending);
  keepOpenTimers.set(
    cell,
    window.setTimeout(() => {
      cell.removeAttribute('data-keep-open');
      keepOpenTimers.delete(cell);
    }, KEEP_OPEN_MS),
  );
}

// Exit motion for skill rows: play the collapse, then remove. Falls back
// to instant removal without motion (or when reduced motion is set).
const ROW_EXIT_MS = 160;

function animateRowExit(row: HTMLElement | null, done: () => void): void {
  if (!row || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    done();
    return;
  }
  row.classList.add('is-removing');
  window.setTimeout(done, ROW_EXIT_MS);
}

function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim().replace(/\s+/g, ' '))
    .filter((tag) => tag.length > 0);
}

function tagsRoot(valueInput: HTMLInputElement): HTMLElement | undefined {
  return valueInput.closest<HTMLElement>('[data-tags-root]') ?? undefined;
}

function tagsList(root: HTMLElement): HTMLElement | undefined {
  return root.querySelector<HTMLElement>('[data-tags-list]') ?? undefined;
}

function tagsInput(root: HTMLElement): HTMLInputElement | undefined {
  return root.querySelector<HTMLInputElement>('[data-tags-input]') ?? undefined;
}

function updateTagPresetOptions(root: HTMLElement, tags: string[]): void {
  const input = tagsInput(root);
  const listId = input?.getAttribute('list');
  if (!listId) return;
  const datalist = root.querySelector<HTMLDataListElement>(`datalist#${CSS.escape(listId)}`);
  if (!datalist) return;
  const selected = new Set(tags.map((tag) => tag.toLocaleLowerCase()));
  for (const option of datalist.querySelectorAll<HTMLOptionElement>('option')) {
    const value = option.value.trim().toLocaleLowerCase();
    const isSelected = selected.has(value);
    option.disabled = isSelected;
    option.hidden = isSelected;
  }
}

function renderTagsForValue(valueInput: HTMLInputElement): void {
  const root = tagsRoot(valueInput);
  const list = root ? tagsList(root) : undefined;
  if (!root || !list) return;
  const tags = parseTags(valueInput.value);
  list.textContent = '';
  // Skills cells (data-commit-bullets) edit as a list — one row per skill
  // plus a virtual add row in the markup — instead of chips.
  const asList = root.hasAttribute('data-commit-bullets');
  for (const tag of tags) {
    if (asList) {
      const row = document.createElement('li');
      row.className = 'initiative-tag-row';
      const dash = document.createElement('span');
      dash.className = 'initiative-tag-row-dash';
      dash.setAttribute('aria-hidden', 'true');
      dash.textContent = '–';
      const label = document.createElement('span');
      label.className = 'initiative-tag-row-label';
      label.textContent = tag;
      const field = document.createElement('input');
      field.type = 'text';
      field.className = 'initiative-tag-row-input';
      field.setAttribute('data-tag-row-input', '');
      field.setAttribute('aria-label', `${commitLabel(root)}: ${tag} bearbeiten`);
      field.setAttribute('autocomplete', 'off');
      field.hidden = true;
      const actions = document.createElement('span');
      actions.className = 'initiative-tag-row-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'initiative-tag-row-edit';
      edit.setAttribute('data-tags-edit', '');
      edit.setAttribute('aria-label', `Bearbeiten: ${tag}`);
      edit.title = `Bearbeiten: ${tag}`;
      setPencilIcon(edit);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'initiative-tag-row-remove';
      remove.setAttribute('data-tags-remove', '');
      remove.setAttribute('aria-label', `Entfernen: ${tag}`);
      remove.title = `Entfernen: ${tag}`;
      remove.textContent = '×';
      actions.append(edit, remove);
      row.append(dash, label, field, actions);
      list.append(row);
      continue;
    }
    const chip = document.createElement('span');
    chip.className = 'initiative-tag-chip';
    const label = document.createElement('span');
    label.className = 'initiative-tag-label';
    label.textContent = tag;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'initiative-tag-remove';
    remove.setAttribute('data-tags-remove', '');
    remove.setAttribute('aria-label', `Entfernen: ${tag}`);
    remove.title = `Entfernen: ${tag}`;
    remove.textContent = '×';
    chip.append(label, remove);
    list.append(chip);
  }
  root.toggleAttribute('data-tags-empty', tags.length === 0);
  updateTagPresetOptions(root, tags);
  updateRolesMenu(root, tags);
}

// --- Roles dropdown (combobox): typeahead filter + click to select ---

let rolesMenuCounter = 0;

function rolesMenu(root: HTMLElement): HTMLElement | undefined {
  return root.querySelector<HTMLElement>('[data-roles-menu]') ?? undefined;
}

function rolesComboInput(root: HTMLElement): HTMLInputElement | undefined {
  return root.querySelector<HTMLInputElement>('[data-roles-combobox]') ?? undefined;
}

// Same list renders in several forms (chapter + worksheet) and rows are
// cloned from a template, so static IDs would duplicate. Assign unique
// menu/option IDs at runtime and wire the combobox to its listbox.
function ensureRolesIds(root: HTMLElement): void {
  const menu = rolesMenu(root);
  const typing = rolesComboInput(root);
  if (!menu) return;
  if (!menu.id) {
    rolesMenuCounter += 1;
    menu.id = `initiative-roles-menu-${rolesMenuCounter}`;
  }
  typing?.setAttribute('aria-controls', menu.id);
  roleOptions(root).forEach((option, index) => {
    if (!option.id) option.id = `${menu.id}-option-${index}`;
  });
}

function rolesToggle(root: HTMLElement): HTMLButtonElement | undefined {
  return root.querySelector<HTMLButtonElement>('[data-roles-toggle]') ?? undefined;
}

function roleOptions(root: HTMLElement): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>('[data-role-option]')];
}

function isRolesMenuOpen(root: HTMLElement): boolean {
  return rolesMenu(root)?.hidden === false;
}

function setRolesMenuOpen(root: HTMLElement, open: boolean): void {
  const menu = rolesMenu(root);
  const typing = rolesComboInput(root);
  const toggle = rolesToggle(root);
  if (!menu) return;
  menu.hidden = !open;
  typing?.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle?.setAttribute('aria-label', open ? 'Rollenliste schließen' : 'Rollenliste öffnen');
  if (toggle) toggle.title = open ? 'Rollenliste schließen' : 'Rollenliste öffnen';
  if (!open) clearActiveRoleOption(root);
}

function closeAllRolesMenus(except?: HTMLElement): void {
  for (const root of document.querySelectorAll<HTMLElement>('[data-roles-root]')) {
    if (except && root === except) continue;
    if (isRolesMenuOpen(root)) setRolesMenuOpen(root, false);
  }
}

function updateRolesMenu(root: HTMLElement, tags?: string[]): void {
  const menu = rolesMenu(root);
  if (!menu) return;
  const valueInput = root.querySelector<HTMLInputElement>('input[data-tags-value][data-checklist-field]');
  const current = tags ?? (valueInput ? parseTags(valueInput.value) : []);
  const lowered = new Set(current.map((tag) => tag.toLocaleLowerCase()));
  for (const option of roleOptions(root)) {
    const value = (option.dataset.roleOption ?? option.textContent ?? '').trim();
    option.setAttribute('aria-selected', lowered.has(value.toLocaleLowerCase()) ? 'true' : 'false');
  }
  filterRolesMenu(root, rolesComboInput(root)?.value ?? '');
}

function filterRolesMenu(root: HTMLElement, query: string): void {
  const menu = rolesMenu(root);
  if (!menu) return;
  const needle = query.trim().toLocaleLowerCase();
  let visible = 0;
  for (const option of roleOptions(root)) {
    const item = option.closest('li');
    const value = (option.dataset.roleOption ?? option.textContent ?? '').trim().toLocaleLowerCase();
    const match = !needle || value.includes(needle);
    item?.toggleAttribute('data-hidden', !match);
    if (match) visible += 1;
  }
  let empty = menu.querySelector<HTMLElement>('[data-roles-empty]');
  if (visible === 0) {
    if (!empty) {
      empty = document.createElement('li');
      empty.className = 'initiative-roles-empty';
      empty.setAttribute('data-roles-empty', '');
      empty.setAttribute('aria-hidden', 'true');
      empty.textContent = 'Keine passende Rolle — Enter fügt sie als eigene Rolle hinzu.';
      menu.append(empty);
    }
    empty.hidden = false;
  } else if (empty) {
    empty.hidden = true;
  }
  clearActiveRoleOption(root);
}

function visibleRoleOptions(root: HTMLElement): HTMLButtonElement[] {
  return roleOptions(root).filter((option) => option.closest('li')?.hasAttribute('data-hidden') !== true);
}

function clearActiveRoleOption(root: HTMLElement): void {
  for (const option of roleOptions(root)) option.removeAttribute('data-active');
  rolesComboInput(root)?.removeAttribute('aria-activedescendant');
}

function activeRoleOption(root: HTMLElement): HTMLButtonElement | undefined {
  return roleOptions(root).find((option) => option.getAttribute('data-active') === 'true');
}

function moveActiveRoleOption(root: HTMLElement, direction: 1 | -1): void {
  const visible = visibleRoleOptions(root);
  if (visible.length === 0) return;
  const current = activeRoleOption(root);
  const index = current ? visible.indexOf(current) : -1;
  const next = visible[(index + direction + visible.length) % visible.length];
  clearActiveRoleOption(root);
  next?.setAttribute('data-active', 'true');
  if (next?.id) rolesComboInput(root)?.setAttribute('aria-activedescendant', next.id);
  next?.scrollIntoView({ block: 'nearest' });
}

function selectRoleOption(root: HTMLElement, value: string): void {
  const candidate = value.trim().replace(/\s+/g, ' ');
  if (!candidate) return;
  const valueInput = root.querySelector<HTMLInputElement>('input[data-tags-value][data-checklist-field]');
  const current = valueInput ? parseTags(valueInput.value) : [];
  const exists = current.some((tag) => tag.toLocaleLowerCase() === candidate.toLocaleLowerCase());
  if (!exists) {
    commitTags(root, [...current, candidate]);
  } else {
    if (valueInput) renderTagsForValue(valueInput);
  }
  const typing = rolesComboInput(root);
  if (typing) {
    typing.value = '';
    filterRolesMenu(root, '');
    typing.focus();
  }
}

function commitTags(root: HTMLElement, tags: string[]): void {
  const valueInput = root.querySelector<HTMLInputElement>('input[data-tags-value][data-checklist-field]');
  if (!valueInput) return;
  const before = new Set(parseTags(valueInput.value).map((tag) => tag.toLocaleLowerCase()));
  const name = fieldName(valueInput);
  valueInput.value = tags.join(', ');
  writeValue(name, valueInput.value);
  syncField(name, valueInput.value);
  renderTagsForValue(valueInput);
  // Enter motion for freshly added rows in the interacted list: freshly
  // created nodes animate as soon as the marker class lands on them.
  const added = new Set(
    tags.filter((tag) => !before.has(tag.toLocaleLowerCase())).map((tag) => tag.toLocaleLowerCase()),
  );
  if (added.size === 0) return;
  for (const row of tagsList(root)?.querySelectorAll('.initiative-tag-row') ?? []) {
    const label = row.querySelector('.initiative-tag-row-label')?.textContent ?? '';
    if (added.has(label.trim().toLocaleLowerCase())) row.classList.add('is-added');
  }
}

function addTagFromTyping(root: HTMLElement): void {
  const typing = tagsInput(root);
  if (!typing) return;
  const candidate = typing.value.trim().replace(/\s+/g, ' ');
  if (!candidate) {
    typing.value = '';
    return;
  }
  const valueInput = root.querySelector<HTMLInputElement>('input[data-tags-value][data-checklist-field]');
  const current = valueInput ? parseTags(valueInput.value) : [];
  const exists = current.some((tag) => tag.toLocaleLowerCase() === candidate.toLocaleLowerCase());
  if (!exists) {
    // Allow comma-separated pastes to add several tags at once.
    const next = [...current, ...parseTags(candidate)];
    commitTags(root, [...new Set(next)]);
  }
  typing.value = '';
}

function initTagsIn(scope: ParentNode): void {
  for (const valueInput of scope.querySelectorAll<HTMLInputElement>('input[data-tags-value][data-checklist-field]')) {
    renderTagsForValue(valueInput);
  }
  for (const root of scope.querySelectorAll<HTMLElement>('[data-roles-root]')) {
    ensureRolesIds(root);
    if (isRolesMenuOpen(root)) setRolesMenuOpen(root, false);
    updateRolesMenu(root);
  }
  initCommitIn(scope);
}

function renderAllTags(scope: HTMLElement): void {
  initTagsIn(scope);
}

// --- Commit cells: text fields or tag pills commit to stable text + pencil ---

function commitTextInput(root: HTMLElement): HTMLInputElement | HTMLTextAreaElement | undefined {
  return root.querySelector<HTMLInputElement | HTMLTextAreaElement>('[data-commit-input][data-checklist-field]') ?? undefined;
}

function commitTypingInput(root: HTMLElement): HTMLInputElement | undefined {
  return root.querySelector<HTMLInputElement>('input[data-tag-commit-input]') ?? undefined;
}

function commitDisplay(root: HTMLElement): HTMLElement | undefined {
  return root.querySelector<HTMLElement>('[data-commit-display]') ?? undefined;
}

function commitEditButton(root: HTMLElement): HTMLButtonElement | undefined {
  return (
    root.querySelector<HTMLButtonElement>('[data-commit-item-edit]') ??
    root.querySelector<HTMLButtonElement>('[data-commit-edit]') ??
    undefined
  );
}

function isTagCommit(root: HTMLElement): boolean {
  return root.hasAttribute('data-tag-commit-root');
}

function commitLabel(root: HTMLElement): string {
  const input =
    commitTypingInput(root) ??
    root.querySelector<HTMLInputElement>('input[data-commit-input]') ??
    root.querySelector<HTMLInputElement>('input[data-checklist-field]');
  const fromInput = input?.getAttribute('aria-label')?.trim();
  if (fromInput) return fromInput;
  const label =
    root.querySelector('.initiative-below-label')?.textContent ??
    root.querySelector('.initiative-list-cell-label')?.textContent ??
    root.querySelector('.initiative-note-field > span')?.textContent ??
    '';
  return label.trim() || 'Eintrag';
}

function commitHasValue(root: HTMLElement): boolean {
  if (isTagCommit(root)) {
    const valueInput = root.querySelector<HTMLInputElement>('input[data-tags-value][data-checklist-field]');
    return valueInput ? parseTags(valueInput.value).length > 0 : false;
  }
  const input = commitTextInput(root);
  return input ? input.value.trim().length > 0 : false;
}

function renderCommitDisplay(root: HTMLElement): void {
  const display = commitDisplay(root);
  if (!display) return;
  const label = commitLabel(root);
  if (isTagCommit(root)) {
    const valueInput = root.querySelector<HTMLInputElement>('input[data-tags-value][data-checklist-field]');
    const tags = valueInput ? parseTags(valueInput.value) : [];
    const pills = root.querySelector<HTMLElement>('[data-commit-pills]');
    const isBullets = root.hasAttribute('data-commit-bullets') || pills?.tagName === 'UL';
    if (pills) {
      pills.textContent = '';
      for (const tag of tags) {
        if (isBullets) {
          const item = document.createElement('li');
          item.className = 'initiative-commit-item';
          const labelSpan = document.createElement('span');
          labelSpan.className = 'initiative-commit-label';
          labelSpan.textContent = tag;
          const actions = document.createElement('span');
          actions.className = 'initiative-commit-actions';
          const edit = document.createElement('button');
          edit.type = 'button';
          edit.className = 'initiative-commit-item-edit';
          edit.setAttribute('data-commit-item-edit', '');
          edit.setAttribute('aria-label', `${label} bearbeiten: ${tag}`);
          edit.title = `${label} bearbeiten: ${tag}`;
          setPencilIcon(edit);
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'initiative-commit-item-remove';
          remove.setAttribute('data-commit-item-remove', '');
          remove.setAttribute('aria-label', `${label} entfernen: ${tag}`);
          remove.title = `${label} entfernen: ${tag}`;
          remove.textContent = '×';
          actions.append(edit, remove);
          item.append(labelSpan, actions);
          pills.append(item);
        } else {
          const pill = document.createElement('span');
          pill.className = 'initiative-commit-pill';
          pill.textContent = tag;
          pills.append(pill);
        }
      }
      pills.toggleAttribute('data-empty', tags.length === 0);
    }
    // Bullet lists render in a div wrapper (ul is invalid inside a button);
    // each row carries its own edit + delete buttons with accessible names.
    return;
  }
  const input = commitTextInput(root);
  const text = root.querySelector<HTMLElement>('[data-commit-text]');
  const value = (input?.value ?? '').trim();
  if (text) text.textContent = value;
  // The value is plain selectable text; the inner pencil button carries
  // the accessible name and is the only edit control.
  const edit = commitEditButton(root) ?? display;
  edit.setAttribute('aria-label', value ? `${label} bearbeiten: ${value}` : `${label} bearbeiten`);
  edit.title = `${label} bearbeiten`;
}

function setCommitLocked(root: HTMLElement, locked: boolean): void {
  const display = commitDisplay(root);
  if (!display) return;
  const shouldLock = locked && commitHasValue(root);
  root.toggleAttribute('data-locked', shouldLock);
  display.hidden = !shouldLock;
  if (isTagCommit(root)) {
    const chips = root.querySelector<HTMLElement>('[data-tags-list]');
    const combo = root.querySelector<HTMLElement>('[data-tags]');
    if (chips) chips.hidden = shouldLock;
    if (combo) combo.hidden = shouldLock;
  } else {
    const input = commitTextInput(root);
    if (input) {
      input.hidden = shouldLock;
      input.tabIndex = shouldLock ? -1 : 0;
      if (shouldLock) input.setAttribute('aria-hidden', 'true');
      else input.removeAttribute('aria-hidden');
    }
  }
}

function refreshCommitLock(root: HTMLElement): void {
  renderCommitDisplay(root);
  // Never yank focus away while the user is still typing in this cell.
  if (root.contains(document.activeElement)) {
    setCommitLocked(root, false);
    // Keep the display in sync behind the scenes, but stay editable.
    const display = commitDisplay(root);
    if (display) display.hidden = true;
    if (!isTagCommit(root)) {
      const input = commitTextInput(root);
      if (input) {
        input.hidden = false;
        input.removeAttribute('aria-hidden');
      }
    } else {
      const chips = root.querySelector<HTMLElement>('[data-tags-list]');
      const combo = root.querySelector<HTMLElement>('[data-tags]');
      if (chips) chips.hidden = false;
      if (combo) combo.hidden = false;
    }
    root.removeAttribute('data-locked');
    return;
  }
  setCommitLocked(root, commitHasValue(root));
}

function commitRoot(root: HTMLElement): void {
  renderCommitDisplay(root);
  setCommitLocked(root, true);
  // Move focus to the stable display so keyboard users land on the
  // pencil affordance right after committing with Enter. Bullet lists
  // use a div wrapper, so focus the inner edit button there.
  (commitEditButton(root) ?? commitDisplay(root))?.focus({ preventScroll: true });
}

function editCommitRoot(root: HTMLElement): void {
  setCommitLocked(root, false);
  renderCommitDisplay(root);
  const target = commitTypingInput(root) ?? commitTextInput(root);
  target?.focus();
  if (target && !isTagCommit(root)) {
    const end = target.value.length;
    try {
      target.setSelectionRange(end, end);
    } catch {}
  }
}

function initCommitIn(scope: ParentNode): void {
  const roots = scope instanceof Element
    ? scope.matches('[data-commit-root]')
      ? [scope as HTMLElement, ...scope.querySelectorAll<HTMLElement>('[data-commit-root]')]
      : [...scope.querySelectorAll<HTMLElement>('[data-commit-root]')]
    : [...scope.querySelectorAll<HTMLElement>('[data-commit-root]')];
  for (const root of roots) refreshCommitLock(root);
}

function sectionCommitHasValue(root: HTMLElement): boolean {
  return root.querySelector<HTMLInputElement>('input[type="checkbox"]:checked') !== null;
}

function renderSectionCommitDisplay(root: HTMLElement): void {
  const display = root.querySelector<HTMLButtonElement>('[data-section-commit-display]');
  const values = root.querySelector<HTMLElement>('[data-section-commit-values]');
  if (!display || !values) return;
  values.textContent = '';
  const labels: string[] = [];
  for (const checkbox of root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked')) {
    const label = checkbox.id ? root.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(checkbox.id)}"]`) : undefined;
    const text = label?.textContent?.trim();
    if (text) labels.push(text);
  }
  for (const label of labels) {
    const pill = document.createElement('span');
    pill.className = 'initiative-commit-pill';
    pill.textContent = label;
    values.append(pill);
  }
  display.setAttribute('aria-label', labels.length > 0 ? `Auswahl bearbeiten: ${labels.join(', ')}` : 'Auswahl bearbeiten');
  display.title = 'Auswahl bearbeiten';
}

function setSectionCommitLocked(root: HTMLElement, locked: boolean): void {
  const shouldLock = locked && sectionCommitHasValue(root);
  root.toggleAttribute('data-locked', shouldLock);
  const display = root.querySelector<HTMLButtonElement>('[data-section-commit-display]');
  if (display) display.hidden = !shouldLock;
  for (const checkbox of root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
    checkbox.disabled = shouldLock;
  }
}

function refreshSectionCommit(root: HTMLElement): void {
  renderSectionCommitDisplay(root);
  setSectionCommitLocked(root, sectionCommitHasValue(root));
}

function initSectionCommits(scope: ParentNode = document): void {
  for (const root of scope.querySelectorAll<HTMLElement>('[data-section-commit]')) refreshSectionCommit(root);
}

function refreshSectionCommits(): void {
  initSectionCommits(document);
}

function renderSectionCommitDisplays(): void {
  for (const root of document.querySelectorAll<HTMLElement>('[data-section-commit]')) renderSectionCommitDisplay(root);
}

function flushTagTyping(root: HTMLElement): void {
  const typing = commitTypingInput(root);
  if (!typing || !typing.value.trim()) return;
  addTagFromTyping(root);
  renderCommitDisplay(root);
}

function listCountKey(name: string): string {
  return `${name}.__count`;
}

function listName(list: HTMLElement): string | undefined {
  return list.dataset.checklistList;
}

function initialListRows(list: HTMLElement): number {
  return Number.parseInt(list.dataset.checklistListInitial || '1', 10) || 1;
}

function rowCount(list: HTMLElement): number {
  return list.querySelectorAll('[data-checklist-list-row]').length;
}

function rowFromTemplate(list: HTMLElement, index: number): HTMLElement | undefined {
  const template = list.querySelector<HTMLTemplateElement>('template[data-checklist-list-template]');
  const row = template?.content.firstElementChild?.cloneNode(true);
  if (!(row instanceof HTMLElement)) return undefined;

  for (const input of row.querySelectorAll<HTMLInputElement>('input[data-checklist-field]')) {
    const field = fieldName(input).replace('__INDEX__', String(index));
    input.name = field;
    input.dataset.checklistField = field;
  }

  for (const input of row.querySelectorAll<HTMLInputElement>('input[list]')) {
    const listId = input.getAttribute('list')?.replace('__INDEX__', String(index));
    if (listId) input.setAttribute('list', listId);
  }
  for (const datalist of row.querySelectorAll<HTMLDataListElement>('datalist[id]')) {
    datalist.id = datalist.id.replace('__INDEX__', String(index));
  }

  return row;
}

function ensureListRows(list: HTMLElement, count: number): void {
  const rows = list.querySelector<HTMLElement>('[data-checklist-list-rows]');
  if (!rows) return;

  while (rowCount(list) < count) {
    const row = rowFromTemplate(list, rowCount(list));
    if (!row) return;
    // People lists render the add button as a card inside the rows grid;
    // new rows go before it so it keeps the last slot.
    const add = rows.querySelector<HTMLElement>('[data-checklist-list-add]');
    if (add) rows.insertBefore(row, add);
    else rows.append(row);
  }
}

function trimListRows(list: HTMLElement, count: number): void {
  const rows = [...list.querySelectorAll<HTMLElement>('[data-checklist-list-row]')];
  for (const row of rows.slice(count)) row.remove();
}

function syncListRows(name: string, count: number): void {
  for (const list of document.querySelectorAll<HTMLElement>(`[data-checklist-list="${CSS.escape(name)}"]`)) {
    ensureListRows(list, count);
  }
}

function resetListRows(name: string): void {
  for (const list of document.querySelectorAll<HTMLElement>(`[data-checklist-list="${CSS.escape(name)}"]`)) {
    const count = initialListRows(list);
    trimListRows(list, count);
    for (const input of list.querySelectorAll<HTMLInputElement>('input[type="text"]')) {
      input.value = '';
    }
  }
}

function reindexListRows(list: HTMLElement): void {
  const name = listName(list);
  if (!name) return;
  const rows = [...list.querySelectorAll<HTMLElement>('[data-checklist-list-row]')];
  rows.forEach((row, index) => {
    for (const input of row.querySelectorAll<HTMLInputElement>('input[data-checklist-field]')) {
      const parts = fieldName(input).split('.');
      const field = `${name}.${index}.${parts.slice(2).join('.')}`;
      input.name = field;
      input.dataset.checklistField = field;
    }
  });
}

function persistListRows(list: HTMLElement): void {
  for (const input of list.querySelectorAll<HTMLInputElement>('input[type="text"]:not([data-tags-input])')) {
    if (!input.dataset.checklistField) continue;
    writeValue(fieldName(input), input.value);
  }
}

function clearStaleListValues(name: string, count: number): void {
  try {
    const prefix = storageKey(`${name}.`);
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) stale.push(key);
    }
    for (const key of stale) {
      const rest = key.slice(prefix.length);
      if (rest === '__count') continue;
      const index = Number.parseInt(rest, 10);
      if (!Number.isNaN(index) && index >= count) localStorage.removeItem(key);
    }
  } catch {}
}

function removeRowAtSameIndex(lists: NodeListOf<HTMLElement> | HTMLElement[], index: number): void {
  for (const list of lists) {
    const rows = [...list.querySelectorAll<HTMLElement>('[data-checklist-list-row]')];
    if (rows.length <= 1 || index < 0 || index >= rows.length) continue;
    rows[index]?.remove();
    reindexListRows(list);
    persistListRows(list);
    initTagsIn(list);
  }
}

// Two-step delete: the first click only arms the remove button (confirm
// affordance), the second click actually removes. Anything else disarms.
const REMOVE_ARM_TIMEOUT = 4000;
const removeDisarmTimers = new WeakMap<HTMLButtonElement, number>();

function setRemoveArmed(button: HTMLButtonElement, armed: boolean): void {
  const pending = removeDisarmTimers.get(button);
  if (pending !== undefined) {
    window.clearTimeout(pending);
    removeDisarmTimers.delete(button);
  }
  if (armed) {
    button.dataset.armed = 'true';
    button.setAttribute('aria-label', 'Wirklich entfernen? Erneut klicken zum Bestätigen');
    button.title = 'Wirklich entfernen? Erneut klicken zum Bestätigen';
  } else {
    delete button.dataset.armed;
    button.setAttribute('aria-label', 'Eintrag entfernen');
    button.title = 'Eintrag entfernen';
  }
}

function disarmRemoveButtons(scope: ParentNode, except?: HTMLButtonElement): void {
  for (const button of scope.querySelectorAll<HTMLButtonElement>('[data-checklist-list-remove][data-armed]')) {
    if (except && button === except) continue;
    setRemoveArmed(button, false);
  }
}

export function initChecklist(): void {
  for (const form of document.querySelectorAll<HTMLElement>('[data-checklist]')) {
    for (const list of form.querySelectorAll<HTMLElement>('[data-checklist-list]')) {
      const name = listName(list);
      if (!name) continue;
      const storedCount = readState(storageKey(listCountKey(name)));
      const count = typeof storedCount === 'number' ? storedCount : initialListRows(list);
      ensureListRows(list, Math.max(count, initialListRows(list)));
      initTagsIn(list);
    }

    const inputs = [...form.querySelectorAll<HTMLInputElement>('input[type="checkbox"], input[type="text"]:not([data-tags-input])')];
    const textareas = [...form.querySelectorAll<HTMLTextAreaElement>('textarea')];

    for (const input of inputs) {
      const value = readState(storageKey(fieldName(input)));
      if (input.type === 'checkbox') input.checked = value === true;
      if (input.type === 'text' && typeof value === 'string') input.value = value;
    }
    for (const textarea of textareas) {
      const value = readState(storageKey(fieldName(textarea)));
      if (typeof value === 'string') textarea.value = value;
    }
    // Values were restored after the initial row setup; re-render chips
    // and commit displays so reloaded names/skills show locked state.
    initTagsIn(form);
    initSectionCommits(form);

    form.addEventListener('change', (event) => {
      if (!(event.target instanceof HTMLInputElement) || event.target.type !== 'checkbox') return;
      const name = fieldName(event.target);
      writeValue(name, event.target.checked);
      syncField(name, event.target.checked);
      renderSectionCommitDisplays();
    });

    form.addEventListener('input', (event) => {
      if (!(event.target instanceof HTMLTextAreaElement) && !(event.target instanceof HTMLInputElement && event.target.type === 'text')) return;
      // Tags typing fields are not storage-bound; chips commit explicitly.
      if (event.target instanceof HTMLInputElement && event.target.hasAttribute('data-tags-input')) return;
      const name = fieldName(event.target);
      writeValue(name, event.target.value);
      syncField(name, event.target.value);
    });

    form.addEventListener('click', (event) => {
      const removeButton = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-checklist-list-remove]') : undefined;
      if (removeButton) {
        if (removeButton.dataset.armed !== 'true') {
          disarmRemoveButtons(form, removeButton);
          setRemoveArmed(removeButton, true);
          const timer = window.setTimeout(() => setRemoveArmed(removeButton, false), REMOVE_ARM_TIMEOUT);
          removeDisarmTimers.set(removeButton, timer);
          removeButton.focus();
          return;
        }
        setRemoveArmed(removeButton, false);
        const list = removeButton.closest<HTMLElement>('[data-checklist-list]');
        const name = list ? listName(list) : undefined;
        if (!list || !name) return;
        const rows = [...list.querySelectorAll<HTMLElement>('[data-checklist-list-row]')];
        const row = removeButton.closest<HTMLElement>('[data-checklist-list-row]');
        if (!row) return;
        const removedIndex = rows.indexOf(row);
        if (rows.length <= 1) {
          for (const input of row.querySelectorAll<HTMLInputElement>('input[type="text"]:not([data-tags-input])')) {
            const field = fieldName(input);
            if (!field) continue;
            input.value = '';
            removeValue(field);
            syncField(field, '');
          }
          for (const typing of row.querySelectorAll<HTMLInputElement>('input[data-tags-input]')) {
            typing.value = '';
          }
          renderAllTags(form);
          return;
        }
        const count = rowCount(list) - 1;
        writeValue(listCountKey(name), count);
        const peers = [...document.querySelectorAll<HTMLElement>(`[data-checklist-list="${CSS.escape(name)}"]`)];
        removeRowAtSameIndex(peers, removedIndex);
        clearStaleListValues(name, count);
        const remaining = [...list.querySelectorAll<HTMLElement>('[data-checklist-list-row]')];
        const focusRow = remaining[Math.min(Math.max(removedIndex, 0), remaining.length - 1)];
        (focusRow?.querySelector<HTMLButtonElement>('[data-checklist-list-remove]') ?? list.querySelector<HTMLButtonElement>('[data-checklist-list-add]'))?.focus();
        return;
      }
      disarmRemoveButtons(form);
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-checklist-list-add]') : undefined;
      if (!button) return;
      const list = button.closest<HTMLElement>('[data-checklist-list]');
      if (!list) return;
      const name = listName(list);
      if (!name) return;
      const count = rowCount(list) + 1;
      writeValue(listCountKey(name), count);
      syncListRows(name, count);
      for (const peer of document.querySelectorAll<HTMLElement>(`[data-checklist-list="${CSS.escape(name)}"]`)) {
        initTagsIn(peer);
      }
    });

    // Commit cells: Enter or blur turns the field into stable text/pills,
    // the pencil display button re-opens it for editing.
    form.addEventListener('keydown', (event) => {
      const input = event.target instanceof HTMLInputElement && event.target.hasAttribute('data-commit-input') ? event.target : undefined;
      if (!input || event.key !== 'Enter') return;
      const root = input.closest<HTMLElement>('[data-commit-root]');
      if (!root) return;
      // Tag typing input: Enter with text just adds another pill and
      // stays editable; Enter on empty input locks the pills.
      if (input.hasAttribute('data-tag-commit-input')) {
        if (input.value.trim() !== '') return;
        event.preventDefault();
        flushTagTyping(root);
        commitRoot(root);
        return;
      }
      event.preventDefault();
      if (!input.value.trim()) return;
      commitRoot(root);
    });

    form.addEventListener('focusout', (event) => {
      // Row inputs commit in place first, so the storage is fresh before
      // the cell below decides to lock — and no rebuild can detach the
      // blur target.
      const rowInput = event.target instanceof HTMLInputElement && event.target.hasAttribute('data-tag-row-input')
        ? event.target
        : undefined;
      if (rowInput) {
        const row = rowInput.closest<HTMLElement>('.initiative-tag-row');
        const rowRoot = rowInput.closest<HTMLElement>('[data-tags-root]');
        if (row && rowRoot) commitRowInput(rowRoot, row, 'blur');
      }
      const root = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-commit-root]') : undefined;
      if (!root) return;
      const next = event.relatedTarget instanceof Node ? event.relatedTarget : undefined;
      if (next && root.contains(next)) return;
      window.setTimeout(() => {
        if (root.contains(document.activeElement)) return;
        flushTagTyping(root);
        // Lock without moving focus: the user may just have clicked into
        // another field, and focusing this cell's display would steal it.
        // (commitRoot's focus jump is only for the explicit Enter key path.)
        renderCommitDisplay(root);
        setCommitLocked(root, commitHasValue(root));
      }, 0);
    });

    form.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const itemRemove = event.target.closest<HTMLButtonElement>('[data-commit-item-remove]');
      if (itemRemove) {
        if (!itemRemove.isConnected) return;
        const root = itemRemove.closest<HTMLElement>('[data-commit-root]');
        if (!root) return;
        event.preventDefault();
        pinOpen(root);
        const label = tagLabelFromAction(itemRemove);
        const row = itemRemove.closest<HTMLElement>('.initiative-commit-item');
        animateRowExit(row, () => {
          const valueInput = root.querySelector<HTMLInputElement>('input[data-tags-value][data-checklist-field]');
          if (!valueInput) return;
          const tags = parseTags(valueInput.value).filter((tag) => tag !== label);
          commitTags(root, tags);
          renderCommitDisplay(root);
          refreshCommitLock(root);
          // Keep keyboard context: focus the next row action, or the typing
          // input when the list became empty (it unlocks).
          const nextAction = root.querySelector<HTMLButtonElement>('[data-commit-item-edit], [data-commit-item-remove]');
          if (nextAction) nextAction.focus();
          else tagsInput(root)?.focus();
        });
        return;
      }
      const itemEdit = event.target.closest<HTMLButtonElement>('[data-commit-item-edit]');
      if (itemEdit) {
        if (!itemEdit.isConnected) return;
        const root = itemEdit.closest<HTMLElement>('[data-commit-root]');
        if (!root) return;
        event.preventDefault();
        pinOpen(root);
        setCommitLocked(root, false);
        renderCommitDisplay(root);
        activateRowEdit(root, tagLabelFromAction(itemEdit));
        return;
      }
      const itemAdd = event.target.closest<HTMLButtonElement>('[data-commit-add]');
      if (itemAdd) {
        const root = itemAdd.closest<HTMLElement>('[data-commit-root]');
        if (!root) return;
        event.preventDefault();
        pinOpen(root);
        // The locked add row already looks like the input, so unlocking
        // must not replay an opening animation — show everything at once.
        root.setAttribute('data-no-motion', 'true');
        window.setTimeout(() => root.removeAttribute('data-no-motion'), 300);
        editCommitRoot(root);
        return;
      }
      const display = event.target.closest<HTMLElement>('[data-commit-display]');
      if (!display) return;
      const root = display.closest<HTMLElement>('[data-commit-root]');
      if (!root) return;
      // Skills lists only respond to their explicit controls (per-row
      // edit/delete, add button); clicking elsewhere in the list is a no-op.
      if (root.hasAttribute('data-commit-bullets')) return;
      // Single text fields show the value as selectable text and unlock
      // via their pencil button only; clicking the value itself is a
      // no-op so text selection works. The pencil is a native button, so
      // keyboard users Tab to it directly.
      if (root.hasAttribute('data-commit-text-root')) {
        if (!event.target.closest('[data-commit-edit]')) return;
      }
      event.preventDefault();
      editCommitRoot(root);
    });

    form.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const display = event.target.closest<HTMLButtonElement>('[data-section-commit-display]');
      if (!display) return;
      const root = display.closest<HTMLElement>('[data-section-commit]');
      if (!root) return;
      event.preventDefault();
      setSectionCommitLocked(root, false);
      root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus();
    });

    form.addEventListener('focusout', (event) => {
      const root = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-section-commit]') : undefined;
      if (!root) return;
      const next = event.relatedTarget instanceof Node ? event.relatedTarget : undefined;
      if (next && root.contains(next)) return;
      window.setTimeout(() => {
        if (root.contains(document.activeElement)) return;
        refreshSectionCommit(root);
      }, 0);
    });

    // Live-update the hidden stable text while typing a name.
    form.addEventListener('input', (event) => {
      const input = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
        ? event.target.hasAttribute('data-commit-input') ? event.target : undefined
        : undefined;
      if (!input || input.hasAttribute('data-tag-commit-input')) return;
      const root = input.closest<HTMLElement>('[data-commit-root]');
      if (root) renderCommitDisplay(root);
    });

    form.querySelector('[data-checklist-reset]')?.addEventListener('click', () => {
      for (const input of form.querySelectorAll<HTMLInputElement>('input[type="checkbox"], input[type="text"]:not([data-tags-input])')) {
        const name = fieldName(input);
        if (!name) continue;
        removeValue(name);
        syncField(name, input.type === 'checkbox' ? false : '');
      }
      for (const typing of form.querySelectorAll<HTMLInputElement>('input[data-tags-input]')) {
        typing.value = '';
      }
      renderAllTags(form);
      for (const textarea of textareas) {
        const name = fieldName(textarea);
        removeValue(name);
        syncField(name, '');
      }
      for (const list of form.querySelectorAll<HTMLElement>('[data-checklist-list]')) {
        const name = listName(list);
        if (!name) continue;
        removeValue(listCountKey(name));
        resetListRows(name);
      }
      renderAllTags(form);
      refreshSectionCommits();
    });

    // Row inputs: Enter commits in place (staying on the row), Escape
    // abandons the edit. The form must never submit on Enter here.
    form.addEventListener('keydown', (event) => {
      const rowInput = event.target instanceof HTMLInputElement && event.target.hasAttribute('data-tag-row-input')
        ? event.target
        : undefined;
      if (!rowInput || (event.key !== 'Enter' && event.key !== 'Escape')) return;
      const row = rowInput.closest<HTMLElement>('.initiative-tag-row');
      const root = rowInput.closest<HTMLElement>('[data-tags-root]');
      if (!row || !root) return;
      event.preventDefault();
      if (event.key === 'Escape') {
        exitRowEdit(row);
        row.querySelector<HTMLButtonElement>('[data-tags-edit]')?.focus();
        return;
      }
      commitRowInput(root, row, 'enter');
    });

    // Roles combobox: typeahead filters the menu, Enter commits (active
    // option wins, otherwise free text becomes a custom role), arrows move.
    form.addEventListener('keydown', (event) => {
      const typing = event.target instanceof HTMLInputElement && event.target.hasAttribute('data-tags-input') ? event.target : undefined;
      if (!typing) return;
      const root = typing.closest<HTMLElement>('[data-tags-root]');
      if (!root) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!isRolesMenuOpen(root)) {
          filterRolesMenu(root, typing.value);
          setRolesMenuOpen(root, true);
        }
        moveActiveRoleOption(root, event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (event.key === 'Escape') {
        if (isRolesMenuOpen(root)) {
          event.preventDefault();
          setRolesMenuOpen(root, false);
        }
        return;
      }
      if (!(event.key === 'Enter' || event.key === ',')) return;
      event.preventDefault();
      const active = isRolesMenuOpen(root) ? activeRoleOption(root) : undefined;
      if (event.key === 'Enter' && active) {
        selectRoleOption(root, active.dataset.roleOption ?? active.textContent ?? '');
        return;
      }
      addTagFromTyping(root);
      filterRolesMenu(root, '');
      if (event.key === 'Enter') setRolesMenuOpen(root, false);
    });

    form.addEventListener('input', (event) => {
      const typing = event.target instanceof HTMLInputElement && event.target.hasAttribute('data-tags-input') ? event.target : undefined;
      if (!typing) return;
      const root = typing.closest<HTMLElement>('[data-tags-root]');
      if (!root) return;
      // Commit on comma so pasted "A, B" lists split naturally.
      if (typing.value.includes(',')) {
        addTagFromTyping(root);
        filterRolesMenu(root, '');
        typing.focus();
        return;
      }
      filterRolesMenu(root, typing.value);
      if (!isRolesMenuOpen(root)) setRolesMenuOpen(root, true);
    });

    form.addEventListener('focusin', (event) => {
      const typing = event.target instanceof HTMLInputElement && event.target.hasAttribute('data-tags-input') ? event.target : undefined;
      if (!typing) return;
      const root = typing.closest<HTMLElement>('[data-tags-root]');
      if (!root || !root.hasAttribute('data-roles-root')) return;
      closeAllRolesMenus(root);
      filterRolesMenu(root, typing.value);
      setRolesMenuOpen(root, true);
    });

    form.addEventListener('focusout', (event) => {
      const root = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-roles-root]') : undefined;
      if (!root) return;
      const next = event.relatedTarget instanceof Node ? event.relatedTarget : undefined;
      if (next && root.contains(next)) return;
      window.setTimeout(() => {
        if (root.contains(document.activeElement)) return;
        setRolesMenuOpen(root, false);
      }, 0);
    });

    form.addEventListener('change', (event) => {
      // Blur with free text commits it as a custom role.
      const typing = event.target instanceof HTMLInputElement && event.target.hasAttribute('data-tags-input') ? event.target : undefined;
      if (!typing || !typing.value.trim()) return;
      const root = typing.closest<HTMLElement>('[data-tags-root]');
      if (!root) return;
      // Blur into the row's own controls (edit/delete buttons) must not
      // commit the half-typed text first: the re-render would detach the
      // clicked button mid-gesture and drop (or misroute) its action —
      // the button's click handler takes over instead. Focus has already
      // moved when change dispatches; if it hasn't, fall through to the
      // legacy behavior below.
      const to = document.activeElement;
      if (to instanceof Element && to !== typing && root.contains(to)) return;
      addTagFromTyping(root);
      filterRolesMenu(root, '');
    });

    form.addEventListener('keydown', (event) => {
      if (event.key !== 'Backspace') return;
      const typing = event.target instanceof HTMLInputElement && event.target.hasAttribute('data-tags-input') ? event.target : undefined;
      if (!typing || typing.value !== '') return;
      const root = typing.closest<HTMLElement>('[data-tags-root]');
      const valueInput = root?.querySelector<HTMLInputElement>('input[data-tags-value][data-checklist-field]');
      if (!root || !valueInput) return;
      const tags = parseTags(valueInput.value);
      if (tags.length === 0) return;
      event.preventDefault();
      commitTags(root, tags.slice(0, -1));
    });

    form.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const editAction = event.target.closest<HTMLButtonElement>('[data-tags-edit]');
      if (editAction) {
        if (!editAction.isConnected) return;
        const root = editAction.closest<HTMLElement>('[data-tags-root]');
        if (!root) return;
        event.preventDefault();
        pinOpen(root);
        activateRowEdit(root, tagLabelFromAction(editAction));
        return;
      }
      const remove = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-tags-remove]') : undefined;
      if (!remove) return;
      if (!remove.isConnected) return;
      const root = remove.closest<HTMLElement>('[data-tags-root]');
      if (!root) return;
      event.preventDefault();
      const chip = remove.closest('.initiative-tag-chip, .initiative-tag-row');
      const label = chip?.querySelector('.initiative-tag-label, .initiative-tag-row-label')?.textContent ?? '';
      const row = remove.closest<HTMLElement>('.initiative-tag-row');
      removeTagFromRoot(root, label, row);
    });

    // Mousedown inside the open menu must not steal focus from the typing
    // input: the blur would close the menu before click fires and swallow
    // the selection. Focus stays in the combobox; click still selects.
    form.addEventListener('mousedown', (event) => {
      if (!(event.target instanceof Element)) return;
      if (!event.target.closest('[data-roles-menu]')) return;
      event.preventDefault();
    });

    // Clicking the combo box (outside chips/buttons) focuses the typing input.
    form.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const toggle = event.target.closest<HTMLButtonElement>('[data-roles-toggle]');
      if (toggle) {
        const root = toggle.closest<HTMLElement>('[data-roles-root]');
        if (!root) return;
        const typing = rolesComboInput(root);
        const open = isRolesMenuOpen(root);
        closeAllRolesMenus(root);
        if (open) {
          setRolesMenuOpen(root, false);
        } else {
          filterRolesMenu(root, typing?.value ?? '');
          setRolesMenuOpen(root, true);
          typing?.focus();
        }
        return;
      }
      const option = event.target.closest<HTMLButtonElement>('[data-role-option]');
      if (option) {
        const root = option.closest<HTMLElement>('[data-roles-root]');
        if (!root) return;
        event.preventDefault();
        selectRoleOption(root, option.dataset.roleOption ?? option.textContent ?? '');
        return;
      }
      if (event.target.closest('[data-tags-remove],[data-tags-edit]')) return;
      // Row inputs keep their own focus; never yank it to the add input.
      if (event.target instanceof Element && event.target.hasAttribute('data-tag-row-input')) return;
      const box = event.target.closest<HTMLElement>('[data-tags]');
      const typing = box?.querySelector<HTMLInputElement>('[data-tags-input]');
      if (!typing) {
        // Click elsewhere in the form closes open role menus.
        if (!event.target.closest('[data-roles-root]')) closeAllRolesMenus();
        return;
      }
      // Skills lists only focus the typing input from the add row itself
      // (or the input); clicking a skill row label is a no-op.
      const tagsRoot = box?.closest<HTMLElement>('[data-tags-root]');
      if (
        tagsRoot?.hasAttribute('data-commit-bullets') &&
        !(event.target instanceof HTMLInputElement) &&
        !event.target.closest('.initiative-tag-add-row')
      ) {
        return;
      }
      if (document.activeElement !== typing) typing.focus();
    });
  }

  // Clicking outside any roles picker closes open menus.
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest('[data-checklist]')) disarmRemoveButtons(document);
    if (event.target.closest('[data-roles-root]')) return;
    closeAllRolesMenus();
  });

  // Print/PDF: collapsed skills columns should print expanded.
  window.addEventListener('beforeprint', () => {
    for (const details of document.querySelectorAll<HTMLDetailsElement>('details[data-collapsed-cell]')) {
      details.dataset.wasOpen = details.open ? 'true' : 'false';
      details.open = true;
    }
    // Committed names/skills print as stable text/pills, never as inputs.
    for (const root of document.querySelectorAll<HTMLElement>('[data-commit-root]')) {
      const editingRow = root.querySelector<HTMLElement>('.initiative-tag-row.is-editing');
      if (editingRow) commitRowInput(root, editingRow, 'blur');
      flushTagTyping(root);
      renderCommitDisplay(root);
      root.dataset.wasLocked = root.hasAttribute('data-locked') ? 'true' : 'false';
      if (commitHasValue(root)) setCommitLocked(root, true);
    }
  });
  window.addEventListener('afterprint', () => {
    for (const details of document.querySelectorAll<HTMLDetailsElement>('details[data-collapsed-cell]')) {
      if (details.dataset.wasOpen !== 'true') details.open = false;
      delete details.dataset.wasOpen;
    }
    for (const root of document.querySelectorAll<HTMLElement>('[data-commit-root]')) {
      if (root.dataset.wasLocked !== 'true') setCommitLocked(root, false);
      delete root.dataset.wasLocked;
    }
  });
}
