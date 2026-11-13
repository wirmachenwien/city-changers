import { makePlan, path } from '../../scripts/audio/plan.mjs';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { hash } from '../../scripts/audio/content.mjs';
import { artifactPattern } from '../../scripts/audio/release.mjs';
import { base as siteBase } from '../../handbook.config.ts';

// Cached per build, never an API call. Normal builds diagnose missing/stale audio.
let current;
let scriptPlan;
export function audioScriptChapter(id) {
  scriptPlan ??= makePlan();
  return scriptPlan.chapters.find(chapter => chapter.id === id);
}
export function audioPublication() {
  const dev = import.meta.env?.DEV === true;
  if (!dev && current) return current;
  const plan = dev ? (scriptPlan = makePlan()) : (scriptPlan ??= makePlan());
  const manifest = existsSync(path('audio/published.json')) ? JSON.parse(readFileSync(path('audio/published.json'), 'utf8')) : { chapters: [], audiobooks: [] };
  const base = 'public/audio';
  const localArtifactValid = item => {
    if (!item || !Number.isFinite(item.bytes) || !item.sha256 || !item.url) return false;
    if (item.url.startsWith('https://')) return true; // remote range/CORS checks are a publication gate
    if (!artifactPattern.test(item.file)) return false;
    const file = path(`${base}/${item.file}`);
    return existsSync(file) && statSync(file).size === item.bytes && hash(readFileSync(file)) === item.sha256;
  };
  const chapters = manifest.chapters.filter(track => {
    const chapter = plan.chapters.find(c => c.id === track.id);
    return chapter && track.cueSchemaVersion === 2 && chapter.sourceHash === track.sourceHash && chapter.scriptHash === track.scriptHash && chapter.assemblyHash === track.assemblyHash &&
      Number.isFinite(track.duration) && track.duration > 0 &&
      [track.track, track.cues].every(localArtifactValid);
  });
  if (chapters.length !== plan.chapters.length) console.warn(`[audio] ${plan.chapters.length - chapters.length}/${plan.chapters.length} missing or stale tracks hidden. Run npm run audio:prepare to prepare retained narration.`);
  const localMedia = item => {
    if (!dev || !artifactPattern.test(item.file)) return item;
    const local = path(`public/audio/${item.file}`);
    return existsSync(local) && statSync(local).size === item.bytes && hash(readFileSync(local)) === item.sha256
      ? { ...item, url: `${siteBase.replace(/\/$/, '')}/audio/${item.file}` } : item;
  };
  current = { ...manifest, chapters: chapters.map(c => ({ ...c, track: localMedia(c.track) })), audiobooks: manifest.audiobooks.filter(book => {
    const expected = plan.chapters.filter(c => c.lang === book.lang);
    return localArtifactValid(book) && expected.every(c => chapters.some(t => t.id === c.id && t.revision === book.revision));
  }).map(localMedia) };
  return current;
}
