# План 2в: результати ігор та історія (сервер) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сервер зберігає хід і підсумки кожної гри, запущеної з акаунта, і віддає ведучому історію його ігор, а гравцеві з акаунтом історію зіграного.

**Architecture:** `Recorder` підписується на події `RoomManager` і після кожної зміни етапу записує гру, учасників і відповіді на закриті запитання в одній транзакції; записи однієї кімнати йдуть по черзі, збій бази не зупиняє гру. Читання історії винесено в `history.ts`. Гравець, який увійшов в акаунт, прив'язується до учасника під час входу в гру.

**Tech Stack:** Drizzle ORM, PostgreSQL, PGlite у тестах.

**Spec:** `docs/superpowers/specs/2026-10-12-quiz-live-core-design.md`

## Global Constraints

- Гра без акаунта ведучого (тимчасовий анонімний шлях) не записується.
- Запис у базу ніколи не блокує й не ламає гру: помилка збереження лише журналюється.
- Під час відкритого запитання окремі відповіді не записуються; запис відбувається після закриття запитання, після ручної зміни оцінки та на фініші.
- Історію гри бачить лише її ведучий; чужа або неіснуюча гра відповідає `404`.
- Гравець бачить у своїй історії лише ігри, у які зайшов, увійшовши в акаунт.
- Після перезапуску сервера всі ігри зі статусом `running` позначаються `aborted`.
- Знімок вікторини зберігається в грі; видалення вікторини не змінює історію.

## Відхилення від специфікації (свідомі)

- Токени учасників у базі не зберігаються: кімнати живуть у пам'яті, після перезапуску токен однаково не діє.
- `game.quiz_id` є звичайним полем без зовнішнього ключа: вікторину можуть видалити посеред гри, а історія спирається на знімок.
- Анонімний шлях створення гри все ще не прибрано; він іде в окремий невеликий план разом із переписуванням тестів, що на нього спираються.

## Review Focus

1. База недоступна посеред гри: гра триває, помилка журналюється, а наступне вдале збереження дозаписує пропущені запитання. Тест у завданні 2.
2. Ведучий вилучив гравця: у збереженій грі його немає ні серед учасників, ні серед відповідей. Тест у завданні 2.
3. Ведучий вручну змінив оцінку: історія показує змінені бали й ознаку ручної зміни. Тест у завданні 2.
4. Гравець увійшов у гру з простроченою чи зіпсованою cookie: він входить як анонімний, а не отримує помилку. Тест у завданні 3.
5. Ідентифікатор гри в адресі не є UUID або гра чужа: `404`, без помилки бази. Тест у завданні 3.

---

### Task 1: Схема результатів і зв'язки кімнати

**Files:**
- Modify: `apps/server/src/db/schema.ts` (повна заміна), `apps/server/src/rooms/manager.ts`
- Create: `apps/server/drizzle/0001_*.sql` (згенеровано), `packages/shared/src/history.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `apps/server/src/db/schema.test.ts`, `apps/server/src/rooms/manager.test.ts` (додати тести)

**Interfaces:**
- Produces:
  - таблиці `game`, `participant`, `answer`; індекси на `quiz.owner_id`, `session.user_id`, `account.user_id`, `game.host_id`, `participant.game_id`, `participant.user_id`
  - `Room.quizId: string | null`, `Room.playerUsers: Map<string, string>` (id гравця → id акаунта)
  - `RoomManager.create(quiz, hostUserId?: string | null, quizId?: string | null)`
  - `RoomManager.join(code, nickname, userId?: string | null)`
  - у `@quiz/shared`: `type GameStatus = 'running' | 'finished' | 'aborted'`, `GameSummary`, `GameDetail`, `PlayedGame`

- [ ] **Step 1: Написати тести, що падають**

Додати в кінець `apps/server/src/db/schema.test.ts`:

```ts
describe('game results schema', () => {
  it('removes participants and answers together with the game', async () => {
    const { answer, game, participant } = await import('./schema');
    const db = await createTestDb();
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'olena@example.com' });
    const gameId = '11111111-1111-4111-8111-111111111111';
    const playerId = '22222222-2222-4222-8222-222222222222';
    await db.insert(game).values({
      id: gameId,
      quizId: null,
      hostId: 'u1',
      code: '123456',
      status: 'running',
      title: 'Гра',
      quizSnapshot: makeQuiz([single]),
      startedAt: new Date(),
    });
    await db.insert(participant).values({ id: playerId, gameId, nickname: 'Тарас', score: 0, totalTimeMs: 0 });
    await db.insert(answer).values({
      participantId: playerId,
      questionIndex: 0,
      payload: { type: 'single', optionId: 'b' },
      timeMs: 1000,
      accepted: true,
      points: 1000,
      overridden: false,
    });

    await db.delete(game).where(eq(game.id, gameId));
    expect(await db.select().from(participant)).toEqual([]);
    expect(await db.select().from(answer)).toEqual([]);
  });

  it('keeps a played game when the player account is deleted', async () => {
    const { game, participant } = await import('./schema');
    const db = await createTestDb();
    await db.insert(user).values([
      { id: 'host', name: 'Ведуча', email: 'host@example.com' },
      { id: 'player', name: 'Тарас', email: 'taras@example.com' },
    ]);
    const gameId = '11111111-1111-4111-8111-111111111111';
    await db.insert(game).values({ id: gameId, quizId: null, hostId: 'host', code: '123456', status: 'finished', title: 'Гра', quizSnapshot: makeQuiz([single]), startedAt: new Date() });
    await db.insert(participant).values({ id: '22222222-2222-4222-8222-222222222222', gameId, nickname: 'Тарас', userId: 'player', score: 10, totalTimeMs: 0 });

    await db.delete(user).where(eq(user.id, 'player'));
    const [row] = await db.select().from(participant);
    expect(row.userId).toBeNull();
    expect(row.nickname).toBe('Тарас');
  });
});
```

Додати в кінець `apps/server/src/rooms/manager.test.ts`:

```ts
describe('accounts behind a room', () => {
  it('remembers the quiz and the host account a room was created from', () => {
    const { manager } = setup();
    const room = manager.create(makeQuiz([single]), 'host-user', 'quiz-1');
    expect([room.hostUserId, room.quizId]).toEqual(['host-user', 'quiz-1']);
    expect(manager.create(makeQuiz([single])).quizId).toBeNull();
  });

  it('links a player to an account when they join signed in, and forgets it when they are kicked', () => {
    const { manager, room } = setup();
    const signedIn = manager.join(room.code, 'Олена', 'user-1');
    const anonymous = manager.join(room.code, 'Тарас');
    if (!signedIn.ok || !anonymous.ok) throw new Error('join failed');
    expect([...room.playerUsers]).toEqual([[signedIn.playerId, 'user-1']]);

    manager.host(room, { type: 'kick', playerId: signedIn.playerId });
    expect(room.playerUsers.size).toBe(0);
  });
});
```

Run: `pnpm vitest run apps/server/src/db apps/server/src/rooms`
Expected: FAIL: таблиць `game`, `participant`, `answer` немає; `room.quizId` і `room.playerUsers` не визначені.

- [ ] **Step 2: Написати реалізацію**

`packages/shared/src/history.ts`:

```ts
import type { Question } from './quiz';

