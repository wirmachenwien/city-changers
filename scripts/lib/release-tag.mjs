// Explicit, committed edition dates keep offline builds deterministic.
export function datedReleaseTag(kind, { date, revision = 0 }) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!['audio', 'brand'].includes(kind) || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000-') ||
      !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || !Number.isSafeInteger(revision) || revision < 0) throw new Error('Set a valid edition date (YYYY-MM-DD) and nonnegative integer revision');
  let suffix = '';
  for (let value = revision; value > 0; value = Math.floor((value - 1) / 26)) suffix = String.fromCharCode(97 + (value - 1) % 26) + suffix;
  return `${kind}-${date}${suffix}`;
}
