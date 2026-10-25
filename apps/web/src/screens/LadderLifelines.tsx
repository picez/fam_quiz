import type { LifelineKind, PlayerView } from '@quiz/shared';
import { BUFF_ICONS } from '../buff-meta';
import { t, type TextKey } from '../i18n';
import { useSplash } from '../live/Splash';
import { useTimeOver } from '../live/Timer';
import { VoteResults } from './Buffs';
import { withoutRemoved } from './LadderStatus';

/** Три кнопки підказок учасника (лише ввімкнені), під ними — підсумок залу й підказка ведучого. */
export function LadderLifelines({ view, offsetMs, onUse }: { view: PlayerView; offsetMs: number; onUse: (kind: LifelineKind) => void }) {
  const info = view.ladder;
  const own = view.me.ladder;
  // Хуки — до будь-якого виходу: заставку й кінець часу телефон перевіряє сам (сервер каже лише canLifeline).
  const splashNow = useSplash(view.splash, view.paused, offsetMs);
  const timeOver = useTimeOver(view.endsAt, view.remainingMs, offsetMs);
  if (info === null || own === null || own.role !== 'contestant' || info.lifelines.length === 0) return null;
  const notStarted = splashNow !== null && splashNow.splash.kind === 'question';
  const allowed = own.canLifeline && !view.paused && !notStarted && !timeOver;
  const audience = info.audience;
  const hint = own.hint;
  return (
    <section className="ladder-lifelines">
      <div className="ladder-lifeline-row" role="group" aria-label={t('ladderLifelinesLabel')}>
        {info.lifelines.map(({ kind, state }) => (
          <button
            key={kind}
            type="button"
            className={`ladder-lifeline is-${state}`}
            disabled={state !== 'ready' || !allowed}
            aria-pressed={state === 'active' ? true : undefined}
            onClick={() => onUse(kind)}
          >
            <span className="ladder-lifeline-icon" aria-hidden="true">
              {BUFF_ICONS[kind]}
            </span>
            <span className="ladder-lifeline-name">{t(`ladderLifeline_${kind}` as TextKey)}</span>
            {state === 'used' && <span className="sr-only"> {t('ladderLifelineUsed')}</span>}
          </button>
        ))}
      </div>
      {/* Усе, що з'являється після дотику, — в одному місці під рядом кнопок. */}
      <div className="ladder-lifeline-info" aria-live="polite">
        {audience !== null &&
          (audience.state === 'closed' ? (
            audience.tally !== null && view.question !== null && (
            <>
              <h3 className="meta">{t('ladderHallResult')}</h3>
              <VoteResults
                votes={{ endsAt: null, remainingMs: null, closed: true, cast: audience.tally.cast, counts: audience.tally.counts, guesses: [] }}
                question={withoutRemoved(info, view.question)}
                offsetMs={offsetMs}
              />
            </>
            )
          ) : (
            <p className="meta">{t('ladderHallVoting', { voted: audience.voted, total: audience.total })}</p>
          ))}
        {hint !== null && (
          <p className="hint-text">
            {hint.state === 'waiting' ? t('hintWaiting') : hint.state === 'aloud' ? t('hintAloud') : `${BUFF_ICONS.hint} ${hint.text ?? ''}`}
          </p>
        )}
      </div>
    </section>
  );
}
