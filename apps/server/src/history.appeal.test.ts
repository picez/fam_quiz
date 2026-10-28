import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { factInput } from '@quiz/engine';
import { classicRound, makeRoundsQuiz, single, withId } from '@quiz/engine/testing';
import { defaultTeams, factTable, gameAwards, gameCard } from '@quiz/shared';
import { answer, appeal, AWAY_ATTEMPT, participant, scoreAdjustment, user } from './db/schema';
import { hostGame, hostGameWithFacts } from './history';
import { attachRecorder } from './recorder';
import { RoomManager, type Room } from './rooms/manager';
import { FakeScheduler } from './testing/fake-scheduler';
import { seedGame } from './testing/history-rows';
import { createTestDb } from './testing/test-db';
import { recordedTeamGame, TEAM_HOST, toEnd, toQuestion } from './testing/team-game';

const HOST = 'appeal-host';
const right = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;

async function soloGame() {
  const db = await createTestDb();
  await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'appeal-host@example.com' });
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const errors: unknown[] = [];
  const recorder = attachRecorder(manager, db, (error) => errors.push(error));
  const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')], { speedBonus: false })]);
  const room = manager.create(quiz, HOST, null);
  const enter = (nickname: string) => {
    const joined = manager.join(room.code, nickname, null);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    return joined.playerId;
  };
  const olya = enter('Оля');
  const petro = enter('Петро');
  const ira = enter('Іра');
  const host = (action: Parameters<RoomManager['host']>[1]) => expect(manager.host(room, action)).toEqual({ ok: true });
  return { db, scheduler, manager, recorder, errors, room, olya, petro, ira, host };
}

/** Людина оскаржує на розкритті, виборці голосують; рушій сам ухвалює рішення, коли проголосували всі. */
function appealWith(manager: RoomManager, room: Room, by: string, reason: 'grade' | 'away', votes: [string, boolean][]): void {
  expect(manager.appeal(room, by, reason)).toEqual({ ok: true });
  const id = room.state.appeals?.at(-1)?.id ?? -1;
  for (const [voter, yes] of votes) expect(manager.appealVote(room, voter, id, yes)).toEqual({ ok: true });
}

/** Σ answer.points + Σ score_adjustment.points = participant.score у кожного учасника. */
async function expectRowsSumToScore(db: Awaited<ReturnType<typeof soloGame>>['db']) {
  const rows = await db.select().from(answer);
  const adjustments = await db.select().from(scoreAdjustment);
  const people = await db.select().from(participant);
  expect(people.length).toBeGreaterThan(0);
  for (const p of people) {
    const sum = rows.filter((r) => r.participantId === p.id).reduce((s, r) => s + r.points, 0) + adjustments.filter((a) => a.participantId === p.id).reduce((s, a) => s + a.points, 0);
    expect(sum).toBe(p.score);
  }
}

