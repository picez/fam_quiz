# План 73. «Мої вікторини»: особисті категорії, дати створення й порядок

Черга 45 (окреме прохання власника). Автор розкладає свої вікторини по власних **категоріях** (папках), фільтрує список за ними, бачить на кожній картці **дату створення** й міняє **порядок** списку. Дати й порядок — також в адмінці (вкладка «Вікторини» і «Вікторини бота»).

> **Версія стану: `GAME_STATE_VERSION` — БЕЗ змін.** Ігор, рушія, `quizSchema` і збережених кімнат план не торкається.
>
> **Звірка з кодом.** План спирається на `main` 2026-11-22 (`20e3d6dc`). Номери рядків — орієнтир; перед кожною задачею виконавець звіряє код. Остання міграція — `0052_inbox_group`; якщо до початку роботи в `main` з'явилася інша — узяти наступний вільний номер.

## Коротка специфікація

**Прохання власника (дослівно, переклад з чату):** «Додати можливість створювати категорії для вікторин, а також додати дати створення вікторин і можливість сортувати за датою.»

**Відповіді власника:**
- Категорії — **особисті папки**. Кожен автор створює свої категорії в «Моїх вікторинах» (наприклад «Для Асі», «Кіно»), кладе туди вікторини й фільтрує за ними. Ніхто інший їх не бачить.
- Дати й порядок — у «Моїх вікторинах» **і** в адмінському списку вікторин (вікторини бота теж). На кожній картці — дата створення. Порядок: нові, давні, за назвою, нещодавно змінені.

### Що вже є

- Таблиця `quiz` (`apps/server/src/db/schema.ts`, ~рядок 118) уже має `created_at` і `updated_at` (`...stamps`), обидва `NOT NULL DEFAULT now()`. `updateQuiz` і `deleteQuestionAsAdmin` (`apps/server/src/quizzes.ts`) ставлять `updatedAt: new Date()`. **Нові колонки для дат не потрібні.**
- `GET /api/quizzes` (`apps/server/src/account-routes.ts`, ~136) → `listQuizzes(db, ownerId)` — масив `QuizSummary` (`id, title, description, questionCount, truth, updatedAt`), порядок `updated_at desc`. Тип `QuizSummary` оголошено двічі: `apps/server/src/quizzes.ts` і `apps/web/src/api.ts`. Цей масив беруть також `CreateGame`, `Calendar`/`CalendarForm`, `AdminBot` («Скопіювати свою вікторину»), `ChallengeLaunch`, `LibraryShare`, `AutopilotLaunch` — **форму відповіді (масив) не міняти**, лише дописати поля.
- Нові вікторини з'являються лише через `createQuiz` (`quizzes.ts`): редактор і імпорт (`POST /api/quizzes`), «Додати приклад» (`addDemoQuiz` → `POST /api/quizzes`), бібліотека «Взяти собі» (`library-store.ts`, ~306), копія боту (`admin-bot-routes.ts`, ~142). Редактор зберігає через `PUT /api/quizzes/:id` повний `quizSchema`.
- Сторінка `apps/web/src/pages/Quizzes.tsx`: `main.app.wide`, панель `toolbar`, список `ul.quiz-list > li.panel` з кнопками (Грати, Автопілот, Виклик, Бібліотека, Редагувати, Експорт, Видалити).
- Адмінка: `GET /api/admin/quizzes` (`admin-routes.ts`, ~289) з `adminListQuerySchema` (`q`, `page`; ця схема спільна для користувачів, вікторин і ін. — **її не міняти**) → `adminQuizzes` (`admin-store.ts`, ~171), порядок `updated_at desc`, сторінки по `ADMIN_PAGE_SIZE`; `AdminQuizRow` (`packages/shared/src/admin.ts`) без `createdAt`. Вкладка «Бот»: `botQuizzes` (`admin-store.ts`, ~158) → `AdminBotQuiz` (`updatedAt`, без `createdAt`); `AdminBot.tsx` показує `formatDay(quiz.updatedAt)` без підпису.
- Порядок у бібліотеці вже зроблено через URL: `LIBRARY_SORTS` у `packages/shared/src/library.ts`, `useSearchParams` у `apps/web/src/pages/Library.tsx` (типове значення з URL прибирається). Беремо той самий підхід.
- Дати словами: `formatDay(iso)` у `apps/web/src/format.ts` (київський час, без « р.» в uk).
- Видалення акаунта: `deleteAccount` (`account-delete.ts`) видаляє рядок `user`; `quiz` іде каскадом. Тест `account-delete.test.ts` → `HANDLED` перелічує **кожен** FK на `user`; `apps/server/src/testing/user-refs.ts` → `referencing` рахує рядки кожної таблиці.
- Об'єднання акаунтів: `MERGE_RULES` (`account-merge-rules.ts`) = `HISTORY_RULES` + `PEOPLE_RULES` (`account-merge-people.ts`); `quiz.owner_id` — у `PLAIN_KEYS`. Тест «every foreign key to user has a merge rule» (`account-merge-history.test.ts`, ~500) вимагає правило для кожного FK на `user`.
- Резервні копії (`db-backup.ts`/`db-restore.ts`) беруть таблиці й колонки з `information_schema` і знімають/повертають FK самі — нова таблиця потрапляє в копію без змін коду.
- Широкий макет (67): від 1024 px `.app.wide` = `--w-page`, `.quiz-list` — сітка `repeat(auto-fill, minmax(var(--card-min), 1fr))`; `.app.wide > :is(p, .field, form)` обмежені `--w-read`.

**Назви.** В інтерфейсі — «Категорії» (слово власника). У коді — **`folder`** (`quiz_folder`, `folderId`, `QuizFolder`): слово `category` уже зайняте категоріями раунду «поле» (`board`), плутати не можна.

### 1. Категорії (папки)

