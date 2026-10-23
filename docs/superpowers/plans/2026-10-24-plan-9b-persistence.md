# План 9b: жива гра переживає перезапуск сервера

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 9b специфікації (розділ 4, пункт 10 власника: «усіх викинуло з гри»).
- **Стан кожної кімнати в базі.** Гра, гравці з їхніми токенами, ведучий і сцена, код — у таблиці `live_room`; запис після кожної зміни, не частіше ніж раз на секунду для кімнати, і обов'язково всі кімнати на SIGTERM (Render надсилає його перед зупинкою старої версії).
- **Після перезапуску кімнати піднімаються з бази**, а не позначаються перерваними. Запитання (дуель, заставка), що йшло, стоїть на паузі з тим залишком часу, який був у мить збереження; ведучий тисне «Продовжити». Кімнати, не змінені понад добу, не відновлюються — їхні ігри, як і раніше, перервані.
- **Телефони, сцена й пульт перепідключаються самі** з тими самими посиланнями й токенами. Поки сервера немає — «Сервер перезапускається…», а не «Цієї гри вже немає»; «гри немає» — лише коли сервер справді сказав, що такої кімнати немає.
- **Розгортання без простою на Render** (нова версія стартує, поки стара ще працює) не роздвоює кімнату: кімнатою володіє рівно один процес (оренда з серцебиттям), нова версія чекає, доки стара віддасть кімнату на SIGTERM.

**Архітектура:**
- **Рушій (`packages/engine/src/restore.ts`, новий).** `suspend(state, at)` — чиста функція «стан після перезапуску»: доводить стан до миті збереження `at` (`tick`), ставить на паузу саме в цю мить (`pause(…, at)`) і позначає всіх гравців поза зв'язком (`setConnected(…, false, at)` уже на паузі — `autoLock` нічого не закриває). Наявний `resume` уже зсуває годинник запитання, заставку, годинники бафів і дебафів, черги й підвисання сортування на тривалість паузи — тож простій нікому не коштує часу. `GAME_STATE_VERSION` — версія формату `GameState`; збережена кімната іншої версії не відновлюється (гра перервана, як сьогодні). Тест закріплює набір ключів стану: зміна формату без підняття версії падає.
- **База.** Таблиця `live_room` (міграція `0010_live_rooms`): `code` (ключ), `room_id`, `data` (jsonb — `SavedRoom`), `owner` (id процесу або `null` — «віддано»), `heartbeat_at`, `updated_at`. `markInterrupted(db, except)` не чіпає ігор кімнат, що лежать у `live_room`; `markAborted(db, ids)` — для ігор кімнат, які не відновлюються.
- **Менеджер (`apps/server/src/rooms/manager.ts`).** `snapshot(room)` → `SavedRoom` (токени, гравці-акаунти, стан, `tickedTo`, `savedAt`); `restore(saved)` → кімната зі станом `suspend(…)`, порожніми з'єднаннями, таймером відсутності ведучого (10 хв, як після відходу ведучого) і повторно заведеними таймерами; `freeze()` на зупинці — дії відповідають `restarting`, з'єднання й таймери стан більше не змінюють; `evict(room)` — кімнату перехопив інший процес; `setReserved(codes)` — коди кімнат із бази, яких у пам'яті немає, не видаються новим кімнатам.
- **Сховище (`apps/server/src/rooms/store.ts`, новий `RoomStore`).** Підписується на події менеджера: `changed` → відкладений запис (≤ 1 раз/с, один запис у польоті на кімнату); `closed` → видалити рядок; `moved` → забути. `boot()` — видалити рядки, старші за добу (їхні ігри — перервані), перервати решту «в процесі» ігор, крім ігор з `live_room`, підняти вільні рядки. `tick()` кожні 5 с — серцебиття своїх рядків, підхоплення вільних і покинутих, видалення застарілих, оновлення зарезервованих кодів. `claim(code)` — підняти кімнату на вимогу (перше підключення). `flushAll({ release: true })` — на SIGTERM записати всі кімнати з `owner = null`.
- **Сервер.** `buildApp({ persist: { instanceId } })` створює сховище, `await store.boot()` до `listen`, повертає `shutdown()` (заморозити → `restarting` усім сокетам → записати й віддати кімнати → закрити застосунок → дочекатися запису результатів). Проміжна функція сокета асинхронна: коду немає в пам'яті → `claim`; кімнатою володіє живий інший процес → помилка `restarting` (а не `unauthorized`). `POST …/join`, `GET …/by-code/:code`, `GET …/host-access` у тому самому випадку відповідають 503 `restarting`. `main.ts` вмикає збереження й більше не позначає всі ігри перерваними.
- **Веб.** `useGame`: новий стан `restarting` (подія `restarting` від сервера, помилка підключення `restarting`, розрив, ініційований сервером без `closed`); сам перепідключається (`socket.connect()` через 1,5 с там, де socket.io цього не робить). `Play`, `Host`, `Stage` показують «Сервер перезапускається…» — смугою поверх гри або на порожньому екрані; токени не стираються.

