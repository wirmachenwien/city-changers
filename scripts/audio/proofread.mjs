// Read-only editorial delivery. Uses the production AST/plan, never credentials,
// provider requests, generated audio, or a separately maintained narration copy.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { attr, parseSource, text, shouldNarrateFigure } from './content.mjs';
import { read, path, writePlan, assets } from './plan.mjs';
import { site } from '../../handbook.config.ts';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const callouts = new Set(['FeatureBox', 'MascotBox', 'Accordion', 'PullQuote', 'ExpandableBox']);
const components = new Set([...callouts, 'Figure', 'Question', 'Bibliography', 'Glossary', 'Footnote', 'Spoiler', 'TableWrap', 'Slideshow']);
const label = { visual: 'Figure / image description', quiz: 'Quiz → reflection question', table: 'Table → spoken comparison', glossary: 'Glossary entry', 'callout-title': 'Callout / accordion title', attribution: 'Quotation attribution', footnote: 'Footnote', heading: 'Heading', paragraph: 'Prose', list: 'List item', omitted: 'Not narrated' };
function componentNames(node) {
  return [...new Set([...(node.type === 'image' ? ['Figure'] : node.name ? [node.name] : []), ...(node.children ?? []).flatMap(componentNames)])];
}
function categories(kind, names) {
  const values = [kind];
  if (names.some(name => callouts.has(name))) values.push('callout');
  if (names.includes('Spoiler')) values.push('quiz');
  if (kind === 'visual' || names.includes('Figure')) values.push('visual');
  if (kind === 'quiz' || names.includes('Question')) values.push('quiz');
  if (kind === 'table' || names.includes('TableWrap')) values.push('table');
  if (kind === 'glossary' || names.includes('Glossary')) values.push('glossary');
  if (names.some(name => components.has(name)) || ['visual', 'quiz', 'table', 'glossary', 'callout-title', 'attribution'].includes(kind)) values.push('component');
  return [...new Set(values)];
}
function localImage(node) {
  const src = node.type === 'image' ? node.url : attr(node, 'src');
  if (typeof src !== 'string' || /^(https?:|data:|\/\/)/.test(src)) return '';
  const base = resolve(path('src/assets/book'));
  const file = resolve(src.startsWith('src/assets/book/') ? path(src) : base, src.startsWith('src/assets/book/') ? '' : src);
  if (!file.startsWith(`${base}/`) || !/\.(png|jpe?g|webp|gif|svg)$/i.test(file) || !existsSync(file)) return '';
  const url = relative(path('.cache/audio/proofread'), file).replaceAll('\\', '/');
  return `<img src="${escape(url)}" alt="${escape(attr(node, 'alt') ?? '')}" loading="lazy">`;
}
function original(node, block) {
  if (node.type === 'image') return `${localImage(node)}<p><strong>Original alt text:</strong> ${escape(node.alt || '(none)')}</p>`;
  if (node.name === 'Figure') return `${localImage(node)}<p><strong>Original alt text:</strong> ${escape(attr(node, 'alt') || '(none)')}</p><p><strong>Caption / credit:</strong> ${escape([attr(node, 'caption'), text(node)].filter(Boolean).join(' ') || '(none)')}</p>`;
  if (node.name === 'Question') {
    const options = attr(node, 'options') ?? [];
    const indices = [].concat(attr(node, 'answer') ?? [], attr(node, 'answers') ?? []);
    return `<p>${escape(attr(node, 'question'))}</p><ol>${options.map((option, i) => `<li>${escape(typeof option === 'string' ? option : option.label)}${indices.includes(i) || option.correct ? ' <strong>(correct)</strong>' : ''}</li>`).join('')}</ol>${attr(node, 'feedbackCorrect') ? `<p><strong>Correct-answer explanation:</strong> ${escape(attr(node, 'feedbackCorrect'))}</p>` : ''}`;
  }
  if (node.type === 'table') return `<div class="table-scroll"><table>${node.children.map((row, i) => `<tr>${row.children.map(cell => `<${i ? 'td' : 'th'}>${escape(text(cell))}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table></div>`;
  return `<p>${escape(block.text)}</p>`;
}

export function proofreadChapter(chapter, glossary, retained = assets()) {
  const sourceFile = `src/content/book/${chapter.id}.mdx`;
  const source = readFileSync(path(sourceFile), 'utf8');
  const parsed = parseSource(source, chapter.lang, glossary);
  if (parsed.blocks.length !== chapter.blocks.length) throw new Error(`Proofreading source mapping changed: ${chapter.id}`);
  const ancestors = new Map();
  function walk(node, parents = []) {
    ancestors.set(node, parents);
    for (const child of node.children ?? []) walk(child, [...parents, node]);
  }
  walk(parsed.tree);
  const rows = chapter.blocks.map((block, index) => {
    const raw = parsed.blocks[index];
    if (raw.fingerprint !== block.fingerprint) throw new Error(`Proofreading fingerprint mismatch: ${chapter.id}/${block.id}`);
    const names = [...new Set([...(ancestors.get(raw.node) ?? []).map(n => n.name).filter(Boolean), ...componentNames(raw.node)])];
    const entry = block.kind === 'glossary' ? glossary[chapter.lang].find(e => e.term === block.term) : undefined;
    const snippet = entry ? JSON.stringify({ term: entry.term, definition: entry.definition }, null, 2) : source.slice(raw.node.position.start.offset, raw.node.position.end.offset);
    const units = chapter.units.filter(u => u.blockIds.includes(block.id));
    const keys = new Set(units.map(u => u.cacheKey));
    const previousText = retained.filter(a => a.unit.id.startsWith(`${chapter.id}/${block.id}/`) && !keys.has(a.unit.cacheKey))
      .map(a => a.unit.originalText).join(' ');
    return { ...block, chapterId: chapter.id, sourceFile: entry ? 'src/data/glossary.json' : sourceFile, sourceReference: entry ? `${chapter.lang}: ${entry.term}` : `line ${block.line}`,
      snippet, componentNames: names, categories: categories(block.kind, names),
      originalHtml: original(raw.node, block), units, previousText,
      state: units.some(u => u.change === 'changed' || u.change === 'inserted') ? 'missing' : 'generated' };
  });
  const represented = new Set(parsed.blocks.map(b => b.node));
  function omissions(node) {
    const hasNarration = parsed.blocks.some(b => b.node === node || (ancestors.get(b.node) ?? []).includes(node));
    const figure = node.name === 'Figure' || node.type === 'image';
    const inlineFootnote = node.name === 'Footnote' && (ancestors.get(node) ?? []).some(parent => represented.has(parent));
    const omitted = (node.type === 'image' && !shouldNarrateFigure(node)) || (components.has(node.name) && !hasNarration && !inlineFootnote && node.name !== 'Spoiler');
    const excludedHeading = node.type === 'heading' && !represented.has(node);
    if (omitted || excludedHeading) {
      const reason = figure ? shouldNarrateFigure(node)
          ? 'This allowed semicircle diagram has no narration here (missing alt text or excluded reference section).'
          : 'Figure/video excluded from TTS by editorial policy. Only the five-group semicircle diagram (spectrum-of-allies.png) is narrated.'
          : excludedHeading ? 'Reference/material/video heading is excluded by the current editorial policy. Its text remains available in the book.'
            : 'This component is excluded by the current editorial policy; it will not be sent to TTS.';
      rows.push({ id: `omitted-${node.position.start.offset}`, kind: 'omitted', state: 'omitted', chapterId: chapter.id, line: node.position.start.line,
        sourceFile, sourceReference: `line ${node.position.start.line}`, snippet: source.slice(node.position.start.offset, node.position.end.offset),
        componentNames: componentNames(node), categories: categories('omitted', componentNames(node)), originalHtml: figure ? original(node, {}) : node.name === 'Footnote' ? `<p>${escape(attr(node, 'text'))}</p>` : '', reason, units: [] });
      return;
    }
    for (const child of node.children ?? []) omissions(child);
  }
  omissions(parsed.tree);
  // Keep extraction/assembly order (e.g. attribution follows its quotation even
  // when its cite prop appears on the component's earlier opening line).
  // Exclusions follow the narrated blocks and retain explicit source locations.
  return rows;
}

function rowHtml(row) {
  const notes = [];
  if (row.identityReview) notes.push(row.previousText
    ? 'Script changed. Retained audio for the previous wording is no longer reused; compare it below before generating.'
    : 'New block identity. Any previous audio for this wording is no longer reused; the old asset stays private and unused.');
  if (row.chapterNumber !== undefined) notes.push('The chapter title is spoken with its localized “Chapter NUMBER: TITLE” prefix. The displayed book heading is unchanged.');
  if (row.kind === 'visual') notes.push('This five-group semicircle diagram is the only figure included in TTS. Only its description below is sent; caption/photo credits are not read.');
  if (row.kind === 'quiz') {
    notes.push('This is a spoken adaptation, not the interactive quiz.');
    if (row.pause) notes.push(`${row.pause.seconds}-second silent pause inserted offline after “${row.pause.after}”. This silence is not sent as API text and consumes no TTS allowance.${row.pause.textOffset === null ? ' WARNING: anchor is missing/ambiguous; assembly is blocked until reviewed.' : ''}`);
    else notes.push('The thinking prompt is spoken text; no additional assembly silence is configured.');
  }
  if (row.kind === 'table') notes.push('The table is spoken as labelled comparisons, with two newline characters between rows. Check labels, punctuation, units and reading order. Blank lines do not guarantee a fixed-duration silence.');
  if (row.ordered) notes.push(`Ordered-list counter ${row.counter} is spoken in the narration language.`);
  if (row.kind === 'attribution') notes.push('Attribution is spoken as a localized “says NAME from ORGANIZATION” phrase after the quotation.');
  if (row.kind === 'glossary') notes.push('Term and definition come from shared glossary data, not just the glossary MDX.');
  if (row.componentNames.includes('Spoiler')) notes.push('The inline spoiler answer is read immediately as part of this passage. There is no interactive reveal or inserted timed pause.');
  if (row.componentNames.includes('Footnote') && row.kind !== 'omitted') notes.push('Footnote text is read in place, immediately after its surrounding prose.');
  if (row.adaptation && !notes.length) notes.push('Audio-specific adaptation: review against the source.');
  const requests = row.units.map((unit, i) => `<div class="request"><h4>API input${row.units.length > 1 ? ` ${i + 1} of ${row.units.length}` : ''} · ${unit.text.length} characters</h4><pre data-request-text>${escape(unit.text)}</pre><details><summary>Request identity</summary><code>${escape(unit.id)}</code></details></div>`).join('');
  const status = row.kind === 'omitted' ? 'Not sent to the API' : row.state === 'generated' ? 'Generated audio available' : 'Needs generation';
  return `<article id="${escape(`${row.chapterId}/${row.id}`)}" data-row data-lang="${escape(row.chapterId.split('/')[0])}" data-file="${escape(row.chapterId.split('/')[1])}" data-state="${escape(row.state ?? 'omitted')}" data-categories="${escape(row.categories.join(' '))}" data-block-id="${escape(row.id)}">
    <h3>${escape(label[row.kind] ?? row.kind)}${row.componentNames.length ? ` · ${escape(row.componentNames.join(', '))}` : ''}</h3>
    <p><code>${escape(`${row.chapterId}/${row.id}`)}</code> · ${escape(status)}</p>
    ${notes.map(note => `<p class="note">${escape(note)}</p>`).join('')}
    <div class="comparison"><div><h4>Source</h4>${row.originalHtml}<details><summary>Source code · ${escape(row.sourceFile)} · ${escape(row.sourceReference)}</summary><pre>${escape(row.snippet)}</pre></details></div>
    <div><h4>${row.kind === 'omitted' ? 'Not narrated' : 'Exact text prepared for ElevenLabs'}</h4>${row.reason ? `<p>${escape(row.reason)}</p>` : ''}
    ${row.spoken !== undefined && row.spoken !== row.text ? `<details><summary>Before narration adaptations / overrides</summary><p>${escape(row.text)}</p></details>` : ''}
    ${row.submitted !== undefined && row.submitted !== row.spoken ? `<details><summary>Before pronunciation replacements</summary><p>${escape(row.spoken)}</p></details>` : ''}
    ${row.previousText ? `<details><summary>Previous generated script</summary><pre>${escape(row.previousText)}</pre></details>` : ''}
    ${requests || '<p>No generation request.</p>'}</div></div>
  </article>`;
}

export function buildProofread(plan) {
  const glossary = read('src/data/glossary.json');
  const retained = assets();
  const chapters = plan.chapters.map(chapter => ({ ...chapter, rows: proofreadChapter(chapter, glossary, retained) }));
  const directory = '.cache/audio/proofread';
  mkdirSync(path(directory), { recursive: true });
  writePlan(plan);
  const pendingCharacters = plan.chapters.flatMap(c => c.units).filter(u => u.change === 'changed' || u.change === 'inserted').reduce((n, u) => n + u.text.length, 0);
  const sections = chapters.map(chapter => {
    const pending = chapter.units.filter(u => u.change === 'changed' || u.change === 'inserted');
    return `<section data-chapter lang="${chapter.lang}"><h2>${escape(chapter.lang.toUpperCase())} · ${escape(chapter.title)}</h2><p><a href="${escape(new URL(chapter.pageUrl, site).href)}" target="_blank" rel="noopener">Open book page</a> · ${chapter.characters} input characters · ${chapter.units.length} requests · ${pending.length} new</p>${chapter.rows.map(rowHtml).join('\n')}</section>`;
  }).join('\n');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Narration proofreading</title>
<link rel="stylesheet" href="../../../src/styles/colors.generated.css"><style>
body { max-width: 90rem; margin: auto; padding: 1rem; font: 1rem/1.6 system-ui, sans-serif; background: var(--paper); color: var(--ink); }
a { color: var(--accent); } h1,h2,h3,h4 { line-height: 1.3; } article { border: 1px solid var(--ink); padding: 1rem; margin-block: 1.5rem; }
.comparison { display: grid; gap: 1.5rem; } .comparison > div { min-width: 0; } @media (min-width: 60rem) { .comparison { grid-template-columns: 1fr 1fr; } }
pre { white-space: pre-wrap; overflow-wrap: anywhere; padding: .75rem; background: var(--accent-soft); color: var(--ink); } code { overflow-wrap: anywhere; }
img { max-width: 100%; max-height: 20rem; object-fit: contain; } table { border-collapse: collapse; } th,td { border: 1px solid var(--ink-soft); padding: .5rem; } .table-scroll { overflow-x: auto; }
.filters { display: flex; flex-wrap: wrap; gap: 1rem; align-items: end; } label { display: grid; gap: .25rem; } input,select,summary,button { min-height: 44px; font: inherit; } input,select { color: var(--ink); background: var(--paper); border: 1px solid var(--ink); padding: .4rem; }
summary { cursor: pointer; } :focus-visible { outline: 3px solid var(--ink); outline-offset: 3px; } .note { border-inline-start: 3px solid var(--accent); padding-inline-start: .75rem; } [hidden] { display: none !important; }
@media print { .filters { display: none; } article { break-inside: avoid; } }
</style></head><body><main><h1>Narration proofreading</h1>
<p><strong>Read-only draft. Nothing on this page generates audio.</strong> This snapshot contains all ${plan.chapters.length} chapters and ${plan.characters} submitted-text characters, with ${pendingCharacters} characters needing generation. Generated ${escape(new Date().toISOString())}.</p>
<p>The right-hand boxes are the exact <code>inputs[0].text</code> strings prepared for API requests, including audio overrides and pronunciation replacements. Request boundaries are explicit. Model: <code>${escape(plan.config.modelId)}</code>; normalization: <code>${escape(plan.config.normalization)}</code>. ElevenLabs may normalize numbers/abbreviations or apply pinned dictionaries when speaking; this page cannot guarantee that pronunciation.</p>
<p>Start with <strong>Components only</strong>, <strong>Needs generation</strong>, or select <strong>Figures</strong>, <strong>Quizzes / spoilers</strong> or <strong>Tables</strong>. Compare the source with the spoken adaptation. Text labelled “Not narrated” is not sent. Current policy: ${escape(read('audio/overrides.json').policy)}</p>
<p>To request a change, copy the visible block ID and your preferred wording. Change the book source for ordinary corrections; use <code>audio/overrides.json</code> for narration-only adaptations. Regenerate this snapshot after edits with <code>npm run audio:proofread</code>. Do not edit this generated HTML.</p>
<p>Plan hash: <code>${escape(plan.planHash)}</code>. Plain-text scripts: ${[...new Set(chapters.map(c => c.lang))].map(lang => `<a href="scripts-${lang}.md">${escape(lang.toUpperCase())}</a>`).join(' · ')}.</p>
<div class="filters"><label>Language<select id="language"><option value="">All languages</option>${[...new Set(chapters.map(c => c.lang))].map(lang => `<option value="${lang}">${lang.toUpperCase()}</option>`).join('')}</select></label>
<label>Chapter<select id="chapter"><option value="">All chapters</option>${chapters.filter(c => c.lang === (chapters.some(c => c.lang === 'en') ? 'en' : chapters[0].lang)).map(chapter => `<option value="${escape(chapter.file)}">${escape(chapter.title)}</option>`).join('')}</select></label>
<label>Content<select id="kind"><option value="">All content</option><option value="component">Components only</option><option value="visual">Figures</option><option value="quiz">Quizzes / spoilers</option><option value="table">Tables</option><option value="callout">Callouts / accordions / quotes</option><option value="glossary">Glossary</option><option value="omitted">Not narrated</option></select></label>
<label>Audio status<select id="state"><option value="">All</option><option value="missing">Needs generation</option><option value="generated">Generated</option></select></label>
<label>Find text or block ID<input id="search" type="search"></label></div><p id="count" role="status"></p>
${sections}</main><script>
const language=document.querySelector('#language'),chapter=document.querySelector('#chapter'),kind=document.querySelector('#kind'),state=document.querySelector('#state'),search=document.querySelector('#search');
const rows=[...document.querySelectorAll('[data-row]')].map(el=>({el,text:el.textContent.toLocaleLowerCase()}));
function filter(){let count=0;for(const row of rows){const show=(!language.value||row.el.dataset.lang===language.value)&&(!chapter.value||row.el.dataset.file===chapter.value)&&(!kind.value||row.el.dataset.categories.split(' ').includes(kind.value))&&(!state.value||row.el.dataset.state===state.value)&&(!search.value||row.text.includes(search.value.toLocaleLowerCase()));row.el.hidden=!show;if(show)count++;}for(const section of document.querySelectorAll('[data-chapter]'))section.hidden=![...section.querySelectorAll('[data-row]')].some(row=>!row.hidden);document.querySelector('#count').textContent=count+' review blocks shown';}
for(const control of[language,chapter,kind,state,search])control.addEventListener('input',filter);filter();
</script></body></html>`;
  writeFileSync(path(`${directory}/index.html`), html);
  for (const lang of new Set(chapters.map(c => c.lang))) {
    const lines = ['# Exact narration inputs', '', `Language: ${lang}. Plan: ${plan.planHash}. Read-only draft.`, ''];
    for (const chapter of chapters.filter(c => c.lang === lang)) {
      lines.push(`## ${chapter.title}`, '');
      for (const row of chapter.rows) {
        lines.push(`### ${label[row.kind] ?? row.kind}: ${chapter.id}/${row.id}`, '', `Source: ${row.sourceFile}, ${row.sourceReference}`, '');
        if (row.kind !== 'omitted') lines.push(`Status: ${row.state === 'generated' ? 'generated audio available' : 'needs generation'}`, '');
        if (row.pause) lines.push(`Playback: insert ${row.pause.seconds} seconds of silence after “${row.pause.after}” during offline assembly. This is not API input text.`, '');
        if (row.previousText) lines.push('Previous generated script:', '', row.previousText, '');
        if (!row.units.length) lines.push(`Not narrated: ${row.reason}`, '');
        for (const unit of row.units) {
          const fence = '`'.repeat(Math.max(3, ...[...unit.text.matchAll(/`+/g)].map(m => m[0].length + 1)));
          lines.push(`Request: ${unit.id} (${unit.text.length} characters)`, '', `${fence}text`, unit.text, fence, '');
        }
      }
    }
    writeFileSync(path(`${directory}/scripts-${lang}.md`), lines.join('\n'));
  }
  console.log(`Proofreading snapshot: ${directory}/index.html\n${plan.chapters.length} chapters; ${plan.characters} characters; ${chapters.reduce((n, c) => n + c.rows.filter(r => !r.units.length).length, 0)} explicitly excluded items. No API calls.`);
  return { chapters, html };
}
