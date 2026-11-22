import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SocketAuth, SortTilt } from '@quiz/shared';
import { botHostAccess } from '../admin/admin-api';
import { t } from '../i18n';
import { NetSignal } from '../live/NetSignal';
import { RETRY_MS, statusTextKey, useGame } from '../live/useGame';
import { useLiveWatch } from '../live/useLiveWatch';
import { BotHostBar } from '../screens/BotHostBar';
import { HostScreen } from '../screens/HostScreen';

const NO_TILTS: Record<string, SortTilt> = {};

interface Tokens { hostToken: string; stageToken: string }
type Access = { status: 'asking' } | { status: 'denied' } | { status: 'granted'; tokens: Tokens };

/**
 * Пульт адміна в кімнаті бота (68): те саме HostScreen, що й у ведучого, але токени — з маршруту адміна, лише в стані
 * компонента (без saveHost і localStorage). Після рестарту токен питається знову; другий раз поспіль — гри вже немає.
 */
export function BotHost() {
  const { code = '' } = useParams();
  const [access, setAccess] = useState<Access>({ status: 'asking' });
  const [gone, setGone] = useState(false);
  /** Токен уже питали вдруге після «unauthorized» (скидається, щойно з'єднання стало живим). */
  const retried = useRef(false);

  useEffect(() => {
    if (access.status !== 'asking') return;
    let current = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const ask = () =>
      void botHostAccess(code).then((result) => {
        if (!current) return;
        if (!result.ok && result.error === 'restarting') {
          retry = setTimeout(ask, RETRY_MS);
          return;
        }
        if (!result.ok) return setAccess({ status: 'denied' });
        setAccess({ status: 'granted', tokens: { hostToken: result.hostToken, stageToken: result.stageToken } });
      });
    ask();
    return () => {
      current = false;
      if (retry !== null) clearTimeout(retry);
    };
  }, [access.status, code]);

  const tokens = access.status === 'granted' ? access.tokens : null;
  const auth = useMemo<SocketAuth | null>(() => (tokens === null ? null : { code, role: 'host', token: tokens.hostToken }), [code, tokens]);
  const game = useGame(auth);
  const [watch, setWatch] = useLiveWatch(game.send, game.status);
  const { forgetLive } = game;
  useEffect(() => forgetLive(), [watch, forgetLive]);

  const unauthorized = tokens !== null && game.status === 'unauthorized';
  useEffect(() => {
    if (game.status === 'live') retried.current = false;
    if (!unauthorized) return;
    if (retried.current) return setGone(true);
    retried.current = true;
    setAccess({ status: 'asking' });
  }, [unauthorized, game.status]);

  if (access.status === 'denied') {
    return (
      <main className="app narrow game-bg">
        <p className="lead">{t('botHostDenied')}</p>
        <Link className="btn btn-primary" to="/admin/bot">
          {t('botHostBack')}
        </Link>
      </main>
    );
  }

  if (gone || (tokens !== null && game.closed !== null)) {
    return (
      <main className="app narrow game-bg">
        <p className="lead">{t('gameGone')}</p>
        <Link className="quiet-link" to="/admin/bot">
          {t('botHostBack')}
        </Link>
      </main>
    );
  }

  if (tokens === null || game.view === null || game.view.role !== 'host') {
    return (
      <main className="app narrow game-bg">
        <p className="lead">{t(tokens === null ? 'connecting' : statusTextKey(game.status))}</p>
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
      <NetSignal status={game.status} quality={game.quality} />
      <BotHostBar view={game.view} code={code} />
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
        reactions={game.reactions}
        drawing={game.drawing}
        botHost
      />
    </>
  );
}
