import {
  bluffFact,
  factLimitMs,
  gameAwards,
  gameCard,
  isUnscored,
  ownRevealFact,
  revealFacts,
  roundCard,
  roundFacts,
  roundShares,
  type FactInput,
  type FactQuestion,
  type FactRow,
  type GameFacts,
  type OwnFacts,
  type RoundShare,
} from '@quiz/shared';
import { roundCount, scoreLinesByPlayer, withRounds } from './breakdown';
import { recordOf, type GameState } from './game';
import { rankPlayers } from './ranking';

/** Вхід цікавинок на стан: один на всі зрізи, не змінюється після побудови (shared кешує похідне за ним). */
const inputCache = new WeakMap<GameState, FactInput>();
/** Спільні цікавинки на стан і прапорець revealOpen: одні на сцену, пульт і кожен телефон. */
const factsCache = new WeakMap<GameState, Map<boolean, GameFacts | null>>();

/** Вхід цікавинок зі стану (12d): закриті запитання, рядки як recorder.answerRows (без штрафів і голосів), таблиця з колонками раундів, куплені дебафи. Кеш — WeakMap за станом. */
export function factInput(state: GameState): FactInput {
  const found = inputCache.get(state);
  if (found !== undefined) return found;
  // Відкрите запитання завжди останнє в журналі й ще не рахується (як у scoreLines).
  const closedCount = state.phase === 'question' ? state.plays.length - 1 : state.plays.length;
  const questions: FactQuestion[] = [];
  const rows: FactRow[] = [];
  let number = 0;
  for (let index = 0; index < closedCount; index++) {
    const play = state.plays[index];
    const { roundIndex } = play;
    number = index > 0 && state.plays[index - 1].roundIndex === roundIndex ? number + 1 : 1;
    const scored = !isUnscored(play.question);
    questions.push({
      index,
      roundIndex,
      number,
      text: play.question.text,
      limitMs: factLimitMs(play.question, state.quiz.rounds[roundIndex], play.board?.answerMode === 'voice'),
      scored,
      board: play.board !== undefined,
      blitz: play.blitz !== undefined,
      bluff: play.question.type === 'bluff',
      final: play.final !== undefined,
    });
    // Голоси опитувань і хмари — не відповіді.
    if (!scored) continue;
    for (const player of state.players) {
      const record = recordOf(state, index, player.id);
      if (record === undefined) continue;
      const row = { playerId: player.id, questionIndex: index, roundIndex, buff: null, spare: false, wager: null, bluff: null };
      const attempts = play.blitz?.attempts.filter((a) => a.playerId === player.id);
      if (attempts !== undefined) {
        // Бліц — по рядку на спробу; штраф бліц-клітинки рядком не є.
        attempts.forEach((a, attempt) => rows.push({ ...row, attempt, timeMs: a.timeMs, accepted: a.grade === 'correct' }));
        continue;
      }
      // Мовчання у фіналі — штраф, а не відповідь.
      if (play.final !== undefined && record.answer === null) continue;
      rows.push({
        ...row,
        attempt: 0,
        timeMs: record.timeMs,
        accepted: record.accepted,
        buff: record.buff ?? null,
        spare: record.spare !== undefined,
        wager: play.final === undefined ? null : (play.final.wagers[player.id] ?? 0),
        bluff: bluffFact(record.answer),
      });
    }
  }
  const players = withRounds(rankPlayers(state.players), scoreLinesByPlayer(state), roundCount(state)).map((row) => ({
    id: row.participantId,
    nickname: row.nickname,
    rank: row.rank,
    score: row.score,
    rounds: row.rounds ?? [],
  }));
  const debuffs = state.adjustments.filter((a) => a.source === 'debuff').map((a) => ({ by: a.playerId, target: a.target ?? null }));
  const input = { players, questions, rows, debuffs, away: [] };
  inputCache.set(state, input);
  return input;
}

/**
 * Спільні цікавинки для всіх ролей; null поза reveal, round_end, finished. Кеш за станом.
 * revealOpen — рядок розкриття можна показати (розкрито, правда блефу й дошка «100 до 1» відкриті, не «Мільйонер»): рахує views.ts.
 */
export function gameFacts(state: GameState, revealOpen: boolean): GameFacts | null {
  let byFlag = factsCache.get(state);
  if (byFlag === undefined) {
    byFlag = new Map();
    factsCache.set(state, byFlag);
  }
  if (byFlag.has(revealOpen)) return byFlag.get(revealOpen) ?? null;
  const facts = buildFacts(state, revealOpen);
  byFlag.set(revealOpen, facts);
  return facts;
}

function buildFacts(state: GameState, revealOpen: boolean): GameFacts | null {
  switch (state.phase) {
    case 'reveal':
      return { reveal: revealOpen ? revealFacts(factInput(state), state.questionIndex) : null, round: null, awards: null };
    case 'round_end':
      return { reveal: null, round: roundFacts(factInput(state), state.roundIndex), awards: null };
    case 'finished':
      return { reveal: null, round: null, awards: gameAwards(factInput(state)) };
    default:
      return null;
  }
}

/** Свої цікавинки учасника рушія (гравця чи команди); shared — gameFacts того самого стану; null поза reveal, round_end, finished або без учасника. */
export function ownFacts(state: GameState, playerId: string, shared: GameFacts | null): OwnFacts | null {
  if (shared === null || !state.players.some((p) => p.id === playerId)) return null;
  // Розкриття без рядка (ще не відкрито, фінал, бліц…) — своїх цікавинок теж немає, вхід не потрібен.
  if (state.phase === 'reveal' && shared.reveal === null) return { reveal: null, round: null, game: null };
  const input = factInput(state);
  return {
    reveal: shared.reveal === null ? null : ownRevealFact(input, state.questionIndex, playerId, shared.reveal),
    round: state.phase === 'round_end' ? roundCard(input, playerId, state.roundIndex) : null,
    game: state.phase === 'finished' ? gameCard(input, playerId) : null,
  };
}

/** Частки правильних запитань раунду для пульта: лише round_end. */
export function roundQuestionShares(state: GameState): RoundShare[] | null {
  return state.phase === 'round_end' ? roundShares(factInput(state), state.roundIndex) : null;
}
