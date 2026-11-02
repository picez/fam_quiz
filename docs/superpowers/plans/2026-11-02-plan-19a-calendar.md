# План 19a: календар запланованих ігор (беклог #21)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** підпроєкт 3 специфікації `docs/superpowers/specs/2026-11-01-social-feed-calendar-likes-design.md`. Це календар із запитами, **без пушів** (Web Push — окремий підпроєкт 4).
- Ведучий створює подію з назвою, датою й часом і своєю вікториною. Подію можна змінити або скасувати.
- Подію бачать ті, кого ведучий має в друзях (одностороння дружба, як у запрошеннях `invites.ts`). Вони бачать її у вкладці «Календар» сторінки `/feed` і карткою в «Подіях друзів».
- Друг тисне «Хочу взяти участь». Поки запит не підтвердили, його можна скасувати. Ведучий підтверджує або відхиляє, відхилений бачить «Відхилено».
- Ведучий тисне «Відкрити гру» в події. Створюється кімната з вікториною події, подія запам'ятовує її. Підтверджені бачать «Приєднатися» → `/play/<код>`. Решта може зайти за кодом, як зараз.
- Якщо ведучий не відкрив гру протягом 6 годин після початку, подія стає «Не відбулась» і зникає з календаря.
- Бейдж «Стрічки» отримує справжні `requests` (запити до моїх подій чекають рішення) і `decisions` (рішення за моїми запитами, зміни й скасування подій, де я учасник).

