// @ts-check
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import { remarkBackslashMath } from './src/lib/remark-backslash-math.mjs';
import rehypeColorPebbles from './src/lib/rehype-color-pebbles.mjs';
import { smartQuotesRehypePlugin } from './src/lib/satteri-smart-quotes.ts';
import { chapterUrlSlug } from './src/lib/chapter-slug.ts';
import { site, base, defaultLang, languages } from './handbook.config.ts';

/** @typedef {{ file: string, web?: boolean }} Chapter */
/** @typedef {{ chapters?: Chapter[] }} Work */

const root = dirname(fileURLToPath(import.meta.url));
// Direct Astro invocations must not silently use an outdated palette either.
const colorSource = readFileSync(join(root, 'design/colors.json'));
const colorOutput = JSON.parse(readFileSync(join(root, 'src/data/colors.generated.json'), 'utf8'));
if (colorOutput.registrySha256 !== createHash('sha256').update(colorSource).digest('hex')) {
  throw new Error('Generated colors are outdated; run npm run colors:generate');
}
const readJson = (/** @type {string} */ path) =>
  JSON.parse(readFileSync(join(root, path), 'utf8'));

const works = /** @type {Record<string, Work>} */ (readJson('src/data/works.json'));

/** Frontmatter title of a book chapter (mirrors the content collection). */
function mdxTitle(/** @type {string} */ lang, /** @type {string} */ file) {
  const text = readFileSync(join(root, `src/content/book/${lang}/${file}.mdx`), 'utf8');
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  const title = frontmatter.match(/^title:\s*(.+)$/m)?.[1]?.trim().replace(/^["'](.*)["']$/, '$1');
  if (!title) throw new Error(`astro.config: missing frontmatter title in src/content/book/${lang}/${file}.mdx`);
  return title;
}

/** URL slug of a web chapter (contents is virtual; label lives in nav.json). */
function chapterSlug(/** @type {string} */ lang, /** @type {string} */ file) {
  if (file === 'contents') return 'contents';
  return chapterUrlSlug(file, mdxTitle(lang, file));
}

// Legacy numbered URLs (/book/01.html, /book/de/01.html, ...) redirect to the
// title-slug URLs, and the default language stays canonical at the root
// (/book/en/<slug> -> /book/<slug>). Single hop: prefixed legacy URLs point
// straight at the new unprefixed target.
/** @type {Record<string, string>} */
const bookRedirects = {};
for (const lang of languages) {
  const prefix = lang === defaultLang ? '' : `/${lang}`;
  for (const chapter of works[lang]?.chapters ?? []) {
    if (chapter.web === false) continue;
    const slug = chapterSlug(lang, chapter.file);
    if (slug !== chapter.file) {
      bookRedirects[`/book${prefix}/${chapter.file}`] = `/book${prefix}/${slug}`;
    }
    if (lang === defaultLang) {
      bookRedirects[`/book/${defaultLang}/${chapter.file}`] = `/book/${slug}`;
      bookRedirects[`/book/${defaultLang}/${slug}`] = `/book/${slug}`;
    }
  }
}

export default defineConfig({
  site,
  base,
  output: 'static',
  build: {
    // Keep the historic URL scheme: about.astro -> about.html,
    // book/01-slug -> book/01-slug.html (no trailing-slash directories).
    format: 'file',
  },
  // The default language is canonical at the root (/ and /book/), but the
  // prefixed form should still resolve and redirect consistently. Legacy
  // numbered chapter URLs keep working via redirects after the
  // title-slug migration.
  redirects: {
    [`/${defaultLang}`]: '/',
    [`/${defaultLang}/search`]: '/search',
    [`/book/${defaultLang}`]: '/book',
    ...bookRedirects,
  },
  integrations: [mdx()],
  markdown: {
    // Render-time typographic quotes: source keeps straight `"` / `'`,
    // output gets „ “ (de/sl) or “ ” (en) per frontmatter `lang`.
    // MDX inherits this processor (extendMarkdownConfig defaults to true).
    // Sätteri's built-in English quotes stay off so the plugin below has
    // straight quotes left to localise; dashes/ellipses are untouched.
    processor: unified({
      gfm: true,
      smartypants: false,
      remarkPlugins: [remarkBackslashMath, remarkMath],
      rehypePlugins: [rehypeKatex, smartQuotesRehypePlugin(defaultLang), [rehypeColorPebbles, { brandOnly: true }]],
    }),
  },
});