- **Одна категорія на вікторину** (або жодної): колонка `quiz.folder_id uuid NULL` з FK на `quiz_folder.id ON DELETE SET NULL`. Багато-до-багатьох не робимо (див. «Рішення власника», п. 1).
- Таблиця **`quiz_folder`**: `id uuid pk`, `owner_id text NOT NULL → user.id ON DELETE CASCADE`, `name text NOT NULL`, `position integer NOT NULL DEFAULT 0`, `created_at`, `updated_at`. Унікальність назви в межах автора без огляду на регістр: `uniqueIndex('quiz_folder_owner_name_idx').on(ownerId, sql\`lower(name)\`)`; індекс `quiz_folder_owner_idx` на `owner_id`; індекс `quiz_folder_idx` на `quiz.folder_id`.
- **Межі:** до **30** категорій на автора (`QUIZ_FOLDER_LIMITS.perOwner`), назва **1–40** символів після `trim` і схлопування пробілів (`QUIZ_FOLDER_LIMITS.nameMax`), без керівних символів. Порожня — `400 invalid_payload`. Така сама назва (без огляду на регістр) — `409 folder_name_taken`. 31-ша — `409 folders_full`.
- **Перейменування** — `PUT /api/quiz-folders/:id { name }`. **Порядок** — кнопки «вище/нижче» біля кожної категорії; клієнт шле повний новий порядок `PUT /api/quiz-folders/order { ids }` (рівно всі id автора, без повторів; інакше `409 folders_changed` — клієнт перечитує). Перетягування мишею не робимо (доступність і 360 px).
- **Видалення категорії** — `DELETE /api/quiz-folders/:id` → `204`. Вікторини з неї **не видаляються**, а стають «Без категорії» (`SET NULL`). Перед видаленням — `window.confirm` з цим поясненням.
- **Перекласти вікторину** — `PUT /api/quizzes/:id/folder { folderId: string | null }` → `200 { folderId }`. Чужа вікторина чи чужа/невідома категорія — `404 not_found` (без підказки, чи вона існує). Перекладання **не змінює** `updated_at` («нещодавно змінені» — про вміст вікторини).
- **Хто бачить:** лише автор. Усі маршрути — `currentUser`, інакше `401`; кожен запит обмежено `owner_id = я`. У профілі, бібліотеці, адмінці категорій **немає** (адмін бачить лише дати й порядок).
- **Копія, імпорт, «Взяти собі» з бібліотеки, приклад, копія боту** — нова вікторина **без категорії** (`createQuiz` `folder_id` не ставить; категорія — властивість рядка, а не вмісту `Quiz`, тож у JSON експорту/бібліотеки її немає).
- Редактор (`PUT /api/quizzes/:id`) і `deleteQuestionAsAdmin` `folder_id` **не чіпають**.
- **Об'єднання акаунтів (66):** категорії другорядного (S) переходять до головного (P). Категорія S з такою самою назвою (без огляду на регістр), як у P, **зливається**: її вікторини переходять у категорію P, сама вона зникає. Решта категорій S — `owner_id = P`, `position` — після всіх категорій P у їхньому порядку. Межу 30 тут **можна перевищити** (нічого не губимо); нову категорію тоді не створити, доки їх не стане менше 30.
- **Видалення акаунта:** категорії йдуть каскадом разом із `user` (як і вікторини). Окремого коду не треба — лише тести.

### 2. Дати

- `QuizSummary` + `createdAt: string` і `folderId: string | null`.
- Картка в «Моїх вікторинах»: рядок `meta quiz-dates` — «Створено 12 жовтня 2026»; якщо день зміни інший — «Створено 12 жовтня 2026 · змінено 3 листопада 2026» (`formatDay`, київський день). Елемент `<time dateTime={createdAt}>`.
- Адмінка «Вікторини»: `AdminQuizRow.createdAt`; той самий рядок дат на картці. «Вікторини бота»: `AdminBotQuiz.createdAt`; наявний рядок `formatDay(quiz.updatedAt)` без підпису замінити тим самим рядком дат.

### 3. Порядок

- `QUIZ_SORTS = ['new', 'old', 'name', 'changed'] as const` (порядок у списку — як назвав власник). **Типовий — `changed`**: так список поводиться сьогодні (щойно зредагована вікторина нагорі), і інші сторінки з `GET /api/quizzes` нічого не помітять (див. «Рішення власника», п. 2).
- `new` — `created_at desc`; `old` — `created_at asc`; `changed` — `updated_at desc`; `name` — за назвою **`Intl.Collator('uk', { sensitivity: 'base', numeric: true })`** (Postgres-колація `C` ставить «є, і, ї, ґ» після «я»). Нічия — за `id`, щоб порядок був стабільний.
- «Мої вікторини»: сортування й фільтр — **на клієнті** (сервер віддає всі вікторини автора; родинний масштаб). Функція `sortQuizzes` — у `packages/shared`, щоб її тестувати й узяти в адмінці.
- Адмінка «Вікторини» (сторінками): новий параметр `sort` у **новій** схемі `adminQuizListQuerySchema = adminListQuerySchema.extend({ sort: z.enum(QUIZ_SORTS).default('changed') }).strict()`. `new`/`old`/`changed` — `ORDER BY` у SQL; `name` — спершу всі `(id, title)` за умовою пошуку, сортування `compareQuizTitles` у Node, далі сторінка id і повні рядки для неї (порядок — за списком id).
- Адмінка «Вікторини бота»: список уже весь (без сторінок) — `select` «Порядок» і `sortQuizzes` на клієнті.

### 4. URL і вигляд

- «Мої вікторини»: `?folder=<id>|none` і `?sort=new|old|name`. Типові («Усі», `changed`) з URL прибираються (як `popular` у бібліотеці). Невідомий `folder` (категорію видалено, чуже посилання) чи `sort` — показується «Усі» / `changed`, параметр прибирається `replace`-ом. Окремо в `localStorage` не запам'ятовуємо — URL уже переживає «Назад» і оновлення сторінки.
- Адмінка «Вікторини»: `?sort=` у URL вкладки (`useSearchParams`, як `AdminLog`); пошук `q` лишається як є. При зміні порядку — сторінка 1.
- **Над списком** (коли вікторин > 0): блок `div.quiz-folders` —
  - рядок фільтра `div.quiz-folder-filter role="group" aria-label="Категорії"`: кнопки-чипи `aria-pressed` «Усі (N)», кожна категорія «Кіно (3)» у порядку `position`, «Без категорії (2)» — останньою й лише коли є хоч одна категорія; переносяться рядками (`flex-wrap`), на 360 px — без бічної прокрутки, довга назва ріжеться `overflow-wrap: anywhere`;
  - поруч — `label.field` «Порядок» з `select` (4 варіанти);
  - кнопка «Керувати категоріями» (`aria-expanded`) відкриває панель `section.panel.quiz-folder-manager` під рядком: підказка «Категорії бачиш лише ти…», поле «Нова категорія» (`maxLength` 40, лічильник не треба) + «Додати», список категорій — кожна з полем назви й «Зберегти» (активна, коли назва змінилась), «↑»/«↓» (`aria-label` «Вище: {name}» / «Нижче: {name}»; крайні неактивні), «Видалити категорію» (`btn-danger`). Досягнуто 30 — замість поля «Можна мати до 30 категорій.».
- **На картці:** рядок дат; коли в автора є хоч одна категорія — `label.field.quiz-folder-pick` «Категорія» з `select` («Без категорії» + категорії); зміна → `PUT …/folder`, оптимістично в стані, при помилці — повернути й показати `error`. Немає категорій — поля немає (картка як була).
- Порожній результат фільтра: «У цій категорії поки немає вікторин.» / для «Без категорії» — «Усі вікторини вже в категоріях.».
- **360 px:** фільтр і `select` порядку — у стовпчик (`select` на всю ширину), чипи переносяться; у картці `select` категорії на всю ширину під датами. **1920 px:** блок фільтра — один рядок на всю ширину колонки `--w-page` (це `div`, не `p`/`form`, тож `--w-read` його не звужує), панель керування — `max-inline-size: var(--w-read)`; картки — наявна сітка 67.
- CSS — блок «73» **у кінці** `styles.css`, лише селектори `.quiz-folders`, `.quiz-folder-*`, `.quiz-dates`; без `@media (max-width: …)` (телефон — базові правила, ПК — `@media (min-width: 1024px)` всередині блоку 73, якщо треба). Наявні класи — `panel`, `field`, `btn`, `btn-danger`, `btn-quiet`, `meta`, `toolbar`, `error`.

