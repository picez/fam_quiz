# План 79. Навігація, етап 4 «Профіль, історія, групи»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** профіль без дублікатів меню — три підписані блоки; ліга видно зі списку груп і з профілю (2 дотики замість 4), гру для групи можна провести просто зі сторінки групи; «Історія» відкривається на тій вкладці, де людина справді має ігри, зіграні ігри відкриваються з результатами й власними відповідями; «Мої виклики» — окрема вкладка історії.

**Архітектура:** `ProfileTiles` малює три `section` з `h2` усередині `nav.profile-tiles`. Ліга в списку груп — нове необов'язкове поле `GroupCard.league` (`{ place: number | null; points: number }`), яке `GET /api/groups` дописує однією функцією `myLeagueSpots` (`league-store.ts`, лише читання, поточний місяць за Києвом). «Провести гру для групи» — `/create?group=<id>`: `useStartGame(quizId, groupId)` після створення кімнати викликає наявний `PUT /api/games/by-code/:code/league` (той самий вибір, що й у лобі), без змін рушія чи стану гри. Зіграна гра — нова точка лише для читання `GET /api/me/history/:id` → `PlayedGameDetail` і сторінка `/me/:id`. Вкладка історії за замовчуванням — `useHistoryLanding` (`apps/web/src/history-landing.ts`): збережений вибір вкладки або більше ігор. «Мої виклики» — `/history/challenges`: нова точка `GET /api/me/sent-challenges` + наявна `GET /api/me/friend-challenges`.

**Стек:** React 19, react-router-dom 7, Fastify + drizzle, vitest + jsdom, playwright e2e.

**Специфікація:** `docs/superpowers/specs/2026-11-27-navigation-ux-design.md`, «Етап 4».

## Рішення будівельника

