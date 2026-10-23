import type { Answer } from './answer';
import type { DebuffKind, DuelStage, Grade, Phase } from './game';
import type { AnswerMode, CellKind, CellMark, CellPenalty, Question, Round, Video, WagerMode } from './quiz';
import type { RoundBrief } from './round-brief';
import type { Standing } from './standing';

export interface Choice {
  id: string;
  text: string;
  /** Лише варіанти single/multi. */
  imageUrl?: string;
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
  /** Підписи над і під списком order ('' — немає); null для інших типів. */
  orderLabels: { top: string; bottom: string } | null;
  /** null для інших типів. */
  chain: PublicChain | null;
  /** null для інших типів; слів і правильних категорій тут немає. */
  sort: { categories: Choice[]; total: number; lockSeconds: number } | null;
}

export interface PublicChain {
  first: string;
  /** Маски прихованих слів для всіх: перша літера й розділювачі. */
  masks: ChainMask[];
  hintSeconds: number;
}

export interface ChainRow {
  playerId: string;
  nickname: string;
  solved: number;
  hints: number;
  /** Час проходження зі штрафом; null — не пройшов. */
  timeMs: number | null;
  /** Бали за запитання; лише на reveal, інакше null. */
  points: number | null;
}

export interface ChainInfo {
  /** Скільки прихованих слів. */
  total: number;
  /** Пройшли за часом, далі за solved спаданням, далі в порядку гравців. */
  rows: ChainRow[];
}

export interface PlayerChain {
  solved: number;
  /** Особисті маски: вгадані слова повністю, поточне з підказками, решта — перша літера. */
  masks: ChainMask[];
  hints: number;
  hintMs: number;
  /** question, не пауза, не пройшов, у поточному слові ще можна відкрити літеру (час клієнт перевіряє сам). */
  canHint: boolean;
  /** Особистий кінець часу: endsAt − штраф; null на паузі й поза question. */
  deadline: number | null;
  /** На паузі: max(0, remainingMs − штраф); інакше null. */
  remainingMs: number | null;
  /** Межа часу запитання з «±15 с». */
  limitMs: number;
  /** Час проходження зі штрафом; null — ще не пройшов. */
  timeMs: number | null;
}

export interface SortRow {
  playerId: string;
  nickname: string;
  sorted: number;
  misses: number;
  /** Час повного сортування; null — ще не закінчив. */
  timeMs: number | null;
  /** Бали за запитання; лише на reveal, інакше null. */
  points: number | null;
}

export interface SortInfo {
  /** Скільки слів. */
  total: number;
  /** Під час запитання — у порядку гравців; з locked — закінчили за часом, далі за sorted спаданням, далі в порядку гравців. На полі — лише той, хто вибрав. */
  rows: SortRow[];
  /** Бліц: хто першим відсортував усе; з locked. null — ще ніхто або не бліц. */
  winner: BlitzPlayer | null;
}

/** Сортування для самого гравця: лише власна поточна картка, правильних категорій немає. */
export interface PlayerSort {
  /** Поточна картка; null — усе відсортовано або запис уже є. */
  card: { id: string; text: string } | null;
  sorted: number;
  total: number;
  misses: number;
  /** Кінець підвисання (час сервера); null — не підвисає або пауза. */
  lockedUntil: number | null;
  /** На паузі: залишок підвисання, мс; інакше null. */
  lockRemainingMs: number | null;
  /** Слово останньої помилки — для трусіння картки. */
  missed: { id: string; text: string } | null;
  /** question, не пауза, гравець відповідає тут, запису ще немає. */
  canSort: boolean;
  /** Час повного сортування; null — ще не закінчив. */
  timeMs: number | null;
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
  /** Опис раунду від автора; '' — немає. */
  description: string;
  brief: RoundBrief;
  /** Найменший і найбільший час (с) запитань раунду з таймером; null — таймера немає в жодного. */
  times: { min: number; max: number } | null;
}

export interface BlitzPlayer {
  playerId: string;
  nickname: string;
}

/** Рядок живої черги миттєвого бліцу. */
export interface BlitzRow extends BlitzPlayer {
  /** Від відкриття запитання до відповіді, мс. */
  timeMs: number;
  /** null — ще не перевірено або не перевірено до закриття. */
  grade: 'correct' | 'wrong' | null;
  /** Вибір; сцені й гравцям null до розкриття, ведучому завжди (null — після «Перевибрати» ще не відповів). */
  answer: Answer | null;
}

