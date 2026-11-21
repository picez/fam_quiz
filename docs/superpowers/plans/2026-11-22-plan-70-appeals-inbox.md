# План 70. «Звернення» в адмінці, «Вхідні» на сайті й момент гри у скарзі «Щось не працює»

Черга 45, пункти 6, 7 і 10. Виконання — задача за задачею (SDD: виконавець-субагент на задачу, рев'ю після кожної, фінальне рев'ю, злиття й push).

## Коротка специфікація

### Пункт 6 — одна вкладка «Звернення»

Зараз в адмінці дві вкладки, які плутають власника: «Скарги» (`/admin/reports`, `user_report` — скарги на вікторини з бібліотеки й профілі, модерація 47) і «Збої» (`/admin/errors`: збої сервера + підвкладка «Скарги гравців» `?view=reports` — `problem_report`, «Щось не працює» 64).

- **Одна вкладка «Звернення»** (`/admin/appeals`) на місці «Скарг» (п'ята); «Скарги» й «Збої» зі смуги вкладок зникають (13 → 12 вкладок).
- Усередині — три підвкладки (смуга посилань, як `admin-errors-views` 64), у такому порядку:
  1. «Скарги на вікторини й профілі» — `/admin/appeals/complaints` (наявний `AdminReports`), картка вікторини — `/admin/appeals/complaints/quiz/:entryId` (наявний `AdminReportedQuiz`);
  2. «Щось не працює» — `/admin/appeals/problems` (наявні `PlayerReports` з `AdminErrors.tsx`);
  3. «Збої сервера» — `/admin/appeals/errors` (наявні `ServerErrors`).
- `/admin/appeals` → `/admin/appeals/complaints` (replace).
- Біля кожної підвкладки — свій лічильник нового (той самий `menu-badge`), на вкладці «Звернення» — **один спільний** лічильник: відкриті скарги черги модерації (елементи черги, як їх показує `reportQueue`: вікторина чи профіль з відкритими скаргами або відкрите оскарження) + відкриті «Щось не працює» + нові збої. `aria-label` бейджа — «Звернення, нових: {count}».
- **Старі адреси ведуть на нові** (replace, без зайвого кроку в історії): `/admin/reports` → `/admin/appeals/complaints`; `/admin/reports/quiz/:entryId` → `/admin/appeals/complaints/quiz/:entryId`; `/admin/errors` → `/admin/appeals/errors`; `/admin/errors?view=reports` → `/admin/appeals/problems`. Решта параметрів відкидається.
- Внутрішні посилання переводяться на нові адреси: «Назад» картки вікторини зі скарг (`AdminQuiz` `BACK.report`), посилання з «Копій» (`AdminBackups` → «Збої сервера»).
- Серверні маршрути `/api/admin/reports*`, `/api/admin/errors*`, `/api/admin/problems*` **не перейменовуються**; `/api/admin/problems/badge` повертає ще й `complaints`.

### Пункт 7 — «Вхідні» на сайті замість самого push

Причина «не вдалось»: у проді 0 підписок, сервер відповідає `409 broadcast_nobody`. Рішення власника — свої «Вхідні» на сайті.

- **Що потрапляє у «Вхідні»:** розсилки адміна (`push_broadcast`) і відповіді адміна на «Щось не працює» (`problem_report.reply`). Лише акаунти (гостям «Вхідних» немає).
- **Розсилка йде у «Вхідні» всім адресатам**, навіть без підписки на push; push — **додатково** тим, хто підписаний і не вимкнув «Оголошення від адміністраторів» (`profile.admin_push`). `broadcast_nobody` — лише коли немає жодного адресата-акаунта (для «Усім» — коли немає жодного акаунта, крім бота й забанених). Сервер без VAPID (`push === null`) більше **не** відмовляє `503 push_off`: розсилка йде лише у «Вхідні».
- Адресати «Вхідних»: «Усім» — усі акаунти (`user`), крім бота й забанених (`notHidden`); «Група» — учасники групи (як 56/59); «Люди» — вибрані (як 56/59). Push-адресати — підмножина: є підписка + `coalesce(admin_push, true)` (наявний `audienceOf`).
- Ліміти розсилок 59 (раз на 10 хв, 10 за добу) — без змін.
- Історія розсилок в адмінці: «у вхідних: N, прочитали: R; сповіщенням: P (доставлено D, не вдалося F)». Попередній підрахунок — «Отримають на сайті: N, з них сповіщенням: P».
- **Дзвіночок у меню** (лише з акаунтом): посилання 🔔 на `/inbox` поруч із перемикачем теми, бейдж непрочитаних (`menu-badge`), `aria-label` «Вхідні» / «Вхідні, непрочитаних: {count}».
- **Сторінка `/inbox`** (у `WithMenu`): 50 найновіших елементів від нових до старих; непрочитані позначені «Нове». Розсилка: заголовок, текст, дата, «Від адміністрації», посилання (лише сайтове, `isAnnouncementUrl`). Відповідь: «Відповідь на ваше повідомлення», цитата вашого тексту (перші 200 символів), відповідь, дата, посилання «Усі мої повідомлення» → `/report`. Гість → `/login?next=/inbox`.
- **Прочитано:** відкриття сторінки позначає прочитаними всі елементи, не новіші за найновіший показаний (`POST /api/me/inbox/read { upTo }`); на цьому показі вони ще мають позначку «Нове», бейдж у меню одразу 0.
- **Оновлення без перезавантаження:** у застосунку немає сокета рівня користувача (socket.io — лише кімнати гри: `socket.data.identity` = host/player/stage), тож — опитування: спільне сховище бейджа (як `useFeedBadge`): на кожен перехід (`location.key`), на повернення на вкладку і раз на `INBOX_POLL_MS` = 60 с, не частіше за раз на 5 с. Додатково: service worker після показу push-сповіщення `broadcast` / `problem_reply` шле відкритим вікнам `postMessage({ type: 'quiz:inbox' })` — бейдж перечитується одразу (для підписаних).
- Клік по push-сповіщенню відповіді веде на `/inbox` (було `/report`); розсилки — як і було (посилання розсилки або `/`).
- **Запрошення ввімкнути сповіщення після гри:** на екрані завершеної гри (пульт гравця й екран ведучого, фаза `finished`) — тиха панель «Не пропускайте новини» з кнопками «Увімкнути» і «Не зараз». Показується лише якщо: збірка prod і браузер уміє push (`pushSupport === 'supported'`), сервер має ключ (`getPushKey`), людина з акаунтом, дозвіл не `denied`, на пристрої немає підписки, і з останнього показу минуло ≥ `PUSH_INVITE_GAP_DAYS` = 14 днів (`localStorage['quiz:push-invite-at']`; записується в мить **показу**, тож у наступних іграх два тижні тиші, навіть якщо людина не натиснула нічого). «Увімкнути» — наявний `enablePush`; результат — один рядок стану (увімкнено / браузер не вміє / заборонено — як у `PushSettings`). «Не зараз» ховає панель.

### Пункт 10 — відповіді у «Вхідні» і момент гри у скарзі

- «Відповісти» адміна на «Щось не працює» → у тій самій транзакції рядок у «Вхідних» автора; push — додатково, як і було. Сповіщення адміну: «Відповідь у вхідних гравця й надіслана сповіщенням» / «Відповідь у вхідних гравця (сповіщень у нього немає)». Підказка на картці замість «відповідь буде на сторінці «Мої повідомлення»» — «Відповідь прийде гравцю у «Вхідні» на сайті».
- Сторінка `/report` і «Мої повідомлення» лишаються.
- Відповіді, дані **до** плану 70 (рядки з `reply`), міграція переносить у «Вхідні» **непрочитаними** — їх ніхто не бачив.
- **Момент гри:** посилання «Повідомити про проблему» на пульті гравця (`PlayerScreen`) і екрані ведучого (`HostScreen`) у мить кліку зберігає в `localStorage['quiz:problem-moment']`: код кімнати, роль (`player`/`host`), фазу, раунд (0-базовий номер і назву), номер запитання в раунді (`view.questionIndex`, як бачить людина), тип і текст запитання (`view.question.text` — те, що людина бачила; відповідей там немає), час. Нова вкладка `/report?from=/play/123456` читає момент, якщо код збігається з кодом у `from` і моменту ≤ 30 хв; показує його рядком у списку «Відомості про сторінку» («Гра 123456: раунд 2, запитання 3») і надсилає разом зі скаргою, коли прапорець «Додати відомості» стоїть. Після успішного надсилання момент стирається.
- Сервер доповнює момент тим, що знає кімната в пам'яті (`manager.get(code)`): `quizId` (`room.quizId`) і назва вікторини (`room.state.quiz.title`); кімнати немає — `null`. Зберігається в новій колонці `problem_report.game` (jsonb).
- Картка «Щось не працює» в адмінці: блок «Гра»: код, роль, вікторина (посилання «Відкрити вікторину» → `/admin/quizzes/:quizId`, якщо `quizId` є), раунд і назва, запитання N і тип (`t('type_<type>')`), фаза, текст запитання (як текст, `dir="auto"`, без HTML).

## Глобальні обмеження

- **`GAME_STATE_VERSION` не змінюється**; рушій, зрізи (`views.ts`), формати збережених кімнат — без змін.
- **Міграція одна — `0050_inbox`** (наступна після `0049_merged_email`; плани 67/68/69 міграцій не мають — перед генерацією перевірити `drizzle/meta/_journal.json` у `main`, якщо номер зайнятий — узяти наступний вільний). Генерувати `pnpm --filter @quiz/server exec drizzle-kit generate --name inbox`; у шапку SQL — коментар українською, як у `0047`/`0049`. Вміст: `CREATE TABLE inbox_item`, індекси, зовнішні ключі, `ALTER TABLE problem_report ADD COLUMN game jsonb`, `ALTER TABLE push_broadcast ADD COLUMN push_people integer DEFAULT 0 NOT NULL`, і дописані вручну (після згенерованого, через `--> statement-breakpoint`) два оператори даних: `UPDATE push_broadcast SET push_people = people_count` та перенесення наявних відповідей у «Вхідні» (`INSERT INTO inbox_item … SELECT … FROM problem_report WHERE reply IS NOT NULL AND user_id IS NOT NULL`). Жодного `DROP`. Тести, що рахують міграції з журналу (`db-restore.test.ts` через `appMigrations()`), мають пройти без змін.
- **Видалення й об'єднання акаунтів:** нова таблиця з ключем на `user` — у `HANDLED` і великому тесті `account-delete.test.ts` (каскад), і правило в `MERGE_RULES` (`account-merge-people.ts`), інакше червоні схема-тести 58 і 66.
- **Адмінка:** нових `/api/admin/*` немає; змінені — за тими самими воротами `read`/`write`, не-адміну й гостю — **404**.
- **`/api/me/inbox*`** — лише акаунт; гість — `401 { error: 'unauthorized' }`.
- Тексти інтерфейсу — **7 мов**: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,pl,de,es,it,ar}.json`; нові uk-ключі — у списку **`ADDED_70`** у `apps/web/src/i18n.test.ts` (додати в умову `adds no uk keys beyond the agreed list` і в перевірку наявності в шести мовах зі збігом змінних, як `ADDED_MERGE_66`). Множин немає (тексти «…: {count}»). Наявних значень uk **не змінювати** (на них є точні тести) — лише нові ключі; невикористані старі ключі не видаляти.
- Тексти push у service worker (`apps/web/src/push/strings/*`) — **без нових ключів** (змінюється лише адреса кліку).
- Кириличні літерали в `apps/web/src/` — лише в словниках і тестах (`source-scan.test.ts`).
- **CSS:** лише нові класи нових компонентів (`.menu-inbox`, `.inbox-*`, `.admin-appeals-*`, `.admin-problem-game`, `.push-invite`), окремим блоком наприкінці `apps/web/src/styles.css` з коментарем `/* 70 */`. Наявних правил не чіпати: паралельно йдуть план 67 (широкий макет: токени ширини, брейкпоінти) і план 69 (користувачі адмінки). Ширин сторінок не фіксувати. При злитті `Admin.tsx`/`styles.css` — уважно з 67/69.
- Нічого, пов'язаного з росією, — у фікстурах, ніках, текстах розсилок, e2e.
- Коментарі в коді — українською.
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm exec tsc -p <пакет>`, з задачі 6 — `pnpm typecheck`. **Ніколи не запускати prettier.**
- Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно.
- Файли правити лише Edit/Write чи `sed`/node; **python3 на цій машині — порожня заглушка**; після коміту — `git show --stat`.
- Робоче дерево — `C:\ClaudeCode\quiz\.superpowers\worktrees\plan70`; тимчасові файли — у `.superpowers` чи scratchpad. Інших дерев не торкатися; dev-сервери після роботи зупинити.
- e2e: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 70"`; телефон 360 px, світла тема (`quiz:theme = light`, `is-light` на `<html>`).

