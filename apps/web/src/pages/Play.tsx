import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SocketAuth } from '@quiz/shared';
import { getMyCard, joinGame } from '../api';
import { errorText, t } from '../i18n';
import { statusTextKey, useGame } from '../live/useGame';
import { useAwayWatch } from '../live/useAwayWatch';
import { useSirenUnlock } from '../live/useSirenUnlock';
import { useWakeLock } from '../live/useWakeLock';
import { PlayerScreen } from '../screens/PlayerScreen';
import { clearAuthor, clearPlayer, loadAuthor, loadPlayer, savePlayer } from '../storage';
import { Menu } from '../menu/Menu';
import { useAccount } from '../useAccount';

function JoinForm({ code, notice, onJoined }: { code: string; notice: string | null; onJoined: (token: string) => void }) {
  const account = useAccount();
  const [nickname, setNickname] = useState('');
  // Хто увійшов, не вводить ім'я щоразу: поле заповнюється нікнеймом профілю, і його можна змінити перед входом.
  const signedIn = account.status === 'signed-in';
  useEffect(() => {
    if (!signedIn) return;
    let current = true;
    void getMyCard().then((result) => {
      if (current && result.ok) setNickname((typed) => (typed === '' ? result.data.nickname.slice(0, 20) : typed));
    });
    return () => {
      current = false;
    };
  }, [signedIn]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(notice);
  const ready = nickname.trim().length >= 2;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await joinGame(code, nickname);
    setBusy(false);
    if (result.ok) onJoined(result.token);
    else setError(errorText(result.error === 'wrong_phase' ? 'game_started' : result.error));
  };

  // До входу в гру меню є, як на інших сторінках (беклог 24): з форми можна піти куди завгодно.
  return (
    <div className="with-menu">
      <Menu />
      <main className="app narrow">
        <h1 className="brand">{`${code.slice(0, 3)} ${code.slice(3)}`}</h1>
        <form className="panel" onSubmit={submit}>
          <label className="field">
            <span>{t('nicknameLabel')}</span>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={20}
              autoComplete="nickname"
              autoFocus
              aria-describedby="nickname-hint"
            />
          </label>
          <p className="meta" id="nickname-hint">
            {t('nicknameHint')}
          </p>
          <button type="submit" className="btn btn-primary" disabled={!ready || busy}>
            {t(busy ? 'checking' : 'enterGame')}
          </button>
          {error !== null && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
        {account.status === 'signed-in' && <p className="meta">{t('playingAs', { name: account.account.name })}</p>}
        {account.status === 'anonymous' && (
          <Link className="quiet-link" to={`/login?next=${encodeURIComponent(`/play/${code}`)}`}>
            {t('signInToKeep')}
          </Link>
        )}
        <Link className="quiet-link" to="/">
          {t('joinTitle')}
        </Link>
      </main>
    </div>
  );
}

export function Play() {
  const { code = '' } = useParams();
  const [token, setToken] = useState<string | null>(() => loadPlayer(code));
  const [notice, setNotice] = useState<string | null>(null);
  const auth = useMemo<SocketAuth | null>(() => (token === null ? null : { code, role: 'player', token }), [code, token]);
  const game = useGame(auth);
  // Антигугл (12e): телефон гравця каже серверу, коли виходить із гри й повертається.
  useAwayWatch(game.send, game.status, game.view);
  // Сирена тривоги (12e) розблоковується першим жестом: iOS не дає звуку контексту, створеному поза жестом.
  useSirenUnlock();
  // Екран не гасне від входу до кінця гри: заблокований телефон на столі не має виглядати виходом.
  const screenUnguarded = useWakeLock(game.view !== null && game.view.role === 'player' && game.view.phase !== 'finished');

  // Токен більше не діє: гру закрито або гравця вилучено. Повертаємо форму входу.
  const wasAutopilot = useRef(false);
  if (game.view !== null && game.view.role === 'player') wasAutopilot.current = game.view.autopilot;
  const lost = token !== null && (game.status === 'unauthorized' || game.closed !== null);
  useEffect(() => {
    if (!lost) return;
    const auto = wasAutopilot.current;
    setNotice(t(game.closed === 'kicked' ? (auto ? 'kickedByAuthor' : 'kicked') : auto ? 'gameGoneAuto' : 'gameGone'));
    clearPlayer(code);
    clearAuthor(code);
    setToken(null);
  }, [lost, game.closed, code]);

  const author = loadAuthor(code);
  const stageUrl = author === null ? null : `${window.location.origin}/stage/${code}#${author.stageToken}`;

  if (token === null) {
    return (
      <JoinForm
        key={notice ?? 'fresh'}
        code={code}
        notice={notice}
        onJoined={(joined) => {
          savePlayer(code, joined);
          setNotice(null);
          setToken(joined);
        }}
      />
    );
  }

  if (game.view === null || game.view.role !== 'player') {
    return (
      <main className="app narrow">
        <p className="lead">{t(statusTextKey(game.status))}</p>
      </main>
    );
  }

  return (
    <>
      {(game.status === 'offline' || game.status === 'restarting') && (
        <p className="banner is-offline" role="status">
          {t(statusTextKey(game.status))}
        </p>
      )}
      {/* Без Wake Lock (немає чи відмовлено) і зі штрафом: блокування екрана теж рахується виходом — попереджаємо. */}
      {screenUnguarded && game.view.awayPenalty && game.view.phase !== 'lobby' && (
        <p className="banner is-wake" role="note">
          {t('awayWakeWarning')}
        </p>
      )}
      <PlayerScreen
        view={game.view}
        hostOnline={game.hostOnline}
        offsetMs={game.offsetMs}
        send={game.send}
        tilts={game.tilts}
        code={code}
        stageUrl={stageUrl}
        stageOnline={game.stageOnline}
      />
    </>
  );
}
