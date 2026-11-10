import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseHTML } from 'linkedom';
import { brandAssets, brandRelease } from '../../src/lib/brand-release.mjs';

const { document } = parseHTML(readFileSync('dist/brand.html', 'utf8'));

test('every original and the brand ZIP link to the matching GitHub release', () => {
  const links = [...document.querySelectorAll('a')].map(link => link.getAttribute('href'));
  assert.ok(links.includes(brandRelease.kit));
  assert.ok(links.includes(brandRelease.url));
  for (const asset of brandAssets) assert.ok(links.includes(asset.download), asset.file);
  assert.equal(links.some(href => href?.includes('/brand-assets/files/')), false);
  assert.equal(links.some(href => href?.includes('/brand-assets/city-changers-brand-kit.zip')), false);
});

test('brand previews remain local and Pages contains no original brand downloads', () => {
  for (const asset of brandAssets.filter(asset => asset.preview)) {
    assert.ok(existsSync(resolve('dist', `.${asset.preview}`)), asset.preview);
    assert.ok(statSync(resolve('dist', `.${asset.preview}`)).size < 200_000, asset.preview);
  }
  // Lottie previews keep their existing nested bundled/inline still fallback.
  for (const image of document.querySelectorAll('.asset-preview > img, .logo-preview > img')) {
    assert.match(image.getAttribute('src'), /\/brand-assets\/previews\//);
    assert.equal(image.getAttribute('src').startsWith('https://github.com/'), false);
  }
  const files = readdirSync('dist/brand-assets', { recursive: true });
  assert.equal(files.some(file => /\.(?:zip|mov|ttf|woff2|jpg|png)$/i.test(file)), false);
  assert.equal(files.some(file => file.startsWith('files/') && statSync(resolve('dist/brand-assets', file)).isFile()), false);
});
