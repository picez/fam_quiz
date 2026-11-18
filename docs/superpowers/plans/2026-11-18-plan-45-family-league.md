# План 45: сімейна ліга (38b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** `GameState` не змінюється взагалі: позначка «гра для групи» живе на рівні кімнати (`Room.league`) і в знімку кімнати (`SavedRoom.league?` — необов'язкове поле, як `challenge?`/`lobby?`), підсумок ліги гри — лише в пам'яті кімнати (`Room.leagueResult`, відновлюється з бази повтором рекордера). Нові поля зрізів (`PlayerView.league?`, `HostView.league?`) ставить сервер, рушій їх не знає. База — **одна адитивна міграція** `0039_family_league` (чотири нові таблиці).

> **Звірка з кодом.** План спирається на `main` 2026-11-18 (`07051931`, після плану 44):
> - групи (12k): таблиці `familyGroup` (`family_group`: `id`, `name`, `emoji`, …) і `groupMember` (`group_member`: первинний ключ `(group_id, user_id)`, `role 'owner' | 'member'`, `joined_at`) у `apps/server/src/db/schema.ts` ~704–733; `membership(db, groupId, userId): Promise<GroupRole | null>` (`apps/server/src/group-store.ts` ~110, лагодить групу без власника), `listGroups(db, userId)` (~144, `GroupCard { id, name, emoji, people, … }`), `profileCards(db, ids)` (~48, `Map<id, ProfileCard>`); маршрути — `apps/server/src/group-routes.ts` (`member(request, reply, need)` ~122: чужа й неіснуюча група — однаковий 404 `group_not_found`; ліміти `read` 120/хв, `write` 30/хв); типи — `packages/shared/src/groups.ts` (`GroupDetail`, `GroupCard`); веб — `apps/web/src/pages/GroupPage.tsx` (вкладки `TABS` `items`/`people`/`settings` у `?tab=`, `usePrivateData`, `ProfileSubpage`), `apps/web/src/pages/Groups.tsx`, `apps/web/src/groups/*`;
> - титули: **наявна система — один титул на акаунт** (`userTitle`, `user_title`: первинний ключ `user_id`, `text`, `game_id not null`, `expires_at` — `TITLE_MS` = 7 діб), пишеться лише з призу (`awardPrizes`, `apps/server/src/prizes.ts` ~259), новіший приз перекриває; `currentTitles` (~293) → `attachTitles` (`apps/server/src/titles.ts`) кладе в `room.titles` біля ніку; профіль — `showcaseOf(db, userId)` (~303) → `Showcase.title`; веб — `ProfileHeader` (`title` → `span.nick-title`) у `pages/Profile.tsx` ~64 і `pages/PublicProfile.tsx` ~83, `profile/Showcase.tsx` ~96. Довічного титулу «за місяць» ця система не вміщує (див. «Розбіжності», п. 2);
> - рекордер: `apps/server/src/recorder.ts` — `save(db, snapshot)` (~473) пише гру однією транзакцією (`writeGame` ~295: `participant` для гравців рушія й людей команд, `rank` лише у `finished`, `game.finishedAt` — `coalesce` першого фінішу); після запису — `awardGame` → `setNewAchievements`, `awardPrizes`, `creditGame`, `publishGameFeed`, кожне з множиною «вже зроблено» (`awarded`, `prized`, `credited`, `published`), яку `adopt`/`forget` скидають (~585–615); повтори — `retryMs`/`maxRetries`. Місця — `rankPlayers(state.players)` (`packages/engine/src/ranking.ts`: нічия = рівні `score` **і** `totalTimeMs`, наступне місце пропускається); люди команди — `teamMembers(state, teamId)`, `teamsOn(state)` (зразок — `placeHolders` у `apps/server/src/rooms/prizes.ts` ~15); акаунт людини — `room.playerUsers.get(person.id)`; «гра, що дає призи» — `finished && state.plays.length > 0`;
> - кімната: `Room` (`apps/server/src/rooms/manager.ts` ~214; `challenge: RoomChallenge | null` ~280, `newAchievements` лише в пам'яті), `SavedRoom` (~504, `SAVED_ROOM_VERSION = 1`, необов'язкові `prizes?`, `lobby?`, `challenge?`), `challengeOf(raw)` (~576) — зразок читання з бази, `open(...)` (~778), `snapshot(room)` (~826), `restore(saved)` (~850), `setLobby` (~952: `challenge` → `NOT_ALLOWED`, не лобі → `wrong_phase`, `commit` — щоб `RoomStore` записав), `setNewAchievements` (~1017) — зразок «злити й emit changed», `view(room, identity)` (~1475: `extra` для всіх ролей, гілки `player`/`stage`/`host`);
> - налаштування лобі ведучим: HTTP `GET/PUT /api/games/by-code/:code/lobby` (`apps/server/src/lobby-routes.ts`: `hostedRoom(code, request)` — кімната цього акаунта, `'restarting'` чи `null`; помилки менеджера → 503/404/409); веб — `screens/LobbyAccess.tsx` і `screens/PrizePlaces.tsx` (`HostScreen.tsx` ~1581–1583, у фазі `lobby`), автор автопілота — `screens/AuthorLobby.tsx` (`PrizePlaces` ~105, `solo` = спроба виклику — без панелей). Автопілот: `POST /api/games` з `autopilot: true` → `room.hostUserId` = автор, лобі автора — той самий `AuthorLobby` до «Почати гру»;
> - виклики (38a): `room.challenge !== null` — кімната спроби; у ній `setLobby`/`setPrizes` → `NOT_ALLOWED`, `AuthorLobby` ховає панелі (`solo`);
> - київський час: `kyivDay(date): 'YYYY-MM-DD'` (`apps/server/src/xp-rules.ts` ~73, із запасним `Europe/Kiev`); веб — `formatDay` / `dropYearMark` (`apps/web/src/format.ts` ~317–338);
> - фінальні екрани: `PlayerScreen.tsx` ~1860 (`phase === 'finished'`: `gameOver`, `place`, посилання виклику, `ResultImageButton`, призи), `HostScreen.tsx` ~1485 (`Standings`, `PrizeResults`, …);
> - міграції: `apps/server/drizzle/00NN_<name>.sql` + `meta/_journal.json` + `meta/00NN_snapshot.json` (`pnpm --filter @quiz/server exec drizzle-kit generate --name <name>`), перший рядок SQL — коментар українською (як `0038_challenges.sql`); остання — `0038_challenges`; тест — `apps/server/src/db/schema.test.ts` з `createTestDbUpTo('<тег>')` → `migrateRest()`; `db-backup.ts` бере всі таблиці з `information_schema`;
> - тести-зразки: `apps/server/src/recorder.prizes.test.ts` (рекордер з кімнатою до фінішу), `apps/server/src/lobby-routes.test.ts`, `apps/server/src/group-routes.test.ts`, `apps/server/src/profile-routes.test.ts`, `apps/server/src/rooms/manager.autopilot.test.ts` (`FakeScheduler`); фікстури — `@quiz/engine/testing` (`single`, `bool`, `makeQuiz`, …);
> - i18n: uk — `apps/web/src/i18n.ts`, шість локалей `apps/web/src/locales/{en,pl,de,es,it,ar}.json`; останні списки — `ADDED_CHALLENGE`/`ADDED_CHALLENGE_PLURALS` (`apps/web/src/i18n.test.ts` ~194–195, перевірка локалей ~421–425, умова `adds no uk keys beyond the agreed list` ~510); `countText(key, n, vars)` з `_one/_few/_many`; `errorText(code)` → `err_<code>` (`err_wrong_phase`, `err_not_allowed`, `err_group_not_found`, `err_restarting` уже є); `source-scan.test.ts`; довідка — `help/host-help.ts` (`SETTING_HELP_KEYS`, останній `'challenge'`), `help/help-uk.ts` (`setting.challenge.*`), `help/__fixtures__/help-uk-golden.json`, `locales/*.help.json`, `HelpButton({ id })`;
> - e2e: `apps/server/e2e/helpers/setup.ts` (`useE2eServer`, `db` — та сама база, що в сервера), `helpers/common.ts` (`open`, `register`, `expectNoSideScroll`, `expectPhoneFit`), зразки — `part12k-groups.e2e.ts` (групи, вступ за кодом), `part44-challenge.e2e.ts` (автопілот, світла тема `quiz:theme`).
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

