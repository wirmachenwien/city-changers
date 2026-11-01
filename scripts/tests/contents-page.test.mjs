import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

test('web contents page excludes only its own entry from the reusable TOC', () => {
  assert.match(read('src/components/ContentsPage.astro'), /<Toc lang=\{lang\} excludeFile="contents" \/>/);
  const toc = read('src/components/Toc.astro');
  assert.match(toc, /excludeFile\?: string/);
  assert.match(toc, /filter\(entry => entry.file !== excludeFile\)/);
});

test('reading progress remains available on book pages other than contents', () => {
  const layout = read('src/layouts/BookLayout.astro');
  assert.match(layout, /const isContents = file === 'contents'/);
  assert.match(layout, /\{!isContents && <ReadingProgress \/>\}/);
});
