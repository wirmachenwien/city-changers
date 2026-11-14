import { hash } from './content.mjs';
import legacy from '../../audio/legacy-output.json' with { type: 'json' };

export const outputProcessingHash = processing => hash(Object.fromEntries(Object.entries(processing).sort(([a], [b]) => a.localeCompare(b))));

function knownLegacyOutput(item) {
  const recorded = item.track ? legacy.chapters[item.id] : legacy.audiobooks[item.lang]?.sha256;
  return item.revision === legacy.revision && typeof recorded === 'string' &&
    recorded === (item.track ? item.track.sha256 : item.sha256);
}

export function outputProcessingValid(item, processing) {
  const identity = item.processingHash ?? (knownLegacyOutput(item) ? outputProcessingHash(legacy.processing) : null);
  return identity === outputProcessingHash(processing);
}

export function audiobookSequenceMatches(book, chapters) {
  const ids = book.chapterIds ?? (knownLegacyOutput(book) ? legacy.audiobooks[book.lang].chapterIds : []);
  return ids.length === chapters.length && chapters.length > 0 &&
    chapters.every((chapter, index) => chapter && ids[index] === chapter.id && chapter.revision === book.revision);
}
