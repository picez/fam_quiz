# План 66: об'єднання двох акаунтів в адмінці — перегляд, одна транзакція, способи входу на головний (44h)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** Рушій, `GameState`, `SavedRoom`, `SavedGameData` — без нових полів. Об'єднання лише переписує **значення** в наявних полях JSON (`playerUsers`, `hostUserId`). Якщо виконавцю здасться, що потрібне нове поле стану, — **зупинитися й спитати контролера**.

> **Міграція — `<наступний вільний номер>_merged_email`.** План 65 (повтор гри, 44g) пишеться паралельно й **зливається першим**: номер — наступний після останньої міграції в `main` на момент збирання (на сьогодні остання — `0047`; якщо 65 бере `0048`, наша — `0049`). Лише додавання: одна нова таблиця `merged_email`. Генерувати `drizzle-kit generate` **після** злиття 65, щоб знімок містив його зміни.

> **Звірка з кодом.** План спирається на `main` 2026-11-20 (`97cb0419`):
> - видалення (58): `apps/server/src/account-delete.ts` — `deleteAccount(db, { adminId, userId, now, adminEmails }): Promise<'deleted' | 'not_found' | 'cannot_delete_admin'>` (одна транзакція; журнал `account_delete` першим; `forgetInGamePlays`, `forgetInSavedGames`, `forgetInLiveRooms`, `handOverGroups`, `delete verification where value = id`, `delete user` — решта каскадом); тест `account-delete.test.ts`: `referencing(userId)` (~107, кожна таблиця з посиланням на `user` і JSON `push_broadcast.people`, `saved_game.data`, `live_room.data`), список `HANDLED` (~511) і `it('every foreign key to user is covered by the deletion test')` через `getTableConfig(table).foreignKeys` (~524);
> - маршрут видалення: `apps/server/src/admin-card-routes.ts` ~92 — `manager.frozen` → 503 `restarting`; бот / сам адмін / адмін → 409 `cannot_delete_admin`; мітка підтвердження `ensureProfile(db, id)?.nickname ?? email`, 400 `confirm_mismatch`; `manager.forgetUser(id)` **до** транзакції; `unknownUser(id)` (бот → 404); `USER_ID_MAX = 64`;
> - Better Auth 1.7.7 (`apps/server/src/auth.ts`): таблиці `user` (`email` unique), `session` (cascade), `account` (`account_id`, `provider_id`, `user_id` cascade, **жодного унікального індексу** на `provider_id + account_id` — лише `account_user_idx`), `verification` (`value` = id користувача для токенів); `databaseHooks.user.create.before` (домен бота), `session.create.before` (бот, бан). **Вхід паролем** (`better-auth/dist/api/routes/sign-in.mjs` ~318): `findUserByEmail(email)` і рядок `account` з `providerId === 'credential' && accountId === user.id` — тобто пароль прив'язаний до email рядка `user` і до `account_id = user.id`. **Вхід Google** (`oauth2/link-account.mjs` ~80): спершу `findAccountOwnerByKey({ accountId, providerId })` — власника шукають за рядком `account`, email не потрібен;
> - проксі авторизації: `apps/server/src/account-routes.ts` ~73 `app.route({ url: '/api/auth/*' … })` — тіло запиту перекладається в `Request` через `JSON.stringify(request.body)`;
> - досвід: `xp-store.ts` `xpTotals`, `syncXp`, рівень — `levelOf(xp)` з `@quiz/shared`; `player-card.ts` `announce(db, userId, now)` → `announceLevels`; `xp_entry` — часткові унікальні `xp_entry_game_once (user_id, game_id) where source = 'game'`, `xp_entry_achievement_once (user_id, achievement_id) where source = 'achievement'`;
> - ліга: `league-store.ts` — таблиця місяця рахується **сумою** `league_point` за `(group_id, month)` (`totalsOf`), PK `league_point (game_id, user_id)`; `league_champion` — унікальний `(group_id, month, user_id)`;
> - досягнення: `user_achievement` PK `(user_id, achievement_id)`, `earned_at null` = «давно»; `achievement_block` PK так само;
> - стрічка: `feed_event.key` унікальний — `game:<gameId>:<userId>`, `achievement:<userId>:<id>`, `level:<userId>:<n>`, `prize:<awardId>`, `planned:<eventId>`; лайк події — `user_like.event_key = feed_event.key`;
> - вітрина: `SHOWCASE_PIN_LIMITS = { prize: 3, achievement: 5 }` (`packages/shared/src/showcase.ts`), `showcase_pin` PK `(user_id, kind, item_id)` + унікальний `(user_id, kind, slot)`;
> - кімнати: `rooms/manager.ts` — `Room.hostUserId`, `Room.playerUsers: Map<playerId, userId>`, `continued.bound`, `forgetUser`, `frozen`, `rooms()`; знімок у `live_room.data` (`hostUserId`, `playerUsers`, `state.phase`); `saved_game.data.playerUsers` (`rooms/continuation.ts`);
> - журнал: `packages/shared/src/admin.ts` `ADMIN_ACTION_KINDS`, `ADMIN_LOG_GROUP_KINDS` (група `players` має `account_delete`), `AdminLogDetails`; `bans.ts` `logAction(tx, …)`, `isBanned`; `admin.ts` `isAdmin(db, adminEmails, userId)`; веб `admin/admin-text.ts` `logLine`, CSV `admin/log-csv.ts` бере той самий текст;
> - картка гравця, веб: `apps/web/src/admin/AdminUser.tsx` (`CardProps { detail; act; busy }`, `CardAct`), розділи в `admin/card/*.tsx`, зразок — `card/CardDelete.tsx`; пошук людей — `admin-api.ts` `adminUsers(q, page)`; помилки Better Auth → наші коди — `apps/web/src/api.ts` `AUTH_CODES`;
> - тести авторизації: `testing/accounts.ts` `TEST_AUTH`, `signUp(app, name)`, `cookieOf`; зразок входу через проксі — `bans-auth.test.ts` (`signIn(email, password)` → `POST /api/auth/sign-in/email`);
> - e2e: `apps/server/e2e/part58-player-card.e2e.ts` (адмін через `relisten({ adminEmails })`, `light`, `view`, `section`), `helpers/common.ts` `register(page, via, name, email)` (пароль завжди `correct horse battery`), `myId`.
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

> **Точки злиття з планом 65** (65 зливається першим; будувати від `main` після його злиття, а якщо його ще немає — додати так само й під час злиття лишити обидва):
> - `packages/shared/src/admin.ts`: рядок `ADMIN_ACTION_KINDS` і `ADMIN_LOG_GROUP_KINDS` (65 додає свій вид перегляду повтору, імовірно в `games`; ми — `account_merge` у `players`), `AdminLogDetails` (ми додаємо `merge?: MergeSummary`); тест «кожен вид — рівно в одній групі» має лишитися зеленим;
> - `apps/web/src/admin/admin-text.ts` `logLine` (обидва додають гілку), `apps/web/src/i18n.ts`, шість JSON, `i18n.test.ts` (обидва додають свої `ADDED_*` у довгий рядок умови `adds no uk keys beyond the agreed list` — при конфлікті лишити обидва);
> - картка в адмінці: 65 додає кнопку «Повтор по кроках» у `AdminGame.tsx` (перегляд гри), ми — розділ `card/CardMerge.tsx` у `AdminUser.tsx`; якщо 65 теж торкається `AdminUser.tsx`/`CardGames.tsx` — лишити обидва;
> - `apps/server/src/admin-routes.ts` (рядки реєстрації в кінці), `admin-routes.test.ts` (`routes`);
> - `apps/server/src/db/schema.ts`, `drizzle/meta/_journal.json`, `drizzle/meta/*_snapshot.json`: міграцію генерувати **після** 65;
> - **якщо 65 додає таблицю чи колонку з зовнішнім ключем на `user`** — схема-тест 58 (`HANDLED`) і наш (`MERGE_RULES`) обидва впадуть: дописати правило перенесення (і рядок у `referencing` 58). Якщо 65 додає JSON з id акаунтів (наприклад, журнал подій гри з `userId`) — дописати JSON-правило в `MERGE_JSON_RULES` (задача 4).

