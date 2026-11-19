# План 57: перегляд і перевірка вікторини в адмінці (44b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** План не торкається рушія, `GameState`, `SavedRoom` і зрізів. Якщо виконавцю знадобиться змінити щось із цього — **зупинитися й спитати контролера**.

> **Міграції немає.** Кеш перевірок — у пам'яті процесу; новий вид журналу `quiz_view` — значення `text`-колонки `admin_action.kind`.

> **Будувати після плану 56** (бот за розкладом, 44a, `docs/superpowers/plans/2026-11-19-plan-56-*.md`, пише інший агент; його файлу не торкатися). Від `main` після злиття 56; якщо 56 ще не злитий — додавати так само й у конфлікті лишати обидві сторони. **Точки злиття з 56:**
> - `packages/shared/src/admin.ts` — рядок `ADMIN_ACTION_KINDS` (56 додає види плану розкладу, 57 — `quiz_view`), тип `AdminBotQuiz` / `AdminBot` (57 додає `AdminBotQuiz.check`);
> - `apps/server/src/admin-routes.ts` — `AdminDeps` (57: `storage`, `checkFetch`), третій аргумент `registerAdminBotRoutes(…, { read, write, adminOf, checker })`, рядки реєстрації в кінці;
> - `apps/server/src/admin-bot-routes.ts` — `GET /api/admin/bot` (57 дописує `check` у кожну вікторину);
> - `apps/server/src/app.ts` — виклик `registerAdminRoutes` (нові поля), `AppOptions`;
> - `apps/web/src/admin/Admin.tsx` — `<Routes>` (57: `bot/quizzes/:id`; 56, ймовірно, свій підмаршрут «Розклад»); `TABS` 57 не змінює;
> - `apps/web/src/admin/AdminBot.tsx` — картка вікторини бота (57: «Переглянути», «Перевірити», значок «⚠ N», попередження перед запуском; 56 — «Запланувати гру» поруч);
> - `apps/web/src/i18n.ts` (блок адмінки ~4194–4340), `locales/*.json`, `apps/web/src/i18n.test.ts` (новий список `ADDED_QUIZ_CHECK_57` і довга умова `adds no uk keys beyond the agreed list` ~675 — там же 56 допише свій список);
> - `apps/server/src/admin-routes.test.ts` — список `routes` у `hiding the admin panel (Review Focus 3)` ~91;
> - `apps/web/src/styles.css` (кінець блоку `.admin-*`).

> **Звірка з кодом.** План спирається на `main` 2026-11-19 (`e7d89511`, після злиття плану 54):
> - перегляд **уже є**: `apps/web/src/admin/AdminQuiz.tsx` (`AdminQuiz` — `/admin/quizzes/:id`, з видаленням запитань і вікторини; `AdminReportedQuiz` — знімок скарги, `readOnly`; спільні `Loaded`/`QuizView`; картка — `questionLines(question)` з `admin-text.ts` + одна мініатюра `question.imageUrl`), API `GET /api/admin/quizzes/:id` (`admin-routes.ts` ~224 → `admin-store.ts` `adminQuiz(db, id)` ~206, у журнал **не пише**), список — `AdminQuizzes.tsx` (кнопка `adminView` «Переглянути»); вкладка `AdminBot.tsx` (вікторини бота з «Запустити гру»/«Видалити», без перегляду); маршрути — `Admin.tsx`;
> - перевірки витоку: `packages/shared/src/quiz.ts` `wordIn(text, word)` ~1178 (ціле слово за `answerKey`), схема — `spy_leak` ~1019; веб-редактор `apps/web/src/editor/draft.ts` `spyLeaks`/`spyHintLeaks` ~1397; сіди — `apps/server/scripts/mix-quiz.test.ts` ~148 (`leaks no answer into its question…`: правильна відповідь у тексті, підказці, підказках `clues`);
> - автопілот: `packages/shared/src/autopilot.ts` `autopilotCheck(quiz)` ~109 → `{ blocked: { code, rounds }[], changed }`; тексти `autopilotBlock_<code>` у `i18n.ts` ~4337;
> - схема: `quizSchema`; рядок бази → вікторина: `apps/server/src/quizzes.ts` `quizOf(row)` ~50 (зібраний `stored`, `safeParse`, зламаний рядок повертається як є);
> - медіа: `IMAGE_URL` / `AUDIO_URL` — лише `/uploads/<16–64 [a-z0-9]>.<ext>` (`quiz.ts` ~318, ~332), `YOUTUBE_ID` ~335, `videoSchema { id, start }` (тривалості немає), `audio: { source: 'file', url } | { source: 'youtube', id }` + `start`, `duration`; `videoclip.clip` — теж `videoSchema`; `videoLink(video)` у `youtube.ts` ~60; сховище — `apps/server/src/storage/images.ts` `ImageStorage { put, get }` (`memoryStorage`, `diskStorage`), `storage/r2.ts` `r2Storage` (підпис `aws4fetch`, `settings.fetch` підміняється в тестах), передається в `buildApp` як `options.storage` (`app.ts` ~139), у `main.ts` ~69; файл віддає `GET /uploads/:name` (`upload-routes.ts` ~104);
> - YouTube у сідах: `apps/server/scripts/movies90/check.ts` ~108–117 (`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<id>&format=json`, `r.ok`), тривалість — `lengthSeconds` зі сторінки ролика (`video-quiz.ts` коментар ~5);
> - вихідні запити сервера: глобальний `fetch` лише в `storage/r2*.ts`, і там підміняється полем `fetch`; глобального заглушення мережі в тестах **немає** — тому нова перевірка бере `fetch` тільки з параметрів;
> - кеш: `apps/server/src/ttl-cache.ts` (одне значення), `ADMIN_CACHE_MS = 600_000` у `packages/shared/src/admin.ts`;
> - журнал: `bans.ts` `logAction(tx, { adminId, kind, targetUserId, details, now })`, веб `admin-text.ts` `logLine` (`adminLog_<kind>` з `{admin} {target} {title} {code}`);
> - тести: `admin-routes.test.ts` (`person`, `lastLog()` ~59, список `routes` ~91), `AdminQuiz.test.tsx` (мок `./admin-api`, фікстура `view(...)`), `AdminBot.test.tsx`, `admin-text.test.ts`; e2e — `apps/server/e2e/helpers/setup.ts` (`relisten(extra: Partial<AppOptions>)`, `avatarPng()`, `problems`), `part54-bot-host.e2e.ts` (адмін через `relisten({ adminEmails: adminEmails({ ADMIN_EMAILS }) })`, `light`, `view`, `viewportShot`).
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

**Мета:** адмін відкриває будь-яку вікторину лише для читання — з правильними відповідями, написаннями, підказками, мініатюрами, відео з часом старту, балами й таймерами, згорнутими раундами довгих вікторин; кожен перегляд — у журналі; кнопка «Перевірити вікторину» повертає «Усе добре» або «Помилки» / «Попередження» з переходом до запитання; у вкладці «Бот» — «⚠ N» і попередження перед запуском.

