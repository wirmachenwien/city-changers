import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { parseHTML } from 'linkedom';
import { buildProofread, proofreadChapter } from '../audio/proofread.mjs';
import { makePlan, assets, read, path } from '../audio/plan.mjs';
import { hash, parseSource, identify } from '../audio/content.mjs';

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
test('split previous scripts appear once per distinct wording in HTML and Markdown', () => {
  const parent = join(tmpdir(), 'opencode');
  mkdirSync(parent, { recursive: true });
  const temp = mkdtempSync(join(parent, 'audio-previous-script-'));
  const write = (file, data) => {
    mkdirSync(join(temp, file, '..'), { recursive: true });
    writeFileSync(join(temp, file), typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
  };
  const source = '---\ntitle: Test\n---\nEdited current passage.';
  write('src/content/book/en/01.mdx', source);
  write('src/data/glossary.json', { en: [] });
  write('audio/overrides.json', { policy: 'Fixture only' });
  const [{ node, ...identified }] = identify(parseSource(source, 'en', {}).blocks);
  const block = { ...identified, spoken: identified.text, submitted: identified.text };
  const id = `en/01/${block.id}`;
  const unit = { id: `${id}/0`, blockIds: [block.id], text: block.text, cacheKey: hash('current'), change: 'changed' };
  const chapter = { id: 'en/01', lang: 'en', file: '01', title: 'Test', pageUrl: '/book/test.html', blocks: [block], units: [unit], characters: unit.text.length };
  const oldParts = ['First historical sentence. '.repeat(50).trim(), 'Second historical sentence. '.repeat(50).trim()];
  const old = oldParts.join(' ');
  assert.ok(old.length > 2000);
  const other = 'Another distinct historical script.';
  for (const [index, text] of [...oldParts, other].entries()) {
    const key = hash(`previous-${index}`);
    const audio = Buffer.from('Fixture only, not real audio');
    const originalText = index < 2 ? old : other;
    write(`.cache/audio/units/${key}/source.mp3`, audio);
    write(`.cache/audio/units/${key}/result.json`, { sourceAudioHash: hash(audio),
      unit: { id: `${id}/${index < 2 ? index : 0}`, text, originalText, cacheKey: key },
      timings: { alignment: { characters: [...text], character_start_times_seconds: [...text].map((_, i) => i * .01), character_end_times_seconds: [...text].map((_, i) => (i + 1) * .01) } } });
  }
  const plan = { chapters: [chapter], config: { modelId: 'fixture', normalization: 'auto' }, planHash: hash('fixture-plan'), characters: unit.text.length };
  write('plan.json', plan);
  const code = `import{buildProofread}from${JSON.stringify(new URL('../audio/proofread.mjs', import.meta.url).href)};import{readFileSync}from'node:fs';globalThis.fetch=()=>{throw Error('No network allowed')};buildProofread(JSON.parse(readFileSync('plan.json','utf8')));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: temp, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const { document } = parseHTML(readFileSync(join(temp, '.cache/audio/proofread/index.html'), 'utf8'));
  const comparison = [...document.querySelectorAll('details')].find(detail => detail.querySelector('summary')?.textContent === 'Previous generated script');
  const previousText = comparison.querySelector('pre').textContent;
  assert.equal(previousText.split(old).length - 1, 1);
  assert.equal(previousText.split(other).length - 1, 1);
  const markdown = readFileSync(join(temp, '.cache/audio/proofread/scripts-en.md'), 'utf8');
  assert.ok(markdown.includes(`Previous generated script:\n\n${previousText}\n`));
  assert.equal(markdown.split(old).length - 1, 1);
  assert.equal(markdown.split(other).length - 1, 1);
});
