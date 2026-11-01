import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

test('only the masthead opts into existing idle artwork; other logo uses remain static', () => {
  const component = read('src/components/BrandLogo.astro');
  assert.match(component, /animated = false/);
  assert.match(component, /green-fix-idle-ink\.json\?url/);
  assert.match(component, /green-fix-idle-linen\.json\?url/);
  assert.match(read('src/components/Masthead.astro'), /<BrandLogo[^>]+ animated \/>/);
  assert.doesNotMatch(component, /<button|<video|\.mov/);
  assert.match(component, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(component, /@media print \{[^}]*clip-path: none/);
});

test('logo motion is finite, lazy-loaded, replayable and fails back to the master', () => {
  const script = read('src/scripts/brand-mascot.ts');
  assert.match(script, /if \(reduced\.matches \|\| loading \|\| failed\) return/);
  assert.match(script, /import\('lottie-web\/build\/player\/lottie_light'\)/);
  assert.match(script, /loop: false, autoplay: false/);
  assert.match(script, /addEventListener\('complete', \(\) => animation.goToAndStop\(0, true\)\)/);
  assert.match(script, /logoMascotViewBox\(animationData\)/);
  assert.match(script, /addEventListener\('pointerenter'/);
  assert.match(script, /addEventListener\('focus'/);
  assert.match(script, /logo\.removeAttribute\('data-brand-ready'\)/);
  assert.match(script, /animation\.pause\(\)/);
});