export type GameStatus = 'running' | 'finished' | 'aborted';

/** Рядок у списку ігор ведучого. */
export interface GameSummary {
  id: string;
  title: string;
  code: string;
  status: GameStatus;
  startedAt: string;
  finishedAt: string | null;
  playerCount: number;
  questionsPlayed: number;
  questionCount: number;
}

export interface GameStanding {
  participantId: string;
  nickname: string;
  score: number;
  rank: number | null;
  /** Скільки відповідей зараховано. */
  correct: number;
}

export interface GameQuestionResult {
  index: number;
  text: string;
  type: Question['type'];
  answered: number;
  accepted: number;
}

/** Зіграна гра очима ведучого. */
export interface GameDetail extends Omit<GameSummary, 'playerCount'> {
  standings: GameStanding[];
  questions: GameQuestionResult[];
}

/** Гра в історії гравця з акаунтом. */
export interface PlayedGame {
  gameId: string;
  title: string;
  status: GameStatus;
  startedAt: string;
  nickname: string;
  score: number;
  rank: number | null;
  playerCount: number;
  correct: number;
  answered: number;
  questionsPlayed: number;
}
```

У `packages/shared/src/index.ts` додати рядок `export * from './history';`.

`apps/server/src/db/schema.ts` (повний вміст):

```ts
import type { Answer, GameStatus, Question, Quiz, QuizSettings } from '@quiz/shared';
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true });

const stamps = {
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
};

// Таблиці user, session, account, verification належать Better Auth:
// назви полів мають збігатися з його моделлю.

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  ...stamps,
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: at('expires_at').notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...stamps,
  },
  (table) => [index('session_user_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: at('access_token_expires_at'),
    refreshTokenExpiresAt: at('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    ...stamps,
  },
  (table) => [index('account_user_idx').on(table.userId)],
);

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: at('expires_at').notNull(),
  ...stamps,
});

export const quiz = pgTable(
  'quiz',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    settings: jsonb('settings').$type<QuizSettings>().notNull(),
    questions: jsonb('questions').$type<Question[]>().notNull(),
    ...stamps,
  },
  (table) => [index('quiz_owner_idx').on(table.ownerId)],
);

