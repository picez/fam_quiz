# План 64: збої сервера, скарги «щось не працює», резервні копії з адмінки — вкладки «Збої» і «Копії» (44f)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** План не торкається рушія, кімнат, `GameState`, `SavedRoom` і зрізів. Якщо виконавцю здасться, що потрібне нове поле там, — **зупинитися й спитати контролера**.

> **Міграція — `0047_errors_problems`.** `0046` бере план 63 (модерація й журнал, 44e), який пишеться паралельно. Лише додавання: дві нові таблиці `server_error` і `problem_report`, без `DROP` і без змін наявних колонок. Збирати **після** злиття 63, щоб знімок drizzle містив його зміни. Якщо на момент збирання `0046` у `main` ще немає — згенерувати як `0046_errors_problems`, а під час злиття з 63 перегенерувати як `0047` поверх його `0046` (так само зробили для 59 у `7094d298`).

> **Звірка з кодом.** План спирається на `main` 2026-11-20 (`39052508`, специфікація 44e/44f):
> - журнал і збої: `apps/server/src/log.ts` — `log` (pino, `LOG_REDACT`: `token`, `email`, `password`, `err.detail/params/query`…), `ErrorContext { where; room?; event?; role?; what? }`, `reportError(error, context)` (синхронний, ніколи не кидає: `log.error` + хук `reporter`), `setErrorReporter(next)` — **один** слот «для Sentry», тести (`http-errors.test.ts`, `db-backup.test.ts`, `socket.robust.test.ts`, …) ставлять туди шпигуна. **Sentry не під'єднано.** 79 викликів `reportError` у `src/` (`where`: `http`, `socket*`, `room-*`, `db-backup`, `push-*`, `bot-schedule`, `process`, …); 5xx Fastify — `app.ts` ~128 `reportError(error, { where: 'http', event: 'METHOD /route' })`;
> - копії: `apps/server/src/db-backup.ts` — `BACKUP_PREFIX = 'backups/db/'`, `backupKey`/`parseBackupKey` (`backups/db/2026-11-16T10-05-00Z-m0037.jsonl.gz`), `latestBackup`, `isBackupDue`, `expiredBackups(objects, keep = KEEP_BACKUPS /* 12 */)`, `writeBackup` (advisory `LOCK_KEY`, `stillDue`), `BackupStore { list; remove; upload }`, `r2BackupStore(settings)`, `dbBackups({ db, store, scheduler?, commit?, pauseMs?, tryLock? }) → { check(): Promise<BackupOutcome>; start; stop }` (`BackupOutcome = 'fresh' | 'busy' | 'locked' | 'failed' | BackupStats`); `main.ts` ~153 `backupList: r2 ? () => r2BackupStore(r2).list() : undefined`, ~165 `backups = r2 && backupsEnabled(env) ? dbBackups(…) : null` **після** `buildApp`, `backups?.stop()` у `stop()`; скрипти `apps/server/scripts/db-backup.ts` (теж кличе `expiredBackups`), `db-restore.ts` (`--r2-list`, `--r2 <ключ>`, `--r2-latest`, `--force`); тести — `testing/fake-r2.ts` `fakeR2()` (`settings` з підмінним `fetch`), `testing/fake-scheduler.ts`;
> - блок «Стан» (53): `admin-routes.ts` ~116 `ttlCache` над `deps.backupList` → `AdminBackupInfo` у `GET /api/admin/health`; веб `AdminCharts.tsx` `backupText`, `admin-text.ts` `bytesText`; e2e `part53-admin-home.e2e.ts` ~48 `relisten({ …, backupList })`;
> - push (56, 59): `packages/shared/src/push.ts` `PUSH_KINDS`, `PushPayload`, `pushPayloadSchema`; `apps/server/src/push.ts` `PUSH_TTL`, `NORMAL_URGENCY`, `PushService { deliver(userIds, payload): Promise<number>; deliverCounted; background(work); idle }`; `app.ts` створює `push` до `registerAdminRoutes`, `AdminDeps.push: PushService | null`; воркер — `apps/web/src/push/sw-handlers.ts` (`KINDS`, `isPushPayload`), `push-text.ts` `pushNotice`, `push-strings.ts` + `push/strings/{en,…}.json` (окремі від `locales/`, список `ADDED_BOT_SCHEDULE_56_SW` у `i18n.test.ts`); e2e-заглушка `send`/`outbox` — `part59-push-broadcast.e2e.ts`;
> - адмінка, сервер: `admin-routes.ts` — `AdminDeps`, `adminOf`, `gate` (не-адміну 404), `read = limited('admin-read', 120)`, `write = limited('admin-write', 30)`, у кінці `registerAdminBotRoutes` / `registerPlayerCardRoutes` / `registerAdminBroadcastRoutes(app, deps, { read, write, adminOf })` ~368–370; `bans.ts` `logAction(tx, { adminId, kind, targetUserId, details, now })`; `AdminList<T> { rows; total; page; pages }`, `ADMIN_PAGE_SIZE = 50`; тест воріт — `admin-routes.test.ts` `routes` ~97;
> - адмінка, веб: `apps/web/src/admin/Admin.tsx` `TABS` (Статистика … Оголошення, Розсилка, Журнал, Бот) і `<Routes>`; `useAdminData(load, key, { keep })`, `admin-api.ts` (`fetchData`, `request`), `admin-text.ts` `logLine(entry)`; бейдж-зразок — `.menu-badge` у `menu/Menu.tsx`;
> - меню: `apps/web/src/menu/Menu.tsx` — нижня смуга: гість `[JOIN, LIBRARY, signIn]`, акаунт 5 пунктів, адмін + `ADMIN` (`/admin`); місця для сьомого пункту на 360 px немає. `WithMenu.tsx` — обгортка сторінок; ігрові екрани `screens/PlayerScreen.tsx` / `HostScreen.tsx` мають шапку `.bar` (повну), `MenuLinks.tsx` — посилання після кінця гри;
> - обмеження частоти: окремого помічника **немає** — кожен маршрут пише `config.rateLimit { max, timeWindow, keyGenerator }` (зразок — `profile-routes.ts` ~104 `locale:${user?.id ?? request.ip}`); `@fastify/rate-limit` 11.2.1: `max` може бути `(req, key) => number`;
> - інше: `packages/shared/src/text.ts` `isStorable`/`UNSTORABLE`; `apps/web/src/locales/current.ts` `currentLocale()`; `theme-mode.ts` `lightThemeOn()`; `format.ts` `formatDate`; `testing/test-db.ts` `createTestDb`, `createTestDbUpTo(tag)` + `migrateRest`; `e2e/helpers/setup.ts` `relisten(extra)`.
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

> **Точки злиття з планом 63** (будувати від `main` після злиття 63; якщо його ще немає — додати так само й під час злиття лишити обидва):
> - `packages/shared/src/admin.ts`: рядок `ADMIN_ACTION_KINDS` (63 додає свої види модерації стрічки й груп; ми — `server_error_resolve`, `problem_resolve`, `problem_reply`, `backup_now`). Якщо 63 вводить групи видів для фільтра журналу (мапа «вид → група»), наші чотири йдуть у його групу «Система»/найближчу за змістом, а якщо такої немає — у нову групу `system` з ключем назви за зразком 63; тест 63 «кожен вид має групу» має лишитися зеленим. CSV 63 бере текст дії з того самого джерела, що й `logLine`, — наші рядки журналу мають там бути;
> - `apps/web/src/admin/Admin.tsx` (`TABS`, `<Routes>`): 63 додає «Стрічка» і «Групи», ми — «Збої» (з бейджем) і «Копії»; порядок: … «Журнал», «Збої», «Копії», «Бот»;
> - `apps/server/src/admin-routes.ts` (рядки реєстрації в кінці), `admin-routes.test.ts` (`routes`);
> - `apps/server/src/db/schema.ts`, `drizzle/meta/_journal.json`, `drizzle/meta/*_snapshot.json`: міграцію генерувати **після** 63;
> - `apps/web/src/admin/admin-text.ts` `logLine`, `apps/web/src/i18n.ts`, шість JSON, `i18n.test.ts` (обидва плани додають свої `ADDED_*` у той самий довгий рядок умови `adds no uk keys beyond the agreed list` — при конфлікті лишити обидва).

**Мета:** сервер зберігає свої збої (групуючи однакові, без особистих даних), адмін бачить їх у вкладці «Збої» з лічильником нових і позначає вирішеними; будь-хто (і гість, з обмеженням частоти) надсилає «щось не працює» з меню-сторінки, профілю чи гри разом зі знімком сторінки, адмін бачить скарги там само, закриває їх і може відповісти автору-акаунту (push і «Мої повідомлення»); вкладка «Копії» показує копії бази з R2 `backups/db/`, знімає копію на вимогу (не частіше разу на годину, тим самим механізмом, що щотижнева) і дає інструкцію з `db:restore` — відновлення з адмінки немає.

