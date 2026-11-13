import { LIMITS, allSpares, questionsOf, quizSchema, roundTrials, type BoardCategory, type Question, type Quiz, type RemovalEffect, type Round } from '@quiz/shared';

export type RemoveResult =
  | { ok: true; quiz: Quiz; effect: 'question' | 'category' | 'round' }
  | { ok: false; error: 'not_found' | 'last_question' };

/** Найменше запитань раунду за схемою; менше — раунд іде цілком. «Правда про гравця» (28b) запитань у вікторині не має. */
const MIN_QUESTIONS: Record<Exclude<Round['type'], 'board' | 'truth' | 'quest'>, number> = {
  classic: 1,
  blitz: 1,
  final: 1,
  bets: 1,
  auction: 1,
  wipeout: LIMITS.minWipeoutQuestions,
  survival: LIMITS.minSurvivalQuestions,
  ladder: LIMITS.minLadderQuestions,
  puzzles: 1,
};

type RoundChange = { round: Round | null; effect: 'question' | 'category' | 'round' };

const without = (list: Question[], id: string) => list.filter((q) => q.id !== id);

/** Категорія без запасного; порожні запасні — поле зникає. */
function withoutSpare(category: BoardCategory, id: string): BoardCategory {
  const { spares, ...rest } = category;
  const left = without(spares ?? [], id);
  return left.length > 0 ? { ...rest, spares: left } : rest;
}

/** Раунд без запитання id; null — запитання в раунді немає. */
function removeFromRound(round: Round, id: string): RoundChange | null {
  if (round.type === 'board') {
    const index = round.categories.findIndex((c) => c.cells.some((cell) => cell.question.id === id) || (c.spares ?? []).some((q) => q.id === id));
    if (index === -1) return null;
    const category = round.categories[index]!;
    if (!category.cells.some((cell) => cell.question.id === id)) {
      return { round: { ...round, categories: round.categories.map((c, i) => (i === index ? withoutSpare(c, id) : c)) }, effect: 'question' };
    }
    const cells = category.cells.filter((cell) => cell.question.id !== id);
    if (cells.length >= LIMITS.minCategoryQuestions) {
      return { round: { ...round, categories: round.categories.map((c, i) => (i === index ? { ...c, cells } : c)) }, effect: 'question' };
    }
    const categories = round.categories.filter((_, i) => i !== index);
    return categories.length >= LIMITS.minCategories ? { round: { ...round, categories }, effect: 'category' } : { round: null, effect: 'round' };
  }
  if (round.type === 'survival' && round.trials.some((q) => q.id === id)) {
    return { round: { ...round, trials: without(round.trials, id) }, effect: 'question' };
  }
  // Запитання «Правди про гравця» (28b) гра робить із фактів: у вікторині їх немає.
  if (round.type === 'truth') return null;
  const index = round.questions.findIndex((q) => q.id === id);
  if (index === -1) return null;
  const questions = without(round.questions, id);
  // «Квест із кодом» (29g): запитань не менше, ніж символів у коді.
  const least = round.type === 'quest' ? Array.from(round.code).length : MIN_QUESTIONS[round.type];
  if (questions.length < least) return { round: null, effect: 'round' };
  if (round.type === 'ladder') {
    // Рівень належить сходинці: іде разом із нею; неспалимі вище зсуваються вниз, а та, що стала верхньою, зникає (схема: не верхня).
    const levels = round.levels.filter((_, i) => i !== index);
    const safe = round.safe.filter((s) => s !== index).map((s) => (s > index ? s - 1 : s)).filter((s) => s < questions.length - 1);
    return { round: { ...round, questions, levels, safe }, effect: 'question' };
  }
  return { round: { ...round, questions } as Round, effect: 'question' };
}

/** Вікторина без запитання; дуелі не чіпаються (not_found). Без мутацій. */
export function removeQuestion(quiz: Quiz, questionId: string): RemoveResult {
  let next: Quiz | null = null;
  let effect: RoundChange['effect'] = 'question';
  for (let r = 0; r < quiz.rounds.length && next === null; r++) {
    const change = removeFromRound(quiz.rounds[r]!, questionId);
    if (change === null) continue;
    effect = change.effect;
    const rounds = change.round === null ? quiz.rounds.filter((_, i) => i !== r) : quiz.rounds.map((round, i) => (i === r ? change.round! : round));
    next = { ...quiz, rounds };
  }
  if (next === null && quiz.spares?.some((q) => q.id === questionId)) {
    const { spares, ...rest } = quiz;
    const left = without(spares, questionId);
    next = left.length > 0 ? { ...rest, spares: left } : rest;
  }
  if (next === null) return { ok: false, error: 'not_found' };
  if (questionsOf(next).length === 0) return { ok: false, error: 'last_question' };
  return { ok: true, quiz: next, effect };
}

/** Що станеться, якщо видалити запитання (мінімуми схеми; дуелі → not_found; решта не проходить quizSchema → locked). */
export function removalEffect(quiz: Quiz, questionId: string): RemovalEffect {
  const result = removeQuestion(quiz, questionId);
  if (!result.ok) return result.error;
  return quizSchema.safeParse(result.quiz).success ? result.effect : 'locked';
}

/** removalEffect для кожного видимого id запитання (раунди, клітинки, trials, spares, category.spares). */
export function removalEffects(quiz: Quiz): Record<string, RemovalEffect> {
  const ids = [...questionsOf(quiz), ...quiz.rounds.flatMap(roundTrials), ...allSpares(quiz)].map((q) => q.id);
  return Object.fromEntries(ids.map((id) => [id, removalEffect(quiz, id)]));
}

/** Запитання за id серед тих, що можна видалити; для тексту в журналі. */
export function removableQuestion(quiz: Quiz, questionId: string): Question | undefined {
  return [...questionsOf(quiz), ...quiz.rounds.flatMap(roundTrials), ...allSpares(quiz)].find((q) => q.id === questionId);
}
