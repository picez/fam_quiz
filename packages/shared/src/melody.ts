/** «Мелодія за нотами» (29e): шматки, частки ціни, кліпи. Значень з quiz.ts тут не беремо (quiz.ts імпортує цей файл). */
import type { QuestionAudio } from './quiz';

export const MELODY_STEPS = [1, 2, 4, 8, 16] as const;
export const MELODY_SHARES = [1, 0.8, 0.6, 0.4, 0.25] as const;
export const MELODY_STEP_COUNT = 5;
export const MELODY_REVEAL_SECONDS = 30;

export type MelodyTrack =
  | { source: 'file'; url: string; start: number }
  | { source: 'youtube'; id: string; start: number };

/** Частка ціни за найдовшим відкритим шматком; < 1 чи NaN — як 1, > 5 — остання. */
export function melodyShare(heard: number): number {
  if (!(heard >= 1)) return 1;
  return MELODY_SHARES[Math.min(MELODY_STEP_COUNT, Math.floor(heard)) - 1];
}

/** Секунди найдовшого відкритого шматка: 0 для 0, 1…5 — за сходинками, більше — 16. */
export function melodySeconds(heard: number): number {
  if (!(heard >= 1)) return 0;
  return MELODY_STEPS[Math.min(MELODY_STEP_COUNT, Math.floor(heard)) - 1];
}

export function melodyClip(track: MelodyTrack, seconds: number): QuestionAudio {
  return { ...track, duration: seconds };
}

export function melodyRevealClip(track: MelodyTrack): QuestionAudio {
  return melodyClip(track, MELODY_REVEAL_SECONDS);
}
