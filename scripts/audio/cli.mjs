#!/usr/bin/env node
// No dotenv import: only explicitly invoked network commands use process.env.
import { existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { makePlan, savePlan, report, assets, reusableAlignment, read, write, path } from './plan.mjs';
import { hash } from './content.mjs';
import { prepare } from './media.mjs';
import { preflightFailure } from './api-errors.mjs';
import { buildProofread } from './proofread.mjs';
import { acquireAudioLock } from './lock.mjs';

const [command = 'plan', ...args] = process.argv.slice(2);
const commands = {
  plan: { usage: '', description: 'Report costs/reuse and update the block identity ledger.', values: [] },
  proofread: { usage: '', description: 'Write .cache/audio/proofread/index.html for text comparison.', values: [] },
  preflight: { usage: '', description: 'Check allowance and voice access; no speech generation.', values: [] },
  generate: { usage: '--budget N [--chapter ID | --units ID,ID] [--plan HASH] [--yes]', description: 'Generate missing narration only, within an explicit character budget.', values: ['budget', 'chapter', 'units', 'plan'] },
  prepare: { usage: '[--chapter ID | --language en|de|sl]', description: 'Assemble retained narration, cues and a release inventory in public/audio/; prune stale folders. No selection prepares everything; no paid calls or uploads.', values: ['chapter', 'language'] },
};
function validateArguments() {
  const spec = commands[command];
  if (!spec) throw new Error(`Unknown audio command ${command}. Available: ${Object.keys(commands).join(', ')}`);
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    const name = argument.slice(2);
    if (!argument.startsWith('--') || (!spec.values.includes(name) && name !== 'help' && !(command === 'generate' && name === 'yes'))) {
      throw new Error(`Unexpected argument ${argument}. Use npm run audio:${command} -- --help`);
    }
    if (seen.has(name)) throw new Error(`Duplicate option --${name}`);
    seen.add(name);
    if (spec.values.includes(name)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Required: --${name} VALUE`);
    }
  }
  if (seen.has('chapter') && seen.has('units')) throw new Error('Choose either --chapter or --units, not both');
  if (seen.has('chapter') && seen.has('language')) throw new Error('Choose either --chapter or --language, not both');
}
const flag = name => args.includes(`--${name}`);
const option = name => args[args.indexOf(`--${name}`) + 1];
function requireOption(name) {
  if (!flag(name) || !option(name) || option(name).startsWith('--')) throw new Error(`Required: --${name} VALUE`);
  return option(name);
}
function credentials(config, lang) {
  const key = process.env.ELEVENLABS_API_KEY;
  const voice = process.env[config.voices[lang]];
  if (!key || !voice) throw new Error('Set ELEVENLABS_API_KEY and the configured voice variable in .env or export them, then use npm run audio:preflight or audio:generate.');
  if (key !== key.trim() || voice !== voice.trim()) throw new Error('A credential has leading/trailing whitespace. Correct it locally; do not share its value.');
  if (/[\r\n]/u.test(key)) throw new Error('The API key contains a line break. Correct it locally; do not share its value.');
  return { key, voice };
}
async function get(endpoint, key, check) {
  const response = await fetch(`https://api.elevenlabs.io${endpoint}`, { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw await preflightFailure(response, check);
  return response.json();
}
async function preflight(config, langs) {
  const { key } = credentials(config, langs[0]);
  const [subscription, models] = await Promise.all([
    get('/v1/user/subscription', key, { label: 'Subscription/allowance', permission: 'User: Read (user_read)' }),
    get('/v1/models', key, { label: 'Models', permission: 'Models: Read (models_read)' }),
  ]);
  const model = models.find(m => m.model_id === config.modelId && m.can_do_text_to_speech);
  if (!model) throw new Error('Pinned model is not available to this account');
  for (const lang of langs) {
    if (!model.languages?.some(l => l.language_id === lang)) throw new Error(`Pinned model does not advertise ${lang}`);
    const { voice } = credentials(config, lang);
    await get(`/v1/voices/${encodeURIComponent(voice)}`, key, { label: 'Narrator voice access', permission: 'Voices: Read (voices_read)' });
  }
  const remaining = subscription.character_limit - subscription.character_count;
  if (!Number.isFinite(remaining)) throw new Error('Account did not return a usable character allowance');
  // Never enable metered overage automatically.
  const voiceHashes = Object.fromEntries(langs.map(lang => [lang, hash(credentials(config, lang).voice)]));
  return { remaining, tier: subscription.tier, modelId: config.modelId,
    voiceHashes, checkedAt: new Date().toISOString() };
}

async function generate(plan) {
  const budget = Number(requireOption('budget'));
  if (!Number.isSafeInteger(budget) || budget <= 0) throw new Error('Budget must be a positive integer');
  if (flag('plan') && requireOption('plan') !== plan.planHash) throw new Error('The plan changed; run npm run audio:plan again');
  const all = plan.chapters.flatMap(c => c.units.map(u => ({ ...u, lang: c.lang, chapterId: c.id })));
  let selected;
  if (flag('units')) {
    const unitIds = requireOption('units').split(',');
    if (!unitIds.length || new Set(unitIds).size !== unitIds.length) throw new Error('Select unique unit IDs');
    selected = unitIds.map(id => {
      const unit = all.find(u => u.id === id);
      if (!unit) throw new Error(`Unknown unit ${id}`);
      return unit;
    });
  } else if (flag('chapter')) {
    const chapterId = requireOption('chapter');
    selected = all.filter(u => u.chapterId === chapterId);
    if (!selected.length) throw new Error(`Unknown or empty chapter ${chapterId}`);
  } else selected = all;
  const langs = [...new Set(selected.map(u => u.lang))];
  const voices = Object.fromEntries(langs.map(lang => [lang, credentials(plan.config, lang).voice]));
  for (const lang of langs) {
    if (plan.config.voiceHashes[lang] !== hash(voices[lang])) throw new Error(`Voice hash for ${lang} does not match config; run preflight and update audio/config.json`);
  }
  const voiceHashes = Object.fromEntries(langs.map(lang => [lang, hash(voices[lang])]));
  // Cache keys pin actual resolved voices too; changing an environment value
  // cannot accidentally reuse another narrator's assets.
  const resolved = selected.map(u => ({ ...u, assetKey: hash({ cacheKey: u.cacheKey, voice: voices[u.lang] }) }));
  const refreshPending = () => {
    const inventory = assets({ includeInvalid: true });
    const resolvedKey = asset => asset.request?.inputs?.[0]?.voice_id
      ? hash({ cacheKey: asset.unit.cacheKey, voice: asset.request.inputs[0].voice_id }) : asset.key;
    const retainedKeys = new Set(inventory.filter(asset => asset.reusable).map(resolvedKey));
    const broken = resolved.find(u => !retainedKeys.has(u.assetKey) &&
      (inventory.some(asset => !asset.reusable && resolvedKey(asset) === u.assetKey) ||
        ['result.json', 'incomplete.json'].some(file => existsSync(path(`.cache/audio/units/${u.assetKey}/${file}`)))));
    if (broken) throw new Error(`Retained audio for ${broken.id} is incomplete or corrupt; reconcile its private asset and journal instead of overwriting it`);
    const pending = [...new Map(resolved.filter(u => !retainedKeys.has(u.assetKey)).map(u => [u.assetKey, u])).values()];
    return { pending, cost: pending.reduce((sum, u) => sum + u.text.length, 0) };
  };
  const checkJournals = () => {
    const directory = path('.cache/audio/journals');
    for (const file of existsSync(directory) ? readdirSync(directory).filter(f => f.endsWith('.json')) : []) {
      if (read(`.cache/audio/journals/${file}`).requests.some(r => r.state !== 'complete')) throw new Error('An earlier request needs manual reconciliation; changing budgets or selections cannot bypass an uncertain request');
    }
  };
  checkJournals();
  let { pending, cost } = refreshPending();
  if (cost > budget) throw new Error(`Selected units need ${cost} characters, above the ${budget}-character budget`);
  if (!pending.length) {
    console.log(`Nothing to generate: ${selected.length} selected units reuse retained audio.`);
    return;
  }
  console.log(JSON.stringify({ planHash: plan.planHash, budget, selectedUnits: selected.length, pendingUnits: pending.length,
    characters: cost, reusedUnits: selected.length - pending.length, voiceHashes }, null, 2));
  if (!flag('yes')) {
    if (!process.stdin.isTTY) throw new Error('Pass --yes to confirm a non-interactive paid generation run');
    const { createInterface } = await import('node:readline/promises');
    const readline = createInterface({ input: process.stdin, output: process.stdout });
    let answer;
    try { answer = await readline.question(`Generate ${cost} characters? Type "yes" to continue: `); }
    finally { readline.close(); }
    if (answer.trim().toLowerCase() !== 'yes') throw new Error('Generation cancelled');
  }
  const journalPath = `.cache/audio/journals/${hash({ planHash: plan.planHash, budget, unitIds: selected.map(u => u.id).sort(), voiceHashes })}.json`;
  mkdirSync(path('.cache/audio/journals'), { recursive: true });
  // A process lock covers budgeting AND requests. Stale locks require manual reconciliation.
  const releaseLock = acquireAudioLock();
  try {
    checkJournals();
    // Read provider usage only while serialized with other local generators.
    const account = await preflight(plan.config, langs);
    ({ pending, cost } = refreshPending());
    if (!pending.length) {
      console.log(`Nothing to generate: ${selected.length} selected units reuse retained audio.`);
      return;
    }
    if (cost > budget) throw new Error('Refreshed pending units exceed the budget; run generation again');
    if (cost > account.remaining) throw new Error(`Requested units exceed the remaining account allowance (${account.remaining} characters)`);
    const journal = existsSync(path(journalPath)) ? read(journalPath) : {
      schemaVersion: 1, planHash: plan.planHash, budget, unitIds: selected.map(u => u.id), voiceHashes,
      createdAt: new Date().toISOString(), reservedCharacters: 0, requests: [] };
    if (journal.reservedCharacters + cost > budget) throw new Error('Requested units exceed the budget for this selection');
    if (journal.requests.some(r => r.state !== 'complete')) throw new Error('Uncertain or failed request: reconcile provider history and journal manually; no automatic retries');
    for (const unit of pending) {
      const reservation = { unitId: unit.id, assetKey: unit.assetKey, characters: unit.text.length, state: 'uncertain', startedAt: new Date().toISOString() };
      journal.reservedCharacters += unit.text.length;
      journal.requests.push(reservation);
      write(journalPath, journal); // reserve BEFORE sending, including on crashes/timeouts
      const { key, voice } = credentials(plan.config, unit.lang);
      const request = { inputs: [{ text: unit.text, voice_id: voice }], model_id: plan.config.modelId,
        language_code: unit.lang, settings: plan.config.settings, seed: plan.config.seed,
        apply_text_normalization: plan.config.normalization,
        pronunciation_dictionary_locators: plan.config.pronunciation.dictionaries };
      const response = await fetch(`https://api.elevenlabs.io${plan.config.endpoint}?output_format=${encodeURIComponent(plan.config.outputFormat)}`, {
        method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal: AbortSignal.timeout(180000),
      });
      if (!response.ok) throw new Error(`Generation stopped (HTTP ${response.status}). Reserved usage retained; no automatic retry.`);
      const result = await response.json();
      const dir = `.cache/audio/units/${unit.assetKey}`;
      mkdirSync(path(dir), { recursive: true, mode: 0o700 });
      const { audio_base64, ...timings } = result;
      if (audio_base64) writeFileSync(path(`${dir}/source.mp3`), Buffer.from(audio_base64, 'base64'), { mode: 0o600 });
      const complete = Boolean(audio_base64 && reusableAlignment(result.alignment, unit.text));
      write(`${dir}/${complete ? 'result' : 'incomplete'}.json`, { schemaVersion: 1, unit, request, timings, requestId: response.headers.get('request-id') ?? response.headers.get('x-request-id'),
        config: plan.config, sourceAudioHash: audio_base64 ? hash(Buffer.from(audio_base64, 'base64')) : null,
        generatedAt: new Date().toISOString() });
      if (!complete) throw new Error('Missing audio/alignment: available response/audio retained privately; investigate the reserved request, do not retry blindly');
      reservation.state = 'complete';
      write(journalPath, journal);
      console.log(`Retained ${unit.id} (${unit.text.length} characters).`);
    }
    console.log(`Done. ${selected.length - pending.length} cached units reused; ${cost} characters submitted.`);
  } finally { releaseLock(); }
}

try {
  validateArguments();
  if (flag('help')) {
    console.log(`npm run audio:${command}${commands[command].usage ? ` -- ${commands[command].usage}` : ''}\n${commands[command].description}`);
  } else {
    // Reject missing required options before loading source files or credentials.
    if (command === 'generate') requireOption('budget');
    const plan = makePlan();
    if (command === 'plan') {
      savePlan(plan);
      report(plan);
    } else if (command === 'proofread') {
      buildProofread(plan);
    } else if (command === 'preflight') {
      console.log(JSON.stringify(await preflight(plan.config, plan.chapters.map(c => c.lang).filter((l, i, a) => a.indexOf(l) === i)), null, 2));
    } else if (command === 'generate') {
      await generate(plan);
    } else if (command === 'prepare') {
      prepare(plan, { chapter: flag('chapter') ? requireOption('chapter') : undefined,
        language: flag('language') ? requireOption('language') : undefined });
    }
  }
} catch (error) {
  // Never log API response bodies, request objects or environment values.
  console.error(`Audio: ${error.message}`);
  process.exitCode = 1;
}