- **Профіль — три блоки** у `nav.profile-tiles` (`aria-label` «Розділи профілю»): **Мої здобутки** (🏅 Досягнення з числом, 🎁 Призи з числом, 📊 Статистика, ⭐ Рівень → `/profile/levels`), **Люди** (👥 Друзі, 👪 Групи з числом і бейджем запрошень), **Налаштування** (🎨 Вигляд, ⚙️ Налаштування). Плитки «Вікторини» й «Вподобання» прибрано; адреси `/profile/quizzes` (посилання «Усі ›» з «Найпопулярніших вікторин») і `/profile/likes` (перенаправлення) лишаються. Плитка «Групи» більше не на всю ширину (`is-wide` прибрано). Сітка: «Мої здобутки» — 4 в ряд, «Люди» й «Налаштування» — по 2; на широкому екрані «Люди» й «Налаштування» стоять поряд.
- **Ліга в «Людях»:** під плитками — рядки для груп, де цього місяця вже є бали ліги: «👪 Назва — Ліга: місце 2 · бали місяця: 17» → `/profile/groups/:id?tab=league`. Дані — з того самого `GET /api/groups`, що вже рахує групи для плитки, тож дешево.
- **Ліга в списку груп:** `GroupCard.league` є лише в групі, де в поточному місяці є хоч один рядок `league_point` (тобто «ліга вже йде»); `place` — місце серед нинішніх, не заблокованих учасників (як у таблиці ліги, `rankLeague`), `null` — у мене ще немає балів цього місяця. Без `settleLeague` (запис) — лише читання поточного місяця. Прихована група ліги не показує.
- **«Провести гру для групи»** — кнопка-посилання на сторінці групи над вкладками → `/create?group=<id>`. «Провести гру» з `?group=` показує підказку «Бали гри підуть у лігу групи «…». Змінити можна в лобі.» (назва — з `getGroups`; не член групи чи збій — параметр мовчки ігнорується). Після `createGame` — `pickLeague(code, groupId)`; збій вибору не зупиняє запуск (ведучий бачить вибір у лобі, як і раніше).
- **Зіграна гра — `GET /api/me/history/:id`** (лише читання, без міграції): лише завершена гра, у якій глядач має рядок `participant` (свій чи як член команди); інакше 404. Відповідь `PlayedGameDetail`: назва, дата, мій нік, місце, бали, команда; **підсумкова таблиця** — лише `rank`, `nickname`, `score`, склад команди (те, що показав фінальний екран, без `participantId`, раундів і розбивки); **мої відповіді** — для кожного зіграного запитання: номер, текст, запитання зі знімка (для правильної відповіді), лише рядки відповідей свого учасника (у командній грі — рядка команди й власні голоси). Чужих відповідей, бафів, голосів і email немає. Побудовано поверх `hostGameWithFacts(db, null, id)` з відсіюванням.
- **Сторінка `/me/:id`**: «‹ Зіграні», назва, «дата · ти грав(-ла) як …», місце й бали, таблиця, «Твої відповіді» (✓ / ✗, «Твоя відповідь: …», «Правильна відповідь: …» для запитань з балами), посилання «Уся статистика ›» → `/profile/stats`. У «Зіграних» назва гри — посилання на `/me/:gameId`; над списком — «Уся статистика ›»; на `/profile/stats` — «Зіграні ігри ›» → `/me`.
- **Типова вкладка історії:** пункт меню «Історія» лишається `/history`. `useHistoryLanding`: якщо на цьому пристрої людина вже обирала вкладку (`localStorage` `quiz:history-tab` = `hosted` | `played` | `challenges`, пишеться кліком по вкладці) — відкривається вона; інакше порівнюються `listGames` і `myHistory`: зіграних більше — `/me`, порівну чи менше — «Проведені». Перенаправлення лише з голого `/history` (`replace`). Збій будь-якого списку — лишаємось на «Проведених». Поки вирішуємо — скелет списку.
- **«Мої виклики» — вкладка історії `/history/challenges`**, не «Вікторин»: виклик — це гра, у яку грають (спроби, результати), а «Вікторини» — про зміст; так «Що далі» на головній, «Зіграні» й виклики стоять поряд. Вкладки: Проведені · Зіграні · Виклики (`tabGroup` 'history', `menuSection` 'history', `page-meta` «Мої виклики»). Розділи: **Надіслані** (`GET /api/me/sent-challenges` — мої виклики, найновіші першими, щонайбільше `SENT_CHALLENGES_MAX` = 20; назва, «лишилося N днів» / «Виклик завершено», «зіграли N людей», найкращий результат «Найкраще: нік — бали», «Таблиця» → `/challenge/:code`) і **Від друзів** (`GET /api/me/friend-challenges`, «Прийняти виклик»). Порожні стани з дією: надіслані → «Мої вікторини» (`/quizzes`, виклик створюють з «⋯» картки); від друзів — лише текст.
- **Хвости етапів 1–2:** `ExportMenu` (компонент) вживали лише тести — прибрано разом із ними (`useQuizExport` і `progressText` у тому ж файлі лишаються). Ключі `hostEntry`, `libraryGuestLink`, `homeJoin`, `homeActionsLabel`, `startMenuLabel`, `librarySignIn`, `libraryButton` більше ніде не вживаються — прибрано з `i18n.ts` і всіх локалей (ті, що є в golden, — у `REMOVED`; решта — зі списків `ADDED_*`). `/report` з гри лишається як є.

## Глобальні обмеження

- **`GAME_STATE_VERSION` не змінювати**; міграцій БД немає; ігрові екрани не змінюються.
- Тексти — українською, нові uk-тексти на «ти»; нові ключі — у 7 мовах, список **`ADDED_79`** у `apps/web/src/i18n.test.ts` + тест «79 keys are in every locale». `pnpm l10n check <lang>` для en, de, es, it, pl, ar.
- Приватність: жодних email, чужих відповідей, голосів і бафів у нових точках.
- **Prettier не запускати.** `python3` — заглушка. `git stash` — ні. Коментарі в коді — українською.
- Тести — у передньому плані, по одному запуску, `--maxWorkers=2`. E2E — `pnpm build`, потім по одному файлу з `timeout 590`.
- Коміти — англійською, наприкінці «(79)», з рядками `Co-Authored-By` і `Claude-Session`. Не зливати й не пушити.

