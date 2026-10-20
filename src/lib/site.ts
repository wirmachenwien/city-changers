// Site-wide URL helpers. All internal links go through these so the
// project subpath (base) and the multilingual scheme stay consistent.
// The default language lives at the root (no prefix); every other language
// lives under /<lang>/ and /book/<lang>/.
import { site, base, defaultLang, languages } from '../../handbook.config.ts';
import type { Language } from '../../handbook.config.ts';

export const SITE_URL = site;
export const BASE_PATH = base.endsWith('/') ? base.slice(0, -1) : base;

/** Default language, served without a URL prefix. */
export const DEFAULT_LANG: Language = defaultLang;

/** Every handbook language, in config order. */
export const LANGUAGES: readonly Language[] = languages;

/** Prefix a root-relative path with the project subpath. */
export function withBase(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_PATH}${clean === '/' ? '/' : clean}`;
}

function langPrefix(lang: Language): string {
  return lang === DEFAULT_LANG ? '' : `/${lang}`;
}

/** URL of a project page ("index" | "search"). */
export function pageUrl(lang: Language, file: string): string {
  if (file === 'index') return withBase(`${langPrefix(lang)}/`);
  return withBase(`${langPrefix(lang)}/${file}.html`);
}

/** URL of a book slug ("01-why-this-toolbox", "contents", ...). The
 *  "index" entry resolves to the book directory itself (redirect stub). */
export function bookUrl(lang: Language, slug: string): string {
  const folder = lang === DEFAULT_LANG ? 'book' : `book/${lang}`;
  if (slug === 'index') return withBase(`/${folder}/`);
  return withBase(`/${folder}/${slug}.html`);
}

/** Resolve a nav "file" value (e.g. "index" or "book/contents") to a URL. */
export function navFileUrl(lang: Language, file: string, fallbackLang: Language = DEFAULT_LANG): string {
  if (file.startsWith('book/')) {
    return bookUrl(fallbackLang, file.slice('book/'.length));
  }
  return pageUrl(lang, file);
}

/** Absolute canonical URL for a site-relative URL. */
export function canonical(url: string): string {
  return `${SITE_URL}${url}`;
}
