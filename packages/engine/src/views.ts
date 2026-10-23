import {
  allowedBuffs,
  allowedDebuffs,
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
  type BoardCellView,
  type BoardInfo,
  type DiceInfo,
  type DuelInfo,
  type HostDuel,
  type PlayerDuel,
  type ChainInfo,
  type DebuffKind,
  type PlayerChain,
  type PlayerSort,
  type SortInfo,
  type SortRow,
  type Choice,
  type FinalEntry,
  type FinalInfo,
  type FinalSplit,
  type HostFinal,
  type HostBlitz,
  type HostBoard,
  type PlayerBlitz,
  type PlayerBuffs,
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
  type PublicQuestion,
  type Question,
  type RevealStats,
  type Spotlight,
  type Standing,
  type SplashKind,
  type SplashView,
  type StageView,
  guidePages,
  newcomersOn,
  roundBrief,
  rulesOf,
} from '@quiz/shared';
import { currentRound, finalOutcome, finalShown, finalVisiblePoints, needsSplit, recordOf, roundQuestionNumber, streakCounts, type BlitzPlay, type BoardPlay, type FinalState, type GameState, type Play, type PlayerState } from './game';
import { lastNotice } from './adjust';
import { activeDebuff, shownDebuff } from './debuffs';
import {
  answerLimitMs,
  buffBlock,
  buffOf,
  buffsHere,
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
import { duelCategoriesLeft, duelEnds, duelQuestionOf, duelWindowOpen } from './duel';
import { BOARD_AWAY_MS, cellPlayed, chooserOf, turnSchedule } from './board-turns';
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

/** Запитання без правильної відповіді й підказки; choices у порядку presented. */
function publicQuestion(question: Question, presented: string[]): PublicQuestion {
  const source: Choice[] =
    question.type === 'order'
      ? question.items
      : question.type === 'single' || question.type === 'multi'
        ? question.options
        : [];
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
  };
}

/** Публічне запитання, яке бачать усі; null поза запитанням. */
function shownPublic(state: GameState): PublicQuestion | null {
  const shown = shownQuestion(state);
  return shown === null ? null : publicQuestion(shown.question, shown.presented);
}

