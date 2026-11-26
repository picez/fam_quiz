# План 68: адмін веде гру бота як ведучий — повний пульт поверх автопілота (черга 45, п. 11)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** Форма `GameState`, `AutopilotState`, `SavedRoom` і знімка кімнати не змінюється. Нові поля `Room` (`adminHosts`, `botManual`, `manualAway`) живуть **лише в пам'яті**: у знімок не йдуть, після перезапуску порожні (і це навмисна безпечна поведінка: після рестарту гру знову веде бот). Рушій отримує лише нові **необов'язкові параметри** функцій (без зміни стану). Якщо виконавцю знадобиться нове поле в `GameState`, `AutopilotState` чи `SavedRoom` — **зупинитися й спитати контролера** (підвищення версії скидає живі ігри — потрібна згода власника).

> **Міграції немає.** Нові види журналу — значення `text`-колонки `admin_action.kind`.

## Специфікація (коротко)

**Запит власника (черга 45, п. 11):** «коли проводиш ботом з адмінки дати максимальні можливості, ніби я ведучий, що б було легко керувати».

**Що є зараз.** Кімната бота — кімната-автопілот (`state.autopilot.authorId === BOT_PLAYER_ID`, `room.hostUserId === BOT_USER_ID`). Пульта немає: `manager.identify` відмовляє ролі `host` в автопілоті, `manager.host()` повертає `forbidden`, `hostToken` кімнати ніде не видається. Адмін керує лише з картки вкладки «Бот» (REST `POST /api/admin/bot/rooms/:code/:action` → `manager.botAct`): старт, пауза, продовження, кінець, «Закрити запитання», +30 с, кінець раунду, вилучити, звільнити, спосіб команд, «Бали», лобі.

