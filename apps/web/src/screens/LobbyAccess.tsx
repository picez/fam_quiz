import { useCallback, useEffect, useRef, useState } from 'react';
import { LOBBY_PASSWORD_MAX, LOBBY_PASSWORD_MIN, LOBBY_VISIBILITIES } from '@quiz/shared';
import type { LobbySettings, LobbyVisibility } from '@quiz/shared';
import { getLobbySettings, saveLobbySettings } from '../api';
import { errorText, t } from '../i18n';
import type { TextKey } from '../i18n';

const VISIBILITY_LABEL: Record<LobbyVisibility, TextKey> = { all: 'lobbyVisAll', friends: 'lobbyVisFriends', hidden: 'lobbyVisHidden' };

/** Панель ведучого в лобі: хто бачить гру в списку і необов'язковий пароль (24c). Радіо зберігаються одразу, пароль — кнопкою. */
export function LobbyAccess({ code }: { code: string }) {
  const [settings, setSettings] = useState<LobbySettings | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [loadFailed, setLoadFailed] = useState(false);
  const saving = useRef(false);
  const [choice, setChoice] = useState<LobbyVisibility | null>(null);

  const load = useCallback(() => {
    let alive = true;
    setLoadFailed(false);
    setError(null);
    void getLobbySettings(code).then((result) => {
      if (!alive) return;
      if (result.ok) {
        confirmed.current = { visibility: result.visibility, password: result.password };
        setSettings(confirmed.current);
        setDraft(result.password ?? '');
      } else {
        setError(errorText(result.error));
        setLoadFailed(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [code]);

  useEffect(() => load(), [load]);

  /** Остання відповідь сервера: основа для наступного збереження (стан у змінній, бо цикл живе довше за рендер). */
  const confirmed = useRef<LobbySettings | null>(null);
  const queued = useRef<Partial<LobbySettings> | null>(null);
  const draftNow = useRef('');
  draftNow.current = draft;

  /** Зміни під час збереження не губляться: найновіший вибір ставиться в чергу і йде одразу після поточного. */
  const save = async (patch: Partial<LobbySettings>) => {
    queued.current = { ...queued.current, ...patch };
    if (patch.visibility !== undefined) setChoice(patch.visibility);
    if (saving.current || confirmed.current === null) return;
    saving.current = true;
    setBusy(true);
    setSaved(false);
    setError(null);
    let failure: string | null = null;
    while (queued.current !== null && confirmed.current !== null) {
      const sent = queued.current;
      queued.current = null;
      const draftAtSend = draftNow.current;
      const result = await saveLobbySettings(code, { ...confirmed.current, ...sent });
      if (result.ok) {
        failure = null;
        confirmed.current = { visibility: result.visibility, password: result.password };
        setSettings(confirmed.current);
        // Чернетку скидаємо лише коли це вона щойно збережена і поле не змінили за час запиту.
        if (sent.password !== undefined && draftNow.current === draftAtSend) setDraft(result.password ?? '');
      } else failure = result.error.startsWith('invalid_payload') ? t('err_lobby_password') : errorText(result.error);
    }
    saving.current = false;
    setBusy(false);
    setChoice(null);
    if (failure === null) setSaved(true);
    else setError(failure);
  };

  const trimmed = draft.trim();
  const length = [...trimmed].length;
  const valid = length >= LOBBY_PASSWORD_MIN && length <= LOBBY_PASSWORD_MAX;
  const dirty = settings !== null && trimmed !== (settings.password ?? '');

  return (
    <section className="panel lobby-access">
      <fieldset className="lobby-vis" disabled={settings === null}>
        <legend>{t('lobbyWhoSees')}</legend>
        {LOBBY_VISIBILITIES.map((value) => (
          <label key={value} className="lobby-vis-option">
            <input
              type="radio"
              name={`lobby-vis-${code}`}
              value={value}
              checked={(choice ?? settings?.visibility) === value}
              onChange={() => settings !== null && void save({ visibility: value })}
            />
            <span>{t(VISIBILITY_LABEL[value])}</span>
          </label>
        ))}
      </fieldset>
      <div className="field lobby-password">
        <label htmlFor={`lobby-pw-${code}`}>{t('lobbyPasswordLabel')}</label>
        <input
          id={`lobby-pw-${code}`}
          type="text"
          autoComplete="off"
          spellCheck={false}
          dir="auto"
          value={draft}
          disabled={settings === null}
          aria-describedby={`lobby-pw-hint-${code}`}
          aria-invalid={draft !== '' && !valid}
          onChange={(event) => {
            setDraft(event.target.value);
            setSaved(false);
          }}
        />
        <p className={`meta${draft !== '' && !valid ? ' lobby-pw-bad' : ''}`} id={`lobby-pw-hint-${code}`}>
          {t('lobbyPasswordHint')}
        </p>
      </div>
      <div className="lobby-access-actions">
        <button type="button" className="btn btn-small" disabled={busy || settings === null || !dirty || !valid} onClick={() => settings !== null && void save({ password: trimmed })}>
          {t('lobbyPasswordSave')}
        </button>
        {settings?.password != null && (
          <button type="button" className="btn btn-small" disabled={busy} onClick={() => void save({ password: null })}>
            {t('lobbyPasswordRemove')}
          </button>
        )}
      </div>
      {saved && (
        <p className="meta lobby-saved" role="status">
          {t('lobbySaved')}
        </p>
      )}
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loadFailed && (
        <div className="lobby-access-actions">
          <button type="button" className="btn btn-small" onClick={load}>
            {t('prizesRetry')}
          </button>
        </div>
      )}
    </section>
  );
}
