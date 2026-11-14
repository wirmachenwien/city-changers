import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { makePlan } from '../audio/plan.mjs';
import { hash } from '../audio/content.mjs';
import { preflightFailure } from '../audio/api-errors.mjs';
import { narrationKey, legacyNarrationKey, publicationNarrationKey, retainedNarrationKey } from '../audio/narration-key.mjs';

test('speech keys ignore offline processing but pin generation inputs and preserve published fingerprints', () => {
  const config = JSON.parse(readFileSync('audio/config.json', 'utf8'));
  const key = narrationKey(config, 'Test.', 'en');
  assert.equal(publicationNarrationKey(config, 'Test.', 'en'), legacyNarrationKey(config, 'Test.', 'en'));
  const encoded = structuredClone(config);
  encoded.processing.chapterMp3Bitrate = '64k';
  encoded.processing.audiobookAacBitrate = '48k';
  assert.equal(narrationKey(encoded, 'Test.', 'en'), key);
  assert.equal(publicationNarrationKey(encoded, 'Test.', 'en'), publicationNarrationKey(config, 'Test.', 'en'));
  for (const field of ['modelId', 'endpoint', 'outputFormat', 'settings', 'seed', 'normalization', 'pronunciation', 'voices', 'voiceHashes']) {
    const changed = structuredClone(config);
    if (field === 'pronunciation') changed.pronunciation.version++;
    else if (field === 'settings') changed.settings.stability = .25;
    else if (field === 'voices' || field === 'voiceHashes') changed[field].en = 'changed';
    else changed[field] = 'changed';
    assert.notEqual(narrationKey(changed, 'Test.', 'en'), key, field);
  }
  assert.notEqual(narrationKey(config, 'Edited.', 'en'), key);
  assert.notEqual(narrationKey(config, 'Test.', 'de'), key);
  const retainedConfig = { ...config, voiceHashes: { ...config.voiceHashes, en: hash('fixture-voice') } };
  const record = { config: retainedConfig, unit: { lang: 'en', text: 'Test.', cacheKey: legacyNarrationKey(retainedConfig, 'Test.', 'en') },
    request: { inputs: [{ voice_id: 'fixture-voice' }] } };
  assert.equal(retainedNarrationKey(record), narrationKey(retainedConfig, 'Test.', 'en'));
  assert.equal(retainedNarrationKey({ ...record, request: { inputs: [{ voice_id: 'another-voice' }] } }), null);
});

