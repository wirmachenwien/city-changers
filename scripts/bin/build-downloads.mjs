#!/usr/bin/env node
// PDF/EPUB download builder with graceful degradation: when the Python
// toolchain is unavailable, skip the downloads with a warning instead of
// failing the whole build, so local development without Python still gets a
// working site (download buttons 404 with an explanatory message).
// CI stays strict: with CI=true a missing/broken toolchain fails the build,
// since release builds must ship every enabled download format.
//
// Successful outputs are cached under design/.cache/downloads/<fingerprint>/.
// The fingerprint covers content, builder sources and the installed Python
// toolchain, so a cache restored by GitHub Actions is revalidated before use.
// Set DOWNLOADS_CACHE=off to force a rebuild.
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { languages, slug } from '../../handbook.config.ts';
import settings from '../../src/data/settings.json' with { type: 'json' };
import { cacheFingerprint, sha256File, validCached } from '../lib/downloads-cache.mjs';

const OUT_DIR = 'dist/downloads';
const HTML_DIR = 'dist-pdf';
const CACHE_DIR = 'design/.cache/downloads';
const CACHE_DISABLED = process.env.DOWNLOADS_CACHE === 'off';
const jobs = [
  { enabled: settings.downloads.pdf, ext: '.pdf', args: ['scripts/bin/build-pdf.py', '--all'] },
  { enabled: settings.downloads.epub, ext: '.epub', args: ['scripts/bin/build-epub.py', '--all'] },
];
const expectedDownloads = languages.flatMap((lang) => [
  ...(settings.downloads.pdf ? [`${slug}-${lang}.pdf`] : []),
  ...(settings.downloads.epub ? [`${slug}-${lang}.epub`] : []),
]);
const expectedHtml = settings.downloads.pdf ? languages.map((lang) => `${slug}-${lang}.html`) : [];

// Everything the builders read. Tests and unrelated website code are excluded
// so prose-only changes still reuse an existing export.
const INPUTS = [
  'src/content/book',
  'src/content/pages',
  'src/data',
  'src/assets',
  'src/styles',
  'scripts/handbook',
  'scripts/bin/build-pdf.py',
  'scripts/bin/build-epub.py',
  'scripts/bin/build-downloads.mjs',
  'scripts/bin/drawn-paths.mjs',
  'scripts/bin/render-math.mjs',
  'design/elements',
  'design/colors.json',
  'handbook.config.ts',
  'package-lock.json',
  'requirements.txt',
  'design/requirements.txt',
];

function toolchainFingerprint() {
  const script = [
    'import sys, importlib.metadata as m',
    'print(sys.version)',
    'for d in sorted(m.distributions(), key=lambda d: (d.metadata["Name"] or "").lower()):',
    '    print(d.metadata["Name"], d.version)',
  ].join('\n');
  const python = spawnSync('python3', ['-c', script], { encoding: 'utf8' });
  const details = python.status === 0
    ? python.stdout
    : `python unavailable: ${python.error?.message || python.stderr || 'unknown error'}`;
  return `${process.version}\n${details}`;
}

function cacheRoot() {
  return join(CACHE_DIR, cacheFingerprint(INPUTS, toolchainFingerprint()));
}

function cacheValid(root) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  } catch {
    return false;
  }
  const entries = [
    ['downloads', expectedDownloads, (file) => file.split('.').pop()],
    ['html', expectedHtml, () => 'html'],
  ];
  for (const [dir, files, kind] of entries) {
    for (const file of files) {
      const path = join(root, dir, file);
      const entry = manifest[`${dir}/${file}`];
      if (!entry || !validCached(path, kind(file))) return false;
      if (statSync(path).size !== entry.size || sha256File(path) !== entry.sha256) return false;
    }
  }
  return true;
}

function restoreCache(root) {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const file of expectedDownloads) copyFileSync(join(root, 'downloads', file), join(OUT_DIR, file));
  if (expectedHtml.length) {
    mkdirSync(HTML_DIR, { recursive: true });
    for (const file of expectedHtml) copyFileSync(join(root, 'html', file), join(HTML_DIR, file));
  }
}

