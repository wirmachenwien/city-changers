// Binary dark/light toggle with OS fallback.
//
// - No stored choice means "system": no data-theme attribute and CSS follows
//   prefers-color-scheme via :root:not([data-theme]).
// - The button alternates between "system" and an explicit override that is
//   always the opposite of the system theme: with a dark OS it toggles
//   system-dark <-> light, with a light OS system-light <-> dark. Going back
//   to system (rather than pinning light/dark) means the site keeps tracking
//   OS changes after every second click.
// - A tiny inline script in BaseLayout mirrors this read so the attribute
//   exists before first paint (no white flash on dark).
// - The managed theme-color meta (last one wins) tracks the effective
//   theme so the browser chrome matches even when the override differs
//   from the OS setting; the two static media-based metas stay as the
//   no-JS fallback.
// - The masthead button shows the action target (moon while light, sun
//   while dark); its accessible name names the target mode.

const STORAGE_KEY = 'wmw-theme';
const LIGHT_PAPER = '#fdfcf9';
const DARK_PAPER = '#161511';

type ThemeMode = 'light' | 'dark' | 'system';

function readMode(fallback: ThemeMode = 'system'): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark') return raw;
  } catch {
    // Preserve the in-memory choice if storage is unavailable.
    return fallback;
  }
  return 'system';
}

function systemIsDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function writeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Storage unavailable: still apply for this page view.
  }
}

function effective(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  return systemIsDark() ? 'dark' : 'light';
}

function syncMeta(mode: ThemeMode): void {
  const content = effective(mode) === 'dark' ? DARK_PAPER : LIGHT_PAPER;
  let meta = document.head.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"][data-theme-managed]',
  );
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('data-theme-managed', '');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', content);
}

function syncButton(mode: ThemeMode): void {
  const shown = effective(mode);
  // Masthead + drawer-float instances stay in sync (only one is visible).
  for (const button of document.querySelectorAll<HTMLElement>('[data-theme-toggle]')) {
    button.setAttribute('data-mode', shown);
    const target = shown === 'dark' ? 'toLight' : 'toDark';
    const label =
      target === 'toLight' ? button.dataset.labelToLight : button.dataset.labelToDark;
    if (label) button.setAttribute('aria-label', label);
  }
}

export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') root.dataset.theme = mode;
  else delete root.dataset.theme;
  syncButton(mode);
  syncMeta(mode);
}

export function initTheme(): void {
  // Track the current choice in memory too: blocked localStorage must not
  // make every click behave like the first one.
  let mode = readMode();
  applyTheme(mode);

  function selectMode(next: ThemeMode): void {
    mode = next;
    writeMode(next);
    applyTheme(next);
  }

  for (const button of document.querySelectorAll('[data-theme-toggle]')) {
    button.addEventListener('click', () => {
      // Always change the visible theme, including when a stored explicit
      // choice already equals the OS. Still return to system when possible.
      const target = effective(mode) === 'dark' ? 'light' : 'dark';
      selectMode(target === effective('system') ? 'system' : target);
    });
  }

  // OS flip (manual switch or scheduled appearance change): re-apply when
  // following, and dissolve a redundant override — an explicit pin that now
  // equals the system theme does nothing but block future flips, so collapse
  // it back to system. A pin that still differs is genuine user intent and
  // is left alone.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (mode === 'system') {
      applyTheme('system');
    } else if (mode === effective('system')) {
      selectMode('system');
    }
  });

  // bfcache restores can skip suspended listeners across an OS flip while
  // frozen; re-sync on return. Same for a toggle made in another tab.
  window.addEventListener('pageshow', () => {
    mode = readMode(mode);
    applyTheme(mode);
  });
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      mode = readMode();
      applyTheme(mode);
    }
  });
}
