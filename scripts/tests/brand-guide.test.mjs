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
    const section = guide.split(`### ${name}\n`)[1].split(/^#{2,3} /m)[0];
    const examples = [...section.matchAll(/```mdx\n([\s\S]*?)\n```/g)];
    assert.ok(
      examples.some(([, code]) => new RegExp(`<${name}\\b`).test(code)),
      `${name} must have a copyable MDX usage example in its section`,
    );
  }
  assert.ok(guide.includes('<BrandAssetLibrary />'));
});

test('BrandLogo examples show the Astro import and both artwork variants', () => {
  const guide = read(guidePath);
  const section = guide.split('### Logos and BrandLogo\n')[1].split('## Colors')[0];
  const example = section.match(/```astro\n([\s\S]*?)\n```/)?.[1];
  assert.ok(example, 'BrandLogo must have a copyable Astro usage example');
  assert.ok(example.includes("import BrandLogo from '../components/BrandLogo.astro'"));
  assert.ok(example.includes('<BrandLogo label="Toolbox for City Changers" />'));
  assert.ok(example.includes('<BrandLogo variant="symbol" label="Green Fix" />'));
});
