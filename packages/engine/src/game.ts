import {
  DEFAULT_ANSWER_WINDOW,
  LIMITS,
  type Answer,
  type AnswerMode,
  type CellKind,
  type CellPenalty,
  type AdjustmentSource,
  type BuffKind,
  type DebuffKind,
  type DuelStage,
  type ErrorCode,
  type Grade,
  type Phase,
  type Question,
  type Quiz,
  type BoardRound,
  type FinalRound,
  type LadderOutcomeKind,
  type Round,
  type TeamForm,
  type TrialKind,
  DEFAULT_TEAM_FORM,
  guidePages,
  newcomersOn,
  rulesOf,
  answerWindowMs,
  hallPoints,
  proximityPartial,
  isUnscored,
} from '@quiz/shared';
// adjust.ts, buffs.ts, debuffs.ts і duel.ts імпортують цей файл, а цей файл — їх; звертання лише під час виклику функцій.
import { adjustmentTotal } from './adjust';
import {
  answerLimitMs,
  applyBuff,
  buffOf,
  dropBallots,
  finishRetry,
  holdFirstTry,
  questionFor,
  settleRetries,
  shiftBuffClocks,
  type BuffPlay,
} from './buffs';
import { applyVerdict, attemptsUsed, blitzDone, blitzRulesOf, isInstant, settleQueue, withPlay } from './blitz';
import { withCellPenalty } from './board-cells';
import { dicePending, dropFromDice } from './board-dice';
import { advanceTurn, BOARD_AWAY_MS, boardPoints, chooserOf, dropFromCircle, enterBoard, hasActiveCells, initBoard } from './board-turns';
import { chainDone, scoreChain } from './chain';
import { scoreSort, shiftSortLocks } from './sort';
import { scoreWall, wallPresent } from './wall';
import { submitVote } from './votes';
import { fireDebuffs, shiftDebuffClocks, spendDebuffs } from './debuffs';
import { advanceDuel, beginDuel, dropDuel, duelDue, tickDuel } from './duel';
import { checkAnswer, gradeOf, paceFactor, paysForTime, verdictOf } from './check';
import { scoreSurvey, stepSurvey, surveyBoard, surveyPlayOf } from './survey';
import { bluffAuto, bluffOrder, bluffPlayOf, scoreBluff, startChoice, stepBluff } from './bluff';
import { cluesByHost, cluesOpen, openDueClues } from './clues';
import { clockOf, holdAt, pendingOf, releaseStaleHold, shiftQueue, thaw } from './hold';
import { normalizeText } from './normalize';
import { answerPoints, finalPoints, speedFactor, streakBonus } from './score';
import { splitBank, type BankOutcome } from './bank';
import { closesAt, isTimed, limitMsOf, timedPlay, timeOver, timeOverFor, trimOvertime } from './timing';
import { presentPlayers } from './present';
import { closeDecision, decisionOpen, dropUnstarted, markWipeoutEnd, openDecision, settleDecision, submitWipeoutAnswer, wipeoutIn, withWipeoutPoints } from './wipeout';
import {
  awardSurvivalBonus,
  closeTrial,
  isGhost,
  openTrialOrBoard,
  overrideTrial,
  settleTrial,
  submitGhostAnswer,
  survivalAlive,
  survivalOver,
  trialOpen,
} from './survival';
import {
  audienceOpen,
  closeAudience,
  decisionPending,
  drawContestant,
  inLadderRound,
  ladderAnswered,
  ladderPlayOf,
  passedSteps,
  settleAudience,
  settleStep,
  shiftLadderClocks,
  stopLadder,
  submitLadderAnswer,
} from './ladder';
import { addMember, dropMember, formTeams, memberConnected, memberOf, presentMembers, teamsOn, withoutDuelists, withoutTeam } from './teams';
import { notStarted, questionSplashKind, questionSplashMs, shiftSplash, splashLead, withSplash, type Splash } from './splash';

export interface PlayerState {
  id: string;
  nickname: string;
  connected: boolean;
  score: number;
  totalTimeMs: number;
  /** Поточна серія правильних відповідей у поточному раунді. */
  streak: number;
}

export interface AnswerRecord {
  /** null — бліц, гравець натиснув, але не встиг відповісти. */
  answer: Answer | null;
  timeMs: number;
  accepted: boolean;
  accuracy: number;
  grade: Grade;
  /** Бали за відповідь без бонусу серії, зі штрафом. */
  basePoints: number;
  streakBonus: number;
  /** basePoints + streakBonus. */
  points: number;
  overridden: boolean;
  /** Баф, узятий на це запитання; бали вже з ним. Немає — без бафу. */
  buff?: BuffKind;
  /** Відповідь на запасне запитання з цим id; немає — на основне. */
  spare?: string;
}

/** Натискання «Відповісти» в бліці або відповідь у миттєвому бліці. */
export interface BuzzEntry {
  playerId: string;
  /** Час натискання. */
  at: number;
  /** Від відкриття запитання до натискання (бліц з кнопкою) або до відповіді (миттєвий), мс; паузи й утримання його не змінюють. */
  timeMs: number;
  /** Кінець вікна відповіді; null — до кінця таймера запитання. */
  deadline: number | null;
  answer: Answer | null;
}

/** Розглянута спроба в бліці. */
export interface Attempt {
  playerId: string;
  /** null — не встиг відповісти. */
  answer: Answer | null;
  /** Від відкриття запитання до натискання. */
  timeMs: number;
  grade: 'correct' | 'wrong';
  /** round(P × множник) за правильну, штраф або 0 за неправильну; без бонусу серії. */
  points: number;
}

/**
 * Одне зігране запитання; ключ answers є id гравця. У бліці answers містить підсумок усіх спроб
 * гравця, а blitz — чергу натискань і розглянуті спроби.
 */
export interface Play {
  roundIndex: number;
  question: Question;
  answers: Record<string, AnswerRecord>;
  blitz?: BlitzPlay;
  /** Сума змін часу ведучим («±15 с»), мс. */
  extraMs: number;
  /** Клітинка поля, з якої відкрито запитання. */
  board?: BoardPlay;
  /** Лише в запитанні раунду фіналу. */
  final?: FinalPlay;
  /** Лише в запитанні-ланцюжку; гравця тут немає, поки він не торкався ланцюжка. */
  chain?: Record<string, ChainProgress>;
  /** Лише в запитанні-сортуванні; гравця тут немає, поки він не зробив ходу. */
  sort?: Record<string, SortProgress>;
  /** Бафи гравців на цьому запитанні; гравця тут немає, поки він не брав бафу. */
  buffs?: Record<string, BuffPlay>;
  /** Особистий додатковий час понад спільний endsAt, мс (додатковий час; у 8b — заміна запитання). */
  overtime?: Record<string, number>;
  /** «Хто я?»: скільки підказок відкрито (від 1); лише в такому запитанні (10c). */
  clues?: number;
  /** Лише в запитанні-стіні; гравця тут немає, поки він не надіслав жодного вибору (10d). */
  wall?: Record<string, WallProgress>;
  /** «Хмара слів»: ключі cloudKey, які ведучий сховав (10d). */
  cloudHidden?: string[];
  /** «100 до 1»: звідки дошка й скільки рядків відкрито на розкритті; збудована дошка — у question.rows (10e). */
  survey?: SurveyPlay;
  /** Блеф: фаза, зерно, вигадки, варіанти, вибори й скільки варіантів відкрито на розкритті (10f). */
  bluff?: BluffPlay;
  /** «Ва-банк»: рішення після цього запитання й позначка кінця раунду (10g). */
  wipeout?: WipeoutPlay;
  /** «Вибування»: відповіді привидів, хто «на межі», випробування й позначка кінця раунду (10h). */
  survival?: SurvivalPlay;
  /** «Мільйонер»: учасник, сходинка, підказки, рішення й підсумок драбини (10i). */
  ladder?: LadderPlay;
  /** Бліц у командній грі: хто з учасників команди натиснув останнім; ключ — id команди (10j). */
  buzzers?: Record<string, string>;
}

/** Учасник командної гри (людина); у state.players після старту — команди. */
export interface TeamMember {
  /** Id гравця кімнати (токен веде до нього). */
  id: string;
  nickname: string;
  connected: boolean;
  /** null — ще без команди (лише в лобі). */
  teamId: string | null;
}

/** Командна гра (10j). */
export interface TeamsState {
  /** Спосіб формування команд у лобі. */
  form: TeamForm;
  /** Команди в порядку налаштувань; color — позиція в налаштуваннях (0…5), не змінюється після старту. */
  list: { id: string; name: string; color: number }[];
  /** Учасники в порядку приходу; порядок у команді — цей самий. */
  members: TeamMember[];
  /** Капітан, якого вибрав ведучий; немає ключа — перший за порядком. */
  captains: Record<string, string>;
  /** Кидки кубиків у лобі; null — кидків не було або їх скасовано. */
  dice: DiceState | null;
  /** Дуелянт команди в поточній дуелі; немає ключа — капітан. Очищується, коли дуелі немає. */
  duelists: Record<string, string>;
}

/** «Мільйонер»: учасник драбини поточного раунду. */
export interface LadderState {
  /** Учасник; null — ще не вибрано. */
  contestantId: string | null;
  /** Вибрано жеребом чи за найменшими балами (кнопкою «Вибрати учасника»), а не ведучим вручну. */
  drawn: boolean;
}

/** «Мільйонер» у журналі. */
export interface LadderPlay {
  contestantId: string;
  /** Сходинка (0-базова) = номер запитання в раунді. */
  step: number;
  /** Сума рівня сходинки (знімок round.levels[step]). */
  level: number;
  /** Знімок round.timer: false — запитання без таймера (timedPlay читає його без стану). */
  timed: boolean;
  /** Підказки, узяті на цьому запитанні. */
  lifelines: LadderLifelines;
  /** Рішення після цього запитання; null — ще не вирішено або не пропонувалось. */
  decision: 'go' | 'take' | null;
  /** Чим скінчилася драбина на цьому запитанні; null — триває. */
  outcome: LadderOutcome | null;
}

export interface LadderLifelines {
  /** 50/50: прибрані неправильні варіанти. */
  fifty?: { removed: string[]; at: number };
  /** Зал: кінець голосування, закрито чи ні, відповіді залу в мить закриття (до того {}). */
  audience?: { endsAt: number; closed: boolean; ballots: Record<string, Answer>; at: number };
  /** Підказка ведучого: text null — чекає ведучого; aloud — підказав уголос. */
  hint?: { text: string | null; aloud: boolean; at: number };
}

export interface LadderOutcome {
  kind: LadderOutcomeKind;
  /** Скільки сходинок пройдено. */
  passed: number;
  /** Виграш (ladderPrize). */
  points: number;
}

/** «Вибування» в журналі. */
export interface SurvivalPlay {
  /** Відповіді привидів «для себе» за id: поза answers, тож ні балів, ні серій, ні точності. */
  ghosts: Record<string, GhostAnswer>;
  /** Хто був «на межі» — фіксується на «Далі» після розкриття; null — ще не вирішено. */
  edge: string[] | null;
  /** Випробування після цього запитання; null — його не було (усі вціліли, помилилися всі або ще не вирішено). */
  trial: SurvivalTrial | null;
  /** Раунд закінчився на цьому запитанні: бонус нараховано. */
  end: boolean;
}

export interface GhostAnswer {
  answer: Answer;
  /** grade 'correct' за verdictOf. */
  correct: boolean;
  timeMs: number;
}

/** Випробування «на межі». */
export interface SurvivalTrial {
  kind: TrialKind;
  /** Мало бути питання, але питання на виживання скінчилися. */
  fellBack: boolean;
  stage: 'open' | 'closed';
  /** Питання на виживання: id з round.trials; null — удача. */
  questionId: string | null;
  /** Порядок варіантів питання; [] для удачі й без варіантів. */
  presented: string[];
  /** Відповіді на питання за id. */
  answers: Record<string, TrialAnswer>;
  /** Удача: пастка (0…DOOR_COUNT − 1) кожного «на межі». */
  traps: Record<string, number>;
  /** Удача: двері, які вибрав гравець. */
  doors: Record<string, number>;
  /** Удача: двері, що виберуться самі, якщо гравець не вибрав. */
  fallback: Record<string, number>;
  /** Хто вибув; заповнюється при закритті (і після оцінки ведучого). */
  out: string[];
}

export interface TrialAnswer {
  answer: Answer;
  correct: boolean;
  timeMs: number;
  overridden: boolean;
}

/** «Ва-банк» у журналі. */
export interface WipeoutPlay {
  /** Хто забрав банк після цього запитання (сам чи за замовчуванням), у порядку рішень. */
  took: string[];
  /** Хто вибрав «Далі» після цього запитання. */
  stay: string[];
  /** Раунд закінчився на цьому запитанні: банки тих, хто в грі, перенесено в бали. */
  end: boolean;
  /** Хто забрав банк за замовчуванням, коли вікно закрилося (11e); лише непорожній; немає — усі вирішили самі або стан до 11e. */
  auto?: string[];
}

