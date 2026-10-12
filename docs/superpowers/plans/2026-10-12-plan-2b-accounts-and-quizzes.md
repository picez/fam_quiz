# План 2б: акаунти та збережені вікторини — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ведучий реєструється й входить за email і паролем, зберігає вікторини в PostgreSQL і запускає гру зі збереженої вікторини.

**Architecture:** PostgreSQL через Drizzle ORM; у розробці база в Docker, у тестах PGlite (PostgreSQL у процесі, без Docker). Better Auth веде користувачів і сесії в cookie. Маршрути акаунта (`/api/auth/*`, `/api/me`, `/api/quizzes`, `/api/games`) живуть в окремому модулі й отримують базу, авторизацію та менеджер кімнат як залежності.

**Tech Stack:** PostgreSQL 17, Drizzle ORM + drizzle-kit, node-postgres, PGlite (тести), Better Auth з адаптером Drizzle, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-12-quiz-live-core-design.md`

## Місце в дорожній карті

План 2б поділено. **Цей документ**: база, вхід, CRUD вікторин, гра зі збереженої вікторини. **Далі план 3б**: екрани входу, списку вікторин і редактора. **Потім план 2в**: збереження результатів ігор, історія та статистика, вхід через Google, зображення.

## Global Constraints

- База доступна коду лише через тип `Db`; SQL поза Drizzle не пишеться.
- Вікторину бачить і змінює лише власник; чужа вікторина відповідає `404`, а не `403`, щоб не підтверджувати її існування.
- Тіло вікторини завжди перевіряється `quizSchema` з `@quiz/shared`.
- Паролі зберігає й перевіряє лише Better Auth; мінімальна довжина пароля 8 символів.
- Секрет сесій і адреса бази приходять зі змінних середовища; у репозиторії лежить тільки `.env.example`.
- Тести не потребують Docker і мережі: база в тестах створюється через `createTestDb()`.
- Міграції генеруються `drizzle-kit generate` і комітяться; сервер застосовує їх під час запуску.

## Відхилення від специфікації (свідомі)

- Запитання зберігаються в колонці `questions` (JSON) таблиці `quiz`, а не в окремій таблиці: вікторина завжди читається й записується цілою, а окрема таблиця знадобиться лише для банку запитань (підпроєкт 3).
- Ведучий і далі підключається до кімнати за токеном кімнати; сесія дає право отримати цей токен знову (`host-access`), тож пульт можна відкрити з іншого пристрою після входу.
- Створення гри без акаунта (вікторина в тілі запиту) тимчасово лишається, щоб поточний web-клієнт працював; його прибере план 3б.

## Review Focus

1. Ідентифікатор вікторини в адресі не є UUID (`/api/quizzes/abc`): відповідь `404`, а не помилка бази з `500`. Тест у завданні 3.
2. Реєстрація з email, який уже зайнято, і вхід із неправильним паролем дають `4xx` із тілом, а не `500`; пароль коротший за 8 символів відхиляється. Тест у завданні 2.
3. Користувач А не може прочитати, змінити, видалити вікторину користувача Б чи запустити з неї гру. Тести в завданнях 3 і 4.
4. Вікторину видалено, поки з неї триває гра: гра триває далі, бо кімната тримає власну копію. Тест у завданні 4.
5. Запит із простроченою або підробленою cookie сесії вважається неавторизованим (`401`), сервер не падає. Тест у завданні 2.

---

## Структура файлів

```
docker-compose.yml                    PostgreSQL для розробки
.env.example
apps/server/
  drizzle.config.ts
  drizzle/                            згенеровані міграції
  src/db/schema.ts                    таблиці Better Auth і quiz
  src/db/client.ts                    Db, connectDb()
  src/testing/test-db.ts              createTestDb() на PGlite
  src/testing/accounts.ts             signUp() для тестів
  src/auth.ts                         createAuth()
  src/quizzes.ts                      сховище вікторин
  src/account-routes.ts               /api/auth/*, /api/me, /api/quizzes, /api/games
  src/app.ts, src/main.ts             підключення
```

---

### Task 1: База даних

**Files:**
- Create: `docker-compose.yml`, `.env.example`
- Create: `apps/server/drizzle.config.ts`, `apps/server/src/db/schema.ts`, `apps/server/src/db/client.ts`, `apps/server/src/testing/test-db.ts`
- Create: `apps/server/drizzle/*` (згенеровано)
- Modify: `package.json` (скрипти `db:up`, `db:down`), `.gitignore`
- Test: `apps/server/src/db/schema.test.ts`

**Interfaces:**
- Consumes: `Question`, `QuizSettings` з `@quiz/shared`.
- Produces:
  - таблиці `user`, `session`, `account`, `verification`, `quiz`
  - `type Db`
  - `connectDb(url: string): Promise<{ db: Db; close: () => Promise<void> }>` (застосовує міграції)
  - `createTestDb(): Promise<Db>`

- [ ] **Step 1: Docker і залежності**

`docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: quiz
      POSTGRES_PASSWORD: quiz
      POSTGRES_DB: quiz
    ports:
      - "5433:5432"
    volumes:
      - quiz-postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U quiz -d quiz"]
      interval: 2s
      timeout: 3s
      retries: 20

volumes:
  quiz-postgres:
```

`.env.example`:

```
# Скопіюйте у .env і за потреби змініть.
DATABASE_URL=postgres://quiz:quiz@localhost:5433/quiz
# Довгий випадковий рядок; ним підписуються сесії.
BETTER_AUTH_SECRET=change-me-to-a-long-random-string
# Адреса, за якою відкривається застосунок.
BETTER_AUTH_URL=http://localhost:3000
# Додаткові адреси клієнта через кому (сервер розробки Vite).
TRUSTED_ORIGINS=http://localhost:5173
```

У кореневий `package.json` додати скрипти `"db:up": "docker compose up -d --wait"` і `"db:down": "docker compose down"`.

Run:

```bash
pnpm --filter @quiz/server add drizzle-orm pg better-auth @better-auth/drizzle-adapter
pnpm --filter @quiz/server add -D drizzle-kit @types/pg @electric-sql/pglite
```

- [ ] **Step 2: Написати тест, що падає**

`apps/server/src/db/schema.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { makeQuiz, single } from '@quiz/engine/testing';
import { createTestDb } from '../testing/test-db';
import { quiz, user } from './schema';

describe('database schema', () => {
  it('stores a quiz with its questions and settings and returns them unchanged', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'olena@example.com' });
    const source = makeQuiz([single]);

    const [created] = await db
      .insert(quiz)
      .values({ ownerId: 'u1', title: source.title, description: '', settings: source.settings, questions: source.questions })
      .returning();

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    const [loaded] = await db.select().from(quiz).where(eq(quiz.id, created.id));
    expect(loaded.questions).toEqual(source.questions);
    expect(loaded.settings).toEqual(source.settings);
  });

  it('removes a user’s quizzes together with the user', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'olena@example.com' });
    const source = makeQuiz([single]);
    await db.insert(quiz).values({ ownerId: 'u1', title: 'T', description: '', settings: source.settings, questions: source.questions });

    await db.delete(user).where(eq(user.id, 'u1'));
    expect(await db.select().from(quiz)).toEqual([]);
  });

  it('refuses two users with the same email', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'same@example.com' });
    await expect(db.insert(user).values({ id: 'u2', name: 'Тарас', email: 'same@example.com' })).rejects.toThrow();
  });
});
```

Run: `pnpm vitest run apps/server/src/db`
Expected: FAIL, модулі `../testing/test-db` і `./schema` не існують.

- [ ] **Step 3: Написати схему, клієнт і тестову базу**

`apps/server/src/db/schema.ts`:

```ts
import type { Question, QuizSettings } from '@quiz/shared';
import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const stamps = {
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  ...stamps,
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  ...stamps,
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  ...stamps,
});

export const quiz = pgTable('quiz', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  settings: jsonb('settings').$type<QuizSettings>().notNull(),
  questions: jsonb('questions').$type<Question[]>().notNull(),
  ...stamps,
});
```

`apps/server/src/db/client.ts`:

```ts
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import pg from 'pg';
import * as schema from './schema';

/** База, однакова для node-postgres у роботі та PGlite у тестах. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS = resolve(import.meta.dirname, '../../drizzle');

export async function connectDb(url: string): Promise<{ db: Db; close: () => Promise<void> }> {
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db: db as unknown as Db, close: () => pool.end() };
}
```

`apps/server/src/testing/test-db.ts`:

```ts
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { MIGRATIONS, type Db } from '../db/client';
import * as schema from '../db/schema';

/** Порожня база в пам'яті з усіма міграціями. */
export async function createTestDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Db;
}
```

`apps/server/drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
```

Run (з теки `apps/server`): `pnpm exec drizzle-kit generate --name init`
Expected: у `apps/server/drizzle/` з'явились SQL-файл міграції та `meta/`.

- [ ] **Step 4: Переконатися, що тести проходять**

Run: `pnpm test`
Expected: PASS, 227 тестів (224 попередніх + 3 нових).

Run: `pnpm typecheck`
Expected: без помилок.

- [ ] **Step 5: Перевірити на справжньому PostgreSQL**

Run: `pnpm db:up`, потім одноразовим скриптом викликати `connectDb('postgres://quiz:quiz@localhost:5433/quiz')` і виконати `select` з таблиці `quiz`.
Expected: контейнер у стані healthy, міграції застосовано, запит повертає порожній список.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .env.example package.json pnpm-lock.yaml .gitignore apps/server
git commit -m "feat(server): add PostgreSQL schema, migrations and database clients"
```

