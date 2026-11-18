import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CHALLENGE_CODE, type ChallengePreview, type ChallengeResultRow } from '@quiz/shared';
import { getChallenge, getChallengeResults, startChallenge } from '../api';
import { daysLeftText, playedText } from '../challenge/challenge-text';
import { formatDay, secondsText } from '../format';
import { errorText, t } from '../i18n';
import { nickText } from '../nick';
import { loginFor } from '../profile/ProfileSubpage';
import { saveAuthor, saveLastGame, savePlayer } from '../storage';
import { useAccount } from '../useAccount';

type Preview = { status: 'loading' } | { status: 'gone' } | { status: 'error'; message: string } | { status: 'ready'; challenge: ChallengePreview };
type Results = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; rows: ChallengeResultRow[] };

/** Скільки разів і з якою паузою повторюємо старт, поки сервер перезапускається; далі — повідомлення й кнопка. */
export const RESTART_RETRIES = 3;
export const RESTART_DELAY_MS = 2000;

/** Сторінка виклику /challenge/:код (44): гостя — на вхід і назад; картка зі «Почати» чи «Продовжити»; таблиця — лише тим, хто зіграв. */
export function ChallengePage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const account = useAccount();
  const valid = CHALLENGE_CODE.test(code);
  const signedIn = account.status === 'signed-in';
  const [preview, setPreview] = useState<Preview>({ status: 'loading' });
  const [results, setResults] = useState<Results>({ status: 'loading' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!signedIn || !valid) return;
    let current = true;
    void getChallenge(code).then((result) => {
      if (!current) return;
      if (result.ok) setPreview({ status: 'ready', challenge: result.data });
      else if (result.error === 'challenge_not_found') setPreview({ status: 'gone' });
      else setPreview({ status: 'error', message: errorText(result.error) });
    });
    return () => {
      current = false;
    };
  }, [signedIn, valid, code]);

  const canSee = preview.status === 'ready' && preview.challenge.canSeeResults;
  useEffect(() => {
    if (!canSee) return;
    let current = true;
    void getChallengeResults(code).then((result) => {
      if (!current) return;
      setResults(result.ok ? { status: 'ready', rows: result.data } : { status: 'error', message: errorText(result.error) });
    });
    return () => {
      current = false;
    };
  }, [canSee, code]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    let result = await startChallenge(code);
    // Сервер перезапускається: кілька повторів із паузою, не нескінченно.
    for (let attempt = 0; !result.ok && result.error === 'restarting' && attempt < RESTART_RETRIES && alive.current; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, RESTART_DELAY_MS));
      if (!alive.current) return;
      result = await startChallenge(code);
    }
    if (!alive.current) return;
    setBusy(false);
    if (!result.ok) {
      setError(errorText(result.error));
      return;
    }
    const { code: room, token, stageToken } = result.data;
    savePlayer(room, token);
    saveAuthor(room, { stageToken });
    saveLastGame(room);
    navigate(`/play/${room}`);
  }, [code, navigate]);

  const body = () => {
    if (!valid) return <p className="meta challenge-gone">{t('challengeGone')}</p>;
    if (account.status === 'anonymous') {
      return (
        <>
          <p>{t('challengeSignIn')}</p>
          <Link className="btn btn-primary" to={loginFor(`/challenge/${code}`)}>
            {t('menuSignIn')}
          </Link>
        </>
      );
    }
    if (account.status === 'unknown') return <p className="error" role="alert">{errorText(account.error)}</p>;
    if (!signedIn || preview.status === 'loading') return <p className="meta">{t('loading')}</p>;
    if (preview.status === 'gone') return <p className="meta challenge-gone">{t('challengeGone')}</p>;
    if (preview.status === 'error') return <p className="error" role="alert">{preview.message}</p>;
    const { challenge } = preview;
    return (
      <>
        <section className="challenge-card">
          <h2 dir="auto">{challenge.title}</h2>
          {challenge.author !== null && <p dir="auto">{t('challengeFrom', { nick: nickText(challenge.author.nickname) })}</p>}
          <p className="meta">{challenge.active ? daysLeftText(challenge.expiresAt) : t('challengeEnded')}</p>
          <p className="meta">{playedText(challenge.played)}</p>
          {challenge.mine === 'done' && <p>{t('challengeDone')}</p>}
          {challenge.active && challenge.mine !== 'done' && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void start()}>
              {t(challenge.mine === 'playing' ? 'challengeContinue' : 'challengeStart')}
            </button>
          )}
          {error !== null && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
        {!challenge.canSeeResults && <p className="meta">{t('challengeHiddenResults')}</p>}
        {challenge.canSeeResults && <ResultsTable title={challenge.title} results={results} />}
      </>
    );
  };

  return (
    <main className="app challenge-page">
      <h1 className="brand">{t('challengeTitle')}</h1>
      {body()}
    </main>
  );
}

function ResultsTable({ title, results }: { title: string; results: Results }) {
  if (results.status === 'loading') return <p className="meta">{t('loading')}</p>;
  if (results.status === 'error') return <p className="error" role="alert">{results.message}</p>;
  if (results.rows.length === 0) return <p className="meta">{t('challengeNoResults')}</p>;
  return (
    <table className="challenge-results">
      <caption className="sr-only" dir="auto">
        {title}
      </caption>
      <thead>
        <tr>
          <th scope="col">{t('challengePlace')}</th>
          <th scope="col">{t('challengeNick')}</th>
          <th scope="col">{t('challengeScore')}</th>
          <th scope="col">{t('challengeTime')}</th>
          <th scope="col" className="cr-date">
            {t('challengeDate')}
          </th>
        </tr>
      </thead>
      <tbody>
        {results.rows.map((row) => (
          <tr key={`${row.place}-${row.nickname}`} className={row.me ? 'is-me' : undefined}>
            <td>{row.place}</td>
            <th scope="row" className="cr-nick">
              <span dir="auto">{nickText(row.nickname)}</span>
              {row.author && <span className="cr-mark">{t('challengeAuthorMark')}</span>}
              {!row.done && <span className="cr-mark">{t('challengeUnfinished')}</span>}
              <span className="cr-date-inline">{formatDay(row.at)}</span>
            </th>
            <td>{row.score}</td>
            <td>{t('blitzRowTime', { time: secondsText(row.timeMs) })}</td>
            <td className="cr-date">{formatDay(row.at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
