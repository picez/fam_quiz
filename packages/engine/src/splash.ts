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

/**
 * Ставить заставку kind з миті now тривалістю ms (типово SPLASH_MS[kind]); без state.transitions — splash: null.
 * Виняток — 'blitz' (26a): «БЛІЦ!» перед бліц-клітинкою показується й без переходів.
 */
export function withSplash(state: GameState, kind: SplashKind, now: number, ms: number = SPLASH_MS[kind]): GameState {
  return state.transitions || kind === 'blitz' ? { ...state, splash: { kind, at: now, until: now + ms } } : { ...state, splash: null };
}

/**
 * Тривалість заставки перед запитанням: клітинка з множником — SPLASH_MS.cell + CELL_SURPRISE_MS.
 * Бліц-клітинка (26a) — перегортання клітинки (за transitions; без них 0), потім SPLASH_MS.blitz.
 */
export function questionSplashMs(kind: SplashKind, board?: BoardPlay, transitions = true): number {
  if (kind === 'blitz') return (transitions ? questionSplashMs('cell', board) : 0) + SPLASH_MS.blitz;
  return kind === 'cell' && board !== undefined && board.multiplier > 1 ? SPLASH_MS.cell + CELL_SURPRISE_MS : SPLASH_MS[kind];
}

/**
 * Заставка перед запитанням: бліц-клітинка поля — blitz; інша клітинка (board задано) — cell;
 * класика, фінал, «Ставки», «Аукціон», «Правда про гравця», «Головоломки», «Ва-банк», «Вибування», «Мільйонер» і «Квест із кодом» — question; бліц-раунд — null.
 */
export function questionSplashKind(state: GameState, board?: BoardPlay): SplashKind | null {
  if (board?.kind === 'blitz') return 'blitz';
  if (board !== undefined) return 'cell';
  const type = state.quiz.rounds[state.roundIndex]?.type;
  return type === 'classic' || type === 'final' || type === 'bets' || type === 'auction' || type === 'truth' || type === 'puzzles' || type === 'wipeout' || type === 'survival' || type === 'ladder' || type === 'quest'
    ? 'question'
    : null;
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
 * Скільки заставки перед запитанням (question, cell, blitz, duel) чи випробуванням (trial) лишалося на мить паузи pausedAt; інакше 0.
 * Таймер стартує на її кінці, тож resume додає цей залишок перед залишком таймера.
 */
export function splashLead(state: GameState, pausedAt: number): number {
  const splash = state.splash;
  if (
    splash === null ||
    (splash.kind !== 'question' && splash.kind !== 'cell' && splash.kind !== 'blitz' && splash.kind !== 'duel' && splash.kind !== 'trial')
  )
    return 0;
  return Math.max(0, splash.until - pausedAt);
}

/** Кінець поточної заставки цього виду, якщо вона є; інакше null. */
export function splashUntil(state: GameState, kind: SplashKind): number | null {
  return state.splash?.kind === kind ? state.splash.until : null;
}
