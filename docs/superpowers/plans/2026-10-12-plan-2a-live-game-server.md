# План 2а: сервер живої гри — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сервер, на якому ведучий створює кімнату з вікторини, гравці входять за кодом, а гра проходить наживо через WebSocket із серверними таймерами й перепідключенням.

**Architecture:** `apps/server` на Fastify + Socket.IO. `RoomManager` тримає кімнати в пам'яті, застосовує до стану чисті функції `@quiz/engine`, керує таймерами через інтерфейс `Scheduler` (у тестах підмінюється ручним годинником) і сповіщає слухачів про зміни. HTTP створює кімнату й впускає гравців; сокет-шлюз автентифікує з'єднання за токеном ролі й розсилає кожному його зріз стану.

**Tech Stack:** Node.js 22+, Fastify 5, Socket.IO 4, zod, tsx, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-quiz-live-core-design.md`

## Місце в дорожній карті

План 2 поділено на дві частини. **2а** (цей документ): жива гра без бази й акаунтів; вікторина передається в запиті на створення кімнати, ведучого впізнають за токеном кімнати. **2б**: PostgreSQL + Drizzle, Better Auth, CRUD вікторин, зображення, збереження результатів, історія; токен ведучого замінюється сесією.

## Global Constraints

- Пакет `@quiz/server` в `apps/server`, ESM, запускається через `tsx`.
- Уся ігрова логіка лише через функції `@quiz/engine`; сервер не рахує бали й не міняє етапи самостійно.
- `RoomManager` не звертається до `Date.now()` і глобальних таймерів напряму, тільки через `Scheduler`.
- Правильна відповідь потрапляє до клієнта лише через зрізи `stageView`, `playerView`, `hostView`.
- Кожне вхідне повідомлення сокета й тіло запиту перевіряється схемою zod; помилка повертається кодом, сервер не падає.
- Код гри: шість цифр, унікальний серед активних кімнат.
- Ведучий відсутній 10 хвилин під час гри: гра завершується. Лобі без старту 2 години: кімната закривається. Завершена кімната живе ще 30 хвилин.
- Без класових «parameter properties» та `enum` (сумісність із запуском TypeScript без компіляції).

## Відхилення від специфікації (свідомі)

- Гравець входить у гру HTTP-запитом, а не подією сокета `player:join`: так простіше обмежувати частоту спроб, а сокет відкривається вже з готовим токеном.
- Гравець після входу вважається відключеним, доки не відкриє сокет.
- Після повернення ведучого гра лишається на паузі, доки він сам не натисне «продовжити».

## Review Focus

1. Гравець відкрив гру у двох вкладках і закрив одну: він лишається підключеним. Тест у завданні 2.
2. Клієнт надсилає подію без функції підтвердження або зі сміттям замість даних: сервер не падає й далі відповідає. Тест у завданні 4.
3. Зв'язок ведучого зник посеред запитання: таймер зупиняється із збереженням залишку часу, а не спливає без нього. Тест у завданні 2.
4. Дія приходить для кімнати, яку щойно закрито: повертається `game_not_found`, таймери не відновлюються. Тест у завданні 2.
5. Тіло запиту не є коректним JSON або нікнейм складається з пробілів: відповідь 4xx із кодом помилки, а не 500. Тест у завданні 3.

---

## Структура файлів

```
packages/shared/src/events.ts        контракт подій сокета, схеми вхідних даних
packages/engine/package.json         додається експорт "./testing"
apps/server/
  package.json, tsconfig.json
  src/app.ts                         buildApp(): Fastify + маршрути + сокети
  src/main.ts                        точка входу
  src/socket.ts                      сокет-шлюз
  src/rooms/scheduler.ts             Scheduler, realScheduler
  src/rooms/manager.ts               Room, RoomManager
  src/testing/fake-scheduler.ts      ручний годинник для тестів
  src/app.test.ts                    HTTP
  src/rooms/manager.test.ts
  src/socket.test.ts                 наскрізна гра через справжні сокети
```

---

### Task 1: Контракт подій і каркас сервера

**Files:**
- Create: `packages/shared/src/events.ts`
- Modify: `packages/shared/src/index.ts`, `package.json` (скрипт `typecheck`)
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/src/app.ts`
- Test: `apps/server/src/app.test.ts`

**Interfaces:**
- Consumes: `Answer`, `ErrorCode`, `GameView` з `@quiz/shared`.
- Produces:
  - `type Role = 'host' | 'stage' | 'player'`
  - `type ServerErrorCode = 'unauthorized' | 'forbidden' | 'invalid_payload' | 'game_not_found'`
  - `type AckResult = { ok: true } | { ok: false; error: ErrorCode | ServerErrorCode }`, `type Ack = (result: AckResult) => void`
  - `type CloseReason = 'kicked' | 'expired'`
  - `interface ClientToServerEvents`, `interface ServerToClientEvents`
  - схеми `socketAuthSchema`, `overrideSchema`, `kickSchema`, `joinSchema`; тип `SocketAuth`
  - `buildApp(): Promise<{ app: FastifyInstance }>` з маршрутом `GET /health`

- [ ] **Step 1: Додати контракт подій**

`packages/shared/src/events.ts`:

```ts
import { z } from 'zod';
import type { Answer } from './answer';
import type { ErrorCode } from './game';
import type { GameView } from './views';

export type Role = 'host' | 'stage' | 'player';

export type ServerErrorCode = 'unauthorized' | 'forbidden' | 'invalid_payload' | 'game_not_found';

export type AckResult = { ok: true } | { ok: false; error: ErrorCode | ServerErrorCode };
export type Ack = (result: AckResult) => void;

export type CloseReason = 'kicked' | 'expired';

export const socketAuthSchema = z.object({
  code: z.string().min(1).max(16),
  role: z.enum(['host', 'stage', 'player']),
  token: z.string().min(1).max(128),
});
export type SocketAuth = z.infer<typeof socketAuthSchema>;

const playerId = z.string().min(1).max(64);
export const overrideSchema = z.object({ playerId, accepted: z.boolean() });
export const kickSchema = z.object({ playerId });
export const joinSchema = z.object({ nickname: z.string().max(100) });

export interface ClientToServerEvents {
  'player:answer': (answer: Answer, ack: Ack) => void;
  'host:start': (ack: Ack) => void;
  'host:lock': (ack: Ack) => void;
  'host:next': (ack: Ack) => void;
  'host:pause': (ack: Ack) => void;
  'host:resume': (ack: Ack) => void;
  'host:end': (ack: Ack) => void;
  'host:override': (payload: z.infer<typeof overrideSchema>, ack: Ack) => void;
  'host:kick': (payload: z.infer<typeof kickSchema>, ack: Ack) => void;
}

export interface ServerToClientEvents {
  /** Повний зріз стану для ролі цього з'єднання та поточний час сервера. */
  state: (view: GameView, serverNow: number) => void;
  closed: (reason: CloseReason) => void;
}
```

`packages/shared/src/index.ts` (повний вміст):

```ts
export * from './quiz';
export * from './answer';
export * from './standing';
export * from './game';
export * from './views';
export * from './events';
```

