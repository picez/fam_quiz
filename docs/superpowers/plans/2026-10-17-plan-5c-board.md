# План 5c: раунд «Ігрове поле»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** новий тип раунду «ігрове поле» на кшталт «Своєї гри». Поле складається з категорій (від 3 до 8), у кожній від 3 до 10 запитань, і кожне запитання коштує свої бали. Гравці по черзі з ротацією вибирають клітинку, відповідає лише той, хто вибрав. Є клітинки-множники ×2/×3, відповідь на телефоні або вголос, порядок гравців визначає ведучий (кубик, вручну, за приєднанням). Хід відсутнього гравця пропускається через 30 секунд; на паузі відлік стоїть.

**Архітектура:**
- **`shared`.** З'являється `boardRoundSchema` як третій член `roundSchema`, а також допоміжна функція `roundQuestions(round)`. Вона дає всі запитання раунду будь-якого типу, бо в поля немає плаского `questions`.
- **Клітинка = одне запитання.** Ціна клітинки — це `points` самого запитання, id клітинки — id запитання. Категорії можуть мати різну кількість запитань.
- **`engine`.** `GameState` отримує `board: BoardState | null`: коло ходів, лічильник кидків кубика й мить відсутності гравця, чий хід.
- **Новий етап `'board'`:** гравець, чий хід, вибирає клітинку.
- **Зігране запитання поля.** `Play` отримує `board` з клітинкою, автором ходу, ціною, множником клітинки й відповіддю, що чекає на оцінку ведучого.
- **Розподіл коду рушія:**
  - `board-turns.ts` містить чисті допоміжні функції й імпортує з `game.ts` лише типи;
  - `board.ts` містить дії ходу: порядок, кубик, вибір клітинки, пропуск;
  - відповідь, оцінка й таймери живуть у `game.ts`, поряд з наявними гілками класики й бліцу.
- **Оцінка ведучого.** Іде через наявну подію `host:override`: у полі вона дозволена не лише на `reveal`.
- **Нова міграція не потрібна.** Клітинка й автор ходу записуються в наявний jsonb `game.plays`.