/** Зіграна або поточна гра. id збігається з id кімнати. */
export const game = pgTable(
  'game',
  {
    id: uuid('id').primaryKey(),
    // Без зовнішнього ключа: вікторину можуть видалити, а історія спирається на знімок.
    quizId: uuid('quiz_id'),
    hostId: text('host_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    status: text('status').$type<GameStatus>().notNull(),
    title: text('title').notNull(),
    quizSnapshot: jsonb('quiz_snapshot').$type<Quiz>().notNull(),
    /** Скільки запитань уже закрито. */
    questionsPlayed: integer('questions_played').notNull().default(0),
    startedAt: at('started_at').notNull(),
    finishedAt: at('finished_at'),
  },
  (table) => [index('game_host_idx').on(table.hostId)],
);

/** Гравець у грі. id збігається з id гравця в кімнаті. */
export const participant = pgTable(
  'participant',
  {
    id: uuid('id').primaryKey(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => game.id, { onDelete: 'cascade' }),
    nickname: text('nickname').notNull(),
    /** Акаунт гравця, якщо він увійшов; після видалення акаунта гра лишається в історії ведучого. */
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    score: integer('score').notNull(),
    totalTimeMs: integer('total_time_ms').notNull(),
    rank: integer('rank'),
  },
  (table) => [index('participant_game_idx').on(table.gameId), index('participant_user_idx').on(table.userId)],
);

export const answer = pgTable(
  'answer',
  {
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participant.id, { onDelete: 'cascade' }),
    questionIndex: integer('question_index').notNull(),
    payload: jsonb('payload').$type<Answer>().notNull(),
    timeMs: integer('time_ms').notNull(),
    accepted: boolean('accepted').notNull(),
    points: integer('points').notNull(),
    overridden: boolean('overridden').notNull(),
  },
  (table) => [primaryKey({ columns: [table.participantId, table.questionIndex] })],
);
```

Run (з теки `apps/server`): `pnpm exec drizzle-kit generate --name results`
Expected: з'явився `drizzle/0001_results.sql` з трьома новими таблицями та індексами.

У `apps/server/src/rooms/manager.ts`:

- в інтерфейс `Room` після `hostUserId` додати:

```ts
  /** Збережена вікторина, з якої створено гру; null для гри без акаунта. */
  quizId: string | null;
  /** Гравці, які увійшли в акаунт: id гравця → id акаунта. */
  playerUsers: Map<string, string>;
