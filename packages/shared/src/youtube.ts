import { videoSchema, type Video } from './quiz';

const HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

/** Позначка часу: секунди (`90`, `90s`) або `1h2m3s`, `1m30s`, `2m`; null — неправильна. */
function parseStart(raw: string): number | null {
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  if (!m || raw === '') return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** Розбирає посилання YouTube (watch, youtu.be, shorts, embed; t= або start= у секундах чи 1h2m3s); null — не посилання на відео. */
export function parseYouTubeLink(link: string): Video | null {
  const text = link.trim();
  if (text === '') return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !HOSTS.has(url.hostname)) return null;

  const segments = url.pathname.split('/').filter(Boolean);
  let id: string | undefined;
  if (url.hostname === 'youtu.be') {
    if (segments.length === 1) id = segments[0];
  } else if (segments.length === 1 && segments[0] === 'watch') {
    id = url.searchParams.get('v') ?? undefined;
  } else if (segments.length === 2 && (segments[0] === 'shorts' || segments[0] === 'embed')) {
    id = segments[1];
  }
  if (id === undefined) return null;

  const rawStart = url.searchParams.get('t') ?? url.searchParams.get('start');
  let start = 0;
  if (rawStart !== null) {
    const parsed = parseStart(rawStart);
    if (parsed === null) return null;
    start = parsed;
  }
  const result = videoSchema.safeParse({ id, start });
  return result.success ? result.data : null;
}

/** Коротке посилання для поля редактора: https://youtu.be/<id> і ?t=<start>, якщо start > 0. */
export function videoLink(video: Video): string {
  return `https://youtu.be/${video.id}${video.start > 0 ? `?t=${video.start}` : ''}`;
}