- [ ] **Step 2: Створити пакет сервера**

`apps/server/package.json`:

```json
{
  "name": "@quiz/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "start": "tsx src/main.ts"
  }
}
```

`apps/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src"]
}
```

У кореневому `package.json` замінити скрипт `typecheck`:

```json
    "typecheck": "tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server"
```

Run:

```bash
pnpm --filter @quiz/server add fastify @fastify/rate-limit socket.io tsx
pnpm --filter @quiz/server add @quiz/shared @quiz/engine --workspace
pnpm --filter @quiz/server add -D socket.io-client @types/node
```

Expected: залежності встановлено без помилок.

- [ ] **Step 3: Написати тест, що падає**

`apps/server/src/app.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';

let ctx: Awaited<ReturnType<typeof buildApp>>;

beforeEach(async () => {
  ctx = await buildApp();
});

afterEach(async () => {
  await ctx.app.close();
});

describe('GET /health', () => {
  it('reports that the server is up', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 4: Переконатися, що тест падає**

Run: `pnpm vitest run apps/server`
Expected: FAIL, бо `./app` не існує.

- [ ] **Step 5: Написати реалізацію**

`apps/server/src/app.ts`:

```ts
import Fastify from 'fastify';

export async function buildApp() {
  const app = Fastify();

  app.get('/health', async () => ({ ok: true }));

  return { app };
}
```

- [ ] **Step 6: Переконатися, що тести проходять**

Run: `pnpm test`
Expected: PASS, 103 тести.

Run: `pnpm typecheck`
Expected: без помилок.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml packages/shared apps/server
git commit -m "feat(server): scaffold server package and socket event contract"
```

---

### Task 2: Менеджер кімнат

**Files:**
- Modify: `packages/engine/package.json` (експорт `./testing`)
- Create: `apps/server/src/rooms/scheduler.ts`, `apps/server/src/rooms/manager.ts`
- Create: `apps/server/src/testing/fake-scheduler.ts`
- Test: `apps/server/src/rooms/manager.test.ts`

**Interfaces:**
- Consumes: з `@quiz/engine`: `createGame`, `addPlayer`, `removePlayer`, `setConnected`, `start`, `submitAnswer`, `lock`, `tick`, `next`, `pause`, `resume`, `override`, `end`, `stageView`, `playerView`, `hostView`, типи `GameState`, `Result`; з `@quiz/shared`: `Quiz`, `Answer`, `AckResult`, `GameView`, `Role`, `ErrorCode`.
- Produces:
  - `interface Scheduler { now(): number; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(handle: unknown): void }`, `realScheduler`
  - `class FakeScheduler implements Scheduler` з методом `advance(ms: number): void`
  - `interface Identity { role: Role; playerId: string | null }`
  - `interface Room { id; code; hostToken; stageToken; state: GameState; … }`
  - `type RoomEvent = { type: 'changed' } | { type: 'kicked'; playerId: string } | { type: 'closed' }`
  - `type HostAction = { type: 'start' | 'lock' | 'next' | 'pause' | 'resume' | 'end' } | { type: 'override'; playerId: string; accepted: boolean } | { type: 'kick'; playerId: string }`
  - `type JoinResult = { ok: true; token: string; playerId: string } | { ok: false; error: ErrorCode | 'game_not_found' }`
  - `class RoomManager` з методами `constructor(scheduler, rng?)`, `now()`, `onEvent(listener): () => void`, `create(quiz): Room`, `get(code): Room | undefined`, `join(code, nickname): JoinResult`, `identify(code, role, token): { room: Room; identity: Identity } | null`, `connect(room, identity): void`, `disconnect(room, identity): void`, `view(room, identity): GameView | null`, `answer(room, playerId, answer): AckResult`, `host(room, action): AckResult`
  - константи `HOST_ABSENCE_MS`, `LOBBY_TTL_MS`, `FINISHED_TTL_MS`

- [ ] **Step 1: Відкрити тестові фікстури рушія**

`packages/engine/package.json` (повний вміст):

```json
{
  "name": "@quiz/engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./testing": "./src/testing/fixtures.ts"
  },
  "dependencies": {
    "@quiz/shared": "workspace:*"
  }
}
```

- [ ] **Step 2: Додати планувальник і ручний годинник**

`apps/server/src/rooms/scheduler.ts`:

```ts
export interface Scheduler {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realScheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};
```

`apps/server/src/testing/fake-scheduler.ts`:

```ts
import type { Scheduler } from '../rooms/scheduler';

/** Годинник, який рухається лише через advance(); таймери спрацьовують у порядку часу. */
export class FakeScheduler implements Scheduler {
  private time = 1_000_000;
  private sequence = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();

  now(): number {
    return this.time;
  }

  setTimeout(fn: () => void, ms: number): unknown {
    this.sequence += 1;
    this.timers.set(this.sequence, { at: this.time + Math.max(0, ms), fn });
    return this.sequence;
  }

  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (due === undefined) break;
      this.timers.delete(due[0]);
      this.time = due[1].at;
      due[1].fn();
    }
    this.time = target;
  }
}
```

- [ ] **Step 3: Написати тест, що падає**

