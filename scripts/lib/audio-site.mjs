import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { relative, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Dev uses the real public/ directory, including ignored local MP3s/M4Bs.
// Production sees a filtered mirror so Vite never copies those binaries to dist.
export function copySitePublic(source, target) {
  if (!existsSync(source)) return;
  cpSync(source, target, { recursive: true, filter: file => {
    const name = relative(source, file).split(sep).join('/');
    return !/^audio\/.*\.(mp3|m4b)$/i.test(name);
  } });
}

/** @returns {import('astro').AstroIntegration} */
export default function audioSite() {
  let mirror;
  return { name: 'audio-site', hooks: {
    'astro:config:setup': ({ command, config, createCodegenDir, updateConfig }) => {
      if (command !== 'build') return;
      mirror = mkdtempSync(join(fileURLToPath(createCodegenDir()), 'public-'));
      copySitePublic(fileURLToPath(config.publicDir), mirror);
      updateConfig({ publicDir: pathToFileURL(`${mirror}${sep}`) });
    },
    'astro:build:done': () => { if (mirror) rmSync(mirror, { recursive: true }); },
  } };
}
