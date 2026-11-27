# План 76. Навігація, етап 1 «Фундамент»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** невидимі, але відчутні правки оболонки сайту: заголовок вкладки, прокрутка й фокус під час переходів, спільні стани «завантаження / помилка / порожньо», кнопка «назад» зі словом, попередження редактора про незбережене всередині сайту й «Провести гру» з редактора.

**Архітектура:** нова тека `apps/web/src/nav/` — чисті функції (`page-meta.ts`: назва сторінки й «група вкладок» за шляхом; `nav-trail.ts`: звідки людина прийшла на кожен запис історії; `scroll-memory.ts`: збережена прокрутка за `location.key`) і один компонент `RouteEffects`, що стоїть у `AppRoutes` перед `<Routes>` і на кожну зміну адреси ставить заголовок, записує слід, прокручує й переносить фокус. Спільні стани — `apps/web/src/ui/PageState.tsx`. «Назад» — `apps/web/src/nav/BackLink.tsx`. Попередження редактора — `apps/web/src/nav/leave-guard.ts` (перехоплення кліків по посиланнях).

**Стек:** React 19, react-router-dom 7 (`BrowserRouter`, не data router), vitest + jsdom, playwright e2e (`apps/server/e2e`).

**Специфікація:** `docs/superpowers/specs/2026-11-27-navigation-ux-design.md`, «Етап 1».

## Рішення будівельника

- **Роутер лишається `BrowserRouter`.** `useBlocker` і `<ScrollRestoration>` працюють лише в data router; перехід на `createBrowserRouter` міняє семантику переходів для всього сайту (зокрема ігрових екранів) і ламає сотні тестів на `MemoryRouter`. Тож: прокрутку й фокус робить власний `RouteEffects` (`useLocation` + `useNavigationType`), а незбережене в редакторі — перехоплення кліку по `<a>` у фазі захоплення на `document` (`preventDefault` до того, як `Link` з react-router перевірить `defaultPrevented`). Кнопка браузера «назад» не перепитує: чернетка редактора вже лежить у `localStorage` і відновлюється («Чернетку відновлено»), закриття вкладки й перезавантаження — як було (`beforeunload`).
- **Прокрутка:** `PUSH`/`REPLACE` зі зміною `pathname` → `scrollTo(0)` миттєво (`behavior: 'instant'`, плавних прокруток немає взагалі — «зменшити рух» дотримано автоматично); зміна лише `?query`/`#hash` — нічого не робимо (фільтри, вкладки редактора). `POP` → відновлюємо збережене для `location.key` значення; сторінка може ще вантажитися, тож пробуємо щокадру до 2 с, доки документ не стане достатньо високим; будь-яке втручання людини (`wheel`, `touchstart`, `keydown`, `pointerdown`) зупиняє спроби. Прокрутка запамʼятовується на `scroll` (через rAF) і на `pagehide` у `sessionStorage` (ключ `quiz.nav.scroll`, до 100 записів). Поки сторінки з меню на екрані — `history.scrollRestoration = 'manual'`; ігрові екрани (`/play`, `/host`, `/stage`, `/bot-host`) прокрутку й фокус не чіпають узагалі.
- **Фокус:** перше відкриття сайту — без фокуса (не крадемо). Зміна `pathname` між різними сторінками → фокус на перший `main h1` (до ~1 с чекаємо, поки зʼявиться; інакше — на `main`), з `tabindex="-1"`, `preventScroll`, без рамки. Якщо сторінка сама поставила фокус у свій `main` (autofocus поля) — не чіпаємо. **Групи вкладок** — `/feed` ↔ `/feed/calendar`, `/history` ↔ `/me`, `/admin` ↔ `/admin/<розділ>` (один сегмент): між ними фокус на h1 не переноситься; якщо фокус загубився (на `body`), він стає на активну вкладку `main a[aria-current="page"]`.
- **«Назад»:** `nav-trail` для кожного `location.key` памʼятає `{ from, steps }`: `PUSH` на інший шлях → `{ from: попередній шлях+query, steps: 1 }`; `PUSH` на той самий шлях → `{ from: попереднього.from, steps: попереднього.steps + 1 }`; `REPLACE` → успадковує запис заміненого; `POP` нічого не пише. `sessionStorage` `quiz.nav.trail`, до 200 записів. `BackLink parent="/profile"`: якщо є `from`, це не ігровий екран і не `/login`, і він не дорівнює поточному шляху → підпис — назва сторінки `from`, клік — `navigate(-steps)` (повертає й прокрутку); інакше — `Link` на `parent` з назвою батьківської сторінки. Завжди справжній `href` (відкрити в новій вкладці працює).
- **Заголовок вкладки:** «Сторінка · Вікторина»; головна — просто «Вікторина»; ігрові екрани — «Вікторина». Сторінки з власною назвою (бібліотечна вікторина, публічний профіль, гра в історії) уточнюють її `useDocumentTitle(text)` — ефект сторінки йде після ефекту `RouteEffects`, бо той стоїть раніше в дереві.
- **«Провести гру» в редакторі** — лише для збереженої вікторини (`quizId`), тим самим `useStartGame` (як «Почати гру» у «Створити гру»). Поки є незбережені зміни — кнопка вимкнена з підказкою «спершу збережи».
- **Retry:** `usePrivateData` у стані `error` віддає `retry()` (внутрішній лічильник спроби + `useAccount(attempt)`), тож кнопка є на всіх сторінках, що ним користуються; сторінки з власним завантаженням (`Quizzes`, `CreateGame`, `PublicProfile`, `Library`, `LibraryQuiz`) мають свій лічильник спроби.

