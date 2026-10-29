// Exercise the actual inline bootstrap without sending analytics requests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const component = readFileSync(new URL('../../src/components/Plausible.astro', import.meta.url), 'utf8');
const bootstrap = component.match(/<script is:inline>([\s\S]*?)<\/script>/)?.[1];

test('bootstrap is inline and gated with the tracker', () => {
  assert.ok(bootstrap, 'initialization must not be bundled outside the enabled guard');
  assert.ok(component.indexOf('<script is:inline>') > component.indexOf('{enabled && ('));
  assert.match(component, /import\.meta\.env\.PROD && !noindex/);
});

test('tracker uses the official async site-specific script without legacy attributes', () => {
  assert.match(component, /<script async src=\{plausible\.scriptSrc\}><\/script>/);
  assert.doesNotMatch(component, /<script[^>]*(?:data-domain|defer)/);
});

test('tracker loading after bootstrap receives options, not a custom init event', () => {
  const window = {};
  runInNewContext(bootstrap, { window });
  assert.equal(typeof window.plausible, 'function');
  assert.deepEqual(Object.keys(window.plausible.o), []);
  assert.equal(window.plausible.q, undefined);
  // This is the site-specific tracker's startup contract: .o triggers init.
  assert.ok(window.plausible.o);
});

test('an already loaded tracker is initialized through its own init method', () => {
  let initialized = 0;
  const plausible = Object.assign(() => assert.fail('must not emit an init event'), {
    init: () => { initialized += 1; },
  });
  const window = { plausible };
  runInNewContext(bootstrap, { window });
  assert.equal(window.plausible, plausible);
  assert.equal(initialized, 1);
});

test('events can queue while the tracker is loading', () => {
  const window = {};
  runInNewContext(bootstrap, { window });
  window.plausible('Example', { props: { source: 'test' } });
  assert.equal(window.plausible.q.length, 1);
  assert.equal(window.plausible.q[0][0], 'Example');
});
