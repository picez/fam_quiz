# План 8c: анімації переходів — раунд, запитання, клітинка поля, фінал, дуель, підсумки

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 8c специфікації (розділ 5).
- **Новий раунд.** На сцені на весь екран — анімована заставка «Раунд 2» з назвою раунду (2,5 с), під нею вже стоїть звична інформація про раунд, яка відкривається, коли заставка зникає. На телефонах — та сама заставка в меншому вигляді.
- **Нове запитання.** Коротка заставка «Запитання 5» (1,2 с) на сцені й телефонах, потім запитання. **Таймер запитання починається після заставки, на сервері.** Лише в класичному раунді й у фіналі; у бліці й дуелях заставки між запитаннями немає.
- **Клітинка поля.** Вибрана клітинка перегортається й збільшується в запитання (категорія й ціна, 1 с) — замість «Запитання N»; таймер так само стартує після неї.
- **Фінал** — окрема, урочистіша заставка «Фінал» (3,2 с). **Дуель** — «Дуель! Іра ⚔ Оля» (2 с). **Підсумки** — заставка «Підсумки» перед п'єдесталом (2,5 с).
- «Менше руху» в системі — замість руху коротке проявлення. Вимикача немає. Консоль ведучого заставками не блокується.

**Архітектура:**
- **Годинник заставки — у рушії.** `GameState.splash: { kind, at, until } | null` — яка заставка йде й до якої миті сервера. Для заставок перед запитанням (`question`, `cell`) `openQuestion` ставить `startedAt = until`, а `endsAt = until + ліміт`: тож час відповіді, бонус швидкості, особисті кінці 8a/8b (`deadlineOf`, `closesAt`, `grantOvertime`), голосування (`vote.endsAt = now + 15 с`) і запасне (`spare.startedAt = now`) рахуються від справжнього старту без жодної зміни — бафи до старту взяти не можна. Відповіді, натискання, ходи ланцюжка й сортування, бафи й відповіді дуелі до `startedAt` відхиляються кодом `not_started`. Окремого таймера сервера на мить старту немає: стан у цю мить не змінюється, клієнти знімають заставку самі за `until`.
- **Перемикач `transitions`.** `createGame(quiz, { transitions })` → `GameState.transitions`. Без нього (`false`, типово) заставок немає й час іде як зараз: сотні наявних тестів рушія й сервера не змінюють очікувань. `RoomManager` і `buildApp` отримують ту саму опцію (типово `false`), а `main.ts` і наскрізні тести вмикають її завжди. Для гравців і ведучого вимикача немає.
- **Зрізи.** Нове поле `BaseView.splash: SplashView | null` (`{ kind, at, until }` — час сервера) для всіх ролей; поза своїм етапом — `null`. Клієнт порівнює з годинником сервера (`offsetMs`, як `Timer`), тож перепідключення посеред заставки показує її з того самого місця (від'ємна `animation-delay`), а після її кінця — одразу екран етапу.
- **Пауза.** Заставка, що не скінчилася до паузи, стоїть разом із годинником: `resume` зсуває `at`/`until` на тривалість паузи — так само, як уже зсуває `startedAt`/`endsAt`. На паузі клієнти заставку не показують.
- **Веб.** `apps/web/src/live/Splash.tsx`: хук `useSplash`, компонент `Splash` (сцена — `size="stage"`, телефон — `size="phone"`), перегортання клітинки, `SplashChip` для пульта. Заставка — шар `position: fixed; inset: 0` над незмінною розкладкою етапу, тож поява й зникнення нічого не зсувають. Анімації — CSS із тривалістю `--splash-ms` і затримкою `--splash-elapsed`.

**Технології:** TypeScript, vitest, Fastify + Socket.IO, React + Vite, CSS-анімації, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-23-buffs-transitions-design.md` — розділ 5 (частина 8c), анти-цілі розділу 2 («гравець утрачає час через анімацію: таймер запитання не біжить, поки йде заставка», «елементи на екрані гравця стрибають», «старі вікторини … поводяться інакше»), рішення розділу 8 («анімації без вимикача, з повагою до «менше руху»», «заставки між запитаннями немає в бліці й дуелях; на полі її замінює перегортання клітинки»), розділ 7 (тривалість і вигляд — на будівельнику). Зразки: годинник паузи в `packages/engine/src/game.ts` (`pause`, `resume`), `packages/engine/src/timing.ts` (`adjustTime`, особисті кінці), клієнтський годинник `apps/web/src/clock.ts` і `apps/web/src/live/Timer.tsx` (`useTimeOver`), сповіщення `LiveNotices.tsx` (`position: fixed`, `offsetMs`), тести CSS у `apps/web/src/screens/Buffs.test.tsx` (`rule()`).

**Рішення плану там, де специфікація мовчить:**
- **Тривалості** (`SPLASH_MS` у `packages/engine/src/splash.ts`): `round` 2500, `final` 3200, `question` 1200, `cell` 1000, `duel` 2000, `podium` 2500 мс. Одна тривалість для всіх екранів, бо кінець заставки — це старт таймера на сервері.
- **Де яка заставка** (`SplashKind = 'round' | 'final' | 'question' | 'cell' | 'duel' | 'podium'`):
  - `round` / `final` — вхід у етап `intro` (`start` і `next` з `round_end`); `final` — якщо раунд фінальний. Нічого не затримує: «Почати раунд» ведучий може натиснути й під час заставки — тоді її заступає заставка запитання (або поле).
  - `question` — `openQuestion` у класичному раунді й у фіналі (запитання фіналу — текст «Запитання фіналу», бо воно одне).
  - `cell` — `openQuestion` на полі, для кожної клітинки (звичайна, бліц-клітинка, усна). Відлік відсутності вибравшого (`awaySince`) іде з відкриття, як зараз (30 с проти 1 с перегортання).
  - бліц-раунд — без заставки: `openQuestion` ставить `splash: null`, `startedAt = now`.
  - `duel` — `beginDuel` (етап `duel`, крок вибору категорії). Якщо категорію вибрали ще під час заставки (ведучий не блокується), перше запитання дуелі стартує о `max(now, until)`; наступні запитання дуелі — одразу, як зараз.
  - `podium` — вхід у `finished` (`finishRound` після останнього раунду, `endRound`, `end`, зокрема `end` після відсутності ведучого). Підсумки раунду (`round_end`) заставки не мають.
- **Відповідність етапу** у зрізі: `round`, `final` ↔ `intro`; `question`, `cell` ↔ `question`; `duel` ↔ `duel`; `podium` ↔ `finished`. Інакше `splash: null` (наприклад, `question` на етапі `locked`, `duel` після повернення гри з дуелі). Застарілу заставку (`until` у минулому) зріз не прибирає — зрізи без `now`; клієнт її просто не показує.
- **`not_started`** — новий `ErrorCode`, текст «Запитання ще не почалося.». Умова — `state.startedAt !== null && now < state.startedAt` (`notStarted` у `splash.ts`). Перевіряється в `submitAnswer` (після `paused`, до `not_found`), `buzz`, `takeBuff` (після `paused`), `guessWord`/`takeHint` (`checkTurn`), `sortWord`, `answerDuel`. Голос залу й прийняття відповіді ведучим можливі лише після старту, тож окремої перевірки не потребують. Допуску до старту немає: `offsetMs` клієнта рахується як `serverNow − Date.now()` у мить отримання зрізу, тобто відстає на затримку мережі — телефон знімає заставку не раніше, ніж сервер почав запитання.
- **`startedAt` у майбутньому**: `timeMs = max(0, now − startedAt)` скрізь лишається правильним; `remainingOf` під час заставки повертає більше за ліміт — клієнтський `Timer` уже обрізає до повного часу (8b), а пульт обрізає `secondsNow` так само (задача 7).
- **«±15 с» під час заставки** рахується від старту запитання: `adjustTime` бере `clock = max(now, startedAt)` замість `now` (залишок не більший за ліміт, межі 5 і 120 с правильні); `startedAt` не змінюється. На паузі посеред заставки `remainingMs` містить залишок заставки — межі 5/120 с там можуть бути неточні на ≤ 1,2 с (рідкісний випадок, без окремої логіки).
- **Пауза посеред заставки.** `pause` не змінюється. `resume` після будь-якої гілки викликає `shiftSplash(state, pausedAt, shift)`: якщо `splash.until > pausedAt`, `at` і `until` зсуваються на `shift`. Для запитання з таймером це збігається з новим `startedAt = endsAt − limitMs` (той самий зсув), без таймера — з `startedAt + shift`.
- **Дебафи** спрацьовують на відкритті, але `since` = `startedAt` (старт запитання), щоб ефекти з відліком від `since` (`useElapsed` у `Debuffs.tsx`) не витрачали свій час під заставкою; від'ємний `elapsed` до старту означає «ще не почалося».
- **Ведучий** не має шару заставки. Під час заставки всі його кнопки працюють («Закрити», «±15 с», пауза, дебафи, вилучення). Невеликий значок `SplashChip` «На екрані заставка» — `position: fixed` у правому верхньому куті пульта, лише поки йде заставка (нічого не зсуває).
- **Клієнт.** `useSplash(splash, paused, offsetMs)` повертає `{ splash, elapsed }`, поки `serverNow < until` і не пауза; таймер `setTimeout` на `until` прибирає шар без щосекундних перемальовувань. `elapsed = (until − at) − left` (а не `serverNow − at`), тож після зсуву паузою анімація продовжується з місця зупинки. Шар має `aria-hidden="true"`: той самий зміст уже є в розкладці етапу під ним; поки шар є, він перехоплює дотики (тап по варіанту під заставкою нічого не робить).
- **Вміст** (`i18n.ts`): `round` — «Раунд {index}» + назва раунду (`roundLabel`; без назви — назва типу); `final` — «Фінал» + тема фіналу (якщо є), промені й іскри; `question` — «Запитання {index}» і «з {total}» (у фіналі — «Запитання фіналу»); `cell` — картка: лице — ціна (як клітинка поля), зворот — категорія, ціна й позначки (`×2`, «Бліц»); `duel` — «Дуель!» і «{challenger} ⚔ {opponent}» кольорами сторін дуелі; `podium` — «Підсумки» і «Хто ж переміг?».
- **Розміри.** Сцена: заголовок `clamp(4rem, 10vw, 9rem)`. Телефон («менший вигляд»): той самий шар на весь екран, заголовок `clamp(2.25rem, 12vw, 3.25rem)`, довга назва переноситься (`overflow-wrap: anywhere`), без горизонтальної прокрутки на 360–375 px.
- **«Менше руху».** Базова анімація кожного шару — `splash-fade` (лише `opacity`: проявлення за перші 10 % часу, згасання за останні 10 %). Рух (масштаб, перегортання, промені, іскри, з'їзд імен дуелі) — лише в `@media (prefers-reduced-motion: no-preference)`. Тривалість та сама, бо це годинник сервера.
- **Шар над усім, крім аркушів.** `.splash { z-index: 65 }` — над сповіщеннями (60), смугами дебафу й дуелі (55), значками сцени (50); під аркушем голосування (70) і вікном вибору суперника (80).
- **Тексти без родів:** «Раунд {index}», «Фінал», «Запитання {index}», «з {total}», «Запитання фіналу», «Дуель!», «{challenger} ⚔ {opponent}», «Підсумки», «Хто ж переміг?», «На екрані заставка», «Запитання ще не почалося.».

## Глобальні обмеження

- Старі вікторини, чернетки, історія й профіль не змінюються: схема вікторини не чіпається, міграцій немає. Рушій без `transitions` поводиться точно як зараз.
- Рушій чистий: `now` і `rng` — аргументи. Нові необов'язкові `now` у `start`, `end`, `beginDuel` потрібні лише для заставок: без `now` заставки немає (так викликають наявні тести).
- Анти-ціль «втрачений час»: між відкриттям і `startedAt` жодна дія гравця не приймається, а час відповіді, бонус швидкості, особисті кінці, голосування й запасне рахуються від `startedAt`. Ведучий ніколи не чекає на заставку.
- Анти-ціль «стрибки»: заставка — лише `position: fixed` шар; розкладка етапу під нею вже стоїть і після зникнення шару не змінюється.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`. Нові кольори — токени в `:root` у `styles.css` (`--splash-bg`, `--splash-accent`, `--final-gold`, `--final-ray`). Тема лише темна. Нові класи мають префікс `splash-` (і модифікатори `is-…`).
- Розкладка працює на ширині 375 px (і 360 px) без горизонтальної прокрутки. Рух — лише за `prefers-reduced-motion: no-preference`.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2` (саме `--maxWorkers=2`: паралельні робітники PGlite падають на цій машині; якщо PGlite все одно падає з браком пам'яті — запускати окремо `pnpm vitest run --maxWorkers=2 packages`, `… apps/server`, `… apps/web`).
- Наскрізні тести: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Кадри — з `E2E_SHOTS=1` у `apps/server/e2e/artifacts/shots`. Наскрізні тести йдуть зі справжніми заставками й справжніми очікуваннями; змінної середовища для коротших заставок немає.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (проєкт тестовий).

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/game.ts` | `SplashKind`, `ErrorCode` + `not_started` | 1 |
| `apps/web/src/i18n.ts` | `err_not_started` | 1 |
| `packages/engine/src/splash.ts` (новий), `index.ts` | `SPLASH_MS`, `Splash`, `withSplash`, `questionSplashKind`, `notStarted`, `shiftSplash`, `splashUntil` | 1 |
| `packages/engine/src/game.ts` | `GameOptions`, `GameState.transitions`/`splash`, `createGame`, `openQuestion`, `submitAnswer`, `resume` | 1 |
| `packages/engine/src/timing.ts`, `blitz.ts` (`buzz`), `buffs.ts` (`takeBuff`), `chain.ts` (`checkTurn`), `sort.ts` (`sortWord`), `debuffs.ts` (`fireDebuffs` — виклик) | `clock = max(now, startedAt)`, `not_started` | 1 |
| `packages/engine/src/testing/helpers.ts` | `lobbyWithSplash`, `openAt` | 1 |
| `packages/engine/src/game.ts` (`start`, `next`, `finishRound`, `endRound`, `end`), `duel.ts` (`beginDuel`, `openDuelQuestion`, `answerDuel`) | заставки раунду, фіналу, дуелі й підсумків | 2 |
| `packages/shared/src/views.ts`, `packages/engine/src/views.ts`, веб-фабрики зрізів у `StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `HostScreen.test.tsx`, `DuelView.test.tsx` | `SplashView`, `BaseView.splash`, `splashView` | 3 |
| `apps/server/src/rooms/manager.ts`, `app.ts`, `main.ts`, `rooms/manager.test.ts`, `socket.test.ts` | опція `transitions`, `start`/`end` з `now` | 4 |
| `apps/web/src/clock.ts`, `apps/web/src/live/Splash.tsx` (новий), `apps/web/src/i18n.ts`, `apps/web/src/styles.css` | `splashLeft`, `useSplash`, `Splash`, `CellFlip`, `SplashChip`, тексти, стилі | 5 |
| `apps/web/src/screens/StageScreen.tsx` | заставки сцени | 6 |
| `apps/web/src/screens/PlayerScreen.tsx`, `HostScreen.tsx` | заставки телефона, значок і обрізаний залишок у пульті | 7 |
| `apps/server/e2e/full-game.e2e.ts`, `apps/server/e2e/vitest.config.ts` | справжні заставки в наявних сценаріях | 8 |
| `apps/server/e2e/full-game.e2e.ts` | наскрізний сценарій 8c | 9 |

## Порядок збирання

- Задача 1 (годинник запитання) — основа: `SplashKind`, `not_started` і його текст `err_not_started` (його вимагає `errorText`), тож `pnpm typecheck` зелений. Задача 2 (заставки раунду, фіналу, дуелі, підсумків) — на 1. Задача 3 (зрізи) — на 1–2; нове обов'язкове поле `splash` закривається механічним `splash: null` у чотирьох веб-фабриках у тій самій задачі.
- Задача 4 (сервер) — на 1–3. Задача 5 (веб-основа) — на 3. Задачі 6 і 7 (екрани) — на 5. Задача 8 (наявні e2e) — на 4–7. Задача 9 (новий e2e) — остання.
- Наявні тести не змінюють очікувань, окрім механічного `splash: null` у веб-фабриках (задача 3) і точкових очікувань у наявних наскрізних сценаріях (задача 8, лише додані очікування `afterSplash`, без зміни перевірок).

## На що дивитися рецензентові

1. **Ніхто не втрачає часу.** `startedAt = until`, `endsAt = until + ліміт`; до старту — `not_started` для кожної дії гравця; бонус швидкості за відповідь рівно на старті повний; бафи 8a/8b (додатковий час, голосування, запасне) рахуються від миті, коли їх узято, — а це завжди після старту. Тести: задача 1, `the classic question timer starts after the splash`, `nothing a player does counts before the start`, `buffs keep their clocks after a splash`; задача 2, `a duel category picked during the splash starts the duel clock after it`.
2. **Пауза й «±15 с» посеред заставки.** Пауза заморожує заставку разом із таймером, `resume` зсуває обидва однаково; «±15 с» рахується від старту. Тести: задача 1, `pause during the splash…`, `±15 s during the splash…`.
3. **Без перемикача — як раніше.** `createGame(quiz)` без опції: `splash: null`, `startedAt = now`; сервер без опції — так само; `main.ts` і e2e вмикають. Тести: задача 1, `without transitions nothing changes`; задача 4, `the manager runs splashes only when asked`.
4. **Перепідключення посеред заставки.** Зріз містить `at`/`until`; клієнт показує шар з від'ємною затримкою і прибирає точно на `until` за годинником сервера; на паузі шару немає. Тести: задача 5, `a splash joined midway continues from the same point`, `no splash while paused or after it ended`; задача 9, перезавантаження телефона під час заставки фіналу.
5. **Нічого не стрибає, ведучий не заблокований, «менше руху».** Шар `position: fixed` над незмінною розкладкою; у пульті шару немає, кнопки працюють; рух лише за `no-preference`, базова анімація — лише `opacity`. Тести: задача 5, `the splash is a fixed layer and moves only without reduced motion`; задача 7, `the host console is never covered`; задача 9, вимір `y` запитання до й після заставки, «+15 с» ведучого під час заставки, сторінка з `reducedMotion: 'reduce'`.

---

### Задача 1. Рушій: годинник заставки запитання й перегортання клітинки

**Files:**
- Modify: `packages/shared/src/game.ts` (`SplashKind`, `ErrorCode`)
- Modify: `apps/web/src/i18n.ts` (`err_not_started`)
- Create: `packages/engine/src/splash.ts`
- Modify: `packages/engine/src/index.ts` (`export * from './splash'`)
- Modify: `packages/engine/src/game.ts` (`GameOptions`, `GameState`, `createGame`, `openQuestion`, `submitAnswer`, `resume`)
- Modify: `packages/engine/src/timing.ts` (`adjustTime`), `blitz.ts` (`buzz`), `buffs.ts` (`takeBuff`), `chain.ts` (`checkTurn`), `sort.ts` (`sortWord`)
- Modify: `packages/engine/src/testing/helpers.ts` (`lobbyWithSplash`, `openAt`)
- Create: `packages/engine/src/game.splash.test.ts`

**Interfaces:**
- Produces (`shared`):
  ```ts
  // game.ts
  /** Заставки переходів (частина 8c). */
  export type SplashKind = 'round' | 'final' | 'question' | 'cell' | 'duel' | 'podium';
  // ErrorCode: | 'not_started'
  ```
- Produces (`engine`):
  ```ts
  // splash.ts
  /** Тривалість кожної заставки, мс; кінець заставки запитання — старт його таймера. */
  export const SPLASH_MS: Record<SplashKind, number> = { round: 2500, final: 3200, question: 1200, cell: 1000, duel: 2000, podium: 2500 };
  /** Поточна заставка: вид і час сервера початку й кінця. */
  export interface Splash { kind: SplashKind; at: number; until: number }
  /** Ставить заставку kind з миті now; без state.transitions — splash: null. */
  export function withSplash(state: GameState, kind: SplashKind, now: number): GameState;
  /** Заставка перед запитанням: поле (board задано) — cell; класика й фінал — question; бліц — null. */
  export function questionSplashKind(state: GameState, board?: BoardPlay): SplashKind | null;
  /** Чи запитання (чи запитання дуелі) ще не почалося: startedAt у майбутньому. */
  export function notStarted(state: GameState, now: number): boolean;
  /** Після паузи: заставка, що не скінчилася до pausedAt, зсувається на shift (at і until). */
  export function shiftSplash(state: GameState, pausedAt: number, shift: number): GameState;
  /** Кінець поточної заставки цього виду, якщо вона є; інакше null. */
  export function splashUntil(state: GameState, kind: SplashKind): number | null;
  // game.ts
  export interface GameOptions {
    /** Заставки переходів (8c); вимкнено — час іде як до 8c (тести рушія й сервера). */
    transitions?: boolean;
  }
  export interface GameState {
    // …
    /** Чи грає ця гра заставки переходів. */
    transitions: boolean;
    /** Поточна або остання заставка; null — не було або transitions вимкнено. */
    splash: Splash | null;
  }
  export function createGame(quiz: Quiz, options?: GameOptions): GameState;
  // testing/helpers.ts
  /** Як lobbyWith, але гра із заставками. */
  export function lobbyWithSplash(quiz: Quiz, ...nicknames: string[]): GameState;
  /** «Почати гру» (без now — без заставки раунду), потім «Почати раунд» о now. */
  export function openAt(lobby: GameState, now: number, rng?: Rng): GameState;
  ```
- `openQuestion`: `const kind = questionSplashKind(state, board)`; `const marked = kind === null ? { ...state, splash: null } : withSplash(state, kind, now)`; `const at = marked.splash?.until ?? now`; `startedAt: at`, `endsAt: isTimed(question) ? at + question.timeLimit * 1000 : null`; `fireDebuffs(opened, at)`. `watchAway(…, now)` без змін.
- `adjustTime`: `const clock = Math.max(now, state.startedAt ?? now)`; у не-паузних і не-утриманих гілках `remainingOf(state, clock)` і `endsAt: clock + next` замість `now`.
- `resume`: наявне тіло перейменувати на внутрішню `resumeClock`; `resume` = `resumeClock(state, now)` → якщо `ok`, `shiftSplash(result.state, state.pausedAt ?? now, now - (state.pausedAt ?? now))`.
- Текст: `err_not_started: 'Запитання ще не почалося.'`.

- [ ] **Step 1: Write the failing tests** у `game.splash.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { buzz } from './blitz';
  import { pickCell } from './board';
  import { takeBuff } from './buffs';
  import { setDebuff } from './debuffs';
  import { createGame, lock, next, pause, recordOf, resume, start, submitAnswer, tick, type GameState } from './game';
  import { adjustTime } from './timing';
  import { blitzRound, boardRound, classicRound, finalRound, makeRoundsQuiz, single, withId, withVideo } from './testing/fixtures';
  import { lobbyWith, lobbyWithSplash, must, openAt } from './testing/helpers';

  const T0 = 1_000_000;
  const rng0 = () => 0;
  const right = { type: 'single', optionId: 'b' } as const;
  const classicQuiz = (speedBonus = true, buffs?: ['fifty']) =>
    makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')], { speedBonus })], buffs ? { buffs } : {});
  /** Класика із заставками: `single` (20 с, 1000 балів), відкрито о T0. */
  const classic = (speedBonus = true) => openAt(lobbyWithSplash(classicQuiz(speedBonus), 'Анна', 'Богдан'), T0);

  describe('the question splash', () => {
    it('a game is created without transitions unless asked', () => {
      expect(createGame(classicQuiz()).transitions).toBe(false);
      expect(createGame(classicQuiz()).splash).toBeNull();
      expect(createGame(classicQuiz(), { transitions: true }).transitions).toBe(true);
    });

    it('the classic question timer starts after the splash', () => {
      const s = classic();
      expect(s.splash).toEqual({ kind: 'question', at: T0, until: T0 + 1200 });
      expect(s.startedAt).toBe(T0 + 1200);
      expect(s.endsAt).toBe(T0 + 21_200);
    });

    it('nothing a player does counts before the start; an answer right at the start gets the full speed bonus', () => {
      let s = openAt(lobbyWithSplash(classicQuiz(true, ['fifty']), 'Анна', 'Богдан'), T0);
      expect(submitAnswer(s, 'p1', right, T0 + 1199)).toEqual({ ok: false, error: 'not_started' });
      expect(takeBuff(s, 'p1', 'fifty', T0 + 500, rng0)).toEqual({ ok: false, error: 'not_started' });
      s = must(submitAnswer(s, 'p1', right, T0 + 1200));
      // Та сама відповідь у грі без заставок рівно на відкритті — еталон повного бонусу швидкості.
      const plain = must(submitAnswer(openAt(lobbyWith(classicQuiz(), 'Анна', 'Богдан'), T0), 'p1', right, T0));
      expect(recordOf(s, 0, 'p1')?.timeMs).toBe(0);
      expect(recordOf(s, 0, 'p1')?.points).toBe(recordOf(plain, 0, 'p1')?.points);
    });

    it('without transitions nothing changes', () => {
      const s = openAt(lobbyWith(classicQuiz(), 'Анна', 'Богдан'), T0);
      expect(s.splash).toBeNull();
      expect([s.startedAt, s.endsAt]).toEqual([T0, T0 + 20_000]);
      expect(submitAnswer(s, 'p1', right, T0).ok).toBe(true);
    });

    it('a board cell flips for 1 s before its timer; a blitz cell waits too', () => {
      // id клітинки — id її запитання (findCell у shared/quiz.ts).
      const quiz = makeRoundsQuiz([boardRound('b1', [{ title: 'Міста', cells: [withId(single, 'a1'), { question: withId(single, 'a2'), kind: 'blitz' }] }])]);
      let s = must(next(must(start(lobbyWithSplash(quiz, 'Анна', 'Богдан'))), T0 - 5000)); // intro → поле
      s = must(pickCell(s, 'p1', 'a1', T0, rng0));
      expect(s.splash).toEqual({ kind: 'cell', at: T0, until: T0 + 1000 });
      expect([s.startedAt, s.endsAt]).toEqual([T0 + 1000, T0 + 21_000]);
      // a1 закрити й розкрити, повернутися на поле; Богдан вибирає a2 (бліц) о T1:
      //   buzz(s, 'p1', T1 + 999) → not_started; buzz(s, 'p1', T1 + 1000) → ok, timeMs 0
    });

    it('blitz rounds have no splash', () => {
      const s = openAt(lobbyWithSplash(makeRoundsQuiz([blitzRound('z1', [single])]), 'Анна', 'Богдан'), T0);
      expect(s.splash).toBeNull();
      expect(s.startedAt).toBe(T0);
      expect(buzz(s, 'p1', T0).ok).toBe(true);
    });

    it('the final question has a splash too; a video question without a timer still waits for it', () => {
      // final: start → next (intro → wager) → next о T0 (wager → question): splash question, startedAt T0 + 1200
      // класика з withVideo(single): startedAt T0 + 1200, endsAt null; submitAnswer о T0 + 100 → not_started
    });

    it('pause during the splash freezes it; the rest plays after resume', () => {
      let s = must(pause(classic(), T0 + 500));
      expect(s.remainingMs).toBe(20_700);
      s = must(resume(s, T0 + 10_500));
      expect([s.startedAt, s.endsAt]).toEqual([T0 + 11_200, T0 + 31_200]);
      expect(s.splash).toEqual({ kind: 'question', at: T0 + 10_000, until: T0 + 11_200 });
      expect(submitAnswer(s, 'p1', right, T0 + 11_100)).toEqual({ ok: false, error: 'not_started' });
      expect(recordOf(must(submitAnswer(s, 'p1', right, T0 + 11_200)), 0, 'p1')?.timeMs).toBe(0);
      // без таймера (withVideo): pause о T0 + 500, resume о T0 + 10_500 → startedAt і splash.until T0 + 11_200
      // пауза після кінця заставки (T0 + 5000 → T0 + 6000): splash не зсувається
    });

    it('±15 s during the splash counts from the question start', () => {
      const plus = must(adjustTime(classic(), 15, T0 + 100));
      expect([plus.startedAt, plus.endsAt, plus.plays[0].extraMs]).toEqual([T0 + 1200, T0 + 36_200, 15_000]);
      const minus = must(adjustTime(classic(), -15, T0 + 100));
      expect([minus.startedAt, minus.endsAt, minus.plays[0].extraMs]).toEqual([T0 + 1200, T0 + 6200, -15_000]);
    });

    it('the host can close the question during the splash; tick waits for endsAt', () => {
      expect(must(lock(classic())).phase).toBe('locked');
      expect(tick(classic(), T0 + 21_199).phase).toBe('question');
      expect(tick(classic(), T0 + 21_200).phase).toBe('locked');
    });

    it('debuffs fire at the question start', () => {
      const lobby = lobbyWithSplash(classicQuiz(), 'Анна', 'Богдан');
      const intro = must(start(lobby));
      const s = must(next(must(setDebuff(intro, 'p1', 'fog')), T0, rng0));
      expect(s.debuffs.p1).toMatchObject({ firedAt: 0, since: T0 + 1200 });
    });

    it('buffs keep their clocks after a splash', () => {
      // othersQuiz/toOthersQuestion з transitions: true (`{ ...toOthersQuestion(), …}` не підходить — запитання вже відкрите;
      //   зібрати так само, як toOthersQuestion, але через lobbyWithSplash і openAt о T0):
      // Петро відповідає о T0 + 2000; Оля бере audience о T0 + 3000 → vote.endsAt T0 + 18_000
      // Іра бере swap о T0 + 4000 → spare.startedAt T0 + 4000, limitMs max(T0 + 21_200 − (T0 + 4000), 20_000) = 20_000
      // Оля бере time на іншому запитанні → deadlineOf = endsAt + 30_000 (endsAt уже з урахуванням заставки)
    });
  });
  ```
  `T1 = T0 + 60_000` — локальна константа. Чернеткові коментарі в тілах тестів розписати повними перевірками за тим самим зразком.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL: немає `lobbyWithSplash`, `GameState.splash`, `not_started`.

- [ ] **Step 3: Implement** усе з Interfaces і «Рішень плану» (`not_started` у переліку дій; порядок перевірок — після `paused`). `splash.ts` імпортує з `./game` лише типи (як `timing.ts`); `game.ts` імпортує функції з `./splash`. `questionSplashKind`: `board !== undefined` → `'cell'`; тип поточного раунду `classic` або `final` → `'question'`; інакше `null`. `withSplash`: `state.transitions ? { ...state, splash: { kind, at: now, until: now + SPLASH_MS[kind] } } : { ...state, splash: null }`. Текст `err_not_started` в `i18n.ts`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS (наявні тести — без змін очікувань: без `transitions` поведінка та сама).

- [ ] **Step 5: Commit**

```bash
git add packages/shared packages/engine apps/web/src/i18n.ts
git commit -m "feat(engine): the question timer starts after a short splash on the server — classic and final get «Запитання N», a board cell flips for a second, blitz has none; nothing a player does counts before the start, pause freezes the splash, ±15 s counts from the start"
```

---

### Задача 2. Рушій: заставки раунду, фіналу, дуелі й підсумків

**Files:**
- Modify: `packages/engine/src/game.ts` (`start`, `next` — `round_end`, `finishRound`, `advance`, `endRound`, `end`)
- Modify: `packages/engine/src/duel.ts` (`beginDuel`, `openDuelQuestion`, `answerDuel`)
- Modify: `packages/engine/src/game.splash.test.ts`

**Interfaces:**
- Consumes: `withSplash`, `splashUntil`, `notStarted` (задача 1).
- Produces (`engine`):
  ```ts
  /** Кожна гра починається із заставки першого раунду; без now (старі тести) — без заставки. */
  export function start(state: GameState, now?: number): Result;
  /** Ведучий завершує гру; з now — заставка «Підсумки». */
  export function end(state: GameState, now?: number): Result;
  // duel.ts
  /** phase 'duel', stage 'category', returnPhase = поточний етап, годинник порожній; з now — заставка «Дуель!». */
  export function beginDuel(state: GameState, now?: number): GameState;
  ```
- Внутрішнє: `roundSplash(state, now?)` у `game.ts` — `now === undefined ? state : withSplash(state, currentRound(state)?.type === 'final' ? 'final' : 'round', now)`; викликається в `start` (після `enterRound`) і в `next` для `round_end`. `finishRound(state, now?)` — якщо останній раунд і `now !== undefined`, `withSplash(…, 'podium', now)`; `next` передає `now` у кожен виклик `finishRound`, `endRound` — свій `now`, `advance` — свій `now`. `next` → `beginDuel(state, now)`.
- `openDuelQuestion`: `const at = Math.max(now, splashUntil(state, 'duel') ?? now)`; `startedAt: at`, `endsAt: at + duels.timeLimit * 1000`. `answerDuel`: після перевірок етапу й паузи — `if (notStarted(state, now)) return fail('not_started')`.

- [ ] **Step 1: Write the failing tests** (дописати в `game.splash.test.ts`; `duelQuiz`, `toDeclarable`, `T1` з `./testing/duel`; `on = (s: GameState): GameState => ({ ...s, transitions: true })`):
  ```ts
  describe('round, final, duel and podium splashes', () => {
    it('a round starts with «Раунд N»; the host is never held by it', () => {
      const quiz = makeRoundsQuiz([classicRound('r1', [single]), classicRound('r2', [withId(single, 'q2')])]);
      let s = must(start(lobbyWithSplash(quiz, 'Анна'), T0));
      expect(s.phase).toBe('intro');
      expect(s.splash).toEqual({ kind: 'round', at: T0, until: T0 + 2500 });
      s = must(next(s, T0 + 500, rng0)); // «Почати раунд» посеред заставки раунду
      expect(s.splash).toEqual({ kind: 'question', at: T0 + 500, until: T0 + 1700 });
      // закрити, розкрити → round_end → next о T0 + 60_000 → intro з { kind: 'round', at: T0 + 60_000, until: T0 + 62_500 }
    });
    it('the final gets its own longer splash', () => {
      // makeRoundsQuiz([classicRound('r1', [single]), finalRound('f1', withId(single, 'qf'))]) → … round_end → next о T1
      //   → splash { kind: 'final', at: T1, until: T1 + 3200 }; next (wager) → next о T1 + 10_000 → splash question, startedAt T1 + 11_200
    });
    it('the last round ends with «Підсумки» before the podium, also on an early end', () => {
      // остання reveal → next о T1 → phase finished, splash { kind: 'podium', at: T1, until: T1 + 2500 }
      // endRound в останньому раунді о T1 → podium; end(s, T1) → podium; end(s) без now → splash без змін (не podium)
      // round_end не має заставки: splash лишається попередньою (question), а не podium
    });
    it('a duel starts with «Дуель!»', () => {
      const declared = must(declareDuel(on(toDeclarable()), 'p1', 'p2'));
      const s = must(next(declared, T0 + 4000, rng0));
      expect(s.phase).toBe('duel');
      expect(s.splash).toEqual({ kind: 'duel', at: T0 + 4000, until: T0 + 6000 });
    });
    it('a duel category picked during the splash starts the duel clock after it', () => {
      const started = must(next(must(declareDuel(on(toDeclarable()), 'p1', 'p2')), T0 + 4000, rng0));
      const early = must(pickDuelCategory(started, null, 'dc1', T0 + 4500, rng0));
      expect([early.startedAt, early.endsAt]).toEqual([T0 + 6000, T0 + 26_000]);
      expect(answerDuel(early, 'p1', 'будь-що', T0 + 5000)).toEqual({ ok: false, error: 'not_started' });
      const late = must(pickDuelCategory(started, null, 'dc1', T1, rng0));
      expect([late.startedAt, late.endsAt]).toEqual([T1, T1 + 20_000]);
      // друге запитання дуелі (next з answer) стартує одразу: startedAt = now
    });
    it('without transitions or now there are no splashes', () => {
      expect(must(start(lobbyWith(classicQuiz(), 'Анна'), T0)).splash).toBeNull();
      expect(must(start(lobbyWithSplash(classicQuiz(), 'Анна'))).splash).toBeNull();
      // toDeclarable() без on(): next → splash null; pickDuelCategory о T1 → startedAt T1
    });
  });
  ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL: `start` ігнорує `now`, немає заставок `round`, `final`, `duel`, `podium`.

- [ ] **Step 3: Implement** за Interfaces. `endRound` ставить `podium` лише тоді, коли `finishRound` веде у `finished`. `end(state, now?)` — після `closeFinal`, якщо `now !== undefined`, `withSplash(…, 'podium', now)`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): «Раунд N», a longer «Фінал», «Дуель!» and «Підсумки» splashes with server times; a duel category picked during the splash starts the duel clock after it"
```

---

### Задача 3. Зрізи: заставка для всіх ролей

**Files:**
- Modify: `packages/shared/src/views.ts` (`SplashView`, `BaseView.splash`)
- Modify: `packages/engine/src/views.ts` (`splashView`, `base`)
- Create: `packages/engine/src/views.splash.test.ts`
- Modify: веб-фабрики зрізів `apps/web/src/screens/StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `HostScreen.test.tsx`, `DuelView.test.tsx` (`splash: null`)

