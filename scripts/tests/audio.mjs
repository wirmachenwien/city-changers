import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseHTML } from 'linkedom';
import { hash, parseSource, identify, splitText, spokenCounter } from '../audio/content.mjs';
import { makePlan, movedIds, path, registryFor } from '../audio/plan.mjs';
import { audioPublication } from '../../src/lib/audio-publication.mjs';
import { validateCues, validateAlignment } from '../audio/media.mjs';
import remarkAudioBlocks from '../../src/lib/remark-audio-blocks.mjs';
const source = body => `---\ntitle: Test\nlang: en\n---\n${body}`;
const extract = body => parseSource(source(body), 'en', { en: [{ term: 'Test', definition: 'A definition.' }] }).blocks;

test('extracts labelled tables, link labels, prose, list and callouts, not raw URLs', () => {
  const blocks = extract('# Title\n\n[Label](https://example.com) and **prose**.\n\n- One\n- Two\n\n| City | Measure |\n| --- | --- |\n| Vienna | Planters |\n\n<FeatureBox title="Check">\n\nImportant.\n\n</FeatureBox>');
  assert.ok(blocks.some(b => b.kind === 'table' && b.text === 'City: Vienna. Measure: Planters.'));
  assert.equal(blocks.filter(b => b.kind === 'list').length, 2);
  assert.ok(blocks.some(b => b.kind === 'callout-title' && b.text === 'Check'));
  assert.ok(!JSON.stringify(blocks.map(b => b.text)).includes('https://'));
});
test('numbered chapter headings use localized chapter prefixes without changing source IDs or subheadings', () => {
  for (const [lang, prefix] of [['en', 'Chapter'], ['de', 'Kapitel'], ['sl', 'Poglavje']]) {
    const blocks = parseSource(source('# 2. Die Kraft der Superblocks\n\n## 2. A subsection\n\n# Unnumbered heading'), lang, {}).blocks;
    assert.equal(blocks[0].narration, `${prefix} 2: Die Kraft der Superblocks`);
    assert.equal(blocks[0].chapterNumber, 2);
    assert.equal(blocks[0].text, '2. Die Kraft der Superblocks');
    assert.equal(blocks[0].fingerprint, hash({ kind: 'heading', spoken: '2. Die Kraft der Superblocks' }));
    assert.equal(blocks[1].narration, undefined);
    assert.equal(blocks[2].narration, undefined);
  }
});
test('Markdown hard breaks separate narration words without changing source identities', () => {
  for (const lang of ['en', 'de', 'sl']) {
    for (const separator of ['  \n', '\\\n']) {
      for (const body of [`foo${separator}bar`, `- foo${separator}  bar`, `> foo${separator}> bar`, `**foo**${separator}[bar](https://example.com)`]) {
        const block = parseSource(source(body), lang, {}).blocks[0];
        assert.equal(block.text, 'foobar');
        assert.equal(block.narration, 'foo bar');
        assert.equal(block.adaptation, true);
        const original = parseSource(source(block.kind === 'list' ? '- foobar' : 'foobar'), lang, {}).blocks[0];
        assert.equal(block.fingerprint, original.fingerprint);
        assert.equal(identify([block])[0].id, identify([original])[0].id);
      }
    }
  }
});
test('heading footnotes are read in place while source identities and chapter prefixes stay stable', () => {
  for (const [lang, prefix] of [['en', 'Chapter'], ['de', 'Kapitel'], ['sl', 'Poglavje']]) {
    for (const heading of ['# 2. Heading', '## Heading', '# Heading']) {
      for (const note of ['<Footnote text="Read this note." />', '<Footnote>Read this note.</Footnote>']) {
        const plain = identify(parseSource(source(`${heading} ending`), lang, {}).blocks)[0];
        const noted = identify(parseSource(source(`${heading} ${note} ending`), lang, {}).blocks)[0];
        assert.equal(noted.id, plain.id);
        assert.equal(noted.fingerprint, plain.fingerprint);
        assert.equal(noted.text, plain.text);
        assert.equal(noted.narration, `${heading.startsWith('# 2.') ? `${prefix} 2: ` : ''}Heading Read this note. ending`);
        assert.equal(noted.adaptation, true);
      }
    }
  }
});
test('questions inside list items fail with a source location instead of losing quiz narration', () => {
  const question = '<Question question="Why?" options={["Yes"]} answer={0} />';
  for (const body of [`- ${question}`, `1. ${question}`, `- Parent\n  - ${question}`]) {
    assert.throws(() => extract(body), /Question inside a list item at line 5 requires editorial handling/);
  }
  assert.ok(extract(question).some(block => block.kind === 'quiz'));
  assert.equal(extract('- Ordinary item.')[0].narration, 'Ordinary item.');
});
test('adjacent inline MDX components preserve titles and include only the approved semicircle figure', () => {
  const blocks = extract('<Accordion title="First">One.</Accordion>\n<Accordion title="Second">Two.</Accordion>\n\n<Slideshow>\n<Figure alt="Excluded visual." src="x.jpg">Photo: Person.</Figure>\n<Figure alt="Allowed semicircle." src="spectrum-of-allies.png">Photo: Other.</Figure>\n</Slideshow>');
  assert.deepEqual(blocks.map(b => b.text), ['First', 'One.', 'Second', 'Two.', 'Allowed semicircle.']);
  assert.deepEqual(extract('![Excluded Markdown figure](image.jpg)'), []);
});
test('ordered lists speak localized counters including starts/nesting without changing source identity', () => {
  for (const [lang, first, second] of [['en', 'First', 'Second'], ['de', 'Erstens', 'Zweitens'], ['sl', 'Prvič', 'Drugič']]) {
    const parsed = parseSource(source('1. One\n2. Two\n\n5. Five\n6. Six'), lang, {});
    assert.equal(parsed.blocks[0].narration, `${first}. One`);
    assert.equal(parsed.blocks[1].narration, `${second}. Two`);
    assert.equal(parsed.blocks[0].text, 'One');
    assert.equal(parsed.blocks[0].fingerprint, hash({ kind: 'list', spoken: 'One' }));
  }
  const restarted = extract('5. Five\n6. Six');
  assert.equal(restarted[0].narration, 'Fifth. Five');
  const nested = extract('- Outer\n  1. Inner one\n  2. Inner two');
  assert.match(nested[0].narration, /First\. Inner one Second\. Inner two/);
  assert.equal(extract('- Unordered')[0].narration, 'Unordered');
});
test('spoken tables retain two newlines per row boundary and attributed quotes become natural phrases', () => {
  const table = extract('| City | Measure |\n| --- | --- |\n| Vienna | Planters |\n| Berlin | Filters |').find(b => b.kind === 'table');
  assert.equal(table.narration, 'City: Vienna. Measure: Planters.\n\nCity: Berlin. Measure: Filters.');
  assert.equal(table.fingerprint, hash({ kind: 'table', spoken: 'City: Vienna. Measure: Planters. City: Berlin. Measure: Filters.' }));
  for (const [lang, expected] of [['en', 'says Valentina from Changing Cities.'], ['de', 'sagt Valentina von Changing Cities.'], ['sl', 'pravi Valentina iz organizacije Changing Cities.']]) {
    const quote = parseSource(source('<PullQuote cite="Valentina, Changing Cities">\n\nA quotation.\n\n</PullQuote>'), lang, {}).blocks;
    assert.equal(quote.at(-1).narration, expected);
    assert.equal(quote.at(-1).text, 'Valentina, Changing Cities');
    assert.equal(quote[0].text, 'A quotation.');
  }
  assert.equal(extract('<PullQuote>\n\nUnattributed.\n\n</PullQuote>').length, 1);
});
test('quiz adaptation, glossary shared data, text-only references, unknown components fail closed', () => {
  const blocks = extract('<Question question="Why?" options={[{label:"Yes",correct:true},{label:"No"}]} />\n\n<Glossary lang="en" />\n\n## Materials\n\nDo not read this.');
  assert.match(blocks[0].text, /Reflection question.*Pause to think.*Answer: Yes/);
  assert.equal(blocks[1].text, 'Test. A definition.');
  assert.equal(blocks.length, 2);
  assert.throws(() => extract('<UnknownThing />'), /Unsupported/);
  assert.throws(() => extract('<Question question={executeCode()} options={["Yes"]} answer={0} />'), /Dynamic/);
});
test('German reflection questions use informal address and preserve third-person sie and block identities', () => {
  const blocks = parseSource(source('Sie verbindet Erfahrungen.\n\n<Question question="Warum?" options={["Ja"]} answer={0} />'), 'de', {}).blocks;
  assert.equal(blocks[0].text, 'Sie verbindet Erfahrungen.');
  assert.match(blocks[1].text, /Nimm dir einen Moment Zeit\./);
  assert.doesNotMatch(blocks[1].text, /Nehmen Sie|Ihnen/);
  const legacyIdentity = blocks[1].text.replace('Nimm dir einen Moment Zeit.', 'Nehmen Sie sich einen Moment Zeit.');
  assert.equal(blocks[1].fingerprint, hash({ kind: 'quiz', spoken: legacyIdentity }));
  const quizzes = makePlan().chapters.filter(c => c.lang === 'de').flatMap(c => c.blocks.filter(b => b.kind === 'quiz'));
  assert.ok(quizzes.length > 0);
  assert.ok(quizzes.every(b => b.submitted.includes('Nimm dir einen Moment Zeit.') && !b.submitted.includes('Nehmen Sie')));
});
test('stable IDs survive insertions, URL-only edits, moves and in-place replacements', () => {
  assert.deepEqual(extract('## A bold word.\n\nAn example.').map(b => b.text), extract('## A **bold** word.\n\nAn [example](https://example.com).').map(b => b.text));
  const first = identify(extract('First.\n\n[Second](https://old.example).'));
  const inserted = identify(extract('New.\n\nFirst.\n\n[Second](https://new.example).'), first);
  assert.equal(inserted[1].id, first[0].id);
  assert.equal(inserted[2].id, first[1].id);
  assert.equal(inserted[0].identityReview, true);
  assert.equal(movedIds(first.map(b => b.id), inserted.map(b => b.id)).size, 0);
  const changed = identify(extract('Edited.\n\nSecond.'), first);
  assert.equal(changed[0].id, first[0].id);
  assert.equal(changed[1].id, first[1].id);
  assert.equal(changed[0].identityReview, true);
  const bound = identify(extract('Edited.\n\nSecond.'), first, { [changed[0].bindingKey]: first[0].id });
  assert.equal(bound[0].id, first[0].id);
  assert.equal(bound[0].identityReview, false);
  assert.equal(movedIds(['a', 'b', 'c'], ['c', 'a', 'b']).size, 1);
});
test('duplicate passages do not silently steal identities', () => {
  const initial = identify(extract('Same.\n\nSame.'));
  const next = identify(extract('Same.\n\nSame.'), initial);
  assert.ok(next.every(b => b.identityReview));
  assert.throws(() => identify(extract('A.\n\nB.'), [], Object.fromEntries(identify(extract('A.\n\nB.')).map(b => [b.bindingKey, 'same']))), /Duplicate/);
});
test('returning original wording allocates unused deterministic IDs after registry round trips', () => {
  const persist = blocks => JSON.parse(JSON.stringify(registryFor({ chapters: [{ id: 'en/test', blocks }] }))).chapters['en/test'];
  const original = persist(identify(extract('A.')));
  const edited = persist(identify(extract('Edited.'), original));
  assert.equal(edited[0].id, original[0].id);
  const body = 'Edited.\n\nA.';
  const returned = identify(extract(body), edited);
  assert.equal(returned[0].id, original[0].id);
  assert.notEqual(returned[1].id, original[0].id);
  assert.equal(returned[1].identityReview, true);
  assert.deepEqual(identify(extract(body), edited).map(b => b.id), returned.map(b => b.id));
  assert.deepEqual(identify(extract(body), persist(returned)).map(b => b.id), returned.map(b => b.id));
  // A second collision must also be skipped, including explicitly reserved IDs.
  const reserved = { [edited[0].bindingKey]: returned[1].id };
  const twice = identify(extract('Edited.\n\nA.\n\nOther.'), [], {
    ...reserved, [identify(extract('Other.'))[0].bindingKey]: original[0].id,
  });
  assert.equal(new Set(twice.map(b => b.id)).size, 3);
  assert.notEqual(twice[1].id, returned[1].id);
  assert.throws(() => identify(extract(body), edited, { [returned[1].bindingKey]: original[0].id }), /Duplicate audio block identity/);
});
test('same-line duplicate component titles have distinct deterministic occurrence keys and bindings', () => {
  const body = '<Accordion title="Same">First.</Accordion><Accordion title="Same">Second.</Accordion>';
  const first = identify(extract(body));
  const titles = first.filter(b => b.kind === 'callout-title');
  assert.equal(titles[0].line, titles[1].line);
  assert.ok(titles[0].bindingKey.endsWith(':1'));
  assert.ok(titles[1].bindingKey.endsWith(':2'));
  assert.notEqual(titles[0].id, titles[1].id);
  assert.deepEqual(identify(extract(body)).map(b => b.id), first.map(b => b.id));
  const bindings = Object.fromEntries(titles.map((b, i) => [b.bindingKey, `bound-${i}`]));
  assert.deepEqual(identify(extract(body), [], bindings).filter(b => b.kind === 'callout-title').map(b => b.id), ['bound-0', 'bound-1']);
});
test('reference headings exclude deeper subsections until a peer or ancestor heading in every language', () => {
  for (const [lang, label] of [['en', 'Materials'], ['de', 'Materialien'], ['sl', 'Gradiva']]) {
    const blocks = parseSource(source(`Before.\n\n## ${label}\n\n### Books\n\nResource.\n\n#### Notes\n\n<Footnote text="Reference note." />\n\n## Resume\n\nRead this.\n\n## ${label}\n\n### Nested\n\nHidden.\n\n# New chapter\n\nRead again.`), lang, {}).blocks;
    assert.deepEqual(blocks.map(b => b.text), ['Before.', 'Resume', 'Read this.', 'New chapter', 'Read again.'], lang);
  }
});
test('footnote-only list items are rejected, including nested items', () => {
  for (const body of ['- <Footnote text="A note." />', '1. <Footnote>A note.</Footnote>', '- Parent\n  - <Footnote text="A note." />']) {
    assert.throws(() => extract(body), /Footnote-only list item at line \d+ requires editorial handling/);
  }
});
test('block components inside lists are rejected rather than adapted for narration', () => {
  for (const name of ['FeatureBox', 'MascotBox', 'Accordion', 'PullQuote', 'ExpandableBox', 'TableWrap', 'Slideshow']) {
    assert.throws(() => extract(`- <${name}>Body.</${name}>`), /Block component inside a list item at line 5 requires editorial handling/);
  }
  assert.throws(() => extract('1. Parent\n   - <Accordion>Body.</Accordion>'), /Block component inside a list item at line 5 requires editorial handling/);
});
test('standalone glossary components are rejected inside lists', () => {
  for (const body of ['- <Glossary lang="en" />', '1. Prose <Glossary lang="en" />', '- Parent\n  - <Glossary lang="en" />']) {
    assert.throws(() => extract(body), /Glossary inside a list item at line 5 requires editorial handling/);
  }
});
test('ordinary list prose retains inline footnotes and existing identities', () => {
  for (const marker of ['-', '1.']) {
    const body = `${marker} Prose.<Footnote text="A note." />`;
    const block = extract(body)[0];
    assert.equal(block.text, 'Prose.');
    assert.equal(block.narration, `${marker === '1.' ? 'First. ' : ''}Prose. A note.`);
    assert.equal(identify([block])[0].id, identify(extract(`${marker} Prose.`))[0].id);
  }
});
test('serialized registry preserves kinds, replacement IDs and keyed overrides', () => {
  const blocks = identify(extract('First.\n\nSecond.'));
  const registry = JSON.parse(JSON.stringify(registryFor({ chapters: [{ id: 'en/test', blocks }] })));
  assert.equal(registry.chapters['en/test'][0].kind, 'paragraph');
  const edited = identify(extract('Edited.\n\nSecond.'), registry.chapters['en/test']);
  assert.equal(edited[0].id, blocks[0].id);
  const overrides = { [blocks[0].id]: 'Retained adaptation.' };
  assert.equal(overrides[edited[0].id], 'Retained adaptation.');
});
test('footnotes are narrated in place in props, inline children and flow children', () => {
  assert.equal(extract('Prose.<Footnote text="A note." />')[0].narration, 'Prose. A note.');
  assert.equal(extract('Prose.<Footnote>A note.</Footnote>')[0].narration, 'Prose. A note.');
  assert.deepEqual(extract('<Footnote>\n\nText-only aside.\n\n</Footnote>').map(b => b.text), ['Text-only aside.']);
  assert.deepEqual(extract('<Footnote text="Standalone note." />').map(b => b.text), ['Standalone note.']);
  assert.equal(identify(extract('Prose.<Footnote text="A note." />'))[0].id, identify(extract('Prose.'))[0].id);
  for (const chapter of makePlan().chapters.filter(c => c.file === '04')) {
    const source = readFileSync(`src/content/book/${chapter.id}.mdx`, 'utf8');
    const note = source.match(/<Footnote text="([^"]+)"/)[1];
    assert.ok(chapter.units.some(u => u.text.includes(note)), chapter.id);
  }
});
test('normalization preserves footnote-only runs around block components and inside wrappers', () => {
  for (const note of ['<Footnote text="Read this." />', '<Footnote>Read this.</Footnote>', '**<Footnote text="Read this." />**']) {
    const blocks = extract(`${note}<Accordion title="Details">Body.</Accordion>${note}`);
    assert.deepEqual(blocks.map(b => b.narration ?? b.text), ['Read this.', 'Details', 'Body.', 'Read this.']);
    const wrapped = extract(`<Accordion title="Details">${note}</Accordion>`);
    assert.deepEqual(wrapped.map(b => b.narration ?? b.text), ['Details', 'Read this.']);
  }
  const plain = identify(extract('Prose.<Accordion title="Details">Body.</Accordion>'));
  const noted = identify(extract('Prose.<Footnote text="Read this." /><Accordion title="Details">Body.</Accordion>'));
  assert.deepEqual(noted.map(b => b.id), plain.map(b => b.id));
});
test('inline footnotes share their host paragraph hook while standalone footnotes receive flow wrappers', () => {
  for (const body of ['Prose.<Footnote text="A note." />', '<Accordion title="Details">Prose.<Footnote text="A note." /></Accordion>', '<Footnote text="A note." />']) {
    const parsed = parseSource(source(body), 'en', {});
    const narrated = parsed.blocks.find(b => (b.narration ?? b.text).includes('A note.'));
    const expected = identify(parsed.blocks)[parsed.blocks.indexOf(narrated)];
    remarkAudioBlocks()(parsed.tree, { path: path('src/content/book/en/test.mdx') });
    if (narrated.kind === 'paragraph') {
      assert.equal(narrated.node.data.hProperties['data-audio-block'], expected.id);
      assert.ok(narrated.node.children.some(child => child.name === 'Footnote'));
    } else {
      const wrapper = parsed.tree.children.find(node => node.name === 'div');
      assert.equal(wrapper.attributes.find(attr => attr.name === 'data-audio-block').value, expected.id);
      assert.equal(wrapper.children[0].name, 'Footnote');
    }
  }
});
test('Slovenian monitoring narration uses the corrected verb without changing its block ID', () => {
  const chapter = makePlan().chapters.find(c => c.id === 'sl/05');
  const unit = chapter.units.find(u => u.blockIds.includes('b-428e41b17409970f'));
  assert.ok(unit);
  assert.match(unit.text, /da so imela nekatera/);
  assert.doesNotMatch(unit.text, /da so bila so imela/);
});
test('sentence splitting is bounded and cue offsets validate final duration and block coverage', () => {
  assert.deepEqual(splitText('First sentence. Second sentence.', 'en', 20), ['First sentence.', 'Second sentence.']);
  assert.throws(() => splitText('Unbreakable sentence.', 'en', 5), /Sentence exceeds/);
  assert.doesNotThrow(() => validateCues([{ start: 0, end: 2, blockIds: ['a'] }, { start: 2.5, end: 4, blockIds: ['b'] }], 4, ['a', 'b']));
  assert.throws(() => validateCues([{ start: 1, end: 5, blockIds: ['a'] }], 4, ['a']), /Invalid/);
  assert.throws(() => validateCues([], 4, ['a']), /Missing cue/);
});
test('v4 terminal-character overshoot is bounded and recorded without changing raw alignment', () => {
  const alignment = { characters: ['A', '.'], character_start_times_seconds: [0, .8], character_end_times_seconds: [.8, 1.08] };
  const bounded = validateAlignment(alignment, 'A.', 1);
  assert.equal(bounded.end, 1);
  assert.equal(bounded.adjustments.length, 1);
  assert.equal(alignment.character_end_times_seconds[1], 1.08, 'Raw alignment must stay unchanged');
  const terminalLetter = { ...alignment, characters: ['A', 'B'] };
  const letterBounded = validateAlignment(terminalLetter, 'AB', 1);
  assert.equal(letterBounded.end, 1);
  assert.equal(letterBounded.adjustments[0].reason, 'terminal-character-overshoot');
  assert.equal(terminalLetter.character_end_times_seconds[1], 1.08);
  const trailingPunctuation = validateAlignment({ characters: ['A', 'B', '.'], character_start_times_seconds: [0, .8, .9], character_end_times_seconds: [.8, 1.08, 1.08] }, 'AB.', 1);
  assert.equal(trailingPunctuation.end, 1);
  assert.equal(trailingPunctuation.adjustments.length, 2);
  assert.throws(() => validateAlignment({ characters: ['A', 'B', 'C'], character_start_times_seconds: [0, .8, .9], character_end_times_seconds: [.8, 1.08, 1.08] }, 'ABC', 1), /Invalid source alignment/);
  assert.throws(() => validateAlignment({ ...terminalLetter, character_start_times_seconds: [0, 1.01] }, 'AB', 1), /Invalid source alignment/);
  assert.throws(() => validateAlignment({ ...terminalLetter, character_end_times_seconds: [.8, 1.2] }, 'AB', 1), /Invalid source alignment/);
  assert.throws(() => validateAlignment({ ...alignment, character_end_times_seconds: [.8, 1.2] }, 'A.', 1), /Invalid source alignment/);
});
test('complete 21-track catalogue plan is deterministic, stable and endpoint-bounded', () => {
  const plan = makePlan();
  assert.equal(plan.chapters.length, 21);
  assert.equal(plan.planHash, makePlan().planHash);
  assert.equal(plan.requiredOutputs.m4b, 3);
  // Script approval is no longer a separate ledger; retained audio is the
  // source of truth for what can be reused.
  assert.ok(plan.chapters.every(c => c.blocks.every(b => !('approved' in b))));
  assert.ok(plan.chapters.flatMap(c => c.units).every(u => u.text.length <= 2000 && ['inserted', 'changed', 'reusable', 'moved'].includes(u.change)));
  assert.ok(plan.chapters.filter(c => c.file === 'glossary').every(c => c.blocks.filter(b => b.kind === 'glossary').length > 20));
  assert.equal(plan.characters, plan.chapters.flatMap(c => c.units).reduce((n, u) => n + u.text.length, 0));
  for (const chapter of plan.chapters) {
    const headings = chapter.blocks.filter(b => b.chapterNumber !== undefined);
    assert.equal(headings.length, 1);
    const number = chapter.file === 'glossary' ? 7 : Number(chapter.file);
    assert.ok(headings[0].submitted.startsWith(`${{ en: 'Chapter', de: 'Kapitel', sl: 'Poglavje' }[chapter.lang]} ${number}: `));
  }
  assert.equal(plan.chapters.flatMap(c => c.blocks).filter(b => b.kind === 'visual').length, 3, 'Only the semicircle diagram in each language is narrated');
  assert.ok(plan.chapters.flatMap(c => c.blocks).filter(b => b.kind === 'table').every(b => b.submitted.includes('\n\n')));
  for (const c of plan.chapters) for (const b of c.blocks.filter(b => b.ordered)) assert.ok(b.submitted.startsWith(`${spokenCounter(b.counter, c.lang)}. `));
});
test('audiobook organization credits use the canonical project writing style', () => {
  const config = JSON.parse(readFileSync('audio/config.json', 'utf8'));
  const project = JSON.parse(readFileSync('src/data/project.json', 'utf8'));
  assert.equal(config.metadata.author, project.creator);
  assert.ok(config.metadata.rights.includes(project.creator));
});
test('generation requires an explicit budget', () => {
  const result = spawnSync(process.execPath, ['scripts/audio/cli.mjs', 'generate'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--budget/);
});
test('rendered chapter hooks cover every narration block (build first)', { skip: !existsSync(path('dist/book/glossary.html')) }, () => {
  for (const c of makePlan().chapters) {
    const { document } = parseHTML(readFileSync(path(`dist${c.pageUrl}`), 'utf8'));
    const ids = [...document.querySelectorAll('[data-audio-block]')].flatMap(n => n.getAttribute('data-audio-block').split(' '));
    assert.deepEqual(c.blocks.filter(b => !ids.includes(b.id)).map(b => b.id), [], c.id);
    const published = existsSync('audio/published.json') ? JSON.parse(readFileSync('audio/published.json', 'utf8')).chapters.find(track => track.id === c.id) : undefined;
    if (!published || published.sourceHash !== c.sourceHash || published.scriptHash !== c.scriptHash || published.assemblyHash !== c.assemblyHash) {
      assert.equal(document.querySelectorAll('audio').length, 0, 'Unpublished or stale tracks must remain hidden');
    } else {
      const player = document.querySelector('[data-chapter-audio]');
      assert.ok(player, c.id);
      assert.equal(document.querySelector('h1').nextElementSibling, player, 'Player belongs immediately below the chapter title');
      assert.equal(player.querySelector('audio').hasAttribute('controls'), false, 'No native volume control');
      assert.ok(player.querySelector('[data-play-toggle]'));
      const icons = JSON.parse(readFileSync('src/data/icons.generated.json', 'utf8'));
      assert.equal(player.querySelector('.audio-icon-play svg').outerHTML, parseHTML(icons['play-out-loud']).document.querySelector('svg').outerHTML, 'Player uses the play-out-loud icon');
      assert.ok(player.querySelector('[data-timeline]').hasAttribute('hidden'), 'Timeline starts collapsed');
      assert.ok(player.querySelector('input[type="range"][data-position]'));
      assert.ok(player.querySelector('[data-speed]'));
      assert.ok(player.querySelector('[data-highlight]'));
      assert.equal(player.querySelector('[data-seek], details, a'), null, 'No old seek or download controls');
    }
  }
});

test('frontpages link to the complete localized audiobook with a simple download label', { skip: !existsSync(path('dist/index.html')) }, () => {
  const manifest = audioPublication();
  for (const lang of ['en', 'de', 'sl']) {
    const { document } = parseHTML(readFileSync(path(`dist/${lang === 'en' ? '' : `${lang}/`}index.html`), 'utf8'));
    const links = [...document.querySelectorAll('.download-buttons a')].filter(a => a.getAttribute('href').endsWith('.m4b'));
    const book = manifest.audiobooks.find(b => b.lang === lang);
    assert.equal(links.length, book ? 1 : 0, lang);
    if (book) {
      assert.equal(links[0].getAttribute('href'), book.url);
      assert.equal(links[0].hasAttribute('download'), true);
      assert.equal(links[0].querySelector('.button-link__content').textContent.trim(), { en: 'Download audiobook', de: 'Hörbuch herunterladen', sl: 'Prenesi zvočno knjigo' }[lang]);
      assert.ok(links[0].querySelector('svg[aria-hidden="true"]'));
    }
  }
});
