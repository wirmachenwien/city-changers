// Shared definition popups for native buttons inside <dfn> elements.
import { bindContentPopup } from './content-popup';
import { t } from '../lib/i18n';
import { languages, type Language } from '../data/locales';

export function initDefinitions(): void {
  const pageLang = document.documentElement.lang as Language;
  const lang = languages.includes(pageLang) ? pageLang : 'en';
  for (const term of document.querySelectorAll<HTMLElement>('[data-definition]')) {
    if (term.dataset.wired) continue;
    term.dataset.wired = 'true';
    bindContentPopup(term, {
      content: () => term.dataset.definition ?? '',
      label: term.textContent?.trim() ?? '',
      closeLabel: t(lang, 'input.close', 'Close'),
    });
  }
}
