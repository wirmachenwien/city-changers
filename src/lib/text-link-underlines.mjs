// Server-render text-only inline labels. CSS clones their background for each
// wrapped line; icons, accessible notices and measured controls stay separate.
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';

const excludedClasses = new Set(['button-link', 'copy-btn', 'share-btn', 'share', 'language-switcher', 'visual-toc', 'pagination', 'nav-list', 'contents-list', 'search-results', 'definition-term']);
const classes = node => node.properties?.className ?? [];
const blockTags = new Set(['div', 'p', 'section', 'article', 'figure', 'ul', 'ol', 'table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const hasBlock = node => node.type === 'element' && (blockTags.has(node.tagName) || (node.children ?? []).some(hasBlock));
const hiddenPaint = node => node.type === 'element' && (
  ['svg', 'img', 'picture', 'script', 'style'].includes(node.tagName)
  || node.properties.ariaHidden === 'true' || node.properties.hidden !== undefined
  || classes(node).some(name => ['visually-hidden', 'external-link-icon', 'external-link-notice'].includes(name))
);
const hasText = node => node.type === 'text' ? Boolean(node.value.trim())
  : !hiddenPaint(node) && (node.children ?? []).some(hasText);
const containsHiddenPaint = node => hiddenPaint(node) || (node.children ?? []).some(containsHiddenPaint);

function wrapLabels(nodes) {
  const children = [];
  let label = [];
  function flush() {
    if (!label.length) return;
    if (label.some(hasText)) children.push({
      type: 'element', tagName: 'span', properties: { dataTextLinkLabel: '' }, children: label,
    });
    else children.push(...label);
    label = [];
  }
  for (const child of nodes) {
    if (hiddenPaint(child)) { flush(); children.push(child); }
    else if (child.type === 'element' && containsHiddenPaint(child)) {
      flush();
      child.children = wrapLabels(child.children);
      children.push(child);
    } else label.push(child);
  }
  flush();
  return children;
}

export function enhanceTextLinks(tree) {
  function walk(node, excluded = false) {
    if (!node.children) return;
    const props = node.properties ?? {};
    const skip = excluded || node.tagName === 'nav' || classes(node).some(name => excludedClasses.has(name));
    if (node.tagName === 'a' && props.href !== undefined && !skip
      && props.dataHeadingAnchor === undefined && props.dataLinkUnderline === undefined
      && props.dataCssUnderline === undefined && !node.children.some(hasBlock) && node.children.some(hasText)) {
      node.children = wrapLabels(node.children);
      node.properties.dataCssUnderline = 'text';
      return;
    }
    for (const child of node.children) walk(child, skip);
  }
  walk(tree);
}

export function textLinkMarkup(html) {
  const processor = unified().use(rehypeParse, { fragment: true }).use(rehypeStringify);
  const tree = processor.parse(html);
  enhanceTextLinks(tree);
  return processor.stringify(tree);
}