export interface BlitzInfo {
  /** Нерозглянуті натискання по черзі; перший — той, чию відповідь зараз перевіряють. */
  queue: BlitzPlayer[];
  /** Переможець; сцені й гравцям — з reveal, у миттєвому бліці вже з locked. */
  winner: BlitzPlayer | null;
  /** Миттєвий бліц: без кнопки, автоперевірка. */
  instant: boolean;
  /** Жива черга миттєвого бліцу: розглянуті, нерозглянуті, не перевірені до закриття — у порядку надсилання; [] у бліці з кнопкою. */
  rows: BlitzRow[];
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
  /** Миттєвий бліц: можна надіслати відповідь (ще не відповідав або «Перевибрати»); етап question. На паузі лишається true, щоб поле не зникало з набраним; сервер на паузі відмовляє. */
  canAnswer: boolean;
  /** Вердикт власної останньої спроби на цьому запитанні; null — ще немає. */
  grade: 'correct' | 'wrong' | null;
}

/** Як BlitzInfo, але переможець видно одразу, а rows — з вибором кожного. */
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
  /** Позначку, вид, спосіб відповіді й штраф видно всім від початку раунду: формат запитання з них не випливає. */
  mark: CellMark;
  kind: CellKind;
  /** Спосіб клітинки або, якщо його немає, раунду (cellAnswerMode). */
  answerMode: AnswerMode;
  penalty: CellPenalty;
}

/** Рядок кидків кубика на заставці поля. */
export interface DiceRow extends BlitzPlayer {
  /** Усі кидки по черзі: перший тур, далі перекидання. */
  throws: number[];
  /** Має кинути в поточному турі. */
  waiting: boolean;
}

/** Кидки кубиків на заставці поля; бачать усі. */
export interface DiceInfo {
  /** Гравці в порядку приєднання; рядки не переставляються. */
  rows: DiceRow[];
  /** Триває перекидання між тими, хто зрівнявся. */
  tieBreak: boolean;
  /** Порядок визначено. */
  done: boolean;
}

/** Коло ходів у розкладі. */
export interface TurnCircle {
  /** Номер кола в раунді, від 1. */
  number: number;
  order: BlitzPlayer[];
  /** Скільки гравців цього кола вже походили; у наступних колах 0. Хто на черзі — order[done], якщо turn не null. */
  done: number;
}

export interface BoardInfo {
  categories: { id: string; title: string; cells: BoardCellView[] }[];
  /** Порядок поточного кола. */
  order: BlitzPlayer[];
  /** Чий хід: хто вибирає (board) або відповідає (question…reveal). */
  turn: BlitzPlayer | null;
  /** Вибрана клітинка поточного запитання (category — назва категорії). */
  cell: {
    id: string;
    category: string;
    price: number;
    mark: CellMark;
    kind: CellKind;
    answerMode: AnswerMode;
    penalty: CellPenalty;
  } | null;
  /** Кидки кубиків; null — кубики не кидають (порядок за приєднанням або ручний). */
  dice: DiceInfo | null;
  /** Розклад кіл: поточне й наступні; [] поки кидають кубики. */
  schedule: TurnCircle[];
  /** Кіл потрібно більше, ніж показано: далі ротація повторюється. */
  scheduleRepeats: boolean;
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
  /** null — у бліці гравець не встиг відповісти; на усній клітинці ведучий не позначив варіант. */
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
  /** Ставка дорівнювала всім балам (> 0). */
  allIn: boolean;
  /** Рахунок до фіналу й після нього; для сцени й телефонів «після» — лише те, що вже розкрито. */
  before: number;
  after: number;
  /** Частка з банку після розподілу; null у класиці, до розподілу й для програвших. */
  share: number | null;
}

/** Підсумок розподілу банку фіналу. */
export interface FinalSplit {
  bank: number;
  /** Ніхто не виграв зі ставкою > 0: ставки повертаються. */
  refund: boolean;
  /** Переможці з часткою > 0, за спаданням частки. */
  shares: { playerId: string; nickname: string; wager: number; share: number }[];
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
  /** Тип ставок раунду. */
  mode: WagerMode;
  /** Сума ставок розкритих програвших; 0 у класиці й поза reveal. */
  bank: number;
  /** Підсумок розподілу; null до кроку розподілу й у класиці. */
  split: FinalSplit | null;
}

export interface HostFinal extends FinalInfo {
  /** Ставки всіх гравців; null — ще не поставив. allIn — ставка дорівнює межі й більша за 0. */
  wagers: { playerId: string; nickname: string; wager: number | null; limit: number; allIn: boolean }[];
  /** Записи без урахування розкриття: до reveal лише тих, хто відповів (у порядку гравців), на reveal усіх, у порядку розкриття. */
  entries: FinalEntry[];
  manual: boolean;
  /** Відповіді, що чекають на ручну оцінку (manual, answer не null, гравця немає в graded). */
  pending: { playerId: string; nickname: string; answer: Answer }[];
  /** Наступне «Далі» розподіляє банк (лише ведучому: на сцені це видало б, що хтось помилився). */
  splitNext: boolean;
}

/** Останнє коригування від ведучого, для короткого сповіщення. */
export interface AdjustmentNotice {
  seq: number;
  /** Час сервера в мить коригування. */
  at: number;
  nickname: string;
  points: number;
}

