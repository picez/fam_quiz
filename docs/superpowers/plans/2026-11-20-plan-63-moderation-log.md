# План 63: модерація стрічки й груп, фільтри журналу дій і вивантаження CSV (44e)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** Модерація не торкається рушія, кімнат, `GameState`, `SavedRoom` і зрізів. Якщо виконавцю здасться, що потрібне нове поле там, — **зупинитися й спитати контролера**.

> **Міграція — `0046_moderation`** (останню на `main` має 59: `0045_push_broadcast`; план 64 «збої й копії», що пишеться паралельно, бере `0047`). Лише додавання — чотири колонки, що допускають `NULL`, і один індекс:
> `feed_event.hidden_at timestamptz`, `family_group.hidden_at timestamptz`, `family_group.hidden_reason text`, `group_item.hidden_at timestamptz`, `admin_action_admin_idx (admin_id, at)`. Жодного `DROP`/зміни наявних колонок. Якщо на момент збирання `0046` уже зайнято (64 злили першим під цим номером) — узяти наступний вільний номер за `apps/server/drizzle/meta/_journal.json` і генерувати **після** злиття, щоб знімок містив таблиці 64.

> **Звірка з кодом.** План спирається на `main` 2026-11-20 (`39052508`, специфікація 44e):
> - стрічка: `apps/server/src/db/schema.ts` ~617 `feedEvent` (`key` унікальний, `userId`, `kind`, `gameId`, `data: FeedData`, `at`, `createdAt`); `feed-store.ts` — `notHidden(column)` (бан і бот), `feedVisibility(db, viewerId, now)` (свої, взаємні друзі, `planned` — ще й ті, хто додав мене; `notHidden(user_id)`; `at >= cutoff`), `eventRows`, `eventLikes(db, viewerId, events)` (для `game` — лайки `player` за `(game_id, target_user_id)`, для решти — `event` за `event_key`; лише `hidden = false`), `feedPage`, `feedBadge`, `visibleEvent` (маршрут лайка `POST /api/feed/:id/like` у `feed-routes.ts` — невидима подія → 404); вставки подій — `feed-publish.ts` ~161 (`onConflictDoNothing` за `key`), `calendar-store.ts` ~220/251/271 (`planned`: вставка, `update … set({ data })`, видалення), `player-gifts.ts`, `player-card.ts` ~94; коментарів і текстів від людей у стрічці **немає** (`packages/shared/src/feed.ts` `FeedData` — лише системні події);
> - вподобайки: `schema.ts` ~580 `userLike.hidden` (`question`/`quiz` ховає `syncHiddenLikes` при видаленні запитання чи вікторини; для `event` і `player` `hidden` ніхто не ставить); `like-store.ts` `likeTotals` (`player + event` → «гравець», лише `hidden = false`);
> - групи (12k/12l): `schema.ts` ~733 `familyGroup` (`...stamps` → `createdAt`/`updatedAt`), `groupMember` (роль, частковий унікальний індекс `group_member_owner_idx` — один власник), `groupInvite`, `groupItem` (`surprise`, `authorId` null — акаунт видалено); `group-store.ts` — `repair` (група без незаблокованого власника лагодиться при читанні), `membership` (використовують `group-routes.ts` `member()`, `lobby-routes.ts` ~108, ліга), `listGroups`, `groupDetail`, `deleteGroup`, `lockGroup`, `roleIn`, `transferOwner(db, groupId, fromId, toId)` (спершу понизити, потім підвищити, `TransferConflict`), `removeMember`, `invitesFor`, `groupByCode` → `joinPreview`/`joinByCode`, `acceptInvite`/`addMember`; передача при видаленні акаунта — `account-delete.ts` `handOverGroups` (найраніший `joined_at`, далі `user_id`); `group-items.ts` — `visibleItemsWhere(viewerId)` («одна на весь код»: нею ж фільтрують `countVisibleItems`, `listItems`, `visibleItem`, `group-uses.ts` ~41);
> - бібліотека (47), зразок модерації: `library_entry.moderation` (`ok | auto_hidden | hidden`), `report-store.ts` `actOnQuiz` — одна транзакція: рядок `FOR NO KEY UPDATE`, зміна, `logAction` з `targetUserId` власника; види `library_hide`/`library_restore`; схема дії — `adminQuizActionSchema` у `library.ts`;
> - журнал: `packages/shared/src/admin.ts` `ADMIN_ACTION_KINDS` (останній — `push_broadcast`), `AdminLogDetails` (останнє поле — `count?`), `AdminLogEntry { id, at, admin, kind, target, details }`, `adminListQuerySchema`, `ADMIN_PAGE_SIZE = 50`, `ADMIN_REASON_MAX = 500`, `ADMIN_QUERY_MAX = 100`; `schema.ts` ~717 `adminAction` (`adminId` FK `set null`, `adminLabel`, `targetLabel`, `details jsonb`, індекс `admin_action_at_idx`); `bans.ts` `logAction(tx, { adminId, kind, targetUserId, details, now })`; `admin-store.ts` ~233 `adminLog(db, page)`; маршрут `admin-routes.ts` ~362 `GET /api/admin/log`; київський час — `apps/server/src/kyiv-time.ts` (`wallMs`, `offsetMs` — приватні; `kyivWallTime`, `nextWeekKyiv`);
> - адмінка, сервер: `admin-routes.ts` — `AdminDeps`, `adminOf`, `gate` (не-адміну **404**), `read`/`write`, у кінці `registerAdminBotRoutes`, `registerPlayerCardRoutes`, `registerAdminBroadcastRoutes(app, deps, { read, write, adminOf })`; тест воріт — `admin-routes.test.ts` ~97 список `routes`; пошук людей — `profiles.ts` `searchProfiles(db, q, excludeId)`, маршрут `GET /api/admin/bot/people?q=`;
> - адмінка, веб: `apps/web/src/admin/Admin.tsx` (`TABS`, `<Routes>`, `AdminPager`), `AdminLog.tsx` (сторінки, `logLine`), `admin-text.ts` `logLine(entry)` (змінні `admin`, `target`, `title`, `text`, `code`, `count`, …), `admin-api.ts` (`fetchData`, `adminLog(page)`, `searchBotPeople`), `useAdminData(load, key)`, `PeoplePicker.tsx`; зразок картки з діями й підтвердженням введеним текстом — `apps/web/src/admin/card/*` (58, видалення акаунта ніком); стрічка — `apps/web/src/feed/FeedCard.tsx`, `feed/feed-text.ts` `feedText(data, zone?)`, `feedIcon(data)`; групи — `apps/web/src/pages/Groups.tsx`, `GroupPage.tsx`; київський пояс — `apps/web/src/calendar/calendar-time.ts` `KYIV_ZONE`;
> - i18n: `apps/web/src/i18n.ts` (наявні `err_group_not_found`, `err_owner_must_transfer`, `err_member_not_found`, `err_item_not_found`; `err_confirm_mismatch` — про нік, для груп не годиться), `locales/{en,de,es,it,pl,ar}.json`, `i18n.test.ts` (списки `ADDED_*` ~220–228, умова `adds no uk keys beyond the agreed list` ~801, зразок перевірки `59 keys (push broadcast) are in every locale` ~733);
> - e2e: `apps/server/e2e/part59-push-broadcast.e2e.ts` (зразок: `relisten({ adminEmails: adminEmails({ ADMIN_EMAILS }) })`, `light(page)`, `view(page, name)` = кадр + `expectNoSideScroll`, `problems`-фільтр), `helpers/common.ts` (`register`, `open`, `myId`, `bodyText`), `helpers/setup.ts`; групи в тестах — `createGroup(db, ownerId, input, now)`.
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

