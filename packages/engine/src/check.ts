import type { Answer, Question } from '@quiz/shared';
import { normalizeText } from './normalize';

export interface CheckResult {
  accepted: boolean;
  accuracy: number;
}

const REJECTED: CheckResult = { accepted: false, accuracy: 0 };
const FULL: CheckResult = { accepted: true, accuracy: 1 };
const EPSILON = 1e-9;

const full = (correct: boolean): CheckResult => (correct ? FULL : REJECTED);

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
    const value = normalizeText(answer.value);
    return full(value !== '' && question.accepted.some((spelling) => normalizeText(spelling) === value));
  }

  if (question.type === 'numeric' && answer.type === 'numeric') {
    const distance = Math.abs(answer.value - question.correct);
    if (!Number.isFinite(distance) || distance > question.tolerance + EPSILON) return REJECTED;
    if (question.tolerance === 0) return FULL;
    return { accepted: true, accuracy: 1 - 0.5 * Math.min(distance / question.tolerance, 1) };
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
