import { describe, expect, it } from 'vitest';
import { addPlayer, createBotGame, type GameState } from '@quiz/engine';
import { classicRound, makeRoundsQuiz, single } from '@quiz/engine/testing';
import { defaultTeams } from '@quiz/shared';
import { adminHostLog } from './admin-host-log';
import type { HostAction } from './rooms/manager';

// 68: що з пульта адміна в кімнаті бота йде в журнал адмінки.

const solo = (): GameState =>
  [['p1', 'Оля'], ['p2', 'Петро']].reduce((s, [id, nickname]) => {
    const added = addPlayer(s, { id: id!, nickname: nickname! });
    if (!added.ok) throw new Error(added.error);
    return added.state;
  }, createBotGame(makeRoundsQuiz([classicRound('r1', [single])])));

describe('admin host log (68)', () => {
  it('each action has its own kind or none', () => {
    const s = solo();
    const kinds: [HostAction | { type: 'hint'; playerId: string } | { type: 'ladder-decide' }, string | null][] = [
      [{ type: 'start' }, 'bot_room_start'],
      [{ type: 'pause' }, 'bot_room_pause'],
      [{ type: 'resume' }, 'bot_room_resume'],
      [{ type: 'end' }, 'bot_room_end'],
      [{ type: 'end-round' }, 'bot_room_end_round'],
      [{ type: 'kick', playerId: 'p1' }, 'bot_room_kick'],
      [{ type: 'release', playerId: 'p1' }, 'bot_room_release'],
      [{ type: 'team-form', form: 'host' }, 'bot_room_teams'],
      [{ type: 'adjust', playerId: 'p1', points: 50 }, 'bot_room_adjust'],
      [{ type: 'override', playerId: 'p1', grade: 'correct' }, 'bot_room_grade'],
      [{ type: 'judge', playerId: 'p1', correct: true }, 'bot_room_grade'],
      [{ type: 'accept', playerId: 'p1' }, 'bot_room_grade'],
      [{ type: 'repick', playerId: 'p1' }, 'bot_room_grade'],
      [{ type: 'name', answer: null }, 'bot_room_grade'],
      [{ type: 'alike-join', from: 'a', to: 'b' }, 'bot_room_grade'],
      [{ type: 'alike-split', playerId: 'p1' }, 'bot_room_grade'],
      [{ type: 'ladder-decide' }, 'bot_room_grade'],
      [{ type: 'undo', target: { round: 0 } }, 'bot_room_undo'],
      [{ type: 'debuff', playerId: 'p1', kind: 'fog' }, 'bot_room_debuff'],
      [{ type: 'undebuff', playerId: 'p1' }, 'bot_room_debuff'],
      [{ type: 'hint', playerId: 'p1' }, 'bot_room_hint'],
    ];
    for (const [action, kind] of kinds) expect(adminHostLog(s, action)?.kind ?? null, action.type).toBe(kind);
    const quiet: (HostAction | { type: 'hint'; playerId: string })[] = [
      { type: 'next' },
      { type: 'lock' },
      { type: 'skip' },
      { type: 'dice' },
      { type: 'roll' },
      { type: 'clue' },
      { type: 'survey-all' },
      { type: 'bluff-all' },
      { type: 'guide-skip' },
      { type: 'duel-skip' },
      { type: 'duel-cancel' },
      { type: 'duel-category', categoryId: 'c' },
      { type: 'pick', cellId: 'c' },
      { type: 'order', playerIds: [] },
      { type: 'time', seconds: 15 },
      { type: 'cloud-hide', key: 'k', hidden: true },
      { type: 'bluff-remove', optionId: 'o' },
      { type: 'team-assign', memberId: 'p1', teamId: null },
      { type: 'team-deal' },
      { type: 'team-dice' },
      { type: 'team-roll' },
      { type: 'captain', teamId: 't', memberId: 'p1' },
      { type: 'truth-hide', playerId: 'p1', hidden: true },
      { type: 'truth-fake', id: null, text: 'x' },
      { type: 'save' },
      { type: 'sounds', on: false },
      { type: 'think-words', words: [] },
      { type: 'think-off', playerId: 'p1', off: true },
    ];
    for (const action of quiet) expect(adminHostLog(s, action), action.type).toBeNull();
  });

  it('a grade carries the nickname with a mark; points, kicks, debuffs and hints the nickname', () => {
    const s = solo();
    expect(adminHostLog(s, { type: 'override', playerId: 'p1', grade: 'correct' })).toEqual({ kind: 'bot_room_grade', text: 'Оля ✓' });
    expect(adminHostLog(s, { type: 'override', playerId: 'p1', grade: 'partial' })?.text).toBe('Оля ½');
    expect(adminHostLog(s, { type: 'override', playerId: 'p2', grade: 'wrong' })?.text).toBe('Петро ✗');
    expect(adminHostLog(s, { type: 'judge', playerId: 'p1', correct: true })?.text).toBe('Оля ✓');
    expect(adminHostLog(s, { type: 'judge', playerId: 'p1', correct: false })?.text).toBe('Оля ✗');
    expect(adminHostLog(s, { type: 'accept', playerId: 'p2' })?.text).toBe('Петро ✓');
    expect(adminHostLog(s, { type: 'repick', playerId: 'p2' })?.text).toBe('Петро ↻');
    expect(adminHostLog(s, { type: 'adjust', playerId: 'p1', points: 50 })?.text).toBe('Оля: +50');
    expect(adminHostLog(s, { type: 'adjust', playerId: 'p1', points: -20 })?.text).toBe('Оля: -20');
    expect(adminHostLog(s, { type: 'kick', playerId: 'p2' })?.text).toBe('Петро');
    expect(adminHostLog(s, { type: 'debuff', playerId: 'p2', kind: 'fog' })?.text).toBe('Петро');
    expect(adminHostLog(s, { type: 'hint', playerId: 'p1' })?.text).toBe('Оля');
    expect(adminHostLog(s, { type: 'start' })).toEqual({ kind: 'bot_room_start' });
    // Невідомий id — без тексту.
    expect(adminHostLog(s, { type: 'kick', playerId: 'nobody' })).toEqual({ kind: 'bot_room_kick' });
  });

  it('a team game: points name the team, a kick names the person', () => {
    let s = createBotGame(makeRoundsQuiz([classicRound('r1', [single])], { teams: defaultTeams(2) }), { teamIds: ['t1', 't2'] });
    for (const [id, nickname] of [['m1', 'Оля'], ['m2', 'Тарас']] as const) {
      const added = addPlayer(s, { id, nickname });
      if (!added.ok) throw new Error(added.error);
      s = added.state;
    }
    const team = s.teams!.list[0]!;
    expect(adminHostLog(s, { type: 'adjust', playerId: team.id, points: 100 })?.text).toBe(`${team.name}: +100`);
    expect(adminHostLog(s, { type: 'kick', playerId: 'm2' })?.text).toBe('Тарас');
  });
});
