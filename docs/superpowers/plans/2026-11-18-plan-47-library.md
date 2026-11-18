# План 47: бібліотека вікторин (38g) + скарги й модерація (39-А2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** Бібліотека не торкається гри: копія — звичайна вікторина в таблиці `quiz`, гра з неї йде наявним шляхом. `GameState`, `SavedRoom`, зрізи гри — без змін. База — **одна адитивна міграція** `0040_library` (три нові таблиці).

> **Звірка з кодом.** План спирається на `main` 2026-11-18 (`a6926c08`, після плану 46):
> - вікторини: таблиця `quiz` (`apps/server/src/db/schema.ts` ~108: `id`, `owner_id` → `user` cascade, `title`, `description`, `settings` jsonb з `duels?`/`spares?`, `rounds` jsonb, `created_at`/`updated_at`); сховище `apps/server/src/quizzes.ts` — `quizOf(row)` (розбір `quizSchema`, зламаний рядок повертає як є), `getQuiz(db, ownerId, id)`, `createQuiz(db, ownerId, data)`, `listQuizzes` (його кличе й `popularQuizzes` профілю — **не чіпати**, правило швидкості профілю, план 46); маршрути `/api/quizzes*` — у `apps/server/src/account-routes.ts` ~125–176 (`currentUser`, `UNAUTHORIZED`/`NOT_FOUND`/`INVALID`, `CODE_LIMIT` = 120/хв); `questionsOf(quiz)` (кількість запитань), `ROUND_TYPES` (`packages/shared/src/quiz.ts` ~1541), `quizSchema` (`description` ≤ 500). Мовного поля у вікторини **немає**;
> - знімок вікторини — зразок `challenge` (`schema.ts` ~790: `quiz_snapshot jsonb`, `quiz_id` → `quiz` `set null`; читати через `upgradeQuiz`);
> - вподобайки: `user_like` (`schema.ts` ~552; `kind` ∈ `LIKE_KINDS` = `question | quiz | host | player | event`, `quiz_id` без FK, унікальний `user_like_quiz_once (user_id, quiz_id) where kind = 'quiz'`); `saveLike(db, change)` у `apps/server/src/like-store.ts` (~98) — **зараз відкидає `gameId === null` для всього, крім `event`**; власник не лайкає своє (`resolve`); `likeTotals` рахує `quiz` в «автор»; «Мені сподобались» (`givenLikes`) групує за `quiz_id`. Тобто ❤️ вікторини вже є (з фінального екрана гри) — бібліотека бере **ту саму** систему (див. «Рішення»). Окремого `likes-routes.ts` немає: `/api/me/likes/given|received` — у `profile-routes.ts` ~221; `LikeCount` — `apps/web/src/editor/LikeCount.tsx` (лічильник у редакторі);
> - адмінка: `isAdmin(db, emails, userId)` (`apps/server/src/admin.ts`, ADMIN_EMAILS + підтверджений email); `apps/server/src/admin-routes.ts` — `adminOf`, `gate` (не-адмін → 404 `not_found`), `limited('admin-read' 120 | 'admin-write' 30)`, дії в транзакції з `logAction(tx, { adminId, kind, targetUserId, details, now })` (`apps/server/src/bans.ts`); журнал — `admin_action` (`kind` — text, тож нові види **без міграції**), `ADMIN_ACTION_KINDS` і `AdminLogDetails { reason?, title?, text?, content? }` у `packages/shared/src/admin.ts` ~9–36; `adminLog`, `pattern(q)` (ilike з екрануванням, < 2 символів — без фільтра) у `apps/server/src/admin-store.ts`; веб — `apps/web/src/admin/Admin.tsx` (`TABS`, `Routes`, `AdminPager`), `admin-api.ts`, `AdminLog.tsx` + `admin-text.ts` (`logLine` → ключ `adminLog_<kind>` з `{admin}`, `{target}`, `{title}`), `useAdminData.ts`;
> - бани: `isBanned`, `notHidden(column)` (`apps/server/src/feed-store.ts` ~36 — «власник не заблокований»); `currentUser` повертає `null` для заблокованого;
> - профіль: `profile` (`schema.ts` ~367: `nickname` null → веб показує `t('defaultNickname')` = «Гравець», `nickname_key` unique, `avatar` `/uploads/<назва>` чи null); `ensureProfile` генерує нік з імені акаунта (`profiles.ts` ~71); публічний профіль — `apps/web/src/pages/PublicProfile.tsx` (`following === null` — гість або сам власник);
> - медіа: адреси `/uploads/...` у вмісті вікторини; сервер завантажень **ніколи не видаляє** (`.remove(` лише в `db-backup.ts`), тож копія може посилатися на ті самі адреси;
> - ліміти: `perUser(prefix, max)` як у `group-routes.ts` ~106 (`keyGenerator` = `${prefix}:${user.id ?? ip}`, `timeWindow: '1 minute'`); сторінки — `nextOffset(fetched, offset, size)` (`packages/shared/src/paging.ts`);
> - меню: `apps/web/src/menu/Menu.tsx` — увійшовши `[JOIN, FEED, QUIZZES, HISTORY, PROFILE]`, гість `[JOIN, signIn]`; **п'ять пунктів на 360 px** закріплені CSS (`styles.css` ~13834) і e2e (`MENU_ITEMS_23A`, `expectFiveItems` у `apps/server/e2e/helpers/common.ts` ~117, ~791, десять викликів); плитки — `StartMenu` у `apps/web/src/pages/Home.tsx` ~119; маршрути — `apps/web/src/AppRoutes.tsx`;
> - «Мої вікторини»: `apps/web/src/pages/Quizzes.tsx` — рядок вікторини з кнопками й діалогами (`ChallengeLaunch` — аркуш через `createPortal`, фокус, Escape, `busyRef`; `listMyChallenges` — окремий запит після `listQuizzes`, збій не ламає список); `QuizSummary` — `apps/web/src/api.ts` ~28; `fetchData`/`request` (~88–94);
> - мови: `LOCALES` (`packages/shared/src/locale.ts`), `LOCALE_NAMES` (`apps/web/src/locales/locales.ts`), `currentLocale()` (`apps/web/src/locales/current.ts`); назви раундів — `ROUND_NAMES` (`apps/web/src/guide-text.ts` ~24);
> - міграції: остання — `0039_family_league`; `pnpm --filter @quiz/server exec drizzle-kit generate --name library`, перший рядок SQL — коментар українською; тест — `apps/server/src/db/schema.test.ts` з `createTestDbUpTo('0039_family_league')` → `migrateRest()`; `db-backup.ts` бере всі таблиці з `information_schema`;
> - i18n: uk — `apps/web/src/i18n.ts`, локалі `apps/web/src/locales/{en,pl,de,es,it,ar}.json`; останні списки — `ADDED_LEAGUE`/`ADDED_LEAGUE_PLURALS` (`apps/web/src/i18n.test.ts` ~195–196, перевірка локалей ~423, умова `adds no uk keys beyond the agreed list` ~524); `errorText(code)` → `err_<code>`; `source-scan.test.ts`; довідка — `help/host-help.ts` (`SETTING_HELP_KEYS`, останній `'league'`), `help/help-uk.ts` (`setting.league.*` ~1220), `help/__fixtures__/help-uk-golden.json`, `locales/*.help.json`, `HelpButton({ id })`. Довідки адміна як розділу немає;
> - e2e: `apps/server/e2e/helpers/setup.ts` (`useE2eServer`, `db`, `relisten({ adminEmails: adminEmails({ ADMIN_EMAILS }) })`), адмін — як `admin21a` у `part17-21-likes-feed-calendar-push-admin.e2e.ts` ~1261 (`register` + `db.update(user).set({ emailVerified: true })`); зразок частини — `part45-family-league.e2e.ts`.
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

**Мета:** автор відкриває вікторину «для всіх» (знімок, ≥ 5 запитань, попередження про особисте); каталог `/library` бачать і гості — пошук, «Популярні»/«Нові», фільтр мови, сторінка без відповідей; з акаунтом — ❤️, «Копіювати собі» (копія з «Автор: …») і «Поскаржитись» на вікторину чи профіль; адмін у «Скаргах» ховає вікторину, скидає нік чи аватар або відхиляє скаргу, усе — у журналі; 3 різні скарги ховають вікторину до рішення; автор раз оскаржує приховування.

**Архітектура:** спільне — `packages/shared/src/library.ts` (константи, схеми запитів, типи, `authorLine`). Сервер: таблиці `library_entry` (знімок + стан модерації + оскарження), `library_copy`, `user_report`; сховища `apps/server/src/library-store.ts` (знімок, каталог, копія) і `apps/server/src/report-store.ts` (скарги, авто-приховування, черга, дії адміна); маршрути `apps/server/src/library-routes.ts` (автор, каталог, ❤️, копія, скарги) і нові маршрути в `admin-routes.ts`. ❤️ — наявний `user_like` виду `quiz` на вікторину автора. Клієнт: `library/LibraryShare.tsx` у «Мої вікторини», сторінки `pages/Library.tsx` і `pages/LibraryQuiz.tsx`, `library/ReportDialog.tsx`, `admin/AdminReports.tsx`.

**Технології:** TypeScript, zod, Fastify + drizzle (Postgres, PGlite у тестах), React 19 + Vite + Testing Library (jsdom), Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-18-library-design.md` (38g + 39-А2) — уся.

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22** (`packages/engine/src/restore.ts`). Ні `GameState`, ні `SavedRoom`, ні зрізи гри не змінюються. Якщо виконавцю здасться, що потрібне інше, — **зупинитися й спитати контролера**.
- **Міграція — лише додавання:** одна нова `0040_library` з трьома `CREATE TABLE`, їхніми ключами й індексами; жодного `ALTER`/`DROP` наявних таблиць. Нові види журналу адміна — лише значення в `text`-колонці, без міграції.
- Усі тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`. Нові uk-ключі — у нових списках `ADDED_LIBRARY` і `ADDED_LIBRARY_PLURALS` у `apps/web/src/i18n.test.ts`; обидва — в умові `adds no uk keys beyond the agreed list` і в перевірці наявності в усіх локалях (як `ADDED_LEAGUE`). ru немає. Довідка автора — `help-uk.ts` + golden + шість `*.help.json`. Звертання — «ти», без роду, де можна.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`); нових файлів у `ALLOWED` не треба.
- **Безпека:** копіювання, ❤️ і скарги — **лише з акаунтом** (гість — 401); адмінські дії — **лише для ADMIN_EMAILS** (наявний `gate`: інакше 404 `not_found`); каталог і сторінка вікторини **ніколи не віддають запитань і відповідей** (лише назву, опис, раунди — назва й тип, кількість запитань); обмеження частоти на скарги, ❤️ і копіювання.
- **Приватність:** каталог не віддає email, id акаунта автора, друзів — **лише нікнейм автора**; заблокований автор зникає з каталогу (`notHidden`). Тексти скарг і хто скаржився бачить лише адмін (і то — без особи скаржника).
- **Швидкість профілю (план 46):** жодної нової роботи в `GET /api/me/profile`, `GET /api/profiles/:id`, `ownProfile`, `publicProfile`, `listQuizzes`/`popularQuizzes`. Стан «у бібліотеці» для «Мої вікторини» — окремим запитом.
- **Нічого, пов'язаного з росією**, — у фікстурах, назвах, вікторинах, скаргах і тестах.
- Таймери у фікстурах e2e ≥ 25 с; правильні так/ні у фікстурах — і «так», і «ні».
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|engine|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів; ніколи два запуски vitest водночас).
- Правки файлів — лише інструментами редагування; **не через python** (`python3` тут — заглушка, що нічого не робить).
- e2e: нова частина 47 у `apps/server/e2e`; спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 47"`; кадри — з `E2E_SHOTS=1`. Телефон 360 px і світла тема.