**Архітектура:** спільне `packages/shared/src/quiz-check.ts` — чисті перевірки без мережі (схема, структура, таймери, витоки, автопілот) і збирач медіа-посилань з будь-якого (навіть зламаного) JSON вікторини. Сервер — `apps/server/src/quiz-check.ts`: `quizChecker` додає мережеві перевірки (сховище через новий `ImageStorage.has`, зовнішні адреси, YouTube oEmbed і тривалість) з обмеженням 8 одночасних запитів, тайм-аутом 5 с, кешем 10 хв і останнім результатом для значка; маршрут `POST /api/admin/quizzes/:id/check`; `GET /api/admin/quizzes/:id` пише `quiz_view`. Веб — розширена `AdminQuiz.tsx` (новий модуль `quiz-preview.ts`), компонент `QuizCheck.tsx`, доповнені `AdminQuizzes.tsx` і `AdminBot.tsx`.

**Технології:** TypeScript, zod 4, Fastify + `@fastify/rate-limit`, drizzle (Postgres), `aws4fetch` (R2), vitest (проєкти `shared`/`server`/`web`), React 19 + Testing Library, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-19-quiz-preview-check-design.md` (44b); основа адмінки — `docs/superpowers/specs/2026-11-01-admin-panel-design.md`, бот — план 54.

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22**; рушій (`packages/engine`) не змінюється взагалі.
- **Міграцій немає**; кеш перевірок — лише в пам'яті (після перезапуску значків немає, доки не перевірять знову).
- **Адмінка — лише адмінам:** новий `POST /api/admin/quizzes/:id/check` — через `write` (ворота `gate`), не-адміну й гостю — та сама **404**, що й невідомий маршрут, **без жодного вихідного запиту**; маршрут — у списку `routes` тесту `hiding the admin panel (Review Focus 3)`. Відповіді й деталі перевірки (там бувають тексти відповідей) не йдуть нікуди, крім адмінських відповідей і журналу.
- **Без мережі в юніт-тестах:** перевірка бере `fetch` лише з параметра; `buildApp` без `checkFetch` підставляє `offlineFetch` (завжди відхиляє), справжній `fetch` передає тільки `main.ts`; e2e — заглушку.
- Усі тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`; нові uk-ключі — у новому списку `ADDED_QUIZ_CHECK_57` у `i18n.test.ts`: в умову `adds no uk keys beyond the agreed list` і в тест наявності в усіх локалях з тими самими `{змінними}` (як `54 keys (the bot tab) are in every language` ~486). Плюральних ключів план не додає. ru немає.
- Кириличні літерали в `apps/web/src/` — лише в словниках і тестах (`source-scan.test.ts`); «⚠» і «✓» — не кирилиця, можна в коді.
- **Нічого, пов'язаного з росією**, — у фікстурах, назвах вікторин, e2e.
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm exec tsc -p <пакет>`, з задачі 4 — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів vitest).
- Файли правити лише Edit/Write чи `sed`; **python3 на цій машині — порожня заглушка, ним нічого не правити й не генерувати**; після коміту — `git show --stat`.
- Робоче дерево — лише в `C:\ClaudeCode\quiz\.superpowers\worktrees\plan57`; жодних файлів поза `C:\ClaudeCode\quiz` (тимчасові — у `.superpowers` чи scratchpad сесії). Дерева плану 56 не торкатися.
- e2e: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 57"`; телефон 360 × 740, світла тема (`quiz:theme = light`, `is-light` на `<html>`).
- Таймер запитань у фікстурах і e2e ≥ 25 с; виняток — лише фікстури юніт-тестів, що навмисно перевіряють попередження `short_timer`. У фікстурах «так/ні» — приблизно половина «ні».

## Рішення плану (там, де специфікація мовчить)

**Спільне (`packages/shared/src/quiz-check.ts`, експорт з `index.ts`)**
- Коди й важкість (важкість — з коду, не окреме поле):
  ```ts
  export const QUIZ_CHECK_ERRORS = ['schema', 'media_missing', 'media_unreachable', 'video_missing', 'video_not_embeddable', 'video_start_past_end', 'empty_answer', 'no_correct', 'duplicate_option', 'answer_leak', 'autopilot_blocked'] as const;
  export const QUIZ_CHECK_WARNINGS = ['short_timer', 'hint_leak', 'media_unchecked', 'video_unchecked'] as const;
  export type QuizCheckCode = (typeof QUIZ_CHECK_ERRORS)[number] | (typeof QUIZ_CHECK_WARNINGS)[number];
  export function checkSeverity(code: QuizCheckCode): 'error' | 'warning';
  /** round — індекс раунду (null: запасні, дуелі, уся вікторина); question — перші 80 символів тексту; detail — адреса, id відео, відповідь, секунди, код блокування чи шлях схеми. */
  export interface QuizCheckIssue { code: QuizCheckCode; round: number | null; questionId: string | null; question: string | null; detail: string | null }
  export interface AdminQuizCheck { quizId: string; checkedAt: string; errors: number; warnings: number; issues: QuizCheckIssue[] }
  export const QUIZ_CHECK_MIN_TIMER = 25;
  ```
- `quizPlaces(raw: unknown): QuestionPlace[]`, `interface QuestionPlace { round: number | null; question: Record<string, unknown> }` — **обхід сирого JSON**, бо стара вікторина може не пройти схему: у `raw.rounds[i]` (рекурсивно: клітинки поля, `trials`, `spares` категорій) — кожен об'єкт з рядковими `id`, `text` і `type ∈ QUESTION_TYPES` → `round: i`; так само в `raw.spares` → `round: null`. Дуелі — окремо (`raw.duels.categories[].questions[]`, `round: null`).
- `mediaRefs(raw: unknown): MediaRef[]` — той самий обхід усього `raw`; `type MediaRef = { kind: 'storage'; name: string; place } | { kind: 'url'; url: string; place } | { kind: 'youtube'; id: string; start: number; place }`, `place: { round: number | null; questionId: string | null; question: string | null }` (найближче запитання-предок). Правила: рядок `^/uploads/(.+)$` → `storage` (name — після `/uploads/`); рядок `^https?://` у ключі, що закінчується на `Url`/`url` → `url`; об'єкт з `id`, що відповідає `YOUTUBE_ID`, і числовим `start`, під ключем `video`/`clip` або з `source === 'youtube'` → `youtube`. Так ловляться всі місця картинок (варіанти, картки «Пам'яті», пазл, «Знайди відмінності»), аудіо й відео без переліку типів.
- `staticIssues(raw: unknown): QuizCheckIssue[]` — без мережі, порядок: спершу всі помилки, потім попередження; усередині — за раундом і місцем у вікторині:
  - `schema`: `quizSchema.safeParse(raw)`; кожна вада (не більше 20) → `detail = '<path.join(".")>: <message>'`, `questionId` — з найближчого запитання за шляхом;
  - структура — **на сирих даних, обережно** (кожне запитання у своєму `try`; невідома форма — пропуск): `empty_answer` — `accepted` (типи `text`, `drawing`, `clues`, `melody`, `videoclip`, `bluff`, `spy`) відсутній, порожній чи з самих порожніх рядків; `no_correct` — `single` без `correctId` серед `options[].id`, `multi` з порожнім `correctIds` чи id поза варіантами; `duplicate_option` — `single`/`multi`/`poll` з двома непорожніми текстами варіантів з однаковим `answerKey` (`detail` — текст);
  - `short_timer`: число `timeLimit < 25` у запитання з `video === null` (з відео таймера немає) і в `raw.duels.timeLimit` (`round: null`); `detail` — секунди. Таймери раундів (вікно бліцу, драбина) не перевіряються;
  - лише якщо схема пройшла (далі — типізована `Quiz`): `answer_leak` — `wordIn(question.text, відповідь)` (а для `clues` ще й у кожній `clues[i]`); `hint_leak` — `wordIn(question.hint, відповідь)`; відповіді: правильні варіанти `single`/`multi`, `accepted` типів вище, `wordle.word`, `timedlist.items[].text` і `accepted`; відповідь з `answerKey` коротшим за 3 символи чи з самих цифр — пропуск (як у сідах); дуелі — `accepted` у тексті дуельного запитання → `answer_leak`; `detail` — відповідь;
  - `autopilot_blocked`: на кожен раунд кожного `autopilotCheck(quiz).blocked[]` — `round`, `detail = code` (`changed` — не проблема).

