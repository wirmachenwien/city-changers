/** Match global.css: 1rem shell gutters, a 14rem sidebar + 2rem gap at
 * 60rem, 44rem prose, and optional floated figures from 48rem. */
export function figureImageProps(image: ImageMetadata, options: {
  size?: 'small' | 'medium';
  float?: 'left' | 'right' | 'center';
  frame?: 'white';
  wide?: boolean;
} = {}) {
  const { size, float, frame, wide } = options;
  const maxRem = size === 'small' ? 18 : size === 'medium' ? 28 : wide ? 58 : 44;
  // Drawn frames bleed .375rem on each side; white cards add 1rem padding.
  const inset = frame === 'white' ? '1.25rem + 2px' : '-0.75rem + 2px';
  const slot = (cap: number, viewport: string) =>
    `calc(min(${cap}rem, ${viewport}) - (${inset}))`;
  const mobile = slot(maxRem, '100vw - 2rem');
  const desktop = slot(wide && !size ? 52 : maxRem, '100vw - 18rem');
  let sizes = `(min-width: 60rem) ${desktop}, ${mobile}`;
  if (float === 'left' || float === 'right') {
    const medium = size === 'medium';
    const cap = Math.min(maxRem, medium ? 22 : 19.8);
    const wideFloat = slot(cap, medium ? '50vw - 9rem' : '45vw - 8.1rem');
    const narrowFloat = slot(cap, medium ? '50vw - 1rem' : '45vw - 0.9rem');
    sizes = `(min-width: 60rem) ${wideFloat}, (min-width: 48rem) ${narrowFloat}, ${mobile}`;
  }

  // Smaller figures need finer steps too: e.g. a framed 18rem figure has
  // only ~266 CSS pixels of image area, not a 400px minimum download.
  const maxWidth = Math.round(maxRem * 16 + 12 - (frame === 'white' ? 34 : 2));
  const candidates = [160, 256, 320, 400, 480, 640, 768, 960, 1152, 1440, 1728, 2112, 2560,
    ...(size ? [maxWidth, maxWidth * 2] : [])];
  const limit = Math.min(image.width, maxWidth * 3);
  const widths = [...new Set([...candidates.filter(width => width < limit), limit])].sort((a, b) => a - b);
  return {
    width: Math.min(image.width, maxWidth),
    widths,
    sizes,
    format: 'webp' as const,
    // Keep lettering/diagrams crisp; photographs tolerate more compression.
    quality: image.format === 'jpg' || image.format === 'jpeg' ? 70 : 85,
  };
}
