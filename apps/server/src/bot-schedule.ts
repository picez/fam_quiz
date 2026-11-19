import {
  BOT_PLAN_LATE_MS,
  BOT_PLAN_REMIND_MS,
  BOT_PLAN_TICK_MS,
  BOT_PLAN_WAIT_MIN,
  BOT_USER_ID,
  type BotPlanReason,
  type BotPlanStatus,
  type PushPayload,
} from '@quiz/shared';
import { and, asc, eq, gt, isNull, lte } from 'drizzle-orm';
import { logAction } from './bans';
import { ensureBotAccount } from './bot-account';
import { openBotGame } from './bot-games';
import { lockPlans, recipientsOf, type BotPlanRow } from './bot-plan-store';
import type { Db } from './db/client';
import { botPlan, liveRoom } from './db/schema';
import { nextWeekKyiv } from './kyiv-time';
import { reportError } from './log';
import { getQuiz } from './quizzes';
import type { RoomManager } from './rooms/manager';
import { realScheduler, type Scheduler } from './rooms/scheduler';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Підсумок прогону: reminded — нагадано планів, opened — відкрито кімнат, failed — планів, що не відкрилися,
 * settled — відкритих, що дійшли кінцевого стану (played, nobody чи failed). busy — прогін уже йде; frozen — зупинка, нічого не зроблено.
 */
export type BotTickReport = 'busy' | 'frozen' | { reminded: number; opened: number; failed: number; settled: number };

export interface BotSchedule {
  /** Один прогін на мить now. Ніколи не кидає. */
  tick(now: Date): Promise<BotTickReport>;
  /** Прогін одразу, далі через BOT_PLAN_TICK_MS після кожного. */
  start(): void;
  stop(): void;
  /** Дочекатися прогону й відправок у польоті. */
  idle(): Promise<void>;
}

const MIN = 60_000;

/**
 * Служба розкладу ігор бота (56). Кожна зміна стану — умовний update («where status = …»), тож план не виконується двічі
 * ні двома прогонами, ні двома екземплярами під час розгортання; кімната, яку не вдалося «забрати», одразу закривається.
 */
