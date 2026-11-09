# План 26a: заставка «БЛІЦ!» перед бліц-клітинкою поля

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** після вибору бліц-клітинки на полі на весь екран (сцена, телефони, пульт ведучого) спершу перегортається клітинка, як і зараз. Потім 3 с стоїть великий напис «БЛІЦ!» з одним рядком правил. Лише після цього стартує запитання і його таймер.

**Spec:** `docs/superpowers/specs/2026-11-09-blitz-series-and-word-ladder-design.md`. Розділи: «A. Заставка «БЛІЦ!» перед бліц-клітинкою поля», «Спільні обмеження» і «Рішення будівника для A і B» (пункт A). Частини B і C сюди не входять.

**Архітектура:**
- **shared** (`packages/shared/src/game.ts`): новий вид заставки `'blitz'` у `SplashKind` і `SPLASH_MS.blitz = 3000`. Новий `blitzLeadMs(splash)` — скільки мс від початку заставки триває перегортання клітинки.
- **рушій** (`packages/engine/src/splash.ts`, `game.ts`, `views.ts`, `away.ts`). Бліц-клітинка отримує **одну** заставку виду `'blitz'`: `at` — мить вибору, `until` = `at` + ведення + 3000. Ведення — це перегортання клітинки (`SPLASH_MS.cell`, з ×2/×3 ще `CELL_SURPRISE_MS`), а коли `state.transitions` вимкнено — 0. Одна заставка: пауза, зсув, `splashLead`, відновлення після перезапуску й «старт таймера = кінець заставки» працюють як для наявних заставок. Другого перемикача станів і тіка посеред заставки немає.
- **веб** (`apps/web/src/live/Splash.tsx`, `styles.css`, три екрани). Шар `is-blitz` малює `CellFlip`, поки йде ведення, і над ним «БЛІЦ!» з рядком правил, що з'являється в мить `at + ведення`. Етапи йдуть на CSS-затримках, тими ж змінними, що штамп «×2!» (`--splash-elapsed`, `--splash-flip-ms`, `--splash-surprise-ms`), плюс нова `--splash-lead-ms`. Пульт ведучого для виду `blitz` показує повний шар замість значка `SplashChip`.

**Технології:** TypeScript, React 19 + Testing Library (jsdom), vitest, Playwright через vitest (e2e).

## Global Constraints

- `GAME_STATE_VERSION` лишається **22** (`packages/engine/src/restore.ts`), і `READABLE_STATE_VERSIONS` не змінюється. Підняття можливе лише з дозволу власника, бо скидає живі ігри; тут воно не потрібне. Старий знімок не може містити `kind: 'blitz'`: до 26a бліц-клітинка ставила `'cell'` або `null`. Новий стан із `'blitz'` читає вже новий код. Схеми zod для `splash` немає (`Splash` — інтерфейс рушія), тож полів схем 26a не додає. Нове значення переліку відмічається рядком у коментарі над `READABLE_STATE_VERSIONS`, без нової версії.
- Таймер запитання стартує на кінці заставки «БЛІЦ!»: `startedAt` = `splash.until`, `endsAt` = `startedAt + вікно`. До `startedAt` будь-яка дія гравця дає `not_started`, як і зараз.
- Пауза під час заставки поводиться як з іншими заставками перед запитанням: `shiftSplash` зсуває `at` і `until`, `splashLead` лічить залишок для `'blitz'`.
- Заставку видно на сцені, на телефонах і на пульті ведучого.
- Заставка показується **навіть за `state.transitions === false`**. Тоді вона без перегортання клітинки: ведення 0, лише «БЛІЦ!» 3000 мс.
- `prefers-reduced-motion: reduce`: без анімації появи, напис просто стоїть 3 с. Рух — лише в `@media (prefers-reduced-motion: no-preference)`. Поява й зникнення прозорістю (`splash-fade`) лишаються, як у всіх заставок.
- Звичайні бліц-**раунди** не змінюються: `questionSplashKind` для них і далі `null`, заставки немає.
- Звичайні клітинки поля (не бліц) не змінюються: `'cell'`, тривалість як була.
- Рядок під написом — наявні ключі `cellBlitzRuleInstant` / `cellBlitzRule`: перший, коли `view.blitz?.instant === true`. Нових правил не пишемо.
- Нові рядки інтерфейсу:
  - uk — в `apps/web/src/i18n.ts`;
  - ключі — у новому списку `ADDED_26A` в `apps/web/src/i18n.test.ts`, доданому до фільтра поряд з останнім `ADDED_*`;
  - переклади — у всіх 6 json (`apps/web/src/locales/{en,pl,de,es,it,ar}.json`);
  - ru ніколи; нічого про росію.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах.
