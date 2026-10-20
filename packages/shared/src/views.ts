import type { Answer } from './answer';
import type { Grade, Phase } from './game';
import type { CellMark, Question, Round } from './quiz';
import type { Standing } from './standing';

export interface Choice {
  id: string;
  text: string;
}

/** Запитання без правильної відповіді; choices у порядку показу. */
export interface PublicQuestion {
  type: Question['type'];
  text: string;
  imageUrl: string | null;
  timeLimit: number;
  points: number;
  choices: Choice[];
}

export interface RevealStats {
  answered: number;
  accepted: number;
  /** Кількість виборів за id варіанта; для boolean ключі "true" і "false". */
  counts: Record<string, number>;
}

export interface LobbyPlayer {
  id: string;
  nickname: string;
  connected: boolean;
  /** Поточна серія правильних відповідей у раунді. */
  streak: number;
}

/** Поточний раунд для всіх ролей. */
export interface RoundInfo {
  /** 0-базовий номер раунду. */
  index: number;
  /** Кількість раундів у вікторині. */
  total: number;
  title: string;
  type: Round['type'];
  /** Чи ввімкнено ведучому ручну оцінку «частково». */
  partial: boolean;
}

export interface BlitzPlayer {
  playerId: string;
  nickname: string;
}

export interface BlitzInfo {
  /** Нерозглянуті натискання по черзі; перший — той, чию відповідь зараз перевіряють. */
  queue: BlitzPlayer[];
  /** Переможець запитання; для сцени й гравців null до reveal. */
  winner: BlitzPlayer | null;
}

/** Стан бліцу для самого гравця. */
export interface PlayerBlitz {
  /** 1-базове місце в черзі; null — не в черзі. */
  position: number | null;
  attemptsUsed: number;
  /** null — без обмежень. */
  attemptsLeft: number | null;
  /** Етап question, не пауза, не в черзі, спроби лишилися; час клієнт не перевіряє. */
  canBuzz: boolean;
  /** Кінець власного вікна відповіді, якщо гравець у черзі. */
  deadline: number | null;
}

export interface HostBlitz extends BlitzInfo {
  manual: boolean;
  queue: (BlitzPlayer & { answer: Answer | null; deadline: number | null })[];
  attempts: (BlitzPlayer & { answer: Answer | null; grade: 'correct' | 'wrong'; points: number })[];
}

export interface BoardCellView {
  id: string;
  price: number;
  played: boolean;
  /** null — позначку приховано (сцена й гравці, поки клітинку не вибрали). */
  mark: CellMark | null;
}

export interface BoardInfo {
  categories: { id: string; title: string; cells: BoardCellView[] }[];
  /** Порядок поточного кола. */
  order: BlitzPlayer[];
  /** Чий хід: хто вибирає (board) або відповідає (question…reveal). */
  turn: BlitzPlayer | null;
  /** Вибрана клітинка поточного запитання (category — назва категорії); її позначку видно всім. */
  cell: { id: string; category: string; price: number; mark: CellMark } | null;
  answerMode: 'phone' | 'voice';
  rolls: number;
  /** Мить автоматичного пропуску ходу відсутнього гравця; null — гравець на місці або пауза. */
  skipAt: number | null;
}

export interface HostBoard extends BoardInfo {
  /** answerMode 'voice' або check 'manual'. */
  manual: boolean;
  /** Відповідь з телефону, що чекає на оцінку. */
  answer: Answer | null;
}

interface BaseView {
  phase: Phase;
  paused: boolean;
  /** Раунд; null у лобі. */
  round: RoundInfo | null;
  /** 0-базовий номер запитання в раунді; -1, поки запитання не відкрито. */
  questionIndex: number;
  /** Кількість запитань у поточному раунді. */
  total: number;
  question: PublicQuestion | null;
  endsAt: number | null;
  remainingMs: number | null;
  playerCount: number;
  answeredCount: number;
  /** Черга бліцу; null поза запитанням раунду бліцу. */
  blitz: BlitzInfo | null;
  /** Поле й ходи; null поза раундом поля та в етапах lobby, round_end, finished. */
  board: BoardInfo | null;
}

export interface StageView extends BaseView {
  role: 'stage';
  players: LobbyPlayer[];
  reveal: Question | null;
  stats: RevealStats | null;
  standings: Standing[] | null;
}

export interface PlayerResult {
  accepted: boolean;
  accuracy: number;
  grade: Grade;
  /** Бонус за серію; входить у points. */
  streakBonus: number;
  points: number;
}

export interface PlayerView extends BaseView {
  role: 'player';
  me: {
    id: string;
    nickname: string;
    score: number;
    rank: number | null;
    answer: Answer | null;
    result: PlayerResult | null;
    blitz: PlayerBlitz | null;
  };
  reveal: Question | null;
  standings: Standing[] | null;
}

export interface HostResponse {
  playerId: string;
  nickname: string;
  /** null — бліц, гравець натиснув, але не встиг відповісти. */
  answer: Answer | null;
  timeMs: number;
  accepted: boolean;
  grade: Grade;
  streakBonus: number;
  points: number;
  overridden: boolean;
}

export interface HostView extends BaseView {
  role: 'host';
  players: (LobbyPlayer & { score: number })[];
  correct: Question | null;
  responses: HostResponse[];
  blitz: HostBlitz | null;
  /** Як у BaseView, але позначки всіх клітинок видно завжди. */
  board: HostBoard | null;
  standings: Standing[];
}

export type GameView = StageView | PlayerView | HostView;
