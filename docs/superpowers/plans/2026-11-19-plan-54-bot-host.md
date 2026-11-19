# План 54: бот-ведучий — службовий акаунт «Квіз-бот», що проводить вікторини, і вкладка «Бот» в адмінці (42)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** Форма `GameState`, `SavedRoom` і зрізів не змінюється. Нове — лише значення: у стані гри бота `autopilot.authorId === BOT_PLAYER_ID` (`'quiz-bot'`), і цього id **немає** серед `players`/`teams.members`. Наявний код рушія з таким станом працює (усі перевірки автора — порівняння id, які тепер нікого не зачіпають); знімок кімнати бота — звичайний знімок з `hostUserId = BOT_USER_ID`. Якщо виконавцю знадобиться нове поле в `GameState`, `Room`-знімку чи `SavedRoom` — **зупинитися й спитати контролера**.

> **Міграції немає.** Акаунт бота — рядки `user` і `profile`, які ідемпотентно створює `ensureBotAccount(db)` (старт сервера, перша копія боту, сід-скрипт). Нові види журналу — значення `text`-колонки `admin_action.kind`. Якщо міграція все ж знадобиться — номер **`0042_…`** (план 53 бере `0041_announcement`), лише додавання.

> **Звірка з кодом.** План спирається на `main` 2026-11-19 (`4b13c39a`, після специфікації 42) і на план 53 (`docs/superpowers/plans/2026-11-19-plan-53-admin-home.md`), що будується в `.superpowers/worktrees/plan53`:
> - рушій: `packages/engine/src/autopilot.ts` (`createAutopilotGame(quiz, author, options)` = `addPlayer(createGame(autopilotQuiz(quiz), options), author)` + `autopilot: { authorId, at: null }`; `isAuthor`; `autopilotStart` не перевіряє, хто тисне; `authorPause`/`authorResume`), обмеження автора — `spy.ts` `spyCast`/`spectator` (`spy_spectator`), `think.ts` `thinkWatches` (`think_spectator`), `team-act.ts` ~63, `answerer.ts` ~76, `truth.ts`; `start` → `no_players`, якщо гравців 0 (`game.ts` ~2170); тестові фікстури — `@quiz/engine/testing` (`makeRoundsQuiz`, `classicRound`, `single`, `spy`, `think`, `thinkRound`, `truthRound`);
> - кімнати: `apps/server/src/rooms/manager.ts` — `createAutopilot(quiz, hostUserId, quizId, nickname, options)` ~813 (автор — гравець поза зв'язком, `room.playerUsers.set(playerId, hostUserId)`), `private open(state, hostUserId, quizId, id, challenge)` ~840 (`lobby.visibility`: `hidden` для `hostUserId === null` чи виклику, інакше `friends`), `author(room, playerId, action)` ~2400 (`AUTHOR_ACTIONS`, `isAuthor` → `not_allowed`), `watchEmpty` ~2611 (`AUTOPILOT_EMPTY_MS` → `autosave`), `watchAuthor` ~2630 (пауза автора без зв'язку знімається за `HOST_ABSENCE_MS` = 10 хв), `save`/`private savable(room, auto)` ~2651–2670, `like(room, by, payload)` ~1147; `rooms/likes.ts` `likesView(room, personId)`; тест-зразок — `rooms/manager.ban.test.ts` (`new RoomManager(new FakeScheduler(), () => 0.5, { pacing: false })`);
> - створення автопілота сервером: `apps/server/src/account-routes.ts` `POST /api/games` ~201 (`manager.size >= maxRooms` → 503 `server_busy`, `manager.frozen` → 503 `restarting`, `autopilotCheck(quiz).blocked.length > 0` → 409 `autopilot_blocked`), `currentUser` ~64 (банований → `null`);
> - акаунти: Better Auth (`apps/server/src/auth.ts`: `emailAndPassword` увімкнено, Google — за ключами, `accountLinking.requireLocalEmailVerified: true`, скидання пароля не налаштоване; хук `databaseHooks.session.create.before` уже відмовляє забаненим `APIError('FORBIDDEN', …)`); таблиці `user` (`id text pk`, `name`, `email unique`, `email_verified`), `account` (облікові дані — пароль чи Google), `session`, `profile` (`db/schema.ts` ~58–110, ~373); `profiles.ts` `ensureProfile(db, userId)` (нік з `user.name`, з номером, якщо зайнятий), `AVATAR_URL` (лише `/uploads/…`);
> - приховування людей: **єдина точка** — `feed-store.ts` `notHidden(column)` (~36, `not exists user_ban`), її беруть пошук друзів (`profiles.ts` `searchProfiles` ~180, `findByNickname` ~190), друзі (`friendsOf` ~146–154), стрічка, календар, групи (сімейна ліга — лише учасники груп), бібліотека, лобі, пуші, скарги; TS-двійник — `bans.ts` `isBanned(db, userId)` (`account-routes.ts` ~64, `profile-routes.ts` ~31 `hidden`, ~153, `profiles.ts` ~268 `publicProfile`, `invites.ts` ~163, `report-store.ts` ~45, `auth.ts` ~41);
> - нагороди: `xp-store.ts` `creditGame` (~254; цикл «ачівки ведучого й автора» ~276 по `meta.hostId`, `meta.ownerId`), `achievement-store.ts` `awardGame` (~421; `users.add(roles.hostId, roles.ownerId)` ~432), `feed-publish.ts` `publishGameFeed` (~169; `announceLevels(db, [гравці, hostId, ownerId])`), `host-achievements.ts` (автопілот уже не рахується);
> - адмінка: `apps/server/src/admin-routes.ts` (`AdminDeps { db, manager, adminEmails, currentUser, now? }`, `adminOf`, ворота `gate` — не-адміну **404** як невідомий маршрут, `limited(prefix, max)` → `read` 120/хв, `write` 30/хв), `admin-store.ts` (`adminStats` — `users.total/new7/new30` з таблиці `user`; `adminUsers`/`userRows`), `bans.ts` `logAction(tx, { adminId, kind, targetUserId, details, now })`, `quizzes.ts` (`listQuizzes`, `getQuiz(db, ownerId, id)`, `createQuiz(db, ownerId, data)`, `deleteQuiz(db, ownerId, id, onDone)`), `library-store.ts` `copyEntry` (копія — той самий `createQuiz`, картинки — ті самі URL); тести `admin-routes.test.ts` (`person(name, verified)` ~35, `lastLog()` ~59, `joinAndStart(code)` ~64, `describe('hiding the admin panel (Review Focus 3)')` ~90 зі списком `routes`); `packages/shared/src/admin.ts` (`ADMIN_ACTION_KINDS`, `AdminLogDetails`, `AdminLogEntry`); `packages/shared/src/autopilot.ts` `autopilotCheck`;
> - веб, адмінка: `apps/web/src/admin/Admin.tsx` (`TABS`, `<Routes>`; не-адміна — `Navigate to="/"`), `admin-api.ts` (`fetchData`, `request`), `useAdminData.ts`, `admin-text.ts` `logLine`, `AdminQuizzes.tsx` (зразок списку з `window.confirm`, `errorText`, `quizSizeText`), `apps/web/src/api.ts` `listQuizzes()` (свої вікторини), `profile/Avatar.tsx`, `i18n.ts` (адмінка ~4194–4290), `locales/{en,de,es,it,pl,ar}.json`, `i18n.test.ts` (умова `adds no uk keys beyond the agreed list` ~616, найновіший список `ADDED_LEVELS_49` ~210, перевірка ~453);
> - сід: `apps/server/scripts/seed-demo.ts` (розбір `process.argv` ~283–296: `<email> [seed]` або `--update <quizId> <seed>`; власник — `select user.id where email`), тести скриптів — у проєкті `server` (`scripts/**/*.test.ts`);
> - e2e: `apps/server/e2e/helpers/setup.ts` (`relisten`, `flags.restarting`, `ctx.shutdown()`), `helpers/common.ts` (`open`, `register`, `pilotPlayer(sockets, code, nick)`, `socketFrames`, `frame`, `emitOk`, `expectNoSideScroll`), зразки — `part47-library.e2e.ts` ~79–110 (адмін через `relisten({ adminEmails: adminEmails({ ADMIN_EMAILS }) })`), `part35-think.e2e.ts` ~436–492 (автопілот: `.think-status` з `thinkSpectatorAuthor`, `.think-field`, `view.me.think?.status`), `part38-spy.e2e.ts` (фікстура `spy`, поле асоціації, `spySpectator`).
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

