import type { Answer } from './answer';
import type { ScoreBreakdown } from './breakdown';
import type { BuffBlock, BuffKind, DebuffKind, DuelStage, Grade, Phase, RetryStage, ShopBlock, SplashKind } from './game';
import type { HostUndoTarget } from './events';
import type { AnswerMode, LadderPick, LifelineKind, CellKind, CellMark, CellPenalty, PinMap, Question, QuestionAudio, RevealMode, Round, RoundType, TrialKind, Video, WagerMode } from './quiz';
import type { GuidePage } from './guide';
import type { LadderOutcomeKind } from './ladder';
import type { RoundBrief } from './round-brief';
import type { Standing } from './standing';
import type { SurvivalStatus } from './survival';
import type { TeamForm } from './teams';
import type { WipeoutStatus } from './wipeout';

export interface Choice {
  id: string;
  text: string;
  /** Лише варіанти single/multi. */
  imageUrl?: string;
}

/** Повзунок без правильного значення, допуску й межі нуля. */
export interface PublicSlider {
  min: number;
  max: number;
  step: number;
  unit: string;
}

/** «Хто я?» без прихованих підказок і відповіді. */
export interface PublicClues {
  total: number;
  /** Відкриті підказки, від найважчої. */
  shown: string[];
  /** Мить наступної підказки (час сервера); null — ведучий відкриває сам, усі відкриті, пауза, утримання або не етап question. */
  nextAt: number | null;
  /** Наступну відкриває ведучий (усна клітинка). */
  byHost: boolean;
  intervalSeconds: number;
}

/** Основа точки без правильної точки й кіл. */
export interface PublicPin {
  map: PinMap | null;
  aspect: number;
}

/** Точка гравця на мапі. */
export interface PinMark {
  playerId: string;
  nickname: string;
  x: number;
  y: number;
  points: number;
}

/** Аудіо запитання: тривалість — усім (табло «Слухайте»); джерело — лише сцені й пульту. */
export interface PublicAudio {
  duration: number;
  clip: QuestionAudio | null;
}

/** Позначка гравця на шкалі повзунка. */
export interface SliderMark {
  playerId: string;
  nickname: string;
  value: number;
  points: number;
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
  /** null для інших типів. */
  slider: PublicSlider | null;
  /** null для інших типів. */
  clues: PublicClues | null;
  /** null для інших типів; картинка власної основи — у imageUrl. */
  pin: PublicPin | null;
  /** null для інших типів; лише тексти плиток у порядку показу — ні груп, ні id. */
  wall: PublicWall | null;
  /** «Хмара слів»: скільки слів може написати гравець; null для інших типів. */
  cloud: { words: number } | null;
  /** «100 до 1»: скільки відповідей можна ввести й скільки рядків на табло — без текстів; null для інших типів. */
  survey: PublicSurvey | null;
  /** null — без аудіо. */
  audio: PublicAudio | null;
  /** null — звичайна картинка. */
  reveal: RevealMode | null;
}

/** «100 до 1» для всіх під час запитання: скільки відповідей можна ввести й скільки рядків на табло — без текстів. */
export interface PublicSurvey {
  answers: number;
  rows: number;
}

export interface SurveyRowView {
  /** Місце на табло: 1 — найпопулярніший. */
  rank: number;
  /** Відкрито на сцені. */
  open: boolean;
  /** Для сцени й телефонів — лише відкриті рядки; пульт бачить усе. Інакше null. */
  text: string | null;
  popularity: number | null;
  /** Нікнейми тих, хто назвав рядок, у порядку гравців; null — як text. */
  by: string[] | null;
}

/** Табло «100 до 1». Сцена й телефони — з question, рядки закриті до reveal; пульт — уся дошка з question. */
export interface SurveyInfo {
  source: 'host' | 'cloud';
  total: number;
  /** Скільки рядків відкрито знизу. */
  shown: number;
  /** За місцем (rank 1…total). */
  rows: SurveyRowView[];
}

export interface BluffOptionView {
  id: string;
  text: string;
  /** Відкрито на розкритті. */
  open: boolean;
  /** Сцена й телефони — лише для відкритих; пульт — завжди. Інакше null. */
  kind: 'truth' | 'lie' | 'spare' | null;
  /** Нікнейми авторів ([] — правда чи запасна); null — як kind. */
  authors: string[] | null;
  /** Нікнейми тих, хто вибрав; null — як kind. */
  pickedBy: string[] | null;
  /** Прибрано ведучим; сцена й телефони прибраних не отримують. */
  removed: boolean;
}

/** Блеф поточного запитання. */
export interface BluffInfo {
  /** reveal — етапи reveal і пізніше. */
  stage: 'lies' | 'choice' | 'reveal';
  /** Скільки гравців написали вигадку; скільки вибрали. */
  written: number;
  picked: number;
  /** lies — []; choice — у порядку показу; reveal — сцена й телефони в порядку показу, пульт у порядку розкриття (правда остання). */
  options: BluffOptionView[];
  /** Скільки варіантів відкрито; скільки їх буде відкрито. */
  shown: number;
  total: number;
  /** Остання відкрита на розкритті (для підсвічування); сцена й телефони отримують варіанти в порядку показу, тож порядок розкриття не видно. */
  lastOpenedId: string | null;
  /** Пульт: вигадки наживо (нікнейм, текст) у порядку гравців; сцена й телефони — null. */
  lies: { nickname: string; text: string }[] | null;
}

