import { LIMITS, type Phase } from '@quiz/shared';
import { fail, ok, type GameState, type Result, type TeamMember } from './game';
import { normalizeText } from './normalize';
import { suspend } from './restore';
import { trialOpen } from './survival';
import { teamsOn } from './teams';

/** Етапи між запитаннями (13b): тут гру можна зберегти й продовжити з того самого місця. */
export const REST_PHASES: readonly Phase[] = ['intro', 'reveal', 'board', 'leaderboard', 'round_end'];

/** Межа між запитаннями: REST_PHASES, duel === null, !trialOpen, жодної апеляції з outcome === null. */
export function restPoint(state: GameState): boolean {
  if (!REST_PHASES.includes(state.phase)) return false;
  if (state.duel !== null) return false;
  if (trialOpen(state)) return false;
  return !(state.appeals ?? []).some((a) => a.outcome === null);
}

/** Стан кімнати продовження: suspend(checkpoint, at), awaiting [], автопілот — paused з hold 'author' і at null. */
export function continueFrom(checkpoint: GameState, at: number): GameState {
  // Відсутніх не чекають: хто повернеться, той і грає; пауза — лише пауза збору.
  const s: GameState = { ...suspend(checkpoint, at), awaiting: [] };
  if (s.autopilot === undefined) return s;
  return { ...s, autopilot: { ...s.autopilot, hold: 'author', at: null } };
}

/** Новенький у точному продовженні: лише restPoint (інакше wrong_phase); перевірки ніка й місткості як addPlayer / addMember; команда — найменша. */
export function addLatePlayer(state: GameState, player: { id: string; nickname: string }): Result {
  if (!restPoint(state)) return fail('wrong_phase');
  const nickname = player.nickname.replace(/\s+/g, ' ').trim();
  if (nickname.length < LIMITS.nicknameMin || nickname.length > LIMITS.nicknameMax) return fail('nickname_invalid');
  const key = normalizeText(nickname);
  if (teamsOn(state)) {
    const { members, list } = state.teams;
    if (members.length >= LIMITS.maxPlayers) return fail('room_full');
    if (members.some((m) => normalizeText(m.nickname) === key)) return fail('nickname_taken');
    // Найменша команда; нічия — перша в list. Капітанство не міняється.
    const sizes = list.map((t) => members.filter((m) => m.teamId === t.id).length);
    const smallest = list[sizes.indexOf(Math.min(...sizes))];
    if (smallest === undefined) return fail('not_found');
    const added: TeamMember = { id: player.id, nickname, connected: true, teamId: smallest.id };
    return ok({ ...state, teams: { ...state.teams, members: [...members, added] } });
  }
  if (state.players.length >= LIMITS.maxPlayers) return fail('room_full');
  if (state.players.some((p) => normalizeText(p.nickname) === key)) return fail('nickname_taken');
  return ok({ ...state, players: [...state.players, { id: player.id, nickname, connected: true, score: 0, totalTimeMs: 0, streak: 0 }] });
}

/** Люди гри: соло — players; командна гра — members з teamId (team — назва команди); у порядку стану. */
export function slotsOf(state: GameState): { id: string; nickname: string; team: string | null }[] {
  if (!teamsOn(state)) return state.players.map((p) => ({ id: p.id, nickname: p.nickname, team: null }));
  const names = new Map(state.teams.list.map((t) => [t.id, t.name]));
  return state.teams.members.flatMap((m) => {
    const team = m.teamId === null ? undefined : names.get(m.teamId);
    return team === undefined ? [] : [{ id: m.id, nickname: m.nickname, team }];
  });
}
