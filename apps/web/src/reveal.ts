import { useEffect, useState } from 'react';
import type { Phase, PublicQuestion } from '@quiz/shared';

/** Стадій проявлення; на REVEAL_STAGES картинка повна. */
export const REVEAL_STAGES = 10;

interface Clock {
  phase: Phase;
  endsAt: number | null;
  remainingMs: number | null;
  limitMs: number | null;
}

type Windowed = Pick<PublicQuestion, 'timeLimit' | 'audio'>;

/**
 * Повне вікно відповіді, мс, за публічним запитанням: timeLimit × 1000 плюс тривалість фрагмента, якщо він довший.
 * Телефон не має джерела аудіо, лише тривалість; формула та сама, що в answerWindowMs зі shared.
 */
export function publicWindowMs(question: Windowed): number {
  const limit = question.timeLimit ?? 0;
  const duration = question.audio?.duration;
  return limit * 1000 + (duration !== undefined && duration > limit ? duration * 1000 : 0);
}

/** На скільки мс фрагмент довший за таймер запитання (табло «Слухайте»); 0 без довшого аудіо. */
export function publicLeadMs(question: Windowed): number {
  return publicWindowMs(question) - (question.timeLimit ?? 0) * 1000;
}

/** Поступ 0…1: (limitMs − залишок) / вікно; поза етапом question або без таймера — 1. Додатковий час «±15 с» не продовжує. */
export function revealProgress(view: Clock, question: Windowed, serverNow: number): number {
  if (view.phase !== 'question' || view.limitMs === null || question.timeLimit === null) return 1;
  const window = publicWindowMs(question);
  if (window <= 0) return 1;
  const left = view.remainingMs !== null ? view.remainingMs : view.endsAt !== null ? view.endsAt - serverNow : null;
  if (left === null) return 0;
  return Math.min(1, Math.max(0, (view.limitMs - left) / window));
}

/** Стадія 0…10: floor(p × 10). */
export function revealStage(progress: number): number {
  return Math.min(REVEAL_STAGES, Math.max(0, Math.floor(progress * REVEAL_STAGES + 1e-9)));
}

/** Стовпців пікселів на стадії: round(6 × 1,4^k); на стадії 10 — null (оригінал). */
export function pixelColumns(stage: number): number | null {
  return stage >= REVEAL_STAGES ? null : Math.round(6 * 1.4 ** stage);
}

/** Радіус розмиття на стадії, px: round(28 × (1 − k/10)^1,5); на 10 — 0. */
export function blurRadius(stage: number): number {
  return stage >= REVEAL_STAGES ? 0 : Math.round(28 * (1 - stage / REVEAL_STAGES) ** 1.5);
}

/** Хук: поступ, що оновлюється кожні 250 мс, поки йде таймер запитання з проявленням. */
export function useRevealProgress(view: Clock, question: Windowed | null, offsetMs: number): number {
  const [, setTick] = useState(0);
  const ticking = question !== null && view.phase === 'question' && view.endsAt !== null;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setTick((tick) => tick + 1), 250);
    return () => clearInterval(id);
  }, [ticking, view.endsAt]);
  return question === null ? 1 : revealProgress(view, question, Date.now() + offsetMs);
}