**Interfaces:**
- Produces (`shared`):
  ```ts
  /** Заставка переходу: вид і час сервера початку й кінця; клієнт показує її, поки годинник сервера < until. */
  export interface SplashView {
    kind: SplashKind;
    at: number;
    until: number;
  }
  // BaseView:
  /** Заставка поточного етапу (round/final — intro, question/cell — question, duel — duel, podium — finished); інакше null. */
  splash: SplashView | null;
  ```
- `engine/views.ts`: `const SPLASH_PHASE: Record<SplashKind, Phase> = { round: 'intro', final: 'intro', question: 'question', cell: 'question', duel: 'duel', podium: 'finished' }`; `function splashView(state: GameState): SplashView | null` — `state.splash` з тими самими трьома полями, якщо `SPLASH_PHASE[kind] === state.phase`, інакше `null`; `base()` + `splash: splashView(state)`.

- [ ] **Step 1: Write the failing tests** у `views.splash.test.ts`:
  ```ts
  it('every role sees the same splash with server times', () => {
    const s = openAt(lobbyWithSplash(makeQuiz([single]), 'Анна', 'Богдан'), T0);
    const splash = { kind: 'question', at: T0, until: T0 + 1200 };
    expect(stageView(s).splash).toEqual(splash);
    expect(playerView(s, 'p1')?.splash).toEqual(splash);
    expect(hostView(s).splash).toEqual(splash);
  });
  it('a splash shows only in its own phase', () => {
    // intro після start(…, T0) → { kind: 'round', … }; lock → locked → splash null; reveal → null
    // останнє next → finished → podium; round_end → null
    // дуель: phase duel → duel; після повернення з дуелі (етап intro/reveal) → null
  });
  it('the splash carries no answers and pauses with the clock', () => {
    // pause посеред заставки: зріз лишає splash (клієнт сам не показує на паузі); resume о T0 + 10_500 → at/until зсунуті на 10 000
    // JSON.stringify(stageView(s)) під час заставки не містить correctId — як і без заставки (наявна анти-ціль спойлера)
  });
  it('without transitions the view has no splash', () => {
    expect(stageView(openAt(lobbyWith(makeQuiz([single]), 'Анна'), T0)).splash).toBeNull();
  });
  ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL: немає `splash` у зрізах.

- [ ] **Step 3: Implement** за Interfaces; у чотирьох веб-фабриках — `splash: null` поруч із `buffNotice: null`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared packages/engine apps/web/src/screens/*.test.tsx
git commit -m "feat(engine): views carry the current splash with server times for every role, only in its own phase"
```