---

### Task 2: Вхід за email і паролем

**Files:**
- Create: `apps/server/src/auth.ts`, `apps/server/src/account-routes.ts`, `apps/server/src/testing/accounts.ts`
- Modify: `apps/server/src/app.ts` (опції `db`, `auth`; виклик `registerAccountRoutes`)
- Modify: `apps/server/src/app.test.ts`, `apps/server/src/socket.test.ts` (передати тестову базу в `buildApp`)
- Test: `apps/server/src/auth.test.ts`

**Interfaces:**
- Consumes: `Db`, `createTestDb` (завдання 1).
- Produces:
  - `createAuth(db: Db, options: AuthOptions): Auth`; `interface AuthOptions { secret: string; baseURL: string; trustedOrigins?: string[] }`
  - `buildApp(options: AppOptions)`, де `db: Db` і `auth: AuthOptions` тепер обов'язкові
  - `registerAccountRoutes(app, deps: { db; auth; manager; maxRooms })`
  - маршрути Better Auth під `/api/auth/*`: `POST /api/auth/sign-up/email` (`{ name, email, password }`), `POST /api/auth/sign-in/email` (`{ email, password }`), `POST /api/auth/sign-out` (`{}`)
  - `GET /api/me` → `200 { id, name, email }` або `401 { error: 'unauthorized' }`
  - `currentUser(request): Promise<{ id: string; name: string; email: string } | null>` усередині модуля маршрутів
  - тестові помічники: `TEST_AUTH: AuthOptions`, `signUp(app, name): Promise<{ cookie: string; email: string; password: string }>`

