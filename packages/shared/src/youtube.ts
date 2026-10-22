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
  if (raw === '') return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** Розбирає посилання YouTube (watch, youtu.be, shorts, embed; t= або start= у секундах чи 1h2m3s); null — не посилання на відео. */
export function parseYouTubeLink(link: string): Video | null {
  const text = link.trim();
  if (text === '') return null;
  // Без `URL`: рушій чистий і не знає про DOM-типи.
  const match = /^(?:https?:\/\/)?([^/?#]*)([^?#]*)(?:\?([^#]*))?/i.exec(text);
  if (!match) return null;
  const host = match[1]!.toLowerCase();
  if (!HOSTS.has(host)) return null;
  const params = new Map<string, string>();
  for (const pair of (match[3] ?? '').split('&')) {
    const eq = pair.indexOf('=');
    const key = eq < 0 ? pair : pair.slice(0, eq);
    if (key !== '' && !params.has(key)) params.set(key, eq < 0 ? '' : pair.slice(eq + 1));
  }

  const segments = match[2]!.split('/').filter(Boolean);
  let id: string | undefined;
  if (host === 'youtu.be') {
    if (segments.length === 1) id = segments[0];
  } else if (segments.length === 1 && segments[0] === 'watch') {
    id = params.get('v');
  } else if (segments.length === 2 && (segments[0] === 'shorts' || segments[0] === 'embed')) {
    id = segments[1];
  }
  if (id === undefined) return null;

  const rawStart = params.get('t') ?? params.get('start');
  let start = 0;
  if (rawStart !== undefined) {
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
