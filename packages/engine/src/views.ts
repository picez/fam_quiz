import {
  allSpares,
  allowedBuffs,
  allowedDebuffs,
  debuffPrice,
  boardCells,
  findCell,
  questionsOf,
  cellAnswerMode,
  questionPrice,
  roundQuestions,
  type Round,
  type Answer,
  type BlitzInfo,
  type BlitzPlayer,
  type BlitzRow,
  type BoardCell,
  type BoardCellView,
  type BoardInfo,
  type DiceInfo,
  type DuelInfo,
  type HostDuel,
  type PlayerDuel,
  type CellMark,
  type ChainInfo,
  type DebuffKind,
  type PlayerChain,
  type CloudWord,
  type HostCloudWord,
  type PlayerSort,
  type PlayerTable,
  type PlayerSurveyLine,
  type PlayerWall,
  type WallInfo,
  type WallRow,
  type SortInfo,
  type SurveyInfo,
  type BluffInfo,
  type BluffOptionView,
  type SurveyRowView,
  type SortRow,
  type Choice,
  type SurvivalInfo,
  type SurvivalRow,
  type SurvivalStatus,
  type WipeoutInfo,
  type LadderInfo,
  type LadderRound,
  type LadderStep,
  hallPoints,
  ladderPrize,
  LIFELINES,
  type WipeoutRow,
  type FinalEntry,
  type FinalInfo,
  type FinalSplit,
  type HostFinal,
  type HostBlitz,
  type HostBoard,
  type PlayerBlitz,
  type PlayerBuffs,
  type PlayerShop,
  type PlayerActiveBuff,
  type PlayerHint,
  type HintRequest,
  type HostResponse,
  type VotePrompt,
  type VoteTally,
  type OvertimeRow,
  type HostView,
  type Phase,
  type PlayerView,
  type RoundInfo,
  type PublicClues,
  type PinMark,
  type PublicQuestion,
  type QuestionAudio,
  type SliderMark,
  type Question,
  type RevealStats,
  type Spotlight,
  type Standing,
  type SplashKind,
  type SplashView,
  type StageView,
  guidePages,
  isUnscored,
  LIMITS,
  pinDistance,
  surveyHitsOf,
  surveyOrder,
  newcomersOn,
  roundBrief,
  rulesOf,
} from '@quiz/shared';
import { currentRound, finalOutcome, finalShown, finalVisiblePoints, needsSplit, recordOf, roundQuestionNumber, streakCounts, type BlitzPlay, type BoardPlay, type FinalState, type GameState, type LadderPlay, type Play, type PlayerState } from './game';
import { lastNotice } from './adjust';
import { activeDebuff, debuffsOff, ghostTarget, lastPurchase, shopBlock, shownDebuff } from './debuffs';
import { edgeNow, inSurvivalRound, survivalAlive, survivalOver, survivalPlayOf, survivalVerdict, SURVIVAL_LUCK_MS, trialOpen, trialQuestionOf } from './survival';
import { contestantOf, decisionPending, inLadderRound, lifelinesUsed } from './ladder';
import { decisionOpen, inWipeoutRound, wipeoutIn, wipeoutPlayOf, wipeoutTable } from './wipeout';
import {
  answerLimitMs,
  buffBlock,
  buffOf,
  buffRowHere,
  buffsUsed,
  canVote,
  currentBuffs,
  hasAnswered,
  lastBuff,
  presentedFor,
  questionFor,
  voteTally,
  type BuffPlay,
} from './buffs';
import { attemptsUsed, blitzRulesOf, isInstant } from './blitz';
import { chainDeadline, chainOf, hintMsOf, letterCount, maskWord } from './chain';
import { sortOf, sortsHere } from './sort';
import { wallOf, wallsHere } from './wall';
import { cloudTally, cloudVoters } from './votes';
import { bluffOrder, bluffShown } from './bluff';
import { skippedSurveys, surveyShown } from './survey';
import { duelCategoriesLeft, duelEnds, duelQuestionOf, duelWindowOpen } from './duel';
import { BOARD_AWAY_MS, cellPlayed, chooserOf, turnSchedule } from './board-turns';
import { cluesAnswered, cluesByHost, cluesOpen, nextClueAt } from './clues';
import { pendingOf } from './hold';
import { rankPlayers } from './ranking';
import { isTimed, limitMsOf, overtimeOf, remainingOf } from './timing';

const REVEALED: Phase[] = ['reveal', 'leaderboard', 'finished'];
const WITH_STANDINGS: Phase[] = ['leaderboard', 'round_end', 'finished'];
// У цих етапах запитання ще (або вже) немає: журнал показує лише останнє зігране.
const BETWEEN_QUESTIONS: Phase[] = ['lobby', 'guide', 'intro', 'board', 'wager', 'round_end', 'duel'];

/** Чи є поточне запитання. На finished останнє зігране показуємо, лише якщо воно з поточного раунду (інакше гру завершено з intro). */
function inQuestion(state: GameState): boolean {
  if (BETWEEN_QUESTIONS.includes(state.phase)) return false;
  return state.phase !== 'finished' || state.plays[state.questionIndex]?.roundIndex === state.roundIndex;
}

function currentQuestion(state: GameState): Question | null {
  if (!inQuestion(state)) return null;
  return state.plays[state.questionIndex]?.question ?? null;
}

/**
 * Запитання, яке бачать усі: на полі, якщо вибравший узяв заміну, — запасне з його порядком варіантів,
 * інакше поточне з state.presented. У класиці запасне бачить лише сам гравець (ownSpare).
 */
function shownQuestion(state: GameState): { question: Question; presented: string[] } | null {
  const question = currentQuestion(state);
  const play = state.plays[state.questionIndex];
  if (question === null || play === undefined) return null;
  if (play.board === undefined) return { question, presented: state.presented };
  const chooserId = play.board.chooserId;
  return { question: questionFor(state, play, chooserId), presented: presentedFor(state, play, chooserId) };
}

/** Запасне запитання гравця в класиці (з його порядком варіантів); null — гравець відповідає на те, що бачать усі. */
function ownSpare(state: GameState, playerId: string): { question: Question; presented: string[] } | null {
  const play = state.plays[state.questionIndex];
  if (currentQuestion(state) === null || play === undefined || play.board !== undefined) return null;
  if (buffOf(play, playerId)?.spare === undefined) return null;
  return { question: questionFor(state, play, playerId), presented: presentedFor(state, play, playerId) };
}

/** Копія запитання без підказки: сцена й гравці її не бачать ніколи, навіть на розкритті. */
function withoutHint(question: Question): Question {
  const { hint: _hint, ...rest } = question;
  return rest;
}

/** Копія запитання «100 до 1» без рядків дошки: сцена й телефони отримують їх лише з SurveyInfo, і то відкриті. Інші типи — без змін. */
function withoutSurveyRows(question: Question): Question {
  return question.type === 'survey' ? { ...question, rows: [] } : question;
}

/** Копія запитання-блефу без правди й запасних вигадок: вони приходять лише з відкритим варіантом. Інші типи — без змін. */
function withoutBluffSecrets(question: Question): Question {
  return question.type === 'bluff' ? { ...question, accepted: [], lies: [] } : question;
}

/**
 * Відповідь для сцени й телефонів: збіги «100 до 1» (rows) видали б дошку до розкриття, тож без revealed лишаються лише values.
 * Підсумок блефу (вибір, правда) до відкриття правди — null. Інші відповіді без змін.
 */
function publicAnswer<T extends Answer | null>(answer: T, revealed: boolean): T | Answer | null {
  if (answer === null) return answer;
  if (answer.type === 'bluff') return revealed ? answer : null;
  return answer.type === 'survey' && !revealed ? { type: 'survey', values: answer.values } : answer;
}

/** Запитання без правильної відповіді й підказки; choices у порядку presented. */
function publicQuestion(question: Question, presented: string[], clues: PublicClues | null = null): PublicQuestion {
  const source: Choice[] =
    question.type === 'order'
      ? question.items
      : question.type === 'single' || question.type === 'multi' || question.type === 'poll'
        ? question.options
        : [];
  const tiles = question.type === 'wall' ? question.groups.flatMap((group) => group.tiles) : [];
  const shown = (from: Choice[]) =>
    presented
      .map((id) => from.find((choice) => choice.id === id))
      .filter((choice): choice is Choice => choice !== undefined)
      .map((choice) => ({ id: choice.id, text: choice.text, ...(choice.imageUrl === undefined ? {} : { imageUrl: choice.imageUrl }) }));
  // У парах ліві елементи йдуть в авторському порядку, а presented описує правий стовпчик.
  const choices =
    question.type === 'match'
      ? question.pairs.map(({ left }) => ({ id: left.id, text: left.text }))
      : shown(source);
  const right = question.type === 'match' ? shown(question.pairs.map((pair) => pair.right)) : [];
  return {
    type: question.type,
    text: question.text,
    imageUrl: question.imageUrl,
    timeLimit: isTimed(question) ? question.timeLimit : null,
    video: question.video,
    points: question.points,
    choices,
    right,
    orderLabels: question.type === 'order' ? { top: question.topLabel ?? '', bottom: question.bottomLabel ?? '' } : null,
    chain:
      question.type === 'chain'
        ? { first: question.words[0], masks: question.words.slice(1).map((w) => maskWord(w, 1)), hintSeconds: question.hintSeconds }
        : null,
    sort:
      question.type === 'sort'
        ? {
            categories: question.categories.map(({ id, text }) => ({ id, text })),
            total: question.words.length,
            lockSeconds: question.lockSeconds,
          }
        : null,
    slider: question.type === 'slider' ? { min: question.min, max: question.max, step: question.step, unit: question.unit ?? '' } : null,
    clues: question.type === 'clues' ? clues : null,
    pin: question.type === 'pin' ? { map: question.map, aspect: question.aspect } : null,
    // Лише тексти в порядку показу: ні груп, ні назв, ні id плиток.
    wall:
      question.type === 'wall'
        ? {
            tiles: presented.map((id) => tiles.find((tile) => tile.id === id)?.text ?? ''),
            size: question.groups.length,
            groupCount: question.groups.length,
            maxMistakes: question.mistakes,
          }
        : null,
    cloud: question.type === 'wordcloud' ? { words: question.words } : null,
    // Лише кількості: тексти рядків — у SurveyInfo і лише відкриті.
    survey: question.type === 'survey' ? { answers: question.answers, rows: question.rows.length } : null,
    // Збережені кімнати — сирий JSON: відсутнє поле читаємо як «немає».
    audio: question.audio ? { duration: question.audio.duration, clip: question.audio } : null,
    reveal: question.reveal ?? null,
  };
}

/** Публічне запитання для телефона: джерело аудіо видало б, наприклад, назву пісні. */
function withoutClip(question: PublicQuestion): PublicQuestion {
  return question.audio === null ? question : { ...question, audio: { ...question.audio, clip: null } };
}

/** Публічне запитання, яке бачать усі; null поза запитанням. */
function shownPublic(state: GameState): PublicQuestion | null {
  const shown = shownQuestion(state);
  if (shown === null) return null;
  const question = publicQuestion(shown.question, shown.presented, publicClues(state));
  // «Мільйонер» без таймера: запитання з timeLimit, але відліку немає.
  const play = state.plays[state.questionIndex];
  return play?.ladder?.timed === false ? { ...question, timeLimit: null } : question;
}

/** Відкриті підказки показаного запитання «Хто я?» (на полі із заміною — запасного, а це простий тип, тож null); інакше null. */
function publicClues(state: GameState): PublicClues | null {
  const shown = shownQuestion(state);
  const play = state.plays[state.questionIndex];
  if (shown === null || play === undefined || shown.question.type !== 'clues' || shown.question !== play.question) return null;
  const { question } = shown;
  return {
    total: question.clues.length,
    shown: question.clues.slice(0, cluesOpen(play)),
    nextAt: nextClueAt(state),
    byHost: cluesByHost(play),
    intervalSeconds: question.interval,
  };
}

/**
 * Аудіо поточного запитання на етапах question, locked, reveal; інакше null. Для сервера (кнопки пульта).
 * На полі із заміною — аудіо того запитання, яке бачать усі.
 */
