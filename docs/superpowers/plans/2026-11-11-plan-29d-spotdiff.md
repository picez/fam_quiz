# План 29d: запитання «Знайди відмінності» (`spotdiff`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> План спирається на `main` після 29c (`5497fe04`). Звідти беремо: `PUZZLES_ROUND_TYPES`/`fitsPuzzlesRound`, `jigsaw_place`, `packages/engine/src/jigsaw.ts` (`jigsawRefusal`, `jigsawRecord`, `scoreJigsaw`, `packJigsaws`), `jigsawOpen` у `debuffs.ts`, `RoomManager.jigsawPlace`/`jigsawApply`, `jigsawRate`, `commit(…, puzzle = true)` і `PUZZLE_PUSH_MS`, `puzzleGrid`/`puzzlePageSize`/`usePage` з `PuzzleView.tsx`, `useImageUpload` з `ImageField.tsx`, `measure` з `PinEditor.tsx`, `ADDED_29C` в `i18n.test.ts`, e2e `part 29c`. **Перед кожною задачею виконавець звіряє назви й рядки з фактичним кодом.**

**Goal:** новий тип запитання `spotdiff` («Знайди відмінності»): ведучий заливає дві картинки й позначає колами від 1 до 10 відмінностей. Гравець (команда — одна спільна дошка) тапає по будь-якій картинці. Влучання з допуском дає `ціна / N` балів, усі знайдені дають повну ціну. Після 3 промахів підряд гравець замерзає на 1 с.

**Architecture:**
- **Геометрія (`shared/src/spotdiff.ts`, чиста):** перевірка влучання з допуском (`spotHit`), допуск (`spotSlack`) і бали (`spotPoints`). Нею користуються схема, редактор і рушій. Телефон місць **не знає** (вони таємні до розкриття), тож перевіряє лише сервер. Телефон надсилає ширину картинки на своєму екрані, і сервер сам додає мінімальні 24 px.
- **Стан (`engine/src/spotdiff.ts`):** необов'язкове `Play.spotdiff?: SpotdiffPlay`. Дошки гравців (команд) зберігають знайдені місця й хто їх знайшов, а лічильники промахів і заморозки ведуться для кожної людини окремо. Сервер приймає лише «тап у (x, y) при ширині w». `GAME_STATE_VERSION` лишається 22.
- **Веб:** телефон показує дві картинки з SVG-накладкою знайдених кіл. На вузькому екрані картинки стоять одна над одною, від 640 px — поруч. Сцена й пульт показують лічильники «x з N» сторінками, як у пазлі. Пульт додатково бачить кола з кількістю знахідок. У редакторі два `useImageUpload` і малювання кіл на другій картинці.

**Tech Stack:** TypeScript, zod 4, vitest, Fastify + Socket.IO, React 19 + Vite + Testing Library, Playwright через vitest (e2e).

