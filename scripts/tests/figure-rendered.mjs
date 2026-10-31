// Build first: npx astro build && node --test scripts/tests/figure-rendered.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseHTML } from 'linkedom';

const dist = new URL('../../dist/', import.meta.url);
const files = readdirSync(dist, { recursive: true }).filter(file => file.endsWith('.html'));

test('built figures preserve media wrappers, captions, alt text and click-to-load playback', () => {
  let images = 0, videos = 0;
  for (const file of files) {
    const { document } = parseHTML(readFileSync(new URL(file, dist), 'utf8'));
    for (const figure of document.querySelectorAll('figure.figure')) {
      const stage = figure.querySelector(':scope > .figure__media > .figure__stage');
      assert.ok(stage, `${file}: media wrapper and stage`);
      assert.equal(stage.querySelector('figcaption'), null, `${file}: caption stays outside media`);
      if (figure.hasAttribute('data-video')) {
        videos++;
        assert.ok(figure.dataset.embed || figure.dataset.videoFile);
        assert.ok(stage.querySelector('button[data-play][aria-label]'));
        assert.ok(stage.querySelector('noscript a[href]'));
        assert.equal(stage.querySelector('iframe, video'), null, 'playback is click-to-load');
      } else {
        images++;
        assert.ok(stage.querySelector('img[alt][srcset]'), `${file}: optimized image with explicit alt`);
      }
    }
  }
  assert.ok(images > 0);
  assert.ok(videos >= 7, 'six translated chapter videos plus brand guide');
});

test('built controls, closed accordions, tables and code have no client-side wrapper dependency', () => {
  const { document } = parseHTML(readFileSync(new URL('brand.html', dist), 'utf8'));
  for (const select of document.querySelectorAll('.lang-menu select, .select-list select')) {
    assert.ok(select.parentElement.classList.contains('drawn-select'));
    const shell = select.parentElement;
    const mirror = shell.querySelector('[data-select-value]');
    assert.equal(mirror.getAttribute('aria-hidden'), 'true');
    const selected = select.querySelector('option[selected]') ?? select.querySelector('option');
    assert.equal(mirror.textContent, selected?.textContent ?? '');
    assert.ok(shell.querySelector('.drawn-select__chevron[aria-hidden="true"] svg'));
    assert.ok(document.querySelector(`label[for="${select.id}"]`), 'native select retains an external label');
    assert.ok(select.options.length > 0);
  }
  for (const table of document.querySelectorAll('.prose table')) {
    assert.ok(table.closest('.drawn-scroll-shell'), 'table shell exists before JS');
  }
  for (const pre of document.querySelectorAll('.prose pre')) {
    assert.ok(pre.parentElement.classList.contains('drawn-scroll-shell'));
  }
  for (const accordion of document.querySelectorAll('.accordion')) {
    assert.ok(accordion.querySelector(':scope > summary > .drawn-frame[aria-hidden="true"]'));
  }
});
