import { useEffect, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import type { CalendarEvent, FriendChallenge, GameInvite, GameSummary } from '@quiz/shared';
import { getCalendar, getMyInvites, listFriendChallenges, listGames } from '../api';
import { daysLeftText } from '../challenge/challenge-text';
import { dayHeading, timeText, viewerZone } from '../calendar/calendar-time';
import { formatDate } from '../format';
import { sharedRunningGame, useContinueSaved } from '../host-game';
import { pickNextUp, type NextUp, type RunningGame } from '../home-next';
import { errorText, t } from '../i18n';
import { nickText } from '../nick';

export const JOIN_FORM = 'join-form';
const NEXT_UP_TITLE = 'next-up-title';

const spacedCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/** Дві великі кнопки під заголовком головної (53): «Створити гру» і «Приєднатися» (розкриває форму коду під ними). */
export function HomeActions({ joinOpen, onJoin }: { joinOpen: boolean; onJoin: () => void }): JSX.Element {
  return (
    <div className="home-actions" role="group" aria-label={t('homeActionsLabel')}>
      <Link className="btn btn-primary home-action" to="/create">
        {t('startCreate')}
      </Link>
      <button type="button" className="btn home-action" aria-expanded={joinOpen} aria-controls={joinOpen ? JOIN_FORM : undefined} onClick={onJoin}>
        {t('homeJoin')}
      </button>
    </div>
  );
}

/**
 * Що головна пропонує першим: гість — лише живу гру цього пристрою; акаунт — ще збережені ігри, запрошення, календар
 * і виклики від друзів (78; усе паралельно).
 * Картка з'являється, лише коли відповіли всі запити; збій будь-якого — «немає даних», без повідомлення.
 */
export function useNextUp(signedIn: boolean): NextUp | null {
  const [next, setNext] = useState<NextUp | null>(null);
  useEffect(() => {
    let current = true;
    setNext(null);
    // Спільна на кілька секунд: гостьова картка й картка після входу не питають двічі.
    // 76: збій будь-якого запиту — просто без картки (і без необробленої відмови).
    const running: Promise<RunningGame | null> = sharedRunningGame().catch(() => null);
    const games: Promise<GameSummary[] | null> = signedIn ? listGames().then((result) => (result.ok ? result.data : null), () => null) : Promise.resolve(null);
    const events: Promise<CalendarEvent[] | null> = signedIn ? getCalendar().then((result) => (result.ok ? result.events : null), () => null) : Promise.resolve(null);
    const invites: Promise<GameInvite[] | null> = signedIn ? getMyInvites().then((result) => (result.ok ? result.data : null), () => null) : Promise.resolve(null);
    const challenges: Promise<FriendChallenge[] | null> = signedIn
      ? listFriendChallenges().then((result) => (result.ok ? result.data : null), () => null)
      : Promise.resolve(null);
    void Promise.all([running, games, invites, events, challenges])
      .then(([game, saved, invited, calendar, dares]) => {
        if (current) setNext(pickNextUp({ running: game, games: saved, invites: invited, events: calendar, challenges: dares }));
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [signedIn]);
  return next;
}

function RunningCard({ running }: { running: RunningGame }): JSX.Element {
  return (
    <>
      <h2 id={NEXT_UP_TITLE}>{t('homeContinueTitle')}</h2>
      <p className="next-up-name" dir="auto">
        {running.title}
      </p>
      <p className="meta">{t('homeContinueRunning', { code: spacedCode(running.code) })}</p>
      <Link className="btn btn-primary" to={running.to}>
        {t('homeContinueBack')}
      </Link>
    </>
  );
}

function SavedCard({ game }: { game: GameSummary }): JSX.Element {
  const continueSaved = useContinueSaved();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resume = async () => {
    setBusy(true);
    setError(null);
    const failure = await continueSaved(game.id);
    setBusy(false);
    if (failure !== null) setError(errorText(failure));
  };

  return (
    <>
      <h2 id={NEXT_UP_TITLE}>{t('homeContinueTitle')}</h2>
      <p className="next-up-name" dir="auto">
        {game.title}
      </p>
      <p className="meta">{t('homeContinueSaved', { date: formatDate(game.saved?.savedAt ?? game.startedAt) })}</p>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void resume()}>
        {t('continueGame')}
      </button>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function EventCard({ event }: { event: CalendarEvent }): JSX.Element {
  const zone = viewerZone();
  return (
    <>
      <h2 id={NEXT_UP_TITLE}>{t('homeEventTitle')}</h2>
      <p className="next-up-name" dir="auto">
        {event.title}
      </p>
      <p className="meta">{t('homeEventWhen', { day: dayHeading(event.startsAt, zone), time: timeText(event.startsAt, zone) })}</p>
      {!event.mine && event.host.nickname !== null && (
        <p className="meta" dir="auto">
          {t('homeEventHost', { name: event.host.nickname })}
        </p>
      )}
      {event.state === 'open' && <p className="meta next-up-open">{t('homeEventOpen')}</p>}
      <Link className="btn" to="/feed/calendar">
        {t('homeEventCalendar')}
      </Link>
    </>
  );
}

/** 78: запрошення в гру — хто, що й код; «Приєднатися» веде прямо в гру. */
function InviteCard({ invite }: { invite: GameInvite }): JSX.Element {
  return (
    <>
      <h2 id={NEXT_UP_TITLE}>{t('homeInviteTitle')}</h2>
      <p className="next-up-name" dir="auto">
        {invite.title}
      </p>
      <p className="meta" dir="auto">
        {t('homeInviteFrom', { host: nickText(invite.host.nickname), code: spacedCode(invite.code) })}
      </p>
      <Link className="btn btn-primary" to={`/play/${invite.code}`}>
        {t('inviteJoin')}
      </Link>
    </>
  );
}

/** 78: виклик від того, хто додав мене в друзі; «Прийняти виклик» відкриває його сторінку. */
function ChallengeCard({ challenge }: { challenge: FriendChallenge }): JSX.Element {
  return (
    <>
      <h2 id={NEXT_UP_TITLE}>{t('homeChallengeTitle')}</h2>
      <p className="next-up-name" dir="auto">
        {challenge.title}
      </p>
      {challenge.author !== null && (
        <p className="meta" dir="auto">
          {t('challengeFrom', { nick: nickText(challenge.author.nickname) })}
        </p>
      )}
      <p className="meta">{daysLeftText(challenge.expiresAt)}</p>
      <Link className="btn btn-primary" to={`/challenge/${encodeURIComponent(challenge.code)}`}>
        {t('homeChallengePlay')}
      </Link>
    </>
  );
}

/** Картка «Що далі»: «Продовжити гру» (жива чи збережена), запрошення, «Найближча подія» чи виклик; нічого — нічого. */
export function NextUpCard({ signedIn }: { signedIn: boolean }): JSX.Element | null {
  const next = useNextUp(signedIn);
  if (next === null) return null;
  return (
    <section className="panel next-up" aria-labelledby={NEXT_UP_TITLE}>
      {next.kind === 'running' && <RunningCard running={next} />}
      {next.kind === 'saved' && <SavedCard game={next.game} />}
      {next.kind === 'invite' && <InviteCard invite={next.invite} />}
      {next.kind === 'event' && <EventCard event={next.event} />}
      {next.kind === 'challenge' && <ChallengeCard challenge={next.challenge} />}
    </section>
  );
}
