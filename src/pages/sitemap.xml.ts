import type { APIRoute } from 'astro';
import { settings } from '../data/settings';
import { getWork } from '../data/works';
import { bookToc } from '../data/book-toc';
import { pageUrl, canonical } from '../lib/site';
import { languages } from '../data/locales';

// Sitemap generated from content at build time: home + search pages and
// every web book chapter per language. Redirect landings, default-language
// prefixed URLs, 404 and preview pages are intentionally excluded.
export const GET: APIRoute = async () => {
  const entries: { loc: string; lastmod: string }[] = [];
  if (settings.web.indexing) {
    for (const lang of languages) {
      const lastmod = getWork(lang).modified || getWork(lang).date || '';
      const push = (url: string) => entries.push({ loc: canonical(url), lastmod });
      push(pageUrl(lang, 'index'));
      push(pageUrl(lang, 'search'));
      for (const entry of await bookToc(lang)) push(entry.url);
    }
  }
  const urls = entries
    .map(
      (entry) =>
        `  <url><loc>${entry.loc}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ''}</url>`,
    )
    .join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
