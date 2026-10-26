import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AUTOPILOT_CHANGES, type AutopilotCheck } from '@quiz/shared';
import { createAutopilotGame, getAutopilotCheck, getMyProfile, type QuizSummary } from '../api';
import { HelpButton } from '../help/HelpButton';
import { countText, errorText, t, type TextKey } from '../i18n';
import { saveAuthor, saveLastGame, savePlayer } from '../storage';

type Check = { state: 'checking' } | { state: 'failed'; error: string } | { state: 'ready'; check: AutopilotCheck };

/** «Раунд 2», «Раунди 1, 3»: 1-базові номери з 0-базових раундів. */
const roundsText = (rounds: number[]): string => countText('autopilotRounds', rounds.length, { list: rounds.map((round) => round + 1).join(', ') });

/** Вікно «Гра без ведучого» (11h): перевірка сумісності, примітка, нікнейм, «Створити кімнату». */
export function AutopilotLaunch({ quiz, onClose }: { quiz: QuizSummary; onClose: () => void }) {
  const navigate = useNavigate();
  const [check, setCheck] = useState<Check>({ state: 'checking' });
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    let current = true;
    void Promise.all([getAutopilotCheck(quiz.id), getMyProfile()]).then(([result, profile]) => {
      if (!current) return;
      if (profile.ok) setNickname((typed) => (typed === '' ? profile.data.nickname : typed));
      if (result.ok) setCheck({ state: 'ready', check: { blocked: result.blocked, changed: result.changed } });
      else setCheck({ state: 'failed', error: result.error });
    });
    return () => {
      current = false;
    };
  }, [quiz.id]);

  // Фокус іде в аркуш і повертається на «Провести ботом», коли аркуш закрито.
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

  const blocked = check.state === 'ready' && check.check.blocked.length > 0;
  const canCreate = check.state === 'ready' && !blocked && nickname.trim().length >= 2 && !busy;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    const result = await createAutopilotGame(quiz.id, nickname.trim());
    if (!result.ok) {
      setBusy(false);
      if (result.error === 'unauthorized') navigate('/login?next=%2Fquizzes', { replace: true });
      else setError(errorText(result.error));
      return;
    }
    savePlayer(result.code, result.token);
    saveAuthor(result.code, { stageToken: result.stageToken });
    saveLastGame(result.code);
    navigate(`/play/${result.code}`);
  };

  const shownError = error ?? (check.state === 'failed' ? errorText(check.error) : null);

  return createPortal(
    <div className="table-sheet" role="dialog" aria-modal="true" aria-label={t('autopilotTitle')} tabIndex={-1} onClick={onClose}>
      <form className="table-card autopilot-card" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void submit(event)}>
        <div className="autopilot-head">
          <h2>{t('autopilotTitle')}</h2>
          <HelpButton id="setting.autopilot" />
        </div>
        <p className="meta">{quiz.title}</p>
        <p>{t('autopilotLead')}</p>

        {check.state === 'checking' && <p className="meta">{t('autopilotChecking')}</p>}
        {blocked && <p className="error">{t('autopilotBlocked')}</p>}
        {check.state === 'ready' && !blocked && check.check.changed.length === 0 && <p className="meta">{t('autopilotNoChanges')}</p>}
        {check.state === 'ready' && !blocked && check.check.changed.length > 0 && (
          <section>
            <h3 className="autopilot-subtitle">{t('autopilotChangesTitle')}</h3>
            <ul className="autopilot-changes">
              {AUTOPILOT_CHANGES.flatMap((code) => {
                const issue = check.check.changed.find((item) => item.code === code);
                return issue === undefined
                  ? []
                  : [
                      <li key={code}>
                        <span>{t(`autopilotChange_${code}` as TextKey)}</span> <strong>{roundsText(issue.rounds)}</strong>
                      </li>,
                    ];
              })}
            </ul>
          </section>
        )}

        <p className="autopilot-honest" role="note">
          {t('autopilotHonest')}
        </p>

        <label className="field">
          <span>{t('autopilotNickname')}</span>
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={20} autoComplete="nickname" aria-describedby="autopilot-nickname-hint" />
        </label>
        <p className="meta" id="autopilot-nickname-hint">
          {t('nicknameHint')}
        </p>

        {shownError !== null && (
          <p className="error" role="alert">
            {shownError}
          </p>
        )}

        <div className="autopilot-actions">
          <button type="submit" className="btn btn-primary" disabled={!canCreate}>
            {t('autopilotCreate')}
          </button>
          <button ref={cancelRef} type="button" className="btn" onClick={onClose}>
            {t('cancel')}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
