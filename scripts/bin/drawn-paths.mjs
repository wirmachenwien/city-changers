// Exporters use the exact web media geometry, not a scaled reference frame.
import { readFileSync } from 'node:fs';
import { framePath } from '../../design/elements/geometry.js';

const sizes = JSON.parse(readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(sizes.map(([width, height]) => framePath(width, height))));