### 5. Нові коди помилок

| Код | Статус | Коли |
|---|---|---|
| `folder_name_taken` | 409 | така назва вже є в автора |
| `folders_full` | 409 | уже 30 категорій |
| `folders_changed` | 409 | `order` не збігся з поточним набором |
| `not_found` | 404 | чужа/невідома категорія чи вікторина, не-UUID |
| `invalid_payload` | 400 | порожня/задовга назва, зайві поля, повтори в `ids` |

## Глобальні обмеження

- **Prettier не запускати.** Тести — з `--maxWorkers=2`. Коментарі в коді — українською. `python3` тут заглушка: правити лише Edit/node; після коміту — `git show --stat`.
- Міграція **лише додає** (нова таблиця, колонка `NULL`, індекси, FK). Генерувати `pnpm --filter @quiz/server exec drizzle-kit generate --name quiz_folder` **після** злиття всього, що вже в `main`; очікувано `0053_quiz_folder.sql` + `meta/0053_snapshot.json` + `_journal.json`. Коментар українською в першому рядку SQL (як у `0052`). Жодного `DROP`.
- Нові ключі i18n — у всіх 7 мовах (uk `apps/web/src/i18n.ts`, решта `apps/web/src/locales/{en,pl,de,es,it,ar}.json`) і в новому списку **`ADDED_73`** у `apps/web/src/i18n.test.ts` (і в загальному фільтрі «adds no uk keys beyond the agreed list»). Нові uk-тексти — на «ти». Перекладені значення не дорівнюють uk; змінні `{…}` — ті самі.
- Не чіпати: `quizSchema` і `upgradeQuiz` (категорія — не частина вікторини), форму відповіді `GET /api/quizzes` (лишається масивом, типовий порядок `updated_at desc`), `adminListQuerySchema`.
- Порядок замків у сховищі категорій: **рядки `quiz_folder` автора `FOR UPDATE` (за `id`)**, потім `quiz`. Межа 30 і унікальність перевіряються в тій самій транзакції; унікальний індекс — остання лінія (`23505` → `folder_name_taken`).
- E2E — новий `apps/server/e2e/part73-quiz-folders.e2e.ts`; кадри на 360 і 1920 px, без бічної прокрутки.
- Не комітити нічого поза файлами задачі; повідомлення комітів — англійською в стилі репозиторію, наприкінці «(73)».

### Нові ключі i18n (uk)

| Ключ | uk |
|---|---|
| `quizFoldersLabel` | `Категорії` |
| `quizFolderAll` | `Усі ({count})` |
| `quizFolderNone` | `Без категорії ({count})` |
| `quizFolderChip` | `{name} ({count})` |
| `quizFoldersManage` | `Керувати категоріями` |
| `quizFoldersHint` | `Категорії бачиш лише ти. Кожна вікторина може лежати в одній категорії.` |
| `quizFoldersEmpty` | `Категорій ще немає. Створи першу — наприклад, «Для Асі» чи «Кіно».` |
| `quizFolderNewLabel` | `Нова категорія` |
| `quizFolderAdd` | `Додати` |
| `quizFolderNameLabel` | `Назва категорії` |
| `quizFolderSave` | `Зберегти` |
| `quizFolderUp` | `Вище: {name}` |
| `quizFolderDown` | `Нижче: {name}` |
| `quizFolderDelete` | `Видалити категорію` |
| `quizFolderDeleteConfirm` | `Видалити категорію «{name}»? Вікторини з неї не зникнуть — вони стануть «Без категорії».` |
| `quizFoldersLimit` | `Можна мати до {max} категорій.` |
| `quizFolderPick` | `Категорія` |
| `quizFolderPickNone` | `Без категорії` |
| `quizFolderEmptyList` | `У цій категорії поки немає вікторин.` |
| `quizNoFolderEmptyList` | `Усі вікторини вже в категоріях.` |
| `quizSort` | `Порядок` |
| `quizSort_new` | `Спершу нові` |
| `quizSort_old` | `Спершу давні` |
| `quizSort_name` | `За назвою` |
| `quizSort_changed` | `Нещодавно змінені` |
| `quizCreatedOn` | `Створено {date}` |
| `quizCreatedChanged` | `Створено {created} · змінено {changed}` |
| `err_folder_name_taken` | `Категорія з такою назвою вже є.` |
| `err_folders_full` | `Більше категорій не можна — це межа.` |
| `err_folders_changed` | `Категорії змінилися в іншій вкладці — список оновлено, спробуй ще раз.` |

Перед додаванням — `grep -n "quizSort\|Created\|err_folder" apps/web/src/i18n.ts`: якщо придатний ключ уже є — не дублювати, прибрати з таблиці й зі списку `ADDED_73`. Адмінка бере ті самі `quizSort_*`, `quizSort`, `quizCreatedOn`, `quizCreatedChanged` (окремих адмін-ключів не треба). У `ar` — `dir="auto"` для назв категорій; змінні — без змін.

---

### Задача 1. Спільне: межі, схеми, порядок

**Файли:** `packages/shared/src/quiz-folders.ts` (новий), `packages/shared/src/quiz-folders.test.ts` (новий), `packages/shared/src/index.ts`, `packages/shared/src/admin.ts`, `packages/shared/src/admin.test.ts`.

**Спершу тести (падають):**
- `quiz-folders.test.ts`:
  - `quizFolderNameSchema` приймає `'  Для   Асі '` → `'Для Асі'`; відкидає `''`, `'   '`, 41 символ, рядок з `\n`/`\u0000`.
  - `quizFolderInputSchema` (`{ name }`.strict) відкидає зайве поле; `quizFolderOrderSchema` (`{ ids: uuid[] }`, до 30, без повторів) відкидає повтор і 31 id; `quizFolderMoveSchema` приймає `{ folderId: null }` і uuid, відкидає `''` і зайве поле.
  - `QUIZ_SORTS` = `['new', 'old', 'name', 'changed']`; `QUIZ_FOLDER_LIMITS` = `{ perOwner: 30, nameMax: 40 }`.
  - `sortQuizzes(list, sort)` на трьох вікторинах (`createdAt`/`updatedAt` різні): `new`, `old`, `changed` дають очікуваний порядок; `name` ставить «Ґанок» після «Гора» й перед «Дім», «Їжа» після «Іспит», «Квіз 2» перед «Квіз 10»; рівні ключі — за `id`; вхідний масив не змінюється.
  - `parseQuizSort('x')` → `'changed'`; `parseQuizSort('old')` → `'old'`.
