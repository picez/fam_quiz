# План 3а: web-клієнт живої гри — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** У гру можна зіграти в браузері: ведучий створює кімнату з готової або завантаженої вікторини, виводить сцену на великий екран, керує з пульта, а гравці входять за кодом чи QR і відповідають з телефонів.

**Architecture:** `apps/web` на React + Vite. Три екрани (`PlayerScreen`, `StageScreen`, `HostScreen`) є чистими компонентами: отримують зріз стану з сервера й функцію `send`, тому тестуються без мережі. Сторінки підключають їх до хука `useGame`, який тримає сокет. Сервер віддає зібраний клієнт і додає до кожного зрізу ознаку присутності ведучого.

**Tech Stack:** React 19, Vite, React Router, socket.io-client, qrcode.react, шрифти Unbounded та Onest (локально через Fontsource), Vitest + Testing Library + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-12-quiz-live-core-design.md`

## Місце в дорожній карті

План 3 поділено на дві частини. **3а** (цей документ): екрани живої гри; вікторина береться з вбудованого прикладу або з JSON-файла. **3б** (після плану 2б): вхід в акаунт, список і редактор вікторин, історія та статистика.

## Global Constraints

- Пакет `@quiz/web` в `apps/web`, ESM.
- Екрани не звертаються до мережі й сховища напряму: лише пропси `view`, `send` та похідні.
- Усі тексти інтерфейсу українською, зібрані в `src/i18n.ts`; у компонентах немає рядків, які бачить користувач, поза словником.
- Візуальний напрям «Нічний ефір»: тло `#0E1020`, світло `#2A2F5C`, текст `#F5F1E6`, акцент `#FFB300`, правильна `#3DDCC0`, неправильна `#FF3D5A`; Unbounded для запитань, цифр і заголовків, Onest для решти.
- Варіанти позначаються літерами A–F; стан відповіді завжди дублюється текстом, а не лише кольором.
- Зони дотику на екрані гравця не менші за 48 px; поважати `prefers-reduced-motion`.
- Таймер рахується від серверного `endsAt` з поправкою годинника; клієнт нічого не вирішує про час.
- Тести компонентів починаються з рядка `// @vitest-environment jsdom`.

## Відхилення від специфікації (свідомі)

- Словник текстів є звичайним модулем, без i18next: друга мова ще не потрібна, а всі рядки вже в одному місці.
- Токен сцени передається у фрагменті адреси (`#token`), а не в параметрі запиту: фрагмент не потрапляє в журнали сервера.
- Редактора вікторин у цьому плані немає; він іде в план 3б разом зі збереженням.

## Review Focus

1. Числова відповідь з комою як десятковим розділювачем (`2061,5`, типова українська клавіатура) надсилається як число; нечислове введення не надсилається. Тест у завданні 3.
2. Телефон гравця заснув і годинник пристрою відстає чи поспішає: відлік збігається із серверним, а не стрибає в мінус. Тест у завданні 2.
3. Гравець оновив сторінку посеред запитання: він повертається в гру без повторного введення нікнейма й бачить уже надіслану відповідь. Тести в завданнях 2 і 3.
4. Завантажений JSON-файл не є вікториною (зіпсований або чужий): зрозуміле повідомлення, кімната не створюється. Тест у завданні 6.
5. Ведучий зник: гравці бачать «Чекаємо на ведучого», а не просто паузу. Тести в завданнях 1 і 3.

---

## Структура файлів

```
packages/shared/src/events.ts        StateMeta у події state
apps/server/src/rooms/manager.ts     hostOnline(), сповіщення про прихід і відхід ведучого
apps/server/src/socket.ts            передає StateMeta
apps/server/src/app.ts               віддає зібраний клієнт
apps/web/
  package.json, tsconfig.json, vite.config.ts, index.html
  src/main.tsx                       маршрути
  src/styles.css                     токени й компоненти «Нічного ефіру»
  src/i18n.ts                        словник, t(), errorText()
  src/clock.ts                       secondsLeft()
  src/storage.ts                     токени в localStorage
  src/api.ts                         HTTP-запити
  src/format.ts                      LETTERS, correctText(), answerText()
  src/demo-quiz.ts                   вбудована вікторина
  src/live/useGame.ts                сокет
  src/live/Timer.tsx                 табло відліку
  src/screens/AnswerInput.tsx        поле відповіді для шести типів
  src/screens/PlayerScreen.tsx
  src/screens/StageScreen.tsx
  src/screens/HostScreen.tsx
  src/screens/Standings.tsx
  src/pages/Home.tsx, NewGame.tsx, Play.tsx, Host.tsx, Stage.tsx
```

---

### Task 1: Сервер: присутність ведучого та роздача клієнта

**Files:**
- Modify: `packages/shared/src/events.ts`, `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`, `apps/server/src/app.ts`, `apps/server/src/main.ts`
- Test: `apps/server/src/rooms/manager.test.ts`, `apps/server/src/socket.test.ts`, `apps/server/src/app.test.ts` (додати тести в кінець)

**Interfaces:**
- Consumes: `RoomManager`, `attachSockets`, `buildApp` з плану 2а.
- Produces:
  - `interface StateMeta { serverNow: number; hostOnline: boolean }`; подія `state: (view: GameView, meta: StateMeta) => void`
  - `RoomManager.hostOnline(room: Room): boolean`; подія `changed`, коли ведучий відкриває перше або закриває останнє з'єднання
  - `buildApp({ webRoot?: string })`: якщо задано, віддає статичні файли з цієї теки, а на невідомі `GET` поза `/api` і `/socket.io` відповідає `index.html`; невідомі маршрути API дають `404 { error: 'not_found' }`

- [ ] **Step 1: Написати тести, що падають**

Додати в кінець `apps/server/src/rooms/manager.test.ts`:

```ts
describe('host presence', () => {
  it('reports whether the host has an open connection and announces changes', () => {
    const { manager, room, events } = setup();
    expect(manager.hostOnline(room)).toBe(false);

    manager.connect(room, HOST);
    expect(manager.hostOnline(room)).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'changed' });

    events.length = 0;
    manager.disconnect(room, HOST);
    expect(manager.hostOnline(room)).toBe(false);
    expect(events).toContainEqual({ type: 'changed' });
  });
});
```

Додати в кінець `apps/server/src/socket.test.ts`:

```ts
describe('host presence', () => {
  it('tells players when the host arrives and leaves', async () => {
    const game = await createGame();
    const joined = await join(game.code, 'Олена');
    const olena = open({ code: game.code, role: 'player', token: joined.token });
    const presence = (online: boolean) =>
      new Promise<void>((resolve) =>
        olena.socket.on('state', (_view, meta) => {
          if (meta.hostOnline === online) resolve();
        }),
      );

    await presence(false);
    const arrived = presence(true);
    const host = open({ code: game.code, role: 'host', token: game.hostToken });
    await arrived;

    const left = presence(false);
    host.socket.close();
    await left;
  });
});
```

Додати в кінець `apps/server/src/app.test.ts` (і два імпорти на початку файла: `import { mkdtempSync, writeFileSync } from 'node:fs';`, `import { tmpdir } from 'node:os';`, `import { join as joinPath } from 'node:path';`):

```ts
describe('serving the web client', () => {
  it('serves the client for page routes and JSON 404 for unknown API routes', async () => {
    const webRoot = mkdtempSync(joinPath(tmpdir(), 'quiz-web-'));
    writeFileSync(joinPath(webRoot, 'index.html'), '<!doctype html><title>quiz</title>');
    const served = await buildApp({ webRoot });

    const page = await served.app.inject({ method: 'GET', url: '/play/123456' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.body).toContain('<title>quiz</title>');

    const api = await served.app.inject({ method: 'GET', url: '/api/nothing' });
    expect(api.statusCode).toBe(404);
    expect(api.json()).toEqual({ error: 'not_found' });

    expect((await served.app.inject({ method: 'GET', url: '/health' })).json()).toEqual({ ok: true });
    await served.app.close();
  });

  it('answers JSON 404 for unknown routes when no client is configured', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/play/123456' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'not_found' });
  });
});
```

- [ ] **Step 2: Переконатися, що тести падають**

Run: `pnpm vitest run apps/server`
Expected: FAIL: `manager.hostOnline is not a function`, тайм-аут у тесті присутності, 404 без тіла `{ error: 'not_found' }`.

- [ ] **Step 3: Написати реалізацію**

Run: `pnpm --filter @quiz/server add @fastify/static`

У `packages/shared/src/events.ts` замінити інтерфейс `ServerToClientEvents`:

```ts
export interface StateMeta {
  /** Час сервера на момент надсилання, для поправки годинника клієнта. */
  serverNow: number;
  hostOnline: boolean;
}

export interface ServerToClientEvents {
  /** Повний зріз стану для ролі цього з'єднання. */
  state: (view: GameView, meta: StateMeta) => void;
  closed: (reason: CloseReason) => void;
}
```

У `apps/server/src/rooms/manager.ts` додати метод після `get size()`:

```ts
  hostOnline(room: Room): boolean {
    return (room.connections.get('host') ?? 0) > 0;
  }
```

У методі `connect` замінити блок ведучого:

```ts
    if (identity.role === 'host') {
      this.scheduler.clearTimeout(room.absence);
      room.absence = null;
      if (count === 1) this.emit(room, { type: 'changed' });
    }
```

У методі `disconnect` замінити останній рядок:

```ts
    if (identity.role === 'host') {
      this.hostLeft(room);
      this.emit(room, { type: 'changed' });
    }
```

У `apps/server/src/socket.ts` замінити функцію `push`:

```ts
  const push = (socket: GameSocket) => {
    const { room, identity } = socket.data;
    const view = manager.view(room, identity);
    if (view !== null) socket.emit('state', view, { serverNow: manager.now(), hostOnline: manager.hostOnline(room) });
  };
```

У `apps/server/src/app.ts`: додати імпорт `import fastifyStatic from '@fastify/static';`, поле `webRoot?: string;` з коментарем `/** Тека зі зібраним web-клієнтом. */` в `AppOptions`, а перед рядком `const io = attachSockets(app.server, manager);` вставити:

```ts
  if (options.webRoot !== undefined) await app.register(fastifyStatic, { root: options.webRoot });

  app.setNotFoundHandler((request, reply) => {
    const isPage =
      options.webRoot !== undefined &&
      request.method === 'GET' &&
      !request.url.startsWith('/api/') &&
      !request.url.startsWith('/socket.io/');
    // Маршрути сторінок обробляє клієнт, тому на них віддається та сама сторінка.
    if (isPage) return reply.sendFile('index.html');
    return reply.code(404).send({ error: 'not_found' });
  });
```

`apps/server/src/main.ts` (повний вміст):

```ts
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildApp } from './app';

const built = resolve(import.meta.dirname, '../../web/dist');

const { app } = await buildApp({
  // За проксі (наприклад, на Render) задайте TRUST_PROXY=true, інакше всі клієнти ділять одне обмеження частоти.
  trustProxy: process.env.TRUST_PROXY === 'true',
  webRoot: existsSync(built) ? built : undefined,
});
const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
console.log(`Quiz server is listening on port ${port}`);
```

- [ ] **Step 4: Переконатися, що тести проходять**

Run: `pnpm test`
Expected: PASS, 156 тестів (152 попередніх + 4 нових).

Run: `pnpm typecheck`
Expected: без помилок.

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/server pnpm-lock.yaml
git commit -m "feat(server): report host presence and serve the web client"
```

---

### Task 2: Каркас клієнта, словник, годинник, сховище

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`
- Create: `apps/web/src/i18n.ts`, `apps/web/src/clock.ts`, `apps/web/src/storage.ts`, `apps/web/src/vite-env.d.ts`
- Modify: `package.json` (скрипти `typecheck`, `build`, `dev`)
- Test: `apps/web/src/clock.test.ts`, `apps/web/src/storage.test.ts`, `apps/web/src/i18n.test.ts`

**Interfaces:**
- Consumes: нічого.
- Produces:
  - `t(key: TextKey, vars?: Record<string, string | number>): string`, `errorText(code: string): string`, `type TextKey`
  - `secondsLeft(view: { endsAt: number | null; remainingMs: number | null }, offsetMs: number, nowMs: number): number | null`
  - `loadHost(code): HostTokens | null`, `saveHost(code, tokens)`, `loadPlayer(code): string | null`, `savePlayer(code, token)`, `clearPlayer(code)`; `interface HostTokens { hostToken: string; stageToken: string }`

- [ ] **Step 1: Створити пакет**

`apps/web/package.json`:

```json
{
  "name": "@quiz/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

`apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

`apps/web/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});
```

`apps/web/index.html`:

