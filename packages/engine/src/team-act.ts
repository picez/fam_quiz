import { isUnscored, type Answer, type ErrorCode } from '@quiz/shared';
// game.ts, buffs.ts, votes.ts і answerer.ts імпортують цей файл, а цей файл — їх; звертання лише під час виклику функцій.
import { answererMode, answererOf } from './answerer';
import { blitzRulesOf, buzz, isInstant, withPlay } from './blitz';
import { buffOf, canVote } from './buffs';
import { fail, ok, recordOf, submitAnswer, type GameState, type Play, type Result } from './game';
import { captainOf, duelistOf, memberOf, teamsOn } from './teams';

/**
 * Що робить людина: від цього залежить, хто з команди має право (таблиця плану 10j).
 * answerer — той, хто відповідає за команду на поточному запитанні (12g): бафи, блеф, ланцюжок, сортування, стіна, випробування, підказки драбини.
 */
export type TeamAct = 'captain' | 'answer' | 'buzz' | 'vote' | 'duel' | 'self' | 'answerer';

export type Actor = { ok: true; id: string } | { ok: false; error: ErrorCode };

const actor = (id: string): Actor => ({ ok: true, id });
const refuse = (error: ErrorCode): Actor => ({ ok: false, error });

/** Поточне запитання з чергою бліцу на етапі question; інакше null. */
function blitzPlay(state: GameState): { play: Play; instant: boolean } | null {
  if (state.phase !== 'question') return null;
  const play = state.plays[state.questionIndex];
  const rules = play?.blitz === undefined ? null : blitzRulesOf(state, play);
  return rules === null ? null : { play, instant: isInstant(rules) };
}

/** Відповідь у бліці з кнопкою: той, хто натиснув (на зв'язку); без нього, поки команда в черзі, — капітан. */
function blitzAnswerer(state: GameState, play: Play, memberId: string, team: string): Actor {
  const buzzer = play.buzzers?.[team];
  const buzzed = buzzer === undefined ? undefined : memberOf(state, buzzer);
  if (buzzed !== undefined && buzzed.teamId === team && buzzed.connected) return buzzer === memberId ? actor(team) : refuse('not_in_queue');
  if (!(play.blitz?.queue.some((e) => e.playerId === team) ?? false)) return refuse('not_in_queue');
  return captainOf(state, team) === memberId ? actor(team) : refuse('not_captain');
}

/** Відповідач команди (12g): answererOf === memberId → команда; інакше not_captain у режимі captain (як до 12g) чи not_answerer. */
function answererActor(state: GameState, memberId: string, team: string): Actor {
  if (answererOf(state, team) === memberId) return actor(team);
  return refuse(answererMode(state) === 'captain' ? 'not_captain' : 'not_answerer');
}

/** Хто діє: соло — memberId; командна — за таблицею з плану. not_found — не учасник; учасник без команди після старту не буває. */
export function actorOf(state: GameState, memberId: string, act: TeamAct): Actor {
  if (!teamsOn(state)) return actor(memberId);
  const member = memberOf(state, memberId);
  if (member === undefined) return refuse('not_found');
  if (act === 'self' || act === 'vote') return actor(memberId);
  const team = member.teamId;
  if (team === null) return refuse('not_found');
  switch (act) {
    case 'buzz':
      return actor(team);
    case 'duel':
      return duelistOf(state, team) === memberId ? actor(team) : refuse('not_duelist');
    case 'answer': {
      // Опитування й «хмару слів» кожен проходить сам.
      const play = state.plays[state.questionIndex];
      if (play !== undefined && isUnscored(play.question)) return actor(memberId);
      const blitz = blitzPlay(state);
      // Миттєвий бліц: відповідає будь-хто, поки команди немає в черзі; повтор відхилить рушій (already_answered).
      if (blitz !== null && blitz.instant) return actor(team);
      if (blitz !== null) return blitzAnswerer(state, blitz.play, memberId, team);
      return answererActor(state, memberId, team);
    }
    case 'answerer':
      return answererActor(state, memberId, team);
    case 'captain':
      break;
  }
  return captainOf(state, team) === memberId ? actor(team) : refuse('not_captain');
}