**Архітектура:** спільне — `packages/shared/src/problems.ts` (межі, схеми, типи адмінки, push-вид `problem_reply`, команди відновлення). Сервер: `error-mask.ts` (маскування), `error-store.ts` (буфер у пам'яті + одне `insert … on conflict` на відбиток раз на 5 с; другий слот `setErrorSink` у `log.ts`, тож шпигуни тестів не зачеплені), `problem-store.ts`, публічні маршрути `problem-routes.ts`, адмінські `admin-problem-routes.ts` і `admin-backup-routes.ts`; `dbBackups` отримує `runNow()`/`status()`, `main.ts` створює його до `buildApp`. Веб: сторінка `/report` + `ProblemLink`, вкладки `AdminErrors.tsx` і `AdminBackups.tsx`, гілка `problem_reply` у воркері.

**Технології:** TypeScript, zod 4, Fastify + `@fastify/rate-limit`, drizzle (Postgres) + drizzle-kit, `node:crypto` (sha1 відбитка), web-push (у тестах підмінений), vitest (`shared`/`server`/`web`), React 19 + Testing Library, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-20-errors-backups-design.md` (44f); копії — підпроєкт 35 (`db-backup.ts`, `db-restore.ts`); блок «Стан» — план 53; push — плани 56 і 59.

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22**; рушій, кімнати, зрізи — без змін.
- **Міграція одна — `0047_errors_problems`** (`0046` — план 63), лише `CREATE TABLE` / `CREATE INDEX` / зовнішні ключі; жодного `DROP` чи зміни наявного.
- **Лише адміністратори:** кожен новий `/api/admin/*` — через `read`/`write` (ворота `gate`), не-адміну й гостю — та сама **404**; кожен маршрут — у списку `routes` тесту воріт. Скаргу надсилає будь-хто (`POST /api/problem-reports`), з обмеженням частоти. Кожна дія адміна — рядок журналу.
- **Жодних особистих даних у збоях:** email, паролі, токени, cookie, ключі в URL — маскуються **до** запису в базу (`maskPersonal`); `err.detail/params/query` не зберігаються зовсім. Скарга не зберігає IP; адреса сторінки — лише шлях (без `?` і `#`: там бувають токени, як `/stage/…#token`). Email у відповідях нових маршрутів — жодного (тест шукає `@`).
- **Відновлення з адмінки немає** — ні маршруту, ні кнопки; лише текст інструкції з командами `db:restore`.
- **Копії на вимогу — лише там, де ввімкнено щотижневі** (`backupsEnabled(env)` і є R2): локальний сервер з ключами R2 не пише копії поруч із продакшеновими.
- Тексти інтерфейсу — **7 мов**: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`; ключі сповіщення — `push-strings.ts` + `push/strings/{en,de,es,it,pl,ar}.json`. Нові uk-ключі — у списках `ADDED_ERRORS_64` і `ADDED_ERRORS_64_SW` у `i18n.test.ts` (в умову `adds no uk keys beyond the agreed list` і в перевірку наявності в шести мовах зі збігом змінних, як `ADDED_BROADCAST_59`). Множин немає (тексти з «: {count}»). ru немає.
- Кириличні літерали в `apps/web/src/` — лише в словниках і тестах (`source-scan.test.ts`).
- **Push у тестах — лише підмінений** (`send`-заглушка); R2 у тестах — лише `fakeR2()`.
- **Нічого, пов'язаного з росією**, — у фікстурах, текстах скарг, ніках, e2e.
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm exec tsc -p <пакет>` у задачах 1–5, з задачі 7 — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів vitest).
- Файли правити лише Edit/Write чи `sed`; **python3 на цій машині — порожня заглушка, ним нічого не правити й не генерувати**; після коміту — `git show --stat`.
- Робоче дерево — лише `C:\ClaudeCode\quiz\.superpowers\worktrees\plan64`; жодних файлів поза `C:\ClaudeCode\quiz` (тимчасові — у `.superpowers` чи scratchpad сесії). Інших дерев не торкатися.
- e2e: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 64"`; телефон 360 px, світла тема (`quiz:theme = light`, `is-light` на `<html>`); після — окремо `-t "part 53"` і `-t "part 59"`.

## Рішення плану (там, де специфікація мовчить)

**Спільне (`packages/shared/src/problems.ts`, експорт з `index.ts`)**
- Константи: `SERVER_ERROR_MESSAGE_MAX = 500` (символів), `SERVER_ERROR_STACK_MAX = 4096` (**байтів** UTF-8, як у специфікації), `SERVER_ERROR_DAY_MS = 86_400_000`, `SERVER_ERROR_KEEP_DAYS = 30`, `SERVER_ERROR_FLUSH_MS = 5000`, `SERVER_ERROR_BUFFER_MAX = 50` (різних відбитків між записами); `PROBLEM_TEXT_MAX = 1000`, `PROBLEM_REPLY_MAX = 500`, `PROBLEM_PATH_MAX = 300`, `PROBLEM_BROWSER_MAX = 300`, `PROBLEM_GUEST_PER_HOUR = 3`, `PROBLEM_USER_PER_HOUR = 5`, `PROBLEM_GUESTS_PER_HOUR_ALL = 50` (усі гості разом), `PROBLEM_MINE_MAX = 20`; `BACKUP_MANUAL_GAP_MS = 3_600_000`, `BACKUP_LIST_MAX = 50`.
- `cleanPagePath(path: string): string` — до першого `?` чи `#`, обрізати до `PROBLEM_PATH_MAX`; не з `/` чи з `//` → `'/'`.
- Схеми:
  ```ts
  export const problemPageSchema = z.object({
    path: z.string().max(2000).transform(cleanPagePath),
    browser: z.string().max(1000).transform((s) => s.slice(0, PROBLEM_BROWSER_MAX)),
    screen: z.string().regex(/^\d{2,5}x\d{2,5}$/),
    lang: localeSchema,
    theme: z.enum(['light', 'dark']),
  }).strict();
  export const problemReportInputSchema = z.object({
    text: z.string().trim().min(1).max(PROBLEM_TEXT_MAX).refine(isStorable, UNSTORABLE),
    page: problemPageSchema.nullable().default(null),
  }).strict();
  export const problemReplySchema = z.object({ text: z.string().trim().min(1).max(PROBLEM_REPLY_MAX).refine(isStorable, UNSTORABLE) }).strict();
  export const adminErrorsQuerySchema = z.object({ status: z.enum(['new', 'resolved']).default('new'), page: z.coerce.number().int().min(1).max(100000).default(1) });
  export const adminProblemsQuerySchema = z.object({ status: z.enum(['open', 'resolved']).default('open'), page: /* як вище */ });
  ```
- Типи: `ProblemPage = z.infer<typeof problemPageSchema>`; `AdminServerError { id; where: string; what: string | null; event: string | null; name: string; message: string; stack: string | null; count: number; dayCount: number; firstAt: string; lastAt: string; status: 'new' | 'resolved'; resolvedBy: string | null /* нік */; resolvedAt: string | null }`; `ProblemAuthor = { kind: 'guest' } | { kind: 'account'; id: string; nickname: string; push: boolean /* є підписка */ } | { kind: 'deleted' }`; `AdminProblemReport { id; at; who: ProblemAuthor; text; page: ProblemPage | null; status: 'open' | 'resolved'; reply: string | null; repliedAt: string | null; resolvedBy: string | null; resolvedAt: string | null }`; `MyProblemReport { id; at; text; status; reply: string | null; repliedAt: string | null }`; `AdminProblemsBadge { errors: number; reports: number }`; `AdminBackupRow { key; at; bytes; level: number }`; `BackupRun { at: string; by: 'schedule' | 'admin'; outcome: 'ok' | 'failed' | 'locked'; key: string | null; bytes: number | null }`; `AdminBackups { stored: boolean /* є R2 */; enabled: boolean /* можна знімати */; rows: AdminBackupRow[]; running: boolean; last: BackupRun | null; nextAt: string | null }`.
- `BACKUP_RESTORE_COMMANDS = { list: 'pnpm --filter @quiz/server db:restore --r2-list', latest: 'pnpm --filter @quiz/server db:restore --r2-latest', key: 'pnpm --filter @quiz/server db:restore --r2 {key}' } as const` — код, не перекладається.
- Push: `PushPayload` + `{ kind: 'problem_reply'; reportId: string; text: string; locale?: Locale }`; `PUSH_KINDS` + `'problem_reply'`; гілка в `pushPayloadSchema`.
- Журнал: `ADMIN_ACTION_KINDS` + `'server_error_resolve'`, `'problem_resolve'`, `'problem_reply'`, `'backup_now'`. Нових полів `AdminLogDetails` немає: `server_error_resolve` → `{ title: '<where>: <перші 80 символів повідомлення>' }`, `problem_resolve` → `{ text: <перші 80 символів скарги> }`, `problem_reply` → `{ text: <відповідь> }` з `targetUserId` = автор, `backup_now` → `{}`.

**База (`0047_errors_problems`)**
- `server_error`: `id uuid pk default random`, `fingerprint text not null`, `where text not null`, `what text`, `event text`, `name text not null`, `message text not null`, `stack text`, `count integer not null default 1`, `day_count integer not null default 1`, `day_start timestamptz not null`, `first_at timestamptz not null`, `last_at timestamptz not null`, `status text not null default 'new'`, `resolved_by text → user.id on delete set null`, `resolved_at timestamptz`. Індекси: `server_error_open_once` — унікальний `(fingerprint) where status = 'new'`; `server_error_status_last_idx (status, last_at)`.
- `problem_report`: `id uuid pk default random`, `user_id text → user.id on delete set null`, `from_account boolean not null` (відрізняє гостя від видаленого акаунта), `text text not null`, `page jsonb` (`ProblemPage | null`), `status text not null default 'open'`, `reply text`, `replied_at timestamptz`, `resolved_by text → user.id on delete set null`, `resolved_at timestamptz`, `created_at timestamptz not null`. Індекси: `problem_report_status_created_idx (status, created_at)`, `problem_report_user_idx (user_id, created_at)`.

**Маскування (`apps/server/src/error-mask.ts`)**
- `maskPersonal(text: string): string`, по черзі: email → `[email]`; `Bearer <x>` → `Bearer [hidden]`; `(token|password|passwd|secret|auth|cookie|session|key|sig|signature)\s*[=:]\s*("…"|[^\s&,;"]+)` (без регістру, і в JSON `"password":"…"`) → `$1=[hidden]`; userinfo в URL `//user:pass@` → `//[hidden]@`; рядок `[A-Za-z0-9_-]{32,}` чи hex `{32,}` → `[hidden]`. UUID (36 з дефісами) і шестизначні коди кімнат **лишаються** (вони потрібні для пошуку й не особисті).
- `truncateBytes(text, max): string` — не рве UTF-8 посередині символу.
- `errorFingerprint(error, context): string` — sha1 від `where|what|name|нормалізоване повідомлення|перший рядок стека з apps/` (нормалізація: числа, uuid → `#`), щоб «кімната 123456» і «кімната 654321» групувались.

**Сховище збоїв (`apps/server/src/error-store.ts`)**
- `createErrorStore({ db, now?, flushMs?, scheduler? }): ErrorStore { record(error: unknown, context: ErrorContext): void; flush(): Promise<void>; stop(): Promise<void> }`.
- `record` синхронний, нічого не пише в базу: маскує, рахує відбиток, кладе в `Map` (є — `n += 1`, `lastAt` оновлюється); понад `SERVER_ERROR_BUFFER_MAX` різних — відкидає й рахує відкинуті. Таймер `flushMs` (unref) кличе `flush`.
- `flush` — на кожен відбиток **одне** `insert … on conflict (fingerprint) where status = 'new' do update set count = count + n, last_at = :at, day_count = case when day_start <= :at − 24 год then n else day_count + n end, day_start = case … then :at else day_start end` (без гонки між двома екземплярами під час розгортання); раз на годину — `delete … where last_at < now − 30 днів`; відкинуті — один `log.warn`. **Збій запису — лише `log.warn`, ніколи `reportError`** (інакше нескінченне коло).
- `stop` — прибрати таймер і дочекатися останнього `flush`.
- `log.ts`: новий другий слот `setErrorSink(next: ErrorReporter | null): () => void`; `reportError` кличе його після `reporter`, у своєму `try/catch`. `setErrorReporter` не змінюється — тести-шпигуни працюють як раніше.
- `app.ts`: `AppOptions.errorLog?: boolean` (типово `true`); `buildApp` створює `errors = createErrorStore({ db })`, ставить `setErrorSink(errors.record)`, у `app.addHook('onClose')` — знімає слот і `await errors.stop()` (onClose, не лише `shutdown`: багато тестів кличуть тільки `app.close()`); повертає `errors` у результаті `buildApp`.
- Читання: `listServerErrors(db, query, now): Promise<AdminList<AdminServerError>>` — за `last_at desc`, по `ADMIN_PAGE_SIZE`; `dayCount = 0`, якщо `day_start` старший за добу; нік того, хто вирішив. `resolveServerError(db, { adminId, id, now }): Promise<'ok' | 'not_found' | 'already'>` — у транзакції: `status = 'resolved'` + `logAction`; `already` — без журналу. Повтор після вирішення створює **новий** рядок «нове» (через частковий унікальний індекс).
- `problemsBadge(db): Promise<AdminProblemsBadge>` — кількість `server_error` зі `status = 'new'` і `problem_report` зі `status = 'open'`.

**Скарги (`apps/server/src/problem-store.ts`, `problem-routes.ts`)**
- `createProblemReport(db, { userId: string | null, input, now }): Promise<{ id: string } | { error: 'problem_busy' }>` — для гостя спершу `count(*)` гостьових за годину; `>= PROBLEM_GUESTS_PER_HOUR_ALL` → `problem_busy`.
- `myProblemReports(db, userId): Promise<MyProblemReport[]>` — останні `PROBLEM_MINE_MAX`.
- `listProblemReports(db, query): Promise<AdminList<AdminProblemReport>>` — `who`: `user_id` є → `account` (нік, `push` = є хоч одна підписка); `user_id null` і `from_account` → `deleted`; інакше `guest`.
- `resolveProblem(db, { adminId, id, reply: string | null, now }): Promise<{ ok: true; userId: string | null; replied: boolean } | { ok: false; error: 'not_found' | 'problem_no_account' | 'problem_replied' }>` — відповідь гостю чи видаленому → `problem_no_account`; друга відповідь → `problem_replied`; закриття вже закритої без відповіді — `ok`, без журналу. Журнал: `problem_reply` (з відповіддю) або `problem_resolve`.
- `registerProblemRoutes(app, { db, currentUser, now })` (у `app.ts` поруч з іншими публічними):
  - `POST /api/problem-reports` — `rateLimit: { timeWindow: '1 hour', keyGenerator: async (r) => (u = await currentUser(r)) ? 'problem:user:' + u.id : 'problem:ip:' + r.ip, max: (_r, key) => key.startsWith('problem:user:') ? PROBLEM_USER_PER_HOUR : PROBLEM_GUEST_PER_HOUR }`; схема → 400 `invalid_payload`; `problem_busy` → 429; успіх → 201 `{ id }`. Тіло до 8 КБ (`bodyLimit`).
  - `GET /api/me/problem-reports` — гість 401; → `MyProblemReport[]`.

**Адмінські маршрути (`admin-problem-routes.ts`, `registerAdminProblemRoutes(app, deps, { read, write, adminOf })`)**
- `GET /api/admin/problems/badge` (`read`) → `AdminProblemsBadge`.
- `GET /api/admin/errors?status&page` (`read`) → `AdminList<AdminServerError>`; `POST /api/admin/errors/:id/resolve` (`write`) → 200 `{}` / 404.
- `GET /api/admin/problems?status&page` (`read`) → `AdminList<AdminProblemReport>`; `POST /api/admin/problems/:id/resolve` (`write`, тіло `{}`) → 200 / 404; `POST /api/admin/problems/:id/reply` (`write`, `problemReplySchema`) → 200 `{ pushed: boolean }` / 400 / 404 / 409 `problem_no_account` | `problem_replied`. Після успіху відповіді — `deps.push?.background(deps.push.deliver([userId], { kind: 'problem_reply', reportId, text }))`; `pushed` = `push !== null` і в автора є підписка. Відповідь іде незалежно від `admin_push` (це особисте, не розсилка).
- Не-UUID `:id` → 404.

**Копії (`db-backup.ts`, `admin-backup-routes.ts`)**
- `expiredBackups(objects, keep = KEEP_BACKUPS)` — **нове правило зберігання:** лишаються `keep` найновіших **і** найновіша копія кожного з `keep` семиденних вікон, відлічених назад від найновішої копії; решта — на видалення. Ручні копії більше не витісняють щотижневі (12 натискань за 12 годин інакше стерли б тримісячну історію). Скрипт `db-backup.ts --r2` бере ту саму функцію.
- `dbBackups` + `runNow(): Promise<{ started: true } | { started: false; reason: 'busy' | 'recent'; nextAt?: string }>` — `busy`, якщо йде копія; `recent`, якщо найновіша копія молодша за `BACKUP_MANUAL_GAP_MS` (`nextAt` = її час + 1 год; рахується від сховища, тож переживає перезапуск); інакше запускає той самий шлях, що `check`, але з умовою «найновішій ≥ 1 год» замість «≥ тиждень» (і в `stillDue`), у фоні, і одразу повертає `started`. `status(): { running: boolean; last: BackupRun | null }` — остання спроба (розклад чи адмін) у пам'яті процесу. `idle(): Promise<void>` — дочекатися фонової копії. `check`/`start`/`stop` не змінюються зовні; `stop` перериває й ручну копію.
- Після ручної копії тижневий відлік іде від неї (`isBackupDue` дивиться на найновішу) — це «той самий механізм».
- `AppOptions.backups?: Pick<DbBackups, 'runNow' | 'status'>` → `AdminDeps.backups`; `main.ts`: створення `backups` переноситься **до** `buildApp` і передається; `backups?.start()` лишається після `listen`.
- `registerAdminBackupRoutes(app, deps, guards)`:
  - `GET /api/admin/backups` (`read`) → `AdminBackups`: `stored = backupList !== undefined`; `enabled = deps.backups !== undefined`; `rows` — лише ключі `parseBackupKey`, від найновішої, до `BACKUP_LIST_MAX`; `nextAt` — найновіша + 1 год, якщо в майбутньому; без кешу (кеш 53 лишається лише для «Стану»). Збій списку → 200 з `rows: []` і `error: true` + `reportError({ where: 'admin-backups' })`.
  - `POST /api/admin/backups` (`write`) → 202 `{}` + журнал `backup_now`; `enabled = false` → 503 `backup_off`; `busy` → 409 `backup_busy`; `recent` → 409 `{ error: 'backup_recent', nextAt }` (відмови — без журналу).
- Маршруту відновлення **немає**.

**Веб**
- Сторінка `/report` (`apps/web/src/problems/ProblemReport.tsx`, у `AppRoutes.tsx` під `WithMenu`, ліниво): заголовок «Повідомити про проблему», `textarea` (1000, лічильник «{used} з {max}»), прапорець «Додати відомості про сторінку» (типово ввімкнено) з переглядом: адреса, браузер, екран, мова, тема; «Надіслати» → «Дякуємо! Ми отримали повідомлення.»; 429 → `err_problem_rate`; гість бачить підказку «Щоб отримати відповідь, увійди». Для акаунта — «Мої повідомлення»: дата, текст, «Відкрите»/«Вирішене», відповідь адміністратора.
- `problems/problem-page.ts` `pageSnapshot(from: string): ProblemPage` — `{ path: cleanPagePath(from), browser: navigator.userAgent, screen: \`${innerWidth}x${innerHeight}\`, lang: currentLocale(), theme: lightThemeOn() ? 'light' : 'dark' }`; `from` — параметр `?from=` (немає → `/report`).
- `problems/ProblemLink.tsx` `{ className?: string; newTab?: boolean }` — `<a href="/report?from=<поточний шлях>">` «Повідомити про проблему». Де: **Home** унизу (бачать усі, й гості), **ProfileSettings** окремою секцією внизу, **PlayerScreen** і **HostScreen** — дрібне посилання в самому низу екрана з `newTab` (`target="_blank" rel="noopener"`: сокет гри не рветься; шапку `.bar` не чіпаємо). Пункту в нижньому меню немає (див. розбіжності).
- `api.ts`: `sendProblemReport(input): Promise<ApiResult<{ id: string }>>`, `myProblemReports(): Promise<ApiData<MyProblemReport[]>>`.
- Воркер: `KINDS` + `'problem_reply'`; `isPushPayload` — `reportId`, `text` рядки; `pushNotice` → `{ title: pushProblemReplyTitle, body: payload.text, url: '/report', tag: 'problem-{reportId}' }`.
- Вкладка «Збої» `/admin/errors` (`admin/AdminErrors.tsx`): перемикач розділів «Збої сервера» / «Скарги гравців» (`?view=reports`), у кожному — «Нові/Вирішені» («Відкриті/Вирішені»), сторінки. Картка збою: `where` (+ `what`, `event`), назва й повідомлення, «Повторів: N, за добу: M», «Уперше: …, востаннє: …», стек у `<details>` (`pre` з переносом рядків, без бічного скролу), «Позначити як вирішене» → картка зникає з «Нових». Картка скарги: хто (нік — посилання на `/admin/users/:id`; «Гість»; «Акаунт видалено»), коли, текст, відомості про сторінку, «Вирішено», «Відповісти» (лише для акаунта: `textarea` 500, «Надіслати відповідь» — закриває скаргу; підказка «Сповіщення не ввімкнено — відповідь буде на сторінці «Мої повідомлення»», якщо `push: false`).
- Бейдж: `Admin.tsx` читає `adminProblemsBadge()` на кожну зміну `location.key`; на вкладці «Збої» — `<span className="menu-badge">` із `errors + reports` (0 — немає), `aria-label` «Збої, нових: {count}».
- Вкладка «Копії» `/admin/backups` (`admin/AdminBackups.tsx`): «Остання копія: …» або «Копій ще немає»; стан останньої спроби (`last`): «вдалася … (розмір)» / «не вдалася …»; «Зробити копію зараз» (`window.confirm`) → «Копія знімається…», поки `running`, — автооновлення кожні 5 с (`useAdminData` з `keep`); `nextAt` → кнопка вимкнена й «Наступну копію можна о {time}»; `enabled: false` → «Копії на цьому сервері вимкнені»; `stored: false` → «Сховище копій не налаштоване». Список: дата (Київ, `formatDate`), розмір (`bytesText`), рівень `m0047`, кнопка «Команда відновлення» → копіює `BACKUP_RESTORE_COMMANDS.key` з ключем. Блок «Як відновити»: «З адмінки відновлення немає — це надто небезпечно.», кроки (порожня база в `DATABASE_URL`, команда, `--force` лише свідомо, перезапуск веб-сервісу) і команди `list` / `latest` / `key` у `<code>`.
- `admin-api.ts`: `adminProblemsBadge`, `adminErrors(status, page)`, `resolveServerError(id)`, `adminProblems(status, page)`, `resolveProblem(id)`, `replyProblem(id, text)`, `adminBackups()`, `startBackup()` (409 віддає й `nextAt`).
- `admin-text.ts` `logLine` — чотири нові види (змінні як є: `admin`, `target`, `title`, `text`).
- Стилі: `.admin-errors`, `.admin-backups`, `.problem-form`, `.problem-link` — 360 px без бічного скролу, лише змінні теми.

## Порядок збирання

- 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Залежності: 2 ← 1; 3 ← 2; 4 ← 1 (з 3 — лише спільний рядок реєстрації); 5 ← 1; 6 ← 3, 5; 7 ← 3, 4; 8 — остання.
- `tsc -p apps/web` може падати на `adminLog_*` нових видів до задачі 7 — очікувано; `pnpm typecheck` обов'язково зелений з задачі 7.

## Фокус рев'ю

1. **Особисте в збоях.** `new Error('no user olya@example.com, token=abc123')`, URL `postgres://app:secret@db/x`, `Bearer eyJ…`, `{"password":"x"}` — у базі й у JSON вкладки лише `[email]`/`[hidden]`; `err.detail` (`Key (email)=(…)`) не зберігається. Задачі 2, 8.
2. **Шторм збоїв не кладе сервер.** 10 000 однакових `reportError` за секунду → один рядок з `count: 10000` і жодного запиту на кожен виклик; 60 різних → 50 записано, решта відкинута з одним попередженням; база впала — `reportError` не кидає й не зациклюється. Задача 2.
3. **Скарга гостя.** 4-та за годину з однієї адреси — 429; акаунт має свої 5; `?token=…` і `#…` зі шляху відрізано; немає IP у базі. Задачі 1, 3, 8.
4. **Копія на вимогу.** Друга протягом години — 409 `backup_recent` з `nextAt` (і після перезапуску); дві одночасні — одна знімається; локальний сервер без `DB_BACKUP` — 503 `backup_off`; 12 ручних копій поспіль не стирають щотижневих. Задача 4.
5. **Ворота.** Кожен новий `/api/admin/*` — 404 не-адміну й гостю; відповідь видаленому акаунту чи гостю — 409; маршруту відновлення немає (`POST /api/admin/backups/restore` → 404). Задачі 3, 4, 8.

---

### Задача 1. Спільне: межі, схеми й типи збоїв, скарг і копій, push-вид `problem_reply`, види журналу

**Files:**
- Create: `packages/shared/src/problems.ts`, `packages/shared/src/problems.test.ts`.
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/push.ts`, `packages/shared/src/admin.ts`.
- Test: `packages/shared/src/push.test.ts`, `packages/shared/src/admin.test.ts`.

**Interfaces:**
- Consumes: `isStorable`/`UNSTORABLE`, `localeSchema`, `AdminList`.
- Produces: константи `SERVER_ERROR_*`, `PROBLEM_*`, `BACKUP_MANUAL_GAP_MS`, `BACKUP_LIST_MAX`, `BACKUP_RESTORE_COMMANDS`; `cleanPagePath`; схеми `problemPageSchema`, `problemReportInputSchema`, `problemReplySchema`, `adminErrorsQuerySchema`, `adminProblemsQuerySchema`; типи `ProblemPage`, `ProblemReportInput`, `AdminServerError`, `ProblemAuthor`, `AdminProblemReport`, `MyProblemReport`, `AdminProblemsBadge`, `AdminBackupRow`, `BackupRun`, `AdminBackups`; push-вид `problem_reply`; чотири види журналу.

- [ ] **Step 1: Write the failing tests:**
  - `problems.test.ts` `a problem report: text up to 1000, an optional page snapshot`: приймає `{ text: 'Не відкривається таблиця', page: null }`, без `page` (→ `null`), з `page: { path: '/play/123456?token=abc#x', browser: 'Mozilla/5.0 …', screen: '360x740', lang: 'uk', theme: 'light' }` → `path` = `'/play/123456'`; `browser` 1000 символів → обрізано до 300; відкидає порожній текст, `'а'.repeat(1001)`, `screen: '360'`, `theme: 'blue'`, `lang: 'ru'`, зайве поле.
  - `cleanPagePath keeps only a site path`: `'/stage/123456#tok'` → `'/stage/123456'`; `'//evil.example'` → `'/'`; `'https://x'` → `'/'`; 400 символів → 300.
  - `a reply is up to 500`: `problemReplySchema` — 500 приймає, 501 і `'  '` відкидає.
  - `admin queries default to new and open`: `adminErrorsQuerySchema.parse({})` → `{ status: 'new', page: 1 }`; `adminProblemsQuerySchema.parse({ status: 'resolved', page: '2' })` → `{ status: 'resolved', page: 2 }`; `status: 'all'` відкидає.
  - `restore commands name db:restore`: усі три `BACKUP_RESTORE_COMMANDS` містять `db:restore`, `key` — `{key}`.
  - `push.test.ts`: `pushPayloadSchema` приймає `{ kind: 'problem_reply', reportId: 'R', text: 'Виправили, дякуємо!' }`, відкидає без `text`; `PUSH_KINDS` містить `problem_reply`.
  - `admin.test.ts`: `ADMIN_ACTION_KINDS` містить `server_error_resolve`, `problem_resolve`, `problem_reply`, `backup_now`.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/problems.test.ts packages/shared/src/push.test.ts packages/shared/src/admin.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (спільне).
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 && pnpm exec tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 64 errors, problem reports and backups — a report up to 1000 characters with an optional page snapshot (path without query or hash, browser, screen, language, theme), a reply up to 500, admin types for stored errors, reports and backups, the problem_reply push kind, four log kinds, db:restore commands"
```

---

### Задача 2. Сервер: міграція `0047`, маскування, сховище збоїв і другий слот `reportError`

**Files:**
- Create: `apps/server/drizzle/0047_errors_problems.sql` (+ знімок і рядок журналу від drizzle-kit), `apps/server/src/error-mask.ts`, `apps/server/src/error-mask.test.ts`, `apps/server/src/error-store.ts`, `apps/server/src/error-store.test.ts`.
- Modify: `apps/server/src/db/schema.ts` (`serverError`, `problemReport`), `apps/server/src/log.ts` (`setErrorSink`), `apps/server/src/app.ts` (`errorLog`, `errors`, хук `onClose`).
- Test: `apps/server/src/db/schema.test.ts`, `apps/server/src/log.test.ts`, `apps/server/src/http-errors.test.ts`.

**Interfaces:**
- Consumes: задача 1; `ErrorContext`, `logAction`, `createTestDb`, `FakeScheduler`.
- Produces: `serverError`, `problemReport` (drizzle); `maskPersonal(text): string`, `truncateBytes(text, max): string`, `errorFingerprint(error, context): string`; `createErrorStore(...)` → `ErrorStore { record; flush; stop }`; `listServerErrors`, `resolveServerError`, `problemsBadge`; `setErrorSink(next): () => void`; `buildApp(...)` повертає `errors: ErrorStore | null`.

- [ ] **Step 1: Write the failing tests:**
  - `error-mask.test.ts` `masks emails, tokens, passwords and URL credentials, keeps room codes and ids`: `'no user olya@example.com in room 123456'` → `'no user [email] in room 123456'`; `'Authorization: Bearer eyJhbGciOi.abc.def'` → містить `Bearer [hidden]`; `'GET /api/x?token=abc123&page=2'` → `token=[hidden]&page=2`; `'{"password":"qwerty"}'` → без `qwerty`; `'postgres://app:secret@db:5432/quiz'` → `//[hidden]@`; 40-символьний base64url → `[hidden]`; uuid `3f2b…` лишається. `truncateBytes('ї'.repeat(3000), 4096)` → ≤ 4096 байтів і без `\uFFFD`. `errorFingerprint` для «room 123456 not found» і «room 654321 not found» з тим самим `where` — однаковий; з іншим `where` — різний.
  - `error-store.test.ts`:
    - `groups repeats into one row with a total and a day count`: три `record` однакової помилки → `flush` → один рядок `count: 3`, `dayCount: 3`, `status: 'new'`; ще один через 25 год → `count: 4`, `dayCount: 1`.
    - `stores no personal data`: `record(Object.assign(new Error('no user olya@example.com'), { detail: 'Key (email)=(olya@example.com)' }), { where: 'store' })` → у рядку (`message`, `stack`) немає `@`.
    - `a stack is cut to 4 KB`: стек 20 КБ → `Buffer.byteLength(stack) <= 4096`.
    - `a storm is one write per fingerprint and the buffer is bounded`: 10 000 `record` однакових → `flush` робить один запит (лічильник через `createTestDb({ onQuery })`), `count: 10000`; 60 різних → 50 рядків і один `log.warn` (шпигун `log.warn`).
    - `a resolved error comes back as a new row`: `resolveServerError` → `ok`, рядок журналу `server_error_resolve` з `title` `'store: …'`; повтор → `already`, без журналу; той самий збій ще раз → новий рядок `new`, старий лишився `resolved`; `problemsBadge` → `{ errors: 1, reports: 0 }`.
    - `a broken database never throws and never loops`: `flush` над закритою базою → не кидає; шпигун `setErrorReporter` не отримав жодного виклику.
    - `old rows are pruned after 30 days`.
  - `log.test.ts` `reportError reaches the sink after the reporter, and a throwing sink is swallowed`.
  - `http-errors.test.ts` `a 500 is stored with its route`: маршрут, що кидає → після `ctx.errors!.flush()` `listServerErrors` має рядок `where: 'http'`, `event: 'GET /boom'`; шпигун `setErrorReporter` теж отримав (обидва слоти).
  - `schema.test.ts` `describe('errors and problems (64)')`: `server_error` з тим самим `fingerprint` двічі `new` → помилка унікальності, `new` + `resolved` — можна; `problem_report` приймає рядок без `user_id`; видалення автора ставить `user_id = null`, а `from_account` лишається `true`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/error-mask.test.ts apps/server/src/error-store.test.ts apps/server/src/log.test.ts apps/server/src/http-errors.test.ts apps/server/src/db/schema.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** схему за «Рішеннями плану» (база); `pnpm --filter @quiz/server exec drizzle-kit generate --name errors_problems` → перевірити, що SQL — лише `CREATE TABLE`, `CREATE INDEX`/`CREATE UNIQUE INDEX … WHERE`, зовнішні ключі, і файл — `0047_errors_problems.sql` (див. примітку про номер угорі). Далі `error-mask.ts`, `error-store.ts`, `setErrorSink`, підключення в `app.ts` — за «Рішеннями плану».
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/error-mask.test.ts apps/server/src/error-store.test.ts apps/server/src/log.test.ts apps/server/src/http-errors.test.ts apps/server/src/db/schema.test.ts apps/server/src/socket.robust.test.ts apps/server/src/rooms/manager.robust.test.ts apps/server/src/db-backup.test.ts apps/server/src/app.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/drizzle apps/server/src
git commit -m "feat(server): 64 stored server errors — migration 0047 adds server_error and problem_report; reportError feeds a second sink that masks emails, tokens, passwords and URL credentials, cuts stacks to 4 KB, groups repeats by fingerprint with a total and a 24-hour count, writes once per fingerprint every 5 s and never loops on its own failure; resolve with a log line"
```

---

### Задача 3. Сервер: скарги гравців і адмінські маршрути «Збоїв»

**Files:**
- Create: `apps/server/src/problem-store.ts`, `apps/server/src/problem-store.test.ts`, `apps/server/src/problem-routes.ts`, `apps/server/src/problem-routes.test.ts`, `apps/server/src/admin-problem-routes.ts`, `apps/server/src/admin-problem-routes.test.ts`.
- Modify: `apps/server/src/app.ts` (`registerProblemRoutes`), `apps/server/src/admin-routes.ts` (реєстрація), `apps/server/src/push.ts` (`PUSH_TTL.problem_reply = 604_800`, `NORMAL_URGENCY` + `problem_reply`).
- Test: `apps/server/src/admin-routes.test.ts`, `apps/server/src/push.test.ts`.

**Interfaces:**
- Consumes: задачі 1–2; `currentUser`, `logAction`, `subscriptionsOf`, `PushService.deliver/background`.
- Produces: `POST /api/problem-reports` → 201 `{ id }` / 400 / 429; `GET /api/me/problem-reports` → `MyProblemReport[]` / 401; `GET /api/admin/problems/badge`; `GET /api/admin/errors`, `POST /api/admin/errors/:id/resolve`; `GET /api/admin/problems`, `POST /api/admin/problems/:id/resolve`, `POST /api/admin/problems/:id/reply` → `{ pushed }` / 409 `problem_no_account` | `problem_replied`.

- [ ] **Step 1: Write the failing tests:**
  - `problem-routes.test.ts`:
    - `a guest and an account send reports with the page snapshot`: гість → 201, у базі `user_id null`, `from_account false`, `page.path` без `?…`; Оля → 201, `from_account true`; `GET /api/me/problem-reports` Олі → її одна, гість → 401.
    - `a guest gets 3 per hour, an account 5`: 4-та гостьова з тієї ж адреси → 429; Оля — 5 по 201, 6-та → 429.
    - `all guests together stop at 50 per hour`: 50 гостьових рядків у базі за годину → наступна 429 `problem_busy` (з іншої адреси, `trustProxy` + `x-forwarded-for`).
    - `bad input is 400`: текст 1001 символ, `screen: 'big'`.
  - `admin-problem-routes.test.ts` (`buildApp` з адміном і заглушкою `push: { publicKey, send }`, як `admin-broadcast-routes.test.ts`):
    - `errors list, filter and resolve`: два збої (`reportError` + `ctx.errors!.flush()`) → `GET /api/admin/errors` — 2, `badge.errors: 2`; `POST …/resolve` → у `?status=resolved` — 1, `badge.errors: 1`; невідомий uuid → 404, `'abc'` → 404.
    - `reports: who, resolve, reply by push`: скарги гостя, Олі (з підпискою) і Петра (видалено після скарги) → `who.kind` `guest` / `account` (`push: true`) / `deleted`; `reply` Олі «Виправили, дякуємо!» → `{ pushed: true }`, після `ctx.push.idle()` заглушка отримала `{ kind: 'problem_reply', reportId, text: 'Виправили, дякуємо!', locale }`, скарга `resolved`, журнал `problem_reply` з `targetUserId` Олі; друга відповідь → 409 `problem_replied`; відповідь гостю → 409 `problem_no_account`; `resolve` гостьової → журнал `problem_resolve`; `GET /api/me/problem-reports` Олі показує `reply`.
    - `a reply still comes to whoever switched admin announcements off` (`admin_push = false` у Олі → push усе одно пішов).
    - `no email anywhere`: тіла всіх `GET` без `@`.
  - `admin-routes.test.ts`: у `routes` — шість нових `/api/admin/errors*`, `/api/admin/problems*` маршрутів.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/problem-store.test.ts apps/server/src/problem-routes.test.ts apps/server/src/admin-problem-routes.test.ts apps/server/src/admin-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (скарги, адмінські маршрути).
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/problem-store.test.ts apps/server/src/problem-routes.test.ts apps/server/src/admin-problem-routes.test.ts apps/server/src/admin-routes.test.ts apps/server/src/push.test.ts apps/server/src/admin-broadcast-routes.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 64 problem reports and the errors admin routes — anyone sends «something is broken» with the page snapshot (guests 3 per hour, accounts 5, all guests 50), the admin lists errors and reports, marks them resolved and replies to an account by push, the author sees the reply; a badge count; every action logged, 404 to everyone else"
```

---

### Задача 4. Сервер: копія на вимогу, правило зберігання, маршрути «Копій»

**Files:**
- Create: `apps/server/src/admin-backup-routes.ts`, `apps/server/src/admin-backup-routes.test.ts`.
- Modify: `apps/server/src/db-backup.ts` (`expiredBackups`, `runNow`, `status`, `idle`), `apps/server/src/admin-routes.ts` (`AdminDeps.backups`, реєстрація), `apps/server/src/app.ts` (`AppOptions.backups`), `apps/server/src/main.ts` (створення `backups` до `buildApp`).
- Test: `apps/server/src/db-backup.test.ts`, `apps/server/src/admin-routes.test.ts`.

**Interfaces:**
- Consumes: задача 1; `dbBackups`, `writeBackup`, `parseBackupKey`, `fakeR2`, `FakeScheduler`, `logAction`.
- Produces: `DbBackups.runNow(): Promise<{ started: true } | { started: false; reason: 'busy' | 'recent'; nextAt?: string }>`, `DbBackups.status(): { running: boolean; last: BackupRun | null }`, `DbBackups.idle(): Promise<void>`; `GET /api/admin/backups` → `AdminBackups`; `POST /api/admin/backups` → 202 / 409 `backup_busy` | `{ error: 'backup_recent', nextAt }` / 503 `backup_off`.

- [ ] **Step 1: Write the failing tests:**
  - `db-backup.test.ts`:
    - `retention keeps the 12 newest and the newest of each of 12 weeks`: 12 щотижневих копій (тиждень 0…11) + 12 ручних за останню добу → `expiredBackups` не містить жодної щотижневої, крім тих, що старші за 12 тижнів; 30 щотижневих → видаляються 18 найстаріших (поведінка для самих щотижневих — як раніше).
    - `runNow takes a copy the same way as the weekly one`: `fakeR2` порожній → `runNow()` → `{ started: true }`, `status().running = true`; після `idle()` у кошику один ключ `backups/db/…-m00NN.jsonl.gz`, `status().last` — `{ by: 'admin', outcome: 'ok', key, bytes }`.
    - `runNow refuses within an hour, even after a restart`: копія 30 хв тому в кошику (новий `dbBackups`) → `{ started: false, reason: 'recent', nextAt: <час копії + 1 год> }`; через 61 хв → `started`.
    - `runNow while a copy runs is busy`: два `runNow()` поспіль → другий `busy`; два екземпляри `dbBackups` над однією базою → advisory-блокування дає одну копію (`last.outcome: 'locked'` в іншого).
    - `stop aborts a manual copy and leaves nothing half-written`.
  - `admin-backup-routes.test.ts` (`buildApp` з `backupList` і `backups` над `fakeR2`):
    - `lists backups newest first with size and level, skips foreign keys`: два ключі формату + `backups/db/readme.txt` → два рядки, новіший перший, `level` з ключа.
    - `takes a copy now, then says when the next one is allowed`: `POST` → 202 і журнал `backup_now`; після `idle()` `GET` → 3 рядки, `last.outcome: 'ok'`, `nextAt` ≈ +1 год; другий `POST` → 409 `backup_recent` з тим самим `nextAt`, журналу нема.
    - `off without scheduled backups`: без `backups` → `GET` `enabled: false`, `POST` → 503 `backup_off`; без `backupList` — `stored: false`.
    - `there is no restore route`: `POST /api/admin/backups/restore` від адміна → 404.
  - `admin-routes.test.ts`: у `routes` — `['GET', '/api/admin/backups']`, `['POST', '/api/admin/backups']`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/db-backup.test.ts apps/server/src/admin-backup-routes.test.ts apps/server/src/admin-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (копії). У `main.ts` перенести лише рядок створення `backups` вище `buildApp` і передати `backups: backups ?? undefined`; `start()`, журнальні рядки й `stop()` лишити на місцях.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/db-backup.test.ts apps/server/src/db-restore.test.ts apps/server/src/admin-backup-routes.test.ts apps/server/src/admin-routes.test.ts apps/server/scripts/scripts-parse.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 64 backups from the admin — «take a copy now» runs the same weekly backup in the background at most once an hour (counted from the store, so it survives restarts), only where scheduled backups are on; the list from R2 backups/db/ with size and migration level, the last attempt; retention keeps the 12 newest and one per week for 12 weeks; no restore route"
```

---

### Задача 5. Веб: сповіщення `problem_reply` у сервіс-воркері

**Files:**
- Modify: `apps/web/src/push/sw-handlers.ts`, `apps/web/src/push/push-text.ts`, `apps/web/src/push/push-strings.ts`, `apps/web/src/push/strings/{en,de,es,it,pl,ar}.json`, `apps/web/src/i18n.test.ts` (`ADDED_ERRORS_64_SW`).
- Test: `apps/web/src/push/sw-handlers.test.ts`, `apps/web/src/push/push-text.test.ts`, `apps/web/src/push/push-strings.test.ts`.

**Ключі (uk, `pushStrings`):** `pushProblemReplyTitle` «Відповідь на твоє повідомлення».

**Interfaces:**
- Consumes: push-вид `problem_reply` (задача 1).
- Produces: `isPushPayload` приймає `problem_reply`; `pushNotice` для нього.

- [ ] **Step 1: Write the failing tests:**
  - `push-text.test.ts` `a problem reply shows the admin's words and opens /report`: `{ kind: 'problem_reply', reportId: 'R', text: 'Виправили, дякуємо!', locale: 'en' }` → `{ title: <en-переклад>, body: 'Виправили, дякуємо!', url: '/report', tag: 'problem-R' }`; без `locale` — uk-заголовок.
  - `sw-handlers.test.ts`: `isPushPayload` — `problem_reply` з `text` → `true`, без `text` → `false`; `onPush` показує сповіщення з тегом `problem-R`.
  - `i18n.test.ts`: `ADDED_ERRORS_64_SW = ['pushProblemReplyTitle']` — у всіх шести `push/strings/*.json`, в умові `adds no uk keys beyond the agreed list`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/push apps/web/src/i18n.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (воркер).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/push apps/web/src/i18n.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/push apps/web/src/i18n.test.ts
git commit -m "feat(web): 64 problem reply notifications — the worker shows «a reply to your message» in the reader's language with the admin's text as written and opens /report; seven languages"
```

---

### Задача 6. Веб: сторінка «Повідомити про проблему» і посилання на неї

**Files:**
- Create: `apps/web/src/problems/ProblemReport.tsx`, `apps/web/src/problems/ProblemReport.test.tsx`, `apps/web/src/problems/ProblemLink.tsx`, `apps/web/src/problems/problem-page.ts`, `apps/web/src/problems/problem-page.test.ts`.
- Modify: `apps/web/src/AppRoutes.tsx` (`/report`), `apps/web/src/api.ts`, `apps/web/src/pages/Home.tsx`, `apps/web/src/pages/profile/ProfileSettings.tsx`, `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/screens/HostScreen.tsx`, стилі (файл, де `.menu-links`), `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,de,es,it,pl,ar}.json`, `apps/web/src/i18n.test.ts` (`ADDED_ERRORS_64`).
- Test: `apps/web/src/pages/Home.test.tsx`, `apps/web/src/pages/profile/subpages.test.tsx`.

**Ключі (uk):** `problemLink` «Повідомити про проблему», `problemTitle` «Щось не працює?», `problemLead` «Опиши, що сталося і що ти робив(-ла) перед тим. Ми подивимось.», `problemTextLabel` «Що сталося», `problemChars` «{used} з {max}», `problemAttach` «Додати відомості про сторінку», `problemAttachHint` «Адреса сторінки (без кодів доступу), браузер, розмір екрана, мова й тема.», `problemPagePath` «Сторінка: {path}», `problemPageBrowser` «Браузер: {browser}», `problemPageScreen` «Екран: {screen}», `problemPageLang` «Мова: {lang}», `problemPageTheme` «Тема: {theme}», `problemThemeLight` «світла», `problemThemeDark` «темна», `problemSend` «Надіслати», `problemSent` «Дякуємо! Ми отримали повідомлення.», `problemGuestHint` «Щоб отримати відповідь, увійди перед надсиланням.», `problemMine` «Мої повідомлення», `problemMineEmpty` «Повідомлень ще не було.», `problemOpen` «Відкрите», `problemResolved` «Вирішене», `problemReplyFrom` «Відповідь адміністратора: {text}», `err_problem_rate` «Забагато повідомлень. Спробуй пізніше.», `err_problem_busy` «Зараз забагато повідомлень. Спробуй за годину.».

**Interfaces:**
- Consumes: задачі 1, 3; `currentLocale`, `lightThemeOn`, `useAccount`, `errorText`, `formatDate`.
- Produces: `pageSnapshot(from: string): ProblemPage`; `ProblemLink({ className?, newTab? })`; `ProblemReport` (сторінка); `sendProblemReport`, `myProblemReports`.

- [ ] **Step 1: Write the failing tests:**
  - `problem-page.test.ts` `the snapshot has the path without query or hash, screen, language and theme`: `from = '/play/123456?x=1#tok'`, `innerWidth 360`, `innerHeight 740`, світла тема, мова `pl` → `{ path: '/play/123456', screen: '360x740', lang: 'pl', theme: 'light', browser: navigator.userAgent }`.
  - `ProblemReport.test.tsx` (`fetch` підмінений):
    - `a guest sends a report with the page snapshot`: `/report?from=/library` → видно «Сторінка: /library», «Тема: світла»; ввести «Не грає музика» → «Надіслати» → `POST /api/problem-reports` з `{ text: 'Не грає музика', page: { path: '/library', … } }` → «Дякуємо!…»; є «Щоб отримати відповідь, увійди…»; «Мої повідомлення» немає.
    - `without the snapshot the page is null`: зняти прапорець → тіло з `page: null`.
    - `an account sees its messages and the admin reply`: `GET /api/me/problem-reports` → «Вирішене», «Відповідь адміністратора: Виправили, дякуємо!».
    - `too many is a clear error`: 429 → «Забагато повідомлень…» (`role="alert"`); 1000 символів — лічильник «1000 з 1000», 1001-й не вводиться.
  - `Home.test.tsx`: гість бачить посилання «Повідомити про проблему» на `/report?from=%2F`. `subpages.test.tsx`: у налаштуваннях профілю — те саме посилання з `from=%2Fprofile%2Fsettings`.
  - `i18n.test.ts` `64 keys (errors, problems, backups) are in every locale`: `ADDED_ERRORS_64` (ключі цієї й задачі 7) — в uk і шести JSON зі збігом змінних; список — в умові `adds no uk keys beyond the agreed list`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/problems apps/web/src/pages/Home.test.tsx apps/web/src/pages/profile/subpages.test.tsx apps/web/src/i18n.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (веб: сторінка, посилання). У `PlayerScreen`/`HostScreen` — лише `<ProblemLink newTab className="problem-link game-problem-link" />` останнім елементом екрана, шапка не змінюється.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/problems apps/web/src/pages apps/web/src/screens apps/web/src/i18n.test.ts apps/web/src/source-scan.test.ts && pnpm exec tsc -p apps/web`. Expected: PASS (крім можливих `adminLog_*` до задачі 7 у `tsc`, див. «Порядок збирання»).
- [ ] **Step 5: Commit**
```bash
git add apps/web/src
git commit -m "feat(web): 64 «report a problem» page — a text up to 1000 with an optional page snapshot (path without codes, browser, screen, language, theme), for guests too; accounts see their messages and the admin reply; the link on the home page, in profile settings and at the bottom of the player and host screens in a new tab; seven languages"
```

---

### Задача 7. Веб: вкладки «Збої» (з бейджем) і «Копії», журнал

**Files:**
- Create: `apps/web/src/admin/AdminErrors.tsx`, `apps/web/src/admin/AdminErrors.test.tsx`, `apps/web/src/admin/AdminBackups.tsx`, `apps/web/src/admin/AdminBackups.test.tsx`.
- Modify: `apps/web/src/admin/Admin.tsx` (`TABS`, `<Routes>`, бейдж), `apps/web/src/admin/admin-api.ts`, `apps/web/src/admin/admin-text.ts`, стилі адмінки (файл, де `.admin-broadcast`), `apps/web/src/i18n.ts`, шість JSON, `apps/web/src/i18n.test.ts` (доповнити `ADDED_ERRORS_64`).
- Test: `apps/web/src/admin/Admin.test.tsx`, `apps/web/src/admin/admin-text.test.ts`.

**Ключі (uk):**
- Вкладки: `adminTabErrors` «Збої», `adminTabErrorsBadge` «Збої, нових: {count}», `adminTabBackups` «Копії».
- Збої: `adminErrorsServer` «Збої сервера», `adminErrorsReports` «Скарги гравців», `adminErrorsNew` «Нові», `adminErrorsResolvedFilter` «Вирішені», `adminErrorsEmpty` «Збоїв немає.», `adminErrorWhere` «Де: {where}», `adminErrorCounts` «Повторів: {count}, за добу: {day}», `adminErrorTimes` «Уперше: {first}, востаннє: {last}», `adminErrorStack` «Стек», `adminErrorResolve` «Позначити як вирішене», `adminErrorResolvedBy` «Вирішив(-ла) {admin} {time}».
- Скарги: `adminProblemsOpen` «Відкриті», `adminProblemsEmpty` «Скарг немає.», `adminProblemGuest` «Гість», `adminProblemDeleted` «Акаунт видалено», `adminProblemNoPage` «Без відомостей про сторінку», `adminProblemResolve` «Вирішено», `adminProblemReply` «Відповісти», `adminProblemReplyLabel` «Відповідь автору», `adminProblemReplySend` «Надіслати відповідь», `adminProblemReplyNoPush` «Сповіщення в автора не ввімкнено — відповідь буде на сторінці «Мої повідомлення».», `adminProblemReplied` «Відповідь: {text}», `err_problem_no_account` «Відповісти можна лише автору з акаунтом.», `err_problem_replied` «На цю скаргу вже відповіли.».
- Копії: `adminBackupsLatest` «Остання копія: {date}, {size}», `adminBackupsNone` «Копій ще немає.», `adminBackupsOff` «Копії на цьому сервері вимкнені (лише продакшен або DB_BACKUP=on).», `adminBackupsNoStore` «Сховище копій не налаштоване.», `adminBackupsListError` «Не вдалося прочитати список копій.», `adminBackupsNow` «Зробити копію зараз», `adminBackupsNowConfirm` «Зняти копію бази зараз? Це займе до кількох хвилин; ігри не зупиняться.», `adminBackupsRunning` «Копія знімається…», `adminBackupsNextAt` «Наступну копію можна о {time}.», `adminBackupsLastOk` «Остання спроба: вдалася {date} ({who}), {size}», `adminBackupsLastFailed` «Остання спроба: не вдалася {date} ({who}) — подробиці у вкладці «Збої».», `adminBackupsLastLocked` «Остання спроба {date}: копію вже знімав інший екземпляр сервера.», `adminBackupsBySchedule` «за розкладом», `adminBackupsByAdmin` «вручну», `adminBackupsLevel` «міграцій: {level}», `adminBackupsCopyCommand` «Команда відновлення», `adminBackupsCopied` «Команду скопійовано.», `adminBackupsRestoreTitle` «Як відновити», `adminBackupsRestoreLead` «З адмінки відновлення немає — це надто небезпечно. Власник відновлює з командного рядка:», `adminBackupsRestoreStep1` «Створи порожню базу й вкажи її в DATABASE_URL (разом з R2_* для читання копій).», `adminBackupsRestoreStep2` «Подивись копії або візьми найновішу:», `adminBackupsRestoreStep3` «Віднови вибрану копію (непорожню базу команда не чіпає без --force):», `adminBackupsRestoreStep4` «Після відновлення перезапусти веб-сервіс.», `err_backup_recent` «Не частіше однієї копії на годину.», `err_backup_busy` «Копія вже знімається.», `err_backup_off` «Копії на цьому сервері вимкнені.».
- Журнал: `adminLog_server_error_resolve` «{admin} позначив(-ла) збій «{title}» як вирішений», `adminLog_problem_resolve` «{admin} закрив(-ла) скаргу «{text}»», `adminLog_problem_reply` «{admin} відповів(-ла) {target} на скаргу: «{text}»», `adminLog_backup_now` «{admin} зробив(-ла) копію бази вручну».

**Interfaces:**
- Consumes: задачі 1, 3, 4, 6; `useAdminData`, `errorText`, `formatDate`, `timeText`, `viewerZone`, `bytesText`, `BACKUP_RESTORE_COMMANDS`.
- Produces: `AdminErrors`, `AdminBackups` (компоненти); `adminProblemsBadge`, `adminErrors`, `resolveServerError`, `adminProblems`, `resolveProblem`, `replyProblem`, `adminBackups`, `startBackup`.

- [ ] **Step 1: Write the failing tests:**
  - `AdminErrors.test.tsx` (`fetch` підмінений):
    - `server errors: counts, times, the stack, resolve`: рядок `{ where: 'http', event: 'GET /api/x', message: 'boom [email]', count: 7, dayCount: 3 }` → «Де: http», «Повторів: 7, за добу: 3», `<details>` «Стек»; «Позначити як вирішене» → `POST /api/admin/errors/<id>/resolve` → рядок зникає; «Вирішені» → `GET /api/admin/errors?status=resolved&page=1`.
    - `player reports: guest, account with page info, deleted`: «Гість», нік-посилання на `/admin/users/<id>`, «Акаунт видалено»; «Сторінка: /play/123456», «Екран: 360x740»; у гостя кнопки «Відповісти» немає.
    - `reply to an account`: «Відповісти» → «Виправили, дякуємо!» → «Надіслати відповідь» → `POST …/reply { text }`; `push: false` → підказка «Сповіщення в автора не ввімкнено…»; 409 `problem_replied` → «На цю скаргу вже відповіли.».
  - `AdminBackups.test.tsx`:
    - `lists copies and shows how to restore`: два рядки — дата, `bytesText`, «міграцій: 47»; блок «Як відновити» з `pnpm --filter @quiz/server db:restore --r2-list`; «Команда відновлення» → `navigator.clipboard.writeText('pnpm --filter @quiz/server db:restore --r2 backups/db/…')`; жодної кнопки «Відновити».
    - `take a copy now: confirm, running, then the next time`: «Зробити копію зараз» → `confirm` → `POST /api/admin/backups` → «Копія знімається…» (наступний `GET` з `running: true`), далі `running: false`, `nextAt` → кнопка `disabled` і «Наступну копію можна о HH:MM.».
    - `off and no store`: `enabled: false` → «Копії на цьому сервері вимкнені…», кнопка `disabled`; `stored: false` → «Сховище копій не налаштоване.».
    - `the last failed attempt points to the errors tab`.
  - `Admin.test.tsx`: вкладки «Збої» (`/admin/errors`) і «Копії» (`/admin/backups`); бейдж `{ errors: 2, reports: 1 }` → на «Збоях» «3» з `aria-label` «Збої, нових: 3»; `{ 0, 0 }` — бейджа немає.
  - `admin-text.test.ts`: `logLine` для чотирьох нових видів, напр. `problem_reply` з `{ text: 'Виправили, дякуємо!' }` і ціллю «Оля» → «Адмін відповів(-ла) Оля на скаргу: «Виправили, дякуємо!»».
  - `i18n.test.ts` — ключі цієї задачі в `ADDED_ERRORS_64` (тест із задачі 6).
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/admin apps/web/src/i18n.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (веб: вкладки, бейдж). Порядок `TABS`: … «Журнал», «Збої», «Копії», «Бот» (вкладки 63 — за його планом).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src
git commit -m "feat(web): 64 admin «Errors» and «Backups» tabs — server errors grouped with repeats, the day count and the stack, new and resolved, a badge of new errors and open reports; player reports with who, where and the page snapshot, resolve and reply; backups list with size and level, «take a copy now» with the hourly limit, the last attempt and restore instructions with db:restore commands, no restore button; log lines; seven languages"
```

---

### Задача 8. Наскрізний сценарій і кадри (`part64-errors-backups.e2e.ts`), повтор part 53 / 59

**Files:**
- Create: `apps/server/e2e/part64-errors-backups.e2e.ts` (сервер з адміном, заглушкою push і копіями над `fakeR2` — `const r2 = fakeR2(); const store = r2BackupStore(r2.settings); flags.restarting = true; await ctx.shutdown(); await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: 'admin64@example.com' }), push: { publicKey, send }, backupList: () => store.list(), backups: dbBackups({ db, store, pauseMs: 0 }) }); flags.restarting = false`, у `finally` — `relisten()`; `send` складає `outbox`, як у частині 59; телефони 360 × 740, світла тема).

**Сценарій** (люди: адмін «Адмін 64»; Оля — акаунт з підпискою `https://fcm.googleapis.com/fcm/send/e2e-olya64`; гість — окремий контекст без входу):
`it('part 64: errors, problem reports and backups — a stored server error is masked, grouped and resolved with a badge; a guest and an account report a problem, the admin replies by push and the author sees it; a copy now, then the hourly limit; restore instructions only; a non-admin gets 404; phone 360 px, light theme')`:
1. У процесі тесту двічі `reportError(new Error('e2e64 no user olya@example.com token=abc123def'), { where: 'e2e64' })`, `await ctx.errors!.flush()`.
2. Гість на `/` → «Повідомити про проблему» → `/report?from=%2F`; «Не відкривається бібліотека» → «Надіслати» → «Дякуємо!…»; кадр `problem64-guest-360`, `expectNoSideScroll`. Ще три `POST /api/problem-reports` з контексту гостя → третій з них (4-й загалом) — 429.
3. Оля на `/profile/settings` → посилання → `/report?from=%2Fprofile%2Fsettings`; «Таблиця не оновлюється» → надіслати; «Мої повідомлення» — «Відкрите».
4. Адмін на `/admin`: вкладка «Збої» з бейджем «3» (1 збій + 2 скарги); `/admin/errors` — «Де: e2e64», «Повторів: 2», у тексті сторінки немає `olya@example.com` і `abc123def`, є `[email]`; кадр `errors64-list-360`; «Позначити як вирішене» → у «Нових» порожньо, у «Вирішених» — рядок.
5. «Скарги гравців»: «Гість» без «Відповісти»; Оля — «Сторінка: /profile/settings», «Екран: 360x740», «Тема: світла»; «Відповісти» «Виправили, дякуємо!» → «Надіслати відповідь»; `await ctx.push!.idle()` → в `outbox` рівно один `problem_reply` на ендпоінт Олі; гостьову — «Вирішено»; кадр `problems64-list-360`; бейдж зник.
6. Оля перезавантажує `/report` → «Вирішене», «Відповідь адміністратора: Виправили, дякуємо!».
7. `/admin/backups`: «Копій ще немає.», блок «Як відновити» з `db:restore`, кнопки «Відновити» немає; «Зробити копію зараз» (`page.once('dialog', d => d.accept())`) → «Копія знімається…» → (оновлення) рядок з розміром і «міграцій: 47», «Остання спроба: вдалася … (вручну)», кнопка вимкнена з «Наступну копію можна о …»; у `r2.objects` — один ключ `backups/db/…`; прямий `POST /api/admin/backups` → 409 `backup_recent`; кадр `backups64-360`.
8. `/admin/log` — рядки «Адмін 64 позначив(-ла) збій «e2e64: …» як вирішений», «… відповів(-ла) Оля на скаргу: «Виправили, дякуємо!»», «… закрив(-ла) скаргу «Не відкривається бібліотека»», «… зробив(-ла) копію бази вручну».
9. Оля (не адмін) і гість: `GET /api/admin/errors`, `GET /api/admin/problems`, `GET /api/admin/problems/badge`, `POST /api/admin/backups`, `POST /api/admin/backups/restore` → 404; `/admin/errors` → перехід на `/`. JSON вкладок без `@`.