`apps/server/src/rooms/manager.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import { FakeScheduler } from '../testing/fake-scheduler';
import {
  FINISHED_TTL_MS,
  HOST_ABSENCE_MS,
  LOBBY_TTL_MS,
  RoomManager,
  type Identity,
  type Room,
  type RoomEvent,
} from './manager';

const HOST: Identity = { role: 'host', playerId: null };
const correct = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;

function setup() {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(makeQuiz([single, text]));
  const events: RoomEvent[] = [];
  manager.onEvent((_room, event) => events.push(event));
  return { scheduler, manager, room, events };
}

/** Гравець, що увійшов і відкрив одне з'єднання. */
function enter(manager: RoomManager, room: Room, nickname: string) {
  const joined = manager.join(room.code, nickname);
  if (!joined.ok) throw new Error(joined.error);
  const identity: Identity = { role: 'player', playerId: joined.playerId };
  manager.connect(room, identity);
  return { ...joined, identity };
}

/** Кімната з ведучим і двома гравцями на першому запитанні. */
function playing() {
  const ctx = setup();
  ctx.manager.connect(ctx.room, HOST);
  const olena = enter(ctx.manager, ctx.room, 'Олена');
  const taras = enter(ctx.manager, ctx.room, 'Тарас');
  expect(ctx.manager.host(ctx.room, { type: 'start' })).toEqual({ ok: true });
  return { ...ctx, olena, taras };
}

describe('rooms', () => {
  it('creates a room with a six-digit code and separate tokens', () => {
    const { manager, room } = setup();
    expect(room.code).toMatch(/^\d{6}$/);
    expect(room.hostToken).not.toBe(room.stageToken);
    expect(manager.get(room.code)).toBe(room);
    expect(room.state.phase).toBe('lobby');
  });

  it('gives every room its own code', () => {
    const { manager } = setup();
    const codes = Array.from({ length: 50 }, () => manager.create(makeQuiz([single])).code);
    expect(new Set(codes).size).toBe(50);
  });

  it('identifies host, stage and player by their tokens', () => {
    const { manager, room } = setup();
    const joined = manager.join(room.code, 'Олена');
    if (!joined.ok) throw new Error(joined.error);

    expect(manager.identify(room.code, 'host', room.hostToken)?.identity).toEqual(HOST);
    expect(manager.identify(room.code, 'stage', room.stageToken)?.identity).toEqual({ role: 'stage', playerId: null });
    expect(manager.identify(room.code, 'player', joined.token)?.identity).toEqual({
      role: 'player',
      playerId: joined.playerId,
    });
  });

  it('rejects a wrong token, a token of another role and an unknown code', () => {
    const { manager, room } = setup();
    expect(manager.identify(room.code, 'host', 'nope')).toBeNull();
    expect(manager.identify(room.code, 'host', room.stageToken)).toBeNull();
    expect(manager.identify(room.code, 'player', room.hostToken)).toBeNull();
    expect(manager.identify('000000x', 'host', room.hostToken)).toBeNull();
  });
});

describe('joining', () => {
  it('reports an unknown code and a taken nickname', () => {
    const { manager, room } = setup();
    expect(manager.join('nope', 'Олена')).toEqual({ ok: false, error: 'game_not_found' });
    manager.join(room.code, 'Олена');
    expect(manager.join(room.code, ' олена ')).toEqual({ ok: false, error: 'nickname_taken' });
  });

  it('keeps a player disconnected until a connection opens', () => {
    const { manager, room } = setup();
    const joined = manager.join(room.code, 'Олена');
    if (!joined.ok) throw new Error(joined.error);
    expect(room.state.players[0].connected).toBe(false);

    manager.connect(room, { role: 'player', playerId: joined.playerId });
    expect(room.state.players[0].connected).toBe(true);
  });

  it('keeps a player connected while any of their tabs is open', () => {
    const { manager, room } = setup();
    const { identity } = enter(manager, room, 'Олена');
    manager.connect(room, identity);

    manager.disconnect(room, identity);
    expect(room.state.players[0].connected).toBe(true);

    manager.disconnect(room, identity);
    expect(room.state.players[0].connected).toBe(false);
  });
});

describe('views', () => {
  it('builds the view that matches the identity', () => {
    const { manager, room } = setup();
    const { identity } = enter(manager, room, 'Олена');
    expect(manager.view(room, HOST)?.role).toBe('host');
    expect(manager.view(room, { role: 'stage', playerId: null })?.role).toBe('stage');
    expect(manager.view(room, identity)?.role).toBe('player');
    expect(manager.view(room, { role: 'player', playerId: 'ghost' })).toBeNull();
  });
});

describe('playing', () => {
  it('starts the game and notifies listeners', () => {
    const { room, events } = playing();
    expect(room.state.phase).toBe('question');
    expect(events.at(-1)).toEqual({ type: 'changed' });
  });

  it('passes engine errors through', () => {
    const { manager, room } = playing();
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('locks the question when both players have answered', () => {
    const { manager, room, scheduler, olena, taras } = playing();
    scheduler.advance(10_000);
    expect(manager.answer(room, olena.playerId, correct)).toEqual({ ok: true });
    expect(manager.answer(room, taras.playerId, wrong)).toEqual({ ok: true });
    expect(room.state.phase).toBe('locked');
    expect(room.state.players.map((p) => p.score)).toEqual([750, 0]);
  });

  it('locks the question when the time runs out', () => {
    const { room, scheduler } = playing();
    scheduler.advance(19_999);
    expect(room.state.phase).toBe('question');
    scheduler.advance(1);
    expect(room.state.phase).toBe('locked');
  });

  it('stops the timer on pause and continues with the same remaining time', () => {
    const { manager, room, scheduler } = playing();
    scheduler.advance(5000);
    manager.host(room, { type: 'pause' });
    scheduler.advance(60_000);
    expect(room.state.phase).toBe('question');

    manager.host(room, { type: 'resume' });
    scheduler.advance(14_999);
    expect(room.state.phase).toBe('question');
    scheduler.advance(1);
    expect(room.state.phase).toBe('locked');
  });

  it('lets the host accept a rejected answer on reveal', () => {
    const { manager, room, olena, taras } = playing();
    manager.answer(room, olena.playerId, correct);
    manager.answer(room, taras.playerId, wrong);
    manager.host(room, { type: 'next' });
    expect(manager.host(room, { type: 'override', playerId: taras.playerId, accepted: true })).toEqual({ ok: true });
    expect(room.state.players[1].score).toBe(1000);
  });
});

describe('host absence', () => {
  it('pauses the game with the remaining time when the host connection drops', () => {
    const { manager, room, scheduler } = playing();
    scheduler.advance(5000);
    manager.disconnect(room, HOST);
    expect(room.state.paused).toBe(true);
    expect(room.state.remainingMs).toBe(15_000);

    scheduler.advance(60_000);
    expect(room.state.phase).toBe('question');
  });

  it('ends the game after ten minutes without the host', () => {
    const { manager, room, scheduler } = playing();
    manager.disconnect(room, HOST);
    scheduler.advance(HOST_ABSENCE_MS - 1);
    expect(room.state.phase).toBe('question');
    scheduler.advance(1);
    expect(room.state.phase).toBe('finished');
  });

  it('keeps the game paused and alive when the host returns in time', () => {
    const { manager, room, scheduler } = playing();
    manager.disconnect(room, HOST);
    scheduler.advance(60_000);
    manager.connect(room, HOST);
    scheduler.advance(HOST_ABSENCE_MS);
    expect(room.state.phase).toBe('question');
    expect(room.state.paused).toBe(true);
    expect(manager.host(room, { type: 'resume' })).toEqual({ ok: true });
  });

  it('does not pause while the host still has another connection', () => {
    const { manager, room } = playing();
    manager.connect(room, HOST);
    manager.disconnect(room, HOST);
    expect(room.state.paused).toBe(false);
  });

  it('does not pause a lobby', () => {
    const { manager, room } = setup();
    manager.connect(room, HOST);
    manager.disconnect(room, HOST);
    expect(room.state.paused).toBe(false);
  });
});

describe('kicking', () => {
  it('removes the player, revokes the token and announces it', () => {
    const { manager, room, events, olena } = playing();
    expect(manager.host(room, { type: 'kick', playerId: olena.playerId })).toEqual({ ok: true });
    expect(room.state.players.map((p) => p.nickname)).toEqual(['Тарас']);
    expect(manager.identify(room.code, 'player', olena.token)).toBeNull();
    expect(events).toContainEqual({ type: 'kicked', playerId: olena.playerId });
  });

  it('ignores the late disconnect of a kicked player', () => {
    const { manager, room, olena } = playing();
    manager.host(room, { type: 'kick', playerId: olena.playerId });
    expect(() => manager.disconnect(room, olena.identity)).not.toThrow();
  });

  it('is refused once the game has finished', () => {
    const { manager, room, olena } = playing();
    manager.host(room, { type: 'end' });
    expect(manager.host(room, { type: 'kick', playerId: olena.playerId })).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('expiry', () => {
  it('closes a lobby that was not started within two hours', () => {
    const { manager, room, scheduler, events } = setup();
    scheduler.advance(LOBBY_TTL_MS - 1);
    expect(manager.get(room.code)).toBe(room);
    scheduler.advance(1);
    expect(manager.get(room.code)).toBeUndefined();
    expect(events.at(-1)).toEqual({ type: 'closed' });
  });

  it('does not close a game that is running', () => {
    const { manager, room, scheduler } = playing();
    manager.host(room, { type: 'pause' });
    scheduler.advance(LOBBY_TTL_MS * 2);
    expect(manager.get(room.code)).toBe(room);
  });

  it('closes a finished room after thirty minutes', () => {
    const { manager, room, scheduler } = playing();
    manager.host(room, { type: 'end' });
    scheduler.advance(FINISHED_TTL_MS - 1);
    expect(manager.get(room.code)).toBe(room);
    scheduler.advance(1);
    expect(manager.get(room.code)).toBeUndefined();
  });

  it('refuses actions on a closed room and does not revive its timers', () => {
    const { manager, room, scheduler, olena } = playing();
    manager.host(room, { type: 'end' });
    scheduler.advance(FINISHED_TTL_MS);
    const phase = room.state.phase;

    expect(manager.host(room, { type: 'start' })).toEqual({ ok: false, error: 'game_not_found' });
    expect(manager.answer(room, olena.playerId, correct)).toEqual({ ok: false, error: 'game_not_found' });
    manager.disconnect(room, HOST);
    scheduler.advance(HOST_ABSENCE_MS * 2);
    expect(room.state.phase).toBe(phase);
    expect(room.state.paused).toBe(false);
  });
});
```

