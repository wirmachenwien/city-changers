import { hash } from './content.mjs';

export const repository = 'wirmachenwien/city-changers';
export const releaseMetadata = 'audio-release.json';
export const artifactPattern = /^[a-f0-9]{20}\/(en|de|sl)\/[a-z0-9-]+\.(mp3|m4b|cues\.json|transcript\.html)$/;

export function publicationArtifacts(publication) {
  return publication.chapters.flatMap(c => [
    { ...c.track, kind: 'mp3' }, { ...c.cues, kind: 'cues' }, { ...c.transcript, kind: 'transcript' },
  ]).concat(publication.audiobooks.map(b => ({ file: b.file, bytes: b.bytes, sha256: b.sha256, url: b.url, kind: 'm4b' })));
}

// Fingerprint public edition metadata and output checksums, not credentials,
// local paths, publication state or a signed/expiring GitHub redirect URL.
export function releaseInventory(publication) {
  const normalized = structuredClone(publication);
  delete normalized.release;
  for (const chapter of normalized.chapters) {
    for (const item of [chapter.track, chapter.cues, chapter.transcript]) item.url = `/audio/${item.file}`;
  }
  for (const book of normalized.audiobooks) book.url = `/audio/${book.file}`;
  const assets = publicationArtifacts(normalized).map(({ file, bytes, sha256, kind }) => {
    if (!artifactPattern.test(file) || !Number.isSafeInteger(bytes) || bytes <= 0 || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid public audio artifact');
    return { file, bytes, sha256, kind, releaseAsset: file.replaceAll('/', '--') };
  });
  if (new Set(assets.map(a => a.releaseAsset)).size !== assets.length) throw new Error('Duplicate audio release attachment');
  const fingerprint = hash({ schemaVersion: 1, repository, publication: normalized, assets });
  const tag = `audio-${fingerprint}`;
  const url = `https://github.com/${repository}/releases/tag/${tag}`;
  const download = name => `https://github.com/${repository}/releases/download/${tag}/${name}`;
  const ready = structuredClone(normalized);
  ready.release = { fingerprint, tag, url };
  for (const chapter of ready.chapters) chapter.track.url = download(chapter.track.file.replaceAll('/', '--'));
  for (const book of ready.audiobooks) book.url = download(book.file.replaceAll('/', '--'));
  return { schemaVersion: 1, repository, fingerprint, tag, url, publication: ready,
    assets: assets.map(a => ({ ...a, download: download(a.releaseAsset) })) };
}

export function validateReleaseInventory(release) {
  const expected = releaseInventory(release.publication);
  if (JSON.stringify(release) !== JSON.stringify(expected)) throw new Error('Audio release inventory is inconsistent; run npm run audio:prepare');
  return release;
}
