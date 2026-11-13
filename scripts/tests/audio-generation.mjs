import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { makePlan } from '../audio/plan.mjs';
import { hash } from '../audio/content.mjs';
import { preflightFailure } from '../audio/api-errors.mjs';

test('npm network commands optionally load .env and preserve exported values (temporary fixtures only)', () => {
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
  for (const command of ['preflight', 'generate']) {
    assert.equal(scripts[`audio:${command}`], `node --env-file-if-exists=.env scripts/audio/cli.mjs ${command}`);
  }
  const tempRoot = join(tmpdir(), 'opencode');
  mkdirSync(tempRoot, { recursive: true });
  const temp = mkdtempSync(join(tempRoot, 'audio-env-test-'));
  const run = (expected, exported = {}) => spawnSync(process.execPath, [
    '--env-file-if-exists=.env', '--input-type=module', '-e',
    `if (process.env.ELEVENLABS_API_KEY !== ${JSON.stringify(expected)}) process.exit(1);`,
  ], { cwd: temp, encoding: 'utf8', env: { PATH: process.env.PATH, ...exported } });
  assert.equal(run('exported-fixture', { ELEVENLABS_API_KEY: 'exported-fixture' }).status, 0, 'Missing .env must be allowed');
  writeFileSync(join(temp, '.env'), 'ELEVENLABS_API_KEY=file-fixture\n');
  assert.equal(run('file-fixture').status, 0, 'Existing .env must load');
  assert.equal(run('exported-fixture', { ELEVENLABS_API_KEY: 'exported-fixture' }).status, 0, 'Exported values take precedence');
});

test('401 diagnostics distinguish permissions from invalid keys without leaking provider data', async () => {
  const check = { label: 'Subscription/allowance', permission: 'User: Read (user_read)' };
  const response = status => new Response(JSON.stringify({ detail: { status, message: 'Sensitive echoed key: never-log-this', voice_id: 'private-voice' } }), { status: 401 });
  const missing = await preflightFailure(response('missing_permissions'), check);
  assert.match(missing.message, /Subscription\/allowance.*401; missing_permissions/);
  assert.match(missing.message, /User: Read \(user_read\)/);
  const invalid = await preflightFailure(response('invalid_api_key'), check);
  assert.match(invalid.message, /active ElevenLabs API key/);
  const unknown = await preflightFailure(response('never-log-this'), check);
  const nonJson = await preflightFailure(new Response('never-log-this', { status: 401 }), check);
  for (const error of [missing, invalid, unknown, nonJson]) {
    assert.doesNotMatch(error.message, /never-log-this|private-voice/);
    assert.match(error.message, /exported ELEVENLABS_API_KEY overrides/);
  }
});

test('npm workflow commands offer offline help and reject invalid arguments before loading a plan', () => {
  const tempRoot = join(tmpdir(), 'opencode');
  mkdirSync(tempRoot, { recursive: true });
  const temp = mkdtempSync(join(tempRoot, 'audio-cli-test-'));
  const cli = fileURLToPath(new URL('../audio/cli.mjs', import.meta.url));
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
  const workflow = Object.keys(scripts).filter(name => name.startsWith('audio:') && !['audio:test', 'audio:check', 'audio:release'].includes(name));
  assert.deepEqual(workflow, ['audio:plan', 'audio:proofread', 'audio:preflight', 'audio:generate', 'audio:prepare']);
  // Exercise the actual npm commands in an empty fixture, never the real .env.
  writeFileSync(join(temp, 'package.json'), JSON.stringify({ scripts: Object.fromEntries(workflow.map(name => [name,
    scripts[name].replace('scripts/audio/cli.mjs', JSON.stringify(cli))])) }));
  writeFileSync(join(temp, '.env'), 'ELEVENLABS_API_KEY=fixture-only\nELEVENLABS_VOICE_ID=fixture-only\n');
  for (const name of workflow) {
    const help = spawnSync('npm', ['run', name, '--', '--help'], { cwd: temp, encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, new RegExp(`npm run ${name}`));
  }
  for (const [args, expected] of [
    [['generate'], /Required: --budget/],
    [['prepare', '--chapter'], /Required: --chapter/],
    [['prepare', '--chapter', 'en/01', '--language', 'en'], /either --chapter or --language/],
    [['generate', '--budget', '100', '--chapter', 'en/01', '--units', 'x'], /either --chapter or --units/],
    [['generate', '--budget', '100', '--budget', '200'], /Duplicate option/],
    [['generate', '--budget', '100', '--yes', '--buget', '100'], /Unexpected argument/],
    [['prepare', '--units', 'x'], /Unexpected argument/],
    [['preview'], /Unknown audio command/],
    [['publish'], /Unknown audio command/],
    [['plan', '--chapter'], /Unexpected argument/],
    [['assemble'], /Unknown audio command/],
    [['check'], /Unknown audio command/],
  ]) {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: temp, encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expected);
  }
  assert.deepEqual(readdirSync(temp).sort(), ['.env', 'package.json']);
});

