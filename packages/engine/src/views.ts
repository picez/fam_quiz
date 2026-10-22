import {
  boardCells,
  findCell,
  questionsOf,
  cellAnswerMode,
  roundQuestions,
  type Round,
  type Answer,
  type BlitzInfo,
  type BlitzPlayer,
  type BoardCellView,
  type BoardInfo,
  type ChainInfo,
  type PlayerChain,
  type Choice,
  type FinalEntry,
  type FinalInfo,
  type HostFinal,
  type HostBlitz,
  type HostBoard,
  type PlayerBlitz,
  type HostView,
  type Phase,
  type PlayerView,
  type RoundInfo,
  type PublicQuestion,
  type Question,
  type RevealStats,
  type Spotlight,
  type Standing,
  type StageView,
  roundBrief,
  rulesOf,
} from '@quiz/shared';
import { currentRound, finalShown, recordOf, roundQuestionNumber, streakCounts, type BoardPlay, type GameState, type PlayerState } from './game';
import { attemptsUsed, blitzRulesOf } from './blitz';
import { chainDeadline, chainOf, hintMsOf, letterCount, maskWord } from './chain';
import { BOARD_AWAY_MS, cellPlayed, chooserOf } from './board-turns';
import { pendingOf } from './hold';
import { rankPlayers } from './ranking';
import { isTimed, limitMsOf, remainingOf } from './timing';

const REVEALED: Phase[] = ['reveal', 'leaderboard', 'finished'];
const WITH_STANDINGS: Phase[] = ['leaderboard', 'round_end', 'finished'];
// У цих етапах запитання ще (або вже) немає: журнал показує лише останнє зігране.
const BETWEEN_QUESTIONS: Phase[] = ['lobby', 'intro', 'board', 'wager', 'round_end'];

/** Чи є поточне запитання. На finished останнє зігране показуємо, лише якщо воно з поточного раунду (інакше гру завершено з intro). */
function inQuestion(state: GameState): boolean {
  if (BETWEEN_QUESTIONS.includes(state.phase)) return false;
  return state.phase !== 'finished' || state.plays[state.questionIndex]?.roundIndex === state.roundIndex;
}

function currentQuestion(state: GameState): Question | null {
  if (!inQuestion(state)) return null;
  return state.plays[state.questionIndex]?.question ?? null;
}

function publicQuestion(state: GameState): PublicQuestion | null {
  const question = currentQuestion(state);
  if (question === null) return null;
  const source: Choice[] =
    question.type === 'order'
      ? question.items
      : question.type === 'single' || question.type === 'multi'
        ? question.options
        : [];
  const shown = (from: Choice[]) =>
    state.presented
      .map((id) => from.find((choice) => choice.id === id))
      .filter((choice): choice is Choice => choice !== undefined)
      .map((choice) => ({ id: choice.id, text: choice.text }));
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
  };
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

/** Черга й переможець для сцени й гравців: без відповідей, переможець лише після розкриття. */
function blitzInfo(state: GameState): BlitzInfo | null {
  const open = currentBlitz(state);
  if (open === null) return null;
  return {
    queue: open.blitz.queue.map((entry) => blitzPlayer(state, entry.playerId)),
    winner: isRevealed(state) ? blitzWinner(state, open.blitz.attempts) : null,
  };
}

function playerBlitz(state: GameState, playerId: string): PlayerBlitz | null {
  const open = currentBlitz(state);
  if (open === null) return null;
  const { play, blitz, rules } = open;
  const index = blitz.queue.findIndex((entry) => entry.playerId === playerId);
  const used = attemptsUsed(play, playerId);
  const left = rules.attempts === null ? null : Math.max(0, rules.attempts - used);
  return {
    position: index < 0 ? null : index + 1,
    attemptsUsed: used,
    attemptsLeft: left,
    canBuzz: state.phase === 'question' && !state.paused && index < 0 && (left === null || left > 0),
    // Під час утримання вікно не йде.
    deadline: index < 0 || state.heldAt !== null ? null : blitz.queue[index].deadline,
  };
}