- [ ] **Step 4: Переконатися, що тест падає**

Run: `pnpm vitest run apps/server/src/rooms`
Expected: FAIL, бо `./manager` не існує.

- [ ] **Step 5: Написати реалізацію**

`apps/server/src/rooms/manager.ts`:

```ts
import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  addPlayer,
  createGame,
  end,
  hostView,
  lock,
  next,
  override,
  pause,
  playerView,
  removePlayer,
  resume,
  setConnected,
  stageView,
  start,
  submitAnswer,
  tick,
  type GameState,
  type Result,
} from '@quiz/engine';
import type { AckResult, Answer, ErrorCode, GameView, Phase, Quiz, Role } from '@quiz/shared';
import type { Scheduler } from './scheduler';

export const HOST_ABSENCE_MS = 10 * 60_000;
export const LOBBY_TTL_MS = 2 * 60 * 60_000;
export const FINISHED_TTL_MS = 30 * 60_000;

export interface Identity {
  role: Role;
  playerId: string | null;
}

export interface Room {
  id: string;
  code: string;
  hostToken: string;
  stageToken: string;
  state: GameState;
  /** Токен гравця → id гравця. */
  playerTokens: Map<string, string>;
  /** Кількість відкритих з'єднань: ключ 'host', 'stage' або id гравця. */
  connections: Map<string, number>;
  deadline: unknown;
  absence: unknown;
  expiry: unknown;
  expiryPhase: Phase | null;
}

export type RoomEvent = { type: 'changed' } | { type: 'kicked'; playerId: string } | { type: 'closed' };
export type RoomListener = (room: Room, event: RoomEvent) => void;

export type HostAction =
  | { type: 'start' | 'lock' | 'next' | 'pause' | 'resume' | 'end' }
  | { type: 'override'; playerId: string; accepted: boolean }
  | { type: 'kick'; playerId: string };

export type JoinResult =
  | { ok: true; token: string; playerId: string }
  | { ok: false; error: ErrorCode | 'game_not_found' };

const GONE: AckResult = { ok: false, error: 'game_not_found' };

const newToken = () => randomBytes(24).toString('base64url');

function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class RoomManager {
  private readonly scheduler: Scheduler;
  private readonly rng: () => number;
  private readonly rooms = new Map<string, Room>();
  private readonly listeners = new Set<RoomListener>();

  constructor(scheduler: Scheduler, rng: () => number = Math.random) {
    this.scheduler = scheduler;
    this.rng = rng;
  }

  now(): number {
    return this.scheduler.now();
  }

  onEvent(listener: RoomListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  create(quiz: Quiz): Room {
    const room: Room = {
      id: randomUUID(),
      code: this.newCode(),
      hostToken: newToken(),
      stageToken: newToken(),
      state: createGame(quiz),
      playerTokens: new Map(),
      connections: new Map(),
      deadline: null,
      absence: null,
      expiry: null,
      expiryPhase: null,
    };
    this.rooms.set(room.code, room);
    this.reschedule(room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  join(code: string, nickname: string): JoinResult {
    const room = this.rooms.get(code);
    if (room === undefined) return { ok: false, error: 'game_not_found' };
    const playerId = randomUUID();
    const added = addPlayer(room.state, { id: playerId, nickname });
    if (!added.ok) return added;
    // Гравець стає підключеним, коли відкриє сокет.
    const offline = setConnected(added.state, playerId, false);
    if (!offline.ok) return offline;
    const token = newToken();
    room.playerTokens.set(token, playerId);
    this.commit(room, offline.state);
    return { ok: true, token, playerId };
  }

  identify(code: string, role: Role, token: string): { room: Room; identity: Identity } | null {
    const room = this.rooms.get(code);
    if (room === undefined) return null;
    if (role === 'host' || role === 'stage') {
      const expected = role === 'host' ? room.hostToken : room.stageToken;
      return sameToken(token, expected) ? { room, identity: { role, playerId: null } } : null;
    }
    const playerId = room.playerTokens.get(token);
    return playerId === undefined ? null : { room, identity: { role, playerId } };
  }

  connect(room: Room, identity: Identity): void {
    if (!this.alive(room)) return;
    const key = identity.playerId ?? identity.role;
    const count = (room.connections.get(key) ?? 0) + 1;
    room.connections.set(key, count);
    if (identity.role === 'host') {
      this.scheduler.clearTimeout(room.absence);
      room.absence = null;
    }
    if (identity.playerId !== null && count === 1) {
      this.apply(room, setConnected(room.state, identity.playerId, true));
    }
  }

  disconnect(room: Room, identity: Identity): void {
    if (!this.alive(room)) return;
    const key = identity.playerId ?? identity.role;
    const count = (room.connections.get(key) ?? 0) - 1;
    if (count > 0) {
      room.connections.set(key, count);
      return;
    }
    room.connections.delete(key);
    if (identity.playerId !== null) {
      this.apply(room, setConnected(room.state, identity.playerId, false));
      return;
    }
    if (identity.role === 'host') this.hostLeft(room);
  }

  view(room: Room, identity: Identity): GameView | null {
    if (identity.role === 'host') return hostView(room.state);
    if (identity.role === 'stage') return stageView(room.state);
    return identity.playerId === null ? null : playerView(room.state, identity.playerId);
  }

  answer(room: Room, playerId: string, answer: Answer): AckResult {
    if (!this.alive(room)) return GONE;
    return this.apply(room, submitAnswer(room.state, playerId, answer, this.now()));
  }

  host(room: Room, action: HostAction): AckResult {
    if (!this.alive(room)) return GONE;
    const state = room.state;
    switch (action.type) {
      case 'start':
        return this.apply(room, start(state, this.now(), this.rng));
      case 'lock':
        return this.apply(room, lock(state));
      case 'next':
        return this.apply(room, next(state, this.now(), this.rng));
      case 'pause':
        return this.apply(room, pause(state, this.now()));
      case 'resume':
        return this.apply(room, resume(state, this.now()));
      case 'end':
        return this.apply(room, end(state));
      case 'override':
        return this.apply(room, override(state, action.playerId, action.accepted));
      case 'kick':
        return this.kick(room, action.playerId);
    }
  }

  private kick(room: Room, playerId: string): AckResult {
    // Після фінішу подіум уже показано; вилучення переписало б результати.
    if (room.state.phase === 'finished') return { ok: false, error: 'wrong_phase' };
    const removed = removePlayer(room.state, playerId);
    if (!removed.ok) return { ok: false, error: removed.error };
    for (const [token, id] of room.playerTokens) {
      if (id === playerId) room.playerTokens.delete(token);
    }
    room.connections.delete(playerId);
    this.emit(room, { type: 'kicked', playerId });
    this.commit(room, removed.state);
    return { ok: true };
  }

  private hostLeft(room: Room): void {
    const { phase, paused } = room.state;
    if (phase === 'lobby' || phase === 'finished') return;
    if (!paused) this.apply(room, pause(room.state, this.now()));
    this.scheduler.clearTimeout(room.absence);
    room.absence = this.scheduler.setTimeout(() => {
      room.absence = null;
      if (this.alive(room)) this.apply(room, end(room.state));
    }, HOST_ABSENCE_MS);
  }

  private alive(room: Room): boolean {
    return this.rooms.get(room.code) === room;
  }

  private apply(room: Room, result: Result): AckResult {
    if (!result.ok) return { ok: false, error: result.error };
    this.commit(room, result.state);
    return { ok: true };
  }

  private commit(room: Room, state: GameState): void {
    room.state = state;
    this.reschedule(room);
    this.emit(room, { type: 'changed' });
  }

  /** Приводить таймери кімнати у відповідність до її стану. */
  private reschedule(room: Room): void {
    this.scheduler.clearTimeout(room.deadline);
    room.deadline = null;
    const { phase, paused, endsAt } = room.state;
    if (phase === 'question' && !paused && endsAt !== null) {
      room.deadline = this.scheduler.setTimeout(() => {
        room.deadline = null;
        const ticked = tick(room.state, this.now());
        if (ticked !== room.state) this.commit(room, ticked);
      }, endsAt - this.now());
    }

    if (room.expiryPhase === phase) return;
    room.expiryPhase = phase;
    this.scheduler.clearTimeout(room.expiry);
    room.expiry = null;
    const ttl = phase === 'lobby' ? LOBBY_TTL_MS : phase === 'finished' ? FINISHED_TTL_MS : null;
    if (ttl !== null) room.expiry = this.scheduler.setTimeout(() => this.close(room), ttl);
  }

  private close(room: Room): void {
    for (const handle of [room.deadline, room.absence, room.expiry]) this.scheduler.clearTimeout(handle);
    room.deadline = room.absence = room.expiry = null;
    this.rooms.delete(room.code);
    this.emit(room, { type: 'closed' });
  }

  private emit(room: Room, event: RoomEvent): void {
    for (const listener of this.listeners) listener(room, event);
  }

  private newCode(): string {
    for (;;) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      if (!this.rooms.has(code)) return code;
    }
  }
}
```

