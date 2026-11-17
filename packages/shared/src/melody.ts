/** «Мелодія за нотами» (29e): шматки, частки ціни, кліпи. Значень з quiz.ts тут не беремо (quiz.ts імпортує цей файл). */
import type { QuestionAudio } from './quiz';
import {
  SNIPPET_REVEAL_SECONDS,
  SNIPPET_SHARES,
  SNIPPET_STEP_COUNT,
  SNIPPET_STEPS,
  snippetSeconds,
  snippetShare,
} from './snippets';

export const MELODY_STEPS = SNIPPET_STEPS;
export const MELODY_SHARES = SNIPPET_SHARES;
export const MELODY_STEP_COUNT = SNIPPET_STEP_COUNT;
export const MELODY_REVEAL_SECONDS = SNIPPET_REVEAL_SECONDS;

export type MelodyTrack =
  | { source: 'file'; url: string; start: number }
  | { source: 'youtube'; id: string; start: number };

export const melodyShare = snippetShare;
export const melodySeconds = snippetSeconds;

export function melodyClip(track: MelodyTrack, seconds: number): QuestionAudio {
  return { ...track, duration: seconds };
}

export function melodyRevealClip(track: MelodyTrack): QuestionAudio {
  return melodyClip(track, SNIPPET_REVEAL_SECONDS);
}