```

- сигнатуру `create` змінити на `create(quiz: Quiz, hostUserId: string | null = null, quizId: string | null = null): Room` і додати в об'єкт кімнати `quizId,` та `playerUsers: new Map(),`;
- сигнатуру `join` змінити на `join(code: string, nickname: string, userId: string | null = null): JoinResult` і після `room.playerTokens.set(token, playerId);` додати `if (userId !== null) room.playerUsers.set(playerId, userId);`;
- у `kick` після `room.connections.delete(playerId);` додати `room.playerUsers.delete(playerId);`.

- [ ] **Step 3: Переконатися, що тести проходять**

Run: `pnpm test`
Expected: PASS, 327 тестів (323 попередніх + 4 нових).

Run: `pnpm typecheck`
Expected: без помилок.

- [ ] **Step 4: Commit**

```bash
git add packages/shared apps/server
git commit -m "feat(server): add tables for game results and link rooms to accounts"
```

---

### Task 2: Запис ходу гри

**Files:**
- Create: `apps/server/src/recorder.ts`
- Modify: `apps/server/src/app.ts` (підключити `attachRecorder`, повертати `recorder`), `apps/server/src/main.ts` (викликати `markInterrupted`)
- Test: `apps/server/src/recorder.test.ts`

**Interfaces:**
- Consumes: таблиці `game`, `participant`, `answer`; `RoomManager.onEvent`, `Room`; `rankPlayers`, `recordOf` з `@quiz/engine`.
- Produces:
  - `attachRecorder(manager: RoomManager, db: Db, onError?: (error: unknown) => void): Recorder`
  - `interface Recorder { idle(): Promise<void> }` (чекає на завершення всіх поставлених у чергу записів; для тестів)
  - `markInterrupted(db: Db): Promise<void>`
  - `buildApp` повертає також `recorder`

- [ ] **Step 1: Написати тест, що падає**

`apps/server/src/recorder.test.ts`:

```ts
import { asc, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import type { Db } from './db/client';
import { answer, game, participant, user } from './db/schema';
import { attachRecorder, markInterrupted } from './recorder';
import { RoomManager, type Room } from './rooms/manager';
import { FakeScheduler } from './testing/fake-scheduler';
import { createTestDb } from './testing/test-db';

const HOST = 'host-user';
const correct = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;

async function setup(database?: Db) {
  const db = database ?? (await createTestDb());
  if (database === undefined) {
    await db.insert(user).values([
      { id: HOST, name: 'Ведуча', email: 'host@example.com' },
      { id: 'olena-user', name: 'Олена', email: 'olena@example.com' },
    ]);
  }
  const manager = new RoomManager(new FakeScheduler(), () => 0.5);
  const errors: unknown[] = [];
  const recorder = attachRecorder(manager, db, (error) => errors.push(error));
  const room = manager.create(makeQuiz([single, text], { speedBonus: false }), HOST, null);
  const enter = (nickname: string, userId: string | null = null) => {
    const joined = manager.join(room.code, nickname, userId);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    return joined.playerId;
  };
  const olena = enter('Олена', 'olena-user');
  const taras = enter('Тарас');
  const host = (type: 'start' | 'lock' | 'next' | 'end') => expect(manager.host(room, { type })).toEqual({ ok: true });
  const saved = async () => {
    await recorder.idle();
    return {
      games: await db.select().from(game),
      participants: await db.select().from(participant).orderBy(asc(participant.nickname)),
      answers: await db.select().from(answer).orderBy(asc(answer.questionIndex), asc(answer.points)),
    };
  };
  return { db, manager, recorder, room, olena, taras, host, saved, errors };
}

/** Перше запитання: Олена відповідає правильно, Тарас ні; запитання закривається само. */
function playFirstQuestion(ctx: { manager: RoomManager; room: Room; olena: string; taras: string }) {
  ctx.manager.answer(ctx.room, ctx.olena, correct);
  ctx.manager.answer(ctx.room, ctx.taras, wrong);
}

describe('recorder', () => {
  it('saves nothing while the game is in the lobby', async () => {
    const ctx = await setup();
    expect((await ctx.saved()).games).toEqual([]);
  });

  it('saves the game and its players when it starts', async () => {
    const ctx = await setup();
    ctx.host('start');
    const { games, participants, answers } = await ctx.saved();
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({
      id: ctx.room.id,
      hostId: HOST,
      code: ctx.room.code,
      status: 'running',
      title: 'Тестова вікторина',
      questionsPlayed: 0,
      finishedAt: null,
    });
    expect(games[0].quizSnapshot.questions).toHaveLength(2);
    expect(participants.map((p) => [p.nickname, p.userId, p.score, p.rank])).toEqual([
      ['Олена', 'olena-user', 0, null],
      ['Тарас', null, 0, null],
    ]);
    expect(answers).toEqual([]);
  });

  it('saves answers and scores once a question is closed, not on every answer', async () => {
    const ctx = await setup();
    ctx.host('start');
    await ctx.recorder.idle();
    const writes = vi.spyOn(ctx.db, 'transaction');

    ctx.manager.answer(ctx.room, ctx.olena, correct);
    await ctx.recorder.idle();
    expect(writes).not.toHaveBeenCalled();

    ctx.manager.answer(ctx.room, ctx.taras, wrong);
    const { games, participants, answers } = await ctx.saved();
    expect(writes).toHaveBeenCalledTimes(1);
    expect(games[0].questionsPlayed).toBe(1);
    expect(participants.map((p) => [p.nickname, p.score])).toEqual([
      ['Олена', 1000],
      ['Тарас', 0],
    ]);
    expect(answers.map((a) => [a.questionIndex, a.accepted, a.points, a.overridden, a.payload])).toEqual([
      [0, false, 0, false, wrong],
      [0, true, 1000, false, correct],
    ]);
  });

  it('saves a manual change of a grade', async () => {
    const ctx = await setup();
    ctx.host('start');
    playFirstQuestion(ctx);
    ctx.host('next');
    expect(ctx.manager.host(ctx.room, { type: 'override', playerId: ctx.taras, accepted: true })).toEqual({ ok: true });

    const { participants, answers } = await ctx.saved();
    expect(participants.map((p) => [p.nickname, p.score])).toEqual([
      ['Олена', 1000],
      ['Тарас', 1000],
    ]);
    expect(answers.filter((a) => a.participantId === ctx.taras)).toMatchObject([{ accepted: true, points: 1000, overridden: true }]);
  });

  it('saves the final places when the game ends', async () => {
    const ctx = await setup();
    ctx.host('start');
    playFirstQuestion(ctx);
    ctx.host('next');
    ctx.host('next');
    ctx.host('next');
    ctx.manager.answer(ctx.room, ctx.olena, { type: 'text', value: 'одеса' });
    ctx.host('lock');
    ctx.host('next');
    ctx.host('next');

    const { games, participants, answers } = await ctx.saved();
    expect(games[0]).toMatchObject({ status: 'finished', questionsPlayed: 2 });
    expect(games[0].finishedAt).toBeInstanceOf(Date);
    expect(participants.map((p) => [p.nickname, p.score, p.rank])).toEqual([
      ['Олена', 2000, 1],
      ['Тарас', 0, 2],
    ]);
    expect(answers.map((a) => a.questionIndex)).toEqual([0, 0, 1]);
  });

  it('drops a removed player and their answers from the saved game', async () => {
    const ctx = await setup();
    ctx.host('start');
    playFirstQuestion(ctx);
    expect(ctx.manager.host(ctx.room, { type: 'kick', playerId: ctx.taras })).toEqual({ ok: true });

    const { participants, answers } = await ctx.saved();
    expect(participants.map((p) => p.nickname)).toEqual(['Олена']);
    expect(answers.map((a) => a.participantId)).toEqual([ctx.olena]);
  });

  it('does not record a game that has no host account', async () => {
    const ctx = await setup();
    const anonymous = ctx.manager.create(makeQuiz([single]));
    ctx.manager.join(anonymous.code, 'Гість');
    expect(ctx.manager.host(anonymous, { type: 'start' })).toEqual({ ok: true });
    expect((await ctx.saved()).games).toEqual([]);
  });

  it('keeps the game going when the database fails and catches up on the next save', async () => {
    const ctx = await setup();
    ctx.host('start');
    await ctx.recorder.idle();

    const transaction = vi.spyOn(ctx.db, 'transaction').mockRejectedValueOnce(new Error('database is down'));
    playFirstQuestion(ctx);
    await ctx.recorder.idle();
    expect(ctx.errors).toHaveLength(1);
    expect(ctx.room.state.phase).toBe('locked');
    transaction.mockRestore();

    ctx.host('next');
    const { games, answers } = await ctx.saved();
    expect(games[0].questionsPlayed).toBe(1);
    expect(answers).toHaveLength(2);
    expect(ctx.errors).toHaveLength(1);
  });
});

describe('markInterrupted', () => {
  it('marks games left running by a previous server process as aborted', async () => {
    const ctx = await setup();
    ctx.host('start');
    await ctx.recorder.idle();

    const finished = await setup(ctx.db);
    finished.host('start');
    finished.host('end');
    await finished.recorder.idle();

    await markInterrupted(ctx.db);
    const [running] = await ctx.db.select().from(game).where(eq(game.id, ctx.room.id));
    const [done] = await ctx.db.select().from(game).where(eq(game.id, finished.room.id));
    expect(running.status).toBe('aborted');
    expect(running.finishedAt).toBeInstanceOf(Date);
    expect(done.status).toBe('finished');
  });
});
```

Run: `pnpm vitest run apps/server/src/recorder.test.ts`
Expected: FAIL, модуль `./recorder` не існує.

- [ ] **Step 2: Написати реалізацію**

`apps/server/src/recorder.ts`:

```ts
import { rankPlayers, recordOf, type GameState } from '@quiz/engine';
import { and, eq, notInArray } from 'drizzle-orm';
import type { Db } from './db/client';
import { answer, game, participant } from './db/schema';
import type { Room, RoomManager } from './rooms/manager';

export interface Recorder {
  /** Завершується, коли всі поставлені в чергу записи виконано. */
  idle(): Promise<void>;
}

interface Snapshot {
  id: string;
  code: string;
  hostId: string;
  quizId: string | null;
  state: GameState;
  playerUsers: Map<string, string>;
  startedAt: Date;
  /** З якого запитання записувати відповіді: попередні вже збережено. */
  fromQuestion: number;
}

/** Скільки запитань уже закрито. */
function closedQuestions(state: GameState): number {
  if (state.phase === 'lobby') return 0;
  return state.phase === 'question' ? state.questionIndex : state.questionIndex + 1;
}

/** Змінюється лише тоді, коли в грі з'явилося щось варте запису. */
function signature(state: GameState): string {
  return JSON.stringify([state.phase, state.questionIndex, state.players.map((p) => [p.id, p.score])]);
}

async function save(db: Db, snapshot: Snapshot): Promise<void> {
  const { state } = snapshot;
  const finished = state.phase === 'finished';
  const closed = closedQuestions(state);
  const ranks = new Map(finished ? rankPlayers(state.players).map((row) => [row.participantId, row.rank]) : []);
  const progress = {
    status: finished ? ('finished' as const) : ('running' as const),
    questionsPlayed: closed,
    finishedAt: finished ? new Date() : null,
  };

  await db.transaction(async (tx) => {
    await tx
      .insert(game)
      .values({
        id: snapshot.id,
        quizId: snapshot.quizId,
        hostId: snapshot.hostId,
        code: snapshot.code,
        title: state.quiz.title,
        quizSnapshot: state.quiz,
        startedAt: snapshot.startedAt,
        ...progress,
      })
      .onConflictDoUpdate({ target: game.id, set: progress });

    // Вилучених гравців прибираємо разом з їхніми відповідями (каскадом).
    const ids = state.players.map((player) => player.id);
    const inGame = eq(participant.gameId, snapshot.id);
    await tx.delete(participant).where(ids.length === 0 ? inGame : and(inGame, notInArray(participant.id, ids)));

    for (const player of state.players) {
      const result = { score: player.score, totalTimeMs: player.totalTimeMs, rank: ranks.get(player.id) ?? null };
      await tx
        .insert(participant)
        .values({
          id: player.id,
          gameId: snapshot.id,
          nickname: player.nickname,
          userId: snapshot.playerUsers.get(player.id) ?? null,
          ...result,
        })
        .onConflictDoUpdate({ target: participant.id, set: result });

      for (let index = snapshot.fromQuestion; index < closed; index++) {
        const record = recordOf(state, index, player.id);
        if (record === undefined) continue;
        const grade = { accepted: record.accepted, points: record.points, overridden: record.overridden };
        await tx
          .insert(answer)
          .values({ participantId: player.id, questionIndex: index, payload: record.answer, timeMs: record.timeMs, ...grade })
          .onConflictDoUpdate({ target: [answer.participantId, answer.questionIndex], set: grade });
      }
    }
  });
}

/** Записує хід ігор у базу. Збій бази журналюється й не зачіпає саму гру. */
export function attachRecorder(
  manager: RoomManager,
  db: Db,
  onError: (error: unknown) => void = (error) => console.error('Не вдалося зберегти гру:', error),
): Recorder {
  const queues = new Map<string, Promise<void>>();
  const lastSignature = new Map<string, string>();
  const startedAt = new Map<string, Date>();
  /** Скільки запитань кімнати вже надійно записано. */
  const savedQuestions = new Map<string, number>();

  const record = (room: Room) => {
    const { state } = room;
    if (room.hostUserId === null || state.phase === 'lobby') return;
    const current = signature(state);
    if (lastSignature.get(room.id) === current) return;
    lastSignature.set(room.id, current);
    if (!startedAt.has(room.id)) startedAt.set(room.id, new Date());

    const closed = closedQuestions(state);
    const snapshot: Snapshot = {
      id: room.id,
      code: room.code,
      hostId: room.hostUserId,
      quizId: room.quizId,
      state,
      playerUsers: new Map(room.playerUsers),
      startedAt: startedAt.get(room.id) ?? new Date(),
      // Останнє закрите запитання записується повторно: його оцінки могли змінити вручну.
      fromQuestion: 0,
    };

    const job = async () => {
      snapshot.fromQuestion = Math.max(0, Math.min(savedQuestions.get(room.id) ?? 0, closed - 1));
      await save(db, snapshot);
      savedQuestions.set(room.id, closed);
    };
    const queued = (queues.get(room.id) ?? Promise.resolve()).then(job).catch((error) => {
      // Наступна зміна стану має спробувати знову, навіть якщо підпис не зміниться.
      lastSignature.delete(room.id);
      onError(error);
    });
    queues.set(room.id, queued);
  };

  manager.onEvent((room, event) => {
    if (event.type === 'changed') {
      record(room);
      return;
    }
    if (event.type === 'closed') {
      for (const map of [lastSignature, startedAt, savedQuestions]) map.delete(room.id);
      void (queues.get(room.id) ?? Promise.resolve()).then(() => queues.delete(room.id));
    }
  });

  return {
    idle: async () => {
      await Promise.all(queues.values());
    },
  };
}

/** Ігри, що лишилися «в процесі» після попереднього запуску сервера, уже ніхто не дограє. */
export async function markInterrupted(db: Db): Promise<void> {
  await db.update(game).set({ status: 'aborted', finishedAt: new Date() }).where(eq(game.status, 'running'));
}
```

У `apps/server/src/app.ts`: додати імпорт `import { attachRecorder } from './recorder';`, після створення `manager` рядок `const recorder = attachRecorder(manager, options.db);` і повертати `{ app, manager, io, recorder }`.

У `apps/server/src/main.ts`: додати імпорт `import { markInterrupted } from './recorder';` і після `const { db } = await connectDb(databaseUrl);` рядок `await markInterrupted(db);`.

- [ ] **Step 3: Переконатися, що тести проходять**

Run: `pnpm test`
Expected: PASS, 336 тестів (327 попередніх + 9 нових).

Run: `pnpm typecheck`
Expected: без помилок.

- [ ] **Step 4: Commit**

```bash
git add apps/server
git commit -m "feat(server): record game progress and results in the database"
```

---

### Task 3: Історія ігор

**Files:**
- Create: `apps/server/src/history.ts`
- Modify: `apps/server/src/account-routes.ts` (маршрути історії, повертає `currentUser`), `apps/server/src/app.ts` (вхід у гру прив'язує акаунт), `README.md`
- Test: `apps/server/src/history.test.ts`

**Interfaces:**
- Consumes: таблиці результатів (завдання 1); `Recorder.idle` (завдання 2); `currentUser`; типи `GameSummary`, `GameDetail`, `PlayedGame`.
- Produces:
  - `hostGames(db, hostId): Promise<GameSummary[]>` (новіші першими, до 100)
  - `hostGame(db, hostId, id): Promise<GameDetail | null>`
  - `playerHistory(db, userId): Promise<PlayedGame[]>` (новіші першими, до 100)
  - `GET /api/games` → `200 GameSummary[]`; `GET /api/games/:id` → `200 GameDetail` або `404 { error: 'not_found' }`; `GET /api/me/history` → `200 PlayedGame[]`; усі три без сесії дають `401`
  - `POST /api/games/by-code/:code/join` прив'язує гравця до акаунта, якщо запит має чинну сесію
  - `registerAccountRoutes` повертає `{ currentUser }`

- [ ] **Step 1: Написати тест, що падає**

`apps/server/src/history.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import { buildApp } from './app';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

let ctx: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  ctx = await buildApp({ db: await createTestDb(), auth: TEST_AUTH });
});

