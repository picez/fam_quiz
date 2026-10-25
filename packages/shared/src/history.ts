import type { Answer } from './answer';
import type { AdjustmentSource, BuffKind, DebuffKind } from './game';
import type { CellKind, Question, Round, TrialKind, WagerMode } from './quiz';
import type { WipeoutStatus } from './wipeout';

export type GameStatus = 'running' | 'finished' | 'aborted';

/** Рядок у списку ігор ведучого. */
export interface GameSummary {
  id: string;
  title: string;
  code: string;
  status: GameStatus;
  startedAt: string;
  finishedAt: string | null;
  playerCount: number;
  questionsPlayed: number;
  /** Усі запитання вікторини в усіх раундах. */
  questionCount: number;
}

export interface GameStanding {
  participantId: string;
  nickname: string;
  score: number;
  rank: number | null;
  /** Скільки відповідей зараховано. */
  correct: number;
}

/** Відповідь одного гравця на запитання в історії. */
export interface GameResponse {
  nickname: string;
  /** null — спроба бліцу без відповіді. */
  answer: Answer | null;
  accepted: boolean;
  /** Баф, з яким дано відповідь; null — без бафу. */
  buff: BuffKind | null;
  /** Запасне запитання (зі знімка гри), на яке дано відповідь; null — основне. */
  spare: Question | null;
}

export interface GameQuestionResult {
  /** Порядковий номер запитання в грі. */
  index: number;
  roundIndex: number;
  text: string;
  type: Question['type'];
  answered: number;
  accepted: number;
  /** Клітинка поля, з якої відкрито запитання; null поза раундом поля. */
  cell: {
    category: string;
    price: number;
    multiplier: 1 | 2 | 3;
    /** Нікнейм того, хто вибрав клітинку; null, якщо його вилучили. */
    chooser: string | null;
    /** Бали вибравшого за це запитання; null, якщо запису немає. */
    points: number | null;
    kind: CellKind;
    /** Бліц-клітинка: сума балів кожного учасника з рядками за це запитання (за турнірною таблицею); [] для звичайної. */
    scores: { nickname: string; points: number }[];
  } | null;
  /** Знімок запитання з правильною відповіддю: історію бачить лише ведучий. */
  question: Question;
  /** Ключі (cloudKey) слів «хмари», які ведучий сховав зі сцени; немає — нічого не сховано. */
  cloudHidden?: string[];
  /** «100 до 1»: дошку збудовано з хмари слів (question.rows — збудовані рядки). */
  surveyFromCloud?: true;
  /** Блеф: варіанти в порядку розкриття (правда остання) з нікнеймами авторів і тих, хто вибрав; прибрані — в кінці з removed. */
  bluff?: { options: { text: string; kind: 'truth' | 'lie' | 'spare'; authors: string[]; pickedBy: string[]; removed: boolean }[] };
  /** «Ва-банк»: ціна сходинки й стан кожного учасника після неї (за турнірною таблицею). */
  wipeout?: { price: number; rows: { nickname: string; status: WipeoutStatus; bank: number }[] };
  /** «Вибування»: вердикт після розкриття, випробування, привиди й хто живий після цього запитання. */
  survival?: {
    /** Немає, коли раунд чи гра скінчились на розкритті, до вердикту. */
    verdict?: 'trial' | 'all_wrong' | 'all_right';
    ghosts: { answered: number; right: number };
    trial: {
      kind: TrialKind;
      fellBack: boolean;
      /** Текст питання на виживання; null — удача. */
      question: string | null;
      /** Саме питання на виживання (щоб показати відповіді людською мовою); немає в старих записах. */
      trialQuestion?: Question;
      rows: { nickname: string; out: boolean; answer: Answer | null; door: number | null; auto: boolean; trap: number | null }[];
    } | null;
    /** Живі після цього запитання (нікнейми). */
    alive: string[];
    /** На цьому запитанні раунд скінчився. */
    end: boolean;
  };
  /** Відповіді в порядку: учасник за турнірною таблицею, потім номер спроби. */
  responses: GameResponse[];
  /** Запитання фіналу: ставки й результати учасників за турнірною таблицею; null поза фіналом. */
  final: {
    /** Тип ставок фіналу зі знімка. */
    mode: WagerMode;
    entries: { nickname: string; answer: Answer | null; wager: number; points: number; accepted: boolean }[];
  } | null;
}

/** Зіграна гра очима ведучого. */
export interface GameDetail extends Omit<GameSummary, 'playerCount'> {
  rounds: { title: string; type: Round['type'] }[];
  standings: GameStanding[];
  questions: GameQuestionResult[];
  /** Коригування рахунку за seq; [] у старих іграх. */
  adjustments: GameAdjustment[];
}

/** Коригування рахунку учасника поза відповідями в історії гри. */
export interface GameAdjustment {
  /** Номер коригування в грі: два дуельні поспіль — одна дуель. */
  seq: number;
  roundIndex: number;
  /** Скільки запитань гри було закрито в мить коригування. */
  afterQuestion: number;
  nickname: string;
  points: number;
  source: AdjustmentSource;
  /** Лише для source 'debuff': куплений вид і ціль (null — ціль вилучили до запису). */
  debuff?: DebuffKind;
  target?: string | null;
}

/** Гра в історії гравця з акаунтом. */
export interface PlayedGame {
  gameId: string;
  title: string;
  status: GameStatus;
  startedAt: string;
  nickname: string;
  score: number;
  rank: number | null;
  playerCount: number;
  correct: number;
  answered: number;
  questionsPlayed: number;
}