**Сервер**
- `ImageStorage.has?(name: string): Promise<boolean>` — **необов'язковий** (тестові підробки сховища в `uploads.test.ts`, `sticker-routes.test.ts`, `db-backup.test.ts` лишаються без змін): `memoryStorage` — `files.has`, `diskStorage` — `stat` (`ENOENT` → `false`), `r2Storage` — підписаний `HEAD` (404 → `false`, інший не-2xx → виняток). Нема `has` — перевірка питає `get(name) !== null`. Ім'я, що не `isMediaName`, — `false` без запиту.
- `apps/server/src/quiz-check.ts`:
  ```ts
  export type CheckFetch = (url: string, init: { method: 'GET' | 'HEAD'; signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;
  export const offlineFetch: CheckFetch; // завжди Promise.reject(new Error('offline'))
  export interface QuizCheckerDeps { storage: ImageStorage; fetch: CheckFetch; now: () => Date; timeoutMs?: number /* 5000 */; concurrency?: number /* 8 */; ttlMs?: number /* ADMIN_CACHE_MS */ }
  export interface QuizChecker {
    check(quizId: string, updatedAt: Date, raw: unknown): Promise<AdminQuizCheck>;
    /** Останній результат для значка; null — не перевіряли чи вікторину змінено після перевірки. Не старіє з ttl. */
    last(quizId: string, updatedAt: Date): AdminQuizCheck | null;
  }
  export function quizChecker(deps: QuizCheckerDeps): QuizChecker;
  ```
  - Кеш на `quizId`: та сама `updatedAt` і вік < `ttlMs` → готовий результат без запитів; один і той самий запуск у дорозі — спільний проміс; збій не кешується. Записів не більше 500 (найстаріший витісняється).
  - Один обмежувач на весь `quizChecker` (не на один запуск): не більше `concurrency` запитів одночасно серед усіх перевірок; кожен запит (і `storage.has`) — з `AbortSignal.timeout(timeoutMs)`; сховище, що не слухає сигналу, обгортається `Promise.race` з тим самим тайм-аутом. Однакові `storage`-імена, адреси й id YouTube у межах запуску — один запит.
  - `storage`: `false` → `media_missing` (`detail = '/uploads/<name>'`); виняток/тайм-аут → `media_unchecked`.
  - `url`: `HEAD` (405 → повтор `GET`); 2xx → гаразд; інший статус → `media_unreachable` (`detail = '<url> <status>'`); виняток → `media_unchecked`.
  - `youtube`: `GET https://www.youtube.com/oembed?url=<encodeURIComponent('https://www.youtube.com/watch?v=<id>')>&format=json`: 200 → гаразд; 401/403 → `video_not_embeddable`; 400/404 → `video_missing`; інше/виняток → `video_unchecked` (`detail = id`). Лише після 200 — тривалість: `GET https://www.youtube.com/watch?v=<id>`, у тексті `/"lengthSeconds":"(\d+)"/`; немає збігу чи збій → тривалість невідома, без проблеми; є — кожне посилання на цей id зі `start >= length` → `video_start_past_end` (`detail = '<start>/<length>'`).
  - Заголовок усіх запитів — `user-agent: quiz-check/1.0` (без назви проєкту, адрес і email).
  - Результат: `staticIssues(raw)` + мережеві, той самий порядок (помилки, потім попередження), `errors`/`warnings` — лічильники, `checkedAt = now().toISOString()`.
- `AppOptions.checkFetch?: CheckFetch` (типово `offlineFetch`); `main.ts` передає `(url, init) => fetch(url, init)`. `AdminDeps` += `storage: ImageStorage`, `checkFetch: CheckFetch`; `registerAdminRoutes` створює один `quizChecker({ storage, fetch: checkFetch, now })` і передає його в `registerAdminBotRoutes` (третім аргументом, поле `checker`).
- `admin-store.ts`: `adminQuizRaw(db: Db, id: string): Promise<{ ownerId: string; title: string; updatedAt: Date; raw: unknown } | null>` (не uuid → `null`); `raw` — той самий `stored`, що збирає `quizOf` (винести в `quizzes.ts` `storedQuizOf(row)`; `quizOf` = `safeParse(storedQuizOf(row))`).
- `POST /api/admin/quizzes/:id/check` (`write`): немає вікторини → 404; інакше `checker.check(id, updatedAt, raw)` → 200 `AdminQuizCheck`. У журнал перевірка не пише.
- `GET /api/admin/quizzes/:id`: після знайденої вікторини — `logAction(db, { adminId, kind: 'quiz_view', targetUserId: view.author.id, details: { title }, now })`; **той самий адмін і та сама вікторина протягом 60 с — один рядок** (мапа `${adminId}:${quizId}` → час у `registerAdminRoutes`; React StrictMode і «Спробувати ще» читають двічі); збій запису журналу → 500, перегляд без запису не віддається. Знімок скарги (`/api/admin/reports/quiz/:entryId`) не пише — це публічна копія каталогу.
- `AdminBotQuiz.check: { errors: number; warnings: number } | null` = `checker.last(id, updatedAt)`; `GET /api/admin/bot` сам нічого не перевіряє.

