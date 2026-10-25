import type { TeamsView } from '@quiz/shared';
import { t } from '../i18n';
import { DicePanel, useDiceSpin } from './Dice';

const NO_ROWS: NonNullable<TeamsView['dice']>['rows'] = [];

/** Сцена в лобі командної гри: колонки команд з капітанами, «Без команди» і кубики формування. */
export function StageTeams({ teams }: { teams: TeamsView }) {
  const spinning = useDiceSpin(teams.dice?.rows ?? NO_ROWS);
  return (
    <div className="stage-teams">
      <p className="meta">{t('stageTeamsTitle')}</p>
      <div className="stage-team-cols">
        {teams.teams.map((team) => (
          <section key={team.id} className={`stage-team team-${team.color}`}>
            <h2 className="stage-team-name">{team.name}</h2>
            <ul className={team.members.length > 8 ? 'stage-team-members is-many' : 'stage-team-members'}>
              {team.members.map((member) => (
                <li key={member.id} className={member.connected ? undefined : 'is-away'}>
                  {member.id === team.captainId && (
                    <span className="captain-mark" role="img" aria-label={t('teamCaptainMark')}>
                      👑
                    </span>
                  )}
                  {member.nickname}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {teams.unassigned.length > 0 && <p className="stage-no-team">{`${t('stageNoTeam')}: ${teams.unassigned.map((member) => member.nickname).join(', ')}`}</p>}
      {teams.form === 'dice' && teams.dice !== null && <DicePanel dice={teams.dice} spinning={spinning} />}
    </div>
  );
}
