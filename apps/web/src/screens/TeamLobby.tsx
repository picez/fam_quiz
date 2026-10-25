import type { PlayerView } from '@quiz/shared';
import { countText, t } from '../i18n';
import { useGuardedSend } from '../live/useGuardedSend';
import type { Send } from '../live/types';
import { DicePanel, useDiceSpin } from './Dice';

/** Кубик формування: свій кидок, результати всіх і підказка, що далі. */
function TeamDice({ view, send, onError }: { view: PlayerView; send: Send; onError: (text: string | null) => void }) {
  const guard = useGuardedSend(send, onError);
  const dice = view.teams?.dice ?? null;
  const spinning = useDiceSpin(dice?.rows ?? []);
  const team = view.team;
  if (team === null) return null;
  const mine = dice?.rows.find((row) => row.playerId === team.memberId);
  const tied = dice?.tieBreak === true && (mine?.throws.length ?? 0) > 0;
  return (
    <section className="team-dice">
      <p className="lead">{t('teamDiceTitle')}</p>
      {team.canRoll ? (
        <div className="dice-action team-roll">
          <button type="button" className="btn btn-primary btn-roll" disabled={view.paused || guard.busy} onClick={() => void guard.run('player:team-roll', undefined)}>
            {t('teamDiceRoll')}
          </button>
        </div>
      ) : (
        <p className="meta team-dice-wait" role="status">
          {t('teamDiceWait')}
        </p>
      )}
      {team.canRoll && tied && <p className="meta" role="status">{t('teamDiceAgain')}</p>}
      {dice !== null && <DicePanel dice={dice} spinning={spinning} meId={team.memberId} />}
    </section>
  );
}

/** Лобі учасника командної гри: вибір команди, кубик або очікування розподілу. */
export function TeamLobby({ view, send, onError }: { view: PlayerView; send: Send; onError: (text: string | null) => void }) {
  const guard = useGuardedSend(send, onError);
  const team = view.team;
  const teams = view.teams;
  if (team === null || teams === null) return null;
  const own = teams.teams.find((entry) => entry.id === team.teamId) ?? null;
  const yours = own === null ? null : <p className={`lead team-yours team-${own.color}`}>{t('teamYours', { name: own.name })}</p>;

  if (teams.form === 'pick') {
    return (
      <section className="team-lobby">
        <p className="lead">{t('teamPickTitle')}</p>
        <div className="team-pick-grid">
          {teams.teams.map((entry) => (
            <button
              type="button"
              key={entry.id}
              className={`btn team-pick team-${entry.color}`}
              aria-pressed={entry.id === team.teamId}
              disabled={!team.canPick || view.paused || guard.busy}
              onClick={() => void guard.run('player:team', { teamId: entry.id })}
            >
              <span className="team-pick-name">{entry.name}</span>
              <span className="team-pick-count">{countText('teamMembersCount', entry.members.length, { count: entry.members.length })}</span>
            </button>
          ))}
        </div>
        {own === null && <p className="meta">{t('teamNone')}</p>}
      </section>
    );
  }

  // Тур кубиків відкритий: кидають і ті, хто вже в команді (ведучий міг змінити спосіб після вибору).
  if (teams.form === 'dice' && teams.dice !== null && (own === null || !teams.dice.done)) {
    return (
      <section className="team-lobby">
        <TeamDice view={view} send={send} onError={onError} />
      </section>
    );
  }

  return (
    <section className="team-lobby">
      {yours ?? <p className="lead">{t('teamWaitHost')}</p>}
    </section>
  );
}
