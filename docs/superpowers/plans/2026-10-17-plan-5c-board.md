# План 5c: раунд «Ігрове поле»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** новий тип раунду «ігрове поле» на кшталт «Своєї гри». Поле складається з категорій і цін, у клітинках є запитання або їх пул. Гравці по черзі з ротацією вибирають клітинку, відповідає лише той, хто вибрав. Є клітинки-ставки й множники ×2/×3, відповідь на телефоні або вголос, порядок гравців визначає ведучий (кубик, вручну, за приєднанням). Хід відсутнього гравця пропускається через 2 хвилини.

**Архітектура:**
- **`shared`.** З'являється `boardRoundSchema` як третій член `roundSchema`, а також допоміжна функція `roundQuestions(round)`. Вона дає всі запитання раунду будь-якого типу, бо в поля немає плаского `questions`.
- **`engine`.** `GameState` отримує `board: BoardState | null`, де зберігаються коло ходів, лічильник кидків кубика, вибрана клітинка-ставка й мить відсутності гравця, чий хід.
- **Нові етапи.** `'board'`: гравець, чий хід, вибирає клітинку. `'wager'`: він робить ставку.
- **Зігране запитання поля.** `Play` отримує `board` з клітинкою, автором ходу, ціною, множником клітинки, ставкою й відповіддю, що чекає на оцінку ведучого.
- **Розподіл коду рушія:**
  - `board-turns.ts` містить чисті допоміжні функції й імпортує з `game.ts` лише типи;
  - `board.ts` містить дії ходу: порядок, кубик, вибір клітинки, ставку, пропуск;
  - відповідь, оцінка й таймери живуть у `game.ts`, поряд з наявними гілками класики й бліцу.
- **Оцінка ведучого.** Іде через наявну подію `host:override`: у полі вона дозволена не лише на `reveal`.
- **Нова міграція не потрібна.** Клітинка, автор ходу й ставка записуються в наявний jsonb `game.plays`.

**Технології:** TypeScript, zod, vitest, Fastify + Socket.IO, Drizzle (PostgreSQL / PGlite), React + Vite, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-16-rounds-and-rules-design.md`, розділи 4, 7, 9, 10, 11, 12.
Попередні плани: `2026-10-16-plan-5a-rounds-foundation.md`, `2026-10-17-plan-5b-blitz.md` (виконано).

## Глобальні обмеження

- Класичний раунд, бліц і стара вікторина поводяться точно як зараз. Наявні тести лишаються зеленими без змін очікувань, окрім механічних змін, прямо названих у задачах (новий аргумент `now` у `setConnected`).
- Рушій чистий: без мережі, бази й таймерів. Час (`now`) і генератор випадкових чисел (`rng`) передаються аргументами.
- Зрізи гравця й сцени:
  - не містять правильної відповіді до `reveal`;
  - не містять запитань клітинок (лише кількість незіграних);
  - не містять позначок клітинок (`bet`/`x2`/`x3`), поки клітинку ні разу не вибрали.
- Бали на полі такі:
  - за звичайну клітинку: `round(ціна × точність × множник раунду × множник клітинки)` плюс бонус серії;
  - штраф (якщо `penalty: 'minus'`): `−round(ціна × множник раунду × множник клітинки)`;
  - клітинка-ставка дає `+ставка` або `−ставка`, без множників, часткових балів і бонусу серії.
- Власне поле `points` запитання на полі не діє, ціну дає рядок поля. `timeLimit` запитання діє.
- Рахунок може бути від'ємним.
- Тексти інтерфейсу українською, лише через словник `apps/web/src/i18n.ts`.
- Кожна задача починається з тесту, що падає. Перед комітом зелені `pnpm test` і `pnpm typecheck` для пакетів, які вже переведено (див. «Порядок збирання»).
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (побажання власника: проєкт тестовий).

## Порядок збирання

Новий член `roundSchema` і нові етапи `'board'`/`'wager'` не знає `apps/web`, тому `apps/web` не проходить typecheck від задачі 1 до задачі 7. Вимоги для комітів:
- задачі 1–5 зелені в `packages/shared` і `packages/engine`;
- задача 1 також в `apps/server`; задачі 2–5 можуть тимчасово ламати лише typecheck `apps/server`, якщо він посилається на змінену сигнатуру `setConnected` (задача 4 це виправляє);
- задача 6 зелена в `apps/server`;
- з задачі 7 зелений увесь `pnpm test` і `pnpm typecheck`.

Задача 7 відповідає й за те, щоб екрани гри компілювалися з новими етапами (ключі `phase_board`, `phase_wager` у словнику). Повноцінні екрани робить задача 8.

## На що дивитися рецензентові

1. **Гравець, чий хід, закрив вкладку під час вибору клітинки.** Гра не застрягає: через 2 хвилини хід переходить до наступного, ротація не збивається, ведучий може пропустити хід раніше. Тест: задача 4, `an absent chooser loses the turn after two minutes`.
2. **Ведучий вилучає гравця, чий зараз хід (вибір клітинки або ставка).** Хід одразу переходить до наступного за порядком, решта кола зберігає порядок. Тест: задача 4, `kicking the chooser passes the turn on`.
3. **Сцена й чужий телефон бачать поле.** Позначки ставки й множника прихованих клітинок і тексти запитань пулу в зріз не потрапляють. Тест: задача 5, `stage and player views never carry hidden marks or cell questions`.
4. **Ставка гравця з від'ємним рахунком.** Межі ставки від найменшої ціни до найбільшої ціни на полі. Більша ставка відхиляється, гра не падає. Тест: задача 2, `the wager range uses the board prices when the score is low`.
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
  maxCategories: 6, maxBoardRows: 10, maxCellQuestions: 10, categoryTitle: 40,
  export const CELL_MARKS = ['none', 'bet', 'x2', 'x3'] as const;
  export type CellMark = (typeof CELL_MARKS)[number];
  export const DEFAULT_BOARD_PRICES = [100, 200, 300, 400, 500];
  export const boardCellSchema = z.object({ id, mark: z.enum(CELL_MARKS), questions: z.array(questionSchema).min(1).max(LIMITS.maxCellQuestions) });
  export const boardCategorySchema = z.object({ id, title: z.string().trim().min(1).max(LIMITS.categoryTitle) /* + isStorable */, cells: z.array(boardCellSchema) });
  export const boardRoundSchema = z.object({
    id, type: z.literal('board'), title,               // як у classicRoundSchema
    shuffleOptions: z.boolean(),
    /** Ціни рядків згори вниз; клітинка рядка коштує стільки ж. */
    prices: z.array(z.number().int().min(0).max(LIMITS.maxPoints)).min(1).max(LIMITS.maxBoardRows),
    categories: z.array(boardCategorySchema).min(1).max(LIMITS.maxCategories),
    answerMode: z.enum(['phone', 'voice']),
    /** Лише для answerMode 'phone'; при 'voice' оцінює ведучий завжди. */
    check: z.enum(['auto', 'manual']),
    rules: roundRulesSchema,
  }).superRefine(...);  // див. правила
  export type BoardCell, BoardCategory, BoardRound = z.infer<...>;
  export const roundSchema = z.discriminatedUnion('type', [classicRoundSchema, blitzRoundSchema, boardRoundSchema]);
  /** Усі запитання раунду: у полі — з усіх клітинок, по категоріях, згори вниз. */
  export function roundQuestions(round: Round): Question[];
  export interface CellRef { categoryIndex: number; row: number; category: BoardCategory; cell: BoardCell; price: number }
  export function boardCells(round: BoardRound): CellRef[];            // по категоріях, згори вниз
  export function findCell(round: BoardRound, cellId: string): CellRef | undefined;
  ```
  Через `discriminatedUnion` член `boardRoundSchema` із `superRefine` не підходить (zod вимагає `ZodObject`). Тому перевірки поля роблять так: `boardRoundSchema` лишається `z.object`, а перевірки переносяться в `superRefine` всього `quizSchema` для кожного раунду `type === 'board'`. Окремо експортується `boardRoundIssues(round: BoardRound): string[]` для редактора й тестів.