---

### Задача 4. Сервер: заставки в справжній грі

**Files:**
- Modify: `apps/server/src/rooms/manager.ts` (опції конструктора, `createGame`, `start`, `end`)
- Modify: `apps/server/src/app.ts` (`AppOptions.transitions`)
- Modify: `apps/server/src/main.ts` (`transitions: true`)
- Modify: `apps/server/src/rooms/manager.test.ts`, `apps/server/src/socket.test.ts`

**Interfaces:**
- Consumes: `createGame(quiz, { transitions })`, `start(state, now)`, `end(state, now)` (задачі 1–2).
- Produces (`server`):
  ```ts
  // manager.ts
  export interface RoomManagerOptions {
    /** Заставки переходів (8c); main.ts і наскрізні тести вмикають, модульні тести сервера — ні. */
    transitions?: boolean;
  }
  constructor(scheduler: Scheduler, rng: () => number = Math.random, options: RoomManagerOptions = {})
  // app.ts, AppOptions:
  /** Заставки переходів; типово вимкнено, справжній сервер (main.ts) вмикає. */
  transitions?: boolean;
  ```
- `create` → `createGame(quiz, { transitions: this.transitions })`; `host('start')` → `start(state, this.now())`; `host('end')` і `hostLeft` → `end(state, this.now())`. `buildApp` → `new RoomManager(scheduler, rng, { transitions: options.transitions ?? false })`. Таймерів не додається: `nextDeadline` уже бере `closesAt`, що починається з `endsAt`.