- [ ] **Step 1: Написати тест, що падає**

`apps/server/src/testing/accounts.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { AuthOptions } from '../auth';

export const TEST_AUTH: AuthOptions = {
  secret: 'test-secret-that-is-long-enough-for-signing-sessions',
  baseURL: 'http://localhost:3000',
};

/** Заголовок Cookie з відповіді, що встановила сесію. */
export function cookieOf(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [String(raw)];
  return list.map((cookie) => String(cookie).split(';')[0]).join('; ');
}

let counter = 0;

/** Реєструє нового користувача й повертає його cookie сесії. */
export async function signUp(app: FastifyInstance, name: string) {
  counter += 1;
  const email = `user${counter}-${Date.now()}@example.com`;
  const password = 'correct horse battery';
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { name, email, password },
  });
  if (response.statusCode !== 200) throw new Error(`sign-up failed: ${response.statusCode} ${response.body}`);
  return { cookie: cookieOf(response), email, password };
}
```

`apps/server/src/auth.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { TEST_AUTH, cookieOf, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

let ctx: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  ctx = await buildApp({ db: await createTestDb(), auth: TEST_AUTH });
});

afterAll(async () => {
  await ctx.app.close();
});

const me = (cookie?: string) =>
  ctx.app.inject({ method: 'GET', url: '/api/me', headers: cookie === undefined ? {} : { cookie } });

const post = (url: string, payload: object, cookie?: string) =>
  ctx.app.inject({ method: 'POST', url, payload, headers: cookie === undefined ? {} : { cookie } });

describe('accounts', () => {
  it('registers a user and recognises them by the session cookie', async () => {
    const { cookie, email } = await signUp(ctx.app, 'Олена');
    expect(cookie).not.toBe('');
    const response = await me(cookie);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: 'Олена', email });
    expect(response.json().id).toEqual(expect.any(String));
    expect(JSON.stringify(response.json())).not.toContain('password');
  });

  it('answers 401 without a session', async () => {
    const response = await me();
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthorized' });
  });

  it('treats a forged or garbage session cookie as no session', async () => {
    const { cookie } = await signUp(ctx.app, 'Олена');
    const forged = cookie.replace(/=(.{6})/, '=xxxxxx');
    expect((await me(forged)).statusCode).toBe(401);
    expect((await me('better-auth.session_token=garbage')).statusCode).toBe(401);
    expect((await me('a=%E0%A4%A')).statusCode).toBe(401);
  });

  it('signs in with the right password and refuses a wrong one', async () => {
    const { email, password } = await signUp(ctx.app, 'Тарас');

    const good = await post('/api/auth/sign-in/email', { email, password });
    expect(good.statusCode).toBe(200);
    expect((await me(cookieOf(good))).json()).toMatchObject({ email });

    const bad = await post('/api/auth/sign-in/email', { email, password: 'wrong password' });
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
    expect(bad.statusCode).toBeLessThan(500);
    expect(cookieOf(bad)).toBe('');
  });

  it('refuses a second account with the same email and a password that is too short', async () => {
    const { email } = await signUp(ctx.app, 'Олена');
    const duplicate = await post('/api/auth/sign-up/email', { name: 'Інша', email, password: 'correct horse battery' });
    expect(duplicate.statusCode).toBeGreaterThanOrEqual(400);
    expect(duplicate.statusCode).toBeLessThan(500);

    const short = await post('/api/auth/sign-up/email', { name: 'Ірина', email: 'short@example.com', password: '1234567' });
    expect(short.statusCode).toBeGreaterThanOrEqual(400);
    expect(short.statusCode).toBeLessThan(500);
  });

  it('ends the session on sign-out', async () => {
    const { cookie } = await signUp(ctx.app, 'Олена');
    const out = await post('/api/auth/sign-out', {}, cookie);
    expect(out.statusCode).toBe(200);
    expect((await me(cookie)).statusCode).toBe(401);
  });
});
```