/** Блеф у грі. */
export interface BluffPlay {
  /** lies — гравці пишуть вигадки; choice — вибирають варіант (після закриття лишається choice). */
  stage: 'lies' | 'choice';
  /** Зерно для вибору запасних і порядку варіантів (тягне openQuestion з rng). */
  seed: number;
  /** Вигадки за id гравця. */
  lies: Record<string, BluffLie>;
  /** Варіанти в порядку показу; [] у фазі вигадок. */
  options: BluffOption[];
  /** Вибори за id гравця. */
  picks: Record<string, BluffPick>;
  /** Скільки варіантів відкрито на розкритті (за bluffOrder). */
  shown: number;
}

/** Вигадка гравця: текст після чистки й мить надсилання. */
export interface BluffLie {
  text: string;
  at: number;
}

/** Вибір гравця: варіант і час від старту фази вибору, мс. */
export interface BluffPick {
  optionId: string;
  timeMs: number;
}

/** Варіант фази вибору. */
export interface BluffOption {
  /** b1…bN у порядку показу. */
  id: string;
  text: string;
  kind: 'truth' | 'lie' | 'spare';
  /** Автори вигадки гравців у порядку гравців; [] — правда чи запасна. */
  authors: string[];
  /** Прибрано ведучим. */
  removed: boolean;
}

/** Дошка «100 до 1» у грі. */
export interface SurveyPlay {
  /** cloud — дошка з хмари слів; host — дошка ведучого (зокрема запасна, коли хмара порожня). */
  source: 'host' | 'cloud';
  /** Скільки рядків відкрито на сцені знизу вгору (етап reveal). */
  shown: number;
}

/** Поступ гравця на стіні. */
export interface WallProgress {
  /** Id знайдених груп у порядку знаходження; остання автоматична теж тут. */
  found: string[];
  mistakes: number;
  /** Неправильні вибори: відсортовані id плиток через кому. */
  tried: string[];
}

/** Поступ гравця в сортуванні. */
export interface SortProgress {
  /** Слова, що лишилися, у порядку черги гравця; голова — поточна картка. */
  queue: string[];
  /** Правильно відсортовані слова в порядку ходів. */
  sorted: string[];
  misses: number;
  /** До цієї миті (час сервера) гравець підвисає; null — ні. */
  lockedUntil: number | null;
  /** Слово останньої помилки; null після правильного ходу. */
  missed: string | null;
  /** Помилки на кожному слові (11d); немає — стан до 11d, позначок «✗N» на розкритті немає. */
  wordMisses?: Record<string, number>;
  /** Категорія, у яку пішла остання помилка (11d), — зона трусіння в глядачів; лише разом із missed. */
  missedInto?: string;
}

/** Поступ гравця в ланцюжку слів. */
export interface ChainProgress {
  /** Скільки прихованих слів уже вгадано. */
  solved: number;
  /** Скільки літер поточного слова відкрито; від 1 (перша літера). */
  shown: number;
  hints: number;
}

/** Фінал поточного раунду; null поза раундом фіналу. */
export interface FinalState {
  /** Межа ставки: max(0, рахунок) на вході в етап wager; бали від ведучого під час ставок її оновлюють. */
  limits: Record<string, number>;
  /** Ставки; гравця без ставки тут немає. */
  wagers: Record<string, number>;
  /** Хто натиснув «Ва-банк»: ставка йде за межею, поки триває етап ставок. */
  allIn: string[];
  /** Порядок розкриття; заповнюється на вході в reveal. */
  order: string[];
  /** Скільки гравців з order уже розкрито. */
  shown: number;
  /** Банк розподілено (крок після останнього розкриття); у класиці не використовується. */
  split: boolean;
}

/** Запитання фіналу в журналі. */
export interface FinalPlay {
  /** Ставка кожного гравця на мить відкриття запитання (без ставки — 0). */
  wagers: Record<string, number>;
  /** Хто на мить відкриття запитання поставив усю межу (> 0), у порядку гравців. */
  allIn: string[];
  /** Кого ведучий уже оцінив вручну (check 'manual'). */
  graded: string[];
}

/** Кидки кубиків на заставці раунду поля. */
export interface DiceState {
  /** Усі кидки гравця по черзі: перший тур, далі перекидання; немає ключа — ще не кидав. */
  throws: Record<string, number[]>;
  /** Учасники поточного туру в порядку приєднання; [] — порядок визначено. */
  tour: string[];
  /** Учасники туру, які ще не кинули в ньому. */
  waiting: string[];
  /** Номер туру: 1 — усі, далі — перекидання між тими, хто зрівнявся. */
  tourNo: number;
}

/** Стан ходів у раунді поля. */
export interface BoardState {
  /** Порядок поточного кола. */
  circle: string[];
  /** Скільки гравців поточного кола вже походили (вибрали клітинку або пропустили хід). */
  done: number;
  /** Номер поточного кола в раунді, від 1. */
  circleNo: number;
  /** null — кубики не кидають (порядок за приєднанням або ручний). */
  dice: DiceState | null;
  /** Відколи гравець, чий хід, відключений; null — на місці, пауза або не етап board. */
  awaySince: number | null;
}

/** Запитання, відкрите з клітинки поля. */
export interface BoardPlay {
  cellId: string;
  /** Хто вибрав клітинку; відповідає лише він. */
  chooserId: string;
  /** points запитання. */
  price: number;
  /** Множник клітинки: x2 → 2, x3 → 3, інакше 1. */
  multiplier: 1 | 2 | 3;
  /** Тип, спосіб відповіді й штраф клітинки, знімені з неї в мить відкриття. */
  kind: CellKind;
  answerMode: AnswerMode;
  /** Для kind 'blitz'. */
  penalty: CellPenalty;
  /** Відповідь з телефону, що чекає на рішення ведучого («Прийняти», оцінка або «Перевибрати»); інакше null. */
  answer: Answer | null;
  /** Варіант, який гравець назвав уголос, позначений ведучим (лише звичайна усна клітинка); лише для показу. */
  named?: Answer;
}

/** Бліц у межах одного запитання. */
export interface BlitzPlay {
  queue: BuzzEntry[];
  attempts: Attempt[];
  /** Хто натискав на цьому запитанні, без повторів; потрібне для серій, бо скинуті натискання зникають. */
  buzzed: string[];
  /** Відповіді, які не розглядали (після переможця або закриття), у порядку черги; лише для показу, без балів. */
  dropped: BuzzEntry[];
}

/** Коригування рахунку поза відповідями: бали від ведучого, ставки дуелей, покупки дебафів. */
export interface ScoreAdjustment {
  /** Зростаючий номер у межах гри, від 1. */
  seq: number;
  playerId: string;
  points: number;
  roundIndex: number;
  /** Скільки запитань журналу було закрито в мить коригування. */
  afterQuestion: number;
  source: AdjustmentSource;
  at: number;
  /** Лише для source 'debuff': кому куплено дебаф. */
  target?: string;
  /** Лише для source 'debuff': який дебаф куплено. */
  debuff?: DebuffKind;
}

/** Дебаф на гравця: від ведучого або куплений іншим гравцем. */
export interface DebuffState {
  kind: DebuffKind;
  /** Індекс у plays запитання, у якому дебаф спрацював; null — чекає. */
  firedAt: number | null;
  /** Мить спрацювання; null — чекає. */
  since: number | null;
  /** Хто купив (id гравця); null — наслав ведучий. */
  by: string | null;
}

/** Одне запитання дуелі. */
export interface DuelQuestionPlay {
  questionId: string;
  /** Неправильні спроби кожного дуелянта в порядку надсилання. */
  tries: Record<string, string[]>;
  /** Хто першим відповів правильно; null — ще ніхто або ніхто. */
  winnerId: string | null;
  /** Правильна відповідь переможця, як він її написав. */
  answer: string | null;
  /** Від відкриття запитання до правильної відповіді, мс. */
  timeMs: number | null;
}

/** Дуель між двома гравцями. */
export interface DuelState {
  challengerId: string;
  opponentId: string;
  stage: DuelStage;
  /** Етап гри, з якого почалася дуель; туди гра повертається. null, поки дуель лише оголошена. */
  returnPhase: Phase | null;
  categoryId: string | null;
  /** Скільки запитань зіграти: min(questionsPerDuel, залишок категорії) на мить вибору; до вибору 0. */
  total: number;
  /** Зіграні запитання й поточне (останнє); пропущені сюди не потрапляють. */
  questions: DuelQuestionPlay[];
  /** Переможець дуелі на етапі result; null — нічия або ще не result. */
  winnerId: string | null;
}

export interface GameState {
  quiz: Quiz;
  phase: Phase;
  /** -1 у лобі. */
  roundIndex: number;
  /** Індекс у plays: поточне або останнє зігране запитання; -1 до першого. */
  questionIndex: number;
  players: PlayerState[];
  /** Журнал запитань у порядку гри. */
  plays: Play[];
  /** Порядок варіантів або елементів поточного запитання, однаковий для всіх. */
  presented: string[];
  startedAt: number | null;
  endsAt: number | null;
  paused: boolean;
  /** Залишок часу запитання під час паузи. */
  remainingMs: number | null;
  /** Момент, коли гру поставили на паузу; null без паузи. */
  pausedAt: number | null;
  /** Ходи раунду поля; null поза раундом поля. */
  board: BoardState | null;
  /** Відколи годинник запитання стоїть, бо відповідь чекає на ведучого; null — іде. */
  heldAt: number | null;
  /** Фінал поточного раунду; null поза раундом фіналу. */
  final: FinalState | null;
  /** Журнал коригувань рахунку в порядку seq. */
  adjustments: ScoreAdjustment[];
  /** Останній виданий seq; після вилучення гравця номери не повторюються. */
  adjustmentSeq: number;
  /** Останній виданий seq бафу; після вилучення гравця номери не повторюються. */
  buffSeq: number;
  /** Дебафи за id гравця: що чекають на наступне запитання або діють у поточному. */
  debuffs: Record<string, DebuffState>;
  /** Оголошена або поточна дуель; null — немає. */
  duel: DuelState | null;
  /** Хто вже оголошував дуель у цій грі. */
  duelsDeclared: string[];
  /** id запитань пулу, які вже з'являлися в дуелях цієї гри. */
  duelUsed: string[];
  /** Id запасних запитань, уже виданих у цій грі; вилучення гравця їх не повертає. */
  sparesUsed: string[];
  /** Чи грає ця гра заставки переходів. */
  transitions: boolean;
  /** Поточна або остання заставка; null — не було або transitions вимкнено. */
  splash: Splash | null;
  /** Сторінка «Як грати» (0-базова); поза етапом guide — 0. */
  guidePage: number;
  /**
   * Хто був на зв'язку в мить збереження кімнати перед перезапуском сервера (9b): поки гравець не повернувся
   * (або його не вилучили), його чекають, як підключеного, — «усі відповіли» не закриває запитання без нього.
   */
  awaiting: string[];
  /** «Мільйонер»: учасник драбини; ключ є лише в раунді «Мільйонер» (від intro до round_end) (10i). */
  ladder?: LadderState;
  /** Командна гра: спосіб формування, команди, учасники, капітани, кубики лобі, дуелянти; ключ є лише в командній грі (10j). */
  teams?: TeamsState;
  /** Мить останньої зміни кроку (11b): ставить сервер через stamp; без ключа мінімального часу немає (стан до 11b, тести рушія). */
  stepAt?: number;
}

export interface GameOptions {
  /** Заставки переходів (8c); вимкнено — час іде як до 8c (тести рушія й сервера). */
  transitions?: boolean;
  /** Id команд у порядку налаштувань (сервер дає uuid); без поля — t1…t6. Ігнорується без settings.teams. */
  teamIds?: string[];
}

export type Result = { ok: true; state: GameState } | { ok: false; error: ErrorCode };

export const ok = (state: GameState): Result => ({ ok: true, state });
export const fail = (error: ErrorCode): Result => ({ ok: false, error });

export function createGame(quiz: Quiz, options: GameOptions = {}): GameState {
  const teams = quiz.settings.teams;
  return {
    quiz,
    phase: 'lobby',
    roundIndex: -1,
    questionIndex: -1,
    players: [],
    plays: [],
    presented: [],
    startedAt: null,
    endsAt: null,
    paused: false,
    remainingMs: null,
    pausedAt: null,
    board: null,
    heldAt: null,
    final: null,
    adjustments: [],
    adjustmentSeq: 0,
    buffSeq: 0,
    debuffs: {},
    duel: null,
    duelsDeclared: [],
    duelUsed: [],
    sparesUsed: [],
    transitions: options.transitions ?? false,
    splash: null,
    guidePage: 0,
    awaiting: [],
    ...(teams === undefined
      ? {}
      : {
          teams: {
            form: DEFAULT_TEAM_FORM,
            list: teams.names.map((name, i) => ({ id: options.teamIds?.[i] ?? `t${i + 1}`, name, color: i })),
            members: [],
            captains: {},
            dice: null,
            duelists: {},
          },
        }),
  };
}

export function recordOf(state: GameState, playIndex: number, playerId: string): AnswerRecord | undefined {
  const byPlayer = state.plays[playIndex]?.answers;
  return byPlayer !== undefined && Object.hasOwn(byPlayer, playerId) ? byPlayer[playerId] : undefined;
}

export function currentRound(state: GameState): Round | null {
  return state.quiz.rounds[state.roundIndex] ?? null;
}

