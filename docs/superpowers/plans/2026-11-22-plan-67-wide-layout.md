# План 67: адаптивна верстка для великих екранів — увесь простір на ПК, телефон без змін (черга 45, пункт 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` — БЕЗ змін.** План торкається лише верстки вебу (`styles.css`, кілька обгорток у JSX) і e2e. Рушій, сервер, зрізи, збережені кімнати — не змінюються.

> **Звірка з кодом.** План спирається на `main` 2026-11-22 (`f2eccbbe`). Номери рядків `apps/web/src/styles.css` (28 623 рядки) — орієнтир; **перед кожною задачею виконавець звіряє селектори й рядки з кодом**, розбіжність — привід міняти рядки, не рішення плану.

## Специфікація

**Запит власника (черга 45, п. 1):** «Адаптувати додаток для великих екранів. Зробити так, щоб на великих екранах воно займало весь простір, а не лише по центру. Здебільшого ми зараз граємо з ПК, і це дуже незручно, коли воно так вузько. Зробити адаптивну верстку.»

**Рішення власника:** розширити **все** з розумним максимумом — ігрові екрани (сцена, пульт ведучого, екран гравця, відкритий на ПК), редактор вікторин, адмінку, профіль, списки й бібліотеку, групи, історію. Де допомагає — кілька колонок на ПК (сітки карток, бічні панелі поруч з основним вмістом). Довгий суцільний текст тримає зручну довжину рядка. Телефон (≤ 480 px, 375 px) має лишитися **точно таким, як зараз**.

**Як зараз (звірено 2026-11-22):**
- Каркас — `main.app` (`styles.css` ~270): `max-width: 34rem`, `margin: 0 auto`, поле `--app-pad: 1.25rem`. Модифікатори: `.app.host` 46rem (~284), `.app.wide, .app.editor` 46rem (~1640), `.app.editor` 68rem (~1884, перекриває попереднє), `.app.profile-main` 64rem від 960 px (~3726, дві колонки), `.app.stage` — `max-width: none` (~1332). `.app.narrow` — вхід, очікування, «Створити гру» — 34rem.
- Меню (`menu/WithMenu.tsx`, `.with-menu`, `.menu` ~3520): ≤ 700 px — нижня панель, ширше — липка смуга згори. Сторінки поза грою — усередині `.with-menu`.
- Хто вузький на 1920 × 1080 і 1528 × 828: усе з `.app.wide` (46rem = 736 px: головна, «Мої вікторини», бібліотека, стрічка, календар, історія, «Мої ігри», перегляд гри, профіль-підсторінки, групи, друзі, призи, досягнення, адмінка), пульт `.app.host` (736 px), екран гравця `.app.player` (544 px), редактор (68rem = 1088 px), профіль (64rem). Сцена вже на всю ширину, але дошки всередині обмежені: `.stage-board` `min(100%, 60rem)` (~1515), `.stage-survey .survey-board` і `.stage-bluff .bluff-board` 60rem, `.quest-*` 60rem, `.stage .question-video` 960px.
- Синхронні числа: `.timer-sticky-row` 34rem / `.is-host` 46rem (~1204, ~1210) — липка смужка таймера повторює ширину колонки; `.host-wordle .wordle-board` рахує клітинку з `min(100vw, 46rem)` (~27298).
- Брейкпойнти зараз — розсип (`700px`, `30rem`, `480px`, `400px`, `960px`, `1100px`, `48rem`…), жодного спільного для «ПК».

**Що робимо:**
1. **Токени ширин** у `:root` (одне місце, одна таблиця) і `.app { max-width: var(--app-w, var(--w-phone)) }`: кожен тип сторінки ставить лише `--app-w`.
2. **Три брейкпойнти ПК** (сталі числа — змінні в `@media` не працюють, тож вони записані коментарем біля токенів):
   - `≤ 700px` — телефон (нижнє меню) — **без жодних змін**;
   - `701–1023px` — планшет — ширини як до 67 (34 / 46 / 68 rem);
   - `≥ 1024px` (**ПК**) — ширші колонки, сітки карток;
   - `≥ 1280px` (**ПК з панелями**) — бічні панелі (пульт, адмінка), дві колонки там, де вони мають сенс;
   - `≥ 1600px` (**великий ПК**) — більші межі, ще одна колонка в сітках, більші дошки сцени.
   Усі нові правила — **лише всередині** `@media (min-width: 1024px)`, `(min-width: 1280px)`, `(min-width: 1600px)`. Поза ними значення токенів дорівнюють сьогоднішнім числам — телефон і планшет не змінюються ні на піксель.
3. **Довжина рядка:** прямі діти сторінки з текстом (`p`, `.field`, `form`) на ПК тримають `max-inline-size: var(--w-read)`; картки й таблиці — на всю колонку.
4. **Сітки карток** (`repeat(auto-fill, minmax(var(--card-min), 1fr))`) для списків: вікторини, бібліотека, стрічка, календар, збережені ігри, групи, призи, досягнення, друзі, картки адмінки.
5. **Бічні панелі:** пульт ведучого (гравці, бали, посилання — праворуч від запитання), адмінка (вкладки — ліворуч вертикально).
6. **Візуальна перевірка:** новий e2e `part67-wide-layout.e2e.ts`, кожна задача дописує свій сценарій: 1920 × 1080, 1366 × 768 і 375 × 812, без бічної прокрутки, ширина колонки — перевірене число, кадри `E2E_SHOTS=1`.

**Таблиця токенів** (задача 1 додає в перший `:root`, біля `--menu-h`):

| Токен | До 1024 px | ≥ 1024 | ≥ 1280 | ≥ 1600 | Для чого |
|---|---|---|---|---|---|
| `--w-phone` | 34rem | 34rem | 34rem | 34rem | `.app` за замовчуванням, `.app.narrow` (вхід, очікування) |
| `--w-tablet` | 46rem | 46rem | 46rem | 46rem | `.app.wide`/`.app.host` до 1024 px |
| `--w-read` | 42rem | 42rem | 42rem | 42rem | довгий текст: ≈ 70 знаків у рядку |
| `--w-form` | 36rem | 36rem | 36rem | 36rem | форми налаштувань, оголошення адмінки |
| `--w-page` | — | 72rem | 80rem | 96rem | списки, профіль, групи, історія, стрічка |
| `--w-player` | — | 48rem | 52rem | 56rem | екран гравця на ПК |
| `--w-host` | — | 64rem | 88rem | 104rem | пульт (від 1280 — з бічною панеллю) |
| `--w-editor` | 68rem | 80rem | 92rem | 110rem | редактор |
| `--w-admin` | — | 72rem | 92rem | 110rem | адмінка |
| `--w-stage-board` | 60rem | 60rem | 60rem | 76rem | дошки сцени (сцена міняється лише від 1600: усі e2e сцени — 1280 × 720) |
| `--side-w` | — | — | clamp(20rem, 24vw, 28rem) | те саме | бічна колонка пульта |
| `--card-min` | — | 18rem | 20rem | 22rem | мінімальна ширина картки в сітках |

(«—» — токен не використовується на цій ширині; задати його в `:root` усе одно, щоб `var()` ніде не був порожнім.)

