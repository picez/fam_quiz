import type { HostView } from '@quiz/shared';
import { num } from '../format';
import { HelpButton } from '../help/HelpButton';
import { t } from '../i18n';
import type { Send } from '../live/types';
import { useGuardedSend } from '../live/useGuardedSend';
import { LadderBoard } from './LadderBoard';
import { LadderAudience, LadderLifelineBadges } from './LadderStatus';

/** Пульт «Мільйонера»: на intro — вибір учасника (список гравців, «Вибрати»), далі — учасник, сходинка, вибір наживо, підказки, зал, рішення замість учасника («Грає далі» / «Забирає»), «ⓘ» раунду. */
export function HostLadder({ view, offsetMs, send, onError }: { view: HostView; offsetMs: number; send: Send; onError?: (message: string | null) => void }) {
  const info = view.ladder;
  const { busy, run } = useGuardedSend(send, onError ?? (() => {}));
  if (info === null) return null;
  const phase = view.phase;
  const question = view.question;
  const playing = phase === 'question' || phase === 'locked' || phase === 'reveal';
  const picked = info.contestantPick === null || question === null ? null : (question.choices.find((choice) => choice.id === info.contestantPick)?.text ?? null);
  const step = info.steps[info.current] ?? null;
  return (
    <section className="panel host-ladder">
      <h2>
        {t('ladderLabel')}
        <HelpButton id="round.ladder" />
      </h2>
      {phase === 'intro' && (
        <div className="host-ladder-pick">
          <h3 className="meta">{t('hostLadderPick')}</h3>
          <ul className="rows host-ladder-players">
            {view.players.map((player) => {
              const chosen = info.contestant?.playerId === player.id;
              return (
                <li key={player.id}>
                  <button
                    type="button"
                    className={chosen ? 'btn btn-primary ladder-pick is-picked' : 'btn ladder-pick'}
                    aria-pressed={chosen}
                    disabled={busy || view.paused || !player.connected}
                    onClick={() => void run('host:ladder-pick', { playerId: player.id })}
                  >
                    {player.nickname}
                  </button>
                  {!player.connected && <span className="meta">{t('hostLadderOffline')}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {phase !== 'intro' && info.contestant !== null && step !== null && (
        <p className="lead" role="status">
          {t('hostLadderStep', { name: info.contestant.nickname, n: info.current + 1, total: info.steps.length, level: num(step.level) })}
        </p>
      )}
      {playing && info.contestant !== null && (
        <>
          <p className="meta" role="status">
            {picked !== null ? t('hostLadderPicked', { name: info.contestant.nickname, option: picked }) : t('hostLadderThinking')}
          </p>
          <LadderLifelineBadges info={info} />
          {question !== null && <LadderAudience info={info} question={question} offsetMs={offsetMs} />}
        </>
      )}
      {phase === 'leaderboard' && info.decision === 'pending' && info.outcome === null && (
        <div className="ladder-decision">
          <button type="button" className="btn btn-primary ladder-go" disabled={busy || view.paused} onClick={() => void run('host:ladder-decide', { take: false })}>
            {t('hostLadderGoOn')}
          </button>
          <button type="button" className="btn ladder-take" disabled={busy || view.paused} onClick={() => void run('host:ladder-decide', { take: true })}>
            {t('hostLadderTake', { points: num(info.banked) })}
          </button>
        </div>
      )}
      <LadderBoard info={info} size="host" />
    </section>
  );
}
