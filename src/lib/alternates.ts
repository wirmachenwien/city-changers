// Same-page URLs in every language (for the language switcher + hreflang).
// Lives apart from lib/site.ts because book chapters resolve their
// per-language URL slug from the MDX frontmatter title via the content
// collection — server-only, while lib/site.ts stays client-safe.
import { languages } from '../../handbook.config.ts';
import type { Language } from '../../handbook.config.ts';
import { bookToc } from '../data/book-toc';
import { bookUrl, pageUrl } from './site';

export async function alternates(
  kind: 'page' | 'book',
  file: string,
): Promise<{ lang: Language; url: string }[]> {
  if (kind === 'page') {
    return languages.map((lang) => ({ lang, url: pageUrl(lang, file) }));
  }
  return Promise.all(
    languages.map(async (lang) => {
      const entry = (await bookToc(lang)).find((chapter) => chapter.file === file);
      return { lang, url: entry?.url ?? bookUrl(lang, file) };
    }),
  );
}
