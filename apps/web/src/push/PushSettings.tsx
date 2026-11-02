import { useEffect, useRef, useState, type JSX } from 'react';
import { getPushKey } from '../api';
import { t } from '../i18n';
import { browserEnv, currentSubscription, disablePush, enablePush, pushSupport, sameKey } from './push-client';

type View = 'loading' | 'hidden' | 'ios' | 'denied' | 'off' | 'on';

const permission = (): string => (typeof Notification === 'undefined' ? 'default' : Notification.permission);

/** Блок «Сповіщення»: повний у профілі, `compact` у календарі (лише «вимкнено» і iOS-підказка). */
export function PushSettings({ compact = false }: { compact?: boolean }): JSX.Element | null {
  const [view, setView] = useState<View>('loading');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    void (async () => {
      const key = await getPushKey();
      if (!alive.current) return;
      if (!key.ok || key.publicKey === null) return setView('hidden');
      const support = pushSupport(browserEnv());
      if (support === 'unsupported') return setView('hidden');
      if (support === 'ios-home-screen') return setView('ios');
      setPublicKey(key.publicKey);
      if (permission() === 'denied') return setView('denied');
      const sub = await currentSubscription().catch(() => null);
      if (!alive.current) return;
      if (sub === null) return setView('off');
      if (permission() !== 'granted') return setView('off');
      if (!sameKey(sub, key.publicKey)) {
        // Ключ сервера змінився: стара підписка мертва. Дозвіл уже є, тож без дотику.
        await sub.unsubscribe().catch(() => false);
        const result = await enablePush(key.publicKey);
        if (!alive.current) return;
        return setView(result === 'on' ? 'on' : 'off');
      }
      setView('on');
    })();
    return () => {
      alive.current = false;
    };
  }, []);

  if (view === 'loading' || view === 'hidden') return null;
  if (compact && (view === 'on' || view === 'denied')) return null;

  const turnOn = async () => {
    if (busy || publicKey === null) return;
    setBusy(true);
    setFailed(false);
    const result = await enablePush(publicKey);
    if (!alive.current) return;
    setBusy(false);
    if (result === 'on') setView('on');
    else if (result === 'denied') setView('denied');
    else setFailed(true);
  };
  const turnOff = async () => {
    if (busy) return;
    setBusy(true);
    await disablePush().catch(() => undefined);
    if (!alive.current) return;
    setBusy(false);
    setView('off');
  };

  const body = (
    <>
      {view === 'ios' && <p className="meta">{t('pushIosHint')}</p>}
      {view === 'denied' && <p className="meta">{t('pushDenied')}</p>}
      {view === 'off' && (
        <>
          <p className="meta">{t('pushIntro')}</p>
          <button type="button" className="btn" disabled={busy} onClick={() => void turnOn()}>
            {t('pushEnable')}
          </button>
          {failed && (
            <p className="error" role="alert">
              {t('pushFailed')}
            </p>
          )}
        </>
      )}
      {view === 'on' && (
        <>
          <p className="meta">{t('pushOn')}</p>
          <button type="button" className="btn secondary" disabled={busy} onClick={() => void turnOff()}>
            {t('pushDisable')}
          </button>
        </>
      )}
    </>
  );
  if (compact) return <div className="push-settings is-compact">{body}</div>;
  return (
    <section className="profile-section push-settings">
      <h2>{t('pushTitle')}</h2>
      {body}
    </section>
  );
}
