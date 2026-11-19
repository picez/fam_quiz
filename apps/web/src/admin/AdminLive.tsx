import { useEffect, useState, type JSX } from 'react';
import { Navigate } from 'react-router-dom';
import { ADMIN_LIVE_REFRESH_MS, type AdminLiveRoom } from '@quiz/shared';
import { errorText, t } from '../i18n';
import { agoText } from '../locales/grammar';
import { nickText } from '../nick';
import { adminLive, closeLiveGame } from './admin-api';
import { durationText } from './admin-text';
import { useAdminData } from './useAdminData';

/** «123 456»: код кімнати двома трійками, як його диктують гравцям. */
const spacedCode = (code: string): string => `${code.slice(0, 3)} ${code.slice(3)}`;

function statusText(room: AdminLiveRoom): string {
  switch (room.status) {
    case 'lobby':
      return t('adminLiveLobby');
    case 'starting':
      return t('adminLiveStarting');
    case 'finished':
      return t('adminLiveFinished');
    case 'paused':
      return room.round === null ? t('adminLiveStarting') : t('adminLivePaused', { number: room.round.number, of: room.round.of });
    default:
      return room.round === null ? t('adminLiveStarting') : t('adminLiveRound', { number: room.round.number, of: room.round.of });
  }
}

function hostText(room: AdminLiveRoom): string {
  if (room.autopilot) return t('adminLiveAutopilot', { name: nickText(room.host) });
  if (room.host === null) return t('adminLiveGuestHost');
  return t('adminLiveHost', { name: nickText(room.host) });
}

/** Скільки тому була остання дія: до хвилини — «щойно», до години — хвилини, далі години. */
function actedText(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return t('adminLiveJustNow');
  if (minutes < 60) return t('adminLiveMinutes', { count: minutes });
  return agoText(ms);
}

/** Автооновлення кожні 10 с, поки вкладка відкрита й видима; приховали — пауза, повернулися — одразу читає. */
function useLiveRefresh(reload: () => void): void {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(reload, ADMIN_LIVE_REFRESH_MS);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else if (timer === null) {
        reload();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reload]);
}

export function AdminLive(): JSX.Element {
  const state = useAdminData(adminLive, 'live', { keep: true });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { reload } = state;
  useLiveRefresh(reload);

  const close = async (room: AdminLiveRoom) => {
    const code = spacedCode(room.code);
    if (!window.confirm(t('adminLiveCloseConfirm', { code, title: room.title }))) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await closeLiveGame(room.code);
    setBusy(false);
    if (result.ok) setNotice(t('adminLiveClosed', { code }));
    else setError(errorText(result.error));
    reload();
  };

  if (state.status === 'home') return <Navigate to="/" replace />;
  return (
    <>
      <div className="admin-actions admin-live-bar">
        <button type="button" className="btn" onClick={reload}>
          {t('adminLiveRefresh')}
        </button>
        <p className="meta">{t('adminLiveAuto')}</p>
      </div>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice !== null && (
        <p className="meta" role="status">
          {notice}
        </p>
      )}
      {state.status === 'loading' && <p className="meta">{t('loading')}</p>}
      {state.status === 'error' && (
        <>
          <p className="error" role="alert">
            {state.message}
          </p>
          <button type="button" className="btn" onClick={reload}>
            {t('prizesRetry')}
          </button>
        </>
      )}
      {state.status === 'ready' &&
        (state.data.rooms.length === 0 ? (
          <p className="meta">{t('adminLiveEmpty')}</p>
        ) : (
          <ul className="admin-list admin-live">
            {state.data.rooms.map((room) => {
              const now = Date.parse(state.data.at);
              return (
                <li key={room.code} className="admin-card panel">
                  <p className="admin-live-code">{t('adminLiveCode', { code: spacedCode(room.code) })}</p>
                  <h2 dir="auto">{room.title}</h2>
                  <p>{hostText(room)}</p>
                  <p>{t('adminLivePlayers', { online: room.players.online, total: room.players.total })}</p>
                  <p className="admin-mark">{statusText(room)}</p>
                  <p className="meta">{t('adminLiveAge', { time: durationText(now - Date.parse(room.openedAt)) })}</p>
                  <p className="meta">{t('adminLiveActed', { time: actedText(now - Date.parse(room.actedAt)) })}</p>
                  <div className="admin-actions">
                    <a className="btn" href={room.stageUrl} target="_blank" rel="noopener noreferrer">
                      {t('adminLiveStage')}
                    </a>
                    {room.status !== 'finished' && (
                      <button type="button" className="btn" disabled={busy} onClick={() => void close(room)}>
                        {t('adminLiveClose')}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ))}
    </>
  );
}