## Глобальні обмеження

- **`GAME_STATE_VERSION` не змінювати**; сервер, рушій, ігрові екрани (`Play`, `Host`, `Stage`, `BotHost`, `apps/web/src/screens`, `apps/web/src/live`) — без змін поведінки.
- Тексти інтерфейсу — українською, нові uk-тексти на **«ти»**; нові ключі — у 7 мовах (uk `apps/web/src/i18n.ts`, решта `apps/web/src/locales/{en,de,pl,es,it,ar}.json`), список **`ADDED_76`** у `apps/web/src/i18n.test.ts` + загальний фільтр «adds no uk keys beyond the agreed list» + тест «76 keys are in every locale» (переклад ≠ uk, ті самі `{змінні}`). Змінені uk-тексти — у `CHANGED_LATER`. `pnpm l10n check <lang>` для en, de, es, it, pl, ar.
- Жодних анімованих прокруток (`behavior: 'instant'`); скелет списку без анімації за `prefers-reduced-motion: reduce` і в легкому режимі.
- **Prettier не запускати.** `python3` — заглушка: правити Edit/node. `git stash` — ні. Коментарі в коді — українською.
- Тести — у передньому плані, по одному запуску: `npx vitest run --maxWorkers=2 --project web <шлях>`.
- E2E: `pnpm build`, потім `timeout 590 npx vitest run --config apps/server/e2e/vitest.config.ts apps/server/e2e/<файл>` — по одному файлу.
- Коміти — англійською, наприкінці «(76)», з рядками `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` і `Claude-Session: https://claude.ai/code/session_01BJmGPgRo4NbMXbCQVe4EC6`. Не зливати й не пушити.

### Нові ключі i18n (uk)

| Ключ | uk |
|---|---|
| `pageHome` | `Головна` |
| `backTo` | `Назад: {page}` (aria-label посилання «‹ Сторінка») |
| `retryLoad` | `Спробувати ще раз` |
| `emptyHostGame` | `Провести гру` |
| `emptyJoinByCode` | `Увійти в гру за кодом` |
| `libraryClearSearch` | `Очистити пошук` |
| `leaveUnsaved` | `Зміни ще не збережено. Піти зі сторінки? Чернетка лишиться на цьому пристрої.` |
| `editorHostGame` | `Провести гру` |
| `editorHostSaveFirst` | `Спершу збережи зміни: гра почнеться зі збереженої версії.` |

