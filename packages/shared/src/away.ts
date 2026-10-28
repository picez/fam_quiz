import type { RoundType } from './quiz';

/** Антигугл (12e): поріг позначки, поріг штрафу (сумарно за запитання), пауза перевірки blur, тривалість тривоги на телефоні, мс. */
export const AWAY_MS = { mark: 2000, penalty: 3000, blurGrace: 300, alarm: 2500 } as const;
/** Скільки подій player:away людина може надіслати за секунду; понад — too_soon. */
export const AWAY_EVENTS_PER_SECOND = 4;
/** Найдовший вихід, який телефон може заявити в одному звіті, мс. */
export const AWAY_REPORT_MAX_MS = 3_600_000;
/** Раунди, де діє штраф за вихід; у «Ва-банк», «Вибуванні» й «Мільйонері» — лише позначка. */
export const AWAY_PENALTY_ROUNDS: readonly RoundType[] = ['classic', 'blitz', 'board', 'final'];

/** Позначка людини на поточному запитанні для пульта (12e): ms — закритий час без відкритого інтервалу; out — зараз поза грою. */
export interface AwayMark {
  personId: string;
  nickname: string;
  ms: number;
  count: number;
  out: boolean;
}

/** Свій вихід на поточному запитанні (12e), лише телефону цієї людини: play — індекс у plays (ключ тривоги); penalty — за це запитання буде 0. */
export interface OwnAway {
  play: number;
  ms: number;
  count: number;
  out: boolean;
  penalty: boolean;
}

/**
 * Частина виходу, коли телефон був без зв'язку (12e, правило 2): перетин розриву [dropAt, backAt] (час сервера)
 * з виходом за телефоном [returnedAt − reportedMs, returnedAt]. returnedAt — мить, коли телефон знову став видимим
 * (час сервера: мить звіту мінус sinceReturnMs). Без розриву, без повернення чи без виходу — 0.
 */
export function awayGapMs(gap: { dropAt: number; backAt: number | null } | null, reportedMs: number, returnedAt: number): number {
  if (!gap || gap.backAt === null) return 0;
  return Math.max(0, Math.min(gap.backAt, returnedAt) - Math.max(gap.dropAt, returnedAt - reportedMs));
}

/** Цілі секунди для тексту: 4999 мс → 4. */
export function awaySeconds(ms: number): number {
  return Math.floor(ms / 1000);
}