test('mocked API: explicit budget, pinned voice, resumable reuse, and uncertain-request stop', () => {
  const tempRoot = join(tmpdir(), 'opencode');
  mkdirSync(tempRoot, { recursive: true });
  const temp = mkdtempSync(join(tempRoot, 'audio-generation-'));
  const write = (file, value) => { mkdirSync(join(temp, file, '..'), { recursive: true }); writeFileSync(join(temp, file), JSON.stringify(value)); };
  const plan = makePlan();
  // Copy an explicit allowlist of public source/configuration files, never .env.
  const sources = ['audio/config.json', 'audio/blocks.json', 'audio/overrides.json', 'src/data/works.json', 'src/data/glossary.json', ...plan.chapters.map(c => `src/content/book/${c.id}.mdx`)];
  for (const file of sources) { mkdirSync(join(temp, file, '..'), { recursive: true }); copyFileSync(file, join(temp, file)); }
  const config = JSON.parse(readFileSync(join(temp, 'audio/config.json'), 'utf8'));
  config.voiceHashes.en = hash('mock-voice');
  write('audio/config.json', config);
  const chapter = plan.chapters.find(c => c.id === 'en/01');
  const selectedBlocks = chapter.blocks.filter(b => b.kind === 'paragraph' && !b.adaptation && b.spoken === b.text && b.submitted === b.text).slice(0, 2);
  assert.equal(selectedBlocks.length, 2);
  const unit = chapter.units.find(u => u.blockIds.includes(selectedBlocks[0].id));
  const planModule = new URL('../audio/plan.mjs', import.meta.url).href;
  const planned = spawnSync(process.execPath, ['--input-type=module', '-e', `import{makePlan}from${JSON.stringify(planModule)};console.log(makePlan().planHash);`], { cwd: temp, encoding: 'utf8' });
  assert.equal(planned.status, 0, planned.stderr);
  const planHash = planned.stdout.trim();
  const cli = new URL('../audio/cli.mjs', import.meta.url).href;
  const bootstrap = `
    let posts = 0;
    globalThis.fetch = async (url, options = {}) => {
      if (!url.startsWith('https://api.elevenlabs.io/')) throw new Error('Unexpected network request');
      let data;
      if (options.method === 'POST') {
        posts++;
        if (process.env.MOCK_FAILURE === 'yes') throw new Error('Mock ambiguous timeout');
        const text = JSON.parse(options.body).inputs[0].text;
        data = {audio_base64: Buffer.from('mock audio, not media').toString('base64'),alignment:{characters:[...text]},normalized_alignment:{characters:[...text]}};
      } else if (url.endsWith('/v1/user/subscription')) data = {character_limit:100000,character_count:0,tier:'creator'};
      else if (url.endsWith('/v1/models')) data = [{model_id:'eleven_v4',can_do_text_to_speech:true,languages:[{language_id:'en'},{language_id:'de'},{language_id:'sl'}]}];
      else if (url.endsWith('/v1/voices/mock-voice')) data = {voice_id:'mock-voice'};
      else throw new Error('Unexpected mock route');
      return {ok:true,headers:new Headers({'request-id':'mock-request'}),json:async()=>data};
    };
    process.argv = ['node','cli','generate','--budget',process.env.MOCK_BUDGET,'--units',process.env.MOCK_UNITS,'--plan',process.env.MOCK_PLAN,'--yes'];
    await import(${JSON.stringify(cli)});
    console.log('MOCK_POSTS='+posts);
  `;
  const run = (budget, fail = false, units = unit.id) => spawnSync(process.execPath, ['--input-type=module', '-e', bootstrap], {
    cwd: temp, encoding: 'utf8', env: { PATH: process.env.PATH, ELEVENLABS_API_KEY: 'mock-key-not-a-real-key', ELEVENLABS_VOICE_ID: 'mock-voice',
      MOCK_BUDGET: String(budget), MOCK_UNITS: units, MOCK_PLAN: planHash, MOCK_FAILURE: fail ? 'yes' : 'no' },
  });
  const overBudget = run(unit.text.length - 1);
  assert.notEqual(overBudget.status, 0);
  assert.match(overBudget.stderr, /above the .*budget/);
  assert.match(overBudget.stdout, /MOCK_POSTS=0/);
  const first = run(unit.text.length);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /MOCK_POSTS=1/);
  const resumed = run(unit.text.length);
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.match(resumed.stdout, /MOCK_POSTS=0/);
  const next = chapter.units.find(u => u.blockIds.includes(selectedBlocks[1].id));
  const failed = run(next.text.length, true, next.id);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stdout, /MOCK_POSTS=1/);
  const afterFailure = run(next.text.length, false, next.id);
  assert.notEqual(afterFailure.status, 0);
  assert.match(afterFailure.stdout, /MOCK_POSTS=0/);
  assert.match(afterFailure.stderr, /manual reconciliation/);
  // Even a different budget must not silently duplicate a charged request.
  const newBudget = run(next.text.length + 10, false, next.id);
  assert.notEqual(newBudget.status, 0);
  assert.match(newBudget.stdout, /MOCK_POSTS=0/);
  for (const file of readdirSync(join(temp, '.cache/audio/journals'))) {
    assert.ok(!readFileSync(join(temp, '.cache/audio/journals', file), 'utf8').includes('mock-key-not-a-real-key'));
  }
});