afterAll(async () => {
  await ctx.app.close();
});

const get = (url: string, cookie?: string) =>
  ctx.app.inject({ method: 'GET', url, headers: cookie === undefined ? {} : { cookie } });
const post = (url: string, payload: object, cookie?: string) =>
  ctx.app.inject({ method: 'POST', url, payload, headers: cookie === undefined ? {} : { cookie } });

/** Повна гра з двох запитань: Олена (з акаунтом) відповідає правильно на обидва, Тарас (гість) помиляється в першому. */
async function playedGame() {
  const host = await signUp(ctx.app, 'Ведуча');
  const olena = await signUp(ctx.app, 'Олена');
  const quiz = makeQuiz([single, text], { speedBonus: false });
  const quizId = ((await post('/api/quizzes', quiz, host.cookie)).json() as { id: string }).id;
  const created = (await post('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };

  const joinAs = async (nickname: string, cookie?: string) =>
    ((await post(`/api/games/by-code/${created.code}/join`, { nickname }, cookie)).json() as { playerId: string }).playerId;
  const olenaId = await joinAs('Олена', olena.cookie);
  const tarasId = await joinAs('Тарас');

  const room = ctx.manager.get(created.code);
  if (room === undefined) throw new Error('room missing');
  for (const playerId of [olenaId, tarasId]) ctx.manager.connect(room, { role: 'player', playerId });
  const step = (type: 'start' | 'lock' | 'next') => expect(ctx.manager.host(room, { type })).toEqual({ ok: true });

  step('start');
  ctx.manager.answer(room, olenaId, { type: 'single', optionId: 'b' });
  ctx.manager.answer(room, tarasId, { type: 'single', optionId: 'a' });
  step('next');
  step('next');
  step('next');
  ctx.manager.answer(room, olenaId, { type: 'text', value: 'Одеса' });
  step('lock');
  step('next');
  step('next');
  await ctx.recorder.idle();
  return { host, olena, gameId: created.gameId, code: created.code };
}

describe('host history', () => {
  it('lists the host’s games with their outcome', async () => {
    const { host, gameId, code } = await playedGame();
    const response = await get('/api/games', host.cookie);
    expect(response.statusCode).toBe(200);
    const list = response.json() as Record<string, unknown>[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: gameId,
      code,
      title: 'Тестова вікторина',
      status: 'finished',
      playerCount: 2,
      questionsPlayed: 2,
      questionCount: 2,
    });
    expect(Date.parse(String(list[0].startedAt))).not.toBeNaN();
    expect(Date.parse(String(list[0].finishedAt))).not.toBeNaN();
  });

  it('shows the standings and how each question went', async () => {
    const { host, gameId } = await playedGame();
    const detail = (await get(`/api/games/${gameId}`, host.cookie)).json() as {
      standings: Record<string, unknown>[];
      questions: Record<string, unknown>[];
    };
    expect(detail.standings.map((s) => [s.nickname, s.rank, s.score, s.correct])).toEqual([
      ['Олена', 1, 2000, 2],
      ['Тарас', 2, 0, 0],
    ]);
    expect(detail.questions).toEqual([
      { index: 0, text: 'Столиця України?', type: 'single', answered: 2, accepted: 1 },
      { index: 1, text: 'Яке місто називають перлиною біля моря?', type: 'text', answered: 1, accepted: 1 },
    ]);
    expect(JSON.stringify(detail)).not.toContain('correctId');
  });

  it('keeps the history after the quiz is deleted', async () => {
    const { host, gameId } = await playedGame();
    const quizzes = (await get('/api/quizzes', host.cookie)).json() as { id: string }[];
    await ctx.app.inject({ method: 'DELETE', url: `/api/quizzes/${quizzes[0].id}`, headers: { cookie: host.cookie } });
    expect((await get(`/api/games/${gameId}`, host.cookie)).statusCode).toBe(200);
  });

  it('shows nothing of one host’s games to another account or to a visitor', async () => {
    const { gameId } = await playedGame();
    const stranger = await signUp(ctx.app, 'Чужий');
    expect((await get('/api/games', stranger.cookie)).json()).toEqual([]);
    for (const response of [
      await get(`/api/games/${gameId}`, stranger.cookie),
      await get('/api/games/abc', stranger.cookie),
      await get('/api/games/11111111-1111-4111-8111-111111111111', stranger.cookie),
    ]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'not_found' });
    }
    for (const url of ['/api/games', `/api/games/${gameId}`, '/api/me/history']) {
      expect((await get(url)).statusCode).toBe(401);
    }
  });
});

