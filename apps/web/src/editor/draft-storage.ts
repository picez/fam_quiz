import {
  ANSWER_MODES,
  AUDIO_URL,
  BUFF_KINDS,
  CELL_KINDS,
  CELL_MARKS,
  CELL_PENALTIES,
  DEBUFF_KINDS,
  LIMITS,
  PIN_MAPS,
  PIN_MAP_ASPECT,
  REVEAL_MODES,
  upgradeQuiz,
  videoSchema,
  YOUTUBE_ID,
  type BoardCategory,
  type DuelCategory,
  type DuelQuestion,
  type Duels,
  type PinMap,
  type Question,
  type QuestionAudio,
  type Quiz,
  type Round,
} from '@quiz/shared';
import { QUESTION_TYPES } from './draft';
import { newId } from './new-id';

const blanks = (count: number) => Array.from({ length: count }, () => ({ id: newId(), text: '' }));

const key = (id: string | undefined) => `quiz:draft:${id ?? 'new'}`;

/** JSON не вміє зберігати NaN (порожнє числове поле) і перетворює його на null. */
const numberOr = (value: unknown) => (typeof value === 'number' ? value : Number.NaN);

/** Аудіо з чернетки: лишається, якщо джерело правильне; початок і тривалість можуть бути порожніми числами (NaN). */
function reviveAudio(value: unknown): QuestionAudio | null {
  if (typeof value !== 'object' || value === null) return null;
  const { source, url, id, start, duration } = value as Record<string, unknown>;
  const times = { start: numberOr(start), duration: numberOr(duration) };
  if (source === 'file' && typeof url === 'string' && AUDIO_URL.test(url)) return { source, url, ...times };
  if (source === 'youtube' && typeof id === 'string' && YOUTUBE_ID.test(id)) return { source, id, ...times };
  return null;
}

/**
 * Стіна з чернетки: групи — об'єкти з рядками або чотири порожні; розмір (3 чи 4, інакше 4) вирівнює кількість плиток кожної групи.
 * Відео стіна не має, а кількість помилок — звичайне число (порожнє поле — NaN, як і скрізь).
 */
function reviveWall(base: Extract<Question, { type: 'wall' }>): Question {
  const raw = Array.isArray(base.groups) ? (base.groups as unknown[]).filter(isRecord) : [];
  const size = raw.length === 3 ? 3 : 4;
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  const groups = Array.from({ length: size }, (_, index) => {
    const group = raw[index];
    const tiles = group !== undefined && Array.isArray(group.tiles) ? (group.tiles as unknown[]).filter(isRecord) : [];
    return {
      id: group !== undefined && typeof group.id === 'string' ? group.id : newId(),
      name: group === undefined ? '' : text(group.name),
      tiles: Array.from({ length: size }, (_, at) => ({
        id: typeof tiles[at]?.id === 'string' ? (tiles[at].id as string) : newId(),
        text: text(tiles[at]?.text),
      })),
    };
  });
  return { ...base, video: null, groups, mistakes: typeof base.mistakes === 'number' ? base.mistakes : base.mistakes === undefined ? LIMITS.defaultWallMistakes : Number.NaN };
}

/**
 * «100 до 1» з чернетки: рядки — об'єкти з рядками (популярність — число, інакше 0; написання — рядки) або п'ять порожніх;
 * кількість відповідей — звичайне число (типово 3), cloudId — лише рядок. Після хмари без запасних рядків лишається [], без хмари — п'ять порожніх.
 */
function reviveSurvey(base: Extract<Question, { type: 'survey' }>): Question {
  const { cloudId, ...rest } = base;
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  const cloud = typeof cloudId === 'string' && cloudId !== '' ? { cloudId } : {};
  const raw = Array.isArray(base.rows) ? (base.rows as unknown[]).filter(isRecord) : null;
  const rows = (raw ?? []).map((row) => ({
    id: typeof row.id === 'string' ? row.id : newId(),
    text: text(row.text),
    popularity: typeof row.popularity === 'number' ? row.popularity : 0,
    accepted: Array.isArray(row.accepted) ? (row.accepted as unknown[]).map(text) : [],
  }));
  const blank = () => ({ id: newId(), text: '', popularity: 0, accepted: [] as string[] });
  return {
    ...rest,
    ...cloud,
    // Без хмари дошка без рядків нічим не допоможе: повертаються п'ять порожніх, як у новому запитанні.
    rows: rows.length === 0 && cloud.cloudId === undefined ? Array.from({ length: 5 }, blank) : rows,
    answers: typeof base.answers === 'number' ? base.answers : base.answers === undefined ? LIMITS.defaultSurveyAnswers : Number.NaN,
  };
}

