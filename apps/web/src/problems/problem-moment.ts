import { PROBLEM_MOMENT_MAX_AGE_MS, problemGameSchema, type ProblemGameInput, type QuestionType } from '@quiz/shared';

export const MOMENT_KEY = 'quiz:problem-moment';

/** Те, що зріз гри (пульт гравця чи ведучого) показує людині; відповідей тут немає. */
export interface MomentView {
  phase: string;
  round: { index: number; title: string } | null;
  questionIndex: number;
  question: { type: QuestionType; text: string } | null;
}

/** Момент гри, який бачить людина: раунд і запитання як на екрані (70). */
export function momentOf(code: string, role: 'player' | 'host', view: MomentView): ProblemGameInput {
  return {
    code,
    role,
    phase: view.phase,
    round: view.round?.index ?? null,
    roundTitle: view.round?.title ?? null,
    question: view.round === null ? null : view.questionIndex,
    type: view.question?.type ?? null,
    text: view.question?.text ?? null,
  };
}

/** Запам'ятати момент у мить кліку; збій сховища — тихо (посилання все одно відкриється). */
export function saveMoment(moment: ProblemGameInput, now = Date.now()): void {
  try {
    localStorage.setItem(MOMENT_KEY, JSON.stringify({ ...moment, at: now }));
  } catch {
    // сховище недоступне — скарга піде без моменту
  }
}

/** Момент для сторінки /report?from=…: той самий код кімнати, не старший за 30 хв, форма правильна; інакше null. */
export function readMoment(from: string, now = Date.now()): ProblemGameInput | null {
  const match = /^\/(?:play|host)\/(\d{6})/.exec(from);
  if (match === null) return null;
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(MOMENT_KEY) ?? 'null');
    if (typeof raw !== 'object' || raw === null) return null;
    const { at, ...rest } = raw as Record<string, unknown>;
    if (typeof at !== 'number' || now - at > PROBLEM_MOMENT_MAX_AGE_MS || now < at - 60_000) return null;
    const parsed = problemGameSchema.safeParse(rest);
    return parsed.success && parsed.data.code === match[1] ? parsed.data : null;
  } catch {
    return null;
  }
}

export function clearMoment(): void {
  try {
    localStorage.removeItem(MOMENT_KEY);
  } catch {
    // нічого
  }
}