```html
<!doctype html>
<html lang="uk">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0E1020" />
    <title>Вікторина</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/web/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

У кореневому `package.json` замінити блок `scripts`:

```json
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server && tsc -p apps/web",
    "build": "pnpm --filter @quiz/web build",
    "dev": "pnpm --parallel --filter @quiz/server --filter @quiz/web dev",
    "start": "pnpm --filter @quiz/server start"
  }
```

Run:

```bash
pnpm --filter @quiz/web add react react-dom react-router-dom socket.io-client qrcode.react @fontsource-variable/unbounded @fontsource-variable/onest
pnpm --filter @quiz/web add @quiz/shared --workspace
pnpm --filter @quiz/web add -D vite @vitejs/plugin-react @types/react @types/react-dom @testing-library/react jsdom
```

Expected: залежності встановлено без помилок.

- [ ] **Step 2: Написати тести, що падають**

`apps/web/src/clock.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { secondsLeft } from './clock';

const open = { endsAt: 1_020_000, remainingMs: null };

describe('secondsLeft', () => {
  it('is null when no question is running', () => {
    expect(secondsLeft({ endsAt: null, remainingMs: null }, 0, 1_000_000)).toBeNull();
  });

  it('counts whole seconds up to the deadline, rounding up', () => {
    expect(secondsLeft(open, 0, 1_000_000)).toBe(20);
    expect(secondsLeft(open, 0, 1_000_001)).toBe(20);
    expect(secondsLeft(open, 0, 1_019_001)).toBe(1);
    expect(secondsLeft(open, 0, 1_020_000)).toBe(0);
  });

  it('never goes below zero', () => {
    expect(secondsLeft(open, 0, 1_090_000)).toBe(0);
  });

  it('corrects a device clock that runs behind or ahead of the server', () => {
    // Годинник пристрою відстає на 30 с: offset = serverNow - deviceNow = +30 000.
    expect(secondsLeft(open, 30_000, 970_000)).toBe(20);
    // Годинник пристрою поспішає на 30 с.
    expect(secondsLeft(open, -30_000, 1_030_000)).toBe(20);
  });

  it('shows the frozen remaining time while paused', () => {
    expect(secondsLeft({ endsAt: null, remainingMs: 14_200 }, 0, 5)).toBe(15);
  });
});
```

`apps/web/src/storage.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { clearPlayer, loadHost, loadPlayer, saveHost, savePlayer } from './storage';

beforeEach(() => localStorage.clear());

describe('storage', () => {
  it('remembers a player token per game code', () => {
    savePlayer('123456', 'tok-a');
    savePlayer('654321', 'tok-b');
    expect(loadPlayer('123456')).toBe('tok-a');
    expect(loadPlayer('654321')).toBe('tok-b');
    expect(loadPlayer('000000')).toBeNull();
  });

  it('forgets a player token', () => {
    savePlayer('123456', 'tok-a');
    clearPlayer('123456');
    expect(loadPlayer('123456')).toBeNull();
  });

  it('remembers host and stage tokens together', () => {
    saveHost('123456', { hostToken: 'h', stageToken: 's' });
    expect(loadHost('123456')).toEqual({ hostToken: 'h', stageToken: 's' });
    expect(loadHost('000000')).toBeNull();
  });

  it('treats corrupted data as missing', () => {
    localStorage.setItem('quiz:host:123456', '{not json');
    localStorage.setItem('quiz:host:654321', '{"hostToken":1}');
    expect(loadHost('123456')).toBeNull();
    expect(loadHost('654321')).toBeNull();
  });
});
```

`apps/web/src/i18n.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { errorText, t } from './i18n';

describe('i18n', () => {
  it('substitutes variables', () => {
    expect(t('answeredOf', { answered: 7, total: 12 })).toBe('Відповіли 7 з 12');
  });

  it('explains known error codes and falls back for unknown ones', () => {
    expect(errorText('nickname_taken')).toBe('Таке ім’я вже зайняте. Виберіть інше.');
    expect(errorText('something_new')).toBe('Щось пішло не так. Спробуйте ще раз.');
  });
});
```

- [ ] **Step 3: Переконатися, що тести падають**

Run: `pnpm vitest run apps/web`
Expected: FAIL, модулі `./clock`, `./storage`, `./i18n` не існують.

- [ ] **Step 4: Написати реалізацію**

`apps/web/src/clock.ts`:

```ts
/**
 * Секунди до кінця запитання. offsetMs — різниця «час сервера мінус час пристрою»,
 * тож неточний годинник телефона не зсуває відлік.
 */
export function secondsLeft(
  view: { endsAt: number | null; remainingMs: number | null },
  offsetMs: number,
  nowMs: number,
): number | null {
  if (view.remainingMs !== null) return Math.ceil(view.remainingMs / 1000);
  if (view.endsAt === null) return null;
  return Math.max(0, Math.ceil((view.endsAt - (nowMs + offsetMs)) / 1000));
}
```

`apps/web/src/storage.ts`:

```ts
export interface HostTokens {
  hostToken: string;
  stageToken: string;
}

const key = (role: 'host' | 'player', code: string) => `quiz:${role}:${code}`;

function read(name: string): string | null {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}

function write(name: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(name);
    else localStorage.setItem(name, value);
  } catch {
    // Приватний режим або заповнене сховище: гра працює, але не переживе оновлення сторінки.
  }
}

export const loadPlayer = (code: string): string | null => read(key('player', code));
export const savePlayer = (code: string, token: string): void => write(key('player', code), token);
export const clearPlayer = (code: string): void => write(key('player', code), null);

export const saveHost = (code: string, tokens: HostTokens): void => write(key('host', code), JSON.stringify(tokens));

export function loadHost(code: string): HostTokens | null {
  const raw = read(key('host', code));
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { hostToken, stageToken } = parsed as Record<string, unknown>;
    return typeof hostToken === 'string' && typeof stageToken === 'string' ? { hostToken, stageToken } : null;
  } catch {
    return null;
  }
}
```

`apps/web/src/i18n.ts`:

```ts
const uk = {
  appName: 'Вікторина',
  // Головна
  joinTitle: 'Приєднатися до гри',
  codeLabel: 'Код гри',
  codeHint: 'Шість цифр з екрана ведучого',
  joinButton: 'Увійти',
  hostLink: 'Провести власну гру',
  checking: 'Перевіряємо…',
  // Вхід гравця
  nicknameLabel: 'Ваше ім’я',
  nicknameHint: 'Від 2 до 20 символів',
  enterGame: 'Увійти в гру',
  gameTitle: 'Гра «{title}»',
  // Нова гра
  newGameTitle: 'Нова гра',
  demoQuiz: 'Взяти готову вікторину',
  uploadQuiz: 'Завантажити вікторину з файла',
  uploadHint: 'Файл JSON у форматі вікторини',
  quizReady: '«{title}», запитань: {count}',
  createGame: 'Створити гру',
  creating: 'Створюємо…',
  badQuizFile: 'Цей файл не схожий на вікторину. Перевірте, що це JSON-файл вікторини.',
  // Спільне
  paused: 'Пауза',
  waitingHost: 'Чекаємо на ведучого',
  connecting: 'Підключаємося…',
  offline: 'Немає зв’язку. Пробуємо відновити…',
  questionOf: 'Запитання {index} з {total}',
  answeredOf: 'Відповіли {answered} з {total}',
  yes: 'Так',
  no: 'Ні',
  points: '{points} балів',
  place: '{rank} місце',
  // Гравець
  inLobby: 'Ви в грі. Чекаємо на старт.',
  submit: 'Відповісти',
  yourAnswer: 'Ваша відповідь',
  answerPlaceholder: 'Введіть відповідь',
  numberPlaceholder: 'Введіть число',
  answerSent: 'Відповідь прийнято',
  waitReveal: 'Чекаємо на правильну відповідь',
  timeUp: 'Час вийшов',
  resultCorrect: 'Правильно!',
  resultPartial: 'Частково правильно',
  resultWrong: 'Неправильно',
  resultNone: 'Ви не відповіли',
  earned: '+{points}',
  correctAnswer: 'Правильна відповідь: {answer}',
  moveUp: 'Перемістити вгору: {item}',
  moveDown: 'Перемістити вниз: {item}',
  yourPlace: 'Ваше місце: {rank} з {total}',
  gameOver: 'Гру завершено',
  kicked: 'Ведучий вилучив вас із гри.',
  gameGone: 'Цієї гри вже немає. Перевірте код або попросіть ведучого створити нову.',
  // Сцена
  joinAt: 'Заходьте на',
  joinCode: 'і введіть код',
  playersIn: 'У грі: {count}',
  noPlayersYet: 'Чекаємо на перших гравців',
  typeOnPhone: 'Введіть відповідь на телефоні',
  orderOnPhone: 'Розставте в правильному порядку на телефоні',
  leaderboard: 'Рейтинг',
  podium: 'Переможці',
  // Пульт
  hostTitle: 'Пульт ведучого',
  noHostAccess: 'На цьому пристрої немає доступу до пульта цієї гри. Створіть гру заново.',
  start: 'Почати гру',
  lock: 'Закрити запитання',
  reveal: 'Показати відповідь',
  next: 'Далі',
  nextQuestion: 'Наступне запитання',
  pause: 'Пауза',
  resume: 'Продовжити',
  end: 'Завершити гру',
  endConfirm: 'Завершити гру для всіх гравців?',
  stageLink: 'Відкрити сцену',
  joinLink: 'Посилання для гравців',
  players: 'Гравці',
  responses: 'Відповіді',
  noResponses: 'Ще ніхто не відповів',
  kick: 'Вилучити',
  accept: 'Зарахувати',
  reject: 'Відхилити',
  accepted: 'зараховано',
  rejected: 'не зараховано',
  changedByHost: 'змінено вручну',
  disconnected: 'немає зв’язку',
  phase_lobby: 'Лобі',
  phase_question: 'Запитання відкрите',
  phase_locked: 'Запитання закрите',
  phase_reveal: 'Відповідь показано',
  phase_leaderboard: 'Рейтинг',
  phase_finished: 'Гру завершено',
  // Помилки
  err_wrong_phase: 'Зараз цього зробити не можна.',
  err_paused: 'Гра на паузі.',
  err_not_found: 'Не знайдено.',
  err_no_players: 'Потрібен хоча б один гравець.',
  err_room_full: 'У кімнаті вже максимум гравців.',
  err_nickname_invalid: 'Ім’я має містити від 2 до 20 символів.',
  err_nickname_taken: 'Таке ім’я вже зайняте. Виберіть інше.',
  err_already_answered: 'Ви вже відповіли на це запитання.',
  err_time_over: 'Час на відповідь вийшов.',
  err_type_mismatch: 'Відповідь не підходить до цього запитання.',
  err_unauthorized: 'Немає доступу до цієї гри.',
  err_forbidden: 'Ця дія доступна лише ведучому.',
  err_invalid_payload: 'Некоректні дані.',
  err_game_not_found: 'Гру з таким кодом не знайдено. Перевірте код.',
  err_server_busy: 'Сервер перевантажений. Спробуйте за хвилину.',
  err_too_many: 'Забагато спроб. Зачекайте хвилину.',
  err_offline: 'Немає зв’язку із сервером.',
  err_unknown: 'Щось пішло не так. Спробуйте ще раз.',
} as const;

export type TextKey = keyof typeof uk;