export function audioOf(state: GameState): QuestionAudio | null {
  if (state.phase !== 'question' && state.phase !== 'locked' && state.phase !== 'reveal') return null;
  return shownQuestion(state)?.question.audio ?? null;
}

/**
 * Позначки гравців на шкалі повзунка: за відстанню до правильного, далі за нікнеймом. null поза запитанням-повзунком і у фіналі.
 * Сцена — лише на reveal (раніше вони видали б правильність), ведучий — з етапу question.
 */
function sliderMarks(state: GameState, forHost: boolean): SliderMark[] | null {
  const phases: Phase[] = forHost ? ['question', 'locked', 'reveal'] : ['reveal'];
  const shown = shownQuestion(state);
  if (shown === null || shown.question.type !== 'slider' || !phases.includes(state.phase) || inFinalRound(state)) return null;
  const { correct } = shown.question;
  const board = state.plays[state.questionIndex]?.board !== undefined;
  const marks = state.players.flatMap((player): SliderMark[] => {
    const record = currentAnswers(state)[player.id];
    if (record === undefined || record.answer?.type !== 'slider' || (!board && record.spare !== undefined)) return [];
    return [{ playerId: player.id, nickname: player.nickname, value: record.answer.value, points: record.points }];
  });
  return marks.sort((a, b) => Math.abs(a.value - correct) - Math.abs(b.value - correct) || a.nickname.localeCompare(b.nickname, 'uk'));
}

/**
 * Точки гравців на мапі: за відстанню до правильної, далі за нікнеймом. null поза запитанням-точкою і у фіналі.
 * Сцена — лише на reveal, ведучий — з етапу question.
 */
function pinMarks(state: GameState, forHost: boolean): PinMark[] | null {
  const phases: Phase[] = forHost ? ['question', 'locked', 'reveal'] : ['reveal'];
  const shown = shownQuestion(state);
  if (shown === null || shown.question.type !== 'pin' || !phases.includes(state.phase) || inFinalRound(state)) return null;
  const question = shown.question;
  const board = state.plays[state.questionIndex]?.board !== undefined;
  const distance = (mark: PinMark) => pinDistance(question, mark.x, mark.y);
  const marks = state.players.flatMap((player): PinMark[] => {
    const record = currentAnswers(state)[player.id];
    if (record === undefined || record.answer?.type !== 'pin' || (!board && record.spare !== undefined)) return [];
    return [{ playerId: player.id, nickname: player.nickname, x: record.answer.x, y: record.answer.y, points: record.points }];
  });
  return marks.sort((a, b) => distance(a) - distance(b) || a.nickname.localeCompare(b.nickname, 'uk'));
}

/** Найменший і найбільший час запитань раунду з таймером; null — таймера немає в жодного. */
function timesOf(round: Round): { min: number; max: number } | null {
  // «Мільйонер» без таймера: час запитань не діє.
  if (round.type === 'ladder' && !round.timer) return null;
  const limits = roundQuestions(round).flatMap((q) => (isTimed(q) ? [q.timeLimit] : []));
  return limits.length === 0 ? null : { min: Math.min(...limits), max: Math.max(...limits) };
}

function roundInfo(state: GameState): RoundInfo | null {
  const round = currentRound(state);
  if (round === null) return null;
  return {
    index: state.roundIndex,
    total: state.quiz.rounds.length,
    title: round.title,
    type: round.type,
    partial: rulesOf(round).partial !== null,
    description: round.description ?? '',
    brief: roundBrief(round),
    times: timesOf(round),
  };
}

/** Відповіді на поточне запитання; поза запитанням порожні. */
function currentAnswers(state: GameState) {
  return !inQuestion(state) ? {} : (state.plays[state.questionIndex]?.answers ?? {});
}

/** Запис про відповідь гравця на поточне запитання; поза запитанням його немає. */
function currentRecord(state: GameState, playerId: string) {
  return !inQuestion(state) ? undefined : recordOf(state, state.questionIndex, playerId);
}

/** Серія гравця для показу: на етапі locked без поточного запитання, щоб не видати правильність. */
function shownStreak(state: GameState, player: PlayerState): number {
  return state.phase === 'locked' || spoilerHeld(state) ? previousStreak(state, player.id) : player.streak;
}

/** Серія гравця перед поточним запитанням: поспіль правильні відповіді в цьому раунді. */
function previousStreak(state: GameState, playerId: string): number {
  if (state.plays[state.questionIndex - 1]?.roundIndex !== state.roundIndex) return 0;
  return streakCounts(state, state.questionIndex)[playerId] ?? 0;
}

/** Поточне запитання з чергою (бліц-раунд або бліц-клітинка) з її правилами; null поза запитанням або без черги. */
function currentBlitz(state: GameState) {
  if (!inQuestion(state)) return null;
  const play = state.plays[state.questionIndex];
  const rules = play?.blitz === undefined ? null : blitzRulesOf(state, play);
  return play?.blitz !== undefined && rules !== null ? { play, blitz: play.blitz, rules } : null;
}

function blitzPlayer(state: GameState, playerId: string): BlitzPlayer {
  return { playerId, nickname: state.players.find((p) => p.id === playerId)?.nickname ?? '' };
}

function blitzWinner(state: GameState, attempts: { playerId: string; grade: string }[]): BlitzPlayer | null {
  const won = attempts.find((attempt) => attempt.grade === 'correct');
  return won === undefined ? null : blitzPlayer(state, won.playerId);
}

/**
 * Жива черга миттєвого бліцу: розглянуті спроби, потім нерозглянуті, потім не перевірені до закриття.
 * showPicks — чи показувати вибір (ведучому завжди, сцені й гравцям з розкриття).
 */
function blitzRows(state: GameState, blitz: BlitzPlay, showPicks: boolean): BlitzRow[] {
  const row = (playerId: string, timeMs: number, grade: BlitzRow['grade'], answer: Answer | null): BlitzRow => ({
    ...blitzPlayer(state, playerId),
    timeMs,
    grade,
    answer: showPicks ? answer : null,
  });
  return [
    ...blitz.attempts.map((a) => row(a.playerId, a.timeMs, a.grade, a.answer)),
    ...[...blitz.queue, ...blitz.dropped].map((e) => row(e.playerId, e.timeMs, null, e.answer)),
  ];
}

/**
 * Черга й переможець. Сцені й гравцям без відповідей: переможець з розкриття (у миттєвому бліці вже з locked,
 * бо його ім'я відповіді не розкриває), вибір у рядках — з розкриття. Ведучому все одразу.
 */
function blitzInfo(state: GameState, forHost: boolean): BlitzInfo | null {
  const open = currentBlitz(state);
  if (open === null) return null;
  const instant = isInstant(open.rules);
  const revealed = isRevealed(state);
  const showWinner = forHost || revealed || (instant && state.phase === 'locked');
  return {
    queue: open.blitz.queue.map((entry) => blitzPlayer(state, entry.playerId)),
    winner: showWinner ? blitzWinner(state, open.blitz.attempts) : null,
    instant,
    rows: instant ? blitzRows(state, open.blitz, forHost || revealed) : [],
  };
}

function playerBlitz(state: GameState, playerId: string): PlayerBlitz | null {
  const open = currentBlitz(state);
  if (open === null) return null;
  const { play, blitz, rules } = open;
  const instant = isInstant(rules);
  const index = blitz.queue.findIndex((entry) => entry.playerId === playerId);
  const used = attemptsUsed(play, playerId);
  const left = rules.attempts === null ? null : Math.max(0, rules.attempts - used);
  const running = state.phase === 'question' && !state.paused;
  const own = blitz.attempts.filter((attempt) => attempt.playerId === playerId);
  return {
    position: index < 0 ? null : index + 1,
    attemptsUsed: used,
    attemptsLeft: left,
    canBuzz: !instant && running && index < 0 && (left === null || left > 0),
    // Під час утримання вікно не йде.
    deadline: index < 0 || state.heldAt !== null ? null : blitz.queue[index].deadline,
    // Миттєвий бліц: перша відповідь або нова після «Перевибрати» (голова без відповіді).
    // Пауза не знімає права: поле лишається на місці вимкненим (набране не губиться), а сервер відмовить сам.
    canAnswer: instant && state.phase === 'question' && ((index < 0 && used === 0) || (index === 0 && blitz.queue[0].answer === null)),
    grade: own.length === 0 ? null : own[own.length - 1].grade,
  };
}

function hostBlitz(state: GameState): HostBlitz | null {
  const info = blitzInfo(state, true);
  const open = currentBlitz(state);
  if (info === null || open === null) return null;
  const { blitz, rules } = open;
  return {
    ...info,
    voice: rules.check === 'voice',
    manual: rules.check !== 'auto',
    queue: blitz.queue.map((e) => ({ ...blitzPlayer(state, e.playerId), answer: e.answer, deadline: e.deadline })),
    attempts: blitz.attempts.map((a) => ({
      ...blitzPlayer(state, a.playerId),
      answer: a.answer,
      grade: a.grade,
      points: a.points,
    })),
  };
}

/** Поточне запитання поля з його раундом; null поза запитанням або поза раундом поля. */
function currentBoardPlay(state: GameState) {
  if (!inQuestion(state)) return null;
  const play = state.plays[state.questionIndex];
  const round = play === undefined ? undefined : state.quiz.rounds[play.roundIndex];
  return round?.type === 'board' && play?.board !== undefined ? { board: play.board, round } : null;
}

/** Прибрані 50/50 вибравшого відкритої клітинки поля; інакше []. Варіанти поля видно всім, правильний ніколи не прибирається. */
function boardRemoved(state: GameState): string[] {
  const open = currentBoardPlay(state);
  return open === null ? [] : (buffOf(state.plays[state.questionIndex], open.board.chooserId)?.removed ?? []);
}

const BOARD_PHASES: Phase[] = ['intro', 'board', 'question', 'locked', 'reveal', 'leaderboard'];

/**
 * Поле для ролей: вид клітинок видно всім, формат запитань ні; forHost — справжні позначки всіх клітинок.
 * Сцені й гравцям ×2/×3 — сюрприз: позначка лише зіграної клітинки чи вибраної зараз.
 */
function boardInfo(state: GameState, forHost: boolean): BoardInfo | null {
  const round = currentRound(state);
  if (round?.type !== 'board' || state.board === null || !BOARD_PHASES.includes(state.phase)) return null;
  const open = currentBoardPlay(state);
  const turnId = state.phase === 'board' ? chooserOf(state) : (open?.board.chooserId ?? null);
  const cell = open === null ? undefined : findCell(round, open.board.cellId);
  const schedule = turnSchedule(state);
  const shownMark = (cell: BoardCell): CellMark =>
    forHost || cellPlayed(state, cell.question.id) || cell.question.id === open?.board.cellId ? cell.mark : 'none';
  return {
    categories: round.categories.map((category) => ({
      id: category.id,
      title: category.title,
      cells: category.cells.map(
        (cell): BoardCellView => ({
          id: cell.question.id,
          price: questionPrice(cell.question),
          played: cellPlayed(state, cell.question.id),
          mark: shownMark(cell),
          kind: cell.kind,
          answerMode: cellAnswerMode(round, cell),
          penalty: cell.penalty,
        }),
      ),
    })),
    order: state.board.circle.map((id) => blitzPlayer(state, id)),
    // Ведучого гравця могли вилучити під час запитання.
    turn: turnId === null || !state.players.some((p) => p.id === turnId) ? null : blitzPlayer(state, turnId),
    cell:
      open === null || cell === undefined
        ? null
        : {
            id: open.board.cellId,
            category: cell.category.title,
            price: open.board.price,
            mark: cell.cell.mark,
            kind: open.board.kind,
            answerMode: open.board.answerMode,
            penalty: open.board.penalty,
          },
    dice: diceInfo(state),
    schedule: schedule.circles.map((circle) => ({ ...circle, order: circle.order.map((id) => blitzPlayer(state, id)) })),
    scheduleRepeats: schedule.repeats,
    skipAt: state.board.awaySince === null ? null : state.board.awaySince + BOARD_AWAY_MS,
    marks: (['x2', 'x3'] as const).filter((mark) => round.categories.some((c) => c.cells.some((cell) => cell.mark === mark))),
    marksHidden: !forHost,
  };
}

