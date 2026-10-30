import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { mascotViewBox } from '../../src/lib/mascot-viewbox.mjs';

test('all mascot animations frame the exact same 288-unit canvas as the stills', () => {
  const directory = new URL('../../src/assets/mascot/lottie/', import.meta.url);
  const files = readdirSync(directory).filter((file) => /^green-fix-.*\.json$/.test(file));
  assert.equal(files.length, 12);
  for (const file of files) {
    const data = JSON.parse(readFileSync(new URL(file, directory), 'utf8'));
    const [x, y, width, height] = mascotViewBox(data).split(' ').map(Number);
    const placement = data.layers.find((layer) => layer.nm === 'Canvas placement');
    const scale = placement.ks.s.k[0] / 100;
    // The source viewBox starts at -16; its origin must land at the same inset.
    assert.equal((placement.ks.p.k[0] - x) / width, 16 / 288, file);
    assert.equal((placement.ks.p.k[1] - y) / height, 16 / 288, file);
    assert.equal(scale / width, 1 / 288, file);
    assert.equal(width, height, file);
  }
});

test('unknown animation layouts keep the default Lottie framing', () => {
  assert.equal(mascotViewBox({ w: 1080, h: 1080, layers: [] }), undefined);
});