export function t(key: TextKey, vars: Record<string, string | number> = {}): string {
  return uk[key].replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export function errorText(code: string): string {
  const key = `err_${code}`;
  return key in uk ? t(key as TextKey) : t('err_unknown');
}
```

- [ ] **Step 5: Переконатися, що тести проходять**

Run: `pnpm test`
Expected: PASS, 167 тестів (156 попередніх + 11 нових).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml apps/web
git commit -m "feat(web): scaffold client with dictionary, clock and token storage"
```

---

### Task 3: Екран гравця

**Files:**
- Create: `apps/web/src/format.ts`, `apps/web/src/live/types.ts`, `apps/web/src/live/Timer.tsx`
- Create: `apps/web/src/screens/AnswerInput.tsx`, `apps/web/src/screens/Standings.tsx`, `apps/web/src/screens/PlayerScreen.tsx`
- Test: `apps/web/src/screens/AnswerInput.test.tsx`, `apps/web/src/screens/PlayerScreen.test.tsx`, `apps/web/src/format.test.ts`

**Interfaces:**
- Consumes: `t`, `errorText` (завдання 2); `secondsLeft` (завдання 2); типи `PlayerView`, `PublicQuestion`, `Question`, `Answer`, `Standing`, `ClientToServerEvents` з `@quiz/shared`.
- Produces:
  - `LETTERS: readonly string[]`, `correctText(question: Question): string`, `answerText(answer: Answer, question: Question | null): string`
  - `type SendResult = { ok: true } | { ok: false; error: string }`, `type Send = (event: keyof ClientToServerEvents, payload?: unknown) => Promise<SendResult>`
  - `<Timer view offsetMs />`
  - `<AnswerInput question onSubmit />`
  - `<Standings standings highlightId? limit? />`
  - `<PlayerScreen view hostOnline offsetMs send />`

- [ ] **Step 1: Написати тести, що падають**

`apps/web/src/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Question } from '@quiz/shared';
import { answerText, correctText } from './format';

const base = { id: 'q', text: '?', imageUrl: null, timeLimit: 20, points: 1000 };
const options = [
  { id: 'a', text: 'Львів' },
  { id: 'b', text: 'Київ' },
  { id: 'c', text: 'Одеса' },
];
const single: Question = { ...base, type: 'single', options, correctId: 'b' };
const multi: Question = { ...base, type: 'multi', options, correctIds: ['a', 'c'] };
const bool: Question = { ...base, type: 'boolean', correct: false };
const text: Question = { ...base, type: 'text', accepted: ['Одеса', 'Одесса'] };
const numeric: Question = { ...base, type: 'numeric', correct: 2061, tolerance: 100 };
const order: Question = { ...base, type: 'order', items: options };

describe('correctText', () => {
  it('describes the correct answer of every question type', () => {
    expect(correctText(single)).toBe('B. Київ');
    expect(correctText(multi)).toBe('A. Львів, C. Одеса');
    expect(correctText(bool)).toBe('Ні');
    expect(correctText(text)).toBe('Одеса');
    expect(correctText(numeric)).toBe('2061 (± 100)');
    expect(correctText({ ...numeric, tolerance: 0 })).toBe('2061');
    expect(correctText(order)).toBe('Львів → Київ → Одеса');
  });
});

describe('answerText', () => {
  it('describes a player answer using the question options', () => {
    expect(answerText({ type: 'single', optionId: 'c' }, single)).toBe('Одеса');
    expect(answerText({ type: 'multi', optionIds: ['c', 'a'] }, multi)).toBe('Одеса, Львів');
    expect(answerText({ type: 'boolean', value: true }, bool)).toBe('Так');
    expect(answerText({ type: 'text', value: 'Адеса' }, text)).toBe('Адеса');
    expect(answerText({ type: 'numeric', value: 2000.5 }, numeric)).toBe('2000.5');
    expect(answerText({ type: 'order', itemIds: ['c', 'a', 'b'] }, order)).toBe('Одеса → Львів → Київ');
  });

  it('falls back to ids when the option is unknown or the question is missing', () => {
    expect(answerText({ type: 'single', optionId: 'zzz' }, single)).toBe('zzz');
    expect(answerText({ type: 'single', optionId: 'a' }, null)).toBe('a');
  });
});
```

`apps/web/src/screens/AnswerInput.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicQuestion } from '@quiz/shared';
import { AnswerInput } from './AnswerInput';

afterEach(cleanup);

const cities = [
  { id: 'a', text: 'Львів' },
  { id: 'b', text: 'Київ' },
  { id: 'c', text: 'Одеса' },
];

const question = (over: Partial<PublicQuestion>): PublicQuestion => ({
  type: 'single',
  text: 'Запитання',
  imageUrl: null,
  timeLimit: 20,
  points: 1000,
  choices: cities,
  ...over,
});

function setup(over: Partial<PublicQuestion>) {
  const onSubmit = vi.fn();
  render(<AnswerInput question={question(over)} onSubmit={onSubmit} />);
  return onSubmit;
}

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('AnswerInput', () => {
  it('single: sends the tapped option at once', () => {
    const onSubmit = setup({ type: 'single' });
    fireEvent.click(button(/Київ/));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'single', optionId: 'b' });
  });

  it('labels options with letters', () => {
    setup({ type: 'single' });
    expect(button(/Львів/).textContent).toContain('A');
    expect(button(/Одеса/).textContent).toContain('C');
  });

  it('multi: sends the selected options after confirmation', () => {
    const onSubmit = setup({ type: 'multi' });
    expect(button('Відповісти').disabled).toBe(true);

    fireEvent.click(button(/Львів/));
    fireEvent.click(button(/Одеса/));
    fireEvent.click(button(/Київ/));
    fireEvent.click(button(/Київ/));
    fireEvent.click(button('Відповісти'));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'multi', optionIds: ['a', 'c'] });
  });

  it('boolean: sends yes or no', () => {
    const onSubmit = setup({ type: 'boolean', choices: [] });
    fireEvent.click(button('Ні'));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'boolean', value: false });
  });

  it('text: sends the trimmed text and refuses an empty one', () => {
    const onSubmit = setup({ type: 'text', choices: [] });
    const input = screen.getByLabelText('Ваша відповідь');
    expect(button('Відповісти').disabled).toBe(true);

    fireEvent.change(input, { target: { value: '   ' } });
    expect(button('Відповісти').disabled).toBe(true);

    fireEvent.change(input, { target: { value: '  Одеса ' } });
    fireEvent.click(button('Відповісти'));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'text', value: 'Одеса' });
  });

  it('numeric: accepts a decimal comma and refuses text', () => {
    const onSubmit = setup({ type: 'numeric', choices: [] });
    const input = screen.getByLabelText('Ваша відповідь');

    fireEvent.change(input, { target: { value: 'багато' } });
    expect(button('Відповісти').disabled).toBe(true);

    fireEvent.change(input, { target: { value: ' 2061,5 ' } });
    fireEvent.click(button('Відповісти'));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'numeric', value: 2061.5 });
  });

  it('numeric: accepts a negative number and refuses an empty field', () => {
    const onSubmit = setup({ type: 'numeric', choices: [] });
    const input = screen.getByLabelText('Ваша відповідь');
    expect(button('Відповісти').disabled).toBe(true);
    fireEvent.change(input, { target: { value: '-12' } });
    fireEvent.click(button('Відповісти'));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'numeric', value: -12 });
  });

  it('order: sends the items in the order the player arranged', () => {
    const onSubmit = setup({ type: 'order' });
    fireEvent.click(button('Перемістити вниз: Львів'));
    fireEvent.click(button('Перемістити вгору: Одеса'));
    fireEvent.click(button('Відповісти'));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'order', itemIds: ['b', 'c', 'a'] });
  });

  it('order: cannot move the first item up or the last item down', () => {
    setup({ type: 'order' });
    expect(button('Перемістити вгору: Львів').disabled).toBe(true);
    expect(button('Перемістити вниз: Одеса').disabled).toBe(true);
  });
});
```

`apps/web/src/screens/PlayerScreen.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerView, Question } from '@quiz/shared';
import type { Send } from '../live/types';
import { PlayerScreen } from './PlayerScreen';

afterEach(cleanup);

const publicQuestion = {
  type: 'single' as const,
  text: 'Столиця України?',
  imageUrl: null,
  timeLimit: 20,
  points: 1000,
  choices: [
    { id: 'a', text: 'Львів' },
    { id: 'b', text: 'Київ' },
  ],
};

const fullQuestion: Question = {
  id: 'q1',
  type: 'single',
  text: 'Столиця України?',
  imageUrl: null,
  timeLimit: 20,
  points: 1000,
  options: publicQuestion.choices,
  correctId: 'b',
};

const me = { id: 'p1', nickname: 'Олена', score: 0, rank: null, answer: null, result: null };

const view = (over: Partial<PlayerView> = {}): PlayerView => ({
  role: 'player',
  phase: 'lobby',
  paused: false,
  questionIndex: -1,
  total: 2,
  question: null,
  endsAt: null,
  remainingMs: null,
  playerCount: 2,
  answeredCount: 0,
  me,
  reveal: null,
  standings: null,
  ...over,
});

const onQuestion = (over: Partial<PlayerView> = {}) =>
  view({ phase: 'question', questionIndex: 0, question: publicQuestion, endsAt: Date.now() + 20_000, ...over });

function show(current: PlayerView, options: { hostOnline?: boolean; send?: Send } = {}) {
  const send: Send = options.send ?? vi.fn(async () => ({ ok: true as const }));
  render(<PlayerScreen view={current} hostOnline={options.hostOnline ?? true} offsetMs={0} send={send} />);
  return send;
}

describe('PlayerScreen', () => {
  it('shows the nickname, the score and a waiting message in the lobby', () => {
    show(view({ me: { ...me, score: 1250 } }));
    expect(screen.getByText('Олена')).toBeTruthy();
    expect(screen.getByText('1250')).toBeTruthy();
    expect(screen.getByText('Ви в грі. Чекаємо на старт.')).toBeTruthy();
  });

  it('lets the player answer an open question', () => {
    const send = show(onQuestion());
    expect(screen.getByText('Столиця України?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Київ/ }));
    expect(send).toHaveBeenCalledWith('player:answer', { type: 'single', optionId: 'b' });
  });

  it('shows the answer already given instead of the input, also after a page reload', () => {
    show(onQuestion({ me: { ...me, answer: { type: 'single', optionId: 'b' } } }));
    expect(screen.getByText('Відповідь прийнято')).toBeTruthy();
    expect(screen.getByText(/Київ/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Львів/ })).toBeNull();
  });

  it('explains why an answer was refused', async () => {
    const send: Send = vi.fn(async () => ({ ok: false as const, error: 'time_over' }));
    show(onQuestion(), { send });
    fireEvent.click(screen.getByRole('button', { name: /Київ/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Час на відповідь вийшов.'));
  });

  it('says the game is paused, or that the host is away', () => {
    show(onQuestion({ paused: true, endsAt: null, remainingMs: 12_000 }));
    expect(screen.getByRole('status').textContent).toBe('Пауза');
    cleanup();

    show(onQuestion({ paused: true, endsAt: null, remainingMs: 12_000 }), { hostOnline: false });
    expect(screen.getByRole('status').textContent).toBe('Чекаємо на ведучого');
  });

  it('hides the input while paused', () => {
    show(onQuestion({ paused: true, endsAt: null, remainingMs: 12_000 }));
    expect(screen.queryByRole('button', { name: /Київ/ })).toBeNull();
  });

  it('waits for the reveal once the question is locked', () => {
    show(view({ phase: 'locked', questionIndex: 0, question: publicQuestion }));
    expect(screen.getByText('Чекаємо на правильну відповідь')).toBeTruthy();
  });

  it('shows a correct result with the points earned', () => {
    show(
      view({
        phase: 'reveal',
        questionIndex: 0,
        question: publicQuestion,
        reveal: fullQuestion,
        me: {
          ...me,
          score: 750,
          answer: { type: 'single', optionId: 'b' },
          result: { accepted: true, accuracy: 1, points: 750 },
        },
      }),
    );
    expect(screen.getByText('Правильно!')).toBeTruthy();
    expect(screen.getByText('+750')).toBeTruthy();
    expect(screen.getByText('Правильна відповідь: B. Київ')).toBeTruthy();
  });

  it('distinguishes a wrong answer, a partial one and no answer', () => {
    const reveal = { phase: 'reveal' as const, questionIndex: 0, question: publicQuestion, reveal: fullQuestion };

    show(view({ ...reveal, me: { ...me, result: { accepted: false, accuracy: 0, points: 0 } } }));
    expect(screen.getByText('Неправильно')).toBeTruthy();
    cleanup();

    show(view({ ...reveal, me: { ...me, result: { accepted: false, accuracy: 0.5, points: 500 } } }));
    expect(screen.getByText('Частково правильно')).toBeTruthy();
    expect(screen.getByText('+500')).toBeTruthy();
    cleanup();

    show(view(reveal));
    expect(screen.getByText('Ви не відповіли')).toBeTruthy();
  });

  it('shows the place on the leaderboard and at the end', () => {
    const standings = [
      { participantId: 'p2', nickname: 'Тарас', score: 900, totalTimeMs: 1, rank: 1 },
      { participantId: 'p1', nickname: 'Олена', score: 750, totalTimeMs: 1, rank: 2 },
    ];
    show(view({ phase: 'leaderboard', questionIndex: 0, standings, me: { ...me, score: 750, rank: 2 } }));
    expect(screen.getByText('Ваше місце: 2 з 2')).toBeTruthy();
    expect(screen.getByText('Тарас')).toBeTruthy();
    cleanup();

    show(view({ phase: 'finished', questionIndex: 1, standings, me: { ...me, score: 750, rank: 2 } }));
    expect(screen.getByText('Гру завершено')).toBeTruthy();
    expect(screen.getByText('Ваше місце: 2 з 2')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Переконатися, що тести падають**

Run: `pnpm vitest run apps/web`
Expected: FAIL, модулі `./format`, `./AnswerInput`, `./PlayerScreen` не існують.

- [ ] **Step 3: Написати реалізацію**

`apps/web/src/format.ts`:

```ts
import type { Answer, Question } from '@quiz/shared';
import { t } from './i18n';

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

const yesNo = (value: boolean) => t(value ? 'yes' : 'no');

function choicesOf(question: Question | null): { id: string; text: string }[] {
  if (question === null) return [];
  if (question.type === 'single' || question.type === 'multi') return question.options;
  return question.type === 'order' ? question.items : [];
}

/** Правильна відповідь словами, для розкриття та пульта. */
export function correctText(question: Question): string {
  switch (question.type) {
    case 'single':
    case 'multi': {
      const ids = question.type === 'single' ? [question.correctId] : question.correctIds;
      return question.options
        .map((option, index) => ({ option, letter: LETTERS[index] }))
        .filter(({ option }) => ids.includes(option.id))
        .map(({ option, letter }) => `${letter}. ${option.text}`)
        .join(', ');
    }
    case 'boolean':
      return yesNo(question.correct);
    case 'text':
      return question.accepted[0];
    case 'numeric':
      return question.tolerance > 0 ? `${question.correct} (± ${question.tolerance})` : String(question.correct);
    case 'order':
      return question.items.map((item) => item.text).join(' → ');
  }
}

/** Відповідь гравця словами. */
export function answerText(answer: Answer, question: Question | null): string {
  const choices = choicesOf(question);
  const name = (id: string) => choices.find((choice) => choice.id === id)?.text ?? id;
  switch (answer.type) {
    case 'single':
      return name(answer.optionId);
    case 'multi':
      return answer.optionIds.map(name).join(', ');
    case 'boolean':
      return yesNo(answer.value);
    case 'text':
      return answer.value;
    case 'numeric':
      return String(answer.value);
    case 'order':
      return answer.itemIds.map(name).join(' → ');
  }
}
```

`apps/web/src/live/types.ts`:

```ts
import type { ClientToServerEvents } from '@quiz/shared';

export type SendResult = { ok: true } | { ok: false; error: string };

/** Надсилає подію на сервер і чекає на підтвердження. */
export type Send = (event: keyof ClientToServerEvents, payload?: unknown) => Promise<SendResult>;
```

`apps/web/src/live/Timer.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { secondsLeft } from '../clock';

interface Props {
  view: { endsAt: number | null; remainingMs: number | null };
  offsetMs: number;
}

/** Табло відліку: кожна цифра на окремій пластині. */
export function Timer({ view, offsetMs }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const running = view.endsAt !== null;

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [running, view.endsAt]);

  const seconds = secondsLeft(view, offsetMs, now);
  if (seconds === null) return null;
  return (
    <div className="timer" role="timer" aria-label={String(seconds)}>
      {String(seconds)
        .padStart(2, '0')
        .split('')
        .map((digit, index) => (
          <span className="flap" key={index} aria-hidden="true">
            {digit}
          </span>
        ))}
    </div>
  );
}
```

`apps/web/src/screens/AnswerInput.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import type { Answer, Choice, PublicQuestion } from '@quiz/shared';
import { LETTERS } from '../format';
import { t } from '../i18n';

