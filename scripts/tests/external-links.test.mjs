import test from 'node:test';
import assert from 'node:assert/strict';
import { externalLinks } from '../../src/lib/external-links.mjs';

const site = 'https://toolbox.wirmachen.wien';
const notice = 'External link, opens in a new tab';
const enhance = (html) => externalLinks(html, site, notice);

test('external content links receive an arrow, safe new-tab attributes and a notice', () => {
  for (const href of ['https://example.org', 'http://example.org', '//example.org']) {
    const html = enhance(`<p><a href="${href}"><em>Resource</em></a></p>`);
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.match(html, /aria-hidden="true">↗/);
    assert.match(html, /External link, opens in a new tab/);
    assert.match(html, /<em>Resource<\/em>/);
  }
});

test('internal links, anchors, emails and non-web protocols remain unchanged', () => {
  for (const href of ['/book/chapter.html', '#section', '../about.html', `${site}/book/`, '//toolbox.wirmachen.wien/book/', 'mailto:hello@example.org', 'tel:+431234', 'ftp://example.org', 'https://[invalid']) {
    const html = enhance(`<a href="${href}">Link</a>`);
    assert.doesNotMatch(html, /_blank|external-link|noopener/);
  }
});

test('component links preserve rel tokens, image alt text, labels and existing content', () => {
  const html = enhance('<div><a href="https://example.org" rel="license nofollow" aria-label="Partner"><img src="logo.svg" alt="Partner logo"></a></div>');
  assert.match(html, /rel="license nofollow noopener noreferrer"/);
  assert.match(html, /aria-label="Partner \(External link, opens in a new tab\)"/);
  assert.match(html, /alt="Partner logo"/);
  assert.equal(enhance(html), html);
});

test('localised notices are escaped and scripts are preserved', () => {
  const html = externalLinks('<script>if (a < b) run();</script><a href="https://example.org">Link</a>', site, 'Öffnet <neu>');
  assert.match(html, /Öffnet &#x3C;neu>/);
  assert.match(html, /<script>if \(a < b\) run\(\);<\/script>/);
});