- [ ] **Step 1: Write the failing tests:**
  - `manager.test.ts` (наявний `FakeScheduler`, `quiz` файлу):
    ```ts
    it('the manager runs splashes only when asked', () => {
      const scheduler = new FakeScheduler();
      const manager = new RoomManager(scheduler, () => 0.5, { transitions: true });
      const room = manager.create(quiz);
      // гравець приєднується; host start → room.state.splash.kind 'round'; host next → 'question'
      // answer одразу → { ok: false, error: 'not_started' }; scheduler.advance(1200) → answer ok, timeMs 0
      // кінець запитання настає через ліміт після заставки: advance(limit − 1) → question, advance(1) → locked
      // без опції (наявний manager) — splash null, answer одразу ok
    });
    it('a host end and the host absence show «Підсумки»', () => {
      // transitions: true; host end → phase finished, splash.kind 'podium'
    });
    ```
  - `socket.test.ts`: окремий `buildApp({ db, auth: TEST_AUTH, transitions: true })` → після `host:start` зріз сцени має `splash.kind === 'round'` і `until − at === 2500`; після `host:next` гравець одразу шле `player:answer` → ack `{ ok: false, error: 'not_started' }`. Решта сокет-тестів — на наявному `ctx` без заставок.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server`. Очікується FAIL: конструктор без опцій, `start` без `now`.

- [ ] **Step 3: Implement** за Interfaces; у `main.ts` — `transitions: true` у виклику `buildApp` з коментарем, що це єдине місце, де вмикаються заставки справжньої гри.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat(server): real games play transition splashes — the room manager and the app take a transitions option, main turns it on, start and end pass the server time"
```

