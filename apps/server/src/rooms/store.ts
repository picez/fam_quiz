import { and, eq, gt, isNull, lt, ne, or, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client';
import { liveRoom } from '../db/schema';
import { markAborted, markInterrupted } from '../recorder';
import { isSavedRoom, type Room, type RoomManager } from './manager';

export const SAVE_DELAY_MS = 1000;
export const HEARTBEAT_MS = 5000;
export const LEASE_MS = 20_000;
export const MAX_AGE_MS = 24 * 60 * 60_000;
const RETRY_MS = 5000;

export interface RoomStoreOptions {
  instanceId: string;
  /** Годинник для updated_at/heartbeat_at; типово Date.now (у тестах — годинник FakeScheduler). */
  now?: () => number;
  saveDelayMs?: number;
  onError?: (error: unknown) => void;
}

export type Located = 'here' | 'restarting' | 'none';

/** Стан записів однієї кімнати. */
interface Entry {
  /** Відкладений запис; done знімає очікування idle(), якщо таймер зняли без запису. */
  timer: { handle: NodeJS.Timeout; done: () => void } | null;
  /** Ланцюжок дій з рядком кімнати: записи й видалення йдуть строго по черзі. */
  chain: Promise<void>;
  /** Скільки дій у ланцюжку ще не завершено. */
  busy: number;
  /** Стан змінився під час запису: після нього потрібен ще один. */
  dirty: boolean;
}

/**
 * Зберігає живі кімнати в таблиці live_room (9b), щоб гра пережила перезапуск сервера.
 * Кімнатою володіє рівно один процес: owner + heartbeat_at — оренда на LEASE_MS.
 * Збій бази журналюється й повторюється; на саму гру він не впливає.
 */
export class RoomStore {
  private readonly db: Db;
  private readonly manager: RoomManager;
  private readonly me: string;
  private readonly now: () => number;
  private readonly saveDelayMs: number;
  private readonly onError: (error: unknown) => void;
  private readonly entries = new Map<Room, Entry>();
  /** Усе, на що чекає idle(): відкладені записи, записи й видалення в польоті. */
  private readonly pending = new Set<Promise<unknown>>();
  /** Одночасні locate того самого коду зливаються в один. */
  private readonly locating = new Map<string, Promise<Located>>();
  private interval: NodeJS.Timeout | null = null;
  private ticking: Promise<void> | null = null;
  /** Кімнати віддано (SIGTERM) або сховище зупинено: більше нічого не пишемо й не підхоплюємо. */
  private released = false;

  constructor(db: Db, manager: RoomManager, options: RoomStoreOptions) {
    this.db = db;
    this.manager = manager;
    this.me = options.instanceId;
    this.now = options.now ?? Date.now;
    this.saveDelayMs = options.saveDelayMs ?? SAVE_DELAY_MS;
    this.onError = options.onError ?? ((error) => console.error('Не вдалося зберегти кімнату:', error));
    manager.onEvent((room, event) => {
      if (event.type === 'changed') this.schedule(room);
      else if (event.type === 'closed') this.closed(room);
      else if (event.type === 'moved') this.forget(room);
    });
  }

  /** Старт процесу: чистка застарілих, перервані ігри (крім кімнат з бази), підйом вільних рядків. Повертає кількість піднятих. */
  async boot(): Promise<number> {
    await this.purge();
    const kept = await this.db.select({ roomId: liveRoom.roomId }).from(liveRoom);
    await markInterrupted(
      this.db,
      kept.map((row) => row.roomId),
    );
    const adopted = await this.adopt();
    await this.reserve();
    return adopted;
  }

  /** Періодична робота: серцебиття своїх рядків, підхоплення вільних і покинутих, чистка, зарезервовані коди. */
  async tick(): Promise<void> {
    // Повільна база не накладає один tick на інший.
    if (this.ticking !== null) return this.ticking;
    this.ticking = this.work().finally(() => {
      this.ticking = null;
    });
    return this.ticking;
  }

  private async work(): Promise<void> {
    if (this.released) return;
    const at = new Date(this.now());
    await this.db.update(liveRoom).set({ heartbeatAt: at }).where(eq(liveRoom.owner, this.me));
    await this.purge(or(isNull(liveRoom.owner), ne(liveRoom.owner, this.me)));
    await this.adopt();
    await this.reserve();
  }

  /** Запускає tick кожні HEARTBEAT_MS (setInterval з unref). */
  start(): void {
    if (this.interval !== null) return;
    this.interval = setInterval(() => {
      this.tick().catch(this.onError);
    }, HEARTBEAT_MS);
    this.interval.unref();
  }

  stop(): void {
    if (this.interval !== null) clearInterval(this.interval);
    this.interval = null;
    this.released = true;
    for (const entry of this.entries.values()) this.clearTimer(entry);
  }

  /** Кімната є в пам'яті, або її вдалося підхопити з бази → 'here'; рядок живого іншого процесу → 'restarting'; рядка немає → 'none'. */
  locate(code: string): Promise<Located> {
    if (this.manager.get(code) !== undefined) return Promise.resolve('here');
    const running = this.locating.get(code);
    if (running !== undefined) return running;
    const job = this.find(code).finally(() => this.locating.delete(code));
    this.locating.set(code, job);
    return job;
  }

  private async find(code: string): Promise<Located> {
    await this.adopt(eq(liveRoom.code, code));
    if (this.manager.get(code) !== undefined) return 'here';
    const [row] = await this.db
      .select({ code: liveRoom.code })
      .from(liveRoom)
      .where(and(eq(liveRoom.code, code), gt(liveRoom.updatedAt, new Date(this.now() - MAX_AGE_MS))));
    return row === undefined ? 'none' : 'restarting';
  }

  /** Записати всі кімнати зараз (release — з owner = null) і дочекатися записів. */
  async flushAll(options: { release?: boolean } = {}): Promise<void> {
    const release = options.release ?? false;
    // Після віддачі нові зміни вже не пишуться: кімнату може вести інший процес.
    if (release) this.released = true;
    for (const entry of this.entries.values()) this.clearTimer(entry);
    const owner = release ? null : this.me;
    await Promise.all(
      this.manager.rooms().map((room) =>
        this.enqueue(room, () => this.write(room, owner)).catch((error: unknown) => this.onError(error)),
      ),
    );
  }

  /** Завершується, коли всі поставлені записи виконано (для тестів). */
  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }

  private entry(room: Room): Entry {
    let entry = this.entries.get(room);
    if (entry === undefined) {
      entry = { timer: null, chain: Promise.resolve(), busy: 0, dirty: false };
      this.entries.set(room, entry);
    }
    return entry;
  }

  private alive(room: Room): boolean {
    return this.manager.get(room.code) === room;
  }

  /** Відкладений запис: перша зміна відкриває вікно saveDelayMs, наступні в ньому зливаються. */
  private schedule(room: Room): void {
    if (this.released || !this.alive(room)) return;
    const entry = this.entry(room);
    if (entry.timer !== null) return;
    if (entry.busy > 0) {
      entry.dirty = true;
      return;
    }
    let done = () => {};
    this.track(new Promise<void>((resolve) => (done = resolve)));
    const handle = setTimeout(() => {
      entry.timer = null;
      this.save(room).finally(done);
    }, this.saveDelayMs);
    handle.unref();
    entry.timer = { handle, done };
  }

  /** Запис зі збереженням стану на мить запису; збій — журнал і повтор через RETRY_MS. */
  private async save(room: Room): Promise<void> {
    try {
      await this.enqueue(room, () => this.write(room, this.me));
    } catch (error) {
      this.onError(error);
      setTimeout(() => this.schedule(room), RETRY_MS).unref();
    }
  }

  /** Дія з рядком кімнати після всіх попередніх. */
  private enqueue(room: Room, job: () => Promise<void>): Promise<void> {
    const entry = this.entry(room);
    entry.busy += 1;
    const run = entry.chain.then(job).finally(() => {
      entry.busy -= 1;
      // Зміни, що прийшли під час запису (зокрема flushAll), пишуться окремим записом після нього.
      if (entry.busy === 0 && entry.dirty) {
        entry.dirty = false;
        this.schedule(room);
      }
    });
    entry.chain = run.catch(() => {});
    this.track(entry.chain);
    return run;
  }

  private track(promise: Promise<unknown>): void {
    const settled = promise.then(
      () => {},
      () => {},
    );
    this.pending.add(settled);
    void settled.then(() => this.pending.delete(settled));
  }

  private async write(room: Room, owner: string | null): Promise<void> {
    // Кімнату тим часом закрили або виселили — писати нічого.
    if (!this.alive(room)) return;
    const saved = this.manager.snapshot(room);
    const at = new Date(this.now());
    const rows = await this.db
      .insert(liveRoom)
      .values({ code: room.code, roomId: room.id, data: saved, owner, heartbeatAt: at, updatedAt: at })
      .onConflictDoUpdate({
        target: liveRoom.code,
        set: { data: saved, owner, heartbeatAt: at, updatedAt: at },
        setWhere: eq(liveRoom.owner, this.me),
      })
      .returning({ code: liveRoom.code });
    // Кімнату веде інший процес (ми зависли довше за оренду): прибрати з пам'яті, сокети перепідключаться.
    if (rows.length === 0) this.manager.evict(room);
  }

  private closed(room: Room): void {
    const entry = this.entry(room);
    this.clearTimer(entry);
    entry.dirty = false;
    const remove = (): void => {
      // Після записів у польоті: інакше запізнілий запис повернув би рядок закритої кімнати.
      this.enqueue(room, async () => {
        await this.db.delete(liveRoom).where(and(eq(liveRoom.code, room.code), eq(liveRoom.owner, this.me)));
      }).then(
        () => {
          if (entry.busy === 0 && this.entries.get(room) === entry) this.entries.delete(room);
        },
        (error: unknown) => {
          this.onError(error);
          // Інакше наш рядок висів би з серцебиттям і після перезапуску кімната встала б знову.
          if (!this.released) setTimeout(remove, RETRY_MS).unref();
        },
      );
    };
    remove();
  }

  private forget(room: Room): void {
    const entry = this.entries.get(room);
    if (entry === undefined) return;
    this.clearTimer(entry);
    entry.dirty = false;
    this.entries.delete(room);
  }

  private clearTimer(entry: Entry): void {
    if (entry.timer === null) return;
    clearTimeout(entry.timer.handle);
    entry.timer.done();
    entry.timer = null;
  }

  /** Видалити рядки, не змінені понад добу (where — додаткова умова), і перервати їхні ігри. */
  private async purge(where?: SQL): Promise<void> {
    const old = lt(liveRoom.updatedAt, new Date(this.now() - MAX_AGE_MS));
    const dropped = await this.db
      .delete(liveRoom)
      .where(where === undefined ? old : and(old, where))
      .returning({ roomId: liveRoom.roomId });
    await markAborted(
      this.db,
      dropped.map((row) => row.roomId),
    );
  }

  /** Атомарно забрати вільні (віддані чи покинуті) рядки й підняти їхні кімнати. Повертає кількість піднятих. */
  private async adopt(where?: SQL): Promise<number> {
    if (this.released || this.manager.frozen) return 0;
    const now = this.now();
    const free = and(
      or(isNull(liveRoom.owner), lt(liveRoom.heartbeatAt, new Date(now - LEASE_MS))),
      gt(liveRoom.updatedAt, new Date(now - MAX_AGE_MS)),
    );
    const rows = await this.db
      .update(liveRoom)
      .set({ owner: this.me, heartbeatAt: new Date(now) })
      .where(where === undefined ? free : and(free, where))
      .returning({ code: liveRoom.code, roomId: liveRoom.roomId, data: liveRoom.data });
    let restored = 0;
    const broken: typeof rows = [];
    for (const row of rows) {
      if (!isSavedRoom(row.data)) {
        broken.push(row);
        continue;
      }
      if (this.manager.restore(row.data) !== null) restored += 1;
    }
    if (broken.length > 0) {
      for (const row of broken) this.onError(new Error(`Кімнату ${row.code} не відновити: інша версія або зламаний запис`));
      await markAborted(
        this.db,
        broken.map((row) => row.roomId),
      );
      for (const row of broken) {
        await this.db.delete(liveRoom).where(and(eq(liveRoom.code, row.code), eq(liveRoom.owner, this.me)));
      }
    }
    return restored;
  }

  /** Коди рядків, яких немає в пам'яті, не видаються новим кімнатам. */
  private async reserve(): Promise<void> {
    const rows = await this.db.select({ code: liveRoom.code }).from(liveRoom);
    this.manager.setReserved(rows.map((row) => row.code).filter((code) => this.manager.get(code) === undefined));
  }
}
