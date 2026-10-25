import type { PlayerView } from '@quiz/shared';
import { num } from '../format';
import { t } from '../i18n';

/** Смуга залу над полем відповіді: хто йде драбиною й скільки дасть правильна відповідь; після закриття залу — «уже проголосував». */
export function LadderHall({ view }: { view: PlayerView }) {
  const own = view.me.ladder;
  const info = view.ladder;
  if (own === null || info === null || own.role !== 'hall') return null;
  if (own.hallClosed) {
    return (
      <p className="lead ladder-hall is-closed" role="status">
        {t('ladderHallClosed')}
      </p>
    );
  }
  if (own.hallPoints === null || info.contestant === null) return null;
  return (
    <p className="lead ladder-hall" role="status">
      {t('ladderHallBanner', { name: info.contestant.nickname, points: num(own.hallPoints) })}
    </p>
  );
}