/** 0-базовий номер поточного запитання в раунді; -1, поки в раунді не було запитань. */
export function roundQuestionNumber(state: GameState): number {
  const upToCurrent = state.plays.slice(0, state.questionIndex + 1);
  return upToCurrent.filter((play) => play.roundIndex === state.roundIndex).length - 1;
}

/**
 * Записує відповідь гравця в поточне запитання; баф гравця на ньому застосовується тут, рівно раз.
 * Внутрішня функція рушія: експортовано для buffs.ts, не для сервера.
 */
export function withRecord(state: GameState, playerId: string, record: AnswerRecord): GameState {
  const plays = state.plays.map((play, index) =>
    index === state.questionIndex ? { ...play, answers: { ...play.answers, [playerId]: applyBuff(record, buffOf(play, playerId)) } } : play,
  );
  return { ...state, plays };
}

export function addPlayer(state: GameState, player: { id: string; nickname: string }): Result {
  if (state.phase !== 'lobby') return fail('wrong_phase');
  const nickname = player.nickname.replace(/\s+/g, ' ').trim();
  if (nickname.length < LIMITS.nicknameMin || nickname.length > LIMITS.nicknameMax) return fail('nickname_invalid');
  // Командна гра: люди — учасники, а не гравці рушія.
  if (teamsOn(state)) return addMember(state, { id: player.id, nickname });
  if (state.players.length >= LIMITS.maxPlayers) return fail('room_full');
  const key = normalizeText(nickname);
  if (state.players.some((p) => normalizeText(p.nickname) === key)) return fail('nickname_taken');
  const added: PlayerState = { id: player.id, nickname, connected: true, score: 0, totalTimeMs: 0, streak: 0 };
  return ok({ ...state, players: [...state.players, added] });
}

/**
 * Вилучення гравця. Командна гра: id людини — dropMember (остання людина забирає команду);
 * id команди — команда зникає разом зі своїми людьми, а далі як гравець. now (сервер) — для відліку відсутності команди,
 * що лишилася без людей на зв'язку; соло-гра його не використовує.
 */
export function removePlayer(state: GameState, playerId: string, now?: number): Result {
  if (teamsOn(state)) {
    if (memberOf(state, playerId) !== undefined) return dropMember(state, playerId, now);
    if (state.players.some((p) => p.id === playerId)) return removeFromGame(withoutTeam(state, playerId), playerId);
  }
  return removeFromGame(state, playerId);
}

function removeFromGame(state: GameState, playerId: string): Result {
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  // «Мільйонер»: учасник, вилучений посеред драбини, зупиняє її без виграшу; запитання, що йде, зал дограє.
  const ladderPlay = ladderPlayOf(state);
  const ladderStop =
    ladderPlay !== null && ladderPlay.ladder.contestantId === playerId && ladderPlay.ladder.outcome === null
      ? { kind: 'stopped' as const, passed: passedSteps(state, state.phase !== 'question'), points: 0 }
      : null;
  const plays = state.plays.map((play, index): Play => {
    const { [playerId]: _removed, ...rest } = play.answers;
    const kept: Play = { ...play, answers: rest };
    if (play.chain !== undefined) {
      const { [playerId]: _progress, ...chain } = play.chain;
      kept.chain = chain;
    }
    if (play.sort !== undefined) {
      const { [playerId]: _progress, ...sort } = play.sort;
      kept.sort = sort;
    }
    if (play.wall !== undefined) {
      const { [playerId]: _progress, ...wall } = play.wall;
      kept.wall = wall;
    }
    if (play.bluff !== undefined) {
      const { [playerId]: _lie, ...lies } = play.bluff.lies;
      const { [playerId]: _pick, ...picks } = play.bluff.picks;
      const options = play.bluff.options.map((o) => ({ ...o, authors: o.authors.filter((id) => id !== playerId) }));
      kept.bluff = { ...play.bluff, lies, picks, options };
    }
    if (play.wipeout !== undefined) {
      const without = (ids: string[]) => ids.filter((id) => id !== playerId);
      kept.wipeout = {
        ...play.wipeout,
        took: without(play.wipeout.took),
        stay: without(play.wipeout.stay),
        ...(play.wipeout.auto === undefined ? {} : { auto: without(play.wipeout.auto) }),
      };
    }
    if (play.survival !== undefined) {
      const without = (ids: string[]) => ids.filter((id) => id !== playerId);
      const { [playerId]: _ghost, ...ghosts } = play.survival.ghosts;
      const edge = play.survival.edge === null ? null : without(play.survival.edge);
      const trial = play.survival.trial;
      if (trial === null) {
        kept.survival = { ...play.survival, ghosts, edge };
      } else {
        const { [playerId]: _answer, ...answers } = trial.answers;
        const { [playerId]: _trap, ...traps } = trial.traps;
        const { [playerId]: _door, ...doors } = trial.doors;
        const { [playerId]: _fallback, ...fallback } = trial.fallback;
        kept.survival = { ...play.survival, ghosts, edge, trial: { ...trial, answers, traps, doors, fallback, out: without(trial.out) } };
      }
    }
    if (play.ladder !== undefined) {
      const audience = play.ladder.lifelines.audience;
      const ballots = audience === undefined ? {} : Object.fromEntries(Object.entries(audience.ballots).filter(([id]) => id !== playerId));
      const lifelines = audience === undefined ? play.ladder.lifelines : { ...play.ladder.lifelines, audience: { ...audience, ballots } };
      const outcome = index === state.questionIndex && ladderStop !== null ? ladderStop : play.ladder.outcome;
      kept.ladder = { ...play.ladder, lifelines, outcome };
    }
    if (play.buffs !== undefined) {
      const { [playerId]: _buff, ...buffs } = play.buffs;
      // Голос вилученого більше не рахується.
      kept.buffs = dropBallots(buffs, playerId);
    }
    if (play.overtime !== undefined) {
      const { [playerId]: _overtime, ...overtime } = play.overtime;
      kept.overtime = overtime;
    }
    if (play.final !== undefined) {
      const { [playerId]: _wager, ...wagers } = play.final.wagers;
      const without = (ids: string[]) => ids.filter((id) => id !== playerId);
      kept.final = { wagers, allIn: without(play.final.allIn), graded: without(play.final.graded) };
    }
    if (play.blitz === undefined) return kept;
    const blitz = {
      queue: play.blitz.queue.filter((e) => e.playerId !== playerId),
      attempts: play.blitz.attempts.filter((a) => a.playerId !== playerId),
      buzzed: play.blitz.buzzed.filter((id) => id !== playerId),
      dropped: play.blitz.dropped.filter((e) => e.playerId !== playerId),
    };
    return { ...kept, blitz };
  });
  // Гравець зникає з кола; відлік відсутності скидається, його заново ставить tick.
  // Вилучений гравець зникає й з кидків кубиків; тур, що через це скінчився, рахується.
  const ids = state.players.map((p) => p.id);
  const board = state.board === null ? null : { ...dropFromDice(dropFromCircle(state.board, playerId), playerId, ids), awaySince: null };
  const final = state.final === null ? null : dropFromFinal(state.final, playerId);
  // Запитання фіналу після вилучення саме не відкривається: ведучий тисне «Показати запитання».
  const adjustments = state.adjustments.filter((a) => a.playerId !== playerId);
  const { [playerId]: _debuff, ...kept } = state.debuffs;
  // Дебаф, куплений вилученим, лишається на цілі, але стає «від ведучого»: ведучий може його скасувати.
  const debuffs = Object.fromEntries(Object.entries(kept).map(([id, d]) => [id, d.by === playerId ? { ...d, by: null } : d]));
  // Дуель з вилученим скасовується; якщо вилучено суперника до підсумку, той, хто оголосив, отримує право назад.
  const duel = state.duel;
  const inDuel = duel !== null && (duel.challengerId === playerId || duel.opponentId === playerId);
  const regained = inDuel && duel.opponentId === playerId && duel.stage !== 'result' ? duel.challengerId : null;
  const duelsDeclared = state.duelsDeclared.filter((id) => id !== playerId && id !== regained);
  const undueled = inDuel ? dropDuel(state) : state;
  // «Мільйонер»: учасника вилучили на заставці раунду — вибирають заново.
  const unpicked: GameState =
    state.phase === 'intro' && state.ladder?.contestantId === playerId ? { ...undueled, ladder: { contestantId: null, drawn: false } } : undueled;
  // Без вилученого банк фіналу менший: бали решти перераховуються.
  const kicked = withTotals({
    ...unpicked,
    players: state.players.filter((p) => p.id !== playerId),
    plays,
    board,
    final,
    adjustments,
    debuffs,
    duelsDeclared,
    awaiting: state.awaiting.filter((id) => id !== playerId),
  });
  // Наступний у черзі, який уже відповів, перевіряється одразу; на паузі — після продовження.
  // «Ва-банк»: якщо вилучений був останнім, хто не вирішив, вікно закривається; «Вибування» — так само випробування.
  // «Мільйонер»: якщо вилучений був останнім глядачем, що не відповів, голосування залу закривається.
  return ok(settleTrial(settleDecision(autoLock(settleAudience(kicked.paused ? kicked : settleQueue(kicked, null))))));
}

/** Гравець зникає з меж, ставок, ва-банку й порядку розкриття; якщо його вже розкрили, лічильник зменшується, щоб не перескочити сусіда. */
function dropFromFinal(final: FinalState, playerId: string): FinalState {
  const { [playerId]: _limit, ...limits } = final.limits;
  const { [playerId]: _wager, ...wagers } = final.wagers;
  const index = final.order.indexOf(playerId);
  const shown = index !== -1 && index < final.shown ? final.shown - 1 : final.shown;
  const without = (ids: string[]) => ids.filter((id) => id !== playerId);
  return { ...final, limits, wagers, allIn: without(final.allIn), order: without(final.order), shown };
}

export function setConnected(state: GameState, playerId: string, connected: boolean, now: number): Result {
  // Командна гра: зв'язок людини; команда міняє зв'язок, лише коли змінилося «хтось із команди на зв'язку».
  if (teamsOn(state) && memberOf(state, playerId) !== undefined) return memberConnected(state, playerId, connected, now);
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  const players = state.players.map((p) => (p.id === playerId ? { ...p, connected } : p));
  // Гравець повернувся після перезапуску (або вийшов знову): далі як звичайний гравець.
  const changed = { ...state, players, awaiting: state.awaiting.filter((id) => id !== playerId) };
  // Відлік 30 секунд іде лише для гравця, чий хід, і не на паузі.
  if (state.phase === 'board' && state.board !== null && !state.paused && chooserOf(state) === playerId) {
    return ok({ ...changed, board: { ...state.board, awaySince: connected ? null : (state.board.awaySince ?? now) } });
  }
  // На звичайній клітинці без таймера так само, але відлік не стартує, поки відповідь чекає на ведучого.
  const watched = state.phase === 'question' && !state.paused && awayWatched(state) === playerId;
  if (watched && state.board !== null && (connected || state.heldAt === null)) {
    return ok(autoLock({ ...changed, board: { ...state.board, awaySince: connected ? null : (state.board.awaySince ?? now) } }, now));
  }
  // «Ва-банк»: відсутній гравець вікна рішення не тримає; «Вибування» — випробування; «Мільйонер» — голосування залу.
  return ok(settleTrial(settleDecision(autoLock(settleAudience(changed), now))));
}

/** Гравець, чия відсутність закриває запитання: той, хто вибрав звичайну клітинку без таймера; інакше null. */
function awayWatched(state: GameState): string | null {
  if (state.phase !== 'question') return null;
  const play = state.plays[state.questionIndex];
  const board = play?.board;
  if (board === undefined || board.kind !== 'normal' || isTimed(play.question)) return null;
  return state.players.some((p) => p.id === board.chooserId) ? board.chooserId : null;
}

/**
 * Ставить відлік відсутності (awaySince = now), якщо гравець, за яким стежать, відключений, а відліку ще немає.
 * Сервер викликає tick лише за дедлайном, тож відлік ставлять і самі дії, після яких він має піти.
 */
function watchAway(state: GameState, now: number): GameState {
  if (state.paused || state.heldAt !== null || state.board === null || state.board.awaySince !== null) return state;
  const watched = awayWatched(state);
  const away = watched !== null && state.players.some((p) => p.id === watched && !p.connected);
  return away ? { ...state, board: { ...state.board, awaySince: now } } : state;
}

export type Rng = () => number;

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Порядок показу варіантів; експортовано для buffs.ts. */
export function present(question: Question, shuffleOptions: boolean, rng: Rng): string[] {
  if (question.type === 'order') {
    const ids = question.items.map((item) => item.id);
    const mixed = shuffle(ids, rng);
    // Гравець не повинен отримати готову правильну відповідь.
    return mixed.every((id, index) => id === ids[index]) ? [...ids.slice(1), ids[0]] : mixed;
  }
  if (question.type === 'match') {
    // Правий стовпчик перемішується завжди; на одному рівні з лівим він видав би відповідь.
    const ids = question.pairs.map((pair) => pair.right.id);
    const mixed = shuffle(ids, rng);
    return mixed.every((id, index) => id === ids[index]) ? [...ids.slice(1), ids[0]] : mixed;
  }
  if (question.type === 'single' || question.type === 'multi' || question.type === 'poll') {
    const ids = question.options.map((option) => option.id);
    return shuffleOptions ? shuffle(ids, rng) : ids;
  }
  if (question.type === 'sort') {
    // Авторський порядок часто згрупований за категоріями: слова перемішуються завжди, однаково для всіх.
    return shuffle(question.words.map((word) => word.id), rng);
  }
  // Стіна: плитки перемішуються завжди, однаково для всіх; жоден ряд показу не є групою.
  if (question.type === 'wall') return wallPresent(question, rng);
  return [];
}

