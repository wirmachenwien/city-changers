// Glossary terms: single source of truth in glossary.json (editable via
// PagesCMS, like works.json and nav.json). This module validates it and
// exposes typed access plus the term matcher for the build-time
// highlighter (src/lib/render-prose.mjs). `forms` lists inflected
// surface forms found in chapter texts; when empty it defaults to [term],
// so newly added terms match in their base form right away.
import { z } from 'zod';
// Import attribute so the module also loads in plain Node (verify script)
// and bundlers; TS infers the JSON shape from resolveJsonModule.
import raw from './glossary.json' with { type: 'json' };
import { languages } from '../../handbook.config.ts';
import type { Language } from './locales';

const glossaryEntrySchema = z.object({
  term: z.string().min(1),
  definition: z.string().min(1),
  forms: z.array(z.string().min(1)).optional().default([]),
});

export interface GlossaryTerm {
  term: string;
  definition: string;
  forms: string[];
}

const parsed = z.record(z.string(), z.array(glossaryEntrySchema)).parse(raw) as Record<string, z.infer<typeof glossaryEntrySchema>[]>;
for (const lang of languages) {
  if (!parsed[lang]) throw new Error(`glossary.json: missing glossary "${lang}" (see handbook.config.ts)`);
}

function withDefaultForms(entry: z.infer<typeof glossaryEntrySchema>): GlossaryTerm {
  return {
    term: entry.term,
    definition: entry.definition,
    forms: entry.forms.length > 0 ? entry.forms : [entry.term],
  };
}

export const glossaryTerms: Record<Language, GlossaryTerm[]> = Object.fromEntries(
  languages.map((lang) => [lang, parsed[lang].map(withDefaultForms)]),
) as Record<Language, GlossaryTerm[]>;

// --- Matcher (pure logic shared by the prose renderer and checks) ---

export interface GlossaryMatcher {
  pattern: RegExp;
  lookup: (surface: string) => GlossaryTerm | undefined;
}

function escapeGlossaryRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Lowercase + unify separators: "Street Design" also finds "street-design". */
export function normalizeGlossaryForm(value: string): string {
  return value.toLowerCase().replace(/[\s-]+/g, ' ').trim();
}

/** Combined case-insensitive matcher over all surface forms of a language. */
export function buildGlossaryMatcher(lang: Language): GlossaryMatcher {
  const byForm = new Map<string, GlossaryTerm>();
  const patterns: string[] = [];
  for (const entry of glossaryTerms[lang] ?? []) {
    // Longest forms first so multi-word/inflected variants win.
    const forms = [...entry.forms].sort((a, b) => b.length - a.length);
    for (const form of forms) {
      const key = normalizeGlossaryForm(form);
      if (!byForm.has(key)) byForm.set(key, entry);
      patterns.push(escapeGlossaryRegExp(form).replace(/[\s-]+/g, '[\\s-]+'));
    }
  }
  patterns.sort((a, b) => b.length - a.length);
  // Unicode-aware word edges: never match inside a longer word (e.g. no
  // "Monitoring" inside "Medienmonitoring").
  const pattern = new RegExp(`(?<!\\p{L})(${patterns.join('|')})(?!\\p{L})`, 'giu');
  return { pattern, lookup: (surface: string) => byForm.get(normalizeGlossaryForm(surface)) };
}