- [ ] **Step 6: Переконатися, що тести проходять**

Run: `pnpm test`
Expected: PASS, 129 тестів (103 попередніх + 26 нових).

Run: `pnpm typecheck`
Expected: без помилок.

- [ ] **Step 7: Commit**

```bash
git add packages/engine apps/server
git commit -m "feat(server): add room manager with timers, host absence and expiry"
```

---

### Task 3: HTTP-маршрути

**Files:**
- Modify: `apps/server/src/app.ts` (повна заміна)
- Modify: `apps/server/src/app.test.ts` (повна заміна)

**Interfaces:**
- Consumes: `RoomManager`, `Scheduler`, `realScheduler` (завдання 2); `quizSchema`, `joinSchema` з `@quiz/shared`.
- Produces:
  - `buildApp(options?: { scheduler?: Scheduler; rng?: () => number }): Promise<{ app: FastifyInstance; manager: RoomManager }>`
  - `POST /api/games` (тіло: вікторина) → `201 { gameId, code, hostToken, stageToken }` або `400 { error: 'invalid_payload' }`
  - `GET /api/games/by-code/:code` → `200 { phase, title }` або `404 { error: 'game_not_found' }`
  - `POST /api/games/by-code/:code/join` (тіло: `{ nickname }`) → `201 { token, playerId }`, `400 invalid_payload`, `404 game_not_found`, `409` з кодом помилки рушія

- [ ] **Step 1: Написати тест, що падає**

`apps/server/src/app.test.ts` (повний вміст):

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeQuiz, single } from '@quiz/engine/testing';
import { buildApp } from './app';

let ctx: Awaited<ReturnType<typeof buildApp>>;

beforeEach(async () => {
  ctx = await buildApp();
});

afterEach(async () => {
  await ctx.app.close();
});

const post = (url: string, payload: unknown) => ctx.app.inject({ method: 'POST', url, payload: payload as object });

async function createGame() {
  const response = await post('/api/games', makeQuiz([single]));
  return response.json() as { gameId: string; code: string; hostToken: string; stageToken: string };
}

