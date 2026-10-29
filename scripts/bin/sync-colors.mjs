#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readRegistry, resolveRegistry, generateOutputs, generatedDifferences, checkContrast, auditArtwork, auditColors } from '../lib/colors.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const check = process.argv.includes('--check');
const registry = readRegistry(root);
const resolved = resolveRegistry(registry);
const contrast = checkContrast(registry, resolved);
const invalid = [...contrast.failures, ...auditArtwork(root, registry, resolved)];
if (invalid.length) {
  console.error(invalid.join('\n'));
  process.exit(1);
}
const outputs = generateOutputs(registry, resolved, readFileSync(join(root, 'design/brand-guide.md'), 'utf8'), readFileSync(join(root, 'design/colors.json'), 'utf8'));
const failures = [...contrast.failures];
for (const path of generatedDifferences(root, outputs)) {
  const fullPath = join(root, path);
  if (check) failures.push(`${path} is outdated; run npm run colors:generate`);
  else { writeFileSync(fullPath, outputs.get(path)); console.log(`Updated ${path}`); }
}
if (check) failures.push(...auditColors(root, registry));
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Colors ${check ? 'checked' : 'generated'}: ${contrast.count} contrast pairs pass; protected artwork untouched.`);
}