- Тести: `pnpm vitest run --maxWorkers=2 <шлях>`. Типи: `pnpm typecheck`. Prettier не запускати.
- e2e: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "<частина>"`. Запускати на передньому плані, до 10 хв на один виклик.

## Рішення будівника (зафіксовані тут)

- **Одна заставка, а не дві поспіль.** Спека каже «іде після заставки клітинки». Тут це ведення всередині однієї заставки `'blitz'`. Так не треба вчити рушій перемикати `'cell'` → `'blitz'` тіком: таймер сервера, автопілот і пауза вже знають одну заставку.
- `blitzLeadMs({ at, until }) = Math.max(0, until - at - SPLASH_MS.blitz)` у shared. Його читає і веб, і тест рушія. Зсув паузою рухає `at` і `until` разом, тож ведення не змінюється. Окремого поля в стані немає.
- `withSplash` ставить заставку `'blitz'` і за вимкнених переходів. Решта видів, як і раніше, лише за `state.transitions`.
- Пульт ведучого. Правило «пульт заставкою не закривається» лишається для всіх інших видів. Для `'blitz'` пульт малює повний шар `<Splash size="phone">`, бо так велить спека. Шар має `pointer-events: none`, тож кнопки під ним (пауза, «Закрити») і далі натискаються.
- uk-рядок: `splashBlitz: 'БЛІЦ!'`. Переклади:
  - en `BLITZ!`, pl `BLITZ!`, de `BLITZ!`, it `BLITZ!`;
  - es `¡BLITZ!`;
  - ar `خاطف!` (як наявне `cellBlitz` «خاطف»).

## Review Focus

1. Ведучий закриває запитання («Закрити») посеред заставки «БЛІЦ!». Фаза змінюється, шар зникає на всіх екранах, `tick` нічого не ламає. Тест — у задачі 1.
2. Сервер перезапускається посеред заставки (`suspend` → `resume`). Залишок заставки додається перед таймером, і запитання стартує з повним часом. Тест — у задачі 1.
3. Гравець приєднується чи перепід'єднується посеред заставки, коли ведення вже минуло. Він одразу бачить «БЛІЦ!», а не перегортання з початку. Тест — у задачі 2.
4. Клітинка бліц з ×2/×3. Ведення = `SPLASH_MS.cell + CELL_SURPRISE_MS`, штамп «×2!» встигає показатися до «БЛІЦ!». Тест — у задачах 1 і 2.
5. Гравець, що сховав вкладку під час заставки, не рахується відсутнім до старту запитання (`away.ts` `splashEnd`). Тест — у задачі 1.

---

### Задача 1. Рушій: вид заставки `blitz` для бліц-клітинки

**Files:**
- Modify: `packages/shared/src/game.ts` (`SplashKind`, `SPLASH_MS`, новий `blitzLeadMs`)
- Modify: `packages/engine/src/splash.ts` (`withSplash`, `questionSplashKind`, `questionSplashMs`, `splashLead`)
- Modify: `packages/engine/src/game.ts:1156-1160` (`openQuestion`)
- Modify: `packages/engine/src/views.ts:1771` (`SPLASH_PHASE`)
- Modify: `packages/engine/src/away.ts:68-71` (`splashEnd`)
- Modify: `packages/engine/src/restore.ts` (лише рядок коментаря про нове значення `SplashKind 'blitz'` без підняття версії)
- Test: `packages/engine/src/game.splash.test.ts`, `packages/shared/src/game.test.ts` (або сусідній тест shared, де вже перевіряють `SPLASH_MS`; якщо такого немає, перевірку `blitzLeadMs` покласти в `game.splash.test.ts`)

**Interfaces:**
- Produces:
  - `SplashKind = 'round' | 'final' | 'question' | 'cell' | 'duel' | 'podium' | 'trial' | 'blitz'`;
  - `SPLASH_MS.blitz === 3000`;
  - `blitzLeadMs(splash: { at: number; until: number }): number` (експорт з `@quiz/shared`);
  - `questionSplashKind(state, board)` повертає `'blitz'`, коли `board?.kind === 'blitz'`;
  - `questionSplashMs(kind: SplashKind, board?: BoardPlay, transitions = true): number`. Для `'blitz'` це `(transitions ? questionSplashMs('cell', board) : 0) + SPLASH_MS.blitz`.

- [ ] **Крок 1: Тести, що падають.** У `game.splash.test.ts` старий тест «a board cell flips for 1 s before its timer; a blitz cell waits too» розділити: звичайна клітинка лишається `'cell'`, а бліц-частина переходить у нові тести нижче. Нові тести:
  - `a blitz cell flips, then «БЛІЦ!» stands 3 s; its timer starts after both`. Через `lobbyWithSplash`, `pickCell` бліц-клітинки о `T1`:
    - `s.splash` дорівнює `{ kind: 'blitz', at: T1, until: T1 + SPLASH_MS.cell + 3000 }`;
    - `[s.startedAt, s.endsAt]` дорівнює `[T1 + SPLASH_MS.cell + 3000, T1 + SPLASH_MS.cell + 3000 + 20_000]`;
    - `buzz(s, 'p1', T1 + SPLASH_MS.cell + 2999)` дає `{ ok: false, error: 'not_started' }`;
    - `buzz` о `T1 + SPLASH_MS.cell + 3000` проходить з `timeMs: 0`;
    - `blitzLeadMs(s.splash!)` дорівнює `SPLASH_MS.cell`.
  - `a marked blitz cell waits for the «×2!» stamp before «БЛІЦ!»`. Клітинка `kind: 'blitz', mark: 'x2'` (поле, що задає позначку, — як у наявних фікстурах з ×2):
    - `until - at` дорівнює `SPLASH_MS.cell + CELL_SURPRISE_MS + 3000`;
    - `blitzLeadMs` дорівнює `SPLASH_MS.cell + CELL_SURPRISE_MS`.
  - `without transitions a blitz cell still gets «БЛІЦ!» 3 s, without the flip`. Через `lobbyWith`, без заставок:
    - `s.splash` дорівнює `{ kind: 'blitz', at: T0, until: T0 + 3000 }`;
    - `s.startedAt` дорівнює `T0 + 3000`;
    - `blitzLeadMs` дорівнює `0`;
    - звичайна клітинка в тій самій грі й далі має `splash: null` і `startedAt === T0`.
  - Наявний `blitz rounds have no splash` лишається без змін, і він має проходити.
  - `a blitz splash paused midway shifts the question start by the pause`. `pause` о `T1 + 2000`, `resume` о `T1 + 12_000`:
    - `splash.until` і `startedAt` зсунулися рівно на `10_000`;
    - `endsAt - startedAt` лишився `20_000`.
  - `a room saved mid-blitz-splash restores with the rest of the splash before the timer` (Review Focus 2). `suspend(s, T1 + 1000)` з `./restore`, потім `resume` о `T1 + 60_000`: `startedAt` дорівнює `T1 + 60_000 + (SPLASH_MS.cell + 3000 - 1000)`.
  - `the host can close a blitz cell during «БЛІЦ!»` (Review Focus 1). `lock` о `T1 + 2000` проходить. `tick` до `endsAt` не змінює фазу назад. `splashView` (через `stageView`/`viewFor`, як у сусідніх тестах на вигляд) повертає `null`, щойно фаза вже не `question`.
  - `a player hidden during «БЛІЦ!» is not away before the question starts` (Review Focus 5). Повторити наявний тест відсутності для `'cell'`/`'question'` з `away.test.ts`, тільки з бліц-клітинкою: відлік відсутності йде від `splash.until`.
  - `the view shows the blitz splash in the question phase`: `viewFor(...).splash?.kind === 'blitz'`.

- [ ] **Крок 2: Запустити й переконатися, що падають.**
  Run: `pnpm vitest run --maxWorkers=2 packages/engine/src/game.splash.test.ts`
  Expected: FAIL. Очікують `kind: 'blitz'`, а є `'cell'`; тест без переходів отримує `splash: null`.

- [ ] **Крок 3: Реалізація.**
  - `game.ts` (shared): `'blitz'` у `SplashKind`, `blitz: 3000` у `SPLASH_MS` з коментарем «26a: бліц-клітинка поля після перегортання». Поряд — `blitzLeadMs`.
  - `splash.ts`:
    - `withSplash`: умова `state.transitions || kind === 'blitz'`;
    - `questionSplashKind`: `board?.kind === 'blitz'` → `'blitz'` перед `'cell'`;
    - `questionSplashMs`: третій параметр `transitions`;
    - `splashLead`: додати `'blitz'` до видів перед запитанням.
  - `game.ts` (рушій, `openQuestion`): `questionSplashMs(kind, board, state.transitions)`. Коментар «у бліці заставки немає» уточнити: «у бліц-раунді».
  - `views.ts`: `blitz: 'question'` у `SPLASH_PHASE`.
  - `away.ts`: `'blitz'` у `splashEnd`.

- [ ] **Крок 4: Тести проходять.**
  Run: `pnpm vitest run --maxWorkers=2 packages/engine/src/game.splash.test.ts`
  Expected: PASS.

- [ ] **Крок 5: Хвиля по наявних тестах.** Бліц-клітинка тепер стартує на 3000 мс пізніше і в іграх без переходів: `createGame` типово має `transitions: false`, менеджер у тестах сервера теж. Тести, що діють на бліц-клітинці в ту саму мить, що й `pickCell`, тепер дістануть `not_started`.
  Run: `pnpm vitest run --maxWorkers=2 packages/engine packages/shared apps/server/src`
  Кожен такий тест виправити, зсунувши мить дії на `SPLASH_MS.blitz` (і для тестів із заставками — на `SPLASH_MS.cell + SPLASH_MS.blitz`). Це файли з бліц-клітинками: `game.board-cells`, `live`, `views`, `game.video`, `game.buffs*`, `game.debuffs`, `game.sort`, `breakdown`, `appeal`, `autopilot.full`, `round-brief`, `guide-pages`, `views.sort`; у сервері — `manager.test`, `history.test`, `recorder.test`. Очікування балів, швидкості й порядку не змінювати: зсувається лише годинник. Якщо тест перевіряв саме «клітинка без заставки за вимкнених переходів», він має тепер очікувати `'blitz'`.
  Expected: усе PASS; `pnpm typecheck` без помилок. Тайпчек знайде кожен `Record<SplashKind, …>`, якому бракує `'blitz'`.

- [ ] **Крок 6: Коміт.**
  ```bash
  git add packages/shared/src/game.ts packages/engine/src apps/server/src
  git commit -m "feat(engine): 26a blitz cell splash — the cell flips, then «БЛІЦ!» 3 s, the timer starts after; shown even without transitions"
  ```

---

### Задача 2. Веб: шар «БЛІЦ!» у `Splash`, стилі й рядок

**Files:**
- Modify: `apps/web/src/live/Splash.tsx` (`SplashContent` case `'blitz'`, стиль шару в `Splash`)
- Modify: `apps/web/src/styles.css` (поряд з правилами `.splash-surprise`, ~7345-7410)
- Modify: `apps/web/src/i18n.ts` (`splashBlitz` поряд із `splashDuel`), `apps/web/src/i18n.test.ts` (`ADDED_26A = ['splashBlitz']` і в фільтрі), `apps/web/src/locales/{en,pl,de,es,it,ar}.json`
- Test: `apps/web/src/live/Splash.test.tsx`

**Interfaces:**
- Consumes: `SPLASH_MS.blitz`, `blitzLeadMs`, `SplashView.kind === 'blitz'` (задача 1).
- Produces:
  - розмітка `.splash.is-blitz`, усередині якої:
    - `.splash-blitz-lead` з `CellFlip` (лише коли ведення > 0);
    - `.splash-blitz` з `.splash-blitz-title` («БЛІЦ!») і `.splash-blitz-rule` (рядок правил).
  - Задачі 3 і 4 шукають саме ці класи.

- [ ] **Крок 1: Тести, що падають** (`Splash.test.tsx`; `board` з `kind: 'blitz'`, `view.blitz` з `instant`).
  - `blitz: the cell flips first, then «БЛІЦ!» with one rule line`. Шар `{ kind: 'blitz', at: T, until: T + SPLASH_MS.cell + SPLASH_MS.blitz }`:
    - є `.splash.is-blitz .splash-blitz-lead .splash-flip`;
    - `.splash-blitz-title` має текст `БЛІЦ!`;
    - за `blitz: { instant: true, … }` `.splash-blitz-rule` має текст `cellBlitzRuleInstant` («Відповідають усі одразу…»), а за `instant: false` — `cellBlitzRule`;
    - `style` містить `--splash-lead-ms: 1500ms` і `--splash-flip-ms: 1500ms`.
  - `blitz without transitions has no flip`: шар тривалістю рівно `SPLASH_MS.blitz` — `.splash-blitz-lead` немає, `--splash-lead-ms: 0ms`.
  - `a marked blitz cell keeps its «×2!» stamp inside the lead`: `mark: 'x2'`, ведення `SPLASH_MS.cell + CELL_SURPRISE_MS`. `.splash-surprise` має текст `×2!`, а `style` містить `--splash-surprise-ms: 800ms` і `--splash-lead-ms: 2300ms`.
  - `joined after the lead, the blitz splash shows «БЛІЦ!» at once` (Review Focus 3): `at: T - 2000`. `--splash-elapsed` дорівнює `-2000ms`, `.splash-blitz-title` є.
  - Стилі (`describe('splash styles')`):
    - `rule('.splash-blitz-lead')` містить `splash-title-out` і `var(--splash-lead-ms)`;
    - `rule('.splash-blitz')` містить `var(--splash-lead-ms)` і не містить `transform`;
    - `@keyframes splash-blitz-in` стоїть усередині `no-preference` (`insideNoPreference`), а `@keyframes splash-blitz-show` — поза ним;
    - `rule('.splash.is-blitz .splash-flip')` містить `var(--splash-flip-ms)`.
  - Наявний тест «on its plateau the splash hides the screen under it completely, for every kind» має пройти і для `'blitz'`. Якщо він перебирає види списком, додати туди `'blitz'`.

- [ ] **Крок 2: Падають.**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/live/Splash.test.tsx apps/web/src/i18n.test.ts`
  Expected: FAIL. Немає `.splash-blitz-title` і ключа `splashBlitz`.

