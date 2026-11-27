# План 77. Навігація, етап 2 «Нове меню й одна адреса на сторінку»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** меню з п'яти пунктів (Головна · Вікторини · Стрічка · Історія · Профіль), сторінка «Вікторини» з вкладками Мої · Бібліотека · Вподобані, однакові назви («Провести гру», «Нова вікторина», «Бібліотека»), картка вікторини з двома кнопками й «⋯», «Провести гру» прямо з бібліотеки, одна адреса на кожну сторінку.

**Архітектура:** чиста функція `menuSection(pathname)` (`apps/web/src/nav/menu-section.ts`) каже, який пункт меню світиться на будь-якій адресі; `Menu` лише мапить розділ на пункт. Вкладки «Вікторини» — `apps/web/src/pages/QuizzesTabs.tsx` (посилання `NavLink`, як `HistoryTabs`). Канонічні адреси — компонент `Canonical` у `AppRoutes` (`<Navigate replace>` зі збереженням `?query` і `#hash`). «⋯» — спільний `apps/web/src/ui/ActionMenu.tsx`; картка — `apps/web/src/pages/QuizCard.tsx`; логіка експорту винесена в хук `useQuizExport`. «Провести гру» з бібліотеки — сервер віддає `hostQuizId` у `LibraryDetail` (своя вікторина автора або остання ще жива копія глядача), клієнт копіює лише тоді, коли копії немає, і запускає `useStartGame`.

**Стек:** React 19, react-router-dom 7 (`BrowserRouter`), Fastify + drizzle, vitest + jsdom, playwright e2e.

**Специфікація:** `docs/superpowers/specs/2026-11-27-navigation-ux-design.md`, «Етап 2».

## Рішення будівельника

- **Адреси вкладок:** «Мої» — `/quizzes`, «Бібліотека» — `/library`, «Вподобані» — `/quizzes/liked`. `/library` лишається тією самою адресою і для гостя (без вкладок, як зараз), і для акаунта (з вкладками): усі вже розіслані посилання на бібліотеку й картки `/library/:id` працюють. `/quizzes/liked` — статичний сегмент, react-router ставить його вище за `/quizzes/:id` (id вікторин — uuid, не «liked»). Вкладки — справжні посилання (відкрити в новій вкладці, «назад» браузера), `tabGroup` = `quizzes` для всіх трьох: перемикання не переносить фокус на h1.
- **«Вподобані»:** уміст колишньої `/profile/likes` (картка «скільки ❤️ зібрав» + списки «Мені сподобались» / «Сподобались іншим») переїжджає на `/quizzes/liked`; `/profile/likes` → перенаправлення. Плитка профілю «Вподобання» лишається, але веде на `/quizzes/liked` (без неї сітка 4×2 плиток дає дірку; профіль перегрупується в етапі 4).
- **`/profile/quizzes` лишається:** це не «Мої вікторини», а «найзіграніші першими» зі статистикою (`PopularQuizzes` з профілю; «Усі» з блоку «Популярні»). Спеціфікація прибирає плитку в етапі 4; перенаправляти зараз означало б загубити цей список.
- **Канонічні адреси:** `/profile/friends`, `/profile/prizes`, `/profile/achievements`, `/profile/groups` (усе, що з профілю, живе під `/profile`). `/friends`, `/prizes`, `/achievements`, `/groups` → `<Navigate replace>` на них зі збереженням `?query#hash`. Внутрішні посилання — на канонічні. Ігрові екрани (`InviteFriends`, `PrizePlaces` відкривають `/friends`, `/prizes` у новій вкладці) не чіпаємо — їх обслуговує перенаправлення.
- **Підсвітка меню (`menuSection`):** `home` — `/`, `/report`; `quizzes` — `/quizzes*`, `/library*`, `/create`, `/help`, `/challenge/*`; `feed` — `/feed*`; `history` — `/history*`, `/me`; `profile` — `/profile*`, `/groups/join/*` (і старі аліаси); `admin` — `/admin*`; `inbox` — `/inbox` (дзвіночок); `login` — `/login`. Гість: `quizzes` на `/library*` світить «Бібліотеку», решта `quizzes` (довідка) — «Головну»; невідоме — «Головна».
- **Назви:** `menuJoin`/`menuShortJoin` → «Головна», `menuQuizzes`/`menuShortQuizzes` → «Вікторини», `menuShortLibrary` → «Бібліотека», `startCreate` → «Провести гру» (сторінка `/create`, кнопка головної, заголовок вкладки), `play` → «Провести», `edit` → «Змінити». Кнопка «📚 Бібліотека» на панелі «Мої вікторини» зникає (є вкладка); на картці — «Поділитися в бібліотеку» (новий ключ). «Каталог» у uk-текстах (довідка бібліотеки, підтвердження адміна) → «бібліотека».
- **Картка вікторини:** «Провести» (основна) і «Змінити» (посилання) + «⋯» (`aria-haspopup="menu"`, `aria-expanded`, `aria-label` «Ще дії: {title}»). Меню: «Автопілот», «Кинути виклик», «Поділитися в бібліотеку», «Експорт: файл вікторини», «Експорт: таблиця (Excel)», «Видалити». Відкриття — фокус на перший пункт; ↑/↓/Home/End; Escape і клік поза меню закривають і повертають фокус на «⋯»; вибір пункту закриває меню. Копіювати власну вікторину на картці не було — нової дії не вигадуємо. Прогрес і помилки експорту — під кнопками картки (хук `useQuizExport`, той самий, що в `ExportMenu`).
- **«Провести гру» з бібліотеки:** у `LibraryDetail` нове необов'язкове поле `hostQuizId` (лише для акаунта): автор — id своєї вікторини; інший — найсвіжіша копія з `library_copy` цього запису, що ще існує (`quiz_id` не null, власник — глядач). Кнопка: є `hostQuizId` — одразу `useStartGame(hostQuizId)`; немає — `copyLibrary` і запуск нової копії. Так повторне «Провести гру» не плодить копій у «Мої вікторини». Якщо запуск не вдався після копіювання — показуємо «Скопійовано…» з посиланням на копію й помилку. Гість — посилання-кнопка «Увійти, щоб провести» на `/login?next=<ця сторінка>`. Без міграції БД.

