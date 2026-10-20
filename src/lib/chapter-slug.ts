// URL slugs for book chapters, derived from the MDX frontmatter title.
// Shared by the site (routes, navigation, sitemap), astro.config.mjs
// (legacy-URL redirects) and scripts/bin/check-site.mjs — plain erasable
// TypeScript so Node can import it directly (type stripping).
//
// Scheme: numbered catalogue files keep their zero-padded number and get a
// normalised title appended ("01" + "1. Why this toolbox?" ->
// "01-why-this-toolbox"); named files ("contents", "glossary") keep their
// name so stable URLs stay stable.
//
// Normalisation: German umlauts map to their ae/oe/ue/ss digraphs, all
// remaining diacritics are stripped via NFKD (Slovenian č/ž/š -> c/z/s),
// everything else lowercases and collapses to hyphens. Locale-agnostic and
// deterministic across de/en/sl.

const UMLAUTS: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
  Ä: 'ae',
  Ö: 'oe',
  Ü: 'ue',
};

/** Title normalised for use in a URL slug (no leading chapter number). */
export function slugifyTitle(title: string): string {
  let slug = title.replace(/^\d+\.?\s+/, '');
  slug = slug.replace(/[äöüßÄÖÜ]/g, (char) => UMLAUTS[char] ?? char);
  slug = slug.normalize('NFKD').replace(/\p{M}/gu, '');
  slug = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (slug.length > 60) slug = slug.slice(0, 60).replace(/-[^-]*$/, '');
  return slug;
}

/** URL slug of a chapter: `NN-title` for numbered files, the file name for
 *  named files ("contents", "glossary"). */
export function chapterUrlSlug(file: string, title: string): string {
  if (!/^\d+$/.test(file)) return file;
  const slug = slugifyTitle(title);
  return slug ? `${file}-${slug}` : file;
}
