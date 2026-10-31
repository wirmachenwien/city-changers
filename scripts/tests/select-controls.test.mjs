import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { initSelect } from '../../src/scripts/select.ts';

test('selected-text mirror follows native input/change events without replacing the control or label', () => {
  const { document, window } = parseHTML('<html><body><div data-select-list><label for="language">Language</label><span class="drawn-select"><select id="language" data-select><option value="/en">English</option><option value="/de">Deutsch</option></select><span data-select-value aria-hidden="true">English</span></span></div></body></html>');
  const select = document.querySelector('select');
  const options = [...select.querySelectorAll('option')];
  let index = 0;
  Object.defineProperty(select, 'selectedOptions', { get: () => [options[index]] });
  Object.defineProperty(select, 'value', { get: () => options[index].getAttribute('value') });
  const location = { href: '' };
  const globals = { document, location };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  try {
    initSelect();
    initSelect();
    const mirror = document.querySelector('[data-select-value]');
    assert.equal(mirror.textContent, 'English');
    index = 1;
    select.dispatchEvent(new window.Event('input'));
    assert.equal(mirror.textContent, 'Deutsch');
    assert.equal(location.href, '', 'previewing an option does not navigate early');
    select.dispatchEvent(new window.Event('change'));
    assert.equal(location.href, '/de');
    assert.equal(document.querySelector('select'), select);
    assert.equal(document.querySelector('label').textContent, 'Language');
    assert.equal(mirror.getAttribute('aria-hidden'), 'true');
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