function revive(stored: Question): Question {
  // Підказка — лише рядок: зіпсоване значення зникає, а не ламає редактор.
  const { hint, audio, reveal, ...question } = stored;
  const video = videoSchema.safeParse(question.video).success ? question.video : null;
  const revivedAudio = reviveAudio(audio);
  const base = {
    ...question,
    ...(typeof hint === 'string' ? { hint } : {}),
    ...(revivedAudio === null || video !== null ? {} : { audio: revivedAudio }),
    ...((REVEAL_MODES as readonly string[]).includes(reveal as string) ? { reveal } : {}),
    video,
    timeLimit: numberOr(question.timeLimit),
    points: numberOr(question.points),
  } as Question;
  if (base.type === 'numeric') return { ...base, correct: numberOr(base.correct), tolerance: numberOr(base.tolerance) };
  if (base.type === 'slider') {
    const { unit, zeroBeyond, ...rest } = base;
    return {
      ...rest,
      min: numberOr(base.min),
      max: numberOr(base.max),
      step: numberOr(base.step),
      correct: numberOr(base.correct),
      tolerance: numberOr(base.tolerance),
      // Сміття в полі межі нуля (NaN) у JSON стає null і не відновлюється: поле покаже порожнім.
      ...(typeof zeroBeyond === 'number' ? { zeroBeyond } : {}),
      ...(typeof unit === 'string' ? { unit } : {}),
    };
  }
  if (base.type === 'clues') {
    const { clues, accepted } = base as { clues: unknown; accepted: unknown };
    const strings = (value: unknown) => (Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? item : '')) : null);
    return { ...base, clues: strings(clues) ?? ['', '', ''], accepted: strings(accepted) ?? [''], interval: numberOr(base.interval) };
  }
  if (base.type === 'pin') {
    const share = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5);
    const known = (PIN_MAPS as readonly unknown[]).includes(base.map);
    const target: { x?: unknown; y?: unknown } = isRecord(base.target) ? base.target : {};
    // Невідома мапа (чернетка з майбутнього чи зіпсована) стає світом: основа без картинки не буває порожньою.
    const map: PinMap | null = known ? (base.map as PinMap) : base.map === null && typeof base.imageUrl === 'string' ? null : 'world';
    return {
      ...base,
      map,
      aspect: map === null ? numberOr(base.aspect) : PIN_MAP_ASPECT[map],
      // Точка без координат — у центр: порожньою вона не буває.
      target: { x: share(target.x), y: share(target.y) },
      fullRadius: numberOr(base.fullRadius),
      zeroRadius: numberOr(base.zeroRadius),
      imageUrl: map === null ? base.imageUrl : null,
    };
  }
  if (base.type === 'sort') return { ...base, lockSeconds: numberOr(base.lockSeconds) };
  if (base.type === 'wall') return reviveWall(base);
  if (base.type === 'survey') return reviveSurvey(base);
  if (base.type === 'poll') {
    const options = Array.isArray(base.options)
      ? (base.options as unknown[]).filter(isRecord).map((option) => ({
          ...option,
          id: typeof option.id === 'string' ? option.id : newId(),
          text: typeof option.text === 'string' ? option.text : '',
        }))
      : [];
    return { ...base, points: 0, options: (options.length >= LIMITS.minOptions ? options : [...options, ...blanks(LIMITS.minOptions - options.length)]) as typeof base.options };
  }
  if (base.type === 'wordcloud') return { ...base, points: 0, words: typeof base.words === 'number' ? base.words : LIMITS.maxCloudWords };
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
  const { spares, ...rest } = category;
  return {
    ...rest,
    cells: category.cells.map((cell) => ({
      // Невідома позначка не повинна ламати поле.
      mark: (CELL_MARKS as readonly string[]).includes(cell.mark) ? cell.mark : 'none',
      // Чернетка зі старої версії не має нових полів.
      kind: (CELL_KINDS as readonly string[]).includes(cell.kind) ? cell.kind : 'normal',
      ...((ANSWER_MODES as readonly string[]).includes(cell.answerMode as string) ? { answerMode: cell.answerMode } : {}),
      penalty: (CELL_PENALTIES as readonly string[]).includes(cell.penalty) ? cell.penalty : 'none',
      question: revive(cell.question),
    })),
    ...reviveSpares(spares),
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
