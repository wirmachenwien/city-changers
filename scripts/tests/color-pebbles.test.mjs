import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { parseHTML } from 'linkedom';
import rehypeColorPebbles from '../../src/lib/rehype-color-pebbles.mjs';

test('HEX values get decorative pebbles without changing copyable text', async () => {
  const markdown = await createMarkdownProcessor({ rehypePlugins: [rehypeColorPebbles] });
  const { code } = await markdown.render('Paper `#FDFCF9`, ink #1d1a16.\n\n```text\n#fff #1234 #12345678\n```\n\n[Link](https://example.com/#abcdef)');
  const { document } = parseHTML(`<main>${code}</main>`);
  const pebbles = [...document.querySelectorAll('.color-pebble')];
  assert.equal(pebbles.length, 5);
  for (const pebble of pebbles) {
    assert.equal(pebble.getAttribute('aria-hidden'), 'true');
    assert.equal(pebble.textContent, '');
    const hex = pebble.nextSibling.textContent.match(/^#[\da-f]+/i)[0];
    assert.equal(pebble.getAttribute('style'), `--pebble-color: ${hex}`);
    assert.ok(pebble.parentElement.classList.contains('color-value'));
    assert.equal(pebble.parentElement.textContent, hex);
  }
  assert.equal(document.querySelector('p').textContent, 'Paper #FDFCF9, ink #1d1a16.');
  assert.equal(document.querySelector('pre').textContent, '#fff #1234 #12345678');
  assert.equal(document.querySelector('a').getAttribute('href'), 'https://example.com/#abcdef');
});

test('site-wide processor only decorates the brand guide', () => {
  const decorate = rehypeColorPebbles({ brandOnly: true });
  const tree = () => ({ type: 'root', children: [{ type: 'text', value: '#FDFCF9' }] });
  const chapter = tree();
  decorate(chapter, { path: '/src/content/book/en/01.mdx' });
  assert.equal(chapter.children.length, 1);
  const guide = tree();
  decorate(guide, { path: '/design/brand-guide.mdx' });
  assert.ok(guide.children.some((node) => node.properties?.className?.includes('color-value')));
});

test('table HEX values keep their pebble in one wrapper and tokens stay intact', async () => {
  const markdown = await createMarkdownProcessor({ rehypePlugins: [rehypeColorPebbles] });
  const { code } = await markdown.render('| Token | HEX |\n|---|---|\n| `--control-border` | `#82807C` |');
  const { document } = parseHTML(`<main>${code}</main>`);
  const cells = document.querySelectorAll('td');
  assert.equal(cells[0].querySelector('code').textContent, '--control-border');
  const value = cells[1].querySelector('code > .color-value');
  assert.equal(value.textContent, '#82807C');
  assert.ok(value.firstElementChild.classList.contains('color-pebble'));
});

test('scripts, styles and invalid HEX values are left unchanged', () => {
  const tree = {
    type: 'root', children: [
      { type: 'element', tagName: 'style', children: [{ type: 'text', value: '#abcdef' }] },
      { type: 'element', tagName: 'script', children: [{ type: 'text', value: '#abcdef' }] },
      { type: 'text', value: '#12345 #1234567 #abcdefghi' },
    ],
  };
  const original = structuredClone(tree);
  rehypeColorPebbles()(tree, {});
  assert.deepEqual(tree, original);
});