**Що буде.**
1. На картці кімнати бота — кнопка **«Відкрити як ведучий»** (нова вкладка `/bot-host/:code`). Сторінка показує **справжній `HostScreen`** з усіма інструментами ведучого: оцінки й «Змінити оцінку», «Прийняти»/«Інша відповідь», скасування балів (12a), «Бали», дебафи, «Мільйонер» (рішення за учасника), звук, «Нагороди на сцені», прибрати вигадку, «хмара», вилучити/звільнити, команди (у т. ч. «Розподіляю сам» і капітани), «Далі»/«Закрити запитання»/±15 с/кінець раунду/кінець гри, «Наживо», реакції.
2. **Два режими** (видно смугою вгорі сторінки):
   - **«Допомагаю»** (типовий, щойно відкрив пульт): бот і далі веде темп (кроки автопілота за таблицею `AUTOPILOT_MS`), а адмін може будь-якої миті натиснути будь-яку кнопку. Після дії адміна автопілот сам переплановує наступний крок від нової миті (так уже працює `planAutopilot`: зміна `pilotKey` → нова мить).
   - **«Керую сам»** (кнопка «Взяти керування»): бот **не робить жодного кроку** — ні «Далі», ні закриття запитання без таймера, ні оцінки відповідей, що чекають ведучого (поле, бліц за ключем), ні продовження після паузи «нікого». Годинник рушія (таймери запитань, бліц-вікна, торг аукціону тощо) працює як завжди. «Віддати боту» — бот продовжує з **свіжим** відліком поточного кроку від миті повернення.
   - Запобіжник: якщо в режимі «Керую сам» усі пульти адмінів відключилися на `BOT_MANUAL_GRACE_MS = 60 с` — керування саме повертається боту. Перезапуск сервера теж повертає керування боту (поле лише в пам'яті).
   - Запобіжник 2 (дороблено 2026-11-26): `BOT_MANUAL_IDLE_MS = 10 хв` без жодної дії адміна (будь-яка дія з пульта — навіть відмовлена, дія чи лобі з картки, «Взяти керування») — керування повертається боту, навіть якщо пульт лишився відкритим (таймер `room.manualIdle`, лише в пам'яті; у журнал не пишеться).
3. **Пауза адміна** — пауза автора бота (`authorPause`, hold `'author'`): поки відкритий хоч один пульт адміна, вона не знімається сама (сьогодні знімається через 10 хв, бо «автор» бот ніколи не на зв'язку); після відходу всіх пультів — наявне правило 10 хв.
4. **Конфлікти з автопілотом** (визначено):
   | Дія адміна | Як поводиться |
   |---|---|
   | `next`, `lock`, `skip`, `survey-all`, `bluff-all` | затримка 11b (`PACED` / `too_soon`) — як у ведучого; пульт показує відлік. Автопілот переплановує крок від нової миті; запізнілий таймер автопілота ловить наявна перевірка `pilotKey(ticked) !== pilotKey(room.state)` |
   | `start` | `autopilotStart` (тур кубиків, `starting`), але форма `host` **не роздає жереб** — склад адміна лишається (нерозподілені — у найменшу команду, як `formTeams`) |
   | `pause` / `resume` | `authorPause` / `authorResume` (hold `'author'`) — бот сам не продовжить |
   | `end` | у лобі — закрити кімнату (як `botAct`), інакше `end` рушія |
   | оцінки (`override`, `judge`, `accept`, `repick`, `name`) | як у ведучого; у режимі «Допомагаю» відповідь, що чекає ведучого, бот оцінює одразу за ключем — тож адмін виправляє вже після («Змінити оцінку», скасування); ручна перевірка «наживо» — лише в режимі «Керую сам» |
   | `undo`, `alike-join`, `alike-split`, `truth-fake` | рушій сьогодні відмовляє в автопілоті (`not_allowed`) — для адміна відмову знято новим параметром `byAdmin` |
   | `save` | `not_allowed` (гра бота не зберігається, як досі) |
   | `sounds` | `not_allowed` (у зрізі автопілота `soundsOff` не діє); перемикач на пульті сховано |
   | `think-words`, `think-off` | `not_allowed`: раунд «Думай інакше» в автопілоті має заготовлені слова й голосування «не на тему» (51), ручна правка зламала б його |
   | `hint` | працює, але в автопілоті гравці підказку ведучого без заготовленої підказки не просять (`unfit_host`) — запитів просто не буде |
   | `ladder-pick` | вікторину вже перетворено (`pick: 'random'`), тож кнопки не буде |
5. **Що лишається як в автопілоті:** перетворення `autopilotQuiz` зроблене при створенні кімнати (голос → телефон, ручна перевірка фіналу/ставок/аукціону → за ключем, «ведучий вибирає» в «Мільйонері» → жереб). `hostOnline` у автопілоті — завжди `true`. Гравці не бачать, що пульт відкрив адмін.
6. **Доступ.** `POST /api/admin/bot/rooms/:code/host-access` (лише адмін, інакше та сама 404) видає **окремий токен пульта адміна** (по одному на адміна й кімнату, у `room.adminHosts`, лише в пам'яті) і токен сцени. Сокет з `role: 'host'` до автопілота пускається **лише** з таким токеном і **лише** в кімнату бота; ідентичність несе `admin: <id адміна>`. Звичайний `hostToken` кімнати й далі не видається й не діє. Сторінка токен у `localStorage` не кладе (лише в пам'яті); на `unauthorized` (рестарт, переїзд кімнати) — питає токен знову.
7. **Журнал.** Кожна вдала дія адміна з пульта, що змінює гру для людей, пишеться в журнал адмінки:
   - наявні види: `bot_room_start`, `bot_room_pause`, `bot_room_resume`, `bot_room_end`, `bot_room_end_round`, `bot_room_kick`, `bot_room_release`, `bot_room_teams` (`team-form`), `bot_room_adjust`;
   - нові: `bot_room_host_open` (видано новий токен пульта), `bot_room_manual_on`, `bot_room_manual_off`, `bot_room_grade` (`override`, `judge`, `accept`, `repick`, `name`, `alike-join`, `alike-split`, `ladder-decide`), `bot_room_undo`, `bot_room_debuff` (`debuff`, `undebuff`), `bot_room_hint`;
   - **не пишуться** кроки темпу й показу: `next`, `lock`, `skip`, `dice`, `roll`, `clue`, `survey-all`, `bluff-all`, `guide-skip`, `duel-*`, `pick`, `order`, `time`, `cloud-hide`, `bluff-remove`, `team-assign`/`team-deal`/`team-dice`/`team-roll`/`captain`, `truth-hide`/`truth-fake`, `audio`, `awards`, `live-watch`, `react` (інакше сотні рядків на гру).
   - Автоматичне повернення боту (60 с без пульта) у журнал **не** пишеться (немає адміна-автора дії); картка показує стан.
8. **Картка кімнати** (`AdminBotRoom`) отримує `manual: boolean` і `hosts: number` (скільки пультів адмінів на зв'язку): тег «Керує адмін», кнопка «Відкрити як ведучий», перемикач «Взяти керування»/«Віддати боту».

**Поза планом:** пульт адміна для звичайних (не бот) автопілотів і ігор людей; зміна перетворень `autopilotQuiz` посеред гри; живі підказки ведучого в автопілоті.

## Звірка з кодом

План спирається на `main` 2026-11-22 (`f2eccbbe`). Рядки приблизні — **перед кожною задачею виконавець звіряє назви й рядки з кодом**; розбіжність — привід міняти рядки, не рішення плану.
- менеджер `apps/server/src/rooms/manager.ts`: `HOST_ABSENCE_MS` ~192, `interface Identity { role; playerId }` ~212, `interface Room` ~225, `HostAction` ~423, `AuthorAction`/`AUTHOR_ACTIONS` ~461–468, `PACED` ~725, `sameToken` ~707, `hostOnline` ~817 (автопілот → `true`), `open(...)` ~880, відновлення ~959–1013, `botRooms()` ~1047, `identify` ~1600 (рядок `if (role === 'host' && room.state.autopilot !== undefined) return null;` ~1605), `connect` ~1609 (роль `host` чистить `room.absence` — **в автопілоті це таймер 30 хв «нікого»**, адмін його чіпати не має), `disconnect` ~1636, `view` ~1722, `baseView` ~1752 (`hostView(room.state)`), `hostHint` ~2483, `hostLadderPick/Decide` ~2410–2419, `audio`/`awards` ~1673–1691, `author` ~2562, `botAct` ~2576, `botLobby` ~2613, `authorAct` ~2620, `host` ~2655 (перший рядок — `if (state.autopilot !== undefined) return FORBIDDEN;`), `kick` ~2760, `watchEmpty` ~2830, `watchAuthor` ~2846, `clearTimers` ~2926, `commit` ~2937 (`planAutopilot`), `reschedule` ~2966 (таймер `room.pilot` на `state.autopilot.at`);
- сокети `apps/server/src/socket.ts`: `SIMPLE_HOST_ACTIONS` ~147, `SocketOptions` ~176, `handshake` ~254 (`manager.identify`), підключення ~470, `isHost`/`hostSide`/`run` ~545–548, обробники `host:*` ~926–1146 (`host:hint`/`ladder-*`/`audio`/`awards` кличуть менеджер напряму при `isHost`), `watchers` ~298 (роль `host` з «наживо»); виклик `attachSockets` — `apps/server/src/app.ts` ~260;
- рушій `packages/engine/src`: `autopilot.ts` `autopilotStart` ~98 (форма `host`/`random` → `dealTeams`), `startNow` ~78, `pilotKey`, `autopilotDue` (експортовано), `planAutopilot`; `undo.ts` `undoPanel(state)` ~169 і `undoScore(state, target, now)` ~297 (обидва відмовляють автопілоту); `alike.ts` `editRefusal` ~123, `alikeJoin` ~139, `alikeSplit` ~153; `truth.ts` `setTruthFake` ~64; `views.ts` `hostView(state)` ~4146 (рядок `undo: undoPanel(state)` ~4227), `base` ~3280; `teams.ts` `formTeams` ~341;
- спільне `packages/shared/src`: `bot.ts` (`BOT_*`, `botCommandSchema`, `isBotUser`), `admin.ts` (`ADMIN_ACTION_KINDS` ~22, `AdminLogDetails` ~48, `AdminBotRoom` ~73, `ADMIN_LOG_GROUP_KINDS.bot` ~154), `views.ts` `interface HostView` ~2660, `events.ts` `socketAuthSchema` ~34;
- адмін-маршрути `apps/server/src/admin-bot-routes.ts` (`BOT_ROOM_LOG`, `botRoomView`, `POST …/rooms/:code/:action`, `PUT …/rooms/:code/lobby`), `bans.ts` `logAction`; тести `admin-bot-routes.test.ts` (`asAdmin`, `lastLog()`), `admin-routes.test.ts` (список `routes` тесту «hiding the admin panel»);
- веб: `apps/web/src/pages/Host.tsx` (зразок сторінки пульта), `screens/HostScreen.tsx` (`Props` ~98, `host:save` ~476, перемикач звуків ~667, `LobbyAccess` ~1634, `ResumePanel` ~1651), `AppRoutes.tsx` (`/host/:code` ~95, поза макетом), `admin/AdminBotRoomCard.tsx`, `admin/AdminBot.tsx`, `admin/admin-api.ts`, `admin/admin-text.ts` `logLine` ~58, `i18n.ts` (блок `adminBot*` ~4919, `adminLog_bot_room_*` ~5031), `locales/{en,de,es,it,pl,ar}.json`, `i18n.test.ts` (`ADDED_BOT_ADJUST` ~232 і довга умова ~914);
- e2e: `apps/server/e2e/part62-bot-room-controls.e2e.ts`, `part54-bot-host.e2e.ts` (адмін через `relisten`, `flags.restarting`), `helpers/common.ts` (`open`, `register`, `click`, `socketFrames`, `emitOk`, `expectNoSideScroll`), `helpers/setup.ts`.

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22.** Без нових полів `GameState`/`AutopilotState`/`SavedRoom`; нові поля `Room` — лише в пам'яті, у `snapshot`/відновлення не додаються.
- **Лише адміни:** нові маршрути — через `write`/`read` воріт адмінки; не-адміну й гостю — та сама **404**, що й невідомий маршрут; нові маршрути — у списку `routes` тесту «hiding the admin panel». Сокет `role: 'host'` до автопілота — лише з токеном із `room.adminHosts` і лише в кімнату бота.
- **Звичайним ведучим, гравцям і авторам автопілота — жодних змін поведінки:** `host()`, `author()`, `AUTHOR_ACTIONS`, `hostSide` гравця лишаються як є; тести на це — у задачах 3 і 5.
- Коментарі в коді — українською. Тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`; нові uk-ключі — у новому списку `ADDED_BOT_HOST_68` у `i18n.test.ts` (в довгу умову «adds no uk keys beyond the agreed list» і в перевірку наявності в усіх локалях з тими самими `{змінними}`, як `ADDED_BOT_ADJUST`). Кириличні літерали в `apps/web/src/` — лише в словниках і тестах.
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|engine|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm typecheck`. **Ніколи не запускати prettier.** Тести, збирання й e2e — лише на передньому плані й ніколи два одночасно.
- Файли правити лише Edit/Write чи `sed`/node; **python3 — порожня заглушка**; після коміту — `git show --stat`.
- Робоче дерево — `C:\ClaudeCode\quiz\.superpowers\worktrees\plan68`; тимчасові файли — у `.superpowers` чи scratchpad.
- **Нічого, пов'язаного з росією**, у фікстурах, ніках, назвах, e2e. Таймер кожного запитання у фікстурах і e2e ≥ 25 с; у «так/ні» — приблизно половина «ні».

---

### Задача 1. Рушій: дії ведучого-адміна в автопілоті (без зміни стану)

**Файли:** `packages/engine/src/undo.ts`, `packages/engine/src/alike.ts`, `packages/engine/src/truth.ts`, `packages/engine/src/views.ts`, `packages/engine/src/autopilot.ts`; тести `packages/engine/src/autopilot.admin.test.ts` (новий), `packages/engine/src/game.undo.test.ts`, `packages/engine/src/views.undo.test.ts`.

**Зміни:**
- [ ] `undoPanel(state, byAdmin = false)`: умова `state.phase === 'lobby' || (state.autopilot !== undefined && !byAdmin)` → `null`. `undoScore(state, target, now, byAdmin = false)`: відмова `not_allowed` в автопілоті — лише коли `!byAdmin`. Коментар: «byAdmin — пульт адміна в кімнаті бота (68): у ведучого-людини поруч відмови автопілота немає».
- [ ] `alike.ts`: `editRefusal(state, byAdmin)`; `alikeJoin(state, from, to, byAdmin = false)`, `alikeSplit(state, playerId, byAdmin = false)` — у автопілоті з `byAdmin` правка дозволена.
- [ ] `truth.ts` `setTruthFake(state, id, raw, byAdmin = false)` — те саме для відмови автопілота.
- [ ] `views.ts` `hostView(state, options: { byAdmin?: boolean } = {})` → `undo: undoPanel(state, options.byAdmin === true)`. Решта `hostView` без змін.
- [ ] `autopilot.ts` `autopilotStart(state, now, rng, resume?, options: { hostTeams?: boolean } = {})`: коли `teamsOn(state)` і `form === 'host'` і `options.hostTeams === true` — **без** `dealTeams`: одразу `startNow(state, now, resume ?? state.autopilot.resume)` (нерозподілених розсадить `formTeams` у `start`). Інакше — як досі. JSDoc доповнити.
- [ ] Експортувати нове з `packages/engine/src/index.ts`, якщо там перелік (звірити).

**Тести:**
- [ ] `autopilot.admin.test.ts`: (а) `undoScore` у грі бота (`createBotGame`) без прапорця → `not_allowed`, з `byAdmin` → коригування `undo` записано; (б) `undoPanel` з прапорцем не `null` після оцінки; (в) `alikeJoin`/`alikeSplit` на reveal «Думай як усі» в автопілоті з прапорцем — бали перераховано, без — `not_allowed`; (г) `setTruthFake` у лобі автопілота з прапорцем додає вигадку; (д) командна гра бота з формою `host`: два учасники розподілені вручну (`assignTeam`), третій без команди → `autopilotStart(…, { hostTeams: true })` лишає ручні команди, третього — у меншу; без прапорця — жереб (як досі; перевірити, що rng викликано).
- [ ] Наявні тести не змінюються (параметри необов'язкові); прогнати `pnpm test --project engine --maxWorkers=2`.
- [ ] `schema-golden.test.ts` і `restore.test.ts` проходять без правок (стан не змінено).

**Коміт:** `feat(engine): 68 admin host flags — undo, undo panel, think-alike edits and truth fakes allowed for the admin host of a bot game (byAdmin), autopilot start keeps the admin's own teams (hostTeams); no state change`

---

### Задача 2. Спільне: типи, види журналу, константи

**Файли:** `packages/shared/src/bot.ts`, `packages/shared/src/admin.ts`, `packages/shared/src/views.ts`; тести `packages/shared/src/bot.test.ts`, `packages/shared/src/admin.test.ts`.

**Зміни:**
- [ ] `bot.ts`: `export const BOT_MANUAL_GRACE_MS = 60_000;` (JSDoc англ., як сусіди: «68: with every admin host screen offline this long, a bot room in manual mode goes back to the bot»); `export const adminBotManualSchema = z.object({ on: z.boolean() }).strict(); export type AdminBotManual = z.infer<…>`; `export interface AdminBotHostAccess { hostToken: string; stageToken: string }`.
- [ ] `views.ts` `HostView`: `botHost?: { manual: boolean; mine: boolean }` — «68: є лише в зрізі пульта адміна в кімнаті бота; manual — режим «Керую сам», mine — його взяв цей адмін».
- [ ] `admin.ts`: у кінець `ADMIN_ACTION_KINDS` — `'bot_room_host_open', 'bot_room_manual_on', 'bot_room_manual_off', 'bot_room_grade', 'bot_room_undo', 'bot_room_debuff', 'bot_room_hint'`; ті самі — у `ADMIN_LOG_GROUP_KINDS.bot`. `AdminBotRoom` + `manual: boolean` («68: бот не робить кроків, керує адмін») і `hosts: number` («68: пульти адмінів на зв'язку»).

**Тести:**
- [ ] `bot.test.ts`: `adminBotManualSchema` приймає `{ on: true }`, відкидає зайві ключі й не-булеве.
- [ ] `admin.test.ts`: наявна перевірка «кожен вид — рівно в одній групі» проходить; нові сім — у групі `bot`.
- [ ] `pnpm test --project shared --maxWorkers=2`; `pnpm typecheck` впаде на `botRoomView` (нові поля) — це закриває задача 6; щоб коміт був зелений, у `admin-bot-routes.ts` тимчасово віддати `manual: false, hosts: 0` (задача 6 замінить).

**Коміт:** `feat(shared): 68 admin host of a bot game — manual-mode schema and grace, host access type, botHost in the host view, manual and hosts on the bot room card, seven log kinds in the bot group`

---

### Задача 3. Менеджер: токен пульта адміна, ідентичність, дії ведучого в кімнаті бота

**Файли:** `apps/server/src/rooms/manager.ts`; тест `apps/server/src/rooms/manager.bot-host.test.ts` (новий; зразок налаштування — `manager.bot.test.ts`).

**Зміни:**
- [ ] `Identity` + `admin?: string` — «68: id адміна, що веде кімнату бота з пульта; лише з role 'host'».
- [ ] `Room` + `adminHosts: Map<string, string>` (токен → id адміна), `botManual: { adminId: string; since: number } | null`, `manualAway: unknown` — з JSDoc «лише в пам'яті, у знімок не йде; після перезапуску порожньо». Ініціалізувати в `open` і у відновленні (порожня мапа, `null`, `null`); `snapshot` **не чіпати**.
- [ ] `botHostToken(code: string, adminId: string): { ok: true; hostToken: string; stageToken: string; fresh: boolean } | { ok: false; error }` — немає кімнати / не бота / не автопілот → `game_not_found`; `frozen` → `restarting`; той самий адмін у тій самій кімнаті отримує свій наявний токен (`fresh: false`), інакше `newToken()` (`fresh: true`).
- [ ] `identify`: для `role === 'host'` і `room.state.autopilot !== undefined` — якщо `isBotUser(room.hostUserId)` і токен збігається (через `sameToken`) з ключем `room.adminHosts` → `{ role: 'host', playerId: null, admin }`; інакше `null` (як досі). `hostToken` кімнати в автопілоті й далі не діє.
- [ ] `connect`/`disconnect`: для `identity.admin !== undefined` — окремий ключ `'admin-host'` у `room.connections`, **без** гілки ролі `host` (не чіпати `room.absence`, не `hostLeft`); `connect` гасить `room.manualAway`; `disconnect` до нуля з `room.botManual !== null` ставить `manualAway` (задача 4). Після обох — `watchAuthor(room)` (задача 4 його змінює). Хелпер `adminHostsOnline(room): number`.
- [ ] Рефактор `host()`: тіло `switch` винести в `private hostStep(room: Room, action: HostAction, byAdmin = false): AckResult`; `host()` = `alive` + відмова автопілоту + `PACED`/`too_soon` + `hostStep(room, action)`. Поведінка `host()` не змінюється. У `hostStep` гілки `undo`, `alike-join`, `alike-split`, `truth-fake` передають `byAdmin` у рушій.
- [ ] `adminHost(room: Room, action: HostAction): AckResult` (JSDoc — таблиця конфліктів зі специфікації):
  - `alive`; не кімната бота чи не автопілот → `forbidden`;
  - `PACED`/`too_soon` — як у `host()`;
  - `start` → `this.apply(room, autopilotStart(state, now, rng, action.resume ?? this.carryFor(room), { hostTeams: true }))` (перевірка виклику `room.challenge` — як в `authorAct`);
  - `pause`/`resume`/`kick`/`release`/`team-form`/`cloud-hide` → `authorAct(room, null, action)`; `end` у лобі → `close(room)`, інакше `authorAct`;
  - `save`, `sounds`, `think-words`, `think-off` → `NOT_ALLOWED`;
  - `adjust` → `hostStep` (пульт уже шле id учасника рушія, у командній грі — команди; перекладу «людина → команда», як у `botAct`, тут не треба);
  - решта → `hostStep(room, action, true)`.
- [ ] `view`/`baseView`: для `identity.admin !== undefined` — `hostView(room.state, { byAdmin: true })` і `botHost: { manual: room.botManual !== null, mine: room.botManual?.adminId === identity.admin }`; звичайний пульт — без змін.

**Тести (`manager.bot-host.test.ts`):**
- [ ] токен: кімната бота → `fresh: true`, вдруге той самий адмін — той самий токен і `fresh: false`, інший адмін — інший токен; звичайна кімната автопілота й кімната з ведучим → `game_not_found`;
- [ ] `identify`: токен адміна → `admin` в ідентичності; `room.hostToken` автопілота → `null`; токен адміна з кімнати A в кімнаті B → `null`;
- [ ] `connect` адміна не гасить таймер «нікого» (`room.absence`) — гра без гравців однаково закінчується за `AUTOPILOT_EMPTY_MS`;
- [ ] `adminHost`: `override` після reveal змінює бали; `undo` працює; `save`/`sounds`/`think-words` → `not_allowed`; `next` одразу після кроку → `too_soon`; `pause` ставить hold `'author'`; `start` із формою `host` лишає ручні команди;
- [ ] регрес: `host()` в автопілоті → `forbidden`; `author()` автора-гравця не отримав нових дій (наприклад, `override` → `not_allowed`).
- [ ] `pnpm test --project server --maxWorkers=2 apps/server/src/rooms`.

**Коміт:** `feat(server): 68 admin host identity in bot rooms — per-admin host token kept in memory, host role only for that token and only in a bot room, a separate connection key that leaves the empty-room timer alone, adminHost runs the host steps (start keeps the admin's teams, pause holds as the author, save, sounds and think edits not allowed), the admin host view gets undo and botHost`

---

### Задача 4. Менеджер: режим «Керую сам» і пауза адміна

**Файли:** `apps/server/src/rooms/manager.ts`; тест `apps/server/src/rooms/manager.bot-host.test.ts`.

**Зміни:**
- [ ] `botManual(code: string, adminId: string, on: boolean): AckResult & { changed?: boolean }` — немає кімнати / не бота / не автопілот → `game_not_found`; `frozen` → `restarting`; фаза `finished` → `wrong_phase`.
  - `on`: `room.botManual = { adminId, since: now }` (інший адмін може перехопити — тоді `adminId` новий), `reschedule(room)` (таймер `room.pilot` гасне), `emit changed` (зрізи пультів — новий `botHost`).
  - `off`: `room.botManual = null`; якщо гра йде (не пауза, не лобі/фініш) — `commit(room, { ...state, autopilot: { ...pilot, at: autopilotDue(state, now) } })` (свіжий відлік поточного кроку від миті повернення; `planAutopilot` лишить `at`, бо `pilotKey` той самий), інакше лише `reschedule` + `emit changed`.
  - `changed` — чи стан справді змінився (для журналу маршруту).
- [ ] `reschedule`: таймер `room.pilot` ставиться лише коли `room.botManual === null`. Коментар: «68: «Керую сам» — бот не робить кроків; годинник рушія (deadline) іде як завжди».
- [ ] `manualAway`: у `disconnect` адміна до нуля пультів при `botManual !== null` — `timer(room, 'manual-away', BOT_MANUAL_GRACE_MS, …)` → `botManual(code, …, false)`-логіка без журналу (приватний `releaseManual(room)`, яким користується й `botManual` off). `connect` адміна гасить таймер. `clearTimers` гасить `manualAway`.
- [ ] `watchAuthor`: для кімнати бота пауза hold `'author'` вважається «автор на зв'язку», поки `adminHostsOnline(room) > 0` (тобто таймер 10 хв не ставиться/гасне); пульти пішли — наявне правило.

**Тести:**
- [ ] «Керую сам» на reveal: годинник-фейк крутиться далі за `AUTOPILOT_MS.reveal` + запас — фаза лишається `reveal`; `adminHost next` → `leaderboard`/наступне;
- [ ] у полі (чи бліці за ключем) відповідь, що чекає ведучого, у «Керую сам» не оцінюється сама; `accept` адміна — оцінено; у «Допомагаю» — оцінюється одразу (як досі);
- [ ] запитання з таймером у «Керую сам» закривається таймером рушія (`locked`);
- [ ] `off` ставить `autopilot.at = now + AUTOPILOT_MS.<крок>` (а не минулу мить) і бот робить крок вчасно;
- [ ] пульт адміна відключився: за `BOT_MANUAL_GRACE_MS − 1` ще ручний, за `BOT_MANUAL_GRACE_MS` — бот; повернувся раніше — таймер скасовано;
- [ ] пауза адміна при відкритому пульті не знімається й через `HOST_ABSENCE_MS + 1`; після відключення пульта — знімається через `HOST_ABSENCE_MS`;
- [ ] відновлення зі знімка: `botManual === null`, `adminHosts` порожня;
- [ ] `pnpm test --project server --maxWorkers=2 apps/server/src/rooms`.

**Коміт:** `feat(server): 68 manual mode for a bot room — the bot makes no step while an admin holds the game, the engine clock still runs, giving it back starts the current step afresh, 60 s with no admin host screen gives it back by itself, an admin pause holds while a host screen is open`

---

### Задача 5. Сокети й журнал дій з пульта адміна

**Файли:** `apps/server/src/socket.ts`, `apps/server/src/admin-host-log.ts` (новий), `apps/server/src/app.ts`; тести `apps/server/src/admin-host-log.test.ts` (новий), `apps/server/src/socket.bot-host.test.ts` (новий; зразок — `socket.test.ts`).

**Зміни:**
- [ ] `admin-host-log.ts`: `export function adminHostLog(state: GameState, action: HostAction | { type: 'hint'; playerId: string } | { type: 'ladder-decide' }): { kind: AdminActionKind; text?: string } | null` — таблиця видів зі специфікації (п. 7); `text` — нік людини/назва команди (`memberOf` чи `state.players`) з позначкою: `override` — `✓` / `½` / `✗`, `judge` — `✓`/`✗`, `accept` — `✓`, `repick` — `↻`, `adjust` — `+N`/`−N` (як у маршруті 62: `нік: +N`), `kick`/`release`/`debuff`/`undebuff`/`hint` — нік; інші — без тексту. Нік рахувати **до** дії (після вилучення людини вже немає).
- [ ] `SocketOptions` + `onAdminHost?: (entry: { adminId: string; code: string; title: string; kind: AdminActionKind; text?: string }) => void`.
- [ ] Підключення: `const admin = identity.admin;` `run = (action) => admin !== undefined ? logged(action, () => manager.adminHost(room, action)) : isHost ? manager.host(room, action) : manager.author(...)`, де `logged` рахує `adminHostLog(room.state, action)` до дії й після `ok` кличе `options.onAdminHost?.(…)` (виняток колбека — `reportError`, ack не змінюється). Обробники `host:hint`, `host:ladder-decide` для адміна — так само через `logged`. `host:ladder-pick`, `host:audio`, `host:awards`, `host:live-watch`, `host:react` — без змін (працюють при `isHost`).
- [ ] `app.ts`: `onAdminHost: (entry) => void logAction(db, { adminId: entry.adminId, kind: entry.kind, targetUserId: BOT_USER_ID, details: { title: entry.title, code: entry.code, ...(entry.text === undefined ? {} : { text: entry.text }) }, now: new Date() }).catch((error) => reportError(error, { where: 'admin-host-log' }))`.

**Тести:**
- [ ] `admin-host-log.test.ts`: кожна дія з таблиці → свій вид або `null`; текст оцінки з позначкою; командна гра — назва команди для `adjust`, нік людини для `kick`.
- [ ] `socket.bot-host.test.ts` (справжній сервер на випадковому порту, як `socket.test.ts`): сокет з токеном адміна отримує зріз `role: 'host'` з `botHost`; `host:override` → ack `ok` і `onAdminHost` з `bot_room_grade`; `host:next` → без журналу; `host:save` → `not_allowed`; сокет з `hostToken` кімнати автопілота → `connect_error` `unauthorized`; пульт адміна бачить `host:drafts` з «наживо»; гравець автопілота з `host:override` → як досі `not_allowed`.
- [ ] `pnpm test --project server --maxWorkers=2 apps/server/src/socket apps/server/src/admin-host-log.test.ts`.

**Коміт:** `feat(server): 68 admin host sockets — the admin's host events run through adminHost, grades, undo, debuffs, hints, points, kicks and round control are logged for the admin (pacing and display steps are not), a bot room's own host token still opens nothing`

---

### Задача 6. Маршрути адмінки: доступ до пульта й режим «Керую сам»

**Файли:** `apps/server/src/admin-bot-routes.ts`; тести `apps/server/src/admin-bot-routes.test.ts`, `apps/server/src/admin-routes.test.ts`.

**Зміни:**
- [ ] `POST /api/admin/bot/rooms/:code/host-access` (`write`): `adminOf` → 404; код не `ROOM_CODE` → 404; `frozen` → 503; `manager.botHostToken(code, me.id)`; `game_not_found` → 404; `fresh` → `logAction(kind 'bot_room_host_open', details { title, code })`; відповідь `200 { hostToken, stageToken }` (`AdminBotHostAccess`). Реєструвати **до** `/:code/:action` і переконатися, що `host-access` не потрапляє в параметричний маршрут (статичний сегмент Fastify має пріоритет; тест це перевіряє).
- [ ] `PUT /api/admin/bot/rooms/:code/manual` (`write`): тіло `adminBotManualSchema` → 400; `manager.botManual(code, me.id, on)`; 404/409/503 як у `lobby`; `changed` → `logAction('bot_room_manual_on' | 'bot_room_manual_off')`; відповідь `200 { on }`.
- [ ] `botRoomView`: `manual: room.botManual !== null`, `hosts: (room.connections.get('admin-host') ?? 0)` (через хелпер менеджера, не напряму, якщо є); прибрати тимчасові значення задачі 2.

**Тести:**
- [ ] доступ: адмін → 200 і рядок журналу `bot_room_host_open`; удруге — той самий токен і **без** нового рядка; не-адмін і гість → 404; кімната з ведучим-людиною і автопілот гравця → 404;
- [ ] режим: `on` → `GET /api/admin/bot` показує `manual: true`, журнал `bot_room_manual_on`; повторний `on` → без рядка; `off` → `bot_room_manual_off`; погане тіло → 400; фініш → 409 `wrong_phase`;
- [ ] `admin-routes.test.ts`: обидва маршрути в списку `routes` (404 для не-адміна).
- [ ] `pnpm test --project server --maxWorkers=2 apps/server/src/admin-bot-routes.test.ts apps/server/src/admin-routes.test.ts`; `pnpm typecheck`.

**Коміт:** `feat(server): 68 admin routes for the bot host screen — host access hands the admin a host token of his own (logged once), manual mode on and off (logged on change), the bot room card shows manual mode and admin host screens online`

---

### Задача 7. Веб: сторінка пульта адміна `/bot-host/:code`

**Файли:** `apps/web/src/pages/BotHost.tsx` (новий), `apps/web/src/screens/BotHostBar.tsx` (новий), `apps/web/src/screens/HostScreen.tsx`, `apps/web/src/AppRoutes.tsx`, `apps/web/src/admin/admin-api.ts`, `apps/web/src/i18n.ts`, `apps/web/src/locales/*.json`, `apps/web/src/i18n.test.ts`, `apps/web/src/styles.css`; тести `apps/web/src/pages/BotHost.test.tsx` (новий), `apps/web/src/screens/HostScreen.test.tsx`, `apps/web/src/AppRoutes.test.tsx`.

**Зміни:**
- [ ] `admin-api.ts`: `botHostAccess(code)` → `POST …/host-access`; `botManual(code, on)` → `PUT …/manual`.
- [ ] `BotHost.tsx` — як `Host.tsx`, але токени з `botHostAccess` (лише в стані компонента, **без** `saveHost`/`localStorage`); `restarting` → повтор через `RETRY_MS`; 404 → екран «немає доступу» з посиланням на `/admin/bot`; `game.status === 'unauthorized'` вперше після успіху → спитати токен знову (рестарт/переїзд), вдруге поспіль → `gameGone`. Над `HostScreen` — `BotHostBar`, у `HostScreen` — `botHost` прапорець.
- [ ] `BotHostBar.tsx`: смуга `role="status"`: `view.botHost.manual ? (mine ? t('botHostManualMine') : t('botHostManualOther')) : t('botHostAuto')`; кнопка `t('botHostTakeOver')` / `t('botHostGiveBack')` → `botManual` (помилка — `err_*` як у картці); посилання `t('botHostBack')` → `/admin/bot`. Не на фініші.
- [ ] `HostScreen` `Props` + `botHost?: boolean` (JSDoc «68: пульт адміна в кімнаті бота»): ховає кнопку «Зберегти гру», перемикач звуків, `LobbyAccess` (лобі — на картці адмінки), `ResumePanel` (12r — за акаунтом ведучого). Решта без змін.
- [ ] `AppRoutes.tsx`: `<Route path="/bot-host/:code" element={<BotHost />} />` поруч із `/host/:code` (поза макетом).
- [ ] Ключі (uk + 6 локалей, усі в `ADDED_BOT_HOST_68`): `botHostAuto` («Гру веде бот — ти допомагаєш: будь-яка кнопка діє одразу»), `botHostManualMine` («Керуєш ти: бот не робить кроків»), `botHostManualOther` («Керує інший адмін: бот не робить кроків»), `botHostTakeOver` («Взяти керування»), `botHostGiveBack` («Віддати боту»), `botHostBack` («До вкладки «Бот»»), `botHostDenied` («Ця кімната не бота або ти не адмін»).
- [ ] Стилі смуги — у `styles.css`, світла й темна теми, 360 px без бокового скролу.

**Тести:**
- [ ] `BotHost.test.tsx` (мок `admin-api` і `useGame`): 404 → `botHostDenied`; токен → `HostScreen` з `botHost`; «Взяти керування» кличе `botManual(code, true)`; `unauthorized` один раз → новий запит токена; `localStorage` не змінено.
- [ ] `HostScreen.test.tsx`: з `botHost` немає «Зберегти гру», перемикача звуків, `LobbyAccess`, `ResumePanel`; без — є (регрес).
- [ ] `AppRoutes.test.tsx`: `/bot-host/123456` → `BotHost`.
- [ ] `i18n.test.ts`: `ADDED_BOT_HOST_68` у довгій умові й у перевірці всіх локалей.
- [ ] `pnpm test --project web --maxWorkers=2 apps/web/src/pages/BotHost.test.tsx apps/web/src/screens/HostScreen.test.tsx apps/web/src/AppRoutes.test.tsx apps/web/src/i18n.test.ts apps/web/src/locales`; `pnpm typecheck`.

**Коміт:** `feat(web): 68 bot host screen for admins — /bot-host/:code opens the real host screen with a token from the admin route (memory only, asked again after a restart), a bar with who drives the game and take over / give back, save, sounds, lobby and resume panels hidden; texts in 7 languages`

---

### Задача 8. Веб: картка кімнати бота й рядки журналу

**Файли:** `apps/web/src/admin/AdminBotRoomCard.tsx`, `apps/web/src/admin/AdminBot.tsx`, `apps/web/src/admin/admin-text.ts`, `apps/web/src/i18n.ts`, `apps/web/src/locales/*.json`, `apps/web/src/i18n.test.ts`; тести `apps/web/src/admin/AdminBotRoomCard.test.tsx`, `apps/web/src/admin/AdminLog.test.tsx` (чи `admin-text.test.ts`).

**Зміни:**
- [ ] Картка: посилання-кнопка `t('adminBotHostOpen')` («Відкрити як ведучий») → `/bot-host/:code`, `target="_blank" rel="noopener noreferrer"` (поруч із «Відкрити сцену»), у всіх станах (на фініші — для «Нагороди на сцені»); тег `t('adminBotManualTag')` («Керує адмін») при `room.manual`; кнопка `t('botHostTakeOver')` / `t('botHostGiveBack')` (ключі задачі 7) → новий проп `onManual(on)` → `AdminBot` кличе `botManual` і перечитує список; підпис `t('adminBotHosts', { count })` («Пультів адмінів: {count}») при `room.hosts > 0`.
- [ ] Рядки журналу (uk + 6 локалей): `adminLog_bot_room_host_open` («{admin} відкрив(-ла) пульт ведучого в грі бота (код {code})»), `adminLog_bot_room_manual_on` («{admin} взяв(-ла) керування грою бота (код {code})»), `adminLog_bot_room_manual_off` («{admin} віддав(-ла) керування боту (код {code})»), `adminLog_bot_room_grade` («{admin} оцінив(-ла) відповідь у грі бота — {text} (код {code})»), `adminLog_bot_room_undo` («{admin} скасував(-ла) бали в грі бота (код {code})»), `adminLog_bot_room_debuff` («{admin} змінив(-ла) дебаф у грі бота — {text} (код {code})»), `adminLog_bot_room_hint` («{admin} дав(-ла) підказку в грі бота — {text} (код {code})»). Порожній `{text}` (оцінка без людини, напр. `name`/`alike-*`) — у `admin-text.ts` для `bot_room_grade` без тексту взяти варіант без « — {text}» (окремий ключ `adminLog_bot_room_grade_plain` або обрізання; вибрати ключ — простіше для перекладачів).
- [ ] `ADDED_BOT_HOST_68` доповнити ключами цієї задачі.

**Тести:**
- [ ] Картка: посилання веде на `/bot-host/<код>` у новій вкладці; тег і перемикач відповідають `manual`; клік кличе `onManual(!manual)`; `hosts` показано.
- [ ] Журнал: кожен новий вид рендериться без `{змінних}` у тексті; `bot_room_grade` з текстом і без.
- [ ] `pnpm test --project web --maxWorkers=2 apps/web/src/admin apps/web/src/i18n.test.ts apps/web/src/locales`; `pnpm typecheck`.

**Коміт:** `feat(web): 68 bot room card opens the host screen — «open as host» in a new tab, a manual-mode tag and take over / give back, admin host screens online; log lines for host open, manual on and off, grades, undo, debuffs and hints in 7 languages`

---

### Задача 9. E2E: частина 68 — адмін веде гру бота з пульта

**Файли:** `apps/server/e2e/part68-bot-full-host.e2e.ts` (новий; зразок — `part62-bot-room-controls.e2e.ts`).

**Сценарій** (адмін через `relisten({ adminEmails })` і `flags.restarting` у `finally`, як у 62; телефон гравця 360 px, світла тема):
- [ ] Адмін передає боту вікторину: класичний раунд з трьох запитань (текстова відповідь «Говерла 68», вибір із варіантів, «так/ні» з правильною «ні»; таймер ≥ 25 с) + раунд поля з ручною перевіркою (дві клітинки), запускає гру; двоє гравців приєднуються (один — сторінкою 360 px, другий — сокетом).
- [ ] На картці — «Відкрити як ведучий» відкриває `/bot-host/<код>` у новій вкладці; смуга «Гру веде бот…»; у журналі — рядок «відкрив(-ла) пульт ведучого».
- [ ] Адмін тисне «Почати гру» з пульта; бот сам доводить до першого розкриття (режим «Допомагаю»); гравець відповів «Говерла» без «68» → неправильно; адмін «Змінити оцінку» → правильно; бали гравця на пульті й телефоні зросли; журнал — рядок «оцінив(-ла)… ✓».
- [ ] «Скасування балів» відкат цієї оцінки — бали повернулися; журнал — «скасував(-ла) бали».
- [ ] «Взяти керування»: на розкритті чекаємо `AUTOPILOT_MS.reveal + 3 с` — фаза не змінилася (кадри сокета гравця не мають нової фази); адмін «Далі» — гра пішла далі; на полі гравець відповідає на клітинку з ручною перевіркою — відповідь чекає «Прийняти» на пульті (бот не оцінив), адмін приймає; журнал — «взяв(-ла) керування».
- [ ] «Віддати боту» — бот сам робить наступний крок у межах таблиці часу; журнал — «віддав(-ла) керування».
- [ ] Знову «Взяти керування», закрити вкладку пульта — за `BOT_MANUAL_GRACE_MS` + запас картка показує без тегу «Керує адмін», бот веде далі (у тесті — менший грейс через змінну оточення не вводити; чекати 60 с допустимо, або перевірити цей пункт лише юніт-тестом задачі 4 — виконавець вибирає й пише в коміті).
- [ ] Адмін вилучає гравця з пульта (`Вилучити`) — гравець бачить вилучення; журнал — наявний рядок «вилучив(-ла)».
- [ ] Не-адмін: `POST …/host-access` → 404; сокет `role: 'host'` з довільним токеном → `unauthorized`; сторінка `/bot-host/<код>` у не-адміна — `botHostDenied`.
- [ ] Без бокового скролу на телефоні гравця й на сторінці пульта шириною 360 px (`expectNoSideScroll`).
- [ ] Запуск: `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 68"`; після — окремо `-t "part 62"`, `-t "part 54"`, `-t "part 56"`.

**Коміт:** `test(e2e): 68 the admin hosts a bot game from the real host screen — open as host, regrade and undo while the bot paces, take over so the bot stops (a board answer waits for «Прийняти»), give back, kick, log lines; a non-admin gets 404 and no host socket`

---

### Задача 10. Загальна перевірка

**Файли:** —

- [ ] `pnpm typecheck`.
- [ ] `pnpm test --project shared --maxWorkers=2`, потім `engine`, `server`, `web` — по одному, на передньому плані.
- [ ] Перевірити, що `GAME_STATE_VERSION` = 22, `schema-golden`/`restore` тести зелені, `snapshot` кімнати не містить `adminHosts`/`botManual` (тест задачі 4).
- [ ] e2e — частини 68, 62, 54, 56 (якщо не прогнані в задачі 9 після останніх змін).
- [ ] Ручна перевірка на dev-сервері: пульт адміна на телефоні 360 px у світлій і темній темах; після перевірки — зупинити dev-сервери.

**Коміт:** лише якщо були виправлення: `fix(68): <що саме>`.

---

## Рішення, які може ухвалити лише власник

1. **Два режими («Допомагаю» типово + «Взяти керування»)** чи одразу «Керую сам», щойно відкрив пульт? План: типово бот веде темп.
2. **Повернення боту через 60 с без пульта** в режимі «Керую сам» — прийнятний час?
3. **Що писати в журнал:** план не пише кроки темпу й показу («Далі», «Закрити запитання», ±15 с, звук, «хмара» тощо) — лише оцінки, скасування, бали, дебафи, підказки, вилучення, старт/пауза/кінець, режим. Чи треба писати все?
4. **Пауза адміна не знімається сама**, поки відкритий пульт (сьогодні — через 10 хв). Так?
5. **Свідомо поза планом:** слова й «не на тему» в «Думай інакше» (у автопілоті там заготовлені слова й голосування), перемикач звуків, «Зберегти гру», «Підставити з попередньої гри», голосовий режим і ручна перевірка фіналу (вікторину бота вже перетворено при створенні кімнати). Згода?
6. Гравці **не бачать**, що пульт відкрив адмін. Чи показувати їм «Веде: <нік адміна>»?