describe('GET /health', () => {
  it('reports that the server is up', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});

describe('POST /api/games', () => {
  it('creates a room and returns its code and tokens', async () => {
    const response = await post('/api/games', makeQuiz([single]));
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.code).toMatch(/^\d{6}$/);
    expect(body.hostToken).toEqual(expect.any(String));
    expect(body.stageToken).toEqual(expect.any(String));
    expect(ctx.manager.get(body.code)?.id).toBe(body.gameId);
  });

  it('rejects an invalid quiz', async () => {
    const response = await post('/api/games', { ...makeQuiz([single]), questions: [] });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_payload' });
  });

  it('rejects a body that is not valid JSON with a 400', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/games',
      headers: { 'content-type': 'application/json' },
      payload: '{"title": ',
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /api/games/by-code/:code', () => {
  it('describes an existing game without revealing questions', async () => {
    const { code } = await createGame();
    const response = await ctx.app.inject({ method: 'GET', url: `/api/games/by-code/${code}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ phase: 'lobby', title: 'Тестова вікторина' });
  });

  it('answers 404 for an unknown code', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/games/by-code/000000x' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'game_not_found' });
  });
});

describe('POST /api/games/by-code/:code/join', () => {
  it('lets a player in and returns a token that identifies them', async () => {
    const { code } = await createGame();
    const response = await post(`/api/games/by-code/${code}/join`, { nickname: 'Олена' });
    expect(response.statusCode).toBe(201);
    const { token, playerId } = response.json();
    expect(ctx.manager.identify(code, 'player', token)?.identity.playerId).toBe(playerId);
  });

  it('answers 409 when the nickname is taken', async () => {
    const { code } = await createGame();
    await post(`/api/games/by-code/${code}/join`, { nickname: 'Олена' });
    const response = await post(`/api/games/by-code/${code}/join`, { nickname: 'олена' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'nickname_taken' });
  });

  it('answers 409 when the nickname is only spaces', async () => {
    const { code } = await createGame();
    const response = await post(`/api/games/by-code/${code}/join`, { nickname: '    ' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'nickname_invalid' });
  });

  it('answers 409 when the game has already started', async () => {
    const { code } = await createGame();
    await post(`/api/games/by-code/${code}/join`, { nickname: 'Олена' });
    const room = ctx.manager.get(code);
    if (room === undefined) throw new Error('room missing');
    ctx.manager.host(room, { type: 'start' });

    const response = await post(`/api/games/by-code/${code}/join`, { nickname: 'Тарас' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'wrong_phase' });
  });

  it('answers 404 for an unknown code and 400 for a body without a nickname', async () => {
    const { code } = await createGame();
    expect((await post('/api/games/by-code/000000x/join', { nickname: 'Олена' })).statusCode).toBe(404);
    const invalid = await post(`/api/games/by-code/${code}/join`, { name: 'Олена' });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: 'invalid_payload' });
  });
});
```

- [ ] **Step 2: Переконатися, що тест падає**

Run: `pnpm vitest run apps/server/src/app.test.ts`
Expected: FAIL: нові маршрути відповідають 404, `ctx.manager` не визначено.

- [ ] **Step 3: Написати реалізацію**

`apps/server/src/app.ts` (повний вміст):

```ts
import rateLimit from '@fastify/rate-limit';
import { joinSchema, quizSchema } from '@quiz/shared';
import Fastify from 'fastify';
import { RoomManager } from './rooms/manager';
import { realScheduler, type Scheduler } from './rooms/scheduler';

export interface AppOptions {
  scheduler?: Scheduler;
  rng?: () => number;
}

/** Обмеження для маршрутів, якими можна перебирати коди ігор. */
const CODE_LIMIT = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } };

export async function buildApp(options: AppOptions = {}) {
  const manager = new RoomManager(options.scheduler ?? realScheduler, options.rng);
  const app = Fastify();
  await app.register(rateLimit, { global: false });

  app.get('/health', async () => ({ ok: true }));

  app.post('/api/games', async (request, reply) => {
    const quiz = quizSchema.safeParse(request.body);
    if (!quiz.success) return reply.code(400).send({ error: 'invalid_payload' });
    const room = manager.create(quiz.data);
    return reply.code(201).send({
      gameId: room.id,
      code: room.code,
      hostToken: room.hostToken,
      stageToken: room.stageToken,
    });
  });

  app.get<{ Params: { code: string } }>('/api/games/by-code/:code', CODE_LIMIT, async (request, reply) => {
    const room = manager.get(request.params.code);
    if (room === undefined) return reply.code(404).send({ error: 'game_not_found' });
    return { phase: room.state.phase, title: room.state.quiz.title };
  });

  app.post<{ Params: { code: string } }>('/api/games/by-code/:code/join', CODE_LIMIT, async (request, reply) => {
    const body = joinSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_payload' });
    const joined = manager.join(request.params.code, body.data.nickname);
    if (!joined.ok) {
      return reply.code(joined.error === 'game_not_found' ? 404 : 409).send({ error: joined.error });
    }
    return reply.code(201).send({ token: joined.token, playerId: joined.playerId });
  });

  return { app, manager };
}
```

- [ ] **Step 4: Переконатися, що тести проходять**

Run: `pnpm test`
Expected: PASS, 139 тестів (129 попередніх + 10 нових).

Run: `pnpm typecheck`
Expected: без помилок.

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat(server): add HTTP routes to create a game and join by code"
```

---

### Task 4: Сокет-шлюз і точка входу

**Files:**
- Create: `apps/server/src/socket.ts`, `apps/server/src/main.ts`
- Modify: `apps/server/src/app.ts` (повна заміна)
- Modify: `README.md` (повна заміна)
- Test: `apps/server/src/socket.test.ts`

**Interfaces:**
- Consumes: `RoomManager`, `Room`, `Identity` (завдання 2); `buildApp` (завдання 3); контракт подій і схеми з `@quiz/shared` (завдання 1).
- Produces:
  - `attachSockets(server: http.Server, manager: RoomManager): GameServer`
  - `buildApp(options?)` тепер повертає `{ app, manager, io }`
  - з'єднання сокета: `auth: { code, role, token }`; помилка підключення з повідомленням `unauthorized`
  - після підключення та після кожної зміни стану кімнати клієнт отримує подію `state`
  - `apps/server/src/main.ts`: слухає порт `PORT` (типово 3000)

- [ ] **Step 1: Написати тест, що падає**

`apps/server/src/socket.test.ts`:

```ts
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import type { AckResult, ClientToServerEvents, GameView, ServerToClientEvents, SocketAuth } from '@quiz/shared';
import { buildApp } from './app';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Tracked {
  socket: Client;
  last: GameView | null;
  waiters: { test: (view: GameView) => boolean; resolve: (view: GameView) => void }[];
}

let ctx: Awaited<ReturnType<typeof buildApp>>;
let url: string;
let sockets: Client[];

beforeEach(async () => {
  sockets = [];
  ctx = await buildApp();
  await ctx.app.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const socket of sockets) socket.close();
  await ctx.app.close();
});

function open(auth: SocketAuth): Tracked {
  const socket: Client = connect(url, { auth, transports: ['websocket'], reconnection: false });
  sockets.push(socket);
  const tracked: Tracked = { socket, last: null, waiters: [] };
  socket.on('state', (view) => {
    tracked.last = view;
    const ready = tracked.waiters.filter((waiter) => waiter.test(view));
    tracked.waiters = tracked.waiters.filter((waiter) => !ready.includes(waiter));
    for (const waiter of ready) waiter.resolve(view);
  });
  return tracked;
}

/** Чекає на зріз стану, що задовольняє умову (або повертає вже отриманий). */
function until(tracked: Tracked, test: (view: GameView) => boolean): Promise<GameView> {
  if (tracked.last !== null && test(tracked.last)) return Promise.resolve(tracked.last);
  return new Promise((resolve) => tracked.waiters.push({ test, resolve }));
}

function send(tracked: Tracked, event: string, ...args: unknown[]): Promise<AckResult> {
  // Події різних типів мають різні аргументи; тест перевіряє поведінку, а не типи emit.
  const emit = tracked.socket.emit.bind(tracked.socket) as (event: string, ...args: unknown[]) => void;
  return new Promise((resolve) => emit(event, ...args, resolve));
}

async function createGame() {
  const response = await ctx.app.inject({ method: 'POST', url: '/api/games', payload: makeQuiz([single, text]) });
  return response.json() as { code: string; hostToken: string; stageToken: string };
}

async function join(code: string, nickname: string) {
  const response = await ctx.app.inject({
    method: 'POST',
    url: `/api/games/by-code/${code}/join`,
    payload: { nickname },
  });
  return response.json() as { token: string; playerId: string };
}

/** Гра з ведучим, сценою і двома підключеними гравцями в лобі. */
async function lobby() {
  const game = await createGame();
  const olenaJoin = await join(game.code, 'Олена');
  const tarasJoin = await join(game.code, 'Тарас');
  const host = open({ code: game.code, role: 'host', token: game.hostToken });
  const stage = open({ code: game.code, role: 'stage', token: game.stageToken });
  const olena = open({ code: game.code, role: 'player', token: olenaJoin.token });
  const taras = open({ code: game.code, role: 'player', token: tarasJoin.token });
  await until(host, (view) => view.role === 'host' && view.players.filter((p) => p.connected).length === 2);
  return { game, host, stage, olena, taras, olenaJoin, tarasJoin };
}

const inPhase = (phase: GameView['phase']) => (view: GameView) => view.phase === phase;
const correct = { type: 'single', optionId: 'b' };
const wrong = { type: 'single', optionId: 'a' };

describe('connecting', () => {
  it('refuses a connection with a wrong token', async () => {
    const game = await createGame();
    const socket: Client = connect(url, {
      auth: { code: game.code, role: 'host', token: 'nope' },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);
    const error = await new Promise<Error>((resolve) => socket.on('connect_error', resolve));
    expect(error.message).toBe('unauthorized');
  });

  it('sends each role its own view right after connecting', async () => {
    const { host, stage, olena } = await lobby();
    expect((await until(host, inPhase('lobby'))).role).toBe('host');
    expect((await until(stage, inPhase('lobby'))).role).toBe('stage');
    const view = await until(olena, inPhase('lobby'));
    expect(view.role === 'player' && view.me.nickname).toBe('Олена');
  });
});

describe('a round over real sockets', () => {
  it('plays a question from start to reveal without leaking the answer', async () => {
    const { host, stage, olena, taras } = await lobby();

    expect(await send(host, 'host:start')).toEqual({ ok: true });
    const question = await until(olena, inPhase('question'));
    expect(question.question?.text).toBe('Столиця України?');
    expect(JSON.stringify(question)).not.toContain('correctId');
    expect(JSON.stringify(await until(stage, inPhase('question')))).not.toContain('correctId');

    expect(await send(olena, 'player:answer', correct)).toEqual({ ok: true });
    expect(await send(taras, 'player:answer', wrong)).toEqual({ ok: true });

    const locked = await until(olena, inPhase('locked'));
    expect(JSON.stringify(locked)).not.toContain('correctId');

    expect(await send(host, 'host:next')).toEqual({ ok: true });
    const reveal = await until(olena, inPhase('reveal'));
    expect(reveal.role === 'player' && reveal.me.result?.accepted).toBe(true);
    const stageReveal = await until(stage, inPhase('reveal'));
    expect(stageReveal.role === 'stage' && stageReveal.stats).toMatchObject({ answered: 2, accepted: 1 });
  });

  it('reports engine errors through the acknowledgement', async () => {
    const { host, olena } = await lobby();
    expect(await send(olena, 'player:answer', correct)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(await send(host, 'host:next')).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('permissions and bad input', () => {
  it('forbids host actions to players and the stage, and answers to the host', async () => {
    const { host, stage, olena } = await lobby();
    expect(await send(olena, 'host:start')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'host:start')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'host:kick', { playerId: 'x' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'player:answer', correct)).toEqual({ ok: false, error: 'forbidden' });
  });

  it('rejects malformed payloads', async () => {
    const { host, olena } = await lobby();
    await send(host, 'host:start');
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:answer', { type: 'single' })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:kick', { player: 1 })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:override', 'x')).toEqual({ ok: false, error: 'invalid_payload' });
  });

  it('survives events without an acknowledgement or with junk arguments', async () => {
    const { host, olena } = await lobby();
    const raw = olena.socket.emit.bind(olena.socket) as (event: string, ...args: unknown[]) => void;
    raw('player:answer');
    raw('player:answer', 'junk', 'not a function');
    raw('host:start', 42);
    raw('host:kick');

    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect((await until(olena, inPhase('question'))).phase).toBe('question');
  });
});

describe('reconnecting and kicking', () => {
  it('lets a player come back with the same token and receive the current state', async () => {
    const { game, host, olena, olenaJoin } = await lobby();
    await send(host, 'host:start');
    await until(olena, inPhase('question'));
    await send(olena, 'player:answer', correct);

    olena.socket.close();
    await until(host, (view) => view.role === 'host' && view.players[0].connected === false);

    const back = open({ code: game.code, role: 'player', token: olenaJoin.token });
    const view = await until(back, inPhase('question'));
    expect(view.role === 'player' && view.me.answer).toEqual(correct);
    await until(host, (hostView) => hostView.role === 'host' && hostView.players[0].connected === true);
  });

  it('tells a kicked player why and closes their connection', async () => {
    const { game, host, olena, olenaJoin } = await lobby();
    const closed = new Promise<string>((resolve) => olena.socket.on('closed', resolve));
    const disconnected = new Promise<void>((resolve) => olena.socket.on('disconnect', () => resolve()));

    expect(await send(host, 'host:kick', { playerId: olenaJoin.playerId })).toEqual({ ok: true });
    expect(await closed).toBe('kicked');
    await disconnected;

    const again: Client = connect(url, {
      auth: { code: game.code, role: 'player', token: olenaJoin.token },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(again);
    const error = await new Promise<Error>((resolve) => again.on('connect_error', resolve));
    expect(error.message).toBe('unauthorized');
  });
});
```

- [ ] **Step 2: Переконатися, що тест падає**

Run: `pnpm vitest run apps/server/src/socket.test.ts`
Expected: FAIL: з'єднання не встановлюються, бо сокет-сервер не підключено (тести завершуються за тайм-аутом або помилкою підключення, відмінною від `unauthorized`).

- [ ] **Step 3: Написати реалізацію**

`apps/server/src/socket.ts`:

```ts
import type { Server as HttpServer } from 'node:http';
import {
  answerSchema,
  kickSchema,
  overrideSchema,
  socketAuthSchema,
  type AckResult,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@quiz/shared';
import { Server, type Socket } from 'socket.io';
import type { Identity, Room, RoomManager } from './rooms/manager';

interface SocketData {
  room: Room;
  identity: Identity;
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const FORBIDDEN: AckResult = { ok: false, error: 'forbidden' };
const INVALID: AckResult = { ok: false, error: 'invalid_payload' };
const SIMPLE_HOST_ACTIONS = ['start', 'lock', 'next', 'pause', 'resume', 'end'] as const;

/** Клієнт міг не передати функцію підтвердження або передати на її місці що завгодно. */
function reply(args: unknown[], result: AckResult): void {
  const ack = args.at(-1);
  if (typeof ack === 'function') ack(result);
}

/** Перший аргумент події, якщо це дані, а не функція підтвердження. */
function payloadOf(args: unknown[]): unknown {
  return typeof args[0] === 'function' ? undefined : args[0];
}

export function attachSockets(server: HttpServer, manager: RoomManager): GameServer {
  const io: GameServer = new Server(server, { serveClient: false });

  io.use((socket, next) => {
    const auth = socketAuthSchema.safeParse(socket.handshake.auth);
    const found = auth.success ? manager.identify(auth.data.code, auth.data.role, auth.data.token) : null;
    if (found === null) return next(new Error('unauthorized'));
    socket.data.room = found.room;
    socket.data.identity = found.identity;
    next();
  });

  const push = (socket: GameSocket) => {
    const view = manager.view(socket.data.room, socket.data.identity);
    if (view !== null) socket.emit('state', view, manager.now());
  };

  manager.onEvent((room, event) => {
    const members = [...io.sockets.sockets.values()].filter((socket) => socket.data.room === room);
    if (event.type === 'changed') {
      members.forEach(push);
      return;
    }
    const leaving =
      event.type === 'kicked' ? members.filter((s) => s.data.identity.playerId === event.playerId) : members;
    for (const socket of leaving) {
      socket.emit('closed', event.type === 'kicked' ? 'kicked' : 'expired');
      socket.disconnect(true);
    }
  });

  io.on('connection', (socket) => {
    const { room, identity } = socket.data;
    manager.connect(room, identity);
    push(socket);
    socket.on('disconnect', () => manager.disconnect(room, identity));

    // Обробники приймають довільні аргументи: типи подій описують чесного клієнта, а не будь-якого.
    const on = (event: keyof ClientToServerEvents, handler: (args: unknown[]) => AckResult) => {
      (socket as unknown as { on(event: string, listener: (...args: unknown[]) => void): void }).on(
        event,
        (...args) => reply(args, handler(args)),
      );
    };
    const isHost = identity.role === 'host';

    on('player:answer', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const answer = answerSchema.safeParse(payloadOf(args));
      return answer.success ? manager.answer(room, identity.playerId, answer.data) : INVALID;
    });

    for (const type of SIMPLE_HOST_ACTIONS) {
      on(`host:${type}`, () => (isHost ? manager.host(room, { type }) : FORBIDDEN));
    }

    on('host:override', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = overrideSchema.safeParse(payloadOf(args));
      return payload.success ? manager.host(room, { type: 'override', ...payload.data }) : INVALID;
    });

    on('host:kick', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = kickSchema.safeParse(payloadOf(args));
      return payload.success ? manager.host(room, { type: 'kick', ...payload.data }) : INVALID;
    });
  });

  return io;
}
```

`apps/server/src/app.ts` (повний вміст):

```ts
import rateLimit from '@fastify/rate-limit';
import { joinSchema, quizSchema } from '@quiz/shared';
import Fastify from 'fastify';
import { RoomManager } from './rooms/manager';
import { realScheduler, type Scheduler } from './rooms/scheduler';
import { attachSockets } from './socket';

export interface AppOptions {
  scheduler?: Scheduler;
  rng?: () => number;
}

/** Обмеження для маршрутів, якими можна перебирати коди ігор. */
const CODE_LIMIT = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } };

export async function buildApp(options: AppOptions = {}) {
  const manager = new RoomManager(options.scheduler ?? realScheduler, options.rng);
  const app = Fastify();
  await app.register(rateLimit, { global: false });

  app.get('/health', async () => ({ ok: true }));

  app.post('/api/games', async (request, reply) => {
    const quiz = quizSchema.safeParse(request.body);
    if (!quiz.success) return reply.code(400).send({ error: 'invalid_payload' });
    const room = manager.create(quiz.data);
    return reply.code(201).send({
      gameId: room.id,
      code: room.code,
      hostToken: room.hostToken,
      stageToken: room.stageToken,
    });
  });

  app.get<{ Params: { code: string } }>('/api/games/by-code/:code', CODE_LIMIT, async (request, reply) => {
    const room = manager.get(request.params.code);
    if (room === undefined) return reply.code(404).send({ error: 'game_not_found' });
    return { phase: room.state.phase, title: room.state.quiz.title };
  });

  app.post<{ Params: { code: string } }>('/api/games/by-code/:code/join', CODE_LIMIT, async (request, reply) => {
    const body = joinSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_payload' });
    const joined = manager.join(request.params.code, body.data.nickname);
    if (!joined.ok) {
      return reply.code(joined.error === 'game_not_found' ? 404 : 409).send({ error: joined.error });
    }
    return reply.code(201).send({ token: joined.token, playerId: joined.playerId });
  });

  const io = attachSockets(app.server, manager);
  // Відкриті WebSocket-з'єднання не дали б HTTP-серверу завершитись.
  app.addHook('preClose', async () => {
    io.disconnectSockets(true);
  });

  return { app, manager, io };
}
```

`apps/server/src/main.ts`:

```ts
import { buildApp } from './app';

const { app } = await buildApp();
const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
console.log(`Quiz server is listening on port ${port}`);
```

- [ ] **Step 4: Переконатися, що тести проходять**

Run: `pnpm test`
Expected: PASS, 148 тестів (139 попередніх + 9 нових), процес тестів завершується сам, без зависання.

Run: `pnpm typecheck`
Expected: без помилок.

- [ ] **Step 5: Перевірити запуск сервера вручну**

Run: `pnpm --filter @quiz/server start` у фоні, потім `curl http://localhost:3000/health`
Expected: `{"ok":true}`. Після перевірки зупинити сервер.

- [ ] **Step 6: Оновити README**

`README.md` (повний вміст):

```markdown
# Quiz

Платформа живих вікторин: ведучий створює вікторину й запускає гру, гравці
приєднуються з телефонів за кодом або QR.

Специфікація: `docs/superpowers/specs/2026-10-12-quiz-live-core-design.md`.
Плани реалізації: `docs/superpowers/plans/`.

## Пакети

- `packages/shared`: схеми вікторини, відповідей, зрізів стану й подій сокета.
- `packages/engine`: чиста логіка гри без мережі й бази: перевірка відповідей,
  бали, рейтинг, етапи гри, зрізи стану для сцени, гравця й ведучого.
- `apps/server`: Fastify + Socket.IO. Кімнати живуть у пам'яті; сервер володіє
  таймером і розсилає кожній ролі її зріз стану.

## Команди

Потрібні Node.js 22+ і pnpm.

    pnpm install
    pnpm test                          # усі тести
    pnpm typecheck                     # перевірка типів
    pnpm --filter @quiz/server dev     # сервер на http://localhost:3000

## HTTP API

- `POST /api/games` з вікториною в тілі створює кімнату й повертає
  `code`, `hostToken`, `stageToken`.
- `GET /api/games/by-code/:code` перевіряє код гри.
- `POST /api/games/by-code/:code/join` з `{ "nickname": "…" }` впускає гравця
  й повертає його `token`.

Сокет підключається з `auth: { code, role, token }`, де `role` дорівнює
`host`, `stage` або `player`.
```

- [ ] **Step 7: Commit**

```bash
git add apps/server README.md
git commit -m "feat(server): add socket gateway for live games"
```