describe('history: appeal (12f)', () => {
  it('stores the counts and the decision, never a voter; the history shows the appeal beside the answer and the adjustment gets its breakdown line', async () => {
    const { db, manager, recorder, errors, room, olya, petro, ira, host } = await soloGame();
    host({ type: 'start' });
    toQuestion(manager, room);
    manager.answer(room, olya, wrong);
    manager.answer(room, petro, right);
    manager.answer(room, ira, right);
    host({ type: 'next' }); // reveal
    appealWith(manager, room, olya, 'grade', [[petro, true], [ira, true]]);
    expect(room.state.appeals?.[0]).toMatchObject({ outcome: 'yes' });
    toEnd(manager, room);
    await recorder.idle();
    expect(errors).toEqual([]);

    const stored = await db.select().from(appeal);
    expect(stored).toEqual([{ gameId: room.id, seq: 1, participantId: olya, questionIndex: 0, reason: 'grade', yes: 2, no: 0, outcome: 'yes', adjustmentSeq: expect.any(Number) }]);
    // Той самий рядок 'appeal', що й у живій грі.
    expect(stored[0].adjustmentSeq).toBe(room.state.appeals?.[0].adjustmentSeq);
    expect((await db.select().from(scoreAdjustment)).find((a) => a.source === 'appeal')?.seq).toBe(stored[0].adjustmentSeq);
    expect(Object.keys(stored[0]).sort()).toEqual(['adjustmentSeq', 'gameId', 'no', 'outcome', 'participantId', 'questionIndex', 'reason', 'seq', 'yes']);

    const detail = await hostGame(db, HOST, room.id);
    const first = detail?.questions[0].responses ?? [];
    expect(first.find((r) => r.nickname === 'Оля')?.appeal).toEqual({ reason: 'grade', yes: 2, no: 0, outcome: 'yes' });
    expect(first.find((r) => r.nickname === 'Петро')?.appeal).toBeNull();
    expect(detail?.questions[1].responses.every((r) => r.appeal === null)).toBe(true);
    const adjustment = detail?.adjustments.find((a) => a.source === 'appeal');
    expect(adjustment).toMatchObject({ nickname: 'Оля', points: 1000 });
    expect(detail?.standings.find((s) => s.nickname === 'Оля')?.breakdown.parts.find((p) => p.source === 'appeal')).toEqual({ source: 'appeal', plus: 1000, minus: 0 });
    await expectRowsSumToScore(db);
  });

  it('a tie keeps the result: the history shows it and there is no adjustment', async () => {
    const { db, manager, recorder, room, olya, petro, ira, host } = await soloGame();
    host({ type: 'start' });
    toQuestion(manager, room);
    manager.answer(room, olya, wrong);
    manager.answer(room, petro, right);
    manager.answer(room, ira, right);
    host({ type: 'next' });
    appealWith(manager, room, olya, 'grade', [[petro, true], [ira, false]]);
    toEnd(manager, room);
    await recorder.idle();
    const detail = await hostGame(db, HOST, room.id);
    expect(detail?.questions[0].responses.find((r) => r.nickname === 'Оля')?.appeal).toEqual({ reason: 'grade', yes: 1, no: 1, outcome: 'tie' });
    expect(detail?.adjustments.filter((a) => a.source === 'appeal')).toEqual([]);
    expect((await db.select().from(appeal))[0]).toMatchObject({ outcome: 'tie', adjustmentSeq: null });
    await expectRowsSumToScore(db);
  });

  it('the stored rows still sum to the score after an appeal and after its undo', async () => {
    const { db, manager, recorder, room, olya, petro, ira, host } = await soloGame();
    host({ type: 'start' });
    toQuestion(manager, room);
    manager.answer(room, olya, wrong);
    manager.answer(room, petro, right);
    manager.answer(room, ira, right);
    host({ type: 'next' });
    appealWith(manager, room, olya, 'grade', [[petro, true], [ira, true]]);
    await recorder.idle();
    await expectRowsSumToScore(db);
    const row = room.state.adjustments.find((a) => a.source === 'appeal');
    expect(row).toBeDefined();
    host({ type: 'next' }); // the question is closed: the appeal row is visible and can be undone
    expect(manager.host(room, { type: 'undo', target: { seq: row?.seq ?? -1 } })).toEqual({ ok: true });
    await recorder.idle();
    await expectRowsSumToScore(db);
    const adjustments = await db.select().from(scoreAdjustment);
    expect(adjustments.map((a) => a.source).sort()).toEqual(['appeal', 'undo']);
    expect(room.state.players.find((p) => p.id === olya)?.score).toBe(0);
  });

  it('the awards and the table of the history equal those of the game, with won and lost appeals', async () => {
    const { db, manager, recorder, room, olya, petro, ira, host } = await soloGame();
    host({ type: 'start' });
    toQuestion(manager, room);
    for (const id of [olya, petro, ira]) manager.answer(room, id, id === olya ? wrong : right);
    host({ type: 'next' });
    appealWith(manager, room, olya, 'grade', [[petro, true], [ira, true]]);
    host({ type: 'next' });
    toQuestion(manager, room);
    for (const id of [olya, petro, ira]) manager.answer(room, id, id === olya ? wrong : right);
    host({ type: 'next' });
    appealWith(manager, room, olya, 'grade', [[petro, false], [ira, false]]);
    toEnd(manager, room);
    await recorder.idle();
    const live = factInput(room.state);
    expect(live.appeals).toEqual([
      { playerId: olya, outcome: 'yes' },
      { playerId: olya, outcome: 'no' },
    ]);
    const stored = await hostGameWithFacts(db, HOST, room.id);
    expect(stored?.factInput.appeals).toEqual(live.appeals);
    expect(stored?.detail.facts.awards).toEqual(gameAwards(live));
    expect(stored?.detail.facts.table).toEqual(factTable(live));
    expect(gameCard(stored?.factInput ?? live, olya)?.appeals).toEqual({ won: 1, lost: 1 });
  });

  it('a participant with only an away mark still shows the appeal on a row without an answer', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'appeal-host@example.com' });
    const { gameId, participantIds } = await seedGame(db, {
      hostId: HOST,
      startedAt: new Date(2026, 0, 4),
      players: [
        { userId: null, nickname: 'Тарас', score: 0, rank: 2, rows: [{ questionIndex: 0, attempt: AWAY_ATTEMPT, accepted: false, points: 0, awayMs: 4000 }] },
        { userId: null, nickname: 'Олена', score: 1000, rank: 1, rows: [{ questionIndex: 0, accepted: true, points: 1000 }] },
      ],
    });
    await db.insert(appeal).values({ gameId, seq: 1, participantId: participantIds[0]!, questionIndex: 0, reason: 'away', yes: 1, no: 0, outcome: 'yes', adjustmentSeq: null });
    const detail = await hostGame(db, HOST, gameId);
    const responses = detail?.questions[0].responses ?? [];
    expect(responses.find((r) => r.nickname === 'Тарас')).toEqual({ nickname: 'Тарас', answer: null, accepted: false, buff: null, spare: null, awayMs: 4000, appeal: { reason: 'away', yes: 1, no: 0, outcome: 'yes' } });
    expect(responses.find((r) => r.nickname === 'Олена')?.appeal).toBeNull();
    expect(responses).toHaveLength(2);
  });

  it('team game: the captain appeals for the team; the row belongs to the team and the history shows it on the team answer', async () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')], { speedBonus: false })], { teams: defaultTeams(2) });
    const { db, manager, recorder, errors, room, members, teams } = await recordedTeamGame(quiz);
    toQuestion(manager, room);
    expect(manager.answer(room, members['Оля'], wrong)).toEqual({ ok: true });
    expect(manager.answer(room, members['Віра'], right)).toEqual({ ok: true });
    if (room.state.phase !== 'locked') manager.host(room, { type: 'lock' });
    manager.host(room, { type: 'next' });
    expect(room.state.phase).toBe('reveal');
    appealWith(manager, room, members['Оля'], 'grade', [[members['Віра'], true], [members['Ігор'], true]]);
    expect(room.state.appeals?.[0]).toMatchObject({ by: teams[0], outcome: 'yes', votes: {}, yes: 2, no: 0 });
    toEnd(manager, room);
    await recorder.idle();
    expect(errors).toEqual([]);
    const stored = await db.select().from(appeal);
    expect(stored).toEqual([expect.objectContaining({ participantId: teams[0], yes: 2, no: 0, outcome: 'yes', adjustmentSeq: room.state.appeals?.[0].adjustmentSeq })]);
    const detail = await hostGame(db, TEAM_HOST, room.id);
    const withAppeal = detail?.questions[0].responses.filter((r) => r.appeal !== null) ?? [];
    expect(withAppeal.map((r) => [r.nickname, r.appeal])).toEqual([[room.state.players.find((p) => p.id === teams[0])?.nickname, { reason: 'grade', yes: 2, no: 0, outcome: 'yes' }]]);
    // Імен виборців у базі немає.
    expect(JSON.stringify(stored)).not.toContain(members['Віра']);
  });

  it('a cancelled appeal is not stored', async () => {
    const { db, manager, recorder, room, olya, petro, ira, host } = await soloGame();
    host({ type: 'start' });
    toQuestion(manager, room);
    manager.answer(room, olya, wrong);
    manager.answer(room, petro, right);
    manager.answer(room, ira, right);
    host({ type: 'next' });
    expect(manager.appeal(room, olya, 'grade')).toEqual({ ok: true });
    expect(manager.appealVote(room, petro, 1, true)).toEqual({ ok: true });
    host({ type: 'end-round' });
    expect(room.state.appeals?.[0]).toMatchObject({ outcome: 'cancelled', votes: {} });
    toEnd(manager, room);
    await recorder.idle();
    expect(await db.select().from(appeal)).toEqual([]);
  });

  it('an old game without appeals reads appeal as null everywhere', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'appeal-host@example.com' });
    const { gameId } = await seedGame(db, {
      hostId: HOST,
      startedAt: new Date(2026, 0, 3),
      players: [{ userId: null, nickname: 'Тарас', score: 1000, rank: 1, rows: [{ questionIndex: 0, accepted: true, points: 1000 }] }],
    });
    const detail = await hostGame(db, HOST, gameId);
    expect(detail?.questions[0].responses.map((r) => r.appeal)).toEqual([null]);
    expect(await db.select().from(appeal).where(eq(appeal.gameId, gameId))).toEqual([]);
  });
});
