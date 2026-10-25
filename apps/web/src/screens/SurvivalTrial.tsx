import { LIMITS, type Answer, type PlayerView } from '@quiz/shared';
import { t } from '../i18n';
import { Timer, useTimeOver } from '../live/Timer';
import { useSplash } from '../live/Splash';
import { AnswerInput } from './AnswerInput';
import { SurvivalDoors } from './SurvivalDoors';

/**
 * Випробування на телефоні: «на межі» — питання на виживання чи троє дверей; решта — рядок «Випробування для …»;
 * після закриття — «Пронесло!» / «Ти вибуваєш». Керування вимкнене на паузі й під заставкою `trial`
 * (canAnswerTrial / canPickDoor заставки не знають, тож її відстежує клієнт).
 */
export function SurvivalTrial({
  view,
  offsetMs,
  onAnswer,
  onDoor,
  onDraft,
}: {
  view: PlayerView;
  offsetMs: number;
  onAnswer: (answer: Answer) => void;
  onDoor: (door: number) => void;
  /** Команда: чернетка відповіді капітана для товаришів. */
  onDraft?: (draft: Answer | null) => void;
}) {
  const own = view.me.survival;
  const info = view.survival;
  const trial = info?.trial ?? null;
  const splash = useSplash(view.splash, view.paused, offsetMs);
  const timeOver = useTimeOver(trial?.endsAt ?? null, trial?.remainingMs ?? null, offsetMs);
  if (own === null || info === null || trial === null) return null;
  const myRow = info.rows.find((row) => row.playerId === view.me.id);
  const splashing = splash !== null && splash.splash.kind === 'trial';
  const frozen = view.paused || splashing || timeOver;
  const head = (
    <>
      {trial.fellBack && <p className="meta">{t('survivalFellBack')}</p>}
      <h2>{t(trial.kind === 'question' ? 'survivalTrialQuestion' : 'survivalTrialLuck')}</h2>
    </>
  );

  if (trial.stage === 'closed') {
    if (own.result === null) return <section className="survival-trial">{head}</section>;
    const door = myRow?.door ?? null;
    return (
      <section className={`survival-trial is-${own.result}`}>
        {head}
        {trial.kind === 'luck' && door !== null && door.trap !== null && (
          <SurvivalDoors picked={null} disabled reveal={{ picked: door.picked, auto: door.auto, trap: door.trap }} size="phone" />
        )}
        <p className="lead survival-state" role="status">
          {t(own.result === 'safe' ? 'survivalSafe' : 'survivalOut')}
        </p>
      </section>
    );
  }

  if (own.status === 'edge') {
    return (
      <section className="survival-trial is-open">
        {head}
        <Timer view={trial} offsetMs={offsetMs} status={view.paused ? 'paused' : null} />
        {trial.kind === 'question' && trial.question !== null ? (
          own.trialAnswer !== null ? (
            <p className="lead survival-state">{t('answerSent')}</p>
          ) : (
            <>
              <h1 className="question">{trial.question.text}</h1>
              <fieldset className="inputs" disabled={frozen || !own.canAnswerTrial}>
                <AnswerInput key={trial.question.text} question={trial.question} onSubmit={(answer) => !frozen && own.canAnswerTrial && onAnswer(answer)} onDraft={onDraft} />
              </fieldset>
            </>
          )
        ) : (
          <>
            <SurvivalDoors
              picked={own.door}
              disabled={frozen || !own.canPickDoor}
              reveal={null}
              onPick={(door) => !frozen && own.canPickDoor && onDoor(door)}
              size="phone"
            />
            <p className="meta survival-door-line" role="status">
              {own.door !== null ? t('survivalDoorPicked', { n: own.door + 1 }) : t('survivalDoorDefault', { seconds: LIMITS.survivalLuckSeconds })}
            </p>
          </>
        )}
      </section>
    );
  }

  const names = info.rows.filter((row) => row.trial !== null).map((row) => row.nickname);
  return (
    <section className="survival-trial is-watch">
      {head}
      <p className="lead survival-state">{t('survivalWatchTrial', { names: names.join(', ') })}</p>
      <p className="meta" role="status">
        {t('survivalTrialDone', { n: trial.done, total: trial.total })}
      </p>
    </section>
  );
}
