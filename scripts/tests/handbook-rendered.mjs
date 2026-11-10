// Build first: npm run build && node --test scripts/tests/handbook-rendered.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { chapterUrlSlug } from '../../src/lib/chapter-slug.ts';
import { defaultLang, languages } from '../../handbook.config.ts';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
function page(lang, chapter) {
  const title = read(`src/content/book/${lang}/${chapter}.mdx`)
    .match(/^title:\s*(.+)$/m)[1].replace(/^["'](.*)["']$/, '$1');
  const folder = lang === defaultLang ? 'book' : `book/${lang}`;
  return parseHTML(read(`dist/${folder}/${chapterUrlSlug(chapter, title)}.html`)).document.querySelector('main');
}

for (const lang of languages) {
  test(`${lang}: handbook has no duplicate headings or published editorial placeholders`, () => {
    const home = lang === defaultLang ? 'index.html' : `${lang}/index.html`;
    const pages = [parseHTML(read(`dist/${home}`)).document.querySelector('main'),
      ...['01', '02', '03', '04', '05', '06'].map(chapter => page(lang, chapter))];
    for (const main of pages) {
      const headings = [...main.querySelectorAll('h1, h2, h3')].map(node => node.textContent.trim().replace(/[.?!]$/, ''));
      assert.equal(new Set(headings).size, headings.length, 'headings must not repeat');
      assert.doesNotMatch(main.textContent, /\[(?:add\b|To be embedded|Ziele und Absichten|Cilji in nameni|weiteren Autor|nadaljnji sodelujoči)|(?:Kapitel|poglavje) x\b/);
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

  const printPath = `dist/downloads/toolbox-city-changer-${lang}.html`;
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

for (const lang of languages.filter(lang => lang !== defaultLang)) {
  test(`${lang}: updated chapters retain English section and interactive component coverage`, () => {
    for (const chapter of ['01', '02', '03', '04', '05']) {
      const source = page(defaultLang, chapter);
      const translated = page(lang, chapter);
      for (const selector of ['h2', 'h3', 'details', 'figure.figure', '.question', '.mascot-box']) {
        assert.equal(translated.querySelectorAll(selector).length, source.querySelectorAll(selector).length,
          `${chapter}: ${selector}`);
      }
    }
  });
}