- [ ] **Крок 3: Реалізація.**
  - `Splash.tsx`. У `Splash` для `splash.kind === 'blitz'` рахувати `lead = blitzLeadMs(splash)` і додати до стилю `--splash-lead-ms`, `--splash-flip-ms: SPLASH_MS.cell`, а за позначки клітинки ще `--splash-surprise-ms`. Клас `is-surprise` не ставити: штамп у бліці кероване окремими правилами `.splash.is-blitz`. `SplashContent` отримує `lead` пропсом. Case `'blitz'`:
    - `lead > 0 && view.board?.cell` → `<div className="splash-blitz-lead"><CellFlip …/></div>`;
    - потім `<div className="splash-blitz">`, а в ньому `<p className="splash-blitz-title">{t('splashBlitz')}</p>` і `<p className="splash-blitz-rule">{t(view.blitz?.instant === true ? 'cellBlitzRuleInstant' : 'cellBlitzRule')}</p>`.
  - `styles.css`:
    - `.splash-blitz-lead`: `position: absolute; inset: 0; display: grid; place-items: center`, а зникає через `animation: splash-title-out 0.15s linear calc(var(--splash-elapsed) + var(--splash-lead-ms)) both`;
    - `.splash.is-blitz .splash-flip { animation-duration: var(--splash-flip-ms) }`;
    - штамп і гасіння титулу в бліці — ті самі правила, що для `.splash.is-surprise`, з селектором `.splash.is-blitz` (розширити наявні списки селекторів);
    - `.splash-blitz`: `animation: splash-blitz-show 1ms steps(1, end) calc(var(--splash-elapsed) + var(--splash-lead-ms)) both`, де `@keyframes splash-blitz-show { from { opacity: 0 } to { opacity: 1 } }`. Під reduced motion напис просто стоїть;
    - `.splash-blitz-title`: шрифт `var(--display)`, `clamp(5rem, 14vw, 12rem)`, вага 800, колір `var(--amber)`, як бліц-клітинка. На `.is-phone` менший, щоб «¡BLITZ!» і «خاطف!» вміщалися в 360 px одним рядком;
    - `.splash-blitz-rule`: як `.splash-sub`, межа 60rem;
    - у `@media (prefers-reduced-motion: no-preference)`: `.splash-blitz { animation-name: splash-blitz-in; animation-duration: 0.45s; animation-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1) }`, а в `@keyframes splash-blitz-in` — масштаб від 1.4 до 1 і прозорість від 0 до 1.
    - Лише логічні властивості (RTL для `ar`).
  - i18n: uk `splashBlitz: 'БЛІЦ!'`, `ADDED_26A`, 6 json зі значеннями з «Рішень будівника».

