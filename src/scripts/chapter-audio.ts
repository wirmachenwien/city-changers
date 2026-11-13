interface Cue { start: number; end: number; blockIds: string[]; }
interface SentenceCue extends Cue { sentenceId: string; }
for (const root of document.querySelectorAll<HTMLElement>('[data-chapter-audio]')) {
  const audio = root.querySelector('audio')!;
  const play = root.querySelector<HTMLButtonElement>('[data-play-toggle]')!;
  const timeline = root.querySelector<HTMLElement>('[data-timeline]')!;
  const invitation = root.querySelector<HTMLElement>('[data-invitation]')!;
  const options = root.querySelector<HTMLElement>('[data-audio-options]')!;
  const position = root.querySelector<HTMLInputElement>('[data-position]')!;
  const elapsed = root.querySelector<HTMLElement>('[data-elapsed]')!;
  const total = root.querySelector<HTMLElement>('[data-total]')!;
  const status = root.querySelector<HTMLElement>('[data-audio-status]')!;
  const speed = root.querySelector<HTMLSelectElement>('[data-speed]')!;
  const highlight = root.querySelector<HTMLInputElement>('[data-highlight]')!;
  const key = `chapter-audio:${root.dataset.id}:${root.dataset.revision}`;
  const rates = [0.75, 1, 1.25, 1.5, 1.75, 2];
  let savedPosition = 0;
  let playRequested = false;
  let activated = false;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (Number.isFinite(saved.position) && saved.position >= 0) savedPosition = saved.position;
    const rate = Number(localStorage.getItem('chapter-audio:speed') ?? 1);
    if (rates.includes(rate)) audio.playbackRate = rate;
  } catch { /* Storage is optional. */ }
  speed.value = String(audio.playbackRate);
  const speedLabel = speed.closest('.drawn-select')?.querySelector<HTMLElement>('[data-select-value]');
  const syncSpeedLabel = () => { if (speedLabel) speedLabel.textContent = `${speed.value}×`; };
  syncSpeedLabel();
  const fixedVolume = () => {
    if (audio.volume !== 1) audio.volume = 1;
    if (audio.muted) audio.muted = false;
  };
  fixedVolume();
  audio.addEventListener('volumechange', fixedVolume);
  const formatTime = (seconds: number) => {
    const value = Math.max(0, Math.floor(seconds));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  };
  const duration = () => Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Number(root.dataset.duration) || 0;
  if (duration() > 0 && savedPosition >= duration() - 1) savedPosition = 0;
  const showTimeline = () => {
    activated = true;
    root.setAttribute('data-activated', '');
    timeline.hidden = false;
    invitation.hidden = true;
    options.hidden = false;
  };
  if (savedPosition > 0) showTimeline();
  // Before media loads, the saved/queued seek position is the listening cursor,
  // not the audio element's still-zero currentTime. Share it with read-along.
  const playbackPosition = () => audio.readyState === 0 ? savedPosition : audio.currentTime || 0;
  function updatePosition() {
    const seconds = duration();
    const time = Math.min(Math.max(0, playbackPosition()), seconds);
    position.max = String(seconds);
    position.value = String(time);
    position.disabled = seconds <= 0;
    position.setAttribute('aria-valuetext', `${formatTime(time)} / ${formatTime(seconds)}`);
    position.style.setProperty('--audio-progress', `${seconds ? time / seconds * 100 : 0}%`);
    elapsed.textContent = formatTime(time);
    const rate = Number.isFinite(audio.playbackRate) && audio.playbackRate > 0 ? audio.playbackRate : 1;
    total.textContent = `-${formatTime(Math.ceil((seconds - time) / rate))}`;
  }
  function updatePlayback() {
    const playing = !audio.paused && !audio.ended;
    root.toggleAttribute('data-playing', playing);
    play.setAttribute('aria-label', (!activated ? root.getAttribute('aria-label') : playing ? root.dataset.pause : root.dataset.play) ?? root.dataset.play!);
  }
  audio.addEventListener('loadedmetadata', () => {
    if (savedPosition < audio.duration - 1) audio.currentTime = savedPosition;
    savedPosition = 0;
    updatePosition();
    updateHighlight();
  }, { once: true });
  audio.addEventListener('durationchange', updatePosition);
  audio.addEventListener('ratechange', updatePosition);
  const save = () => {
    try {
      localStorage.setItem(key, JSON.stringify({ position: audio.ended ? 0 : audio.readyState === 0 ? savedPosition : audio.currentTime }));
      localStorage.setItem('chapter-audio:speed', String(audio.playbackRate));
    } catch { /* Private browsing/quota restrictions must not break playback. */ }
  };
  play.addEventListener('click', async () => {
    if (!activated) root.setAttribute('data-opening', '');
    showTimeline();
    if (playRequested || !audio.paused) {
      playRequested = false;
      audio.pause();
      return;
    }
    playRequested = true;
    status.textContent = '';
    fixedVolume();
    try { await audio.play(); }
    catch {
      if (playRequested) status.textContent = root.dataset.playbackFailed!;
    } finally {
      playRequested = false;
      updatePlayback();
    }
  });
  position.addEventListener('input', () => {
    if (!activated || position.disabled) return;
    const value = Number(position.value);
    if (!Number.isFinite(value)) return;
    const time = Math.max(0, Math.min(value, duration()));
    if (audio.readyState === 0) savedPosition = time;
    else { savedPosition = 0; audio.currentTime = time; }
    updatePosition();
    updateHighlight();
    save();
  });
  speed.addEventListener('change', () => {
    const rate = Number(speed.value);
    if (rates.includes(rate)) audio.playbackRate = rate;
    speed.value = String(audio.playbackRate);
    syncSpeedLabel();
    updatePosition();
    save();
  });
  audio.addEventListener('play', updatePlayback);
  audio.addEventListener('pause', () => { updatePlayback(); save(); });
  audio.addEventListener('ended', () => { updatePlayback(); updatePosition(); clear(); save(); });
  audio.addEventListener('error', () => { status.textContent = root.dataset.playbackFailed!; updatePlayback(); });
  window.addEventListener('pagehide', save);
  let lastSaved = 0;
  let sentenceCues: SentenceCue[] = [];
  let loading: Promise<void> | undefined;
  const targets = [...document.querySelectorAll<HTMLElement>('[data-prose] [data-audio-block]')];
  const sentenceTargets = [...document.querySelectorAll<HTMLElement>('[data-prose] [data-audio-sentence]')];
  const clear = () => [...targets, ...sentenceTargets].forEach(el => el.removeAttribute('data-audio-active'));
  function updateHighlight() {
    clear();
    if (!activated || !highlight.checked) return;
    const time = playbackPosition();
    const active = sentenceCues.filter(c => c.start <= time && c.end > time);
    const ids = active.map(c => c.sentenceId);
    sentenceTargets.forEach(el => {
      if (ids.includes(el.dataset.audioSentence!)) el.setAttribute('data-audio-active', '');
    });
    // Adapted passages highlight the corresponding source block instead of
    // pretending its visible wording is identical to the narration.
    targets.forEach(el => {
      const blocks = el.dataset.audioBlock!.split(' ');
      const mapped = active.filter(c => c.blockIds.some(id => blocks.includes(id)));
      const hooks = [...el.querySelectorAll<HTMLElement>('[data-audio-sentence]')].map(span => span.dataset.audioSentence);
      if (mapped.some(c => !hooks.includes(c.sentenceId))) el.setAttribute('data-audio-active', '');
    });
  }
  async function load() {
    if (loading) return loading;
    loading = (async () => {
      try {
        const response = await fetch(root.dataset.cues!);
        if (!response.ok) throw new Error('Cues unavailable');
        const result = await response.json();
        if (result.schemaVersion !== 2 || result.granularity !== 'sentence' || result.revision !== root.dataset.revision || result.chapterId !== root.dataset.id || !Array.isArray(result.cues) || !Array.isArray(result.sentenceCues) || !result.sentenceCues.length) throw new Error('Wrong cue revision');
        for (const list of [result.cues, result.sentenceCues]) {
          let end = 0;
          const seen = new Set();
          for (const cue of list) {
            if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.start < end - .001 || cue.end <= cue.start || !Array.isArray(cue.blockIds)) throw new Error('Invalid cues');
            if (list === result.sentenceCues && (typeof cue.sentenceId !== 'string' || seen.has(cue.sentenceId))) throw new Error('Invalid sentence ID');
            seen.add(cue.sentenceId);
            end = cue.end;
          }
        }
        sentenceCues = result.sentenceCues;
        updateHighlight();
      } catch {
        status.textContent = root.dataset.failed!;
        highlight.checked = false;
        loading = undefined;
        clear();
      }
    })();
    return loading;
  }
  highlight.addEventListener('change', async () => { if (activated && highlight.checked) await load(); updateHighlight(); });
  // Reload/history restoration can restore a checked input without a change
  // event, including after this script runs. Load its cues on restoration and
  // on play as well, without fetching anything when highlighting is off.
  const restoreHighlight = () => { if (activated && highlight.checked) void load(); else clear(); };
  window.addEventListener('pageshow', restoreHighlight);
  audio.addEventListener('play', restoreHighlight);
  restoreHighlight();
  audio.addEventListener('timeupdate', () => {
    updatePosition();
    updateHighlight();
    if (Date.now() - lastSaved > 5000) { save(); lastSaved = Date.now(); }
  });
  updatePosition();
  updatePlayback();
  root.hidden = false;
  // No forced scrolling, focus movement, autoplay or cross-page player.
}
