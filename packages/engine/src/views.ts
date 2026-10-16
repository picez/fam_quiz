import {
  questionsOf,
  type Choice,
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
import { currentRound, recordOf, roundQuestionNumber, type GameState, type PlayerState } from './game';
import { rankPlayers } from './ranking';

const REVEALED: Phase[] = ['reveal', 'leaderboard', 'finished'];
const WITH_STANDINGS: Phase[] = ['leaderboard', 'round_end', 'finished'];
// У цих етапах запитання ще (або вже) немає: журнал показує лише останнє зігране.
const BETWEEN_QUESTIONS: Phase[] = ['lobby', 'intro', 'round_end'];

function currentQuestion(state: GameState): Question | null {
  if (BETWEEN_QUESTIONS.includes(state.phase)) return null;
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
  return BETWEEN_QUESTIONS.includes(state.phase) ? {} : (state.plays[state.questionIndex]?.answers ?? {});
}

/** Запис про відповідь гравця на поточне запитання; поза запитанням його немає. */
function currentRecord(state: GameState, playerId: string) {
  return BETWEEN_QUESTIONS.includes(state.phase) ? undefined : recordOf(state, state.questionIndex, playerId);
}

/** Серія гравця для показу: на етапі locked без поточного запитання, щоб не видати правильність. */
function shownStreak(state: GameState, player: PlayerState): number {
  return state.phase === 'locked' ? previousStreak(state, player.id) : player.streak;
}

/** Серія гравця перед поточним запитанням: поспіль правильні відповіді в цьому раунді. */
function previousStreak(state: GameState, playerId: string): number {
  if (currentRound(state)?.rules.streak === null) return 0;
  let count = 0;
  for (let i = state.questionIndex - 1; i >= 0 && state.plays[i].roundIndex === state.roundIndex; i -= 1) {
    const record = recordOf(state, i, playerId);
    if (record === undefined || record.accuracy < 1) break;
    count += 1;
  }
  return count;
}

function base(state: GameState) {
  const round = currentRound(state);
  return {
    phase: state.phase,
    paused: state.paused,
    round: roundInfo(state),
    questionIndex: roundQuestionNumber(state),
    total: round?.questions.length ?? questionsOf(state.quiz).length,
    question: publicQuestion(state),
    endsAt: state.endsAt,
    remainingMs: state.remainingMs,
    playerCount: state.players.length,
    answeredCount: Object.keys(currentAnswers(state)).length,
  };
}

function isRevealed(state: GameState): boolean {
  return state.questionIndex >= 0 && REVEALED.includes(state.phase);
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

export function playerView(state: GameState, playerId: string): PlayerView | null {
  const player = state.players.find((p) => p.id === playerId);
  if (player === undefined) return null;
  const record = currentRecord(state, playerId);
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
      answer: record?.answer ?? null,
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
    standings: rankPlayers(state.players),
  };
}
