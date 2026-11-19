# План 58: картка гравця в адмінці — огляд, досягнення, ручний досвід, ігри, вікторини, бани, скидання, видалення акаунта й подарунок-приз (44c)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** Ні `GameState`, ні `SavedRoom`, ні зрізи не змінюються. Нове в менеджері — лише метод `forgetUser`, що прибирає прив'язку акаунта з `room.playerUsers` (дані кімнати, не стан гри). Якщо виконавцю знадобиться нове поле в `GameState`, `Room`-знімку чи `SavedRoom` — **зупинитися й спитати контролера**.

> **Міграція — `0043_player_card` (наступний вільний номер; очікувано 0043).** План 56 бере `0042_bot_plan`, план 57 міграції не має. Якщо на момент генерації в `apps/server/drizzle/meta/_journal.json` уже є `0043_…` — взяти наступний номер і так само назвати тест. Лише додавання: нова таблиця `achievement_block` і нові стовпці з типовим значенням (`xp_entry.note`, `prize_award.gift`, `prize_award.gift_note`) — жодного `DROP`, перейменування чи зміни наявного стовпця.

> **Звірка з кодом.** План спирається на `main` 2026-11-19 (`1f78871e`, специфікація 44c) і на плани 56 (`docs/superpowers/plans/2026-11-19-plan-56-bot-schedule.md`) і 57 (`…-plan-57-quiz-check.md`), що будуються раніше:
> - адмінка, сервер: `apps/server/src/admin-routes.ts` (`AdminDeps`, `adminOf`, ворота `gate` → 404, `read` 120/хв, `write` 30/хв, `USER_ID_MAX = 64`, `UUID`; бан ~178: `id === me.id || isAdmin(...)` → 409 `cannot_ban_admin`, `manager.frozen` → 503 `restarting`, `manager.closeHostedBy(id)`; видалення нагороди ~250 `deleteAward` + `logAction('award_delete')`; скидання ніка/аватара — `POST /api/admin/reports/profile/:userId` ~305 → `report-store.ts` `actOnProfile` ~255; у кінці — `await registerAdminBotRoutes(app, deps, { read, write, adminOf })`), `admin-store.ts` (`userRows` виключає `BOT_USER_ID`, `adminUser(db, emails, id, now)` ~133 → `AdminUserDetail { user, stock, awards, title }`), `bans.ts` (`logAction(tx, { adminId, kind, targetUserId, details, now })` — мітка цілі — нік до дії), `bot-account.ts` `ensureBotAccount(db)`; тести `admin-routes.test.ts` (`person(name, verified)` ~35, `lastLog()` ~59, `describe('hiding the admin panel (Review Focus 3)')` ~90 зі списком `routes`);
> - спільне: `packages/shared/src/admin.ts` (`ADMIN_ACTION_KINDS` ~15, `AdminLogDetails` ~41, `AdminAward` ~39, `AdminUserDetail` ~40), `levels.ts` (`ACHIEVEMENT_XP`, `achievementRarity`, `xpForLevel`, `levelOf` — від'ємне XP дає рівень 1, `OwnLevel` ~383), `feed.ts` (`FeedData` `prize`), `prizes.ts` (`AwardCard`, `PrizePlace = 1|2|3`, `PRIZE_LIMITS`, `TITLE_MS`), `bot.ts` (`BOT_USER_ID`, `isBotUser`), `achievements.ts` (`ACHIEVEMENTS`);
> - досвід: `apps/server/src/xp-store.ts` — `xp_entry` — журнал, **рівень = `levelOf(сума amount усіх рядків)`** (`xpTotals` ~364, `ownLevel` ~438, `publicLevel`, `accountLevel`); `syncXp` ~246 (ретро `retro` ~150 і наздоганяння `catchUp` лише **дописують** рядки `source = 'game'` з `onConflictDoNothing`; денна стеля рахує лише `source = 'game'` — `gameRows` ~75); `creditAchievements(db, userId)` ~209 — рядок `'achievement'` для кожного `user_achievement` без рядка; рядків `xp_entry` не видаляє ніхто; `gameXpMoments` ~294; оголошення рівня — `feed-publish.ts` `announceLevels(db, userIds, gameId, at)` ~144 (умовне `feed_level < level`, ключ `level:<userId>:<n>`);
> - досягнення: `apps/server/src/achievement-store.ts` — `syncAchievements(db, userId, at, options)` ~335 **лише вставляє** (`onConflictDoNothing`, єдине місце вставки `user_achievement` у коді ~388), але **щоразу** переоцінює кар'єрні факти (`careerEarned(facts)` ~377) і на першому проході — історію (`historyAchievements`), тож забране досягнення без заборони повернулося б на найближчому читанні сторінки досягнень чи фініші гри; `storedOf` ~218; `awardGame` ~422; стрічка досягнень — `feed-publish.ts` `writeAchievementEvents` (лише з `game_id`, ключ `achievement:<userId>:<id>`); закріплення — `showcase-pins.ts` (`dropAwardPin` ~100, вид `'achievement'`);
> - призи: `apps/server/src/prizes.ts` (`listPrizes(db, ownerId)` — склад власника free+reserved; `awardPrizes` ~260 — `prize_award` зі знімком `content`, `quizTitle`, `nickname`, титул `user_title` на `TITLE_MS`; `showcaseOf` ~303; `deleteAward(db, awardId)` ~343 — з титулом і закріпленням); таблиці `prize`, `prize_award` (`game_id uuid not null` без FK, `place`, унікальний `(game_id, place, user_id)`), `user_title` (`game_id not null`); стрічка призу — `writePrizeEvents` (join `game`, ключ `prize:<awardId>`); веб — `profile/Showcase.tsx` ~54 (`awardLine`), `feed/feed-text.ts` ~25, редактор — `pages/PrizeStudioPage.tsx` (`STORE = '/profile/prizes'`), API `apps/web/src/api.ts` `myPrizes()`;
> - **самовидалення акаунта немає** (ні маршруту, ні Better Auth `deleteUser`); зовнішні ключі на `user`: майже всі `cascade`, `participant.user_id` — `set null` (гра лишається в історії інших з ніком-знімком), **`game.host_id` — `cascade`** (видалення ведучого стерло б його ігри з історії гравців), `group_member` — `cascade` (група лишилася б без власника; `group-store.ts` `transferOwner`, `deleteGroup`); збережені ігри тримають `playerUsers` у `saved_game.data` (`saved-games.ts` ~40–60), живі кімнати — у `room.playerUsers` (рекордер пише `participant.user_id` з них — `recorder.ts` ~405, ~428);
> - історія: `apps/server/src/history.ts` — `playerGames(db, userId, limit)` ~1022 (`PlayedGame`: `gameId`, `title`, `startedAt`, `rank`, `score`, `playerCount`), `hostGameWithFacts(db, hostId, id)` ~606 (фільтр `game.host_id`); веб `pages/GameHistory.tsx` (`GameHistory` ~325, тіло після завантаження ~355);
> - веб, адмінка: `apps/web/src/admin/AdminUser.tsx` (`UserView`, `act(confirmText, run)`), `AdminUsers.tsx` `UserCard`, `admin-api.ts`, `useAdminData.ts`, `admin-text.ts` `logLine` ~21, `Admin.tsx` (`<Routes>`), рівні гравця — `pages/profile/ProfileLevels.tsx`; `i18n.ts` (блок адмінки), `locales/{en,de,es,it,pl,ar}.json`, `i18n.test.ts` (зразок `it('54 keys (the bot tab) are in every language')` ~487, довга умова `adds no uk keys beyond the agreed list` ~673);
> - тести бази: `testing/test-db.ts` `createTestDb()`, `createTestDbUpTo(tag)` + `migrateRest`; зразок тесту міграції — `db/schema.test.ts` `describe('announcement (53)')` ~857; генерація — `pnpm --filter @quiz/server exec drizzle-kit generate --name player_card`;
> - e2e: `apps/server/e2e/helpers/setup.ts` (`relisten`, `flags.restarting`, `ctx.shutdown()`), `helpers/common.ts` (`open`, `register(page, via, name, email)`, `myId`, `expectNoSideScroll`), зразок адміна — `part54-bot-host.e2e.ts` / `part47-library.e2e.ts`.
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

> **Точки злиття з планами 56 і 57** (будувати від `main` після їх злиття; якщо ще не злиті — додати так само й розв'язати конфлікт, залишивши обидва): `packages/shared/src/admin.ts` (рядок `ADMIN_ACTION_KINDS`: 56 — `bot_plan_*`, 57 — `quiz_view`, 58 — свої шість у кінці; `AdminLogDetails`: 56 додає `when?`, 58 — `achievementId?`, `amount?`), `apps/server/src/admin-routes.ts` (один рядок реєстрації `registerPlayerCardRoutes` у кінці, після бота), `admin-routes.test.ts` (список `routes`), `apps/server/drizzle/meta/_journal.json` (номер міграції), `apps/server/src/db/schema.test.ts` (новий `describe` у кінці), `apps/web/src/admin/Admin.tsx` (`<Routes>`: 57 — `bot/quizzes/:id`, 56 — свій підмаршрут; 58 — `games/:id`), `apps/web/src/admin/AdminUser.tsx` (переписується цим планом; 56/57 його не мають торкатися — якщо торкнулися, перенести їхнє в нову розкладку), `admin-text.ts` (`logLine`: 56 передає `when`, 58 — `amount`, `achievement`), `i18n.ts` (блок адмінки), `locales/*.json`, `i18n.test.ts` (списки `ADDED_BOT_SCHEDULE_56`, `ADDED_QUIZ_CHECK_57`, `ADDED_PLAYER_CARD_58` — усі три в довгій умові), `styles.css`.

**Мета:** сторінка `/admin/users/:id` стає карткою гравця: огляд (нік, аватар, email, реєстрація, останній вхід, рівень і досвід, ігри/перемоги, вікторини, друзі, групи), досягнення з видачею й забиранням, ручний досвід з причиною (видно гравцю на його сторінці рівнів), останні 20 ігор з адмінським переглядом гри, вікторини, історія банів, скидання ніка й аватара, видалення акаунта з підтвердженням ніком, подарунок-приз з бібліотеки трофеїв адміна з позначкою «Подарунок від адміністратора» і подією в стрічці; усе — у журналі адмінки.

**Архітектура:** спільне — `packages/shared/src/player-card.ts` (типи картки, схеми дій, межі, `DELETED_NICKNAME`). База — міграція `0043_player_card`: `achievement_block` (заборона повторної видачі забраного досягнення, її бачить `syncAchievements`), `xp_entry.note` + новий `source = 'admin'`, `prize_award.gift`/`gift_note`. Сервер — сховища `player-card.ts` (читання картки, досягнення, досвід), `player-gifts.ts` (подарунки), `account-delete.ts` (видалення) і маршрути `admin-card-routes.ts` за воротами адмінки. Веб — `AdminUser.tsx` з розділами в `apps/web/src/admin/card/*`, `AdminGame.tsx` (адмінський перегляд гри через спільний `GameDetailView`), позначка подарунка у вітрині й стрічці, ручний досвід на сторінці рівнів.

**Технології:** TypeScript, zod 4, Fastify + `@fastify/rate-limit`, drizzle (Postgres) + drizzle-kit, vitest (проєкти `shared`/`server`/`web`), React 19 + Testing Library, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-19-player-card-design.md` (44c); основа адмінки — `docs/superpowers/specs/2026-11-01-admin-panel-design.md`.

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22**; форма `GameState`, `SavedRoom`, зрізів — без змін.
- **Міграція лише додає:** `0043_player_card` (наступний вільний номер) = `CREATE TABLE "achievement_block"` + `ALTER TABLE … ADD COLUMN` з `NULL` чи `DEFAULT` (`xp_entry.note text`, `prize_award.gift boolean DEFAULT false NOT NULL`, `prize_award.gift_note text`); першим рядком SQL — `-- Картка гравця (план 58): заборона забраних досягнень, ручний досвід з причиною, подарунки адміна.` Нові види журналу й `xp_entry.source = 'admin'` — значення `text`-колонок.
- **Ручне не перераховується назад:** жоден наявний шлях (`syncXp`, `retro`, `catchUp`, `creditAchievements`, `syncAchievements`, `awardGame`, `backfillFeed`) не видаляє й не переписує рядків `xp_entry`; ручний рядок `'admin'` рахується в суму рівня й не рахується в денну стелю ігор. Забране досягнення повертається лише ручною видачею.
- **Адмінка — лише адмінам:** кожен новий `/api/admin/*` — через `read`/`write` (ворота `gate`), не-адміну й гостю — та сама **404**, що й невідомий маршрут; кожен — у списку `routes` тесту `hiding the admin panel (Review Focus 3)`. Кожна дія-запис — рядок `admin_action` у тій самій транзакції.
- **Не можна видалити адміна, себе чи бота** (409 `cannot_delete_admin`; бот і так 404 — його немає серед користувачів адмінки).
- Усі тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`; нові uk-ключі — у новому списку `ADDED_PLAYER_CARD_58` (+ `ADDED_PLAYER_CARD_58_PLURALS`, якщо є `_one`) у `i18n.test.ts`: в умову `adds no uk keys beyond the agreed list` і в тест наявності з тими самими `{змінними}` (як `54 keys (the bot tab) …`). ru немає. `DELETED_NICKNAME` («Видалений гравець») — дані в базі, живуть у `packages/shared`, як `BOT_NICKNAME`.
- Кириличні літерали в `apps/web/src/` — лише в словниках і тестах (`source-scan.test.ts`).
- **Нічого, пов'язаного з росією**, — у фікстурах, ніках, назвах призів, причинах, e2e.
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm exec tsc -p <пакет>` у задачах 1–6, з задачі 7 — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів vitest).
- Файли правити лише Edit/Write чи `sed`; **python3 на цій машині — порожня заглушка, ним нічого не правити й не генерувати**; після коміту — `git show --stat`.
- Робоче дерево — лише в `C:\ClaudeCode\quiz\.superpowers\worktrees\plan58`; жодних файлів поза `C:\ClaudeCode\quiz` (тимчасові — у `.superpowers` чи scratchpad сесії). Дерев `plan56`, `plan57` не торкатися.
- e2e: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 58"`; телефон **360 px**, **світла тема** (`quiz:theme = light`, `is-light` на `<html>`); після — окремо `-t "part 54"`.

## Рішення плану (там, де специфікація мовчить)

**Спільне (`packages/shared/src/player-card.ts`, експорт з `index.ts`)**
- Межі: `ADMIN_XP_MAX = 5000` (одна зміна — ціле від −5000 до 5000, не 0), `ADMIN_XP_REASON_MAX = 200`, `GIFT_NOTE_MAX = 120`, `ADMIN_CARD_GAMES = 20`, `ADMIN_CARD_BANS = 50`, `ADMIN_CARD_XP = 50`; `DELETED_NICKNAME = 'Видалений гравець'`.
- Типи:
  ```ts
  export interface AdminCardOverview { avatar: string | null; registeredAt: string; lastSeenAt: string | null; level: number; xp: number; games: number; wins: number; quizzes: number; friends: number; groups: number }
  export interface AdminCardAchievement { id: AchievementId; earnedAt: string | null }
  export interface AdminCardGame { gameId: string; title: string; startedAt: string; rank: number | null; playerCount: number; score: number }
  export interface AdminCardQuiz { id: string; title: string; questions: number; updatedAt: string }
  export interface AdminCardBan { at: string; kind: 'ban' | 'unban'; admin: string; reason: string | null }
  export interface AdminCardXp { id: string; amount: number; note: string; at: string }
  export interface AdminPlayerCard { overview: AdminCardOverview; achievements: AdminCardAchievement[]; blocked: AchievementId[]; games: AdminCardGame[]; quizzes: AdminCardQuiz[]; bans: AdminCardBan[]; xp: AdminCardXp[] }
  export interface XpAdminLine { amount: number; note: string; at: string }
  ```
- Схеми (`.strict()`): `adminGrantSchema = { achievementId: z.enum(ACHIEVEMENTS) }`; `adminXpSchema = { amount: z.number().int().min(-ADMIN_XP_MAX).max(ADMIN_XP_MAX).refine((n) => n !== 0), reason }`, де `reason` — обрізаний, стиснутий, 1…200, `isStorable` (як `text(max)` у `prizes.ts`); `adminGiftSchema = { prizeId: z.string().uuid(), note: той самий текст 1…120 | null | відсутній → null }`; `adminDeleteSchema = { confirm: z.string().max(200) }`.
- `admin.ts`: `ADMIN_ACTION_KINDS` + `'achievement_grant'`, `'achievement_revoke'`, `'xp_adjust'`, `'prize_gift'`, `'gift_revoke'`, `'account_delete'`; `AdminLogDetails` + `achievementId?: AchievementId`, `amount?: number` (причина досвіду — у наявному `reason`, нік видаленого — у `text`, назва призу — у `title`, зміст — у `content`); `AdminAward` + `gift: { note: string | null } | null`; `AdminUserDetail` + `card: AdminPlayerCard`.
- `prizes.ts` `AwardCard` + `gift: { note: string | null } | null`; `feed.ts` `FeedData` `prize` + `gift?: true`; `levels.ts` `OwnLevel` + `adminXp: XpAdminLine[]` (новіші першими, до `ADMIN_CARD_XP`).

**База (`db/schema.ts`, міграція `0043_player_card`)**
- `achievementBlock = pgTable('achievement_block', { userId: text → user.id cascade, achievementId: text $type<AchievementId>, blockedAt: at notNull }, pk(userId, achievementId))`.
- `xpEntry.source` — `$type<'game' | 'achievement' | 'admin'>()`; `xpEntry.note: text('note')` (лише для `'admin'`).
- `prizeAward.gift: boolean('gift').notNull().default(false)`, `prizeAward.giftNote: text('gift_note')`.

**Досягнення: як ручне переживає повторну синхронізацію**
- Видача: `user_achievement { earnedAt: now, gameId: null }` `onConflictDoNothing`; є вже → `owned`. Перед вставкою — `delete achievement_block` цього id. Далі `creditAchievements(tx, userId)` дає рядок досвіду за наявною рідкістю. Видане вручну більше нічого не забирає: `syncAchievements` лише вставляє. Подію стрічки ручна видача не пише (`writeAchievementEvents` бере лише досягнення з грою).
- Забирання: в одній транзакції — `delete user_achievement`, `delete xp_entry where source = 'achievement' and achievement_id`, `insert achievement_block on conflict do update set blocked_at`, `delete feed_event where key = 'achievement:<userId>:<id>'`, `delete showcase_pin where kind = 'achievement' and item_id`.
- `achievement-store.ts`: `storedOf` додатково читає `achievement_block` користувача → `blocked: Set<AchievementId>`; у `syncAchievements` функція `want` пропускає `blocked.has(id)`. Отже ні кар'єрні факти, ні доповнення історії, ні наздоганяння, ні `awardGame` забраного не повертають. Заборона діє, доки адмін не видасть досягнення знову.
- Після видачі, забирання й ручного досвіду — `announceLevels(db, [userId], null, now)` (параметр `gameId` стає `string | null`): підвищення рівня — подія стрічки, як після гри; пониження нічого не оголошує (`feed_level` не зменшується).

**Ручний досвід**
- Рядок `xp_entry { source: 'admin', amount, note: reason, day: kyivDay(now), at: now, createdAt: now, counted: false, reason: null }`. Унікальні індекси на `'admin'` не діють (часткові), денна стеля його не бачить (`gameRows` — лише `'game'`), сума рівня — бачить.
- Під замком `profile … for update` (після `syncXp` поза транзакцією): якщо `сума + amount < 0` → `xp_below_zero` (409), нічого не пишеться.
- `ownLevel` додатково віддає `adminXp` (рядки `'admin'`, новіші першими); веб показує їх на сторінці рівнів «Від адміністратора: {note}».

**Подарунок**
- Бібліотека трофеїв — склад призів самого адміна (`listPrizes(db, adminId)`, free і reserved); подарунок **копіює** `content` і не витрачає приз адміна (його можна дарувати ще). Чужий, вручений чи неіснуючий приз → 404 `prize_not_found`.
- `prize_award { id: <новий uuid A>, userId, prizeId, gameId: A, place: 1, content, quizTitle: '', nickname: нік отримувача, awardedAt: now, gift: true, giftNote: note }` (`game_id = id нагороди`: рядка `game` немає, унікальний індекс не заважає, `writePrizeEvents` і `history.ts` ~804 таких рядків не бачать). Титул призу — як у звичайного: `user_title` на `TITLE_MS` з `gameId: A`. Подія стрічки — напряму: `feed_event { key: 'prize:A', kind: 'prize', gameId: null, data: { kind: 'prize', place: 1, name, title: '', nickTitle, gift: true }, at: now, createdAt: now }`.
- Забирання — лише подарунка (`gift = true`, інакше 404): `deleteAward(tx, A)` (титул і закріплення йдуть разом) + `delete feed_event where key = 'prize:A'`.

**Видалення акаунта (`account-delete.ts`) — єдина процедура (самовидалення в застосунку немає)**
- Маршрут: `frozen` → 503 `restarting`; `isBotUser(id) || id === me.id || isAdmin` → 409 `cannot_delete_admin`; немає → 404; `confirm.trim()` ≠ `nickname ?? email` → 400 `confirm_mismatch`. Потім `manager.closeHostedBy(id)` і `manager.forgetUser(id)` (з кожної живої кімнати — пари `playerUsers` з цим акаунтом і їхні `continued.bound`; людина догравав як гість, рекордер пише `user_id = null`).
- `deleteAccount(db, { adminId, userId, now })`: `ensureBotAccount(db)`; транзакція: `logAction('account_delete', details: { text: нік })` першим; `participant.nickname = DELETED_NICKNAME where user_id`; `delete game where host_id and status <> 'finished'`; `update game set host_id = BOT_USER_ID where host_id` (завершені ігри видаленого ведучого лишаються в історії гравців; бот прихований і нагород не отримує); з `saved_game.data.playerUsers` усіх збережених ігор — пари з цим акаунтом; групи, де він власник: інший учасник з найменшим `joined_at` (далі `user_id`) стає власником, група без інших — `deleteGroup`; `delete user` (решта — каскадом: профіль, сесії, входи, вікторини, призи, вітрина, досвід, досягнення, стрічка, друзі, лайки, підписки, бан).
- Завантажені файли (аватар, картинки вікторин) у сховищі не видаляються — прив'язки файл → акаунт немає (див. «Розбіжності», п. 5).

**Читання картки (`player-card.ts` `playerCard(db, userId, now)`)**
- `overview`: `profile.avatar`; `registeredAt` = `user.createdAt`; `lastSeenAt` = `profile.lastSeenAt` («останній вхід» — остання активність); `xp`/`level` — після `syncXp` (збій не ламає), `xpTotals` + `levelOf`; `games` — як у `userRows`; `wins` — завершені ігри з `participant.rank = 1`; `quizzes`; `friends` — `friendsOf(db, id).length`; `groups` — рядки `group_member`.
- `achievements` — `user_achievement` (лише відомі id, у порядку `ACHIEVEMENTS`) без запуску синхронізації; `blocked` — `achievement_block`; `games` — `playerGames(db, id, ADMIN_CARD_GAMES)`; `quizzes` — `quiz` власника, нові першими; `bans` — `admin_action` з `target_user_id = id` і `kind in ('ban','unban')`, нові першими, до 50; `xp` — рядки `'admin'`.
- Адмінський перегляд гри: `hostGameWithFacts(db, hostId: string | null, id)` — `null` знімає фільтр ведучого; `GET /api/admin/games/:id` → `GameDetail`, у журнал не пише.

**Веб**
- `AdminUser.tsx` — шапка (`UserCard`) і розділи з `apps/web/src/admin/card/`: `CardOverview.tsx`, `CardAchievements.tsx`, `CardXp.tsx`, `CardGames.tsx` (ігри → `/admin/games/:id`, вікторини → `/admin/quizzes/:id`, бани), `CardModeration.tsx` (наявні бан/розбан + «Скинути нік»/«Скинути аватар» через наявний `actOnProfileReport`), `CardPrizes.tsx` (наявні склад і вітрина + «Подарувати приз» і «Забрати подарунок»), `CardDelete.tsx`. Усі дії — через наявний `act(confirmText, run)`; видалення — поле «Введіть нік …», кнопка активна лише за точного збігу, після успіху — `Navigate` на `/admin/users`.
- «Створити новий приз» — посилання `/profile/prizes/new?back=/admin/users/<id>`; `PrizeStudioPage` після збереження чи скасування йде на `back`, якщо той починається з `/admin/users/`, інакше на `STORE`.
- `GameHistory.tsx`: тіло після завантаження → `export function GameDetailView({ game, back }: { game: GameDetail; back: JSX.Element }): JSX.Element`; `AdminGame.tsx` вантажить `adminGame(id)` і рендерить його з посиланням «Назад».
- Вітрина: подарунок замість `awardLine` — `awardGiftLine` («Подарунок від адміністратора · {date}») і підпис, якщо є; стрічка: `gift` → `feedPrizeGift`.

## Порядок збирання

- 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. Залежності: 2 ← 1; 3 ← 2; 4 ← 2; 5 ← 1, 2; 6 ← 3, 4, 5; 7 ← 1; 8 ← 6, 7; 9 — остання.
- `pnpm typecheck` обов'язково зелений з задачі 7 (нові `ADMIN_ACTION_KINDS` вимагають ключів `adminLog_*`; до того `tsc -p apps/web` може падати саме на них — це очікувано).

## Фокус рев'ю

1. **Забране не повертається, видане не зникає.** Після забирання кар'єрного досягнення, умови якого гравець досі виконує, `achievementsPage`, `syncAchievements(…, null)`, перший прохід без мітки й `awardGame` нової гри його не вставляють, рядка `'achievement'` у `xp_entry` немає; видане вручну переживає `syncAchievements` і `syncXp` з міткою `null`. Задачі 2, 3.
2. **Ручний досвід переживає перерахунок і не ламає стелю.** Рядок `'admin'` лишається після `retro` (мітка `null`) і `catchUp`; рівень = сума з ним; гра того ж дня отримує повну стелю 600; віднімання нижче 0 — 409 без запису. Задача 3.
3. **Видалення не ламає чужих ігор.** Завершена гра, яку вів видалений, лишається в історії гравця; його рядок у чужій грі — «Видалений гравець»; жива кімната, де він грав, записується на фініші без збою ключа; продовження збереженої гри, де він грав, не падає; група, де він власник, має нового власника. Задачі 5, 9.
4. **Подарунок — як звичайний приз, і зникає повністю.** Вітрина отримувача показує його з позначкою, стрічка друзів — подію; забирання прибирає вітрину, титул, закріплення й подію; `backfillFeed` і `history` подарунків не чіпають; приз адміна лишається в його складі. Задачі 4, 9.
5. **Ворота й заборони.** Не-адміну й гостю кожен новий маршрут — 404 без заголовків обмеження; видалити адміна, себе чи бота — 409; підтвердження чужим ніком — 400 і акаунт цілий; кожна дія — рівно один рядок журналу. Задачі 6, 9.

---

### Задача 1. Спільне: типи картки, схеми дій, межі, види журналу

**Files:**
- Create: `packages/shared/src/player-card.ts`, `packages/shared/src/player-card.test.ts`.
- Modify: `packages/shared/src/index.ts` (`export * from './player-card'`), `packages/shared/src/admin.ts` (шість видів, `AdminLogDetails.achievementId?`/`amount?`, `AdminAward.gift`, `AdminUserDetail.card`), `packages/shared/src/prizes.ts` (`AwardCard.gift`), `packages/shared/src/feed.ts` (`gift?: true`), `packages/shared/src/levels.ts` (`OwnLevel.adminXp`).
- Test: `packages/shared/src/admin.test.ts`.

**Interfaces (Produces):** усе з «Рішень плану» (спільне): константи, `AdminCardOverview`, `AdminCardAchievement`, `AdminCardGame`, `AdminCardQuiz`, `AdminCardBan`, `AdminCardXp`, `AdminPlayerCard`, `XpAdminLine`, `adminGrantSchema`, `adminXpSchema`, `adminGiftSchema`, `adminDeleteSchema`.

- [ ] **Step 1: Write the failing tests:**
  - `player-card.test.ts` `manual xp is a non-zero integer within 5000 with a reason up to 200`: `adminXpSchema` приймає `{ amount: 300, reason: 'Перемога в турнірі' }` і `{ amount: -5000, reason: 'x' }`; відкидає `amount: 0`, `5001`, `1.5`, `reason: '   '`, причину з 201 символу, зайвий ключ; `'  два   слова '` → `'два слова'`.
  - `a gift note is optional and up to 120`: `adminGiftSchema` — `{ prizeId: <uuid> }` → `note: null`; `note: 'З днем народження'` — так; 121 символ, `prizeId: 'abc'` — ні.
  - `only a known achievement can be granted`: `adminGrantSchema` приймає `{ achievementId: 'first_win' }`, відкидає `'nope'`.
  - `the deleted player mark is data`: `DELETED_NICKNAME === 'Видалений гравець'`, `ADMIN_CARD_GAMES === 20`.
  - `admin.test.ts`: `ADMIN_ACTION_KINDS` містить `achievement_grant`, `achievement_revoke`, `xp_adjust`, `prize_gift`, `gift_revoke`, `account_delete`.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/player-card.test.ts packages/shared/src/admin.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (спільне).
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 && pnpm exec tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 58 player card — card types (overview, achievements, last 20 games, quizzes, bans, manual xp), schemas for granting an achievement, manual xp with a reason up to 200, a gift with a note up to 120 and the delete confirmation, the «Видалений гравець» mark, a gift flag on awards and feed prizes, and six log kinds"
```

---

### Задача 2. База: міграція `0043_player_card`; забране досягнення не повертається синхронізацією

**Files:**
- Create: `apps/server/drizzle/0043_player_card.sql` + `meta/0043_snapshot.json` + запис у `meta/_journal.json` (`pnpm --filter @quiz/server exec drizzle-kit generate --name player_card`, потім дописати коментар першим рядком; номер — наступний вільний).
- Modify: `apps/server/src/db/schema.ts` (`achievementBlock`, `xpEntry.source`/`note`, `prizeAward.gift`/`giftNote`), `apps/server/src/achievement-store.ts` (`storedOf` → `blocked`, `want` пропускає заборонене).
- Test: `apps/server/src/db/schema.test.ts`, `apps/server/src/achievement-store.test.ts`.

**Interfaces (Produces):** таблиця `achievementBlock`; стовпці `xpEntry.note`, `prizeAward.gift`, `prizeAward.giftNote`; `syncAchievements` не вставляє id з `achievement_block`.

- [ ] **Step 1: Write the failing tests:**
  - `schema.test.ts` `describe('player card (58)')`: `migration 0043 adds the block table and columns over an older database, old rows stay` (`createTestDbUpTo('0042_bot_plan')` — або остання наявна перед 0043; вставлені до міграції `xp_entry` і `prize_award` після `migrateRest` мають `note = null`, `gift = false`, `gift_note = null`); `a block goes with the account` (видалення `user` → рядків `achievement_block` немає).
  - `achievement-store.test.ts` `describe('blocked achievements (58)')`: `a blocked career achievement is not written back` — гравець з 10 завершеними іграми (є `games_10`), рядок `games_10` видалено, `achievement_block` вставлено → `syncAchievements(db, id, null)` і `achievementsPage(db, id, true)` — `games_10` не отримано, рядка немає; `the first pass without a mark skips it too` (`achievements_synced_at = null`); `a finished game does not bring it back` (`awardGame` 11-ї гри — `games_10` немає, інші ачівки гри — є); `without a block it is written again` (контроль: та сама картина без блоку — `games_10` повертається).
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/db/schema.test.ts apps/server/src/achievement-store.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** схему й міграцію за «Рішеннями плану» (база); `storedOf(db, userId): Promise<{ earned; syncedAt; blocked: Set<AchievementId> }>` (окремий запит до `achievement_block`), у `want` — `if (blocked.has(id)) return;`. Решту `syncAchievements` не міняти.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/db apps/server/src/achievement-store.test.ts apps/server/src/game-achievements.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/drizzle apps/server/src/db apps/server/src/achievement-store.ts apps/server/src/achievement-store.test.ts
git commit -m "feat(server): 58 player card base — migration 0043 adds achievement_block, a note on xp entries and a gift flag with a note on awards; a blocked achievement is never written back by career facts, the first history pass, catching up or a finished game"
```

---

### Задача 3. Сервер: видати й забрати досягнення, ручний досвід, рядки «Від адміністратора» у рівнях гравця

**Files:**
- Create: `apps/server/src/player-card.ts` (лише записи; читання — задача 6), `apps/server/src/player-card.test.ts`.
- Modify: `apps/server/src/feed-publish.ts` (`announceLevels(db, userIds, gameId: string | null, at)`), `apps/server/src/xp-store.ts` (`ownLevel` → `adminXp`).
- Test: `apps/server/src/xp-store.test.ts`.

**Interfaces:**
- Consumes: схеми й типи задачі 1; `achievementBlock`, `xpEntry.note` (задача 2); `logAction`, `creditAchievements`, `syncXp`, `xpTotals`.
- Produces:
  - `grantAchievement(db: Db, input: { adminId: string; userId: string; achievementId: AchievementId; now: Date }): Promise<'granted' | 'owned' | 'not_found'>`
  - `revokeAchievement(db: Db, input: { adminId: string; userId: string; achievementId: AchievementId; now: Date }): Promise<'revoked' | 'not_found'>`
  - `adjustXp(db: Db, input: { adminId: string; userId: string; amount: number; reason: string; now: Date }): Promise<{ ok: true; xp: number; level: number } | { ok: false; error: 'not_found' | 'xp_below_zero' }>`
  - `OwnLevel.adminXp` з `ownLevel`.

- [ ] **Step 1: Write the failing tests** (`player-card.test.ts`, `createTestDb`, люди — `Оля`, `Тарас`, адмін `Адмін 58`):
  - `granting gives the achievement now, its xp and one log line`: `grantAchievement(first_win)` → `'granted'`; `user_achievement` з `earned_at = now`, `game_id = null`; `xp_entry 'achievement'` з `ACHIEVEMENT_XP[achievementRarity('first_win')]`; журнал — `{ kind: 'achievement_grant', details: { achievementId: 'first_win' } }`; повтор → `'owned'` і другого рядка журналу немає.
  - `a granted achievement survives every sync`: після видачі `syncAchievements(db, id, null)`, `syncXp` з `xp_synced_at = null` — досягнення й його досвід на місці, рівно один рядок `'achievement'`.
  - `revoking takes the xp, the feed event and the pin, and blocks it`: подія `achievement:<id>:first_win` і закріплення вставлені тестом → `'revoked'`; немає `user_achievement`, рядка `'achievement'`, події, закріплення; є `achievement_block`; `syncAchievements` не повертає; `grantAchievement` знову — `'granted'`, блоку немає.
  - `manual xp is a journal row that counts in the level and not in the cap`: `adjustXp(+300, 'Переможець вікторини в школі')` → `{ ok: true, xp: 300, level: levelOf(300) }` (рівень 2); `xp_entry { source: 'admin', note }`; журнал `{ kind: 'xp_adjust', details: { amount: 300, reason: … } }`; та сама доба — гра через `creditGame` отримує повний рядок, не урізаний стелею через ручні 300.
  - `manual xp survives the retro pass`: `xp_synced_at = null`, дві завершені гри → `syncXp` → рядок `'admin'` на місці, сума = ігри + 300.
  - `subtracting below zero is refused`: на 300 → `adjustXp(-301)` → `xp_below_zero`, рядків і журналу немає; `adjustXp(-300)` → `xp: 0, level: 1`.
  - `a raised level is announced once, a lowered one is not`: після `+300` — подія `level:<id>:2` з `game_id = null`; `−300`, потім `+300` — подій `level` усе ще одна.
  - `unknown user`: усі три → `not_found`, журналу немає.
  - `xp-store.test.ts` `own level lists admin lines newest first`: дві зміни → `ownLevel(...).adminXp` — `[{ amount: -50, note: 'Друга' …}, { amount: 300, note: 'Перша' … }]`; чужі рядки `'game'` у список не йдуть.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/player-card.test.ts apps/server/src/xp-store.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (досягнення, ручний досвід). Кожна функція — одна транзакція з `logAction` у ній; `announceLevels` — після транзакції. `adjustXp`: `syncXp` поза транзакцією, далі `select profile … for update`, сума, перевірка, вставка.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/player-card.test.ts apps/server/src/xp-store.test.ts apps/server/src/feed-publish.test.ts apps/server/src/recorder.levels.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 58 manual achievements and xp — grant with its xp, revoke with its xp, feed event and pin and a block against re-sync; manual xp as an admin journal row with a reason that counts in the level, not in the daily cap, survives the retro pass and never goes below zero; raised levels are announced; the player's own level lists admin lines"
```

---

### Задача 4. Сервер: подарувати приз з бібліотеки адміна й забрати подарунок

**Files:**
- Create: `apps/server/src/player-gifts.ts`, `apps/server/src/player-gifts.test.ts`.
- Modify: `apps/server/src/prizes.ts` (`showcaseOf` → `gift`), `apps/server/src/admin-store.ts` (`adminUser` → `awards[].gift`).

**Interfaces:**
- Consumes: `prizeAward.gift`/`giftNote` (задача 2), `listPrizes`, `deleteAward`, `logAction`, `TITLE_MS`.
- Produces:
  - `giftPrize(db: Db, input: { adminId: string; userId: string; prizeId: string; note: string | null; now: Date }): Promise<{ ok: true; awardId: string } | { ok: false; error: 'not_found' | 'prize_not_found' }>`
  - `revokeGift(db: Db, input: { adminId: string; awardId: string; now: Date }): Promise<boolean>`

- [ ] **Step 1: Write the failing tests** (приз адміна «Кубок весни 58», золотий кубок, `title: 'Майстер весни'`):
  - `a gift copies the admin's prize into the showcase with the mark`: `giftPrize` → `ok`; `showcaseOf(Оля)` — картка з `content` призу, `gift: { note: 'З днем народження' }`; приз адміна в `listPrizes(адмін)` і далі `free`; журнал `{ kind: 'prize_gift', details: { title: 'Кубок весни 58', content } }`.
  - `a gift has a feed event and the title like a won prize`: `feed_event` `prize:<awardId>` з `data.gift === true`, `game_id = null`; `currentTitles([Оля])` — `'Майстер весни'`; друг Олі бачить подію в `feedPage`.
  - `the same prize can be gifted twice`: два подарунки тій самій людині — два рядки.
  - `only the admin's own prize`: чужий приз, вручений приз, неіснуючий id → `prize_not_found`; неіснуючий отримувач → `not_found`; журналу немає.
  - `revoking removes the award, the title, the pin and the event`: закріплення вставлено → `revokeGift` → `true`; немає `prize_award`, `user_title`, `showcase_pin`, `feed_event`; журнал `gift_revoke`. Нагорода з гри (`gift = false`) → `false`, цілий рядок.
  - `gifts stay out of game history and the feed backfill`: `backfillFeed(db, now)` не дублює й не міняє події подарунка; `history.ts` призи гри для будь-якої гри подарунка не показують.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/player-gifts.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (подарунок). Нік отримувача — `ensureProfile(...).nickname ?? ''`; усе — одна транзакція з журналом.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/player-gifts.test.ts apps/server/src/prizes.test.ts apps/server/src/showcase-routes.test.ts apps/server/src/feed-publish.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 58 gift prize — copy one of the admin's own trophies into a player's showcase marked as an admin gift, with its title and a feed event like a won prize, the admin's prize stays; revoking a gift takes the award, title, pin and event; game history and the feed backfill do not see gifts"
```

---

### Задача 5. Сервер: видалення акаунта — одна процедура, ігри інших лишаються

**Files:**
- Create: `apps/server/src/account-delete.ts`, `apps/server/src/account-delete.test.ts`.
- Modify: `apps/server/src/rooms/manager.ts` (`forgetUser`), `apps/server/src/rooms/manager.ban.test.ts` (або новий `manager.forget.test.ts`).

**Interfaces:**
- Consumes: `DELETED_NICKNAME` (задача 1), `ensureBotAccount`, `logAction`, `deleteGroup`.
- Produces:
  - `deleteAccount(db: Db, input: { adminId: string; userId: string; now: Date }): Promise<boolean>` (`false` — немає користувача)
  - `RoomManager.forgetUser(userId: string): number` — скільки прив'язок знято.

- [ ] **Step 1: Write the failing tests:**
  - `account-delete.test.ts`: `the account and its personal data are gone` — після `deleteAccount(Тарас)` немає `user`, `profile`, `session`, `account`, `quiz`, `prize`, `xp_entry`, `user_achievement`, `feed_event`, `follow` з ним; журнал `{ kind: 'account_delete', details: { text: 'Тарас' }, target_label: 'Тарас' }`.
  - `games of others keep him as the deleted player`: Тарас грав у грі Олі → `playerHistory(Оля)` — гра є; рядок Тараса — `nickname: 'Видалений гравець'`, `user_id: null`.
  - `finished games he hosted stay in players' history`: Тарас вів завершену гру з Олею → у `playerHistory(Оля)` гра є, `game.host_id = BOT_USER_ID`; його незавершена (`saved`) гра видалена.
  - `a saved game where he played continues without him`: `saved_game.data.playerUsers` гри Олі без пари Тараса, пара Петра на місці.
  - `a group he owned gets the earliest member as owner; a group of one is deleted`.
  - `unknown user` → `false`, журналу немає.
  - менеджер `forgetUser unbinds the account in live rooms and the game still records`: кімната з Тарасом-акаунтом → `forgetUser(Тарас)` → `1`; `room.playerUsers` без нього; після `deleteAccount` гра доходить до кінця, рекордер записує її без збою, рядок учасника — гість.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/account-delete.test.ts apps/server/src/rooms/manager.ban.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (видалення). `forgetUser`: для кожної кімнати `this.live` — id гравців з `playerUsers.get(id) === userId` геть з `playerUsers` і `continued?.bound`; `emit` не потрібен. Чистка `saved_game.data` — один SQL з `jsonb_array_elements … where e->>1 <> $userId` лише для рядків, де пара є.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/account-delete.test.ts apps/server/src/rooms apps/server/src/saved-games.test.ts apps/server/src/history.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 58 account deletion — one procedure that logs first, marks the player as «Видалений гравець» in others' games, keeps finished games he hosted under the hidden bot, drops him from saved games and live rooms, hands his groups to the earliest member and deletes the account with its personal data"
```

---

### Задача 6. Сервер: читання картки, адмінський перегляд гри, маршрути картки

**Files:**
- Create: `apps/server/src/admin-card-routes.ts`, `apps/server/src/admin-card-routes.test.ts`.
- Modify: `apps/server/src/player-card.ts` (`playerCard`), `apps/server/src/admin-store.ts` (`adminUser` → `card`), `apps/server/src/history.ts` (`hostGameWithFacts(db, hostId: string | null, id)`), `apps/server/src/admin-routes.ts` (рядок `await registerPlayerCardRoutes(app, deps, { read, write, adminOf })` у кінці), `apps/server/src/admin-routes.test.ts` (список `routes`).

**Interfaces:**
- Consumes: задачі 3–5.
- Produces: `playerCard(db: Db, userId: string, now: Date): Promise<AdminPlayerCard>`; маршрути (усі — `USER_ID_MAX`/`UUID` → 404 до бази; тіло — схеми задачі 1, інакше 400 `invalid_payload`):
  - `POST /api/admin/users/:id/achievements` `{ achievementId }` → 204; 409 `achievement_owned`; 404.
  - `DELETE /api/admin/users/:id/achievements/:achievementId` → 204; 404 (немає такого чи не отримано).
  - `POST /api/admin/users/:id/xp` `{ amount, reason }` → 200 `{ xp, level }`; 409 `xp_below_zero`; 404.
  - `POST /api/admin/users/:id/gifts` `{ prizeId, note? }` → 201 `{ id }`; 404 `not_found` / `prize_not_found`.
  - `DELETE /api/admin/gifts/:id` → 204; 404.
  - `DELETE /api/admin/users/:id` `{ confirm }` → 204; 409 `cannot_delete_admin`; 400 `confirm_mismatch`; 503 `restarting`; 404.
  - `GET /api/admin/games/:id` (`read`) → `GameDetail`; 404.
  Бот як ціль — 404 для всіх (немає серед `userRows`).

- [ ] **Step 1: Write the failing tests** (`admin-card-routes.test.ts`, допоміжні `person`, `lastLog` — як у `admin-routes.test.ts`):
  - `the card shows the overview, achievements, last 20 games, quizzes, bans and manual xp`: 22 завершені ігри Олі (2 перемоги), 2 вікторини, друг, група, бан і розбан, `+300` → `GET /api/admin/users/:id` — `card.overview` `{ games: 22, wins: 2, quizzes: 2, friends: 1, groups: 1, level: …, xp: … }`, `card.games.length === 20` (нові першими), `card.bans` — `[unban, ban]` з ніком адміна й причиною, `card.xp[0].note`.
  - `grant, revoke, xp, gift and revoke gift answer and log`: кожен маршрут — свій код і рівно один новий рядок журналу; 409 `achievement_owned`, 409 `xp_below_zero`, 404 `prize_not_found`.
  - `deleting needs the exact nickname and spares admins`: `confirm: 'Оля '` → 204 (обрізається), `confirm: 'Петро'` → 400 `confirm_mismatch` і акаунт цілий; адмін, сам адмін, `BOT_USER_ID` → 409/404; на зупинці (`manager.frozen`) → 503; кімнату, яку вела ціль, закрито (`closeHostedBy`).
  - `the admin game view opens any host's game`: гра Тараса → `GET /api/admin/games/:id` — `GameDetail` з таблицею; не-UUID і чужий id → 404; журналу немає.
  - `admin-routes.test.ts` `hiding the admin panel (Review Focus 3)`: додати всі сім маршрутів у `routes` — не-адміну й гостю 404 без заголовків обмеження.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/admin-card-routes.test.ts apps/server/src/admin-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `playerCard` за «Рішеннями плану» (читання картки), `hostGameWithFacts` з `hostId: string | null` (наявні виклики передають рядок), `registerPlayerCardRoutes(app, deps: AdminDeps, gates: { read; write; adminOf })` — як `registerAdminBotRoutes`. Порядок у видаленні: схема → `frozen` → заборони → наявність і `confirm` → `closeHostedBy` → `forgetUser` → `deleteAccount`.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/admin-card-routes.test.ts apps/server/src/admin-routes.test.ts apps/server/src/admin-store.test.ts apps/server/src/history.test.ts apps/server/src/games.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 58 player card routes — the card read (overview, achievements, last 20 games, quizzes, bans, manual xp), grant and revoke an achievement, manual xp, gift and revoke a gift, delete an account with the exact nickname (never an admin, oneself or the bot) and an admin view of any game; all behind the admin gate with 404 for others"
```

---

### Задача 7. Веб: тексти в 7 мовах, рядки журналу, позначка подарунка, ручний досвід у рівнях, повернення з редактора призу

**Files:**
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,de,es,it,pl,ar}.json`, `apps/web/src/i18n.test.ts` (`ADDED_PLAYER_CARD_58`, умова ~673, тест `58 keys (the player card) are in every language`), `apps/web/src/admin/admin-text.ts` (`logLine`: `amount`, `achievement`), `apps/web/src/admin/admin-text.test.ts`, `apps/web/src/feed/feed-text.ts` (+ тест), `apps/web/src/profile/Showcase.tsx`, `apps/web/src/pages/profile/ProfileLevels.tsx`, `apps/web/src/pages/PrizeStudioPage.tsx` (`back`), відповідні `*.test.tsx`.

**Interfaces:**
- Consumes: типи задачі 1.
- Produces: ключі (uk-зразки): `adminCardOverview` «Огляд», `adminCardRegistered` «Зареєструвався(-лася): {date}», `adminCardLastSeen` «Востаннє заходив(-ла): {date}», `adminCardNeverSeen`, `adminCardLevel` «Рівень {level} · {xp} XP», `adminCardCounts` «Ігор: {games} · перемог: {wins} · вікторин: {quizzes} · друзів: {friends} · груп: {groups}», `adminCardAchievements`, `adminCardNoAchievements`, `adminCardGrant` «Видати досягнення», `adminCardGrantPick`, `adminCardGrantConfirm`, `adminCardRevoke` «Забрати», `adminCardRevokeConfirm` «Забрати досягнення «{name}» у {nickname}? Досвід за нього теж зникне.», `adminCardBlocked` «Забрано адміністратором», `adminCardXp` «Досвід», `adminCardXpAmount`, `adminCardXpReason` «Причина (обов'язково)», `adminCardXpAdd` «Додати / відняти досвід», `adminCardXpConfirm`, `adminCardXpDone` «Тепер: рівень {level}, {xp} XP», `adminCardGames` «Останні ігри», `adminCardNoGames`, `adminCardGameLine` «{date} · місце {place} з {of} · {score} балів», `adminCardQuizzes`, `adminCardNoQuizzes`, `adminCardBans` «Бани», `adminCardNoBans`, `adminCardBanLine`, `adminCardUnbanLine`, `adminCardResetNick` «Скинути нік», `adminCardResetNickConfirm`, `adminCardResetAvatar` «Скинути аватар», `adminCardResetAvatarConfirm`, `adminCardGift` «Подарувати приз», `adminCardGiftPick`, `adminCardGiftNote` «Підпис (необов'язково)», `adminCardGiftNew` «Створити новий приз», `adminCardGiftNone`, `adminCardGiftConfirm`, `adminCardGiftRevoke` «Забрати подарунок», `adminCardGiftRevokeConfirm`, `adminCardDelete` «Видалити акаунт», `adminCardDeleteLead` «Акаунт і персональні дані буде видалено назавжди. Ігри в історії інших лишаться з позначкою «Видалений гравець».», `adminCardDeleteType` «Введіть нік «{nickname}», щоб підтвердити», `adminCardDeleteConfirm`, `adminGameBack`, `awardGift` «Подарунок від адміністратора», `awardGiftLine` «Подарунок від адміністратора · {date}», `feedPrizeGift` «отримує приз «{name}» — подарунок від адміністратора», `levelAdminTitle` «Від адміністратора», `levelAdminLine` «Від адміністратора: {note}», `err_achievement_owned`, `err_xp_below_zero`, `err_prize_not_found`, `err_cannot_delete_admin`, `err_confirm_mismatch`, `adminLog_achievement_grant` «{admin} видав(-ла) {target} досягнення «{achievement}»», `adminLog_achievement_revoke`, `adminLog_xp_adjust` «{admin} змінив(-ла) досвід {target}: {amount}», `adminLog_prize_gift` «{admin} подарував(-ла) {target} приз «{title}»», `adminLog_gift_revoke`, `adminLog_account_delete` «{admin} видалив(-ла) акаунт {target}». Точний перелік — у `ADDED_PLAYER_CARD_58`.

- [ ] **Step 1: Write the failing tests:**
  - `i18n.test.ts` `58 keys (the player card) are in every language` за зразком `54 keys …`; список — в умові `adds no uk keys beyond the agreed list`.
  - `admin-text.test.ts`: `xp_adjust` з `amount: -50, reason: 'Помилка'` → рядок містить `−50` (зі знаком) і «Причина: Помилка»; `achievement_grant` з `achievementId: 'first_win'` — назва досягнення з `achievement_first_win`.
  - `feed-text.test.ts`: `{ kind: 'prize', gift: true, … }` → `feedPrizeGift`; без `gift` — як було.
  - `Showcase.test.tsx`: картка з `gift: { note: 'Для Олі' }` — «Подарунок від адміністратора» і «Для Олі», без «місце»; без `gift` — `awardLine`.
  - `ProfileLevels.test.tsx`: `adminXp` з двома рядками — розділ «Від адміністратора» з `+300` і `−50` і причинами; порожній — розділу немає.
  - `PrizeStudioPage.test.tsx`: `?back=/admin/users/u1` → після збереження перехід на `/admin/users/u1`; `?back=https://evil.example` і `?back=/feed` → на `/profile/prizes`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/i18n.test.ts apps/web/src/admin/admin-text.test.ts apps/web/src/feed apps/web/src/profile apps/web/src/pages/profile apps/web/src/pages/PrizeStudioPage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement**: тексти uk + шість JSON (переклади повні, не копії uk; `ar` — справа наліво, змінні ті самі); `logLine` передає `amount` (знак `+`/`−`) і `achievement` (`t('achievement_<id>')`), для `xp_adjust` додає причину як `ban`; решта — за «Рішеннями плану» (веб).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src
git commit -m "feat(web): 58 player card texts in seven languages — log lines for grants, revokes, manual xp, gifts and deletion; the admin gift mark in the showcase and the feed; manual xp lines on the player's own level page; the prize editor returns to the player card"
```

---

### Задача 8. Веб: картка гравця в адмінці й адмінський перегляд гри

**Files:**
- Create: `apps/web/src/admin/card/CardOverview.tsx`, `CardAchievements.tsx`, `CardXp.tsx`, `CardGames.tsx`, `CardModeration.tsx`, `CardPrizes.tsx`, `CardDelete.tsx`, `apps/web/src/admin/AdminGame.tsx`, `apps/web/src/admin/AdminUser.test.tsx`, `apps/web/src/admin/AdminGame.test.tsx`.
- Modify: `apps/web/src/admin/AdminUser.tsx`, `apps/web/src/admin/admin-api.ts`, `apps/web/src/admin/Admin.tsx` (маршрут `games/:id`), `apps/web/src/pages/GameHistory.tsx` (`GameDetailView`), `apps/web/src/styles.css` (`.admin-card-section`, `.admin-card-grid`).

**Interfaces:**
- Consumes: маршрути задачі 6, тексти задачі 7, `myPrizes()` з `api.ts`.
- Produces: `admin-api.ts`: `grantAchievement(userId, achievementId): Promise<ApiResult<object>>`, `revokeAchievement(userId, achievementId)`, `adjustXp(userId, amount, reason): Promise<ApiResult<{ xp: number; level: number }>>`, `giftPrize(userId, prizeId, note: string | null): Promise<ApiResult<{ id: string }>>`, `revokeGift(awardId)`, `deleteUserAsAdmin(userId, confirm)`, `adminGame(gameId): Promise<ApiData<GameDetail>>`; `GameDetailView({ game, back })`.

- [ ] **Step 1: Write the failing tests** (`AdminUser.test.tsx`, фікстура `AdminUserDetail` з `card`, `fetch` підмінено, `window.confirm` → `true`):
  - `shows the overview`: нік, email, «Рівень 2 · 300 XP», лічильники, аватар.
  - `grants an achievement from the missing ones and revokes with a confirm`: список вибору без уже отриманих; «Видати досягнення» → `POST …/achievements` з `{ achievementId }`, картка перечитується; «Забрати» → `confirm` з назвою → `DELETE …`.
  - `manual xp needs a reason`: кнопка неактивна без причини й за `0`; `-50` + «Помилка» → `POST …/xp` з `{ amount: -50, reason: 'Помилка' }`; `xp_below_zero` → `err_xp_below_zero` у `role="alert"`.
  - `games link to the admin game view, quizzes to the quiz view`: посилання `/admin/games/<id>` і `/admin/quizzes/<id>`; бани з причиною.
  - `resets nickname and avatar through the moderation action`: `POST /api/admin/reports/profile/<id>` з `reset_nickname` / `reset_avatar`; для адміна кнопок немає.
  - `gifts one of my prizes with a note and revokes a gift`: склад з `myPrizes` — вибір, підпис → `POST …/gifts`; посилання «Створити новий приз» — `/profile/prizes/new?back=/admin/users/<id>`; у вітрині подарунок має «Забрати подарунок» → `DELETE /api/admin/gifts/<id>`.
  - `deleting needs the exact nickname`: кнопка неактивна, доки поле ≠ нік; за збігу → `confirm` → `DELETE /api/admin/users/<id>` з `{ confirm }` → перехід на `/admin/users`; для адміна розділу немає.
  - `AdminGame.test.tsx`: вантажить `/api/admin/games/<id>`, показує назву й таблицю через `GameDetailView`; 404 → `Navigate` додому.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/admin/AdminUser.test.tsx apps/web/src/admin/AdminGame.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (веб). Порядок розділів: огляд → досягнення → досвід → ігри → вікторини → бани й модерація → призи (склад, вітрина, подарунок) → видалення (останнім, `btn-danger`). На 360 px — без бічного скролу, лише змінні теми.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src
git commit -m "feat(web): 58 admin player card — overview, grant and revoke achievements, manual xp with a reason, last 20 games with an admin game view, quizzes, ban history, reset nickname and avatar, gift a trophy from my prizes or a new one and revoke it, and delete the account by typing the nickname"
```

---

### Задача 9. Наскрізний сценарій і кадри (`part58-player-card.e2e.ts`), повтор part 54

**Files:**
- Create: `apps/server/e2e/part58-player-card.e2e.ts` (сервер з адміном — як `part54-bot-host.e2e.ts`: `flags.restarting = true; await ctx.shutdown(); await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: 'admin58@example.com' }) }); flags.restarting = false`, у `finally` — `relisten()`; телефони 360 × 740, світла тема).

**Сценарій** (люди: адмін «Адмін 58», Оля — гравець, Тарас — тестовий акаунт для видалення, Петро — друг Олі; Оля й Тарас грали одну гру Петра й одну гру Тараса — через API, як у наявних e2e; таймери ≥ 25 с):
`it('part 58: player card — the admin opens Olia\'s card, grants and revokes an achievement, adds xp and the level changes, gifts a trophy seen in her showcase and Petro\'s feed, revokes it, and deletes Taras whose games stay in Olia\'s history as «Видалений гравець»; a non-admin gets 404; phone 360 px, light theme')`:
1. `/admin/users` → Оля → картка: огляд з рівнем 1, ігор 2; кадр `card58-overview-360`, `expectNoSideScroll`.
2. «Видати досягнення» «Перша перемога» → у списку з датою; сторінка досягнень Олі — є. «Забрати» → підтвердження → немає; Оля перезавантажує `/profile/achievements` — немає й далі.
3. «Додати / відняти досвід» `300`, причина «Переможниця шкільної вікторини» → «Тепер: рівень 2 …»; `/profile/levels` Олі — рівень 2 і «Від адміністратора: Переможниця шкільної вікторини»; кадр `card58-xp-360`.
4. Адмін: «Створити новий приз» → редактор → «Кубок весни 58» → повернення на картку Олі; вибір призу, підпис «З весною» → «Подарувати приз»; `/profile/<Оля>` — у вітрині «Кубок весни 58» з «Подарунок від адміністратора» і «З весною»; стрічка Петра — подія подарунка; кадр `card58-gift-360`. «Забрати подарунок» → вітрина й подія зникли.
5. «Останні ігри» → гра → адмінський перегляд з таблицею; «Скинути аватар» → підтвердження → аватар Олі — типовий.
6. Картка Тараса: «Видалити акаунт» неактивна; введено «Петро» — неактивна; «Тарас» → підтвердження → `/admin/users` без Тараса. `/history` Олі — обидві ігри на місці, у таблиці — «Видалений гравець»; вхід Тараса — відмова; кадр `card58-deleted-360`.
7. `/admin/log` — рядки видачі, забирання, досвіду, подарунка, забирання подарунка, скидання аватара, видалення акаунта; кадр `card58-log-360`.
8. Оля (не адмін): `POST /api/admin/users/<Оля>/xp` → 404, `DELETE /api/admin/users/<Петро>` → 404; гість — 404. На картці адміна (свій акаунт) розділу видалення немає.

- [ ] **Step 1: Write the scenario.** Помічники — з `helpers/common.ts`, нових без потреби не додавати.
- [ ] **Step 2: Run** `pnpm build`, потім (після завершення збирання) `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 58"` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 3: Run** після part 58, не одночасно: `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 54"`. Expected: PASS (бот як ведучий ігор видаленого не зламав вкладки «Бот»).
- [ ] **Step 4: Переглянути кадри:** на 360 px розділи картки, поле досвіду, вибір призу й поле підтвердження без бічного скролу; кнопки читаються у світлій темі; позначка подарунка видно у вітрині.
- [ ] **Step 5: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 58 — the admin player card grants and revokes an achievement, adds xp with a level change shown on the player's level page, gifts a trophy seen in the showcase and a friend's feed and revokes it, deletes a test account whose games stay in others' history as «Видалений гравець», and logs every action; a non-admin gets 404; 360 px, light theme"
```

---

## Розбіжності зі специфікацією (рішення плану)

1. **«Досвід за досягнення перераховується»** — за наявним правилом: рядок `xp_entry 'achievement'` за рідкістю з'являється з видачею й зникає із забиранням. Щоб синхронізація (кар'єрні факти, історія, наздоганяння, фініш гри) не повернула забране, додано заборону `achievement_block`: забране повертається лише ручною видачею, навіть якщо гравець знову виконав умову. Ручна видача подією стрічки не стає (досягнення в стрічці — лише з гри); забирання прибирає наявну подію й закріплення.
2. **«Рядок у власній історії досвіду»** — окремої історії досвіду в застосунку немає (є лише розбивка за гру). Ручні зміни показано розділом «Від адміністратора» на сторінці рівнів гравця (`/profile/levels`), лише власнику. Ручний досвід не рахується в денну стелю ігор, сума не опускається нижче 0, одна зміна — до ±5000. Підвищення рівня оголошується в стрічці, як після гри.
3. **«Подарувати приз з бібліотеки трофеїв»** — бібліотека трофеїв = склад призів самого адміна (`/profile/prizes`). Подарунок копіює зміст і **не витрачає** приз адміна (його можна дарувати ще). Титул призу діє 7 днів, як у виграного. Забрати через картку можна лише подарунок; нагороди з гри — наявною кнопкою вітрини (без змін). Подарунок не має гри: місце не показується, в історії гри його немає.
4. **Видалення акаунта** — самовидалення в застосунку немає, тож `deleteAccount` стає єдиною процедурою (для майбутнього «Видалити свій акаунт»). Завершені ігри, які вів видалений, переходять на прихованого бота (`game.host_id` має каскад — інакше вони зникли б з історії гравців); незавершені й збережені ігри видаленого ведучого видаляються. Позначка «Видалений гравець» — дані в базі (нік-знімок учасника), однакова для всіх мов, як «Квіз-бот». Групи видаленого власника переходять до найдавнішого учасника. Підтвердження — нік (обрізаний); якщо ніка немає — email.
5. **Персональні дані** — видаляються рядки бази (каскадом); завантажені файли (аватар, картинки вікторин) у сховищі лишаються — прив'язки файл → акаунт немає; рядки журналу адмінки лишаються з ніком-знімком. Email після видалення можна зареєструвати знову (бан видаляється разом з акаунтом).
6. **«Останній вхід»** — `profile.last_seen_at` (остання активність), не мить створення сесії.
7. **Вікторини на картці** ведуть на наявний `/admin/quizzes/:id` (після плану 57 там і перегляд-перевірка); ігри — на новий адмінський перегляд `/admin/games/:id` (той самий вигляд, що в історії ведучого), що в журнал не пише.
8. **Скинути нік/аватар** — наявна дія модерації (`/api/admin/reports/profile/:userId`): заодно закриває відкриті скарги на профіль, як і зі скарг; адміну — недоступно, як і досі.
9. **Міграція** додає стовпці з `DEFAULT`/`NULL` до `xp_entry` і `prize_award` — це додавання, жоден наявний стовпець не змінюється; номер — наступний вільний після 0042 плану 56 (очікувано 0043).
