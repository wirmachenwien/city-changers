#!/usr/bin/env node
// A missing/ambiguous comparison must add validation, never silently skip it.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function classifyDesignChanges(files) {
  const shared = files.some(file => /^(?:\.github\/|AGENTS\.md$|package(?:-lock)?\.json$|requirements[^/]*$|scripts\/ci\/|scripts\/(?:bin\/ci-design-scope|tests\/ci-design-scope\.test)\.mjs$)/.test(file));
  const motion = shared || files.some(file => file.startsWith('design/motion/') || file === 'design/assets/mascot/source/poses.json');
  const design = motion || files.some(file => /^(?:design\/|src\/assets\/|src\/data\/colors\.generated\.json$|public\/|scripts\/)/.test(file));
  return { motion, design };
}

export function designScope({ eventName, event, forceFull = false, git }) {
  const full = reason => ({ motion: true, design: true, reason });
  if (forceFull || eventName === 'workflow_dispatch') return full('manual full validation');
  let base = eventName === 'pull_request' ? event.pull_request?.base?.sha : eventName === 'push' ? event.before : null;
  if (!base || !/^[a-f0-9]{40}$/.test(base) || /^0+$/.test(base)) return full('no reliable comparison SHA');
  try {
    // Pushes can contain several commits; fetch only the previous tip if needed.
    try { git(['cat-file', '-e', `${base}^{commit}`]); }
    catch { git(['fetch', '--no-tags', '--depth=1', 'origin', base]); }
    // PRs build GitHub's merge commit, whose base parent is available at depth 2.
    // Comparing its merge base to HEAD measures the code actually being tested.
    if (eventName === 'pull_request') base = git(['merge-base', base, 'HEAD']).trim();
    const files = git(['diff', '--no-renames', '--name-only', '-z', base, 'HEAD']).split('\0').filter(Boolean);
    return { ...classifyDesignChanges(files), reason: `${files.length} changed file(s)` };
  } catch {
    return full('comparison unavailable; conservative full validation');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const scope = designScope({ eventName: process.env.GITHUB_EVENT_NAME, event,
    forceFull: process.env.FORCE_FULL_DESIGN === 'true',
    git: args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
  });
  console.log(`Design validation: motion=${scope.motion}, full-design=${scope.design} (${scope.reason})`);
  appendFileSync(process.env.GITHUB_OUTPUT, `motion=${scope.motion}\ndesign=${scope.design}\n`);
}
