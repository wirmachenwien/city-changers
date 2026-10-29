// Footnote popups: tapping a reference opens the shared anchored popup.
import { languages, type Language } from '../data/locales';
import { t } from '../lib/i18n';
import { bindContentPopup } from './content-popup';

// Corner-up-left backlink, turned clockwise so its arrow points upward.
const BACK_ICON_SVG =
  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="10 9 15 4 20 9" /><path d="M4 20h7a4 4 0 0 0 4-4V4" /></svg>';

function currentLanguage(): Language {
  const lang = document.documentElement.lang as Language;
  return languages.includes(lang) ? lang : 'en';
}

export function initFootnotePopups(closeLabel = 'Close'): void {
  const lang = currentLanguage();
  const openLabel = t(lang, 'footnotes.open', 'Open footnote');
  const closeFootnoteLabel = t(lang, 'footnotes.close', 'Close footnote');
  const prose = document.querySelector<HTMLElement>('[data-prose]');
  const article = prose ?? document.querySelector<HTMLElement>('main.article') ?? document.querySelector<HTMLElement>('main');
  const refs = [...document.querySelectorAll<HTMLElement>('[data-footnote-ref]')];
  refs.forEach((ref, index) => {
    if (ref.dataset.wired) return;
    ref.dataset.wired = 'true';
    ref.setAttribute('aria-label', openLabel);
    const number = ref.dataset.footnoteNumber || String(index + 1);
    const sup = ref.querySelector('sup');
    if (sup && !sup.textContent?.trim()) sup.textContent = number;
    const describedBy = ref.getAttribute('aria-describedby');
    const target = describedBy ? document.getElementById(describedBy) : ref.nextElementSibling;
    if (!target) return;
    bindContentPopup(ref, {
      content: () => target.textContent ?? '',
      label: openLabel,
      closeLabel: closeFootnoteLabel || closeLabel,
      action: article?.contains(ref) && target.textContent?.trim() ? {
        href: `#listed-${describedBy || number}`,
        label: t(lang, 'footnotes.jump-to-note', 'Jump to footnote'),
      } : undefined,
    });
  });

  if (!article || article.querySelector('[data-generated-footnotes]')) return;
  const articleRefs = refs.filter((ref) => article.contains(ref));
  if (articleRefs.length === 0) return;

  const list = document.createElement('ol');
  for (const [index, ref] of articleRefs.entries()) {
    const describedBy = ref.getAttribute('aria-describedby');
    const target = describedBy ? document.getElementById(describedBy) : ref.nextElementSibling;
    if (!target?.textContent?.trim()) continue;
    const number = ref.dataset.footnoteNumber || String(index + 1);
    const item = document.createElement('li');
    item.id = `listed-${describedBy || number}`;
    item.tabIndex = -1;
    item.textContent = target.textContent.trim();
    const back = document.createElement('a');
    back.href = `#${ref.id}`;
    back.className = 'footnote-back';
    const backLabel = t(lang, 'footnotes.back-to-text', 'Back to text');
    back.title = backLabel;
    back.setAttribute('aria-label', backLabel);
    back.innerHTML = BACK_ICON_SVG;
    item.append(' ', back);
    list.append(item);
  }
  if (list.children.length === 0) return;

  const section = document.createElement('section');
  section.className = 'footnotes';
  section.setAttribute('data-generated-footnotes', '');
  section.setAttribute('aria-label', t(currentLanguage(), 'footnotes.notes', 'Notes'));
  section.append(list);
  article.append(section);
}