interface Props {
  question: PublicQuestion;
  onSubmit: (answer: Answer) => void;
}

function parseNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.').replace(/\s/g, '');
  if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function ChoiceButtons({ choices, picked, onPick }: { choices: Choice[]; picked: string[]; onPick: (id: string) => void }) {
  return (
    <div className="choices">
      {choices.map((choice, index) => (
        <button
          type="button"
          key={choice.id}
          className={picked.includes(choice.id) ? 'choice is-picked' : 'choice'}
          aria-pressed={picked.includes(choice.id)}
          onClick={() => onPick(choice.id)}
        >
          <span className="letter">{LETTERS[index]}</span>
          <span>{choice.text}</span>
        </button>
      ))}
    </div>
  );
}

function MultiInput({ question, onSubmit }: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => setPicked((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));
  // Порядок як у запитанні, а не як натискав гравець.
  const ordered = question.choices.map((choice) => choice.id).filter((id) => picked.includes(id));
  return (
    <>
      <ChoiceButtons choices={question.choices} picked={picked} onPick={toggle} />
      <button
        type="button"
        className="btn btn-primary"
        disabled={ordered.length === 0}
        onClick={() => onSubmit({ type: 'multi', optionIds: ordered })}
      >
        {t('submit')}
      </button>
    </>
  );
}

function TypedInput({ question, onSubmit }: Props) {
  const [raw, setRaw] = useState('');
  const numeric = question.type === 'numeric';
  const number = numeric ? parseNumber(raw) : null;
  const text = raw.trim();
  const ready = numeric ? number !== null : text !== '';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (numeric && number !== null) onSubmit({ type: 'numeric', value: number });
    else if (!numeric && text !== '') onSubmit({ type: 'text', value: text });
  };

  return (
    <form className="typed" onSubmit={submit}>
      <label className="field">
        <span>{t('yourAnswer')}</span>
        <input
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          inputMode={numeric ? 'decimal' : 'text'}
          placeholder={t(numeric ? 'numberPlaceholder' : 'answerPlaceholder')}
          maxLength={200}
          autoComplete="off"
          autoFocus
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={!ready}>
        {t('submit')}
      </button>
    </form>
  );
}

