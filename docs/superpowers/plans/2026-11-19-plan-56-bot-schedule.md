# План 56: бот за розкладом — заплановані ігри «Квіз-бота» з нагадуваннями, автостартом і щотижневим повтором (44a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** Форма `GameState`, `SavedRoom`, `Room` і зрізів не змінюється: план живе в новій таблиці, кімната — звичайна кімната бота з плану 54 (`createBotRoom`). Якщо виконавцю знадобиться нове поле в `GameState`, `Room` чи `SavedRoom` — **зупинитися й спитати контролера**.

> **Міграція — `0042_bot_plan`**, одна нова таблиця `bot_plan` з індексом і трьома зовнішніми ключами; жодного `ALTER`/`DROP` наявного. Остання наявна — `0041_announcement` (журнал `meta/_journal.json`, idx 41). Якщо до злиття з'явиться інша `0042_…` (план 44b) — узяти наступний номер.

> **Звірка з кодом.** План спирається на `main` 2026-11-19 (`e7d89511`, після злиття плану 54 і специфікації 44a):
> - бот (54): `packages/shared/src/bot.ts` (`BOT_USER_ID = 'quiz-bot'`, `BOT_NICKNAME`, `BOT_ROOMS_MAX = 3`, `BOT_ACTIONS`, `isBotUser`); `apps/server/src/bot-account.ts` `ensureBotAccount(db): Promise<boolean>` (false — пошту бота займає інший); `apps/server/src/admin-bot-routes.ts` — `registerAdminBotRoutes(app, deps, { read, write, adminOf })`, `GET /api/admin/bot` → `AdminBot`, `POST /api/admin/bot/quizzes/:id/games` (перевірки по черзі: `manager.size >= maxRooms` → 503 `server_busy`, `manager.frozen` → 503 `restarting`, `autopilotCheck(quiz).blocked.length > 0` → 409 `autopilot_blocked`, `createBotRoom` → `bot_rooms_full`), `botRoomView(room)`; менеджер `apps/server/src/rooms/manager.ts`: `createBotRoom(quiz, quizId)` ~841, `botRooms()` ~1017, `roomById(id)` ~1290, `botAct(code, action)` ~2457 (`end` у лобі → `close(room)`), `room.connections.get(playerId)`, `LOBBY_TTL_MS` (2 год) ~192; кімната бота переживає перезапуск (`snapshot`/`restore`, тест `a restart keeps the bot room`); вебвкладка `apps/web/src/admin/AdminBot.tsx` (секції `admin-bot-rooms`, `admin-bot-quizzes`, `admin-bot-copy`; `useAdminData(adminBot, 'bot', { keep: true })`), `admin-api.ts` (`adminBot`, `request`, `fetchData`), `AdminBot.test.tsx`;
> - push: `packages/shared/src/push.ts` (`PushPayload` — `reminder`/`opened`/`cancelled`, `PUSH_KINDS`, `pushPayloadSchema`, `PUSH_TICK_MS = 60_000`); `apps/server/src/push.ts` `createPushService({ db, publicKey, send, now?, log? })` → `PushService.deliver(userIds, payload)` (тіло на мову одержувача, 404/410 → `dropEndpoint`), `PUSH_TTL` (запис на кожен `kind`), `track`/`idle()`; `push-store.ts` `subscriptionsOf(db, userIds)`, `saveSubscription(db, userId, input, now)`; `web-push-sender.ts` (VAPID, єдиний імпорт `web-push`); черги немає — відправка одразу, «у польоті» тримає `idle()`; веб: `apps/web/src/push/sw-handlers.ts` (`KINDS`, `isPushPayload`, `onPush`), `push-text.ts` `pushNotice(payload, zone, now)`, `push-strings.ts` (`pushStrings` — uk, словники `push/strings/{en,de,es,it,pl,ar}.json`);
> - групи: `db/schema.ts` `familyGroup` (`id uuid`, `name`, `emoji`) ~711, `groupMember` (`groupId`, `userId`, `role`) ~721; `group-store.ts` `createGroup(db, ownerId, input, now)`; приховування — `feed-store.ts` `notHidden(column)` (бан і бот);
> - пошук людей: `profiles.ts` `searchProfiles(db, query, viewerId)` (≥ 2 символи, `notHidden`, `ne(viewerId)`);
> - періодичні роботи: `db-backup.ts` `dbBackups({ db, store, scheduler? })` → `{ check, start, stop }` на `Scheduler` (`scheduler.setTimeout` + `unref`, `running`-запобіжник, збій — `reportError`); `push.ts` `startPushReminders` і `feed-routes.ts` `startFeedPrune` (`setInterval` + `unref`, повертають stop); `app.ts` `shutdown()` (`manager.freeze()` → … → `stopReminders()` → `push?.idle()`); сімейна ліга «осідає» ліниво на читанні (`league-store.ts` `settleLeague`), окремого таймера не має;
> - час: `apps/server/src/rooms/scheduler.ts` (`Scheduler { now, setTimeout, clearTimeout }`, `realScheduler`), `apps/server/src/testing/fake-scheduler.ts` (`FakeScheduler.advance(ms)`, `pending()`); тести пушів передають `now: Date` явно (`push.test.ts`, `remindDue(at)`); e2e частини 20a викликає `ctx.push!.remindDue(new Date())` руками й ловить відправки заглушкою `send` (`part17-21-likes-feed-calendar-push-admin.e2e.ts` ~1036–1165);
> - київський час: сервер — `xp-rules.ts` `kyivDay(date)`, `game-achievements.ts` `kyivHour(date)` (запасна назва `Europe/Kiev`); веб — `calendar/calendar-time.ts` `localInputToIso(value, zone)`, `isoToLocalInput(iso, zone)`, `timeText(iso, zone)`, `dayHeading(iso, zone, now, locale)`; `format.ts` `formatDay(iso)` (Київ);
> - журнал: `bans.ts` `logAction(tx, { adminId, kind, targetUserId, details, now })` (`adminId` — рядок `user`, мітка — нік); `packages/shared/src/admin.ts` `ADMIN_ACTION_KINDS`, `AdminLogDetails { reason?, title?, text?, content?, code? }`; веб `admin-text.ts` `logLine(entry)`;
> - база й тести: `testing/test-db.ts` `createTestDb()`, `createTestDbUpTo('<тег>')` + `migrateRest`; `db/schema.test.ts` `describe('announcement (53)')` ~857 — зразок тесту міграції; генерація — `pnpm --filter @quiz/server exec drizzle-kit generate --name bot_plan`;
> - i18n: `apps/web/src/i18n.test.ts` (умова `adds no uk keys beyond the agreed list` ~673, зразки `54 keys (the bot tab)` ~487 і `32 keys … (the worker page in the push dictionaries)` ~255 з `ADDED_32_SW`);
> - e2e: `part54-bot-host.e2e.ts` (адмін через `relisten({ adminEmails: adminEmails({ ADMIN_EMAILS }) })`, `finally` → `shutdown` + `relisten()`, світла тема `quiz:theme = light`).
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

**Мета:** адмін у вкладці «Бот» планує гру бота на київський час з адресатами (нікому / усім / родинній групі / вибраним людям); за 15 хв і в момент відкриття адресати отримують push; у час старту сервер сам відкриває кімнату бота, за бажанням бот сам починає гру через N хв, якщо є гравці, або закриває лобі з позначкою «Ніхто не прийшов»; щотижневий повтор, не більше 20 запланованих, журнал, усе переживає перезапуск.

**Архітектура:** план — рядок `bot_plan`; сховище `bot-plan-store.ts` (CRUD, адресати, наступний тиждень); служба `bot-schedule.ts` з одним методом `tick(now)`, який раз на хвилину (таймер на `Scheduler`) атомарно «забирає» рядки за станом (`update … where status = … returning`) і робить три кроки: нагадати, відкрити, довести відкриті до кінця. Перевірки запуску спільні з кнопкою «Запустити гру» (винесений `openBotGame`). Push — новий вид `bot` у наявному `PushService.deliver`. Веб — розділ «Розклад» у вкладці «Бот» (`AdminBotSchedule.tsx`), дані — у тій самій відповіді `GET /api/admin/bot`.

