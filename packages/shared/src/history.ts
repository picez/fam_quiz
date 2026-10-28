import type { Answer } from './answer';
import type { ScoreBreakdown } from './breakdown';
import type { AdjustmentSource, BuffKind, DebuffKind } from './game';
import type { FactCard, FactTableRow } from './facts';
import type { LadderOutcomeKind } from './ladder';
import type { CellKind, LifelineKind, Question, Round, TrialKind, WagerMode } from './quiz';
import type { UndoTarget } from './undo';
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
  /** Командна гра (10j): є рядки команд. */
  teams: boolean;
  /** Гра без ведучого (11h): «Провів бот». */
  autopilot: boolean;
}

export interface GameStanding {
  participantId: string;
  nickname: string;
  score: number;
  rank: number | null;
  /** Скільки відповідей зараховано. */
  correct: number;
  /** Бали за раундами 0…n−1 (11f), n — останній раунд із запитанням, відповіддю чи коригуванням + 1; однакова довжина для всіх рядків. */
  rounds: number[];
  /** «+ / −» за джерелами з рядків answer (без голосів) і коригувань (11f); у дуже старих іграх без коригувань — лише з відповідей. */
  breakdown: ScoreBreakdown;
  /** Командна гра: нікнейми людей команди; немає — соло. */
  members?: string[];
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
  /** «Мільйонер»: учасник, сходинка, підказки, рішення, підсумок і зал на цьому запитанні. */
  ladder?: {
    /** Нікнейм учасника. */
    contestant: string;
    /** Сходинка з 0. */
    step: number;
    level: number;
    /** Сходинка неспалима. */
    safe: boolean;
    lifelines: {
      kind: LifelineKind;
      /** 50/50: прибрані варіанти; в інших — null. */
      removed: string[] | null;
      /** Зал: підсумок закритого голосування; в інших — null. */
      tally: { cast: number; counts: Record<string, number> } | null;
      /** Підказка ведучого текстом; null — уголос або не інша підказка. */
      hint: string | null;
      aloud: boolean;
    }[];
    decision: 'go' | 'take' | null;
    outcome: { kind: LadderOutcomeKind; passed: number; points: number } | null;
    /** Скільки глядачів відповіли й відгадали. */
    hall: { answered: number; right: number };
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
  /** Цікавинки гри (12d): нагороди й таблиця учасників з рядків answer і коригувань; для старих ігор — те, що можна порахувати. */
  facts: { awards: FactCard[]; table: FactTableRow[] };
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
  /** Лише для source 'undo' (12a): що скасовано. */
  undoes?: UndoTarget;
}

/** Гра в історії гравця з акаунтом. */
export interface PlayedGame {
  gameId: string;
  title: string;
  status: GameStatus;
  /** Гра без ведучого (11h). */
  autopilot: boolean;
  startedAt: string;
  nickname: string;
  score: number;
  rank: number | null;
  /** Командна гра — кількість команд (місце — місце команди). */
  playerCount: number;
  correct: number;
  answered: number;
  questionsPlayed: number;
  /** Командна гра: назва команди людини; null — соло. */
  team: string | null;
}