Змінені uk (у `CHANGED_LATER`, переклади оновити): `historyEmpty` → `Тут з’являться ігри, які ти проведеш.`; `myGamesEmpty` → `Тут з’являться ігри, у які ти зіграєш зі свого акаунта.`

## Review Focus

1. Глибоке посилання (нова вкладка, пуш) на вкладену сторінку — «назад» веде на батьківську, а не «нікуди» (`navigate(-1)` поза сайт). Тест у задачі 3.
2. Перехід лише зміною `?query` (фільтри «Мої вікторини», пошук бібліотеки, вкладка редактора) не прокручує вгору й не переносить фокус. Тест у задачі 2.
3. Поле з autofocus на новій сторінці не втрачає фокус через перенесення на h1. Тест у задачі 2.
4. «Створити гру»: збій списку показує помилку з «Спробувати ще раз» без вічного «Завантажуємо…», а помилка дії (старт гри) не ховає список. Тест у задачі 5.
5. Клік по посиланню з модифікатором (Ctrl/⌘, середня кнопка) чи `target="_blank"` у брудному редакторі не перепитує. Тест у задачі 6.

---

### Задача 1. Назва сторінки й заголовок вкладки

**Files:**
- Create: `apps/web/src/nav/page-meta.ts`, `apps/web/src/nav/page-meta.test.ts`, `apps/web/src/nav/RouteEffects.tsx`, `apps/web/src/nav/useDocumentTitle.ts`, `apps/web/src/nav/RouteEffects.test.tsx`
- Modify: `apps/web/src/AppRoutes.tsx` (рендер `<RouteEffects />` перед `<Routes>`), `apps/web/src/i18n.ts`, `apps/web/src/locales/*.json`, `apps/web/src/i18n.test.ts`

**Interfaces:**
- Produces: `pageTitle(pathname: string): string | null` — назва сторінки мовою інтерфейсу; `null` для ігрових екранів і невідомих шляхів. `isGamePath(pathname): boolean`. `tabGroup(pathname): string | null`. `documentTitle(page: string | null): string` → `page === null ? appName : \`${page} · ${appName}\``. `useDocumentTitle(text: string | null): void`.
- Мапа (через `matchPath`, порядок як у `AppRoutes`): `/` → null-сторінка (заголовок = appName; `pageTitle('/')` повертає `pageHome` для «назад»), `/login` loginTitle, `/create` startCreate, `/quizzes` quizzesTitle, `/quizzes/new` editorNew, `/quizzes/:id` editorEdit, `/library` libraryTitle, `/library/:id` libraryTitle, `/feed` menuFeed, `/feed/calendar` feedTabCalendar, `/history` historyTitle, `/history/:id` historyTitle, `/me` myGamesTitle, `/profile` menuProfile, `/profile/quizzes` profileTileQuizzes, `/profile/prizes`(+`/new`, `/:id`) і `/prizes` profileTilePrizes, `/profile/achievements`, `/achievements`, `/profile/:id/achievements` profileTileAchievements, `/profile/friends`, `/friends` profileTileFriends, `/profile/stats` profileTileStats, `/profile/likes` profileTileLikes, `/profile/levels` levelMapTitle, `/profile/looks` profileTileLooks, `/profile/settings` profileTileSettings, `/profile/groups/*`, `/groups` profileTileGroups, `/groups/join/:code` groupJoinTitle, `/challenge/:code` challengeTitle, `/profile/:id` menuProfile, `/admin/*` adminTitle, `/help` helpTitle, `/report` problemLink, `/inbox` inboxTitle.