Run: `pnpm vitest run apps/server/src/auth.test.ts`
Expected: FAIL, `buildApp` не приймає `db` і `auth`, маршрутів `/api/auth/*` і `/api/me` немає.

- [ ] **Step 2: Написати реалізацію**

`apps/server/src/auth.ts`:

```ts
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import type { Db } from './db/client';
import * as schema from './db/schema';

export interface AuthOptions {
  /** Секрет, яким підписуються сесії. */
  secret: string;
  /** Адреса, за якою відкривається застосунок. */
  baseURL: string;
  /** Інші адреси клієнта, з яких дозволено запити (наприклад, сервер розробки). */
  trustedOrigins?: string[];
}

export function createAuth(db: Db, options: AuthOptions) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: options.trustedOrigins ?? [],
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
  });
}

export type Auth = ReturnType<typeof createAuth>;
```

`apps/server/src/account-routes.ts`:

```ts
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Auth } from './auth';
import type { Db } from './db/client';
import type { RoomManager } from './rooms/manager';

export interface AccountDeps {
  db: Db;
  auth: Auth;
  manager: RoomManager;
  maxRooms: number;
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
}

export async function registerAccountRoutes(app: FastifyInstance, deps: AccountDeps): Promise<void> {
  const { auth } = deps;

  /** Користувач за cookie сесії або null. Зіпсована cookie не є помилкою сервера. */
  const currentUser = async (request: FastifyRequest): Promise<CurrentUser | null> => {
    try {
      const found = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
      return found === null ? null : { id: found.user.id, name: found.user.name, email: found.user.email };
    } catch {
      return null;
    }
  };

  // Better Auth працює зі стандартними Request і Response, тому запит Fastify перекладається туди й назад.
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
      const hasBody = request.method !== 'GET' && request.body !== undefined && request.body !== null;
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          body: hasBody ? JSON.stringify(request.body) : undefined,
        }),
      );
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });
      return reply.send(response.body === null ? null : await response.text());
    },
  });

  app.get('/api/me', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send({ error: 'unauthorized' });
    return user;
  });
}
```

У `apps/server/src/app.ts`:

- додати імпорти `import { registerAccountRoutes } from './account-routes';`, `import { createAuth, type AuthOptions } from './auth';`, `import type { Db } from './db/client';`;
- в `AppOptions` додати обов'язкові поля `db: Db;` і `auth: AuthOptions;`, змінити сигнатуру на `buildApp(options: AppOptions)` (без типового значення);
- після маршруту `/health` додати `await registerAccountRoutes(app, { db: options.db, auth: createAuth(options.db, options.auth), manager, maxRooms });`.

У `apps/server/src/app.test.ts` і `apps/server/src/socket.test.ts`: створювати базу один раз на файл (`let db: Db; beforeAll(async () => { db = await createTestDb(); });`) і передавати `db` та `auth: TEST_AUTH` у кожен виклик `buildApp`.

- [ ] **Step 3: Переконатися, що тести проходять**

Run: `pnpm test`
Expected: PASS, 233 тести (227 попередніх + 6 нових).

Run: `pnpm typecheck`
Expected: без помилок.

Якщо Better Auth відхиляє запити через перевірку заголовка `Origin` або модель таблиць відрізняється від схеми із завдання 1, виправити конфігурацію чи схему (з новою міграцією) і записати рішення в журнал.

- [ ] **Step 4: Commit**

```bash
git add apps/server pnpm-lock.yaml
git commit -m "feat(server): add email and password accounts with Better Auth"
```

---

### Task 3: Збережені вікторини

**Files:**
- Create: `apps/server/src/quizzes.ts`
- Modify: `apps/server/src/account-routes.ts` (маршрути `/api/quizzes`)
- Test: `apps/server/src/quizzes.test.ts`

**Interfaces:**
- Consumes: `Db`, таблиця `quiz` (завдання 1); `currentUser`, `signUp`, `TEST_AUTH` (завдання 2); `quizSchema`, `Quiz` з `@quiz/shared`.
- Produces:
  - `interface QuizSummary { id: string; title: string; description: string; questionCount: number; updatedAt: string }`
  - `listQuizzes(db, ownerId): Promise<QuizSummary[]>` (новіші першими)
  - `getQuiz(db, ownerId, id): Promise<Quiz | null>`
  - `createQuiz(db, ownerId, quiz): Promise<string>`
  - `updateQuiz(db, ownerId, id, quiz): Promise<boolean>`
  - `deleteQuiz(db, ownerId, id): Promise<boolean>`
  - `GET /api/quizzes` → `200 QuizSummary[]`; `POST /api/quizzes` → `201 { id }`; `GET /api/quizzes/:id` → `200 { id, ...quiz }`; `PUT /api/quizzes/:id` → `200 { id }`; `DELETE /api/quizzes/:id` → `204`
  - помилки: `401 unauthorized`, `400 invalid_payload`, `404 not_found`

- [ ] **Step 1: Написати тест, що падає**

`apps/server/src/quizzes.test.ts`:

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

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
const call = (method: Method, url: string, cookie?: string, payload?: object) =>
  ctx.app.inject({ method, url, payload, headers: cookie === undefined ? {} : { cookie } });

