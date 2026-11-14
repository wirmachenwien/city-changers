import { mkdirSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

// Generation and preparation share one lock: preparation also reads retained
// recordings and writes/prunes shared release state. Crashes require reconciliation.
export function acquireAudioLock() {
  const directory = join(process.cwd(), '.cache/audio');
  mkdirSync(directory, { recursive: true });
  const file = join(directory, 'generation.lock');
  let descriptor;
  try { descriptor = openSync(file, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error('Another audio generate/prepare run holds the lock; wait for it to finish, or reconcile a stale lock manually');
  }
  return () => { closeSync(descriptor); unlinkSync(file); };
}