**Веб**
- `apps/web/src/admin/quiz-preview.ts`:
  ```ts
  export interface QuestionPreview {
    text: string;
    /** Варіанти чи елементи; correct: true — правильний (✓), false — ні, null — у типу немає правильного (опитування, порядок, пари…). */
    items: { text: string; correct: boolean | null }[];
    /** Правильна відповідь одним рядком, де варіантів немає: «Так»/«Ні» (`yes`/`no`), число (`numeric`, `slider`), слово (`wordle`). */
    answer: string | null;
    /** Написання (accepted) для text, drawing, clues, melody, videoclip, bluff, spy. */
    accepted: string[];
    hint: string | null;
    images: string[]; // усі /uploads-картинки запитання (з mediaRefs), без повторів
    audio: { url: string; start: number; duration: number } | null; // файл — /uploads/…, YouTube — videoLink
    video: { url: string; start: number } | null; // video або clip, url = videoLink(...)
    points: number;
    timeLimit: number | null; // null — є відео (таймера немає)
  }
  export function questionPreview(question: Question): QuestionPreview;
  ```
  Для `single`/`multi`/`poll` — `items` з позначкою; для решти типів без особливого правила — `items` = `questionLines(question).slice(1)` з `correct: null` (наявна функція лишається єдиним джерелом «що показати»).
- `AdminQuiz.tsx`: картка рендерить `questionPreview`: текст; варіанти з «✓» і `aria-label` `adminPreviewCorrect` біля правильних; рядки «Відповідь: …», «Написання: …», «Підказка: …»; мініатюри (усі `images`, `loading="lazy"`); «Відео з {start}» / «Аудіо з {start}, {duration} с» — посилання `target="_blank" rel="noopener noreferrer"`, `start` як `m:ss`; «Бали: {points} · Таймер: {seconds} с» чи «Без таймера (відео)». `li` має `id="q-<questionId>"`. Раунд — `<details>`; відкритий, якщо у вікторині ≤ 20 запитань, інакше згорнутий; запасні й дуелі — так само. Кнопки видалення лишаються лише в режимі `/admin/quizzes/:id` (наявна модерація).
- Новий маршрут `/admin/bot/quizzes/:id` → компонент `AdminBotQuizView` з `AdminQuiz.tsx` (той самий `Loaded`, режим `bot`): без кнопок видалення (вікторину бота видаляють у вкладці «Бот»), «Назад» → `/admin/bot`. Режими `Loaded`: `'moderate' | 'report' | 'bot'` замість `readOnly: boolean`.
- `apps/web/src/admin/QuizCheck.tsx`: `QuizCheckPanel({ quizId, onIssue }: { quizId: string; onIssue: (issue: QuizCheckIssue) => void })` — кнопка «Перевірити вікторину», «Перевіряємо…», далі «Усе добре» (`role="status"`) або `h3` «Помилки» / «Попередження» зі списком: текст `adminCheck_<code>` з `{detail}`, підпис місця («Раунд {number}» чи «Запасні й дуелі»), початок тексту запитання, кнопка «До запитання» (є `questionId`) → `onIssue`; `QuizCheckButton({ quizId, onDone? })` — для списків: «Перевірити» → рядок «Усе добре» чи «Помилок: {errors} · попереджень: {warnings}». `AdminQuiz` на `onIssue` відкриває `<details>` раунду й робить `scrollIntoView` на `#q-<id>`.
- `admin-api.ts`: `checkQuiz(quizId: string): Promise<ApiData<AdminQuizCheck>>` — `POST /api/admin/quizzes/:id/check`; 404 → `Navigate` додому, як інші.
- `AdminQuizzes.tsx`: у `.admin-actions` картки — `QuizCheckButton`. `AdminBot.tsx`: у картці вікторини бота — `Link` «Переглянути» → `/admin/bot/quizzes/:id`, `QuizCheckButton` з `onDone = reload`, значок `<span className="admin-check-badge" aria-label={t('adminCheckBadge', { count })}>⚠ {count}</span>` біля назви, якщо `quiz.check?.errors > 0`; «Запустити гру» при `quiz.check?.errors > 0` спершу питає `window.confirm(t('adminCheckLaunchConfirm', { title, count }))` (скасування — без запуску; «Так» — звичайний запуск); без перевірки — запуск без питань (сам запуск мережі не чіпає).
- Нові uk-ключі (`ADDED_QUIZ_CHECK_57`): `adminPreviewCorrect`, `adminPreviewAnswer`, `adminPreviewAccepted`, `adminPreviewHint`, `adminPreviewVideo`, `adminPreviewAudio`, `adminPreviewPoints`, `adminPreviewNoTimer`, `adminPreviewImage`, `adminLog_quiz_view` (задача 4); `adminCheckRun`, `adminCheckShort`, `adminChecking`, `adminCheckOk`, `adminCheckErrors`, `adminCheckWarnings`, `adminCheckSummary`, `adminCheckRound`, `adminCheckOther`, `adminCheckGoTo`, `adminCheckBadge`, `adminCheckLaunchConfirm` і `adminCheck_<code>` для кожного з 15 кодів (задача 5). Зразки uk: `adminLog_quiz_view: '{admin} переглянув(-ла) вікторину «{title}» ({target})'`, `adminPreviewPoints: 'Бали: {points} · Таймер: {seconds} с'`, `adminCheckSummary: 'Помилок: {errors} · попереджень: {warnings}'`, `adminCheckLaunchConfirm: 'Остання перевірка знайшла у «{title}» помилок: {count}. Однаково запустити гру?'`, `adminCheck_video_not_embeddable: 'Відео {detail} заборонено вбудовувати'`, `adminCheck_short_timer: 'Таймер {detail} с — менше 25 с'`. Для `autopilot_blocked` `{detail}` у тексті замінюється текстом `autopilotBlock_<code>`, якщо такий ключ є.
- Стилі: `.admin-check` (групи, кнопки переносяться), `.admin-check-badge` (контраст в обох темах, лише змінні теми), `details.admin-round > summary` — на 360 px без бічного скролу.

## Порядок збирання

- 1 → 2 → 3 → 4 → 5 → 6. Залежності: 2 ← 1; 3 ← 1, 2; 4 ← 1, 3; 5 ← 3, 4; 6 — остання.
- `pnpm typecheck` обов'язково зелений з задачі 4 (новий вид `quiz_view` вимагає `adminLog_quiz_view`; до того `tsc -p apps/web` може падати саме на ньому — це очікувано).

## Фокус рев'ю

1. **Мережа падає чи мовчить — перевірка все одно закінчується.** `fetch`, що ніколи не відповідає, і сховище, що висить, дають `media_unchecked`/`video_unchecked` (попередження, не помилки) не пізніше тайм-ауту; жоден збій не перетворює результат на 500. Задача 2 (`a silent network ends in warnings within the timeout`).
2. **Не більше 8 запитів одночасно — на всі перевірки разом.** Дві паралельні перевірки різних вікторин із 12 різними адресами кожна ніколи не мають більше 8 запитів у дорозі; однакова картинка в 30 запитаннях — один запит. Задача 2.
3. **Стара вікторина, що не проходить схему, не валить перевірку і не ховає решту проблем.** Сирий JSON без `options`, з `correctId` поза варіантами, з чужою адресою картинки → `schema` + `no_correct` + `media_unreachable`/`media_unchecked`, без винятку; перегляд такої вікторини теж не падає. Задачі 1, 2, 4.
4. **Кеш не бреше після правки.** Перевірка, правка вікторини (`updatedAt` змінився), знову перевірка — нові запити й новий результат; значок «⚠ N» у «Боті» зникає одразу після правки (`last` з іншою `updatedAt` → `null`). Задачі 2, 3.
5. **Ворота й журнал.** Не-адміну й гостю `POST …/check` — 404 без заголовків обмеження й без жодного виклику `checkFetch`/`storage.has`; кожен перегляд — рядок `quiz_view`, повтор того самого адміна за 60 с — без другого рядка, інший адмін — свій рядок. Задача 3.