async function createQuiz(cookie: string, title = 'Географія') {
  const response = await call('POST', '/api/quizzes', cookie, { ...makeQuiz([single, text]), title });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

describe('quizzes', () => {
  it('requires a session for every route', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const responses = await Promise.all([
      call('GET', '/api/quizzes'),
      call('POST', '/api/quizzes', undefined, makeQuiz([single])),
      call('GET', `/api/quizzes/${id}`),
      call('PUT', `/api/quizzes/${id}`, undefined, makeQuiz([single])),
      call('DELETE', `/api/quizzes/${id}`),
    ]);
    for (const response of responses) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'unauthorized' });
    }
  });

  it('saves a quiz and returns it unchanged', async () => {
    const { cookie } = await signUp(ctx.app, 'Олена');
    const id = await createQuiz(cookie);
    const response = await call('GET', `/api/quizzes/${id}`, cookie);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id, ...makeQuiz([single, text]), title: 'Географія' });
  });

  it('lists the owner’s quizzes with question counts, newest first', async () => {
    const { cookie } = await signUp(ctx.app, 'Олена');
    const first = await createQuiz(cookie, 'Перша');
    const second = await createQuiz(cookie, 'Друга');
    await call('PUT', `/api/quizzes/${first}`, cookie, { ...makeQuiz([single]), title: 'Перша, оновлена' });

    const list = (await call('GET', '/api/quizzes', cookie)).json() as { id: string; title: string; questionCount: number }[];
    expect(list.map((item) => [item.id, item.title, item.questionCount])).toEqual([
      [first, 'Перша, оновлена', 1],
      [second, 'Друга', 2],
    ]);
  });

  it('updates and deletes a quiz', async () => {
    const { cookie } = await signUp(ctx.app, 'Олена');
    const id = await createQuiz(cookie);

    const updated = await call('PUT', `/api/quizzes/${id}`, cookie, { ...makeQuiz([text]), title: 'Нова назва' });
    expect(updated.statusCode).toBe(200);
    expect((await call('GET', `/api/quizzes/${id}`, cookie)).json()).toMatchObject({ title: 'Нова назва' });

    expect((await call('DELETE', `/api/quizzes/${id}`, cookie)).statusCode).toBe(204);
    expect((await call('GET', `/api/quizzes/${id}`, cookie)).statusCode).toBe(404);
    expect((await call('DELETE', `/api/quizzes/${id}`, cookie)).statusCode).toBe(404);
  });

  it('rejects an invalid quiz on create and on update', async () => {
    const { cookie } = await signUp(ctx.app, 'Олена');
    const id = await createQuiz(cookie);
    const invalid = { ...makeQuiz([single]), questions: [] };
    for (const response of [
      await call('POST', '/api/quizzes', cookie, invalid),
      await call('PUT', `/api/quizzes/${id}`, cookie, invalid),
    ]) {
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_payload' });
    }
  });

  it('hides one user’s quizzes from another user', async () => {
    const olena = await signUp(ctx.app, 'Олена');
    const taras = await signUp(ctx.app, 'Тарас');
    const id = await createQuiz(olena.cookie);

    expect((await call('GET', '/api/quizzes', taras.cookie)).json()).toEqual([]);
    expect((await call('GET', `/api/quizzes/${id}`, taras.cookie)).statusCode).toBe(404);
    expect((await call('PUT', `/api/quizzes/${id}`, taras.cookie, makeQuiz([single]))).statusCode).toBe(404);
    expect((await call('DELETE', `/api/quizzes/${id}`, taras.cookie)).statusCode).toBe(404);
    expect((await call('GET', `/api/quizzes/${id}`, olena.cookie)).statusCode).toBe(200);
  });

  it('answers 404 for an id that is not a UUID', async () => {
    const { cookie } = await signUp(ctx.app, 'Олена');
    for (const id of ['abc', '123', "1'; drop table quiz; --"]) {
      const response = await call('GET', `/api/quizzes/${encodeURIComponent(id)}`, cookie);
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'not_found' });
    }
  });
});
```

Run: `pnpm vitest run apps/server/src/quizzes.test.ts`
Expected: FAIL, маршрути `/api/quizzes` відповідають 404 для будь-якого запиту.

- [ ] **Step 2: Написати реалізацію**

`apps/server/src/quizzes.ts`:

```ts
import type { Quiz } from '@quiz/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { quiz } from './db/schema';

