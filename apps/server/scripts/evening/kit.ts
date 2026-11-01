import type { DuelCategory, Question } from '@quiz/shared';

/** Теми вечора; код теми — префікс id запитання. silly і riddle — таємні категорії: їхні назви гравцям не показуються. */
export const EVENING_THEMES = {
  bio: 'Біологія',
  chem: 'Хімія',
  phys: 'Фізика',
  geo: 'Географія',
  garden: 'Садівництво',
  craft: 'Рукоділля',
  comics: 'Комікси та аніме',
  lit: 'Література',
  sport: 'Спорт',
  modlit: 'Сучасна українська література',
  romance: 'Спортивні романи',
  silly: 'Таємниця №1',
  riddle: 'Таємниця №2',
} as const;
export type EveningTheme = keyof typeof EVENING_THEMES;

/** Запитання теми; id остаточно перенумеровує збирання вікторини. hint — підказка для бафу «Підказка ведучого». */
export const t = (theme: EveningTheme, question: Question, hint?: string): Question => ({
  ...question,
  id: `${theme}-x`,
  ...(hint === undefined ? {} : { hint }),
});

/**
 * Картинка: ключ із IMAGES модуля автора → адреса /uploads/… після завантаження.
 * Збирання з картинками запускається лише з SITE_URL; без картинки вікторина не збирається (кидає помилку).
 */
export type Img = (key: string) => string;

/** Клітинка поля «Своєї гри» (як cell з demo-quiz). */
export type Cell = {
  mark: 'none' | 'x2' | 'x3';
  kind: 'normal' | 'blitz';
  penalty: 'none' | 'all';
  answerMode?: 'phone' | 'voice';
  question: Question;
};

/** Частина вікторини, яку пише один автор. */
export type EveningPart = {
  warmup: Question[];
  main: Question[];
  media: Question[];
  blitz: Question[];
  board: Partial<Record<EveningTheme, { cells: Cell[]; spare: Question }>>;
  wipeout: Question[];
  survival: Question[];
  trials: Question[];
  /** Сходинка (1–12, зростає складність) → запитання з 4 варіантами. */
  ladder: Record<number, Question>;
  spares: Question[];
  /** Лише в частині world: фінальне запитання зі ставками й пул дуелей. */
  final?: Question;
  duels?: DuelCategory[];
};