function hostBlitz(state: GameState): HostBlitz | null {
  const open = currentBlitz(state);
  if (open === null) return null;
  const { blitz, rules } = open;
  return {
    voice: rules.check === 'voice',
    manual: rules.check !== 'auto',
    winner: blitzWinner(state, blitz.attempts),
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

const BOARD_PHASES: Phase[] = ['intro', 'board', 'question', 'locked', 'reveal', 'leaderboard'];

/** Поле для всіх ролей: вид клітинок видно всім, формат запитань ні. */
function boardInfo(state: GameState): BoardInfo | null {
  const round = currentRound(state);
  if (round?.type !== 'board' || state.board === null || !BOARD_PHASES.includes(state.phase)) return null;
  const open = currentBoardPlay(state);
  const turnId = state.phase === 'board' ? chooserOf(state) : (open?.board.chooserId ?? null);
  const cell = open === null ? undefined : findCell(round, open.board.cellId);
  return {
    categories: round.categories.map((category) => ({
      id: category.id,
      title: category.title,
      cells: category.cells.map(
        (cell): BoardCellView => ({
          id: cell.question.id,
          price: cell.question.points,
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
    rolls: state.board.rolls,
    skipAt: state.board.awaySince === null ? null : state.board.awaySince + BOARD_AWAY_MS,
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

/** Відповідь одного гравця для всіх ролей: поле з телефонами й бліц. Правильної відповіді тут немає. */
function spotlightOf(state: GameState): Spotlight | null {
  const pending = pendingOf(state);
  if (pending !== null) return { ...blitzPlayer(state, pending.playerId), answer: pending.answer, grade: null };
  const blitz = currentBlitz(state);
  if (blitz !== null) {
    // Усна відповідь звучить у залі: на телефоні її немає.
    if (blitz.rules.check === 'voice') return null;
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

/** Записи гравців із записом на запитання фіналу; після входу в reveal — у порядку розкриття, інакше в порядку гравців. */
function finalEntries(state: GameState): FinalEntry[] {
  const open = finalRoundOf(state);
  const play = inQuestion(state) ? state.plays[state.questionIndex] : undefined;
  if (open === null || play?.final === undefined) return [];
  const wagers = play.final.wagers;
  const entries = state.players.flatMap((player): FinalEntry[] => {
    const record = recordOf(state, state.questionIndex, player.id);
    if (record === undefined) return [];
    return [
      {
        playerId: player.id,
        nickname: player.nickname,
        answer: record.answer,
        grade: record.grade,
        wager: Object.hasOwn(wagers, player.id) ? wagers[player.id] : 0,
        before: player.score - record.points,
        after: player.score,
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
  return {
    theme: open.round.title,
    placed: state.players.filter((p) => Object.hasOwn(open.final.wagers, p.id)).length,
    total: state.players.length,
    shown: reveal ? finalEntries(state).filter((entry) => finalShown(state, entry.playerId)) : [],
    left: reveal ? Math.max(0, open.final.order.length - open.final.shown) : 0,
  };
}

function hostFinal(state: GameState): HostFinal | null {
  const info = finalInfo(state);
  const open = finalRoundOf(state);
  if (info === null || open === null) return null;
  const manual = open.round.check === 'manual';
  const graded = state.plays[state.questionIndex]?.final?.graded ?? [];
  const entries = finalEntries(state);
  return {
    ...info,
    wagers: state.players.map((p) => ({
      playerId: p.id,
      nickname: p.nickname,
      wager: Object.hasOwn(open.final.wagers, p.id) ? open.final.wagers[p.id] : null,
      limit: Object.hasOwn(open.final.limits, p.id) ? open.final.limits[p.id] : 0,
    })),
    entries,
    manual,
    pending: manual
      ? entries.flatMap((entry) =>
          entry.answer === null || graded.includes(entry.playerId)
            ? []
            : [{ playerId: entry.playerId, nickname: entry.nickname, answer: entry.answer }],
        )
      : [],
  };
}

function playerFinal(state: GameState, playerId: string): { wager: number | null; limit: number } | null {
  const open = finalRoundOf(state);
  if (open === null) return null;
  return {
    wager: Object.hasOwn(open.final.wagers, playerId) ? open.final.wagers[playerId] : null,
    limit: Object.hasOwn(open.final.limits, playerId) ? open.final.limits[playerId] : 0,
  };
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

function base(state: GameState) {
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
    question: publicQuestion(state),
    endsAt: held ? null : state.endsAt,
    remainingMs,
    limitMs: state.phase === 'question' && play !== undefined ? limitMsOf(play) : null,
    held,
    playerCount: state.players.length,
    answeredCount: Object.keys(currentAnswers(state)).length,
    blitz: blitzInfo(state),
    board: boardInfo(state),
    spotlight: spotlightOf(state),
    final: finalInfo(state),
    chain: currentRound(state)?.type === 'final' ? null : chainInfo(state),
  };
}

function isRevealed(state: GameState): boolean {
  return state.questionIndex >= 0 && inQuestion(state) && REVEALED.includes(state.phase);
}

function publicStandings(state: GameState): Standing[] | null {
  return WITH_STANDINGS.includes(state.phase) ? rankPlayers(state.players) : null;
}

function revealStats(state: GameState, question: Question): RevealStats {
  const known = new Set<string>(
    question.type === 'single' || question.type === 'multi'
      ? question.options.map((option) => option.id)
      : question.type === 'boolean'
        ? ['true', 'false']
        : [],
  );
  const records = Object.values(currentAnswers(state));
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
  const revealed = isRevealed(state) ? currentQuestion(state) : null;
  return {
    ...base(state),
    role: 'stage',
    players: state.players.map((p) => ({ id: p.id, nickname: p.nickname, connected: p.connected, streak: shownStreak(state, p) })),
    reveal: revealed,
    // У фіналі лічильники видали б результат ще не розкритих гравців.
    stats: revealed !== null && currentRound(state)?.type !== 'final' ? revealStats(state, revealed) : null,
    standings: publicStandings(state),
  };
}

function blitzAnswer(state: GameState, playerId: string): Answer | null | undefined {
  const entry = currentBlitz(state)?.blitz.queue.find((e) => e.playerId === playerId);
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
  // На етапі locked бали за поточне запитання ще не показуємо: це видало б правильність до розкриття.
  // У фіналі рахунок гравця змінюється лише в мить його розкриття.
  const concealed = state.phase === 'locked' || (state.phase === 'reveal' && !finalShown(state, playerId));
  const hidden = concealed && record !== undefined ? record.points : 0;
  return {
    ...base(state),
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
              points: record.points,
            }
          : null,
      blitz: playerBlitz(state, playerId),
      final: playerFinal(state, playerId),
      chain: playerChain(state, playerId),
    },
    reveal: revealed ? currentQuestion(state) : null,
    standings,
  };
}

export function hostView(state: GameState): HostView {
  const responses = state.players.flatMap((player) => {
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
      },
    ];
  });
  return {
    ...base(state),
    role: 'host',
    players: state.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      connected: p.connected,
      streak: shownStreak(state, p),
      score: p.score,
    })),
    correct: currentQuestion(state),
    responses,
    blitz: hostBlitz(state),
    board: hostBoard(state),
    final: hostFinal(state),
    chain: chainInfo(state),
    standings: rankPlayers(state.players),
  };
}