**Чого не робимо:** не міняємо телефонну верстку, шрифти й розміри елементів телефона; не додаємо `container-type` на `.app` чи нові обгортки з position: fixed нащадками (layout containment робить елемент контейнером для fixed-нащадків і стосовим контекстом — зламає тости, заставки й тривогу «відійшов»); не робимо обгортки липкими (`position: sticky` = стосовий контекст); не чіпаємо легкий режим і світлу тему окремо (вони працюють через rem і змінні).

## Глобальні обмеження

- **`GAME_STATE_VERSION` не змінюється**; рушій, сервер, `packages/*` — без змін.
- **Телефон ≤ 700 px без змін:** нові правила лише в `@media (min-width: 1024px | 1280px | 1600px)`; верхньорівневі правила міняються тільки на `var(--…)` з тим самим числом. Кожна задача перевіряє 375 px кадром і `expectNoSideScroll`/`expectPhoneFit`.
- **Логічні властивості** (`margin-inline`, `inset-inline-*`, `padding-inline`, `max-inline-size`): `styles-rtl.test.ts` не пускає `left`/`right` без `/* phys */`.
- **Без стосових контекстів на main гри:** `theme.test.ts` («the game main makes no stacking context») не дозволяє на `.app*`, `main*`, `.game-bg` `isolation`, `z-index`, `transform`, `filter`, `opacity`, `contain`, `will-change`; від себе додаємо — без `container-type` і `position: sticky` на `.app` і нових обгортках пульта.
- **Тести, що читають `styles.css` як текст** (не ламати): `theme.test.ts` (`/\n\.app\s*\{([^}]*)\}/` — тіло `.app` має `--app-pad: 1.25rem;` і `padding: … var(--app-pad)`), `screens/Buffs.test.tsx` `rule('.app.player')` (перше **верхньорівневе** `\n.app.player {` має `var(--notice-room)`), `styles-wordle.test.ts` (`.app.player.has-reactions .wordle-play`, `.app.stage:has(> .stage-speech)…`), `live/StickyTimer.test.tsx` (`.timer-sticky-row` має `height: calc(2.5rem - 4px)`), `profile/Showcase.test.tsx` і `screens/Likes.test.tsx`, `QuestView.test.tsx`, `ReactionSheet.test.tsx`, `PuzzleView.test.tsx` (шукають блоки `@media (max-width: 480px) {` / `@media (max-width: 400px) {` — нових таких блоків не додавати), `menu/Menu.test.tsx` і `styles-rtl.test.ts` (`@media (min-width: 701px) and (max-width: 900px) {`, `@media (max-width: 700px) {` з `.with-menu .actions`), `Splash.test.tsx`, `VideoclipView.test.tsx`, `trophy/PrizeViewer.test.tsx` (`max-width: 100%`/`min(` у своїх правилах). Правила всередині `@media` пишуться з відступом (`\n  .app.player {`), тож пошук `\n.app.player {` їх не зачіпає — так і лишити.
- **Нових i18n-ключів план не потребує** (лише верстка). Якщо задача все ж додасть текст (наприклад, `aria-label` області) — uk у `apps/web/src/i18n.ts`, переклади в `apps/web/src/locales/{en,de,es,it,pl,ar}.json`, список `ADDED_WIDE_67` у `apps/web/src/i18n.test.ts` в обох місцях, як `ADDED_ERRORS_64`. Кириличні літерали в `apps/web/src/` — лише в словниках і тестах (`source-scan.test.ts`).
- Коментарі в CSS і коді — **українською**, як у кодовій базі (короткі, «чому», а не «що»).
- Тести — завжди `--maxWorkers=2`: `pnpm test --project web --maxWorkers=2 <шляхи>`; типи — `pnpm exec tsc -p apps/web` (у задачі 9 — `pnpm typecheck`). **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (виняток — повний прогін `pnpm e2e` у задачі 9, що йде годинами: його у фоні, але тоді нічого іншого паралельно не запускати).
- Файли правити лише Edit/Write чи `sed`; **python3 на цій машині — порожня заглушка**; після коміту — `git show --stat`.
- Робоче дерево — лише `C:\ClaudeCode\quiz\.superpowers\worktrees\plan67`; тимчасові файли — у `.superpowers` чи scratchpad сесії. Після злиття — зупинити dev-сервери.
- e2e: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 67"`; кадри — `apps/server/e2e/artifacts/shots/`. **Виконавець переглядає кадри** (Read на PNG) на 1920, 1366 і 375 і описує в звіті, що бачить.
- У фікстурах і ніках e2e — **нічого, пов'язаного з росією**.

## Спільний помічник e2e (створює задача 1, решта дописує сценарії)

`apps/server/e2e/part67-wide-layout.e2e.ts`:

```ts
/** Три екрани 67: великий ПК, ноутбук, телефон. */
const SIZES_67 = [
  { tag: '1920', width: 1920, height: 1080 },
  { tag: '1366', width: 1366, height: 768 },
  { tag: '375', width: 375, height: 812 },
] as const;

/** Кадр лише видимої частини (що бачить людина) + повний кадр; без бічної прокрутки на кожному розмірі. */
async function wide67(page: Page, name: string, check?: (size: (typeof SIZES_67)[number]) => Promise<void>) {
  for (const size of SIZES_67) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.evaluate('new Promise(requestAnimationFrame)');
    expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), `${name}-${size.tag}: horizontal scroll`).toBe(true);
    await check?.(size);
    await viewportShot67(page, `${name}-${size.tag}`);
    await shot(page, `${name}-${size.tag}-full`);
  }
}

/** Ширина main (px) — для перевірок «на ПК колонка ширша за 736 px, на телефоні — як була». */
const mainWidth67 = (page: Page) => page.evaluate(`document.querySelector('main').getBoundingClientRect().width`) as Promise<number>;
```

`viewportShot67` — як `viewportShot` у `part60-small-fixes.e2e.ts` (лише якщо `E2E_SHOTS=1`, `mkdirSync(resolve(ARTIFACTS, 'shots'))`). Гра — за зразком `game55` з `part55-sticky-timer.e2e.ts` (реєстрація ведучого `register(host, 'host', …)`, `POST /api/quizzes` з `makeRoundsQuiz([classicRound(…)])`, «Грати» в `/quizzes`, сцена за посиланням «Відкрити сцену», `join(page, code, nick, false)`, `click(host, 'Почати гру')`, `afterSplash`). Адмін — як `withAdmin` у `part53-admin-home.e2e.ts` (`relisten({ adminEmails: adminEmails({ ADMIN_EMAILS }) })`, у `finally` — `relisten()`). Кожен сценарій — окремий `it('part 67…: …')`, щоб `-t "part 67"` запускав усі, а `-t "part 67 host"` — один.

Очікувані числа (для `check`): на 375 — `mainWidth67` дорівнює ширині до 67 (`375`, бо 34rem > 375 px); на 1366 і 1920 — більше за 736 px для `.app.wide`/`.app.host`, більше за 544 px для `.app.player`; точні межі — з таблиці токенів (`--w-page` 80rem = 1280 px на 1366 мінус поля; 96rem = 1536 px на 1920).

