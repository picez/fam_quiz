# План 78. Навігація, етап 3 «Головна»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** головна, з якої за 0–1 дотик входять у гру за кодом, проводять гру, продовжують почате; гість розуміє, що це за сайт; новачок після реєстрації бачить «З чого почати».

**Архітектура:** `pickNextUp` (`apps/web/src/home-next.ts`) — одна чиста функція пріоритету «Що далі» (жива гра → збережена гра → запрошення → найближча подія → виклик від друга). `useNextUp` у `HomeTop.tsx` збирає дані паралельно з наявних точок (`sharedRunningGame`, `listGames`, `getMyInvites`, `getCalendar`) і однієї нової, лише для читання: `GET /api/me/friend-challenges`. «Швидкий запуск» — `apps/web/src/pages/QuickStart.tsx` (`listQuizzes`, три найсвіжіші за `updatedAt`, «Провести» через `useStartGame`). «З чого почати» — `apps/web/src/pages/WelcomeCard.tsx` + чиста `isNewAccount` (`apps/web/src/home-welcome.ts`), закриття — `localStorage` за id акаунта. Низ головної — `HomeFooter` (довідка, простий режим, тема, «Повідомити про проблему»).

**Стек:** React 19, react-router-dom 7, Fastify + drizzle, vitest + jsdom, playwright e2e.

**Специфікація:** `docs/superpowers/specs/2026-11-27-navigation-ux-design.md`, «Етап 3».

## Рішення будівельника

- **Порядок головної з акаунтом:** заголовок → форма «Код гри» (одразу відкрита, без «Приєднатися») → велика «Провести гру» (`/create`) → «З чого почати» (лише новачку) → «Що далі» → «Відкриті ігри» (`LobbyList`) → «Швидкий запуск» → низ. Кнопка «Приєднатися» зникає: форма відкрита завжди, а перемикач лише ховав би поле.
- **«Що далі», пріоритет:** жива гра на цьому пристрої (ведучий / автор-автопілот / спроба виклику) → збережена гра, яку можна продовжити (це теж «незавершена гра», як і в 53) → найсвіжіше запрошення в гру (`/api/me/invites`, кнопка «Приєднатися» → `/play/:code`) → найближча подія календаря → найсвіжіший виклик від друга. Картка з'являється, лише коли відповіли всі запити; збій будь-якого — «немає даних» для цього джерела, без повідомлення. Гра, у якій людина лише гравець, тут не з'являється: пристрій не пам'ятає «останню гру гравця», а повернення гравця й так іде через поле коду (його токен лишається на пристрої) — нового сховища не вводимо.
- **Виклик від друга — нова точка `GET /api/me/friend-challenges`** (лише читання, без міграції): активні виклики (не завершені й не прострочені) авторів, які **додали мене в друзі** (`follow.follower = автор, followee = я`, те саме коло, що бачить їхній календар), автор не схований (`notHidden`), я ще не пробував (`challenge_attempt` немає), не мої; найновіші першими, щонайбільше `FRIEND_CHALLENGES_MAX` = 5. Відповідь `FriendChallenge { code, title, author: { id, nickname } | null, expiresAt }`. Без неї «виклику від друга» не існує: виклики досі розходились лише посиланням. Коло «хто додав мене» вибране, бо автор сам обрав цих людей; одностороння підписка глядача на автора нічого не відкриває.
- **«Швидкий запуск»:** три мої вікторини з найпізнішим `updatedAt` («останні змінені»; `GameSummary` не має `quizId`, тож «останні зіграні» без нової точки не порахувати — не вводимо). Рядок: назва, «Провести» (`aria-label` «Провести: {title}»), помилка запуску — під списком; «Усі вікторини ›» → `/quizzes`. Немає вікторин чи збій — блоку немає.
- **Низ головної:** «Довідка ведучого» → `/help` (сторінка `/help` — це `HostHelp`, лише про проведення; тому чесна назва «Довідка ведучого», а «Як грати» для гравця додасть етап 5), `EasyModeSwitch`, `ThemeSwitch`, `ProblemLink`. Той самий низ — і гостю.
- **Плитки прибрано всі шість** (`nav.start-menu`, `TileLink`, `TileFace`, стилі `.start-menu/.start-tile/...`). «Друзі» в меню немає, але вони є в профілі (етап 4 — «Люди»); значки стрічки й запрошень лишаються в меню.
- **Гість:** заголовок → два рядки «що це» → форма коду → «Відкриті ігри» → «Що далі» (лише жива гра цього пристрою, як і було) → «Переглянути бібліотеку» (`/library`) → «Увійти, щоб проводити свої ігри» (`/login`, без `next` — після входу на головну) → низ. «Я ведучий» і «📚 Бібліотека вікторин» зникають (ключі лишаються — `libraryGuestLink` і `hostEntry` більше не вживаються, але не видаляються, щоб не чіпати golden).
- **Після входу:** `safeNext` у `Login.tsx` за замовчуванням `/` замість `/quizzes`.
- **«З чого почати» — кому:** акаунт без жодної своєї вікторини, без жодної проведеної гри (`listGames`) і без жодної зіграної (`myHistory`). Так картку бачить справді новий акаунт, а не бабуся, що вже грала, чи ведучий, що вже створював. Перевірка лише коли картку ще не закривали; збій будь-якого запиту — картки немає. Закриття — `localStorage` `quiz:welcome-done:<accountId>` (прапорця в профілі немає, міграції не робимо): на іншому пристрої новачок побачить картку ще раз, доки не створить чи не зіграє щось. Три кроки: «Увійди в гру за кодом — його показує ведучий на екрані» · «Проведи гру з бібліотеки» (посилання «Бібліотека») · «Створи свою вікторину» (посилання «Нова вікторина» → `/quizzes/new`). Кнопка «Зрозуміло» ховає картку.
- **Хвости етапу 2:** меню під час завантаження акаунта не світить жодного пункту; гість на `/library/:id` бачить одне посилання входу — кнопку «Увійти, щоб провести» (рядок «Увійди, щоб копіювати…» прибрано).

