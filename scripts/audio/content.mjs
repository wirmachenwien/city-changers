// One AST contract for extraction and rendered MDX hooks. Never evaluates MDX JS.
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import remarkGfm from 'remark-gfm';
import { parse as parseYaml } from 'yaml';
import { createHash } from 'node:crypto';

export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export const clean = text => text.replace(/\s+/gu, ' ').trim();
export function literal(node) {
  if (!node) return undefined;
  if (node.type === 'Literal') return node.value;
  if (node.type === 'ArrayExpression') return node.elements.map(literal);
  if (node.type === 'ObjectExpression') return Object.fromEntries(node.properties.map(p => {
    if (p.type !== 'Property' || p.computed) throw new Error('Dynamic MDX property requires an audio override');
    return [p.key.name ?? p.key.value, literal(p.value)];
  }));
  throw new Error(`Dynamic MDX expression (${node.type}) requires editorial handling`);
}
export function attr(node, name) {
  const value = node.attributes?.find(a => a.name === name)?.value;
  return typeof value === 'string' ? value : value?.data?.estree ? literal(value.data.estree.body[0].expression) : undefined;
}
export function text(node) {
  if (['text', 'inlineCode'].includes(node.type)) return node.value;
  if (node.type === 'image') return node.alt ?? '';
  if (node.name === 'Footnote') return ''; // Preserve the host paragraph's established source identity.
  if (node.type?.includes('Expression')) {
    if (!node.data?.estree?.body?.length) return '';
    return String(literal(node.data.estree.body[0].expression));
  }
  const blockContainer = ['root', 'list', 'listItem', 'blockquote', 'mdxJsxFlowElement'].includes(node.type);
  return (node.children ?? []).map(text).join(blockContainer ? ' ' : '');
}
const wrappers = new Set(['FeatureBox', 'MascotBox', 'Accordion', 'PullQuote', 'ExpandableBox', 'TableWrap', 'Slideshow']);
const blockComponents = new Set([...wrappers, 'Figure', 'Question', 'Glossary', 'Bibliography']);
const containsFootnote = node => node.name === 'Footnote' || (node.children ?? []).some(containsFootnote);
const unsupportedListComponent = node => ['Question', 'Glossary'].includes(node.name) || wrappers.has(node.name)
  ? node.name : (node.children ?? []).map(unsupportedListComponent).find(Boolean);
const hasInlineContent = nodes => clean(nodes.map(text).join('')) || nodes.some(containsFootnote);

// Lists are prose, not containers for standalone quizzes or block components.
// Validate nested items too: recursive narration does not visit walk() again.
function validateListItems(node) {
  if (node.type === 'listItem') {
    const line = node.position.start.line;
    const component = unsupportedListComponent(node);
    if (component) throw new Error(`${wrappers.has(component) ? 'Block component' : component} inside a list item at line ${line} requires editorial handling`);
    if (containsFootnote(node) && !clean(text(node))) throw new Error(`Footnote-only list item at line ${line} requires editorial handling`);
  }
  for (const child of node.children ?? []) validateListItems(child);
}

// MDX parses adjacent one-line components as JSX *text* elements inside one
// paragraph. Canonicalize those into genuine blocks in BOTH pipelines, so
// component titles are not lost and hooks survive Astro's paragraph unwrapping.
function normalizeBlocks(parent) {
  if (!parent.children) return;
  parent.children = parent.children.flatMap(node => {
    if (node.type === 'paragraph' && node.children.some(c => blockComponents.has(c.name))) {
      const result = [];
      let inline = [];
      const flush = () => {
        if (inline.length && hasInlineContent(inline)) result.push({ type: 'paragraph', children: inline, position: { start: inline[0].position.start, end: inline.at(-1).position.end } });
        inline = [];
      };
      for (const child of node.children) {
        if (blockComponents.has(child.name)) {
          flush();
          child.type = 'mdxJsxFlowElement';
          result.push(child);
        } else inline.push(child);
      }
      flush();
      result.forEach(normalizeBlocks);
      return result;
    }
    normalizeBlocks(node);
    return [node];
  });
  if (parent.type === 'mdxJsxFlowElement' && wrappers.has(parent.name)) {
    const result = [];
    let inline = [];
    const flush = () => {
      if (inline.length && hasInlineContent(inline)) result.push({ type: 'paragraph', children: inline, position: { start: inline[0].position.start, end: inline.at(-1).position.end } });
      inline = [];
    };
    for (const child of parent.children) {
      if (['text', 'strong', 'emphasis', 'link', 'inlineCode', 'mdxJsxTextElement', 'mdxTextExpression'].includes(child.type)) inline.push(child);
      else { flush(); result.push(child); }
    }
    flush();
    parent.children = result;
  }
}
const referenceHeadings = /^(materials|sources|references|bibliography|video|materialien|quellen|literatur|materiali|viri|literatura|gradiva|videoposnetek)$/iu;
const reflection = {
  en: ['Reflection question.', 'Pause to think.', 'Answer:'],
  de: ['Frage zum Nachdenken.', 'Nimm dir einen Moment Zeit.', 'Antwort:'],
  sl: ['Vprašanje za razmislek.', 'Vzemite si trenutek za razmislek.', 'Odgovor:'],
};

