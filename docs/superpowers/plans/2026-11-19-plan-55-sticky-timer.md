# План 55: таймер завжди на виду на телефоні — компактна прикріплена смужка (43a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** План — лише вебчастина: жодних змін у `packages/shared`, `packages/engine`, `apps/server/src`. Якщо виконавцю здасться, що треба змінити зріз гри чи сервер, — **зупинитися й спитати контролера**.

> **Звірка з кодом.** План спирається на `main` 2026-11-19 (`328f9bae`, після специфікації 43a; план 53 ще не злитий):
> - табло: `apps/web/src/live/Timer.tsx` — `Timer({ view, offsetMs, total = null, status = null, leadMs = 0 })` (корінь `div.timer[role=timer][dir=ltr][aria-label=секунди]`, `.timer-flaps > .flap`, `.timer-label` зі `.timer-status`/`.timer-total`, `.timer-bar > span` з шириною у %; тік `setInterval` 200 мс лише будить рендер, час читається з `secondsLeft(view, offsetMs, Date.now())` з `apps/web/src/clock.ts`: `remainingMs` (пауза/утримання) → `ceil(remainingMs/1000)`, інакше `endsAt − (now + offsetMs)`, де `offsetMs` — «сервер мінус пристрій»), `TimerStatus = 'paused' | 'held' | 'heldAuto' | 'listening' | null`, `timerStatus(view)`, `STATUS_TEXT`; тест `live/Timer.test.tsx`;
> - де стоїть `<Timer>` на телефоні: `screens/PlayerScreen.tsx` (~1167 — основне табло в `.question-head`; ~1166 `NoClock` для дебафу «Без годинника» — не `Timer`; ~1427 повторний вибір, ~1849 квест, ~2038 бліц), `ChainView.tsx` ~171, `DuelView.tsx` ~266/421/517, `AuctionView.tsx` ~17, `ThinkView.tsx` ~467 (зокрема «Чи всі на тему?»), `TruthView.tsx` ~381, `QuestView.tsx` ~400/442, `SurvivalTrial.tsx` ~123/169, `WipeoutDecision.tsx` ~25 — усі всередині дерева `PlayerScreen`; на пульті — `HostScreen.tsx` ~880 (`.panel-actions.host-time`, прокручується разом зі сторінкою) і `HostSurvival.tsx` ~46; на сцені — `StageScreen.tsx` ~362/773/851/896 (смужки там не має бути);
> - корені екранів: `PlayerScreen` ~974 `<ReactionMain className="app player game-bg …" size="phone">`, `HostScreen` ~639 `<ReactionMain className="app host game-bg" size="host">` (`live/Reactions.tsx` ~101 — `<main>` з `ReactionsProvider`); `/play/:code` і `/host/:code` не обгорнуті `WithMenu`, тож липкого `.menu` (styles.css ~3395, `top: 0`) угорі там немає;
> - CSS: `apps/web/src/styles.css` — `:root` / `:root.is-light` (~1 / ~105: `--stage`, `--surface`, `--paper`, `--dim`, `--accent`, `--accent-text`, `--on-accent`, `--amber` = `--accent-text`, `--pending`, `--notice-bg`, `--line`), `.app` ~268 (`max-width: 34rem`, `--app-pad: 1.25rem`), `.app.host` ~281 (`max-width: 46rem`, `scroll-padding-bottom: 6rem`), шапка телефона `.bar` ~302 (не липка), табло ~1070–1190 (`.timer`, `.timer-bar > span { transition: width 0.2s linear }` + вимкнення в `prefers-reduced-motion` і `:where(:root.is-easy)`, `.timer-status { color: var(--pending) }`, `.flap { background: var(--stage); color: var(--amber) }`), `.live-notices` ~4945 (`z-index: 66`), `.host .live-notices` ~4992 (`top: max(0.75rem, env(safe-area-inset-top))` — угорі пульта!), банери `.debuff-banner`/`.duel-banner` — `bottom`, `z-index: 55`; заставка — `z-index: 65`;
> - **останніх 5 с в основному табло зараз немає** (жодного класу; лише кнопка «−15 с» на пульті вимикається при `secondsNow <= 5`, HostScreen ~882);
> - IntersectionObserver: лише `trophy/engine/stage.ts` ~68 (охорона `typeof IntersectionObserver === 'function'`); зразок заглушки в тесті — `trophy/engine/stage.test.ts` ~44–100 (`vi.stubGlobal('IntersectionObserver', vi.fn(function (callback) {…}))`); у jsdom його немає, тож наявні тести `PlayerScreen.test.tsx`/`HostScreen.test.tsx` смужки не побачать;
> - тексти: `apps/web/src/i18n.ts` ~48 `timerOf: '/ {seconds} с'`, ~49 `timerPaused: 'Пауза'`; `locales/{en,de,es,it,pl,ar}.json` (`"timerOf": "/ {seconds} s"`, ar — `"/ {seconds} ث"`); `i18n.test.ts` (найновіший список — `ADDED_LEVELS_49` ~210, перевірка мов ~450, умова `adds no uk keys beyond the agreed list` ~616);
> - e2e: `apps/server/e2e/helpers/common.ts` — `open(name, width, height, { reducedMotion?, … })`, `join`, `click`, `field`, `seconds(page)` (`getByRole('timer').first()` — смужка з `aria-hidden` у нього не потрапляє), `numericAnswer`/`textAnswer` (поле «Ваша відповідь»), `noSideScroll`, `POLL`; `helpers/setup.ts` — `useE2eServer`, `snapshot`, `afterSplash`, `noSplashLayer`, `ARTIFACTS`, `problems`; зразок файла з `openLight`/`vshot`, вікториною через `POST /api/quizzes` і запуском «Грати» — `part51-think-offtopic.e2e.ts` ~17–90; фікстури — `@quiz/engine/testing` (`makeRoundsQuiz`, `text`, `timedlist`); кнопки пульта «Пауза» / «Продовжити гру» (part07 ~2380/2435); телефонного помічника саме на 320×568 немає — `open('…', 320, 568)` викликається напряму (part12k, part22-24, part29-memory…).