export interface QuizSummary {
  id: string;
  title: string;
  description: string;
  questionCount: number;
  updatedAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Умова «ця вікторина цього власника»; null, якщо id не може бути ідентифікатором. */
const owned = (ownerId: string, id: string) => (UUID.test(id) ? and(eq(quiz.id, id), eq(quiz.ownerId, ownerId)) : null);

export async function listQuizzes(db: Db, ownerId: string): Promise<QuizSummary[]> {
  const rows = await db.select().from(quiz).where(eq(quiz.ownerId, ownerId)).orderBy(desc(quiz.updatedAt));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    questionCount: row.questions.length,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function getQuiz(db: Db, ownerId: string, id: string): Promise<Quiz | null> {
  const where = owned(ownerId, id);
  if (where === null) return null;
  const [row] = await db.select().from(quiz).where(where);
  if (row === undefined) return null;
  return { title: row.title, description: row.description, settings: row.settings, questions: row.questions };
}

export async function createQuiz(db: Db, ownerId: string, data: Quiz): Promise<string> {
  const [row] = await db
    .insert(quiz)
    .values({ ownerId, title: data.title, description: data.description, settings: data.settings, questions: data.questions })
    .returning({ id: quiz.id });
  return row.id;
}

export async function updateQuiz(db: Db, ownerId: string, id: string, data: Quiz): Promise<boolean> {
  const where = owned(ownerId, id);
  if (where === null) return false;
  const rows = await db
    .update(quiz)
    .set({ title: data.title, description: data.description, settings: data.settings, questions: data.questions, updatedAt: new Date() })
    .where(where)
    .returning({ id: quiz.id });
  return rows.length > 0;
}

export async function deleteQuiz(db: Db, ownerId: string, id: string): Promise<boolean> {
  const where = owned(ownerId, id);
  if (where === null) return false;
  const rows = await db.delete(quiz).where(where).returning({ id: quiz.id });
  return rows.length > 0;
}
```

У `apps/server/src/account-routes.ts` додати імпорти `import { quizSchema } from '@quiz/shared';` та `import { createQuiz, deleteQuiz, getQuiz, listQuizzes, updateQuiz } from './quizzes';`, а в кінець функції `registerAccountRoutes`:

```ts
  const { db } = deps;
  const UNAUTHORIZED = { error: 'unauthorized' };
  const NOT_FOUND = { error: 'not_found' };
  const INVALID = { error: 'invalid_payload' };
  type WithId = { Params: { id: string } };

  app.get('/api/quizzes', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    return listQuizzes(db, user.id);
  });

  app.post('/api/quizzes', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const parsed = quizSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(INVALID);
    return reply.code(201).send({ id: await createQuiz(db, user.id, parsed.data) });
  });

  app.get<WithId>('/api/quizzes/:id', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const found = await getQuiz(db, user.id, request.params.id);
    if (found === null) return reply.code(404).send(NOT_FOUND);
    return { id: request.params.id, ...found };
  });

  app.put<WithId>('/api/quizzes/:id', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const parsed = quizSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(INVALID);
    const updated = await updateQuiz(db, user.id, request.params.id, parsed.data);
    return updated ? { id: request.params.id } : reply.code(404).send(NOT_FOUND);
  });

  app.delete<WithId>('/api/quizzes/:id', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const deleted = await deleteQuiz(db, user.id, request.params.id);
    return deleted ? reply.code(204).send() : reply.code(404).send(NOT_FOUND);
  });
```

- [ ] **Step 3: Переконатися, що тести проходять**

Run: `pnpm test`
Expected: PASS, 240 тестів (233 попередніх + 7 нових).

Run: `pnpm typecheck`
Expected: без помилок.

- [ ] **Step 4: Commit**

```bash
git add apps/server
git commit -m "feat(server): add saved quizzes owned by a user"
```

---

### Task 4: Гра зі збереженої вікторини

**Files:**
- Modify: `apps/server/src/rooms/manager.ts` (`Room.hostUserId`, параметр `create`)
- Modify: `apps/server/src/app.ts` (маршрут `POST /api/games` переїжджає в модуль акаунта)
- Modify: `apps/server/src/account-routes.ts`, `apps/server/src/main.ts`, `apps/server/package.json`, `README.md`
- Test: `apps/server/src/games.test.ts`

**Interfaces:**
- Consumes: `getQuiz` (завдання 3); `currentUser`; `RoomManager`.
- Produces:
  - `RoomManager.create(quiz: Quiz, hostUserId?: string | null): Room`; `Room.hostUserId: string | null`
  - `POST /api/games` з тілом `{ quizId }` (потрібна сесія) → `201 { gameId, code, hostToken, stageToken }`; `401 unauthorized`, `404 not_found`
  - `POST /api/games` з вікториною в тілі (без сесії, тимчасово) працює як раніше
  - `GET /api/games/by-code/:code/host-access` (сесія ведучого цієї гри) → `200 { hostToken, stageToken }`; інакше `404 { error: 'game_not_found' }`
  - `main.ts` читає `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `TRUSTED_ORIGINS` і завершується зі зрозумілим повідомленням, якщо перших двох немає

- [ ] **Step 1: Написати тест, що падає**

`apps/server/src/games.test.ts`:

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

type Method = 'GET' | 'POST' | 'DELETE';
const call = (method: Method, url: string, cookie?: string, payload?: object) =>
  ctx.app.inject({ method, url, payload, headers: cookie === undefined ? {} : { cookie } });

async function hostWithQuiz() {
  const account = await signUp(ctx.app, 'Олена');
  const created = await call('POST', '/api/quizzes', account.cookie, makeQuiz([single, text]));
  return { ...account, quizId: (created.json() as { id: string }).id };
}