- [ ] **Крок 4: Проходять.**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/live/Splash.test.tsx apps/web/src/i18n.test.ts apps/web/src/styles-rtl.test.ts`
  Expected: PASS.

- [ ] **Крок 5: Коміт.**
  ```bash
  git add apps/web/src/live/Splash.tsx apps/web/src/live/Splash.test.tsx apps/web/src/styles.css apps/web/src/i18n.ts apps/web/src/i18n.test.ts apps/web/src/locales
  git commit -m "feat(web): 26a «БЛІЦ!» splash — the cell flip, then the big word with the cell rule; stands still under reduced motion"
  ```

---

### Задача 3. Веб: сцена, телефон і пульт знають заставку `blitz`

**Files:**
- Modify: `apps/web/src/screens/StageScreen.tsx:188` (`busy`)
- Modify: `apps/web/src/screens/PlayerScreen.tsx:660` (`notStarted`)
- Modify: `apps/web/src/screens/HostScreen.tsx:324` (`underSplash`), `:545-546` (шар замість значка для `'blitz'`)
- Test: `apps/web/src/screens/HostScreen.test.tsx`, `apps/web/src/screens/PlayerScreen.test.tsx`, `apps/web/src/screens/StageScreen.test.tsx`

**Interfaces:**
- Consumes: класи `.splash.is-blitz`, `.splash-blitz-title` (задача 2).

- [ ] **Крок 1: Тести, що падають.** Кожен — з видом поля з відкритою бліц-клітинкою і `splash: { kind: 'blitz', at: now, until: now + SPLASH_MS.cell + SPLASH_MS.blitz }`, за фальшивих таймерів, як у сусідніх тестах заставок.
  - `HostScreen.test.tsx` — `the host sees the full «БЛІЦ!» layer, not the chip`:
    - є `.splash.is-blitz.is-phone .splash-blitz-title`;
    - `.splash-chip` немає;
    - для `kind: 'cell'` усе як раніше: значок є, шару немає;
    - кнопка «Пауза» доступна (`getByRole`) під шаром.
  - `PlayerScreen.test.tsx` — `answers wait under «БЛІЦ!»`: поки шар на екрані, телефон показує той самий стан «ще не почалося», що й під `'cell'` (повторити наявну перевірку `notStarted` для `'cell'`, якщо вона є; інакше — що кнопки варіантів неактивні або відсутні). Після `advanceTimersByTime(SPLASH_MS.cell + SPLASH_MS.blitz)` варіанти активні.
  - `StageScreen.test.tsx` — `the stage question is aria-busy under «БЛІЦ!»`: `aria-busy="true"` під час шару, `false` після.

- [ ] **Крок 2: Падають.**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/screens/HostScreen.test.tsx apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/screens/StageScreen.test.tsx`
  Expected: FAIL. На пульті лише значок, `busy` і `notStarted` не бачать `'blitz'`.