---

### Задача 5. Веб: годинник заставки, шар `Splash`, стилі

**Files:**
- Modify: `apps/web/src/clock.ts` (`splashLeft`), `apps/web/src/clock.test.ts`
- Create: `apps/web/src/live/Splash.tsx`, `apps/web/src/live/Splash.test.tsx`
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `SplashView`, `GameView` (задача 3).
- Produces (`web`):
  ```ts
  // clock.ts
  /** Скільки мс заставки лишилося за годинником сервера; 0 — минула. */
  export function splashLeft(splash: { until: number }, offsetMs: number, nowMs: number): number;
  // live/Splash.tsx
  /** Поточна заставка, поки годинник сервера < until і гра не на паузі; elapsed — скільки мс уже минуло. */
  export function useSplash(splash: SplashView | null, paused: boolean, offsetMs: number): { splash: SplashView; elapsed: number } | null;
  /** Шар заставки на весь екран (position: fixed); size phone — менший вигляд. */
  export function Splash({ view, offsetMs, size }: { view: GameView; offsetMs: number; size: 'stage' | 'phone' }): JSX.Element | null;
  /** Значок «На екрані заставка» для пульта; поки заставки немає — null. */
  export function SplashChip({ view, offsetMs }: { view: GameView; offsetMs: number }): JSX.Element | null;
  ```