## Рішення плану (там, де специфікація мовчить)

1. **Таблиця `inbox_item` — тонка**: лише посилання на розсилку чи скаргу, без копії тексту (текст читається з'єднанням з `push_broadcast` / `problem_report`). Розсилка «розкладається» по рядку на людину в мить створення (у транзакції `createBroadcast`): ті, хто зареєструється пізніше, старих розсилок не бачать; вийшов з групи — розсилка лишається.
2. «Вхідні» **не** зважають на «Оголошення від адміністраторів» (`admin_push`): цей перемикач — лише про push. (Див. питання власнику 1.)
3. Видалення елементів людиною немає; показ — 50 найновіших (`INBOX_MAX`); старі не чистяться.
4. Момент гри береться з клієнта (те, що людина бачила): у дошкових раундах `view.questionIndex` не збігається з індексом у `quiz.rounds[r].questions`, тож сервер текст запитання з вікторини не відновлює — лише додає `quizId` і назву з кімнати.
5. Дзвіночок — посилання всередині `nav.menu` з класом `menu-inbox`; помічник e2e `menuLinks` і тести `Menu.test.tsx` рахують пункти меню **без** `.menu-inbox` (інакше зламалися б усі перевірки складу меню).
6. Спільний бейдж «Звернень» рахує **елементи черги модерації**, а не окремі рядки `user_report` (так само, як їх показує список).

---

### Задача 1. Спільні типи й схеми: «Вхідні», момент гри, розсилка, бейдж

**Files:**
- Create: `packages/shared/src/inbox.ts`, `packages/shared/src/inbox.test.ts`
- Modify: `packages/shared/src/index.ts` (експорт), `packages/shared/src/problems.ts`, `packages/shared/src/problems.test.ts`, `packages/shared/src/broadcast.ts`, `packages/shared/src/broadcast.test.ts`

**Interfaces (Produces):**
- `inbox.ts`: `INBOX_MAX = 50`, `INBOX_POLL_MS = 60_000`, `INBOX_QUOTE_MAX = 200`, `PUSH_INVITE_GAP_DAYS = 14`;
  `type InboxItem = { id: string; at: string; read: boolean } & ({ kind: 'broadcast'; title: string; text: string; url: string | null } | { kind: 'problem_reply'; reply: string; problem: { id: string; at: string; text: string } })` (`problem.text` — до `INBOX_QUOTE_MAX` символів);
  `interface InboxPage { items: InboxItem[]; unread: number }`, `interface InboxBadge { unread: number }`;
  `inboxReadSchema = z.object({ upTo: z.string().datetime() }).strict()`.
- `problems.ts`: `PROBLEM_GAME_TEXT_MAX = 500`, `PROBLEM_GAME_TITLE_MAX = 120`, `PROBLEM_MOMENT_MAX_AGE_MS = 30 * 60_000`;
  `problemGameSchema = z.object({ code: z.string().regex(/^\d{6}$/), role: z.enum(['player','host']), phase: z.string().regex(/^[a-z_]{1,24}$/).nullable(), round: z.number().int().min(0).max(999).nullable(), roundTitle: <рядок ≤1000 → обрізати до PROBLEM_GAME_TITLE_MAX, isStorable>.nullable(), question: z.number().int().min(-1).max(9999).nullable(), type: z.enum(QUESTION_TYPES).nullable(), text: <рядок ≤4000 → обрізати до PROBLEM_GAME_TEXT_MAX, isStorable>.nullable() }).strict()`; `type ProblemGameInput`;
  `type ProblemGame = ProblemGameInput & { quizId: string | null; quizTitle: string | null }`;
  `problemReportInputSchema` + `game: problemGameSchema.nullable().default(null)`;
  `AdminProblemReport` + `game: ProblemGame | null`;
  `AdminProblemsBadge = { errors: number; reports: number; complaints: number }`.
- `broadcast.ts`: `BroadcastPreview = { people: number; push: number }`; `AdminBroadcast` + `pushPeople: number` (скільки людей зі сповіщенням), `read: number` (скільки прочитали у «Вхідних»); коментар до `people` — «скільки людей отримали у «Вхідні»».

- [ ] **Step 1: Write the failing tests**
  - `inbox.test.ts`: `inboxReadSchema` приймає ISO-час, відкидає не-дату й зайві поля; константи (`INBOX_MAX === 50`, `PUSH_INVITE_GAP_DAYS === 14`).
  - `problems.test.ts`: `problemReportInputSchema.parse({ text: 'x' }).game` → `null`; повний момент проходить; `roundTitle`/`text` понад межу обрізаються до 120/500; код `'12345'` чи `'abcdef'` → помилка; невідомий `type` → помилка; зайве поле в `game` → помилка; `\u0000` у тексті → помилка (`isStorable`).
  - `broadcast.test.ts`: тип-перевірки не потрібні; лише якщо є тест на форму `BroadcastPreview` — оновити.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/inbox.test.ts packages/shared/src/problems.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за інтерфейсами вище; `QUESTION_TYPES` — з `./question-types`.
- [ ] **Step 4: Run** те саме + `pnpm exec tsc -p packages/shared`. Expected: PASS (server/web поки можуть не збиратися через нові обов'язкові поля — їх виправляють задачі 3–5; не латати там нічого в цій задачі, окрім мінімальних заглушок типу, якщо `tsc -p packages/shared` їх вимагає).
- [ ] **Step 5: Commit**
```bash
git add packages/shared/src
git commit -m "feat(shared): 70 inbox items and read schema, the game moment of a problem report, broadcast preview with the push share, complaints in the admin badge"
```

### Задача 2. Таблиця `inbox_item`, колонки `problem_report.game` і `push_broadcast.push_people`, видалення й об'єднання

**Files:**
- Modify: `apps/server/src/db/schema.ts`, `apps/server/drizzle/0050_inbox.sql` + `apps/server/drizzle/meta/_journal.json` + `meta/0050_snapshot.json` (генерує drizzle-kit), `apps/server/src/account-delete.test.ts`, `apps/server/src/account-merge-people.ts`, `apps/server/src/account-merge-people.test.ts`
- Create: `apps/server/src/db/inbox-migration.test.ts`

**Interfaces (Produces):**
- `inboxItem = pgTable('inbox_item', { id uuid pk defaultRandom, userId text not null → user.id on delete cascade, kind text $type<'broadcast'|'problem_reply'> not null, broadcastId uuid → push_broadcast.id on delete cascade (null), problemId uuid → problem_report.id on delete cascade (null), createdAt at not null, readAt at (null) })`, індекси: `uniqueIndex('inbox_item_broadcast_once').on(userId, broadcastId).where(sql\`broadcast_id is not null\`)`, `uniqueIndex('inbox_item_problem_once').on(problemId).where(sql\`problem_id is not null\`)`, `index('inbox_item_user_created_idx').on(userId, createdAt)`, `index('inbox_item_unread_idx').on(userId).where(sql\`read_at is null\`)`. Коментар над таблицею — українською (що це, чому без копії тексту).
- `problemReport.game: jsonb('game').$type<ProblemGame | null>()`; `pushBroadcast.pushPeople: integer('push_people').notNull().default(0)`.

- [ ] **Step 1: Write the failing tests**
  - `inbox-migration.test.ts` (як `schema.test.ts` «the profiles migration applies over an existing database»: база до `0049_merged_email` через помічник `test-db.ts`, що зупиняється на тегу): вставити користувача, його `problem_report` з відповіддю (`reply`, `replied_at`), ще один `problem_report` гостя (`user_id = null`, без відповіді) і `push_broadcast` з `people_count = 3`; застосувати решту міграцій → є рівно один `inbox_item` `kind = 'problem_reply'`, `problem_id` = той рядок, `read_at is null`, `created_at = replied_at`; `push_broadcast.push_people = 3`.
  - `account-delete.test.ts`: `HANDLED` + `'inbox_item.user_id'`; у великому тесті вставити Тарасу один елемент розсилки й один відповіді → після видалення 0 рядків `inbox_item` з його `user_id`.
  - `account-merge-people.test.ts` (поруч із наявним блоком, де S має `push_subscription`/`problem_report`): одна розсилка `B1` є у «Вхідних» і P, і S (у S прочитана), друга `B2` — лише в S, відповідь `R` — лише в S → після правил: у P рівно `B1` (рядок P лишився), `B2`, `R`; у S — 0. `MergeSummary` не змінюється.
  - Схема-тест 66 (`every foreign key to user has a merge rule`) має впасти без правила — це перевірка, що ключ потрапив у `MERGE_RULES`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/db/inbox-migration.test.ts apps/server/src/account-delete.test.ts apps/server/src/account-merge-people.test.ts apps/server/src/account-merge-history.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**
  - Схема й міграція (див. «Глобальні обмеження»). Ручні оператори в кінці `0050_inbox.sql`:
    ```sql
    --> statement-breakpoint
    UPDATE "push_broadcast" SET "push_people" = "people_count";--> statement-breakpoint
    INSERT INTO "inbox_item" ("user_id", "kind", "problem_id", "created_at") SELECT "user_id", 'problem_reply', "id", "replied_at" FROM "problem_report" WHERE "reply" IS NOT NULL AND "user_id" IS NOT NULL AND "replied_at" IS NOT NULL;
    ```
    Перевірити, що згенерований SQL містить лише `CREATE TABLE`, `CREATE (UNIQUE) INDEX`, `ALTER TABLE … ADD COLUMN`, `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY`.
  - `account-merge-people.ts`: нове правило `inboxRule` (`keys: ['inbox_item.user_id']`), у `PEOPLE_RULES` після `plainRule`: спершу `delete from inbox_item where user_id = S and broadcast_id in (select broadcast_id from inbox_item where user_id = P and broadcast_id is not null)`, далі `update … set user_id = P where user_id = S`. Підсумок об'єднання (`MergeSummary`) не розширювати.
- [ ] **Step 4: Run** те саме + `pnpm test --project server --maxWorkers=2 apps/server/src/db-restore.test.ts apps/server/src/db/schema.test.ts apps/server/src/account-merge.test.ts` + `pnpm exec tsc -p apps/server`. Expected: PASS (tsc може скаржитися на `AdminProblemsBadge`/`BroadcastPreview` з задачі 1 — тоді лише мінімально заповнити нові поля нулями там, де тип вимагає; справжня логіка — задачі 3–5).
- [ ] **Step 5: Commit**
```bash
git add apps/server/src apps/server/drizzle
git commit -m "feat(server): 70 inbox_item table, the game moment column on problem_report and push_people on push_broadcast; earlier replies move to the inbox unread; deletion cascades and merge moves inbox rows without duplicates"
```

### Задача 3. «Вхідні» на сервері: сховище й маршрути `/api/me/inbox*`

**Files:**
- Create: `apps/server/src/inbox-store.ts`, `apps/server/src/inbox-store.test.ts`, `apps/server/src/inbox-routes.ts`, `apps/server/src/inbox-routes.test.ts`
- Modify: `apps/server/src/app.ts` (реєстрація поруч із `registerProblemRoutes`)

**Interfaces (Produces):**
- `inboxPage(db, userId): Promise<InboxPage>` — `INBOX_MAX` найновіших (`created_at desc, id desc`), з'єднання з `push_broadcast` (title, text, url) і `problem_report` (reply, text → `truncateChars(…, INBOX_QUOTE_MAX)`, created_at); `unread` — `count(*)` усіх непрочитаних користувача (не лише показаних).
- `inboxUnread(db, userId): Promise<number>`.
- `markInboxRead(db, { userId, upTo: Date, now: Date }): Promise<number>` — `read_at = now` для своїх непрочитаних із `created_at <= upTo`; повертає нове `unread`.
- `addProblemReply(tx, { userId, problemId, now })` — вставка `kind = 'problem_reply'`, `on conflict do nothing` (унікальний `problem_id`).
- `addBroadcast(tx, { broadcastId, userIds, now })` — вставка пачками по 500, `on conflict do nothing`.
- Маршрути: `GET /api/me/inbox` → `InboxPage`; `GET /api/me/inbox/badge` → `InboxBadge`; `POST /api/me/inbox/read` (`inboxReadSchema`, інакше 400 `invalid_payload`) → `InboxBadge`. Гість — 401 `unauthorized`. `bodyLimit` 1 КБ на `read`.

- [ ] **Step 1: Write the failing tests**
  - `inbox-store.test.ts`: порядок від нових; межа 50 при 55 рядках, `unread` = 55; цитата скарги обрізана до 200; розсилка з видаленим автором-адміном показується; `markInboxRead` з `upTo` = час 3-го з 5 позначає лише 3 старіші, повертає 2; чужі рядки не зачіпає; повторна `addProblemReply` — один рядок.
  - `inbox-routes.test.ts` (`buildApp`, `signUp`): гість → 401 на всі три; акаунт без елементів → `{ items: [], unread: 0 }`; після вставки двох — бейдж 2, `read` з `upTo` найновішого → `{ unread: 0 }`, повторний `GET` — `read: true` в обох; `upTo: 'вчора'` → 400; чужий елемент не видно.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/inbox-store.test.ts apps/server/src/inbox-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за інтерфейсами; стиль — як `problem-routes.ts` (deps `{ db, currentUser, now? }`).
- [ ] **Step 4: Run** те саме + `pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 70 inbox store and /api/me/inbox routes — newest 50 with unread count, mark read up to the newest shown, accounts only"
```

### Задача 4. Розсилка у «Вхідні» без обов'язкового push; відповідь на скаргу у «Вхідні»

**Files:**
- Modify: `apps/server/src/broadcast-store.ts`, `apps/server/src/broadcast-store.test.ts`, `apps/server/src/admin-broadcast-routes.ts`, `apps/server/src/admin-broadcast-routes.test.ts`, `apps/server/src/problem-store.ts`, `apps/server/src/problem-store.test.ts`, `apps/server/src/admin-problem-routes.ts`, `apps/server/src/admin-problem-routes.test.ts`

**Interfaces:**
- Consumes: `addBroadcast`, `addProblemReply` (задача 3).
- Produces: `inboxAudienceOf(db, to: BroadcastRecipients): Promise<string[]>` — «Усім»: усі `user.id` з `notHidden(user.id)`; «Група»/«Люди»: `recipientsFor` (56) як є; без повторів, у порядку id. Наявний `audienceOf` (push) лишається, але для «Усім» він і далі бере лише підписаних — так і треба.
  `createBroadcast(db, { adminId, input, people, pushPeople, now })` — `people_count = people.length`, `push_people = pushPeople.length`, у тій самій транзакції `addBroadcast(tx, { broadcastId, userIds: people })`; журнал `push_broadcast` — `details.count = people.length`.
  `view()` — `pushPeople` з колонки, `read` — одним запитом `count(*) filter (where read_at is not null)` по `broadcast_id in (…)`.
  `resolveProblem` з відповіддю — у транзакції ще й `addProblemReply(tx, …)`.
- Маршрути: `POST /api/admin/broadcasts/preview` → `{ people: inbox.length, push: push === null ? 0 : (await audienceOf(…)).length }` (працює й без push). `POST /api/admin/broadcasts`: прибрати `503 push_off`; `people = inboxAudienceOf`, порожньо → `409 broadcast_nobody`; `pushPeople = push === null ? [] : audienceOf`, лише з тих, хто в `people`; `pushPeople` порожній чи `push === null` → одразу `finishBroadcast(db, id, { delivered: 0, failed: 0 }, now())`, інакше push у фоні як зараз. `POST /api/admin/problems/:id/reply` → `{ pushed, inbox: true }`.

- [ ] **Step 1: Write the failing tests**
  - `broadcast-store.test.ts`: «Усім» без жодної підписки → `inboxAudienceOf` дає всіх акаунтів, крім бота й забаненого, `audienceOf` — `[]`; `createBroadcast` пише по рядку `inbox_item` на людину й `push_people`; ліміти 10 хв / доба — як були (наявні тести не міняти, лише дописати `pushPeople`).
  - `admin-broadcast-routes.test.ts`: застосунок **без** `push` → `POST` дає 201, рядок `status: 'sent'`, `delivered: 0`, у «Вхідних» адресата — розсилка; preview → `{ people: 2, push: 0 }`; немає жодного адресата («Люди» лише з забаненим) → 409 `broadcast_nobody`; з заглушкою push і одним підписаним із двох — push пішов одному, «Вхідні» обом, рядок історії `people: 2, pushPeople: 1, read: 0`; після `POST /api/me/inbox/read` одного — `read: 1`. Наявний тест на `503 push_off` — переписати під нову поведінку (не видаляти мовчки — замінити перевіркою «без push розсилка йде у «Вхідні»»).
  - `problem-store.test.ts` / `admin-problem-routes.test.ts`: відповідь → один `inbox_item` `problem_reply` автора, відповідь маршруту `{ pushed: false, inbox: true }` без підписки; повторна відповідь — 409 `problem_replied`, другого рядка немає; «Вирішено» без відповіді рядка «Вхідних» не створює; збій журналу (наявний тест з тригером, якщо є) — немає ні відповіді, ні рядка «Вхідних».
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/broadcast-store.test.ts apps/server/src/admin-broadcast-routes.test.ts apps/server/src/problem-store.test.ts apps/server/src/admin-problem-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за інтерфейсами.
- [ ] **Step 4: Run** те саме + `pnpm test --project server --maxWorkers=2 apps/server/src/push.test.ts apps/server/src/bot-schedule.test.ts apps/server/src/account-merge-history.test.ts` + `pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 70 a broadcast lands in every recipient's inbox and goes by push only additionally — no more broadcast_nobody or push_off when people exist; a reply to a problem report lands in the author's inbox in the same transaction"
```

### Задача 5. Момент гри у скарзі й спільний бейдж «Звернень» на сервері

**Files:**
- Modify: `apps/server/src/problem-routes.ts`, `apps/server/src/problem-routes.test.ts`, `apps/server/src/problem-store.ts`, `apps/server/src/problem-store.test.ts`, `apps/server/src/app.ts` (передати `manager` у `registerProblemRoutes`), `apps/server/src/error-store.ts` (`problemsBadge`), `apps/server/src/report-store.ts`, `apps/server/src/report-store.test.ts`, `apps/server/src/admin-problem-routes.test.ts`

**Interfaces:**
- `ProblemRouteDeps` + `manager: Pick<RoomManager, 'get'>`; маршрут: `game` з тіла → `{ ...game, quizId: room?.quizId ?? null, quizTitle: room?.state.quiz.title ?? null }`, де `room = manager.get(game.code)`; `createProblemReport` приймає `game: ProblemGame | null` і пише в колонку; `listProblemReports` віддає `game`.
- `report-store.ts`: `openComplaints(db): Promise<number>` — кількість елементів черги (та сама логіка відбору, що й `reportQueue`: різні `entry_id` з відкритими скаргами на вікторину ∪ вікторини з `appeal_open`, + різні `target_user_id` з відкритими скаргами на профіль; без сторінок і без ніків). Краще винести спільний відбір у функцію, яку кличуть обидві.
- `problemsBadge(db)` → `{ errors, reports, complaints: await openComplaints(db) }`.

- [ ] **Step 1: Write the failing tests**
  - `problem-routes.test.ts`: кімната в `ctx.manager` (створити, як у `admin-live.test.ts`/`prize-routes.test.ts`) → скарга з `game: { code, role: 'player', phase: 'question', round: 0, roundTitle: 'Розминка', question: 2, type: 'single', text: 'Столиця Польщі?' }` → у базі `game` з `quizId` кімнати й назвою вікторини; код неіснуючої кімнати → `quizId: null, quizTitle: null`, решта як надіслано; без `game` → `null`; гість теж може.
  - `admin-problem-routes.test.ts`: `GET /api/admin/problems` → рядок з `game`; `GET /api/admin/problems/badge` → `{ errors, reports, complaints }`, де `complaints` росте на 1 від двох скарг на одну вікторину й ще на 1 від скарги на профіль, і на 1 від відкритого оскарження іншої вікторини.
  - `report-store.test.ts`: `openComplaints` дорівнює `reportQueue(db, 1).total` на тому самому наборі.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/problem-routes.test.ts apps/server/src/problem-store.test.ts apps/server/src/report-store.test.ts apps/server/src/admin-problem-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за інтерфейсами.
- [ ] **Step 4: Run** те саме + `pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 70 a problem report keeps the game moment (code, round, question, type, text) with the quiz id and title from the live room; the admin badge counts open moderation items too"
```

### Задача 6. Тексти: 7 мов і `ADDED_70`

**Files:**
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,pl,de,es,it,ar}.json`, `apps/web/src/i18n.test.ts`

Нові ключі (uk; решта мов — природний переклад зі збігом змінних):

| Ключ | uk |
|---|---|
| `adminTabAppeals` | Звернення |
| `adminTabAppealsBadge` | Звернення, нових: {count} |
| `adminAppealsViews` | Розділи звернень |
| `adminAppealsComplaints` | Скарги на вікторини й профілі |
| `adminAppealsProblems` | Щось не працює |
| `adminAppealsErrors` | Збої сервера |
| `adminAppealsNew` | {label}, нових: {count} |
| `adminProblemGame` | Гра {code} |
| `adminProblemGameRole_player` | Скаржився гравець |
| `adminProblemGameRole_host` | Скаржився ведучий |
| `adminProblemGameQuiz` | Вікторина: {title} |
| `adminProblemGameNoQuiz` | Кімнати вже немає — назва вікторини невідома |
| `adminProblemGameOpenQuiz` | Відкрити вікторину |
| `adminProblemGameRound` | Раунд {number}: {title} |
| `adminProblemGameQuestion` | Запитання {number} — {type} |
| `adminProblemGamePhase` | Етап: {phase} |
| `adminProblemGameText` | Текст запитання: {text} |
| `adminProblemReplyInboxHint` | Відповідь прийде гравцю у «Вхідні» на сайті. |
| `adminProblemReplyInboxPushed` | Відповідь у вхідних гравця й надіслана сповіщенням. |
| `adminProblemReplyInboxOnly` | Відповідь у вхідних гравця (сповіщень у нього немає). |
| `adminBroadcastInboxAudience` | Отримають на сайті: {people}, з них сповіщенням: {push} |
| `adminBroadcastInboxNobody` | Нікому надсилати: серед адресатів немає жодного акаунта. |
| `adminBroadcastInboxNoPush` | Сповіщення на сервері не налаштовано — розсилка прийде лише у «Вхідні» на сайті. |
| `adminBroadcastInboxStats` | У вхідних: {people}, прочитали: {read}; сповіщенням: {push} |
| `menuInbox` | Вхідні |
| `menuInboxBadge` | Вхідні, непрочитаних: {count} |
| `inboxTitle` | Вхідні |
| `inboxEmpty` | Тут з'являться повідомлення від адміністрації й відповіді на ваші звернення. |
| `inboxNew` | Нове |
| `inboxFromAdmin` | Від адміністрації |
| `inboxReplyTitle` | Відповідь на ваше повідомлення |
| `inboxYouWrote` | Ви писали: {text} |
| `inboxOpenLink` | Відкрити |
| `inboxAllProblems` | Усі мої повідомлення |
| `problemPageGame` | Гра {code}: раунд {round}, запитання {question} |
| `problemPageGameLobby` | Гра {code}: ще в лобі |
| `pushInviteTitle` | Не пропускайте новини |
| `pushInviteText` | Увімкніть сповіщення — і дізнаєтеся про нову гру чи відповідь адміністрації, навіть коли сайт закрито. |
| `pushInviteOn` | Увімкнути |
| `pushInviteLater` | Не зараз |
| `pushInviteDone` | Сповіщення увімкнено. |

(Тексти помилок і станів увімкнення push — наявні ключі `PushSettings`, нових не треба. Назви етапів гри для `adminProblemGamePhase` — наявні, якщо є ключі фаз; інакше показати сирий `phase` як код у `<code>`.)

- [ ] **Step 1: Write the failing tests** — у `i18n.test.ts` список `ADDED_70` з ключами таблиці; додати його в загальну умову «adds no uk keys beyond the agreed list» і в цикл «є в шести мовах, змінні збігаються» (як `ADDED_MERGE_66`); точні перевірки: `uk.adminTabAppealsBadge === 'Звернення, нових: {count}'`, `uk.menuInboxBadge === 'Вхідні, непрочитаних: {count}'`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/i18n.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** ключі в uk (поруч із блоком 64) і шести JSON.
- [ ] **Step 4: Run** те саме + `pnpm test --project web --maxWorkers=2 apps/web/src/source-scan.test.ts` + `pnpm typecheck`. Expected: PASS (typecheck — якщо червоний лише через web-споживачів нових типів, виправити мінімально; інакше PASS).
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/i18n.ts apps/web/src/locales apps/web/src/i18n.test.ts
git commit -m "feat(web): 70 texts in seven languages — the appeals tab, the inbox, the game moment in a problem report and the post-game push invite"
```

### Задача 7. Адмінка: вкладка «Звернення», три підвкладки, редиректи, спільний бейдж, момент гри в картці, розсилка без push

**Files:**
- Create: `apps/web/src/admin/AdminAppeals.tsx`, `apps/web/src/admin/AdminAppeals.test.tsx`
- Modify: `apps/web/src/admin/Admin.tsx`, `apps/web/src/admin/Admin.test.tsx`, `apps/web/src/admin/AdminErrors.tsx` (експорт `ServerErrors`, `PlayerReports`; блок «Гра» в `ReportCard`; нові тексти відповіді), `apps/web/src/admin/AdminErrors.test.tsx`, `apps/web/src/admin/AdminQuiz.tsx` (`BACK.report`), `apps/web/src/admin/AdminQuiz.test.tsx`, `apps/web/src/admin/AdminBackups.tsx` (+ test), `apps/web/src/admin/AdminBroadcast.tsx`, `apps/web/src/admin/AdminBroadcast.test.tsx`, `apps/web/src/admin/admin-api.ts` (типи відповіді reply/preview), `apps/web/src/admin/announce-styles.test.ts` (лише якщо клас підвкладок змінюється), `apps/web/src/styles.css` (блок `/* 70 */`)

**Деталі:**
- `TABS`: замість `reports` — `{ to: '/admin/appeals', key: 'adminTabAppeals', end: false }`; `errors` прибрати. Бейдж — на `adminTabAppeals`: `errors + reports + complaints`, `aria-label` — `adminTabAppealsBadge`. `refreshAdminBadge` лишається (кличуть ті самі дії «Вирішено»/«Відповісти» і дії модерації в `AdminReports`/`AdminReportedQuiz` — додати виклик після успішної дії, якщо його там немає).
- Маршрути `Admin`: `appeals/*` → `AdminAppeals`; `reports` → `<Navigate to="/admin/appeals/complaints" replace />`; `reports/quiz/:entryId` → компонент-редирект з параметром; `errors` → компонент-редирект: `?view=reports` → `/admin/appeals/problems`, інакше `/admin/appeals/errors`.
- `AdminAppeals`: `nav.admin-appeals-views` (`aria-label` = `adminAppealsViews`) з трьома `NavLink className="btn"` (`aria-current` від NavLink), лічильник у кожній (з того самого `adminProblemsBadge`, перечитується на `location.key` і `ADMIN_BADGE_EVENT`; `aria-label` посилання з лічильником — `adminAppealsNew`); вкладені `Routes`: `''` → `Navigate complaints replace`, `complaints` → `AdminReports`, `complaints/quiz/:entryId` → `AdminReportedQuiz`, `problems` → `PlayerReports`, `errors` → `ServerErrors`, `*` → `Navigate complaints`.
- Посилання всередині `AdminReports` на картку вікторини → `/admin/appeals/complaints/quiz/:entryId`.
- `ReportCard`: якщо `row.game` — `<section className="admin-problem-game">` з рядками з таблиці ключів (раунд — `round + 1`, запитання — `question + 1`, тип — `t(\`type_${type}\`)`), текст — звичайний текст `dir="auto"`; «Відкрити вікторину» → `/admin/quizzes/${quizId}` лише з `quizId`. Підказка без push — `adminProblemReplyInboxHint` (для всіх акаунтів, не лише без підписки); сповіщення після відповіді — `adminProblemReplyInboxPushed` / `adminProblemReplyInboxOnly`.
- `AdminBroadcast`: форма доступна й без `pushOn` (тоді над нею — `adminBroadcastInboxNoPush`), попередній підрахунок — `adminBroadcastInboxAudience` (з `{ people, push }`), нуль — `adminBroadcastInboxNobody`; рядок історії — додати `adminBroadcastInboxStats`.
- CSS: `.admin-appeals-views` — як `.admin-errors-views` (flex-wrap, кнопки `flex: 1 1 auto`, `min-height: 2.75rem`, `padding: 0.5rem 1rem`), щоб на 360 px три підписи переносилися без бічного скролу; `.admin-problem-game` — компактні рядки `meta`.

- [ ] **Step 1: Write the failing tests**
  - `Admin.test.tsx`: склад смуги — `['Статистика','Живі ігри','Користувачі','Вікторини','Звернення','Оголошення','Розсилка','Стрічка','Групи','Журнал','Копії','Бот']`; «Звернення» → `/admin/appeals`; бейдж = сума трьох (`{ errors: 1, reports: 2, complaints: 3 }` → «6», `aria-label` «Звернення, нових: 6»); `/admin/reports` → шлях `/admin/appeals/complaints`; `/admin/reports/quiz/e1` → `/admin/appeals/complaints/quiz/e1`; `/admin/errors` → `/admin/appeals/errors`; `/admin/errors?view=reports` → `/admin/appeals/problems`.
  - `AdminAppeals.test.tsx`: `/admin/appeals` → `complaints`; три посилання в порядку зі специфікації, активне має `aria-current="page"`; лічильники біля підвкладок.
  - `AdminErrors.test.tsx`: картка з `game` показує код, «Вікторина: …», «Раунд 2: …», «Запитання 3 — Один правильний варіант», текст запитання й посилання на `/admin/quizzes/q1`; без `quizId` — `adminProblemGameNoQuiz`; відповідь з `{ pushed: false, inbox: true }` → «Відповідь у вхідних гравця (сповіщень у нього немає).».
  - `AdminBroadcast.test.tsx`: `pushOn: false` — форма є, рядок `adminBroadcastInboxNoPush`, надсилання працює; preview `{ people: 5, push: 2 }` → «Отримають на сайті: 5, з них сповіщенням: 2».
  - `AdminQuiz.test.tsx`/`AdminBackups.test.tsx`: оновлені посилання.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/admin`. Expected: FAIL.
- [ ] **Step 3: Implement** за деталями.
- [ ] **Step 4: Run** те саме + `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/admin apps/web/src/styles.css
git commit -m "feat(web): 70 one admin tab «Звернення» with complaints, «Щось не працює» and server errors, one combined badge, old addresses redirect; the problem card shows the game moment; a broadcast works without push"
```

### Задача 8. «Вхідні» на сайті: дзвіночок у меню, сторінка `/inbox`, опитування й сигнал від service worker

**Files:**
- Create: `apps/web/src/inbox/useInboxBadge.ts` (+ `.test.ts`), `apps/web/src/inbox/InboxPage.tsx` (+ `.test.tsx`)
- Modify: `apps/web/src/api.ts` (`getInbox`, `getInboxBadge`, `markInboxRead`), `apps/web/src/menu/Menu.tsx`, `apps/web/src/menu/Menu.test.tsx`, `apps/web/src/AppRoutes.tsx` (`/inbox` у `WithMenu`), `apps/web/src/push/push-text.ts` (+ test: `problem_reply` → `url: '/inbox'`), `apps/web/src/push/sw-handlers.ts` (+ test: після `showNotification` для `broadcast`/`problem_reply` — `clients.matchAll({ type: 'window', includeUncontrolled: true })` і `postMessage({ type: 'quiz:inbox' })` кожному; збій — тихо), `apps/server/e2e/helpers/common.ts` (`menuLinks` — `a:not(.menu-inbox)`), `apps/web/src/styles.css` (блок `/* 70 */`)

**Деталі:**
- `useInboxBadge(enabled: boolean): number` — одне сховище на вкладку, як `useFeedBadge` (`useSyncExternalStore`, запит у польоті перевикористовується, не частіше за 5 с без `force`, інтервал `INBOX_POLL_MS`, `visibilitychange`, слухач `navigator.serviceWorker` `message` з `type === 'quiz:inbox'` → `refresh(true)`); експорт `refreshInbox(force?)` і `setInboxUnread(n)` (для сторінки після `read`). Вимкнено (гість) — 0 і жодних запитів.
- `Menu`: для `signed-in` — після пунктів, перед `ThemeToggle`: `<Link className="menu-inbox" to="/inbox" aria-label={…} aria-current={path === '/inbox' ? 'page' : undefined}><span aria-hidden="true">🔔</span>{unread > 0 && <span className="menu-badge" aria-hidden="true">{unread}</span>}</Link>`; перечитування на `location.key` — `refreshInbox()`.
- `InboxPage`: гість → `Navigate` на `/login?next=/inbox`; стан loading/error (з «Спробувати ще», як в інших сторінках)/ready; порожньо — `inboxEmpty`; список `ul.inbox-list > li.inbox-item` (+ `is-new` для непрочитаних, позначка `inboxNew`), `time` з `formatDate`; посилання розсилки — `<Link>` лише якщо `isAnnouncementUrl(url)`; після показу з непрочитаними — `markInboxRead({ upTo: items[0].at })` → `setInboxUnread(result.unread)`.
- CSS: `.menu-inbox` — як `.menu-theme` (той самий розмір клітинки 2.75rem на телефоні, `position: relative` для бейджа), `.inbox-*` — картки на `panel`.

- [ ] **Step 1: Write the failing tests**
  - `Menu.test.tsx`: з акаунтом — у навігації є посилання «Вхідні» на `/inbox`; з `unread: 3` — `aria-label` «Вхідні, непрочитаних: 3» і бейдж «3»; гість — посилання немає й запиту `/api/me/inbox/badge` немає; наявні перевірки складу пунктів рахують без `.menu-inbox` (оновити селектор, не очікування).
  - `useInboxBadge.test.ts`: два хуки — один запит; повідомлення SW `quiz:inbox` → новий запит; `setInboxUnread(0)` → обидва показують 0.
  - `InboxPage.test.tsx`: розсилка й відповідь у правильному вигляді (цитата «Ви писали: …», «Усі мої повідомлення» → `/report`); непрочитані мають «Нове»; після показу — один `POST /api/me/inbox/read` з `upTo` найновішого; усі прочитані — `POST` немає; зовнішнє посилання в розсилці не стає `<a>`; гість → `/login?next=%2Finbox`.
  - `push-text.test.ts`: `problem_reply` → `url: '/inbox'`; `sw-handlers.test.ts`: `postMessage` вікнам після push-розсилки, а для `reminder` — ні.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/inbox apps/web/src/menu apps/web/src/push`. Expected: FAIL.
- [ ] **Step 3: Implement** за деталями.
- [ ] **Step 4: Run** те саме + `pnpm test --project web --maxWorkers=2 apps/web/src/AppRoutes.test.tsx` + `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src apps/server/e2e/helpers/common.ts
git commit -m "feat(web): 70 the inbox — a bell with the unread count in the menu, the /inbox page that marks shown items read, polling on navigation and focus, an instant refresh when a push arrives; a reply notification opens the inbox"
```

### Задача 9. Момент гри: збереження з пульта й екрана ведучого, показ і надсилання на `/report`

**Files:**
- Create: `apps/web/src/problems/problem-moment.ts` (+ `.test.ts`)
- Modify: `apps/web/src/problems/ProblemLink.tsx`, `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/screens/HostScreen.tsx`, `apps/web/src/problems/ProblemReport.tsx`, `apps/web/src/problems/ProblemReport.test.tsx`, тести екранів лише якщо вони перевіряють посилання (`PlayerScreen*.test.tsx`/`HostScreen*.test.tsx` — знайти `game-problem-link`)

**Interfaces:**
- `momentOf(code: string, role: 'player' | 'host', view: PlayerView | HostView): ProblemGameInput` — `phase`, `round: view.round?.index ?? null`, `roundTitle: view.round?.title ?? null`, `question: view.round === null ? null : view.questionIndex`, `type`/`text` з `view.question` (немає — `null`). Лише ці поля, ніяких відповідей.
- `saveMoment(moment, now = Date.now())` → `localStorage['quiz:problem-moment'] = JSON({ ...moment, at })` (збій сховища — тихо); `readMoment(from: string, now = Date.now()): ProblemGameInput | null` — код із `from` (`/^\/(play|host)\/(\d{6})/`) має збігатися з `moment.code`, вік ≤ `PROBLEM_MOMENT_MAX_AGE_MS`, і `problemGameSchema.safeParse` успішний; інакше `null`; `clearMoment()`.
- `ProblemLink` + `moment?: () => ProblemGameInput | null`; лише для `newTab`: `onClick` → `saveMoment(moment())` (не заважає переходу).
- `PlayerScreen`/`HostScreen`: `<ProblemLink newTab moment={() => momentOf(code, 'player'|'host', view)} … />`.
- `ProblemReport`: `const game = readMoment(from)`; у списку відомостей — рядок `problemPageGame` (раунд і запитання +1) чи `problemPageGameLobby`; надсилає `game: attach ? game : null`; успіх → `clearMoment()`.

- [ ] **Step 1: Write the failing tests**
  - `problem-moment.test.ts`: `momentOf` для зрізу запитання (`round.index 1`, `questionIndex 2`, `type 'single'`) і лобі (`round: null` → `round/question/type/text = null`); `readMoment` — інший код у `from` → `null`; старше 30 хв → `null`; зіпсований JSON → `null`; `/report` без гри → `null`.
  - `ProblemReport.test.tsx`: з моментом у `localStorage` і `?from=/play/123456` — рядок «Гра 123456: раунд 2, запитання 3», тіло `POST /api/problem-reports` містить `game`; зняти прапорець — `game: null`; після успіху момент зник зі сховища; момент іншої кімнати — рядка немає, `game: null`.
  - тест `ProblemLink` (у `ProblemReport.test.tsx` чи окремо): клік по `newTab` з `moment` пише сховище.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/problems`. Expected: FAIL.
- [ ] **Step 3: Implement** за інтерфейсами.
- [ ] **Step 4: Run** те саме + `pnpm test --project web --maxWorkers=2 apps/web/src/screens` + `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src
git commit -m "feat(web): 70 the in-game problem link remembers the moment — room code, round, question, its type and text — and the report page shows and sends it"
```

### Задача 10. Запрошення ввімкнути сповіщення після гри

**Files:**
- Create: `apps/web/src/push/PushInvite.tsx` (+ `.test.tsx`), `apps/web/src/push/push-invite.ts` (+ `.test.ts`)
- Modify: `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/screens/HostScreen.tsx` (у блоці `phase === 'finished'`), `apps/web/src/styles.css` (блок `/* 70 */`)

**Interfaces:**
- `push-invite.ts`: `inviteDue(now: number, storage: Pick<Storage, 'getItem'>): boolean` (немає запису чи минуло ≥ `PUSH_INVITE_GAP_DAYS` днів; зіпсований запис — так), `rememberInvite(now, storage)`.
- `PushInvite({ env = browserEnv(), now = Date.now })`: зовнішня частина синхронно перевіряє `pushSupport(env) === 'supported'` і `inviteDue` — інакше `null` **без жодного запиту** (у тестах і dev `prod: false`, тож екрани гри в тестах не шлють зайвого); внутрішня — `useAccount()` (лише `signed-in`), `getPushKey()` (є ключ), `permission() !== 'denied'`, `currentSubscription() === null`; щойно все так — показ і `rememberInvite`. `section.push-invite` (`aria-labelledby` заголовка), «Увімкнути» → `enablePush(publicKey)` → рядок стану (`role="status"`) і для `'on'` — `pushInviteDone`, для інших — ті самі тексти, що в `PushSettings`; «Не зараз» — сховати.

- [ ] **Step 1: Write the failing tests**
  - `push-invite.test.ts`: перший раз — так; через 13 днів — ні; через 14 — так; сміття в записі — так.
  - `PushInvite.test.tsx` (з підставленим `env` `prod: true` і заглушками API/permission/subscription): показ для акаунта без підписки — і запис часу в сховище; гість — нічого; `denied` — нічого; є підписка — нічого; запис 3 дні тому — нічого й жодного `fetch`; `prod: false` — нічого й жодного `fetch`; «Не зараз» ховає; «Увімкнути» з `enablePush → 'on'` — «Сповіщення увімкнено.».
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/push`. Expected: FAIL.
- [ ] **Step 3: Implement**; CSS `.push-invite` — `panel` з двома кнопками в рядок (на 360 px — переносяться), без анімацій поза `reducedMotion`.
- [ ] **Step 4: Run** те саме + `pnpm test --project web --maxWorkers=2 apps/web/src/screens` + `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src
git commit -m "feat(web): 70 a quiet post-game invite to turn on notifications — accounts on browsers that can push, never when denied or subscribed, at most once in 14 days"
```

### Задача 11. Наскрізний сценарій `part70-appeals-inbox.e2e.ts` і оновлення старих e2e

**Files:**
- Create: `apps/server/e2e/part70-appeals-inbox.e2e.ts`
- Modify: `apps/server/e2e/part64-errors-backups.e2e.ts` (адреси `/admin/errors` → `/admin/appeals/errors`, `?view=reports` → `/admin/appeals/problems`, вкладка «Збої» → «Звернення», бейдж `aria-label`, підказка й сповіщення відповіді — нові тексти; перевірки 404 для не-адміна лишаються на `/api/...`, а сторінка `/admin/appeals/errors`), `apps/server/e2e/part47-library.e2e.ts` (`/admin/reports…` → `/admin/appeals/complaints…`; один перехід старою адресою `/admin/reports` лишити — він тепер перевіряє редирект), `apps/server/e2e/part17-21-likes-feed-calendar-push-admin.e2e.ts` (13 → 12 вкладок, коментар), `apps/server/e2e/part59-push-broadcast.e2e.ts` (preview/рядок історії — нові тексти; якщо тест перевіряє `broadcast_nobody` без підписок — тепер це «Вхідні»)

**Сценарій part 70** (структура й перезапуск сервера з адміном і заглушкою push — як крок 0 у part 64; телефон 360 px, світла тема; кадри `p70-*` з `E2E_SHOTS=1`):
1. Сервер **без** push, адмін `admin70@example.com`; акаунти Оля 70 і Тарас 70 (без підписок). Адмін: «Розсилка» → «Люди: Оля 70» → попередній підрахунок «Отримають на сайті: 1, з них сповіщенням: 0» → надіслати → 201. Оля: дзвіночок з «1» (`aria-label` «Вхідні, непрочитаних: 1») після переходу між сторінками; `/inbox` — заголовок і текст розсилки з «Нове»; повернутися на головну — бейджа немає. Тарас — «Вхідні» порожні.
2. Адмін створює коротку вікторину (через API, як у part 64/65) і відкриває гру; Оля приєднується; на першому запитанні Оля тисне «Повідомити про проблему» → нова вкладка (`context.waitForEvent('page')`) `/report?from=/play/<code>` — рядок «Гра <code>: раунд 1, запитання 1»; пише текст і надсилає.
3. Адмін: смуга вкладок — «Звернення» з бейджем ≥ 1; `/admin/errors?view=reports` → URL `/admin/appeals/problems`; `/admin/reports` → `/admin/appeals/complaints`; три підвкладки видно без бічного скролу на 360 px; картка скарги Олі — код, «Вікторина: <назва>», «Запитання 1 — …», текст запитання, «Відкрити вікторину» веде на `/admin/quizzes/<id>`. «Відповісти» → «Відповідь у вхідних гравця (сповіщень у нього немає).».
4. Оля: дзвіночок «1» → `/inbox` — «Відповідь на ваше повідомлення», «Ви писали: …», текст відповіді; після показу бейдж 0; `/report` — відповідь і там.
5. Перезапуск із заглушкою push (як part 64); Оля підписується через `POST /api/me/push` (як part 64); розсилка «Усім» → у `outbox` рівно одне повідомлення (Олі), у «Вхідних» — і Олі, і Тараса; рядок історії «У вхідних: N, прочитали: 0; сповіщенням: 1».
6. Запрошення після гри: окремий контекст Тараса з `permissions: ['notifications']` недоступний у headless для підписки, тож перевіряємо лише показ і «Не зараз»: гра до кінця (одне запитання, «Завершити»), на екрані Тараса — «Не пропускайте новини» (якщо `PushManager` у headless відсутній і `pushSupport` дає не `supported` — крок пропустити з поясненням у коментарі, а не підробляти); «Не зараз» → панелі немає; перезавантаження завершеної гри — панелі немає (запис у `localStorage`).
7. Гість на `/inbox` → `/login?next=%2Finbox`; гість — `GET /api/me/inbox` 401. Кадри всіх нових сторінок у світлій темі, `expectNoSideScroll`.

- [ ] **Step 1: Write the failing test** — файл сценарію; оновлення старих e2e за списком.
- [ ] **Step 2: Run** `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 70"`. Expected: PASS після задач 1–10 (якщо FAIL — виправляти код, а не послаблювати перевірки).
- [ ] **Step 3: Run** по черзі, не одночасно: `-t "part 64"`, `-t "part 47"`, `-t "part 59"`, `-t "part 17"`, `-t "part 22"` (меню). Expected: PASS.
- [ ] **Step 4: Run** повний набір юніт-тестів: `pnpm test --maxWorkers=2` і `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): 70 appeals and inbox — a broadcast reaches the inbox without push, an in-game problem report carries the moment, the admin reply lands in the inbox, old admin addresses redirect, the post-game push invite stays quiet after «Не зараз»"
```

## Питання власнику (до злиття можна йти з рішеннями плану)

1. Чи мають «Вхідні» зважати на перемикач «Оголошення від адміністраторів»? План: ні — перемикач лише про push, у «Вхідні» розсилка приходить завжди.
2. Як часто показувати запрошення ввімкнути сповіщення: план — не частіше за раз на 14 днів і лише з акаунтом. Інше N? Показувати назавжди «ні» після, скажімо, трьох «Не зараз»?
3. Підвкладка за замовчуванням у «Зверненнях»: план — «Скарги на вікторини й профілі» (перша). Або відкривати ту, де є нове?
4. Розсилка «Усім» тепер іде у «Вхідні» **всім акаунтам** (не лише підписаним) — це значно ширше коло, ніж було в 59. Так і задумано?
5. Чи потрібно людям видаляти елементи «Вхідних» (зараз — ні, показуються 50 найновіших)?
