#!/usr/bin/env node
// Built-site integrity checks against the static build (dist/).
// Covers every language: each expected page exists with the right
// <html lang>, the search form routes to the language-local search page,
// every page links to its equivalents in the other languages, every local
// link/image/form target resolves to a built file, the contents page links
// every chapter, and every language has searchable content for a
// representative query term.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, posix } from 'node:path';
import { site, base, defaultLang, languages } from '../../handbook.config.ts';
import { DIST_DIR, normalizeBase } from '../lib/paths.mjs';
import { createReporter } from '../lib/reporter.mjs';

const BASE = normalizeBase(base);
const LANGS = [...languages];
// PDF/EPUB downloads are optional locally (`npm run build` skips them with a
// warning when Python is unavailable), so missing download targets only warn
// instead of failing. A present downloads dir is still checked strictly (a
// wrong filename stem must fail), and CI always builds downloads, so release
// builds stay strict.
function downloadsBuilt() {
  try {
    return readdirSync(join(DIST_DIR, 'downloads')).some((name) => /\.(pdf|epub)$/i.test(name));
  } catch {
    return false;
  }
}
const HAS_DOWNLOADS = downloadsBuilt();
// Cover/title sheets are print-only; the web book starts at the contents
// page and the "index" entry is a redirect to the contents page. Reading
// order comes from works.json (same source the site renders from).
const WORKS = JSON.parse(readFileSync('src/data/works.json', 'utf8'));
const PAGE_FILES = ['index', 'search'];
const SEARCH_TERMS = { de: 'Superblocks', en: 'superblocks', sl: 'superbloki' };

function bookFiles(lang) {
  const chapters = WORKS[lang]?.chapters ?? [];
  return [...chapters.filter((chapter) => chapter.web !== false).map((chapter) => chapter.file), 'index'];
}

const reporter = createReporter();
const fail = (message) => reporter.fail(message);

function pagePath(lang, kind, file) {
  if (kind === 'book') {
    const folder = lang === defaultLang ? 'book' : `book/${lang}`;
    return file === 'index' ? `${folder}/index.html` : `${folder}/${file}.html`;
  }
  if (file === 'index') return lang === defaultLang ? 'index.html' : `${lang}/index.html`;
  return lang === defaultLang ? `${file}.html` : `${lang}/${file}.html`;
}

function readPage(rel) {
  const full = join(DIST_DIR, rel);
  if (!existsSync(full)) {
    fail(`missing page ${rel}`);
    return null;
  }
  return readFileSync(full, 'utf8');
}

function htmlLang(html) {
  return html.match(/<html[^>]*\blang="([^"]+)"/)?.[1];
}

function searchFormAction(html) {
  const form = html.match(/<form[^>]*class="search-form"[^>]*>/)?.[0]
    ?? html.match(/<form[^>]*data-search-form[^>]*>/)?.[0];
  return form?.match(/action="([^"]+)"/)?.[1];
}

function links(html) {
  const out = [];
  for (const match of html.matchAll(/<(?:a|link)[^>]*href="([^"]+)"/g)) out.push(match[1]);
  for (const match of html.matchAll(/<option[^>]*value="([^"]+)"/g)) out.push(match[1]);
  for (const match of html.matchAll(/<img[^>]*src="([^"]+)"/g)) out.push(match[1]);
  const action = searchFormAction(html);
  if (action) out.push(action);
  return out;
}

function resolveUrl(from, url) {
  if (/^(https?:|mailto:|tel:|data:)/.test(url) || url.startsWith('#')) return null;
  if (url.startsWith('/')) return url;
  const dir = posix.dirname(`/${from}`);
  return posix.normalize(posix.join(dir, url));
}

