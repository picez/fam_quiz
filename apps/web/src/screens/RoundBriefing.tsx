import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { RoundBrief, RoundInfo } from '@quiz/shared';
import { roundFacts } from '../format';
import { t } from '../i18n';
import { roundHow } from '../guide-text';
import { roundSummary } from '../round-summary';

/** Опис, довший за це, на сцені ширший і з тіснішим інтервалом (11a). */
export const LONG_NOTE = 250;
/** Межі обрізання опису на сцені, рядків. */
export const STAGE_NOTE_LINES = { max: 12, min: 4 } as const;
/** Скільки рядків довгого опису ще читається; менше — сцена лишає з правил лише перший рядок (телефони й пульт показують усі). */
export const READABLE_NOTE_LINES = 5;

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

/**
 * Два кроки: спершу з усіма правилами; якщо довгий опис тоді вміщається менше ніж у READABLE_NOTE_LINES рядків —
 * з самим першим рядком правил (short) і ще раз. overflows(lines, short) застосовує обидва й каже, чи сцена прокручується.
 */
export function fitBrief(overflows: (lines: number | null, short: boolean) => boolean, long: boolean): { lines: number | null; short: boolean } {
  const full = fitLines((lines) => overflows(lines, false));
  if (!long || full === null || full >= READABLE_NOTE_LINES) return { lines: full, short: false };
  return { lines: fitLines((lines) => overflows(lines, true)), short: true };
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
    const brief = note.parentElement;
    const apply = (lines: number | null, short: boolean) => {
      const value = lines === null ? 'none' : String(lines);
      note.style.setProperty('--note-lines', value);
      note.dataset.lines = value;
      if (brief === null) return;
      if (short) brief.dataset.rules = 'short';
      else delete brief.dataset.rules;
    };
    const overflows = (lines: number | null, short: boolean) => {
      apply(lines, short);
      return scrolls(note);
    };
    const refit = () => {
      const fit = fitBrief(overflows, brief?.classList.contains('is-long') ?? false);
      apply(fit.lines, fit.short);
    };
    refit();
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(refit);
    };
    window.addEventListener('resize', later);
    // .app ловить ріст вмісту; батько опису й сцена (.stage-board) — ще й коли вміст поруч меншає, бо .app не нижчий за вікно і тоді не змінюється.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(later);
    for (const target of new Set([note.closest('.app'), note.parentElement, note.closest('.stage-board')])) if (target !== null) observer?.observe(target);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', later);
      cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
}

/** Опис автора (якщо є) і пояснення правил раунду; для заставки й попереднього перегляду в редакторі. `fit` — сцена: опис обрізається, щоб вона не прокручувалась, а довгому опису, якому лишилось менше п’яти рядків, поступаються правила (лише перший рядок). */
export function RoundBriefing({ brief, description, newcomers = false, fit = false, autopilot = false }: { brief: RoundBrief; description: string; newcomers?: boolean; fit?: boolean; autopilot?: boolean }) {
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
          <p>{roundHow(brief, autopilot)[0]}</p>
        </div>
      )}
      <ul className="round-brief-lines" aria-label={t('roundBriefTitle')}>
        {roundSummary(brief, autopilot).map((line, index) => (
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
