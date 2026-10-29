// Search-term highlighting on pages opened from search results:
// wraps ?query= matches in <mark> and inserts a "jump to first result" box
// before the main heading.
import { iconSvg } from '../lib/icons.ts';

export function initSearchHighlight(jumpLabel = 'Jump to first result'): void {
  const param = document.body.dataset.searchParam ?? 'query';
  const query = new URLSearchParams(location.search).get(param)?.trim();
  if (!query) return;
  const prose = document.querySelector('[data-prose]');
  if (!prose) return;
  const terms = query.split(/\s+/).filter(Boolean).slice(0, 6);
  if (terms.length === 0) return;
  const pattern = new RegExp(`(${terms.map(escape).join('|')})`, 'gi');
  const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.nodeValue && pattern.test(node.nodeValue)) nodes.push(node);
  }
  pattern.lastIndex = 0;
  let first: HTMLElement | null = null;
  for (const node of nodes) {
    const fragment = document.createDocumentFragment();
    let rest = node.nodeValue ?? '';
    let match: RegExpExecArray | null;
    const local = new RegExp(pattern.source, 'gi');
    let cursor = 0;
    while ((match = local.exec(rest)) !== null) {
      fragment.append(rest.slice(cursor, match.index));
      const mark = document.createElement('mark');
      mark.textContent = match[0];
      fragment.append(mark);
      if (!first) first = mark;
      cursor = match.index + match[0].length;
    }
    fragment.append(rest.slice(cursor));
    node.replaceWith(fragment);
  }
  if (!first) return;
  first.id = 'first-search-result';
  const box = document.createElement('p');
  const link = document.createElement('a');
  link.href = '#first-search-result';
  link.textContent = jumpLabel;
  const arrow = document.createElement('span');
  arrow.innerHTML = iconSvg('arrow-down');
  link.append(' ', arrow);
  box.append(link);
  const heading = prose.querySelector('h1');
  (heading ?? prose).before(box);
}

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