**Мета:** адмін на картці гравця знаходить другий акаунт тієї самої людини, бачить точний попередній перегляд «що куди перейде», вибирає головний, вводить нік акаунта, що зникне, — і за одну транзакцію все другорядного переходить на головний (дублікати зливаються за правилами), способи входу другорядного (Google, пошта з паролем) переходять на головний, другорядний видаляється процедурою 58 уже порожнім, а журнал отримує рядок з підсумком.

**Архітектура:** спільне — `packages/shared/src/account-merge.ts` (типи перегляду й підсумку, схема тіла, коди відмов). Сервер: нова таблиця `merged_email` (стара адреса другорядного → головний) і `merged-email.ts` (проксі входу паролем переписує стару адресу на адресу головного; хук `user.create.before` не дає зареєструвати її наново); правила перенесення — упорядкований масив `MERGE_RULES` (по одному на кожен зовнішній ключ до `user`, схема-тест вимагає повноти) у `account-merge-people.ts` і `account-merge-history.ts` плюс `MERGE_JSON_RULES` для JSON; `account-merge.ts` — `mergeAccounts` (відмови, правила, профіль, `deleteAccount` без власного рядка журналу, псевдонім адреси, журнал) і `previewMerge` (той самий шлях у транзакції з відкатом — перегляд дорівнює результату); `RoomManager.inLiveGame` / `rebindUser`; маршрути в `admin-card-routes.ts`. Веб: розділ картки `CardMerge.tsx`, рядок журналу з підсумком, код `email_merged`.