/** Чи можна відкрити запитання: «100 до 1» без дошки (хмара порожня, запасних рядків немає) пропускається. */
function playable(state: GameState, question: Question): boolean {
  return question.type !== 'survey' || surveyBoard(state, question) !== null;
}

/**
 * Наступне запитання поточного раунду: перше за порядком, якого ще немає в журналі цього раунду й яке можна відкрити.
 * Пропущене «100 до 1» запису в журналі не має: ні балів, ні серій, ні зіграних запитань.
 */
function nextQuestion(state: GameState): Question | undefined {
  const round = currentRound(state);
  if (round === null || round.type === 'board') return undefined;
  // «Ва-банк»: коли в грі нікого не лишилося, решта драбини лишається незіграною.
  if (round.type === 'wipeout' && wipeoutIn(state).length === 0) return undefined;
  // «Вибування»: щойно після вибування живих ≤ N, решта запитань лишається незіграною.
  if (round.type === 'survival' && survivalOver(state)) return undefined;
  // «Мільйонер»: драбина скінчилася (підсумок на останньому записі раунду) або учасника вже немає — решта незіграна.
  if (round.type === 'ladder') {
    const last = state.plays.filter((p) => p.roundIndex === state.roundIndex).at(-1);
    const contestantId = state.ladder?.contestantId ?? null;
    if ((last?.ladder?.outcome ?? null) !== null || contestantId === null || !state.players.some((p) => p.id === contestantId)) return undefined;
  }
  const played = new Set(state.plays.filter((p) => p.roundIndex === state.roundIndex).map((p) => p.question.id));
  return round.questions.find((question) => !played.has(question.id) && playable(state, question));
}

export function openQuestion(state: GameState, question: Question, now: number, rng: Rng, board?: BoardPlay): GameState {
  const round = state.quiz.rounds[state.roundIndex];
  // «100 до 1»: збудована дошка лягає в запитання запису (знімок вікторини не змінюється). Без дошки сюди не потрапляють:
  // класика відсіює пропуск у nextQuestion, на полі дошка завжди ведучого; null — захист, рядки ведучого.
  const built = question.type === 'survey' ? (surveyBoard(state, question) ?? { rows: question.rows, source: 'host' as const }) : null;
  const play: Play = {
    roundIndex: state.roundIndex,
    question: built !== null && question.type === 'survey' ? { ...question, rows: built.rows } : question,
    answers: {},
    extraMs: 0,
    ...(board !== undefined ? { board } : {}),
    // Сортування в бліц-раунді без черги натискань: перемагає перший, хто відсортував усе.
    ...((round.type === 'blitz' && question.type !== 'sort') || board?.kind === 'blitz'
      ? { blitz: { queue: [], attempts: [], buzzed: [], dropped: [] } }
      : {}),
    ...(question.type === 'clues' ? { clues: 1 } : {}),
    ...(built !== null ? { survey: { source: built.source, shown: 0 } } : {}),
    // Блеф: зерно для запасних вигадок і порядку варіантів; tick, що перемикає фазу, rng не має. Інші типи rng тут не тягнуть.
    ...(question.type === 'bluff'
      ? { bluff: { stage: 'lies' as const, seed: Math.floor(rng() * 2 ** 32), lies: {}, options: [], picks: {}, shown: 0 } }
      : {}),
    ...(round.type === 'wipeout' ? { wipeout: { took: [], stay: [], end: false } } : {}),
    ...(round.type === 'survival' ? { survival: { ghosts: {}, edge: null, trial: null, end: false } } : {}),
    // «Мільйонер»: сходинка = кількість уже зіграних запитань раунду; рівень і таймер — знімки раунду.
    ...(round.type === 'ladder' ? { ladder: ladderPlayFor(state, round.levels, round.timer) } : {}),
  };
  // Таймер стартує після заставки (класика, фінал, клітинка поля); у бліці заставки немає.
  // Клітинка з ×2/×3 перегортається довше: після перегортання — сюрприз.
  const kind = questionSplashKind(state, board);
  const marked = kind === null ? { ...state, splash: null } : withSplash(state, kind, now, questionSplashMs(kind, board));
  const at = marked.splash?.until ?? now;
  // Клітинку без таймера ведучий міг вибрати за відсутнього гравця: відлік іде з відкриття.
  // Дебафи, що чекають, спрацьовують для тих, хто відповідає на це запитання з телефона, — від старту запитання.
  const opened = watchAway(
    {
      ...marked,
      phase: 'question',
      questionIndex: state.plays.length,
      plays: [...state.plays, play],
      presented: present(question, round.shuffleOptions, rng),
      startedAt: at,
      // «Мільйонер» без таймера: запис ще не в стані, тож тут умова з раунду, а не timedPlay.
      endsAt: isTimed(question) && !(round.type === 'ladder' && !round.timer) ? at + answerWindowMs(question) : null,
      remainingMs: null,
      heldAt: null,
    },
    now,
  );
  return fireDebuffs(opened, at);
}

/** Новий LadderPlay для запитання «Мільйонера», що відкривається. */
function ladderPlayFor(state: GameState, levels: number[], timed: boolean): LadderPlay {
  const step = state.plays.filter((p) => p.roundIndex === state.roundIndex).length;
  return { contestantId: state.ladder?.contestantId ?? '', step, level: levels[step] ?? 0, timed, lifelines: {}, decision: null, outcome: null };
}

/** Відкриває запитання фіналу; ставка кожного гравця знімається на цю мить, хто не поставив — грає з 0. */
export function openFinalQuestion(state: GameState, now: number, rng: Rng): GameState {
  const round = currentRound(state);
  if (round?.type !== 'final' || state.final === null) return state;
  const placed = state.final.wagers;
  const wagers: Record<string, number> = Object.fromEntries(state.players.map((p) => [p.id, Object.hasOwn(placed, p.id) ? placed[p.id] : 0]));
  const limits = state.final.limits;
  // «ВА-БАНК!» — кожен, чия ставка дорівнює межі й більша за 0, натиснув він кнопку чи ввів суму.
  const allIn = state.players.filter((p) => wagers[p.id] > 0 && Object.hasOwn(limits, p.id) && wagers[p.id] === limits[p.id]).map((p) => p.id);
  const opened = openQuestion(state, round.questions[0], now, rng);
  return withCurrentPlay(opened, { ...opened.plays[opened.questionIndex], final: { wagers, allIn, graded: [] } });
}

/** Замінює поточне запитання в журналі; експортовано для board.ts. */
export function withCurrentPlay(state: GameState, play: Play): GameState {
  return { ...state, plays: state.plays.map((p, index) => (index === state.questionIndex ? play : p)) };
}

/** Запитання фіналу поточного раунду, якщо його вже відкрито; інакше undefined. */
function finalPlayOf(state: GameState): (Play & { final: FinalPlay }) | undefined {
  const play = state.plays[state.questionIndex];
  if (state.final === null || play?.final === undefined || play.roundIndex !== state.roundIndex) return undefined;
  return { ...play, final: play.final };
}

/** Ставка гравця, знята на відкритті запитання фіналу. */
function wagerOf(final: FinalPlay, playerId: string): number {
  return Object.hasOwn(final.wagers, playerId) ? final.wagers[playerId] : 0;
}

/** Бали фіналу кожного гравця поточного запитання фіналу за типом ставок раунду; гравець без запису — програвший. */
export function finalOutcome(state: GameState): BankOutcome | null {
  const play = finalPlayOf(state);
  if (play === undefined) return null;
  const round = state.quiz.rounds[play.roundIndex];
  const entries = state.players.map((player) => ({
    playerId: player.id,
    wager: wagerOf(play.final, player.id),
    correct: recordOf(state, state.questionIndex, player.id)?.grade === 'correct',
  }));
  if (round.type === 'final' && round.wagerMode === 'bank') return splitBank(entries);
  const points = Object.fromEntries(entries.map((e) => [e.playerId, finalPoints(e.wager, e.correct)]));
  return { bank: 0, refund: false, points };
}

/**
 * Фінал скінчився: раунд закрито (round_end чи finished), а всіх гравців уже розкрито.
 * Тоді записи фіналу сталі — вилучення чи коригування після фіналу не змінюють уже показаних часток банку.
 */
function finalFrozen(state: GameState): boolean {
  if (state.phase !== 'round_end' && state.phase !== 'finished') return false;
  const final = state.final;
  return final !== null && final.order.length > 0 && final.shown >= final.order.length;
}

/** Перезаписує basePoints і points усіх записів поточного запитання фіналу за finalOutcome; поза ним — стан без змін. */
export function withFinalPoints(state: GameState): GameState {
  if (finalFrozen(state)) return state;
  const outcome = finalOutcome(state);
  if (outcome === null) return state;
  const play = state.plays[state.questionIndex];
  const answers = { ...play.answers };
  for (const [playerId, record] of Object.entries(answers)) {
    const points = Object.hasOwn(outcome.points, playerId) ? outcome.points[playerId] : record.points;
    answers[playerId] = { ...record, basePoints: points, streakBonus: 0, points };
  }
  return withCurrentPlay(state, { ...play, answers });
}

/** Раунд з банком, запитання відкрито, загальний банк > 0 і розподілу ще не було. */
export function needsSplit(state: GameState): boolean {
  const play = finalPlayOf(state);
  if (play === undefined || state.final === null || state.final.split) return false;
  const round = state.quiz.rounds[play.roundIndex];
  return round.type === 'final' && round.wagerMode === 'bank' && (finalOutcome(state)?.bank ?? 0) > 0;
}

/**
 * Бали фіналу гравця, які вже можна показати сцені й телефонам: поза фіналом — points запису;
 * до розкриття гравця — 0; у банку до розподілу — помилка −ставка, правильно 0; далі — points запису.
 */
export function finalVisiblePoints(state: GameState, playerId: string): number {
  const record = recordOf(state, state.questionIndex, playerId);
  const points = record?.points ?? 0;
  const play = finalPlayOf(state);
  if (play === undefined || state.final === null) return points;
  if (!finalShown(state, playerId)) return 0;
  const round = state.quiz.rounds[play.roundIndex];
  if (round.type !== 'final' || round.wagerMode !== 'bank' || state.final.split) return points;
  // Частки й повернення залежать від усіх; до розподілу видно лише власну ставку в банку.
  return record?.grade === 'correct' ? 0 : 0 - wagerOf(play.final, playerId);
}

/**
 * Чи розкрито результат гравця у фіналі поточного запитання (для зрізів).
 * Поза фіналом і без відкритого запитання фіналу — true; на question і locked — false;
 * на reveal — лише для гравців, яких уже розкрито (перші `shown` в order).
 */
export function finalShown(state: GameState, playerId: string): boolean {
  // Без відкритого запитання фіналу (зокрема, раунд завершено на ставках) розкривати нічого.
  if (state.final === null || finalPlayOf(state) === undefined) return true;
  if (state.phase === 'question' || state.phase === 'locked') return false;
  const index = state.final.order.indexOf(playerId);
  return index !== -1 && index < state.final.shown;
}

/** Кожен гравець без запису на запитання фіналу отримує «неправильно» без відповіді й −ставка. */
function settleFinal(state: GameState): GameState {
  const play = finalPlayOf(state);
  if (play === undefined) return state;
  let settled = state;
  for (const player of state.players) {
    if (recordOf(state, state.questionIndex, player.id) !== undefined) continue;
    const points = finalPoints(wagerOf(play.final, player.id), false);
    settled = withRecord(settled, player.id, {
      answer: null,
      timeMs: limitMsOf(play) ?? 0,
      accepted: false,
      accuracy: 0,
      grade: 'wrong',
      basePoints: points,
      streakBonus: 0,
      points,
      overridden: false,
    });
  }
  return settled;
}

/**
 * Мовчання оцінюється, рахунки перераховуються, а порядок розкриття фіксується (якщо його ще немає):
 * за зростанням рахунку до фіналу, за рівності в порядку приєднання.
 */
function settleFinalWithOrder(state: GameState): GameState {
  const totals = withTotals(settleFinal(state));
  if (totals.final === null || totals.final.order.length > 0) return totals;
  const before = (player: PlayerState) => player.score - (recordOf(totals, totals.questionIndex, player.id)?.points ?? 0);
  // Array.prototype.sort стабільний: рівні лишаються в порядку state.players.
  const order = [...totals.players].sort((a, b) => before(a) - before(b)).map((p) => p.id);
  return { ...totals, final: { ...totals.final, order } };
}

/** Після відкриття запитання фіналу дострокове завершення оцінює всіх, вважає всіх розкритими, а банк — розподіленим. */
function closeFinal(state: GameState): GameState {
  if (finalPlayOf(state) === undefined) return withTotals(state);
  const settled = settleFinalWithOrder(state);
  return settled.final === null ? settled : { ...settled, final: { ...settled.final, shown: settled.final.order.length, split: true } };
}