function saveCache(root) {
  const temp = `${root}.tmp-${process.pid}`;
  rmSync(temp, { recursive: true, force: true });
  mkdirSync(join(temp, 'downloads'), { recursive: true });
  for (const file of expectedDownloads) copyFileSync(join(OUT_DIR, file), join(temp, 'downloads', file));
  if (expectedHtml.length) {
    mkdirSync(join(temp, 'html'), { recursive: true });
    for (const file of expectedHtml) copyFileSync(join(HTML_DIR, file), join(temp, 'html', file));
  }
  const manifest = {};
  for (const [dir, files] of [['downloads', expectedDownloads], ['html', expectedHtml]]) {
    for (const file of files) {
      const path = join(temp, dir, file);
      manifest[`${dir}/${file}`] = { size: statSync(path).size, sha256: sha256File(path) };
    }
  }
  writeFileSync(join(temp, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(CACHE_DIR, { recursive: true });
  renameSync(temp, root);
  for (const name of readdirSync(CACHE_DIR)) {
    if (name !== basename(root)) rmSync(join(CACHE_DIR, name), { recursive: true, force: true });
  }
}

// Print HTML is an intermediate artefact for PDF rendering and tests. Older
// builds published it under dist/downloads (hundreds of MiB); remove leftovers.
function removeStalePrintHtml() {
  if (!existsSync(OUT_DIR)) return;
  for (const name of readdirSync(OUT_DIR)) {
    if (name.toLowerCase().endsWith('.html')) unlinkSync(join(OUT_DIR, name));
  }
}

function removeDisabledDownloads() {
  if (!existsSync(OUT_DIR)) return;
  const disabled = jobs.filter((job) => !job.enabled).map((job) => job.ext);
  if (disabled.length === 0) return;
  for (const name of readdirSync(OUT_DIR)) {
    if (disabled.some((ext) => name.toLowerCase().endsWith(ext))) {
      unlinkSync(join(OUT_DIR, name));
    }
  }
}

function removeDisabledPrintHtml() {
  if (settings.downloads.pdf) return;
  rmSync(HTML_DIR, { recursive: true, force: true });
}

removeStalePrintHtml();
removeDisabledDownloads();
removeDisabledPrintHtml();

const enabledJobs = jobs.filter((job) => job.enabled);
if (enabledJobs.length === 0) {
  console.log('build:downloads: PDF and EPUB downloads disabled in src/data/settings.json');
  process.exit(0);
}

const root = cacheRoot();
if (!CACHE_DISABLED && cacheValid(root)) {
  restoreCache(root);
  console.log(`build:downloads: restored ${expectedDownloads.length} export(s) from content cache`);
  process.exit(0);
}

function probe() {
  const cmd = spawnSync('python3', ['-c', 'import markdown, weasyprint'], { encoding: 'utf8' });
  if (cmd.error) return `python3 not found (${cmd.error.message})`;
  if (cmd.status !== 0) {
    return (cmd.stderr || '').trim()
      || 'required Python modules missing (pip install -r requirements.txt)';
  }
  return null;
}

const problem = probe();
if (problem) {
  const message =
    `build:downloads: skipping enabled PDF/EPUB downloads — ${problem}.\n` +
    'Install Python ≥ 3.12 with `pip install -r requirements.txt`, then run `npm run build:downloads`.';
  if (process.env.CI === 'true') {
    console.error(message);
    process.exit(1);
  }
  console.warn(message);
  process.exit(0);
}

for (const job of enabledJobs) {
  const run = spawnSync('python3', job.args, { stdio: 'inherit' });
  if (run.status !== 0) process.exit(run.status ?? 1);
}

const missing = expectedDownloads.filter((file) => !existsSync(join(OUT_DIR, file)));
if (missing.length) {
  console.error(`build:downloads: missing expected output(s): ${missing.join(', ')}`);
  process.exit(1);
}

if (!CACHE_DISABLED) {
  saveCache(root);
  console.log(`build:downloads: cached exports for the current inputs`);
}