> **Точки злиття з планом 53** (будувати від `main` після злиття 53; якщо 53 ще не злитий — додати так само й розв'язати конфлікт, залишивши обидва): `packages/shared/src/admin.ts` (рядок `ADMIN_ACTION_KINDS`; поле `AdminLogDetails.code?: string` — 53 додає те саме, не дублювати), `apps/server/src/admin-routes.ts` (один рядок реєстрації в кінці `registerAdminRoutes`), `admin-routes.test.ts` (список `routes`), `apps/web/src/admin/Admin.tsx` (`TABS` і маршрути — 53 додає `live`, `announcement`; «Бот» — останньою), `admin-text.ts` (`logLine` — 53 передає `text`/`code`), `i18n.ts` (блок адмінки), `i18n.test.ts` (новий список і довга умова ~616), `styles.css`. З робочим деревом `quizzes` — `apps/server/scripts/seed-demo.ts` (список `SEEDS` і `seedQuiz`): розбір аргументів виноситься в окремий файл, у `seed-demo.ts` міняється лише хвіст ~283–315.

**Мета:** службовий акаунт «Квіз-бот» без жодного способу входу, прихований з усіх публічних списків, має власні вікторини (сід `--bot` і «Передати боту копію»); адмін у вкладці «Бот» запускає кімнату-автопілот, де автор — бот, керує стартом/паузою/кінцем і приєднується як звичайний гравець без обмежень автора («Шпигун», «Думай інакше», «Правда про гравця»); гравцям гра зараховується як звичайна, бот нічого не отримує; запуск, копія й видалення — у журналі; не більше 3 кімнат бота водночас.

**Архітектура:** рушій — нова `createBotGame(quiz, options)`: стан автопілота з `authorId = BOT_PLAYER_ID`, якого немає серед гравців, тож жодне обмеження автора нікого не зачіпає. Сервер — `bot-account.ts` (константи, `ensureBotAccount`, `isHidden`), `notHidden` і `isBanned`-місця ховають і бота; менеджер — `createBotRoom`, `botRooms`, `botAct` (дії автора без телефона автора), кімната бота не зберігається й без лайків; маршрути — окремий `admin-bot-routes.ts` за воротами адмінки; нагороди пропускають бота. Веб — вкладка `AdminBot.tsx`.

**Технології:** TypeScript, zod 4, Fastify + `@fastify/rate-limit`, Better Auth, drizzle (Postgres), vitest (проєкти `shared`/`engine`/`server`/`web`), React 19 + Testing Library, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-19-bot-host-design.md` (42); основа адмінки — `docs/superpowers/specs/2026-11-01-admin-panel-design.md`, автопілот — план 11g.

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22**; форма `GameState`, `SavedRoom`, зрізів — без змін; нових полів у `Room` немає (кімнату бота впізнають за `room.hostUserId === BOT_USER_ID`).
- **Міграцій немає**; якщо знадобиться — `0042_…`, лише додавання (жодного `ALTER`/`DROP` наявного). Нові види журналу `bot_game_start`, `bot_copy`, `bot_quiz_delete` — значення `text`.
- **Бот ніколи не входить:** у нього немає рядка `account` (ні пароля, ні Google), email у зарезервованому домені `.invalid`; хук сесії Better Auth і `currentUser` відмовляють йому окремо від бана.
- **Адмінка — лише адмінам:** кожен новий `/api/admin/bot*` — через `read`/`write` (ворота `gate`), не-адміну й гостю — та сама **404**, що й невідомий маршрут (не 403 — див. «Розбіжності», п. 3); кожен маршрут — у списку `routes` тесту `hiding the admin panel (Review Focus 3)`. Email у відповідях «Бота» — жодного (тест шукає `@`).
- Усі тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`; нові uk-ключі — у новому списку `ADDED_BOT_54` (+ `ADDED_BOT_54_PLURALS`) у `i18n.test.ts`: в умову `adds no uk keys beyond the agreed list` і в перевірку наявності в усіх локалях (як `ADDED_LEVELS_49`). Нік «Квіз-бот» — дані акаунта, не перекладаються. ru немає.
- Кириличні літерали в `apps/web/src/` — лише в словниках і тестах (`source-scan.test.ts`); `BOT_NICKNAME` живе в `packages/shared`.
- **Нічого, пов'язаного з росією**, — у фікстурах, назвах вікторин, ніках, e2e.
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|engine|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm exec tsc -p <пакет>` у задачах 1–7, з задачі 8 — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів vitest).
- Файли правити лише Edit/Write чи `sed`; **python3 на цій машині — порожня заглушка, ним нічого не правити й не генерувати**; після коміту — `git show --stat`.
- Робоче дерево — лише в `C:\ClaudeCode\quiz\.superpowers\worktrees\plan54`; жодних файлів поза `C:\ClaudeCode\quiz` (тимчасові — у `.superpowers` чи scratchpad сесії). Дерев `plan53` і `quizzes` не торкатися.
- e2e: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 54"`; телефон 360 px, світла тема (`quiz:theme = light`, `is-light` на `<html>`); після — окремо `-t "part 11g"` і `-t "part 35"`.
- Таймер кожного запитання у фікстурах і e2e ≥ 25 с; у фікстурах «так/ні» — приблизно половина «ні».

## Рішення плану (там, де специфікація мовчить)

**Спільне (`packages/shared/src/bot.ts`, експорт з `index.ts`)**
- `BOT_USER_ID = 'quiz-bot'` (id рядка `user`; Better Auth дає випадкові id іншої форми, тож збігу немає); `BOT_PLAYER_ID = 'quiz-bot'` (id автора в `state.autopilot.authorId`; гравці — uuid, вигадки «Правди» — `fake-N`); `BOT_NICKNAME = 'Квіз-бот'`; `BOT_EMAIL = 'quiz-bot@quiz.invalid'`; `BOT_ROOMS_MAX = 3`; `BOT_ACTIONS = ['start', 'pause', 'resume', 'end'] as const`, `type BotAction`; `isBotUser(id: string | null | undefined): boolean`.
- `admin.ts`: `ADMIN_ACTION_KINDS` + `'bot_game_start'`, `'bot_copy'`, `'bot_quiz_delete'`; `AdminLogDetails.code?: string` (якщо 53 ще не додав). Типи:
  ```ts
  export interface AdminBotQuiz { id: string; title: string; rounds: number; questions: number; truth: boolean; updatedAt: string }
  export type AdminBotStatus = 'lobby' | 'playing' | 'paused' | 'finished';
  export interface AdminBotRoom { code: string; title: string; status: AdminBotStatus; players: { online: number; total: number }; stageUrl: string; openedAt: string }
  export interface AdminBot { bot: { nickname: string | null; ready: boolean }; quizzes: AdminBotQuiz[]; rooms: AdminBotRoom[]; roomsMax: number }
  export const adminBotCopySchema = z.object({ quizId: z.string().uuid() }).strict();
  ```
  `stageUrl` — `/stage/{code}#{stageToken}`, як у пульті й у плані 53. `status`: `lobby` → `lobby`; `finished` → `finished`; `paused` → `paused`; решта (заставки, запитання, розкриття, гайд) → `playing`.

**Рушій**
- `autopilot.ts`: `createBotGame(quiz: Quiz, options?: GameOptions): GameState` = `{ ...createGame(autopilotQuiz(quiz), options), autopilot: { authorId: BOT_PLAYER_ID, at: null } }` — без `addPlayer`. Решта рушія не змінюється: `spyCast`, `thinkWatches`, `team-act`, `answerer`, `truth` порівнюють з id, якого немає серед гравців; `autopilotStart` без гравців → `no_players` з `start`; команди з `form: 'host'` роздає жереб (наявна гілка `autopilotStart`).

**Акаунт бота (сервер, `apps/server/src/bot-account.ts`)**
- `ensureBotAccount(db: Db): Promise<void>` — `insert user { id: BOT_USER_ID, name: BOT_NICKNAME, email: BOT_EMAIL, emailVerified: false } on conflict do nothing`, потім `ensureProfile(db, BOT_USER_ID)` (нік «Квіз-бот»; якщо хтось його вже має — наявна нумерація «Квіз-бот 2»). Рядка `account` не створює ніколи. Виклики: `main.ts` після `settleStickerLegacy` (`.catch(reportError, { where: 'bot-account' })`), маршрут копії, сід `--bot`.
- `bans.ts`: `isHidden(db: Db | Tx, userId: string): Promise<boolean>` = `isBotUser(userId) || isBanned(db, userId)`; `isBanned` лишається точним «є бан» (адмінка, `banUser`). Заміна `isBanned` → `isHidden` у: `account-routes.ts` ~64 (`currentUser`), `profile-routes.ts` ~31 і ~153, `profiles.ts` ~268, `invites.ts` ~163, `report-store.ts` ~45.
- `feed-store.ts` `notHidden(column)` → `` sql`(${column} is distinct from ${BOT_USER_ID} and not exists (…user_ban…))` `` — `is distinct from`, бо колонка буває `null` (`groupInvite.invitedBy`), а `null <> 'quiz-bot'` дало б `null` і сховало рядок.
- `auth.ts`: у `session.create.before` першою — `if (isBotUser(session.userId)) throw new APIError('FORBIDDEN', { code: 'BOT_ACCOUNT', message: 'BOT_ACCOUNT' })`.
- `admin-store.ts`: `adminStats` — `users.total/new7/new30/online` без бота (`user.id <> BOT_USER_ID`, `profile.user_id <> …`); `adminUsers`/`userRows` — бот не показується й не рахується (`ne(user.id, BOT_USER_ID)` у `where`). Вікторини бота у вкладці «Вікторини» адмінки лишаються (автор «Квіз-бот»).

**Кімнати бота (`rooms/manager.ts`)**
- `createBotRoom(quiz: Quiz, quizId: string): { ok: true; room: Room } | { ok: false; error: 'restarting' | 'bot_rooms_full' }` — `frozen` → `restarting`; `botRooms().filter(phase !== 'finished').length >= BOT_ROOMS_MAX` → `bot_rooms_full`; інакше `open(createBotGame(quiz, this.gameOptions(quiz)), BOT_USER_ID, quizId)`. Токена гравця немає, `playerUsers` порожній. `open`: `lobby.visibility = 'hidden'` і для `isBotUser(hostUserId)`.
- `botRooms(): Room[]` — `rooms()` з `isBotUser(room.hostUserId)`.
- `botAct(code: string, action: BotAction): AckResult` — немає кімнати чи не бота → `game_not_found`; інакше та сама гілка, що в `author()` для `start`/`pause`/`resume`/`end`, з одним винятком: `end` у лобі закриває кімнату (`close(room)`, подія `closed` — як `closeHostedBy` для лобі), бо `end` рушія в лобі не діє. Для цього тіло `switch` з `author()` виноситься в `private authorAct(room: Room, playerId: string | null, action: AuthorAction): AckResult` (у `kick`/`release`/`bluff-remove` `playerId` лишається для перевірок; `botAct` ці дії не шле). Пауза бота — `authorPause` (hold `'author'`): `watchAuthor` бачить 0 з'єднань у `BOT_PLAYER_ID` і знімає її за `HOST_ABSENCE_MS` (10 хв) — як для автора, що пішов.
- Кімната бота **не зберігається** (13b): `savable(room, …)` → `false` для `isBotUser(room.hostUserId)`, тож таймери (`watchEmpty`, відсутність) завершують гру, як досі без збереження; `save` → `not_allowed`.
- Лайки (`like`, `likesView`) у кімнаті бота — `like_unavailable` / `undefined` (лайк вікторини йшов би боту).
- Бот у кімнаті — не гравець: таблиця, сцена, історія, «Шпигун», «Думай інакше», «Правда» його не бачать; адмін, що приєднався кодом, — звичайний гравець (`room.playerUsers` → його `userId`, досвід за звичайними правилами).

**Маршрути (`apps/server/src/admin-bot-routes.ts`)**
- `registerAdminBotRoutes(app, deps: AdminDeps & { maxRooms: number }, guards: { read: RouteOptions; write: RouteOptions; adminOf: (r: FastifyRequest) => Promise<CurrentUser | null> })`; виклик — останнім рядком `registerAdminRoutes` (`maxRooms` додається в `AdminDeps` з `app.ts`, як у `account-routes`).
- `GET /api/admin/bot` (`read`) → `AdminBot`: `bot.ready` — чи є рядок `user` бота; `quizzes` — вікторини `BOT_USER_ID` за `updatedAt desc` (`rounds = rounds.length`, `questions = questionsOf(row).length`, `truth = hasTruthRound(row)`); `rooms` — `manager.botRooms()`, незавершені перед `finished`, новіші першими; `online` — гравці стану з `connections.get(id) > 0`.
- `POST /api/admin/bot/quizzes/:id/games` (`write`): не uuid чи не вікторина бота → 404; `manager.size >= maxRooms` → 503 `server_busy`; `manager.frozen` → 503 `restarting`; `autopilotCheck(quiz).blocked.length > 0` → 409 `autopilot_blocked`; `createBotRoom` → `bot_rooms_full` → 409; успіх → `logAction(db, { adminId, kind: 'bot_game_start', targetUserId: BOT_USER_ID, details: { title, code } })` → 201 `{ code, stageUrl }`.
- `POST /api/admin/bot/copies` (`write`), тіло `adminBotCopySchema`: `getQuiz(db, admin.id, quizId)` — не своя → 404; `ensureBotAccount`; у транзакції `createQuiz(tx, BOT_USER_ID, quiz)` і `logAction(tx, { kind: 'bot_copy', targetUserId: BOT_USER_ID, details: { title } })` → 201 `{ id }`. Оригінал не змінюється; назва — та сама.
- `DELETE /api/admin/bot/quizzes/:id` (`write`): `deleteQuiz(db, BOT_USER_ID, id, (tx, d) => logAction(tx, { kind: 'bot_quiz_delete', targetUserId: BOT_USER_ID, details: { title: d.title } }))` → 204 / 404. Жива кімната з цією вікториною догравається (у неї свій знімок).
- `POST /api/admin/bot/rooms/:code/:action` (`write`), `action ∈ BOT_ACTIONS`, код `/^\d{6}$/`: інакше 404; `frozen` → 503 `restarting`; `botAct` → `game_not_found` → 404, інша помилка → 409 `{ error }` (`no_players`, `wrong_phase`, `paused`, `teams_few`…), успіх → 204. Без запису в журнал (специфікація пише в журнал лише запуск, копію й видалення).

**Нагороди**
- `xp-store.ts` `creditGame`: цикл «ачівки ведучого й автора» пропускає `isBotUser`; `achievement-store.ts` `awardGame`: бот не додається до `users`; `feed-publish.ts` `publishGameFeed`: `candidates` без бота. Гравці гри бота — як у будь-якому автопілоті (`game.autopilot = true`, ведучого-людини немає; у «Історії» — наявна позначка «Провів бот»).

**Сід (`apps/server/scripts/seed-args.ts`)**
- `parseSeedArgs(args: string[], seeds: readonly string[]): { mode: 'email'; email: string; seed: string } | { mode: 'bot'; seed: string } | { mode: 'update'; quizId: string; seed: string } | null` — `<email> [seed]` (типовий `demo`), `--bot <seed>` (seed обов'язковий), `--update <quizId> <seed>`; `--` відкидається; хибне → `null` (USAGE). `seed-demo.ts`: режим `bot` → `ensureBotAccount(db)` і `createQuiz(db, BOT_USER_ID, data)`, вивід `Created quiz <id> for the bot`; USAGE доповнено рядком `seed-demo --bot <seed>`; `--update` працює і для вікторин бота (власника береться з рядка, як зараз).

**Веб, вкладка «Бот» (`apps/web/src/admin/AdminBot.tsx`, маршрут `/admin/bot`, вкладка останньою)**
- Шапка: `Avatar` бота + нік + `adminBotLead`. `Avatar.tsx`: для `profile.id === BOT_USER_ID` і `avatar === null` — `<img src="/quiz-bot.svg">` (новий `apps/web/public/quiz-bot.svg`, простий значок-робот у кольорах, читабельних в обох темах).
- «Кімнати бота» (`h2`): картка на кімнату — «Код {code}», назва, стан, «Гравці: {online} на зв'язку з {total}»; посилання «Відкрити сцену» (`target="_blank"`), `Link` «Приєднатися як гравець» → `/play/{code}`; кнопки за станом: `lobby` — «Почати гру», «Завершити гру» (закриває лобі); `playing` — «Пауза», «Завершити гру»; `paused` — «Продовжити», «Завершити гру»; `finished` — без кнопок. «Завершити гру» — `window.confirm`. Кнопка «Оновити»; після кожної дії — `reload`. Помилка — `errorText` у `role="alert"`. Порожньо — «Зараз кімнат бота немає.»; «{count} з {max}» над списком.
- «Вікторини бота» (`h2`): назва, «{rounds} · {questions}» (плюральні ключі, `quizSizeText` для «Правди»), дата; «Запустити гру» → після 201 повідомлення «Кімнату {code} створено» і список кімнат оновлюється; «Видалити» — `window.confirm`. Порожньо — підказка про `seed:demo --bot` і копію.
- «Передати боту копію» (`h2`): свої вікторини адміна (`listQuizzes()`), кожна з кнопкою «Передати боту копію» → «Копію «{title}» передано боту.» і оновлення списку бота.
- `admin-api.ts`: `adminBot(): Promise<ApiData<AdminBot>>`, `startBotGame(quizId): Promise<ApiResult<{ code: string; stageUrl: string }>>`, `copyToBot(quizId): Promise<ApiResult<{ id: string }>>`, `deleteBotQuiz(quizId): Promise<ApiResult<object>>`, `botRoomAct(code, action: BotAction): Promise<ApiResult<object>>`. 404 від будь-якого — `Navigate` додому (як `AdminQuizzes`).
- Стилі: `.admin-bot` — картки на 360 px без бічного скролу, кнопки переносяться під текст, лише змінні теми.

## Порядок збирання

- 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. Залежності: 2 ← 1; 3 ← 1; 4 ← 1, 2; 5 ← 3, 4; 6 ← 3, 4; 7 ← 3; 8 ← 5; 9 — остання.
- `pnpm typecheck` обов'язково зелений з задачі 8 (зміна `ADMIN_ACTION_KINDS` вимагає ключів `adminLog_*`; до того `tsc -p apps/web` може падати саме на них — це очікувано).

## Фокус рев'ю

1. **Бот не входить ніяк.** `sign-in/email` з `BOT_EMAIL` і будь-яким паролем — відмова; `sign-up/email` з `BOT_EMAIL` — відмова й без сесії; хук сесії відмовляє `BOT_USER_ID` навіть за наявного (вставленого тестом) рядка `account`; `currentUser` для сесії бота — `null`. Задача 3.
2. **Бот ніде не видно.** Пошук друзів «Квіз», `GET /api/profiles/quiz-bot`, його досягнення, «versus», `PUT /api/me/friends/quiz-bot` — 404 чи порожньо; `notHidden` не ховає рядків з `null` у колонці; адмінські «Користувачі» й лічильники без бота. Задачі 3, 9.
3. **Жодних обмежень автора для гравців.** У грі бота кожен присутній гравець — у `spyCast`, пише слово «Думай інакше» (`thinkWatches` — `false`), подає факт «Правди»; старт без гравців — `no_players`; гравці не можуть слати дій автора (`not_allowed`). Задачі 2, 4, 9.
4. **Бот нічого не отримує, гравці — усе.** Після завершеної гри бота: у гравця-адміна є `xp_entry`/`participant`, у `BOT_USER_ID` — жодного `xp_entry`, `user_achievement`, `feed_event`; лайк у кімнаті бота — `like_unavailable`; збереження — `not_allowed`, порожня кімната завершується, а не зберігається. Задачі 4, 6.
5. **Межа 3 і ворота.** Четверта незавершена кімната бота — 409 `bot_rooms_full` без запису в журнал; після `end` однієї — знову можна; не-адміну й гостю кожен `/api/admin/bot*` — 404 без заголовків обмеження; у JSON «Бота» немає `@` (email бота теж). Задачі 5, 9.

---

### Задача 1. Спільне: константи бота, види журналу, типи вкладки «Бот»

**Files:**
- Create: `packages/shared/src/bot.ts`, `packages/shared/src/bot.test.ts`.
- Modify: `packages/shared/src/index.ts` (`export * from './bot'`), `packages/shared/src/admin.ts` (три види журналу, `AdminLogDetails.code?`, `AdminBotQuiz`, `AdminBotStatus`, `AdminBotRoom`, `AdminBot`, `adminBotCopySchema`).
- Test: `packages/shared/src/admin.test.ts`.

**Interfaces (Produces):** `BOT_USER_ID`, `BOT_PLAYER_ID`, `BOT_NICKNAME`, `BOT_EMAIL`, `BOT_ROOMS_MAX`, `BOT_ACTIONS`, `BotAction`, `isBotUser(id: string | null | undefined): boolean`; типи й схема з «Рішень плану» (спільне).

- [ ] **Step 1: Write the failing tests:**
  - `bot.test.ts` `the bot is one fixed account that can never receive mail`: `BOT_USER_ID === 'quiz-bot'`, `BOT_EMAIL.endsWith('.invalid')`, `BOT_ROOMS_MAX === 3`, `BOT_ACTIONS` — `['start', 'pause', 'resume', 'end']`; `isBotUser('quiz-bot')` — `true`, `isBotUser(null)`, `isBotUser(undefined)`, `isBotUser('Quiz-Bot')`, `isBotUser('a1b2')` — `false`.
  - `admin.test.ts`: `ADMIN_ACTION_KINDS` містить `bot_game_start`, `bot_copy`, `bot_quiz_delete`; `adminBotCopySchema` приймає `{ quizId: <uuid> }`, відкидає `{ quizId: 'abc' }` і зайвий ключ.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/bot.test.ts packages/shared/src/admin.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (спільне).
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 && pnpm exec tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 54 bot host — the fixed «Квіз-бот» account id, nickname and unreachable email, at most three bot rooms, the four bot room actions, log kinds for starting a bot game, copying to the bot and deleting its quiz, and the types of the admin «Бот» tab"
```

---

### Задача 2. Рушій: гра бота — автор, якого немає серед гравців

**Files:**
- Modify: `packages/engine/src/autopilot.ts` (`createBotGame`), `packages/engine/src/index.ts` (експорт, якщо `autopilot.ts` експортується поіменно).
- Create: `packages/engine/src/autopilot.bot.test.ts`.

**Interfaces:**
- Consumes: `BOT_PLAYER_ID` (задача 1).
- Produces: `createBotGame(quiz: Quiz, options?: GameOptions): GameState`.

- [ ] **Step 1: Write the failing tests** (`autopilot.bot.test.ts`, вікторини з `@quiz/engine/testing`, таймери ≥ 25 с):
  - `a bot game has the bot as author and nobody seated`: `players` — `[]`, `autopilot` — `{ authorId: 'quiz-bot', at: null }`, `phase === 'lobby'`; `isAuthor(state, 'quiz-bot')` — `true`; `autopilotStart` без гравців → `no_players`.
  - `every player is in the spy cast and nobody watches`: `classicRound` зі `spy`, гравці «Оля», «Петро», «Тарас» → `autopilotStart` → до запитання шпигуна; `spyCast(state).map(p => p.nickname)` — усі троє; `writeSpyWord(state, <Оля>, 'море', now)` — `ok`.
  - `every player writes in think different`: `thinkRound` з одним `think(…, [{ word: 'кава' }])` (поля — за фікстурою), двоє гравців; `thinkWatches(state, id)` — `false` для обох; `submitThinkAnswer` — `ok` для обох.
  - `every player can submit a truth fact`: `truthRound`, двоє гравців у лобі; `submitTruth(state, id, 'Я пірнав біля Тарханкута', now)` — `ok` для кожного.
  - `teams are dealt by lot without the author`: `settings.teams` (2 команди, `form: 'host'`), чотири гравці → `autopilotStart` → кожен з чотирьох у команді, `'quiz-bot'` — у жодній.
- [ ] **Step 2: Run** `pnpm test --project engine --maxWorkers=2 packages/engine/src/autopilot.bot.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `createBotGame` за «Рішеннями плану» (рушій). Решту рушія не міняти; якщо тест показує місце, де рушій чекає автора серед гравців, — виправити там порівнянням id і записати місце в коміт.
- [ ] **Step 4: Run** `pnpm test --project engine --maxWorkers=2 && pnpm exec tsc -p packages/engine`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/engine
git commit -m "feat(engine): 54 bot game — an autopilot whose author is the bot and not a player, so every player is in the spy cast, writes in think different and submits a truth fact; starting with nobody is no_players, teams are dealt by lot"
```

---

### Задача 3. Сервер: акаунт бота без входу й приховування з усіх списків

**Files:**
- Create: `apps/server/src/bot-account.ts`, `apps/server/src/bot-account.test.ts`.
- Modify: `apps/server/src/bans.ts` (`isHidden`), `apps/server/src/feed-store.ts` (`notHidden`), `apps/server/src/auth.ts` (хук), `apps/server/src/account-routes.ts` ~64, `apps/server/src/profile-routes.ts` ~31, ~153, `apps/server/src/profiles.ts` ~268, `apps/server/src/invites.ts` ~163, `apps/server/src/report-store.ts` ~45, `apps/server/src/admin-store.ts` (`adminStats`, `adminUsers`/`userRows`), `apps/server/src/main.ts` (виклик `ensureBotAccount`).
- Test: `apps/server/src/hidden.test.ts`, `apps/server/src/admin-store.test.ts`.

**Interfaces:**
- Consumes: `BOT_USER_ID`, `BOT_NICKNAME`, `BOT_EMAIL`, `isBotUser` (задача 1).
- Produces: `ensureBotAccount(db: Db): Promise<void>`; `isHidden(db: Db | Tx, userId: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing tests:**
  - `bot-account.test.ts` (`buildApp` + `createTestDb`, як `hidden.test.ts`):
    - `ensureBotAccount makes one user and profile and no credentials, twice is the same`: два виклики → один рядок `user` з `id = 'quiz-bot'`, `email = BOT_EMAIL`, `emailVerified = false`; `profile.nickname === 'Квіз-бот'`; рядків `account` з `user_id = 'quiz-bot'` — 0.
    - `a taken nickname gives the bot a numbered one`: Оля реєструється з ніком «Квіз-бот» до `ensureBotAccount` → нік бота «Квіз-бот 2» (за наявною нумерацією `ensureProfile`).
    - `nobody can sign in or sign up as the bot`: `POST /api/auth/sign-in/email` `{ email: BOT_EMAIL, password: 'any-password-54' }` → не 200, без `set-cookie` сесії; `POST /api/auth/sign-up/email` з `BOT_EMAIL` → не 200, рядків `session` бота — 0.
    - `the session hook refuses the bot even with credentials`: тест вставляє рядок `account` з `provider_id = 'credential'` і хешем пароля (через `auth.$context` `password.hash`, як у Better Auth) → `sign-in/email` → 403 `BOT_ACCOUNT`, рядків `session` — 0.
  - `hidden.test.ts` новий `describe('the bot is hidden like a banned account (54)')` (після `ensureBotAccount`): `GET /api/profiles/search?q=Квіз` — без бота; `GET /api/profiles?nickname=Квіз-бот` → 404; `GET /api/profiles/quiz-bot` → 404; `GET /api/profiles/quiz-bot/achievements` → 404; `PUT /api/me/friends/quiz-bot` → 404 і рядка `follow` немає; `GET /api/me/versus/quiz-bot` → 404. `notHidden keeps rows whose column is null`: запрошення до групи з `invited_by = null` лишається у списку запрошень.
  - `admin-store.test.ts`: `the admin user list and counts leave the bot out` — після `ensureBotAccount` `adminStats(...).users.total` не змінився, `adminUsers(db, emails, { q: 'Квіз', page: 1 }).rows` — без `quiz-bot`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/bot-account.test.ts apps/server/src/hidden.test.ts apps/server/src/admin-store.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (акаунт бота). Маршрут пошуку й назви полів — звірити з `profile-routes.ts` ~159–200.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/bot-account.test.ts apps/server/src/hidden.test.ts apps/server/src/admin-store.test.ts apps/server/src/bans.test.ts apps/server/src/bans-auth.test.ts apps/server/src/auth.test.ts apps/server/src/profile-routes.test.ts apps/server/src/feed-store.test.ts apps/server/src/group-store.test.ts apps/server/src/library-store.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 54 bot account — «Квіз-бот» is a user and profile with no credentials and an .invalid email, made once at start; the session hook and currentUser refuse it, and the one hiding point keeps it out of search, friends, profiles, feed, calendar, groups, library and the admin user list"
```

---

### Задача 4. Кімнати бота в менеджері: створення, межа 3, керування без телефона автора

**Files:**
- Modify: `apps/server/src/rooms/manager.ts` (`createBotRoom`, `botRooms`, `botAct`, `authorAct`, `open` — видимість, `savable`/`save`, `like`), `apps/server/src/rooms/likes.ts` (`likesView`).
- Create: `apps/server/src/rooms/manager.bot.test.ts` (за зразком `manager.ban.test.ts`).

**Interfaces:**
- Consumes: `createBotGame` (задача 2); `BOT_USER_ID`, `BOT_PLAYER_ID`, `BOT_ROOMS_MAX`, `BotAction` (задача 1).
- Produces: `RoomManager.createBotRoom(quiz: Quiz, quizId: string): { ok: true; room: Room } | { ok: false; error: 'restarting' | 'bot_rooms_full' }`; `RoomManager.botRooms(): Room[]`; `RoomManager.botAct(code: string, action: BotAction): AckResult`.

- [ ] **Step 1: Write the failing tests** (`manager.bot.test.ts`):
  - `a bot room has the bot as host, a hidden lobby and no seat`: `room.hostUserId === 'quiz-bot'`, `room.lobby.visibility === 'hidden'`, `room.state.players` — `[]`, `room.playerUsers.size === 0`.
  - `at most three unfinished bot rooms`: три `createBotRoom` — `ok`; четверта → `bot_rooms_full`; `botAct(перша, 'end')` після старту з гравцем → п'ята — `ok`; звичайна кімната-автопілот і кімната з ведучим не рахуються.
  - `the bot room starts, pauses, resumes and ends from botAct`: `start` без гравців → `{ ok: false, error: 'no_players' }`; `join('Оля')` → `start` → `phase !== 'lobby'`; `pause` → `paused`; `resume` → гра йде; `end` → `finished`; `end` у лобі іншої кімнати → `manager.get(code)` — `undefined`, слухач отримав `{ type: 'closed' }`; невідомий код і код звичайної кімнати → `game_not_found`.
  - `a player of a bot room cannot act as author`: `manager.author(room, <Оля>, { type: 'start' })` → `not_allowed`.
  - `a paused bot room resumes by itself after ten minutes`: `pause`, `scheduler.advance(HOST_ABSENCE_MS)` → `paused === false`.
  - `a bot room is never saved: save is refused and an empty game ends`: `save(room)` → `not_allowed`; гравець відключився посеред гри → через `AUTOPILOT_EMPTY_MS` `phase === 'finished'` і подія збереження (`closed` з `saved`) не надійшла.
  - `likes are off in a bot room`: `likesView(room, <Оля>)` — `undefined`; `manager.like(room, <Оля>, { kind: 'quiz' … })` → `like_unavailable`.
  - `a restart keeps the bot room`: `snapshot(room)` → `restore` → `hostUserId === 'quiz-bot'`, `state.autopilot.authorId === 'quiz-bot'`, `botRooms()` містить кімнату.
  - Наявні `manager.autopilot.test.ts` лишаються зеленими (рефактор `author` → `authorAct`).
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/rooms/manager.bot.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (кімнати бота). Назви `scheduler.advance`, `snapshot`/`restore`, форму `like`-payload — звірити з наявними тестами менеджера.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/rooms && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/rooms
git commit -m "feat(server): 54 bot rooms — the manager opens an autopilot room hosted by the bot with a hidden lobby and no author seat, at most three unfinished at once; start, pause, resume and end come from the admin, players cannot act as author, the room is never saved and has no likes, and it survives a restart"
```

---

### Задача 5. Сервер: маршрути вкладки «Бот» — список, запуск, копія, видалення, керування, журнал

**Files:**
- Create: `apps/server/src/admin-bot-routes.ts`, `apps/server/src/admin-bot-routes.test.ts`.
- Modify: `apps/server/src/admin-routes.ts` (`AdminDeps.maxRooms`, виклик `registerAdminBotRoutes` останнім рядком), `apps/server/src/app.ts` (~140, `maxRooms`), `apps/server/src/admin-store.ts` (`botQuizzes(db): Promise<AdminBotQuiz[]>`), `apps/server/src/admin-routes.test.ts` (список `routes`).

**Interfaces:**
- Consumes: задачі 1, 3, 4.
- Produces: `GET /api/admin/bot` → `AdminBot`; `POST /api/admin/bot/quizzes/:id/games` → 201 `{ code, stageUrl }` / 404 / 409 `autopilot_blocked` | `bot_rooms_full` / 503 `server_busy` | `restarting`; `POST /api/admin/bot/copies` → 201 `{ id }` / 400 / 404; `DELETE /api/admin/bot/quizzes/:id` → 204 / 404; `POST /api/admin/bot/rooms/:code/:action` → 204 / 404 / 409 `{ error }` / 503.

- [ ] **Step 1: Write the failing tests:**
  - `admin-routes.test.ts`: у `routes` тесту `hiding the admin panel (Review Focus 3)` — `['GET', '/api/admin/bot']`, `['POST', '/api/admin/bot/quizzes/<uuid>/games']`, `['POST', '/api/admin/bot/copies']`, `['DELETE', '/api/admin/bot/quizzes/<uuid>']`, `['POST', '/api/admin/bot/rooms/123456/start']`.
  - `admin-bot-routes.test.ts` (адмін — `person('Адмін 54', true)` з email в `adminEmails`; Оля — не адмін; вікторина «Річки України 54» — класичний раунд з трьох `single` по 30 с):
    - `the admin copies an own quiz to the bot and the original stays`: `POST /copies` → 201; `GET /api/admin/bot` — у `quizzes` «Річки України 54» з `rounds: 1`, `questions: 3`; вікторина адміна — без змін (`GET /api/quizzes/:id`); `lastLog()` — `{ kind: 'bot_copy', target: 'Квіз-бот', details: { title: 'Річки України 54' } }`; чужа вікторина (Олина) → 404 без запису в журнал; `{ quizId: 'abc' }` → 400.
    - `the admin starts a bot game, gets the code and the stage, and the log has it`: `POST /quizzes/:id/games` → 201, `code` — 6 цифр, `stageUrl === '/stage/' + code + '#' + room.stageToken`; `manager.get(code).hostUserId === 'quiz-bot'`; `lastLog()` — `{ kind: 'bot_game_start', details: { title, code } }`; `GET /api/admin/bot` — кімната зі `status: 'lobby'`, `players: { online: 0, total: 0 }`; `JSON.stringify(body)` не містить `@`.
    - `a fourth unfinished bot room is refused without a log line`: ще дві → 201; четверта → 409 `bot_rooms_full`, `lastLog()` — той самий запис, що перед нею.
    - `a blocked quiz is not started`: вікторина бота з `think` без слів → 409 `autopilot_blocked`.
    - `room actions: start needs a player, then pause, resume and end`: `start` → 409 `no_players`; Оля приєднується кодом (`manager.join`) → `start` → 204; `pause` → 204, `GET` — `paused`; `resume` → 204; `end` → 204, `finished`; `'12ab56'`, `'999999'`, код звичайної кімнати, дія `'kick'` → 404; `frozen` → 503 `restarting`.
    - `the admin deletes a bot quiz and a live room plays on`: `DELETE` → 204, `lastLog()` — `bot_quiz_delete` з назвою; кімната, запущена з неї, жива; повтор → 404; uuid чужої (не бота) вікторини → 404.
    - `a quiz of the bot is not reachable through the owner routes`: адмін `GET /api/quizzes/<id вікторини бота>` → 404.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/admin-bot-routes.test.ts apps/server/src/admin-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (маршрути). `stageUrl` і `online` — та сама логіка, що в плані 53 (`admin-live.ts`), якщо він уже злитий: узяти його помічник, не дублювати.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/admin-bot-routes.test.ts apps/server/src/admin-routes.test.ts apps/server/src/admin-store.test.ts apps/server/src/app.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 54 admin bot routes — list the bot's quizzes and rooms, copy an own quiz to the bot, start a bot game with its code and stage link (at most three, blocked quizzes refused), start, pause, resume and end a bot room, delete a bot quiz; start, copy and delete are logged, everything hides behind the admin gate"
```

---

### Задача 6. Сервер: гра бота зараховується гравцям, а бот не отримує нічого

**Files:**
- Modify: `apps/server/src/xp-store.ts` (`creditGame`), `apps/server/src/achievement-store.ts` (`awardGame`), `apps/server/src/feed-publish.ts` (`publishGameFeed`).
- Create: `apps/server/src/bot-rewards.test.ts`.

**Interfaces:**
- Consumes: `isBotUser`, `ensureBotAccount`, `createBotRoom`, `botAct` (задачі 1, 3, 4).
- Produces: нічого нового; бот пропускається в трьох місцях.

- [ ] **Step 1: Write the failing test** `bot-rewards.test.ts` (`buildApp` з рекордером, як `recorder.feed.test.ts`): `a finished bot game credits the players and gives the bot nothing` — вікторина бота (три `single` по 30 с, «так/ні» не потрібні), `createBotRoom`, Оля й Петро — акаунти, приєднані кодом, відповідають, `botAct('start')`… `botAct('end')` після останнього запитання; дочекатися рекордера → рядок `game` з `host_id = 'quiz-bot'`, `autopilot = true`, `status = 'finished'`; `participant` Олі й Петра; `xp_entry` Олі є; `xp_entry`, `user_achievement`, `feed_event` з `user_id = 'quiz-bot'` — 0; `GET /api/me/history` Олі містить гру з `autopilot: true`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/bot-rewards.test.ts`. Expected: FAIL (бот отримує досягнення автора/ведучого).
- [ ] **Step 3: Implement** за «Рішеннями плану» (нагороди): у трьох місцях — `if (isBotUser(id)) continue` / фільтр `candidates`.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/bot-rewards.test.ts apps/server/src/xp-store.test.ts apps/server/src/achievement-store.test.ts apps/server/src/feed-publish.test.ts apps/server/src/recorder.feed.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 54 bot rewards — a finished bot game credits its players with history, experience and achievements as any autopilot game, while the bot as host and quiz owner gets no experience, achievements or feed events"
```

---

### Задача 7. Сід-скрипт: `seed:demo --bot <seed>`

**Files:**
- Create: `apps/server/scripts/seed-args.ts`, `apps/server/scripts/seed-args.test.ts`.
- Modify: `apps/server/scripts/seed-demo.ts` (лише хвіст ~283–315 і коментар-заголовок).

**Interfaces:**
- Consumes: `BOT_USER_ID` (задача 1), `ensureBotAccount` (задача 3).
- Produces: `parseSeedArgs(args: string[], seeds: readonly string[])` (тип — у «Рішеннях плану», сід).

- [ ] **Step 1: Write the failing test** `seed-args.test.ts` `seed arguments: an email, the bot or an update`: `['you@example.com']` → `{ mode: 'email', email, seed: 'demo' }`; `['--', 'you@example.com', 'spy']` → `seed: 'spy'`; `['--bot', 'think']` → `{ mode: 'bot', seed: 'think' }`; `['--bot']`, `['--bot', 'nope']` → `null`; `['--update', '<uuid>', 'spy']` → `{ mode: 'update', quizId, seed: 'spy' }`; `['--update', 'abc', 'spy']` → `null`; `[]` → `null`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/scripts/seed-args.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `parseSeedArgs` і перехід `seed-demo.ts` на нього; режим `bot` — `ensureBotAccount(db)` і `createQuiz(db, BOT_USER_ID, data)`; USAGE і заголовок доповнено `--bot`.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/scripts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/scripts
git commit -m "feat(server): 54 seed --bot — seed:demo --bot <seed> makes the bot account if needed and gives it the seeded quiz; --update works for bot quizzes too; argument parsing moved to a tested helper"
```

---

### Задача 8. Веб: тексти в 7 мовах, рядки журналу, вкладка «Бот», аватар бота

**Files:**
- Create: `apps/web/src/admin/AdminBot.tsx`, `apps/web/src/admin/AdminBot.test.tsx`, `apps/web/public/quiz-bot.svg`.
- Modify: `apps/web/src/admin/Admin.tsx` (`TABS` + `{ to: '/admin/bot', key: 'adminTabBot', end: false }` останньою, `<Route path="bot" element={<AdminBot />} />`), `apps/web/src/admin/admin-api.ts`, `apps/web/src/admin/admin-text.ts` (`logLine` з `code`, якщо 53 ще не додав), `apps/web/src/profile/Avatar.tsx`, `apps/web/src/styles.css` (`.admin-bot`), `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,de,es,it,pl,ar}.json`, `apps/web/src/i18n.test.ts` (`ADDED_BOT_54`, `ADDED_BOT_54_PLURALS`).
- Test: `apps/web/src/admin/Admin.test.tsx`, `apps/web/src/admin/admin-text.test.ts`.

**Ключі (uk):**
- Вкладка: `adminTabBot` «Бот», `adminBotLead` «Бот проводить вікторини як автопілот. Ти граєш як звичайний гравець — без обмежень автора.», `adminBotRooms` «Кімнати бота», `adminBotRoomsCount` «{count} з {max}», `adminBotRoomsEmpty` «Зараз кімнат бота немає.», `adminBotCode` «Код {code}», `adminBotLobby` «Лобі», `adminBotPlaying` «Гра йде», `adminBotPaused` «Пауза», `adminBotFinished` «Кінець», `adminBotPlayers` «Гравці: {online} на зв'язку з {total}», `adminBotStage` «Відкрити сцену», `adminBotJoin` «Приєднатися як гравець», `adminBotStart` «Почати гру», `adminBotPause` «Пауза», `adminBotResume` «Продовжити», `adminBotEnd` «Завершити гру», `adminBotEndConfirm` «Завершити гру {code} «{title}»? Гравці побачать кінець гри.», `adminBotRefresh` «Оновити», `adminBotQuizzes` «Вікторини бота», `adminBotQuizzesEmpty` «У бота ще немає вікторин. Передай йому копію своєї або залий сідом: seed:demo --bot <назва>.», `adminBotLaunch` «Запустити гру», `adminBotLaunched` «Кімнату {code} створено.», `adminBotDelete` «Видалити», `adminBotDeleteConfirm` «Видалити вікторину бота «{title}»? Це не скасувати.», `adminBotCopyTitle` «Передати боту копію», `adminBotCopyHint` «Копія твоєї вікторини потрапить до бота; оригінал не зміниться.», `adminBotCopy` «Передати боту копію», `adminBotCopied` «Копію «{title}» передано боту.», `adminBotMineEmpty` «У тебе ще немає вікторин.», `adminBotSize` «{rounds} · {questions}», `err_bot_rooms_full` «У бота вже три кімнати. Заверши одну, щоб запустити нову.».
- Плюральні: `adminBotRounds_one` «{count} раунд», `_few` «{count} раунди», `_many` «{count} раундів».
- Журнал: `adminLog_bot_game_start` «{admin} запустив(-ла) гру бота «{title}» (код {code})», `adminLog_bot_copy` «{admin} передав(-ла) боту копію «{title}»», `adminLog_bot_quiz_delete` «{admin} видалив(-ла) вікторину бота «{title}»».

- [ ] **Step 1: Write the failing tests:**
  - `i18n.test.ts`: `ADDED_BOT_54`, `ADDED_BOT_54_PLURALS` — в умову `adds no uk keys beyond the agreed list`; `it('54 keys (the bot tab) are in every language')` за зразком `49 keys …`.
  - `admin-text.test.ts`: `logLine` — `bot_game_start` з `details: { title: 'Річки України 54', code: '123456' }`, адмін «Оля» → «Оля запустив(-ла) гру бота «Річки України 54» (код 123456)»; `bot_copy`, `bot_quiz_delete` — з назвою.
  - `Admin.test.tsx`: вкладка «Бот» є серед посилань адмінки (оновити лічильник у `shows the stats and the … section links`).
  - `AdminBot.test.tsx` (заглушка `fetch`, як в `AdminReports.test.tsx`):
    - `lists the bot rooms with actions by state`: дві кімнати — `lobby` (кнопка «Почати гру», посилання «Приєднатися як гравець» на `/play/123456`, «Відкрити сцену» на `stageUrl`) і `paused` («Продовжити», «Завершити гру»); «2 з 3».
    - `starting a quiz shows the new code and reloads`: «Запустити гру» → `POST /api/admin/bot/quizzes/<id>/games` → текст «Кімнату 654321 створено.» і повторний `GET /api/admin/bot`.
    - `a full bot shows the reason`: 409 `bot_rooms_full` → `role="alert"` з `err_bot_rooms_full`.
    - `copying an own quiz to the bot`: список з `GET /api/quizzes` → «Передати боту копію» → `POST /api/admin/bot/copies` з `{ quizId }` → «Копію «Карпати» передано боту.».
    - `ending and deleting ask first`: `window.confirm` → `false` — запиту немає; `true` — `POST …/rooms/123456/end` / `DELETE …/quizzes/<id>`.
    - `the bot avatar is the bot picture`: `img[src="/quiz-bot.svg"]` у шапці.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/i18n.test.ts apps/web/src/admin`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (веб): uk-тексти вище, переклади в 6 локалях (ar — RTL-нейтральні плейсхолдери; `seed:demo --bot <назва>` — як код, `<назва>` перекладається), `AdminBot`, API, `Avatar`, стилі (світла тема — `is-light`, кнопки ≥ 44 px, перенос під текст на 360 px).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/i18n.test.ts apps/web/src/admin apps/web/src/profile apps/web/src/source-scan.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 54 admin «Бот» tab — the bot's rooms with stage, join-as-player, start, pause, resume and end, its quizzes with start and delete, copying an own quiz to the bot, the bot avatar and log lines, in seven languages"
```

---

### Задача 9. Наскрізний сценарій і кадри (`part54-bot-host.e2e.ts`), повтор part 11g / 35

**Files:**
- Create: `apps/server/e2e/part54-bot-host.e2e.ts` (сервер з адміном — як `part47-library.e2e.ts`: `flags.restarting = true; await ctx.shutdown(); await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: 'admin54@example.com' }) }); flags.restarting = false`, у `finally` — `relisten()`; телефони 360 × 740, світла тема).

**Сценарій** (вікторина «Ліс і море 54»: `classicRound` з одним `spy` (фікстура, таймер ≥ 25 с) і `thinkRound` з одним `think` зі словами ведучого, ≥ 25 с; люди: адмін «Адмін 54», Оля (акаунт, не адмін), Петро й Тарас — гравці-сокети `pilotPlayer`):
`it('part 54: bot host — the admin copies a quiz to the bot, starts a bot game, joins as a plain player who is in the spy cast and writes in think different, the players get the game in history, the log has the start, the copy and the delete; a non-admin gets no «Бот» tab and 404, the bot is not found in friend search, phone 360 px, light theme')`:
1. Адмін зберігає «Ліс і море 54» (`POST /api/quizzes`), на `/admin/bot` тисне «Передати боту копію» → вікторина в «Вікторини бота»; кадр `bot54-tab-360`, `expectNoSideScroll`.
2. «Запустити гру» → «Кімнату {code} створено.»; у «Кімнати бота» — картка «Лобі»; «Відкрити сцену» відкриває сцену з кодом.
3. Друга сторінка того ж контексту адміна: «Приєднатися як гравець» → `/play/{code}`, нік «Адмін 54», лобі «Ви в грі. Чекаємо на старт.»; Оля (своя сторінка) і Петро, Тарас (сокети) приєднуються кодом. На `/admin/bot` «Оновити» → «Гравці: 4 на зв'язку з 4»; «Почати гру».
4. «Шпигун»: на телефоні адміна — поле асоціації (як у part 38), тексту `spySpectator` немає ніде; у кадрах сокета адміна (`socketFrames`) його зріз шпигуна — роль учасника, не глядача; адмін пише слово (`emitOk` чи поле), гравці-сокети — свої; голосування доходить до розкриття саме (автопілот). Кадр `bot54-spy-360`.
5. «Думай інакше»: на телефоні адміна є `.think-field`, `.think-status` без `thinkSpectatorAuthor`; адмін пише слово, у кадрах `view.me.think?.status !== 'spectator'` (як part 35 ~491, навпаки). Кадр `bot54-think-360`.
6. На `/admin/bot` «Завершити гру» → підтвердження → телефон Олі бачить кінець гри; `/history` адміна й Олі — гра «Ліс і море 54» з «Провів бот».
7. Межа: перша кімната вже «Кінець» і не рахується; ще три запуски → три картки «Лобі», четвертий → `err_bot_rooms_full` у `role="alert"`; «Завершити гру» однієї з лобі → запуск знову вдається.
8. «Видалити» вікторину бота → підтвердження → список порожній; `/admin/log` — рядки «запустив(-ла) гру бота «Ліс і море 54» (код …)», «передав(-ла) боту копію «Ліс і море 54»», «видалив(-ла) вікторину бота «Ліс і море 54»»; кадр `bot54-log-360`.
9. Оля (не адмін): `GET /api/admin/bot` → 404, `POST /api/admin/bot/copies` → 404; `/admin/bot` → перехід на `/`, вкладки «Бот» немає; пошук друзів «Квіз» — без «Квіз-бот»; гість `GET /api/admin/bot` → 404. Тексти сторінок і JSON вкладки без `@`.

- [ ] **Step 1: Write the scenario.** Назви полів «Шпигуна» в зрізі й класи — з `part38-spy.e2e.ts`; помічники — з `helpers/common.ts`, нових не додавати без потреби.
- [ ] **Step 2: Run** `pnpm build`, потім (після завершення збирання) `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 54"` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 3: Run** по одному, після part 54, не одночасно: `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 11g"`, потім `-t "part 35"`. Expected: PASS (рефактор `author` → `authorAct` не зламав автопілота автора-гравця, автор-гравець і далі глядач «Думай інакше»).
- [ ] **Step 4: Переглянути кадри:** на 360 px картки кімнат і вікторин бота з кнопками без бічного скролу, кнопки читаються в світлій темі, аватар бота видно; телефон адміна в «Шпигуні» й «Думай інакше» — як у звичайного гравця.
- [ ] **Step 5: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 54 — the admin copies a quiz to the bot, starts a bot game, joins as a plain player in the spy cast and think different, ends it from the bot tab, hits the three-room limit and deletes the quiz with log lines; a non-admin gets 404 and no tab, the bot is not in friend search; 360 px, light theme"
```

---

## Розбіжності зі специфікацією (рішення плану)

1. **Бот — автор, але не гравець.** Специфікація каже «автором є бот»; наявний автопілот робить автора гравцем (`addPlayer`). Для бота — `createBotGame`: `autopilot.authorId = 'quiz-bot'`, якого немає в `players`, тож бот не сидить у таблиці, не потрапляє в команди, не «чекає» відповіді й не знімає обмежень ні з кого, крім себе. Форма стану та сама — `GAME_STATE_VERSION` 22 без змін.
2. **Керування грою бота — у вкладці «Бот».** У бота немає телефона, тож «Почати гру», «Пауза», «Продовжити», «Завершити гру» адмін тисне у вкладці (будь-який адмін, не лише той, хто запустив). На телефоні адмін — звичайний гравець без меню автора (меню автора показало б хмару й варіанти блефу — відповіді). Дій «вилучити гравця», «спосіб команд», «прибрати вигадку», «сховати слово хмари» в кімнаті бота немає. Пауза бота знімається сама за 10 хв (як пауза автора, що пішов).
3. **Не-адмін отримує 404, а не 403.** Уся адмінка для інших «не існує» (спека адмінки, Review Focus 3): та сама 404, що й невідомий маршрут; веб веде не-адміна з `/admin/*` на головну. e2e перевіряє 404 і відсутність вкладки. Якщо власник хоче саме 403 — це зміна всієї адмінки, окремим рішенням.
4. **Міграції немає.** Акаунт бота створює `ensureBotAccount` (старт сервера, перша копія, сід `--bot`) — ідемпотентно; id `'quiz-bot'`, email `quiz-bot@quiz.invalid` (домен `.invalid` зарезервовано, листів і Google-входу з ним не буває), рядка `account` немає. Окремо від бана: хук сесії Better Auth і `currentUser` відмовляють боту. Якщо нік «Квіз-бот» уже зайнятий людиною, бот отримує «Квіз-бот 2».
5. **Приховування — через наявну єдину точку бана** (`notHidden` + новий `isHidden`): бот зникає з пошуку, друзів, публічного профілю, стрічки, календаря, груп і сімейної ліги, бібліотеки, лобі й скарг. Адмінські «Користувачі» й лічильники користувачів його теж не показують; його вікторини видно в адмінських «Вікторинах» (автор «Квіз-бот»).
6. **«Ведучим в історії значиться «Квіз-бот»»** — показано наявною позначкою автопілота «Провів бот» в історії гравця; окремого поля «ведучий» історія гравця не має, нового не додаємо.
7. **Кімната бота не зберігається** («Зберегти й продовжити пізніше» належить ведучому-людині): порожня гра бота завершується, а не йде в збережені боту. Лайки в кімнаті бота вимкнено (вони йшли б боту). Лобі бота — «Прихована» (у списку відкритих лобі його немає; вхід — за кодом).
8. **Межа 3 — незавершені кімнати бота** (завершені, що ще в пам'яті, не рахуються); межу перевіряє менеджер, четвертий запуск — 409 без запису в журнал. Керування кімнатою (старт/пауза/кінець) у журнал не пишеться — лише запуск, копія й видалення, як у специфікації.
9. **«Передати боту копію»** — у вкладці «Бот» зі списку своїх вікторин адміна (не нова кнопка на «Моїх вікторинах»); копія — та сама вікторина з тією ж назвою й тими ж картинками (як копія з бібліотеки), оригінал не змінюється. Видалення вікторини бота не зупиняє вже запущеної з неї гри.
10. **Сід:** `seed:demo --bot <seed>` (назва сіда обов'язкова); `--update <quizId> <seed>` працює і для вікторин бота без змін.
