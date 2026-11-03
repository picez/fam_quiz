import type { Locale } from '@quiz/shared';
import { currentLocale, intlTag } from '../locales/current';

const FALLBACK = 'Europe/Kyiv';

function zoneOk(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('uk-UA', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Пояс глядача; запасний Europe/Kyiv; ICU без Europe/Kyiv → Europe/Kiev. */
export function viewerZone(): string {
  let zone: string | undefined;
  try {
    zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    zone = undefined;
  }
  if (zone !== undefined && zone !== '' && zoneOk(zone)) return zone;
  return zoneOk(FALLBACK) ? FALLBACK : 'Europe/Kiev';
}

interface Fields {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
}

function fields(ms: number, zone: string): Fields {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), hh: get('hour'), mm: get('minute') };
}

const pad = (n: number, size = 2) => String(n).padStart(size, '0');

/** Локальні поля в zone, прочитані як UTC, мінус сама мить (з точністю до хвилини). */
function offsetMs(ms: number, zone: string): number {
  const f = fields(ms, zone);
  return Date.UTC(f.y, f.m - 1, f.d, f.hh, f.mm) - Math.floor(ms / 60_000) * 60_000;
}

/** 'YYYY-MM-DD' дня в поясі (ключ групування). */
export function dayKey(iso: string, zone: string): string {
  const f = fields(Date.parse(iso), zone);
  return `${pad(f.y, 4)}-${pad(f.m)}-${pad(f.d)}`;
}

const headingFormats = new Map<string, Intl.DateTimeFormat>();

function headingFormat(tag: string, zone: string, withYear: boolean): Intl.DateTimeFormat {
  const key = `${tag}|${zone}|${withYear ? 'y' : ''}`;
  let format = headingFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(tag, { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}) });
    headingFormats.set(key, format);
  }
  return format;
}

/** «субота, 7 листопада» (рік — лише якщо не поточний у поясі); мова — з параметра або мова інтерфейсу. */
export function dayHeading(iso: string, zone: string, now: Date = new Date(), locale: Locale = currentLocale()): string {
  const ms = Date.parse(iso);
  const sameYear = fields(ms, zone).y === fields(now.getTime(), zone).y;
  return headingFormat(intlTag(locale), zone, !sameYear).format(new Date(ms));
}

/** «19:00». */
export function timeText(iso: string, zone: string): string {
  const f = fields(Date.parse(iso), zone);
  return `${pad(f.hh)}:${pad(f.mm)}`;
}

/** 'YYYY-MM-DDTHH:mm' (значення datetime-local) у поясі → ISO UTC; погане значення → null. */
export function localInputToIso(value: string, zone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (match === null) return null;
  const [y, m, d, hh, mm] = match.slice(1).map(Number) as [number, number, number, number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const check = new Date(guess);
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d || hh > 23 || mm > 59) return null;
  const first = guess - offsetMs(guess, zone);
  return new Date(guess - offsetMs(first, zone)).toISOString();
}

/** ISO → 'YYYY-MM-DDTHH:mm' у поясі (для форми зміни й атрибута min). */
export function isoToLocalInput(iso: string, zone: string): string {
  return `${dayKey(iso, zone)}T${timeText(iso, zone)}`;
}