**Технології:** TypeScript, zod, vitest, Fastify + Socket.IO, Drizzle (PostgreSQL / PGlite), React + Vite, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-16-rounds-and-rules-design.md`, розділи 4, 7, 9, 10, 11, 12. Рішення власника від 2026-10-20 мають перевагу над специфікацією:
- кількість категорій 3–8, запитань у категорії 3–10, вибирає автор;
- бали дає саме запитання (`points`), спільних цін рядків немає;
- клітинок-ставок немає: ставки лишаються на розсуд ведучого поза грою; позначки клітинки — лише ×2 і ×3;
- у відключеного гравця, чий хід, 30 секунд на повернення; якщо ведучий поставив паузу, відлік стоїть, доки гру не продовжать.

Попередні плани: `2026-10-16-plan-5a-rounds-foundation.md`, `2026-10-17-plan-5b-blitz.md` (виконано).

## Глобальні обмеження

- Класичний раунд, бліц і стара вікторина поводяться точно як зараз. Наявні тести лишаються зеленими без змін очікувань, окрім механічних змін, прямо названих у задачах (новий аргумент `now` у `setConnected`).
- Рушій чистий: без мережі, бази й таймерів. Час (`now`) і генератор випадкових чисел (`rng`) передаються аргументами.
- Зрізи гравця й сцени:
  - не містять правильної відповіді до `reveal`;
  - не містять текстів незіграних запитань поля;
  - не містять позначок клітинок (`x2`/`x3`), поки клітинку не вибрали.
- Бали на полі такі:
  - за правильну або часткову відповідь: `round(points × точність × множник раунду × множник клітинки)` плюс бонус серії;
  - штраф (якщо `penalty: 'minus'`): `−round(points × множник раунду × множник клітинки)`;
  - бонусу за швидкість на полі немає. `timeLimit` запитання діє.
- Рахунок може бути від'ємним.
- Тексти інтерфейсу українською, лише через словник `apps/web/src/i18n.ts`.
- Кожна задача починається з тесту, що падає. Перед комітом зелені `pnpm test` і `pnpm typecheck` для пакетів, які вже переведено (див. «Порядок збирання»).
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (побажання власника: проєкт тестовий).

## Порядок збирання

Новий член `roundSchema` і новий етап `'board'` не знає `apps/web`, тому `apps/web` не проходить typecheck від задачі 1 до задачі 7. Вимоги для комітів:
- задачі 1–5 зелені в `packages/shared` і `packages/engine`;
- задача 1 також в `apps/server`; задачі 2–5 можуть тимчасово ламати лише typecheck `apps/server`, якщо він посилається на змінену сигнатуру `setConnected` (задача 4 це виправляє);
- задача 6 зелена в `apps/server`;
- з задачі 7 зелений увесь `pnpm test` і `pnpm typecheck`.

Задача 7 відповідає й за те, щоб екрани гри компілювалися з новим етапом (ключ `phase_board` у словнику). Повноцінні екрани робить задача 8.

## На що дивитися рецензентові

1. **Гравець, чий хід, закрив вкладку під час вибору клітинки.** Гра не застрягає: через 30 секунд хід переходить до наступного, ротація не збивається, ведучий може пропустити хід раніше. Тест: задача 4, `an absent chooser loses the turn after thirty seconds`.
2. **Ведучий ставить паузу, поки відключений гравець має хід.** На паузі хід не пропадає, скільки б вона не тривала; після продовження в гравця знову 30 секунд. Тест: задача 4, `a pause stops the absence clock`.
3. **Ведучий вилучає гравця, чий зараз хід.** Хід одразу переходить до наступного за порядком, решта кола зберігає порядок. Тест: задача 4, `kicking the chooser passes the turn on`.
4. **Сцена й чужий телефон бачать поле.** Позначки множників невибраних клітинок і тексти незіграних запитань у зріз не потрапляють. Тест: задача 5, `stage and player views never carry hidden marks or cell questions`.
5. **Остання клітинка зіграна при `leaderboard: 'each'`.** Після розкриття раунд закінчується, порожнього вибору клітинки немає. Тест: задача 2, `the round ends after the last cell even with a leaderboard after each question`.

---

### Задача 1: схема ігрового поля

**Files:**
- Modify: `packages/shared/src/quiz.ts`, `packages/shared/src/game.ts`, `packages/shared/src/quiz.test.ts`
- Modify: `packages/engine/src/game.ts` (`nextQuestion`), `packages/engine/src/views.ts` (`total`), `packages/engine/src/testing/fixtures.ts`
- Modify: `apps/server/src/history.ts` (пошук запитання з журналу)

**Interfaces:**
- Produces (shared, `quiz.ts`):
  ```ts
  // LIMITS доповнюється:
  minCategories: 3, maxCategories: 8, minCategoryQuestions: 3, maxCategoryQuestions: 10, categoryTitle: 40,
  export const CELL_MARKS = ['none', 'x2', 'x3'] as const;
  export type CellMark = (typeof CELL_MARKS)[number];
  /** Клітинка — одне запитання; її ціна — question.points, її id — question.id. */
  export const boardCellSchema = z.object({ mark: z.enum(CELL_MARKS), question: questionSchema });
  export const boardCategorySchema = z.object({
    id, title: z.string().trim().min(1).max(LIMITS.categoryTitle) /* + isStorable */,
    cells: z.array(boardCellSchema).min(LIMITS.minCategoryQuestions).max(LIMITS.maxCategoryQuestions),
  });
  export const boardRoundSchema = z.object({
    id, type: z.literal('board'), title,               // як у classicRoundSchema
    shuffleOptions: z.boolean(),
    categories: z.array(boardCategorySchema).min(LIMITS.minCategories).max(LIMITS.maxCategories),
    answerMode: z.enum(['phone', 'voice']),
    /** Лише для answerMode 'phone'; при 'voice' оцінює ведучий завжди. */
    check: z.enum(['auto', 'manual']),
    rules: roundRulesSchema,
  });
  export type BoardCell, BoardCategory, BoardRound = z.infer<...>;
  export const roundSchema = z.discriminatedUnion('type', [classicRoundSchema, blitzRoundSchema, boardRoundSchema]);
  /** Усі запитання раунду: у полі — по категоріях, у порядку клітинок. */
  export function roundQuestions(round: Round): Question[];
  export interface CellRef { categoryIndex: number; index: number; category: BoardCategory; cell: BoardCell }
  export function boardCells(round: BoardRound): CellRef[];            // по категоріях, у порядку клітинок
  export function findCell(round: BoardRound, cellId: string): CellRef | undefined; // cellId — id запитання
  export function boardRoundIssues(round: BoardRound): string[];
  ```
  Через `discriminatedUnion` член із `superRefine` не підходить (zod вимагає `ZodObject`). Тому `boardRoundSchema` лишається `z.object`, а перевірки `boardRoundIssues` додаються в `superRefine` всього `quizSchema` для кожного раунду `type === 'board'`.
- Produces (shared, `game.ts`): `Phase` доповнюється `'board'`. `ErrorCode` доповнюється `'not_your_turn' | 'cell_closed'`.
- Produces (fixtures):
  ```ts
  boardRound(id: string,
             categories: { title: string; cells: (Question | { mark: CellMark; question: Question })[] }[],
             options?: Partial<Omit<BoardRound, 'id' | 'type' | 'categories'>>): BoardRound
  ```
  Типові значення: `title: ''`, `shuffleOptions: false`, `answerMode: 'phone'`, `check: 'auto'`, `rules: DEFAULT_RULES`. Id категорій `c1, c2…`, `mark` за замовчуванням `'none'`. Fixture додає `withId(question, id)` і `withPoints(question, points)`, бо тести збирають поле з однакових запитань. Фікстура схему не перевіряє: тести рушія можуть будувати поле менше за 3×3.

**Правила:**
- `boardRoundIssues` повертає коди:
  - `duplicate_ids`: повтор id категорій у раунді;
  - `too_many_questions`: більше `LIMITS.maxQuestions` запитань у раунді.
- `quizSchema.superRefine` додає ці коди як issue з тим самим `message`.
- `questionsOf(quiz)` = `quiz.rounds.flatMap(roundQuestions)`, тож ліміт 200 і унікальність id запитань (а отже й id клітинок) діють і на поле.
- `nextQuestion` у рушії бере запитання лише для класичного раунду й бліцу; для поля повертає `undefined` (поле відкриває запитання через вибір клітинки, задача 2).
- `views.ts`: `total` береться як `roundQuestions(round).length`.
- `history.ts`: запитання з журналу шукається серед `roundQuestions(quiz.rounds[roundIndex])`.

- [ ] **Step 1: Write the failing tests** у `packages/shared/src/quiz.test.ts`:

```ts
it('a quiz with a board round passes the schema', () => {
  // три категорії: 3, 4 і 10 запитань з різними points; одна клітинка mark 'x2'
  expect(quizSchema.safeParse(quiz).success).toBe(true);
});
it('board limits: 2 or 9 categories, 2 or 11 questions in a category are refused', () => {});
it('an empty category title is refused', () => {});
it('question ids must be unique across board cells', () => {
  // однаковий id запитання в двох категоріях → 'duplicate_question_ids'
});
it('a bet mark is not a cell mark', () => {
  // mark 'bet' → відхиляється
});
it('roundQuestions lists board questions by category in cell order', () => {});
it('questionsOf counts board questions towards the 200 limit', () => {});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/shared/src/quiz.test.ts`
Expected: FAIL (`type: 'board'` відхиляється, `roundQuestions` не існує).

- [ ] **Step 3: Implement** схему, допоміжні функції, коди, фікстуру та три місця в `engine`/`server`, де раніше читали `round.questions` напряму (`roundQuestions` або звуження типу).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages apps/server && pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine && pnpm exec tsc -p apps/server`
Expected: PASS; усі наявні тести зелені без змін.

- [ ] **Step 5: Commit**

```bash
git add packages apps/server
git commit -m "feat(shared): board round schema with categories of priced questions"
```

---

### Задача 2: ходи на полі — порядок, вибір клітинки, кінець раунду

**Files:**
- Create: `packages/engine/src/board-turns.ts`, `packages/engine/src/board.ts`, `packages/engine/src/game.board.test.ts`
- Modify: `packages/engine/src/game.ts`, `packages/engine/src/index.ts`

