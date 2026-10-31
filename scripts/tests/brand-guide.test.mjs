import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const guidePath = 'design/brand-guide.mdx';

test('brand asset and licence links retain prose styling instead of compact control styles', () => {
  for (const [component, selector] of [
    ['BrandIcons', '.icon-downloads'],
    ['BrandMascotStates', '.mascot-state__downloads'],
  ]) {
    const source = read(`src/components/${component}.astro`);
    const rules = source.split(`${selector} {`)[1].split('}')[0];
    assert.doesNotMatch(rules, /font-family:|font-size:/, `${component} downloads must inherit the body type`);
    assert.doesNotMatch(source, /data-link-underline=/, `${component} downloads are ordinary prose links`);
    assert.doesNotMatch(source, /(?:\.type-formats|\.icon-downloads|\.mascot-state__formats) a\s*\{[^}]*(?:display: inline-flex|min-block-size:)/);
    assert.match(source, /<a[^>]*\bdownload/);
  }
  assert.doesNotMatch(read('src/components/BrandAssetLibrary.astro'), /\.asset-grid a \{[^}]*(?:display: flex|min-height:)/);
  for (const component of ['BrandAssetLibrary', 'BrandLogoExamples']) {
    assert.doesNotMatch(read(`src/components/${component}.astro`), /data-link-underline=/);
  }
});

test('short format links use the shared small prose-link variant at their previous sizes', () => {
  const css = read('src/styles/global.css');
  const small = css.split('.text-link--small {')[1].split('}')[0];
  assert.match(small, /font-size: var\(--text-link-small-size, \.875rem\);/);
  assert.doesNotMatch(small, /font-family:|text-decoration|display:|background:|padding:/);
  for (const component of ['BrandIcons', 'BrandMascotStates']) {
    assert.match(read(`src/components/${component}.astro`), /<a class="text-link--small"/);
  }
  assert.match(read('src/components/BrandIcons.astro'), /--text-link-small-size: \.75rem;/);
  assert.match(read(guidePath), /\[TTF\]\(\.\/brand-assets\/files\/04-fonts\//);
  const licences = read(guidePath).match(/^\[Download [^\n]+ licence \(OFL\)\]\([^\n]+\)$/gm);
  assert.equal(licences.length, 3);
  for (const component of ['BrandAssetLibrary', 'BrandLogoExamples']) {
    assert.doesNotMatch(read(`src/components/${component}.astro`), /text-link--small/);
  }
});

test('font specimens and every font/licence download are authored directly in the brand guide', () => {
  const guide = read(guidePath);
  assert.equal(existsSync(new URL('../../src/components/BrandTypeSpecimen.astro', import.meta.url)), false);
  assert.doesNotMatch(read('src/components/MdxContent.astro'), /BrandTypeSpecimen/);
  assert.doesNotMatch(guide, /BrandTypeSpecimen/);
  const typeface = guide.split('## Typeface\n')[1].split('## Layout\n')[0];
  assert.doesNotMatch(typeface, /<|\bimport\b|withBase/);
  for (const sample of ['### Fraunces', 'Small steps. Better streets.', '### Clarity City', 'Practical tools for community action.', '### Newsreader', 'Longer stories from the neighbourhood.']) assert.ok(typeface.includes(sample));
  const downloads = [...typeface.matchAll(/\]\(\.\/brand-assets\/files\/(04-fonts\/[^)]+)\)/g)].map(([, path]) => decodeURIComponent(path));
  const catalogue = JSON.parse(read('public/brand-assets/catalog.json')).filter(asset => asset.file.startsWith('04-fonts/')).map(asset => asset.file);
  assert.deepEqual(new Set(downloads), new Set(catalogue), 'directly authored font links must cover the complete supplied font catalogue');
  assert.equal(downloads.length, catalogue.length, 'each font and licence is linked once');
  const typography = read('src/styles/global.css');
  assert.doesNotMatch(typography, /\.type-specimen|\.type-downloads|\.type-formats/);
  assert.ok(typography.includes('.brand-guide #fraunces + p'));
  assert.ok(typography.includes('.brand-guide #newsreader + p'));
});

test('home opening images use the shared Figure with eager loading', () => {
  const layout = read('src/layouts/PageLayout.astro');
  assert.ok(layout.includes("import Figure from '../components/Figure.astro'"));
  assert.match(layout, /<Figure src=\{openerImage\}[^>]+\beager\s*\/>/);
  for (const path of ['src/layouts/PageLayout.astro', 'src/components/MdxContent.astro', guidePath]) {
    assert.doesNotMatch(read(path), /OpenerImage/);
  }
  assert.doesNotMatch(read('src/styles/global.css'), /\.opener\b/);
});

test('palette cards and swatches use shared hand-drawn frames and registry colors', () => {
  const palette = read('src/components/BrandPalette.astro');
  assert.ok(palette.includes('<li class="showcase-demo">'));
  assert.ok(palette.includes('class="swatch shape"'));
  assert.ok(palette.includes("'--swatch-color': hex"));
  assert.ok(palette.includes('--drawn-fill: var(--swatch-color)'));
  assert.ok(palette.includes('background: transparent;'));
  assert.doesNotMatch(palette.match(/\.color-grid li\s*\{([^}]+)\}/)[1], /border(?:-radius)?:/);
});

test('mascot cards use individual showcase frames, without a competing outer frame', () => {
  const states = read('src/components/BrandMascotStates.astro');
  assert.ok(states.includes('<ul class="mascot-states">'));
  assert.ok(states.includes('<li class="mascot-state showcase-demo"'));
  const cardStyles = states.match(/\.mascot-states > li\s*\{([^}]+)\}/)[1];
  assert.doesNotMatch(cardStyles, /border(?:-radius)?:/);
});

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
  const names = [...scope.matchAll(/^\s*(\w+)(?:,|:)/gm)].map(match => match[1]);
  for (const name of names.filter(name => !name.startsWith('Brand') && name !== 'FigureBox')) {
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
  const section = guide.split('### Logos\n')[1].split('### Mascot\n')[0];
  const example = section.match(/```astro\n([\s\S]*?)\n```/)?.[1];
  assert.ok(example, 'BrandLogo must have a copyable Astro usage example');
  assert.ok(example.includes("import BrandLogo from '../components/BrandLogo.astro'"));
  assert.ok(example.includes('<BrandLogo label="Toolbox for City Changers" />'));
  assert.ok(example.includes('<BrandLogo variant="symbol" label="Green Fix" />'));
});

test('logo and mascot share a section with linked still and animated previews', () => {
  const guide = read(guidePath);
  const section = guide.split('## Logo and mascot\n')[1].split('## Colors\n')[0];
  const logo = section.split('### Mascot\n')[0];
  assert.ok(logo.includes('### Logos\n'));
  assert.ok(logo.includes('[Green Fix, our mascot](#mascot)'));
  const mascot = section.split('### Mascot\n')[1];
  assert.ok(mascot.includes('#### Poses: static and animated'));
  assert.ok(mascot.includes('<BrandMascotStates />'));
  assert.ok(mascot.includes('`skeptical` is still-only'));
  assert.ok(mascot.includes('Reduced-motion, no-JavaScript and export views'));
  assert.ok(!guide.includes('Explore all static poses'));
  assert.ok(!guide.includes('Explore all animated poses'));
});

test('brand guide documents bookmarking without rendering an active control', () => {
  const guide = read(guidePath);
  const withoutExamples = guide.replace(/```[\s\S]*?```/g, '');
  assert.ok(!withoutExamples.includes('<BookmarkAdd'));
  assert.ok(guide.includes('<BookmarkAdd lang="en" />'));
});