- Розмітка `Splash`: `<div className="splash is-{kind} is-{size}" aria-hidden="true" style={{ '--splash-ms': `${until − at}ms`, '--splash-elapsed': `${−elapsed}ms` }}>`, усередині:
  - `round`: `.splash-card` → `p.splash-title` «Раунд {index}» (`view.round.index + 1`) і `p.splash-sub` — `roundLabel(title, index, type)`;
  - `final`: `.splash-rays` (декор), `.splash-sparks` (декор), `p.splash-title` «Фінал», `p.splash-sub` — тема (`view.final?.theme`, порожня — без рядка);
  - `question`: `p.splash-title` «Запитання {index}» (`view.questionIndex + 1`), `p.splash-sub` «з {total}»; у фіналі — «Запитання фіналу» без підрядка;
  - `cell`: `CellFlip` — `.splash-flip` з `.splash-face.is-front` (`span.price`) і `.splash-face.is-back` (`cellTitle` категорії й ціни, `markText` позначки, «Бліц» для бліц-клітинки) з `view.board.cell`; без `cell` — нічого;
  - `duel`: `p.splash-title` «Дуель!», `p.splash-pair` з `span.splash-side.is-challenger`, `span.splash-cross` «⚔», `span.splash-side.is-opponent` (`view.duel`); без `duel` — нічого;
  - `podium`: `p.splash-title` «Підсумки», `p.splash-sub` «Хто ж переміг?».
- `useSplash`: стан лише будить перемальовування (як `Timer`); `setTimeout` на `left` мс прибирає шар; `elapsed = (until − at) − left`; на паузі або `left === 0` — `null`.
- Тексти: `splashRound: 'Раунд {index}'`, `splashFinal: 'Фінал'`, `splashQuestion: 'Запитання {index}'`, `splashQuestionOf: 'з {total}'`, `splashFinalQuestion: 'Запитання фіналу'`, `splashDuel: 'Дуель!'`, `splashPodium: 'Підсумки'`, `splashPodiumSub: 'Хто ж переміг?'`, `splashChip: 'На екрані заставка'`.
- Стилі (`styles.css`, новий розділ «Заставки 8c»):
  - токени `:root`: `--splash-bg: rgb(14 16 32 / 0.97)`, `--splash-accent: var(--amber)`, `--final-gold: #ffd166`, `--final-ray: rgb(255 209 102 / 0.14)`;
  - `.splash { position: fixed; inset: 0; z-index: 65; display: grid; place-items: center; padding: 1rem; overflow: hidden; background: var(--splash-bg); text-align: center; animation: splash-fade var(--splash-ms) linear var(--splash-elapsed) both; }`; `.splash-title` — `var(--display)`, сцена `clamp(4rem, 10vw, 9rem)`, `.is-phone` — `clamp(2.25rem, 12vw, 3.25rem)`; `.splash-sub`, `.splash-pair` — `overflow-wrap: anywhere`; `max-width: min(100%, 60rem)`;
  - `@keyframes splash-fade { 0% { opacity: 0 } 10% { opacity: 1 } 90% { opacity: 1 } 100% { opacity: 0 } }` — лише `opacity`;
  - у `@media (prefers-reduced-motion: no-preference)`: `.splash-card` `splash-zoom` (масштаб 0.8 → 1 → 1.05), `.is-final .splash-rays` `splash-rays` (обертання `conic-gradient` з `--final-ray`), `.splash-sparks` `splash-sparks`, `.splash-flip` `splash-flip` (`rotateY(0 → 180deg)` за перші 45 %, потім `scale(1 → 2.4)`), `.splash-side.is-challenger`/`.is-opponent` `splash-slide-left`/`-right`; усі з `animation-duration: var(--splash-ms)`, `animation-delay: var(--splash-elapsed)`, `animation-fill-mode: both`;
  - `.is-final .splash-title { color: var(--final-gold) }`; кольори сторін дуелі — `--duel-challenger`, `--duel-opponent`; лице й зворот картки — кольори клітинки поля (`.gb-cell`), `backface-visibility: hidden`;
  - `.splash-chip { position: fixed; top: calc(var(--menu-h) + 0.5rem); right: 1rem; z-index: 60; … }`.

- [ ] **Step 1: Write the failing tests:**
  - `clock.test.ts`: `splashLeft({ until: 10_000 }, 0, 9_000)` → 1000; `splashLeft({ until: 10_000 }, 500, 9_000)` → 500; `splashLeft({ until: 10_000 }, 0, 12_000)` → 0.
  - `Splash.test.tsx` (`// @vitest-environment jsdom`, `vi.useFakeTimers()`, `vi.setSystemTime(T)`; фабрика `stage(patch)` — мінімальний `StageView` за зразком `StageScreen.test.tsx`; `rule()` і читання `styles.css` — як у `Buffs.test.tsx`):
    ```tsx
    it('shows «Запитання 3 з 10» and goes away exactly at until by the server clock', () => {
      const { container } = render(<Splash view={stage({ phase: 'question', questionIndex: 2, total: 10, splash: { kind: 'question', at: T, until: T + 1200 } })} offsetMs={0} size="stage" />);
      expect(container.querySelector('.splash.is-question')?.textContent).toContain('Запитання 3');
      expect(container.textContent).toContain('з 10');
      act(() => vi.advanceTimersByTime(1199));
      expect(container.querySelector('.splash')).not.toBeNull();
      act(() => vi.advanceTimersByTime(1));
      expect(container.querySelector('.splash')).toBeNull();
    });
    it('a splash joined midway continues from the same point', () => {
      // at T − 600, until T + 600 → style --splash-ms '1200ms', --splash-elapsed '-600ms'; offsetMs 300 → '-900ms'
    });
    it('no splash while paused or after it ended', () => {
      // paused: true → null; until у минулому → null
    });
    it('each kind has its own content', () => {
      // round: «Раунд 2» + назва «Столиці»; final: «Фінал», тема, .splash-rays; final question: «Запитання фіналу», без «з 1»;
      // cell: зворот «Міста · 300» і «×2»; duel: «Дуель!», «Іра», «⚔», «Оля» у .is-challenger/.is-opponent; podium: «Підсумки», «Хто ж переміг?»
      // size phone → клас is-phone
    });
    it('the splash is a fixed layer and moves only without reduced motion', () => {
      expect(rule('.splash')).toContain('position: fixed');
      expect(rule('.splash')).toContain('inset: 0');
      expect(rule('.splash')).toContain('splash-fade');
      const fade = css.slice(css.indexOf('@keyframes splash-fade'), css.indexOf('}\n}', css.indexOf('@keyframes splash-fade')));
      expect(fade).toContain('opacity');
      expect(fade).not.toContain('transform');
      // кожне @keyframes splash-zoom|rays|sparks|flip|slide-* стоїть усередині @media (prefers-reduced-motion: no-preference)
    });
    it('the host chip shows only during a splash', () => {
      // SplashChip: під час заставки «На екрані заставка»; після until — null
    });
    ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web`. Очікується FAIL: немає `splashLeft`, `Splash`.

