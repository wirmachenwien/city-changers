import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDesignChanges, designScope } from '../bin/ci-design-scope.mjs';

test('prose/UI edits skip heavy design checks; brand and motion inputs select their suites', () => {
  for (const file of ['src/content/book/en/01.mdx', 'src/components/SideNav.astro', 'src/styles/global.css', 'README.md']) {
    assert.deepEqual(classifyDesignChanges([file]), { motion: false, design: false }, file);
  }
  for (const file of ['design/brand-guide.mdx', 'design/scripts/package-brand-kit.py', 'design/tests/test_brand_handoff.py', 'src/assets/book/photo.jpg', 'design/assets/mascot/source/static-poses.json']) {
    assert.deepEqual(classifyDesignChanges([file]), { motion: false, design: true }, file);
  }
  for (const file of ['design/motion/src/new/helper.ts', 'design/assets/mascot/source/poses.json', 'package-lock.json', '.github/actions/design/action.yml', 'AGENTS.md', 'scripts/bin/ci-design-scope.mjs']) {
    assert.deepEqual(classifyDesignChanges([file]), { motion: true, design: true }, file);
  }
});

test('missing history, unknown events, initial pushes and manual runs validate everything', () => {
  for (const options of [{ eventName: 'push', event: { before: '0'.repeat(40) } },
    { eventName: 'workflow_dispatch', event: {} }, { eventName: 'unknown', event: {} },
    { eventName: 'push', event: { before: 'a'.repeat(40) }, forceFull: true },
    { eventName: 'push', event: { before: 'a'.repeat(40) }, git: () => { throw Error('missing history'); } }]) {
    const scope = designScope(options);
    assert.equal(scope.motion, true);
    assert.equal(scope.design, true);
  }
});

test('PR comparison uses the tested merge commit; deleted and renamed source paths are included', () => {
  const calls = [];
  const scope = designScope({ eventName: 'pull_request', event: { pull_request: { base: { sha: 'a'.repeat(40) } } },
    git: args => { calls.push(args); return args[0] === 'merge-base' ? 'b'.repeat(40) : args[0] === 'diff' ? 'design/motion/src/old.ts\0src/content/new.mdx\0' : ''; },
  });
  assert.equal(scope.motion, true);
  assert.deepEqual(calls.at(-1), ['diff', '--no-renames', '--name-only', '-z', 'b'.repeat(40), 'HEAD']);
});

test('multi-commit pushes fetch only the previous tip when absent', () => {
  const calls = [];
  const scope = designScope({ eventName: 'push', event: { before: 'a'.repeat(40) }, git: args => {
    calls.push(args);
    if (args[0] === 'cat-file') throw Error('shallow');
    return args[0] === 'diff' ? 'src/content/book/en/01.mdx\0' : '';
  } });
  assert.equal(scope.motion, false);
  assert.deepEqual(calls[1], ['fetch', '--no-tags', '--depth=1', 'origin', 'a'.repeat(40)]);
});