**Мета:** на телефоні гравця (і на пульті ведучого), коли основне табло запитання прокручено вище екрана, вгорі з'являється компактна смужка `aria-hidden` висотою ≤ 40 px: «12 с», стан («Пауза» тощо) і тонка смужка прогресу; коли табло знову видно — смужка зникає. Останні 5 с — акцентний колір в обох; поля вводу не ховаються під смужкою.

**Архітектура:** чиста функція `timerFace` у `Timer.tsx` рахує те, що показує табло (секунди, відсоток, стан, «останні 5 с»), — нею користуються і `Timer`, і смужка, тож вони не розходяться. Новий `live/StickyTimer.tsx`: `StickyTimerProvider` (контекст-реєстр) і хук `useStickyTimer`, який `Timer` викликає сам: поза провайдером (сцена) — нічого не робить; у провайдері — стежить IntersectionObserver-ом за коренем табло й повідомляє реєстру свої вхідні дані, коли табло вище екрана. Провайдер малює одну смужку (порталом у `document.body`, `position: fixed`) для найстаршого прихованого табло з власним тіком 200 мс. Провайдер ставлять лише `PlayerScreen` і `HostScreen`, тож усі ~20 місць `<Timer>` на телефоні й пульті отримують смужку без правок.

**Технології:** TypeScript, React 19 (`createPortal`, контекст), CSS без бібліотек, vitest + Testing Library (jsdom), Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-19-sticky-timer-design.md` (43a).

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22**; лише `apps/web` (і новий e2e-файл у `apps/server/e2e`). Сервер, `packages/*` — без змін.
- Тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`. Новий uk-ключ — у новому списку `ADDED_STICKY_TIMER_55` (`i18n.test.ts`): в умову `adds no uk keys beyond the agreed list` і в окрему перевірку наявності в усіх локалях (як `ADDED_LEVELS_49`).
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`).
- **Нічого, пов'язаного з росією**, — у текстах запитань e2e і фікстурах.
- Тести — завжди `--maxWorkers=2`: `pnpm test --project web --maxWorkers=2 [шляхи]`; типи — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів vitest).
- Файли правити лише Edit/Write чи `sed`; **python3 на цій машині — порожня заглушка, ним нічого не правити й не генерувати**; після коміту перевірити `git show --stat`.
- Робоче дерево — `C:\ClaudeCode\quiz\.superpowers\worktrees\plan55` від `main`; жодних файлів поза `C:\ClaudeCode\quiz` (тимчасові — у `.superpowers` чи scratchpad сесії).
- e2e: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 55"`; телефони 320×568 і 360×740, світла й темна теми.
- Таймер кожного запитання у фікстурах і e2e ≥ 25 с.
- **Без змін на сцені**: на `/stage/:code` смужки немає, і правила CSS «останніх 5 с» не діють на `.app.stage`.

## Рішення плану (там, де специфікація мовчить)

**Обчислення (`apps/web/src/live/Timer.tsx`)**
- `export const TIMER_ENDING_S = 5;`
- ```ts
  export interface TimerInput {
    view: { endsAt: number | null; remainingMs: number | null };
    offsetMs: number; total: number | null; status: TimerStatus; leadMs: number;
  }
  export interface TimerFace {
    seconds: number;
    /** Ширина смужки, %; null — повного часу немає, смужки теж. */
    pct: number | null;
    status: TimerStatus;      // уже з «Слухайте», як зараз у Timer
    totalText: string;        // «/ 30 с» або ''
    ending: boolean;
  }
  export function timerFace(input: TimerInput, nowMs: number): TimerFace | null;
  ```
  Тіло — наявна арифметика `Timer` (`whole`, `listening`, `seconds`, `pct`, `totalText`, `status`), перенесена без змін. `null` — коли `secondsLeft` дає `null`.
- **«Останні 5 с»** = годинник іде (`view.remainingMs === null && view.endsAt !== null`), стану немає (`status === null`) і `seconds <= TIMER_ENDING_S`. На паузі, в утриманні й у «Слухайте» — не діє.
- `Timer` додає корню клас `is-ending` (`className={face.ending ? 'timer is-ending' : 'timer'}`) і викликає `useStickyTimer(element, input)` (елемент — через колбек-реф у `useState<HTMLDivElement | null>`), решта розмітки без змін.
- Вигляд «останніх 5 с» — лише на телефоні й пульті: `.app.player .timer.is-ending .flap, .app.host .timer.is-ending .flap { background: var(--accent); color: var(--on-accent) }`, смужка `… .timer-bar > span { background: var(--accent) }`. Сцена (`.app.stage`) — без змін.

**Смужка (`apps/web/src/live/StickyTimer.tsx`)**
- ```ts
  export type StickySize = 'phone' | 'host';
  export function StickyTimerProvider({ size, children }: { size: StickySize; children: ReactNode }): JSX.Element;
  /** Викликає Timer. Поза провайдером — нічого (жодного IntersectionObserver). */
  export function useStickyTimer(element: HTMLElement | null, input: TimerInput): void;
  ```
- Реєстр у провайдері: `Map<number, TimerInput>` (ключ — порядковий номер табло, видається при монтуванні з лічильника модуля). Смужка показує **найменший номер серед прихованих** (найстарше табло — основне табло запитання).
- Хук: `new IntersectionObserver(cb, { threshold: 0 })` на елементі; «приховане» = `!entry.isIntersecting && entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0)` (табло **вище** екрана; нижче — не рахується). Повідомляє `report(id, input)` при прихованому, `report(id, null)` при видимому, при розмонтуванні й коли `element === null`. Залежності ефекту — примітиви (`endsAt`, `remainingMs`, `offsetMs`, `total`, `status`, `leadMs`, прапорець прихованості), тож тік табло (200 мс) реєстр не смикає. Без `IntersectionObserver` у середовищі — нічого.
- Смужка рахує час сама: свій `setInterval` 200 мс (поки `endsAt !== null`) і `timerFace(input, Date.now())`; `null` — не малюється.
- Розмітка (портал у `document.body`):
  ```html
  <div class="timer-sticky [is-host] [is-ending]" aria-hidden="true">
    <div class="timer-sticky-row">
      <span class="timer-sticky-left" dir="ltr">12 с</span>          <!-- t('timerLeft', { seconds }) -->
      <span class="timer-sticky-status">Пауза</span>                 <!-- лише коли status !== null; t(STATUS_TEXT[status]) -->
    </div>
    <span class="timer-sticky-bar"><span style="width: 40%"></span></span>  <!-- лише коли pct !== null -->
  </div>
  ```
- Новий ключ: uk `timerLeft: '{seconds} с'` (поруч із `timerPaused`, ~49); en/de/es/it/pl `"{seconds} s"`, ar `"{seconds} ث"`.

**CSS (`apps/web/src/styles.css`, блок одразу після `.timer-status` ~1157, не в кінці файла)**
- `.timer-sticky`: `position: fixed; top: 0; left: 0; right: 0; z-index: 60` (над банерами 55, під заставкою 65 і сповіщеннями 66); `padding-top: env(safe-area-inset-top)`; `background: var(--notice-bg)`; `border-bottom: 1px solid var(--line)`; `pointer-events: none`; анімація появи `timer-sticky-in` 160 мс (`translateY(-100%)` → 0), вимкнена в `@media (prefers-reduced-motion: reduce)` і `:where(:root.is-easy)` (`animation: none`).
- `.timer-sticky-row`: `box-sizing: border-box; height: calc(2.5rem - 3px)` (разом зі смужкою 3 px — рівно 40 px без вирізу), `display: flex; align-items: center; gap: 0.5rem; max-width: 34rem; margin: 0 auto; padding-inline: 1.25rem`; `.timer-sticky.is-host .timer-sticky-row { max-width: 46rem }`.
- `.timer-sticky-left`: `font-family: var(--display); font-weight: 800; font-size: 1.25rem; font-variant-numeric: tabular-nums; color: var(--amber)`; `.timer-sticky-status`: як `.timer-status` (`var(--pending)`, 0.875rem), `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`.
- `.timer-sticky-bar`: `display: block; height: 3px; background: var(--line)`; `> span { display: block; height: 100%; background: var(--amber); transition: width 0.2s linear }` (вимкнено так само, як у `.timer-bar`).
- `.timer-sticky.is-ending`: `.timer-sticky-left { color: var(--accent) }`, смужка — `var(--accent)`; `border-bottom-color: var(--accent)`.
- Лише змінні тем — світла й темна працюють без окремих правил.
- **Відступ для фокусу — завжди на ігрових екранах телефона й пульта** (не лише коли смужка видима, бо вона з'являється вже після прокрутки до поля): `:root:has(.app.player.game-bg), :root:has(.app.host.game-bg) { scroll-padding-top: calc(3rem + env(safe-area-inset-top)) }`.
- Пульт: `body:has(.timer-sticky) .host .live-notices { top: calc(2.5rem + max(0.75rem, env(safe-area-inset-top))) }` — сповіщення стають під смужкою.

**Під'єднання**
- `PlayerScreen.tsx` ~974: усі діти `ReactionMain` обгорнути `<StickyTimerProvider size="phone">…</StickyTimerProvider>`; `HostScreen.tsx` ~639 — `size="host"`. `StageScreen` — без провайдера.

## Порядок збирання

Задачі 1 → 2 → 3 → 4 послідовно (кожна спирається на попередню).

## Фокус рев'ю

1. **Сцена не змінилась.** `<Timer>` поза провайдером не створює IntersectionObserver і не малює смужки; `is-ending` на сцені нічого не фарбує. Задачі 1, 3, 4.
2. **Смужка не обманює.** Ті самі секунди, що й основне табло (одна `timerFace`), з `offsetMs` і `leadMs` (фрагмент мелодії: «Слухайте», секунди не більші за повний час); на паузі стоїть і пише «Пауза»; «останні 5 с» не загоряються на паузі. Задачі 1, 2.
3. **Поле не ховається.** Після прокрутки вниз і `scrollIntoView({ block: 'start' })` поле відповіді нижче смужки; смужка `pointer-events: none` — дотик крізь неї не губиться. Задачі 2, 4.
4. **Одне табло — одна смужка.** Кілька `<Timer>` водночас (дуель, квест, бліц) — одна смужка, за найстаршим прихованим; розмонтоване табло прибирає смужку; табло нижче екрана її не піднімає. Задача 2.
5. **320 px, арабська, «легкий режим».** «120 с» + «Чекає рішення ведучого» не дають бічного скролу (статус обрізається трикрапкою); у RTL секунди лишаються `ltr`; «зменшити рух» і `is-easy` — без анімації. Задачі 2, 4.

---

### Задача 1. Табло: `timerFace` і стан «останні 5 с»

**Files:**
- Modify: `apps/web/src/live/Timer.tsx` (`TIMER_ENDING_S`, `TimerInput`, `TimerFace`, `timerFace`, клас `is-ending`), `apps/web/src/styles.css` (правила `.app.player/.app.host .timer.is-ending` одразу після `.timer-status` ~1157).
- Test: `apps/web/src/live/Timer.test.tsx`.

**Interfaces (Produces):** `TIMER_ENDING_S`, `TimerInput`, `TimerFace`, `timerFace(input, nowMs)` — як у «Рішеннях плану». `Timer` поки що без `useStickyTimer` (додається в задачі 2).

- [ ] **Step 1: Write the failing tests** у `Timer.test.tsx`, новий `describe('timerFace')`:
  - `counts the seconds, the bar and the full time like the board`: `timerFace({ view: { endsAt: null, remainingMs: 45_000 }, offsetMs: 0, total: 60_000, status: null, leadMs: 0 }, 0)` → `{ seconds: 45, pct: 75, status: null, totalText: '/ 60 с', ending: false }`; без `total` → `pct: null`, `totalText: ''`; `{ endsAt: null, remainingMs: null }` → `null`.
  - `uses the server clock offset`: `endsAt: 100_000, offsetMs: 5_000`, `nowMs: 85_000` → `seconds: 10`.
  - `a playing fragment holds the board on the full time and says listen`: `total: 40_000, leadMs: 10_000`, `endsAt: 40_000`, `nowMs: 0` → `seconds: 30`, `status: 'listening'`, `ending: false`.
  - `the last five seconds only while the clock runs and nothing holds it`: `endsAt: 5_000, nowMs: 0, status: null` → `ending: true`; `endsAt: 6_000` → `false`; `remainingMs: 3_000, status: 'paused'` → `false`; `remainingMs: 3_000, status: 'held'` → `false`.
  - `Timer` `marks the root in the last five seconds`: `vi.useFakeTimers()`, `render(<Timer view={{ endsAt: Date.now() + 4_500, remainingMs: null }} offsetMs={0} total={30_000} />)` → `screen.getByRole('timer').classList.contains('is-ending')` — `true`; з `endsAt: Date.now() + 9_000` — `false`, після `act(() => vi.advanceTimersByTime(4_200))` — `true`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/live/Timer.test.tsx`. Expected: FAIL (`timerFace` не експортовано).
