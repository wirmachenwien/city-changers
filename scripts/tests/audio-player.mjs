import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transpileModule, ModuleKind } from 'typescript';
import { parseHTML } from 'linkedom';

const script = transpileModule(readFileSync('src/scripts/chapter-audio.ts', 'utf8'), { compilerOptions: { module: ModuleKind.None } }).outputText;
function player({ saved = {}, fail = false, failPlayback = false, highlighted = true, delayedMetadata = false } = {}) {
  const { document, window, Event } = parseHTML(`<section data-chapter-audio data-id="en/01" data-revision="new" data-cues="/cues.json" data-duration="20" data-play="Play chapter" data-pause="Pause playback" data-failed="Highlighting unavailable" data-playback-failed="Playback unavailable" hidden>
    <audio preload="none" hidden></audio><button data-play-toggle aria-label="Play chapter"></button>
    <div data-invitation>Listen</div><div data-timeline hidden><input data-position type="range" value="0" disabled><span data-elapsed></span><span data-total></span></div>
    <div class="audio-options" data-audio-options hidden><span class="drawn-select"><select data-speed></select><span data-select-value>1×</span></span><input data-highlight type="checkbox"></div><p data-audio-status></p></section>
    <div data-prose><p data-audio-block="a"><span data-audio-sentence="a-s1">One.</span> <span data-audio-sentence="a-s2">Another.</span></p><p data-audio-block="b"><span data-audio-sentence="b-s1">Two.</span></p><table data-audio-block="adapted"><tr><td>Different displayed wording</td></tr></table></div>`);
  const storage = new Map(Object.entries(saved));
  const audio = document.querySelector('audio');
  const play = document.querySelector('[data-play-toggle]');
  const position = document.querySelector('[data-position]');
  const speed = document.querySelector('[data-speed]');
  document.querySelector('[data-highlight]').checked = highlighted;
  Object.defineProperty(speed, 'value', { value: '1', writable: true });
  Object.assign(audio, { currentTime: 0, duration: 20, playbackRate: 1, readyState: 0, ended: false, paused: true, volume: .5, muted: true });
  let plays = 0, fetches = 0, loads = 0;
  const metadata = () => { audio.readyState = 1; audio.dispatchEvent(new Event('loadedmetadata')); };
  audio.load = () => { loads++; audio.error = null; audio.readyState = 0; audio.currentTime = 0; if (!delayedMetadata) metadata(); };
  audio.play = () => {
    plays++;
    if (failPlayback) return Promise.reject(new Error('Blocked playback'));
    if (audio.readyState === 0) audio.load();
    audio.paused = false;
    audio.dispatchEvent(new Event('play'));
    return Promise.resolve();
  };
  audio.pause = () => { audio.paused = true; audio.dispatchEvent(new Event('pause')); };
  runInNewContext(script, { document, window, localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) },
    fetch: async () => { fetches++; return { ok: !fail, json: async () => ({ schemaVersion: 2, granularity: 'sentence', revision: 'new', chapterId: 'en/01', cues: [{ start: 0, end: 5, blockIds: ['a'] }, { start: 6, end: 10, blockIds: ['b'] }, { start: 11, end: 15, blockIds: ['adapted'] }], sentenceCues: [
      { start: 0, end: 2, blockIds: ['a'], sentenceId: 'a-s1' }, { start: 2, end: 5, blockIds: ['a'], sentenceId: 'a-s2' },
      { start: 6, end: 10, blockIds: ['b'], sentenceId: 'b-s1' }, { start: 11, end: 15, blockIds: ['adapted'], sentenceId: 'adapted-s1' },
    ] }) }; } });
  return { document, window, Event, audio, play, position, speed, storage, metadata, loads: () => loads, counts: () => ({ plays, fetches }) };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
