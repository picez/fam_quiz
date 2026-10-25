import type { HostView, SurvivalRow } from '@quiz/shared';
import { answerText } from '../format';
import { HelpButton } from '../help/HelpButton';
import { t } from '../i18n';
import type { Send } from '../live/types';
import { useGuardedSend } from '../live/useGuardedSend';
import { Timer, timerStatus } from '../live/Timer';
import { SurvivalBoard } from './SurvivalBoard';

/** Статус рядка «на межі» для ведучого: двері наживо чи «відповів», після закриття — вижив / вибуває. */
function edgeText(row: SurvivalRow, kind: 'question' | 'luck'): string {
  if (row.trial === 'safe') return t('survivalSafeMark');
  if (row.trial === 'out') return t('survivalOutMark');
  if (row.trial === 'pending') return t('survivalAnswering');
  if (kind === 'luck' && row.door?.picked != null) return t('survivalDoor', { n: row.door.picked + 1 });
  return t(kind === 'question' ? 'survivalAnswered' : 'survivalPicked');
}

/**
 * Пульт «Вибування»: живі, на межі (з дверима й відповідями наживо), привиди, скільки питань на виживання лишилося,
 * «Закрити випробування» — головна кнопка пульта; після закриття текстову відповідь можна зарахувати чи відхилити, «ⓘ» раунду.
 */
export function HostSurvival({ view, offsetMs, send, onError }: { view: HostView; offsetMs: number; send: Send; onError: (message: string | null) => void }) {
  const info = view.survival;
  const { busy, run } = useGuardedSend(send, onError);
  if (info === null) return null;
  const trial = info.trial;
  const rows = info.rows.filter((row) => row.trial !== null);
  const gradable = trial !== null && trial.stage === 'closed' && trial.kind === 'question' && !view.paused;
  return (
    <section className="panel host-survival">
      <h2>
        {t('hostSurvivalTitle')}
        <HelpButton id="round.survival" />
      </h2>
      <p className="meta">
        {t('survivalTrialsLeft', { n: info.trialsLeft })}
      </p>
      {trial !== null && (
        <div className="host-survival-trial">
          <p className="meta" role="status">
            {t(trial.kind === 'question' ? 'survivalTrialQuestion' : 'survivalTrialLuck')}
            {trial.fellBack && ` · ${t('survivalFellBack')}`}
            {trial.stage === 'open' && ` · ${t('survivalTrialDone', { n: trial.done, total: trial.total })}`}
          </p>
          {trial.stage === 'open' && (trial.endsAt !== null || trial.remainingMs !== null) && <Timer view={trial} offsetMs={offsetMs} total={trial.limitMs} status={timerStatus(view)} />}
          <ul className="rows survival-host-rows">
            {rows.map((row) => (
              <li key={row.playerId} className={row.trial === 'out' ? 'is-out' : row.trial === 'safe' ? 'is-safe' : undefined}>
                <span className="name">{row.nickname}</span>
                {trial.kind === 'question' && row.answer !== null && trial.question !== null && <span className="given">{answerText(row.answer, trial.reveal, trial.question.choices)}</span>}
                <span className="survival-mark">{edgeText(row, trial.kind)}</span>
                {trial.kind === 'luck' && trial.stage === 'closed' && row.door !== null && row.door.trap !== null && row.door.picked !== null && (
                  <span className="meta">{t(row.door.auto ? 'historySurvivalDoorAuto' : 'historySurvivalDoor', { door: row.door.picked + 1, trap: row.door.trap + 1 })}</span>
                )}
                {gradable && row.answer !== null && row.answer.type === 'text' && (
                  <>
                    {row.trial === 'out' && (
                      <button type="button" className="btn btn-small" disabled={busy} onClick={() => void run('host:override', { playerId: row.playerId, grade: 'correct' })}>
                        {t('accept')}
                      </button>
                    )}
                    {row.trial === 'safe' && (
                      <button type="button" className="btn btn-small" disabled={busy} onClick={() => void run('host:override', { playerId: row.playerId, grade: 'wrong' })}>
                        {t('reject')}
                      </button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <SurvivalBoard info={info} size="host" />
    </section>
  );
}
