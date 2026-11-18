import { useEffect, useId, useState } from 'react';
import type { LeagueTable as LeagueTableData } from '@quiz/shared';
import { groupLeague } from '../api';
import { monthText, num } from '../format';
import { errorText, t } from '../i18n';
import { nickText } from '../nick';

/**
 * Вкладка «Ліга» (45): таблиця місяця за Києвом (місце, учасник, бали, ігор, перших місць), перемикач на минулі місяці
 * й «Зала переможців». `me` — акаунт, чий рядок виділяємо.
 */
export function LeagueTable({ groupId, me }: { groupId: string; me?: string }) {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [data, setData] = useState<LeagueTableData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectId = useId();

  useEffect(() => {
    let current = true;
    setError(null);
    void groupLeague(groupId, month).then((result) => {
      if (!current) return;
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else setError(errorText(result.error));
    });
    return () => {
      current = false;
    };
  }, [groupId, month]);

  // Перший запит не вдався — лише помилка; пізніші збої показуємо під вибором місяця, щоб можна було обрати інший.
  if (data === null && error !== null) {
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  }
  if (data === null) return <p className="meta">{t('loading')}</p>;

  return (
    <section className="group-league">
      {data.months.length > 1 && (
        <div className="league-month">
          <label htmlFor={selectId}>{t('leagueMonthLabel')}</label>
          <select id={selectId} value={data.month} onChange={(event) => setMonth(event.target.value)}>
            {data.months.map((value, index) => (
              <option key={value} value={value}>
                {index === 0 ? t('leagueCurrentMonth', { month: monthText(value) }) : monthText(value)}
              </option>
            ))}
          </select>
        </div>
      )}
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {data.rows.length === 0 ? (
        <p className="meta">{t('leagueEmpty')}</p>
      ) : (
        <table className="league-table">
          <caption className="sr-only">{monthText(data.month)}</caption>
          <thead>
            <tr>
              <th scope="col">{t('leaguePlace')}</th>
              <th scope="col">{t('leaguePlayer')}</th>
              <th scope="col">{t('leaguePoints')}</th>
              <th scope="col">{t('leagueGames')}</th>
              <th scope="col">{t('leagueFirsts')}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.user.id} className={row.user.id === me ? 'is-me' : undefined}>
                <td>{num(row.place)}</td>
                <th scope="row" className="league-player" dir="auto">
                  <span>
                    {nickText(row.user.nickname)}
                    {row.former && <span className="meta"> · {t('leagueFormer')}</span>}
                  </span>
                </th>
                <td>{num(row.points)}</td>
                <td>{num(row.games)}</td>
                <td>{num(row.firsts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="meta league-rules">{t('leagueRules')}</p>
      <h3>{t('leagueHall')}</h3>
      {data.champions.length === 0 ? (
        <p className="meta">{t('leagueHallEmpty')}</p>
      ) : (
        <ul className="league-hall">
          {data.champions.map((entry) => (
            <li key={entry.month} dir="auto">
              {`${monthText(entry.month)} — ${entry.users.map((user) => nickText(user.nickname)).join(', ')}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
