# План 24c: «Доєднатись до гри» як список лобі з видимістю й паролем

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** ведучий у лобі обирає «Хто бачить гру» («Усі» · «Лише друзі» · «Прихована (лише за кодом)») і необов'язковий пароль; під полем коду на «/» — список відкритих лобі (і продовжених ігор «вже йде»), що оновлюється сам; запаролену гру сервер пускає лише з паролем (за кодом і зі списку), з обмеженням спроб, крім тих, хто вже в кімнаті, запрошених друзів і схвалених учасників події календаря.

**Spec:** `docs/superpowers/specs/2026-11-04-likes-lobbies-looks-design.md` — лише **«24c»**, **«Загальні обмеження»** і **«Рішення після перевірки builder-ом» → 24c** (обов'язкові). 24b вже злито, 24d — не в цьому плані.

**Архітектура:**
- **shared** (`packages/shared/src/lobby.ts`, новий): видимість, схема налаштувань, рядок списку, межі пароля, `password`/`device` у тілах входу.
- **сервер, кімната:** `Room.lobby = { visibility, password, openedAt }` живе в `RoomManager` і йде в `SavedRoom.lobby` (`live_room.data`), **не** в `GameState` → `GAME_STATE_VERSION` лишається 22, `SAVED_ROOM_VERSION` лишається 1 (нове поле необов'язкове, старий рядок встає з типовими значеннями). Міграції БД **немає**.
- **сервер, вхід:** новий `apps/server/src/lobby-access.ts` (`LobbyGate`: хто входить без пароля, перевірка, лічильник невдалих спроб у пам'яті) — викликається з `POST …/join`, `POST …/claim` і `GET /api/games/by-code/:code` (поле `locked` для того, хто питає).
- **сервер, маршрути:** новий `apps/server/src/lobby-routes.ts`: `GET /api/lobbies` (список для того, хто дивиться), `GET|PUT /api/games/by-code/:code/lobby` (лише ведучому — тут і тільки тут пароль іде назовні).
- **веб:** `apps/web/src/screens/LobbyAccess.tsx` (панель ведучого в лобі), `apps/web/src/pages/LobbyList.tsx` (список під полем коду на «/», опитування раз на 5 с), поле пароля у формі входу `apps/web/src/pages/Play.tsx`.

**Технології:** TypeScript, zod, Fastify + @fastify/rate-limit, Drizzle + PGlite (тести), React 19 + Testing Library (jsdom), Playwright через vitest (e2e).

## Global Constraints

- `GAME_STATE_VERSION` лишається **22** (`packages/engine/src/restore.ts`); видимість, пароль і `openedAt` — лише в `Room`/`SavedRoom`, ніколи в `GameState`, `GameView`, `PlayerView` чи сцені. Якщо без підняття ніяк — зупинитися й спитати власника до пушу.
- Пароль ніколи не надходить гравцям, сцені, у список чи в `GET /api/games/by-code/:code`; назовні — лише в `GET|PUT /api/games/by-code/:code/lobby` ведучому (`room.hostUserId === user.id`). Зберігається відкрито в `live_room.data` (ведучий має його бачити).
- Пароль: **4–32 символи** (кодові точки, `[...s].length`), обрізаний з країв, `isStorable`; перевірка на сервері при **кожному** вході (`join` і `claim`).
- Обмеження спроб: **5 невдалих за хвилину на кімнату** для `userId`, для гостя — для пари IP + пристрій (токен у браузері); блок **1 хвилина**; під час блоку навіть правильний пароль → `password_limited`.
- Без пароля входять: userId уже серед `room.playerUsers` (зокрема після перезапуску), сам ведучий (`hostUserId`), запрошений друг до першого входу (`Invites`, у `live_room` не пишемо), схвалений учасник події календаря цієї кімнати.
- «Лише друзі» = ті, на кого підписаний ведучий (`follow.follower_id = host`, як `calendarVisibility`); «Друзі тут» — гравці кімнати, на яких підписаний той, хто дивиться. Типово — `'friends'`; кімната без `hostUserId` — `'hidden'`. Ведучий із баном (`user_ban`, `isBanned`) у списку не показується. Таблиці блокувань у проєкті немає — рішення 5 специфікації нічого не додає.
- Пізнього входу в звичайну гру, що почалась, **немає**; у списку — лише фаза `lobby` і продовжені ігри (`room.continued !== null`) у будь-якій фазі, крім `finished` (позначка «вже йде»).
- Усі нові рядки — у 7 мовах (uk в `apps/web/src/i18n.ts`; en, pl, de, es, it, ar у `apps/web/src/locales/<lang>.json`), тон «ти»; ru — ніколи; нічого, пов'язаного з росією. Шлях: `pnpm l10n todo <lang>` → переклад у файл у scratchpad → `pnpm l10n merge <lang> <file>`; `pnpm l10n check <lang>` чисто для en pl de es it ar; множинні — усі форми, які просить `todo` (ar: zero/one/two/few/many/other).
- Нові uk-ключі — **лише** зі списку `ADDED_24C` (задача 4 дописує його в `apps/web/src/i18n.test.ts` і тексти в `i18n.ts`).
- Тема «Кривавий місяць» — лише наявні змінні (`--surface`, `--line`, `--paper`, `--dim`, `--accent`, `--accent-text`, `--link`) у `apps/web/src/styles.css`; контраст ≥ AA, фокус видно, усе з клавіатури, дотики ≥ 44 px; RTL — логічні властивості (`margin-inline-*`, `padding-inline-*`, `text-align: start`).
- Наявні e2e не змінюють поведінки: вхід за кодом без пароля працює як був; рядок списку не має доступного імені «Увійти» (хелпер `join` клікає «Увійти»), поле пароля не зветься «Код гри» чи «Ваше ім’я».
- Тести: `pnpm vitest run --maxWorkers=2 <шлях>`; e2e — спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 24c"`, лише на передньому плані.
- Кожна задача закінчується комітом у гілці `lobby-list` (з `main`).

## Рішення (там, де специфікація лишила місце builder-ові)

- **Де ведучий обирає видимість при створенні:** усі шляхи старту (/create, «Мої вікторини» через `useStartGame`, календар «Відкрити гру», «Продовжити» збережену) ведуть на пульт `/host/:code`, де в лобі першою панеллю стоїть «Хто бачить гру». Окремих полів на сторінках створення не додаємо; до вибору діє типове «Лише друзі». Автопілот (пульта немає) лишається «Лише друзі» без пароля — сервер `PUT …/lobby` для нього дозволяє, але інтерфейсу не робимо.
- **Зміна налаштувань:** лише у фазі `lobby` (інакше `409 wrong_phase`). Продовжена гра не буває в лобі, тож у неї завжди типове «Лише друзі» без пароля, і вона з'являється у списку з «вже йде».
- **Тривалість:** у рядку — кількість раундів і запитань (`roundQuestions` по `state.quiz.rounds`); орієнтовної тривалості не рахуємо (немає надійної формули — «якщо легко» не виконується).
- **Оновлення списку:** опитування `GET /api/lobbies` раз на `LOBBY_POLL_MS = 5000` мс, лише поки вкладка видима; рядки з ключем `code`, порядок — `openedAt` спадно, далі `code`; до 50 рядків (`LOBBY_LIST_LIMIT`). Поки вантажиться наступна відповідь — старий список лишається.
- **«Скільки тому»:** наявний `agoText(ms)` з `apps/web/src/locales/grammar.ts` від `openedAt`.
- **Власна кімната** ведучого у його списку не показується. Кімната, де глядач уже гравець, показується (дотик — перепідключення без пароля).
- **Статуси помилок входу:** `403 { error: 'password_required' }` (пароля не дали — не рахується спробою), `403 { error: 'password_wrong' }` (рахується), `429 { error: 'password_limited' }`.
- **Порівняння пароля:** `timingSafeEqual` над sha256 обох рядків.

## Review Focus

- Перезапуск сервера посеред лобі з паролем — після `restore` пароль і видимість ті самі, а гравець, що вже був у кімнаті, заходить без пароля (задача 1 `survives restore`, задача 2 `rejoin after restore`).
- Старий рядок `live_room` без поля `lobby` чи з битим `lobby` — кімната встає з типовими значеннями (`friends`/`hidden`), без падіння (задача 1 `old saved room`).
- Ведучий прибрав пароль чи змінив його, поки гравець уже на формі входу — сервер відповідає за поточним станом, форма показує/ховає поле після відповіді `password_required` (задача 2 `password changed`, задача 5 `asks after password_required`).
- Друг, якого ведучий прибрав із підписок, — зникає з «Лише друзі» в наступному опитуванні; запрошення, відхилене другом, пароля вже не пропускає (задача 2 `dismissed invite`, задача 3 `unfollowed`).
- Арабська на 320 px: довга назва вікторини й «друзі тут: …» переносяться, 🔒 і «вже йде» не вилазять, без бокового скролу (задача 5, задача 7).

---

### Задача 1. Спільні типи й дані лобі в кімнаті (пам'ять + live_room)

**Files:**
- Create: `packages/shared/src/lobby.ts`; Modify: `packages/shared/src/index.ts` (реекспорт)
- Modify: `packages/shared/src/events.ts:166` (`joinSchema` + `password`, `device`), `packages/shared/src/saved.ts:49` (`claimSchema` + ті самі поля, лишається `.strict()`)
- Modify: `apps/server/src/rooms/manager.ts` (`Room`, `SavedRoom`, `open`, `snapshot`, `restore`, нові `setLobby`, `joinableOf`)
- Test: `packages/shared/src/lobby.test.ts`, `apps/server/src/rooms/manager.lobby.test.ts`

**Interfaces:**
- Produces (shared):
  - `LOBBY_VISIBILITIES = ['all', 'friends', 'hidden'] as const`; `type LobbyVisibility`
  - `LOBBY_PASSWORD_MIN = 4`, `LOBBY_PASSWORD_MAX = 32`, `LOBBY_POLL_MS = 5000`, `LOBBY_LIST_LIMIT = 50`
  - `lobbyPasswordSchema` — `z.string()` → trim → refine `[...s].length` у 4…32 і `isStorable`
  - `lobbySettingsSchema = z.object({ visibility: z.enum(LOBBY_VISIBILITIES), password: lobbyPasswordSchema.nullable() }).strict()`; `type LobbySettings = z.infer<…>`
  - `entryFields = { password: z.string().max(64).optional(), device: z.string().max(64).optional() }` — розгортається в `joinSchema` і `claimSchema`
  - `interface LobbyRow { code: string; title: string; host: ProfileCard & { level: NickLevel | null }; players: number; maxPlayers: number; rounds: number; questions: number; locked: boolean; late: boolean; friends: string[]; openedAt: string }`
  - `interface CodeInfo { phase: Phase; title: string; locked: boolean; late: boolean }` (відповідь `GET /api/games/by-code/:code`)
- Produces (server): `interface LobbyState { visibility: LobbyVisibility; password: string | null; openedAt: number }`; `Room.lobby: LobbyState`; `SavedRoom.lobby?: LobbyState`; `RoomManager.setLobby(room: Room, settings: LobbySettings): AckResult`; `export function joinableOf(room: Room): 'lobby' | 'late' | null`

- [ ] **Step 1: Write the failing tests**

`lobby.test.ts`: `lobbySettingsSchema` приймає `{ visibility: 'all', password: null }` і `{ visibility: 'hidden', password: '  сова42 ' }` (→ `'сова42'`); відхиляє `'abc'`, 33 символи, `'    '`, `visibility: 'public'`, зайве поле. `joinSchema.parse({ nickname: 'Оля', password: 'x', device: 'd' })` зберігає обидва поля; `claimSchema` з `password` проходить, з `foo` — ні.

`manager.lobby.test.ts` (`FakeScheduler`, `makeQuiz([single])`):
- `defaults`: `create(quiz, 'u1')` → `lobby` `{ visibility: 'friends', password: null, openedAt: scheduler.now() }`; `create(quiz)` → `'hidden'`.
- `setLobby`: у лобі → `{ ok: true }` і `room.lobby` оновлено, слухач `onEvent` отримує `changed`; після старту → `{ ok: false, error: 'wrong_phase' }`.
- `survives restore`: `snapshot(room).lobby` дорівнює `room.lobby`; новий менеджер `restore(snapshot)` → той самий `lobby`; `JSON.stringify(manager.snapshot(room).state)` і будь-який `GameView` не містять рядка пароля.
- `old saved room`: `restore({ ...snap, lobby: undefined })` → `{ visibility: 'friends', password: null, openedAt: snap.savedAt }`; `lobby: { visibility: 'x', password: 5 }` → те саме; `hostUserId: null` → `'hidden'`.
- `joinableOf`: лобі → `'lobby'`; звичайна гра після старту → `null`; `continueSaved(...)` → `'late'`; `finished` → `null`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 packages/shared/src/lobby.test.ts apps/server/src/rooms/manager.lobby.test.ts`
Expected: FAIL (модуля `lobby` немає, `room.lobby` undefined)

- [ ] **Step 3: Implement**

`open()` ставить `lobby` як у тесті `defaults`; `snapshot()` завжди пише `lobby`; `restore()` бере `lobbyOf(saved.lobby, saved.hostUserId, saved.savedAt)` (приватна функція поруч із `prizesOf`: перевіряє `visibility ∈ LOBBY_VISIBILITIES`, `password` — рядок, що проходить `lobbyPasswordSchema`, або null, `openedAt` — число; інакше типові). `setLobby` — `alive`-перевірка, `phase !== 'lobby'` → `wrong_phase`, присвоєння, `this.commit(room, room.state)` (щоб `RoomStore` записав). `isSavedRoom` не змінюється.

- [ ] **Step 4: Run tests + engine/server room suites**

Run: `pnpm vitest run --maxWorkers=2 packages/shared apps/server/src/rooms`
Expected: PASS; `grep -n "GAME_STATE_VERSION = 22" packages/engine/src/restore.ts` — знайдено.

- [ ] **Step 5: Commit** — `feat(server): 24c lobby visibility and password on the room, kept across restarts`

---

### Задача 2. Сервер: пароль при вході, налаштування ведучого, `locked`/`late` за кодом

**Files:**
- Create: `apps/server/src/lobby-access.ts`, `apps/server/src/lobby-routes.ts`
- Modify: `apps/server/src/invites.ts` (метод `admits`), `apps/server/src/calendar-store.ts` (`approvedForGame`)
- Modify: `apps/server/src/app.ts:133-151` (gate у `by-code` і `join`, реєстрація `registerLobbyRoutes`), `apps/server/src/saved-games.ts:310-321` (gate у `claim`; передати `gate` у deps)
- Test: `apps/server/src/lobby-access.test.ts`, `apps/server/src/lobby-routes.test.ts` (`describe('lobby settings and password (24c)')`), оновити `apps/server/src/app.test.ts:83` (`toEqual({ phase: 'lobby', title: 'Тестова вікторина', locked: false, late: false })`)

**Interfaces:**
- Consumes: `Room.lobby`, `setLobby`, `joinableOf`, `lobbySettingsSchema`, `entryFields`, `CodeInfo` (задача 1).
- Produces:
  - `Invites.admits(room: Room, userId: string): boolean` — запрошений, не в `dismissed`, кімната жива й у лобі
  - `approvedForGame(db: Db, gameId: string, userId: string): Promise<boolean>` — є `calendar_event.game_id = gameId` з `calendar_request` цього userId у статусі `'approved'`
  - `class LobbyGate { constructor(db: Db, invites: Invites, now: () => number); trusted(room: Room, userId: string | null): Promise<boolean>; check(room: Room, entry: { userId: string | null; password?: string; ip: string; device?: string }): Promise<GateResult> }`, `type GateResult = 'ok' | 'password_required' | 'password_wrong' | 'password_limited'`; `PASSWORD_FAILS = 5`, `PASSWORD_WINDOW_MS = 60_000`, `PASSWORD_BLOCK_MS = 60_000`
  - `gateStatus(result: Exclude<GateResult, 'ok'>): 403 | 429`
  - `registerLobbyRoutes(app, { db, manager, gate, invites, locate, currentUser }): Promise<void>` — у цій задачі лише `GET|PUT /api/games/by-code/:code/lobby`; задача 3 додає `GET /api/lobbies`

- [ ] **Step 1: Write the failing tests**

`lobby-access.test.ts` (PGlite, `FakeScheduler`, кімната з `manager.create`, пароль через `setLobby`):
- `no password` → `'ok'` для гостя без поля.
- `password_required` для гостя без пароля; `'password_wrong'` з `'хибний'`; `'ok'` з `' сова42 '` (обрізання).
- `trusted`: ведучий, userId із `playerUsers`, запрошений (`invites.invite(room, [olyaId])`), схвалений учасник події з `game_id = room.id` → `'ok'` без пароля; `dismissed invite`: після `invites.dismiss(olyaId, code)` → `'password_required'`.
- `limit`: 5 × `'password_wrong'` від `{ ip: '1.1.1.1', device: 'a' }` → 6-та спроба з правильним паролем `'password_limited'`; той самий IP з `device: 'b'` → `'ok'`; через 60 001 мс (`scheduler.advance`) перший → `'ok'`; ліміт для userId не залежить від IP; ліміт однієї кімнати не зачіпає іншої.

`lobby-routes.test.ts`:
- `GET …/lobby` ведучому → `{ visibility: 'friends', password: null }`; чужому й гостю → 404 `game_not_found`.
- `PUT …/lobby` `{ visibility: 'all', password: 'сова42' }` → 200 і те саме тіло; `'abc'` → 400 `invalid_payload`; після старту → 409 `wrong_phase`; чужому → 404.
- `join`: гість без пароля → 403 `password_required`; хибний → 403 `password_wrong`; правильний → 201; шоста хибна поспіль → 429 `password_limited`.
- `GET /api/games/by-code/:code`: гостю `{ locked: true, late: false }`, ведучому й запрошеному — `locked: false`; тіло **не** містить рядка пароля (`expect(response.body).not.toContain('сова42')`).
- `claim` у продовженій грі з паролем, виставленим напряму `room.lobby.password = 'сова42'`: гостьове місце без пароля → 403, з паролем → 201.
- `rejoin after restore`: гравець з акаунтом увійшов з паролем → `restart`/`restore` на новому менеджері → повторний `join` того самого акаунта без пароля → не 403.
- `password changed`: `PUT` прибирає пароль → гість без поля → 201.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 apps/server/src/lobby-access.test.ts apps/server/src/lobby-routes.test.ts apps/server/src/app.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

`LobbyGate.check` по черзі: `room.lobby.password === null` → ok; `trusted` → ok; ключ `room.id + ':' + (userId ? 'u:' + userId : 'g:' + ip + '|' + (device ?? ''))`; заблоковано → `password_limited`; пароля немає → `password_required` (без лічби); `safeEqual(input.trim(), password)` → ok, інакше лічба (вікно 60 с від першої невдачі; на 5-й — блок до `now + 60 000`) і `password_wrong`. Кожен виклик прибирає записи, у яких і вікно, і блок минули. Маршрути `join`/`claim`: після `locate` і пошуку кімнати (відсутня → як зараз 404), до `manager.join`/`manager.claim`. Ліміт `GET|PUT …/lobby` — 30/хв на людину (як `perUser` в `invites.ts`).

- [ ] **Step 4: Run tests + server suite**

Run: `pnpm vitest run --maxWorkers=2 apps/server`
Expected: PASS

- [ ] **Step 5: Commit** — `feat(server): 24c lobby password checked on every join path with a per-room attempt limit`

---

### Задача 3. Сервер: список лобі `GET /api/lobbies`

**Files:**
- Modify: `apps/server/src/lobby-routes.ts` (маршрут), Create: `apps/server/src/lobby-store.ts` (запити до БД)
- Test: `apps/server/src/lobby-routes.test.ts` (`describe('GET /api/lobbies (24c)')`)

**Interfaces:**
- Consumes: `joinableOf`, `Room.lobby`, `LobbyRow`, `LOBBY_LIST_LIMIT` (задача 1); `roomLevels` (`apps/server/src/xp-store.ts`), `notHidden`/`user_ban`, `slotsOf`, `roundQuestions`, `LIMITS.maxPlayers`.
- Produces: `lobbyRows(db: Db, rooms: Room[], viewerId: string | null): Promise<LobbyRow[]>` у `lobby-store.ts`; маршрут `GET /api/lobbies` → `LobbyRow[]` (гостям теж; ліміт 60/хв на людину чи IP).

- [ ] **Step 1: Write the failing tests**

Ведуча Галина (підписана на Олю), Оля (підписана на Петра), Тарас (ні на кого), гість:
- `visibility`: `'friends'` — Оля бачить, Тарас і гість ні; `'all'` — усі, гість теж; `'hidden'` — ніхто; Галина своєї кімнати не бачить.
- `unfollowed`: Галина відписалась від Олі → наступний запит Олі без рядка.
- `row`: `{ code, title: 'Тестова вікторина', host: { id: galynaId, nickname: 'Галина', avatar: null, level: { level: 1, … } }, players: 1, maxPlayers: 50, rounds: 1, questions: 1, locked: true, late: false, friends: ['Петро'], openedAt: ISO }` (Петро увійшов з акаунтом; «друзі тут» — нік у грі); рядок пароля відсутній у `response.body`.
- `joinable only`: розпочата звичайна гра зникає; продовжена (`continueSaved`) — є з `late: true`; `finished` — ні.
- `banned host`: рядок у `user_ban` для Галини → список порожній.
- `order and cap`: дві кімнати — новіша перша; 51 кімната з `'all'` → 50 рядків.

- [ ] **Step 2: Run to verify fail** — `pnpm vitest run --maxWorkers=2 apps/server/src/lobby-routes.test.ts` → FAIL (404)

- [ ] **Step 3: Implement** — у маршруті: `manager.rooms()` → `joinableOf !== null`, `hostUserId !== null && hostUserId !== viewerId`, `visibility !== 'hidden'`, `'all'` або (є viewer і він у `follow` ведучого); `lobbyRows` одним запитом бере підписки ведучих на глядача, одним — підписки глядача (для «друзі тут»), одним — профілі ведучих без бану, `roomLevels` — рівні; сортування й обрізка до 50 — до запитів профілів.

- [ ] **Step 4: Run** — `pnpm vitest run --maxWorkers=2 apps/server` → PASS

- [ ] **Step 5: Commit** — `feat(server): 24c open lobbies list filtered by host visibility`

---

### Задача 4. Веб: uk-тексти й панель ведучого «Хто бачить гру»

**Files:**
- Modify: `apps/web/src/i18n.ts` (ключі нижче), `apps/web/src/i18n.test.ts` (`ADDED_24C` у фільтрі поруч з `ADDED_24B`)
- Modify: `apps/web/src/api.ts` (`getLobbySettings`, `saveLobbySettings`, `listLobbies`, тип `checkCode` → `CodeInfo`, `joinGame(code, nickname, password?)`, `claimSlot(code, slotId, password?)` — обидва шлють і `device: loadDeviceId()`)
- Modify: `apps/web/src/storage.ts` (`loadDeviceId(): string` — `crypto.randomUUID()` один раз на браузер)
- Create: `apps/web/src/screens/LobbyAccess.tsx`; Modify: `apps/web/src/screens/HostScreen.tsx:1302` (`{phase === 'lobby' && <LobbyAccess code={code} />}` перед `InviteFriends`); `apps/web/src/styles.css`
- Test: `apps/web/src/screens/LobbyAccess.test.tsx`, `apps/web/src/storage.test.ts`

**Interfaces:**
- Consumes: `GET|PUT /api/games/by-code/:code/lobby` (задача 2), `LobbySettings`, `LOBBY_PASSWORD_MIN/MAX`.
- Produces: усі uk-ключі `ADDED_24C`; `listLobbies(): Promise<ApiResult<LobbyRow[]>>`; `joinGame`, `claimSlot` з необов'язковим `password`; `checkCode` → `CodeInfo`.

`ADDED_24C` і uk-тексти:

| ключ | uk |
|---|---|
| `lobbyWhoSees` | Хто бачить гру |
| `lobbyVisAll` | Усі |
| `lobbyVisFriends` | Лише друзі |
| `lobbyVisHidden` | Прихована (лише за кодом) |
| `lobbyPasswordLabel` | Пароль гри (необов'язково) |
| `lobbyPasswordHint` | Від 4 до 32 символів. Скажи його гравцям — запрошені друзі увійдуть і без нього. |
| `lobbyPasswordSave` | Зберегти пароль |
| `lobbyPasswordRemove` | Прибрати пароль |
| `lobbySaved` | Збережено |
| `lobbyListTitle` | Відкриті ігри |
| `lobbyListEmpty` | Зараз немає відкритих ігор — введи код або створи свою |
| `lobbyListError` | Не вдалося оновити список ігор |
| `lobbyRunning` | вже йде |
| `lobbyLocked` | з паролем |
| `lobbyFriendsHere` | друзі тут: {names} |
| `lobbyPlayers` | гравців: {count} з {max} |
| `lobbyRounds_one/_few/_many` | {count} раунд / {count} раунди / {count} раундів |
| `lobbyQuestions_one/_few/_many` | {count} запитання / {count} запитання / {count} запитань |
| `lobbyOpened` | створено {ago} |
| `lobbyPasswordAsk` | Пароль гри |
| `err_password_required` | Ця гра з паролем — спитай його у ведучого |
| `err_password_wrong` | Неправильний пароль. Перевір і спробуй ще |
| `err_password_limited` | Забагато спроб. Спробуй за хвилину |
| `err_lobby_password` | Пароль має бути від 4 до 32 символів |

- [ ] **Step 1: Write the failing tests**

`LobbyAccess.test.tsx` (мок `api`): показує `fieldset` з легендою «Хто бачить гру» і трьома радіо, вибране «Лише друзі»; клік «Усі» → `saveLobbySettings(code, { visibility: 'all', password: null })` і статус «Збережено» (`role="status"`); ввести «сова42» → «Зберегти пароль» → виклик з паролем, поле показує збережений пароль; «Прибрати пароль» видно лише з паролем → `password: null`; «abc» — кнопка вимкнена й підказка про 4–32 (без запиту); помилка сервера → `role="alert"` з `errorText`. `storage.test.ts`: `loadDeviceId()` двічі — той самий рядок. `i18n.test.ts` — `ADDED_24C` проходить.

- [ ] **Step 2: Run to verify fail** — `pnpm vitest run --maxWorkers=2 apps/web/src/screens/LobbyAccess.test.tsx apps/web/src/storage.test.ts apps/web/src/i18n.test.ts` → FAIL

- [ ] **Step 3: Implement** — панель `section.panel.lobby-access`: при монтуванні `getLobbySettings`; радіо зберігаються одразу при зміні; пароль — `<input type="text" autoComplete="off" spellCheck={false} dir="auto">` (ведучий бачить його відкрито), обрізається перед відправкою; радіо й кнопки ≥ 44 px, логічні відступи.

- [ ] **Step 4: Run** — `pnpm vitest run --maxWorkers=2 apps/web` → PASS

- [ ] **Step 5: Commit** — `feat(web): 24c host picks who sees the lobby and an optional password`

---

### Задача 5. Веб: список лобі на «/» і поле пароля у формі входу

**Files:**
- Create: `apps/web/src/pages/LobbyList.tsx`; Modify: `apps/web/src/pages/Home.tsx` (`JoinForm` загортається в `<div id="join-form" className="join-area">` з формою й `<LobbyList />` під нею — так і для гостя, і під плиткою; `aria-controls` лишається `join-form`; `result.phase !== 'lobby' && !result.late && loadPlayer(digits) === null` → `game_started`)
- Modify: `apps/web/src/pages/Play.tsx` (`JoinForm`: поле пароля), `apps/web/src/styles.css`
- Test: `apps/web/src/pages/LobbyList.test.tsx`, `apps/web/src/pages/Home.test.tsx`, `apps/web/src/pages/Play.test.tsx`

**Interfaces:**
- Consumes: `listLobbies`, `checkCode` → `CodeInfo`, `joinGame`/`claimSlot` з `password` (задача 4); `LobbyRow`, `LOBBY_POLL_MS`; `Nick` (`apps/web/src/screens/Nick.tsx`), `Avatar size="small"`, `agoText`.
- Produces: `LobbyList(): JSX.Element` (без пропсів; сервер сам фільтрує для гостя).

- [ ] **Step 1: Write the failing tests**

`LobbyList.test.tsx` (фейкові таймери, мок `listLobbies`):
- `rows`: заголовок «Відкриті ігри»; рядок — посилання на `/play/<code>` з назвою, аватаром і ніком ведучого, «Рів. 3» (рівень 3), «гравців: 2 з 50», «1 раунд», «5 запитань», «створено 12 хв тому», 🔒 з `aria-label` «з паролем» для `locked`, «вже йде» для `late`, «друзі тут: Оля, Петро» для `friends`; доступне ім'я рядка не містить «Увійти».
- `empty`: `[]` → «Зараз немає відкритих ігор — введи код або створи свою».
- `poll`: через 5000 мс — другий виклик; нові дані замінюють рядки без зникнення списку між запитами; `document.hidden = true` — виклику немає; після демонтування — немає.
- `error`: перший запит невдалий → «Не вдалося оновити список ігор»; невдалий після успішного — старі рядки лишаються.

`Play.test.tsx`:
- `asks when locked`: `checkCode` → `locked: true` → поле «Пароль гри»; «Увійти в гру» шле `joinGame(code, 'Оля', 'сова42')`.
- `asks after password_required`: `locked: false`, але `joinGame` → `password_required` → з'являється поле й «Ця гра з паролем — спитай його у ведучого».
- `wrong`: `password_wrong` → «Неправильний пароль. Перевір і спробуй ще», поле лишається з введеним; `password_limited` → «Забагато спроб…».
- `claim`: місце збереженої гри з `locked: true` → `claimSlot(code, slotId, 'сова42')`.

`Home.test.tsx`: гість бачить поле «Код гри» і під ним «Відкриті ігри»; `checkCode` → `{ phase: 'question', late: true }` → перехід на `/play/<code>`, а `late: false` без збереженого гравця → помилка «game_started».

- [ ] **Step 2: Run to verify fail** — `pnpm vitest run --maxWorkers=2 apps/web/src/pages` → FAIL

- [ ] **Step 3: Implement** — `LobbyList`: `section.lobby-list` з `h2`, `ul` з `li > a.lobby-row` (зона ≥ 44 px, `dir="auto"` на назві й ніках, перенос `overflow-wrap: anywhere`), опитування ланцюжком `setTimeout` по `LOBBY_POLL_MS` + `visibilitychange`; поточний час для «тому» — `Date.now()` на кожному оновленні. `Play` `JoinForm`: `checkCode` при монтуванні → `locked`; поле `<input type="password" autoComplete="off">` з підписом «Пароль гри» між ніком і кнопкою; помилки через `errorText`.

- [ ] **Step 4: Run** — `pnpm vitest run --maxWorkers=2 apps/web` → PASS

- [ ] **Step 5: Commit** — `feat(web): 24c open lobbies under the code field and the password prompt on join`

---

### Задача 6. Переклади en, pl, de, es, it, ar

**Files:**
- Modify: `apps/web/src/locales/{en,pl,de,es,it,ar}.json`

**Interfaces:**
- Consumes: ключі `ADDED_24C` (задача 4).

- [ ] **Step 1: Знайти відсутні** — для кожної мови `pnpm l10n todo <lang>`; очікувано — лише ключі `ADDED_24C` (з потрібними множинними формами).
- [ ] **Step 2: Перекласти** — у `<scratchpad>/24c-<lang>.json`, тон «ти» (de «du», es «tú», it «tu», pl «ty»), `{names}`, `{count}`, `{max}`, `{ago}` без змін; ar — усі шість форм для `lobbyRounds`, `lobbyQuestions`; «Прихована (лише за кодом)» → смисл «лише за кодом», не «приватна».
- [ ] **Step 3: Злити** — `pnpm l10n merge <lang> <file>` для кожної.
- [ ] **Step 4: Перевірити** — `pnpm l10n check en` … `pnpm l10n check ar` — чисто; `pnpm vitest run --maxWorkers=2 apps/web/src/i18n.test.ts apps/web/src/rtl.test.tsx apps/web/src/styles-rtl.test.ts` — PASS.
- [ ] **Step 5: Commit** — `feat(web): 24c lobby list strings in en pl de es it ar`

---

### Задача 7. e2e `part 24c`

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts` (новий `it('part 24c: …')` після `part 24b`, функція `lobbyList24c()`; хелпери `open`, `register`, `homeCodeField`, `socketFrames`, `shot`, `expectNoSideScroll`, `htmlLang` — наявні)

**Interfaces:**
- Consumes: усе вище; тексти uk з таблиці задачі 4.

- [ ] **Step 1: Write the test** — `it('part 24c: lobby list — the host keeps «Лише друзі» by default, Оля sees the lobby under the code field with the host, player count and «друзі тут», a guest sees it only after «Усі», a password shows 🔒 and is asked on tap and by code, a wrong one is refused and the sixth try is limited, an invited friend and a rejoining player skip it, «Прихована» hides the row while the code still works, the password never reaches players, and 375/320 px in uk and ar has no side scroll', …)`:
  1. Галина (1280) реєструється, підписується на Олю; Оля (375) — на Петра; Петро входить у гру за кодом; гість (375) без входу.
  2. Галина створює гру з «Мої вікторини» → у лобі «Хто бачить гру» з вибраним «Лише друзі».
  3. Оля на «/» → плитка «Доєднатись до гри» → під полем «Код гри» рядок з назвою вікторини, «Галина», «гравців: 1 з 50», «друзі тут: Петро»; гість на «/» — «Зараз немає відкритих ігор — введи код або створи свою».
  4. Галина обирає «Усі» → у гостя рядок з'являється без перезавантаження (`expect.poll`, до 12 с).
  5. Галина вводить «сова42» → «Зберегти пароль» → у гостя 🔒; дотик → поле «Пароль гри»; «хибний» → «Неправильний пароль…»; «сова42» → «Ви в грі. Чекаємо на старт.».
  6. Ще 6 хибних спроб через `page.request.post(…/join, { nickname, password: 'x', device: 'd' })` → остання 429 `password_limited`.
  7. Галина запрошує Олю (`InviteFriends`) → Оля дотиком до рядка входить без поля пароля; закриває вкладку, знову `join` своїм акаунтом без пароля → не 403.
  8. Галина — «Прихована (лише за кодом)» → рядок зникає в Олі й гостя (poll); новий гість за кодом через `homeCodeField` отримує поле пароля й входить із «сова42».
  9. `socketFrames(olya)`, `socketFrames(guest)`, тіло `GET /api/lobbies` і `GET /api/games/by-code/:code` — не містять «сова42».
  10. Знімки: Оля «/» зі списком 375 і 320 у uk і ar (`expectNoSideScroll`, `htmlLang`), форма пароля гостя 320 uk і ar; `shot(page, 'part24c-…')`.
- [ ] **Step 2: Build and run** — `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 24c"` → PASS; потім `-t "part 24a"` і `-t "a host and two players"` → PASS (вхід за кодом не зламано).
- [ ] **Step 3: Full checks** — `pnpm vitest run --maxWorkers=2` і `pnpm typecheck` → PASS.
- [ ] **Step 4: Commit** — `test(e2e): part 24c lobby list with visibility and password`
