// Heading anchors: every h2/h3 with an id gets an always-visible "#"
// permalink. Only the "#" itself is linked (no leading space inside the
// anchor); styling is handled in CSS via [data-heading-anchor].
import { languages, type Language } from '../data/locales';
import { t } from '../lib/i18n';
import { iconSvg } from '../lib/icons.ts';

function currentLanguage(): Language {
  const lang = document.documentElement.lang as Language;
  return languages.includes(lang) ? lang : 'en';
}

export function initHeadings(): void {
  const prose = document.querySelector('[data-prose]');
  if (!prose) return;
  const lang = currentLanguage();
  for (const heading of prose.querySelectorAll('h2[id], h3[id]')) {
    if (heading.querySelector('[data-heading-anchor]')) continue;
    const anchor = document.createElement('a');
    anchor.href = `#${heading.id}`;
    anchor.setAttribute('data-heading-anchor', '');
    anchor.setAttribute('aria-label', t(lang, 'headings.link-to-section', 'Link to this section'));
    anchor.innerHTML = iconSvg('heading-anchor');
    heading.append(anchor);
  }
}