---

### Задача 1. Спільне: коди перевірки, чисті перевірки й збирач медіа, вид журналу `quiz_view`

**Files:**
- Create: `packages/shared/src/quiz-check.ts`, `packages/shared/src/quiz-check.test.ts`.
- Modify: `packages/shared/src/index.ts` (`export * from './quiz-check'`), `packages/shared/src/admin.ts` (`'quiz_view'` у `ADMIN_ACTION_KINDS`; `AdminBotQuiz.check: { errors: number; warnings: number } | null`).
- Test: `packages/shared/src/admin.test.ts`.

**Interfaces (Produces):** `QUIZ_CHECK_ERRORS`, `QUIZ_CHECK_WARNINGS`, `QuizCheckCode`, `checkSeverity`, `QuizCheckIssue`, `AdminQuizCheck`, `QUIZ_CHECK_MIN_TIMER`, `QuestionPlace`, `quizPlaces(raw)`, `MediaRef`, `mediaRefs(raw)`, `staticIssues(raw)` — за «Рішеннями плану» (спільне).

- [ ] **Step 1: Write the failing tests** (`quiz-check.test.ts`; фікстури — `@quiz/engine/testing` `makeRoundsQuiz`/`classicRound`/`single`, таймери 30 с, крім навмисного 20 с):
  - `a clean quiz has no static issues`: `staticIssues(quiz)` → `[]`.
  - `finds media in every place, even in a broken quiz`: сирий об'єкт з `imageUrl: '/uploads/aaaaaaaaaaaaaaaa.jpg'`, варіантом з `imageUrl: '/uploads/bbbbbbbbbbbbbbbb.png'`, `audio: { source: 'file', url: '/uploads/cccccccccccccccc.mp3', … }`, `video: { id: 'E2Evideo001', start: 30 }`, `clip` іншого запитання, `imageUrl: 'https://example.com/x.jpg'` → `mediaRefs` містить 3 `storage`, 1 `url`, 2 `youtube` з правильними `place.questionId` і `round`; запитання в `spares` — `round: null`.
  - `structure on raw data`: `single` з `correctId: 'zz'` → `no_correct`; `multi` з `correctIds: []` → `no_correct`; `text` з `accepted: ['  ']` → `empty_answer`; `single` з варіантами «Київ» і «київ » → `duplicate_option` (`detail: 'Київ'`); той самий сирий об'єкт дає й `schema` — і `staticIssues` не кидає.
  - `a short timer is a warning, a video question has no timer`: `timeLimit: 20` → `short_timer` (`detail: '20'`), `checkSeverity('short_timer') === 'warning'`; `timeLimit: 20` з `video` — нічого; дуелі з `timeLimit: 20` → `short_timer`, `round: null`.
  - `leaks: answer in text is an error, in the hint a warning`: «Яка річка тече через Київ? Дніпро…» з правильним «Дніпро» → `answer_leak` (`detail: 'Дніпро'`); правильне «Дніпро» в `hint` → `hint_leak`; «Дніпровський» у тексті — не витік (ціле слово); відповідь «12» чи «Ок» — не перевіряється; `clues` з відповіддю в підказці → `answer_leak`.
  - `autopilot blocks per round`: раунд `think` з запитанням без слів → `autopilot_blocked`, `round: 1`, `detail: 'think_words'`.
  - `errors come before warnings`: результат з обома — усі `error` раніше за всі `warning`.
  - `admin.test.ts`: `ADMIN_ACTION_KINDS` містить `quiz_view`.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/quiz-check.test.ts packages/shared/src/admin.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (спільне). Обхід — один рекурсивний помічник для `quizPlaces` і `mediaRefs` (стек предків для найближчого запитання).
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 && pnpm exec tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 57 quiz check — error and warning codes, offline checks on raw quiz data (schema, empty answers, no correct option, duplicate options, timers under 25 s, answer leaks in text and hint, autopilot blocks), a collector of every storage, external and YouTube media reference, and the quiz_view log kind"
```

---

### Задача 2. Сервер: `ImageStorage.has` і `quizChecker` — сховище, адреси, YouTube, межа 8, тайм-аут 5 с, кеш 10 хв

**Files:**
- Create: `apps/server/src/quiz-check.ts`, `apps/server/src/quiz-check.test.ts`.
- Modify: `apps/server/src/storage/images.ts` (`has?` в інтерфейсі, `memoryStorage`, `diskStorage`), `apps/server/src/storage/r2.ts` (`has` — підписаний `HEAD`), `apps/server/src/quizzes.ts` (`storedQuizOf(row)`, `quizOf` через нього).
- Test: `apps/server/src/storage/images.test.ts` (і наявний тест `r2` з підробленим `settings.fetch`, якщо є; інакше — новий випадок у `images.test.ts`).

**Interfaces:**
- Consumes: `staticIssues`, `mediaRefs`, `AdminQuizCheck`, `checkSeverity` (задача 1); `ADMIN_CACHE_MS`.
- Produces: `CheckFetch`, `offlineFetch`, `QuizCheckerDeps`, `QuizChecker { check, last }`, `quizChecker(deps)`, `storedQuizOf(row)`.

- [ ] **Step 1: Write the failing tests** (`quiz-check.test.ts`; `fetch` — підробка `vi.fn<CheckFetch>()` з відповідями за адресою; `storage` — `memoryStorage()` з одним покладеним файлом; `timeoutMs: 50`; жодного справжнього запиту):
  - `storage: present is fine, absent is an error, a broken storage a warning`: наявний файл — без проблем; відсутній → `media_missing` `/uploads/<name>`; `has`, що кидає, → `media_unchecked`.
  - `youtube via oEmbed`: 200 + сторінка з `"lengthSeconds":"60"` і `start: 30` — гаразд; 401 → `video_not_embeddable`; 404 → `video_missing`; 500 → `video_unchecked`; 200 і `start: 90` при довжині 60 → `video_start_past_end` (`detail: '90/60'`); 200 і сторінка без `lengthSeconds` → без проблем. Адреса oEmbed — саме `https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D<id>&format=json`; кожен запит має `user-agent: quiz-check/1.0`.
  - `external urls`: `HEAD` 200 — гаразд; 404 → `media_unreachable` (`detail` з `404`); 405 → повтор `GET`.
  - `a silent network ends in warnings within the timeout` (Фокус 1): `fetch`, що чекає лише на `signal.abort`, і `has`, що не відповідає ніколи → результат з `video_unchecked`/`media_unchecked`, проміс вирішується, `errors` не рахує їх.
  - `never more than 8 requests at once across checks` (Фокус 2): дві одночасні `check` різних вікторин по 12 різних зовнішніх адрес; підробка рахує одночасні виклики → максимум `8`; картинка, повторена в 30 запитаннях, — один `has`.
  - `caches for ten minutes per version` (Фокус 4): другий `check` з тією ж `updatedAt` у межах `ttlMs` — без нових викликів; після `ttlMs` (підмінний `now`) — нові; з іншою `updatedAt` — нові одразу; `last(id, стара updatedAt)` після правки → `null`, `last(id, та сама)` → результат навіть після `ttlMs`; два одночасні `check` однієї вікторини — один набір запитів.
  - `a broken quiz is checked, not thrown` (Фокус 3): сирий об'єкт без схеми з `imageUrl: 'https://example.com/x.jpg'` → `schema` і `media_unreachable`/`media_unchecked`, без винятку.
  - `offlineFetch makes every network check a warning`: усі мережеві — `*_unchecked`.
  - `images.test.ts`: `memoryStorage().has` / `diskStorage(tmp).has` — `true` для покладеного, `false` для відсутнього й для неправильного імені; `r2Storage({ …, fetch })` — `has` шле `HEAD` за адресою об'єкта, 404 → `false`, 500 → виняток.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/quiz-check.test.ts apps/server/src/storage/images.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `has` у сховищах, `storedQuizOf`, `quizChecker` за «Рішеннями плану» (сервер). Обмежувач — проста черга з лічильником усередині `quizChecker`; тайм-аут — `AbortSignal.timeout(timeoutMs)` для `fetch` і `Promise.race` для `storage`.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/quiz-check.test.ts apps/server/src/storage apps/server/src/uploads.test.ts apps/server/src/sticker-routes.test.ts apps/server/src/db-backup.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/quiz-check.ts apps/server/src/quiz-check.test.ts apps/server/src/storage apps/server/src/quizzes.ts
git commit -m "feat(server): 57 quiz checker — storage files by HEAD, external addresses for 200, YouTube by oEmbed (exists, embeddable) and start within the length when the page tells it, at most 8 requests at once with a 5 s timeout, results cached for 10 minutes per quiz version and the last one kept for the badge; a silent network gives warnings, never errors"
```