**Interfaces:**
- Consumes: `BoardRound`, `boardCells`, `findCell`, `CellMark` (задача 1).
- Produces (engine, `game.ts`):
  ```ts
  export interface BoardState {
    /** Порядок поточного кола. */
    circle: string[];
    /** Скільки гравців поточного кола вже походили (вибрали клітинку або пропустили хід). */
    done: number;
    /** Скільки разів у раунді кидали кубик; сцена показує анімацію, коли число змінилося. */
    rolls: number;
    /** Відколи гравець, чий хід, відключений; null — на місці, пауза або не етап board. */
    awaySince: number | null;
  }
  export interface BoardPlay {
    cellId: string;
    /** Хто вибрав клітинку; відповідає лише він. */
    chooserId: string;
    /** points запитання. */
    price: number;
    /** Множник клітинки: x2 → 2, x3 → 3, інакше 1. */
    multiplier: 1 | 2 | 3;
    /** Відповідь з телефону, що чекає на оцінку ведучого (check 'manual'); інакше null. */
    answer: Answer | null;
  }
  // Play отримує board?: BoardPlay; GameState отримує board: BoardState | null (createGame → null).
  export function openQuestion(state: GameState, question: Question, now: number, rng: Rng, board?: BoardPlay): GameState; // тепер експортується
  ```
- Produces (`board-turns.ts`, лише типи з `game.ts`):
  ```ts
  export const BOARD_AWAY_MS = 30_000;
  export function initBoard(state: GameState): BoardState;          // circle — id гравців у порядку приєднання
  export function chooserOf(state: GameState): string | null;       // етап board → circle[done] ?? null; інакше null
  export function advanceTurn(board: BoardState): BoardState;       // done + 1; коло вичерпано → circle зсувається на одного, done 0
  export function cellPlayed(state: GameState, cellId: string): boolean; // за журналом plays поточного раунду
  export function hasActiveCells(state: GameState): boolean;
  export function cellMultiplier(mark: CellMark): 1 | 2 | 3;
  /** Етап вибору клітинки: без таймера запитання, awaySince за підключенням гравця, чий хід. */
  export function enterBoard(state: GameState, now: number): GameState;
  ```
- Produces (`board.ts`):
  ```ts
  export function setOrder(state: GameState, playerIds: string[]): Result;
  export function rollOrder(state: GameState, rng: Rng): Result;
  /** by — id гравця або null, коли вибирає ведучий. */
  export function pickCell(state: GameState, by: string | null, cellId: string, now: number, rng: Rng): Result;
  export function skipTurn(state: GameState, now: number): Result;
  ```

**Правила (рішення плану):**
- **Вхід у раунд поля.** Раунд поля завжди починається з заставки `intro`, навіть якщо він у вікторині єдиний: на заставці ведучий визначає порядок. `start` і перехід `round_end → intro` ставлять `board: round.type === 'board' ? initBoard(state) : null`.
- **Порядок гравців.**
  - `setOrder`: лише етап `intro` раунду поля (`wrong_phase`). Список має бути перестановкою id наявних гравців (`not_found`). Ставить `circle = playerIds`, `done = 0`.
  - `rollOrder`: те саме, але `circle` перемішує `rng` (Фішер — Єйтс, як `shuffle` у `game.ts`), а `rolls + 1`.
- **`next`:**
  - з `intro` раунду поля переходить у `enterBoard(state, now)`;
  - з `reveal` раунду поля: якщо `!hasActiveCells` — `finishRound`; інакше при `leaderboard: 'each'` — `'leaderboard'`, без нього — `enterBoard`;
  - з `leaderboard` раунду поля — `enterBoard`.
- **Ротація.** Кола: A, B, C → B, C, A → C, A, B → A, B, C. `advanceTurn` зсуває `circle` на одного (перший стає останнім), коли `done` дійшов до довжини кола.
- **`pickCell`:**
  - умови: етап `'board'` (`wrong_phase`), не пауза (`paused`), є гравець, чий хід (`no_players`), `by` — це він або `null` (`not_your_turn`), клітинка існує (`not_found`) і ще не зіграна (`cell_closed`);
  - хід зараховується одразу (`advanceTurn`);
  - відкривається запитання клітинки: `openQuestion` з `board: { cellId, chooserId, price: question.points, multiplier: cellMultiplier(mark), answer: null }`.
- **`skipTurn`:** етап `'board'` → `advanceTurn` і `enterBoard`. Інші етапи дають `wrong_phase`, пауза — `paused`.
- `endRound` і `end` дозволені також в етапі `'board'` (`IN_ROUND` доповнюється).

- [ ] **Step 1: Write the failing tests** у `packages/engine/src/game.board.test.ts`. Вікторина: `makeRoundsQuiz([boardRound('g1', [{ title: 'Міста', cells: [c11, c12] }, { title: 'Річки', cells: [c21, c22, c23] }])])`, points 100/200 у «Міста» і 100/200/300 у «Річки» (різна довжина категорій навмисно). Гравці: `lobbyWith(quiz, 'Анна', 'Богдан', 'Віра')` → p1, p2, p3.

```ts
it('a board round always starts with an intro and the join order', () => {
  // start(state, 0) для вікторини з одним раундом поля → phase 'intro', board.circle ['p1','p2','p3']
});
it('the host sets the order or rolls the dice before the round starts', () => {
  // setOrder(['p3','p1','p2']) → circle ['p3','p1','p2']; setOrder(['p1','p2']) → not_found;
  // rollOrder(state, rng) → перестановка тих самих id, rolls 1; після next (етап board) setOrder → wrong_phase
});
it('turns rotate by one after every circle', () => {
  // board 3×3; хто вибирає по черзі, 9 ходів (pickCell → відповідь → next, доки знову не етап board):
  // ['p1','p2','p3','p2','p3','p1','p3','p1','p2']
});
it('only the chooser or the host can pick, and only an unplayed cell', () => {
  // pickCell(state, 'p2', id c11) → not_your_turn; pickCell(state, null, id c11) → ok (за p1), plays.at(-1).board.price 100
  // після розкриття c11 зіграна: pickCell(…, id c11) → cell_closed; 'nope' → not_found
});
it('a cell carries its own question points and mark', () => {
  // c23 { mark: 'x3', points 300 } → board { price: 300, multiplier: 3 }
});
it('skipping a turn passes it on and keeps the rotation', () => {
  // skipTurn в етапі board → вибирає p2; у колі 2 першим іде p2; skipTurn у question → wrong_phase
});
it('the round ends after the last cell even with a leaderboard after each question', () => {
  // leaderboard 'each', поле з однією клітинкою: pick → lock → next (reveal) → next → 'finished' (раунд останній), без етапу board
});
it('the host can end the board round while a player is choosing', () => {
  // два раунди: поле, потім класичний; endRound в етапі board → 'round_end'; next → intro класичного, board null
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/engine/src/game.board.test.ts`
Expected: FAIL (`boardRound`/`pickCell` ще не працюють).

