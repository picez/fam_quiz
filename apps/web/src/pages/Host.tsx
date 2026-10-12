import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SocketAuth } from '@quiz/shared';
import { hostAccess } from '../api';
import { t } from '../i18n';
import { useGame } from '../live/useGame';
import { HostScreen } from '../screens/HostScreen';
import { loadHost, saveHost, type HostTokens } from '../storage';

type Access = { status: 'asking' } | { status: 'denied' } | { status: 'granted'; tokens: HostTokens };

/** Токени пульта: з цього пристрою, а якщо їх тут немає, то із сервера за сесією ведучого. */
function useHostTokens(code: string): Access {
  const [access, setAccess] = useState<Access>(() => {
    const local = loadHost(code);
    return local === null ? { status: 'asking' } : { status: 'granted', tokens: local };
  });

  useEffect(() => {
    if (access.status !== 'asking') return;
    let current = true;
    void hostAccess(code).then((result) => {
      if (!current) return;
      if (!result.ok) return setAccess({ status: 'denied' });
      const tokens = { hostToken: result.hostToken, stageToken: result.stageToken };
      saveHost(code, tokens);
      setAccess({ status: 'granted', tokens });
    });
    return () => {
      current = false;
    };
  }, [access.status, code]);

  return access;
}

export function Host() {
  const { code = '' } = useParams();
  const access = useHostTokens(code);
  const tokens = access.status === 'granted' ? access.tokens : null;
  const auth = useMemo<SocketAuth | null>(
    () => (tokens === null ? null : { code, role: 'host', token: tokens.hostToken }),
    [code, tokens],
  );
  const game = useGame(auth);

  if (access.status === 'denied') {
    return (
      <main className="app narrow">
        <p className="lead">{t('noHostAccess')}</p>
        <Link className="btn btn-primary" to={`/login?next=${encodeURIComponent(`/host/${code}`)}`}>
          {t('joinButton')}
        </Link>
        <Link className="quiet-link" to="/quizzes">
          {t('quizzesTitle')}
        </Link>
      </main>
    );
  }

  if (tokens !== null && (game.status === 'unauthorized' || game.closed !== null)) {
    return (
      <main className="app narrow">
        <p className="lead">{t('gameGone')}</p>
        <Link className="quiet-link" to="/quizzes">
          {t('quizzesTitle')}
        </Link>
      </main>
    );
  }

  if (tokens === null || game.view === null || game.view.role !== 'host') {
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