- [ ] **Step 3: Implement** за Interfaces.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/clock.ts apps/web/src/clock.test.ts apps/web/src/live apps/web/src/i18n.ts apps/web/src/styles.css
git commit -m "feat(web): a fixed splash layer driven by the server clock — round, a festive final, question, a flipping cell, duel and podium; joins midway, hides on pause, only fades with reduced motion"
```

---

### Задача 6. Сцена: заставки на весь екран

**Files:**
- Modify: `apps/web/src/screens/StageScreen.tsx`
- Modify: `apps/web/src/screens/StageScreen.test.tsx`

**Interfaces:**
- Consumes: `Splash` (задача 5).
- `StageScreen`: `<Splash view={view} offsetMs={offsetMs} size="stage" />` одразу після `DuelBanner`/сповіщень, до вмісту етапу. Вміст етапу (`Intro`, `Question`, `DuelStage`, подіум) рендериться під шаром як зараз — без змін розкладки.

- [ ] **Step 1: Write the failing tests** у `StageScreen.test.tsx` (фабрика файлу + `splash`; `vi.useFakeTimers()`):
  ```tsx
  it('a round splash covers the round intro, which is already in place under it', () => {
    // phase intro, round { index: 1, title: 'Столиці', … }, splash round (T, T + 2500)
    // .splash.is-round містить «Раунд 2» і «Столиці»; під ним уже є h1.question з назвою раунду й RoundBriefing
    // через 2500 мс .splash немає, а h1.question той самий елемент (не перемонтовано)
  });
  it('the question is in place under «Запитання N»; the timer shows the full time', () => {
    // phase question, endsAt T + 21_200, limitMs 20_000, splash question (T, T + 1200)
    // getByRole('timer') aria-label '20'; .splash.is-question; після 1200 мс шару немає, таймер '20'
  });
  it('a picked cell flips on the stage', () => {
    // board.cell { category: 'Міста', price: 300, mark: 'x2', kind: 'normal', … }, splash cell → .splash-flip з «Міста · 300»
  });
  it('the final, duel and podium splashes', () => {
    // intro фіналу → .is-final «Фінал»; duel → «Дуель!» з іменами; finished → «Підсумки», під ним подіум
  });
  it('no splash while paused', () => {
    // paused: true, splash question у майбутньому → .splash немає, банер паузи є
  });
  ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/StageScreen.test.tsx`. Очікується FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/StageScreen.tsx apps/web/src/screens/StageScreen.test.tsx
git commit -m "feat(web): the stage plays full-screen splashes over a layout that is already in place — round, final, question, the flipping cell, duel, podium"
```

---

### Задача 7. Телефон і пульт ведучого

**Files:**
- Modify: `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/screens/PlayerScreen.test.tsx`
- Modify: `apps/web/src/screens/HostScreen.tsx`, `apps/web/src/screens/HostScreen.test.tsx`

**Interfaces:**
- Consumes: `Splash`, `SplashChip` (задача 5).
- `PlayerScreen`: `<Splash view={view} offsetMs={offsetMs} size="phone" />` після `VoteSheet`; решта екрана без змін. `submit` не змінюється: якщо відповідь усе ж пішла до старту (клавіша Enter у полі під шаром), сервер відповідає `not_started`, а екран показує «Запитання ще не почалося.».
- `HostScreen`: `<SplashChip view={view} offsetMs={offsetMs} />` у корені пульта; шару `Splash` немає. `secondsNow` обрізається до повного часу: `Math.min(secondsLeft(…), Math.ceil(view.limitMs / 1000))`, коли `limitMs !== null` — тож «−15 с»/«+15 с» не вимикаються через залишок разом із заставкою.

- [ ] **Step 1: Write the failing tests:**
  - `PlayerScreen.test.tsx`:
    ```tsx
    it('the phone shows a smaller splash over a question that is already in place', () => {
      // phase question, single, splash question (T, T + 1200) → .splash.is-question.is-phone «Запитання 1»;
      // варіанти вже в DOM під шаром; після 1200 мс шару немає, y першого варіанта (getBoundingClientRect у jsdom — 0) не змінюється:
      // перевіряти, що вузол варіанта той самий (не перемонтовано)
    });
    it('round, cell, duel and podium splashes reach the phone too', () => { /* по одному рядку на вид */ });
    it('an answer refused before the start explains why', async () => {
      // send повертає { ok: false, error: 'not_started' } → role alert «Запитання ще не почалося.»
    });
    ```
  - `HostScreen.test.tsx`:
    ```tsx
    it('the host console is never covered; a chip tells a splash is on screen', () => {
      // phase question, splash question у майбутньому → .splash немає; «На екрані заставка» є; «Закрити» і «+15 с» активні
      // endsAt = T + 21_200, limitMs 20_000 → таймер '20', «+15 с» не disabled; після until значка немає
    });
    ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens`. Очікується FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/PlayerScreen.tsx apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/screens/HostScreen.tsx apps/web/src/screens/HostScreen.test.tsx
git commit -m "feat(web): phones play the smaller splashes, the host console stays free with a small «На екрані заставка» chip and the full time on its timer"
```

---

### Задача 8. Наявні наскрізні сценарії — зі справжніми заставками

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`
- Modify (лише якщо потрібно): `apps/server/e2e/vitest.config.ts`

**Interfaces:**
- `beforeAll`: `buildApp({ …, transitions: true })` — наскрізні тести бачать гру такою, як гравці.
- Нові допоміжні функції файлу:
  ```ts
  /** Чекає, доки на кожній сторінці зникне шар заставки (його немає — одразу). */
  async function afterSplash(...pages: Page[]) {
    await Promise.all(pages.map((page) => page.locator('.splash').waitFor({ state: 'detached' })));
  }
  /** Знімок для дизайну: спершу чекає кінця заставки, якщо не просили саме кадр заставки. */
  async function shot(page: Page, name: string, { splash = false }: { splash?: boolean } = {}) { … }
  ```
  `shot` чекає `afterSplash(page)` до знімка (лише з `E2E_SHOTS=1`, як і зараз — без нього нічого не робить).
- Принцип: **справжні очікування, без змінної середовища для коротких заставок.** Дотики й кліки Playwright самі чекають, доки шар (`position: fixed`, перехоплює дотики) зникне. `afterSplash` додається лише там, де перевірка читає екран одразу після кроку ведучого.