**Технології:** TypeScript, zod 4, Fastify, drizzle (Postgres) + drizzle-kit, Better Auth 1.7.7, vitest (`shared`/`server`/`web`), React 19 + Testing Library, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-20-merge-accounts-design.md` (44h); видалення акаунта — план 58 (`account-delete.ts`).

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22**; рушій, зрізи, формати збережених кімнат — без змін.
- **Міграція одна — `<наступний вільний>_merged_email`**, лише `CREATE TABLE` / `CREATE INDEX` / зовнішній ключ; жодного `DROP` чи зміни наявного.
- **Лише адміністратори:** нові `/api/admin/*` — через `read`/`write` (ворота `gate`), не-адміну й гостю — та сама **404**; обидва маршрути — у `routes` тесту воріт. Об'єднання — рядок журналу `account_merge`.
- **Одна транзакція:** збій будь-де — нічого не перенесено, обидва акаунти цілі, рядка журналу немає (тест з тригером, як у 58).
- **Схема-тест:** кожен зовнішній ключ до `user.id` має правило в `MERGE_RULES` (ключ `таблиця.колонка`); нова таблиця з ключем на `user` без правила — червоний тест. Так само лишається тест 58 (`HANDLED`) — нова `merged_email.user_id` іде і туди.
- Тексти інтерфейсу — **7 мов**: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`. Нові uk-ключі — у списку `ADDED_MERGE_66` у `i18n.test.ts` (в умову `adds no uk keys beyond the agreed list` і в перевірку наявності в шести мовах зі збігом змінних, як `ADDED_ERRORS_64`). Множин немає (тексти «…: {count}»). ru немає.
- Кириличні літерали в `apps/web/src/` — лише в словниках і тестах (`source-scan.test.ts`).
- Email другого акаунта адмін бачить (він і так бачить email на картці 58), але **в рядку журналу email немає** — лише ніки (мітка без ніку — як у 58: email; це вже прийняте правило 58).
- **Нічого, пов'язаного з росією**, — у фікстурах, ніках, e2e.
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm exec tsc -p <пакет>` у задачах 1–6, з задачі 7 — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів vitest).
- Файли правити лише Edit/Write чи `sed`; **python3 на цій машині — порожня заглушка, ним нічого не правити й не генерувати**; після коміту — `git show --stat`.
- Робоче дерево — лише `C:\ClaudeCode\quiz\.superpowers\worktrees\plan66`; жодних файлів поза `C:\ClaudeCode\quiz` (тимчасові — у `.superpowers` чи scratchpad сесії). Інших дерев не торкатися.
- e2e: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 66"`; телефон 360 px, світла тема (`quiz:theme = light`, `is-light` на `<html>`); після — окремо `-t "part 58"`.

## Рішення плану (там, де специфікація мовчить)

**Позначення.** `P` — головний акаунт (лишається), `S` — другорядний (зникне). «Перенести» = `update … set <колонка> = P where <колонка> = S`. «Конфлікт» = після перенесення порушився б первинний ключ чи унікальний індекс.

**Відмови (перевіряються маршрутом до транзакції й ще раз усередині, під `select … for update` обох рядків `user` у порядку id)**
- `P === S` → 400 `merge_same`.
- Бот (`isBotUser`) з будь-якого боку → **404** (як уся картка 58: бот — не ціль).
- Адмін: `S` — адмін → 409 `merge_admin` (його ж і `deleteAccount` не видалить); `P` — адмін, але не той, хто діє, → 409 `merge_admin`. Тобто адмін може злити **свій** другий акаунт у **свій** головний, і лише так.
- Бан (`isBanned`) з будь-якого боку → 409 `merge_banned` («спершу розбанити»).
- Жива гра → 409 `merge_live`: `RoomManager.inLiveGame(id)` (кімната в пам'яті, фаза не `finished`, `hostUserId === id` чи `id` серед значень `playerUsers`) **або** рядок `live_room`, де `data->>'hostUserId'` чи пара в `data->'playerUsers'` — цей акаунт, а `data->'state'->>'phase' <> 'finished'` (кімнати інших процесів).
- `manager.frozen` → 503 `restarting`. Невідомий `S` чи `P` → 404.
- Підтвердження: `confirm.trim()` дорівнює мітці `S` (`nickname ?? email`, як у 58) → інакше 400 `confirm_mismatch`.

**Способи входу (Better Auth) — найважливіше**
- Рядки `account` з `provider_id <> 'credential'` (Google тощо): `user_id = P`. Better Auth шукає власника Google за `(provider_id, account_id)` — після перенесення вхід через той самий Google веде в `P`. Якщо в `P` уже є рядок з тим самим `(provider_id, account_id)` (не буває, але база цього не забороняє) — рядок `S` видаляється.
- Рядок `credential` (пошта з паролем) `S`:
  - у `P` пароля немає → `user_id = P` **і** `account_id = P` (вхід паролем вимагає `account_id === user.id`); хеш пароля `S` стає паролем `P`;
  - у `P` пароль є → рядок `S` видаляється, лишається пароль `P`; `summary.passwordDropped = true`, перегляд попереджає червоним рядком.
- Адреса `S` після видалення рядка `user` більше ніде не знайдеться, тож вона стає **псевдонімом**: рядок `merged_email (email = lower(S.email), user_id = P, merged_at)`. Наявні псевдоніми `S` (від давніших об'єднань) — `user_id = P`.
- Проксі `/api/auth/*`: для `POST …/sign-in/email` з рядком `body.email` — `loginEmailFor(db, email)`: є псевдонім і жоден `user` не має такої адреси → `body.email` замінюється адресою `P`. Людина вводить стару адресу й пароль, що тепер у `P`, і входить у `P`.
- Хук `databaseHooks.user.create.before`: адреса є в `merged_email` → `APIError('BAD_REQUEST', { code: 'EMAIL_MERGED' })` — ні реєстрація паролем, ні новий Google з цією адресою не створять третій акаунт. Веб: `AUTH_CODES` + `['EMAIL_MERGED', 'email_merged']`, текст `err_email_merged`.
- Сесії `S` видаляються в транзакції (правило `session.user_id`); сесії `P` не чіпаються. Токени `verification` зі значенням `S` прибирає `deleteAccount`.
- `merged_email.user_id → user.id on delete cascade`: видалення `P` пізніше звільняє й псевдоніми.

**Правила таблиць (`MERGE_RULES`, по порядку виконання)** — історія (задача 4) йде першою, бо її рішення («чий рядок гри лишився», «чия дата досягнення раніша») потрібні стрічці й вітрині:
1. `participant.user_id` — перенести. **Та сама гра двічі** (рядки `S` і `P` в одній `game_id`): лишається рядок з більшим `score` (рівно — `P`); він отримує `user_id = P`, другий — `user_id = null` (лишається в грі гостьовим рядком зі своїм ніком: рахунки й місця інших не змінюються). Ігри, де переміг рядок `S`, — у `ctx.secondaryWonGames`. `summary.games` — перенесені рядки, `summary.sameGames` — такі ігри.
2. `user_achievement.user_id` — перенести; конфлікт `(P, id)`: лишається **раніша** `earned_at` (`null` = «давно» — найраніша) разом з її `game_id`; якщо раніша в `S` — оновити рядок `P` і id — у `ctx.earlierOnSecondary`. `summary.achievements` — нові для `P`, `sameAchievements` — злиті.
3. `xp_entry.user_id` — перенести (досвід — **сума журналів**). Конфлікт `xp_entry_game_once` (та сама гра) — лишається рядок з більшим `amount`; `xp_entry_achievement_once` — лишається рядок `P`. Рядки `admin` і вирівнювання — усі переносяться. `summary.xp` — сума `amount` перенесених рядків `S`.
4. `league_point.user_id` — перенести; конфлікт `(game_id, P)` — лишається більше `points` (рівно — `P`). Місячна сума групи рахується з рядків — «сума за місяць» виходить сама. `summary.league` — перенесені рядки.
5. `league_champion.user_id` — перенести; конфлікт `(group_id, month, P)` (а для `group_id null` — та сама `(group_name, month)`) — `points` **сумуються** в рядок `P`, рядок `S` видаляється.
6. `feed_event.user_id` — перенести; ключі з id `S` переписуються на `P` (`game:<g>:S` → `game:<g>:P`, `achievement:S:<a>` → `achievement:P:<a>`, `level:S:<n>` → `level:P:<n>`; `prize:`/`planned:` не містять id). Конфлікт ключа: для `game:` лишається подія того, чий рядок гри лишився (`secondaryWonGames` → подія `P` видаляється, подія `S` переїжджає), для `achievement:` — того, чия дата раніша (`earlierOnSecondary`), для `level:` — подія `P`. Разом з ключем переписується `user_like.event_key` (і ключ видаленої події — на ключ, що лишився); конфлікт `user_like_event_once` — лайк `S`-ключа видаляється.
7. `user_like.user_id`, `user_like.target_user_id` — перенести; конфлікти часткових унікальних (`question`/`quiz`/`host`/`player`/`event`) — рядок `S` видаляється; рядок, де після перенесення `user_id = target_user_id` (лайк самому собі), — видаляється. `summary.likes` — перенесені поставлені.
8. `profile.user_id` — у `P` лишаються нік, аватар, вбрання, мова, легкий режим, `admin_push`, `hide_anti`, `feed_seen_at`, `calendar_seen_at`. Злиття: `last_seen_at` = пізніша; `favorite_stickers` = `P`, далі відсутні в `P` з `S`, до межі улюблених стікерів (константа зі `sticker-routes`/`shared`, звірити); `feed_level` = більший; `stickers_legacy_level` = більший (null ігнорується); `stickers_settled` = `P && S`; `xp_synced_at` і `achievements_synced_at` = раніша з двох, `null`, якщо хоч одна `null` (наздоганяння й синхронізація досягнень перевірять об'єднану історію — нові кар'єрні досягнення прийдуть самі). Рядок профілю `S` прибирає каскад `deleteAccount`.
9. `follow.follower_id`, `follow.followee_id` — перенести обидва напрямки; конфлікт PK — рядок `S` видаляється; `P → P` (вони дружили між собою) — видаляється. `summary.friends` — нові рядки `P`, `sameFriends` — злиті.
10. `group_member.user_id` — не в тій самій групі → перенести; **та сама група** → один рядок `P`: `joined_at` = раніша, роль `owner`, якщо власником був будь-хто з двох (спершу видалити рядок `S`, тоді оновити `P` — частковий унікальний індекс власника). `summary.groups` / `sameGroups`.
11. `group_invite.user_id` — перенести, але видалити, якщо `P` уже член цієї групи чи вже запрошений; `group_invite.invited_by` — перенести.
12. `group_item.author_id` — перенести (JSON `about` — у `MERGE_JSON_RULES`).
13. `user_title.user_id` (один на акаунт) — лишається титул з пізнішим `expires_at`.
14. `achievement_block.user_id` — перенести, крім заборон досягнень, якими `P` після кроку 2 володіє (отримане досягнення важить більше за заборону другого акаунта), і конфлікту PK — тоді рядок `S` видаляється.
15. `prize.owner_id` — перенести. `prize_award.user_id` — перенести; конфлікт `prize_award_once (game_id, place, P)` — лишається рядок `P`, рядок `S` (і його закріплення) видаляється. `summary.prizes` — склад + нагороди.
16. `showcase_pin.user_id` — закріплення `P` лишаються на своїх місцях; закріплення `S` (без тих, чий предмет уже закріплено в `P` чи видалено кроком 15) дописуються у вільні `slot` за `pinned_at` до `SHOWCASE_PIN_LIMITS[kind]`; решта — видаляються.
17. `calendar_event.host_id` — перенести. `calendar_request.user_id` — перенести; конфлікт `(event_id, P)` — лишається `P`; запит на подію, яку тепер веде `P`, — видаляється. `summary.calendar` — події + запити.
18. `challenge.owner_id` — перенести. `challenge_attempt.user_id` — перенести; конфлікт `(challenge_id, P)` — лишається раніша `started_at`. `summary.challenges` — виклики + спроби.
19. `quiz.owner_id`, `game.host_id`, `library_entry.owner_id`, `library_copy.user_id`, `push_subscription.user_id`, `announcement.created_by`, `bot_plan.created_by`, `push_broadcast.created_by`, `problem_report.user_id`, `problem_report.resolved_by`, `server_error.resolved_by`, `admin_action.admin_id`, `user_ban.banned_by`, `merged_email.user_id` — просто перенести (конфліктів немає). `summary.quizzes`, `summary.hosted`.
20. `user_report.reporter_id`, `user_report.target_user_id` — перенести; скарга `P` на самого себе — видалити; конфлікт відкритих (`user_report_quiz_once`, `user_report_profile_once`) — рядок `S` видаляється.
21. `user_ban.user_id` — бан будь-кого з двох — відмова до транзакції; правило лише перевіряє, що рядків немає (інакше кидає — транзакція відкочується).
22. `session.user_id` — видалити сесії `S`. `account.user_id` — див. «Способи входу». `summary.logins` — перенесені провайдери (`'google' | 'credential' | 'other'`).

**JSON з id акаунтів (`MERGE_JSON_RULES`, після `MERGE_RULES`)**
- `saved_game.data.playerUsers`: пари `[seat, S]` → `[seat, P]`; якщо в тій самій грі вже є пара з `P` — пара `S` просто зникає (місце стає гостьовим зі своїм ніком; у `forgotten` **не** йде — це не видалений гравець). Ігри, які вів `S`, — `game.host_id` уже `P` (правило 19).
- `live_room.data`: кімнати в базі, що лишились після відмови «жива гра» (лише `finished`): `hostUserId` `S` → `P`, пари `playerUsers` — як у збереженій грі.
- `group_item.about`: елементи `{ kind: 'member', userId: S }` → `userId: P`, `name` — поточний нік `P`; якщо `P` уже є в тому самому `about` — елемент `S` прибирається.
- `bot_plan.people`, `push_broadcast.people`: `S` замінюється на `P` без дублікатів (`people_count` не змінюється).
- `admin_action.target_user_id` (без зовнішнього ключа): `S` → `P` — уся історія дій адмінів над людиною на одній картці; `target_label` (знімок) не змінюється.
- `verification.value = S` — прибирає `deleteAccount`.

**Порядок `mergeAccounts` (одна транзакція)**
1. `for update` на обидва рядки `user` (у порядку id), повторна перевірка відмов (без живої гри в пам'яті — її перевіряє маршрут; у базі — тут).
2. `MERGE_RULES`, тоді `MERGE_JSON_RULES` (кожне правило наповнює `ctx.summary`).
3. Вставити `merged_email` для адреси `S` (`on conflict (email) do update set user_id = P`).
4. `deleteAccount(tx, { adminId, userId: S, now, adminEmails, log: false })` — `S` уже порожній; нове необов'язкове поле `log` (типово `true`) прибирає лише рядок `account_delete`, решта процедури та сама. Виклик усередині нашої транзакції — вкладена транзакція drizzle (savepoint). Результат не `'deleted'` → кинути помилку (усе відкочується).
5. `logAction(tx, { adminId, kind: 'account_merge', targetUserId: P, details: { text: <мітка S>, merge: summary }, now })`.
- Після фіксації (поза транзакцією): `manager.rebindUser(S, P)` (пари `S` у кімнатах пам'яті → `P`, а якщо `P` уже в кімнаті — пара зникає; `continued.bound` не змінюється — там id місць), `announce(db, P, now)` (рівень з об'єднаного досвіду; підвищення — подія стрічки, пониження неможливе).
- **Попередній перегляд** — `previewMerge` проходить кроки 1–5 у транзакції й завершує її відкатом (`MergeRollback`): підсумок перегляду дорівнює тому, що зробить об'єднання. Рівень і досвід «після» — `xpTotals(tx, [P])` перед відкатом.

**Спільне (`packages/shared/src/account-merge.ts`, експорт з `index.ts`)**
- `MERGE_LOGINS = ['google', 'credential', 'other'] as const`; `MergeLogin`.
- `MERGE_REFUSALS = ['merge_same', 'merge_admin', 'merge_banned', 'merge_live'] as const`; `MergeRefusal`.
- `interface MergeCounts { games; hosted; quizzes; achievements; xp; friends; groups; prizes; likes; calendar; challenges; league }` (усі `number`); `MERGE_COUNT_KEYS: readonly (keyof MergeCounts)[]` у цьому порядку.
- `interface MergeSummary extends MergeCounts { sameGames: number; sameGroups: number; sameFriends: number; sameAchievements: number; logins: MergeLogin[]; passwordDropped: boolean }`; `emptyMergeSummary(): MergeSummary`.
- `interface MergeSide { id: string; nickname: string | null; email: string; avatar: string | null; level: number; xp: number; logins: MergeLogin[] }`.
- `interface AccountMergePreview { primary: MergeSide; secondary: MergeSide; confirm: string /* мітка S */; refusal: MergeRefusal | null; summary: MergeSummary | null; after: { level: number; xp: number } | null }` — при відмові `summary` і `after` — `null`.
- `adminMergeSchema = z.object({ secondaryId: z.string().min(1).max(64), confirm: z.string().max(200) }).strict()`.
- Журнал: `ADMIN_ACTION_KINDS` + `'account_merge'`, `ADMIN_LOG_GROUP_KINDS.players` + `'account_merge'`; `AdminLogDetails` + `merge?: MergeSummary`.

**Маршрути (`admin-card-routes.ts`)**
- `GET /api/admin/users/:id/merge/:otherId` (`read`) — `:id` = `P`, `:otherId` = `S`; довжина > 64 чи бот → 404; невідомий → 404; `P === S` → 400 `merge_same`; інакше 200 `AccountMergePreview` (відмови `merge_admin` / `merge_banned` / `merge_live` — у `refusal`, щоб адмін бачив причину). Читання в журнал не пишеться.
- `POST /api/admin/users/:id/merge` (`write`, `adminMergeSchema`) — 400 `invalid_payload` / `merge_same` / `confirm_mismatch`; 404; 409 `merge_admin` | `merge_banned` | `merge_live`; 503 `restarting`; збій транзакції → `reportError({ where: 'admin-merge-accounts' })` і 500 `merge_failed`; успіх → 200 `{ primaryId, summary }`.

**Веб**
- Розділ `card/CardMerge.tsx` «Об'єднати з іншим акаунтом» у `AdminUser.tsx` перед `CardDelete` (для всіх, крім бота — його картки немає): поле пошуку (від 2 символів, затримка 300 мс, `adminUsers(q, 1)`, без поточного акаунта), список знайдених (нік, email); вибір → `GET …/merge/<other>` з поточним як головним; перемикач «Головним лишається: {nickname}» (два варіанти, зміна — новий запит з переставленими id); таблиця з двома стовпцями й рядком «Разом» для рівня й досвіду, далі рядки «Перейде на головний: ігор: N, …» (лише ненульові з `MERGE_COUNT_KEYS`), «Злиються: …», способи входу (`Google`, `Пошта й пароль`), червоне попередження `passwordDropped`; `refusal` — текст `err_<код>` замість кнопки; поле «Щоб підтвердити, введи нік акаунта, що зникне: {nickname}», кнопка «Об'єднати» активна лише при точному збігу; далі `act(...)` з `window.confirm`; успіх → `<Navigate to="/admin/users/<primaryId>">` (якщо головний — ця картка, то перечитування).
- `admin-api.ts`: `mergePreview(primaryId, secondaryId): Promise<ApiData<AccountMergePreview>>`, `mergeAccounts(primaryId, secondaryId, confirm): Promise<ApiResult<{ primaryId: string; summary: MergeSummary }>>`.
- `admin-text.ts`: `mergeSummaryText(summary): string` (ненульові лічильники через «, »; порожньо — `adminMergeNothing`); `logLine` для `account_merge`: `adminLog_account_merge` = `'{admin} об\'єднав(-ла) акаунт {text} з акаунтом {target}: {summary}'`. CSV бере той самий текст.

**Що найімовірніше вкусить (тести — у задачах)**
1. Вхід старою адресою й старим паролем після об'єднання, коли в `P` пароля не було (задача 2 + 5: тест через проксі).
2. Та сама гра в обох — рахунки інших гравців і місця не змінюються, у грі лишається два рядки (задача 4).
3. Обидва в одній групі, `S` — власник: група має рівно одного власника — `P` (задача 3).
4. Збій посередині — обидва акаунти цілі, сесії `S` живі, журналу немає (задача 5).
5. Нова таблиця з ключем на `user` (план 65 чи пізніший) — червоний схема-тест, а не тихо загублені рядки (задача 4).

---

### Задача 1. Спільні типи, схема тіла, вид журналу

**Files:**
- Create: `packages/shared/src/account-merge.ts`, `packages/shared/src/account-merge.test.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/admin.ts` (`ADMIN_ACTION_KINDS`, `ADMIN_LOG_GROUP_KINDS.players`, `AdminLogDetails.merge`)

**Interfaces:**
- Produces: усе з «Спільне» вище — `MERGE_LOGINS`, `MergeLogin`, `MERGE_REFUSALS`, `MergeRefusal`, `MergeCounts`, `MERGE_COUNT_KEYS`, `MergeSummary`, `emptyMergeSummary`, `MergeSide`, `AccountMergePreview`, `adminMergeSchema`; вид `'account_merge'`.

- [ ] **Step 1: Write the failing tests** у `account-merge.test.ts`:
  - `it('an empty summary has every count at zero, no logins and no dropped password')` — `MERGE_COUNT_KEYS.every((k) => emptyMergeSummary()[k] === 0)`, `logins` `[]`, `passwordDropped` `false`, `sameGames`…`sameAchievements` `0`; `MERGE_COUNT_KEYS` — `['games','hosted','quizzes','achievements','xp','friends','groups','prizes','likes','calendar','challenges','league']`.
  - `it('the merge body takes the secondary id and the typed confirmation only')` — `{ secondaryId: 'u2', confirm: 'Оля' }` проходить; зайве поле, `secondaryId: ''`, 65 символів, `confirm` 201 символ — ні.
  - `it('account_merge is a players log kind')` — `ADMIN_ACTION_KINDS` містить `'account_merge'`, `ADMIN_LOG_GROUP_KINDS.players` теж (наявний тест «рівно в одній групі» лишається зеленим).
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/account-merge.test.ts packages/shared/src/admin.test.ts`. Expected: FAIL (модуля немає).
- [ ] **Step 3: Implement** `account-merge.ts` за «Спільне», експорт з `index.ts`, правки `admin.ts`.
- [ ] **Step 4: Run** те саме + `pnpm exec tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared/src
git commit -m "feat(shared): 66 merge accounts — preview and summary types, the merge body schema, refusal codes and the account_merge log kind in the players group"
```