- Produces (shared, `game.ts`): `Phase` доповнюється `'board' | 'wager'`. `ErrorCode` доповнюється `'not_your_turn' | 'cell_closed' | 'wager_invalid'`.
- Produces (fixtures):
  ```ts
  boardRound(id: string, categories: { title: string; cells: { mark?: CellMark; questions: Question[] }[] }[],
             options?: Partial<Omit<BoardRound, 'id' | 'type' | 'categories'>>): BoardRound
  ```
  Типові значення: `title: ''`, `shuffleOptions: false`, `prices: [100, 200, …]` за кількістю клітинок першої категорії, `answerMode: 'phone'`, `check: 'auto'`, `rules: DEFAULT_RULES`. Id категорій `c1, c2…`, id клітинок `${categoryId}-${row + 1}` (наприклад `c1-2`), `mark` за замовчуванням `'none'`. Запитання з однаковими id у різних клітинках тест мусить перейменувати сам; fixture додає `withId(question, id)`.

**Правила:**
- `boardRoundIssues` повертає коди:
  - `cells_mismatch`: кількість клітинок категорії не дорівнює кількості цін;
  - `duplicate_ids`: повтор id категорій або клітинок у раунді;
  - `too_many_questions`: більше `LIMITS.maxQuestions` запитань у раунді.
- `quizSchema.superRefine` додає ці коди як issue з тим самим `message`.
- `questionsOf(quiz)` = `quiz.rounds.flatMap(roundQuestions)`, тож ліміт 200 і унікальність id запитань діють і на поле.
- `nextQuestion` у рушії бере запитання лише для класичного раунду й бліцу; для поля повертає `undefined` (поле відкриває запитання через вибір клітинки, задача 2).
- `views.ts`: `total` береться як `roundQuestions(round).length`.
- `history.ts`: запитання з журналу шукається серед `roundQuestions(quiz.rounds[roundIndex])`.

- [ ] **Step 1: Write the failing tests** у `packages/shared/src/quiz.test.ts`:

```ts
it('a quiz with a board round passes the schema', () => {
  // раунд: prices [100, 200], дві категорії по дві клітинки, у клітинці c1-2 пул із двох запитань, c2-1 mark 'bet'
  expect(quizSchema.safeParse(quiz).success).toBe(true);
});
it('a board category with a wrong number of cells is refused', () => {
  // prices [100, 200], у c2 одна клітинка → issue 'cells_mismatch'
});
it('board limits: 7 categories, 11 rows, 11 questions in a cell and price 2001 are refused', () => {});
it('an empty category title is refused', () => {});
it('question ids must be unique across board cells', () => {
  // однаковий id запитання в c1-1 і c2-1 → 'duplicate_question_ids'
});
it('roundQuestions lists board questions by category, top to bottom', () => {
  // ids у порядку c1-1, c1-2 (обидва з пулу), c2-1, c2-2
});
it('questionsOf counts board questions towards the 200 limit', () => {});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/shared/src/quiz.test.ts`
Expected: FAIL (`type: 'board'` відхиляється, `roundQuestions` не існує).