describe('starting a game from a saved quiz', () => {
  it('creates a room with the saved quiz for its owner', async () => {
    const { cookie, quizId } = await hostWithQuiz();
    const response = await call('POST', '/api/games', cookie, { quizId });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { code: string; hostToken: string; stageToken: string };
    expect(body.code).toMatch(/^\d{6}$/);

    const room = ctx.manager.get(body.code);
    expect(room?.state.quiz.title).toBe('Тестова вікторина');
    expect(room?.state.quiz.questions).toHaveLength(2);
    expect(room?.hostUserId).toEqual(expect.any(String));
  });

  it('requires a session', async () => {
    const { quizId } = await hostWithQuiz();
    const response = await call('POST', '/api/games', undefined, { quizId });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthorized' });
  });

  it('does not start a game from another user’s quiz or an unknown one', async () => {
    const { quizId } = await hostWithQuiz();
    const stranger = await signUp(ctx.app, 'Тарас');
    for (const id of [quizId, '11111111-1111-4111-8111-111111111111', 'abc']) {
      const response = await call('POST', '/api/games', stranger.cookie, { quizId: id });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'not_found' });
    }
  });

  it('keeps a running game alive when its quiz is deleted', async () => {
    const { cookie, quizId } = await hostWithQuiz();
    const { code } = (await call('POST', '/api/games', cookie, { quizId })).json() as { code: string };
    expect((await call('DELETE', `/api/quizzes/${quizId}`, cookie)).statusCode).toBe(204);

    const room = ctx.manager.get(code);
    expect(room?.state.quiz.questions).toHaveLength(2);
    const joined = await call('POST', `/api/games/by-code/${code}/join`, undefined, { nickname: 'Гравець' });
    expect(joined.statusCode).toBe(201);
    if (room === undefined) throw new Error('room missing');
    expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
  });

  it('still accepts a quiz in the request body without a session', async () => {
    const response = await call('POST', '/api/games', undefined, makeQuiz([single]));
    expect(response.statusCode).toBe(201);
    expect(ctx.manager.get((response.json() as { code: string }).code)?.hostUserId).toBeNull();
  });

  it('rejects a body that is neither a quiz id nor a quiz', async () => {
    const { cookie } = await hostWithQuiz();
    const response = await call('POST', '/api/games', cookie, { quiz: 'none' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_payload' });
  });
});

describe('host access', () => {
  it('gives the host their room tokens again', async () => {
    const { cookie, quizId } = await hostWithQuiz();
    const created = (await call('POST', '/api/games', cookie, { quizId })).json() as {
      code: string;
      hostToken: string;
      stageToken: string;
    };
    const response = await call('GET', `/api/games/by-code/${created.code}/host-access`, cookie);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ hostToken: created.hostToken, stageToken: created.stageToken });
  });

  it('gives nothing to another user, to a visitor, or for an unknown code', async () => {
    const { cookie, quizId } = await hostWithQuiz();
    const { code } = (await call('POST', '/api/games', cookie, { quizId })).json() as { code: string };
    const stranger = await signUp(ctx.app, 'Тарас');

    for (const response of [
      await call('GET', `/api/games/by-code/${code}/host-access`, stranger.cookie),
      await call('GET', `/api/games/by-code/${code}/host-access`),
      await call('GET', '/api/games/by-code/000000x/host-access', cookie),
    ]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'game_not_found' });
      expect(response.body).not.toContain('Token');
    }
  });

  it('gives nothing for a game created without an account', async () => {
    const { cookie } = await hostWithQuiz();
    const { code } = (await call('POST', '/api/games', undefined, makeQuiz([single]))).json() as { code: string };
    expect((await call('GET', `/api/games/by-code/${code}/host-access`, cookie)).statusCode).toBe(404);
  });
});
```

Run: `pnpm vitest run apps/server/src/games.test.ts`
Expected: FAIL: `{ quizId }` відхиляється як `invalid_payload`, маршруту `host-access` немає.

- [ ] **Step 2: Написати реалізацію**

У `apps/server/src/rooms/manager.ts`: додати в `Room` поле `/** Акаунт ведучого; null для гри, створеної без входу. */ hostUserId: string | null;`, змінити сигнатуру на `create(quiz: Quiz, hostUserId: string | null = null): Room` і записати `hostUserId` в об'єкт кімнати.

З `apps/server/src/app.ts` видалити маршрут `app.post('/api/games', …)` разом із `CREATE_LIMIT` (переїжджають у модуль акаунта).

У `apps/server/src/account-routes.ts` додати імпорт `import { z } from 'zod';` (і залежність: `pnpm --filter @quiz/server add zod`) та в кінець `registerAccountRoutes`:

```ts
  const { manager, maxRooms } = deps;
  const CREATE_LIMIT = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };
  const fromSaved = z.object({ quizId: z.string().min(1).max(64) }).strict();

  app.post('/api/games', CREATE_LIMIT, async (request, reply) => {
    const saved = fromSaved.safeParse(request.body);
    let quiz;
    let hostUserId: string | null = null;

    if (saved.success) {
      const user = await currentUser(request);
      if (user === null) return reply.code(401).send(UNAUTHORIZED);
      quiz = await getQuiz(db, user.id, saved.data.quizId);
      if (quiz === null) return reply.code(404).send(NOT_FOUND);
      hostUserId = user.id;
    } else {
      // Тимчасово: гра без акаунта з вікториною в тілі запиту. Прибирається разом із переходом клієнта на акаунти.
      const inline = quizSchema.safeParse(request.body);
      if (!inline.success) return reply.code(400).send(INVALID);
      quiz = inline.data;
    }

    if (manager.size >= maxRooms) return reply.code(503).send({ error: 'server_busy' });
    const room = manager.create(quiz, hostUserId);
    return reply.code(201).send({
      gameId: room.id,
      code: room.code,
      hostToken: room.hostToken,
      stageToken: room.stageToken,
    });
  });

  app.get<{ Params: { code: string } }>('/api/games/by-code/:code/host-access', async (request, reply) => {
    const user = await currentUser(request);
    const room = manager.get(request.params.code);
    // Однакова відповідь для «немає гри» і «не ваша гра», щоб не підтверджувати існування коду.
    if (user === null || room === undefined || room.hostUserId !== user.id) {
      return reply.code(404).send({ error: 'game_not_found' });
    }
    return { hostToken: room.hostToken, stageToken: room.stageToken };
  });
