import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SocketAuth, SortTilt } from '@quiz/shared';
import { hostAccess } from '../api';
import { t } from '../i18n';
import { statusTextKey, useGame } from '../live/useGame';
import { HostScreen } from '../screens/HostScreen';
import { loadHost, saveHost, type HostTokens } from '../storage';
import { RETRY_MS } from '../live/useGame';
import { useLiveWatch } from '../live/useLiveWatch';

const NO_TILTS: Record<string, SortTilt> = {};

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
    let retry: ReturnType<typeof setTimeout> | null = null;
    const ask = () =>
      void hostAccess(code).then((result) => {
        if (!current) return;
        // Сервер перезапускається, а не «немає доступу»: питаємо ще раз.
        if (!result.ok && result.error === 'restarting') {
          retry = setTimeout(ask, RETRY_MS);
          return;
        }
        if (!result.ok) return setAccess({ status: 'denied' });
        const tokens = { hostToken: result.hostToken, stageToken: result.stageToken };
        saveHost(code, tokens);
        setAccess({ status: 'granted', tokens });
      });
    ask();
    return () => {
      current = false;
      if (retry !== null) clearTimeout(retry);
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
  const [watch, setWatch] = useLiveWatch(game.send, game.status);
  // Перемикач «наживо» змінився: старі пакет і нахили забуваються, бо без «наживо» сервер їх не оновлює,
  // а з увімкненням одразу шле свіжі (12b).
  const { forgetLive } = game;
  useEffect(() => forgetLive(), [watch, forgetLive]);

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
        <p className="lead">{t(statusTextKey(game.status))}</p>
      </main>
    );
  }

  const origin = window.location.origin;
  return (
    <>
      {(game.status === 'offline' || game.status === 'restarting') && (
        <p className="banner is-offline" role="status">
          {t(statusTextKey(game.status))}
        </p>
      )}
      <HostScreen
        view={game.view}
        code={code}
        stageUrl={`${origin}/stage/${code}#${tokens.stageToken}`}
        joinUrl={`${origin}/play/${code}`}
        send={game.send}
        offsetMs={game.offsetMs}
        stageOnline={game.stageOnline}
        audioCommand={game.audioCommand}
        tilts={watch ? game.tilts : NO_TILTS}
        watch={watch}
        onWatch={setWatch}
        drafts={watch ? game.drafts : null}
      />
    </>
  );
}
