#!/usr/bin/env node
// Verification for the glossary auto-highlighter (run: node scripts/bin/check-glossary.mjs).
// The single source of truth is src/data/glossary.json (validated on import
// via src/data/glossary.ts); this script asserts dictionary quality, that
// the glossary chapters render from it (no duplicated inline entries), that
// chapter-01 recap terms exist in it, and term coverage across chapters.
import { readFileSync, readdirSync } from 'node:fs';
import { buildGlossaryMatcher, glossaryTerms } from '../../src/data/glossary.ts';
import { languages } from '../../handbook.config.ts';
import { createReporter } from '../lib/reporter.mjs';

const BOOK = 'src/content/book';
const reporter = createReporter();
const fail = (msg) => reporter.fail(msg);

// Pseudo-render: approximate what the browser sees (link texts live inside
// <a> and are skipped by the highlighter, so drop them; keep other text).
function pseudoRender(mdx) {
  let text = mdx.replace(/^---\n.*?\n---\n/s, '');
  text = text.replace(/\[([^\]]*)\]\(([^)]+)\)/g, ''); // linked text skipped
  text = text.replace(/https?:\/\/\S+/g, ''); // bare URLs never visible text
  text = text.replace(/<\/?[A-Za-z][^>]*>/g, ' '); // component/html tags
  text = text.replace(/^[A-Za-z]+:\s*"[^"]*"\s*$/gm, ' '); // stray attrs
  return text.replace(/[ \t]+/g, ' ');
}

for (const lang of languages) {
  const { pattern, lookup } = buildGlossaryMatcher(lang);
  const entries = glossaryTerms[lang];

  // Dictionary quality: unique terms, every match resolves.
  const seen = new Set();
  for (const entry of entries) {
    const key = entry.term.toLowerCase();
    if (seen.has(key)) fail(`${lang}: duplicate term "${entry.term}"`);
    seen.add(key);
    if (!entry.definition.trim()) fail(`${lang}: empty definition for "${entry.term}"`);
    if (entry.forms.length === 0) fail(`${lang}: no match forms for "${entry.term}"`);
  }

  // Glossary chapter renders from shared data (no duplicated inline entries).
  const chapter = readFileSync(`${BOOK}/${lang}/glossary.mdx`, 'utf8');
  const glossaryComponent = new RegExp(`<Glossary\\s+lang=(?:"${lang}"|\\{["']${lang}["']\\})\\s*/>`);
  if (!glossaryComponent.test(chapter)) {
    fail(`${lang}/glossary.mdx: must render shared data via <Glossary lang={"${lang}"} />`);
  }
  if (chapter.includes('entries={') || /term:\s*"/.test(chapter)) {
    fail(`${lang}/glossary.mdx: must not duplicate terms inline`);
  }

  // Chapter-01 recap terms must exist in the dictionary.
  const recap = readFileSync(`${BOOK}/${lang}/01.mdx`, 'utf8');
  for (const [, term] of recap.matchAll(/\{\s*term:\s*"([^"]+)",\s*definition:/g)) {
    if (!entries.some((e) => e.term.toLowerCase() === term.toLowerCase())) {
      fail(`${lang}/01.mdx: recap term "${term}" missing from glossary.json`);
    }
  }

  // Coverage across chapters.
  const files = readdirSync(`${BOOK}/${lang}`).filter((f) => f.endsWith('.mdx'));
  let total = 0;
  for (const file of files) {
    const text = pseudoRender(readFileSync(`${BOOK}/${lang}/${file}`, 'utf8'));
    const matches = [...text.matchAll(pattern)];
    for (const m of matches) {
      if (!lookup(m[0])) fail(`${lang}/${file}: no definition for surface form "${m[0]}"`);
    }
    if (file !== 'glossary.mdx' && matches.length === 0) {
      fail(`${lang}/${file}: zero term matches`);
    }
    total += matches.length;
    console.log(`${lang}/${file}: ${matches.length} marks`);
  }
  console.log(`${lang}: ${total} marks total across ${files.length} files`);

  // Spot checks on known occurrences.
  const mustFind = {
    de: [['02.mdx', 'superblock'], ['02.mdx', 'modalfilter'], ['04.mdx', 'narrativ'], ['04.mdx', 'framing']],
    en: [['02.mdx', 'superblock'], ['04.mdx', 'theories of change'], ['02.mdx', 'modal filter']],
    sl: [['02.mdx', 'superbloki'], ['02.mdx', 'tranzitni promet'], ['04.mdx', 'teorije sprememb']],
  }[lang] ?? [];
  for (const [file, needle] of mustFind) {
    const text = pseudoRender(readFileSync(`${BOOK}/${lang}/${file}`, 'utf8'));
    pattern.lastIndex = 0;
    const hits = [...text.matchAll(pattern)].map((m) => m[0].toLowerCase().replace(/[\s-]+/g, ' '));
    if (!hits.some((h) => h.includes(needle.toLowerCase()))) fail(`${lang}/${file}: expected a "${needle}" mark`);
  }

  // Boundary safety: compounds must NOT match (German-only probes).
  if (lang === 'de') {
    for (const [probe, why] of [['Medienmonitoring zeigt Wirkung', 'compound prefix'], ['Bellermannkiezblock in Berlin', 'compound suffix']]) {
      pattern.lastIndex = 0;
      if (pattern.test(probe)) fail(`de: matched inside compound "${probe}" (${why})`);
    }
  }

  console.log(`${lang}: dictionary OK (${entries.length} entries)`);
}

if (reporter.hasFailures()) { console.error(`${reporter.failures} check(s) failed`); process.exit(1); }
console.log('All glossary checks passed.');
