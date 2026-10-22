import type { Versus } from '@quiz/shared';
import { useEffect, useState } from 'react';
import { getVersus } from '../api';
import { formatDate } from '../format';
import { countText, t } from '../i18n';

/** «Ви і <нікнейм>»: спільні ігри того, хто дивиться, і цього гравця. Секція з’являється, лише коли дані прийшли; помилка просто ховає її. */
export function VersusBlock({ id, nickname }: { id: string; nickname: string }) {
  const [versus, setVersus] = useState<Versus | null>(null);

  useEffect(() => {
    let current = true;
    setVersus(null);
    void getVersus(id).then((result) => {
      if (current && result.ok) setVersus(result.data);
    });
    return () => {
      current = false;
    };
  }, [id]);

  if (versus === null) return null;
  const place = (rank: number | null) => (rank === null ? t('versusNoPlace') : t('place', { rank }));
  const percent = (value: number | null) => (value === null ? '–' : `${value}%`);
  const rows: [value: string, label: string][] = [
    [String(versus.together), countText('versusTogether', versus.together)],
    [String(versus.myAhead), countText('versusYouHigher', versus.myAhead)],
    [String(versus.theirAhead), countText('versusTheyHigher', versus.theirAhead, { name: nickname })],
    [percent(versus.myAccuracy), t('versusYourAccuracy')],
    [percent(versus.theirAccuracy), t('versusTheirAccuracy', { name: nickname })],
  ];
  return (
    <section className="profile-section">
      <h2>{t('versusTitle', { name: nickname })}</h2>
      {versus.together === 0 ? (
        <p className="meta">{t('versusNone')}</p>
      ) : (
        <>
          <dl className="stats">
            {rows.map(([value, label]) => (
              <div className="stat" key={label}>
                <dd>{value}</dd>
                <dt>{label}</dt>
              </div>
            ))}
          </dl>
          <h3 className="versus-recent">{t('versusRecent')}</h3>
          <ul className="profile-list versus-games">
            {versus.recent.map((game) => (
              <li key={game.gameId}>
                {t('versusGame', {
                  date: formatDate(game.startedAt),
                  title: game.title,
                  mine: place(game.myRank),
                  name: nickname,
                  theirs: place(game.theirRank),
                })}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