---

### Задача 1. Токени ширин, каркас `.app`, довжина рядка, заготовка e2e 67

**Files:**
- Modify: `apps/web/src/styles.css` — перший `:root` (~1–80), `.app` (~270), `.app.host` (~284), `.app.wide, .app.editor` (~1640), `.app.editor` (~1884), `.timer-sticky-row` (~1198–1212), `.host-wordle .wordle-board` (~27298); новий розділ «67: великі екрани» — **в кінці файлу** (щоб перекривати без підвищення специфічності; перед ним — коментар із брейкпойнтами).
- Create: `apps/web/src/styles-wide.test.ts`
- Create: `apps/server/e2e/part67-wide-layout.e2e.ts` (помічник вище + перший сценарій)

**Що змінити:**
- [ ] **Step 1: Write the failing test** `apps/web/src/styles-wide.test.ts` (читає `styles.css` як `styles-rtl.test.ts`, тим самим `readFileSync` і коментарем про `@types/node`):
  - `it('declares the width tokens once, in the first :root, with the pre-67 numbers below 1024 px')` — у першому `:root { … }` є `--w-phone: 34rem;`, `--w-tablet: 46rem;`, `--w-read: 42rem;`, `--w-form: 36rem;`, `--w-editor: 68rem;`, `--w-stage-board: 60rem;`, а також `--w-page`, `--w-player`, `--w-host`, `--w-admin`, `--side-w`, `--card-min`.
  - `it('the page column is a token: .app reads --app-w, falling back to the phone width')` — тіло `\n.app {` містить `max-width: var(--app-w, var(--w-phone));` і далі `--app-pad: 1.25rem;`.
  - `it('below 1024 px the modifiers keep their old widths')` — верхньорівневі `\n.app.host {` → `--app-w: var(--w-tablet);`, `.app.wide` → `var(--w-tablet)`, `.app.editor` → `var(--w-editor)`; жодного верхньорівневого `max-width: 34rem|46rem|68rem` у `.app*` не лишилося.
  - `it('every rule for big screens sits inside min-width 1024, 1280 or 1600 px')` — усі `@media (min-width: …)`, що згадують `--app-w` чи `--w-`, мають лише ці три числа.
  - `it('no stacking context and no containment on the page column')` — жодне правило з селектором `.app…`, `.host-cols`, `.host-main`, `.host-side`, `.admin-body` не містить `container-type`, `contain:`, `position: sticky`, `isolation`, `z-index`, `transform`, `filter`, `opacity`, `will-change` (той самий `cssRules`, що в `theme.test.ts`; якщо він не експортований — скопіювати маленький розбір правил у тест).
  - `it('the sticky timer row follows the column width')` — `.timer-sticky-row` має `max-width: var(--w-phone)`, `.timer-sticky.is-host .timer-sticky-row` — `var(--w-tablet)`; у `@media (min-width: 1024px)` є `.timer-sticky.is-host .timer-sticky-row` з `var(--w-host)` і `.timer-sticky:not(.is-host) .timer-sticky-row` з `var(--w-player)`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/styles-wide.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - `:root` — токени з таблиці (значення «до 1024»; для токенів з «—» — значення з колонки `≥ 1024`), над ними коментар: «67: ширини колонок. Брейкпойнти — сталі числа (змінні в @media не працюють): ≤ 700 — телефон, 701–1023 — планшет (ширини як до 67), ≥ 1024 — ПК, ≥ 1280 — бічні панелі, ≥ 1600 — великий ПК.»
  - Кінець файлу: `@media (min-width: 1024px) { :root { --w-page: 72rem; --w-player: 48rem; --w-host: 64rem; --w-editor: 80rem; --w-admin: 72rem; --card-min: 18rem; } }`, так само для 1280 і 1600 за таблицею. (`:root` у `@media` — нова змінна на ширших екранах, решта правил її лише читає.)
  - `.app`: `max-width: 34rem` → `max-width: var(--app-w, var(--w-phone));` (решта тіла — без змін, `--app-pad` лишається першим рядком поля). `.app.host` → `--app-w: var(--w-tablet);` (замість `max-width`; `scroll-padding-bottom` лишається). `.app.wide, .app.editor` → `--app-w: var(--w-tablet);`, `.app.editor` (~1884) → `--app-w: var(--w-editor);`. `.app.stage` лишає `max-width: none`.
  - Кінець файлу, `@media (min-width: 1024px)`: `.app.wide { --app-w: var(--w-page); }`, `.app.host { --app-w: var(--w-host); }`, `.app.player { --app-w: var(--w-player); }` (`.app.narrow` — без змін, 34rem); бічне поле `--app-pad` на ПК — `clamp(1.25rem, 2.5vw, 2.5rem)` у тих самих трьох правилах (герой `.motif-hero` іде за ним сам).
  - Довжина рядка, там само: `.app.wide > :is(p, .field, form), .app.host > p { max-inline-size: var(--w-read); }` — суцільний текст і поля форм не розтягуються на 80rem. (Не чіпати `.toolbar`, `.banner`, `.error` у банерах на всю ширину — їх перевірити кадрами.)
  - `.timer-sticky-row` 34rem → `var(--w-phone)`, `.is-host` 46rem → `var(--w-tablet)`; у `@media (min-width: 1024px)` — `var(--w-host)` / `var(--w-player)` (смужка таймера стоїть рівно над колонкою).
  - `.host-wordle .wordle-board`: `min(100vw, 46rem)` → `min(100vw, var(--w-tablet))` (задача 3 переведе на ширину основної колонки пульта).
- [ ] **Step 4: e2e-заготовка** `part67-wide-layout.e2e.ts`: `useE2eServer()`, помічник із розділу вище, перший сценарій `it('part 67 shell: …')` — людина з акаунтом (`register(page, 'menu', 'Оксана Широка', 'wide67@example.com')`), сторінки `/`, `/quizzes`, `/login` (вийти — нова сторінка без входу) крізь `wide67`; перевірка: `/quizzes` на 375 — `mainWidth67` = 375, на 1366 — > 736, на 1920 — > 1200 і ≤ 1536 + 2×поле; `/login` (`.app.narrow`) — ≤ 544 на всіх розмірах.
- [ ] **Step 5: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/styles-wide.test.ts apps/web/src/theme.test.ts apps/web/src/styles-rtl.test.ts apps/web/src/styles-wordle.test.ts apps/web/src/screens/Buffs.test.tsx apps/web/src/live/StickyTimer.test.tsx apps/web/src/profile/Showcase.test.tsx apps/web/src/menu/Menu.test.tsx`; `pnpm exec tsc -p apps/web`; `pnpm exec tsc -p apps/server/e2e`; `pnpm build`; `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 67"`. Expected: PASS; на кадрах 375 — сторінки як до 67 (порівняти з `git stash`-кадром, якщо сумнів), на 1920 — колонка широка, текст абзаців не довший за 42rem.
- [ ] **Step 6: Commit**
```bash
git add apps/web/src/styles.css apps/web/src/styles-wide.test.ts apps/server/e2e/part67-wide-layout.e2e.ts
git commit -m "feat(web): 67 width tokens and big-screen breakpoints — the page column reads --app-w (phone and tablet keep 34/46/68 rem), from 1024/1280/1600 px wide pages, the host and the player phone grow, running text keeps a readable line; sticky timer follows the column; e2e 67 shell shots at 1920, 1366 and 375"
```