### Задача 2. Таблиця `merged_email`, вхід старою адресою, заборона реєстрації на неї

**Files:**
- Modify: `apps/server/src/db/schema.ts` (таблиця `mergedEmail`), `apps/server/drizzle/<наступний>_merged_email.sql` + `drizzle/meta/*` (генерувати `pnpm --filter @quiz/server exec drizzle-kit generate --name merged_email` після злиття 65), `apps/server/src/auth.ts` (хук), `apps/server/src/account-routes.ts` (переписування адреси), `apps/server/src/account-delete.test.ts` (`referencing` + `HANDLED` + рядок у великому тесті), `apps/web/src/api.ts` (`AUTH_CODES`)
- Create: `apps/server/src/merged-email.ts`, `apps/server/src/merged-email.test.ts`

**Interfaces:**
- Produces: `mergedEmail` (`email text pk`, `user_id text not null → user.id on delete cascade`, `merged_at timestamptz not null`, індекс `merged_email_user_idx (user_id)`); `isMergedEmail(db: Db, email: string): Promise<boolean>`; `loginEmailFor(db: Db, email: string): Promise<string | null>` (адреса `P`, якщо є псевдонім і жоден `user` не має `email`; інакше `null`; порівняння в нижньому регістрі); `rememberMergedEmail(tx: Tx, input: { email: string; userId: string; now: Date }): Promise<void>` (`on conflict (email) do update set user_id`).