- [ ] **Step 3: Implement** схему, допоміжні функції, коди, фікстуру та три місця в `engine`/`server`, де раніше читали `round.questions` напряму. Щоб це скомпілювалося, у `game.ts`, `views.ts` і `history.ts` досить звузити тип (`round.type === 'board' ? … : round.questions`) або викликати `roundQuestions`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages apps/server && pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine && pnpm exec tsc -p apps/server`
Expected: PASS; усі наявні тести зелені без змін.

- [ ] **Step 5: Commit**

```bash
git add packages apps/server
git commit -m "feat(shared): board round schema with categories, prices and cell pools"
```

---

### Задача 2: ходи на полі — порядок, вибір клітинки, ставка, кінець раунду

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
    /** Вибрана клітинка-ставка до показу запитання. */
    pending: { cellId: string; questionId: string; chooserId: string } | null;
    /** Відколи гравець, чий хід, відключений; null — на місці або не етап board/wager. */
    awaySince: number | null;
  }
  export interface BoardPlay {
    cellId: string;
    /** Хто вибрав клітинку; відповідає лише він. */
    chooserId: string;
    price: number;
    /** Множник клітинки: x2 → 2, x3 → 3, інакше 1. */
    multiplier: 1 | 2 | 3;
    /** Ставка; null — клітинка без ставки. */
    wager: number | null;
    /** Відповідь з телефону, що чекає на оцінку ведучого (check 'manual'); інакше null. */
    answer: Answer | null;
  }
  // Play отримує board?: BoardPlay; GameState отримує board: BoardState | null (createGame → null).
  export function openQuestion(state: GameState, question: Question, now: number, rng: Rng, board?: BoardPlay): GameState; // тепер експортується
  ```
- Produces (`board-turns.ts`, лише типи з `game.ts`):
  ```ts
  export const BOARD_AWAY_MS = 120_000;
  export function initBoard(state: GameState): BoardState;          // circle — id гравців у порядку приєднання
  export function chooserOf(state: GameState): string | null;       // wager → pending.chooserId; інакше circle[done] ?? null
  export function advanceTurn(board: BoardState): BoardState;       // done + 1; коло вичерпано → circle зсувається на одного, done 0
  export function playedQuestions(state: GameState, cellId: string): string[]; // id зіграних запитань клітинки з журналу
  export function cellLeft(state: GameState, cellId: string): number;
  export function hasActiveCells(state: GameState): boolean;
  export function wagerRange(state: GameState, playerId: string): { min: number; max: number };
  export function cellMultiplier(mark: CellMark): 1 | 2 | 3;
  /** Етап вибору клітинки: без таймера запитання, awaySince за підключенням нового гравця, чий хід. */
  export function enterBoard(state: GameState, now: number): GameState;
  ```