/** Кидки кубиків для всіх: секретів тут немає. */
function diceInfo(state: GameState): DiceInfo | null {
  const dice = state.board?.dice ?? null;
  if (dice === null) return null;
  return {
    rows: state.players.map((p) => ({
      ...blitzPlayer(state, p.id),
      throws: dice.throws[p.id] ?? [],
      waiting: dice.waiting.includes(p.id),
    })),
    tieBreak: dice.tour.length > 0 && dice.tourNo > 1,
    done: dice.tour.length === 0,
  };
}

function hostBoard(state: GameState): HostBoard | null {
  const info = boardInfo(state, true);
  const round = currentRound(state);
  if (info === null || round?.type !== 'board') return null;
  return {
    ...info,
    manual: info.cell?.answerMode === 'voice' || round.check === 'manual',
    answer: currentBoardPlay(state)?.board.answer ?? null,
  };
}

/**
 * Відповідь одного гравця для всіх ролей: поле з телефонами й бліц. Правильної відповіді тут немає.
 * У миттєвому бліці вибір видно лише в черзі: сцені й гравцям spotlight немає, ведучому — лише голова, що чекає.
 */
function spotlightOf(state: GameState, forHost: boolean): Spotlight | null {
  const spot = rawSpotlight(state, forHost);
  // Збіги «100 до 1» сцені й телефонам не потрібні: табло показує лише відкриті рядки.
  // Вердикт дошки теж чекає, поки ведучий не відкриє всі рядки.
  if (spot === null || forHost) return spot;
  return { ...spot, answer: publicAnswer(spot.answer, spot.answer?.type === 'bluff' && !spoilerHeld(state)), grade: spoilerHeld(state) ? null : spot.grade };
}

function rawSpotlight(state: GameState, forHost: boolean): Spotlight | null {
  // Сортування видно в SortInfo: підсумок одного гравця тут нічого не додає.
  if (currentQuestion(state)?.type === 'sort') return null;
  const instant = currentBlitz(state);
  if (instant !== null && isInstant(instant.rules) && !forHost) return null;
  const pending = pendingOf(state);
  if (pending !== null) return { ...blitzPlayer(state, pending.playerId), answer: pending.answer, grade: null };
  const blitz = currentBlitz(state);
  if (blitz !== null) {
    // Усна відповідь звучить у залі: на телефоні її немає.
    if (blitz.rules.check === 'voice' || isInstant(blitz.rules)) return null;
    const last = blitz.blitz.attempts[blitz.blitz.attempts.length - 1];
    return last === undefined ? null : { ...blitzPlayer(state, last.playerId), answer: last.answer, grade: last.grade };
  }
  const open = currentBoardPlay(state);
  if (open === null) return null;
  if (open.board.answerMode === 'voice') return voiceSpotlight(state, open.board);
  // Закрите запитання: відповідь без оцінки лишається помаранчевою, вердикт видно лише на розкритті.
  // Вилученого гравця вже немає: його відповідь не показуємо.
  if (state.phase === 'locked') {
    const { answer, chooserId } = open.board;
    if (answer === null || !state.players.some((p) => p.id === chooserId)) return null;
    return { ...blitzPlayer(state, chooserId), answer, grade: null };
  }
  if (state.phase !== 'reveal') return null;
  const record = currentRecord(state, open.board.chooserId);
  if (record === undefined || !state.players.some((p) => p.id === open.board.chooserId)) return null;
  return { ...blitzPlayer(state, open.board.chooserId), answer: record.answer, grade: record.grade };
}

/**
 * Усна клітинка: позначка ведучого помаранчева на question і locked, вердикт видно лише на розкритті.
 * Без позначки до розкриття spotlight немає; вилученого гравця не показуємо.
 */
function voiceSpotlight(state: GameState, board: BoardPlay): Spotlight | null {
  const { chooserId, named } = board;
  if (!state.players.some((p) => p.id === chooserId)) return null;
  const record = state.phase === 'reveal' ? currentRecord(state, chooserId) : undefined;
  if (record !== undefined) return { ...blitzPlayer(state, chooserId), answer: named ?? null, grade: record.grade };
  return named === undefined ? null : { ...blitzPlayer(state, chooserId), answer: named, grade: null };
}

const FINAL_PHASES: Phase[] = ['intro', 'wager', 'question', 'locked', 'reveal'];

/** Раунд фіналу в етапі, де показують дані фіналу; інакше null. */
function finalRoundOf(state: GameState) {
  const round = currentRound(state);
  return round?.type === 'final' && state.final !== null && FINAL_PHASES.includes(state.phase)
    ? { round, final: state.final }
    : null;
}

/** Бали банку після кроку розподілу; null у класиці й до розподілу. */
function splitOutcome(state: GameState) {
  const open = finalRoundOf(state);
  if (open === null || open.round.wagerMode !== 'bank' || !open.final.split) return null;
  return finalOutcome(state);
}

/**
 * Записи гравців із записом на запитання фіналу; після входу в reveal — у порядку розкриття, інакше в порядку гравців.
 * visible — для сцени й телефонів: «після» включає лише вже розкрите (finalVisiblePoints); ведучий бачить справжні бали.
 */
