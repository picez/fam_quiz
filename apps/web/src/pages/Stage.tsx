import { useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import type { SocketAuth } from '@quiz/shared';
import { t } from '../i18n';
import { statusTextKey, useGame } from '../live/useGame';
import { StageScreen } from '../screens/StageScreen';

export function Stage() {
  const { code = '' } = useParams();
  const token = useLocation().hash.slice(1);
  const auth = useMemo<SocketAuth | null>(() => (token === '' ? null : { code, role: 'stage', token }), [code, token]);
  const game = useGame(auth);

  if (token === '' || game.status === 'unauthorized' || game.closed !== null) {
    return (
      <main className="app stage">
        <p className="lead">{t('gameGone')}</p>
      </main>
    );
  }

  if (game.view === null || game.view.role !== 'stage') {
    return (
      <main className="app stage">
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
      <StageScreen
        view={game.view}
        code={code}
        joinUrl={`${window.location.origin}/play/${code}`}
        offsetMs={game.offsetMs}
        hostOnline={game.hostOnline}
        audioCommand={game.audioCommand}
      />
    </>
  );
}