### Нові ключі i18n (uk)

| Ключ | uk |
|---|---|
| `profileBlockAchievements` | `Мої здобутки` |
| `profileBlockPeople` | `Люди` |
| `profileBlockSettings` | `Налаштування` |
| `profileTileLevel` | `Рівень` |
| `groupLeagueSpot` | `Ліга: місце {place} · бали місяця: {points}` |
| `groupLeagueNoPoints` | `Ліга: цього місяця ще без балів` |
| `groupHostGame` | `Провести гру для групи` |
| `createForGroup` | `Бали гри підуть у лігу групи «{group}». Змінити можна в лобі.` |
| `playedBack` | `Зіграні` |
| `playedAsYou` | `ти грав(-ла) як {nickname}` |
| `playedMineTitle` | `Твої відповіді` |
| `playedYourAnswer` | `Твоя відповідь: {answer}` |
| `playedRight` | `Правильно` |
| `playedWrong` | `Неправильно` |
| `playedNoAnswer` | `Без відповіді` |
| `playedQuestionNo` | `Запитання {number}` |
| `playedStatsLink` | `Уся статистика` |
| `statsPlayedLink` | `Зіграні ігри` |
| `historyTabChallenges` | `Виклики` |
| `challengesTitle` | `Мої виклики` |
| `challengesSent` | `Надіслані` |
| `challengesReceived` | `Від друзів` |
| `challengesSentEmpty` | `Ти ще не надсилав(-ла) викликів. Виклик створюють з картки вікторини: «⋯» → «Виклик».` |
| `challengesReceivedEmpty` | `Нових викликів від друзів немає.` |
| `challengeBestLine` | `Найкраще: {nickname} — {score}` |

Повторно вживаються: `profileTile*`, `profileTilesLabel`, `invitesBadge`, `daysLeftText`/`playedText` (`challengeDaysLeft_*`, `challengePlayed_*`), `challengeEnded`, `challengeResultsLink`, `challengeFrom`, `homeChallengePlay`, `standingsTitle`, `correctAnswer`, `placeOf`, `noPlace`, `myGamesTeam`, `menuQuizzes`.

## Review Focus

1. `GET /api/me/history/:id`: чужа гра, незавершена гра, гість (401), неіснуючий id — 404/401; у відповіді немає чужих відповідей, `participantId`, email.
2. `GroupCard.league`: немає в групі без балів цього місяця; місце — як у таблиці ліги; колишні й заблоковані не впливають.
3. `/history` не перекидає того, хто сам обрав «Проведені»; перенаправлення лише з голого `/history`.
4. Профіль на 320 px, у простому режимі, світла й темна теми, широкий екран — без бокового скролу, підписи не ріжуться.
5. «Провести гру для групи» — ліга вже вибрана в лобі.

---

### Задача 1. Хвости етапів 1–2

**Files:** Modify `apps/web/src/quiz-io/ExportMenu.tsx`, `apps/web/src/quiz-io/ui.test.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/locales/*.json`, `apps/web/src/locales/reviewed/*.json`, `apps/web/src/i18n.test.ts`.

- [ ] **Крок 1:** `i18n.test.ts` — сім ключів у `REMOVED` (якщо вони в golden) або прибрати зі списків `ADDED_*`; FAIL (ключі ще є).
- [ ] **Крок 2:** прибрати ключі з `i18n.ts`, локалей і перевірених локалей; прибрати компонент `ExportMenu` і його блок тестів. PASS.
- [ ] **Крок 3:** коміт `chore(web): drop the unused ExportMenu component and seven i18n keys left from the old home and library (79)`.

### Задача 2. Профіль: три блоки

**Files:** Modify `apps/web/src/profile/ProfileTiles.tsx`, `apps/web/src/pages/Profile.tsx`, `apps/web/src/pages/Profile.test.tsx` (або `profile/profile.test.tsx`), `apps/web/src/styles.css`, `apps/web/src/i18n.ts`, `apps/web/src/locales/*.json`, `apps/web/src/i18n.test.ts`.