**Знайдене під час e2e:** у легкому режимі на 320 px «000 000» у полі коду обрізалось — на головній шрифт поля не більший за `7.5vw` (`.join-form .code-input`; ігрові екрани не зачеплено); заголовок «Швидкий запуск» ламався посеред слова — шапка блоку переноситься між словами. Задачі 4–6 — одним комітом (спільний `Home.tsx`).

## Глобальні обмеження

- **`GAME_STATE_VERSION` не змінювати**; міграцій БД немає; ігрові екрани (`Play`, `Host`, `Stage`, `BotHost`, `apps/web/src/screens`, `apps/web/src/live`) не змінюються.
- Тексти — українською, нові uk-тексти на «ти»; нові ключі — у 7 мовах, список **`ADDED_78`** у `apps/web/src/i18n.test.ts` + тест «78 keys are in every locale» (переклад ≠ uk, ті самі `{змінні}`). `pnpm l10n check <lang>` для en, de, es, it, pl, ar.
- **Prettier не запускати.** `python3` — заглушка. `git stash` — ні. Коментарі в коді — українською.
- Тести — у передньому плані, по одному запуску, `--maxWorkers=2`. E2E — `pnpm build`, потім по одному файлу з `timeout 590`.
- Коміти — англійською, наприкінці «(78)», з рядками `Co-Authored-By` і `Claude-Session`. Не зливати й не пушити.

### Нові ключі i18n (uk)

| Ключ | uk |
|---|---|
| `homeGuestAbout` | `Сімейні вікторини: один проводить гру на великому екрані, а всі відповідають зі своїх телефонів.` |
| `homeGuestHow` | `Маєш код гри — введи його тут. Хочеш провести свою — увійди.` |
| `homeGuestLibrary` | `Переглянути бібліотеку` |
| `homeGuestSignIn` | `Увійти, щоб проводити свої ігри` |
| `homeInviteTitle` | `Тебе запросили в гру` |
| `homeChallengeTitle` | `Виклик від друга` |
| `homeChallengePlay` | `Прийняти виклик` |
| `homeQuickTitle` | `Швидкий запуск` |
| `homeQuickHost` | `Провести: {title}` |
| `homeQuickAll` | `Усі вікторини ›` |
| `welcomeTitle` | `З чого почати` |
| `welcomeJoin` | `Увійди в гру за кодом — його показує ведучий на екрані.` |
| `welcomeLibrary` | `Проведи гру з бібліотеки:` |
| `welcomeCreate` | `Створи свою вікторину:` |
| `welcomeDone` | `Зрозуміло` |