> **Точки злиття з планом 64** (збої сервера, скарги гравців, копії; пишеться паралельно, збирається окремо). Хто зливає другим — додає своє поруч і лишає обидва:
> - **вкладки адмінки** — `apps/web/src/admin/Admin.tsx` `TABS` і `<Routes>` (ми — «Стрічка» `/admin/feed`, «Групи» `/admin/groups` перед «Журнал»; 64 — свої), `Admin.test.tsx`;
> - **види журналу** — рядок `ADMIN_ACTION_KINDS` і `AdminLogDetails` у `packages/shared/src/admin.ts` (ми — 8 видів і `feed?`); **групи видів** `ADMIN_LOG_GROUPS` (наші нові — у `moderation`; види 64 — у нову групу `system`, яку додає той, хто зливає другим; тест `every log kind is in exactly one group` змушує це зробити); `admin-text.ts` `logLine`; ключі `adminLog_*`;
> - **списки `ADDED_*`** у `apps/web/src/i18n.test.ts` (ми — `ADDED_MODERATION_63`, `ADDED_MODERATION_63_PLURALS`; обидва в умову `adds no uk keys beyond the agreed list`), `i18n.ts`, шість JSON;
> - **міграція** — ми `0046_moderation`, 64 — `0047_…`; `apps/server/src/db/schema.ts`, `drizzle/meta/_journal.json`, `drizzle/meta/*_snapshot.json` — при конфлікті перегенерувати міграцію того, хто зливає другим, на номер після першого;
> - `apps/server/src/admin-routes.ts` (рядок реєстрації в кінці; ми ще міняємо маршрут `GET /api/admin/log`), `admin-routes.test.ts` (`routes`), `admin-store.ts` (ми прибираємо `adminLog`).

**Мета:** адмін у вкладці «Стрічка» бачить усі події стрічки сторінками по 50 з фільтром за людиною й видом і ховає/показує їх (подія зникає в усіх, автор бачить «Приховано модератором», вподобайки під нею не рахуються); у вкладці «Групи» шукає родинні групи, відкриває картку з членами й записами, ховає/повертає групу з причиною (членам недоступна, власник бачить причину), вилучає члена, передає власника, видаляє групу з підтвердженням назвою, ховає/показує запис; журнал дій фільтрується за адміном, групами видів, періодом і текстом і вивантажується в CSV (до 10 000 рядків, UTF-8 з BOM, київський час).

**Архітектура:** спільне — `packages/shared/src/moderation.ts` (типи вкладок, схеми дій) і розширення `admin.ts` (8 видів журналу, групи видів, схема фільтрів журналу, межа вивантаження). Сервер — міграція з позначками `hidden_at`; `feed-store.ts` і `group-store.ts`/`group-items.ts` враховують позначки там, де вже стоять єдині фільтри (`feedVisibility`, `membership`, `visibleItemsWhere`); `moderation-store.ts` — адмінські читання й дії (кожна дія — одна транзакція з `logAction`, як `actOnQuiz`); `admin-moderation-routes.ts` — маршрути за наявними воротами; `admin-log-store.ts` — сторінка й вивантаження журналу з фільтрами. CSV складає веб (там словник і `logLine`), сервер віддає до 10 000 рядків JSON. Веб — вкладки `AdminFeed.tsx`, `AdminGroups.tsx`, `AdminGroup.tsx`, фільтри й кнопка в `AdminLog.tsx`, `log-csv.ts`; позначка «Приховано модератором» у `FeedCard.tsx` і картці групи у `Groups.tsx`.

**Технології:** TypeScript, zod 4, Fastify + `@fastify/rate-limit`, drizzle (Postgres) + drizzle-kit, vitest (`shared`/`server`/`web`), React 19 + Testing Library, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-20-moderation-log-design.md` (44e); зразки — план 47 (бібліотека, модерація), 58 (картка гравця, підтвердження введеним текстом), 59 (формат плану, вкладка адмінки).

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22**; рушій, кімнати, зрізи — без змін.
- **Міграція одна — `0046_moderation`**, лише додавання (колонки `NULL`-ові без типових значень, один індекс); жодного `DROP` чи зміни наявного. 64 бере `0047`.
- **Лише адміністратори:** кожен новий `/api/admin/feed*`, `/api/admin/groups*`, `/api/admin/log*` — через `read`/`write` (ворота `gate`), не-адміну й гостю — та сама **404**, що й невідомий маршрут; кожен — у списку `routes` тесту воріт. Email у відповідях модерації й журналу — жодного (тест шукає `@`).
- **Усі дії — у журнал**, у тій самій транзакції, що й зміна; повторна дія без зміни (сховати вже приховане) — `{ changed: false }`, рядка журналу немає.
- **Чужі дані не змінюються:** ховання — лише позначка (`hidden_at`), «Показати» повертає все, як було; видалення — лише групи (з підтвердженням назвою).
- Інтерфейс — 7 мов: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`; нові uk-ключі — у списках `ADDED_MODERATION_63` і `ADDED_MODERATION_63_PLURALS` у `i18n.test.ts` (в умову `adds no uk keys beyond the agreed list` і в нову перевірку наявності в шести локалях, як `59 keys`). ru немає. Тексти адміна (причина) не перекладаються.
- Кириличні літерали в `apps/web/src/` — лише в словниках і тестах (`source-scan.test.ts`).
- **Нічого, пов'язаного з росією**, — у фікстурах, назвах груп, ніках, причинах, e2e.
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm exec tsc -p <пакет>` у задачах 1–5, з задачі 6 — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів vitest).
- Файли правити лише Edit/Write чи `sed`; **python3 на цій машині — порожня заглушка, ним нічого не правити й не генерувати**; після коміту — `git show --stat`.
- Робоче дерево — лише `C:\ClaudeCode\quiz\.superpowers\worktrees\plan63`; жодних файлів поза `C:\ClaudeCode\quiz` (тимчасові — у `.superpowers` чи scratchpad сесії). Інших дерев (зокрема 64) не торкатися.
- e2e: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 63"`; телефон 360 px, світла тема (`quiz:theme = light`, `is-light` на `<html>`); після — окремо `-t "part 12k"`, `-t "part 17"` (стрічка й лайки) і `-t "part 59"`.

## Рішення плану (там, де специфікація мовчить)

**Коментарі стрічки.** Їх немає: `FeedData` — лише системні події (гра, досягнення, рівень, приз, запланована гра; картки «вподобав» не є рядками `feed_event`). Тому модеруються лише події `feed_event`; картки лайків до адмінки не потрапляють.

