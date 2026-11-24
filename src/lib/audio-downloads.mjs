// Standalone resource-download prompts are screen-only. Do not mutate the MDX
// tree: the compiler still needs to render these links on the website.
const label = node => node.value ?? (node.children ?? []).map(label).join('');
const referenceDestinations = new WeakMap();
export function resolveNarrationLinks(tree) {
  const definitions = new Map();
  function visit(node, action) {
    action(node);
    node.children?.forEach(child => visit(child, action));
  }
  visit(tree, node => {
    if (node.type === 'definition') definitions.set(node.identifier, node.url);
  });
  visit(tree, node => {
    if (node.type === 'linkReference' && definitions.has(node.identifier)) referenceDestinations.set(node, definitions.get(node.identifier));
  });
}
const downloadPrompt = node => ['link', 'linkReference'].includes(node.type)
  && /^\/resources\/[^?#]+\.pdf(?:[?#].*)?$/i.test(node.url ?? referenceDestinations.get(node) ?? '')
  && /^(?:download\b|herunterladen\b|prenesi\b|prenesite\b)/iu.test(label(node).trim());

export function narratedChildren(node) {
  const children = node.children ?? [];
  // An inline formatting wrapper is not a standalone prose boundary.
  if (!['paragraph', 'heading'].includes(node.type)) return children;
  const result = [];
  let omitted = false;
  for (const [index, child] of children.entries()) {
    const previous = result.at(-1);
    const next = children[index + 1];
    const standaloneEnd = !next || next.type === 'text' && /^\s*(?:\.(?=\s|$)|$)/u.test(next.value);
    if (downloadPrompt(child) && standaloneEnd && (!previous || previous.type === 'text' && /[.!?]\s+$/u.test(previous.value))) {
      omitted = true;
      continue;
    }
    if (omitted && child.type === 'text') {
      // Drop the prompt's sentence-ending period, not the prose punctuation
      // before it. This preserves historical narration and cache identities.
      result.push({ ...child, value: child.value.replace(/^\s*\.(?=\s|$)/u, '') });
    } else result.push(child);
    omitted = false;
  }
  return result;
}