## Глобальні обмеження

- **`GAME_STATE_VERSION` не змінювати**; міграцій БД немає; ігрові екрани (`Play`, `Host`, `Stage`, `BotHost`, `apps/web/src/screens`, `apps/web/src/live`) не змінюються.
- Тексти інтерфейсу — українською, нові uk-тексти на «ти»; нові ключі — у 7 мовах, список **`ADDED_77`** у `apps/web/src/i18n.test.ts` + тест «77 keys are in every locale» (переклад ≠ uk, ті самі `{змінні}`), змінені uk — у `CHANGED_LATER` з перекладами. `pnpm l10n check <lang>` для en, de, es, it, pl, ar.
- **Prettier не запускати.** `python3` — заглушка. `git stash` — ні. Коментарі в коді — українською.
- Тести — у передньому плані, по одному запуску, `--maxWorkers=2`. E2E — `pnpm build`, потім по одному файлу з `timeout 590`.
- Коміти — англійською, наприкінці «(77)», з рядками `Co-Authored-By` і `Claude-Session`. Не зливати й не пушити.

### Нові ключі i18n (uk)

| Ключ | uk |
|---|---|
| `quizzesTabMine` | `Мої` |
| `quizzesTabLiked` | `Вподобані` |
| `quizzesLikedTitle` | `Вподобані вікторини` |
| `quizMoreActions` | `Ще дії: {title}` |
| `quizShareLibrary` | `Поділитися в бібліотеку` |
| `quizExportFile` | `Експорт: файл вікторини` |
| `quizExportTable` | `Експорт: таблиця (Excel)` |
| `libraryHost` | `Провести гру` |
| `libraryHostSignIn` | `Увійти, щоб провести` |

Вкладка «Бібліотека» й aria-label вкладок беруть наявні `libraryTitle` і `menuQuizzes`.