**Мета:** ведучий (чи автор автопілота) у лобі позначає «Гра для групи: <група>»; коли така гра завершується, члени групи, що грали зі свого акаунта, отримують бали ліги 10 / 7 / 5 / 3 / 1 за місця серед членів групи (від 3 членів), бачать «Ліга «<група>»: +N балів» на фінальному екрані; на сторінці групи — місячна таблиця (київський час) і «Зала чемпіонів»; переможець місяця отримує довічний титул «Чемпіон ліги «<група>» — <місяць рік>» у профілі.

**Архітектура:** чисті правила — `packages/shared/src/league.ts` (місця, бали, порядок таблиці, переможці). Сервер: таблиці `league_game`, `league_point`, `league_month`, `league_champion`; сховище `apps/server/src/league-store.ts`. Позначка — `Room.league` (лише в лобі, `PUT /api/games/by-code/:code/league`); бали пише рекордер **у тій самій транзакції `save`, що й фініш гри** (`league_game` — разовий запис «гру враховано», тож повтор і перезапуск нічого не дублюють), потім кладе підсумок у кімнату. Підсумок місяця — ліниво при першому зверненні (таблиця групи, профіль) після кінця місяця, разовим рядком `league_month`. Клієнт: `league/LeaguePick.tsx` у лобі, рядки на фінальних екранах, вкладка «Ліга» на сторінці групи, `profile/LeagueTitles.tsx`.

**Технології:** TypeScript, zod, Fastify + drizzle (Postgres, PGlite у тестах), socket.io, React 19 + Vite + Testing Library (jsdom), Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-18-family-league-design.md` (38b) — уся.

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22** (`packages/engine/src/restore.ts`). `GameState` не змінюється; нове — лише необов'язкові поля поза станом (`SavedRoom.league?`, `PlayerView.league?`, `HostView.league?`). Якщо виконавцю здасться, що потрібне інше, — **зупинитися й спитати контролера**.
- **Міграція — лише додавання:** одна нова `0039_family_league` з чотирма `CREATE TABLE`, їхніми ключами й індексами; жодного `ALTER`/`DROP` наявних таблиць.
- Усі тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`. Нові uk-ключі — у нових списках `ADDED_LEAGUE` і `ADDED_LEAGUE_PLURALS` у `apps/web/src/i18n.test.ts`; обидва — в умові `adds no uk keys beyond the agreed list` і в перевірці наявності в усіх локалях (як `ADDED_CHALLENGE`). ru немає. Довідка — `help-uk.ts` + golden + шість `*.help.json`. Звертання — «ти», без роду, де можна.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`); нових файлів у `ALLOWED` не треба.
- **Приватність:** таблицю ліги, місяці й «Залу чемпіонів» бачать **лише члени групи** (чужий і неіснуюча група — той самий 404 `group_not_found`); у публічному профілі — **лише сам титул** (назва групи й місяць), без посилання на групу, балів чи таблиці. Вибір групи в лобі показує ведучому лише його групи.
- **Нічого, пов'язаного з росією**, — у фікстурах, назвах груп, вікторин і тестах.
- Таймери у фікстурах e2e ≥ 25 с; правильні так/ні у фікстурах — і «так», і «ні».
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|engine|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів; ніколи два запуски vitest водночас).
- Правки файлів — лише інструментами редагування; **не через python** (`python3` тут — заглушка, що нічого не робить).
- e2e: нова частина 45 у `apps/server/e2e`; спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 45"`; кадри — з `E2E_SHOTS=1`. Телефон 360 px і світла тема.

## Рішення плану (там, де специфікація мовчить)

