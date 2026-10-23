import {
  ANSWER_MODES,
  BUFF_KINDS,
  CELL_KINDS,
  CELL_MARKS,
  CELL_PENALTIES,
  DEBUFF_KINDS,
  LIMITS,
  upgradeQuiz,
  videoSchema,
  type BoardCategory,
  type DuelCategory,
  type DuelQuestion,
  type Duels,
  type Question,
  type Quiz,
  type Round,
} from '@quiz/shared';
import { QUESTION_TYPES } from './draft';

const key = (id: string | undefined) => `quiz:draft:${id ?? 'new'}`;

/** JSON не вміє зберігати NaN (порожнє числове поле) і перетворює його на null. */
const numberOr = (value: unknown) => (typeof value === 'number' ? value : Number.NaN);

function revive(stored: Question): Question {
  // Підказка — лише рядок: зіпсоване значення зникає, а не ламає редактор.
  const { hint, ...question } = stored;
  const video = videoSchema.safeParse(question.video).success ? question.video : null;
  const base = {
    ...question,
    ...(typeof hint === 'string' ? { hint } : {}),
    video,
    timeLimit: numberOr(question.timeLimit),
    points: numberOr(question.points),
  } as Question;
  if (base.type === 'numeric') return { ...base, correct: numberOr(base.correct), tolerance: numberOr(base.tolerance) };
  if (base.type === 'sort') return { ...base, lockSeconds: numberOr(base.lockSeconds) };
  return base;
}

const looksLikeQuestion = (q: unknown) =>
  typeof q === 'object' &&
  q !== null &&
  typeof (q as Question).id === 'string' &&
  typeof (q as Question).text === 'string' &&
  (QUESTION_TYPES as readonly string[]).includes((q as Question).type);

const looksLikeCategory = (category: unknown) => {
  if (typeof category !== 'object' || category === null) return false;
  const { id, title, cells } = category as Record<string, unknown>;
  return (
    typeof id === 'string' &&
    typeof title === 'string' &&
    Array.isArray(cells) &&
    cells.length > 0 &&
    cells.every((cell) => typeof cell === 'object' && cell !== null && looksLikeQuestion((cell as { question?: unknown }).question))
  );
};

function reviveCategory(category: BoardCategory): BoardCategory {
  return {
    ...category,
    cells: category.cells.map((cell) => ({
      // Невідома позначка не повинна ламати поле.
      mark: (CELL_MARKS as readonly string[]).includes(cell.mark) ? cell.mark : 'none',
      // Чернетка зі старої версії не має нових полів.
      kind: (CELL_KINDS as readonly string[]).includes(cell.kind) ? cell.kind : 'normal',
      ...((ANSWER_MODES as readonly string[]).includes(cell.answerMode as string) ? { answerMode: cell.answerMode } : {}),
      penalty: (CELL_PENALTIES as readonly string[]).includes(cell.penalty) ? cell.penalty : 'none',
      question: revive(cell.question),
    })),
  };
}

const looksLikeDuels = (value: unknown): value is Duels =>
  typeof value === 'object' && value !== null && Array.isArray((value as Duels).categories);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * Чернетка могла не мати чисел (NaN у JSON стає null): беремо типові значення.
 * Зіпсовані категорії й запитання відкидаються; без жодної категорії — без дуелей.
 */
function reviveDuels(duels: Duels): Duels | null {
  const number = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
  const categories = (duels.categories as unknown[])
    .filter((category): category is DuelCategory => isRecord(category) && Array.isArray(category.questions))
    .map((category) => ({
      ...category,
      questions: (category.questions as unknown[]).filter(
        (question): question is DuelQuestion => isRecord(question) && typeof question.text === 'string' && Array.isArray(question.accepted),
      ),
    }));
  if (categories.length === 0) return null;
  return {
    ...duels,
    categories,
    questionsPerDuel: number(duels.questionsPerDuel, LIMITS.defaultDuelQuestions),
    timeLimit: number(duels.timeLimit, LIMITS.defaultDuelTime),
    stake: number(duels.stake, LIMITS.defaultDuelStake),
  };
}