- [ ] **Step 1: Write the failing tests** у `merged-email.test.ts` (`buildApp({ db, auth: TEST_AUTH })`, `signUp`, вхід — як `signIn` у `bans-auth.test.ts`):
  - `it('signing in with a merged address and its password opens the primary account')` — зареєструвати Олю (`olya@…`) і Ольгу (`olga@…`); вручну (як зробить задача 5): `account` credential Ольги → `user_id = Оля, account_id = Оля`, видалити credential Олі, `rememberMergedEmail({ email: 'olga@…', userId: Оля })`, видалити `user` Ольги; `POST /api/auth/sign-in/email { email: 'OLGA@…', password }` → 200, `/api/me` з cookie → `id` Олі.
  - `it('an address that belongs to a live user is never rewritten')` — псевдонім на адресу, що вже має `user` → `loginEmailFor` повертає `null`.
  - `it('signing up with a merged address is refused with EMAIL_MERGED')` — `POST /api/auth/sign-up/email` з адресою-псевдонімом → 400, `code: 'EMAIL_MERGED'`, нового `user` немає.
  - в `account-delete.test.ts`: `HANDLED` + `'merged_email.user_id'`, `referencing` + `merged_email`, великий тест вставляє псевдонім на Тараса — після видалення 0 рядків.
  - веб `api.test.ts` (наявний тест `AUTH_CODES`, звірити назву): `EMAIL_MERGED` → `'email_merged'`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/merged-email.test.ts apps/server/src/account-delete.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** таблицю й міграцію (перевірити SQL: лише `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY`); `merged-email.ts`; у `auth.ts` хук `user.create.before` після перевірки домену бота: `if (await isMergedEmail(db, created.email)) throw new APIError('BAD_REQUEST', { code: 'EMAIL_MERGED', message: 'EMAIL_MERGED' })`; у проксі `account-routes.ts`, перед `new Request`: `POST`, шлях закінчується на `/sign-in/email`, `body.email` — рядок → `const target = await loginEmailFor(db, body.email)`; не `null` → тіло з `email: target`. Веб `AUTH_CODES` + рядок.
- [ ] **Step 4: Run** те саме, потім `pnpm test --project server --maxWorkers=2 apps/server/src/bans-auth.test.ts apps/server/src/auth.test.ts apps/server/src/db/schema.test.ts` і `pnpm test --project web --maxWorkers=2 apps/web/src/api.test.ts`; `pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src apps/server/drizzle apps/web/src/api.ts apps/web/src/api.test.ts
git commit -m "feat(server): 66 merged_email — a merged address signs in to the primary account with the moved password, sign-up and new Google on it are refused with EMAIL_MERGED; additive migration, the deletion test covers the new key"
```

### Задача 3. Правила «люди й вміст»: способи входу, дружба, групи, призи, вітрина, календар, виклики, скарги

**Files:**
- Create: `apps/server/src/account-merge-rules.ts` (типи й `applyMergeRules`), `apps/server/src/account-merge-people.ts` (`PEOPLE_RULES`), `apps/server/src/account-merge-people.test.ts`

**Interfaces:**
- Produces (`account-merge-rules.ts`):
  ```ts
  export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
  export interface MergeContext { primaryId: string; secondaryId: string; primaryNickname: string | null; summary: MergeSummary; secondaryWonGames: Set<string>; earlierOnSecondary: Set<AchievementId> }
  export interface MergeRule { keys: readonly string[] /* 'таблиця.колонка' */; run(tx: Tx, ctx: MergeContext): Promise<void> }
  export function mergeContext(primaryId: string, secondaryId: string, primaryNickname: string | null): MergeContext;
  export async function applyMergeRules(db: Db, ctx: MergeContext, rules: readonly MergeRule[]): Promise<void>; // одна транзакція, по порядку
  ```
- Produces: `PEOPLE_RULES: readonly MergeRule[]` — правила 9–22 з «Рішення плану» у тому порядку (групи до запрошень, призи до вітрини).