Повторно вживаються: `startCreate`, `play`, `inviteLine`, `inviteJoin`, `challengeFrom`, `libraryTitle`, `newQuiz`, `helpLink`, `menuQuizzes`.

## Review Focus

1. Пріоритет «Що далі» — таблиця в `home-next.test.ts`; збій одного джерела не ховає решту.
2. `/api/me/friend-challenges` не віддає: чужих (автор мене не додав), прострочених/завершених, уже спробуваних, своїх, схованих авторів; гість — 401.
3. «З чого почати» лише новому акаунту; після «Зрозуміло» не повертається й після перезавантаження.
4. Головна в простому режимі й на 320 px без бокового скролу, світла й темна тема.
5. Меню під час завантаження не світить «Головну».

---

### Задача 1. Хвости етапу 2 і вхід на головну

**Files:** Modify `apps/web/src/menu/Menu.tsx`, `apps/web/src/menu/Menu.test.tsx`, `apps/web/src/pages/LibraryQuiz.tsx`, `apps/web/src/pages/LibraryQuiz.test.tsx`, `apps/web/src/pages/Login.tsx`, `apps/web/src/pages/Login.test.tsx`.

- [ ] **Крок 1: тести** — меню з `me()`, що не відповідає: жодного `aria-current`; гість на `/library/:id`: рівно одне посилання на `/login?next=…`; реєстрація без `next` веде на `/`.
- [ ] **Крок 2:** FAIL. **Крок 3:** `activeItem` повертає null, поки `account.status === 'loading'`; прибрати другий `<p>` у `LibraryQuiz`; `safeNext` → `/`. **Крок 4:** PASS.
- [ ] **Крок 5:** коміт `fix(web): no menu highlight while the account loads, one sign-in link on a library quiz, sign-in lands on home (78)`.

### Задача 2. Сервер: виклики від друзів

**Files:** Modify `packages/shared/src/challenge.ts` (`FriendChallenge`, `FRIEND_CHALLENGES_MAX`), `apps/server/src/challenges.ts` (`friendChallenges(db, viewerId, now)`), `apps/server/src/challenge-routes.ts`, `apps/server/src/challenge-routes.test.ts`; `apps/web/src/api.ts` (`listFriendChallenges`).

- [ ] **Крок 1: тест** — Олена додала Петра в друзі й створила виклик → Петро бачить `{ code, title, author.nickname }`; Іра (Олена її не додала) — `[]`; після спроби Петра — `[]`; Олена сама — без власного; завершений («новий виклик» на ту саму вікторину лишає один активний) і прострочений не видно; гість — 401.
- [ ] **Крок 2:** FAIL. **Крок 3:** запит з `exists(follow)`, `notHidden(challenge.ownerId)`, `not exists(challenge_attempt)`, `limit`. **Крок 4:** PASS.
- [ ] **Крок 5:** коміт `feat(server): read-only list of active challenges from people who added me as a friend (78)`.

### Задача 3. «Що далі»: запрошення й виклики

**Files:** Modify `apps/web/src/home-next.ts`, `apps/web/src/home-next.test.ts`, `apps/web/src/pages/HomeTop.tsx`.

- [ ] **Крок 1: тести** — `pickNextUp({ running, games, invites, events, challenges })`: кожне джерело перемагає всі нижчі; найсвіжіше запрошення (`invitedAt`), найближча подія, найсвіжіший виклик (перший у списку); `null` джерела = немає даних.
- [ ] **Крок 2:** FAIL. **Крок 3:** нові види `invite`, `challenge`; картки `InviteCard` (`inviteLine`, «Приєднатися» → `/play/:code`) і `ChallengeCard` (назва, `challengeFrom`, «Прийняти виклик» → `/challenge/:code`). **Крок 4:** PASS.
- [ ] **Крок 5:** коміт `feat(web): «what's next» also offers a game invite and a challenge from a friend (78)`.