- [ ] **Крок 3: Реалізація.**
  - Три умови отримують `|| kind === 'blitz'`.
  - `HostScreen`: `view.splash?.kind === 'blitz' ? <Splash view={view} offsetMs={offsetMs} size="phone" /> : <SplashChip … />`. Коментар над рядком оновити: пульт не закривається заставкою, крім «БЛІЦ!» (26a; шар не ловить натискань).

- [ ] **Крок 4: Проходять разом з рештою вебу.**
  Run: `pnpm vitest run --maxWorkers=2 apps/web`
  Expected: PASS; `pnpm typecheck` без помилок.

- [ ] **Крок 5: Коміт.**
  ```bash
  git add apps/web/src/screens
  git commit -m "feat(web): 26a stage, phones and host wait under «БЛІЦ!»; the host sees the layer instead of the chip"
  ```

---

### Задача 4. e2e частини 26a і знімки

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts` (новий `it('part 26a: …')` після частини 7b; за зразок — `instantBlitzGame`, ~2429-2660)

- [ ] **Крок 1: Сценарій.** Назва: `part 26a: a blitz cell — the cell flips, «БЛІЦ!» stands 3 s on the stage, the phones and the host, then the question starts; a plain cell has no «БЛІЦ!»; reduced motion keeps the word still`. Вікторину зберегти через `POST /api/quizzes` з `makeRoundsQuiz([boardRound(...)])`. Поле з трьох категорій. Клітинки:
  - миттєвий телефонний бліц `{ kind: 'blitz', question: … }`;
  - бліц з `mark: 'x2'`;
  - звичайна клітинка.

  Хід сценарію:
  - Ведучий, сцена і троє гравців, як у 7b. Один телефон відкрити з `page.emulateMedia({ reducedMotion: 'reduce' })`.
  - Звичайна клітинка: після вибору `.splash.is-blitz` на сцені не з'являється (`afterSplash`, потім `count() === 0`).
  - Бліц-клітинка. Одразу після вибору на сцені, на двох телефонах і на пульті дочекатися `.splash.is-blitz .splash-blitz-title` з текстом `БЛІЦ!`. Поки шар на телефоні, кнопок варіантів ще немає або вони неактивні. Потім `afterSplash(stage, phone, host)`, варіанти з'являються, гра йде як у 7b: відповідь, «Прийняти», бали.
  - Перевірка часу. Від появи шару до зникнення на сцені минуло щонайменше `SPLASH_MS.cell + SPLASH_MS.blitz - 300` мс (`Date.now()` до і після).
  - На телефоні з reduced motion у кадрі «БЛІЦ!» `getAnimations()` елемента `.splash-blitz` не містить `splash-blitz-in`.
  - Бліц з ×2: на сцені спершу `.splash-surprise` з `×2!`, потім `.splash-blitz-title`.
  - Знімки (`shot(..., { splash: true })`):
    - `blitz26a-splash-stage`, `blitz26a-splash-phone`, `blitz26a-splash-host`, `blitz26a-splash-phone-reduced`;
    - `blitz26a-x2-stage`;
    - після шару — `blitz26a-question-stage`.

- [ ] **Крок 2: Збірка й прогін.**
  Run: `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 26a"`
  Expected: PASS.

