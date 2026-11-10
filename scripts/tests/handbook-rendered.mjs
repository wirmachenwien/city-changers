// Build first: npm run build && node --test scripts/tests/handbook-rendered.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { chapterUrlSlug } from '../../src/lib/chapter-slug.ts';
import { defaultLang, languages, site, base } from '../../handbook.config.ts';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const SOURCE_LANG = 'en';
const chapters = lang => readdirSync(new URL(`../../src/content/book/${lang}/`, import.meta.url))
  .filter(file => file.endsWith('.mdx')).map(file => file.replace(/\.mdx$/, '')).sort();
const sourceChapters = chapters(SOURCE_LANG);
function page(lang, chapter) {
  const title = read(`src/content/book/${lang}/${chapter}.mdx`)
    .match(/^title:\s*(.+)$/m)[1].replace(/^["'](.*)["']$/, '$1');
  const folder = lang === defaultLang ? 'book' : `book/${lang}`;
  return parseHTML(read(`dist/${folder}/${chapterUrlSlug(chapter, title)}.html`)).document.querySelector('main');
}

for (const lang of languages) {
  test(`${lang}: glossary is chapter seven and the final reading-order entry`, () => {
    const work = JSON.parse(read('src/data/works.json'))[lang];
    assert.deepEqual(work.chapters.filter(chapter => chapter.web !== false).map(chapter => chapter.file),
      ['contents', '01', '02', '03', '04', '05', '06', 'glossary']);
    const glossary = page(lang, 'glossary');
    assert.match(glossary.querySelector('h1').textContent, /^7\. /);
    const navigation = glossary.ownerDocument.querySelector('.side-nav .nav-list--chapters');
    assert.deepEqual([...navigation.querySelectorAll('.nav-chapter__number')].map(node => node.textContent),
      ['1', '2', '3', '4', '5', '6', '7']);
    assert.ok(navigation.lastElementChild.querySelector('a').getAttribute('href').endsWith('/glossary.html'));
    assert.ok(page(lang, '06').querySelector('.pagination a[rel="next"]').getAttribute('href').endsWith('/glossary.html'));
    assert.equal(glossary.querySelector('.pagination a[rel="next"]'), null);
    assert.match(glossary.querySelector('.pagination a[rel="prev"]').getAttribute('href'), /\/06-/);
  });

  test(`${lang}: handbook has no duplicate headings or published editorial placeholders`, () => {
    const home = lang === defaultLang ? 'index.html' : `${lang}/index.html`;
    const pages = [parseHTML(read(`dist/${home}`)).document.querySelector('main'),
      ...sourceChapters.map(chapter => page(lang, chapter))];
    for (const main of pages) {
      assert.equal(main.querySelectorAll('h1').length, 1, 'each page needs a real title');
      const headings = [...main.querySelectorAll('h1, h2, h3')].map(node => node.textContent.trim().replace(/[.?!]$/, ''));
      assert.equal(new Set(headings).size, headings.length, 'headings must not repeat');
      assert.doesNotMatch(main.textContent, /\[(?:add\b|To be embedded|Ziele und Absichten|Cilji in nameni|weiteren Autor|nadaljnji sodelujoči)|(?:Kapitel|poglavje) x\b/);
      assert.doesNotMatch(main.textContent, /Here.s a replacement|The links are relative to chapter|it hasn.t been added to the website/);
      for (const code of main.querySelectorAll('pre code')) {
        assert.doesNotMatch(code.textContent, /^#{1,3}\s/m, 'handbook sections must not be fenced as example code');
      }
      assert.equal(main.querySelector('a[href*="app.notion.com"]'), null, 'internal editing notes must not be published');
    }
  });

  test(`${lang}: superblock steps stay in one seven-item list before the mascot`, () => {
    const lists = [...page(lang, '02').querySelectorAll('ol')]
      .filter(node => !node.classList.contains('crumbs__list'));
    assert.equal(lists.length, 2);
    assert.equal(lists[0].children.length, 7);
    assert.ok(lists[0].nextElementSibling.classList.contains('mascot-box'));
    assert.equal(lists[1].children.length, 7);
  });

  const printPath = `dist-pdf/toolbox-city-changer-${lang}.html`;
  test(`${lang}: print export preserves both seven-step lists and nested workshop tools`, {
    skip: !existsSync(new URL(`../../${printPath}`, import.meta.url)),
  }, () => {
    const { document } = parseHTML(read(printPath));
    const chapter = document.querySelector('#file-02');
    const lists = [...chapter.querySelectorAll('ol')].filter(node => !node.closest('.question'));
    assert.deepEqual(lists.map(node => node.children.length), [7, 7]);
    assert.equal(lists[1].querySelectorAll('ul').length, 2);
    assert.equal(chapter.querySelector('.mascot-box pre'), null);
    assert.doesNotMatch(chapter.textContent, /TODO|\[To be embedded\]/);
  });
}

for (const lang of languages.filter(lang => lang !== SOURCE_LANG)) {
  test(`${lang}: every English source chapter has a translation`, () => {
    assert.deepEqual(chapters(lang), sourceChapters);
  });

  test(`${lang}: updated chapters retain English section and interactive component coverage`, () => {
    for (const chapter of sourceChapters) {
      const source = page(SOURCE_LANG, chapter).querySelector('[data-prose]');
      const translated = page(lang, chapter).querySelector('[data-prose]');
      for (const selector of ['h1', 'h2', 'h3', 'h4', 'li', 'table', 'tr', 'details', 'figure.figure', '.question', '.mascot-box', '.feature-box']) {
        assert.equal(translated.querySelectorAll(selector).length, source.querySelectorAll(selector).length,
          `${chapter}: ${selector}`);
      }
      // Section order must agree too, not just the aggregate heading count.
      const structure = node => [...node.querySelectorAll('h1, h2, h3, h4, table, details, figure.figure, .question, .mascot-box, .feature-box')]
        .map(element => element.tagName + ':' + [...element.classList].filter(name => ['question', 'mascot-box', 'feature-box'].includes(name)).join('.'));
      assert.deepEqual(structure(translated), structure(source), `${chapter}: section/component order`);
      // Automatic glossary marks depend on language-specific word forms; only
      // author-supplied inline definitions must have one-to-one coverage.
      const definitions = candidate => (read(`src/content/book/${candidate}/${chapter}.mdx`)
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').match(/<DefinitionTerm\b/g) ?? []).length;
      assert.equal(definitions(lang), definitions(SOURCE_LANG), `${chapter}: inline definitions`);
    }
  });

  test(`${lang}: chapter references and external sources match English`, () => {
    const targets = main => [...main.querySelectorAll('[data-prose] a[href]')]
      .map(link => link.getAttribute('href')).filter(href => !href.startsWith('#'))
      .map(href => {
        const url = new URL(href, site);
        if (url.origin === new URL(site).origin) {
          const chapter = url.pathname.match(/\/book\/(?:de\/|sl\/|en\/)?(\d+)-[^/]+\.html$/)?.[1];
          if (chapter) return `chapter:${chapter}`;
        }
        return url.href;
      }).sort();
    for (const chapter of sourceChapters) {
      assert.deepEqual(targets(page(lang, chapter)), targets(page(SOURCE_LANG, chapter)), `${chapter}: reference targets`);
    }
  });
}

test('downloads publish only final PDF/EPUB files', () => {
  const dir = new URL('../../dist/downloads/', import.meta.url);
  if (!existsSync(dir)) return;
  assert.deepEqual(readdirSync(dir).filter(name => name.toLowerCase().endsWith('.html')), []);
});

test('former chapter title URLs redirect to the current translated titles', () => {
  for (const [lang, chapter, oldSlug] of [
    ['en', '04', '04-mobilisation-and-strategies-for-change'],
    ['de', '02', '02-superblocks-starten'],
    ['de', '04', '04-mobilisierung-und-strategien-des-wandels'],
    ['sl', '02', '02-kako-zaceti-s-superbloki'],
    ['sl', '04', '04-mobilizacija-in-strategije-sprememb'],
  ]) {
    const folder = lang === defaultLang ? 'book' : `book/${lang}`;
    const { document } = parseHTML(read(`dist/${folder}/${oldSlug}.html`));
    const refresh = document.querySelector('meta[http-equiv="refresh"]');
    const title = read(`src/content/book/${lang}/${chapter}.mdx`).match(/^title:\s*(.+)$/m)[1].replace(/^["'](.*)["']$/, '$1');
    assert.ok(refresh?.getAttribute('content').includes(`${base.replace(/\/$/, '')}/${folder}/${chapterUrlSlug(chapter, title)}`), `${lang}: ${oldSlug}`);
  }
});
