/** Пояс Києва (56); старі бази ICU знають лише Europe/Kiev. */
function kyivZone(): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Kyiv' });
    return 'Europe/Kyiv';
  } catch {
    return 'Europe/Kiev';
  }
}

const format = new Intl.DateTimeFormat('en-US', {
  timeZone: kyivZone(),
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

/** Настінний час у Києві для моменту ms — як UTC-мітка тих самих полів (до секунди). */
function wallMs(ms: number): number {
  const parts: Record<string, number> = {};
  for (const part of format.formatToParts(new Date(ms))) if (part.type !== 'literal') parts[part.type] = Number(part.value);
  return Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
}

/** Зсув Києва від UTC у момент ms. */
function offsetMs(ms: number): number {
  return wallMs(ms) - Math.floor(ms / 1000) * 1000;
}

const WALL = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Настінний час у Києві для моменту at — «HH:MM» (56: година серії, що переживає весняну «дірку»). */
export function kyivWallTime(at: Date): string {
  const wall = new Date(wallMs(at.getTime()));
  return `${String(wall.getUTCHours()).padStart(2, '0')}:${String(wall.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * Той самий настінний час у Києві через 7 днів (переходи на літній і зимовий час — без зсуву години).
 * wall («HH:MM») — година серії: якщо at зсунуло весняною «діркою» (03:30 → 04:30), наступний тиждень повертається до wall.
 */
export function nextWeekKyiv(at: Date, wall?: string | null): Date {
  const ms = at.getTime();
  const here = new Date(wallMs(ms) + (ms - Math.floor(ms / 1000) * 1000));
  const fixed = wall == null ? null : WALL.exec(wall);
  const hours = fixed === null ? here.getUTCHours() : Number(fixed[1]);
  const minutes = fixed === null ? here.getUTCMinutes() : Number(fixed[2]);
  const guess = Date.UTC(here.getUTCFullYear(), here.getUTCMonth(), here.getUTCDate() + 7, hours, minutes, here.getUTCSeconds(), here.getUTCMilliseconds());
  // Два проходи, як localInputToIso: зсув у самій точці може відрізнятись від зсуву в здогадці біля переходу.
  const first = guess - offsetMs(guess);
  return new Date(guess - offsetMs(first));
}
