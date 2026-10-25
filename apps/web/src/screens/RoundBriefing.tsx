import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { RoundBrief, RoundInfo } from '@quiz/shared';
import { roundFacts } from '../format';
import { t } from '../i18n';
import { roundHow } from '../guide-text';
import { roundSummary } from '../round-summary';

/** Опис, довший за це, на сцені ширший і з тіснішим інтервалом (11a). */
export const LONG_NOTE = 250;
/** Межі обрізання опису на сцені, рядків. */
export const STAGE_NOTE_LINES = { max: 12, min: 2 } as const;

/**
 * Скільки рядків опису лишити: null — обмеження не треба (без нього не переповнено);
 * інакше найбільше з max…min, за якого не переповнено, або min.
 * overflows(lines) застосовує обмеження й каже, чи сцена прокручується.
 */
export function fitLines(overflows: (lines: number | null) => boolean, max: number = STAGE_NOTE_LINES.max, min: number = STAGE_NOTE_LINES.min): number | null {
  if (!overflows(null)) return null;
  for (let lines = max; lines > min; lines -= 1) {
    if (!overflows(lines)) return lines;
  }
  return min;
}

/** Сцена прокручується: сторінка вища за вікно або замкнений `.app` вищий за себе. */
function scrolls(note: HTMLElement): boolean {
  if (document.documentElement.scrollHeight > window.innerHeight + 1) return true;
  const app = note.closest('.app');
  return app !== null && app.scrollHeight > app.clientHeight + 1;
}

/** Підбирає `--note-lines` опису на сцені: пише прямо в елемент, без React-стану. */
function useStageFit(ref: RefObject<HTMLElement | null>, enabled: boolean, deps: readonly unknown[]) {
  useLayoutEffect(() => {
    const note = ref.current;
    if (!enabled || note === null) return;
    const apply = (lines: number | null) => {
      const value = lines === null ? 'none' : String(lines);
      note.style.setProperty('--note-lines', value);
      note.dataset.lines = value;
    };
    const overflows = (lines: number | null) => {
      apply(lines);
      return scrolls(note);
    };
    const refit = () => apply(fitLines(overflows));
    refit();
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(refit);
    };
    window.addEventListener('resize', later);
    const app = note.closest('.app');
    const observer = typeof ResizeObserver === 'undefined' || app === null ? null : new ResizeObserver(later);
    if (app !== null) observer?.observe(app);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', later);
      cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
}

/** Опис автора (якщо є) і пояснення правил раунду; для заставки й попереднього перегляду в редакторі. `fit` — сцена: опис обрізається, щоб вона не прокручувалась. */
export function RoundBriefing({ brief, description, newcomers = false, fit = false }: { brief: RoundBrief; description: string; newcomers?: boolean; fit?: boolean }) {
  const noteRef = useRef<HTMLParagraphElement>(null);
  const hasNote = description.trim() !== '';
  useStageFit(noteRef, fit && hasNote, [description, newcomers]);
  return (
    <div className={description.trim().length > LONG_NOTE ? 'round-brief is-long' : 'round-brief'}>
      {hasNote && (
        <p className={fit ? 'round-brief-note is-fit' : 'round-brief-note'} ref={noteRef}>
          {description}
        </p>
      )}
      {newcomers && (
        <div className="round-brief-how">
          <h2>{t('roundHowTitle')}</h2>
          <p>{roundHow(brief)[0]}</p>
        </div>
      )}
      <ul className="round-brief-lines" aria-label={t('roundBriefTitle')}>
        {roundSummary(brief).map((line, index) => (
          <li key={`${index}-${line}`}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

/** Скільки запитань у раунді й скільки часу на кожне; у фіналі нічого. */
export function RoundFacts({ round, total }: { round: RoundInfo; total: number }) {
  const facts = roundFacts(round, total);
  return facts === null ? null : <p className="round-facts">{facts}</p>;
}
