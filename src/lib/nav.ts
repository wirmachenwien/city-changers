// Navigation model: project nav + expandable book nav + breadcrumbs.
import { nav } from '../data/nav';
import { bookToc } from '../data/book-toc';
import { smartQuotes } from './smart-quotes';
import type { Language } from '../data/locales';
import { bookUrl, navFileUrl } from './site';
import { settings } from '../data/settings';

export interface NavLink {
  label: string;
  url: string;
  current: boolean;
}

/** Project navigation links for a language, with the current page flagged.
 *  Nav labels bypass the markdown pipeline, so quotes are localised here to
 *  match the hast-transformed prose. (Book labels arrive via bookToc,
 *  already localised in works.ts.) Virtual entries (nav: false, e.g. the
 *  contents sheet) are rendered by the book navigation instead. */
export function projectNav(lang: Language, currentUrl: string): NavLink[] {
  return nav[lang]
    .filter((item) => item.nav)
    .map((item) => {
      const url = navFileUrl(lang, item.file, lang);
      return { label: smartQuotes(item.label, lang), url, current: url === currentUrl };
    });
}

/** Book chapter navigation (expandable on the landing page per settings). */
export async function bookNav(lang: Language, currentUrl: string): Promise<NavLink[]> {
  const toc = await bookToc(lang);
  return toc.map((entry) => ({
    label: entry.label,
    url: entry.url,
    current: entry.url === currentUrl,
  }));
}

/** Project + book navigation in the configured order. */
export async function combinedNav(
  lang: Language,
  currentUrl: string,
): Promise<{ project: NavLink[]; book: NavLink[]; position: 'before' | 'after' }> {
  return {
    project: projectNav(lang, currentUrl),
    book: settings.web.nav.expandBooks ? await bookNav(lang, currentUrl) : [],
    position: settings.web.nav.projectNavPosition,
  };
}

/** Breadcrumb trail for a book page: home > chapter (> subchapter)*.
 *  The parent chain derives from the slash-separated catalogue file
 *  ("02/a/b" -> home > 02 > a > b), so flat chapters render two layers
 *  and future subchapters nest to any depth. Parent labels and URLs
 *  resolve via the book TOC with a raw-slug fallback. */
export async function bookCrumbs(lang: Language, file: string, title: string): Promise<NavLink[]> {
  const homeLabel = nav[lang].find((item) => item.nav)?.label ?? '';
  const segments = file.split('/').filter(Boolean);
  const toc = await bookToc(lang);
  const parents = segments.slice(0, -1).map((segment, index) => {
    const path = segments.slice(0, index + 1).join('/');
    const entry = toc.find((chapter) => chapter.file === path)
      ?? toc.find((chapter) => chapter.file === segment);
    return { label: entry?.label ?? segment, url: entry?.url ?? bookUrl(lang, path), current: false };
  });
  return [
    { label: homeLabel, url: navFileUrl(lang, 'index', lang), current: false },
    ...parents,
    { label: title, url: '', current: true },
  ];
}

/** Breadcrumb trail for a project page: home > page. */
export function pageCrumbs(lang: Language, title: string): NavLink[] {
  const homeLabel = nav[lang].find((item) => item.nav)?.label ?? '';
  return [
    { label: homeLabel, url: navFileUrl(lang, 'index', lang), current: false },
    { label: title, url: '', current: true },
  ];
}
