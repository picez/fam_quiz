import { useEffect, useState } from 'react';
import type { LeaguePickInfo } from '@quiz/shared';
import { gameLeague, pickLeague } from '../api';
import { HelpButton } from '../help/HelpButton';
import { errorText, t } from '../i18n';

/** Панель «Сімейна ліга» в лобі пульта й автора: для якої з груп ведучого ця гра дає бали ліги. */
export function LeaguePick({ code }: { code: string }) {
  const [info, setInfo] = useState<LeaguePickInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    void gameLeague(code).then((result) => {
      if (!alive) return;
      if (result.ok) setInfo(result.data);
      else if (result.error !== 'unauthorized' && result.error !== 'not_found') setError(errorText(result.error));
    });
    return () => {
      alive = false;
    };
  }, [code]);

  if (info === null) {
    if (error === null) return null;
    return <p className="error" role="alert">{error}</p>;
  }

  if (info.groups.length === 0)
    return (
      <section className="panel league-pick">
        <h2>
          {t('leaguePickTitle')}
          <HelpButton id="setting.league" />
        </h2>
        <p className="meta">{t('leaguePickNoGroups')}</p>
      </section>
    );

  const pick = async (groupId: string | null) => {
    setBusy(true);
    setError(null);
    setSaved(false);
    const result = await pickLeague(code, groupId);
    setBusy(false);
    if (result.ok) {
      setInfo(result.data);
      setSaved(true);
    } else setError(errorText(result.error));
  };

  return (
    <section className="panel league-pick">
      <h2>
          {t('leaguePickTitle')}
          <HelpButton id="setting.league" />
        </h2>
      <label className="league-pick-field">
        <span className="meta">{t('leaguePickLabel')}</span>
        <select value={info.groupId ?? ''} disabled={busy} onChange={(event) => void pick(event.target.value === '' ? null : event.target.value)}>
          <option value="">{t('leaguePickNone')}</option>
          {info.groups.map((group) => (
            <option key={group.id} value={group.id}>
              {`${group.emoji} ${group.name}`}
            </option>
          ))}
        </select>
      </label>
      <p className="meta">{t('leaguePickHint')}</p>
      {saved && <p className="meta" role="status">{t('leaguePickSaved')}</p>}
      {error !== null && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
