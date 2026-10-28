import { LIMITS, RESUME_POINTS_MAX, type ErrorCode, type ResumeLobby, type ResumeSetup } from '@quiz/shared';
// game.ts викликає цей файл, а цей файл — game.ts (так само adjust.ts); обидва звертаються одне до одного лише під час виклику.
import { addAdjustment } from './adjust';
import type { GameState } from './game';
import { teamsOn } from './teams';

// «Продовжити гру» (12r): стартовий раунд і перенесені бали. Правила — план 12r, «Перевірка» і «Старт».

/** Кому можна перенести бали (12r): соло — гравці, командна гра — команди з налаштувань (усі, і порожні). */
export function resumeParticipants(state: GameState): { id: string; nickname: string }[] {
  if (teamsOn(state)) return state.teams.list.map((t) => ({ id: t.id, nickname: t.name }));
  return state.players.map((p) => ({ id: p.id, nickname: p.nickname }));
}

/** Лобі «Продовжити гру» для пульта й автора; поза лобі null. */
export function resumeLobby(state: GameState): ResumeLobby | null {
  if (state.phase !== 'lobby') return null;
  return {
    rounds: state.quiz.rounds.map((r) => ({ title: r.title, type: r.type })),
    participants: resumeParticipants(state),
  };
}

/** Перевірка даних «Продовжити гру» у лобі; null — гаразд. Порядок — план 12r, «Перевірка». */
export function resumeError(state: GameState, resume: ResumeSetup): ErrorCode | null {
  const { roundIndex, points } = resume;
  if (!Number.isInteger(roundIndex) || roundIndex < 0 || roundIndex >= state.quiz.rounds.length) return 'resume_invalid';
  const entries = Object.entries(points);
  if (entries.some(([, value]) => !Number.isInteger(value) || Math.abs(value) > RESUME_POINTS_MAX)) return 'resume_invalid';
  if (entries.length > LIMITS.maxPlayers) return 'resume_invalid';
  const known = new Set(resumeParticipants(state).map((p) => p.id));
  if (entries.some(([id]) => !known.has(id))) return 'not_found';
  return null;
}

/** Рядки 'carry' гравцям, що є в state.players, у їхньому порядку; нуль і чужі ключі пропускаються. Раунд — поточний state.roundIndex. */
export function withCarry(state: GameState, resume: ResumeSetup, now: number): GameState {
  return state.players.reduce((current, player) => {
    const points = Object.hasOwn(resume.points, player.id) ? resume.points[player.id] : 0;
    return points === 0 ? current : addAdjustment(current, player.id, points, now, 'carry');
  }, state);
}
