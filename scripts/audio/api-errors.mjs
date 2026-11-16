// Provider error bodies may contain identifiers or echo credentials. Read only
// an allowlisted machine status; never print provider messages or request data.
const statuses = new Set(['invalid_api_key', 'missing_permissions', 'unauthorized', 'invalid_authorization_header', 'quota_exceeded']);
export async function preflightFailure(response, { label, permission }) {
  let status;
  try {
    const body = await response.json();
    if (statuses.has(body?.detail?.status)) status = body.detail.status;
  } catch { /* Non-JSON failures must remain redacted too. */ }
  const prefix = `${label} preflight failed (HTTP ${response.status}${status ? `; ${status}` : ''}).`;
  let help = ' Provider response body withheld.';
  if (status === 'missing_permissions') {
    help = ` Enable ${permission} on this ElevenLabs API key, then retry this read-only preflight.`;
  } else if (status === 'invalid_api_key' || status === 'invalid_authorization_header') {
    help = ' Verify locally that ELEVENLABS_API_KEY is an active ElevenLabs API key, not a voice ID. Replace it if revoked or incorrect.';
  } else if (response.status === 401 || response.status === 403) {
    help = ` Check that the key is active and has ${permission}. Authentication and permission failures can both return this status.`;
  }
  if (response.status === 401 || response.status === 403) help += ' An exported ELEVENLABS_API_KEY overrides the value in Node’s --env-file. Do not share the key or raw response.';
  return new Error(prefix + help);
}
