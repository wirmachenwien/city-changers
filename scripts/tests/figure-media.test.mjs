import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveFigureVideo } from '../../src/lib/figure-media.ts';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/figure-media.json', import.meta.url)));
for (const { src, url } of fixtures) {
  test(`Figure media: ${src}`, () => {
    const result = resolveFigureVideo(src);
    assert.equal(result ? result.type === 'embed' ? result.watchUrl : result.url : null, url);
    if (result?.type === 'embed') assert.match(result.embedUrl, /^https:\/\/(www.youtube-nocookie.com\/embed\/|player.vimeo.com\/video\/)/);
  });
}
test('custom posters override YouTube thumbnails and work for Vimeo and files', () => {
  for (const src of ['https://youtu.be/87JUbbq48r8', 'https://vimeo.com/123456', '/talk.mp4']) {
    assert.equal(resolveFigureVideo(src, '/poster.jpg').poster, '/poster.jpg');
  }
});
