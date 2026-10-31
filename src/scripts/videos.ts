// Click-to-load video facades.
import { languages, type Language } from '../data/locales';
import { t } from '../lib/i18n';

function currentLanguage(): Language {
  const lang = document.documentElement.lang as Language;
  return languages.includes(lang) ? lang : 'en';
}

export function initVideos(): void {
  const lang = currentLanguage();
  for (const figure of document.querySelectorAll<HTMLElement>('[data-video]')) {
    const button = figure.querySelector('[data-play]');
    const embed = figure.getAttribute('data-embed');
    const file = figure.getAttribute('data-video-file');
    if (!button || (!embed && !file) || figure.dataset.loaded || figure.dataset.videoWired) continue;
    figure.dataset.videoWired = 'true';
    button.addEventListener('click', () => {
      if (embed) {
        const frame = document.createElement('iframe');
        frame.src = embed;
        frame.title = button.getAttribute('aria-label') ?? t(lang, 'video.video-title', 'Video');
        frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        frame.allowFullscreen = true;
        button.replaceWith(frame);
      } else if (file) {
        const video = document.createElement('video');
        video.src = file;
        video.controls = true;
        video.autoplay = true;
        video.playsInline = true;
        button.replaceWith(video);
      }
      figure.dataset.loaded = 'true';
    }, { once: true });
  }
}