**Spec:** `docs/superpowers/specs/2026-11-11-spot-difference-design.md` (обов'язкова). Зразок: `docs/superpowers/plans/2026-11-11-plan-29c-jigsaw.md` і його код (`git log --oneline 1e302e49..5497fe04`). Назви файлів у задачах повторюють зачеплені ним місця.

## Global Constraints

- 7 мов без ru. Нові ключі додаються в uk (`apps/web/src/i18n.ts`) і в `apps/web/src/locales/{en,pl,de,es,it,ar}.json`. Список `ADDED_29D` іде в `apps/web/src/i18n.test.ts` і додається до умови `adds no uk keys beyond the agreed list`, як `ADDED_29C`. Довідка: `help-uk.ts`, `__fixtures__/help-uk-golden.json`, `help-vars.ts`, `locales/*.help.json`. **Нічого про росію**, зокрема в прикладах, фікстурах і e2e-картинках (синтетичні PNG).
- `GAME_STATE_VERSION` не підвищувати, лишається **22**. Додаються лише необов'язкові поля: `Play.spotdiff?`, `BaseView.spotdiff?`, `HostView.spotdiff?`, `PlayerView.me.spotdiff?`, `PublicQuestion.spotdiff?`. У `restore.ts` біля коментаря 29c додати рядок «29d без нової версії: тип spotdiff і необов'язковий Play.spotdiff». Якщо знадобиться обов'язкове поле, **зупинитися й спитати контролера**.
- Юніт-тести: `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' …`. Prettier ніколи не запускати. Типи перевіряє `pnpm typecheck`.
- e2e: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 29d"` на передньому плані, менше ніж за 10 хв, Docker вимкнено.
- Таймер: типово **90 с**, мінімум **25 с** (схема), максимум `LIMITS.maxPuzzleTime` (600). Усі таймери у фікстурах і e2e мають бути ≥ 25 с.
- Відмінностей **від 1 до 10**. Коло: центр `x`, `y` — частки ширини й висоти картинки (0…1); радіус `r` — частка **ширини**.
- Допуск: тап зараховується, якщо відстань від нього до центру ≤ `r + max(0.04, 24 / width)` у ширинах картинки, де `width` — ширина картинки на екрані гравця в CSS-пікселях. Якщо тап зачепив кілька кіл, зараховується найближче (за відстанню до краю кола).
- Промахи: **3 промахи підряд** заморожують людину на **1000 мс**. Тапи під час заморозки ігноруються й не рахуються. Влучання обнуляє лічильник.
- Бали: `found === N ? base : round(base × found / N)`, де `base = round(ціна × multiplier)`. Бонусу за швидкість немає, `streakBonus: 0`, **`basePoints` = масштабовані бали** (урок 9f030b98).
- Тип дозволений **лише** в раундах `classic` і `puzzles`. У будь-якому іншому місці схема дає `spotdiff_place`.
- **Номер запитання в подіях — номер у межах раунду** (`roundQuestionNumber(state)`, те, що телефон бачить у `view.questionIndex`), **не** `state.questionIndex`. Кожна перевірка застарілої події порівнює саме його. e2e грає «Знайди відмінності» **після попереднього раунду**.
- Поле на телефоні має ключ за запитанням: `key={`${view.round?.index ?? 0}:${view.questionIndex}:${spotdiff.changed}`}`. Так інше запитання під тим самим номером починається з нуля (урок 4491f2a3).
- Кириличні літерали в `apps/web/src` допускаються лише в словниках і тестах (`source-scan.test.ts`). Кадри сцени 1600×900, телефон 320 px.

## Рішення плану (там, де специфікація мовчить)

- **Назва.** Тип називається `'spotdiff'` і стоїть у `QUESTION_TYPES` одразу після `'jigsaw'`. До `PUZZLE_TYPES` **не** додається. `PUZZLES_ROUND_TYPES` стає `[...PUZZLE_TYPES, 'jigsaw', 'spotdiff']`.
- **Картинки зберігаються в окремих полях `original` і `changed`, а `imageUrl` мусить бути `null`** (`spotdiff_image`, як `jigsaw_image`): загальний `QuestionImage` не повинен малювати третю картинку. Однакові адреси дають `spotdiff_same`. Відео, аудіо й `reveal` дають `spotdiff_video`, а `hint` дає `spotdiff_hint`.
- **Співвідношення сторін.** Сервер не може виміряти картинку, тож `aspect` (ширина / висота) записує редактор з **першої** картинки, у межах `SPOT_MIN_ASPECT…SPOT_MAX_ASPECT` (0.5…3; фінальна хвиля: вужче, ніж у точки). Другу картинку редактор приймає лише тоді, коли її співвідношення відрізняється не більше ніж на `SPOT_ASPECT_TOLERANCE = 0.02` (`|a₂/a₁ − 1|`). Інакше картинка не зберігається, і редактор показує `spotdiffAspectMismatch`. Якщо замінити першу картинку на іншу з іншим співвідношенням, друга картинка й кола очищаються. Обидві картинки малюються в однакових рамках `aspect` з `object-fit: fill`.
- **Запитання:**
  ```ts
  { ...base, type: 'spotdiff',
    timeLimit: int 25…600,
    original: string /* IMAGE_URL */, changed: string /* IMAGE_URL */,
    aspect: number /* SPOT_MIN_ASPECT…SPOT_MAX_ASPECT (0.5…3) */,
    spots: { x: 0…1; y: 0…1; r: 0.015…0.25 }[] /* 1…10 */ }
  ```
- **Влучання** `spotHit(question, x, y, width, found)`. Відстань рахується в ширинах картинки: `d = hypot(x − s.x, (y − s.y) / aspect)`. Кандидатами є незнайдені кола з `d ≤ s.r + spotSlack(width) + 1e-9`, і з них перемагає найменше `d − s.r`. Якщо кандидатів немає, але тап зачепив уже знайдене коло, результат `'found'`: це не промах, і лічильник не змінюється. Інакше результат `null` (промах). Ширина в події обмежена `60…4000` (`SPOT_MIN_WIDTH`, `SPOT_MAX_WIDTH`), а допуск має стелю `SPOT_MAX_SLACK = 0.08`: `spotSlack(width) = max(0.04, min(24 / width, 0.08))`, тож найбільший допуск — 0.08 ширини. Обман із підробленою шириною нічого більшого не дає.
- **Тапати можна по будь-якій картинці.** Телефон рахує `x`, `y` відносно тієї картинки, по якій тапнули. Координати в обох однакові.
- **Стан** (`game.ts`):
  ```ts
  /** «Знайди відмінності» (29d): дошки поточного запитання; openQuestion спорожнює дошки минулих (запис зберігає answer). */
  export interface SpotdiffPlay { boards: Record<string, SpotdiffBoard>; /** Лише в командах: учасники на відкритті (колір). */ order?: Record<string, string[]> }
  export interface SpotdiffBoard {
    /** Знайдені кола (індекси spots) у порядку знахідок. */ found: number[];
    /** Лише в командах: хто знайшов, паралельно found. */ by?: string[];
    /** Промахи підряд кожної людини (соло — ключ actorId). */ misses: Record<string, number>;
    /** Мить кінця заморозки людини (мс сервера). */ frozenUntil: Record<string, number>;
    /** Мить, коли знайдено останнє (мс від startedAt); null — ще ні. */ doneMs: number | null;
    seq: number;
  }
  // Play.spotdiff?: SpotdiffPlay;
  ```
  Дошка з'являється на першому тапі людини, навіть якщо це промах. Видалення гравця прибирає його дошку (`game.ts` ~1089, поряд з `jigsaw`).
- **Подія** `player:spotdiff` `{ questionIndex, x, y, width }` обробляється функцією `spotdiffTap`. Перевірки йдуть по черзі:
  - `wrong_phase`, `paused`, `not_started`, `not_found` (зокрема учасник не цієї команди);
  - `questionIndex !== roundQuestionNumber(state)` → `spotdiff_stale`;
  - `type_mismatch`, `time_over`;
  - дошка заповнена або запис уже є → `spotdiff_done`;
  - `now < frozenUntil[memberId]` → `spotdiff_frozen` (без зміни стану).

  Далі тап обробляється за результатом `spotHit`:
  - `'found'` → `spotdiff_found` (без зміни стану);
  - влучання → `found.push`, `by`, `misses[memberId] = 0`, `seq + 1`;
  - промах → `misses[memberId] + 1`; коли лічильник доходить до 3, він обнуляється, а `frozenUntil[memberId] = now + SPOTDIFF_FREEZE_MS`.

  Останнє коло ставить `doneMs = now − startedAt`, пише запис і викликає `autoLock`.
- **Ack без нових полів.** `AckResult` не змінюється. Рушій повертає `SpotTap = { ok: true; state; outcome: 'hit' | 'miss' | 'freeze' } | { ok: false; error }`. Менеджер **записує стан і за промаху теж**, а відповідає так: `hit` → `{ ok: true }`, `miss` → `{ ok: false, error: 'spotdiff_miss' }`, `freeze` → `{ ok: false, error: 'spotdiff_freeze' }`. Телефон показує заморозку 1 с від ack і так само реагує на `spotdiff_frozen`. Сервер про заморозку зрізом не повідомляє.
- **Частота:** `SPOTDIFF_TAPS_PER_SECOND = 6` на людину, вікно `spotdiffRate`; понад ліміт приходить `too_soon`. Влучання й завершення розсилаються одразу (`commit` без прапорця, бо їх щонайбільше 10 на дошку). Промахи йдуть через `commit(room, state, now, true)`: зріз від них не змінюється, але стан має пережити рестарт.
- **Оцінка** (`spotdiffRecord`):
  - `points = spotPoints(base, found, N)`;
  - `grade` — `correct`, якщо знайдено все; `partial`, якщо знайдено хоч одне; інакше `wrong`;
  - `accuracy = found / N`;
  - `timeMs` = `doneMs`, якщо знайдено все, інакше ліміт;
  - `basePoints: points`, `streakBonus: 0`.

  На закритті `scoreSpotdiff` іде в ланцюжок `lockNow` і `stop` поряд з `scoreJigsaw`. Дошки без запису (тобто люди, що хоч раз тапнули) отримують запис. Хто не тапнув ні разу, запису не має. Записи пишуться лише в мить завершення або на закритті, тому `autoLock` закриває запитання, «коли всі знайшли все».
- `SpotdiffAnswer` (`answer.ts`, лише рушій; `answerSchema` його не приймає): `{ type: 'spotdiff'; found: number; total: number; done: boolean; timeMs: number | null }`.
- **Бафи й дебафи вимкнено**, як у пазлі (специфікація мовчить, а підказка видала б місце). `questionOff` повертає `'off_spotdiff'`. `jigsawOpen` у `debuffs.ts` узагальнюється до `noDebuffQuestion(state)` для `jigsaw` і `spotdiff`. Ведучий оцінку не змінює: тип іде в `UNGRADABLE`. `answerer.ts` має `freeForAll` і «наступне без відповідача», а `team-act.ts` призначає `'answer'` команді, як у пазлі.
- **Зрізи:**
  - `PublicQuestion.spotdiff?: PublicSpotdiff = { original, changed, aspect, total, spots: SpotCircle[] | null }`. `spots` присутні **лише на `reveal`**, бо «після часу» тут означає розкриття, як в інших типах.
  - `BaseView.spotdiff?: SpotdiffInfo = { boards: SpotdiffBoardView[] }`, де `SpotdiffBoardView = { playerId, nickname, found: number /* лише кількість */, total, done, timeMs, points: number | null /* лише на reveal */ }`. **Місць у базовому зрізі немає.** До `reveal` дошки йдуть у порядку гравців. На `reveal` спершу йдуть ті, хто знайшов усе (за `timeMs`), далі решта за `found` спадно, а за рівності — у порядку гравців. Дошки є для всіх гравців (команд), навіть порожні.
  - `HostView.spotdiff?: SpotdiffHostInfo = { boards: (SpotdiffBoardView & { spots: number[] })[]; spots: SpotCircle[] }`. Пульт бачить місця завжди.
  - `PlayerView.me.spotdiff?: PlayerSpotdiff = { found: { index: number; x: number; y: number; r: number; tone: string | null }[]; total; done; canTap: boolean; seq; timeMs: number | null; result: { points: number } | null }`. Це лише власні (командні) знахідки; `tone` — `'1'…'9'` у командах за `order`.
  - `LiveProgress` — `{ kind: 'spotdiff'; found: number; total: number; done: boolean }`.
- **Сцена:** зверху дві картинки поруч без кіл (глядачі теж шукають). Під ними сітка карток «нік · x з N» (✓ і час у тих, хто знайшов усе), сторінки за `puzzleGrid`/`puzzlePageSize`/`usePage`. На розкритті на обох картинках показуються всі кола, а поруч таблиця «місце · нік · знайдено · бали» з тим самим зменшенням шрифту, що в `JigsawResults` (урок a129ef46).
- **Пульт** бачить те саме, що й сцена. Додатково на другій картинці є всі кола з номером і лічильником «знайшли k», а в рядку дошки — номери знайдених кіл.
- **Редактор:** два поля завантаження (`useImageUpload`, R2/диск без змін), підписані «Оригінал» і «Зі змінами». `measure` переноситься з `PinEditor.tsx` у `ImageField.tsx` як `export function measureAspect(url): Promise<number | null>`, і `PinEditor` імпортує його звідти. Дотик до порожнього місця другої картинки ставить коло з `SPOT_DEFAULT_R = 0.06`, а якщо в тому ж жесті тягнути, радіус дорівнює відстані від точки дотику. Дотик усередині кола й перетягування змінюють радіус (відстань від центру), а короткий тап виділяє коло. Кнопка «Прибрати» видаляє виділене коло. Одинадцяте коло не ставиться, замість нього показується `spotdiffMax`. Кола дзеркально показуються й на першій картинці. Номер кола — його індекс + 1.
- **Нове запитання** має `original: ''`, `changed: ''`, `aspect: 4/3`, `spots: []`, `imageUrl: null`, 90 с, 300 балів. Помилки чернетки: `problemSpotdiffImages` (немає картинки), `problemSpotdiffSpots` (0 кіл), `problemSpotdiffSame`, `problemSpotdiffPlace`.

## Порядок збирання

- Задача 2 додає `spotdiff` у `Question`/`Answer`, і вичерпні `switch` у `apps/web` ламаються. Тому в задачах 2–5 перевіряються лише `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`, а з задачі 6 — `pnpm typecheck`.
- Залежності: 2 ← 1; 3 ← 2; 4 ← 3; 5 ← 3, 4; 6 ← 1, 2; 7 ← 4, 6; 8 ← 4, 7; 9 — остання.

## Review Focus

1. **Запитання після попереднього раунду.** Тап із номером у межах раунду приймається, а з `state.questionIndex` (коли вони різні) дає `spotdiff_stale`. Тести: задача 3 `taps after an earlier round by the round-local number`; задача 5 `taps through the socket after a classic round`; задача 9 — сценарій після класики.
2. **Тап трохи мимо на маленькому телефоні.** На ширині 300 px допуск 0.08 ширини (24 px), на 1000 px — 0.04. Тап за межею допуску вже промах, а ширина менша за 60 відкидається схемою; допуск не більший за 0.08 ширини. Тести: задача 1 `the slack grows to 24 px on a small picture`, задача 2 `the spotdiff event is limited`.
3. **Місця не витікають до розкриття.** Ні базовий зріз (сцена, телефони), ні `PublicQuestion` не містять координат кіл до `reveal`. Телефон бачить лише власні (командні) знахідки, а суперник — лише кількість. Тест: задача 4 `spots stay secret until reveal`.
4. **Тап по вже знайденому й заморозка в команді.** Тап по колу, яке знайшов товариш, не рахується промахом. Заморозка одного учасника не морозить товариша. Тапи під час заморозки не змінюють стан, а влучання обнуляє лічильник. Тести: задача 3 `three misses freeze for a second` і `teams share one board, freezes are personal`.
5. **Тип не в тому раунді чи з поганими картинками.** Бліц, фінал, поле, ставки, аукціон, вибування, виживання, мільйонер, запасні й дуель дають помилку; класика й «Головоломки» проходять. Однакові картинки, `imageUrl` не null, 0 або 11 кіл — помилки. Тест: задача 2 `a spotdiff plays only in classic and puzzles rounds` і `refuses a broken spotdiff`.

---

### Задача 1. Спільне: влучання, допуск, бали

**Files:**
- Create: `packages/shared/src/spotdiff.ts`, `packages/shared/src/spotdiff.test.ts`
- Modify: `packages/shared/src/index.ts` — `export * from './spotdiff'`.

**Interfaces (Produces):**
```ts
export const SPOT_SLACK = 0.04;          // частка ширини
export const SPOT_MIN_PX = 24;           // CSS px на екрані гравця
export const SPOT_MAX_SLACK = 0.08;          // стеля допуску (фінальна хвиля)
export const SPOT_MIN_WIDTH = 60;
export const SPOT_MAX_WIDTH = 4000;
export const SPOT_MIN_R = 0.015;
export const SPOT_MAX_R = 0.25;
export const SPOT_DEFAULT_R = 0.06;
export const SPOT_MIN_COUNT = 1;
export const SPOT_MAX_COUNT = 10;
export const SPOT_ASPECT_TOLERANCE = 0.02;
export const SPOT_MIN_ASPECT = 0.5;
export const SPOT_MAX_ASPECT = 3;
export interface SpotCircle { x: number; y: number; r: number }
export function spotSlack(width: number): number;                       // max(SPOT_SLACK, min(SPOT_MIN_PX / width, SPOT_MAX_SLACK))
export function spotHit(question: { aspect: number; spots: readonly SpotCircle[] }, x: number, y: number, width: number, found: ReadonlySet<number>): number | 'found' | null;
export function spotPoints(base: number, found: number, total: number): number;
export function aspectsMatch(a: number, b: number): boolean;             // |b/a − 1| ≤ SPOT_ASPECT_TOLERANCE
```
`LIMITS` тут не імпортувати (`quiz.ts` імпортує цей файл).

- [ ] **Step 1: Write the failing tests** (`spotdiff.test.ts`), для `aspect: 2` і кола `{ x: 0.5, y: 0.5, r: 0.05 }`:
  - `hits inside the circle plus four percent` — ширина 1000: `(0.59, 0.5)` → 0; `(0.591, 0.5)` → null; `(0.5, 0.68)` → 0 (вертикаль ділиться на aspect); `(0.5, 0.682)` → null.
  - `the slack grows to 24 px on a small picture` — `spotSlack(1000) === 0.04`, `spotSlack(300) === 0.08`, `spotSlack(200) === 0.08` (стеля); ширина 300: `(0.63, 0.5)` → 0, `(0.632, 0.5)` → null.
  - `the nearest circle wins` — кола A `{0.3,0.5,0.05}`, B `{0.42,0.5,0.05}`, ширина 1000, тап `(0.37, 0.5)` → 1; з `found {1}` → 0; з `found {0,1}` → `'found'`; тап `(0.9, 0.9)` з `found {0,1}` → null.
  - `bad taps miss` — `NaN`, `x: 1.2` → null.
  - `points split by the count, all found is the full price` — `spotPoints(300, 2, 7) === 86`, `spotPoints(300, 7, 7) === 300`, `spotPoints(100, 1, 3) === 33`, `spotPoints(100, 2, 3) === 67`, `spotPoints(300, 0, 5) === 0`.
  - `aspects match within two percent` — `aspectsMatch(1.5, 1.52)` true, `aspectsMatch(1.5, 1.54)` false.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/shared/src/spotdiff.test.ts`. Expected: FAIL (модуля немає).
- [ ] **Step 3: Implement** за «Рішеннями плану» (`spotHit`: найменше `d − r` серед незнайдених кандидатів, епсилон `1e-9`).
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/shared && tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 29d spot-the-difference geometry — a hit within the circle plus 4 % or 24 px, the nearest circle wins, points split by the count"
```

---

### Задача 2. Спільне: запитання, місця, ліміти, відповідь, подія, помилки, зрізи

**Files:**
- Modify:
  - `packages/shared/src/quiz.ts`:
    - `LIMITS`: `minSpotdiffTime: 25`, `defaultSpotdiffTime: 90`, `defaultSpotdiffPoints: 300`;
    - `QUESTION_TYPES`: `'spotdiff'` після `'jigsaw'`;
    - гілка `questionSchema`;
    - `superRefine` запитання: `spotdiff_image`, `spotdiff_video`, `spotdiff_hint`, `spotdiff_same`;
    - `PUZZLES_ROUND_TYPES` + `'spotdiff'`;
    - блок `spotdiff_place` у `quizSchema.superRefine` поряд із `jigsawPlace` (той самий вираз, тип `'spotdiff'`).
  - `packages/shared/src/answer.ts` — `SpotdiffAnswer` в `Answer`.
  - `packages/shared/src/events.ts` — `spotdiffTapSchema`, `SPOTDIFF_TAPS_PER_SECOND = 6`, `SPOTDIFF_MISSES = 3`, `SPOTDIFF_FREEZE_MS = 1000`, `'player:spotdiff'` у `ClientToServerEvents`.
  - `packages/shared/src/game.ts`:
    - `ErrorCode`: `'spotdiff_stale' | 'spotdiff_done' | 'spotdiff_found' | 'spotdiff_miss' | 'spotdiff_freeze' | 'spotdiff_frozen'`;
    - `BuffWhy`: `'off_spotdiff'`.
  - `packages/shared/src/views.ts`:
    - типи `PublicSpotdiff`, `SpotdiffBoardView`, `SpotdiffInfo`, `SpotdiffHostInfo`, `PlayerSpotdiff`;
    - поля `PublicQuestion.spotdiff?`, `BaseView.spotdiff?`, `HostView.spotdiff?`, `PlayerView.me.spotdiff?`;
    - `LiveProgress` `{ kind: 'spotdiff' … }`.
  - `packages/shared/src/facts.ts` — `spotdiff` без вікна відповіді (у ті самі два місця, що й `jigsaw`).
  - `packages/shared/src/round-brief.ts` — лічильник `spotdiff` у брифі `puzzles`.
  - `packages/shared/src/drafts.ts` — `spotdiff` не є типом чернетки.
- Test: `packages/shared/src/quiz.test.ts`, `packages/shared/src/facts.test.ts`

**Interfaces (Produces):**
```ts
// quiz.ts
z.object({ ...base, type: z.literal('spotdiff'),
  timeLimit: z.number().int().min(LIMITS.minSpotdiffTime).max(LIMITS.maxPuzzleTime),
  original: z.string().regex(IMAGE_URL), changed: z.string().regex(IMAGE_URL),
  aspect: z.number().finite().min(SPOT_MIN_ASPECT).max(SPOT_MAX_ASPECT),
  spots: z.array(z.object({ x: share01, y: share01, r: z.number().finite().min(SPOT_MIN_R).max(SPOT_MAX_R) })).min(SPOT_MIN_COUNT).max(SPOT_MAX_COUNT) })
// events.ts — questionIndex: номер у раунді, без верхньої межі
export const spotdiffTapSchema = z.object({ questionIndex: z.number().int().nonnegative(), x: share01, y: share01,
  width: z.number().finite().min(SPOT_MIN_WIDTH).max(SPOT_MAX_WIDTH) }).strict();
'player:spotdiff': (payload: z.infer<typeof spotdiffTapSchema>, ack: Ack) => void;
// answer.ts
export interface SpotdiffAnswer { type: 'spotdiff'; found: number; total: number; done: boolean; timeMs: number | null }
// views.ts — форми з «Рішень плану»
```

- [ ] **Step 1: Write the failing tests** (`quiz.test.ts`). Помічник `spotQ(patch)`: `original: '/uploads/' + 'a'.repeat(32) + '.jpg'`, `changed` з `'b'`, `aspect: 4/3`, 3 кола, 90 с, 300 балів, `imageUrl: null`.
  - `accepts a spotdiff` — парситься; 1 і 10 кіл теж проходять.
  - `refuses a broken spotdiff`:
    - `imageUrl` не null → `spotdiff_image`;
    - відео, аудіо чи `reveal` → `spotdiff_video`;
    - `hint` → `spotdiff_hint`;
    - `changed === original` → `spotdiff_same`;
    - 0 чи 11 кіл, `r: 0.3`, `r: 0.01`, `x: 1.1`, `timeLimit: 24`, `original: 'https://x/y.jpg'` → помилка парсингу;
    - `timeLimit: 25` → ок.
  - `a spotdiff plays only in classic and puzzles rounds`:
    - у `classic` і в `puzzles` (разом із судоку й пазлом) → ок;
    - у `blitz`, `final`, на клітинці `board`, у `bets`, `auction`, `wipeout`, `survival` (і в trial) та `ladder` → `spotdiff_place`;
    - запасне запитання цього типу → `spare_type`;
    - дуель його не приймає.
  - `the spotdiff event is limited`:
    - `width: 199`, `width: 4001`, `x: -0.1`, зайве поле → false;
    - `questionIndex: 7, x: 0.5, y: 0.5, width: 320` → true;
    - `answerSchema` не приймає `{ type: 'spotdiff', … }`.
  - `QUESTION_TYPES_MATCH_SCHEMA` компілюється; `old quizzes still parse` лишається без змін.
  - `facts.test.ts`: `a spotdiff has no answer window`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/shared`. Expected: FAIL.
- [ ] **Step 3: Implement** за Interfaces.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/shared && tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 29d spotdiff question — two pictures and 1–10 circles, only in classic and puzzles rounds, a tap event with the on-screen width, views without spots before reveal"
```

---

### Задача 3. Рушій: тап, промахи й заморозка, оцінка, команди, закриття

**Files:**
- Create: `packages/engine/src/spotdiff.ts`, `packages/engine/src/game.spotdiff.test.ts`
- Modify:
  - `packages/engine/src/game.ts`:
    - `SpotdiffPlay`, `SpotdiffBoard`, `Play.spotdiff?`;
    - `openQuestion` (~1405): для `spotdiff` той самий вираз `{ boards: {}, order? }`, що в `jigsaw`; `plays` через `packSpotdiffs`;
    - видалення гравця (~1089) прибирає його дошку;
    - `lockNow` і `stop` — `scoreSpotdiff` поряд зі `scoreJigsaw`;
    - `submitAnswer` (~1938) — `type_mismatch`; перелік ~2580 — `spotdiff`.
  - `packages/engine/src/team-act.ts`, `packages/engine/src/answerer.ts` — `spotdiff` поряд із `jigsaw`.
  - `packages/engine/src/buffs.ts` — `questionOff` → `'off_spotdiff'`.
  - `packages/engine/src/debuffs.ts` — `jigsawOpen` перейменувати на `noDebuffQuestion` і розширити на `spotdiff`; `answerersOf` без дебафів для `spotdiff`.
  - `packages/engine/src/live.ts` — `PROGRESS_TYPES`, `UNGRADABLE`, прогрес `spotdiff`.
  - `packages/engine/src/restore.ts` — лише коментар; `packages/engine/src/index.ts` — `export * from './spotdiff'`.
  - `packages/engine/src/testing/fixtures.ts` — `spotdiffQuiz()`:
    - раунд `classic` з одним `single` на 30 с;
    - раунд `classic` зі spotdiff: 3 кола `{0.2,0.3,0.05}`, `{0.6,0.5,0.06}`, `{0.85,0.8,0.05}`, `aspect 4/3`, 90 с, 300 балів;
    - раунд `puzzles` із судоку й spotdiff на 2 кола (60 с).
  - `packages/engine/src/testing/autopilot.ts` — бот тапає центри кіл з `width: 400` і номером `roundQuestionNumber`.
- Test: `game.spotdiff.test.ts`, `restore.test.ts`, `autopilot.full.test.ts`, `game.buffs.test.ts`

**Interfaces:**
- Consumes: `spotHit`, `spotPoints`, `SPOTDIFF_MISSES`, `SPOTDIFF_FREEZE_MS`, `SpotdiffAnswer`, `roundQuestionNumber`, `withPlay`, `autoLock`, `recordOf`, `timeOverFor`, `limitMsOf`, `notStarted`, `teamsOn`, `memberOf`.
- Produces:
```ts
export type SpotdiffQuestion = Extract<Question, { type: 'spotdiff' }>;
export type SpotTap = { ok: true; state: GameState; outcome: 'hit' | 'miss' | 'freeze' } | { ok: false; error: ErrorCode };
export function spotdiffOf(state: GameState, actorId: string): SpotdiffBoard | null;
export function spotdiffTap(state: GameState, actorId: string, memberId: string, questionIndex: number, tap: { x: number; y: number; width: number }, now: number): SpotTap;
export function scoreSpotdiff(state: GameState): GameState;
export function packSpotdiffs(plays: Play[]): Play[];
```

- [ ] **Step 1: Write the failing tests** (`game.spotdiff.test.ts`). Гравці: Оля, Тарас, Петро. Береться `spotdiffQuiz()`, а помічник `toSpotdiff(state)` проходить перший раунд і відкриває spotdiff, тож `roundQuestionNumber = 0`, а `state.questionIndex = 1`. Тапи за замовчуванням з `width: 400`.
  - `taps after an earlier round by the round-local number`:
    - тап `(0.6, 0.5)` з `questionIndex: 0` → `outcome 'hit'`, `found [1]`;
    - з `questionIndex: 1` → `spotdiff_stale`.
  - `a near tap counts` — `(0.6 + 0.06 + 0.059, 0.5)` → hit; `(0.6 + 0.06 + 0.061, 0.5)` → miss (допуск 0.06 на 400 px).
  - `three misses freeze for a second`:
    - Петро: промах, промах → `misses 2`;
    - влучання → `misses 0`;
    - три промахи → третій має `outcome 'freeze'`, `frozenUntil = t + 1000`, `misses 0`;
    - тап у `t + 999` по колу → `spotdiff_frozen`, і стан не змінився (`toBe`);
    - у `t + 1000` тап проходить.
  - `a found circle is not a miss` — повторний тап по знайденому колу → `spotdiff_found`, `misses` без змін.
  - `refuses paused, late and stale taps` — пауза → `paused`; після `timeLimit` → `time_over`; заставка → `not_started`; `locked` → `wrong_phase`.
  - `all found gives the full price and closes for that player`:
    - Оля знаходить 3 з 3 за 40 с → запис `correct`, 300, `basePoints 300`, `streakBonus 0`, `answer { found: 3, total: 3, done: true, timeMs: 40000 }`;
    - далі тап → `spotdiff_done`.
  - `partial finds score by share at close`:
    - Тарас 2 з 3 → на закритті `partial`, 200, `basePoints 200`, `accuracy 2/3`, `timeMs` = ліміт;
    - Петро лише промахувався → `wrong`, 0;
    - гравець без тапів — без запису.
  - `a streak rule does not reset scaled points` — правило серії в раунді: у Тараса `points` і `basePoints` 200 (урок 9f030b98).
  - `everyone found all closes the question` — усі троє знайшли все → `phase: 'locked'`.
  - `the puzzles round has no multiplier and no buffs` — у `puzzles` 2 з 2 дають повну ціну; баф → `off_puzzles`; у класиці баф → `off_spotdiff`; дебаф на spotdiff не ставиться.
  - `teams share one board, freezes are personal`. Команди: «Соняшники» (Оля, Тарас) і «Маки» (Петро, Ганна).
    - Оля знаходить коло 0 → дошка команди `found [0]`, `by [Оля]`;
    - Тарас тапає коло 0 → `spotdiff_found`;
    - три промахи Олі морозять лише Олю: Тарас одразу знаходить коло 1;
    - «Маки» мають свою дошку;
    - у раунді з відповідачем `captain` тапати може й не капітан.
  - `the grade is not changed by the host` — `override` дає відмову, як на `jigsaw`.
  - `restore.test.ts`: `a restored room keeps the spotdiff boards` — знімок із `Play.spotdiff` читається з тими самими `found`/`misses`; старий знімок без поля теж читається; `GAME_STATE_VERSION === 22`.
  - `autopilot.full.test.ts`: `spotdiffQuiz()` грається ботами до кінця, усі spotdiff мають `correct`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/engine/src/game.spotdiff.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» і зразком `packages/engine/src/jigsaw.ts`: `spotdiffRefusal` відповідає `jigsawRefusal` (з `roundQuestionNumber`), `spotdiffRecord` — `jigsawRecord`, а `scoreSpotdiff`/`packSpotdiffs` — `scoreJigsaw`/`packJigsaws`. Порожня дошка: `{ found: [], ...(teamsOn ? { by: [] } : {}), misses: {}, frozenUntil: {}, doneMs: null, seq: 0 }`.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/engine && tsc -p packages/shared && tsc -p packages/engine`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/engine
git commit -m "feat(engine): 29d spotdiff — server-checked taps with tolerance, a one-second freeze after three misses, a share of the price per find, one board per team with personal freezes"
```

---

### Задача 4. Рушій: зрізи

**Files:**
- Modify: `packages/engine/src/views.ts`:
  - `publicQuestion`: `spotdiff: publicSpotdiff(question, phase)`, де `spots` лише на `reveal`;
  - `spotdiffInfo(state, reveal)` → `optional('spotdiff', …)` у базовому зрізі;
  - `spotdiffHostInfo(state, reveal)` → `hostView`;
  - `playerSpotdiff(state, actorId, now)` → `me.spotdiff`, зокрема в командній гілці `playerView`;
  - `answer.type === 'spotdiff'` → `revealed ? answer : null`;
  - `gradable` без `spotdiff`.
- Test: Create `packages/engine/src/views.spotdiff.test.ts`

**Interfaces:**
- Consumes: `spotdiffOf`, `SpotdiffPlay`.
- Produces: `PublicSpotdiff`, `SpotdiffInfo`, `SpotdiffHostInfo`, `PlayerSpotdiff` у зрізах (форми — задача 2).

- [ ] **Step 1: Write the failing tests:**
  - `spots stay secret until reveal`:
    - на `question` і `locked`: `publicQuestion.spotdiff.spots === null`;
    - `JSON.stringify` зрізу сцени й телефону Тараса (який нічого не знайшов) не містить `0.85`;
    - на `reveal` `spots` мають 3 кола;
    - `imageUrl: null`.
  - `the stage sees counts only` — Оля 2, Тарас 0 → `boards` для всіх трьох у порядку гравців, `found` 2 і 0, `total 3`, `points: null`; у `SpotdiffBoardView` немає `spots`.
  - `the host sees the places` — `hostView.spotdiff.spots` має 3 кола, у дошці Олі `spots: [1, 0]`.
  - `a phone sees its own finds with tones` — `me.spotdiff.found` містить `{ index, x, y, r }` знайденого. У командах товариш бачить знахідку Олі з `tone '1'`, а суперник її не бачить.
  - `reveal ranks by finds` — на `reveal` спершу ті, хто знайшов усе (за `timeMs`), далі за `found` спадно; `points` заповнені; `me.spotdiff.result.points`.
  - `can tap only while open` — `canTap` false на паузі, після «знайшов усе» й на `locked`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/engine/src/views.spotdiff.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за зразком `jigsawInfo`/`playerJigsaw` у тому ж файлі.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/engine && tsc -p packages/engine`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/engine
git commit -m "feat(engine): 29d spotdiff views — counts for the stage, places for the host, own finds with teammate tones on phones, all circles on reveal"
```

---

### Задача 5. Сервер: подія, частота, розсилка, історія, seed-тести

**Files:**
- Modify:
  - `apps/server/src/rooms/manager.ts`:
    - `spotdiffTap(room, playerId, payload): AckResult` — `this.act(room, playerId, 'answer')`, далі `windowAllowed(room.spotdiffRate, playerId, now, SPOTDIFF_TAPS_PER_SECOND)`, потім `spotdiffTap` рушія;
    - поле `spotdiffRate` у `Room` і обох місцях створення (поряд із `jigsawRate`), очищення при виході;
    - коміт: `hit` або завершення — `commit(room, state, now)`; `miss`/`freeze` — `commit(room, state, now, true)`;
    - ack: `hit` → `{ ok: true }`, `miss` → `spotdiff_miss`, `freeze` → `spotdiff_freeze`;
    - `answerStamp` — `spotdiffOf`.
  - `apps/server/src/socket.ts` — `on('player:spotdiff')` за зразком `player:jigsaw`.
  - `apps/server/src/history.ts` — рядок `SpotdiffAnswer` («found/total»); вичерпні `switch` у `achievement-games.ts` і `game-achievements.ts`.
  - `apps/server/scripts/{compass,evening,family,family2,fun,grand,halloween,horizon,world}-quiz.test.ts`: у фільтр типів додати `&& t !== 'spotdiff'` з коментарем `29d: новий тип, демо без відмінностей`. Списки `mix2-quiz.test.ts` і `showcase-quiz.test.ts` перелічують типи явно, їх не чіпати. Перевірити `grep -n "'jigsaw'" apps/server/scripts/*.test.ts`.
- Test: Create `apps/server/src/rooms/manager.spotdiff.test.ts`; `apps/server/src/socket.test.ts`, `apps/server/src/history.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - `taps through the socket after a classic round` — `spotdiffQuiz()`, після першого раунду надіслати `player:spotdiff` з `questionIndex: view.questionIndex` (0) по колу → `{ ok: true }`, сцена отримує `found: 1`; з `state.questionIndex` (1) → `spotdiff_stale`.
  - `a miss answers spotdiff_miss and is kept` — промах → `{ ok: false, error: 'spotdiff_miss' }`; третій поспіль → `spotdiff_freeze`; одразу ще один → `spotdiff_frozen`; `room.state` має `misses`/`frozenUntil`.
  - `spotdiff taps are rate limited` — 7 тапів за секунду: сьомий дає `too_soon`.
  - `a hit goes out at once` — після влучання зріз сцени приходить без очікування вікна `puzzleGapMs`.
  - `a restored room keeps the finds` — після `restart` менеджера `found` ті самі, і перепідключений телефон бачить їх у `me.spotdiff`.
  - `history shows found of total` — рядок «2 з 3» з балами.
  - Seed-тести: `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/server/scripts` зелені.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/server/src/rooms/manager.spotdiff.test.ts apps/server/src/socket.test.ts apps/server/src/history.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за зразком `RoomManager.jigsawPlace`/`jigsawApply`.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/server && tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server
git commit -m "feat(server): 29d spotdiff — a tap event with the round-local number, misses kept and answered, a rate window, hits pushed at once, history rows; seed demos skip the new type"
```

---

### Задача 6. Веб: редактор, чернетки, тексти, довідка

**Files:**
- Create: `apps/web/src/editor/SpotdiffEditor.tsx`, `apps/web/src/editor/SpotdiffEditor.test.tsx`, `apps/web/src/live/spot-geometry.ts` (`shareOf`, з тестом `apps/web/src/live/spot-geometry.test.ts`: `shareOf({left:10,top:20,width:200,height:100}, 110, 70)` → `{ x: 0.5, y: 0.5 }`, а точки за межами затискаються в 0…1)
- Modify:
  - `apps/web/src/editor/ImageField.tsx` — `export function measureAspect(url: string): Promise<number | null>`, перенесена з `PinEditor.tsx`. `PinEditor.tsx` імпортує її, і його тести лишаються зеленими.
  - `apps/web/src/editor/draft.ts`:
    - `questionTypesFor`: `classic` має `spotdiff`, `puzzles` бере `PUZZLES_ROUND_TYPES`, решта раундів без `spotdiff`;
    - `newQuestion('spotdiff')` за «Рішеннями плану»;
    - `problemKey`: `problemSpotdiffImages`, `problemSpotdiffSpots`, `problemSpotdiffSame`, `problemSpotdiffPlace`.
  - `apps/web/src/editor/draft-storage.ts` — `reviveSpotdiff`, за зразком `reviveJigsaw`:
    - адреси — рядки (інакше `''`);
    - `aspect` у межах (інакше 4/3);
    - кола: лише валідні, затиснені в межі, не більше 10;
    - без `hint`/`audio`/`reveal`, `imageUrl: null`.
  - `apps/web/src/editor/QuestionEditor.tsx` — `case 'spotdiff'` без загального `ImageField`, відео, аудіо, підказки й «перевертання». Поле балів починається з нуля при зміні типу (урок 919b84e2 вже в коді; перевірити тестом).
  - `apps/web/src/format.ts`, `apps/web/src/admin/admin-text.ts`, `apps/web/src/guide-text.ts`, `apps/web/src/round-summary.ts` — гілки `spotdiff` (зведення раунду: `summarySpotdiffs_one/_few/_many`).
  - `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts` (`ADDED_29D`, `ADDED_29D_PLURALS`), `apps/web/src/locales/*.json`, `apps/web/src/help/help-uk.ts`, `help-vars.ts`, `__fixtures__/help-uk-golden.json`, `apps/web/src/locales/*.help.json`. Ключі:
    - назви й тексти типу: `type_spotdiff`, `typeShort_spotdiff`, `typeHow_spotdiff`, `buffWhy_off_spotdiff`;
    - помилки: `err_spotdiff_*` (6);
    - проблеми чернетки: `problemSpotdiff*` (4);
    - редактор: `spotdiffOriginal`, `spotdiffChanged`, `spotdiffMarkHint`, `spotdiffRemove`, `spotdiffMax`, `spotdiffAspectMismatch`, `spotdiffCount`;
    - телефон, сцена й таблиця (задачі 7–8 беруть їх звідси): `spotdiffFound` («Знайдено {found} з {total}»), `spotdiffFrozen`, `spotdiffAllFound`, `spotdiffTimeUp`, `spotdiffClosed`, `spotdiffOffline`, `spotdiffTableFound`, `spotdiffTableLabel`, `spotdiffSpotFoundBy`.
- Test: `apps/web/src/editor/draft.test.ts`, `apps/web/src/editor/draft-storage` (наявний тест), `apps/web/src/editor/PinEditor.test.tsx`, `apps/web/src/i18n.test.ts`, `apps/web/src/help/*.test.ts`

**Interfaces (Produces):**
```ts
export function measureAspect(url: string): Promise<number | null>;   // ImageField.tsx
export function SpotdiffEditor(props: { question: SpotdiffQuestion; onChange: (q: Question) => void }): JSX.Element;
/** Координати дотику в частках картинки; спільна з телефоном (задача 7). */
export function shareOf(rect: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number): { x: number; y: number };  // apps/web/src/live/spot-geometry.ts
```

- [ ] **Step 1: Write the failing tests:**
  - `draft.test.ts`:
    - `a spotdiff lives in classic and puzzles only` — `classic` і `puzzles` містять тип, `blitz`/`final`/`board`/`bets` — ні;
    - `a new spotdiff waits for pictures and circles` → `problemSpotdiffImages`, після адрес → `problemSpotdiffSpots`;
    - `same pictures are a problem` → `problemSpotdiffSame`.
  - `draft-storage`: `a stored spotdiff is revived within limits` — 12 кіл дають 10; `r: 5` затискається до 0.25; `hint` зникає.
  - `SpotdiffEditor.test.tsx` (`measureAspect` замокано):
    - `a tap on the changed picture adds a circle` — тап у точці (0.5, 0.5) рамки → `spots [{ x: 0.5, y: 0.5, r: 0.06 }]`;
    - `dragging resizes the circle` — дотик на колі й рух на 0.1 ширини від центру → `r ≈ 0.1`; рух далі за 0.25 → `r` = 0.25;
    - `an eleventh circle is refused` — видно `spotdiffMax`;
    - `remove deletes the selected circle`;
    - `a changed picture with another aspect is refused` — 1.5 і 1.6 → `changed` лишається `''`, видно `spotdiffAspectMismatch`;
    - `the timer floor is 25`.
  - `i18n.test.ts` — `ADDED_29D` є в усіх 7 мовах; нова сторінка довідки є в усіх `*.help.json`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web/src/editor apps/web/src/i18n.test.ts apps/web/src/help`. Expected: FAIL.
- [ ] **Step 3: Implement.** Кола — SVG-накладка поверх `<img>` з `viewBox` у частках. Жести — pointer events, як рамка обрізання в `JigsawEditor.tsx`. Приклади в довідці нейтральні (природа, Україна).
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 29d spotdiff editor — two uploads with a matching aspect, circles placed by a tap and sized by a drag, up to ten, texts in seven languages"
```

---

### Задача 7. Веб: телефон — дві картинки, тапи, промахи, заморозка

**Files:**
- Create: `apps/web/src/live/useSpotdiff.ts`, `apps/web/src/live/useSpotdiff.test.ts`, `apps/web/src/screens/SpotdiffView.tsx`, `apps/web/src/screens/SpotdiffView.test.tsx`
- Modify: `apps/web/src/screens/PlayerScreen.tsx` — гілка `me.spotdiff !== undefined` поряд із `JigsawPlay` (з ключем із Global Constraints), а на розкритті `SpotdiffReveal`; `apps/web/src/styles.css`.

**Interfaces:**
- Consumes: `shareOf` (задача 6), `SPOT_MIN_WIDTH`, `SPOT_MAX_WIDTH`, `SPOTDIFF_FREEZE_MS`, `PlayerSpotdiff`, `PublicSpotdiff`, `Send`.
- Produces:
```ts
export function useSpotdiff(info: PlayerSpotdiff, questionIndex: number /* view.questionIndex */, send: Send): {
  found: PlayerSpotdiff['found'];
  frozen: boolean;                                  // SPOTDIFF_FREEZE_MS від ack spotdiff_freeze/spotdiff_frozen
  misses: { id: number; x: number; y: number }[];   // хрестики промахів, кожен живе 600 мс
  tap(x: number, y: number, width: number): void;   // width затиснено в SPOT_MIN_WIDTH…SPOT_MAX_WIDTH
};
export function SpotdiffPlay(props: { info: PlayerSpotdiff; question: PublicQuestion; questionIndex: number; paused: boolean; timeUp: boolean; send: Send; closed?: boolean }): JSX.Element;
export function SpotdiffPictures(props: { spotdiff: PublicSpotdiff; circles: { x: number; y: number; r: number; tone: string | null; label?: string }[]; onTap?: (x: number, y: number, width: number) => void; frozen?: boolean; misses?: { id: number; x: number; y: number }[] }): JSX.Element;  // і сцена, і пульт
```

**Телефон:**
- Розкладка: дві рамки `aspect` (`object-fit: fill`). Нижче 640 px вони стоять одна над одною, кожна з `max-height: 38dvh`; від 640 px — поруч. Над рамками рядок «Знайдено x з N».
- Тап: `pointerup` без руху понад 8 px дає `shareOf(rect, …)` і `rect.width`.
- Влучання: кільце з'являється на обох картинках, щойно зріз приносить коло. Колір кільця — `tone` у командах, акцентний соло.
- Промахи й заморозка:
  - `spotdiff_miss` — короткий червоний хрестик у точці тапу;
  - `spotdiff_freeze` і `spotdiff_frozen` — обидві картинки отримують клас `spot-frozen` (сірий фільтр і напис `spotdiffFrozen`) на 1 с, і тапи в цей час не надсилаються;
  - `spotdiff_found` — нічого не показується;
  - `too_soon` — тап мовчки відкидається.
- Після «знайшов усе» показується `spotdiffAllFound` з часом, і тапи вимикаються.

- [ ] **Step 1: Write the failing tests:**
  - `useSpotdiff.test.ts`:
    - `a tap sends the round-local number and the width` — `tap(0.5, 0.4, 288)` з `questionIndex 0` → `send('player:spotdiff', { questionIndex: 0, x: 0.5, y: 0.4, width: 288 })`;
    - `a tiny width is raised to the minimum` — `tap(…, 40)` → `width: 60`;
    - `a freeze blocks taps for a second` (fake timers) — ack `spotdiff_freeze` → `frozen` true, `tap` нічого не надсилає; через 1000 мс знову надсилає;
    - `a miss shows a cross that fades` — ack `spotdiff_miss` → один елемент у `misses`, через 600 мс порожньо.
  - `SpotdiffView.test.tsx`:
    - `both pictures take taps` — тап по першій і по другій картинці надсилає однакові частки для однакових точок;
    - `found circles show on both pictures` — коло з `info.found` малюється двічі;
    - `frozen pictures look frozen` — клас `spot-frozen`;
    - `fits 320 px` — жодна рамка не ширша за 320, картинки стоять одна над одною;
    - `another spotdiff in the same slot starts afresh` — інший `changed` під тим самим номером скидає `misses`/`frozen` (ключ із Global Constraints).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web/src/live/useSpotdiff.test.ts apps/web/src/screens/SpotdiffView.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за зразком `useJigsaw.ts` (ack, офлайн, номер із `view.questionIndex`) і гілки `JigsawPlay` у `PlayerScreen.tsx`.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 29d spotdiff phone — two pictures stacked on a phone and side by side wider, taps on either, rings on both, a miss cross, a one-second freeze, the round-local number"
```

---

### Задача 8. Веб: сцена, пульт, розкриття, живі відповіді, історія

**Files:**
- Modify:
  - `apps/web/src/screens/SpotdiffView.tsx`:
    - `SpotdiffBoards` — картки «нік · x з N», сторінки за `puzzleGrid`/`puzzlePageSize`/`usePage` з `PuzzleView.tsx`;
    - `SpotdiffResults` — таблиця з тим самим зменшенням шрифту, що в `JigsawResults`;
    - `SpotdiffStage` — картинки й картки.
  - `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/HostScreen.tsx` — гілки поряд з `JigsawBoards` (`HostScreen` ~545 «answeredOf», ~806 без «correctAnswer», ~1177 панель, ~1261 `liveHides`). Пульт бачить кола з `label` = номер і `spotdiffSpotFoundBy` (k), а в рядку дошки — номери знайдених кіл.
  - `apps/web/src/screens/LiveAnswers.tsx` — прогрес `spotdiff` (`found/total`, ✓).
  - `apps/web/src/pages/GameHistory.tsx` — рядок «знайдено x з N».
- Test: `apps/web/src/screens/SpotdiffView.test.tsx`, `StageScreen.test.tsx`, `HostScreen.test.tsx`, `LiveAnswers.test.tsx`, `apps/web/src/pages/GameHistory.test.tsx`

- [ ] **Step 1: Write the failing tests:**
  - `the stage shows counts and no circles before reveal` — 3 дошки, в Олі «2 з 3»; на сцені немає жодного `circle.spot-ring`.
  - `the host sees the circles with how many found each` — 3 кола, у кола 1 підпис «2».
  - `reveal shows every circle and the table` — 3 кола на обох картинках; рядки таблиці йдуть за «знайшов усе / timeMs», далі за `found`; є бали.
  - `twelve rows fit the stage` — 12 рядків таблиці вміщаються в 1600×900 (як тест `JigsawResults`).
  - `live answers show finds and done`; `history shows found of total`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web/src/screens apps/web/src/pages/GameHistory.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 29d spotdiff stage and host — found counts for everyone, circles only for the host until reveal, all circles and a table after time"
```

---

### Задача 9. Наскрізні сценарії й кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`. Додати нові `it('part 29d: …')` після `part 29c` і помічники:
  - `spotdiff29d(id, spots, timeLimit)`;
  - `spotPngs29d()` — два синтетичні PNG 800×600: однаковий градієнтний фон, а в другому три кольорові квадрати в місцях кіл (як `drawnPngs25c`, без реальних фото);
  - `tapShare29d(page, picture, x, y)` — тап у частках рамки.

**Сценарії** (таймери ≥ 25 с):
1. `it('part 29d: spotdiff after a classic round — two uploads and circles in the editor, near taps count, three misses freeze for a second, a share of the price per find, 320 px')`:
   - **Редактор.** Перший раунд класичний з одним `single` (30 с). Другий раунд класичний зі spotdiff:
     - завантажити обидві картинки й поставити 3 кола тапами, одне збільшити перетягуванням;
     - перевірити, що 11-те коло не ставиться (на окремому чернетковому запитанні);
     - раунд «Головоломки» має судоку й spotdiff на 2 кола;
     - у бліц-раунді типу «Знайди відмінності» в меню немає;
     - кадр `spotdiff29d-editor`.
   - **Гра на 3 телефонах (один 320 px).** Спершу класичне запитання, потім spotdiff:
     - Оля знаходить усі 3, одне з них — тапом на 20 px за краєм кола на 320 px, і тап зараховується;
     - Тарас знаходить 2 і не встигає;
     - Петро тричі промахується → клас `spot-frozen`; тап по колу під час заморозки не дає знахідки (лічильник на сцені не змінився); після 1 с той самий тап зараховується.
   - **Перевірки балів і сцени:**
     - Оля 300, Тарас 200, Петро 100;
     - до розкриття на сцені немає кіл, на розкритті є 3;
     - spotdiff у раунді «Головоломки» після судоку має номер у раунді 1, і тапи проходять.
   - **Кадри:** `spotdiff29d-phone-320`, `spotdiff29d-phone-frozen`, `spotdiff29d-stage` (1600×900), `spotdiff29d-host`, `spotdiff29d-reveal-stage`.
2. `it('part 29d: spotdiff in teams — one shared board, a teammate find shows on both phones, a freeze is personal, a restart keeps the finds')`:
   - 2 команди по 2 учасники;
   - учасник А знаходить коло → кільце видно на телефоні Б, а Б по тому ж колу не отримує ні промаху, ні знахідки;
   - А тричі промахується й замерзає, а Б тим часом знаходить наступне коло;
   - `restart()` посеред запитання → знахідки на місці, телефони продовжують;
   - кадри: `spotdiff29d-teams-phone`, `spotdiff29d-teams-stage`.
3. `it('part 29d: spotdiff with 24 players — the stage counters fit 1600×900')` — 24 сокет-гравці тапають випадково; `expectNoSideScroll`, кадр `spotdiff29d-24-stage`.

- [ ] **Step 1: Write the scenarios** за зразком `part 29c` (`socketFrames`, `shot`, `restart`, `expectPhoneFit`, `expectNoSideScroll`, завантаження в редакторі як `uploadPhoto29c`).
- [ ] **Step 2: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 29d"`. Expected: PASS; кадри в `artifacts/shots`.
- [ ] **Step 3: Переглянути кадри.** Перевірити, що:
  - на 320 px картинки стоять одна над одною без горизонтального скролу;
  - заморозку видно;
  - на сцені до розкриття немає кіл;
  - на розкритті є кола й таблиця.
- [ ] **Step 4: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 29d spotdiff — after a classic round, editor uploads and circles, near taps and a freeze at 320 px, share-of-price scoring, a shared team board with personal freezes, a restart, 24 counters"
```