- [ ] **Крок 1: тести** — три заголовки блоків у порядку «Мої здобутки» · «Люди» · «Налаштування»; у першому Досягнення (число), Призи (число), Статистика, Рівень (`/profile/levels`); у «Людях» Друзі й Групи (число, «Запрошень: 1»); у третьому Вигляд і Налаштування; немає посилань `/profile/quizzes` серед плиток і `/quizzes/liked`.
- [ ] **Крок 2:** FAIL. **Крок 3:** реалізувати, стилі `.profile-block`, `.profile-block-tiles` (логічні властивості, 320 px, простий режим). **Крок 4:** PASS.
- [ ] **Крок 5:** коміт `feat(web): profile tiles in three labelled blocks — achievements, people, settings; no quizzes or likes tiles (79)`.

### Задача 3. Сервер: місце в лізі в списку груп

**Files:** Modify `packages/shared/src/groups.ts` (`GroupCard.league`), `apps/server/src/league-store.ts` (`myLeagueSpots`), `apps/server/src/group-routes.ts`, `apps/server/src/group-routes.test.ts` або `league-routes.test.ts`.

- [ ] **Крок 1: тест** — група з балами цього місяця: `league: { place, points }` за таблицею; я без балів — `place: null, points: 0`; група без балів цього місяця — без поля; бали минулого місяця не рахуються.
- [ ] **Крок 2:** FAIL. **Крок 3:** один запит сум за `(group, user)` поточного місяця, учасники груп, заблоковані; `rankLeague`. **Крок 4:** PASS.
- [ ] **Крок 5:** коміт `feat(server): my league place and month points on every group card that has a league this month (79)`.

### Задача 4. Ліга в списку груп і профілі; «Провести гру для групи»

**Files:** Modify `apps/web/src/pages/Groups.tsx`, `apps/web/src/pages/Groups.test.tsx`, `apps/web/src/profile/ProfileTiles.tsx`, `apps/web/src/pages/Profile.tsx`, `apps/web/src/pages/GroupPage.tsx`, `apps/web/src/pages/GroupPage.test.tsx`, `apps/web/src/pages/CreateGame.tsx`, `apps/web/src/pages/CreateGame.test.tsx`, `apps/web/src/host-game.tsx`, стилі, i18n.

- [ ] **Крок 1: тести** — картка групи з `league` показує «Ліга: місце 2 · бали місяця: 17», без місця — «цього місяця ще без балів»; «Люди» в профілі — рядок ліги з посиланням `?tab=league`; сторінка групи — посилання «Провести гру для групи» на `/create?group=<id>`; `/create?group=g1` — підказка з назвою групи, «Почати гру» викликає `pickLeague(code, 'g1')` перед переходом; чужа група — без підказки й без `pickLeague`.
- [ ] **Крок 2:** FAIL. **Крок 3:** реалізувати. **Крок 4:** PASS.
- [ ] **Крок 5:** коміт `feat(web): league place on group cards and in the profile, «Провести гру для групи» pre-picks the league (79)`.

### Задача 5. Сервер: зіграна гра для гравця

**Files:** Modify `packages/shared/src/history.ts` (`PlayedGameDetail`), `apps/server/src/history.ts` (`playedGame(db, userId, id)`), `apps/server/src/account-routes.ts`, `apps/server/src/history.test.ts` (або новий `history.played.test.ts`).

- [ ] **Крок 1: тест** — гравець завершеної гри бачить таблицю (місце, нік, бали) і лише свої відповіді; другий гравець — свої; не учасник — null/404; незавершена гра — 404; командна гра — відповіді команди; гість — 401.
- [ ] **Крок 2:** FAIL. **Крок 3:** реалізувати. **Крок 4:** PASS.
- [ ] **Крок 5:** коміт `feat(server): read-only played game for its player — final standings and only their own answers (79)`.

### Задача 6. Сторінка зіграної гри

**Files:** Create `apps/web/src/pages/PlayedGame.tsx`, `apps/web/src/pages/PlayedGame.test.tsx`; Modify `apps/web/src/AppRoutes.tsx`, `apps/web/src/api.ts`, `apps/web/src/pages/MyGames.tsx`, `apps/web/src/pages/MyGames.test.tsx`, `apps/web/src/pages/profile/ProfileStats.tsx`, `apps/web/src/nav/page-meta.ts`, стилі, i18n.