- [ ] **Step 3: Implement** `timerFace` (перенести арифметику з `Timer`), `Timer` малює з `timerFace(…, Date.now())`, додає `is-ending`; CSS «останніх 5 с» лише під `.app.player` і `.app.host`.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/live apps/web/src/screens/StageScreen.test.tsx && pnpm typecheck`. Expected: PASS (наявні тести табло й сцени не змінились).
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/live/Timer.tsx apps/web/src/live/Timer.test.tsx apps/web/src/styles.css
git commit -m "feat(web): 55 timer — one timerFace for the seconds, bar and state, and the last five seconds in the accent colour on the phone and the host panel while the clock runs"
```

---

### Задача 2. Смужка: `StickyTimerProvider`, `useStickyTimer`, текст і CSS

**Files:**
- Create: `apps/web/src/live/StickyTimer.tsx`, `apps/web/src/live/StickyTimer.test.tsx` (`// @vitest-environment jsdom`; заглушка `IntersectionObserver` — як у `trophy/engine/stage.test.ts` ~44–100, помічник `scrollAway(isIntersecting, bottom)` викликає колбеки з `{ target, isIntersecting, boundingClientRect: { top: bottom - 60, bottom }, rootBounds: { top: 0, bottom: 568 } }`).
- Modify: `apps/web/src/live/Timer.tsx` (виклик `useStickyTimer`), `apps/web/src/styles.css` (блок `.timer-sticky*` після правил задачі 1), `apps/web/src/i18n.ts` (`timerLeft` після `timerPaused` ~49), `apps/web/src/locales/{en,de,es,it,pl,ar}.json` (`timerLeft` після `timerPaused`), `apps/web/src/i18n.test.ts` (`ADDED_STICKY_TIMER_55 = ['timerLeft']`, у умову ~616 і в новий тест).