/** Скидає відлік відсутності гравця, чий хід. */
function clearAway(board: BoardState | null): BoardState | null {
  return board === null ? null : { ...board, awaySince: null };
}

/** Після останнього раунду гра закінчується (з now — заставка «Підсумки»), інакше показуються підсумки раунду. */
function finishRound(input: GameState, now?: number): GameState {
  // «Мільйонер»: підсумок драбини, якщо його ще немає, — до зміни фази, поки afterQuestion і roundIndex ще цього раунду.
  const ladderStopped = stopLadder(input, now ?? 0);
  // «Ва-банк»: банки тих, хто в грі, переносяться в бали на останньому зіграному запитанні.
  const marked = markWipeoutEnd(ladderStopped);
  // «Вибування»: кожен живий отримує бонус виживання — до зміни фази, поки afterQuestion і roundIndex ще цього раунду.
  // Без now (старі виклики) мить коригування невідома — 0.
  const state = awardSurvivalBonus(marked === ladderStopped ? ladderStopped : withTotals(marked), now ?? 0);
  const isLastRound = state.roundIndex === state.quiz.rounds.length - 1;
  const finished: GameState = { ...state, phase: isLastRound ? 'finished' : 'round_end', board: clearAway(state.board) };
  return isLastRound && now !== undefined ? withSplash(finished, 'podium', now) : finished;
}

/** Заставка входу в раунд: «Фінал» для фінального, «Раунд N» для решти; без now — без заставки. */
function roundSplash(state: GameState, now?: number): GameState {
  return now === undefined ? state : withSplash(state, currentRound(state)?.type === 'final' ? 'final' : 'round', now);
}

/** Відкриває наступне запитання раунду, а коли їх не лишилося, завершує раунд. */
function advance(state: GameState, now: number, rng: Rng): GameState {
  const question = nextQuestion(state);
  return question !== undefined ? openQuestion(state, question, now, rng) : finishRound(state, now);
}

/**
 * Серія кожного гравця після перших upTo запитань журналу: поспіль правильні відповіді в раунді
 * останнього з них. Без відповіді серія перервана, але в бліці запитання, де гравець не натискав,
 * серію не обриває й не продовжує (натискання без правильної спроби обриває; так само сортування без ходів); на межі раундів вона скидається;
 * якщо правил серії в тому раунді немає, серій немає. Запитання без балів (опитування, хмара) серію не обривають і не продовжують.
 */
export function streakCounts(state: GameState, upTo: number): Record<string, number> {
  const last = state.plays[upTo - 1];
  if (last === undefined) return {};
  const round = state.quiz.rounds[last.roundIndex];
  if (rulesOf(round).streak === null) return {};
  const counts: Record<string, number> = {};
  for (const player of state.players) {
    let count = 0;
    for (let i = upTo - 1; i >= 0 && state.plays[i].roundIndex === last.roundIndex; i -= 1) {
      if (isUnscored(state.plays[i].question)) continue;
      const record = recordOf(state, i, player.id);
      const blitz = state.plays[i].blitz;
      if (record === undefined && blitz !== undefined && !blitz.buzzed.includes(player.id)) continue;
      // Сортування в бліц-раунді (без черги): хто не ходив, серію не обриває й не продовжує.
      if (record === undefined && blitz === undefined && round.type === 'blitz') continue;
      // На полі серію рахують лише власні ходи гравця.
      const board = state.plays[i].board;
      if (board !== undefined && board.chooserId !== player.id) continue;
      if (record === undefined || record.grade !== 'correct') break;
      count += 1;
    }
    counts[player.id] = count;
  }
  return counts;
}

/** Від чого рахується бонус серії: у бліці від виграшної спроби, бо basePoints містить і штрафи. */
function streakBase(play: Play, playerId: string, record: AnswerRecord): number {
  if (play.blitz === undefined) return record.basePoints;
  return play.blitz.attempts.find((a) => a.playerId === playerId && a.grade === 'correct')?.points ?? 0;
}

/**
 * Перераховує рахунок, серії й сумарний час за всіма вже закритими запитаннями; до рахунку додаються коригування.
 * Внутрішня функція рушія: експортовано для adjust.ts, не для сервера.
 */
export function withTotals(input: GameState): GameState {
  // Бали фіналу залежать від усіх записів запитання (спільний банк), тож перераховуються першими;
  // бали «Ва-банк» — з драбини всього раунду.
  const state = withWipeoutPoints(withFinalPoints(input));
  // Відкрите запитання завжди останнє в журналі.
  const closedCount = state.phase === 'question' ? state.plays.length - 1 : state.plays.length;
  const plays = state.plays.map((play, index) => {
    if (index >= closedCount) return play;
    // Без балів — без бонусу серії.
    if (isUnscored(play.question)) return play;
    const streak = rulesOf(state.quiz.rounds[play.roundIndex]).streak;
    if (streak === null) return play;
    // Серія враховує і саме це запитання.
    const counters = streakCounts(state, index + 1);
    const answers = { ...play.answers };
    for (const player of state.players) {
      const record = Object.hasOwn(answers, player.id) ? answers[player.id] : undefined;
      // Серія на полі лише за власні клітинки: на чужій бліц-клітинці бонусу немає.
      if (record === undefined || (play.board !== undefined && play.board.chooserId !== player.id)) continue;
      const base = streakBase(play, player.id, record);
      // Подвійні бали: бонус рахується від неподвоєних балів і теж подвоюється.
      const doubled = record.buff === 'double' && base > 0;
      const earned = (counters[player.id] ?? 0) >= streak.length;
      const bonus = !earned ? 0 : doubled ? 2 * streakBonus(base / 2, streak.bonus) : streakBonus(base, streak.bonus);
      answers[player.id] = { ...record, streakBonus: bonus, points: record.basePoints + bonus };
    }
    return { ...play, answers };
  });

  const counters = state.plays[closedCount - 1]?.roundIndex === state.roundIndex ? streakCounts(state, closedCount) : {};
  const players = state.players.map((player) => {
    let score = 0;
    let totalTimeMs = 0;
    for (const play of plays.slice(0, closedCount)) {
      const record = Object.hasOwn(play.answers, player.id) ? play.answers[player.id] : undefined;
      score += record ? record.points : 0;
      // Голос без балів не додає часу: інакше швидкий голос давав би перевагу за рівного рахунку.
      if (isUnscored(play.question)) continue;
      // Час для рівного рахунку йде лише за класичні раунди й лише за запитання з таймером
      // («Ва-банк» і «Вибування» не входять: спільна формула не змінюється);
      // відповідь у додатковий час коштує не більше за ліміт, як і мовчання.
      const limitMs = limitMsOf(play);
      if (state.quiz.rounds[play.roundIndex].type !== 'classic' || limitMs === null) continue;
      totalTimeMs += record ? Math.min(record.timeMs, limitMs) : limitMs;
    }
    score += adjustmentTotal(state, player.id);
    return { ...player, score, totalTimeMs, streak: counters[player.id] ?? 0 };
  });
  return { ...state, plays, players };
}

/** Нерозглянуті натискання бліцу переходять у dropped: лише для показу, без балів і штрафу. */
function dropQueue(state: GameState): GameState {
  const play = state.plays[state.questionIndex];
  if (play?.blitz === undefined || play.blitz.queue.length === 0) return state;
  const { queue, dropped } = play.blitz;
  const closed: Play = { ...play, blitz: { ...play.blitz, queue: [], dropped: [...dropped, ...queue] } };
  return withPlay(state, closed);
}

/**
 * Закриває запитання; «Мінус для всіх» бліц-клітинки нараховується саме тут, рівно один раз.
 * Внутрішня функція рушія: експортовано для sort.ts і wall.ts, не для сервера.
 */
export function lockNow(state: GameState): GameState {
  // Бали за ланцюжок залежать від найшвидшого, тож рахуються лише тут, коли відомі часи всіх.
  // Незакінчене сортування отримує записи за відсортовані слова.
  // Незавершена друга спроба зараховує першу відповідь.
  // Незакінчена стіна отримує записи за знайдені групи.
  // Блеф отримує записи лише тут: бали залежать від виборів усіх.
  // Голосування залу «Мільйонера» закривається з відповідями залу на цю мить.
  const closed = spendDebuffs(withCellPenalty(dropQueue(scoreBluff(scoreWall(scoreSort(scoreChain(closeAudience(settleRetries(state)))))))));
  return withTotals({ ...closed, phase: 'locked', startedAt: null, endsAt: null, remainingMs: null, heldAt: null, board: clearAway(closed.board) });
}

/**
 * Закриває запитання поля й одразу розкриває оцінку: так відповідь світиться зеленим або червоним.
 * Внутрішня функція рушія: експортовано для sort.ts і wall.ts, не для сервера.
 */
export function revealNow(state: GameState): GameState {
  return withTotals({ ...lockNow(state), phase: 'reveal' });
}

/**
 * Закриває запитання, якщо відповіли всі підключені гравці (у бліці: якщо запитання вже вирішене;
 * у ланцюжку: кожен підключений пройшов або, якщо відомо now, вичерпав свій час).
 * Внутрішня функція рушія: експортовано для chain.ts, не для сервера.
 */
export function autoLock(state: GameState, now: number | null = null): GameState {
  if (state.phase !== 'question' || state.paused) return state;
  if (state.plays[state.questionIndex]?.blitz !== undefined) return blitzDone(state, null) ? lockNow(state) : state;
  // Блеф: у фазі вигадок час чи «усі написали» перемикають на вибір, у фазі вибору — закривають.
  if (state.plays[state.questionIndex]?.question.type === 'bluff') return bluffAuto(state, now);
  // Час сплив для всіх, хто ще не відповів (зокрема щойно відповів останній з додатковим часом).
  // Строго «>», як у timeOver: рівно на кінці відповісти ще можна.
  const closes = closesAt(state);
  if (now !== null && closes !== null && state.heldAt === null && now > closes) return lockNow(state);
  if (state.plays[state.questionIndex]?.question.type === 'chain') return chainDone(state, now) ? lockNow(state) : state;
  // На полі запитання закриває сама відповідь або оцінка ведучого.
  if (currentRound(state)?.type === 'board') return state;
  // «Мільйонер»: чекають учасника й присутній зал; без учасника на зв'язку закриє ведучий чи таймер.
  if (inLadderRound(state)) return ladderAnswered(state) ? lockNow(state) : state;
  // «Ва-банк»: чекають лише тих, хто в грі; без присутніх у грі запитання закриє таймер чи ведучий.
  // «Вибування»: так само лише живих — привиди запитання не тримають.
  // Командна гра, опитування й «хмара слів»: чекають кожну присутню людину.
  if (teamsOn(state) && isUnscored(state.plays[state.questionIndex].question)) {
    const people = presentMembers(state).filter((m) => m.teamId !== null);
    if (people.length === 0) return state;
    return people.every((m) => recordOf(state, state.questionIndex, m.id) !== undefined) ? lockNow(state) : state;
  }
  const type = currentRound(state)?.type;
  const playing = type === 'wipeout' ? wipeoutIn(state) : type === 'survival' ? survivalAlive(state) : null;
  const connected = presentPlayers(state).filter((p) => playing === null || playing.includes(p.id));
  if (connected.length === 0) return state;
  const everyoneAnswered = connected.every((p) => recordOf(state, state.questionIndex, p.id) !== undefined);
  return everyoneAnswered ? lockNow(state) : state;
}

/** Перший раунд: те, що start робив до 8d (стан intro першого раунду вже готовий), плюс заставка раунду. */
function enterFirstRound(state: GameState, now?: number): GameState {
  return roundSplash({ ...state, phase: 'intro', guidePage: 0 }, now);
}

/**
 * «Почати гру»: з поясненнями для новачків — етап guide (сторінка 0, без заставки), інакше intro із заставкою, як і раніше.
 * Перший раунд готується одразу, тож вихід із «Як грати» — рівно колишній start. Без now (старі тести) — без заставки.
 * Перше запитання відкриває `next`.
 */
export function start(state: GameState, now?: number): Result {
  if (state.phase !== 'lobby') return fail('wrong_phase');
  // Командна гра: склад команд стає гравцями рушія (або teams_few).
  let formed = state;
  if (teamsOn(state)) {
    const teamed = formTeams(state);
    if (!teamed.ok) return teamed;
    formed = teamed.state;
  }
  if (formed.players.length === 0) return fail('no_players');
  const ready = enterRound({ ...formed, roundIndex: 0 });
  return ok(newcomersOn(state.quiz) ? { ...ready, phase: 'guide', guidePage: 0 } : enterFirstRound(ready, now));
}

/** «До гри»: з будь-якої сторінки «Як грати» — у перший раунд, із заставкою раунду. */
export function skipGuide(state: GameState, now: number): Result {
  if (state.paused) return fail('paused');
  if (state.phase !== 'guide') return fail('wrong_phase');
  return ok(enterFirstRound(state, now));
}

/** Чи раунд дає бонус за швидкість: класика й «Вибування» (бали як у класиці) з увімкненим speedBonus. */
export function speedOn(round: Round): boolean {
  return (round.type === 'classic' || round.type === 'survival') && round.speedBonus;
}