## Рішення плану (там, де специфікація мовчить)

**Константи й типи** (`packages/shared/src/library.ts`):
- `LIBRARY_MIN_QUESTIONS = 5`, `LIBRARY_AUTO_HIDE = 3`, `LIBRARY_PAGE = 20`, `LIBRARY_QUERY_MAX = 100`, `REPORT_TEXT_MAX = 300`, `REPORT_REASONS = ['offensive', 'spam', 'personal', 'other']`, `LIBRARY_MODERATION = ['ok', 'auto_hidden', 'hidden']`, `LIBRARY_SORTS = ['popular', 'new']`.
- Мова вікторини: у вікторини мовного поля немає, тож **мову обирає автор у вікні відкриття** (`select` з `LOCALE_NAMES`, типово — `currentLocale()`), вона живе в записі бібліотеки (див. «Розбіжності», п. 2).

**Запис бібліотеки** (таблиця `library_entry`):
- `id uuid pk`, `quiz_id uuid not null unique` → `quiz.id` **`on delete cascade`** (видалення вікторини прибирає її з каталогу; копії лишаються), `owner_id text not null` → `user` cascade, `title text`, `description text`, `language text not null` (`Locale`), `snapshot jsonb not null` (результат `quizSchema.parse`, читати через `upgradeQuiz`), `question_count integer`, `round_types text[]` (різні типи раундів у порядку появи), `origin_line text null` (див. «Автор: …»), `listed boolean not null` (відкрито / закрито автором), `moderation text not null default 'ok'` (`LIBRARY_MODERATION`), `appealed_at timestamptz null` (оскарження вже використано), `appeal_open boolean not null default false`, `opened_at` (перше відкриття — для «Нові»), `updated_at` (останній знімок). Індекси `library_entry_listed_idx (listed, moderation, opened_at)`, `library_entry_owner_idx (owner_id)`.
- Відкрити / оновити — `PUT /api/library/mine/:quizId` з `libraryOpenSchema = { language: Locale }` (strict): вікторина своя (інакше 404 `not_found`); `quizSchema.safeParse(quizOf(row))` не пройшло → 409 `library_invalid`; `questionsOf < 5` → 409 `library_too_few`; запис є з `moderation !== 'ok'` → 409 `library_hidden`. Інакше upsert: новий знімок, `listed = true`, `updated_at = now`, `opened_at` — лише при створенні. Закрити — `DELETE …/:quizId` → `listed = false` (рядок зі станом модерації лишається — тож закрити й відкрити знову не знімає приховування).
- `GET /api/library/mine` → `LibraryMine[]` для моїх вікторин, що мають запис: `{ quizId, entryId, listed, moderation, appealed: boolean, appealOpen: boolean, language, updatedAt, likes, plays }`.
- Оскаржити — `POST /api/library/mine/:quizId/appeal`: лише `moderation === 'hidden'` (інакше 409 `library_not_hidden`), `appealed_at` вже є → 409 `library_appeal_used`; інакше `appealed_at = now`, `appeal_open = true` → у черзі адміна.

