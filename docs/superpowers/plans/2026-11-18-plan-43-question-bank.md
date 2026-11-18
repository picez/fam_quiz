# План 43: банк запитань (38f)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** Стан гри не змінюється. База — **без міграцій**: новий маршрут лише читає наявну таблицю `quiz`.

> **Звірка з кодом.** План спирається на `main` 2026-11-18 (`9ac7d810`, після плану 42):
> - сховище вікторин: `apps/server/src/quizzes.ts` — таблиця `quiz` (`apps/server/src/db/schema.ts` ~108: `id`, `ownerId`, `title`, `description`, `settings` jsonb (з `duels?`/`spares?` усередині), `rounds` jsonb, `createdAt/updatedAt`, індекс `quiz_owner_idx`); `listQuizzes(db, ownerId)` (`where eq(quiz.ownerId, ownerId)`, `orderBy desc(updatedAt)`), `quizOf(row)` (розкладає рядок і проганяє `quizSchema.safeParse`, зламаний рядок лишає як є), `owned(ownerId, id)` — перевірка власника; групових чи спільних вікторин у таблиці **немає** (групи 12l зберігають записи `group_item`, не вікторини); видалення — справжній `DELETE`;
> - маршрути: `apps/server/src/account-routes.ts` ~117–175 — `currentUser(request)`, `UNAUTHORIZED`/`NOT_FOUND`/`INVALID = { error: 'invalid_payload' }`, `GET/POST /api/quizzes`, `GET/PUT/DELETE /api/quizzes/:id`, `CODE_LIMIT` (120/хв); запити з параметрами — як `adminListQuerySchema.safeParse(request.query)` (`packages/shared/src/admin.ts` ~38: `q` trim ≤ 100, `page: z.coerce.number().int().min(1)`); тест-зразок — `apps/server/src/quizzes.test.ts` (`buildApp({ db: await createTestDb(), auth: TEST_AUTH })`, `signUp(ctx.app, 'Олена')` → `{ cookie }`, `ctx.app.inject`, фікстури `makeQuiz`, `makeRoundsQuiz`, `classicRound`, `boardRound`, `single`, `bool`, `text`, `withId` з `@quiz/engine/testing`);
> - **прибирання осиротілих файлів немає.** `grep -rniE "orphan|garbage|cleanup|sweep|unreferenced|unlink"` по `apps/server/src` нічого такого не знаходить; єдині `.remove(key)` (`r2-objects.ts` ~85) кличе `db-backup.ts` (~268, ~322) і `scripts/db-backup.ts` (~65) — лише для ключів резервних копій `backups/db/`. Завантаження `/uploads/<name>` ніколи не видаляються (навіть із вікториною чи акаунтом), тож копія з тими самими адресами безпечна;
> - схема: `questionsOf(quiz)`, `roundQuestions(round)` (поле — клітинки по категоріях; `truth` — `[]`), `answerKey(value)` (NFC, апострофи `’ʼ`‘` → `'`, лапки, пробіли, `toLowerCase`) — `packages/shared/src/quiz.ts` ~1140, ~1946–1959; `QUESTION_TYPES` (`question-types.ts`); ліміти `LIMITS.maxQuestions` 100, `maxQuizQuestions` 200, `maxWipeoutQuestions` 15, `maxSurvivalQuestions` 30, `maxLadderQuestions` 15, `ladderOptions` 4, `maxPuzzles` 10, `maxQuestQuestions` 20, `maxThinkQuestions` 30; місця в схемі: `betsCut` лише в `bets`/`auction` (`bets_cut_place`), `reveal` лише в класиці (`reveal_place`), `survey.cloudId` — хмара раніше в цій самій вікторині (`survey_cloud`), «Мільйонер» — лише `single` з 4 варіантами (`ladder_type`);
> - редактор: `apps/web/src/pages/EditQuiz.tsx` (`id` з `useParams`, `QuizEditor` без id вікторини), `apps/web/src/editor/QuizEditor.tsx` — `roomForMore` (~113–130, ланцюг тернарних за типом раунду + `total < LIMITS.maxQuizQuestions`), `add()` (~175), `addFromGroup()` (~186: ціна — `newWipeoutQuestion(last).points` у «Ва-банку», `100` у «Вибуванні», інакше своя), `editor-add-row` з «Додати запитання» і «Із групи» лише коли `groupDraftPlace(round) === 'list'` (~490), бічний список ховається для `board`/`final`/`truth`; «Мільйонер» — `resizeLadder(round, count)`; `apps/web/src/editor/draft.ts` — `questionTypesFor(roundType)` (~100), `newQuestion`, `duplicateQuestion(question)` (~525: нові id запитання й усіх внутрішніх елементів, `correctId`/`categoryId` перенаправлено), `problemKey(question, place)` і `roundPlace(quiz, roundIndex, questionIndex)` (~1240, не експортовані), `cleaned()` уже прибирає `betsCut` поза ставками; `editor/new-id.ts` — `newId()`;
> - панель-зразок: `apps/web/src/groups/GroupPicker.tsx` («Запитання з групи», 12l) — `div.group-picker-backdrop` > `div.group-picker[role=dialog][aria-modal][aria-labelledby]`, `header.group-picker-head` (h2 з фокусом, `HelpButton`, ✕ `group-picker-close`), `div.group-picker-body`, `div.actions`; Escape закриває, якщо не відкрита `.help-pop`; фокус повертається на кнопку-відкривач; CSS — `apps/web/src/styles.css` ~23727–23890 (на ≤ 700 px — на весь екран), `.group-picker-list`, `.group-picker-item`, `.group-picker-item-text` (3 рядки); тест — `groups/GroupPicker.test.tsx` (`vi.mock('../api', …)`);
> - значки й назви типів: `typeIcon(type)` (`apps/web/src/guide-text.ts` ~80), ключі `type_<type>` («Один правильний варіант») і `typeShort_<type>` (`i18n.ts` ~1251, ~1309); `roundN: 'Раунд {index}'`;
> - веб API: `apps/web/src/api.ts` — `fetchData<T>(url)` → `ApiData<T>` (`{ ok: true, data } | { ok: false, error }`), зразок запиту з параметром — `searchProfiles` (~226);
> - i18n: uk — `apps/web/src/i18n.ts`, шість локалей `apps/web/src/locales/{en,pl,de,es,it,ar}.json`; останні списки — `ADDED_IMPORT_EXPORT`, `ADDED_IMPORT_EXPORT_PLURALS` (`apps/web/src/i18n.test.ts` ~191–192, перевірка локалей ~412–416, умова `adds no uk keys beyond the agreed list` ~487); `source-scan.test.ts` — кирилиця лише в `ALLOWED` і тестах;
> - довідка: `apps/web/src/help/host-help.ts` (`SETTING_HELP_KEYS` ~13, останній — `'importExport'`), `help/help-uk.ts` (`setting.importExport.*` ~1194), `help/__fixtures__/help-uk-golden.json`, `locales/*.help.json`, `help/help-vars.ts` (`LIMIT_KEYS`), `HelpButton({ id })`;
> - e2e-зразки: `part42-import-export.e2e.ts` (`useE2eServer`, `open`, `register`, світла тема через `addInitScript` `quiz:theme`, `snapshot`, `shot`, `expectNoSideScroll`, завантаження `POST /api/uploads` з `avatarPng()`), гра — `part38-spy.e2e.ts` ~310–335 (`.quiz-list li` → «Грати», `/host/\d{6}`, «Відкрити сцену», `join(page, code, name, false)`, «Почати гру»).
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

**Мета:** у редакторі, у кожному раунді зі списком запитань, поряд із «Додати запитання» — «📚 З банку запитань»: панель шукає запитання в усіх своїх вікторинах (сервер, лише власник, сторінки по 30), фільтрує за типами, дозволеними в раунді, дає позначити кілька й скопіювати їх у раунд (глибока копія з новими id, ті самі адреси медіа, з урахуванням лімітів).

**Архітектура:** спільні правила пошуку (`packages/shared/src/question-bank.ts`: схема запиту, текст для пошуку, збіг) — одне джерело для сервера й тестів. Сервер (`apps/server/src/question-bank.ts`) читає всі рядки `quiz` автора, розгортає запитання раундів, фільтрує, сортує й ріже сторінку; маршрут `GET /api/question-bank` — в `account-routes.ts`. Клієнт: чисті функції в `editor/draft.ts` (місткість раунду, пристосування копії до раунду), панель `editor/QuestionBank.tsx` на CSS `group-picker`, вставка — в `QuizEditor`.

**Технології:** TypeScript, zod, Fastify + drizzle (Postgres), React 19 + Vite + Testing Library (jsdom), Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-18-question-bank-design.md` (38f) — уся.

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22** (`packages/engine/src/restore.ts`). Стан гри не змінюється; **база — без міграцій** (жодного файлу в `apps/server/drizzle`, жодної зміни `db/schema.ts`). Якщо виконавцю здасться, що потрібне інше, — **зупинитися й спитати контролера**.
- Усі тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`. Нові uk-ключі — у новому списку `ADDED_QUESTION_BANK` у `apps/web/src/i18n.test.ts`; він — в умові `adds no uk keys beyond the agreed list` і в перевірці наявності в усіх локалях (як `ADDED_IMPORT_EXPORT`). ru немає. Довідка — `help-uk.ts` + golden + шість `*.help.json`.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`); нових файлів у `ALLOWED` не треба.
- **Приватність:** маршрут повертає лише вікторини того, хто питає; доведено тестом із двома акаунтами (чужі запитання з тим самим словом не приходять, чужий id не відкривається жодним параметром).
- **Нічого, пов'язаного з росією**, — у фікстурах, назвах вікторин і тестах.
- Таймери у фікстурах e2e ≥ 25 с; правильні так/ні у фікстурах — і «так», і «ні».
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|engine|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів; ніколи два запуски vitest водночас).
- e2e: нова частина 43 у `apps/server/e2e`; спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 43"`; кадри — з `E2E_SHOTS=1`. Телефон 360 px і світла тема.

## Рішення плану (там, де специфікація мовчить)

**Маршрут і відповідь**
- `GET /api/question-bank?q=<текст>&types=<тип,тип>&page=<n>` (окремий шлях, щоб не плутатись із `/api/quizzes/:id`). Без сесії — 401 `unauthorized`; параметри не проходять схему — 400 `invalid_payload`. Обмеження частоти — `CODE_LIMIT` (120/хв; панель шле запит із затримкою 300 мс після введення).
- Схема `questionBankQuerySchema` (`.strict()`): `q` — `trim`, ≤ `QUESTION_BANK_QUERY_MAX` = 100, типово `''`; `types` — рядок через кому, кожен із `QUESTION_TYPES`, без повторів, 1–`QUESTION_TYPES.length`; немає — усі типи; `page` — `z.coerce.number().int().min(1).max(10000).default(1)`.
- Відповідь `QuestionBankPage = { items: QuestionBankItem[]; page: number; pages: number; total: number }`, `QuestionBankItem = { quizId: string; quizTitle: string; roundIndex: number; roundTitle: string; question: Question }` (запитання **цілком**, як у `quizOf`). `pages = pageCount(total, QUESTION_BANK_PAGE_SIZE)` (`paging.ts`), `QUESTION_BANK_PAGE_SIZE` = 30; сторінка за межами — порожні `items` з чесними `total`/`pages`.
- **Джерела:** усі рядки `quiz` з `ownerId` того, хто питає (інших вікторин у базі й немає; видалені вже видалені). Запитання — `roundQuestions` кожного раунду (зокрема клітинки поля); **запасні, дуелі й питання на виживання (`trials`) — ні** (у них немає «раунду» і вони живуть за іншими правилами). Порядок: вікторини за `updatedAt` спадно, далі раунди й запитання в порядку вікторини. Поточна вікторина теж іде (клієнт сам позначає її за `quizId`).
- **Пошук:** `questionSearchText(question)` — з'єднання через `\n` усіх рядкових значень під ключами `text` і `hint` на будь-якій глибині (запитання, варіанти, елементи порядку, пари, рядки «100 до 1», категорії й слова сортування…) і рядкових елементів масивів `accepted`, `clues`, `lies`, `words`, `path`; для `numeric` — ще `String(correct)`. Ключі `id`, `imageUrl`, `url`, `video`, `audio`, `photo`, `original`, `changed` не обходяться. `matchesBankQuery(question, q)`: `q` → `answerKey`, ділиться на слова за пробілами; кожне слово має бути підрядком `answerKey(questionSearchText(question))`; порожній `q` — збіг. Так «Дніпро» знаходить «дніпро», а «Кам'янець» — «Кам’янець».
- Без кешу й нових таблиць: кожен запит читає `id, title, rounds, updatedAt` рядків автора (`select` лише цих колонок), розгортає в пам'яті.

**Клієнт: місце, ліміти, копія**
- Кнопка «📚 З банку запитань» (`className="btn btn-dashed"`) — у `editor-add-row` **кожного раунду, де є «Додати запитання»**: усі, крім `board`, `final`, `truth` (у них немає плаского списку). Ряд `editor-add-row` стає спільним: «Додати запитання», «Із групи» (як і досі — лише коли `groupDraftPlace(round) === 'list'`), «📚 З банку запитань». Вимкнена, коли `!roomForMore`.
- `roundCapacity(round)` у `draft.ts` — найбільше запитань раунду (той самий ланцюг, що в `roomForMore`: wipeout 15, survival 30, ladder 15, puzzles 10, quest 20, think 30, решта 100); `roomForMore` переписується через неї. Місце для копій: `room = min(roundCapacity(round) − questions.length, LIMITS.maxQuizQuestions − total)`.
- Фільтр типів: `types = questionTypesFor(round.type)`; список «Тип» — «Усі дозволені типи» (типово) і кожен тип із `types` (`typeIcon(type) + ' ' + t('type_' + type)`); у запит іде або весь `types`, або один вибраний.
- **Пристосування копії** — `bankCopy(quiz, roundIndex, question, after)` у `draft.ts`, де `after` — запитання, після якого стане копія (останнє в раунді або попередня копія):
  1. `duplicateQuestion(structuredClone(question))` — глибока копія, нові id запитання й усіх внутрішніх елементів; адреси медіа ті самі;
  2. `betsCut` лишається лише в раундах `bets`/`auction`; `reveal` — лише в `classic`; `survey.cloudId` прибирається завжди (хмара з іншої вікторини тут не існує);
  3. ціна — як у `addFromGroup`: «Ва-банк» — `newWipeoutQuestion(after).points`, «Вибування» — `100`, інакше своя. Правило виноситься в `placedPoints(round, after, question)` і використовується обома;
  4. перевірка: тип не в `questionTypesFor(round.type)` → `{ issue: 'bankNoFitType' }`; «Мільйонер» і не `single` з `LIMITS.ladderOptions` варіантами → `{ issue: 'bankNoFitLadder' }`; `problemKey(copy, roundPlace(quiz, roundIndex, questions.length))` ≠ null → `{ issue: <той ключ> }`; інакше `{ question: copy }`.
- Невідповідні (крок 4) у списку **показуються вимкненими** з причиною під текстом — сторінки лишаються по 30, а автор бачить, чому не можна. Типи поза раундом сервер узагалі не повертає.
- Вставка: позначені копії — **в кінець раунду** в порядку позначення, «Мільйонер» — через `resizeLadder(round, count)`; виділення — на першій копії; панель закривається. Позначене запам'ятовується між сторінками, пошуком і зміною фільтра (ключ `quizId + ':' + question.id`). Кнопка «Копіювати в цей раунд (N)» вимкнена, коли N = 0 або N > `room`; при N > `room` під нею `role="status"` «Вміщається ще {count}» (`count = room`).
- Скопійоване — звичайне запитання чернетки: `onDraft`, «Зберегти», `problemsOf` як завжди; запис «звідки» не зберігається; лайки за новими id не переносяться.
- Поточна вікторина: `QuizEditor` отримує новий проп `quizId?: string` (з `EditQuiz` — `id`); позначка «ця вікторина» у таких рядках. Береться **збережена** версія з сервера (незбережені правки в банк не потрапляють — так і має бути).
- Рядок списку: чекбокс (`aria-label` — `t('bankPick', { text })`), значок типу, текст запитання (3 рядки, `.group-picker-item-text`), `«{quizTitle}» · {roundTitle || t('roundN', { index: roundIndex + 1 })}` + «ця вікторина», `t('bankPoints', { points })`, мініатюра `question.imageUrl` (`<img loading="lazy" alt="">` 48×48, `object-fit: cover`), якщо є. Нижче списку — «Показати ще», доки `page < pages` (додає наступну сторінку).

**Тексти (uk)** — список `ADDED_QUESTION_BANK`:
`bankButton: '📚 З банку запитань'`, `bankTitle: 'Банк запитань'`, `bankClose: 'Закрити банк запитань'`, `bankSearch: 'Пошук у своїх вікторинах'`, `bankType: 'Тип'`, `bankAllTypes: 'Усі дозволені типи'`, `bankThisQuiz: 'ця вікторина'`, `bankPoints: 'Бали: {points}'`, `bankPick: 'Вибрати: {text}'`, `bankMore: 'Показати ще'`, `bankEmpty: 'Нічого не знайдено.'`, `bankNone: 'У ваших вікторинах ще немає запитань, які підходять до цього раунду.'`, `bankCopy: 'Копіювати в цей раунд ({count})'`, `bankRoomLeft: 'Вміщається ще {count}'`, `bankNoFitType: 'Цей тип не підходить до раунду.'`, `bankNoFitLadder: 'У «Мільйонері» — лише «один варіант» з {count} варіантами.'`.

## Порядок збирання

- Залежності: 1 — незалежна; 2 ← 1; 3 ← 1; 4 ← 2, 3; 5 ← 4; 6 — остання.
- Кожна задача лишає `pnpm typecheck` зеленим; кнопка з'являється лише в задачі 4.

## Фокус рев'ю

1. **Чужі вікторини.** Другий акаунт із тим самим словом у запитанні; запит без сесії; `types` з чужим чи вигаданим типом; `page=0`, `page=abc`, зайвий параметр `ownerId=…` — нічого чужого, 400/401 де треба. Задача 2.
2. **Копія ламає збереження.** Запитання зі «Ставок» (з `betsCut`) у класику, класика з `reveal` у бліц, «100 до 1» з хмари, `single` з 3 варіантами в «Мільйонер», судоку поза «Головоломками» — або пристосовано, або вимкнено з причиною; після копіювання «Зберегти» проходить `quizSchema` на сервері. Задачі 3, 6.
3. **Ті самі id.** Копія того самого запитання двічі (у два заходи) і копія запитання з поточної вікторини в інший раунд — усі id нові й унікальні (`withUniqueQuestionIds` не потрібен); копія не змінює джерело (лайки й рядок джерела цілі). Задачі 3, 4.
4. **Ліміти.** Раунд на 98 з 100 і позначено 3 → кнопка вимкнена, «Вміщається ще 2»; вікторина на 199 з 200 → «Вміщається ще 1»; повний раунд — кнопка банку вимкнена, як «Додати запитання». Задачі 3, 4.
5. **Телефон і медіа.** Панель на 360 px на весь екран без бокового скролу в обох темах, довгий текст обрізано, мініатюри не розпирають рядок; картинка копії після видалення вікторини-джерела все ще відкривається. Задачі 4, 6.

---

### Задача 1. Спільне: правила пошуку банку (`packages/shared/src/question-bank.ts`)

**Files:**
- Create: `packages/shared/src/question-bank.ts`, `packages/shared/src/question-bank.test.ts`
- Modify: `packages/shared/src/index.ts` (`export * from './question-bank';`)

**Interfaces (Produces):**
```ts
export const QUESTION_BANK_PAGE_SIZE = 30;
export const QUESTION_BANK_QUERY_MAX = 100;
export const questionBankQuerySchema: z.ZodType<{ q: string; types: QuestionType[]; page: number }>; // з «Рішень»; types типово — усі QUESTION_TYPES
export type QuestionBankQuery = z.infer<typeof questionBankQuerySchema>;
export interface QuestionBankItem { quizId: string; quizTitle: string; roundIndex: number; roundTitle: string; question: Question }
export interface QuestionBankPage { items: QuestionBankItem[]; page: number; pages: number; total: number }
export function questionSearchText(question: Question): string;
export function matchesBankQuery(question: Question, q: string): boolean;
```

- [ ] **Step 1: Write the failing tests** (`question-bank.test.ts`, фікстури з `@quiz/engine/testing` або власні, що проходять `questionSchema`):
  - `search text covers the question, options, answers and the hint` — `single` з `text: 'Яка річка найдовша в Україні?'`, варіантами «Дніпро»/«Дністер», `hint: 'Тече через Київ'` → текст містить усі чотири рядки; `text` з `accepted: ['Говерла']` → містить «Говерла»; `numeric` з `correct: 2061` → містить `'2061'`; `order` з елементами — їхні тексти; `match` — тексти обох сторін.
  - `search text skips ids and media` — `imageUrl: '/uploads/<32 hex>.png'`, `video: { id: 'dQw4w9WgXcQ', … }`, id варіантів → жодного з них у тексті.
  - `matches every word in any case and apostrophe` — запитання «Кам’янець-Подільський — місто над Смотричем?»: `'кам\'янець'` → true, `'СМОТРИЧ місто'` → true, `'смотрич львів'` → false, `''` і `'   '` → true.
  - `query schema` — `{}` → `{ q: '', types: QUESTION_TYPES, page: 1 }`; `{ q: '  Дніпро ', types: 'single,boolean', page: '2' }` → `q: 'Дніпро'`, `types: ['single', 'boolean']`, `page: 2`; `types: 'single,nope'`, `types: 'single,single'`, `types: ''`, `page: '0'`, `page: 'abc'`, `q` з 101 символу, зайвий ключ `ownerId` → `success: false`.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/question-bank.test.ts`. Expected: FAIL (модуля немає).
- [ ] **Step 3: Implement** за Interfaces і «Маршрут і відповідь» (`types` — `z.string().transform(split(',')).pipe(z.array(z.enum(QUESTION_TYPES)).min(1).refine(без повторів))`, `.optional()` → усі; обхід для пошуку — рекурсивний за об'єктами й масивами з переліком ключів із «Рішень»; нормалізація — `answerKey`).
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared/src/question-bank.ts packages/shared/src/question-bank.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): 43 question bank — the search query schema (text, allowed types, page), the searchable text of a question without ids or media, word matching that ignores case and apostrophes"
```

---

### Задача 2. Сервер: пошук по своїх вікторинах (`question-bank.ts`, `GET /api/question-bank`)

**Files:**
- Create: `apps/server/src/question-bank.ts`, `apps/server/src/question-bank.test.ts`
- Modify: `apps/server/src/account-routes.ts` (маршрут після `DELETE /api/quizzes/:id`)

**Interfaces:**
- Consumes: `questionBankQuerySchema`, `matchesBankQuery`, `QUESTION_BANK_PAGE_SIZE`, `QuestionBankPage` (задача 1); `quizOf` (`quizzes.ts`); `roundQuestions`, `pageCount` (`@quiz/shared`).
- Produces:
```ts
// question-bank.ts
export async function searchQuestionBank(db: Db, ownerId: string, query: QuestionBankQuery): Promise<QuestionBankPage>;
// HTTP: GET /api/question-bank?q&types&page → 200 QuestionBankPage | 400 { error: 'invalid_payload' } | 401 { error: 'unauthorized' }
```
У файлі — коментар: завантаження ніколи не видаляються (єдиний `remove` — резервні копії `backups/db/`), тому копії з тими самими адресами безпечні; якщо колись з'явиться прибирання — воно мусить шукати посилання в усіх вікторинах (`questionsOf` + `spares` + `duels`).

- [ ] **Step 1: Write the failing tests** (`question-bank.test.ts`, зразок — `quizzes.test.ts`; вікторини — через `POST /api/quizzes`):
  - `requires a session` — `GET /api/question-bank` без cookie → 401 `{ error: 'unauthorized' }`.
  - `returns only the asker's quizzes` — Олена: «Річки України» з `single` «Яка річка найдовша в Україні?»; Тарас: «Річки Європи» з `single` «Яка річка тече через Відень?» → Олена з `q=річка` бачить лише своє запитання й `quizTitle: 'Річки України'`, Тарас — лише своє; Тарас з `q=Україні` → `total: 0`; зайвий параметр `ownerId=<Олена>` → 400.
  - `returns whole questions with their source` — `items[0]` = `{ quizId, quizTitle, roundIndex: 0, roundTitle: <назва раунду>, question }`, де `question` `toEqual` збереженому (разом з `imageUrl` і варіантами); клітинка поля (`boardRound`) теж приходить з `roundIndex` поля.
  - `filters by type` — вікторина з `single`, `boolean`, `text` → `types=boolean` → лише `boolean`; `types=single,text` → два; `types=nope` → 400.
  - `pages by 30, newest quiz first` — 35 запитань у двох вікторинах (стара: 20, нова — оновлена пізніше: 15) → сторінка 1: 30 запитань, перші 15 — з нової в порядку вікторини; `pages: 2`, `total: 35`; сторінка 2 — 5; сторінка 3 — `items: []`, `total: 35`.
  - `searches answers and hints without case or apostrophes` — `text` з `accepted: ['Кам’янець']` → `q=кам'янець` знаходить; `hint: 'Тече через Київ'` → `q=КИЇВ` знаходить.
  - `skips spares, duels and trials` — вікторина зі `spares` («Запасне про Говерлу») і дуеллю зі словом «Говерла» → `q=говерла` → `total: 0`.
  - `deleted quizzes are gone` — після `DELETE /api/quizzes/:id` її запитань у банку немає.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/question-bank.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `searchQuestionBank` (вибірка `id, title, settings, rounds, description, updatedAt` за `eq(quiz.ownerId, ownerId)`, `orderBy(desc(quiz.updatedAt), desc(quiz.id))` → `quizOf` → `roundQuestions` кожного раунду → фільтр типів і `matchesBankQuery` → зріз `pageOffset(page, 30)`) і маршрут (`currentUser` → 401; `questionBankQuerySchema.safeParse(request.query)` → 400 `INVALID`; `CODE_LIMIT`).
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/question-bank.test.ts apps/server/src/quizzes.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/question-bank.ts apps/server/src/question-bank.test.ts apps/server/src/account-routes.ts
git commit -m "feat(server): 43 question bank — GET /api/question-bank searches the asker's own quizzes only, whole questions with the quiz and round they come from, type filter, pages of 30, newest quiz first; proven with two accounts"
```

---

### Задача 3. Веб: місткість раунду, пристосування копії й запит банку (`editor/draft.ts`, `api.ts`)

**Files:**
- Modify: `apps/web/src/editor/draft.ts`, `apps/web/src/editor/draft.test.ts`, `apps/web/src/editor/QuizEditor.tsx` (лише `roomForMore` через `roundCapacity` і `addFromGroup` через `placedPoints` — поведінка та сама), `apps/web/src/api.ts`
- Modify: `apps/web/src/i18n.ts` + шість `locales/*.json` (лише `bankNoFitType`, `bankNoFitLadder`), `apps/web/src/i18n.test.ts` (ця задача створює `ADDED_QUESTION_BANK` з цими двома ключами й вмикає його в обидві перевірки; решту ключів список отримує в задачі 4)

**Interfaces:**
- Consumes: `QuestionBankPage`, `QuestionType` (задача 1).
- Produces:
```ts
// draft.ts
export function roundCapacity(round: Round): number;
export function placedPoints(round: Round, after: Question | undefined, question: Question): number;
export type BankFit = { question: Question } | { issue: TextKey; vars?: Record<string, number> };
export function bankCopy(quiz: Quiz, roundIndex: number, question: Question, after: Question | undefined): BankFit;
// api.ts
export const searchQuestionBank = (query: { q: string; types: readonly QuestionType[]; page: number }) => Promise<ApiData<QuestionBankPage>>;
```

- [ ] **Step 1: Write the failing tests** (`draft.test.ts`, новий `describe('question bank')`):
  - `roundCapacity by round type` — `newClassicRound()` → 100, `newWipeoutRound()` → 15, `newSurvivalRound()` → 30, `newLadderRound()` → 15, `newPuzzlesRound()` → 10, `newQuestRound()` → 20, `newThinkRound()` → 30.
  - `a copy is deep with new ids and the same media` — `single` з `imageUrl` і варіантом з `imageUrl` → `question.id`, id варіантів нові, `correctId` вказує на копію правильного варіанта, адреси ті самі; зміна копії не змінює джерела (`toEqual` знімку до виклику).
  - `a copy fits the round` — запитання з `betsCut: 3` у класику → без `betsCut`; у `newBetsRound()` → `betsCut: 3`; класичне з `reveal` у бліц → без `reveal`; `survey` з `cloudId` і 4 рядками → без `cloudId`, `{ question }`.
  - `prices follow the round` — у «Ва-банк» після запитання за 300 → 400; у «Вибування» → 100; у класиці — своя ціна (750).
  - `what does not fit says why` — `single` з 3 варіантами в «Мільйонер» → `{ issue: 'bankNoFitLadder', vars: { count: 4 } }`; `sudoku` у класику → `{ issue: 'bankNoFitType' }`; `survey` з `cloudId` і 0 рядків у класику → `issue` ≠ undefined (ключ `problemKey`).
  - `searchQuestionBank builds the url` (у `api.test.ts`, якщо є, інакше в `draft.test.ts` поруч з `vi.stubGlobal('fetch')`) — `{ q: 'Дніпро', types: ['single', 'boolean'], page: 2 }` → `GET /api/question-bank?q=%D0%94…&types=single%2Cboolean&page=2`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/editor/draft.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за Interfaces і «Клієнт: місце, ліміти, копія» (`URLSearchParams` для адреси; `roomForMore` і `addFromGroup` у `QuizEditor` — через нові функції без зміни поведінки).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/editor apps/web/src/i18n.test.ts && pnpm typecheck`. Expected: PASS (наявні тести редактора, зокрема `a full list has no room for a question from the group`, — зелені).
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/editor/draft.ts apps/web/src/editor/draft.test.ts apps/web/src/editor/QuizEditor.tsx apps/web/src/api.ts apps/web/src/i18n.ts apps/web/src/i18n.test.ts apps/web/src/locales
git commit -m "feat(web): 43 question bank — round capacity, a deep copy with new ids fitted to the target round (bets cut, reveal, cloud link, wipeout and survival prices, the ladder's four options) or the reason it does not fit, and the bank search request"
```

---

### Задача 4. Веб: панель «Банк запитань» і кнопка в редакторі (`editor/QuestionBank.tsx`)

**Files:**
- Create: `apps/web/src/editor/QuestionBank.tsx`, `apps/web/src/editor/QuestionBank.test.tsx`, `apps/web/src/editor/QuizEditor.bank.test.tsx`
- Modify: `apps/web/src/editor/QuizEditor.tsx` (проп `quizId?: string`, спільний `editor-add-row`, стан `bankOpen`, вставка), `apps/web/src/pages/EditQuiz.tsx` (`quizId={id}`), `apps/web/src/styles.css` (після блоку `group-picker`), `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts`, шість `locales/*.json`

**Interfaces:**
- Consumes: `searchQuestionBank`, `bankCopy`, `roundCapacity` (задача 3); `QuestionBankItem` (задача 1); `typeIcon` (`guide-text.ts`).
- Produces:
```ts
export function QuestionBank(props: {
  types: readonly QuestionType[];          // questionTypesFor(round.type)
  room: number;                            // з «Рішень»
  quizId?: string;                         // позначка «ця вікторина»
  fit: (question: Question) => BankFit;    // перевірка кожного рядка (без after — лише чи підходить)
  onCopy: (items: QuestionBankItem[]) => void; // у порядку позначення
  onClose: () => void;
}): JSX.Element;
```
`QuizEditor.onCopy` будує копії послідовно `bankCopy(quiz, ri, item.question, after)` (`after` — попередня копія або останнє запитання раунду), додає ті, що `{ question }`, у кінець (`resizeLadder` у «Мільйонері»), виділяє першу копію.

Розмітка: `div.group-picker-backdrop` > `div.group-picker.question-bank[role=dialog][aria-modal=true][aria-labelledby]`; шапка як у `GroupPicker` (h2 «Банк запитань» з фокусом, `HelpButton id="setting.questionBank"`, ✕ з `aria-label` «Закрити банк запитань»); тіло: `input[type=search]` («Пошук у своїх вікторинах»), `select` «Тип», `ul.question-bank-list` з `li > label.question-bank-item` (чекбокс, значок, текст, джерело, бали, мініатюра, причина `t(issue, vars)` для невідповідних — чекбокс `disabled`), «Показати ще»; «Завантаження…» (`t('loading')`) і помилка `role="alert"` (`errorText`); низ — `div.actions` з «Копіювати в цей раунд (N)» (`btn btn-primary`) і `role="status"` «Вміщається ще N». Escape і повернення фокусу — як у `GroupPicker`. CSS: `.question-bank-item` — сітка `auto 1fr auto` (чекбокс · текст · мініатюра), `min-width: 0`, `overflow-wrap: anywhere`; мініатюра 48×48 `object-fit: cover`; без нових кольорів (лише змінні теми).

- [ ] **Step 1: Write the failing tests:**
  - `QuestionBank.test.tsx` (`vi.mock('../api', () => ({ searchQuestionBank: vi.fn() }))`, таймери — `vi.useFakeTimers` для затримки 300 мс):
    - `opens with the round's types and lists the results` — перший запит `{ q: '', types: <усі передані>, page: 1 }`; рядок показує текст, «Річки України» · «Раунд 1» (порожня назва раунду), «Бали: 1000», мініатюру `img` з адресою `imageUrl`.
    - `marks the current quiz` — `quizId` збігається → «ця вікторина» в рядку.
    - `search waits and resets the page` — введення «дніпро» → один запит після 300 мс з `q: 'дніпро'`, `page: 1`.
    - `type filter sends one type` — вибір «Так чи ні» у «Тип» → `types: ['boolean']`; назад «Усі дозволені типи» → усі.
    - `more pages append` — `pages: 2` → «Показати ще» → запит `page: 2`, рядків стає більше; на останній сторінці кнопки немає.
    - `a question that does not fit is disabled with the reason` — `fit` повертає `{ issue: 'bankNoFitLadder', vars: { count: 4 } }` → чекбокс `disabled`, текст причини видно.
    - `copy respects the room` — `room: 2`, позначено 3 → «Копіювати в цей раунд (3)» `disabled`, `status` «Вміщається ще 2»; зняти одну → активна; клік → `onCopy` з двома елементами в порядку позначення.
    - `picks survive a new search` — позначити, змінити пошук, кнопка лишає «(1)».
    - `nothing found and errors` — порожня відповідь із `q` → «Нічого не знайдено.»; без `q` → `bankNone`; `{ ok: false, error: 'offline' }` → `role="alert"` з `errorText('offline')`.
    - `Escape closes, but not over open help` — як у `GroupPicker.test.tsx`.
  - `QuizEditor.bank.test.tsx` (`vi.mock('../api')`):
    - `every list round has the bank button` — класика, бліц, «Ва-банк», «Мільйонер», «Головоломки», «Думай інакше» → кнопка «📚 З банку запитань» є; поле, фінал, «Правда про гравця» — немає.
    - `copies append with new ids` — копіювання двох запитань з іншої вікторини і одного з цієї ж (`quizId`) → у списку раунду 1 + 3, усі id різні між собою й від джерел; виділено першу копію; `onDraft` викликано з новою вікториною, що проходить `quizSchema`.
    - `a full round disables the bank` — раунд зі 100 запитаннями → кнопка `disabled`; вікторина на 199 → панель отримує `room: 1`.
    - `a ladder copy keeps the levels` — копія `single` з 4 варіантами в «Мільйонер» → `levels.length === questions.length`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/editor/QuestionBank.test.tsx apps/web/src/editor/QuizEditor.bank.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за Interfaces, «Клієнт: місце, ліміти, копія» і «Тексти (uk)»; переклади решти ключів `ADDED_QUESTION_BANK` у шести локалях (ті самі плейсхолдери, значок 📚 — у всіх).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/editor apps/web/src/groups apps/web/src/pages apps/web/src/i18n.test.ts apps/web/src/source-scan.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/editor/QuestionBank.tsx apps/web/src/editor/QuestionBank.test.tsx apps/web/src/editor/QuizEditor.bank.test.tsx apps/web/src/editor/QuizEditor.tsx apps/web/src/pages/EditQuiz.tsx apps/web/src/styles.css apps/web/src/i18n.ts apps/web/src/i18n.test.ts apps/web/src/locales
git commit -m "feat(web): 43 question bank — From the question bank in every list round: search all own quizzes, filter by the round's types, the current quiz marked, pick several across pages and copy them to the end of the round within the limits, full screen on a phone, texts in seven languages"
```

---

### Задача 5. Довідка автора: «Банк запитань» (`setting.questionBank`)

**Files:**
- Modify: `apps/web/src/help/host-help.ts` (`'questionBank'` в кінець `SETTING_HELP_KEYS`), `apps/web/src/help/help-uk.ts` (записи після `setting.importExport.*`), `apps/web/src/help/__fixtures__/help-uk-golden.json`, `apps/web/src/locales/{en,pl,de,es,it,ar}.help.json`, `apps/web/src/help/help-vars.ts` (`'maxQuestions'`, `'maxQuizQuestions'` у `LIMIT_KEYS`, якщо їх там немає)
- Test: `apps/web/src/help/help-golden.test.ts`, `apps/web/src/help/host-help.test.ts` (наявні), `apps/web/src/editor/QuestionBank.test.tsx` (ⓘ у панелі)

**Тексти (uk):**
- `title`: «Банк запитань»
- `what`: «Будь-яке запитання з твоїх вікторин можна скопіювати в іншу — не передруковуючи. Добре для «найкращого за рік» чи запасного запитання.»
- `how.0`: «У раунді натисни «📚 З банку запитань». Пошук іде по тексту запитання, варіантах, правильних відповідях і підказці — великі літери й різні апострофи не важать.»
- `how.1`: «Видно лише типи, які можна поставити в цей раунд. Запитання, що не підходять з іншої причини, сірі — під ними написано чому.»
- `how.2`: «Познач кілька запитань і натисни «Копіювати в цей раунд». Копії стануть у кінець раунду як звичайні запитання: їх можна правити, а збереже їх «Зберегти». Оригінал не зміниться.»
- `points.0`: «Шукає лише в твоїх власних вікторинах — чужих і групових не видно. Запитання цієї вікторини теж є (з позначкою «ця вікторина»), тож їх можна скопіювати в інший раунд.»
- `tip.0`: «Картинки й аудіо копії — ті самі файли, тож їх не треба завантажувати знову, і вони не зникнуть, навіть якщо видалити стару вікторину.»
- `limits.0`: «У раунді — до {maxQuestions} запитань (в особливих раундах менше), у вікторині — до {maxQuizQuestions}. Якщо позначене не вміщається, кнопка підкаже, скільки ще можна.»

- [ ] **Step 1: Write the failing test:** `QuestionBank.test.tsx` — у шапці панелі є ⓘ; клік відкриває запис із заголовком «Банк запитань». Golden-тест із новим ключем у `SETTING_HELP_KEYS` без записів — FAIL.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/help apps/web/src/editor/QuestionBank.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement:** записи uk, golden (той самий текст після підстановки змінних), переклади в шести `*.help.json` (ті самі ключі й плейсхолдери).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/help apps/web/src/i18n.test.ts apps/web/src/editor/QuestionBank.test.tsx && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/help apps/web/src/locales apps/web/src/editor/QuestionBank.test.tsx
git commit -m "docs(web): 43 question bank — the author help entry on searching own quizzes, the round's types, copying and the limits, in seven languages"
```

---

### Задача 6. Наскрізні сценарії й кадри (`part43-question-bank.e2e.ts`)

**Files:**
- Create: `apps/server/e2e/part43-question-bank.e2e.ts`

Сценарії (`useE2eServer`; автор — `register(page, 'menu', …)` на телефоні 360×740, світла тема init-скриптом `quiz:theme`; вікторини — `page.request.post(\`${base}/api/quizzes\`)`; картинка — `POST /api/uploads` з `avatarPng()`; вміст — річки й гори України, таймери 25–30 с):

- `part 43: question bank — search own quizzes, filter by type, copy several into a round, save and play the copy, phone 360 px, light theme`:
  1. Другий акаунт «Тарас» (окремий контекст) створює «Чужі річки 43» з `single` «Яка річка тече через Відень?» — для перевірки приватності.
  2. Автор: «Річки 43» (класика «Річки»: `single` «Яка річка найдовша в Україні?» з картинкою, Дніпро ✓; `boolean` «Дністер впадає в Чорне море?» → «так»; `text` «Як називається найвища гора України?» → «Говерла»), «Гори 43» (класика: `numeric` «Скільки метрів має Говерла?» → 2061; `boolean` «Говерла вища за Монблан?» → «ні»; бліц «Швидко»: `single` «Яка річка тече через Київ?»). Ціль — «Мікс 43»: класика з одним `single` і бліц з одним `single`.
  3. Редактор «Мікс 43», класичний раунд → «📚 З банку запитань» → панель на весь екран (кадр `p43-bank-open`, `expectNoSideScroll`); видно запитання обох вікторин автора, **немає** «Яка річка тече через Відень?» (і `q=Відень` → «Нічого не знайдено.»).
  4. Пошук «говерла» → три запитання (`text`, `numeric`, `boolean` із «Гір»); фільтр «Тип» → «Так чи ні» → лише «Говерла вища за Монблан?» (кадр `p43-bank-filter`).
  5. Фільтр назад «Усі дозволені типи», пошук «річка» → позначити «Яка річка найдовша в Україні?» (з мініатюрою) і «Яка річка тече через Київ?» → «Копіювати в цей раунд (2)» → у списку раунду 3 запитання; позначити ще «Говерла вища за Монблан?» → разом у раунді 4.
  6. Бліц-раунд «Мікс 43» → банк: у фільтрі «Тип» немає типів, недопустимих у бліці (наприклад, «Точка на карті»), і їх запитань у списку немає.
  7. «Зберегти» → «Мої вікторини»; `GET /api/quizzes/<Мікс 43>`: класика — 4 запитання, у копій нові id (не збігаються з джерелами), тексти, відповіді, бали, таймери ті самі, `imageUrl` копії = `imageUrl` джерела; джерела («Річки 43», «Гори 43») не змінились (`toEqual` до копіювання).
  8. Видалити «Річки 43» → `GET <imageUrl копії>` → 200 і ті самі байти.
  9. Гра «Мікс 43»: «Грати» → сцена (1280×720) → гравець «Оля» (360×740) → «Почати гру» → перше скопійоване запитання з'являється на сцені й телефоні з текстом і картинкою; Оля відповідає «Дніпро» → правильна (бали на пульті > 0).
  10. Світла тема: клас, який ставить `applyThemeClass` (`apps/web/src/theme-mode.ts`), — світлий на всіх кадрах.

- [ ] **Step 1: Write the scenarios.**
- [ ] **Step 2: Run** `pnpm build`, потім (після завершення збирання) `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 43"` з `E2E_SHOTS=1` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 3: Переглянути кадри:** панель на 360 px на весь екран, довгі тексти обрізані, мініатюри не розпирають рядок, кнопка копіювання видна над клавіатурою/низом, світла тема.
- [ ] **Step 4: Commit**
```bash
git add apps/server/e2e/part43-question-bank.e2e.ts
git commit -m "test(e2e): part 43 — the question bank: two own quizzes searched and filtered, another account's quiz never shown, several questions copied into a round with new ids and the same image, saved, the image alive after the source is deleted, the copy played, phone 360 px, light theme"
```

---

## Розбіжності зі специфікацією (рішення плану)

1. **Прибирання осиротілих файлів немає — копіюємо адреси.** У коді жодного видалення `/uploads/*` (єдиний `remove` — резервні копії `backups/db/`), тож копія з тими самими адресами безпечна; це зафіксовано коментарем у `apps/server/src/question-bank.ts` і перевірено в e2e (картинка копії жива після видалення джерела). Якщо колись додадуть прибирання, воно мусить шукати посилання в усіх вікторинах.
2. **«В кожному раунді» — у кожному раунді зі списком запитань.** Поле (клітинки за цінами й категоріями), фінал і «Правда про гравця» плаского списку й «Додати запитання» не мають — банку там теж немає. «Мільйонер», «Головоломки», «Думай інакше» кнопку мають (в «Із групи» їх немає).
3. **Не лише тип вирішує сумісність.** Сервер не повертає типів поза раундом (як у специфікації), але деякі запитання допустимого типу не стануть у раунд як є: `single` не з 4 варіантами в «Мільйонер», «100 до 1» з хмари без власних рядків тощо. Такі показуються **вимкненими з причиною** (не ховаються), щоб сторінки лишались по 30. Решта пристосовується тихо: обріз ставок лишається лише в «Ставках»/«Аукціоні», проявлення картинки — лише в класиці, зв'язок із хмарою прибирається.
4. **Ціна в «Ва-банку» й «Вибуванні» — за правилами раунду**, як для «Із групи» (сходинка +100 і 100), а не з джерела; в інших раундах ціна своя.
5. **Джерела — запитання раундів.** Запасні, дуелі й питання на виживання до банку не входять. Поточна вікторина — у збереженому вигляді (незбережених правок банк не бачить).
6. **«Групових» вікторин у базі немає** — є лише вікторини власника, тож умова «не групові, не чужі» виконується фільтром за `ownerId`; «видалені» видаляються справжнім `DELETE` і в банк не потрапляють.
7. **Пошук за словами.** Запит ділиться на слова, кожне має знайтися (у будь-якому полі з «Рішень»); нормалізація — наявний `answerKey` (регістр, апострофи, лапки, пробіли).