- [ ] **Step 1: Run the suite first.** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts` з `transitions: true` і новими допоміжними функціями. Записати, що впало і чому.

- [ ] **Step 2: Fix by waiting, not by changing checks.** Для кожного падіння додати `await afterSplash(…)` перед перевіркою. Очікувані місця:
  - `getByText(…)`/`getByRole('heading', …)` назви раунду чи «Раунд N» одразу після «Почати гру»/«Наступний раунд» — текст є і в шарі, і в заголовку інтро (суворий режим Playwright, два збіги);
  - перевірки `bodyText(…)` через `toBe`/`not.toContain` одразу після відкриття запитання, клітинки, дуелі чи фіналу;
  - `seconds(page)` і перевірки відліку (`… ≤ 20`, «~0:20») — показ уже обрізаний до повного часу, але відлік «минуло N с» тепер іде від старту: чекати `afterSplash` перед першим зчитуванням;
  - виміри (`yOf`, `boxOf`, `duelGeometry`, `expectApart`) — шар фіксований і на розкладку не впливає; якщо вимір бере `elementFromPoint` чи видимість — чекати `afterSplash`;
  - кроки, що шлють клавішу Enter у поле одразу після відкриття запитання, — `afterSplash` перед клавішею (інакше `not_started`).
  Перевірки не послаблювати; якщо падіння не пояснюється заставкою — це вада 8c, її виправляти в коді задач 1–7.

- [ ] **Step 3: Time budget.** Кожне запитання класики/фіналу стало довшим на 1,2 с, клітинка — на 1 с, раунд — на 2,5 с. Якщо сценарій наближається до `testTimeout` (180 с), підняти `testTimeout` у `apps/server/e2e/vitest.config.ts` до `240_000` з коментарем «заставки 8c».

- [ ] **Step 4: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх наявних сценаріїв (7a–7g, 8a, 8b і ранні). Потім `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e
git commit -m "test: existing end-to-end scenarios run with real transition splashes — waits for the splash where a check reads the screen right after a host step, design shots wait for it too"
```

---

### Задача 9. Наскрізний сценарій 8c і кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–8.
- Допоміжні функції файлу: `open`, `register`, `join`, `shot`, `click`, `field`, `exact`, `bodyText`, `expectNoSideScroll`, `snapshot`, `seconds`, `yOf`, `afterSplash`, з 7g — `duelAnswer`. `open(name, w, h, options?)` отримує необов'язковий `{ reducedMotion?: 'reduce' }`, що йде в `browser.newContext`.
- Нова локальна: `async function splashOn(page: Page, kind: string)` — `await page.locator(`.splash.is-${kind}`).waitFor()`.

- [ ] **Step 1: Add the scenario** `it('part 8c: «Раунд N» on the stage and phones, «Запитання N» with the timer after it, ±15 s during a splash, a pause mid-splash, a flipping cell, «Дуель!», a festive final with a reconnect mid-splash, «Підсумки» before the podium, reduced motion', …)` з `try/catch` і `snapshot()`. Підготовка:
  1. Ведучий `register(host, 'host', 'Олег Ведучий', 'host8c@example.com')`. Вікторина «Переходи» через `host.request.post(`${base}/api/quizzes`, { data })`, `settings: { leaderboard: 'end' }`, усі раунди `shuffleOptions: false`, `speedBonus: false`, `rules: DEFAULT_RULES`:
     - **Раунд 1, класика** «Столиці дуже далеких і дуже цікавих країн світу» (довга назва — для 375 px): `q1` single «Столиця Франції?» — «Париж» (правильний), «Ліон», «Марсель»; 100 балів, 20 с. `q2` single «Столиця Італії?» — «Рим» (правильний), «Мілан», «Неаполь»; 100 балів, 20 с. `q3` single «Столиця Іспанії?» — «Мадрид» (правильний), «Барселона», «Севілья»; 100 балів, 20 с.
     - **Раунд 2, поле** «Поле», `answerMode: 'phone'`, `check: 'auto'`, порядок за приєднанням: «Міста», «Річки», «Гори» по 3 клітинки single (100/200/300), у «Міста» 300 — позначка `x2`.
     - **Раунд 3, фінал** «Фінал», тема «Космос», single «Перша людина в космосі?» — «Гагарін» (правильний), «Армстронг»; 30 с.
     - `duels`: одна категорія «Мови» з двома запитаннями (`questionsPerDuel: 1`, `timeLimit: 20`, `stake: 0`), прийнятні «привіт» / «дякую».
  2. Гра: `stage` 1600 × 900, `olya` 375 × 812, `petro` 360 × 740, `calm` 390 × 844 з `{ reducedMotion: 'reduce' }` (гравець «Іра»). Приєднуються Оля, Петро, Іра.

- [ ] **Step 2: Assertions and shots** (у такому порядку):
  1. **Раунд.** Ведучий «Почати гру» → `splashOn(stage, 'round')`: «Раунд 1» і довга назва раунду; кадр `transition8c-round-stage` (`{ splash: true }`). У Олі `.splash.is-round.is-phone`; кадр `transition8c-round-375` (`{ splash: true }`); `expectNoSideScroll(olya, 'transition8c-round-375')` поки шар є. Пульт: `.splash` немає, «На екрані заставка» є, «Почати раунд» активна. `afterSplash(stage, olya)` → на сцені інформація раунду (факти «3 запитання · 20 с» — як у 7a), без шару.
  2. **Запитання і таймер після заставки (`q1`).** Ведучий «Почати раунд» → `splashOn(stage, 'question')`: «Запитання 1», «з 3»; кадр `transition8c-question-stage` (`{ splash: true }`); у Петра `.splash.is-question.is-phone`; кадр `transition8c-question-360` (`{ splash: true }`). Поки шар є, запам'ятати `y0` блоку `.question` у Олі (запитання вже стоїть під шаром). `afterSplash(olya, stage)` → `y` той самий, що `y0`; `seconds(olya)` і `seconds(stage)` ≥ 19 (жодної секунди не втрачено). Усі «Париж».
  3. **«+15 с» і пауза посеред заставки (`q2`).** Ведучий «Далі» до `q2` → поки `.splash.is-question` на сцені: ведучий «+15 с» → без помилки на пульті (`getByRole('alert')` немає), після `afterSplash` `seconds(stage)` ≥ 34. Відповіді: Оля «Рим», Петро «Рим», Іра «Неаполь».
     Ведучий «Далі» до `q3` → одразу «Пауза»: шару на сцені й телефонах немає, банер «Пауза»; кадр `transition8c-paused-stage`. Через 2 с «Продовжити» → `splashOn(stage, 'question')` знову (решта заставки); `afterSplash` → `seconds(stage)` ≥ 19. Усі «Мадрид».
  4. **Перегортання клітинки.** Розкриття → «Наступний раунд» → заставка «Раунд 2» → `afterSplash` → «Почати раунд» → поле. Оля вибирає «Міста» 300 (×2) → `splashOn(stage, 'cell')`: `.splash-flip` із «Міста · 300» і «×2»; кадр `transition8c-cell-stage` (`{ splash: true }`); у Олі `.splash.is-cell.is-phone`; кадр `transition8c-cell-375` (`{ splash: true }`). `afterSplash` → `seconds(olya)` ≥ 19. Оля відповідає правильно, ведучий «Прийняти».
  5. **Дуель.** Після розкриття клітинки (закрито 4 запитання — поріг дуелей ⌈12 / 3⌉ = 4 пройдено) Оля «Дуель» → суперник Петро. Ведучий «Далі» → `splashOn(stage, 'duel')`: «Дуель!», «Оля», «⚔», «Петро»; кадр `transition8c-duel-stage` (`{ splash: true }`); у Петра `.splash.is-duel.is-phone`; кадр `transition8c-duel-360` (`{ splash: true }`). Ведучий одразу вибирає категорію «Мови» за Олю (пульт не заблокований) → після `afterSplash(stage)` таймер дуелі на сцені ≥ 19. Оля `duelAnswer(olya, …)` правильно → «Далі» до підсумку → «Далі» → гра повертається до поля.
  6. **Фінал і перепідключення посеред заставки.** Ведучий «Завершити раунд» (підтвердити) → підсумки раунду без шару (`.splash` немає) → «Наступний раунд» → `splashOn(stage, 'final')`: «Фінал», «Космос», `.splash-rays`; кадр `transition8c-final-stage` (`{ splash: true }`). Одразу `olya.reload()` → після перезавантаження `.splash.is-final` знову видно, а `--splash-elapsed` у його `style` ≤ −300ms (заставка продовжилась, а не почалась наново); кадр `transition8c-final-reconnect-375` (`{ splash: true }`). `afterSplash` → ставки (усі по 0) → «Далі» → `splashOn(stage, 'question')` з «Запитання фіналу» без «з 1»; `afterSplash` → `seconds(stage)` ≥ 29. Усі «Гагарін».
  7. **«Менше руху».** У Іри (`reducedMotion: 'reduce'`) під час будь-якої заставки (зручно — на кроці 6 перед фіналом) `getComputedStyle(.splash-card).animationName` — `none`, а `.splash` — `splash-fade`; кадр `transition8c-reduced-390` (`{ splash: true }`).
  8. **Підсумки.** Розкриття фіналу по одному → останнє «Далі» → `splashOn(stage, 'podium')`: «Підсумки», «Хто ж переміг?»; кадр `transition8c-podium-stage` (`{ splash: true }`); у Олі `.splash.is-podium.is-phone`. `afterSplash` → подіум «Переможці»; кадр `transition8c-podium-after`. `expectNoSideScroll(olya, 'transition8c-phone-375')` на фінальному екрані.
  9. `expect(problems).toEqual([])`.

- [ ] **Step 3: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв. Потім той самий запуск з `E2E_SHOTS=1` і перегляд кадрів у `apps/server/e2e/artifacts/shots`:
  - кадри посеред заставки показують шар на весь екран, текст по центру, без обрізаних літер на 360–390 px; довга назва раунду переноситься;
  - фінал помітно урочистіший за раунд (золото, промені); дуель — кольори сторін; перегортання клітинки показує категорію й ціну;
  - кадр після заставки — та сама розкладка етапу, що й до 8c;
  - пульт ніде не закритий шаром, значок не перекриває кнопок.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts
git commit -m "test: part 8c end-to-end — «Раунд N» on the stage and phones, «Запитання N» with the timer after it, ±15 s and a pause mid-splash, a flipping cell, «Дуель!» with the category picked during it, a festive final with a reconnect mid-splash, «Підсумки» before the podium, reduced motion"
```

Після фінальної рецензії гілку злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`. У звіті власникові назвати рішення: тривалості — раунд 2,5 с, фінал 3,2 с, запитання 1,2 с, клітинка 1 с, дуель 2 с, підсумки 2,5 с; заставки йдуть і на сцені, і на телефонах (на телефонах менші), у ведучого — лише значок «На екрані заставка»; таймер, бонус швидкості й бафи рахуються від кінця заставки, а до нього відповіді й бафи не приймаються («Запитання ще не почалося.»); ведучий може натиснути будь-що й під час заставки — «Почати раунд» під час заставки раунду одразу веде до заставки запитання, «±15 с» рахується від старту запитання, вибір категорії дуелі під час заставки запускає таймер дуелі після неї; пауза заморожує заставку, після «Продовжити» догравається решта; запитання фіналу має напис «Запитання фіналу»; підсумки раунду заставки не мають, лише кінець гри; перепідключення посеред заставки продовжує її з того самого місця, після кінця — не повторює; «менше руху» — та сама тривалість, лише проявлення без руху; заставки вмикає сервер гри (`main.ts`), модульні тести рушія й сервера йдуть без них.
