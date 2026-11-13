import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { sentenceSpans, sentenceHtml } from '../../src/lib/audio-sentences.mjs';
import { unitSentenceCues, correctSentenceCues, validateSentenceCues } from '../audio/sentence-cues.mjs';
import { renderProse } from '../../src/lib/render-prose.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { makePlan, path } from '../audio/plan.mjs';

const alignment = text => ({ characters: [...text], character_start_times_seconds: [...text].map((_, i) => i / 10), character_end_times_seconds: [...text].map((_, i) => (i + 1) / 10) });
const block = text => ({ id: 'b', text, spoken: text, submitted: text, adaptation: false });
test('sentence segmentation preserves exact text and localized punctuation in all three languages', () => {
  for (const [lang, text] of [['en', '  Hello! Next sentence?  '], ['de', 'Ein Satz. Noch einer!'], ['sl', 'Prva poved. Druga poved?']]) {
    const spans = sentenceSpans(text, lang, 'b');
    assert.equal(spans.length, 2);
    assert.deepEqual(spans.map(s => s.id), ['b-s1', 'b-s2']);
    for (const s of spans) assert.equal(text.slice(s.startOffset, s.endOffset), s.text);
    const html = sentenceHtml(text, lang, 'b', value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;'));
    assert.equal(parseHTML(`<div>${html}</div>`).document.querySelector('div').textContent, text);
  }
});
test('sentence cues map Unicode character cells, joining offsets and split paragraph units', () => {
  const text = 'Živjo 👋. Druga poved.';
  const b = block(text);
  const parts = sentenceSpans(text, 'sl', 'b');
  const cues = parts.flatMap((part, i) => unitSentenceCues({ unit: { text: part.text }, block: b, lang: 'sl', alignment: alignment(part.text), duration: [...part.text].length / 10, offset: i * 10, textOffset: part.startOffset }));
  assert.equal(cues[1].sentenceId, 'b-s2');
  assert.equal(cues[1].start, 10);
  assert.equal(cues[0].end, [...parts[0].text].length / 10);
  validateSentenceCues(cues, 20, [b], 'sl');
  assert.throws(() => validateSentenceCues(cues.slice(0, 1), 20, [b], 'sl'), /Incomplete/);
  assert.throws(() => validateSentenceCues([cues[0], cues[0]], 20, [b], 'sl'), /Invalid/);
  assert.throws(() => unitSentenceCues({ unit: { text: 'Živjo' }, block: b, lang: 'sl', alignment: alignment('Živjo'), duration: 1, offset: 0 }), /splits a sentence/);
});
test('zero-duration provider alignment identifies the affected sentence without inventing timing', () => {
  const text = 'Zgodba. Zgodba angažiranja.';
  const b = block(text);
  const timings = alignment(text);
  for (let i = 0; i < 'Zgodba.'.length; i++) {
    timings.character_start_times_seconds[i] = 0;
    timings.character_end_times_seconds[i] = 0;
  }
  const cues = unitSentenceCues({ unit: { text }, block: b, lang: 'sl', alignment: timings, duration: 10, offset: 0 });
  assert.equal(cues[0].start, cues[0].end);
  assert.throws(() => validateSentenceCues(cues, 10, [b], 'sl'), /b-s1: zero-duration alignment for "Zgodba\.".*review the retained recording/);
  assert.throws(() => validateSentenceCues([{ ...cues[0], end: -1 }, cues[1]], 10, [b], 'sl'), /invalid or overlapping interval/);
});
test('auditioned sentence corrections pin source and script, preserve originals and reject invalid ranges', () => {
  const b = block('Zgodba. Zgodba angažiranja.');
  const cues = unitSentenceCues({ unit: { text: b.submitted }, block: b, lang: 'sl', alignment: alignment(b.submitted), duration: 10, offset: 0 });
  cues[0].end = 0;
  const original = structuredClone(cues);
  const correction = { sourceAudioHash: 'source', reason: 'User audition', sentences: [
    { sentenceId: 'b-s1', text: cues[0].text, end: .74 },
    { sentenceId: 'b-s2', text: cues[1].text, start: 1.05 },
  ] };
  const corrected = correctSentenceCues(cues, correction, 'source', 10);
  assert.equal(corrected[0].end, .74);
  assert.equal(corrected[1].start, 1.05);
  assert.equal(corrected[1].end, cues[1].end);
  assert.deepEqual(cues, original);
  validateSentenceCues(corrected, 10, [b], 'sl');
  assert.throws(() => correctSentenceCues(cues, correction, 'new-source', 10), /hash mismatch/);
  assert.throws(() => correctSentenceCues(cues, { ...correction, sentences: [{ ...correction.sentences[0], text: 'Changed.' }] }, 'source', 10), /script mismatch/);
  assert.throws(() => correctSentenceCues(cues, { ...correction, sentences: [{ ...correction.sentences[0], end: 11 }] }, 'source', 10), /outside retained audio/);
  assert.throws(() => correctSentenceCues(cues, { ...correction, sentences: [{ ...correction.sentences[0], end: 2 }] }, 'source', 10), /Invalid corrected sentence interval/);
});
test('sentence hooks preserve inline links/emphasis, visible text, typography and block identities', () => {
  const text = 'A good sentence. Another one.';
  const html = renderProse('<p data-audio-block="b">A <em>good</em> sentence. Another <a href="/x">one</a>.</p>', { lang: 'en', audioBlocks: [block(text)] });
  const { document } = parseHTML(html);
  assert.equal(document.querySelector('p').textContent, text);
  assert.equal(document.querySelector('p').dataset.audioBlock, 'b');
  assert.ok(document.querySelectorAll('[data-audio-sentence="b-s1"]').length > 1, 'A sentence can span inline elements');
  assert.ok(document.querySelector('em [data-audio-sentence="b-s1"]'));
  assert.ok(document.querySelector('a [data-audio-sentence="b-s2"]'));
  const quotes = renderProse('<p data-audio-block="b">„Hallo“, sagt sie. Noch ein Satz.</p>', { lang: 'de', audioBlocks: [block('"Hallo", sagt sie. Noch ein Satz.')] });
  assert.equal(parseHTML(quotes).document.querySelectorAll('[data-audio-sentence]').length, 2);
});
test('adaptations and non-matching visible prose are not falsely marked as verbatim sentences', () => {
  for (const b of [{ ...block('Spoken comparison.'), adaptation: true }, block('Different spoken text.')]) {
    const html = renderProse('<p data-audio-block="b">Original displayed passage.</p>', { lang: 'en', audioBlocks: [b] });
    const { document } = parseHTML(html);
    assert.equal(document.querySelectorAll('[data-audio-sentence]').length, 0);
    assert.equal(document.querySelector('p').dataset.audioBlock, 'b');
  }
});
test('rendered prose has sentence hooks in all three languages', { skip: !existsSync(path('dist/book/02-the-power-of-superblocks.html')) }, () => {
  const plan = makePlan();
  for (const lang of new Set(plan.chapters.map(chapter => chapter.lang))) {
    const chapter = plan.chapters.find(chapter => chapter.lang === lang && chapter.file === '02');
    const blocks = chapter.blocks.filter(b => b.kind === 'paragraph' && !b.adaptation && b.submitted === b.text).slice(0, 2);
    assert.equal(blocks.length, 2, lang);
    const { document } = parseHTML(readFileSync(path(`dist${chapter.pageUrl}`), 'utf8'));
    const hooks = new Set([...document.querySelectorAll('[data-audio-sentence]')].map(n => n.getAttribute('data-audio-sentence')));
    for (const b of blocks) for (const sentence of sentenceSpans(b.submitted, chapter.lang, b.id)) assert.ok(hooks.has(sentence.id), `${chapter.id}: ${sentence.id}`);
  }
});