- [ ] **Крок 3: Наявні сценарії з бліц-клітинками** мають пройти з новою паузою в 3 с. Кожен — окремим викликом:
  - `-t "a mixed board"`, `-t "part 7b"`, `-t "part 7f"`;
  - сценарій бафів з бліц-клітинкою (рядок ~6409 файлу; взяти його назву з `it(`);
  - `-t "part 10a"`.

  Де сценарій тисне відповідь одразу після вибору бліц-клітинки й таймаут чекання коротший за 4,5 с, додати `afterSplash(...)` перед дією. Очікувань не міняти.
  Expected: усі PASS.

- [ ] **Крок 4: Знімки для перевірки дизайну.**
  Run: `E2E_SHOTS=1` (у PowerShell `$env:E2E_SHOTS='1'`) і прогін `-t "part 26a"`.
  Переглянути знімки в `apps/server/e2e/artifacts/shots/blitz26a-*.png`:
  - «БЛІЦ!» на весь екран одним рядком, і на 360 px телефоні теж;
  - під ним один рядок правил;
  - на пульті шар над консоллю;
  - на ×2 штамп видно до напису.

- [ ] **Крок 5: Коміт.**
  ```bash
  git add apps/server/e2e/full-game.e2e.ts
  git commit -m "test(e2e): part 26a the «БЛІЦ!» splash before a blitz cell on the stage, phones and host; reduced motion; older blitz scenarios wait for it"
  ```