- `admin.test.ts`: `adminQuizListQuerySchema` приймає `{}` (→ `sort: 'changed'`, `page: 1`), `{ sort: 'name', q: 'ріки', page: '2' }`; відкидає `sort: 'popular'` і зайве поле; `adminListQuerySchema` як і був (без `sort`).

**Зміни:**
- `quiz-folders.ts`:
  ```ts
  /** 73: особисті категорії вікторин — бачить лише автор; одна категорія на вікторину. */
  export const QUIZ_FOLDER_LIMITS = { perOwner: 30, nameMax: 40 } as const;
  export const QUIZ_SORTS = ['new', 'old', 'name', 'changed'] as const;
  export type QuizSort = (typeof QUIZ_SORTS)[number];
  export const parseQuizSort = (raw: string | null | undefined): QuizSort => QUIZ_SORTS.find((one) => one === raw) ?? 'changed';
  export interface QuizFolder { id: string; name: string; position: number; createdAt: string }
  export const quizFolderNameSchema = z.string().transform(/* trim + схлопнути пробіли */).pipe(z.string().min(1).max(QUIZ_FOLDER_LIMITS.nameMax).regex(/^[^\p{Cc}]+$/u));
  export const quizFolderInputSchema = z.object({ name: quizFolderNameSchema }).strict();
  export const quizFolderOrderSchema = z.object({ ids: z.array(z.string().uuid()).max(QUIZ_FOLDER_LIMITS.perOwner).refine(noRepeats) }).strict();
  export const quizFolderMoveSchema = z.object({ folderId: z.string().uuid().nullable() }).strict();
  /** Порівняння назв за українською абеткою (Postgres-колація цього не вміє). */
  export function compareQuizTitles(a: { title: string; id: string }, b: { title: string; id: string }): number
  export function sortQuizzes<T extends { id: string; title: string; createdAt: string; updatedAt: string }>(list: readonly T[], sort: QuizSort): T[]
  ```
  (`Intl.Collator` — один екземпляр на модуль.)
- `index.ts`: `export * from './quiz-folders';`.
- `admin.ts`: `adminQuizListQuerySchema`; `AdminQuizRow` + `createdAt: string`; `AdminBotQuiz` + `createdAt: string`.

**Команди:** `pnpm vitest run packages/shared/src/quiz-folders.test.ts packages/shared/src/admin.test.ts --maxWorkers=2`; `pnpm typecheck` (впаде там, де будуються `AdminQuizRow`/`AdminBotQuiz` і в тестових фікстурах — дописати `createdAt` у `admin-store.ts` (`iso(row.createdAt)`) і фікстури `AdminQuizzes.test.tsx`/`AdminBot.test.tsx` у цій самій задачі, без зміни поведінки).

**Коміт:** `feat(shared): quiz folder limits and schemas, quiz sorts with Ukrainian title order, createdAt on admin quiz rows (73)`

---

### Задача 2. Таблиця `quiz_folder`, колонка `quiz.folder_id`, міграція, видалення й об'єднання акаунтів

**Файли:** `apps/server/src/db/schema.ts`, `apps/server/drizzle/0053_quiz_folder.sql` + `apps/server/drizzle/meta/0053_snapshot.json` + `apps/server/drizzle/meta/_journal.json` (генерує drizzle-kit), `apps/server/src/account-merge-people.ts`, `apps/server/src/account-merge-people.test.ts`, `apps/server/src/account-delete.test.ts`, `apps/server/src/testing/user-refs.ts`.

**Спершу тести (падають):**
- `account-delete.test.ts`: `'quiz_folder.owner_id'` у `HANDLED`; у наявному тесті «видаляє все людини» — створити їй категорію з вікториною → після `deleteAccount` `referencing(db, id).quiz_folder === 0`.
- `user-refs.ts`: `await add('quiz_folder', db.select().from(quizFolder).where(eq(quizFolder.ownerId, userId)))`.
- `account-merge-people.test.ts`, новий `describe('quiz folders (73)')`:
  - у P «Кіно» (2 вікторини), у S «кіно» (1 вікторина) і «Для Асі» (1) → після злиття в P рівно дві категорії: «Кіно» (тепер 3 вікторини, id той самий, що був у P) і «Для Асі» з `position` > позиції «Кіно»; категорії «кіно» з S немає; у S категорій 0; `updated_at` вікторин не змінився.
  - у P 30 категорій, у S 2 нові → у P 32 (нічого не загублено).
- Тест «every foreign key to user has a merge rule» має пройти лише після нового правила.
- Тест міграції (як `schema.test.ts` «the profiles migration applies over an existing database»): база до `0052_inbox_group`, вікторина вже є → решта міграцій → у неї `folder_id is null`, `created_at` не змінився; таблиця `quiz_folder` порожня.

**Зміни:**
- `schema.ts`: `quizFolder` **перед** `quiz`:
  ```ts
  /** 73: особиста категорія (папка) вікторин автора; бачить лише він. Назва унікальна без огляду на регістр. */
  export const quizFolder = pgTable(
    'quiz_folder',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
      name: text('name').notNull(),
      position: integer('position').notNull().default(0),
      ...stamps,
    },
    (table) => [index('quiz_folder_owner_idx').on(table.ownerId), uniqueIndex('quiz_folder_owner_name_idx').on(table.ownerId, sql`lower(${table.name})`)],
  );
  ```
  У `quiz`: `folderId: uuid('folder_id').references((): AnyPgColumn => quizFolder.id, { onDelete: 'set null' })` (коментар «73: категорія автора; видалена категорія — вікторина без категорії») та `index('quiz_folder_idx').on(table.folderId)`.
- Міграція — див. «Глобальні обмеження». Перевірити згенерований SQL: `CREATE TABLE "quiz_folder"`, `ALTER TABLE "quiz" ADD COLUMN "folder_id" uuid`, два FK, три індекси, нічого більше.
- `account-merge-people.ts`: нове правило (перед `plainRule`):
  ```ts
  /** 73. Категорії вікторин: однакова назва (без регістру) — вікторини S у категорію P, категорія S геть; решта — до P після категорій P. */
  const quizFolderRule: MergeRule = { keys: ['quiz_folder.owner_id'], async run(tx, { primaryId: P, secondaryId: S }) { … } };
  ```
  Три оператори: `update quiz set folder_id = p.id from quiz_folder s join quiz_folder p on p.owner_id = P and lower(p.name) = lower(s.name) where s.owner_id = S and quiz.folder_id = s.id`; `delete from quiz_folder s where s.owner_id = S and exists (same-name у P)`; `update quiz_folder set owner_id = P, position = (select coalesce(max(position), -1) from quiz_folder where owner_id = P) + 1 + position where owner_id = S`. Додати в `PEOPLE_RULES`.
- Резервні копії: коду не треба; у задачі 11 прогнати `db-backup.test.ts` і `db-restore.test.ts`.

