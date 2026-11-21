# План 71. Адмінка → Статистика: графіки, що відкриваються, більше «Стану» і нові метрики

Черга 45, пункти 2, 3 і 4. Без зміни `GAME_STATE_VERSION`. Одна нова міграція (таблиця `activity_day`). Ширину сторінки на ПК робить план 67 (токен `--w-admin`); графіки тут міряють свій контейнер і тягнуться разом з ним.

## Коротка специфікація

**Прохання власника (дослівно):**
- #2 «Адмінка -> Статистики. Дати можливість відкривати графіки і переробити графіки на більш презентативні з підписами і нормальними позначками, якщо не можна в зменшеному варіванті то хоча б коли відкриваєш.»
- #3 «У стан додати більше інформації.»
- #4 «Додати більше інформації про скільки часу було проведено за створення користувачами вікторин, скільки в грі, скільки середня кількість гравців і т.д. збирати більше метрик для розуміння.»

### Що є зараз (перевірено)

- `apps/web/src/admin/AdminStats.tsx`: плитки `/api/admin/stats` (акаунти, онлайн, ігри сьогодні/7/30, вікторини), «Топ вікторин» за весь час, далі `AdminCharts` і `AdminHealth` з `AdminCharts.tsx`.
- `AdminCharts.tsx` → `DayBars`: SVG `viewBox="0 0 300 120"`, масштабується цілком (текст 10 px росте/меншає разом з рамкою), лише підпис «макс. N», дата першого й останнього дня, жодних поділок осі Y, сітки, значень, підказок; таблиця `sr-only`. Чотири графіки за 30 днів з `/api/admin/charts` (`admin-charts.ts`, кеш 10 хв).
- «Стан» (`AdminHealth`, `/api/admin/health`): остання копія бази, час роботи, `rss`/`heapUsed`, живі кімнати, з'єднання.
- Даних про час у редакторі немає ніде. `profile.lastSeenAt` — лише остання мітка (без історії днів), тож справжніх DAU/WAU/MAU зараз не порахувати; є лише «акаунти, що зіграли гру».

### 1. Графіки (#2) — власні SVG, без бібліотеки

Бібліотека (Recharts ≈ 100 КБ gzip з d3-частинами, Chart.js — canvas без доступності) не потрібна: у нас лише стовпчики (один ряд або складені), горизонтальні смуги й підписи. Свій компонент дає: ті самі токени тем (світла/темна), RTL-безпечну вісь, таблицю для читачів екрана й нуль залежностей. Якщо колись знадобляться лінії з масштабуванням/панорамою — тоді й повернутися до питання.

- **Розмір у пікселях, а не `viewBox`:** хук `useWidth` (ResizeObserver) міряє контейнер; SVG малюється в реальних px (`width = контейнер`, висота 180 px у картці, `min(60vh, 28rem)` у діалозі). Текст завжди 12 px (картка) / 13 px (діалог) і не розтягується. Без ResizeObserver (jsdom) — ширина 320.
- **Вісь Y:** «гарні» поділки 1-2-5 (`niceTicks`), 3 поділки в картці, 5 у діалозі; тонка сітка `--chart-grid`; підписи компактними числами (`Intl.NumberFormat(intlTag(), { notation: 'compact' })`), відсотки — «50 %», хвилини — «1 год 20 хв».
- **Вісь X:** підписи дат не ближче за 56 px один від одного (`xLabelIndexes`), перший і останній завжди; день — «19 лист.», тиждень — «з 17 лист.», година — «09». Напрям осі завжди «старіші ліворуч» (`direction: ltr` як зараз).
- **Значення:** у діалозі над стовпчиком — число, якщо стовпчик ≥ 22 px завширшки; пунктирна лінія середнього з підписом «сер. N» (лише для лічильників, не для відсотків).
- **Підказка:** наведення або фокус на стовпчику — плашка з датою (діапазоном тижня) і значенням кожного ряду. Клавіатура: SVG — одна зупинка Tab (`tabIndex=0`, `role="group"`, `aria-roledescription` не вживаємо), ←/→/Home/End міняють активний стовпчик; текст плашки дублюється в `aria-live="polite"` (лише коли фокус у графіку).
- **Легенда** (лише складені ряди): HTML-список під графіком, квадратик кольору + назва + сума за період. Кольори — нові токени `--chart-1` (= `--accent`), `--chart-2`, `--chart-3`, `--chart-grid` у темній і світлій темах; контраст графіки до `--surface` ≥ 3 : 1 (WCAG 1.4.11) — перевіряє тест стилів. Складені ряди відрізняються ще й тонкою білою/темною межею між сегментами (не лише кольором).
- **Розгорнути:** кнопка «Розгорнути» (іконка ⤢ + текст, `aria-label` «Розгорнути «{назва}»») у кожній картці графіка й списку. Діалог `ChartDialog` — за зразком `table-sheet` (`ReportDialog.tsx`): портал, `role="dialog" aria-modal="true" aria-labelledby`, Esc і клік по тлу закривають, Tab ходить колом, фокус — на «Закрити» при відкритті і назад на «Розгорнути» після. На телефоні — на весь екран, на ПК — до `min(96vw, var(--w-admin, 72rem))`. У діалозі — великий графік, підпис періоду, перемикач «Показати таблицею» / «Показати графіком» (видима таблиця тих самих чисел).
- **Порожньо:** самі нулі/прогалини — «Немає даних за ці дні.» (наявний ключ), кнопки «Розгорнути» немає.

### 2. «Стан» (#3) — що додаємо (дешеве й безпечне)

`/api/admin/health` лишається без кешу для процесу (миттєві числа), а частина з бази кешується на 60 с (`HEALTH_DB_MS`). Групи (`<section>` з `h3` + `dl.admin-stats`):

| Група | Рядки |
|---|---|
| Сервер | Версія: короткий коміт `RENDER_GIT_COMMIT` (7 знаків) або «невідома (локальний запуск)»; Node.js `process.version`; запущено (дата) + час роботи; пам'ять `rss`, купа `heapUsed` з `heapTotal`, поза купою `external`; процесор — % одного ядра за останню хвилину (`process.cpuUsage` різниця); затримка циклу подій за останню хвилину p50/p99/макс. (`perf_hooks.monitorEventLoopDelay`) |
| Ігри зараз | лобі / ідуть / на паузі (з `liveStatus`), з них кімнати бота (`isBotUser(hostUserId)`) і автопілот; гравців у кімнатах «на зв'язку з усього»; з'єднання (наявне); заповненість «{rooms} з {maxRooms}»; якщо `manager.frozen` — рядок-попередження «Сервер перезапускається…» |
| База даних | розмір бази (`pg_database_size(current_database())`, збій → «—»); рядків: акаунти (без бота), вікторини, ігри, учасники, відповіді, події ігор, збережені ігри, дні активності (`count(*)`, кеш 60 с); підписки на сповіщення «{subscriptions} (людей: {people})»; остання копія (наявне) + «Копій у сховищі: {count}, разом {size}» (зі списку, який уже читаємо) |
| Проблеми | збоїв за 24 год — сума `day_count` рядків `server_error` з `day_start > now − 24 год` і кількість різних; нерозібраних збоїв (`status = 'new'`); відкритих скарг на проблеми (`problem_report.status = 'open'`); відкритих скарг на вміст (`user_report.status = 'open'`) |

Під групами — «Перевірено {time}» і кнопка «Оновити» (перечитує з `keep: true`, без миготіння). Сховище медіа (R2) не рахуємо: це повний перелік бакета на кожен запит — див. «Рішення власника», п. 4. Email-адрес у відповіді немає (перевіряє e2e).

### 3. Нові метрики (#4)

**Нова таблиця `activity_day`** (одна на обидва потреби — DAU і редактор; рядок на людину на київський день):

```
activity_day(user_id text FK user ON DELETE CASCADE, day text 'YYYY-MM-DD' (київський), editor_sec int default 0, editor_sessions int default 0, PK (user_id, day)); index (day)
```