let checked = 0;
for (const lang of LANGS) {
  const expected = [
    ...PAGE_FILES.map((file) => ({ kind: 'page', file })),
    ...bookFiles(lang).map((file) => ({ kind: 'book', file })),
  ];
  for (const { kind, file } of expected) {
    const rel = pagePath(lang, kind, file);
    const html = readPage(rel);
    if (!html) continue;
    checked += 1;

    if (htmlLang(html) !== lang) fail(`${rel}: <html lang> is ${htmlLang(html)}, want ${lang}`);

    // Redirect landings (book indexes) carry no search form or drawer.
    const isRedirect = /<meta[^>]*http-equiv="refresh"/.test(html);

    // Search form routes to the language-local search page.
    if (!isRedirect) {
      const expectedSearch = `${BASE}/${lang === defaultLang ? '' : `${lang}/`}search.html`.replace(/\/+/g, '/');
      const action = searchFormAction(html);
      if (!action) {
        fail(`${rel}: no search form found`);
      } else if (resolveUrl(rel, action) !== expectedSearch) {
        fail(`${rel}: search action ${action} resolves oddly, want ${expectedSearch}`);
      }
    }

    // Language switcher: links to the same page in the other languages.
    const expectedAlt = (other) => {
      if (file === 'index') {
        if (kind === 'book') return `${BASE}/${other === defaultLang ? 'book/' : `book/${other}/`}`;
        return `${BASE}/${other === defaultLang ? '' : `${other}/`}`;
      }
      const target = pagePath(other, kind, file);
      return `${BASE}/${target}`;
    };
    const others = LANGS.filter((other) => other !== lang).map(expectedAlt);
    const rawLinks = links(html);
    const hrefs = rawLinks.map((href) => resolveUrl(rel, href));
    for (const other of others) {
      if (!hrefs.includes(other)) fail(`${rel}: missing language-switch link to ${other}`);
    }

    // Every local link target must exist in dist/.
    for (const raw of rawLinks) {
      const resolved = resolveUrl(rel, raw);
      if (!resolved || !resolved.startsWith(`${BASE}/`)) continue;
      let local = resolved.slice(BASE.length + 1).split(/[?#]/)[0];
      if (local.endsWith('/')) local += 'index.html';
      if (local === '') local = 'index.html';
      if (!existsSync(join(DIST_DIR, local)) && !existsSync(join(DIST_DIR, `${local}.html`))) {
        // Allow pagefind runtime + hashed asset URLs (checked separately below).
        if (!local.startsWith('_astro/') && !local.startsWith('pagefind/')) {
          if (local.startsWith('downloads/') && !HAS_DOWNLOADS) {
            console.warn(`WARN: ${rel}: download not built: ${raw} (run npm run build:downloads)`);
          } else {
            fail(`${rel}: broken local link ${raw} (-> ${local})`);
          }
        }
      }
    }

    if (file === 'contents') {
      for (let chapter = 1; chapter <= 6; chapter += 1) {
        const target = `${BASE}/${lang === defaultLang ? 'book' : `book/${lang}`}/${String(chapter).padStart(2, '0')}.html`;
        if (!hrefs.includes(target)) fail(`${rel}: contents missing chapter link ${target}`);
      }
      const glossaryTarget = `${BASE}/${lang === defaultLang ? 'book' : `book/${lang}`}/glossary.html`;
      if (!hrefs.includes(glossaryTarget)) fail(`${rel}: contents missing chapter link ${glossaryTarget}`);
    }
  }

  // Representative search term must occur in this language's content and the
  // target pages must exist in dist/.
  const term = SEARCH_TERMS[lang] ?? SEARCH_TERMS[defaultLang];
  if (!term) {
    fail(`${lang}: no representative search term configured`);
    continue;
  }
  const hits = [];
  for (const file of [...PAGE_FILES, ...bookFiles(lang)]) {
    for (const kind of ['pages', 'book']) {
      const src = kind === 'pages'
        ? `src/content/pages/${lang}/${file}.mdx`
        : `src/content/book/${lang}/${file}.mdx`;
      if (existsSync(src) && readFileSync(src, 'utf8').toLowerCase().includes(term.toLowerCase())) {
        hits.push(pagePath(lang, kind === 'pages' ? 'page' : 'book', file));
      }
    }
  }
  if (hits.length === 0) fail(`${lang}: no content hits for representative term "${term}"`);
  for (const hit of hits.slice(0, 5)) {
    if (!existsSync(join(DIST_DIR, hit))) fail(`${lang}: search hit target missing from dist: ${hit}`);
  }
  console.log(`${lang}: ${hits.length} content file(s) match "${term}"`);
}

// Pagefind index must cover every language.
const entryFile = join(DIST_DIR, 'pagefind/pagefind-entry.json');
if (!existsSync(entryFile)) {
  fail('pagefind index missing (run npm run build:search)');
} else {
  const entry = JSON.parse(readFileSync(entryFile, 'utf8'));
  for (const lang of LANGS) {
    const count = entry.languages?.[lang]?.page_count ?? 0;
    if (count < 10) fail(`pagefind: only ${count} ${lang} pages indexed`);
    else console.log(`pagefind: ${count} ${lang} pages indexed`);
  }
}

// Content-generated sitemap must list every expected page exactly once,
// with canonical absolute URLs and no redirect entries.
const sitemapFile = join(DIST_DIR, 'sitemap.xml');
if (!existsSync(sitemapFile)) {
  fail('sitemap.xml missing (src/pages/sitemap.xml.ts)');
} else {
  const xml = readFileSync(sitemapFile, 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const expected = [];
  const canonical = (rel) => {
    const clean = rel.replace(/(^|\/)index\.html$/, '/').replace(/^\/+/, '');
    return `${site}${BASE}/${clean}`;
  };
  for (const lang of LANGS) {
    for (const file of PAGE_FILES) expected.push(canonical(pagePath(lang, 'page', file)));
    for (const file of bookFiles(lang).filter((file) => file !== 'index')) {
      expected.push(canonical(pagePath(lang, 'book', file)));
    }
  }
  for (const url of expected) {
    if (!locs.includes(url)) fail(`sitemap: missing ${url}`);
  }
  for (const url of locs) {
    if (!expected.includes(url)) fail(`sitemap: unexpected entry ${url}`);
  }
  console.log(`sitemap: ${locs.length} entries, all expected pages covered`);
}

console.log(`Checked ${checked} pages: language, switching, navigation, search routing, images and local links.`);
if (reporter.hasFailures()) {
  console.error(`${reporter.failures} check(s) failed`);
  process.exit(1);
}