---

### Задача 3. Сервер: маршрут перевірки, журнал переглядів, значок у `GET /api/admin/bot`, проводка `checkFetch`

**Files:**
- Modify: `apps/server/src/admin-routes.ts` (`AdminDeps.storage`, `AdminDeps.checkFetch`, `quizChecker`, `POST /api/admin/quizzes/:id/check`, журнал у `GET /api/admin/quizzes/:id`, передача `checker` у `registerAdminBotRoutes`), `apps/server/src/admin-store.ts` (`adminQuizRaw`), `apps/server/src/admin-bot-routes.ts` (`check` у `AdminBotQuiz`), `apps/server/src/app.ts` (`AppOptions.checkFetch`, передача `storage` і `checkFetch`), `apps/server/src/main.ts` (справжній `fetch`).
- Test: `apps/server/src/admin-routes.test.ts`, `apps/server/src/admin-bot-routes.test.ts`.

**Interfaces:**
- Consumes: `quizChecker`, `offlineFetch`, `CheckFetch` (задача 2); `AdminQuizCheck` (задача 1).
- Produces: `POST /api/admin/quizzes/:id/check` → `AdminQuizCheck`; `AdminBotQuiz.check`; `AppOptions.checkFetch?: CheckFetch`; рядок журналу `quiz_view` `{ title }`.

- [ ] **Step 1: Write the failing tests:**
  - `admin-routes.test.ts`: у список `routes` — `['POST', `/api/admin/quizzes/${UUID}/check`]`; `buildApp` цього файлу отримує `checkFetch: spy` (підробка, що рахує виклики) — новий випадок у `describe('hiding the admin panel …')`: `a non-admin check reaches no network` (Фокус 5) — після всіх спроб не-адміна й гостя `spy` не викликано.
  - `describe('preview and check (44b)')`:
    - `a view is logged once a minute per admin` (Фокус 5): `GET /api/admin/quizzes/:id` адміном → `lastLog()` — `{ kind: 'quiz_view', target: <нік автора>, details: { title } }`; одразу ще раз — рядків `quiz_view` усе ще 1; другий адмін — свій рядок; невідомий id — 404 без рядка.
    - `checks a quiz and answers from the cache`: вікторина з `imageUrl` на непокладений файл (`memoryStorage` тесту) → 200, `errors >= 1`, `issues[0].code === 'media_missing'`, `questionId` збігається; другий запит — ті самі `checkedAt`; невідомий uuid → 404; не uuid → 404.
  - `admin-bot-routes.test.ts`: `the bot list carries the last check`: до перевірки `quizzes[0].check === null`; після `POST …/check` з битим файлом — `{ errors: 1, warnings: 0 }`; після правки вікторини (`updatedAt` інша) — знову `null`.
  - Наявні випадки, де `lastLog()` іде після `GET /api/admin/quizzes/:id`, оновити (перегляд тепер теж пише в журнал) — не послаблюючи їхніх перевірок.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/admin-routes.test.ts apps/server/src/admin-bot-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (сервер). Мапа переглядів — у замиканні `registerAdminRoutes`, записи старші за 60 с прибираються при вставці.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/admin-routes.test.ts apps/server/src/admin-bot-routes.test.ts apps/server/src/admin-store.test.ts apps/server/src/quiz-check.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 57 admin quiz check route and view log — POST /api/admin/quizzes/:id/check behind the admin gate, every view of a quiz is logged (one line a minute per admin and quiz), the bot tab list carries the last check of each bot quiz; the real fetch is wired only in main.ts, tests and app defaults stay offline"
```

---

### Задача 4. Веб: перегляд лише для читання — відповіді, написання, підказки, медіа, бали, таймери, згорнуті раунди, вікторини бота

**Files:**
- Create: `apps/web/src/admin/quiz-preview.ts`, `apps/web/src/admin/quiz-preview.test.ts`.
- Modify: `apps/web/src/admin/AdminQuiz.tsx` (режими `Loaded`, `questionPreview`, `<details>`, `id="q-…"`, експорт `AdminBotQuizView`), `apps/web/src/admin/Admin.tsx` (маршрут `bot/quizzes/:id`), `apps/web/src/admin/AdminBot.tsx` (`Link` «Переглянути»), `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,de,es,it,pl,ar}.json`, `apps/web/src/i18n.test.ts` (`ADDED_QUIZ_CHECK_57` з ключами задачі 4, умова ~675, тест `57 keys (quiz preview and check) are in every language`), `apps/web/src/styles.css`.
- Test: `apps/web/src/admin/AdminQuiz.test.tsx`, `apps/web/src/admin/AdminBot.test.tsx`, `apps/web/src/admin/admin-text.test.ts`.

**Interfaces:**
- Consumes: `mediaRefs` (задача 1), `videoLink`, `questionLines`.
- Produces: `QuestionPreview`, `questionPreview(question)`; компонент `AdminBotQuizView` (не плутати з типом `@quiz/shared` `AdminBotQuiz`); `li#q-<id>` і `details[data-round="<index>"]` для задачі 5.

