import { existsSync, readdirSync, lstatSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { artifactPattern, publicationArtifacts } from './release.mjs';

// Only remove known generated outputs, never arbitrary public files or symlinks.
function managedDirectory(directory, revision) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || !entry.isDirectory() || !['en', 'de', 'sl'].includes(entry.name)) return false;
    for (const file of readdirSync(join(directory, entry.name), { withFileTypes: true })) {
      if (!file.isFile() || !artifactPattern.test(`${revision}/${entry.name}/${file.name}`)) return false;
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
    if (!entry.isDirectory() || !/^[a-f0-9]{20}$/.test(entry.name) || live.has(entry.name)) continue;
    const target = join(directory, entry.name);
    if (!managedDirectory(target, entry.name)) continue;
    rmSync(target, { recursive: true });
    removed.push(entry.name);
  }
  return removed;
}
