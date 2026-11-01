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

// Logo masters use the inner 256-unit square, without the stills' 16-unit
// clear space on each side. Keep the animated mascot at the master's scale.
export function logoMascotViewBox(animationData) {
  const box = mascotViewBox(animationData);
  if (!box) return undefined;
  const [x, y, width, height] = box.split(' ').map(Number);
  return `${x + width / 18} ${y + height / 18} ${width * 8 / 9} ${height * 8 / 9}`;
}
