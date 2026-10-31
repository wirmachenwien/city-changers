// Copy-to-clipboard buttons ([data-copy], incl. share-link buttons).
import { languages, type Language } from '../data/locales';
import { t } from '../lib/i18n';

function currentLanguage(): Language {
  const lang = document.documentElement.lang as Language;
  return languages.includes(lang) ? lang : 'en';
}

export function initCopy(): void {
  const lang = currentLanguage();
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
    if (button.dataset.wired) continue;
    button.dataset.wired = 'true';
    if (!button.querySelector('[data-copy-text]')) {
      const label = document.createElement('span');
      label.dataset.copyText = '';
      // Own only the text label, never sibling icons or drawn decoration.
      for (const node of [...button.childNodes]) {
        if (node.nodeType === Node.TEXT_NODE) label.append(node);
      }
      button.append(label);
    }
    button.dataset.copyLabel ??= button.querySelector('[data-copy-text]')?.textContent ?? '';
    button.addEventListener('click', async () => {
      const value = button.dataset.copy ?? '';
      try {
        await navigator.clipboard.writeText(value);
        flash(button, button.dataset.copiedLabel ?? t(lang, 'copy.copied', 'Copied'), true);
      } catch {
        flash(button, button.dataset.failedLabel ?? t(lang, 'copy.copy-failed', 'Sorry, try again'), false);
      }
    });
  }
}

const timers = new Map<HTMLButtonElement, number>();

function flash(button: HTMLButtonElement, message: string, done: boolean): void {
  // initCopy gives every button a dedicated label; siblings stay untouched.
  const label = button.querySelector('[data-copy-text]')!;
  label.textContent = message;
  const copyIcon = button.querySelector('[data-copy-icon]');
  const doneIcon = button.querySelector('[data-copied-icon]');
  if (copyIcon && doneIcon) {
    copyIcon.toggleAttribute('hidden', done);
    doneIcon.toggleAttribute('hidden', !done);
  }
  window.clearTimeout(timers.get(button));
  timers.set(
    button,
    window.setTimeout(() => {
      timers.delete(button);
      const original = button.dataset.copyLabel ?? '';
      label.textContent = original;
      if (copyIcon && doneIcon) {
        copyIcon.removeAttribute('hidden');
        doneIcon.setAttribute('hidden', '');
      }
    }, 1600),
  );
}
