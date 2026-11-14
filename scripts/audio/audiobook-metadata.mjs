import { readFileSync } from 'node:fs';
import { hash } from './content.mjs';
import { path, read } from './plan.mjs';

export function hasAudiobookMetadata(plan, lang) {
  const metadata = plan.config.metadata;
  const narrator = typeof metadata?.narrator === 'string' ? metadata.narrator : metadata?.narrator?.[lang];
  return Boolean(narrator && metadata?.author && metadata?.rights && metadata?.cover);
}

export function audiobookMetadata(plan, lang) {
  const metadata = plan.config.metadata;
  const narrator = typeof metadata?.narrator === 'string' ? metadata.narrator : metadata?.narrator?.[lang];
  const title = read('src/data/works.json')[lang]?.title;
  if (!title || !narrator || !metadata.author || !metadata.rights || !metadata.cover) throw new Error('Set audiobook titles, narrator, author, rights and existing cover artwork');
  return { metadataVersion: 2, title, narrator, author: metadata.author, rights: metadata.rights,
    coverHash: hash(readFileSync(path(metadata.cover))) };
}

export const audiobookMetadataHash = (plan, lang) => hash(audiobookMetadata(plan, lang));
