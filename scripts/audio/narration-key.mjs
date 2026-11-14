import { hash } from './content.mjs';

function inputs(config, submitted, lang, processing) {
  return { submitted, model: config.modelId, endpoint: config.endpoint, outputFormat: config.outputFormat,
    settings: config.settings, seed: config.seed, normalization: config.normalization,
    ...(processing ? { processing } : {}),
    pronunciationVersion: config.pronunciation.version, dictionaries: config.pronunciation.dictionaries,
    lang, voice: config.voices[lang], voiceHash: config.voiceHashes[lang], continuity: [] };
}

export const narrationKey = (config, submitted, lang) => hash(inputs(config, submitted, lang));
export const legacyNarrationKey = (config, submitted, lang) => hash(inputs(config, submitted, lang, config.processing));

// Preserve the published script-fingerprint format without letting current
// encoder settings affect speech identity. These are historical schema constants,
// not processing defaults; actual output settings remain in the media recipes.
export const publicationNarrationKey = (config, submitted, lang) => hash(inputs(config, submitted, lang,
  { version: 1, sampleRate: 44100, channels: 1, gainDb: 0, chapterMp3Bitrate: '128k', audiobookAacBitrate: '96k' }));

export function retainedNarrationKey(result) {
  const { config, unit, request } = result;
  if (!config) return unit?.cacheKey; // Synthetic/legacy records without provenance cannot be remapped.
  const lang = unit?.lang ?? request?.language_code;
  if (!lang || !config.voices?.[lang] || !config.voiceHashes?.[lang] || !request?.inputs?.[0]?.voice_id) return null;
  if (hash(request.inputs[0].voice_id) !== config.voiceHashes[lang]) return null;
  const key = narrationKey(config, unit.text, lang);
  return [key, legacyNarrationKey(config, unit.text, lang)].includes(unit.cacheKey) ? key : null;
}
