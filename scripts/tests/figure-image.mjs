import test from 'node:test';
import assert from 'node:assert/strict';
import { figureImageProps } from '../../src/lib/figure-image.ts';

const photo = { src: '/photo.jpg', width: 4910, height: 3682, format: 'jpg' };

test('figures have a bounded fallback and mobile/high-density candidates', () => {
  const props = figureImageProps(photo);
  assert.equal(props.width, 714);
  assert.equal(props.format, 'webp');
  assert.equal(props.quality, 70);
  assert.ok(props.widths.includes(400));
  assert.ok(props.widths.includes(768));
  assert.equal(props.widths.at(-1), 2142);
  assert.match(props.sizes, /min-width: 60rem/);
  assert.match(props.sizes, /100vw - 18rem/);
  assert.match(props.sizes, /100vw - 2rem/);
});

test('small framed diagrams have smaller candidates and account for padding', () => {
  const props = figureImageProps({ ...photo, format: 'png' }, { size: 'small', frame: 'white' });
  assert.equal(props.width, 266);
  assert.equal(props.quality, 85);
  assert.ok(props.widths.includes(256));
  assert.ok(props.widths.includes(532));
  assert.equal(props.widths.at(-1), 798);
  assert.match(props.sizes, /min\(18rem,/);
  assert.match(props.sizes, /- \(1.25rem \+ 2px\)/);
});

test('floats account for both sidebar and float breakpoints', () => {
  const props = figureImageProps(photo, { size: 'medium', float: 'left' });
  assert.match(props.sizes, /min-width: 48rem/);
  assert.match(props.sizes, /min\(22rem, 50vw - 9rem\)/);
  assert.match(props.sizes, /min\(22rem, 50vw - 1rem\)/);
  assert.doesNotMatch(figureImageProps(photo, { float: 'center' }).sizes, /48rem/);
});

test('small originals never get upscaled or duplicated in srcset', () => {
  const props = figureImageProps({ ...photo, width: 320 });
  assert.equal(props.width, 320);
  assert.deepEqual(props.widths, [160, 256, 320]);
});

test('homepage opener uses the article column rather than prose width', () => {
  const props = figureImageProps(photo, { wide: true });
  assert.match(props.sizes, /min\(52rem, 100vw - 18rem\)/);
  assert.match(props.sizes, /min\(58rem, 100vw - 2rem\)/);
  assert.equal(props.width, 938);
});
