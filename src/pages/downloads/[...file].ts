import type { APIRoute } from 'astro';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { settings } from '../../data/settings';
import { languages, slug } from '../../../handbook.config';

export const prerender = true;

// Production downloads are written to dist/downloads/ after Astro's build.
// The dev server reads the same files directly. Reserve known URLs rather
// than enumerating files so downloads can be built after dev has started.
const DOWNLOAD_DIR = path.join(process.cwd(), 'dist', 'downloads');

const MEDIA_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.epub': 'application/epub+zip',
};

function enabled(file: string): boolean {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.pdf') return settings.downloads.pdf;
  if (ext === '.epub') return settings.downloads.epub;
  return false;
}

const DOWNLOAD_FILES = languages.flatMap((lang) =>
  Object.keys(MEDIA_TYPES).map((ext) => `${slug}-${lang}${ext}`).filter(enabled),
);

export async function getStaticPaths() {
  // In production the download builder publishes real binaries, not Astro
  // prerendered responses. In dev reserve known URLs even before the first build.
  return import.meta.env.DEV ? DOWNLOAD_FILES.map((file) => ({ params: { file } })) : [];
}

export const GET: APIRoute = async ({ params }) => {
  const file = typeof params.file === 'string' ? path.basename(params.file) : '';
  const type = MEDIA_TYPES[path.extname(file).toLowerCase()];
  if (!type || params.file !== file || !DOWNLOAD_FILES.includes(file)) return new Response('Not found', { status: 404 });
  try {
    const body = await fs.readFile(path.join(DOWNLOAD_DIR, file));
    return new Response(new Uint8Array(body), {
      headers: { 'Content-Type': type, 'Content-Length': String(body.length) },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return new Response('Download not built yet (run npm run build:downloads)', { status: 404 });
};
