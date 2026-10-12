import type {
  Choice,
  HostView,
  Phase,
  PlayerView,
  PublicQuestion,
  Question,
  RevealStats,
  Standing,
  StageView,
} from '@quiz/shared';
import { recordOf, type GameState } from './game';
import { rankPlayers } from './ranking';

const REVEALED: Phase[] = ['reveal', 'leaderboard', 'finished'];
const WITH_STANDINGS: Phase[] = ['leaderboard', 'finished'];

function currentQuestion(state: GameState): Question | null {
  return state.questionIndex >= 0 ? state.quiz.questions[state.questionIndex] : null;
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

function base(state: GameState) {
  const current = state.answers[state.questionIndex] ?? {};
  return {
    phase: state.phase,
    paused: state.paused,
    questionIndex: state.questionIndex,
    total: state.quiz.questions.length,
    question: publicQuestion(state),
    endsAt: state.endsAt,
    remainingMs: state.remainingMs,
    playerCount: state.players.length,
    answeredCount: Object.keys(current).length,
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
  const records = Object.values(state.answers[state.questionIndex] ?? {});
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
    players: state.players.map((p) => ({ id: p.id, nickname: p.nickname, connected: p.connected })),
    reveal: revealed,
    stats: revealed !== null ? revealStats(state, revealed) : null,
    standings: publicStandings(state),
  };
}

export function playerView(state: GameState, playerId: string): PlayerView | null {
  const player = state.players.find((p) => p.id === playerId);
  if (player === undefined) return null;
  const record = recordOf(state, state.questionIndex, playerId);
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
          ? { accepted: record.accepted, accuracy: record.accuracy, points: record.points }
          : null,
    },
    reveal: revealed ? currentQuestion(state) : null,
    standings,
  };
}

export function hostView(state: GameState): HostView {
  const responses = state.players.flatMap((player) => {
    const record = recordOf(state, state.questionIndex, player.id);
    if (record === undefined) return [];
    return [
      {
        playerId: player.id,
        nickname: player.nickname,
        answer: record.answer,
        timeMs: record.timeMs,
        accepted: record.accepted,
        points: record.points,
        overridden: record.overridden,
      },
    ];
  });
  return {
    ...base(state),
    role: 'host',
    players: state.players.map((p) => ({ id: p.id, nickname: p.nickname, connected: p.connected, score: p.score })),
    correct: currentQuestion(state),
    responses,
    standings: rankPlayers(state.players),
  };
}