function finalEntries(state: GameState, visible: boolean): FinalEntry[] {
  const open = finalRoundOf(state);
  const play = inQuestion(state) ? state.plays[state.questionIndex] : undefined;
  if (open === null || play?.final === undefined) return [];
  const wagers = play.final.wagers;
  const outcome = splitOutcome(state);
  const entries = state.players.flatMap((player): FinalEntry[] => {
    const record = recordOf(state, state.questionIndex, player.id);
    if (record === undefined) return [];
    const before = player.score - record.points;
    // При поверненні ставок часток немає: сцена не показує «+0 з банку».
    const won = outcome !== null && !outcome.refund && record.grade === 'correct' && Object.hasOwn(outcome.points, player.id);
    return [
      {
        playerId: player.id,
        nickname: player.nickname,
        answer: record.answer,
        grade: record.grade,
        wager: Object.hasOwn(wagers, player.id) ? wagers[player.id] : 0,
        allIn: play.final?.allIn.includes(player.id) ?? false,
        before,
        after: visible ? before + finalVisiblePoints(state, player.id) : player.score,
        share: won ? outcome.points[player.id] : null,
      },
    ];
  });
  const place = (id: string) => {
    const index = open.final.order.indexOf(id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return open.final.order.length === 0 ? entries : [...entries].sort((a, b) => place(a.playerId) - place(b.playerId));
}

function finalInfo(state: GameState): FinalInfo | null {
  const open = finalRoundOf(state);
  if (open === null) return null;
  const reveal = state.phase === 'reveal';
  const shown = reveal ? finalEntries(state, true).filter((entry) => finalShown(state, entry.playerId)) : [];
  const mode = open.round.wagerMode;
  return {
    theme: open.round.title,
    placed: state.players.filter((p) => Object.hasOwn(open.final.wagers, p.id)).length,
    total: state.players.length,
    shown,
    left: reveal ? Math.max(0, open.final.order.length - open.final.shown) : 0,
    mode,
    // Банк росте лише з уже розкритими програвшими.
    bank: mode === 'bank' ? shown.filter((e) => e.grade !== 'correct').reduce((sum, e) => sum + e.wager, 0) : 0,
    split: finalSplit(state),
  };
}

/** Підсумок розподілу банку після кроку розподілу; частки — переможців з часткою > 0, за спаданням. */
function finalSplit(state: GameState): FinalSplit | null {
  const outcome = splitOutcome(state);
  const play = state.plays[state.questionIndex];
  if (outcome === null || play?.final === undefined) return null;
  const wagers = play.final.wagers;
  const shares = state.players
    .filter((p) => recordOf(state, state.questionIndex, p.id)?.grade === 'correct' && (outcome.points[p.id] ?? 0) > 0)
    .map((p) => ({ playerId: p.id, nickname: p.nickname, wager: Object.hasOwn(wagers, p.id) ? wagers[p.id] : 0, share: outcome.points[p.id] }))
    .sort((a, b) => b.share - a.share);
  return { bank: outcome.bank, refund: outcome.refund, shares };
}

function hostFinal(state: GameState): HostFinal | null {
  const info = finalInfo(state);
  const open = finalRoundOf(state);
  if (info === null || open === null) return null;
  const manual = open.round.check === 'manual';
  const play = state.plays[state.questionIndex];
  const graded = play?.final?.graded ?? [];
  const entries = finalEntries(state, false);
  // Ланцюжок і сортування перевіряються хід за ходом: ручної оцінки в них немає (override відмовляє).
  const gradable = play?.question.type !== 'chain' && play?.question.type !== 'sort';
  return {
    ...info,
    wagers: state.players.map((p) => ({ playerId: p.id, nickname: p.nickname, ...ownWager(open.final, p.id) })),
    entries,
    manual,
    pending: manual && gradable
      ? entries.flatMap((entry) =>
          entry.answer === null || graded.includes(entry.playerId)
            ? []
            : [{ playerId: entry.playerId, nickname: entry.nickname, answer: entry.answer }],
        )
      : [],
    splitNext: state.phase === 'reveal' && open.final.shown >= open.final.order.length && needsSplit(state),
  };
}

/** Ставка гравця (null — ще не поставив), межа й ознака ва-банку: ставка дорівнює межі й більша за 0. */
function ownWager(final: FinalState, playerId: string): { wager: number | null; limit: number; allIn: boolean } {
  const wager = Object.hasOwn(final.wagers, playerId) ? final.wagers[playerId] : null;
  const limit = Object.hasOwn(final.limits, playerId) ? final.limits[playerId] : 0;
  return { wager, limit, allIn: wager !== null && wager > 0 && wager === limit };
}

function playerFinal(state: GameState, playerId: string): { wager: number | null; limit: number; allIn: boolean } | null {
  const open = finalRoundOf(state);
  return open === null ? null : ownWager(open.final, playerId);
}

/** Поточне запитання-ланцюжок із його грою; null поза запитанням або для інших типів. */
function currentChain(state: GameState) {
  if (!inQuestion(state)) return null;
  const play = state.plays[state.questionIndex];
  return play?.question.type === 'chain' ? { play, question: play.question } : null;
}

/** Поступ усіх гравців без літер. */
function chainInfo(state: GameState): ChainInfo | null {
  const open = currentChain(state);
  if (open === null) return null;
  const rows = state.players.map((player) => {
    const record = recordOf(state, state.questionIndex, player.id);
    return {
      playerId: player.id,
      nickname: player.nickname,
      solved: chainOf(state, player.id).solved,
      hints: chainOf(state, player.id).hints,
      timeMs: record?.accepted ? record.timeMs : null,
      points: state.phase === 'reveal' && record !== undefined ? record.points : null,
    };
  });
  // sort стабільний: рівні лишаються в порядку гравців.
  rows.sort((a, b) => (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity) || b.solved - a.solved);
  return { total: open.question.words.length - 1, rows };
}

/** Особисті маски, штраф і годинник гравця; чужих літер тут немає. */
function playerChain(state: GameState, playerId: string): PlayerChain | null {
  const open = currentChain(state);
  if (open === null) return null;
  const { solved, shown, hints } = chainOf(state, playerId);
  const hidden = open.question.words.slice(1);
  const record = recordOf(state, state.questionIndex, playerId);
  const hintMs = hintMsOf(open.question);
  const penalty = hints * hintMs;
  const finished = record?.accepted === true;
  return {
    solved,
    masks: hidden.map((word, i) => (i < solved ? [...word] : maskWord(word, i === solved ? shown : 1))),
    hints,
    hintMs,
    canHint:
      state.phase === 'question' && !state.paused && record === undefined && solved < hidden.length && shown < letterCount(hidden[solved]) - 1,
    deadline: chainDeadline(state, playerId),
    remainingMs: state.paused && state.phase === 'question' && state.remainingMs !== null ? Math.max(0, state.remainingMs - penalty) : null,
    limitMs: limitMsOf(open.play) ?? 0,
    timeMs: finished ? record.timeMs : null,
  };
}

/** Поточне запитання-сортування з його грою; null поза запитанням або для інших типів. */
function currentSort(state: GameState) {
  if (!inQuestion(state)) return null;
  const play = state.plays[state.questionIndex];
  return play?.question.type === 'sort' ? { play, question: play.question } : null;
}

/** Прогрес гравців без слів; на полі — лише того, хто вибрав. */
function sortInfo(state: GameState): SortInfo | null {
  const open = currentSort(state);
  if (open === null) return null;
  const { play } = open;
  const players = play.board === undefined ? state.players : state.players.filter((p) => p.id === play.board?.chooserId);
  const rows = players.map((player): SortRow => {
    const record = recordOf(state, state.questionIndex, player.id);
    const progress = sortOf(state, player.id);
    return {
      playerId: player.id,
      nickname: player.nickname,
      sorted: progress.sorted.length,
      misses: progress.misses,
      timeMs: record?.accepted ? record.timeMs : null,
      points: state.phase === 'reveal' && record !== undefined ? record.points : null,
    };
  });
  const blitz = state.quiz.rounds[play.roundIndex]?.type === 'blitz';
  const closed = state.phase === 'locked' || state.phase === 'reveal';
  // Під час запитання рядки стоять у порядку гравців, щоб сцена не стрибала; ранжування — з locked.
  // sort стабільний: рівні лишаються в порядку гравців.
  if (closed) rows.sort((a, b) => (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity) || b.sorted - a.sorted);
  const won = blitz && closed ? state.players.find((p) => recordOf(state, state.questionIndex, p.id)?.accepted) : undefined;
  // Слова за абеткою: порядок автора видав би групування за категоріями.
  const words =
    play.board === undefined
      ? null
      : open.question.words.map(({ id, text }) => ({ id, text })).sort((a, b) => a.text.localeCompare(b.text, 'uk'));
  return { total: open.question.words.length, rows, winner: won === undefined ? null : blitzPlayer(state, won.id), words };
}

/** Власна поточна картка й стан гравця; чужих слів і правильних категорій тут немає. */
function playerSort(state: GameState, playerId: string): PlayerSort | null {
  const open = currentSort(state);
  if (open === null || !sortsHere(state, open.play, playerId)) return null;
  const progress = sortOf(state, playerId);
  const record = recordOf(state, state.questionIndex, playerId);
  const word = (id: string | null | undefined) => {
    const found = id === null || id === undefined ? undefined : open.question.words.find((w) => w.id === id);
    return found === undefined ? null : { id: found.id, text: found.text };
  };
  const paused = state.paused && state.pausedAt !== null;
  const lock = progress.lockedUntil;
  return {
    card: record === undefined ? word(progress.queue[0]) : null,
    sorted: progress.sorted.length,
    total: open.question.words.length,
    misses: progress.misses,
    lockedUntil: paused ? null : lock,
    lockRemainingMs: paused && lock !== null && state.pausedAt !== null ? Math.max(0, lock - state.pausedAt) : null,
    missed: word(progress.missed),
    canSort: state.phase === 'question' && !state.paused && record === undefined,
    timeMs: record?.accepted ? record.timeMs : null,
  };
}

/** Поточне запитання-стіна з його грою; null поза запитанням або для інших типів. */
function currentWall(state: GameState) {
  if (!inQuestion(state)) return null;
  const play = state.plays[state.questionIndex];
  return play?.question.type === 'wall' ? { play, question: play.question } : null;
}

/** Позиції (у state.presented) плиток знайдених груп гравця, у порядку знаходження. */
function foundTiles(state: GameState, question: Extract<Question, { type: 'wall' }>, playerId: string): number[][] {
  return wallOf(state, playerId).found.flatMap((id) => {
    const group = question.groups.find((g) => g.id === id);
    return group === undefined ? [] : [group.tiles.map((tile) => state.presented.indexOf(tile.id))];
  });
}

/**
 * Поступ стіни без назв груп. Пульт — з question; сцена й телефони в класиці — лише на reveal;
 * на полі всі ролі з question бачать стіну того, хто вибрав (з позиціями знайдених груп).
 */
function wallInfo(state: GameState, forHost: boolean): WallInfo | null {
  const open = currentWall(state);
  if (open === null) return null;
  const { play, question } = open;
  const onBoard = play.board !== undefined;
  if (!onBoard && !forHost && !REVEALED.includes(state.phase)) return null;
  const groupCount = question.groups.length;
  const players = onBoard ? state.players.filter((p) => p.id === play.board?.chooserId) : state.players;
  const rows = players.map((player): WallRow => {
    const record = recordOf(state, state.questionIndex, player.id);
    const progress = wallOf(state, player.id);
    const solved = progress.found.length === groupCount;
    return {
      playerId: player.id,
      nickname: player.nickname,
      found: progress.found.length,
      mistakes: progress.mistakes,
      locked: !solved && progress.mistakes >= question.mistakes,
      solved,
      points: state.phase === 'reveal' && record !== undefined ? record.points : null,
      tiles: onBoard || forHost ? foundTiles(state, question, player.id) : null,
    };
  });
  const timeOf = (row: WallRow) => (row.solved ? (recordOf(state, state.questionIndex, row.playerId)?.timeMs ?? Infinity) : Infinity);
  // sort стабільний: рівні лишаються в порядку гравців.
  rows.sort((a, b) => timeOf(a) - timeOf(b) || b.found - a.found || a.mistakes - b.mistakes);
  return { groupCount, rows };
}

/** Власна стіна гравця: лише позиції знайдених груп, без назв. */
function playerWall(state: GameState, playerId: string): PlayerWall | null {
  const open = currentWall(state);
  if (open === null || !wallsHere(state, open.play, playerId)) return null;
  const { question } = open;
  const progress = wallOf(state, playerId);
  const solved = progress.found.length === question.groups.length;
  return {
    found: foundTiles(state, question, playerId).map((tiles, color) => ({ tiles, color })),
    mistakes: progress.mistakes,
    maxMistakes: question.mistakes,
    locked: !solved && progress.mistakes >= question.mistakes,
    solved,
    canGuess: state.phase === 'question' && !state.paused && recordOf(state, state.questionIndex, playerId) === undefined,
  };
}

/** Поточне запитання «хмара слів» з його грою; null поза запитанням або для інших типів. */
function currentCloud(state: GameState) {
  if (!inQuestion(state)) return null;
  const play = state.plays[state.questionIndex];
  return play?.question.type === 'wordcloud' ? play : null;
}

/** Хмара для сцени: лише на reveal, без схованих слів і авторів, найчастіші LIMITS.cloudShown. */
function stageCloud(state: GameState): CloudWord[] | null {
  const play = currentCloud(state);
  if (play === null || !isRevealed(state)) return null;
  return cloudTally(play, state.players)
    .filter((entry) => !entry.hidden)
    .slice(0, LIMITS.cloudShown)
    .map(({ key, text, count }) => ({ key, text, count }));
}

/** Уся хмара для пульта: зі схованими словами й нікнеймами авторів. */
function hostCloud(state: GameState): HostCloudWord[] | null {
  const play = currentCloud(state);
  if (play === null) return null;
  return cloudTally(play, state.players).map(({ key, text, count, hidden, playerIds }) => ({
    key,
    text,
    count,
    hidden,
    by: playerIds.map((id) => state.players.find((p) => p.id === id)?.nickname ?? ''),
  }));
}

/** Рядки табло «100 до 1» поточного запитання з дошкою; null поза ним і на полі із заміною (там показано запасне). */
function currentSurvey(state: GameState) {
  const shown = shownQuestion(state);
  const play = state.plays[state.questionIndex];
  if (shown === null || play === undefined || shown.question !== play.question || play.question.type !== 'survey') return null;
  return { play, question: play.question };
}

/** «100 до 1» на розкритті, поки ведучий не відкрив усі рядки: бали, вердикт і серія видали б популярність і рядки, яких ще не видно. */
function surveyClosing(state: GameState): boolean {
  const open = currentSurvey(state);
  return open !== null && state.phase === 'reveal' && surveyShown(state, open.play) < open.question.rows.length;
}

/** Блеф поточного запитання з його грою; null поза ним. */
function currentBluff(state: GameState) {
  const shown = shownQuestion(state);
  const play = state.plays[state.questionIndex];
  if (shown === null || play === undefined || play.bluff === undefined || shown.question !== play.question || play.question.type !== 'bluff') return null;
  return { play, question: play.question };
}

/** Блеф на розкритті, поки ведучий не відкрив усі варіанти: бали, вердикт і серія видали б, який варіант правдивий. */
function bluffClosing(state: GameState): boolean {
  const open = currentBluff(state);
  return open !== null && state.phase === 'reveal' && bluffShown(state, open.play) < bluffOrder(open.play).length;
}

/** «Розкриття ще триває»: результат ховається, поки не відкрито всі рядки «100 до 1» чи всі варіанти блефу. */
function spoilerHeld(state: GameState): boolean {
  return surveyClosing(state) || bluffClosing(state);
}

/**
 * Блеф для всіх ролей. Фаза вигадок: лише лічильники (пульт — ще й вигадки наживо). Фаза вибору: варіанти в порядку показу
 * без kind/authors/pickedBy і без прибраних (пульт бачить усе). Розкриття: порядок розкриття, kind/authors/pickedBy лише відкритих.
 */
function bluffInfo(state: GameState, forHost: boolean): BluffInfo | null {
  const open = currentBluff(state);
  if (open === null) return null;
  const { play } = open;
  const bluff = play.bluff!;
  const names = (ids: string[]) => ids.flatMap((id) => state.players.find((p) => p.id === id)?.nickname ?? []);
  const written = state.players.filter((p) => Object.hasOwn(bluff.lies, p.id)).length;
  const picked = state.players.filter((p) => Object.hasOwn(bluff.picks, p.id)).length;
  const stage: BluffInfo['stage'] = isRevealed(state) ? 'reveal' : state.phase === 'question' ? bluff.stage : 'choice';
  const lies = forHost
    ? state.players.flatMap((p) => (Object.hasOwn(bluff.lies, p.id) ? [{ nickname: p.nickname, text: bluff.lies[p.id].text }] : []))
    : null;
  if (stage === 'lies') return { stage, written, picked, options: [], shown: 0, total: 0, lastOpenedId: null, lies };
  const full = (o: (typeof bluff.options)[number], isOpen: boolean): BluffOptionView => ({
    id: o.id,
    text: o.text,
    open: isOpen,
    kind: o.kind,
    authors: names(o.authors),
    pickedBy: names(Object.keys(bluff.picks).filter((id) => bluff.picks[id].optionId === o.id)),
    removed: o.removed,
  });
  const closed = (o: (typeof bluff.options)[number]): BluffOptionView => ({ id: o.id, text: o.text, open: false, kind: null, authors: null, pickedBy: null, removed: false });
  if (stage === 'choice') {
    const options = forHost ? bluff.options.map((o) => full(o, false)) : bluff.options.filter((o) => !o.removed).map(closed);
    return { stage, written, picked, options, shown: 0, total: 0, lastOpenedId: null, lies };
  }
  const order = bluffOrder(play);
  const shown = bluffShown(state, play);
  const lastOpenedId = shown > 0 ? order[shown - 1].id : null;
  if (forHost) {
    // Пульт: порядок розкриття, прибрані наприкінці.
    const options = order.map((o, index) => full(o, index < shown));
    const removed = bluff.options.filter((o) => o.removed).map((o) => full(o, false));
    return { stage, written, picked, options: [...options, ...removed], shown, total: order.length, lastOpenedId, lies };
  }
  // Сцена й телефони: порядок показу, як у виборі, щоб ні місце, ні черга не видали правду; відкриті несуть kind і імена.
  const opened = new Set(order.slice(0, shown).map((o) => o.id));
  const options = bluff.options.filter((o) => !o.removed).map((o) => (opened.has(o.id) ? full(o, true) : closed(o)));
  return { stage, written, picked, options, shown, total: order.length, lastOpenedId, lies };
}

/** Власний блеф гравця; truth і fooled — лише коли правду відкрито. */
function playerBluff(state: GameState, playerId: string): PlayerView['me']['bluff'] {
  const open = currentBluff(state);
  if (open === null) return null;
  const bluff = open.play.bluff!;
  const lie = Object.hasOwn(bluff.lies, playerId) ? bluff.lies[playerId].text : null;
  const own = bluff.options.filter((o) => !o.removed && o.authors.includes(playerId)).map((o) => o.id);
  const pick = Object.hasOwn(bluff.picks, playerId) ? bluff.picks[playerId].optionId : null;
  const answer = currentRecord(state, playerId)?.answer;
  const known = isRevealed(state) && !spoilerHeld(state) && answer?.type === 'bluff';
  return { lie, own, pick, truth: known ? answer.truth : null, fooled: known ? answer.fooled : null };
}

/**
 * Табло «100 до 1»: рядки за місцем; відкриті знизу (surveyShown). Сцена й телефони бачать text/popularity/by лише відкритих,
 * пульт — усю дошку, а by наживо з етапу question.
 */
function surveyInfo(state: GameState, forHost: boolean): SurveyInfo | null {
  const open = currentSurvey(state);
  if (open === null) return null;
  const { play, question } = open;
  const total = question.rows.length;
  const shown = surveyShown(state, play);
  const records = state.players.flatMap((player) => {
    const record = currentAnswers(state)[player.id];
    return record === undefined ? [] : [{ nickname: player.nickname, hits: surveyHitsOf(record.answer) ?? [] }];
  });
  const rows = surveyOrder(question.rows).map((row, index): SurveyRowView => {
    const rank = index + 1;
    const isOpen = rank > total - shown;
    if (!isOpen && !forHost) return { rank, open: false, text: null, popularity: null, by: null };
    return {
      rank,
      open: isOpen,
      text: row.text,
      popularity: row.popularity,
      by: records.filter((r) => r.hits.includes(row.id)).map((r) => r.nickname),
    };
  });
  return { source: play.survey?.source ?? 'host', total, shown, rows };
}

/** Власні відповіді «100 до 1» зі збігами: з розкриття й пізніше, лише для того, хто відповідав. */
function playerSurvey(state: GameState, playerId: string): { lines: PlayerSurveyLine[] } | null {
  const open = currentSurvey(state);
  const record = currentRecord(state, playerId);
  if (open === null || !isRevealed(state) || record?.answer?.type !== 'survey') return null;
  const order = surveyOrder(open.question.rows);
  const total = order.length;
  const shown = surveyShown(state, open.play);
  const hits = surveyHitsOf(record.answer) ?? [];
  const lines = record.answer.values.map((value, i): PlayerSurveyLine => {
    const place = order.findIndex((row) => row.id === hits[i]);
    // Поки не відкрито всю дошку, «мимо» теж у очікуванні: інакше методом виключення видно, що влучило.
    if (place < 0) return { value, rank: null, text: null, popularity: null, pending: shown < total };
    // Свій рядок видно, лише коли ведучий відкрив його на табло (місце > total − shown).
    if (place + 1 <= total - shown) return { value, rank: null, text: null, popularity: null, pending: true };
    return { value, rank: place + 1, text: order[place].text, popularity: order[place].popularity, pending: false };
  });
  return { lines };
}

/** Поточне запитання дуелі з його грою (етапи question, answer); інакше null. */
function currentDuelPlay(state: GameState) {
  const duel = state.duel;
  const stage = duel?.stage;
  if (duel === null || state.phase !== 'duel' || (stage !== 'question' && stage !== 'answer')) return null;
  const play = duel.questions.at(-1);
  return play === undefined ? null : play;
}

/** Неправильні спроби дуелянта в поточному запитанні дуелі; [] поза запитанням і для глядача. */
function duelTries(state: GameState, playerId: string): string[] {
  const play = currentDuelPlay(state);
  return play !== null && Object.hasOwn(play.tries, playerId) ? play.tries[playerId] : [];
}

/**
 * Дуель для всіх ролей. withAnswers — прийнятні написання й на етапі question (лише ведучому);
 * сцені й гравцям вони йдуть лише на answer. Текстів спроб тут немає, лише їх кількість.
 */
function duelInfo(state: GameState, withAnswers: boolean): DuelInfo | null {
  const duel = state.duel;
  const duels = state.quiz.duels;
  if (duel === null || duels === undefined) return null;
  const { challengerId, opponentId, stage } = duel;
  const question = duelQuestionOf(state);
  const play = currentDuelPlay(state);
  const answered = stage === 'answer' && play !== null;
  const count = (id: string) => duel.questions.filter((q) => q.winnerId === id).length;
  const categories = duelCategoriesLeft(state);
  return {
    challenger: blitzPlayer(state, challengerId),
    opponent: blitzPlayer(state, opponentId),
    stage,
    categories,
    category: categories.find((c) => c.id === duel.categoryId)?.title ?? null,
    number: stage === 'question' || stage === 'answer' || stage === 'result' ? duel.questions.length : 0,
    total: duel.categoryId === null ? duels.questionsPerDuel : duel.total,
    question: question?.text ?? null,
    accepted: question !== null && (withAnswers || stage === 'answer') ? question.accepted : null,
    wins: { challenger: count(challengerId), opponent: count(opponentId) },
    tries: { challenger: duelTries(state, challengerId).length, opponent: duelTries(state, opponentId).length },
    questionWinner: answered && play.winnerId !== null ? blitzPlayer(state, play.winnerId) : null,
    winningAnswer: answered ? play.answer : null,
    winner: stage === 'result' && duel.winnerId !== null ? blitzPlayer(state, duel.winnerId) : null,
    stake: duels.stake,
    ending: duelEnds(state),
  };
}

function hostDuel(state: GameState): HostDuel | null {
  const info = duelInfo(state, true);
  if (info === null || state.duel === null) return null;
  return {
    ...info,
    tryTexts: { challenger: duelTries(state, state.duel.challengerId), opponent: duelTries(state, state.duel.opponentId) },
  };
}

/** Кнопка «Дуель», власні спроби й права гравця; null — у вікторині немає дуелей. */
function playerDuel(state: GameState, playerId: string): PlayerDuel | null {
  if (state.quiz.duels === undefined) return null;
  const duel = state.duel;
  const closed =
    !duelWindowOpen(state) || state.duelsDeclared.includes(playerId) || duelCategoriesLeft(state).every((c) => c.left === 0);
  const opponents = state.players.filter((p) => p.id !== playerId).map((p) => blitzPlayer(state, p.id));
  const duelist = duel !== null && (duel.challengerId === playerId || duel.opponentId === playerId);
  return {
    rights: closed ? null : { canDeclare: duel === null && !state.paused && opponents.length > 0, opponents },
    tries: duelist ? duelTries(state, playerId) : [],
    canAnswer: duelist && state.phase === 'duel' && duel.stage === 'question' && !state.paused && currentDuelPlay(state)?.winnerId === null,
    canPick: state.phase === 'duel' && duel?.stage === 'category' && duel.challengerId === playerId && !state.paused,
  };
}

const WIPEOUT_PHASES: Phase[] = ['intro', 'question', 'locked', 'reveal', 'leaderboard', 'round_end', 'finished'];

/** Драбини раунду: real — як є; hidden — без рішень «Забрати» поточного вікна (те, що бачать сцена й телефони). */
function wipeoutTables(state: GameState) {
  const open = state.phase === 'question' || state.phase === 'locked';
  // Поточне запитання з вердиктом до розкриття не показуємо.
  const upTo = open ? state.questionIndex : undefined;
  const real = wipeoutTable(state, state.roundIndex, upTo);
  const play = wipeoutPlayOf(state);
  if (play === null || !decisionOpen(state) || play.wipeout.took.length === 0) return { real, hidden: real };
  const plays = state.plays.map((p) => (p === state.plays[state.questionIndex] ? { ...p, wipeout: { ...play.wipeout, took: [] } } : p));
  return { real, hidden: wipeoutTable({ ...state, plays }, state.roundIndex, upTo) };
}

/** «Ва-банк»: драбина з банками й станами; null поза раундом. forHost — рішення наживо. */
function wipeoutInfo(state: GameState, forHost: boolean): WipeoutInfo | null {
  const round = currentRound(state);
  if (round?.type !== 'wipeout' || !WIPEOUT_PHASES.includes(state.phase)) return null;
  const open = state.phase === 'question' || state.phase === 'locked';
  const { real, hidden } = wipeoutTables(state);
  const current = state.plays.slice(0, state.questionIndex + 1).filter((p) => p.roundIndex === state.roundIndex).length - 1;
  const play = wipeoutPlayOf(state);
  const windowOpen = play !== null && decisionOpen(state);
  const rows = state.players.map((p): WipeoutRow => {
    const standing = (forHost ? real : hidden)[p.id];
    const wasIn = hidden[p.id]?.status === 'in';
    const decision =
      !windowOpen || !wasIn
        ? null
        : play.wipeout.took.includes(p.id)
          ? forHost
            ? 'take'
            : 'decided'
          : play.wipeout.stay.includes(p.id)
            ? forHost
              ? 'stay'
              : 'decided'
            : 'pending';
    return { ...blitzPlayer(state, p.id), status: standing.status, bank: standing.bank, step: standing.step, decision };
  });
  const total = state.players.filter((p) => hidden[p.id]?.status === 'in').length;
  return {
    ladder: round.questions.map((q) => q.points),
    current,
    done: open ? Math.max(current, 0) : current + 1,
    rows,
    inCount: rows.filter((row) => row.status === 'in').length,
    decide: windowOpen
      ? { endsAt: state.endsAt, remainingMs: state.remainingMs, decided: rows.filter((r) => r.decision !== null && r.decision !== 'pending').length, total }
      : null,
  };
}

/** Власний стан гравця в «Ва-банк»; null поза раундом. */
function playerWipeout(state: GameState, playerId: string): PlayerView['me']['wipeout'] {
  if (wipeoutInfo(state, false) === null) return null;
  const { real, hidden } = wipeoutTables(state);
  const own = real[playerId];
  const play = wipeoutPlayOf(state);
  const windowOpen = play !== null && decisionOpen(state);
  const wasIn = hidden[playerId]?.status === 'in';
  const decision = windowOpen && wasIn ? (play.wipeout.took.includes(playerId) ? 'take' : play.wipeout.stay.includes(playerId) ? 'stay' : null) : null;
  return { status: own.status, bank: own.bank, decision, canDecide: windowOpen && wasIn && decision === null && !state.paused };
}

const LADDER_PHASES: Phase[] = ['intro', 'question', 'locked', 'reveal', 'leaderboard', 'round_end', 'finished'];
const LADDER_QUESTION_PHASES: Phase[] = ['question', 'locked', 'reveal'];

/** Останнє запитання «Мільйонера» поточного раунду з його драбиною; null — драбина ще не почалася. */
function ladderLast(state: GameState): (Play & { ladder: LadderPlay }) | null {
  const plays = state.plays.filter((p) => p.roundIndex === state.roundIndex && p.ladder !== undefined);
  const last = plays.at(-1);
  return last?.ladder === undefined ? null : { ...last, ladder: last.ladder };
}

/** Глядачі «Мільйонера»: усі, крім учасника, хто на зв'язку чи вже відповів. */
function ladderHall(state: GameState, play: Play & { ladder: LadderPlay }): string[] {
  return state.players
    .filter((p) => p.id !== play.ladder.contestantId && (p.connected || state.awaiting.includes(p.id) || Object.hasOwn(play.answers, p.id)))
    .map((p) => p.id);
}

/** Сходинки: пройдені, поточна й помилка — лише те, що вже розкрито. */
function ladderSteps(state: GameState, round: LadderRound, last: (Play & { ladder: LadderPlay }) | null): LadderStep[] {
  const stateOf = (i: number): LadderStep['state'] => {
    if (last === null || state.phase === 'intro') return 'ahead';
    const { step, outcome, contestantId } = last.ladder;
    if (state.phase === 'question' || state.phase === 'locked') return i < step ? 'passed' : i === step ? 'current' : 'ahead';
    if (state.phase === 'reveal') {
      if (i !== step) return i < step ? 'passed' : 'ahead';
      const right = last.answers[contestantId]?.grade === 'correct';
      return right || !state.players.some((p) => p.id === contestantId) ? 'current' : 'failed';
    }
    // leaderboard і далі: підсумок, якщо він є; інакше учасник правильно відповів і вирішує.
    if (outcome === null) return i <= step ? 'passed' : 'ahead';
    if (i < outcome.passed) return 'passed';
    return outcome.kind === 'wrong' && i === step ? 'failed' : 'ahead';
  };
  return round.levels.map((level, i) => ({ level, safe: round.safe.includes(i), state: stateOf(i) }));
}

/**
 * «Мільйонер»: драбина, учасник, підказки й зал. Нічого раніше розкриття: правильності залу немає до reveal,
 * підсумку драбини до leaderboard, вибору учасника до locked (пульт бачить наживо), підсумку залу до закриття голосування.
 */
function ladderInfo(state: GameState, forHost: boolean): LadderInfo | null {
  const round = currentRound(state);
  if (round?.type !== 'ladder' || !LADDER_PHASES.includes(state.phase)) return null;
  const last = ladderLast(state);
  const steps = ladderSteps(state, round, last);
  const passed = steps.filter((step) => step.state === 'passed').length;
  const open = last !== null && LADDER_QUESTION_PHASES.includes(state.phase);
  const contestantId = last?.ladder.contestantId ?? contestantOf(state);
  const lifelines = last?.ladder.lifelines ?? {};
  const used = lifelinesUsed(state);
  const audience = open ? lifelines.audience : undefined;
  const hall = last === null ? [] : ladderHall(state, last);
  const answered = last === null ? 0 : hall.filter((id) => Object.hasOwn(last.answers, id)).length;
  const seesPick = forHost ? open : state.phase === 'locked' || state.phase === 'reveal';
  const pick = last !== null && contestantId !== null && seesPick ? last.answers[contestantId]?.answer : null;
  const showHall = state.phase === 'reveal' || state.phase === 'leaderboard';
  const shownOutcome = state.phase === 'leaderboard' || state.phase === 'round_end' || state.phase === 'finished';
  const decision = state.phase === 'leaderboard' && last !== null ? (last.ladder.decision ?? (last.ladder.outcome === null ? 'pending' : null)) : null;
  return {
    contestant: contestantId !== null && state.players.some((p) => p.id === contestantId) ? blitzPlayer(state, contestantId) : null,
    pick: round.pick,
    drawn: state.ladder?.drawn ?? false,
    steps,
    current: last === null ? -1 : last.ladder.step,
    timer: round.timer,
    lifelines: LIFELINES.filter((kind) => round.lifelines.includes(kind)).map((kind) => ({
      kind,
      state: lifelines[kind] !== undefined ? ('active' as const) : used.includes(kind) ? ('used' as const) : ('ready' as const),
    })),
    fifty: open && lifelines.fifty !== undefined ? lifelines.fifty.removed : null,
    audience:
      audience === undefined || last === null
        ? null
        : {
            state: audience.closed ? 'closed' : 'voting',
            ...(audience.closed ? { endsAt: null, remainingMs: null } : voteClock(state, audience.endsAt)),
            voted: audience.closed ? Object.keys(audience.ballots).length : answered,
            total: hall.length,
            tally: audience.closed ? tallyOf(voteTally(last.question, audience.ballots)) : null,
          },
    hint: open && lifelines.hint !== undefined ? (lifelines.hint.text !== null ? 'text' : lifelines.hint.aloud ? 'aloud' : 'waiting') : null,
    contestantPick: pick?.type === 'single' ? pick.optionId : null,
    hall: {
      answered,
      total: hall.length,
      right: showHall && last !== null ? hall.filter((id) => last.answers[id]?.grade === 'correct').length : null,
    },
    decision,
    outcome: shownOutcome && last?.ladder.outcome != null ? { ...last.ladder.outcome } : null,
    banked: passed > 0 ? round.levels[passed - 1] : 0,
    guaranteed: ladderPrize(round.levels, round.safe, passed, 'wrong'),
  };
}

/** Підсумок залу без вільних відповідей: лише скільки й за які варіанти. */
function tallyOf(tally: ReturnType<typeof voteTally>): { cast: number; counts: Record<string, number> } {
  return { cast: tally.cast, counts: tally.counts };
}

/** Власний стан гравця в «Мільйонері»; null поза раундом. */
function playerLadder(state: GameState, playerId: string): PlayerView['me']['ladder'] {
  const info = ladderInfo(state, false);
  if (info === null) return null;
  const last = ladderLast(state);
  const contestant = info.contestant?.playerId === playerId;
  const open = last !== null && LADDER_QUESTION_PHASES.includes(state.phase);
  const hint = contestant && open ? last.ladder.lifelines.hint : undefined;
  const ended = state.phase === 'round_end' || state.phase === 'finished';
  return {
    role: contestant ? 'contestant' : 'hall',
    canLifeline: contestant && state.phase === 'question' && !state.paused && last !== null && !Object.hasOwn(last.answers, playerId),
    hint: hint === undefined ? null : playerHint(hint),
    canDecide: contestant && decisionPending(state) && !state.paused,
    hallClosed: !contestant && open && last.ladder.lifelines.audience?.closed === true,
    hallPoints: !contestant && open ? hallPoints(last.ladder.level) : null,
    won:
      contestant && ended
        ? state.adjustments.filter((a) => a.source === 'ladder' && a.roundIndex === state.roundIndex && a.playerId === playerId).reduce((sum, a) => sum + a.points, 0)
        : null,
  };
}

const SURVIVAL_PHASES: Phase[] = ['intro', 'question', 'locked', 'reveal', 'leaderboard', 'round_end', 'finished'];

/** Номер запитання раунду (з 1), після якого гравець вибув; null — не вибув. */
function survivalOutAfter(state: GameState, playerId: string): number | null {
  let number = 0;
  for (const play of state.plays) {
    if (play.roundIndex !== state.roundIndex) continue;
    number += 1;
    if (play.survival?.trial?.stage === 'closed' && play.survival.trial.out.includes(playerId)) return number;
  }
  return null;
}

/**
 * «Вибування»: живі, привиди, «на межі» (лише з розкриття), відповіді привидів (лише з розкриття) і випробування.
 * Поки випробування відкрите, ніхто (і пульт) не бачить пасток, правильної відповіді й чужої правильності; forHost — вибрані двері наживо.
 */
function survivalInfo(state: GameState, forHost: boolean): SurvivalInfo | null {
  const round = currentRound(state);
  if (round?.type !== 'survival' || !SURVIVAL_PHASES.includes(state.phase)) return null;
  const play = survivalPlayOf(state);
  const shown = play !== null && state.phase !== 'question' && state.phase !== 'locked';
  const alive = survivalAlive(state);
  const trial = play?.survival.trial ?? null;
  const edge = !shown ? [] : state.phase === 'reveal' ? edgeNow(state) : state.phase === 'leaderboard' ? (play.survival.edge ?? []) : [];
  const ghosts = play?.survival.ghosts ?? {};
  const rows = state.players.map((p): SurvivalRow => {
    const isOut = !alive.includes(p.id);
    const onEdge = edge.includes(p.id);
    // «На межі» — лише на розкритті й поки відкрите випробування: після закриття (чи коли ніхто не вибуває) знову живий.
    const status: SurvivalStatus = isOut ? 'ghost' : onEdge && (state.phase === 'reveal' || trial?.stage === 'open') ? 'edge' : 'alive';
    let trialState: SurvivalRow['trial'] = null;
    let door: SurvivalRow['door'] = null;
    if (trial !== null && onEdge) {
      const done = trial.kind === 'question' ? Object.hasOwn(trial.answers, p.id) : Object.hasOwn(trial.doors, p.id);
      trialState = trial.stage === 'open' ? (done ? 'done' : 'pending') : trial.out.includes(p.id) ? 'out' : 'safe';
      if (trial.kind === 'luck') {
        door =
          trial.stage === 'open'
            ? { picked: forHost ? (trial.doors[p.id] ?? null) : null, auto: false, trap: null }
            : { picked: trial.doors[p.id] ?? trial.fallback[p.id] ?? null, auto: !Object.hasOwn(trial.doors, p.id), trap: trial.traps[p.id] ?? null };
      }
    }
    return {
      ...blitzPlayer(state, p.id),
      status,
      outAfter: survivalOutAfter(state, p.id),
      ghost: Object.hasOwn(ghosts, p.id) ? { correct: shown ? ghosts[p.id].correct : null } : null,
      answer: trial?.stage === 'closed' && onEdge ? (trial.answers[p.id]?.answer ?? null) : null,
      trial: trialState,
      door,
    };
  });
  const ghostCount = rows.filter((row) => row.status === 'ghost').length;
  const used = state.plays.filter((p) => p.roundIndex === state.roundIndex && (p.survival?.trial?.questionId ?? null) !== null).length;
  const question = trialQuestionOf(state);
  const current = state.plays.slice(0, state.questionIndex + 1).filter((p) => p.roundIndex === state.roundIndex).length - 1;
  const settled = state.phase === 'leaderboard' && !trialOpen(state);
  return {
    current,
    total: round.questions.length,
    target: round.survivors,
    bonus: round.bonus,
    trialKind: round.trial,
    trialsLeft: round.trials.length - used,
    rows,
    aliveCount: rows.length - ghostCount,
    ghostCount,
    ghosts: {
      answered: Object.keys(ghosts).length,
      right: shown ? Object.values(ghosts).filter((g) => g.correct).length : null,
    },
    verdict: state.phase === 'reveal' || state.phase === 'leaderboard' ? survivalVerdict(state) : null,
    trial:
      state.phase !== 'leaderboard' || trial === null
        ? null
        : {
            kind: trial.kind,
            fellBack: trial.fellBack,
            stage: trial.stage,
            endsAt: state.endsAt,
            remainingMs: state.remainingMs,
            limitMs: question === null ? SURVIVAL_LUCK_MS : question.timeLimit * 1000,
            done: trial.kind === 'question' ? Object.keys(trial.answers).length : Object.keys(trial.doors).length,
            total: (play?.survival.edge ?? []).length,
            question: question === null ? null : withoutClip(publicQuestion(question, trial.presented)),
            reveal: question !== null && trial.stage === 'closed' ? withoutHint(question) : null,
          },
    ending: settled && (survivalOver(state) || current + 1 >= round.questions.length),
  };
}

/** Власний стан гравця в «Вибуванні»; null поза раундом. */
function playerSurvival(state: GameState, playerId: string): PlayerView['me']['survival'] {
  const info = survivalInfo(state, false);
  const row = info?.rows.find((r) => r.playerId === playerId);
  if (info === null || row === undefined) return null;
  const trial = state.phase === 'leaderboard' ? (survivalPlayOf(state)?.survival.trial ?? null) : null;
  const waiting = trial !== null && trial.stage === 'open' && row.status === 'edge' && !state.paused;
  const ended = state.phase === 'round_end' || state.phase === 'finished';
  const bonus =
    ended && row.status !== 'ghost'
      ? state.adjustments.filter((a) => a.source === 'survival' && a.roundIndex === state.roundIndex && a.playerId === playerId).reduce((sum, a) => sum + a.points, 0)
      : null;
  return {
    status: row.status,
    outAfter: row.outAfter,
    ghostCorrect: row.ghost?.correct ?? null,
    canAnswerTrial: waiting && trial.kind === 'question' && !Object.hasOwn(trial.answers, playerId),
    trialAnswer: trial?.answers[playerId]?.answer ?? null,
    canPickDoor: waiting && trial.kind === 'luck' && !Object.hasOwn(trial.doors, playerId),
    door: trial === null ? null : trial.stage === 'closed' ? (row.door?.picked ?? null) : (trial.doors[playerId] ?? null),
    result: row.trial === 'safe' || row.trial === 'out' ? row.trial : null,
    bonus,
  };
}

/** Відповідь привида «для себе» на поточне запитання «Вибування»; null — не привид чи не відповідав. */
function ghostAnswer(state: GameState, playerId: string): Answer | null {
  return inQuestion(state) ? (survivalPlayOf(state)?.survival.ghosts[playerId]?.answer ?? null) : null;
}

/** Чи гравці в поточному фіналі: сцена й телефони не бачать чужого прогресу. */
function inFinalRound(state: GameState): boolean {
  return currentRound(state)?.type === 'final';
}

/** Спільна частина зрізу; forHost — для ведучого (черга з вибором, spotlight голови миттєвого бліцу). */
function base(state: GameState, forHost: boolean) {
  // Під час утримання годинник стоїть: клієнти не рахують від endsAt.
  const held = state.heldAt !== null;
  const remainingMs = state.heldAt !== null ? remainingOf(state, state.heldAt) : state.remainingMs;
  const round = currentRound(state);
  const play = state.plays[state.questionIndex];
  return {
    phase: state.phase,
    paused: state.paused,
    round: roundInfo(state),
    questionIndex: roundQuestionNumber(state),
    // Пропущені «100 до 1» (хмара без слів) у лічильник не входять.
    total: round ? roundQuestions(round).length - skippedSurveys(state).length : questionsOf(state.quiz).length,
    question: shownPublic(state),
    endsAt: held ? null : state.endsAt,
    remainingMs,
    limitMs:
      state.phase === 'question' && play !== undefined
        ? // На полі із заміною всі бачать запасне — і його межу, ту саму, що в підрахунку балів.
          play.board === undefined ? limitMsOf(play) : answerLimitMs(play, play.board.chooserId)
        : state.phase === 'duel' && state.duel?.stage === 'question' && state.quiz.duels !== undefined
          ? state.quiz.duels.timeLimit * 1000
          : null,
    held,
    playerCount: state.players.length,
    answeredCount: answeredCount(state),
    blitz: blitzInfo(state, forHost),
    board: boardInfo(state, forHost),
    spotlight: spotlightOf(state, forHost),
    final: finalInfo(state),
    wipeout: wipeoutInfo(state, forHost),
    survival: survivalInfo(state, forHost),
    ladder: ladderInfo(state, forHost),
    chain: inFinalRound(state) ? null : chainInfo(state),
    sort: inFinalRound(state) ? null : sortInfo(state),
    wall: wallInfo(state, forHost),
    survey: surveyInfo(state, forHost),
    bluff: bluffInfo(state, forHost),
    notice: lastNotice(state),
    duel: duelInfo(state, false),
    buffs: currentBuffs(state),
    buffNotice: lastBuff(state),
    debuffNotice: lastPurchase(state),
    removed: boardRemoved(state),
    splash: splashView(state),
    overtime: overtimeRows(state),
    guide: state.phase === 'guide' ? { page: state.guidePage, pages: guidePages(state.quiz) } : null,
    newcomers: newcomersOn(state.quiz),
  };
}

/**
 * Підказка нового типу: тип поточного запитання, якщо в грі такого ще не було й гравець відповідає з телефона.
 * «Які типи вже були» виводиться з журналу plays, тож перепідключення й пауза нічого не ламають.
 */
function typeTip(state: GameState, playerId: string): Question['type'] | null {
  if (!newcomersOn(state.quiz) || state.phase !== 'question') return null;
  const play = state.plays[state.questionIndex];
  if (play === undefined) return null;
  // Той, хто вибув із «Ва-банк», не відповідає на запитання: підказка йому ні до чого й не має рахуватися баченою.
  if (inWipeoutRound(state) && !wipeoutIn(state).includes(playerId)) return null;
  if (play.board !== undefined && (play.board.answerMode === 'voice' || (play.board.kind === 'normal' && play.board.chooserId !== playerId))) return null;
  const type = play.question.type;
  // Знайомим тип робить лише запитання, на яке відповідали з телефона: усна клітинка не рахується.
  return state.plays.slice(0, state.questionIndex).some((p) => p.question.type === type && p.board?.answerMode !== 'voice') ? null : type;
}

/** Етап, у якому заставка кожного виду має сенс. */
const SPLASH_PHASE: Record<SplashKind, Phase> = { round: 'intro', final: 'intro', question: 'question', cell: 'question', duel: 'duel', podium: 'finished', trial: 'leaderboard' };

/** Заставка поточного етапу з часом сервера; поза своїм етапом — null. */
function splashView(state: GameState): SplashView | null {
  const splash = state.splash;
  if (splash === null || SPLASH_PHASE[splash.kind] !== state.phase) return null;
  return { kind: splash.kind, at: splash.at, until: splash.until };
}

/** Особистий кінець гравця з додатковим часом, якщо він ще не відповів (етап question); інакше null. */
function personalClock(state: GameState, playerId: string): { deadline: number | null; remainingMs: number | null } | null {
  const play = state.phase === 'question' ? state.plays[state.questionIndex] : undefined;
  if (play === undefined) return null;
  const overtime = overtimeOf(play, playerId);
  // Хто вже відповів (чекає на ведучого на полі або назвав відповідь уголос), на себе не чекає.
  if (overtime <= 0 || Object.hasOwn(play.answers, playerId) || hasAnswered(state, play, playerId)) return null;
  // Під час утримання й на паузі годинник стоїть: лише залишок. Пауза вже зменшила overtime на витрачене (trimOvertime),
  // а remainingMs тоді 0; утримання overtime не чіпає, зате endsAt − heldAt після спільного кінця від'ємний — двічі не віднімається.
  const remaining = state.heldAt !== null ? remainingOf(state, state.heldAt) : state.paused ? state.remainingMs : null;
  if (remaining !== null) return { deadline: null, remainingMs: remaining + overtime };
  return state.endsAt === null ? null : { deadline: state.endsAt + overtime, remainingMs: null };
}

/** Гравці з додатковим часом без відповіді, у порядку гравців (від миті, коли баф узято). */
function overtimeRows(state: GameState): OvertimeRow[] {
  return state.players.flatMap((p) => {
    const clock = personalClock(state, p.id);
    return clock === null ? [] : [{ ...blitzPlayer(state, p.id), ...clock }];
  });
}

/**
 * Ряд бафів гравця: усі дозволені бафи з причинами. Причину time зріз не показує (без now) — сплив час рахує телефон.
 * Прибрані 50/50 варіанти й перша відповідь другої спроби є лише тут, у зрізі самого гравця.
 */
function playerBuffs(state: GameState, playerId: string): PlayerBuffs | null {
  const allowed = allowedBuffs(state.quiz);
  const play = state.phase === 'question' ? state.plays[state.questionIndex] : undefined;
  if (allowed.length === 0 || play === undefined || !buffRowHere(state, play, playerId)) return null;
  const own = buffOf(play, playerId);
  const used = buffsUsed(state, playerId);
  const slots = allowed.map((kind) => {
    if (own?.kind === kind) return { kind, state: 'active' as const, block: null };
    if (used.includes(kind)) return { kind, state: 'used' as const, block: 'used' as const };
    const block = buffBlock(state, playerId, kind);
    return block === null ? { kind, state: 'ready' as const, block: null } : { kind, state: 'blocked' as const, block };
  });
  return { slots, active: own === null ? null : activeBuff(state, play, playerId, own) };
}

/** Узятий баф гравця: прибрані варіанти, друга спроба, підказка, голоси й ознака запасного — лише для нього самого. */
function activeBuff(state: GameState, play: Play, playerId: string, own: BuffPlay): PlayerActiveBuff {
  const pending = (own.retry === 'again' || own.retry === 'choice') && own.first !== null ? own.first : null;
  return {
    kind: own.kind,
    removed: own.removed,
    retry: own.retry,
    first: pending === null ? null : { answer: pending.answer, points: pending.points },
    hint: own.hint === undefined ? null : playerHint(own.hint),
    votes: own.vote === undefined ? null : voteView(state, play, playerId, own.vote),
    spare: own.kind === 'swap',
  };
}

function playerHint(hint: { text: string | null; aloud: boolean }): PlayerHint {
  if (hint.text !== null) return { state: 'text', text: hint.text };
  return { state: hint.aloud ? 'aloud' : 'waiting', text: null };
}

/** Кінець голосування для зрізу: на паузі — залишок, інакше мить кінця. */
function voteClock(state: GameState, endsAt: number): { endsAt: number | null; remainingMs: number | null } {
  return state.paused && state.pausedAt !== null ? { endsAt: null, remainingMs: Math.max(0, endsAt - state.pausedAt) } : { endsAt, remainingMs: null };
}

/** Підсумок голосування для гравця з бафом: лише вибір людей, без правильної відповіді й без того, хто як голосував. */
function voteView(state: GameState, play: Play, playerId: string, vote: NonNullable<BuffPlay['vote']>): VoteTally {
  return {
    ...voteClock(state, vote.endsAt),
    closed: hasAnswered(state, play, playerId),
    ...voteTally(play.question, vote.ballots),
  };
}

/** Перше в порядку гравців відкрите голосування, у якому гравець може й ще не голосував; час телефон перевіряє сам. */
function votePrompt(state: GameState, playerId: string): VotePrompt | null {
  const play = state.phase === 'question' ? state.plays[state.questionIndex] : undefined;
  if (play === undefined) return null;
  for (const asker of state.players) {
    const vote = buffOf(play, asker.id)?.vote;
    if (vote === undefined || Object.hasOwn(vote.ballots, playerId)) continue;
    if (!canVote(state, playerId, asker.id) || hasAnswered(state, play, asker.id)) continue;
    return { asker: blitzPlayer(state, asker.id), ...voteClock(state, vote.endsAt) };
  }
  return null;
}

/** Запити підказки без відповіді (етап question), у порядку гравців. */
function hintRequests(state: GameState): HintRequest[] {
  const play = state.phase === 'question' ? state.plays[state.questionIndex] : undefined;
  if (play === undefined) return [];
  return state.players.flatMap((p) => {
    const buff = buffOf(play, p.id);
    const waiting = buff?.hint !== undefined && buff.hint.text === null && !buff.hint.aloud;
    if (waiting) return [{ ...blitzPlayer(state, p.id), at: buff.at }];
    // «Мільйонер»: запит підказки ведучого від учасника драбини.
    const hint = play.ladder?.contestantId === p.id ? play.ladder.lifelines.hint : undefined;
    return hint !== undefined && hint.text === null && !hint.aloud ? [{ ...blitzPlayer(state, p.id), at: hint.at }] : [];
  });
}

/**
 * Скільки відповіли. У фіналі сортування — скільки зробили хоч один хід: лічильник записів
 * видав би, скільки вже відсортували все (тобто відповіли правильно). Перша спроба під бафом
 * «Ще спроба» теж рахується, інакше лічильник видав би, що вона неправильна.
 */
function answeredCount(state: GameState): number {
  const play = state.plays[state.questionIndex];
  const held = state.players.filter((p) => (buffOf(play, p.id)?.first ?? null) !== null).map((p) => p.id);
  // Блеф: у фазі вигадок — хто написав, у фазі вибору — хто вибрав; з закриття — записи.
  const bluff = currentBluff(state)?.play.bluff;
  if (bluff !== undefined && state.phase === 'question') {
    const own = bluff.stage === 'lies' ? bluff.lies : bluff.picks;
    return state.players.filter((p) => Object.hasOwn(own, p.id)).length;
  }
  const answered = [...new Set([...Object.keys(currentAnswers(state)), ...held])];
  const open = currentSort(state);
  if (open === null || !inFinalRound(state)) return answered.length;
  const moved = new Set([...Object.keys(open.play.sort ?? {}), ...answered]);
  return state.players.filter((p) => moved.has(p.id)).length;
}

function isRevealed(state: GameState): boolean {
  return state.questionIndex >= 0 && inQuestion(state) && REVEALED.includes(state.phase);
}

function publicStandings(state: GameState): Standing[] | null {
  // У «Ва-банк» між запитаннями замість таблиці драбина.
  if (state.phase === 'leaderboard' && (currentRound(state)?.type === 'wipeout' || currentRound(state)?.type === 'ladder' || inSurvivalRound(state))) return null;
  return WITH_STANDINGS.includes(state.phase) ? rankPlayers(state.players) : null;
}

/** Лічильники розкриття; у класиці відповіді на запасні не враховуються (там інше запитання). */
function revealStats(state: GameState, question: Question): RevealStats {
  const known = new Set<string>(
    question.type === 'single' || question.type === 'multi' || question.type === 'poll'
      ? question.options.map((option) => option.id)
      : question.type === 'boolean'
        ? ['true', 'false']
        : [],
  );
  const board = state.plays[state.questionIndex]?.board !== undefined;
  const records = Object.values(currentAnswers(state)).filter((record) => board || record.spare === undefined);
  const counts: Record<string, number> = {};
  for (const { answer } of records) {
    // У бліці гравець міг натиснути й не встигнути відповісти.
    if (answer === null) continue;
    const keys =
      answer.type === 'single'
        ? [answer.optionId]
        : answer.type === 'multi'
          ? [...new Set(answer.optionIds)]
          : answer.type === 'boolean'
            ? [String(answer.value)]
            : answer.type === 'poll'
              ? [answer.optionId]
              : [];
    for (const key of keys) {
      if (known.has(key)) counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  // Голоси без балів не бувають «прийнятими»: лише answered і counts. «100 до 1» ховає прийняті, поки дошка не відкрита.
  const hidden = isUnscored(question) || spoilerHeld(state);
  return { answered: records.length, accepted: hidden ? null : records.filter((r) => r.accepted).length, counts };
}

export function stageView(state: GameState): StageView {
  const shown = isRevealed(state) ? shownQuestion(state) : null;
  const revealed = shown === null ? null : withoutBluffSecrets(withoutSurveyRows(withoutHint(shown.question)));
  return {
    ...base(state, false),
    role: 'stage',
    players: state.players.map((p) => ({ id: p.id, nickname: p.nickname, connected: p.connected, streak: shownStreak(state, p) })),
    reveal: revealed,
    // У фіналі лічильники видали б результат ще не розкритих гравців.
    stats: revealed !== null && currentRound(state)?.type !== 'final' ? revealStats(state, revealed) : null,
    standings: publicStandings(state),
    // Лише імена: вид дебафу сцена не бачить.
    debuffs: state.players.filter((p) => shownDebuff(state, p.id) !== null).map((p) => blitzPlayer(state, p.id)),
    sliderMarks: sliderMarks(state, false),
    pinMarks: pinMarks(state, false),
    cloud: stageCloud(state),
    cloudVoters: stageCloud(state) === null ? null : cloudVoters(state.plays[state.questionIndex], state.players),
  };
}

/**
 * Відповідь гравця з черги бліцу: нерозглянута в черзі або не перевірена до закриття (dropped).
 * Скинуте натискання без відповіді не підміняє підсумок попередньої спроби.
 */
function blitzAnswer(state: GameState, playerId: string): Answer | null | undefined {
  const blitz = currentBlitz(state)?.blitz;
  const entry =
    blitz?.queue.find((e) => e.playerId === playerId) ?? blitz?.dropped.find((e) => e.playerId === playerId && e.answer !== null);
  return entry === undefined ? undefined : entry.answer;
}

export function playerView(state: GameState, playerId: string): PlayerView | null {
  const player = state.players.find((p) => p.id === playerId);
  if (player === undefined) return null;
  const record = currentRecord(state, playerId);
  const queued = blitzAnswer(state, playerId);
  const open = currentBoardPlay(state);
  const pending = open?.board.chooserId === playerId ? open.board.answer : null;
  const revealed = isRevealed(state);
  const standings = publicStandings(state);
  // Запасне в класиці бачить лише сам гравець: власне запитання, межа часу й розкриття.
  const spare = ownSpare(state, playerId);
  const seen = spare ?? shownQuestion(state);
  const shared = base(state, false);
  const play = state.plays[state.questionIndex];
  const visible = finalVisiblePoints(state, playerId);
  return {
    ...shared,
    question: shared.question === null ? null : withoutClip(shared.question),
    ...(spare === null
      ? {}
      : {
          question: withoutClip(publicQuestion(spare.question, spare.presented)),
          limitMs: state.phase === 'question' && play !== undefined ? answerLimitMs(play, playerId) : shared.limitMs,
        }),
    // Питання на виживання бачать лише ті, хто на межі: телефони решти його не отримують (сцена — так).
    ...(shared.survival !== null && shared.survival.trial !== null && shared.survival.trial.question !== null && shared.survival.rows.find((row) => row.playerId === playerId)?.status !== 'edge'
      ? { survival: { ...shared.survival, trial: { ...shared.survival.trial, question: null } } }
      : {}),
    // Слова клітинки сортування — для глядачів; той, хто сортує, бачить лише власну поточну картку.
    ...(shared.sort !== null && shared.sort.words !== null && open?.board.chooserId === playerId ? { sort: { ...shared.sort, words: null } } : {}),
    role: 'player',
    me: {
      id: player.id,
      nickname: player.nickname,
      score: player.score - hiddenPoints(state, playerId),
      rank: standings?.find((s) => s.participantId === player.id)?.rank ?? null,
      // У бліці відповідь гравця лежить у його записі черги, доки його не розглянули;
      // запис без відповіді (повторне натискання) не підміняємо підсумком попередньої спроби.
      answer: publicAnswer(queued === undefined ? (record?.answer ?? pending ?? ghostAnswer(state, playerId)) : queued, revealed && !spoilerHeld(state)),
      result:
        revealed && record !== undefined && finalShown(state, playerId) && !spoilerHeld(state) && !(seen !== null && isUnscored(seen.question))
          ? {
              accepted: record.accepted,
              accuracy: record.accuracy,
              grade: record.grade,
              streakBonus: record.streakBonus,
              points: currentRound(state)?.type === 'final' ? visible : record.points,
            }
          : null,
      blitz: playerBlitz(state, playerId),
      final: playerFinal(state, playerId),
      wipeout: playerWipeout(state, playerId),
      survival: playerSurvival(state, playerId),
      ladder: playerLadder(state, playerId),
      chain: playerChain(state, playerId),
      sort: playerSort(state, playerId),
      wall: playerWall(state, playerId),
      survey: playerSurvey(state, playerId),
      bluff: playerBluff(state, playerId),
      debuff: playerDebuff(state, playerId),
      shop: playerShop(state, playerId),
      duel: playerDuel(state, playerId),
      buffs: playerBuffs(state, playerId),
      overtime: personalClock(state, playerId),
      tip: typeTip(state, playerId),
      vote: votePrompt(state, playerId),
    },
    reveal: revealed && seen !== null ? withoutBluffSecrets(withoutSurveyRows(withoutHint(seen.question))) : null,
    standings,
    table: liveTable(state, playerId),
  };
}

/**
 * Бали поточного запитання, яких гравцеві ще не видно: на етапі locked — уся оцінка (видала б правильність до розкриття);
 * у фіналі рахунок змінюється лише в мить розкриття гравця, а частка банку — на кроці розподілу.
 */
function hiddenPoints(state: GameState, playerId: string): number {
  const record = currentRecord(state, playerId);
  if (record === undefined) return 0;
  if (state.phase === 'locked' || spoilerHeld(state)) return record.points;
  return state.phase === 'reveal' ? record.points - finalVisiblePoints(state, playerId) : 0;
}

/** Банк, який гравець забрав у відкритому вікні «Ва-банк»: решті поки не видно, лише «вирішив». */
function windowCash(state: GameState, playerId: string): number {
  const play = wipeoutPlayOf(state);
  if (play === null || !decisionOpen(state) || !play.wipeout.took.includes(playerId)) return 0;
  return recordOf(state, state.questionIndex, playerId)?.points ?? 0;
}

/** Таблиця для кнопки «Таблиця»: з leaderboard 'end' поза підсумками — лише власний рядок зі справжнім місцем. */
function liveTable(state: GameState, playerId: string): PlayerTable | null {
  if (state.phase === 'lobby') return null;
  const rows = rankPlayers(state.players.map((p) => ({ ...p, score: p.score - hiddenPoints(state, p.id) - (p.id === playerId ? 0 : windowCash(state, p.id)) })));
  // У вікні рішення «Ва-банк» етап leaderboard — не підсумки: повна таблиця лише з leaderboard 'each'.
  const full = state.quiz.settings.leaderboard === 'each' || (WITH_STANDINGS.includes(state.phase) && !(state.phase === 'leaderboard' && (inWipeoutRound(state) || inSurvivalRound(state) || inLadderRound(state))));
  return { rows: full ? rows : rows.filter((row) => row.participantId === playerId), full };
}

/** Власний дебаф гравця, лише поки він діє: до спрацювання гравець про нього не знає. */
function playerDebuff(state: GameState, playerId: string): { kind: DebuffKind; since: number; by: string | null } | null {
  const debuff = activeDebuff(state, playerId);
  return debuff === null || debuff.since === null ? null : { kind: debuff.kind, since: debuff.since, by: debuffBuyer(state, debuff.by) };
}

function hostDebuff(state: GameState, playerId: string): { kind: DebuffKind; fired: boolean; by: string | null } | null {
  const debuff = shownDebuff(state, playerId);
  return debuff === null ? null : { kind: debuff.kind, fired: activeDebuff(state, playerId) !== null, by: debuffBuyer(state, debuff.by) };
}

/** Нікнейм покупця дебафу; null — від ведучого або покупця вилучено. */
function debuffBuyer(state: GameState, by: string | null): string | null {
  return by === null ? null : (state.players.find((p) => p.id === by)?.nickname ?? null);
}

/**
 * Аркуш «Дебафи»: дозволені дебафи з цінами, суперники з позначкою «зайнятий», причина відмови.
 * null — немає дебафів, купівлю вимкнено, немає суперників або етап lobby/guide/finished.
 */
function playerShop(state: GameState, playerId: string): PlayerShop | null {
  if (['lobby', 'guide', 'finished'].includes(state.phase) || state.quiz.settings.debuffShop === false) return null;
  const items = allowedDebuffs(state.quiz).map((kind) => ({ kind, price: debuffPrice(state.quiz, kind) }));
  const targets = state.players
    .filter((p) => p.id !== playerId && !ghostTarget(state, p.id))
    .map((p) => ({ ...blitzPlayer(state, p.id), busy: shownDebuff(state, p.id) !== null, offline: !p.connected }));
  if (items.length === 0 || targets.length === 0) return null;
  return { items, targets, block: shopBlock(state, playerId) };
}

/** Запасне запитання за id із запису (з правильною відповіддю — лише ведучому); null — основне або немає в пулі. */
function spareOf(state: GameState, id: string | undefined): Question | null {
  return id === undefined ? null : (allSpares(state.quiz).find((q) => q.id === id) ?? null);
}

/** Номер підказки, на якій дано відповідь; null — не «Хто я?», бліц і фінал. */
function responseClue(state: GameState, playerId: string, timeMs: number): number | null {
  const play = state.plays[state.questionIndex];
  if (play === undefined || play.blitz !== undefined || inFinalRound(state)) return null;
  return cluesAnswered(play, questionFor(state, play, playerId), timeMs);
}

export function hostView(state: GameState): HostView {
  const current = state.plays[state.questionIndex]?.question;
  const unscored = current !== undefined && isUnscored(current);
  const responses = state.players.flatMap((player): HostResponse[] => {
    const record = currentRecord(state, player.id);
    if (record === undefined) return [];
    return [
      {
        playerId: player.id,
        nickname: player.nickname,
        answer: record.answer,
        timeMs: record.timeMs,
        // Голос без балів не має вердикту: у записі лежить службове «wrong».
        accepted: unscored ? null : record.accepted,
        grade: unscored ? null : record.grade,
        streakBonus: record.streakBonus,
        points: record.points,
        overridden: record.overridden,
        buff: record.buff ?? null,
        spare: spareOf(state, record.spare),
        clue: responseClue(state, player.id, record.timeMs),
      },
    ];
  });
  return {
    ...base(state, true),
    role: 'host',
    players: state.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      connected: p.connected,
      streak: shownStreak(state, p),
      score: p.score,
      debuff: hostDebuff(state, p.id),
    })),
    correct: shownQuestion(state)?.question ?? null,
    responses,
    blitz: hostBlitz(state),
    board: hostBoard(state),
    final: hostFinal(state),
    chain: chainInfo(state),
    sort: sortInfo(state),
    duel: hostDuel(state),
    allowed: { debuffs: debuffsOff(state) ? [] : allowedDebuffs(state.quiz), buffs: allowedBuffs(state.quiz) },
    hints: hintRequests(state),
    standings: rankPlayers(state.players),
    sliderMarks: sliderMarks(state, true),
    pinMarks: pinMarks(state, true),
    cloud: hostCloud(state),
    surveySkipped: skippedSurveys(state).map((q) => q.text),
  };
}