### Задача 4. Головна з акаунтом

**Files:** Create `apps/web/src/pages/QuickStart.tsx`, `apps/web/src/pages/HomeFooter.tsx`; Modify `apps/web/src/pages/Home.tsx`, `apps/web/src/pages/HomeTop.tsx`, `apps/web/src/pages/Home.test.tsx`, `apps/web/src/styles.css`, `apps/web/src/styles-wide.test.ts`, `apps/web/src/i18n.ts`, `apps/web/src/locales/*.json`, `apps/web/src/i18n.test.ts`.

- [ ] **Крок 1: тести** — поле «Код гри» є без жодного дотику; «Провести гру» → `/create` під формою; порядок: форма → «Провести гру» → «Що далі» → «Відкриті ігри» → «Швидкий запуск» → низ; немає `nav.start-menu`; «Швидкий запуск» — три найсвіжіші за `updatedAt`, «Провести» запускає гру; без вікторин блоку немає; низ — «Довідка ведучого» (`/help`), «Легкий режим», «Тема», «Повідомити про проблему».
- [ ] **Крок 2:** FAIL. **Крок 3:** реалізувати; стилі `.home-host`, `.quick-start`, `.home-footer` (логічні властивості, переноси, 320 px); прибрати стилі плиток. **Крок 4:** PASS.
- [ ] **Крок 5:** коміт `feat(web): signed-in home — open code field, «Провести гру», what's next, open games, quick start, help and look settings; no menu tiles (78)`.

### Задача 5. Головна гостя

**Files:** Modify `apps/web/src/pages/Home.tsx`, `apps/web/src/pages/Home.test.tsx`, `apps/web/src/styles.css`.

- [ ] **Крок 1: тести** — два рядки «що це» над полем; «Переглянути бібліотеку» → `/library`; «Увійти, щоб проводити свої ігри» → `/login`; немає «Я ведучий» і «Провести гру».
- [ ] **Крок 2:** FAIL. **Крок 3:** реалізувати. **Крок 4:** PASS.
- [ ] **Крок 5:** коміт `feat(web): guest home explains the site, keeps the code field, library and sign-in to host (78)`.

### Задача 6. «З чого почати»

**Files:** Create `apps/web/src/home-welcome.ts`, `apps/web/src/home-welcome.test.ts`, `apps/web/src/pages/WelcomeCard.tsx`; Modify `apps/web/src/storage.ts`, `apps/web/src/pages/Home.tsx`, `apps/web/src/pages/Home.test.tsx`.

- [ ] **Крок 1: тести** — `isNewAccount(quizzes, games, played)`: усе порожнє — true; будь-що непорожнє чи `null` (збій) — false. Картка: новачку — три кроки з посиланнями `/library` і `/quizzes/new`; «Зрозуміло» ховає й пам'ятає для цього акаунта (інший акаунт на тому самому пристрої її бачить); є вікторина — картки немає.
- [ ] **Крок 2:** FAIL. **Крок 3:** реалізувати. **Крок 4:** PASS.
- [ ] **Крок 5:** коміт `feat(web): one-time «З чого почати» card for brand-new accounts (78)`.

### Задача 7. E2E і перевірка

**Files:** Modify `apps/server/e2e/helpers/common.ts` (`register(…, 'host')` — «Увійти, щоб проводити свої ігри», після реєстрації — «Вікторини» в меню), `apps/server/e2e/core.e2e.ts`, `part22-24-l10n-menus-profile.e2e.ts`, `part53-admin-home.e2e.ts`, `part47-library.e2e.ts`, `part32-weak-network.e2e.ts` та інші з grep (`Я ведучий`, `nav.start-menu`, `.home-actions`, `Приєднатися` на головній).

- [ ] **Крок 1:** оновити тексти й перевірки головної (320 px, простий режим, світла тема — у part22-24 / part53).
- [ ] **Крок 2:** `pnpm build`; e2e по одному файлу; `pnpm typecheck`; веб-юніти частинами; `pnpm l10n check` для 6 мов.
- [ ] **Крок 3:** коміт `test(e2e): home stage 3 — open code field, quick start, guest home, sign-in lands on home (78)`.