- [ ] **Крок 1: тести** `page-meta.test.ts`: `pageTitle('/profile/friends')` = `'Друзі'`; `pageTitle('/play/123456')` = null, `isGamePath('/bot-host/1')` = true; `pageTitle('/')` = `'Головна'`; `documentTitle('Друзі')` = `'Друзі · Вікторина'`; `tabGroup('/me') === tabGroup('/history')`, `tabGroup('/feed/calendar') === tabGroup('/feed')`, `tabGroup('/admin/users') === tabGroup('/admin')`, `tabGroup('/admin/users/1')` = null, `tabGroup('/quizzes')` = null. `RouteEffects.test.tsx`: у `MemoryRouter` перехід `/` → `/profile/friends` ставить `document.title` = `'Друзі · Вікторина'`, на `/` — `'Вікторина'`, на `/host/1` — `'Вікторина'`; сторінка з `useDocumentTitle('Географія')` дає `'Географія · Вікторина'`. i18n: тест «76 keys are in every locale».
- [ ] **Крок 2:** запустити — FAIL.
- [ ] **Крок 3:** реалізувати; ключі `pageHome`, `backTo` у 7 мовах, `ADDED_76`.
- [ ] **Крок 4:** тести + `i18n.test.ts` — PASS.
- [ ] **Крок 5:** коміт `feat(web): tab title per page (76)`.

### Задача 2. Прокрутка, фокус і слід переходів

**Files:**
- Create: `apps/web/src/nav/nav-trail.ts`, `apps/web/src/nav/nav-trail.test.ts`, `apps/web/src/nav/scroll-memory.ts`
- Modify: `apps/web/src/nav/RouteEffects.tsx`, `apps/web/src/nav/RouteEffects.test.tsx`, `apps/web/src/styles.css` (`[data-route-focus]:focus { outline: none }`)

**Interfaces:**
- Produces: `recordStep(prev: { key: string; path: string } | null, next: { key: string; path: string }, action: 'PUSH' | 'REPLACE' | 'POP'): void`; `backTarget(key: string): { from: string; steps: number } | null`; `forgetTrail(): void` (тести). `path` — `pathname + search`. `saveScroll(key, y)`, `savedScroll(key): number | null`.

- [ ] **Крок 1: тести** `nav-trail.test.ts`: PUSH `/`→`/profile/friends` дає `{ from: '/', steps: 1 }`; PUSH `/help` → `/help?topic=x` дає `{ from: <from /help>, steps: 2 }`; REPLACE успадковує; POP нічого не пише; глибоке посилання (перший запис без prev) → null. `RouteEffects.test.tsx` (stub `window.scrollTo`): перехід на інший шлях → `scrollTo` з `{ top: 0, behavior: 'instant' }` і фокус на h1 нової сторінки; зміна лише `?q=` → `scrollTo` не викликано, фокус не змінено; сторінка з autofocus-полем лишає фокус у полі; `/history` → `/me` не ставить фокус на h1 (фокус на `a[aria-current="page"]`, якщо був загублений); перше відображення фокус не чіпає; `/play/1` — `scrollTo` не викликано.
- [ ] **Крок 2:** FAIL.
- [ ] **Крок 3:** реалізувати за «Рішеннями будівельника» (відновлення на POP — rAF-цикл до 2 с, зупинка від втручання).
- [ ] **Крок 4:** PASS.
- [ ] **Крок 5:** коміт `feat(web): scroll to top on new pages, restore on back, focus the page heading (76)`.

### Задача 3. «‹ Сторінка» на вкладених сторінках

**Files:**
- Create: `apps/web/src/nav/BackLink.tsx`, `apps/web/src/nav/BackLink.test.tsx`
- Modify: `apps/web/src/profile/ProfileSubpage.tsx` (голий «‹» → `BackLink`), `apps/web/src/editor/QuizEditor.tsx` (prop `back?: ReactNode` над h1), `apps/web/src/pages/EditQuiz.tsx` (`parent="/quizzes"`), `apps/web/src/pages/HostHelp.tsx` (`/quizzes`), `apps/web/src/inbox/InboxPage.tsx` (`/`), `apps/web/src/pages/ChallengePage.tsx` (`/`), `apps/web/src/problems/ProblemReport.tsx` (`?from=` якщо це шлях сайту, що починається з `/` і не `//`, інакше `/`), `apps/web/src/pages/GroupJoin.tsx` (`/profile/groups`), `apps/web/src/pages/GameHistory.tsx` (`/history`), `apps/web/src/pages/LibraryQuiz.tsx` (`/library`); тести цих сторінок, що шукали старі посилання.

