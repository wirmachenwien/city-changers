// Build-time enhancements run after Astro/MDX components have rendered, not
// against source Markdown. No browser DOM or client-side glossary dependency.
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import { buildGlossaryMatcher } from '../data/glossary.ts';
import { iconSvg } from './icons.ts';
import { enhanceExternalLinks } from './external-links.mjs';
import { enhanceTextLinks } from './text-link-underlines.mjs';

const SKIP_TAGS = new Set(['a', 'button', 'code', 'pre', 'dfn', 'dt', 'dd', 'script', 'style']);
const textContent = node => node.type === 'text' ? node.value
  : (node.children ?? []).map(textContent).join('');
const isDefinition = node => node.type === 'element' && node.properties?.dataDefinition !== undefined;
const findDefinition = node => isDefinition(node) ? node
  : node.children?.map(findDefinition).find(Boolean);

function highlightGlossary(tree, lang) {
  const { pattern, lookup } = buildGlossaryMatcher(lang);
  const seen = new Set();

  function walk(parent, excluded = false) {
    if (!parent.children) return;
    parent.children = parent.children.flatMap(node => {
      if (node.type === 'element') {
        // Titles neither receive automatic marks nor consume explicit terms.
        if (node.tagName === 'h1') return [node];
        const explicit = isDefinition(node) ? node
          : node.tagName === 'dfn' ? findDefinition(node) : undefined;
        if (explicit) {
          const text = textContent(explicit);
          const entry = lookup(text.trim());
          if (entry) {
            if (seen.has(entry.term)) return [{ type: 'text', value: text }];
            seen.add(entry.term);
          }
          return [node];
        }
        const classes = node.properties.className ?? [];
        walk(node, excluded || SKIP_TAGS.has(node.tagName) || classes.includes('glossary'));
        return [node];
      }
      if (excluded || node.type !== 'text') return [node];
      const result = [];
      let end = 0;
      pattern.lastIndex = 0;
      for (const match of node.value.matchAll(pattern)) {
        const entry = lookup(match[0]);
        if (!entry || seen.has(entry.term)) continue;
        seen.add(entry.term);
        if (match.index > end) result.push({ type: 'text', value: node.value.slice(end, match.index) });
        result.push({
          type: 'element', tagName: 'dfn', properties: {}, children: [{
            type: 'element', tagName: 'button',
            properties: {
              type: 'button', className: ['definition-term'],
              dataDefinition: entry.definition, title: entry.definition,
            },
            children: [{ type: 'text', value: match[0] }],
          }],
        });
        end = match.index + match[0].length;
      }
      if (!end) return [node];
      if (end < node.value.length) result.push({ type: 'text', value: node.value.slice(end) });
      return result;
    });
  }
  walk(tree);
}

/**
 * @param {string} html
 * @param {{ lang: import('../data/locales').Language, glossary?: boolean,
 *   anchorLabel?: string, external?: { site: string, notice: string } }} options
 */
export function renderProse(html, { lang, glossary = false, anchorLabel = 'Link to this section', external }) {
  const processor = unified().use(rehypeParse, { fragment: true }).use(rehypeStringify);
  const tree = processor.parse(html);
  if (glossary) highlightGlossary(tree, lang);
  visit(tree, 'element', node => {
    if (!['h2', 'h3'].includes(node.tagName) || node.properties.id === undefined) return;
    let anchored = false;
    visit(node, 'element', child => {
      if (child.properties.dataHeadingAnchor !== undefined) anchored = true;
    });
    if (anchored) return;
    node.children.push({
      type: 'element', tagName: 'a',
      properties: { href: `#${node.properties.id}`, dataHeadingAnchor: '', ariaLabel: anchorLabel },
      children: processor.parse(iconSvg('heading-anchor')).children,
    });
  });
  if (external) enhanceExternalLinks(tree, processor, external.site, external.notice);
  enhanceTextLinks(tree);
  return processor.stringify(tree);
}