describe('player history', () => {
  it('lists the games a signed-in player took part in', async () => {
    const { olena, host, gameId } = await playedGame();
    const response = await get('/api/me/history', olena.cookie);
    expect(response.statusCode).toBe(200);
    const list = response.json() as Record<string, unknown>[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      gameId,
      title: 'Тестова вікторина',
      status: 'finished',
      nickname: 'Олена',
      score: 2000,
      rank: 1,
      playerCount: 2,
      correct: 2,
      answered: 2,
      questionsPlayed: 2,
    });
    expect((await get('/api/me/history', host.cookie)).json()).toEqual([]);
  });

  it('lets a player with a broken session cookie join as a guest', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const quizId = ((await post('/api/quizzes', makeQuiz([single]), host.cookie)).json() as { id: string }).id;
    const { code } = (await post('/api/games', { quizId }, host.cookie)).json() as { code: string };

    const response = await post(`/api/games/by-code/${code}/join`, { nickname: 'Гість' }, 'better-auth.session_token=garbage');
    expect(response.statusCode).toBe(201);
    expect(ctx.manager.get(code)?.playerUsers.size).toBe(0);
  });
});
```

Run: `pnpm vitest run apps/server/src/history.test.ts`
Expected: FAIL: `GET /api/games` відповідає 404, маршрутів історії немає.

- [ ] **Step 2: Написати реалізацію**

`apps/server/src/history.ts`:

```ts
import type { GameDetail, GameSummary, PlayedGame } from '@quiz/shared';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from './db/client';
import { answer, game, participant } from './db/schema';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT = 100;

