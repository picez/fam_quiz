import { LIMITS, type Answer, type PlayerView, type PublicQuestion, type Question, type SubmittedAnswer, type SurvivalRow } from '@quiz/shared';
import { LETTERS, correctText } from '../format';
import { t } from '../i18n';
import { ChoiceFace, choicesClass } from './ChoiceFace';
import { QuestionImage } from './QuestionImage';
import { Timer, useTimeOver } from '../live/Timer';
import { useSplash } from '../live/Splash';
import { AnswerInput } from './AnswerInput';
import { SurvivalDoors } from './SurvivalDoors';

/** Варіанти питання на виживання лише для читання; після закриття правильний підсвічено. */
function TrialChoices({ question, reveal }: { question: PublicQuestion; reveal: Question | null }) {
  if (question.choices.length === 0) return null;
  const correctId = reveal?.type === 'single' ? reveal.correctId : null;
  return (
    <ul className={`${choicesClass(question.choices)} survival-watch-choices`}>
      {question.choices.map((choice, index) => (
        <li key={choice.id} className={choice.id === correctId ? 'choice is-correct' : 'choice'}>
          <ChoiceFace choice={choice} letter={LETTERS[index]} />
        </li>
      ))}
    </ul>
  );
}

/** «Правильна відповідь: …» після закриття питання на виживання; інакше нічого. */
function TrialAnswer({ question, reveal }: { question: PublicQuestion | null; reveal: Question | null }) {
  if (question === null || reveal === null) return null;
  return <p className="lead answer survival-watch-answer">{t('correctAnswer', { answer: correctText(reveal, question.choices) })}</p>;
}

/** Хто вижив, а хто став привидом після закриття випробування. */
function TrialOutcome({ rows }: { rows: SurvivalRow[] }) {
  const decided = rows.filter((row) => row.trial === 'safe' || row.trial === 'out');
  if (decided.length === 0) return null;
  return (
    <ul className="survival-watch-outcome">
      {decided.map((row) => (
        <li key={row.playerId} className={row.trial === 'out' ? 'is-out' : 'is-safe'}>
          {t('survivalWatchOutcome', { name: row.nickname, mark: t(row.trial === 'out' ? 'survivalOutMark' : 'survivalSafeMark') })}
        </li>
      ))}
    </ul>
  );
}

/**
 * Випробування на телефоні: «на межі» — питання на виживання чи троє дверей; решта (живі, привиди, нові гравці) —
 * те саме питання лише для читання з підписом «Питання на виживання для: …» (16a), без жодного керування;
 * після закриття — «Пронесло!» / «Ти вибуваєш», а глядачам — правильна відповідь і хто вижив. Керування вимкнене на паузі й під заставкою `trial`
 * (canAnswerTrial / canPickDoor заставки не знають, тож її відстежує клієнт).
 */
export function SurvivalTrial({
  view,
  offsetMs,
  onAnswer,
  onDoor,
  onDraft,
  confirm = false,
}: {
  view: PlayerView;
  offsetMs: number;
  onAnswer: (answer: Answer) => void;
  onDoor: (door: number) => void;
  /** Живий вибір: команда — чернетка капітана товаришам і пульту; соло — пульту. */
  onDraft?: (draft: SubmittedAnswer | null) => void;
  /** Командна гра: одиночний вибір з підтвердженням. */
  confirm?: boolean;
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
    if (own.result === null) {
      return (
        <section className="survival-trial is-watch is-closed">
          {head}
          {trial.question !== null && (
            <>
              <h1 className="question">{trial.question.text}</h1>
              <QuestionImage url={trial.question.imageUrl} />
              <TrialChoices question={trial.question} reveal={trial.reveal} />
              <TrialAnswer question={trial.question} reveal={trial.reveal} />
            </>
          )}
          <TrialOutcome rows={info.rows} />
        </section>
      );
    }
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
        <TrialAnswer question={trial.question} reveal={trial.reveal} />
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
              <QuestionImage url={trial.question.imageUrl} />
              <fieldset className="inputs" disabled={frozen || !own.canAnswerTrial}>
                <AnswerInput key={trial.question.text} question={trial.question} onSubmit={(answer) => !frozen && own.canAnswerTrial && onAnswer(answer)} onDraft={onDraft} confirm={confirm} />
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

  const names = info.rows
    .filter((row) => row.trial !== null)
    .map((row) => row.nickname)
    .join(', ');
  const done = (
    <p className="meta" role="status">
      {t('survivalTrialDone', { n: trial.done, total: trial.total })}
    </p>
  );
  if (trial.kind === 'question' && trial.question !== null) {
    // Глядач (16a): питання лише для читання — без полів і кнопок; правильної відповіді до закриття сервер не надсилає.
    return (
      <section className="survival-trial is-watch">
        {trial.fellBack && <p className="meta">{t('survivalFellBack')}</p>}
        <h2 className="survival-watch-for">{t('survivalTrialFor', { names })}</h2>
        <Timer view={trial} offsetMs={offsetMs} status={view.paused ? 'paused' : null} />
        <h1 className="question">{trial.question.text}</h1>
        <QuestionImage url={trial.question.imageUrl} />
        <TrialChoices question={trial.question} reveal={null} />
        {done}
      </section>
    );
  }
  return (
    <section className="survival-trial is-watch">
      {head}
      <p className="lead survival-state">{t('survivalWatchTrial', { names })}</p>
      {done}
    </section>
  );
}