**Спільне — `packages/shared/src/admin.ts`**
- `ADMIN_ACTION_KINDS` + `'feed_hide'`, `'feed_show'`, `'group_hide'`, `'group_restore'`, `'group_member_remove'`, `'group_owner_transfer'`, `'group_delete'`, `'group_item_hide'`, `'group_item_show'` (дев'ять; `group_item_show` — див. «Розбіжності»).
- `AdminLogDetails` + `feed?: FeedData` (подія, як була на мить дії: веб пише її словами через `feedText`). Назва групи — у `title`, причина — у `reason`, текст запису — у `text` (обрізаний до 200 символів), ім'я нового власника чи вилученого — через `targetUserId`.
- Групи видів: `ADMIN_LOG_GROUPS = ['moderation', 'players', 'games', 'bot', 'announcements'] as const`, `AdminLogGroup`, `ADMIN_LOG_GROUP_KINDS: Record<AdminLogGroup, readonly AdminActionKind[]>`:
  - `moderation`: `ban`, `unban`, `quiz_delete`, `question_delete`, `library_hide`, `library_restore`, `report_dismiss`, `appeal_reject`, `nickname_reset`, `avatar_reset` + дев'ять нових;
  - `players`: `quiz_view`, `prize_delete`, `award_delete`, `achievement_grant`, `achievement_revoke`, `xp_adjust`, `prize_gift`, `gift_revoke`, `account_delete`;
  - `games`: `game_close`;
  - `bot`: усі `bot_*` (`bot_game_start` … `bot_room_lobby`, 19 видів);
  - `announcements`: `announcement_set`, `announcement_clear`, `push_broadcast`.
  Кожен вид — рівно в одній групі (тест). Види плану 64 — у групу `system` (точка злиття).
- `ADMIN_LOG_EXPORT_MAX = 10_000`.
- Фільтри журналу:
  ```ts
  const DAY = /^\d{4}-\d{2}-\d{2}$/; // і справжня дата: Date.parse(`${day}T00:00:00Z`) не NaN і toISOString().slice(0, 10) === day
  export const adminLogFilterSchema = z.object({
    admin: z.string().min(1).max(64).optional(),                 // admin_action.admin_id
    groups: z.string().max(200).optional(),                       // 'moderation,bot' → AdminLogGroup[] без повторів; невідома група → помилка
    from: z.string().regex(DAY).optional(),                       // київський день, включно
    to: z.string().regex(DAY).optional(),                         // київський день, включно
    q: z.string().trim().max(ADMIN_QUERY_MAX).optional(),         // '' → undefined
  }).strict(); // + refine: from <= to
  export const adminLogQuerySchema = adminLogFilterSchema.extend({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
  export type AdminLogFilter = z.output<typeof adminLogFilterSchema>; // groups — масив
  export interface AdminLogPage extends AdminList<AdminLogEntry> { admins: { id: string; nickname: string }[] }
  export interface AdminLogExport { rows: AdminLogEntry[]; total: number }
  ```

**Спільне — `packages/shared/src/moderation.ts`** (експорт з `index.ts`)
- `ADMIN_FEED_KINDS = FEED_KINDS без 'like'`; `adminFeedQuerySchema = { page, user?: string 1…64, kind?: enum(ADMIN_FEED_KINDS) }.strict()`.
- `AdminFeedRow { id: string; at: string; who: { id: string; nickname: string | null }; data: FeedData; likes: number /* рахуються, лише коли не приховано */; hidden: { at: string } | null }`.
- `adminHideSchema = z.object({ hidden: z.boolean() }).strict()` — одна схема для «Сховати»/«Показати» події й запису.
- `adminGroupHideSchema = z.object({ hidden: z.boolean(), reason: z.string().trim().max(ADMIN_REASON_MAX).optional().transform((r) => r || null) }).strict()`.
- `adminGroupOwnerSchema = z.object({ userId: z.string().min(1).max(64) }).strict()`; `adminGroupDeleteSchema = z.object({ name: z.string().max(GROUP_LIMITS.nameMax + 10) }).strict()` (збіг — після `trim()` обох, з урахуванням регістру).
- `AdminGroupRow { id; name; emoji: GroupEmoji; owner: { id: string; nickname: string | null } | null; members: number /* усі, з заблокованими */; items: number; createdAt: string; hidden: { at: string; reason: string | null } | null }`.
- `AdminGroupMember { id: string; nickname: string | null; role: GroupRole; joinedAt: string; banned: boolean }`; `AdminGroupItem { id; kind: GroupItemKind; text: string; author: string | null /* нік; null — акаунт видалено */; surprise: boolean; createdAt: string; hidden: boolean }`.
- `AdminGroupDetail { group: AdminGroupRow; members: AdminGroupMember[]; items: AdminList<AdminGroupItem> }` (записи — сторінками по 50, найновіші першими; адмін бачить і сюрпризи).
- `feed.ts`: `FeedEvent.hidden?: true` — лише в автора, для прихованої події. `groups.ts`: `GroupCard.hidden?: { reason: string | null }` — лише в картці власника.

**Сервер — що означає «приховано»**
- **Подія:** `feedVisibility` + `(${feedEvent.hiddenAt} is null or ${feedEvent.userId} = ${viewerId})` — у чужих стрічках, бейджі й `visibleEvent` (лайк → 404) її немає; автор бачить її з `hidden: true`, лічильник `likes` — `{ count: 0, liked: false }`. Вставки й `planned`-оновлення `hidden_at` не скидають (`onConflictDoNothing`, `set({ data })`) — тест.
- **Вподобайки під подією:** у тій самій транзакції ховання `user_like.hidden = true` для `kind = 'event' and event_key = key`, а для події `game` — для `kind = 'player' and game_id = gameId and target_user_id = userId`; «Показати» ставить `false` тим самим рядкам (для `event`/`player` `hidden` більше ніхто не ставить, тож повернення безпечне). Так `likeTotals` і лічильники під подією їх не рахують.
- **Група:** `membership()` повертає `null`, коли `hidden_at is not null` — тож усі `/api/groups/:id*`, групова гра в лобі й ліга відповідають, як для неіснуючої групи (404), і для власника теж. `listGroups`: членам прихована група не показується, власнику — картка з `hidden: { reason }` (на вебі — не посилання). `invitesFor`, `groupByCode` (→ `joinPreview`, `joinByCode`) і `acceptInvite` прихованої групи не бачать. Межа 10 груп на людину рахує й приховані (як видалені не рахує — без змін).
- **Запис:** `visibleItemsWhere` + `${groupItem.hiddenAt} is null` — для всіх, і для автора (запис не потрапляє ні в список, ні в лічильник, ні у вибір для вікторини 12l). Уже створені вікторини з нього не змінюються.

**Сервер — дії адміна (`apps/server/src/moderation-store.ts`)**
- Читання: `adminFeed(db, query: { page; user?; kind? }): Promise<AdminList<AdminFeedRow>>` — усі `feed_event` (включно з приховані й заблокованих авторів), `at desc, id desc`; `likes` — один груповий запит на сторінку (для прихованих — 0). `adminGroups(db, query: { q?; page }): Promise<AdminList<AdminGroupRow>>` — пошук `ILIKE` за назвою групи чи ніком власника (екранування `\ % _`, як `searchProfiles`), новіші першими. `adminGroup(db, groupId, page): Promise<AdminGroupDetail | null>`.
- Дії (усі — `Promise<{ ok: true; changed: boolean } | Fail<…>>`, одна транзакція: рядок `FOR UPDATE`, зміна, `logAction`):
  - `setFeedHidden(db, { adminId, eventId, hidden, now })` → `feed_hide`/`feed_show`, `targetUserId` = автор, `details: { feed: data }`; `Fail<'not_found'>`.
  - `setGroupHidden(db, { adminId, groupId, hidden, reason, now })` → `group_hide` (ставить `hidden_at`, `hidden_reason`) / `group_restore` (обидва `null`), ціль — власник, `details: { title: name, reason }`; повторне ховання з іншою причиною — оновлює причину, `changed: true`.
  - `adminRemoveMember(db, { adminId, groupId, userId, now })` → `group_member_remove`, ціль — вилучений; власника — `Fail<'owner_must_transfer'>`; не член — `'member_not_found'`. Запрошення людини в цю групу теж видаляється.
  - `adminTransferOwner(db, { adminId, groupId, toId, now })` → `group_owner_transfer`, ціль — новий власник, `details: { title: name, text: нік колишнього }`; `toId` — лише незаблокований член з роллю `member` і не бот (інакше `'member_not_found'`; `repair` інакше одразу б «полагодив» назад). Тіло обміну ролей винести з `transferOwner` у `swapOwner(tx, groupId, fromId, toId)` у `group-store.ts`; поведінка `transferOwner` не змінюється — його тести зелені.
  - `adminDeleteGroup(db, { adminId, groupId, name, now })` → `Fail<'group_name_mismatch'>`, інакше `logAction('group_delete', { title: name })` і `deleteGroup` в одній транзакції (рядок журналу не має FK на групу — лишається).
  - `setItemHidden(db, { adminId, groupId, itemId, hidden, now })` → `group_item_hide`/`group_item_show`, ціль — автор (чи `null`), `details: { title: назва групи, text: перші 200 символів }`; запис іншої групи — `'item_not_found'`.
- Модерація діє й на приховані групи (адмін бачить усе), `repair` перед читанням картки не викликається (картка показує стан як є).

**Сервер — маршрути (`apps/server/src/admin-moderation-routes.ts`, `registerAdminModerationRoutes(app, deps, { read, write, adminOf })`)**
- `GET /api/admin/feed?page&user&kind` (`read`); `PUT /api/admin/feed/:id/hidden` (`write`, `adminHideSchema`).
- `GET /api/admin/groups?q&page`; `GET /api/admin/groups/:id?page`; `PUT /api/admin/groups/:id/hidden` (`adminGroupHideSchema`); `DELETE /api/admin/groups/:id/members/:userId`; `PUT /api/admin/groups/:id/owner` (`adminGroupOwnerSchema`); `DELETE /api/admin/groups/:id` (тіло `adminGroupDeleteSchema`); `PUT /api/admin/groups/:id/items/:itemId/hidden` (`adminHideSchema`).
- Не uuid → 404 `not_found`; групи немає → 404 `group_not_found`; помилки дій: `owner_must_transfer` 409, `member_not_found` 404, `item_not_found` 404, `group_name_mismatch` 409; тіло не за схемою → 400 `invalid_payload`. Успіх — `200 { changed }`, видалення — `204`.

**Сервер — журнал (`apps/server/src/admin-log-store.ts`)**
- `logWhere(filter: AdminLogFilter): SQL | undefined` — `admin_id = admin`; `kind in (види вибраних груп)`; `at >= kyivDayStart(from)`; `at < kyivDayStart(to + 1 день)`; `q` — `ILIKE` з екрануванням за `admin_label`, `target_label` і `details::text` (так знаходяться назва, текст, код).
- `adminLogPage(db, query): Promise<AdminLogPage>` — як `adminLog`, з `logWhere`; `admins` — різні `(admin_id, admin_label)` з найновішою міткою для кожного `admin_id` не-null, за ніком. `adminLog` з `admin-store.ts` прибрати (його бере лише маршрут).
- `adminLogExport(db, filter): Promise<AdminLogExport>` — та сама вибірка, `at desc, id desc`, `limit ADMIN_LOG_EXPORT_MAX`; `total` — повний підрахунок (веб попереджає, коли `total > rows.length`).
- `kyivDayStart(day: string): Date` у `kyiv-time.ts` — момент 00:00 цього дня в Києві (через `offsetMs`; переходи на літній/зимовий час — тест).
- Маршрути: `GET /api/admin/log` тепер за `adminLogQuerySchema` (старий `?page=1` діє); `GET /api/admin/log/export` за `adminLogFilterSchema` (`read`). Вивантаження не пишеться в журнал (це читання журналу, як і його перегляд).

**Веб**
- Вкладки (`Admin.tsx`): `{ to: '/admin/feed', key: 'adminTabFeed' }`, `{ to: '/admin/groups', key: 'adminTabGroups' }` — перед `adminTabLog`; маршрути `feed`, `groups`, `groups/:id`.
- `AdminFeed.tsx`: фільтр «Людина» — `PeoplePicker` з `max={1}`, «Вид» — `<select>` (усі / `ADMIN_FEED_KINDS` словами `adminFeedKind_<kind>`); рядок — дата, нік (посилання на `/admin/users/:id`), `feedIcon` + `feedText(data)`, «❤️ N», позначка `adminFeedHidden` і кнопка «Сховати»/«Показати» (без підтвердження: дія зворотна); після дії — `reload`. Сторінки — `AdminPager`.
- `AdminGroups.tsx`: пошук (`adminSearchGroups`), рядки — емодзі й назва (посилання на `/admin/groups/:id`), власник, «{count} людей» (`adminGroupMembers_one/_few/_many`), дата, позначка «Приховано».
- `AdminGroup.tsx`: заголовок і стан; «Сховати групу» (поле причини, необов'язкове, ≤ 500, підтвердження `window.confirm`) / «Повернути»; члени — нік, роль, дата, «заблоковано»; біля члена — «Вилучити» (`confirm`), біля незаблокованого члена — «Зробити власником» (`confirm`); записи — вид, текст, автор, дата, позначки «Сюрприз», «Приховано», «Сховати запис»/«Показати»; унизу — «Видалити групу»: поле «Введіть назву групи», кнопка активна лише за збігу (після `trim`), після 204 — `navigate('/admin/groups')`. Помилки — `errorText`.
- `FeedCard.tsx`: `event.hidden` → під текстом `<p className="meta feed-hidden">{t('feedHiddenByModerator')}</p>`, кнопки лайка немає. `Groups.tsx`: картка з `hidden` — не `Link`, з `groupHiddenByModerator` і, якщо є, `groupHiddenReason` ({reason}).
- `AdminLog.tsx`: панель фільтрів — «Хто» (`<select>`: усі + `admins`), «Що» — прапорці груп (`adminLogGroup_<group>`), «Від»/«До» (`<input type="date">`), «Пошук» (текст, застосовується за «Шукати» чи Enter); зміна фільтра скидає сторінку на 1; фільтри — у `useSearchParams` (посилання можна відкрити знову). «Вивантажити CSV» — читає `/api/admin/log/export` з тими ж фільтрами, складає `logCsv(rows)`, завантажує `Blob` з ім'ям `admin-log-YYYY-MM-DD.csv` (київська дата); `total > rows.length` → `adminLogCsvCapped` ({count}).
- `apps/web/src/admin/log-csv.ts`: `logCsv(rows: AdminLogEntry[]): string` — `'\uFEFF'` + рядок заголовків (`adminLogCsvAt`, `adminLogCsvAdmin`, `adminLogCsvAction`, `adminLogCsvTarget`, `adminLogCsvDetails`) + рядки, роздільник `;`, кінець рядка `\r\n`; колонки: час `kyivStamp(at)` (`YYYY-MM-DD HH:MM:SS`, `KYIV_ZONE`), нік адміна, код виду (`feed_hide`), нік цілі, `logLine(entry)`; поле в лапках, якщо є `;`, `"`, `\r` чи `\n`, лапки подвоюються; поле, що починається з `=`, `+`, `-`, `@`, табуляції чи `\r`, отримує префікс `'` (захист від формул Excel).
- `logLine`: нові ключі `adminLog_feed_hide` ('{admin} сховав(-ла) подію стрічки {target}: {text}' — `text` = `feedText(details.feed)`), `adminLog_feed_show`, `adminLog_group_hide` ('{admin} сховав(-ла) групу «{title}» ({target})' + наявна «. Причина: …»), `adminLog_group_restore`, `adminLog_group_member_remove`, `adminLog_group_owner_transfer` ('{admin} передав(-ла) групу «{title}» від {text} до {target}'), `adminLog_group_delete`, `adminLog_group_item_hide` ('… запис «{text}» у групі «{title}»'), `adminLog_group_item_show`. Для `group_hide` причина додається так само, як для `ban`.
- Стилі: `.admin-filters` (обгортка, `flex-wrap`), `.admin-feed-row`, `.admin-group-card`, `.feed-hidden` — лише змінні теми, 360 px без бічного скролу.

## Порядок збирання

- 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Залежності: 2, 3 ← 1; 4 ← 2, 3; 5 ← 1; 6 ← 4; 7 ← 5; 8 — остання.
- `tsc -p apps/web` може падати на нових `adminLog_*` до задачі 6 — очікувано; `pnpm typecheck` обов'язково зелений з задачі 6.

## Фокус рев'ю

1. **Хто що бачить після ховання.** Прихована подія — немає в стрічці друга, у бейджі, у лайку (404); автор бачить з позначкою; «Показати» повертає й лайки. Задачі 2, 8.
2. **Прихована група для власника.** Не відкривається (404) ні на сторінці, ні в лобі групової гри, ні за посиланням-запрошенням; у списку власника — з причиною, без посилання. Задачі 3, 6, 8.
3. **Передача власника адміном.** Новий власник — лише незаблокований член; один власник навіть на мить (частковий індекс); `repair` не повертає власника назад. Задача 3 (тест на заблокованого).
4. **Фільтр «до» включно за Києвом.** Дія о 23:30 за Києвом 2026-11-20 (21:30 UTC) потрапляє в `to=2026-11-20` і не потрапляє в `from=2026-11-21`; перехід на зимовий час 2026-10-25. Задача 5.
5. **CSV у Excel.** BOM, `;`, лапки в нікові й назві, перенос рядка в тексті запису, нік `=1+1` не стає формулою; понад 10 000 — попередження. Задача 7.

---

### Задача 1. Спільне: види журналу й групи видів, фільтри журналу, типи й схеми модерації

**Files:**
- Create: `packages/shared/src/moderation.ts`, `packages/shared/src/moderation.test.ts`.
- Modify: `packages/shared/src/admin.ts`, `packages/shared/src/feed.ts` (`FeedEvent.hidden?`), `packages/shared/src/groups.ts` (`GroupCard.hidden?`), `packages/shared/src/index.ts`.
- Test: `packages/shared/src/admin.test.ts`.

**Interfaces:**
- Consumes: `FEED_KINDS`, `FeedData`, `GROUP_LIMITS`, `GroupEmoji`, `GroupRole`, `GroupItemKind`, `ADMIN_REASON_MAX`, `ADMIN_QUERY_MAX`, `AdminList`.
- Produces: 9 нових `AdminActionKind`; `AdminLogDetails.feed?`; `ADMIN_LOG_GROUPS`, `AdminLogGroup`, `ADMIN_LOG_GROUP_KINDS`, `ADMIN_LOG_EXPORT_MAX`; `adminLogFilterSchema`, `adminLogQuerySchema`, `AdminLogFilter`, `AdminLogPage`, `AdminLogExport`; з `moderation.ts` — `ADMIN_FEED_KINDS`, `adminFeedQuerySchema`, `AdminFeedRow`, `adminHideSchema`, `adminGroupHideSchema`, `adminGroupOwnerSchema`, `adminGroupDeleteSchema`, `AdminGroupRow`, `AdminGroupMember`, `AdminGroupItem`, `AdminGroupDetail`.

- [ ] **Step 1: Write the failing tests:**
  - `admin.test.ts` `every log kind is in exactly one group`: для кожного `ADMIN_ACTION_KINDS` — рівно одна група з `ADMIN_LOG_GROUP_KINDS` містить його; сума довжин груп = `ADMIN_ACTION_KINDS.length`; `ADMIN_LOG_GROUP_KINDS.moderation` містить `feed_hide`, `group_delete`, `library_hide`, `ban`; `bot` містить `bot_plan_run` і `bot_room_lobby`; `announcements` — `push_broadcast`.
  - `the log filter: an admin, groups, a Kyiv day range and text`: `adminLogQuerySchema.parse({})` → `{ page: 1 }`; `{ groups: 'moderation,bot' }` → `groups: ['moderation', 'bot']`; `'bot,bot'` → `['bot']`; відкидає `groups: 'nope'`, `from: '2026-13-01'`, `from: '2026-02-30'`, `from: '20.11.2026'`, `from: '2026-11-21', to: '2026-11-20'`, `q: 'а'.repeat(101)`, зайве поле; `q: '  '` → без `q`; приймає `from` = `to`. `adminLogFilterSchema` відкидає `page`.
  - `moderation.test.ts` `feed and group moderation inputs`: `adminFeedQuerySchema` приймає `{ page: '2', kind: 'prize', user: 'u1' }`, відкидає `kind: 'like'`; `adminHideSchema` відкидає `{ hidden: 'yes' }`; `adminGroupHideSchema.parse({ hidden: true, reason: '  ' })` → `reason: null`, відкидає причину 501 символ; `adminGroupDeleteSchema` приймає `{ name: 'Поліські вечори' }`, відкидає без `name`; `ADMIN_FEED_KINDS` не містить `like`.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/admin.test.ts packages/shared/src/moderation.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (спільне). Перевірку справжньої дати — однією функцією `isDay(text)` у `admin.ts`.
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 && pnpm exec tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 63 moderation — nine log kinds for hiding feed events, groups and group records, member removal, owner transfer and group delete; log kind groups; log filters by admin, groups, Kyiv day range and text; up to 10 000 rows for export"
```

---

### Задача 2. Сервер: міграція `0046_moderation`, приховані події стрічки й вподобайки під ними

**Files:**
- Create: `apps/server/drizzle/0046_moderation.sql` (+ знімок і рядок журналу від drizzle-kit), `apps/server/src/moderation-store.ts` (поки — стрічка), `apps/server/src/moderation-store.test.ts`.
- Modify: `apps/server/src/db/schema.ts` (`feedEvent.hiddenAt`, `familyGroup.hiddenAt`, `familyGroup.hiddenReason`, `groupItem.hiddenAt`, `admin_action_admin_idx`), `apps/server/src/feed-store.ts`.
- Test: `apps/server/src/db/schema.test.ts`, `apps/server/src/feed-store.test.ts`, `apps/server/src/feed-routes.test.ts`.

**Interfaces:**
- Consumes: задача 1; `feedVisibility`, `eventLikes`, `logAction`.
- Produces: колонки й індекс; `FeedEvent.hidden` від `feedPage`; `adminFeed(db, query): Promise<AdminList<AdminFeedRow>>`; `setFeedHidden(db, { adminId, eventId, hidden, now }): Promise<{ ok: true; changed: boolean } | { ok: false; error: 'not_found' }>`.

- [ ] **Step 1: Write the failing tests:**
  - `schema.test.ts` `describe('moderation (63)')`: `createTestDbUpTo('0045_push_broadcast')`, вставити подію, групу, запис; `migrateRest` → у наявних `hidden_at` = `null`, `hidden_reason` = `null`; індекс `admin_action_admin_idx` є (`pg_indexes`).
  - `feed-store.test.ts` `a hidden event leaves friends' feeds and the badge, the author sees it marked`: Оля й Петро — взаємні друзі, подія Олі `achievement`; `setFeedHidden(hidden: true)` → `feedPage` Петра без неї, `feedBadge(Петро).events` = 0, `visibleEvent(Петро, id)` = `null`; `feedPage` Олі — подія з `hidden: true`, `likes: { count: 0, liked: false }`; `setFeedHidden(hidden: false)` → у Петра знову, без `hidden`.
  - `likes under a hidden event do not count and come back on show`: Петро вподобав подію `level` Олі (`kind: 'event'`) і подію `game` (`kind: 'player'`, той самий `gameId`); після ховання обох — `likeTotals(Оля).player` = 0, після «Показати» — 2. Лайк Петра на іншу гру Олі не змінюється.
  - `republishing or editing a hidden event keeps it hidden`: прихована `planned` → `updateEvent` (нова назва) → `hidden_at` не `null`; повторний `insert … onConflictDoNothing` з тим самим `key` (через `feed-publish`) — так само.
  - `moderation-store.test.ts` `adminFeed lists every event 50 a page, by person and kind, hidden included`: 51 подія Олі й 1 Петра (Петро заблокований) → сторінка 1 — 50, `total` 52; `user: Петро` → 1; `kind: 'prize'` — лише призи; прихована — з `hidden.at`, `likes` 0. `setFeedHidden twice changes once and logs once`: друге ховання → `{ ok: true, changed: false }`; у `admin_action` один `feed_hide` з `target_user_id` Олі й `details.feed.kind`; неіснуючий uuid → `not_found`.
  - `feed-routes.test.ts`: лайк прихованої події другом → 404.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/db/schema.test.ts apps/server/src/feed-store.test.ts apps/server/src/feed-routes.test.ts apps/server/src/moderation-store.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** схему; `pnpm --filter @quiz/server exec drizzle-kit generate --name moderation` → перевірити, що SQL — лише чотири `ALTER TABLE … ADD COLUMN` (без `NOT NULL`, без `DEFAULT`) і `CREATE INDEX "admin_action_admin_idx"`, файл — `0046_moderation.sql`. Далі `feedVisibility`/`eventRows`/`feedPage` і `adminFeed`, `setFeedHidden` — за «Рішеннями плану».
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/db/schema.test.ts apps/server/src/feed-store.test.ts apps/server/src/feed-routes.test.ts apps/server/src/feed-publish.test.ts apps/server/src/like-store.test.ts apps/server/src/likes-routes.test.ts apps/server/src/calendar-store.test.ts apps/server/src/moderation-store.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/drizzle apps/server/src
git commit -m "feat(server): 63 feed moderation base — migration 0046 adds hidden marks to feed events, family groups and group records; a hidden event leaves everyone's feed and badge, the author sees it marked, likes under it stop counting and come back on show"
```

---

### Задача 3. Сервер: приховані групи й записи, дії адміна з групами

**Files:**
- Modify: `apps/server/src/group-store.ts` (`membership`, `listGroups`, `invitesFor`, `groupByCode`, `acceptInvite`, `swapOwner`), `apps/server/src/group-items.ts` (`visibleItemsWhere`), `apps/server/src/moderation-store.ts` (групи).
- Test: `apps/server/src/group-store.test.ts`, `apps/server/src/group-items.test.ts`, `apps/server/src/group-routes.test.ts`, `apps/server/src/moderation-store.test.ts`.

**Interfaces:**
- Consumes: задачі 1–2; `repair`, `lockGroup`, `roleIn`, `deleteGroup`, `logAction`, `notHidden`.
- Produces: `GroupCard.hidden` у `listGroups` власника; `swapOwner(tx, groupId, fromId, toId): Promise<void>` (кидає `TransferConflict`); `adminGroups`, `adminGroup`, `setGroupHidden`, `adminRemoveMember`, `adminTransferOwner`, `adminDeleteGroup`, `setItemHidden` — сигнатури в «Рішеннях плану».

- [ ] **Step 1: Write the failing tests:**
  - `group-store.test.ts` `a hidden group is closed to members and the owner, the owner sees why in the list`: Оля (власниця), Петро; `setGroupHidden(hidden: true, reason: 'Образлива назва')` → `membership(Петро)` і `membership(Оля)` = `null`; `listGroups(Петро).groups` — без неї; `listGroups(Оля)` — картка з `hidden: { reason: 'Образлива назва' }`; `joinPreview(код)` = `null`; запрошення Тараса в цю групу немає в `invitesFor(Тарас)`, `acceptInvite` → як для неіснуючої. Після `hidden: false` — усе як було, `hidden` у картці немає.
  - `group-routes.test.ts`: `GET /api/groups/:id` прихованої — 404 для Олі й Петра; `POST /api/groups/join/:code` — 404.
  - `group-items.test.ts` `a hidden record is gone for everyone, the author too`: запис Петра прихований → `listItems` Олі й Петра без нього, `countVisibleItems` менше на 1, `markUses` з ним нічого не пише.
  - `moderation-store.test.ts`:
    - `adminGroups searches by group or owner nickname`: «Поліські вечори» (Оля), «Карпатська родина» (Ганна) → `q: 'карпат'` → 1, `q: 'оля'` → 1, `q: '%'` → 0; рядок містить `members` з заблокованими, `items`, `hidden`; JSON без `@`.
    - `adminGroup shows all members and records 50 a page, surprises and hidden too`.
    - `an admin removes a member but never the owner`: Петро → `{ ok: true, changed: true }`, рядка немає, його запрошення теж; Оля → `owner_must_transfer`; Тарас (не член) → `member_not_found`; у журналі `group_member_remove` з ціллю Петро.
    - `an admin passes the group to a member, not to the banned or the bot`: до Петра → власник Петро, Оля — `member`, один власник; `membership(Петро)` після `repair` — `owner`; до заблокованого Мирона → `member_not_found`; журнал `group_owner_transfer`, ціль Петро, `details.text` — нік Олі. Тести `transferOwner` — без змін, зелені.
    - `deleting a group needs its exact name`: `'поліські вечори'` → `group_name_mismatch`, група є; `'  Поліські вечори '` → видалено, у журналі `group_delete` з `title`.
    - `hiding a record of another group is not found`; повторне ховання — `changed: false`, один рядок журналу.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/group-store.test.ts apps/server/src/group-items.test.ts apps/server/src/group-routes.test.ts apps/server/src/moderation-store.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (що означає «приховано», дії адміна). Умову прихованості групи — однією функцією `groupShown = isNull(familyGroup.hiddenAt)` у `group-store.ts`; `membership` перевіряє її після `repair`.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/group-store.test.ts apps/server/src/group-items.test.ts apps/server/src/group-routes.test.ts apps/server/src/group-uses.test.ts apps/server/src/league-store.test.ts apps/server/src/lobby-routes.test.ts apps/server/src/account-delete.test.ts apps/server/src/moderation-store.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 63 group moderation — a hidden group is closed to members and the owner, who sees the reason in the list; hidden records vanish for everyone; admins remove members, pass the group to an unbanned member, delete it by its exact name and hide records, all in the log"
```

---

### Задача 4. Сервер: маршрути модерації стрічки й груп

**Files:**
- Create: `apps/server/src/admin-moderation-routes.ts`, `apps/server/src/admin-moderation-routes.test.ts`.
- Modify: `apps/server/src/admin-routes.ts` (реєстрація в кінці).
- Test: `apps/server/src/admin-routes.test.ts` (`routes`).

**Interfaces:**
- Consumes: задачі 1–3; `AdminDeps`, `read`, `write`, `adminOf`.
- Produces: `registerAdminModerationRoutes(app, deps, { read, write, adminOf }): Promise<void>`; маршрути з «Рішень плану».

- [ ] **Step 1: Write the failing tests:**
  - `admin-routes.test.ts` — у `routes`: `['GET', '/api/admin/feed?page=1']`, `['PUT', '/api/admin/feed/<uuid>/hidden']`, `['GET', '/api/admin/groups?q=ab&page=1']`, `['GET', '/api/admin/groups/<uuid>']`, `['PUT', '/api/admin/groups/<uuid>/hidden']`, `['DELETE', '/api/admin/groups/<uuid>/members/u1']`, `['PUT', '/api/admin/groups/<uuid>/owner']`, `['DELETE', '/api/admin/groups/<uuid>']`, `['PUT', '/api/admin/groups/<uuid>/items/<uuid>/hidden']`, `['GET', '/api/admin/log/export']` — гість і не-адмін отримують 404 `not_found`.
  - `admin-moderation-routes.test.ts`:
    - `the admin hides and shows a feed event`: `PUT … { hidden: true }` → `{ changed: true }`; `GET /api/admin/feed?user=<Оля>` — `hidden` не `null`; `{ hidden: 'x' }` → 400; не-uuid → 404.
    - `the admin moderates a group end to end`: список із пошуком; картка; ховання з причиною → `GET /api/groups/:id` власниці — 404; вилучення Петра → 200; власниця — 409 `owner_must_transfer`; передача до Тараса → 200; видалення з неправильною назвою — 409 `group_name_mismatch`, з правильною — 204, далі картка — 404 `group_not_found`; у `GET /api/admin/log` — `group_hide`, `group_member_remove`, `group_owner_transfer`, `group_delete` (новіші першими).
    - `responses carry no emails`: тіла `GET /api/admin/feed`, `/groups`, `/groups/:id` не містять `@`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/admin-moderation-routes.test.ts apps/server/src/admin-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** маршрути за «Рішеннями плану»; `GET /api/admin/log/export` у тесті воріт — маршрут додає задача 5, тож у цій задачі рядок списку `routes` для нього не додавати.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/admin-moderation-routes.test.ts apps/server/src/admin-routes.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 63 moderation routes — admins list every feed event by person and kind and hide or show it; search family groups, open a group card, hide or restore it with a reason, remove a member, pass the owner, delete by name and hide records; others get 404"
```

---

### Задача 5. Сервер: фільтри журналу й вивантаження

**Files:**
- Create: `apps/server/src/admin-log-store.ts`, `apps/server/src/admin-log-store.test.ts`.
- Modify: `apps/server/src/kyiv-time.ts` (`kyivDayStart`), `apps/server/src/admin-routes.ts` (`GET /api/admin/log`, `GET /api/admin/log/export`), `apps/server/src/admin-store.ts` (прибрати `adminLog`).
- Test: `apps/server/src/kyiv-time.test.ts`, `apps/server/src/admin-routes.test.ts`, `apps/server/src/admin-store.test.ts` (перенести тести `adminLog`, якщо є).

**Interfaces:**
- Consumes: задача 1; `adminAction`, `logAction`.
- Produces: `kyivDayStart(day: string): Date`; `logWhere(filter): SQL | undefined`; `adminLogPage(db, query): Promise<AdminLogPage>`; `adminLogExport(db, filter): Promise<AdminLogExport>`; маршрути.

- [ ] **Step 1: Write the failing tests:**
  - `kyiv-time.test.ts` `kyivDayStart is midnight in Kyiv`: `'2026-11-20'` → `2026-11-19T22:00:00.000Z`; `'2026-07-01'` → `2026-06-30T21:00:00.000Z`; `'2026-10-25'` (день переходу) → `2026-10-24T21:00:00.000Z`, `'2026-10-26'` → `2026-10-25T22:00:00.000Z`.
  - `admin-log-store.test.ts`:
    - `filters by admin, kind groups, a Kyiv day range and text`: Ганна (адмін) — `ban` Мирона 2026-11-19T10:00Z, `group_hide` «Поліські вечори» 2026-11-20T21:30Z (23:30 Київ); Ірина (адмін) — `push_broadcast` «Нова вікторина» 2026-11-20T09:00Z, `bot_plan_run` → `admin: Ганна` → 2; `groups: ['announcements','bot']` → 2; `from = to = '2026-11-20'` → `group_hide` і `push_broadcast`; `from: '2026-11-21'` → 0; `q: 'полісь'` → `group_hide` (з `details::text`), `q: 'мирон'` → `ban` (з `target_label`), `q: '%'` → 0; фільтри разом — перетин; `admins` — Ганна й Ірина за ніком, без повторів, коли Ганна змінила нік (береться найновіший).
    - `the export returns at most 10 000 rows and the full total`: 10 002 рядки (одна пакетна вставка) → `rows.length` 10 000, `total` 10 002, перший — найновіший.
  - `admin-routes.test.ts`: `GET /api/admin/log?page=1` — як раніше (`rows`, `total`, `page`, `pages`) + `admins`; `?groups=nope` → 400; `?from=2026-11-21&to=2026-11-20` → 400; `GET /api/admin/log/export?groups=moderation` → `{ rows, total }`; `?page=2` на export → 400; у `routes` — `['GET', '/api/admin/log/export']`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/kyiv-time.test.ts apps/server/src/admin-log-store.test.ts apps/server/src/admin-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (журнал). `to + 1 день` — через `Date.UTC` на розібраних полях, потім `kyivDayStart`.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/kyiv-time.test.ts apps/server/src/admin-log-store.test.ts apps/server/src/admin-routes.test.ts apps/server/src/admin-store.test.ts apps/server/src/bot-schedule.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 63 admin log filters — by admin, kind groups, a Kyiv day range (to inclusive) and text over nicknames and details; the list of admins; an export of the current selection up to 10 000 rows with the full total"
```

---

### Задача 6. Веб: вкладки «Стрічка» й «Групи», позначки для автора й власника, 7 мов

**Files:**
- Create: `apps/web/src/admin/AdminFeed.tsx`, `apps/web/src/admin/AdminFeed.test.tsx`, `apps/web/src/admin/AdminGroups.tsx`, `apps/web/src/admin/AdminGroups.test.tsx`, `apps/web/src/admin/AdminGroup.tsx`, `apps/web/src/admin/AdminGroup.test.tsx`.
- Modify: `apps/web/src/admin/Admin.tsx`, `apps/web/src/admin/admin-api.ts`, `apps/web/src/admin/admin-text.ts` (`logLine`), `apps/web/src/admin/PeoplePicker.tsx` (лише якщо `max={1}` не працює), `apps/web/src/feed/FeedCard.tsx`, `apps/web/src/pages/Groups.tsx`, стилі адмінки (файл, де `.admin-card`), `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,de,es,it,pl,ar}.json`.
- Test: `apps/web/src/admin/Admin.test.tsx`, `apps/web/src/admin/admin-text.test.ts`, `apps/web/src/feed/FeedCard.test.tsx`, `apps/web/src/pages/Groups.test.tsx`, `apps/web/src/i18n.test.ts`.

**Interfaces:**
- Consumes: задачі 1, 4; `useAdminData`, `AdminPager`, `PeoplePicker`, `feedText`, `feedIcon`, `errorText`.
- Produces: `admin-api.ts` — `adminFeed(query)`, `setFeedHidden(id, hidden)`, `adminGroups(query)`, `adminGroup(id, page)`, `setGroupHidden(id, hidden, reason)`, `removeGroupMember(id, userId)`, `passGroupOwner(id, userId)`, `deleteGroupAsAdmin(id, name)`, `setGroupItemHidden(id, itemId, hidden)` (усі — `Promise<ApiData<…>>`); ключі `ADDED_MODERATION_63` (частина 1).

- [ ] **Step 1: Write the failing tests:**
  - `Admin.test.tsx`: вкладки «Стрічка» й «Групи» стоять перед «Журнал»; `/admin/feed` і `/admin/groups/<id>` відкривають свої сторінки.
  - `AdminFeed.test.tsx` `lists events with hide and show`: заглушка `fetch` → два рядки (один прихований); видно текст `feedText`, «❤️ 3», позначку `adminFeedHidden` у прихованого; «Сховати» → `PUT /api/admin/feed/<id>/hidden { hidden: true }` і перечитування; вибір виду → запит з `kind=prize&page=1`.
  - `AdminGroups.test.tsx`: пошук → `?q=…&page=1`; рядок — посилання на `/admin/groups/<id>`, «3 людини», «Приховано».
  - `AdminGroup.test.tsx` `the group card`: «Вилучити» біля члена, не біля власника; «Зробити власником» — немає біля заблокованого; «Видалити групу» неактивна, доки поле не дорівнює назві (з пробілами по краях — активна); після 204 — перехід на `/admin/groups`; 409 `group_name_mismatch` → текст `err_group_name_mismatch`; «Сховати групу» з причиною → тіло `{ hidden: true, reason }`; «Сховати запис» → `PUT …/items/<id>/hidden`.
  - `FeedCard.test.tsx`: `hidden: true` → «Приховано модератором», кнопки лайка немає.
  - `Groups.test.tsx`: картка з `hidden: { reason: 'Образлива назва' }` — не посилання, видно позначку й причину; без причини — лише позначка.
  - `admin-text.test.ts`: `logLine` для `feed_hide` з `details.feed` рівня 12 → містить текст `feedText`; `group_hide` з причиною → «. Причина: …»; `group_owner_transfer` → «від Оля до Петро».
  - `i18n.test.ts` `63 keys (moderation) are in every locale`: як `59 keys` — кожен ключ `ADDED_MODERATION_63` у uk і шести локалях, ті самі змінні `{…}`, не дорівнює uk; множина `adminGroupMembers_*` — `_one` у `ADDED_MODERATION_63`, `_few`/`_many` у `ADDED_MODERATION_63_PLURALS`, `_other` у en/de/es/it/ar, `_few`/`_many` у pl, `_two`/`_zero` в ar; обидва списки — в умові `adds no uk keys beyond the agreed list`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/admin apps/web/src/feed apps/web/src/pages/Groups.test.tsx apps/web/src/i18n.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (веб). Ключі цієї задачі: `adminTabFeed`, `adminTabGroups`, `adminFeedLead`, `adminFeedPerson`, `adminFeedKind`, `adminFeedKindAll`, `adminFeedKind_game`, `adminFeedKind_achievement`, `adminFeedKind_level`, `adminFeedKind_prize`, `adminFeedKind_planned`, `adminFeedHidden`, `adminFeedHide`, `adminFeedShow`, `adminFeedEmpty`, `adminSearchGroups`, `adminGroupsEmpty`, `adminGroupMembers_one` (+ `_few`, `_many`), `adminGroupOwner`, `adminGroupNoOwner`, `adminGroupHidden`, `adminGroupHide`, `adminGroupHideReason`, `adminGroupHideConfirm`, `adminGroupRestore`, `adminGroupMembersTitle`, `adminGroupBanned`, `adminGroupRemove`, `adminGroupRemoveConfirm`, `adminGroupMakeOwner`, `adminGroupMakeOwnerConfirm`, `adminGroupItems`, `adminGroupItemsEmpty`, `adminGroupItemHide`, `adminGroupItemShow`, `adminGroupSurprise`, `adminGroupDelete`, `adminGroupDeleteLead`, `adminGroupDeleteType`, `adminGroupDeleteConfirm`, `adminGroupBack`, `err_group_name_mismatch`, `feedHiddenByModerator`, `groupHiddenByModerator`, `groupHiddenReason`, `adminLog_feed_hide`, `adminLog_feed_show`, `adminLog_group_hide`, `adminLog_group_restore`, `adminLog_group_member_remove`, `adminLog_group_owner_transfer`, `adminLog_group_delete`, `adminLog_group_item_hide`, `adminLog_group_item_show`.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src
git commit -m "feat(web): 63 feed and group moderation tabs — every feed event with hide and show, family group search and card with hide or restore with a reason, remove a member, make owner, delete by typing the name and hide records; the author sees «hidden by a moderator», the owner sees the reason; 7 languages"
```

---

### Задача 7. Веб: фільтри журналу й «Вивантажити CSV»

**Files:**
- Create: `apps/web/src/admin/log-csv.ts`, `apps/web/src/admin/log-csv.test.ts`, `apps/web/src/admin/AdminLog.test.tsx`.
- Modify: `apps/web/src/admin/AdminLog.tsx`, `apps/web/src/admin/admin-api.ts` (`adminLog(filter, page)`, `adminLogExport(filter)`), стилі (`.admin-filters`), `apps/web/src/i18n.ts`, шість JSON.
- Test: `apps/web/src/i18n.test.ts`.

**Interfaces:**
- Consumes: задачі 1, 5, 6; `logLine`, `KYIV_ZONE`, `AdminPager`.
- Produces: `logCsv(rows: AdminLogEntry[]): string`, `kyivStamp(iso: string): string`, `logFileName(now: Date): string`; ключі `ADDED_MODERATION_63` (частина 2).

- [ ] **Step 1: Write the failing tests:**
  - `log-csv.test.ts`:
    - `starts with a BOM, a header and semicolons`: `logCsv([])` починається з `'\uFEFF'`, перший рядок — п'ять заголовків через `;`, кінець — `\r\n`.
    - `Kyiv time and the kind code`: рядок з `at: '2026-11-20T21:30:00.000Z'` → перша колонка `2026-11-20 23:30:00`, третя — `group_hide`; `at: '2026-07-01T09:05:07.000Z'` → `2026-07-01 12:05:07`.
    - `quotes and formulas are safe`: ціль `Оля "Сонце"` → `"Оля ""Сонце"""`; текст з `;` і `\n` — у лапках; нік адміна `=1+1` → `'=1+1`; `-5` → `'-5`; звичайний нік — без лапок.
    - `logFileName(new Date('2026-11-20T22:30:00Z'))` → `admin-log-2026-11-21.csv`.
  - `AdminLog.test.tsx`:
    - `filters go to the request and reset the page`: на сторінці 2 позначити групу «Модерація» → запит `/api/admin/log?groups=moderation&page=1`; «Хто» = Ганна → `admin=<id>`; «Від»/«До» → `from=2026-11-01&to=2026-11-20`; текст «полісь» + «Шукати» → `q=полісь` (закодовано); фільтри видно в адресі (`MemoryRouter` з `initialEntries` `?groups=bot` → прапорець «Бот» уже позначено).
    - `the export downloads the selection`: «Вивантажити CSV» → `/api/admin/log/export?groups=moderation`; `URL.createObjectURL` отримує `Blob` типу `text/csv;charset=utf-8`; `total` 10 002 при 10 000 рядках → видно `adminLogCsvCapped` з «10 000»; помилка → `errorText`.
  - `i18n.test.ts` — нові ключі цієї задачі в `ADDED_MODERATION_63` і в перевірці `63 keys`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/admin/log-csv.test.ts apps/web/src/admin/AdminLog.test.tsx apps/web/src/i18n.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (веб: журнал, CSV). Ключі: `adminLogFilters`, `adminLogWho`, `adminLogWhoAll`, `adminLogWhat`, `adminLogGroup_moderation`, `adminLogGroup_players`, `adminLogGroup_games`, `adminLogGroup_bot`, `adminLogGroup_announcements`, `adminLogFrom`, `adminLogTo`, `adminLogSearch`, `adminLogClear`, `adminLogNothing`, `adminLogCsv`, `adminLogCsvCapped`, `adminLogCsvAt`, `adminLogCsvAdmin`, `adminLogCsvAction`, `adminLogCsvTarget`, `adminLogCsvDetails`.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src
git commit -m "feat(web): 63 admin log filters and CSV — who, kind groups, from and to, text search kept in the address; «Export CSV» downloads the selection up to 10 000 rows with a BOM, semicolons, Kyiv time and formula-safe cells; 7 languages"
```

---

### Задача 8. Наскрізний сценарій і кадри (`part63-moderation-log.e2e.ts`), повтор part 12k / 17 / 59

**Files:**
- Create: `apps/server/e2e/part63-moderation-log.e2e.ts`.
- Modify: стилі — лише якщо кадри покажуть бічний скрол чи злиті кнопки на 360 px.

**Interfaces:**
- Consumes: усе попереднє; `relisten`, `register`, `open`, `myId`, `bodyText`, `expectNoSideScroll`, `createGroup`, `follow`.

- [ ] **Step 1: Write the scenario** `it('part 63: moderation — the admin hides a friend's feed event (the friend no longer sees it, the author sees «hidden by a moderator»), hides a family group (members get 404, the owner sees the reason), removes a member, filters the log and exports CSV; a non-admin gets 404; phone 360 px, light theme', …, 600_000)` за зразком part 59 (`relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: 'admin63@example.com' }) })`, у `finally` — повернути сервер):
  1. Зареєструвати адміна, Олю, Петра, Тараса (360 × 740, світла тема); Оля й Петро — взаємні друзі; подія Олі в стрічці (рівень чи досягнення — прямою вставкою через `db`, як у part 17); Петро її бачить і вподобав.
  2. Адмін: `/admin/feed`, фільтр за Олею → «Сховати»; кадр `63-admin-feed`. Петро: `/feed` — події немає. Оля: `/feed` — «Приховано модератором», без кнопки лайка; кадр `63-feed-hidden-author`.
  3. Група «Поліські вечори» (Оля власниця, Петро й Тарас члени, один запис). Адмін: `/admin/groups` → пошук «полісь» → картка; «Вилучити» Тараса (підтвердити діалог); кадр `63-admin-group`; «Сховати групу» з причиною «Перевірка модератором». Петро: `/groups/<id>` — «Групу не знайдено…»; у `/groups` її немає. Оля: `/groups` — картка з позначкою й причиною, не посилання; кадр `63-group-hidden-owner`. Тарас: групи в списку немає (вилучено).
  4. Адмін: `/admin/log` — позначити «Модерація», «Від» = «До» = сьогодні (Київ) → три рядки (`group_hide`, `group_member_remove`, `feed_hide`), «Пошук» «полісь» → два; кадр `63-admin-log-filters`; «Вивантажити CSV» → `page.waitForEvent('download')`, вміст: перші байти `EF BB BF`, заголовок через `;`, два рядки даних, київський час формату `YYYY-MM-DD HH:MM:SS`, код `group_hide`.
  5. Петро: `GET /api/admin/feed`, `/api/admin/groups`, `/api/admin/log/export` → 404. Кожен кадр — `view(page, name)` (кадр + без бічного скролу); `isLight` — `true`.
- [ ] **Step 2: Run** `pnpm build && E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 63"`. Expected: спершу FAIL, якщо щось не зібрано, далі PASS; переглянути кадри в `apps/server/e2e/artifacts/shots/63-*`.
- [ ] **Step 3: Run** окремо, по черзі: `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 12k"`, потім `-t "part 17"`, потім `-t "part 59"`. Expected: PASS.
- [ ] **Step 4: Run** `pnpm test --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/e2e apps/web/src
git commit -m "test(e2e): part 63 — the admin hides a friend's feed event (gone for the friend, marked for the author), removes a member and hides a family group (404 for members, the reason for the owner), filters the log and exports a CSV with a BOM and Kyiv time; a non-admin gets 404; 360 px, light theme"
```

---

## Розбіжності зі специфікацією (рішення плану)

1. **Коментарів у стрічці немає** — модеруються лише події `feed_event`; картки «вподобав(-ла)» — не рядки стрічки й до вкладки не потрапляють (специфікація це передбачає: «якщо ні — лише події»).
2. **«Вподобайки не рахуються»** — і під подією, і в загальних лічильниках профілю (`likeTotals`): для події `game` ховаються лайки `player` за цю гру й цього гравця. Після «Показати» повертаються.
3. **Прихована група недоступна й власнику** (404 на сторінці, у лобі, в лізі, за запрошенням); причину він бачить лише в списку груп. Вийти, видалити чи передати її сам власник не може, доки адмін не поверне.
4. **Прихований запис зникає й для автора** — специфікація не уточнює; так простіше й без «напівприхованих» записів у вікторинах 12l.
5. **Додано «Показати запис»** (`group_item_show`) — симетрично подіям стрічки, щоб помилкове ховання можна було скасувати; специфікація називає лише «Сховати запис».
6. **Передати власника можна лише незаблокованому членові** (не боту): інакше `repair` одразу повертає власника назад.
7. **Фільтр «вид дії» — за групами видів** (модерація, гравці, ігри, бот, оголошення), не за окремими видами; група «система» з'явиться з планом 64. «Хто» — список адмінів, що вже мають записи в журналі.
8. **Період — київські дні, «до» включно.**
9. **CSV складає браузер**, а сервер віддає до 10 000 рядків JSON: так колонку «деталі» написано мовою адміна тим самим `logLine`, що й у журналі. Колонка «дія» — код виду (`group_hide`): стабільний для фільтрів у Excel. **Роздільник — `;`**, бо Excel з українськими (і польськими, німецькими) регіональними налаштуваннями ділить CSV саме так; клітинки з `=`, `+`, `-`, `@` на початку захищено від формул.
10. **Вивантаження й перегляд журналу не пишуться в журнал** — це читання самого журналу.
