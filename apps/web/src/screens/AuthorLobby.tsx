import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { ContinuedView, ResumeLobby } from '@quiz/shared';
import { t } from '../i18n';
import type { Send } from '../live/types';
import { useGuardedSend } from '../live/useGuardedSend';
import { emptyDraft, restartNoteText, resumePayload } from '../resume';
import { PrizePlaces } from './PrizePlaces';
import { ResumePanel } from './ResumePanel';

const COPIED_MS = 2000;

/** Лобі автора (11h): код, QR входу, посилання на сцену (якщо токен сцени збережено на цьому пристрої), «Продовжити попередню гру» (12r) і «Почати гру». */
export function AuthorLobby({
  code,
  stageUrl,
  joinUrl,
  send,
  onError,
  resume = null,
  continued,
  levelBonuses,
}: {
  code: string;
  /** null — токена сцени на цьому пристрої немає: посилання не показано. */
  stageUrl: string | null;
  joinUrl: string;
  send: Send;
  onError: (message: string | null) => void;
  /** «Продовжити попередню гру» (12r): раунди й учасники; null — панелі немає. */
  resume?: ResumeLobby | null;
  /** Кімната продовження збереженої гри (13b): бали переносить сервер — замість панелі 12r лише рядок про стартовий раунд. */
  continued?: ContinuedView;
  /** view.levelBonuses: без значення — діють; 'off' — ведучий вимкнув; 'none' — не діють тут узагалі, рядка немає. */
  levelBonuses?: 'off' | 'none';
}) {
  const guard = useGuardedSend(send, onError);
  const [copied, setCopied] = useState(false);
  const [resumeDraft, setResumeDraft] = useState(emptyDraft);
  const resumeSend = resume === null || continued !== undefined ? undefined : resumePayload(resumeDraft, resume);
  const [copyFailed, setCopyFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    if (stageUrl === null) return;
    try {
      await navigator.clipboard.writeText(stageUrl);
    } catch {
      setCopyFailed(true);
      return;
    }
    setCopyFailed(false);
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
            <p className="meta" aria-live="polite">
              {copyFailed ? t('authorCopyFailed') : ''}
            </p>
          </div>
        )}
      </section>
      <PrizePlaces code={code} />
      {continued === undefined && resume !== null && resume.rounds.length > 0 && <ResumePanel code={code} info={resume} draft={resumeDraft} onChange={setResumeDraft} />}
      {continued !== undefined && continued.carryRound !== null && <p className="meta">{restartNoteText(continued.carryRound, resume)}</p>}
      {levelBonuses !== 'none' && <p className="meta">{t(levelBonuses === 'off' ? 'levelBonusesOff' : 'levelBonusesOn')}</p>}
      <p className="lead">{t('authorStartHint')}</p>
      <button
        type="button"
        className="btn btn-primary author-start"
        disabled={guard.busy || resumeSend === 'invalid'}
        onClick={() => {
          if (resumeSend !== 'invalid') void guard.run('host:start', resumeSend);
        }}
      >
        {t('authorStart')}
      </button>
    </>
  );
}