/** Масив дозволених видів із чернетки: невідомі значення відкидаються, не масив — поле зникає. */
const reviveKinds = <K extends string>(value: unknown, all: readonly K[]): K[] | null =>
  Array.isArray(value) ? all.filter((kind) => value.includes(kind)) : null;

const reviveSettings = (settings: Quiz['settings']): Quiz['settings'] => {
  const { debuffs, buffs, ...others } = settings;
  const revivedDebuffs = reviveKinds(debuffs, DEBUFF_KINDS);
  const revivedBuffs = reviveKinds(buffs, BUFF_KINDS);
  return {
    ...others,
    leaderboard: settings.leaderboard ?? 'each',
    ...(revivedDebuffs === null ? {} : { debuffs: revivedDebuffs }),
    ...(revivedBuffs === null ? {} : { buffs: revivedBuffs }),
  };
};

const withDuels = (duels: Duels | null) => (duels === null ? {} : { duels });

/** Пул запасних із чернетки: зіпсовані записи відкидаються, не масив чи порожній пул — поле зникає. */
const reviveSpares = (value: unknown): { spares: Question[] } | Record<string, never> => {
  if (!Array.isArray(value)) return {};
  const spares = value.filter(looksLikeQuestion).map(revive);
  return spares.length === 0 ? {} : { spares };
};

function looksLikeQuiz(value: unknown): value is Quiz {
  if (typeof value !== 'object' || value === null) return false;
  const { title, description, settings, rounds } = value as Record<string, unknown>;
  return (
    typeof title === 'string' &&
    typeof description === 'string' &&
    typeof settings === 'object' &&
    settings !== null &&
    Array.isArray(rounds) &&
    rounds.length > 0 &&
    rounds.every((round) => {
      if (typeof round !== 'object' || round === null) return false;
      const { id, type, title: roundTitle, rules, questions, categories } = round as Record<string, unknown>;
      const common =
        typeof id === 'string' &&
        typeof roundTitle === 'string' &&
        // У фіналі правил немає.
        (type === 'final' || (typeof rules === 'object' && rules !== null));
      if (type === 'board') return common && Array.isArray(categories) && categories.length > 0 && categories.every(looksLikeCategory);
      return common && Array.isArray(questions) && questions.length > 0 && questions.every(looksLikeQuestion);
    })
  );
}

/** Незбережена чернетка цієї вікторини (id не задано для нової) або null. */
export function loadDraft(id: string | undefined): Quiz | null {
  try {
    const raw = sessionStorage.getItem(key(id));
    if (raw === null) return null;
    // Чернетка старого формату (один список запитань) стає вікториною з одним раундом.
    const parsed = upgradeQuiz(JSON.parse(raw));
    if (!looksLikeQuiz(parsed)) return null;
    const { duels: rawDuels, spares: rawSpares, ...rest } = parsed;
    return {
      ...rest,
      ...reviveSpares(rawSpares),
      ...withDuels(looksLikeDuels(rawDuels) ? reviveDuels(rawDuels) : null),
      settings: reviveSettings(parsed.settings),
      rounds: parsed.rounds.map((round): Round => {
        if (round.type === 'board') {
          const { categories, ...rest } = round;
          return { ...rest, categories: categories.map(reviveCategory) };
        }
        const questions = round.questions.map(revive);
        if (round.type === 'blitz') return { ...round, questions };
        // Чернетка до типів ставок — класичні ставки.
        if (round.type === 'final') return { ...round, wagerMode: round.wagerMode ?? 'classic', questions };
        return {
          ...round,
          // Чернетка старого формату могла не мати цих полів.
          speedBonus: round.speedBonus ?? true,
          shuffleOptions: round.shuffleOptions ?? false,
          questions,
        };
      }),
    };
  } catch {
    return null;
  }
}

export function saveDraft(id: string | undefined, quiz: Quiz): void {
  try {
    sessionStorage.setItem(key(id), JSON.stringify(quiz));
  } catch {
    // Сховище недоступне: редактор працює, але чернетка не переживе перезавантаження.
  }
}

export function clearDraft(id: string | undefined): void {
  try {
    sessionStorage.removeItem(key(id));
  } catch {
    // Нічого прибирати.
  }
}