**Spec:** `docs/superpowers/specs/2026-11-01-social-feed-calendar-likes-design.md`. Потрібні розділи:
- «Календар (#21)»;
- «Мої рішення» → «Хто бачить події», «Запит на участь», «Подія без гри», «Бейдж»;
- «Рішення після builder-check» → «Друг», «Подія ↔ гра», «Час», «Бейдж «Стрічки»»;
- «Не цілі», «Анти-цілі», «Обмеження».

**Передумова:** 17a (лайки) і 18a (стрічка) уже в `main`. Міграції до `0024_feed` зайняті, тож наша — **`0025_calendar`** (journal idx 25).

**Стан гри не змінюється: `GAME_STATE_VERSION` лишається 22.**
- Календар не торкається `GameState`, `SavedRoom`, `Room` і рушія (`packages/engine`).
- Кімнату події створює звичайний `manager.create(quiz, hostId, quizId)`, як `POST /api/games`. Подія лише зберігає `room.id` і `room.code` у своєму рядку.
- Тож пуш не обриває живих ігор.

**Архітектура:**
- **Shared** (`packages/shared/src/calendar.ts`): типи `CalendarEvent`, `CalendarPage`, `CalendarState`, `CalendarRequestStatus`, константи, zod-схеми. До `FEED_KINDS` / `FeedData` додається вид `planned`.
- **Сервер:**
  - таблиці `calendar_event` і `calendar_request`, колонка `profile.calendar_seen_at`;
  - `calendar-store.ts` — видимість, обчислений стан, читання, запис, запити, частини бейджа, рядок `planned` у `feed_event`;
  - `calendar-routes.ts` — HTTP і «Відкрити гру»;
  - `feed-store.ts` дістає гілку видимості для `planned`. Маршрут бейджа в `feed-routes.ts` зливає `feedBadge` і `calendarBadge`.
- **Веб:**
  - вкладка «Календар» у `FEED_TABS`, маршрут `/feed/calendar`;
  - `calendar/calendar-time.ts` — часові пояси явно;
  - `CalendarForm`, `CalendarCard`, сторінка `pages/Calendar.tsx`;
  - картка `planned` у стрічці.

**Технології:** TypeScript, zod, vitest, Fastify (+ `@fastify/rate-limit`), Drizzle + drizzle-kit + PGlite, React 19 + Vite, Testing Library (jsdom), Playwright. Нових залежностей немає.

## Рішення (там, де специфікація лишила місце будівникові)

- **Нового пункту меню немає.** Специфікація ставить календар другою вкладкою «Стрічки», а 18a лишила для неї `FEED_TABS`. Меню лишається з сімома пунктами. Пункт «Стрічка» вже активний на `under('/feed')`.
- **Стан події обчислюється, а не зберігається:** `CALENDAR_STATES = ['planned', 'open', 'played', 'missed', 'cancelled']`. Перша умова, що справдилась, перемагає:
  1. `cancelled_at` не null → `cancelled`;
  2. рядок `game` з `id = game_id` має `status = 'finished'` → `played`;
  3. кімната `game_id` жива в цьому процесі (`manager.get(game_code)?.id === game_id` і фаза не `finished`) → `open`;
  4. `now >= starts_at + 6 год` (`CALENDAR_MISSED_AFTER_MS = 21_600_000`) → `missed`;
  5. інакше → `planned`.
  - Позначки «не відбулась» у базі немає, тож таймер не потрібен і нічого не губиться після рестарту.
  - Перевірку кімнати подає `CalendarProbe` з `RoomManager`. Так `calendar-store` не залежить від кімнат і тестується без них.
- **Одна гра на подію:**
  - поки кімната жива (`open`), повторне «Відкрити гру» віддає ту саму кімнату (200 з токенами ведучого). Подвійний клік другої кімнати не створює;
  - після гри (`played`) відкрити вже не можна;
  - якщо кімната зникла, а гру не зіграли (лобі закрилось, гра обірвалась, рестарт без 9b), стан повертається в `planned`. До межі в 6 годин ведучий може відкрити нову кімнату, і подія перепише `game_id` / `game_code`. Так невдала спроба не «спалює» вечір.
- **Видимість** — єдиний фільтр `calendarVisibility(viewerId)`: `host_id = viewer` **або** `exists follow(follower_id = host_id, followee_id = viewer)`, плюс `notHidden(host_id)` з 18a (гачок для бану #23).
  - Через цей фільтр ідуть список, одна подія, запит на участь і гілка `planned` у стрічці.
  - Якщо ведучий прибрав людину з друзів, подія для неї зникає одразу. Її запит → 404. Так само поводяться запрошення: «ведучий, який прибрав запрошеного з друзів, уже не запрошує його».
  - Ведучий у своїй події бачить **усі** запити, зокрема від тих, кого вже прибрав: вирішує він.
- **Що бачить хто:**
  - назву, час, ведучого, назву вікторини (`quiz.title` через join; видалена вікторина → `null`, «Вікторину видалено»), стан, кількість підтверджених і свій запит — усі, хто бачить подію;
  - `quizId`, список запитів і `joinCode` — лише ведучий;
  - `joinCode` бачить ще й підтверджений, коли стан `open`. Іншим код не віддається: «решта друзів бачить подію без кнопки».
- **Запит на участь** (`calendar_request`, ключ `(event_id, user_id)`, `CALENDAR_REQUEST_STATUSES = ['pending', 'approved', 'rejected']`):
  - подати можна в стані `planned` або `open`, інакше 409 `event_closed`. Свій же подія → 403 `own_event`. Повтор у `pending` / `approved` повертає той самий статус (ідемпотентно);
  - відхилений не може подати знову: 409 `request_rejected`, без спаму ведучому;
  - скасувати (видалити рядок) можна лише `pending`. `approved` → 409 `request_approved`, як у специфікації («поки його не підтвердили»);
  - ведучий може змінити рішення (approved ↔ rejected), поки подія не `played` / `cancelled`. `decided_at = now` щоразу;
  - **ліміт місць на потім:** підтверджені — це рядки `approved`, упорядковані за `decided_at`. Майбутній `capacity` на `calendar_event` лише обмежить, скільки їх може бути. Колонки зараз не додаємо (YAGNI).
- **Зміна й скасування:**
  - змінити (назву, час, вікторину) можна лише в стані `planned`. В інших станах → 409 `event_locked`;
  - запити після зміни лишаються як є, а `edited_at = now`. Учасники бачать «Змінено», і в них загоряється бейдж;
  - скасувати можна в будь-якому стані, крім `played`. Скасування ставить `cancelled_at`. Кімната, якщо вона є, живе далі сама. Рядок `planned` у стрічці видаляється;
  - скасовану подію бачать лише ведучий і ті, хто мав запит (`pending` / `approved`), до межі вікна. Решта друзів її більше не бачить.
- **Вікно календаря:** `starts_at > now − 6 год` або стан `open`. Порядок — `starts_at asc, id asc`, не більше `CALENDAR_LIST_CAP = 100`. `missed` за означенням поза вікном. `played` у вікні показується з позначкою «Зіграно» без кнопок.
- **Час.**
  - Сервер приймає й віддає ISO в UTC (`timestamptz`). Перевірка під час створення й зміни: `now < startsAt <= now + CALENDAR_MAX_AHEAD_DAYS (365) днів`, інакше 400 `calendar_time`.
  - Веб показує й групує в поясі глядача (`viewerZone()`: `Intl…resolvedOptions().timeZone`, запасний — `Europe/Kyiv`, з обходом `Europe/Kiev`, як у `format.ts`).
  - Поле `datetime-local` перетворюється в UTC **явно за поясом** (`localInputToIso(value, zone)`), а не через `new Date(value)`. Так тести не залежать від пояса машини, а переходи літнього часу передбачувані.
  - Неіснуюча мить весни (03:30 29.03 у Києві) зсувається на годину вперед. Двозначна мить осені (03:30 25.10) береться за зимовим часом.
- **Стрічка:** новий вид `planned` у `FEED_KINDS`.
  - Під час створення події пишеться рядок `feed_event` з ключем `planned:<eventId>`, `user_id = host`, `at = created_at = now`, `data = { kind: 'planned', eventId, title, startsAt }`. Під час зміни оновлюється лише `data` (`created_at` не міняється, тож бейдж «нових подій» не загоряється вдруге). Скасування видаляє рядок.
  - Гілка видимості `feedVisibility`: `kind = 'planned'` → бачить `user_id = viewer` або той, кого `user_id` має в друзях. Інші види — як у 18a (взаємні друзі).
  - Картка: «запланував(-ла) «Назва» на субота, 7 листопада, 19:00» і посилання «До календаря» → `/feed/calendar#event-<id>`.
  - ❤️ під карткою `planned` працює як 18a (вид `event`, `eventKey = planned:<id>`), коду не треба.
- **Бейдж** (`GET /api/me/feed/badge` → `FeedBadge`), обидва лічильники до `FEED_BADGE_CAP + 1`:
  - `requests` — `pending`-запити до **моїх** подій, де `cancelled_at is null`, `starts_at > now − 6 год` і гра не `finished`. Переглядом не гасне: гасне лише рішенням;
  - `decisions` — **мої** запити (`pending` / `approved`, видима подія у вікні), де `decided_at > seen`, `edited_at > seen` або `cancelled_at > seen`. Тут `seen = coalesce(profile.calendar_seen_at, '-infinity')`. Окремо рахується відхилений запит з `decided_at > seen`. Одна подія дає щонайбільше 1;
  - «переглянуто»: `GET /api/me/calendar` повертає `asOf`, веб шле `POST /api/me/calendar/seen { upTo: asOf }`. Логіка та сама, що `markFeedSeen`: `greatest(…, least(upTo, now))`;
  - вкладка «Календар»: `badge: (b) => b.requests + b.decisions`. Меню: `feedBadgeTotal` (уже сума).
- **Гачок для Web Push (підпроєкт 4):** `CalendarDeps.notify?: CalendarNotify`, де `interface CalendarNotify { opened(eventId: string): void; cancelled(eventId: string): void }`. Типово нічого не робить. Маршрути кличуть його після успішного запису. Нагадування «за 1 годину» та позначки «надіслано» (`reminded_at` тощо) додасть підпроєкт 4 своєю міграцією. Тут їх **немає**.
- **`/play/<код>`:** у застосунку маршрут `/play/:code`. Специфікаційне `/play?code=…` — це той самий екран входу.
- **Тексти** — лише українські. В `apps/web/src/i18n.ts` є один словник `uk`: англійських значень у проєкті немає, тож і ми їх не додаємо. Тон «ти», роди «запланував(-ла)».

## Гачки на потім (не будуємо зараз)

- **Web Push:** `CalendarNotify` (відкрито, скасовано). Нагадування за годину й підписки з'являться окремою міграцією.
- **Ліміт учасників:** колонка `capacity` і перевірка в `decideRequest` (порядок `decided_at`).
- **Бан #23:** `notHidden(host_id)` уже в `calendarVisibility`.

## Глобальні обмеження

- **Приватність (анти-ціль):** подію бачать лише ведучий і ті, кого він має в друзях. Перевіряє сервер (`calendarVisibility`), а не інтерфейс. Список запитів, `quizId` і код кімнати не потрапляють до тих, кому не належать (див. «Що бачить хто»). Запити підтверджує чи відхиляє лише ведучий: чужий ведучий → 404.
- `GAME_STATE_VERSION` = 22 без змін. Рушій, `GameState`, `Room`, `restore.test.ts` не змінюються.
- Меню телефона: ті самі сім пунктів, ≤ 60 px заввишки на 360 і 375 px. Восьмого пункту немає. Меню на ігрових екранах не додаємо.
- Жодного контенту про росію (правило власника): e2e-вікторина про Україну, відповіді «так»/«ні» змішані.
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts` через `t()` / `countText()` / `errorText()`, тон «ти», коротко.
- Час: зберігається UTC, показується в поясі глядача. Кожен помічник часу приймає пояс параметром, тести фіксують `Europe/Kyiv`.
- Телефон 375 px без горизонтальної прокрутки.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і тести:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=2 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- e2e: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 19a"`, **лише на передньому плані**. Кадри — `apps/server/e2e/artifacts/shots/p19a-*`.
- Кожен коміт закінчується рядками:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1
  ```
- Після останньої задачі й фінальної рецензії — злити в `main` і запушити (версія стану не змінюється).

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/calendar.ts` (новий), `calendar.test.ts` (новий), `feed.ts`, `feed.test.ts`, `index.ts`; `apps/web/src/feed/feed-text.ts` (мінімальна гілка) | типи, константи, схеми; вид `planned` | 1 |
| `apps/server/drizzle/0025_calendar.sql` + `meta`, `src/db/schema.ts` | `calendar_event`, `calendar_request`, `profile.calendar_seen_at` | 2 |
| `apps/server/src/calendar-store.ts` (новий), `calendar-store.test.ts` (новий) | стан, видимість, читання, створення, зміна, скасування, рядок стрічки | 3 |
| `apps/server/src/calendar-store.ts`, `calendar-requests.test.ts` (новий), `feed-store.ts`, `feed-store.test.ts` | запити, рішення, бейдж, «переглянуто», гілка `planned` у стрічці | 4 |
| `apps/server/src/calendar-routes.ts` (новий), `calendar-routes.test.ts` (новий), `feed-routes.ts`, `feed-routes.test.ts`, `app.ts` | HTTP, «Відкрити гру», бейдж, гачок `notify` | 5 |
| `apps/web/src/calendar/calendar-time.ts` (новий) + тест, `api.ts`, `feed/FeedTabs.tsx`, `feed/feed-text.ts`, `feed/FeedCard.tsx` + тести, `AppRoutes.tsx` + тест, `i18n.ts` | час, API, вкладка, маршрут, картка `planned` | 6 |
| `apps/web/src/calendar/CalendarForm.tsx`, `calendar/CalendarCard.tsx`, `pages/Calendar.tsx` (нові) + тести; `i18n.ts`, `styles.css` | сторінка календаря | 7 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 19a | 8 |

## Порядок збирання

- Shared: 1.
- Сервер по черзі (спільні `schema.ts`, `calendar-store.ts`, `app.ts`): 2 → 3 → 4 → 5.
- Веб (спільні `i18n.ts`): 6 → 7.
- Наприкінці 8.
- **Навмисні зміни наявних очікувань** (лише ці; інший червоний старий тест рецензент розбирає як регресію):
  - `feed.test.ts`: `FEED_KINDS` має в кінці `'planned'`;
  - `feed-store.test.ts` / `feed-routes.test.ts`: очікування `requests: 0, decisions: 0` лишаються правильними для людей без подій. Нові випадки додаються, старі не змінюються;
  - `FeedTabs` / `Feed.test.tsx`: смуга вкладок має дві вкладки («Події друзів», «Календар»).

## На що дивитися рецензентові (Review Focus)

1. **Ведучий прибрав друга, який подав запит чи вже підтверджений.** Подія зникає з календаря й стрічки цієї людини. Її `POST/DELETE …/request` → 404. Ведучий і далі бачить її запит у списку й може його відхилити. Тест — задача 4 (`calendar-requests.test.ts`) і задача 5 (маршрут).
2. **Пояс і перехід літнього часу.** Подія «25.10.2026 00:30» за Києвом (`2026-10-24T21:30:00.000Z`) стоїть у дні 25 жовтня, а не 24-го. Введення `2026-10-25T03:30` дає `2026-10-25T01:30:00.000Z`, а `2026-03-29T03:30` дає `2026-03-29T01:30:00.000Z`. Тест — задача 6 (`calendar-time.test.ts`).
3. **Подвійне «Відкрити гру» і кімната, що зникла в лобі.** Два паралельні запити дають одну кімнату. Кімнату закрили до старту → подія знову `planned`, а «Відкрити гру» створює нову й переписує `game_code`. Після `finished` → 409 `event_locked`. Тест — задача 5.
4. **Зміна події з підтвердженими.** Підтвердження лишаються, `edited_at` ставиться, бейдж `decisions` учасника = 1, а після `markCalendarSeen` — 0. Зміна в стані `open` / `played` / `missed` → `event_locked`. Тест — задачі 3 і 4.
5. **Межа «не відбулась».** `starts_at + 6 год − 1 мс` → `planned`, рівно `+ 6 год` → `missed`, і подія зникає зі списку. Жива кімната тримає `open` і після межі. Тест — задача 3.

---

### Задача 1. Shared: типи календаря, схеми, вид `planned`

**Files:**
- Create: `packages/shared/src/calendar.ts`, `packages/shared/src/calendar.test.ts`
- Modify: `packages/shared/src/feed.ts`, `packages/shared/src/feed.test.ts`, `packages/shared/src/index.ts`, `apps/web/src/feed/feed-text.ts` (мінімальна гілка `planned`, щоб компілювалось; справжній текст — задача 6)

**Interfaces:**
- Produces (`calendar.ts`):
  ```ts
  export const CALENDAR_MISSED_AFTER_MS = 6 * 3_600_000;
  export const CALENDAR_MAX_AHEAD_DAYS = 365;
  export const CALENDAR_TITLE_MAX = 80;
  export const CALENDAR_LIST_CAP = 100;
  export const CALENDAR_STATES = ['planned', 'open', 'played', 'missed', 'cancelled'] as const;
  export type CalendarState = (typeof CALENDAR_STATES)[number];
  export const CALENDAR_REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const;
  export type CalendarRequestStatus = (typeof CALENDAR_REQUEST_STATUSES)[number];
  export interface CalendarRequest { user: ProfileCard; status: CalendarRequestStatus; at: string /* requested_at ISO */ }
  export interface CalendarEvent {
    id: string;
    title: string;
    startsAt: string;            // ISO UTC
    host: ProfileCard;
    mine: boolean;               // я ведучий
    quiz: { id: string | null /* лише ведучому */; title: string | null /* null — видалено */ };
    state: CalendarState;
    editedAt: string | null;
    cancelledAt: string | null;
    approved: number;            // скільки підтверджено
    myRequest: CalendarRequestStatus | null; // для ведучого завжди null
    requests: CalendarRequest[] | null;      // лише ведучому, pending першими, далі за requested_at
    joinCode: string | null;     // ведучому чи approved і лише в стані open
  }
  export interface CalendarPage { events: CalendarEvent[]; asOf: string }
  /** title: trim, 1…CALENDAR_TITLE_MAX, isStorable; startsAt: ISO (Date.parse); quizId: uuid; .strict(). Межі часу перевіряє сервер (потрібне now). */
  export const calendarInputSchema: z.ZodType<{ title: string; startsAt: string; quizId: string }>;
  export type CalendarInput = z.infer<typeof calendarInputSchema>;
  export const calendarDecisionSchema: z.ZodType<{ decision: 'approved' | 'rejected' }>; // .strict()
  ```
- `feed.ts`: `FEED_KINDS = ['game', 'achievement', 'level', 'prize', 'like', 'planned']`, до `FeedData` додати `| { kind: 'planned'; eventId: string; title: string; startsAt: string }`. Коментар над `FeedBadge` змінити на «requests — запити до моїх подій, decisions — рішення й зміни за моїми запитами (19a)».
- `feed-text.ts`: тимчасово `case 'planned': return data.title;` і `feedIcon` → `'📅'` з коментарем `// 19a: задача 6`.

- [ ] **Step 1: Write the failing test** `calendar.test.ts`:
  - `calendarInputSchema.parse({ title: '  Вечір загадок ', startsAt: '2026-11-07T17:00:00.000Z', quizId: '<uuid>' }).title` → `'Вечір загадок'`;
  - відхиляє `title: '   '`, `title` на 81 символ, `startsAt: 'завтра'`, `quizId: 'q1'` і зайвий ключ;
  - `calendarDecisionSchema` приймає `{ decision: 'approved' }`, відхиляє `{ decision: 'maybe' }`;
  - `CALENDAR_MISSED_AFTER_MS` = `21_600_000`; `CALENDAR_STATES` = `['planned', 'open', 'played', 'missed', 'cancelled']`.
  - `feed.test.ts`: `FEED_KINDS` = `['game', 'achievement', 'level', 'prize', 'like', 'planned']`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared/src/calendar.test.ts packages/shared/src/feed.test.ts` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсами; `export * from './calendar'` в `index.ts`; мінімальна гілка у `feed-text.ts`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared apps/web/src/feed/feed-text.ts
  git commit -m "feat(shared): calendar — event, request and state types, limits, the input and decision payloads, and the planned feed kind

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 2. База: `calendar_event`, `calendar_request`, позначка перегляду

**Files:**
- Create: `apps/server/drizzle/0025_calendar.sql` + `meta/0025_snapshot.json`, `_journal.json` (з `apps/server`: `pnpm exec drizzle-kit generate --name calendar`)
- Modify: `apps/server/src/db/schema.ts`
- Test: `apps/server/src/calendar-store.test.ts` (створюється тут, перші випадки про схему)

**Interfaces:**
- `schema.ts`:
  ```ts
  /** Запланована гра (19a). Стан обчислюється (calendarState), не зберігається. */
  export const calendarEvent = pgTable('calendar_event', {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: text('host_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** Вікторину видалили — null, подія лишається («Вікторину видалено»). */
    quizId: uuid('quiz_id').references(() => quiz.id, { onDelete: 'set null' }),
    startsAt: at('starts_at').notNull(),
    /** Остання кімната події: room.id і room.code; без FK (гра пишеться лише після лобі). */
    gameId: uuid('game_id'),
    gameCode: text('game_code'),
    editedAt: at('edited_at'),
    cancelledAt: at('cancelled_at'),
    createdAt: at('created_at').notNull(),
  }, (table) => [
    index('calendar_event_host_starts_idx').on(table.hostId, table.startsAt),
    index('calendar_event_starts_idx').on(table.startsAt),
  ]);
  /** Запит на участь; ключ — (подія, людина). */
  export const calendarRequest = pgTable('calendar_request', {
    eventId: uuid('event_id').notNull().references(() => calendarEvent.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').$type<CalendarRequestStatus>().notNull(),
    requestedAt: at('requested_at').notNull(),
    decidedAt: at('decided_at'),
  }, (table) => [
    primaryKey({ columns: [table.eventId, table.userId] }),
    index('calendar_request_user_idx').on(table.userId),
  ]);
  ```
  - `profile`: `calendarSeenAt: at('calendar_seen_at')` з коментарем «Календар переглянуто до цієї миті (19a): decisions рахує зміни пізніше; null — ще ні».
- Міграцію лише генерувати, руками нічого не дописувати: наявних даних немає.

- [ ] **Step 1: Write the failing test** `calendar-store.test.ts` (PGlite, `createTestDb`; користувачі — як у `feed-store.test.ts`):
  - вставка `calendarEvent` без `gameId` / `quizId` проходить, `cancelledAt` null;
  - друга вставка `calendarRequest` з тим самим `(eventId, userId)` → помилка унікальності;
  - видалення вікторини → `calendar_event.quiz_id` стає null, подія лишається;
  - видалення ведучого → події й запити зникають (cascade);
  - текст `drizzle/0025_calendar.sql` містить `CREATE TABLE "calendar_event"`, `CREATE TABLE "calendar_request"` і `ADD COLUMN "calendar_seen_at"`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/calendar-store.test.ts` → FAIL.
- [ ] **Step 3: Implement** схему, згенерувати міграцію (у журналі `idx: 25`, `tag: "0025_calendar"`).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/drizzle apps/server/src/db/schema.ts apps/server/src/calendar-store.test.ts
  git commit -m "feat(db): calendar events with the room they opened, join requests keyed by event and person, and the profile's calendar seen mark

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 3. Сховище календаря: стан, видимість, читання, створення, зміна, скасування

**Files:**
- Create: `apps/server/src/calendar-store.ts`
- Modify: `apps/server/src/calendar-store.test.ts`

**Interfaces:**
- Consumes: `calendarEvent`, `calendarRequest`, `follow`, `profile`, `quiz`, `game`, `feedEvent` (задача 2); `notHidden` з `feed-store.ts`; `CalendarEvent`, `CalendarPage`, `CalendarInput`, константи (задача 1); `ensureProfile` (`profiles.ts`) для `ProfileCard` ведучого.
- Produces:
  ```ts
  /** true — кімната з цим id жива тут і не у finished. */
  export type CalendarProbe = (gameId: string, code: string) => boolean;
  export const noRooms: CalendarProbe; // () => false, для тестів і читань без менеджера
  type EventRow = typeof calendarEvent.$inferSelect;
  export type Fail<E extends string> = { ok: false; error: E };
  /** Чиста функція: порядок умов — як у «Рішеннях». finished — рядок game з id = game_id має status 'finished'. */
  export function calendarState(row: Pick<EventRow, 'cancelledAt' | 'startsAt' | 'gameId' | 'gameCode'>, now: Date, probe: CalendarProbe, finished: boolean): CalendarState;
  /** now < startsAt <= now + CALENDAR_MAX_AHEAD_DAYS. */
  export function startsAtAllowed(startsAt: Date, now: Date): boolean;
  /** host = viewer або host має viewer у друзях; notHidden(host). */
  export function calendarVisibility(viewerId: string): SQL;
  /** Вікно календаря (див. «Рішення»), видимі глядачу; скасовані — лише ведучому й тим, хто мав pending/approved. */
  export async function listCalendar(db: Db, viewerId: string, now: Date, probe: CalendarProbe): Promise<CalendarPage>;
  /** Видима глядачу подія (без вікна) або null. */
  export async function calendarEventFor(db: Db, viewerId: string, eventId: string, now: Date, probe: CalendarProbe): Promise<CalendarEvent | null>;
  /** Сирий рядок ведучого з обчисленим станом; чужа чи не uuid → null. */
  export async function hostedEvent(db: Db, hostId: string, eventId: string, now: Date, probe: CalendarProbe): Promise<{ row: EventRow; state: CalendarState } | null>;
  /** Вікторина — своя (getQuiz); пише calendar_event і feed_event planned:<id> в одній транзакції. */
  export async function createEvent(db: Db, hostId: string, input: CalendarInput, now: Date): Promise<{ ok: true; id: string } | Fail<'quiz_not_found' | 'calendar_time'>>;
  /** Лише в стані planned; edited_at = now; оновлює data рядка planned (created_at не чіпає). */
  export async function updateEvent(db: Db, hostId: string, eventId: string, input: CalendarInput, now: Date, probe: CalendarProbe): Promise<{ ok: true } | Fail<'not_found' | 'quiz_not_found' | 'calendar_time' | 'event_locked'>>;
  /** Будь-який стан, крім played; повторне — ok без змін; видаляє рядок planned стрічки. */
  export async function cancelEvent(db: Db, hostId: string, eventId: string, now: Date, probe: CalendarProbe): Promise<{ ok: true; changed: boolean } | Fail<'not_found' | 'event_locked'>>;
  /** Запам'ятати кімнату події. */
  export async function attachGame(db: Db, eventId: string, gameId: string, code: string): Promise<void>;
  ```
  - `listCalendar` і `calendarEventFor` збирають `CalendarEvent` одним шляхом (`toCalendarEvent`). Ведучий — `ProfileCard` з join `profile`/`user`, як у `feed-store` (`coalesce(nickname, user.name, '')`). `approved` — `count(*) filter (status = 'approved')`. Список запитів — окремим запитом лише для подій, де `host_id = viewer`, однаково для всієї сторінки (не по запиту на подію).
  - `finished` — `left join game on game.id = calendar_event.game_id` і `game.status = 'finished'`.
  - Вікно в SQL: `starts_at > now − 6 год` **або** `game_id is not null`. Потім у JS лишаються ті, де `starts_at > now − 6 год` або стан `open`, і застосовується `CALENDAR_LIST_CAP`.

- [ ] **Step 1: Write the failing tests** (`calendar-store.test.ts`; ведучий `h`, Оля `o`, Петро `p`, Віра `v`; `h → o`, `h → p`, `v → h`; вікторина «Писанки» автора `h`; `now = 2026-11-02T10:00:00.000Z`):
  - `calendarState`:
    - `{ startsAt: now + 1 год }` → `planned`;
    - **Review Focus 5:** `startsAt = now − 6 год + 1 мс` → `planned`, а `startsAt = now − 6 год` → `missed`;
    - з `gameId`/`gameCode` і `probe → true` при `startsAt = now − 7 год` → `open`;
    - `finished = true` → `played`, навіть якщо `probe → true`;
    - `cancelledAt` не null → `cancelled` попри все інше;
    - з `gameId`, `probe → false`, `finished = false`, `startsAt = now + 1 год` → `planned` (кімната зникла).
  - `startsAtAllowed`: `now` → false, `now + 1 мс` → true, `now + 365 д` → true, `now + 365 д + 1 мс` → false.
  - `createEvent(h, { title: 'Вечір загадок', startsAt: '2026-11-07T17:00:00.000Z', quizId: писанки })` → ok. Є рядок `feed_event` з `key: 'planned:<id>'`, `kind: 'planned'`, `user_id: h`, `data: { kind: 'planned', eventId, title: 'Вечір загадок', startsAt: '2026-11-07T17:00:00.000Z' }`. Чужа вікторина → `quiz_not_found`. Минулий час → `calendar_time`.
  - **видимість:** `listCalendar(o)` і `listCalendar(p)` бачать подію (`mine: false`, `quiz: { id: null, title: 'Писанки' }`, `requests: null`, `joinCode: null`). `listCalendar(v)` — порожньо (Віра додала `h`, а він її ні). `listCalendar(h)` — `mine: true`, `quiz.id` є, `requests: []`. `calendarEventFor(v, id)` → `null`. Після видалення `h → o` → `listCalendar(o)` порожньо.
  - вікно: подія з `startsAt = now − 7 год` без гри — немає у списку. Та сама з `gameId`, а `probe → true` — є, `state: 'open'`. Порядок трьох подій — за `startsAt` зростанням.
  - `updateEvent` у `planned` → ok, `editedAt = now`. Рядок `planned` у стрічці має новий `title`/`startsAt`, а `created_at` той самий. **Review Focus 4:** у стані `open` (`probe → true`) → `event_locked`, у `missed` → `event_locked`. Чужий ведучий → `not_found`.
  - `cancelEvent` → `changed: true`, `cancelledAt = now`, рядка `planned:<id>` у `feed_event` немає. Повторне → `changed: false`. У стані `played` → `event_locked`. Скасовану бачить `h`, а `o` без запиту — ні (з запитом — задача 4).
  - видалена вікторина → `quiz: { title: null }`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/calendar-store.test.ts` → FAIL.
- [ ] **Step 3: Implement** `calendar-store.ts`. `calendarVisibility` — `sql\`(${calendarEvent.hostId} = ${viewerId} or exists (select 1 from ${follow} where ${follow.followerId} = ${calendarEvent.hostId} and ${follow.followeeId} = ${viewerId})) and ${notHidden(calendarEvent.hostId)}\``.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/src/calendar-store.ts apps/server/src/calendar-store.test.ts
  git commit -m "feat(server): calendar store — a computed event state with the six-hour missed mark, visibility for the host's friends, the calendar window, and create, edit and cancel that keep the planned feed row in step

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 4. Запити, рішення, бейдж і подія `planned` у стрічці

**Files:**
- Create: `apps/server/src/calendar-requests.test.ts`
- Modify: `apps/server/src/calendar-store.ts`, `apps/server/src/feed-store.ts`, `apps/server/src/feed-store.test.ts`

**Interfaces:**
- Consumes: усе з задачі 3.
- Produces (`calendar-store.ts`):
  ```ts
  /** Видима подія в стані planned|open; не ведучий; ідемпотентно для pending/approved. */
  export async function requestToJoin(db: Db, userId: string, eventId: string, now: Date, probe: CalendarProbe): Promise<{ ok: true; status: CalendarRequestStatus } | Fail<'not_found' | 'own_event' | 'event_closed' | 'request_rejected'>>;
  /** Видаляє лише pending; запиту немає чи подія не видна → not_found. */
  export async function withdrawRequest(db: Db, userId: string, eventId: string, now: Date): Promise<{ ok: true } | Fail<'not_found' | 'request_approved'>>;
  /** Лише ведучий; подія не played / cancelled; status і decided_at = now. */
  export async function decideRequest(db: Db, hostId: string, eventId: string, userId: string, decision: 'approved' | 'rejected', now: Date, probe: CalendarProbe): Promise<{ ok: true } | Fail<'not_found' | 'event_locked'>>;
  /** Обидва до FEED_BADGE_CAP + 1; правила — «Рішення → Бейдж». */
  export async function calendarBadge(db: Db, viewerId: string, now: Date): Promise<{ requests: number; decisions: number }>;
  /** calendar_seen_at = greatest(coalesce(…, '-infinity'), least(upTo, now)); ensureProfile. */
  export async function markCalendarSeen(db: Db, viewerId: string, upTo: Date, now: Date): Promise<void>;
  ```
- `feed-store.ts`: `feedVisibility` дістає гілку виду:
  `((kind = 'planned' and (user_id = viewer or exists follow(follower = user_id, followee = viewer))) or (kind <> 'planned' and (user_id = viewer or user_id in mutual))) and notHidden(user_id) and at >= cutoff`.
  Коментар `// 21: календар` у `feedBadge` прибрати: `requests` / `decisions` тепер заповнює маршрут (задача 5), а `feedBadge` і далі повертає там нулі.

- [ ] **Step 1: Write the failing tests**
  - `calendar-requests.test.ts` (ті самі люди й `now`, подія `E` ведучого `h` на `now + 5 д`):
    - `requestToJoin(o, E)` → `pending`, повтор → `pending` (один рядок). `requestToJoin(h, E)` → `own_event`. `requestToJoin(v, E)` → `not_found`;
    - `withdrawRequest(o, E)` → ok, рядка немає. Знову `requestToJoin(o)` → `pending`;
    - `decideRequest(h, E, o, 'approved')` → ok, `decided_at = now`. `withdrawRequest(o, E)` → `request_approved`. `decideRequest(o, E, p, …)` (не ведучий) → `not_found`;
    - `decideRequest(h, E, p, 'rejected')` → `requestToJoin(p, E)` → `request_rejected`. Ведучий передумав (`approved`) → `listCalendar(p)` → `myRequest: 'approved'`;
    - скасована подія → `requestToJoin` → `event_closed`. `missed` → `event_closed`. `open` → `pending`;
    - `listCalendar(h)` → `requests` для `E`: спершу `pending`, далі інші за `requested_at`. `approved` = кількість підтверджених. `listCalendar(o)` → `myRequest: 'approved'`, `requests: null`;
    - **Review Focus 1:** `h` прибирає `o` з друзів → `listCalendar(o)` без `E`, `requestToJoin(o, E)` / `withdrawRequest(o, E)` → `not_found`, а `listCalendar(h)` і далі показує запит `o`. `decideRequest(h, E, o, 'rejected')` → ok;
    - скасована `E` видна `o` (мала `approved`) зі `state: 'cancelled'`, а `p` (`rejected`) — ні;
    - `joinCode`: `attachGame(E, g, '123456')` і `probe → true` → `o` (`approved`) отримує `'123456'`, `p` (`pending`) — `null`, `h` — `'123456'`;
    - **бейдж:**
      - `h` з двома `pending` → `{ requests: 2 }`. Після рішення по одному → 1. Подія `missed` чи `cancelled` свої `pending` не рахує;
      - `o`: `calendar_seen_at null`, запит підтверджено → `decisions: 1`. `markCalendarSeen(o, now)` → 0;
      - **Review Focus 4:** `updateEvent` о `now + 1 хв` → `decisions` для `o` (approved) = 1, для `p` (rejected) = 0. Знову `markCalendarSeen` → 0;
      - скасування → `o` = 1;
      - відхилення `p` → `p` = 1;
      - `markCalendarSeen(o, now − 1 год)` після `now` мітки не відкочує, а `upTo` у майбутньому стає `now`.
  - `feed-store.test.ts` (нові випадки):
    - рядок `planned` ведучого `h` (`h → o`, без `o → h`) → `feedPage(o)` містить його, `feedPage(v)` — ні (`v → h` в один бік не той напрям);
    - звичайна подія `game` ведучого `h` для `o` і далі невидима (не взаємні);
    - `feedBadge(o).events` рахує `planned`;
    - `visibleEvent(o, planned)` не null. Отже, ❤️ 18a під нею працює (`event`, `event_key = 'planned:<id>'`).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/calendar-requests.test.ts apps/server/src/feed-store.test.ts` → FAIL.
- [ ] **Step 3: Implement** функції запитів і бейджа, гілку `feedVisibility`. `decisions` — один запит `count(distinct event_id)` з `or` трьох умов, обрізаний підзапитом з `limit FEED_BADGE_CAP + 1`, як `feedBadge`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/server` → PASS (старі `feed-store`/`feed-routes` тести без змін).
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/src
  git commit -m "feat(server): calendar requests — ask, withdraw while pending, the host approves or rejects, a rejected person cannot ask again; badge counts for requests and decisions with a monotonic seen mark; planned events in the feed for the host's friends

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 5. HTTP: маршрути календаря, «Відкрити гру», бейдж

**Files:**
- Create: `apps/server/src/calendar-routes.ts`, `apps/server/src/calendar-routes.test.ts`
- Modify: `apps/server/src/app.ts`, `apps/server/src/feed-routes.ts`, `apps/server/src/feed-routes.test.ts`

**Interfaces:**
- Consumes: задачі 3–4; `getQuiz` (`quizzes.ts`); `RoomManager` (`create`, `get`, `size`, `frozen`); `calendarInputSchema`, `calendarDecisionSchema`, `feedSeenSchema` (shared).
- Produces:
  ```ts
  export interface CalendarNotify { opened(eventId: string): void; cancelled(eventId: string): void }
  export interface CalendarDeps {
    db: Db; manager: RoomManager; maxRooms: number;
    currentUser: (request: FastifyRequest) => Promise<CurrentUser | null>;
    now?: () => Date;
    /** Web Push (підпроєкт 4); типово нічого. */
    notify?: CalendarNotify;
  }
  export async function registerCalendarRoutes(app: FastifyInstance, deps: CalendarDeps): Promise<void>;
  /** probe з менеджера: manager.get(code)?.id === gameId і фаза не finished. */
  export function roomProbe(manager: RoomManager): CalendarProbe;
  ```
  - Маршрути (усі 401 `unauthorized` без акаунта; читання 60 / хв, запис 30 / хв на людину, ключ — як `perUser` у `feed-routes.ts`):

    | Маршрут | Успіх | Помилки |
    |---|---|---|
    | `GET /api/me/calendar` | `CalendarPage` | — |
    | `POST /api/me/calendar/seen` `{ upTo }` | 204 | 400 `invalid_payload` |
    | `POST /api/calendar` `CalendarInput` | 201 `CalendarEvent` | 400 `invalid_payload` / `calendar_time`, 404 `quiz_not_found` |
    | `PUT /api/calendar/:id` `CalendarInput` | 200 `CalendarEvent` | 400, 404 `not_found` / `quiz_not_found`, 409 `event_locked` |
    | `DELETE /api/calendar/:id` | 204; `notify.cancelled` лише коли `changed` | 404, 409 `event_locked` |
    | `POST /api/calendar/:id/request` | 200 `{ status }` | 403 `own_event`, 404, 409 `event_closed` / `request_rejected` |
    | `DELETE /api/calendar/:id/request` | 204 | 404, 409 `request_approved` |
    | `POST /api/calendar/:id/requests/:userId` `{ decision }` | 204 | 400, 404, 409 `event_locked` |
    | `POST /api/calendar/:id/open` | 201 нова / 200 та сама: `{ gameId, code, hostToken, stageToken }`; `notify.opened` лише для нової | 404 `not_found`, 404 `quiz_not_found` (вікторину видалено), 409 `event_locked` (`played`/`missed`/`cancelled`), 503 `server_busy` / `restarting` |

  - `open`: подія ведучого (`hostedEvent`). Стан `open` → кімната `manager.get(row.gameCode)` віддається як є. Стан `planned` → `getQuiz(db, hostId, row.quizId)`, ті самі перевірки `maxRooms` / `frozen`, що й `POST /api/games`, потім `manager.create(quiz, hostId, quizId)` і `attachGame`. Паралельні виклики однієї події серіалізуються в межах процесу (`Map<eventId, Promise>`): другий чекає першого й отримує його кімнату.
  - `feed-routes.ts`: `GET /api/me/feed/badge` повертає `{ events: (await feedBadge(…)).events, ...(await calendarBadge(…)) }` (`Promise.all`).
  - `app.ts`: `await registerCalendarRoutes(app, { db: options.db, manager, maxRooms, currentUser })` поруч з `registerFeedRoutes`.

- [ ] **Step 1: Write the failing test** `calendar-routes.test.ts` (за зразком `feed-routes.test.ts`: `buildApp` з PGlite, `signUp`; ведучий `h` з вікториною, `h → o`, `h → p`):
  - 401 на кожному маршруті без cookie;
  - `POST /api/calendar` з `startsAt` = через 2 дні → 201, `state: 'planned'`. `startsAt` у минулому → 400 `{ error: 'calendar_time' }`. Чужа вікторина → 404 `quiz_not_found`. Тіло з зайвим ключем → 400 `invalid_payload`;
  - `GET /api/me/calendar` для `o` → одна подія, `asOf` є. Для Віри — `events: []`;
  - `o` → `POST …/request` → `{ status: 'pending' }`. `h` → `GET /api/me/feed/badge` → `{ events: 0, requests: 1, decisions: 0 }`. `h` → `POST …/requests/<o> { decision: 'approved' }` → 204. `o` → бейдж `decisions: 1`, після `POST /api/me/calendar/seen { upTo: asOf }` → 0;
  - **Review Focus 1:** Віра → `POST …/request` → 404. `p` → `POST …/requests/<o>` → 404 (не ведучий);
  - **Review Focus 3:**
    - `h` → два паралельні `POST …/open` → один 201 і один 200 з тим самим `code`, `manager.size` +1, `notify.opened` один раз (шпигун у `deps`);
    - `o` → `GET /api/me/calendar` → `state: 'open'`, `joinCode` = код, а `p` (pending) → `joinCode: null`;
    - кімната зникла в лобі → `state: 'planned'`, і новий `open` → 201 з **іншим** `gameId`. Публічного методу закриття в `RoomManager` немає (`close` приватний, кімнату закриває таймер `expiry` через `scheduler`). Тому цей випадок — окремий `buildApp` з `scheduler` з `testing/fake-scheduler.ts`, що прокручує час до спливання лобі. Якщо так незручно, підійде `probe`-заглушка в `calendar-store`-тесті плюс маршрут із підміненим `manager.get`;
    - гру доведено до `finished` і рекордер записав `game` (`recorder.idle()`) → `state: 'played'`, `open` → 409 `event_locked`;
  - `PUT` у стані `open` → 409 `event_locked`. `DELETE` → 204 і `notify.cancelled` один раз; повторний `DELETE` → 204 без другого виклику;
  - `open` після видалення вікторини → 404 `quiz_not_found`;
  - `feed-routes.test.ts`: старий випадок бейджа (`{ events: 1, requests: 0, decisions: 0 }`) лишається зеленим без змін.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/calendar-routes.test.ts apps/server/src/feed-routes.test.ts` → FAIL.
- [ ] **Step 3: Implement** `calendar-routes.ts`, злиття бейджа, підключення в `app.ts`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/src
  git commit -m "feat(server): calendar routes — plan, edit and cancel, ask and decide, open one room per event that comes back on a second tap and can be reopened if it vanished before playing, real request and decision counts in the feed badge, and a notify hook for web push

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 6. Веб: час, API, вкладка «Календар», картка `planned`

**Files:**
- Create: `apps/web/src/calendar/calendar-time.ts`, `apps/web/src/calendar/calendar-time.test.ts`
- Modify: `apps/web/src/api.ts`, `apps/web/src/feed/FeedTabs.tsx`, `apps/web/src/feed/feed-text.ts`, `apps/web/src/feed/feed-text.test.ts`, `apps/web/src/feed/FeedCard.tsx`, `apps/web/src/feed/FeedCard.test.tsx`, `apps/web/src/AppRoutes.tsx`, `apps/web/src/AppRoutes.test.tsx`, `apps/web/src/i18n.ts`; заглушка `apps/web/src/pages/Calendar.tsx` (лише `FeedTabs` і `t('loading')`; справжня сторінка — задача 7)

**Interfaces:**
- `calendar-time.ts`:
  ```ts
  /** Пояс глядача; запасний Europe/Kyiv; ICU без Europe/Kyiv → Europe/Kiev. */
  export function viewerZone(): string;
  /** 'YYYY-MM-DD' дня в поясі (ключ групування). */
  export function dayKey(iso: string, zone: string): string;
  /** «субота, 7 листопада» (uk-UA, weekday long, day numeric, month long; рік — лише якщо не поточний у поясі). */
  export function dayHeading(iso: string, zone: string, now?: Date): string;
  /** «19:00». */
  export function timeText(iso: string, zone: string): string;
  /** 'YYYY-MM-DDTHH:mm' (значення datetime-local) у поясі → ISO UTC; погане значення → null. */
  export function localInputToIso(value: string, zone: string): string | null;
  /** ISO → 'YYYY-MM-DDTHH:mm' у поясі (для форми зміни й атрибута min). */
  export function isoToLocalInput(iso: string, zone: string): string;
  ```
  - `localInputToIso` — два проходи зміщення, бо інакше незрозуміло, що робити з переходами:
    ```ts
    const guess = Date.UTC(y, m - 1, d, hh, mm);
    const first = guess - offsetMs(guess, zone);   // offsetMs: (локальні поля Intl у zone як UTC) − instant
    return new Date(guess - offsetMs(first, zone)).toISOString();
    ```
- `api.ts`:
  ```ts
  export const getCalendar = () => request<CalendarPage>('/api/me/calendar');
  export const markCalendarSeen = (upTo: string) => request<object>('/api/me/calendar/seen', { method: 'POST', body: { upTo } });
  export const createCalendarEvent = (input: CalendarInput) => request<CalendarEvent>('/api/calendar', { method: 'POST', body: input });
  export const updateCalendarEvent = (id: string, input: CalendarInput) => request<CalendarEvent>(`/api/calendar/${id}`, { method: 'PUT', body: input });
  export const cancelCalendarEvent = (id: string) => request<object>(`/api/calendar/${id}`, { method: 'DELETE' });
  export const requestCalendarEvent = (id: string) => request<{ status: CalendarRequestStatus }>(`/api/calendar/${id}/request`, { method: 'POST' });
  export const withdrawCalendarRequest = (id: string) => request<object>(`/api/calendar/${id}/request`, { method: 'DELETE' });
  export const decideCalendarRequest = (id: string, userId: string, decision: 'approved' | 'rejected') => request<object>(`/api/calendar/${id}/requests/${encodeURIComponent(userId)}`, { method: 'POST', body: { decision } });
  export const openCalendarGame = (id: string) => request<{ gameId: string; code: string } & HostTokens>(`/api/calendar/${id}/open`, { method: 'POST' });
  ```
  (Метод і тіло — тим самим способом, що вже в `api.ts`. Якщо `request` бере метод з `body`, дотриматися наявного стилю.)
- `FeedTabs.tsx`: `FEED_TABS` дістає `{ to: '/feed/calendar', label: 'feedTabCalendar', badge: (b) => b.requests + b.decisions }`, коментар «#21 допише» прибрати.
- `AppRoutes.tsx`: `<Route path="/feed/calendar" element={<Calendar />} />` усередині `WithMenu`.
- `feed-text.ts`: `planned` → `t('feedPlanned', { title, when: \`${dayHeading(startsAt, viewerZone())}, ${timeText(startsAt, viewerZone())}\` })`, іконка `📅`. `feedText` дістає необов'язковий другий параметр `zone = viewerZone()` для тестів.
- `FeedCard.tsx`: для `planned` під текстом — `Link` «До календаря» на `/feed/calendar#event-<eventId>`.
- `i18n.ts`: `feedTabCalendar: 'Календар'`, `feedPlanned: 'запланував(-ла) «{title}» на {when}'`, `feedPlannedLink: 'До календаря'`.

- [ ] **Step 1: Write the failing tests**
  - `calendar-time.test.ts` (пояс `'Europe/Kyiv'` явно):
    - **Review Focus 2:**
      - `dayKey('2026-10-24T21:30:00.000Z', 'Europe/Kyiv')` → `'2026-10-25'`, `timeText(…)` → `'00:30'`;
      - `dayKey('2026-10-25T22:30:00.000Z', …)` → `'2026-10-26'`, `timeText` → `'00:30'`;
      - `localInputToIso('2026-11-07T19:00', 'Europe/Kyiv')` → `'2026-11-07T17:00:00.000Z'`;
      - `('2026-07-07T19:00')` → `'2026-07-07T16:00:00.000Z'`;
      - `('2026-10-25T03:30')` → `'2026-10-25T01:30:00.000Z'`;
      - `('2026-03-29T03:30')` → `'2026-03-29T01:30:00.000Z'`;
      - `('сміття')` → `null`;
    - `isoToLocalInput('2026-11-07T17:00:00.000Z', 'Europe/Kyiv')` → `'2026-11-07T19:00'`;
    - `dayHeading('2026-11-07T17:00:00.000Z', 'Europe/Kyiv', new Date('2026-11-02T10:00:00Z'))` → `'субота, 7 листопада'`. З `now` у 2025 році рядок містить `2026`;
    - `dayKey('2026-11-07T22:30:00.000Z', 'America/New_York')` → `'2026-11-07'` (пояс глядача, а не Київ).
  - `feed-text.test.ts`: `feedText({ kind: 'planned', eventId: 'e1', title: 'Вечір загадок', startsAt: '2026-11-07T17:00:00.000Z' }, 'Europe/Kyiv')` → `'запланував(-ла) «Вечір загадок» на субота, 7 листопада, 19:00'`, `feedIcon` → `'📅'`.
  - `FeedCard.test.tsx`: картка `planned` має посилання «До календаря» з `href` `/feed/calendar#event-e1` і ❤️ (чужа подія).
  - `AppRoutes.test.tsx`: `/feed/calendar` рендерить вкладки з двома посиланнями «Події друзів», «Календар». На `/feed/calendar` у «Календар» `aria-current="page"`, у «Події друзів» — ні (`end`). Пункт меню «Стрічка» активний.
  - `FeedTabs`: бейдж `{ events: 0, requests: 2, decisions: 1 }` → на «Календарі» «3», на «Подіях друзів» бейджа немає.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/calendar apps/web/src/feed apps/web/src/AppRoutes.test.tsx` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсами.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS (`Feed.test.tsx` оновити, якщо він перелічує вкладки, за «Навмисними змінами»).
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): explicit time-zone helpers for the calendar, the calendar API, the «Календар» tab with request and decision badges, its route, and the planned card in the feed

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 7. Веб: сторінка календаря, форма, картки подій

**Files:**
- Create: `apps/web/src/calendar/CalendarForm.tsx`, `apps/web/src/calendar/CalendarCard.tsx`, тести `calendar/CalendarForm.test.tsx`, `calendar/CalendarCard.test.tsx`, `pages/Calendar.test.tsx`
- Modify: `apps/web/src/pages/Calendar.tsx` (заглушка → сторінка), `apps/web/src/i18n.ts`, `apps/web/src/styles.css`

**Interfaces:**
- Consumes: API й часові помічники (задача 6); `listQuizzes`, `saveHost` (`storage.ts`, як у `Quizzes.tsx`), `usePrivateData`, `useFeedBadge`, `announceFeedSeen`, `FeedTabs`, `Avatar`, `Nick`, `errorText`, `countText`.
- Produces:
  ```ts
  export function CalendarForm(props: {
    initial?: CalendarEvent; quizzes: QuizSummary[]; zone: string; now: Date;
    onSubmit: (input: CalendarInput) => Promise<string | null>; // null — збережено, рядок — текст помилки
    onCancel: () => void;
  }): JSX.Element;
  export type CalendarAction = 'request' | 'withdraw' | 'open' | 'edit' | 'cancel' | { decide: string; decision: 'approved' | 'rejected' };
  export function CalendarCard(props: { event: CalendarEvent; zone: string; busy: boolean; onAction: (event: CalendarEvent, action: CalendarAction) => void }): JSX.Element;
  export function Calendar(): JSX.Element;
  ```
- **Сторінка:**
  - `FeedTabs`, кнопка «Запланувати гру», список днів `section.calendar-day > h2 (dayHeading) + ol > CalendarCard`;
  - перший успішний `getCalendar` → `markCalendarSeen(asOf)` → `announceFeedSeen()`;
  - після кожної дії список перечитується (простіше й правильніше за локальні латки: стан обчислює сервер);
  - `open` → `openCalendarGame` → `saveHost(code, tokens)` → `navigate(\`/host/${code}\`)`;
  - `cancel` — після `window.confirm(t('calendarCancelConfirm', { title }))`;
  - помилки — `errorText(error)` у `p.error[role=alert]` над списком;
  - гість → `/login?next=%2Ffeed%2Fcalendar`;
  - `#event-<id>` у адресі → прокрутка до картки (`id` на `li`).
- **Форма:**
  - поля «Назва» (`maxLength` 80);
  - «Дата й час» — `input type="datetime-local"`, `min` = `isoToLocalInput(now, zone)`;
  - «Вікторина» — `select` власних вікторин.
  - `onSubmit` дістає `{ title, startsAt: localInputToIso(value, zone), quizId }`. Без вікторин — `calendarNoQuizzes` з посиланням `/quizzes/new` замість форми.
- **Картка** (`li.calendar-card`, `id="event-<id>"`, `data-state`):
  - заголовок, «🕖 19:00», ведучий (`calendarYouHost` чи `calendarHost`), назва вікторини або `calendarQuizGone`;
  - `countText('calendarParticipants', approved)`; мітки стану `calendarLive` / `calendarPlayed` / `calendarCancelled`; `calendarEdited`, коли `editedAt` не null і подія не скасована;
  - **ведучий:**
    - `planned` → «Відкрити гру», «Змінити», «Скасувати подію»;
    - `open` → «До пульта» (та сама дія `open`), «Скасувати подію»;
    - список запитів: аватар, нік, статус, для `pending` — «Підтвердити» / «Відхилити», для вирішених — протилежна кнопка;
  - **друг:**
    - без запиту в `planned` / `open` → «Хочу взяти участь»;
    - `pending` → мітка «Запит надіслано» і «Скасувати запит»;
    - `approved` → «Підтверджено», а в `open` ще й посилання-кнопка «Приєднатися» на `/play/<joinCode>`;
    - `rejected` → «Відхилено» без кнопок;
  - `played` / `cancelled` — без кнопок дій.
- **Тексти** (`i18n.ts`):
  - `calendarNew: 'Запланувати гру'`, `calendarFieldTitle: 'Назва'`, `calendarFieldWhen: 'Дата й час'`, `calendarFieldQuiz: 'Вікторина'`, `calendarSave: 'Зберегти'`, `calendarFormCancel: 'Не зберігати'`;
  - `calendarEmpty: 'Тут з'являться ігри, які плануєш ти й друзі.'`, `calendarNoQuizzes: 'Щоб запланувати гру, спершу створи вікторину.'`, `calendarNoQuizzesLink: 'Нова вікторина'`, `calendarError: 'Не вдалося завантажити календар'`;
  - `calendarHost: 'Веде {nickname}'`, `calendarYouHost: 'Ти ведеш'`, `calendarQuizGone: 'Вікторину видалено'`;
  - `calendarParticipants_one/_few/_many: '{count} учасник' / '{count} учасники' / '{count} учасників'`;
  - `calendarRequest: 'Хочу взяти участь'`, `calendarWithdraw: 'Скасувати запит'`, `calendarPending: 'Запит надіслано'`, `calendarApproved: 'Підтверджено'`, `calendarRejected: 'Відхилено'`;
  - `calendarApprove: 'Підтвердити'`, `calendarReject: 'Відхилити'`, `calendarRequests: 'Запити'`;
  - `calendarOpen: 'Відкрити гру'`, `calendarToHost: 'До пульта'`, `calendarJoin: 'Приєднатися'`, `calendarEdit: 'Змінити'`, `calendarCancel: 'Скасувати подію'`, `calendarCancelConfirm: 'Скасувати «{title}»? Учасники побачать, що гри не буде.'`;
  - `calendarLive: 'Гра йде'`, `calendarPlayed: 'Зіграно'`, `calendarCancelled: 'Скасовано'`, `calendarEdited: 'Змінено'`;
  - помилки: `err_calendar_time: 'Обери час у майбутньому, не далі ніж за рік.'`, `err_event_locked: 'Цю подію вже не можна змінити.'`, `err_own_event: 'Це твоя подія.'`, `err_event_closed: 'Подія вже не приймає запитів.'`, `err_request_rejected: 'Ведучий уже відхилив запит.'`, `err_request_approved: 'Запит уже підтверджено.'`, `err_quiz_not_found: 'Вікторину не знайдено.'` (якщо `err_quiz_not_found` уже є — не дублювати).
- **Стилі:** `.calendar-day h2` (менший заголовок), `.calendar-card` (як `.feed-card`), кнопки дій в один ряд з переносом (`flex-wrap`), висота дотику ≥ 44 px, `overflow-wrap: anywhere` для назви й ніку.

- [ ] **Step 1: Write the failing tests** (`viewerZone` мокається на `'Europe/Kyiv'` через `vi.mock('../calendar/calendar-time', async (orig) => ({ ...(await orig()), viewerZone: () => 'Europe/Kyiv' }))`):
  - `CalendarForm.test.tsx`:
    - заповнити «Вечір загадок», `2026-11-07T19:00`, вікторину `q1` → `onSubmit({ title: 'Вечір загадок', startsAt: '2026-11-07T17:00:00.000Z', quizId: 'q1' })`;
    - `initial` з `startsAt '2026-11-07T17:00:00.000Z'` → поле має `'2026-11-07T19:00'`;
    - `min` = `isoToLocalInput(now)`;
    - `onSubmit` → `'Обери час…'` → текст у `role=alert`, форма лишається;
    - `quizzes: []` → посилання «Нова вікторина» на `/quizzes/new`, полів немає.
  - `CalendarCard.test.tsx`:
    - друг без запиту, `planned` → кнопка «Хочу взяти участь» → `onAction(event, 'request')`;
    - `pending` → «Запит надіслано» і «Скасувати запит» → `'withdraw'`;
    - `approved`, `open`, `joinCode '123456'` → посилання «Приєднатися» з `href '/play/123456'`;
    - `approved`, `planned` → «Підтверджено» без «Приєднатися»;
    - `rejected` → «Відхилено», кнопок немає;
    - ведучий `planned` з запитами `[pending Оля, approved Петро]` → «Підтвердити» біля Олі → `{ decide: olyaId, decision: 'approved' }`, «Відхилити» біля Петра; «Відкрити гру», «Змінити», «Скасувати подію» є;
    - ведучий `open` → «До пульта», без «Змінити»;
    - `cancelled` → «Скасовано», кнопок немає;
    - `editedAt` → «Змінено»;
    - `approved: 3` → «3 учасники»;
    - `quiz.title null` → «Вікторину видалено».
  - `Calendar.test.tsx` (мок `api`):
    - дві події 7 і 8 листопада та одна о `2026-11-07T21:30:00.000Z` (= 8-ме 23:30 Київ) → два заголовки дня, у другому дві картки за часом;
    - перший `getCalendar` → `markCalendarSeen(asOf)`, `FEED_CHANGED` розіслано;
    - «Хочу взяти участь» → `requestCalendarEvent('e1')` → `getCalendar` вдруге;
    - «Відкрити гру» → `openCalendarGame` → `loadHost('123456')` = токени, адреса `/host/123456`;
    - «Скасувати подію» з `confirm → false` → `cancelCalendarEvent` не викликано;
    - відмова `request_rejected` → `role=alert` «Ведучий уже відхилив запит.»;
    - порожньо → `calendarEmpty`;
    - «Запланувати гру» → форма → збереження → `createCalendarEvent` і перечитування;
    - вкладка «Календар» має `aria-current="page"`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/calendar apps/web/src/pages/Calendar.test.tsx` → FAIL.
- [ ] **Step 3: Implement** компоненти, сторінку, тексти, стилі.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): the calendar page — days in the viewer's time zone, planning and editing with a local date and time, ask and withdraw, the host approves or rejects, opens the game or returns to the panel, approved friends join, cancelled, played and edited marks

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 8. Наскрізний сценарій 19a

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Помічники беруться як є: `open`, `register`, `myId`, `join`, `shot`, `snapshot`, `expectPhoneFit`, `expectSevenItems18a`, `menuLinks`, `MENU`, `problems`, `classicRound`, `makeRoundsQuiz`, `click`, `exact`, `POLL`, `db`.
- `open(name, w, h, options)`: тип `options` розширюється до `{ reducedMotion?: 'reduce'; timezoneId?: string }`. Усі сторінки сценарію — `timezoneId: 'Europe/Kyiv'`.
- Дружба — тим самим шляхом, що в `feed18a` (кнопка «Додати в друзі» на `/profile/:id`):
  - Марко (ведучий) → Оля, Марко → Петро;
  - Віра → Марко (в один бік: Марко Віру не додавав);
  - Оля → Марко (взаємно, щоб перевірити, що Оля бачить і стрічку, і календар).
- Вікторина «Календар 19a»: один класичний раунд «Розминка», `time: 20`, `speedBonus: false`, `shuffleOptions: false`. Три запитання, id `c1`–`c3`, правильна відповідь перша:
  1. `single` «Яка річка тече через Київ?» (Дніпро, Дністер, Південний Буг, Десна);
  2. `boolean` «Говерла — найвища гора України?» → «так»;
  3. `boolean` «Одеса — столиця України?» → «ні».
- Екрани:
  - пульт 1280 × 800 (`host19a`, Марко Ведучий, акаунт);
  - сцена 1280 × 720 (`stage19a`);
  - Оля (`olya19a`), Петро (`petro19a`), Віра (`vira19a`) — акаунти, 375 × 812.
- Час події: «завтра о 19:00 за Києвом». Дата — `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' })` від `Date.now() + 86_400_000`, значення поля — `` `${date}T19:00` ``.

- [ ] **Step 1: Add the scenario** у кінець файлу за зразком 18a:
  ```ts
  it('part 19a: calendar — the menu keeps seven items, the host plans a game for tomorrow 19:00 Kyiv time, friends see it in the calendar tab and the feed while a one-way follower does not, Оля asks and is approved, Петро is rejected, an edit lights the badge, the host opens the game from the event and Оля joins from «Приєднатися», the event ends as played, and a cancelled event shows as cancelled to its participant', async () => {
    try {
      await calendar19a();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Кроки `calendar19a()`:**
  1. **Меню не змінилось.** Оля на `/`: `menuLinks(olya)` → `['Приєднатися', 'Стрічка', 'Мої вікторини', 'Історія', 'Призи', 'Досягнення', 'Профіль']`, `expectSevenItems18a(olya, 360)` і `(olya, 375)`.
  2. **Дружба** (див. вище). Вікторина через `POST /api/quizzes` ведучим.
  3. **План.**
     - Ведучий: «Стрічка» → вкладка «Календар» (`/feed/calendar`) → «Запланувати гру».
     - Назва «Вечір загадок», дата й час — завтра 19:00, вікторина «Календар 19a» → «Зберегти».
     - Картка під заголовком дня `dayHeading` завтрашньої дати (перевірити текстом, напр. містить назву місяця українською), час «19:00».
     - `expect.poll` на `calendar_event`: `starts_at`, відформатований `Intl` у `Europe/Kyiv`, дає `19:00`. Рядок `feed_event` з ключем `planned:<id>` є.
     - Кадр `p19a-host-calendar`.
  4. **Друзі бачать.**
     - Оля → `/feed`: картка «Марко Ведучий запланував(-ла) «Вечір загадок» на …, 19:00» з посиланням «До календаря». Клік → `/feed/calendar#event-<id>`, картка видна.
     - Кадр `p19a-olya-feed`.
     - Віра → `/feed/calendar` → `calendarEmpty`, `/feed` без картки `planned`. `POST /api/calendar/<id>/request` з її cookie → 404.
  5. **Запити.**
     - Оля: «Хочу взяти участь» → «Запит надіслано», «Скасувати запит» → знову «Хочу взяти участь» → тисне ще раз.
     - Петро: «Хочу взяти участь».
     - Ведучий: бейдж вкладки «Календар» = «2» (`expect.poll` з `reload`, бо опитування 30 с).
     - Кадр `p19a-host-requests` на 375 px (`host.setViewportSize`, повернути назад).
     - «Підтвердити» біля Олі, «Відхилити» біля Петра → бейдж вкладки зникає.
  6. **Рішення.**
     - Оля: бейдж меню «Стрічки» ≥ 1 → відкриває «Календар» → «Підтверджено». Після перезавантаження бейджа вкладки немає.
     - Петро: «Відхилено», кнопки «Хочу взяти участь» немає.
     - `expectPhoneFit(olya, 'p19a-olya-approved')`.
  7. **Зміна.**
     - Ведучий: «Змінити» → час 20:30 → «Зберегти».
     - Оля: після `reload` бейдж вкладки «Календар» = «1», картка «Змінено» і «20:30».
  8. **Гра з події.**
     - Ведучий: «Відкрити гру» → `/host/<код>`, сцена з посилання «Відкрити сцену».
     - Оля: `/feed/calendar` → «Приєднатися» → `/play/<код>` → `join` з ніком.
     - Петро: на картці немає «Приєднатися» і коду, але він заходить за кодом, як зараз (`join(petro, code, …)`).
     - Ведучий у календарі (друга вкладка `host`) бачить «До пульта». Тисне → той самий `/host/<код>` (кімнат не більшає).
     - Гра до фіналу (відповіді будь-які, як у 18a). `expect.poll` на `game.status = 'finished'`.
     - Ведучий на `/feed/calendar` → картка «Зіграно» без «Відкрити гру».
  9. **Скасування.**
     - Ведучий планує «Запасний вечір» на післязавтра 18:00. Оля просить участі, ведучий підтверджує.
     - Ведучий: «Скасувати подію» (`page.once('dialog', d => d.accept())`).
     - Оля: «Скасовано», бейдж вкладки = «1». У `/feed` картки «Запасний вечір» немає.
     - Віра такої події не бачить.
     - Кадр `p19a-cancelled`.
  10. **Не відбулась.**
      - Вставити в `db` подію ведучого з `starts_at = now − 7 год`, без гри.
      - Ведучий перезавантажує календар → її немає.
  11. `expect(problems).toEqual([])`.
- [ ] **Step 2: Run** на передньому плані: `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 19a"` → PASS. Переглянути кадри `p19a-*`:
  - дві вкладки в один рядок на 375 px, бейдж вкладки не налазить на текст;
  - заголовки днів українською, час 24-годинний;
  - кнопки дій переносяться без прокрутки вбік, висота дотику ≥ 44 px;
  - стани «Підтверджено», «Відхилено», «Скасовано», «Змінено» розрізняються не лише кольором (є текст).
- [ ] **Step 3: Повний прогін — один раз, на передньому плані:** `npx vitest run --config apps/server/e2e/vitest.config.ts` → усі сценарії PASS. Особливо:
  - сценарії з `menuLinks` (меню не змінилось);
  - 18a (стрічка з двома вкладками);
  - 9b (перезапуск).
  Якщо не вистачає пам'яті, прогнати групами за `-t` і сказати про це у звіті.
- [ ] **Step 4: Commit**
  ```bash
  git add apps/server/e2e
  git commit -m "test: part 19a end-to-end — the menu keeps seven items, a game planned for tomorrow 19:00 Kyiv time is seen by the host's friends only, ask, approve and reject, an edit lights the badge, the game opens from the event and the approved friend joins from it, played, cancelled and missed events

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```
