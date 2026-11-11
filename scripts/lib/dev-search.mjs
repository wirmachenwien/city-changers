import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import * as pagefind from 'pagefind';

const exec = promisify(execFile);

/** Serve only generated index files, without exposing the snapshot HTML. */
export function searchMiddleware(files, base) {
  const prefix = `${base.replace(/\/$/, '')}/pagefind/`;
  const assets = new Map(files.map(file => [file.path, Buffer.from(file.content)]));
  return (req, res, next) => {
    const path = (req.url ?? '').split('?')[0];
    if (!path.startsWith(prefix)) return next();
    const name = path.slice(prefix.length);
    const content = assets.get(name);
    if (!content || !['GET', 'HEAD'].includes(req.method)) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    const type = name.endsWith('.js') ? 'text/javascript'
      : name.endsWith('.json') ? 'application/json'
        : name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream';
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'no-store');
    res.end(req.method === 'HEAD' ? undefined : content);
  };
}

function checked(result) {
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  return result;
}

/** @returns {import('astro').AstroIntegration} */
export default function devSearch() {
  let files = [];
  let base = '/';
  return {
    name: 'dev-search',
    hooks: {
      'astro:config:setup': async ({ command, config, createCodegenDir, updateConfig, logger }) => {
        if (command !== 'dev') return;
        updateConfig({ vite: { server: { watch: { ignored: ['**/.astro/integrations/dev-search/**'] } } } });
        base = config.base;
        const site = new URL('site/', createCodegenDir());
        logger.info('Building startup search snapshot…');
        // A child build runs in isolation, skips this dev-only hook, and never
        // invokes download generation or design/video rendering.
        const cli = fileURLToPath(new URL('./bin/astro.mjs', import.meta.resolve('astro/package.json')));
        await exec(process.execPath, [cli, 'build', '--root', fileURLToPath(config.root), '--outDir', fileURLToPath(site)], {
          cwd: fileURLToPath(config.root),
          env: { ...process.env, NODE_ENV: 'production' },
          maxBuffer: 10 * 1024 * 1024,
        });
        try {
          const { index } = checked(await pagefind.createIndex({ rootSelector: 'main[data-pagefind-body]' }));
          if (!index) throw new Error('Pagefind did not create an index');
          checked(await index.addDirectory({ path: fileURLToPath(site) }));
          files = checked(await index.getFiles()).files;
        } finally {
          await pagefind.close();
        }
        logger.info('Search index ready (restart dev to refresh content).');
      },
      'astro:server:setup': ({ server }) => {
        server.middlewares.use(searchMiddleware(files, base));
      },
    },
  };
}
