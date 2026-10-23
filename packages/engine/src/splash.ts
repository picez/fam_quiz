import type { SplashKind } from '@quiz/shared';
// game.ts викликає цей файл; звідси — лише типи game.ts.
import type { BoardPlay, GameState } from './game';

/** Тривалість кожної заставки, мс; кінець заставки запитання — старт його таймера. */
export const SPLASH_MS: Record<SplashKind, number> = { round: 2500, final: 3200, question: 1200, cell: 1000, duel: 2000, podium: 2500 };

/** Поточна заставка: вид і час сервера початку й кінця. */
export interface Splash {
  kind: SplashKind;
  at: number;
  until: number;
}

/** Ставить заставку kind з миті now; без state.transitions — splash: null. */
export function withSplash(state: GameState, kind: SplashKind, now: number): GameState {
  return state.transitions ? { ...state, splash: { kind, at: now, until: now + SPLASH_MS[kind] } } : { ...state, splash: null };
}

/** Заставка перед запитанням: поле (board задано) — cell; класика й фінал — question; бліц — null. */
export function questionSplashKind(state: GameState, board?: BoardPlay): SplashKind | null {
  if (board !== undefined) return 'cell';
  const type = state.quiz.rounds[state.roundIndex]?.type;
  return type === 'classic' || type === 'final' ? 'question' : null;
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