- [ ] **Step 1: Write the failing tests** у `account-merge-people.test.ts` (люди й рядки — як помічники `person`, `group`, `ownQuiz` у `account-delete.test.ts`; для `showcase_pin` і `achievement_block`, що залежать від досягнень, у `ctx` вручну заповнити рядки `user_achievement` `P`):
  - `it('a Google login moves to the primary and the password moves with account_id set to the primary')` — `S`: `google`/`g-1` і `credential`/`S`; `P`: без пароля → у `P` рядки `google g-1` і `credential` з `account_id = P` і хешем `S`; `summary.logins` `['google','credential']`, `passwordDropped` `false`; рядків `account` з `user_id = S` немає; дублікатів `(provider_id, account_id)` немає.
  - `it('when both have a password the primary keeps its own and the secondary one is dropped')` — `passwordDropped` `true`, у `P` один `credential` зі старим хешем `P`.
  - `it('the secondary sessions are closed and the primary ones stay')`.
  - `it('friends merge into one row each way and their friendship with each other disappears')` — `S→Петро`, `P→Петро`, `Петро→S`, `P→S`: після — `P→Петро`, `Петро→P`, жодного `P→P`; `sameFriends` `1`.
  - `it('in a shared group the primary keeps one row with the earlier join and becomes owner when the secondary owned it')` — рівно один `owner` у групі, `joined_at` раніша; `sameGroups` `1`; група лише `S` → `P` член.
  - `it('an invite to a group the primary is already in is dropped')`.
  - `it('the title with the later expiry stays')`; `it('a block is dropped when the merged account owns that achievement')`.
  - `it('secondary pins fill free slots up to the limit and duplicates are dropped')` — `P`: 2 призи, `S`: 2 призи → у `P` 3 закріплення (слоти 0–2), без порушень унікальних індексів.
  - `it('a calendar request for an event the primary now hosts is dropped')`; `it('the earlier challenge attempt stays')`; `it('a report of the primary on itself is dropped')`.
  - `it('quizzes, hosted games, library, push devices, created plans and resolved errors move to the primary')` — по рядку на кожен ключ з правила 19, після — 0 рядків з `S`; `summary.quizzes`, `hosted`.
  - `it('a banned secondary throws and nothing moves')` — рядок `user_ban` на `S` → `applyMergeRules` кидає, рядки `S` на місці.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/account-merge-people.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `account-merge-rules.ts` і `account-merge-people.ts` за правилами 9–22 (конфлікти — спершу `delete` рядків `S`, що конфліктують, за `exists (…)`, потім `update`; без `on conflict` на `update`).
- [ ] **Step 4: Run** те саме + `pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/account-merge-rules.ts apps/server/src/account-merge-people.ts apps/server/src/account-merge-people.test.ts
git commit -m "feat(server): 66 merge rules for people and content — Google and password logins move to the primary (account_id rewritten, a second password dropped), sessions closed, friends, groups, invites, titles, blocks, prizes, showcase pins, calendar, challenges and reports merged without duplicates"
```

### Задача 4. Правила «історія й рахунок», JSON і схема-тест на кожен ключ

**Files:**
- Create: `apps/server/src/account-merge-history.ts` (`HISTORY_RULES`, `MERGE_JSON_RULES`), `apps/server/src/account-merge-history.test.ts`
- Modify: `apps/server/src/account-merge-rules.ts` (`MERGE_RULES = [...HISTORY_RULES, ...PEOPLE_RULES]`, `MERGE_JSON_KEYS`)

**Interfaces:**
- Consumes: `MergeContext`, `MergeRule`, `applyMergeRules` (задача 3).
- Produces: `HISTORY_RULES` — правила 1–8; `MERGE_JSON_RULES: readonly MergeRule[]` з ключами `'saved_game.data'`, `'live_room.data'`, `'group_item.about'`, `'bot_plan.people'`, `'push_broadcast.people'`, `'admin_action.target_user_id'`; `MERGE_RULES: readonly MergeRule[]`.