Змінені uk (у `CHANGED_LATER`, переклади оновити): `menuJoin`, `menuShortJoin` → `Головна`; `menuQuizzes`, `menuShortQuizzes` → `Вікторини`; `menuShortLibrary` → `Бібліотека`; `startCreate` → `Провести гру`; `play` → `Провести`; `edit` → `Змінити`; `adminRestoreQuizConfirm` («в каталог» → «в бібліотеку»). Переклади `edit` лишаються («Edit» уже точне); `menuShortLibrary` у de/pl/es/it лишається «Katalog»/«Catálogo»/«Catalogo» — «Bibliothek» тощо довші за 8 графем короткого підпису. Довідка бібліотеки й виклику (`setting.library.*`, `setting.challenge.how.0`) — «⋯» → «Поділитися в бібліотеку» / «🏁 Виклик», «бібліотека» замість «каталог», «Провести гру» з бібліотеки; golden довідки оновлено.

**Знайдене під час e2e:** короткий підпис «Вікторини» на 320 px ширший за п'яту частину меню — мінімальний шрифт підписів меню знижено з 11 до 10 px (`clamp(0.625rem, 3.1vw, 0.8125rem)`); `/quizzes/liked` не редактор — мова профілю на ній вмикається одразу (`LIVE_GAME_PATH` у `locales/choose.ts`).

## Review Focus

1. Меню світить рівно один пункт на кожній сторінці з меню (тест-таблиця `menuSection` + тест `Menu`).
2. `/friends?x=1#y` → `/profile/friends?x=1#y` одним `replace` (без зайвого запису історії).
3. «⋯» з клавіатури: відкрити Enter/↓, пройти ↑/↓, Escape повертає фокус на «⋯»; клік поза меню закриває.
4. «Провести гру» з бібліотеки вдруге не створює другої копії; видалена копія — створюється нова.
5. Тексти e2e, що шукали «Грати» / «Редагувати» / «Меню» / «Мої вікторини» в меню, оновлено механічно.

---

### Задача 1. Меню: п'ять пунктів і підсвітка за розділом

**Files:**
- Create: `apps/web/src/nav/menu-section.ts`, `apps/web/src/nav/menu-section.test.ts`
- Modify: `apps/web/src/menu/Menu.tsx`, `apps/web/src/menu/Menu.test.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/locales/*.json`, `apps/web/src/i18n.test.ts`

**Interfaces:**
- Produces: `type MenuSection = 'home' | 'quizzes' | 'feed' | 'history' | 'profile' | 'admin' | 'inbox' | 'login'`; `menuSection(pathname: string): MenuSection` (невідоме — `home`).

- [ ] **Крок 1: тести** — таблиця шляхів (`/create`, `/help`, `/report`, `/challenge/AB12`, `/library/1`, `/quizzes/liked`, `/friends`, `/groups/join/x`, `/profile/5/achievements`, `/me`, `/feed/calendar`, `/admin/users`, `/inbox`, `/login`); `Menu`: акаунт — `['Головна', 'Вікторини', 'Стрічка', 'Історія', 'Профіль']`, адмін — + «Адмінка», гість — `['Головна', 'Бібліотека', 'Увійти']`; на `/create` світиться «Вікторини», на `/report` — «Головна», гість на `/library/1` — «Бібліотека».
- [ ] **Крок 2:** FAIL. **Крок 3:** реалізувати, змінити uk-тексти й переклади. **Крок 4:** PASS (+ `i18n.test.ts`).
- [ ] **Крок 5:** коміт `feat(web): five-item menu Home · Quizzes · Feed · History · Profile with per-section highlight (77)`.

### Задача 2. Одна адреса на сторінку

**Files:**
- Modify: `apps/web/src/AppRoutes.tsx`, `apps/web/src/AppRoutes.test.tsx`, `apps/web/src/pages/Feed.tsx` (`/friends` → `/profile/friends`), інші внутрішні посилання з grep.

- [ ] **Крок 1: тести** — `/friends?tab=x#a` → `/profile/friends?tab=x#a`, `/prizes`, `/achievements`, `/groups` — так само; `/profile/likes` → `/quizzes/liked`; `/profile/quizzes` лишається своєю сторінкою.
- [ ] **Крок 2–4:** FAIL → `Canonical` → PASS.
- [ ] **Крок 5:** коміт `feat(web): one address per page, old aliases redirect keeping the query (77)`.

### Задача 3. «Вікторини» з вкладками Мої · Бібліотека · Вподобані

