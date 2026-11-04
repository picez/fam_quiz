import { useEffect, useState } from 'react';
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

  useEffect(() => {
    let alive = true;
    void getLobbySettings(code).then((result) => {
      if (!alive) return;
      if (result.ok) {
        setSettings({ visibility: result.visibility, password: result.password });
        setDraft(result.password ?? '');
      } else setError(errorText(result.error));
    });
    return () => {
      alive = false;
    };
  }, [code]);

  const save = async (next: LobbySettings) => {
    setBusy(true);
    setSaved(false);
    setError(null);
    const result = await saveLobbySettings(code, next);
    setBusy(false);
    if (result.ok) {
      setSettings({ visibility: result.visibility, password: result.password });
      setDraft(result.password ?? '');
      setSaved(true);
    } else setError(result.error.startsWith('invalid_payload') ? t('err_lobby_password') : errorText(result.error));
  };

  const trimmed = draft.trim();
  const length = [...trimmed].length;
  const valid = length >= LOBBY_PASSWORD_MIN && length <= LOBBY_PASSWORD_MAX;
  const dirty = settings !== null && trimmed !== (settings.password ?? '');

  return (
    <section className="panel lobby-access">
      <fieldset className="lobby-vis" disabled={settings === null || busy}>
        <legend>{t('lobbyWhoSees')}</legend>
        {LOBBY_VISIBILITIES.map((value) => (
          <label key={value} className="lobby-vis-option">
            <input
              type="radio"
              name={`lobby-vis-${code}`}
              value={value}
              checked={settings?.visibility === value}
              onChange={() => settings !== null && void save({ visibility: value, password: settings.password })}
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
        <button type="button" className="btn btn-small" disabled={busy || settings === null || !dirty || !valid} onClick={() => settings !== null && void save({ visibility: settings.visibility, password: trimmed })}>
          {t('lobbyPasswordSave')}
        </button>
        {settings?.password != null && (
          <button type="button" className="btn btn-small" disabled={busy} onClick={() => void save({ visibility: settings.visibility, password: null })}>
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
    </section>
  );
}
