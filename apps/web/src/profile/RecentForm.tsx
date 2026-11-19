import { useState, type JSX } from 'react';
import type { FormGame, PublicFormGame, PublicRecentForm, RecentForm as Form } from '@quiz/shared';
import { countText, t } from '../i18n';
import { shortDate } from './LevelCard';

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' } as const;

/** Підпис гри: з назвою (своя форма), з командою для командної, лише з датою (публічна форма — без назв). */
function gameText(game: FormGame | PublicFormGame): string {
  const date = shortDate(game.startedAt);
  if (!('title' in game)) return date;
  return game.team === null ? t('formGame', { title: game.title, date }) : t('formTeamGame', { title: game.title, team: game.team, date });
}

/**
 * Остання форма (49): до 10 останніх ігор з місцем чипами — медаль 🥇🥈🥉 чи число, найновіша першою. Чип — кнопка (≥ 32 px):
 * title і підпис aria-live після дотику кажуть гру й дату. Серія («3 перемоги поспіль») — під чипами. Без ігор чи без форми — нічого.
 */
export function RecentForm({ form }: { form: Form | PublicRecentForm | undefined }): JSX.Element | null {
  const [selected, setSelected] = useState<number | null>(null);
  if (form === undefined || form.games.length === 0) return null;
  const streak = form.streak;
  const caption = selected === null || form.games[selected] === undefined ? '' : gameText(form.games[selected]);
  return (
    <section className="recent-form" aria-labelledby="recent-form-title">
      <h2 id="recent-form-title">{t('formTitle')}</h2>
      <ol className="recent-form-chips">
        {form.games.map((game, index) => {
          const text = gameText(game);
          return (
            <li key={index}>
              <button
                type="button"
                className={selected === index ? 'recent-form-chip is-selected' : 'recent-form-chip'}
                title={text}
                aria-label={t('formPlaceAria', { place: game.place, game: text })}
                onClick={() => setSelected(index)}
                onFocus={() => setSelected(index)}
              >
                <span aria-hidden="true">{game.medal === null ? game.place : MEDALS[game.medal]}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="recent-form-caption" aria-live="polite">
        {caption}
      </p>
      {streak !== null && <p className="recent-form-streak">{countText(streak.kind === 'wins' ? 'formWins' : 'formTop3', streak.count, { count: streak.count })}</p>}
    </section>
  );
}