function OrderInput({ question, onSubmit }: Props) {
  const [items, setItems] = useState<Choice[]>(question.choices);
  const move = (index: number, step: -1 | 1) =>
    setItems((now) => {
      const next = [...now];
      [next[index], next[index + step]] = [next[index + step], next[index]];
      return next;
    });

  return (
    <>
      <ol className="order">
        {items.map((item, index) => (
          <li key={item.id}>
            <span className="letter">{index + 1}</span>
            <span className="order-text">{item.text}</span>
            <button
              type="button"
              className="btn btn-icon"
              aria-label={t('moveUp', { item: item.text })}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn btn-icon"
              aria-label={t('moveDown', { item: item.text })}
              disabled={index === items.length - 1}
              onClick={() => move(index, 1)}
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => onSubmit({ type: 'order', itemIds: items.map((item) => item.id) })}
      >
        {t('submit')}
      </button>
    </>
  );
}

export function AnswerInput({ question, onSubmit }: Props) {
  switch (question.type) {
    case 'single':
      return (
        <ChoiceButtons
          choices={question.choices}
          picked={[]}
          onPick={(optionId) => onSubmit({ type: 'single', optionId })}
        />
      );
    case 'boolean':
      return (
        <div className="choices">
          {[true, false].map((value) => (
            <button type="button" className="choice" key={String(value)} onClick={() => onSubmit({ type: 'boolean', value })}>
              <span>{t(value ? 'yes' : 'no')}</span>
            </button>
          ))}
        </div>
      );
    case 'multi':
      return <MultiInput question={question} onSubmit={onSubmit} />;
    case 'text':
    case 'numeric':
      return <TypedInput question={question} onSubmit={onSubmit} />;
    case 'order':
      return <OrderInput question={question} onSubmit={onSubmit} />;
  }
}
```

`apps/web/src/screens/Standings.tsx`:

```tsx
import type { Standing } from '@quiz/shared';

interface Props {
  standings: Standing[];
  highlightId?: string;
  limit?: number;
}

export function Standings({ standings, highlightId, limit }: Props) {
  const shown = limit === undefined ? standings : standings.slice(0, limit);
  return (
    <ol className="standings">
      {shown.map((row) => (
        <li key={row.participantId} className={row.participantId === highlightId ? 'is-me' : undefined}>
          <span className="rank">{row.rank}</span>
          <span className="name">{row.nickname}</span>
          <span className="score">{row.score}</span>
        </li>
      ))}
    </ol>
  );
}
```

`apps/web/src/screens/PlayerScreen.tsx`:

```tsx
import { useState } from 'react';
import type { Answer, PlayerView } from '@quiz/shared';
import { answerText, correctText } from '../format';
import { errorText, t } from '../i18n';
import { Timer } from '../live/Timer';
import type { Send } from '../live/types';
import { AnswerInput } from './AnswerInput';
import { Standings } from './Standings';

interface Props {
  view: PlayerView;
  hostOnline: boolean;
  offsetMs: number;
  send: Send;
}

function Result({ view }: { view: PlayerView }) {
  const { result } = view.me;
  const title =
    result === null
      ? t('resultNone')
      : result.accepted
        ? t('resultCorrect')
        : result.accuracy > 0
          ? t('resultPartial')
          : t('resultWrong');
  const tone = result === null || result.points === 0 ? 'is-wrong' : 'is-correct';
  return (
    <section className={`result ${tone}`}>
      <h2>{title}</h2>
      {result !== null && result.points > 0 && <p className="earned">{t('earned', { points: result.points })}</p>}
      {view.reveal !== null && <p>{t('correctAnswer', { answer: correctText(view.reveal) })}</p>}
    </section>
  );
}

export function PlayerScreen({ view, hostOnline, offsetMs, send }: Props) {
  const [error, setError] = useState<string | null>(null);
  const { me, phase, question } = view;

  const submit = async (answer: Answer) => {
    const result = await send('player:answer', answer);
    setError(result.ok ? null : errorText(result.error));
  };

  const place = me.rank !== null && <p className="place">{t('yourPlace', { rank: me.rank, total: view.playerCount })}</p>;

  return (
    <main className="app player">
      <header className="bar">
        <span>{me.nickname}</span>
        <strong className="score">{me.score}</strong>
      </header>

      {view.paused && (
        <p className="banner" role="status">
          {t(hostOnline ? 'paused' : 'waitingHost')}
        </p>
      )}

      {phase === 'lobby' && <p className="lead">{t('inLobby')}</p>}

      {phase === 'question' && question !== null && (
        <>
          <div className="question-head">
            <p className="meta">{t('questionOf', { index: view.questionIndex + 1, total: view.total })}</p>
            <Timer view={view} offsetMs={offsetMs} />
          </div>
          <h1 className="question">{question.text}</h1>
          {question.imageUrl !== null && <img className="question-image" src={question.imageUrl} alt="" />}
          {me.answer !== null ? (
            <section className="sent">
              <h2>{t('answerSent')}</h2>
              <p>{pickedText(me.answer, question.choices)}</p>
            </section>
          ) : (
            !view.paused && <AnswerInput key={view.questionIndex} question={question} onSubmit={submit} />
          )}
        </>
      )}

      {phase === 'locked' && (
        <>
          <h1 className="question">{question?.text}</h1>
          <p className="lead">{t('waitReveal')}</p>
        </>
      )}

      {phase === 'reveal' && (
        <>
          <h1 className="question">{question?.text}</h1>
          <Result view={view} />
        </>
      )}

      {phase === 'leaderboard' && view.standings !== null && (
        <>
          {place}
          <Standings standings={view.standings} highlightId={me.id} limit={5} />
        </>
      )}

      {phase === 'finished' && (
        <>
          <h1 className="question">{t('gameOver')}</h1>
          {place}
          {view.standings !== null && <Standings standings={view.standings} highlightId={me.id} />}
        </>
      )}

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}

/** Власна відповідь словами: назви варіантів беруться з показаного запитання. */
function pickedText(answer: Answer, choices: { id: string; text: string }[]): string {
  const name = (id: string) => choices.find((choice) => choice.id === id)?.text ?? id;
  switch (answer.type) {
    case 'single':
      return name(answer.optionId);
    case 'multi':
      return answer.optionIds.map(name).join(', ');
    case 'order':
      return answer.itemIds.map(name).join(' → ');
    default:
      return answerText(answer, null);
  }
}
```

- [ ] **Step 4: Переконатися, що тести проходять**

Run: `pnpm test`
Expected: PASS, 189 тестів (167 попередніх + 22 нових).

Run: `pnpm typecheck`
Expected: без помилок.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add player screen with answer inputs for every question type"
```

---

### Task 4: Сцена

**Files:**
- Create: `apps/web/src/screens/StageScreen.tsx`
- Test: `apps/web/src/screens/StageScreen.test.tsx`

**Interfaces:**
- Consumes: `Timer`, `Standings`, `LETTERS`, `correctText`, `t` (завдання 2, 3); `StageView` з `@quiz/shared`; `QRCodeSVG` з `qrcode.react`.
- Produces: `<StageScreen view code joinUrl offsetMs hostOnline />`, де `joinUrl` є повною адресою входу гравця.

- [ ] **Step 1: Написати тест, що падає**

`apps/web/src/screens/StageScreen.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Question, StageView } from '@quiz/shared';
import { StageScreen } from './StageScreen';

afterEach(cleanup);

const choices = [
  { id: 'a', text: 'Львів' },
  { id: 'b', text: 'Київ' },
];
const question = { type: 'single' as const, text: 'Столиця України?', imageUrl: null, timeLimit: 20, points: 1000, choices };
const full: Question = { id: 'q1', type: 'single', text: question.text, imageUrl: null, timeLimit: 20, points: 1000, options: choices, correctId: 'b' };

const view = (over: Partial<StageView> = {}): StageView => ({
  role: 'stage',
  phase: 'lobby',
  paused: false,
  questionIndex: -1,
  total: 3,
  question: null,
  endsAt: null,
  remainingMs: null,
  playerCount: 0,
  answeredCount: 0,
  players: [],
  reveal: null,
  stats: null,
  standings: null,
  ...over,
});

const show = (current: StageView, hostOnline = true) =>
  render(
    <StageScreen view={current} code="123456" joinUrl="http://quiz.test/play/123456" offsetMs={0} hostOnline={hostOnline} />,
  );

describe('StageScreen', () => {
  it('invites players with the address and the code split for reading aloud', () => {
    show(view());
    expect(screen.getByText('quiz.test')).toBeTruthy();
    expect(screen.getByText('123 456')).toBeTruthy();
    expect(screen.getByText('Чекаємо на перших гравців')).toBeTruthy();
  });

  it('lists the players who joined', () => {
    show(
      view({
        playerCount: 2,
        players: [
          { id: 'p1', nickname: 'Олена', connected: true },
          { id: 'p2', nickname: 'Тарас', connected: false },
        ],
      }),
    );
    expect(screen.getByText('У грі: 2')).toBeTruthy();
    expect(screen.getByText('Олена')).toBeTruthy();
    expect(screen.getByText('Тарас')).toBeTruthy();
  });

  it('shows the question with lettered options and the answer count', () => {
    show(view({ phase: 'question', questionIndex: 0, question, endsAt: Date.now() + 20_000, playerCount: 12, answeredCount: 7 }));
    expect(screen.getByText('Столиця України?')).toBeTruthy();
    expect(screen.getByText('Запитання 1 з 3')).toBeTruthy();
    expect(screen.getByText('Відповіли 7 з 12')).toBeTruthy();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['AЛьвів', 'BКиїв']);
    expect(screen.getByRole('timer')).toBeTruthy();
  });

  it('tells players to type on their phones for a text question', () => {
    show(view({ phase: 'question', questionIndex: 0, question: { ...question, type: 'text', choices: [] } }));
    expect(screen.getByText('Введіть відповідь на телефоні')).toBeTruthy();
  });

  it('marks the correct option and shows vote counts on reveal', () => {
    show(
      view({
        phase: 'reveal',
        questionIndex: 0,
        question,
        reveal: full,
        stats: { answered: 3, accepted: 2, counts: { a: 1, b: 2 } },
      }),
    );
    const items = screen.getAllByRole('listitem');
    expect(items[1].className).toContain('is-correct');
    expect(items[0].className).not.toContain('is-correct');
    expect(items[1].textContent).toContain('2');
    expect(screen.getByText('Правильна відповідь: B. Київ')).toBeTruthy();
  });

  it('shows the leaderboard and the final podium', () => {
    const standings = [
      { participantId: 'p1', nickname: 'Олена', score: 900, totalTimeMs: 1, rank: 1 },
      { participantId: 'p2', nickname: 'Тарас', score: 400, totalTimeMs: 1, rank: 2 },
    ];
    show(view({ phase: 'leaderboard', questionIndex: 0, standings }));
    expect(screen.getByText('Рейтинг')).toBeTruthy();
    expect(screen.getByText('Олена')).toBeTruthy();
    cleanup();

    show(view({ phase: 'finished', questionIndex: 2, standings }));
    expect(screen.getByText('Переможці')).toBeTruthy();
    expect(screen.getByText('900')).toBeTruthy();
  });

  it('says the game is paused, or that the host is away', () => {
    show(view({ phase: 'question', questionIndex: 0, question, paused: true, remainingMs: 9000 }));
    expect(screen.getByRole('status').textContent).toBe('Пауза');
    cleanup();

    show(view({ phase: 'question', questionIndex: 0, question, paused: true, remainingMs: 9000 }), false);
    expect(screen.getByRole('status').textContent).toBe('Чекаємо на ведучого');
  });
});
```

- [ ] **Step 2: Переконатися, що тест падає**

Run: `pnpm vitest run apps/web/src/screens/StageScreen.test.tsx`
Expected: FAIL, модуль `./StageScreen` не існує.

- [ ] **Step 3: Написати реалізацію**

`apps/web/src/screens/StageScreen.tsx`:

```tsx
import { QRCodeSVG } from 'qrcode.react';
import type { StageView } from '@quiz/shared';
import { LETTERS, correctText } from '../format';
import { t } from '../i18n';
import { Timer } from '../live/Timer';
import { Standings } from './Standings';

interface Props {
  view: StageView;
  code: string;
  /** Повна адреса входу гравця; з неї будується QR-код. */
  joinUrl: string;
  offsetMs: number;
  hostOnline: boolean;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function Lobby({ view, code, joinUrl }: Pick<Props, 'view' | 'code' | 'joinUrl'>) {
  return (
    <div className="stage-lobby">
      <div className="invite">
        <p className="meta">{t('joinAt')}</p>
        <p className="address">{hostOf(joinUrl)}</p>
        <p className="meta">{t('joinCode')}</p>
        <p className="code">{`${code.slice(0, 3)} ${code.slice(3)}`}</p>
      </div>
      <div className="qr">
        <QRCodeSVG value={joinUrl} size={256} bgColor="#F5F1E6" fgColor="#0E1020" marginSize={2} />
      </div>
      <div className="roster">
        <p className="meta">{view.playerCount === 0 ? t('noPlayersYet') : t('playersIn', { count: view.playerCount })}</p>
        <ul className="chips">
          {view.players.map((player) => (
            <li key={player.id} className={player.connected ? undefined : 'is-away'}>
              {player.nickname}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Question({ view, offsetMs }: Pick<Props, 'view' | 'offsetMs'>) {
  const { question, reveal, stats } = view;
  if (question === null) return null;
  const correctIds =
    reveal === null
      ? []
      : reveal.type === 'single'
        ? [reveal.correctId]
        : reveal.type === 'multi'
          ? reveal.correctIds
          : [];
  const showChoices = question.type === 'single' || question.type === 'multi';
  const hint = question.type === 'order' ? t('orderOnPhone') : showChoices || question.type === 'boolean' ? null : t('typeOnPhone');

  return (
    <div className="stage-question">
      <header className="bar">
        <span>{t('questionOf', { index: view.questionIndex + 1, total: view.total })}</span>
        <span>{t('answeredOf', { answered: view.answeredCount, total: view.playerCount })}</span>
      </header>
      <div className="stage-main">
        <h1 className="question">{question.text}</h1>
        {view.phase === 'question' && <Timer view={view} offsetMs={offsetMs} />}
      </div>
      {question.imageUrl !== null && <img className="question-image" src={question.imageUrl} alt="" />}
      {showChoices && (
        <ul className="choices">
          {question.choices.map((choice, index) => (
            <li key={choice.id} className={correctIds.includes(choice.id) ? 'choice is-correct' : 'choice'}>
              <span className="letter">{LETTERS[index]}</span>
              <span>{choice.text}</span>
              {stats !== null && <span className="count">{stats.counts[choice.id] ?? 0}</span>}
            </li>
          ))}
        </ul>
      )}
      {reveal === null && hint !== null && <p className="lead">{hint}</p>}
      {reveal !== null && <p className="lead answer">{t('correctAnswer', { answer: correctText(reveal) })}</p>}
    </div>
  );
}

export function StageScreen({ view, code, joinUrl, offsetMs, hostOnline }: Props) {
  const { phase, standings } = view;
  return (
    <main className="app stage">
      {view.paused && (
        <p className="banner" role="status">
          {t(hostOnline ? 'paused' : 'waitingHost')}
        </p>
      )}
      {phase === 'lobby' && <Lobby view={view} code={code} joinUrl={joinUrl} />}
      {(phase === 'question' || phase === 'locked' || phase === 'reveal') && <Question view={view} offsetMs={offsetMs} />}
      {(phase === 'leaderboard' || phase === 'finished') && standings !== null && (
        <div className={phase === 'finished' ? 'stage-board is-final' : 'stage-board'}>
          <h1 className="question">{t(phase === 'finished' ? 'podium' : 'leaderboard')}</h1>
          <Standings standings={standings} limit={phase === 'finished' ? undefined : 8} />
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Переконатися, що тести проходять**

Run: `pnpm test`
Expected: PASS, 196 тестів (189 попередніх + 7 нових).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add stage screen with lobby, question, reveal and standings"
```

---

### Task 5: Пульт ведучого

**Files:**
- Create: `apps/web/src/screens/HostScreen.tsx`
- Test: `apps/web/src/screens/HostScreen.test.tsx`

**Interfaces:**
- Consumes: `Send` (завдання 3); `answerText`, `correctText`, `t`, `errorText`; `Standings`; `HostView` з `@quiz/shared`.
- Produces: `<HostScreen view code stageUrl joinUrl send />`.

Головна дія етапу одна: лобі → «Почати гру» (`host:start`), запитання → «Закрити запитання» (`host:lock`), закрите → «Показати відповідь» (`host:next`), розкриття → «Далі» (`host:next`), рейтинг → «Наступне запитання» (`host:next`). Ручне зарахування показується лише для текстових запитань на етапі розкриття.

- [ ] **Step 1: Написати тест, що падає**

`apps/web/src/screens/HostScreen.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostView, Question } from '@quiz/shared';
import type { Send } from '../live/types';
import { HostScreen } from './HostScreen';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const options = [
  { id: 'a', text: 'Львів' },
  { id: 'b', text: 'Київ' },
];
const single: Question = { id: 'q1', type: 'single', text: 'Столиця України?', imageUrl: null, timeLimit: 20, points: 1000, options, correctId: 'b' };
const textQuestion: Question = { id: 'q2', type: 'text', text: 'Перлина біля моря?', imageUrl: null, timeLimit: 20, points: 1000, accepted: ['Одеса'] };
const publicOf = (q: Question) => ({ type: q.type, text: q.text, imageUrl: null, timeLimit: 20, points: 1000, choices: q.type === 'single' ? options : [] });

const players = [
  { id: 'p1', nickname: 'Олена', connected: true, score: 750 },
  { id: 'p2', nickname: 'Тарас', connected: false, score: 0 },
];

const view = (over: Partial<HostView> = {}): HostView => ({
  role: 'host',
  phase: 'lobby',
  paused: false,
  questionIndex: -1,
  total: 2,
  question: null,
  endsAt: null,
  remainingMs: null,
  playerCount: 2,
  answeredCount: 0,
  players,
  correct: null,
  responses: [],
  standings: [],
  ...over,
});

const during = (phase: HostView['phase'], q: Question, over: Partial<HostView> = {}) =>
  view({ phase, questionIndex: 0, question: publicOf(q), correct: q, ...over });

function show(current: HostView, send: Send = vi.fn(async () => ({ ok: true as const }))) {
  render(
    <HostScreen
      view={current}
      code="123456"
      stageUrl="http://quiz.test/stage/123456#s"
      joinUrl="http://quiz.test/play/123456"
      send={send}
    />,
  );
  return send;
}

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('HostScreen', () => {
  it('shows the code, the players and their connection state in the lobby', () => {
    show(view());
    expect(screen.getByText('123 456')).toBeTruthy();
    expect(screen.getByText('Олена')).toBeTruthy();
    expect(screen.getByText(/немає зв’язку/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href')).toBe('http://quiz.test/stage/123456#s');
  });

  it('starts the game, and cannot start without players', () => {
    const send = show(view());
    fireEvent.click(button('Почати гру'));
    expect(send).toHaveBeenCalledWith('host:start', undefined);
    cleanup();

    show(view({ players: [], playerCount: 0 }));
    expect(button('Почати гру').disabled).toBe(true);
  });

  it('offers exactly one main action for each phase', () => {
    const cases: [HostView, string, string][] = [
      [during('question', single), 'Закрити запитання', 'host:lock'],
      [during('locked', single), 'Показати відповідь', 'host:next'],
      [during('reveal', single), 'Далі', 'host:next'],
      [view({ phase: 'leaderboard', questionIndex: 0 }), 'Наступне запитання', 'host:next'],
    ];
    for (const [current, label, event] of cases) {
      const send = show(current);
      fireEvent.click(button(label));
      expect(send).toHaveBeenCalledWith(event, undefined);
      cleanup();
    }
  });

  it('shows the correct answer to the host while the question is open', () => {
    show(during('question', single));
    expect(screen.getByText('Правильна відповідь: B. Київ')).toBeTruthy();
  });

  it('pauses and resumes', () => {
    const send = show(during('question', single));
    fireEvent.click(button('Пауза'));
    expect(send).toHaveBeenCalledWith('host:pause', undefined);
    cleanup();

    const paused = show(during('question', single, { paused: true }));
    fireEvent.click(button('Продовжити'));
    expect(paused).toHaveBeenCalledWith('host:resume', undefined);
  });

  it('ends the game only after confirmation', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const send = show(during('question', single));
    fireEvent.click(button('Завершити гру'));
    expect(send).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(button('Завершити гру'));
    expect(send).toHaveBeenCalledWith('host:end', undefined);
  });

  it('lists responses with what each player answered', () => {
    show(
      during('reveal', single, {
        responses: [
          { playerId: 'p1', nickname: 'Олена', answer: { type: 'single', optionId: 'b' }, timeMs: 4000, accepted: true, points: 900, overridden: false },
        ],
      }),
    );
    const row = screen.getByText('Київ').closest('li');
    expect(row?.textContent).toContain('Олена');
    expect(row?.textContent).toContain('зараховано');
    expect(row?.textContent).toContain('900');
  });

  it('lets the host accept or reject text answers on reveal', () => {
    const responses = [
      { playerId: 'p1', nickname: 'Олена', answer: { type: 'text' as const, value: 'Адеса' }, timeMs: 4000, accepted: false, points: 0, overridden: false },
      { playerId: 'p2', nickname: 'Тарас', answer: { type: 'text' as const, value: 'Одеса' }, timeMs: 5000, accepted: true, points: 875, overridden: false },
    ];
    const send = show(during('reveal', textQuestion, { responses }));
    fireEvent.click(button('Зарахувати'));
    expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p1', accepted: true });
    fireEvent.click(button('Відхилити'));
    expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p2', accepted: false });
  });

  it('does not offer manual grading for choice questions or before reveal', () => {
    const responses = [
      { playerId: 'p1', nickname: 'Олена', answer: { type: 'single' as const, optionId: 'a' }, timeMs: 4000, accepted: false, points: 0, overridden: false },
    ];
    show(during('reveal', single, { responses }));
    expect(screen.queryByRole('button', { name: 'Зарахувати' })).toBeNull();
    cleanup();

    const textResponses = [{ ...responses[0], answer: { type: 'text' as const, value: 'Адеса' } }];
    show(during('question', textQuestion, { responses: textResponses }));
    expect(screen.queryByRole('button', { name: 'Зарахувати' })).toBeNull();
  });

  it('removes a player', () => {
    const send = show(view());
    fireEvent.click(screen.getAllByRole('button', { name: 'Вилучити' })[1]);
    expect(send).toHaveBeenCalledWith('host:kick', { playerId: 'p2' });
  });

  it('explains a refused action', async () => {
    const send: Send = vi.fn(async () => ({ ok: false as const, error: 'no_players' }));
    show(view(), send);
    fireEvent.click(button('Почати гру'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Потрібен хоча б один гравець.'));
  });

  it('shows the final standings and no game actions once finished', () => {
    const standings = [{ participantId: 'p1', nickname: 'Олена', score: 750, totalTimeMs: 1, rank: 1 }];
    show(view({ phase: 'finished', questionIndex: 1, standings }));
    expect(screen.getAllByText('Гру завершено').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Завершити гру' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Вилучити' })).toBeNull();
  });
});
```

- [ ] **Step 2: Переконатися, що тест падає**

Run: `pnpm vitest run apps/web/src/screens/HostScreen.test.tsx`
Expected: FAIL, модуль `./HostScreen` не існує.

- [ ] **Step 3: Написати реалізацію**

`apps/web/src/screens/HostScreen.tsx`:

```tsx
import { useState } from 'react';
import type { ClientToServerEvents, HostView } from '@quiz/shared';
import { answerText, correctText } from '../format';
import { errorText, t, type TextKey } from '../i18n';
import type { Send } from '../live/types';
import { Standings } from './Standings';

interface Props {
  view: HostView;
  code: string;
  stageUrl: string;
  joinUrl: string;
  send: Send;
}

type HostEvent = keyof ClientToServerEvents;

/** Єдина головна дія кожного етапу. */
const MAIN_ACTION: Partial<Record<HostView['phase'], { label: TextKey; event: HostEvent }>> = {
  lobby: { label: 'start', event: 'host:start' },
  question: { label: 'lock', event: 'host:lock' },
  locked: { label: 'reveal', event: 'host:next' },
  reveal: { label: 'next', event: 'host:next' },
  leaderboard: { label: 'nextQuestion', event: 'host:next' },
};

export function HostScreen({ view, code, stageUrl, joinUrl, send }: Props) {
  const [error, setError] = useState<string | null>(null);
  const { phase, correct } = view;
  const live = phase !== 'lobby' && phase !== 'finished';
  const main = MAIN_ACTION[phase];
  const canGrade = phase === 'reveal' && correct?.type === 'text';

  const act = async (event: HostEvent, payload?: unknown) => {
    const result = await send(event, payload);
    setError(result.ok ? null : errorText(result.error));
  };

  const endGame = () => {
    if (window.confirm(t('endConfirm'))) void act('host:end');
  };

  return (
    <main className="app host">
      <header className="bar">
        <span>{t('hostTitle')}</span>
        <strong className="code">{`${code.slice(0, 3)} ${code.slice(3)}`}</strong>
      </header>

      <p className="meta">
        {t(`phase_${phase}`)}
        {view.questionIndex >= 0 && `, ${t('questionOf', { index: view.questionIndex + 1, total: view.total })}`}
        {phase === 'question' && `, ${t('answeredOf', { answered: view.answeredCount, total: view.playerCount })}`}
      </p>

      {view.question !== null && phase !== 'finished' && (
        <section className="panel">
          <h1 className="question">{view.question.text}</h1>
          {correct !== null && <p className="answer">{t('correctAnswer', { answer: correctText(correct) })}</p>}
        </section>
      )}

      {view.question !== null && live && (
        <section className="panel">
          <h2>{t('responses')}</h2>
          {view.responses.length === 0 ? (
            <p className="meta">{t('noResponses')}</p>
          ) : (
            <ul className="rows">
              {view.responses.map((response) => (
                <li key={response.playerId}>
                  <span className="name">{response.nickname}</span>
                  <span className="given">{answerText(response.answer, correct)}</span>
                  <span className={response.accepted ? 'tag is-correct' : 'tag is-wrong'}>
                    {t(response.accepted ? 'accepted' : 'rejected')}
                    {response.overridden && `, ${t('changedByHost')}`}
                  </span>
                  <span className="score">{response.points}</span>
                  {canGrade && (
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => act('host:override', { playerId: response.playerId, accepted: !response.accepted })}
                    >
                      {t(response.accepted ? 'reject' : 'accept')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {phase === 'finished' ? (
        <section className="panel">
          <h2>{t('gameOver')}</h2>
          <Standings standings={view.standings} />
        </section>
      ) : (
        <section className="panel">
          <h2>{`${t('players')}: ${view.players.length}`}</h2>
          <ul className="rows">
            {view.players.map((player) => (
              <li key={player.id}>
                <span className="name">{player.nickname}</span>
                {!player.connected && <span className="tag is-wrong">{t('disconnected')}</span>}
                <span className="score">{player.score}</span>
                <button type="button" className="btn btn-small" onClick={() => act('host:kick', { playerId: player.id })}>
                  {t('kick')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="links">
        <a href={stageUrl} target="_blank" rel="noreferrer">
          {t('stageLink')}
        </a>
        <span className="meta">{`${t('joinLink')}: ${joinUrl}`}</span>
      </nav>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <footer className="actions">
        {live && (
          <>
            <button type="button" className="btn" onClick={() => act(view.paused ? 'host:resume' : 'host:pause')}>
              {t(view.paused ? 'resume' : 'pause')}
            </button>
            <button type="button" className="btn btn-danger" onClick={endGame}>
              {t('end')}
            </button>
          </>
        )}
        {main !== undefined && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={phase === 'lobby' && view.players.length === 0}
            onClick={() => act(main.event)}
          >
            {t(main.label)}
          </button>
        )}
      </footer>
    </main>
  );
}
```

- [ ] **Step 4: Переконатися, що тести проходять**

Run: `pnpm test`
Expected: PASS, 208 тестів (196 попередніх + 12 нових).

Run: `pnpm typecheck`
Expected: без помилок.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add host control screen"
```

---

### Task 6: Сторінки, сокет і оформлення

**Files:**
- Create: `apps/web/src/api.ts`, `apps/web/src/quiz-file.ts`, `apps/web/src/demo-quiz.ts`, `apps/web/src/live/useGame.ts`
- Create: `apps/web/src/pages/Home.tsx`, `NewGame.tsx`, `Play.tsx`, `Host.tsx`, `Stage.tsx`
- Create: `apps/web/src/main.tsx`, `apps/web/src/styles.css`
- Modify: `README.md`, `.gitignore`
- Test: `apps/web/src/quiz-file.test.ts`, `apps/web/src/demo-quiz.test.ts`

**Interfaces:**
- Consumes: екрани із завдань 3–5, `storage`, `i18n`, `Send`; `quizSchema`, типи подій з `@quiz/shared`.
- Produces:
  - `parseQuizFile(text: string): Quiz | null`
  - `demoQuiz: Quiz`
  - `createGame(quiz)`, `checkCode(code)`, `joinGame(code, nickname)`: кожна повертає `{ ok: true; … } | { ok: false; error: string }`
  - `useGame(auth: SocketAuth | null): { view; status; hostOnline; offsetMs; closed; send }`
  - маршрути `/`, `/new`, `/play/:code`, `/host/:code`, `/stage/:code`

- [ ] **Step 1: Написати тести, що падають**

`apps/web/src/quiz-file.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { demoQuiz } from './demo-quiz';
import { parseQuizFile } from './quiz-file';

describe('parseQuizFile', () => {
  it('reads a valid quiz', () => {
    expect(parseQuizFile(JSON.stringify(demoQuiz))?.title).toBe(demoQuiz.title);
  });

  it('returns null for text that is not JSON', () => {
    expect(parseQuizFile('це не JSON')).toBeNull();
    expect(parseQuizFile('')).toBeNull();
  });

  it('returns null for JSON that is not a quiz', () => {
    expect(parseQuizFile('{"name":"package","version":"1.0.0"}')).toBeNull();
    expect(parseQuizFile('[1,2,3]')).toBeNull();
    expect(parseQuizFile(JSON.stringify({ ...demoQuiz, questions: [] }))).toBeNull();
  });
});
```

`apps/web/src/demo-quiz.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { quizSchema } from '@quiz/shared';
import { demoQuiz } from './demo-quiz';

describe('demoQuiz', () => {
  it('is a valid quiz', () => {
    expect(quizSchema.safeParse(demoQuiz).success).toBe(true);
  });

  it('shows every question type', () => {
    const types = new Set(demoQuiz.questions.map((question) => question.type));
    expect([...types].sort()).toEqual(['boolean', 'multi', 'numeric', 'order', 'single', 'text']);
  });
});
```

- [ ] **Step 2: Переконатися, що тести падають**

Run: `pnpm vitest run apps/web/src/quiz-file.test.ts apps/web/src/demo-quiz.test.ts`
Expected: FAIL, модулі `./quiz-file`, `./demo-quiz` не існують.

- [ ] **Step 3: Написати дані та допоміжні модулі**

`apps/web/src/demo-quiz.ts`:

```ts
import type { Quiz } from '@quiz/shared';

const base = { imageUrl: null, timeLimit: 20, points: 1000 };

/** Коротка вікторина, що показує всі типи запитань. */
export const demoQuiz: Quiz = {
  title: 'Україна: розминка',
  description: 'Шість запитань, по одному кожного типу.',
  settings: { speedBonus: true, leaderboard: 'each', shuffleOptions: false },
  questions: [
    {
      ...base,
      id: 'q1',
      type: 'single',
      text: 'Яка річка найдовша в межах України?',
      options: [
        { id: 'a', text: 'Дністер' },
        { id: 'b', text: 'Дніпро' },
        { id: 'c', text: 'Південний Буг' },
        { id: 'd', text: 'Десна' },
      ],
      correctId: 'b',
    },
    {
      ...base,
      id: 'q2',
      type: 'multi',
      text: 'Які з цих міст стоять на Дніпрі?',
      options: [
        { id: 'a', text: 'Черкаси' },
        { id: 'b', text: 'Львів' },
        { id: 'c', text: 'Запоріжжя' },
        { id: 'd', text: 'Полтава' },
      ],
      correctIds: ['a', 'c'],
    },
    { ...base, id: 'q3', type: 'boolean', text: 'Говерла є найвищою горою України.', correct: true },
    {
      ...base,
      id: 'q4',
      type: 'text',
      timeLimit: 30,
      text: 'У якому місті розташований замок Паланок?',
      accepted: ['Мукачево', 'Мукачеве'],
    },
    {
      ...base,
      id: 'q5',
      type: 'numeric',
      timeLimit: 30,
      text: 'Яка висота Говерли в метрах?',
      correct: 2061,
      tolerance: 100,
    },
    {
      ...base,
      id: 'q6',
      type: 'order',
      timeLimit: 40,
      text: 'Розташуйте міста із заходу на схід.',
      items: [
        { id: 'u', text: 'Ужгород' },
        { id: 'l', text: 'Львів' },
        { id: 'k', text: 'Київ' },
        { id: 'h', text: 'Харків' },
      ],
    },
  ],
};
```

`apps/web/src/quiz-file.ts`:

```ts
import { quizSchema, type Quiz } from '@quiz/shared';

/** Вікторина з тексту файла або null, якщо це не вікторина. */
export function parseQuizFile(text: string): Quiz | null {
  try {
    const parsed = quizSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
```

`apps/web/src/api.ts`:

```ts
import type { Phase, Quiz } from '@quiz/shared';

export type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: string };

async function request<T>(url: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 429) return { ok: false, error: 'too_many' };
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok || data === null) {
      return { ok: false, error: typeof data?.error === 'string' ? data.error : 'unknown' };
    }
    return { ok: true, ...(data as T) };
  } catch {
    return { ok: false, error: 'offline' };
  }
}

export const createGame = (quiz: Quiz) =>
  request<{ gameId: string; code: string; hostToken: string; stageToken: string }>('/api/games', quiz);

export const checkCode = (code: string) =>
  request<{ phase: Phase; title: string }>(`/api/games/by-code/${encodeURIComponent(code)}`);

export const joinGame = (code: string, nickname: string) =>
  request<{ token: string; playerId: string }>(`/api/games/by-code/${encodeURIComponent(code)}/join`, { nickname });
```

`apps/web/src/live/useGame.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, CloseReason, GameView, ServerToClientEvents, SocketAuth } from '@quiz/shared';
import type { Send, SendResult } from './types';