**Interfaces:**
- Consumes: `TimerInput`, `timerFace`, `TIMER_ENDING_S` (задача 1), `STATUS_TEXT`.
- Produces: `StickyTimerProvider({ size: 'phone' | 'host', children })`, `useStickyTimer(element, input)`, класи `.timer-sticky`, `.is-host`, `.is-ending`, `.timer-sticky-left`, `.timer-sticky-status`, `.timer-sticky-bar`.

- [ ] **Step 1: Write the failing tests** у `StickyTimer.test.tsx` (`const strip = () => document.body.querySelector('.timer-sticky')`):
  - `outside a provider the timer watches nothing and shows no strip`: `render(<Timer view={{ endsAt: null, remainingMs: 12_000 }} offsetMs={0} total={30_000} />)` → конструктор `IntersectionObserver` не викликано, `strip()` — `null`.
  - `the strip appears when the main timer scrolls above the screen and leaves when it is back`: у `<StickyTimerProvider size="phone">` той самий `Timer`; `scrollAway(false, -10)` → `strip()` є, `getAttribute('aria-hidden') === 'true'`, `.timer-sticky-left` — `'12 с'`, `.timer-sticky-bar > span` `style.width === '40%'`, `screen.getAllByRole('timer')` — 1; `scrollAway(true, 80)` → `null`.
  - `a timer below the screen does not raise the strip`: `isIntersecting: false`, `boundingClientRect: { top: 700, bottom: 760 }` → `null`.
  - `the strip counts down by itself`: `vi.useFakeTimers()`, `endsAt: Date.now() + 12_000`, сховати, `act(() => vi.advanceTimersByTime(3_000))` → `'9 с'`.
  - `pause and held say the same words as the main timer and never turn the last seconds on`: `remainingMs: 3_000, status: 'paused'` → `.timer-sticky-status` — `'Пауза'`, без `is-ending`; `status: 'held'` → `'Чекає рішення ведучого'`.
  - `the last five seconds mark the strip with the main timer`: `endsAt: Date.now() + 4_500` → `strip().classList.contains('is-ending')` і `.timer.is-ending` — обидва `true`.
  - `no full time — seconds without a bar`: без `total` → `.timer-sticky-bar` немає, `'12 с'` є.
  - `two timers — the strip follows the older hidden one`: два `Timer` (12 с і 50 с), обидва сховані → `'12 с'`; перший `scrollAway(true, …)` → `'50 с'`; розмонтувати другий → `null`.
  - `the host size widens the strip`: `size="host"` → `strip().classList.contains('is-host')`.
  - `without IntersectionObserver nothing breaks`: `vi.stubGlobal('IntersectionObserver', undefined)` → рендер без помилки, `strip()` — `null`.
  - `i18n.test.ts`: `'55 sticky timer key is in every language'` — `ukMessages.timerLeft === '{seconds} с'`, у кожній локалі `timerLeft` містить `{seconds}`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/live/StickyTimer.test.tsx apps/web/src/i18n.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `StickyTimer.tsx` за «Рішеннями плану» (реєстр, хук, смужка з власним тіком, портал), виклик хука в `Timer`, ключ у 7 мовах, CSS `.timer-sticky*` з вимкненням анімації й переходу в `prefers-reduced-motion` і `:where(:root.is-easy)`.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/live apps/web/src/i18n.test.ts apps/web/src/source-scan.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/live apps/web/src/styles.css apps/web/src/i18n.ts apps/web/src/locales apps/web/src/i18n.test.ts