### Задача 2. Екран гравця на ПК (`.app.player`, сторінки входу в гру)

**Files:**
- Modify: `apps/web/src/styles.css` (розділ «67» у кінці; за потреби — точкові правки правил гравця з `100vw`)
- Modify: `apps/web/src/styles-wide.test.ts`, `apps/server/e2e/part67-wide-layout.e2e.ts`

**Що змінити:**
- [ ] **Step 1: Аудит** (записати висновок у звіт): `grep -n "100vw\|100dvw\|vw)" apps/web/src/styles.css` — правила, де екран гравця рахує розмір від ширини вікна, вважаючи її шириною колонки (дошки `wordle`, `sudoku`, `crossword`, `jigsaw`, `memory`, `spotdiff`, `pin`, слайдер `.slider-scale`, смуги `.debuff-banner`/`.duel-banner`, `.reaction-strip`). На ПК колонка ≤ 56rem, а вікно — 1920: формула з `100vw` має брати `min(100vw, var(--app-w))` чи ширину контейнера. Виправити лише ті, що на кадрі 1920 виходять за колонку або стають дрібними.
- [ ] **Step 2: Write the failing tests** у `styles-wide.test.ts`:
  - `it('on a computer the player phone screen is wider, the waiting pages stay narrow')` — у `@media (min-width: 1024px)` є `.app.player` з `--app-w: var(--w-player)`; `.app.narrow` ніде в `@media (min-width…)` не отримує `--app-w`.
  - `it('on a computer text choices stand in two columns, picture choices in three')` — у `@media (min-width: 1024px)`: `.app.player .choices` → `grid-template-columns: repeat(2, minmax(0, 1fr))`, `.app.player .choices.has-images` → `repeat(3, minmax(0, 1fr))`.
- [ ] **Step 3: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/styles-wide.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** у розділі «67»:
  - `@media (min-width: 1024px)`: дві колонки варіантів (вище), варіант із дуже довгим текстом лишається читабельним (`min-width: 0` уже є; перевірити кадром на запитанні з варіантами по 80 символів). Поля відповіді (`AnswerInput`, числове, текстове) — `max-inline-size: var(--w-read)`, щоб поле вводу не тягнулося на 52rem.
  - Нижні смуги й сповіщення гравця, що стоять `position: fixed` по центру з `max-width` під колонку телефона, — ширина `min(100% - 2rem, var(--app-w))` (знайти за аудитом).
  - Правки з аудиту (Step 1).
  - **Телефон:** жодного верхньорівневого правила `.app.player` не змінювати (у `Buffs.test.tsx` перше `\n.app.player {` має `var(--notice-room)`).
- [ ] **Step 5: e2e** — `it('part 67 player: …')`: гра на 3 запитання (single з 4 варіантами, single з картинками-варіантами, numeric; таймери ≥ 25 с, правильні відповіді — у різних позиціях), ведучий 1280 × 900, сцена 1920 × 1080, гравець «Тарас» на сторінці; на запитанні `wide67(player, 'player67-choices', …)`: на 1920 два варіанти в одному рядку (`boundingBox().y` першого й другого рівні), на 375 — один під одним, як було; `mainWidth67` на 1920 ≤ 56rem×16 + поля. Також сторінка `/play/<code>` до входу (`.app.narrow`, поле ніку) — `wide67(…, 'player67-join')`, ширина ≤ 544.
- [ ] **Step 6: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/styles-wide.test.ts apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/screens/Buffs.test.tsx apps/web/src/styles-wordle.test.ts apps/web/src/theme.test.ts apps/web/src/styles-rtl.test.ts`; `pnpm build`; `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 67 player"`; потім `-t "part 55"` (липка смужка таймера на телефонах) і `-t "part 48"` (wordle). Expected: PASS; кадри 375 — як до 67.
- [ ] **Step 7: Commit**
```bash
git add apps/web/src/styles.css apps/web/src/styles-wide.test.ts apps/server/e2e/part67-wide-layout.e2e.ts
git commit -m "feat(web): 67 the player phone screen on a computer — a wider column, choices in two columns (pictures in three), answer fields at a readable width, fixed bars follow the column; the join pages stay narrow; e2e 67 player shots"
```

### Задача 3. Пульт ведучого: ширша колонка й бічна панель від 1280 px

**Files:**
- Modify: `apps/web/src/screens/HostScreen.tsx` (обгортки колонок навколо вмісту між `<header className="bar">` і `<footer className="actions">`, ~652–1660)
- Modify: `apps/web/src/screens/HostScreen.test.tsx`
- Modify: `apps/web/src/styles.css`, `apps/web/src/styles-wide.test.ts`, `apps/server/e2e/part67-wide-layout.e2e.ts`

**Що змінити:**
- [ ] **Step 1: Write the failing tests:**
  - `HostScreen.test.tsx`: `it('during a question the players, the scores and the links sit in the side column, the question in the main one')` — рендер фази `question` з 2 гравцями й `standings`: `.host-cols > .host-main` містить панель запитання й «Відповіді наживо», `.host-cols > .host-side` містить заголовок «Гравці: 2», `details.host-scores` і `nav.links`; `footer.actions` — **поза** `.host-cols` (липка панель на всю ширину).
  - `it('in the lobby the players list and the lobby extras are in the side column')` — фаза `lobby`: `.host-side` містить «Гравці», `LobbyAccess`/`InviteFriends` (за їхніми заголовками).
  - `it('the finished game keeps its standings and prizes in the main column')` — фаза `finished`: панель підсумку (`Standings`, `MenuLinks`) у `.host-main`, `.host-side` не містить підсумку.
  - `styles-wide.test.ts`: `it('host columns are invisible wrappers below 1280 px and a grid from 1280 px')` — верхньорівневе `.host-cols, .host-main, .host-side` → `display: contents;`; у `@media (min-width: 1280px)` `.host-cols` → `display: grid;` з `grid-template-columns: minmax(0, 1fr) var(--side-w)`, `.host-main, .host-side` → `display: flex; flex-direction: column;` з тим самим `gap`, що в `.app` (1.25rem).
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/screens/HostScreen.test.tsx apps/web/src/styles-wide.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - JSX: після `<header className="bar">…</header>` відкрити `<div className="host-cols"><div className="host-main">`; у main лишається все до тернарного блоку «підсумок / команди в лобі / список гравців» (~1500–1612). Тернарний блок розділити: гілка `finished` лишається в `host-main`; гілки «команди в лобі» і «список гравців» — у `<div className="host-side">` разом із: підсумком truth/think, що йде за ними, лишити в main (це вміст розкриття); `HostScores` (~1630), рядки лобі `levelBonuses`/`familyLobby`, `LobbyAccess`, `InviteFriends`, `PrizePlaces`, `LeaguePick`, `nav.links`, `ResumePanel`, `SlotsPanel` — у side. `error` (`p.error role=alert`) — у main, над панелями дій. Закрити обидві обгортки перед `<footer className="actions">`. **Саме `<div>`, не `<aside>`:** на `display: contents` орієнтири (landmarks) читачі екрана губили; додаткова роль не потрібна — у кожної панелі свій заголовок.
  - Порядок у DOM для телефона/планшета не змінюється (main, потім side = так само, як ішли блоки до 67; звірити: якщо `HostScores` до 67 стояв **після** списку гравців — так і лишити). Через `display: contents` до 1280 px обгортки не існують для верстки: `.app` flex-gap і поведінка як зараз.
  - CSS: верхньорівнево `.host-cols, .host-main, .host-side { display: contents; }`; `@media (min-width: 1280px)` — сітка (Step 1), `align-items: start`, `gap: 1.25rem 2rem`; `.host-side .rows .name` — переносити довгі ніки чи обрізати трикрапкою (як у `.live-row .name` ~12830) — перевірити кадром із ніком на 40 знаків.
  - `.host-wordle .wordle-board`: клітинка від ширини основної колонки — `min(100vw, var(--w-tablet))` → у `@media (min-width: 1280px)` `calc(min(100vw, var(--w-host)) - var(--side-w) - 2rem)`, у `@media (min-width: 1024px) and (max-width: 1279px)` — `min(100vw, var(--w-host))` (звірити кадром, що дошка не виходить за колонку).
  - Без `position: sticky` / `overflow` на `.host-side` (див. «Чого не робимо»): `PointsPanel`/`DebuffPanel` і тости лишаються в звичайному потоці.
