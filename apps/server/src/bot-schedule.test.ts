import { classicRound, makeRoundsQuiz, single, think, thinkRound } from '@quiz/engine/testing';
import { BOT_PLANS_MAX, BOT_USER_ID, type BotPlanInput, type PushPayload, type Quiz } from '@quiz/shared';
import { and, eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureBotAccount } from './bot-account';
import { cancelPlan, createPlan } from './bot-plan-store';
import { createBotSchedule, type BotSchedule } from './bot-schedule';
import type { Db } from './db/client';
import { adminAction, botPlan, liveRoom, quiz as quizTable, user } from './db/schema';
import { nextWeekKyiv } from './kyiv-time';
import { ensureProfile } from './profiles';
import { createQuiz } from './quizzes';
import { RoomManager } from './rooms/manager';
import { FakeScheduler } from './testing/fake-scheduler';
import { createTestDb } from './testing/test-db';

let db: Db;
let quizId: string;
const NOW = new Date('2026-11-20T10:00:00.000Z');
const MIN = 60_000;
const DAY = 86_400_000;
/** Старт планів — завтра о 10:00 UTC (12:00 у Києві). */
const T = new Date(NOW.getTime() + DAY);
const at = (ms: number) => new Date(T.getTime() + ms);
const TITLE = 'Карпатські вершини 56';
const peaks = (): Quiz => ({
  ...makeRoundsQuiz([classicRound('r0', [single, { ...single, id: 'q2' }].map((q) => ({ ...q, timeLimit: 30 })))]),
  title: TITLE,
});
const input = (extra: Partial<BotPlanInput> = {}): BotPlanInput => ({
  quizId,
  startsAt: T.toISOString(),
  recipients: { kind: 'people', userIds: ['olya'] },
  autoStartMin: null,
  weekly: false,
  ...extra,
});

let manager: RoomManager;
let sent: { userIds: string[]; payload: PushPayload }[];
let deliver: ReturnType<typeof vi.fn<(userIds: string[], payload: PushPayload) => Promise<number>>>;

function service(extra: { manager?: RoomManager; maxRooms?: number; scheduler?: FakeScheduler } = {}): BotSchedule {
  return createBotSchedule({ db, manager: extra.manager ?? manager, maxRooms: extra.maxRooms ?? 100, deliver, scheduler: extra.scheduler });
}
/** Прогін і всі відправки. */
async function run(schedule: BotSchedule, when: Date) {
  const report = await schedule.tick(when);
  await schedule.idle();
  return report;
}
async function plan(extra: Partial<BotPlanInput> = {}) {
  const made = await createPlan(db, 'adm', input(extra), NOW);
  if (!made.ok) throw new Error(`plan not made: ${made.error}`);
  return made.plan.id;
}
async function row(id: string) {
  const [found] = await db.select().from(botPlan).where(eq(botPlan.id, id));
  return found!;
}
const logOf = async (kind: string) => db.select().from(adminAction).where(eq(adminAction.kind, kind as never));
const scheduledCount = async () => (await db.select({ id: botPlan.id }).from(botPlan).where(eq(botPlan.status, 'scheduled'))).length;
const pushesWithCode = () => sent.filter((s) => s.payload.kind === 'bot' && s.payload.code !== null);

async function person(id: string, name: string) {
  await db.insert(user).values({ id, name, email: `${id}@example.com` });
  await ensureProfile(db, id);
}

beforeAll(async () => {
  db = await createTestDb();
  expect(await ensureBotAccount(db)).toBe(true);
  await person('adm', 'Адмін 56');
  await person('olya', 'Оля');
  quizId = await createQuiz(db, BOT_USER_ID, peaks());
});

beforeEach(async () => {
  await db.delete(botPlan);
  await db.delete(adminAction);
  manager = new RoomManager(new FakeScheduler(), () => 0.5, { pacing: false });
  sent = [];
  deliver = vi.fn(async (userIds: string[], payload: PushPayload) => {
    sent.push({ userIds, payload });
    return userIds.length;
  });
});

