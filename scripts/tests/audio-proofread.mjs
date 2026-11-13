import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { parseHTML } from 'linkedom';
import { buildProofread, proofreadChapter } from '../audio/proofread.mjs';
import { makePlan, assets, read, path } from '../audio/plan.mjs';
import { hash } from '../audio/content.mjs';

test('proofreading exposes exact API inputs in order, component sources, audio status and explicit omissions', () => {
  const protectedFiles = ['audio/overrides.json', 'audio/blocks.json', 'audio/config.json', 'audio/published.json'];
  const snapshot = () => protectedFiles.map(file => existsSync(file) ? hash(readFileSync(file)) : null);
  const before = snapshot();
  const plan = makePlan();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Proofreading must not call an API'); };
  let report;
  try { report = buildProofread(plan); } finally { globalThis.fetch = previousFetch; }
  const { document } = parseHTML(report.html);
  const inputs = [...document.querySelectorAll('[data-request-text]')].map(node => node.textContent);
  assert.deepEqual(inputs, plan.chapters.flatMap(c => c.units.map(u => u.text)));
  assert.equal(inputs.reduce((n, text) => n + text.length, 0), plan.characters);
  assert.equal(document.querySelectorAll('[data-chapter]').length, 21);
  assert.equal(document.querySelectorAll('audio').length, 0);
  for (const image of document.querySelectorAll('img')) {
    const src = image.getAttribute('src');
    assert.ok(!src.startsWith('https:'), 'No automatic remote image loading');
    assert.ok(existsSync(resolve(path('.cache/audio/proofread'), src)));
  }
  const rows = report.chapters.flatMap(c => c.rows);
  for (const kind of ['visual', 'quiz', 'table', 'glossary', 'callout-title', 'omitted']) assert.ok(rows.some(r => r.kind === kind), kind);
  assert.ok(rows.some(r => r.componentNames.includes('Spoiler') && r.categories.includes('quiz')));
  assert.ok(rows.some(r => r.componentNames.includes('Accordion') && r.categories.includes('callout')));
  assert.ok(rows.some(r => r.kind !== 'omitted' && r.componentNames.includes('Footnote') && r.units.length));
  assert.ok(!rows.some(r => r.kind === 'omitted' && r.componentNames.includes('Footnote')));
  assert.match(document.querySelector('main').textContent, /Footnote text is read in place/);
  assert.ok(rows.some(r => r.kind === 'quiz' && r.originalHtml.includes('(correct)')));
  assert.ok(rows.every(r => ['missing', 'generated', 'omitted'].includes(r.state)));
  const retained = new Set(assets().map(asset => asset.unit.cacheKey));
  for (const row of rows.filter(row => row.units.length)) {
    assert.equal(row.state, row.units.every(unit => retained.has(unit.cacheKey)) ? 'generated' : 'missing');
  }
  assert.match(document.querySelector('main').textContent, /3-second silent pause inserted offline/);
  const controls = Object.fromEntries(['language', 'chapter', 'kind', 'state', 'search'].map(id => [id, document.querySelector(`#${id}`)]));
  // Simulate native control values; linkedom select values are getter-only.
  for (const control of Object.values(controls)) Object.defineProperty(control, 'value', { value: '', writable: true });
  runInNewContext(document.querySelector('script').textContent, { document });
  const visible = () => [...document.querySelectorAll('[data-row]')].filter(row => !row.hidden);
  const visualState = rows.find(row => row.chapterId === 'en/04' && row.kind === 'visual').state;
  controls.language.value = 'en'; controls.chapter.value = '04'; controls.kind.value = 'visual'; controls.state.value = visualState;
  controls.kind.dispatchEvent(new document.defaultView.Event('input'));
  assert.ok(visible().length > 0);
  assert.ok(visible().every(row => row.dataset.lang === 'en' && row.dataset.file === '04' && row.dataset.categories.split(' ').includes('visual') && row.dataset.state === visualState));
  assert.equal(rows.filter(row => row.kind === 'visual').length, 3);
  assert.ok(rows.some(row => row.kind === 'omitted' && row.componentNames.includes('Figure') && row.reason.includes('excluded from TTS')));
  controls.state.value = visualState === 'generated' ? 'missing' : 'generated';
  controls.state.dispatchEvent(new document.defaultView.Event('input'));
  assert.equal(visible().length, 0);
  controls.state.value = '';
  controls.state.dispatchEvent(new document.defaultView.Event('input'));
  controls.search.value = visible()[0].id;
  controls.search.dispatchEvent(new document.defaultView.Event('input'));
  assert.equal(visible().length, 1);
  assert.deepEqual(snapshot(), before);
  for (const lang of ['en', 'de', 'sl']) assert.ok(existsSync(path(`.cache/audio/proofread/scripts-${lang}.md`)));
});
test('glossary proofreading uses shared definitions and preserves catalogue term order', () => {
  const plan = makePlan();
  const glossary = read('src/data/glossary.json');
  for (const lang of ['en', 'de', 'sl']) {
    const chapter = plan.chapters.find(c => c.id === `${lang}/glossary`);
    const rows = proofreadChapter(chapter, glossary).filter(r => r.kind === 'glossary');
    assert.deepEqual(rows.map(r => r.term), glossary[lang].map(e => e.term));
    assert.ok(rows.every(r => r.sourceFile === 'src/data/glossary.json'));
  }
});