export function submitAnswer(state: GameState, playerId: string, answer: Answer, now: number): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (notStarted(state, now)) return fail('not_started');
  // Командна гра: опитування й «хмару слів» проходить кожна людина окремо — голос під її id, не під id команди.
  if (teamsOn(state) && isUnscored(state.plays[state.questionIndex].question)) {
    if (memberOf(state, playerId)?.teamId == null) return fail('not_found');
    return submitVote(state, playerId, answer, now);
  }
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  // «Вибування»: привид відповідає «для себе» — поза answers, без балів; живі йдуть класичним шляхом.
  if (currentRound(state)?.type === 'survival' && isGhost(state, playerId)) return submitGhostAnswer(state, playerId, answer, now);
  const play = state.plays[state.questionIndex];
  // Опитування й «хмара слів» — голос без балів.
  if (isUnscored(play.question)) return submitVote(state, playerId, answer, now);
  // Ланцюжок проходять лише guessWord і takeHint: підсумок з телефона не приймається.
  if (answer.type === 'chain' || play.question.type === 'chain') return fail('type_mismatch');
  // Сортування — лише хід за ходом через sortWord.
  if (answer.type === 'sort' || play.question.type === 'sort') return fail('type_mismatch');
  // Стіна — лише вибір за вибором через guessWall.
  if (answer.type === 'wall' || play.question.type === 'wall') return fail('type_mismatch');
  // Блеф — лише writeLie і pickBluff.
  if (answer.type === 'bluff' || play.question.type === 'bluff') return fail('type_mismatch');
  // «100 до 1»: рушій чистить відповідь і додає збіги до будь-якої гілки — і клітинка поля чекає вже перевірену.
  const asked0 = questionFor(state, play, playerId);
  if (asked0.type === 'survey') {
    if (answer.type !== 'survey') return fail('type_mismatch');
    answer = scoreSurvey(asked0, answer);
    if (answer.values.length === 0) return fail('type_mismatch');
  }
  const { question, roundIndex } = play;
  const round = state.quiz.rounds[roundIndex];
  if (round.type === 'wipeout') return submitWipeoutAnswer(state, playerId, answer, now);
  if (round.type === 'ladder') return submitLadderAnswer(state, playerId, answer, now);
  if (play.blitz !== undefined) {
    // Усну відповідь голови черги оцінює ведучий, з телефона її не приймають.
    if (blitzRulesOf(state, play)?.check === 'voice') return fail('wrong_phase');
    return submitBlitzAnswer(state, playerId, answer, now);
  }
  if (round.type === 'board') return submitBoardAnswer(state, round, playerId, answer, now);
  if (round.type === 'final') return submitFinalAnswer(state, round, playerId, answer, now);
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return fail('already_answered');
  // Після часткової першої відповіді гравець вибирає через chooseRetry.
  if (buffOf(play, playerId)?.retry === 'choice') return fail('wrong_phase');
  if (state.startedAt === null || timeOverFor(state, play, playerId, now)) return fail('time_over');
  // Після заміни гравець відповідає на запасне, але бали — основного запитання.
  const asked = questionFor(state, play, playerId);
  if (asked.type !== answer.type) return fail('type_mismatch');

  // Швидкість на запасному — від миті, коли його отримано.
  const spare = buffOf(play, playerId)?.spare;
  const timeMs = Math.max(0, now - (spare?.startedAt ?? state.startedAt));
  const { accepted, accuracy, grade } = verdictOf(asked, answer, timeMs);
  const limit = answerLimitMs(play, playerId);
  // Картинка, що проявляється, і «Хто я?» вже платять за час часткою ціни: бонусу швидкості поверх немає.
  // «100 до 1»: ціна вже спадає з популярністю, швидкість набору — не знання.
  const speed = speedFactor(
    timeMs,
    limit ?? 0,
    speedOn(round) && limit !== null && !paysForTime(asked) && asked.type !== 'survey',
  );
  const points = answerPoints({
    points: question.points,
    accuracy,
    speed,
    multiplier: rulesOf(round).multiplier,
    penalty: rulesOf(round).penalty,
  });
  const record: AnswerRecord = {
    answer,
    timeMs,
    accepted,
    accuracy,
    grade,
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: false,
  };
  // Друга спроба: неправильна чи часткова перша відповідь чекає в бафі, а не в answers.
  const held = holdFirstTry(state, playerId, record);
  if (held !== null) return ok(held);
  return ok(autoLock(finishRetry(withRecord(state, playerId, record), playerId), now));
}

/**
 * Відповідь у фіналі: лише «правильно» (+ставка) або «неправильно» (−ставка), без часткових балів.
 * За ручної перевірки запис тимчасовий («неправильно»), доки ведучий не оцінить.
 */
function submitFinalAnswer(state: GameState, round: FinalRound, playerId: string, answer: Answer, now: number): Result {
  const play = state.plays[state.questionIndex];
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return fail('already_answered');
  if (state.startedAt === null || timeOver(state, play, now)) return fail('time_over');
  if (play.question.type !== answer.type) return fail('type_mismatch');
  const wager = play.final === undefined ? 0 : wagerOf(play.final, playerId);
  const correct = round.check === 'auto' && checkAnswer(play.question, answer).accuracy === 1;
  const points = finalPoints(wager, correct);
  const record: AnswerRecord = {
    answer,
    timeMs: Math.max(0, now - state.startedAt),
    accepted: correct,
    accuracy: correct ? 1 : 0,
    grade: correct ? 'correct' : 'wrong',
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: false,
  };
  // У спільному банку бали залежать від інших записів: ведучий одразу бачить формулу раунду.
  return ok(autoLock(withFinalPoints(withRecord(state, playerId, record))));
}

/** Відповідь на запитання поля: лише від гравця, чий хід; годинник стоїть, поки ведучий не прийме відповідь або не дасть перевибрати. */
function submitBoardAnswer(state: GameState, round: BoardRound, playerId: string, answer: Answer, now: number): Result {
  const play = state.plays[state.questionIndex];
  const board = play.board;
  if (board === undefined || board.answerMode === 'voice') return fail('wrong_phase');
  if (playerId !== board.chooserId) return fail('not_your_turn');
  if (recordOf(state, state.questionIndex, playerId) !== undefined || board.answer !== null) return fail('already_answered');
  if (buffOf(play, playerId)?.retry === 'choice') return fail('wrong_phase');
  if (timeOverFor(state, play, playerId, now)) return fail('time_over');
  if (questionFor(state, play, playerId).type !== answer.type) return fail('type_mismatch');
  return ok(holdAt(withBoard(state, { ...board, answer }), now));
}

/** «Прийняти» за автоматичної перевірки. */
export function acceptAnswer(state: GameState, playerId: string, now: number): Result {
  const pending = pendingOf(state);
  if (pending === null) return fail('wrong_phase');
  // Ведучий називає відповідь: подвійний дотик не має прийняти наступну, яку він ще не бачив.
  if (pending.playerId !== playerId) return fail('not_found');
  if (state.paused) return fail('paused');
  const play = state.plays[state.questionIndex];
  const round = state.quiz.rounds[play.roundIndex];
  if (play.blitz !== undefined) {
    if (blitzRulesOf(state, play)?.check !== 'auto') return fail('wrong_phase');
    const correct = checkAnswer(play.question, pending.answer).accuracy === 1;
    return closeIfDone(applyVerdict(state, pending.playerId, correct, now), now);
  }
  if (round.type !== 'board' || play.board === undefined) return fail('wrong_phase');
  const asked = questionFor(state, play, pending.playerId);
  // «100 до 1» ведучий приймає і за ручної перевірки: дошка однозначна.
  if (round.check === 'manual' && asked.type !== 'survey') return fail('wrong_phase');

  // Годинник стоїть, поки ведучий приймає: на картинці, що проявляється, і в «Хто я?» рахується час до надсилання.
  const timeMs = Math.max(0, clockOf(state, now) - (state.startedAt ?? now));
  const verdict = verdictOf(asked, pending.answer, timeMs);
  let accuracy = verdict.accuracy;
  let accepted = verdict.accepted;
  let grade = verdict.grade;
  // Бали за близькість (повзунок, точка) вбудовані й не залежать від правила «частково» (14a).
  if (!proximityPartial(asked)) {
    const checked = checkAnswer(asked, pending.answer);
    // Часткові бали лише за увімкненого правила; інакше неповна відповідь неправильна.
    const ruled = checked.accuracy >= 1 ? 1 : checked.accuracy > 0 && rulesOf(round).partial !== null ? checked.accuracy : 0;
    accuracy = ruled * paceFactor(asked, timeMs);
    accepted = ruled >= 1;
    grade = gradeOf(ruled);
  }
  const points = boardPoints(round, play.board, accuracy);
  const record: AnswerRecord = {
    answer: pending.answer,
    timeMs,
    accepted,
    accuracy,
    grade,
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: false,
  };
  // Друга спроба: відповідь знято з клітинки, годинник іде далі, як після «Перевибрати».
  const held = holdFirstTry(state, pending.playerId, record);
  if (held !== null) return ok(watchAway(thaw(withBoard(held, { ...play.board, answer: null }), now), now));
  return ok(revealNow(finishRetry(withRecord(state, pending.playerId, record), pending.playerId)));
}

/**
 * «Перевибрати»: відповідь знято, годинник (у бліці й вікно голови черги) іде з того самого залишку.
 * У миттєвому бліці голова лишається на місці й отримує нове вікно DEFAULT_ANSWER_WINDOW від цієї миті.
 */
export function repick(state: GameState, playerId: string, now: number): Result {
  const pending = pendingOf(state);
  if (pending === null) return fail('wrong_phase');
  if (pending.playerId !== playerId) return fail('not_found');
  if (state.paused) return fail('paused');
  const play = state.plays[state.questionIndex];
  if (play.blitz !== undefined) {
    const rules = blitzRulesOf(state, play);
    const deadline = rules !== null && isInstant(rules) ? { deadline: now + DEFAULT_ANSWER_WINDOW * 1000 } : {};
    const queue = play.blitz.queue.map((e, index) => (index === 0 ? { ...e, answer: null, ...deadline } : e));
    return ok(thaw(withPlay(state, { ...play, blitz: { ...play.blitz, queue } }), now));
  }
  const board = play.board;
  if (board === undefined) return fail('wrong_phase');
  // Гравець міг піти, поки відповідь чекала: тепер відлік відсутності рушає.
  return ok(watchAway(thaw(withBoard(state, { ...board, answer: null }), now), now));
}

/** Замінює клітинку в поточному запитанні поля. */
function withBoard(state: GameState, board: BoardPlay): GameState {
  const plays = state.plays.map((play, index) => (index === state.questionIndex ? { ...play, board } : play));
  return { ...state, plays };
}

/**
 * Відповідь у бліці записується в чергу. Коли гравець стане першим, вона чекає на ведучого,
 * а годинник запитання стоїть. Під час утримання вікно перевіряється за замороженим годинником.
 * У миттєвому бліці відповідь сама ставить гравця в кінець черги, один раз за запитання.
 */
function submitBlitzAnswer(state: GameState, playerId: string, answer: Answer, now: number): Result {
  const play = state.plays[state.questionIndex];
  const entry = play.blitz?.queue.find((e) => e.playerId === playerId);
  const rules = blitzRulesOf(state, play);
  if (play.blitz !== undefined && rules !== null && isInstant(rules)) {
    if ((entry !== undefined && entry.answer !== null) || attemptsUsed(play, playerId) > 0) return fail('already_answered');
    if (entry === undefined) return joinInstant(state, play, play.blitz, playerId, answer, now);
  }
  if (play.blitz === undefined || entry === undefined) return fail('not_in_queue');
  if (entry.answer !== null) return fail('already_answered');
  const clock = clockOf(state, now);
  const limit = entry.deadline ?? (isTimed(play.question) ? state.endsAt : Infinity);
  if (limit === null || clock > limit) return fail('time_over');
  if (play.question.type !== answer.type) return fail('type_mismatch');

  const queue = play.blitz.queue.map((e) => (e === entry ? { ...e, answer } : e));
  const answered: Play = { ...play, blitz: { ...play.blitz, queue } };
  return ok(settleQueue(withPlay(state, answered), clock));
}

/** Перша відповідь у миттєвому бліці: новий запис у кінці черги з часом від відкриття. */
function joinInstant(state: GameState, play: Play, blitz: BlitzPlay, playerId: string, answer: Answer, now: number): Result {
  if (timeOver(state, play, now)) return fail('time_over');
  if (play.question.type !== answer.type) return fail('type_mismatch');
  const entry: BuzzEntry = { playerId, at: now, timeMs: Math.max(0, now - (state.startedAt ?? now)), deadline: null, answer };
  const buzzed = blitz.buzzed.includes(playerId) ? blitz.buzzed : [...blitz.buzzed, playerId];
  return ok(settleQueue(withPlay(state, { ...play, blitz: { ...blitz, queue: [...blitz.queue, entry], buzzed } }), now));
}

/** Після рішення щодо голови черги бліцу запитання закривається, якщо воно вже вирішене. */
function closeIfDone(result: Result, now: number): Result {
  if (!result.ok) return result;
  return ok(blitzDone(result.state, now) ? lockNow(result.state) : result.state);
}

/** Ведучий оцінює голову черги: відповідь з телефона за ручної перевірки або усну відповідь. */
export function judge(state: GameState, playerId: string, correct: boolean, now: number): Result {
  const play = state.plays[state.questionIndex];
  const check = play === undefined ? undefined : blitzRulesOf(state, play)?.check;
  if (check === undefined || check === 'auto') return fail('wrong_phase');
  return closeIfDone(applyVerdict(state, playerId, correct, now), now);
}

