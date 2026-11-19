# План 59: розсилка сповіщень з адмінки — вкладка «Розсилка», «Отримають N людей», історія з доставленими й помилками, ліміти, перемикач «Оголошення від адміністраторів» (44d)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** Розсилка не торкається рушія, кімнат, `GameState`, `SavedRoom` і зрізів. Якщо виконавцю здасться, що потрібне нове поле там, — **зупинитися й спитати контролера**.

> **Міграція — `0044_push_broadcast`** (наступний вільний номер: 56 бере `0042_bot_plan`, 58 — імовірно `0043_…`). Лише додавання: нова таблиця `push_broadcast` і нова колонка `profile.admin_push boolean DEFAULT true NOT NULL` (так само додано `hide_anti` у `0032` і `easy_mode` у `0035`). Жодного `DROP`/зміни наявних колонок. Якщо на момент збирання `0043` ще немає (58 без міграції) чи з'явилась `0044` іншого плану — узяти наступний вільний номер за `meta/_journal.json`.

> **Звірка з кодом.** План спирається на `main` 2026-11-19 (`1f78871e`, специфікація 44d) і на плани 56 (`docs/superpowers/plans/2026-11-19-plan-56-bot-schedule.md`), 57 і 58, які збираються раніше:
> - push, спільне: `packages/shared/src/push.ts` — `PUSH_KINDS = ['reminder', 'opened', 'cancelled']` (56 додає `'bot'`), `PushPayload`, `pushPayloadSchema` (`z.discriminatedUnion('kind', …)`);
> - push, сервер: `apps/server/src/push.ts` — `createPushService({ db, publicKey, send, now?, log? })` → `PushService { publicKey, deliver(userIds, payload): Promise<number> (кількість спроб), calendarNotify, remindDue, idle }`; усередині `deliver` — одне тіло на мову одержувача, `send` → 404/410 → `dropEndpoint`, інший не-2xx → `log`, виняток → `log`; `track(work)` тримає роботу для `idle()`; `PUSH_TTL` — запис на кожен `kind`; `push-store.ts` — `subscriptionsOf(db, userIds)` (`StoredSubscription { endpoint, userId, keys, locale }`), `saveSubscription`, `dropEndpoint`; `web-push-sender.ts` — єдиний імпорт `web-push`; `push-routes.ts` — `GET /api/push/key`, `POST/DELETE /api/me/push`;
> - збирання застосунку: `apps/server/src/app.ts` ~147 `registerAdminRoutes(app, { db, manager, adminEmails, currentUser, backupList, announcements, maxRooms })` **до** ~157 `const push = options.push === undefined ? null : createPushService(…)`; `shutdown()` ~248 `await push?.idle()`; `AppOptions.push?: { publicKey; send }`;
> - адмінка, сервер: `admin-routes.ts` — `AdminDeps`, `adminOf`, ворота `gate` (не-адміну **404**), `read`/`write` (`limited('admin-read' | 'admin-write', …)`), в кінці `registerAdminBotRoutes(app, deps, { read, write, adminOf })` ~331; `bans.ts` `logAction(tx, { adminId, kind, targetUserId: string | null, details, now })`; `group-store.ts` `lockPerson` — зразок `pg_advisory_xact_lock(hashtext(…))`; тест воріт — `admin-routes.test.ts` список `routes` ~91;
> - адресати й пошук людей (план 56): `apps/server/src/bot-plan-store.ts` `recipientsOf(db, plan)` (`all` — різні `push_subscription.user_id` з `notHidden`; `group` — `group_member.user_id` з `notHidden`, групи немає → `[]`; `people` — збережені id з `notHidden`), `botGroups(db): Promise<AdminBotGroup[]>`; `packages/shared/src/bot-schedule.ts` `botPlanRecipientsSchema`, `BOT_PLAN_PEOPLE_MAX = 50`; `admin.ts` `AdminBotPlanTo`, `AdminBotGroup`, `AdminBotPerson`; маршрут `GET /api/admin/bot/people?q=` (`admin-bot-schedule-routes.ts`, `searchProfiles(db, q, BOT_USER_ID)`); веб — `admin-api.ts` `searchBotPeople(q)`, форма з пошуком людей у `apps/web/src/admin/AdminBotSchedule.tsx`;
> - приховування: `feed-store.ts` `notHidden(column)` (бан і бот);
> - оголошення (53): `packages/shared/src/announcement.ts` `isAnnouncementUrl(url)` (https:// без пробілів або шлях з одним `/`), `ANNOUNCEMENT_URL_MAX = 500`, `isStorable`/`UNSTORABLE` з `text.ts`; веб — `admin/AdminAnnouncement.tsx` (зразок форми з `useAdminData`, `errorText`, підрахунком), `admin/Admin.tsx` `TABS` і `<Routes>`;
> - журнал: `packages/shared/src/admin.ts` `ADMIN_ACTION_KINDS`, `AdminLogDetails { reason?, title?, text?, content?, code? }` (56 додає `when?`); веб `admin/admin-text.ts` `logLine(entry)` (змінні `admin`, `target`, `title`, `text`, `code`);
> - налаштування профілю: зразок перемикача — «Легкий режим» (31): `profile.easyMode`, `profiles.ts` `profileEasy`/`saveEasy` ~320–331, `profile-routes.ts` `PUT /api/me/easy` (`easySchema`, ліміт 30/хв), `account-routes.ts` ~118 `GET /api/me` → `{ …, easyMode }`; веб — `api.ts` `Account.easyMode`, `me()`, `setEasy`; `useAccount.ts` ~32 (нормалізація, `sameAccount` ~90); `EasyModeSwitch.tsx`; сторінка `pages/profile/ProfileSettings.tsx` (`<PushSettings />` ~66);
> - сервіс-воркер: `apps/web/src/push/sw-handlers.ts` (`KINDS`, `isPushPayload`, `onPush`, `onNotificationClick(scope, url)` — вікно того ж origin → `focus` + `navigate`), `push-text.ts` `pushNotice(payload, zone, now)` (тег `event-{eventId}` рахується до `switch` — 56 це вже розводить для `bot`), `push-strings.ts`, `sw.ts` ~60;
> - тести push: `apps/server/src/push.test.ts` (заглушка `send` складає виклики, `status` за endpoint, `person(name)` + `saveSubscription`), e2e частини 20a `part17-21-likes-feed-calendar-push-admin.e2e.ts` ~1030–1045 (`webpush.generateVAPIDKeys()`, `outbox`, `gone` → 410, підписка — `POST /api/me/push` з `https://fcm.googleapis.com/fcm/send/e2e-<name>`); `helpers/setup.ts` `relisten(extra: Partial<AppOptions>)`;
> - база й тести: `testing/test-db.ts` `createTestDb()`; `db/schema.test.ts` — зразки тестів міграцій; генерація — `pnpm --filter @quiz/server exec drizzle-kit generate --name push_broadcast`;
> - i18n: `apps/web/src/i18n.ts`, `locales/{en,de,es,it,pl,ar}.json`, `i18n.test.ts` (умова `adds no uk keys beyond the agreed list` ~673, зразок списку `ADDED_BOT_54` ~214 і перевірки ~491; uk-множина — `_one`/`_few`/`_many`).
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

> **Точки злиття** (будувати від `main` після злиття 56, 57, 58; якщо котрийсь ще не злитий — додати так само й розв'язати конфлікт, залишивши обидва):
> - `packages/shared/src/push.ts`: `PUSH_KINDS`, `PushPayload`, `pushPayloadSchema` — 56 додає `bot`, ми — `broadcast`; `apps/server/src/push.ts` `PUSH_TTL` — 56 додає `bot`;
> - `packages/shared/src/admin.ts`: рядок `ADMIN_ACTION_KINDS` (56 — п'ять `bot_plan_*`, 57 — `quiz_view`, 58 — свої види картки гравця) і `AdminLogDetails` (56 — `when?`; ми — `count?`);
> - `apps/server/src/bot-plan-store.ts` (56): виносимо з `recipientsOf` функцію `recipientsFor` — тіло 56 не змінюється, тести 56 мають лишитися зеленими;
> - `apps/web/src/admin/AdminBotSchedule.tsx` (56): виносимо вибір людей у `PeoplePicker.tsx` (якщо 56 його ще не виніс);
> - `apps/server/src/app.ts`: 56 додає `botSchedule` поруч зі створенням `push` і в `shutdown()`; ми переносимо створення `push` вище `registerAdminRoutes` — рядок 56 `deliver: push?.deliver` іде слідом;
> - `apps/server/src/db/schema.ts`, `drizzle/meta/_journal.json`, `drizzle/meta/*_snapshot.json`: 56 — `bot_plan`, 58 — свої таблиці; міграцію генерувати **після** злиття попередників, щоб знімок містив їхні таблиці;
> - `apps/server/src/admin-routes.ts` (один рядок реєстрації в кінці), `admin-routes.test.ts` (`routes`), `apps/web/src/admin/Admin.tsx` (`TABS`, `<Routes>`), `apps/web/src/i18n.ts`, шість JSON, `i18n.test.ts` (нові списки й умова).

**Мета:** адмін у новій вкладці «Розсилка» пише заголовок (≤ 60), текст (≤ 160), необов'язкове посилання (https або шлях сайту) і обирає адресатів (усі з увімкненими сповіщеннями / родинна група / вибрані люди), бачить «Отримають N людей» і попередній перегляд, надсилає з підтвердженням; сервер шле web push лише тим, у кого є підписка й не вимкнено «Оголошення від адміністраторів», рахує доставлені й помилки, пише журнал і тримає ліміт 1 на 10 хв і 10 на добу; історія розсилок показує дату, хто, заголовок, адресатів і лічильники.

**Архітектура:** спільне — `packages/shared/src/broadcast.ts` (межі, схеми вводу й перегляду, типи адмінки) і push-вид `broadcast`. Сервер — колонка `profile.admin_push`, таблиця `push_broadcast`; `broadcast-store.ts` (аудиторія на основі `recipientsFor` з 56, створення з лімітами під advisory-lock, історія, підсумок доставки), `PushService` отримує `deliverCounted` і `background`; маршрути `admin-broadcast-routes.ts` за наявними воротами. Відправка йде у фоні після 201 (як `calendarNotify`): рядок спершу `sending`, потім `sent` з лічильниками. Веб — вкладка `AdminBroadcast.tsx`, перемикач `AdminPushSwitch.tsx` у налаштуваннях профілю, гілка `broadcast` у воркері (текст адміна без перекладу; зовнішнє посилання — у новому вікні).

**Технології:** TypeScript, zod 4, Fastify + `@fastify/rate-limit`, drizzle (Postgres) + drizzle-kit, web-push (у тестах підмінений), vitest (`shared`/`server`/`web`), React 19 + Testing Library, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-19-push-broadcast-design.md` (44d); адресати — `docs/superpowers/specs/2026-11-19-bot-schedule-design.md` (44a) і план 56; push — підпроєкт 20a; оголошення — план 53.

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22**; рушій, кімнати, зрізи — без змін.
- **Міграція одна — `0044_push_broadcast`**, лише додавання (нова таблиця, нова колонка з `DEFAULT true NOT NULL`); жодного `DROP` чи зміни наявного.
- **Лише адміністратори:** кожен новий `/api/admin/broadcasts*` — через `read`/`write` (ворота `gate`), не-адміну й гостю — та сама **404**, що й невідомий маршрут; кожен маршрут — у списку `routes` тесту воріт. Email у відповідях розсилки — жодного (тест шукає `@`).
- **Текст адміна не перекладається** — заголовок і текст ідуть у push як є, однаково всім мовам; інтерфейс (вкладка, перемикач, журнал, помилки) — 7 мов: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`; нові uk-ключі — у списках `ADDED_BROADCAST_59` і `ADDED_BROADCAST_59_PLURALS` у `i18n.test.ts` (в умову `adds no uk keys beyond the agreed list` і в перевірку наявності в шести локалях, як `ADDED_BOT_54`). Нових ключів у словниках сервіс-воркера (`push/strings`) немає. ru немає.
- Кириличні літерали в `apps/web/src/` — лише в словниках і тестах (`source-scan.test.ts`).
- **Push у тестах — лише підмінений** (`send`-заглушка); справжній `web-push` не викликається ні в юніт-, ні в e2e-тестах.
- **Інші види сповіщень не змінюються:** `admin_push = false` вимикає лише `broadcast`; календар (`reminder`/`opened`/`cancelled`) і бот (`bot`) приходять як раніше.
- **Нічого, пов'язаного з росією**, — у фікстурах, текстах розсилок, ніках, назвах груп, e2e.
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm exec tsc -p <пакет>` у задачах 1–4, з задачі 5 — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів vitest).
- Файли правити лише Edit/Write чи `sed`; **python3 на цій машині — порожня заглушка, ним нічого не правити й не генерувати**; після коміту — `git show --stat`.
- Робоче дерево — лише `C:\ClaudeCode\quiz\.superpowers\worktrees\plan59`; жодних файлів поза `C:\ClaudeCode\quiz` (тимчасові — у `.superpowers` чи scratchpad сесії). Інших дерев не торкатися.
- e2e: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 59"`; телефон 360 px, світла тема (`quiz:theme = light`, `is-light` на `<html>`); після — окремо `-t "part 20a"` і `-t "part 56"`.

## Рішення плану (там, де специфікація мовчить)

**Спільне (`packages/shared/src/broadcast.ts`, експорт з `index.ts`)**
- Константи: `BROADCAST_TITLE_MAX = 60`, `BROADCAST_TEXT_MAX = 160`, `BROADCAST_URL_MAX = ANNOUNCEMENT_URL_MAX` (500), `BROADCAST_GAP_MS = 10 * 60_000`, `BROADCAST_DAY_MAX = 10`, `BROADCAST_DAY_MS = 86_400_000` (ковзна доба, не календарна), `BROADCAST_HISTORY = 50`, `BROADCAST_STALE_MS = 15 * 60_000` (рядок `sending`, старший за це, показується «перерваним»), `BROADCAST_PEOPLE_MAX = BOT_PLAN_PEOPLE_MAX` (50).
- Схеми:
  ```ts
  export const broadcastRecipientsSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('all') }).strict(),
    z.object({ kind: z.literal('group'), groupId: z.string().uuid() }).strict(),
    z.object({ kind: z.literal('people'), userIds: z.array(z.string().min(1).max(64)).min(1).max(BROADCAST_PEOPLE_MAX) }).strict(), // без повторів — refine, як у 56
  ]);
  export type BroadcastRecipients = z.infer<typeof broadcastRecipientsSchema>; // має бути присвоюваним BotPlanRecipients (тест типів)
  export const broadcastPreviewSchema = z.object({ recipients: broadcastRecipientsSchema }).strict();
  export const broadcastInputSchema = z.object({
    title: z.string().trim().min(1).max(BROADCAST_TITLE_MAX).refine(isStorable, UNSTORABLE),
    text: z.string().trim().min(1).max(BROADCAST_TEXT_MAX).refine(isStorable, UNSTORABLE),
    url: /* як announcementInputSchema.url: trim, max BROADCAST_URL_MAX, nullable, default null, '' → null, isAnnouncementUrl */,
    recipients: broadcastRecipientsSchema,
  }).strict();
  ```
- Типи (у `broadcast.ts`): `BroadcastStatus = 'sending' | 'sent' | 'interrupted'`; `AdminBroadcastTo = Exclude<AdminBotPlanTo, { kind: 'none' }>`; `AdminBroadcast { id: string; at: string; admin: string | null /* нік */; title: string; text: string; url: string | null; to: AdminBroadcastTo; people: number; delivered: number; failed: number; status: BroadcastStatus }`; `AdminBroadcastLimits { nextAt: string | null /* раніше не можна */; lastDay: number; dayMax: number }`; `AdminBroadcasts { rows: AdminBroadcast[]; groups: AdminBotGroup[]; limits: AdminBroadcastLimits; pushOn: boolean }`; `BroadcastPreview { people: number }`.
- Push: `PushPayload` + `{ kind: 'broadcast'; broadcastId: string; title: string; text: string; url: string | null; locale?: Locale }`; `PUSH_KINDS` + `'broadcast'`; `pushPayloadSchema` + гілка.
- Журнал: `ADMIN_ACTION_KINDS` + `'push_broadcast'`; `AdminLogDetails.count?: number` (скільки людей отримають).

**База**
- `profile.admin_push boolean not null default true` (`adminPush` у drizzle) — «Оголошення від адміністраторів». Людина без рядка `profile` вважається «увімкнено» (`coalesce(…, true)`).
- `push_broadcast`: `id uuid pk default random`, `created_by text → user.id on delete set null`, `title text not null`, `text text not null`, `url text`, `recipients text not null` (`all|group|people`), `group_id uuid → family_group.id on delete set null`, `group_name text` (знімок назви: групу можуть видалити), `people jsonb string[] not null default '[]'` (вибрані id для `people`), `people_count integer not null`, `delivered integer not null default 0`, `failed integer not null default 0`, `status text not null default 'sending'`, `created_at timestamptz not null`, `finished_at timestamptz`. Індекс `push_broadcast_created_idx (created_at)`.

**Адресати (`apps/server/src/bot-plan-store.ts`, 56)**
- Виносимо `export async function recipientsFor(db: Db, to: BotPlanRecipients): Promise<string[]>` — рівно тіло 56; `recipientsOf(db, plan)` будує `to` з рядка й кличе `recipientsFor`. Якщо 56 уже має функцію, що приймає `BotPlanRecipients`, — узяти її під її назвою, нової не робити.

**Сховище розсилок (`apps/server/src/broadcast-store.ts`)**
- `audienceOf(db, to: BroadcastRecipients): Promise<string[]>` — `recipientsFor(db, to)`, далі одним запитом лишити тих, у кого є хоч один `push_subscription`, `coalesce(profile.admin_push, true)` і `notHidden(user_id)`; без повторів, у порядку id. Для `group` неіснуючої групи — `[]`; для `people` невідомі id просто відпадають.
- `broadcastLimits(db, now): Promise<AdminBroadcastLimits>` — `lastDay` = рядки з `created_at > now − BROADCAST_DAY_MS`; `nextAt` = max(`останній created_at + BROADCAST_GAP_MS`, якщо `lastDay >= 10` — `найстаріший у вікні + BROADCAST_DAY_MS`), або `null`, якщо вже можна.
- `createBroadcast(db, { adminId, input: BroadcastInput, people: string[], now }): Promise<{ ok: true; row: AdminBroadcast } | { ok: false; error: 'broadcast_too_soon' | 'broadcast_day_limit'; nextAt: string }>` — у транзакції: `pg_advisory_xact_lock(hashtext('push_broadcast'))`, ліміти за `broadcastLimits(tx, now)` (спершу 10 хв → `broadcast_too_soon`, далі доба → `broadcast_day_limit`), вставка рядка (`status: 'sending'`, `people_count = people.length`, `group_name` — поточна назва групи), `logAction(tx, { adminId, kind: 'push_broadcast', targetUserId: null, details: { title, count: people.length }, now })`. Ліміти **спільні для всіх адмінів**; спроба «нікому» рядка не створює й ліміту не з'їдає.
- `finishBroadcast(db, id, { delivered, failed }, now): Promise<void>` — `status = 'sent'`, лічильники, `finished_at`.
- `listBroadcasts(db, now): Promise<AdminBroadcast[]>` — останні `BROADCAST_HISTORY` за `created_at desc`; нік адміна з `profile` (видалений — `null`); `to` для `group` — `{ groupId, name: group_name }` (`group_id` став `null` — `name` зі знімка, `groupId: ''`), для `people` — `{ people: [{ id, nickname }] }` за поточними ніками (людину видалено — відпадає); `sending` старший за `BROADCAST_STALE_MS` → `interrupted`.

**Push-служба (`apps/server/src/push.ts`)**
- `deliverCounted(userIds, payload): Promise<{ sent: number; delivered: number; failed: number }>` — те саме, що тепер робить `deliver` (тіла за мовою, 404/410 → `dropEndpoint`), але рахує: 2xx → `delivered`, усе інше (404/410, інший статус, виняток, статус 0) → `failed`; `sent` = кількість підписок. `deliver` = `(await deliverCounted(...)).sent` — підпис і поведінка `deliver` не змінюються.
- `background(work: Promise<unknown>): void` — наявний `track` назовні (для `idle()` і `shutdown`).
- `PUSH_TTL.broadcast = 86_400`, терміновість `normal`.
- Лічильники — **у пристроях (підписках)**, не в людях: одна людина з двома пристроями дає два доставлені.

**Маршрути (`apps/server/src/admin-broadcast-routes.ts`, `registerAdminBroadcastRoutes(app, deps, guards)` — останній рядок `registerAdminRoutes`)**
- `AdminDeps.push: PushService | null` (новий); `app.ts` створює `push` **до** `registerAdminRoutes` і передає.
- `GET /api/admin/broadcasts` (`read`) → `AdminBroadcasts` (`rows: listBroadcasts`, `groups: botGroups(db)`, `limits: broadcastLimits`, `pushOn: deps.push !== null`).
- `POST /api/admin/broadcasts/preview` (`read`, `broadcastPreviewSchema`) → 200 `{ people: (await audienceOf(...)).length }`; схема — 400 `invalid_payload`.
- `POST /api/admin/broadcasts` (`write`, `broadcastInputSchema`) → по черзі: схема — 400; `deps.push === null` → 503 `push_off`; `audienceOf` порожня → 409 `broadcast_nobody`; `createBroadcast` → 409 `{ error, nextAt }`; успіх → 201 `AdminBroadcast` (`status: 'sending'`), далі `push.background(deliverCounted(people, { kind: 'broadcast', broadcastId, title, text, url }).then((c) => finishBroadcast(db, id, c, now())))`; збій фону — `reportError(…, { where: 'push-broadcast' })` і рядок лишається `sending` (згодом — `interrupted`).
- Пошук людей — наявний `GET /api/admin/bot/people?q=` (56): нового маршруту немає.
- Не-адміну й гостю — 404 від воріт до розбору тіла.

**Налаштування профілю (сервер)**
- `profiles.ts`: `profileAdminPush(db, userId): Promise<boolean>` (немає рядка → `true`), `saveAdminPush(db, userId, on): Promise<boolean | null>` (як `saveEasy`).
- `profile-routes.ts`: `PUT /api/me/admin-push` `{ on: boolean }` (strict, ліміт 30/хв) → `{ adminPush }`; гість — 401; схема — 400.
- `account-routes.ts` `GET /api/me` → + `adminPush`.

**Веб**
- `apps/web/src/admin/AdminBroadcast.tsx` — вкладка `/admin/broadcast` («Розсилка», після «Оголошення» в `TABS`). Без push на сервері (`pushOn: false`) — лише підказка `adminBroadcastPushOff` і історія.
- Форма: «Заголовок» (`maxLength` 60, лічильник `{used} з {max}`), «Текст» (`textarea`, 160, лічильник), «Посилання (необов'язково)» з підказкою й помилкою `isAnnouncementUrl`; радіо «Кому»: «Усім, хто ввімкнув сповіщення» / «Родинній групі» (`select` з `groups`; груп немає — пункт вимкнено) / «Вибраним людям» (`PeoplePicker`). На кожну зміну адресатів (затримка 300 мс) — `previewBroadcast(recipients)` → «Отримають N людей» (`adminBroadcastPeople_*`), 0 → `adminBroadcastNobody` і «Надіслати» вимкнено.
- Попередній перегляд — картка `.broadcast-preview` (значок сайту, заголовок, текст, посилання як підпис), оновлюється під час набору.
- «Надіслати» → `window.confirm(t('adminBroadcastConfirm', { title, people }))` → `sendBroadcast(input)`; успіх — `adminBroadcastSent`, форма очищується, дані перезавантажуються (і ще раз за 3 с, щоб підтягти лічильники); 409 з `nextAt` — `errorText(error)` + `adminBroadcastNextAt` з часом (`timeText(nextAt, viewerZone())`). Над формою — `adminBroadcastLastDay` «За добу: {count} з {max}» і, якщо `nextAt !== null`, «Наступну розсилку можна о {time}» (кнопка вимкнена).
- Історія: картка — `{день}, {час}` (`formatDay` + `timeText`), нік адміна, заголовок, текст, адресати (`adminBroadcastShownAll` / `Group` / `GroupGone` / `People`), «Отримають: N», «Доставлено: D, помилок: F» або «Надсилається…» / «Перервано».
- `apps/web/src/admin/PeoplePicker.tsx` — винесений з `AdminBotSchedule.tsx` (56) вибір людей: `{ value: AdminBotPerson[]; onChange(next): void; max: number }`; 56 переходить на нього без зміни поведінки (його тести — зелені).
- `admin-api.ts`: `adminBroadcasts(): Promise<ApiData<AdminBroadcasts>>`, `previewBroadcast(recipients: BroadcastRecipients): Promise<ApiData<BroadcastPreview>>`, `sendBroadcast(input: BroadcastInput): Promise<ApiResult<AdminBroadcast>>` (помилка 409 віддає й `nextAt`).
- `admin-text.ts` `logLine` — нова змінна `count: String(entry.details.count ?? '')`.
- Профіль: `apps/web/src/push/AdminPushSwitch.tsx` — прапорець «Оголошення від адміністраторів» з підказкою, у `ProfileSettings.tsx` одразу після `<PushSettings />` окремою секцією `profile-section settings-row` (видно завжди, навіть коли сповіщення на пристрої вимкнені: це налаштування акаунта). Значення — `account.adminPush` з `useAccount` (`/api/me`; немає поля → `true`); зміна — оптимістично, `setAdminPush(on)`, збій — повернути попереднє і `adminPushSaveFailed`.
- `api.ts`: `Account.adminPush: boolean`, `me()` — `adminPush?: unknown`, `setAdminPush(on): Promise<ApiData<{ adminPush: boolean }>>`; `useAccount.ts` — `adminPush: result.adminPush !== false`, поле в порівнянні акаунтів.
- Сервіс-воркер: `sw-handlers.ts` `KINDS` + `'broadcast'`, `isPushPayload` для `broadcast` — `broadcastId`, `title`, `text` — рядки, `url` — рядок чи `null` (`eventId` не вимагається); `push-text.ts` `pushNotice` для `broadcast` → `{ title: payload.title, body: payload.text, url: payload.url ?? '/', tag: 'broadcast-{broadcastId}' }` (без словника); `onNotificationClick` — абсолютна адреса іншого origin → `openWindow(url)` (вікна сайту не підмінюємо), свій origin чи шлях — як зараз.
- Стилі: `.admin-broadcast`, `.broadcast-preview` — 360 px без бічного скролу, лише змінні теми.

## Порядок збирання

- 1 → 2 → 3 → 4 → 5 → 6. Залежності: 2 ← 1; 3 ← 2; 4 ← 1; 5 ← 3, 4; 6 — остання.
- `tsc -p apps/web` може падати на `adminLog_push_broadcast` до задачі 5 — очікувано; `pnpm typecheck` обов'язково зелений з задачі 5.

## Фокус рев'ю

1. **Хто отримує.** Група — лише її учасники з підпискою; той, хто вимкнув «Оголошення від адміністраторів», — ні, але календарні й ботові пуші отримує; забанений і бот — ні; людина без підписки не рахується в N. Задачі 2, 3, 6.
2. **Ліміт під гонкою.** Дві розсилки паралельно (`Promise.all`) — одна 201, друга 409 `broadcast_too_soon`; 11-та за добу — 409 `broadcast_day_limit` з `nextAt`; відмова не пише журнал і не створює рядка; «нікому» ліміту не з'їдає. Задача 3.
3. **Лічильники чесні.** 201 + 410 + мережевий збій → `delivered: 1, failed: 2`, мертву підписку прибрано; `deliver` для календаря повертає те саме, що раніше. Задачі 2, 3.
4. **Посилання.** `javascript:`, `http://`, `//evil.example`, `/\evil` — 400; `https://…` відкривається в новому вікні, `/library` — у вкладці сайту; без посилання — `/`. Задачі 1, 4.
5. **Ворота й межі.** Кожен `/api/admin/broadcasts*` — 404 не-адміну й гостю; заголовок 61 символ / текст 161 — 400; у JSON немає `@`; сервер без push — 503 `push_off`, вкладка каже про це. Задачі 3, 5, 6.

---

### Задача 1. Спільне: межі й схеми розсилки, push-вид `broadcast`, вид журналу

**Files:**
- Create: `packages/shared/src/broadcast.ts`, `packages/shared/src/broadcast.test.ts`.
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/push.ts`, `packages/shared/src/admin.ts`.
- Test: `packages/shared/src/push.test.ts`, `packages/shared/src/admin.test.ts`.

**Interfaces:**
- Consumes: `isAnnouncementUrl`, `ANNOUNCEMENT_URL_MAX`, `isStorable`/`UNSTORABLE`, `BOT_PLAN_PEOPLE_MAX`, `AdminBotPlanTo`, `AdminBotGroup`, `BotPlanRecipients` (56).
- Produces: константи `BROADCAST_*`; `broadcastRecipientsSchema`, `broadcastPreviewSchema`, `broadcastInputSchema`; типи `BroadcastRecipients`, `BroadcastInput = z.infer<typeof broadcastInputSchema>`, `BroadcastStatus`, `AdminBroadcastTo`, `AdminBroadcast`, `AdminBroadcastLimits`, `AdminBroadcasts`, `BroadcastPreview`; push-вид `broadcast`; `'push_broadcast'`; `AdminLogDetails.count?`.

- [ ] **Step 1: Write the failing tests:**
  - `broadcast.test.ts` `a broadcast: a title up to 60, a text up to 160, an optional https or site link, recipients`: приймає `{ title: 'Нова вікторина', text: 'У бібліотеці з\'явилась «Карпатські озера».', url: null, recipients: { kind: 'all' } }`, з `url: 'https://example.com/a'`, `'/library'`, `''` (→ `null`), `group` з uuid, `people` з `['a1', 'b2']`; заголовок з пробілами обрізається; відкидає заголовок `'а'.repeat(61)`, текст `'а'.repeat(161)`, порожній заголовок, `url: 'http://example.com'`, `'javascript:alert(1)'`, `'//evil.example'`, `'/\\evil'`, `recipients: { kind: 'none' }`, `people` з `[]`, з 51 id, з повтором `['a1', 'a1']`, зайве поле.
  - `the preview takes recipients only`: `broadcastPreviewSchema` приймає `{ recipients: { kind: 'all' } }`, відкидає `{ recipients: { kind: 'all' }, title: 'x' }`.
  - `broadcast recipients fit bot plan recipients`: `const to: BotPlanRecipients = {} as BroadcastRecipients;` (перевірка типів, `expectTypeOf`).
  - `push.test.ts`: `pushPayloadSchema` приймає `{ kind: 'broadcast', broadcastId: 'B', title: 'Т', text: 'Х', url: null }` і з `url: '/library'`, відкидає без `text`; `PUSH_KINDS` містить `broadcast`.
  - `admin.test.ts`: `ADMIN_ACTION_KINDS` містить `push_broadcast`.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/broadcast.test.ts packages/shared/src/push.test.ts packages/shared/src/admin.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (спільне). Схему `url` не копіювати вручну, а винести з `announcement.ts` спільний `optionalSiteUrl(max)` і взяти в обох (поведінка оголошення не змінюється — його тести зелені).
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 && pnpm exec tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 59 push broadcast — a title up to 60, a text up to 160, an optional https or site link and recipients (everyone, a family group or up to 50 people), the broadcast push kind, the push_broadcast log kind with a count, 1 per 10 min and 10 per day"
```

---

### Задача 2. Сервер: міграція `0044_push_broadcast`, перемикач у профілі, аудиторія, підрахунок доставки

**Files:**
- Create: `apps/server/drizzle/0044_push_broadcast.sql` (+ знімок і рядок журналу від drizzle-kit), `apps/server/src/broadcast-store.ts` (поки — `audienceOf`), `apps/server/src/broadcast-store.test.ts`.
- Modify: `apps/server/src/db/schema.ts` (`profile.adminPush`, `pushBroadcast`), `apps/server/src/bot-plan-store.ts` (`recipientsFor`), `apps/server/src/push.ts` (`deliverCounted`, `background`, `PUSH_TTL.broadcast`), `apps/server/src/profiles.ts`, `apps/server/src/profile-routes.ts`, `apps/server/src/account-routes.ts`.
- Test: `apps/server/src/db/schema.test.ts`, `apps/server/src/push.test.ts`, `apps/server/src/profile-routes.test.ts`, `apps/server/src/account-routes.test.ts` (чи де перевіряється `GET /api/me`).

**Interfaces:**
- Consumes: задача 1; `recipientsOf`, `notHidden`, `subscriptionsOf`.
- Produces: `pushBroadcast` (drizzle), `profile.adminPush`; `recipientsFor(db, to: BotPlanRecipients): Promise<string[]>`; `audienceOf(db, to: BroadcastRecipients): Promise<string[]>`; `PushService.deliverCounted(userIds, payload): Promise<{ sent: number; delivered: number; failed: number }>`, `PushService.background(work: Promise<unknown>): void`; `profileAdminPush`, `saveAdminPush`; `PUT /api/me/admin-push`; `GET /api/me` → `adminPush`.

- [ ] **Step 1: Write the failing tests:**
  - `schema.test.ts` `describe('push broadcast (59)')`: `createTestDbUpTo` до попередньої міграції, вставити профіль, `migrateRest` → у наявного профілю `admin_push = true`; таблиця `push_broadcast` приймає рядок з типовими `delivered = 0`, `failed = 0`, `status = 'sending'`, `people = []`; видалення групи ставить `group_id = null`, видалення автора — `created_by = null`.
  - `broadcast-store.test.ts` `audienceOf: only people with a subscription and admin announcements on, never the banned or the bot`: Оля, Петро (підписки), Тарас (без підписки), Ганна (підписка, `admin_push = false`), Мирон (підписка, бан) → `all` → `[Оля, Петро]` (у порядку id); `group` з Олею, Тарасом, Ганною → `[Оля]`; неіснуюча група → `[]`; `people` `[Петро, Ганна, 'нема']` → `[Петро]`; людина з підпискою без рядка `profile` → є в `all`.
  - `bot-plan-store.test.ts` (56) — без змін, мають лишитися зеленими (перевірка винесення `recipientsFor`).
  - `push.test.ts` `deliverCounted counts delivered and failed per device and drops the dead`: три підписки — 201, 410, виняток у `send` → `{ sent: 3, delivered: 1, failed: 2 }`, підписки з 410 у базі немає; `deliver` на тих самих даних → `3` (як раніше). `a broadcast push goes in the recipient's language with a day TTL`: `options` — `{ ttl: 86_400, urgency: 'normal' }`, тіло — `{ kind: 'broadcast', …, locale: 'pl' }` для людини з `locale: 'pl'`, текст і заголовок — без змін. `background work is awaited by idle`: `background(Promise, що завершується за 20 мс)` → після `await idle()` вона завершилась.
  - `profile-routes.test.ts` `admin announcements are on by default and can be switched off`: `GET /api/me` → `adminPush: true`; `PUT /api/me/admin-push { on: false }` → `{ adminPush: false }`, `GET /api/me` → `false`; `{ on: 'no' }` → 400; гість → 401.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/db/schema.test.ts apps/server/src/broadcast-store.test.ts apps/server/src/push.test.ts apps/server/src/profile-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** схему й таблицю за «Рішеннями плану» (база); `pnpm --filter @quiz/server exec drizzle-kit generate --name push_broadcast` → перевірити, що SQL — лише `CREATE TABLE`, `ALTER TABLE "profile" ADD COLUMN "admin_push" boolean DEFAULT true NOT NULL`, зовнішні ключі й індекс; файл названо `0044_push_broadcast.sql`. Далі `recipientsFor`, `audienceOf`, `deliverCounted`/`background`, перемикач — за «Рішеннями плану».
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/db/schema.test.ts apps/server/src/broadcast-store.test.ts apps/server/src/bot-plan-store.test.ts apps/server/src/bot-schedule.test.ts apps/server/src/push.test.ts apps/server/src/push-routes.test.ts apps/server/src/profile-routes.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/drizzle apps/server/src
git commit -m "feat(server): 59 push broadcast base — migration 0044 adds the push_broadcast table and profile.admin_push on by default; the audience is everyone with a subscription, a family group or chosen people without those who switched admin announcements off, the banned or the bot; push delivery counts delivered and failed per device"
```

---

### Задача 3. Сервер: розсилка з лімітами, історія, журнал і маршрути адмінки

**Files:**
- Create: `apps/server/src/admin-broadcast-routes.ts`, `apps/server/src/admin-broadcast-routes.test.ts`.
- Modify: `apps/server/src/broadcast-store.ts` (`broadcastLimits`, `createBroadcast`, `finishBroadcast`, `listBroadcasts`), `apps/server/src/admin-routes.ts` (`AdminDeps.push`, реєстрація), `apps/server/src/app.ts` (створення `push` до `registerAdminRoutes`).
- Test: `apps/server/src/broadcast-store.test.ts`, `apps/server/src/admin-routes.test.ts`.

**Interfaces:**
- Consumes: задачі 1–2; `botGroups` (56), `logAction`, `reportError`.
- Produces: `GET /api/admin/broadcasts` → `AdminBroadcasts`; `POST /api/admin/broadcasts/preview` → `BroadcastPreview` / 400; `POST /api/admin/broadcasts` → 201 `AdminBroadcast` / 400 / 409 `{ error: 'broadcast_nobody' }` / 409 `{ error: 'broadcast_too_soon' | 'broadcast_day_limit'; nextAt }` / 503 `push_off`.

- [ ] **Step 1: Write the failing tests:**
  - `broadcast-store.test.ts`:
    - `one broadcast per 10 minutes and 10 per day, shared by all admins`: `createBroadcast` о T → ok; другий адмін о T + 9 хв → `broadcast_too_soon`, `nextAt` = T + 10 хв; о T + 10 хв → ok; ще вісім з кроком 10 хв → ok (усього 10); 11-та о T + 100 хв → `broadcast_day_limit`, `nextAt` = T + 24 год; о T + 24 год + 1 мс → ok; відмови не додали ні рядків `push_broadcast`, ні `admin_action`.
    - `two broadcasts at once: one passes`: `Promise.all` двох `createBroadcast` на ту саму мить → рівно одна ok.
    - `a broadcast logs its title and count`: рядок журналу `push_broadcast` з `details: { title: 'Нова вікторина', count: 2 }`, `targetUserId: null`.
    - `history: newest first, admin nickname, group from the snapshot, sending turns interrupted`: дві розсилки → новіша перша; група видалена → `to: { kind: 'group', name: 'Малинські' }`; `sending` старша за 15 хв → `interrupted`; `finishBroadcast` → `sent` з лічильниками.
  - `admin-broadcast-routes.test.ts` (`buildApp` з адміном і заглушкою `push: { publicKey, send }`, як `push.test.ts`):
    - `the preview counts who will get it`: група з Олею (підписка), Тарасом (без), Ганною (вимкнула) → `{ people: 1 }`; `recipients: { kind: 'none' }` → 400.
    - `send reaches only the audience and records delivered and failed`: `POST /api/admin/broadcasts` (`group`) → 201 `status: 'sending'`, `people: 1`; після `ctx.push.idle()` заглушка отримала один виклик на пристрій Олі з `{ kind: 'broadcast', title, text, url: '/library' }`; `GET /api/admin/broadcasts` → рядок `sent`, `delivered: 1`, `failed: 0`; ендпоінт з 410 → `failed: 1` і підписку прибрано.
    - `nobody to send to is a clear error and no row`: усі адресати без підписок → 409 `broadcast_nobody`, рядків немає, ліміт не зачеплено.
    - `the limit answers with the next time`: друга розсилка одразу → 409 `{ error: 'broadcast_too_soon', nextAt }`; `GET` → `limits.nextAt` той самий, `lastDay: 1`, `dayMax: 10`.
    - `a title of 61 or a text of 161 is 400`; `no push on the server is 503 push_off and pushOn false` (`buildApp` без `push`).
    - `no email anywhere`: тіла `GET` і `POST` не містять `@`.
  - `admin-routes.test.ts`: у `routes` — `['GET', '/api/admin/broadcasts']`, `['POST', '/api/admin/broadcasts/preview']`, `['POST', '/api/admin/broadcasts']`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/broadcast-store.test.ts apps/server/src/admin-broadcast-routes.test.ts apps/server/src/admin-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (сховище розсилок, маршрути). У `app.ts` перенести рядок `const push = …` вище `registerAdminRoutes` (без інших змін порядку; рядок 56 з `botSchedule` іде за ним) і передати `push` в `AdminDeps`.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/broadcast-store.test.ts apps/server/src/admin-broadcast-routes.test.ts apps/server/src/admin-routes.test.ts apps/server/src/admin-bot-routes.test.ts apps/server/src/push.test.ts apps/server/src/app.test.ts apps/server/src/restart.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 59 admin push broadcast routes — the admin previews how many people will get it, sends a broadcast in the background with delivered and failed counts, sees the history with the admin, recipients and counts; 1 per 10 min and 10 per day across all admins, a log line per broadcast, 404 to everyone else"
```

---

### Задача 4. Веб: сповіщення `broadcast` у сервіс-воркері

**Files:**
- Modify: `apps/web/src/push/sw-handlers.ts`, `apps/web/src/push/push-text.ts`.
- Test: `apps/web/src/push/sw-handlers.test.ts`, `apps/web/src/push/push-text.test.ts`.

**Interfaces:**
- Consumes: push-вид `broadcast` (задача 1).
- Produces: `isPushPayload` приймає `broadcast`; `pushNotice` для `broadcast`; `onNotificationClick` відкриває чужий origin у новому вікні.

- [ ] **Step 1: Write the failing tests:**
  - `push-text.test.ts` `a broadcast shows the admin's words as they are`: `{ kind: 'broadcast', broadcastId: 'B', title: 'Нова вікторина', text: 'Заходь у бібліотеку', url: '/library', locale: 'en' }` → `{ title: 'Нова вікторина', body: 'Заходь у бібліотеку', url: '/library', tag: 'broadcast-B' }`; `url: null` → `url: '/'`.
  - `sw-handlers.test.ts`: `isPushPayload` — `broadcast` з `url: null` і з рядком → `true`; без `text`, з `url: 5` → `false`; `onPush` з `broadcast` показує сповіщення з тегом `broadcast-B`. `onNotificationClick` `opens another site in a new window and leaves ours alone`: вікно `https://quiz.test/feed`, url `https://example.com/news` → `openWindow('https://example.com/news')`, `navigate` не кликали; url `https://quiz.test/library` → `focus` + `navigate` (як зараз).
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/push`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (сервіс-воркер). Тег у `pushNotice` для `broadcast` — у своїй гілці, не з `eventId`.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/push`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/push
git commit -m "feat(web): 59 broadcast notifications — the worker shows the admin's title and text as written with one tag per broadcast, opens the site path or the https link, another site in a new window"
```

---

### Задача 5. Веб: вкладка «Розсилка», перемикач у профілі, журнал, 7 мов

**Files:**
- Create: `apps/web/src/admin/AdminBroadcast.tsx`, `apps/web/src/admin/AdminBroadcast.test.tsx`, `apps/web/src/admin/PeoplePicker.tsx`, `apps/web/src/push/AdminPushSwitch.tsx`, `apps/web/src/push/AdminPushSwitch.test.tsx`.
- Modify: `apps/web/src/admin/Admin.tsx`, `apps/web/src/admin/admin-api.ts`, `apps/web/src/admin/admin-text.ts`, `apps/web/src/admin/AdminBotSchedule.tsx` (перехід на `PeoplePicker`), `apps/web/src/api.ts`, `apps/web/src/useAccount.ts`, `apps/web/src/pages/profile/ProfileSettings.tsx`, стилі адмінки (файл, де `.admin-bot`), `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,de,es,it,pl,ar}.json`, `apps/web/src/i18n.test.ts`.
- Test: `apps/web/src/admin/Admin.test.tsx`, `apps/web/src/admin/admin-text.test.ts`, `apps/web/src/admin/AdminBotSchedule.test.tsx` (56, без змін — зелений).

**Ключі (uk):**
- Вкладка: `adminTabBroadcast` «Розсилка», `adminBroadcastLead` «Сповіщення прийде на телефони й комп'ютери тих, хто ввімкнув сповіщення. Текст іде як є, без перекладу.», `adminBroadcastPushOff` «Сповіщення на сервері не налаштовано — розсилка недоступна.», `adminBroadcastTitleLabel` «Заголовок», `adminBroadcastTextLabel` «Текст», `adminBroadcastChars` «{used} з {max}», `adminBroadcastUrlLabel` «Посилання (необов'язково)», `adminBroadcastUrlHint` «https://… або шлях сайту, наприклад /library», `adminBroadcastUrlBad` «Посилання має починатися з https:// або з /».
- Адресати: `adminBroadcastTo` «Кому», `adminBroadcastToAll` «Усім, хто ввімкнув сповіщення», `adminBroadcastToGroup` «Родинній групі», `adminBroadcastToPeople` «Вибраним людям», `adminBroadcastNoGroups` «Родинних груп ще немає», `adminBroadcastPeople_one` «Отримають {count} людина», `_few` «Отримають {count} людини», `_many` «Отримають {count} людей», `adminBroadcastNobody` «Нікому надсилати: ніхто з адресатів не ввімкнув сповіщень.».
- Перегляд і відправка: `adminBroadcastPreview` «Так виглядатиме сповіщення», `adminBroadcastSend` «Надіслати», `adminBroadcastConfirm` «Надіслати «{title}»? {people}.», `adminBroadcastSent` «Розсилку надіслано.», `adminBroadcastLastDay` «За добу: {count} з {max}», `adminBroadcastNextAt` «Наступну розсилку можна о {time}.».
- Історія: `adminBroadcastHistory` «Історія розсилок», `adminBroadcastHistoryEmpty` «Розсилок ще не було.», `adminBroadcastShownAll` «Усім», `adminBroadcastShownGroup` «Група «{name}»», `adminBroadcastGroupGone` «Групу видалено», `adminBroadcastShownPeople` «Вибрані: {names}», `adminBroadcastCounts` «Доставлено: {delivered}, помилок: {failed}», `adminBroadcastSending` «Надсилається…», `adminBroadcastInterrupted` «Перервано: сервер перезапускався».
- Помилки й журнал: `err_broadcast_too_soon` «Не частіше однієї розсилки на 10 хвилин.», `err_broadcast_day_limit` «Не більше 10 розсилок за добу.», `err_broadcast_nobody` «Нікому надсилати: ніхто з адресатів не ввімкнув сповіщень.», `err_push_off` «Сповіщення на сервері не налаштовано.», `adminLog_push_broadcast` «{admin} надіслав(-ла) розсилку «{title}», адресатів: {count}».
- Профіль: `adminPushLabel` «Оголошення від адміністраторів», `adminPushHint` «Рідкісні сповіщення від адміністраторів сайту: новини й важливі зміни. Інших сповіщень цей перемикач не зачіпає.», `adminPushSaveFailed` «Не вдалося зберегти. Спробуй ще раз.».
- Шість локалей — природні переклади з тими самими змінними; `ar` — праворуч наліво, як решта.

**Interfaces:**
- Consumes: задачі 1, 3; `searchBotPeople`, `AdminBotPerson` (56); `useAdminData`, `errorText`, `formatDay`, `timeText`, `viewerZone`.
- Produces: `AdminBroadcast` (компонент), `PeoplePicker`, `AdminPushSwitch`; `adminBroadcasts`, `previewBroadcast`, `sendBroadcast`, `setAdminPush`; `Account.adminPush`.

- [ ] **Step 1: Write the failing tests:**
  - `AdminBroadcast.test.tsx` (`fetch` підмінений, як `AdminAnnouncement.test.tsx`):
    - `shows who will get it and sends to a group after a confirm`: ввести «Нова вікторина», «Заходь у бібліотеку», «/library»; «Родинній групі» → «Малинські» → `POST /api/admin/broadcasts/preview` з `{ recipients: { kind: 'group', groupId } }` → «Отримають 3 людини»; перегляд показує заголовок і текст; «Надіслати» → `confirm` з «Надіслати «Нова вікторина»? Отримають 3 людини.» → `POST /api/admin/broadcasts` з `{ title, text, url: '/library', recipients }` → «Розсилку надіслано.».
    - `nobody disables the send`: перегляд `{ people: 0 }` → «Нікому надсилати…», кнопка `disabled`.
    - `a bad link and too long fields block the send`: `http://x` → «Посилання має починатися з https:// або з /»; лічильник «60 з 60» і поле не бере 61-й символ.
    - `the limit shows the next time`: 409 `{ error: 'broadcast_too_soon', nextAt }` → «Не частіше однієї розсилки на 10 хвилин.» і «Наступну розсилку можна о HH:MM.» (`role="alert"`).
    - `history rows: counts, sending, interrupted, a deleted group`: рядки з `sent` → «Доставлено: 5, помилок: 1»; `sending` → «Надсилається…»; `interrupted` → «Перервано…»; група з `groupId: ''` → «Група «Малинські»».
    - `chooses people by nickname`: «Вибраним людям», «Ол» → `GET /api/admin/bot/people?q=…` → вибрати «Оля» → перегляд з `{ kind: 'people', userIds: [<Оля>] }`.
    - `push off on the server shows the hint and no form`.
  - `AdminPushSwitch.test.tsx` `on by default, switching off saves, a failure rolls back`: акаунт без `adminPush` → прапорець увімкнено; клік → `PUT /api/me/admin-push { on: false }`; відповідь 500 → прапорець знову увімкнено й «Не вдалося зберегти…».
  - `Admin.test.tsx`: вкладка «Розсилка» веде на `/admin/broadcast`.
  - `admin-text.test.ts`: `logLine` для `push_broadcast` з `{ title: 'Нова вікторина', count: 3 }` → «Адмін надіслав(-ла) розсилку «Нова вікторина», адресатів: 3».
  - `i18n.test.ts` `59 keys (push broadcast) are in every locale`: `ADDED_BROADCAST_59` і `ADDED_BROADCAST_59_PLURALS` (`adminBroadcastPeople_one|_few|_many`) — в uk і шести JSON зі збігом змінних; обидва списки — в умові `adds no uk keys beyond the agreed list`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/admin apps/web/src/push apps/web/src/i18n.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (веб). Спершу винести `PeoplePicker` з `AdminBotSchedule.tsx` і переконатися, що тести 56 зелені, потім вкладка й перемикач.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src
git commit -m "feat(web): 59 admin broadcast tab — title, text, an optional link and recipients (everyone, a family group or people by nickname) with «will reach N people», a live preview and a confirmed send; the limit and the next time, the history with counts; a profile switch for admin announcements, on by default; seven languages"
```

---

### Задача 6. Наскрізний сценарій і кадри (`part59-push-broadcast.e2e.ts`), повтор part 20a / 56

**Files:**
- Create: `apps/server/e2e/part59-push-broadcast.e2e.ts` (сервер з адміном і заглушкою push — `flags.restarting = true; await ctx.shutdown(); await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: 'admin59@example.com' }), push: { publicKey, send } }); flags.restarting = false`, у `finally` — `relisten()`; `send` складає `{ endpoint, payload, options }` в `outbox`, `gone` → 410, як у частині 20a; телефони 360 × 740, світла тема).

**Сценарій** (люди: адмін «Адмін 59»; Оля, Петро, Ганна — члени родинної групи «Поліські вечори», яку створює Оля; Тарас — не в групі; кожен, крім адміна, підписується `POST /api/me/push` з `https://fcm.googleapis.com/fcm/send/e2e-<name>59`; підписка Петра — у `gone`):
`it('part 59: push broadcast — the admin sends to a family group, only its members get it and not the one who switched admin announcements off, the dead subscription counts as failed, the second send hits the 10-minute limit, the history and the log show it; calendar pushes still reach the one who switched off; a non-admin gets 404; phone 360 px, light theme')`:
1. Ганна на `/profile/settings` бачить «Оголошення від адміністраторів» увімкненим, вимикає; після перезавантаження — вимкнено; кадр `broadcast59-profile-360`, `expectNoSideScroll`.
2. Адмін на `/admin/broadcast`: «Нова вікторина у бібліотеці», «Заходь — там «Карпатські озера».», посилання `/library`; «Родинній групі» → «Поліські вечори» → «Отримають 2 людини» (Оля, Петро); перегляд показує заголовок і текст; кадр `broadcast59-form-360`.
3. «Надіслати» → підтвердження (`page.once('dialog', d => d.accept())`) → «Розсилку надіслано.»; `await ctx.push!.idle()`; в `outbox` — рівно два `broadcast` (Оля, Петро) з `url: '/library'`, жодного для Ганни й Тараса; підписки Петра в базі немає.
4. «Оновити» історію → рядок «Нова вікторина у бібліотеці», «Група «Поліські вечори»», «Доставлено: 1, помилок: 1», нік «Адмін 59»; кадр `broadcast59-history-360`.
5. Другу розсилку («Усім, хто ввімкнув сповіщення» → «Отримають 2 людини»: Оля, Тарас) — «Надіслати» вимкнено з «Наступну розсилку можна о …», а прямий `POST /api/admin/broadcasts` → 409 `broadcast_too_soon` з `nextAt`; в `outbox` нових записів немає.
6. Ганна (вимкнула оголошення) отримує календарне нагадування: Оля створює подію й схвалює запит Ганни, як у частині 20a, `ctx.push!.remindDue(<за 30 хв до старту>)` → в `outbox` є `reminder` на ендпоінт Ганни.
7. `/admin/log` — рядок «Адмін 59 надіслав(-ла) розсилку «Нова вікторина у бібліотеці», адресатів: 2».
8. Оля (не адмін): `GET /api/admin/broadcasts`, `POST /api/admin/broadcasts/preview`, `POST /api/admin/broadcasts` → 404; `/admin/broadcast` → перехід на `/`; гість — 404. Тексти сторінок і JSON вкладки без `@`.

