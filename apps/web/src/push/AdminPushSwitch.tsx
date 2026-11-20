import { useId, useState, type JSX } from 'react';
import { setAdminPush } from '../api';
import { t } from '../i18n';
import { useAccount } from '../useAccount';

/**
 * «Оголошення від адміністраторів» (59): налаштування акаунта, не пристрою — тому видно й тоді, коли сповіщення тут вимкнені.
 * Зміна — одразу, збій збереження повертає попереднє значення з поясненням. Інші сповіщення (календар, бот) не зачіпає.
 */
export function AdminPushSwitch({ className }: { className?: string }): JSX.Element | null {
  const account = useAccount();
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const boxId = useId();
  const hintId = useId();
  if (account.status !== 'signed-in') return null;
  const on = chosen ?? account.account.adminPush;

  const toggle = (next: boolean) => {
    const before = on;
    setChosen(next);
    setFailed(false);
    setBusy(true);
    void setAdminPush(next).then((result) => {
      setBusy(false);
      if (result.ok) setChosen(result.data.adminPush);
      else {
        setChosen(before);
        setFailed(true);
      }
    });
  };

  return (
    <section className={['settings-row', className].filter(Boolean).join(' ')} aria-labelledby={`${boxId}-heading`}>
      <h2 id={`${boxId}-heading`}>{t('adminPushLabel')}</h2>
      <label className="field field-check" htmlFor={boxId}>
        <input id={boxId} type="checkbox" checked={on} disabled={busy} aria-describedby={hintId} onChange={(event) => toggle(event.target.checked)} />
        <span>{t('adminPushToggle')}</span>
      </label>
      <p className="meta" id={hintId}>
        {t('adminPushHint')}
      </p>
      <p className="error admin-push-error" role="alert">
        {failed ? t('adminPushSaveFailed') : ''}
      </p>
    </section>
  );
}
