import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { hash } from '../audio/content.mjs';
import { releaseInventory, validateReleaseInventory } from '../audio/release.mjs';
import { prunePublicAudio } from '../audio/prune.mjs';
import audioSite, { copySitePublic } from '../lib/audio-site.mjs';
import { navigationOptionLinks } from '../lib/site-links.mjs';

const revision = 'a'.repeat(20);
const artifact = extension => ({ file: `${revision}/en/01.${extension}`, bytes: 10, sha256: hash(extension), url: `/audio/${revision}/en/01.${extension}` });
const publication = () => ({ schemaVersion: 1, revision, planHash: hash('plan'),
  chapters: [{ id: 'en/01', revision, track: artifact('mp3'), cues: artifact('cues.json') }], audiobooks: [] });
const temporary = () => { const root = join(tmpdir(), 'opencode'); mkdirSync(root, { recursive: true }); return mkdtempSync(join(root, 'audio-release-')); };
const write = (root, file, content) => { const target = join(root, file); mkdirSync(join(target, '..'), { recursive: true }); writeFileSync(target, content); };

test('site checker validates navigation options, not audio playback speed values', () => {
  assert.deepEqual(navigationOptionLinks('<div data-select-list><select data-select><option value="/book.html">Book</option></select></div><select data-select data-speed><option value="1.5">1.5×</option></select>'), ['/book.html']);
});

test('audio release fingerprints are deterministic, portable and include complete outputs', () => {
  const input = publication();
  const original = structuredClone(input);
  const release = releaseInventory(input);
  assert.deepEqual(input, original);
  assert.deepEqual(validateReleaseInventory(release), release);
  assert.deepEqual(releaseInventory(release.publication), release, 'Remote URLs do not change identity');
  assert.equal(release.assets.length, 2);
  assert.equal(release.publication.chapters[0].cues.url, input.chapters[0].cues.url);
  assert.equal('transcript' in release.publication.chapters[0], false);
  assert.match(release.publication.chapters[0].track.url, /\/releases\/download\/audio-[a-f0-9]{64}\//);
  assert.ok(release.assets.every(a => a.download.includes(a.releaseAsset) && !a.releaseAsset.includes('/')));
  input.chapters[0].cues.sha256 = hash('corrected cues');
  assert.notEqual(releaseInventory(input).tag, release.tag);
  const corrupt = structuredClone(release);
  corrupt.assets[0].sha256 = hash('corrupt');
  assert.throws(() => validateReleaseInventory(corrupt), /inconsistent/);
  input.chapters[0].track.file = '../../private/source.mp3';
  assert.throws(() => releaseInventory(input), /Invalid public audio artifact/);
});

test('partial preparations remove legacy transcript references from publication and release inventories', () => {
  const input = publication();
  input.chapters[0].transcript = artifact('transcript.html');
  const release = releaseInventory(input);
  assert.equal('transcript' in release.publication.chapters[0], false);
  assert.equal(release.assets.length, 2);
  assert.equal(release.assets.some(a => a.file.endsWith('.html')), false);
});

test('pruning retains every referenced revision and unknown user files, removing only managed stale folders', () => {
  const root = temporary(), directory = join(root, 'public/audio'), staging = join(root, '.cache/audio/release');
  const live = publication(), old = 'b'.repeat(20), other = 'c'.repeat(20), symlink = 'd'.repeat(20);
  write(directory, `${old}/en/01.mp3`, 'old');
  write(directory, `${other}/en/notes.txt`, 'user notes');
  write(directory, `${revision}/en/01.cues.json`, 'live cues');
  write(directory, `${revision}/en/01.transcript.html`, 'obsolete live transcript');
  write(directory, `${old}/en/01.transcript.html`, 'obsolete old transcript');
  write(directory, 'notes.txt', 'user notes');
  mkdirSync(join(directory, symlink));
  symlinkSync(join(directory, other, 'en'), join(directory, symlink, 'en'));
  const data = Buffer.from('retained media');
  live.chapters[0].track = { ...live.chapters[0].track, bytes: data.length, sha256: hash(data) };
  write(directory, live.chapters[0].track.file, data);
  write(staging, live.chapters[0].track.file, data);
  assert.deepEqual(prunePublicAudio(directory, live, staging), [old]);
  assert.equal(existsSync(join(directory, old)), false);
  assert.equal(existsSync(join(directory, `${revision}/en/01.transcript.html`)), false, 'Remove obsolete HTML from retained revisions too');
  assert.equal(existsSync(join(directory, live.chapters[0].track.file)), true, 'Current local media stays available');
  assert.deepEqual(readFileSync(join(staging, live.chapters[0].track.file)), data);
  for (const file of [`${revision}/en/01.cues.json`, `${other}/en/notes.txt`, `${symlink}/en/notes.txt`, 'notes.txt']) assert.equal(existsSync(join(directory, file)), true);
  // A partial preparation can reference several revision directories.
  live.chapters.push({ ...live.chapters[0], id: 'en/02', track: { ...artifact('mp3'), file: `${old}/en/02.mp3` } });
  write(directory, `${old}/en/02.cues.json`, 'keep');
  assert.deepEqual(prunePublicAudio(directory, live, staging), []);
  assert.equal(existsSync(join(directory, old)), true);
});

test('production public mirror excludes all audio media without changing local dev files', () => {
  const root = temporary(), source = join(root, 'public'), target = join(root, 'site-public');
  for (const file of [`audio/${revision}/en/01.mp3`, `audio/${revision}/en/book.m4b`, 'audio/unmanaged.MP3', `audio/${revision}/en/01.transcript.html`]) write(source, file, 'omit');
  for (const file of [`audio/${revision}/en/01.cues.json`, 'brand-assets/catalog.json', 'robots.txt', 'elsewhere/example.mp3']) write(source, file, 'keep');
  copySitePublic(source, target);
  for (const file of [`audio/${revision}/en/01.mp3`, `audio/${revision}/en/book.m4b`, 'audio/unmanaged.MP3']) {
    assert.equal(existsSync(join(source, file)), true, 'Never remove local media');
    assert.equal(existsSync(join(target, file)), false, 'Never include audio media in production');
  }
  assert.equal(existsSync(join(target, `audio/${revision}/en/01.transcript.html`)), false);
  for (const file of [`audio/${revision}/en/01.cues.json`, 'brand-assets/catalog.json', 'robots.txt', 'elsewhere/example.mp3']) assert.equal(existsSync(join(target, file)), true);
  const integration = audioSite();
  integration.hooks['astro:config:setup']({ command: 'dev', updateConfig: () => assert.fail('Dev public directory must remain unchanged') });
  const codegen = join(root, 'codegen');
  mkdirSync(codegen);
  let buildPublic;
  integration.hooks['astro:config:setup']({ command: 'build', config: { publicDir: pathToFileURL(source) },
    createCodegenDir: () => pathToFileURL(codegen), updateConfig: config => { buildPublic = fileURLToPath(config.publicDir); } });
  assert.equal(existsSync(join(buildPublic, `audio/${revision}/en/01.mp3`)), false);
  assert.equal(existsSync(join(buildPublic, 'robots.txt')), true);
  integration.hooks['astro:build:done']();
  assert.equal(existsSync(buildPublic), false, 'Only the disposable build mirror is removed');
  assert.equal(existsSync(join(source, `audio/${revision}/en/01.mp3`)), true);
});
