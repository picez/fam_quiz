import type { BluffInfo } from '@quiz/shared';
import { t } from '../i18n';
import { BluffBoard } from './BluffBoard';

type Act = (event: 'host:bluff-remove' | 'host:bluff-all', payload?: { optionId: string }) => void;

/**
 * Пульт блефу: вигадки наживо (фаза вигадок), «Прибрати» біля вигадок гравців (фаза вибору), «Відкрити всі» (розкриття).
 * Крок гри веде HostScreen: busy — його спільний замок, тож «Прибрати», «Відкрити всі» і головна кнопка не йдуть одночасно.
 * «Прибрати» лише поки триває вибір (canRemove: фаза question; після закриття рушій відмовляє). На паузі «Відкрити всі» не показується (рушій відмовив би).
 */
export function HostBluff({ info, act, busy = false, paused = false, canRemove = true }: { info: BluffInfo; act: Act; busy?: boolean; paused?: boolean; canRemove?: boolean }) {
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
  const removable = info.stage === 'choice' && canRemove ? info.options.filter((option) => option.kind === 'lie' && !option.removed) : [];
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
                aria-label={t('bluffRemoveLabel', { text: option.text })}
                disabled={busy}
                onClick={() => {
                  if (window.confirm(t('bluffRemoveConfirm', { text: option.text }))) act('host:bluff-remove', { optionId: option.id });
                }}
              >
                {t('bluffRemove')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {info.stage === 'reveal' && info.shown < info.total && !paused && (
        <button type="button" className="btn" disabled={busy} onClick={() => act('host:bluff-all')}>
          {t('bluffAllRows')}
        </button>
      )}
    </div>
  );
}