/** Найменший і найбільший час запитань раунду з таймером; null — таймера немає в жодного. */
function timesOf(round: Round): { min: number; max: number } | null {
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
  return state.phase === 'locked' ? previousStreak(state, player.id) : player.streak;
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

/** Поле для всіх ролей: вид клітинок видно всім, формат запитань ні. */
function boardInfo(state: GameState): BoardInfo | null {
  const round = currentRound(state);
  if (round?.type !== 'board' || state.board === null || !BOARD_PHASES.includes(state.phase)) return null;
  const open = currentBoardPlay(state);
  const turnId = state.phase === 'board' ? chooserOf(state) : (open?.board.chooserId ?? null);
  const cell = open === null ? undefined : findCell(round, open.board.cellId);
  const schedule = turnSchedule(state);
  return {
    categories: round.categories.map((category) => ({
      id: category.id,
      title: category.title,
      cells: category.cells.map(
        (cell): BoardCellView => ({
          id: cell.question.id,
          price: questionPrice(cell.question),
          played: cellPlayed(state, cell.question.id),
          mark: cell.mark,
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
  const info = boardInfo(state);
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
  return { total: open.question.words.length, rows, winner: won === undefined ? null : blitzPlayer(state, won.id) };
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
    total: round ? roundQuestions(round).length : questionsOf(state.quiz).length,
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
    board: boardInfo(state),
    spotlight: spotlightOf(state, forHost),
    final: finalInfo(state),
    chain: inFinalRound(state) ? null : chainInfo(state),
    sort: inFinalRound(state) ? null : sortInfo(state),
    notice: lastNotice(state),
    duel: duelInfo(state, false),
    buffs: currentBuffs(state),
    buffNotice: lastBuff(state),
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
  if (play.board !== undefined && (play.board.answerMode === 'voice' || (play.board.kind === 'normal' && play.board.chooserId !== playerId))) return null;
  const type = play.question.type;
  // Знайомим тип робить лише запитання, на яке відповідали з телефона: усна клітинка не рахується.
  return state.plays.slice(0, state.questionIndex).some((p) => p.question.type === type && p.board?.answerMode !== 'voice') ? null : type;
}

/** Етап, у якому заставка кожного виду має сенс. */
const SPLASH_PHASE: Record<SplashKind, Phase> = { round: 'intro', final: 'intro', question: 'question', cell: 'question', duel: 'duel', podium: 'finished' };

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
  // Хто вже відповів (або чекає на ведучого на полі), на себе не чекає.
  const answered = Object.hasOwn(play.answers, playerId) || (play.board?.chooserId === playerId && play.board.answer !== null);
  if (overtime <= 0 || answered) return null;
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
  if (allowed.length === 0 || play === undefined || !buffsHere(state, play, playerId)) return null;
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
    return waiting ? [{ ...blitzPlayer(state, p.id), at: buff.at }] : [];
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
  return WITH_STANDINGS.includes(state.phase) ? rankPlayers(state.players) : null;
}

/** Лічильники розкриття; у класиці відповіді на запасні не враховуються (там інше запитання). */
function revealStats(state: GameState, question: Question): RevealStats {
  const known = new Set<string>(
    question.type === 'single' || question.type === 'multi'
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
            : [];
    for (const key of keys) {
      if (known.has(key)) counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return { answered: records.length, accepted: records.filter((r) => r.accepted).length, counts };
}

export function stageView(state: GameState): StageView {
  const shown = isRevealed(state) ? shownQuestion(state) : null;
  const revealed = shown === null ? null : withoutHint(shown.question);
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
  // На етапі locked бали за поточне запитання ще не показуємо: це видало б правильність до розкриття.
  // У фіналі рахунок гравця змінюється лише в мить його розкриття, а частка банку — на кроці розподілу.
  const visible = finalVisiblePoints(state, playerId);
  const hidden =
    record === undefined ? 0 : state.phase === 'locked' ? record.points : state.phase === 'reveal' ? record.points - visible : 0;
  return {
    ...shared,
    ...(spare === null
      ? {}
      : {
          question: publicQuestion(spare.question, spare.presented),
          limitMs: state.phase === 'question' && play !== undefined ? answerLimitMs(play, playerId) : shared.limitMs,
        }),
    role: 'player',
    me: {
      id: player.id,
      nickname: player.nickname,
      score: player.score - hidden,
      rank: standings?.find((s) => s.participantId === player.id)?.rank ?? null,
      // У бліці відповідь гравця лежить у його записі черги, доки його не розглянули;
      // запис без відповіді (повторне натискання) не підміняємо підсумком попередньої спроби.
      answer: queued === undefined ? (record?.answer ?? pending) : queued,
      result:
        revealed && record !== undefined && finalShown(state, playerId)
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
      chain: playerChain(state, playerId),
      sort: playerSort(state, playerId),
      debuff: playerDebuff(state, playerId),
      duel: playerDuel(state, playerId),
      buffs: playerBuffs(state, playerId),
      overtime: personalClock(state, playerId),
      tip: typeTip(state, playerId),
      vote: votePrompt(state, playerId),
    },
    reveal: revealed && seen !== null ? withoutHint(seen.question) : null,
    standings,
  };
}

/** Власний дебаф гравця, лише поки він діє: до спрацювання гравець про нього не знає. */
function playerDebuff(state: GameState, playerId: string): { kind: DebuffKind; since: number } | null {
  const debuff = activeDebuff(state, playerId);
  return debuff === null || debuff.since === null ? null : { kind: debuff.kind, since: debuff.since };
}

function hostDebuff(state: GameState, playerId: string): { kind: DebuffKind; fired: boolean } | null {
  const debuff = shownDebuff(state, playerId);
  return debuff === null ? null : { kind: debuff.kind, fired: activeDebuff(state, playerId) !== null };
}

/** Запасне запитання за id із запису (з правильною відповіддю — лише ведучому); null — основне або немає в пулі. */
function spareOf(state: GameState, id: string | undefined): Question | null {
  return id === undefined ? null : ((state.quiz.spares ?? []).find((q) => q.id === id) ?? null);
}

export function hostView(state: GameState): HostView {
  const responses = state.players.flatMap((player): HostResponse[] => {
    const record = currentRecord(state, player.id);
    if (record === undefined) return [];
    return [
      {
        playerId: player.id,
        nickname: player.nickname,
        answer: record.answer,
        timeMs: record.timeMs,
        accepted: record.accepted,
        grade: record.grade,
        streakBonus: record.streakBonus,
        points: record.points,
        overridden: record.overridden,
        buff: record.buff ?? null,
        spare: spareOf(state, record.spare),
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
    allowed: { debuffs: allowedDebuffs(state.quiz), buffs: allowedBuffs(state.quiz) },
    hints: hintRequests(state),
    standings: rankPlayers(state.players),
  };
}
