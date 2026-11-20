import { useEffect, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { BOT_TEAM_FORMS, BOT_TIME_SECONDS, LOBBY_PASSWORD_MAX, LOBBY_PASSWORD_MIN, type AdminBotLobby, type AdminBotRoom, type AdminBotRoomPerson, type AdminBotStatus, type BotAction, type BotCommand } from '@quiz/shared';
import { t, type TextKey } from '../i18n';
import { nickText } from '../nick';

const STATUS_KEY: Record<AdminBotStatus, TextKey> = {
  lobby: 'adminBotLobby',
  playing: 'adminBotPlaying',
  paused: 'adminBotPaused',
  finished: 'adminBotFinished',
};

/** Кнопки стану кімнати; «Завершити гру» в лобі закриває лобі. Кінець — без кнопок. */
const ROOM_ACTIONS: Record<AdminBotStatus, { action: BotAction; key: TextKey }[]> = {
  lobby: [{ action: 'start', key: 'adminBotStart' }],
  playing: [{ action: 'pause', key: 'adminBotPause' }],
  paused: [{ action: 'resume', key: 'adminBotResume' }],
  finished: [],
};

type TeamChoice = (typeof BOT_TEAM_FORMS)[number];

/**
 * Картка кімнати бота (62): стан і кнопки ведучого, лобі (у списку чи за кодом, пароль, команди) і люди.
 * Запитання й відповіді сюди не потрапляють — лише прапорець «відкрите запитання».
 */
export function AdminBotRoomCard({ room, busy, onCommand, onLobby }: { room: AdminBotRoom; busy: boolean; onCommand: (command: BotCommand) => void; onLobby: (input: AdminBotLobby) => void }): JSX.Element {
  const saved = room.lobby.password;
  const [draft, setDraft] = useState(saved ?? '');
  const [shown, setShown] = useState(false);
  /** Після перечитування — збережений пароль у полі (як у лобі ведучого). */
  useEffect(() => {
    setDraft(saved ?? '');
  }, [saved]);

  const ids = `admin-bot-${room.code}`;
  const trimmed = draft.trim();
  const length = [...trimmed].length;
  const valid = length >= LOBBY_PASSWORD_MIN && length <= LOBBY_PASSWORD_MAX;
  const inLobby = room.status === 'lobby';
  const playing = room.status === 'playing';
  /** «Розподіляю сам» бот не вміє: така кімната показує «Випадково». */
  const teamForm: TeamChoice | null = room.teams === null ? null : room.teams.form === 'host' ? 'random' : room.teams.form;

  const asked = (text: string, command: BotCommand) => {
    if (window.confirm(text)) onCommand(command);
  };
  const end = () => asked(t('adminBotEndConfirm', { code: room.code, title: room.title }), { type: 'end' });
  const kick = (person: AdminBotRoomPerson) => asked(t('kickConfirm', { name: nickText(person.nickname) }), { type: 'kick', playerId: person.id });
  const release = (person: AdminBotRoomPerson) => asked(t('slotReleaseConfirm', { nickname: nickText(person.nickname) }), { type: 'release', playerId: person.id });

  return (
    <li className="admin-card admin-bot-room">
      <p className="admin-bot-code">
        {t('adminBotCode', { code: room.code })}
        {saved !== null && <span className="tag admin-bot-locked">{t('lobbyLocked')}</span>}
      </p>
      <h3 dir="auto">{room.title}</h3>
      <p className="admin-mark">{t(STATUS_KEY[room.status])}</p>
      <p>{t('adminBotPlayers', { online: room.players.online, total: room.players.total })}</p>
      <div className="admin-actions">
        <a className="btn" href={room.stageUrl} target="_blank" rel="noopener noreferrer">
          {t('adminBotStage')}
        </a>
        {room.status !== 'finished' && (
          <Link className="btn" to={`/play/${encodeURIComponent(room.code)}`}>
            {t('adminBotJoin')}
          </Link>
        )}
        {ROOM_ACTIONS[room.status].map(({ action, key }) => (
          <button key={action} type="button" className={action === 'start' ? 'btn btn-primary' : 'btn'} disabled={busy} onClick={() => onCommand({ type: action })}>
            {t(key)}
          </button>
        ))}
        {playing && room.question && (
          <>
            <button type="button" className="btn" disabled={busy} onClick={() => onCommand({ type: 'time' })}>
              {t('adminBotTime', { seconds: BOT_TIME_SECONDS })}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => asked(t('adminBotSkipConfirm', { code: room.code }), { type: 'skip' })}>
              {t('adminBotSkip')}
            </button>
          </>
        )}
        {playing && room.inRound && (
          <button type="button" className="btn" disabled={busy} onClick={() => asked(t('endRoundConfirm'), { type: 'end-round' })}>
            {t('endRound')}
          </button>
        )}
        {room.status !== 'finished' && (
          <button type="button" className="btn btn-danger" disabled={busy} onClick={end}>
            {t('adminBotEnd')}
          </button>
        )}
      </div>
      {inLobby && (
        <div className="admin-bot-lobby">
          <label className="field field-check" htmlFor={`${ids}-listed`}>
            <input id={`${ids}-listed`} type="checkbox" checked={room.lobby.listed} disabled={busy} aria-describedby={`${ids}-listed-hint`} onChange={(e) => onLobby({ listed: e.target.checked, password: saved })} />
            {t('adminBotListed')}
          </label>
          <p className="meta" id={`${ids}-listed-hint`}>
            {t('adminBotListedHint')}
          </p>
          <div className="field compact">
            <label htmlFor={`${ids}-password`}>{t('lobbyPasswordLabel')}</label>
            <div className="admin-bot-password">
              <input
                id={`${ids}-password`}
                type={shown ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                dir="auto"
                value={draft}
                aria-describedby={`${ids}-password-hint`}
                aria-invalid={draft !== '' && !valid}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button type="button" className="btn btn-small" aria-pressed={shown} aria-controls={`${ids}-password`} onClick={() => setShown((now) => !now)}>
                {t('adminBotPasswordShow')}
              </button>
            </div>
            <p className="meta" id={`${ids}-password-hint`}>
              {t('adminBotPasswordHint')}
            </p>
          </div>
          <div className="admin-actions">
            <button type="button" className="btn" disabled={busy || !valid} onClick={() => onLobby({ listed: room.lobby.listed, password: trimmed })}>
              {t('lobbyPasswordSave')}
            </button>
            {saved !== null && (
              <button type="button" className="btn" disabled={busy} onClick={() => onLobby({ listed: room.lobby.listed, password: null })}>
                {t('lobbyPasswordRemove')}
              </button>
            )}
          </div>
          {teamForm !== null && (
            <fieldset className="admin-bot-plan-to admin-bot-room-teams" disabled={busy}>
              <legend>{t('teamFormLabel')}</legend>
              {BOT_TEAM_FORMS.map((form) => (
                <label key={form} className="field field-check" htmlFor={`${ids}-form-${form}`}>
                  <input id={`${ids}-form-${form}`} type="radio" name={`${ids}-form`} checked={teamForm === form} onChange={() => onCommand({ type: 'team-form', form })} />
                  {t(`teamForm_${form}`)}
                </label>
              ))}
            </fieldset>
          )}
        </div>
      )}
      {room.status !== 'finished' && (
        <div className="admin-bot-room-people">
          <h4 id={`${ids}-people`}>{t('adminBotPeople')}</h4>
          {room.people.length === 0 ? (
            <p className="meta">{t('adminBotPeopleEmpty')}</p>
          ) : (
            <ul className="admin-bot-room-list" aria-labelledby={`${ids}-people`}>
              {room.people.map((person) => (
                <li key={person.id}>
                  <p className="admin-bot-room-who">
                    <span id={`${ids}-p-${person.id}`} className="admin-bot-room-nick" dir="auto">
                      {nickText(person.nickname)}
                    </span>
                    {person.team !== null && (
                      <span className="meta" dir="auto">
                        {person.team}
                      </span>
                    )}
                    {!person.online && <span className="meta">{t('adminBotOffline')}</span>}
                  </p>
                  <div className="admin-actions">
                    <button type="button" className="btn btn-danger" disabled={busy} aria-describedby={`${ids}-p-${person.id}`} onClick={() => kick(person)}>
                      {t('kick')}
                    </button>
                    {room.continued && (
                      <button type="button" className="btn" disabled={busy} aria-describedby={`${ids}-p-${person.id}`} onClick={() => release(person)}>
                        {t('slotRelease')}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
