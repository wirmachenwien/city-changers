import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { parseHTML } from 'linkedom';
import rehypeBrandDownloads from '../../src/lib/rehype-brand-downloads.mjs';

test('plain Markdown format links retain compact prose styling, download behavior and accessible names', async () => {
  // Supply the same guide path the real MDX processor passes to its plugins.
  const plugin = () => {
    const transform = rehypeBrandDownloads();
    return tree => transform(tree, { path: '/design/brand-guide.mdx' });
  };
  const markdown = await createMarkdownProcessor({ rehypePlugins: [plugin] });
  const { code } = await markdown.render('- Fraunces: [TTF](./brand-assets/files/04-fonts/Fraunces%5BSOFT%2CWONK%5D.ttf) · [WOFF2](./brand-assets/files/04-fonts/Fraunces.woff2)\n\n[Download Fraunces licence (OFL)](./brand-assets/files/04-fonts/OFL-Fraunces.txt)\n\n[External](https://example.com/brand-assets/files/example.ttf)');
  const { document } = parseHTML(code);
  const links = [...document.querySelectorAll('a')];
  for (const link of links.slice(0, 2)) {
    assert.ok(link.classList.contains('text-link--small'));
    assert.ok(link.hasAttribute('download'));
    assert.match(link.getAttribute('aria-label'), /^Download /);
  }
  assert.equal(links[0].getAttribute('aria-label'), 'Download Fraunces[SOFT,WONK].ttf');
  assert.ok(links[2].hasAttribute('download'));
  assert.equal(links[2].classList.contains('text-link--small'), false);
  assert.equal(links[3].hasAttribute('download'), false);
});

test('brand download formatting does not alter handbook links', () => {
  const link = { type: 'element', tagName: 'a', properties: { href: './brand-assets/files/04-fonts/Fraunces.ttf' }, children: [{ type: 'text', value: 'TTF' }] };
  const tree = { type: 'root', children: [link] };
  rehypeBrandDownloads()(tree, { path: '/src/content/book/en/01.mdx' });
  assert.equal(link.properties.download, undefined);
  assert.equal(link.properties.className, undefined);
});