- **Відвідування:** `touchSeen` (кличеться з `/api/me` на кожній сторінці, пише не частіше раз на хвилину) — коли оновлення справді відбулося (`returning`), ще `insert … on conflict do nothing` рядка дня. Бот не пишеться. Це дає DAU/WAU/MAU «заходили на сайт» з дня розгортання.
- **Час у редакторі:** клієнтський лічильник активного часу на сторінці `EditQuiz` (`/quizzes/new`, `/quizzes/:id`). Кожні 5 с: якщо вкладка видима (`document.visibilityState === 'visible'`) і остання дія людини (`keydown`, `pointerdown`, `input`, `wheel`) була не давніше 60 с — +5 с у «накопичене». Надсилання — `POST /api/me/editor-time { seconds, start }` коли накопичилось ≥ 60 с, а також на `visibilitychange → hidden`, `pagehide` і розмонтування (`fetch(..., { keepalive: true })`; `sendBeacon` не годиться — він не шле `application/json`). `start: true` — перше надсилання цього відкриття редактора (лічильник сесій). Сервер: лише увійшли, не бот; `seconds` 1…600 (zod), ліміт 12 запитів/хв на людину; `editor_sec = least(57600, editor_sec + seconds)` (стеля 16 год на день); `editor_sessions + (start ? 1 : 0)`. Зміст вікторини, id вікторини, IP — не зберігаються.
- **Об'єднання акаунтів:** правило `activity_day.user_id` — рядки другорядного вливаються в головний з підсумовуванням (стеля та сама), далі видаляються. **Видалення акаунта** — каскадом (рядки зникають); `account-delete.test.ts` `HANDLED` + рядок у великому тесті.

**`GET /api/admin/metrics?period=7|30|90|365`** (кеш 10 хв на кожен період; 365 = 52 тижні). Відповідь `AdminMetrics`:

- `bucket: 'day' | 'week'` (тижні — лише для 365) і `buckets[]`: `start` (київський день початку), `days` (1 або 7), `active` (акаунти з `activity_day`), `players` (акаунти, що зіграли), `games`, `finished`, `aborted`, `hosted` / `autopilot` / `bot` (усі ігри за ведучим: людина; автопілот людини; `host_id = BOT_USER_ID`), `completion` %, `returns` % (наявне правило 8–14 → 0–7 днів; для тижня — на останній день тижня), `avgPlayers` (середнє людей у дограній грі; `participant.is_team = false`, гості теж), `gameMin` (сума тривалостей дограних ігор, кожна ≤ 240 хв), `playerMin` (тривалість × людей), `newUsers`, `newQuizzes` (без бота), `editorMin`.
- `summary` за період і `previous` (такий самий підсумок за попередній рівний період; `null`, якщо в ньому немає жодної гри й жодного рядка активності): `games`, `finished`, `completion`, `avgPlayers`, `medianGameMin`, `avgGameMin`, `gameHours`, `playerHours`, `hosted`, `autopilot`, `bot`, `newUsers`, `activation` (% нових акаунтів, що зіграли гру протягом 7 днів після реєстрації; `null`, якщо нових немає), `dau` (середнє `active` на день), `wau`, `mau` (різні акаунти за останні 7 / 30 днів **періоду**), `stickiness` (`dau / mau`, %), `editorHours`, `editorSessions`, `editorSessionMin` (середня сесія), `editors` (різні люди в редакторі), `newQuizzes`.
- `trackedSince`: найраніший `activity_day.day` або `null` — графіки активності й редактора підписують «Збирається з {date}; раніших даних немає».
- `topQuizzes` (10, за дограними іграми періоду): `id`, `title`, `author` (нік), `games`, `avgPlayers`, `avgMin`.
- `roundTypes`: `{ type, games }[]` — у скількох дограних іграх періоду був раунд цього типу (`quiz_snapshot->'rounds'` масивом; старі ігри без раундів — пропуск).
- `questionTypes`: `{ type, plays }[]` — скільки зіграно запитань кожного типу в дограних іграх періоду (JS: `upgradeQuiz` знімка → `roundQuestions` → мапа id → тип; `plays` гри). Межа — 1000 найновіших дограних ігор періоду (`questionTypesGames` у відповіді каже, зі скількох ігор пораховано).
- `hours`: 24 числа — старти ігор за годиною за Києвом.
- `topEditors` (10, за `editor_sec` періоду): `userId`, `nickname`, `minutes`, `sessions` — лише ніки, без email.
- `computedAt`.

`/api/admin/charts` і `adminCharts` прибираються: чотири наявні графіки тепер беруться з `metrics` (`players`, `games`, `completion`, `returns`) з тими самими правилами; допоміжні `kyivDayList`, `shiftDay`, `weeklyReturns` лишаються в `admin-charts.ts`.

### 4. Вкладка «Статистика» після плану

1. Плитки «зараз» з `/api/admin/stats` — як були (вони про «тепер», не про період). «Топ вікторин» за весь час лишається.
2. Розділ «Метрики»: перемикач періоду (`fieldset` з радіокнопками-«чипами»: 7 днів / 30 днів / 90 днів / Рік; за замовчуванням 30; вибір — у `?period=` адреси, тож перезавантаження й «Назад» його зберігають).
3. Плитки KPI періоду (`dl.admin-stats`): значення + рядок «▲ 12 % до попереднього періоду» / «▼ …» / «немає з чим порівняти» (стрілка — `aria-hidden`, текст повний). Порядок: Ігор; Дограно; Гравців у грі; Типова гра (медіана); Годин у грі; Людино-годин; Нових акаунтів; Зіграли за 7 днів після реєстрації; Активних за день (сер.); Активних за 7 днів; Активних за 30 днів; Залученість; Годин у редакторі; Сесій редагування; Середня сесія редагування; Людей у редакторі; Нових вікторин; Ігор бота.
4. Сітка карток-графіків (`repeat(auto-fit, minmax(min(100%, 20rem), 1fr))` — на широкій адмінці 67 стає 3–4 колонки): Активні акаунти; Активні гравці; Ігри за ведучим (складені: людина / автопілот / бот); Дограно %; Повернення %; Гравців у грі (сер.); Час у грі, хв; Нові реєстрації; Час у редакторі, хв; Нові вікторини; Коли починають ігри (24 години).
5. Списки зі смугами (`HBarList`, теж «Розгорнути»): Найпопулярніші вікторини за період; Типи раундів; Типи запитань; Хто найбільше працював у редакторі.
6. «Стан» — нижче, як і зараз.

## Глобальні обмеження

- Prettier **не запускати**. Тести — лише з `--maxWorkers=2`. Коментарі в коді — українською. `python3` тут заглушка: правити Edit/node; після коміту `git show --stat` звірити файли.
- Жодної зміни `GAME_STATE_VERSION` і стану кімнат/рушія.
- Нові ключі i18n — у всіх 7 мовах (uk `apps/web/src/i18n.ts`, решта `apps/web/src/locales/{en,pl,de,es,it,ar}.json`) і в списку `ADDED_71` в `apps/web/src/i18n.test.ts` (+ `!ADDED_71.includes(key)` у великому фільтрі «fresh» і свій `it('71 keys … are in every locale')` за зразком 66: змінні в усіх мовах ті самі, переклад не дорівнює uk, якщо в uk є літери). Наявні ключі (`adminChart*`, `adminHealth*`) не видаляти й не міняти їхній uk-текст.
- Міграція — `<наступний вільний номер>_activity_day` (на сьогодні остання `0049`, плани 67–69 міграцій не мають → очікувано `0050`); генерувати `pnpm --filter @quiz/server exec drizzle-kit generate --name activity_day` **після** злиття всього, що вже в `main`, щоб знімок `meta` був актуальним. Лише додавання (нова таблиця, індекс, FK).
- Кожна нова таблиця з ключем на `user`: `account-delete.test.ts` (`HANDLED`, рядок у великому тесті видалення), правило в `MERGE_RULES` (`account-merge-people.ts`) і його тест; тест «every foreign key to user has a merge rule» має пройти.
- Ні email, ні IP, ні змісту вікторин у нових відповідях і таблицях. Бот (`BOT_USER_ID`) не рахується як людина ніде.
- Усі «дні» — київські (`kyivDay`, `kyivMidnight`, `Europe/Kyiv` у SQL), як у наявних графіках.
- Графіки тягнуться за контейнером (план 67 розширює `.app.admin-page`): жодних фіксованих ширин у px для карток; без бічного скролу на 360 px.
- Доступність: кожен графік — `figure` з `h3`, SVG `role="img"` з `aria-labelledby`, таблиця для читачів екрана (наявний патерн), діалог — модальний з поверненням фокусу; мінімальна ціль дотику 2.75rem для кнопок/чипів.
- Порядок злиття: задачі 1→3 (сервер-основа) перед 4 і 6–7; i18n (задача 8) — перед веб-компонентами 9–12.

---

### Задача 1. Спільні типи й схеми

**Файли:** `packages/shared/src/admin.ts`, `packages/shared/src/admin.test.ts` (якщо немає — створити поруч за зразком інших `*.test.ts` пакета), експорт через наявний `packages/shared/src/index.ts` (перевірити, що `admin` реекспортується повністю).

