# План 53: адмінка — живі ігри, графіки й стан, оголошення-банер; головна — дві кнопки й «Продовжити гру» (39, перша черга, частина 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** План не торкається `GameState`, `SavedRoom` і зрізів гри. Нове в кімнаті — лише поле пам'яті `Room.actedAt` (у знімок не йде). Рядка в коментар `READABLE_STATE_VERSIONS` не треба. Якщо виконавцю знадобиться змінити стан гри чи знімок кімнати — **зупинитися й спитати контролера** (підвищення обриває живі ігри; власника питають перед пушем).

> **Звірка з кодом.** План спирається на `main` 2026-11-19 (`4aafb5f9`, після плану 52 і специфікації 39/2):
> - адмінка, сервер: `apps/server/src/admin-routes.ts` (`registerAdminRoutes`, `AdminDeps`, ворота `gate`/`adminOf` — не-адміну 404 як невідомий маршрут, `read` 120/хв, `write` 30/хв, `GET /api/admin/stats` рахує `live` як `manager.rooms().filter(phase !== 'finished')`), `admin-store.ts` (`adminStats`, `kyivMidnight`, `adminLog`), `admin.ts` (`isAdmin`), журнал — `bans.ts` `logAction(tx, { adminId, kind, targetUserId, details, now })`, таблиця `adminAction` (`db/schema.ts` ~695, `kind` — `text`, нові види без міграції); тести `admin-routes.test.ts` (`describe('hiding the admin panel (Review Focus 3)')` ~90 зі списком `routes`, `person(name, verified)`, `lastLog()`, `joinAndStart(code)`);
> - спільне: `packages/shared/src/admin.ts` (`ADMIN_ACTION_KINDS`, `AdminStats`, `AdminLogDetails`, `AdminLogEntry`), `packages/shared/src/text.ts` (`isStorable`, `UNSTORABLE`), `calendar.ts` (`CalendarEvent`: `state`, `mine`, `myRequest`, `startsAt`, `host`, `joinCode`), `history.ts` (`GameSummary.saved?: SavedInfo`, `GameStatus`);
> - кімнати: `apps/server/src/rooms/manager.ts` (`interface Room` ~223: `code`, `stageToken`, `hostUserId`, `connections: Map<'host'|'stage'|playerId, number>`, `lobby.openedAt`, `challenge`; дві точки створення кімнати ~851 і ~929; `rooms()` ~997; `closeHostedBy(userId)` ~1005: лобі → `close(room)` (подія `closed`), гра йде → `apply(room, end(state, now))`, finished — без змін; `frozen`; `commit(room, state, at)` ~2716; `private close` ~2883); тест-зразок `rooms/manager.ban.test.ts`;
> - копії бази: `apps/server/src/db-backup.ts` (`BACKUP_PREFIX = 'backups/db/'`, `parseBackupKey`, `backupsNewestFirst` — приватна, `r2BackupStore(settings).list()`), `storage/r2-objects.ts` (`StoredObject { key, size, lastModified }`), `main.ts` ~152 (`r2`, `backups`), `app.ts` (`AppOptions`, `buildApp`, ~140 `registerAdminRoutes`);
> - база: остання міграція — `apps/server/drizzle/0040_library.sql` (журнал `meta/_journal.json`, idx 40); генерація — `pnpm --filter @quiz/server exec drizzle-kit generate --name <назва>`, перший рядок SQL — коментар українською; тест міграції — `apps/server/src/db/schema.test.ts` (`createTestDbUpTo('0040_library')` → `migrateRest()`, як `migration 0040 lays the library tables…` ~761); `db-backup.ts` бере таблиці з `information_schema` (нова таблиця потрапляє в копію сама);
> - веб, адмінка: `apps/web/src/admin/Admin.tsx` (`TABS`, маршрути), `AdminStats.tsx`, `admin-api.ts`, `useAdminData.ts` (`reload` дає `loading` — для автооновлення треба «тримати старе»), `admin-text.ts` (`logLine` передає лише `admin`, `target`, `title`), тест `Admin.test.tsx` (`shows the stats and the five section links`); клас `.sr-only` (`styles.css` ~7516), `.admin-tabs` (~17060);
> - веб, решта: `menu/WithMenu.tsx` (обгортка всіх сторінок, крім `/play/:code`, `/host/:code`, `/stage/:code` — `AppRoutes.tsx` ~91–93), `pages/Home.tsx` (`JoinForm`, `StartMenu` з 8 плитками, `RunningGameBanner`), `host-game.tsx` (`useRunningGame` → лише код; `RunningGameBanner` також на `Quizzes.tsx` ~109), `pages/History.tsx` (`SavedGame.resume` ~48 — `continueGame` → `saveLastGame` → `savePlayer`/`saveAuthor` або `saveHost` → перехід), `api.ts` (`checkCode` → `CodeInfo { phase, title, locked, late }`, `listGames`, `getCalendar`), `calendar/calendar-time.ts` (`viewerZone`, `dayHeading`, `timeText`, `localInputToIso`), `storage.ts` (`read`/`write`, ключі `quiz:*`);
> - тексти: `apps/web/src/i18n.ts` (адмінка ~4194–4290; `startCreate: 'Створити гру'` ~2336, `startJoin: 'Доєднатись до гри'`, `continueGame: 'Продовжити'`), `apps/web/src/locales/{en,de,es,it,pl,ar}.json`, `i18n.test.ts` (найновіший список — `ADDED_LEVELS_49` ~210, перевірка ~453, умова `adds no uk keys beyond the agreed list` ~616);
> - e2e: `apps/server/e2e/helpers/setup.ts` (`relisten(extra: Partial<AppOptions>)`, `flags.restarting`, `ctx.shutdown()`), `helpers/common.ts` (`homeCodeField` ~75 шукає кнопку «Доєднатись до гри»), зразок адміна — `part47-library.e2e.ts` (~79–110: `relisten({ adminEmails: adminEmails({ ADMIN_EMAILS }) })`, `emailVerified`), кнопку «Доєднатись до гри» також шукають `part22-24-l10n-menus-profile.e2e.ts` (~600–647, 868, `part 24a`) і `part32-weak-network.e2e.ts` (~108, 143).
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

