# План 62: кімнати бота в списку лобі й керування кімнатою бота з адмінки (46a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** Форма `GameState`, `SavedRoom`, `Room` і зрізів не змінюється. Видимість і пароль уже живуть у `room.lobby` (24c) і в знімку кімнати; нове — лише значення (`'all'` для кімнати бота) і нові виклики наявних функцій рушія (`lock`, `adjustTime`, `endRound`, `removePlayer` через `kick`, `authorTeamForm`). Рушій (`packages/engine`) у цьому плані **не змінюється**. Якщо виконавцю знадобиться нове поле в `GameState`, `Room` чи `SavedRoom` — **зупинитися й спитати контролера**.

> **Міграція — `0044_bot_plan_listed`** (план 58 бере `0043_player_card`; лише `ADD COLUMN … DEFAULT true NOT NULL`). Задача з міграцією (задача 5) будується від `main` **після злиття плану 58**; якщо 58 ще не злитий, коли до неї дійшли, — зупинитися й спитати контролера (не генерувати `0043_…` і не писати журнал руками поверх дірки).

> **Звірка з кодом.** План спирається на `main` 2026-11-20 (`2879f076`):
> - менеджер: `apps/server/src/rooms/manager.ts` — `LobbyState { visibility, password, openedAt }` ~217, `HostAction` ~419 (`'time'` має `seconds: -15 | 15`), `AuthorAction`/`AUTHOR_ACTIONS` ~454–461, `joinableOf(room)` ~659, `createBotRoom(quiz, quizId)` ~842, `private open(…)` ~854 (рядок `lobby: { visibility: hostUserId === null || challenge !== null || isBotUser(hostUserId) ? 'hidden' : 'friends', … }` ~886 — **тут план 54 сховав кімнати бота**), `botRooms()` ~1018, `setLobby(room, settings)` ~1066 (лише лобі → `wrong_phase`, виклик → `not_allowed`), `private release(room, personId)` ~1459 (без `room.continued` → `not_allowed`), `author()` ~2454, `botAct(code, action: BotAction)` ~2466, `private authorAct(room, playerId | null, action)` ~2478, `host()` ~2513 (`'end-round'` → `endRound`, `'time'` → `adjustTime`, `'lock'` → `lock`), `private kick(room, playerId)` ~2638; тест-зразок — `rooms/manager.bot.test.ts` (`it('a bot room has the bot as host, a hidden lobby and no seat')` ~41, `it('a restart keeps the bot room')` ~174 з `expect(back!.lobby.visibility).toBe('hidden')` ~183);
> - рушій (лише читання): `game.ts` `lock(state, now?)` ~2492 («Закрити запитання»; у фазі вигадок блефу → вибір, у «Шпигуні» — наступний етап), `endRound(state, now)` ~2725 (фази `IN_ROUND`, інакше `wrong_phase`), `timing.ts` `adjustTime(state, seconds: number, now)` ~52 (лише `question`; залишок 5–120 с → інакше `time_limit`; `MAX_REMAINING_MS = 120_000`), `autopilot.ts` `authorTeamForm` ~128, `autopilotStart` ~102 (для `host`/`random` склад роздає жереб у мить старту), `saved.ts` `slotsOf(state)` ~58 (без учасників без команди!), `teams.ts` `teamsOn`;
> - бот: `packages/shared/src/bot.ts` (`BOT_ACTIONS = ['start','pause','resume','end']`, `BotAction`, `isBotUser`), `bot.test.ts` ~10; `apps/server/src/bot-games.ts` `openBotGame(deps, quiz, quizId)`; `apps/server/src/bot-schedule.ts` `openPlan` ~127 (`openBotGame(...)`, потім `manager.botAct(room.code, 'end' | 'start')`), `bot-plan-store.ts` (`validate` → `Fields`, `views` → `AdminBotPlan`, `createPlan`/`updatePlan`), `db/schema.ts` `botPlan` ~1018, `drizzle/0042_bot_plan.sql`;
> - список лобі: `apps/server/src/lobby-routes.ts` `GET /api/lobbies` ~59 (фільтр `joinableOf`, `hostUserId !== null`, `!== viewerId`, `visibility !== 'hidden'`), `PUT /api/games/by-code/:code/lobby` ~77; `apps/server/src/lobby-store.ts` `lobbyRows` (профілі ведучих — `notHidden(profile.userId)`, який **ховає бота**; далі «ліниве» `ensureProfile` для відсутніх — для бота воно випадково повернуло б його профіль, тож тут потрібна явна гілка); `lobby-access.ts` `LobbyGate.check` (пароль, лічильник спроб; `trusted` — ведучий, гравці кімнати, запрошені, календар); `packages/shared/src/lobby.ts` (`LOBBY_VISIBILITIES`, `lobbyPasswordSchema` 4–32, `lobbySettingsSchema`, `LobbyRow`); веб `apps/web/src/pages/LobbyList.tsx` (`Avatar` уже малює `/quiz-bot.svg` для `BOT_USER_ID`), `screens/LobbyAccess.tsx` (зразок поля пароля);
> - адмінка: `apps/server/src/admin-bot-routes.ts` (`botStatus`, `botRoomView`, `POST /api/admin/bot/rooms/:code/:action` ~121 без тіла й без журналу), `admin-bot-schedule-routes.ts`, `admin-routes.ts` (ворота `gate` → 404, `read`/`write`; виклик `registerAdminBotRoutes` у кінці), тести `admin-bot-routes.test.ts` (`asAdmin`, `bot()`, `botQuiz()`, `lastLog()`, `it('room actions: start needs a player, then pause, resume and end')` ~150, рядок `expect((await act('kick')).statusCode).toBe(404)` ~171 — **зміниться**), `admin-routes.test.ts` список `routes` ~111–119; `packages/shared/src/admin.ts` (`ADMIN_ACTION_KINDS` ~15, `AdminLogDetails` ~41, `AdminBotRoom` ~64, `AdminBotPlan` ~73), `bot-schedule.ts` `botPlanInputSchema` ~43 (`.strict()`);
> - веб, адмінка: `apps/web/src/admin/AdminBot.tsx` (`STATUS_KEY`, `ROOM_ACTIONS`, `run`, `act`, картка `li.admin-card` з `.admin-mark` стану), `AdminBot.test.tsx`, `AdminBotSchedule.tsx` (`Form` ~56, типові ~70, `fromPlan` ~83, `toInput` ~96, прапорець `bot-plan-weekly` ~377, рядок плану ~270), `admin-api.ts` (`botRoomAct`), `admin-text.ts` `logLine` ~33, `screens/AuthorMenu.tsx` `AUTHOR_FORMS = ['pick','random','dice']` ~13; `i18n.ts` (наявні ключі для повторного вжитку: `lobbyPasswordLabel`, `lobbyPasswordSave`, `lobbyPasswordRemove`, `lobbyLocked`, `lobbySaved`, `kick`, `kickConfirm`, `slotRelease`, `slotReleaseConfirm`, `endRound`, `endRoundConfirm`, `teamFormLabel`, `teamForm_pick|random|dice`, `err_paused`, `err_time_limit`, `err_wrong_phase`), `i18n.test.ts` (`ADDED_BOT_54` ~223, умова `adds no uk keys beyond the agreed list` ~740);
> - e2e: зразки `apps/server/e2e/part54-bot-host.e2e.ts` (адмін через `relisten({ adminEmails })`, `li.admin-card` з `.admin-mark` «Лобі» ~294 — **нова розмітка картки не має додавати ще одного `.admin-mark` з «Лобі»**), `part56-bot-schedule.e2e.ts`, `helpers/common.ts` (`open`, `register`, `pilotPlayer`, `socketFrames`, `emitOk`, `expectNoSideScroll`).
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