git commit -m "feat(web): 55 sticky timer — a 40 px aria-hidden strip with the seconds, state and bar for the oldest timer scrolled above the screen, its own tick, no animation with reduced motion or easy mode, «{seconds} с» in 7 languages"
```

---

### Задача 3. Телефон і пульт: провайдер, відступ для фокусу, сповіщення пульта

**Files:**
- Modify: `apps/web/src/screens/PlayerScreen.tsx` (~974, обгортка дітей `ReactionMain`), `apps/web/src/screens/HostScreen.tsx` (~639), `apps/web/src/styles.css` (`scroll-padding-top` для `.app.player.game-bg`/`.app.host.game-bg`, зсув `.host .live-notices` під смужку — у блоці задачі 2).
- Test: `apps/web/src/screens/PlayerScreen.test.tsx`, `apps/web/src/screens/HostScreen.test.tsx`, `apps/web/src/screens/StageScreen.test.tsx` (заглушка `IntersectionObserver` лише в нових `describe`, з `vi.unstubAllGlobals()` у `afterEach`).

**Interfaces:** Consumes: `StickyTimerProvider` (задача 2).

- [ ] **Step 1: Write the failing tests:**
  - `PlayerScreen.test.tsx` `describe('sticky timer (55)')` → `it('the question timer raises the strip when scrolled above the screen, the phone size')`: телефон на запитанні `text` з `endsAt: Date.now() + 20_000`, `limitMs: 30_000` (наявний конструктор вигляду файла); сховати `.question-head .timer` → `document.body.querySelector('.timer-sticky:not(.is-host)')` є, текст `'20 с'`; показати — немає.
  - `it('a duel question timer raises the strip too')` — вигляд дуелі зі `stage: 'question'` (наявний зразок у файлі) → після `scrollAway` смужка є.
  - `it('«Без годинника» shows no strip')` — `debuff.kind === 'noclock'` → жодного `IntersectionObserver.observe`, смужки немає.
  - `HostScreen.test.tsx` `it('the host panel timer raises a host-wide strip (55)')` → `.timer-sticky.is-host`.
  - `StageScreen.test.tsx` `it('the stage never watches its timer for a strip (55)')` → конструктор `IntersectionObserver` не викликано для `.timer`, `.timer-sticky` немає.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/screens/HostScreen.test.tsx apps/web/src/screens/StageScreen.test.tsx`. Expected: FAIL (провайдера ще немає — смужка не з'являється).
- [ ] **Step 3: Implement** обгортки й CSS.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 && pnpm typecheck`. Expected: PASS (увесь веб-проєкт — наявні тести екранів без заглушки не помічають провайдера).
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/screens apps/web/src/styles.css
git commit -m "feat(web): 55 sticky timer on every phone question and the host panel — provider on the player and host screens, scroll padding so a focused field stays below the strip, host notices move under it; the stage stays as it was"
```

---

### Задача 4. Наскрізні сценарії й кадри (`part55-sticky-timer.e2e.ts`)

**Files:**
- Create: `apps/server/e2e/part55-sticky-timer.e2e.ts` (каркас — як `part51-think-offtopic.e2e.ts`: `useE2eServer()`, `scenario(...)`, `openLight`, кадр області перегляду `vshot`; для темної теми — звичайний `open` і кадр без перевірки `is-light`).
- Помічники — лише локальні в цьому файлі (`helpers/common.ts` не правити — його змінює план 53):
  - `const strip55 = (page: Page) => page.locator('.timer-sticky')`;
  - `async function toBottom55(page)` — `window.scrollTo(0, document.documentElement.scrollHeight)`; `toTop55` — `scrollTo(0, 0)`;
  - `async function stripSeconds55(page): Promise<number>` — число з `.timer-sticky-left`.

**Вікторина** «Річки України 55» (`makeRoundsQuiz` з одним класичним раундом): q1 — `text` з довгим текстом запитання (≥ 900 символів: абзац про Дніпро, Дністер, Південний Буг і Десну; відповідь «Дніпро»), `timeLimit: 60`; q2 — `timedlist` (з фікстури, текст «Притоки Дніпра», 6 пунктів, `timeLimit: 60`); q3 — `single`, «Яка річка тече через Київ?», 4 варіанти, `timeLimit: 25`. Люди: ведучий (1280×900, далі 360×740), сцена 1280×720, Оля 320×568 темна, Петро 360×740 світла, Віра 360×740 з `reducedMotion: 'reduce'`.

**Сценарії:**
1. `it('part 55: phone 320×568 dark and 360×740 light — the strip appears when the question timer scrolls away, shows the same seconds, leaves when it is back, does not cover the focused answer field and does not scroll sideways', …)` — на q1 для Олі й Петра: спершу `scrollHeight > innerHeight + 100` (інакше подовжити текст); угорі `strip55` — 0 елементів; `toBottom55` → `strip55` видно (`expect.poll`, `POLL`), `boundingBox().height <= 40`, `aria-hidden="true"`, `|stripSeconds55 − seconds(page)| <= 1`, `getByRole('timer')` — 1; поле «Ваша відповідь»: `evaluate(el => el.scrollIntoView({ block: 'start' }))` → `field.top >= strip.bottom`; `noSideScroll` — `true`; кадри `sticky55-320-dark`, `sticky55-360-light`; `toTop55` → `strip55` — 0. Те саме на q2 (`timedlist`) для Олі: смужка з'являється після прокрутки, кадр `sticky55-320-list`. Сцена весь час: `.timer-sticky` — 0.
2. `it('part 55: pause and the last five seconds — the strip says «Пауза» while the host pauses, then turns accent with the main timer in the last 5 s; reduced motion shows it without animation', …)` — на q3: Петро й Віра прокручують вниз (на 360×740 з одним запитанням — спершу перевірити, що є прокрутка; якщо ні — `page.setViewportSize({ width: 360, height: 420 })`); ведучий «Пауза» → `.timer-sticky-status` — «Пауза», секунди стоять (два зчитування через 1,5 с однакові), `is-ending` немає; «Продовжити гру» → чекати `seconds(page) <= 5` → `.timer.is-ending` і `.timer-sticky.is-ending` — обидва є; у Віри `getComputedStyle(strip).animationName === 'none'`; кадр `sticky55-360-ending-light`.
3. `it('part 55: host panel 360×740 — the strip appears on the host console when its timer scrolls away and is host-wide, the stage has none', …)` — ведучий `setViewportSize({ width: 360, height: 740 })` на запитанні; `toBottom55` → `.timer-sticky.is-host` видно, висота ≤ 40, `noSideScroll`; угору — зникає; кадр `sticky55-host-360`.

- [ ] **Step 1: Write the scenarios.**
- [ ] **Step 2: Run** `pnpm build`, потім (після завершення збирання) `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 55"` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts/shots`.
- [ ] **Step 3: Run** по одному, після part 55, не одночасно: `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 31"` (легкий режим), потім `-t "part 29"` (довгі пазл/пам'ять на телефоні). Expected: PASS.
- [ ] **Step 4: Переглянути кадри:** на 320 px смужка в один рядок, «12 с» читається, статус не налазить; у світлій темі тло й рамка видно на білому; у темній — не зливається з шапкою; поле відповіді повністю під смужкою; на пульті смужка на всю ширину, а вміст — у межах 46rem.
- [ ] **Step 5: Commit**
```bash
git add apps/server/e2e/part55-sticky-timer.e2e.ts
git commit -m "test(e2e): part 55 — sticky timer on phones 320×568 dark and 360×740 light: appears below the fold and leaves at the top, same seconds, field not covered, pause and the last five seconds, reduced motion, host panel at 360 px, none on the stage"
```

---

## Точки злиття

- **План 53** (`.superpowers/worktrees/plan53`) правитиме `apps/web/src/styles.css`, `apps/web/src/i18n.ts`, `locales/*.json`, `i18n.test.ts` і `apps/server/e2e/helpers/common.ts`. Щоб конфліктів було менше: CSS 55 — у блоці табло (~1157), не в кінці файла; ключ `timerLeft` — поруч із `timerPaused` (~49 у `i18n.ts`, поруч із `"timerPaused"` у JSON), не в кінці; `helpers/common.ts` не чіпаємо. **Неминучий конфлікт** — рядок умови `adds no uk keys beyond the agreed list` (~616) і оголошення списків ~210: при злитті лишити обидва (`ADDED_ADMIN_HOME_53` і `ADDED_STICKY_TIMER_55`). Якщо 53 злито раніше — перед задачею 2 перебазувати `plan55` на `main` і перезапустити `i18n.test.ts`.
- **План 54 (бот-ведучий)** прийде пізніше; ймовірно торкнеться `HostScreen.tsx`/`PlayerScreen.tsx` біля кореня `ReactionMain`. Обгортка `StickyTimerProvider` — одна пара рядків; при конфлікті зберегти її навколо всіх дітей `ReactionMain`.

## Розбіжності зі специфікацією (рішення плану)

1. **«Останні 5 с — акцентний колір» — новий стан і основного табло**, бо зараз його немає (табло завжди `--amber`). Діє лише на телефоні й пульті (`.app.player`, `.app.host`), лише поки годинник іде; на сцені — без змін, як вимагає специфікація.
2. **Смужка з'являється, лише коли табло прокручене вище екрана**; табло нижче екрана (рідкісна розкладка) її не піднімає.
3. **Без повного часу — без смужки прогресу**: для табло без `total` (бліц, ланцюжок, повторний вибір) смужка показує лише секунди.
4. **«Без годинника» (дебаф) — без смужки**: там свідомо немає часу, `NoClock` — не `Timer`.
5. **Кілька табло водночас — одна смужка** за найстаршим прихованим табло.
6. **Висота 40 px без вирізу екрана**: на телефонах із вирізом додається `env(safe-area-inset-top)` над рядком.
7. **`scroll-padding-top` — постійно на ігрових екранах телефона й пульта**, не лише коли смужка видима (вона з'являється вже після прокрутки до поля).
8. **Ширина не обмежена «телефоном»**: смужка з'являється на будь-якій ширині, коли табло прокручено (на великому екрані це просто не стається); на пульті вміст — у межах 46rem, сповіщення пульта зсуваються під неї.
9. **Новий ключ один — `timerLeft` «{seconds} с»**; стани беруться з наявних `STATUS_TEXT`.
10. **Поява — коротка анімація 160 мс**, вимкнена з «зменшити рух» і в «легкому режимі»; зникнення — без анімації (смужка просто знімається).
