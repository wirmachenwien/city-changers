import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePlan, read, path } from './plan.mjs';
import { hash } from './content.mjs';
import { validateReleaseInventory } from './release.mjs';
import { validateSentenceCues } from './sentence-cues.mjs';
import { validateCues } from './media.mjs';

export function checkAudioRelease({ allowMissing = false } = {}) {
  if (!existsSync(path('audio/release.json'))) {
    if (allowMissing && !existsSync(path('audio/published.json'))) return null;
    throw new Error('Missing audio/release.json; run npm run audio:prepare');
  }
  const release = validateReleaseInventory(read('audio/release.json'));
  const publication = read('audio/published.json');
  if (JSON.stringify(publication) !== JSON.stringify(release.publication)) throw new Error('Audio publication and release inventory differ');
  const plan = makePlan();
  if (publication.planHash !== plan.planHash) throw new Error('Audio release configuration/content changed; run npm run audio:prepare');
  if (publication.chapters.length !== plan.chapters.length || new Set(publication.chapters.map(c => c.id)).size !== plan.chapters.length ||
      publication.audiobooks.length !== new Set(plan.chapters.map(c => c.lang)).size || new Set(publication.audiobooks.map(b => b.lang)).size !== publication.audiobooks.length) throw new Error('A release needs all 21 chapters and three complete language audiobooks; run npm run audio:prepare');
  for (const chapter of plan.chapters) {
    const track = publication.chapters.find(c => c.id === chapter.id);
    if (!track || track.cueSchemaVersion !== 2 || track.sourceHash !== chapter.sourceHash || track.scriptHash !== chapter.scriptHash || track.assemblyHash !== chapter.assemblyHash ||
        track.pageUrl !== chapter.pageUrl || !Number.isFinite(track.duration) || track.duration <= 0) throw new Error(`${chapter.id}: stale/incomplete audio release`);
    for (const item of [track.cues, track.transcript]) {
      const data = readFileSync(path(`public/audio/${item.file}`));
      if (data.length !== item.bytes || hash(data) !== item.sha256 || item.url !== `/audio/${item.file}`) throw new Error(`${chapter.id}: invalid website artifact ${item.file}`);
    }
    const cues = read(`public/audio/${track.cues.file}`);
    if (cues.schemaVersion !== 2 || cues.granularity !== 'sentence' || cues.revision !== track.revision || cues.chapterId !== chapter.id) throw new Error(`${chapter.id}: cue revision mismatch`);
    validateCues(cues.cues, track.duration, chapter.blocks.map(b => b.id));
    validateSentenceCues(cues.sentenceCues, track.duration, chapter.blocks, chapter.lang);
  }
  for (const lang of new Set(plan.chapters.map(c => c.lang))) {
    const book = publication.audiobooks.find(b => b.lang === lang);
    if (!book || !Number.isFinite(book.duration) || book.duration <= 0 || publication.chapters.some(c => c.lang === lang && c.revision !== book.revision)) throw new Error(`${lang}: stale/incomplete audiobook`);
  }
  return release;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const release = checkAudioRelease({ allowMissing: process.argv.includes('--allow-missing') });
    console.log(release ? `Audio release candidate valid: ${release.tag}` : 'No audio edition configured; no audio publication required.');
  } catch (error) { console.error(`Audio: ${error.message}`); process.exitCode = 1; }
}