**Files:**
- Create: `apps/web/src/pages/QuizzesTabs.tsx`, `apps/web/src/pages/QuizzesLiked.tsx`, `apps/web/src/pages/QuizzesLiked.test.tsx`
- Modify: `apps/web/src/pages/Quizzes.tsx` (вкладки над h1, без кнопки «📚 Бібліотека»), `apps/web/src/pages/Library.tsx` (вкладки для акаунта), `apps/web/src/AppRoutes.tsx`, `apps/web/src/nav/page-meta.ts` (+ `/quizzes/liked`, `tabGroup` `quizzes`), `apps/web/src/profile/ProfileTiles.tsx` (плитка → `/quizzes/liked`), видалити `apps/web/src/pages/profile/ProfileLikes.tsx`; тести.

- [ ] **Крок 1: тести** — `/quizzes`, `/library` (акаунт) і `/quizzes/liked` показують навігацію «Вікторини» з трьома посиланнями й `aria-current` на своїй; гість на `/library` вкладок не бачить; `/quizzes/liked` без входу → `/login?next=%2Fquizzes%2Fliked`; `tabGroup('/library') === tabGroup('/quizzes/liked')`.
- [ ] **Крок 2–4.** **Крок 5:** коміт `feat(web): quizzes page with My · Library · Liked tabs; liked quizzes move from the profile (77)`.

### Задача 4. Назви

**Files:** `apps/web/src/i18n.ts`, `apps/web/src/locales/*.json`, `apps/web/src/help/help-uk.ts`, тести, що шукали старі назви.

- [ ] Кроки TDD: `/create` має h1 «Провести гру», головна — кнопку «Провести гру»; коміт `feat(web): consistent names — «Провести гру», «Вікторини», «Бібліотека» (77)`.

### Задача 5. Картка вікторини: «Провести», «Змінити» і «⋯»

**Files:**
- Create: `apps/web/src/ui/ActionMenu.tsx`, `apps/web/src/ui/ActionMenu.test.tsx`, `apps/web/src/pages/QuizCard.tsx`
- Modify: `apps/web/src/quiz-io/ExportMenu.tsx` (хук `useQuizExport` + `ExportStatus`), `apps/web/src/pages/Quizzes.tsx`, `apps/web/src/pages/Quizzes.test.tsx`, `apps/web/src/styles.css`

**Interfaces:**
- Produces: `ActionMenu({ label, items }: { label: string; items: { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean }[] })`; `useQuizExport(quizId): { run(kind: 'file' | 'table'): void; busy: boolean; status: JSX.Element | null }`.

- [ ] **Крок 1: тести** `ActionMenu.test.tsx` (aria, клавіатура, Escape, клік поза, вибір закриває); `Quizzes.test.tsx`: у картці видно лише «Провести», «Змінити», «⋯»; кожна дія з меню працює як раніше.
- [ ] **Крок 2–4.** **Крок 5:** коміт `feat(web): quiz card with two main buttons and a «⋯» menu for the rest (77)`.

### Задача 6. «Провести гру» з бібліотеки

**Files:**
- Modify: `packages/shared/src/library.ts` (`hostQuizId?: string`), `apps/server/src/library-store.ts` (`entryDetail`), `apps/server/src/library-routes.test.ts`, `apps/web/src/pages/LibraryQuiz.tsx`, `apps/web/src/pages/LibraryQuiz.test.tsx`

- [ ] **Крок 1: тести** — сервер: гість без `hostQuizId`; автор — свій quizId; інший до копії — без поля, після копії — id копії, після видалення копії — знову без; дві копії — найсвіжіша. Веб: без `hostQuizId` — копія й запуск копії; з `hostQuizId` — запуск без копії; гість — «Увійти, щоб провести» з `next`.
- [ ] **Крок 2–4.** **Крок 5:** коміт `feat: host a library quiz straight from its page, reusing an earlier copy (77)`.

### Задача 7. E2E

**Files:** `apps/server/e2e/helpers/common.ts` (`MENU_ITEMS_23A`), e2e, що шукали «Грати», «Редагувати», «Меню», «Мої вікторини» (меню й плитки головної), «📚 Бібліотека», `/profile/likes`.

- [ ] `pnpm build`; по одному файлу: part22-24, part47, part67, part74, core, part17-21 і ті, де змінено логіку, а не лише назву; коміт `test(e2e): menu, card and library names for navigation stage 2 (77)`.