**Каталог** (`GET /api/library?q=&sort=popular|new&lang=&offset=` — `libraryQuerySchema`, без акаунта; ліміт 120/хв за IP):
- Видно лише `listed && moderation = 'ok' && notHidden(owner_id)`. Пошук — `ilike` за `title` і `description` (як `pattern` адмінки: < 2 символів — без фільтра, `%`, `_`, `\` екрануються, ≤ `LIBRARY_QUERY_MAX`). `lang` — точний збіг. Порядок: `popular` — ❤️ ↓, далі `opened_at` ↓, `id`; `new` — `opened_at` ↓, `id`. Сторінки по `LIBRARY_PAGE` з `next` (`nextOffset`).
- `LibraryCard = { id, title, description, author: string /* нікнейм, '' коли null */, questionCount, roundTypes: RoundType[], language, likes, plays, liked?: boolean /* лише з акаунтом */, mine?: true }` — **без** `ownerId`, `quizId`, знімка.
- ❤️ — рядки `user_like` виду `quiz` з `quiz_id = library_entry.quiz_id` і `hidden = false` (ті самі, що з фінального екрана гри). «Зіграли N разів» — `plays` = кількість завершених ігор (`game.status = 'finished'`) вікторин-копій цього запису (`game.quiz_id = library_copy.quiz_id`).
- Сторінка — `GET /api/library/:id` → `LibraryDetail = LibraryCard & { rounds: { title: string; type: RoundType }[]; openedAt; updatedAt }`; прихована, закрита, неіснуюча, автор заблокований → 404 `not_found` (власникові — так само: свій стан він бачить у «Мої вікторини»).

**❤️ з каталогу** (`PUT /api/library/:id/like` з `{ liked: boolean }`, лише з акаунтом, `perUser('library-like', 30)`):
- `saveLike(db, { userId, kind: 'quiz', liked, gameId: null, quizId: entry.quizId })` — **`saveLike` дозволяє `gameId: null` і для виду `quiz`** (ключ унікальності `quiz` — `(user_id, quiz_id)`, гра в ньому не бере участі). Власник — нічого не пишеться (наявне правило `resolve`), відповідь — `{ likes, liked: false }`. Запис невидимий → 404. Відповідь — `{ likes: number; liked: boolean }`.

**Копія** (`POST /api/library/:id/copy` з `libraryCopySchema = { locale: Locale }`, лише з акаунтом, `perUser('library-copy', 10)`):
- Свій запис → 409 `library_own`; невидимий → 404. Нова вікторина — `createQuiz(db, user.id, quiz)` зі знімка (`upgradeQuiz` → `quizSchema.parse`), **усі адреси медіа ті самі**. Опис: якщо `entry.origin_line !== null` — опис знімка як є (рядок оригінального автора там уже є); інакше `withAuthorLine(description, authorLine(locale, нік власника))`. Рядок `library_copy`: `id`, `entry_id` → `library_entry` cascade, `user_id` → `user` cascade, `quiz_id` → `quiz` **`set null`**, `author_line text not null` (той рядок, що в описі копії), `at`. Індекси `library_copy_entry_idx (entry_id)`, `library_copy_quiz_idx (quiz_id)`. Відповідь 201 `{ id }` (id нової вікторини).
- `authorLine(locale, nickname: string | null): string` — `${LIBRARY_AUTHOR_LABEL[locale]}: ${nickname ?? LIBRARY_DEFAULT_NICK[locale]}`; мітки: uk «Автор», en «Author», pl «Autor», de «Autor», es «Autor», it «Autore», ar «المؤلف»; підставка ніку — uk «Гравець», en «Player», pl «Gracz», de «Spieler», es «Jugador», it «Giocatore», ar «لاعب» (як `defaultNickname` у словниках). `withAuthorLine(description, line)` — `line` першим рядком, далі `\n` і опис, обрізаний так, щоб усе ≤ 500 символів (опис порожній — лише рядок).
- **«Автор: …» лишається, коли копію відкривають:** під час відкриття / оновлення вікторини, для якої є `library_copy` з `quiz_id` = ця вікторина (найновіший), `origin_line = author_line` цієї копії, а опис знімка — `withAuthorLine(...)`, якщо рядка `origin_line` в описі вже немає (власник його стер). Сама вікторина власника не змінюється.

**Скарги** (таблиця `user_report`; `POST /api/reports`, лише з акаунтом, `perUser('report', 5)`):
- `reportSchema` — `{ target: { kind: 'quiz'; entryId: uuid } | { kind: 'profile'; userId: string ≤ 64 }, reason: ReportReason, text?: string ≤ 300 (trim, isStorable) }` (strict).
- Колонки: `id uuid pk`, `reporter_id` → `user` cascade, `target_kind text` (`'quiz' | 'profile'`), `entry_id uuid null` → `library_entry` cascade, `target_user_id text not null` → `user` cascade (власник вікторини чи сам профіль), `reason text`, `text text not null default ''`, `status text not null default 'open'` (`'open' | 'resolved' | 'dismissed'`), `created_at`, `resolved_at null`. Унікальні часткові індекси: `user_report_quiz_once (reporter_id, entry_id) where status = 'open' and target_kind = 'quiz'`, `user_report_profile_once (reporter_id, target_user_id) where status = 'open' and target_kind = 'profile'`; індекс `user_report_open_idx (status, target_kind, created_at)`.
- Помилки: на себе / свою вікторину → 409 `cannot_report_self`; ціль невидима (вікторина не в каталозі, профіль заблокований чи немає) → 404 `not_found`; друга відкрита скарга того самого акаунта на той самий об'єкт → 409 `already_reported`. Успіх — 201 `{ ok: true }`.
- **Авто-приховування:** у тій самій транзакції після вставки скарги на вікторину — `count(distinct reporter_id)` відкритих скарг запису ≥ `LIBRARY_AUTO_HIDE` і `moderation = 'ok'` → `moderation = 'auto_hidden'` (запис під `FOR UPDATE`, щоб дві паралельні треті скарги не розійшлися).

**Черга й дії адміна** (у `admin-routes.ts`, ворота й ліміти — наявні `read`/`write`):
- `GET /api/admin/reports?page=` → `AdminList<AdminReportItem>`; елемент на **об'єкт**, не на скаргу: вікторини з відкритими скаргами чи `appeal_open`, профілі з відкритими скаргами; порядок — найдавніша відкрита скарга першою (оскарження — за `appealed_at`).
  - `{ kind: 'quiz'; entryId; quizId; title; author: { id; nickname }; moderation; appeal: boolean; reports: number; reasons: Partial<Record<ReportReason, number>>; texts: string[] /* до 5 найновіших непорожніх */; since: string }`;
  - `{ kind: 'profile'; userId; nickname: string | null; avatar: string | null; reports; reasons; texts; since }`.
- `POST /api/admin/reports/quiz/:entryId` з `{ action: 'hide' | 'restore' | 'dismiss' }`: `hide` → `moderation = 'hidden'`, відкриті скарги → `resolved`, `appeal_open = false`, журнал `library_hide`; `restore` → `moderation = 'ok'`, скарги → `dismissed`, `appeal_open = false`, журнал `library_restore`; `dismiss` → скарги → `dismissed`; якщо `auto_hidden` → `ok`; якщо `appeal_open` → `appeal_open = false` (приховування лишається), журнал `report_dismiss` (на оскарженні — `appeal_reject`). Немає запису → 404.
- `POST /api/admin/reports/profile/:userId` з `{ action: 'reset_nickname' | 'reset_avatar' | 'dismiss' }`: `reset_nickname` → `nickname = null`, `nickname_key = null` (веб показує «Гравець» мовою глядача; див. «Розбіжності», п. 3), журнал `nickname_reset` з `details.text` = старий нік; `reset_avatar` → `avatar = null` (файл не видаляється), журнал `avatar_reset`; обидва закривають відкриті скарги профілю як `resolved`; `dismiss` → `dismissed`, журнал `report_dismiss`. Адміна скинути не можна → 409 `cannot_ban_admin` (той самий код, що й бан). Усе — одна транзакція з `logAction`; `targetUserId` — власник вікторини чи профіль; `details.title` — назва вікторини.
- `ADMIN_ACTION_KINDS` += `'library_hide', 'library_restore', 'report_dismiss', 'appeal_reject', 'nickname_reset', 'avatar_reset'`.

**Навігація** (див. «Розбіжності», п. 1):
- Гість: меню `[JOIN, LIBRARY, signIn]`; на головній під формою — `Link.quiet-link` «📚 Бібліотека вікторин».
- З акаунтом: нижнє меню лишається **п'ять пунктів**; пункт «Мої вікторини» активний і на `/library…`; у «Мої вікторини» в `toolbar` — `Link.btn` «📚 Бібліотека»; на головній — плитка `TileLink to="/library" icon="📚" label="libraryTitle"` після «Мої вікторини».
- `LIBRARY: Item = { label: 'menuLibrary', short: 'menuShortLibrary', icon: '📚', to: '/library', active: under('/library') }`.
- Маршрути `AppRoutes.tsx`: `/library` → `Library`, `/library/:id` → `LibraryQuiz`.

**Тексти (uk) — `ADDED_LIBRARY`:**
`menuLibrary: 'Бібліотека'`, `menuShortLibrary: 'Бібліо'`, `libraryTitle: 'Бібліотека'`, `libraryGuestLink: '📚 Бібліотека вікторин'`, `libraryButton: '📚 Бібліотека'`, `libraryShareTitle: '📚 Відкрити для всіх'`, `libraryShareWarning: 'Вікторину побачать усі користувачі сайту, і будь-хто зможе її скопіювати. Не додавай особисті фото чи дані — свої, рідних чи друзів.'`, `libraryShareLanguage: 'Мова вікторини'`, `libraryOpen: 'Відкрити для всіх'`, `libraryUpdate: 'Оновити в бібліотеці'`, `libraryClose: 'Закрити'`, `libraryCloseConfirm: 'Прибрати вікторину з бібліотеки? Вже зроблені копії лишаться в людей.'`, `librarySnapshotHint: 'У бібліотеці — знімок на мить відкриття. Твої подальші правки потраплять туди, лише коли натиснеш «Оновити в бібліотеці».'`, `libraryStatusOpen: '📚 Відкрито для всіх'`, `libraryStatusClosed: 'Закрито — у бібліотеці не видно'`, `libraryStatusAuto: '⏳ Тимчасово приховано: скарги на перевірці'`, `libraryStatusHidden: '🚫 Приховано модератором'`, `libraryAppeal: 'Оскаржити'`, `libraryAppealSent: 'Оскарження надіслано'`, `libraryAppealUsed: 'Оскарження вже використано'`, `librarySearch: 'Пошук за назвою чи описом'`, `librarySort: 'Порядок'`, `librarySortPopular: 'Популярні'`, `librarySortNew: 'Нові'`, `libraryLanguage: 'Мова'`, `libraryAnyLanguage: 'Усі мови'`, `libraryEmpty: 'Нічого не знайдено.'`, `libraryMore: 'Показати ще'`, `libraryBy: 'Автор: {name}'`, `libraryRounds: 'Раунди'`, `libraryLike: '❤️ Подобається'`, `libraryLiked: '❤️ Подобається тобі'`, `libraryCopy: 'Копіювати собі'`, `libraryCopied: 'Скопійовано в «Мої вікторини»'`, `libraryOpenCopy: 'Відкрити копію'`, `librarySignIn: 'Увійди, щоб копіювати, вподобати чи поскаржитись'`, `libraryNoAnswers: 'Запитань і відповідей тут не видно — щоб не підглядати.'`, `reportButton: 'Поскаржитись'`, `reportTitle: 'Скарга'`, `reportReason: 'Причина'`, `reportReason_offensive: 'Образливе'`, `reportReason_spam: 'Спам'`, `reportReason_personal: 'Особисті дані'`, `reportReason_other: 'Інше'`, `reportText: 'Пояснення (необов'язково)'`, `reportSend: 'Надіслати'`, `reportSent: 'Дякуємо, скаргу надіслано.'`, `adminTabReports: 'Скарги'`, `adminReportsIntro: 'Відкриті скарги й оскарження. Три скарги від різних людей ховають вікторину до твого рішення.'`, `adminReportsEmpty: 'Відкритих скарг немає.'`, `adminReportQuiz: 'Вікторина «{title}» — {name}'`, `adminReportProfile: 'Профіль {name}'`, `adminReportAppeal: 'Автор оскаржує приховування'`, `adminReportOpenQuiz: 'Переглянути вікторину'`, `adminReportOpenUser: 'Переглянути користувача'`, `adminHideQuiz: 'Сховати вікторину'`, `adminRestoreQuiz: 'Повернути в каталог'`, `adminResetNick: 'Скинути нік'`, `adminResetAvatar: 'Скинути аватар'`, `adminDismissReport: 'Відхилити скаргу'`, `adminLog_library_hide: '{admin} сховав(-ла) вікторину «{title}» ({target})'`, `adminLog_library_restore: '{admin} повернув(-ла) вікторину «{title}» ({target}) у каталог'`, `adminLog_report_dismiss: '{admin} відхилив(-ла) скаргу на {target}'`, `adminLog_appeal_reject: '{admin} відхилив(-ла) оскарження «{title}» ({target})'`, `adminLog_nickname_reset: '{admin} скинув(-ла) нік {target}'`, `adminLog_avatar_reset: '{admin} скинув(-ла) аватар {target}'`, помилки `err_library_invalid: 'Вікторина має помилки — виправ їх у редакторі й спробуй знову.'`, `err_library_too_few: 'Для бібліотеки потрібно щонайменше 5 запитань.'`, `err_library_hidden: 'Вікторину приховано модератором — оновити чи відкрити її не можна.'`, `err_library_not_hidden: 'Оскаржувати нічого — вікторину не приховано.'`, `err_library_appeal_used: 'Оскарження вже використано.'`, `err_library_own: 'Це твоя вікторина — вона вже є в «Мої вікторини».'`, `err_already_reported: 'Ти вже поскаржився(-лася) — скарга на перевірці.'`, `err_cannot_report_self: 'Скаржитися на себе не можна.'`.
`ADDED_LIBRARY_PLURALS`: `libraryQuestions_one/_few/_many: '{count} запитання' / '{count} запитання' / '{count} запитань'`, `libraryPlays_one/_few/_many: 'зіграли {count} раз' / 'зіграли {count} рази' / 'зіграли {count} разів'`, `adminReportCount_one/_few/_many: '{count} скарга' / '{count} скарги' / '{count} скарг'`.
(Якщо ключ із такою назвою вже є — виконавець бере наявний і прибирає його зі списку; формулювання журналу з «(-ла)» — як у наявних `adminLog_*`, звірити.)

## Порядок збирання

- Залежності: 1 — незалежна; 2 ← 1; 3 ← 2; 4 ← 2; 5 ← 4; 6 ← 3; 7 ← 3, 6 (списки i18n); 8 ← 4, 7; 9 ← 5, 8; 10 ← 6; 11 — остання.
- Кожна задача лишає `pnpm typecheck` зеленим; ключі i18n додаються в тій задачі, де з'являються в коді (списки `ADDED_LIBRARY*` ростуть).

## Фокус рев'ю

1. **Підглядання відповідей і особистого.** JSON каталогу й сторінки вікторини (гість, чужий акаунт) не містить тексту жодного запитання, варіанта, `accepted`, `ownerId`, `quizId`, email; копія — повна (це й є «копіювати»). Задачі 2, 3, 11.
2. **Обхід модерації.** Прихована вікторина: закрити й відкрити знову, «Оновити», видалити й відкрити копію своєї ж вікторини — не повертає її в каталог без адміна (видалення вікторини прибирає запис; копія своєї — `library_own`); друге оскарження — 409; заблокований автор зникає з каталогу; гість не може ❤️/копіювати/скаржитися (401), не-адмін не бачить черги (404). Задачі 2–5.
3. **Межа «3 різні скарги».** Три скарги одного акаунта (друга — 409) не ховають; три різних — ховають рівно раз; відхилена скарга не рахується, і той самий акаунт може поскаржитися знову; дві паралельні треті скарги — один перехід у `auto_hidden`. Задача 4.
4. **Знімок і «Автор: …».** Правка автора після відкриття не з'являється в каталозі до «Оновити»; копія має «Автор: <нік>» першим рядком і опис ≤ 500 (довгий опис обрізано); копію копії відкрито — рядок оригінального автора лишається, навіть якщо новий власник стер його з опису; нік автора скинуто — каталог показує «Гравець». Задачі 2, 3.
5. **Телефон 360 px, світла тема, довгі тексти.** Каталог з назвою 120 символів і ніком 20 символів, аркуш «Відкрити для всіх», вікно скарги, черга адміна — без бокового скролу; нижнє меню гостя з «Бібліотекою» і п'ять пунктів з акаунтом. Задачі 6–9, 11.

---