/** Дуель для всіх ролей: без прийнятних відповідей до етапу answer і без текстів спроб. */
export interface DuelInfo {
  challenger: BlitzPlayer;
  opponent: BlitzPlayer;
  stage: DuelStage;
  /** Категорії пулу: назва й скільки запитань ще не було; left 0 — недоступна. */
  categories: { id: string; title: string; left: number }[];
  /** Назва вибраної категорії; null до вибору. */
  category: string | null;
  /** 1-базовий номер поточного запитання дуелі; 0 до першого. */
  number: number;
  /** Скільки запитань у дуелі: після вибору категорії — total, до того — questionsPerDuel. */
  total: number;
  /** Текст поточного запитання (question, answer); інакше null. */
  question: string | null;
  /** Прийнятні написання поточного запитання; сцені й гравцям — лише на answer, інакше null. */
  accepted: string[] | null;
  wins: { challenger: number; opponent: number };
  /** Скільки неправильних спроб у поточному запитанні; самих текстів тут немає. */
  tries: { challenger: number; opponent: number };
  /** answer: хто виграв запитання (null — ніхто) і як написав. */
  questionWinner: BlitzPlayer | null;
  winningAnswer: string | null;
  /** result: переможець; null — нічия. */
  winner: BlitzPlayer | null;
  stake: number;
  /** answer: наступне «Далі» веде до підсумку. */
  ending: boolean;
}

/** Як DuelInfo, але accepted заповнене і на question. */
export interface HostDuel extends DuelInfo {
  /** Тексти неправильних спроб у поточному запитанні. */
  tryTexts: { challenger: string[]; opponent: string[] };
}

export interface PlayerDuel {
  /** Кнопка «Дуель»: null — не показувати (ще рано, уже пізно, своя дуель уже була, запитання скінчилися, не етап гри). */
  rights: { canDeclare: boolean; opponents: BlitzPlayer[] } | null;
  /** Власні неправильні спроби в поточному запитанні дуелі; [] для глядача. */
  tries: string[];
  /** Дуелянт, етап question, не пауза, запитання ще не виграно. */
  canAnswer: boolean;
  /** Цей гравець оголосив дуель і зараз етап category. */
  canPick: boolean;
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
  /** Повний час поточного запитання з «±15 с», мс; лише на етапі question і з таймером, інакше null. */
  limitMs: number | null;
  /** Годинник стоїть, бо відповідь чекає на рішення ведучого. */
  held: boolean;
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
  /** Поступ ланцюжка; null поза запитанням-ланцюжком, а для сцени й гравців і у фіналі. */
  chain: ChainInfo | null;
  /** Прогрес сортування; null поза сортуванням, а для сцени й гравців і у фіналі. */
  sort: SortInfo | null;
  /** Останнє коригування балів ведучим; null — не було. */
  notice: AdjustmentNotice | null;
  /** Оголошена або поточна дуель; null — немає. */
  duel: DuelInfo | null;
}

export interface StageView extends BaseView {
  role: 'stage';
  players: LobbyPlayer[];
  reveal: Question | null;
  stats: RevealStats | null;
  /** Гравці з дебафом, що чекає або діє; лише імена, без виду. */
  debuffs: BlitzPlayer[];
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
    /** Власна ставка й її межа; allIn — ставка дорівнює межі й більша за 0; null поза фіналом. */
    final: { wager: number | null; limit: number; allIn: boolean } | null;
    /** null поза запитанням-ланцюжком. */
    chain: PlayerChain | null;
    /** null поза сортуванням і для того, хто не відповідає тут (глядач на полі). */
    sort: PlayerSort | null;
    /** Власний дебаф, лише поки діє в поточному запитанні. since — мить відкриття запитання (час сервера). */
    debuff: { kind: DebuffKind; since: number } | null;
    /** null — у вікторині немає дуелей. */
    duel: PlayerDuel | null;
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

export interface HostPlayer extends LobbyPlayer {
  score: number;
  /** fired — діє в поточному запитанні; інакше чекає. */
  debuff: { kind: DebuffKind; fired: boolean } | null;
}

export interface HostView extends BaseView {
  role: 'host';
  players: HostPlayer[];
  correct: Question | null;
  responses: HostResponse[];
  blitz: HostBlitz | null;
  /** Як у BaseView. */
  board: HostBoard | null;
  final: HostFinal | null;
  /** Як у BaseView, але і у фіналі. */
  chain: ChainInfo | null;
  /** Як у BaseView, але і у фіналі. */
  sort: SortInfo | null;
  /** Як у BaseView, але з прийнятними відповідями й текстами спроб. */
  duel: HostDuel | null;
  standings: Standing[];
}

export type GameView = StageView | PlayerView | HostView;

/** Маска слова ланцюжка: відкрита літера або null для закритої; розділювачі відкриті. */
export type ChainMask = (string | null)[];
