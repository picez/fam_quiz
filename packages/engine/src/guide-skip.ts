import type { GameState } from './game';
import { teamsOn } from './teams';

/** 75: скільки голосів треба, щоб пропустити «Як грати»: половина людей на зв'язку, округлено вгору, не менше 1. */
export function guideSkipNeed(people: number): number {
  return Math.max(1, Math.ceil(people / 2));
}

/** Люди на зв'язку, що голосують: соло — гравці, командна гра — учасники команд (не команди). */
export function guideVoters(state: GameState): string[] {
  if (teamsOn(state)) return state.teams.members.filter((m) => m.connected && m.teamId !== null).map((m) => m.id);
  return state.players.filter((p) => p.connected).map((p) => p.id);
}

export interface GuideSkipTally {
  votes: number;
  of: number;
  need: number;
  reached: boolean;
}

/** Голоси лише тих, хто серед guideVoters; of = кількість виборців; reached — votes ≥ need і of > 0. */
export function guideSkipTally(state: GameState, votes: ReadonlySet<string>): GuideSkipTally {
  const voters = guideVoters(state);
  const counted = voters.filter((id) => votes.has(id)).length;
  const need = guideSkipNeed(voters.length);
  return { votes: counted, of: voters.length, need, reached: voters.length > 0 && counted >= need };
}
