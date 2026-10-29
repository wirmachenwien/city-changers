import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import { iconSvg } from './icons.ts';

/** Enhance rendered content, including links inside embedded Astro components. */
export function externalLinks(html, site, notice) {
  const processor = unified().use(rehypeParse, { fragment: true }).use(rehypeStringify);
  const tree = processor.parse(html);
  const origin = new URL(site).origin;

  visit(tree, 'element', (node) => {
    if (node.tagName !== 'a' || typeof node.properties.href !== 'string') return;
    let url;
    try {
      url = new URL(node.properties.href, site);
    } catch {
      return;
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin === origin) return;

    node.properties.target = '_blank';
    const rel = new Set(String(node.properties.rel ?? '').split(/[\s,]+/).filter(Boolean));
    rel.add('noopener');
    rel.add('noreferrer');
    node.properties.rel = [...rel];
    if (node.properties.dataExternalLink !== undefined) return;
    node.properties.dataExternalLink = '';
    node.children.push({
      type: 'element', tagName: 'span',
      properties: { className: ['external-link-icon'], ariaHidden: 'true' },
      children: processor.parse(iconSvg('external-link')).children,
    });
    // An existing aria-label overrides child text, so extend it directly.
    if (node.properties.ariaLabel) {
      node.properties.ariaLabel += ` (${notice})`;
    } else {
      node.children.push({
        type: 'element', tagName: 'span',
        properties: { className: ['external-link-notice'], dataPagefindIgnore: '' },
        children: [{ type: 'text', value: ` (${notice})` }],
      });
    }
  });
  return processor.stringify(tree);
}