/** Кількість учасників у кожній із заданих ігор. */
async function playerCounts(db: Db, gameIds: string[]): Promise<Map<string, number>> {
  if (gameIds.length === 0) return new Map();
  const rows = await db
    .select({ gameId: participant.gameId, players: count() })
    .from(participant)
    .where(inArray(participant.gameId, gameIds))
    .groupBy(participant.gameId);
  return new Map(rows.map((row) => [row.gameId, row.players]));
}

export async function hostGames(db: Db, hostId: string): Promise<GameSummary[]> {
  const games = await db.select().from(game).where(eq(game.hostId, hostId)).orderBy(desc(game.startedAt)).limit(LIMIT);
  const players = await playerCounts(
    db,
    games.map((row) => row.id),
  );
  return games.map((row) => ({
    id: row.id,
    title: row.title,
    code: row.code,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    playerCount: players.get(row.id) ?? 0,
    questionsPlayed: row.questionsPlayed,
    questionCount: row.quizSnapshot.questions.length,
  }));
}

export async function hostGame(db: Db, hostId: string, id: string): Promise<GameDetail | null> {
  if (!UUID.test(id)) return null;
  const [row] = await db
    .select()
    .from(game)
    .where(and(eq(game.id, id), eq(game.hostId, hostId)));
  if (row === undefined) return null;

  const participants = await db.select().from(participant).where(eq(participant.gameId, id));
  const answers =
    participants.length === 0
      ? []
      : await db
          .select({ participantId: answer.participantId, questionIndex: answer.questionIndex, accepted: answer.accepted })
          .from(answer)
          .where(
            inArray(
              answer.participantId,
              participants.map((p) => p.id),
            ),
          );

  const standings = participants
    .map((p) => ({
      participantId: p.id,
      nickname: p.nickname,
      score: p.score,
      rank: p.rank,
      correct: answers.filter((a) => a.participantId === p.id && a.accepted).length,
    }))
    // Спершу за місцем; до фінішу місць немає, тоді за балами.
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || b.score - a.score || a.nickname.localeCompare(b.nickname));

  const questions = row.quizSnapshot.questions.slice(0, row.questionsPlayed).map((question, index) => {
    const given = answers.filter((a) => a.questionIndex === index);
    return {
      index,
      text: question.text,
      type: question.type,
      answered: given.length,
      accepted: given.filter((a) => a.accepted).length,
    };
  });

  return {
    id: row.id,
    title: row.title,
    code: row.code,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    questionsPlayed: row.questionsPlayed,
    questionCount: row.quizSnapshot.questions.length,
    standings,
    questions,
  };
}

