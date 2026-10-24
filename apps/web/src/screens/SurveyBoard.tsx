import { useEffect, useRef, useState } from 'react';
import type { SurveyInfo } from '@quiz/shared';
import { t } from '../i18n';

const FLIP_MS = 700;

/**
 * Табло «100 до 1»: рядок на місце — номер, текст, популярність, нікнейми під текстом; закритий рядок — смуга з номером.
 * Нещодавно відкритий рядок перегортається (клас .is-flipping, без анімації за prefers-reduced-motion).
 * big — сцена; showClosed — пульт показує тексти закритих рядків блідими з позначкою «ще закрито».
 */
export function SurveyBoard({ info, big = false, showClosed = false }: { info: SurveyInfo; big?: boolean; showClosed?: boolean }) {
  // Перегортається лише рядок, що відкрився на очах: перший показ усе відкрите не анімує.
  const seen = useRef<Set<number> | null>(null);
  const [flipping, setFlipping] = useState<number[]>([]);
  useEffect(() => {
    const open = new Set(info.rows.filter((row) => row.open).map((row) => row.rank));
    const before = seen.current;
    seen.current = open;
    if (before === null) return;
    const fresh = [...open].filter((rank) => !before.has(rank));
    if (fresh.length === 0) return;
    setFlipping(fresh);
    const timer = setTimeout(() => setFlipping([]), FLIP_MS);
    return () => clearTimeout(timer);
  }, [info]);

  return (
    <ol className={big ? 'survey-board is-big' : 'survey-board'}>
      {info.rows.map((row) => {
        if (!row.open && !(showClosed && row.text !== null)) {
          return (
            <li key={row.rank} className="survey-row is-closed" aria-label={t('surveyClosedRow', { rank: row.rank })}>
              <span className="survey-rank">{row.rank}</span>
            </li>
          );
        }
        const classes = ['survey-row', row.open ? '' : 'is-pale', flipping.includes(row.rank) ? 'is-flipping' : ''].filter((c) => c !== '');
        return (
          <li key={row.rank} className={classes.join(' ')}>
            <span className="survey-rank">{row.rank}</span>
            <span className="survey-text">
              {row.text}
              {!row.open && <span className="meta survey-still"> {t('surveyStillClosed')}</span>}
              {row.by !== null &&
                (row.by.length > 0 ? <span className="survey-by">{row.by.join(', ')}</span> : row.open && <span className="meta survey-by">{t('surveyNobody')}</span>)}
            </span>
            <span className="survey-pop">{row.popularity}</span>
          </li>
        );
      })}
    </ol>
  );
}
