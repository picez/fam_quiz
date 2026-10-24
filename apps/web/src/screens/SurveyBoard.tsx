import { useEffect, useRef, useState } from 'react';
import type { SurveyInfo } from '@quiz/shared';
import { t } from '../i18n';

const FLIP_MS = 700;
/** Бюджет символів для нікнеймів в одному рядку на сцені: решта — «+N». */
const NAMES_BUDGET = 48;

/** Нікнейми, що вміщаються в один рядок, і скільки лишилось. */
export function fitNames(by: string[], budget: number): { shown: string[]; more: number } {
  const shown: string[] = [];
  let used = 0;
  for (const name of by) {
    const next = used + name.length + (shown.length > 0 ? 2 : 0);
    if (shown.length > 0 && next > budget) break;
    shown.push(name);
    used = next;
  }
  return { shown, more: by.length - shown.length };
}

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

  const latest = info.rows.filter((row) => row.open && row.text !== null).reduce<(typeof info.rows)[number] | null>((acc, row) => (acc === null || row.rank < acc.rank ? row : acc), null);
  const dense = big && info.rows.length >= 7;
  const classes = ['survey-board', big ? 'is-big' : '', dense ? 'is-dense' : ''].filter((c) => c !== '');
  return (
    <>
    {big && (
      <p className="sr-only" aria-live="polite">
        {latest === null ? '' : t('surveyRowOpened', { rank: latest.rank, text: latest.text ?? '', popularity: latest.popularity ?? 0 })}
      </p>
    )}
    <ol className={classes.join(' ')}>
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
                (row.by.length > 0 ? (
                  <span className="survey-by">
                    {(() => {
                      if (!big) return row.by.join(', ');
                      const { shown, more } = fitNames(row.by, NAMES_BUDGET);
                      return more > 0 ? `${shown.join(', ')} ${t('surveyMoreNames', { n: more })}` : shown.join(', ');
                    })()}
                  </span>
                ) : (
                  row.open && <span className="meta survey-by">{t('surveyNobody')}</span>
                ))}
            </span>
            <span className="survey-pop">
              {row.popularity}
              {row.popularity !== null && <span className="sr-only"> {t('surveyOutOf')}</span>}
            </span>
          </li>
        );
      })}
    </ol>
    </>
  );
}
