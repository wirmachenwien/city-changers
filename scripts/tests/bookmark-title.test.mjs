import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { bookmarkExcerpt, plainBookmarkText } from '../../src/lib/bookmark-title.ts';

const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
afterEach(() => {
  if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
  else delete globalThis.document;
});

const labels = { video: 'Video', image: 'Image', slideshow: 'Slideshow', table: 'Table',
  quote: 'Quote', tip: 'Tip', accordion: 'Details', copy: 'Text to copy', qr: 'QR code' };

function element(html) {
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  return document.body.firstElementChild;
}

test('plain text strips markup, embedded code and encoded HTML in saved labels', () => {
  element('<p></p>');
  assert.equal(plainBookmarkText('<b>Safe</b> &amp; sound<script>bad()</script>'), 'Safe & sound');
  assert.equal(plainBookmarkText('&lt;strong&gt;Saved title&lt;/strong&gt;'), 'Saved title');
  assert.equal(plainBookmarkText('&amp;lt;strong&amp;gt;Saved title&amp;lt;/strong&amp;gt;'), 'Saved title');
  assert.equal(plainBookmarkText('<p>First</p><p>second</p>'), 'First second');
});

test('video uses caption, never the play control, iframe or noscript fallback', () => {
  const video = element('<figure data-video><button>Play video</button><noscript>&lt;a href="bad"&gt;Play&lt;/a&gt;</noscript><iframe title="player"></iframe><figcaption>A <em>greener</em> street</figcaption></figure>');
  assert.equal(bookmarkExcerpt(video, labels), 'Video: A greener street');
  video.querySelector('figcaption').remove();
  assert.equal(bookmarkExcerpt(video, labels), 'Video');
});

const examples = [
  ['<figure><img alt="A quiet street"><figcaption>Street redesign</figcaption></figure>', 'Image: Street redesign'],
  ['<p><img alt="A quiet street"></p>', 'Image: A quiet street'],
  ['<figure class="qr"><div role="img" aria-label="Campaign website"><svg></svg></div></figure>', 'QR code: Campaign website'],
  ['<div data-slides aria-label="Before and after"><button>Next</button><figcaption>Slide 1</figcaption></div>', 'Slideshow: Before and after'],
  ['<form data-question><legend>Question 2: What works?</legend><label>Option A</label><button>Check answers</button><p data-feedback>Incorrect</p></form>', 'Question 2: What works?'],
  ['<div class="table-scroll"><table><thead><tr><th>Goal</th><th>Action</th></tr></thead><tbody><tr><td>Noise</td></tr></tbody></table></div>', 'Table: Goal / Action'],
  ['<aside class="feature-box"><p class="feature-box__title">Start small</p><p>Long body</p></aside>', 'Tip: Start small'],
  ['<aside class="mascot-box"><div class="mascot-box__visual">Mascot</div><p class="mascot-box__title">Ask neighbours</p><p>Long body</p></aside>', 'Tip: Ask neighbours'],
  ['<details><summary>Campaign steps</summary><p>Long body</p></details>', 'Details: Campaign steps'],
  ['<blockquote><p>Streets are for people.</p><footer>Someone</footer></blockquote>', 'Quote: Streets are for people.'],
  ['<button data-copy="A useful message">Copy</button>', 'Text to copy: A useful message'],
  ['<h2>Organise <em>together</em><a data-heading-anchor>#</a></h2>', 'Organise together'],
  ['<p>Build <button class="definition-term">superblocks</button><span hidden>Hidden</span><svg><title>Icon</title></svg> together.</p>', 'Build superblocks together.'],
];
for (const [html, expected] of examples) {
  test(expected, () => assert.equal(bookmarkExcerpt(element(html), labels), expected));
}

test('labels are localized and excerpts stay short', () => {
  const target = element('<figure data-video><figcaption>One two three four five</figcaption></figure>');
  assert.equal(bookmarkExcerpt(target, { ...labels, video: 'Videoposnetek' }, 4), 'Videoposnetek: One two three');
});
