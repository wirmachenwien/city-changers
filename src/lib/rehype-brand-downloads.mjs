import { visit } from 'unist-util-visit';
import { brandAssetUrl } from './brand-release.mjs';

// Keep ordinary Markdown asset links downloadable and short format labels
// compact, without embedding presentation or JavaScript in the guide source.
export default function rehypeBrandDownloads() {
  return (tree, file) => {
    if (!String(file.path ?? '').endsWith('/brand-guide.mdx')) return;
    visit(tree, 'element', node => {
      if (node.tagName !== 'a') return;
      const href = node.properties?.href;
      if (typeof href !== 'string' || !/^(?:\.\/|\/)brand-assets\/files\//.test(href)) return;
      const assetFile = decodeURIComponent(href.replace(/^(?:\.\/|\/)brand-assets\/files\//, ''));
      node.properties.href = brandAssetUrl(assetFile);
      node.properties.download = true;
      const label = node.children.map(child => child.type === 'text' ? child.value : '').join('').trim();
      if (!/^(?:SVG|PNG|TTF|WOFF2|MOV|Lottie)$/.test(label)) return;
      const classes = node.properties.className ?? [];
      node.properties.className = [...new Set([...classes, 'text-link--small'])];
      node.properties.ariaLabel ??= `Download ${assetFile.split('/').pop()}`;
    });
  };
}
