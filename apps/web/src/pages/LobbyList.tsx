import { useEffect, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { LOBBY_POLL_MS, type LobbyRow } from '@quiz/shared';
import { listLobbies } from '../api';
import { quizSizeText } from '../format';
import { countText, t } from '../i18n';
import { agoText } from '../locales/grammar';
import { nickText } from '../nick';
import { Avatar } from '../profile/Avatar';
import { Nick } from '../screens/Nick';

/** Відкриті лобі під полем коду (24c): опитування раз на LOBBY_POLL_MS, лише поки вкладка видима. */
export function LobbyList(): JSX.Element {
  const [rows, setRows] = useState<LobbyRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let loading = false;
    const load = async () => {
      timer = undefined;
      if (loading) return;
      loading = true;
      const result = await listLobbies();
      loading = false;
      if (!alive) return;
      if (result.ok) {
        // Старий список лишається, поки йде запит; нова відповідь замінює його разом із часом для «тому».
        setRows(result.data);
        setNow(Date.now());
        setFailed(false);
      } else setFailed(true);
      schedule();
    };
    const schedule = () => {
      if (!alive || document.hidden || timer !== undefined) return;
      timer = setTimeout(() => void load(), LOBBY_POLL_MS);
    };
    const onVisible = () => {
      if (document.hidden) {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
      } else if (timer === undefined) void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    if (!document.hidden) void load();
    return () => {
      alive = false;
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <section className="lobby-list" aria-labelledby="lobby-list-title">
      <h2 id="lobby-list-title">{t('lobbyListTitle')}</h2>
      {failed && (
        <p className="error" role="status">
          {t('lobbyListError')}
        </p>
      )}
      {rows !== null && rows.length === 0 && <p className="meta">{t('lobbyListEmpty')}</p>}
      {rows !== null && rows.length > 0 && (
        <ul className="lobby-rows">
          {rows.map((row) => {
            const age = Math.max(0, now - Date.parse(row.openedAt));
            return (
            <li key={row.code}>
              <Link className="lobby-row" to={`/play/${row.code}`} aria-labelledby={`lobby-title-${row.code} lobby-host-${row.code}`}>
                <Avatar profile={row.host} size="small" />
                <span className="lobby-body">
                  <span className="lobby-head">
                    <span className="lobby-title" id={`lobby-title-${row.code}`} dir="auto">
                      {row.title}
                    </span>
                    {row.locked && (
                      <span className="lobby-flag" role="img" aria-label={t('lobbyLocked')}>
                        🔒
                      </span>
                    )}
                    {row.late && <span className="lobby-flag lobby-running">{t('lobbyRunning')}</span>}
                  </span>
                  <span className="meta lobby-host" id={`lobby-host-${row.code}`} dir="auto">
                    <Nick nickname={nickText(row.host.nickname)} levels={row.host.level === null ? undefined : { [nickText(row.host.nickname)]: row.host.level }} />
                  </span>
                  <span className="meta lobby-facts">
                    <span>{t('lobbyPlayers', { count: row.players, max: row.maxPlayers })}</span>
                    <span>{countText('lobbyRounds', row.rounds, { count: row.rounds })}</span>
                    <span>{quizSizeText(countText('lobbyQuestions', row.questions, { count: row.questions }), row.questions, row.truth)}</span>
                    <span>{age < 60_000 ? t('lobbyJustNow') : t('lobbyOpened', { ago: agoText(age) })}</span>
                  </span>
                  {row.friends.length > 0 && (
                    <span className="meta lobby-friends" dir="auto">
                      {t('lobbyFriendsHere', { names: row.friends.join(', ') })}
                    </span>
                  )}
                </span>
              </Link>
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