**Мета:** адмін бачить живі кімнати й може відкрити сцену чи закрити гру (з журналом); у «Статистиці» — графіки за 30 днів із таблицями для читачів екрана й блок «Стан» (остання копія бази, час роботи, пам'ять, кімнати, з'єднання) з кешем на сервері; адмін публікує одне оголошення-банер (до 200 символів, посилання й строк необов'язкові), яке бачать усі поза грою й можуть закрити на пристрої; головна отримує дві великі кнопки й картку «Продовжити гру» / «Найближча подія».

**Архітектура:** сервер — три нові модулі поруч з адмінкою: `admin-live.ts` (зріз кімнат менеджера без email), `admin-charts.ts` (два SQL-запити за 43 дні, решта — чисті функції над днями Києва) і `announcement-store.ts` (одна нова таблиця `announcement`, активне — найновіше незняте й непротерміноване); кеш — малий `ttl-cache.ts` (10 хв для графіків і списку копій, 60 с для публічного оголошення, скидається записом). Маршрути адміна — у `admin-routes.ts` за тими самими воротами; публічний `GET /api/announcement` — окремий файл. Веб — нові вкладки адмінки «Живі ігри» й «Оголошення», графіки SVG без бібліотек у «Статистиці», банер у `WithMenu` (тож його немає на `/play`, `/host`, `/stage`), головна — `HomeActions` і картка, яку вибирає чиста функція `pickNextUp`.

**Технології:** TypeScript, zod 4, Fastify + `@fastify/rate-limit`, drizzle (Postgres), vitest (проєкти `shared`/`server`/`web`), React 19 + Testing Library, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-19-admin-home-batch-design.md` (39, перша черга, частина 2); основа адмінки — `docs/superpowers/specs/2026-11-01-admin-panel-design.md`.

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22**; `GameState`, `SavedRoom`, зрізи гри — без змін.
- **Міграція — лише додавання:** одна нова `0041_announcement` з одним `CREATE TABLE "announcement"` і його зовнішнім ключем; жодного `ALTER`/`DROP` наявних таблиць. Нові види журналу (`game_close`, `announcement_set`, `announcement_clear`) — лише значення в `text`-колонці, без міграції.
- **Адмінка — лише адмінам:** кожен новий `/api/admin/*` іде через `read`/`write` (ворота `gate`), і кожен додано до списку `routes` у тесті `hiding the admin panel (Review Focus 3)`. У відповідях адмінки про живі ігри — лише ніки, **жодного email** (тест шукає `@` у JSON).
- Усі тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`. Нові uk-ключі — у новому списку `ADDED_ADMIN_HOME_53` (`i18n.test.ts`) — в умову `adds no uk keys beyond the agreed list` і в перевірку наявності в усіх локалях (як `ADDED_LEVELS_49`). Текст оголошення не перекладається (як написав адмін). ru немає.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`).
- **Нічого, пов'язаного з росією**, — у прикладах, фікстурах, текстах оголошень у тестах, e2e.
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|server|web> --maxWorkers=2 [шляхи]`; типи — у задачах 1–4 `pnpm exec tsc -p packages/shared && pnpm exec tsc -p apps/server`, з задачі 5 — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів vitest).
- Файли правити лише Edit/Write чи `sed`; **python3 на цій машині — порожня заглушка, ним нічого не правити й не генерувати**; після коміту перевірити `git show --stat`.
- Робоче дерево — лише в `C:\ClaudeCode\quiz\.superpowers\worktrees\plan53`; жодних файлів поза `C:\ClaudeCode\quiz` (тимчасові — у `.superpowers` чи scratchpad сесії).
- e2e: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 53"`; телефон 360 px, світла тема (`quiz:theme = light`, `is-light` на `<html>`); після — окремо, по одному, `-t "part 24a"`, `-t "part 32"`, `-t "part 21a"`.
- Таймер кожного запитання у фікстурах і e2e ≥ 25 с.

## Рішення плану (там, де специфікація мовчить)

**Спільне (`packages/shared`)**
- `admin.ts`: `ADMIN_ACTION_KINDS` + `'game_close'`, `'announcement_set'`, `'announcement_clear'`; `AdminLogDetails.code?: string` (код кімнати). Константи: `ADMIN_LIVE_REFRESH_MS = 10_000`, `ADMIN_CHART_DAYS = 30`, `ADMIN_CACHE_MS = 600_000`.
- Типи (у `admin.ts`):
  ```ts
  export type AdminLiveStatus = 'lobby' | 'starting' | 'playing' | 'paused' | 'finished';
  export interface AdminLiveRoom {
    code: string; title: string;
    /** Нік акаунта ведучого (для автопілота — автора); null — гра без акаунта. Email не йде ніколи. */
    host: string | null; autopilot: boolean;
    players: { online: number; total: number };
    status: AdminLiveStatus; round: { number: number; of: number } | null;
    openedAt: string; actedAt: string;
    /** /stage/{code}#{stageToken} — як посилання на сцену в пульті. */
    stageUrl: string;
  }
  export interface AdminLiveList { rooms: AdminLiveRoom[]; at: string }
  export interface AdminChartDay { day: string; players: number; games: number; finished: number; completion: number | null; returns: number | null }
  export interface AdminCharts { days: AdminChartDay[]; computedAt: string }
  export type AdminBackupInfo = { state: 'ok'; at: string; bytes: number } | { state: 'none' | 'off' | 'error' };
  export interface AdminHealth { backup: AdminBackupInfo; uptimeSec: number; memory: { rss: number; heapUsed: number }; rooms: number; connections: number; checkedAt: string }
  ```
- Новий `announcement.ts` (експорт з `index.ts`): `ANNOUNCEMENT_TEXT_MAX = 200`, `ANNOUNCEMENT_URL_MAX = 500`, `ANNOUNCEMENT_MAX_DAYS = 365`; `interface Announcement { id: string; text: string; url: string | null; expiresAt: string | null; createdAt: string }`; `isAnnouncementUrl(url: string): boolean` — `https?://` без пробілів або шлях сайту з `/` (не `//`); `announcementInputSchema = z.object({ text: z.string().trim().min(1).max(ANNOUNCEMENT_TEXT_MAX).refine(isStorable, UNSTORABLE), url: z.string().trim().max(ANNOUNCEMENT_URL_MAX).nullable().default(null)` (порожній рядок → `null`, інакше `isAnnouncementUrl`)`, expiresAt: z.string().max(40)` (ISO з поясом, як `calendarInputSchema.startsAt`)`.nullable().default(null) }).strict()`. Межі строку (у майбутньому, не далі `ANNOUNCEMENT_MAX_DAYS`) перевіряє сервер (потрібне now) → `400 { error: 'announcement_expiry' }`.

**Живі ігри (сервер)**
- `Room.actedAt: number` — «мить останнього commit (53, «Живі ігри» адмінки); лише в пам'яті, у знімок не йде; після підняття — мить підняття». Ставиться в обох точках створення (`this.now()`) і в `commit(room, state, at)` (`room.actedAt = at`).
- `RoomManager.closeByAdmin(code: string): 'closed' | 'ended' | 'finished' | 'not_found'` — та сама логіка, що в `closeHostedBy` (лобі → `close`, гра йде → `end` рушія, тож гравці бачать звичайний кінець гри), винесена в приватне `shut(room): boolean`, яким користуються обидва. `RoomManager.connectionCount(): number` — сума всіх значень `room.connections` усіх кімнат.
- `admin-live.ts`: `liveStatus(state: GameState): { status: AdminLiveStatus; round: AdminLiveRoom['round'] }` — `lobby` → `lobby`; `finished` → `finished`; `roundIndex < 0` → `starting`; інакше `paused`/`playing` з `round: { number: roundIndex + 1, of: state.quiz.rounds.length }` (і на паузі). `liveRooms(db: Db, rooms: Room[], now: Date): Promise<AdminLiveList>` — ніки одним запитом `profile` за `inArray(userId, …)` (немає рядка → `''`); `online` — гравці стану з `connections.get(id) > 0`; порядок — незавершені перед `finished`, далі новіші `openedAt` першими.
- Маршрути: `GET /api/admin/live` (`read`); `POST /api/admin/live/:code/close` (`write`): код не `/^\d{6}$/` → 404; `manager.frozen` → `503 { error: 'restarting' }`; немає кімнати → 404; `finished` → `409 { error: 'game_finished' }`; інакше закрити й `logAction(db, { kind: 'game_close', targetUserId: room.hostUserId, details: { title: state.quiz.title, code }, … })` → 204. Знімок `title`/`hostUserId` береться до закриття.
- «Відкрити сцену» — звичайне посилання на сцену з токеном (адмін стає ще однією сценою кімнати; гри це не змінює).

**Графіки й стан (сервер)**
- Дні — за Europe/Kyiv (`kyivDay`, `kyivMidnight`), 30 днів до сьогодні включно, старіші першими. День гри — `to_char(game.started_at at time zone 'Europe/Kyiv', 'YYYY-MM-DD')`.
- `players` — різні `participant.user_id` (не null) в іграх, що почалися того дня (будь-який статус; гості без акаунта не рахуються); `games` — ігри, що почалися того дня; `finished` — з них `status = 'finished'`; `completion = round(100 · finished / games)`, `null` при `games = 0`.
- **`returns` (рішення будівничого):** для дня D: `P` — акаунти, що грали в дні D−13…D−7, `W` — у дні D−6…D; `returns = round(100 · |P ∩ W| / |P|)`, `null` при `|P| = 0`. Тобто «яка частка торішньотижневих гравців повернулася за останні 7 днів». Тому другий запит бере 43 дні.
- `admin-charts.ts`: `kyivDayList(now: Date, count: number): string[]`, `shiftDay(day: string, delta: number): string` (календарна арифметика на `Date.UTC`, без годин — перехід часу не збиває), `weeklyReturns(byDay: ReadonlyMap<string, ReadonlySet<string>>, day: string): number | null`, `adminCharts(db: Db, now: Date): Promise<AdminCharts>`.
- `ttl-cache.ts`: `ttlCache<T>(load: () => Promise<T>, ttlMs: number, clock: () => number): { get(): Promise<T>; clear(): void }` — один запит на всіх, хто чекає; збій не кешується.
- Стан: `AppOptions.backupList?: () => Promise<StoredObject[]>` → `AdminDeps.backupList`; `main.ts` дає `r2 !== null ? () => r2BackupStore(r2).list() : undefined`. `db-backup.ts`: `latestBackup(objects: StoredObject[]): StoredObject | null` (через наявну `backupsNewestFirst`). `backup`: немає `backupList` → `off`; список порожній → `none`; збій → `error`; інакше `ok` з `at` (`parseBackupKey(key).at`) і `bytes` (`size`). Список копій і графіки — через `ttlCache(…, ADMIN_CACHE_MS)`; `uptimeSec = Math.floor(process.uptime())`, `memory` з `process.memoryUsage()`, `rooms` — як `live` у `/stats`, `connections = manager.connectionCount()` — щоразу свіжі (дешево). Маршрути `GET /api/admin/charts`, `GET /api/admin/health` (`read`).

