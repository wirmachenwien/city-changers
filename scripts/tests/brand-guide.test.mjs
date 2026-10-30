import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const guidePath = 'design/brand-guide.mdx';

test('Pages CMS and the asset manifest share the single complete guide source', () => {
  const config = parse(read('.pages.yml'));
  const entry = config.content.find((item) => item.name === 'brand_guide');
  assert.equal(entry.path, guidePath);
  assert.equal(entry.format, 'yaml-frontmatter');
  assert.ok(entry.fields.some((field) => field.name === 'body' && field.component === 'markdown_body'));
  assert.equal(config.content.filter((item) => item.path === guidePath).length, 1);
  const manifest = JSON.parse(read('design/manifest.json'));
  const group = manifest.groups.find((item) => item.title === 'Brand guide');
  assert.ok(group.include.includes('brand-guide.mdx'));
  assert.equal(group.rename['brand-guide.mdx'], 'BRAND-GUIDE.md');
});

test('all author-facing components are documented in the same guide as the identity', () => {
  const guide = read(guidePath);
  assert.ok(guide.includes('## Identity'));
  assert.ok(guide.includes('## Colors'));
  const scope = read('src/components/MdxContent.astro').split('export const mdxComponents = {')[1].split('};')[0];
  for (const name of scope.match(/\w+/g).filter((name) => !name.startsWith('Brand'))) {
    assert.ok(guide.includes(`### ${name}\n`), `${name} must have a section in the brand guide`);
  }
  assert.ok(guide.includes('<BrandAssetLibrary />'));
});