- [ ] **Step 4: e2e** — `it('part 67 host: …')`: гра з 4 гравцями (сокети `pilotPlayer`/сторінки, як у part 60) і текстовим запитанням; `wide67(host, 'host67-question', …)`: на 1920 і 1366 `.host-side` праворуч від `.host-main` (`x` більший), список гравців видно без прокрутки на 1920; на 375 — `.host-side` під основною (як було), `expectNoSideScroll`; лобі — `wide67(host, 'host67-lobby')`; підсумок — `wide67(host, 'host67-finished')`. Липка `footer.actions` не накриває останній рядок side (прокрутити донизу, порівняти `boundingBox`).
- [ ] **Step 5: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/screens/HostScreen.test.tsx apps/web/src/pages/Host.test.tsx apps/web/src/pages/Host.live.test.tsx apps/web/src/styles-wide.test.ts apps/web/src/theme.test.ts apps/web/src/styles-rtl.test.ts`; `pnpm exec tsc -p apps/web`; `pnpm build`; e2e `-t "part 67 host"`, потім — частини, що відкривають пульт на 1280 і перевіряють його геометрію: `-t "part 11"` (темп, «наживо»), `-t "part 12f"` (панель балів, `points field clips`), `-t "part 07"` (сортування, рядок з довгим іменем на 375), `-t "part 55"` (смужка таймера на пульті). Expected: PASS. Якщо падає перевірка, що спиралася на одну колонку пульта на 1280, — виправити верстку, а не тест; тест міняти лише тоді, коли він міряв саме стару ширину (і пояснити в коміті).
- [ ] **Step 6: Commit**
```bash
git add apps/web/src apps/server/e2e/part67-wide-layout.e2e.ts
git commit -m "feat(web): 67 host console on a computer — from 1280 px the question and live answers fill the main column, players, scores, lobby extras and links stand in a side column; wrappers are display: contents below 1280 so phone and tablet stay as before; the finished summary stays in the main column; e2e 67 host shots"
```

### Задача 4. Сцена: більші дошки на великому екрані (≥ 1600 px)

**Files:**
- Modify: `apps/web/src/styles.css` (`.stage-board` ~1515, `.stage-survey .survey-board` ~10724, `.stage-bluff .bluff-board` ~10973, `.quest-stage-prompt`/`.quest-stage .quest-lock`/`.quest-table-wrap` ~23641–23777, `.stage .question-video` ~479, `.stage-board.is-award .award-body` ~13384, `.truth-stage .truth-seal` ~19955; розділ «67»)
- Modify: `apps/web/src/styles-wide.test.ts`, `apps/server/e2e/part67-wide-layout.e2e.ts`

**Що змінити:**
- [ ] **Step 1: Write the failing test** у `styles-wide.test.ts`: `it('stage boards read one token and grow only from 1600 px')` — `.stage-board` має `width: min(100%, var(--w-stage-board));`, `.stage-survey .survey-board` і `.stage-bluff .bluff-board` — `max-width: var(--w-stage-board)`; `--w-stage-board` змінюється лише в `@media (min-width: 1600px)` (`76rem`); усі `.stage*`-правила в розділі «67» — лише всередині `(min-width: 1600px)`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/styles-wide.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement:** числа 60rem у названих правилах → `var(--w-stage-board)` (до 1600 — ті самі 60rem; правила на 80rem/90rem — `is-board-intro`, `board-with-legend`, `stage-wipeout`, `stage-survival`, `is-round-end.has-facts`, `:has(.standings li:nth-child(9))` — не чіпати); `@media (min-width: 1600px)`: `.stage .question-video { max-width: min(100%, calc(62vh * 16 / 9)); }` (відео росте до висоти екрана, а не 960 px), `.stage-board.is-award .award-body` і `.truth-stage .truth-seal` — `max-width: min(100%, 64rem)` / `72rem` (текст нагороди лишається читабельним), `.stage .round-brief` — лише якщо на кадрі 1920 рядок опису закороткий (≤ 40 знаків), інакше не чіпати. **Чому від 1600:** усі наявні e2e сцени (`expectStageFits`, `expectStageInView`) — 1280 × 720; на них нічого не змінюється.
- [ ] **Step 4: e2e** — `it('part 67 stage: …')`: та сама гра, що в задачі 3 (або окрема, з опитуванням «100 до 1» лише з **реального опублікованого** опитування й таблицею балів на 6 гравців): `wide67(stage, 'stage67-question')`, `'stage67-standings'`; на 1920 `.stage-board` ширший за 960 px і `expectStageFits` (уміщається без прокрутки) на 1920 × 1080 і 1366 × 768. Розмір 375 для сцени — лише перевірка «без бічної прокрутки» (сцену з телефона не дивляться, але й ламати не можна).
- [ ] **Step 5: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/styles-wide.test.ts apps/web/src/screens/StageScreen.test.tsx apps/web/src/styles-wordle.test.ts apps/web/src/theme.test.ts`; `pnpm build`; e2e `-t "part 67 stage"`, потім `-t "part 10"` (опитування, блеф) і `-t "part 29"` (квест і дошка). Expected: PASS.
- [ ] **Step 6: Commit**
```bash
git add apps/web/src/styles.css apps/web/src/styles-wide.test.ts apps/server/e2e/part67-wide-layout.e2e.ts
git commit -m "feat(web): 67 stage on a big screen — boards read --w-stage-board and grow from 1600 px, the question video fills the screen height, award and seal texts keep a readable width; nothing changes at 1280 × 720; e2e 67 stage shots"
```

### Задача 5. Редактор вікторин

