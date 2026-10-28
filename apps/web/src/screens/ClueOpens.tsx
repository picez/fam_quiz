import type { ClueOpen } from '@quiz/shared';
import { t } from '../i18n';

/** «Хто я?» у власному темпі (12c): «Оля 1 · Петро 3 · Іра 2»; на розкритті — «Оля — на підказці 1 · Іра — без відповіді». */
export function ClueOpens({ opens, revealed, big = false }: { opens: ClueOpen[]; revealed: boolean; big?: boolean }) {
  if (opens.length === 0) return null;
  const text = (o: ClueOpen) =>
    !revealed ? t('clueOpenItem', { name: o.nickname, n: o.opened }) : o.answered ? t('clueOpenAnswered', { name: o.nickname, n: o.opened }) : t('clueOpenNone', { name: o.nickname });
  return (
    <p className={big ? 'clue-opens is-big' : 'clue-opens'} aria-label={t('clueOpensLabel')}>
      {opens.map((o, i) => (
        <span key={o.playerId} className="clue-open">
          {i > 0 && ' · '}
          {text(o)}
        </span>
      ))}
    </p>
  );
}