**Interfaces:**
- Consumes: `backTarget`, `pageTitle`, `isGamePath`.
- Produces: `BackLink({ parent }: { parent: string }): JSX.Element` — `<a className="back-link" href=… aria-label={t('backTo', { page })}><span className="flip-rtl" aria-hidden>‹</span> {page}</a>`.

- [ ] **Крок 1: тести** `BackLink.test.tsx`: глибоке посилання на `/profile/friends` з `parent="/profile"` — посилання «‹ Профіль», href `/profile`; перехід `/` → `/profile/friends` усередині — «‹ Головна», клік повертає на `/`; `from` = `/login?next=…` → батьківська сторінка; ProfileSubpage показує слово.
- [ ] **Крок 2:** FAIL. **Крок 3:** реалізувати й застосувати. **Крок 4:** PASS (разом із тестами змінених сторінок).
- [ ] **Крок 5:** коміт `feat(web): back links with the page name on nested pages (76)`.

### Задача 4. Спільні стани сторінки

**Files:**
- Create: `apps/web/src/ui/PageState.tsx`, `apps/web/src/ui/PageState.test.tsx`
- Modify: `apps/web/src/usePrivateData.ts` (+ `retry` у стані error), `apps/web/src/usePrivateData.test.tsx`, `apps/web/src/menu/WithMenu.tsx` (ліниве завантаження — `<Loading />` у `<main className="app">`), `apps/web/src/styles.css` (`.skeleton-list`), i18n (`retryLoad`).

**Interfaces:**
- Produces: `Loading({ list?: boolean })` — `list` → `<ul className="skeleton-list" aria-hidden="true">` із 3 рядками + `<p className="sr-only" role="status">Завантажуємо…</p>`; інакше `<p className="meta" role="status">Завантажуємо…</p>`. `LoadError({ message, onRetry }: { message: string; onRetry?: () => void })` — `<div className="load-error"><p className="error" role="alert">…</p>{onRetry && <button className="btn">Спробувати ще раз</button>}</div>`. `EmptyState({ text, children })` — `<div className="empty-state"><p className="lead">{text}</p>{children}</div>`. `PrivateData` error: `{ status: 'error'; message: string; retry?: () => void }`.

- [ ] **Крок 1: тести**: `PageState.test.tsx` (роль status/alert, кнопка викликає onRetry, скелет aria-hidden); `usePrivateData`: після помилки `retry()` повторює запит і дає `ready`.
- [ ] **Крок 2:** FAIL. **Крок 3:** реалізувати (перевірити, чи є клас `sr-only`; якщо ні — додати). **Крок 4:** PASS.
- [ ] **Крок 5:** коміт `feat(web): shared loading, error-with-retry and empty states (76)`.

### Задача 5. Стани на всіх сторінках з аудиту

**Files (Modify + їхні тести):** `pages/Profile.tsx`, `pages/Quizzes.tsx`, `pages/History.tsx`, `pages/MyGames.tsx`, `pages/Friends.tsx`, `pages/Groups.tsx`, `profile/ProfileSubpage.tsx` (`SubpageData`), `pages/GameHistory.tsx`, `pages/PublicProfile.tsx`, `pages/Library.tsx`, `pages/LibraryQuiz.tsx`, `pages/CreateGame.tsx`, `pages/HomeTop.tsx` (`useNextUp`: збій будь-якого запиту → картки немає, без необробленої відмови), `pages/Feed.tsx` (скелет + `retryLoad`); i18n (`emptyHostGame`, `emptyJoinByCode`, `libraryClearSearch`, зміни `historyEmpty`, `myGamesEmpty`).