**Files:**
- Modify: `apps/web/src/styles.css` (`.app.editor` ~1884, `.editor-grid` ~1888, `.editor-quiz`, `@media (max-width: 860px)` ~2293 — **не чіпати**; розділ «67»)
- Modify (за потреби, лише класи): `apps/web/src/editor/QuizEditor.tsx`
- Modify: `apps/web/src/styles-wide.test.ts`, `apps/server/e2e/part67-wide-layout.e2e.ts`

**Що змінити:**
- [ ] **Step 1: Write the failing test** у `styles-wide.test.ts`: `it('the editor grows with --w-editor, the question list column grows with the screen')` — у `@media (min-width: 1280px)` `.editor-grid` має `grid-template-columns: minmax(0, clamp(19rem, 22vw, 26rem)) minmax(0, 1fr)`; `.editor-quiz` має сітку на дві колонки для `details.rules` (`grid-template-columns: repeat(2, minmax(0, 1fr))`, `align-items: start`), а назва вікторини (`.editor-quiz > .field`) — `grid-column: 1 / -1`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/styles-wide.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement:** ширина — уже через `--w-editor` (задача 1: 68 → 80 → 92 → 110 rem); `@media (min-width: 1280px)` — колонка списку запитань `clamp(19rem, 22vw, 26rem)`, налаштування вікторини (`details.rules`: правила, команди, сили, запасні, дуелі) — у дві колонки; у `.editor-stage` — поля з довгим текстом (`textarea` запитання, пояснення) на всю колонку, короткі (`.field.compact`, бали, таймер) — у ряд (`display: flex; flex-wrap: wrap` для наявного контейнера коротких полів — знайти в `QuestionEditor.tsx`, клас не вигадувати, якщо він уже є); у `@media (min-width: 1600px)` — варіанти відповідей single/multiple у дві колонки (контейнер варіантів у `QuestionEditor.tsx`; якщо окремого класу немає — додати `className="option-rows"` і тест у `QuestionEditor.test.tsx`, що він є). Редактори-дошки (`BoardEditor`, `SudokuEditor`, `CrosswordEditor`, `JigsawEditor`) — лише перевірити кадром, що не розтягуються криво (мають власні сітки).
- [ ] **Step 4: e2e** — `it('part 67 editor: …')`: автор відкриває `/quizzes/new` (чи збережену вікторину з 3 раундами різних типів), `wide67(author, 'editor67')`: на 1920 і 1366 список запитань ліворуч, редактор праворуч, налаштування у дві колонки; на 375 — як до 67 (`.question-nav` видно, список згорнуто).
- [ ] **Step 5: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/styles-wide.test.ts apps/web/src/editor/QuizEditor.test.tsx apps/web/src/editor/QuestionEditor.test.tsx apps/web/src/editor/BoardEditor.test.tsx`; `pnpm exec tsc -p apps/web`; `pnpm build`; e2e `-t "part 67 editor"`, потім `-t "part 43"` (банк запитань у редакторі) і `-t "part 42"` (імпорт/експорт). Expected: PASS.
- [ ] **Step 6: Commit**
```bash
git add apps/web/src apps/server/e2e/part67-wide-layout.e2e.ts
git commit -m "feat(web): 67 quiz editor on a computer — wider page, the question list column grows with the screen, quiz settings in two columns, short fields in a row, answer options in two columns from 1600 px; phone editor unchanged; e2e 67 editor shots"
```

### Задача 6. Адмінка: вкладки збоку, сітки карток

**Files:**
- Modify: `apps/web/src/admin/Admin.tsx` (`<main className="app wide admin-page">`, `<Routes>` — у `<div className="admin-body">`)
- Modify: `apps/web/src/admin/Admin.test.tsx`
- Modify (лише класи-модифікатори, за аудитом): `apps/web/src/admin/Admin*.tsx` з `admin-list`
- Modify: `apps/web/src/styles.css` (`.admin-tabs` ~17402, `.admin-list` ~17468, розділ «67»), `apps/web/src/styles-wide.test.ts`, `apps/server/e2e/part67-wide-layout.e2e.ts`

**Що змінити:**
- [ ] **Step 1: Аудит** 25 вживань `admin-list`: списки карток (користувачі, вікторини, групи, скарги, живі ігри, бот-кімнати) → сітка; списки-рядки, що читаються зверху вниз (журнал `AdminLog`, помилки `AdminErrors`, стрічка `AdminFeed`, повтор `AdminReplay`, копії `AdminBackups`) → `admin-list is-rows` (лишаються в одну колонку). Записати поділ у звіт.
- [ ] **Step 2: Write the failing tests:**
  - `Admin.test.tsx`: `it('the admin page has the tabs and the body as two blocks for the wide layout')` — `main.admin-page` містить `nav.admin-tabs` і `.admin-body` (вміст маршруту — усередині `.admin-body`).
  - Для 1–2 сторінок-рядків (наприклад `AdminLog.test.tsx`, `AdminErrors.test.tsx`): список має клас `is-rows`.
  - `styles-wide.test.ts`: `it('admin: tabs on the side from 1280 px, card lists as a grid, row lists in one column')` — у `@media (min-width: 1024px)` `.app.admin-page` → `--app-w: var(--w-admin)`, `.admin-list:not(.is-rows)` → `repeat(auto-fill, minmax(var(--card-min), 1fr))`; у `@media (min-width: 1280px)` `.app.admin-page` → `display: grid` з `grid-template-columns: minmax(12rem, 15rem) minmax(0, 1fr)`, `.admin-page > .brand` → `grid-column: 1 / -1`, `.admin-tabs` → `flex-direction: column`, `overflow-x: visible`.
- [ ] **Step 3: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/admin/Admin.test.tsx apps/web/src/styles-wide.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement:** JSX (Step 2); CSS у розділі «67». Вкладки збоку: `align-self: start`, кнопки на всю ширину колонки (`width: 100%` уже є в `.admin-tabs a.btn`), значок `.menu-badge` не з'їжджає (кадр); `scrollIntoView` активної вкладки в `Admin.tsx` лишається (на ПК він нічого не гортає). Форми (`.admin-announce`, `.admin-broadcast` 40rem, `.admin-backups` 48rem) — без змін. Таблиці й графіки (`.admin-charts`, `.admin-stats` уже `auto-fit`) — на всю колонку; графіки — перевірити кадром, що SVG масштабується, а не розтягує підписи. Картка гравця (`AdminUser`, розділи `admin/card/*`) — на ≥ 1280 дві колонки розділів (`.admin-player-card` сітка `repeat(2, minmax(0, 1fr))`, розділ «Видалити» і «Об'єднати» — `grid-column: 1 / -1`), якщо кадр показує, що одна колонка 92rem — порожня й довга.
- [ ] **Step 5: e2e** — `it('part 67 admin: …')` з адміном через `relisten({ adminEmails: adminEmails({ ADMIN_EMAILS: 'admin67@example.com' }) })` (у `finally` — `relisten()`), 3 звичайні акаунти й одна вікторина: `wide67` для `/admin`, `/admin/users`, `/admin/users/<id>`, `/admin/log`, `/admin/quizzes`; на 1920 вкладки ліворуч (`nav.admin-tabs` `x` < `.admin-body` `x`), користувачі — у ≥ 3 колонки; на 375 — вкладки одним рядком із прокруткою вбік **всередині** `nav` (сторінка без бічної прокрутки), як до 67.
- [ ] **Step 6: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/admin apps/web/src/styles-wide.test.ts apps/web/src/admin/announce-styles.test.ts`; `pnpm exec tsc -p apps/web`; `pnpm build`; e2e `-t "part 67 admin"`, потім `-t "part 53"`, `-t "part 58"`, `-t "part 63"`, `-t "part 64"` (адмінка на 360 px). Expected: PASS.
- [ ] **Step 7: Commit**
```bash
git add apps/web/src apps/server/e2e/part67-wide-layout.e2e.ts
git commit -m "feat(web): 67 admin on a computer — wider page, tabs as a side column from 1280 px, card lists as a grid while log, errors, feed and backups stay one row per line, the player card in two columns; phone tabs unchanged; e2e 67 admin shots"
```

### Задача 7. Головна, «Мої вікторини», бібліотека, стрічка, календар, історія, перегляд гри, довідка

**Files:**
- Modify: `apps/web/src/styles.css` (`.start-menu` ~3975, `.quiz-list` ~1663, `.library-list` ~26904, `.feed-list` ~17076, `.saved-games` ~14673, `.stats` ~1784; розділ «67»)
- Modify (класи): `apps/web/src/pages/GameHistory.tsx` (`<main className="app wide game-history">`), `apps/web/src/pages/HostHelp.tsx` (уже `host-help`), `apps/web/src/pages/LibraryQuiz.tsx` (уже `library-quiz`)
- Modify: `apps/web/src/pages/GameHistory.test.tsx`, `apps/web/src/styles-wide.test.ts`, `apps/server/e2e/part67-wide-layout.e2e.ts`

**Що змінити:**
- [ ] **Step 1: Write the failing tests:**
  - `styles-wide.test.ts`: `it('lists become card grids on a computer')` — у `@media (min-width: 1024px)` один селектор-список `.quiz-list, .library-list, .feed-list, .saved-games` (та інші, знайдені кадрами) → `grid-template-columns: repeat(auto-fill, minmax(var(--card-min), 1fr))`; `.start-menu` → `repeat(auto-fit, minmax(12rem, 1fr))`; `it('help and a library quiz keep a reading width')` — `.app.host-help`, `.app.library-quiz` → `--app-w: var(--w-read)` (суцільний текст), `it('a finished game page lays its panels out in two columns from 1280 px')` — `.app.game-history` → `display: grid; grid-template-columns: repeat(2, minmax(0, 1fr))`, `.app.game-history > :is(h1, .brand, .meta, .history-tabs, .error, .wide-panel)` → `grid-column: 1 / -1`.
  - `GameHistory.test.tsx`: `main` має клас `game-history`; таблиця відповідей (найширша панель) — з класом `wide-panel`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/styles-wide.test.ts apps/web/src/pages/GameHistory.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - Сітки (Step 1). `.quiz-list` уживають `Quizzes`, `History`, `MyGames`, `CreateGame` — перевірити кадром кожну; картка вікторини з кнопками (`.row-actions`) у вузькій комірці переносить кнопки (`flex-wrap` уже є). Стрічка: порядок «новіші зверху» в сітці читається рядками — прийнятно (рішення власника: «сітки карток»); якщо кадр показує дуже різну висоту карток — `align-items: start`.
  - Головна (`.app.wide.start`): `--app-w: 64rem` на ПК (плитки + «Приєднатися» не розлітаються на 96rem), плитки `auto-fit`, `join-area` поруч із плитками від 1280 px лише якщо в `Home.tsx` вони вже сусіди одного контейнера (інакше лише ширші плитки — без змін JSX).
  - Календар (`Calendar.tsx`, `feed-page`, `.calendar-day`) — дні в сітку з тим самим `--card-min`.
  - `MyGames` `.stats` (3 числа) — на ПК `repeat(auto-fit, minmax(10rem, 1fr))`.
  - Перегляд гри (`GameHistory`) — дві колонки панелей від 1280 px (Step 1); `.wipeout-history`, `.think-places-table`, `.truth-author-row` — перевірити кадром, широкі таблиці — `wide-panel`.
  - Довідка ведучого, опис вікторини в бібліотеці — `--w-read` (текст), а `.library-rounds` у `library-quiz` — дві колонки від 1024 px.
- [ ] **Step 4: e2e** — `it('part 67 lists: …')`: людина з 7 вікторинами (`POST /api/quizzes`, назви на українську тематику — річки, міста, страви, без росії), 2 зіграні ігри (автопілот, як `createAutopilot` у part 60, або коротка гра з одним гравцем-сокетом), 1 подія календаря; `wide67` для `/`, `/quizzes`, `/library`, `/feed`, `/calendar`, `/history`, `/history/<id>`, `/help`; на 1920 `/quizzes` — ≥ 3 картки в першому рядку (однакові `y`), на 375 — одна під одною, `expectPhoneFit` (нижнє меню не накриває останній елемент).
- [ ] **Step 5: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/styles-wide.test.ts apps/web/src/pages apps/web/src/feed apps/web/src/calendar apps/web/src/library`; `pnpm exec tsc -p apps/web`; `pnpm build`; e2e `-t "part 67 lists"`, потім `-t "part 47"` (бібліотека), `-t "part 17"` (стрічка, календар), `-t "part 22"` (меню, профіль на телефоні), `-t "part 65"` (повтор гри). Expected: PASS.
- [ ] **Step 6: Commit**
```bash
git add apps/web/src apps/server/e2e/part67-wide-layout.e2e.ts
git commit -m "feat(web): 67 lists on a computer — my quizzes, library, feed, calendar, saved games and history as card grids, wider start tiles, a finished game in two columns of panels, help and a library quiz at a reading width; phone lists unchanged; e2e 67 list shots"
```

### Задача 8. Профіль, публічний профіль, підсторінки профілю, групи, друзі, призи, досягнення, виклики

**Files:**
- Modify: `apps/web/src/styles.css` (`.app.profile-main` ~3726, `.profile-tiles` ~3855, `.group-card` ~24078, `.prize-list` ~15654, `.achievement-cards`, `.group-cards`, `.friend-list`, `.group-item-list`, `.group-member-list`, `.liked-list`, `.award-grid`, `.profile-list`; розділ «67»)
- Modify (класи): `apps/web/src/pages/PublicProfile.tsx` (головна гілка — `app wide profile-main`, якщо структура колонок `profile-col` та сама; інакше — власна сітка), `apps/web/src/pages/profile/ProfileSettings.tsx` (`className="settings-page"` у `ProfileSubpage`, якщо ще немає)
- Modify: відповідні `*.test.tsx` (лише класи), `apps/web/src/styles-wide.test.ts`, `apps/server/e2e/part67-wide-layout.e2e.ts`

**Що змінити:**
- [ ] **Step 1: Write the failing tests** у `styles-wide.test.ts`:
  - `it('the profile keeps two columns from 960 px and grows with --w-page')` — у `@media (min-width: 960px)` `.app.profile-main` більше не має `max-width: 64rem`, а `--app-w: var(--w-page)` діє з 1024 px (через `.app.wide`); від 1600 px — `grid-template-columns: minmax(0, 2fr) minmax(0, 3fr)` (ліворуч шапка й плитки, праворуч вітрини — ширші).
  - `it('profile sub pages: card lists as grids, settings at a form width')` — у `@media (min-width: 1024px)` селектор-список `.achievement-cards, .group-cards, .prize-list, .friend-list, .group-item-list, .liked-list, .award-grid` → `display: grid` з `repeat(auto-fill, minmax(var(--card-min), 1fr))` (для `.prize-list` — `display: grid` замість `flex`); `.app.settings-page` → `--app-w: var(--w-form)`.
  - Для `ProfileSettings.test.tsx` (чи `Profile.test.tsx`): `main` має клас `settings-page`; для `PublicProfile.test.tsx` — `main` має клас `profile-main`, якщо Step 3 обрав цей шлях.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/styles-wide.test.ts apps/web/src/pages/profile apps/web/src/pages/PublicProfile.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - Профіль: прибрати `max-width: 64rem` з `@media (min-width: 960px) .app.profile-main` — від 960 до 1023 він брав би `--w-tablet` (46rem): лишити `--app-w: 64rem` у цьому діапазоні (`@media (min-width: 960px) and (max-width: 1023px)`), щоб планшет не змінився; від 1024 — `--w-page`. Плитки `.profile-tiles` — 4 в ряд лишаються (тест у коментарі «по 4 в ряд на будь-якій ширині»), лише ширші.
  - Публічний профіль: дві колонки як у власного (той самий `profile-col`), якщо розмітка дозволяє; інакше — розділи `profile-section` у `repeat(2, minmax(0, 1fr))` від 1280 px.
  - Підсторінки (`ProfileSubpage` → `app wide profile-sub`): сітки (Step 1); групи — `GroupPage` вкладки `group-tabs` над вмістом, вміст вкладки «питання/шаблони» — сітка; учасники `group-member-list` — сітка; `GroupItemPage` — `--w-read` (текст запитання); налаштування, «Вигляд» (`ProfileLooks` — кольори й шрифти ніку) — перевірити кадром, чи сітка зразків не розтягує їх на 80rem (якщо так — `--w-form` або власна `auto-fill`); «Рівні» (`ProfileLevels`) — таблиця на всю колонку; статистика (`ProfileStats` `.profile-list`) — сітка.
  - Виклик (`ChallengePage`, `app challenge-page`) і група-запрошення (`GroupJoin`, `app group-join`) — це картки з однією дією: `--app-w: var(--w-form)` на ПК.
- [ ] **Step 4: e2e** — `it('part 67 profile: …')`: людина з 2 друзями, 1 групою (3 учасники), кількома досягненнями (за зіграною грою) і призом (якщо призи легко засіяти через API, як у part 25; інакше без призу); `wide67` для `/profile`, `/profile/<id>` (публічний), `/profile/achievements`, `/profile/groups`, `/profile/groups/<id>`, `/profile/friends`, `/profile/settings`, `/profile/stats`; на 1920 — профіль у дві колонки, досягнення ≥ 3 в ряд; на 375 — `expectPhoneFit` (і перевірка `stat dt` без розриву слів усередині `expectPhoneFit`).
- [ ] **Step 5: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/styles-wide.test.ts apps/web/src/pages apps/web/src/profile apps/web/src/groups apps/web/src/prizes`; `pnpm exec tsc -p apps/web`; `pnpm build`; e2e `-t "part 67 profile"`, потім `-t "part 12k"` (групи), `-t "part 22"` (профіль на телефоні), `-t "part 49"` (рівні в профілі), `-t "part 44"` (виклики). Expected: PASS.
- [ ] **Step 6: Commit**
```bash
git add apps/web/src apps/server/e2e/part67-wide-layout.e2e.ts
git commit -m "feat(web): 67 profile on a computer — two columns grow with the page, the public profile too, achievements, groups, prizes, friends and likes as card grids, settings and one-action pages at a form width; phone and tablet profile unchanged; e2e 67 profile shots"
```

### Задача 9. Повна перевірка: усі розміри, усі наявні e2e, підсумкові кадри

**Files:**
- Modify (лише за знахідками): `apps/web/src/styles.css`, `apps/server/e2e/part67-wide-layout.e2e.ts`, тести, що міряли саме стару ширину

**Що зробити:**
- [ ] **Step 1: Легкий режим і світла тема.** У `part67-wide-layout.e2e.ts` — `it('part 67 easy and light: …')`: `/quizzes`, пульт і гравець на запитанні з `:root.is-easy` (rem = 19 px: `--w-page` 96rem = 1824 px > 1920 − поля — колонка має впиратися в 100 %, без бічної прокрутки) і в світлій темі (`quiz:theme = light`); RTL — `/quizzes` і пульт мовою `ar` (`localStorage` мови, як у part 22): бічна колонка пульта стоїть ліворуч, вкладки адмінки — праворуч. `wide67` на всіх трьох розмірах.
- [ ] **Step 2: Unit-тести вебу цілком:** `pnpm test --project web --maxWorkers=2`; `pnpm typecheck`. Expected: PASS.
- [ ] **Step 3: Повний e2e:** `pnpm e2e` (збирає клієнт і проганяє всі частини; довго — у фоні, нічого паралельно не запускати). Більшість частин відкривають ведучого, автора й сцену на 1280 px, тобто вже в новій верстці (пульт — з бічною колонкою). Кожне падіння розібрати: (а) верстка справді зламана на ПК (щось накрите, обрізане, прокручується вбік) — виправити CSS/JSX; (б) тест міряв стару одну колонку (наприклад, «рядок під рядком» на 1280, позицію відносно `main`) — переписати перевірку на суть (видимість, не накрито, без бічної прокрутки), а не на стару ширину, з коментарем «67: на ПК пульт у дві колонки». Повторити впалі частини окремо `-t "<part>"` до зеленого.
- [ ] **Step 4: Підсумкові кадри:** `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 67"`; переглянути кожен кадр `*-1920.png`, `*-1366.png`, `*-375.png` у `apps/server/e2e/artifacts/shots/`; у звіті — список екранів і короткий опис (що в скількох колонках, де бічна панель, що на телефоні без змін). Кадри 375 порівняти з кадрами `main` до 67 (зібрати `main` в окремому дереві чи `git stash`, ті самі сценарії `-t "part 67"` на 375): відмінностей бути не повинно — інакше знайти правило, що протекло за межі `@media (min-width: 1024px)`.
- [ ] **Step 5: Commit** (якщо були правки)
```bash
git add apps/web/src apps/server/e2e
git commit -m "test(e2e): 67 big screens in easy mode, light theme and right to left; existing parts adjusted where they measured the old single column; final 1920/1366/375 shots"
```
- [ ] **Step 6:** злиття в `main` і push (як завжди в цьому проєкті), зупинити dev-сервери, прибрати дерево `plan67` **окремою** командою після успішного злиття (не через `;`).
