# План 29c: запитання «Пазл» (`jigsaw`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> План спирається на `main` після 28d і фікса номера запитання (`3cd73629`, `d5cace90`, `fe50d9f2`):
> - з 28d: `PUZZLE_TYPES`, `isPuzzle`, `puzzlesRoundSchema`, `puzzle_place`, `puzzles_type`, `LIMITS.maxPuzzleTime`, `puzzles.ts` (`puzzleRefusal`, `puzzleFinish`, `scorePuzzle`, `packPuzzles`), `PuzzlePlay.order`, `windowAllowed`, `commit(…, puzzle = true)` і `PUZZLE_PUSH_MS` (замикальне вікно розсилки в `socket.ts`), `PuzzleView.tsx` (`puzzleGrid`, `puzzlePageSize`, `PUZZLE_PAGE_MS`), `ADDED_28D`;
> - з 28c: `drawing.ts` (`actorOf(…, 'answer')`, `drawingCould`), `off_drawing`, `drawing_place` (лише класика);
> - `seededRng` (mulberry32) у `packages/shared/src/sudoku.ts`; `roundQuestionNumber(state)` у `game.ts`; `GAME_STATE_VERSION = 22`.
>
> Якщо 29a/29b змержено раніше — нові `ADDED_29*` списки, `QUESTION_TYPES` і `ErrorCode` уже довші: додавати поряд, рішення плану не змінюються. **Перед кожною задачею виконавець звіряє назви й рядки з фактичним кодом.**

**Goal:** новий тип запитання `jigsaw` («Пазл»): ведучий заливає фото, гравець (команда — один спільний пазл) складає класичні шматочки з виступами, обертаючи їх тапом; бали — `максимум × час найшвидшого / свій час`, хто не склав — 0.

**Architecture:**
- **Геометрія (`shared/src/jigsaw.ts`, чиста й детермінована):** сітка рядки×стовпці за кількістю й співвідношенням, виступи з `seed` (рядок `tabs` зберігається в запитанні), перевірка «прилипання», обрізання фото. Користуються схема, редактор, рушій (перевірка місця) і телефон (той самий тест, що й на сервері).
- **Стан (`engine/src/jigsaw.ts`):** необов'язкове `Play.jigsaw?: JigsawPlay` — дошки гравців (команд): поставлені шматочки, хто поставив, «тримання» шматочків у командах, мить завершення. Сервер приймає лише «узяв k» (команди) і «поставив k у (x, y) з поворотом rot»; місце й поворот перевіряє сервер; час завершення — `now` сервера. `GAME_STATE_VERSION` лишається 22.
- **Веб:** шматочки вирізаються на клієнті canvas-масками з того самого фото (`/uploads/…` — той самий origin, canvas не «забруднюється»); сцена й пульт — SVG-мініатюри з `clipPath` поставлених шматочків; редактор — наявний `ImageField` (завантаження в R2/диск без змін) + рамка обрізання.

**Tech Stack:** TypeScript, zod 4, vitest, Fastify + Socket.IO, React 19 + Vite + Testing Library, Playwright через vitest (e2e).