- [ ] **Step 3: Implement** `board-turns.ts`, `board.ts` і гілки поля в `start`, `next`, `endRound`, `end` (`game.ts` імпортує з `board-turns.ts`, а `board.ts` з `game.ts`; циклу немає). Відповідь на запитання поля поки працює як у класиці; її правила дає задача 3.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/shared packages/engine && pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine`
Expected: PASS; наявні тести рушія зелені без змін.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): board turns with rotation, cell picks and skips"
```

---

### Задача 3: відповідь і бали на полі

**Files:**
- Modify: `packages/engine/src/game.ts`, `packages/engine/src/board-turns.ts`
- Test: `packages/engine/src/game.board.test.ts`

**Interfaces:**
- Consumes: усе з задачі 2.
- Produces (`board-turns.ts`):
  ```ts
  /** Бали за оцінку на полі; accuracy вже з урахуванням правил часткових балів. */
  export function boardPoints(round: BoardRound, board: BoardPlay, accuracy: number): number;
  ```

**Правила:**
- **`submitAnswer` у раунді поля:**
  - умови: `answerMode: 'voice'` дає `wrong_phase`; гравець не `play.board.chooserId` — `not_your_turn`; уже є запис або `play.board.answer` — `already_answered`; час минув — `time_over`; тип не збігся — `type_mismatch`;
  - при `check: 'auto'` відповідь оцінюється й записується одразу, після чого запитання закривається (`lockNow`). Точність `checkAnswer` 1 → `correct`. Точність між 0 і 1: при `rules.partial !== null` дає `partial` з цією точністю, інакше `wrong` з точністю 0. Точність 0 → `wrong`;
  - при `check: 'manual'` відповідь кладеться в `play.board.answer`, запис не створюється, запитання закривається.
- **`boardPoints`** = `answerPoints({ points: price, accuracy, speed: 1, multiplier: round.rules.multiplier * board.multiplier, penalty: round.rules.penalty })`.
- **Оцінка ведучого (`override`) у раунді поля:**
  - дозволена в етапах:
    - `'question'`: при `answerMode: 'voice'` завжди; при `'manual'` лише якщо `play.board.answer !== null`; інакше `wrong_phase`;
    - `'locked'` і `'reveal'`;
  - `playerId` має бути `chooserId` (`not_found`);
  - `partial` при `rules.partial === null` дає `partial_disabled`;
  - точність: `correct` 1, `partial` `rules.partial / 100`, `wrong` 0;
  - запис: `answer` — наявного запису, або `play.board.answer`, або `null`; `timeMs` — наявного запису або `now − startedAt` (на `locked`/`reveal`, коли запису ще не було, `timeLimit × 1000`); `overridden: phase === 'reveal'`;
  - оцінка в етапі `'question'` закриває запитання;
  - `override` отримує необов'язковий четвертий аргумент `now?: number`, бо у класиці його не було. Сервер передає його завжди; без нього час рахується як `timeLimit × 1000`.
- **Розкриття без оцінки.** Під час `next` з `locked` у `reveal` у раунді поля гравець, чий хід, без запису (і ще в грі) отримує запис `wrong`. У ньому `answer = play.board.answer`, `timeMs = timeLimit × 1000`, бали `boardPoints(…, 0)`, тобто штраф, якщо він увімкнений. Це також випадок, коли час сплив без відповіді. Далі `withTotals`.
- **Закриття запитання.** `tick` після `endsAt` закриває запитання поля без створення запису. Те саме роблять `lock`, `endRound`, `end`. Запитання, закрите через `endRound`/`end` без оцінки, балів не дає.
- **`autoLock`** у раунді поля нічого не робить: закриття робить сама відповідь.
- **Серії:** у `streakCounts` запитання поля, де гравець не `chooserId`, серію не обриває й не продовжує (`continue`); запис `chooserId` з точністю нижче 1 обриває, правильний продовжує.
- `totalTimeMs` не змінюється: час іде лише за класичні раунди.

- [ ] **Step 1: Write the failing tests** (у `game.board.test.ts`; `single.correctId === 'b'`, `timeLimit: 20`, рахунок перевіряти через `state.players`):

```ts
it('only the chooser answers and a correct answer earns the question points', () => {
  // p1 вибрав c12 (200); submitAnswer(p2, …) → not_your_turn; p1 'b' → phase 'locked', запис 200
});
it('round and cell multipliers multiply, and so does the penalty', () => {
  // rules { multiplier: 2, penalty: 'minus' }, клітинка mark 'x3', points 200: правильно → 1200; у новій грі неправильно → −1200
});
it('partial accuracy pays a share only with partial credit on', () => {
  // order-запитання, точність 0.5, points 200: rules.partial null → wrong, 0; rules.partial 50 → partial, 100
});
it('a missing answer is wrong at the reveal and the penalty applies', () => {
  // penalty minus, c11 (100): tick(endsAt) → locked без запису; next → reveal, запис wrong з answer null, рахунок −100
});
it('without a penalty a wrong answer earns nothing', () => {
  // penalty 'none': неправильно → 0
});
it('voice mode: the host grades during the question, partial included', () => {
  // answerMode 'voice', rules.partial 50: submitAnswer(p1) → wrong_phase; override(state, 'p1', 'partial', t) → locked, 100 з 200
  // override(state, 'p2', 'correct') → not_found
});
it('manual check waits for the host after the phone answer', () => {
  // check 'manual': p1 відповідає → locked, запису немає, play.board.answer є;
  // override(state, 'p1', 'correct') у locked → запис з цією відповіддю, overridden false
});
it('the host can change a board grade at the reveal and points follow', () => {
  // правильно 200 → override(reveal, 'p1', 'wrong') → 0 (без штрафу), overridden true; rules.partial null + 'partial' → partial_disabled
});
it('a board streak counts only the player\'s own turns', () => {
  // streak { length: 2, fixed 300 }; p1 правильно, p2 неправильно, p3 правильно, p1 правильно → у p1 бонус 300 за другий власний хід
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/engine/src/game.board.test.ts`
Expected: FAIL у нових тестах.

