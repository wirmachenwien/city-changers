#!/usr/bin/env node
// HTTP-only smoke checks for a running dev server. No browser/DOM automation.
// Useful after a simultaneous production build: catches stale optimized
// dependencies and download URLs cached before their files existed.
import assert from 'node:assert/strict';
import { base, languages, slug } from '../../handbook.config.ts';
import settings from '../../src/data/settings.json' with { type: 'json' };

const origin = process.argv[2] ?? 'http://localhost:4321';
const prefix = base.replace(/\/$/, '');
const page = await fetch(new URL(base, origin));
assert.equal(page.status, 200, 'Home page must load');
const html = await page.text();
const modules = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
  .map(match => match[1].replaceAll('&amp;', '&'))
  .filter(path => path.startsWith('/src/') && !path.includes('type=style'));
assert.ok(modules.length > 0, 'Expected the dev page to reference its UI module');
const visited = new Set();
while (modules.length) {
  const path = modules.shift();
  if (visited.has(path)) continue;
  visited.add(path);
  const response = await fetch(new URL(path, origin));
  assert.equal(response.status, 200, `Client module failed: ${path}`);
  assert.match(response.headers.get('content-type') ?? '', /javascript/, `Wrong MIME type: ${path}`);
  const body = await response.text();
  for (const match of body.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)) {
    const dependency = match[1];
    if (dependency.startsWith('/') && !dependency.endsWith('.css')) modules.push(dependency);
  }
}
console.log(`UI: ${visited.size} client modules/dependencies return 200 (no stale optimizer URLs).`);

for (const name of ['logo-lockup.svg', 'logo-lockup-dark.svg']) {
  const response = await fetch(new URL(`${prefix}/${name}`, origin));
  assert.equal(response.status, 200, name);
  assert.match(await response.text(), /<svg\b/, name);
}

let checked = 0;
for (const lang of languages) {
  for (const format of ['pdf', 'epub']) {
    if (!settings.downloads[format]) continue;
    const path = `${prefix}/downloads/${slug}-${lang}.${format}`;
    const response = await fetch(new URL(path, origin));
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('content-type'), format === 'pdf' ? 'application/pdf' : 'application/epub+zip', path);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.length > 1000, `Empty/incomplete download: ${path}`);
    assert.equal(bytes.subarray(0, format === 'pdf' ? 5 : 2).toString(), format === 'pdf' ? '%PDF-' : 'PK', path);
    console.log(`Download: ${path} (${bytes.length} bytes)`);
    checked++;
  }
}
console.log(`Passed: both logo variants and ${checked} PDF/EPUB downloads. Visual layout/theme checks remain manual.`);
