# План 44: виклик другові (38a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** `GameState` не змінюється взагалі: позначка виклику живе на рівні кімнати (`Room.challenge`) і в знімку кімнати (`SavedRoom.challenge?` — необов'язкове поле, як `prizes?`/`lobby?`), а не в стані гри. Нові поля зрізів (`AuthorView.challenge?`) ставить сервер, рушій їх не знає. База — **одна адитивна міграція** `0038_challenges` (дві нові таблиці).

> **Звірка з кодом.** План спирається на `main` 2026-11-18 (`1bcc46f0`, після плану 43):
> - автопілот: `packages/shared/src/autopilot.ts` — `autopilotCheck(quiz)` (`blocked` лише `think_words`; `changed` — `voice`, `manual`, `ladder_pick`, `hint`, `untimed`), `autopilotQuiz(quiz)` **нічого не пропускає, а перетворює** (вголос → телефон, ручна перевірка фіналу/ставок/аукціону → ключ, «ведучий вибирає» → жереб). Пропуск рушія — лише `playable()` (`packages/engine/src/game.ts` ~1507): «Шпигун» без `LIMITS.minSpyPlayers` (3) учасників **без автора** (`spyCast` — автор автопілота глядач) і «100 до 1» без дошки. Інші місця, де автор автопілота — глядач: «Думай інакше» (`think.ts` ~76, `thinkOver` закінчує раунд одразу, «в автопілоті лише автор»), «Шпигун» (`spy.ts` ~38);
> - кімната-автопілот: `RoomManager.createAutopilot(quiz, hostUserId, quizId, nickname)` (`apps/server/src/rooms/manager.ts` ~728) → `createAutopilotGame` (автор — гравець, `state.autopilot = { authorId, at }`), `open(state, hostUserId, quizId, id = randomUUID())` (~758), токен гравця; HTTP — `POST /api/games` з `{ quizId, autopilot: true, nickname }` (`account-routes.ts` ~188–230; `autopilotCheck(quiz).blocked` → 409 `autopilot_blocked`; відповідь `{ gameId, code, stageToken, token, playerId }`); веб — `apps/web/src/pages/AutopilotLaunch.tsx` (`savePlayer`, `saveAuthor(code, { stageToken })`, `saveLastGame`, `navigate('/play/<code>')`);
> - гра на телефоні без сцени — **уже є**: `PlayerScreen` показує текст запитання (`h1` ~1653), автор у лобі бачить `AuthorLobby` (`screens/AuthorLobby.tsx`: код, QR, посилання на сцену, `PrizePlaces`, `ResumePanel` 12r, «Почати гру» → `host:start`), звук без сцени грає телефон (`autoAudio = view.autopilot && stageGone`). Окремого «режиму без сцени» не треба;
> - відновлення: `SavedRoom` (`manager.ts` ~495, `SAVED_ROOM_VERSION = 1`, необов'язкові `checkpoint?`, `continued?`, `prizes?`, `lobby?`), `snapshot(room)` (~798), `restore(saved)` (~821), рядок `live_room` (`db/schema.ts` ~443). Кімнату-автопілот без нікого на зв'язку `watchEmpty` (~2431) через `AUTOPILOT_EMPTY_MS` (30 хв) → `autosave` (~2480): гра з `plays.length > 0` **зберігається** (`closeSaved` → `saved_game`, `game.status = 'saved'`), інакше `end`. Продовження — `POST /api/games/:id/continue` (`apps/server/src/saved-games.ts` ~234: `ownSaved` за `game.hostId`, `savedMode` → `manager.continueSaved(gameId, hostUserId, saved)` (точне, той самий `room.id`, токен автора) або `restartSaved` (шлях 12r, новий id)); `DELETE /api/games/:id` видаляє збережену;
> - продовжена кімната має `continued !== null` → `joinableOf` дає `'late'` — **нові люди можуть увійти посеред гри**; `join` (~1087), `slots` (~1250), `claim` (~1227), `setLobby` (~922);
> - історія, досягнення, досвід: `apps/server/src/recorder.ts` пише `game` (id = `room.id`, `hostId = room.hostUserId`, `quizId = room.quizId`, `autopilot: true`) і `participant` (`score`, `totalTimeMs` — сума часу відповідей з обрізанням до ліміту, `rank`, `userId`) на кожну зміну, після фінішу — `awardGame`, `awardPrizes`, `creditGame`, `publishGameFeed`. Досвід (`xp-rules.ts` ~52): `accounts < LEVEL_XP.minAccounts` (3) → `few_accounts`, тож **одиночна гра досвіду не дає** (так і в автопілоті);
> - коди: `newInviteCode(random)` (`apps/server/src/group-store.ts` ~31, 10 символів з `GROUP_CODE_ALPHABET` = `'abcdefghjkmnpqrstuvwxyz23456789'` без перекосу, `packages/shared/src/groups.ts` ~34), повтор на `UNIQUE_VIOLATION = '23505'` (`CODE_ATTEMPTS = 3`); сторінка-зразок — `apps/web/src/pages/GroupJoin.tsx` (гість → `loginFor('/groups/join/<код>')`, «Увійти»);
> - міграції: `apps/server/drizzle/00NN_<name>.sql` + `meta/_journal.json` + `meta/00NN_snapshot.json`, генерує `pnpm --filter @quiz/server exec drizzle-kit generate --name <name>` (з `drizzle.config.ts`), заголовок-коментар українською першим рядком (як `0033_groups.sql`); остання — `0037_cosmetics_34`; тест міграції — `apps/server/src/db/schema.test.ts` з `createTestDbUpTo('<тег>')` → `migrateRest()`. Резервні копії (`db-backup.ts`) беруть усі таблиці з `information_schema` — нових списків не треба;
> - маршрути: `currentUser(request)`, `CODE_LIMIT` (120/хв), `CREATE_LIMIT` (20/хв), `UNAUTHORIZED`/`NOT_FOUND`/`INVALID`; реєстрація — `apps/server/src/app.ts` ~119–159 (`registerGroupRoutes(app, { db, currentUser })`, `registerSavedGameRoutes(app, { db, manager, locate, currentUser, maxRooms, gate })`); тест-зразок — `games.autopilot-blocked.test.ts` (`buildApp({ db: await createTestDb(), auth: TEST_AUTH })` → `{ app, manager, … }`, `signUp(app, 'Олена')` → `{ cookie }`), кімнати — `rooms/manager.autopilot.test.ts` (`FakeScheduler`, `manager.connect`, `manager.author(room, by, action)`); фікстури — `@quiz/engine/testing` (`single`, `bool`, `text`, `poll`, `cloud`, `survey`, `bluff`, `drawing`, `thinkalike`, `spy`, `think`, `classicRound`, `truthRound`, `thinkRound`, `auctionRound`, `boardRound`, `makeQuiz`, `makeRoundsQuiz`); у `packages/shared` тести будують фікстури самі (як `autopilot.test.ts`);
> - «Мої вікторини»: `apps/web/src/pages/Quizzes.tsx` (`li.panel` → `div.toolbar`: «Грати», «Провести ботом» (`setLaunch`), «Редагувати», `ExportMenu`, «Видалити»); `QuizSummary` (`api.ts` ~26); маршрути — `apps/web/src/AppRoutes.tsx` (`lazy`, усередині меню, як `/groups/join/:code`); формат — `secondsText(ms)`, `formatDay(iso)` (`format.ts`), множини — `countText(key, n, vars)` з `_one/_few/_many`; помилки — `errorText(code)` → `err_<code>`;
> - i18n: uk — `apps/web/src/i18n.ts`, шість локалей `apps/web/src/locales/{en,pl,de,es,it,ar}.json`; останній список — `ADDED_QUESTION_BANK` (`i18n.test.ts` ~192, перевірка локалей ~413–414, умова `adds no uk keys beyond the agreed list` ~494); `source-scan.test.ts`; довідка — `help/host-help.ts` (`SETTING_HELP_KEYS`, останній `'questionBank'`), `help/help-uk.ts` (`setting.questionBank.*` ~1204), `help/__fixtures__/help-uk-golden.json`, `locales/*.help.json`, `HelpButton({ id })`;
> - e2e: `apps/server/e2e/helpers/setup.ts` (`useE2eServer`, `db` — та сама база, що в сервера, тож «підміна часу» — `UPDATE` поля терміну), `helpers/common.ts` (`open`, `register`, `expectNoSideScroll`, `expectPhoneFit`), зразок автопілота — `part11g-h-autopilot.e2e.ts`, сторінки — `part42-import-export.e2e.ts`.
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

**Мета:** автор вікторини в «Мої вікторини» тисне «🏁 Виклик» і отримує посилання `/challenge/<код>` на 7 днів зі знімком вікторини; кожен акаунт один раз проходить її сам в одиночній кімнаті автопілота (без того, що потребує кількох гравців), може повернутися до перерваної спроби, а спільну таблицю (бали, потім час) бачать автор і ті, хто вже зіграв.

**Архітектура:** спільний фільтр `challengeQuiz` (`packages/shared/src/challenge.ts`) робить зі вікторини знімок для одного гравця. Сервер: таблиці `challenge` і `challenge_attempt` (одна спроба — первинний ключ), сховище `apps/server/src/challenges.ts`, маршрути `apps/server/src/challenge-routes.ts`. Спроба — звичайна кімната-автопілот з `id = attempt.gameId` і позначкою `Room.challenge` (без входу інших, без перенесення балів, прихована з лобі), тож запис історії, досягнення, відновлення після перезапуску й автозбереження — наявні. Таблиця результатів читається з `participant`/`game` за `gameId` спроби. Клієнт: діалог `challenge/ChallengeLaunch.tsx` у «Мої вікторини», сторінка `pages/ChallengePage.tsx`, режим виклику в `AuthorLobby`.

**Технології:** TypeScript, zod, Fastify + drizzle (Postgres, PGlite у тестах), socket.io, React 19 + Vite + Testing Library (jsdom), Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-18-challenge-design.md` (38a) — уся.

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22** (`packages/engine/src/restore.ts`). `GameState` не змінюється; нове — лише необов'язкові поля поза станом (`SavedRoom.challenge?`, `AuthorView.challenge?`). Якщо виконавцю здасться, що потрібне інше, — **зупинитися й спитати контролера**.
- **Міграція — лише додавання:** одна нова `0038_challenges` з двома `CREATE TABLE`, їхніми ключами й індексами; жодного `ALTER`/`DROP` наявних таблиць.
- Усі тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`. Нові uk-ключі — у нових списках `ADDED_CHALLENGE` і `ADDED_CHALLENGE_PLURALS` у `apps/web/src/i18n.test.ts`; обидва — в умові `adds no uk keys beyond the agreed list` і в перевірці наявності в усіх локалях (як `ADDED_QUESTION_BANK`). ru немає. Довідка — `help-uk.ts` + golden + шість `*.help.json`.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`); нових файлів у `ALLOWED` не треба.
- **Безпека:** код виклику — випадковий, неперебірний (12 символів, `crypto.randomBytes`, без перекосу); один акаунт — одна спроба (**первинний ключ `(challenge_id, user_id)` у базі**, не перевірка в коді); чужі акаунти не бачать таблиці, доки не зіграють (403 без рядків); прострочений чи замінений виклик не приймає нових спроб і не видає токенів (409 `challenge_closed`). Маршрути за кодом — з `CODE_LIMIT`; невірний формат коду й «немає такого» — однакова відповідь 404 `challenge_not_found`.
- **Нічого, пов'язаного з росією**, — у фікстурах, назвах вікторин і тестах.
- Таймери у фікстурах e2e ≥ 25 с; правильні так/ні у фікстурах — і «так», і «ні».
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|engine|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів; ніколи два запуски vitest водночас).
- Правки файлів — лише інструментами редагування; **не через python** (`python3` тут — заглушка, що нічого не робить).
- e2e: нова частина 44 у `apps/server/e2e`; спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 44"`; кадри — з `E2E_SHOTS=1`. Телефон 360 px і світла тема.

## Рішення плану (там, де специфікація мовчить)

**Що пропускає виклик** (`challengeQuiz`, точний список з коду):
- Раунди цілком: `truth` («Правда про гравця» — запитання про інших гравців), `think` («Думай інакше» — автор автопілота лише глядач, `thinkOver` закінчує раунд одразу), `auction` («Аукціон» — торг між гравцями; сам із собою — будь-яка ставка виграє).
- Запитання (вони бувають лише в класиці): `poll`, `wordcloud` (без балів, потрібен зал), `thinkalike` (бали за збіг з іншими, групи ≥ 2), `spy` (рушій і так пропускає: автор — глядач, треба ≥ 3 інших), `bluff` (бали за те, що обдурив інших), `drawing` (один малює, інші вгадують). `survey` лишається, але `cloudId` прибирається завжди (хмари вже немає); якщо власних рядків менше `LIMITS.minSurveyRows` (4) — запитання пропускається.
- Раунд, що після пропусків порожній, — пропускається (причина `empty`).
- Налаштування: `settings.teams` → геть (`teams`); `quiz.duels` (дуелі й ставки на них) → геть (`duels`); крамниця дебафів (`allowedDebuffs(quiz).length > 0 && settings.debuffShop !== false`) → `debuffShop: false` (`debuffShop`; дебафи — проти інших гравців).
- Решта (бліц, поле, фінал, ставки, «Ва-банк», «Вибування», «Мільйонер», головоломки, квест, усі інші типи) — як в автопілоті: `autopilotQuiz` рушій застосує сам при `createAutopilotGame`.
- Немає жодного раунду → `quiz: null` → створити виклик не можна (409 `challenge_empty`, автор бачить пояснення й список пропущеного).

**Виклик і код**
- Таблиця `challenge`: `id uuid pk default random`, `code text not null unique`, `quiz_id uuid` → `quiz.id` `on delete set null` (видалення вікторини не чіпає виклику — знімок самодостатній), `owner_id text not null` → `user.id` `on delete cascade`, `title text not null`, `quiz_snapshot jsonb not null` (результат `challengeQuiz`, читати через `upgradeQuiz`), `created_at`, `expires_at` (`created_at + CHALLENGE_DAYS` = 7 діб), `ended_at` (null; «Новий виклик» ставить «зараз»). Індекси: `challenge_owner_idx (owner_id)`, **`challenge_active_idx` — унікальний `(quiz_id) where ended_at is null`** (один незавершений на вікторину).
- Таблиця `challenge_attempt`: `challenge_id uuid` → `challenge.id` `cascade`, `user_id text` → `user.id` `cascade`, **первинний ключ `(challenge_id, user_id)`**, `game_id uuid not null unique` (id кімнати й рядка `game`; без зовнішнього ключа — рядок `game` з'являється лише після старту), `nickname text not null` (нік на момент старту), `started_at`. Індекс `challenge_attempt_user_idx (user_id)`.
- «Активний» = `ended_at is null && expires_at > now`. Код — `newChallengeCode()`: 12 символів з `GROUP_CODE_ALPHABET` (≈ 59 біт), `CHALLENGE_CODE = /^[abcdefghjkmnpqrstuvwxyz23456789]{12}$/`; генератор `newInviteCode` узагальнюється параметром довжини (`newCode(length, random)` у `group-store.ts`, `newInviteCode` = `newCode(10)`), повтор на `23505` до 3 разів.
- «Новий виклик» (є активний чи незавершений прострочений): в одній транзакції `ended_at = now` для `quiz_id … where ended_at is null`, потім вставка. Таблиця старого лишається доступною тим самим людям.

**Спроба** (`POST /api/challenges/:code/attempt`, `CREATE_LIMIT`; нік — `ensureProfile(db, user.id).nickname`):
1. Немає виклику / невірний формат → 404 `challenge_not_found`.
2. Немає спроби: не активний → 409 `challenge_closed`; `manager.size >= maxRooms` → 503 `server_busy`; `manager.frozen` → 503 `restarting`. Інакше **спершу** вставка спроби з новим `gameId = randomUUID()` (`on conflict do nothing`; конфлікт — паралельний запит: читаємо наявну й ідемо в п. 3), **потім** кімната `manager.createAutopilot(snapshot, user.id, null, nickname, { id: gameId, challenge })`.
3. Є спроба — за станом гри `gameId`:
   - рядок `game` зі статусом `finished` чи `aborted` → 409 `challenge_done` (і після терміну теж — це важливіше);
   - виклик не активний → 409 `challenge_closed`;
   - кімната з `room.id === gameId` жива в цьому процесі → `manager.authorToken(room)` (новий токен автора, той самий гравець);
   - `gameId` є в `openGameIds` (живе в іншому процесі) → 503 `restarting`;
   - `game.status = 'saved'` → продовження через спільне `continueSavedGame(…, challenge)` (п. «Продовження»);
   - рядка `game` немає й кімнати немає (кімнату закрито ще в лобі, `LOBBY_TTL_MS`) → нова кімната з тим самим `id = gameId`.
- Відповідь 201 `ChallengeAttemptStart = { code, token, playerId, stageToken }` (`code` — код кімнати); веб — `savePlayer`, `saveAuthor`, `saveLastGame`, `/play/<code>`.
- Позначка кімнати `RoomChallenge = { id: string; code: string; title: string }` (код і назва — для посилання «Таблиця виклику» на телефоні). `quizId` кімнати — `null` (вікторина не гравцева: панель 12r, лайки й «Підставити з попередньої гри» не стосуються виклику).
- У кімнаті з `challenge !== null`: `join`/`claim` → `game_not_found`, `slots` → `null` (як «немає гри»), `setLobby` → `not_allowed`, лобі `visibility: 'hidden'`; автор `start` з `resume` → `not_allowed` (не перенести бали шляхом 12r); решта дій автора (пауза, «Зберегти», «Завершити гру») — як в автопілоті. «Завершити гру» гравцем — спроба завершена з поточним рахунком.
- Гра, що вже йде в мить закінчення терміну, **догравається** (кімната не закривається за 7 діб); після терміну лише не видаються нові токени й не продовжуються збережені.

**Продовження збереженої спроби**
- З тіла `POST /api/games/:id/continue` виноситься `continueSavedGame(deps, userId, gameId, challenge?: RoomChallenge): Promise<ContinueOutcome>` (`saved-games.ts`); маршрут і спроба кличуть її. Маршрут сам шукає спробу за `game_id`: знайдено → виклик не активний → 409 `challenge_closed`, інакше передає позначку. Для гри виклику режим `restart` (12r) → 409 `cannot_continue` (новий id розірвав би зв'язок зі спробою). `manager.continueSaved(gameId, hostUserId, saved, challenge?)` ставить позначку до першого `commit`.
- `DELETE /api/games/:id` для гри виклику → 409 `challenge_game` (інакше видалив би слабку спробу й зіграв знову).

**Таблиця результатів**
- `GET /api/challenges/:code` (`CODE_LIMIT`, лише з сесією — гість 401; сторінка гостю нічого не питає) → `ChallengePreview = { title, author: { id, nickname } | null, expiresAt, endedAt, active, played, isAuthor, mine: 'none' | 'playing' | 'done', canSeeResults }`. `played` — кількість спроб; `mine` — `done`, коли `game.status` `finished`/`aborted`, `playing` — інакше при наявній спробі; `canSeeResults = isAuthor || mine !== 'none'`.
- `GET /api/challenges/:code/results` → 403 `challenge_hidden`, якщо `!canSeeResults`; інакше `ChallengeResultRow[]`: `{ place, nickname, score, timeMs, at, done, author, me }` з `challenge_attempt` ⟕ `game` (`game.id = game_id`) ⟕ `participant` (`game_id`, `user_id = attempt.user_id`, `is_team = false`): `score = participant.score ?? 0`, `timeMs = participant.totalTimeMs ?? 0`, `nickname = participant.nickname ?? attempt.nickname`, `done = game.status === 'finished'`, `at = game.finishedAt ?? attempt.startedAt` (ISO), `author = user_id === owner_id`. Порядок: `score` спадно, `timeMs` зростанням, `started_at` зростанням; `place` — 1…n підряд (рівні не ділять місця). Після терміну — так само.
- «Час проходження» — `participant.totalTimeMs` (сума часу відповідей рушія; без пауз і перерв — чесне порівняння для тих, хто повертався).

**Автор**
- `GET /api/quizzes/:id/challenge` → `ChallengeCheck = { skipped: ChallengeSkip; empty: boolean; active: ChallengeMine | null }` (404 — не своя). `POST /api/quizzes/:id/challenge` (`CREATE_LIMIT`) → 201 `ChallengeMine` | 409 `challenge_empty` | 404. `GET /api/challenges` → `ChallengeMine[]` активних викликів автора, `ChallengeMine = { quizId, code, expiresAt, played }`.
- Діалог «🏁 Виклик» (`challenge/ChallengeLaunch.tsx`, той самий `table-sheet`/`table-card`, що `AutopilotLaunch`): перевірка → «Запитання, що потребують кількох гравців, буде пропущено» зі списком (раунди за номером і типом, кількість запитань за раундом, налаштування) або «Пропускати нічого не треба»; `empty` → пояснення, кнопки немає; активний → «Новий виклик» з `window.confirm(t('challengeReplaceConfirm'))`; після створення — посилання `/challenge/<код>`, «Копіювати» (`navigator.clipboard`), «Поділитися» (лише коли є `navigator.share`), «Відкрити таблицю». У списку вікторин під активним викликом — рядок «🏁 Виклик: лишилось N дн. · зіграли M» з посиланням «Таблиця» (`/challenge/<код>`). Днів лишилось — `Math.ceil((expiresAt − now) / доба)`.

**Сторінка `/challenge/:code`** (`pages/ChallengePage.tsx`, зразок — `GroupJoin`): невірний формат чи 404 → «Виклик не знайдено»; гість → «Увійдіть, щоб прийняти виклик» + «Увійти» (`loginFor('/challenge/<код>')`); інакше картка: назва (`dir="auto"`), «від {nick}», «лишилось N дн.» / «Виклик завершено», «зіграли N людей», кнопка: `mine: 'none'` і активний → «Почати»; `'playing'` і активний → «Продовжити»; `'done'` → «Ти вже зіграв цей виклик»; не активний і `'none'` → лише текст. Таблиця (`table.challenge-results`: місце, нік (+ «автор», «не завершено», свій рядок `.is-me`), бали, час `secondsText`, дата `formatDay`) — коли `canSeeResults`; інакше «Таблицю видно після власної гри». На 360 px — без бокового скролу (дата ховається в другий рядок).

**Телефон у грі:** `AuthorView.challenge?: { code: string; title: string }` (ставить сервер у тому ж місці, що й `continued`, `manager.ts` ~1465). `AuthorLobby` з `challenge`: без коду, QR, сцени, призів і панелі 12r — «🏁 Виклик: {title}», «Ти граєш сам; запитання для кількох гравців пропущено.» і «Почати гру»; на `phase === 'finished'` у `PlayerScreen` — посилання «🏁 Таблиця виклику» (`/challenge/<код>`).

**Тексти (uk)** — `ADDED_CHALLENGE`:
`challengeButton: '🏁 Виклик'`, `challengeTitle: 'Виклик другові'`, `challengeLead: 'Друзі проходять цю вікторину самі, коли зручно, — по одній спробі з акаунтом. Посилання діє 7 днів, правки вікторини після створення на виклик не впливають.'`, `challengeChecking: 'Перевіряємо вікторину…'`, `challengeSkipTitle: 'Запитання, що потребують кількох гравців, буде пропущено:'`, `challengeSkipNone: 'Пропускати нічого не треба.'`, `challengeSkipRound: 'Раунд {index} ({type})'`, `challengeSkipSetting_teams: 'командна гра'`, `challengeSkipSetting_duels: 'дуелі й ставки на них'`, `challengeSkipSetting_debuffShop: 'крамниця дебафів'`, `challengeEmpty: 'У цій вікторині немає нічого, що можна пройти самому, — виклик створити не можна.'`, `challengeCreate: 'Створити виклик'`, `challengeReplace: 'Новий виклик'`, `challengeReplaceConfirm: 'Новий виклик завершить поточний. Його таблиця лишиться доступною. Продовжити?'`, `challengeLink: 'Посилання на виклик'`, `challengeCopy: 'Копіювати'`, `challengeCopied: 'Скопійовано'`, `challengeCopyFailed: 'Не вдалося скопіювати — виділіть посилання вручну.'`, `challengeShare: 'Поділитися'`, `challengeShareText: 'Приймеш виклик? «{title}»'`, `challengeOpenResults: 'Відкрити таблицю'`, `challengeActive: '🏁 Виклик: {days} · {played}'`, `challengeResultsLink: 'Таблиця'`, `challengeSignIn: 'Увійдіть, щоб прийняти виклик.'`, `challengeGone: 'Виклик не знайдено — можливо, посилання неповне.'`, `challengeFrom: 'від {nick}'`, `challengeEnded: 'Виклик завершено.'`, `challengeStart: 'Почати'`, `challengeContinue: 'Продовжити'`, `challengeDone: 'Ти вже зіграв цей виклик.'`, `challengeHiddenResults: 'Таблицю видно після власної гри.'`, `challengePlace: 'Місце'`, `challengeNick: 'Гравець'`, `challengeScore: 'Бали'`, `challengeTime: 'Час'`, `challengeDate: 'Дата'`, `challengeAuthorMark: 'автор'`, `challengeUnfinished: 'не завершено'`, `challengeNoResults: 'Ще ніхто не зіграв.'`, `challengeLobby: '🏁 Виклик: {title}'`, `challengeLobbyHint: 'Ти граєш сам; запитання для кількох гравців пропущено.'`, `challengeBoardLink: '🏁 Таблиця виклику'`, `err_challenge_not_found: 'Виклик не знайдено.'`, `err_challenge_closed: 'Виклик уже завершено — нових спроб немає.'`, `err_challenge_done: 'Ти вже зіграв цей виклик.'`, `err_challenge_empty: 'У вікторині немає запитань, які можна пройти самому.'`, `err_challenge_hidden: 'Таблицю видно після власної гри.'`, `err_challenge_game: 'Це спроба виклику — її не можна видалити.'`.
`ADDED_CHALLENGE_PLURALS`: `challengeDaysLeft_one/_few/_many: 'лишився {count} день' / 'лишилося {count} дні' / 'лишилося {count} днів'`, `challengePlayed_one/_few/_many: 'зіграла {count} людина' / 'зіграли {count} людини' / 'зіграли {count} людей'`.
Назва типу раунду в `challengeSkipRound` — `t(ROUND_NAMES[type])` (`apps/web/src/guide-text.ts` ~23: `roundTypeTruth` «Правда про гравця», `roundTypeThink`, `roundTypeAuction`, `roundTypeClassic` …); нових ключів для типів не треба.

## Порядок збирання

- Залежності: 1 — незалежна; 2 ← 1; 3 ← 1; 4 ← 2, 3; 5 ← 4; 6 ← 4, 5; 7 ← 5; 8 — остання.
- Кожна задача лишає `pnpm typecheck` зеленим; кнопка в «Мої вікторини» з'являється в задачі 5, сторінка — в задачі 6.

## Фокус рев'ю

1. **Друга спроба й чужий вхід.** Два паралельні `POST …/attempt` того самого акаунта — одна спроба й одна кімната; спроба після фінішу, після «Завершити гру», після перерваного `aborted` — 409 `challenge_done`; хтось інший з кодом кімнати (`/play/<код>`) чи через `claim` у продовженій кімнаті — не входить; `host:start` з `resume` — `not_allowed`; видалення збереженої спроби — 409. Задачі 2–4, 8.
2. **Повернення.** Закрив вкладку → те саме посилання (той самий чи інший пристрій) → та сама гра з тим самим рахунком; 30 хв без зв'язку → автозбереження → «Продовжити» з посилання й з «Мої ігри» — та сама спроба, позначка кімнати на місці (вхід інших знову закрито); перезапуск сервера посеред спроби → кімната встає з позначкою. Задачі 3, 4, 8.
3. **Підглядання.** Таблиця й `results` до власної гри — 403 без рядків (і для акаунта, що лише відкрив сторінку); гостю — 401; невірний чи вигаданий код — той самий 404; після терміну таблицю бачать ті самі люди. Задачі 4, 6.
4. **Знімок і пропуски.** Вікторина з опитуванням, хмарою, «100 до 1» з хмари, блефом, малюнком, шпигуном, «Думай як усі», «Правдою», «Думай інакше», аукціоном, командами, дуелями й крамницею дебафів — знімок проходить `quizSchema`, `autopilotCheck(snapshot).blocked` порожній, пропущене перелічено автору; вікторина лише з таких — 409 і пояснення; правка вікторини після створення виклику не змінює гри. Задачі 1, 4.
5. **Термін і заміна.** Прострочений (підміна `expires_at`) і замінений «Новим викликом» — без нових спроб і продовжень; одночасно лише один незавершений на вікторину (унікальний індекс); гра, що вже йде, догравається; на 360 px сторінка, таблиця з довгими ніками й діалог без бокового скролу у світлій темі. Задачі 2, 4–6, 8.

---

### Задача 1. Спільне: знімок для одного гравця й типи виклику (`packages/shared/src/challenge.ts`)

**Files:**
- Create: `packages/shared/src/challenge.ts`, `packages/shared/src/challenge.test.ts`
- Modify: `packages/shared/src/index.ts` (`export * from './challenge';`)

**Interfaces (Produces):**
```ts
export const CHALLENGE_DAYS = 7;
export const CHALLENGE_CODE_LENGTH = 12;
export const CHALLENGE_CODE: RegExp; // /^[abcdefghjkmnpqrstuvwxyz23456789]{12}$/ — з GROUP_CODE_ALPHABET
export const CHALLENGE_SKIP_ROUNDS = ['truth', 'think', 'auction'] as const;
export const CHALLENGE_SKIP_TYPES = ['poll', 'wordcloud', 'thinkalike', 'spy', 'bluff', 'drawing'] as const;
export const CHALLENGE_SKIP_SETTINGS = ['teams', 'duels', 'debuffShop'] as const;
export interface ChallengeSkip {
  rounds: { index: number; type: RoundType; reason: 'type' | 'empty' }[]; // 0-базові індекси вихідної вікторини
  questions: { index: number; count: number }[];                         // пропущені запитання за раундом, що лишився
  settings: (typeof CHALLENGE_SKIP_SETTINGS)[number][];
}
export function challengeQuiz(quiz: Quiz): { quiz: Quiz | null; skipped: ChallengeSkip };
export interface ChallengeMine { quizId: string; code: string; expiresAt: string; played: number }
export interface ChallengeCheck { skipped: ChallengeSkip; empty: boolean; active: ChallengeMine | null }
export interface ChallengePreview { title: string; author: { id: string; nickname: string } | null; expiresAt: string; endedAt: string | null; active: boolean; played: number; isAuthor: boolean; mine: 'none' | 'playing' | 'done'; canSeeResults: boolean }
export interface ChallengeResultRow { place: number; nickname: string; score: number; timeMs: number; at: string; done: boolean; author: boolean; me: boolean }
export interface ChallengeAttemptStart { code: string; token: string; playerId: string; stageToken: string }
export function challengeDaysLeft(expiresAt: string, now: number): number; // max(0, ceil((expiresAt − now) / 86 400 000))
```

- [ ] **Step 1: Write the failing tests** (`challenge.test.ts`, фікстури — власні, що проходять `questionSchema`/`quizSchema`, як в `autopilot.test.ts`; вміст — Україна, річки й міста):
  - `keeps a solo quiz as is` — класика з `single`, `boolean`, `text` + бліц → `quiz` `toEqual` вхідній (з тими самими id), `skipped` — порожні списки; вхід не змінено (`toEqual` знімку до виклику).
  - `drops questions that need other players` — класика з `single`, `poll`, `wordcloud`, `thinkalike`, `spy`, `bluff`, `drawing`, `boolean` → у раунді `single`, `boolean`; `skipped.questions` = `[{ index: 0, count: 6 }]`.
  - `survey stays without the cloud, or goes without rows` — `survey` з `cloudId` і 4 рядками → лишається без `cloudId`; `survey` з `cloudId` і 0 рядків → пропущено (рахується в `questions`).
  - `drops whole rounds` — раунди класика, `truth`, `think`, `auction`, класика лише з `poll` → лишаються 1-й і жодного іншого; `skipped.rounds` = `[{1,'truth','type'},{2,'think','type'},{3,'auction','type'},{4,'classic','empty'}]`.
  - `drops teams, duels and the debuff shop` — `settings.teams`, `quiz.duels`, дебафи дозволені → без `teams`, без `duels`, `settings.debuffShop === false`, `skipped.settings` = `['teams', 'duels', 'debuffShop']`; дебафів немає → `debuffShop` не чіпається й не в списку.
  - `the snapshot is valid and the autopilot can run it` — вікторина з усім переліченим вище + поле + фінал + «Мільйонер» → `quizSchema.safeParse(result.quiz).success`, `autopilotCheck(result.quiz).blocked` = `[]`.
  - `nothing left` — вікторина лише з `truth` і класики з `poll` → `quiz: null`.
  - `code and days` — `CHALLENGE_CODE` приймає 12 символів алфавіту, відкидає 11, 13, `0`, `l`, `o`, великі; `challengeDaysLeft(now + 7 діб, now)` = 7, `+ 1 мс` → 1, у минулому → 0.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/challenge.test.ts`. Expected: FAIL (модуля немає).
- [ ] **Step 3: Implement** за Interfaces і «Що пропускає виклик» (новий об'єкт; раунди фільтруються з індексами вихідної вікторини; `allowedDebuffs` з `quiz.ts`).
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared/src/challenge.ts packages/shared/src/challenge.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): 44 challenge — the one-player snapshot of a quiz (no polls, clouds, think-alike, spy, bluff, drawing, truth, think-different, auction, teams, duels or debuff shop; survey without its cloud), the list of what was skipped, the challenge code and the API types"
```

---

### Задача 2. Сервер: таблиці виклику й спроб, сховище (`0038_challenges`, `challenges.ts`)

**Files:**
- Modify: `apps/server/src/db/schema.ts` (таблиці `challenge`, `challengeAttempt` у кінці), `apps/server/src/db/schema.test.ts` (новий `describe('challenges (38a)')`), `apps/server/src/group-store.ts` (`newCode(length, random)`; `newInviteCode` через неї — поведінка та сама)
- Create: `apps/server/drizzle/0038_challenges.sql` + `meta/0038_snapshot.json` + запис у `meta/_journal.json` (`pnpm --filter @quiz/server exec drizzle-kit generate --name challenges`; першим рядком SQL — `-- Виклик другові (план 44): виклики зі знімком вікторини й одна спроба на акаунт.`), `apps/server/src/challenges.ts`, `apps/server/src/challenges.test.ts`

**Interfaces:**
- Consumes: `challengeQuiz`, `CHALLENGE_DAYS`, `CHALLENGE_CODE_LENGTH`, `ChallengeMine`, `ChallengeResultRow` (задача 1); `getQuiz` (`quizzes.ts`), `upgradeQuiz`, `ensureProfile`.
- Produces:
```ts
// group-store.ts
export function newCode(length: number, random?: (n: number) => Uint8Array): string;
// challenges.ts
export interface ChallengeRow { id: string; code: string; quizId: string | null; ownerId: string; title: string; snapshot: Quiz; createdAt: Date; expiresAt: Date; endedAt: Date | null }
export function isActive(row: ChallengeRow, now: Date): boolean;
export async function createChallenge(db: Db, ownerId: string, quizId: string, now: Date): Promise<{ ok: true; challenge: ChallengeRow } | { ok: false; error: 'not_found' | 'challenge_empty' }>;
export async function challengeByCode(db: Db, code: string): Promise<ChallengeRow | null>; // невірний формат → null без запиту
export async function activeForQuiz(db: Db, ownerId: string, quizId: string, now: Date): Promise<ChallengeMine | null>;
export async function myActiveChallenges(db: Db, ownerId: string, now: Date): Promise<ChallengeMine[]>;
export async function attemptOf(db: Db, challengeId: string, userId: string): Promise<{ gameId: string; nickname: string; startedAt: Date } | null>;
export async function claimAttempt(db: Db, challengeId: string, userId: string, nickname: string, now: Date): Promise<{ gameId: string; fresh: boolean }>; // insert … on conflict do nothing → наявна
export async function attemptByGame(db: Db, gameId: string): Promise<ChallengeRow | null>;
export async function playedCount(db: Db, challengeId: string): Promise<number>;
export async function challengeResults(db: Db, challenge: ChallengeRow, viewerId: string): Promise<ChallengeResultRow[]>;
```

- [ ] **Step 1: Write the failing tests:**
  - `schema.test.ts`: `migration 0038 lays the two tables over an older database, old data stays` (`createTestDbUpTo('0037_cosmetics_34')`, рядки `quiz`/`game` до міграції цілі, нові таблиці порожні); `one attempt per account` — друга вставка `(challenge_id, user_id)` → `rejects`; `one open challenge per quiz` — друга з `ended_at null` на той самий `quiz_id` → `rejects`, з `ended_at` — можна; `the code is unique`; видалення вікторини → `quiz_id null`, виклик лишається; видалення акаунта гравця → його спроба зникає; видалення виклику → спроби каскадом.
  - `challenges.test.ts` (база `createTestDb()`, акаунти й вікторини — вставкою або через `createQuiz`):
    - `creates a 7-day challenge with a snapshot` — `expiresAt − createdAt` = 7 діб, `code` проходить `CHALLENGE_CODE`, `snapshot` = `challengeQuiz(quiz).quiz`; правка вікторини (`updateQuiz`) після цього — `challengeByCode(...).snapshot` не змінився.
    - `refuses an empty or foreign quiz` — вікторина лише з `poll` → `challenge_empty`; чужа → `not_found`.
    - `a new challenge ends the old one` — другий `createChallenge` → перший має `endedAt`, коди різні, `activeForQuiz` → другий; таблиця першого (`challengeResults`) і далі читається.
    - `active means not ended and not expired` — `isActive` з `now` до і після `expiresAt`.
    - `claims one attempt` — два `claimAttempt` поспіль (і `Promise.all` з двох) → один `gameId`, `fresh` true лише один раз.
    - `results sort by score, then time` — три спроби з рядками `game`/`participant` (`finished` 500/40 с, `finished` 500/30 с, `running` 700/10 с) → місця: 700 (`done: false`), 500/30 с, 500/40 с; `me` — лише свій рядок; `author` — рядок власника; спроба без рядка `game` → `score 0`, `done false`, нік зі спроби.
    - `newCode` — довжина й алфавіт; детермінований `random` з байтами поза рівним діапазоном їх пропускає (як тест `newInviteCode`).
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/challenges.test.ts apps/server/src/db/schema.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** схему за «Виклик і код», згенерувати міграцію, переглянути SQL руками (лише `CREATE TABLE`, `ADD CONSTRAINT … FOREIGN KEY` нових таблиць, `CREATE [UNIQUE] INDEX`; частковий індекс — `uniqueIndex('challenge_active_idx').on(table.quizId).where(sql\`ended_at is null\`)`), потім `challenges.ts` (`createChallenge` — у транзакції: `getQuiz` → `challengeQuiz` → `update … set ended_at` → `insert`, код з повтором на `23505`).
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/challenges.test.ts apps/server/src/db/schema.test.ts apps/server/src/group-store.test.ts apps/server/src/db-backup.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/db/schema.ts apps/server/src/db/schema.test.ts apps/server/drizzle apps/server/src/group-store.ts apps/server/src/challenges.ts apps/server/src/challenges.test.ts
git commit -m "feat(server): 44 challenge — migration 0038 adds challenges (7 days, quiz snapshot, one open per quiz) and attempts (one per account by primary key); the store creates and replaces challenges, claims attempts and reads the results by score, then time"
```

---

### Задача 3. Сервер: кімната спроби (`Room.challenge` у `rooms/manager.ts`)

**Files:**
- Modify: `apps/server/src/rooms/manager.ts`, `packages/shared/src/views.ts` (`AuthorView.challenge?: { code: string; title: string }` — «ставить сервер, рушій ключа не ставить»)
- Create: `apps/server/src/rooms/manager.challenge.test.ts`

**Interfaces:**
- Consumes: `RoomChallenge` (визначається тут).
- Produces:
```ts
export interface RoomChallenge { id: string; code: string; title: string }
// Room: challenge: RoomChallenge | null;   SavedRoom: challenge?: RoomChallenge;
createAutopilot(quiz, hostUserId, quizId, nickname, options?: { id?: string; challenge?: RoomChallenge }): …; // як було
continueSaved(gameId: string, hostUserId: string, saved: SavedGameData, challenge?: RoomChallenge): ContinueResult;
roomById(id: string): Room | undefined;
authorToken(room: Room): { token: string; playerId: string } | null; // null — не автопілот; новий токен для autopilot.authorId, commit
```

- [ ] **Step 1: Write the failing tests** (`manager.challenge.test.ts`, зразок — `manager.autopilot.test.ts`; `FakeScheduler`; вікторина `makeQuiz([single, text])`):
  - `a challenge room is an autopilot room nobody else can enter` — `createAutopilot(quiz, 'u1', null, 'Марта', { id, challenge })` → `room.id === id`, `room.challenge` = позначка, `room.lobby.visibility === 'hidden'`, `room.quizId === null`; `join(room.code, 'Тарас')` → `{ ok: false, error: 'game_not_found' }`; `setLobby(room, { visibility: 'friends', … })` → `not_allowed`.
  - `no carried points` — автор `start` з `resume: { roundIndex: 0, points: { <authorId>: 900 } }` → `not_allowed`; без `resume` → `ok`, гра йде.
  - `a returning author gets a new token for the same player` — `authorToken(room)` → `playerId === authorId`, токен ≠ першого, обидва в `playerTokens`; звичайна кімната (`create`) → `null`.
  - `the mark survives a restart` — `snapshot(room).challenge` = позначка; `restore` на новому менеджері → `room.challenge` та сама, `join` знову `game_not_found`; знімок без поля → `challenge: null`.
  - `a continued attempt is still closed` — автозбереження через `AUTOPILOT_EMPTY_MS` після першого запитання (подія `closed` з `saved`) → `continueSaved(id, 'u1', saved, challenge)` → `room.id === id`, `challenge` на місці, `join` → `game_not_found`, `slots(room.code, null)` → `null`, `claim` → `game_not_found`.
  - `the author sees the challenge` — `view(room, author)` у лобі → `author.challenge` = `{ code, title }`; звичайний автопілот — без ключа.
  - `roomById` — знаходить живу кімнату за id, після закриття — `undefined`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/rooms/manager.challenge.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за Interfaces і «Спроба» (позначка ставиться в `open()` до першого `commit`; `challengeOf(raw)` у `restore` — лише об'єкт з трьома рядками, інакше `null`; перевірки в `join`, `claim`, `slots`, `setLobby`, у гілці `start` дій автора; `challenge` в автора-зрізі — поруч із `continued`).
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/rooms && pnpm typecheck`. Expected: PASS (наявні тести кімнат зелені — зокрема `manager.autopilot`, `manager.restore`, `manager.continue`, `manager.lobby`).
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/rooms/manager.ts apps/server/src/rooms/manager.challenge.test.ts packages/shared/src/views.ts
git commit -m "feat(server): 44 challenge — an attempt is an autopilot room with a challenge mark: hidden, nobody else joins or claims, no carried points, a returning author gets a fresh token, the mark survives restarts and continuing a saved attempt"
```

---

### Задача 4. Сервер: маршрути виклику й продовження (`challenge-routes.ts`, `saved-games.ts`)

**Files:**
- Create: `apps/server/src/challenge-routes.ts`, `apps/server/src/challenge-routes.test.ts`
- Modify: `apps/server/src/saved-games.ts` (`continueSavedGame`, перевірки виклику в `continue` і `DELETE`), `apps/server/src/app.ts` (реєстрація після `registerSavedGameRoutes`), `apps/server/src/saved-games.test.ts` (два нові тести)

**Interfaces:**
- Consumes: задачі 1–3; `openGameIds`, `ensureProfile`, `CODE_LIMIT`.
- Produces (HTTP):
```
GET  /api/quizzes/:id/challenge          → 200 ChallengeCheck | 401 | 404
POST /api/quizzes/:id/challenge          → 201 ChallengeMine | 401 | 404 | 409 { error: 'challenge_empty' }
GET  /api/challenges                     → 200 ChallengeMine[] | 401
GET  /api/challenges/:code               → 200 ChallengePreview | 401 | 404 { error: 'challenge_not_found' }
POST /api/challenges/:code/attempt       → 201 ChallengeAttemptStart | 401 | 404 | 409 challenge_closed|challenge_done|cannot_continue | 503 server_busy|restarting
GET  /api/challenges/:code/results       → 200 ChallengeResultRow[] | 401 | 403 { error: 'challenge_hidden' } | 404
```
```ts
// saved-games.ts
export type ContinueOutcome = { ok: true; status: 201; body: ContinueResponse } | { ok: false; status: 404 | 409 | 503; error: string };
export async function continueSavedGame(deps: Pick<SavedGameRouteDeps, 'db' | 'manager' | 'maxRooms'>, userId: string, gameId: string, challenge?: RoomChallenge): Promise<ContinueOutcome>;
export async function registerChallengeRoutes(app: FastifyInstance, deps: { db: Db; manager: RoomManager; currentUser: …; maxRooms: number; now?: () => Date }): Promise<void>;
```
`now` — для тестів (типово `() => new Date()`).

- [ ] **Step 1: Write the failing tests** (`challenge-routes.test.ts`, `buildApp` → `{ app, manager }`; Олена — автор, Тарас і Ірина — гравці):
  - `author creates, checks and lists` — `GET …/challenge` для вікторини з `poll` і `truth` → `skipped` перелічує, `empty: false`, `active: null`; `POST` → 201 з `code`; `GET /api/challenges` → один з `played: 0`; вікторина лише з `poll` → 409 `challenge_empty`; Тарас на вікторину Олени → 404; без сесії → 401.
  - `a guest and a wrong code` — `GET /api/challenges/<код>` без cookie → 401; `…/abc` і вигаданий правильного формату → однакові 404 `challenge_not_found`.
  - `one attempt, the same game on return` — Тарас `POST …/attempt` → 201, `manager.roomById(gameId)` — кімната з позначкою; другий `POST` → 201 з тим самим `code` кімнати й новим токеном; `Promise.all` двох перших запитів Ірини → один `gameId`.
  - `a finished attempt cannot be replayed` — гра Тараса доведена до фінішу (`manager.author(… 'end')` після старту, `recorder.idle()`) → `POST …/attempt` → 409 `challenge_done`; `preview.mine === 'done'`.
  - `results stay hidden until you played` — Ірина без спроби → `results` 403 `challenge_hidden`, `preview.canSeeResults: false`, `played` показано; автор → 200; Тарас → 200, його рядок `me: true`; рядок автора-гравця має `author: true`.
  - `expired and replaced challenges take no attempts` — `now` після `expiresAt` → нова спроба 409 `challenge_closed`, повернення до живої кімнати теж 409; «Новий виклик» → старий код 409 `challenge_closed`, `results` старого все ще 200 для Тараса.
  - `a saved attempt continues from the link and from my games` — після автозбереження (`AUTOPILOT_EMPTY_MS` на фейковому годиннику або `manager.author(… 'save')`) → `POST …/attempt` → 201, `room.id === gameId`, позначка є; знову зберегти → `POST /api/games/:id/continue` → 201, позначка є; після терміну — обидва 409 `challenge_closed`.
  - `saved-games.test.ts`: `a challenge attempt cannot be deleted` — `DELETE /api/games/:id` → 409 `challenge_game`; `continue keeps working for ordinary saved games` — наявна поведінка без змін.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/challenge-routes.test.ts apps/server/src/saved-games.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** маршрути за «Спроба», «Продовження збереженої спроби», «Таблиця результатів», «Автор» (виклик знімку — `upgradeQuiz(row.snapshot)`; `ensureProfile` для ніку; `continueSavedGame` — тіло нинішнього маршруту без зміни поведінки).
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/challenge-routes.test.ts apps/server/src/saved-games.test.ts apps/server/src/games.autopilot-blocked.test.ts apps/server/src/restart.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/challenge-routes.ts apps/server/src/challenge-routes.test.ts apps/server/src/saved-games.ts apps/server/src/saved-games.test.ts apps/server/src/app.ts
git commit -m "feat(server): 44 challenge — routes to check, create and list challenges, preview one, start or resume the single attempt (live room, saved game or a fresh room only when nothing was played), the results hidden until you played; expired or replaced challenges refuse, attempts cannot be deleted"
```

---

### Задача 5. Веб: «🏁 Виклик» у «Мої вікторини» (`challenge/ChallengeLaunch.tsx`)

**Files:**
- Create: `apps/web/src/challenge/ChallengeLaunch.tsx`, `apps/web/src/challenge/ChallengeLaunch.test.tsx`
- Modify: `apps/web/src/api.ts`, `apps/web/src/pages/Quizzes.tsx`, `apps/web/src/pages/Quizzes.test.tsx` (якщо немає — створити), `apps/web/src/styles.css` (після блоку `autopilot-card`), `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts` (створює `ADDED_CHALLENGE` і `ADDED_CHALLENGE_PLURALS` з **усіма** ключами з «Тексти (uk)» і вмикає обидва в перевірки), шість `locales/*.json`

**Interfaces:**
- Consumes: HTTP задачі 4; типи задачі 1.
- Produces:
```ts
// api.ts
export const getChallengeCheck = (quizId: string) => Promise<ApiData<ChallengeCheck>>;
export const createChallenge = (quizId: string) => Promise<ApiData<ChallengeMine>>;
export const listMyChallenges = () => Promise<ApiData<ChallengeMine[]>>;
export const getChallenge = (code: string) => Promise<ApiData<ChallengePreview>>;
export const startChallenge = (code: string) => Promise<ApiData<ChallengeAttemptStart>>;
export const getChallengeResults = (code: string) => Promise<ApiData<ChallengeResultRow[]>>;
// ChallengeLaunch.tsx
export function challengeUrl(code: string): string; // `${origin}/challenge/${code}`
export function ChallengeLaunch(props: { quiz: QuizSummary; onClose: () => void; onCreated: (mine: ChallengeMine) => void }): JSX.Element;
```

- [ ] **Step 1: Write the failing tests:**
  - `ChallengeLaunch.test.tsx` (`vi.mock('../api')`):
    - `shows what will be skipped` — `skipped` з раундом 2 «Правда про гравця», 3 запитаннями раунду 1 і `teams` → видно «Раунд 2 (…)», «3», «командна гра»; порожній `skipped` → «Пропускати нічого не треба.».
    - `an empty quiz cannot be challenged` — `empty: true` → текст `challengeEmpty`, кнопки «Створити виклик» немає.
    - `creates and shows the link` — «Створити виклик» → `createChallenge(quiz.id)` → поле з `…/challenge/<код>`, «Копіювати» пише в `navigator.clipboard` і показує «Скопійовано»; `onCreated` викликано.
    - `share only where it exists` — без `navigator.share` кнопки «Поділитися» немає; з ним — виклик з `{ title, text, url }`.
    - `a new challenge asks first` — `active` є → «Новий виклик»; `confirm` → false — запиту немає; true — `createChallenge`.
    - `Escape closes, but not over open help` — як в `AutopilotLaunch`.
  - `Quizzes.test.tsx`: `the challenge button and the active line` — `listMyChallenges` з викликом вікторини A → у її `li` «🏁 Виклик: лишилося 7 днів · зіграли 2 людини» і посилання «Таблиця» на `/challenge/<код>`; у вікторини B рядка немає; кнопка «🏁 Виклик» є в обох і відкриває діалог.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/challenge apps/web/src/pages/Quizzes.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Автор» і «Тексти (uk)» (діалог — порталом, розмітка й фокус як `AutopilotLaunch`, `HelpButton id="setting.challenge"` з'явиться в задачі 7 — до того без нього; переклади всіх ключів у шести локалях з тими самими плейсхолдерами, 🏁 — у всіх).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/challenge apps/web/src/pages apps/web/src/i18n.test.ts apps/web/src/source-scan.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/challenge apps/web/src/api.ts apps/web/src/pages/Quizzes.tsx apps/web/src/pages/Quizzes.test.tsx apps/web/src/styles.css apps/web/src/i18n.ts apps/web/src/i18n.test.ts apps/web/src/locales
git commit -m "feat(web): 44 challenge — Challenge in My quizzes: what will be skipped, create or replace, the link with copy and share, the active challenge line with days left, players and the results link; texts in seven languages"
```

---

### Задача 6. Веб: сторінка виклику й телефон у грі (`pages/ChallengePage.tsx`, `AuthorLobby`)

**Files:**
- Create: `apps/web/src/pages/ChallengePage.tsx`, `apps/web/src/pages/ChallengePage.test.tsx`
- Modify: `apps/web/src/AppRoutes.tsx` (`/challenge/:code` поруч із `/groups/join/:code`), `apps/web/src/AppRoutes.test.tsx`, `apps/web/src/screens/AuthorLobby.tsx` (проп `challenge?: { code: string; title: string }`), `apps/web/src/screens/PlayerScreen.tsx` (передати `view.author.challenge`; посилання на фініші), відповідні тести `screens/AuthorLobby.test.tsx` / `screens/PlayerScreen*.test.tsx` (звірити назви), `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `getChallenge`, `startChallenge`, `getChallengeResults` (задача 5); `savePlayer`, `saveAuthor`, `saveLastGame` (`storage.ts`); `loginFor`; `secondsText`, `formatDay`, `countText`, `challengeDaysLeft`.
- Produces: `export function ChallengePage(): JSX.Element;` розмітка — `main.app.challenge-page` > `h1.brand` «Виклик другові», `section.challenge-card`, `table.challenge-results` (`thead` з п'ятьма стовпцями, `tr.is-me` для свого рядка).

- [ ] **Step 1: Write the failing tests:**
  - `ChallengePage.test.tsx` (`vi.mock('../api')`, `vi.mock('../useAccount')`):
    - `a guest is asked to sign in` — `anonymous` → `challengeSignIn` і посилання «Увійти» на `loginFor('/challenge/<код>')`; `getChallenge` не викликано.
    - `a bad or unknown code` — `abc` → `challengeGone` без запиту; 404 → `challengeGone`.
    - `before playing: the card, no table` — `mine: 'none'`, `canSeeResults: false`, `played: 3` → назва, «від Олена», «лишилося 5 днів», «зіграли 3 людини», «Почати», «Таблицю видно після власної гри.», `getChallengeResults` не викликано.
    - `start goes to the game` — «Почати» → `startChallenge` → `savePlayer(code, token)`, `saveAuthor(code, { stageToken })`, `saveLastGame(code)`, перехід на `/play/<код кімнати>`; помилка `challenge_closed` → `role="alert"` з `err_challenge_closed`.
    - `return and done` — `mine: 'playing'` → «Продовжити»; `mine: 'done'` → «Ти вже зіграв цей виклик.» без кнопки, таблиця з рядками: місце, нік, «автор», «не завершено», бали, `secondsText(timeMs)`, `formatDay(at)`; свій рядок — `.is-me`.
    - `an ended challenge` — `active: false`, `mine: 'none'` → «Виклик завершено.» без кнопки.
  - `AuthorLobby` з `challenge` → «🏁 Виклик: Річки України», `challengeLobbyHint`, «Почати гру»; **немає** коду, QR, посилання на сцену, призів і панелі 12r. Без `challenge` — як досі.
  - `PlayerScreen` на `finished` з `view.author.challenge` → посилання «🏁 Таблиця виклику» на `/challenge/<код>`; без — немає.
  - `AppRoutes.test.tsx`: `/challenge/<код>` відкриває сторінку виклику.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/pages/ChallengePage.test.tsx apps/web/src/screens apps/web/src/AppRoutes.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Сторінка `/challenge/:code`» і «Телефон у грі» (CSS: `.challenge-results` на ≤ 420 px — дата під ніком у тій самій клітинці, нік `overflow-wrap: anywhere`, без нових кольорів).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/pages apps/web/src/screens apps/web/src/AppRoutes.test.tsx apps/web/src/i18n.test.ts apps/web/src/source-scan.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/pages/ChallengePage.tsx apps/web/src/pages/ChallengePage.test.tsx apps/web/src/AppRoutes.tsx apps/web/src/AppRoutes.test.tsx apps/web/src/screens apps/web/src/styles.css
git commit -m "feat(web): 44 challenge — the challenge page: sign in for guests, the card with days left and players, Start or Continue, the results table only after your own game; the phone lobby without code, QR or stage, and the results link at the end"
```

---

### Задача 7. Довідка автора: «Виклик другові» (`setting.challenge`)

**Files:**
- Modify: `apps/web/src/help/host-help.ts` (`'challenge'` в кінець `SETTING_HELP_KEYS`), `apps/web/src/help/help-uk.ts` (записи після `setting.questionBank.*`), `apps/web/src/help/__fixtures__/help-uk-golden.json`, `apps/web/src/locales/{en,pl,de,es,it,ar}.help.json`, `apps/web/src/challenge/ChallengeLaunch.tsx` (`HelpButton id="setting.challenge"` у шапці)
- Test: `apps/web/src/help/help-golden.test.ts`, `apps/web/src/help/host-help.test.ts` (наявні), `apps/web/src/challenge/ChallengeLaunch.test.tsx` (ⓘ)

**Тексти (uk):**
- `title`: «Виклик другові»
- `what`: «Посилання, за яким друзі проходять вашу вікторину самі, коли зручно, а потім порівнюють результати в одній таблиці.»
- `how.0`: «У «Мої вікторини» натисніть «🏁 Виклик» → «Створити виклик» і надішліть посилання. Воно діє 7 днів; правки вікторини після створення на виклик не впливають.»
- `how.1`: «Кожен грає один раз зі свого акаунта, сам, як у грі без ведучого. Закрив вкладку — те саме посилання поверне в ту саму гру.»
- `how.2`: «Запитання й раунди, яким потрібні інші гравці, пропускаються: опитування, хмара слів, «Думай як усі», «Шпигун», блеф, «Малюнок», «Правда про гравця», «Думай інакше», «Аукціон», команди, дуелі й крамниця дебафів. Що саме пропущено, вікно показує до створення.»
- `points.0`: «Таблицю (бали, при рівних — менший час відповідей) бачите ви й ті, хто вже зіграв. Хто не дограв до кінця терміну — у таблиці з поточним рахунком і позначкою «не завершено».»
- `tip.0`: «Ви теж можете зіграти свій виклик один раз — у таблиці буде позначка «автор». «Новий виклик» завершує попередній, але його таблиця лишається.»
- `limits.0`: «Досвід за гру нараховується за звичайними правилами — для гри наодинці його немає; досягнення й історія — як у грі без ведучого.»

- [ ] **Step 1: Write the failing test:** `ChallengeLaunch.test.tsx` — у шапці діалогу є ⓘ; клік відкриває запис із заголовком «Виклик другові». Golden-тест із новим ключем у `SETTING_HELP_KEYS` без записів — FAIL.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/help apps/web/src/challenge/ChallengeLaunch.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement:** записи uk, golden (той самий текст), переклади в шести `*.help.json` (ті самі ключі).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/help apps/web/src/i18n.test.ts apps/web/src/challenge && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/help apps/web/src/locales apps/web/src/challenge
git commit -m "docs(web): 44 challenge — the author help entry on the link, one solo attempt, what is skipped, who sees the results and XP, in seven languages"
```

---

### Задача 8. Наскрізні сценарії й кадри (`part44-challenge.e2e.ts`)

**Files:**
- Create: `apps/server/e2e/part44-challenge.e2e.ts`

Сценарії (`useE2eServer`; телефони 360×740, світла тема init-скриптом `quiz:theme`; вміст — річки й міста України, таймери 25–30 с, так/ні — і «так», і «ні»):

- `part 44: challenge — author creates a 7-day link, two accounts play alone (one interrupts and returns), shared results, no second attempt, guest sign-in, expiry, phone 360 px, light theme`:
  1. Автор «Олена» (`register(page, 'menu', …)`) створює через `POST /api/quizzes` «Річки 44»: класика (`single` «Яка річка найдовша в Україні?» → «Дніпро»; `boolean` «Дністер впадає в Чорне море?» → «так»; `poll` «Яка річка вам найближча?»; `boolean` «Десна — притока Дністра?» → «ні»), раунд `truth`, бліц (`text` «Як називається найвища гора України?» → «Говерла»).
  2. «Мої вікторини» → «🏁 Виклик» → діалог перелічує пропущене (раунд 2 «Правда про гравця», 1 запитання раунду 1) (кадр `p44-launch`, `expectNoSideScroll`) → «Створити виклик» → посилання видно; «Копіювати» (дозвіл `clipboard-write`) → «Скопійовано»; у списку — «🏁 Виклик: лишилося 7 днів · зіграли 0 людей».
  3. Гість (новий контекст) відкриває посилання → «Увійдіть, щоб прийняти виклик» (кадр `p44-guest`).
  4. «Тарас» реєструється, відкриває посилання → картка, «Таблицю видно після власної гри.», `GET …/results` → 403 (кадр `p44-card`) → «Почати» → `/play/<код>`: лобі без коду, QR і сцени, «🏁 Виклик: Річки 44» (кадр `p44-lobby`, `expectPhoneFit`) → «Почати гру» → перше запитання з текстом на телефоні; відповідає «Дніпро».
  5. Тарас закриває сторінку посеред другого запитання; відкриває посилання в **новому контексті** того самого акаунта → «Продовжити» → та сама гра (той самий код кімнати, рахунок > 0); дограває (опитування не з'являється, раунду «Правда» немає) → фініш → «🏁 Таблиця виклику» → таблиця з його рядком (кадр `p44-results`).
  6. Тарас знову «Почати»/`POST …/attempt` → 409, сторінка — «Ти вже зіграв цей виклик.»; спроба ввести код кімнати Тараса з іншого акаунта на `/play/<код>` — гра не знайдена.
  7. «Ірина» грає до кінця з гіршим рахунком → таблиця: Тарас 1-й, Ірина 2-а, у кожного свій рядок виділено; Олена бачить обох; сама Олена грає → рядок «автор».
  8. «Петро» стартує й кидає після першого запитання; e2e змінює `expires_at` на минуле (`db.update(challenge)` з `helpers/setup.ts`) → у Петра «Виклик завершено.», «Продовжити» немає, `POST …/attempt` → 409 `challenge_closed`; у таблиці Петро з поточним рахунком і «не завершено»; новий акаунт «Оксана» — без кнопки «Почати».
  9. Автор: «Новий виклик» на тій самій вікторині → старе посилання — «Виклик завершено.», таблиця старого відкривається Тарасу.
  10. Світла тема — клас, який ставить `applyThemeClass` (`apps/web/src/theme-mode.ts`), світлий на всіх кадрах; кадр таблиці з довгим ніком (20 символів) без бокового скролу.

- [ ] **Step 1: Write the scenarios.**
- [ ] **Step 2: Run** `pnpm build`, потім (після завершення збирання) `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 44"` з `E2E_SHOTS=1` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 3: Переглянути кадри:** діалог, картка, лобі й таблиця на 360 px без бокового скролу, довгі ніки переносяться, світла тема.
- [ ] **Step 4: Commit**
```bash
git add apps/server/e2e/part44-challenge.e2e.ts
git commit -m "test(e2e): part 44 — the challenge: the author creates a 7-day link with the skipped list, a guest is asked to sign in, two accounts play alone (one interrupts on one device and returns on another), shared results hidden until you played, no second attempt, expiry and replacement refuse, phone 360 px, light theme"
```

---

## Розбіжності зі специфікацією (рішення плану)

1. **`GAME_STATE_VERSION` не потрібен.** Позначка виклику — на кімнаті (`Room.challenge`) і в знімку кімнати як необов'язкове `SavedRoom.challenge?`; стан гри не змінюється. Відомий край: під час поступового розгортання старий процес, що підхопив би кімнату спроби, позначку проігнорує (кімната стала б звичайним автопілотом, у який можна ввійти за кодом). Ризик лише на хвилини деплою; питати власника не треба, але кажу.
2. **«Як автопілот: запитання, що потребують ведучого, пропускаються» — у коді автопілот майже нічого не пропускає, а перетворює** (вголос → телефон, ручна перевірка → ключ, жереб замість вибору ведучого). Виклик бере це перетворення як є, а пропускає лише те, що потребує **інших гравців**: опитування, хмару, «Думай як усі», «Шпигуна», блеф, «Малюнок», раунди «Правда про гравця», «Думай інакше» й «Аукціон», команди, дуелі зі ставками, крамницю дебафів; «100 до 1» лишається без зв'язку з хмарою (без власних рядків — пропускається). Блеф, «Малюнок» і «Аукціон» у специфікації не названі — додані, бо їхня суть у суперниках (блеф — бали за обдурених, малюнок вгадують інші, торг без суперника виграє будь-яка ставка). Власник може повернути будь-який — це один рядок у `CHALLENGE_SKIP_*`.
3. **Досвіду за виклик не буде.** «XP як для гри автопілота» за наявними правилами (`xp-rules.ts`: потрібно ≥ 3 акаунти в грі, `few_accounts`) дає одиночній грі 0 досвіду — так само, як автопілот наодинці. Досягнення й історія пишуться як для автопілота («Провів бот» в історії гравця). Якщо власник хоче досвід за виклики — це окреме правило, не в цьому плані; пункт довідки чесно це каже.
4. **Повернення до перерваної спроби — через наявне автозбереження.** Кімната спроби, де 30 хв нікого (`AUTOPILOT_EMPTY_MS`), зберігається (`saved_game`) і закривається; те саме посилання (і «Продовжити» в «Мої ігри») відкриває її точним продовженням з тим самим id. Якщо спроба не дійшла до першого запитання, автопілот її завершує (`end`) — така спроба зарахована з 0 балів і «не завершено»; лише спроба, закрита ще в **лобі** (без рядка гри), отримує нову кімнату з тим самим id. Збережену спробу не можна видалити (409), щоб не обійти «одну спробу».
5. **Гра, що йде в мить закінчення терміну, догравається.** «Продовжити, поки виклик активний» — це про нові токени й продовження збережених; живу кімнату за 7 діб ніхто не закриває, і її фінальний рахунок потрапляє в таблицю.
6. **«Час проходження» — сума часу відповідей** (`participant.totalTimeMs`, той самий показник, що розводить рівні бали в грі), а не годинник від старту до фінішу: так перерва й продовження не карають того, хто повертався.
7. **Таблиця й сторінка — лише з входом.** Гість бачить лише «Увійдіть, щоб прийняти виклик» (сторінка не робить запитів без сесії), як вступ у групу 12k; «зіграли N людей» бачить кожен акаунт із посиланням.
8. **Видалення вікторини не завершує виклику** — знімок самодостатній; виклик доживає свої 7 днів, таблиця лишається. Видалення акаунта гравця прибирає його спробу (каскад), тож він зникає з таблиці.
9. **Лобі спроби лишається** (кнопка «Почати гру» на телефоні), але без коду, QR, сцени, призів і «Продовжити попередню гру»: автостарт без підключеного телефона поставив би гру на паузу «нікого», а лобі не дає нічого, крім кнопки.
