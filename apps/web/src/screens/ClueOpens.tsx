import type { ClueOpen } from '@quiz/shared';
import { t } from '../i18n';

/**
 * Скільки імен сцена показує, решта — «та ще N»: найдовше ім'я (20 символів) у рядку 1280 px (1152 px) —
 * «Ім'я 3» по 1,3rem — четверо в рядку, два рядки; «Ім'я — на підказці 3» по 1,2rem — троє в рядку (≈370 px), три рядки.
 * Останнє місце бере «та ще N», тож імена ніколи не ховаються мовчки. Розкриття — 1,2rem: по 1,3rem там влазять лише двоє.
 */
export const STAGE_OPENS_MAX = { asked: 7, revealed: 7 } as const;

/** «Хто я?» у власному темпі (12c): «Оля 1 · Петро 3 · Іра 2»; на розкритті — «Оля — на підказці 1 · Іра — без відповіді». big — сцена: не більше STAGE_OPENS_MAX імен. */
export function ClueOpens({ opens, revealed, big = false }: { opens: ClueOpen[]; revealed: boolean; big?: boolean }) {
  if (opens.length === 0) return null;
  const text = (o: ClueOpen) =>
    !revealed ? t('clueOpenItem', { name: o.nickname, n: o.opened }) : o.answered ? t('clueOpenAnswered', { name: o.nickname, n: o.opened }) : t('clueOpenNone', { name: o.nickname });
  const max = big ? STAGE_OPENS_MAX[revealed ? 'revealed' : 'asked'] : opens.length;
  const shown = opens.length > max ? opens.slice(0, max) : opens;
  const rest = opens.length - shown.length;
  const className = ['clue-opens', big && 'is-big', revealed && 'is-revealed'].filter(Boolean).join(' ');
  return (
    <p className={className} role="group" aria-label={t('clueOpensLabel')}>
      {shown.map((o) => (
        <span key={o.playerId} className="clue-open">
          {text(o)}
        </span>
      ))}
      {rest > 0 && <span className="clue-open is-more">{t('clueOpensMore', { n: rest })}</span>}
    </p>
  );
}
