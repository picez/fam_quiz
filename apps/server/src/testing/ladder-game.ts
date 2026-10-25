import type { LifelineKind } from '@quiz/shared';
import { LADDER_RIGHT, LADDER_WRONG } from '@quiz/engine/testing';
import type { Room, RoomManager } from '../rooms/manager';

/** Правильна й неправильна відповідь на l1…l5 (`ladderQuestions`). */
export { LADDER_RIGHT, LADDER_WRONG };

/**
 * Грає одне запитання драбини до етапу leaderboard: contestant — правильно (true) / неправильно (false) / мовчить (null);
 * hall — відповіді глядачів (раніше за учасника: його відповідь закриває голосування залу) (true правильно, false неправильно, немає — мовчить); lifelines — що учасник бере перед відповіддю
 * (порядок масиву). Учасника до виклику вибирають: ведучий (`hostLadderPick`) або жереб. Якщо після попереднього запитання
 * чекає рішення, учасник «грає далі».
 */
export function playLadderQuestion(
  manager: RoomManager,
  room: Room,
  plan: { contestant: boolean | null; hall?: Record<string, boolean>; lifelines?: LifelineKind[] },
): void {
  const phase = (): string => room.state.phase;
  if (phase() === 'lobby') manager.host(room, { type: 'start' });
  // Рішення після попереднього запитання: «Граю далі», далі перехід.
  if (phase() === 'leaderboard' && room.state.plays[room.state.questionIndex]?.ladder?.decision === null) manager.hostLadderDecide(room, false);
  for (let guard = 0; guard < 6 && phase() !== 'question'; guard++) manager.host(room, { type: 'next' });
  if (phase() !== 'question') throw new Error(`expected question, got ${phase()}`);
  const index = Number(room.state.plays[room.state.questionIndex].question.id.slice(1)) - 1;
  const contestantId = room.state.plays[room.state.questionIndex].ladder?.contestantId;
  if (contestantId === undefined) throw new Error('no contestant');
  for (const kind of plan.lifelines ?? []) {
    const taken = manager.lifeline(room, contestantId, kind);
    if (!taken.ok) throw new Error(`lifeline ${kind}: ${taken.error}`);
  }
  for (const [id, right] of Object.entries(plan.hall ?? {})) manager.answer(room, id, right ? LADDER_RIGHT[index] : LADDER_WRONG[index]);
  if (plan.contestant !== null) manager.answer(room, contestantId, plan.contestant ? LADDER_RIGHT[index] : LADDER_WRONG[index]);
  if (phase() === 'question') manager.host(room, { type: 'lock' });
  manager.host(room, { type: 'next' });
  if (phase() !== 'reveal') throw new Error(`expected reveal, got ${phase()}`);
  manager.host(room, { type: 'next' });
  if (phase() !== 'leaderboard') throw new Error(`expected leaderboard, got ${phase()}`);
}