export interface PlayerSurveyLine {
  value: string;
  /** Місце влученого рядка; null — мимо. */
  rank: number | null;
  text: string | null;
  popularity: number | null;
  /** Влучило в рядок, який ще закритий на табло: телефон не випереджає ведучого. */
  pending: boolean;
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
  /** Клітинка поля: усі слова за абеткою для сцени, пульта й глядачів; тому, хто сортує, і поза полем — null. */
  words: { id: string; text: string }[] | null;
  /** Живий показ (11d): лише звичайна клітинка поля; тому, хто сортує, — null. */
  live: SortLive | null;
}

/** Слово сортування в зрізі. */
export interface SortWordView {
  id: string;
  text: string;
}

/** Хід, який глядачі бачать польотом (11d): to — id категорії, куди пішла картка. */
export interface SortMove {
  wordId: string;
  text: string;
  to: string;
  hit: boolean;
}

/** Стовпець категорії під час гри (11d): id категорії й розкладені в неї слова в порядку ходів. */
export interface SortColumn {
  id: string;
  words: SortWordView[];
}

/**
 * Живе сортування однієї сторони для глядачів (11d): звичайна клітинка поля — сцені, пульту й іншим телефонам;
 * командна гра — команді (через PlayerSort.live). Ключа categoryId тут немає навмисно: категорії нерозкладених слів не йдуть нікуди.
 */
export interface SortLive {
  /** Id учасника гри: гравця або команди. */
  sorterId: string;
  nickname: string;
  /** Поточна картка; лише на етапі question без запису, інакше null. */
  card: SortWordView | null;
  /** Слово останньої помилки (для трусіння під час підвисання). */
  missed: SortWordView | null;
  lockedUntil: number | null;
  lockRemainingMs: number | null;
  sorted: number;
  total: number;
  misses: number;
  timeMs: number | null;
  /** Ходів зроблено (sorted + misses): ключ польоту й свіжості нахилу. */
  seq: number;
  /** Усі категорії в порядку автора. */
  columns: SortColumn[];
  last: SortMove | null;
  /** Лише на reveal; інакше null. */
  marks: SortWordMark[] | null;
}

/** Позначка слова на розкритті сортування (11d): скільки разів помилялися й чи не дійшли до нього. */
export interface SortWordMark {
  wordId: string;
  /** 0 — немає «✗N» (без помилок або лічильник неповний). */
  misses: number;
  /** «не встиг»: слово лишилося в черзі, коли час скінчився. */
  late: boolean;
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
  /** Нахил цього гравця бачать інші (11d): телефон шле його лише тоді. */
  watched: boolean;
  /** Позначки слів на розкритті (11d); інакше null. */
  marks: SortWordMark[] | null;
  /** Командна гра: живий показ власної команди для товаришів (11d); соло — null. */
  live: SortLive | null;
}

/** Стіна без груп: лише тексти плиток у порядку показу; гравець надсилає позиції. */
export interface PublicWall {
  tiles: string[];
  /** Плиток у групі (= груп): 3 або 4. */
  size: number;
  groupCount: number;
  maxMistakes: number;
}

/** Стіна для самого гравця: лише власні знайдені групи (позиції), без назв. */
export interface PlayerWall {
  /** Знайдені групи в порядку знаходження; color — номер кольору (0…3). */
  found: { tiles: number[]; color: number }[];
  mistakes: number;
  maxMistakes: number;
  /** Стіну замкнено помилками. */
  locked: boolean;
  /** Склав усю стіну. */
  solved: boolean;
  /** question, не пауза, гравець складає тут, запису ще немає. */
  canGuess: boolean;
}

export interface WallRow {
  playerId: string;
  nickname: string;
  /** Знайдено груп разом з автоматичною. */
  found: number;
  mistakes: number;
  locked: boolean;
  solved: boolean;
  /** Бали; лише на reveal, інакше null. */
  points: number | null;
  /** Позиції знайдених груп; лише на полі (стіна того, хто вибрав) і для пульта, інакше null. */
  tiles: number[][] | null;
}

/** Поступ стіни. Пульт — з question; сцена в класиці — лише на reveal; на полі — усі ролі з question. */
export interface WallInfo {
  groupCount: number;
  /** Порядок: склали (за часом), далі за found спаданням, далі за mistakes зростанням, далі в порядку гравців. На полі — лише той, хто вибрав. */
  rows: WallRow[];
}

/** Слово хмари для сцени: без схованих і без авторів. */
export interface CloudWord {
  key: string;
  text: string;
  count: number;
}

/** Слово хмари для пульта: з позначкою «сховано» й нікнеймами авторів. */
export interface HostCloudWord extends CloudWord {
  hidden: boolean;
  by: string[];
}