**Спершу тести (падають):**
- `adminMetricsQuerySchema.parse({ period: '30' })` → `{ period: 30 }`; без `period` → 30; `'0'`, `'31'`, `'abc'`, зайве поле → помилка.
- `editorTimeSchema`: приймає `{ seconds: 60, start: true }`, `{ seconds: 1, start: false }`; відкидає `0`, `601`, `1.5`, без `start`, зайве поле.
- `ADMIN_METRIC_PERIODS` = `[7, 30, 90, 365]`; `metricBucket(365) === 'week'`, `metricBucket(90) === 'day'`.

**Зміни:**
```ts
/** 71: періоди вкладки «Метрики»; рік — 52 тижні. */
export const ADMIN_METRIC_PERIODS = [7, 30, 90, 365] as const;
export type AdminMetricPeriod = (typeof ADMIN_METRIC_PERIODS)[number];
export const metricBucket = (period: AdminMetricPeriod): 'day' | 'week' => (period === 365 ? 'week' : 'day');
export const adminMetricsQuerySchema = z.object({ period: z.coerce.number().int().refine((n): n is AdminMetricPeriod => (ADMIN_METRIC_PERIODS as readonly number[]).includes(n)).default(30) }).strict();
/** 71: активний час у редакторі — порція від клієнта; start — перша порція цього відкриття редактора. */
export const EDITOR_TIME_MAX_SEC = 600;
export const editorTimeSchema = z.object({ seconds: z.number().int().min(1).max(EDITOR_TIME_MAX_SEC), start: z.boolean() }).strict();
```
Інтерфейси `AdminMetricBucket`, `AdminMetricsSummary`, `AdminMetrics` — точно за полями зі специфікації §3 (числа; частки й середні `number | null`, коли ділити нема на що). `AdminHealth` розширити (старі поля лишаються, нові — поруч):
```ts
export interface AdminHealth {
  backup: AdminBackupInfo; uptimeSec: number; memory: { rss: number; heapUsed: number; heapTotal: number; external: number };
  rooms: number; connections: number; checkedAt: string;
  server: { commit: string | null; node: string; startedAt: string; cpuPercent: number | null; lagMs: { p50: number; p99: number; max: number } | null };
  live: { lobby: number; playing: number; paused: number; bot: number; autopilot: number; playersOnline: number; playersTotal: number; maxRooms: number; restarting: boolean };
  db: { bytes: number | null; rows: Record<AdminHealthTable, number>; push: { subscriptions: number; people: number } } | null;
  backups: { count: number; bytes: number } | null;
  problems: { errors24h: number; errorKinds24h: number; errorsNew: number; problemsOpen: number; reportsOpen: number } | null;
}
export const ADMIN_HEALTH_TABLES = ['user', 'quiz', 'game', 'participant', 'answer', 'game_event', 'saved_game', 'activity_day'] as const;
export type AdminHealthTable = (typeof ADMIN_HEALTH_TABLES)[number];
```
(`db`/`problems` — `null`, якщо запит до бази впав: «Стан» має показатись і тоді.) `AdminChartDay`/`AdminCharts`/`ADMIN_CHART_DAYS` прибрати в задачі 7 (тут не чіпати).

