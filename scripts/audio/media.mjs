import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { read, write, path, assets } from './plan.mjs';
import { hash } from './content.mjs';
import { unitSentenceCues, correctSentenceCues, validateSentenceCues } from './sentence-cues.mjs';
import { resolveUnitPauses, retimeSentence, insertPcmPauses } from './pauses.mjs';
import { releaseInventory } from './release.mjs';
import { prunePublicAudio } from './prune.mjs';

const staging = '.cache/audio/release';
const ffescape = value => value.replace(/([\\=;#\n])/g, '\\$1');
function run(program, args, options = {}) {
  const result = spawnSync(program, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) throw new Error(`${program} failed; install FFmpeg/ffprobe and check retained media (output withheld)`);
  return result.stdout;
}
export function probe(file) {
  return JSON.parse(run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-show_chapters', '-of', 'json', path(file)]));
}
const digest = file => hash(readFileSync(path(file)));
const duration = file => Number(probe(file).format.duration);
export function audiobookFilename(title, lang) {
  const name = title.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!name || !['en', 'de', 'sl'].includes(lang)) throw new Error('Invalid audiobook filename');
  return `${name}-${lang}.m4b`;
}
function artifact(file, url) { return { url, file: file.slice(staging.length + 1), bytes: statSync(path(file)).size, sha256: digest(file) }; }

export function validateCues(cues, seconds, blockIds) {
  let end = 0;
  for (const cue of cues) {
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < end - 0.001 || cue.end <= cue.start || cue.end > seconds + 0.08 ||
        !Array.isArray(cue.blockIds) || cue.blockIds.some(id => !blockIds.includes(id))) throw new Error('Invalid, overlapping or out-of-range paragraph cue');
    end = cue.end;
  }
  for (const id of blockIds) if (!cues.some(c => c.blockIds.includes(id))) throw new Error(`Missing cue for ${id}`);
}
export function validateAlignment(alignment, text, seconds) {
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment;
  if (!Array.isArray(characters) || !Array.isArray(starts) || !Array.isArray(ends) || !characters.length || characters.join('') !== text || starts.length !== characters.length || ends.length !== characters.length) throw new Error('Alignment is not exact submitted text; review or forced alignment required');
  let last = 0;
  const adjustments = [];
  for (let i = 0; i < starts.length; i++) {
    if (!Number.isFinite(starts[i]) || !Number.isFinite(ends[i]) || starts[i] < 0 || starts[i] > seconds || starts[i] < last - 0.001 || ends[i] < starts[i]) throw new Error('Invalid source alignment');
    if (ends[i] > seconds) {
      // Retained v4 output assigns up to 80 ms beyond decoded audio to the
      // final spoken character as well as trailing punctuation/whitespace.
      // Bound only this terminal end, never starts, interior speech or larger
      // overruns. Original alignment and source audio remain untouched.
      if (ends[i] - seconds > 0.08 + 1 / 44100 || !/^[\p{P}\s]*$/u.test(characters.slice(i + 1).join(''))) throw new Error('Invalid source alignment');
      adjustments.push({ characterIndex: i, originalEnd: ends[i], boundedEnd: seconds,
        reason: /^[\p{P}\s]+$/u.test(characters[i]) ? 'terminal-punctuation-overshoot' : 'terminal-character-overshoot' });
    }
    last = starts[i];
  }
  return { start: starts[0], end: Math.min(Math.max(...ends), seconds), adjustments };
}

export function assemble(plan, { audiobooks = true } = {}) {
  const retained = assets();
  const previousFile = `${staging}/manifest.json`;
  const previous = existsSync(path(previousFile)) ? read(previousFile) : { chapters: [], audiobooks: [] };
  let reusedOutputs = 0;
  let remuxedOutputs = 0;
  const config = plan.config;
  const processing = config.processing;
  // These settings are intentionally fixed: no variable loudness, speed changes,
  // silence removal, crossfades or hidden offsets after alignment.
  if (processing.sampleRate !== 44100 || processing.channels !== 1 || processing.gainDb !== 0) throw new Error('Processing changes require implementation and timing review');
  // Publication/cue revisions change independently of narration cache keys.
  const revision = hash({ planHash: plan.planHash, publicationVersion: 2, cueSchemaVersion: 2, audiobookMetadataVersion: 2, chapters: plan.chapters.map(c => c.id), audiobooks }).slice(0, 20);
  const prefix = `${staging}/${revision}`;
  mkdirSync(path(prefix), { recursive: true });
  const mediaBase = config.mediaBaseUrl.replace(/\/$/, '');
  if (!mediaBase.startsWith('/') && !mediaBase.startsWith('https://')) throw new Error('Use a root-relative or HTTPS media base URL');
  const manifest = { schemaVersion: 1, cueSchemaVersion: 2, planHash: plan.planHash, revision, chapters: [], audiobooks: [], processing,
    toolchain: run('ffmpeg', ['-version']).split('\n')[0] };
  for (const chapter of plan.chapters) {
    const dir = `${prefix}/${chapter.lang}`;
    mkdirSync(path(dir), { recursive: true });
    const cues = [], sentenceCues = [], offsets = [], pcmFiles = [];
    const textOffsets = new Map();
    let offset = 0;
    for (const unit of chapter.units) {
      const matches = retained.filter(r => r.unit.cacheKey === unit.cacheKey);
      if (matches.length !== 1) throw new Error(`Need exactly one retained asset for ${unit.id}; found ${matches.length}`);
      const asset = matches[0];
      const source = `.cache/audio/units/${asset.key}/source.mp3`;
      if (asset.sourceAudioHash !== digest(source)) throw new Error(`Retained source hash missing/stale for ${unit.id}`);
      let pcm = `${prefix}/${asset.key}.source.pcm`;
      run('ffmpeg', ['-v', 'error', '-y', '-i', path(source), '-f', 's16le', '-ar', '44100', '-ac', '1', path(pcm)]);
      const seconds = statSync(path(pcm)).size / (44100 * 2);
      let validated;
      try { validated = validateAlignment(asset.timings.alignment, unit.text, seconds); }
      catch (error) { throw new Error(`${unit.id}: ${error.message} (decoded duration ${seconds.toFixed(3)}s)`); }
      const { start, end, adjustments } = validated;
      if (unit.blockIds.length !== 1) throw new Error('Grouped narration units require explicit sentence-to-block mapping');
      const block = chapter.blocks.find(b => b.id === unit.blockIds[0]);
      const cursor = textOffsets.get(block.id) ?? 0;
      const textOffset = block.submitted.indexOf(unit.text, cursor);
      if (textOffset < 0 || block.submitted.slice(cursor, textOffset).trim()) throw new Error('Non-contiguous narration unit mapping');
      const pauses = resolveUnitPauses({ unit, block, alignment: asset.timings.alignment, duration: seconds, textOffset });
      const correction = chapter.sentenceTimingCorrections?.find(c => c.unitId === unit.id);
      const sourceSentences = correctSentenceCues(unitSentenceCues({ unit, block, lang: chapter.lang, alignment: asset.timings.alignment, duration: seconds, offset: 0, textOffset }), correction, asset.sourceAudioHash, seconds);
      sentenceCues.push(...sourceSentences.map(cue => retimeSentence(cue, pauses, offset)));
      let masteredSeconds = seconds;
      if (pauses.length) {
        const padded = `${prefix}/${hash({ assetKey: asset.key, pauses })}.pcm`;
        masteredSeconds = insertPcmPauses(path(pcm), path(padded), pauses);
        pcm = padded;
      }
      const addedBefore = time => pauses.filter(p => p.sourceTime <= time).reduce((sum, p) => sum + p.seconds, 0);
      cues.push({ start: offset + start + addedBefore(start), end: offset + end + addedBefore(end), blockIds: unit.blockIds });
      textOffsets.set(block.id, textOffset + unit.text.length);
      offsets.push({ unitId: unit.id, assetKey: asset.key, offset, duration: masteredSeconds, sourceDuration: seconds,
        audioHash: digest(source), timingAdjustments: adjustments, ...(correction ? { sentenceTimingCorrection: correction } : {}), insertedPauses: pauses });
      pcmFiles.push(pcm);
      offset += masteredSeconds;
    }
    const raw = `${dir}/${chapter.file}.pcm`;
    // Stream each retained decoded unit into the chapter master; do not hold a book in RAM.
    const output = openPcm(raw, pcmFiles);
    const mp3 = `${dir}/${chapter.file}.mp3`;
    const recipeHash = hash({ processing, title: chapter.title, audio: offsets.map(a => ({ assetKey: a.assetKey, duration: a.duration, audioHash: a.audioHash, ...(a.insertedPauses.length ? { pauses: a.insertedPauses } : {}) })) });
    const old = previous.chapters.find(c => c.id === chapter.id && c.recipeHash === recipeHash);
    if (old && existsSync(path(`${staging}/${old.track.file}`)) && digest(`${staging}/${old.track.file}`) === old.track.sha256) {
      if (path(`${staging}/${old.track.file}`) !== path(mp3)) copyFileSync(path(`${staging}/${old.track.file}`), path(mp3));
      reusedOutputs++;
    } else run('ffmpeg', ['-v', 'error', '-y', '-f', 's16le', '-ar', '44100', '-ac', '1', '-i', path(output),
      '-c:a', 'libmp3lame', '-b:a', processing.chapterMp3Bitrate, '-map_metadata', '-1', '-metadata', `title=${chapter.title}`, path(mp3)]);
    const measured = duration(mp3);
    if (Math.abs(measured - offset) > 0.15) throw new Error(`Final encode duration mismatch for ${chapter.id}`);
    validateCues(cues, measured, chapter.blocks.map(b => b.id));
    try { validateSentenceCues(sentenceCues, measured, chapter.blocks, chapter.lang); }
    catch (error) { throw new Error(`${chapter.id}: ${error.message}`); }
    const cueFile = `${dir}/${chapter.file}.cues.json`;
    write(cueFile, { schemaVersion: 2, granularity: 'sentence', revision, chapterId: chapter.id, cues, sentenceCues });
    const url = `${mediaBase}/${revision}/${chapter.lang}/${chapter.file}`;
    manifest.chapters.push({ id: chapter.id, lang: chapter.lang, file: chapter.file, title: chapter.title, pageUrl: chapter.pageUrl,
      revision, cueSchemaVersion: 2, recipeHash, sourceHash: chapter.sourceHash, scriptHash: chapter.scriptHash, assemblyHash: chapter.assemblyHash, duration: measured, pcmDuration: offset,
      track: artifact(mp3, `${url}.mp3`), cues: artifact(cueFile, `${url}.cues.json`),
      blockIds: chapter.blocks.map(b => b.id), assembly: offsets });
  }
  for (const lang of audiobooks ? [...new Set(plan.chapters.map(c => c.lang))] : []) {
    const chapters = manifest.chapters.filter(c => c.lang === lang);
    const metadata = config.metadata;
    const narrator = typeof metadata.narrator === 'string' ? metadata.narrator : metadata.narrator?.[lang];
    if (!narrator || !metadata.rights || !metadata.cover || !existsSync(path(metadata.cover))) throw new Error('Set the configured narrator, rights/AI-narration credits and permitted existing cover artwork');
    const title = read('src/data/works.json')[lang].title;
    let offset = 0;
    const markers = chapters.map(c => {
      const start = Math.round(offset * 1000);
      offset += c.pcmDuration;
      return `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${start}\nEND=${Math.round(offset * 1000)}\ntitle=${ffescape(c.title)}`;
    });
    const metaFile = `${prefix}/${lang}/book.ffmetadata`;
    writeFileSync(path(metaFile), `;FFMETADATA1\ntitle=${ffescape(title)}\nalbum=${ffescape(title)}\nlanguage=${{ en: 'eng', de: 'deu', sl: 'slv' }[lang]}\nartist=${ffescape(metadata.author)}\nalbum_artist=${ffescape(narrator)}\ncomposer=${ffescape(narrator)}\ncopyright=${ffescape(metadata.rights)}\ncomment=${ffescape(metadata.rights)}\nmedia_type=2\n${markers.join('\n')}\n`);
    const filename = audiobookFilename(title, lang);
    const m4b = `${prefix}/${lang}/${filename}`;
    const mediaRecipe = { lang, title, processing, narrator, author: metadata.author, rights: metadata.rights, coverHash: digest(metadata.cover),
      chapters: chapters.map(c => ({ title: c.title, duration: c.pcmDuration, audio: c.assembly.map(a => a.insertedPauses.length ? { hash: a.audioHash, pauses: a.insertedPauses } : a.audioHash) })) };
    const mediaRecipeHash = hash(mediaRecipe);
    const recipeHash = hash({ mediaRecipeHash, metadataVersion: 2, chapterTimescale: 1000, filename });
    const old = previous.audiobooks.find(b => {
      const source = `${staging}/${b.file}`;
      if (b.lang !== lang || !existsSync(path(source)) || digest(source) !== b.sha256) return false;
      if (b.recipeHash === recipeHash || b.recipeHash === mediaRecipeHash || b.mediaRecipeHash === mediaRecipeHash) return true;
      // Credit/title edits are container metadata, not a reason to re-encode
      // AAC. Reconstruct the old recipe from its verified embedded tags; audio,
      // cover, processing and chapter structure must still match exactly.
      const tags = probe(source).format.tags ?? {};
      const priorRecipeHash = hash({ ...mediaRecipe, title: tags.title, author: tags.artist, narrator: tags.album_artist, rights: tags.copyright });
      return b.mediaRecipeHash === priorRecipeHash || b.recipeHash === priorRecipeHash;
    });
    if (old?.recipeHash === recipeHash) {
      if (path(`${staging}/${old.file}`) !== path(m4b)) copyFileSync(path(`${staging}/${old.file}`), path(m4b));
      reusedOutputs++;
    } else if (old) {
      // Update book metadata without re-encoding retained AAC or cover artwork.
      run('ffmpeg', ['-v', 'error', '-y', '-i', path(`${staging}/${old.file}`), '-i', path(metaFile),
        '-map', '0:a', '-map', '0:v', '-map_metadata', '1', '-map_chapters', '1', '-c', 'copy', '-disposition:v', 'attached_pic',
        '-metadata:s:a:0', `language=${{ en: 'eng', de: 'deu', sl: 'slv' }[lang]}`, '-video_track_timescale', '1000', '-movie_timescale', '1000',
        '-movflags', '+faststart', '-f', 'mp4', path(m4b)]);
      remuxedOutputs++;
    } else {
      const raw = `${prefix}/${lang}/book.pcm`;
      openPcm(raw, chapters.map(c => `${prefix}/${lang}/${c.file}.pcm`));
      run('ffmpeg', ['-v', 'error', '-y', '-f', 's16le', '-ar', '44100', '-ac', '1', '-i', path(raw), '-i', path(metaFile), '-i', path(metadata.cover),
        '-map', '0:a', '-map', '2:v', '-map_metadata', '1', '-map_chapters', '1', '-c:a', 'aac', '-b:a', processing.audiobookAacBitrate,
        '-c:v', 'mjpeg', '-disposition:v', 'attached_pic', '-metadata:s:a:0', `language=${{ en: 'eng', de: 'deu', sl: 'slv' }[lang]}`,
        '-video_track_timescale', '1000', '-movie_timescale', '1000', '-movflags', '+faststart', '-f', 'mp4', path(m4b)]);
    }
    manifest.audiobooks.push({ lang, revision, title, recipeHash, mediaRecipeHash, metadataVersion: 2, duration: duration(m4b), ...artifact(m4b, `${mediaBase}/${revision}/${lang}/${filename}`) });
  }
  checkRelease(plan, { candidate: true, strict: true, audiobooks, manifest });
  write(`${staging}/manifest.json`, manifest);
  const bytes = manifest.chapters.flatMap(c => [c.track, c.cues]).concat(manifest.audiobooks).reduce((sum, a) => sum + a.bytes, 0);
  console.log(`Assembled ${manifest.chapters.length} chapter(s), ${manifest.audiobooks.length} M4B(s) (${bytes} bytes; ${reusedOutputs} unchanged encoded outputs reused; ${remuxedOutputs} metadata-only remuxes).`);
  return manifest;
}

import { openSync, closeSync, readSync, writeSync } from 'node:fs';
function openPcm(output, files) {
  const target = openSync(path(output), 'w');
  const buffer = Buffer.alloc(1024 * 1024);
  try {
    for (const file of files) {
      const source = openSync(path(file), 'r');
      try { let n; while ((n = readSync(source, buffer, 0, buffer.length, null))) writeSync(target, buffer, 0, n); }
      finally { closeSync(source); }
    }
  } finally { closeSync(target); }
  return output;
}

export function checkRelease(plan, { strict = false, candidate = false, audiobooks = true, manifest: suppliedManifest } = {}) {
  const file = candidate ? `${staging}/manifest.json` : 'audio/published.json';
  const manifest = suppliedManifest ?? read(file);
  const issues = [];
  if (manifest.schemaVersion !== 1) throw new Error('Unsupported audio manifest version');
  if (strict && (manifest.chapters.length !== plan.chapters.length || new Set(manifest.chapters.map(c => c.id)).size !== plan.chapters.length ||
      manifest.audiobooks.length !== (audiobooks ? new Set(plan.chapters.map(c => c.lang)).size : 0))) throw new Error('Manifest has missing, extra or duplicate editions');
  for (const chapter of plan.chapters) {
    const track = manifest.chapters.find(c => c.id === chapter.id);
    if (!track) { issues.push(`${chapter.id}: missing (hidden)`); continue; }
    if (track.cueSchemaVersion !== 2) issues.push(`${chapter.id}: sentence cue upgrade required (hidden)`);
    if (track.sourceHash !== chapter.sourceHash || track.scriptHash !== chapter.scriptHash) issues.push(`${chapter.id}: stale (hidden)`);
    if (track.assemblyHash !== chapter.assemblyHash) issues.push(`${chapter.id}: assembly/pause settings stale (hidden)`);
    const artifacts = [track.track, track.cues];
    for (const item of artifacts) {
      const local = candidate ? `${staging}/${item.file}` : `public/audio/${item.file}`;
      if (!/^https:\/\//.test(item.url) || candidate) {
        if (!existsSync(path(local)) || digest(local) !== item.sha256 || statSync(path(local)).size !== item.bytes) issues.push(`${chapter.id}: missing/corrupt ${item.file}`);
      }
    }
    if (candidate) {
      const audio = probe(`${staging}/${track.track.file}`);
      if (audio.streams.find(s => s.codec_type === 'audio')?.codec_name !== 'mp3') throw new Error('Chapter is not MP3');
      const cues = read(`${staging}/${track.cues.file}`);
      if (cues.revision !== track.revision || cues.chapterId !== chapter.id) throw new Error('Cue revision mismatch');
      validateCues(cues.cues, Number(audio.format.duration), chapter.blocks.map(b => b.id));
      if (cues.schemaVersion !== 2 || cues.granularity !== 'sentence') throw new Error('Sentence cues required');
      validateSentenceCues(cues.sentenceCues, Number(audio.format.duration), chapter.blocks, chapter.lang);
      if (track.assembly.length !== chapter.units.length || track.assembly.some((a, i) => a.unitId !== chapter.units[i].id || a.offset < 0 || a.duration <= 0)) throw new Error('Assembly mapping mismatch');
      let sampleOffset = 0;
      const inserted = [];
      for (const [index, unit] of track.assembly.entries()) {
        const pauses = unit.insertedPauses ?? [];
        if (!Number.isFinite(unit.sourceDuration) || unit.sourceDuration <= 0 || Math.abs(unit.offset - sampleOffset) > 1 / 44100 ||
            Math.abs(unit.duration - unit.sourceDuration - pauses.reduce((sum, p) => sum + p.seconds, 0)) > 1 / 44100) throw new Error('Assembly duration/pause offset mismatch');
        for (const pause of pauses) {
          const block = chapter.blocks.find(b => chapter.units[index].blockIds.includes(b.id) && b.pause?.textOffset === pause.textOffset);
          if (!block || !Number.isSafeInteger(pause.frames) || pause.frames !== Math.round(block.pause.seconds * 44100) ||
              pause.seconds !== pause.frames / 44100 || !Number.isSafeInteger(pause.sample) || pause.sample < 0 || pause.sourceTime !== pause.sample / 44100 || pause.sourceTime > unit.sourceDuration) throw new Error('Invalid reflection pause provenance');
          inserted.push(block.id);
        }
        sampleOffset += unit.duration;
      }
      const expectedPauses = chapter.blocks.filter(b => b.pause).map(b => b.id);
      if (inserted.length !== expectedPauses.length || new Set(inserted).size !== inserted.length || expectedPauses.some(id => !inserted.includes(id)) || Math.abs(sampleOffset - track.pcmDuration) > 1 / 44100) throw new Error('Reflection pause coverage mismatch');
    }
  }
  for (const lang of audiobooks ? [...new Set(plan.chapters.map(c => c.lang))] : []) {
    const book = manifest.audiobooks.find(b => b.lang === lang);
    if (!book) { issues.push(`${lang}: M4B missing`); continue; }
    const local = candidate ? `${staging}/${book.file}` : `public/audio/${book.file}`;
    if (candidate || !book.url.startsWith('https://')) {
      if (!existsSync(path(local)) || digest(local) !== book.sha256) { issues.push(`${lang}: M4B missing/corrupt`); continue; }
      const info = probe(local);
      const expected = manifest.chapters.filter(c => c.lang === lang);
      let offset = 0;
      if (!info.format.format_name.includes('mp4') || !info.streams.some(s => s.codec_name === 'aac' && s.tags?.language === ({ en: 'eng', de: 'deu', sl: 'slv' }[lang])) ||
          !info.streams.some(s => s.disposition?.attached_pic === 1) || info.chapters.length !== expected.length ||
          info.format.tags?.title !== book.title || info.format.tags?.album !== book.title || info.format.tags?.media_type !== '2' || !info.format.tags?.copyright || !info.format.tags?.artist) throw new Error('Invalid audiobook container/metadata/cover/chapter count');
      info.chapters.forEach((c, i) => {
        if (c.tags?.title !== expected[i].title || Math.abs(Number(c.start_time) - offset) > 0.05 || Number(c.end_time) <= Number(c.start_time)) throw new Error('Invalid audiobook chapter order/boundaries');
        offset += expected[i].pcmDuration;
        if (Math.abs(Number(c.end_time) - offset) > 0.05) throw new Error('Invalid audiobook chapter end');
      });
      if (Math.abs(Number(info.format.duration) - offset) > 0.15) throw new Error('Audiobook duration mismatch');
    }
  }
  if (issues.length) {
    console.warn(`Audio readiness:\n${issues.map(i => `  ${i}`).join('\n')}`);
    if (strict) throw new Error('Audio checks failed');
  } else console.log('Audio coverage, hashes, cues and containers valid.');
  return issues;
}

export function prepare(plan, { chapter: chapterId, language } = {}) {
  if (chapterId && language) throw new Error('Choose either --chapter or --language, not both');
  const chapters = plan.chapters.filter(c => chapterId ? c.id === chapterId : language ? c.lang === language : true);
  if (!chapters.length) throw new Error(chapterId ? `Unknown chapter ${chapterId}` : `Unknown language ${language}`);
  if (plan.config.mediaBaseUrl !== '/audio') throw new Error('Frontend preparation requires mediaBaseUrl /audio');
  const selected = { ...plan, chapters };
  const manifest = assemble(selected, { audiobooks: !chapterId });
  // Keep the complete local handoff in public/audio/ for ordinary dev serving
  // and release uploads. Git ignores media; the build filters it out of Pages.
  const artifacts = manifest.chapters.flatMap(c => [c.track, c.cues]).concat(manifest.audiobooks);
  for (const item of artifacts) {
    const target = `public/audio/${item.file}`;
    mkdirSync(path(`${target}/..`), { recursive: true });
    if (existsSync(path(target)) && digest(target) !== item.sha256) throw new Error('Refusing to overwrite an immutable revision');
    copyFileSync(path(`${staging}/${item.file}`), path(target));
  }
  // Merge chapter preparations without dropping other ready chapters. Updating
  // a chapter invalidates that language's old M4B until the language is prepared.
  const previous = existsSync(path('audio/published.json')) ? read('audio/published.json') : { chapters: [], audiobooks: [] };
  const ready = new Map(previous.chapters.map(c => [c.id, c]));
  for (const { assembly, ...chapter } of manifest.chapters) ready.set(chapter.id, chapter);
  const affectedLanguages = new Set(chapters.map(c => c.lang));
  // Public manifest deliberately excludes private requests, assets and alignment.
  const publicManifest = { schemaVersion: 1, planHash: manifest.planHash, revision: manifest.revision,
    chapters: plan.chapters.map(c => ready.get(c.id)).filter(Boolean),
    audiobooks: [...previous.audiobooks.filter(b => !affectedLanguages.has(b.lang)), ...manifest.audiobooks] };
  const release = releaseInventory(publicManifest);
  // Write the live manifest last; failed preparation never triggers pruning.
  write('audio/release.json', release);
  write('audio/published.json', release.publication);
  const removed = prunePublicAudio(path('public/audio'), release.publication);
  console.log(`Prepared ${chapters.map(c => c.id).join(', ')}. Complete local edition in public/audio/; MP3s/M4Bs are excluded from Git and production builds.`);
  console.log(`Release candidate: ${release.tag}. ${removed.length} stale public audio folder(s) removed. No upload performed.`);
  return release.publication;
}