**Технології:** TypeScript, vitest, Drizzle ORM + drizzle-kit, PGlite (тести), Fastify + Socket.IO, React + Vite, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-24-after-third-game-design.md` — розділ 1 («Усіх викинуло (п. 10). Ігри, що йдуть, живуть лише в пам'яті сервера. Кожен пуш у `main` перезапускає Render»), розділ 2 (критерій «без вильоту»; анти-ціль «після перезапуску сервера гра відновлюється в неправильному стані (бали, черга, таймери)»), розділ 4 (частина 9b), розділ 8 («після перезапуску запитання, що йшло, стає на паузу»; «кімнати, старші за добу, не відновлюються»). Зразки: `apps/server/src/rooms/manager.ts` (`create`, `reschedule`, `hostLeft`, `close`, `alive`), `apps/server/src/recorder.ts` (черга записів на кімнату, повтори, `markInterrupted`), `apps/server/src/app.ts` (`preClose` з `io.disconnectSockets(true)`), `apps/server/src/socket.ts` (`io.use`), `apps/server/src/main.ts` (`stop`), `packages/engine/src/game.ts` (`pause`, `resume`, `resumeClock`, `setConnected`, `autoLock`, `tick`), `apps/web/src/live/useGame.ts`, тест-дублери `FakeScheduler` і `FakeSocket` (`apps/web/src/pages/Play.test.tsx`).

**Рішення плану там, де специфікація мовчить:**
- **Що зберігається.** `SavedRoom` (`v: 1`, `stateVersion`, `id`, `code`, `hostToken`, `stageToken`, `hostUserId`, `quizId`, `playerUsers` і `playerTokens` як масиви пар, `state`, `tickedTo`, `savedAt`). `GameState` — звичайні об'єкти, масиви, числа (мітки часу — `number` мс, не `Date`), рядки, `null`; `Map`/`Set` у стані немає (лише всередині функцій зрізів), `Infinity` лише в обчисленнях. Тест рушія це закріплює: `JSON.parse(JSON.stringify(s))` дорівнює `s`, а зрізи з копії — зрізам з оригіналу. Знімок вікторини (`state.quiz`) зберігається разом зі станом: десятки кілобайтів на кімнату, запис раз на секунду — прийнятно.
- **Коли писати.** Подія `changed` ставить запис через `SAVE_DELAY_MS = 1000` (перша зміна відкриває вікно, наступні в ньому зливаються; пишеться найсвіжіший стан на мить запису). На кімнату — один запис у польоті; зміна під час запису ставить ще один після нього. Збій бази журналюється й повторюється через 5 с; на гру не впливає. Обрив процесу без SIGTERM втрачає щонайбільше останню секунду.
- **Що таке «старша за добу».** `updated_at` (мить останнього запису) старше 24 год. Жива кімната стільки без змін не буває (лобі живе 2 год, підсумки — 30 хв, без ведучого гра закінчується за 10 хв), тож це лише покинуті рядки.
- **Пауза в мить збереження, а не відновлення.** `suspend(state, savedAt)`: залишок часу — той, що був у мить запису; простій (і до секунди між останньою зміною й записом) у час відповіді не входить. Стан, уже поставлений на паузу до перезапуску, лишається з тим самим `pausedAt` — `resume` зсуне все на всю тривалість паузи разом із простоєм. Лобі й фініш на паузу не ставляться. На паузу стають і етапи без годинника (поле, таблиця, підсумки раунду) — ведучий однаково має повернутися й натиснути «Продовжити»; так простіше й однаково для всіх етапів.
- **Ведучий після відновлення.** Пульт ще не підключений, тож одразу заводиться таймер відсутності ведучого (`HOST_ABSENCE_MS`, 10 хв), як після звичайного відходу: не повернувся — гра закінчується й іде в історію. Гравці позначені поза зв'язком, доки не відкриють сокет (перший сокет робить `setConnected(true)`, як завжди).
- **Записувач результатів.** Рядок `game` відновленої кімнати лишається `running`: `markInterrupted(db, except)` пропускає `room_id` усіх рядків `live_room`, що пережили чистку. Новий процес нічого не знає про вже записані запитання, тож перший запис перезаписує відповіді з початку (`fromQuestion = 0`) — це ідемпотентні upsert'и; `startedAt` у наявному рядку `game` не змінюється (upsert оновлює лише хід гри).
- **Токени — у відкритому вигляді.** Хешувати не будемо: `GET …/host-access` повертає ведучому з акаунтом токени пульта й сцени на інший пристрій — з хешів їх не відновити. Токени — випадкові секрети кімнати, що живе щонайбільше добу; рядок видаляється, щойно кімната закривається; у тій самій базі Better Auth уже тримає токени сесій у відкритому вигляді, тож доступ до бази й так дає більше, ніж токен кімнати. Порівняння токенів ведучого й сцени й далі `timingSafeEqual`.
- **Оренда замість «підняти все на старті».** Render розгортає без простою: нова версія стартує й проходить перевірку здоров'я, поки стара ще веде ігри; потім трафік іде на нову, а стара отримує SIGTERM. Тому рядок має власника `owner` (id процесу — `randomUUID()` на старті) і `heartbeat_at`. Власник оновлює `heartbeat_at` кожні `HEARTBEAT_MS = 5000`; рядок вільний, якщо `owner IS NULL` (віддано на SIGTERM) або серцебиття старше `LEASE_MS = 20_000` (процес упав). Підхоплення — атомарний `UPDATE … SET owner = me WHERE … RETURNING data`. Запис кімнати — upsert з умовою `live_room.owner = me`; нуль рядків у відповіді означає, що кімнату перехопили (наприклад, процес завис довше за оренду) — менеджер її виселяє (`evict`), сокети отримують `restarting` і перепідключаються.
- **Підключення до кімнати, якої ще немає в пам'яті.** Проміжна функція сокета: код є в пам'яті — як зараз; немає — `store.claim(code)`: вільний рядок підхоплюється одразу (без очікування `tick`); рядок живого іншого процесу — `next(new Error('restarting'))`; рядка немає — `unauthorized` («гри немає»). Одночасні `claim` того самого коду зливаються в один (мапа обіцянок). Ті самі правила — у `join`, `by-code`, `host-access` (503 `{ error: 'restarting' }`).
- **Коди.** Новий код не збігається з кодом рядка `live_room`, якого немає в пам'яті (`setReserved` з `boot`/`tick`). Кімната, створена старою версією вже після старту нової, може дати збіг лише з імовірністю ~10⁻⁶ — приймаємо.
- **Зупинка (SIGTERM).** `shutdown()`: `manager.freeze()` (дії → `restarting`; таймери всіх кімнат знято; `connect`/`disconnect` нічого не змінюють) → кожному сокету `restarting` → `store.flushAll({ release: true })` → `store.stop()` → `app.close()` (`preClose` розриває сокети) → `recorder.idle()`; `main.ts` далі закриває базу. Жорсткий вихід за 10 с лишається (Render чекає до 30 с).
- **Клієнт.** Подія `restarting` → стан `restarting`. Розрив з причиною `io server disconnect` без попереднього `closed` → `restarting` і `socket.connect()` через `RETRY_MS = 1500` (socket.io сам не перепідключається після розриву сервером). `connect_error` з `restarting` → `restarting` і повтор через 1,5 с (після відмови проміжної функції socket.io теж не повторює сам: `socket.active === false`). Інші помилки з'єднання (сервер ще не слухає) — socket.io повторює сам; стан `restarting`, якщо до цього прийшла подія `restarting`, інакше `offline`. Перший `state` — `live`. «Цієї гри вже немає» — лише `unauthorized` або `closed`, як і раніше. Пульт без локальних токенів на 503 `restarting` питає `host-access` ще раз через 1,5 с.
- **Тексти:** `restarting` «Сервер перезапускається… Гра продовжиться сама.», `err_restarting` «Сервер перезапускається. Спробуйте за кілька секунд.».
- **Чого не робимо.** Кілька процесів одночасно не підтримуються: кімнати живуть у пам'яті одного процесу, оренда лише не дає двом процесам вести ту саму кімнату під час розгортання (на Render один екземпляр). Запрошення друзів у лобі (`Invites`) живуть у пам'яті й після перезапуску зникають — гра й гравці лишаються. Зміна формату `GameState` (підняття `GAME_STATE_VERSION`) у пуші й далі перериває ігри, що йдуть.

## Глобальні обмеження

- Рушій чистий: `now` і `rng` — аргументи; `suspend` не читає годинника.
- Анти-ціль «неправильний стан»: після відновлення бали, черга, бафи, дебафи, гравці, токени й поточне запитання — ті самі, що в мить збереження; змінюються лише `paused`/`pausedAt`/`remainingMs`/`startedAt`/`endsAt` паузи і `connected` гравців. Тест сховища порівнює зрізи всіх ролей з точністю до цих полів.
- Збій бази не зупиняє гри: запис кімнати, як і записувач результатів, журналює помилку й повторює.
- Без `persist` (модульні тести сервера, що не про перезапуск) поведінка не змінюється: таблиця не пишеться, `markInterrupted` у тестах не викликається.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`. Банер `restarting` використовує наявний клас `.banner.is-offline` (`position` — як у банера «Немає зв'язку», нічого не зсуває).
- Кожна задача з логікою починається з тесту, що падає. Перед комітом зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2` (якщо PGlite падає з браком пам'яті — окремо `pnpm vitest run --maxWorkers=2 packages`, `pnpm vitest run --maxWorkers=1 apps/server`, `pnpm vitest run --maxWorkers=2 apps/web`).
- Наскрізні тести: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Кадри — з `E2E_SHOTS=1` у `apps/server/e2e/artifacts/shots`.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (проєкт тестовий). Сам цей пуш перезапустить Render ще старим кодом (без збереження) — ігри, що йдуть у цю мить, ще зникнуть; захист діє з наступного пушу.

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/engine/src/restore.ts` (новий), `packages/engine/src/index.ts` | `suspend`, `GAME_STATE_VERSION` | 1 |
| `packages/engine/src/restore.test.ts` (новий) | пауза в мить збереження, JSON, ключі стану | 1 |
| `apps/server/src/db/schema.ts`, `apps/server/drizzle/0010_live_rooms.sql` (згенерований), `apps/server/drizzle/meta/*` | таблиця `live_room` | 2 |
| `apps/server/src/db/schema.test.ts` | тест таблиці й міграції | 2 |
| `apps/server/src/recorder.ts`, `apps/server/src/recorder.test.ts` | `markInterrupted(db, except)`, `markAborted(db, ids)` | 2 |
| `packages/shared/src/events.ts` | `ServerErrorCode` + `'restarting'`, подія `restarting` | 3 |
| `apps/server/src/rooms/manager.ts` | `SavedRoom`, `snapshot`, `restore`, `freeze`, `evict`, `setReserved`, `rooms()`, подія `moved` | 3 |
| `apps/server/src/rooms/manager.restore.test.ts` (новий) | відновлення в менеджері | 3 |
| `apps/server/src/rooms/store.ts` (новий), `apps/server/src/rooms/store.test.ts` (новий) | `RoomStore` | 4 |
| `apps/server/src/app.ts`, `apps/server/src/socket.ts`, `apps/server/src/account-routes.ts`, `apps/server/src/main.ts` | `persist`, `locate`, `shutdown`, 503 `restarting`, асинхронна перевірка сокета | 5 |
| `apps/server/src/restart.test.ts` (новий) | перезапуск зі справжніми сокетами | 5 |
| `apps/web/src/live/useGame.ts`, `apps/web/src/live/useGame.test.tsx` (новий), `apps/web/src/pages/Play.tsx`, `Host.tsx`, `Stage.tsx`, `Play.test.tsx`, `Host.test.tsx`, `apps/web/src/i18n.ts` | стан `restarting`, перепідключення | 6 |
| `apps/server/e2e/full-game.e2e.ts` | `persist` в усіх сценаріях, `restart()`, сценарій 9b | 7 |

## Порядок збирання

- Задача 1 (рушій) і задача 2 (база) незалежні.
- Задача 3 — на 1; задача 4 — на 2 і 3; задача 5 — на 4; задача 6 — на 3 (подія й код помилки в `shared`), сервер для неї не потрібен; задача 7 — остання.
- Навмисні зміни наявних очікувань (лише такі): тест `markInterrupted` у `recorder.test.ts` (якщо є) отримує другий аргумент `[]`; тести `Play`/`Host`/`Stage`, що чекали «Немає зв'язку» після `disconnect` з причиною `io server disconnect`, тепер чекають «Сервер перезапускається…»; підставний сокет у веб-тестах отримує `active` і `connect()`.

## На що дивитися рецензентові

1. **Час простою нікому не коштує.** Залишок часу після відновлення — той, що був у мить запису; бафи, дебафи, голосування, заставки й черги зсуваються на паузу наявним `resume`. Тести: задача 1, `pauses a running question at the moment it was saved`; задача 4, `a new manager restores the room: the same views except the pause`.
2. **Дві версії не ведуть ту саму кімнату.** Рядок живого іншого процесу не підхоплюється (`restarting`), віддані й покинуті — підхоплюються; запис чужої кімнати не проходить і виселяє її. Тести: задача 4, `a room owned by a live instance is not taken`, `a released or abandoned room is taken`, `losing the lease evicts the room`.
3. **«Гри немає» лише тоді, коли її справді немає.** Сервер відповідає `restarting` на кімнату з бази й `unauthorized` лише на невідомий код; клієнт не стирає токен на `restarting`. Тести: задача 5, `answers restarting while another instance owns the room`; задача 6, `keeps the token and shows «Сервер перезапускається…»`.
4. **Історія.** Відновлена гра лишається `running` і закінчується `finished`; кімнати, старші за добу, і зламані рядки — `aborted`. Тести: задача 4, `boot drops day-old rooms and aborts their games`; задача 7 (історія після гри з перезапуском).
5. **Формат стану закріплено.** Тест ключів `GameState` падає, якщо формат змінили без `GAME_STATE_VERSION`. Тест: задача 1, `the state format is pinned to GAME_STATE_VERSION`.

---

### Задача 1. Рушій: стан після перезапуску — пауза в мить збереження; версія формату стану

**Files:**
- Create: `packages/engine/src/restore.ts`
- Modify: `packages/engine/src/index.ts` (`export * from './restore';`)
- Create: `packages/engine/src/restore.test.ts`

**Interfaces:**
- Produces (`engine`):
  ```ts
  /** Версія формату GameState для збережених кімнат (9b). Піднімати, коли змінюється форма стану; кімнати іншої версії не відновлюються. */
  export const GAME_STATE_VERSION = 1;
  /**
   * Стан кімнати після перезапуску сервера: доведений до миті збереження `at`, на паузі саме з цієї миті
   * (крім лобі й фінішу; уже поставлений на паузу лишається як був), усі гравці поза зв'язком.
   */
  export function suspend(state: GameState, at: number): GameState;
  ```
- Реалізація: `let s = tick(state, at); if (s.phase !== 'lobby' && s.phase !== 'finished' && !s.paused) { const paused = pause(s, at); if (paused.ok) s = paused.state; } for (const p of s.players) if (p.connected) { const off = setConnected(s, p.id, false, at); if (off.ok) s = off.state; } return s;` — порядок важливий: на паузі `setConnected` не заводить відліку відсутності на полі й `autoLock` нічого не закриває.

- [ ] **Step 1: Write the failing tests** у `restore.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { takeBuff } from './buffs';
  import { resume, submitAnswer, tick, type GameState } from './game';
  import { GAME_STATE_VERSION, suspend } from './restore';
  import { T0, toBuffCell, toBuffQuestion, toOthersQuestion } from './testing/buffs';
  import { toDuelQuestion } from './testing/duel';
  import { makeQuiz, single } from './testing/fixtures';
  import { lobbyWith, must, startRound } from './testing/helpers';
  import { hostView, playerView, stageView } from './views';

  const HOUR = 3_600_000;
  const kyiv = { type: 'single', optionId: 'b' } as const;
  const roundTrip = (s: GameState): GameState => JSON.parse(JSON.stringify(s)) as GameState;

  describe('suspend after a restart', () => {
    it('pauses a running question at the moment it was saved, so the downtime costs nobody time', () => {
      const answered = must(submitAnswer(toBuffQuestion(), 'p2', kyiv, T0 + 3000));
      const s = suspend(answered, T0 + 5000);
      expect(s.paused).toBe(true);
      expect(s.pausedAt).toBe(T0 + 5000);
      expect(s.remainingMs).toBe(15_000);
      expect(s.players.every((p) => !p.connected)).toBe(true);
      // відповідь Петра й бали ті самі
      expect(s.plays[0]).toEqual(answered.plays[0]);
      // година простою: після «Продовжити» лишається ті самі 15 с
      const resumed = must(resume(s, T0 + 5000 + HOUR));
      expect(resumed.endsAt).toBe(T0 + 5000 + HOUR + 15_000);
      expect(submitAnswer(resumed, 'p1', kyiv, T0 + HOUR + 19_000).ok).toBe(true);
    });

    it('a deadline that passed before the save is applied first', () => {
      const s = suspend(toBuffQuestion(), T0 + 20_001);
      expect(s.phase).toBe('locked');
      expect(s.paused).toBe(true);
    });

    it('a vote clock and extra time move with the pause', () => {
      const asked = must(takeBuff(toOthersQuestion(), 'p1', 'audience', T0 + 5000, () => 0));
      const resumed = must(resume(suspend(asked, T0 + 6000), T0 + 6000 + HOUR));
      expect(resumed.plays[0].buffs?.p1.vote?.endsAt).toBe(asked.plays[0].buffs!.p1.vote!.endsAt! + HOUR);
    });

    it('keeps a state that was already paused as it was, apart from the connections', () => {
      // pause о T0 + 4000, suspend о T0 + 9000: pausedAt T0 + 4000, remainingMs 16_000
    });

    it('leaves the lobby and the finished game unpaused', () => {
      const lobby = lobbyWith(makeQuiz([single]), 'Оля', 'Петро');
      const s = suspend(lobby, T0);
      expect(s.paused).toBe(false);
      expect(s.players.map((p) => p.connected)).toEqual([false, false]);
      // фініш: end(…) → suspend → paused false
    });

    it('pauses a board cell and a duel too', () => {
      expect(suspend(toBuffCell(), T0 + 1000).paused).toBe(true);
      const duel = suspend(toDuelQuestion(), T0 + 61_000);
      expect(duel.paused).toBe(true);
      expect(duel.remainingMs).not.toBeNull();
    });
  });

  describe('the saved state', () => {
    it('survives JSON unchanged, and so do its views', () => {
      const states = [toBuffQuestion(), toBuffCell(), toOthersQuestion(), toDuelQuestion(), must(takeBuff(toBuffCell(), 'p1', 'fifty', T0 + 1000, () => 0))];
      for (const s of states) {
        expect(roundTrip(s)).toEqual(s);
        expect(hostView(roundTrip(s))).toEqual(hostView(s));
        expect(stageView(roundTrip(s))).toEqual(stageView(s));
        expect(playerView(roundTrip(s), 'p1')).toEqual(playerView(s, 'p1'));
      }
    });

    it('the state format is pinned to GAME_STATE_VERSION', () => {
      // Ключі верхнього рівня стану, гравця й запису запитання з кількох станів (класика, поле з бафом, дуель).
      // Якщо тест упав, бо змінився формат: підніміть GAME_STATE_VERSION і додайте новий рядок у KEYS.
      const KEYS: Record<number, string> = { 1: '…записати під час реалізації…' };
      const states = [toBuffQuestion(), must(takeBuff(toBuffCell(), 'p1', 'fifty', T0 + 1000, () => 0)), toDuelQuestion()];
      const keys = (objects: object[]) => [...new Set(objects.flatMap((o) => Object.keys(o)))].sort().join(',');
      const shape = [keys(states), keys(states.flatMap((s) => s.players)), keys(states.flatMap((s) => s.plays))].join(' | ');
      expect(shape).toBe(KEYS[GAME_STATE_VERSION]);
    });
  });
  ```
  Чернеткові коментарі розписати повними перевірками за тим самим зразком (`pause` і `end` з `./game`). У `KEYS[1]` записати фактичний рядок, який дасть перший прогін (і перевірити очима, що в ньому немає випадкових ключів на кшталт id гравців).

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL: немає `./restore`.

- [ ] **Step 3: Implement** за Interfaces; експорт з `index.ts`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages`. Очікується PASS (якщо `roundTrip` не дорівнює оригіналу — знайти поле з `undefined` у масиві, `Map`, `Set` чи `NaN` і виправити рушій так, щоб стан був JSON-чистим; це вада, а не привід послабити тест).

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): suspend — the state after a server restart is paused at the moment it was saved and everybody is offline; GAME_STATE_VERSION pins the saved state format"
```

---

### Задача 2. База: таблиця `live_room` (міграція 0010) і перервані ігри з винятками

**Files:**
- Modify: `apps/server/src/db/schema.ts` (`liveRoom`)
- Create (згенерувати): `apps/server/drizzle/0010_live_rooms.sql`, `apps/server/drizzle/meta/0010_snapshot.json`; Modify: `apps/server/drizzle/meta/_journal.json`
- Modify: `apps/server/src/db/schema.test.ts`
- Modify: `apps/server/src/recorder.ts` (`markInterrupted`, `markAborted`), `apps/server/src/recorder.test.ts`

**Interfaces:**
- Produces (`schema.ts`):
  ```ts
  /** Жива кімната (9b): серіалізований SavedRoom, щоб гра пережила перезапуск. Рядок видаляється, коли кімната закривається. */
  export const liveRoom = pgTable('live_room', {
    code: text('code').primaryKey(),
    roomId: uuid('room_id').notNull().unique(),
    data: jsonb('data').$type<unknown>().notNull(),
    /** Процес, що веде кімнату; null — віддано на зупинці, будь-хто може підхопити. */
    owner: text('owner'),
    heartbeatAt: at('heartbeat_at'),
    updatedAt: at('updated_at').notNull(),
  });
  ```
- Produces (`recorder.ts`):
  ```ts
  /** Ігри «в процесі» з минулого запуску, крім ігор кімнат, що відновлюються (except — їхні id). */
  export async function markInterrupted(db: Db, except: string[] = []): Promise<void>;
  /** Перервати конкретні ігри, якщо вони ще «в процесі» (кімнати, що не відновлюються). */
  export async function markAborted(db: Db, ids: string[]): Promise<void>;
  ```
  `markInterrupted`: умова `except.length === 0 ? eq(game.status, 'running') : and(eq(game.status, 'running'), notInArray(game.id, except))`. `markAborted`: `ids.length === 0` — нічого; інакше `and(eq(game.status, 'running'), inArray(game.id, ids))`, `finishedAt: new Date()`.

- [ ] **Step 1: Write the failing tests.** У `schema.test.ts`:
  ```ts
  describe('live rooms schema', () => {
    it('stores a saved room as JSON and finds it by code', async () => {
      const { liveRoom } = await import('./schema');
      const db = await createTestDb();
      const roomId = '33333333-3333-4333-8333-333333333333';
      const data = { v: 1, code: '123456', state: { phase: 'question', endsAt: 1_000_000, players: [] } };
      await db.insert(liveRoom).values({ code: '123456', roomId, data, owner: 'a', heartbeatAt: new Date(), updatedAt: new Date() });
      const [row] = await db.select().from(liveRoom).where(eq(liveRoom.code, '123456'));
      expect(row.data).toEqual(data);
      expect(row.owner).toBe('a');
      await expect(db.insert(liveRoom).values({ code: '654321', roomId, data, updatedAt: new Date() })).rejects.toThrow();
    });

    it('the migration adds the table to a database from before 9b', async () => {
      const { db, migrateRest } = await createTestDbUpTo('0009_answer_spares');
      await migrateRest();
      const result = await db.execute(sql`select count(*)::int as n from live_room`);
      expect(result.rows[0]).toEqual({ n: 0 });
    });
  });
  ```
  (Якщо `db.execute` у PGlite повертає інший вигляд — взяти той, яким уже користуються інші тести міграцій у цьому файлі.)
  У `recorder.test.ts`:
  ```ts
  it('marks running games interrupted, except the rooms being restored', async () => {
    // три ігри running (g1, g2, g3) і одна finished → markInterrupted(db, [g2]) → g1, g3 aborted з finishedAt, g2 running, finished без змін
  });
  it('aborts only the given running games', async () => {
    // markAborted(db, [g1]) → g1 aborted, g2 running; markAborted(db, []) нічого не робить
  });
  ```
  Ігри вставити так само, як наявний тест `markInterrupted` у цьому файлі (або `insert(game)` з `hostId` зареєстрованого `user`).

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/db apps/server/src/recorder.test.ts`. Очікується FAIL: немає `liveRoom`, `markAborted`, другого аргументу.

- [ ] **Step 3: Implement.** Додати `liveRoom` у `schema.ts`, потім з теки `apps/server`: `pnpm exec drizzle-kit generate --name live_rooms` (генерація не потребує бази). Перевірити, що файл названо `0010_live_rooms.sql`, і дописати першим рядком коментар у стилі попередніх: `-- Живі кімнати (план 9b): стан гри, щоб вона пережила перезапуск сервера.`. Змінити `markInterrupted`, додати `markAborted` (імпорт `inArray`).

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=1 apps/server`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/db apps/server/drizzle apps/server/src/recorder.ts apps/server/src/recorder.test.ts
git commit -m "feat(server): the live_room table (migration 0010) keeps a saved room per code with its owner and heartbeat; interrupted games skip the rooms being restored"
```

---

### Задача 3. Менеджер: знімок кімнати, відновлення, заморожування на зупинці

**Files:**
- Modify: `packages/shared/src/events.ts` (`ServerErrorCode`, `ServerToClientEvents.restarting`)
- Modify: `apps/server/src/rooms/manager.ts`
- Create: `apps/server/src/rooms/manager.restore.test.ts`

**Interfaces:**
- Produces (`shared`):
  ```ts
  export type ServerErrorCode = 'unauthorized' | 'forbidden' | 'invalid_payload' | 'game_not_found' | 'restarting';
  // ServerToClientEvents:
  /** Сервер зупиняється (нова версія) або кімнату веде інший процес: перепідключитися з тим самим токеном. */
  restarting: () => void;
  ```
- Produces (`manager.ts`):
  ```ts
  export const SAVED_ROOM_VERSION = 1;
  export interface SavedRoom {
    v: typeof SAVED_ROOM_VERSION;
    stateVersion: number;
    id: string;
    code: string;
    hostToken: string;
    stageToken: string;
    hostUserId: string | null;
    quizId: string | null;
    playerUsers: [string, string][];
    playerTokens: [string, string][];
    state: GameState;
    tickedTo: number;
    /** Мить знімка за годинником менеджера; відновлений стан стоїть на паузі з неї. */
    savedAt: number;
  }
  /** Перевірка рядка з бази: та сама версія знімка й стану, на місці поля, без яких кімнату не підняти. */
  export function isSavedRoom(raw: unknown): raw is SavedRoom;

  export type RoomEvent = { type: 'changed' } | { type: 'kicked'; playerId: string } | { type: 'closed' } | { type: 'moved' };

  // RoomManager:
  snapshot(room: Room): SavedRoom;            // savedAt = this.now(); state за посиланням (він незмінний)
  /** Піднімає збережену кімнату; null — код уже живий у пам'яті або менеджер заморожено. */
  restore(saved: SavedRoom): Room | null;
  /** Зупинка: дії відповідають restarting, з'єднання й таймери більше не змінюють стану. */
  freeze(): void;
  get frozen(): boolean;
  /** Кімнату тепер веде інший процес: прибрати з пам'яті без видалення з бази. */
  evict(room: Room): void;
  /** Коди кімнат із бази, яких немає в пам'яті: новим кімнатам не видаються. */
  setReserved(codes: Iterable<string>): void;
  /** Усі живі кімнати (для запису на зупинці). */
  rooms(): Room[];
  ```
- `restore`: `if (this.frozen || this.rooms.has(saved.code)) return null;` → кімната з `state: suspend(saved.state, saved.savedAt)`, `playerUsers`/`playerTokens` з пар, `connections: new Map()`, `deadline/absence/expiry: null`, `expiryPhase: null`, `tickedTo: saved.tickedTo`; `this.rooms.set`; `this.reserved.delete(code)`; `this.hostLeft(room)` (стан уже на паузі — заводиться лише таймер відсутності; для лобі й фінішу `hostLeft` нічого не робить); `this.commit(room, room.state)` — таймери кімнати й подія `changed` (записувач і сховище її отримають).
- `alive(room)` стає `!this.frozen && this.rooms.get(room.code) === room`; у всіх методах дій `if (!this.alive(room)) return GONE;` → `return this.gone();`, де `gone()` — `this.frozen ? RESTARTING : GONE` (`RESTARTING: AckResult = { ok: false, error: 'restarting' }`). `connect`/`disconnect` уже виходять на `!alive`.
- `freeze`: `frozen = true`; для кожної кімнати зняти `deadline`, `absence`, `expiry` (`scheduler.clearTimeout`) і обнулити.
- `evict`: зняти таймери, `rooms.delete(code)`, `emit(room, { type: 'moved' })`.
- `newCode` пропускає й `reserved`.
- `isSavedRoom`: об'єкт з `v === SAVED_ROOM_VERSION`, `stateVersion === GAME_STATE_VERSION`, рядками `id`, `code`, `hostToken`, `stageToken`, масивами `playerUsers`, `playerTokens`, числами `tickedTo`, `savedAt` і об'єктом `state` з масивом `players`.

- [ ] **Step 1: Write the failing tests** у `manager.restore.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { makeQuiz, single, text } from '@quiz/engine/testing';
  import { GAME_STATE_VERSION } from '@quiz/engine';
  import { FakeScheduler } from '../testing/fake-scheduler';
  import { HOST_ABSENCE_MS, RoomManager, isSavedRoom, type Identity, type Room } from './manager';

  const HOST: Identity = { role: 'host', playerId: null };
  const correct = { type: 'single', optionId: 'b' } as const;
  const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

  /** Ведучий, Олена й Тарас; Олена відповіла на перше запитання через 5 с. */
  function midQuestion() {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const room = manager.create(makeQuiz([single, text]), 'u1', 'q1');
    manager.connect(room, HOST);
    const olena = manager.join(room.code, 'Олена', 'u2');
    const taras = manager.join(room.code, 'Тарас');
    if (!olena.ok || !taras.ok) throw new Error('join');
    for (const j of [olena, taras]) manager.connect(room, { role: 'player', playerId: j.playerId });
    manager.host(room, { type: 'start' });
    manager.host(room, { type: 'next' });
    scheduler.advance(5000);
    manager.answer(room, olena.playerId, correct);
    return { scheduler, manager, room, olena, taras };
  }

  describe('a room restored after a restart', () => {
    it('comes back with the same code, tokens, players and answers, paused at the moment of the snapshot', () => {
      const { scheduler, manager, room, olena, taras } = midQuestion();
      const saved = viaJson(manager.snapshot(room));
      manager.freeze(); // старий процес зупинився: його таймери зняті й не плутають scheduler.pending()
      expect(isSavedRoom(saved)).toBe(true);
      expect(saved.stateVersion).toBe(GAME_STATE_VERSION);

      scheduler.advance(60 * 60_000); // година простою
      const next = new RoomManager(scheduler, () => 0.5);
      const back = next.restore(saved) as Room;
      expect(back.code).toBe(room.code);
      expect(next.identify(room.code, 'host', room.hostToken)?.room).toBe(back);
      expect(next.identify(room.code, 'stage', room.stageToken)?.room).toBe(back);
      expect(next.identify(room.code, 'player', olena.token)?.identity.playerId).toBe(olena.playerId);
      expect(back.playerUsers.get(olena.playerId)).toBe('u2');
      expect(back.state.paused).toBe(true);
      expect(back.state.remainingMs).toBe(room.state.endsAt! - saved.savedAt);
      expect(back.state.players.every((p) => !p.connected)).toBe(true);
      // поки на паузі — жодного таймера запитання; лише відсутність ведучого
      expect(scheduler.pending()).toEqual([HOST_ABSENCE_MS]);

      next.connect(back, HOST);
      next.connect(back, { role: 'player', playerId: taras.playerId });
      expect(next.host(back, { type: 'resume' })).toEqual({ ok: true });
      expect(scheduler.pending()).toEqual([room.state.endsAt! - saved.savedAt]);
      expect(next.answer(back, taras.playerId, correct)).toEqual({ ok: true });
    });

    it('ends the game when the host does not come back in 10 minutes', () => {
      // restore → advance(HOST_ABSENCE_MS) → back.state.phase === 'finished'
    });

    it('refuses a code that is already alive and a snapshot of another version', () => {
      // next.restore(saved) двічі → другий раз null; isSavedRoom({ ...saved, stateVersion: GAME_STATE_VERSION + 1 }) === false; isSavedRoom(null) === false
    });

    it('a lobby comes back unpaused and keeps taking players', () => {
      // create → join → snapshot → restore → state.phase 'lobby', paused false, next.join(code, 'Іра').ok
    });
  });

  describe('freezing on shutdown', () => {
    it('answers restarting to every action and changes nothing on disconnect or timers', () => {
      const { scheduler, manager, room, taras } = midQuestion();
      const before = room.state;
      manager.freeze();
      expect(manager.answer(room, taras.playerId, correct)).toEqual({ ok: false, error: 'restarting' });
      expect(manager.host(room, { type: 'lock' })).toEqual({ ok: false, error: 'restarting' });
      manager.disconnect(room, { role: 'player', playerId: taras.playerId });
      scheduler.advance(60_000);
      expect(room.state).toBe(before);
      expect(scheduler.pending()).toEqual([]);
    });
  });

  describe('eviction and reserved codes', () => {
    it('an evicted room leaves memory with a moved event and is not closed', () => {
      // onEvent збирає події → evict(room) → події [{ type: 'moved' }], manager.get(code) undefined, answer → game_not_found
    });
  });
  ```
  Чернеткові коментарі розписати повними перевірками.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/rooms`. Очікується FAIL: немає `snapshot`, `restore`, `freeze`.

- [ ] **Step 3: Implement** за Interfaces (імпорт `suspend`, `GAME_STATE_VERSION` з `@quiz/engine`).

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS (наявні тести менеджера без змін: без `freeze` поведінка та сама; `RoomEvent` з `moved` не ламає записувача й запрошень — вони дивляться лише на `changed`/`closed`; `socket.ts` має обробити `moved` у задачі 5 — до того вона йде гілкою «закрити з `expired`», тож у цій задачі додати в `socket.ts` мінімальну гілку `moved` → `socket.emit('restarting')` + `disconnect(true)`, щоб typecheck і поведінка були чесними).

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/server/src/rooms apps/server/src/socket.ts
git commit -m "feat(server): a room snapshot and restore — same code, tokens, players and answers, paused at the snapshot with the host-absence timer; freeze answers restarting on shutdown; evict and reserved codes"
```

---

### Задача 4. Сховище кімнат: запис раз на секунду, оренда, підйом на старті й на вимогу

**Files:**
- Create: `apps/server/src/rooms/store.ts`
- Create: `apps/server/src/rooms/store.test.ts`

**Interfaces:**
- Produces:
  ```ts
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

  export class RoomStore {
    constructor(db: Db, manager: RoomManager, options: RoomStoreOptions);
    /** Старт процесу: чистка застарілих, перервані ігри (крім кімнат з бази), підйом вільних рядків. Повертає кількість піднятих. */
    boot(): Promise<number>;
    /** Періодична робота: серцебиття своїх рядків, підхоплення вільних і покинутих, чистка, зарезервовані коди. */
    tick(): Promise<void>;
    /** Запускає tick кожні HEARTBEAT_MS (setInterval з unref). */
    start(): void;
    stop(): void;
    /** Кімната є в пам'яті, або її вдалося підхопити з бази → 'here'; рядок живого іншого процесу → 'restarting'; рядка немає → 'none'. */
    locate(code: string): Promise<Located>;
    /** Записати всі кімнати зараз (release — з owner = null) і дочекатися записів. */
    flushAll(options?: { release?: boolean }): Promise<void>;
    /** Завершується, коли всі поставлені записи виконано (для тестів). */
    idle(): Promise<void>;
  }
  ```
- Конструктор підписується на `manager.onEvent`: `changed` → `schedule(room)`; `closed` → зняти таймер, дочекатися запису в польоті, `DELETE FROM live_room WHERE code = $1 AND owner = $me`; `moved` → зняти таймер і забути.
- `schedule(room)`: якщо таймера немає — `setTimeout(() => write(room), saveDelayMs)` (`unref`); якщо запис у польоті — позначка `dirty`, після запису `schedule` ще раз.
- `write(room, owner = me)`: `const saved = manager.snapshot(room)`; upsert:
  ```ts
  const rows = await db.insert(liveRoom)
    .values({ code: room.code, roomId: room.id, data: saved, owner, heartbeatAt: new Date(now()), updatedAt: new Date(now()) })
    .onConflictDoUpdate({ target: liveRoom.code, set: { data: saved, owner, heartbeatAt: new Date(now()), updatedAt: new Date(now()) }, setWhere: eq(liveRoom.owner, me) })
    .returning({ code: liveRoom.code });
  if (rows.length === 0) manager.evict(room); // кімнату веде інший процес
  ```
  Збій → `onError`, повтор через `RETRY_MS` (якщо кімната ще жива в менеджері).
- Вільний рядок: `or(isNull(liveRoom.owner), lt(liveRoom.heartbeatAt, new Date(now() - LEASE_MS)))` і `gt(liveRoom.updatedAt, new Date(now() - MAX_AGE_MS))`.
- `adopt(where)`: `UPDATE live_room SET owner = me, heartbeat_at = now WHERE <вільний> [AND code = $1] RETURNING code, room_id, data`; для кожного рядка: `isSavedRoom(data)` → `manager.restore(data)`; інакше (чужа версія, зламаний JSON) — журнал, `markAborted(db, [roomId])`, `DELETE` рядка.
- `boot()`: (1) `DELETE … WHERE updated_at < now − MAX_AGE_MS RETURNING room_id` → `markAborted`; (2) `SELECT room_id FROM live_room` → `markInterrupted(db, ids)`; (3) `adopt()` усіх вільних; (4) `manager.setReserved(коди рядків, яких немає в пам'яті)`.
- `tick()`: `UPDATE … SET heartbeat_at = now WHERE owner = me`; чистка застарілих чужих рядків (`owner IS DISTINCT FROM me` як `or(isNull(owner), ne(owner, me))`) з `markAborted`; `adopt()`; `setReserved`.
- `locate(code)`: `manager.get(code)` → `'here'`; інакше зливати одночасні виклики (мапа `code → Promise<Located>`): `adopt(code)` підняв → `'here'`; інакше `SELECT` рядка: є й не старший за добу → `'restarting'`; немає → `'none'`.
- `flushAll({ release })`: зняти всі таймери, дочекатися записів у польоті, `write(room, release ? null : me)` для кожної `manager.rooms()`.

- [ ] **Step 1: Write the failing tests** у `store.test.ts` (PGlite, `FakeScheduler`, `saveDelayMs: 0` там, де не перевіряється частота):
  ```ts
  import { eq } from 'drizzle-orm';
  import { describe, expect, it } from 'vitest';
  import { makeQuiz, single, text } from '@quiz/engine/testing';
  import type { Db } from '../db/client';
  import { game, liveRoom, user } from '../db/schema';
  import { attachRecorder } from '../recorder';
  import { FakeScheduler } from '../testing/fake-scheduler';
  import { createTestDb } from '../testing/test-db';
  import { RoomManager, type Identity, type Room } from './manager';
  import { LEASE_MS, MAX_AGE_MS, RoomStore } from './store';

  const HOST: Identity = { role: 'host', playerId: null };
  const correct = { type: 'single', optionId: 'b' } as const;
  /** Поля паузи й зв'язку — єдине, чим відновлений зріз може відрізнятися. */
  const steady = (view: unknown) => JSON.parse(JSON.stringify(view, (key, value) =>
    ['paused', 'endsAt', 'startedAt', 'remainingMs', 'connected', 'serverNow'].includes(key) ? undefined : value));

  async function world(db?: Db) {
    const base = db ?? (await createTestDb());
    await base.insert(user).values({ id: 'u1', name: 'Ведучий', email: 'h@example.com' }).onConflictDoNothing();
    const scheduler = new FakeScheduler();
    const make = (instanceId: string) => {
      const manager = new RoomManager(scheduler, () => 0.5);
      const recorder = attachRecorder(manager, base);
      const store = new RoomStore(base, manager, { instanceId, now: () => scheduler.now(), saveDelayMs: 0 });
      return { manager, recorder, store };
    };
    return { db: base, scheduler, make };
  }

  /** Гра на першому запитанні: Олена відповіла, Тарас ні. */
  function playing(manager: RoomManager, scheduler: FakeScheduler) { /* як midQuestion у manager.restore.test.ts, з hostUserId 'u1' */ }

  describe('saving live rooms', () => {
    it('a new manager restores the room: the same views except the pause', async () => {
      const w = await world();
      const a = w.make('a');
      const { room, olena, taras } = playing(a.manager, w.scheduler);
      await a.store.flushAll({ release: true });
      await a.recorder.idle();

      w.scheduler.advance(10 * 60_000);
      const b = w.make('b');
      expect(await b.store.boot()).toBe(1);
      const back = b.manager.get(room.code) as Room;
      expect(back.state.paused).toBe(true);
      for (const who of [HOST, { role: 'stage', playerId: null }, { role: 'player', playerId: olena.playerId }, { role: 'player', playerId: taras.playerId }] as Identity[]) {
        expect(steady(b.manager.view(back, who))).toEqual(steady(a.manager.view(room, who)));
      }
      // гра в історії лишається «в процесі»
      const [row] = await w.db.select().from(game).where(eq(game.id, room.id));
      expect(row.status).toBe('running');
    });

    it('writes at most once a second per room', async () => {
      // store з saveDelayMs 1000 і справжніми таймерами vi.useFakeTimers(): три зміни підряд → один рядок з останнім станом після 1000 мс; до того рядка немає
    });

    it('deletes the row when the room closes', async () => {
      // лобі → advance(LOBBY_TTL_MS) → await store.idle() → select live_room порожньо
    });

    it('boot drops day-old rooms and aborts their games, and interrupts games without a saved room', async () => {
      // рядок з updatedAt now − MAX_AGE_MS − 1 і грою running → boot → рядка немає, гра aborted
      // інша гра running без рядка live_room → aborted; гра кімнати з рядком → running
    });

    it('a broken or other-version row is dropped and its game aborted', async () => {
      // рядок з data { v: 1, stateVersion: 999, … } → boot → 0 піднятих, рядка немає, гра aborted
    });
  });

  describe('the lease', () => {
    it('a room owned by a live instance is not taken', async () => {
      const w = await world();
      const a = w.make('a');
      const { room } = playing(a.manager, w.scheduler);
      await a.store.flushAll(); // owner лишається 'a'
      const b = w.make('b');
      expect(await b.store.boot()).toBe(0);
      expect(await b.store.locate(room.code)).toBe('restarting');
      expect(await b.store.locate('000000')).toBe('none');
      // b не видасть цей код новій кімнаті: b.manager.setReserved отримав room.code (перевірити через spy або b.manager.restore → null не потрібно)
    });

    it('a released or abandoned room is taken', async () => {
      // released: a.store.flushAll({ release: true }) → b.store.locate(code) === 'here'
      // abandoned: a.store.flushAll() без release → advance(LEASE_MS + 1) → b.store.tick() → b.manager.get(code) існує
      // живий: a.store.tick() кожні 5 с тримає оренду → b.store.locate === 'restarting' і через 60 с
    });

    it('losing the lease evicts the room and its sockets are told to reconnect', async () => {
      // a веде кімнату; b підхопила після LEASE_MS без серцебиття a; a.manager змінює стан → a.store запис повертає 0 рядків → подія moved, a.manager.get(code) undefined
    });

    it('two connections at once take the room once', async () => {
      // released рядок → Promise.all([b.store.locate(code), b.store.locate(code)]) → обидва 'here', один restore (b.manager.size === 1, одна подія changed від restore)
    });
  });
  ```
  Чернеткові коментарі розписати повними перевірками; рядки з минулими датами вставляти прямо `db.insert(liveRoom)` з `data: a.manager.snapshot(room)`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/rooms/store.test.ts`. Очікується FAIL: немає `./store`.

- [ ] **Step 3: Implement** за Interfaces.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=1 apps/server`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/rooms
git commit -m "feat(server): RoomStore — every room saved at most once a second, deleted when it closes, restored on boot or on the first connection; a lease with a heartbeat keeps two versions from running one room; day-old rooms are dropped and their games aborted"
```

---

### Задача 5. Сервер: збереження в `buildApp`, «перезапускається» замість «немає гри», зупинка на SIGTERM

**Files:**
- Modify: `apps/server/src/app.ts` (`AppOptions.persist`, `shutdown`, маршрути `by-code`, `join`)
- Modify: `apps/server/src/account-routes.ts` (`host-access`)
- Modify: `apps/server/src/socket.ts` (асинхронна `io.use`, `restarting`)
- Modify: `apps/server/src/main.ts`
- Create: `apps/server/src/restart.test.ts`

**Interfaces:**
- Produces (`app.ts`):
  ```ts
  // AppOptions:
  /** Зберігати живі кімнати в базі й піднімати їх після перезапуску (9b). main.ts і наскрізні тести вмикають. */
  persist?: { instanceId: string; saveDelayMs?: number };
  // buildApp повертає також:
  store: RoomStore | null;
  /** Зупинка без втрати ігор: заморозити, сказати клієнтам restarting, записати й віддати кімнати, закрити застосунок, дочекатися записувача. */
  shutdown: () => Promise<void>;
  ```
- `buildApp`: якщо `persist` — `store = new RoomStore(options.db, manager, persist)`, `await store.boot()`, `store.start()`, `app.addHook('onClose', () => store.stop())`. `locate = store === null ? (code) => Promise.resolve(manager.get(code) ? 'here' : 'none') : (code) => store.locate(code)`.
- `shutdown`: `manager.freeze(); io.emit('restarting'); await store?.flushAll({ release: true }); store?.stop(); await app.close(); await recorder.idle();`.
- Маршрути: на початку `by-code`, `join` і `host-access` — `if ((await locate(code)) === 'restarting') return reply.code(503).send({ error: 'restarting' });` (до перевірки користувача в `host-access` — відповідь однакова для всіх, вона не розкриває, чия гра). `registerAccountRoutes` отримує `locate` в опціях.
- `socket.ts`: `attachSockets(server, manager, locate)`; `io.use(async (socket, next) => { const auth = …; if (!auth.success) return next(new Error('unauthorized')); if ((await locate(auth.data.code)) === 'restarting') return next(new Error('restarting')); const found = manager.identify(…); … })`. Подія менеджера `moved` → кожному сокету кімнати `emit('restarting')` і `disconnect(true)`.
- `main.ts`: прибрати `markInterrupted(db)` (тепер у `store.boot()`), `buildApp({ …, persist: { instanceId: randomUUID() } })`, у `stop`: `await shutdown(); await closeDb();` замість `app.close()` + `recorder.idle()`. Коментарі: «Кімнати живуть у пам'яті й у таблиці live_room…»; про один екземпляр: «Кілька екземплярів одночасно не підтримуються: оренда лише не дає двом версіям вести ту саму кімнату під час розгортання».

- [ ] **Step 1: Write the failing tests** у `restart.test.ts`:
  ```ts
  import type { AddressInfo } from 'node:net';
  import { afterEach, describe, expect, it } from 'vitest';
  import { io as connect, type Socket } from 'socket.io-client';
  import { makeQuiz, single, text } from '@quiz/engine/testing';
  import type { ClientToServerEvents, GameView, ServerToClientEvents, SocketAuth } from '@quiz/shared';
  import { eq } from 'drizzle-orm';
  import { buildApp } from './app';
  import type { Db } from './db/client';
  import { game, liveRoom } from './db/schema';
  import { TEST_AUTH, startGame } from './testing/accounts';
  import { createTestDb } from './testing/test-db';

  type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
  type App = Awaited<ReturnType<typeof buildApp>>;
  const apps: App[] = [];
  const clients: Client[] = [];
  afterEach(async () => {
    for (const c of clients) c.close();
    for (const a of apps) await a.app.close().catch(() => undefined);
    clients.length = apps.length = 0;
  });

  async function boot(db: Db, instanceId: string, port = 0) {
    const ctx = await buildApp({ db, auth: TEST_AUTH, persist: { instanceId, saveDelayMs: 0 } });
    apps.push(ctx);
    await ctx.app.listen({ port, host: '127.0.0.1' });
    return { ctx, port: (ctx.app.server.address() as AddressInfo).port };
  }

  /** Клієнт, що перепідключається сам (як браузер), з останнім зрізом і подіями restarting. */
  function client(port: number, auth: SocketAuth) { /* connect(`http://127.0.0.1:${port}`, { auth, transports: ['websocket'], reconnectionDelay: 50, reconnectionDelayMax: 100 }); last, restarting-лічильник, until(test) */ }

  describe('a server restart', () => {
    it('keeps the game: the clients reconnect to a paused question and the host resumes it', async () => {
      const db = await createTestDb();
      const first = await boot(db, 'a');
      const { game: started } = await startGame(first.ctx.app, makeQuiz([single, text]));
      // Олена й Тарас входять через inject(join), ведучий і гравці — client(first.port, …); старт, «Далі», Олена відповідає
      // ...
      await first.ctx.shutdown();
      // host отримав 'restarting'; рядок live_room з owner null; гра в історії running
      const [row] = await db.select().from(liveRoom).where(eq(liveRoom.code, started.code));
      expect(row.owner).toBeNull();

      const second = await boot(db, 'b', first.port);
      // клієнти перепідключилися самі з тими самими токенами:
      // host: view.paused === true, phase 'question', questionIndex 0, гравці ті самі; Олена: me.answered (або як зріз гравця показує свою відповідь)
      // ведучий 'host:resume' → ok; Тарас відповідає → locked → reveal: бали Олени й Тараса правильні
      const [saved] = await db.select().from(game).where(eq(game.id, started.gameId));
      expect(saved.status).toBe('running');
    });

    it('answers restarting while another instance owns the room, and unauthorized for an unknown code', async () => {
      // a веде гру (без shutdown, лише store.flushAll() — owner 'a'); b стартує на тій самій базі
      // socket до b з правильним токеном → connect_error 'restarting'; з кодом '000000' → 'unauthorized'
      // b.ctx.app.inject POST /api/games/by-code/:code/join → 503 { error: 'restarting' }; GET /api/games/by-code/:code → 503
      // a.ctx.shutdown() → наступна спроба до b проходить і отримує зріз
    });

    it('an action during shutdown is refused with restarting, not lost', async () => {
      // manager.freeze() через shutdown: емітувати player:answer у мить між freeze і закриттям не вийде детерміновано —
      // перевірити на рівні ctx.manager: ctx.manager.freeze(); ctx.manager.answer(…) → { ok: false, error: 'restarting' }
    });
  });
  ```
  Чернеткові коментарі розписати повними перевірками (зразок `open`/`until`/`send` — `socket.test.ts`).

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/restart.test.ts`. Очікується FAIL: немає `persist`, `shutdown`.

- [ ] **Step 3: Implement** за Interfaces.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=1 apps/server`. Очікується PASS (наявні `socket.test.ts`, `app.test.ts` без `persist` — без змін поведінки; `connect_error` на неправильний токен і далі `unauthorized`).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src
git commit -m "feat(server): live games survive a restart — buildApp saves and restores rooms, sockets and join answer restarting while another instance still owns a room, SIGTERM freezes, tells the clients and hands the rooms over before closing"
```

---

### Задача 6. Веб: «Сервер перезапускається…» і тихе перепідключення

**Files:**
- Modify: `apps/web/src/live/useGame.ts`
- Create: `apps/web/src/live/useGame.test.tsx`
- Modify: `apps/web/src/pages/Play.tsx`, `apps/web/src/pages/Host.tsx`, `apps/web/src/pages/Stage.tsx`
- Modify: `apps/web/src/pages/Play.test.tsx`, `apps/web/src/pages/Host.test.tsx`
- Modify: `apps/web/src/i18n.ts` (`restarting`, `err_restarting`)

**Interfaces:**
- Produces:
  ```ts
  export type Status = 'connecting' | 'live' | 'offline' | 'restarting' | 'unauthorized';
  /** Пауза перед ручним перепідключенням, коли socket.io не робить цього сам. */
  export const RETRY_MS = 1500;
  ```
- `useGame` (у тому самому `useEffect`): локальні `let gone = false; let restarting = false; let retry: ReturnType<typeof setTimeout> | null = null;` і `const again = () => { if (retry === null) retry = setTimeout(() => { retry = null; socket.connect(); }, RETRY_MS); };`
  - `state` → `restarting = false`, `setStatus('live')` (як зараз);
  - `closed` → `gone = true`, `setClosed(reason)`;
  - `restarting` → `restarting = true`, `setStatus('restarting')`;
  - `disconnect(reason)` → `if (gone) return; if (reason === 'io server disconnect') { restarting = true; again(); } setStatus(restarting ? 'restarting' : 'offline');`
  - `connect_error(error)` → `unauthorized` як зараз; `restarting` → `restarting = true; setStatus('restarting'); again();`; інакше `setStatus(restarting ? 'restarting' : 'offline'); if (!socket.active) again();`
  - прибирання: `clearTimeout(retry)` перед `socket.close()`.
- Сторінки: де зараз `t(game.status === 'offline' ? 'offline' : 'connecting')` — `t(game.status === 'offline' ? 'offline' : game.status === 'restarting' ? 'restarting' : 'connecting')` (винести в `statusText(status)` у `useGame.ts` або поруч); банер над грою — для `offline` і `restarting` (той самий `.banner.is-offline`, текст за станом). Умови «гри немає» не змінюються (`unauthorized` або `closed`).
- `Host.tsx` (`useHostTokens`): `!result.ok && result.error === 'restarting'` → повторити `hostAccess` через `RETRY_MS` (стан лишається `asking`), інакше `denied` як зараз.
- Тексти: `restarting: 'Сервер перезапускається… Гра продовжиться сама.'`, `err_restarting: 'Сервер перезапускається. Спробуйте за кілька секунд.'`.

- [ ] **Step 1: Write the failing tests.** `useGame.test.tsx` (jsdom, підставний сокет як у `Play.test.tsx`, з полями `active = true`, `connect = vi.fn()`, `close = vi.fn()`), `vi.useFakeTimers()`:
  ```tsx
  // @vitest-environment jsdom
  import { act, renderHook } from '@testing-library/react';
  import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
  import { RETRY_MS, useGame } from './useGame';
  // vi.hoisted FakeSocket { connected, active, connect: vi.fn(), close: vi.fn(), on, emit, fire } + vi.mock('socket.io-client')

  const auth = { code: '123456', role: 'player', token: 't1' } as const;
  const view = { role: 'player', phase: 'question' /* … мінімум полів, як у фабриках PlayerScreen.test.tsx, або as unknown as GameView */ };

  describe('useGame across a server restart', () => {
    it('shows restarting after the server says so and reconnects by itself after a server-side disconnect', () => {
      const { result } = renderHook(() => useGame(auth));
      const socket = sockets[0];
      act(() => socket.fire('state', view, { serverNow: Date.now(), hostOnline: true }));
      act(() => socket.fire('restarting'));
      expect(result.current.status).toBe('restarting');
      act(() => socket.fire('disconnect', 'io server disconnect'));
      expect(result.current.status).toBe('restarting');
      expect(socket.connect).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(RETRY_MS));
      expect(socket.connect).toHaveBeenCalledTimes(1);
      act(() => socket.fire('state', view, { serverNow: Date.now(), hostOnline: true }));
      expect(result.current.status).toBe('live');
    });

    it('keeps trying while the server answers restarting', () => {
      // connect_error new Error('restarting'), socket.active = false → status restarting; advance(RETRY_MS) → connect 1 раз; ще раз → 2
    });

    it('a transport error is offline without a restart notice, restarting after one', () => {
      // connect_error new Error('websocket error'), active true → offline, connect не викликано (socket.io повторює сам)
      // після fire('restarting') та сама помилка → restarting
    });

    it('a kicked player is not reconnected', () => {
      // fire('closed', 'kicked'), fire('disconnect', 'io server disconnect') → closed 'kicked', advance → connect не викликано
    });
  });
  ```
  У `Play.test.tsx`:
  ```tsx
  it('keeps the token and shows «Сервер перезапускається…» instead of «гри немає»', async () => {
    savePlayer('123456', 'kept-token');
    open();
    act(() => sockets[0].fire('connect_error', new Error('restarting')));
    expect(screen.getByText('Сервер перезапускається… Гра продовжиться сама.')).toBeTruthy();
    expect(loadPlayer('123456')).toBe('kept-token');
    expect(screen.queryByText(/Цієї гри вже немає/)).toBeNull();
  });
  it('shows the restart banner over the game', async () => {
    // зріз гравця → fire('restarting') → .banner.is-offline з текстом restarting, PlayerScreen на місці
  });
  ```
  У `Host.test.tsx`: `hostAccess` спершу `{ ok: false, error: 'restarting' }`, потім `{ ok: true, hostToken, stageToken }` → після `RETRY_MS` створено сокет, «Немає доступу» не показано.
  Підставний `FakeSocket` у `Play.test.tsx`, `Host.test.tsx` отримує `active = true` і `connect() {}`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web`. Очікується FAIL: немає `RETRY_MS`, стану `restarting`, тексту.

- [ ] **Step 3: Implement** за Interfaces.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): «Сервер перезапускається…» instead of «гри немає» — phones, the stage and the host keep their tokens and reconnect by themselves after a restart; «гри немає» only when the server says so"
```

---

### Задача 7. Наскрізні: збереження в усіх сценаріях і сценарій 9b з перезапуском посеред запитання

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–6.
- Зміни каркаса файлу: `db` і `port` — змінні модуля (зараз локальні в `beforeAll`); `buildApp` у `beforeAll` з `persist: { instanceId: 'e2e-1' }` (як у `main.ts`; так усі наявні сценарії проходять із записом кімнат). Нова локальна:
  ```ts
  /** Перезапуск сервера як на Render: зупинка через shutdown (SIGTERM), нова версія на тій самій базі й порті. */
  let restarting = false;
  async function restart(between?: () => Promise<void>) {
    restarting = true;
    await ctx.shutdown();
    await between?.();
    ctx = await buildApp({ db, auth: { ...TEST_AUTH, baseURL: base }, webRoot: WEB, rng, transitions: true, persist: { instanceId: `e2e-${Date.now()}` } });
    await ctx.app.listen({ port, host: '127.0.0.1' });
  }
  ```
  Фільтр консолі в `open`: поки `restarting`, помилки `WebSocket connection to` не йдуть у `problems` (браузер журналює невдалі спроби, поки сервера немає); `restarting = false` у `beforeEach`.
- Допоміжні функції файлу: `open`, `register`, `join`, `shot`, `click`, `field`, `bodyText`, `expectNoSideScroll`, `snapshot`, `seconds`, `afterSplash`.

- [ ] **Step 1: Run the existing suite first.** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts` (уже з `persist`). Очікується PASS усіх наявних сценаріїв; якщо щось упало — записати причину. Запис кімнат асинхронний і не повинен змінювати жодного кроку гри; падіння через нього — вада задач 3–5, виправляти там (перевірок не послаблювати).

- [ ] **Step 2: Add the scenario** `it('part 9b: the server restarts in the middle of a question — the phones, the stage and the host show «Сервер перезапускається…», come back to a paused question with the answers kept, the host resumes and the game finishes into the history', …)` з `try/catch` і `snapshot()`. Підготовка:
  1. Ведучий `register(host, 'host', 'Олег Ведучий', 'host9b@example.com')`. Вікторина «Перезапуск» через `host.request.post(`${base}/api/quizzes`, { data })`: один класичний раунд `shuffleOptions: false`, `speedBonus: false`, `settings: { leaderboard: 'each', buffs: ['time'] }`: `q1` single «Найбільше озеро України?» — «Ялпуг» (правильний), «Світязь», «Синевир», «Кагул»; 100 балів, 60 с. `q2` text «Столиця Франції?» — «Париж»; 100 балів, 30 с.
  2. `stage` 1600 × 900, `olya` 375 × 812, `petro` 360 × 740. Приєднуються Оля й Петро; ведучий «Почати гру» → `afterSplash` → «Почати раунд» → `afterSplash`.

- [ ] **Step 3: Assertions and shots** (у такому порядку):
  1. **До перезапуску.** Оля бере «Додатковий час» і відповідає «Ялпуг»; Петро не відповідає. `const before = await seconds(stage)`.
  2. **Перезапуск.** `await restart(async () => { … })`, усередині (сервера немає): на телефоні Олі, у Петра, на сцені й на пульті — «Сервер перезапускається… Гра продовжиться сама.» (`getByText(…).waitFor()`); нігде немає «Цієї гри вже немає»; кадри `restart9b-down-375`, `restart9b-down-stage`, `restart9b-down-host`; `expectNoSideScroll(olya, 'restart9b-down-375')`.
  3. **Після перезапуску.** Без перезавантаження сторінок: банер зникає в усіх (`waitFor({ state: 'detached' })`), сцена й телефони показують «Пауза» на тому самому запитанні «Найбільше озеро України?»; у Олі її відповідь прийнята (той самий текст, що до перезапуску); ряд бафів Олі показує «Додатковий час» узятим; `seconds(stage)` у межах `before − 2 … before` і не зменшується за 3 с паузи; кадри `restart9b-back-375`, `restart9b-back-stage`, `restart9b-back-host`.
  4. **Ведучий продовжує.** «Продовжити» → таймер іде (`expect.poll(() => seconds(stage)).toBeLessThan(before)`); Петро відповідає «Світязь» → розкриття: Оля +100, Петро 0 (таблиця сцени).
  5. **Перезавантаження після перезапуску.** Петро перезавантажує сторінку (`petro.reload()`) — повертається в гру тим самим токеном (не форма входу); ведучий перезавантажує пульт — пульт на місці.
  6. **Друге запитання й фініш.** «Далі» → `q2`; обидва «Париж» → розкриття → «Завершити гру» → подіум. Історія ведучого: гра «Перезапуск» зверху зі статусом завершеної (не «перервана»), бали Олі 200, Петра 100.
  7. `expect(problems).toEqual([])`.

- [ ] **Step 4: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв. Потім той самий запуск з `E2E_SHOTS=1` і перегляд кадрів у `apps/server/e2e/artifacts/shots`: банер «Сервер перезапускається…» читається на 375 px і на сцені, нічого не зсуває; після повернення — звичайний екран паузи.

- [ ] **Step 5: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts
git commit -m "test: part 9b end-to-end — a restart in the middle of a question shows «Сервер перезапускається…», everyone comes back to a paused question with the answers and buffs kept, the host resumes and the game finishes into the history"
```

Після фінальної рецензії гілку злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`. У звіті власникові назвати рішення: стан кожної живої кімнати пишеться в базу не частіше ніж раз на секунду й обов'язково на зупинці; після перезапуску гра стоїть на паузі з тим самим залишком часу, ведучий тисне «Продовжити» (не повернеться за 10 хв — гра завершиться, як і зараз без ведучого); кімнати без змін понад добу не відновлюються; поки сервер перезапускається, усі бачать «Сервер перезапускається… Гра продовжиться сама.» і повертаються самі, без перезавантаження; токени кімнат у базі не хешуються (інакше ведучий не відкрив би пульт на іншому пристрої), рядок видаляється разом із кімнатою; один екземпляр сервера — як зараз на Render (кілька одночасно не підтримується); запрошення друзів у лобі після перезапуску зникають; пуш, що змінює формат стану гри (`GAME_STATE_VERSION`), і далі перериває ігри, що йдуть; сам пуш цього плану ще перезапустить сервер старим кодом. Дія власника (не код, за бажанням): у Render → сервіс → Settings → Build & Deploy → Build Filters → Ignored Paths додати `docs/**` і `**/*.md`, щоб коміти лише з документами не перезапускали сервер.