test('preparation shares the generation lock and releases it after failure', async () => {
  const parent = join(tmpdir(), 'opencode');
  mkdirSync(parent, { recursive: true });
  const temp = mkdtempSync(join(parent, 'audio-lock-'));
  const lockUrl = new URL('../audio/lock.mjs', import.meta.url).href;
  const mediaUrl = new URL('../audio/media.mjs', import.meta.url).href;
  const holder = spawn(process.execPath, ['--input-type=module', '-e', `
    import {acquireAudioLock} from ${JSON.stringify(lockUrl)};
    const release=acquireAudioLock();process.send('locked');
    process.once('message',()=>{release();process.disconnect();});
  `], { cwd: temp, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  try {
    await once(holder, 'message');
    const blocked = spawnSync(process.execPath, ['--input-type=module', '-e', `import{prepare}from${JSON.stringify(mediaUrl)};prepare({});`], { cwd: temp, encoding: 'utf8' });
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /Another audio generate\/prepare run holds the lock/);
    assert.deepEqual(readdirSync(join(temp, '.cache/audio')), ['generation.lock']);
  } finally {
    const exited = once(holder, 'exit');
    holder.send('release');
    await exited;
  }
  const failed = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import{prepare}from${JSON.stringify(mediaUrl)};import{existsSync}from'node:fs';
    try{prepare({get chapters(){if(!existsSync('.cache/audio/generation.lock'))throw Error('Lock missing');throw Error('Fixture failure');}});}
    catch(error){if(error.message!=='Fixture failure')throw error;}
    if(existsSync('.cache/audio/generation.lock'))throw Error('Lock leaked');
  `], { cwd: temp, encoding: 'utf8' });
  assert.equal(failed.status, 0, failed.stderr);
});

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
    let posts = 0, fetches = 0;
    globalThis.fetch = async (url, options = {}) => {
      fetches++;
      if (!url.startsWith('https://api.elevenlabs.io/')) throw new Error('Unexpected network request');
      let data;
      if (options.method === 'POST') {
        posts++;
        if (process.env.MOCK_FAILURE === 'yes') throw new Error('Mock ambiguous timeout');
        const text = JSON.parse(options.body).inputs[0].text;
        const alignment = {characters:[...text],character_start_times_seconds:[...text].map((_,i)=>i*.01),character_end_times_seconds:[...text].map((_,i)=>(i+1)*.01)};
        data = {audio_base64: Buffer.from('mock audio, not media').toString('base64'),alignment,normalized_alignment:alignment};
      } else if (url.endsWith('/v1/user/subscription')) data = {character_limit:100000,character_count:0,tier:'creator'};
      else if (url.endsWith('/v1/models')) data = [{model_id:'eleven_v4',can_do_text_to_speech:true,languages:[{language_id:'en'},{language_id:'de'},{language_id:'sl'}]}];
      else if (url.endsWith('/v1/voices/mock-voice')) data = {voice_id:'mock-voice'};
      else throw new Error('Unexpected mock route');
      return {ok:true,headers:new Headers({'request-id':'mock-request'}),json:async()=>data};
    };
    process.argv = ['node','cli','generate','--budget',process.env.MOCK_BUDGET,'--units',process.env.MOCK_UNITS,'--plan',process.env.MOCK_PLAN,'--yes'];
    await import(${JSON.stringify(cli)});
    console.log('MOCK_POSTS='+posts);
    console.log('MOCK_FETCHES='+fetches);
  `;
  const run = (budget, fail = false, units = unit.id, key = 'mock-key-not-a-real-key', expectedPlan = planHash) => spawnSync(process.execPath, ['--input-type=module', '-e', bootstrap], {
    cwd: temp, encoding: 'utf8', env: { PATH: process.env.PATH, ELEVENLABS_API_KEY: key, ELEVENLABS_VOICE_ID: 'mock-voice',
      MOCK_BUDGET: String(budget), MOCK_UNITS: units, MOCK_PLAN: expectedPlan, MOCK_FAILURE: fail ? 'yes' : 'no' },
  });
  for (const separator of ['\r', '\n', '\r\n']) {
    const invalid = run(unit.text.length, false, unit.id, `private-fixture-key${separator}private-fixture-suffix`);
    assert.notEqual(invalid.status, 0);
    assert.equal(invalid.stderr.trim(), 'Audio: The API key contains a line break. Correct it locally; do not share its value.');
    assert.match(invalid.stdout, /MOCK_POSTS=0/);
    assert.match(invalid.stdout, /MOCK_FETCHES=0/);
    assert.doesNotMatch(invalid.stdout + invalid.stderr, /private-fixture-key|private-fixture-suffix/);
    assert.ok(!readdirSync(temp).includes('.cache'), 'Credential rejection must happen before reservations');
  }
  const overBudget = run(unit.text.length - 1);
  assert.notEqual(overBudget.status, 0);
  assert.match(overBudget.stderr, /above the .*budget/);
  assert.match(overBudget.stdout, /MOCK_POSTS=0/);
  const first = run(unit.text.length);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /MOCK_POSTS=1/);
  // Model an actual legacy recording under its original processing-inclusive
  // directory. Reading it must not rewrite private records or duplicate speech.
  const originalKey = readdirSync(join(temp, '.cache/audio/units'))[0];
  const originalDirectory = join(temp, '.cache/audio/units', originalKey);
  const legacyResult = JSON.parse(readFileSync(join(originalDirectory, 'result.json'), 'utf8'));
  legacyResult.unit.cacheKey = legacyNarrationKey(legacyResult.config, legacyResult.unit.text, 'en');
  writeFileSync(join(originalDirectory, 'result.json'), JSON.stringify(legacyResult));
  const legacyKey = hash({ cacheKey: legacyResult.unit.cacheKey, voice: 'mock-voice' });
  const legacyDirectory = join(temp, '.cache/audio/units', legacyKey);
  renameSync(originalDirectory, legacyDirectory);
  const retainedRecord = readFileSync(join(legacyDirectory, 'result.json'));
  write('audio/config.json', { ...config, processing: { ...config.processing, chapterMp3Bitrate: '64k', audiobookAacBitrate: '48k' } });
  const changedPlan = spawnSync(process.execPath, ['--input-type=module', '-e', `import{makePlan}from${JSON.stringify(planModule)};console.log(makePlan().planHash);`], { cwd: temp, encoding: 'utf8' });
  assert.equal(changedPlan.status, 0, changedPlan.stderr);
  const reencoded = run(unit.text.length, false, unit.id, 'mock-key-not-a-real-key', changedPlan.stdout.trim());
  assert.equal(reencoded.status, 0, reencoded.stderr);
  assert.match(reencoded.stdout, /MOCK_FETCHES=0/);
  assert.deepEqual(readFileSync(join(legacyDirectory, 'result.json')), retainedRecord);
  assert.deepEqual(readdirSync(join(temp, '.cache/audio/units')), [legacyKey]);
  // Corrupt legacy recordings still fail closed instead of triggering a paid replacement.
  const sourceFile = join(legacyDirectory, 'source.mp3');
  const sourceBytes = readFileSync(sourceFile);
  writeFileSync(sourceFile, 'corrupt');
  const corrupt = run(unit.text.length, false, unit.id, 'mock-key-not-a-real-key', changedPlan.stdout.trim());
  assert.notEqual(corrupt.status, 0);
  assert.match(corrupt.stderr, /incomplete or corrupt/);
  assert.match(corrupt.stdout, /MOCK_FETCHES=0/);
  writeFileSync(sourceFile, sourceBytes);
  write('audio/config.json', config);
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

for (const scenario of ['preflight-race', 'preflight-partial-race', 'allowance-under-lock', 'missing-alignment', 'invalid-alignment', 'legacy-incomplete', 'uncertain-complete', 'malformed-preflight-json', 'malformed-generation-json']) {
  test(`generation safety: ${scenario}`, () => {
    const directory = join(tmpdir(), 'opencode');
    mkdirSync(directory, { recursive: true });
    const temp = mkdtempSync(join(directory, 'audio-safety-'));
    const plan = makePlan();
    for (const file of ['audio/config.json', 'audio/blocks.json', 'audio/overrides.json', 'audio/sentence-timing-corrections.json',
      'src/data/works.json', 'src/data/glossary.json', ...plan.chapters.map(c => `src/content/book/${c.id}.mdx`)]) {
      mkdirSync(join(temp, file, '..'), { recursive: true });
      copyFileSync(file, join(temp, file));
    }
    const config = JSON.parse(readFileSync(join(temp, 'audio/config.json'), 'utf8'));
    config.voiceHashes.en = hash('mock-voice');
    writeFileSync(join(temp, 'audio/config.json'), JSON.stringify(config));
    const planUrl = new URL('../audio/plan.mjs', import.meta.url).href;
    const contentUrl = new URL('../audio/content.mjs', import.meta.url).href;
    const cli = new URL('../audio/cli.mjs', import.meta.url).href;
    const bootstrap = `
      import {makePlan,write,assets} from ${JSON.stringify(planUrl)};
      import {hash} from ${JSON.stringify(contentUrl)};
      import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
      const plan=makePlan(), units=plan.chapters.find(c=>c.id==='en/01').units, unit=units[0];
      const scenario=${JSON.stringify(scenario)};
      const key=hash({cacheKey:unit.cacheKey,voice:'mock-voice'}), dir='.cache/audio/units/'+key;
      const audio=Buffer.from('retained fixture');
      const alignment={characters:[...unit.text],character_start_times_seconds:[...unit.text].map((_,i)=>i*.01),character_end_times_seconds:[...unit.text].map((_,i)=>(i+1)*.01)};
      const retain=(complete=true)=>{mkdirSync(dir,{recursive:true});writeFileSync(dir+'/source.mp3',audio);write(dir+'/result.json',{unit,sourceAudioHash:hash(audio),timings:complete?{alignment}:{}});};
      if(scenario==='legacy-incomplete')retain(false);
      if(scenario==='uncertain-complete'){retain();write('.cache/audio/journals/old.json',{requests:[{state:'uncertain'}]});}
      let posts=0;
      globalThis.fetch=async(url,options={})=>{
        let data;
        if(options.method==='POST'){
          posts++;
          if(scenario==='malformed-generation-json')return new Response('private-response-fixture',{status:200});
          data={audio_base64:audio.toString('base64')};
          if(scenario==='preflight-partial-race'){
            const text=JSON.parse(options.body).inputs[0].text;
            data.alignment={characters:[...text],character_start_times_seconds:[...text].map((_,i)=>i*.01),character_end_times_seconds:[...text].map((_,i)=>(i+1)*.01)};
          }
          if(scenario==='invalid-alignment')data.alignment={...alignment,character_end_times_seconds:[]};
        }else if(url.endsWith('/v1/user/subscription')){
          if(scenario==='malformed-preflight-json')return new Response('private-response-fixture',{status:200});
          if(!existsSync('.cache/audio/generation.lock'))throw Error('Allowance read without generation lock');
          if(scenario.startsWith('preflight-')){retain();write('.cache/audio/journals/other-budget.json',{requests:[{state:'complete'}]});}
          data={character_limit:100000,character_count:scenario==='allowance-under-lock'?100000:0,tier:'fixture'};
        }else if(url.endsWith('/v1/models'))data=[{model_id:'eleven_v4',can_do_text_to_speech:true,languages:[{language_id:'en'}]}];
        else data={voice_id:'mock-voice'};
        return {ok:true,headers:new Headers(),json:async()=>data};
      };
      process.argv=scenario==='malformed-preflight-json'?['node','cli','preflight']:['node','cli','generate','--budget','10000','--units',scenario==='preflight-partial-race'?unit.id+','+units[1].id:unit.id,'--yes'];
      await import(${JSON.stringify(cli)});
      console.log(JSON.stringify({posts,reusable:assets().length,result:existsSync(dir+'/result.json'),incomplete:existsSync(dir+'/incomplete.json')}));
    `;
    const run = () => spawnSync(process.execPath, ['--input-type=module', '-e', bootstrap], {
      cwd: temp, encoding: 'utf8', env: { PATH: process.env.PATH, ELEVENLABS_API_KEY: 'mock-key', ELEVENLABS_VOICE_ID: 'mock-voice' },
    });
    const result = run();
    const state = JSON.parse(result.stdout.trim().split('\n').at(-1));
    if (scenario.startsWith('preflight-')) {
      assert.equal(result.status, 0, result.stderr);
      assert.equal(state.posts, scenario === 'preflight-race' ? 0 : 1);
      assert.equal(state.reusable, scenario === 'preflight-race' ? 1 : 2);
    } else {
      assert.notEqual(result.status, 0);
      if (scenario === 'allowance-under-lock') assert.match(result.stderr, /remaining account allowance/);
      assert.equal(state.posts, ['missing-alignment', 'invalid-alignment', 'malformed-generation-json'].includes(scenario) ? 1 : 0);
      if (scenario !== 'uncertain-complete') assert.equal(state.reusable, 0);
      if (scenario.endsWith('-alignment')) {
        assert.equal(state.result, false);
        assert.equal(state.incomplete, true);
        const resumed = run();
        assert.notEqual(resumed.status, 0);
        assert.equal(JSON.parse(resumed.stdout.trim().split('\n').at(-1)).posts, 0);
      }
      if (scenario.startsWith('malformed-')) {
        assert.doesNotMatch(result.stdout + result.stderr, /private-response-fixture/);
        assert.equal(result.stderr.trim(), scenario === 'malformed-preflight-json'
          ? 'Audio: Provider preflight response could not be decoded as JSON. Response content was not logged.'
          : 'Audio: Generation response could not be decoded as JSON. Reserved usage retained; reconcile the request manually; no automatic retry.');
        assert.equal(existsSync(join(temp, '.cache/audio/generation.lock')), false);
        if (scenario === 'malformed-generation-json') {
          const journalFiles = readdirSync(join(temp, '.cache/audio/journals'));
          assert.equal(journalFiles.length, 1);
          const journal = JSON.parse(readFileSync(join(temp, '.cache/audio/journals', journalFiles[0]), 'utf8'));
          assert.equal(journal.reservedCharacters, journal.requests[0].characters);
          assert.deepEqual(journal.requests.map(r => r.state), ['uncertain']);
          const resumed = run();
          assert.notEqual(resumed.status, 0);
          assert.equal(JSON.parse(resumed.stdout.trim().split('\n').at(-1)).posts, 0);
          assert.match(resumed.stderr, /manual reconciliation/);
        } else assert.equal(existsSync(join(temp, '.cache/audio/journals')), false);
      }
    }
  });
}
