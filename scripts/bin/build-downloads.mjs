#!/usr/bin/env node
// PDF/EPUB download builder with graceful degradation: when the Python
// toolchain is unavailable, skip the downloads with a warning instead of
// failing the whole build, so local development without Python still gets a
// working site (download buttons 404 with an explanatory message).
// CI stays strict: with CI=true a missing/broken toolchain fails the build,
// since release builds must ship every enabled download format.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import settings from '../../src/data/settings.json' with { type: 'json' };

const OUT_DIR = 'dist/downloads';
const jobs = [
  { enabled: settings.downloads.pdf, ext: '.pdf', args: ['scripts/bin/build-pdf.py', '--all'] },
  { enabled: settings.downloads.epub, ext: '.epub', args: ['scripts/bin/build-epub.py', '--all'] },
];

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

removeStalePrintHtml();
removeDisabledDownloads();

const enabledJobs = jobs.filter((job) => job.enabled);
if (enabledJobs.length === 0) {
  console.log('build:downloads: PDF and EPUB downloads disabled in src/data/settings.json');
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
