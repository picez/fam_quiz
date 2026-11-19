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

/** Той самий настінний час у Києві через 7 днів (переходи на літній і зимовий час — без зсуву години). */
export function nextWeekKyiv(at: Date): Date {
  const ms = at.getTime();
  const wall = new Date(wallMs(ms) + (ms - Math.floor(ms / 1000) * 1000));
  const guess = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 7, wall.getUTCHours(), wall.getUTCMinutes(), wall.getUTCSeconds(), wall.getUTCMilliseconds());
  // Два проходи, як localInputToIso: зсув у самій точці може відрізнятись від зсуву в здогадці біля переходу.
  const first = guess - offsetMs(guess);
  return new Date(guess - offsetMs(first));
}