**Перевірка:** `pnpm vitest run packages/shared --maxWorkers=2`; `pnpm typecheck` (сервер ще не заповнює нові поля `AdminHealth` — тимчасово типова помилка в `admin-routes.ts` недопустима: у цій задачі нові поля health зробити, а заповнення — задача 6; щоб typecheck пройшов, тимчасово позначити `server`, `live`, `db`, `backups`, `problems` і нові поля `memory` як необов'язкові й прибрати `?` у задачі 6).

**Коміт:** `feat(shared): admin metrics period, editor time and extended health types (71)`

---

### Задача 2. Таблиця `activity_day`, міграція, видалення й об'єднання акаунтів

**Файли:** `apps/server/src/db/schema.ts`, `apps/server/drizzle/<N>_activity_day.sql` + `apps/server/drizzle/meta/*` (згенеровані), `apps/server/src/account-merge-people.ts`, `apps/server/src/account-merge-people.test.ts`, `apps/server/src/account-delete.test.ts`.

**Спершу тести (падають):**
- `account-delete.test.ts`: `'activity_day.user_id'` у `HANDLED`; у великому тесті видалення — вставити рядок `activity_day` для того, кого видаляють, і перевірити, що після `deleteAccount` його немає, а рядок іншої людини лишився.
- `account-merge-people.test.ts`, новий `it('activity days of the secondary are summed into the primary, the cap holds')`: P має `2026-11-20 {editor_sec: 100, sessions: 1}`, S — `2026-11-20 {57_550, 2}` і `2026-11-21 {30, 1}`; після правила — у P `2026-11-20 {57_600, 3}`, `2026-11-21 {30, 1}`; у S рядків немає; день без редактора (лише відвідування, нулі) теж переноситься.

**Зміни:**
- Схема:
  ```ts
  /** 71: людина була на сайті цього київського дня; і скільки активного часу провела в редакторі. Без змісту й без IP. */
  export const activityDay = pgTable(
    'activity_day',
    {
      userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
      /** 'YYYY-MM-DD' за Києвом. */
      day: text('day').notNull(),
      editorSec: integer('editor_sec').notNull().default(0),
      editorSessions: integer('editor_sessions').notNull().default(0),
    },
    (table) => [primaryKey({ columns: [table.userId, table.day] }), index('activity_day_day_idx').on(table.day)],
  );
  ```
  Стелю дня винести константою `EDITOR_DAY_MAX_SEC = 57_600` у `apps/server/src/activity.ts` (новий файл, задача 3 його доповнить).
- Міграцію згенерувати (див. обмеження), першим рядком SQL додати коментар `-- Дні активності й час у редакторі (план 71): лише нова таблиця, індекс і зовнішній ключ.` за зразком `0049`.
- `account-merge-people.ts`: нове правило `activityDayRule` (`keys: ['activity_day.user_id']`) у `PEOPLE_RULES`:
  ```sql
  insert into activity_day (user_id, day, editor_sec, editor_sessions)
    select ${primary}, day, editor_sec, editor_sessions from activity_day where user_id = ${secondary}
  on conflict (user_id, day) do update set
    editor_sec = least(${EDITOR_DAY_MAX_SEC}, activity_day.editor_sec + excluded.editor_sec),
    editor_sessions = activity_day.editor_sessions + excluded.editor_sessions;
  delete from activity_day where user_id = ${secondary};
  ```
  `MergeSummary` не міняється (лічильник у підсумку об'єднання не показуємо).
- `db-backup` бере таблиці з `information_schema` — нічого не треба; переконатись, що `db-restore.test.ts` (порядок відновлення за FK) проходить.

**Перевірка:** `pnpm vitest run apps/server/src/account-delete.test.ts apps/server/src/account-merge-people.test.ts apps/server/src/account-merge-history.test.ts apps/server/src/db --maxWorkers=2`; `pnpm vitest run apps/server/src/db-restore.test.ts apps/server/src/db-backup.test.ts --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(server): activity_day table, summed on account merge, removed with the account (71)`

---

### Задача 3. Запис відвідувань і часу в редакторі

**Файли:** `apps/server/src/activity.ts` (новий), `apps/server/src/activity.test.ts` (новий), `apps/server/src/profiles.ts` (`touchSeen`), `apps/server/src/profiles.test.ts` (або наявний тест `touchSeen`), `apps/server/src/activity-routes.ts` (новий), `apps/server/src/activity-routes.test.ts` (новий), `apps/server/src/app.ts` (реєстрація).

**Спершу тести (падають):**
- `activity.test.ts` (PGlite): `markActiveDay(db, userId, now)` двічі за день → один рядок з нулями; о 23:30 UTC 2026-11-21 (= 01:30 Києва 22-го) — день `2026-11-22`; бот → рядка немає. `addEditorTime(db, userId, { seconds: 300, start: true }, now)` → `{300, 1}`; ще `{seconds: 600, start: false}` → `{900, 1}`; накопичити до стелі → `57_600`, не більше.
- `touchSeen`: коли мітку оновлено — рядок дня є; повторний виклик у ту ж хвилину (мітку не оновлено) — запит `insert into activity_day` не йде (шпигун `onQuery` з `createTestDb`).
- `activity-routes.test.ts`: `POST /api/me/editor-time` без входу → 401; з входом `{ seconds: 60, start: true }` → 204 і рядок `{60, 1}`; `{ seconds: 0 }` / `{ seconds: 601 }` / зайве поле → 400; 13-й запит за хвилину → 429; бот (сесія бота, якщо тест-хелпер уміє; інакше юніт `addEditorTime`) → 204 без рядка.

**Зміни:**
- `activity.ts`:
  ```ts
  /** 71: людина була на сайті цього київського дня; повтор — нічого. Бот — не людина. */
  export async function markActiveDay(db: Db, userId: string, now: Date): Promise<void>
  /** 71: + активні секунди редактора за київський день (стеля EDITOR_DAY_MAX_SEC); start — нова сесія. */
  export async function addEditorTime(db: Db, userId: string, input: { seconds: number; start: boolean }, now: Date): Promise<void>
  ```
  Обидві — `insert … on conflict (user_id, day) do …` (`do nothing` / `do update set editor_sec = least(cap, activity_day.editor_sec + excluded.editor_sec), editor_sessions = activity_day.editor_sessions + excluded.editor_sessions`). День — `kyivDay(now)` з `xp-rules.ts`.
- `touchSeen`: `.returning({ id: profile.userId })`; якщо рядок повернувся — `await markActiveDay(db, userId, new Date())`. Збій уже ловить виклик у `/api/me` (вхід не ламається).
- `activity-routes.ts`: `registerActivityRoutes(app, { db, currentUser, now? })`, маршрут `POST /api/me/editor-time` з `config.rateLimit { max: 12, timeWindow: '1 minute', keyGenerator: за id акаунта }` за зразком `admin-routes.ts` `limited`; `editorTimeSchema.safeParse` → 400 `invalid_payload`; 401 `unauthorized`; успіх — 204.
- `app.ts`: `await registerActivityRoutes(app, { db: options.db, currentUser });` поруч з `registerProfileRoutes`.

**Перевірка:** `pnpm vitest run apps/server/src/activity.test.ts apps/server/src/activity-routes.test.ts apps/server/src/profiles.test.ts apps/server/src/app.test.ts --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(server): record active days and editor time per Kyiv day (71)`

---

### Задача 4. Лічильник активного часу в редакторі (веб)

**Файли:** `apps/web/src/editor/editor-time.ts` (новий), `apps/web/src/editor/editor-time.test.ts` (новий), `apps/web/src/api.ts` (`sendEditorTime`), `apps/web/src/pages/EditQuiz.tsx`, `apps/web/src/pages/EditQuiz.test.tsx`.

**Спершу тести (падають), `vi.useFakeTimers()`:**
- Дія людини (`keydown` на `document`), 60 с з діями кожні 20 с → одне надсилання `{ seconds: 60, start: true }`; наступні 60 с → `{ seconds: 60, start: false }`.
- 2 хв без жодної дії → накопичується лише 60 с після останньої дії, далі нічого.
- `visibilityState = 'hidden'` → тики не рахуються; перехід у `hidden` з накопиченими 15 с → негайне надсилання `{ seconds: 15, … }`.
- Розмонтування з накопиченими 10 с → надсилання з `keepalive: true`; 0 с → нічого.
- Невдале надсилання (мережа) — секунди не губляться й не дублюються: наступна порція містить їх (але ≤ 600; надлишок відкидається).
- `EditQuiz.test.tsx`: для анонімного/ще не завантаженого акаунта лічильник не запускається (жодного `fetch` на `/api/me/editor-time`).

**Зміни:**
- `editor-time.ts`: `startEditorTime(send: (body: { seconds: number; start: boolean }, keepalive: boolean) => Promise<boolean>): () => void` — чиста логіка без React (константи `TICK_MS = 5_000`, `IDLE_MS = 60_000`, `FLUSH_SEC = 60`, `EDITOR_TIME_MAX_SEC` зі shared); слухачі `keydown`, `pointerdown`, `input`, `wheel` (`{ passive: true, capture: true }`), `visibilitychange`, `pagehide`; повертає функцію зупинки (знімає слухачів, шле залишок з `keepalive`). Хук `useEditorTime(enabled: boolean)` — `useEffect` над нею.
- `api.ts`: `sendEditorTime(body, keepalive)` — `fetch('/api/me/editor-time', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive })`, `true` на 204; помилки ковтаються (метрика не важливіша за редактор).
- `EditQuiz.tsx`: `useEditorTime(signedIn)` на верхньому рівні компонента (до умовних `return`).

**Перевірка:** `pnpm vitest run apps/web/src/editor/editor-time.test.ts apps/web/src/pages/EditQuiz.test.tsx --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(web): count active time in the quiz editor and send it in small portions (71)`

---

### Задача 5. Знімач процесу: процесор і затримка циклу подій

**Файли:** `apps/server/src/process-stats.ts` (новий), `apps/server/src/process-stats.test.ts` (новий), `apps/server/src/app.ts` (створення й зупинка в `onClose`).

**Спершу тести (падають):** з підробленими `cpuUsage`, `histogram` і годинником: до першої хвилини `snapshot()` → `{ cpuPercent: null, lagMs: null }`; після тику — `cpuPercent` = (user+system різниця мкс) / (минуло мс × 1000) × 100, округлено до 1 знака; `lagMs` з гістограми (нс → мс, 1 знак), гістограма `reset()` після кожного тику; `stop()` знімає таймер (`unref` — таймер не тримає процес).

**Зміни:**
```ts
/** 71: раз на хвилину — частка одного ядра й затримка циклу подій за цю хвилину; «Стан» читає останній знімок. */
export function processStats(deps?: { cpuUsage?: () => NodeJS.CpuUsage; histogram?: IntervalHistogram; now?: () => number; intervalMs?: number }): { snapshot(): { cpuPercent: number | null; lagMs: { p50: number; p99: number; max: number } | null }; stop(): void }
```
Справжні: `process.cpuUsage`, `monitorEventLoopDelay({ resolution: 20 })` (`enable()` при створенні, `disable()` у `stop`). `app.ts`: створити один раз, передати в `registerAdminRoutes` як `processStats`, `app.addHook('onClose', () => stats.stop())`.

**Перевірка:** `pnpm vitest run apps/server/src/process-stats.test.ts --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(server): per-minute CPU share and event-loop delay sampler for the admin health (71)`

---

### Задача 6. Розширений `/api/admin/health`

**Файли:** `apps/server/src/admin-health.ts` (новий), `apps/server/src/admin-health.test.ts` (новий), `apps/server/src/admin-routes.ts`, `apps/server/src/admin-routes.test.ts`, `apps/server/src/app.ts` (опція `commit`), `apps/server/src/main.ts` (`commit: process.env.RENDER_GIT_COMMIT ?? null`), `packages/shared/src/admin.ts` (прибрати тимчасові `?` з задачі 1).

**Спершу тести (падають):**
- `admin-health.test.ts` (PGlite): `healthDb(db, now)` на базі з 2 людьми + бот, 1 вікториною, 1 грою з 2 учасниками, 1 підпискою push → `rows.user === 2` (без бота), `rows.quiz === 1`, `rows.participant === 2`, `push === { subscriptions: 1, people: 1 }`, `bytes` — число > 0 або `null` (PGlite може не вміти — тест приймає обидва, але тип числа). `healthProblems`: збій з `day_start` 2 год тому і `day_count` 3 + збій з `day_start` 30 год тому → `errors24h === 3`, `errorKinds24h === 1`; `errorsNew` рахує обидва `new`; відкрита скарга на проблему і скарга на вміст → по 1.
- `liveBreakdown(rooms, maxRooms, frozen)` (чиста, з підробленими кімнатами): лобі/гра/пауза, бот (`hostUserId = BOT_USER_ID`), автопілот (`state.autopilot !== undefined`), гравці онлайн/усього, завершені кімнати не рахуються.
- `admin-routes.test.ts` (`describe('charts and health (39-A3)')`): відповідь має `server.node === process.version`, `server.commit === 'abc1234'` (передати `commit: 'abc1234def'` в опції застосунку — обрізається до 7), `live.maxRooms`, `db.rows`, `backups === { count: 1, bytes: 3_500_000 }`; у JSON немає `@`; другий виклик за 60 с не робить запитів `count(*)` (шпигун `onQuery`); збій `healthDb` (підроблена база, що кидає на `pg_database_size`) → `db: null`, відповідь 200.

**Зміни:**
- `admin-health.ts`: `healthDb(db, now)`, `healthProblems(db, now)`, `liveBreakdown(rooms, maxRooms, frozen)`; `count(*)` для `ADMIN_HEALTH_TABLES` одним `select` з підзапитами (як `adminStats`), `user` — без `BOT_USER_ID`; `pg_database_size` в окремому `try` → `null`.
- `admin-routes.ts`: `AdminDeps` + `commit?: string | null`, `processStats?: { snapshot(): … }`; `ttlCache(() => Promise.all([healthDb, healthProblems]) …, HEALTH_DB_MS = 60_000)`, збій → `null` + `reportError(error, { where: 'admin-health' })`; `backups` — у наявному `ttlCache` списку додатково рахувати `count`/`bytes` (сума `size`); `startedAt = new Date(Date.now() - process.uptime() * 1000)`; `memory` + `heapTotal`, `external`.
- Старі поля (`rooms`, `connections`, `uptimeSec`, `backup`) не міняються — їх читає наявний UI до задачі 12.

**Перевірка:** `pnpm vitest run apps/server/src/admin-health.test.ts apps/server/src/admin-routes.test.ts --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(server): admin health — version, CPU, event-loop delay, live rooms breakdown, database rows and size, problems in 24 h (71)`

---

### Задача 7. `/api/admin/metrics` замість `/api/admin/charts`

**Файли:** `apps/server/src/admin-metrics.ts` (новий), `apps/server/src/admin-metrics.test.ts` (новий), `apps/server/src/admin-charts.ts` (лишити `kyivDayList`, `shiftDay`, `weeklyReturns`; прибрати `adminCharts`), `apps/server/src/admin-charts.test.ts` (прибрати `describe('adminCharts')`, перенести його сценарії в `admin-metrics.test.ts`), `apps/server/src/admin-routes.ts`, `apps/server/src/admin-routes.test.ts`, `packages/shared/src/admin.ts` (прибрати `AdminChartDay`, `AdminCharts`, `ADMIN_CHART_DAYS`; веб їх перестає вживати в задачі 11 — до неї `apps/web` не має ламатися: прибирання з shared робити в задачі 11, тут лише позначити `/** @deprecated 71 */`), `apps/web/src/admin/admin-api.ts` (`adminMetrics(period)`).

**Спершу тести (падають), PGlite, `now = 2026-11-19T10:00:00Z`:**
- Порожня база, `period: 30` → 30 кошиків `bucket: 'day'`, усі нулі, `completion`/`returns`/`avgPlayers` — `null`, `previous: null`, `trackedSince: null`, порожні списки, `hours` — 24 нулі.
- Наявні сценарії `adminCharts` (акаунти, ігри, дограні за київським днем; повернення) дають ті самі `players`/`games`/`finished`/`completion`/`returns`.
- Ведучі: гра людини, автопілот людини, гра бота → `hosted 1, autopilot 1, bot 1` у кошику дня й у `summary`.
- Тривалості: дограні ігри 30 хв (3 людини, 1 рядок команди — не рахується), 60 хв (1 людина) і 10 год (обрізається до 240) → `avgPlayers 2` (у кошику й підсумку — середнє по іграх), `medianGameMin 60`, `gameHours = (30+60+240)/60 = 5.5`, `playerHours = (90+60+240)/60 = 6.5`; перервана гра в тривалості не входить, але в `games`/`aborted` — так.
- Активність: `activity_day` для 3 людей у різні дні → `active` по днях, `dau` (середнє на день періоду, 1 знак), `wau`/`mau` (різні за останні 7 / 30 днів), `stickiness`; `trackedSince` — найраніший день; редактор: `editorMin` по днях (секунди / 60, округлення до цілих), `editorHours`, `editorSessions`, `editorSessionMin`, `editors`, `topEditors` (нік, без email; бот не з'являється).
- `newUsers` без бота; `activation`: двоє нових, один зіграв на 3-й день після реєстрації, другий — на 9-й → 50.
- `newQuizzes` без вікторин бота.
- `period: 365` → 52 кошики `week`, `start` кожного — на 7 днів пізніше попереднього, останній закінчується сьогодні; `days === 7`.
- `previous`: гра в попередньому 30-денному вікні → `previous.games === 1`.
- `topQuizzes` — за дограними іграми періоду, з ніком автора, `avgPlayers`, `avgMin`; `roundTypes` — гра з раундами `classic` + `board` → обидва по 1; `questionTypes` — зіграні запитання за типом (`plays` гри → тип у знімку); `questionTypesGames` — кількість ігор, з яких пораховано; `hours` — старт о 18:30 за Києвом → `hours[18] === 1`.
- `admin-routes.test.ts`: `GET /api/admin/metrics?period=7` адміну → 200, не-адміну/гостю → 404, `period=31` → 400 `invalid_payload`; другий виклик того самого періоду — з кешу (шпигун: жодного запиту), інший період — свій запит; `/api/admin/charts` → 404.

**Зміни:**
- `adminMetrics(db, period, now): Promise<AdminMetrics>`:
  - Межі: `days = kyivDayList(now, period === 365 ? 364 : period)`; `from = kyivMidnight(перший день)`; `fromPrev = from − довжина`; кошики — по 1 або по 7 днів зі старішого.
  - Запит ігор `[fromPrev, now]` (один, рядок на гру): `id`, `quizId`, `title`, день і година старту за Києвом, `status`, `hostId = BOT_USER_ID`, `autopilot`, хвилини `least(extract(epoch from finished_at − started_at) / 60, 240)` для дограних, людей `(select count(*) from participant p where p.game_id = g.id and not p.is_team)`. Усе інше (кошики, підсумки, медіана, години, топ) — у JS. Коментар: «сімейний масштаб — тисячі рядків на рік; якщо стане більше — переносити агрегати в SQL».
  - Пари (день, акаунт) гравців з запасом `RETURN_LOOKBACK` — як у наявному `adminCharts` (для `players` і `returns`; для тижня `returns` — на останній день тижня, `players` — різні за тиждень).
  - `activity_day` за `[fromPrev − 29 днів, сьогодні]` (для `mau` попереднього періоду) — рядки `user_id, day, editor_sec, editor_sessions`, бот уже не пишеться.
  - `user.created_at` і `quiz.created_at` за київським днем (без бота); активація — `exists` гри з участю протягом 7 днів після `created_at`.
  - `roundTypes` — SQL `jsonb_array_elements(case when jsonb_typeof(g.quiz_snapshot->'rounds') = 'array' then g.quiz_snapshot->'rounds' else '[]'::jsonb end) ->> 'type'`, `count(distinct g.id)`; невідомі типи (не з `ROUND_TYPES`) — відкинути.
  - `questionTypes` — до 1000 найновіших дограних ігор періоду, читати `quiz_snapshot` і `plays` пачками по 100 (`upgradeQuiz` + `quizSchema.safeParse`, збій розбору — пропуск гри), лічити `plays` за типом запитання (`roundQuestions(round)` → мапа `id → type`); невідомі — пропуск.
  - `topQuizzes`: топ-10 `quizId` за дограними; автор — `quiz.owner_id` → `profile.nickname` (видалена вікторина — `title` гри, автор `''`).
  - `topEditors`: сума `editor_sec` періоду за людиною, топ-10, нік з `profile`.
- `admin-routes.ts`: `const metrics = new Map<AdminMetricPeriod, TtlCache>()` — по `ttlCache` на період (`ADMIN_CACHE_MS`); маршрут `GET /api/admin/metrics` (`read`), `adminMetricsQuerySchema.safeParse(request.query)` → 400; маршрут `/api/admin/charts` і кеш `charts` — прибрати.
- `admin-api.ts`: `adminMetrics = (period: AdminMetricPeriod) => fetchData<AdminMetrics>(\`/api/admin/metrics?period=${period}\`)`; `adminCharts` лишити до задачі 11.

**Перевірка:** `pnpm vitest run apps/server/src/admin-metrics.test.ts apps/server/src/admin-charts.test.ts apps/server/src/admin-routes.test.ts --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(server): admin metrics by period — activity, games by host, durations, players per game, editor time, tops (71)`

---

### Задача 8. Ключі i18n у всіх 7 мовах

**Файли:** `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,pl,de,es,it,ar}.json`, `apps/web/src/i18n.test.ts`.

**Спершу тест (падає):** `const ADDED_71 = [...]` (усі ключі нижче) + у фільтрі «fresh» `&& !ADDED_71.includes(key)` + `it('71 keys (stats charts, health, metrics) are in every locale')` за зразком 66 (uk не порожній; кілька точних uk-текстів, напр. `chartExpand`, `adminKpiStickiness`; у кожній мові — є, ті самі `{змінні}`, не дорівнює uk, якщо в uk є літери; виняток — `adminHealthNode` «Node.js» однаковий).

**Ключі (uk):**

| Ключ | uk |
|---|---|
| `chartExpand` | `Розгорнути «{title}»` |
| `chartExpandShort` | `Розгорнути` |
| `chartClose` | `Закрити` |
| `chartShowTable` | `Показати таблицею` |
| `chartShowChart` | `Показати графіком` |
| `chartAverage` | `сер. {value}` |
| `chartTotal` | `Разом: {value}` |
| `chartWeekOf` | `з {date}` |
| `chartWeekRange` | `{from} – {to}` |
| `chartHour` | `Година` |
| `chartKeysHint` | `Стрілки ← → — сусідні стовпчики.` |
| `chartPercentValue` | `{value} %` |
| `chartMinutesValue` | `{value} хв` |
| `chartHoursMinutes` | `{hours} год {minutes} хв` |
| `chartSinceHint` | `Збирається з {date}; раніших даних немає.` |
| `adminMetricsTitle` | `Метрики за період` |
| `adminMetricsPeriod` | `Період` |
| `adminMetricsPeriod_7` | `7 днів` |
| `adminMetricsPeriod_30` | `30 днів` |
| `adminMetricsPeriod_90` | `90 днів` |
| `adminMetricsPeriod_365` | `Рік` |
| `adminMetricsUp` | `більше на {value} до попереднього періоду` |
| `adminMetricsDown` | `менше на {value} до попереднього періоду` |
| `adminMetricsSame` | `як у попередньому періоді` |
| `adminMetricsNoPrevious` | `немає з чим порівняти` |
| `adminMetricActive` | `Активні акаунти (заходили на сайт)` |
| `adminMetricGamesByHost` | `Ігри за ведучим` |
| `adminMetricHostPeople` | `Ведучий-людина` |
| `adminMetricHostAutopilot` | `Автопілот` |
| `adminMetricHostBot` | `Квіз-бот` |
| `adminMetricAvgPlayers` | `Гравців у грі, у середньому` |
| `adminMetricGameTime` | `Час у грі, хв` |
| `adminMetricGameTimeHint` | `Сума тривалостей дограних ігор від старту до фінішу; одна гра — не більше 4 год.` |
| `adminMetricNewUsers` | `Нові реєстрації` |
| `adminMetricEditorTime` | `Час у редакторі вікторин, хв` |
| `adminMetricEditorHint` | `Лише активний час: вкладка відкрита, і людина щось робила за останню хвилину.` |
| `adminMetricNewQuizzes` | `Нові вікторини` |
| `adminMetricHours` | `Коли починають ігри (година за Києвом)` |
| `adminMetricRoundTypes` | `Типи раундів у дограних іграх` |
| `adminMetricQuestionTypes` | `Типи зіграних запитань` |
| `adminMetricQuestionTypesHint` | `Пораховано з {count} останніх дограних ігор.` |
| `adminMetricTopQuizzes` | `Найпопулярніші вікторини за період` |
| `adminMetricTopQuizMeta` | `{author} · гравців у середньому {players} · {minutes} хв` |
| `adminMetricTopEditors` | `Хто найбільше працював у редакторі` |
| `adminMetricTopEditorMeta` | `сесій: {sessions}` |
| `adminMetricEmptyList` | `За цей період нічого немає.` |
| `adminKpiGames` | `Ігор` |
| `adminKpiCompletion` | `Дограно до кінця` |
| `adminKpiAvgPlayers` | `Гравців у грі` |
| `adminKpiMedianGame` | `Типова гра (медіана)` |
| `adminKpiGameHours` | `Годин у грі` |
| `adminKpiPlayerHours` | `Людино-годин у грі` |
| `adminKpiNewUsers` | `Нових акаунтів` |
| `adminKpiActivation` | `Зіграли за 7 днів після реєстрації` |
| `adminKpiDau` | `Активних за день (сер.)` |
| `adminKpiWau` | `Активних за 7 днів` |
| `adminKpiMau` | `Активних за 30 днів` |
| `adminKpiStickiness` | `Залученість (день / 30 днів)` |
| `adminKpiEditorHours` | `Годин у редакторі` |
| `adminKpiEditorSessions` | `Сесій редагування` |
| `adminKpiEditorSession` | `Середня сесія редагування` |
| `adminKpiEditors` | `Людей у редакторі` |
| `adminKpiNewQuizzes` | `Нових вікторин` |
| `adminKpiBotGames` | `Ігор Квіз-бота` |
| `adminHealthGroupServer` | `Сервер` |
| `adminHealthGroupGames` | `Ігри зараз` |
| `adminHealthGroupDb` | `База даних` |
| `adminHealthGroupProblems` | `Проблеми` |
| `adminHealthVersion` | `Версія` |
| `adminHealthVersionUnknown` | `невідома (локальний запуск)` |
| `adminHealthNode` | `Node.js` |
| `adminHealthStarted` | `Запущено` |
| `adminHealthStartedValue` | `{date} (працює {uptime})` |
| `adminHealthMemoryFull` | `{rss}; купа {heap} з {total}; поза купою {external}` |
| `adminHealthCpu` | `Процесор за останню хвилину` |
| `adminHealthCpuValue` | `{value} % одного ядра` |
| `adminHealthLag` | `Затримка циклу подій` |
| `adminHealthLagValue` | `типово {p50} мс; 99 % — до {p99} мс; макс. {max} мс` |
| `adminHealthWaiting` | `ще міряється — за хвилину після запуску` |
| `adminHealthLobbies` | `Лобі` |
| `adminHealthPlaying` | `Ігри, що йдуть` |
| `adminHealthPaused` | `На паузі` |
| `adminHealthBotRooms` | `Кімнати Квіз-бота` |
| `adminHealthAutopilotRooms` | `Під автопілотом` |
| `adminHealthPlayers` | `Гравців у кімнатах` |
| `adminHealthPlayersValue` | `{online} на зв'язку з {total}` |
| `adminHealthCapacity` | `Заповненість` |
| `adminHealthCapacityValue` | `{rooms} з {max} кімнат` |
| `adminHealthRestarting` | `Сервер перезапускається: нові ігри тимчасово не стартують.` |
| `adminHealthDbSize` | `Розмір бази` |
| `adminHealthRows` | `Рядків у таблицях` |
| `adminHealthRow_user` | `акаунти` |
| `adminHealthRow_quiz` | `вікторини` |
| `adminHealthRow_game` | `ігри` |
| `adminHealthRow_participant` | `учасники ігор` |
| `adminHealthRow_answer` | `відповіді` |
| `adminHealthRow_game_event` | `події ігор` |
| `adminHealthRow_saved_game` | `збережені ігри` |
| `adminHealthRow_activity_day` | `дні активності` |
| `adminHealthPush` | `Підписки на сповіщення` |
| `adminHealthPushValue` | `{subscriptions} (людей: {people})` |
| `adminHealthBackupsTotal` | `Копій у сховищі` |
| `adminHealthBackupsTotalValue` | `{count}, разом {size}` |
| `adminHealthDbFailed` | `Не вдалося прочитати базу — спробуйте «Оновити».` |
| `adminHealthErrors24` | `Збоїв за 24 год` |
| `adminHealthErrors24Value` | `{count} (різних: {kinds})` |
| `adminHealthErrorsNew` | `Нерозібраних збоїв` |
| `adminHealthProblemsOpen` | `Відкритих повідомлень про проблеми` |
| `adminHealthReportsOpen` | `Відкритих скарг на вміст` |
| `adminHealthChecked` | `Перевірено {time}` |
| `adminHealthRefresh` | `Оновити` |

Назви типів раундів/запитань — наявні `ROUND_NAMES` (`guide-text.ts`) і `type_${type}`; нових ключів не треба. Переклади — живою мовою кожної локалі (ar — RTL, числа й одиниці як у наявних `adminHealth*`).

**Перевірка:** `pnpm vitest run apps/web/src/i18n.test.ts --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(web): texts for chart dialogs, extended health and period metrics in 7 languages (71)`

---

### Задача 9. Основа графіків: шкали, ширина, кольори

**Файли:** `apps/web/src/admin/charts/chart-scale.ts` (новий), `apps/web/src/admin/charts/chart-scale.test.ts` (новий), `apps/web/src/admin/charts/useWidth.ts` (новий), `apps/web/src/styles.css` (токени й класи `chart-*`), `apps/web/src/styles-chart.test.ts` (новий; розбір правил — як у `theme.test.ts`/`styles-wide.test.ts`).

**Спершу тести (падають):**
- `niceTicks(0, 3)` → `{ max: 1, ticks: [0, 1] }`; `niceTicks(7, 3)` → `{ max: 8, ticks: [0, 4, 8] }`; `niceTicks(93, 5)` → `[0, 20, 40, 60, 80, 100]`; `niceTicks(100, 5, { percent: true })` → `[0, 25, 50, 75, 100]`, максимум завжди 100; дробові середні (2.4) → поділки 0, 1, 2, 3.
- `xLabelIndexes(30, 300, 56)` — містить 0 і 29, сусідні мітки не ближче 56 px; `xLabelIndexes(1, 300, 56)` → `[0]`; `xLabelIndexes(24, 900, 56)` → усі 24.
- `compactNumber(1234)` (uk) → «1,2 тис.»; `minutesText(80)` → «1 год 20 хв»; `minutesText(45)` → «45 хв»; `deltaPercent(110, 100)` → `10`, `deltaPercent(5, 0)` → `null`.
- Стилі: у темній і світлій темах є `--chart-1`, `--chart-2`, `--chart-3`, `--chart-grid`; контраст кожного `--chart-N` до `--surface` тієї ж теми ≥ 3 (функція контрасту — як у наявних тестах теми; якщо такої немає — маленька `relativeLuminance` у тесті).

**Зміни:**
- `chart-scale.ts`: чисті функції вище + `bucketLabel(start, bucket, locale)` (день — `Intl … { day: 'numeric', month: 'short', timeZone: 'UTC' }`, тиждень — `chartWeekOf`), `bucketRange(start, days)` для підказки.
- `useWidth.ts`: `useWidth<T extends HTMLElement>(): [RefObject<T>, number]` — ResizeObserver, округлення до цілих px, без нього — 320.
- `styles.css` (розділ «71»): токени в обох темах (`--chart-1: var(--accent)`; `--chart-2`, `--chart-3` — підібрати з палітри теми з контрастом ≥ 3 : 1 і різною світлотою, щоб розрізнялись і в сірому); класи `.chart-card`, `.chart-card-head` (заголовок + кнопка «Розгорнути» праворуч, `flex-wrap`), `.chart-svg text { font-size: 12px }`, `.chart-dialog .chart-svg text { font-size: 13px }`, `.chart-grid-line`, `.chart-axis`, `.chart-bar`, `.chart-bar.is-active`, `.chart-avg` (пунктир), `.chart-tip` (плашка поверх, `pointer-events: none`), `.chart-legend`, `.hbar-list`, `.hbar` (смуга `inline-size: calc(var(--share) * 100%)`), `.chart-dialog` (на телефоні `inset: 0`, на ПК `max-inline-size: min(96vw, var(--w-admin, 72rem))`), `.metric-period` (чипи ≥ 2.75rem), `.admin-kpi-delta`. Сітка `.day-bars-grid` → `minmax(min(100%, 20rem), 1fr)`. Без `container-type`/`contain` на `.app*` (обмеження плану 67).

**Перевірка:** `pnpm vitest run apps/web/src/admin/charts apps/web/src/styles-chart.test.ts --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(web): chart scales, measured width and chart colour tokens for both themes (71)`

---

### Задача 10. `BarChart`, `HBarList`, `ChartCard`, `ChartDialog`

**Файли:** `apps/web/src/admin/charts/BarChart.tsx`, `BarChart.test.tsx`, `HBarList.tsx`, `HBarList.test.tsx`, `ChartCard.tsx`, `ChartCard.test.tsx`, `ChartDialog.tsx`, `ChartDialog.test.tsx` (усі нові, у `apps/web/src/admin/charts/`).

**Спершу тести (падають):**
- `BarChart` (один ряд, 30 кошиків, ширина 320 через відсутній ResizeObserver): `svg[role="img"]` з ім'ям — заголовок; 3 лінії сітки й підписи Y за `niceTicks`; підписи X не ближче 56 px, перший і останній є; стовпчиків рівно стільки, скільки ненульових значень; таблиця `sr-only` з усіма кошиками (як наявні тести `DayBars`). Складений (3 ряди) — сегменти в порядку рядів, легенда з трьома пунктами й сумами. `size="large"` — числа над стовпчиками, коли їх ≤ 30 на 900 px, і немає — коли 90 на 320 px; лінія середнього з «сер. N» (не для `percent`).
- Клавіатура: фокус на SVG → активний останній кошик, плашка з датою і значенням, `aria-live` містить той самий текст; `ArrowLeft` → передостанній; `Home`/`End`; наведення миші на стовпчик показує його плашку.
- Самі нулі → «Немає даних за ці дні.», без SVG.
- `HBarList`: `ol` з рядками «назва — число», `--share` = значення / максимум; порожньо → `adminMetricEmptyList`.
- `ChartCard`: кнопка з доступним ім'ям «Розгорнути «Ігри за ведучим»»; клік → `role="dialog"` з `aria-modal="true"`, заголовком тим самим, фокус на «Закрити»; Esc закриває й повертає фокус на кнопку; клік по тлу закриває, по картці — ні; Tab з «Закрити» йде на «Показати таблицею», далі колом; «Показати таблицею» — видима таблиця, кнопка стає «Показати графіком». Порожній графік — кнопки немає.

**Зміни:**
- `BarChart` props: `{ title: string; titleId: string; labels: { short: string; full: string }[]; series: { key: string; label: string; color: 1 | 2 | 3; values: (number | null)[] }[]; unit: 'count' | 'percent' | 'minutes' | 'decimal'; size: 'small' | 'large'; average?: boolean }`. Розкладка: ліве поле під підписи Y — 40 px (у RTL-документі SVG однаково `direction: ltr`), низ — 22 px, верх — 8 px; слот = (ширина − поле) / кількість; стовпчик 70 % слота (мінімум 1 px; ненульове значення — мінімум 1 px заввишки, як зараз). Плашка — HTML-елемент над SVG у `position: relative` обгортці (не `<title>`, бо його не видно з клавіатури).
- `ChartDialog`: портал, за зразком `ReportDialog` (Esc, Tab по колу, клік по тлу), але з поверненням фокусу на `returnTo` ref; `aria-labelledby` — `h2` діалогу.
- `ChartCard`: `figure.chart-card` → `h3` + `hint` + кнопка; рендер-проп `children(size)` малює малий графік у картці й великий у діалозі.
- Чистий `DayBars` з `AdminCharts.tsx` не переписувати тут — його замінить задача 11.

**Перевірка:** `pnpm vitest run apps/web/src/admin/charts --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(web): measured SVG bar chart with axes, ticks, tooltips and an accessible enlarge dialog (71)`

---

### Задача 11. Розділ «Метрики за період» у «Статистиці»

**Файли:** `apps/web/src/admin/AdminMetrics.tsx` (новий), `apps/web/src/admin/AdminMetrics.test.tsx` (новий), `apps/web/src/admin/AdminStats.tsx`, `apps/web/src/admin/AdminCharts.tsx` (прибрати `AdminCharts`/`DayBars`; `AdminHealth` переїде в задачі 12), `apps/web/src/admin/AdminCharts.test.tsx` (прибрати тести `AdminCharts`/`DayBars`, їхні перевірки — у `AdminMetrics.test.tsx`), `apps/web/src/admin/admin-api.ts` (прибрати `adminCharts`), `packages/shared/src/admin.ts` (прибрати `AdminChartDay`, `AdminCharts`, `ADMIN_CHART_DAYS`), `apps/web/src/admin/Admin.test.tsx` (підробка fetch для `/api/admin/metrics`).

**Спершу тести (падають)** (`fetch` підроблено фікстурою `AdminMetrics`):
- За замовчуванням читає `?period=30`; вибір «7 днів» → запит `period=7`, адреса `?period=7`; відкриття сторінки з `?period=365` — вибраний «Рік», кошики підписані «з 17 лист.»; невідомий `?period=5` → 30.
- Плитки KPI: «Ігор 12» і «більше на 20 % до попереднього періоду» (попередній 10); `previous: null` → «немає з чим порівняти»; `medianGameMin: 80` → «1 год 20 хв»; `completion: null` → «—».
- Картки графіків — 11 у порядку зі специфікації §4; «Ігри за ведучим» — легенда «Ведучий-людина / Автопілот / Квіз-бот»; «Активні акаунти» і «Час у редакторі» мають підказку «Збирається з {date}…», коли `trackedSince` не `null`.
- Чотири колишні графіки («Активні гравці…», «Ігор за день», «Дограно до кінця, %», «Повернення, %» з підказкою) — ті самі заголовки й значення, що давав `DayBars` (на них чекає e2e 53).
- Списки: топ вікторин (назва — посилання на `/admin/quizzes/:id`, якщо вікторина існує), типи раундів назвами з `ROUND_NAMES`, типи запитань `type_*` + підказка «Пораховано з N…», редактори — нік як посилання на `/admin/users/:userId`, час `minutesText`.
- Помилка завантаження → наявний `Failed` з «Спробувати ще»; під час перемикання періоду попередні дані лишаються (`keep: true`), без «Завантаження…».

**Зміни:**
- `AdminMetrics`: `useSearchParams` для `period`; `useAdminData(() => adminMetrics(period), \`metrics:${period}\`, { keep: true })`; `fieldset.metric-period` з `legend` «Період» і чотирма `input[type=radio]` + `label`; `dl.admin-stats` KPI з рядком `.admin-kpi-delta` (`▲`/`▼` `aria-hidden`); `div.day-bars-grid` карток `ChartCard` + `BarChart`; `HBarList`-картки; рядок «Пораховано {time}; оновлюється раз на 10 хв.» (наявний `adminChartsComputed`).
- `AdminStats.tsx`: замість `<AdminCharts />` — `<AdminMetrics />`; `AdminHealth` — як був (до задачі 12).

**Перевірка:** `pnpm vitest run apps/web/src/admin --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(web): admin metrics by period — KPI with change, eleven charts and top lists, all enlargeable (71)`

---

### Задача 12. Новий вигляд «Стану»

**Файли:** `apps/web/src/admin/AdminHealth.tsx` (новий, переїзд з `AdminCharts.tsx`), `apps/web/src/admin/AdminHealth.test.tsx` (новий; перенести наявний тест `AdminHealth` і доповнити), `apps/web/src/admin/AdminCharts.tsx` (видалити, якщо в ньому нічого не лишилось; `backupText`/`Row`/`Failed` — у `AdminHealth.tsx` або спільний `admin-bits.tsx`), `apps/web/src/admin/AdminStats.tsx` (імпорт).

**Спершу тести (падають):**
- Наявні перевірки (копія, «Копій ще немає», «Сховище копій не налаштоване», час роботи, кімнати, з'єднання) — проходять без змін текстів.
- Групи з `h3`: «Сервер», «Ігри зараз», «База даних», «Проблеми».
- Версія `abc1234` / «невідома (локальний запуск)»; «Процесор…» `12,5 % одного ядра`; `cpuPercent: null` → «ще міряється — за хвилину після запуску»; затримка — «типово 1,2 мс; 99 % — до 8 мс; макс. 20 мс».
- «Ігри зараз»: лобі/ідуть/пауза/бот/автопілот, «3 на зв'язку з 5», «2 з 20 кімнат»; `restarting: true` → рядок з `role="status"` «Сервер перезапускається…».
- «База даних»: розмір `bytesText`, `bytes: null` → «—»; вісім рядків таблиць з назвами `adminHealthRow_*` (вкладений `dl` або `ul` у `dd`); push; «Копій у сховищі: 4, разом 12,0 МБ»; `db: null` → «Не вдалося прочитати базу…».
- «Проблеми»: «3 (різних: 1)»; нерозібрані збої — посилання на `/admin/errors`; скарги — на `/admin/problems`/`/admin/reports` (взяти наявні шляхи вкладок з `Admin.tsx`).
- «Перевірено {time}» і «Оновити» → другий запит, без «Завантаження…» між ними.

**Зміни:** компонент `AdminHealth` з `useAdminData(adminHealth, 'health', { keep: true })`; групи — `section.admin-health-group` з `h3` і `dl.admin-stats`; стилі — сітка груп `repeat(auto-fit, minmax(min(100%, 22rem), 1fr))` (розширюється з планом 67).

**Перевірка:** `pnpm vitest run apps/web/src/admin --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(web): admin health grouped — server, live games, database, problems — with refresh (71)`

---

### Задача 13. E2E

**Файли:** `apps/server/e2e/part71-stats-metrics.e2e.ts` (новий), `apps/server/e2e/part53-admin-home.e2e.ts` (оновити `charts53`).

**Зміни:**
- part53 `charts53`: цикл шляхів `['metrics?period=30', 'health']` замість `['charts', 'health']`; картки — `admin.locator('.admin-metrics figure.chart-card')`, чотири колишні — за заголовками («Активні гравці (акаунти, що зіграли гру)», «Ігор за день», «Дограно до кінця, %», «Повернення, %»); у кожній намальованій — `table.sr-only tbody tr` = 30, стовпчиків `rect.chart-bar` = 30 − нульових днів; решта — як було. Перевірки «Стану» лишаються (тексти ті самі).
- part71 (за зразком part53: `withAdmin`, `register`, світла тема, `viewportShot`, `expectNoSideScroll`); окремі `it('part 71 …')`:
  1. **Редактор рахує час:** людина входить, відкриває `/quizzes/new`, друкує назву, 6 с робить дії (кожні 2 с `keyboard.press`), тисне «Скасувати» (розмонтування шле залишок з `keepalive`) → у базі (`db` з `helpers/setup`) рядок `activity_day` цієї людини з `editor_sec ≥ 5` і `editor_sessions = 1`; також є рядок дня від `/api/me`.
  2. **Метрики:** зіграти коротку гру (як `game55`: `makeRoundsQuiz([classicRound(…)])`, двоє гравців) до фіналу; адмін відкриває `/admin` → розділ «Метрики за період», «30 днів» вибрано; плитка «Ігор» ≥ 1, «Гравців у грі» = 2; «Рік» → адреса `?period=365`, підписи тижнів; перезавантаження — «Рік» лишився. Гість: `/api/admin/metrics?period=30` → 404; відповідь адміну без `@`.
  3. **Розгорнути:** у картці «Ігри за ведучим» — «Розгорнути…» → `role=dialog`, легенда з трьома рядами, числа над стовпчиками; «Показати таблицею» → видима таблиця; Esc → діалогу немає, фокус на кнопці «Розгорнути…»; клавіатура на графіку картки: Tab до SVG, `ArrowLeft` → плашка з датою. Кадри `metrics71-360`, `metrics71-dialog-360`, `metrics71-1366` (ширина 1366 — сітка в кілька колонок: перевірити, що дві перші картки на одному рядку — однаковий `boundingBox().y`), темна тема — один кадр діалогу.
  4. **Стан:** групи «Сервер», «Ігри зараз», «База даних», «Проблеми»; «Рядків у таблицях» містить «акаунти»; «Оновити» → «Перевірено …» змінюється (або той самий час, але без «Завантаження…»); без бічного скролу на 360 px.

**Перевірка:** `pnpm typecheck` (включно з `apps/server/e2e`); `pnpm build` і `pnpm vitest run --config apps/server/e2e/vitest.config.ts part53 part71 --maxWorkers=2` (потрібен локальний Postgres, як для решти e2e); `E2E_SHOTS=1` для кадрів — переглянути їх очима.

**Коміт:** `test(e2e): editor time, period metrics, chart dialog and grouped health; part 53 on the new charts (71)`

---

### Задача 14. Фінальна перевірка

**Файли:** —

**Кроки:** `pnpm typecheck`; `pnpm vitest run --maxWorkers=2` (увесь набір); e2e з задачі 13; вручну на dev-сервері (світла й темна теми, 360 px, 1366 і 1920 px після плану 67, арабська мова — вісь не перевернута, діалог читається): перемикання періодів, «Розгорнути» кожного графіка й списку, клавіатура (Tab, стрілки, Esc), «Стан» з «Оновити». Перевірити, що `/quizzes/:id` у DevTools шле `POST /api/me/editor-time` не частіше раз на хвилину і зупиняється в неактивній вкладці. Зупинити dev-сервери після перевірки.

**Коміт:** не потрібен (лише якщо фінальне рев'ю щось виправило: `fix(…): … (71)`).

---

## Рішення власника

1. **Облік часу в редакторі по людях.** План пише активні секунди редактора на людину на день (без змісту, без id вікторини) і показує адмінам «Хто найбільше працював у редакторі» з ніками. Якщо по людях не треба — лишити лише загальні суми (прибрати `topEditors`, одна правка в задачах 7 і 11).
2. **«Активний» — це 60 с без дій.** Довше думання над запитанням без натискань не рахується. Можна поставити 2–3 хв (одна константа `IDLE_MS`).
3. **Дані з нуля.** Час у редакторі й «заходили на сайт» (DAU/WAU/MAU) починаються з дня розгортання — історії немає; графіки це підписують. Ігрові метрики (тривалість, гравці, ведучі, типи) рахуються з наявної історії ігор повністю.
4. **Сховище медіа (R2) у «Стані» не показуємо** — це повний перелік бакета на кожен перегляд. Можна додати пізніше як рідкісний (раз на добу) підрахунок у фоні.
5. **Ігри бота.** Після видалення акаунта його дограні ігри переходять на Квіз-бота (правило 58), тож у «Ігри Квіз-бота» потрапляють і вони. Для сімейного масштабу це кілька ігор; якщо важливо — окрема позначка в `game` (нова колонка й міграція).
6. **Періоди** — 7 / 30 / 90 днів і рік (тижнями). Якщо треба «увесь час» чи довільні дати — окремий план.
7. **Старий маршрут `/api/admin/charts` прибирається** (його заміняє `/api/admin/metrics`); старий «Топ вікторин за весь час» лишається поруч з новим «за період». Якщо старий топ зайвий — прибрати.
8. **Без бібліотеки графіків.** Власні SVG-стовпчики з осями, поділками, підказками й діалогом; бібліотеку (Recharts тощо) варто розглядати лише для ліній з масштабуванням — зараз не потрібно.
