import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { parseHTML } from 'linkedom';
import rehypeBrandDownloads from '../../src/lib/rehype-brand-downloads.mjs';
import { brandAssets, brandAssetUrl } from '../../src/lib/brand-release.mjs';

test('plain Markdown format links retain compact prose styling, download behavior and accessible names', async () => {
  // Supply the same guide path the real MDX processor passes to its plugins.
  const plugin = () => {
    const transform = rehypeBrandDownloads();
    return tree => transform(tree, { path: '/design/brand-guide.mdx' });
  };
  const markdown = await createMarkdownProcessor({ rehypePlugins: [plugin] });
  const ttf = brandAssets.find(asset => asset.file.startsWith('04-fonts/Fraunces') && asset.file.endsWith('.ttf')).file;
  const woff = brandAssets.find(asset => asset.file.startsWith('04-fonts/Fraunces') && asset.file.endsWith('.woff2')).file;
  const href = file => `./brand-assets/files/${file.split('/').map(encodeURIComponent).join('/')}`;
  const { code } = await markdown.render(`- Fraunces: [TTF](${href(ttf)}) · [WOFF2](${href(woff)})\n\n[Download Fraunces licence (OFL)](${href('04-fonts/OFL-Fraunces.txt')})\n\n[External](https://example.com/brand-assets/files/example.ttf)`);
  const { document } = parseHTML(code);
  const links = [...document.querySelectorAll('a')];
  for (const link of links.slice(0, 2)) {
    assert.ok(link.classList.contains('text-link--small'));
    assert.ok(link.hasAttribute('download'));
    assert.match(link.getAttribute('aria-label'), /^Download /);
  }
  assert.equal(links[0].getAttribute('aria-label'), `Download ${ttf.split('/').pop()}`);
  assert.equal(links[0].getAttribute('href'), brandAssetUrl(ttf));
  assert.equal(links[1].getAttribute('href'), brandAssetUrl(woff));
  assert.ok(links[2].hasAttribute('download'));
  assert.equal(links[2].classList.contains('text-link--small'), false);
  assert.equal(links[3].hasAttribute('download'), false);
  assert.equal(links[3].getAttribute('href'), 'https://example.com/brand-assets/files/example.ttf');
});

test('brand download formatting does not alter handbook links', () => {
  const link = { type: 'element', tagName: 'a', properties: { href: './brand-assets/files/04-fonts/Fraunces.ttf' }, children: [{ type: 'text', value: 'TTF' }] };
  const tree = { type: 'root', children: [link] };
  rehypeBrandDownloads()(tree, { path: '/src/content/book/en/01.mdx' });
  assert.equal(link.properties.download, undefined);
  assert.equal(link.properties.className, undefined);
});
