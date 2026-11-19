import { setTimeout as delay } from 'node:timers/promises';
import { preflightFailure } from './api-errors.mjs';

// Only read-only checks may retry. Never use this helper for paid speech POSTs.
export async function preflightGet(endpoint, key, check, {
  fetchImpl = fetch, timeoutMs = 30000, retryDelayMs = 1000, onRetry = () => {},
} = {}) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      const response = await fetchImpl(`https://api.elevenlabs.io${endpoint}`, {
        headers: { 'xi-api-key': key }, signal,
      });
      if (!response.ok) throw await preflightFailure(response, check);
      try { return await response.json(); }
      catch (error) {
        if (signal.aborted || error.name === 'TimeoutError' || error.name === 'AbortError') throw error;
        throw new Error('Provider preflight response could not be decoded as JSON. Response content was not logged.');
      }
    } catch (error) {
      const timedOut = signal.aborted || error.name === 'TimeoutError' || error.name === 'AbortError';
      const networkFailure = error instanceof TypeError;
      if (!timedOut && !networkFailure) throw error;
      const reason = timedOut ? `timed out after ${timeoutMs / 1000}s` : 'could not connect';
      if (attempt < 2) {
        onRetry(`${check.label} preflight ${reason}; retrying read-only check (2/2).`);
        await delay(retryDelayMs);
        continue;
      }
      // Do not expose error messages/causes, URLs, credentials or voice IDs.
      throw new Error(`${check.label} preflight ${reason} (2 attempts). Could not complete the read-only check at api.elevenlabs.io. Check ElevenLabs service status and your network/VPN/proxy, then rerun npm run audio:preflight. No speech was generated.`);
    }
  }
}
