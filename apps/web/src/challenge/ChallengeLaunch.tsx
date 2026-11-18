import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { CHALLENGE_SKIP_BUFFS, CHALLENGE_SKIP_SETTINGS, type ChallengeCheck, type ChallengeMine } from '@quiz/shared';
import { createChallenge, getChallengeCheck, type QuizSummary } from '../api';
import { ROUND_NAMES } from '../guide-text';
import { HelpButton } from '../help/HelpButton';
import { countText, errorText, t } from '../i18n';
import { namesText } from '../locales/grammar';
import { challengeUrl } from './challenge-link';
import { daysLeftText, playedText } from './challenge-text';

type Check = { state: 'checking' } | { state: 'failed'; error: string } | { state: 'ready'; check: ChallengeCheck };

export { challengeUrl };

/** Рядки «що буде пропущено»: раунди, запитання класики (множина), налаштування й бонуси одним рядком. */
export function skippedLines(skipped: ChallengeCheck['skipped']): string[] {
  const lines: string[] = [];
  for (const round of skipped.rounds) lines.push(t('challengeSkipRound', { index: round.index + 1, type: t(ROUND_NAMES[round.type as keyof typeof ROUND_NAMES]) }));
  for (const item of skipped.questions) {
    lines.push(countText('challengeSkipQuestions', item.count, { index: item.index + 1, type: t(ROUND_NAMES.classic), count: item.count }));
  }
  for (const setting of CHALLENGE_SKIP_SETTINGS) {
    if (skipped.settings.includes(setting)) lines.push(t(`challengeSkipSetting_${setting}`));
  }
  const buffs = CHALLENGE_SKIP_BUFFS.filter((kind) => skipped.settings.includes(kind));
  if (buffs.length > 0) lines.push(t('challengeSkipBuffs', { list: namesText(buffs.map((kind) => t(`buff_${kind}`))) }));
  return lines;
}

/**
 * Вікно «🏁 Виклик» (44): що буде пропущено, створити чи замінити виклик; поки виклик діє — його посилання з «Копіювати»
 * і «Поділитися» (переслати ще раз, не замінюючи), «Новий виклик» — другорядна дія.
 */
export function ChallengeLaunch({ quiz, onClose, onCreated }: { quiz: QuizSummary; onClose: () => void; onCreated: (mine: ChallengeMine) => void }) {
  const navigate = useNavigate();
  const [check, setCheck] = useState<Check>({ state: 'checking' });
  const [created, setCreated] = useState<ChallengeMine | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const linkRef = useRef<HTMLInputElement | null>(null);
  // Поки виклик створюється, аркуш не закривається: відповідь має куди прийти.
  const busyRef = useRef(false);
  const close = () => {
    if (!busyRef.current) onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    let current = true;
    void getChallengeCheck(quiz.id).then((result) => {
      if (!current) return;
      setCheck(result.ok ? { state: 'ready', check: result.data } : { state: 'failed', error: result.error });
    });
    return () => {
      current = false;
    };
  }, [quiz.id]);

  // Фокус іде в аркуш і повертається на кнопку «🏁 Виклик», коли аркуш закрито.
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => trigger?.focus();
  }, []);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && document.querySelector('.help-pop') === null) closeRef.current();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, []);

  const ready = check.state === 'ready' ? check.check : null;
  const active = created ?? ready?.active ?? null;

  const create = async () => {
    if (ready === null || ready.empty || busy) return;
    if (active !== null && !window.confirm(t('challengeReplaceConfirm'))) return;
    setBusy(true);
    busyRef.current = true;
    setError(null);
    setCopy('idle');
    const result = await createChallenge(quiz.id);
    setBusy(false);
    busyRef.current = false;
    if (!result.ok) {
      if (result.error === 'unauthorized') navigate('/login?next=%2Fquizzes', { replace: true });
      else setError(errorText(result.error));
      return;
    }
    setCreated(result.data);
    onCreated(result.data);
  };

  const copyLink = async () => {
    if (active === null) return;
    try {
      await navigator.clipboard.writeText(challengeUrl(active.code));
      setCopy('copied');
    } catch {
      setCopy('failed');
      linkRef.current?.select();
    }
  };

  const share = () => {
    if (active === null) return;
    void navigator.share({ title: quiz.title, text: t('challengeShareText', { title: quiz.title }), url: challengeUrl(active.code) }).catch(() => undefined);
  };

  const shownError = error ?? (check.state === 'failed' ? errorText(check.error) : null);

  // Tab і Shift+Tab ходять колом усередині аркуша (aria-modal).
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const items = [...(cardRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])') ?? [])];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const here = document.activeElement;
    if (event.shiftKey && (here === first || !cardRef.current?.contains(here))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (here === last || !cardRef.current?.contains(here))) {
      event.preventDefault();
      first.focus();
    }
  };

  const lines = ready === null ? [] : skippedLines(ready.skipped);
  // Щойно створено: вступ і список пропущеного вже бачили — лишається посилання, щоб усе влізло на телефон.
  const fresh = created !== null;

  return createPortal(
    <div className="table-sheet" role="dialog" aria-modal="true" aria-label={t('challengeTitle')} tabIndex={-1} onClick={close} onKeyDown={onKeyDown}>
      <div ref={cardRef} className="table-card autopilot-card challenge-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="autopilot-head">
          <h2>{t('challengeTitle')}</h2>
          <HelpButton id="setting.challenge" />
        </div>
        <p className="meta" dir="auto">{quiz.title}</p>
        {!fresh && <p>{t('challengeLead')}</p>}

        {check.state === 'checking' && <p className="meta">{t('challengeChecking')}</p>}
        {ready !== null && ready.empty && <p className="error">{t('challengeEmpty')}</p>}
        {!fresh && ready !== null && lines.length === 0 && !ready.empty && <p className="meta">{t('challengeSkipNone')}</p>}
        {!fresh && ready !== null && lines.length > 0 && (
          <section>
            <h3 className="autopilot-subtitle">{t('challengeSkipTitle')}</h3>
            <ul className="autopilot-changes">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        )}

        {active !== null && !fresh && (
          <p className="meta">
            {daysLeftText(active.expiresAt)} · {playedText(active.played)}
          </p>
        )}

        {active !== null && (
          <section className="challenge-link">
            <label className="field">
              <span>{t('challengeLink')}</span>
              <input ref={linkRef} readOnly value={challengeUrl(active.code)} dir="ltr" onFocus={(event) => event.currentTarget.select()} />
            </label>
            <div className="autopilot-actions">
              <button type="button" className="btn" onClick={() => void copyLink()}>
                {t('challengeCopy')}
              </button>
              {typeof navigator.share === 'function' && (
                <button type="button" className="btn" onClick={share}>
                  {t('challengeShare')}
                </button>
              )}
              <Link className="btn" to={`/challenge/${active.code}`}>
                {t('challengeOpenResults')}
              </Link>
            </div>
            <p className="meta" role="status">
              {copy === 'copied' ? t('challengeCopied') : copy === 'failed' ? t('challengeCopyFailed') : ''}
            </p>
          </section>
        )}

        {shownError !== null && (
          <p className="error" role="alert">
            {shownError}
          </p>
        )}

        <div className="autopilot-actions">
          {!fresh && ready !== null && !ready.empty && (
            <button type="button" className={active !== null ? 'btn' : 'btn btn-primary'} disabled={busy} onClick={() => void create()}>
              {active !== null ? t('challengeReplace') : t('challengeCreate')}
            </button>
          )}
          <button ref={cancelRef} type="button" className="btn" onClick={close} disabled={busy}>
            {fresh ? t('challengeClose') : t('cancel')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
