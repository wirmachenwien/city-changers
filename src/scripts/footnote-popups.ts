// Footnote popups: tapping a reference shows the note inline.
import { languages, type Language } from '../data/locales';
import { t } from '../lib/i18n';

const X_ICON_SVG =
  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 4l16 16" /><path d="M20 4L4 20" /></svg>';

// Mirrors Icon.astro `back` (feather corner-up-left). Duplicated as a string
// because this bundle runs at runtime and cannot import an .astro component.
const BACK_ICON_SVG =
  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>';

function currentLanguage(): Language {
  const lang = document.documentElement.lang as Language;
  return languages.includes(lang) ? lang : 'en';
}

export function initFootnotePopups(closeLabel = 'Close'): void {
  const lang = currentLanguage();
  const openLabel = t(lang, 'footnotes.open', 'Open footnote');
  const closeFootnoteLabel = t(lang, 'footnotes.close', 'Close footnote');
  const refs = [...document.querySelectorAll<HTMLElement>('[data-footnote-ref]')];
  refs.forEach((ref, index) => {
    if (ref.dataset.wired) return;
    ref.dataset.wired = 'true';
    ref.title = openLabel;
    ref.setAttribute('aria-label', openLabel);
    const number = ref.dataset.footnoteNumber || String(index + 1);
    const sup = ref.querySelector('sup');
    if (sup && !sup.textContent?.trim()) sup.textContent = number;
    ref.addEventListener('click', (event) => {
      const describedBy = ref.getAttribute('aria-describedby');
      const target = describedBy ? document.getElementById(describedBy) : ref.nextElementSibling;
      if (!target) return;
      event.preventDefault();
      const existing = ref.parentElement?.querySelector('.footnote-popup[data-for-note]');
      existing?.remove();
      if (existing) {
        ref.title = openLabel;
        ref.setAttribute('aria-label', openLabel);
        return;
      }
      const popup = document.createElement('div');
      popup.className = 'footnote-popup';
      popup.setAttribute('data-for-note', '');
      const closer = document.createElement('button');
      closer.type = 'button';
      closer.className = 'footnote-popup-close';
      closer.title = closeFootnoteLabel || closeLabel;
      closer.setAttribute('aria-label', closeFootnoteLabel || closeLabel);
      closer.innerHTML = X_ICON_SVG;
      closer.addEventListener('click', () => {
        popup.remove();
        ref.title = openLabel;
        ref.setAttribute('aria-label', openLabel);
      });
      popup.append(closer);
      const note = target.cloneNode(true);
      if (note instanceof HTMLElement) note.hidden = false;
      popup.append(note);
      ref.after(popup);
      const rect = ref.getBoundingClientRect();
      popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - popup.offsetWidth - 8))}px`;
      popup.style.top = `${rect.bottom + 6}px`;
      ref.title = closeFootnoteLabel;
      ref.setAttribute('aria-label', closeFootnoteLabel);
    });
  });

  const prose = document.querySelector<HTMLElement>('[data-prose]');
  const article = prose ?? document.querySelector<HTMLElement>('main.article') ?? document.querySelector<HTMLElement>('main');
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
