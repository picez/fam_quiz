import type { AdminLogEntry } from '@quiz/shared';
import { dayKey, KYIV_ZONE, timeText } from '../calendar/calendar-time';
import { t } from '../i18n';
import { logLine } from './admin-text';

/** 'YYYY-MM-DD HH:MM:SS' за Києвом (пояс — цілі хвилини, тож секунди ті самі, що в UTC). */
export function kyivStamp(iso: string): string {
  const seconds = String(new Date(iso).getUTCSeconds()).padStart(2, '0');
  return `${dayKey(iso, KYIV_ZONE)} ${timeText(iso, KYIV_ZONE)}:${seconds}`;
}

/** 'admin-log-YYYY-MM-DD.csv' — київська дата вивантаження. */
export function logFileName(now: Date): string {
  return `admin-log-${dayKey(now.toISOString(), KYIV_ZONE)}.csv`;
}

/** Поле CSV: початок з = + - @ табуляції чи \r Excel читає як формулу — ставимо апостроф; з ; " \r \n — у лапках. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV для Excel: BOM, роздільник ;, кінець рядка \r\n, час за Києвом. */
export function logCsv(rows: AdminLogEntry[]): string {
  const head = [t('adminLogCsvAt'), t('adminLogCsvAdmin'), t('adminLogCsvAction'), t('adminLogCsvTarget'), t('adminLogCsvDetails')];
  const lines = [head, ...rows.map((entry) => [kyivStamp(entry.at), entry.admin, entry.kind, entry.target, logLine(entry)])];
  return `﻿${lines.map((line) => line.map(cell).join(';')).join('\r\n')}\r\n`;
}
