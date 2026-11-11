import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import devSearch, { searchMiddleware } from '../lib/dev-search.mjs';

test('search startup generation is skipped outside dev', async () => {
  for (const command of ['build', 'preview', 'sync']) {
    await devSearch().hooks['astro:config:setup']({ command });
  }
});

test('dev search serves generated assets under the base path with correct MIME and no caching', async () => {
  const files = [
    { path: 'pagefind.js', content: Buffer.from('export const search = () => {};') },
    { path: 'pagefind-entry.json', content: Buffer.from('{"languages":{}}') },
    { path: 'wasm.en.pagefind', content: Buffer.from([0, 1, 2]) },
    { path: 'fragment/en_test.pf_fragment', content: Buffer.from([3, 4]) },
  ];
  for (const base of ['/', '/handbook/']) {
    const middleware = searchMiddleware(files, base);
    const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 418; res.end(); }));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    const prefix = `${origin}${base}pagefind/`;
    try {
      for (const file of files) {
        const response = await fetch(`${prefix}${file.path}?v=1`);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), file.content);
        if (file.path.endsWith('.js')) assert.equal(response.headers.get('content-type'), 'text/javascript');
        if (file.path.endsWith('.json')) assert.equal(response.headers.get('content-type'), 'application/json');
      }
      const head = await fetch(`${prefix}pagefind.js`, { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');
      assert.equal((await fetch(`${prefix}missing.js`)).status, 404);
      assert.equal((await fetch(`${prefix}%2e%2e%2fsite/index.html`)).status, 404);
      assert.equal((await fetch(`${prefix}pagefind.js`, { method: 'POST' })).status, 404);
      assert.equal((await fetch(`${origin}${base}search.html`)).status, 418);
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }
});
