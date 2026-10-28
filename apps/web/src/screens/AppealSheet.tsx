import type { AppealView, PlayerAppeal } from '@quiz/shared';
import { appealAsk, appealCountText, appealTitle } from '../appeal-text';
import { t } from '../i18n';
import type { Send } from '../live/types';
import { useGuardedSend } from '../live/useGuardedSend';
import { AppealTime } from './AppealCard';

/**
 * Нижній аркуш голосу (12f) для виборця: заголовок, питання, [Так] [Ні] з aria-pressed свого голосу, лічильник і відлік;
 * після голосу — «Твій голос: так · можна змінити до кінця». Шле player:appeal-vote { appealId, yes }. На паузі кнопки неактивні.
 */
export function AppealSheet({
  view,
  mine,
  teams,
  paused,
  offsetMs,
  send,
  onError,
}: {
  view: AppealView;
  mine: PlayerAppeal;
  teams: boolean;
  paused: boolean;
  offsetMs: number;
  send: Send;
  onError: (message: string | null) => void;
}) {
  const guard = useGuardedSend(send, onError);
  if (view.outcome !== null || !mine.voter) return null;
  const title = appealTitle(view, teams);
  const vote = (yes: boolean) => void guard.run('player:appeal-vote', { appealId: view.id, yes });
  return (
    <section className="appeal-sheet" aria-label={title}>
      <h2 className="appeal-title">{title}</h2>
      <p className="appeal-ask">{appealAsk(view)}</p>
      <div className="appeal-votes">
        <button type="button" className="btn appeal-yes" aria-pressed={mine.vote === true} disabled={paused || guard.busy} onClick={() => vote(true)}>
          {t('appealYes')}
        </button>
        <button type="button" className="btn appeal-no" aria-pressed={mine.vote === false} disabled={paused || guard.busy} onClick={() => vote(false)}>
          {t('appealNo')}
        </button>
      </div>
      <div className="appeal-meta">
        <p className="appeal-count" aria-live="polite">
          {appealCountText(view)}
        </p>
        <AppealTime view={view} offsetMs={offsetMs} />
      </div>
      {mine.vote !== null && <p className="meta appeal-mine">{t('appealMine', { vote: t(mine.vote ? 'appealMineYes' : 'appealMineNo') })}</p>}
    </section>
  );
}
