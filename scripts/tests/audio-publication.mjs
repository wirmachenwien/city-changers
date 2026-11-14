import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAudioPublication } from '../../src/lib/audio-publication.mjs';
import { hash } from '../audio/content.mjs';

function fixture(dev = true) {
  const directory = join(tmpdir(), 'opencode');
  mkdirSync(directory, { recursive: true });
  const root = mkdtempSync(join(directory, 'audio-publication-'));
  const path = file => join(root, file);
  const write = (file, value) => {
    mkdirSync(join(path(file), '..'), { recursive: true });
    writeFileSync(path(file), typeof value === 'string' ? value : JSON.stringify(value));
  };
  const revision = 'a'.repeat(20);
  const artifact = name => {
    const file = `${revision}/en/${name}`;
    write(`public/audio/${file}`, 'fixture');
    return { file, url: `/audio/${file}`, bytes: 7, sha256: hash('fixture') };
  };
  const chapter = { id: 'en/01', lang: 'en', revision, cueSchemaVersion: 2, sourceHash: 'source', scriptHash: 'script', assemblyHash: 'assembly', duration: 20,
    track: artifact('01.mp3'), cues: artifact('01.cues.json') };
  const book = { lang: 'en', revision, metadataHash: 'metadata', ...artifact('book.m4b') };
  if (!dev) {
    chapter.track.url = `https://example.com/releases/${chapter.track.file}`;
    book.url = `https://example.com/releases/${book.file}`;
  }
  const manifest = { chapters: [chapter], audiobooks: [book] };
  const plan = { chapters: [{ ...chapter }] };
  write('audio/config.json', { metadata: { cover: 'cover.png' } });
  write('cover.png', 'cover');
  write('audio/published.json', manifest);
  let plans = 0;
  const loader = createAudioPublication({ dev, resolvePath: path, loadPlan: () => { plans++; return structuredClone(plan); }, metadataHash: () => 'metadata' });
  return { ...loader, path, write, manifest, plan, chapter, book, plans: () => plans };
}

test('development reuses validated publication and script plan until relevant inputs change', () => {
  const f = fixture();
  let previous = f.audioPublication();
  assert.equal(previous.audiobooks.length, 1);
  assert.equal(f.audioPublication(), previous);
  f.audioScriptChapter('en/01');
  assert.equal(f.plans(), 1);
  for (const file of ['src/content/book/en/01.mdx', 'src/data/works.json', 'src/data/glossary.json',
    'audio/blocks.json', 'audio/overrides.json', 'audio/sentence-timing-corrections.json', 'cover.png',
    '.cache/audio/units/test/source.mp3', '.cache/audio/units/test/result.json']) {
    f.write(file, 'changed');
    const next = f.audioPublication();
    assert.notEqual(next, previous, file);
    assert.equal(f.audioPublication(), next, file);
    previous = next;
  }
  f.write('audio/config.json', { metadata: { cover: 'other-cover.png' } });
  f.audioPublication();
  const beforeCover = f.plans();
  f.write('other-cover.png', 'new cover');
  f.audioScriptChapter('en/01');
  assert.equal(f.plans(), beforeCover + 1);
});

test('development invalidates on same-size media corruption, deletion and manifest changes', () => {
  const f = fixture();
  assert.equal(f.audioPublication().audiobooks.length, 1);
  f.write(`public/audio/${f.chapter.track.file}`, 'corrupt');
  assert.equal(f.audioPublication().chapters.length, 0);
  assert.equal(f.audioPublication().audiobooks.length, 0);
  f.write(`public/audio/${f.chapter.track.file}`, 'fixture');
  assert.equal(f.audioPublication().audiobooks.length, 1);
  unlinkSync(f.path(`public/audio/${f.chapter.cues.file}`));
  assert.equal(f.audioPublication().audiobooks.length, 0);
  f.write(`public/audio/${f.chapter.cues.file}`, 'fixture');
  f.manifest.audiobooks[0].metadataHash = 'old metadata';
  f.write('audio/published.json', f.manifest);
  assert.equal(f.audioPublication().chapters.length, 1);
  assert.equal(f.audioPublication().audiobooks.length, 0);
});

test('missing or stale chapters hide audiobook downloads using the same readiness as the frontpage', () => {
  for (const change of ['missing', 'sourceHash', 'scriptHash', 'assemblyHash']) {
    const f = fixture();
    if (change === 'missing') f.manifest.chapters = [];
    else f.manifest.chapters[0][change] = 'old';
    f.write('audio/published.json', f.manifest);
    assert.equal(f.audioPublication().audiobooks.length, 0, change);
  }
});

test('production requires HTTPS media while development permits verified local media', () => {
  for (const url of ['/audio/local.mp3', 'http://example.com/audio.mp3', '//example.com/audio.mp3']) {
    const track = fixture(false);
    track.chapter.track.url = url;
    track.write('audio/published.json', track.manifest);
    assert.equal(track.audioPublication().chapters.length, 0, url);
    assert.equal(track.audioPublication().audiobooks.length, 0, url);
    const book = fixture(false);
    book.book.url = url;
    book.write('audio/published.json', book.manifest);
    assert.equal(book.audioPublication().chapters.length, 1, url);
    assert.equal(book.audioPublication().audiobooks.length, 0, url);
  }
  for (const dev of [true, false]) {
    const f = fixture(dev);
    const publication = f.audioPublication();
    assert.equal(publication.chapters.length, 1);
    assert.equal(publication.audiobooks.length, 1);
    assert.equal(publication.chapters[0].track.url.startsWith('https://'), !dev);
    assert.equal(publication.audiobooks[0].url.startsWith('https://'), !dev);
  }
});

test('production still validates local cues for HTTPS-hosted media', () => {
  for (const change of ['missing', 'corrupt']) {
    const f = fixture(false);
    const file = `public/audio/${f.chapter.cues.file}`;
    if (change === 'missing') unlinkSync(f.path(file));
    else f.write(file, 'corrupt');
    assert.equal(f.audioPublication().chapters.length, 0, change);
    assert.equal(f.audioPublication().audiobooks.length, 0, change);
  }
});

test('production keeps its per-build cache despite filesystem changes', () => {
  const f = fixture(false);
  const first = f.audioPublication();
  assert.equal(first.chapters.length, 1);
  assert.equal(first.audiobooks.length, 1);
  f.write('audio/published.json', { chapters: [], audiobooks: [] });
  assert.equal(f.audioPublication(), first);
  assert.equal(f.plans(), 1);
});