**Позначка гри**
- `RoomLeague = { groupId: string; groupName: string }` (назва — знімок на мить вибору, для рядків у грі). `Room.league: RoomLeague | null`, у знімку кімнати — `league?` (читання — `leagueOf(raw)`: лише об'єкт з рядками `groupId` (UUID) і `groupName`, інакше `null`).
- `manager.setLeague(room, league: RoomLeague | null): AckResult`: `!alive` → як `setLobby`; `room.challenge !== null` → `NOT_ALLOWED`; `phase !== 'lobby'` → `wrong_phase`; інакше пише й `commit(room, room.state)`. Після старту змінити не можна — це й є «лише лобі».
- HTTP (у `lobby-routes.ts`, той самий `hostedRoom`, ліміт `perUser('lobby', 30)`):
  - `GET /api/games/by-code/:code/league` → `LeaguePickInfo = { groupId: string | null; groups: { id; name; emoji; people }[] }` — групи ведучого з `listGroups`; кімната виклику → 404 `game_not_found` (панелі немає).
  - `PUT …/league` з `leaguePickSchema = z.object({ groupId: z.string().uuid().nullable() }).strict()` → `membership(db, groupId, user.id) === null` → 404 `group_not_found`; назва — з `family_group`; далі `setLeague` (помилки — як у `PUT …/lobby`); відповідь — `LeaguePickInfo`.
- 12r («Продовжити попередню гру», нова кімната в лобі) — позначку можна поставити знову; точне продовження збереженої гри (не лобі) і «Зберегти й продовжити пізніше» позначку **не переносять** (див. «Розбіжності», п. 4).

**Хто й скільки отримує** (`leagueOutcome` у `packages/shared/src/league.ts`, чиста):
- Вхід: `entries: { rank: number; userIds: string[] }[]` — рядки `rankPlayers(state.players)` з акаунтами людей (соло — `[playerUsers.get(id)]`, команда — акаунти `teamMembers(state, id)`; гості відкинуті), і `members: ReadonlySet<string>` — члени групи на мить фінішу.
- Рядки з принаймні одним членом групи — «рядки ліги»; місце рядка ліги = `1 + кількість рядків ліги з меншим rank` (нічия гри → однакове місце, наступне пропускається). Член, що трапився у двох рядках, бере краще місце (один раз).
- Бали — `LEAGUE_POINTS = [10, 7, 5, 3, 1]` за місце 1–5, далі 0 (гра й так іде в «ігор»).
- `counted = членів ≥ LEAGUE_MIN_MEMBERS (3) && рядків ліги ≥ 2` (команда з усіма членами в одній — не ліга, див. «Розбіжності», п. 3). `counted: false` → рядків балів немає.
- Рахується лише `phase === 'finished' && state.plays.length > 0` і `room.challenge === null`; перервані (`aborted`), збережені й незавершені — ні.

**Запис** (у `save` рекордера, `apps/server/src/recorder.ts`):
- Таблиця `league_game`: `game_id uuid pk` (без зовнішнього ключа — видалення гри з історії балів не змінює), `group_id uuid not null` → `family_group.id` `on delete cascade`, `month text not null` (`'YYYY-MM'` за Києвом від `game.finishedAt` з бази), `members integer not null`, `counted boolean not null`, `at`. Індекс `league_game_group_idx (group_id, month)`.
- Таблиця `league_point`: `game_id uuid` (без FK), `user_id text` → `user.id` `cascade`, **первинний ключ `(game_id, user_id)`**, `group_id uuid` → `family_group.id` `cascade`, `month text`, `place integer`, `points integer`, `nickname text` (нік у грі, для рядків «+N» після перезапуску), `at`. Індекси `league_point_group_idx (group_id, month)`, `league_point_user_idx (user_id)`.
- `recordLeague(tx, input)`: група ще існує? (ні → нічого, `null` — інакше FK зламав би всю транзакцію гри); `insert league_game … on conflict do nothing returning` — **лише коли вставлено** рахуємо `leagueOutcome` і пишемо `league_point`; інакше нічого не перераховуємо. Потім читаємо `league_game` + `league_point` гри → `LeagueGameResult = { counted: boolean; rows: { userId; nickname; points }[] }`. Тож повтор рекордера й кімната, піднята після перезапуску вже `finished`, дають той самий підсумок.
- Після транзакції рекордер (`!leagued.has(room.id)`, множина скидається в `adopt`/`forget`, як `awarded`) кладе підсумок у кімнату: `manager.setLeagueResult(room, result)`.

**Таблиця місяця** (`GET /api/groups/:id/league?month=YYYY-MM`, у `group-routes.ts` через `member()`; `month` не за `LEAGUE_MONTH` чи з майбутнього → поточний):
- `LeagueTable = { month; current: boolean; months: string[]; rows: LeagueRow[]; champions: LeagueChampionMonth[] }`; `months` — поточний місяць першим, далі місяці з `league_game` групи спадно; `champions` — «Зала чемпіонів», усі підсумовані місяці групи спадно: `{ month, users: ProfileCard[] }`.
- `LeagueRow = { place; user: ProfileCard; points; games; firsts; former: boolean }` з `league_point` за `(group_id, month)`: сума балів, кількість ігор, кількість `place === 1`. Поточний місяць — лише теперішні члени групи (хто вийшов — зникає); минулі — усі (`former: true` для тих, кого вже немає в групі). Порядок `leagueOrder`: бали ↓, перші місця ↓, ігри ↓, далі нік; місце — спільне для рівної трійки (бали, перші, ігри).
- Рядки лише для тих, хто має ≥ 1 врахованої гри місяця. Ігор, що не рахувались (`counted: false`), у «ігор» немає.

**Підсумок місяця** (`settleLeague(db, groupId, now)`, ліниво):
- Таблиця `league_month`: `group_id` → `family_group` `cascade`, `month`, **первинний ключ `(group_id, month)`**, `settled_at`. Таблиця `league_champion`: `id uuid pk`, `group_id uuid` → `family_group` **`on delete set null`** (титул переживає видалення групи), `group_name text not null` (назва на мить підсумку), `month text not null`, `user_id` → `user` `cascade`, `points integer`; унікальний `(group_id, month, user_id)`, індекс `league_champion_user_idx (user_id)`.
- Для кожного `month < kyivMonth(now)` з `league_point` групи без рядка `league_month`: у транзакції `insert league_month … on conflict do nothing returning`; вставлено → переможці `monthWinners(rows)` (усі рівні за `leagueOrder`-трійкою на першому місці) → `league_champion`. Більше не змінюється.
- Хто кличе: `GET …/league` (своя група) і `leagueTitlesOf(db, userId, now)` (групи, де в акаунта є бали за минулі місяці без підсумку) — тож титул з'являється в профілі, навіть якщо сторінку групи ніхто не відкривав. Фонового таймера немає.

**Титул і профіль**
- `LeagueTitle = { group: string; month: string }`; `OwnProfile.leagueTitles` і `PublicProfile.leagueTitles` — з `league_champion` акаунта, найновіші першими, не більше `LEAGUE_TITLES_SHOWN = 12`. Текст — на клієнті: `t('leagueChampionTitle', { group, month: monthText(month) })` → «🏆 Чемпіон ліги «Родина» — листопад 2026». `monthText('2026-11')` — `Intl.DateTimeFormat(intlTag(), { month: 'long', year: 'numeric', timeZone: 'UTC' })` від 15-го числа + `dropYearMark`.
- Показ — окремий список `ul.league-titles` (`profile/LeagueTitles.tsx`) під шапкою в `Profile.tsx` і `PublicProfile.tsx`; наявний титул призу біля ніку не чіпається.

**Зрізи гри**
- `PlayerView.league?: { group: string; points?: number; tooFew?: true }` — є, коли `room.league !== null` (у лобі — «🏆 Гра для ліги «<група>»»); `points` — свій підсумок (`result.rows` за `playerUsers.get(playerId)`), `tooFew` — лише автору автопілота (`view.author !== null`) при `counted: false`.
- `HostView.league?: { group: string; rows?: { nickname: string; points: number }[]; tooFew?: true }` — `rows` (бали ↓) або `tooFew` після підсумку.
- Тексти (uk) — `ADDED_LEAGUE`:
`leaguePickTitle: '🏆 Сімейна ліга'`, `leaguePickLabel: 'Гра для групи'`, `leaguePickNone: '— не для ліги'`, `leaguePickHint: 'Члени групи, що грають зі своїх акаунтів, отримають бали ліги 10 / 7 / 5 / 3 / 1. Гра рахується від 3 членів групи. Після старту змінити не можна.'`, `leaguePickNoGroups: 'Ти ще не в жодній групі — лігу можна вести лише для своєї групи.'`, `leaguePickSaved: 'Збережено'`, `leagueLobbyMark: '🏆 Гра для ліги «{group}»'`, `leagueTooFew: 'Для ліги замало учасників групи'`, `leagueHostTitle: 'Ліга «{group}»'`, `groupTabLeague: 'Ліга'`, `leagueMonthLabel: 'Місяць'`, `leagueCurrentMonth: '{month} (поточний)'`, `leagueEmpty: 'Цього місяця ще не було ігор для ліги.'`, `leaguePlace: 'Місце'`, `leaguePlayer: 'Учасник'`, `leaguePoints: 'Бали'`, `leagueGames: 'Ігор'`, `leagueFirsts: 'Перших місць'`, `leagueFormer: 'вже не в групі'`, `leagueRules: 'Бали 10 / 7 / 5 / 3 / 1 за 1–5 місця серед членів групи в грі; рахуються ігри від 3 членів групи. Переможець місяця — найбільше балів, далі перших місць, далі ігор.'`, `leagueHall: 'Зала чемпіонів'`, `leagueHallEmpty: 'Чемпіонів ще немає — перший з'явиться, щойно скінчиться місяць.'`, `leagueChampionTitle: '🏆 Чемпіон ліги «{group}» — {month}'`, `leagueTitlesHeading: 'Титули ліги'`.
`ADDED_LEAGUE_PLURALS`: `leagueGained_one/_few/_many: 'Ліга «{group}»: +{count} бал' / 'Ліга «{group}»: +{count} бали' / 'Ліга «{group}»: +{count} балів'`.

## Порядок збирання

- Залежності: 1 — незалежна; 2 ← 1; 3 ← 1; 4 ← 2, 3; 5 ← 2; 6 ← 3, 4; 7 ← 5, 6 (списки i18n); 8 ← 6; 9 — остання.
- Кожна задача лишає `pnpm typecheck` зеленим; вибір групи з'являється в задачі 6, таблиця — в задачі 7.

## Фокус рев'ю

1. **Повтор і перезапуск.** Рекордер записав фініш, упав на `awardPrizes` і повторює; сервер перезапустився з кімнатою вже `finished`; кімнату, піднято вдруге — бали ліги ті самі, без подвоєння (`league_game` — разовий), рядок «+N» той самий; гру видалено з історії — таблиця не змінилась. Задачі 2, 4.
2. **Група зникла чи змінилась посеред гри.** Групу видалено між позначкою й фінішем — гра записується як звичайна (без балів, без помилки транзакції й без нескінченних повторів); ведучий вийшов із групи — гра все одно рахується за членами на мить фінішу; член вийшов після фінішу — його бали лишаються в минулих місяцях, з поточного рядок зникає. Задачі 2, 4, 5.
3. **Межі рахунку.** 2 члени + гості — «Для ліги замало учасників групи», балів немає; 3 члени в одній команді — так само; нічия гри на 1-му — обидва по 10, наступний — 3-є місце (5 балів); член 6-м — 0 балів, але гра в «ігор»; гість і не-член не займають місця; перервана й збережена гра — нічого. Задачі 1, 4.
4. **Межа місяця.** Гра, що фінішувала о 23:30 31-го за Києвом (21:30 UTC), — у цьому місяці; о 00:10 1-го за Києвом (22:10 UTC попереднього дня) — у наступному; підсумок — лише після кінця місяця за Києвом, один раз, рівні переможці — усі з титулом; переможець, що вже вийшов із групи, — теж чемпіон. Задачі 2, 5.
5. **Підглядання.** Таблиця, місяці й зала — 404 чужому й гостю 401; у публічному профілі — лише «🏆 Чемпіон ліги «…» — …», без id групи; `GET …/league` чужої кімнати чи кімнати виклику — 404; `PUT` з чужою групою — 404 `group_not_found`; після старту — 409 `wrong_phase`; на 360 px таблиця з довгими ніками й вибір групи без бокового скролу у світлій темі. Задачі 3, 5–7, 9.

---

### Задача 1. Спільне: правила ліги й типи (`packages/shared/src/league.ts`)

**Files:**
- Create: `packages/shared/src/league.ts`, `packages/shared/src/league.test.ts`
- Modify: `packages/shared/src/index.ts` (`export * from './league';`), `packages/shared/src/profile.ts` (`leagueTitles: LeagueTitle[]` в `OwnProfile` і `PublicProfile`), `packages/shared/src/views.ts` (`PlayerView.league?`, `HostView.league?` — за «Зрізи гри»; коментар «ставить сервер, рушій ключа не ставить»)

**Interfaces (Produces):**
```ts
export const LEAGUE_POINTS = [10, 7, 5, 3, 1] as const;
export const LEAGUE_MIN_MEMBERS = 3;
export const LEAGUE_TITLES_SHOWN = 12;
export const LEAGUE_MONTH: RegExp; // /^\d{4}-(0[1-9]|1[0-2])$/
export const leaguePickSchema: z.ZodType<{ groupId: string | null }>; // strict, uuid чи null
export interface LeagueEntry { rank: number; userIds: string[] }
export interface LeagueOutcome { counted: boolean; members: number; rows: { userId: string; place: number; points: number }[] }
export function leagueOutcome(entries: readonly LeagueEntry[], members: ReadonlySet<string>): LeagueOutcome;
export interface LeagueTotals { userId: string; nickname: string; points: number; games: number; firsts: number }
export function leagueOrder(a: LeagueTotals, b: LeagueTotals): number; // бали ↓, перші ↓, ігри ↓, нік (localeCompare)
export function rankLeague<T extends LeagueTotals>(rows: readonly T[]): (T & { place: number })[]; // спільне місце для рівної трійки
export function monthWinners<T extends LeagueTotals>(rows: readonly T[]): T[]; // [] для порожнього
export function previousMonth(month: string): string; // '2026-01' → '2025-12'
export interface LeaguePickInfo { groupId: string | null; groups: { id: string; name: string; emoji: GroupEmoji; people: number }[] }
export interface LeagueRow { place: number; user: ProfileCard; points: number; games: number; firsts: number; former: boolean }
export interface LeagueChampionMonth { month: string; users: ProfileCard[] }
export interface LeagueTable { month: string; current: boolean; months: string[]; rows: LeagueRow[]; champions: LeagueChampionMonth[] }
export interface LeagueTitle { group: string; month: string }
export interface PlayerLeagueView { group: string; points?: number; tooFew?: true }
export interface HostLeagueView { group: string; rows?: { nickname: string; points: number }[]; tooFew?: true }
```

- [ ] **Step 1: Write the failing tests** (`league.test.ts`; id акаунтів — `'u1'…'u9'`):
  - `places among members, guests and outsiders take no place` — entries `[{1,['x']},{2,['u1']},{3,[]},{4,['u2']},{5,['u3']}]`, members `{u1,u2,u3}` → `counted: true`, `members: 3`, rows `u1` 1/10, `u2` 2/7, `u3` 3/5.
  - `a tie shares the place and skips the next` — ranks `1,1,3` для `u1,u2,u3` → 1/10, 1/10, 3/5; ranks `1,2,2,4` для чотирьох → 10, 7, 7, 3.
  - `sixth and lower get zero but still count` — сім членів з різними rank → бали `10,7,5,3,1,0,0`, усі сім у `rows`.
  - `teams: members get their team's place among teams with members` — `[{1,['u1','x']},{2,['g']},{3,['u2','u3']}]` (`g` — не член) → `u1` 1/10, `u2` і `u3` 2/7.
  - `too few` — 2 члени + 3 не-члени → `counted: false`, `rows: []`, `members: 2`; 3 члени в одній команді (одна entry) → `counted: false`.
  - `one person in two entries takes the better place once` — `u1` в entries з rank 1 і 3 → один рядок, place 1.
  - `table order and shared places` — `rankLeague` з (20,2,3), (20,2,3), (20,1,4), (15,…) → місця 1, 1, 3, 4; `monthWinners` повертає обидва перших; рівні бали, але більше перших → лише він; рівні бали й перші, більше ігор → лише він; `monthWinners([])` = `[]`.
  - `months` — `LEAGUE_MONTH` приймає `'2026-11'`, відкидає `'2026-13'`, `'2026-1'`, `'26-11'`; `previousMonth('2026-01')` = `'2025-12'`, `previousMonth('2026-11')` = `'2026-10'`; `leaguePickSchema` — `null` і UUID так, `'abc'` і зайве поле — ні.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/league.test.ts`. Expected: FAIL (модуля немає).
- [ ] **Step 3: Implement** за Interfaces і «Хто й скільки отримує». `leagueTitles` у профілях — обов'язкове поле; сервер заповнить у задачі 5 (до того — `[]` у `ownProfile`/`publicProfile`, щоб typecheck був зелений).
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared/src apps/server/src/profiles.ts
git commit -m "feat(shared): 45 family league — 10/7/5/3/1 points for places among group members (ties share, teams give their place, guests take none), at least 3 members on two rows, the month table order and winners, the API and view types"
```

---

### Задача 2. Сервер: таблиці ліги й сховище (`0039_family_league`, `league-store.ts`)

**Files:**
- Modify: `apps/server/src/db/schema.ts` (таблиці `leagueGame`, `leaguePoint`, `leagueMonth`, `leagueChampion` у кінці), `apps/server/src/db/schema.test.ts` (новий `describe('family league (38b)')`)
- Create: `apps/server/drizzle/0039_family_league.sql` + `meta/0039_snapshot.json` + запис у `meta/_journal.json` (`pnpm --filter @quiz/server exec drizzle-kit generate --name family_league`; першим рядком SQL — `-- Сімейна ліга (план 45): враховані ігри, бали членів групи, підсумовані місяці й чемпіони.`), `apps/server/src/league-store.ts`, `apps/server/src/league-store.test.ts`

**Interfaces:**
- Consumes: `leagueOutcome`, `rankLeague`, `monthWinners`, `LEAGUE_TITLES_SHOWN`, типи (задача 1); `kyivDay` (`xp-rules.ts`), `profileCards` (`group-store.ts`).
- Produces:
```ts
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export function kyivMonth(date: Date): string; // kyivDay(date).slice(0, 7)
export interface LeagueRecordInput { gameId: string; groupId: string; entries: LeagueEntry[]; nicknames: Map<string, string> /* userId → нік у грі */ }
export interface LeagueGameResult { counted: boolean; rows: { userId: string; nickname: string; points: number }[] }
export async function recordLeague(tx: Db | Tx, input: LeagueRecordInput): Promise<LeagueGameResult | null>; // null — групи вже немає
export async function leagueResultOf(db: Db | Tx, gameId: string): Promise<LeagueGameResult | null>;
export async function settleLeague(db: Db, groupId: string, now: Date): Promise<void>;
export async function leagueTable(db: Db, groupId: string, month: string | null, now: Date): Promise<LeagueTable>; // спершу settleLeague
export async function leagueTitlesOf(db: Db, userId: string, now: Date): Promise<LeagueTitle[]>;
```

- [ ] **Step 1: Write the failing tests:**
  - `schema.test.ts`: `migration 0039 lays the league tables over an older database, old data stays` (`createTestDbUpTo('0038_challenges')`, рядки `family_group`/`group_member`/`game` цілі, нові таблиці порожні); `one league row per game and one point row per account in a game` — друга вставка `league_game` з тим самим `game_id` і `league_point` з тим самим `(game_id, user_id)` → `rejects`; видалення групи → `league_game`, `league_point`, `league_month` каскадом, `league_champion` лишається з `group_id null`; видалення акаунта → його `league_point` і `league_champion` зникають; видалення рядка `game` — `league_point` лишається.
  - `league-store.test.ts` (`createTestDb()`, група з членами — через `createGroup` і вставку `group_member`):
    - `kyivMonth` — `2026-10-31T21:30:00Z` (23:30 за Києвом, UTC+2 після переходу 25.10) → `'2026-10'`; `2026-10-31T22:10:00Z` → `'2026-11'`; `2026-03-31T20:30:00Z` (UTC+3, 23:30) → `'2026-03'`, `2026-03-31T21:10:00Z` → `'2026-04'`.
    - `records a counted game once` — рядок `game` з `finishedAt`; `recordLeague` з трьома членами → `league_game.counted` true, три `league_point` 10/7/5, місяць за `finishedAt`; другий виклик з іншими `entries` → той самий результат, рядків не додалось.
    - `a game with too few members is remembered as not counted` — 2 члени → `counted: false`, `rows: []`, `league_point` порожня; повтор не перераховує, навіть якщо третій тим часом вступив.
    - `a deleted group records nothing` — групу видалено → `null`, рядків немає, помилки немає.
    - `the month table` — ігри у двох місяцях, член вийшов: поточний місяць — без нього; минулий — з ним і `former: true`; `games` і `firsts` правильні; місця спільні для рівної трійки; `months` — поточний першим, далі спадно; `month` з майбутнього чи `'bad'` → поточний.
    - `settles a past month once, ties all win` — дані за минулий місяць з рівними лідерами → після `leagueTable(..., now)` два `league_champion` з `group_name` = назва групи; перейменування групи й повторне звернення — нічого не змінює; поточний місяць не підсумовується; місяць без ігор — без рядка.
    - `titles reach the profile without opening the group` — `leagueTitlesOf(db, winner, now)` сам підсумовує й повертає `[{ group, month }]`, найновіші першими, не більше 12; після видалення групи титул лишається.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/league-store.test.ts apps/server/src/db/schema.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** схему за «Запис» і «Підсумок місяця», згенерувати міграцію, переглянути SQL руками (лише `CREATE TABLE`, `ADD CONSTRAINT … FOREIGN KEY` нових таблиць, `CREATE [UNIQUE] INDEX`), потім `league-store.ts` (`recordLeague`: `select` групи → `insert league_game … onConflictDoNothing().returning()` → лише при вставці `leagueOutcome` і `league_point`; місяць — `kyivMonth(game.finishedAt)` з рядка `game` у тій самій транзакції, без рядка — `kyivMonth(now)`).
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/league-store.test.ts apps/server/src/db/schema.test.ts apps/server/src/db-backup.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/db/schema.ts apps/server/src/db/schema.test.ts apps/server/drizzle apps/server/src/league-store.ts apps/server/src/league-store.test.ts
git commit -m "feat(server): 45 family league — migration 0039 adds counted games, members' points, settled months and champions; the store records a game once, builds the Kyiv-month table and settles finished months lazily, ties all win"
```

---

### Задача 3. Сервер: позначка кімнати й вибір групи (`Room.league`, `lobby-routes.ts`)

**Files:**
- Modify: `apps/server/src/rooms/manager.ts` (`RoomLeague`, `Room.league`, `Room.leagueResult`, `SavedRoom.league?`, `leagueOf`, `open`/`snapshot`/`restore`, `setLeague`, `setLeagueResult`, `view` — поля `league`), `apps/server/src/lobby-routes.ts` (`GET/PUT /api/games/by-code/:code/league`)
- Create: `apps/server/src/rooms/manager.league.test.ts`, `apps/server/src/league-routes.test.ts` (маршрути лобі, як `lobby-routes.test.ts`)

**Interfaces:**
- Consumes: `leaguePickSchema`, `LeaguePickInfo`, `PlayerLeagueView`, `HostLeagueView` (задача 1); `LeagueGameResult` (тип з задачі 2); `listGroups`, `membership`.
- Produces:
```ts
export interface RoomLeague { groupId: string; groupName: string }
// Room: league: RoomLeague | null — у знімок; leagueResult: LeagueGameResult | null — лише в пам'яті, заповнює рекордер
setLeague(room: Room, league: RoomLeague | null): AckResult;
setLeagueResult(room: Room, result: LeagueGameResult): void; // emit changed, якщо змінилось
```

- [ ] **Step 1: Write the failing tests:**
  - `manager.league.test.ts`: `the host marks the lobby for a group` — `setLeague` у лобі → `room.league`; гравцеві-учаснику зріз має `league: { group }` без `points`; пульт — `league: { group }`; `null` знімає (ключа немає). `not after the start` — після `host:start` → `wrong_phase`. `not in a challenge room` → `not_allowed`. `survives a restart` — `snapshot` → `restore` → позначка на місці; зіпсоване `league` у знімку (`{ groupId: 5 }`) → `null`, кімната встає. `the result goes to the views` — `setLeagueResult` з `{ counted: true, rows: [u1 10, u2 7, u3 5] }`: гравець з акаунтом `u2` — `points: 7`; гість — без `points`; пульт — `rows` за балами ↓; `{ counted: false }` → пульт `tooFew: true`, автор автопілота (`createAutopilot`) — `tooFew: true`, звичайний гравець — лише `group`.
  - `league-routes.test.ts` (`buildApp({ db: await createTestDb(), auth: TEST_AUTH })`, `signUp`): `GET` віддає групи ведучого й `groupId: null`; `PUT` своєї групи → 200 і `groupId`; чужої групи → 404 `group_not_found`; невірне тіло → 400; чужа кімната й гість → 404 `game_not_found`; після старту → 409 `wrong_phase`; кімната виклику → 404 на `GET`, 409 `not_allowed` на `PUT`; автор автопілота (`POST /api/games` з `autopilot: true`) може позначити.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/rooms/manager.league.test.ts apps/server/src/league-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Позначка гри» і «Зрізи гри» (поля в `view` — у `extra` для `player` і `host`, сцени не стосується; `league` лише коли `room.league !== null`).
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/rooms apps/server/src/league-routes.test.ts apps/server/src/lobby-routes.test.ts apps/server/src/challenge-routes.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/rooms/manager.ts apps/server/src/rooms/manager.league.test.ts apps/server/src/lobby-routes.ts apps/server/src/league-routes.test.ts
git commit -m "feat(server): 45 family league — the host or the autopilot author marks the lobby «for group X» among their own groups, locked after the start, never in a challenge room; the mark survives restarts and the phone and the host see the league line"
```

---

### Задача 4. Сервер: бали ліги в записі фінішу (`recorder.ts`)

**Files:**
- Modify: `apps/server/src/recorder.ts` (`Snapshot.league: RoomLeague | null`; `save` повертає `LeagueGameResult | null`; `recordLeague` у транзакції після `writeGame` при `finished`; множина `leagued`; `manager.setLeagueResult`), `apps/server/src/rooms/prizes.ts` (`leagueEntries(room): LeagueEntry[]` поруч із `placeHolders` — той самий розбір соло/команд)
- Create: `apps/server/src/recorder.league.test.ts`

**Interfaces:**
- Consumes: `recordLeague`, `leagueResultOf` (задача 2); `Room.league`, `setLeagueResult` (задача 3).
- Produces: `export function leagueEntries(room: Room): LeagueEntry[]` — усі рядки `rankPlayers(state.players)` з акаунтами людей.

- [ ] **Step 1: Write the failing tests** (`recorder.league.test.ts`, зразок — `recorder.prizes.test.ts`; кімната ведучого-члена групи, гравці — акаунти):
  - `a finished league game writes points with the game and tells the room` — три члени й гість дограють → `league_point` 10/7/5 у тій самій транзакції (якщо `recordLeague` кидає — рядка `game` зі статусом `finished` теж немає, гра повторюється), гравцям приходить `league.points`, пульту — `rows`.
  - `team game` — дві команди з членами → члени першої по 10, другої по 7.
  - `too few` — 2 члени → пульт `tooFew`, балів немає.
  - `retries and restarts do not add twice` — збій `awardPrizes` після запису (як у `recorder.prizes.test.ts`) → повтор → бали ті самі; кімната, піднята вже `finished` (`restore`), — той самий підсумок у зрізах.
  - `aborted, saved and challenge games count nothing` — `end` до першого запитання, «Зберегти й продовжити пізніше», спроба виклику → `league_game` порожня.
  - `a group deleted mid-game` — групу видалено до фінішу → гра записана `finished`, балів немає, `onError` не кликали.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/recorder.league.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Запис» (`nicknames` — з людей рядків: соло — нік гравця, команда — нік людини; лише `phase === 'finished' && plays.length > 0 && room.challenge === null && room.league !== null`; `leagued` додається в `forget`/`adopt`).
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/recorder.league.test.ts apps/server/src/recorder.test.ts apps/server/src/recorder.prizes.test.ts apps/server/src/recorder.saved.test.ts apps/server/src/restart.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/recorder.ts apps/server/src/recorder.league.test.ts apps/server/src/rooms/prizes.ts
git commit -m "feat(server): 45 family league — a finished league game writes its members' points in the same transaction as the finish, once across retries and restarts; teams give their place, too few members are told, aborted, saved and challenge games count nothing"
```

---

### Задача 5. Сервер: таблиця групи й титули в профілі

**Files:**
- Modify: `apps/server/src/group-routes.ts` (`GET /api/groups/:id/league`, ліміт `read`, через `member()`), `apps/server/src/profiles.ts` (`leagueTitles` в `ownProfile` і `publicProfile` — `leagueTitlesOf(db, id, new Date())`), `apps/server/src/group-routes.test.ts`, `apps/server/src/profile-routes.test.ts`

**Interfaces:**
- Consumes: `leagueTable`, `leagueTitlesOf` (задача 2); `LEAGUE_MONTH`.
- Produces: `GET /api/groups/:id/league?month=YYYY-MM` → 200 `LeagueTable`; профілі — `leagueTitles: LeagueTitle[]`.

- [ ] **Step 1: Write the failing tests:**
  - `group-routes.test.ts`: `the league table is for members only` — член → 200 з рядками; чужий і неіснуюча група → 404 `group_not_found`; гість → 401; `?month=2026-13` → поточний місяць (не 400); минулий місяць з даними → його рядки й `current: false`; зала чемпіонів після підсумку.
  - `profile-routes.test.ts`: `a league champion shows only the title` — переможець минулого місяця: `GET /api/me/profile` і `GET /api/profiles/:id` (чужим акаунтом і гостем) мають `leagueTitles: [{ group: 'Родина Коваленків', month }]`; у JSON публічного профілю немає id групи, балів і слова `league_point` (перевірка `JSON.stringify` не містить `groupId`); без перемог — `[]`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/group-routes.test.ts apps/server/src/profile-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** маршрут і поля профілю (рядок групи з `profileCards`; `month` не за `LEAGUE_MONTH` → `null`).
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/group-routes.test.ts apps/server/src/profile-routes.test.ts apps/server/src/profiles.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/group-routes.ts apps/server/src/group-routes.test.ts apps/server/src/profiles.ts apps/server/src/profile-routes.test.ts
git commit -m "feat(server): 45 family league — the group's month table, months and hall of champions for members only; profiles carry the champion titles, the public one nothing but the title"
```

---

### Задача 6. Веб: вибір групи в лобі й рядки ліги в грі (`league/LeaguePick.tsx`)

**Files:**
- Create: `apps/web/src/league/LeaguePick.tsx`, `apps/web/src/league/LeaguePick.test.tsx`
- Modify: `apps/web/src/api.ts` (`gameLeague(code)`, `pickLeague(code, groupId)`), `apps/web/src/screens/HostScreen.tsx` (`LeaguePick` після `PrizePlaces` у лобі ~1583; на фініші ~1485 — блок `section.league-result`: `leagueHostTitle` + список `nickname — +N` чи `leagueTooFew`), `apps/web/src/screens/AuthorLobby.tsx` (`{!solo && <LeaguePick code={code} />}` після `PrizePlaces`), `apps/web/src/screens/PlayerScreen.tsx` (у лобі — `leagueLobbyMark`; на фініші під `place` — `countText('leagueGained', points, { group })` чи `leagueTooFew`), `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,pl,de,es,it,ar}.json`, `apps/web/src/i18n.test.ts` (`ADDED_LEAGUE`, `ADDED_LEAGUE_PLURALS` — ключі цієї задачі: `leaguePick*`, `leagueLobbyMark`, `leagueTooFew`, `leagueHostTitle`, `leagueGained_*`), `apps/web/src/styles.css`, тести екранів (`HostScreen.test.tsx`, `PlayerScreen.test.tsx`, `AuthorLobby.test.tsx` — наявні)

**Interfaces:**
- Consumes: `LeaguePickInfo`, `PlayerLeagueView`, `HostLeagueView` (задача 1); маршрути задачі 3.
- Produces: `export function LeaguePick({ code }: { code: string }): JSX.Element | null` — `section.panel.league-pick`: `h2` `leaguePickTitle`, `select` з `label` `leaguePickLabel` (`leaguePickNone` + `{emoji} {name}`), підказка `leaguePickHint`, «Збережено» після `PUT`; без груп — `leaguePickNoGroups`; 401/404 — нічого (як `PrizePlaces` `quiet`); помилка — `errorText`.

- [ ] **Step 1: Write the failing tests:**
  - `LeaguePick.test.tsx`: список груп і «— не для ліги»; вибір групи → `pickLeague(code, id)` і «Збережено»; помилка `wrong_phase` → «Зараз цього зробити не можна.»; без груп — `leaguePickNoGroups`; 404 → компонент порожній.
  - `PlayerScreen.test.tsx`: лобі з `league: { group: 'Родина' }` → «🏆 Гра для ліги «Родина»»; фініш з `points: 7` → «Ліга «Родина»: +7 балів»; `points: 1` → «+1 бал»; `points: 0` → «+0 балів»; `tooFew` → «Для ліги замало учасників групи»; без `league` — нічого.
  - `HostScreen.test.tsx`: лобі — `LeaguePick` поруч із призами; фініш з `rows` → «Ліга «Родина»» і рядки `Тарас — +10`; `tooFew` → «Для ліги замало учасників групи».
  - `AuthorLobby.test.tsx`: є `LeaguePick`; у спробі виклику (`challenge`) — немає.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/league apps/web/src/screens`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Зрізи гри» й текстами; переклади в шести локалях (ті самі ключі й `{group}`/`{count}`); на 360 px `select` — на всю ширину, довга назва групи переноситься.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/league apps/web/src/screens apps/web/src/i18n.test.ts apps/web/src/locales apps/web/src/source-scan.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/league apps/web/src/api.ts apps/web/src/screens apps/web/src/i18n.ts apps/web/src/i18n.test.ts apps/web/src/locales apps/web/src/styles.css
git commit -m "feat(web): 45 family league — «Game for group» in the host and autopilot lobbies, the league mark on phones, «League «X»: +N points» on the phone and every member's points on the host at the end, «too few group members» otherwise; seven languages"
```

---

### Задача 7. Веб: вкладка «Ліга» на сторінці групи й титули в профілі

**Files:**
- Create: `apps/web/src/groups/LeagueTable.tsx`, `apps/web/src/groups/LeagueTable.test.tsx`, `apps/web/src/profile/LeagueTitles.tsx`, `apps/web/src/profile/LeagueTitles.test.tsx`
- Modify: `apps/web/src/pages/GroupPage.tsx` (вкладка `league` у `TABS` після `items`, `?tab=league`), `apps/web/src/pages/Profile.tsx`, `apps/web/src/pages/PublicProfile.tsx` (`<LeagueTitles titles={profile.leagueTitles} />` під `ProfileHeader`), `apps/web/src/format.ts` (`monthText`), `apps/web/src/format.test.ts`, `apps/web/src/api.ts` (`groupLeague(id, month?)`), `apps/web/src/i18n.ts`, `apps/web/src/locales/*.json`, `apps/web/src/i18n.test.ts` (решта ключів `ADDED_LEAGUE`), `apps/web/src/styles.css`, `apps/web/src/pages/GroupPage.test.tsx`

**Interfaces:**
- Consumes: `LeagueTable`, `LeagueTitle` (задача 1); маршрут задачі 5.
- Produces: `export function monthText(month: string): string` (`'2026-11'` → uk «листопад 2026»); `LeagueTable({ groupId })`; `LeagueTitles({ titles }): JSX.Element | null` (порожній список — нічого).

- [ ] **Step 1: Write the failing tests:**
  - `format.test.ts`: `monthText('2026-11')` у uk = «листопад 2026», `'2027-01'` → «січень 2027» (без « р.»); en — «November 2026».
  - `LeagueTable.test.tsx`: `table.league-table` з колонками «Місце», «Учасник», «Бали», «Ігор», «Перших місць»; свій рядок `.is-me`; `former` → «вже не в групі»; перемикач місяців (`select` `leagueMonthLabel`, поточний — «листопад 2026 (поточний)») → `groupLeague(id, '2026-10')`; порожньо — `leagueEmpty`; «Зала чемпіонів» — «жовтень 2026 — Тарас, Ірина»; без чемпіонів — `leagueHallEmpty`; `leagueRules` під таблицею.
  - `GroupPage.test.tsx`: вкладка «Ліга» є в учасника й власника; `?tab=league` відкриває таблицю.
  - `LeagueTitles.test.tsx`: «🏆 Чемпіон ліги «Родина» — жовтень 2026» з `dir="auto"` назвою; `[]` → нічого. Профіль і публічний профіль показують список.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/groups apps/web/src/profile apps/web/src/pages/GroupPage.test.tsx apps/web/src/format.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** (`monthText` — `Intl.DateTimeFormat(intlTag(), { month: 'long', year: 'numeric', timeZone: 'UTC' })` від `Date.UTC(y, m − 1, 15)` + `dropYearMark`; на 360 px таблиця без бокового скролу — колонки «Ігор»/«Перших місць» вужчі, нік переноситься).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/groups apps/web/src/profile apps/web/src/pages apps/web/src/format.test.ts apps/web/src/i18n.test.ts apps/web/src/locales apps/web/src/source-scan.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/groups apps/web/src/profile apps/web/src/pages apps/web/src/format.ts apps/web/src/format.test.ts apps/web/src/api.ts apps/web/src/i18n.ts apps/web/src/i18n.test.ts apps/web/src/locales apps/web/src/styles.css
git commit -m "feat(web): 45 family league — the «League» tab of a group: the Kyiv-month table with places, points, games and first places, past months, the hall of champions; champion titles in the own and public profile; seven languages"
```

---

### Задача 8. Довідка ведучого: «Сімейна ліга» (`setting.league`)

**Files:**
- Modify: `apps/web/src/help/host-help.ts` (`'league'` в кінець `SETTING_HELP_KEYS`), `apps/web/src/help/help-uk.ts` (записи після `setting.challenge.*`), `apps/web/src/help/__fixtures__/help-uk-golden.json`, `apps/web/src/locales/{en,pl,de,es,it,ar}.help.json`, `apps/web/src/league/LeaguePick.tsx` (`HelpButton id="setting.league"` у заголовку)
- Test: `apps/web/src/help/help-golden.test.ts`, `apps/web/src/help/host-help.test.ts` (наявні), `apps/web/src/league/LeaguePick.test.tsx` (ⓘ)

**Тексти (uk):**
- `title`: «Сімейна ліга»
- `what`: «Ігри твоєї групи за місяць складаються в одне змагання з переможцем.»
- `how.0`: «У лобі обери «Гра для групи» — серед груп, де ти є. Після старту змінити не можна. У грі без ведучого обираєш так само, до «Почати гру».»
- `how.1`: «Наприкінці члени групи, що грали зі своїх акаунтів, отримують 10 / 7 / 5 / 3 / 1 бал за 1–5 місця серед членів групи. Гості й ті, хто не в групі, місць не займають. У командній грі кожен отримує місце своєї команди.»
- `points.0`: «Гра рахується від 3 членів групи на щонайменше двох рядках таблиці; інакше наприкінці буде «Для ліги замало учасників групи». Перервані, збережені на потім і виклики не рахуються.»
- `tip.0`: «Таблиця місяця (за київським часом) — на сторінці групи, вкладка «Ліга»; її бачать лише члени групи. Переможець місяця отримує титул у профілі й запис у «Залі чемпіонів».»
- `limits.0`: «Якщо збережеш гру й продовжиш пізніше, позначка групи не зберігається — постав її знову в лобі продовження.»

- [ ] **Step 1: Write the failing test:** `LeaguePick.test.tsx` — у заголовку є ⓘ; клік відкриває запис «Сімейна ліга». Golden-тест із новим ключем у `SETTING_HELP_KEYS` без записів — FAIL.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/help apps/web/src/league`. Expected: FAIL.
- [ ] **Step 3: Implement:** записи uk, golden (той самий текст), переклади в шести `*.help.json` (ті самі ключі).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/help apps/web/src/i18n.test.ts apps/web/src/league && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/help apps/web/src/locales apps/web/src/league
git commit -m "docs(web): 45 family league — the host help entry on marking a game for a group, 10/7/5/3/1 among members, the 3-member minimum, the month table and the champion title, in seven languages"
```

---

### Задача 9. Наскрізні сценарії й кадри (`part45-family-league.e2e.ts`)

**Files:**
- Create: `apps/server/e2e/part45-family-league.e2e.ts`

Сценарії (`useE2eServer`; телефони 360×740, світла тема init-скриптом `quiz:theme`; вміст — річки й міста України, таймери 25–30 с, так/ні — і «так», і «ні»):

- `part 45: family league — a group of four plays two league games (one in teams), the month table, a 2-member game does not count, the month is settled into a title and the hall of champions, phone 360 px, light theme`:
  1. «Олена» (`register`) створює групу «Родина Коваленків» (`POST /api/groups`), «Тарас», «Ірина», «Петро» вступають за кодом (`POST /api/groups/join/<код>`); «Оксана» — не в групі. Олена створює вікторину «Міста 45» (класика: `single` «Яке місто стоїть на Дніпрі?» → «Київ»; `boolean` «Львів — столиця України?» → «ні»; `boolean` «Одеса стоїть на березі Чорного моря?» → «так»).
  2. Олена відкриває пульт, у лобі — панель «🏆 Сімейна ліга», обирає «Родина Коваленків» (кадр `p45-pick`, `expectNoSideScroll`); Тарас, Ірина, Петро, Оксана й гість входять з телефонів, у лобі — «🏆 Гра для ліги «Родина Коваленків»» (кадр `p45-lobby`, `expectPhoneFit`). Старт; `PUT …/league` після старту → 409.
  3. Гра до кінця (Тарас найкраще, Оксана посередині, Ірина й Петро далі) → у Тараса «Ліга «Родина Коваленків»: +10 балів» (кадр `p45-gained`), в Ірини «+7 балів», у Оксани рядка немає; на пульті — рядки трьох членів.
  4. Друга гра — командна (дві команди: Тарас+гість проти Ірини+Петра) → члени першої по 10, другої по 7.
  5. Третя — автопілот Ірини з групою, грають лише Ірина й Петро → на телефоні Ірини «Для ліги замало учасників групи»; бали не змінились.
  6. Тарас: «Мої групи» → «Родина Коваленків» → «Ліга» → таблиця поточного місяця: Тарас 20 / 2 гри / 2 перших, Ірина 14, Петро 14 зі спільним місцем (кадр `p45-table`, довгий нік 20 символів без бокового скролу); Оксана (`GET /api/groups/:id/league`) → 404.
  7. Підміна часу: e2e переводить `month` у `league_game` і `league_point` групи на попередній місяць (`previousMonth(kyivMonth(new Date()))`, `db.update` з `helpers/setup.ts`) → оновлення вкладки: поточний місяць порожній («Цього місяця ще не було ігор для ліги.»), перемикач на минулий — та сама таблиця, «Зала чемпіонів» — «<місяць> — Тарас» (кадр `p45-hall`).
  8. Профіль Тараса — «🏆 Чемпіон ліги «Родина Коваленків» — <місяць рік>» (кадр `p45-title`); публічний профіль Тараса з акаунта Оксани — той самий рядок, без таблиці й посилання на групу.
  9. Петро виходить із групи → у поточному місяці його немає, у минулому — з позначкою «вже не в групі».
  10. Світла тема — клас, який ставить `applyThemeClass` (`apps/web/src/theme-mode.ts`), світлий на всіх кадрах.

- [ ] **Step 1: Write the scenarios.**
- [ ] **Step 2: Run** `pnpm build`, потім (після завершення збирання) `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 45"` з `E2E_SHOTS=1` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 3: Переглянути кадри:** вибір групи, рядок «+N», таблиця, зала й титул на 360 px без бокового скролу, довгі ніки й назва групи переносяться, світла тема.
- [ ] **Step 4: Commit**
```bash
git add apps/server/e2e/part45-family-league.e2e.ts
git commit -m "test(e2e): part 45 — the family league: the host marks two games for a group of four (one in teams), «+N points» on phones, a 2-member autopilot game does not count, the month table for members only, a settled month gives the title and the hall of champions, a member who left stays in past months, phone 360 px, light theme"
```

---

## Розбіжності зі специфікацією (рішення плану)

1. **`GAME_STATE_VERSION` не потрібен.** Позначка — на кімнаті (`Room.league`) і в знімку кімнати як необов'язкове `SavedRoom.league?`; підсумок ліги — у пам'яті кімнати й у базі. Відомий край: під час поступового розгортання старий процес, що підхопив би кімнату, позначку проігнорує — гра стане звичайною й балів не дасть. Ризик лише на хвилини деплою; питати власника не треба, але кажу.
2. **Титул — окремий список, а не наявна система титулів.** Наявна система — один титул на акаунт, від призу, на 7 днів (`user_title`, `TITLE_MS`), і новий приз його перекриває; чемпіонство місяця має лишатися назавжди й поруч з іншими. Тому — таблиця `league_champion` і рядок «🏆 Чемпіон ліги «<група>» — <місяць рік>» у власному й публічному профілі (окремий список під шапкою), як і дозволяє специфікація («інакше — окремий рядок у профілі»). Біля ніку в грі він не з'являється. Текст «Чемпіон» — як у специфікації (чоловічий рід); якщо власник хоче нейтральний («Перше місце ліги…») — це один рядок у словнику.
3. **Мінімум «3 члени» — ще й на щонайменше двох рядках таблиці.** Інакше командна гра, де всі члени в одній команді, давала б кожному по 10 балів без суперника — саме те накручування, проти якого мінімум. Соло-гра з 3 членами завжди має 3 рядки, тож для неї правило збігається зі специфікацією.
4. **«Зберегти й продовжити пізніше» позначку не переносить.** Збережена гра (`saved_game`) — окремий запис без кімнати; точне продовження стартує не з лобі, тож позначити його знову не можна, і така гра в лігу не йде. Продовження шляхом 12r відкриває лобі — там позначку можна поставити знову. Довідка це каже.
5. **Автопілот позначається в лобі автора, а не в діалозі запуску.** Лобі автора (`AuthorLobby`) показується одразу після запуску й до «Почати гру» — та сама панель, що й у ведучого; окремого поля в `POST /api/games` не треба.
6. **Підсумок місяця — ліниво, без фонового таймера.** Місяць підсумовується при першому відкритті таблиці групи чи профілю будь-кого з учасників ліги після кінця місяця за Києвом (`league_month` — разовий рядок), і далі не змінюється. Видалення групи прибирає її таблицю, але не титули (назва групи — знімок на мить підсумку).
7. **Місця 6+ дають 0 балів, але гра йде в «ігор»;** у таблиці — лише ті, хто має врахованих ігор у місяці (не всі члени групи). Ігри «замало учасників» — ніде не рахуються.
8. **Члени групи — на мить фінішу гри,** не на мить позначки: хто вступив посеред гри — отримує бали; хто вийшов — ні. Ведучий, що вийшов із групи після позначки, гру не скасовує.
