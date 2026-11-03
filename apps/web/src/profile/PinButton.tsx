import type { JSX } from 'react';
import { t } from '../i18n';

/** «📌 На вітрину» / «📌 Прибрати з вітрини» для предмета name; вимкнена, поки триває запит. */
export function PinButton({ pinned, busy, name, onClick }: { pinned: boolean; busy: boolean; name: string; onClick: () => void }): JSX.Element {
  const text = `📌 ${t(pinned ? 'pinRemove' : 'pinAdd')}`;
  return (
    <button type="button" className="btn btn-small pin-button" aria-pressed={pinned} aria-label={`${text}: ${name}`} disabled={busy} onClick={onClick}>
      {text}
    </button>
  );
}
