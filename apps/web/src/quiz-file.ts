import { quizSchema, type Quiz } from '@quiz/shared';

/** Вікторина з тексту файла або null, якщо це не вікторина. */
export function parseQuizFile(text: string): Quiz | null {
  try {
    const parsed = quizSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