- [ ] **Step 1: Write the scenario.** Помічники — з `helpers/common.ts` (`open`, `register`, `expectNoSideScroll`), заглушка push і підписка — з `part59-push-broadcast.e2e.ts`, `relisten` з опціями — як у `part53-admin-home.e2e.ts` ~48.
- [ ] **Step 2: Run** `pnpm build`, потім (після завершення збирання) `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 64"` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 3: Run** по одному, після part 64, не одночасно: `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 53"`, потім `-t "part 59"`. Expected: PASS (блок «Стан», перенесення `backups` у `main.ts`/`app.ts` і новий push-вид не зламали попереднього).
- [ ] **Step 4: Переглянути кадри:** на 360 px картки збоїв і скарг, стек у `<details>`, форма скарги, список копій і команди `db:restore` — без бічного скролу (довгі ключі й команди переносяться), текст читається в світлій темі, бейдж не розсуває рядок вкладок.
- [ ] **Step 5: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 64 — a server error is stored masked, grouped and resolved with a tab badge; a guest and an account report a problem with the page snapshot, the guest limit answers 429, the admin replies by push and the author sees it; a copy now into a fake R2, then the hourly limit; restore instructions only; log lines; a non-admin gets 404; 360 px, light theme"
```

---

## Розбіжності зі специфікацією (рішення плану)

1. **Збої зберігаються через другий слот `setErrorSink`**, не через наявний `setErrorReporter`: той лишається «для Sentry» і для шпигунів тестів. Запис — буфером раз на 5 с і одним `upsert` на відбиток, а не на кожен виклик: шторм однакових збоїв не перетворюється на шторм запитів. Збій запису — лише `log.warn`, без `reportError`.
2. **«Кількість повторів за 24 год»** — два лічильники: усього (`count`) і за поточну добу (`dayCount`, ковзне вікно від першого повтору доби). На кожен відбиток — один рядок «нове»; повтор після «вирішено» відкриває новий рядок (регресію видно). Рядки, що не повторювались 30 днів, видаляються.
3. **Маскування — до бази, не на показі:** email, `Bearer`, `token=`/`password=`/`secret=`…, облікові дані в URL, довгі рядки-ключі (≥ 32 символів) → `[email]`/`[hidden]`; uuid і коди кімнат лишаються. `err.detail/params/query` (там значення рядків бази) не зберігаються зовсім. Стек — до 4096 **байтів**.
4. **Кнопка «Повідомити про проблему» — не в нижньому меню:** на 360 px там уже 5–6 пунктів. Вона є на головній (бачать усі, зокрема гості), у налаштуваннях профілю й унизу екранів гравця й ведучого (у новій вкладці, щоб не рвати сокет гри); форма — окрема сторінка `/report`. Екрана для телевізора (`/stage`) немає — там ніхто не вводить текст.
5. **Знімок сторінки — шлях без `?` і `#`** (там бувають токени: `/stage/…#token`), браузер (до 300 символів), розмір вікна, мова, тема; прапорець «Додати відомості» типово ввімкнено, його можна зняти. IP скарги не зберігається.
6. **Обмеження частоти:** гість — 3 на годину з адреси, акаунт — 5 на годину, усі гості разом — 50 на годину (захист від зміни адрес); відповідь — 429.
7. **Відповідь автору — push і «Мої повідомлення» на `/report`, не стрічка.** Стрічка показує мої події друзям і рахує бейдж лише чужих; приватна відповідь адміна там або протекла б друзям, або вимагала б окремих правил видимості (і конфліктувала б з модерацією стрічки плану 63). Відповісти можна один раз і лише акаунту; відповідь закриває скаргу; приходить і тим, хто вимкнув «Оголошення від адміністраторів» (це особисте, не розсилка).
8. **Копії — окрема вкладка «Копії»**, не розділ «Статистики»: там уже графіки й «Стан»; блок «Стан» (53) лишається як був.
9. **«Зробити копію зараз» — лише там, де ввімкнено щотижневі** (продакшен або `DB_BACKUP=on`, і є R2); інакше 503 `backup_off` і підказка. Ліміт «раз на годину» рахується від найновішої копії в сховищі (переживає перезапуск і діє на всіх адмінів). Копія йде у фоні (202), вкладка оновлюється, поки вона знімається; «стан останньої» — остання спроба цього процесу (розклад чи вручну) плюс найновіша копія зі списку. Ручна копія зсуває тижневий відлік — механізм той самий.
10. **Правило зберігання змінено:** 12 найновіших **і** найновіша з кожного з 12 тижнів — інакше 12 ручних копій за день стерли б тримісячну історію. Для самих щотижневих копій нічого не змінюється.
11. **Відновлення з адмінки немає зовсім** — ні маршруту, ні кнопки; вкладка показує кроки й команди `db:restore` (`--r2-list`, `--r2-latest`, `--r2 <ключ>`), а біля кожної копії — «Команда відновлення» в буфер обміну.
12. **Журнал:** `server_error_resolve`, `problem_resolve`, `problem_reply`, `backup_now`; відмови (ліміт, «вже вирішено») рядків не пишуть. Скарги гравців — не дії адміна, у журнал не йдуть.
