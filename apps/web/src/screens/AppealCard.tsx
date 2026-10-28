import { useId } from 'react';
import type { AppealView, PublicQuestion } from '@quiz/shared';
import { appealAsk, appealCountText, appealPresented, appealResultText, appealTitle } from '../appeal-text';
import { t } from '../i18n';
import { clockText, useLeftMs } from '../live/Timer';

/** Відлік голосування «0:21» за годинником сервера; на паузі стоїть. Окремий шар — живий регіон картки його не читає щосекунди. */
export function AppealTime({ view, offsetMs }: { view: Pick<AppealView, 'endsAt' | 'remainingMs'>; offsetMs: number }) {
  const left = useLeftMs(view, offsetMs);
  return (
    <span className="appeal-time" role="timer" aria-live="off">
      {clockText(left)}
    </span>
  );
}

/**
 * Картка апеляції (12f): заголовок, питання залу, смужка «так / ні» (stage), лічильник і відлік «0:21»;
 * після рішення — рядок .appeal-result. size: stage — на сцені, host — на пульті, phone — на телефоні того, хто не голосує.
 * Лише лічильники: хто як голосував, картка не знає. Вголос читаються лише лічильник і результат, а не вся картка щоразу.
 * screenQuestion — запитання цього екрана: літери варіантів у питанні залу — за його порядком, якщо це те саме запитання.
 */
export function AppealCard({
  view,
  screenQuestion,
  size,
  teams,
  offsetMs,
}: {
  view: AppealView;
  screenQuestion?: PublicQuestion | null;
  size: 'stage' | 'host' | 'phone';
  teams: boolean;
  offsetMs: number;
}) {
  const titleId = useId();
  const open = view.outcome === null;
  const result = appealResultText(view);
  const cast = view.yes + view.no;
  const yesPct = cast === 0 ? 0 : (view.yes / cast) * 100;
  const noPct = cast === 0 ? 0 : 100 - yesPct;
  return (
    <section className={`appeal-card is-${size}`} aria-labelledby={titleId}>
      <h2 className="appeal-title" id={titleId}>
        {appealTitle(view, teams)}
      </h2>
      {size !== 'phone' ? <p className="appeal-ask">{appealAsk(view, appealPresented(view, screenQuestion))}</p> : open && <p className="appeal-hall">{t('appealHall')}</p>}
      {size === 'stage' && (
        <div className="appeal-bar" aria-hidden="true">
          <span className="appeal-bar-yes" style={{ width: `${yesPct}%` }} />
          <span className="appeal-bar-no" style={{ width: `${noPct}%` }} />
        </div>
      )}
      {open && (
        <div className="appeal-meta">
          <p className="appeal-count" aria-live="polite">
            {appealCountText(view)}
          </p>
          <AppealTime view={view} offsetMs={offsetMs} />
        </div>
      )}
      {result !== null && (
        <p className="appeal-result" aria-live="polite">
          {result}
        </p>
      )}
    </section>
  );
}
