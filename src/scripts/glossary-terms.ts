// Glossary term highlighter: wraps every occurrence of a glossary term in
// chapter prose with the same <dfn><button class="definition-term"> markup
// the DefinitionTerm component renders (dotted underline + definition popup
// wired by initDefinitions). Runs on containers explicitly opted in with
// [data-glossary-terms] (book chapters via BookLayout), matching the page
// language against src/data/glossary.ts surface forms.
import { buildGlossaryMatcher } from '../data/glossary';
import type { Language } from '../data/locales';

// Never mark terms inside links, code, existing definitions or the
// glossary list itself (self-explanation would be redundant there).
const SKIP_SELECTOR = 'a, button, code, pre, dfn, dt, dd, script, style, .glossary';

export function initGlossaryTerms(): void {
  const scope = document.querySelector('[data-glossary-terms]');
  if (!scope) return;
  const lang = document.documentElement.lang as Language;
  const { pattern: matcher, lookup } = buildGlossaryMatcher(lang);

  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (node.parentElement?.closest(SKIP_SELECTOR)) continue;
    if (!node.nodeValue || !matcher.test(node.nodeValue)) continue;
    matcher.lastIndex = 0;
    nodes.push(node);
  }

  for (const textNode of nodes) {
    const text = textNode.nodeValue ?? '';
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    matcher.lastIndex = 0;
    for (const match of text.matchAll(matcher)) {
      const entry = lookup(match[0]);
      if (!entry || match.index === undefined) continue;
      if (match.index > lastIndex) {
        fragment.append(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      const dfn = document.createElement('dfn');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'definition-term';
      button.dataset.definition = entry.definition;
      button.title = entry.definition;
      button.textContent = match[0];
      dfn.append(button);
      fragment.append(dfn);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex === 0) continue;
    if (lastIndex < text.length) {
      fragment.append(document.createTextNode(text.slice(lastIndex)));
    }
    textNode.replaceWith(fragment);
  }
}
