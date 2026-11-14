// Sentence IDs are read-along locations within a persistent narration block.
// They are NOT generation/cache identities and never change the spoken script.
export function sentenceSpans(text, lang, blockId) {
  return [...new Intl.Segmenter(lang, { granularity: 'sentence' }).segment(text)].flatMap(({ segment, index }) => {
    const trimmed = segment.trim();
    if (!trimmed) return [];
    const startOffset = index + segment.indexOf(trimmed);
    return [{ text: trimmed, startOffset, endOffset: startOffset + trimmed.length }];
  }).map((sentence, index) => ({ ...sentence, id: `${blockId}-s${index + 1}` }));
}

// Compare exact visible prose, allowing only typography and whitespace changes.
// Keep UTF-16 source offsets so spans can cross emphasis/links without flattening.
function canonical(text) {
  let value = '';
  const positions = [];
  let offset = 0;
  for (const char of text) {
    const start = offset;
    offset += char.length;
    if (/\s/u.test(char)) {
      if (value && !value.endsWith(' ')) { value += ' '; positions.push({ start, end: offset }); }
      else if (value.endsWith(' ')) positions.at(-1).end = offset;
      continue;
    }
    const normalized = /[“”„]/u.test(char) ? '"' : /[‘’‚]/u.test(char) ? "'" : char;
    value += normalized;
    for (let i = 0; i < normalized.length; i++) positions.push({ start, end: offset });
  }
  if (value.endsWith(' ')) { value = value.slice(0, -1); positions.pop(); }
  return { value, positions };
}

export function markSentenceHooks(tree, blocks, lang) {
  const lookup = new Map(blocks.map(b => [b.id, b]));
  function visit(node) {
    for (const child of node.children ?? []) visit(child);
    if (node.type !== 'element' || !node.properties?.dataAudioBlock) return;
    for (const id of String(node.properties.dataAudioBlock).split(' ')) {
      const block = lookup.get(id);
      // Chapter titles are narrated as “Chapter N: …”, not the displayed “N. …”.
      // Keep block-level cue matching, but paint only the inline heading text.
      if (block?.kind === 'heading' && /^h[1-6]$/.test(node.tagName) &&
          (block.adaptation || block.spoken !== block.text || block.submitted !== block.text)) {
        if (!node.children.some(child => child.properties?.dataAudioHeading !== undefined)) {
          node.children = [{ type: 'element', tagName: 'span', properties: { dataAudioHeading: '' }, children: node.children }];
        }
        continue;
      }
      if (!block || block.adaptation || block.spoken !== block.text || block.submitted !== block.text) continue;
      const leaves = [];
      let visible = '';
      function collect(child) {
        if (child !== node && child.type === 'element' && (child.properties?.dataAudioBlock !== undefined ||
            child.properties?.dataHeadingAnchor !== undefined || child.properties?.ariaHidden === 'true' || ['script', 'style'].includes(child.tagName))) return;
        if (child.type === 'text') { leaves.push({ node: child, start: visible.length, end: visible.length + child.value.length }); visible += child.value; }
        else for (const nested of child.children ?? []) collect(nested);
      }
      collect(node);
      const actual = canonical(visible);
      const expected = canonical(block.submitted);
      if (actual.value !== expected.value) continue; // Non-verbatim passages use block highlighting instead.
      const ranges = sentenceSpans(block.submitted, lang, id).map(sentence => {
        const first = expected.positions.findIndex(p => p.end > sentence.startOffset);
        let last = first;
        while (last + 1 < expected.positions.length && expected.positions[last + 1].start < sentence.endOffset) last++;
        return { id: sentence.id, start: actual.positions[first].start, end: actual.positions[last].end };
      });
      const replacements = new Map();
      for (const leaf of leaves) {
        const children = [];
        let cursor = leaf.start;
        for (const range of ranges) {
          const start = Math.max(range.start, leaf.start);
          const end = Math.min(range.end, leaf.end);
          if (end <= start) continue;
          if (start > cursor) children.push({ type: 'text', value: visible.slice(cursor, start) });
          children.push({ type: 'element', tagName: 'span', properties: { dataAudioSentence: range.id }, children: [{ type: 'text', value: visible.slice(start, end) }] });
          cursor = end;
        }
        if (cursor < leaf.end) children.push({ type: 'text', value: visible.slice(cursor, leaf.end) });
        replacements.set(leaf.node, children);
      }
      function replace(parent) {
        if (!parent.children) return;
        parent.children = parent.children.flatMap(child => {
          if (replacements.has(child)) return replacements.get(child);
          replace(child);
          return [child];
        });
      }
      replace(node);
    }
  }
  visit(tree);
}