### Задача 1. Спільне: правила й типи бібліотеки та скарг (`packages/shared/src/library.ts`)

**Files:**
- Create: `packages/shared/src/library.ts`, `packages/shared/src/library.test.ts`
- Modify: `packages/shared/src/index.ts` (`export * from './library';`), `packages/shared/src/admin.ts` (шість нових `ADMIN_ACTION_KINDS`), `packages/shared/src/admin.test.ts` (якщо він перелічує види)

**Interfaces (Produces):**
```ts
export const LIBRARY_MIN_QUESTIONS = 5;
export const LIBRARY_AUTO_HIDE = 3;
export const LIBRARY_PAGE = 20;
export const LIBRARY_QUERY_MAX = 100;
export const REPORT_TEXT_MAX = 300;
export const REPORT_REASONS = ['offensive', 'spam', 'personal', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const LIBRARY_MODERATION = ['ok', 'auto_hidden', 'hidden'] as const;
export type LibraryModeration = (typeof LIBRARY_MODERATION)[number];
export const LIBRARY_SORTS = ['popular', 'new'] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];
export const LIBRARY_AUTHOR_LABEL: Record<Locale, string>;
export const LIBRARY_DEFAULT_NICK: Record<Locale, string>;
export function authorLine(locale: Locale, nickname: string | null): string;
export function withAuthorLine(description: string, line: string): string; // ≤ 500, line першим рядком
export function roundTypesOf(quiz: Pick<Quiz, 'rounds'>): RoundType[]; // різні, у порядку появи
export const libraryOpenSchema: z.ZodType<{ language: Locale }>;
export const libraryCopySchema: z.ZodType<{ locale: Locale }>;
export const libraryLikeSchema: z.ZodType<{ liked: boolean }>;
export const libraryQuerySchema: z.ZodType<{ q?: string; sort: LibrarySort; lang?: Locale; offset: number }>; // sort типово 'popular', offset типово 0
export type ReportTarget = { kind: 'quiz'; entryId: string } | { kind: 'profile'; userId: string };
export const reportSchema: z.ZodType<{ target: ReportTarget; reason: ReportReason; text?: string }>;
export const adminQuizActionSchema: z.ZodType<{ action: 'hide' | 'restore' | 'dismiss' }>;
export const adminProfileActionSchema: z.ZodType<{ action: 'reset_nickname' | 'reset_avatar' | 'dismiss' }>;
export interface LibraryCard { id: string; title: string; description: string; author: string; questionCount: number; roundTypes: RoundType[]; language: Locale; likes: number; plays: number; liked?: boolean; mine?: true }
export interface LibraryDetail extends LibraryCard { rounds: { title: string; type: RoundType }[]; openedAt: string; updatedAt: string }
export interface LibraryPage { items: LibraryCard[]; next: number | null }
export interface LibraryMine { quizId: string; entryId: string; listed: boolean; moderation: LibraryModeration; appealed: boolean; appealOpen: boolean; language: Locale; updatedAt: string; likes: number; plays: number }
export type AdminReportItem =
  | { kind: 'quiz'; entryId: string; quizId: string; title: string; author: { id: string; nickname: string | null }; moderation: LibraryModeration; appeal: boolean; reports: number; reasons: Partial<Record<ReportReason, number>>; texts: string[]; since: string }
  | { kind: 'profile'; userId: string; nickname: string | null; avatar: string | null; reports: number; reasons: Partial<Record<ReportReason, number>>; texts: string[]; since: string };
```

- [ ] **Step 1: Write the failing tests** (`library.test.ts`):
  - `author line in every language` — `authorLine('uk', 'Олена')` = `'Автор: Олена'`, `authorLine('it', 'Olena')` = `'Autore: Olena'`, `authorLine('en', null)` = `'Author: Player'`; кожна з `LOCALES` має мітку й підставку.
  - `the author line goes first and the description fits 500` — `withAuthorLine('Про річки', 'Автор: Олена')` = `'Автор: Олена\nПро річки'`; порожній опис → лише рядок; опис 500 символів → результат рівно 500 і починається з рядка; результат проходить `quizSchema.shape`-перевірку опису (≤ 500).
  - `round types are distinct and ordered` — раунди `classic, board, classic, final` → `['classic', 'board', 'final']`.
  - `schemas` — `libraryQuerySchema.parse({})` = `{ sort: 'popular', offset: 0 }`; `lang: 'xx'` і `sort: 'top'` → помилка; `q` 101 символ → помилка; `reportSchema` приймає `{ target: { kind: 'quiz', entryId: <uuid> }, reason: 'spam' }`, відкидає `entryId: 'abc'`, `reason: 'ugly'`, `text` 301 символ, зайве поле; текст обрізається (`'  так  '` → `'так'`); `libraryOpenSchema` — лише `LOCALES`; `adminProfileActionSchema` відкидає `'ban'`.
  - `admin kinds` — `ADMIN_ACTION_KINDS` містить шість нових видів.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/library.test.ts`. Expected: FAIL (модуля немає).
- [ ] **Step 3: Implement** за Interfaces і «Рішення плану» (мітки й підставки — точно як у «Копія»).
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src && pnpm typecheck`. Expected: PASS (новий вид журналу без тексту ще не ламає веб: `logLine` бере ключ динамічно; ключі додає задача 9).
- [ ] **Step 5: Commit**
```bash
git add packages/shared/src
git commit -m "feat(shared): 47 library — limits (5 questions, 3 reports, 300 characters), report reasons, moderation states, the «Author: …» line in seven languages that fits the 500-character description, request schemas, catalog, own-entry and report-queue types, six new admin log kinds"
```

---

### Задача 2. Сервер: таблиці бібліотеки й сховище знімка й каталогу (`0040_library`, `library-store.ts`)

**Files:**
- Modify: `apps/server/src/db/schema.ts` (таблиці `libraryEntry`, `libraryCopy`, `userReport` у кінці), `apps/server/src/db/schema.test.ts` (новий `describe('library (38g)')`)
- Create: `apps/server/drizzle/0040_library.sql` + `meta/0040_snapshot.json` + запис у `meta/_journal.json` (`pnpm --filter @quiz/server exec drizzle-kit generate --name library`; першим рядком SQL — `-- Бібліотека вікторин і скарги (план 47): знімки відкритих вікторин, копії, скарги на вікторини й профілі.`), `apps/server/src/library-store.ts`, `apps/server/src/library-store.test.ts`

**Interfaces:**
- Consumes: усе з задачі 1; `quizOf`, `createQuiz` (`quizzes.ts`); `notHidden` (`feed-store.ts`); `upgradeQuiz`, `quizSchema`, `questionsOf`.
- Produces:
```ts
export type OpenResult = { ok: true; entryId: string } | { ok: false; error: 'not_found' | 'library_invalid' | 'library_too_few' | 'library_hidden' };
export async function openEntry(db: Db, ownerId: string, quizId: string, language: Locale, now: Date): Promise<OpenResult>; // відкрити чи оновити знімок
export async function closeEntry(db: Db, ownerId: string, quizId: string): Promise<boolean>;
export async function myEntries(db: Db, ownerId: string): Promise<LibraryMine[]>;
export async function appealEntry(db: Db, ownerId: string, quizId: string, now: Date): Promise<'ok' | 'not_found' | 'library_not_hidden' | 'library_appeal_used'>;
export async function catalog(db: Db, query: { q?: string; sort: LibrarySort; lang?: Locale; offset: number }, viewerId: string | null): Promise<LibraryPage>;
export async function entryDetail(db: Db, entryId: string, viewerId: string | null): Promise<LibraryDetail | null>;
/** Видимий у каталозі запис (listed, ok, автор не заблокований) або null. */
export async function visibleEntry(db: Db | Tx, entryId: string): Promise<{ id: string; quizId: string; ownerId: string; title: string } | null>;
export async function copyEntry(db: Db, userId: string, entryId: string, locale: Locale, now: Date): Promise<{ ok: true; quizId: string } | { ok: false; error: 'not_found' | 'library_own' }>;
export function escapeLike(q: string | undefined, max: number): string | null; // винести з admin-store.ts `pattern`, адмінка кличе цю
```

- [ ] **Step 1: Write the failing tests:**
  - `schema.test.ts`: `migration 0040 lays the library tables over an older database, old data stays` (`createTestDbUpTo('0039_family_league')`, рядки `quiz`, `user_like`, `admin_action` цілі, нові таблиці порожні); `one entry per quiz, one open report per account and object` — друга `library_entry` з тим самим `quiz_id` → `rejects`; друга відкрита скарга того самого `reporter_id` на той самий `entry_id` → `rejects`, а після `status = 'dismissed'` першої — вставляється; видалення вікторини → її `library_entry` і скарги на неї зникають, `library_copy` зникає разом із записом, а вікторина-копія лишається; видалення вікторини-копії → `library_copy.quiz_id` = null; видалення акаунта → його записи, копії-рядки й скарги (як скаржника й як цілі) зникають.
  - `library-store.test.ts` (`createTestDb()`, акаунти через вставку `user` + `ensureProfile`; вікторини — фікстури `@quiz/engine/testing` з 5–6 запитаннями про річки й міста України):
    - `opens a snapshot and keeps it until update` — `openEntry` → у `catalog` картка з `questionCount: 6`, `roundTypes`, `language`; `updateQuiz` зі зміненою назвою → каталог показує стару; повторний `openEntry` → нову; `opened_at` не змінився, `updated_at` — так.
    - `refuses too few, broken and foreign quizzes` — 4 запитання → `library_too_few`; рядок `quiz` з `rounds: []` (зламаний) → `library_invalid`; чужа вікторина → `not_found`.
    - `closing hides from the catalog and keeps the moderation` — `closeEntry` → каталог порожній; запис з `moderation = 'hidden'`: `openEntry` → `library_hidden`.
    - `catalog shows only visible entries without answers` — закритий, `auto_hidden`, `hidden` і запис заблокованого автора не видно; `JSON.stringify(page)` не містить тексту запитання, `accepted`-відповіді, id власника й `quiz_id`; `author` — нікнейм; нікнейм `null` → `''`.
    - `search, language and order` — пошук `'дніп'` знаходить за описом без регістру; `'%'` — не всі рядки, а лише з `%`; `lang: 'en'` — лише англійські; `popular` — за ❤️ (рядки `user_like` виду `quiz`, `hidden = true` не рахуються), рівні — новіші першими; `new` — за `opened_at`; 21 запис → 20 і `next: 20`, далі 1 і `next: null`.
    - `liked and mine for the viewer` — глядач з ❤️ → `liked: true`; гість — ключа немає; власник — `mine: true`.
    - `detail lists rounds by title and type only` — `entryDetail` → `rounds: [{ title, type }]`; прихований чи закритий → `null`.
    - `copy carries all content and the author line` — `copyEntry(db, b, id, 'uk', now)` → нова вікторина `b` з тими самими раундами й адресами `/uploads/...`, опис `'Автор: Олена\n…'`; `library_copy` з `author_line`; власник → `library_own`; прихований → `not_found`.
    - `the author line stays when a copy is opened` — `b` стирає рядок з опису копії й відкриває її → у знімку запису `b` опис знову починається з `'Автор: Олена'`, `origin_line` = цей рядок; копія від `c` з запису `b` — опис без другого «Автор:».
    - `plays count finished games of copies` — дві завершені й одна перервана гра копії → `plays: 2`; ігри самої вікторини автора — не рахуються.
    - `appeal once` — `hidden` → `appealEntry` → `ok`, `appealOpen: true`; удруге → `library_appeal_used`; `ok`-запис → `library_not_hidden`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/library-store.test.ts apps/server/src/db/schema.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** схему за «Запис бібліотеки», «Копія», «Скарги» (таблиця `user_report` — уже тут, її логіка — задача 4), згенерувати міграцію, переглянути SQL руками (лише `CREATE TABLE`, `ADD CONSTRAINT … FOREIGN KEY` нових таблиць, `CREATE [UNIQUE] INDEX`); далі `library-store.ts`. `escapeLike` — перенести тіло `pattern` з `admin-store.ts` і кликати його звідти (поведінка адмінки не змінюється). Копія — у транзакції: `visibleEntry` → `createQuiz` (на `tx`) → `library_copy`.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/library-store.test.ts apps/server/src/db/schema.test.ts apps/server/src/admin-store.test.ts apps/server/src/db-backup.test.ts apps/server/src/db-restore.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/db/schema.ts apps/server/src/db/schema.test.ts apps/server/drizzle apps/server/src/library-store.ts apps/server/src/library-store.test.ts apps/server/src/admin-store.ts