- [ ] **Крок 1: тести** — `/me/:id`: назва, місце, таблиця, «Твої відповіді» з ✓/✗ і правильною відповіддю, «Уся статистика» → `/profile/stats`, «‹ Зіграні»; у «Зіграних» назва — посилання; на статистиці — «Зіграні ігри» → `/me`.
- [ ] **Крок 2:** FAIL. **Крок 3:** реалізувати. **Крок 4:** PASS.
- [ ] **Крок 5:** коміт `feat(web): played games open — results and your own answers; links between played games and stats (79)`.

### Задача 7. Типова вкладка історії

**Files:** Create `apps/web/src/history-landing.ts`, `apps/web/src/history-landing.test.ts`; Modify `apps/web/src/pages/History.tsx`, `apps/web/src/pages/HistoryTabs.tsx`, `apps/web/src/pages/History.test.tsx`, `apps/web/src/storage.ts`.

- [ ] **Крок 1: тести** — `landingTab(saved, hosted, played)`: збережене перемагає; без нього більше зіграних — `played`; порівну — `hosted`; `null` (збій) — `hosted`. `/history`: гравець без проведених — на `/me`; клік «Проведені» запам'ятовується й не перекидає.
- [ ] **Крок 2:** FAIL. **Крок 3:** реалізувати. **Крок 4:** PASS.
- [ ] **Крок 5:** коміт `feat(web): history opens on the tab where you have more games and remembers the tab you chose (79)`.

### Задача 8. «Мої виклики»

**Files:** Modify `packages/shared/src/challenge.ts` (`SentChallenge`, `SENT_CHALLENGES_MAX`), `apps/server/src/challenges.ts` (`sentChallenges`), `apps/server/src/challenge-routes.ts`, `apps/server/src/challenge-routes.test.ts`; Create `apps/web/src/pages/MyChallenges.tsx`, `apps/web/src/pages/MyChallenges.test.tsx`; Modify `apps/web/src/api.ts`, `apps/web/src/AppRoutes.tsx`, `apps/web/src/pages/HistoryTabs.tsx`, `apps/web/src/nav/page-meta.ts` (+ тест), `apps/web/src/nav/menu-section.test.ts`, стилі, i18n.

- [ ] **Крок 1: тести** — сервер: мої виклики (активний і завершений), `played`, `best` (найбільші бали серед завершених спроб), чужих немає, гість — 401. Веб: два розділи, порожні стани, «Таблиця» → `/challenge/:code`, «Прийняти виклик»; вкладки історії — три; `tabGroup('/history/challenges') === 'history'`; заголовок вкладки «Мої виклики».
- [ ] **Крок 2:** FAIL. **Крок 3:** реалізувати. **Крок 4:** PASS.
- [ ] **Крок 5:** коміт `feat: «Мої виклики» tab in history — challenges I sent with attempts and best score, and active ones from friends (79)`.

### Задача 9. E2E і перевірка

**Files:** Modify `apps/server/e2e/part22-24-l10n-menus-profile.e2e.ts`, `part12k-groups.e2e.ts`, `part45-family-league.e2e.ts`, `part44-challenge.e2e.ts`, `core.e2e.ts` та інші з grep (`profile-tiles`, `is-wide`, `/me`).

- [ ] **Крок 1:** оновити перевірки плиток профілю (3 блоки, 320 px, простий режим, світла тема); у part45 — ліга в списку груп і «Провести гру для групи»; у part44 — «Мої виклики»; зіграна гра відкривається (core чи part22-24).
- [ ] **Крок 2:** `pnpm build`; e2e по одному файлу; `pnpm typecheck`; веб-юніти частинами; серверні тести, яких торкались; `pnpm l10n check` для 6 мов.
- [ ] **Крок 3:** коміт `test(e2e): profile blocks, league on group cards, host for a group, played game details, my challenges (79)`.