test('player defers loading and the timeline until play; no native volume or removed controls', () => {
  const p = player();
  assert.deepEqual(p.counts(), { plays: 0, fetches: 0 });
  assert.equal(p.document.querySelector('[data-chapter-audio]').hidden, false);
  assert.equal(p.document.querySelector('[data-chapter-audio]').hasAttribute('data-activated'), false);
  assert.equal(p.document.querySelector('[data-timeline]').hidden, true);
  assert.equal(p.document.querySelector('[data-invitation]').hidden, false);
  assert.equal(p.document.querySelector('[data-audio-options]').hidden, true);
  assert.equal(p.audio.hasAttribute('controls'), false);
  assert.equal(p.audio.volume, 1);
  assert.equal(p.audio.muted, false);
  assert.equal(p.document.querySelector('[data-seek], a[download]'), null);
});
test('inline invitation toggles playback and exposes the keyboard-accessible timeline only on first click', async () => {
  const p = player({ highlighted: false });
  p.play.click(); await settle();
  assert.equal(p.counts().plays, 1);
  assert.equal(p.document.querySelector('[data-chapter-audio]').hasAttribute('data-activated'), true);
  assert.equal(p.document.querySelector('[data-chapter-audio]').hasAttribute('data-opening'), true);
  assert.equal(p.counts().fetches, 0);
  assert.equal(p.document.querySelector('[data-timeline]').hidden, false);
  assert.equal(p.document.querySelector('[data-invitation]').hidden, true);
  assert.equal(p.document.querySelector('[data-audio-options]').hidden, false);
  assert.equal(p.play.getAttribute('aria-label'), 'Pause playback');
  assert.equal(p.position.disabled, false);
  p.play.click();
  assert.equal(p.audio.paused, true);
  assert.equal(p.play.getAttribute('aria-label'), 'Play chapter');
  assert.equal(p.document.querySelector('[data-timeline]').hidden, false);
});
test('null state hides options and does not highlight or fetch cues even when the checkbox is restored', async () => {
  const p = player({ highlighted: true });
  p.window.dispatchEvent(new p.Event('pageshow'));
  p.document.querySelector('[data-highlight]').dispatchEvent(new p.Event('change'));
  p.audio.dispatchEvent(new p.Event('timeupdate'));
  await settle();
  assert.equal(p.document.querySelector('[data-invitation]').hidden, false);
  assert.equal(p.document.querySelector('[data-timeline]').hidden, true);
  assert.equal(p.document.querySelector('[data-audio-options]').hidden, true);
  assert.equal(p.document.querySelector('[data-audio-active]'), null);
  assert.deepEqual(p.counts(), { plays: 0, fetches: 0 });
  p.play.click(); await settle();
  assert.equal(p.document.querySelector('[data-audio-options]').hidden, false);
  assert.equal(p.counts().fetches, 1);
  assert.equal(p.document.querySelector('[data-audio-active]').getAttribute('data-audio-sentence'), 'a-s1');
});
test('timeline seeks and updates time/progress without starting playback', async () => {
  const p = player();
  p.play.click(); await settle(); p.play.click();
  p.position.value = '7'; p.position.dispatchEvent(new p.Event('input'));
  assert.equal(p.audio.currentTime, 7);
  assert.equal(p.audio.paused, true);
  assert.equal(p.counts().plays, 1);
  assert.equal(p.document.querySelector('[data-elapsed]').textContent, '0:07');
  assert.equal(p.position.getAttribute('aria-valuetext'), '0:07 / 0:20');
  assert.equal(p.position.style.getPropertyValue('--audio-progress'), '35%');
  p.audio.currentTime = 12; p.audio.dispatchEvent(new p.Event('timeupdate'));
  assert.equal(p.position.value, '12');
});
test('timeline end shows speed-adjusted time remaining, including saved positions and seeking', async () => {
  const p = player({ saved: { 'chapter-audio:en/01:new': '{"position":8}', 'chapter-audio:speed': '2' } });
  const remaining = p.document.querySelector('[data-total]');
  assert.equal(remaining.textContent, '-0:06');
  p.speed.value = '1.5'; p.speed.dispatchEvent(new p.Event('change'));
  assert.equal(remaining.textContent, '-0:08');
  p.speed.value = '0.75'; p.speed.dispatchEvent(new p.Event('change'));
  assert.equal(remaining.textContent, '-0:16');
  p.position.value = '17'; p.position.dispatchEvent(new p.Event('input'));
  assert.equal(remaining.textContent, '-0:04');
  p.play.click(); await settle();
  p.audio.currentTime = 19.9; p.audio.dispatchEvent(new p.Event('timeupdate'));
  assert.equal(remaining.textContent, '-0:01', 'Round up until playback actually reaches the end');
  p.audio.currentTime = 20; p.audio.ended = true; p.audio.dispatchEvent(new p.Event('ended'));
  assert.equal(remaining.textContent, '-0:00');
});
test('player restores revision-scoped positions only on loading, and remembers valid speeds', async () => {
  const p = player({ saved: { 'chapter-audio:en/01:new': '{"position":12}', 'chapter-audio:speed': '1.5' } });
  assert.equal(p.audio.currentTime, 0);
  assert.equal(p.audio.playbackRate, 1.5);
  assert.equal(p.speed.value, '1.5');
  assert.equal(p.document.querySelector('[data-timeline]').hidden, false);
  assert.equal(p.document.querySelector('[data-invitation]').hidden, true);
  assert.equal(p.document.querySelector('[data-audio-options]').hidden, false);
  assert.equal(p.document.querySelector('[data-elapsed]').textContent, '0:12');
  assert.equal(p.position.value, '12');
  assert.deepEqual(p.counts(), { plays: 0, fetches: 1 });
  p.play.click(); await settle();
  assert.equal(p.audio.currentTime, 12);
  p.speed.value = '2'; p.speed.dispatchEvent(new p.Event('change'));
  assert.equal(p.audio.playbackRate, 2);
  assert.equal(p.storage.get('chapter-audio:speed'), '2');
  p.speed.value = '99'; p.speed.dispatchEvent(new p.Event('change'));
  assert.equal(p.audio.playbackRate, 2);
  const fresh = player({ saved: { 'chapter-audio:en/01:old': '{"position":12}' } });
  fresh.play.click(); await settle();
  assert.equal(fresh.audio.currentTime, 0);
});
test('saved playback can be seeked before loading, without autoplay or losing the chosen position', async () => {
  const p = player({ saved: { 'chapter-audio:en/01:new': '{"position":12}' } });
  p.position.value = '7'; p.position.dispatchEvent(new p.Event('input'));
  assert.equal(p.audio.currentTime, 0, 'Do not load or seek the media before the first play');
  assert.equal(p.document.querySelector('[data-elapsed]').textContent, '0:07');
  assert.equal(JSON.parse(p.storage.get('chapter-audio:en/01:new')).position, 7);
  assert.deepEqual(p.counts(), { plays: 0, fetches: 1 });
  p.play.click(); await settle();
  assert.equal(p.audio.currentTime, 7);
});
test('empty, completed, invalid and other-revision positions do not expand the timeline', () => {
  for (const position of [0, -1, 20, 999, 'bad']) {
    const p = player({ saved: { 'chapter-audio:en/01:new': JSON.stringify({ position }) } });
    assert.equal(p.document.querySelector('[data-timeline]').hidden, true);
    assert.equal(p.document.querySelector('[data-elapsed]').textContent, '0:00');
  }
  const p = player({ saved: { 'chapter-audio:en/01:old': '{"position":12}' } });
  assert.equal(p.document.querySelector('[data-timeline]').hidden, true);
});
test('player keeps controls out of the initial layout and uses keyboard-only focus styling for speed', () => {
  const component = readFileSync('src/components/ChapterAudio.astro', 'utf8');
  assert.match(component, /\.audio-display\s*\{[^}]*display: grid/);
  assert.match(component, /\.chapter-audio:not\(\[data-activated\]\) \.audio-main\s*\{[^}]*display: none/);
  assert.match(component, /\.chapter-audio \[hidden\]\s*\{[^}]*display: none/);
  assert.match(component, /\.audio-speed:has\(select:focus-visible\)/);
  assert.doesNotMatch(component, /\.audio-speed:focus-within/);
});
test('quiet invitation is inside the play button with regular-weight text and a generous touch target', () => {
  const component = readFileSync('src/components/ChapterAudio.astro', 'utf8');
  assert.match(component, /\.audio-shell\s*\{[^}]*align-items: flex-start/);
  assert.match(component, /\.audio-main\s*\{[^}]*position: relative/);
  assert.match(component, /<button class="audio-play"[^>]*>[\s\S]*?data-invitation[\s\S]*?<\/button>/);
  assert.match(component, /\.audio-invitation\s*\{[^}]*font-weight: 400/);
  assert.match(component, /\.audio-play\s*\{[^}]*min-block-size: 2\.75rem;[^}]*background: transparent/);
  assert.match(component, /\.audio-timeline\s*\{[^}]*transition: opacity/);
  assert.match(component, /\.audio-options\s*\{[^}]*transition: opacity/);
  assert.match(component, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.audio-invitation, \.audio-timeline, \.audio-options\s*\{[^}]*transition: none/);
});
test('compact soft pebble keeps icon crossfades and reduced-motion support without a press effect', () => {
  const component = readFileSync('src/components/ChapterAudio.astro', 'utf8');
  assert.match(component, /\.audio-icon-play, \.audio-icon-pause\s*\{[^}]*transition: opacity/);
  assert.match(component, /\[data-playing\] \.audio-icon-play\s*\{[^}]*opacity: 0/);
  assert.match(component, /\[data-playing\] \.audio-icon-pause\s*\{[^}]*opacity: 1/);
  assert.match(component, /\.audio-play::before\s*\{[^}]*inline-size: 2\.75rem;[^}]*background: var\(--accent-soft\)/);
  assert.doesNotMatch(component, /\.audio-play:active/);
  assert.match(component, /\.audio-icon-play, \.audio-icon-pause\s*\{[^}]*transition: none/);
});
test('activation anchors the pebble and animates only the first user activation, respecting reduced motion', async () => {
  const component = readFileSync('src/components/ChapterAudio.astro', 'utf8');
  assert.match(component, /\.audio-play\s*\{[^}]*block-size: 2\.75rem; padding: 0/);
  assert.match(component, /\[data-opening\] \.audio-play::before\s*\{[^}]*animation: audio-pebble-wake/);
  assert.match(component, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\[data-opening\] \.audio-main\s*\{ animation: none/);
  const restored = player({ saved: { 'chapter-audio:en/01:new': '{"position":7}' } });
  assert.equal(restored.document.querySelector('[data-chapter-audio]').hasAttribute('data-opening'), false);
  restored.play.click(); await settle();
  assert.equal(restored.document.querySelector('[data-chapter-audio]').hasAttribute('data-opening'), false);
});
test('volume is always full and cannot be muted through the player', () => {
  const p = player();
  p.audio.volume = .2; p.audio.muted = true;
  p.audio.dispatchEvent(new p.Event('volumechange'));
  assert.equal(p.audio.volume, 1);
  assert.equal(p.audio.muted, false);
});
test('speed uses the shared language-select shell and keeps its animated label mirror in sync', () => {
  const component = readFileSync('src/components/ChapterAudio.astro', 'utf8');
  assert.match(component, /<DrawnSelect id=\{`audio-speed-/);
  assert.doesNotMatch(component, /audio-speed-select/);
  assert.match(component, /\.drawn-select:not\(:hover\):not\(:has\(select:focus-visible\)\) > \.drawn-select__value::after\)\s*\{ content: none/);
  const p = player({ saved: { 'chapter-audio:speed': '1.5' } });
  assert.equal(p.document.querySelector('[data-select-value]').textContent, '1.5×');
  p.speed.value = '2';
  p.speed.dispatchEvent(new p.Event('change'));
  assert.equal(p.document.querySelector('[data-select-value]').textContent, '2×');
  assert.equal(p.audio.playbackRate, 2);
});
test('optional highlighting follows sentences without focus, scroll or paragraph seek buttons', async () => {
  const p = player({ highlighted: false });
  p.play.click(); await settle();
  const highlight = p.document.querySelector('[data-highlight]');
  highlight.checked = true; highlight.dispatchEvent(new p.Event('change')); await settle();
  p.audio.currentTime = 7; p.audio.dispatchEvent(new p.Event('timeupdate'));
  assert.equal(p.document.querySelector('[data-audio-active]').getAttribute('data-audio-sentence'), 'b-s1');
  p.audio.currentTime = 3; p.audio.dispatchEvent(new p.Event('timeupdate'));
  assert.equal(p.document.querySelector('[data-audio-active]').getAttribute('data-audio-sentence'), 'a-s2');
  assert.equal(p.document.querySelector('[data-audio-block="a"]').hasAttribute('data-audio-active'), false);
  assert.equal(p.document.querySelectorAll('.audio-block-seek').length, 0);
  assert.equal(p.counts().fetches, 1);
  highlight.checked = false; highlight.dispatchEvent(new p.Event('change'));
  assert.equal(p.document.querySelectorAll('[data-audio-active]').length, 0);
});
test('sentence highlighting is on by default, starts on play, and can be switched off', async () => {
  const component = readFileSync('src/components/ChapterAudio.astro', 'utf8');
  assert.match(component, /data-highlight checked/);
  assert.match(component, /\.mascot-box\)\s*\{ --read-along-fill: var\(--audio-highlight-on-tint\)/);
  assert.match(component, /:has\(> \[data-audio-heading\]\)\)\s*\{ outline: none/);
  const p = player();
  assert.equal(p.document.querySelector('[data-audio-active]'), null);
  p.play.click(); await settle();
  assert.equal(p.document.querySelector('[data-audio-active]').dataset.audioSentence, 'a-s1');
  const toggle = p.document.querySelector('[data-highlight]');
  toggle.checked = false;
  toggle.dispatchEvent(new p.Event('change'));
  assert.equal(p.document.querySelector('[data-audio-active]'), null);
});
test('adapted passages highlight their corresponding book block', async () => {
  const p = player();
  p.play.click(); await settle();
  const highlight = p.document.querySelector('[data-highlight]');
  highlight.checked = true; highlight.dispatchEvent(new p.Event('change')); await settle();
  p.audio.currentTime = 12; p.audio.dispatchEvent(new p.Event('timeupdate'));
  assert.equal(p.document.querySelector('table').hasAttribute('data-audio-active'), true);
});
test('restored highlighting loads cues without requiring the toggle to change', async () => {
  for (const restoredAt of ['initial', 'pageshow', 'play']) {
    const p = player({ saved: { 'chapter-audio:en/01:new': '{"position":7}' }, highlighted: restoredAt === 'initial' });
    if (restoredAt !== 'initial') {
      // Simulate native form-state restoration: no change event is emitted.
      p.document.querySelector('[data-highlight]').checked = true;
      if (restoredAt === 'pageshow') p.window.dispatchEvent(new p.Event('pageshow'));
      else p.play.click();
    }
    await settle();
    if (p.audio.readyState === 0) p.audio.load();
    p.audio.currentTime = 7; p.audio.dispatchEvent(new p.Event('timeupdate'));
    assert.equal(p.document.querySelector('[data-audio-active]').getAttribute('data-audio-sentence'), 'b-s1', restoredAt);
    p.window.dispatchEvent(new p.Event('pageshow')); await settle();
    assert.equal(p.counts().fetches, 1, 'Reuse cues across restoration and playback');
  }
});
test('paused restored highlighting uses the saved cursor, including seeks before first play', async () => {
  const p = player({ saved: { 'chapter-audio:en/01:new': '{"position":12}' }, highlighted: true });
  await settle();
  assert.equal(p.audio.currentTime, 0, 'Media stays unloaded and paused');
  assert.equal(p.audio.paused, true);
  assert.equal(p.document.querySelector('table').hasAttribute('data-audio-active'), true);
  assert.equal(p.document.querySelector('[data-audio-sentence="a-s1"]').hasAttribute('data-audio-active'), false);
  assert.deepEqual(p.counts(), { plays: 0, fetches: 1 });
  p.position.value = '7'; p.position.dispatchEvent(new p.Event('input'));
  assert.equal(p.document.querySelector('[data-audio-active]').getAttribute('data-audio-sentence'), 'b-s1');
  p.play.click(); await settle();
  assert.equal(p.audio.currentTime, 7);
  assert.equal(p.document.querySelector('[data-audio-active]').getAttribute('data-audio-sentence'), 'b-s1');
});
test('failed cues leave custom playback available and announce a localized error', async () => {
  const p = player({ fail: true, saved: { 'chapter-audio:en/01:new': '{"position":12}' } });
  const highlight = p.document.querySelector('[data-highlight]');
  highlight.checked = true; highlight.dispatchEvent(new p.Event('change')); await settle();
  assert.equal(highlight.checked, false);
  assert.equal(p.document.querySelector('[data-audio-status]').textContent, 'Highlighting unavailable');
  p.play.click(); await settle();
  assert.equal(p.counts().plays, 1);
});
test('failed playback restores the play button and keeps the timeline available for retry', async () => {
  const p = player({ failPlayback: true });
  p.play.click(); await settle();
  assert.equal(p.play.getAttribute('aria-label'), 'Play chapter');
  assert.equal(p.document.querySelector('[data-audio-status]').textContent, 'Playback unavailable');
  assert.equal(p.document.querySelector('[data-timeline]').hidden, false);
});
test('leaving before loading preserves saved position; ending resets it without autoplay', async () => {
  const p = player({ saved: { 'chapter-audio:en/01:new': '{"position":12}' } });
  p.window.dispatchEvent(new p.Event('pagehide'));
  assert.equal(JSON.parse(p.storage.get('chapter-audio:en/01:new')).position, 12);
  p.play.click(); await settle();
  p.audio.ended = true; p.audio.paused = true; p.audio.dispatchEvent(new p.Event('ended'));
  assert.equal(JSON.parse(p.storage.get('chapter-audio:en/01:new')).position, 0);
  assert.equal(p.counts().plays, 1);
  assert.equal(p.play.getAttribute('aria-label'), 'Play chapter');
});
test('media errors reload on retry and restore the cursor after delayed metadata, including repeated failures', async () => {
  const p = player({ delayedMetadata: true, saved: { 'chapter-audio:en/01:new': '{"position":12}' } });
  p.audio.error = { code: 4 };
  p.play.click(); await settle();
  assert.equal(p.loads(), 2, 'Explicit error reload and mock play loading');
  assert.equal(p.position.value, '12');
  p.metadata();
  assert.equal(p.audio.currentTime, 12);
  p.play.click();
  p.audio.currentTime = 7;
  p.audio.error = { code: 2 };
  p.play.click(); await settle();
  p.metadata();
  assert.equal(p.audio.currentTime, 7, 'Metadata restoration is not a one-shot listener');
  assert.equal(p.document.querySelector('[data-audio-status]').textContent, '');
});
test('ordinary play retries do not force a media reload', async () => {
  const p = player();
  p.play.click(); await settle(); p.play.click();
  const loads = p.loads();
  p.play.click(); await settle();
  assert.equal(p.loads(), loads);
});
test('retry retains the last cursor when a media failure clears native time and readyState', async () => {
  const p = player();
  p.play.click(); await settle(); p.play.click();
  p.audio.currentTime = 7;
  p.audio.dispatchEvent(new p.Event('timeupdate'));
  p.audio.currentTime = 0;
  p.audio.readyState = 0;
  p.audio.error = { code: 4 };
  p.audio.dispatchEvent(new p.Event('error'));
  p.play.click(); await settle();
  assert.equal(p.audio.currentTime, 7);
});
