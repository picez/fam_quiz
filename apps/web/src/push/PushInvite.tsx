import { useEffect, useRef, useState, type JSX } from 'react';
import { getPushKey } from '../api';
import { t } from '../i18n';
import { useAccount } from '../useAccount';
import { inviteDue, rememberInvite } from './push-invite';
import { browserEnv, currentSubscription, enablePush, pushSupport, type BrowserEnv } from './push-client';

const permission = (): string => (typeof Notification === 'undefined' ? 'default' : Notification.permission);

type Outcome = 'on' | 'denied' | 'unsupported' | 'failed' | null;

/**
 * Тиха панель після гри (70): «Не пропускайте новини». Зовнішня частина синхронно відсіює браузери без push і недавній показ —
 * тоді нічого не питає в сервера. Внутрішня: лише акаунт, сервер має ключ, дозвіл не «заборонено», підписки на пристрої немає.
 */
export function PushInvite({ env, now = Date.now }: { env?: BrowserEnv; now?: () => number }): JSX.Element | null {
  const [due] = useState(() => {
    // Заблоковане сховище кидає вже на звертанні до localStorage — тоді без панелі, екран кінця гри цілий.
    try {
      return pushSupport(env ?? browserEnv()) === 'supported' && inviteDue(now(), localStorage);
    } catch {
      return false;
    }
  });
  return due ? <Invite now={now} /> : null;
}

function Invite({ now }: { now: () => number }): JSX.Element | null {
  const account = useAccount();
  const signedIn = account.status === 'signed-in';
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (!signedIn) return;
    void (async () => {
      const key = await getPushKey();
      if (!alive.current || !key.ok || key.publicKey === null) return;
      if (permission() === 'denied') return;
      const sub = await currentSubscription().catch(() => null);
      if (!alive.current || sub !== null) return;
      setPublicKey(key.publicKey);
      try {
        rememberInvite(now(), localStorage);
      } catch {
        // сховище недоступне — запрошення просто може з'явитися знову
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [signedIn, now]);

  if (hidden || publicKey === null) return null;
  const turnOn = async () => {
    if (busy) return;
    setBusy(true);
    const result = await enablePush(publicKey);
    if (!alive.current) return;
    setBusy(false);
    setOutcome(result === 'on' || result === 'denied' || result === 'unsupported' || result === 'failed' ? result : null);
  };
  const statusKey = outcome === 'on' ? 'pushInviteDone' : outcome === 'denied' ? 'pushDenied' : outcome === 'unsupported' ? 'pushUnsupported' : outcome === 'failed' ? 'pushFailed' : null;
  return (
    <section className="push-invite panel" aria-labelledby="push-invite-title">
      <h2 id="push-invite-title">{t('pushInviteTitle')}</h2>
      <p className="meta">{t('pushInviteText')}</p>
      <div className="push-invite-actions">
        {outcome !== 'on' && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void turnOn()}>
            {t('pushInviteOn')}
          </button>
        )}
        <button type="button" className="btn btn-quiet" onClick={() => setHidden(true)}>
          {t('pushInviteLater')}
        </button>
      </div>
      <p className="meta" role="status">
        {statusKey === null ? '' : t(statusKey)}
      </p>
    </section>
  );
}