export type Status = 'connecting' | 'live' | 'offline' | 'unauthorized';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Тримає сокет гри: поточний зріз стану, стан зв'язку й надсилання подій. */
export function useGame(auth: SocketAuth | null) {
  const [view, setView] = useState<GameView | null>(null);
  const [status, setStatus] = useState<Status>('connecting');
  const [hostOnline, setHostOnline] = useState(true);
  const [offsetMs, setOffsetMs] = useState(0);
  const [closed, setClosed] = useState<CloseReason | null>(null);
  const socketRef = useRef<GameSocket | null>(null);

  const code = auth?.code;
  const role = auth?.role;
  const token = auth?.token;

  useEffect(() => {
    if (code === undefined || role === undefined || token === undefined) return;
    setStatus('connecting');
    setClosed(null);
    const socket: GameSocket = io({ auth: { code, role, token }, transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('state', (next, meta) => {
      setView(next);
      setHostOnline(meta.hostOnline);
      setOffsetMs(meta.serverNow - Date.now());
      setStatus('live');
    });
    socket.on('closed', (reason) => setClosed(reason));
    socket.on('disconnect', () => setStatus('offline'));
    socket.on('connect_error', (error) => {
      if (error.message === 'unauthorized') {
        setStatus('unauthorized');
        socket.close();
      } else {
        setStatus('offline');
      }
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [code, role, token]);

  const send = useCallback<Send>((event, payload) => {
    return new Promise<SendResult>((resolve) => {
      const socket = socketRef.current;
      if (socket === null || !socket.connected) {
        resolve({ ok: false, error: 'offline' });
        return;
      }
      const emit = socket.emit.bind(socket) as (event: string, ...args: unknown[]) => void;
      if (payload === undefined) emit(event, resolve);
      else emit(event, payload, resolve);
    });
  }, []);

  return { view, status, hostOnline, offsetMs, closed, send };
}
```

- [ ] **Step 4: Написати сторінки**

`apps/web/src/pages/Home.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { checkCode } from '../api';
import { errorText, t } from '../i18n';

export function Home() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const digits = code.replace(/\D/g, '');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await checkCode(digits);
    setBusy(false);
    if (result.ok) navigate(`/play/${digits}`);
    else setError(errorText(result.error));
  };

  return (
    <main className="app narrow">
      <h1 className="brand">{t('appName')}</h1>
      <form className="panel" onSubmit={submit}>
        <h2>{t('joinTitle')}</h2>
        <label className="field">
          <span>{t('codeLabel')}</span>
          <input
            className="code-input"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            maxLength={7}
            placeholder="000 000"
            aria-describedby="code-hint"
          />
        </label>
        <p className="meta" id="code-hint">
          {t('codeHint')}
        </p>
        <button type="submit" className="btn btn-primary" disabled={digits.length !== 6 || busy}>
          {t(busy ? 'checking' : 'joinButton')}
        </button>
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
      <Link className="quiet-link" to="/new">
        {t('hostLink')}
      </Link>
    </main>
  );
}
```

`apps/web/src/pages/NewGame.tsx`:

```tsx
import { useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Quiz } from '@quiz/shared';
import { createGame } from '../api';
import { demoQuiz } from '../demo-quiz';
import { errorText, t } from '../i18n';
import { parseQuizFile } from '../quiz-file';
import { saveHost } from '../storage';

export function NewGame() {
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    const parsed = parseQuizFile(await file.text());
    setQuiz(parsed);
    setError(parsed === null ? t('badQuizFile') : null);
  };

  const create = async () => {
    if (quiz === null) return;
    setBusy(true);
    const result = await createGame(quiz);
    setBusy(false);
    if (!result.ok) {
      setError(errorText(result.error));
      return;
    }
    saveHost(result.code, { hostToken: result.hostToken, stageToken: result.stageToken });
    navigate(`/host/${result.code}`);
  };

  return (
    <main className="app narrow">
      <h1 className="brand">{t('newGameTitle')}</h1>
      <section className="panel">
        <button
          type="button"
          className="btn"
          onClick={() => {
            setQuiz(demoQuiz);
            setError(null);
          }}
        >
          {t('demoQuiz')}
        </button>
        <label className="field">
          <span>{t('uploadQuiz')}</span>
          <input type="file" accept="application/json,.json" onChange={upload} aria-describedby="upload-hint" />
        </label>
        <p className="meta" id="upload-hint">
          {t('uploadHint')}
        </p>
        {quiz !== null && <p className="lead">{t('quizReady', { title: quiz.title, count: quiz.questions.length })}</p>}
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn btn-primary" disabled={quiz === null || busy} onClick={create}>
          {t(busy ? 'creating' : 'createGame')}
        </button>
      </section>
    </main>
  );
}
```

`apps/web/src/pages/Play.tsx`:

```tsx
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SocketAuth } from '@quiz/shared';
import { joinGame } from '../api';
import { errorText, t } from '../i18n';
import { useGame } from '../live/useGame';
import { PlayerScreen } from '../screens/PlayerScreen';
import { clearPlayer, loadPlayer, savePlayer } from '../storage';

function JoinForm({ code, notice, onJoined }: { code: string; notice: string | null; onJoined: (token: string) => void }) {
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(notice);
  const ready = nickname.trim().length >= 2;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await joinGame(code, nickname);
    setBusy(false);
    if (result.ok) onJoined(result.token);
    else setError(errorText(result.error));
  };

  return (
    <main className="app narrow">
      <h1 className="brand">{`${code.slice(0, 3)} ${code.slice(3)}`}</h1>
      <form className="panel" onSubmit={submit}>
        <label className="field">
          <span>{t('nicknameLabel')}</span>
          <input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            maxLength={20}
            autoComplete="nickname"
            autoFocus
            aria-describedby="nickname-hint"
          />
        </label>
        <p className="meta" id="nickname-hint">
          {t('nicknameHint')}
        </p>
        <button type="submit" className="btn btn-primary" disabled={!ready || busy}>
          {t(busy ? 'checking' : 'enterGame')}
        </button>
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
      <Link className="quiet-link" to="/">
        {t('joinTitle')}
      </Link>
    </main>
  );
}