- [ ] **Step 1: Write the scenario.** Помічники — з `helpers/common.ts` (`open`, `register`, `expectNoSideScroll`), заглушка й календарні кроки — з `part17-21-likes-feed-calendar-push-admin.e2e.ts` ~1030–1180; групу створювати через API груп, як у `part56-bot-schedule.e2e.ts`.
- [ ] **Step 2: Run** `pnpm build`, потім (після завершення збирання) `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 59"` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 3: Run** по одному, після part 59, не одночасно: `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 20a"`, потім `-t "part 56"`. Expected: PASS (перенесення `push` в `app.ts`, `deliverCounted` і `PeoplePicker` не зламали календарних пушів і розкладу бота).
- [ ] **Step 4: Переглянути кадри:** на 360 px поля, лічильники, радіо адресатів, перегляд і історія — без бічного скролу, текст читається в світлій темі, перемикач у профілі — окремою секцією під «Сповіщеннями».
- [ ] **Step 5: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 59 — the admin sends a broadcast to a family group: only members with a subscription get it, not the one who switched admin announcements off, a dead subscription counts as failed and is dropped; the second send hits the 10-minute limit; history and log; calendar pushes still reach the one who switched off; a non-admin gets 404; 360 px, light theme"
```

---

## Розбіжності зі специфікацією (рішення плану)

1. **Окрема вкладка «Розсилка»**, не розділ «Оголошення»: банер і push — різні речі з різними полями й лімітами; на 360 px дві форми на одній сторінці були б задовгі. Правило посилання — те саме, що в оголошенні (`isAnnouncementUrl`, спільна схема).
2. **Ліміти спільні для всіх адмінів, «день» — ковзні 24 год.** Захист від спаму гравців, а не окремого адміна; ковзна доба не дає 20 розсилок довкола півночі. Відмова — 409 з `nextAt`, без запису в журнал і без рядка; спроба «нікому» ліміту не з'їдає.
3. **«Отримають N людей» — це люди, не пристрої:** ті з адресатів, хто має хоч одну підписку, не вимкнув «Оголошення від адміністраторів», не забанений і не бот. Людей без підписки (група, вибрані) у N немає. **«Доставлено / помилок» — у пристроях** (підписках), бо push-сервіс відповідає за кожну підписку окремо; помилка — будь-яка не-2xx відповідь, 404/410 (підписку прибрано, як зараз) чи збій мережі.
4. **Відправка у фоні.** `POST` повертає 201 з рядком «Надсилається…» одразу, доставка йде через `PushService.background` (`shutdown` її дочікується); лічильники з'являються після завершення. Рядок, що застряг у `sending` довше 15 хв (падіння процесу), історія показує «Перервано»; повторної відправки немає.
5. **Перемикач — у налаштуваннях профілю під «Сповіщеннями»**, видно завжди (це налаштування акаунта, не пристрою); зберігається в нової колонці `profile.admin_push` (типово `true`, як і вимагає специфікація; додавання колонки — та сама «лише додаткова» міграція, що `hide_anti`/`easy_mode`). Вимикає лише `broadcast`; календарні й ботові пуші не змінюються (перевіряє e2e).
6. **Адресати й пошук — з плану 56:** `recipientsFor` винесено з `recipientsOf` без зміни поведінки; пошук людей — наявний `GET /api/admin/bot/people` (адмін знаходить і себе, бот і забанені — ні), групи — `botGroups`; вибір людей у вебі — спільний `PeoplePicker`. До 50 вибраних людей, як у розкладі.
7. **Посилання іншого сайту відкривається в новому вікні**, вікна застосунку сервіс-воркер не підміняє; шлях сайту — у вкладці сайту; без посилання — головна. Заголовок і текст ідуть без перекладу всім мовам; нових ключів у словниках воркера немає.
8. **Історія — останні 50 розсилок** без сторінок; група — за знімком назви (видалену групу видно під старою назвою), вибрані — за поточними ніками (видаленого акаунта немає в переліку).
9. **Журнал:** один рядок `push_broadcast` на розсилку з заголовком і кількістю адресатів, у тій самій транзакції, що й рядок розсилки; підсумок доставки в журнал не пишеться (його видно в історії).
10. **Сервер без ключів VAPID** — вкладка показує, що розсилка недоступна, `POST` — 503 `push_off`.
