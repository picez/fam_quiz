import { useId, useState, useSyncExternalStore } from 'react';
import { setEasy } from './api';
import { easyModeOn, setEasyMode, subscribeEasyMode } from './easy-mode';
import { t } from './i18n';
import { useAccount } from './useAccount';

/**
 * Перемикач «Легкий режим» (31): гість тримає його на пристрої, акаунт ще й зберігає в профілі.
 * Збій профілю режиму не відкочує — на цьому пристрої він однаково діє.
 */
export function EasyModeSwitch({ className }: { className?: string }) {
  const account = useAccount();
  const signedIn = account.status === 'signed-in';
  const on = useSyncExternalStore(subscribeEasyMode, easyModeOn);
  const [failed, setFailed] = useState(false);
  const hintId = useId();

  const toggle = (next: boolean) => {
    setEasyMode(next);
    setFailed(false);
    if (!signedIn) return;
    void setEasy(next).then((result) => setFailed(!result.ok));
  };

  return (
    <div className={['easy-switch', className].filter(Boolean).join(' ')}>
      <label className="field field-check">
        <input type="checkbox" checked={on} onChange={(event) => toggle(event.target.checked)} aria-describedby={hintId} />
        <span>{t('easyModeLabel')}</span>
      </label>
      <p className="meta" id={hintId}>
        {t(signedIn ? 'easyModeHintAccount' : 'easyModeHint')}
      </p>
      {failed && (
        <p className="error" role="alert">
          {t('easyModeSaveFailed')}
        </p>
      )}
    </div>
  );
}
