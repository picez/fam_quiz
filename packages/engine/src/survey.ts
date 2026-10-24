import type { Question, SurveyAnswer } from '@quiz/shared';
import { surveyHits } from './check';
import { normalizeText } from './normalize';

/**
 * Чистить відповідь «100 до 1»: обрізано, пробіли зведено, без порожніх і повторів за normalizeText, не більше question.answers;
 * rows — surveyHits. Нічого не лишилося — values [].
 */
export function scoreSurvey(question: Extract<Question, { type: 'survey' }>, answer: { values: readonly string[] }): SurveyAnswer {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const raw of answer.values) {
    if (values.length >= question.answers) break;
    const value = raw.trim().replace(/\s+/g, ' ');
    const key = normalizeText(value);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }
  return { type: 'survey', values, rows: surveyHits(question.rows, values) };
}
