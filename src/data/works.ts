// Typed, Zod-validated access to the book metadata and chapter catalogue.
// The ordered chapter list lives in works.json (files + web flags); chapter
// *titles* come from the MDX frontmatter of the book collection and are
// resolved in ./book-toc.ts (server-only, build-time). This module stays
// client-safe (no astro:content import) because lib/i18n.ts reads the book
// title/description/credit for the site chrome.
import { z } from 'zod';
import { languages } from '../../handbook.config.ts';
import { project } from './project';
import raw from './works.json';
import type { Language } from './locales';

const chapterSchema = z.object({
  file: z.string(),
  /** Print-only chapters (cover/title sheets) have no web page. */
  web: z.boolean().optional().default(true),
});

const workSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional().default(''),
  creator: z.string().optional().default(''),
  contributor: z.string().optional().default(''),
  description: z.string().optional().default(''),
  credit: z.string().optional().default(''),
  image: z.string().optional().default(''),
  publisher: z.string().optional().default(''),
  rights: z.string().optional().default(''),
  language: z.string(),
  date: z.string().optional().default(''),
  modified: z.string().optional().default(''),
  type: z.string().optional().default(''),
  subject: z.string().optional().default(''),
  identifier: z.string().optional().default(''),
  /** Single ordered chapter list per language (single source of truth for
   *  reading order). Titles are resolved from the MDX frontmatter in
   *  ./book-toc.ts. */
  chapters: z.array(chapterSchema).min(1),
});

export type Work = z.infer<typeof workSchema>;

const parsedWorks = z.record(z.string(), workSchema).parse(raw) as Record<string, Work>;
for (const lang of languages) {
  if (!parsedWorks[lang]) throw new Error(`works.json: missing work "${lang}" (see handbook.config.ts)`);
  const files = parsedWorks[lang].chapters.map((chapter) => chapter.file);
  const duplicates = files.filter((file, index) => files.indexOf(file) !== index);
  if (duplicates.length > 0) {
    throw new Error(`works.json: duplicate chapter(s) in "${lang}": ${[...new Set(duplicates)].join(', ')}`);
  }
  if (!files.includes('contents')) throw new Error(`works.json: "${lang}" chapters are missing "contents"`);
}
const works = parsedWorks as Record<Language, Work>;

for (const work of Object.values(works)) {
  Object.assign(work, {
    creator: work.creator || project.creator,
    contributor: work.contributor || project.contributor,
    publisher: work.publisher || project.publisher,
    rights: work.rights || project.rights,
    date: work.date || project.date,
    modified: work.modified || project.modified,
    identifier: work.identifier || project.identifier,
  });
}

export function getWork(lang: Language): Work {
  return works[lang];
}
