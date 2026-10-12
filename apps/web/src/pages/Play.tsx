import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SocketAuth } from '@quiz/shared';
import { joinGame } from '../api';
import { errorText, t } from '../i18n';
import { useGame } from '../live/useGame';
import { PlayerScreen } from '../screens/PlayerScreen';
import { clearPlayer, loadPlayer, savePlayer } from '../storage';

function JoinForm({ code, notice, onJoined }: { code: string; notice: string | null; onJoined: (token: string) => void }) {
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(notice);
  const ready = nickname.trim().length >= 2;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await joinGame(code, nickname);
    setBusy(false);
    if (result.ok) onJoined(result.token);
    else setError(errorText(result.error));
  };

  return (
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
      <Link className="quiet-link" to="/">
        {t('joinTitle')}
      </Link>
    </main>
  );
}

export function Play() {
  const { code = '' } = useParams();
  const [token, setToken] = useState<string | null>(() => loadPlayer(code));
  const [notice, setNotice] = useState<string | null>(null);
  const auth = useMemo<SocketAuth | null>(() => (token === null ? null : { code, role: 'player', token }), [code, token]);
  const game = useGame(auth);

  // Токен більше не діє: гру закрито або гравця вилучено. Повертаємо форму входу.
  const lost = token !== null && (game.status === 'unauthorized' || game.closed !== null);
  useEffect(() => {
    if (!lost) return;
    setNotice(t(game.closed === 'kicked' ? 'kicked' : 'gameGone'));
    clearPlayer(code);
    setToken(null);
  }, [lost, game.closed, code]);

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
        <p className="lead">{t(game.status === 'offline' ? 'offline' : 'connecting')}</p>
      </main>
    );
  }

  return (
    <>
      {game.status === 'offline' && (
        <p className="banner is-offline" role="status">
          {t('offline')}
        </p>
      )}
      <PlayerScreen view={game.view} hostOnline={game.hostOnline} offsetMs={game.offsetMs} send={game.send} />
    </>
  );
}