export function Play() {
  const { code = '' } = useParams();
  const [token, setToken] = useState<string | null>(() => loadPlayer(code));
  const [notice, setNotice] = useState<string | null>(null);
  const auth = useMemo<SocketAuth | null>(() => (token === null ? null : { code, role: 'player', token }), [code, token]);
  const game = useGame(auth);

  // Токен більше не діє: гру закрито або гравця вилучено. Повертаємо форму входу.
  const lost = token !== null && (game.status === 'unauthorized' || game.closed !== null);
  useEffect(() => {
    if (!lost) return;
    setNotice(t(game.closed === 'kicked' ? 'kicked' : 'gameGone'));
    clearPlayer(code);
    setToken(null);
  }, [lost, game.closed, code]);

  if (token === null) {
    return (
      <JoinForm
        key={notice ?? 'fresh'}
        code={code}
        notice={notice}
        onJoined={(joined) => {
          savePlayer(code, joined);
          setNotice(null);
          setToken(joined);
        }}
      />
    );
  }

  if (game.view === null || game.view.role !== 'player') {
    return (
      <main className="app narrow">
        <p className="lead">{t(game.status === 'offline' ? 'offline' : 'connecting')}</p>
      </main>
    );
  }

  return (
    <>
      {game.status === 'offline' && (
        <p className="banner is-offline" role="status">
          {t('offline')}
        </p>
      )}
      <PlayerScreen view={game.view} hostOnline={game.hostOnline} offsetMs={game.offsetMs} send={game.send} />
    </>
  );
}
```

`apps/web/src/pages/Host.tsx`:

```tsx
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SocketAuth } from '@quiz/shared';
import { t } from '../i18n';
import { useGame } from '../live/useGame';
import { HostScreen } from '../screens/HostScreen';
import { loadHost } from '../storage';

export function Host() {
  const { code = '' } = useParams();
  const tokens = useMemo(() => loadHost(code), [code]);
  const auth = useMemo<SocketAuth | null>(
    () => (tokens === null ? null : { code, role: 'host', token: tokens.hostToken }),
    [code, tokens],
  );
  const game = useGame(auth);

  if (tokens === null || game.status === 'unauthorized' || game.closed !== null) {
    return (
      <main className="app narrow">
        <p className="lead">{t(tokens === null ? 'noHostAccess' : 'gameGone')}</p>
        <Link className="quiet-link" to="/new">
          {t('newGameTitle')}
        </Link>
      </main>
    );
  }

  if (game.view === null || game.view.role !== 'host') {
    return (
      <main className="app narrow">
        <p className="lead">{t(game.status === 'offline' ? 'offline' : 'connecting')}</p>
      </main>
    );
  }

  const origin = window.location.origin;
  return (
    <>
      {game.status === 'offline' && (
        <p className="banner is-offline" role="status">
          {t('offline')}
        </p>
      )}
      <HostScreen
        view={game.view}
        code={code}
        stageUrl={`${origin}/stage/${code}#${tokens.stageToken}`}
        joinUrl={`${origin}/play/${code}`}
        send={game.send}
      />
    </>
  );
}
```

`apps/web/src/pages/Stage.tsx`:

```tsx
import { useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import type { SocketAuth } from '@quiz/shared';
import { t } from '../i18n';
import { useGame } from '../live/useGame';
import { StageScreen } from '../screens/StageScreen';

export function Stage() {
  const { code = '' } = useParams();
  const token = useLocation().hash.slice(1);
  const auth = useMemo<SocketAuth | null>(() => (token === '' ? null : { code, role: 'stage', token }), [code, token]);
  const game = useGame(auth);

  if (token === '' || game.status === 'unauthorized' || game.closed !== null) {
    return (
      <main className="app stage">
        <p className="lead">{t('gameGone')}</p>
      </main>
    );
  }

  if (game.view === null || game.view.role !== 'stage') {
    return (
      <main className="app stage">
        <p className="lead">{t(game.status === 'offline' ? 'offline' : 'connecting')}</p>
      </main>
    );
  }

  return (
    <StageScreen
      view={game.view}
      code={code}
      joinUrl={`${window.location.origin}/play/${code}`}
      offsetMs={game.offsetMs}
      hostOnline={game.hostOnline}
    />
  );
}
```

`apps/web/src/main.tsx`:

```tsx
import '@fontsource-variable/unbounded';
import '@fontsource-variable/onest';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Home } from './pages/Home';
import { Host } from './pages/Host';
import { NewGame } from './pages/NewGame';
import { Play } from './pages/Play';
import { Stage } from './pages/Stage';

