import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cacheFingerprint, sha256File, validCached } from '../lib/downloads-cache.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'downloads-cache-'));
  mkdirSync(join(root, 'nested'));
  mkdirSync(join(root, '__pycache__'));
  writeFileSync(join(root, 'content.txt'), 'handbook');
  writeFileSync(join(root, 'nested', 'asset.bin'), Buffer.from([1, 2, 3]));
  writeFileSync(join(root, '.DS_Store'), 'ignored');
  writeFileSync(join(root, '__pycache__', 'module.pyc'), 'ignored');
  return root;
}

test('fingerprints cover content and ignore editor/cache noise', () => {
  const root = fixture();
  try {
    const first = cacheFingerprint([root], 'toolchain');
    assert.equal(cacheFingerprint([root], 'toolchain'), first);
    writeFileSync(join(root, '.DS_Store'), 'still ignored');
    writeFileSync(join(root, '__pycache__', 'module.pyc'), 'still ignored');
    assert.equal(cacheFingerprint([root], 'toolchain'), first);
    writeFileSync(join(root, 'nested', 'asset.bin'), Buffer.from([1, 2, 4]));
    assert.notEqual(cacheFingerprint([root], 'toolchain'), first);
    assert.notEqual(cacheFingerprint([root], 'other toolchain'), cacheFingerprint([root], 'toolchain'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('cache validation checks magic bytes and rejects small or corrupt files', () => {
  const root = fixture();
  try {
    const file = join(root, 'download');
    writeFileSync(file, Buffer.concat([Buffer.from('%PDF'), Buffer.alloc(2048)]));
    assert.equal(validCached(file, 'pdf'), true);
    assert.equal(validCached(file, 'epub'), false);
    assert.equal(validCached(file, 'html'), false);

    writeFileSync(file, Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(2048)]));
    assert.equal(validCached(file, 'epub'), true);
    assert.equal(validCached(file, 'pdf'), false);

    writeFileSync(file, Buffer.concat([Buffer.from('<!doctype html>'), Buffer.alloc(2048)]));
    assert.equal(validCached(file, 'html'), true);

    writeFileSync(file, Buffer.from('%PDF'));
    assert.equal(validCached(file, 'pdf'), false);
    assert.equal(validCached(join(root, 'missing.pdf'), 'pdf'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('sha256File hashes bytes', () => {
  const root = fixture();
  try {
    assert.equal(sha256File(join(root, 'content.txt')),
      'b4128df29f3726b470dcc4b138fec23a39a7a2b8483bca2a2fa4b0c38931f9eb');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