git commit -m "feat(server): 47 library — migration 0040 adds library entries, copies and reports; an entry is a snapshot taken at open or update (at least 5 questions, a valid quiz), the catalog shows only listed unmoderated entries of unbanned authors without questions or answers, searches, sorts by likes or newness and filters by language; a copy carries all content and media with «Author: …», which stays when a copy is opened"
```

---

### Задача 3. Сервер: маршрути бібліотеки — автор, каталог, ❤️, копія (`library-routes.ts`)

**Files:**
- Create: `apps/server/src/library-routes.ts`, `apps/server/src/library-routes.test.ts`
- Modify: `apps/server/src/app.ts` (`registerLibraryRoutes(app, { db: options.db, currentUser })` поруч із `registerGroupRoutes`), `apps/server/src/like-store.ts` (`saveLike`: `gameId: null` дозволено для `event` **і** `quiz`; коментар `LikeChange.gameId`), `apps/server/src/like-store.test.ts`

**Interfaces:**
- Consumes: сховище задачі 2; схеми задачі 1; `saveLike`.
- Produces (усі відповіді помилок — `{ error: <код> }`):
  - `GET /api/library` (без акаунта; 120/хв за IP) → `LibraryPage`; невірний запит → 400 `invalid_payload`.
  - `GET /api/library/:id` (без акаунта) → `LibraryDetail` | 404 `not_found`.
  - `PUT /api/library/:id/like` (`perUser('library-like', 30)`) → `{ likes, liked }`.
  - `POST /api/library/:id/copy` (`perUser('library-copy', 10)`) → 201 `{ id }`.
  - `GET /api/library/mine` → `LibraryMine[]`; `PUT /api/library/mine/:quizId` (`perUser('library-open', 20)`) → `{ entryId }`; `DELETE /api/library/mine/:quizId` → 204 | 404; `POST /api/library/mine/:quizId/appeal` (`perUser('library-open', 20)`) → 204.
  - Маршрут `/api/library/mine` оголошено **до** `/api/library/:id` (або `:id` перевіряється як UUID — `mine` не UUID → 404 не заважає; виконавець перевіряє, що Fastify віддає статичний шлях першим).

- [ ] **Step 1: Write the failing tests:**
  - `like-store.test.ts`: `a quiz like without a game` — `saveLike({ kind: 'quiz', gameId: null, quizId, liked: true })` пише рядок; `liked: false` знімає; власник — нічого; `kind: 'host'` з `gameId: null` — як і раніше нічого.
  - `library-routes.test.ts` (`buildApp({ db: await createTestDb(), auth: TEST_AUTH })`, `signUp`):
    - `the author opens, updates, closes and appeals` — `PUT …/mine/:quizId` `{ language: 'uk' }` → 200 `entryId`; 4 запитання → 409 `library_too_few`; чужа вікторина → 404; гість → 401; `GET …/mine` — стан; `DELETE` → 204 і в каталозі немає; `POST …/appeal` на неприхованому → 409 `library_not_hidden`.
    - `guests browse, the catalog never has answers` — гість: `GET /api/library` і `/api/library/:id` → 200; у тілі немає тексту запитань, відповідей, `ownerId`, email автора; `?sort=top` → 400.
    - `likes need an account and count once` — гість `PUT …/like` → 401; два `liked: true` від того самого акаунта → `likes: 1`; ❤️ з фінального екрана гри (рядок `user_like` з `game_id`) і з каталогу — той самий лічильник; власник → `{ likes: 0, liked: false }`; 31-й запит за хвилину → 429.
    - `copy needs an account` — гість → 401; акаунт → 201, `GET /api/quizzes/:id` нової — повний вміст і опис з «Автор: …»; `{ locale: 'en' }` → «Author: …»; свій запис → 409 `library_own`; прихований → 404; 11-та копія за хвилину → 429.
    - `banned author disappears` — `banUser` автора → `GET /api/library` без його запису, `/api/library/:id` → 404.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/library-routes.test.ts apps/server/src/like-store.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за Interfaces і «Рішення плану» (`perUser` — як у `group-routes.ts`; ❤️: `visibleEntry` → `saveLike` → лічильник і `liked` одним запитом).
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/library-routes.test.ts apps/server/src/like-store.test.ts apps/server/src/likes.test.ts apps/server/src/likes-routes.test.ts apps/server/src/app.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/library-routes.ts apps/server/src/library-routes.test.ts apps/server/src/app.ts apps/server/src/like-store.ts apps/server/src/like-store.test.ts
git commit -m "feat(server): 47 library — routes for the author (open, update, close, appeal), the public catalog and quiz page for guests too, likes from the catalog in the same quiz likes as the end screen, copying into own quizzes; likes, copies and opening are rate-limited and need an account"
```

---

### Задача 4. Сервер: скарги й авто-приховування (`report-store.ts`, `POST /api/reports`)

**Files:**
- Create: `apps/server/src/report-store.ts`, `apps/server/src/report-store.test.ts`
- Modify: `apps/server/src/library-routes.ts` (`POST /api/reports`, `perUser('report', 5)`), `apps/server/src/library-routes.test.ts`

**Interfaces:**
- Consumes: `visibleEntry` (задача 2), `isBanned`, `reportSchema`, `LIBRARY_AUTO_HIDE`.
- Produces:
```ts
export type ReportResult = 'ok' | 'not_found' | 'cannot_report_self' | 'already_reported';
export async function fileReport(db: Db, reporterId: string, input: { target: ReportTarget; reason: ReportReason; text?: string }, now: Date): Promise<ReportResult>;
```

- [ ] **Step 1: Write the failing tests** (`report-store.test.ts`):
  - `a report on a quiz and on a profile` — рядки `user_report` з `target_user_id` = власник / профіль, `text` за замовчуванням `''`.
  - `not on yourself, not twice, not on what is not there` — своя вікторина й свій профіль → `cannot_report_self`; друга відкрита скарга → `already_reported` (унікальний індекс → код, не 500); закритий, прихований запис, профіль заблокованого, неіснуючий id → `not_found`; після `status = 'dismissed'` — знову `ok`.
  - `three different accounts hide the quiz until a decision` — 2 скарги → `moderation: 'ok'`; третя від іншого акаунта → `auto_hidden`, каталог без запису; четверта (від уже приховане — `not_found`, бо ціль невидима).
  - `two parallel third reports switch once` — `Promise.all` двох третіх скарг → обидві `ok`, `moderation = 'auto_hidden'`, без помилок.
  - `dismissed reports do not count` — дві відкриті + одна `dismissed` + нова від того, чия була відхилена → `auto_hidden` лише тоді, коли відкритих від різних ≥ 3.
  - `library-routes.test.ts`: `reports need an account and are rate-limited` — гість → 401; `{ reason: 'ugly' }` → 400; 201; повтор → 409 `already_reported`; на себе → 409 `cannot_report_self`; 6-та за хвилину → 429.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/report-store.test.ts apps/server/src/library-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Скарги» (транзакція: ціль → вставка → для вікторини `select … for update` запису → підрахунок `count(distinct reporter_id)` відкритих → можливий перехід у `auto_hidden`; `isUniqueViolation` → `already_reported`).
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/report-store.test.ts apps/server/src/library-routes.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/report-store.ts apps/server/src/report-store.test.ts apps/server/src/library-routes.ts apps/server/src/library-routes.test.ts
git commit -m "feat(server): 47 reports — signed-in people report a library quiz or a profile with a reason and up to 300 characters, one open report per account and object, never on themselves; three different accounts hide the quiz until an admin decides; rate-limited"
```

---

### Задача 5. Сервер: черга «Скарги» й дії адміна з журналом (`admin-routes.ts`)

**Files:**
- Modify: `apps/server/src/report-store.ts` (`reportQueue`, `actOnQuiz`, `actOnProfile`), `apps/server/src/admin-routes.ts` (три маршрути), `apps/server/src/admin-routes.test.ts`, `apps/server/src/report-store.test.ts`

**Interfaces:**
- Consumes: `logAction` (`bans.ts`), `isAdmin`, `adminQuizActionSchema`, `adminProfileActionSchema`, `ADMIN_PAGE_SIZE`, `adminPages`, `pageOffset`.
- Produces:
```ts
export async function reportQueue(db: Db, page: number): Promise<AdminList<AdminReportItem>>;
export async function actOnQuiz(db: Db, input: { adminId: string; entryId: string; action: 'hide' | 'restore' | 'dismiss'; now: Date }): Promise<boolean>; // false — немає запису
export async function actOnProfile(db: Db, input: { adminId: string; userId: string; action: 'reset_nickname' | 'reset_avatar' | 'dismiss'; now: Date }): Promise<boolean>;
```
  Маршрути: `GET /api/admin/reports` (`read`) → `AdminList<AdminReportItem>`; `POST /api/admin/reports/quiz/:entryId` і `POST /api/admin/reports/profile/:userId` (`write`) → 204 | 404 | 400 | 409 `cannot_ban_admin`.

- [ ] **Step 1: Write the failing tests:**
  - `report-store.test.ts`:
    - `the queue groups reports by object` — 3 скарги на вікторину (2 `spam`, 1 `personal` з текстом) і 1 на профіль → два елементи, найдавніший першим: `reports: 3`, `reasons: { spam: 2, personal: 1 }`, `texts` — лише непорожні, до 5; відхилені й вирішені — не в черзі; оскарження (`appeal_open`) без скарг — елемент з `appeal: true`.
    - `hide, restore, dismiss` — `hide` → `moderation: 'hidden'`, скарги `resolved`, рядок `admin_action` `library_hide` з `details.title` і `target_user_id` = автор; `restore` після оскарження → `ok`, `appeal_open: false`, журнал `library_restore`; `dismiss` на `auto_hidden` → `ok`, скарги `dismissed`, журнал `report_dismiss`; `dismiss` на оскарженні → лишається `hidden`, `appeal_open: false`, журнал `appeal_reject`, повторне `appealEntry` → `library_appeal_used`.
    - `reset nickname and avatar` — `reset_nickname` → `profile.nickname` і `nickname_key` = null, журнал `nickname_reset` з `details.text` = старий нік, скарги профілю `resolved`; старий нік тепер вільний для іншого акаунта (`saveProfile`); `reset_avatar` → `avatar: null`, журнал `avatar_reset`.
  - `admin-routes.test.ts`: `the report queue is for admins only` — не-адмін і гість → 404 `not_found` на всі три маршрути; адмін → 200 з елементами; `{ action: 'ban' }` → 400; неіснуючий запис → 404; скинути нік адміна → 409 `cannot_ban_admin`; після `hide` → `GET /api/library` без запису, `GET /api/admin/log` має рядок `library_hide`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/report-store.test.ts apps/server/src/admin-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Черга й дії адміна» (кожна дія — одна транзакція з `logAction`; черга — два запити (вікторини, профілі), злиття й сторінка в пам'яті за `since` — обсяг черги малий; `texts` — `order by created_at desc`).
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/report-store.test.ts apps/server/src/admin-routes.test.ts apps/server/src/admin-store.test.ts apps/server/src/admin.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/report-store.ts apps/server/src/report-store.test.ts apps/server/src/admin-routes.ts apps/server/src/admin-routes.test.ts
git commit -m "feat(server): 47 moderation — the admin «Reports» queue groups open reports and appeals by object; admins hide or restore a quiz, reset a nickname or an avatar, or dismiss, each in the admin log; dismissing an appeal keeps the quiz hidden and the appeal used"
```

