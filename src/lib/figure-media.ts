// Keep URL recognition in sync with scripts/handbook/media.py and the shared fixtures.
export type FigureVideo =
  | { type: 'embed'; provider: 'youtube' | 'vimeo'; id: string; watchUrl: string; embedUrl: string; poster?: string }
  | { type: 'file'; url: string; poster?: string };

export function resolveFigureVideo(src: string, poster?: string): FigureVideo | null {
  const raw = src.trim();
  let url: URL;
  try { url = new URL(raw, 'https://figure.invalid'); }
  catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  let provider: 'youtube' | 'vimeo' | undefined;
  let id: string | undefined;
  if (host === 'youtu.be') {
    provider = 'youtube';
    id = parts[0];
  } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
    provider = 'youtube';
    id = parts[0] === 'watch' ? url.searchParams.get('v') ?? undefined
      : ['embed', 'shorts'].includes(parts[0]) ? parts[1] : undefined;
  } else if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(host)) {
    provider = 'vimeo';
    id = parts[0] === 'video' ? parts[1] : parts[0];
  }
  if (provider && id && (provider === 'youtube' ? /^[\w-]+$/ : /^\d+$/).test(id)) {
    return provider === 'youtube' ? {
      type: 'embed', provider, id,
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
      poster: poster ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    } : {
      type: 'embed', provider, id,
      watchUrl: `https://vimeo.com/${id}`,
      embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1`, poster,
    };
  }
  if (/\.(mp4|webm|mov|ogg)$/i.test(url.pathname)) return { type: 'file', url: raw, poster };
  return null;
}
