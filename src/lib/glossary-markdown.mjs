// Glossary definitions support inline Markdown, never executable HTML/MDX.
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { narratedChildren, resolveNarrationLinks } from './audio-downloads.mjs';

const parser = unified().use(remarkParse);
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const safeUrl = url => !/^[\s\u0000-\u0020]*(?:javascript|data|vbscript):/i.test(url.replace(/[\u0000-\u0020]/g, ''));

function render(source, transform, html, narration = false) {
  const tree = parser.parse(source);
  if (narration) resolveNarrationLinks(tree);
  const definitions = new Map();
  function collect(node) {
    if (node.type === 'definition') definitions.set(node.identifier, node);
    node.children?.forEach(collect);
  }
  collect(tree);
  function walk(node) {
    if (node.type === 'definition') return '';
    if (node.type === 'break') return html ? '<br />' : ' ';
    if (node.type === 'image' || node.type === 'imageReference') return html ? escape(transform(node.alt ?? '')) : node.alt ?? '';
    if (node.value !== undefined) {
      const value = node.type === 'inlineCode' ? node.value : transform(node.value);
      if (!html) return value;
      return node.type === 'inlineCode' ? `<code>${escape(value)}</code>` : escape(value);
    }
    const content = (narration ? narratedChildren(node) : node.children ?? []).map(walk).join(node.type === 'root' ? ' ' : '');
    if (!html) return content;
    if (node.type === 'strong') return `<strong>${content}</strong>`;
    if (node.type === 'emphasis') return `<em>${content}</em>`;
    if (node.type === 'link' || node.type === 'linkReference') {
      const link = node.type === 'link' ? node : definitions.get(node.identifier);
      if (link && safeUrl(link.url)) {
        const title = link.title ? ` title="${escape(transform(link.title))}"` : '';
        return `<a href="${escape(link.url)}"${title}>${content}</a>`;
      }
    }
    return content;
  }
  return walk(tree);
}

export const glossaryMarkdown = (source, transform = value => value) => render(source, transform, true);
export const glossaryText = source => render(source, value => value, false);
export const glossaryNarrationText = source => render(source, value => value, false, true).trim();