---

### Задача 6. Веб: «Відкрити для всіх» у «Мої вікторини» (`library/LibraryShare.tsx`)

**Files:**
- Create: `apps/web/src/library/LibraryShare.tsx`, `apps/web/src/library/LibraryShare.test.tsx`, `apps/web/src/library/library-api.ts`
- Modify: `apps/web/src/pages/Quizzes.tsx` (кнопка `libraryButton` у рядку після «Виклик»; рядок стану під розміром; окремий запит `myLibrary()` після `listQuizzes`, як `listMyChallenges`; кнопка `Link.btn to="/library"` у верхньому `toolbar`), `apps/web/src/pages/Quizzes.test.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,pl,de,es,it,ar}.json`, `apps/web/src/i18n.test.ts` (`ADDED_LIBRARY`, `ADDED_LIBRARY_PLURALS` — ключі цієї задачі: `libraryButton`, `libraryShare*`, `libraryOpen`, `libraryUpdate`, `libraryClose*`, `librarySnapshotHint`, `libraryStatus*`, `libraryAppeal*`, `libraryTitle`, `err_library_*` автора), `apps/web/src/styles.css`

**Interfaces:**
- Consumes: маршрути `/api/library/mine*` (задача 3), `LibraryMine`, `LOCALES`, `LOCALE_NAMES`, `currentLocale`.
- Produces:
```ts
// library-api.ts
export const myLibrary: () => Promise<ApiData<LibraryMine[]>>;
export const openInLibrary: (quizId: string, language: Locale) => Promise<ApiData<{ entryId: string }>>;
export const closeInLibrary: (quizId: string) => Promise<ApiResult<object>>;
export const appealLibrary: (quizId: string) => Promise<ApiResult<object>>;
export const libraryCatalog: (query: { q: string; sort: LibrarySort; lang: Locale | ''; offset: number }) => Promise<ApiData<LibraryPage>>;
export const libraryQuiz: (id: string) => Promise<ApiData<LibraryDetail>>;
export const likeLibrary: (id: string, liked: boolean) => Promise<ApiData<{ likes: number; liked: boolean }>>;
export const copyLibrary: (id: string) => Promise<ApiData<{ id: string }>>; // тіло { locale: currentLocale() }
export const sendReport: (input: { target: ReportTarget; reason: ReportReason; text?: string }) => Promise<ApiResult<object>>;
// LibraryShare.tsx
export function LibraryShare(props: { quiz: QuizSummary; entry: LibraryMine | null; onClose: () => void; onChanged: (entry: LibraryMine | null) => void }): JSX.Element;
export function libraryStatusText(entry: LibraryMine): string; // listed+ok → libraryStatusOpen; !listed → libraryStatusClosed; auto_hidden → libraryStatusAuto; hidden → libraryStatusHidden
```
  Аркуш — як `ChallengeLaunch` (`createPortal`, фокус на «Скасувати», Escape, `busyRef`): `h2` `libraryShareTitle`; без запису — `p.warning` `libraryShareWarning` (лише перед першим відкриттям), `select` `libraryShareLanguage`, кнопка `libraryOpen`; запис відкритий — `librarySnapshotHint`, `libraryUpdate`, `libraryClose` (`window.confirm(libraryCloseConfirm)`); закритий — `libraryOpen` (без попередження); `hidden` — `libraryStatusHidden` і `libraryAppeal` (`appealed` → `libraryAppealUsed`, кнопки немає); `auto_hidden` — `libraryStatusAuto`, без дій; помилка — `errorText`. Після успіху — `myLibrary()` і `onChanged`.

- [ ] **Step 1: Write the failing tests:**
  - `LibraryShare.test.tsx`: перше відкриття — попередження «Вікторину побачать усі користувачі сайту…», мова типово поточна, «Відкрити для всіх» → `openInLibrary(id, 'uk')` і `onChanged`; помилка `library_too_few` → «Для бібліотеки потрібно щонайменше 5 запитань.»; відкритий запис — «Оновити в бібліотеці» і «Закрити» з підтвердженням; `hidden` — «🚫 Приховано модератором» і «Оскаржити» → `appealLibrary` → «Оскарження надіслано»; `hidden` + `appealed` — «Оскарження вже використано» без кнопки; `auto_hidden` — «⏳ Тимчасово приховано: скарги на перевірці» без кнопок; Escape закриває, поки не `busy`.
  - `Quizzes.test.tsx`: у рядку вікторини з відкритим записом — «📚 Відкрито для всіх»; з прихованим — «🚫 Приховано модератором»; збій `myLibrary` — список вікторин видно; кнопка «📚 Бібліотека» відкриває аркуш; посилання «📚 Бібліотека» вгорі веде на `/library`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/library apps/web/src/pages/Quizzes.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за Interfaces і текстами; переклади в шести локалях (ті самі ключі й змінні); на 360 px аркуш на всю ширину, `select` — теж.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/library apps/web/src/pages/Quizzes.test.tsx apps/web/src/i18n.test.ts apps/web/src/locales apps/web/src/source-scan.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/library apps/web/src/pages/Quizzes.tsx apps/web/src/pages/Quizzes.test.tsx apps/web/src/i18n.ts apps/web/src/i18n.test.ts apps/web/src/locales apps/web/src/styles.css
