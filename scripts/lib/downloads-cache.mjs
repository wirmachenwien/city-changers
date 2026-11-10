// Shared cache helpers for scripts/bin/build-downloads.mjs (import-only).
// The fingerprint covers every input the PDF/EPUB builders read plus a
// caller-supplied toolchain description. A restored cache is only used when
// each expected file still has the right magic bytes, size and SHA-256.
import { createHash } from 'node:crypto';
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const CACHE_VERSION = 1;

export function* walk(path) {
  if (!existsSync(path)) return;
  if (statSync(path).isFile()) {
    yield path;
    return;
  }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === '.DS_Store' || entry.name === '__pycache__') continue;
    yield* walk(join(path, entry.name));
  }
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function cacheFingerprint(inputs, toolchain = '') {
  const hash = createHash('sha256');
  hash.update(`downloads-v${CACHE_VERSION}\0`);
  for (const input of inputs) {
    for (const file of [...walk(input)].sort()) {
      hash.update(relative('.', file).split(sep).join('/'));
      hash.update('\0');
      hash.update(readFileSync(file));
      hash.update('\0');
    }
  }
  hash.update(toolchain);
  return hash.digest('hex');
}

function magic(path, length = 4) {
  const fd = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, 0);
    return buffer;
  } finally {
    closeSync(fd);
  }
}

export function validCached(path, kind) {
  if (!existsSync(path) || statSync(path).size < 1024) return false;
  const head = magic(path, 16);
  if (kind === 'pdf') return head.subarray(0, 4).toString() === '%PDF';
  if (kind === 'epub') return head.subarray(0, 2).toString() === 'PK';
  if (kind === 'html') return head.toString().toLowerCase().startsWith('<!doctype html');
  return false;
}
