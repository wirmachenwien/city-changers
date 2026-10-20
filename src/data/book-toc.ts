// Build-time book table of contents: reading order from works.json,
// titles from the MDX frontmatter of the book collection (single source of
// truth — the same strings that end up in <title>/og:title), URL slugs
// derived per chapter title (src/lib/chapter-slug.ts). Server-only: the
// title map comes from astro:content.
import { getCollection } from 'astro:content';
import { chapterUrlSlug } from '../lib/chapter-slug.ts';
import { smartQuotes } from '../lib/smart-quotes.ts';
import { bookUrl, pageUrl } from '../lib/site';
import { contentsLabel, nav } from './nav';
import { getWork } from './works';
import type { Language } from './locales';

/** Chapter slugs styled as front matter (contents sheet). */
const FRONTMATTER_FILES = new Set(['contents']);

export interface TocEntry {
  /** Localised display title (smart quotes applied). */
  label: string;
  /** Catalogue file stem ("01", "contents", "glossary"). */
  file: string;
  /** URL slug derived from the frontmatter title ("01-why-this-toolbox"). */
  slug: string;
  /** Site-relative URL of the chapter. */
  url: string;
  class?: string;
}

/** Frontmatter titles of a language's book chapters, keyed by file stem. */
async function chapterTitles(lang: Language): Promise<Map<string, string>> {
  const entries = await getCollection('book', (entry) => entry.id.startsWith(`${lang}/`));
  return new Map(entries.map((entry) => [entry.id.slice(lang.length + 1), entry.data.title]));
}

/** Web table of contents: label + file + URL slug + URL for every chapter
 *  with a web page, in reading order. The contents sheet is virtual (no
 *  MDX body); its label lives in nav.json. Quotes are localised here to
 *  match the hast-transformed prose. */
export async function bookToc(lang: Language): Promise<TocEntry[]> {
  const titles = await chapterTitles(lang);
  return getWork(lang).chapters
    .filter((chapter) => chapter.web !== false)
    .map((chapter) => {
      const title = chapter.file === 'contents' ? contentsLabel(lang) : titles.get(chapter.file);
      if (!title) {
        throw new Error(`Missing frontmatter "title" in src/content/book/${lang}/${chapter.file}.mdx`);
      }
      const slug = chapterUrlSlug(chapter.file, title);
      return {
        label: smartQuotes(title, lang),
        file: chapter.file,
        slug,
        url: bookUrl(lang, slug),
        ...(FRONTMATTER_FILES.has(chapter.file) ? { class: 'frontmatter-entry' } : {}),
      };
    });
}

/** Page kinds that can paginate. Mirrors the `kind` prop of `BaseLayout`. */
export type PageKind = 'book' | 'page';

/** Pagination neighbour: a TOC entry plus its resolved URL. */
export interface NeighbourEntry {
  label: string;
  file: string;
  url: string;
}

/** Previous/next chapter around the given file, or null at the ends. */
async function chapterNeighbours(
  lang: Language,
  file: string,
): Promise<{ prev: NeighbourEntry | null; next: NeighbourEntry | null }> {
  const toc = await bookToc(lang);
  const index = toc.findIndex((entry) => entry.file === file);
  if (index === -1) return { prev: null, next: null };
  const at = (entry: TocEntry | undefined): NeighbourEntry | null =>
    entry ? { label: entry.label, file: entry.file, url: entry.url } : null;
  return {
    prev: index > 0 ? at(toc[index - 1]) : null,
    next: index < toc.length - 1 ? at(toc[index + 1]) : null,
  };
}

/** The project home page as a pagination neighbour ("Start"/"Home"/"Domov",
 *  labelled from nav.json like the header nav and breadcrumbs). */
function homeNeighbour(lang: Language): NeighbourEntry {
  const label = nav[lang].find((item) => item.nav)?.label ?? '';
  return { label: smartQuotes(label, lang), file: 'index', url: pageUrl(lang, 'index') };
}

/** Single source of truth for "which pages paginate": book pages follow the
 *  reading order, project home pages (`page` + `index`) lead into the front
 *  of the book, and the first chapter links back to the home page.
 *  Returns `null` when the page has no pagination. */
export async function paginationNeighbours(
  lang: Language,
  kind: PageKind,
  file: string,
): Promise<{ prev: NeighbourEntry | null; next: NeighbourEntry | null } | null> {
  if (kind === 'page') {
    if (file !== 'index') return null;
    const next = (await bookToc(lang))[0] ?? null;
    return next
      ? { prev: null, next: { label: next.label, file: next.file, url: next.url } }
      : null;
  }
  const { prev, next } = await chapterNeighbours(lang, file);
  const toc = await bookToc(lang);
  if (!prev && !next) return null;
  if (!prev && file === toc[0]?.file) {
    return { prev: homeNeighbour(lang), next };
  }
  return { prev, next };
}
