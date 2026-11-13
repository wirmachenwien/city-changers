import { openSync, closeSync, readSync, writeSync, statSync } from 'node:fs';

// Resolve a text boundary against retained alignment, never by guessing a
// compressed-audio timestamp or asking the TTS service to generate again.
export function resolveUnitPauses({ unit, block, alignment, duration, textOffset, sampleRate = 44100 }) {
  if (!block.pause) return [];
  if (block.pause.textOffset === null) throw new Error('Reflection pause anchor is missing/ambiguous; review the narration override');
  const boundary = block.pause.textOffset - textOffset;
  if (boundary <= 0 || boundary > unit.text.length) return [];
  let position = 0;
  let previous;
  let next;
  alignment.characters.forEach((character, index) => {
    const start = position;
    position += character.length;
    if (position <= boundary && /\S/u.test(character)) previous = index;
    if (next === undefined && start >= boundary && /\S/u.test(character)) next = index;
  });
  if (previous === undefined) throw new Error('Reflection pause has no preceding aligned text');
  let sourceTime;
  if (next === undefined) sourceTime = duration; // prompt ends this independently generated unit
  else {
    const promptEnd = alignment.character_end_times_seconds[previous];
    const answerStart = alignment.character_start_times_seconds[next];
    sourceTime = promptEnd <= answerStart ? (promptEnd + answerStart) / 2 : answerStart;
  }
  if (!Number.isFinite(sourceTime) || sourceTime < 0 || sourceTime > duration) throw new Error('Reflection pause lies outside retained audio');
  const sample = Math.round(sourceTime * sampleRate);
  const frames = Math.round(block.pause.seconds * sampleRate);
  return [{ sourceTime: sample / sampleRate, sample, frames, seconds: frames / sampleRate, textOffset: block.pause.textOffset, reason: 'reflection' }];
}

export function retimeSentence(cue, pauses, chapterOffset) {
  let shift = 0;
  let end = cue.end;
  for (const pause of pauses) {
    if (cue.startOffset >= pause.textOffset) shift += pause.seconds;
    else if (cue.endOffset <= pause.textOffset) {
      // Punctuation timing may overlap the next word; never highlight the
      // preceding sentence through the newly inserted silent interval.
      end = Math.min(end, pause.sourceTime);
    } else throw new Error('A reflection pause splits a sentence; review the explicit text boundary');
  }
  return { ...cue, start: chapterOffset + cue.start + shift, end: chapterOffset + end + shift };
}

export function insertPcmPauses(source, target, pauses, sampleRate = 44100) {
  const bytes = statSync(source).size;
  if (bytes % 2) throw new Error('Expected mono signed 16-bit PCM');
  const input = openSync(source, 'r');
  const output = openSync(target, 'w');
  const buffer = Buffer.alloc(65536);
  const silence = Buffer.alloc(65536);
  let cursor = 0;
  function copy(until) {
    while (cursor < until) {
      const n = readSync(input, buffer, 0, Math.min(buffer.length, until - cursor), cursor);
      if (!n) throw new Error('Unexpected end of retained PCM');
      writeSync(output, buffer, 0, n); cursor += n;
    }
  }
  try {
    for (const pause of pauses) {
      const at = pause.sample * 2;
      if (at < cursor || at > bytes || !Number.isSafeInteger(pause.frames) || pause.frames < 0) throw new Error('Invalid PCM pause insertion');
      copy(at);
      let remaining = pause.frames * 2;
      while (remaining) { const n = Math.min(remaining, silence.length); writeSync(output, silence, 0, n); remaining -= n; }
    }
    copy(bytes);
  } finally { closeSync(input); closeSync(output); }
  return (bytes / 2 + pauses.reduce((sum, p) => sum + p.frames, 0)) / sampleRate;
}