- Скелет списку: стрічка, «Мої вікторини», «Створити гру», історія (обидві вкладки), бібліотека. Решта — `<Loading />`.
- Помилка завантаження скрізь — `LoadError` з `retry`.
- Порожні: історія → `EmptyState` + `Link className="btn btn-primary" to="/create"` «Провести гру»; «Мої ігри» → новий текст + `Link` на `/` «Увійти в гру за кодом»; бібліотека без результатів за наявного пошуку/мови → «Нічого не знайдено.» + кнопка «Очистити пошук» (прибирає `q` і `lang` з адреси й поле).
- «Створити гру» / «Мої вікторини»: окремий `loadError` від помилок дій; `quizzes === null && loadError !== null` → `LoadError` замість «Завантажуємо…».

- [ ] **Крок 1: тести** (у тестах сторінок): History порожня — посилання «Провести гру» на `/create`; MyGames порожня — «Увійти в гру за кодом» на `/`, тексту «Увійдіть» немає; Library: пошук без результатів → «Очистити пошук» прибирає `q`; CreateGame: `listQuizzes` → помилка: видно помилку й «Спробувати ще раз», немає «Завантажуємо…», повтор показує список; Profile/GameHistory/PublicProfile/LibraryQuiz: помилка → кнопка повтору перечитує.
- [ ] **Крок 2:** FAIL. **Крок 3:** реалізувати. **Крок 4:** PASS (`--project web src/pages src/profile src/inbox src/feed`).
- [ ] **Крок 5:** коміт `feat(web): retry, skeletons and actionable empty states on every page (76)`.

### Задача 6. Редактор: незбережене й «Провести гру»

**Files:**
- Create: `apps/web/src/nav/leave-guard.ts`, `apps/web/src/nav/leave-guard.test.tsx`
- Modify: `apps/web/src/editor/QuizEditor.tsx` (`useLeaveGuard(dirty)`; кнопка «Провести гру» у `footer.actions`, коли передано `onHost`), `apps/web/src/pages/EditQuiz.tsx` (`onHost` для `id !== undefined` через `useStartGame`), тести редактора; i18n (`leaveUnsaved`, `editorHostGame`, `editorHostSaveFirst`).

**Interfaces:**
- Produces: `useLeaveGuard(active: boolean, message: string): void` — поки `active`, `document.addEventListener('click', …, true)`: лише ліва кнопка без модифікаторів, найближчий `a[href]` без `target`/`download`, той самий origin і інший `pathname+search` → `window.confirm(message)`; «Скасувати» → `event.preventDefault()`. `QuizEditor` prop `onHost?: () => Promise<string | null>` (помилка → `serverError`).

- [ ] **Крок 1: тести**: брудний редактор, клік по `Link` меню → `confirm` з текстом `leaveUnsaved`; відмова — адреса та сама; згода — перехід; чистий редактор — без `confirm`; Ctrl+клік і `target="_blank"` — без `confirm`; «Провести гру» для збереженої вікторини викликає `createGame(id)` і веде на `/host/<код>`; брудний — кнопка вимкнена й видно `editorHostSaveFirst`; нова вікторина — кнопки немає.
- [ ] **Крок 2:** FAIL. **Крок 3:** реалізувати. **Крок 4:** PASS.
- [ ] **Крок 5:** коміт `feat(web): editor asks before leaving with unsaved changes and can host the saved quiz (76)`.

### Задача 7. Перевірка

- [ ] `pnpm typecheck` — без помилок.
- [ ] `pnpm l10n check <lang>` для en, de, es, it, pl, ar.
- [ ] Увесь web-набір частинами: `npx vitest run --maxWorkers=2 --project web <тека>` для `src/pages`, `src/editor`, `src/profile`, `src/admin`, решта.
- [ ] `pnpm build`; e2e оболонки/меню/редактора (`apps/server/e2e/*part67*`, `*part74*`, файли з `shell`/`menu`) — по одному.
- [ ] Виправлення — окремими комітами `fix(web): … (76)`.
