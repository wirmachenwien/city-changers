/* Selected Natural geometry, shared by the element library and the website.
   CSS-pixel coordinates keep corners, stroke weights and tail depth constant. */
// Alternating cubic half-waves with exact endpoints. Adjacent segments share
// their tangent; the result is deterministic, never randomized roughness.
function wave(start, end, center, amplitude, segments, vertical = false) {
  const step = (end - start) / segments;
  const point = (along, across) => vertical ? `${across} ${along}` : `${along} ${across}`;
  let path = '';
  for (let i = 0; i < segments; i++) {
    const a = start + i * step;
    const offset = (i % 2 ? -1 : 1) * amplitude * 4 / 3;
    path += `C${point(a + step / 3, center + offset)} ${point(a + step * 2 / 3, center + offset)} ${point(i === segments - 1 ? end : a + step, center)}`;
  }
  return path;
}

export function bubblePath(width, height, top) {
  const bend = 1.75;
  const spacing = 160;
  const across = Math.max(2, Math.round(width / spacing));
  const down = Math.max(2, Math.round(height / spacing));
  const topEdge = top
    ? `C32 8 40 9 48 9L56 -15L80 9` + wave(80, width - 24, 9, bend, across)
    : wave(24, width - 24, 9, bend, across);
  const leftEdge = top
    ? wave(height - 24, 24, 9, bend, down, true)
    : wave(height - 24, 80, 9, Math.min(bend, Math.max(0, height - 104) / 6), Math.max(1, Math.round((height - 104) / 110)), true) + 'L-15 56L9 48C9 38 8 30 9 24';
  return `M24 9${topEdge}Q${width - 9} 8 ${width - 9} 24`
    + wave(24, height - 24, width - 9, bend, down, true)
    + `Q${width - 8} ${height - 8} ${width - 24} ${height - 9}`
    + wave(width - 24, 24, height - 9, bend, across)
    + `Q8 ${height - 8} 9 ${height - 24}${leftEdge}Q8 8 24 9Z`;
}

// One panel silhouette for both outlined notebook frames and filled labels.
export function framePath(width, height) {
  return shapedFrame(width, height, false);
}

export function compactPath(width, height) {
  return shapedFrame(width, height, true);
}

function shapedFrame(width, height, compact) {
  const bend = Math.min(compact ? .9 : 1.75, (width - 8) / 8, (height - 8) / 8);
  const inset = bend + 2;
  const corner = Math.min(compact ? 5 : 12, (width - 2 * inset) / 4, (height - 2 * inset) / 4);
  const right = width - inset;
  const bottom = height - inset;
  const spacing = 160;
  const across = compact ? 2 : Math.max(2, Math.round(width / spacing));
  const down = compact ? 2 : Math.max(2, Math.round(height / spacing));
  return `M${inset + corner} ${inset}`
    + wave(inset + corner, right - corner, inset, bend, across)
    + `Q${right} ${inset} ${right} ${inset + corner}`
    + wave(inset + corner, bottom - corner, right, bend, down, true)
    + `Q${right} ${bottom} ${right - corner} ${bottom}`
    + wave(right - corner, inset + corner, bottom, bend, across)
    + `Q${inset} ${bottom} ${inset} ${bottom - corner}`
    + wave(bottom - corner, inset + corner, inset, bend, down, true)
    + `Q${inset} ${inset} ${inset + corner} ${inset}Z`;
}