**Spec:** `docs/superpowers/specs/2026-11-11-jigsaw-design.md` (обов'язкова). Зразки: `docs/superpowers/plans/2026-11-10-plan-28d-puzzles.md` і його код (`packages/engine/src/puzzles.ts`, `apps/web/src/screens/PuzzleView.tsx`, `apps/web/src/live/usePuzzleBoard.ts`), `docs/superpowers/plans/2026-11-10-plan-28c-drawing.md` (живий стан людини, частота, мініатюри сцени).

## Global Constraints

- 7 мов без ru: нові ключі в uk (`apps/web/src/i18n.ts`) і `apps/web/src/locales/{en,pl,de,es,it,ar}.json`, список `ADDED_29C` в `apps/web/src/i18n.test.ts` (додати до умови `adds no uk keys beyond the agreed list`); довідка — `help-uk.ts`, `__fixtures__/help-uk-golden.json`, `help-vars.ts`, `locales/*.help.json`. Нічого про росію — і в прикладах, фікстурах, e2e-фото.
- `GAME_STATE_VERSION` не підвищувати (22): лише необов'язкові поля (`Play.jigsaw?`, `BaseView.jigsaw?` …). У `restore.ts` над `READABLE_STATE_VERSIONS` — коментар «29c без нової версії: тип jigsaw і необов'язковий Play.jigsaw; старий знімок не містить ні того, ні того». Знадобилось обов'язкове поле — **зупинитися й спитати контролера**.
- Юніт-тести: `pnpm vitest run --maxWorkers=2 …`. Ніколи не запускати prettier. Типи: `pnpm typecheck`.
- e2e: `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 29c"`, на передньому плані, < 10 хв.
- Таймер пазла: типово **120 с**, мінімум **25 с** (схема), максимум `LIMITS.maxPuzzleTime` (600). Усі таймери у фікстурах і e2e ≥ 25 с.
- Пазл дозволений **лише** в раундах `classic` і `puzzles`; у бліці, фіналі, на полі (і будь-де ще) — помилка схеми `jigsaw_place`.
- Кількість шматочків 6…36, типово 12; співвідношення `1:1`, `4:3`, `3:4`, `16:9`.
- Прилипання: поворот правильний **і** відстань до свого місця < **25 %** розміру шматочка. Прилиплий шматочок нерухомий.
- Команди: один спільний пазл; шматочок, який узяв учасник, заблокований для інших на **2 с**.
- Бали: перший, хто склав, — максимум; інші — `round(максимум × час_найшвидшого / свій_час)`; не склав — 0. Час — сервер.
- **Номер запитання в подіях — номер у межах раунду** (`roundQuestionNumber(state)`, те, що телефон бачить у `view.questionIndex`), **не** `state.questionIndex`. Кожна нова перевірка «застарілої» події порівнює саме його; e2e грає пазл **після попереднього раунду**.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`). Кадри сцени — 1600×900; телефон — 320 px.

## Рішення плану (там, де специфікація мовчить)

- **Назви.** Тип — `'jigsaw'`, у `QUESTION_TYPES` одразу після `'crossword'`. **Не** додавати в `PUZZLE_TYPES`: `isPuzzle` у рушії означає «судоку чи кросворд» (`puzzlePlay`, `Play.puzzle`). Новий `PUZZLES_ROUND_TYPES = [...PUZZLE_TYPES, 'jigsaw']` — що приймає раунд `puzzles` (`puzzles_type` перевіряє його).
- **Фото — окреме поле `photo`, а `imageUrl` мусить бути `null`** (`jigsaw_image`): інакше загальний `QuestionImage` показав би готову картинку на сцені й телефоні, і підказку не можна було б вимкнути.
- **Запитання:**
  ```ts
  { ...base, type: 'jigsaw',
    timeLimit: int 25…600,
    photo: string /* IMAGE_URL */, aspect: '1:1' | '4:3' | '3:4' | '16:9',
    focus: { x: 0…1; y: 0…1 },        // частка «запасу» фото поза рамкою: 0 — лівий/верхній край, 0.5 — центр
    rows: int 2…12, cols: int 2…12,   // rows × cols ∈ 6…36; пропорція шматочка (aspect/cols·rows) ∈ [0.5, 2]
    seed: int 0…2³²−1,                 // лише для «інша форма» в редакторі
    tabs: string,                      // /^[01]*$/, довжина jigsawEdgeCount(rows, cols)
    preview: boolean }                 // показувати зменшену готову картинку поруч
  ```
  Окремого поля «бажана кількість» немає: редактор показує `rows × cols`. Схема **не** перераховує `jigsawGrid` (не залежить від версії алгоритму), а лише перевіряє межі, пропорцію й довжину `tabs` (`jigsaw_grid`, `jigsaw_tabs`). `video`/`audio`/`reveal` → `jigsaw_video`; `hint` → `jigsaw_hint` (бафи на пазлі вимкнено).
- **Сітка** `jigsawGrid(pieces, aspect)`: перебір `rows, cols ∈ 2…12`, `rows·cols ∈ 6…36`, пропорція шматочка `p = ratio(aspect) / cols × rows ∈ [0.5, 2]`; найкращий — лексикографічно `(|rows·cols − pieces|, |ln p|, rows)`. Перевірені значення: `(12,'4:3') → 3×4`, `(12,'16:9') → 3×4`, `(12,'3:4') → 4×3`, `(7,'1:1') → 2×3`, `(7,'16:9') → 2×4`, `(24,'3:4') → 6×4`, `(36,'16:9') → 4×9`, `(36,'1:1') → 6×6` (рядки×стовпці). Редактор пише `cols×rows = n` («4×3 = 12»).
- **Виступи** `jigsawTabs(rows, cols, seed)`: `seededRng(seed)`, по символу на внутрішнє ребро: спершу вертикальні ребра між `(r,c)` і `(r,c+1)` у порядку рядків, потім горизонтальні між `(r,c)` і `(r+1,c)`. `'1'` — виступ із лівого/верхнього шматочка в правий/нижній, `'0'` — навпаки. Форму кривої задає лише веб (`jigsaw-shape.ts`); зовнішні ребра прямі.
- **Шматочок і координати.** Шматочок `k = row × cols + col`. Позиція в події — лівий верхній кут **ядра** шматочка (без виступів) у одиницях клітинки рамки: `x` — у ширинах клітинки, `y` — у висотах. Правильне місце — `(col, row)`. `rot ∈ 0…3` — чверті оберту за годинниковою від правильного; прилипає лише `rot === 0` і `hypot(x − col, y − row) < JIGSAW_SNAP = 0.25`.
- **Розкладка й початковий поворот — на телефоні** (`jigsawPile(rows, cols, seed, actorId)` у вебі: `seededRng(seed ^ hash(actorId))` — порядок у «купці» й поворот 0/90/180/270 на шматочок; той самий після перепідключення). Сервер початкового повороту не знає: перевіряє лише `rot === 0` у місці.
- **Стан** (`game.ts`):
  ```ts
  /** «Пазл» (29c): дошки поточного запитання; openQuestion спорожнює дошки минулих (запис зберігає answer). */
  export interface JigsawPlay { boards: Record<string, JigsawBoard>; /** Лише в командах: учасники на відкритті (колір). */ order?: Record<string, string[]> }
  export interface JigsawBoard {
    /** Поставлені шматочки в порядку постановки. */ placed: number[];
    /** Лише в командах: хто поставив, паралельно placed. */ by?: string[];
    /** Лише в командах: шматочок → хто тримає й до коли (мс сервера). Прострочене ігнорується й прибирається при наступній зміні. */ held?: Record<string, { by: string; until: number }>;
    /** Мить, коли поставлено останній шматочок (мс від startedAt); null — ще ні. */ doneMs: number | null;
    seq: number;
  }
  // Play.jigsaw?: JigsawPlay;
  ```
- **Події:**
  - `player:jigsaw` `{ questionIndex, piece, x, y, rot }` → `jigsawPlace`. Перевірки по черзі: `wrong_phase`, `paused`, `not_started`, `not_found` (учасник не цієї команди теж); `questionIndex !== roundQuestionNumber(state)` → `jigsaw_stale`; `type_mismatch`; `time_over`; дошка складена або вже є запис → `jigsaw_done`; `piece` поза `0…rows·cols−1` → `jigsaw_piece`; уже поставлений (товаришем) → `jigsaw_placed`; тримає інший учасник і `until > now` → `jigsaw_held`; не прилипає → `jigsaw_miss`. Прийнято: `placed.push(piece)`, `by`, `held[piece]` знято, `seq + 1`. Останній шматочок → `doneMs = now − startedAt`, запис з остаточними балами, `autoLock`.
  - `player:jigsaw-hold` `{ questionIndex, piece }` → `jigsawHold` (лише в командах; соло — `ok(state)` без зміни). Ті самі перевірки до `jigsaw_held`; `held[piece] = { by: memberId, until: now + JIGSAW_HOLD_MS (2000) }`. Телефон повторює «тримаю» раз на `JIGSAW_HOLD_REFRESH_MS = 1000`, поки шматочок у пальці. «Відпустив» окремої події не має: блок просто спливає.
  - Ack — `{ ok: true }` або помилка; `jigsaw_miss` безпечний (місце й так видно на телефоні).
  - Частота: `JIGSAW_MOVES_PER_SECOND = 8` на людину, одне вікно `jigsawRate` на обидві події; понад — `too_soon`. Обидві зміни йдуть `commit(room, state, now, true)` — розсилка зрізів зливається в замикальному вікні `PUZZLE_PUSH_MS`. Завершення останнім шматочком і закриття — одразу (без прапорця), як «Готово» в 28d.
- **Оцінка** (`jigsawRecord`):
  - склав: `fastest = min(timeMs усіх записів «склав» цього запитання, свій)`; `points = round(round(ціна × multiplier) × fastest / max(1, own))`, `grade: 'correct'`, `accuracy: 1`. Перший, хто склав, завжди найшвидший (час монотонний), тож бали остаточні в мить завершення.
  - на закритті (`scoreJigsaw` у ланцюжку `lockNow` і `stop` поряд з `scorePuzzle`): дошки з ≥ 1 шматочком без запису → `wrong`, 0, `accuracy = placed / total`, `timeMs = ліміт`. Хто нічого не поставив — запису не отримує (як `scorePuzzle`).
  - `streakBonus: 0`, без швидкісного бонусу правил, без мінусу; `multiplier` — `rulesOf(раунд)` (у `puzzles` — 1).
  - `JigsawAnswer` (`answer.ts`, лише рушій; `answerSchema` не приймає): `{ type: 'jigsaw'; placed: number; total: number; done: boolean; timeMs: number | null }`.
  - Ведучий оцінку не змінює: `jigsaw` у `UNGRADABLE` (`live.ts`) і в переліках `gradable` у `views.ts`; ручні бали (`adjust`) — як завжди.
- **Класичний раунд:** `actorOf(…, 'answer')` → команда; `answerer.ts` — `freeForAll` і «наступне без відповідача» для `jigsaw` (як `isPuzzle`); бафи — `questionOff` → `off_jigsaw`; дебафи на пазлі не ставляться й не продаються, той, що чекає, чекає наступного запитання (як 28d у `debuffs.ts`, але за типом запитання). Серія не рахується (як `moreless`).
- **Зрізи:**
  - `PublicQuestion.jigsaw?: PublicJigsaw = { photo, aspect, focus, rows, cols, tabs, preview }` — фото не таємниця (телефон ріже з нього шматочки); `preview` лише вмикає мініатюру на телефоні.
  - `BaseView.jigsaw?` і `HostView.jigsaw?`: `JigsawInfo = { boards: JigsawBoardView[] }`, `JigsawBoardView = { playerId, nickname, placed: number[], tones: string | null /* лише команди: '1'…'9' на поставлений шматочок, паралельно placed */, total, done: boolean, timeMs: number | null, points: number | null /* лише на reveal */ }`. До `reveal` — порядок гравців; на `reveal` — `done` спершу за `timeMs`, далі за `placed.length` спадно. Дошки показуються для всіх гравців (команд), навіть порожні.
  - `PlayerView.me.jigsaw?: PlayerJigsaw = { placed: number[]; held: { piece: number; tone: string }[] /* лише чужі живі блоки товаришів */; done: boolean; canPlace: boolean; seq: number; timeMs: number | null; result: { points: number } | null /* лише на reveal */ }`.
  - `LiveProgress` — `{ kind: 'jigsaw'; placed: number; total: number; done: boolean }`.

## Порядок збирання

- Задача 2 додає `jigsaw` у `Question`/`Answer`; вичерпні `switch` у `apps/web` ламаються, тож у задачах 2–5 перевірка — `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Від задачі 6 — `pnpm typecheck`.
- Залежності: 2 ← 1; 3 ← 2; 4 ← 3; 5 ← 3, 4; 6 ← 1, 2; 7 ← 4, 6; 8 ← 4, 7; 9 — остання.

## Review Focus

1. **Пазл після попереднього раунду.** Подія з номером у межах раунду приймається; з `state.questionIndex` (коли вони різні) — `jigsaw_stale`. Тест: задача 3 `places after an earlier round by the round-local number`; задача 5 `places through the socket after a classic round`; задача 9 — сценарій після класики.
2. **Повернутий чи трохи зсунутий шматочок.** Правильне місце з `rot = 1` або відстанню рівно 0.25 не прилипає, 0.24 прилипає; клієнт і сервер дають однакову відповідь (одна функція `jigsawFits`). Тест: задача 1 `snaps only upright and closer than a quarter`.
3. **Двоє в команді хапають один шматочок.** Другий отримує `jigsaw_held` до 2 с, після 2 с може; товариш ставить шматочок, поки я його тягну — мій телефон тихо повертає його на місце в рамці (`jigsaw_placed`), без помилки. Тести: задача 3 `a held piece is locked for teammates for two seconds`; задача 7 `a piece placed by a teammate leaves my hand`.
4. **Пазл не в тому раунді.** Бліц, фінал, поле, ставки, аукціон, вибування, виживання, мільйонер, запасні, дуель → помилка; класика й «Головоломки» → ок. Тест: задача 2 `a jigsaw plays only in classic and puzzles rounds`.
5. **Пауза й час.** Під час паузи шматочок не ставиться (`paused`); після часу — `time_over`, а незавершені дошки отримують 0; час завершення не включає паузу (рахується так само, як `puzzleFinish`). Тест: задача 3 `refuses paused, late and stale moves` і `time out gives unfinished boards zero`.

---

### Задача 1. Спільне: геометрія пазла

**Files:**
- Create: `packages/shared/src/jigsaw.ts`, `packages/shared/src/jigsaw.test.ts`
- Modify: `packages/shared/src/index.ts` — `export * from './jigsaw'`.

**Interfaces (Produces):**
```ts
export const JIGSAW_ASPECTS = ['1:1', '4:3', '3:4', '16:9'] as const;
export type JigsawAspect = (typeof JIGSAW_ASPECTS)[number];
export const JIGSAW_SNAP = 0.25;
export function aspectRatio(aspect: JigsawAspect): number;                         // ширина / висота
export function jigsawGrid(pieces: number, aspect: JigsawAspect): { rows: number; cols: number };
export function jigsawPieceRatio(rows: number, cols: number, aspect: JigsawAspect): number;
export function jigsawEdgeCount(rows: number, cols: number): number;              // rows·(cols−1) + (rows−1)·cols
export function jigsawTabs(rows: number, cols: number, seed: number): string;
/** Сторони шматочка k: 0 — пряма (край), 1 — виступ назовні, −1 — западина; порядок top, right, bottom, left. */
export function jigsawSides(rows: number, cols: number, tabs: string, piece: number): [number, number, number, number];
export function jigsawFits(grid: { rows: number; cols: number }, piece: number, x: number, y: number, rot: number): boolean;
/** Обрізання фото: прямокутник у пікселях оригіналу, focus — частка запасу. */
export function jigsawCrop(width: number, height: number, aspect: JigsawAspect, focus: { x: number; y: number }): { sx: number; sy: number; sw: number; sh: number };
```
`LIMITS` у цьому файлі не імпортувати (`quiz.ts` імпортує його); межі 6/36 — локальні константи `JIGSAW_MIN_PIECES = 6`, `JIGSAW_MAX_PIECES = 36`, які `LIMITS` перевикористовує.

- [ ] **Step 1: Write the failing tests** (`jigsaw.test.ts`):
  - `picks the nearest grid with near-square pieces` — усі вісім пар із «Рішень плану» (`(12,'4:3') → { rows: 3, cols: 4 }` … `(36,'16:9') → { rows: 4, cols: 9 }`); для кожного `pieces` 6…36 × 4 співвідношення результат має `rows·cols ∈ 6…36` і `jigsawPieceRatio ∈ [0.5, 2]`.
  - `generates the same tabs for the same seed` — `jigsawTabs(3, 4, 7)` двічі однакові, довжина `jigsawEdgeCount(3, 4) === 17`, лише `0`/`1`; `seed 8` — інший рядок.
  - `neighbours fit together` — для `3×4` і будь-якого `tabs`: права сторона `k` = −ліва сторона `k+1`; нижня `k` = −верхня `k+cols`; краї рамки — 0.
  - `snaps only upright and closer than a quarter` — шматочок 5 у `3×4` (місце `(1, 1)`): `(1, 1, 0)` → true; `(1.24, 1, 0)` → true; `(1.25, 1, 0)` → false; `(1.18, 1.18, 0)` → false (hypot 0.255); `(1, 1, 1)` / `2` / `3` → false; `piece 12` → false; `NaN` → false.
  - `crops at the focus` — фото 1000×500, `'1:1'`: `focus {0.5,0.5}` → `{ sx: 250, sy: 0, sw: 500, sh: 500 }`; `{0, …}` → `sx: 0`; `{1, …}` → `sx: 500`; фото 600×900, `'16:9'` центр → `{ sx: 0, sy: 281.25, sw: 600, sh: 337.5 }`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared/src/jigsaw.test.ts`. Expected: FAIL (модуля немає).
- [ ] **Step 3: Implement** за «Рішеннями плану»; `seededRng` імпортувати з `./sudoku`.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/shared && tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 29c jigsaw geometry — the nearest grid with near-square pieces, seeded tabs, a quarter-size upright snap, a focus crop"
```

---

### Задача 2. Спільне: запитання, місця, ліміти, відповідь, події, помилки, зрізи

**Files:**
- Modify:
  - `packages/shared/src/quiz.ts` — `LIMITS` (`minJigsawPieces: 6`, `maxJigsawPieces: 36`, `defaultJigsawPieces: 12`, `minJigsawTime: 25`, `defaultJigsawTime: 120`, `defaultJigsawPoints: 300`); `QUESTION_TYPES` (+ `'jigsaw'` після `'crossword'`); гілка `questionSchema`; `superRefine` запитання (`jigsaw_image`, `jigsaw_video`, `jigsaw_hint`, `jigsaw_grid`, `jigsaw_tabs`); `PUZZLES_ROUND_TYPES`; `puzzles_type` через нього; новий блок `jigsaw_place` у `quizSchema.superRefine` поряд з `drawingPlace`/`puzzlePlace`;
  - `packages/shared/src/answer.ts` — `JigsawAnswer` в `Answer` (`answerSchema` **не** приймає);
  - `packages/shared/src/events.ts` — `jigsawPlaceSchema`, `jigsawHoldSchema`, `JIGSAW_MOVES_PER_SECOND = 8`, `JIGSAW_HOLD_MS = 2000`, `JIGSAW_HOLD_REFRESH_MS = 1000`, `ClientToServerEvents`;
  - `packages/shared/src/game.ts` — `ErrorCode`: `'jigsaw_stale' | 'jigsaw_done' | 'jigsaw_piece' | 'jigsaw_placed' | 'jigsaw_held' | 'jigsaw_miss'`; `BuffWhy`: `'off_jigsaw'`;
  - `packages/shared/src/views.ts` — `PublicJigsaw`, `JigsawBoardView`, `JigsawInfo`, `PlayerJigsaw`, поля `PublicQuestion.jigsaw?`, `BaseView.jigsaw?`, `HostView.jigsaw?`, `PlayerView.me.jigsaw?`; `LiveProgress` `{ kind: 'jigsaw' … }`;
  - `packages/shared/src/facts.ts` — `jigsaw` без вікна відповіді (поряд із `sudoku`, рядки ~58, ~201);
  - `packages/shared/src/round-brief.ts` — у брифі `puzzles` лічильник `jigsaw`; `packages/shared/src/drafts.ts` — `jigsaw` не тип чернетки.
- Test: `packages/shared/src/quiz.test.ts`, `packages/shared/src/facts.test.ts`

**Interfaces (Produces):**
```ts
// quiz.ts
z.object({ ...base, type: z.literal('jigsaw'),
  timeLimit: z.number().int().min(LIMITS.minJigsawTime).max(LIMITS.maxPuzzleTime),
  photo: z.string().regex(IMAGE_URL), aspect: z.enum(JIGSAW_ASPECTS),
  focus: z.object({ x: share01, y: share01 }),
  rows: z.number().int().min(2).max(12), cols: z.number().int().min(2).max(12),
  seed: z.number().int().min(0).max(2 ** 32 - 1), tabs: z.string().regex(/^[01]*$/).max(264), preview: z.boolean() })
export const PUZZLES_ROUND_TYPES = [...PUZZLE_TYPES, 'jigsaw'] as const satisfies readonly Question['type'][];
export function fitsPuzzlesRound(question: { type: Question['type'] }): boolean;
// events.ts — questionIndex: номер у раунді, без верхньої межі (як puzzleFillSchema після d40919e6)
export const jigsawPlaceSchema = z.object({ questionIndex: z.number().int().nonnegative(), piece: z.number().int().min(0).max(35),
  x: z.number().finite().min(-20).max(20), y: z.number().finite().min(-20).max(20), rot: z.number().int().min(0).max(3) }).strict();
export const jigsawHoldSchema = z.object({ questionIndex: z.number().int().nonnegative(), piece: z.number().int().min(0).max(35) }).strict();
'player:jigsaw': (payload: z.infer<typeof jigsawPlaceSchema>, ack: Ack) => void;
'player:jigsaw-hold': (payload: z.infer<typeof jigsawHoldSchema>, ack: Ack) => void;
// answer.ts
export interface JigsawAnswer { type: 'jigsaw'; placed: number; total: number; done: boolean; timeMs: number | null }
// views.ts — поля з «Рішень плану» (PublicJigsaw, JigsawBoardView, JigsawInfo, PlayerJigsaw)
```

- [ ] **Step 1: Write the failing tests** (`quiz.test.ts`; помічник `jigsawQ(patch)` — `photo: '/uploads/' + 'a'.repeat(32) + '.jpg'`, `'4:3'`, `jigsawGrid(12,'4:3')`, `jigsawTabs(3,4,1)`, `focus {0.5,0.5}`, `preview: true`, 120 с, 300 балів, `imageUrl: null`):
  - `accepts a jigsaw` — парситься; `rows 6, cols 6` з `'1:1'` теж.
  - `refuses a broken jigsaw` — `imageUrl` не null → `jigsaw_image`; відео/аудіо/`reveal` → `jigsaw_video`; `hint` → `jigsaw_hint`; `rows 2, cols 2` (4 шматочки) і `6×7` (42) → `jigsaw_grid`; `rows 2, cols 12` з `'1:1'` (пропорція 0.167) → `jigsaw_grid`; `tabs` коротший на 1 → `jigsaw_tabs`; `timeLimit: 24` і `photo: 'https://x/y.jpg'` → помилка парсингу; `timeLimit: 25` → ок.
  - `a jigsaw plays only in classic and puzzles rounds` — у `classic` і в `puzzles` (разом із судоку) → ок; у `blitz`, `final`, на клітинці `board`, у `bets`, `auction`, `wipeout`, `survival` (і в trial), `ladder` → `jigsaw_place`; запасне запитання-пазл → `spare_type`; дуель не приймає; `puzzles` з `single` → `puzzles_type` як і раніше.
  - `old quizzes still parse` (наявний) — без змін.
  - `the jigsaw events are limited` — `piece 36`, `rot 4`, `x: Infinity`, зайве поле → false; `questionIndex: 7` → true; `answerSchema` не приймає `{ type: 'jigsaw', … }`.
  - `QUESTION_TYPES_MATCH_SCHEMA` компілюється.
  - `facts.test.ts`: `a jigsaw has no answer window`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared`. Expected: FAIL.
- [ ] **Step 3: Implement** за Interfaces. Місце:
  ```ts
  const jigsawPlace = round.type === 'board'
    ? boardCells(round).some(({ cell }) => cell.question.type === 'jigsaw')
    : round.type !== 'classic' && round.type !== 'puzzles' && [...roundQuestions(round), ...roundTrials(round)].some((q) => q.type === 'jigsaw');
  ```
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/shared && tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 29c jigsaw question — its own photo, aspect, focus, grid and tabs, only in classic and puzzles rounds, place and hold events, views"
```

---

### Задача 3. Рушій: відкриття, «тримаю», постановка, оцінка, команди, закриття

**Files:**
- Create: `packages/engine/src/jigsaw.ts`, `packages/engine/src/game.jigsaw.test.ts`
- Modify:
  - `packages/engine/src/game.ts` — `JigsawPlay`, `JigsawBoard`, `Play.jigsaw?`; `openQuestion` — для `jigsaw` `{ jigsaw: teamsOn ? { boards: {}, order } : { boards: {} } }` (як `puzzle`), `plays` через `packJigsaws`; `lockNow` і `stop` — `scoreJigsaw` поряд зі `scorePuzzle`; `submitAnswer` (~1906) і перелік ~2548 — `jigsaw`;
  - `packages/engine/src/team-act.ts` — `'answer'` на `jigsaw` → команда;
  - `packages/engine/src/answerer.ts` — `freeForAll`, `answererOf → null`, «наступне без відповідача» для `jigsaw`;
  - `packages/engine/src/buffs.ts` — `questionOff`: `'off_jigsaw'`; `packages/engine/src/debuffs.ts` — пазл не отримує дебафів (чекає наступного запитання);
  - `packages/engine/src/live.ts` — `PROGRESS_TYPES`, `UNGRADABLE`, прогрес `jigsaw`;
  - `packages/engine/src/restore.ts` — лише коментар; `packages/engine/src/index.ts` — `export * from './jigsaw'`;
  - `packages/engine/src/testing/fixtures.ts` — `jigsawQuiz()`: раунд `classic` (одне `single`, 30 с) → раунд `classic` з пазлом `3×4`, 120 с, 300 балів → раунд `puzzles` з пазлом `2×3`, 60 с;
  - `packages/engine/src/testing/autopilot.ts` — бот ставить шматочки `0…n−1` у `(col, row, 0)` з номером `roundQuestionNumber`.
- Test: `game.jigsaw.test.ts`, `restore.test.ts`, `autopilot.full.test.ts`, `game.buffs.test.ts`, `game.teams-act.test.ts`

**Interfaces:**
- Consumes: `jigsawFits`, `JIGSAW_HOLD_MS`, `JigsawAnswer`, `roundQuestionNumber`, `withPlay`, `autoLock`, `recordOf`, `timeOverFor`, `limitMsOf`, `notStarted`.
- Produces:
```ts
export type JigsawQuestion = Extract<Question, { type: 'jigsaw' }>;
export function jigsawOf(state: GameState, actorId: string): JigsawBoard | null;
export function jigsawTotal(question: JigsawQuestion): number;                     // rows × cols
export function jigsawHold(state: GameState, actorId: string, memberId: string, questionIndex: number, piece: number, now: number): Result;
export function jigsawPlace(state: GameState, actorId: string, memberId: string, questionIndex: number, move: { piece: number; x: number; y: number; rot: number }, now: number): Result;
export function scoreJigsaw(state: GameState): GameState;
export function packJigsaws(plays: Play[]): Play[];
/** Живі блоки дошки на мить now (прострочені відкинуто). */
export function liveHolds(board: JigsawBoard, now: number): Record<string, { by: string; until: number }>;
```

- [ ] **Step 1: Write the failing tests** (`game.jigsaw.test.ts`; гравці Оля, Тарас, Петро; `jigsawQuiz()`; помічник `toJigsaw(state)` проходить перший раунд і відкриває пазл другого раунду, тож `roundQuestionNumber = 0`, а `state.questionIndex = 1`):
  - `places after an earlier round by the round-local number` — `jigsawPlace(…, questionIndex: 0, { piece: 0, x: 0, y: 0, rot: 0 })` → ok, `placed: [0]`; з `questionIndex: 1` → `jigsaw_stale`.
  - `refuses a piece that does not snap` — `rot: 1` → `jigsaw_miss`; `x: 0.3` → `jigsaw_miss`; `piece: 12` → `jigsaw_piece`; повтор шматочка 0 → `jigsaw_placed`; стан не змінився (`toBe`).
  - `refuses paused, late and stale moves` — пауза → `paused`; після `timeLimit` → `time_over`; заставка → `not_started`; фаза `locked` → `wrong_phase`.
  - `the first to finish gets the maximum` — Оля ставить усі 12 за 40 с → запис `correct`, 300, `accuracy 1`, `streakBonus 0`, `answer.timeMs 40000`, `done true`; далі `jigsaw_done`.
  - `slower finishers get max × fastest / own` — Тарас складає за 60 с → `round(300 × 40000 / 60000) = 200`; Петро за 100 с → 120.
  - `everyone finished closes the question` — усі троє склали → `phase: 'locked'`; відключений без пазла закриття не тримає.
  - `time out gives unfinished boards zero` — Петро поставив 5 з 12 → на закритті `wrong`, 0, `accuracy 5/12`, `answer.placed 5`; гравець без жодного шматочка — без запису.
  - `the puzzles round has no multiplier and no buffs` — пазл у раунді `puzzles` дає 300 першому; баф → `off_puzzles`; у класиці баф → `off_jigsaw`.
  - `teams build one puzzle` — «Соняшники» (Оля, Тарас), «Маки» (Петро, Ганна): Оля ставить 0, Тарас 1 → одна дошка команди `placed [0, 1]`, `by [Оля, Тарас]`; «Маки» — своя дошка; останній шматочок будь-ким — запис команди; у раунді з відповідачем `captain` ставить і не капітан.
  - `a held piece is locked for teammates for two seconds` — Оля `jigsawHold(piece 3)` у `t`; Тарас `jigsawPlace(piece 3)` у `t + 1999` → `jigsaw_held`, `jigsawHold(3)` → `jigsaw_held`; у `t + 2000` → ok; сама Оля ставить у `t + 500` → ok і `held` без 3; соло `jigsawHold` → той самий стан.
  - `the grade is not changed by the host` — `override` на пазлі → відмова, як на `sudoku`.
  - `restore.test.ts`: `a restored room keeps the jigsaw boards` — знімок із `Play.jigsaw` читається з тими самими `placed`; старий без поля читається; `GAME_STATE_VERSION === 22`.
  - `autopilot.full.test.ts`: `jigsawQuiz()` грається ботами до кінця, пазли — `correct`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/game.jigsaw.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» і зразком `puzzles.ts` (`jigsawRefusal` ≙ `puzzleRefusal` з `roundQuestionNumber`; `jigsawRecord` ≙ `puzzleRecord`; час — `now − startedAt`, як `puzzleFinish`).
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/engine && tsc -p packages/shared && tsc -p packages/engine`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/engine
git commit -m "feat(engine): 29c jigsaw — boards per player or team, server-checked snaps, a two-second hold for teammates, max × fastest / own on finish, zero when unfinished"
```

---

### Задача 4. Рушій: зрізи

**Files:**
- Modify: `packages/engine/src/views.ts` — `publicQuestion` (`jigsaw: publicJigsaw(question)`), `jigsawInfo(state, now, reveal)` → `optional('jigsaw', …)` у базовому зрізі та `hostView`; `playerJigsaw(state, actorId, memberId, now)` → `me.jigsaw` (і в командній гілці `playerView`); `answer.type === 'jigsaw'` — `revealed ? answer : null` (~261); `gradable` без `jigsaw`.
- Test: Create `packages/engine/src/views.jigsaw.test.ts`

**Interfaces:**
- Consumes: `jigsawOf`, `liveHolds`, `jigsawTotal`.
- Produces: `PublicJigsaw`, `JigsawInfo`, `PlayerJigsaw` (форми — задача 2) у зрізах.

- [ ] **Step 1: Write the failing tests:**
  - `the question carries the photo and the grid` — `publicQuestion.jigsaw` = `{ photo, aspect, focus, rows: 3, cols: 4, tabs, preview }`; `imageUrl: null`.
  - `the stage sees every board with progress` — Оля 5 шматочків, Тарас 0 → `boards` для всіх трьох у порядку гравців, `placed.length` 5 і 0, `total 12`, `points: null` до `reveal`.
  - `teams see tones and teammates' holds` — `tones` `'1'`/`'2'` за `order`; телефон Тараса: `me.jigsaw.held = [{ piece: 3, tone: '1' }]` після `hold` Олі; через 2 с — `[]`; власні блоки Тараса в `held` не потрапляють; суперник блоків не бачить.
  - `reveal ranks by time` — на `reveal` `boards`: склали за `timeMs` зростанням, далі незавершені за `placed.length`; `points` є; `me.jigsaw.result.points`.
  - `can place only while open` — `canPlace` false на паузі, після завершення, на `locked`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/views.jigsaw.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `now` у зрізах — той самий, що вже приходить для таймера (звірити з `puzzleInfo`/`drawing`).
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/engine && tsc -p packages/engine`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/engine
git commit -m "feat(engine): 29c jigsaw views — the photo and grid for phones, every board's pieces on the stage, teammates' live holds, a time ranking on reveal"
```

---

### Задача 5. Сервер: події, частота, розсилка, історія

**Files:**
- Modify:
  - `apps/server/src/rooms/manager.ts` — `jigsawPlace(room, playerId, payload)`, `jigsawHold(room, playerId, payload)`: `this.act(room, playerId, 'answer')` → `who.id` (команда) і `playerId` (учасник); `windowAllowed(room.jigsawRate, playerId, now, JIGSAW_MOVES_PER_SECOND)`; `jigsawRate` у `Room` і обох місцях створення (~721, ~799), очищення при виході (~2166); зміна без завершення — `commit(room, state, now, true)`; `answerStamp` (~595) — `jigsawOf`;
  - `apps/server/src/socket.ts` — `on('player:jigsaw')`, `on('player:jigsaw-hold')` за зразком `player:puzzle`;
  - `apps/server/src/history.ts` — рядок `JigsawAnswer` (`done`, `timeMs`, `placed/total`); `achievement-games.ts` / `game-achievements.ts` — вичерпні `switch`.
- Test: Create `apps/server/src/rooms/manager.jigsaw.test.ts`; `apps/server/src/socket.test.ts`, `apps/server/src/history.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - `places through the socket after a classic round` — `jigsawQuiz()`, після першого раунду `player:jigsaw` з `questionIndex: view.questionIndex` (0) → `{ ok: true }`, зріз сцени з `placed [0]`; з `state.questionIndex` (1) → `jigsaw_stale`.
  - `jigsaw moves are rate limited` — 9 подій за секунду → дев'ята `too_soon`; через секунду — знову можна.
  - `moves merge stage pushes, the finish goes out at once` — 3 постановки за 100 мс → сцена отримала ≤ 2 зрізи у вікні `puzzleGapMs`; останній шматочок → зріз без очікування.
  - `a teammate's hold refuses my place` — два сокети однієї команди: `hold` першого → `place` другого `jigsaw_held`.
  - `a restored room keeps the jigsaw` — `restart` менеджера → ті самі `placed`; перепідключений телефон бачить їх у `me.jigsaw`.
  - `history shows a finished jigsaw` — рядок відповіді з часом і балами.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/rooms/manager.jigsaw.test.ts apps/server/src/socket.test.ts apps/server/src/history.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за зразком `RoomManager.puzzleFill` / `puzzleDone`.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 apps/server && tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server
git commit -m "feat(server): 29c jigsaw — place and hold events with the round-local number, any teammate for the team, a rate window, merged pushes, history rows"
```

---

### Задача 6. Веб: форма шматочка, редактор, тексти, довідка

**Files:**
- Create: `apps/web/src/live/jigsaw-shape.ts`, `apps/web/src/live/jigsaw-shape.test.ts`, `apps/web/src/editor/JigsawEditor.tsx`, `apps/web/src/editor/JigsawEditor.test.tsx`
- Modify:
  - `apps/web/src/editor/draft.ts` — `questionTypesFor`: `classic` має `jigsaw`; `puzzles` → `PUZZLES_ROUND_TYPES`; решта раундів без `jigsaw`; `newQuestion('jigsaw')` (`photo: ''`-заглушка неможлива → `problemJigsawPhoto` до завантаження; `'4:3'`, `jigsawGrid(12,'4:3')`, `seed` з `crypto.getRandomValues`, `jigsawTabs`, `focus {0.5,0.5}`, `preview: true`, 120 с, 300); `problemKey`; `duplicateQuestion` (новий `seed`/`tabs` не потрібен — копія та сама);
  - `apps/web/src/editor/QuestionEditor.tsx` — `case 'jigsaw'`; без загального `ImageField`, відео, аудіо, підказки й «перевертання»;
  - `apps/web/src/format.ts`, `apps/web/src/admin/admin-text.ts`, `apps/web/src/guide-text.ts`, `apps/web/src/round-summary.ts` — гілки `jigsaw`;
  - `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts` (`ADDED_29C`), `apps/web/src/locales/*.json`, `apps/web/src/help/help-uk.ts`, `help-vars.ts`, `__fixtures__/help-uk-golden.json`, `apps/web/src/locales/*.help.json` — `type_jigsaw`, `typeShort_jigsaw`, `typeHow_jigsaw`, `buffWhy_off_jigsaw`, `err_jigsaw_*` (6), `problemJigsaw*`, тексти редактора й гри.
- Test: `apps/web/src/editor/draft.test.ts`, `apps/web/src/i18n.test.ts`, `apps/web/src/help/*.test.ts`

**Interfaces (Produces):**
```ts
// jigsaw-shape.ts — шлях SVG (d) шматочка в пікселях, ядро в (0,0)…(w,h); виступ — до 0.2 × меншої сторони назовні
export const JIGSAW_TAB = 0.2;
export function piecePath(sides: [number, number, number, number], w: number, h: number): string;
/** Поле навколо ядра, яке займають виступи: canvas/SVG шматочка має розмір (w + 2·pad) × (h + 2·pad). */
export function piecePad(w: number, h: number): number;
export function JigsawEditor(props: { question: JigsawQuestion; onChange: (q: JigsawQuestion) => void }): JSX.Element;
```

**Редактор пазла:** `ImageField` (той самий `uploadImage`, R2/диск) для `photo`; перемикач співвідношення 1:1 / 4:3 / 3:4 / 16:9; повзунок «шматочків» 6…36 → `jigsawGrid` і підпис «4×3 = 12» (`cols×rows = n`); прев'ю — фото в рамці з лініями розрізу (`piecePath`) і перетягуванням рамки (pointer, міняє `focus`); кнопка «Інша форма» (`seed + 1` → `tabs`); перемикач «Показувати готову картинку гравцям» (`preview`); таймер з мінімумом 25.

- [ ] **Step 1: Write the failing tests:**
  - `jigsaw-shape.test.ts`: `a flat piece is a rectangle` — `piecePath([0,0,0,0], 100, 80)` починається з `M0 0` і містить `100 0`, `100 80`, `0 80`; `a tab goes out and a blank goes in` — з `top: 1` шлях має точку з `y < 0` і не нижче `−piecePad`; з `top: −1` — точку з `y > 0`, без `y < 0`.
  - `draft.test.ts`: `a jigsaw lives in classic and puzzles only` (`questionTypesFor`: `classic` і `puzzles` містять, `blitz`/`final`/`board`/`bets` — ні); `a new jigsaw waits for a photo` → `problemJigsawPhoto`; `jigsaw problems point at the question` — `problemJigsawPlace`, `problemJigsawGrid`, `problemJigsawImage`.
  - `JigsawEditor.test.tsx`: `shows the grid for the count` — 4:3 + 12 → «4×3 = 12», повзунок 7 на 16:9 → «4×2 = 8»; `dragging the frame moves the focus` — фото 1000×500 у 1:1, перетягування вправо → `focus.x > 0.5`; `another shape keeps the grid` — нові `tabs` тієї ж довжини; `the timer floor is 25`.
  - `i18n.test.ts` — `ADDED_29C` у всіх 7 мовах; help — нова сторінка в усіх `*.help.json`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/live/jigsaw-shape.test.ts apps/web/src/editor apps/web/src/i18n.test.ts apps/web/src/help`. Expected: FAIL.
- [ ] **Step 3: Implement.** Криві виступу — кубічні Безьє (класична «шийка + голова»), однакові для всіх клієнтів. Приклади в довідці — нейтральні (природа, Україна).
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 apps/web && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 29c jigsaw editor — a photo through the image upload, aspect and piece count with the grid shown, a draggable crop, another shape, the preview switch, texts in seven languages"
```

---

### Задача 7. Веб: телефон — купка, перетягування, обертання, прилипання

**Files:**
- Create: `apps/web/src/live/useJigsaw.ts`, `apps/web/src/live/useJigsaw.test.ts`, `apps/web/src/screens/JigsawView.tsx`, `apps/web/src/screens/JigsawView.test.tsx`
- Modify: `apps/web/src/screens/PlayerScreen.tsx` — гілка `question.type === 'jigsaw'` поряд з `sudoku`/`crossword`; на розкритті — `JigsawReveal`.

**Interfaces:**
- Consumes: `jigsawFits`, `jigsawSides`, `jigsawCrop`, `piecePath`, `piecePad`, `JIGSAW_HOLD_REFRESH_MS`, `PlayerJigsaw`, `PublicJigsaw`, `Send`.
- Produces:
```ts
export function jigsawPile(rows: number, cols: number, seed: number, actorId: string): { piece: number; rot: number }[];
export function useJigsaw(info: PlayerJigsaw, jigsaw: PublicJigsaw, questionIndex: number /* view.questionIndex */, actorId: string, send: Send): {
  placed: ReadonlySet<number>;                    // сервер + оптимістичні
  loose: { piece: number; rot: number; at: { x: number; y: number } | null }[];  // at — у клітинках рамки; null — у купці
  rotate(piece: number): void; grab(piece: number): void; drop(piece: number, at: { x: number; y: number } | null): void;
};
export function JigsawPlay(props: { info: PlayerJigsaw; question: PublicQuestion; questionIndex: number; actorId: string; paused: boolean; timeUp: boolean; send: Send }): JSX.Element;
```

**Телефон:** рамка зверху на всю ширину (на 320 px — до 304 px), «купка» знизу з вертикальною прокруткою (прокрутка — за фон між шматочками, шматочки `touch-action: none`). Тап (рух < 6 px і < 300 мс) — поворот на 90°; перетягування — pointer events; відпустив над рамкою: `jigsawFits` → оптимістично прилип і `player:jigsaw`, інакше лежить, де відпустили (локально); у купці — назад у купку. Помилка `jigsaw_miss`/`jigsaw_stale`/`time_over` — шматочок назад вільний; `jigsaw_placed` — тихо стає прилиплим (поставив товариш); `jigsaw_held` — назад у купку з коротким «тримає товариш»; `too_soon` — повтор за 200 мс. Команди: під час тримання `player:jigsaw-hold` одразу й кожні `JIGSAW_HOLD_REFRESH_MS`; чужі блоки — шматочок притемнений з рамкою кольору товариша, не береться. `preview` — мініатюра готової картинки в куті. Після складання — «Склали за 47,3 с», чекаємо інших.

- [ ] **Step 1: Write the failing tests:**
  - `useJigsaw.test.ts`: `the pile is the same after a reload` — `jigsawPile(3,4,1,'p1')` двічі однаковий, усі 12 шматочків, `rot ∈ 0…3`, хоча б один `rot ≠ 0`; інший `actorId` — інший порядок; `a snapped drop sends the round-local number` — `drop(5, {x:1.1, y:1})` з `rot 0` → `send('player:jigsaw', { questionIndex: 0, piece: 5, x: 1.1, y: 1, rot: 0 })`, `placed` має 5 до ack; `a miss frees the piece` — ack `jigsaw_miss` → 5 знову в `loose`; `a piece placed by a teammate leaves my hand` — `info.placed` з сервера містить 5, поки я тягну → 5 у `placed`, не в `loose`, без помилки; `a held piece refreshes its hold` — fake timers: `grab(3)` у команді → одна `player:jigsaw-hold`, ще одна через 1000 мс, жодної після `drop`.
  - `JigsawView.test.tsx`: `a tap turns a piece` (`data-rot` 0 → 1); `a turned piece does not snap` (drop на місце з `rot 1` — подія не йде); `a teammate's held piece cannot be taken`; `the preview shows only when allowed`; `fits 320 px` (рамка й купка без ширини > 320).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/live/useJigsaw.test.ts apps/web/src/screens/JigsawView.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за зразком `usePuzzleBoard.ts` (ack, офлайн, номер із `view.questionIndex`) і `PuzzleView.tsx`. Шматочки — `<canvas>` розміром ядро + `2·piecePad`, `ctx.clip(new Path2D(piecePath(...)))`, `drawImage` з `jigsawCrop`; фото завантажується один раз (`new Image()`).
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 apps/web && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 29c jigsaw phone — canvas-cut pieces from the photo, a pile below the frame, tap to turn, drag to snap, teammates' holds, the round-local number"
```

---

### Задача 8. Веб: сцена, пульт, розкриття, живі відповіді, історія

**Files:**
- Modify:
  - `apps/web/src/screens/JigsawView.tsx` — `JigsawBoards` (мініатюри), `JigsawThumb`, `JigsawReveal` (фото + таблиця часу);
  - `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/HostScreen.tsx` — гілки поряд з `PuzzleBoards`; пульт показує те саме, що сцена;
  - `apps/web/src/screens/LiveAnswers.tsx` — прогрес `jigsaw` (`placed/total`, ✓);
  - `apps/web/src/pages/GameHistory.tsx` — рядок «склав за … с / не склав · 5 з 12».
- Test: `apps/web/src/screens/JigsawView.test.tsx`, `StageScreen.test.tsx`, `HostScreen.test.tsx`

**Сцена:** сітка мініатюр усіх гравців (команд) за `puzzleGrid`/`puzzlePageSize`/`PUZZLE_PAGE_MS` з `PuzzleView.tsx` (до 24 на 1600×900, далі сторінки); мініатюра — SVG: контур рамки й розрізу, поставлені шматочки — `<image>` фото з `clipPath` (`piecePath`), у командах — тонка рамка кольору учасника (`tones`); нік, відсоток `round(100 × placed / total)`, ✓ і час для тих, хто склав. Після часу: велике справжнє фото й таблиця «місце · нік · час · бали», незавершені — «не склав · N %».

- [ ] **Step 1: Write the failing tests:**
  - `the stage shows every board with its percent` — 3 дошки, у Олі 6 з 12 → «50 %», `clipPath` на 6 шматочків.
  - `the host sees the same boards` — `HostScreen` рендерить `JigsawBoards` з тими самими відсотками.
  - `reveal shows the photo and the time table` — порядок рядків за часом; «не склав» для незавершених; бали.
  - `live answers show pieces and done`.
  - `history shows the time`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens apps/web/src/pages/GameHistory.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 apps/web && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 29c jigsaw stage and host — live thumbnails of every board with percent, the real photo and a time table after time"
```

---

### Задача 9. Наскрізні сценарії й кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts` — нові `it('part 29c: …')` і помічники `jigsaw29c(id, rows, cols, timeLimit)`, `uploadPhoto29c(page)` (згенерований PNG з кольоровими секторами, як `drawnPngs25c` — без реальних фото), `dragPiece29c(page, piece, to)` (pointer/touch), `turnUpright29c(page, piece)` (тапи, доки `data-rot === '0'`).

**Сценарії** (таймери ≥ 25 с; фото — синтетичні градієнти):
1. `it('part 29c: jigsaw after a classic round — upload and crop in the editor, taps turn, drags snap, the fastest gets the maximum, 320 px')`:
   - Редактор: класичний раунд з одним `single` (30 с) → класичний раунд із пазлом: завантажити фото, 4:3, повзунок 12 → «4×3 = 12», зсунути рамку, «Інша форма», підказку ввімкнено; раунд «Головоломки» з пазлом 2×3 і судоку. Перевірити, що в бліц-раунді типу «Пазл» у меню немає. Кадр `jigsaw29c-editor`.
   - Гра, 3 телефони (один 320 px): спершу класичне запитання; далі пазл: Оля складає повністю реальними тапами й перетягуваннями, Тарас — повільніше, Петро ставить 3 шматочки й не встигає. Перевірити: повернутий шматочок на своєму місці не прилипає; бали Олі = 300, Тараса = `round(300 × tОлі / tТараса)` з часу в записі, Петра — 0.
   - Пазл у раунді «Головоломки» після судоку — номер у раунді 1, події проходять.
   - Кадри: `jigsaw29c-phone-320`, `jigsaw29c-phone-preview`, `jigsaw29c-stage` (1600×900), `jigsaw29c-host`, `jigsaw29c-reveal-stage`.
2. `it('part 29c: jigsaw in teams — one shared puzzle, a held piece is locked for two seconds, the stage shows member colours, a restart keeps the pieces')`:
   - 2 команди по 2 учасники; учасник А тримає шматочок — учасник Б не може його взяти (притемнений); через 2 с після відпускання — може.
   - Обидва ставлять різні шматочки → у обох телефонах і на сцені однаково; `restart()` посеред пазла → поставлені на місці, телефони продовжують.
   - Кадри: `jigsaw29c-teams-stage`, `jigsaw29c-teams-phone`.
3. `it('part 29c: jigsaw with 24 players — the stage thumbnails fit 1600×900')` — 24 сокет-гравці ставлять випадкові шматочки; `expectNoSideScroll`, кадр `jigsaw29c-24-stage`.

- [ ] **Step 1: Write the scenarios** за зразком `part 28d` (`socketFrames`, `shot`, `restart`, `expectPhoneFit`, `expectPuzzleStageFits28d`).
- [ ] **Step 2: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 29c"`. Expected: PASS; кадри в `artifacts/shots`.
- [ ] **Step 3: Переглянути кадри**: 320 px без горизонтального скролу; шматочки з виступами й западинами; сцена з мініатюрами й відсотками; розкриття з фото й таблицею часу.
- [ ] **Step 4: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 29c jigsaw — after a classic round, editor upload and crop, taps and drags at 320 px, fastest-time scoring, a shared team puzzle with holds, a restart, 24 thumbnails"
```