// Identify the one editorially approved diagram by asset, not translated alt text.
export function shouldNarrateFigure(node) {
  const src = node.type === 'image' ? node.url : attr(node, 'src');
  return typeof src === 'string' && src.replaceAll('\\', '/').split(/[?#]/)[0].split('/').at(-1) === 'spectrum-of-allies.png';
}
const counters = {
  en: ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth'],
  de: ['Erstens', 'Zweitens', 'Drittens', 'Viertens', 'Fünftens', 'Sechstens', 'Siebtens', 'Achtens', 'Neuntens', 'Zehntens', 'Elftens', 'Zwölftens', 'Dreizehntens', 'Vierzehntens', 'Fünfzehntens', 'Sechzehntens', 'Siebzehntens', 'Achtzehntens', 'Neunzehntens', 'Zwanzigstens'],
  sl: ['Prvič', 'Drugič', 'Tretjič', 'Četrtič', 'Petič', 'Šestič', 'Sedmič', 'Osmič', 'Devetič', 'Desetič', 'Enajstič', 'Dvanajstič', 'Trinajstič', 'Štirinajstič', 'Petnajstič', 'Šestnajstič', 'Sedemnajstič', 'Osemnajstič', 'Devetnajstič', 'Dvajsetič'],
};
export function spokenCounter(number, lang) {
  return counters[lang][number - 1] ?? `${{ en: 'Number', de: 'Punkt', sl: 'Točka' }[lang]} ${number}`;
}
function narrationText(node, lang) {
  if (node.type === 'break') return ' ';
  if (node.name === 'Figure') return shouldNarrateFigure(node) ? attr(node, 'alt') ?? '' : '';
  if (node.name === 'Bibliography') return '';
  if (node.name === 'Footnote') return ` ${attr(node, 'text') ?? (node.children ?? []).map(child => narrationText(child, lang)).join(' ')} `;
  if (node.type === 'image') return shouldNarrateFigure(node) ? node.alt ?? '' : '';
  if (node.type === 'list') return node.children.map((item, index) => `${node.ordered ? `${spokenCounter((node.start ?? 1) + index, lang)}. ` : ''}${narrationText(item, lang)}`).join(' ');
  if (node.children) {
    const separator = ['root', 'listItem', 'blockquote', 'mdxJsxFlowElement'].includes(node.type) ? ' ' : '';
    return node.children.map(child => narrationText(child, lang)).join(separator);
  }
  return text(node);
}
export function spokenAttribution(cite, lang) {
  const [speaker, ...organization] = cite.split(',').map(part => part.trim());
  const company = organization.join(', ');
  const prefix = { en: 'says', de: 'sagt', sl: 'pravi' }[lang];
  const connector = { en: 'from', de: 'von', sl: 'iz organizacije' }[lang];
  return `${prefix} ${speaker}${company ? ` ${connector} ${company}` : ''}.`;
}

export function extractTree(tree, lang, glossary) {
  normalizeBlocks(tree);
  const blocks = [];
  let referenceDepth = 0;
  const add = (node, kind, spoken, adaptation = false, extra = {}) => {
    spoken = clean(spoken);
    if (!spoken) return;
    const { identityText = spoken, ...metadata } = extra;
    const fingerprint = hash({ kind, spoken: clean(identityText) });
    blocks.push({ node, kind, text: spoken, adaptation, fingerprint, line: node.position?.start.line ?? 0, ...metadata });
  };
  function walk(node) {
    if (node.type === 'heading') {
      if (!referenceDepth || node.depth <= referenceDepth) referenceDepth = referenceHeadings.test(clean(text(node))) ? node.depth : 0;
      if (!referenceDepth) {
        const sourceTitle = clean(text(node));
        const spokenTitle = clean(narrationText(node, lang));
        const chapter = node.depth === 1 ? sourceTitle.match(/^(\d+)\.\s+(.+)$/u) : null;
        if (chapter) {
          const number = Number(chapter[1]);
          const prefix = { en: 'Chapter', de: 'Kapitel', sl: 'Poglavje' }[lang];
          add(node, 'heading', sourceTitle, true, { chapterNumber: number, narration: `${prefix} ${number}: ${spokenTitle.replace(/^\d+\.\s+/u, '')}` });
        } else add(node, 'heading', sourceTitle, spokenTitle !== sourceTitle, spokenTitle !== sourceTitle ? { narration: spokenTitle } : {});
      }
      return;
    }
    if (referenceDepth || node.name === 'Bibliography' || node.type === 'mdxjsEsm') return;
    if (node.name === 'Footnote') {
      add(node, 'footnote', attr(node, 'text') ?? (node.children ?? []).map(text).join(' '));
      return;
    }
    if (node.name === 'Glossary') {
      for (const entry of glossary[lang] ?? []) add(node, 'glossary', `${entry.term}. ${entry.definition}`, false, { term: entry.term });
      return;
    }
    if (node.name === 'Figure') {
      const alt = attr(node, 'alt');
      if (shouldNarrateFigure(node) && alt) add(node, 'visual', alt, true);
      return;
    }
    if (node.name === 'Question') {
      const options = attr(node, 'options') ?? [];
      const indices = [].concat(attr(node, 'answer') ?? [], attr(node, 'answers') ?? []);
      const labels = options.map(o => typeof o === 'string' ? o : o.label);
      const correct = labels.filter((_, i) => indices.includes(i) || options[i]?.correct);
      if (!correct.length) throw new Error(`Question without an extractable answer at line ${node.position.start.line}`);
      const [intro, pause, answer] = reflection[lang];
      const script = thinkingPrompt => `${intro} ${attr(node, 'question')} ${labels.join('. ')}. ${thinkingPrompt} ${answer} ${correct.join('. ')}. ${attr(node, 'feedbackCorrect') ?? ''}`;
      // Preserve the established source/block identity only; the old formal
      // prompt is never included in the narration text or submitted API input.
      const identityText = script(lang === 'de' ? 'Nehmen Sie sich einen Moment Zeit.' : pause);
      add(node, 'quiz', script(pause), true, { identityText, reflectionPauseAfter: pause });
      return;
    }
    if (node.type === 'table') {
      const [header, ...rows] = node.children;
      const labels = header.children.map(text);
      const spokenLabels = header.children.map(cell => clean(narrationText(cell, lang)));
      const spokenRows = rows.map(row => clean(row.children.map((cell, i) => `${spokenLabels[i]}: ${narrationText(cell, lang)}.`).join(' ')));
      // Keep source identity separate from the spoken rendering: blank-line
      // changes must not allocate a new persistent table/block identity.
      add(node, 'table', rows.map(row => row.children.map((cell, i) => `${labels[i]}: ${text(cell)}.`).join(' ')).join(' '), true, { narration: spokenRows.join('\n\n') });
      return;
    }
    if (node.type === 'list') {
      validateListItems(node);
      node.children.forEach((item, index) => {
        const number = (node.start ?? 1) + index;
        const narration = clean(`${node.ordered ? `${spokenCounter(number, lang)}. ` : ''}${narrationText(item, lang)}`);
        const identity = clean(text(item));
        if (narration) add(item, 'list', identity, node.ordered || narration !== identity, { narration, ordered: Boolean(node.ordered), ...(node.ordered ? { counter: number } : {}) });
      });
      return;
    }
    if (node.type === 'listItem' || node.type === 'paragraph') {
      const narration = clean(narrationText(node, lang));
      const identity = clean(text(node)) || narration;
      if (narration) add(node, node.type === 'listItem' ? 'list' : 'paragraph', identity, narration !== identity, { narration });
      return;
    }
    if (wrappers.has(node.name)) {
      const title = attr(node, 'title');
      if (title) add(node, 'callout-title', title);
      for (const child of node.children ?? []) walk(child);
      if (node.name === 'PullQuote' && attr(node, 'cite')) add(node, 'attribution', attr(node, 'cite'), true, { narration: spokenAttribution(attr(node, 'cite'), lang) });
      return;
    }
    if (node.type === 'thematicBreak' || node.type === 'definition') return;
    if (node.name && !['Spoiler', 'Footnote'].includes(node.name)) throw new Error(`Unsupported audio component ${node.name}`);
    for (const child of node.children ?? []) walk(child);
  }
  walk(tree);
  return blocks;
}

export function parseSource(source, lang, glossary) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) throw new Error('Expected YAML frontmatter');
  // Preserve positions in the original MDX, including frontmatter lines.
  const body = match[0].replace(/[^\n]/g, ' ') + source.slice(match[0].length);
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMdx).parse(body);
  return { title: parseYaml(match[1]).title, blocks: extractTree(tree, lang, glossary), tree };
}

