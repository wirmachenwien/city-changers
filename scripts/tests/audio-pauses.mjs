import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveUnitPauses, retimeSentence, insertPcmPauses } from '../audio/pauses.mjs';
import { unitSentenceCues, validateSentenceCues } from '../audio/sentence-cues.mjs';

test('reflection pauses insert exact silence and shift answer cues in all three languages', () => {
  const parent = join(tmpdir(), 'opencode'); mkdirSync(parent, { recursive: true });
  const temp = mkdtempSync(join(parent, 'audio-pauses-'));
  for (const [lang, prompt, answer] of [['en', 'Pause to think.', 'Answer: Yes.'], ['de', 'Nimm dir einen Moment Zeit.', 'Antwort: Ja.'], ['sl', 'Vzemite si trenutek za razmislek.', 'Odgovor: Da.']]) {
    const text = `${prompt} ${answer}`;
    const sampleRate = 1000;
    const alignment = { characters: [...text], character_start_times_seconds: [...text].map((_, i) => i / 100), character_end_times_seconds: [...text].map((_, i) => (i + 1) / 100) };
    const duration = [...text].length / 100;
    const block = { id: 'b', submitted: text, pause: { seconds: 3, after: prompt, textOffset: prompt.length } };
    const unit = { text };
    const pauses = resolveUnitPauses({ unit, block, alignment, duration, textOffset: 0, sampleRate });
    const cues = unitSentenceCues({ unit, block, lang, alignment, duration, offset: 0 }).map(cue => retimeSentence(cue, pauses, 0));
    validateSentenceCues(cues, duration + 3, [block], lang);
    assert.equal(pauses[0].frames, 3000);
    assert.ok(cues[1].start - cues[0].end >= 3);
    const original = Buffer.alloc(Math.round(duration * sampleRate) * 2, 0x3f);
    const source = join(temp, `${lang}.source.pcm`), output = join(temp, `${lang}.pcm`);
    writeFileSync(source, original);
    assert.ok(Math.abs(insertPcmPauses(source, output, pauses, sampleRate) - duration - 3) < 1e-10);
    const result = readFileSync(output), cut = pauses[0].sample * 2, silence = pauses[0].frames * 2;
    assert.deepEqual(result.subarray(0, cut), original.subarray(0, cut));
    assert.deepEqual(result.subarray(cut, cut + silence), Buffer.alloc(silence));
    assert.deepEqual(result.subarray(cut + silence), original.subarray(cut));
    assert.deepEqual(readFileSync(source), original, 'Retained source must not be modified');
  }
});
test('pause anchors fail closed and prompt-at-unit-end inserts silence before the next unit', () => {
  const text = 'Pause to think.';
  const alignment = { characters: [...text], character_start_times_seconds: [...text].map((_, i) => i / 10), character_end_times_seconds: [...text].map((_, i) => (i + 1) / 10) };
  const block = { pause: { seconds: 3, textOffset: text.length } };
  const pauses = resolveUnitPauses({ unit: { text }, block, alignment, duration: 2, textOffset: 0 });
  assert.equal(pauses[0].sourceTime, 2);
  assert.throws(() => resolveUnitPauses({ unit: { text }, block: { pause: { seconds: 3, textOffset: null } }, alignment, duration: 2, textOffset: 0 }), /anchor is missing/);
  assert.throws(() => retimeSentence({ start: 0, end: 2, startOffset: 0, endOffset: 20 }, pauses, 0), /splits a sentence/);
});