> **Точки злиття з планом 58** (будується в `.superpowers/worktrees/plan58`, **не торкатися**; будувати від `main` після його злиття, а якщо ще не злитий — додати так само й розв'язати конфлікт, залишивши обидва): `packages/shared/src/admin.ts` (рядок `ADMIN_ACTION_KINDS` — 58 додає шість у кінці, 62 — свої після них; `AdminLogDetails` — 58 додає `achievementId?`, `amount?`, 62 — `listed?`, `locked?`), `apps/server/src/admin-routes.test.ts` (список `routes`), `apps/server/drizzle/meta/_journal.json` + `apps/server/src/db/schema.test.ts` (58 — `0043`, 62 — `0044`, новий `describe` у кінці), `apps/web/src/admin/admin-text.ts` (`logLine`: 58 передає `amount`, `achievement`; 62 — `listed`, `locked`), `i18n.ts` (блок адмінки), `locales/*.json`, `i18n.test.ts` (`ADDED_PLAYER_CARD_58` і `ADDED_BOT_ROOM_62` — обидва в довгій умові), `styles.css`. Маршрути: 62 не додає рядка реєстрації в `admin-routes.ts` — нові маршрути живуть у `admin-bot-routes.ts`.

**Мета:** кімната бота (ручна й за розкладом) видна в загальному списку лобі з ведучим «Квіз-бот», адмін може сховати її (лише за кодом) і поставити пароль; у картці кімнати вкладки «Бот» — гравці з «Вилучити»/«Звільнити», спосіб формування команд, «Пропустити запитання», «+30 с», «Завершити раунд» поряд з наявними старт/пауза/продовжити/кінець; кожна дія — через наявні функції ведучого/автора від імені бота, за воротами адмінки, у журналі; правильних відповідей у картці немає.

**Архітектура:** спільне — розширені `BOT_ACTIONS`, `botCommandSchema`, `adminBotLobbySchema`, нові поля `AdminBotRoom`, види журналу `bot_room_*`, `listed` у плані розкладу. Менеджер — лобі бота типово `'all'`, `createBotRoom(…, listed)`, `botAct(code, BotAction | BotCommand)` з новими гілками, `botLobby(code, input)` через `setLobby`. Список лобі — явна картка ведучого-бота в `lobbyRows`. Маршрути — тіло дії, `PUT …/rooms/:code/lobby`, журнал кожної вдалої дії. База — `bot_plan.listed`. Веб — `AdminBotRoomCard.tsx` (картка з керуванням), прапорець у формі плану.

**Технології:** TypeScript, zod 4, Fastify, drizzle (Postgres), vitest (проєкти `shared`/`engine`/`server`/`web`), React 19 + Testing Library, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-20-bot-room-controls-design.md` (46a); основа — плани 54 (`2026-11-19-plan-54-bot-host.md`) і 56 (`2026-11-19-plan-56-bot-schedule.md`), лобі й пароль — 24c.

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22**; рушій не змінюється; форма `GameState`, `SavedRoom`, `Room` — без змін.
- **Міграція лише додає:** `0044_bot_plan_listed` = `ALTER TABLE "bot_plan" ADD COLUMN "listed" boolean DEFAULT true NOT NULL;`, першим рядком SQL — `-- Плани бота (план 62): чи показувати відкриту кімнату в списку лобі.` Нові види журналу — значення `text`-колонки `admin_action.kind`.
- **Лише адміни:** кожен новий/змінений `/api/admin/bot/rooms/*` — через `write` (ворота `gate`), не-адміну й гостю — та сама **404**, що й невідомий маршрут; маршрути — у списку `routes` тесту `hiding the admin panel (Review Focus 3)`. Звичайним гравцям і ведучим — жодних змін поведінки.
- **Адмін не бачить відповідей:** `AdminBotRoom` не несе нічого з запитання (ні тексту, ні варіантів, ні відповідей, ні чернеток) — лише `phase`-похідні прапорці; тест шукає в JSON текст правильної відповіді.
- **Пароль ніколи не йде в журнал** (лише `locked: boolean`) і не в `GET /api/lobbies`; назовні — лише адміну в `GET /api/admin/bot` (як ведучому в `GET …/lobby`).
- Усі тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`; нові uk-ключі — у новому списку `ADDED_BOT_ROOM_62` у `i18n.test.ts`: в умову `adds no uk keys beyond the agreed list` і в тест наявності в усіх локалях з тими самими `{змінними}` (як `54 keys (the bot tab) …`). Наявні ключі вживати повторно (перелік — у «Звірці»). ru немає.
- Кириличні літерали в `apps/web/src/` — лише в словниках і тестах (`source-scan.test.ts`).
- **Нічого, пов'язаного з росією**, — у фікстурах, назвах, ніках, паролях, e2e.
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|engine|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm exec tsc -p <пакет>` у задачах 1–5, з задачі 6 — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів vitest).
- Файли правити лише Edit/Write чи `sed`; **python3 на цій машині — порожня заглушка, ним нічого не правити й не генерувати**; після коміту — `git show --stat`.
- Робоче дерево — лише `C:\ClaudeCode\quiz\.superpowers\worktrees\plan62`; жодних файлів поза `C:\ClaudeCode\quiz` (тимчасові — у `.superpowers` чи scratchpad сесії). Дерева `plan58` не торкатися.
- e2e: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 62"`; телефон 360 px, світла тема (`quiz:theme = light`, `is-light` на `<html>`); після — окремо `-t "part 54"`, потім `-t "part 56"`.
- Таймер кожного запитання у фікстурах і e2e ≥ 25 с; у «так/ні» — приблизно половина «ні».

## Рішення плану (там, де специфікація мовчить)

**Спільне (`packages/shared/src/bot.ts`, `admin.ts`, `bot-schedule.ts`)**
- `BOT_ACTIONS = ['start', 'pause', 'resume', 'end', 'skip', 'time', 'end-round'] as const` (дії без тіла; `BotAction` — їх тип, наявні виклики `botAct(code, 'start' | 'end')` у розкладі лишаються); `BOT_PERSON_ACTIONS = ['kick', 'release'] as const`; `BOT_TEAM_FORMS = ['pick', 'random', 'dice'] as const` (як `AUTHOR_FORMS` веба); `BOT_TIME_SECONDS = 30`.
- `botCommandSchema = z.discriminatedUnion('type', [z.object({ type: z.enum(BOT_ACTIONS) }).strict(), z.object({ type: z.enum(BOT_PERSON_ACTIONS), playerId: z.string().min(1).max(64) }).strict(), z.object({ type: z.literal('team-form'), form: z.enum(BOT_TEAM_FORMS) }).strict()])`; `type BotCommand = z.infer<typeof botCommandSchema>`; `BOT_COMMAND_TYPES` = усі три групи разом (для перевірки `:action` у маршруті).
- `adminBotLobbySchema = z.object({ listed: z.boolean(), password: lobbyPasswordSchema.nullable() }).strict()`; `type AdminBotLobby = z.infer<…>`.
- `admin.ts`: `ADMIN_ACTION_KINDS` + `'bot_room_start'`, `'bot_room_pause'`, `'bot_room_resume'`, `'bot_room_end'`, `'bot_room_skip'`, `'bot_room_time'`, `'bot_room_end_round'`, `'bot_room_kick'`, `'bot_room_release'`, `'bot_room_teams'`, `'bot_room_lobby'`; `AdminLogDetails` + `listed?: boolean`, `locked?: boolean`. Типи:
  ```ts
  export interface AdminBotRoomPerson { id: string; nickname: string; online: boolean; team: string | null }
  export interface AdminBotRoom {
    /* наявні: code, title, status, players, stageUrl, openedAt */
    /** Відкрите запитання (фаза question): лише тоді діють «Пропустити запитання» і «+30 с». */
    question: boolean;
    lobby: { listed: boolean; password: string | null };
    /** Люди в порядку приходу; командна гра — усі учасники (і ще без команди). */
    people: AdminBotRoomPerson[];
    /** Командна вікторина: поточний спосіб; null — соло. */
    teams: { form: TeamForm } | null;
    /** Продовжена гра (13b): лише тоді має сенс «Звільнити». */
    continued: boolean;
  }
  ```
  `AdminBotPlan` + `listed: boolean`.
- `bot-schedule.ts` `botPlanInputSchema` + `listed: z.boolean().default(true)` (старі клієнти без поля — `true`).

**Менеджер (`rooms/manager.ts`)**
- `open`: кімната бота — `visibility: 'all'` (замість `'hidden'`); решта умови без змін. `createBotRoom(quiz, quizId, listed = true)`: після `open` при `listed === false` — `room.lobby = { ...room.lobby, visibility: 'hidden' }` (до першого `commit`, подій не треба). Відновлення (`restore`) бере лобі зі знімка — старі сховані кімнати бота лишаються схованими.
- `botAct(code: string, action: BotAction | BotCommand): AckResult` — рядок нормалізується в `{ type: action }`; немає кімнати / не бота / не автопілот → `game_not_found`; `alive` → `gone`. Гілки:
  - `start`/`pause`/`resume`/`end`/`kick`/`release`/`team-form` — як досі через `authorAct(room, null, …)` (`end` у лобі — `close`);
  - `skip`, `time`, `end-round`: `state.paused` → `{ ok: false, error: 'paused' }` (пауза бота тримає hold `'author'`, а `endRound` знімає `paused`, тож на паузі ці дії не діють); `skip` → `apply(room, lock(state, now))` (той самий «Закрити запитання» ведучого: відповіді, що вже є, оцінюються, далі автопілот розкриває сам); `time` → `apply(room, adjustTime(state, BOT_TIME_SECONDS, now))`; `end-round` → `apply(room, endRound(state, now))`. Затримки 11b (`PACED`) немає — як у `authorAct`.
  - `AUTHOR_ACTIONS` і `author()` **не змінюються**: автор-гравець звичайного автопілота не отримує skip/+30/кінця раунду.
- `botLobby(code: string, input: AdminBotLobby): AckResult` — немає кімнати чи не бота → `game_not_found`; інакше `setLobby(room, { visibility: input.listed ? 'all' : 'hidden', password: input.password })` (лише лобі → `wrong_phase`, `frozen` → `restarting`).

**Список лобі (`lobby-store.ts`)**
- У `lobbyRows` ведучий-бот — окрема гілка: якщо серед `shown` є кімната `isBotUser(hostUserId)`, картка бота береться одним запитом `profile` **без** `notHidden` (`where userId = BOT_USER_ID`): `{ id: BOT_USER_ID, nickname: row?.nickname ?? BOT_NICKNAME, avatar: null, level: null }`; бот не йде ні в `notHidden`-вибірку, ні в «ліниве» `ensureProfile`, ні в `roomLevels`. Решта рядка — як у будь-якої кімнати (`locked`, `players`, `friends`). Бот нікого не «фоловить», тож `'friends'` для нього не вживається.
- `lobby-routes.ts` не змінюється (фільтр уже пропускає `'all'`). Пароль — наявний `LobbyGate`: адмін теж вводить пароль, якщо він не в кімнаті (`trusted` бота не знає).

**Маршрути (`admin-bot-routes.ts`)**
- `botRoomView(room)` + нові поля: `question = phase === 'question'`, `lobby = { listed: visibility !== 'hidden', password }`, `people` — `teamsOn(state)` ? `state.teams.members` (команда — назва з `state.teams.list` за `teamId`, інакше `null`) : `state.players` (`team: null`); `online` — `connections.get(id) > 0`; `teams = teamsOn ? { form } : null`; `continued = room.continued !== null`. Нічого з `state.quiz.rounds`/`plays` у вигляд не йде.
- `POST /api/admin/bot/rooms/:code/:action` (`write`): код `/^\d{6}$/` і `action ∈ BOT_COMMAND_TYPES`, інакше 404; `frozen` → 503 `restarting`; `botCommandSchema.safeParse({ ...(тіло-об'єкт ?? {}), type: action })` → інакше 400 `invalid_payload`; для `kick`/`release` нік людини береться з кімнати **до** дії (учасник/гравець з цим id; немає — дія сама дасть помилку); `botAct` → `game_not_found` → 404, інша → 409 `{ error }`; успіх → `logAction(db, { adminId, kind: BOT_ROOM_LOG[type], targetUserId: BOT_USER_ID, details: { title, code, text?: нік }, now })` → 204. `BOT_ROOM_LOG: Record<BotCommand['type'], AdminActionKind>` — константа в цьому файлі (`'end-round'` → `'bot_room_end_round'`, `'team-form'` → `'bot_room_teams'`, решта — `'bot_room_' + type`). Дії розкладу (`bot-schedule.ts` кличе менеджер напряму) в `bot_room_*` не пишуться — у них свої `bot_plan_run`/`bot_plan_fail`.
- `PUT /api/admin/bot/rooms/:code/lobby` (`write`): код, `frozen`, `adminBotLobbySchema` (400), `botLobby` (404 / 409 `wrong_phase` / 503); успіх → `logAction(… kind: 'bot_room_lobby', details: { title, code, listed, locked: password !== null })` → 200 `{ listed, password }`. Без змін (те саме `listed` і той самий пароль) — 200 без запису в журнал.

**Розклад (`bot_plan.listed`)**
- `db/schema.ts` `botPlan.listed: boolean('listed').notNull().default(true)`; `bot-plan-store.ts` `Fields.listed` з `input.listed`, `views` → `listed`; `successor` переносить `listed`; `bot-schedule.ts` `openPlan` → `openBotGame({ manager, maxRooms }, quiz, row.quizId, row.listed)`; `openBotGame(deps, quiz, quizId, listed = true)` → `createBotRoom(quiz, quizId, listed)`. Пароля в плані немає (див. «Розбіжності», п. 3).

**Веб**
- `admin-api.ts`: `botRoomCommand(code: string, command: BotCommand): Promise<ApiResult<object>>` (`POST …/rooms/{code}/{type}` з тілом без `type`), `saveBotLobby(code: string, input: AdminBotLobby): Promise<ApiResult<AdminBotLobby>>` (`PUT …/rooms/{code}/lobby`); `botRoomAct` лишається (обгортка над `botRoomCommand({ type })`).
- `apps/web/src/admin/AdminBotRoomCard.tsx` — `AdminBotRoomCard({ room, busy, onCommand, onLobby }: { room: AdminBotRoom; busy: boolean; onCommand: (command: BotCommand) => void; onLobby: (input: AdminBotLobby) => void })`; `AdminBot.tsx` рендерить її замість поточної розмітки `li.admin-card` (той самий `li.admin-card`, той самий єдиний `.admin-mark` стану) і передає `run`-обгортки (після кожної дії — `reload`).
  - Кнопки стану (наявні `ROOM_ACTIONS`) + у `playing`: «Пропустити запитання» і «+30 с» — лише коли `room.question`; «Завершити раунд» (`endRound`, з `window.confirm(endRoundConfirm)`); «Пропустити запитання» — з `window.confirm(adminBotSkipConfirm)`.
  - Лише в `lobby`: прапорець «Показувати в списку лобі» (зберігається одразу, з поточним паролем); поле пароля (`lobbyPasswordLabel`, підказка `adminBotPasswordHint`, `maxLength` 32) з «Зберегти пароль» (кнопка неактивна, поки довжина поза 4–32) і «Прибрати пароль» (якщо є); позначка «з паролем» (`lobbyLocked`) біля коду — **не** `.admin-mark`; після збереження — `lobbySaved`.
  - Лише в `lobby` і `room.teams !== null`: `fieldset` «Як формуємо команди» — радіо `pick`/`random`/`dice` (`teamForm_*`), поточне — `room.teams.form` (`host` показується як `random`), зміна → `{ type: 'team-form', form }`.
  - «Гравці» (`h4`, будь-який стан, крім `finished`): рядок — нік (`dir="auto"`), команда, «не на зв'язку» для `!online`; «Вилучити» (`kick`, `window.confirm(kickConfirm)`) і, якщо `room.continued`, «Звільнити» (`slotRelease`, `window.confirm(slotReleaseConfirm)`). Порожньо — `adminBotPeopleEmpty`.
- `AdminBotSchedule.tsx`: `Form.listed` (типово `true`, з плану — `plan.listed`), прапорець `bot-plan-listed` «Показувати в списку лобі» біля `bot-plan-weekly`, `toInput` → `listed`; рядок плану з `!plan.listed` — `adminBotPlanUnlisted`.
- `admin-text.ts` `logLine`: передає `listed: entry.details.listed === false ? t('adminBotLogUnlisted') : t('adminBotLogListed')`, `locked: entry.details.locked ? t('lobbyLocked') : t('adminBotLogOpen')`.
- Стилі: `.admin-bot-room` — на 360 px без бічного скролу, кнопки ≥ 44 px переносяться, список гравців — рядки з кнопками під ніком на вузькому екрані; лише змінні теми (світла тема — `is-light`).

## Порядок збирання

- 1 → 2 → 3 → 4 → 5 → 6 → 7. Залежності: 2 ← 1; 3 ← 2; 4 ← 1, 2; 5 ← 1, 2 (і злитий план 58); 6 ← 4, 5; 7 — остання.
- `pnpm typecheck` обов'язково зелений з задачі 6 (нові `ADMIN_ACTION_KINDS` вимагають ключів `adminLog_*`; до того `tsc -p apps/web` може падати саме на них — це очікувано).

## Фокус рев'ю

1. **Відповіді не витікають в адмінку.** Під час відкритого запитання з відомою правильною відповіддю (`single` з варіантом «Дніпро 62») JSON `GET /api/admin/bot` не містить тексту правильної відповіді й варіантів; картка не показує запитання. Задачі 4, 7.
2. **Пароль не витікає.** `GET /api/lobbies` і рядок журналу `bot_room_lobby` — без пароля (`body` не містить його), у списку лише `locked: true`; без пароля гравець не входить (`password_required` / `password_wrong`), з ним — входить. Задачі 3, 4, 7.
3. **Дії на паузі й поза фазою — чесні помилки, не зависання.** `skip`/`time`/`end-round` на паузі → 409 `paused` (пауза лишається, hold `'author'` не зникає); `skip`/`time` поза `question` → 409 `wrong_phase`; `time` понад 120 с → 409 `time_limit`; пароль/видимість після старту → 409 `wrong_phase`. Задачі 2, 4.
4. **Вилучення в командній грі й неіснуючий гравець.** `kick` учасника без команди в лобі командної гри вилучає його; невідомий `playerId` → 409 (`not_found`), без запису в журнал; `release` у кімнаті бота без продовження → 409 `not_allowed`. Задачі 2, 4.
5. **Старі плани й старі кімнати.** План, створений до міграції, має `listed = true` і відкриває видиму кімнату; кімната бота, відновлена зі знімка з `'hidden'`, лишається схованою; клієнт, що шле план без `listed`, отримує `listed: true`. Задачі 2, 5.

---

### Задача 1. Спільне: команди бота, лобі бота, вигляд кімнати, види журналу, `listed` плану

**Files:**
- Modify: `packages/shared/src/bot.ts` (константи й схема з «Рішень плану»; `import { z } from 'zod'`, `lobbyPasswordSchema` з `./lobby`), `packages/shared/src/admin.ts` (11 видів журналу, `AdminLogDetails.listed?/locked?`, `AdminBotRoomPerson`, нові поля `AdminBotRoom`, `AdminBotPlan.listed`), `packages/shared/src/bot-schedule.ts` (`listed` у `botPlanInputSchema`).
- Test: `packages/shared/src/bot.test.ts`, `packages/shared/src/admin.test.ts`, `packages/shared/src/bot-schedule.test.ts` (якщо немає — створити поруч).

**Interfaces (Produces):** `BOT_ACTIONS`, `BotAction`, `BOT_PERSON_ACTIONS`, `BOT_TEAM_FORMS`, `BOT_TIME_SECONDS`, `BOT_COMMAND_TYPES`, `botCommandSchema`, `BotCommand`, `adminBotLobbySchema`, `AdminBotLobby`, `AdminBotRoomPerson`, розширені `AdminBotRoom`, `AdminBotPlan`, `BotPlanInput` (`listed: boolean`).

- [ ] **Step 1: Write the failing tests:**
  - `bot.test.ts`: `BOT_ACTIONS` — `['start','pause','resume','end','skip','time','end-round']` (оновити наявне очікування ~10); `BOT_TIME_SECONDS === 30`; `botCommandSchema` приймає `{ type: 'skip' }`, `{ type: 'kick', playerId: 'p1' }`, `{ type: 'team-form', form: 'dice' }`; відкидає `{ type: 'kick' }`, `{ type: 'team-form', form: 'host' }`, `{ type: 'skip', playerId: 'p1' }`, `{ type: 'lock' }`, `{ type: 'kick', playerId: 'x'.repeat(65) }`.
  - `bot.test.ts` `adminBotLobbySchema`: `{ listed: true, password: '  сова62 ' }` → пароль `'сова62'`; `{ listed: false, password: null }` — так; `password: 'abc'`, пароль на 33 символи, зайвий ключ, без `listed` — ні.
  - `admin.test.ts`: `ADMIN_ACTION_KINDS` містить усі 11 `bot_room_*`.
  - `bot-schedule.test.ts`: `botPlanInputSchema` без `listed` → `listed === true`; з `listed: false` → `false`; `listed: 'no'` — відкинуто.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/bot.test.ts packages/shared/src/admin.test.ts packages/shared/src/bot-schedule.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (спільне). Циклічного імпорту `bot.ts` ↔ `lobby.ts` немає (`lobby.ts` бота не імпортує) — перевірити.
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 && pnpm exec tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 62 bot room controls — skip, +30 s and end round join the bot actions, kick, release and team form commands with their payloads, the bot lobby settings, the room card's people, lobby and team fields without any answers, eleven bot room log kinds and a listed flag on schedule plans that defaults to on"
```

---

### Задача 2. Менеджер: кімната бота видна в списку, нові дії бота, лобі бота

**Files:**
- Modify: `apps/server/src/rooms/manager.ts` (`open` ~886, `createBotRoom` ~842, `botAct` ~2466, новий `botLobby`), `apps/server/src/bot-games.ts` (`openBotGame(deps, quiz, quizId, listed = true)`).
- Test: `apps/server/src/rooms/manager.bot.test.ts`.

**Interfaces:**
- Consumes: `BotAction`, `BotCommand`, `BOT_TIME_SECONDS`, `AdminBotLobby` (задача 1).
- Produces: `createBotRoom(quiz: Quiz, quizId: string, listed?: boolean)`, `botAct(code: string, action: BotAction | BotCommand): AckResult`, `botLobby(code: string, input: AdminBotLobby): AckResult`, `openBotGame(deps, quiz, quizId, listed?: boolean)`.

- [ ] **Step 1: Write the failing tests** (`manager.bot.test.ts`, фікстура — наявна в файлі, запитання з `timeLimit: 60`):
  - оновити `a bot room has the bot as host, a hidden lobby and no seat` → `… a listed lobby …`: `room.lobby.visibility === 'all'`, `password === null`; `createBotRoom(quiz, id, false)` → `'hidden'`.
  - `a restart keeps the bot room` — без змін очікування для схованої (створити з `listed = false`); додати: видима після відновлення — `'all'`.
  - `the bot lobby takes a password and visibility, only in the lobby`: `botLobby(code, { listed: false, password: 'сова62' })` → ok, `room.lobby` — `{ visibility: 'hidden', password: 'сова62' }`; після старту → `wrong_phase`; звичайна кімната чи `'999999'` → `game_not_found`.
  - `skip closes the open question and the autopilot goes on`: старт з гравцем на зв'язку, довести до `question` (кроки `FakeScheduler`, як у наявних тестах) → `botAct(code, 'skip')` ok, `phase === 'locked'`; повтор → `wrong_phase`.
  - `+30 s adds thirty seconds, within the 120 s cap`: у `question` `endsAt` після `botAct(code, 'time')` більший рівно на 30 000; ще тричі → остання `time_limit`.
  - `end round ends the round`: у `question` → `botAct(code, 'end-round')` ok, фаза поза раундом (`round_end` чи `finished` для одного раунду — за наявною поведінкою `endRound`).
  - `skip, time and end round wait while the bot room is paused`: після `botAct(code, 'pause')` усі три → `paused`; `state.autopilot.hold === 'author'` лишається.
  - `kick removes a player, also a member without a team in the lobby`: соло — `{ type: 'kick', playerId }` → гравця немає, подія `kicked`; командна вікторина (`settings.teams` з `count: 2`) — учасник без команди в лобі вилучається; невідомий id → помилка `not_found`.
  - `release needs a continued game`: `{ type: 'release', playerId }` → `not_allowed`.
  - `team form is the author's choice`: командна — `{ type: 'team-form', form: 'dice' }` → `state.teams.form === 'dice'`.
  - `a plain autopilot author still cannot skip`: `author(room, authorId, { type: 'lock' })` у звичайному автопілоті → `not_allowed` (`AUTHOR_ACTIONS` не змінено).
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/rooms/manager.bot.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (менеджер); імпорти `lock`, `adjustTime`, `endRound` у менеджері вже є (кличе `host()`).
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/rooms/manager.bot.test.ts apps/server/src/rooms/manager.autopilot.test.ts apps/server/src/rooms/manager.lobby.test.ts apps/server/src/bot-schedule.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/rooms/manager.ts apps/server/src/rooms/manager.bot.test.ts apps/server/src/bot-games.ts
git commit -m "feat(server): 62 bot rooms open listed for everyone unless asked hidden; the admin can close the open question, add 30 s, end the round, kick, release, pick the team form and set the bot lobby password and visibility, with the same engine steps as a host; nothing new for a plain autopilot author"
```

---

### Задача 3. Список лобі: кімната бота з ведучим «Квіз-бот»

**Files:**
- Modify: `apps/server/src/lobby-store.ts` (`lobbyRows` — гілка бота).
- Test: `apps/server/src/lobby-routes.test.ts` (новий `describe('bot rooms in the lobby list (62)')`).

**Interfaces:** Consumes: `createBotRoom`, `botLobby` (задача 2), `ensureBotAccount` (`bot-account.ts`).

- [ ] **Step 1: Write the failing tests** (світ як у `GET /api/lobbies (24c)`: `createTestDb`, `buildApp`, `ensureBotAccount(db)`, кімната — `ctx.manager.createBotRoom(quiz, quizId)` з вікториною бота через `createQuiz(db, BOT_USER_ID, …)`):
  - `a bot room is in the list for guests and accounts`: для гостя й Олі — рядок `{ code, title, host: { id: 'quiz-bot', nickname: 'Квіз-бот', avatar: null, level: null }, locked: false, late: false, … }`.
  - `a hidden bot room is not listed`: `botLobby(code, { listed: false, password: null })` → для всіх `[]`.
  - `a bot room with a password shows the lock and asks for it`: `botLobby(code, { listed: true, password: 'сова62' })` → `locked: true`, `response.body` без `сова62`; `POST /api/games/by-code/{code}/join` Олі без пароля → 403 `password_required`, з хибним → 403 `password_wrong`, з `сова62` → 200.
  - `the bot host stays hidden elsewhere`: після запиту списку `GET /api/profiles/quiz-bot` → 404 (бот не «оживає» через список).
  - `a started bot room leaves the list`: після `botAct(code, 'start')` → `[]`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/lobby-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (список лобі).
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/lobby-routes.test.ts apps/server/src/hidden.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/lobby-store.ts apps/server/src/lobby-routes.test.ts
git commit -m "feat(server): 62 bot rooms appear in the public lobby list with the «Квіз-бот» host card and a lock when they have a password; a hidden or started bot room is not listed, the bot stays hidden everywhere else"
```

---

### Задача 4. Маршрути адмінки: картка кімнати бота, команди з тілом, лобі, журнал

**Files:**
- Modify: `apps/server/src/admin-bot-routes.ts` (`botRoomView`, `POST …/rooms/:code/:action`, новий `PUT …/rooms/:code/lobby`, `BOT_ROOM_LOG`), `apps/server/src/admin-routes.test.ts` (список `routes`: `['POST', '/api/admin/bot/rooms/123456/kick']`, `['PUT', '/api/admin/bot/rooms/123456/lobby']`).
- Test: `apps/server/src/admin-bot-routes.test.ts`.

**Interfaces:**
- Consumes: `botCommandSchema`, `BOT_COMMAND_TYPES`, `adminBotLobbySchema`, `AdminBotRoom` (задача 1); `botAct`, `botLobby` (задача 2).
- Produces: `POST /api/admin/bot/rooms/:code/:action` (тіло — `BotCommand` без `type`) → 204; `PUT /api/admin/bot/rooms/:code/lobby` → 200 `AdminBotLobby`.

- [ ] **Step 1: Write the failing tests** (`admin-bot-routes.test.ts`; `TITLE`, `rivers()` — наявні, у `single` правильний варіант перейменувати на «Дніпро 62» у новому тесті):
  - оновити `room actions: …`: рядок `act('kick')` без тіла → тепер **400** `invalid_payload`; `act('lock')` → 404; кожна вдала дія лишає `lastLog()` з `kind` `bot_room_start` / `bot_room_pause` / `bot_room_resume` / `bot_room_end` і `details: { title: TITLE, code }`.
  - `the room card lists people and lobby, never the answers`: лобі з Олею (`manager.join` + `connect`) → `rooms[0]` має `lobby: { listed: true, password: null }`, `people: [{ id, nickname: 'Оля', online: true, team: null }]`, `teams: null`, `continued: false`, `question: false`; після старту в `question` → `question: true`, а `JSON.stringify(await bot())` не містить `Дніпро 62` і тексту запитання.
  - `skip, +30 s and end round, each logged`: у `question` — `POST …/time` → 204 і лог `bot_room_time`; `…/skip` → 204, лог `bot_room_skip`; повторний `skip` → 409 `wrong_phase` без нового запису; на паузі `…/end-round` → 409 `paused`.
  - `kick by player id with the nickname in the log`: `POST …/kick` `{ playerId }` → 204, `lastLog()` `kind: 'bot_room_kick'`, `details.text === 'Оля'`; невідомий id → 409 без запису; `POST …/release` → 409 `not_allowed`.
  - `team form in a team quiz`: командна вікторина бота → `POST …/team-form` `{ form: 'dice' }` → 204, `rooms[0].teams` `{ form: 'dice' }`, лог `bot_room_teams`; `{ form: 'host' }` → 400.
  - `lobby: password and visibility, logged without the password`: `PUT …/lobby` `{ listed: false, password: 'сова62' }` → 200 `{ listed: false, password: 'сова62' }`; `lastLog()` — `kind: 'bot_room_lobby'`, `details: { title, code, listed: false, locked: true }`, у тілі відповіді журналу немає `сова62`; той самий запит ще раз → 200 без нового запису; `password: 'abc'` → 400; після старту → 409 `wrong_phase`; звичайна кімната → 404; `frozen` → 503.
  - `admin-routes.test.ts` `hiding the admin panel (Review Focus 3)`: два нові маршрути — не-адміну й гостю 404 без заголовків обмеження.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/admin-bot-routes.test.ts apps/server/src/admin-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (маршрути).
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/admin-bot-routes.test.ts apps/server/src/admin-routes.test.ts apps/server/src/admin-bot-schedule-routes.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/admin-bot-routes.ts apps/server/src/admin-bot-routes.test.ts apps/server/src/admin-routes.test.ts
git commit -m "feat(server): 62 admin bot room card — people with team and online state, lobby password and visibility, team form and an open-question flag with no answers; room commands take a body for kick, release and team form, a lobby endpoint sets password and visibility, and every successful room action goes to the admin log without the password"
```

---

### Задача 5. База й розклад: `bot_plan.listed` (міграція `0044_bot_plan_listed`)

**Files:**
- Create: `apps/server/drizzle/0044_bot_plan_listed.sql` + `meta/0044_snapshot.json` + запис у `meta/_journal.json` (`pnpm --filter @quiz/server exec drizzle-kit generate --name bot_plan_listed`, потім дописати коментар першим рядком; номер має вийти `0044` — інакше зупинитися, див. шапку).
- Modify: `apps/server/src/db/schema.ts` (`botPlan.listed`), `apps/server/src/bot-plan-store.ts` (`Fields`, `validate`, `views`), `apps/server/src/bot-schedule.ts` (`successor`, `openPlan`).
- Test: `apps/server/src/db/schema.test.ts` (новий `describe('bot plan listed (62)')` у кінці), `apps/server/src/bot-plan-store.test.ts`, `apps/server/src/bot-schedule.test.ts`.

**Interfaces:** Consumes: `BotPlanInput.listed`, `AdminBotPlan.listed` (задача 1), `openBotGame(…, listed)` (задача 2).

- [ ] **Step 1: Write the failing tests:**
  - `schema.test.ts`: `migration 0044 adds listed over an older database, old plans stay listed` (`createTestDbUpTo('0043_player_card')`; план, вставлений до міграції, після `migrateRest` має `listed === true`).
  - `bot-plan-store.test.ts`: `a plan keeps listed`: `createPlan(…, { …, listed: false })` → `plan.listed === false`, `listPlans` — те саме; `updatePlan` з `listed: true` → `true`. У наявних викликах, де `BotPlanInput` зібрано вручну, додати `listed: true`.
  - `bot-schedule.test.ts`: `a hidden plan opens a hidden room, a listed one a listed room` (`room.lobby.visibility` — `'hidden'` / `'all'`); `a weekly successor keeps listed`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/db/schema.test.ts apps/server/src/bot-plan-store.test.ts apps/server/src/bot-schedule.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (розклад) і міграцію з «Глобальних обмежень».
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/db/schema.test.ts apps/server/src/bot-plan-store.test.ts apps/server/src/bot-schedule.test.ts apps/server/src/admin-bot-schedule-routes.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/drizzle apps/server/src/db/schema.ts apps/server/src/db/schema.test.ts apps/server/src/bot-plan-store.ts apps/server/src/bot-plan-store.test.ts apps/server/src/bot-schedule.ts apps/server/src/bot-schedule.test.ts
git commit -m "feat(server): 62 schedule plans carry «show in the lobby list» — migration 0044 adds bot_plan.listed defaulting to on, the plan opens its room listed or hidden and a weekly successor keeps the choice"
```

---

### Задача 6. Веб: картка кімнати бота з керуванням, прапорець у плані, рядки журналу, 7 мов

**Files:**
- Create: `apps/web/src/admin/AdminBotRoomCard.tsx`, `apps/web/src/admin/AdminBotRoomCard.test.tsx`.
- Modify: `apps/web/src/admin/AdminBot.tsx` (картка → `AdminBotRoomCard`, обгортки `run` для команд і лобі), `apps/web/src/admin/AdminBotSchedule.tsx` (`listed`), `apps/web/src/admin/admin-api.ts` (`botRoomCommand`, `saveBotLobby`), `apps/web/src/admin/admin-text.ts` (`listed`, `locked` у `logLine`), `apps/web/src/styles.css` (`.admin-bot-room`), `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,de,es,it,pl,ar}.json`, `apps/web/src/i18n.test.ts` (`ADDED_BOT_ROOM_62`).
- Test: `apps/web/src/admin/AdminBot.test.tsx`, `apps/web/src/admin/AdminBotSchedule.test.tsx`, `apps/web/src/admin/admin-text.test.ts`, `apps/web/src/pages/LobbyList.test.tsx`.

**Ключі (uk, нові):**
- Картка: `adminBotListed` «Показувати в списку лобі», `adminBotListedHint` «Вимкнено — у гру входять лише за кодом.», `adminBotPasswordHint` «Від 4 до 32 символів. Без нього в гру не ввійти — і тобі теж.», `adminBotPeople` «Гравці», `adminBotPeopleEmpty` «Ще ніхто не приєднався.», `adminBotOffline` «не на зв'язку», `adminBotSkip` «Пропустити запитання», `adminBotSkipConfirm` «Закрити запитання в грі {code} зараз? Відповіді, що вже є, зарахуються.», `adminBotTime` «+30 с».
- Розклад: `adminBotPlanUnlisted` «Лише за кодом (не в списку лобі)».
- Журнал: `adminLog_bot_room_start` «{admin} почав(-ла) гру бота (код {code})», `adminLog_bot_room_pause` «{admin} поставив(-ла) гру бота на паузу (код {code})», `adminLog_bot_room_resume` «{admin} продовжив(-ла) гру бота (код {code})», `adminLog_bot_room_end` «{admin} завершив(-ла) гру бота (код {code})», `adminLog_bot_room_skip` «{admin} пропустив(-ла) запитання в грі бота (код {code})», `adminLog_bot_room_time` «{admin} додав(-ла) 30 с у грі бота (код {code})», `adminLog_bot_room_end_round` «{admin} завершив(-ла) раунд у грі бота (код {code})», `adminLog_bot_room_kick` «{admin} вилучив(-ла) {text} з гри бота (код {code})», `adminLog_bot_room_release` «{admin} звільнив(-ла) місце {text} у грі бота (код {code})», `adminLog_bot_room_teams` «{admin} змінив(-ла) спосіб формування команд у грі бота (код {code})», `adminLog_bot_room_lobby` «{admin} змінив(-ла) лобі гри бота (код {code}): {listed}, {locked}», `adminBotLogListed` «у списку лобі», `adminBotLogUnlisted` «лише за кодом», `adminBotLogOpen` «без пароля».
- Повторно (не нові): `lobbyPasswordLabel`, `lobbyPasswordSave`, `lobbyPasswordRemove`, `lobbyLocked`, `lobbySaved`, `kick`, `kickConfirm`, `slotRelease`, `slotReleaseConfirm`, `endRound`, `endRoundConfirm`, `teamFormLabel`, `teamForm_pick|random|dice`.

- [ ] **Step 1: Write the failing tests:**
  - `i18n.test.ts`: `ADDED_BOT_ROOM_62` — в умову `adds no uk keys beyond the agreed list`; `it('62 keys (bot room controls) are in every language')` з тими самими `{змінними}`.
  - `admin-text.test.ts`: `bot_room_kick` з `details: { title: 'Річки України 62', code: '123456', text: 'Оля' }`, адмін «Адмін» → «Адмін вилучив(-ла) Оля з гри бота (код 123456)»; `bot_room_lobby` з `listed: false, locked: true` → «… (код 123456): лише за кодом, з паролем»; `listed: true, locked: false` → «…: у списку лобі, без пароля».
  - `AdminBotRoomCard.test.tsx`:
    - `a lobby card: listed switch, password, people with kick`: прапорець «Показувати в списку лобі» увімкнено; зняти → `onLobby({ listed: false, password: null })`; ввести « сова62 » → «Зберегти пароль» → `onLobby({ listed: true, password: 'сова62' })`; «abc» → кнопка неактивна; «Вилучити» біля «Оля» з `window.confirm` → `false` — нічого, `true` — `onCommand({ type: 'kick', playerId: 'p1' })`; «Звільнити» немає (`continued: false`); рівно один `.admin-mark`.
    - `a locked lobby shows the lock and removes the password`: `password: 'сова62'` → «з паролем»; «Прибрати пароль» → `onLobby({ listed: true, password: null })`.
    - `team form only for a team quiz in the lobby`: `teams: { form: 'pick' }` → радіо «Гравці обирають» вибрано, «Кубик» → `onCommand({ type: 'team-form', form: 'dice' })`; `teams: null` — групи немає.
    - `playing with an open question: skip, +30 s, end round`: `status: 'playing', question: true` → «+30 с» → `{ type: 'time' }`; «Пропустити запитання» з підтвердженням → `{ type: 'skip' }`; «Завершити раунд» з підтвердженням → `{ type: 'end-round' }`; без `question` — «+30 с» і «Пропустити запитання» немає; `paused` — немає всіх трьох; лобі-поле пароля і прапорець поза лобі не показуються.
    - `a continued game offers release`: `continued: true` → «Звільнити» з `slotReleaseConfirm` → `{ type: 'release', playerId: 'p1' }`.
  - `AdminBot.test.tsx`: `a room command posts its body and reloads`: «Вилучити» → `POST /api/admin/bot/rooms/123456/kick` з тілом `{ playerId: 'p1' }` і повторний `GET /api/admin/bot`; `PUT …/lobby` після зняття прапорця; помилка 409 `wrong_phase` → `role="alert"` з `err_wrong_phase`. Наявні тести — з новими полями у фікстурі кімнат.
  - `AdminBotSchedule.test.tsx`: прапорець «Показувати в списку лобі» типово увімкнено, знятий → тіло `POST /api/admin/bot/plans` має `listed: false`; план з `listed: false` у списку — «Лише за кодом (не в списку лобі)», а форма редагування — з знятим прапорцем.
  - `LobbyList.test.tsx`: `rows: a bot room shows the bot picture and name`: рядок з `host: { id: 'quiz-bot', nickname: 'Квіз-бот', avatar: null, level: null }` → `img[src="/quiz-bot.svg"]`, текст «Квіз-бот».
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/i18n.test.ts apps/web/src/admin apps/web/src/pages/LobbyList.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (веб): uk-тексти вище, переклади в 6 локалях (ar — RTL-нейтральні плейсхолдери, «+30 с» — з місцевим скороченням секунд), `AdminBotRoomCard`, API, `AdminBotSchedule`, `logLine`, стилі.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/i18n.test.ts apps/web/src/admin apps/web/src/pages apps/web/src/source-scan.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 62 bot room card controls — show in the lobby list, lobby password, players with kick and release, team form, skip question, +30 s and end round next to start, pause, resume and end; a listed switch on schedule plans and log lines for every bot room action, in seven languages"
```

---

### Задача 7. Наскрізний сценарій і кадри (`part62-bot-room-controls.e2e.ts`), повтор part 54 / 56

**Files:**
- Create: `apps/server/e2e/part62-bot-room-controls.e2e.ts` (сервер з адміном — як `part54-bot-host.e2e.ts`: `flags.restarting = true; await ctx.shutdown(); await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: 'admin62@example.com' }) }); flags.restarting = false`, у `finally` — `relisten()`; телефони 360 × 740, світла тема).

**Сценарій** (вікторина бота «Річки й гори 62»: `classicRound` з трьома `single` по 60 с — правильні «Дніпро 62», «Говерла 62», «Ні» (так/ні з «ні»); люди: адмін «Адмін 62», Оля й Тарас (акаунти, свої сторінки), Петро — гравець-сокет `pilotPlayer`):
`it('part 62: bot room controls — a bot room is in the lobby list with «Квіз-бот», a password puts a lock and is asked on join, a hidden room is not listed, the admin kicks a player, adds 30 s and skips the question from the bot tab with log lines and no answers on the card; phone 360 px, light theme')`:
1. Адмін копіює вікторину боту й тисне «Запустити гру» на `/admin/bot` (як part 54, кроки 1–2) → картка «Лобі» з прапорцем «Показувати в списку лобі» увімкненим.
2. Оля на `/`: у `.lobby-list` рядок «Річки й гори 62» з ведучим «Квіз-бот» і `img[src="/quiz-bot.svg"]`; кадр `bot62-lobby-list-360`, `expectNoSideScroll`.
3. Адмін вводить пароль «сова62» → «Зберегти пароль» → «Збережено»; у Олі (опитування `LOBBY_POLL_MS`) — замок 🔒 (`aria-label` «з паролем»). Оля тисне рядок → `/play/{code}` просить «Пароль гри»; хибний «сова00» — помилка; «сова62» — «Ви в грі». Тексти сторінки Олі й тіло `GET /api/lobbies` — без «сова62». Кадр `bot62-password-360`.
4. Адмін знімає «Показувати в списку лобі» → у Тараса на `/` рядка немає (`expect.poll`); Тарас входить кодом із паролем. Адмін вмикає прапорець знову → рядок у Тараса з'являється.
5. Петро (сокет) входить кодом із паролем. Адмін «Оновити» → у «Гравці» — Оля, Тарас, Петро; «Вилучити» біля Петра → підтвердження → сокет Петра отримує `kicked`, у списку двоє. Кадр картки `bot62-room-lobby-360`, `expectNoSideScroll`.
6. «Почати гру»; на першому запитанні в картці — «+30 с» і «Пропустити запитання»; текст картки не містить «Дніпро 62». «+30 с» → у кадрах сокета гравця (`socketFrames` Олі через сторінку — або окремий сокет-спостерігач) `endsAt` зріс на ≥ 29 с. «Пропустити запитання» → підтвердження → на телефоні Олі — кінець запитання (розкриття автопілотом), картка без «Пропустити запитання». Кадр `bot62-room-playing-360`.
7. «Пауза» → «+30 с», «Пропустити запитання», «Завершити раунд» зникли; «Продовжити» → «Завершити гру» → підтвердження.
8. `/admin/log` — рядки «змінив(-ла) лобі гри бота (код …): у списку лобі, з паролем», «…: лише за кодом, з паролем», «вилучив(-ла) Петро з гри бота», «почав(-ла) гру бота», «додав(-ла) 30 с у грі бота», «пропустив(-ла) запитання в грі бота»; у журналі немає «сова62»; кадр `bot62-log-360`.
9. Оля (не адмін): `PUT /api/admin/bot/rooms/{code}/lobby` і `POST /api/admin/bot/rooms/{code}/kick` → 404.

- [ ] **Step 1: Write the scenario.** Помічники — з `helpers/common.ts`, нових не додавати без потреби; кроки створення кімнати бота — як у `part54-bot-host.e2e.ts`.
- [ ] **Step 2: Run** `pnpm build`, потім (після завершення збирання) `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 62"` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 3: Run** по одному, після part 62, не одночасно: `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 54"`, потім `-t "part 56"`. Expected: PASS (нова картка не зламала лічби «Лобі» в part 54; план розкладу з прапорцем — part 56).
- [ ] **Step 4: Переглянути кадри:** на 360 px у світлій темі рядок бота в списку лобі з картинкою бота й замком; картка кімнати з прапорцем, полем пароля, списком гравців і кнопками без бічного скролу, кнопки читаються; у кадрі гри немає тексту відповіді.
- [ ] **Step 5: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 62 — a bot room is listed with «Квіз-бот», a password shows the lock and is asked on join, a hidden room is not listed, the admin kicks a player, adds 30 s and skips the question from the bot tab with no answers on the card and log lines without the password; 360 px, light theme"
```

