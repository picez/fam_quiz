import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SocketAuth } from '@quiz/shared';
import { t } from '../i18n';
import { useGame } from '../live/useGame';
import { HostScreen } from '../screens/HostScreen';
import { loadHost } from '../storage';

export function Host() {
  const { code = '' } = useParams();
  const tokens = useMemo(() => loadHost(code), [code]);
  const auth = useMemo<SocketAuth | null>(
    () => (tokens === null ? null : { code, role: 'host', token: tokens.hostToken }),
    [code, tokens],
  );
  const game = useGame(auth);

  if (tokens === null || game.status === 'unauthorized' || game.closed !== null) {
    return (
      <main className="app narrow">
        <p className="lead">{t(tokens === null ? 'noHostAccess' : 'gameGone')}</p>
        <Link className="quiet-link" to="/new">
          {t('newGameTitle')}
        </Link>
      </main>
    );
  }

  if (game.view === null || game.view.role !== 'host') {
    return (
      <main className="app narrow">
        <p className="lead">{t(game.status === 'offline' ? 'offline' : 'connecting')}</p>
      </main>
    );
  }

  const origin = window.location.origin;
  return (
    <>
      {game.status === 'offline' && (
        <p className="banner is-offline" role="status">
          {t('offline')}
        </p>
      )}
      <HostScreen
        view={game.view}
        code={code}
        stageUrl={`${origin}/stage/${code}#${tokens.stageToken}`}
        joinUrl={`${origin}/play/${code}`}
        send={game.send}
      />
    </>
  );
}