**Команди:** `pnpm --filter @quiz/server exec drizzle-kit generate --name quiz_folder`; `pnpm vitest run apps/server/src/account-delete.test.ts apps/server/src/account-merge-people.test.ts apps/server/src/account-merge-history.test.ts apps/server/src/schema.test.ts apps/server/src/db-restore.test.ts --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(server): quiz_folder table and quiz.folder_id (additive migration 0053), folders follow account merge and delete (73)`

---

### Задача 3. Сервер: сховище категорій і `createdAt`/`folderId` у списку

**Файли:** `apps/server/src/quiz-folders.ts` (новий), `apps/server/src/quiz-folders.test.ts` (новий), `apps/server/src/quizzes.ts`, `apps/server/src/quizzes.test.ts`.

**Спершу тести (падають):**
- `quiz-folders.test.ts` (тестова БД `createTestDb`, двоє людей «Олена» й «Петро»):
  - `createFolder` → `{ ok: true, folder }` з `position` = кількість наявних; та сама назва в іншому регістрі → `folder_name_taken`; така сама назва в Петра — можна; 31-ша → `folders_full`.
  - Дві одночасні `createFolder` з однаковою назвою (`Promise.all`) → рівно один успіх, другий `folder_name_taken` (не 500).
  - `renameFolder` власної → новий `name`, `updatedAt` новий; на назву іншої своєї → `folder_name_taken`; на ту саму назву в іншому регістрі (`Кіно` → `кіно`) — можна; чужої → `not_found`.
  - `reorderFolders` з усіма id → позиції 0..n−1 за списком; без одного id, із чужим id, з невідомим → `folders_changed`, позиції без змін.
  - `deleteFolder` → вікторини з неї мають `folderId: null`, їх `updatedAt` не змінився; позиції решти — без дірок (0..n−1); чужої → `not_found`.
  - `moveQuiz` власну вікторину у власну категорію → `ok`; у `null` → `ok`; у чужу категорію → `not_found`; чужу вікторину → `not_found`; не-UUID → `not_found`; `updatedAt` вікторини не змінився.
  - `listFolders` — лише свої, за `position`, потім `created_at`.
- `quizzes.test.ts`:
  - `listQuizzes` віддає `createdAt` (ISO) і `folderId`; порядок — `updated_at desc`, як і був.
  - `updateQuiz` (редактор) не скидає `folderId`; `deleteQuestionAsAdmin` — теж.
  - `createQuiz` завжди дає `folderId: null`; «Взяти собі» з бібліотеки (наявний тест `library-store`, дописати рядок) — копія без категорії, навіть коли оригінал у категорії.

**Зміни:**
- `quiz-folders.ts`:
  ```ts
  type Fail<E extends string> = { ok: false; error: E };
  export async function listFolders(db: Db, ownerId: string): Promise<QuizFolder[]>
  export async function createFolder(db: Db, ownerId: string, name: string, now: Date): Promise<{ ok: true; folder: QuizFolder } | Fail<'folder_name_taken' | 'folders_full'>>
  export async function renameFolder(db: Db, ownerId: string, id: string, name: string, now: Date): Promise<{ ok: true; folder: QuizFolder } | Fail<'not_found' | 'folder_name_taken'>>
  export async function reorderFolders(db: Db, ownerId: string, ids: readonly string[], now: Date): Promise<{ ok: true; folders: QuizFolder[] } | Fail<'folders_changed'>>
  export async function deleteFolder(db: Db, ownerId: string, id: string): Promise<boolean>
  export async function moveQuiz(db: Db, ownerId: string, quizId: string, folderId: string | null): Promise<boolean>
  ```
  Кожна зміна — у транзакції: спершу `select … from quiz_folder where owner_id = $1 order by id for update` (замок усього набору автора: межа, позиції й унікальність без гонок), далі перевірки. Порушення унікального індексу (`23505`, `quiz_folder_owner_name_idx`) — `folder_name_taken`. `deleteFolder` після видалення перенумеровує позиції. `moveQuiz`: `update quiz set folder_id = $folder where id = $quiz and owner_id = $me and ($folder is null or exists (select 1 from quiz_folder where id = $folder and owner_id = $me))` — **без** `updated_at`; 0 рядків → `false`.
- `quizzes.ts`: `QuizSummary` + `createdAt`, `folderId` (`row.createdAt.toISOString()`, `row.folderId`). Інші функції — без змін (`createQuiz` `folderId` не передає; `updateQuiz`/`deleteQuestionAsAdmin` у `set` його не мають — тести це фіксують).

**Команди:** `pnpm vitest run apps/server/src/quiz-folders.test.ts apps/server/src/quizzes.test.ts apps/server/src/library-store.test.ts --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(server): personal quiz folders store (create, rename, reorder, delete, move a quiz); quiz list carries createdAt and folderId (73)`

---

### Задача 4. Сервер: маршрути категорій

**Файли:** `apps/server/src/quiz-folder-routes.ts` (новий), `apps/server/src/quiz-folder-routes.test.ts` (новий), `apps/server/src/app.ts`.

**Спершу тести (падають)** — за зразком `quizzes.test.ts` (`buildApp`, `signUp`, `call`):
- Гість на кожен маршрут → `401 unauthorized`, змін у БД немає.
- `GET /api/quiz-folders` → `[]`, після створення — `[{ id, name, position, createdAt }]` у порядку `position`; Петро не бачить категорій Олени.
- `POST /api/quiz-folders { name: ' Кіно ' }` → `201` з `name: 'Кіно'`; повтор `'кіно'` → `409 folder_name_taken`; `{ name: '' }`/41 символ/зайве поле → `400 invalid_payload`; 31-ша → `409 folders_full`.
- `PUT /api/quiz-folders/:id { name }` → `200`; чужа/невідома/не-UUID → `404 not_found`.
- `PUT /api/quiz-folders/order { ids }` → `200` з новим списком; неповний → `409 folders_changed`; повтори → `400 invalid_payload`.
- `DELETE /api/quiz-folders/:id` → `204`; вікторини з неї в `GET /api/quizzes` мають `folderId: null`; чужа → `404`.
- `PUT /api/quizzes/:id/folder { folderId }` → `200 { folderId }`; `{ folderId: null }` → `200`; чужа вікторина чи чужа категорія → `404 not_found`; `{}` → `400 invalid_payload`.
- `GET /api/quizzes` віддає `createdAt` і `folderId`.

**Зміни:**
- `quiz-folder-routes.ts`: `registerQuizFolderRoutes(app, { db, currentUser, now })` (залежності — як у `registerChallengeRoutes`/`registerLibraryRoutes`); ліміт на запис — `CODE_LIMIT` з `account-routes.ts` (120/хв), як у сусідніх особистих маршрутах. `PATCH` не беремо — `apps/web/src/api.ts` `request` знає лише `GET/POST/PUT/DELETE`. Статуси — з таблиці «Нові коди помилок». Маршрут `/api/quiz-folders/order` зареєструвати так, щоб він не плутався з `/:id` (Fastify віддає перевагу статичному сегменту — тест з `order` це перевіряє).
- `PUT /api/quizzes/:id/folder` — у цьому ж файлі (тема одна), не в `account-routes.ts`.
- `app.ts`: виклик `registerQuizFolderRoutes` поруч з `registerLibraryRoutes`.