- [ ] **Step 3: Implement** за правилами вище.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/engine && pnpm exec tsc -p packages/engine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): board answers, host grading, multipliers and streaks"
```

---

### Задача 4: відсутній гравець, вилучення, пауза й таймер ходу

**Files:**
- Modify: `packages/engine/src/game.ts`, `packages/engine/src/board-turns.ts`, `packages/engine/src/blitz.ts` (`nextDeadline`)
- Modify (механічно, новий аргумент): `packages/engine/src/game.flow.test.ts`, `game.lobby.test.ts`, `game.blitz.test.ts`, `apps/server/src/rooms/manager.ts`
- Test: `packages/engine/src/game.board.test.ts`

**Interfaces:**
- Changes: `setConnected(state: GameState, playerId: string, connected: boolean, now: number): Result`. Наявні виклики в тестах отримують `now` того моменту, який тест уже моделює (або `0`). `manager.ts` передає `this.now()`.

**Правила:**
- `awaySince` діє лише в етапі `'board'` без паузи й стосується гравця, чий хід (`chooserOf`):
  - `enterBoard` і `skipTurn` ставлять `awaySince = гравець підключений ? null : now`;
  - `setConnected` для гравця, чий хід, ставить `null` при підключенні й `now` при відключенні (якщо ще `null`; на паузі нічого не ставить).
- **`tick` в етапі `'board'` без паузи:**
  - якщо гравець, чий хід, відключений, а `awaySince === null`, ставить `awaySince = now`;
  - якщо `awaySince !== null && now >= awaySince + BOARD_AWAY_MS`, пропускає хід, як `skipTurn`;
  - інакше повертає той самий об'єкт.
- **`tick` на паузі** в етапі `'board'` повертає той самий об'єкт: хід не пропадає, скільки б пауза не тривала.
- **`nextDeadline`** в етапі `'board'` без паузи повертає `awaySince + BOARD_AWAY_MS`, якщо воно більше за `now`, інакше `null`; на паузі `null`. Для запитань поля поведінка звичайна (`endsAt`).
- **Пауза.** `pause` дозволена в етапі `'board'` і ставить `awaySince = null`. `pickCell` і `skipTurn` на паузі дають `paused`. `resume` в етапі `'board'` ставить `awaySince = гравець відключений ? now : null`: після паузи відсутній гравець знову має повні 30 секунд.
- **`removePlayer`:**
  - прибирає гравця з `circle`: якщо його індекс менший за `done`, то `done − 1`; якщо `done` дорівнює довжині кола й коло не порожнє, коло зсувається, а `done` стає 0;
  - `awaySince` скидається в `null`: менеджер одразу після вилучення викликає `tick(…, now)`, і той поставить його заново для відключеного наступного гравця;
  - під час запитання поля, де він відповідає, запис просто зникає, запитання доживає до таймера або закриття ведучим.

- [ ] **Step 1: Write the failing tests:**

```ts
it('an absent chooser loses the turn after thirty seconds', () => {
  // етап board, хід p1; setConnected(p1, false, 1000) → awaySince 1000; nextDeadline(state, 1000) === 31000;
  // tick(state, 30999) — той самий об'єкт; tick(state, 31000) → хід p2, awaySince null; у колі 2 першим іде p2
});
it('a chooser who comes back keeps the turn', () => {
  // відключення в 1000, підключення в 5000 → awaySince null; tick(31000) нічого не змінює
});
it('a pause stops the absence clock', () => {
  // відключення в 1000; pause у 20000 → awaySince null, nextDeadline null; tick(10_000_000) — той самий об'єкт;
  // resume у 10_000_000 → awaySince 10_000_000; tick(10_029_999) нічого; tick(10_030_000) пропускає хід
});
it('kicking the chooser passes the turn on', () => {
  // етап board, хід p2 (done 1): removePlayer(p2) → circle ['p1','p3'], chooserOf → 'p3'
});
it('kicking a player who already moved keeps the rest of the circle', () => {
  // done 2 (p1, p2 походили), хід p3: removePlayer(p1) → circle ['p2','p3'], done 1, chooserOf 'p3'
});
it('a disconnected next chooser after a kick gets the absence clock from tick', () => {
  // p3 відключений; вилучення p2, чий хід → awaySince null; tick(state, 7000) → awaySince 7000
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/engine/src/game.board.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** за правилами вище; механічно додати `now` у наявні виклики `setConnected`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/engine apps/server && pnpm exec tsc -p packages/engine && pnpm exec tsc -p apps/server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine apps/server/src/rooms/manager.ts
git commit -m "feat(engine): absent choosers lose the turn, pauses stop the clock"
```

---

### Задача 5: зрізи стану для поля

**Files:**
- Modify: `packages/shared/src/views.ts`, `packages/engine/src/views.ts`
- Test: `packages/engine/src/views.test.ts`

**Interfaces:**
- Produces (shared):
  ```ts
  export interface BoardCellView {
    id: string;
    price: number;
    played: boolean;
    /** null — позначку приховано (сцена й гравці, поки клітинку не вибрали). */
    mark: CellMark | null;
  }
  export interface BoardInfo {
    categories: { id: string; title: string; cells: BoardCellView[] }[];
    /** Порядок поточного кола. */
    order: BlitzPlayer[];
    /** Чий хід: хто вибирає (board) або відповідає (question…reveal). */
    turn: BlitzPlayer | null;
    /** Вибрана клітинка поточного запитання; її позначку видно всім. */
    cell: { id: string; category: string; price: number; mark: CellMark } | null;
    answerMode: 'phone' | 'voice';
    rolls: number;
    /** Мить автоматичного пропуску ходу відсутнього гравця; null — гравець на місці або пауза. */
    skipAt: number | null;
  }
  export interface HostBoard extends BoardInfo {
    manual: boolean;          // answerMode 'voice' або check 'manual'
    /** Відповідь з телефону, що чекає на оцінку. */
    answer: Answer | null;
  }
  // BaseView: board: BoardInfo | null — у раунді поля в етапах intro, board, question, locked, reveal, leaderboard; інакше null
  // HostView: board: HostBoard | null (позначки всіх клітинок видно завжди)
  ```

**Правила:**
- `BETWEEN_QUESTIONS` доповнюється `'board'`: у ньому `question === null`.
- `PlayerView.me.answer` для `chooserId`: запис, інакше `play.board.answer`.
- Позначка клітинки видима сцені й гравцям, якщо клітинку вже зіграно або вона зараз вибрана (поточне запитання).
- `turn` в етапі `board` — це `chooserOf`, а в етапах запитання — `play.board.chooserId`.

- [ ] **Step 1: Write the failing tests:**

```ts
it('stage and player views never carry hidden marks or cell questions', () => {
  // c12 'x2', c23 'x3', ніхто не вибирав: JSON.stringify(stageView) і playerView(p2) не містять 'x2', 'x3',
  // текстів запитань клітинок і 'correctId'; усі mark === null; hostView.board.categories[0].cells[1].mark === 'x2'
});
it('a chosen cell shows its mark to everyone and stays shown', () => {
  // p1 вибрав c12 (x2) → stageView.board.cell { mark: 'x2', price: 200 }; після розкриття c12 у stageView має mark 'x2', played true
});
it('the board view shows the order, whose turn it is and categories of different length', () => {
  // order nicknames ['Анна','Богдан','Віра'], turn 'Анна'; cells.length [2, 3]; ціни [100,200] і [100,200,300]
});
it('the host sees a phone answer waiting for a grade', () => {
  // check manual: hostView.board.manual true, board.answer — відповідь p1; playerView(p1).me.answer та сама
});
it('the absent chooser has a skip time that a pause removes', () => {
  // setConnected(p1, false, 1000) → stageView.board.skipAt 31000; після pause → null
});
it('classic and blitz views carry no board data', () => {});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/engine/src/views.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** типи й функції зрізів.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/shared packages/engine && pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared packages/engine
git commit -m "feat(engine): board, turn order and hidden marks in role views"
```

---

### Задача 6: сервер — події поля, запис клітинок, історія

**Files:**
- Modify: `packages/shared/src/events.ts`, `packages/shared/src/history.ts`, `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`, `apps/server/src/recorder.ts`, `apps/server/src/history.ts`, `apps/server/src/db/schema.ts` (лише тип `PlayRef`)
- Test: `apps/server/src/rooms/manager.test.ts`, `apps/server/src/socket.test.ts`, `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts`

**Interfaces:**
- Produces (shared `events.ts`):
  ```ts
  export const pickSchema = z.object({ cellId: z.string().min(1).max(64) });
  export const orderSchema = z.object({ playerIds: z.array(playerId).max(LIMITS.maxPlayers) });
  // ClientToServerEvents:
  'player:pick': (payload: z.infer<typeof pickSchema>, ack: Ack) => void;
  'host:pick': (payload: z.infer<typeof pickSchema>, ack: Ack) => void;
  'host:order': (payload: z.infer<typeof orderSchema>, ack: Ack) => void;
  'host:roll': (ack: Ack) => void;
  'host:skip': (ack: Ack) => void;
  ```
- Produces (manager): `pick(room, playerId, cellId): AckResult`. `HostAction` доповнюється `{ type: 'roll' | 'skip' }`, `{ type: 'pick'; cellId: string }`, `{ type: 'order'; playerIds: string[] }`. `override` у менеджері передає `this.now()`.
- Produces (`PlayRef`): `{ roundIndex; questionId; cell?: { cellId: string; chooserId: string } }`.
- Produces (shared `history.ts`): `GameQuestionResult.cell: { category: string; price: number; multiplier: 1 | 2 | 3; chooser: string | null; points: number | null } | null`.

**Правила:**
- `pick` і `roll` використовують `this.rng`. `'roll'` і `'skip'` додаються до `SIMPLE_HOST_ACTIONS` у сокеті.
- Таймер ходу відсутнього гравця планує наявний `reschedule` через `nextDeadline` (задача 4). Після вилучення, паузи й продовження менеджер уже викликає `reschedule`; тест це підтверджує.
- Recorder:
  - запитання поля пише один рядок `answer` з `attempt: 0`, як класика;
  - `progress.plays` для запитання поля містить `cell` з `play.board`;
  - запис, створений на розкритті, змінює підпис через оцінки останнього закритого запитання. Наявний механізм уже перезаписує це запитання, тож нічого додавати не треба (тест це підтверджує).
- Історія для запитання з `cell`:
  - `category`, `price` і `multiplier` беруться зі знімка через `findCell`;
  - `chooser` — нікнейм учасника з `chooserId` або `null`, якщо його вилучили;
  - `points` — сума `answer.points` цього учасника на запитання, або `null`, якщо рядка немає;
  - для інших запитань `cell: null`.

- [ ] **Step 1: Write the failing tests:**

```ts
// manager.test.ts
it('an absent chooser is skipped by the room timer after thirty seconds', () => {
  // фейковий планувальник; раунд поля; host order → next; гравець p1 відключається → таймер на +30000;
  // прокрутити → хід p2
});
it('a paused room keeps the absent chooser turn', () => {
  // p1 відключився; host pause → таймер ходу знято; прокрутити 10 хв → хід p1; resume → таймер на +30000
});
it('board actions go through the manager', () => {
  // host roll → board.rolls 1; host order; next; pick гравцем → question; host skip у наступному ході
});
// socket.test.ts
it('board events are accepted only from their roles and with valid payloads', () => {
  // ведучий шле player:pick → forbidden; гравець шле host:skip → forbidden;
  // player:pick { cellId: '' } → invalid_payload; host:order { playerIds: 'x' } → invalid_payload
});
// recorder.test.ts
it('a board question is stored with its cell and chooser', () => {
  // клітинка x2 з points 100, правильно → game.plays[0].cell { cellId, chooserId: p1 }, рядок answer points 200
});
it('a grade given at the reveal of a board question is saved', () => {
  // час сплив без відповіді (penalty minus) → після reveal рядок accepted false, points −100
});
// history.test.ts
it('history shows board questions by cell with the chooser and points', () => {
  // questions[0].cell { category: 'Міста', price: 100, multiplier: 1, chooser: 'Анна', points: 100 }; класичне запитання cell null
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/server`
Expected: FAIL у нових тестах.

- [ ] **Step 3: Implement** події, менеджер, сокет, recorder та історію за правилами вище.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages apps/server && pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine && pnpm exec tsc -p apps/server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/server
git commit -m "feat(server): board events, turn timer and cells in game history"
```

---

### Задача 7: редактор — раунд «Ігрове поле»

**Files:**
- Create: `apps/web/src/editor/BoardEditor.tsx`
- Modify: `apps/web/src/editor/draft.ts`, `draft-storage.ts`, `RoundSettings.tsx`, `RoundStrip.tsx`, `QuizEditor.tsx`, `apps/web/src/format.ts`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Modify (лише щоб компілювалося з новим етапом): `apps/web/src/screens/HostScreen.tsx`, `PlayerScreen.tsx`, `StageScreen.tsx`
- Test: `apps/web/src/editor/draft.test.ts`, `apps/web/src/editor/QuizEditor.test.tsx`

**Interfaces:**
- Consumes: `BoardRound`, `CELL_MARKS`, `boardRoundIssues`, `roundQuestions`, `LIMITS.*Categor*` (задача 1).
- Produces:
  ```ts
  // draft.ts
  export function newBoardRound(): BoardRound;  // 3 категорії з порожніми назвами, у кожній 3 порожні single-запитання
                                                // з points 100, 200, 300; mark 'none'; answerMode 'phone', check 'auto',
                                                // rules defaultRules(), shuffleOptions false
  export function newBoardQuestion(after: Question | undefined): Question; // порожнє single; points = after.points + 100 (не більше maxPoints), без after — 100
  export interface ProblemPlace { round: number; question: number; cell: { category: number; index: number } | null }
  export function firstProblem(quiz: Quiz): ProblemPlace | null;   // було { round, question }
  // BoardEditor: { round: BoardRound; onChange: (next: BoardRound) => void; focus?: { category: number; index: number } | null }
  ```

**Правила:**
- **Вибір типу раунду.** «+ Раунд» пропонує третю кнопку «Ігрове поле». `roundLabel` для безіменного поля дає «Ігрове поле».
- **Ліва колонка.** Для раунду поля `QuizEditor` показує назву й налаштування вікторини, а список запитань, навігацію й «+ Запитання» ховає. Праву частину займає `BoardEditor`.
- **`BoardEditor`, поле:**
  - стовпці — категорії; угорі поле назви категорії й кнопка «Прибрати категорію» (якщо категорій більше 3);
  - під назвою — клітинки категорії згори вниз: кнопка з балами запитання й позначкою (`×2`, `×3`), вибрана виділена;
  - під клітинками — «+ Запитання» (до 10 у категорії; `newBoardQuestion` від останньої клітинки);
  - збоку — «+ Категорія» (до 8; нова категорія — 3 запитання 100, 200, 300);
  - стовпці можуть мати різну висоту; на вузькому екрані поле прокручується всередині своєї рамки, не вся сторінка.
- **`BoardEditor`, панель вибраної клітинки:**
  - select «Позначка»: «Без позначки», «×2», «×3»;
  - `QuestionEditor` вибраного запитання, як у класиці (бали й час видно);
  - «Прибрати запитання» (якщо в категорії більше 3) і кнопки «↑»/«↓» для порядку в категорії.
- **Налаштування поля** (`RoundSettings` для `type === 'board'`): назва; перемішування варіантів; «Спосіб відповіді» (select: «На телефоні», «Вголос»); «Перевірка» (лише для телефону; «Автоматично», «Ведучий»); штраф; «частково» з часткою; серії; множник. Бали за швидкість не показуються.
- **Перевірка й чернетки:**
  - `cleaned` обрізає назви категорій і чистить запитання клітинок;
  - `problemsOf` для поля повідомляє: порожню назву категорії («Категорія N: немає назви»); проблеми запитань з місцем «Категорія N, запитання K: …»; коди `boardRoundIssues`;
  - `firstProblem` повертає й клітинку, і `QuizEditor` відкриває її;
  - `loadDraft` відновлює раунд поля: `numberOr` для полів запитань клітинок, `mark` поза `CELL_MARKS` стає `'none'`, без полів класичного раунду;
  - підтвердження видалення раунду рахує `roundQuestions`.
- **Екрани гри в цій задачі** лише компілюються: ключ `phase_board` у словнику, решта — у задачі 8.

- [ ] **Step 1: Write the failing tests:**

```ts
// draft.test.ts
it('newBoardRound is a 3 by 3 board that passes the schema once filled', () => {
  // categories.length 3, у кожній points [100,200,300]; заповнити назви й запитання → roundSchema.safeParse success
});
it('newBoardQuestion continues the points and stops at the maximum', () => {
  // після 300 → 400; після 2000 → 2000; без попереднього → 100
});
it('a saved board draft comes back unchanged', () => {});
it('problemsOf names the category and question of a broken board cell', () => {
  // порожній текст у категорії 2, запитання 3 → повідомлення містить 'Категорія 2' і 'запитання 3'
});
it('firstProblem points at the board cell', () => {
  // → { round: 1, question: 5, cell: { category: 1, index: 2 } }   (question — індекс у roundQuestions)
});
// QuizEditor.test.tsx
it('adds a board round, edits points and marks, and saves', async () => {
  // «+ Раунд» → «Ігрове поле»; назви категорій; у першій категорії «+ Запитання» → 4 клітинки, нова з 400;
  // клітинка 2 першої категорії → «×2», бали 250; заповнити решту; зберегти →
  // onSave отримує rounds[1] type 'board', categories[0].cells.length 4, cells[1] { mark 'x2', question.points 250 }
});
it('board limits show in the editor', async () => {
  // «Прибрати категорію» немає при 3 категоріях; після 5 «+ Категорія» (8) кнопки «+ Категорія» немає;
  // «+ Запитання» зникає на 10 клітинках, «Прибрати запитання» немає на 3
});
it('board settings offer answer mode and hide the check for voice', async () => {
  // «Вголос» → немає select t('blitzCheck'); немає чекбокса t('speedBonus')
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/web/src/editor`
Expected: FAIL.

- [ ] **Step 3: Implement** за правилами вище; тексти додати в `i18n.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: PASS (від цієї задачі зелений увесь репозиторій).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): board rounds in the quiz editor"
```

---

### Задача 8: гра — пульт, телефон, сцена й історія для поля

**Files:**
- Create: `apps/web/src/screens/Board.tsx` (спільне поле для трьох екранів)
- Modify: `apps/web/src/screens/HostScreen.tsx`, `PlayerScreen.tsx`, `StageScreen.tsx`, `apps/web/src/pages/GameHistory.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/HostScreen.test.tsx`, `PlayerScreen.test.tsx`, `StageScreen.test.tsx`, тест `GameHistory` (там, де він уже є)

**Interfaces:**
- Consumes: `view.board`, `HostView.board` (задача 5); події задачі 6.
- Produces:
  ```ts
  // Board.tsx
  export function Board(props: { board: BoardInfo; onPick?: (cellId: string) => void }): JSX.Element;
  ```
  Стовпці — категорії з назвою вгорі, клітинки згори вниз з ціною; стовпці можуть мати різну висоту. Зіграна клітинка порожня й неактивна. Відома позначка — `×2` / `×3`. З `onPick` незіграні клітинки стають кнопками з `aria-label` «{категорія}, {ціна}».

**Правила:**
- **Пульт:**
  - **intro раунду поля:** панель «Порядок ходів» зі списком гравців і кнопками ↑/↓ (`host:order` з новим списком), кнопки «Кинути кубик» (`host:roll`) і «За порядком приєднання» (`host:order` з гравцями в порядку `view.players`);
  - **етап `board`:** `Board` з `onPick` (`host:pick`), рядок «Вибирає {name}», кнопка «Пропустити хід» (`host:skip`). Якщо гравець відключений: «{name} відключений, хід пропуститься через {N} с» (відлік до `skipAt`), а на паузі — «{name} відключений, гра на паузі, хід чекає»;
  - **запитання поля:** рядок «Відповідає {name}» і позначка ×2/×3, якщо є. Панель відповіді показує `board.answer` або відповідь із `responses`. Кнопки «Зарахувати» / «Частково» (якщо `round.partial`) / «Не зараховувати» (`host:override` з `chooserId`) видно:
    - в етапі `question`, якщо `board.manual` і (`answerMode === 'voice'` або `board.answer !== null`);
    - в етапах `locked` і `reveal` — для будь-якого типу запитання;
  - лічильник «відповіли N з M» у полі не показується;
  - наявна кнопка «Пауза» працює й в етапі `board`.
- **Телефон:**
  - **`board`:** гравцю, чий хід, — «Ваш хід: виберіть клітинку» і `Board` з `onPick` (`player:pick`); іншим — «Вибирає {name}» і `Board` без `onPick`;
  - **запитання:** гравцю, чий хід, при `answerMode: 'phone'` — `AnswerInput`, при `'voice'` — «Відповідайте вголос»; іншим — «Відповідає {name}»;
  - **`reveal`:** для гравця, чий хід, результат як зараз; інші бачать «Відповідав {name}» і правильну відповідь.
- **Сцена:**
  - **intro раунду поля:** порядок гравців; коли `rolls` змінилося, 1,5 с анімації кубика (CSS-клас `is-rolling` на кубику з гранями ⚀–⚅), потім порядок;
  - **`board`:** `Board`, порядок із позначкою того, чий хід, і «Вибирає {name}»;
  - **запитання поля:** над запитанням «{категорія} · {ціна}», «Відповідає {name}» і позначка ×2/×3.
- **Історія гри:** запитання з `cell` показує «{категорія} · {ціна}» (і «×2»/«×3», якщо множник більше 1) та «{chooser}: {signed(points)}». Якщо `chooser === null`, показується «гравця вилучено».
- Помилки `not_your_turn`, `cell_closed` мають тексти в `i18n.ts`.

- [ ] **Step 1: Write the failing tests:**

```ts
// HostScreen.test.tsx
it('sets the board order with arrows, dice and join order', async () => {
  // intro раунду поля: клік «↓» біля першого → send('host:order', { playerIds: [p2, p1, p3] }); «Кинути кубик» → 'host:roll'
});
it('picks a cell for the chooser and skips a turn', async () => {
  // етап board: клік «Міста, 100» → send('host:pick', { cellId }); «Пропустити хід» → 'host:skip'
});
it('shows the countdown for an absent chooser and a waiting turn on pause', () => {
  // skipAt через 20 с → «пропуститься через 20 с»; paused, skipAt null → «гра на паузі, хід чекає»
});
it('grades a voice answer during the question', async () => {
  // answerMode voice, manual true: «Зарахувати» → send('host:override', { playerId: 'p1', grade: 'correct' })
});
// PlayerScreen.test.tsx
it('lets the chooser pick a cell and others wait', async () => {
  // turn = me → клік клітинки → send('player:pick', { cellId }); turn = інший → «Вибирає Анна», клітинки не кнопки
});
it('only the chooser gets the answer input', () => {
  // turn інший → «Відповідає Анна», немає поля відповіді; voice і turn = me → «Відповідайте вголос»
});
// StageScreen.test.tsx
it('shows the board with hidden marks, played cells and whose turn it is', () => {});
it('rolls the dice when the roll counter changes', () => {
  // rerender з rolls 1 → елемент з класом is-rolling
});
// GameHistory test
it('shows a board question with its cell, chooser and points', () => {
  // 'Міста · 100', 'Анна: +100'
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/web/src/screens apps/web/src/pages`
Expected: FAIL.

- [ ] **Step 3: Implement** екрани за правилами вище у візуальному напрямі «Нічний ефір» (наявні класи `panel`, `rows`, `tag`, `btn`). Поле на телефоні вміщається за шириною (до 8 вузьких стовпців, менший шрифт), сторінка не прокручується горизонтально.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): board, turns and grading on host, phone and stage"
```

---

### Задача 9: наскрізний сценарій поля

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе попереднє; допоміжні функції наявних сценаріїв у тому самому файлі.

- [ ] **Step 1: Write the scenario** `it('a board round: order, a doubled cell and an early end', …)`.

Підготовка в редакторі:
- ведучий створює вікторину з одним раундом поля: «+ Раунд» → «Ігрове поле», потім вибирає перший, класичний раунд і видаляє його;
- поле лишається 3×3 (як створює редактор): категорії «Міста», «Річки», «Гори», бали 100, 200, 300;
- клітинка «Міста, 200» має позначку «×2»;
- усі дев'ять клітинок — запитання з одним правильним варіантом;
- спосіб відповіді «На телефоні», перевірка автоматична, штрафу немає.

Двоє гравців: A приєднується першим, B — другим.

Хід гри:
1. На заставці ведучий тисне «Кинути кубик» (сцена показує кубик), потім «За порядком приєднання» і «Почати раунд».
2. A вибирає «Міста, 100» і відповідає правильно → +100.
3. B вибирає «Міста, 200» (×2) і відповідає правильно → +400.
4. Коло 2 починає B: «Річки, 100», відповідає неправильно → 0.
5. Хід A: ведучий завершує гру.

Очікування:
- на подіумі B 400, A 100 (точні числа);
- історія показує три зіграні запитання з клітинками «Міста · 100», «Міста · 200 ×2», «Річки · 100» і балами.

- [ ] **Step 2: Run it**

Run: `pnpm e2e`
Expected: PASS усіх сценаріїв (наявні й новий).

- [ ] **Step 3: Commit**

```bash
git add apps/server/e2e
git commit -m "test: board round end-to-end"
```

Після фінальної рецензії гілки злити в `main`, запустити `pnpm test` і `git push origin main`. Render розгорне сам; міграцій у цьому плані немає.
