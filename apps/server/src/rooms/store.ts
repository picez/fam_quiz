import { and, eq, gt, inArray, isNull, lt, ne, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client';
import { liveRoom } from '../db/schema';
import { markAborted, markInterrupted } from '../recorder';
import { isSavedRoom, type Room, type RoomManager } from './manager';

export const SAVE_DELAY_MS = 1000;
export const HEARTBEAT_MS = 5000;
export const LEASE_MS = 20_000;
export const MAX_AGE_MS = 24 * 60 * 60_000;
const RETRY_MS = 5000;
/** Запис кімнати, більший за це, журналюється як попередження: щось у стані росте без меж. */
export const LARGE_ROOM_BYTES = 1024 * 1024;

export interface RoomStoreOptions {
  instanceId: string;
  /**
   * Годинник для updated_at/heartbeat_at і умов оренди. Типово — годинник бази (now()): старий і новий
   * процеси під час розгортання порівнюють мітки одним годинником. У тестах — годинник FakeScheduler.
   */
  now?: () => number;
  saveDelayMs?: number;
  onError?: (error: unknown) => void;
  onWarning?: (message: string) => void;
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
  private readonly clock: (() => number) | null;
  private readonly saveDelayMs: number;
  private readonly onError: (error: unknown) => void;
  private readonly onWarning: (message: string) => void;
  private readonly entries = new Map<Room, Entry>();
  /** Усе, на що чекає idle(): відкладені записи, записи й видалення в польоті. */
  private readonly pending = new Set<Promise<unknown>>();
  /** Одночасні locate того самого коду зливаються в один. */
  private readonly locating = new Map<string, Promise<Located>>();
  private interval: NodeJS.Timeout | null = null;
  private ticking: Promise<void> | null = null;
  /** Кімнати віддано (SIGTERM) або сховище зупинено: більше нічого не пишемо й не підхоплюємо. */
  private released = false;
  /** Коди рядків, що точно належать нам (записані чи підхоплені): за ними серцебиття помічає втрату оренди. */
  private readonly owned = new Set<string>();
  /** Закриті кімнати (за кодом), рядки яких ще не вдалося видалити: серцебиття тримає їх, щоб їх не підхопили. */
  private readonly closing = new Map<string, Room>();

  constructor(db: Db, manager: RoomManager, options: RoomStoreOptions) {
    this.db = db;
    this.manager = manager;
    this.me = options.instanceId;
    this.clock = options.now ?? null;
    this.saveDelayMs = options.saveDelayMs ?? SAVE_DELAY_MS;
    this.onError = options.onError ?? ((error) => console.error('Не вдалося зберегти кімнату:', error));
    this.onWarning = options.onWarning ?? ((message) => console.warn(message));
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
    await this.heartbeat();
    await this.purge(or(isNull(liveRoom.owner), ne(liveRoom.owner, this.me)));
    await this.adopt();
    await this.reserve();
  }

  /**
   * Серцебиття лише рядків кімнат, які ми справді ведемо (і закритих, що ще видаляються). Кімнату,
   * рядок якої вже не наш, виселяємо одразу, не чекаючи наступного запису.
   */
  private async heartbeat(): Promise<void> {
    const held = [...this.owned].filter((code) => this.manager.get(code) !== undefined);
    const codes = [...held, ...this.closing.keys()];
    if (codes.length === 0) return;
    const rows = await this.db
      .update(liveRoom)
      .set({ heartbeatAt: this.at() })
      .where(and(eq(liveRoom.owner, this.me), inArray(liveRoom.code, codes)))
      .returning({ code: liveRoom.code });
    const kept = new Set(rows.map((row) => row.code));
    for (const code of held) {
      const room = this.manager.get(code);
      // Поки чекали на базу, кімнату могли закрити або вже виселити записом.
      if (kept.has(code) || room === undefined || !this.owned.has(code)) continue;
      this.owned.delete(code);
      this.manager.evict(room);
    }
  }

  /** Мить зі зсувом: параметр за тестовим годинником або вираз над now() бази. */
  private at(offsetMs = 0): SQL | Date {
    if (this.clock !== null) return new Date(this.clock() + offsetMs);
    return sql`(now() + ${String(offsetMs)}::integer * interval '1 millisecond')`;
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
      .where(and(eq(liveRoom.code, code), gt(liveRoom.updatedAt, this.at(-MAX_AGE_MS))));
    return row === undefined ? 'none' : 'restarting';
  }

  /** Записати всі кімнати зараз (release — з owner = null) і дочекатися записів. */
  async flushAll(options: { release?: boolean } = {}): Promise<void> {
    const release = options.release ?? false;
    // Після віддачі нові зміни вже не пишуться: кімнату може вести інший процес.
    if (release) this.released = true;
    for (const entry of this.entries.values()) this.clearTimer(entry);
    // Спершу — рядки закритих кімнат, які ще не вдалося видалити: без серцебиття їх підхопила б
    // наступна версія, і закрита гра встала б знову.
    if (release) await Promise.all([...this.closing.values()].map((room) => this.removeRow(room).catch((error: unknown) => this.onError(error))));
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
    const bytes = Buffer.byteLength(JSON.stringify(saved));
    if (bytes > LARGE_ROOM_BYTES) this.onWarning(`Кімната ${room.code} займає в базі ${Math.round(bytes / 1024)} КБ`);
    const at = this.at();
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
    if (rows.length === 0) {
      this.owned.delete(room.code);
      this.manager.evict(room);
      return;
    }
    if (owner === this.me) this.owned.add(room.code);
    else this.owned.delete(room.code);
  }

  private closed(room: Room): void {
    const entry = this.entry(room);
    this.clearTimer(entry);
    entry.dirty = false;
    this.owned.delete(room.code);
    this.closing.set(room.code, room);
    const remove = (): void => {
      this.removeRow(room).then(
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

  /** Видалити рядок закритої кімнати після записів у польоті: інакше запізнілий запис повернув би його. */
  private async removeRow(room: Room): Promise<void> {
    await this.enqueue(room, async () => {
      // Рядок уже видалено (наприклад, повтором раніше): більше нічого не робити.
      if (this.closing.get(room.code) !== room) return;
      await this.db.delete(liveRoom).where(and(eq(liveRoom.code, room.code), eq(liveRoom.owner, this.me)));
      this.closing.delete(room.code);
    });
  }

  private forget(room: Room): void {
    this.owned.delete(room.code);
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
    const old = lt(liveRoom.updatedAt, this.at(-MAX_AGE_MS));
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
    const free = and(
      or(isNull(liveRoom.owner), lt(liveRoom.heartbeatAt, this.at(-LEASE_MS))),
      gt(liveRoom.updatedAt, this.at(-MAX_AGE_MS)),
    );
    const rows = await this.db
      .update(liveRoom)
      .set({ owner: this.me, heartbeatAt: this.at() })
      .where(where === undefined ? free : and(free, where))
      .returning({ code: liveRoom.code, roomId: liveRoom.roomId, data: liveRoom.data });
    let restored = 0;
    const broken: typeof rows = [];
    const unused: typeof rows = [];
    for (const row of rows) {
      const outcome = this.restoreRow(row.code, row.roomId, row.data);
      if (outcome === 'restored') restored += 1;
      else if (outcome === 'broken') broken.push(row);
      else if (outcome === 'unused') unused.push(row);
    }
    // Узяте, але не підняте (код зайнятий іншою кімнатою, менеджер заморозили, поки чекали на базу) —
    // віддаємо назад, інакше рядок висів би за нами без кімнати.
    if (unused.length > 0) {
      await this.db
        .update(liveRoom)
        .set({ owner: null })
        .where(and(eq(liveRoom.owner, this.me), inArray(liveRoom.code, unused.map((row) => row.code))));
    }
    if (broken.length > 0) {
      await markAborted(
        this.db,
        broken.map((row) => row.roomId),
      );
      await this.db
        .delete(liveRoom)
        .where(and(eq(liveRoom.owner, this.me), inArray(liveRoom.code, broken.map((row) => row.code))));
    }
    return restored;
  }

  /** restored — піднято; ours — ця кімната вже в пам'яті (наша оренда спливала); unused — не піднято; broken — не відновити. */
  private restoreRow(code: string, roomId: string, data: unknown): 'restored' | 'ours' | 'unused' | 'broken' {
    if (!isSavedRoom(data)) {
      this.onError(new Error(`Кімнату ${code} не відновити: інша версія або зламаний запис`));
      return 'broken';
    }
    const live = this.manager.get(code);
    if (live !== undefined) {
      if (live.id !== roomId) return 'unused';
      this.owned.add(code);
      return 'ours';
    }
    try {
      if (this.manager.restore(data) === null) return 'unused';
    } catch (error) {
      // Один зламаний запис не має зупиняти старт сервера.
      this.onError(error);
      return 'broken';
    }
    this.owned.add(code);
    return 'restored';
  }

  /** Коди рядків, яких немає в пам'яті, не видаються новим кімнатам. */
  private async reserve(): Promise<void> {
    const rows = await this.db.select({ code: liveRoom.code }).from(liveRoom);
    this.manager.setReserved(rows.map((row) => row.code).filter((code) => this.manager.get(code) === undefined));
  }
}
