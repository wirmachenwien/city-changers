import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('all pebble hover colors come from registered, contrast-checked brand recipes', () => {
  const registry = JSON.parse(read('design/colors.json'));
  for (const token of ['pebble-hover', 'pebble-hover-ink', 'pebble-selected-hover', 'pebble-selected-hover-ink']) assert.ok(registry.tokens[token]);
  assert.ok(registry.contrast.text.some(pair => pair[0] === 'pebble-hover-ink' && pair[1] === 'pebble-hover'));
  assert.ok(registry.contrast.text.some(pair => pair[0] === 'pebble-selected-hover-ink' && pair[1] === 'pebble-selected-hover'));
});