- [ ] **Step 1: Write the failing tests:**
  - `quiz-preview.test.ts`: `single` → `items` з одним `correct: true`; `multi` — два `true`; `poll` — усі `null`; `boolean` з `correct: false` → `answer === t('no')`; `text` → `accepted` у порядку; `hint` переноситься; `imageUrl` + картинка варіанта → `images` з двох; `video: { id, start: 75 }` → `video.url === videoLink(...)`, `timeLimit === null`; `audio` з файлу → `{ url: '/uploads/…', start, duration }`; тип без особливого правила (`order`) → `items` з `questionLines(...).slice(1)`, `correct: null`.
  - `AdminQuiz.test.tsx`: `shows answers, spellings, hints, media, points and timers`: картка має «✓» з `aria-label` правильної біля правильного варіанта, рядки «Написання: …», «Підказка: …», `img` для кожної картинки, посилання на відео з `href` `https://youtu.be/<id>?t=75` і текстом «1:15», «Бали: 1000 · Таймер: 30 с»; `long quizzes start folded`: 21 запитання → `details` без `open`, 20 → з `open`; `the bot preview has no delete buttons and goes back to the bot tab`: маршрут `/admin/bot/quizzes/z1` — немає кнопок `adminDeleteQuiz`/`adminDeleteQuestion`, «Назад» → `/admin/bot`; наявні випадки модерації — без змін.
  - `AdminBot.test.tsx`: `each bot quiz has a preview link` → `href` `/admin/bot/quizzes/<id>` (фікстури `AdminBotQuiz` отримують `check: null`).
  - `admin-text.test.ts`: `logLine` для `quiz_view` → «Адмін переглянув(-ла) вікторину «Карпати» (Оля)».
  - `i18n.test.ts`: новий список і тест наявності в усіх локалях з тими самими змінними.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/admin apps/web/src/i18n.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (веб: `quiz-preview.ts`, `AdminQuiz.tsx`, маршрут, «Переглянути» в «Боті»), тексти задачі 4 у 7 мовах, стилі `details.admin-round`.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src
