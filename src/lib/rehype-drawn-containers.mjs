// Emit wrappers and marker hints at build time, so decoration needs no extra JS.
export function rehypeDrawnContainers() {
  return tree => {
    function walk(node, inTableWrap = false) {
      if (!node.children) return;
      if (node.type === 'element' && node.tagName === 'ol') {
        const items = node.children.filter(child => child.type === 'element' && child.tagName === 'li');
        const reversed = node.properties?.reversed !== undefined && node.properties.reversed !== false;
        const integer = value => value !== undefined && value !== null && value !== '' && Number.isInteger(Number(value)) ? Number(value) : undefined;
        let count = integer(node.properties?.start) ?? (reversed ? items.length : 1);
        for (const item of items) {
          count = integer(item.properties?.value) ?? count;
          item.properties ??= {};
          if (String(count).length === 1) item.properties.dataMarkerSingle = '';
          else delete item.properties.dataMarkerSingle;
          count += reversed ? -1 : 1;
        }
      }
      if ((node.properties?.className ?? []).includes('drawn-scroll-shell')) return;
      const ownsTable = inTableWrap || node.name === 'TableWrap'
        || (node.properties?.className ?? []).includes('table-scroll');
      node.children = node.children.map(child => {
        walk(child, ownsTable);
        if (child.type !== 'element') return child;
        const div = (className, content) => ({ type: 'element', tagName: 'div', properties: { className: [className] }, children: [content] });
        if (child.tagName === 'table' && !ownsTable) return div('drawn-scroll-shell', div('table-scroll', child));
        if (child.tagName === 'pre') return div('drawn-scroll-shell', child);
        return child;
      });
    }
    walk(tree);
  };
}