**Команди:** `pnpm vitest run apps/server/src/quiz-folder-routes.test.ts apps/server/src/quizzes.test.ts --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(server): /api/quiz-folders routes and moving a quiz into a folder, owner only (73)`

---

### Задача 5. Сервер: адмінка — дати й порядок

**Файли:** `apps/server/src/admin-store.ts`, `apps/server/src/admin-store.test.ts`, `apps/server/src/admin-routes.ts`, `apps/server/src/admin-routes.test.ts`, `apps/server/src/admin-bot-routes.test.ts` (якщо `AdminBotQuiz` там порівнюється цілим).

**Спершу тести (падають):**
- `admin-store.test.ts`: чотири вікторини двох авторів (одна — бота) з різними `created_at`/`updated_at` (вставити напряму, як у наявних тестах) → `adminQuizzes(db, { page: 1, sort })` для `new`/`old`/`changed`/`name` дає очікуваний порядок id; `name` — за українською абеткою («Ґанок» між «Гора» й «Дім»), разом з `q` (пошук за ніком теж); `name` на двох сторінках (`ADMIN_PAGE_SIZE` + 1 вікторин) — друга сторінка продовжує першу без повторів; рядки мають `createdAt`.
- `botQuizzes` — рядки мають `createdAt`.
- `admin-routes.test.ts`: `GET /api/admin/quizzes?sort=old` → `200`, порядок `old`; `?sort=popular` → `400 invalid_payload`; без `sort` — як раніше (`changed`); не-адмін → `404`.

**Зміни:**
- `admin-store.ts`: `adminQuizzes(db, query: { q?: string; page: number; sort: QuizSort })`. `ORDER BY` за `sort` (`new` — `desc(quiz.createdAt), quiz.id`; `old` — `asc(quiz.createdAt), quiz.id`; `changed` — як було). Для `name`: `select({ id, title })` з тією самою умовою, `sort(compareQuizTitles)`, `slice` сторінки, далі наявний запит з `inArray(quiz.id, ids)` і впорядкування за індексом id (коментар: «73: назви за українською абеткою; колація бази ставить "є, і, ї, ґ" після "я"»). `createdAt: iso(r.row.createdAt)` у рядках і в `botQuizzes`.
- `admin-routes.ts`: `/api/admin/quizzes` — `adminQuizListQuerySchema` замість `adminListQuerySchema`.

**Команди:** `pnpm vitest run apps/server/src/admin-store.test.ts apps/server/src/admin-routes.test.ts apps/server/src/admin-bot-routes.test.ts --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(server): admin quiz list sorts by created, oldest, name (Ukrainian order) or changed; bot quizzes carry createdAt (73)`

---

### Задача 6. Ключі i18n у 7 мовах

**Файли:** `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,pl,de,es,it,ar}.json`, `apps/web/src/i18n.test.ts`.

