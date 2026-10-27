import {
  answerWindowMs,
  clueShare,
  cluesAt,
  pinShare,
  PROXIMITY_CORRECT_SHARE,
  proximityPartial,
  revealShare,
  sliderShare,
  surveyShare,
  type Answer,
  type Grade,
  type Question,
  type SurveyRow,
} from '@quiz/shared';
import { normalizeText } from './normalize';

export interface CheckResult {
  accepted: boolean;
  accuracy: number;
}

const REJECTED: CheckResult = { accepted: false, accuracy: 0 };
const FULL: CheckResult = { accepted: true, accuracy: 1 };
const EPSILON = 1e-9;

const full = (correct: boolean): CheckResult => (correct ? FULL : REJECTED);

/** Чи збігається відповідь з одним із написань (як у типі text): normalizeText, порожня — ні. */
export function textMatches(accepted: string[], value: string): boolean {
  const normalized = normalizeText(value);
  return normalized !== '' && accepted.some((spelling) => normalizeText(spelling) === normalized);
}

/** Збіги значень з рядками дошки: id першого рядка, де textMatches([text, ...accepted], value); рядок, уже влучений раніше, — null. */
export function surveyHits(rows: readonly SurveyRow[], values: readonly string[]): (string | null)[] {
  const hit = new Set<string>();
  return values.map((value) => {
    const row = rows.find((r) => textMatches([r.text, ...r.accepted], value));
    if (row === undefined || hit.has(row.id)) return null;
    hit.add(row.id);
    return row.id;
  });
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

  if (question.type === 'clues' && answer.type === 'clues') {
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

  if (question.type === 'pin' && answer.type === 'pin') {
    const share = pinShare(question, answer.x, answer.y);
    if (share <= 0) return REJECTED;
    return { accepted: share >= PROXIMITY_CORRECT_SHARE - EPSILON, accuracy: share };
  }

  if (question.type === 'survey' && answer.type === 'survey') {
    const share = surveyShare(question, surveyHits(question.rows, answer.values));
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

/** Чи тип платить за час часткою ціни (без бонусу швидкості): картинка, що проявляється, і «Хто я?». */
export function paysForTime(question: Question): boolean {
  // Старі запитання (сирий JSON) поля reveal не мають.
  return question.type === 'clues' || question.reveal != null;
}

/**
 * Множник ціни за темп: картинка, що проявляється, — revealShare від повного вікна;
 * «Хто я?» — clueShare(n, opened ?? cluesAt(question, timeMs)) (opened — підказки, відкриті ведучим на усній клітинці); інакше 1.
 */
export function paceFactor(question: Question, timeMs: number, opened?: number): number {
  if (question.type === 'clues') return clueShare(question.clues.length, opened ?? cluesAt(question, timeMs));
  return question.reveal == null ? 1 : revealShare(timeMs, answerWindowMs(question));
}

/** Вердикт за часткою ціни для типів з балами за близькість чи кількість знайденого (14a): правильна — частка ≥ 0,5. */
export function shareVerdict(share: number): Verdict {
  // Частка в двійковому може вийти 0.4999…
  const accepted = share >= PROXIMITY_CORRECT_SHARE - EPSILON;
  return { accepted, accuracy: share, grade: accepted ? 'correct' : share > 0 ? 'partial' : 'wrong' };
}

/**
 * Перевірка з урахуванням часу.
 * Типи з балами за близькість чи кількість знайденого (proximityPartial: повзунок, точка, «100 до 1» — частка популярності влучених рядків;
 * стіна рахується в wall.ts): shareVerdict — accepted, коли частка ≥ 0,5 (14a).
 * Решта: accepted і grade — з самої відповіді (checkAnswer, gradeOf); на картинці, що проявляється, і в «Хто я?» точність × paceFactor —
 * це плата за час, як бонус швидкості, а не часткова правильність. opened — для усної клітинки (підказки відкрив ведучий).
 */
export function verdictOf(question: Question, answer: Answer, timeMs: number, opened?: number): Verdict {
  const checked = checkAnswer(question, answer);
  if (proximityPartial(question)) return shareVerdict(checked.accuracy);
  return {
    accepted: checked.accepted,
    accuracy: checked.accuracy * paceFactor(question, timeMs, opened),
    grade: gradeOf(checked.accuracy),
  };
}
