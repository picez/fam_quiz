import { useState, type DragEvent } from 'react';
import { TEAM_FORMS, type TeamForm, type TeamMemberView, type TeamView, type TeamsView } from '@quiz/shared';
import { t, type TextKey } from '../i18n';
import { HelpButton } from '../help/HelpButton';
import { helpEntry, type HelpId } from '../help/host-help';
import { useGuardedSend } from '../live/useGuardedSend';
import type { Send } from '../live/types';
import { DicePanel, useDiceSpin } from './Dice';

/** «ⓘ» способу формування; поки довідка не має запису «команди», кнопки немає (а не падіння). */
function FormHelp({ form }: { form: TeamForm }) {
  const id = `team.${form}` as HelpId;
  try {
    helpEntry(id);
  } catch {
    return null;
  }
  return <HelpButton id={id} />;
}

/** Чи запуститься гра: як у рушії, без команди йдуть у найменшу команду, порожні відпадають, потрібні ≥ 2 команди з людьми. */
export function teamsStartable(teams: TeamsView): boolean {
  const sizes = teams.teams.map((team) => team.members.length);
  for (let i = 0; i < teams.unassigned.length; i++) {
    const smallest = sizes.indexOf(Math.min(...sizes));
    if (smallest >= 0) sizes[smallest]! += 1;
  }
  return sizes.filter((size) => size > 0).length >= 2;
}

const NO_ROWS: NonNullable<TeamsView['dice']>['rows'] = [];

interface MoveTo {
  teams: TeamView[];
  onMove: (member: TeamMemberView, teamId: string | null) => void;
  draggable: boolean;
  onDragStart: (event: DragEvent, id: string) => void;
  onDragEnd: () => void;
  busy: boolean;
}

interface PeopleProps {
  team: TeamView;
  /** Лобі: перемістити в іншу команду; null — рядок без вибору команди. */
  moveTo?: MoveTo;
  onCaptain: (team: TeamView, member: TeamMemberView) => void;
  onKick?: (member: TeamMemberView) => void;
  busy: boolean;
}

