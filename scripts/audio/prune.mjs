import { existsSync, readdirSync, lstatSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { artifactPattern, publicationArtifacts } from './release.mjs';

const legacyTranscript = /^[a-z0-9-]+\.transcript\.html$/;

// Only remove known generated outputs, never arbitrary public files or symlinks.
function managedDirectory(directory, revision) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || !entry.isDirectory() || !['en', 'de', 'sl'].includes(entry.name)) return false;
    for (const file of readdirSync(join(directory, entry.name), { withFileTypes: true })) {
      if (!file.isFile() || (!artifactPattern.test(`${revision}/${entry.name}/${file.name}`) && !legacyTranscript.test(file.name))) return false;
    }
  }
  return true;
}

export function prunePublicAudio(directory, publication) {
  if (!existsSync(directory)) return [];
  if (lstatSync(directory).isSymbolicLink()) throw new Error('Refusing to prune a symlinked public audio directory');
  const artifacts = publicationArtifacts(publication);
  const live = new Set(artifacts.map(a => a.file.split('/')[0]));
  const removed = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-f0-9]{20}$/.test(entry.name)) continue;
    const target = join(directory, entry.name);
    // Remove obsolete generated HTML even from revisions retained by partial
    // preparation, without traversing symlinks or touching unrelated files.
    for (const lang of readdirSync(target, { withFileTypes: true })) {
      if (!lang.isDirectory() || !['en', 'de', 'sl'].includes(lang.name)) continue;
      for (const file of readdirSync(join(target, lang.name), { withFileTypes: true })) {
        if (file.isFile() && legacyTranscript.test(file.name)) unlinkSync(join(target, lang.name, file.name));
      }
    }
    if (live.has(entry.name)) continue;
    if (!managedDirectory(target, entry.name)) continue;
    rmSync(target, { recursive: true });
    removed.push(entry.name);
  }
  return removed;
}
