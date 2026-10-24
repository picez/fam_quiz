import { CELL_SURPRISE_MS, SPLASH_MS, type SplashKind } from '@quiz/shared';
// game.ts викликає цей файл; звідси — лише типи game.ts.
import type { BoardPlay, GameState } from './game';

// Тривалості живуть у shared: веб бере звідти ж перегортання клітинки й штамп сюрпризу.
export { CELL_SURPRISE_MS, SPLASH_MS };

/** Поточна заставка: вид і час сервера початку й кінця. */
export interface Splash {
  kind: SplashKind;
  at: number;
  until: number;
}

/** Ставить заставку kind з миті now тривалістю ms (типово SPLASH_MS[kind]); без state.transitions — splash: null. */
export function withSplash(state: GameState, kind: SplashKind, now: number, ms: number = SPLASH_MS[kind]): GameState {
  return state.transitions ? { ...state, splash: { kind, at: now, until: now + ms } } : { ...state, splash: null };
}

/** Тривалість заставки перед запитанням: клітинка з множником — SPLASH_MS.cell + CELL_SURPRISE_MS. */
export function questionSplashMs(kind: SplashKind, board?: BoardPlay): number {
  return kind === 'cell' && board !== undefined && board.multiplier > 1 ? SPLASH_MS.cell + CELL_SURPRISE_MS : SPLASH_MS[kind];
}

/** Заставка перед запитанням: поле (board задано) — cell; класика, фінал, «Ва-банк» і «Вибування» — question; бліц — null. */
export function questionSplashKind(state: GameState, board?: BoardPlay): SplashKind | null {
  if (board !== undefined) return 'cell';
  const type = state.quiz.rounds[state.roundIndex]?.type;
  return type === 'classic' || type === 'final' || type === 'wipeout' || type === 'survival' ? 'question' : null;
}

/** Чи запитання (чи запитання дуелі) ще не почалося: startedAt у майбутньому. */
export function notStarted(state: GameState, now: number): boolean {
  return state.startedAt !== null && now < state.startedAt;
}

/** Після паузи: заставка, що не скінчилася до pausedAt, зсувається на shift (at і until). */
export function shiftSplash(state: GameState, pausedAt: number, shift: number): GameState {
  const splash = state.splash;
  if (splash === null || shift === 0 || splash.until <= pausedAt) return state;
  return { ...state, splash: { ...splash, at: splash.at + shift, until: splash.until + shift } };
}

/**
 * Скільки заставки перед запитанням (question, cell, duel) лишалося на мить паузи pausedAt; інакше 0.
 * Таймер запитання стартує на її кінці, тож resume додає цей залишок перед залишком таймера.
 */
export function splashLead(state: GameState, pausedAt: number): number {
  const splash = state.splash;
  if (splash === null || (splash.kind !== 'question' && splash.kind !== 'cell' && splash.kind !== 'duel')) return 0;
  return Math.max(0, splash.until - pausedAt);
}

/** Кінець поточної заставки цього виду, якщо вона є; інакше null. */
export function splashUntil(state: GameState, kind: SplashKind): number | null {
  return state.splash?.kind === kind ? state.splash.until : null;
}
