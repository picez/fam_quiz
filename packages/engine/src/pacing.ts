import { PACE_MS, type HostPace, type PaceWindow } from '@quiz/shared';
// game.ts цей файл не імпортує: його беруть лише views.ts, index.ts і сервер (без циклу під час завантаження модулів).
import { bluffOrder, bluffPlayOf } from './bluff';
import type { GameState } from './game';
import { decisionPending } from './ladder';
import { surveyPlayOf } from './survey';
import { trialOpen } from './survival';
import { decisionOpen, decisionsShown } from './wipeout';

/** Кроки ведучого з мінімальним часом (11b). */
export type PacedAction = 'next' | 'lock' | 'skip';

/**
 * Який зараз крок гри: зміна рядка — новий крок (план 11b, «Де живе мить кроку»).
 * Пауза, годинники (endsAt, remainingMs) і заставка до ключа не входять: пауза й продовження мітки не переставляють.
 */
export function stepKey(state: GameState): string {
  const play = state.plays[state.questionIndex];
  // Оголошена (ще не розпочата) дуель кроку не змінює: оголошення чи скасування поза етапом duel очікування не перезапускають.
  const duel = state.phase === 'duel' ? state.duel : null;
  return [
    state.phase,
    state.roundIndex,
    state.questionIndex,
    state.guidePage,
    play?.survey?.shown,
    play?.bluff?.stage,
    play?.bluff?.shown,
    play?.survival?.trial?.stage,
    play?.ladder?.decision,
    play?.ladder?.outcome === null,
    state.final?.shown,
    state.final?.split,
    duel?.stage,
    duel?.questions.length,
    state.board?.circleNo,
    state.board?.done,
    state.ladder?.contestantId,
    decisionOpen(state),
  ]
    .map((part) => (part === undefined ? '' : String(part)))
    .join('|');
}

/** next після зміни кроку отримує stepAt = now; без зміни — той самий об'єкт next; next === prev → prev. */
export function stamp(prev: GameState, next: GameState, now: number): GameState {
  if (next === prev) return prev;
  if (stepKey(next) === stepKey(prev)) return next;
  return { ...next, stepAt: now };
}

const span = (from: number, ms: number): PaceWindow => ({ from, until: from + ms });

/** Розкриття «100 до 1» чи блефу, де вже відкрито хоч один рядок (варіант), але не всі: наступний — через PACE_MS.row. */
function midRows(state: GameState): boolean {
  const survey = surveyPlayOf(state);
  if (survey !== null) return survey.survey.shown > 0 && survey.survey.shown < survey.question.rows.length;
  const bluff = bluffPlayOf(state);
  return bluff !== null && bluff.bluff.shown > 0 && bluff.bluff.shown < bluffOrder(bluff).length;
}

/** Вікно для дії; null — дія не затримується (або немає stepAt). */
export function paceWindow(state: GameState, action: PacedAction): PaceWindow | null {
  const at = state.stepAt;
  if (at === undefined) return null;
  // Дострокове закриття: від реального старту (після заставки; resume зсуває startedAt на паузу).
  if (action === 'lock') return state.phase === 'question' && state.startedAt !== null ? span(state.startedAt, PACE_MS.lock) : null;
  if (action === 'skip') return state.phase === 'board' ? span(at, PACE_MS.step) : null;
  switch (state.phase) {
    case 'guide':
    case 'round_end':
      return span(at, PACE_MS.step);
    case 'reveal':
      return span(at, midRows(state) ? PACE_MS.row : PACE_MS.step);
    case 'leaderboard':
      if (trialOpen(state)) return span(state.startedAt ?? at, PACE_MS.lock);
      // Рушій сам відповість deciding.
      if (decisionOpen(state) || decisionPending(state)) return null;
      // Екран рішень «Ва-банк» (11e): усі мають прочитати, хто що вибрав.
      if (decisionsShown(state)) return span(at, PACE_MS.decisions);
      return span(at, PACE_MS.step);
    case 'intro': {
      const splash = state.splash;
      const splashEnd = splash !== null && (splash.kind === 'round' || splash.kind === 'final') ? splash.until : at;
      return span(Math.max(at, splashEnd), PACE_MS.intro);
    }
    case 'duel':
      return state.duel?.stage === 'result' ? span(at, PACE_MS.step) : null;
    default:
      return null;
  }
}

/** Чи дія ще зарано на мить now. */
export function tooSoon(state: GameState, action: PacedAction, now: number): boolean {
  const window = paceWindow(state, action);
  return window !== null && now < window.until;
}

/** Три вікна для зрізу пульта. */
export function hostPace(state: GameState): HostPace {
  return { next: paceWindow(state, 'next'), lock: paceWindow(state, 'lock'), skip: paceWindow(state, 'skip') };
}
