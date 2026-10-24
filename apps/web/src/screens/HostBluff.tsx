import { useRef, useState } from 'react';
import type { BluffInfo } from '@quiz/shared';
import { t } from '../i18n';
import { BluffBoard } from './BluffBoard';

type Act = (event: 'host:bluff-remove' | 'host:bluff-all', payload?: { optionId: string }) => void | Promise<void>;

/**
 * Пульт блефу: вигадки наживо (фаза вигадок), «Прибрати» біля вигадок гравців (фаза вибору), «Відкрити всі» (розкриття).
 * Дії йдуть по одній: подвійний дотик не надсилає подію двічі.
 */
export function HostBluff({ info, act }: { info: BluffInfo; act: Act }) {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = (event: 'host:bluff-remove' | 'host:bluff-all', payload?: { optionId: string }) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const release = () => {
      busyRef.current = false;
      setBusy(false);
    };
    // Якщо підтвердження загубилося, кнопки не мають лишитися заблокованими назавжди.
    const fallback = setTimeout(release, 3000);
    void Promise.resolve(act(event, payload)).finally(() => {
      clearTimeout(fallback);
      release();
    });
  };

  if (info.stage === 'lies') {
    const lies = info.lies ?? [];
    return (
      <div className="bluff-host">
        <p className="meta">{t('bluffHostWritten', { n: lies.length })}</p>
        <ul className="bluff-live">
          {lies.map((lie, at) => (
            <li key={at}>{`${lie.nickname}: ${lie.text}`}</li>
          ))}
        </ul>
      </div>
    );
  }
  const removable = info.stage === 'choice' ? info.options.filter((option) => option.kind === 'lie' && !option.removed) : [];
  return (
    <div className="bluff-host">
      <BluffBoard info={info} host />
      {removable.length > 0 && (
        <ul className="bluff-live">
          {removable.map((option) => (
            <li key={option.id}>
              <span>{option.text}</span>
              <button
                type="button"
                className="btn btn-small"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(t('bluffRemoveConfirm', { text: option.text }))) run('host:bluff-remove', { optionId: option.id });
                }}
              >
                {t('bluffRemove')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {info.stage === 'reveal' && info.shown < info.total && (
        <button type="button" className="btn" disabled={busy} onClick={() => run('host:bluff-all')}>
          {t('bluffAllRows')}
        </button>
      )}
    </div>
  );
}
