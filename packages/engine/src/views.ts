import {
  questionsOf,
  roundQuestions,
  type Answer,
  type BlitzInfo,
  type BlitzPlayer,
  type Choice,
  type HostBlitz,
  type PlayerBlitz,
  type HostView,
  type Phase,
  type PlayerView,
  type RoundInfo,
  type PublicQuestion,
  type Question,
  type RevealStats,
  type Standing,
  type StageView,
} from '@quiz/shared';
import { currentRound, recordOf, roundQuestionNumber, streakCounts, type GameState, type PlayerState } from './game';
import { attemptsUsed } from './blitz';
import { rankPlayers } from './ranking';

const REVEALED: Phase[] = ['reveal', 'leaderboard', 'finished'];
const WITH_STANDINGS: Phase[] = ['leaderboard', 'round_end', 'finished'];
// У цих етапах запитання ще (або вже) немає: журнал показує лише останнє зігране.
const BETWEEN_QUESTIONS: Phase[] = ['lobby', 'intro', 'round_end'];

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
  const choices = state.presented
    .map((id) => source.find((choice) => choice.id === id))
    .filter((choice): choice is Choice => choice !== undefined)
    .map((choice) => ({ id: choice.id, text: choice.text }));
  return {
    type: question.type,
    text: question.text,
    imageUrl: question.imageUrl,
    timeLimit: question.timeLimit,
    points: question.points,
    choices,
  };
}

function roundInfo(state: GameState): RoundInfo | null {
  const round = currentRound(state);
  if (round === null) return null;
  return {
    index: state.roundIndex,
    total: state.quiz.rounds.length,
    title: round.title,
    type: round.type,
    partial: round.rules.partial !== null,
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

/** Поточне запитання бліцу з його раундом; null поза запитанням або в класичному раунді. */
function currentBlitz(state: GameState) {
  if (!inQuestion(state)) return null;
  const play = state.plays[state.questionIndex];
  const round = play === undefined ? undefined : state.quiz.rounds[play.roundIndex];
  return round?.type === 'blitz' && play?.blitz !== undefined ? { play, blitz: play.blitz, round } : null;
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
  const { play, blitz, round } = open;
  const index = blitz.queue.findIndex((entry) => entry.playerId === playerId);
  const used = attemptsUsed(play, playerId);
  const left = round.attempts === null ? null : Math.max(0, round.attempts - used);
  return {
    position: index < 0 ? null : index + 1,
    attemptsUsed: used,
    attemptsLeft: left,
    canBuzz: state.phase === 'question' && !state.paused && index < 0 && (left === null || left > 0),
    deadline: index < 0 ? null : blitz.queue[index].deadline,
  };
}

function hostBlitz(state: GameState): HostBlitz | null {
  const open = currentBlitz(state);
  if (open === null) return null;
  const { blitz, round } = open;
  return {
    manual: round.check === 'manual',
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

function base(state: GameState) {
  const round = currentRound(state);
  return {
    phase: state.phase,
    paused: state.paused,
    round: roundInfo(state),
    questionIndex: roundQuestionNumber(state),
    total: round ? roundQuestions(round).length : questionsOf(state.quiz).length,
    question: publicQuestion(state),
    endsAt: state.endsAt,
    remainingMs: state.remainingMs,
    playerCount: state.players.length,
    answeredCount: Object.keys(currentAnswers(state)).length,
    blitz: blitzInfo(state),
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
    stats: revealed !== null ? revealStats(state, revealed) : null,
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
  const revealed = isRevealed(state);
  const standings = publicStandings(state);
  // На етапі locked бали за поточне запитання ще не показуємо: це видало б правильність до розкриття.
  const hidden = state.phase === 'locked' && record !== undefined ? record.points : 0;
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
      answer: queued === undefined ? (record?.answer ?? null) : queued,
      result:
        revealed && record !== undefined
          ? {
              accepted: record.accepted,
              accuracy: record.accuracy,
              grade: record.grade,
              streakBonus: record.streakBonus,
              points: record.points,
            }
          : null,
      blitz: playerBlitz(state, playerId),
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
    standings: rankPlayers(state.players),
  };
}