**Оголошення (сервер)**
- Таблиця `announcement`: `id uuid pk default gen_random_uuid()`, `text text not null`, `url text`, `expires_at timestamptz`, `created_by text references user(id) on delete set null`, `created_at timestamptz not null`, `cleared_at timestamptz`. Активне — найновіше за `created_at` з `cleared_at is null and (expires_at is null or expires_at > now)`.
- `announcement-store.ts`: `activeAnnouncement(db, now): Promise<Announcement | null>`; `setAnnouncement(db, { adminId, input, now }): Promise<Announcement>` — транзакція: усім незнятим `cleared_at = now`, вставка нового рядка, `logAction(tx, { kind: 'announcement_set', targetUserId: null, details: { text } })`; `clearAnnouncement(db, { adminId, now }): Promise<boolean>` — знімає незняті; якщо серед них було активне — `logAction('announcement_clear', details: { text })` і `true`. **Будь-яка зміна — новий рядок з новим `id`**, тож закрите на пристрої оголошення після зміни з'являється знову.
- `announcementCache(db, clock, ttlMs = 60_000): { get(): Promise<Announcement | null>; clear(): void }` — поверх `ttlCache`; `get` ще й відкидає закешоване, якщо `expiresAt <= clock()`.
- Публічний `GET /api/announcement` (новий `announcement-routes.ts`, `rateLimit` 120/хв) → `{ announcement: Announcement | null }` для гостей і акаунтів. Адмінські: `GET /api/admin/announcement` (`read`, без кешу), `PUT /api/admin/announcement` (`write`, тіло `announcementInputSchema`, межі строку → `announcement_expiry`, відповідь — нове `Announcement`), `DELETE /api/admin/announcement` (`write`, 204 завжди); обидва записи роблять `cache.clear()`.