git commit -m "feat(web): 47 library — «Open for everyone» in My quizzes: a personal-data warning before the first opening, the quiz language, update and close, the status line (open, closed, held for review, hidden by a moderator) and one appeal; seven languages"
```

---

### Задача 7. Веб: каталог `/library`, сторінка вікторини, ❤️ і копія; навігація

**Files:**
- Create: `apps/web/src/pages/Library.tsx`, `apps/web/src/pages/Library.test.tsx`, `apps/web/src/pages/LibraryQuiz.tsx`, `apps/web/src/pages/LibraryQuiz.test.tsx`, `apps/web/src/library/LibraryCardView.tsx`
- Modify: `apps/web/src/AppRoutes.tsx` (`/library`, `/library/:id`), `apps/web/src/AppRoutes.test.tsx`, `apps/web/src/menu/Menu.tsx` (`LIBRARY`; гість `[JOIN, LIBRARY, signIn]`; `QUIZZES.active` = `/quizzes…` або `/library…`), `apps/web/src/menu/Menu.test.tsx`, `apps/web/src/pages/Home.tsx` (плитка після «Мої вікторини»; гостю — `Link.quiet-link` `libraryGuestLink`), `apps/web/src/pages/Home.test.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/locales/*.json`, `apps/web/src/i18n.test.ts` (ключі `menuLibrary`, `menuShortLibrary`, `libraryGuestLink`, `librarySearch` … `libraryNoAnswers`, `err_library_own`, множини `libraryQuestions_*`, `libraryPlays_*`), `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `library-api.ts` (задача 6), `LibraryCard`, `LibraryDetail`, `ROUND_NAMES`, `LOCALE_NAMES`, `countText`.
- Produces: `Library()` — `main.app.wide`: `h1` `libraryTitle`; `input[type=search]` з `label` `librarySearch` (запит із затримкою 300 мс, у `?q=`), `select` `librarySort` (`popular`/`new`, у `?sort=`), `select` `libraryLanguage` (`libraryAnyLanguage` + сім мов, у `?lang=`); `ul.library-list` з `LibraryCardView`; «Показати ще» за `next`; порожньо — `libraryEmpty`. `LibraryCardView({ card })` — `Link` на `/library/:id`: назва (`dir="auto"`), `libraryBy`, `libraryQuestions_*`, назви типів раундів через `ROUND_NAMES`, мова, `❤️ N`, `libraryPlays_*`. `LibraryQuiz()` — опис (з переносами рядків), `h2` `libraryRounds` і список `назва — тип` (порожня назва — лише тип), `libraryNoAnswers`; з акаунтом — кнопка ❤️ (`aria-pressed`, `libraryLike`/`libraryLiked`, лічильник), «Копіювати собі» → `copyLibrary` → `libraryCopied` і `Link` `libraryOpenCopy` на `/quizzes/<id>` (кнопку «Поскаржитись» додає задача 8); власник (`mine`) — без ❤️ і копії; гість — `librarySignIn` з посиланням на `/login?next=…`; 404 — `err_not_found`.

- [ ] **Step 1: Write the failing tests:**
  - `Library.test.tsx`: картки з «Автор: Олена», «6 запитань», «зіграли 1 раз»/«2 рази»/«5 разів», назвами раундів; пошук «дніпро» → `libraryCatalog({ q: 'дніпро', … })` після затримки (фальшиві таймери); «Нові» → `sort: 'new'`; мова «English» → `lang: 'en'`; «Показати ще» додає сторінку; порожньо — «Нічого не знайдено.»; працює й для гостя.
  - `LibraryQuiz.test.tsx`: раунди «Річки — Класика»; немає тексту жодного запитання (фікстура відповіді API його й не має — перевірка, що сторінка не просить `/api/quizzes`); ❤️ → `likeLibrary(id, true)` і лічильник; «Копіювати собі» → «Скопійовано в «Мої вікторини»» і посилання на копію; гість — «Увійди, щоб копіювати, вподобати чи поскаржитись», кнопок немає; `mine` — без ❤️ і копії.
  - `Menu.test.tsx`: гість — `['/', '/library', '/login?next=…']`; з акаунтом — п'ять пунктів, як і раніше; на `/library` активний «Мої вікторини».
  - `Home.test.tsx`: плитка «Бібліотека» → `/library`; гостю — «📚 Бібліотека вікторин».
  - `AppRoutes.test.tsx`: `/library` і `/library/:id` відкривають сторінки.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/pages/Library.test.tsx apps/web/src/pages/LibraryQuiz.test.tsx apps/web/src/menu apps/web/src/pages/Home.test.tsx apps/web/src/AppRoutes.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за Interfaces; короткий підпис меню ≤ 7 символів у кожній мові (en «Library», pl «Biblio», de «Biblio», es «Biblio», it «Biblio», ar «مكتبة»); на 360 px картка — у стовпчик, довга назва й нік переносяться (`overflow-wrap: anywhere`).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/pages apps/web/src/library apps/web/src/menu apps/web/src/AppRoutes.test.tsx apps/web/src/i18n.test.ts apps/web/src/locales apps/web/src/source-scan.test.ts apps/web/src/styles-light.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/pages apps/web/src/library apps/web/src/menu apps/web/src/AppRoutes.tsx apps/web/src/AppRoutes.test.tsx apps/web/src/i18n.ts apps/web/src/i18n.test.ts apps/web/src/locales apps/web/src/styles.css
git commit -m "feat(web): 47 library — the /library catalog for guests and accounts with search, popular or new and a language filter, cards with author, questions, round types, likes and plays; the quiz page lists rounds without questions or answers, likes and copies into My quizzes; «Library» in the guest menu, on the home screen and in My quizzes; seven languages"
```

---

### Задача 8. Веб: «Поскаржитись» на вікторину й профіль (`library/ReportDialog.tsx`)

**Files:**
- Create: `apps/web/src/library/ReportDialog.tsx`, `apps/web/src/library/ReportDialog.test.tsx`
- Modify: `apps/web/src/pages/LibraryQuiz.tsx` (кнопка `reportButton` з акаунтом, не власнику), `apps/web/src/pages/PublicProfile.tsx` (кнопка `reportButton`, коли `following !== null` — акаунт і не власник; **без** нових запитів при відкритті профілю), `apps/web/src/pages/LibraryQuiz.test.tsx`, `apps/web/src/pages/PublicProfile.test.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/locales/*.json`, `apps/web/src/i18n.test.ts` (ключі `report*`, `err_already_reported`, `err_cannot_report_self`), `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `sendReport` (задача 6), `REPORT_REASONS`, `REPORT_TEXT_MAX`.
- Produces: `export function ReportDialog(props: { target: ReportTarget; onClose: () => void }): JSX.Element` — аркуш як `LibraryShare`: `h2` `reportTitle`, `fieldset` з `legend` `reportReason` і чотирма `radio` (`reportReason_<reason>`, жоден не вибраний — «Надіслати» неактивна), `textarea` `reportText` з `maxLength={REPORT_TEXT_MAX}` і лічильником `N/300`, «Надіслати» → `sendReport` → `reportSent` і закриття через 1,5 с або кнопкою; помилки — `errorText`.

- [ ] **Step 1: Write the failing tests:**
  - `ReportDialog.test.tsx`: без причини «Надіслати» неактивна; «Спам» + текст → `sendReport({ target, reason: 'spam', text: '…' })` і «Дякуємо, скаргу надіслано.»; порожній текст не надсилається (`text` немає); 301-й символ не вводиться; `already_reported` → «Ти вже поскаржився(-лася) — скарга на перевірці.»; Escape закриває.
  - `LibraryQuiz.test.tsx`: «Поскаржитись» відкриває вікно з `{ kind: 'quiz', entryId }`; гостю й власнику кнопки немає.
  - `PublicProfile.test.tsx`: чужий профіль з акаунта — «Поскаржитись» з `{ kind: 'profile', userId }`; гість і власник — немає; відкриття профілю робить ті самі запити, що й раніше (перевірка викликів `fetch`).
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/library apps/web/src/pages/LibraryQuiz.test.tsx apps/web/src/pages/PublicProfile.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement**; переклади в шести локалях.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/library apps/web/src/pages apps/web/src/i18n.test.ts apps/web/src/locales apps/web/src/source-scan.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/library apps/web/src/pages apps/web/src/i18n.ts apps/web/src/i18n.test.ts apps/web/src/locales apps/web/src/styles.css
git commit -m "feat(web): 47 reports — «Report» on a library quiz and on someone else's profile: a reason (offensive, spam, personal data, other) and an optional note up to 300 characters, for accounts only, with no extra profile requests; seven languages"
```

---

### Задача 9. Веб: адмінка «Скарги» й рядки журналу (`admin/AdminReports.tsx`)

**Files:**
- Create: `apps/web/src/admin/AdminReports.tsx`, `apps/web/src/admin/AdminReports.test.tsx`
- Modify: `apps/web/src/admin/Admin.tsx` (вкладка `{ to: '/admin/reports', key: 'adminTabReports', end: false }` після «Вікторини»; `Route path="reports"`), `apps/web/src/admin/Admin.test.tsx`, `apps/web/src/admin/admin-api.ts` (`adminReports(page)`, `actOnQuizReport(entryId, action)`, `actOnProfileReport(userId, action)`), `apps/web/src/admin/admin-text.ts` (`logLine` для `nickname_reset` дописує старий нік з `details.text`), `apps/web/src/admin/admin-text.test.ts`, `apps/web/src/i18n.ts`, `apps/web/src/locales/*.json`, `apps/web/src/i18n.test.ts` (ключі `adminTabReports`, `adminReport*`, `adminHideQuiz`, `adminRestoreQuiz`, `adminResetNick`, `adminResetAvatar`, `adminDismissReport`, `adminLog_*` нових видів, `adminReportCount_*`), `apps/web/src/styles.css`

**Interfaces:**
- Consumes: маршрути задачі 5, `AdminReportItem`, `useAdminData`, `AdminPager`.
- Produces: `AdminReports()` — `p.meta` `adminReportsIntro`; `ul.admin-reports` з `li.panel` на елемент: заголовок (`adminReportQuiz` / `adminReportProfile`, `nickText`), `adminReportCount_*`, причини `reportReason_<r> × N`, тексти скарг (`blockquote`, `dir="auto"`), позначка `libraryStatusAuto`/`libraryStatusHidden`, `adminReportAppeal`; посилання `adminReportOpenQuiz` → `/admin/quizzes/<quizId>`, `adminReportOpenUser` → `/admin/users/<id>`; кнопки: вікторина — `adminHideQuiz` (крім `hidden`), `adminRestoreQuiz` (лише `hidden` з оскарженням), `adminDismissReport`; профіль — `adminResetNick` (є нік), `adminResetAvatar` (є аватар), `adminDismissReport`; кожна — з `window.confirm`, після успіху — перечитати сторінку; порожньо — `adminReportsEmpty`.

- [ ] **Step 1: Write the failing tests:**
  - `AdminReports.test.tsx`: вікторина з 3 скаргами — «Вікторина «Річки України» — Олена», «3 скарги», «Спам × 2», текст скарги, «⏳ Тимчасово приховано: скарги на перевірці»; «Сховати вікторину» → `actOnQuizReport(id, 'hide')` і перечитування; оскарження — «Автор оскаржує приховування», «Повернути в каталог» і «Відхилити скаргу», без «Сховати»; профіль — «Скинути нік», «Скинути аватар» (без аватара — немає); порожньо — «Відкритих скарг немає.».
  - `Admin.test.tsx`: вкладка «Скарги» є й веде на `/admin/reports`.
  - `admin-text.test.ts`: `logLine` для `library_hide`, `nickname_reset` (зі старим ніком), `avatar_reset`, `appeal_reject` — повні рядки.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/admin`. Expected: FAIL.
- [ ] **Step 3: Implement**; переклади; на 360 px кнопки переносяться (`toolbar`), довгий текст скарги — `overflow-wrap: anywhere`.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/admin apps/web/src/i18n.test.ts apps/web/src/locales apps/web/src/source-scan.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/admin apps/web/src/i18n.ts apps/web/src/i18n.test.ts apps/web/src/locales apps/web/src/styles.css
git commit -m "feat(web): 47 moderation — the admin «Reports» tab: open reports and appeals per object with reasons and notes, hide or restore a quiz, reset a nickname or an avatar, dismiss; new admin log lines; seven languages"
```

---

### Задача 10. Довідка автора: «Бібліотека» (`setting.library`)

**Files:**
- Modify: `apps/web/src/help/host-help.ts` (`'library'` в кінець `SETTING_HELP_KEYS`), `apps/web/src/help/help-uk.ts` (записи після `setting.league.*`), `apps/web/src/help/__fixtures__/help-uk-golden.json`, `apps/web/src/locales/{en,pl,de,es,it,ar}.help.json`, `apps/web/src/library/LibraryShare.tsx` (`HelpButton id="setting.library"` у заголовку), `apps/web/src/pages/Library.tsx` (той самий `HelpButton` біля `h1`)
- Test: `apps/web/src/help/help-golden.test.ts`, `apps/web/src/help/host-help.test.ts` (наявні), `apps/web/src/library/LibraryShare.test.tsx` (ⓘ)

**Тексти (uk):**
- `title`: «Бібліотека вікторин»
- `what`: «Спільна полиця вікторин: відкрий свою для всіх або скопіюй чужу й грай як свою.»
- `how.0`: «У «Мої вікторини» натисни «📚 Бібліотека» → «Відкрити для всіх» і обери мову. Потрібно щонайменше 5 запитань і вікторина без помилок.»
- `how.1`: «У бібліотеці — знімок на мить відкриття. Змінив вікторину — натисни «Оновити в бібліотеці». «Закрити» прибирає її з каталогу; вже зроблені копії лишаються в людей.»
- `how.2`: «У каталозі шукай за назвою чи описом, обирай «Популярні» чи «Нові» й мову. Запитань і відповідей там не видно. «Копіювати собі» кладе повну копію в «Мої вікторини» з рядком «Автор: …» в описі.»
- `points.0`: «Каталог бачать усі, навіть без входу; ❤️, копіювати й скаржитися можна лише з акаунтом. Іншим видно лише твій нікнейм.»
- `tip.0`: «Не додавай особисті фото чи дані — свої, рідних чи друзів: вікторину зможе скопіювати будь-хто.»
- `limits.0`: «На вікторину можна поскаржитися. Після трьох скарг від різних людей вона ховається до рішення модератора. Якщо модератор її сховав, ти можеш один раз оскаржити це рішення.»

- [ ] **Step 1: Write the failing test:** `LibraryShare.test.tsx` — у заголовку є ⓘ; клік відкриває запис «Бібліотека вікторин». Golden-тест із новим ключем у `SETTING_HELP_KEYS` без записів — FAIL.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/help apps/web/src/library`. Expected: FAIL.
- [ ] **Step 3: Implement:** записи uk, golden (той самий текст), переклади в шести `*.help.json` (ті самі ключі).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/help apps/web/src/i18n.test.ts apps/web/src/library apps/web/src/pages/Library.test.tsx && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/help apps/web/src/locales apps/web/src/library apps/web/src/pages/Library.tsx
git commit -m "docs(web): 47 library — the help entry on opening a quiz for everyone, the snapshot and update, the catalog without answers, copying with «Author: …», personal data, reports, the three-report hold and the single appeal, in seven languages"
```

---

### Задача 11. Наскрізні сценарії й кадри (`part47-library.e2e.ts`)

**Files:**
- Create: `apps/server/e2e/part47-library.e2e.ts`

Сценарії (`useE2eServer`; телефони 360×740, світла тема init-скриптом `quiz:theme`; вміст — річки й міста України, таймери 25–30 с, так/ні — і «так», і «ні»):

- `part 47: library — open for everyone, guest and account browse, like, copy with «Author», play the copy, three reports hold the quiz, the admin hides it, the author appeals once, a nickname is reset, phone 360 px, light theme`:
  1. Адмін (`relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: 'admin47@example.com' }) })`, `register`, `emailVerified: true`), «Олена», «Тарас», «Ірина», «Петро» (`register`). Олена створює вікторину «Річки України 47» (класика, 6 запитань: `single` «Яка річка тече через Київ?» → «Дніпро»; `boolean` «Дністер впадає в Азовське море?» → «ні»; `boolean` «Південний Буг впадає в Чорне море?» → «так»; `single` «На якій річці стоїть Ужгород?» → «Уж»; `boolean` «Десна — притока Дніпра?» → «так»; `boolean` «Прут тече через Харків?» → «ні»; один варіант має зображення `/uploads/...` через наявне завантаження) і вікторину на 4 запитання.
  2. Олена: «Мої вікторини» → «📚 Бібліотека» на 4-запитальній → «Відкрити для всіх» → «Для бібліотеки потрібно щонайменше 5 запитань.»; на «Річки України 47» — попередження про особисті дані (кадр `p47-share`, `expectNoSideScroll`), мова «Українська», «Відкрити для всіх» → «📚 Відкрито для всіх». Потім Олена змінює назву в редакторі на «Річки України 47 (нова)» — у каталозі стара назва; «Оновити в бібліотеці» → нова.
  3. Гість (без входу): меню з «Бібліотекою» (`expectPhoneFit`), `/library` → пошук «дніпр» знаходить за описом (кадр `p47-catalog`); сторінка вікторини — раунд «Класика», жодного тексту запитання на сторінці й у відповіді `GET /api/library/:id` (перевірка `bodyText` і JSON), «Увійди, щоб копіювати…» (кадр `p47-guest`); `PUT …/like` і `POST …/copy` гостя → 401.
  4. Тарас: ❤️ → лічильник 1; «Копіювати собі» → «Скопійовано…» → «Відкрити копію» → в описі «Автор: Олена» (кадр `p47-copy`), картинка — та сама адреса; Тарас запускає копію з пульта, Ірина грає з телефона до кінця; у каталозі — «зіграли 1 раз».
  5. Тарас, Ірина й Петро скаржаться на вікторину («Спам», «Особисті дані» з текстом, «Інше»; кадр вікна `p47-report`); повторна скарга Тараса → «Ти вже поскаржився(-лася)…»; після третьої — вікторини немає в каталозі, в Олени — «⏳ Тимчасово приховано…».
  6. Адмін: «Скарги» — «3 скарги», причини й текст (кадр `p47-admin`); «Сховати вікторину» → в Олени «🚫 Приховано модератором»; «Відкрити для всіх» після «Закрити» → помилка приховування; журнал має «… сховав(-ла) вікторину «Річки України 47 (нова)» …».
  7. Олена: «Оскаржити» → «Оскарження надіслано»; адмін бачить «Автор оскаржує приховування», «Повернути в каталог» → вікторина знову в каталозі; другого «Оскаржити» вже немає (`POST …/appeal` → 409 після нового приховування).
  8. Петро ставить нік «Петро Кривий 47», Ірина з його публічного профілю «Поскаржитись» → «Образливе»; адмін «Скинути нік» → у профілі Петра — «Гравець» (кадр `p47-reset`), журнал — рядок про скинутий нік; копія Тараса лишилася з «Автор: Олена».
  9. Світла тема — клас, який ставить `applyThemeClass` (`apps/web/src/theme-mode.ts`), світлий на всіх кадрах; кожен кадр — `expectNoSideScroll` на 360 px (назва 120 символів у картці каталогу).

- [ ] **Step 1: Write the scenarios.** Якщо додавання `LIBRARY` до меню гостя ламає наявні e2e-перевірки меню гостя — оновити їх у цьому ж коміті (меню з акаунтом не змінюється, `MENU_ITEMS_23A` і `expectFiveItems` лишаються).
- [ ] **Step 2: Run** `pnpm build`, потім (після завершення збирання) `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 47"` з `E2E_SHOTS=1` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 3: Переглянути кадри:** аркуш відкриття, каталог, сторінка гостя, копія, вікно скарги, черга адміна, скинутий нік — на 360 px без бокового скролу, довгі назви й ніки переносяться, світла тема.
- [ ] **Step 4: Commit**
```bash
git add apps/server/e2e/part47-library.e2e.ts
git commit -m "test(e2e): part 47 — the library: an author opens a quiz for everyone (5-question minimum, snapshot and update), a guest finds it without seeing answers, an account likes and copies it with «Author», the copy is played, three reports hold it, the admin hides it, the author appeals once and the admin restores it, a reported nickname is reset; phone 360 px, light theme"
```

---

## Розбіжності зі специфікацією (рішення плану)

1. **«Бібліотека» в нижньому меню — лише для гостя.** З акаунтом меню вже має п'ять пунктів, і саме п'ять закріплено на 360 px (CSS «по 72 px», e2e `expectFiveItems` у десяти місцях); шостий пункт робить підписи тісними в кількох мовах. Тому з акаунтом «Бібліотека» — плитка на головній, кнопка вгорі «Мої вікторини», а пункт «Мої вікторини» підсвічується й на `/library`; гість має її пунктом меню (у нього лише два пункти) і посиланням на головній. Якщо власник хоче шостий пункт для всіх — окрема невелика правка меню й e2e.
2. **Мову обирає автор при відкритті.** У налаштуваннях вікторини мовного поля немає («з налаштувань вікторини, якщо є» — немає); мова живе в записі бібліотеки, типово — мова інтерфейсу автора. Поле в самій вікторині не додається (воно зачепило б редактор і `quizSchema`).
3. **«Скинути нік» → нік порожній, а не новий згенерований рядок.** Наявний генератор (`ensureProfile`) бере нік з імені акаунта — саме ім'я могло бути причиною скарги. Порожній нік — уже підтримуваний стан: усюди показується «Гравець» мовою глядача (`defaultNickname`), старий нік звільняється, людина може обрати новий у профілі. «Аватар → типовий» — `avatar = null`; файл у сховищі лишається (сервер завантажень не видаляє).
4. **❤️ з каталогу — ті самі ❤️ вікторини, що й з фінального екрана гри** (`user_like` виду `quiz` на вікторину автора): одна вподобайка на людину й вікторину, лічильник «автор» у профілі, «Мені сподобались» працюють без змін. Для цього `saveLike` приймає `gameId: null` і для виду `quiz`. Популярність у каталозі — усі ❤️ вікторини, зокрема поставлені після гри до відкриття.
5. **«Зіграли N разів» — завершені ігри копій з бібліотеки** (не копіювання й не ігри самого автора): чесно «з бібліотеки» і просто порахувати.
6. **«Автор: …» — мовою того, хто копіює** (мітка й підставка ніку в спільному коді для семи мов); рядок іде першим у описі, опис обрізається, щоб уміститися в 500 символів. Коли копію відкривають для всіх, у знімку рядок оригінального автора відновлюється, навіть якщо новий власник стер його з опису; копія такої копії другого «Автор:» не дописує.
7. **Закрити приховану вікторину можна, але зняти приховування — ні:** запис лишається зі станом модерації, «Відкрити» й «Оновити» прихованої — помилка. Видалення вікторини видаляє запис (і скарги на неї); копії лишаються.
8. **Автоматичне приховування й рішення адміна:** «Відхилити скаргу» на тимчасово прихованій повертає її в каталог; на оскарженні — лишає прихованою (оскарження використано, журнал `appeal_reject`). Автоматичне приховування не пишеться в журнал адміна — це не дія адміна.
9. **Довідка адміна — пояснювальний рядок у вкладці «Скарги»**, а не запис довідки: розділу довідки для адмінки немає. Довідка автора — `setting.library`.
10. **Скаржника адмін не бачить** — лише кількість, причини й тексти; власну скаргу відкликати не можна (не просили).