**Технології:** TypeScript, zod 4, Fastify, drizzle (Postgres) + drizzle-kit, web-push, vitest (`shared`/`server`/`web`), React 19 + Testing Library, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-19-bot-schedule-design.md` (44a); основа — план 54 (`docs/superpowers/plans/2026-11-19-plan-54-bot-host.md`), push — підпроєкт 20a.

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22**; `GameState`, `SavedRoom`, `Room`, зрізи — без змін.
- **Міграція лише додає:** `0042_bot_plan` = `CREATE TABLE "bot_plan"` + індекс + FK; першим рядком SQL — `-- Плани ігор бота за розкладом (план 56): нагадування, автозапуск, щотижневий повтор.` Нові види журналу — значення `text`-колонки `admin_action.kind`.
- **Адмінка — лише адмінам:** кожен новий `/api/admin/bot/*` — через `read`/`write`, не-адміну й гостю — 404 як невідомий маршрут; кожен — у списку `routes` тесту `hiding the admin panel (Review Focus 3)`; у JSON — жодного email (`@`).
- Усі тексти — 7 мов: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`; тексти сповіщень — uk у `push/push-strings.ts` + `push/strings/{en,de,es,it,pl,ar}.json`. Нові uk-ключі — у списках `ADDED_BOT_SCHEDULE_56` (інтерфейс) і `ADDED_BOT_SCHEDULE_56_SW` (сповіщення) у `i18n.test.ts`: в умову `adds no uk keys beyond the agreed list` і в перевірку наявності в усіх мовах. ru немає. Кириличні літерали в `apps/web/src/` — лише в словниках і тестах.
- Час у формі й списку — **київський** (`Europe/Kyiv`, запасний `Europe/Kiev`) з підписом «(Київ)»; у сповіщенні — пояс пристрою, як у наявних пушів.
- **Нічого, пов'язаного з росією**, — у фікстурах, назвах, ніках, e2e. Таймер кожного запитання у фікстурах і e2e ≥ 25 с; «так/ні» — приблизно половина «ні».
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm exec tsc -p <пакет>`, з задачі 6 — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Тести, збирання й e2e — лише на передньому плані й ніколи два запуски vitest одночасно** (без `run_in_background`, без паралельних викликів).
- Файли правити лише Edit/Write чи `sed`; **python3 тут — порожня заглушка, ним нічого не правити й не генерувати**; після коміту — `git show --stat`.
- Робоче дерево — `C:\ClaudeCode\quiz\.superpowers\worktrees\plan56`; жодних файлів поза `C:\ClaudeCode\quiz` (тимчасові — у `.superpowers` чи scratchpad).
- e2e: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 56"`; телефон 360 px, світла тема; після — окремо `-t "part 54"`.

## Рішення плану (там, де специфікація мовчить)

**Спільне (`packages/shared/src/bot-schedule.ts`, експорт з `index.ts`)**
- Константи: `BOT_PLANS_MAX = 20` (рахуються лише `scheduled`), `BOT_PLAN_REMIND_MS = 15 * 60_000`, `BOT_PLAN_LATE_MS = 10 * 60_000`, `BOT_PLAN_TICK_MS = 60_000`, `BOT_PLAN_AUTO_MIN = 5`, `BOT_PLAN_AUTO_MAX = 30`, `BOT_PLAN_WAIT_MIN = 30` (скільки чекає лобі без автостарту), `BOT_PLAN_PEOPLE_MAX = 50`, `BOT_PLAN_AHEAD_MS = 60 * 86_400_000`, `BOT_PLAN_HISTORY = 20` (скільки завершених показує список).
- `BOT_PLAN_STATUSES = ['scheduled', 'opened', 'played', 'nobody', 'cancelled', 'failed'] as const`; `BOT_PLAN_REASONS = ['server_down', 'quiz_missing', 'autopilot_blocked', 'server_busy', 'bot_rooms_full', 'bot_unavailable', 'room_closed', 'start_failed'] as const`; типи `BotPlanStatus`, `BotPlanReason`.
- Схема:
  ```ts
  export const botPlanRecipientsSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('none') }).strict(),
    z.object({ kind: z.literal('all') }).strict(),
    z.object({ kind: z.literal('group'), groupId: z.string().uuid() }).strict(),
    z.object({ kind: z.literal('people'), userIds: z.array(z.string().min(1).max(64)).min(1).max(BOT_PLAN_PEOPLE_MAX) }).strict(),
  ]);
  export const botPlanInputSchema = z.object({
    quizId: z.string().uuid(), startsAt: z.string().datetime(), recipients: botPlanRecipientsSchema,
    autoStartMin: z.number().int().min(BOT_PLAN_AUTO_MIN).max(BOT_PLAN_AUTO_MAX).nullable(), weekly: z.boolean(),
  }).strict();
  ```
  `userIds` — без повторів (`refine`).
- Типи для адмінки (`admin.ts`): `AdminBotPlanTo = { kind: 'none' } | { kind: 'all' } | { kind: 'group'; groupId: string; name: string | null } | { kind: 'people'; people: { id: string; nickname: string }[] }` (`name: null` — групу видалено); `AdminBotPlan { id; quizId: string | null; title; startsAt; to: AdminBotPlanTo; autoStartMin: number | null; weekly: boolean; status: BotPlanStatus; reason: BotPlanReason | null; code: string | null }`; `AdminBotGroup { id; name; emoji; members: number }`; `AdminBot` + `schedule: { plans: AdminBotPlan[]; groups: AdminBotGroup[]; max: number }`; `AdminBotPerson { id; nickname; avatar: string | null }`.
- `ADMIN_ACTION_KINDS` + `'bot_plan_create'`, `'bot_plan_update'`, `'bot_plan_cancel'`, `'bot_plan_run'`, `'bot_plan_fail'`; `AdminLogDetails.when?: string` (ISO старту). Причина збою — у наявному `details.reason` (код з `BOT_PLAN_REASONS`).
- Push (`push.ts`): `PushPayload` + `{ kind: 'bot'; planId: string; title: string; startsAt: string; code: string | null; locale?: Locale }` (`code: null` — нагадування за 15 хв, рядок — кімнату відкрито); `PUSH_KINDS` + `'bot'`; `pushPayloadSchema` + гілка `bot`.

**База (`db/schema.ts` `botPlan`, таблиця `bot_plan`)**
- `id uuid pk default random`, `quiz_id uuid → quiz.id on delete set null`, `title text not null` (знімок назви при створенні/зміні), `starts_at timestamptz not null`, `recipients text not null` (`none|all|group|people`), `group_id uuid → family_group.id on delete set null`, `people jsonb string[] not null default '[]'`, `auto_start_min integer` (null — без автостарту), `weekly boolean not null default false`, `status text not null default 'scheduled'`, `reason text`, `room_id text`, `room_code text`, `reminded_at`, `opened_at`, `finished_at` (усі timestamptz), `previous_id uuid` (попередній у серії, без FK), `created_by text → user.id on delete set null`, `created_at`, `updated_at` not null. Індекс `bot_plan_status_starts_idx (status, starts_at)`.

**Сховище (`apps/server/src/bot-plan-store.ts`)**
- `listPlans(db, now): Promise<AdminBotPlan[]>` — усі `scheduled`/`opened` за `starts_at asc`, далі до `BOT_PLAN_HISTORY` завершених за `starts_at desc`; ніки людей і назви груп — одним запитом.
- `botGroups(db): Promise<AdminBotGroup[]>` — усі групи з кількістю учасників, за назвою.
- `createPlan(db, adminId, input, now)` / `updatePlan(db, adminId, id, input, now)` / `cancelPlan(db, adminId, id, now)` → `{ ok: true; plan } | { ok: false; error: 'not_found' | 'invalid_payload' | 'plan_time' | 'plans_full' | 'plan_locked' }`. Перевірки: вікторина — `getQuiz(db, BOT_USER_ID, quizId)` (інакше `not_found`); `startsAt` > `now` і ≤ `now + BOT_PLAN_AHEAD_MS` (інакше `plan_time`); група — існує; люди — кожен id є в `profile` і `notHidden` (інакше `invalid_payload`); створення при `count(scheduled) >= BOT_PLANS_MAX` → `plans_full` (лічба й вставка в одній транзакції з `pg_advisory_xact_lock`, як `lockPerson` у груп); зміна й скасування — лише `scheduled` (інакше `plan_locked`); зміна часу скидає `reminded_at`. Кожна успішна дія — `logAction(tx, { adminId, kind: 'bot_plan_create' | 'bot_plan_update' | 'bot_plan_cancel', targetUserId: BOT_USER_ID, details: { title, when: startsAt } })` у тій самій транзакції. Скасування зупиняє й серію (наступний створюється лише при відкритті).
- `recipientsOf(db, plan): Promise<string[]>` — `none` → `[]`; `all` → різні `push_subscription.user_id` з `notHidden`; `group` → `group_member.user_id` групи з `notHidden` (група зникла → `[]`); `people` → збережені id з `notHidden`.
- `nextWeekKyiv(at: Date): Date` (у `apps/server/src/kyiv-time.ts`) — той самий настінний час у Києві через 7 днів: прочитати поля дати й часу в `Europe/Kyiv` (`Intl.DateTimeFormat('en-US', { hourCycle: 'h23', … })`), додати 7 днів до дати, перетворити назад двома проходами зсуву (як `localInputToIso` у `calendar-time.ts`).

**Запуск гри бота (`apps/server/src/bot-games.ts`)**
- `openBotGame(deps: { manager: RoomManager; maxRooms: number }, quiz: Quiz, quizId: string): { ok: true; room: Room } | { ok: false; error: 'server_busy' | 'restarting' | 'autopilot_blocked' | 'bot_rooms_full' }` — ті самі перевірки й порядок, що в `POST /api/admin/bot/quizzes/:id/games`; маршрут переходить на нього (коди відповідей не змінюються). `botRoomView`/`stageUrl` лишаються в маршрутах.

**Служба розкладу (`apps/server/src/bot-schedule.ts`)**
- `createBotSchedule(deps: { db: Db; manager: RoomManager; maxRooms: number; deliver?: (userIds: string[], payload: PushPayload) => Promise<number>; scheduler?: Scheduler }): BotSchedule`, де `BotSchedule { tick(now: Date): Promise<BotTickReport>; start(): void; stop(): void; idle(): Promise<void> }`, `BotTickReport = 'busy' | 'frozen' | { reminded: number; opened: number; failed: number; settled: number }`.
- `tick(now)` (ніколи не кидає; збій кроку — `reportError(…, { where: 'bot-schedule' })`; поки йде прогін — `'busy'`; `manager.frozen` — `'frozen'`, нічого не робить):
  1. **Нагадати:** `update bot_plan set reminded_at = now where status = 'scheduled' and reminded_at is null and starts_at > now and starts_at <= now + 15 хв returning …` → для кожного `deliver(recipientsOf, { kind: 'bot', planId, title, startsAt, code: null })`.
  2. **Відкрити:** кожен `scheduled` з `starts_at <= now` за часом: запізнення > `BOT_PLAN_LATE_MS` → збій `server_down`; немає вікторини (`quiz_id` null чи не бота) → `quiz_missing`; `ensureBotAccount` (раз на службу, запам'ятовується) — `false` → `bot_unavailable`; `openBotGame` → `restarting` — пропустити (наступна хвилина, поки ≤ 10 хв), інша помилка — збій з цим кодом. Успіх — `update … set status = 'opened', room_id, room_code, opened_at = now, reminded_at = coalesce(reminded_at, now) where id = … and status = 'scheduled' returning`; рядка немає (скасували в цю мить) → `botAct(code, 'end')` і далі; є → `logAction(db, { adminId: BOT_USER_ID, kind: 'bot_plan_run', targetUserId: BOT_USER_ID, details: { title, code } })` і `deliver(…, { kind: 'bot', …, code })`. Збій — `update … set status = 'failed', reason, finished_at = now where id and status = 'scheduled'` + `logAction(kind: 'bot_plan_fail', details: { title, reason })`. Після відкриття чи збою щотижневого плану — **наступний**: копія рядка з `starts_at = nextWeekKyiv(...)` (повторювати, доки не стане > `now`), `status = 'scheduled'`, `previous_id`, порожні поля запуску; ліміт 20 не перевіряється (наступник заміняє попередника серед `scheduled`).
  3. **Довести відкриті:** кожен `opened`: `manager.roomById(room_id)` немає → `failed` / `room_closed`; фаза не `lobby` → `played`; лобі й `now < opened_at + (auto_start_min ?? BOT_PLAN_WAIT_MIN) хв` → нічого; інакше «на зв'язку» = гравці з `connections.get(id) > 0`: 0 → `botAct(code, 'end')` (лобі закривається) і `nobody`; ≥ 1 і `auto_start_min !== null` → `botAct(code, 'start')`: ok → `played`, помилка → `failed` / `start_failed` (кімната лишається адмінові); ≥ 1 без автостарту → нічого (почне адмін; лобі зникне за `LOBBY_TTL_MS` → `room_closed`). Кінцеві стани ставлять `finished_at = now`; `nobody`/`played` у журнал не пишуться (видно в списку).
- `start()` — перший прогін `tick(new Date(scheduler.now()))` одразу, далі `scheduler.setTimeout(…, BOT_PLAN_TICK_MS)` після кожного (як `dbBackups.plan`), `unref`; `stop()` — зупиняє таймер; `idle()` — чекає прогону й відправок.
- `app.ts`: `AppOptions.botScheduleTicker?: boolean` (типово `false`; `main.ts` — `true`). Служба створюється завжди після `push` (`deliver: push?.deliver`), повертається з `buildApp` як `botSchedule`; `start()` — лише з прапорцем; у `shutdown()` — `botSchedule.stop()` перед `manager.freeze()` і `await botSchedule.idle()` перед `push?.idle()`; хук `onClose` теж зупиняє. Тести й e2e рухають час, викликаючи `ctx.botSchedule.tick(<Date>)` руками.
- `PUSH_TTL.bot = 3600`, терміновість `high`.

**Маршрути (`apps/server/src/admin-bot-schedule-routes.ts`, виклик останнім рядком `registerAdminBotRoutes`)**
- `GET /api/admin/bot` — додає `schedule: { plans: listPlans, groups: botGroups, max: BOT_PLANS_MAX }`.
- `POST /api/admin/bot/plans` (`write`, `botPlanInputSchema`) → 201 `AdminBotPlan`; `PUT /api/admin/bot/plans/:id` → 200 `AdminBotPlan`; `POST /api/admin/bot/plans/:id/cancel` → 204. Помилки: схема чи `invalid_payload` → 400; `plan_time` → 400 `{ error: 'plan_time' }`; `not_found` (і не-uuid) → 404; `plans_full`, `plan_locked` → 409.
- `GET /api/admin/bot/people?q=` (`read`) → `AdminBotPerson[]` = `searchProfiles(db, q, BOT_USER_ID)` (адмін знаходить і себе; бот і забанені — ні); `q` довше 40 → 400.

**Веб**
- `apps/web/src/admin/AdminBotSchedule.tsx` — секція `admin-bot-schedule` у `AdminBot` між «Кімнати бота» і «Вікторини бота»; пропси `{ schedule: AdminBot['schedule']; quizzes: AdminBotQuiz[]; onChanged: () => void }`.
- Форма «Запланувати гру»: `select` вікторини бота (немає вікторин — підказка й без форми), `input type="datetime-local"` з підписом «Дата й час (за київським часом)» і `min` = зараз у Києві (`isoToLocalInput(now, KYIV)`), значення → `localInputToIso(value, KYIV)`; радіо «Кому сповістити»: Нікому / Усім / Родинній групі (`select` груп; груп немає — пункт вимкнено) / Вибраним людям (поле пошуку, від 2 символів, затримка 300 мс → `GET /api/admin/bot/people`; вибрані — «фішки» з кнопкою «Прибрати {name}»); прапорець «Почати автоматично, якщо є гравці» + числове поле 5–30 (типово 10); прапорець «Повторювати щотижня в цей день і час». «Змінити» заповнює форму планом і міняє кнопку на «Зберегти зміни» + «Не змінювати».
- Список: «Активних: {count} з {max}»; картка — назва, `{день}, {час} (Київ)` (`formatDay` + `timeText(…, KYIV)`), адресати, «Автостарт через {minutes} хв», «Щотижня», стан (і причина для `failed`), «Код {code}» для `opened`; кнопки «Змінити», «Скасувати» (`window.confirm`) — лише для `scheduled`. Після кожної дії — `onChanged()` (перезавантаження `GET /api/admin/bot`).
- `admin-api.ts`: `createBotPlan(input: BotPlanInput): Promise<ApiResult<AdminBotPlan>>`, `updateBotPlan(id, input)`, `cancelBotPlan(id): Promise<ApiResult<object>>`, `searchBotPeople(q): Promise<ApiResult<AdminBotPerson[]>>`. `KYIV = 'Europe/Kyiv'` — константа поруч з `calendar-time.ts` (експорт `KYIV_ZONE`).
- `admin-text.ts` `logLine`: змінна `when` = `kyivWhenText(details.when)` («20 листопада 2026, 19:00 (Київ)»), `reason` для `bot_plan_fail` → `t('adminBotPlanReason_' + reason)`.
- Сервіс-воркер: `sw-handlers.ts` `KINDS` + `'bot'`, `isPushPayload` для `bot` — `planId`, `title`, `startsAt` — рядки, `code` — рядок чи `null`; `push-text.ts` `pushNotice` — `bot`: тег `bot-{planId}` (відкриття заміняє нагадування), `code === null` → `pushBotSoonTitle`/`pushBotSoonBody`, URL `/`; інакше `pushBotOpenTitle`/`pushBotOpenBody`, URL `/play/{code}`.

## Порядок збирання

- 1 → 2 → 3 → 4 → 5 → 6 → 7. Залежності: 2 ← 1; 3 ← 2; 4 ← 2, 3; 5 ← 1; 6 ← 4, 5; 7 — остання.
- `tsc -p apps/web` може падати на `adminLog_bot_plan_*` до задачі 6 — очікувано; `pnpm typecheck` обов'язково зелений з задачі 6.

## Фокус рев'ю

1. **Подвійний запуск.** Два прогони `tick` поспіль (і паралельно, через `Promise.all`) на той самий момент відкривають одну кімнату, шлють по одному пушу кожного виду; план, скасований між вибіркою й «забиранням», кімнати не лишає. Задача 3.
2. **Перезапуск.** Сервер «лежав»: старт 5 хв тому → кімната відкривається, нагадування окремо не шлеться, лише «відкрито»; 11 хв тому → `failed` / `server_down`, наступний тижневий створено; відкрита кімната після `snapshot`/`restore` доводиться до `played`/`nobody` тим самим `room_id`. Задача 3.
3. **Перехід часу.** Щотижневий план на 19:00 через перехід на зимовий (25.10.2026) і літній (28.03.2027) час — знову 19:00 у Києві. Задача 2.
4. **Хто отримує.** «Усім» — лише люди з підписками, без забанених і бота; група — лише учасники, видалена група — нікому без збою; люди — без забанених після створення плану. Задачі 2, 3.
5. **Межа 20 і ворота.** 21-й план — 409 без запису в журнал; наступник серії межу не ламає; зміна/скасування не-`scheduled` — 409; кожен новий маршрут — 404 не-адміну й гостю; у JSON немає `@`. Задачі 2, 4, 7.

---

### Задача 1. Спільне: константи й схема плану, стани й причини, види журналу, push-вид `bot`

**Files:**
- Create: `packages/shared/src/bot-schedule.ts`, `packages/shared/src/bot-schedule.test.ts`.
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/admin.ts`, `packages/shared/src/push.ts`.
- Test: `packages/shared/src/admin.test.ts`, `packages/shared/src/push.test.ts`.

**Interfaces (Produces):** константи, `BOT_PLAN_STATUSES`, `BOT_PLAN_REASONS`, `BotPlanStatus`, `BotPlanReason`, `botPlanRecipientsSchema`, `botPlanInputSchema`, `type BotPlanInput = z.infer<…>`; типи `AdminBotPlan`, `AdminBotPlanTo`, `AdminBotGroup`, `AdminBotPerson`, `AdminBot.schedule`; п'ять видів журналу; `AdminLogDetails.when?`; push-вид `bot` (усе — з «Рішень плану», спільне).

- [ ] **Step 1: Write the failing tests:**
  - `bot-schedule.test.ts` `a plan input: a bot quiz, a moment, recipients, an optional auto start and a weekly flag`: приймає `{ quizId: <uuid>, startsAt: '2026-11-20T17:00:00.000Z', recipients: { kind: 'none' }, autoStartMin: null, weekly: false }` і варіанти `all`, `group` з uuid, `people` з `['a1', 'b2']`; відкидає `autoStartMin: 4`, `31`, `7.5`; `people` з `[]`, з 51 id, з повтором `['a1', 'a1']`; `group` без `groupId`; зайвий ключ; `startsAt: '20.11.2026 19:00'`.
  - Той самий файл `limits`: `BOT_PLANS_MAX === 20`, `BOT_PLAN_REMIND_MS === 900_000`, `BOT_PLAN_LATE_MS === 600_000`, `BOT_PLAN_STATUSES` — шість станів у порядку з «Рішень плану».
  - `admin.test.ts`: `ADMIN_ACTION_KINDS` містить `bot_plan_create`, `bot_plan_update`, `bot_plan_cancel`, `bot_plan_run`, `bot_plan_fail`.
  - `push.test.ts`: `pushPayloadSchema` приймає `{ kind: 'bot', planId: 'P', title: 'Т', startsAt: '…', code: null }` і з `code: '123456'`, відкидає без `planId`; `PUSH_KINDS` містить `bot`.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/bot-schedule.test.ts packages/shared/src/admin.test.ts packages/shared/src/push.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (спільне).
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 && pnpm exec tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 56 bot schedule — the plan input (bot quiz, moment, recipients none, all, a group or up to 50 people, auto start after 5–30 min, weekly), at most 20 scheduled plans, plan states and failure reasons, five log kinds and the bot push kind"
```

---

### Задача 2. Сервер: міграція `0042_bot_plan`, сховище планів, адресати, тиждень за київським часом

**Files:**
- Create: `apps/server/drizzle/0042_bot_plan.sql` + `meta/0042_snapshot.json` + запис у `meta/_journal.json` (`pnpm --filter @quiz/server exec drizzle-kit generate --name bot_plan`, потім дописати коментар першим рядком), `apps/server/src/bot-plan-store.ts`, `apps/server/src/bot-plan-store.test.ts`, `apps/server/src/kyiv-time.ts`, `apps/server/src/kyiv-time.test.ts`.
- Modify: `apps/server/src/db/schema.ts` (`botPlan`).
- Test: `apps/server/src/db/schema.test.ts`.

**Interfaces:**
- Consumes: задача 1; `getQuiz`, `logAction`, `notHidden`, `ensureBotAccount`.
- Produces: `botPlan` (drizzle); `listPlans(db, now)`, `botGroups(db)`, `createPlan(db, adminId, input, now)`, `updatePlan(db, adminId, id, input, now)`, `cancelPlan(db, adminId, id, now)` (результати — з «Рішень плану»), `recipientsOf(db, plan: typeof botPlan.$inferSelect): Promise<string[]>`, `nextWeekKyiv(at: Date): Date`.

- [ ] **Step 1: Write the failing tests:**
  - `schema.test.ts` `describe('bot plan (56)')`: `migration 0042 adds the bot_plan table over an older database, old data stays` (`createTestDbUpTo('0041_announcement')`, рядок `announcement` цілий, `bot_plan` порожня); `deleting the quiz, the group or the author keeps the plan` (`quiz_id`, `group_id`, `created_by` → null).
  - `kyiv-time.test.ts` `the same Kyiv wall clock a week later across both clock changes`: `nextWeekKyiv(new Date('2026-10-20T16:00:00Z'))` → `2026-10-27T17:00:00.000Z`; `2027-03-23T17:00:00Z` → `2027-03-30T16:00:00.000Z`; `2026-11-20T17:00:00Z` → `2026-11-27T17:00:00.000Z`.
  - `bot-plan-store.test.ts` (бот — `ensureBotAccount`; адмін «Адмін 56»; вікторина бота «Карпатські вершини 56»; `NOW = 2026-11-20T10:00:00Z`):
    - `creates a plan with a title snapshot and logs it`: `createPlan` → `ok`, `status: 'scheduled'`; `listPlans` — план з `to: { kind: 'none' }`; останній `admin_action` — `bot_plan_create` з `{ title, when: startsAt }`.
    - `refuses a past moment, a far moment, a foreign quiz, a missing group and an unknown or banned person`: `startsAt = NOW` і `NOW + 61 д` → `plan_time`; вікторина адміна (не бота) → `not_found`; uuid без групи, id без профілю, id забаненого → `invalid_payload`; журнал без нових рядків.
    - `the 21st scheduled plan is refused, a cancelled one frees the place`: 20 → `ok`, 21-й → `plans_full`; `cancelPlan` одного → `ok`, знову `createPlan` → `ok`; два `createPlan` через `Promise.all` при 19 → рівно один `plans_full`.
    - `only a scheduled plan changes or cancels; a new time forgets the reminder`: `update` з новим часом при `reminded_at` → `reminded_at` null, журнал `bot_plan_update`; план `opened` → `plan_locked` для обох; `cancel` → `status: 'cancelled'`, журнал `bot_plan_cancel`.
    - `recipients: all with a subscription, a group, chosen people, never the banned or the bot`: `all` → лише люди з `saveSubscription`, без забаненого; `group` (`createGroup` + учасник) → власник і учасник; групу видалено → `[]`; `people` з забаненим після створення → без нього; `none` → `[]`.
    - `the list shows active plans first and at most 20 finished ones with group names and nicknames`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/db/schema.test.ts apps/server/src/kyiv-time.test.ts apps/server/src/bot-plan-store.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** схему й міграцію, `kyiv-time.ts`, `bot-plan-store.ts` за «Рішеннями плану» (база, сховище). Згенерований SQL перевірити: лише `CREATE TABLE`, `CREATE INDEX`, `ADD CONSTRAINT … FOREIGN KEY` для нової таблиці.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/db apps/server/src/kyiv-time.test.ts apps/server/src/bot-plan-store.test.ts apps/server/src/db-backup.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/drizzle apps/server/src
git commit -m "feat(server): 56 bot plans — migration 0042 adds the bot_plan table; create, change and cancel a plan with a title snapshot and a log line, at most 20 scheduled, recipients from subscriptions, a family group or chosen people without the banned, and the same Kyiv wall clock a week later across clock changes"
```

---

### Задача 3. Сервер: служба розкладу — хвилинний тікер, нагадування, відкриття, автостарт, «ніхто не прийшов», повтор

**Files:**
- Create: `apps/server/src/bot-games.ts`, `apps/server/src/bot-schedule.ts`, `apps/server/src/bot-schedule.test.ts`.
- Modify: `apps/server/src/admin-bot-routes.ts` (маршрут запуску — через `openBotGame`), `apps/server/src/push.ts` (`PUSH_TTL.bot`), `apps/server/src/app.ts` (`botScheduleTicker`, `botSchedule` у поверненні, `shutdown`, `onClose`), `apps/server/src/main.ts` (`botScheduleTicker: true`).

**Interfaces:**
- Consumes: задачі 1–2; `createBotRoom`, `roomById`, `botAct`, `PushService.deliver`.
- Produces: `openBotGame(deps, quiz, quizId)`; `createBotSchedule(deps): BotSchedule`; `buildApp(...)` повертає `botSchedule: BotSchedule`; `AppOptions.botScheduleTicker?: boolean`.

- [ ] **Step 1: Write the failing tests** (`bot-schedule.test.ts`; `new RoomManager(new FakeScheduler(), () => 0.5, { pacing: false })`, `deliver` — `vi.fn` з журналом `{ userIds, payload }`; плани — через `createPlan`; час — лише аргумент `tick(at(ms))`, `T` — старт):
  - `reminds once 15 minutes ahead and not earlier`: `tick(T − 16 хв)` → нічого; `tick(T − 15 хв)` → один `deliver` з `{ kind: 'bot', code: null, startsAt }` адресатам; `tick(T − 14 хв)` → нічого.
  - `opens the bot room at the start, pushes the code and logs the run`: `tick(T)` → `status: 'opened'`, `room_code` — 6 цифр, `manager.get(code).hostUserId === 'quiz-bot'`, `deliver` з тим самим `code`; журнал `bot_plan_run` з `{ title, code }` від «Квіз-бот».
  - `nobody came: the lobby closes after the wait`: `autoStartMin: 10`; `tick(T)`, `tick(T + 9 хв)` → `opened`; `tick(T + 10 хв)` → `status: 'nobody'`, `manager.get(code)` — `undefined`.
  - `auto start with one player online`: `manager.join(code, 'Оля')` + `connect`; `tick(T + 10 хв)` → `played`, фаза не `lobby`. Без автостарту з гравцем — `tick(T + 30 хв)` лишає `opened` і лобі; адмін `botAct(code, 'start')`, `tick` → `played`.
  - `without auto start an empty lobby waits 30 minutes`: `tick(T + 29 хв)` → `opened`; `tick(T + 30 хв)` → `nobody`.
  - `a missed start within 10 minutes still opens, later it fails as server down`: перший `tick(T + 5 хв)` → `opened` і лише один `deliver` (з кодом); інший план — перший `tick(T + 11 хв)` → `failed` / `server_down`, журнал `bot_plan_fail` з `reason: 'server_down'`, кімнати немає.
  - `a weekly plan makes the next one after opening or failing, a cancelled one does not`: після `tick(T)` є новий `scheduled` на `nextWeekKyiv(T)` з `previous_id`; після `server_down` — теж; `cancelPlan` → наступного немає; при 20 `scheduled` наступник усе одно створюється.
  - `failures keep their reason`: вікторину видалено → `quiz_missing`; вікторина `think` без слів → `autopilot_blocked`; три відкриті кімнати бота → `bot_rooms_full`; `maxRooms: 0` → `server_busy`; `manager.freeze()` → `tick` повертає `'frozen'`, план лишається `scheduled`.
  - `two ticks at once open one room and push once`: `Promise.all([tick(T), tick(T)])` → одна кімната бота, один `deliver` з кодом.
  - `a plan cancelled after the pick leaves no room`: `cancelPlan` між вибіркою й «забиранням» (через `vi.spyOn(manager, 'createBotRoom')`, що скасовує план і викликає оригінал) → `botRooms()` без лобі.
  - `an open plan survives a restart`: `tick(T)`; `snapshot(room)` → новий `RoomManager` → `restore`; нова служба на тій самій базі, `tick(T + 10 хв)` без гравців → `nobody`.
  - `a closed room before the start counts as closed`: `botAct(code, 'end')` у лобі → `tick` → `failed` / `room_closed`.
  - `start() ticks now and every minute until stop()`: служба на `FakeScheduler`, три плани зі стартом у `scheduler.now()`, `+60 с`, `+120 с` (час прогону — `new Date(scheduler.now())`); `start()` → перший відкрито; `scheduler.advance(60_000)` ×2 → відкрито всі три, `pending()` — `[60_000]`; `stop()` → `pending()` порожній. Отже, `tick` у циклі бере час із `scheduler.now()`.
  - `admin-bot-routes.test.ts` наявні лишаються зеленими (`openBotGame` не змінив відповідей).
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/bot-schedule.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `openBotGame`, `createBotSchedule`, підключення в `app.ts`/`main.ts`, `PUSH_TTL.bot` за «Рішеннями плану» (запуск, служба). Тікер у `main.ts` — з коментарем, що на одному екземплярі; два екземпляри при розгортанні розводять умовні `update … where status = …`.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/bot-schedule.test.ts apps/server/src/admin-bot-routes.test.ts apps/server/src/push.test.ts apps/server/src/app.test.ts apps/server/src/restart.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 56 bot schedule service — a minute ticker reminds recipients 15 min ahead, opens the bot room at the start with the code in a push and a log line, starts the game after N min when a player is online or closes the lobby as nobody came, makes the next weekly plan, opens a missed start up to 10 min late and fails it after, never twice, and survives a restart"
```

---

### Задача 4. Сервер: маршрути розкладу в адмінці — список, створити, змінити, скасувати, пошук людей

**Files:**
- Create: `apps/server/src/admin-bot-schedule-routes.ts`, `apps/server/src/admin-bot-schedule-routes.test.ts`.
- Modify: `apps/server/src/admin-bot-routes.ts` (`schedule` у `GET /api/admin/bot`, виклик `registerAdminBotScheduleRoutes` останнім рядком), `apps/server/src/admin-routes.test.ts` (список `routes`), `apps/server/src/admin-bot-routes.test.ts` (очікування `schedule` у відповіді).

**Interfaces:**
- Consumes: задачі 1–2.
- Produces: `GET /api/admin/bot` → `AdminBot` з `schedule`; `POST /api/admin/bot/plans` → 201 `AdminBotPlan` / 400 / 404 / 409; `PUT /api/admin/bot/plans/:id` → 200 / 400 / 404 / 409; `POST /api/admin/bot/plans/:id/cancel` → 204 / 404 / 409; `GET /api/admin/bot/people?q=` → 200 `AdminBotPerson[]` / 400.

- [ ] **Step 1: Write the failing tests:**
  - `admin-routes.test.ts`: у `routes` — `['POST', '/api/admin/bot/plans']`, `['PUT', `/api/admin/bot/plans/${UUID}`]`, `['POST', `/api/admin/bot/plans/${UUID}/cancel`]`, `['GET', '/api/admin/bot/people?q=ol']`.
  - `admin-bot-schedule-routes.test.ts` (`buildApp` без тікера; адмін «Адмін 56», Оля — не адмін, вікторина бота «Поліські озера 56»):
    - `the admin plans a game and sees it with groups in the bot tab`: `POST /plans` → 201, `status: 'scheduled'`; `GET /api/admin/bot` → `schedule.plans[0]` з `title`, `to: { kind: 'group', name: 'Малинські' }`, `schedule.groups` з `members: 2`, `schedule.max === 20`; `JSON.stringify` без `@`.
    - `errors: bad body 400, past time 400 plan_time, foreign quiz 404, full 409, locked 409`: 21-й → 409 `plans_full`; `PUT` і `cancel` відкритого плану (статус поставлено напряму в базі) → 409 `plan_locked`; невідомий uuid → 404; `'abc'` → 404.
    - `change and cancel are logged`: `PUT` → 200 з новим `startsAt`; `cancel` → 204; `/api/admin/log` — `bot_plan_update`, `bot_plan_cancel` з `details.when`.
    - `people search finds the admin too, never the bot or the banned`: `q=Адм` → є адмін; `q=Кві` → без «Квіз-бот»; забанена «Олеся» — немає; `q` з 41 символу → 400; у відповіді немає `email`.
    - `non-admins and guests get 404` — для всіх чотирьох маршрутів.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/admin-bot-schedule-routes.test.ts apps/server/src/admin-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (маршрути); `:id` перевіряється тим самим `UUID`, що в `admin-bot-routes.ts`.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/admin-bot-schedule-routes.test.ts apps/server/src/admin-bot-routes.test.ts apps/server/src/admin-routes.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 56 admin bot schedule routes — the bot tab lists plans and family groups, the admin plans, changes and cancels a bot game with clear errors (past time, 20 plans, locked) and log lines, and finds people by nickname without the bot or the banned; everything hides behind the admin gate"
```

---

### Задача 5. Веб: сповіщення бота в сервіс-воркері — «скоро» і «відкрито» в 7 мовах

**Files:**
- Modify: `apps/web/src/push/sw-handlers.ts`, `apps/web/src/push/push-text.ts`, `apps/web/src/push/push-strings.ts`, `apps/web/src/push/strings/{en,de,es,it,pl,ar}.json`, `apps/web/src/i18n.test.ts` (`ADDED_BOT_SCHEDULE_56_SW`).
- Test: `apps/web/src/push/push-text.test.ts`, `apps/web/src/push/sw-handlers.test.ts`.

**Ключі (uk, у `pushStrings`):** `pushBotSoonTitle` «Квіз-бот відкриває гру «{title}» о {time}», `pushBotSoonBody` «Код прийде окремим сповіщенням, щойно кімната відкриється.», `pushBotOpenTitle` «Квіз-бот відкрив гру «{title}»», `pushBotOpenBody` «Код: {code}. Торкнися, щоб приєднатися.» (у перекладах «Квіз-бот» — звичайним словом мови, напр. «Quiz bot»).

**Interfaces:**
- Consumes: push-вид `bot` (задача 1).
- Produces: `pushNotice` для `bot`; `isPushPayload` приймає `bot`.

- [ ] **Step 1: Write the failing tests:**
  - `push-text.test.ts` `the bot push: soon with the time, then open with the code`: `{ kind: 'bot', planId: 'P', title: 'Поліські озера', startsAt: '2026-11-20T17:00:00.000Z', code: null }`, пояс Київ → `title` «Квіз-бот відкриває гру «Поліські озера» о 19:00», `url: '/'`, `tag: 'bot-P'`; з `code: '123456'` → `body` «Код: 123456. Торкнися, щоб приєднатися.», `url: '/play/123456'`, той самий `tag`; `locale: 'en'` → англійський текст.
  - `sw-handlers.test.ts`: `isPushPayload` — `bot` з `code: null` і з рядком → `true`; `code: 5`, без `planId` → `false`; `onPush` з `bot` показує сповіщення з тегом `bot-P`.
  - `i18n.test.ts` `56 push keys (the bot schedule) are in every push dictionary`: `ADDED_BOT_SCHEDULE_56_SW` у `pushStrings` і в шести JSON; змінні (`{title}`, `{time}`, `{code}`) збігаються з uk.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/push apps/web/src/i18n.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (сервіс-воркер) і ключами вище.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/push apps/web/src/i18n.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/push apps/web/src/i18n.test.ts
git commit -m "feat(web): 56 bot schedule pushes — the worker shows «the quiz bot opens …» with the time 15 min ahead and the room code when it opens, one notification tag per plan, in seven languages"
```

---

### Задача 6. Веб: розділ «Розклад» у вкладці «Бот», рядки журналу, тексти в 7 мовах

**Files:**
- Create: `apps/web/src/admin/AdminBotSchedule.tsx`, `apps/web/src/admin/AdminBotSchedule.test.tsx`.
- Modify: `apps/web/src/admin/AdminBot.tsx` (секція між кімнатами й вікторинами), `apps/web/src/admin/AdminBot.test.tsx` (фікстура `AdminBot` + `schedule` з порожніми `plans`/`groups`), `apps/web/src/admin/admin-api.ts`, `apps/web/src/admin/admin-text.ts`, `apps/web/src/calendar/calendar-time.ts` (експорт `KYIV_ZONE`), `apps/web/src/styles.css` (`.admin-bot-schedule`), `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,de,es,it,pl,ar}.json`, `apps/web/src/i18n.test.ts` (`ADDED_BOT_SCHEDULE_56`).
- Test: `apps/web/src/admin/admin-text.test.ts`.

**Ключі (uk):**
- Розділ і форма: `adminBotSchedule` «Розклад», `adminBotScheduleLead` «Бот сам відкриє гру в призначений час і нагадає адресатам за 15 хвилин і в момент відкриття.», `adminBotPlanNew` «Запланувати гру», `adminBotPlanEdit` «Змінити план», `adminBotPlanQuiz` «Вікторина», `adminBotPlanNoQuizzes` «Спершу передай боту вікторину.», `adminBotPlanWhen` «Дата й час (за київським часом)», `adminBotPlanTo` «Кому сповістити», `adminBotPlanToNone` «Нікому», `adminBotPlanToAll` «Усім», `adminBotPlanToGroup` «Родинній групі», `adminBotPlanToPeople` «Вибраним людям», `adminBotPlanGroup` «Група», `adminBotPlanNoGroups` «Родинних груп ще немає.», `adminBotPlanSearch` «Пошук за ніком», `adminBotPlanRemove` «Прибрати {name}», `adminBotPlanAuto` «Почати автоматично, якщо є гравці», `adminBotPlanAutoAfter` «Через скільки хвилин (5–30)», `adminBotPlanWeekly` «Повторювати щотижня в цей день і час», `adminBotPlanSave` «Запланувати», `adminBotPlanSaveEdit` «Зберегти зміни», `adminBotPlanKeep` «Не змінювати», `adminBotPlanSaved` «Гру заплановано.».
- Список: `adminBotPlansCount` «Активних: {count} з {max}», `adminBotPlansEmpty` «Запланованих ігор немає.», `adminBotPlanKyiv` «{when} (Київ)», `adminBotPlanToShownNone` «Без сповіщень», `adminBotPlanToShownAll` «Сповістити всіх», `adminBotPlanToShownGroup` «Група «{name}»», `adminBotPlanGroupGone` «Групу видалено», `adminBotPlanToShownPeople` «Люди: {names}», `adminBotPlanAutoShown` «Автостарт через {minutes} хв», `adminBotPlanWeeklyShown` «Щотижня», `adminBotPlanChange` «Змінити», `adminBotPlanCancel` «Скасувати», `adminBotPlanCancelConfirm` «Скасувати гру «{title}» {when}? Повтор теж зупиниться.».
- Стани: `adminBotPlan_scheduled` «Заплановано», `adminBotPlan_opened` «Відкрито», `adminBotPlan_played` «Зіграно», `adminBotPlan_nobody` «Ніхто не прийшов», `adminBotPlan_cancelled` «Скасовано», `adminBotPlan_failed` «Не вдалося: {reason}».
- Причини: `adminBotPlanReason_server_down` «сервер був недоступний», `_quiz_missing` «вікторину видалено», `_autopilot_blocked` «вікторину не можна провести без ведучого», `_server_busy` «сервер перевантажений», `_bot_rooms_full` «у бота вже три кімнати», `_bot_unavailable` «акаунт бота недоступний», `_room_closed` «кімнату закрито до старту», `_start_failed` «гра не змогла початися».
- Помилки: `err_plans_full` «Уже 20 запланованих ігор. Скасуй одну, щоб додати нову.», `err_plan_time` «Обери час у майбутньому, не далі ніж за 60 днів.», `err_plan_locked` «Цей план уже не можна змінити.».
- Журнал: `adminLog_bot_plan_create` «{admin} запланував(-ла) гру бота «{title}» на {when}», `adminLog_bot_plan_update` «{admin} змінив(-ла) план гри бота «{title}»: {when}», `adminLog_bot_plan_cancel` «{admin} скасував(-ла) гру бота «{title}» ({when})», `adminLog_bot_plan_run` «Розклад: бот відкрив гру «{title}» (код {code})», `adminLog_bot_plan_fail` «Розклад: гру бота «{title}» не відкрито — {reason}».

**Interfaces:**
- Consumes: задачі 1, 4.
- Produces: `AdminBotSchedule`; `createBotPlan`, `updateBotPlan`, `cancelBotPlan`, `searchBotPeople`; `kyivWhenText(iso: string): string` в `admin-text.ts`; `KYIV_ZONE`.

- [ ] **Step 1: Write the failing tests:**
  - `i18n.test.ts`: `ADDED_BOT_SCHEDULE_56` — в умову `adds no uk keys beyond the agreed list`; `it('56 keys (the bot schedule) are in every language')` за зразком `54 keys …` (змінні збігаються з uk).
  - `admin-text.test.ts`: `bot_plan_create` з `{ title: 'Поліські озера 56', when: '2026-11-20T17:00:00.000Z' }`, адмін «Оля» → «Оля запланував(-ла) гру бота «Поліські озера 56» на 20 листопада 2026, 19:00 (Київ)»; `bot_plan_run` з кодом; `bot_plan_fail` з `reason: 'server_down'` → «… не відкрито — сервер був недоступний».
  - `AdminBotSchedule.test.tsx` (заглушка `fetch`, як в `AdminBot.test.tsx`; `vi.setSystemTime(new Date('2026-11-20T10:00:00Z'))`):
    - `plans a game for Kyiv time with a group and auto start`: вибір вікторини, `datetime-local` «2026-11-20T19:00», «Родинній групі» → «Малинські», «Почати автоматично…» з 10, «Повторювати щотижня» → `POST /api/admin/bot/plans` з `{ startsAt: '2026-11-20T17:00:00.000Z', recipients: { kind: 'group', groupId }, autoStartMin: 10, weekly: true }`; «Гру заплановано.» і `onChanged`.
    - `chooses people by nickname search and removes one`: введення «Ол» → `GET /api/admin/bot/people?q=%D0%9E%D0%BB` → «Оля», «Олег» → обидва вибрано, «Прибрати Олег» → у тілі `userIds: [<Оля>]`.
    - `lists plans with state, reason, Kyiv time and actions only for scheduled`: `scheduled` («Змінити», «Скасувати»), `opened` («Код 123456», без кнопок), `failed` з `server_down` («Не вдалося: сервер був недоступний»), `nobody`; «Активних: 1 з 20»; час «… 19:00 (Київ)».
    - `change fills the form and saves with PUT`: «Змінити» → поля заповнені, кнопка «Зберегти зміни» → `PUT /api/admin/bot/plans/<id>`; «Не змінювати» повертає порожню форму.
    - `cancel asks first`: `window.confirm` → `false` — запиту немає; `true` — `POST …/plans/<id>/cancel`.
    - `errors are shown`: 409 `plans_full` і 400 `plan_time` → `role="alert"` з текстами `err_*`.
    - `no bot quiz — a hint instead of the form`; `no groups — the group choice is disabled`.
  - `AdminBot.test.tsx`: секція «Розклад» є між «Кімнати бота» і «Вікторини бота».
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/i18n.test.ts apps/web/src/admin`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (веб) і ключами вище; переклади в 6 локалях (ar — нейтральні до напрямку плейсхолдери); стилі — картки й форма на 360 px без бічного скролу, кнопки ≥ 44 px, «фішки» людей переносяться, лише змінні теми (світла — `is-light`).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/i18n.test.ts apps/web/src/admin apps/web/src/calendar apps/web/src/source-scan.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 56 admin bot schedule — plan a bot game for a Kyiv date and time with recipients (nobody, everyone, a family group or people found by nickname), auto start after N min and a weekly repeat; the list shows state, reason and code with change and cancel; log lines; seven languages"
```

---

### Задача 7. Наскрізний сценарій і кадри (`part56-bot-schedule.e2e.ts`), повтор part 54

**Files:**
- Create: `apps/server/e2e/part56-bot-schedule.e2e.ts` (сервер з адміном і заглушкою push — `relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: 'admin56@example.com' }), push: { publicKey, send } })`, `send` складає `{ endpoint, payload, options }` в `outbox`, як у частині 20a; тікер вимкнено — час рухає `ctx.botSchedule.tick(<Date>)`; у `finally` — `shutdown` + `relisten()`; телефони 360 × 740, світла тема, `timezoneId: 'Europe/Kyiv'`).

**Сценарій** (вікторина бота «Поліські озера 56»: `classicRound` з трьох `single` по 30 с, «так/ні» не потрібні; люди: «Адмін 56», Оля й Петро — акаунти з підписками через `saveSubscription`, Тарас — акаунт без підписки; група «Малинські» — Оля й Петро, `createGroup` у базі):
`it('part 56: bot schedule — the admin plans a bot game a minute ahead for a family group with auto start, the group gets the 15-minute push and the code push, the room opens, starts by itself with a player and is played; a second plan nobody joins closes as nobody came; a cancelled plan opens nothing; a missed start fails as server down; the log has every step; a non-admin gets 404; phone 360 px, light theme')`:
1. Адмін на `/admin/bot` передає копію вікторини боту (як у part 54), у «Розклад» планує на «за 1 хв» (київський `datetime-local` з `Date.now() + 60_000`, округлено до хвилини вгору) для «Малинські», автостарт 5 хв, щотижня → «Гру заплановано.», картка «Заплановано», «Автостарт через 5 хв», «Щотижня»; кадр `schedule56-form-360`, `expectNoSideScroll`.
2. `tick(startsAt − 1 хв)` → в `outbox` два `bot` з `code: null` — лише ендпойнти Олі й Петра (не Тараса).
3. `tick(startsAt)` → «Оновити»: картка «Відкрито», «Код {code}»; у «Кімнати бота» — лобі з тим кодом; в `outbox` по одному `bot` з `code` Олі й Петру; наступний щотижневий план «Заплановано» на той самий час (Київ) через 7 днів. Кадр `schedule56-opened-360`.
4. Оля відкриває `/play/{code}` (як з пушу) і входить у лобі; `tick(startsAt + 5 хв)` → телефон Олі бачить перше запитання; картка — «Зіграно». Оля відповідає, гра доходить до кінця (кнопками вкладки «Бот» «Завершити гру» не треба — автопілот сам).
5. Другий план «нікому», автостарт 5 хв, на «за 1 хв» → `tick(старт)` → «Відкрито»; `tick(старт + 5 хв)` → «Ніхто не прийшов», кімнати з цим кодом у «Кімнати бота» немає. Кадр `schedule56-nobody-360`.
6. Третій план → «Скасувати» → підтвердження → «Скасовано»; `tick(його старт)` → нової кімнати немає, наступника немає.
7. Четвертий план, старт якого вже минув на 11 хв (час поставлено напряму в базі після створення), → `tick(now)` → «Не вдалося: сервер був недоступний».
8. `/admin/log` — рядки «запланував(-ла) гру бота «Поліські озера 56» на … (Київ)», «Розклад: бот відкрив гру «Поліські озера 56» (код …)», «скасував(-ла) гру бота», «не відкрито — сервер був недоступний»; кадр `schedule56-log-360`.
9. Оля (не адмін): `POST /api/admin/bot/plans` → 404, `GET /api/admin/bot/people?q=Ол` → 404; гість — 404. JSON вкладки без `@`.

- [ ] **Step 1: Write the scenario.** Помічники — з `helpers/common.ts` і `part54-bot-host.e2e.ts`; нових без потреби не додавати.
- [ ] **Step 2: Run** `pnpm build`, потім (після завершення збирання) `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 56"` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 3: Run** після part 56, не одночасно: `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 54"`. Expected: PASS (вкладка «Бот» з новим розділом не зламала сценарію 54).
- [ ] **Step 4: Переглянути кадри:** форма й картки на 360 px без бічного скролу, радіо й прапорці читаються в світлій темі, «(Київ)» поруч із часом, стани різнокольорові лише змінними теми.
- [ ] **Step 5: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 56 — a bot game planned a minute ahead for a family group: the 15-minute and the code pushes reach only the group, the room opens and starts by itself with a player, the weekly next plan appears; nobody came closes the lobby, a cancelled plan opens nothing, a missed start fails as server down, every step is in the log; a non-admin gets 404; 360 px, light theme"
```

---

## Розбіжності зі специфікацією (рішення плану)

1. **Код — лише в другому сповіщенні.** Специфікація пише «Код: …» уже за 15 хв, але кімната (і код) з'являється лише в момент старту; резервувати код наперед означало б міняти видачу кодів менеджера й сховища кімнат. Тому за 15 хв — «Квіз-бот відкриває гру «…» о 19:00. Код прийде окремим сповіщенням…», у момент відкриття — «Код: 123456» з посиланням `/play/{code}`; обидва з тегом `bot-{planId}`, тож друге заміняє перше.
2. **Події в стрічці немає — лише push** (специфікація це дозволяє). Стрічка тримає події ігор і календаря (`FEED_KINDS`), новий вид зачепив би вебстрічку, бейдж і чистку.
3. **Час у сповіщенні — пояс пристрою**, як у наявних нагадуваннях календаря; у формі, списку й журналі — київський з підписом «(Київ)».
4. **Без автостарту лобі чекає 30 хв** (`BOT_PLAN_WAIT_MIN`): специфікація задає «кінець очікування» лише для автостарту. Якщо за 30 хв на зв'язку нікого — «Ніхто не прийшов»; якщо гравці є — кімната чекає адміна (лобі живе до `LOBBY_TTL_MS`, 2 год; зникла в лобі — «Не вдалося: кімнату закрито до старту»).
5. **«≥ 1 гравця» — гравець на зв'язку** (`connections > 0`): гравця, що зайшов і пішов, автопілот однаково завершив би як порожню гру.
6. **Межа 20 — плани в стані «Заплановано».** Відкриті й завершені не рахуються; наступник щотижневої серії створюється навіть при 20 (він заміняє попередника). «Змінити» й «Скасувати» — лише для «Заплановано»; відкриту кімнату адмін завершує наявними кнопками «Кімнати бота». Скасування зупиняє й повтор.
7. **Журнал:** створити/змінити/скасувати — від адміна; автоматичний запуск і збій запуску — окремі види `bot_plan_run`/`bot_plan_fail` від акаунта «Квіз-бот» (рядок `admin_action` потребує автора). «Зіграно» й «Ніхто не прийшов» не пишуться — їх видно в списку.
8. **Пропущений запуск:** якщо сервер піднявся до 10 хв після старту — кімната відкривається, нагадування «за 15 хв» окремо не шлеться (лише «відкрито»); пізніше — «Не вдалося: сервер був недоступний», а щотижневий план усе одно отримує наступника.
9. **Тестовий годинник:** тікер (`botScheduleTicker`) вмикає лише `main.ts`; модульні тести й e2e рухають час викликом `tick(<Date>)`, сам цикл тікера перевіряється на `FakeScheduler`. Справжній годинник браузера в e2e не підмінюється.
10. **Пошук людей** — серед профілів за ніком (наявний `searchProfiles`), до 50 людей у плані; адмін знаходить і себе, бот і забанені не знаходяться; забанений після створення плану сповіщення не отримує.