export async function playerHistory(db: Db, userId: string): Promise<PlayedGame[]> {
  const rows = await db
    .select({ participant, game })
    .from(participant)
    .innerJoin(game, eq(participant.gameId, game.id))
    .where(eq(participant.userId, userId))
    .orderBy(desc(game.startedAt))
    .limit(LIMIT);
  if (rows.length === 0) return [];

  const players = await playerCounts(
    db,
    rows.map((row) => row.game.id),
  );
  const answers = await db
    .select({ participantId: answer.participantId, accepted: answer.accepted })
    .from(answer)
    .where(
      inArray(
        answer.participantId,
        rows.map((row) => row.participant.id),
      ),
    );

  return rows.map((row) => {
    const mine = answers.filter((a) => a.participantId === row.participant.id);
    return {
      gameId: row.game.id,
      title: row.game.title,
      status: row.game.status,
      startedAt: row.game.startedAt.toISOString(),
      nickname: row.participant.nickname,
      score: row.participant.score,
      rank: row.participant.rank,
      playerCount: players.get(row.game.id) ?? 0,
      correct: mine.filter((a) => a.accepted).length,
      answered: mine.length,
      questionsPlayed: row.game.questionsPlayed,
    };
  });
}
```

У `apps/server/src/account-routes.ts`:

- додати імпорт `import { hostGame, hostGames, playerHistory } from './history';`;
- змінити сигнатуру на `Promise<{ currentUser: (request: FastifyRequest) => Promise<CurrentUser | null> }>`;
- у `POST /api/games` змінити створення кімнати на `manager.create(quiz, hostUserId, saved.success ? saved.data.quizId : null)`;
- у кінець функції додати:

```ts
  app.get('/api/games', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    return hostGames(db, user.id);
  });

  app.get<WithId>('/api/games/:id', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const found = await hostGame(db, user.id, request.params.id);
    return found === null ? reply.code(404).send(NOT_FOUND) : found;
  });

  app.get('/api/me/history', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    return playerHistory(db, user.id);
  });

  return { currentUser };
```

У `apps/server/src/app.ts`: зберегти результат `const { currentUser } = await registerAccountRoutes(app, {…});` і в маршруті входу в гру замінити виклик `manager.join(request.params.code, body.data.nickname)` на:

```ts
    // Гравець з акаунтом потрапляє у власну історію ігор; без акаунта чи з простроченою сесією грає як гість.
    const account = await currentUser(request);
    const joined = manager.join(request.params.code, body.data.nickname, account?.id ?? null);
```

- [ ] **Step 3: Переконатися, що тести проходять**

Run: `pnpm test`
Expected: PASS, 342 тести (336 попередніх + 6 нових).

Run: `pnpm typecheck`
Expected: без помилок.

- [ ] **Step 4: Перевірити на справжній базі**

`pnpm db:up`, `pnpm start` (міграція `0001` застосовується під час запуску), зіграти гру через браузерний сценарій `host-flow.cjs` і запитом до `psql` переконатися, що в таблицях `game`, `participant`, `answer` з'явилися рядки; перезапустити сервер посеред іншої гри й перевірити статус `aborted`.

Expected: рядки є; незавершена гра після перезапуску має статус `aborted`.

- [ ] **Step 5: Оновити README і закомітити**

Додати до розділу «HTTP API» в `README.md`:

```markdown
- `GET /api/games` і `GET /api/games/:id`: історія ігор ведучого.
- `GET /api/me/history`: ігри, у яких гравець брав участь, увійшовши в акаунт.
```

```bash
git add apps/server README.md
git commit -m "feat(server): add game history for hosts and signed-in players"
```
