import assert from 'node:assert/strict';
import test from 'node:test';
import { questionNumbers } from '../../src/lib/question-numbering.mjs';

test('both question types share book order and restart per edition', () => {
  const works = {
    en: { chapters: [{ file: 'second' }, { file: 'first' }] },
    de: { chapters: [{ file: 'first' }] },
  };
  const sources = {
    'en/second': '<Question\n id="en-a" /><Question id={"en-b"} />',
    'en/first': "<Question id={'en-c'} />",
    'de/first': '<Question id="de-a" />',
  };
  const read = (lang, file) => sources[`${lang}/${file}`];
  assert.deepEqual([...questionNumbers(works, read)], [
    ['en-a', 1], ['en-b', 2], ['en-c', 3], ['de-a', 1],
  ]);
  sources['en/second'] = '<Question id="en-new" />' + sources['en/second'];
  assert.equal(questionNumbers(works, read).get('en-c'), 4);
});

test('duplicate ids fail instead of silently assigning the wrong number', () => {
  assert.throws(() => questionNumbers({ en: { chapters: [{ file: '01' }] } },
    () => '<Question id="duplicate" /><Question id="duplicate" />'), /Duplicate question id/);
});
