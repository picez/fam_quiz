import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { t } from '../i18n';
import type { Send } from '../live/types';
import { useGuardedSend } from '../live/useGuardedSend';

const COPIED_MS = 2000;

/** Лобі автора (11h): код, QR входу, посилання на сцену (якщо токен сцени збережено на цьому пристрої) і «Почати гру». */
export function AuthorLobby({
  code,
  stageUrl,
  joinUrl,
  send,
  onError,
}: {
  code: string;
  /** null — токена сцени на цьому пристрої немає: посилання не показано. */
  stageUrl: string | null;
  joinUrl: string;
  send: Send;
  onError: (message: string | null) => void;
}) {
  const guard = useGuardedSend(send, onError);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    if (stageUrl === null) return;
    try {
      await navigator.clipboard.writeText(stageUrl);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <>
      <section className="card author-lobby">
        <p className="meta">{t('authorCodeLabel')}</p>
        <p className="author-code">{`${code.slice(0, 3)} ${code.slice(3)}`}</p>
        <div className="qr author-qr">
          <QRCodeSVG value={joinUrl} size={168} title={joinUrl} bgColor="#F5F1E6" fgColor="#0E1020" marginSize={2} />
        </div>
        {stageUrl !== null && (
          <div className="author-stage">
            <p className="meta">{t('authorStageLabel')}</p>
            <p className="meta">{t('authorStageHint')}</p>
            <p className="author-stage-url">{stageUrl}</p>
            <div className="author-stage-actions">
              {typeof navigator !== 'undefined' && navigator.clipboard !== undefined && (
                <button type="button" className="btn" onClick={() => void copy()}>
                  {t(copied ? 'authorCopied' : 'authorCopy')}
                </button>
              )}
              <a className="btn" href={stageUrl} target="_blank" rel="noopener">
                {t('authorOpen')}
              </a>
            </div>
          </div>
        )}
      </section>
      <p className="lead">{t('authorStartHint')}</p>
      <button type="button" className="btn btn-primary author-start" disabled={guard.busy} onClick={() => void guard.run('host:start', undefined)}>
        {t('authorStart')}
      </button>
    </>
  );
}
