// Synthetic tones only: no account, credentials, voices or paid generation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { hash } from '../audio/content.mjs';
import { releaseInventory } from '../audio/release.mjs';
import { narrationKey, legacyNarrationKey } from '../audio/narration-key.mjs';

test('bitrate-only re-encoding reuses verified legacy narration without rewriting its source', { skip: spawnSync('ffmpeg', ['-version']).status !== 0 }, () => {
  const parent = join(tmpdir(), 'opencode');
  mkdirSync(parent, { recursive: true });
  const temp = mkdtempSync(join(parent, 'audio-bitrate-'));
  const write = (file, data) => {
    mkdirSync(join(temp, file, '..'), { recursive: true });
    writeFileSync(join(temp, file), Buffer.isBuffer(data) ? data : JSON.stringify(data));
  };
  const run = (bin, args) => {
    const result = spawnSync(bin, args, { cwd: temp, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  };
  run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.7', '-c:a', 'libmp3lame', 'tone.mp3']);
  write('cover.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=', 'base64'));
  const config = JSON.parse(readFileSync('audio/config.json', 'utf8'));
  config.voiceHashes.en = hash('mock-voice');
  config.metadata = { author: 'Fixture', narrator: 'Fixture', rights: 'Test only', cover: 'cover.png' };
  write('src/data/works.json', { en: { title: 'Test' } });
  const unit = { id: 'en/01/b/0', lang: 'en', text: 'Test.', blockIds: ['b'], cacheKey: narrationKey(config, 'Test.', 'en') };
  const legacyUnit = { ...unit, cacheKey: legacyNarrationKey(config, 'Test.', 'en') };
  const key = hash({ cacheKey: legacyUnit.cacheKey, voice: 'mock-voice' });
  const source = readFileSync(join(temp, 'tone.mp3'));
  const record = { unit: legacyUnit, config: structuredClone(config), request: { language_code: 'en', inputs: [{ text: 'Test.', voice_id: 'mock-voice' }] }, sourceAudioHash: hash(source),
    timings: { alignment: { characters: [...'Test.'], character_start_times_seconds: [0, .1, .2, .3, .4], character_end_times_seconds: [.1, .2, .3, .4, .5] } } };
  write(`.cache/audio/units/${key}/source.mp3`, source);
  write(`.cache/audio/units/${key}/result.json`, record);
  const chapter = { id: 'en/01', lang: 'en', file: '01', title: 'Test', sourceHash: hash('source'), scriptHash: hash('script'),
    blocks: [{ id: 'b', text: 'Test.', spoken: 'Test.', submitted: 'Test.' }], units: [unit] };
  const plan = { planHash: hash('first'), config, chapters: [chapter] };
  const script = `import {assemble} from ${JSON.stringify(new URL('../audio/media.mjs', import.meta.url).href)};import{readFileSync}from'node:fs';globalThis.fetch=()=>{throw Error('No network allowed')};assemble(JSON.parse(readFileSync('plan.json','utf8')));`;
  write('plan.json', plan);
  run(process.execPath, ['--input-type=module', '-e', script]);
  const first = JSON.parse(readFileSync(join(temp, '.cache/audio/release/manifest.json'), 'utf8'));
  plan.config.processing.chapterMp3Bitrate = '64k';
  plan.config.processing.audiobookAacBitrate = '48k';
  plan.planHash = hash('second');
  write('plan.json', plan);
  run(process.execPath, ['--input-type=module', '-e', script]);
  const second = JSON.parse(readFileSync(join(temp, '.cache/audio/release/manifest.json'), 'utf8'));
  assert.notEqual(second.chapters[0].recipeHash, first.chapters[0].recipeHash);
  assert.notEqual(second.audiobooks[0].mediaRecipeHash, first.audiobooks[0].mediaRecipeHash);
  assert.equal(second.chapters[0].assembly[0].audioHash, hash(source));
  assert.deepEqual(readFileSync(join(temp, `.cache/audio/units/${key}/source.mp3`)), source);
  assert.deepEqual(JSON.parse(readFileSync(join(temp, `.cache/audio/units/${key}/result.json`), 'utf8')), record);
});

const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
test('synthetic 21-track assembly, three M4Bs and partial edit repackage without TTS', { skip: !ffmpeg }, () => {
  const tempRoot = join(tmpdir(), 'opencode');
  mkdirSync(tempRoot, { recursive: true });
  const temp = mkdtempSync(join(tempRoot, 'audio-test-'));
  const write = (file, value) => { mkdirSync(join(temp, file, '..'), { recursive: true }); writeFileSync(join(temp, file), typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)); };
  const run = (bin, args) => {
    const result = spawnSync(bin, args, { cwd: temp, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    return result.stdout;
  };
  run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.7', '-c:a', 'libmp3lame', '-b:a', '128k', 'tone.mp3']);
  // Existing single-pixel PNG fixture, not a mascot/image generation workflow.
  write('cover.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=', 'base64'));
  const config = JSON.parse(readFileSync('audio/config.json', 'utf8'));
  config.metadata = { author: 'Fixture organization', narrator: 'Synthetic test tone', rights: 'Test only; not narration', cover: 'cover.png' };
  const chapters = [];
  const files = ['01', '02', '03', '04', '05', '06', 'glossary'];
  const works = {};
  for (const lang of ['en', 'de', 'sl']) {
    works[lang] = { title: `Test ${lang}` };
    for (const [index, file] of files.entries()) {
      const id = `${lang}/${file}`;
      const unit = { id: `${id}/b-test/0`, text: 'Test.', blockIds: ['b-test'], cacheKey: hash(id), continuityDependencies: [] };
      const key = hash(`${id}:voice`);
      const audioHash = hash(readFileSync(join(temp, 'tone.mp3')));
      write(`.cache/audio/units/${key}/result.json`, { unit, sourceAudioHash: audioHash, timings: { alignment: {
        characters: [...'Test.'], character_start_times_seconds: [0, .1, .2, .3, .4], character_end_times_seconds: [.1, .2, .3, .4, .5],
      } } });
      copyFileSync(join(temp, 'tone.mp3'), join(temp, `.cache/audio/units/${key}/source.mp3`));
      chapters.push({ id, lang, file, title: `${index + 1}. ${lang} chapter`, pageUrl: `/book/${lang}/${file}.html`, sourceHash: hash(id), scriptHash: hash(unit.text), blocks: [{ id: 'b-test', text: 'Test.', spoken: 'Test.', submitted: 'Test.', adaptation: false }], units: [unit] });
    }
  }
  const plan = { schemaVersion: 1, planHash: hash('first'), config, chapters };
  write('fixture-plan.json', plan);
  write('src/data/works.json', works);
  const mediaUrl = new URL('../audio/media.mjs', import.meta.url).href;
  const execute = `import {assemble} from ${JSON.stringify(mediaUrl)};import{readFileSync}from'node:fs';assemble(JSON.parse(readFileSync('fixture-plan.json','utf8')));`;
  run(process.execPath, ['--input-type=module', '-e', execute]);
  const first = JSON.parse(readFileSync(join(temp, '.cache/audio/release/manifest.json'), 'utf8'));
  assert.equal(first.chapters.length, 21);
  assert.equal(first.audiobooks.length, 3);
  assert.equal(first.chapters[0].assembly[0].offset, 0);
  for (const book of first.audiobooks) {
    const info = JSON.parse(run('ffprobe', ['-v', 'error', '-show_format', '-of', 'json', `.cache/audio/release/${book.file}`]));
    assert.equal(info.format.tags.title, book.title);
    assert.equal(info.format.tags.album, book.title, 'Apple Books needs the book/album title, not just the track title');
    assert.equal(info.format.tags.media_type, '2');
    assert.equal(book.metadataVersion, 2);
    assert.ok(book.file.endsWith(`/test-${book.lang}-${book.lang}.m4b`), 'Filename is descriptive and language-specific');
  }
  // Migrate legacy book.m4b files without an album atom. Metadata-only fixes
  // must copy AAC packets, not run the lossy encoder again.
  const legacy = structuredClone(first);
  for (const book of legacy.audiobooks) {
    const original = `.cache/audio/release/${book.file}`;
    book.file = `${first.revision}/${book.lang}/book.m4b`;
    run('ffmpeg', ['-v', 'error', '-y', '-i', original, '-map', '0:a', '-map', '0:v', '-map_chapters', '0', '-c', 'copy', '-metadata', 'album=', '-f', 'mp4', `.cache/audio/release/${book.file}`]);
    book.sha256 = hash(readFileSync(join(temp, `.cache/audio/release/${book.file}`)));
    book.recipeHash = book.mediaRecipeHash;
    delete book.mediaRecipeHash;
    delete book.metadataVersion;
  }
  write('.cache/audio/release/manifest.json', legacy);
  assert.match(run(process.execPath, ['--input-type=module', '-e', execute]), /21 unchanged encoded outputs reused; 3 metadata-only remuxes/);
  const migrated = JSON.parse(readFileSync(join(temp, '.cache/audio/release/manifest.json'), 'utf8'));
  const packetHash = file => run('ffmpeg', ['-v', 'error', '-i', `.cache/audio/release/${file}`, '-map', '0:a:0', '-c', 'copy', '-f', 'hash', '-hash', 'sha256', '-']);
  for (const book of migrated.audiobooks) {
    assert.equal(packetHash(book.file), packetHash(legacy.audiobooks.find(b => b.lang === book.lang).file), 'AAC packets preserved');
    const chapters = JSON.parse(run('ffprobe', ['-v', 'error', '-show_chapters', '-of', 'json', `.cache/audio/release/${book.file}`])).chapters;
    assert.ok(chapters.every(c => c.time_base === '1/1000'), 'Bound chapter timescale to prevent duration overflow in long remuxed chapters');
  }
  config.metadata.author = 'Fixture organization & Partner';
  config.metadata.rights = 'Canonical test credit; not narration';
  plan.planHash = hash('canonical-credit');
  write('fixture-plan.json', plan);
  assert.match(run(process.execPath, ['--input-type=module', '-e', execute]), /21 unchanged encoded outputs reused; 3 metadata-only remuxes/);
  const credited = JSON.parse(readFileSync(join(temp, '.cache/audio/release/manifest.json'), 'utf8'));
  for (const book of credited.audiobooks) {
    const info = JSON.parse(run('ffprobe', ['-v', 'error', '-show_format', '-of', 'json', `.cache/audio/release/${book.file}`]));
    assert.equal(info.format.tags.artist, config.metadata.author);
    assert.equal(info.format.tags.copyright, config.metadata.rights);
    assert.equal(packetHash(book.file), packetHash(migrated.audiobooks.find(b => b.lang === book.lang).file), 'Credit changes preserve AAC packets');
  }
  const prepare = options => `import {prepare} from ${JSON.stringify(mediaUrl)};import{readFileSync}from'node:fs';prepare(JSON.parse(readFileSync('fixture-plan.json','utf8')),${JSON.stringify(options)});`;
  // A chapter is a finalized frontend artifact, not a private preview. It needs
  // no audiobook metadata, and preparing another chapter preserves it.
  write('fixture-plan.json', { ...plan, config: { ...config, metadata: {} } });
  run(process.execPath, ['--input-type=module', '-e', prepare({ chapter: 'en/01' })]);
  let ready = JSON.parse(readFileSync(join(temp, 'audio/published.json'), 'utf8'));
  assert.deepEqual(ready.chapters.map(c => c.id), ['en/01']);
  assert.deepEqual(ready.audiobooks, []);
  run(process.execPath, ['--input-type=module', '-e', prepare({ chapter: 'de/01' })]);
  ready = JSON.parse(readFileSync(join(temp, 'audio/published.json'), 'utf8'));
  assert.deepEqual(ready.chapters.map(c => c.id), ['en/01', 'de/01']);
  write('fixture-plan.json', plan);
  run(process.execPath, ['--input-type=module', '-e', prepare({ language: 'en' })]);
  ready = JSON.parse(readFileSync(join(temp, 'audio/published.json'), 'utf8'));
  assert.equal(ready.chapters.length, 8);
  assert.deepEqual(ready.audiobooks.map(b => b.lang), ['en']);
  // Chapter-only updates invalidate that language's full-book download.
  run(process.execPath, ['--input-type=module', '-e', prepare({ chapter: 'en/01' })]);
  ready = JSON.parse(readFileSync(join(temp, 'audio/published.json'), 'utf8'));
  assert.equal(ready.chapters.length, 8);
  assert.deepEqual(ready.audiobooks, []);
  run(process.execPath, ['--input-type=module', '-e', prepare({})]);
  const published = JSON.parse(readFileSync(join(temp, 'audio/published.json'), 'utf8'));
  assert.equal(published.chapters.length, 21);
  assert.equal(published.audiobooks.length, 3);
  const publicationFile = readFileSync(join(temp, 'audio/published.json'));
  const releaseFile = readFileSync(join(temp, 'audio/release.json'));
  const assemblyFile = readFileSync(join(temp, '.cache/audio/release/manifest.json'));
  // Missing metadata invalidates preserved books rather than blocking a
  // chapter-only workflow; supplied-but-broken artwork must still fail.
  for (const metadata of [undefined, {}, { ...config.metadata, narrator: { en: config.metadata.narrator } }]) {
    write('audio/published.json', publicationFile);
    write('fixture-plan.json', { ...plan, config: { ...config, metadata } });
    run(process.execPath, ['--input-type=module', '-e', prepare({ chapter: 'en/01' })]);
    const partial = JSON.parse(readFileSync(join(temp, 'audio/published.json'), 'utf8'));
    assert.equal(partial.chapters.length, 21);
    assert.deepEqual(partial.audiobooks, []);
  }
  write('audio/published.json', publicationFile);
  write('audio/release.json', releaseFile);
  write('fixture-plan.json', { ...plan, config: { ...config, metadata: { ...config.metadata, cover: 'missing.png' } } });
  const invalidCover = spawnSync(process.execPath, ['--input-type=module', '-e', prepare({ chapter: 'en/01' })], { cwd: temp, encoding: 'utf8' });
  assert.notEqual(invalidCover.status, 0);
  assert.match(invalidCover.stderr, /missing\.png/);
  assert.deepEqual(readFileSync(join(temp, 'audio/published.json')), publicationFile);
  assert.deepEqual(readFileSync(join(temp, 'audio/release.json')), releaseFile);
  write('fixture-plan.json', plan);
  write('.cache/audio/release/manifest.json', assemblyFile);
  assert.ok(published.chapters.every(chapter => !('assembly' in chapter)));
  assert.equal(hash(readFileSync(join(temp, `public/audio/${published.chapters[0].track.file}`))), published.chapters[0].track.sha256, 'Complete local handoff in public/audio');
  assert.equal(hash(readFileSync(join(temp, `public/audio/${published.chapters[0].cues.file}`))), published.chapters[0].cues.sha256);
  const release = JSON.parse(releaseFile);
  assert.equal(published.chapters[0].track.url,
    `https://github.com/wirmachenwien/city-changers/releases/download/${release.tag}/${published.chapters[0].track.file.replaceAll('/', '--')}`);
  for (const edition of [{ name: 'legacy-fixture', title: 'Legacy fixture' }, { date: '2026-11-14', revision: 0 }, { date: '2026-11-14', revision: 1 }]) {
    const inventory = releaseInventory(published, edition);
    assert.equal(inventory.publication.chapters[0].track.url,
      `https://github.com/wirmachenwien/city-changers/releases/download/${inventory.tag}/${published.chapters[0].track.file.replaceAll('/', '--')}`);
    if (edition.date) assert.match(inventory.tag, /^audio-2026-11-14[a-z]*$/);
  }
  assert.equal(JSON.parse(readFileSync(join(temp, 'audio/release.json'), 'utf8')).assets.length, 45);
  assert.equal(published.chapters.some(c => 'transcript' in c), false);
  assert.equal(readdirSync(join(temp, '.cache/audio/release'), { recursive: true }).some(file => file.endsWith('.transcript.html')), false, 'Assembly never generates transcript HTML');
  const sourceFile = `.cache/audio/units/${hash('en/01:voice')}/source.mp3`;
  const originalSource = readFileSync(join(temp, sourceFile));
  write(sourceFile, Buffer.from('corrupt fixture'));
  const incomplete = spawnSync(process.execPath, ['--input-type=module', '-e', prepare({ chapter: 'en/01' })], { cwd: temp, encoding: 'utf8' });
  assert.notEqual(incomplete.status, 0);
  assert.match(incomplete.stderr, /Need exactly one retained asset/);
  assert.deepEqual(JSON.parse(readFileSync(join(temp, 'audio/published.json'), 'utf8')), published);
  write(sourceFile, originalSource);
  const retainedHashes = first.chapters.map(c => c.assembly[0].audioHash);
  // Change just the first paragraph: longer tone, new unit key, same block ID.
  const changed = plan.chapters[0].units[0];
  changed.text = 'Edited.'; changed.cacheKey = hash('edited paragraph');
  plan.chapters[0].blocks[0].submitted = 'Edited.';
  plan.planHash = hash('second');
  const key = hash('edited asset');
  run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=550:duration=1.2', '-c:a', 'libmp3lame', '-b:a', '128k', 'changed.mp3']);
  const changedHash = hash(readFileSync(join(temp, 'changed.mp3')));
  write(`.cache/audio/units/${key}/result.json`, { unit: changed, sourceAudioHash: changedHash, timings: { alignment: {
    characters: [...'Edited.'], character_start_times_seconds: [0, .1, .2, .3, .4, .5, .6], character_end_times_seconds: [.1, .2, .3, .4, .5, .6, .7],
  } } });
  copyFileSync(join(temp, 'changed.mp3'), join(temp, `.cache/audio/units/${key}/source.mp3`));
  write('fixture-plan.json', plan);
  const rebuilt = run(process.execPath, ['--input-type=module', '-e', execute]);
  assert.match(rebuilt, /22 unchanged encoded outputs reused/);
  const second = JSON.parse(readFileSync(join(temp, '.cache/audio/release/manifest.json'), 'utf8'));
  assert.notEqual(second.chapters[0].assembly[0].audioHash, retainedHashes[0]);
  assert.deepEqual(second.chapters.slice(1).map(c => c.assembly[0].audioHash), retainedHashes.slice(1));
  assert.ok(second.audiobooks[0].duration > first.audiobooks[0].duration + .4);
  const bookInfo = JSON.parse(run('ffprobe', ['-v', 'error', '-show_chapters', '-of', 'json', `.cache/audio/release/${second.audiobooks[0].file}`]));
  assert.ok(Number(bookInfo.chapters[1].start_time) > first.chapters[0].pcmDuration + .4);
  assert.equal(second.chapters[0].blockIds[0], first.chapters[0].blockIds[0]);
  assert.deepEqual(second.audiobooks.slice(1).map(b => b.sha256), credited.audiobooks.slice(1).map(b => b.sha256));
  // Add a thinking pause using the very same retained source clip. The fake
  // character alignment stands in for API output; no narration is requested.
  const quizText = 'Pause to think. Answer: Yes.';
  const quizUnit = { ...changed, text: quizText, cacheKey: hash('quiz-fixture') };
  const quizKey = hash('quiz-retained-asset');
  plan.chapters[0].units = [quizUnit];
  plan.chapters[0].blocks = [{ id: 'b-test', text: quizText, spoken: quizText, submitted: quizText, adaptation: true,
    pause: { seconds: 3, after: 'Pause to think.', textOffset: 'Pause to think.'.length } }];
  plan.chapters[0].scriptHash = hash(quizText);
  plan.chapters[0].assemblyHash = hash('pause-3');
  plan.planHash = hash('reflection-3');
  write(`.cache/audio/units/${quizKey}/result.json`, { unit: quizUnit, sourceAudioHash: changedHash, timings: { alignment: {
    characters: [...quizText], character_start_times_seconds: [...quizText].map((_, i) => i * .03), character_end_times_seconds: [...quizText].map((_, i) => (i + 1) * .03),
  } } });
  copyFileSync(join(temp, 'changed.mp3'), join(temp, `.cache/audio/units/${quizKey}/source.mp3`));
  write('fixture-plan.json', plan);
  run(process.execPath, ['--input-type=module', '-e', execute]);
  const paused = JSON.parse(readFileSync(join(temp, '.cache/audio/release/manifest.json'), 'utf8'));
  const insertion = paused.chapters[0].assembly[0].insertedPauses[0];
  assert.equal(insertion.frames, 3 * 44100);
  assert.ok(Math.abs(paused.chapters[0].pcmDuration - second.chapters[0].pcmDuration - 3) < .001);
  const cueMap = JSON.parse(readFileSync(join(temp, `.cache/audio/release/${paused.chapters[0].cues.file}`), 'utf8'));
  assert.ok(cueMap.sentenceCues[1].start - cueMap.sentenceCues[0].end >= 3);
  const pcm = readFileSync(join(temp, `.cache/audio/release/${paused.revision}/en/01.pcm`));
  assert.deepEqual(pcm.subarray(insertion.sample * 2, (insertion.sample + insertion.frames) * 2), Buffer.alloc(insertion.frames * 2));
  // Changing only pause duration rebuilds timing/container boundaries, not TTS.
  plan.chapters[0].blocks[0].pause.seconds = 4;
  plan.config.assembly.reflectionPauseSeconds = 4;
  plan.chapters[0].assemblyHash = hash('pause-4');
  plan.planHash = hash('reflection-4');
  write('fixture-plan.json', plan);
  assert.match(run(process.execPath, ['--input-type=module', '-e', execute]), /22 unchanged encoded outputs reused/);
  const longer = JSON.parse(readFileSync(join(temp, '.cache/audio/release/manifest.json'), 'utf8'));
  assert.ok(Math.abs(longer.chapters[0].pcmDuration - paused.chapters[0].pcmDuration - 1) < .001);
  assert.ok(Math.abs(longer.audiobooks[0].duration - paused.audiobooks[0].duration - 1) < .05);
  assert.equal(longer.chapters[0].assembly[0].audioHash, changedHash);
  assert.equal(hash(readFileSync(join(temp, `.cache/audio/units/${quizKey}/source.mp3`))), changedHash);
  // A global plan hash must never bless preserved books with obsolete credits.
  run(process.execPath, ['--input-type=module', '-e', prepare({})]);
  const beforeMetadata = JSON.parse(readFileSync(join(temp, 'audio/published.json'), 'utf8'));
  config.metadata.rights = 'Updated shared rights';
  plan.planHash = hash('updated-rights');
  write('fixture-plan.json', plan);
  run(process.execPath, ['--input-type=module', '-e', prepare({ language: 'en' })]);
  const afterMetadata = JSON.parse(readFileSync(join(temp, 'audio/published.json'), 'utf8'));
  assert.deepEqual(afterMetadata.audiobooks.map(b => b.lang), ['en'], 'Partial preparation invalidates other-language stale metadata');
  assert.equal(afterMetadata.chapters.length, 21, 'Unaffected chapter audio remains available');
  assert.notEqual(afterMetadata.audiobooks[0].metadataHash, beforeMetadata.audiobooks[0].metadataHash);
  write('old-publication.json', { ...beforeMetadata, planHash: plan.planHash });
  run(process.execPath, ['--input-type=module', '-e', `
    import {checkRelease} from ${JSON.stringify(mediaUrl)};
    import {readFileSync} from 'node:fs';
    import assert from 'node:assert/strict';
    const issues=checkRelease(JSON.parse(readFileSync('fixture-plan.json')), {manifest:JSON.parse(readFileSync('old-publication.json'))});
    assert.ok(issues.includes('de: M4B metadata stale'));
    assert.ok(issues.includes('sl: M4B metadata stale'));
  `]);
  // Titles/cover contents are not in planHash, but must change output paths.
  const oldPlanHash = plan.planHash;
  works.en.title = 'Changed audiobook title';
  write('src/data/works.json', works);
  run(process.execPath, ['--input-type=module', '-e', prepare({ language: 'en' })]);
  const retitled = JSON.parse(readFileSync(join(temp, 'audio/published.json'), 'utf8'));
  assert.notEqual(retitled.revision, afterMetadata.revision);
  assert.equal(retitled.audiobooks[0].title, works.en.title);
  const cover = readFileSync(join(temp, 'cover.png'));
  write('cover.png', Buffer.concat([cover, Buffer.from('cover content identity fixture')]));
  run(process.execPath, ['--input-type=module', '-e', prepare({ language: 'en' })]);
  const recovered = JSON.parse(readFileSync(join(temp, 'audio/published.json'), 'utf8'));
  assert.notEqual(recovered.revision, retitled.revision, 'Cover changes in place get a new immutable revision');
  assert.notEqual(recovered.audiobooks[0].metadataHash, retitled.audiobooks[0].metadataHash);
  assert.equal(recovered.planHash, oldPlanHash);
  // A new global hash cannot bless unprepared languages encoded with old settings.
  config.processing.chapterMp3Bitrate = '64k';
  config.processing.audiobookAacBitrate = '48k';
  plan.planHash = hash('new-encoder-settings');
  write('fixture-plan.json', plan);
  run(process.execPath, ['--input-type=module', '-e', prepare({ language: 'en' })]);
  const reencoded = JSON.parse(readFileSync(join(temp, 'audio/published.json'), 'utf8'));
  assert.deepEqual(reencoded.chapters.map(c => c.lang), Array(7).fill('en'));
  assert.deepEqual(reencoded.audiobooks.map(b => b.lang), ['en']);
  assert.equal(existsSync(join(temp, '.cache/audio/generation.lock')), false);
  write('old-publication.json', { ...recovered, planHash: plan.planHash });
  run(process.execPath, ['--input-type=module', '-e', `
    import{checkRelease}from${JSON.stringify(mediaUrl)};import{readFileSync}from'node:fs';import assert from'node:assert/strict';
    const issues=checkRelease(JSON.parse(readFileSync('fixture-plan.json')),{manifest:JSON.parse(readFileSync('old-publication.json'))});
    assert.ok(issues.includes('de/01: encoder settings stale (hidden)'));
    assert.ok(issues.includes('en: M4B encoder settings stale'));
  `]);
});
