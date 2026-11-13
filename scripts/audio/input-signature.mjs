import { lstatSync, readdirSync, readFileSync } from 'node:fs';

// Stat unchanged inputs rather than repeatedly reading/hashing large media.
// Missing files and directory membership are part of the key as well.
export function audioInputSignature(resolvePath) {
  const inputs = ['audio/config.json', 'audio/edition.json', 'audio/blocks.json', 'audio/overrides.json', 'audio/sentence-timing-corrections.json',
    'audio/published.json', 'src/data/works.json', 'src/data/glossary.json', 'src/content/book',
    'handbook.config.ts', 'src/lib/chapter-slug.ts', '.cache/audio/units', 'public/audio'];
  try {
    const cover = JSON.parse(readFileSync(resolvePath('audio/config.json'), 'utf8')).metadata?.cover;
    if (cover) inputs.push(cover);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const entries = [];
  function visit(file) {
    let stat;
    try { stat = lstatSync(resolvePath(file), { bigint: true }); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      entries.push([file, 'missing']);
      return;
    }
    entries.push([file, String(stat.ino), String(stat.size), String(stat.mtimeNs), String(stat.ctimeNs)]);
    if (stat.isDirectory()) for (const name of readdirSync(resolvePath(file)).sort()) visit(`${file}/${name}`);
  }
  for (const file of inputs) visit(file);
  return JSON.stringify(entries);
}