/** «Закрити»; у фазі вигадок блефу — «До вибору» з now (без now — wrong_phase: таймер вибору не стартує в минулому). */
export function lock(state: GameState, now?: number): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  if (bluffPlayOf(state)?.bluff.stage === 'lies') return now === undefined ? fail('wrong_phase') : ok(startChoice(state, now));
  return ok(lockNow(state));
}

/** Сервер викликає періодично; закриває запитання, коли сплив час. У бліці також згоряють вікна відповіді. */
export function tick(state: GameState, now: number): GameState {
  // «Ва-банк»: вікно «Далі / Забрати», що сплило, закривається, невирішені забирають банк. Як кінець запитання нижче — з endsAt
  // включно: nextDeadline дає саме endsAt, і сервер тікає рівно в цю мить.
  // «Вибування»: випробування, що сплило, закривається так само (мовчуни питання вибувають, двері вибираються самі).
  if (state.phase === 'leaderboard') {
    if (state.paused || state.endsAt === null || now < state.endsAt) return state;
    if (decisionOpen(state)) return closeDecision(state);
    return trialOpen(state) ? closeTrial(state) : state;
  }
  if (state.phase === 'duel') return state.paused ? state : tickDuel(state, now);
  if (state.phase === 'board' && state.board !== null) return state.paused ? state : tickBoard(state, state.board, now);
  if (state.phase !== 'question' || state.paused) return state;
  const running = watchAway(releaseStaleHold(state, now), now);
  // Поки відповідь чекає на ведучого, годинник стоїть (і відлік відсутності теж).
  if (running.heldAt !== null) return running;
  // «Хто я?»: підказки, чий час настав; без змін — той самий об'єкт.
  const opened = openDueClues(running, now);
  // Блеф (строго «>», як у timeOver і bluffAuto): фаза вигадок, що сплила, перемикається на вибір зі своїм таймером від now; вибір закриває гілка нижче.
  if (bluffPlayOf(opened)?.bluff.stage === 'lies') {
    const due = closesAt(opened);
    return due !== null && now > due ? startChoice(opened, now) : opened;
  }
  // Ланцюжок закривається, коли кожен пройшов або вичерпав свій час зі штрафом.
  if (opened.plays[opened.questionIndex]?.question.type === 'chain' && chainDone(opened, now)) return lockNow(opened);
  // Звичайна клітинка без таймера закривається, коли гравець, чий хід, відсутній 30 секунд.
  const since = opened.board?.awaySince ?? null;
  if (since !== null && awayWatched(opened) !== null && now >= since + BOARD_AWAY_MS) return lockNow(opened);
  if (opened.plays[opened.questionIndex]?.blitz !== undefined) {
    const settled = settleQueue(opened, now);
    return blitzDone(settled, now) ? lockNow(settled) : settled;
  }
  // «Мільйонер»: голосування залу, що сплило (з endsAt включно), закривається.
  const voted = audienceOpen(opened) && now >= (ladderPlayOf(opened)?.ladder.lifelines.audience?.endsAt ?? Infinity) ? closeAudience(opened) : opened;
  // Запитання чекає на особистий кінець того, хто ще не відповів.
  const closes = closesAt(voted);
  const expired = closes !== null && now >= closes;
  return expired ? lockNow(voted) : voted;
}

/** Етап вибору клітинки: стартує відлік для відключеного гравця й пропускає хід, коли 30 секунд сплило. */
function tickBoard(state: GameState, board: BoardState, now: number): GameState {
  const chooser = chooserOf(state);
  const away = chooser !== null && state.players.some((p) => p.id === chooser && !p.connected);
  if (board.awaySince === null) return away ? { ...state, board: { ...board, awaySince: now } } : state;
  if (now < board.awaySince + BOARD_AWAY_MS) return state;
  return enterBoard({ ...state, board: advanceTurn(board) }, now);
}

/** Під час розкриття гравець, чий хід, без оцінки отримує «неправильно» (зі штрафом, якщо він увімкнений); бліц-клітинку не зачіпає. */
function unansweredIsWrong(state: GameState): GameState {
  const round = currentRound(state);
  const play = state.plays[state.questionIndex];
  if (round?.type !== 'board' || play?.board === undefined || play.board.kind === 'blitz') return state;
  const { chooserId } = play.board;
  if (!state.players.some((p) => p.id === chooserId) || recordOf(state, state.questionIndex, chooserId) !== undefined) return state;
  const points = boardPoints(round, play.board, 0);
  return withRecord(state, chooserId, {
    answer: play.board.answer,
    timeMs: limitMsOf(play) ?? 0,
    accepted: false,
    accuracy: 0,
    grade: 'wrong',
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: false,
  });
}

/** Ходи раунду поля, ставки фіналу й учасник «Мільйонера» починаються з нуля; ключ ladder є лише в раунді «Мільйонер». */
function enterRound(input: GameState): GameState {
  const { ladder: _ladder, ...state } = input;
  const type = state.quiz.rounds[state.roundIndex]?.type;
  return {
    ...state,
    board: type === 'board' ? initBoard(state) : null,
    final: type === 'final' ? { limits: {}, wagers: {}, allIn: [], order: [], shown: 0, split: false } : null,
    ...(type === 'ladder' ? { ladder: { contestantId: null, drawn: false } } : {}),
  };
}

/** Заставка фіналу → таємні ставки; межа ставки max(0, рахунок), таймера немає. */
function enterWager(state: GameState, final: FinalState): GameState {
  const limits = Object.fromEntries(state.players.map((p) => [p.id, Math.max(0, p.score)]));
  return { ...state, phase: 'wager', startedAt: null, endsAt: null, remainingMs: null, final: { ...final, limits } };
}

export function next(state: GameState, now: number, rng: Rng = Math.random): Result {
  if (state.paused) return fail('paused');
  // Дуель вклинюється між кроками гри: оголошена стартує замість кроку, після підсумку гра йде далі.
  if (state.phase === 'duel') return advanceDuel(state, now, rng);
  // «100 до 1»: на розкритті кожне «Далі» спершу відкриває ще один рядок знизу; дуель, що чекає, — після останнього рядка.
  if (state.phase === 'reveal') {
    const surveyPlay = surveyPlayOf(state);
    if (surveyPlay !== null && surveyPlay.survey.shown < surveyPlay.question.rows.length) return ok(stepSurvey(state));
    // Блеф: так само по варіанту, найменше вибрані першими, правда остання.
    const bluffPlay = bluffPlayOf(state);
    if (bluffPlay !== null && bluffPlay.bluff.shown < bluffOrder(bluffPlay).length) return ok(stepBluff(state));
  }
  // «Як грати» гортається до будь-яких дуелей (на guide їх і не буває): на останній сторінці — перший раунд.
  if (state.phase === 'guide') {
    return ok(state.guidePage + 1 < guidePages(state.quiz).length ? { ...state, guidePage: state.guidePage + 1 } : enterFirstRound(state, now));
  }
  if (duelDue(state)) return ok(beginDuel(state, now));
  switch (state.phase) {
    case 'intro':
      if (currentRound(state)?.type === 'board') return dicePending(state.board) ? fail('dice_pending') : ok(enterBoard(state, now));
      if (state.final !== null) return ok(enterWager(state, state.final));
      // «Мільйонер»: без учасника «Далі» — жереб чи «найменші бали» (етап лишається intro); з учасником — перше запитання.
      if (inLadderRound(state) && (state.ladder?.contestantId ?? null) === null) return drawContestant(state, rng);
      return ok(advance(state, now, rng));
    case 'wager':
      return ok(openFinalQuestion(state, now, rng));
    case 'locked':
      if (finalPlayOf(state) !== undefined) return ok(settleFinalWithOrder({ ...state, phase: 'reveal' }));
      return ok(currentRound(state)?.type === 'board' ? withTotals(unansweredIsWrong({ ...state, phase: 'reveal' })) : { ...state, phase: 'reveal' });
    case 'reveal':
      if (state.final !== null && finalPlayOf(state) !== undefined) {
        // Гравці розкриваються по одному; рейтингу між запитаннями після фіналу немає.
        if (state.final.shown < state.final.order.length) return ok({ ...state, final: { ...state.final, shown: state.final.shown + 1 } });
        // Після останнього гравця банк (якщо він не порожній) розподіляється окремим кроком.
        if (needsSplit(state)) return ok({ ...state, final: { ...state.final, split: true } });
        return ok(finishRound(state, now));
      }
      if (currentRound(state)?.type === 'board') {
        if (!hasActiveCells(state)) return ok(finishRound(state, now));
        return ok(state.quiz.settings.leaderboard === 'each' ? { ...state, phase: 'leaderboard' } : enterBoard(state, now));
      }
      // «Вибування»: після кожного запитання (і останнього) — сторінка «живі / привиди» з вердиктом чи випробуванням,
      // незалежно від налаштування leaderboard; кінець раунду — з неї.
      if (currentRound(state)?.type === 'survival') return ok(openTrialOrBoard(state, now, rng));
      // «Мільйонер»: після кожного запитання (і останнього) — драбина з рішенням чи підсумком, незалежно від налаштування leaderboard.
      if (inLadderRound(state)) return ok(settleStep(state, now));
      if (nextQuestion(state) === undefined) return ok(finishRound(state, now));
      // «Ва-банк»: драбина з вікном рішення після кожного запитання, крім останнього, незалежно від налаштування leaderboard.
      if (currentRound(state)?.type === 'wipeout') return ok(openDecision(state, now));
      if (state.quiz.settings.leaderboard === 'each') return ok({ ...state, phase: 'leaderboard' });
      return ok(advance(state, now, rng));
    case 'leaderboard':
      if (currentRound(state)?.type === 'board') return ok(enterBoard(state, now));
      // «Мільйонер»: підсумок — кінець раунду; поки учасник не вирішив, далі не можна; «Граю далі» — наступне запитання.
      if (inLadderRound(state)) {
        if ((ladderPlayOf(state)?.ladder.outcome ?? null) !== null) return ok(finishRound(state, now));
        if (decisionPending(state)) return fail('deciding');
        return ok(advance(state, now, rng));
      }
      // «Ва-банк»: поки гравці вирішують, далі не можна; без тих, хто в грі, advance завершує раунд.
      if (decisionOpen(state)) return fail('deciding');
      // «Вибування»: відкрите випробування «Далі» закриває; інакше — наступне запитання або кінець раунду з бонусом.
      if (trialOpen(state)) return ok(closeTrial(state));
      return ok(advance(state, now, rng));
    case 'round_end':
      // Нова серія в новому раунді починається з нуля.
      return ok(roundSplash(withTotals(enterRound({ ...state, phase: 'intro', roundIndex: state.roundIndex + 1 })), now));
    default:
      return fail('wrong_phase');
  }
}

const IN_ROUND: Phase[] = ['intro', 'wager', 'board', 'question', 'locked', 'reveal', 'leaderboard', 'duel'];

/** Ведучий завершує раунд достроково; незіграні запитання раунду так і лишаються незіграними. */
export function endRound(state: GameState, now: number): Result {
  if (!IN_ROUND.includes(state.phase)) return fail('wrong_phase');
  // Поточна дуель скасовується (оголошена, ще не почата, лишається й стартує з round_end).
  // «Ва-банк»: відкрите вікно рішення закривається, невирішені забирають банк; запитання, чия заставка ще грає, незігране.
  // «Вибування»: відкрите випробування закривається, як після кінця часу.
  const current =
    state.phase === 'duel' ? dropDuel(state) : decisionOpen(state) ? closeDecision(state) : trialOpen(state) ? closeTrial(state) : dropUnstarted(state, now);
  // Відкрите запитання спершу закривається й оцінюється, як при lock; «Мільйонер» — після підсумку: відкрите для учасника не рахується.
  const closed = current.phase === 'question' ? lockNow(stopLadder(current, now)) : current;
  // Після відкриття запитання фіналу мовчання оцінюється, а всіх вважають розкритими.
  const settled = finalPlayOf(closed) !== undefined ? closeFinal(closed) : closed;
  return ok(finishRound({ ...settled, paused: false, startedAt: null, endsAt: null, remainingMs: null }, now));
}

export function pause(state: GameState, now: number): Result {
  if (state.paused) return fail('paused');
  if (state.phase === 'lobby' || state.phase === 'finished') return fail('wrong_phase');
  // Під час утримання годинник уже стоїть: пауза його не чіпає.
  if (state.phase === 'question' && state.heldAt !== null) return ok({ ...state, paused: true, pausedAt: now });
  const leaderboardClock = state.phase === 'leaderboard' && (decisionOpen(state) || trialOpen(state));
  if ((state.phase === 'question' || state.phase === 'duel' || leaderboardClock) && state.endsAt !== null) {
    // Лише таймер запитання (не більше за ліміт): залишок заставки до старту resume бере із самої заставки.
    const remainingMs = Math.max(0, state.endsAt - Math.max(now, state.startedAt ?? now));
    // Витрачений додатковий час продовження не повертає.
    const trimmed = state.phase === 'question' ? trimOvertime(state, now) : state;
    return ok({ ...trimmed, paused: true, pausedAt: now, remainingMs, startedAt: null, endsAt: null });
  }
  return ok({ ...state, paused: true, pausedAt: now, board: clearAway(state.board) });
}