/** buzzers[team] = memberId на поточному запитанні. */
function withBuzzer(state: GameState, team: string, memberId: string): GameState {
  const play = state.plays[state.questionIndex];
  return withPlay(state, { ...play, buzzers: { ...play.buzzers, [team]: memberId } });
}

/** Відповідь людини: соло — submitAnswer; командна — actorOf(…, 'answer'); миттєвий бліц пише buzzers; голоси — під id людини. */
export function actAnswer(state: GameState, memberId: string, answer: Answer, now: number): Result {
  // Поза запитанням — wrong_phase для всіх, а не not_captain для некапітана (як у submitAnswer).
  if (state.phase !== 'question') return fail('wrong_phase');
  const who = actorOf(state, memberId, 'answer');
  if (!who.ok) return fail(who.error);
  const result = submitAnswer(state, who.id, answer, now);
  if (!result.ok || !teamsOn(state) || who.id === memberId) return result;
  // Миттєвий бліц: відповідь стала натиском команди — відповідав той, хто її подав.
  const blitz = blitzPlay(state);
  return blitz !== null && blitz.instant ? ok(withBuzzer(result.state, who.id, memberId)) : result;
}

/** Натиск людини: соло — buzz; командна — buzz(команда) і buzzers[команда] = людина. */
export function actBuzz(state: GameState, memberId: string, now: number): Result {
  const who = actorOf(state, memberId, 'buzz');
  if (!who.ok) return fail(who.error);
  const result = buzz(state, who.id, now);
  if (!result.ok || !teamsOn(state)) return result;
  return ok(withBuzzer(result.state, who.id, memberId));
}

/** Капітан вибирає дуелянта своєї команди: дуель declared чи category, команда — дуелянт; not_found — людина не з команди. */
export function pickDuelist(state: GameState, memberId: string, duelistId: string): Result {
  if (!teamsOn(state)) return fail('wrong_phase');
  const duel = state.duel;
  if (duel === null || (duel.stage !== 'declared' && duel.stage !== 'category')) return fail('wrong_phase');
  const who = actorOf(state, memberId, 'captain');
  if (!who.ok) return fail(who.error);
  if (who.id !== duel.challengerId && who.id !== duel.opponentId) return fail('not_captain');
  if (memberOf(state, duelistId)?.teamId !== who.id) return fail('not_found');
  return ok({ ...state, teams: { ...state.teams, duelists: { ...state.teams.duelists, [who.id]: duelistId } } });
}

/** Хто голосує й рахується в «хмарі» / опитуванні: соло — players; командна — люди в командах (порядок приходу). */
export function voterList(state: GameState): { id: string; nickname: string }[] {
  if (!teamsOn(state)) return state.players.map(({ id, nickname }) => ({ id, nickname }));
  return state.teams.members.filter((m) => m.teamId !== null).map(({ id, nickname }) => ({ id, nickname }));
}

/**
 * Людина може дати голос «Запитання в залі» за askerId (без часу й повтору): її команда — не askerId;
 * на полі — не команда, що вибрала клітинку; у класиці — команда вже відповіла й не на запасному. Соло — canVote.
 */
export function canMemberVote(state: GameState, memberId: string, askerId: string): boolean {
  if (!teamsOn(state)) return canVote(state, memberId, askerId);
  const play = state.plays[state.questionIndex];
  const team = memberOf(state, memberId)?.teamId ?? null;
  if (play === undefined || team === null || team === askerId || !state.players.some((p) => p.id === team)) return false;
  if (play.board !== undefined) return team !== play.board.chooserId;
  if (buffOf(play, team)?.spare !== undefined) return false;
  return recordOf(state, state.questionIndex, team) !== undefined;
}