- [ ] **Step 1: Write the failing tests** у `account-merge-history.test.ts` (ігри — `seedGame` з `testing/history-rows.ts`):
  - `it('the same game twice keeps the row with more points for the primary and the other row stays as a guest row')` — гра Олі (ведуча), `S` 7 балів, `P` 3: після — рядок з 7 має `user_id = P`, рядок з 3 — `user_id null`, той самий нік, рахунки й `rank` усіх рядків гри не змінились; `secondaryWonGames` має гру; `sameGames` `1`; `playerHistory(db, P)` має гру один раз.
  - `it('an achievement in both keeps the earlier date and its game')` — `null` («давно») перемагає дату.
  - `it('xp is the sum of both journals and the same game keeps the larger amount')` — `xpTotals(P)` = сума без меншого з дубля; рядки `admin` обох — на місці.
  - `it('league points of one game keep the larger, month totals add up, and champions of one month sum their points')` — `leagueTable(group, month)` показує `P` з сумою.
  - `it('feed events are rekeyed to the primary and a liked event keeps its like')` — `game:<g>:S` → `game:<g>:P`; лайк Петра на подію `S` тепер з `event_key` нової; при конфлікті лишається подія переможця рядка гри.
  - `it('likes of each other and duplicate likes are dropped')`.
  - `it('the profile keeps the primary nickname and avatar, takes the later last seen, the higher feed level and resets sync marks to the earlier')`.
  - `it('a saved game and a finished live room bind the primary seat, a second seat of the same person becomes a guest')` — `playerUsers` `[[p1,S],[p2,Оля]]` → `[[p1,P],[p2,Оля]]`; `[[p1,S],[p2,P]]` → `[[p2,P]]`, `forgotten` відсутній; `hostUserId: S` → `P`.
  - `it('group facts about the secondary now name the primary; bot plans and broadcasts list the primary once; admin log targets move')`.
  - `describe('the schema')` → `it('every foreign key to user has a merge rule')` — той самий обхід `getTableConfig(table).foreignKeys`, що в 58; `expect(keys.sort()).toEqual(MERGE_RULES.flatMap((r) => r.keys).sort())` (без JSON-ключів); `it('no key has two rules')`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/account-merge-history.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `account-merge-history.ts` (правила 1–8 у порядку з «Рішення плану»; переписування JSON — так само, як `withoutPairs`/`forgetInLiveRooms` у 58, вибір рядків — `hasPair`, з'єднання — `jsonb_agg … order by`), зібрати `MERGE_RULES`.
- [ ] **Step 4: Run** те саме, потім `apps/server/src/account-merge-people.test.ts` і `apps/server/src/account-delete.test.ts` (по одному запуску, не разом з іншими командами); `pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/account-merge-history.ts apps/server/src/account-merge-history.test.ts apps/server/src/account-merge-rules.ts
git commit -m "feat(server): 66 merge rules for history — the same game keeps the higher-scoring row, earlier achievement date, summed xp journals, league points and champions, rekeyed feed events with their likes, merged profile; seat bindings in saved games and rooms, group facts, plan and broadcast lists; a schema test forces a rule for every foreign key to user"
```

### Задача 5. `mergeAccounts` і `previewMerge`: відмови, одна транзакція, видалення 58 без свого журналу

**Files:**
- Create: `apps/server/src/account-merge.ts`, `apps/server/src/account-merge.test.ts`
- Modify: `apps/server/src/account-delete.ts` (необов'язкове `log?: boolean`), `apps/server/src/account-delete.test.ts` (тест `log: false`)

**Interfaces:**
- Consumes: `MERGE_RULES`, `MERGE_JSON_RULES`, `mergeContext` (3–4), `rememberMergedEmail` (2), `deleteAccount` (58).
- Produces:
  ```ts
  export interface MergeInput { adminId: string; primaryId: string; secondaryId: string; now: Date; adminEmails: ReadonlySet<string> }
  export type MergeOutcome = { ok: true; summary: MergeSummary; after: { level: number; xp: number } } | { ok: false; error: 'not_found' | MergeRefusal };
  export async function mergeAccounts(db: Db, input: MergeInput): Promise<MergeOutcome>;
  export async function previewMerge(db: Db, input: MergeInput): Promise<AccountMergePreview | null>; // null — котрогось немає чи бот
  export async function liveInDb(db: Db | Tx, userIds: string[]): Promise<boolean>;
  export async function mergeLabel(db: Db | Tx, userId: string): Promise<string | null>; // nickname ?? email
  ```
  `deleteAccount(db, { …, log?: boolean })` — `false` пропускає лише `logAction('account_delete')`.

- [ ] **Step 1: Write the failing tests** у `account-merge.test.ts`:
  - `it('merges two accounts in one go: rows move, the secondary is gone, the log line carries the summary')` — `P` і `S` з грою, вікториною, другом, групою, досягненням, досвідом; після — `referencing(S)` (скопіювати помічник з 58 або винести в `testing/user-refs.ts` і взяти в обох тестах) — усе нулі, рядка `user` `S` немає; один рядок журналу `account_merge` з `targetUserId = P`, `details.text` = нік `S`, `details.merge.games` = 1 …; рядка `account_delete` **немає**; `after.level === levelOf(xpTotals(P))`.
  - `it('the preview equals the merge and changes nothing')` — `previewMerge(...).summary` дорівнює `mergeAccounts(...).summary`, а між ними база незмінна (кількість рядків по `referencing(S)` до й після перегляду однакова, журнал порожній).
  - `it('refuses an admin secondary, someone else\'s admin primary, a banned side and a live room in the database')` — `merge_admin` ×2, `merge_banned`, `merge_live` (рядок `live_room` з `state.phase: 'question'` і парою `S`); адмін, що діє, як `P` зі своїм другим акаунтом — `ok`.
  - `it('a merged password lets the person sign in with the old address into the primary')` — через `buildApp` + `signUp` для обох, потім у `P` видалити рядок `credential` і додати `google`/`g-p` (головний «з Google»), `mergeAccounts` → `POST /api/auth/sign-in/email` старою адресою `S` → `/api/me` `id = P`.
  - `it('a failure in the middle merges nothing')` — тригер `before delete on "user"` для `S` (як у 58) → `mergeAccounts` кидає; рядки `S` на місці, сесія `S` жива, `merged_email` порожня, журналу немає.
  - в `account-delete.test.ts`: `it('log: false deletes without its own log line')`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/account-merge.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Порядок `mergeAccounts`»; `previewMerge` — та сама внутрішня функція `runMerge(tx, input)` + `throw new MergeRollback(result)` і перехоплення поза `db.transaction`; при відмові перегляд повертає `refusal` без запуску правил. `deleteAccount` усередині: `deleteAccount(tx as unknown as Db, { …, log: false })`.
- [ ] **Step 4: Run** те саме, потім окремо `apps/server/src/account-delete.test.ts`; `pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 66 mergeAccounts — refusals for admins, bans and live rooms, every rule in one transaction, the merged address remembered, the empty secondary deleted by the plan 58 procedure without its own log line, one account_merge line with the summary; previewMerge runs the same path and rolls back"
```

### Задача 6. Кімнати й маршрути адмінки

**Files:**
- Modify: `apps/server/src/rooms/manager.ts` (`inLiveGame`, `rebindUser`), `apps/server/src/admin-card-routes.ts`, `apps/server/src/admin-routes.test.ts` (`routes`)
- Create: `apps/server/src/rooms/manager.merge.test.ts`, `apps/server/src/admin-merge-routes.test.ts`

**Interfaces:**
- Produces: `RoomManager.inLiveGame(userId: string): boolean` (кімната не `finished`, ведучий чи пара `playerUsers`); `RoomManager.rebindUser(from: string, to: string): number` (пари `from` → `to`, якщо `to` вже в кімнаті — пара `from` зникає; `hostUserId` `from` → `to`; повертає кількість змінених пар); маршрути з «Маршрути» вище.

- [ ] **Step 1: Write the failing tests:**
  - `manager.merge.test.ts`: `it('a player in a running room is live, a finished room is not')`; `it('rebinding moves seats and the host to the primary and drops a second seat of the same person')`.
  - `admin-merge-routes.test.ts` (як `admin-card-routes.test.ts`): `it('the preview shows counts, logins and the confirmation label; a non-admin gets 404')`; `it('a wrong confirmation is 400 confirm_mismatch and nothing changes')`; `it('merging while one of them plays is 409 merge_live')` (гравець з акаунтом `S` у кімнаті `manager`); `it('the bot as either side is 404, the same id twice is 400 merge_same')`; `it('a merge returns the summary, closes the secondary session (its /api/me is 401) and the primary card shows the moved game')`; `it('while restarting the merge is 503')`.
  - `admin-routes.test.ts` `routes` + `['GET', '/api/admin/users/u1/merge/u2']`, `['POST', '/api/admin/users/u1/merge']`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/rooms/manager.merge.test.ts apps/server/src/admin-merge-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** методи менеджера й маршрути; у POST: `frozen` → 503; `manager.inLiveGame(P) || manager.inLiveGame(S)` → 409 `merge_live`; мітка й `confirm_mismatch`; `mergeAccounts`; після `ok` — `manager.rebindUser(S, P)` і `announce` (через `player-card.ts`, експортувати `announce`, якщо ще не експортований).
- [ ] **Step 4: Run** те саме, потім окремо `apps/server/src/admin-routes.test.ts` і `apps/server/src/admin-card-routes.test.ts`; `pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 66 merge routes on the player card — preview with refusal reasons, merge with the typed nickname, live rooms in memory and in the database refused, seats in finished rooms rebound to the primary, 503 while restarting, both routes behind the admin gate"
```

### Задача 7. Веб: розділ «Об'єднати з іншим акаунтом», рядок журналу, 7 мов

**Files:**
- Create: `apps/web/src/admin/card/CardMerge.tsx`, `apps/web/src/admin/card/CardMerge.test.tsx`
- Modify: `apps/web/src/admin/AdminUser.tsx` (розділ перед `CardDelete`), `apps/web/src/admin/admin-api.ts`, `apps/web/src/admin/admin-text.ts` (+ `admin-text.test.ts`), `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,de,es,it,pl,ar}.json`, `apps/web/src/i18n.test.ts` (`ADDED_MERGE_66`), стилі картки (той самий файл, де `.admin-card-section`, звірити)

**Interfaces:**
- Consumes: `AccountMergePreview`, `MergeSummary`, `MERGE_COUNT_KEYS` (1); маршрути (6).
- Produces: `mergePreview`, `mergeAccounts` (`admin-api.ts`); `mergeSummaryText(summary: MergeSummary): string`.

- [ ] **Step 1: Write the failing tests:**
  - `CardMerge.test.tsx`: `it('finds another account, shows what moves and the logins, and enables merge only after the exact nickname')`; `it('swapping the primary asks again with the ids swapped')`; `it('a refusal shows its reason and no merge button')` (`merge_live` → «Хтось із двох зараз у живій грі — спробуй після гри»); `it('a dropped password is warned about')`; `it('after the merge it opens the primary card')`.
  - `admin-text.test.ts`: `it('the merge log line lists the non-zero counts')` — `{ games: 3, quizzes: 1, xp: 120, … }` → «Адмін об'єднав(-ла) акаунт Ольга з акаунтом Оля: ігор: 3, вікторин: 1, досвіду: 120».
  - `i18n.test.ts`: `ADDED_MERGE_66` у двох місцях, як `ADDED_ERRORS_64`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/admin/card/CardMerge.test.tsx apps/web/src/admin/admin-text.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** uk-ключі (і переклади в шість мов; змінні збігаються): `adminMerge` «Об'єднати з іншим акаунтом», `adminMergeLead` «Усе з другого акаунта перейде на головний, а другий зникне. Входити можна буде будь-яким способом обох.», `adminMergeSearch` «Знайти акаунт (нік чи email)», `adminMergePrimary` «Головним лишається: {nickname}», `adminMergeTotal` «Разом: рівень {level}, досвід {xp}», `adminMergeMoves` «Перейде на головний: {summary}», `adminMergeSame` «Злиються: {summary}», `adminMergeLogins` «Способи входу: {logins}», `adminMergeLoginGoogle` «Google», `adminMergeLoginCredential` «Пошта й пароль», `adminMergeLoginOther` «Інший», `adminMergePasswordDropped` «Пароль акаунта {nickname} перестане діяти: входити паролем головного (адресою будь-якого з двох).», `adminMergeType` «Щоб підтвердити, введи нік акаунта, що зникне: {nickname}», `adminMergeConfirm` «Об'єднати {secondary} з {primary}? Це не скасувати.», `adminMergeNothing` «нічого», лічильники `adminMergeCount_<key>` («ігор: {count}», «проведених ігор: {count}», «вікторин: {count}», «досягнень: {count}», «досвіду: {count}», «друзів: {count}», «груп: {count}», «призів: {count}», «вподобайок: {count}», «календар: {count}», «челенджів: {count}», «ліга: {count}») і `adminMergeSame_<games|groups|friends|achievements>`, `adminLog_account_merge`, помилки `err_merge_same`, `err_merge_admin` («Адміна об'єднати не можна (лише свій другий акаунт у свій головний)»), `err_merge_banned` («Спершу розбань»), `err_merge_live`, `err_merge_failed`, `err_email_merged` («Ця адреса вже приєднана до іншого акаунта — увійди з нею й паролем»).
- [ ] **Step 4: Run** те саме, потім окремо `apps/web/src/i18n.test.ts`, `apps/web/src/admin/AdminUser.test.tsx`, `apps/web/src/source-scan.test.ts`; `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src
git commit -m "feat(web): 66 merge section on the player card — search another account, choose the primary, see what moves, merged duplicates and logins, a dropped-password warning, refusal reasons, type the nickname to merge; the log line lists the moved counts; seven languages"
```

### Задача 8. Наскрізний сценарій і кадри (`part66-merge-accounts.e2e.ts`), повтор part 58

**Files:**
- Create: `apps/server/e2e/part66-merge-accounts.e2e.ts` (сервер з адміном через `relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: 'admin66@example.com' }) })`, як `part58-player-card.e2e.ts`; у `finally` — `relisten()`; телефони 360 × 740, світла тема — помічники `light`, `view`, `section` з part 58).

**Сценарій** (люди: адмін «Адмін 66»; Оля — головний, `olya66@example.com`; «Оля Нова» — її другий акаунт, `olya66b@example.com`; Петро — друг і гравець; обидва акаунти Олі реєструються паролем через `register`):
`it('part 66: merge accounts — two accounts of one person with games, friends and a group: the admin previews what moves, refuses while one plays, merges after typing the nickname; the person signs in with either address into one account whose history is complete; phone 360 px, light theme')`:
1. Кожен акаунт — в окремому контексті браузера. Оля (головний) веде коротку гру з Петром. Петро веде гру з одного запитання, у якій грають **обидва** акаунти Олі («та сама гра двічі»: «Оля Нова» відповідає правильно, Оля — ні). Петро додає в друзі обох; «Оля Нова» створює групу «Родина», Петро й Оля вступають за посиланням.
2. «Оля Нова» заходить у лобі гри Петра: адмін відкриває картку Олі → «Об'єднати з іншим акаунтом» → шукає «Оля Нова» → у перегляді рядок «Хтось із двох зараз у живій грі…», кнопки немає. Петро закриває лобі.
3. Перегляд: «Головним лишається: Оля», «Перейде на головний: ігор: 1, …», «Злиються: ігор: 1, груп: 1, друзів: 1», «Способи входу: Пошта й пароль», червоний рядок про пароль; кадр `merge66-preview-360`.
4. Невірний нік — кнопка неактивна; точний «Оля Нова» → підтвердження → картка Олі; у «Іграх» обидві гри; кадр `merge66-done-360`.
5. Сесія «Оля Нова» закрита: її сторінка після перезавантаження — гість. Вхід `olya66b@example.com` + пароль → профіль Олі (нік «Оля»), в історії обидві гри (гра Петра — один раз, з балами «Оля Нова»), друг Петро один раз, група «Родина» одна, Оля — власниця; вихід; вхід `olya66@example.com` → той самий акаунт (`myId` однаковий).
6. Реєстрація з `olya66b@example.com` → «Ця адреса вже приєднана до іншого акаунта…».
7. `/admin/log` — рядок «Адмін 66 об'єднав(-ла) акаунт Оля Нова з акаунтом Оля: ігор: 1, …». На всіх екранах — без бокового скролу, `is-light`.

- [ ] **Step 1: Write the scenario.** Помічники — `helpers/common.ts` (`open`, `register`, `join`, `myId`, `expectNoSideScroll`), сервер з адміном — як у part 58.
- [ ] **Step 2: Run** `pnpm build`, потім (після завершення збирання) `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 66"` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 3: Run** після part 66, не одночасно: `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 58"`. Expected: PASS (видалення з `log` за замовчуванням не змінилось).
- [ ] **Step 4: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 66 — two accounts of one person with games, friends and a group: refused while one is in a lobby, previewed, merged after typing the nickname; the secondary session is closed, either address signs in to one account with the full history, sign-up on the merged address is refused, the log line lists the summary; 360 px, light theme"
```

## Розбіжності зі специфікацією

- **«Вхід обома способами».** Better Auth прив'язує пароль до email рядка `user` (`account_id = user.id`), тож після видалення `S` його адреса сама по собі не працює. Рішення — таблиця-псевдонім `merged_email` і переписування адреси в проксі входу; це **одна нова таблиця** (специфікація дозволяє міграції-додавання). Google переходить без псевдоніма (власника шукають за рядком `account`).
- **Два паролі не лишаються.** Якщо пароль є в обох, діє пароль головного, а пароль другорядного зникає (Better Auth знає лише один `credential` на акаунт); адмін бачить попередження до об'єднання, людина входить будь-якою з двох адрес паролем головного. Якщо в головного пароля не було (типово: головний — Google), пароль другорядного стає його паролем.
- **Бот** як будь-яка сторона — 404, а не окрема відмова: так уся картка 58 ставиться до бота; результат той самий — об'єднання неможливе.
- **Адмін:** «якщо не той самий адмін» читається як «адмін може злити свій другий акаунт у свій головний»; адмін як другорядний — ніколи (його не видаляє і процедура 58).
- **Журнал — один рядок `account_merge`**, без окремого `account_delete` від процедури 58 (нове поле `log: false`); мітка й підсумок — у ньому.
- **«Та сама гра двічі»:** рядок з меншими балами не видаляється, а лишається в грі гостьовим (без акаунта), щоб не змінювати рахунку й місць інших гравців; досвід і ліга за цю гру — від рядка, що лишився (більший `amount` / `points`).
- **Досвід — сума журналів**, але в межах унікальних правил: одна гра й одне досягнення дають досвід один раз. Денна стеля не перераховується заднім числом.
- **Аватар і нік** — завжди головного, навіть якщо в головного аватара немає (специфікація: «його нік, аватар»).
- **Попередній перегляд** не рахує окремими запитами, а проганяє саме об'єднання й відкочує транзакцію — цифри перегляду збігаються з результатом.
- **Жива гра** перевіряється і в пам'яті процесу, і в `live_room` (кімнати інших процесів під час розгортання); кімнати, що встигли закінчитись, переприв'язуються на головний після фіксації.