---

## Розбіжності зі специфікацією (рішення плану)

1. **«Пропустити запитання» = наявне «Закрити запитання» ведучого (`lock`).** Окремої дії «пропустити без оцінки» в рушії немає, а план рушія не змінює: відповіді, що вже надіслано, зараховуються, решта — як після кінця часу; далі автопілот сам розкриває й іде далі. У «Шпигуні» та у фазі вигадок блефу `lock` закриває поточний етап (як у ведучого).
2. **«+30 с» — один крок `adjustTime(30)`**, а не дві кнопки «+15 с» ведучого; залишок обмежує наявна межа 5–120 с (`time_limit`). «Пропустити запитання», «+30 с» і «Завершити раунд» на паузі не діють (`paused`): `endRound` знімає паузу, а пауза бота тримає hold автора — щоб гра не пішла сама. Ці три дії — лише в кімнаті бота; автор-гравець звичайного автопілота їх не отримує.
3. **Пароль — лише на кімнаті, не в плані розкладу.** Специфікація просить у плані «те саме поле» — це перемикач «Показувати в списку лобі» (`bot_plan.listed`, міграція `0044`, типово увімкнено). Пароль для плану зберігався б у базі відкритим текстом задовго до гри; адмін ставить його на відкриту кімнату в картці (кімната плану з'являється за розкладом, пуш несе код). Пароль і видимість змінюються лише в лобі (як у ведучого, `wrong_phase` після старту).
4. **«Сформувати / перемішати» команди = вибір способу автора** («Гравці обирають», «Випадково», «Кубик»), як в меню автора автопілота. Окремого «Розподілити/перемішати» немає: в автопілоті склад для «Випадково» роздає жереб у мить старту (`autopilotStart`), тож ручний розподіл у лобі однаково перезаписався б.
5. **«Відпустити» = наявне «Звільнити місце» (`host:release`)** — лише для продовженої гри; кімната бота не зберігається (план 54), тож кнопка в ній практично не з'являється, а маршрут чесно відповідає `not_allowed`.
6. **Журнал — кожна вдала дія з картки**, включно зі старт/пауза/продовжити/кінець, які план 54 у журнал не писав (специфікація 46a: «усі дії … у журнал адмінки»). Невдалі дії й дії розкладу (у них `bot_plan_run`/`bot_plan_fail`) — без нових записів. Пароль у журнал не потрапляє — лише «з паролем / без пароля»; зміна лобі без різниці не пишеться.
7. **Кімната бота типово видна всім (`'all'`),** не «друзям» (бот ні на кого не підписаний, тож `'friends'` нікого б не показав). Адмін, що приєднується до кімнати з паролем як гравець, теж вводить пароль: `LobbyGate` не знає адмінів, і так менше нових шляхів обходу.
8. **Картка оновлюється кнопкою «Оновити» й після кожної дії**, як у плані 54; живого оновлення списку гравців без натискання немає.
