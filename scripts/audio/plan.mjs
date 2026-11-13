import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, openSync, closeSync, fsyncSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { hash, parseSource, identify, splitText } from './content.mjs';
import { chapterUrlSlug } from '../../src/lib/chapter-slug.ts';
import { base, defaultLang, languages } from '../../handbook.config.ts';

// Commands run from the repository root; Astro's bundled prerender chunks
// relocate import.meta.url, so it must not determine source paths at runtime.
export const root = process.cwd();
export const path = value => join(root, value);
export const read = value => JSON.parse(readFileSync(path(value), 'utf8'));
export function write(value, data) {
  mkdirSync(join(path(value), '..'), { recursive: true });
  const temporary = `${path(value)}.tmp-${process.pid}`;
  const fd = openSync(temporary, 'w', 0o600);
  try { writeFileSync(fd, JSON.stringify(data, null, 2) + '\n'); fsyncSync(fd); }
  finally { closeSync(fd); }
  renameSync(temporary, path(value));
}
// Retained narration is the source of truth for freshness. No separate approval
// ledger can drift from what actually exists on disk.
export function assets() {
  const directory = path('.cache/audio/units');
  return existsSync(directory) ? readdirSync(directory).filter(name => /^[a-f0-9]{64}$/.test(name)).flatMap(key => {
    const file = `.cache/audio/units/${key}/result.json`;
    const source = `.cache/audio/units/${key}/source.mp3`;
    if (!existsSync(path(file)) || !existsSync(path(source))) return [];
    const result = read(file);
    // A result without a verified source is not reusable. This keeps plan,
    // generation and assembly aligned; incomplete responses stay journal-blocked.
    return result.sourceAudioHash && hash(readFileSync(path(source))) === result.sourceAudioHash ? [{ key, ...result }] : [];
  }) : [];
}
export function movedIds(previous, current) {
  // Longest common subsequence, not raw paragraph indices: inserting a block
  // does not mark every following block as moved.
  const a = previous.filter(id => current.includes(id));
  const b = current.filter(id => previous.includes(id));
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const stationary = new Set();
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { stationary.add(a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return new Set(b.filter(id => !stationary.has(id)));
}
export function makePlan() {
  const config = read('audio/config.json');
  if (config.modelId !== 'eleven_v4' || config.endpoint !== '/v1/text-to-dialogue/with-timestamps' || config.outputFormat !== 'mp3_44100_128' || config.continuity !== 'independent-units') throw new Error('Model/route/format/continuity changes require an implementation and audition review');
  if (config.pronunciation.dictionaries.some(d => !d.pronunciation_dictionary_id || !d.version_id)) throw new Error('Pronunciation dictionaries must pin explicit version IDs');
  if (!Number.isInteger(config.maxCharacters) || config.maxCharacters < 1 || config.maxCharacters > 2000) throw new Error('Endpoint budget must be 1–2000 characters');
  const reflectionPauseSeconds = config.assembly?.reflectionPauseSeconds ?? 0;
  if (!Number.isFinite(reflectionPauseSeconds) || reflectionPauseSeconds < 0 || reflectionPauseSeconds > 30) throw new Error('Reflection pause must be between 0 and 30 seconds');
  const overrides = read('audio/overrides.json');
  const timingFile = 'audio/sentence-timing-corrections.json';
  const timing = existsSync(path(timingFile)) ? read(timingFile) : { schemaVersion: 1, corrections: [] };
  if (timing.schemaVersion !== 1 || !Array.isArray(timing.corrections) || new Set(timing.corrections.map(c => c.unitId)).size !== timing.corrections.length) throw new Error('Invalid sentence timing corrections');
  const registry = read('audio/blocks.json');
  const glossary = read('src/data/glossary.json');
  const works = read('src/data/works.json');
  const retained = new Set(assets().map(asset => asset.unit.cacheKey));
  const chapters = [];
  for (const lang of languages) for (const chapter of works[lang].chapters.filter(c => c.web !== false && c.file !== 'contents')) {
    const id = `${lang}/${chapter.file}`;
    const source = readFileSync(path(`src/content/book/${id}.mdx`), 'utf8');
    const parsed = parseSource(source, lang, glossary);
    const previous = registry.chapters[id] ?? [];
    const blocks = identify(parsed.blocks, previous, overrides.bindings[id]);
    const moved = movedIds(previous.map(b => b.id), blocks.map(b => b.id));
    const units = [];
    for (const block of blocks) {
      const override = overrides.blocks[`${id}/${block.id}`];
      block.spoken = override?.text ?? block.narration ?? block.text;
      block.submitted = block.spoken;
      for (const [from, to] of Object.entries(config.pronunciation.replacements[lang])) block.submitted = block.submitted.split(from).join(to);
      if (block.reflectionPauseAfter && reflectionPauseSeconds > 0) {
        let after = override?.reflectionPauseAfter ?? block.reflectionPauseAfter;
        for (const [from, to] of Object.entries(config.pronunciation.replacements[lang])) after = after.split(from).join(to);
        const index = block.submitted.indexOf(after);
        block.pause = { seconds: reflectionPauseSeconds, after,
          textOffset: index >= 0 && block.submitted.indexOf(after, index + after.length) === -1 ? index + after.length : null };
      }
      for (const [part, submitted] of splitText(block.submitted, lang, config.maxCharacters).entries()) {
        const unitId = `${id}/${block.id}/${part}`;
        const cacheKey = hash({ submitted, model: config.modelId, endpoint: config.endpoint, outputFormat: config.outputFormat,
          settings: config.settings, seed: config.seed, normalization: config.normalization, processing: config.processing,
          pronunciationVersion: config.pronunciation.version, dictionaries: config.pronunciation.dictionaries,
          lang, voice: config.voices[lang], voiceHash: config.voiceHashes[lang], continuity: [] });
        const old = previous.find(p => p.id === block.id);
        const generated = retained.has(cacheKey);
        units.push({ id: unitId, blockIds: [block.id], text: submitted, originalText: block.spoken, cacheKey,
          sourceHash: hash(block.text), scriptHash: hash(submitted), continuityDependencies: [],
          change: generated ? (moved.has(block.id) ? 'moved' : 'reusable') : old ? 'changed' : 'inserted' });
      }
    }
    const sourceHash = hash({ source, glossary: chapter.file === 'glossary' ? glossary[lang] : null });
    const scriptHash = hash(units.map(u => ({ id: u.id, cacheKey: u.cacheKey })));
    const sentenceTimingCorrections = timing.corrections.filter(c => c.chapterId === id);
    if (sentenceTimingCorrections.some(c => !units.some(u => u.id === c.unitId))) throw new Error(`${id}: sentence timing correction refers to a missing unit`);
    const assemblyHash = hash({ version: config.assembly?.version ?? 1, pauses: blocks.filter(b => b.pause).map(b => ({ id: b.id, pause: b.pause })),
      ...(sentenceTimingCorrections.length ? { sentenceTimingCorrections } : {}) });
    chapters.push({ id, lang, file: chapter.file, title: parsed.title,
      pageUrl: `${base.replace(/\/$/, '')}/book/${lang === defaultLang ? '' : `${lang}/`}${chapterUrlSlug(chapter.file, parsed.title)}.html`,
      sourceHash, scriptHash, assemblyHash, sentenceTimingCorrections, blocks: blocks.map(({ node, ...b }) => b), units,
      deleted: previous.filter(p => !blocks.some(b => b.id === p.id)).map(p => p.id),
      continuityRepair: [], characters: units.reduce((n, u) => n + u.text.length, 0) });
  }
  if (timing.corrections.some(c => !chapters.some(ch => ch.id === c.chapterId))) throw new Error('Sentence timing correction refers to a missing chapter');
  const planHash = hash({ config, policy: overrides.policy, chapters: chapters.map(c => ({ id: c.id, sourceHash: c.sourceHash, scriptHash: c.scriptHash, assemblyHash: c.assemblyHash })) });
  return { schemaVersion: 1, planHash, config, chapters,
    characters: chapters.reduce((n, c) => n + c.characters, 0), requiredOutputs: { mp3: chapters.length, cues: chapters.length, m4b: languages.length } };
}
export function writePlan(plan) {
  write('.cache/audio/plan.json', plan);
}
function registryFor(plan) {
  return { schemaVersion: 1, chapters: Object.fromEntries(plan.chapters.map(c => [c.id, c.blocks.map(b => ({
    id: b.id, fingerprint: b.fingerprint, bindingKey: b.bindingKey, line: b.line,
  }))])) };
}
export function saveRegistry(plan) {
  const registry = registryFor(plan);
  write('audio/blocks.json', registry);
  return registry;
}
export function savePlan(plan) {
  writePlan(plan);
  return saveRegistry(plan);
}
export function report(plan) {
  const counts = {};
  const retained = new Set(assets().map(asset => asset.unit.cacheKey));
  const missing = plan.chapters.flatMap(c => c.units).filter(u => !retained.has(u.cacheKey));
  for (const c of plan.chapters) for (const u of c.units) counts[u.change] = (counts[u.change] ?? 0) + 1;
  const missingCharacters = missing.reduce((sum, u) => sum + u.text.length, 0);
  console.log(JSON.stringify({ planHash: plan.planHash, characters: plan.characters,
    generatedCharacters: plan.characters - missingCharacters, toGenerateCharacters: missingCharacters,
    assembly: { reflectionPauseSeconds: plan.config.assembly?.reflectionPauseSeconds ?? 0,
      additionalSilenceSeconds: plan.chapters.flatMap(c => c.blocks).reduce((sum, b) => sum + (b.pause?.seconds ?? 0), 0),
      unresolvedPauseAnchors: plan.chapters.flatMap(c => c.blocks.filter(b => b.pause?.textOffset === null).map(b => `${c.id}/${b.id}`)) },
    chapters: plan.chapters.map(c => {
      const pending = c.units.filter(u => !retained.has(u.cacheKey));
      return { id: c.id, characters: c.characters, units: c.units.length, toGenerateUnits: pending.length,
        toGenerateCharacters: pending.reduce((sum, u) => sum + u.text.length, 0), deleted: c.deleted };
    }), changes: counts, requiredOutputs: plan.requiredOutputs, paidCalls: 0 }, null, 2));
  console.log(`To generate: ${missing.length} units, ${missingCharacters} characters. Reusable: ${plan.characters - missingCharacters} characters.`);
}