// Exact unique matches are preferred. A replacement between unchanged anchors
// keeps its old ID when both sides pair one-to-one by kind; this preserves
// read-along identity and makes previous audio visible after a text edit.
// Duplicate passages, moves and count-changing insertions still use explicit
// bindings or a new identity. Never fuzzy-match wording.
export function identify(blocks, previous = [], bindings = {}) {
  const used = new Set();
  const currentCounts = new Map();
  for (const block of blocks) currentCounts.set(block.fingerprint, (currentCounts.get(block.fingerprint) ?? 0) + 1);
  const previousCounts = new Map();
  for (const block of previous) previousCounts.set(block.fingerprint, (previousCounts.get(block.fingerprint) ?? 0) + 1);
  const previousIndex = new Map(previous.map((block, index) => [block.id, index]));
  const occurrences = new Map();
  const result = blocks.map(block => {
    const matches = previous.filter(p => p.fingerprint === block.fingerprint && !used.has(p.id));
    const occurrence = (occurrences.get(block.fingerprint) ?? 0) + 1;
    occurrences.set(block.fingerprint, occurrence);
    const key = `${block.fingerprint}:${occurrence}`;
    let id = bindings[key];
    let identityReview = false;
    if (!id && matches.length === 1 && currentCounts.get(block.fingerprint) === 1) id = matches[0].id;
    if (id) {
      if (used.has(id)) throw new Error(`Duplicate audio block identity ${id}`);
      used.add(id);
    }
    return { ...block, id: id ?? null, bindingKey: key, identityReview };
  });
  // Pair contiguous replacements only when the old and new runs have the same
  // size, the same kinds, unique fingerprints, and known unchanged anchors.
  const anchor = result.map(block => block.id ? previousIndex.get(block.id) ?? -1 : -1);
  let index = 0;
  while (index < result.length) {
    if (result[index].id) { index++; continue; }
    let end = index;
    while (end < result.length && !result[end].id) end++;
    const beforeKnown = index === 0 || anchor[index - 1] >= 0;
    const afterKnown = end === result.length || anchor[end] >= 0;
    if (beforeKnown && afterKnown) {
      const before = index === 0 ? -1 : anchor[index - 1];
      const after = end === result.length ? previous.length : anchor[end];
      if (before < after) {
        const candidates = previous.slice(before + 1, after).filter(block => !used.has(block.id));
        const replaceable = candidates.length === end - index && candidates.length > 0 &&
          candidates.every((old, offset) => old.kind === result[index + offset].kind &&
            currentCounts.get(result[index + offset].fingerprint) === 1 && previousCounts.get(old.fingerprint) === 1);
        if (replaceable) {
          candidates.forEach((old, offset) => {
            result[index + offset].id = old.id;
            result[index + offset].identityReview = true;
            anchor[index + offset] = previousIndex.get(old.id);
            used.add(old.id);
          });
        }
      }
    }
    index = end;
  }
  for (const block of result) {
    if (block.id) continue;
    block.id = `b-${hash(block.bindingKey).slice(0, 16)}`;
    // An edited block can retain an ID derived from wording that later returns.
    // Only generated IDs may be disambiguated; explicit conflicts fail above.
    for (let occurrence = 1; used.has(block.id); occurrence++) {
      block.id = `b-${hash({ bindingKey: block.bindingKey, occurrence }).slice(0, 16)}`;
    }
    block.identityReview = previous.length > 0;
    used.add(block.id);
  }
  return result;
}

export function splitText(value, lang, limit) {
  const sentences = [...new Intl.Segmenter(lang, { granularity: 'sentence' }).segment(value)].map(s => s.segment);
  const units = [];
  let current = '';
  for (const sentence of sentences) {
    if (sentence.length > limit) throw new Error('Sentence exceeds endpoint limit; add a reviewed audio override with natural breaks');
    if ((current + sentence).length > limit) { units.push(current.trim()); current = ''; }
    current += sentence;
  }
  if (current.trim()) units.push(current.trim());
  return units;
}