```

`apps/server/src/main.ts` (повний вміст):

```ts
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildApp } from './app';
import { connectDb } from './db/client';

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    console.error(`Не задано змінну середовища ${name}. Скопіюйте .env.example у .env і заповніть її.`);
    process.exit(1);
  }
  return value;
}

const databaseUrl = required('DATABASE_URL');
const secret = required('BETTER_AUTH_SECRET');
const port = Number(process.env.PORT ?? 3000);
const built = resolve(import.meta.dirname, '../../web/dist');

const { db } = await connectDb(databaseUrl);
const { app } = await buildApp({
  db,
  auth: {
    secret,
    baseURL: process.env.BETTER_AUTH_URL ?? `http://localhost:${port}`,
    trustedOrigins: (process.env.TRUSTED_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean),
  },
  // За проксі (наприклад, на Render) задайте TRUST_PROXY=true, інакше всі клієнти ділять одне обмеження частоти.
  trustProxy: process.env.TRUST_PROXY === 'true',
  webRoot: existsSync(built) ? built : undefined,
});
await app.listen({ port, host: '0.0.0.0' });
console.log(`Quiz server is listening on port ${port}`);
```

У `apps/server/package.json` замінити скрипти, щоб сервер читав `.env` з кореня репозиторію:

```json
  "scripts": {
    "dev": "tsx watch --env-file-if-exists=../../.env src/main.ts",
    "start": "tsx --env-file-if-exists=../../.env src/main.ts"
  }
```

- [ ] **Step 3: Переконатися, що тести проходять**

Run: `pnpm test`
Expected: PASS, 249 тестів (240 попередніх + 9 нових).

Run: `pnpm typecheck`
Expected: без помилок.

- [ ] **Step 4: Перевірити на справжній базі**

Створити `.env` з `.env.example` (зі згенерованим секретом), `pnpm db:up`, `pnpm build`, `pnpm start`. Через `curl`: зареєструватися, зберегти вікторину, створити з неї гру, отримати `host-access`; перезапустити сервер і переконатися, що вхід і вікторина збереглися.

Expected: усі запити відповідають `2xx`; після перезапуску `GET /api/quizzes` повертає збережену вікторину.

- [ ] **Step 5: Оновити README**

Замінити розділ «Як зіграти локально» в `README.md`:

```markdown
## Як зіграти локально

Потрібен Docker (для бази даних).

    cp .env.example .env      # і впишіть власний BETTER_AUTH_SECRET
    pnpm install
    pnpm db:up                # PostgreSQL у Docker на порту 5433
    pnpm build
    pnpm start

Відкрийте http://localhost:3000/new на комп'ютері, створіть гру з готової
вікторини, натисніть «Відкрити сцену» для великого екрана. Гравці з телефонів
у тій самій мережі Wi-Fi заходять на адресу комп'ютера (наприклад,
http://192.168.0.10:3000) і вводять код гри або сканують QR-код зі сцени,
якщо сцену відкрито за цією ж адресою.

Під час розробки `pnpm dev` запускає сервер і клієнт із гарячим оновленням
на http://localhost:5173. Тести (`pnpm test`) бази в Docker не потребують.
```

І доповнити розділ «HTTP API»:

```markdown
Акаунти й вікторини (потрібна сесія, крім реєстрації та входу):

- `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`,
  `POST /api/auth/sign-out`, `GET /api/me`.
- `GET|POST /api/quizzes`, `GET|PUT|DELETE /api/quizzes/:id`.
- `POST /api/games` з `{ "quizId": "…" }` створює гру зі збереженої вікторини.
- `GET /api/games/by-code/:code/host-access` повертає ведучому токени його гри.
```

- [ ] **Step 6: Commit**

```bash
git add apps/server README.md pnpm-lock.yaml
git commit -m "feat(server): start games from saved quizzes and restore host access"
```