/** Люди команди: зв'язок, 👑, «Капітан» і (в грі) «Вилучити»; у лобі ще й вибір команди. */
export function TeamPeople({ team, moveTo, onCaptain, onKick, busy }: PeopleProps) {
  return (
    <ul className="team-people">
      {team.members.map((member) => (
        <li
          key={member.id}
          className="team-person"
          draggable={moveTo?.draggable === true}
          onDragStart={moveTo === undefined || !moveTo.draggable ? undefined : (event) => moveTo.onDragStart(event, member.id)}
          onDragEnd={moveTo === undefined ? undefined : moveTo.onDragEnd}
        >
          <span className="name">
            {member.id === team.captainId && (
              <span className="captain-mark" role="img" aria-label={t('teamCaptainMark')}>
                👑
              </span>
            )}
            {member.nickname}
          </span>
          {!member.connected && <span className="tag is-wrong">{t('disconnected')}</span>}
          {moveTo !== undefined && <MoveSelect member={member} current={team.id} moveTo={moveTo} />}
          {member.id !== team.captainId && (
            <button type="button" className="btn btn-small" disabled={busy} aria-label={`${t('teamMakeCaptain')}: ${member.nickname}`} onClick={() => onCaptain(team, member)}>
              {t('teamMakeCaptain')}
            </button>
          )}
          {onKick !== undefined && (
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => onKick(member)} aria-label={`${t('kick')}: ${member.nickname}`}>
              {t('kick')}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function MoveSelect({ member, current, moveTo }: { member: TeamMemberView; current: string | null; moveTo: MoveTo }) {
  return (
    <select
      className="team-move"
      aria-label={`${t('teamMoveTo')}: ${member.nickname}`}
      value={current ?? ''}
      disabled={moveTo.busy}
      onChange={(event) => moveTo.onMove(member, event.target.value === '' ? null : event.target.value)}
    >
      <option value="">{t('teamUnassigned')}</option>
      {moveTo.teams.map((team) => (
        <option key={team.id} value={team.id}>
          {team.name}
        </option>
      ))}
    </select>
  );
}

/** Пульт у лобі командної гри: спосіб формування, колонки команд, перетягування й «У команду», кубики, капітани. */
export function HostTeams({ teams, send, onError, onKick }: { teams: TeamsView; send: Send; onError: (text: string | null) => void; onKick?: (member: TeamMemberView) => void }) {
  const guard = useGuardedSend(send, onError);
  const spinning = useDiceSpin(teams.dice?.rows ?? NO_ROWS);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const diceOn = teams.dice !== null && !teams.dice.done;

  const assign = (memberId: string, teamId: string | null) => void guard.run('host:team-assign', { memberId, teamId });
  const drop = (teamId: string | null) => {
    const memberId = dragging;
    setDragging(null);
    setOver(null);
    if (memberId !== null) assign(memberId, teamId);
  };
  const dropTarget = (key: string, teamId: string | null) => ({
    onDragOver: (event: DragEvent) => {
      if (dragging === null) return;
      event.preventDefault();
      setOver(key);
    },
    onDragLeave: () => setOver((current) => (current === key ? null : current)),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      drop(teamId);
    },
  });
  const moveFor = (current: TeamView[]) => ({
    teams: current,
    onMove: (member: TeamMemberView, teamId: string | null) => assign(member.id, teamId),
    // Поки тур кубиків відкритий, сервер не переміщує людей (dice_pending).
    draggable: !diceOn,
    onDragStart: (event: DragEvent, id: string) => {
      event.dataTransfer?.setData('text/plain', id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      setDragging(id);
    },
    onDragEnd: () => {
      setDragging(null);
      setOver(null);
    },
    busy: guard.busy || diceOn,
  });
  const onCaptain = (team: TeamView, member: TeamMemberView) => void guard.run('host:captain', { teamId: team.id, memberId: member.id });

  return (
    <div className="host-teams">
      <fieldset className="team-forms">
        <legend>{t('teamFormLabel')}</legend>
        {TEAM_FORMS.map((form) => (
          <span key={form} className="team-form-option">
            <label>
              <input
                type="radio"
                name="team-form"
                value={form}
                checked={teams.form === form}
                disabled={guard.busy}
                onChange={() => void guard.run('host:team-form', { form })}
              />
              {t(`teamForm_${form}` as TextKey)}
            </label>
            <FormHelp form={form} />
          </span>
        ))}
      </fieldset>

      {teams.form === 'random' && (
        <button type="button" className="btn btn-small" disabled={guard.busy} onClick={() => void guard.run('host:team-deal', undefined)}>
          {t('teamDeal')}
        </button>
      )}
      {teams.form === 'dice' && (
        <div className="team-dice-tools">
          {diceOn ? (
            <button type="button" className="btn btn-small" disabled={guard.busy} onClick={() => void guard.run('host:team-roll', undefined)}>
              {t('teamDiceRest')}
            </button>
          ) : (
            <button type="button" className="btn btn-small" disabled={guard.busy} onClick={() => void guard.run('host:team-dice', undefined)}>
              {t('teamDiceStart')}
            </button>
          )}
          {teams.dice !== null && <DicePanel dice={teams.dice} spinning={spinning} />}
        </div>
      )}

      <div className="host-team-cols">
        {teams.teams.map((team) => (
          <section
            key={team.id}
            className={`host-team team-${team.color}${over === team.id ? ' is-over' : ''}`}
            data-team-id={team.id}
            {...dropTarget(team.id, team.id)}
          >
            <h3 className="host-team-name">{team.name}</h3>
            <TeamPeople team={team} moveTo={moveFor(teams.teams)} onCaptain={onCaptain} onKick={onKick} busy={guard.busy} />
          </section>
        ))}
        <section className={`host-team host-team-none${over === 'none' ? ' is-over' : ''}`} data-team-id="" {...dropTarget('none', null)}>
          <h3 className="host-team-name">{t('teamUnassigned')}</h3>
          <ul className="team-people">
            {teams.unassigned.map((member) => (
              <li
                key={member.id}
                className="team-person"
                draggable={!diceOn}
                onDragStart={diceOn ? undefined : (event) => moveFor(teams.teams).onDragStart(event, member.id)}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                }}
              >
                <span className="name">{member.nickname}</span>
                {!member.connected && <span className="tag is-wrong">{t('disconnected')}</span>}
                <MoveSelect member={member} current={null} moveTo={moveFor(teams.teams)} />
                {onKick !== undefined && (
                  <button type="button" className="btn btn-small" disabled={guard.busy} onClick={() => onKick(member)} aria-label={`${t('kick')}: ${member.nickname}`}>
                    {t('kick')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