describe('bot schedule (56)', () => {
  it('reminds once 15 minutes ahead and not earlier', async () => {
    const id = await plan();
    const schedule = service();
    await run(schedule, at(-16 * MIN));
    expect(sent).toEqual([]);
    expect(await run(schedule, at(-15 * MIN))).toEqual({ reminded: 1, opened: 0, failed: 0, settled: 0 });
    expect(sent).toEqual([{ userIds: ['olya'], payload: { kind: 'bot', planId: id, title: TITLE, startsAt: T.toISOString(), code: null } }]);
    await run(schedule, at(-14 * MIN));
    expect(sent).toHaveLength(1);
    expect((await row(id)).status).toBe('scheduled');
  });

  it('opens the bot room at the start, pushes the code and logs the run', async () => {
    const id = await plan();
    const schedule = service();
    expect(await run(schedule, T)).toMatchObject({ opened: 1, failed: 0 });
    const opened = await row(id);
    expect(opened.status).toBe('opened');
    expect(opened.roomCode).toMatch(/^\d{6}$/);
    expect(opened.openedAt).toEqual(T);
    const code = opened.roomCode!;
    expect(manager.get(code)?.hostUserId).toBe(BOT_USER_ID);
    expect(manager.get(code)?.id).toBe(opened.roomId);
    expect(sent).toEqual([{ userIds: ['olya'], payload: { kind: 'bot', planId: id, title: TITLE, startsAt: T.toISOString(), code } }]);
    const runs = await logOf('bot_plan_run');
    expect(runs.map((r) => ({ adminId: r.adminId, adminLabel: r.adminLabel, targetUserId: r.targetUserId, details: r.details }))).toEqual([
      { adminId: BOT_USER_ID, adminLabel: 'Квіз-бот', targetUserId: BOT_USER_ID, details: { title: TITLE, code } },
    ]);
    // Повторний прогін нічого не відкриває вдруге.
    await run(schedule, at(MIN));
    expect(manager.botRooms()).toHaveLength(1);
    expect(pushesWithCode()).toHaveLength(1);
  });

  it('nobody came: the lobby closes after the wait', async () => {
    const id = await plan({ autoStartMin: 10 });
    const schedule = service();
    await run(schedule, T);
    const code = (await row(id)).roomCode!;
    await run(schedule, at(9 * MIN));
    expect((await row(id)).status).toBe('opened');
    expect(await run(schedule, at(10 * MIN))).toMatchObject({ settled: 1 });
    const done = await row(id);
    expect(done.status).toBe('nobody');
    expect(done.finishedAt).toEqual(at(10 * MIN));
    expect(manager.get(code)).toBeUndefined();
    expect(await logOf('bot_plan_fail')).toEqual([]);
  });

  it('auto start with one player online', async () => {
    const id = await plan({ autoStartMin: 10 });
    const schedule = service();
    await run(schedule, T);
    const code = (await row(id)).roomCode!;
    const joined = manager.join(code, 'Оля');
    if (!joined.ok) throw new Error('not joined');
    manager.connect(manager.get(code)!, { role: 'player', playerId: joined.playerId });
    await run(schedule, at(10 * MIN));
    expect((await row(id)).status).toBe('played');
    expect(manager.get(code)?.state.phase).not.toBe('lobby');
  });

  it('without auto start a lobby with a player waits for the admin', async () => {
    const id = await plan();
    const schedule = service();
    await run(schedule, T);
    const code = (await row(id)).roomCode!;
    const joined = manager.join(code, 'Оля');
    if (!joined.ok) throw new Error('not joined');
    manager.connect(manager.get(code)!, { role: 'player', playerId: joined.playerId });
    await run(schedule, at(30 * MIN));
    expect((await row(id)).status).toBe('opened');
    expect(manager.get(code)?.state.phase).toBe('lobby');
    expect(manager.botAct(code, 'start')).toEqual({ ok: true });
    await run(schedule, at(31 * MIN));
    expect((await row(id)).status).toBe('played');
  });

  it('without auto start an empty lobby waits 30 minutes', async () => {
    const id = await plan();
    const schedule = service();
    await run(schedule, T);
    await run(schedule, at(29 * MIN));
    expect((await row(id)).status).toBe('opened');
    await run(schedule, at(30 * MIN));
    expect((await row(id)).status).toBe('nobody');
  });

  it('a missed start within 10 minutes still opens, later it fails as server down', async () => {
    const late = await plan();
    await run(service(), at(5 * MIN));
    expect((await row(late)).status).toBe('opened');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.payload).toMatchObject({ kind: 'bot', planId: late });
    expect((sent[0]!.payload as { code: string | null }).code).toMatch(/^\d{6}$/);
    expect((await row(late)).remindedAt).toEqual(at(5 * MIN));

    await db.delete(botPlan);
    sent = [];
    manager = new RoomManager(new FakeScheduler(), () => 0.5, { pacing: false });
    const missed = await plan();
    expect(await run(service(), at(11 * MIN))).toMatchObject({ opened: 0, failed: 1 });
    const failed = await row(missed);
    expect(failed).toMatchObject({ status: 'failed', reason: 'server_down', roomCode: null });
    expect(failed.finishedAt).toEqual(at(11 * MIN));
    expect((await logOf('bot_plan_fail')).map((r) => r.details)).toEqual([{ title: TITLE, reason: 'server_down' }]);
    expect(manager.botRooms()).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('a weekly plan makes the next one after opening or failing, a cancelled one does not', async () => {
    const opened = await plan({ weekly: true, autoStartMin: 15 });
    await run(service(), T);
    const [next] = await db.select().from(botPlan).where(eq(botPlan.previousId, opened));
    expect(next).toMatchObject({ status: 'scheduled', weekly: true, autoStartMin: 15, quizId, title: TITLE, recipients: 'people', people: ['olya'], roomCode: null, roomId: null, remindedAt: null, openedAt: null });
    expect(next!.startsAt).toEqual(nextWeekKyiv(T));

    await db.delete(botPlan);
    const failed = await plan({ weekly: true });
    await run(service(), at(11 * MIN));
    expect((await row(failed)).reason).toBe('server_down');
    const [after] = await db.select().from(botPlan).where(eq(botPlan.previousId, failed));
    expect(after!.startsAt).toEqual(nextWeekKyiv(T));

    await db.delete(botPlan);
    const cancelled = await plan({ weekly: true });
    expect((await cancelPlan(db, 'adm', cancelled, NOW)).ok).toBe(true);
    await run(service(), T);
    expect(await db.select().from(botPlan).where(eq(botPlan.previousId, cancelled))).toEqual([]);
  });

  it('a successor is made even with 20 scheduled, and a create racing with it stays refused', async () => {
    const weekly = await plan({ weekly: true });
    for (let i = 1; i < BOT_PLANS_MAX; i++) await plan({ startsAt: new Date(T.getTime() + i * DAY).toISOString() });
    expect(await scheduledCount()).toBe(BOT_PLANS_MAX);
    const [, raced] = await Promise.all([run(service(), T), createPlan(db, 'adm', input({ startsAt: at(DAY / 2).toISOString() }), NOW)]);
    expect(raced).toEqual({ ok: false, error: 'plans_full' });
    expect((await row(weekly)).status).toBe('opened');
    expect(await db.select().from(botPlan).where(eq(botPlan.previousId, weekly))).toHaveLength(1);
    expect(await scheduledCount()).toBe(BOT_PLANS_MAX);
  });

  it('failures keep their reason', async () => {
    const gone = await createQuiz(db, BOT_USER_ID, { ...peaks(), title: 'Зникне 56' });
    const missing = await plan({ quizId: gone });
    await db.delete(quizTable).where(eq(quizTable.id, gone));
    await run(service(), T);
    expect(await row(missing)).toMatchObject({ status: 'failed', reason: 'quiz_missing' });

    const wordless = makeRoundsQuiz([thinkRound('r1', [think('t1', []), think('t2', [{ word: 'червоний', synonyms: [] }]), think('t3', [{ word: 'червоний', synonyms: [] }])]), classicRound('r2', [single])]);
    const blockedQuiz = await createQuiz(db, BOT_USER_ID, { ...wordless, title: 'Без слів 56' });
    const blocked = await plan({ quizId: blockedQuiz });
    await run(service(), T);
    expect(await row(blocked)).toMatchObject({ status: 'failed', reason: 'autopilot_blocked' });

    for (let i = 0; i < 3; i++) expect(manager.createBotRoom(peaks(), quizId).ok).toBe(true);
    const full = await plan();
    await run(service(), T);
    expect(await row(full)).toMatchObject({ status: 'failed', reason: 'bot_rooms_full' });

    const busy = await plan();
    await run(service({ maxRooms: 0 }), T);
    expect(await row(busy)).toMatchObject({ status: 'failed', reason: 'server_busy' });

    const frozen = await plan();
    manager.freeze();
    expect(await service().tick(T)).toBe('frozen');
    expect((await row(frozen)).status).toBe('scheduled');
    expect((await logOf('bot_plan_fail')).map((r) => (r.details as { reason: string }).reason).sort()).toEqual(['autopilot_blocked', 'bot_rooms_full', 'quiz_missing', 'server_busy']);
  });

  it('two ticks at once open one room and push once', async () => {
    await plan();
    const schedule = service();
    const reports = await Promise.all([schedule.tick(T), schedule.tick(T)]);
    await schedule.idle();
    expect(reports).toContain('busy');
    expect(manager.botRooms()).toHaveLength(1);
    expect(pushesWithCode()).toHaveLength(1);
    // І дві служби (два екземпляри) на ту саму мить: кімната одна.
    await db.delete(botPlan);
    sent = [];
    manager = new RoomManager(new FakeScheduler(), () => 0.5, { pacing: false });
    await plan();
    const one = service();
    const two = service();
    await Promise.all([one.tick(T), two.tick(T)]);
    await Promise.all([one.idle(), two.idle()]);
    expect(manager.botRooms().filter((room) => room.state.phase === 'lobby')).toHaveLength(1);
    expect(pushesWithCode()).toHaveLength(1);
  });

  it('a plan cancelled after the pick leaves no room', async () => {
    const id = await plan();
    const original = manager.createBotRoom.bind(manager);
    const transaction = db.transaction.bind(db);
    const spy = vi.spyOn(db, 'transaction');
    vi.spyOn(manager, 'createBotRoom').mockImplementation((quiz, qid) => {
      const cancelling = cancelPlan(db, 'adm', id, NOW);
      // «Забирання» (наступна транзакція — уже прогону) чекає, поки скасування завершиться: порядок детермінований.
      spy.mockImplementationOnce((async (fn: never) => {
        await cancelling;
        return transaction(fn);
      }) as never);
      return original(quiz, qid);
    });
    const schedule = service();
    try {
      await run(schedule, T);
    } finally {
      spy.mockRestore();
    }
    expect((await row(id)).status).toBe('cancelled');
    expect(manager.botRooms().filter((room) => room.state.phase === 'lobby')).toEqual([]);
    expect(pushesWithCode()).toEqual([]);
    expect(await logOf('bot_plan_run')).toEqual([]);
  });

  it('an open plan survives a restart', async () => {
    const id = await plan({ autoStartMin: 10 });
    await run(service(), T);
    const opened = await row(id);
    const saved = manager.snapshot(manager.get(opened.roomCode!)!);
    manager.freeze();
    const later = new RoomManager(new FakeScheduler(), () => 0.5, { pacing: false });
    expect(later.restore(saved)).not.toBeNull();
    await run(service({ manager: later }), at(10 * MIN));
    expect(await row(id)).toMatchObject({ status: 'nobody', roomId: opened.roomId });
    expect(later.get(opened.roomCode!)).toBeUndefined();
  });

  it('a room another process still holds is not counted as closed', async () => {
    const id = await plan({ autoStartMin: 10 });
    await run(service(), T);
    const opened = await row(id);
    await db.insert(liveRoom).values({ code: opened.roomCode!, roomId: opened.roomId!, data: {}, owner: 'other', heartbeatAt: T, updatedAt: T });
    try {
      const elsewhere = new RoomManager(new FakeScheduler(), () => 0.5, { pacing: false });
      await run(service({ manager: elsewhere }), at(10 * MIN));
      expect((await row(id)).status).toBe('opened');
    } finally {
      await db.delete(liveRoom).where(and(eq(liveRoom.code, opened.roomCode!)));
    }
    await run(service({ manager: new RoomManager(new FakeScheduler(), () => 0.5, { pacing: false }) }), at(11 * MIN));
    expect(await row(id)).toMatchObject({ status: 'failed', reason: 'room_closed' });
  });

  it('a closed room before the start counts as closed', async () => {
    const id = await plan();
    const schedule = service();
    await run(schedule, T);
    const code = (await row(id)).roomCode!;
    expect(manager.botAct(code, 'end')).toEqual({ ok: true });
    await run(schedule, at(MIN));
    expect(await row(id)).toMatchObject({ status: 'failed', reason: 'room_closed' });
    expect((await logOf('bot_plan_fail')).map((r) => r.details)).toEqual([{ title: TITLE, reason: 'room_closed' }]);
  });

  it('start() ticks now and every minute until stop()', async () => {
    const scheduler = new FakeScheduler();
    scheduler.advance(T.getTime() - scheduler.now());
    const ids = [await plan(), await plan({ startsAt: at(60_000).toISOString() }), await plan({ startsAt: at(120_000).toISOString() })];
    const schedule = service({ scheduler });
    schedule.start();
    await schedule.idle();
    expect((await row(ids[0]!)).status).toBe('opened');
    expect((await row(ids[1]!)).status).toBe('scheduled');
    for (let i = 0; i < 2; i++) {
      scheduler.advance(60_000);
      await schedule.idle();
    }
    expect((await Promise.all(ids.map(row))).map((r) => r.status)).toEqual(['opened', 'opened', 'opened']);
    expect(scheduler.pending()).toEqual([60_000]);
    schedule.stop();
    expect(scheduler.pending()).toEqual([]);
  });
});