**Спершу тести (падають):**
- `i18n.test.ts`: `const ADDED_73 = [...]` — усі ключі з таблиці; `it('73 keys (quiz folders, dates and sorting) are in every locale', …)` — копія тесту `ADDED_72` (uk не порожні; точні uk для `quizFolderDeleteConfirm`, `quizCreatedChanged`, `quizSort_changed`; у кожній мові є, змінні збігаються, текст ≠ uk — крім `quizFolderChip` (`{name} ({count})` однаковий у всіх мовах: винести в окремий список-виняток з коментарем); `ADDED_73` — у фільтр «adds no uk keys beyond the agreed list».

**Зміни:** ключі з таблиці — в uk поруч із `quizzesTitle`/`noQuizzes` з коментарем `// 73: категорії, дати й порядок у «Моїх вікторинах» (і дати/порядок в адмінці)`; uk — на «ти»; переклади в 6 JSON (неформальне звертання там, де мова його розрізняє: pl «ty», de «du», es/it «tú/tu»; ar — як у сусідніх ar-рядках; лапки — як у сусідніх ключах відповідної мови). `err_folders_full` — без змінної (`errorText` змінних не передає).

**Команди:** `pnpm vitest run apps/web/src/i18n.test.ts --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(i18n): quiz folders, created dates and sort texts in 7 languages (73)`

---

### Задача 7. Веб: дати й порядок у «Моїх вікторинах», URL

**Файли:** `apps/web/src/api.ts`, `apps/web/src/pages/Quizzes.tsx`, `apps/web/src/pages/Quizzes.test.tsx`, `apps/web/src/format.ts`, `apps/web/src/format.test.ts`.

**Спершу тести (падають):**
- `format.test.ts`: `quizDatesText({ createdAt: '2026-10-12T10:00:00Z', updatedAt: '2026-10-12T20:00:00Z' })` → «Створено 12 жовтня 2026»; з `updatedAt` 3 листопада → «Створено 12 жовтня 2026 · змінено 3 листопада 2026»; межа доби за Києвом (`'2026-10-12T21:30:00Z'` — уже 13 жовтня) рахується як інший день.
- `Quizzes.test.tsx` (фікстура `summary` + `createdAt`, `folderId: null`; три вікторини з різними датами й назвами):
  - кожна картка має рядок «Створено …»;
  - типово порядок — як прийшов з сервера (`changed`), у `select` «Порядок» вибрано «Нещодавно змінені», в URL `sort` немає;
  - вибір «Спершу давні» → порядок карток за `createdAt asc`, URL `?sort=old`; «За назвою» → українська абетка;
  - відкриття `/quizzes?sort=new` — одразу «Спершу нові»; `/quizzes?sort=zzz` → «Нещодавно змінені», параметр прибрано.
  (Для перевірки URL — маршрут-шпигун `useLocation` у тестовому `Routes`, як у `Library.test.tsx`.)

**Зміни:**
- `api.ts`: `QuizSummary` + `createdAt: string; folderId: string | null` (решта споживачів — без змін; у їхніх тестових фікстурах дописати поля, якщо typecheck вимагає).
- `format.ts`: `quizDatesText(quiz)` через `formatDay` і ключі `quizCreatedOn`/`quizCreatedChanged`.
- `Quizzes.tsx`: `useSearchParams`; `sort = parseQuizSort(params.get('sort'))`; `update(patch)` — як у `Library.tsx` (типове значення прибирається, `replace: true`); показ — `sortQuizzes(quizzes, sort)`; під описом — `<p className="meta quiz-dates"><time dateTime={quiz.createdAt}>{quizDatesText(quiz)}</time></p>`; `select` «Порядок» (`label.field` у `div.quiz-folders` — блок з'являється, коли вікторин > 0; фільтр додасть задача 8).

**Команди:** `pnpm vitest run apps/web/src/pages/Quizzes.test.tsx apps/web/src/format.test.ts --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(web): created dates on quiz cards and a sort (newest, oldest, name, recently changed) kept in the URL (73)`

---

### Задача 8. Веб: категорії — фільтр, керування, вибір на картці

**Файли:** `apps/web/src/quiz-folders/folder-api.ts` (новий), `apps/web/src/quiz-folders/FolderFilter.tsx` (новий), `apps/web/src/quiz-folders/FolderManager.tsx` (новий), `apps/web/src/quiz-folders/FolderManager.test.tsx` (новий), `apps/web/src/pages/Quizzes.tsx`, `apps/web/src/pages/Quizzes.test.tsx`, `apps/web/src/styles.css` (блок «73» у кінці).

**Спершу тести (падають):**
- `Quizzes.test.tsx`, новий `describe('Quizzes: folders (73)')` (мок `folder-api`: `listFolders`, `createFolder`, `renameFolder`, `reorderFolders`, `deleteFolder`, `moveQuizToFolder`):
  - без категорій: чипів немає, `select` «Категорія» на картках немає, кнопка «Керувати категоріями» є;
  - з категоріями «Для Асі» (1 вікторина) і «Кіно» (0): чипи «Усі (3)», «Для Асі (1)», «Кіно (0)», «Без категорії (2)» у цьому порядку; «Усі» — `aria-pressed="true"`;
  - клік «Для Асі» → видно одну картку, URL `?folder=<id>`; «Без категорії» → дві, `?folder=none`; «Кіно» → «У цій категорії поки немає вікторин.»; порядок (`?sort=name`) і фільтр діють разом;
  - `/quizzes?folder=<невідомий>` → «Усі», параметр прибрано;
  - `select` «Категорія» на картці → «Кіно» → `moveQuizToFolder('q1', 'f2')`, лічильники чипів оновились без перечитування; відповідь 404 → вибір повертається, `role="alert"` з `err_not_found`;
  - помилка `listFolders` не ховає вікторин (як із викликами й бібліотекою).
- `FolderManager.test.tsx`:
  - «Нова категорія» «Кіно» → «Додати» → `createFolder('Кіно')`, поле очищено, категорія в списку; кнопка неактивна з порожнім полем; `409 folder_name_taken` → текст помилки, поле не очищено;
  - 30 категорій → поля немає, «Можна мати до 30 категорій.»;
  - перейменування: «Зберегти» неактивна, доки назва та сама; збереження → `renameFolder`;
  - «↓» біля першої → `reorderFolders([другий, перший, …])`; у першої «↑» неактивна, в останньої «↓»; `409 folders_changed` → перечитування й текст `err_folders_changed`;
  - «Видалити категорію» → confirm з текстом `quizFolderDeleteConfirm`; відмова — запиту немає; згода → `deleteFolder`, і `onChanged` викликано (сторінка перечитує вікторини — їх `folderId` стали `null`); якщо активний фільтр був на цій категорії — повертається «Усі».

**Зміни:**
- `folder-api.ts`: `listFolders()`, `createFolder(name)`, `renameFolder(id, name)`, `reorderFolders(ids)`, `deleteFolder(id)`, `moveQuizToFolder(quizId, folderId)` через `fetchData`/`request` з `../api`.
- `FolderFilter.tsx`: рядок чипів `div.quiz-folder-filter role="group" aria-label={t('quizFoldersLabel')}`; назви — `dir="auto"`; лічильники з `quizzes`.
- `FolderManager.tsx`: панель з розділу 4 специфікації; усі дії — через спільний `busy`; після кожної успішної — `onChanged(folders)`.
- `Quizzes.tsx`: стан `folders` (окремий запит у `reload`, збій не ховає вікторин); `folder = params.get('folder')` (`'none'` | id | `null`); фільтр перед `sortQuizzes`; `select` «Категорія» в картці лише коли `folders.length > 0`; кнопка «Керувати категоріями» з `aria-expanded`.
- `styles.css`, блок «73» у кінці (лише `.quiz-folders`, `.quiz-folder-*`, `.quiz-dates`):
  - `.quiz-folders` — `display: grid; gap: 0.75rem`; `.quiz-folder-filter` — `display: flex; flex-wrap: wrap; gap: 0.5rem`; чип — наявний `.btn` + `.quiz-folder-chip` (`max-inline-size: 100%; overflow-wrap: anywhere; min-height` як у `.btn`), `[aria-pressed='true']` — колір як у вибраних вкладок адмінки (взяти наявну змінну);
  - `.quiz-folder-pick select` — `inline-size: 100%`;
  - `.quiz-folder-manager` — `display: grid; gap: 0.75rem`; рядок категорії `.quiz-folder-row` — `display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: end`, поле назви `flex: 1 1 12rem`;
  - `@media (min-width: 1024px)` всередині блоку: `.quiz-folders` — `grid-template-columns: 1fr auto` (чипи ліворуч, «Порядок» праворуч), `.quiz-folder-manager` — `max-inline-size: var(--w-read)`.

**Команди:** `pnpm vitest run apps/web/src/pages/Quizzes.test.tsx apps/web/src/quiz-folders --maxWorkers=2`; `pnpm typecheck`; `pnpm lint` (якщо є в корені).

**Коміт:** `feat(web): personal quiz folders on «Мої вікторини» — filter chips with counts, a manager (add, rename, reorder, delete), a folder pick on each card (73)`

---

### Задача 9. Веб: адмінка — дати й порядок

**Файли:** `apps/web/src/admin/admin-api.ts`, `apps/web/src/admin/AdminQuizzes.tsx`, `apps/web/src/admin/AdminQuizzes.test.tsx`, `apps/web/src/admin/AdminBot.tsx`, `apps/web/src/admin/AdminBot.test.tsx`.

**Спершу тести (падають):**
- `AdminQuizzes.test.tsx`: на кожній картці «Створено …» (`quizDatesText`); `select` «Порядок» → «За назвою» → запит `/api/admin/quizzes?q=&page=1&sort=name`, URL вкладки `?sort=name`; зі сторінки 2 зміна порядку повертає на 1; відкриття з `?sort=old` — перший запит уже з `sort=old`; типовий (`changed`) у запит і URL не пишеться.
- `AdminBot.test.tsx`: картка вікторини бота має «Створено …» (замість дати без підпису); «Порядок» → «Спершу давні» змінює порядок карток «Вікторини бота»; розклад (`AdminBotSchedule`) отримує список у вихідному порядку.

**Зміни:**
- `admin-api.ts`: `adminQuizzes(q, page, sort: QuizSort)` — `sort` дописується до `list('quizzes', q, page)` лише коли не `changed`.
- `AdminQuizzes.tsx`: `useSearchParams` для `sort`; `select` у формі пошуку (`admin-search`) після кнопки «Шукати» — окремий `label.field`; рядок дат під автором.
- `AdminBot.tsx`: стан `sort` (у межах сторінки, без URL — список невеликий і без сторінок), `select` над «Вікторини бота», `sortQuizzes(state.data.quizzes, sort)` лише для показу; `formatDay(quiz.updatedAt)` → `quizDatesText(quiz)`.
- Нових CSS-правил не треба (наявні `admin-search`, `field`); якщо `select` розлазиться на 360 px — правило `.admin-quiz-sort` у блоці «73».

**Команди:** `pnpm vitest run apps/web/src/admin/AdminQuizzes.test.tsx apps/web/src/admin/AdminBot.test.tsx --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(admin): created dates and a sort on the admin quiz list and the bot quizzes (73)`

---

### Задача 10. E2E: частина 73

**Файли:** `apps/server/e2e/part73-quiz-folders.e2e.ts` (новий).

**Сценарій** (каркас — `part67-wide-layout.e2e.ts` (розміри, `expectNoSideScroll`, кадри видимої частини) і `part63-moderation-log.e2e.ts` (перезапуск сервера з `adminEmails`); вікторини — `page.request.post(\`${base}/api/quizzes\`, { data: makeQuiz(...) })`, як у `core.e2e.ts`):
1. «Олена 73» реєструється; три вікторини: «Гора», «Ґанок», «Дім»; дати створення розвести прямим `update quiz set created_at = …, updated_at = …` у БД (`db` з `helpers/setup`), щоб порядки відрізнялись.
2. `/quizzes` на **360 × 800**: на кожній картці «Створено …»; «Керувати категоріями» → «Для Асі» → «Додати», «Кіно» → «Додати»; «↑» біля «Кіно» — тепер вона перша; кадр `73-folders-manage-360`; без бічної прокрутки.
3. На картці «Ґанок» «Категорія» → «Для Асі», на «Дім» → «Кіно». Чипи: «Усі (3)», «Кіно (1)», «Для Асі (1)», «Без категорії (1)». Клік «Для Асі» → одна картка «Ґанок», URL `?folder=…`; оновлення сторінки (`page.reload()`) — фільтр той самий; кадр `73-folder-filter-360`.
4. «Порядок» → «За назвою» на «Усі» → «Гора», «Ґанок», «Дім»; «Спершу давні» → за підготовленими датами; URL `?sort=old`.
5. Редагування «Ґанок» у редакторі (змінити назву на «Ґанок і сад», зберегти) → повернутися: вікторина досі в «Для Асі»; у порядку «Нещодавно змінені» — перша.
6. «Видалити категорію» «Для Асі» (`page.once('dialog', d => d.accept())`) → «Ґанок і сад» у «Без категорії (2)»; вікторина не зникла.
7. «Взяти собі» з бібліотеки чи «Імпорт» не перевіряти тут (покрито юніт-тестами); перевірити лише «Додати приклад» → нова вікторина без категорії.
8. **1920 × 1080**: `/quizzes` — чипи й «Порядок» в одному рядку (верх чипів і `select` на одній висоті ±8 px), картки сіткою (≥ 3 у рядку); кадр `73-quizzes-1920`; без бічної прокрутки.
9. Інший користувач «Петро 73»: `GET /api/quiz-folders` → `[]`; `PUT /api/quizzes/<вікторина Олени>/folder` → 404; `PUT /api/quizzes/<своя>/folder { folderId: <категорія Олени> }` → 404.
10. Адмін «Адмін 73» (перезапуск з `adminEmails`): `/admin/quizzes` — на картках «Створено …», «Порядок» → «За назвою» — порядок за абеткою, URL `?sort=name`; кадри `73-admin-quizzes-360`, `73-admin-quizzes-1920`. `/admin/bot` (вікторина бота — копією через «Скопіювати боту») — «Створено …» на картці «Вікторини бота». Категорій ніде в адмінці немає.
11. Світла тема — основні кадри; один кадр (`73-quizzes-1920-dark`) у темній.

**Команди:** `pnpm build && pnpm vitest run --config apps/server/e2e/vitest.config.ts part73 --maxWorkers=2` (кадри — `E2E_SHOTS=1`).

**Коміт:** `test(e2e): part 73 — personal quiz folders, created dates and sorting at 360 and 1920 px, admin dates and sort (73)`

---

### Задача 11. Фінальна перевірка

- `pnpm typecheck`; `pnpm vitest run --maxWorkers=2` (усі юніт-тести); e2e `core`, `part67`, `part73`.
- Резервні копії: `pnpm vitest run apps/server/src/db-backup.test.ts apps/server/src/db-restore.test.ts --maxWorkers=2` — нова таблиця `quiz_folder` у копії й відновлюється з FK.
- `git diff 20e3d6dc -- apps/server/drizzle/0053_quiz_folder.sql | grep -i "drop\|alter column"` — порожньо (міграція лише додає).
- `git diff 20e3d6dc -- packages/shared/src | grep GAME_STATE_VERSION` — порожньо; `quizSchema` (`packages/shared/src/quiz.ts`) не змінено.
- `git grep -n "folder" -- apps/web/src/admin apps/server/src/admin-*.ts` — категорій в адмінці немає (лише дати й порядок).
- Блок «73» у `styles.css`: лише префікси `.quiz-folders`/`.quiz-folder-*`/`.quiz-dates` (і, якщо знадобився, `.admin-quiz-sort`), жодних `@media (max-width: …)`.
- Переглянути кадри 360/1920 (світла й темна теми).
- Злити в `main` і запушити (правило «push after work»; версія стану не змінюється — питати не треба).

**Коміт:** — (лише перевірка; дрібні виправлення — окремими комітами з «(73)»).

---

## Рішення власника

1. **Одна категорія на вікторину чи кілька?** План: **одна** (як папка; простіше в інтерфейсі на телефоні — один `select`, і лічильники чипів сходяться в суму). Якщо потрібні мітки (вікторина одночасно в «Для Асі» і «Кіно») — окрема таблиця зв'язків замість колонки, інший вибір на картці.
2. **Типовий порядок.** План: **«Нещодавно змінені»** — так список працює сьогодні. Варіант — «Спершу нові» за замовчуванням. Що обрати?
3. **Межі.** До 30 категорій на людину, назва до 40 символів. Досить?
4. **Видалення категорії** — вікторини стають «Без категорії» (не видаляються). Так?
5. **Копія, імпорт, «Взяти собі», приклад** — без категорії. Класти копію в ту саму категорію, що й оригінал, — не робимо. Так?
6. **Об'єднання акаунтів** — однакові назви зливаються, решта переходить; межу 30 тоді можна перевищити. Так?
7. **Адмінка.** Лише дати й порядок; категорій авторів адмін не бачить (вони особисті). Так?
8. **Порядок і фільтр** живуть в адресі сторінки (переживають оновлення й «Назад»), але не запам'ятовуються між візитами з меню. Запам'ятовувати (наприклад, в `localStorage`)?
