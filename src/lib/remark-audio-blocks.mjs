import { readFileSync } from 'node:fs';
import { extractTree, identify } from '../../scripts/audio/content.mjs';

// Compile-time only. The same AST boundaries as audio:plan, before typography.
export default function remarkAudioBlocks() {
  return (tree, file) => {
    const match = String(file.path ?? file.history?.[0] ?? '').replaceAll('\\', '/').match(/\/content\/book\/(de|en|sl)\/([^/]+)\.mdx$/);
    if (!match) return;
    const [, lang, stem] = match;
    const load = name => JSON.parse(readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8'));
    const registry = load('audio/blocks.json');
    const overrides = load('audio/overrides.json');
    const id = `${lang}/${stem}`;
    const blocks = identify(extractTree(tree, lang, load('src/data/glossary.json')), registry.chapters[id], overrides.bindings[id]);
    const mapping = new Map();
    for (const block of blocks) {
      if (block.kind === 'glossary') continue; // Glossary renders per-definition hooks itself
      const ids = mapping.get(block.node) ?? [];
      ids.push(block.id);
      mapping.set(block.node, ids);
    }
    function walk(parent) {
      if (!parent.children) return;
      parent.children = parent.children.map(node => {
        walk(node);
        const ids = mapping.get(node);
        if (!ids) return node;
        if (node.type === 'mdxJsxFlowElement') return {
          type: 'mdxJsxFlowElement', name: 'div', attributes: [
            { type: 'mdxJsxAttribute', name: 'data-audio-block', value: ids.join(' ') },
            { type: 'mdxJsxAttribute', name: 'data-audio-wrapper', value: '' },
          ], children: [node],
        };
        node.data ??= {};
        node.data.hProperties = { ...node.data.hProperties, 'data-audio-block': ids.join(' ') };
        return node;
      });
    }
    walk(tree);
  };
}
