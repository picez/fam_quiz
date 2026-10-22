import type { Answer } from './answer';
import type { Grade, Phase } from './game';
import type { AnswerMode, CellKind, CellMark, CellPenalty, Question, Round, Video } from './quiz';
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
  /** null — запитання без таймера (з відео). */
  timeLimit: number | null;
  video: Video | null;
  points: number;
  choices: Choice[];
  /** Праві елементи пар у порядку показу; [] для інших типів. */
  right: Choice[];
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
  /** Кінець власного вікна відповіді, якщо гравець у черзі; null і під час утримання. */
  deadline: number | null;
}

export interface HostBlitz extends BlitzInfo {
  /** Відповідь уголос (усна бліц-клітинка): голову черги оцінює ведучий, відповіді в черзі немає. */
  voice: boolean;
  /** Ведучий оцінює голову («Правильно» / «Неправильно»): ручна перевірка або усна відповідь. */
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
  /** null — тип приховано (сцена й гравці, поки клітинку не вибрали), за тим самим правилом, що mark. */
  kind: CellKind | null;
}

export interface BoardInfo {
  categories: { id: string; title: string; cells: BoardCellView[] }[];
  /** Порядок поточного кола. */
  order: BlitzPlayer[];
  /** Чий хід: хто вибирає (board) або відповідає (question…reveal). */
  turn: BlitzPlayer | null;
  /** Вибрана клітинка поточного запитання (category — назва категорії); її позначку видно всім. */
  cell: {
    id: string;
    category: string;
    price: number;
    mark: CellMark;
    kind: CellKind;
    answerMode: AnswerMode;
    penalty: CellPenalty;
  } | null;
  rolls: number;
  /** Мить автоматичного пропуску ходу відсутнього гравця; null — гравець на місці або пауза. */
  skipAt: number | null;
}

export interface HostBoard extends BoardInfo {
  /** Клітинка відповідає усно або check раунду 'manual'. */
  manual: boolean;
  /** Відповідь з телефону, що чекає на оцінку. */
  answer: Answer | null;
}

/** Відповідь одного гравця, яку бачать усі («Мільйонер»). Правильної відповіді тут немає ніколи. */
export interface Spotlight {
  playerId: string;
  nickname: string;
  /** null — у бліці гравець не встиг відповісти у вікно. */
  answer: Answer | null;
  /** null — чекає на рішення ведучого (помаранчевий); інакше вердикт. */
  grade: Grade | null;
}

/** Запис гравця у фіналі. */
export interface FinalEntry {
  playerId: string;
  nickname: string;
  /** null — гравець мовчав. */
  answer: Answer | null;
  grade: Grade;
  wager: number;
  /** Рахунок до фіналу й після нього. */
  before: number;
  after: number;
}

/** Фінал для всіх ролей: ставок і чужих результатів до розкриття тут немає. */
export interface FinalInfo {
  /** Тема — назва раунду (може бути порожньою). */
  theme: string;
  /** Скільки гравців уже поставили; усього гравців. */
  placed: number;
  total: number;
  /** Розкриті гравці в порядку розкриття (лише reveal); останній — щойно розкритий. */
  shown: FinalEntry[];
  /** Скільки ще не розкрито (лише reveal; інакше 0). */
  left: number;
}

export interface HostFinal extends FinalInfo {
  /** Ставки всіх гравців; null — ще не поставив. */
  wagers: { playerId: string; nickname: string; wager: number | null; limit: number }[];
  /** Записи всіх гравців незалежно від розкриття, у порядку розкриття (до reveal — у порядку гравців). */
  entries: FinalEntry[];
  manual: boolean;
  /** Відповіді, що чекають на ручну оцінку (manual, answer не null, гравця немає в graded). */
  pending: { playerId: string; nickname: string; answer: Answer }[];
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
  /** Відповідь одного гравця для всіх ролей (поле з телефонами, бліц); null — немає. */
  spotlight: Spotlight | null;
  /** Фінал; null поза раундом фіналу й поза етапами intro, wager, question, locked, reveal. */
  final: FinalInfo | null;
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
    /** Власна ставка й її межа; null поза фіналом. */
    final: { wager: number | null; limit: number } | null;
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
  final: HostFinal | null;
  standings: Standing[];
}

export type GameView = StageView | PlayerView | HostView;
