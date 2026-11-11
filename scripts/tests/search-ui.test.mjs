import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { build } from 'vite';

test('both search pages bundle their initialization as module scripts', () => {
  for (const page of ['src/pages/search.astro', 'src/pages/[lang]/search.astro']) {
    const source = readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
    assert.match(source, /<script>\s*import \{ initSearchUI \}/,
      `${page} must process its imports instead of emitting a raw classic script`);
    assert.match(source, /document\.documentElement\.lang/);
  }
});

const bundle = await build({
  configFile: false,
  logLevel: 'silent',
  define: { 'import.meta.env.DEV': 'true', 'import.meta.env.BASE_URL': '"/"' },
  build: {
    write: false,
    minify: false,
    lib: { entry: new URL('../../src/scripts/search-ui.ts', import.meta.url).pathname, formats: ['es'] },
  },
});
const output = Array.isArray(bundle) ? bundle[0].output : bundle.output;
const { initSearchUI } = await import(`data:text/javascript;base64,${Buffer.from(output.find(chunk => chunk.isEntry).code).toString('base64')}`);

test('search renders translated chapters and excludes other languages before the result cap', async () => {
  for (const lang of ['en', 'de', 'sl']) {
    const { document, window } = parseHTML(`<html lang="${lang}"><body data-search-param="query">
      <input id="head-search"><input id="site-search">
      <p data-search-status></p><ol data-search-results></ol>
    </body></html>`);
    const page = language => language === 'en' ? '/about.html' : `/${language}/about.html`;
    const chapter = language => language === 'en' ? '/book/chapter.html' : `/book/${language}/chapter.html`;
    const other = lang === 'en' ? 'de' : 'en';
    const urls = [...Array(35).fill(chapter(other)), page(lang), chapter(lang)];
    window.pagefind = {
      search: async term => {
        assert.equal(term, 'superblocks');
        return { results: urls.map(url => ({ data: async () => ({ url, meta: { title: 'Chapter' }, excerpt: 'A <mark>superblock</mark>' }) })) };
      },
    };
    const globals = { document, window, location: { search: '?query=superblocks' } };
    const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
    try {
      await initSearchUI(lang);
      assert.equal(document.querySelector('#site-search').value, 'superblocks');
      assert.equal(document.querySelector('#head-search').value, '');
      assert.deepEqual([...document.querySelectorAll('[data-search-results] a')].map(link => link.getAttribute('href')), [page(lang), chapter(lang)]);
      assert.match(document.querySelector('[data-search-status]').textContent, /^2 /);
    } finally {
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
  }
});