export function resume(state: GameState, now: number): Result {
  const result = resumeClock(state, now);
  if (!result.ok) return result;
  // Заставка, що не скінчилася до паузи, стоїть разом із годинником і дограє після неї.
  const pausedAt = state.pausedAt ?? now;
  // «Ва-банк»: якщо на паузі вирішили (чи вилучили) останніх, вікно закривається; «Вибування» — так само випробування.
  // «Мільйонер»: якщо на паузі відповіли (чи вийшли) останні глядачі, голосування залу закривається.
  return ok(settleTrial(settleDecision(settleAudience(shiftSplash(result.state, pausedAt, now - pausedAt)))));
}

function resumeClock(state: GameState, now: number): Result {
  if (!state.paused) return fail('wrong_phase');
  // Годинник стоїть і далі, доки ведучий не вирішить; якщо гравця вилучили на паузі, він рушає зараз.
  if (state.phase === 'question' && state.heldAt !== null) {
    // Якщо утримання знялося, а відповідати вже нікому, запитання закривається одразу.
    return ok(autoLock(settleQueue(releaseStaleHold({ ...state, paused: false, pausedAt: null }, now), now), now));
  }
  // Заставка, що не скінчилася до паузи, дограє першою, і лише потім рушає таймер.
  const lead = splashLead(state, state.pausedAt ?? now);
  // Вікно рішення «Ва-банк» і випробування «Вибування» продовжуються з того самого залишку; заставка випробування дограє першою
  // («Ва-банк» заставки не має — lead 0).
  if (state.phase === 'leaderboard' && state.remainingMs !== null) {
    const startedAt = now + lead;
    return ok({ ...state, paused: false, pausedAt: null, remainingMs: null, startedAt, endsAt: startedAt + state.remainingMs });
  }
  if (state.phase === 'duel' && state.remainingMs !== null) {
    const endsAt = now + lead + state.remainingMs;
    const startedAt = endsAt - (state.quiz.duels?.timeLimit ?? 0) * 1000;
    return ok({ ...state, paused: false, pausedAt: null, remainingMs: null, endsAt, startedAt });
  }
  if (state.phase === 'question' && state.remainingMs !== null) {
    const limitMs = limitMsOf(state.plays[state.questionIndex]) ?? 0;
    const endsAt = now + lead + state.remainingMs;
    // startedAt зсувається так, щоб час відповіді не включав паузу.
    const shift = now - (state.pausedAt ?? now);
    // Підвисання в сортуванні зсувається разом із годинником.
    const resumed = shiftSortLocks({ ...state, paused: false, pausedAt: null, remainingMs: null, endsAt, startedAt: endsAt - limitMs }, shift);
    // Чергу, яку не розглядали на паузі (наприклад, після вилучення голови), розглядаємо зараз.
    return ok(autoLock(settleQueue(shiftQueue(shiftDebuffClocks(shiftBuffClocks(shiftLadderClocks(resumed, shift), shift), shift), shift), now), now));
  }
  if (state.phase === 'question' && !timedPlay(state.plays[state.questionIndex])) {
    // Без таймера зсуваються лише startedAt і вікна черги: пауза не входить у час відповіді.
    const shift = now - (state.pausedAt ?? now);
    const resumed = {
      ...state,
      paused: false,
      pausedAt: null,
      startedAt: state.startedAt === null ? null : state.startedAt + shift,
    };
    // Відлік відсутності пауза скинула; гравець, якого досі немає, знову має повні 30 секунд.
    return ok(watchAway(autoLock(settleQueue(shiftQueue(shiftDebuffClocks(shiftBuffClocks(shiftLadderClocks(resumed, shift), shift), shift), shift), now), now), now));
  }
  const resumed = { ...state, paused: false, pausedAt: null };
  // Після паузи відсутній гравець знову має повні 30 секунд.
  return ok(resumed.phase === 'board' ? enterBoard(resumed, now) : resumed);
}

/** Оцінка ведучого на полі: у питанні (голос або ручна перевірка після відповіді), після закриття й на розкритті. */
function overrideBoard(state: GameState, round: BoardRound, playerId: string, grade: Grade, now: number | undefined): Result {
  const play = state.plays[state.questionIndex];
  const board = play?.board;
  const phase = state.phase;
  if (board === undefined || (phase !== 'question' && phase !== 'locked' && phase !== 'reveal')) return fail('wrong_phase');
  // Оцінка бліц-клітинки остаточна, як у бліц-раунді.
  if (board.kind === 'blitz') return fail('wrong_phase');
  if (phase === 'question' && board.answerMode !== 'voice' && board.answer === null) return fail('wrong_phase');
  if (playerId !== board.chooserId || !state.players.some((p) => p.id === playerId)) return fail('not_found');
  if (grade === 'partial' && rulesOf(round).partial === null) return fail('partial_disabled');
  const accuracy = grade === 'correct' ? 1 : grade === 'partial' ? (rulesOf(round).partial ?? 0) / 100 : 0;
  const existing = recordOf(state, state.questionIndex, playerId);
  const limitMs = limitMsOf(play) ?? 0;
  const spentMs =
    phase === 'question' && now !== undefined && state.startedAt !== null ? Math.max(0, clockOf(state, now) - state.startedAt) : limitMs;
  const timeMs = existing?.timeMs ?? spentMs;
  // Картинка, що проявляється: оцінка ведучого — правильність, час до надсилання знижує ціну, як в acceptAnswer.
  // «Хто я?» на усній клітинці — за підказкою, відкритою ведучим (після оцінки запитання закрите, число не змінюється).
  const paid = accuracy * paceFactor(questionFor(state, play, playerId), timeMs, cluesByHost(play) ? cluesOpen(play) : undefined);
  const points = boardPoints(round, board, paid);
  const record: AnswerRecord = {
    answer: existing?.answer ?? board.answer,
    timeMs,
    accepted: grade === 'correct',
    accuracy: paid,
    grade,
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: phase === 'reveal',
  };
  const graded = withRecord(state, playerId, record);
  if (phase !== 'question') return ok(withTotals(graded));
  // Оцінка відповіді з телефона одразу розкривається; усна відповідь лише закриває запитання.
  return ok(board.answer !== null ? revealNow(graded) : lockNow(graded));
}

/** Оцінка ведучого у фіналі: після закриття й на розкритті; лише для гравця з відповіддю, без «частково». */
function overrideFinal(state: GameState, playerId: string, grade: Grade): Result {
  const play = finalPlayOf(state);
  if (play === undefined || (state.phase !== 'locked' && state.phase !== 'reveal')) return fail('wrong_phase');
  const record = recordOf(state, state.questionIndex, playerId);
  if (!state.players.some((p) => p.id === playerId) || record === undefined || record.answer === null) return fail('not_found');
  if (grade === 'partial') return fail('partial_disabled');
  const correct = grade === 'correct';
  const points = finalPoints(wagerOf(play.final, playerId), correct);
  const updated: AnswerRecord = {
    ...record,
    accepted: correct,
    accuracy: correct ? 1 : 0,
    grade,
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: state.phase === 'reveal',
  };
  const graded = play.final.graded.includes(playerId) ? play.final.graded : [...play.final.graded, playerId];
  const recorded = withRecord(state, playerId, updated);
  return ok(withTotals(withCurrentPlay(recorded, { ...recorded.plays[recorded.questionIndex], final: { ...play.final, graded } })));
}

/** Ведучий вручну виставляє оцінку відповіді на поточне запитання. */
export function override(state: GameState, playerId: string, grade: Grade, now?: number): Result {
  // Ланцюжок перевіряється за літерами однозначно; зміна одного вердикту зсунула б бали інших.
  // Сортування й стіна так само однозначні: сервер перевіряв кожен хід. «100 до 1» — за дошкою (і на полі). Блеф — вибір однозначний.
  // Опитування й хмара без балів не оцінюються.
  // Після «Заміни запитання» гравець відповідав на запасне: рішення — за його запитанням (на полі — того, хто вибрав клітинку).
  const active = state.plays[state.questionIndex];
  const target = active?.board?.chooserId ?? playerId;
  const type = active === undefined ? undefined : questionFor(state, active, target).type;
  if (type === 'chain' || type === 'sort' || type === 'wall' || type === 'survey' || type === 'bluff') return fail('wrong_phase');
  if (type !== undefined && isUnscored({ type })) return fail('wrong_phase');
  const current = currentRound(state);
  if (current?.type === 'board') return overrideBoard(state, current, playerId, grade, now);
  if (current?.type === 'final') return overrideFinal(state, playerId, grade);
  // «Вибування»: на сторінці після розкриття — оцінка відповіді на питання на виживання (після закриття випробування).
  if (current?.type === 'survival' && state.phase === 'leaderboard') return overrideTrial(state, playerId, grade);
  if (state.phase !== 'reveal') return fail('wrong_phase');
  const play = state.plays[state.questionIndex];
  const { question, roundIndex } = play;
  const round = state.quiz.rounds[roundIndex];
  // Оцінка в бліці остаточна, навіть для гравця без запису.
  if (round.type === 'blitz') return fail('wrong_phase');
  const record = recordOf(state, state.questionIndex, playerId);
  if (record === undefined) return fail('not_found');
  // «Ва-банк»: лише правильно чи неправильно; банк і статус перераховує withTotals (withWipeoutPoints).
  if (round.type === 'wipeout') {
    if (grade === 'partial') return fail('partial_disabled');
    const correct = grade === 'correct';
    const graded: AnswerRecord = { ...record, accepted: correct, accuracy: correct ? 1 : 0, grade, basePoints: 0, streakBonus: 0, points: 0, overridden: true };
    return ok(withTotals(withRecord(state, playerId, graded)));
  }
  // «Мільйонер»: лише правильно чи неправильно; учасник — 0 балів (підсумок фіксується на «Далі»), глядач — 10 % рівня.
  if (round.type === 'ladder') {
    if (grade === 'partial') return fail('partial_disabled');
    const correct = grade === 'correct';
    const points = correct && play.ladder !== undefined && playerId !== play.ladder.contestantId ? hallPoints(play.ladder.level) : 0;
    const graded: AnswerRecord = { ...record, accepted: correct, accuracy: correct ? 1 : 0, grade, basePoints: points, streakBonus: 0, points, overridden: true };
    return ok(withTotals(withRecord(state, playerId, graded)));
  }
  if (grade === 'partial' && rulesOf(round).partial === null) return fail('partial_disabled');
  const accuracy = grade === 'correct' ? 1 : grade === 'partial' ? (rulesOf(round).partial ?? 0) / 100 : 0;
  const limit = answerLimitMs(play, playerId);
  // Картинка, що проявляється, бонусу швидкості не має, але оцінка ведучого зберігає плату за час:
  // «правильно» — це правильність, ціна все одно спадає зі 100 до 30 % за часом відповіді.
  // Після заміни гравець відповідав на запасне: проявлення — з його запитання, як у submitAnswer.
  const asked = questionFor(state, play, playerId);
  const speed = speedFactor(record.timeMs, limit ?? 0, speedOn(round) && limit !== null && !paysForTime(asked));
  const paid = accuracy * paceFactor(asked, record.timeMs);
  const points = answerPoints({
    points: question.points,
    accuracy: paid,
    speed,
    multiplier: rulesOf(round).multiplier,
    penalty: rulesOf(round).penalty,
  });
  const updated: AnswerRecord = {
    ...record,
    accepted: grade === 'correct',
    accuracy: paid,
    grade,
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: true,
  };
  return ok(withTotals(withRecord(state, playerId, updated)));
}

/** Ведучий завершує гру; з now — заставка «Підсумки». */
export function end(state: GameState, now?: number): Result {
  if (state.phase === 'lobby' || state.phase === 'finished') return fail('wrong_phase');
  // Поза фіналом closeFinal лише перераховує підсумки; у фіналі ще оцінює мовчання й розкриває всіх.
  // «Ва-банк»: банки тих, хто в грі, переносяться в бали; хто не відповів на відкрите запитання, згорає.
  // Відкрите вікно рішення спершу закривається: невирішені забирають банк.
  // Запитання, чия заставка ще грає, незігране: хто в грі, доносить банк, а не згорає.
  // «Вибування»: відкрите випробування закривається, як після кінця часу.
  // «Мільйонер»: підсумок драбини, якщо його ще немає (відкрите запитання для учасника не рахується).
  const decided = stopLadder(
    decisionOpen(state) ? closeDecision(state) : trialOpen(state) ? closeTrial(state) : dropUnstarted(state, now),
    now ?? 0,
  );
  const stopped: GameState = {
    ...withoutDuelists(dropQueue(scoreBluff(scoreWall(scoreSort(scoreChain(markWipeoutEnd(decided))))))),
    phase: 'finished',
    board: clearAway(state.board),
    paused: false,
    startedAt: null,
    endsAt: null,
    remainingMs: null,
    heldAt: null,
    duel: null,
  };
  // «Вибування»: кожен живий отримує бонус виживання (на finished відкрите запитання вже зараховане).
  const closed = closeFinal(awardSurvivalBonus(stopped, now ?? 0));
  return ok(now === undefined ? closed : withSplash(closed, 'podium', now));
}
