// Stills use a 288-unit canvas. Motion exports place that same canvas inside
// a larger video frame; crop only the outer padding for matching web previews.
export function mascotViewBox(animationData) {
  const placement = animationData.layers?.find((layer) => layer.nm === 'Canvas placement');
  const scale = placement?.ks?.s?.k;
  if (!Array.isArray(scale) || typeof scale[0] !== 'number' || typeof scale[1] !== 'number') return undefined;
  const width = 288 * scale[0] / 100;
  const height = 288 * scale[1] / 100;
  if (width <= 0 || height <= 0) return undefined;
  return `${(animationData.w - width) / 2} ${(animationData.h - height) / 2} ${width} ${height}`;
}
