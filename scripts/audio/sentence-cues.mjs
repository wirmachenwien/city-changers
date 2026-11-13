import { sentenceSpans } from '../../src/lib/audio-sentences.mjs';

export function unitSentenceCues({ unit, block, lang, alignment, duration, offset, textOffset = 0 }) {
  const spans = sentenceSpans(block.submitted, lang, block.id);
  const cells = [];
  let position = 0;
  alignment.characters.forEach((text, index) => {
    cells.push({ start: position, end: position + text.length, index });
    position += text.length;
  });
  if (alignment.characters.join('') !== unit.text || block.submitted.slice(textOffset, textOffset + unit.text.length) !== unit.text) throw new Error('Sentence cue script mismatch');
  return sentenceSpans(unit.text, lang, block.id).map(part => {
    const sentence = spans.find(s => s.startOffset === part.startOffset + textOffset && s.endOffset === part.endOffset + textOffset);
    if (!sentence) throw new Error('Narration unit splits a sentence; explicit mapping required');
    const indices = cells.filter(cell => cell.end > part.startOffset && cell.start < part.endOffset).map(cell => cell.index);
    const start = alignment.character_start_times_seconds[indices[0]];
    const end = Math.min(duration, Math.max(...indices.map(i => alignment.character_end_times_seconds[i])));
    return { sentenceId: sentence.id, blockIds: [block.id], start: offset + start, end: offset + end,
      startOffset: sentence.startOffset, endOffset: sentence.endOffset, text: sentence.text };
  });
}

// Auditioned source-relative boundaries only; preserve the provider response.
export function correctSentenceCues(cues, correction, sourceAudioHash, duration) {
  if (!correction) return cues;
  if (correction.sourceAudioHash !== sourceAudioHash) throw new Error('Sentence timing correction source audio hash mismatch; audition the current recording');
  if (!correction.reason || !Array.isArray(correction.sentences) || !correction.sentences.length) throw new Error('Invalid sentence timing correction');
  const result = cues.map(cue => ({ ...cue }));
  const seen = new Set();
  for (const boundary of correction.sentences) {
    const cue = result.find(c => c.sentenceId === boundary.sentenceId);
    if (!cue || seen.has(boundary.sentenceId) || cue.text !== boundary.text || (boundary.start === undefined && boundary.end === undefined)) throw new Error('Sentence timing correction script mismatch');
    seen.add(boundary.sentenceId);
    for (const key of ['start', 'end']) if (boundary[key] !== undefined) {
      if (!Number.isFinite(boundary[key]) || boundary[key] < 0 || boundary[key] > duration) throw new Error('Sentence timing correction outside retained audio');
      cue[key] = boundary[key];
    }
  }
  let end = 0;
  for (const cue of result) {
    if (cue.start < end - 0.001 || cue.end <= cue.start || cue.end > duration) throw new Error('Invalid corrected sentence interval');
    end = cue.end;
  }
  return result;
}

export function validateSentenceCues(cues, duration, blocks, lang) {
  const expected = new Map(blocks.flatMap(b => sentenceSpans(b.submitted, lang, b.id).map(s => [s.id, { ...s, blockId: b.id }])));
  let previousEnd = 0;
  const seen = new Set();
  for (const cue of cues) {
    const sentence = expected.get(cue.sentenceId);
    const fail = reason => { throw new Error(`Invalid sentence cue mapping/range for ${cue.sentenceId}: ${reason}`); };
    if (!sentence || seen.has(cue.sentenceId) || cue.blockIds.length !== 1 || cue.blockIds[0] !== sentence.blockId ||
        cue.startOffset !== sentence.startOffset || cue.endOffset !== sentence.endOffset || cue.text !== sentence.text) fail('sentence mapping does not match the submitted script');
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end)) fail('non-finite timestamps');
    if (cue.end === cue.start) fail(`zero-duration alignment for ${JSON.stringify(cue.text)} at ${cue.start.toFixed(3)}s; review the retained recording and alignment before preparing (no automatic regeneration)`);
    if (cue.start < 0 || cue.start < previousEnd - 0.001 || cue.end < cue.start || cue.end > duration + 1 / 44100) fail(`invalid or overlapping interval ${cue.start}–${cue.end}s (previous end ${previousEnd}s, track duration ${duration}s)`);
    seen.add(cue.sentenceId);
    previousEnd = cue.end;
  }
  if (seen.size !== expected.size) throw new Error('Incomplete sentence cue coverage');
}