export function createBotSchedule(deps: {
  db: Db;
  manager: RoomManager;
  maxRooms: number;
  deliver?: (userIds: string[], payload: PushPayload) => Promise<number>;
  scheduler?: Scheduler;
}): BotSchedule {
  const { db, manager, maxRooms, deliver } = deps;
  const scheduler = deps.scheduler ?? realScheduler;
  let running: Promise<BotTickReport> | null = null;
  let cycling: Promise<void> | null = null;
  let timer: unknown = null;
  let stopped = false;
  let botReady: Promise<boolean> | null = null;
  const inFlight = new Set<Promise<void>>();

  /** Акаунт бота перевіряється раз на службу; збій бази — не запам'ятовується. */
  function bot(): Promise<boolean> {
    botReady ??= ensureBotAccount(db).catch((error: unknown) => {
      botReady = null;
      throw error;
    });
    return botReady;
  }

  /** Пуш адресатам плану — у фоні (idle() його чекає); код null — нагадування. */
  function notify(row: BotPlanRow, code: string | null): void {
    if (deliver === undefined) return;
    const payload: PushPayload = { kind: 'bot', planId: row.id, title: row.title, startsAt: row.startsAt.toISOString(), code };
    const task = (async () => {
      const to = await recipientsOf(db, row);
      if (to.length > 0) await deliver(to, payload);
    })().catch((error: unknown) => reportError(error, { where: 'bot-schedule', what: 'push' }));
    inFlight.add(task);
    void task.finally(() => inFlight.delete(task));
  }

  /** Наступний план щотижневої серії: той самий київський час, перша така мить після now; ліміт не перевіряється (заміняє попередника). */
  async function successor(tx: Tx, row: BotPlanRow, now: Date): Promise<void> {
    if (!row.weekly) return;
    let next = nextWeekKyiv(row.startsAt);
    while (next.getTime() <= now.getTime()) next = nextWeekKyiv(next);
    await tx.insert(botPlan).values({
      quizId: row.quizId,
      title: row.title,
      startsAt: next,
      recipients: row.recipients,
      groupId: row.groupId,
      people: row.people,
      autoStartMin: row.autoStartMin,
      weekly: true,
      previousId: row.id,
      createdBy: row.createdBy,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** scheduled → failed; той самий замок, що й створення, тож наступник серії не проскочить повз межу паралельного створення. */
  async function failPlan(row: BotPlanRow, reason: BotPlanReason, now: Date): Promise<boolean> {
    return db.transaction(async (tx) => {
      await lockPlans(tx);
      const [claimed] = await tx
        .update(botPlan)
        .set({ status: 'failed', reason, finishedAt: now, updatedAt: now })
        .where(and(eq(botPlan.id, row.id), eq(botPlan.status, 'scheduled')))
        .returning();
      if (claimed === undefined) return false;
      await logAction(tx, { adminId: BOT_USER_ID, kind: 'bot_plan_fail', targetUserId: BOT_USER_ID, details: { title: claimed.title, reason }, now });
      await successor(tx, claimed, now);
      return true;
    });
  }

  /** Крок 2 для одного плану: 'opened', 'failed' чи null (пропущено або план уже не scheduled). */
  async function openPlan(row: BotPlanRow, now: Date): Promise<'opened' | 'failed' | null> {
    if (manager.frozen) return null;
    const fail = async (reason: BotPlanReason) => ((await failPlan(row, reason, now)) ? 'failed' : null);
    if (now.getTime() - row.startsAt.getTime() > BOT_PLAN_LATE_MS) return fail('server_down');
    const quiz = row.quizId === null ? null : await getQuiz(db, BOT_USER_ID, row.quizId);
    if (quiz === null || row.quizId === null) return fail('quiz_missing');
    if (!(await bot())) return fail('bot_unavailable');
    const made = openBotGame({ manager, maxRooms }, quiz, row.quizId);
    // Зупинка саме почалася: наступна хвилина (у межах запізнення) або наступний процес.
    if (!made.ok) return made.error === 'restarting' ? null : fail(made.error);
    const { room } = made;
    const claimed = await db.transaction(async (tx) => {
      await lockPlans(tx);
      const [taken] = await tx
        .update(botPlan)
        .set({ status: 'opened', roomId: room.id, roomCode: room.code, openedAt: now, remindedAt: row.remindedAt ?? now, updatedAt: now })
        .where(and(eq(botPlan.id, row.id), eq(botPlan.status, 'scheduled')))
        .returning();
      if (taken === undefined) return null;
      await logAction(tx, { adminId: BOT_USER_ID, kind: 'bot_plan_run', targetUserId: BOT_USER_ID, details: { title: taken.title, code: room.code }, now });
      await successor(tx, taken, now);
      return taken;
    });
    if (claimed === null) {
      // Скасували чи забрав інший прогін у цю мить: кімната не лишається.
      manager.botAct(room.code, 'end');
      return null;
    }
    notify(claimed, room.code);
    return 'opened';
  }

  /** opened → кінцевий стан; failed — у журнал. */
  async function finish(row: BotPlanRow, status: Extract<BotPlanStatus, 'played' | 'nobody' | 'failed'>, now: Date, reason: BotPlanReason | null = null): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [done] = await tx
        .update(botPlan)
        .set({ status, reason, finishedAt: now, updatedAt: now })
        .where(and(eq(botPlan.id, row.id), eq(botPlan.status, 'opened')))
        .returning();
      if (done === undefined) return false;
      if (status === 'failed') await logAction(tx, { adminId: BOT_USER_ID, kind: 'bot_plan_fail', targetUserId: BOT_USER_ID, details: { title: done.title, reason: reason! }, now });
      return true;
    });
  }

  /** Крок 3 для одного відкритого плану; true — дійшов кінцевого стану. */
  async function settlePlan(row: BotPlanRow, now: Date): Promise<boolean> {
    if (manager.frozen) return false;
    const room = row.roomId === null ? undefined : manager.roomById(row.roomId);
    if (room === undefined) {
      // Кімнату ще веде інший процес (розгортання) чи її ще не підхопили з бази: чекаємо.
      if (row.roomId !== null) {
        const [held] = await db.select({ code: liveRoom.code }).from(liveRoom).where(eq(liveRoom.roomId, row.roomId));
        if (held !== undefined) return false;
      }
      return finish(row, 'failed', now, 'room_closed');
    }
    if (room.state.phase !== 'lobby') return finish(row, 'played', now);
    const opened = (row.openedAt ?? now).getTime();
    if (now.getTime() < opened + (row.autoStartMin ?? BOT_PLAN_WAIT_MIN) * MIN) return false;
    const online = room.state.players.filter((p) => (room.connections.get(p.id) ?? 0) > 0).length;
    if (online === 0) {
      manager.botAct(room.code, 'end');
      return finish(row, 'nobody', now);
    }
    if (row.autoStartMin === null) return false; // Почне адмін; лобі, що вичерпало час, закриється саме → room_closed.
    return manager.botAct(room.code, 'start').ok ? finish(row, 'played', now) : finish(row, 'failed', now, 'start_failed');
  }

  async function step<T>(what: string, body: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await body();
    } catch (error) {
      reportError(error, { where: 'bot-schedule', what });
      return fallback;
    }
  }

  async function work(now: Date): Promise<BotTickReport> {
    const report = { reminded: 0, opened: 0, failed: 0, settled: 0 };
    // 1. Нагадати за 15 хв: позначка й вибірка — одним умовним update.
    const reminded = await step(
      'remind',
      () =>
        db
          .update(botPlan)
          .set({ remindedAt: now })
          .where(
            and(
              eq(botPlan.status, 'scheduled'),
              isNull(botPlan.remindedAt),
              gt(botPlan.startsAt, now),
              lte(botPlan.startsAt, new Date(now.getTime() + BOT_PLAN_REMIND_MS)),
            ),
          )
          .returning(),
      [] as BotPlanRow[],
    );
    for (const row of reminded) notify(row, null);
    report.reminded = reminded.length;
    // 2. Відкрити настали.
    const due = await step(
      'pick',
      () =>
        db
          .select()
          .from(botPlan)
          .where(and(eq(botPlan.status, 'scheduled'), lte(botPlan.startsAt, now)))
          .orderBy(asc(botPlan.startsAt), asc(botPlan.id)),
      [] as BotPlanRow[],
    );
    for (const row of due) {
      const outcome = await step('open', () => openPlan(row, now), null);
      if (outcome === 'opened') report.opened += 1;
      if (outcome === 'failed') report.failed += 1;
    }
    // 3. Довести відкриті.
    const open = await step('opened', () => db.select().from(botPlan).where(eq(botPlan.status, 'opened')).orderBy(asc(botPlan.startsAt), asc(botPlan.id)), [] as BotPlanRow[]);
    for (const row of open) {
      if (await step('settle', () => settlePlan(row, now), false)) report.settled += 1;
    }
    return report;
  }

  function tick(now: Date): Promise<BotTickReport> {
    if (running !== null) return Promise.resolve('busy');
    if (manager.frozen) return Promise.resolve('frozen');
    const current = work(now).finally(() => {
      running = null;
    });
    running = current;
    return current;
  }

  function plan(): void {
    if (stopped) return;
    timer = scheduler.setTimeout(() => {
      timer = null;
      cycle();
    }, BOT_PLAN_TICK_MS);
    (timer as { unref?: () => void } | null)?.unref?.();
  }

  function cycle(): void {
    if (stopped) return;
    const current = tick(new Date(scheduler.now())).then(() => {
      cycling = null;
      plan();
    });
    cycling = current;
  }

  return {
    tick,
    start: () => {
      stopped = false;
      if (timer === null && cycling === null) cycle();
    },
    stop() {
      stopped = true;
      if (timer !== null) scheduler.clearTimeout(timer);
      timer = null;
    },
    async idle() {
      for (;;) {
        const waits = [running, cycling, ...inFlight].filter((p): p is Promise<never> => p !== null);
        if (waits.length === 0) return;
        await Promise.allSettled(waits);
      }
    },
  };
}
