import { pause, setConnected, tick, type GameState } from './game';

/** Версія формату GameState для збережених кімнат (9b). Піднімати, коли змінюється форма стану; кімнати іншої версії не відновлюються.
 * 2 — 9c: DebuffState.by, ScoreAdjustment.target/debuff, QuizSettings.debuffPrices.
 * 3 — 10c: Play.clues (скільки підказок «Хто я?» відкрито).
 */
export const GAME_STATE_VERSION = 3;

/**
 * Версії збереженого стану, які читаються як поточна без перетворень.
 * 2 → 3 лише додала необов'язкове Play.clues (без нього — 1 підказка), а стан версії 2 не може містити «Хто я?»:
 * тож кімната, збережена до розгортання 10c, відновлюється. Версія 1 — ні (інша форма 9c).
 */
export const READABLE_STATE_VERSIONS: readonly number[] = [2, GAME_STATE_VERSION];

/**
 * Стан кімнати після перезапуску сервера: доведений до миті збереження `at`, на паузі саме з цієї миті
 * (крім лобі й фінішу; уже поставлений на паузу лишається як був), усі гравці поза зв'язком.
 * Простій нікому не коштує часу: resume зсуне годинники на всю тривалість паузи.
 */
export function suspend(state: GameState, at: number): GameState {
  // Дедлайни, що сплили до збереження, застосовуються першими.
  let s = tick(state, at);
  if (s.phase !== 'lobby' && s.phase !== 'finished' && !s.paused) {
    const paused = pause(s, at);
    if (paused.ok) s = paused.state;
  }
  // Спершу пауза, потім розрив: на паузі відлік відсутності не стартує, а autoLock нічого не закриває.
  // Кого розрив забрав, того чекають, доки не повернеться: «усі відповіли» без них не закриває запитання.
  const awaiting = [...s.awaiting, ...s.players.filter((p) => p.connected && !s.awaiting.includes(p.id)).map((p) => p.id)];
  for (const p of s.players) {
    if (!p.connected) continue;
    const off = setConnected(s, p.id, false, at);
    if (off.ok) s = off.state;
  }
  return { ...s, awaiting };
}
