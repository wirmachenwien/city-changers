// Footnote popups: tapping a reference opens the shared anchored popup.
import { languages, type Language } from '../data/locales';
import { t } from '../lib/i18n';
import { bindContentPopup } from './content-popup';
import { iconSvg } from '../lib/icons.ts';

const BACK_ICON_SVG = iconSvg('footnote-up');

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
    back.addEventListener('click', (event) => {
      event.preventDefault();
      history.pushState(null, '', back.getAttribute('href'));
      // Finish the jump before opening: a popup positioned during smooth
      // scrolling would initially be anchored to an off-screen reference.
      ref.scrollIntoView({ behavior: 'instant', block: 'start' });
      ref.focus({ preventScroll: true });
      ref.click();
    });
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