**Веб, адмінка**
- `TABS`: «Статистика», **«Живі ігри»** (`/admin/live`), «Користувачі», «Вікторини», «Скарги», **«Оголошення»** (`/admin/announcement`), «Журнал».
- `useAdminData(load, key, options?: { keep?: boolean })` — з `keep` під час `reload` віддає попередні `ready`-дані (без миготіння «Завантаження…» кожні 10 с).
- «Живі ігри» (`AdminLive.tsx`): «Оновити» і автооновлення `setInterval(reload, ADMIN_LIVE_REFRESH_MS)`, поки вкладка відкрита (знімається при виході); картка кімнати: «Код 123 456», назва (`dir="auto"`), ведучий / «Ведучий без акаунта» / «Автопілот ({нік})», «Гравці: N на зв'язку з M», стан, «Триває …» (від `openedAt`), «Остання дія: … тому»; `<a className="btn" href={stageUrl} target="_blank" rel="noopener noreferrer">Відкрити сцену</a>`; «Закрити гру» (немає для `finished`) → `window.confirm` → `closeLiveGame` → `reload`; помилка — `role="alert"`. Тривалість — `durationText(ms)` в `admin-text.ts`: < 1 хв — «щойно», < 1 год — «{count} хв», далі «{hours} год {minutes} хв» (без множини).
- «Статистика»: під наявним — `AdminCharts.tsx` з чотирма `DayBars({ title, hint?, days, value: (day: AdminChartDay) => number | null, percent: boolean })`: SVG `viewBox="0 0 300 120"`, 30 стовпчиків (`null` — без стовпчика), підпис максимуму й крайніх днів, кольори — змінні теми (`currentColor`/акцент); `<svg role="img" aria-labelledby={id заголовка}>` і поруч `<table className="sr-only">` (caption — назва, рядки «день — значення», `null` → «—»); рядок «Пораховано … ; оновлюється раз на 10 хв.». Блок `AdminHealth` (`<dl>`): копія («{дата}, {розмір}» / «Копій ще немає» / «Сховище копій не налаштоване» / «Не вдалося прочитати сховище копій»), час роботи «{days} д {hours} год», пам'ять «{rss} (купа {heap})» у МБ з одним знаком, живі кімнати, з'єднання. Помічники `bytesText(n)`, `uptimeText(sec)` — в `admin-text.ts`.
- «Оголошення» (`AdminAnnouncement.tsx`): «Зараз показується» з `AnnouncementView` (без хрестика) і «Показується до …» або «Оголошення немає.»; форма: текст (`textarea maxLength={ANNOUNCEMENT_TEXT_MAX}`, лічильник «N з 200»), посилання (необов'язково, підказка), «Скільки показувати» — радіо «Доки не приберу» / «До дати й часу» + `input type="datetime-local"` (`localInputToIso(value, viewerZone())`), попередній перегляд «Так його побачать», «Опублікувати» (коли вже є — «Замінити оголошення»), «Прибрати оголошення» з `window.confirm`.
- `logLine`: передає ще `text: entry.details.text ?? ''` і `code: entry.details.code ?? ''`.

**Веб, банер**
- `apps/web/src/announcement/AnnouncementBanner.tsx`: `AnnouncementView({ announcement, onClose? })` — `<aside className="announce-banner" aria-label="Оголошення">`, текст `dir="auto"`, посилання «Детальніше» (`/…` → `Link`, інакше `<a target="_blank" rel="noopener noreferrer">`), хрестик `aria-label="Закрити оголошення"`; `AnnouncementBanner()` — `getAnnouncement()` один раз на монтування `WithMenu`; не показується, якщо `id === loadAnnouncementSeen()` чи `expiresAt <= Date.now()`; поки відкрито й строк близько (≤ 24 год) — `setTimeout` ховає в мить строку. Хрестик → `saveAnnouncementSeen(id)` (ключ `quiz:announcement`, один на пристрій). Місце — у `WithMenu` одразу під `Menu`, над смугою «Немає зв'язку». Помилка запиту — банера немає, без повідомлення.

**Веб, головна (Д2)**
- `HomeActions({ joinOpen, onJoin })` у `MotifHero` під заголовком, для гостя й акаунта: `.home-actions` — дві великі кнопки поруч (на 360 px — дві колонки): `<Link to="/create">` «Створити гру» (`startCreate`) і `<button aria-expanded aria-controls="join-form">` **«Приєднатися»** (новий `homeJoin`), що розкриває наявну `JoinForm` одразу під кнопками. Гостю форма розкрита з першого показу (як зараз), акаунту — після натискання або з `?code=`.
- Плитки `startCreate` і `startJoin` зі стартового меню прибираються (у меню 6 плиток: Друзі, Стрічка, Мої вікторини, Бібліотека, Історія, Профіль); ключ `startJoin` лишається в словниках.
- `useRunningGame(enabled)` повертає `{ code: string; title: string; to: string } | null` (`title` — з `checkCode`, `to` — як зараз у `RunningGameBanner`); `RunningGameBanner` (на «Моїх вікторинах») читає `running.code`/`running.to`. На головній банер замінює картка.
- `useContinueSaved(): (gameId: string) => Promise<string | null>` у `host-game.tsx` — тіло `SavedGame.resume` з `History.tsx` (`continueGame` → токени → перехід; `null` — успіх, інакше код помилки); `History.tsx` користується ним.
- `apps/web/src/home-next.ts`: `type NextUp = { kind: 'running'; code: string; title: string; to: string } | { kind: 'saved'; game: GameSummary } | { kind: 'event'; event: CalendarEvent }`; `pickNextUp(running, games: GameSummary[] | null, events: CalendarEvent[] | null): NextUp | null` — порядок: жива гра на цьому пристрої → найновіша збережена (`saved` є, `!saved.open`, `saved.mode !== 'blocked'`, за `saved.savedAt`) → **найближча подія календаря** (стан `planned` чи `open`, `mine || myRequest === 'approved'`, найменший `startsAt`) → `null`. `useNextUp(signedIn)` чекає всі свої запити (гість — лише жива гра; акаунт — ще `listGames` і `getCalendar` паралельно) і лише тоді показує картку; збій будь-якого запиту = «немає даних» без повідомлення.
- Картка `NextUpCard` під кнопками (і під формою коду): «Продовжити гру» — назва, «Гра 123 456 ще триває» + `Link` «Повернутися» / «Збережено {дата}» + кнопка «Продовжити» (`useContinueSaved`, помилка — `role="alert"`); «Найближча подія» — назва, «{день}, {час}» (`dayHeading`, `timeText`, `viewerZone()`), «Веде {нік}» для чужої, «Гра вже відкрита» для `open`, `Link` «До календаря» (`/feed/calendar`). Решта головної — як зараз, нижче.

## Порядок збирання

- Порядок: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10. Залежності: 2, 3, 4 ← 1; 5 ← 1 (ключі й види журналу); 6 ← 2, 3, 5; 7 ← 4, 5; 8 ← 4, 5; 9 ← 5; 10 — остання.
- `pnpm typecheck` обов'язково зелений з задачі 5 (зміна `ADMIN_ACTION_KINDS` вимагає ключів `adminLog_*`).

## Фокус рев'ю

1. **Адмінка для інших не існує, email не тече.** Кожен новий `/api/admin/*` для гостя, не-адміна й неперевіреної адреси — та сама 404, що й невідомий маршрут, без заголовків обмеження; JSON «Живих ігор», графіків і стану не містить `@` навіть коли ведучий — акаунт з поштою. Задачі 2–4, 10.
2. **Закриття гри.** Лобі зникає (подія `closed`), гра посеред запитання завершується `end` (гравці бачать звичайний кінець, історія записана як завершена), уже `finished` — 409, другий виклик — 404/409 без другого запису в журнал, зупинка сервера — 503 без запису. Задача 2.
3. **Строк і кеш оголошення.** Протерміноване не віддається навіть із кешу; нове оголошення чи зміна — новий `id`, тож закрите хрестиком повертається; «Прибрати» видно всім одразу (кеш скинуто); строк у минулому чи далі року — 400. Задачі 4, 8.
4. **Де банер.** Немає на `/play/:code`, `/host/:code`, `/stage/:code` (жодного запиту `/api/announcement` з цих сторінок); 200 символів без пробілів і арабський інтерфейс не дають бічного скролу на 360 px. Задачі 8, 10.
5. **Дні графіків.** Порожня база → 30 днів з нулями й `null` у частках; гра о 23:30 за Києвом іде в той самий день; тиждень з переходом на зимовий час не губить і не дублює день; `returns` — `null`, коли тиждень тому ніхто не грав. Задача 3.

---

### Задача 1. Спільне: види журналу, типи адмінки, оголошення

**Files:**
- Modify: `packages/shared/src/admin.ts` (види журналу, `AdminLogDetails.code?`, константи, типи «Живих ігор», графіків і стану), `packages/shared/src/index.ts` (експорт `announcement.ts`).
- Create: `packages/shared/src/announcement.ts`, `packages/shared/src/announcement.test.ts`.
- Test: `packages/shared/src/admin.test.ts`.

**Interfaces (Produces):** усе з «Рішень плану» (спільне): `ADMIN_LIVE_REFRESH_MS`, `ADMIN_CHART_DAYS`, `ADMIN_CACHE_MS`, `AdminLiveStatus`, `AdminLiveRoom`, `AdminLiveList`, `AdminChartDay`, `AdminCharts`, `AdminBackupInfo`, `AdminHealth`, `ANNOUNCEMENT_TEXT_MAX`, `ANNOUNCEMENT_URL_MAX`, `ANNOUNCEMENT_MAX_DAYS`, `Announcement`, `isAnnouncementUrl`, `announcementInputSchema`.

- [ ] **Step 1: Write the failing tests:**
  - `announcement.test.ts` `an announcement takes up to 200 characters, an optional site or web link and an optional time limit`: `{ text: 'Субота — сімейна гра о 19:00' }` → `{ text, url: null, expiresAt: null }`; 200 символів — ок, 201 — помилка; `'   '` — помилка; `url: ''` → `null`; `url: 'https://example.com/a?b=1'` і `'/library'` — ок; `'//evil.example'`, `'javascript:alert(1)'`, `'ftp://x'`, `'https://a b'` — помилка; `expiresAt: '2026-11-20T18:00:00+02:00'` — ок, `'2026-11-20 18:00'` (без поясу) — помилка; зайвий ключ — помилка.
  - `admin.test.ts`: `ADMIN_ACTION_KINDS` містить `game_close`, `announcement_set`, `announcement_clear`.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/announcement.test.ts packages/shared/src/admin.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (спільне).
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 && pnpm exec tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 53 admin — log kinds for closing a game and the announcement, live games, 30-day charts and health types, and the announcement input of up to 200 characters with an optional link and time limit"
```

---

### Задача 2. Сервер: «Живі ігри» — список кімнат і «Закрити гру»

**Files:**
- Modify: `apps/server/src/rooms/manager.ts` (`Room.actedAt`, `shut`, `closeByAdmin`, `connectionCount`; `closeHostedBy` через `shut`), `apps/server/src/admin-routes.ts` (два маршрути).
- Create: `apps/server/src/admin-live.ts`, `apps/server/src/admin-live.test.ts`, `apps/server/src/rooms/manager.admin.test.ts` (за зразком `manager.ban.test.ts`).
- Test: `apps/server/src/admin-routes.test.ts`.

**Interfaces:**
- Consumes: `AdminLiveRoom`, `AdminLiveList`, `AdminLiveStatus` (задача 1).
- Produces: `RoomManager.closeByAdmin(code: string): 'closed' | 'ended' | 'finished' | 'not_found'`; `RoomManager.connectionCount(): number`; `Room.actedAt: number`; `liveStatus(state: GameState)`; `liveRooms(db: Db, rooms: Room[], now: Date): Promise<AdminLiveList>`; `GET /api/admin/live` → `AdminLiveList`; `POST /api/admin/live/:code/close` → 204 / 404 / 409 `game_finished` / 503 `restarting`.

- [ ] **Step 1: Write the failing tests:**
  - `manager.admin.test.ts`: `closeByAdmin closes a lobby with «closed» and ends a running game like the host`: лобі → `'closed'`, `manager.get(code)` — `undefined`, слухач отримав `{ type: 'closed' }`; гра на запитанні → `'ended'`, `state.phase === 'finished'`; повторно → `'finished'`; невідомий код → `'not_found'`. `actedAt follows every step`: після створення — `scheduler.now()`; після `host(start)` через 5 с — новий час. `connectionCount sums host, stage and players across rooms`: дві кімнати, `connect` ведучого, сцени, двох гравців (один двічі) → 5; `disconnect` одного → 4. `closeHostedBy still closes a banned host's lobby and ends his game` (наявна поведінка через `shut`).
  - `admin-live.test.ts`: `liveStatus` — лобі → `{ status: 'lobby', round: null }`; заставка до першого раунду (`roundIndex: -1`, не лобі) → `starting`; запитання другого з трьох раундів → `{ status: 'playing', round: { number: 2, of: 3 } }`; те саме на паузі → `paused` з раундом; `finished` → `{ status: 'finished', round: null }`. `liveRooms shows nicknames and never an email`: кімната акаунта з ніком «Оля 53» і поштою `olya53@example.com`, гостьова кімната, автопілот → `host: 'Оля 53'` / `null` / нік автора з `autopilot: true`; `players: { online: 1, total: 2 }`; `stageUrl === '/stage/' + code + '#' + room.stageToken`; `JSON.stringify(list)` не містить `@`; завершена кімната — остання.
  - `admin-routes.test.ts`: у список `routes` теста `hiding the admin panel (Review Focus 3)` — `['GET', '/api/admin/live']`, `['POST', '/api/admin/live/123456/close']`. Новий `describe('live games (39-A1)')`: `lists rooms with the host nickname and no email` (кімната `startGame` від `o`, `JSON` без `@`); `closes a running game, logs it once and refuses a finished one` — `joinAndStart`, POST → 204, `state.phase === 'finished'`, `lastLog()` — `kind: 'game_close'`, `details: { title, code }`, `target` — нік ведучого; повтор → 409 `game_finished`, у журналі той самий один запис; `answers 404 to a bad or unknown code and 503 on a frozen manager without a log line` (`'12ab56'`, `'999999'`; `frozen` — як у тесті бана ~188).
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/rooms/manager.admin.test.ts apps/server/src/admin-live.test.ts apps/server/src/admin-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (живі ігри).
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/rooms apps/server/src/admin-live.test.ts apps/server/src/admin-routes.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 53 live games — the admin lists rooms in memory with code, quiz, host nickname or autopilot, players online, state, age and last step, opens the stage and closes a game like its host does; the close is logged, a finished game is refused and no email leaves the server"
```

---

### Задача 3. Сервер: графіки за 30 днів і блок «Стан» з кешем

**Files:**
- Create: `apps/server/src/admin-charts.ts`, `apps/server/src/admin-charts.test.ts`, `apps/server/src/ttl-cache.ts`, `apps/server/src/ttl-cache.test.ts`.
- Modify: `apps/server/src/db-backup.ts` (`latestBackup`), `apps/server/src/app.ts` (`AppOptions.backupList`, передати в `registerAdminRoutes`), `apps/server/src/main.ts` (`backupList`), `apps/server/src/admin-routes.ts` (`AdminDeps.backupList?`, кеші, два маршрути).
- Test: `apps/server/src/db-backup.test.ts`, `apps/server/src/admin-routes.test.ts`.

**Interfaces:**
- Consumes: `AdminCharts`, `AdminChartDay`, `AdminHealth`, `AdminBackupInfo`, `ADMIN_CHART_DAYS`, `ADMIN_CACHE_MS` (задача 1); `RoomManager.connectionCount()` (задача 2).
- Produces: `ttlCache<T>(load, ttlMs, clock)`; `kyivDayList`, `shiftDay`, `weeklyReturns`, `adminCharts(db, now)`; `latestBackup(objects)`; `AppOptions.backupList?: () => Promise<StoredObject[]>`; `GET /api/admin/charts` → `AdminCharts`; `GET /api/admin/health` → `AdminHealth`.

- [ ] **Step 1: Write the failing tests:**
  - `ttl-cache.test.ts`: `serves one load for 10 minutes, shares a pending load, does not keep a failure, clears on demand` — два `get()` одночасно → `load` один раз; через 599 999 мс — те саме значення; через 600 000 — новий `load`; відмова `load` → наступний `get` пробує знову; `clear()` → новий `load`.
  - `admin-charts.test.ts`: `kyivDayList(new Date('2026-11-19T10:00:00Z'), 30)` — 30 днів від `'2026-10-21'` до `'2026-11-19'`; `shiftDay('2026-10-26', -1) === '2026-10-25'` (перехід на зимовий час) і `shiftDay('2026-03-01', -1) === '2026-02-28'`; `weeklyReturns`: тиждень тому {А, Б, В, Г}, за останні 7 днів {А, Б, Д} → 50; тиждень тому нікого → `null`. `adminCharts on an empty database gives 30 days of zeros with no shares`. `adminCharts counts accounts, games and finished games by the Kyiv day`: гра А (завершена) о `2026-11-18T21:30:00Z` (= 19.11, 23:30 Київ) з двома акаунтами й гостем, гра Б (перервана) 19.11 з одним із них → день `'2026-11-19'`: `players: 2`, `games: 2`, `finished: 1`, `completion: 50`; ігри 8–14 днів тому з акаунтами А, Б і сьогоднішні з А → `returns: 50` на `'2026-11-19'`.
  - `db-backup.test.ts`: `latestBackup picks the newest backup key and ignores foreign keys` — `[m0039 від 09.11, m0040 від 16.11, 'backups/db/notes.txt']` → об'єкт 16.11; `[]` → `null`.
  - `admin-routes.test.ts`: у `routes` — `['GET', '/api/admin/charts']`, `['GET', '/api/admin/health']`. `describe('charts and health (39-A3)')`: `gives 30 days and caches them for 10 minutes` (30 днів, останній — сьогодні за Києвом; другий виклик після нової гри — той самий `computedAt` і ті самі числа); `shows the newest backup from the list, uptime, memory, rooms and connections` — окремий `buildApp({ …, adminEmails, backupList: async () => [{ key: 'backups/db/2026-11-16T10-05-00Z-m0040.jsonl.gz', size: 3_500_000, lastModified }] })` → `backup: { state: 'ok', at: '2026-11-16T10:05:00.000Z', bytes: 3500000 }`, `uptimeSec >= 0`, `memory.rss > 0`, `rooms`/`connections` — числа; без `backupList` → `{ state: 'off' }`; `backupList` кидає → `{ state: 'error' }`, відповідь 200.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/ttl-cache.test.ts apps/server/src/admin-charts.test.ts apps/server/src/db-backup.test.ts apps/server/src/admin-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (графіки й стан). SQL — два запити: дні з `count(*)` і `count(*) filter (where status = 'finished')` від півночі першого з 30 днів; пари `(день, user_id)` через `select distinct … from participant join game` від півночі дня на 13 днів раніше. Збій `backupList` — у `reportError(error, { where: 'admin-health' })`.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/ttl-cache.test.ts apps/server/src/admin-charts.test.ts apps/server/src/db-backup.test.ts apps/server/src/admin-routes.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 53 charts and health — 30 Kyiv days of active accounts, games, finished share and week-over-week returns, the newest DB backup from R2 backups/db/, uptime, memory, live rooms and connections; charts and the backup list are cached for 10 minutes"
```

---

### Задача 4. Сервер: оголошення — міграція 0041, сховище, публічний і адмінські маршрути

**Files:**
- Create: `apps/server/drizzle/0041_announcement.sql` + `meta/0041_snapshot.json` + запис у `meta/_journal.json` (`pnpm --filter @quiz/server exec drizzle-kit generate --name announcement`; першим рядком SQL — `-- Оголошення-банер адміна (план 53): одне активне за раз, будь-яка зміна — новий рядок.`), `apps/server/src/announcement-store.ts`, `apps/server/src/announcement-store.test.ts`, `apps/server/src/announcement-routes.ts`.
- Modify: `apps/server/src/db/schema.ts` (`announcement`), `apps/server/src/app.ts` (кеш, `registerAnnouncementRoutes`, кеш в `AdminDeps`), `apps/server/src/admin-routes.ts` (три маршрути).
- Test: `apps/server/src/db/schema.test.ts`, `apps/server/src/admin-routes.test.ts`.

**Interfaces:**
- Consumes: `Announcement`, `announcementInputSchema`, `ANNOUNCEMENT_MAX_DAYS` (задача 1); `ttlCache` (задача 3).
- Produces: `activeAnnouncement(db, now)`, `setAnnouncement(db, { adminId, input, now })`, `clearAnnouncement(db, { adminId, now })`, `announcementCache(db, clock, ttlMs?)`; `GET /api/announcement` → `{ announcement: Announcement | null }`; `GET|PUT|DELETE /api/admin/announcement`.

- [ ] **Step 1: Write the failing tests:**
  - `schema.test.ts`: `migration 0041 adds the announcement table over an older database, old data stays` (`createTestDbUpTo('0040_library')`, рядки `admin_action` і `quiz` цілі, `announcement` порожня); `deleting the author keeps the announcement with no author` (`created_by` → null).
  - `announcement-store.test.ts`: `one active announcement at a time, the newest wins and a change gets a new id`; `an expired one is not active, one without a limit stays`; `clear takes it away for everyone and logs once; clearing nothing logs nothing`; `the cache serves for a minute, drops an expired one at once and forgets on clear` (керований годинник: два `get()` за хвилину — один запит до бази; оголошення до `T + 30 с` → `get()` при `T + 31 с` → `null`; після `clear()` — новий запит).
  - `admin-routes.test.ts`: у `routes` — `['GET', '/api/admin/announcement']`, `['PUT', '/api/admin/announcement']`, `['DELETE', '/api/admin/announcement']`. `describe('announcement (39-A5)')`: `a guest and an account read the active announcement`; `the admin publishes, replaces and clears it, each step in the log` — PUT `{ text: 'Субота — сімейна гра о 19:00', url: '/feed/calendar', expiresAt: <через добу> }` → 200 з `id`; публічний GET одразу показує його (кеш скинуто); PUT вдруге → новий `id`, журнал `announcement_set` двічі з `details.text`; DELETE → 204, публічний GET → `{ announcement: null }`, `announcement_clear`; `refuses a past or a too distant limit, a long text and a bad link with 400` (`announcement_expiry` для `now − 1 хв` і `now + 366 д`; 201 символ і `javascript:` → `invalid_payload`).
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/db/schema.test.ts apps/server/src/announcement-store.test.ts apps/server/src/admin-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (оголошення). Згенерувати міграцію, перевірити, що SQL — лише `CREATE TABLE "announcement"` і `ADD CONSTRAINT … FOREIGN KEY ("created_by") … ON DELETE set null`, дописати коментар першим рядком.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/db apps/server/src/announcement-store.test.ts apps/server/src/admin-routes.test.ts apps/server/src/db-backup.test.ts apps/server/src/db-restore.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/drizzle apps/server/src
git commit -m "feat(server): 53 announcement — migration 0041 adds the announcement table; one active at a time, any change is a new row, an optional link and time limit, a public read cached for a minute and cleared on every admin write, publish and clear in the admin log"
```

---

### Задача 5. Веб: тексти в 7 мовах, рядки журналу, помічники адмінки

**Files:**
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,de,es,it,pl,ar}.json`, `apps/web/src/i18n.test.ts` (`ADDED_ADMIN_HOME_53`), `apps/web/src/admin/admin-text.ts` (`logLine` з `text`/`code`, `durationText`, `bytesText`, `uptimeText`).
- Test: `apps/web/src/admin/admin-text.test.ts`.

**Ключі (uk):**
- Живі ігри: `adminTabLive` «Живі ігри», `adminLiveEmpty` «Зараз жодної гри.», `adminLiveRefresh` «Оновити», `adminLiveAuto` «Оновлюється саме кожні 10 с.», `adminLiveCode` «Код {code}», `adminLiveHost` «Ведучий: {name}», `adminLiveGuestHost` «Ведучий без акаунта», `adminLiveAutopilot` «Автопілот ({name})», `adminLivePlayers` «Гравці: {online} на зв'язку з {total}», `adminLiveLobby` «Лобі», `adminLiveStarting` «Починається», `adminLiveRound` «Раунд {number} з {of}», `adminLivePaused` «Пауза · раунд {number} з {of}», `adminLiveFinished` «Кінець», `adminLiveAge` «Триває {time}», `adminLiveActed` «Остання дія: {time}», `adminLiveJustNow` «щойно», `adminLiveMinutes` «{count} хв тому», `adminLiveSpanMinutes` «{count} хв», `adminLiveSpanHours` «{hours} год {minutes} хв», `adminLiveStage` «Відкрити сцену», `adminLiveClose` «Закрити гру», `adminLiveCloseConfirm` «Закрити гру {code} «{title}»? Гравці побачать кінець гри.», `adminLiveClosed` «Гру {code} закрито.», `err_game_finished` «Гра вже завершилась.».
- Журнал: `adminLog_game_close` «{admin} закрив(-ла) гру «{title}» (код {code})», `adminLog_announcement_set` «{admin} опублікував(-ла) оголошення «{text}»», `adminLog_announcement_clear` «{admin} прибрав(-ла) оголошення «{text}»».
- Графіки й стан: `adminChartsTitle` «Останні 30 днів», `adminChartPlayers` «Активні гравці (акаунти, що зіграли гру)», `adminChartGames` «Ігор за день», `adminChartCompletion` «Дограно до кінця, %», `adminChartReturns` «Повернення, %», `adminChartReturnsHint` «Частка тих, хто грав 8–14 днів тому й зіграв знову за останні 7 днів.», `adminChartDay` «День», `adminChartValue` «Значення», `adminChartMax` «макс. {value}», `adminChartsComputed` «Пораховано {time}; оновлюється раз на 10 хв.», `adminHealthTitle` «Стан», `adminHealthBackup` «Остання копія бази», `adminHealthBackupLine` «{date}, {size}», `adminHealthBackupNone` «Копій ще немає», `adminHealthBackupOff` «Сховище копій не налаштоване», `adminHealthBackupError` «Не вдалося прочитати сховище копій», `adminHealthUptime` «Сервер працює», `adminHealthUptimeValue` «{days} д {hours} год», `adminHealthMemory` «Пам'ять процесу», `adminHealthMemoryValue` «{rss} (купа {heap})», `adminHealthRooms` «Живі кімнати», `adminHealthConnections` «З'єднання», `adminMegabytes` «{value} МБ».
- Оголошення в адмінці: `adminTabAnnouncement` «Оголошення», `adminAnnounceCurrent` «Зараз показується», `adminAnnounceNone` «Оголошення немає.», `adminAnnounceExpires` «Показується до {date}», `adminAnnounceText` «Текст оголошення», `adminAnnounceCount` «{count} з {max}», `adminAnnounceUrl` «Посилання (необов'язково)», `adminAnnounceUrlHint` «https://… або сторінка сайту, наприклад /library», `adminAnnounceUntil` «Скільки показувати», `adminAnnounceForever` «Доки не приберу», `adminAnnounceDate` «До дати й часу», `adminAnnouncePreview` «Так його побачать», `adminAnnouncePublish` «Опублікувати», `adminAnnounceReplace` «Замінити оголошення», `adminAnnounceClear` «Прибрати оголошення», `adminAnnounceClearConfirm` «Прибрати оголошення для всіх?», `adminAnnounceSaved` «Оголошення опубліковано.», `err_announcement_expiry` «Строк має бути в майбутньому й не далі, ніж за рік.».
- Банер: `announceLabel` «Оголошення», `announceMore` «Детальніше», `announceClose` «Закрити оголошення».
- Головна: `homeJoin` «Приєднатися», `homeActionsLabel` «Почати», `homeContinueTitle` «Продовжити гру», `homeContinueRunning` «Гра {code} ще триває», `homeContinueBack` «Повернутися», `homeContinueSaved` «Збережено {date}», `homeEventTitle` «Найближча подія», `homeEventWhen` «{day}, {time}», `homeEventHost` «Веде {name}», `homeEventOpen` «Гра вже відкрита», `homeEventCalendar` «До календаря».

- [ ] **Step 1: Write the failing tests:**
  - `i18n.test.ts`: `ADDED_ADMIN_HOME_53` (усі ключі вище) — в умову `adds no uk keys beyond the agreed list`; новий `it('53 keys (live games, charts, health, announcement, home) are in every language')` за зразком `49 keys …`.
  - `admin-text.test.ts`: `logLine` — `game_close` з `details: { title: 'Карпати', code: '123456' }` → «Оля закрив(-ла) гру «Карпати» (код 123456)»; `announcement_set` з `details: { text: 'Субота — гра' }` → містить «Субота — гра»; `durationText(30_000)` → «щойно», `(12 · 60_000)` → «12 хв», `(125 · 60_000)` → «2 год 5 хв»; `bytesText(3_500_000)` → «3,3 МБ» (uk-кома, `Intl.NumberFormat` поточної мови); `uptimeText(3 · 86_400 + 4 · 3_600 + 59)` → «3 д 4 год».
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/i18n.test.ts apps/web/src/admin/admin-text.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement:** uk-тексти вище, переклади в 6 локалях (ar — RTL-нейтральні плейсхолдери; «МБ» → «MB»/«ميغابايت» тощо), `logLine` і помічники.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/i18n.test.ts apps/web/src/admin/admin-text.test.ts apps/web/src/source-scan.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src
git commit -m "feat(web): 53 texts — live games, charts and health, the announcement and the new home in seven languages; log lines for closing a game and the announcement; duration, size and uptime helpers"
```

---

### Задача 6. Веб: вкладка «Живі ігри», графіки й «Стан» у «Статистиці»

**Files:**
- Create: `apps/web/src/admin/AdminLive.tsx`, `apps/web/src/admin/AdminLive.test.tsx`, `apps/web/src/admin/AdminCharts.tsx`, `apps/web/src/admin/AdminCharts.test.tsx`.
- Modify: `apps/web/src/admin/Admin.tsx` (`TABS`, маршрути `live`, `announcement` — задача 7 дає компонент; до неї маршрут не додавати), `apps/web/src/admin/AdminStats.tsx` (`<AdminCharts />`, `<AdminHealth />`), `apps/web/src/admin/admin-api.ts` (`adminLive`, `closeLiveGame`, `adminCharts`, `adminHealth`), `apps/web/src/admin/useAdminData.ts` (`keep`), `apps/web/src/styles.css` (`.admin-live`, `.day-bars`).
- Test: `apps/web/src/admin/Admin.test.tsx`.

**Interfaces:**
- Consumes: маршрути задач 2–3; тексти й помічники задачі 5.
- Produces: `adminLive(): Promise<ApiData<AdminLiveList>>`, `closeLiveGame(code: string): Promise<ApiResult<object>>`, `adminCharts(): Promise<ApiData<AdminCharts>>`, `adminHealth(): Promise<ApiData<AdminHealth>>`; `useAdminData(load, key, options?: { keep?: boolean })`; `DayBars` (`AdminCharts.tsx`).

- [ ] **Step 1: Write the failing tests:**
  - `AdminLive.test.tsx`: `shows each room with code, quiz, host, players, state and age`; `shows «Автопілот (нік)» and «Ведучий без акаунта»`; `reloads every 10 seconds while open without a loading flash and stops after leaving` (фейкові таймери: `adminLive` викликано 1 → 2 → 3 рази, «Завантаження…» після першого показу не з'являється; після `unmount` — більше викликів немає); `«Закрити гру» asks first, closes and reloads; «Скасувати» does nothing` (`window.confirm` false → `closeLiveGame` не викликано); `a finished room has no «Закрити гру»`; `«Відкрити сцену» opens the stage link in a new tab` (`href`, `target="_blank"`, `rel`); помилка закриття → `role="alert"` з `errorText`.
  - `AdminCharts.test.tsx`: `draws 30 bars per chart and an sr-only table with the same values` (4 `svg[role="img"]`, у кожному 30 `rect` мінус дні з `null`; таблиця з 30 рядками, «—» для `null`); `shows the health block: backup date and size, «Копій ще немає», «Сховище копій не налаштоване», uptime, memory, rooms, connections`.
  - `Admin.test.tsx`: `shows the stats and the five section links` → `… and the seven section links` (порядок з «Рішень плану»; «Оголошення» з'явиться в задачі 7 — у цій задачі тест чекає шість, задача 7 міняє на сім).
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/admin`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (веб, адмінка). Стилі — лише змінні теми (світла тема — `is-light`), картки на 360 px без бічного скролу, кнопки дій переносяться під текст.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/admin && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src
git commit -m "feat(web): 53 admin live games and charts — a «Живі ігри» tab refreshed every 10 s without flashing, open the stage or close a game after a confirm; 30-day SVG bars with screen-reader tables and a health block in «Статистика»"
```

---

### Задача 7. Веб: вкладка «Оголошення» в адмінці

**Files:**
- Create: `apps/web/src/admin/AdminAnnouncement.tsx`, `apps/web/src/admin/AdminAnnouncement.test.tsx`, `apps/web/src/announcement/AnnouncementView.tsx` (лише вигляд: `AnnouncementView({ announcement, onClose? })`, ним користується й банер задачі 8).
- Modify: `apps/web/src/admin/Admin.tsx` (вкладка й маршрут `announcement`), `apps/web/src/admin/admin-api.ts` (`adminAnnouncement`, `saveAnnouncement`, `clearAnnouncement`), `apps/web/src/styles.css` (`.announce-banner`, `.admin-announce`).
- Test: `apps/web/src/admin/Admin.test.tsx` (сім вкладок).

**Interfaces:**
- Consumes: адмінські маршрути задачі 4; `announcementInputSchema`, `ANNOUNCEMENT_TEXT_MAX` (задача 1); `localInputToIso`, `viewerZone` (`calendar/calendar-time.ts`).
- Produces: `AnnouncementView`; `adminAnnouncement(): Promise<ApiData<{ announcement: Announcement | null }>>`, `saveAnnouncement(input): Promise<ApiData<Announcement>>`, `clearAnnouncement(): Promise<ApiResult<object>>`.

- [ ] **Step 1: Write the failing tests** (`AdminAnnouncement.test.tsx`):
  - `shows «Оголошення немає.» and publishes text with a link «доки не приберу»` — тіло `saveAnnouncement` `{ text: 'Субота — сімейна гра о 19:00', url: '/feed/calendar', expiresAt: null }`; після — «Оголошення опубліковано.» і «Зараз показується».
  - `the counter shows «N з 200» and the field stops at 200`; `the preview shows the text as it will look`.
  - `«До дати й часу» sends the time with the zone`: поле `2026-11-20T19:00` → `expiresAt` — `localInputToIso('2026-11-20T19:00', viewerZone())`; без дати кнопка неактивна.
  - `«Прибрати оголошення» asks first and clears`; `the server's «announcement_expiry» is shown as an alert`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/admin`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (веб, адмінка — «Оголошення»).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/admin && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src
git commit -m "feat(web): 53 admin announcement — write up to 200 characters with an optional link, show it until removed or until a date and time, preview it, replace or remove it"
```

---

### Задача 8. Веб: банер оголошення на всіх сторінках поза грою

**Files:**
- Create: `apps/web/src/announcement/AnnouncementBanner.tsx`, `apps/web/src/announcement/AnnouncementBanner.test.tsx`.
- Modify: `apps/web/src/menu/WithMenu.tsx`, `apps/web/src/api.ts` (`getAnnouncement`), `apps/web/src/storage.ts` (`loadAnnouncementSeen`, `saveAnnouncementSeen`, ключ `quiz:announcement`).
- Test: `apps/web/src/AppRoutes.test.tsx`.

**Interfaces:**
- Consumes: `GET /api/announcement` (задача 4); `AnnouncementView` (задача 7).
- Produces: `getAnnouncement(): Promise<ApiData<{ announcement: Announcement | null }>>`; `AnnouncementBanner()`.

- [ ] **Step 1: Write the failing tests:**
  - `AnnouncementBanner.test.tsx`: `shows the announcement with its link`: шлях `/library` → `Link` на `/library`; `https://example.com` → `target="_blank"`, `rel="noopener noreferrer"`; без посилання «Детальніше» немає. `× hides it on this device and it stays hidden after a reload` (`saveAnnouncementSeen(id)`; новий рендер з тим самим `id` — нічого). `a new announcement shows again after the old one was closed`. `an expired one is not shown and an open one hides at its time` (фейкові таймери: `expiresAt = now + 30 с` → видно; +30 с → немає). `a failed request shows nothing and no error`.
  - `AppRoutes.test.tsx`: `the announcement is on the home page and the library but not on /play, /host or /stage` — `getAnnouncement` замокано; на `/play/123456`, `/host/123456`, `/stage/123456` його не викликано.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/announcement apps/web/src/AppRoutes.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (веб, банер). Стиль: смуга на всю ширину під меню, текст переноситься (`overflow-wrap: anywhere`), хрестик ≥ 44 × 44 px, контраст у світлій і темній темах, RTL — логічні відступи.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/announcement apps/web/src/AppRoutes.test.tsx apps/web/src/menu && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src
git commit -m "feat(web): 53 announcement banner — on every page but the stage, the host panel and the game phone, for guests and accounts; × hides it on this device until a new one, it leaves at its time"
```

---

### Задача 9. Веб: головна — дві великі кнопки, «Продовжити гру», «Найближча подія»

**Files:**
- Create: `apps/web/src/home-next.ts`, `apps/web/src/home-next.test.ts`, `apps/web/src/pages/HomeTop.tsx` (`HomeActions`, `NextUpCard`, `useNextUp`).
- Modify: `apps/web/src/pages/Home.tsx` (кнопки в `MotifHero`, картка, 6 плиток, без `RunningGameBanner`), `apps/web/src/host-game.tsx` (`useRunningGame` → об'єкт, `RunningGameBanner`, `useContinueSaved`), `apps/web/src/pages/History.tsx` (через `useContinueSaved`), `apps/web/src/styles.css` (`.home-actions`, `.home-action`, `.next-up`).
- Test: `apps/web/src/pages/Home.test.tsx`, `apps/web/src/pages/History.test.tsx`, `apps/web/src/pages/Quizzes.test.tsx` (якщо перевіряє банер).

**Interfaces:**
- Consumes: `checkCode`, `listGames`, `getCalendar`, `continueGame` (`api.ts`); `dayHeading`, `timeText`, `viewerZone`.
- Produces: `NextUp`, `pickNextUp(running, games, events)`; `useRunningGame(enabled): { code: string; title: string; to: string } | null`; `useContinueSaved(): (gameId: string) => Promise<string | null>`.

- [ ] **Step 1: Write the failing tests:**
  - `home-next.test.ts` (`pickNextUp`): жива гра перемагає все; без неї — найновіша збережена (`!open`, не `blocked`; `open` і `blocked` пропускаються); без них — найближча подія: моя `planned` через 2 дні проти схваленої чужої `open` сьогодні → чужа `open`; `cancelled`, `played`, `missed`, чужа без схвалення, `myRequest: 'pending'` — не беруться; `null`-списки (збій) і порожні → `null`.
  - `Home.test.tsx`: `a signed-in person sees «Створити гру» and «Приєднатися» on top and six tiles below` (заміна `shows eight start tiles…`); `«Приєднатися» opens the code form under the buttons` (`aria-expanded`); `?code= opens the form at once` (наявний); `a guest gets both buttons with the form already open`; `«Продовжити гру» for a running game links back to the host panel and replaces the old banner`; `«Продовжити гру» for a saved game continues it` (`continueGame` викликано, перехід на `/host/…`); `«Найближча подія» shows the title, day and time and links to the calendar`; `no card while the answers are pending and none when there is nothing`; `a guest never asks for saved games or the calendar`. Наявні тести форми коду гостя — без змін.
  - `History.test.tsx`: наявний сценарій «Продовжити» проходить через `useContinueSaved` без змін поведінки.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/home-next.test.ts apps/web/src/pages/Home.test.tsx apps/web/src/pages/History.test.tsx apps/web/src/pages/Quizzes.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (веб, головна). Кнопки — по ≥ 56 px заввишки, на 360 px дві колонки з переносом тексту; картка — `.panel.next-up` з `h2`.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/home-next.test.ts apps/web/src/pages apps/web/src/host-game.test.tsx && pnpm typecheck`. Expected: PASS (якщо `host-game.test.tsx` немає — без нього).
- [ ] **Step 5: Commit**
```bash
git add apps/web/src
git commit -m "feat(web): 53 home — big «Створити гру» and «Приєднатися» on top, then «Продовжити гру» for a running or saved game, otherwise the nearest calendar event, otherwise nothing; the rest of the home page stays below"
```

---

### Задача 10. Наскрізні сценарії й кадри (`part53-admin-home.e2e.ts`), оновлені помічники, повтор part 24a / 32 / 21a

**Files:**
- Create: `apps/server/e2e/part53-admin-home.e2e.ts` (сервер з адміном — як `part47-library.e2e.ts`: `relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: 'admin53@example.com' }), backupList: async () => [{ key: 'backups/db/2026-11-16T10-05-00Z-m0041.jsonl.gz', size: 3_500_000, lastModified: new Date('2026-11-16T10:05:00Z') }] })`, у `finally` — `relisten()`; світла тема).
- Modify: `apps/server/e2e/helpers/common.ts` (`homeCodeField` шукає кнопку «Приєднатися»), `apps/server/e2e/part32-weak-network.e2e.ts` (~108, 143 — та сама кнопка), `apps/server/e2e/part22-24-l10n-menus-profile.e2e.ts` (`part 24a`: кнопки «Створити гру»/«Приєднатися» над меню, у `nav.start-menu` 6 плиток; ~647, ~868 — нова кнопка).

**Сценарії** (вікторина: класичний раунд, три `single` по 30 с, «Річки України 53»; люди: адмін, Оля, Петро, гість):
1. `it('part 53: live games — the admin sees a lobby and a running game with nickname, players and state, the list refreshes by itself, opens the stage and closes the running game; Оля sees the end of the game, the log has it, no email anywhere, phone 360 px, light theme')` — Оля відкриває лобі, Петро — гру з двома гравцями на запитанні; не-адмін: `GET /api/admin/live` → 404; адмін на `/admin/live`: дві картки, текст сторінки й JSON відповіді без `@`; Петро переходить до наступного запитання → за ≤ 12 с картка показує новий стан без натискань; «Відкрити сцену» — нова вкладка сцени з кодом; «Закрити гру» → підтвердження → телефон гравця Петрової гри бачить кінець гри; `/admin/log` — «закрив(-ла) гру «Річки України 53» (код …)»; кадри `admin53-live-360`, `admin53-log-360`; `expectNoSideScroll`.
2. `it('part 53: charts and health — four 30-day charts with tables for screen readers and the health block with the last backup, uptime, memory, rooms and connections')` — `/admin`: 4 `svg[role="img"]`, у кожній `table.sr-only` 30 рядків; «Остання копія бази» з датою 16.11.2026 і «3,3 МБ»; кадр `admin53-stats-360`.
3. `it('part 53: announcement — the admin publishes one with a link and a time limit, a guest and Оля see it on the home page and the library but not on the stage, the host panel or the game phone, × hides it until a new one, and it leaves at its time')` — текст «Субота — сімейна гра о 19:00», посилання `/feed/calendar`; гість і Оля бачать банер на `/` і `/library`, «Детальніше» веде в календар; у грі (`/play/…`, `/host/…`, `/stage/…`) банера немає; × у Олі → після перезавантаження немає, у гостя є; адмін замінює текстом «Неділя — гра про річки» → в Олі знову видно; адмін публікує з строком «через 20 с» (`expiresAt` через API) → відкрита сторінка ховає банер сама, перезавантаження — теж немає; «Прибрати» → немає ні в кого; журнал — опубліковано двічі й прибрано; кадри `announce53-home-light-360`, `announce53-admin-360`; 200-символьне оголошення без бічного скролу на 360 px.
4. `it('part 53: home — two big buttons on top, «Продовжити гру» for a running game and then for a saved one, «Найближча подія» from the calendar, and nothing when there is nothing, phone 360 px, light theme')` — Оля без ігор і подій: кнопки, жодної картки; «Приєднатися» з кодом — у лобі; Оля запускає гру й повертається на `/` → «Продовжити гру» → «Повернутися» на пульт; гра «Зберегти й продовжити пізніше», `quiz:last-game` очищено → картка збереженої гри, «Продовжити» відкриває нову кімнату; без збережених — Петрова подія календаря, де Олю схвалено, → «Найближча подія»; гість — лише кнопки й форма коду; кадри `home53-buttons-light-360`, `home53-continue-light-360`, `home53-event-light-360`, також `home53-buttons-dark-360` (темна тема).

- [ ] **Step 1: Write the scenarios and update the helpers.**
- [ ] **Step 2: Run** `pnpm build`, потім (після завершення збирання) `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 53"` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 3: Run** по одному, після part 53, не одночасно: `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 24a"`, потім `-t "part 32"`, потім `-t "part 21a"`. Expected: PASS (нові кнопки головної, сім вкладок адмінки не ламають старих сценаріїв).
- [ ] **Step 4: Переглянути кадри:** на 360 px дві кнопки головної поруч і читаються, картка не налазить на меню; картки «Живих ігор» з кнопками без бічного скролу; стовпчики графіків видно в світлій темі; банер не перекриває заголовок і хрестик досяжний.
- [ ] **Step 5: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 53 — admin live games with auto refresh, stage and close, charts and health with a stub backup list, the announcement shown, dismissed, replaced and expired outside games only, the new home with continue and nearest event cards; helpers follow «Приєднатися», 360 px, light theme"
```

---

## Розбіжності зі специфікацією (рішення плану)

1. **Міграція — `0041_announcement`**, одна таблиця. «Живі ігри», графіки й стан бази не міняють; нові види журналу — значення `text`.
2. **«Повернення» (рішення будівничого, записане):** для дня D — частка акаунтів, що грали в дні D−13…D−7, які зіграли й у дні D−6…D, у відсотках; `null`, якщо тиждень тому ніхто не грав. Гості без акаунта в жоден графік не входять («активні гравці» — акаунти, як у специфікації).
3. **Дні графіків — за київським часом, день гри — день її початку** (`started_at`). Частка дограних за сьогодні нижча, поки ігри ще йдуть, — це видно з підпису й прийнято.
4. **Кеш:** графіки й список копій R2 — 10 хв (як «напр. 10 хв» у специфікації); час роботи, пам'ять, кімнати й з'єднання — свіжі на кожен запит (вони дешеві й мають сенс лише свіжими). «З'єднання» — сума відкритих сокетів ведучих, сцен і гравців у кімнатах (сокет поза кімнатою не рахується). «Живі кімнати» — як `live` у наявній статистиці (не `finished`).
5. **«Живі ігри» показують і щойно завершені кімнати** (стан «Кінець», без «Закрити гру»), поки менеджер тримає їх у пам'яті. «Скільки триває» — від відкриття лобі. Автооновлення не миготить «Завантаженням» (`useAdminData` з `keep`).
6. **«Закрити гру» в лобі** закриває лобі (гравці бачать «гра зникла», як при бані ведучого), посеред гри — завершує її `end`, як кнопка ведучого (результати пишуться в історію як завершена гра). «Відкрити сцену» — посилання з токеном сцени: адмін підключається як ще одна сцена.
7. **Оголошення: будь-яка зміна — нове оголошення з новим `id`**, тож у тих, хто закрив попереднє, змінене з'являється знову. Строк — у майбутньому й не далі року. Публічне читання кешується на 60 с і скидається кожним записом адміна; протерміноване не віддається навіть із кешу. Банера немає на сцені, на телефоні гравця **і на пульті ведучого** (усі три поза `WithMenu`); сторінка входу `/play/:code` теж без банера.
8. **Адмін-вкладка «Оголошення» — окрема** (специфікація не каже, де); вкладок стає сім.
9. **«Найближча подія» — з календаря ігор** (`/api/me/calendar`): моя подія або чужа, де мене схвалено, у стані «заплановано» чи «відкрито», найраніша. Виклики (44) і сімейна ліга (45) строку «коли» не мають — не беруться. Гість бачить лише «Продовжити гру» для гри, що триває на цьому пристрої.
10. **«Продовжити гру»** — спершу гра, що триває на цьому пристрої (ведучий чи автор автопілота, наявний `useRunningGame`; банер «Повернутися до гри» на головній замінено карткою, на «Моїх вікторинах» лишився), далі найновіша збережена гра акаунта (13b, кнопка «Продовжити» — той самий шлях, що в «Історії»). Гравець, що лише грав на чужій грі, картки не отримує — пристрій не пам'ятає його коду поза самою грою.
11. **Плитки «Створити гру» й «Доєднатись до гри» зі стартового меню прибрано** — вони стали двома великими кнопками згори; кнопка входу називається «Приєднатися», як у специфікації (e2e-помічники й part 24a / 32 оновлено). Ключ `startJoin` лишається в словниках.
12. **e2e — світла тема на 360 px**, для головної додатково один кадр у темній темі (специфікація просить обидві теми для головної).