export interface RevealStats {
  answered: number;
  /** Скільки прийнято; null для запитань без балів (опитування, хмара). */
  accepted: number | null;
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

/** Учасник командної гри (10j). */
export interface TeamMemberView {
  id: string;
  nickname: string;
  connected: boolean;
}

export interface TeamView {
  id: string;
  name: string;
  /** Позиція кольору 0…5. */
  color: number;
  /** Ефективний капітан; null — команда порожня (лише лобі). */
  captainId: string | null;
  members: TeamMemberView[];
}

/** Командна гра для всіх ролей; null у соло-грі. */
export interface TeamsView {
  form: TeamForm;
  /** У лобі — усі команди з налаштувань; після старту — ті, що грають (як players). */
  teams: TeamView[];
  /** Лобі: без команди; після старту []. */
  unassigned: TeamMemberView[];
  /** Лобі: кубики формування (рядки — люди); null без кидків. */
  dice: DiceInfo | null;
}

/** Учасник командної гри про себе. */
export interface PlayerTeam {
  memberId: string;
  nickname: string;
  /** null — ще без команди (лобі). */
  teamId: string | null;
  captainId: string | null;
  captain: boolean;
  /** Може зараз діяти за команду: капітан; у бліці — натиснувший (або будь-хто, поки можна натиснути); у дуелі — дуелянт. */
  canAct: boolean;
  /** Бліц: хто з команди натиснув (відповідає він); null. */
  buzzerId: string | null;
  /** Дуель: дуелянт команди; null — команда не в дуелі. */
  duelistId: string | null;
  /** Капітан команди-дуелянта може вибрати дуелянта (declared / category). */
  canPickDuelist: boolean;
  /** Лобі, спосіб 'pick'. */
  canPick: boolean;
  /** Лобі: тур кубиків чекає мого кидка. */
  canRoll: boolean;
  /** Чернетка капітана для некапітанів (додає сервер, задача 5); рушій завжди дає null. */
  draft: Answer | null;
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
  /** Які позначки є в раунді (x2, x3 — у цьому порядку), без місць: для легенди. */
  marks: Exclude<CellMark, 'none'>[];
  /** Позначки незіграних клітинок приховані (сцена й гравці); ведучий — false. */
  marksHidden: boolean;
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

/** Останнє коригування від ведучого чи його скасування, для короткого сповіщення. */
export interface AdjustmentNotice {
  seq: number;
  /** Час сервера в мить коригування. */
  at: number;
  nickname: string;
  points: number;
  /** 12a: це скасування чи «Повернути»; без поля — бали від ведучого. */
  undo?: UndoNotice;
}

/** Скасування в сповіщенні (12a): nickname і points — гравець останнього рядка дії й сума його рядків у дії. */
export interface UndoNotice {
  /** «Повернути». */
  redo: boolean;
  /** Скільки різних учасників зачепила дія. */
  players: number;
  /** 1-базовий номер раунду. */
  round: number;
  /** 1-базовий номер запитання в раунді; null — дія на кілька запитань чи на бали поза запитаннями. */
  question: number | null;
}

/** Пульт: аркуш «Скасування балів» (12a). */
export interface UndoPanel {
  /** Раунди з рядками, найновіший першим. */
  rounds: UndoRound[];
}

export interface UndoRound {
  /** 0-базовий індекс раунду. */
  index: number;
  title: string;
  type: RoundType;
  /** Запитання з рядками, найновіше першим. */
  questions: UndoQuestion[];
  /** Бали ведучого поза запитаннями раунду (наприклад, на заставці), за seq. */
  loose: UndoRow[];
}

export interface UndoQuestion {
  /** Індекс у журналі запитань гри (plays). */
  index: number;
  /** 1-базовий номер у раунді. */
  number: number;
  text: string;
  rows: UndoRow[];
}

export interface UndoRow {
  kind: 'answer' | 'host';
  playerId: string;
  nickname: string;
  /** Бали рядка, як їх нараховано (без скасування). */
  points: number;
  /** answer — { question, playerId }; host — { seq }. */
  target: HostUndoTarget;
  /** seq скасування, що діє зараз; null — не скасовано. «Повернути» шле { seq: undoneBy }. */
  undoneBy: number | null;
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
  /** Цей гравець оголосив дуель, зараз етап category і не пауза. */
  canPick: boolean;
}

/** Хто який баф узяв на поточне запитання — значок біля імені. */
export interface BuffTag extends BlitzPlayer {
  kind: BuffKind;
}

/** Відкритий вибір у «Ва-банк» після закриття вікна (11e): took — забрав сам; stay — далі; auto — не вибрав, банк забрано за замовчуванням. */
export type WipeoutChoice = 'took' | 'stay' | 'auto';

/** Рядок драбини «Ва-банк»: гравець, стан, банк і рішення у вікні. */
export interface WipeoutRow extends BlitzPlayer {
  status: WipeoutStatus;
  /** in — банк зараз; took / survived — перенесено; burned — 0. */
  bank: number;
  /** Крок (0-базовий), на якому забрав, згорів чи доніс; null — у грі. */
  step: number | null;
  /** Лише у вікні рішення й лише для тих, хто в грі: сцена й телефони — pending / decided; пульт — pending / stay / take. Інакше null. */
  decision: 'pending' | 'decided' | 'stay' | 'take' | null;
  /** Екран рішень (11e): що вибрав гравець, який був у грі на початку вікна; усім однаково. Поки вікно відкрите й поза екраном — null. */
  choice: WipeoutChoice | null;
  /** Розкриття (11e): банк на початку поточного запитання, якщо гравець його грав; інакше null (і завжди null до розкриття). */
  prev: number | null;
}

/** «Ва-банк» (10g). */
export interface WipeoutInfo {
  /** Ціни запитань раунду в порядку гри. */
  ladder: number[];
  /** Поточна сходинка: запитання, що йде чи щойно розкрите (0-базове); -1 до першого. */
  current: number;
  /** Скільки сходинок пройдено й розкрито: на question / locked поточна не входить. */
  done: number;
  /** У порядку гравців. */
  rows: WipeoutRow[];
  /** Скільки зараз у грі (на question — хто може відповідати). */
  inCount: number;
  /** Вікно «Далі / Забрати»; null — вікна немає. */
  decide: { endsAt: number | null; remainingMs: number | null; decided: number; total: number } | null;
  /** Екран рішень після закриття вікна (11e). */
  decisions: boolean;
}

/** Сходинка драбини «Мільйонера». */
export interface LadderStep {
  level: number;
  safe: boolean;
  /** passed — пройдена; current — поточна (запитання йде чи щойно розкрите); failed — на ній помилка; ahead — попереду. */
  state: 'passed' | 'current' | 'failed' | 'ahead';
}

/**
 * Підказка драбини: ready — можна (за станом, без часу), used — використана раніше, active — узята на цьому запитанні;
 * off — гра без ведучого, а в поточного запитання немає тексту підказки (11g); не ввімкнені в раунді не показуються.
 */
export interface LadderLifelineView {
  kind: LifelineKind;
  state: 'ready' | 'used' | 'active' | 'off';
}

/** «Мільйонер» (10i). */
export interface LadderInfo {
  contestant: BlitzPlayer | null;
  pick: LadderPick;
  drawn: boolean;
  /** Знизу вгору, у порядку сходинок. */
  steps: LadderStep[];
  /** Поточна сходинка (0-базова); -1 до першого запитання. */
  current: number;
  timer: boolean;
  lifelines: LadderLifelineView[];
  /** 50/50 на поточному запитанні: прибрані варіанти (бачать усі); null — не брали. */
  fifty: string[] | null;
  /** Зал: voting — лише скільки проголосували; closed — підсумок для всіх. */
  audience: {
    state: 'voting' | 'closed';
    endsAt: number | null;
    remainingMs: number | null;
    voted: number;
    total: number;
    /** Лише після закриття; інакше null. */
    tally: { cast: number; counts: Record<string, number> } | null;
  } | null;
  /** Підказка ведучого на поточному запитанні: стан без тексту (текст — лише учасникові й пульту). */
  hint: 'waiting' | 'text' | 'aloud' | null;
  /** Вибір учасника: сцена й телефони — з locked; пульт — наживо. */
  contestantPick: string | null;
  /** Зал на поточному запитанні: answered — наживо; right — лише з розкриття. */
  hall: { answered: number; total: number; right: number | null };
  /** На leaderboard: pending — учасник вирішує; go / take — вирішено; null — поза рішенням. */
  decision: 'pending' | 'go' | 'take' | null;
  /** Підсумок драбини — лише з leaderboard; null — триває. */
  outcome: { kind: LadderOutcomeKind; passed: number; points: number } | null;
  /** Що учасник має зараз (останній пройдений рівень) і гарантовано (неспалимий). */
  banked: number;
  guaranteed: number;
}

/** Рядок «Вибування»: гравець, стан, коли вибув, відповідь привида, випробування. */
export interface SurvivalRow extends BlitzPlayer {
  /** edge — лише з розкриття до закриття випробування. */
  status: SurvivalStatus;
  /** Номер запитання раунду (з 1), після якого вибув; null — живий. */
  outAfter: number | null;
  /** Привид на поточному запитанні: correct — лише з розкриття (до того null); null — не привид або не відповідав. */
  ghost: { correct: boolean | null } | null;
  /** Відповідь на питання на виживання — лише після закриття випробування (і пульту теж); інакше null. */
  answer: Answer | null;
  /** Для «на межі»: pending / done, поки випробування відкрите (і пульт); safe / out — після закриття; інакше null. */
  trial: 'pending' | 'done' | 'safe' | 'out' | null;
  /** Удача: picked — вибрані двері (сцена й телефони — лише після закриття, пульт — наживо); auto — вибрано самі; trap — лише після закриття. */
  door: { picked: number | null; auto: boolean; trap: number | null } | null;
}

/** Випробування для всіх. */
export interface SurvivalTrialInfo {
  kind: TrialKind;
  fellBack: boolean;
  stage: 'open' | 'closed';
  endsAt: number | null;
  remainingMs: number | null;
  limitMs: number;
  /** Скільки на межі вже відповіли / вибрали і скільки їх усього. */
  done: number;
  total: number;
  /** Питання на виживання без правильної відповіді; null — удача. */
  question: PublicQuestion | null;
  /** Правильна відповідь питання — лише після закриття (без підказки); інакше null. */
  reveal: Question | null;
}

/** «Вибування» (10h). */
export interface SurvivalInfo {
  /** Поточне запитання раунду (0-базове); -1 до першого. */
  current: number;
  total: number;
  /** Скільки має лишитися, бонус, вид випробування й скільки питань на виживання ще є. */
  target: number;
  bonus: number;
  trialKind: TrialKind;
  trialsLeft: number;
  /** У порядку гравців. */
  rows: SurvivalRow[];
  aliveCount: number;
  ghostCount: number;
  /** Привиди на поточному запитанні: answered — наживо; right — лише з розкриття. */
  ghosts: { answered: number; right: number | null };
  /** Після розкриття; null до нього. */
  verdict: 'trial' | 'all_wrong' | 'all_right' | null;
  trial: SurvivalTrialInfo | null;
  /** Наступне «Далі» ведучого завершить раунд (живих ≤ target після вибування або запитань більше немає). */
  ending: boolean;
}

/** Останній узятий баф у грі, для сповіщення «Оля: 50/50». seq — номер використання в грі. */
export interface BuffNotice extends BlitzPlayer {
  seq: number;
  /** Час сервера в мить, коли баф узято. */
  at: number;
  kind: BuffKind;
  /** Запитання, на якому баф узято: сповіщення видно лише на ньому, не на заставці наступної клітинки. */
  questionIndex: number;
}

/** Гравець із додатковим часом без відповіді: особистий кінець пізніший за спільний, тож розкриття на нього чекатиме. */
export interface OvertimeRow extends BlitzPlayer {
  /** Особистий кінець (час сервера); null на паузі. */
  deadline: number | null;
  /** На паузі: залишок до особистого кінця; інакше null. */
  remainingMs: number | null;
}

export interface BuffSlot {
  kind: BuffKind;
  /** ready — можна взяти; active — узято на це запитання; used — використано раніше; blocked — не зараз. */
  state: 'ready' | 'active' | 'used' | 'blocked';
  /** Причина для blocked (і 'used' для used); null для ready й active. */
  block: BuffBlock | null;
}

export interface PlayerActiveBuff {
  kind: BuffKind;
  /** 50/50: прибрані варіанти (лише неправильні); інакше []. */
  removed: string[];
  retry: RetryStage | null;
  /** retry на again/choice: перша відповідь і її бали (choice — часткові); інакше null. */
  first: { answer: Answer | null; points: number } | null;
  /** hint: підказка; інакше null. */
  hint: PlayerHint | null;
  /** audience: голосування залу; інакше null. */
  votes: VoteTally | null;
  /** swap: гравець відповідає на запасне. */
  spare: boolean;
}

/** Підказка для гравця: waiting — ведучий думає; text — текст; aloud — ведучий підказав уголос. */
export interface PlayerHint {
  state: 'waiting' | 'text' | 'aloud';
  text: string | null;
}

/** Голосування залу для гравця з бафом: правильної відповіді тут немає. */
export interface VoteTally {
  /** Кінець голосування (час сервера); null на паузі. */
  endsAt: number | null;
  /** На паузі: залишок; інакше null. */
  remainingMs: number | null;
  /** Гравець уже відповів — голосування закрите. */
  closed: boolean;
  cast: number;
  /** Голоси за id варіанта (boolean — "true"/"false"). */
  counts: Record<string, number>;
  /** text, numeric: здогадки за кількістю; не більше 6. */
  guesses: { text: string; count: number }[];
}

/** Запрошення проголосувати: лише ім'я гравця з бафом і час. */
export interface VotePrompt {
  asker: BlitzPlayer;
  /** Кінець голосування (час сервера); null на паузі. */
  endsAt: number | null;
  /** На паузі: залишок; інакше null. */
  remainingMs: number | null;
}

/** Запит підказки для ведучого. */
export interface HintRequest extends BlitzPlayer {
  /** Мить, коли баф узято (час сервера). */
  at: number;
}

export interface PlayerBuffs {
  /** Усі дозволені бафи вікторини в порядку BUFF_KINDS — ряд однакового розміру в усіх станах. */
  slots: BuffSlot[];
  active: PlayerActiveBuff | null;
}

/** Слово «хмари» для меню автора (11g): лише те, що сцена показує, і сховане ним; без авторів слів. */
export interface AuthorCloudWord {
  key: string;
  text: string;
  count: number;
  hidden: boolean;
}

/** Варіант блефу для меню автора (11g): без позначки правди й авторів. */
export interface AuthorBluffOption {
  id: string;
  text: string;
}

/** Людина кімнати-автопілота для меню автора (11h): лише те, що видно всім у лобі. */
export interface AuthorPerson {
  id: string;
  nickname: string;
  connected: boolean;
}

/** Що бачить лише автор кімнати-автопілота (11g); решту — як усі гравці. */
export interface AuthorView {
  /** Розкриття «хмари слів»: слова сцени й сховані; інакше null. */
  cloud: AuthorCloudWord[] | null;
  /** Етап вибору блефу: неприбрані варіанти в порядку показу; інакше null. */
  bluff: AuthorBluffOption[] | null;
  /** Люди кімнати, крім автора, у порядку входу (соло — players, команди — teams.members); для «Вилучити гравця». */
  people: AuthorPerson[];
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
  /** «Ва-банк»: від intro до round_end свого раунду (і finished, якщо він останній); інакше null. */
  wipeout: WipeoutInfo | null;
  /** «Вибування»: від intro до round_end свого раунду (і finished, якщо він останній); інакше null. */
  survival: SurvivalInfo | null;
  /** «Мільйонер»: від intro до round_end свого раунду (і finished, якщо він останній); інакше null. */
  ladder: LadderInfo | null;
  /** Поступ ланцюжка; null поза запитанням-ланцюжком, а для сцени й гравців і у фіналі. */
  chain: ChainInfo | null;
  /** Прогрес сортування; null поза сортуванням, а для сцени й гравців і у фіналі. */
  sort: SortInfo | null;
  /** null поза стіною; див. WallInfo. */
  wall: WallInfo | null;
  /** null поза «100 до 1» (і на полі із заміною — там показано запасне); див. SurveyInfo. */
  survey: SurveyInfo | null;
  /** null поза блефом; див. BluffInfo. */
  bluff: BluffInfo | null;
  /** Останнє коригування балів ведучим; null — не було. */
  notice: AdjustmentNotice | null;
  /** Оголошена або поточна дуель; null — немає. */
  duel: DuelInfo | null;
  /** Бафи поточного запитання (question, locked, reveal); інакше []. */
  buffs: BuffTag[];
  /** Останній узятий баф у грі; null — не було. */
  buffNotice: BuffNotice | null;
  /** Остання покупка дебафу; null — не було або покупця чи ціль вилучено. */
  debuffNotice: DebuffNotice | null;
  /** Прибрані 50/50 варіанти вибравшого на клітинці поля, поки стоїть її запитання (question, locked, reveal, а на finished — після останньої клітинки раунду) — для всіх ролей; у класиці й без бафу []. */
  removed: string[];
  /** Заставка поточного етапу (round/final — intro, question/cell — question, duel — duel, podium — finished); інакше null. */
  splash: SplashView | null;
  /** Гравці з додатковим часом без відповіді (етап question) — від миті, коли баф узято, а не лише після спільного кінця; інакше []. */
  overtime: OvertimeRow[];
  /** Етап guide: сторінки й поточна; інакше null. */
  guide: GuideView | null;
  /** Пояснення для новачків увімкнено (пам'ятка раунду на intro). */
  newcomers: boolean;
  /** Командна гра (10j); null у соло-грі. */
  teams: TeamsView | null;
  /** Гру веде автопілот (11g): сцена покаже «Гру веде бот» (11h). */
  autopilot: boolean;
}

/** «Як грати»: поточна сторінка й усі сторінки цієї вікторини. */
export interface GuideView {
  page: number;
  pages: GuidePage[];
}

/** Заставка переходу: вид і час сервера початку й кінця; клієнт показує її, поки годинник сервера < until. */
export interface SplashView {
  kind: SplashKind;
  at: number;
  until: number;
}

/** Аркуш «Дебафи» на телефоні (9c). */
export interface PlayerShop {
  /** Дозволені дебафи з цінами, у порядку DEBUFF_KINDS. */
  items: { kind: DebuffKind; price: number }[];
  /** Суперники в порядку гравців; busy — на ньому вже чекає або діє дебаф; offline — не підключений (купити не можна). */
  targets: (BlitzPlayer & { busy: boolean; offline: boolean })[];
  /** null — купити можна (бали телефон порівнює з ціною сам); інакше чому ні. */
  block: ShopBlock | null;
}

/** Остання покупка дебафу в грі — для сповіщення «Оля насилає дебаф на гравця Петро»; виду немає навмисно. */
export interface DebuffNotice {
  /** seq коригування покупки. */
  seq: number;
  at: number;
  buyer: BlitzPlayer;
  target: BlitzPlayer;
}

export interface StageView extends BaseView {
  role: 'stage';
  players: LobbyPlayer[];
  reveal: Question | null;
  stats: RevealStats | null;
  /** Гравці з дебафом, що чекає або діє; лише імена, без виду. */
  debuffs: BlitzPlayer[];
  standings: Standing[] | null;
  /** Позначки на шкалі: лише етап reveal запитання-повзунка поза фіналом; за відстанню до правильного, далі за нікнеймом. Інакше null. */
  sliderMarks: SliderMark[] | null;
  /** Точки гравців: лише етап reveal запитання-точки; від найближчої, далі за нікнеймом. Інакше null. */
  pinMarks: PinMark[] | null;
  /** «Хмара слів»: лише на reveal, без схованих, не більше LIMITS.cloudShown найчастіших. Інакше null. */
  cloud: CloudWord[] | null;
  /** Скільки гравців написали слова (для підпису «Написали N»); null поза хмарою на reveal. */
  cloudVoters: number | null;
}

export interface PlayerResult {
  accepted: boolean;
  accuracy: number;
  grade: Grade;
  /** Бонус за серію; входить у points. */
  streakBonus: number;
  points: number;
}

/** Таблиця балів для кнопки «Таблиця»: full — усі гравці, інакше лише власний рядок (leaderboard 'end'). */
export interface PlayerTable {
  rows: Standing[];
  full: boolean;
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
    /** Власний стан у «Ва-банк»; null поза раундом. canDecide — вікно відкрите, гравець у грі, ще не вирішив, не пауза. */
    wipeout: { status: WipeoutStatus; bank: number; decision: 'stay' | 'take' | null; canDecide: boolean } | null;
    /** Власний стан у «Вибуванні»; null поза раундом. */
    survival: {
      status: SurvivalStatus;
      outAfter: number | null;
      /** Привид: правильність власної відповіді «для себе» — лише з розкриття. */
      ghostCorrect: boolean | null;
      /** На межі, питання відкрите, ще не відповів, не пауза (заставку відстежує клієнт за splash). */
      canAnswerTrial: boolean;
      trialAnswer: Answer | null;
      /** На межі, удача відкрита, ще не вибрав, не пауза. */
      canPickDoor: boolean;
      door: number | null;
      /** Після закриття випробування для того, хто був на межі. */
      result: 'safe' | 'out' | null;
      /** На round_end / finished — бонус, який гравець отримав; інакше null. */
      bonus: number | null;
    } | null;
    /** Власний стан у «Мільйонері»; null поза раундом. */
    ladder: {
      role: 'contestant' | 'hall';
      /** Учасник: можна брати підказки зараз (question, не відповів, не пауза; заставку й час перевіряє телефон). */
      canLifeline: boolean;
      /** Учасник: текст підказки ведучого або її стан. */
      hint: PlayerHint | null;
      /** Учасник: рішення відкрите. */
      canDecide: boolean;
      /** Зал: голосування залу закрилося — відповідати пізно. */
      hallClosed: boolean;
      /** Зал: скільки дасть правильна відповідь на поточне запитання (hallPoints). */
      hallPoints: number | null;
      /** Учасник на round_end / finished: виграш; інакше null. */
      won: number | null;
    } | null;
    /** null поза запитанням-ланцюжком. */
    chain: PlayerChain | null;
    /** null поза сортуванням і для того, хто не відповідає тут (глядач на полі). */
    sort: PlayerSort | null;
    /** null поза стіною і для того, хто тут не складає (глядач на полі). */
    wall: PlayerWall | null;
    /** Власні відповіді «100 до 1» зі збігами — лише на reveal і пізніше, для того, хто відповідав. Інакше null. */
    survey: { lines: PlayerSurveyLine[] } | null;
    /**
     * Власний блеф гравця: вигадка, id своїх варіантів (вибрати не можна), вибір;
     * truth і fooled — лише коли правду відкрито. null поза блефом.
     */
    bluff: { lie: string | null; own: string[]; pick: string | null; truth: boolean | null; fooled: number | null } | null;
    /** Власний дебаф, лише поки діє в поточному запитанні. since — мить відкриття запитання (час сервера); by — нікнейм покупця (null — ведучий або покупця вилучено). */
    debuff: { kind: DebuffKind; since: number; by: string | null } | null;
    /** null — у вікторині немає дебафів чи купівлю вимкнено, немає суперників або етап lobby/guide/finished. */
    shop: PlayerShop | null;
    /** null — у вікторині немає дуелей. */
    duel: PlayerDuel | null;
    /** Ряд бафів; null — у вікторині немає бафів, етап не question або гравець тут не відповідає з телефона. */
    buffs: PlayerBuffs | null;
    /** Власний особистий кінець, якщо він пізніший за спільний (етап question); інакше null. */
    overtime: { deadline: number | null; remainingMs: number | null } | null;
    /** Тип поточного запитання, якщо воно перше такого типу в грі й гравець відповідає з телефона; лише етап question і з поясненнями. Інакше null. */
    tip: Question['type'] | null;
    /** Відкрите голосування, у якому гравець може й ще не голосував; null — немає. */
    vote: VotePrompt | null;
  };
  reveal: Question | null;
  standings: Standing[] | null;
  /** Живий рейтинг без балів ще не розкритого запитання; null у лобі. */
  table: PlayerTable | null;
  /** Своя розбивка «+ / −» (11f): свій учасник рушія (у командній грі — команда), без балів, яких ще не видно в таблиці; null у лобі. Чужих розбивок телефон не отримує. */
  myBreakdown: ScoreBreakdown | null;
  /** Лише автор кімнати-автопілота (і в лобі); інакше null. */
  author: AuthorView | null;
  /** Командна гра: про себе (10j); null у соло-грі. */
  team: PlayerTeam | null;
}

export interface HostResponse {
  playerId: string;
  nickname: string;
  /** null — бліц, гравець натиснув, але не встиг відповісти. */
  answer: Answer | null;
  timeMs: number;
  /** null — голос у запитанні без балів (опитування, хмара): вердикту немає. */
  accepted: boolean | null;
  /** null — голос у запитанні без балів. */
  grade: Grade | null;
  streakBonus: number;
  points: number;
  overridden: boolean;
  buff: BuffKind | null;
  /** Запасне запитання, на яке дано відповідь (з правильною відповіддю); null — основне. */
  spare: Question | null;
  /** «Хто я?»: на якій підказці дано відповідь; інакше null. */
  clue: number | null;
}

/** Вердикт автоперевірки для пульта (11c): видно лише ведучому й ще до розкриття. */
export type LiveVerdict = 'correct' | 'partial' | 'wrong';

/** Поступ у рядку «Відповідей наживо» для типів, де відповідь — не один вибір (11c). */
export type LiveProgress =
  | { kind: 'chain'; solved: number; total: number; word: string | null; hints: number }
  | { kind: 'sort'; card: string | null; cardId: string | null; seq: number; sorted: number; total: number; misses: number }
  | { kind: 'wall'; found: number; groups: number; mistakes: number; locked: boolean; solved: boolean }
  | { kind: 'bluff'; stage: 'lies' | 'choice'; lie: string | null; pick: string | null }
  | { kind: 'survey'; ranks: (number | null)[] }
  | { kind: 'door'; picked: number | null }
  | { kind: 'duel'; tries: string[]; won: string | null };

/** Рядок «Відповідей наживо»: гравець, команда чи людина (голоси командної гри). */
export interface LiveRow {
  id: string;
  /** Нікнейм; для команди — назва команди. */
  nickname: string;
  connected: boolean;
  /** Подав відповідь (див. план 11c, «Що в рядку»). */
  answered: boolean;
  /** null — ще не відповів, усна відповідь або тип із поступом (див. progress). */
  answer: Answer | null;
  timeMs: number | null;
  verdict: LiveVerdict | null;
  /** Чекає дії ведучого: «Прийняти», ручна оцінка чи усна відповідь. */
  awaiting: boolean;
  buff: BuffKind | null;
  /** Запасне запитання (з правильною відповіддю), на яке гравець відповідає; null — основне. */
  spare: Question | null;
  /** «Хто я?»: на якій підказці дано відповідь; інакше null. */
  clue: number | null;
  /** Командна гра: нікнейм того, хто зараз діє за команду; соло — null. */
  actor: string | null;
  progress: LiveProgress | null;
  /** Фінал: ставка (null — ще не поставив) і ва-банк; окремо від progress, щоб її видно було й у ланцюжку, сортуванні тощо. Поза фіналом — null. */
  wager: { wager: number | null; allIn: boolean } | null;
}

/** Згорнутий список під рядками: привиди «Вибування» чи зал «Мільйонера». */
export interface LiveAside {
  kind: 'ghosts' | 'hall';
  answered: number;
  total: number;
  rows: LiveRow[];
}

/** «Відповіді наживо» (11c): лише пульт; null поза відповіддю. */
export interface HostLive {
  /** answers — звичайні рядки; blitz — черга бліцу (пульт малює її з HostView.blitz); trial — випробування «на межі»; duel — дуелянти. */
  kind: 'answers' | 'blitz' | 'trial' | 'duel';
  /** Скільки з rows відповіли / усього rows. */
  answered: number;
  total: number;
  /** Усі, хто має відповідати, у порядку гравців (у бліці — теж у порядку гравців). */
  rows: LiveRow[];
  aside: LiveAside | null;
}

export interface HostPlayer extends LobbyPlayer {
  score: number;
  /** fired — діє в поточному запитанні; інакше чекає. */
  debuff: { kind: DebuffKind; fired: boolean; by: string | null } | null;
}

/** Вікно мінімального часу перед кроком ведучого (11b): миті сервера; раніше за until крок не діє. */
export interface PaceWindow { from: number; until: number }
/** Вікна кроків ведучого: «Далі» (і «Відкрити всі»), «Закрити», «Пропустити хід»; null — без очікування. */
export interface HostPace { next: PaceWindow | null; lock: PaceWindow | null; skip: PaceWindow | null }

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
  /** Що дозволено у вікторині: пульт показує лише ці дебафи. */
  allowed: { debuffs: DebuffKind[]; buffs: BuffKind[] };
  /** Запити підказки без відповіді на поточному запитанні (етап question), у порядку гравців. */
  hints: HintRequest[];
  standings: Standing[];
  /** Розбивки «+ / −» усіх учасників рушія за id (11f); лише пульт; {} у лобі. */
  breakdowns: Record<string, ScoreBreakdown>;
  /** Як у сцени, але з етапу question (ведучий і так бачить відповіді). */
  sliderMarks: SliderMark[] | null;
  /** Як у сцени, але з етапу question. */
  pinMarks: PinMark[] | null;
  /** Уся хмара з question/locked/reveal, разом зі схованими. Інакше null. */
  cloud: HostCloudWord[] | null;
  /** Тексти «100 до 1» поточного раунду, які пропущено (хмара без слів, запасних рядків немає). */
  surveySkipped: string[];
  /** Мінімальний час кроків (11b); лише пульт. */
  pace: HostPace;
  /** Відповіді наживо (11c); лише пульт. */
  live: HostLive | null;
  /** Аркуш «Скасування балів» (12a); null у лобі, після кінця гри й без ведучого. */
  undo: UndoPanel | null;
}

export type GameView = StageView | PlayerView | HostView;

/** Маска слова ланцюжка: відкрита літера або null для закритої; розділювачі відкриті. */
export type ChainMask = (string | null)[];
