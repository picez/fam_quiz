import { useEffect, useRef, useState, type RefObject } from 'react';
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
  const ref = useRef<HTMLElement>(null);
  const shown = view.outcome === null && mine.voter;
  // Заголовок читається вголос один раз: живий рядок монтується порожнім і отримує текст уже після появи.
  const [announce, setAnnounce] = useState(false);
  useEffect(() => setAnnounce(true), []);
  useSheetHeight(ref, shown);
  if (!shown) return null;
  const title = appealTitle(view, teams);
  const locked = paused || guard.busy;
  // aria-disabled замість disabled: фокус лишається на кнопці, поки йде голос чи пауза.
  const vote = (yes: boolean) => {
    if (locked) return;
    void guard.run('player:appeal-vote', { appealId: view.id, yes });
  };
  const hint = paused ? t('appealPausedHint') : undefined;
  return (
    <section className="appeal-sheet" aria-label={title} ref={ref}>
      <p className="sr-only" aria-live="polite">
        {announce ? title : ''}
      </p>
      <h2 className="appeal-title">{title}</h2>
      <p className="appeal-ask">{appealAsk(view)}</p>
      <div className="appeal-votes">
        <button type="button" className="btn appeal-yes" aria-pressed={mine.vote === true} aria-disabled={locked} title={hint} onClick={() => vote(true)}>
          {t('appealYes')}
        </button>
        <button type="button" className="btn appeal-no" aria-pressed={mine.vote === false} aria-disabled={locked} title={hint} onClick={() => vote(false)}>
          {t('appealNo')}
        </button>
      </div>
      {paused && <p className="meta appeal-paused">{t('appealPausedHint')}</p>}
      <div className="appeal-meta">
        <p className="appeal-count" aria-live="polite">
          {appealCountText(view)}
        </p>
        <AppealTime view={view} offsetMs={offsetMs} />
      </div>
      {mine.vote !== null && (
        <p className="meta appeal-mine">
          {t('appealMine', {
            vote: t(mine.vote ? 'appealMineYes' : 'appealMineNo'),
          })}
        </p>
      )}
    </section>
  );
}

/** Висота аркуша → --appeal-sheet-h на корені: телефон тримає під аркушем рівно стільки місця, скільки той займає. */
function useSheetHeight(ref: RefObject<HTMLElement | null>, shown: boolean) {
  useEffect(() => {
    const node = ref.current;
    if (!shown || node === null) return;
    const root = document.documentElement;
    const measure = () => root.style.setProperty('--appeal-sheet-h', `${Math.ceil(node.getBoundingClientRect().height)}px`);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    return () => {
      observer?.disconnect();
      root.style.removeProperty('--appeal-sheet-h');
    };
  }, [ref, shown]);
}