git commit -m "feat(web): 57 admin quiz preview — correct options marked, spellings, hints, every picture as a thumbnail, video and audio links with their start, points and timers, rounds folded in long quizzes; bot quizzes open read-only from the «Бот» tab; the view log line, in seven languages"
```

---

### Задача 5. Веб: «Перевірити вікторину» — панель на сторінці перегляду, кнопка в списках, «⚠ N» і попередження перед запуском

**Files:**
- Create: `apps/web/src/admin/QuizCheck.tsx`, `apps/web/src/admin/QuizCheck.test.tsx`.
- Modify: `apps/web/src/admin/admin-api.ts` (`checkQuiz`), `apps/web/src/admin/AdminQuiz.tsx` (`QuizCheckPanel` під заголовком, `onIssue` → відкрити раунд і прокрутити), `apps/web/src/admin/AdminQuizzes.tsx` (`QuizCheckButton`), `apps/web/src/admin/AdminBot.tsx` (`QuizCheckButton` з `onDone = reload`, значок, `window.confirm` перед запуском), `apps/web/src/i18n.ts`, `locales/*.json`, `apps/web/src/i18n.test.ts` (ключі задачі 5 у `ADDED_QUIZ_CHECK_57`), `apps/web/src/styles.css`.
- Test: `apps/web/src/admin/AdminQuiz.test.tsx`, `apps/web/src/admin/AdminQuizzes.test.tsx`, `apps/web/src/admin/AdminBot.test.tsx`.

**Interfaces:**
- Consumes: `POST /api/admin/quizzes/:id/check` (задача 3), `AdminQuizCheck`, `checkSeverity` (задача 1), `li#q-<id>`, `details[data-round]` (задача 4), `AdminBotQuiz.check`.
- Produces: `checkQuiz(quizId)`, `QuizCheckPanel`, `QuizCheckButton`.

- [ ] **Step 1: Write the failing tests** (мок `./admin-api`):
  - `QuizCheck.test.tsx`: `all good`: `issues: []` → «Усе добре» у `role="status"`; `groups errors and warnings`: дві помилки (`media_missing`, `autopilot_blocked` з `detail: 'think_words'`) і попередження `short_timer` → `h3` «Помилки» з двома пунктами (другий — текст `autopilotBlock_think_words`), `h3` «Попередження» з одним («Таймер 20 с — менше 25 с»), підпис «Раунд 2»; «До запитання» викликає `onIssue` з цим пунктом; поки запит у дорозі — «Перевіряємо…» і кнопка неактивна; `not_found` → перехід додому; інша помилка → `role="alert"`. `QuizCheckButton` → «Помилок: 2 · попереджень: 1».
  - `AdminQuiz.test.tsx`: `going to an issue opens its folded round`: 21 запитання, перевірка з `questionId` у згорнутому раунді → після «До запитання» `details` цього раунду `open`, `scrollIntoView` (підмінений на `Element.prototype`) викликано на `#q-<id>`.
  - `AdminQuizzes.test.tsx`: кнопка «Перевірити» в картці, після відповіді — рядок підсумку.
  - `AdminBot.test.tsx`: `a bot quiz with errors shows ⚠ N`: `check: { errors: 3, warnings: 0 }` → текст «⚠ 3» з `aria-label` `adminCheckBadge`; `check: null` чи `errors: 0` — значка немає; `launching a quiz with errors asks first`: `window.confirm` → `false` — `startBotGame` не викликано; `true` — викликано; без помилок — `confirm` не викликається; перевірка зі списку перечитує список бота.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/admin apps/web/src/i18n.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (веб: `QuizCheck.tsx`, `checkQuiz`, вкладки), тексти задачі 5 у 7 мовах, стилі `.admin-check`, `.admin-check-badge`.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src
git commit -m "feat(web): 57 «Перевірити вікторину» — the check on the preview page with errors and warnings that jump to their question, a short check in the quiz and bot lists, a ⚠ N badge on bot quizzes whose last check found errors and a warning before launching one, in seven languages"
```

---

### Задача 6. Наскрізний сценарій і кадри (`part57-quiz-check.e2e.ts`)

**Files:**
- Create: `apps/server/e2e/part57-quiz-check.e2e.ts` (сервер з адміном і заглушкою мережі — як `part54-bot-host.e2e.ts`: `flags.restarting = true; await ctx.shutdown(); await relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: 'admin57@example.com' }), checkFetch: stub }); flags.restarting = false`, у `finally` — `relisten()`; телефон 360 × 740, світла тема).

**Заглушка `stub: CheckFetch`:** oEmbed з `E2Edeadvid1` → 404; інший oEmbed → 200 `{}`; сторінка `watch?v=` → `"lengthSeconds":"60"`; усе інше → 404. Жодного справжнього запиту назовні.

**Сценарій** (вікторина «Гори й ріки 57», таймери ≥ 25 с: `single` з картинкою, завантаженою через `POST /api/uploads` (`avatarPng()`), і підказкою; `text` з двома написаннями й картинкою `/uploads/e2emissing00000000.jpg` (файла немає); `boolean` з `correct: false` і відео `{ id: 'E2Edeadvid1', start: 75 }`; другий раунд — ще кілька запитань, щоб вікторина була > 20 запитань і раунди згорнулись):
`it('part 57: quiz preview and check — the admin previews a bot quiz with answers, spellings, hints, thumbnails, video start, points and timers, the view is logged, the check finds the missing picture and the dead video and jumps to the question, the bot tab shows ⚠ 2 and asks before launching; a non-admin gets 404; phone 360 px, light theme')`:
1. Адмін зберігає вікторину (`POST /api/quizzes`), на `/admin/bot` передає боту копію; у картці — «Переглянути», значка немає.
2. «Переглянути» → `/admin/bot/quizzes/<id>`: раунди згорнуті; розгорнути перший — «✓» біля правильного варіанта, «Написання: …», «Підказка: …», мініатюра, посилання на відео з «1:15», «Бали: … · Таймер: … с»; кнопок видалення немає. Кадр `check57-preview-360`, `expectNoSideScroll`.
3. «Перевірити вікторину» → група «Помилки» з двома пунктами (файла немає у сховищі; відео не існує); «До запитання» в другому — раунд розгортається, картка відео в полі зору. Кадр `check57-result-360`.
4. `/admin/bot`: біля вікторини «⚠ 2»; «Запустити гру» → діалог підтвердження з назвою й «2» (Playwright `page.once('dialog')`): спершу «Скасувати» — кімнати немає; потім «Так» — «Кімнату {code} створено». Кадр `check57-badge-360`.
5. `/admin/log`: рядок «… переглянув(-ла) вікторину «Гори й ріки 57» (Квіз-бот)».
6. Звичайний акаунт: `POST /api/admin/quizzes/<id>/check` → 404; гість — 404.
- Очікувана 404 мініатюри `/uploads/e2emissing00000000.jpg` у консолі браузера не має валити перевірку `problems` — дозволити саме цей рядок, як роблять інші частини з очікуваними збоями.

- [ ] **Step 1: Write the scenario.** Помічники — з `helpers/common.ts` і `helpers/setup.ts` (`avatarPng`, `light`/`view`/`viewportShot` — як у part 54); нових спільних помічників не додавати без потреби.
- [ ] **Step 2: Run** `pnpm build`, потім (після завершення збирання) `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 57"` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 3: Run** після part 57, не одночасно: `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 54"`. Expected: PASS (вкладка «Бот» з новими кнопками не зламала сценарію бота).
- [ ] **Step 4: Переглянути кадри:** на 360 px картки запитань, згорнуті раунди, групи перевірки й значок «⚠ 2» без бічного скролу, читаються в світлій темі.
- [ ] **Step 5: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 57 — the admin previews a bot quiz with answers, hints, thumbnails and the video start, the view is logged, the check finds a missing picture and a dead video and jumps to the question, the bot tab shows ⚠ 2 and asks before launching; a non-admin gets 404; 360 px, light theme"
```

---

## Розбіжності зі специфікацією (рішення плану)

1. **Перегляд уже був — розширюємо, не дублюємо.** `/admin/quizzes/:id` існує з планів адмінки (з модерацією: видалення запитань і вікторини); 57 додає відповіді з позначкою правильних, написання, підказки, всі мініатюри, відео/аудіо зі стартом, бали, таймери й згорнуті раунди. Модераційні кнопки там лишаються (вони були до 44b і не є «редагуванням»). Для «Бота» — окремий маршрут `/admin/bot/quizzes/:id` тієї самої сторінки без кнопок видалення.
2. **Журнал переглядів — не частіше разу на хвилину на адміна й вікторину.** «Кожен перегляд» буквально дав би по два рядки на відкриття (React StrictMode, «Спробувати ще»); 60 с зводить це до одного. Інший адмін — завжди свій рядок. Збій запису журналу — 500: перегляду без запису немає. Знімок скарги (публічна копія каталогу) у журнал не пише.
3. **Тривалість YouTube — лише зі сторінки ролика.** oEmbed тривалості не дає, ключа YouTube Data API немає; тривалість береться з `lengthSeconds` сторінки `watch?v=` (як перевіряли сіди), і лише якщо її там знайдено. Не знайдено — «час старту» не перевіряється («якщо її можна дізнатися»). Фрагмент аудіо (`start + duration`) не перевіряється — лише `start`.
4. **Мережевий збій — попередження, не помилка.** Тайм-аут, 5xx YouTube чи збій сховища не доводять, що медіа зламане: `media_unchecked`/`video_unchecked` (попередження). Помилки — лише 404/відсутній файл, 401/403 вбудовування, старт поза тривалістю.
5. **«Зовнішні адреси» майже не трапляються.** Схема дозволяє картинки й аудіо лише з `/uploads/…`; зовнішні `http(s)` бувають тільки в старих вікторинах, що вже не проходять схему. Перевірка їх однаково ловить (обхід сирого JSON) і перевіряє `HEAD` (405 → `GET`).
6. **Структурні перевірки йдуть по сирих даних.** Для вікторини, що проходить схему, «порожні відповіді / немає правильного» неможливі; щоб вони мали сенс, вони читають сирий JSON (старі вікторини) поруч із `schema`. Витоки й автопілот — лише для вікторини, що пройшла схему (потрібна типізована `Quiz`).
7. **Важкість і витоки.** Таймер < 25 с — попередження (як у специфікації); витік відповіді в текст — помилка, у підказку — попередження (підказка й так наближає до відповіді); короткі (< 3 символи) і цифрові відповіді на витік не перевіряються — як у сідах. Таймери раундів (бліц, драбина) не перевіряються — лише таймер запитання й дуелей.
8. **Кеш — 10 хв на версію вікторини, значок — до правки.** Правка (`updatedAt`) скидає кеш і значок одразу; «⚠ N» показує останню перевірку й після 10 хв (кеш лише вирішує, чи йти в мережу знову); після перезапуску сервера значків немає. `GET /api/admin/bot` сам нічого не перевіряє, і запуск гри мережі не чіпає: попередження перед запуском — лише якщо остання перевірка знайшла помилки.
9. **Попередження перед запуском — `window.confirm`.** «Не блокує»: «Так» запускає як завжди, «Скасувати» лише не запускає; без перевірки — без питань.
10. **Межа 8 запитів — на весь процес.** Одна черга на `quizChecker`, тож два адміни, що перевіряють одночасно, разом не перевищують 8; перевірка — `write`-обмеження адмінки (30/хв), у журнал не пише.
11. **Тести без мережі за замовчуванням.** `buildApp` без `checkFetch` — `offlineFetch`; справжній `fetch` — лише в `main.ts`; e2e — заглушка через `relisten({ checkFetch })`.
