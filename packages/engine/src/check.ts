import { answerWindowMs, proximityPartial, revealShare, sliderShare, type Answer, type Grade, type Question } from '@quiz/shared';
import { normalizeText } from './normalize';

export interface CheckResult {
  accepted: boolean;
  accuracy: number;
}

const REJECTED: CheckResult = { accepted: false, accuracy: 0 };
const FULL: CheckResult = { accepted: true, accuracy: 1 };
const EPSILON = 1e-9;

/** Частка ціни, з якої відповідь на тип із балами за близькість вважається правильною (14a). */
export const PROXIMITY_CORRECT_SHARE = 0.5;

const full = (correct: boolean): CheckResult => (correct ? FULL : REJECTED);

/** Чи збігається відповідь з одним із написань (як у типі text): normalizeText, порожня — ні. */
export function textMatches(accepted: string[], value: string): boolean {
  const normalized = normalizeText(value);
  return normalized !== '' && accepted.some((spelling) => normalizeText(spelling) === normalized);
}

export function checkAnswer(question: Question, answer: Answer): CheckResult {
  if (question.type === 'single' && answer.type === 'single') {
    return full(answer.optionId === question.correctId);
  }

  if (question.type === 'multi' && answer.type === 'multi') {
    const chosen = new Set(answer.optionIds);
    const noRepeats = chosen.size === answer.optionIds.length;
    return full(
      noRepeats && chosen.size === question.correctIds.length && question.correctIds.every((id) => chosen.has(id)),
    );
  }

  if (question.type === 'boolean' && answer.type === 'boolean') {
    return full(answer.value === question.correct);
  }

  if (question.type === 'text' && answer.type === 'text') {
    return full(textMatches(question.accepted, answer.value));
  }

  if (question.type === 'numeric' && answer.type === 'numeric') {
    const distance = Math.abs(answer.value - question.correct);
    if (!Number.isFinite(distance) || distance > question.tolerance + EPSILON) return REJECTED;
    if (question.tolerance === 0) return FULL;
    return { accepted: true, accuracy: 1 - 0.5 * Math.min(distance / question.tolerance, 1) };
  }

  if (question.type === 'slider' && answer.type === 'slider') {
    const share = sliderShare(question, answer.value);
    if (share <= 0) return REJECTED;
    // (zeroBeyond − d) / (zeroBeyond − tolerance) у двійковому може вийти 0.4999…
    return { accepted: share >= PROXIMITY_CORRECT_SHARE - EPSILON, accuracy: share };
  }

  if (question.type === 'order' && answer.type === 'order') {
    const ids = question.items.map((item) => item.id);
    const given = answer.itemIds;
    const isPermutation =
      given.length === ids.length && new Set(given).size === ids.length && given.every((id) => ids.includes(id));
    if (!isPermutation) return REJECTED;
    const inPlace = ids.filter((id, index) => given[index] === id).length;
    if (inPlace === 0) return REJECTED;
    return { accepted: inPlace === ids.length, accuracy: inPlace / ids.length };
  }

  if (question.type === 'match' && answer.type === 'match') {
    const { pairs } = question;
    const lefts = answer.links.map((link) => link.left);
    const rights = answer.links.map((link) => link.right);
    return full(
      answer.links.length === pairs.length &&
        new Set(lefts).size === pairs.length &&
        new Set(rights).size === pairs.length &&
        answer.links.every((link) => pairs.some((pair) => pair.left.id === link.left && pair.right.id === link.right)),
    );
  }

  return REJECTED;
}

export interface Verdict {
  accepted: boolean;
  accuracy: number;
  grade: Grade;
}

/** Оцінка за точністю перевірки: ≥ 1 — правильно, ≤ 0 — неправильно, інакше частково. */
export function gradeOf(accuracy: number): Grade {
  return accuracy >= 1 ? 'correct' : accuracy <= 0 ? 'wrong' : 'partial';
}

/** Множник ціни за час на картинці, що проявляється (revealShare від повного вікна); інакше 1. */
export function revealFactor(question: Question, timeMs: number): number {
  // Старі запитання (сирий JSON) поля reveal не мають.
  return question.reveal == null ? 1 : revealShare(timeMs, answerWindowMs(question));
}

/**
 * Перевірка з урахуванням часу.
 * Типи з балами за близькість (proximityPartial, повзунок): accepted — частка ≥ 0,5; grade 'correct' | 'partial' | 'wrong' за цим правилом (14a).
 * Решта: accepted і grade — з самої відповіді (checkAnswer, gradeOf); на картинці, що проявляється, точність × revealFactor —
 * це плата за час, як бонус швидкості, а не часткова правильність.
 */
export function verdictOf(question: Question, answer: Answer, timeMs: number): Verdict {
  const checked = checkAnswer(question, answer);
  if (proximityPartial(question)) {
    const grade = checked.accepted ? 'correct' : checked.accuracy > 0 ? 'partial' : 'wrong';
    return { accepted: checked.accepted, accuracy: checked.accuracy, grade };
  }
  return { accepted: checked.accepted, accuracy: checked.accuracy * revealFactor(question, timeMs), grade: gradeOf(checked.accuracy) };
}