- Produces (`board.ts`):
  ```ts
  export function setOrder(state: GameState, playerIds: string[]): Result;
  export function rollOrder(state: GameState, rng: Rng): Result;
  /** by — id гравця або null, коли вибирає ведучий. */
  export function pickCell(state: GameState, by: string | null, cellId: string, now: number, rng: Rng): Result;
  export function placeWager(state: GameState, playerId: string, amount: number, now: number): Result;
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
  - умови: етап `'board'` (`wrong_phase`), не пауза (`paused`), є гравець, чий хід (`no_players`), `by` — це він або `null` (`not_your_turn`), клітинка існує (`not_found`) і має незіграні запитання (`cell_closed`);
  - запитання береться з незіграних клітинки в їхньому порядку: `pool[Math.floor(rng() * pool.length)]`;
  - хід зараховується одразу (`advanceTurn`);
  - для клітинки з `mark: 'bet'` гра переходить в етап `'wager'` з `pending = { cellId, questionId, chooserId }`;
  - для іншої клітинки відкривається запитання (`openQuestion` з `board: { cellId, chooserId, price, multiplier: cellMultiplier(mark), wager: null, answer: null }`).
- **`placeWager`:**
  - умови: етап `'wager'`, не пауза, `playerId === pending.chooserId` (`not_your_turn`), ціле `amount` у межах `wagerRange` (`wager_invalid`);
  - `wagerRange` = `{ min: найменша ціна поля, max: max(рахунок гравця, найбільша ціна поля) }`;
  - запитання `pending` відкривається з `wager: amount`, `multiplier: 1`, а `pending` стає `null`.
- **`skipTurn`:** етап `'board'` → `advanceTurn` і `enterBoard`; етап `'wager'` → `pending = null` (хід уже зараховано, клітинка лишається активною) і `enterBoard`. Інші етапи дають `wrong_phase`, пауза — `paused`.
- `endRound` і `end` дозволені також в етапах `'board'`/`'wager'`. Вони скидають `pending` (`IN_ROUND` доповнюється).

- [ ] **Step 1: Write the failing tests** у `packages/engine/src/game.board.test.ts`. Вікторина: `makeRoundsQuiz([boardRound('g1', [{ title: 'Міста', cells: [c11, c12] }, { title: 'Річки', cells: [c21, c22] }])])`, prices `[100, 200]`. Гравці: `lobbyWith(quiz, 'Анна', 'Богдан', 'Віра')` → p1, p2, p3. `rng` у тестах передається явно (`() => 0` бере перше незігране).

```ts
it('a board round always starts with an intro and the join order', () => {
  // start(state, 0) для вікторини з одним раундом поля → phase 'intro', board.circle ['p1','p2','p3']
});
it('the host sets the order or rolls the dice before the round starts', () => {
  // setOrder(['p3','p1','p2']) → circle ['p3','p1','p2']; setOrder(['p1','p2']) → not_found;
  // rollOrder(state, rng) → перестановка тих самих id, rolls 1; після next (етап board) setOrder → wrong_phase
});
it('turns rotate by one after every circle', () => {
  // board 3×3 (9 клітинок, одне запитання в кожній); хто вибирає по черзі, 9 ходів (pickCell → відповідь → next, доки знову не етап board):
  // ['p1','p2','p3','p2','p3','p1','p3','p1','p2']
});
it('only the chooser or the host can pick, and only an active cell', () => {
  // pickCell(state, 'p2', 'c1-1') → not_your_turn; pickCell(state, null, 'c1-1') → ok (за p1)
  // після розкриття c1-1 погасла: pickCell(…, 'c1-1') → cell_closed; 'nope' → not_found
});
it('a cell with a pool stays active until its questions run out', () => {
  // c1-1 з двома запитаннями: після першого вибору cellLeft 1, клітинка активна; після другого погасла;
  // rng () => 0.99 бере останнє незігране
});
it('a bet cell asks for a wager first', () => {
  // c2-1 mark 'bet': pickCell → phase 'wager', pending.chooserId 'p1', запитання ще не відкрито (plays без змін)
  // placeWager(state, 'p2', 100) → not_your_turn; placeWager(state, 'p1', 150, t) → phase 'question', plays.at(-1).board.wager 150
});
it('the wager range uses the board prices when the score is low', () => {
  // рахунок p1 −300: wagerRange → { min: 100, max: 200 }; placeWager 201 → wager_invalid; 99 → wager_invalid; 1.5 → wager_invalid
  // рахунок p1 900: wagerRange → { min: 100, max: 900 }
});
it('skipping a turn passes it on and keeps the rotation', () => {
  // skipTurn в етапі board → вибирає p2; у колі 2 першим іде p2
  // skipTurn в етапі wager → pending null, етап board, клітинка-ставка ще активна
});
it('the round ends after the last cell even with a leaderboard after each question', () => {
  // leaderboard 'each', поле 1×1: pick → lock → next (reveal) → next → 'finished' (раунд останній), без етапу board
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
git commit -m "feat(engine): board turns with rotation, cell pools, wagers and skips"
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
  - при `check: 'auto'` відповідь оцінюється й записується одразу, після чого запитання закривається (`lockNow`). Точність `checkAnswer` 1 → `correct`. Точність між 0 і 1: при `rules.partial !== null` і без ставки дає `partial` з цією точністю, інакше `wrong` з точністю 0. Точність 0 → `wrong`;
  - при `check: 'manual'` відповідь кладеться в `play.board.answer`, запис не створюється, запитання закривається.
- **`boardPoints`:** за ставки `accuracy >= 1 ? +wager : −wager`. Без ставки: `answerPoints({ points: price, accuracy, speed: 1, multiplier: round.rules.multiplier * board.multiplier, penalty: round.rules.penalty })`.
- **Оцінка ведучого (`override`) у раунді поля:**
  - дозволена в етапах:
    - `'question'`: при `answerMode: 'voice'` завжди; при `'manual'` лише якщо `play.board.answer !== null`; інакше `wrong_phase`;
    - `'locked'` і `'reveal'`;
  - `playerId` має бути `chooserId` (`not_found`);
  - `partial` при `rules.partial === null` або зі ставкою дає `partial_disabled`;
  - точність: `correct` 1, `partial` `rules.partial / 100`, `wrong` 0;
  - запис: `answer` — наявного запису, або `play.board.answer`, або `null`; `timeMs` — наявного запису або `now − startedAt` (на `locked`/`reveal`, коли запису ще не було, `timeLimit × 1000`); `overridden: phase === 'reveal'`;
  - оцінка в етапі `'question'` закриває запитання;
  - `override` отримує необов'язковий четвертий аргумент `now?: number`, бо у класиці його не було. Сервер передає його завжди; без нього час рахується як `timeLimit × 1000`.
- **Розкриття без оцінки.** Під час `next` з `locked` у `reveal` у раунді поля гравець, чий хід, без запису (і ще в грі) отримує запис `wrong`. У ньому `answer = play.board.answer`, `timeMs = timeLimit × 1000`, бали `boardPoints(…, 0)`, тобто штраф або мінус ставка. Це також випадок, коли час сплив без відповіді: вибраний гравець зобов'язаний відповісти. Далі `withTotals`.
- **Закриття запитання.** `tick` після `endsAt` закриває запитання поля без створення запису. Те саме роблять `lock`, `endRound`, `end`. Запитання, закрите через `endRound`/`end` без оцінки, балів не дає.
- **`autoLock`** у раунді поля нічого не робить: закриття робить сама відповідь.
- **Серії:**
  - у `streakCounts` запитання поля, де гравець не `chooserId`, серію не обриває й не продовжує (`continue`);
  - запис `chooserId` з точністю нижче 1 обриває, правильний продовжує;
  - у `withTotals` бонус серії за запитання зі ставкою дорівнює 0, хоча відповідь серію продовжує.
- `totalTimeMs` не змінюється: час іде лише за класичні раунди.

- [ ] **Step 1: Write the failing tests** (у `game.board.test.ts`; `single.correctId === 'b'`, `timeLimit: 20`, рахунок перевіряти через `state.players`):

```ts
it('only the chooser answers and a correct answer earns the cell price', () => {
  // p1 вибрав c1-2 (200); submitAnswer(p2, …) → not_your_turn; p1 'b' → phase 'locked', запис 200
});
it('round and cell multipliers multiply, and so does the penalty', () => {
  // rules { multiplier: 2, penalty: 'minus' }, c1-2 mark 'x3' (200): правильно → 1200; у новій грі неправильно → −1200
});
it('partial accuracy pays a share only with partial credit on', () => {
  // order-запитання, точність 0.5, ціна 200: rules.partial null → wrong, 0; rules.partial 50 → partial, 100
});
it('a bet pays plus or minus the wager with no multipliers or streak bonus', () => {
  // rules { multiplier: 3, streak { length: 1, bonus { kind: 'fixed', value: 500 } } }; ставка 150:
  // правильно → +150, streakBonus 0; неправильно → −150
});
it('a missing answer is wrong at the reveal and the penalty applies', () => {
  // penalty minus, c1-1 (100): tick(endsAt) → locked без запису; next → reveal, запис wrong з answer null, рахунок −100
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
  // правильно 200 → override(reveal, 'p1', 'wrong') → 0 (без штрафу), overridden true; зі ставкою 'partial' → partial_disabled
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
git commit -m "feat(engine): board answers, host grading, wagers, multipliers and streaks"
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
- `awaySince` діє лише в етапах `'board'` і `'wager'` і стосується гравця, чий хід (`chooserOf`):
  - `enterBoard`, `pickCell` (перехід у `'wager'`) і `skipTurn` ставлять `awaySince = гравець підключений ? null : now`;
  - `setConnected` для гравця, чий хід, у цих етапах ставить `null` при підключенні й `now` при відключенні (якщо ще `null`).
- **`tick` у етапах `'board'`/`'wager'` без паузи:**
  - якщо гравець, чий хід, відключений, а `awaySince === null`, ставить `awaySince = now`;
  - якщо `awaySince !== null && now >= awaySince + BOARD_AWAY_MS`, пропускає хід, як `skipTurn`;
  - інакше повертає той самий об'єкт.
- **`nextDeadline`** у цих етапах без паузи повертає `awaySince + BOARD_AWAY_MS`, якщо воно більше за `now`, інакше `null`. Для запитань поля поведінка звичайна (`endsAt`).
- **Пауза.** `pause` дозволена в етапах `'board'`/`'wager'`. `pickCell`, `placeWager`, `skipTurn` на паузі дають `paused`. `resume` у цих етапах ставить `awaySince = гравець відключений ? now : null`: після паузи відсутній гравець має знову 2 хвилини.
- **`removePlayer`:**
  - прибирає гравця з `circle`: якщо його індекс менший за `done`, то `done − 1`; якщо `done` дорівнює довжині кола й коло не порожнє, коло зсувається, а `done` стає 0;
  - якщо `pending.chooserId` — він, то `pending = null` і етап `'board'`;
  - `awaySince` скидається в `null`: менеджер одразу після вилучення викликає `tick(…, now)`, і той поставить його заново для відключеного наступного гравця;
  - під час запитання поля, де він відповідає, запис просто зникає, запитання доживає до таймера або закриття ведучим.

- [ ] **Step 1: Write the failing tests:**

```ts
it('an absent chooser loses the turn after two minutes', () => {
  // етап board, хід p1; setConnected(p1, false, 1000) → awaySince 1000; nextDeadline(state, 1000) === 121000;
  // tick(state, 120999) — той самий об'єкт; tick(state, 121000) → хід p2, awaySince null; у колі 2 першим іде p2
});
it('a chooser who comes back keeps the turn', () => {
  // відключення в 1000, підключення в 5000 → awaySince null; tick(121000) нічого не змінює
});
it('the absence clock restarts after a pause', () => {
  // відключення в 1000; pause у 60000; resume у 600000 → awaySince 600000; tick(720000) пропускає хід
});
it('kicking the chooser passes the turn on', () => {
  // етап board, хід p2 (done 1): removePlayer(p2) → circle ['p1','p3'], chooserOf → 'p3'
  // етап wager з pending p3: removePlayer(p3) → етап board, pending null
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
git commit -m "feat(engine): absent choosers lose the turn, kicks keep the rotation"
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
    /** Незіграних запитань у клітинці; 0 — клітинка погасла. */
    left: number;
    /** null — позначку приховано (сцена й гравці, поки клітинку ні разу не вибрали). */
    mark: CellMark | null;
  }
  export interface BoardInfo {
    categories: { id: string; title: string; cells: BoardCellView[] }[];
    /** Порядок поточного кола. */
    order: BlitzPlayer[];
    /** Чий хід: хто вибирає (board), ставить (wager) або відповідає (question…reveal). */
    turn: BlitzPlayer | null;
    /** Вибрана клітинка поточного запитання або ставки; її позначку видно всім. */
    cell: { id: string; category: string; price: number; mark: CellMark } | null;
    /** Ставка поточного запитання; null до ставки або без неї. */
    wager: number | null;
    /** Межі ставки; лише в етапі wager. */
    wagerRange: { min: number; max: number } | null;
    answerMode: 'phone' | 'voice';
    rolls: number;
    /** Мить автоматичного пропуску ходу відсутнього гравця; null — гравець на місці. */
    skipAt: number | null;
  }
  export interface HostBoard extends BoardInfo {
    manual: boolean;          // answerMode 'voice' або check 'manual'
    /** Відповідь з телефону, що чекає на оцінку. */
    answer: Answer | null;
  }
  // BaseView: board: BoardInfo | null — у раунді поля в етапах intro, board, wager, question, locked, reveal, leaderboard; інакше null
  // HostView: board: HostBoard | null (позначки всіх клітинок видно завжди)
  ```

**Правила:**
- `BETWEEN_QUESTIONS` доповнюється `'board'` і `'wager'`: у них `question === null`.
- `PublicQuestion.points` у запитанні поля дорівнює ціні клітинки.
- `PlayerView.me.answer` для `chooserId`: запис, інакше `play.board.answer`.
- Позначка клітинки видима сцені й гравцям, якщо з клітинки вже зіграно хоча б одне запитання або вона зараз вибрана (`pending` чи поточне запитання).
- `turn` в етапах `board`/`wager` — це `chooserOf`, а в етапах запитання — `play.board.chooserId`.

- [ ] **Step 1: Write the failing tests:**

```ts
it('stage and player views never carry hidden marks or cell questions', () => {
  // c2-1 'bet', c1-2 'x2', ніхто не вибирав: JSON.stringify(stageView) і playerView(p2) не містять 'bet', 'x2',
  // текстів запитань клітинок і 'correctId'; усі mark === null; hostView.board.categories[1].cells[0].mark === 'bet'
});
it('a chosen cell shows its mark to everyone and stays shown', () => {
  // p1 вибрав c2-1 (bet) → stageView.board.cell.mark 'bet', wagerRange { min: 100, max: 200 };
  // після розкриття c2-1 у stageView має mark 'bet', left 0
});
it('the board view shows the order, whose turn it is and a pool counter', () => {
  // order nicknames ['Анна','Богдан','Віра'], turn 'Анна'; клітинка з пулом 2 після одного вибору left 1
});
it('a board question shows the cell price and the wager', () => {
  // ставка 150 на ціні 100: stageView.question.points 100, board.wager 150, board.turn.playerId 'p1'
});
it('the host sees a phone answer waiting for a grade', () => {
  // check manual: hostView.board.manual true, board.answer — відповідь p1; playerView(p1).me.answer та сама
});
it('the absent chooser has a skip time', () => {
  // setConnected(p1, false, 1000) → stageView.board.skipAt 121000
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
  export const wagerSchema = z.object({ amount: z.number().int() });
  export const orderSchema = z.object({ playerIds: z.array(playerId).max(LIMITS.maxPlayers) });
  // ClientToServerEvents:
  'player:pick': (payload: z.infer<typeof pickSchema>, ack: Ack) => void;
  'player:wager': (payload: z.infer<typeof wagerSchema>, ack: Ack) => void;
  'host:pick': (payload: z.infer<typeof pickSchema>, ack: Ack) => void;
  'host:order': (payload: z.infer<typeof orderSchema>, ack: Ack) => void;
  'host:roll': (ack: Ack) => void;
  'host:skip': (ack: Ack) => void;
  ```
- Produces (manager): `pick(room, playerId, cellId): AckResult`, `wager(room, playerId, amount): AckResult`. `HostAction` доповнюється `{ type: 'roll' | 'skip' }`, `{ type: 'pick'; cellId: string }`, `{ type: 'order'; playerIds: string[] }`. `override` у менеджері передає `this.now()`.
- Produces (`PlayRef`): `{ roundIndex; questionId; cell?: { cellId: string; chooserId: string; wager: number | null } }`.
- Produces (shared `history.ts`): `GameQuestionResult.cell: { category: string; price: number; chooser: string | null; wager: number | null; points: number | null } | null`.

**Правила:**
- `pick` і `roll` використовують `this.rng`. `'roll'` і `'skip'` додаються до `SIMPLE_HOST_ACTIONS` у сокеті.
- Таймер ходу відсутнього гравця планує наявний `reschedule` через `nextDeadline` (задача 4). Після вилучення менеджер уже викликає `tick` з поточним часом.
- Recorder:
  - запитання поля пише один рядок `answer` з `attempt: 0`, як класика;
  - `progress.plays` для запитання поля містить `cell` з `play.board`;
  - запис, створений на розкритті, змінює підпис через оцінки останнього закритого запитання. Наявний механізм уже перезаписує це запитання, тож нічого додавати не треба (тест це підтверджує).
- Історія для запитання з `cell`:
  - `category` і `price` беруться зі знімка через `findCell`;
  - `chooser` — нікнейм учасника з `chooserId` або `null`, якщо його вилучили;
  - `points` — сума `answer.points` цього учасника на запитання, або `null`, якщо рядка немає;
  - для інших запитань `cell: null`.

- [ ] **Step 1: Write the failing tests:**

```ts
// manager.test.ts
it('an absent chooser is skipped by the room timer after two minutes', () => {
  // фейковий планувальник; раунд поля; host order → next; гравець p1 відключається → таймер на +120000;
  // прокрутити → хід p2
});
it('board actions go through the manager', () => {
  // host roll → board.rolls 1; host order; next; pick гравцем → question; wager гравцем у клітинці-ставці
});
// socket.test.ts
it('board events are accepted only from their roles and with valid payloads', () => {
  // ведучий шле player:pick → forbidden; гравець шле host:skip → forbidden;
  // player:wager { amount: 1.5 } → invalid_payload; host:order { playerIds: 'x' } → invalid_payload
});
// recorder.test.ts
it('a board question is stored with its cell, chooser and wager', () => {
  // ставка 150, правильно → game.plays[0].cell { cellId: 'c2-1', chooserId: p1, wager: 150 }, рядок answer points 150
});
it('a grade given at the reveal of a board question is saved', () => {
  // час сплив без відповіді (penalty minus) → після reveal рядок accepted false, points −100
});
// history.test.ts
it('history shows board questions by cell with the chooser and points', () => {
  // questions[0].cell { category: 'Міста', price: 100, chooser: 'Анна', wager: null, points: 100 }; класичне запитання cell null
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
- Modify: `apps/web/src/editor/draft.ts`, `draft-storage.ts`, `RoundSettings.tsx`, `RoundStrip.tsx`, `QuizEditor.tsx`, `QuestionEditor.tsx`, `apps/web/src/format.ts`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Modify (лише щоб компілювалося з новими етапами): `apps/web/src/screens/HostScreen.tsx`, `PlayerScreen.tsx`, `StageScreen.tsx`
- Test: `apps/web/src/editor/draft.test.ts`, `apps/web/src/editor/QuizEditor.test.tsx`

**Interfaces:**
- Consumes: `BoardRound`, `DEFAULT_BOARD_PRICES`, `CELL_MARKS`, `boardRoundIssues`, `roundQuestions` (задача 1).
- Produces:
  ```ts
  // draft.ts
  export function newBoardRound(): BoardRound;  // 3 категорії з порожніми назвами, prices DEFAULT_BOARD_PRICES,
                                                // у кожній клітинці одне порожнє single-запитання, mark 'none',
                                                // answerMode 'phone', check 'auto', rules defaultRules(), shuffleOptions false
  export interface ProblemPlace { round: number; question: number; cell: { category: number; row: number } | null }
  export function firstProblem(quiz: Quiz): ProblemPlace | null;   // було { round, question }
  // QuestionEditor: новий необов'язковий проп showPoints?: boolean (типово true)
  // BoardEditor: { round: BoardRound; onChange: (next: BoardRound) => void; focus?: { category: number; row: number; question: number } | null }
  ```

**Правила:**
- **Вибір типу раунду.** «+ Раунд» пропонує третю кнопку «Ігрове поле». `roundLabel` для безіменного поля дає «Ігрове поле».
- **Ліва колонка.** Для раунду поля `QuizEditor` показує назву й налаштування вікторини, а список запитань, навігацію й «+ Запитання» ховає. Праву частину займає `BoardEditor`.
- **`BoardEditor`, таблиця:**
  - рядок заголовків — поля назв категорій, кожна з кнопкою «Прибрати категорію» (якщо категорій більше однієї);
  - перший стовпець — числові поля цін рядків з кнопкою «Прибрати рядок» (якщо рядків більше одного);
  - кнопки «+ Категорія» (до 6) і «+ Рядок» (до 10; нова ціна = остання + 100, але не більше 2000). Нові клітинки отримують одне порожнє запитання;
  - клітинка — кнопка з ціною, позначкою (`★` для ставки, `×2`, `×3`) і кількістю запитань, якщо їх більше одного;
  - вибрана клітинка виділена.
- **`BoardEditor`, панель вибраної клітинки:**
  - select «Позначка»: «Без позначки», «Ставка», «×2», «×3»;
  - вкладки запитань пулу «1», «2», …;
  - `QuestionEditor` з `showPoints={false}`;
  - «+ Запитання в клітинку» (до 10) і «Прибрати запитання» (якщо їх більше одного).
- **Налаштування поля** (`RoundSettings` для `type === 'board'`): назва; перемішування варіантів; «Спосіб відповіді» (select: «На телефоні», «Вголос»); «Перевірка» (лише для телефону; «Автоматично», «Ведучий»); штраф; «частково» з часткою; серії; множник. Бали за швидкість не показуються.
- **Перевірка й чернетки:**
  - `cleaned` обрізає назви категорій і чистить запитання клітинок;
  - `problemsOf` для поля повідомляє: порожню назву категорії («Категорія N: немає назви»); ціну поза 0–2000 або не ціле число («Рядок N: ціна від 0 до 2000»); проблеми запитань з місцем «Категорія N, ціна P, запитання K: …»; коди `boardRoundIssues`;
  - `firstProblem` повертає й клітинку, і `QuizEditor` відкриває її;
  - `loadDraft` відновлює раунд поля: `numberOr` для цін і полів запитань клітинок, без полів класичного раунду;
  - підтвердження видалення раунду рахує `roundQuestions`.
- **Екрани гри в цій задачі** лише компілюються: ключі `phase_board`/`phase_wager` у словнику, решта — у задачі 8.

- [ ] **Step 1: Write the failing tests:**

```ts
// draft.test.ts
it('newBoardRound is a 3 by 5 board that passes the schema once filled', () => {
  // categories.length 3, prices [100,200,300,400,500]; заповнити назви й запитання → roundSchema.safeParse success
});
it('a saved board draft comes back unchanged', () => {});
it('problemsOf names the category, price and question of a broken board cell', () => {
  // порожній текст у клітинці категорії 2, ціна 300 → повідомлення містить 'Категорія 2' і '300'
});
it('firstProblem points at the board cell', () => {
  // → { round: 1, question: 0, cell: { category: 1, row: 2 } }
});
// QuizEditor.test.tsx
it('adds a board round, fills a cell pool, marks a bet and saves', async () => {
  // «+ Раунд» → «Ігрове поле»; назви категорій; клітинка «Категорія 1 · 100»: два запитання; клітинка 2/200 → «Ставка»;
  // заповнити решту клітинок; зберегти → onSave отримує rounds[1] type 'board' з пулом із 2 запитань і mark 'bet'
});
it('board settings offer answer mode and hide the check for voice', async () => {
  // «Вголос» → немає select t('blitzCheck'); немає чекбокса t('speedBonus')
});
it('adding a category and a row extends every column', async () => {
  // «+ Категорія» → 4 стовпці по 5 клітинок; «+ Рядок» → ціни [...,500,600], у кожній категорії 6 клітинок
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
- Create: `apps/web/src/screens/Board.tsx` (спільна сітка поля для трьох екранів)
- Modify: `apps/web/src/screens/HostScreen.tsx`, `PlayerScreen.tsx`, `StageScreen.tsx`, `apps/web/src/pages/GameHistory.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/HostScreen.test.tsx`, `PlayerScreen.test.tsx`, `StageScreen.test.tsx`, `apps/web/src/pages/History.test.tsx` (або тест `GameHistory`, де він уже є)

**Interfaces:**
- Consumes: `view.board`, `HostView.board` (задача 5); події задачі 6.
- Produces:
  ```ts
  // Board.tsx
  export function Board(props: { board: BoardInfo; onPick?: (cellId: string) => void }): JSX.Element;
  ```
  Таблиця: стовпці — категорії, у клітинці ціна. Погасла клітинка (`left === 0`) — порожня, неактивна. Пул (`left > 1`) — маленький лічильник. Відома позначка — `★` / `×2` / `×3`. З `onPick` активні клітинки стають кнопками з `aria-label` «{категорія}, {ціна}».

**Правила:**
- **Пульт:**
  - **intro раунду поля:** панель «Порядок ходів» зі списком гравців і кнопками ↑/↓ (`host:order` з новим списком), кнопки «Кинути кубик» (`host:roll`) і «За порядком приєднання» (`host:order` з гравцями в порядку `view.players`);
  - **етап `board`:** `Board` з `onPick` (`host:pick`), рядок «Вибирає {name}», якщо гравець відключений — «{name} відключений, хід пропуститься автоматично», кнопка «Пропустити хід» (`host:skip`);
  - **етап `wager`:** «{name} робить ставку від {min} до {max}» і «Пропустити хід»;
  - **запитання поля:** рядок «Відповідає {name}» (і «Ставка: {amount}», якщо є). Панель відповіді показує `board.answer` або відповідь із `responses`. Кнопки «Зарахувати» / «Частково» (якщо `round.partial` і немає ставки) / «Не зараховувати» (`host:override` з `chooserId`) видно:
    - в етапі `question`, якщо `board.manual` і (`answerMode === 'voice'` або `board.answer !== null`);
    - в етапах `locked` і `reveal` — для будь-якого типу запитання;
  - лічильник «відповіли N з M» у полі не показується.
- **Телефон:**
  - **`board`:** гравцю, чий хід, — «Ваш хід: виберіть клітинку» і `Board` з `onPick` (`player:pick`); іншим — «Вибирає {name}» і `Board` без `onPick`;
  - **`wager`:** гравцю, чий хід, — поле числа «Ставка від {min} до {max}» і кнопка «Поставити» (`player:wager`); іншим — «{name} робить ставку»;
  - **запитання:** гравцю, чий хід, при `answerMode: 'phone'` — `AnswerInput`, при `'voice'` — «Відповідайте вголос»; іншим — «Відповідає {name}»;
  - **`reveal`:** для гравця, чий хід, результат як зараз; інші бачать «Відповідав {name}» і правильну відповідь.
- **Сцена:**
  - **intro раунду поля:** порядок гравців; коли `rolls` змінилося, 1,5 с анімації кубика (CSS-клас `is-rolling` на кубику з гранями ⚀–⚅), потім порядок;
  - **`board`:** `Board`, порядок із позначкою того, чий хід, і «Вибирає {name}»;
  - **`wager`:** «Ставка! {name} робить ставку» і категорія з ціною;
  - **запитання поля:** над запитанням «{категорія} · {ціна}», «Відповідає {name}», «Ставка: {amount}» або позначка ×2/×3.
- **Історія гри:** запитання з `cell` показує «{категорія} · {ціна}», «{chooser}: {signed(points)}» і, якщо є ставка, «ставка {wager}». Якщо `chooser === null`, показується «гравця вилучено».
- Помилки `not_your_turn`, `cell_closed`, `wager_invalid` мають тексти в `i18n.ts`.

- [ ] **Step 1: Write the failing tests:**

```ts
// HostScreen.test.tsx
it('sets the board order with arrows, dice and join order', async () => {
  // intro раунду поля: клік «↓» біля першого → send('host:order', { playerIds: [p2, p1, p3] }); «Кинути кубик» → 'host:roll'
});
it('picks a cell for the chooser and skips a turn', async () => {
  // етап board: клік «Міста, 100» → send('host:pick', { cellId: 'c1-1' }); «Пропустити хід» → 'host:skip'
});
it('grades a voice answer during the question', async () => {
  // answerMode voice, manual true: «Зарахувати» → send('host:override', { playerId: 'p1', grade: 'correct' })
});
// PlayerScreen.test.tsx
it('lets the chooser pick a cell and others wait', async () => {
  // turn = me → клік клітинки → send('player:pick', { cellId }); turn = інший → «Вибирає Анна», клітинки не кнопки
});
it('lets the chooser place a wager within the range', async () => {
  // wagerRange { min: 100, max: 500 }: ввести 300 → «Поставити» → send('player:wager', { amount: 300 })
});
it('only the chooser gets the answer input', () => {
  // turn інший → «Відповідає Анна», немає поля відповіді; voice і turn = me → «Відповідайте вголос»
});
// StageScreen.test.tsx
it('shows the board with hidden marks and whose turn it is', () => {});
it('rolls the dice when the roll counter changes', () => {
  // rerender з rolls 1 → елемент з класом is-rolling
});
// History test
it('shows a board question with its cell, chooser and points', () => {
  // 'Міста · 100', 'Анна: +100'
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/web/src/screens apps/web/src/pages`
Expected: FAIL.

- [ ] **Step 3: Implement** екрани за правилами вище у візуальному напрямі «Нічний ефір» (наявні класи `panel`, `rows`, `tag`, `btn`). Сітка поля адаптується до ширини телефона: 1–6 стовпців, без горизонтальної прокрутки сторінки.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): board, turns, wagers and grading on host, phone and stage"
```

---

### Задача 9: наскрізний сценарій поля

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе попереднє; допоміжні функції наявних сценаріїв у тому самому файлі.

- [ ] **Step 1: Write the scenario** `it('a board round: order, a bet, a doubled cell and an early end', …)`.

Підготовка в редакторі:
- ведучий створює вікторину з одним раундом поля: «+ Раунд» → «Ігрове поле», потім вибирає перший, класичний раунд і видаляє його;
- ціни 100 і 200: зайві рядки 300–500 прибрати; третю категорію прибрати;
- категорії «Міста» і «Річки»;
- клітинка «Річки, 100» має позначку «Ставка», клітинка «Міста, 200» — «×2»;
- усі чотири клітинки — запитання з одним варіантом;
- спосіб відповіді «На телефоні», перевірка автоматична, штрафу немає.

Двоє гравців: A приєднується першим, B — другим.

Хід гри:
1. На заставці ведучий тисне «Кинути кубик» (сцена показує кубик), потім «За порядком приєднання» і «Почати раунд».
2. A вибирає «Міста, 100» і відповідає правильно → +100.
3. B вибирає «Міста, 200» (×2) і відповідає неправильно → 0.
4. Коло 2 починає B: «Річки, 100» (ставка). Межі ставки 100–200, B ставить 200 і відповідає правильно → +200.
5. Хід A: ведучий завершує гру.

Очікування:
- на подіумі B 200, A 100 (точні числа);
- історія показує три зіграні запитання з клітинками «Міста · 100», «Міста · 200», «Річки · 100» і балами.

- [ ] **Step 2: Run it**

Run: `pnpm e2e`
Expected: PASS усіх сценаріїв (наявні три й новий).

- [ ] **Step 3: Commit**

```bash
git add apps/server/e2e
git commit -m "test: board round end-to-end"
```

Після фінальної рецензії гілки злити в `main`, запустити `pnpm test` і `git push origin main`. Render розгорне сам; міграцій у цьому плані немає.