const root = document.getElementById('root');
if (root === null) throw new Error('root element is missing');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/new" element={<NewGame />} />
        <Route path="/play/:code" element={<Play />} />
        <Route path="/host/:code" element={<Host />} />
        <Route path="/stage/:code" element={<Stage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
```

- [ ] **Step 5: Написати оформлення**

`apps/web/src/styles.css`:

```css
:root {
  --stage: #0e1020;
  --spot: #2a2f5c;
  --paper: #f5f1e6;
  --dim: #a9a7b8;
  --amber: #ffb300;
  --correct: #3ddcc0;
  --signal: #ff3d5a;
  --panel: rgb(255 255 255 / 0.05);
  --line: rgb(245 241 230 / 0.16);
  --display: 'Unbounded Variable', system-ui, sans-serif;
  --body: 'Onest Variable', system-ui, sans-serif;
  color-scheme: dark;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  min-height: 100%;
}

body {
  margin: 0;
  background: var(--stage);
  background-image: radial-gradient(120% 70% at 50% -10%, var(--spot) 0%, var(--stage) 60%);
  background-attachment: fixed;
  color: var(--paper);
  font-family: var(--body);
  font-size: 1.0625rem;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}

h1,
h2,
p,
ol,
ul {
  margin: 0;
  padding: 0;
}

ol,
ul {
  list-style: none;
}

h2 {
  font-family: var(--display);
  font-size: 1rem;
  font-weight: 600;
}

a {
  color: var(--amber);
}

:focus-visible {
  outline: 3px solid var(--amber);
  outline-offset: 3px;
}

/* ---------- Каркас ---------- */

.app {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  min-height: 100dvh;
  padding: max(1.25rem, env(safe-area-inset-top)) 1.25rem max(1.5rem, env(safe-area-inset-bottom));
  margin: 0 auto;
  max-width: 34rem;
}

.app.narrow {
  justify-content: center;
}

.app.host {
  max-width: 46rem;
}

.brand {
  font-family: var(--display);
  font-size: clamp(1.75rem, 8vw, 2.75rem);
  font-weight: 800;
  letter-spacing: -0.02em;
}

.bar {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  color: var(--dim);
}

.score,
.code,
.rank {
  font-family: var(--display);
  font-variant-numeric: tabular-nums;
}

.bar .score,
.bar .code {
  color: var(--amber);
  font-size: 1.25rem;
}

.meta {
  color: var(--dim);
  font-size: 0.9375rem;
}

.lead {
  font-size: 1.25rem;
}

.question {
  font-family: var(--display);
  font-size: clamp(1.375rem, 6vw, 2rem);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.01em;
  text-wrap: balance;
}

.question-image {
  width: 100%;
  max-height: 40vh;
  object-fit: contain;
  border-radius: 0.75rem;
}

.question-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 1rem;
}

.banner {
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  background: var(--amber);
  color: var(--stage);
  font-weight: 700;
  text-align: center;
}

.banner.is-offline {
  position: sticky;
  top: 0;
  z-index: 1;
  border-radius: 0;
  background: var(--signal);
  color: var(--paper);
}

.error {
  color: var(--signal);
  font-weight: 600;
}

.quiet-link {
  align-self: center;
  color: var(--dim);
}

/* ---------- Кнопки й поля ---------- */

.btn {
  min-height: 3rem;
  padding: 0.75rem 1.25rem;
  border: 2px solid var(--line);
  border-radius: 0.75rem;
  background: transparent;
  color: var(--paper);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-primary {
  border-color: var(--amber);
  background: var(--amber);
  color: var(--stage);
  font-family: var(--display);
  font-size: 1rem;
}

.btn-danger {
  border-color: var(--signal);
  color: var(--signal);
}

.btn-small {
  min-height: 2.5rem;
  padding: 0.25rem 0.75rem;
  font-size: 0.9375rem;
}

.btn-icon {
  min-width: 3rem;
  padding: 0;
  font-size: 1.25rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-weight: 600;
}

.field input:not([type='file']) {
  min-height: 3.25rem;
  padding: 0.75rem 1rem;
  border: 2px solid var(--line);
  border-radius: 0.75rem;
  background: rgb(0 0 0 / 0.25);
  color: var(--paper);
  font: inherit;
  font-size: 1.125rem;
}

.field input:focus-visible {
  border-color: var(--amber);
  outline: none;
}

.code-input {
  font-family: var(--display) !important;
  font-size: 1.75rem !important;
  letter-spacing: 0.2em;
  text-align: center;
}

.typed {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* ---------- Варіанти відповіді ---------- */

.choices {
  display: grid;
  gap: 0.75rem;
}

.choice {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
  min-height: 3.75rem;
  padding: 0.875rem 1rem;
  border: 2px solid var(--amber);
  border-radius: 0.75rem;
  background: transparent;
  color: var(--paper);
  font: inherit;
  font-size: 1.125rem;
  font-weight: 600;
  text-align: left;
}

button.choice {
  cursor: pointer;
}

.letter {
  flex: none;
  min-width: 1.5rem;
  color: var(--amber);
  font-family: var(--display);
  font-weight: 800;
}

.choice.is-picked {
  background: var(--amber);
  color: var(--stage);
}

.choice.is-picked .letter {
  color: var(--stage);
}

.choice.is-correct {
  border-color: var(--correct);
  background: var(--correct);
  color: var(--stage);
}

.choice.is-correct .letter {
  color: var(--stage);
}

.choice .count {
  margin-left: auto;
  font-family: var(--display);
  font-variant-numeric: tabular-nums;
}

.order {
  display: grid;
  gap: 0.5rem;
}

.order li {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.5rem 0.5rem 1rem;
  border: 2px solid var(--line);
  border-radius: 0.75rem;
}

.order-text {
  flex: 1;
  font-weight: 600;
}

/* ---------- Результат ---------- */

.sent,
.result {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1.25rem;
  border-left: 4px solid var(--amber);
  background: var(--panel);
  border-radius: 0 0.75rem 0.75rem 0;
}

.result h2 {
  font-size: 1.5rem;
}

.result.is-correct {
  border-color: var(--correct);
}

.result.is-correct h2 {
  color: var(--correct);
}

.result.is-wrong {
  border-color: var(--signal);
}

.result.is-wrong h2 {
  color: var(--signal);
}

.earned {
  font-family: var(--display);
  font-size: 2rem;
  font-weight: 800;
}

.place {
  font-family: var(--display);
  font-size: 1.25rem;
  color: var(--amber);
}

/* ---------- Таблиці ---------- */

.standings,
.rows {
  display: grid;
  gap: 0.5rem;
}

.standings li,
.rows li {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.875rem;
  border-bottom: 1px solid var(--line);
}

.standings .rank {
  min-width: 2rem;
  color: var(--amber);
  font-weight: 800;
}

.standings .name,
.rows .name {
  flex: 1;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.standings .is-me {
  background: rgb(255 179 0 / 0.14);
  border-radius: 0.5rem;
}

.rows .given {
  flex: 2;
  overflow-wrap: anywhere;
}

.tag {
  font-size: 0.875rem;
}

.tag.is-correct {
  color: var(--correct);
}

.tag.is-wrong {
  color: var(--signal);
}

.answer {
  color: var(--correct);
  font-weight: 600;
}

/* ---------- Пульт ---------- */

.links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  align-items: baseline;
}

.links .meta {
  overflow-wrap: anywhere;
}

.actions {
  position: sticky;
  bottom: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: auto;
  padding: 1rem 0 0.25rem;
  background: linear-gradient(transparent, var(--stage) 30%);
}

.actions .btn-primary {
  flex: 1 1 12rem;
  min-height: 3.5rem;
}

/* ---------- Табло відліку ---------- */

.timer {
  display: flex;
  gap: 0.25rem;
}

.flap {
  position: relative;
  min-width: 1.6em;
  padding: 0.15em 0.2em;
  border-radius: 0.2em;
  background: #05060f;
  color: var(--amber);
  font-family: var(--display);
  font-size: 1.5rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.flap::after {
  content: '';
  position: absolute;
  inset: 50% 0 auto;
  height: 1px;
  background: var(--stage);
}

/* ---------- Сцена: читається з 5–10 метрів ---------- */

.app.stage {
  max-width: none;
  padding: 4vh 5vw;
  gap: 3vh;
  justify-content: center;
}

.stage .bar,
.stage .meta {
  font-size: clamp(1rem, 1.7vw, 1.75rem);
}

.stage .lead {
  font-size: clamp(1.25rem, 2.4vw, 2.5rem);
}

.stage .question {
  font-size: clamp(1.75rem, 4.3vw, 4.5rem);
}

.stage-question {
  display: flex;
  flex-direction: column;
  gap: 3vh;
  flex: 1;
}

.stage-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4vw;
  flex: 1;
}

.stage .flap {
  font-size: clamp(2.5rem, 7vw, 7rem);
}

.stage .choices {
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5vh 2vw;
}

.stage .choice {
  border: 0;
  border-bottom: 3px solid var(--amber);
  border-radius: 0;
  padding: 1.5vh 0.5vw;
  font-size: clamp(1.125rem, 2.4vw, 2.5rem);
}

.stage .choice.is-correct {
  border-radius: 0.5rem;
  padding-inline: 1.5vw;
}

.stage-lobby {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4vh 6vw;
  align-items: center;
}

.address {
  font-family: var(--display);
  font-size: clamp(1.5rem, 4vw, 4rem);
  font-weight: 700;
  overflow-wrap: anywhere;
}

.invite .code {
  color: var(--amber);
  font-size: clamp(3rem, 10vw, 10rem);
  font-weight: 800;
  line-height: 1;
}

.qr {
  padding: 1rem;
  background: var(--paper);
  border-radius: 1rem;
  line-height: 0;
}

.qr svg {
  width: min(28vw, 40vh);
  height: auto;
}

.roster {
  grid-column: 1 / -1;
  display: grid;
  gap: 1.5vh;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.chips li {
  padding: 0.5rem 1rem;
  border: 2px solid var(--line);
  border-radius: 999px;
  font-size: clamp(1rem, 1.8vw, 1.75rem);
  font-weight: 600;
}

.chips .is-away {
  opacity: 0.45;
}

.stage-board {
  display: grid;
  gap: 3vh;
  width: min(100%, 60rem);
  margin: 0 auto;
}

.stage .standings li {
  font-size: clamp(1.25rem, 2.6vw, 2.75rem);
  padding: 1.2vh 1vw;
}

.stage-board.is-final li:nth-child(-n + 3) .name {
  color: var(--amber);
  font-family: var(--display);
}

@media (max-width: 700px) {
  .stage-lobby,
  .stage .choices {
    grid-template-columns: 1fr;
  }
}

/* Єдиний підкреслений момент: розкриття правильної відповіді. */
@media (prefers-reduced-motion: no-preference) {
  .choice.is-correct,
  .result {
    animation: reveal 0.5s ease-out both;
  }

  @keyframes reveal {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
  }
}
```

- [ ] **Step 6: Оновити README та .gitignore**

У `.gitignore` рядок `dist/` уже є. Додати в `README.md` перед розділом `## HTTP API`:

```markdown
## Як зіграти локально

    pnpm install
    pnpm build
    pnpm start

Відкрийте http://localhost:3000/new на комп'ютері, створіть гру з готової
вікторини, натисніть «Відкрити сцену» для великого екрана. Гравці з телефонів
у тій самій мережі Wi-Fi заходять на адресу комп'ютера (наприклад,
http://192.168.0.10:3000) і вводять код гри або сканують QR-код зі сцени,
якщо сцену відкрито за цією ж адресою.

Під час розробки `pnpm dev` запускає сервер і клієнт із гарячим оновленням
на http://localhost:5173.

```

І додати до списку пакетів рядок:

```markdown
- `apps/web`: клієнт на React + Vite: вхід гравця, сцена, пульт ведучого.
```

- [ ] **Step 7: Переконатися, що все працює**

Run: `pnpm test`
Expected: PASS, 213 тестів (208 попередніх + 5 нових).

Run: `pnpm typecheck`
Expected: без помилок.

Run: `pnpm build`
Expected: Vite збирає `apps/web/dist` без помилок.

- [ ] **Step 8: Зіграти справжню гру в браузері**

Запустити `pnpm start`, і скриптом на `playwright-core` (канал `chrome`, скрипт поза репозиторієм) пройти сценарій: ведучий створює гру з готової вікторини, сцена відкривається за посиланням, два гравці входять за кодом, ведучий стартує, гравці відповідають, ведучий показує відповідь і рейтинг. Зняти знімки сцени (1920×1080), екрана гравця (390×844) та пульта на етапах лобі, запитання, розкриття й переглянути їх.

Expected: сценарій проходить без помилок у консолі браузера; на знімках текст не обрізаний і не накладається, шрифти Unbounded й Onest застосовано, кирилиця відображається.

- [ ] **Step 9: Commit**

```bash
git add apps/web README.md pnpm-lock.yaml
git commit -m "feat(web): add pages, live socket hook and Night Broadcast styling"
```
