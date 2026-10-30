// Decorate displayed HEX values, never attributes, expressions or source files.
export default function rehypeColorPebbles({ brandOnly = false } = {}) {
  return (tree, file) => {
    if (brandOnly && !String(file.path ?? '').endsWith('/brand-guide.mdx')) return;

    function walk(node) {
      if (['script', 'style', 'textarea'].includes(node.tagName)) return;
      if (!Array.isArray(node.children)) return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text') {
          walk(child);
          return [child];
        }
        const parts = [];
        let start = 0;
        for (const match of child.value.matchAll(/#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})\b/gi)) {
          parts.push({ type: 'text', value: child.value.slice(start, match.index) });
          parts.push({
            type: 'element', tagName: 'span',
            properties: { className: ['color-value'] },
            children: [
              {
                type: 'element', tagName: 'span',
                properties: {
                  className: ['color-pebble'], ariaHidden: 'true',
                  style: `--pebble-color: ${match[0]}`,
                },
                children: [],
              },
              { type: 'text', value: match[0] },
            ],
          });
          start = match.index + match[0].length;
        }
        if (!parts.length) return [child];
        parts.push({ type: 'text', value: child.value.slice(start) });
        return parts;
      });
    }
    walk(tree);
  };
}
