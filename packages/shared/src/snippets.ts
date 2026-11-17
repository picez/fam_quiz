/** Шматки «Мелодії» (29e) і «Відео за фрагментами» (36): секунди від початку фрагмента. Значень з quiz.ts тут не беремо (quiz.ts імпортує цей файл). */
import type { QuestionAudio, Video } from './quiz';

export const SNIPPET_STEPS = [1, 2, 4, 8, 16] as const;
/** Частка ціни за найдовшим відкритим шматком. */
export const SNIPPET_SHARES = [1, 0.8, 0.6, 0.4, 0.25] as const;
export const SNIPPET_STEP_COUNT = 5;
/** Скільки секунд грає розкриття на сцені. */
export const SNIPPET_REVEAL_SECONDS = 30;

/** Частка ціни за найдовшим відкритим шматком; < 1 чи NaN — як 1, > 5 — остання. */
export function snippetShare(heard: number): number {
  if (!(heard >= 1)) return 1;
  return SNIPPET_SHARES[Math.min(SNIPPET_STEP_COUNT, Math.floor(heard)) - 1];
}

/** Секунди найдовшого відкритого шматка: 0 для 0, 1…5 — за сходинками, більше — 16. */
export function snippetSeconds(heard: number): number {
  if (!(heard >= 1)) return 0;
  return SNIPPET_STEPS[Math.min(SNIPPET_STEP_COUNT, Math.floor(heard)) - 1];
}

/** Кліп розкриття «Відео за фрагментами» (36): SNIPPET_REVEAL_SECONDS секунд від clip.start, у формі audioOf, щоб «Ще раз / Стоп» пройшли перевірку host:audio. */
export function videoclipRevealClip(clip: Video): QuestionAudio {
  return { source: 'youtube', id: clip.id, start: clip.start, duration: SNIPPET_REVEAL_SECONDS };
}
