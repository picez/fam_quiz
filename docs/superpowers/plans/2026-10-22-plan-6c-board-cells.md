# План 6c: різнотипні клітинки поля

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** кожна клітинка поля має тип («Звичайна» / «Бліц»), спосіб відповіді («З телефона» / «Усно») і, для бліцу, штраф («Без штрафу» / «Мінус для всіх»). На бліц-клітинці «Відповісти» тиснуть усі, відповідає перший у черзі через «Мільйонер» або вголос. Свій правильний відповідач отримує ціну ×2, суперник — ціну. «Мінус для всіх» знімає ціну з усіх, хто не відповів правильно. Тип і спосіб відповіді гравці дізнаються лише тоді, коли клітинку відкрито.

**Архітектура:**
- **Схема.** `boardCellSchema` отримує поля:
  - `kind` (`CELL_KINDS = ['normal', 'blitz']`, типово `'normal'`);
  - `penalty` (`CELL_PENALTIES = ['none', 'all']`, типово `'none'`);
  - необов'язковий `answerMode`.

  Спосіб відповіді клітинки завжди читається через `cellAnswerMode(round, cell)`, тобто `cell.answerMode ?? round.answerMode`. Так стара клітинка без поля отримує спосіб свого раунду, а схема не мусить бачити раунд. `check` лишається налаштуванням раунду.
- **Рушій: дані клітинки в журналі.** `BoardPlay` отримує `kind`, `answerMode` і `penalty`, які `pickCell` знімає з клітинки в мить відкриття. Далі рушій дивиться лише на `play.board`, а не на раунд: `pendingOf`, `submitBoardAnswer`, `overrideBoard` і зрізи.
- **Рушій: бліц-клітинка використовує чергу бліц-раунду, а не копію.** Причина: натискання, вікна відповіді, утримання «Мільйонера», `settle`, `applyVerdict`, `nextDeadline`, зсув на паузі й вилучення гравця вже працюють і перевірені. Дублікат розійшовся б з ними за першої ж правки.
  - `openQuestion` додає `play.blitz`, коли `board.kind === 'blitz'`.
  - Усе, що в `blitz.ts` брало параметри з `BlitzRound`, тепер бере їх з `BlitzRules`. Їх повертає `blitzRulesOf(state, play)`: для бліц-раунду з раунду, для бліц-клітинки з `cellBlitzRules` (новий `board-cells.ts`).
  - Скрізь, де `game.ts`, `hold.ts` і `views.ts` перевіряли `round.type === 'blitz'`, тепер перевіряється `play.blitz !== undefined`.
- **Бали бліц-клітинки:**
  - правильна відповідь дає `price × (своя ? 2 : 1) × множник клітинки × множник раунду`, неправильна спроба 0 (штраф раунду тут не діє);
  - «Мінус для всіх» нараховує `withCellPenalty` у `lockNow`, тобто рівно один раз, коли клітинка закривається з будь-якої причини. Штраф додається до записів у `play.answers`, тож `withTotals`, рейтинг і журнал бачать його без окремих правил.
- **Історія.** Рядок відповіді на кожну спробу пишеться, як у бліці. Штраф іде окремим рядком з `attempt = PENALTY_ATTEMPT` (−1). Номер −1 не перетинається зі спробами 0…n, а історія сумує бали учасника за всіма рядками й не показує цей рядок як відповідь. `GameQuestionResult.cell` отримує `kind` і `scores`. Міграція бази не потрібна.

**Технології:** TypeScript, zod 4, vitest, Fastify + Socket.IO, Drizzle (PGlite у тестах), React + Vite, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-21-after-first-game-design.md`, лише частина D (розділ 6), а також розділи 2 (анти-цілі) і 11 (тестування) у тій мірі, в якій вони стосуються D. Як відповідь одного гравця чекає на «Прийняти» / «Перевибрати», описує частина B (розділ 4), реалізована в плані 6a.

**Рішення плану там, де специфікація мовчить:**
- **Вікно відповіді.** Бліц-клітинка з телефона має вікно `DEFAULT_ANSWER_WINDOW` (15 с) на кожне натискання, як бліц-раунд за замовчуванням: інакше той, хто натиснув і замовк, тримав би чергу до кінця таймера. В усній бліц-клітинці вікна немає (`deadline: null`), і голову черги автоматично не відкидає ні вікно, ні кінець таймера: її оцінює ведучий («Правильно» / «Неправильно» через наявний `host:judge`).
- **Усна бліц-клітинка не зупиняє таймер**, як і звичайна усна клітинка: помаранчевого кроку немає. Після кінця таймера нові натискання не приймаються, а черга чекає на оцінки ведучого.
- **Перевірка.** Бліц-клітинка з телефона бере `check` раунду: `'auto'` → «Прийняти», `'manual'` → «Правильно» / «Неправильно» (`judge`). «Частково» на бліц-клітинці немає, як і в бліц-раунді.
- **Оцінка остаточна.** `override` на бліц-клітинці відмовляє з `wrong_phase`, як у бліц-раунді.
- **Розкриття.** Закриття бліц-клітинки веде на `locked`, далі «Показати відповідь» → `reveal`, як у бліц-раунді. `unansweredIsWrong` бліц-клітинки не зачіпає.
- **Штраф** нараховується, коли клітинку закриває `lockNow`: перша правильна відповідь, кінець таймера з порожньою чергою, «Закрити клітинку» або «Завершити раунд». «Завершити гру» (`end`) є перериванням і штрафу не нараховує, як і зараз не дораховує відкрите запитання. Штраф стосується лише гравців, що є в грі на мить закриття.
- **Серії.** На полі серію, як і раніше, рахують лише власні клітинки гравця. На своїй бліц-клітинці без натискання й без штрафу серія не переривається й не продовжується (наявне правило бліцу для тих, хто не натискав).
- **Що видно гравцям.** До відкриття `BoardCellView.kind` для сцени й гравців `null`, як позначка ×2/×3. Ведучий бачить типи всіх клітинок. Після відкриття всі бачать `cell.kind`, `cell.answerMode` і `cell.penalty`: штраф показується разом з написом «Бліц», щоб гравці знали ставку.
- **«Відповідає».** `BoardInfo.turn` на бліц-клітинці лишається тим, хто вибрав (йому ×2). Хто відповідає зараз, екрани беруть з голови черги `blitz.queue[0]`.
- **«Закрити клітинку».** Окремої події немає: це наявний `host:lock` з підписом «Закрити клітинку» на бліц-клітинці.
- **Редактор.** Нова клітинка отримує явний `answerMode`, рівний типовому способу раунду. Коли автор змінює типовий спосіб, клітинки без власного поля (зі старої вікторини) спершу отримують попередній спосіб явно (`withDefaultMode`). Отже, налаштування раунду ніколи не змінює вже наявних клітинок. «Перевірка» в налаштуваннях раунду показується, коли хоча б одна клітинка відповідає з телефона.
- **Демо.** `apps/web/src/demo-quiz.ts` лишається класичною розминкою: поля в ній немає. Бліц-клітинки й мішане поле отримують `apps/server/scripts/demo-quiz.ts` і `party-quiz.ts`.

## Глобальні обмеження

- Звичайна клітинка поводиться точно як зараз. Стара вікторина без нових полів відкривається й грається так само, а стара історія показується (`kind` береться з типового значення схеми знімка).
- Рушій чистий: без мережі, бази й таймерів. `now` і `rng` передаються аргументами.
- Значення (точно зі специфікації):
  - свій правильний відповідач отримує ціну ×2, суперник — ціну;
  - позначка ×2/×3 і множник раунду множаться зверху;
  - «Мінус для всіх» знімає ціну × позначку × множник раунду (без ×2) з кожного, крім автора правильної відповіді, включно з тим, хто вибрав, і з тими, хто не натискав;
  - спроб без обмежень; рахунок може бути від'ємним;
  - `penalty` раунду на бліц-клітинку не діє.
- Тип клітинки — перелік `CELL_KINDS`. Новий тип у майбутньому додається одним значенням і гілкою там, де читається `board.kind`.
- Захист від спойлерів: до прийняття зрізи сцени й гравців не містять правильної відповіді; до відкриття клітинки не містять її типу й способу відповіді.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`; кольори лише через наявні токени `styles.css`.
- Кожна задача починається з тесту, що падає. Перед комітом зелені `pnpm vitest run --maxWorkers=2` і `pnpm typecheck`. Саме `--maxWorkers=2`, а не `pnpm test`: паралельні робітники PGlite падають під навантаженням на цій машині.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (побажання власника: проєкт тестовий). Міграцій немає.

## Порядок збирання

- Задача 1 робить `kind` і `penalty` обов'язковими у вихідному типі `BoardCell`. У тій самій задачі механічно оновлюються всі місця, що будують клітинки в коді:
  - фікстура `boardRound`;
  - помічник `cell` у `apps/server/scripts/demo-quiz.ts`;
  - `draft.ts`, `BoardEditor.addCell`;
  - тести, що будують клітинки вручну.
- Задача 2 прибирає `BoardInfo.answerMode` (тепер `BoardInfo.cell.answerMode`). Вона ж механічно замінює його використання в `apps/web/src/screens/*` і фабриках зрізів у їхніх тестах, щоб `apps/web` компілювався.
- Задача 4 додає `HostBlitz.voice` і так само додає `voice: false` у фабрики зрізів.
- Наскрізні сценарії (`pnpm e2e`) не входять у `vitest run`. Наявні сценарії мають лишатися зеленими після кожної задачі, бо звичайна клітинка не змінюється.

## На що дивитися рецензентові

1. **Бліц-клітинка з телефона: відповідь голови помаранчева, а таймер запитання спливає.** Годинник стоїть під час утримання, тож таймер не спливає, доки ведучий не вирішить. Після «Прийняти» (неправильно) наступні в черзі відповідають у своє вікно, нові натискання після кінця таймера відмовляють. Тест: задача 3, `after the timer no new buzz is taken and the queue is still decided in order`.
2. **Усна бліц-клітинка після кінця таймера з людьми в черзі.** Черга не згоряє автоматично, ведучий оцінює кожного по черзі. Без оцінок вихід дає «Закрити клітинку». Тест: задача 3, `a voice blitz cell: the host judges the head, the timer runs, the queue waits after the timer`.
3. **Ведучий тисне «Закрити клітинку», поки відповідь помаранчева, а штраф «Мінус для всіх».** Бали не отримує ніхто, кожен втрачає ціну рівно один раз: «Показати відповідь» і `unansweredIsWrong` нічого не додають. Тест: задача 4, `closing the cell with a pending answer gives nobody points and charges everyone once`.
4. **Раунд зі штрафом `minus` і бліц-клітинка без штрафу.** Неправильні спроби коштують 0, а той, хто вибрав і не натискав, на розкритті не отримує «неправильно» з мінусом. Тест: задача 4, `the round penalty never applies to a blitz cell`.
5. **Вилучено того, хто вибрав бліц-клітинку, або голову черги з помаранчевою відповіддю.** Черга йде далі, утримання переходить до наступної відповіді (наявна логіка бліцу), штраф не нараховується вилученому. Тест: задача 3, `kicking the chooser or the pending head keeps a blitz cell going`.

---

### Задача 1: схема клітинки

**Files:**
- Modify: `packages/shared/src/quiz.ts`, `packages/shared/src/index.ts` (якщо експорт не зірочкою)
- Modify (механічно, лише щоб компілювалося): `packages/engine/src/testing/fixtures.ts`, `apps/server/scripts/demo-quiz.ts` (`cell`), `apps/web/src/editor/draft.ts`, `apps/web/src/editor/BoardEditor.tsx` (`addCell`), тести, що будують `BoardCell` літералом
- Test: `packages/shared/src/quiz.test.ts`

**Interfaces:**
- Produces (shared, `quiz.ts`):
  ```ts
  export const CELL_KINDS = ['normal', 'blitz'] as const;
  export type CellKind = (typeof CELL_KINDS)[number];
  export const ANSWER_MODES = ['phone', 'voice'] as const;
  export type AnswerMode = (typeof ANSWER_MODES)[number];
  export const CELL_PENALTIES = ['none', 'all'] as const;
  export type CellPenalty = (typeof CELL_PENALTIES)[number];

  export const boardCellSchema = z.object({
    mark: z.enum(CELL_MARKS),
    kind: z.enum(CELL_KINDS).default('normal'),
    /** Немає — спосіб раунду (старі вікторини). */
    answerMode: z.enum(ANSWER_MODES).optional(),
    /** Лише для kind 'blitz'. */
    penalty: z.enum(CELL_PENALTIES).default('none'),
    question: questionSchema,
  });
  // boardRoundSchema.answerMode: z.enum(ANSWER_MODES), коментар: «типовий спосіб для нових клітинок і для клітинок без власного»;
  // check: «для клітинок з телефона».

  /** Спосіб відповіді клітинки: власний або, якщо його немає, раунду. */
  export function cellAnswerMode(round: BoardRound, cell: BoardCell): AnswerMode;
  ```
- Produces (fixtures): `boardRound(id, categories, options)` приймає клітинки як `Question | (Partial<BoardCell> & { question: Question })` і доповнює `{ mark: 'none', kind: 'normal', penalty: 'none' }`.

- [ ] **Step 1: Write the failing tests** у `quiz.test.ts`:

```ts
it('an old board cell reads as a normal cell with the round answer mode', () => {
  // наявна вікторина-поле (answerMode раунду 'voice'), клітинка { mark: 'none', question } без нових полів →
  // quizSchema.parse ok; cell.kind === 'normal', cell.penalty === 'none', cell.answerMode === undefined;
  // cellAnswerMode(round, cell) === 'voice'
});
it('a cell may have its own kind, answer mode and penalty', () => {
  // { mark: 'x2', kind: 'blitz', answerMode: 'phone', penalty: 'all', question } у раунді 'voice' → ok;
  // cellAnswerMode(round, cell) === 'phone'
});
it('an unknown cell kind, answer mode or penalty is refused', () => {
  // kind 'mega' → fail; answerMode 'radio' → fail; penalty 'half' → fail
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 packages/shared`
Expected: FAIL (`cellAnswerMode` не існує, `kind` undefined).

- [ ] **Step 3: Implement** схему, `cellAnswerMode` і механічні правки місць, що будують клітинки (нова клітинка в `draft.ts` і `BoardEditor` отримує `kind: 'normal'`, `penalty: 'none'`; явний `answerMode` з'явиться в задачі 6).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS; наявні тести зелені без змін очікувань.

- [ ] **Step 5: Commit**

```bash
git add packages apps
git commit -m "feat(shared): board cells get a kind, an answer mode and a blitz penalty"
```

---

### Задача 2: спосіб відповіді кожної клітинки в рушії та зрізах

**Files:**
- Modify: `packages/engine/src/game.ts` (`BoardPlay`, `submitBoardAnswer`, `overrideBoard`), `packages/engine/src/board.ts` (`pickCell`), `packages/engine/src/hold.ts` (`pendingOf`), `packages/engine/src/views.ts` (`boardInfo`, `hostBoard`, `spotlightOf`)
- Modify: `packages/shared/src/views.ts` (`BoardCellView`, `BoardInfo`, `HostBoard`)
- Modify (механічно): `apps/web/src/screens/HostScreen.tsx`, `PlayerScreen.tsx`, `StageScreen.tsx` і фабрики зрізів у їхніх тестах: `board.answerMode` → `board.cell?.answerMode`
- Create: `packages/engine/src/game.board-cells.test.ts`
- Test: `packages/engine/src/views.test.ts`

**Interfaces:**
- Consumes: `cellAnswerMode`, `CellKind`, `AnswerMode`, `CellPenalty` (задача 1).
- Produces (engine, `game.ts`): `BoardPlay` доповнюється полями
  ```ts
  kind: CellKind;
  answerMode: AnswerMode;
  /** Для kind 'blitz'. */
  penalty: CellPenalty;
  ```
  `pickCell` ставить їх з `found.cell` і `cellAnswerMode(round, found.cell)`.
- Produces (shared, `views.ts`):
  ```ts
  interface BoardCellView { /* … */ kind: CellKind | null }   // null — приховано, за тим самим правилом, що mark
  interface BoardInfo {
    // answerMode прибрано
    cell: { id: string; category: string; price: number; mark: CellMark; kind: CellKind; answerMode: AnswerMode; penalty: CellPenalty } | null;
    /* решта без змін */
  }
  // HostBoard.manual: cell.answerMode === 'voice' || round.check === 'manual'
  ```

**Правила:**
- `submitBoardAnswer`, `overrideBoard`, `pendingOf`, `spotlightOf` і `hostBoard` дивляться на `play.board.answerMode`, а не на `round.answerMode`.
- Звичайна клітинка з телефона й звичайна усна працюють так само, як раніше працював раунд з відповідним `answerMode`.

- [ ] **Step 1: Write the failing tests**

```ts
// game.board-cells.test.ts (гравці p1 Анна, p2 Богдан, p3 Віра; onBoard і finishCell — як у game.board.test.ts)
it('a phone cell in a voice round takes the answer from the phone', () => {
  // раунд answerMode 'voice', c11 { answerMode: 'phone' }; p1 вибирає c11 у 0 →
  // submitAnswer(p1, single b, 1000) ok; pendingOf → { playerId: 'p1' }; acceptAnswer → reveal, p1 100
});
it('a voice cell in a phone round is graded by the host', () => {
  // раунд 'phone', c11 { answerMode: 'voice' }: submitAnswer → wrong_phase; heldAt null;
  // override(p1, 'correct', 2000) → locked; після next → reveal, p1 100
});
it('a cell without its own mode follows the round', () => {
  // раунд 'voice', c11 без answerMode → plays[0].board.answerMode === 'voice'
});
// views.test.ts
it('players see a cell kind and answer mode only after the cell opens', () => {
  // c11 { kind: 'blitz', penalty: 'all', answerMode: 'voice' }; етап board:
  // stageView і playerView: клітинка c11 kind null; hostView: kind 'blitz'; у JSON зрізу гравця немає 'voice'
  // після pickCell c11: stageView.board.cell → { kind: 'blitz', answerMode: 'voice', penalty: 'all' }
});
it('the host grades by hand on a voice cell even in a phone round', () => {
  // раунд 'phone' check 'auto', c11 { answerMode: 'voice' } → hostView.board.manual === true; c12 (phone) → false
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 packages/engine`
Expected: FAIL (`board.answerMode` не існує, режим береться з раунду).

- [ ] **Step 3: Implement** поля `BoardPlay`, `pickCell`, заміни `round.answerMode` → `play.board.answerMode`, нову форму `BoardInfo` і механічні правки `apps/web`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages apps/web
git commit -m "feat(engine): each board cell answers by phone or aloud, hidden until it opens"
```

---

### Задача 3: бліц-клітинка — черга, відповіді, бали

**Files:**
- Create: `packages/engine/src/board-cells.ts`
- Modify: `packages/engine/src/blitz.ts`, `packages/engine/src/game.ts`, `packages/engine/src/hold.ts`, `packages/engine/src/index.ts`
- Test: `packages/engine/src/game.board-cells.test.ts`

**Interfaces:**
- Consumes: `BoardPlay.kind/answerMode/penalty` (задача 2), `DEFAULT_ANSWER_WINDOW` (shared).
- Produces (engine, `blitz.ts`):
  ```ts
  /** Правила черги одного запитання: бліц-раунд або бліц-клітинка. */
  export interface BlitzRules {
    /** Секунди вікна після натискання; null — без вікна. */
    answerWindow: number | null;
    attempts: 1 | 2 | 3 | null;
    /** 'voice' — відповідь уголос: голову черги оцінює лише ведучий, без утримання й без автоматичного відкидання. */
    check: 'auto' | 'manual' | 'voice';
    /** Бали спроби (без серії). */
    points(playerId: string, correct: boolean): number;
  }
  export function blitzRulesOf(state: GameState, play: Play): BlitzRules | null;
  ```
- Produces (engine, `board-cells.ts`; з `game.ts` і `blitz.ts` лише типи):
  ```ts
  export const CELL_OWN_BONUS = 2;
  /** answerWindow: phone → DEFAULT_ANSWER_WINDOW, voice → null; attempts null; check: voice → 'voice', інакше round.check;
   *  points: правильна → round(price × (playerId === chooserId ? 2 : 1) × board.multiplier × round.rules.multiplier), неправильна → 0. */
  export function cellBlitzRules(round: BoardRound, board: BoardPlay): BlitzRules;
  ```

**Правила:**
- **`openQuestion`** створює `blitz: { queue: [], attempts: [], buzzed: [] }` і тоді, коли `board?.kind === 'blitz'`.
- **`blitz.ts`:** `openBlitz` повертає `{ play, blitz, rules }` для будь-якого запитання з `play.blitz`. У `buzz`, `settle`, `hasAttemptsLeft`, `blitzDone` і `attemptsUsed` раунд замінюється на `rules`.
  - **`settle`** при `rules.check === 'voice'` трактує голову як таку, що чекає на рішення ведучого, незалежно від `answer` і часу. Утримання (`holdAt`) ставиться лише для голови з `answer !== null`.
  - **`applyVerdict`** при `'voice'` не вимагає `head.answer !== null`.
- **`game.ts`:** умови `round.type === 'blitz'` у `submitAnswer`, `autoLock`, `tick`, `acceptAnswer` і `judge` замінюються на `play.blitz !== undefined` / `blitzRulesOf(...)`.
  - `submitAnswer` на бліц-клітинці йде в `submitBlitzAnswer`; при `'voice'` відмовляє з `wrong_phase`.
  - `acceptAnswer` на черзі вимагає `check === 'auto'`.
  - `judge` вимагає `check !== 'auto'`.
- **`hold.ts`:** `pendingOf` бере голову черги, коли `play.blitz !== undefined`. Для `'voice'` голова без відповіді, тож `null` виходить сам.
- **`overrideBoard`** на бліц-клітинці відмовляє з `wrong_phase`; `unansweredIsWrong` бліц-клітинку пропускає.
- Хід після бліц-клітинки рахує наявний `advanceTurn` у `pickCell`: окремої логіки не треба.

- [ ] **Step 1: Write the failing tests** у `game.board-cells.test.ts`, `describe('blitz cell')`. Поле: `c11` `{ kind: 'blitz' }` за 100, `single` (правильна `b`, `timeLimit` 20). p1 вибирає `c11` у момент 0.

```ts
it('everyone including the chooser may buzz', () => {
  // buzz p1 у 1000, p2 у 2000 → queue [p1, p2], deadline p1 16000 (вікно 15 с)
});
it('the chooser answering first gets the price twice', () => {
  // p1 buzz, answer b, acceptAnswer(p1) → locked; next → reveal; бали p1 200, p2 0, p3 0
});
it('an opponent answering first gets the price', () => {
  // p2 buzz, answer b, accept → p2 100
});
it('the cell mark and the round multiplier stack on top', () => {
  // c11 mark x3, rules.multiplier 2: p1 правильно → 1200; окрема гра: p2 правильно → 600
});
it('a wrong answer passes the queue on and the wrong player may buzz again at the end', () => {
  // p2 buzz, p3 buzz; p2 answer a, accept → queue [p3], attempts [p2 wrong 0]; buzz p2 → queue [p3, p2];
  // p3 answer a, accept; p2 answer a, accept; p2 buzz ще раз → ok (спроб без обмежень)
});
it('after the timer no new buzz is taken and the queue is still decided in order', () => {
  // p2 buzz у 10000 (deadline 25000), p3 buzz у 19000; tick(21000) → question; buzz p1 у 21000 → time_over;
  // p2 answer a у 22000 → heldAt 22000; accept → p3 голова; p3 answer b, accept → locked, p3 100
});
it('nobody correct gives nobody points', () => {
  // p2 buzz, answer a, accept; tick(20000) → locked; усі бали 0
});
it('the host closes the cell at any time, a pending answer gives nothing', () => {
  // p2 buzz, answer b (помаранчева), lock → locked; next → reveal; усі бали 0
});
it('the turn moves on as usual after a blitz cell', () => {
  // після закриття й next до board → chooserOf === 'p2'
});
it('a voice blitz cell: the host judges the head, the timer runs, the queue waits after the timer', () => {
  // c11 { kind: 'blitz', answerMode: 'voice' }: p2 buzz (deadline null); submitAnswer p2 → wrong_phase; heldAt null;
  // acceptAnswer → wrong_phase; judge(p2, false) → queue []; p3 buzz у 15000; tick(25000) → question;
  // judge(p3, true) → locked, p3 100
});
it('manual check on a phone blitz cell goes through judge', () => {
  // round check 'manual': p2 answer b → pending; acceptAnswer → wrong_phase; judge(p2, true) → locked, p2 100
});
it('repick on a blitz cell lets the head answer again from the same window', () => {
  // p2 buzz у 1000, answer a у 3000 (heldAt 3000); repick у 9000 → heldAt null, deadline 22000; answer b, accept → p2 100
});
it('a host grade is refused on a blitz cell', () => {
  // після закриття і next → reveal: override(p2, 'correct') → wrong_phase
});
it('kicking the chooser or the pending head keeps a blitz cell going', () => {
  // p2 buzz, p3 buzz; p2 answer a (помаранчева), p3 answer b; removePlayer(p2) → pendingOf p3; removePlayer(p1) → ok;
  // accept p3 → locked, p3 100
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 packages/engine/src/game.board-cells.test.ts`
Expected: FAIL (`buzz` → `wrong_phase` на клітинці поля).

- [ ] **Step 3: Implement** `board-cells.ts` (`cellBlitzRules`), `BlitzRules` і `blitzRulesOf` у `blitz.ts` та заміни в `game.ts` і `hold.ts` за правилами вище.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS; `game.blitz.test.ts` і `game.board.test.ts` зелені без змін.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): a blitz cell runs the blitz queue, own cell pays double"
```

---

### Задача 4: штраф «Мінус для всіх» і зрізи бліц-клітинки

**Files:**
- Modify: `packages/engine/src/board-cells.ts`, `packages/engine/src/game.ts` (`lockNow`), `packages/engine/src/views.ts`
- Modify: `packages/shared/src/views.ts` (`HostBlitz`)
- Modify (механічно): фабрики `HostBlitz` у `apps/web/src/screens/*.test.tsx` (`voice: false`)
- Test: `packages/engine/src/game.board-cells.test.ts`, `packages/engine/src/views.test.ts`

**Interfaces:**
- Consumes: `cellBlitzRules`, `blitzRulesOf` (задача 3).
- Produces (engine, `board-cells.ts`):
  ```ts
  /** Штраф «Мінус для всіх»: −round(price × board.multiplier × round.rules.multiplier). */
  export function cellPenaltyPoints(round: BoardRound, board: BoardPlay): number;
  /** Для бліц-клітинки з penalty 'all': кожному гравцеві, крім автора правильної відповіді, додає штраф до запису
   *  (або створює запис { answer: null, timeMs: 0, accepted: false, accuracy: 0, grade: 'wrong', overridden: false }). Інакше стан без змін. */
  export function withCellPenalty(state: GameState): GameState;
  ```
  `lockNow` викликає `withCellPenalty` перед `withTotals`.
- Produces (shared): `HostBlitz.voice: boolean`; `HostBlitz.manual` тепер `check !== 'auto'`.

**Правила зрізів:**
- `currentBlitz` у `views.ts` повертає `{ play, blitz, rules }` для будь-якого `play.blitz`. Тому `blitzInfo`, `playerBlitz` (з `rules.attempts`) і `hostBlitz` працюють і на бліц-клітинці.
- `spotlightOf` для `rules.check === 'voice'` повертає `null`: відповіді на телефоні немає.
- Правильної відповіді в зрізах сцени й гравців, як і раніше, немає.

- [ ] **Step 1: Write the failing tests**

```ts
// game.board-cells.test.ts, describe('blitz cell penalty'); c11 { kind: 'blitz', mark: 'x2', penalty: 'all' } за 100
it('penalty all charges everyone but the winner, the chooser included, never the ×2', () => {
  // p1 buzz, answer a, accept; p2 buzz, answer b, accept → reveal: p2 200, p1 −200, p3 −200
});
it('penalty all when the chooser wins: the chooser keeps ×2, the others lose the price', () => {
  // p1 правильно → p1 400, p2 −200, p3 −200
});
it('nobody correct with penalty all: everyone loses', () => {
  // tick(20000) з порожньою чергою → усі −200
});
it('closing the cell with a pending answer gives nobody points and charges everyone once', () => {
  // p2 answer b помаранчева; lock; next → reveal; endRound → усі рівно −200 (не −400)
});
it('penalty none charges nobody', () => {
  // penalty 'none': p2 неправильно, tick(20000) → усі 0
});
it('the round penalty never applies to a blitz cell', () => {
  // rules.penalty 'minus', клітинка penalty 'none': p2 answer a, accept → attempt.points 0; tick(20000), next → reveal: усі 0
});
// views.test.ts
it('a blitz cell shows the queue, own buzz state and the pending answer to everyone, never the correct answer', () => {
  // p2 buzz, answer b: playerView(p3).me.blitz → { canBuzz: true, attemptsLeft: null, position: null };
  // stageView.blitz.queue[0].nickname 'Богдан'; stageView.spotlight.grade null;
  // JSON.stringify(stageView) і playerView(p3) не містять 'correctId'
});
it('a voice blitz cell marks the queue for the host to judge and shows no spotlight', () => {
  // hostView.blitz → { voice: true, manual: true }; stageView.spotlight null
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 packages/engine`
Expected: FAIL (штрафу немає; `blitz` у зрізах `null` на клітинці).

- [ ] **Step 3: Implement** `cellPenaltyPoints`, `withCellPenalty`, виклик у `lockNow`, узагальнений `currentBlitz` і `HostBlitz.voice`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages apps/web
git commit -m "feat(engine): blitz cell penalty for everyone, blitz cell views"
```

---

### Задача 5: кімната, журнал і історія

**Files:**
- Modify: `apps/server/src/db/schema.ts` (константа), `apps/server/src/recorder.ts` (`answerRows`), `apps/server/src/history.ts` (`cellResult`, `responsesOf`)
- Modify: `packages/shared/src/history.ts` (`GameQuestionResult.cell`)
- Modify: `apps/web/src/pages/GameHistory.tsx`, `apps/web/src/i18n.ts`
- Test: `apps/server/src/rooms/manager.test.ts`, `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts`, `apps/web/src/pages/History.test.tsx`

**Interfaces:**
- Consumes: усе з задач 3–4. Нових подій сокета немає: `player:buzz`, `player:answer`, `host:accept`, `host:repick`, `host:judge`, `host:lock` уже є.
- Produces (server, `db/schema.ts`):
  ```ts
  /** Номер рядка answer зі штрафом бліц-клітинки; спроби мають номери 0…n. */
  export const PENALTY_ATTEMPT = -1;
  ```
- Produces (shared, `history.ts`): `GameQuestionResult.cell` доповнюється полями
  ```ts
  kind: CellKind;
  /** Бліц-клітинка: сума балів кожного учасника з рядками за це запитання (за турнірною таблицею); [] для звичайної. */
  scores: { nickname: string; points: number }[];
  ```

**Правила:**
- **`answerRows`** для бліц-запису додає після спроб рядок `{ attempt: PENALTY_ATTEMPT, payload: null, timeMs: 0, accepted: false, points: d, streakBonus: 0, overridden: false }`, де `d = record.basePoints − Σ attempt.points`, лише коли `d ≠ 0`. Це покриває й гравця без жодної спроби.
- **`responsesOf`** пропускає рядки з `attempt === PENALTY_ATTEMPT`.
- **`cellResult`** бере `kind` з клітинки знімка (у старих знімках `'normal'` за схемою), а `scores` рахує з усіх рядків.
- **`GameHistory.tsx`:**
  - для бліц-клітинки показує мітку «Бліц» і рядок «Віра: +400, Анна: −200, Богдан: −200» замість рядка вибравшого;
  - звичайна клітинка показується як зараз.

- [ ] **Step 1: Write the failing tests**

```ts
// manager.test.ts
it('a blitz cell runs through the room: buzz from any player, accept, close', () => {
  // поле з c11 { kind: 'blitz' }; host pick; manager.buzz(room, p2) ok; answer; host accept → phase locked, p2 100
});
// recorder.test.ts
it('a blitz cell records every attempt and one penalty row', async () => {
  // penalty 'all', mark 'x2', ціна 100: p1 неправильно, p2 правильно → рядки answer:
  // p1 [{attempt 0, accepted false, points 0}, {attempt -1, points -200}], p2 [{attempt 0, accepted true, points 200}],
  // p3 [{attempt -1, points -200}]
});
// history.test.ts
it('a blitz cell shows its kind and everyone’s points, penalty rows are not responses', async () => {
  // той самий сценарій → cell.kind 'blitz', cell.scores [{Богдан, 200}, {Анна, -200}, {Віра, -200}];
  // responses без записів із answer null для Анни (штрафного рядка) і Віри
});
it('an old game without cell kinds still renders', async () => {
  // quizSnapshot з клітинками { mark, question } → hostGame ok, cell.kind 'normal', cell.scores []
});
// History.test.tsx
it('shows a blitz cell with everyone’s points', () => {
  // деталі з cell { kind: 'blitz', scores: [...] } → текст «Бліц» і «Богдан: +200, Анна: −200, Віра: −200»
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 apps/server apps/web/src/pages`
Expected: FAIL (штрафних рядків немає, `kind` не існує).

- [ ] **Step 3: Implement** `PENALTY_ATTEMPT`, `answerRows`, `cellResult`, `responsesOf`, тип і `GameHistory.tsx` (ключ `cellBlitz: 'Бліц'`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/server apps/web
git commit -m "feat(history): blitz cell attempts and penalties in the game history"
```

---

### Задача 6: редактор — тип, спосіб відповіді й штраф кожної клітинки

**Files:**
- Modify: `apps/web/src/editor/draft.ts`, `apps/web/src/editor/BoardEditor.tsx`, `apps/web/src/editor/RoundSettings.tsx`, `apps/web/src/editor/draft-storage.ts`, `apps/web/src/i18n.ts`
- Test: `apps/web/src/editor/draft.test.ts`, `apps/web/src/editor/QuizEditor.test.tsx`

**Interfaces:**
- Consumes: `CELL_KINDS`, `ANSWER_MODES`, `CELL_PENALTIES`, `cellAnswerMode` (задача 1).
- Produces (`draft.ts`):
  ```ts
  /** Нова категорія: три клітинки з явним answerMode (раніше без параметра). */
  export function newBoardCategory(answerMode: AnswerMode): BoardCategory;
  /** Змінює типовий спосіб раунду; клітинки без власного answerMode спершу отримують попередній спосіб раунду явно. */
  export function withDefaultMode(round: BoardRound, mode: AnswerMode): BoardRound;
  ```

**Правила:**
- **Панель клітинки в `BoardEditor`**, під «Позначка», три поля:
  - «Тип клітинки»: «Звичайна» / «Бліц»;
  - «Як відповідати»: «З телефона» / «Усно», значення `cellAnswerMode(round, cell)`;
  - «Штраф бліцу»: «Без штрафу» / «Мінус для всіх», лише при `kind === 'blitz'`.
- **Кнопка клітинки на полі редактора** при `kind === 'blitz'` показує мітку «Бліц». У `aria-label` додається « бліц» після позначки: наявні мітки звичайних клітинок не змінюються.
- **`addCell` і `addCategory`** ставлять клітинкам `answerMode: round.answerMode`.
- **`RoundSettings` (поле):**
  - підпис стає «Спосіб відповіді для нових клітинок», а зміна йде через `withDefaultMode`;
  - «Перевірка відповідей з телефона» показується, коли `boardCells(round).some(c => cellAnswerMode(round, c.cell) === 'phone')`.
- **`draft-storage.reviveCategory`** зберігає `kind`, `answerMode`, `penalty`. Невідоме значення замінюється типовим (`'normal'`, без `answerMode`, `'none'`).
- Ключі `i18n.ts`:
  - `boardKind`, `boardKindNormal`, `boardKindBlitz`;
  - `boardCellMode`, `boardCellPenalty`, `boardPenaltyNone`, `boardPenaltyAll`;
  - змінений `boardAnswerMode`, `boardCheck`.

- [ ] **Step 1: Write the failing tests**

```ts
// draft.test.ts
it('a new category gets the given answer mode in every cell', () => {
  // newBoardCategory('voice').cells.every(c => c.answerMode === 'voice' && c.kind === 'normal' && c.penalty === 'none')
});
it('changing the round default keeps the modes of existing cells', () => {
  // раунд 'phone', клітинка A без answerMode, клітинка B 'voice' → withDefaultMode(round, 'voice'):
  // round.answerMode 'voice', A.answerMode 'phone', B.answerMode 'voice'
});
it('a stored draft keeps cell kinds, modes and penalties', () => {
  // збережена чернетка з клітинкою { kind: 'blitz', answerMode: 'voice', penalty: 'all' } → після читання та сама;
  // { kind: 'mega' } → 'normal'
});
// QuizEditor.test.tsx
it('each board cell gets a kind, an answer mode and a blitz penalty', async () => {
  // нове поле; клітинка 1/1: «Штраф бліцу» відсутній; «Тип клітинки» → «Бліц» → «Штраф бліцу» → «Мінус для всіх»;
  // «Як відповідати» → «Усно»; кнопка клітинки має «Бліц»; зберегти →
  // saved.rounds[0].categories[0].cells[0] містить { kind: 'blitz', penalty: 'all', answerMode: 'voice' }
});
it('the phone check setting shows only while some cell answers by phone', async () => {
  // усі клітинки «Усно» → «Перевірка відповідей з телефона» відсутня; одну назад «З телефона» → є
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 apps/web/src/editor`
Expected: FAIL.

- [ ] **Step 3: Implement** за правилами вище.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(editor): per-cell kind, answer mode and blitz penalty"
```

---

### Задача 7: екрани гри для бліц-клітинки й мішаного поля

**Files:**
- Modify: `apps/web/src/screens/Board.tsx`, `PlayerScreen.tsx`, `HostScreen.tsx`, `StageScreen.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/PlayerScreen.test.tsx`, `HostScreen.test.tsx`, `StageScreen.test.tsx`

**Interfaces:**
- Consumes: `BoardInfo.cell.{kind, answerMode, penalty}`, `BoardCellView.kind`, `HostBlitz.voice` (задачі 2, 4).

**Правила:**
- **`Board.tsx`:** незіграна клітинка з `kind === 'blitz'` (видно лише ведучому до відкриття) має мітку `.gb-kind` «Бліц».
- **Рядок клітинки на всіх трьох екранах** (там, де зараз `cellTitle` і позначка) для бліц-клітинки додає:
  - мітку «Бліц»;
  - рядок `cellBlitzRule`: «Відповідає перший, хто натисне «Відповісти». Хто вибрав клітинку, отримує ×2»;
  - при `penalty === 'all'` рядок `cellPenaltyAll`: «Мінус для всіх, хто не відповість правильно»;
  - замість «Відповідає <вибравший>» рядок `cellChosenBy`: «Вибір: {name}».

  «Відповідає <нік>» береться з голови черги, як у бліц-раунді.
- **`PlayerScreen`:**
  - гілка `me.blitz !== null` перевіряється раніше за гілки поля, тож на бліц-клітинці кожен (і той, хто вибрав) бачить запитання й `BlitzTurn`;
  - `BlitzTurn` отримує `voice`: при `voice` і `position !== null` замість поля відповіді показує «Відповідайте вголос»;
  - на розкритті бліц-клітинки кожен бачить власний `Result` з рядком переможця (умова `view.blitz !== null`, а не `round.type === 'blitz'`).
- **`HostScreen`:**
  - головна дія на бліц-клітинці підписана «Закрити клітинку» (`host:lock`);
  - панель «Відповіді» поля й `canGradeBoard` на бліц-клітинці не показуються, працюють панелі черги й спроб бліцу;
  - при `blitz.voice` голова черги має кнопки «Правильно» / «Неправильно» → `host:judge`;
  - ручна оцінка помаранчевої відповіді в черзі (`blitz.manual`) іде через `host:judge`, а не `host:override`: умова `blitz !== null ? judge : grade`.
- **`StageScreen`:** усну клітинку визначає `cell.answerMode`. Черга й переможець показуються як у бліц-раунді (`view.blitz !== null`).
- Ключі `i18n.ts`: `cellBlitz`, `cellBlitzRule`, `cellPenaltyAll`, `cellChosenBy`, `closeCell`. Стиль `.gb-kind` у `styles.css` на основі `.gb-mark`.

- [ ] **Step 1: Write the failing tests**

```ts
// PlayerScreen.test.tsx
it('on a blitz cell every player gets the buzz button, the chooser too', () => {
  // board.cell { kind: 'blitz', answerMode: 'phone', penalty: 'none' }, turn p1, me.blitz { canBuzz: true, position: null };
  // для me = p1 і для me = p2: кнопка «Відповісти», текст «Бліц» і «Вибір: Алла»
});
it('on a voice blitz cell the head of the queue answers aloud', () => {
  // cell answerMode 'voice', me.blitz.position 1 → «Відповідайте вголос», полів відповіді немає
});
it('the blitz cell reveal shows own points and the winner', () => {
  // reveal, me.result { grade: 'wrong', points: -200 }, blitz.winner Віра → «−200» і «Першим правильно відповів: Віра»
});
it('players see the penalty rule after a blitz cell opens', () => {
  // penalty 'all' → «Мінус для всіх, хто не відповість правильно»
});
// HostScreen.test.tsx
it('a blitz cell has the close-cell button and judge buttons for a voice head', async () => {
  // blitz { voice: true, manual: true, queue: [Богдан] } → «Закрити клітинку» шле host:lock;
  // «Правильно» шле host:judge { playerId: 'p2', correct: true }
});
it('a manual pending answer on a blitz cell is judged, not graded', async () => {
  // spotlight grade null, blitz.manual, board не null → «Неправильно» шле host:judge, а не host:override
});
it('the host board marks blitz cells', () => {
  // phase board, клітинка kind 'blitz' → .gb-kind «Бліц»
});
// StageScreen.test.tsx
it('the stage shows a blitz cell with the chooser and the queue', () => {
  // cell kind 'blitz', turn Алла, blitz.queue [Богдан] → «Бліц», «Вибір: Алла», «Відповідає Богдан», без «Відповідає Алла»
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 apps/web/src/screens`
Expected: FAIL.

- [ ] **Step 3: Implement** за правилами вище.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): blitz cells and per-cell answer modes on phone, host and stage"
```

---

### Задача 8: демо-вікторини й наскрізний сценарій

**Files:**
- Modify: `apps/server/scripts/demo-quiz.ts`, `apps/server/scripts/party-quiz.ts`
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе попереднє; наявні допоміжні функції e2e (`open`, `click`, `field`, `join`, `openRoundSettings`, `questionText`, `shot`, `snapshot`, `exact`).

- [ ] **Step 1: Демо.**
  - Помічник `cell` у `demo-quiz.ts` приймає необов'язкові `{ kind, answerMode, penalty }`.
  - Поле `r-board-phone` отримує:
    - одну бліц-клітинку без штрафу («Наука», 300);
    - одну бліц-клітинку «Мінус для всіх» («Кіно й музика», 400);
    - дві усні клітинки («Географія», 300 і «Кіно й музика», 300).
  - `party-quiz.ts` («Своя гра») отримує одну бліц-клітинку з `penalty: 'all'`, одну без штрафу й одну усну.
  - Обидві вікторини мають проходити `quizSchema` (наявні тести скриптів, якщо є, або `pnpm typecheck`).

- [ ] **Step 2: Новий сценарій** `it('a mixed board: a phone cell, blitz cells won by an opponent and by the chooser with penalty for all, a voice cell', …)`, з тією ж обгорткою `try / snapshot`, що й інші.

Редактор (ведучий створює акаунт, як у `boardGame`):
1. Один раунд поля 3×3 «Міста», «Річки», «Гори». Кожне запитання — варіанти «Так» (правильний) / «Ні», час 40 через «Застосувати».
2. «Річки, 100»: «Тип клітинки» → «Бліц».
3. «Гори, 100»: «Тип клітинки» → «Бліц», «Штраф бліцу» → «Мінус для всіх», «Позначка» → ×2.
4. «Міста, 200»: «Як відповідати» → «Усно».
5. Знімки `shot(host, 'cells-editor')` і, на ширині 390, `shot(host, 'cells-editor-phone')`.

Гра: гравці Алла, Богдан, Віра; порядок за приєднанням.
1. **Хід 1, Алла, «Міста, 100»** (звичайна, з телефона): Алла «Так» → «Прийняти» → Алла 100.
2. **Хід 2, Богдан, «Річки, 100»** (бліц без штрафу):
   1. До вибору сцена й телефони не мають мітки «Бліц» на полі, пульт має.
   2. Після вибору «Бліц» є на сцені й у всіх трьох телефонах, «Відповісти» є в Богдана теж.
   3. Алла тисне «Відповісти», потім Віра.
   4. Алла «Ні»: на сцені `.is-pending` і жодного `.is-correct`, у Віри «Відповідає Алла». Знімки `blitz-cell-pending-stage`, `blitz-cell-pending-host`, `blitz-cell-phone-other`.
   5. «Прийняти» (червона). Віра «Так» → «Прийняти» → «Показати відповідь» → Віра 100, Богдан 0.
3. **Хід 3, Віра, «Гори, 100 ×2»** (бліц, «Мінус для всіх»):
   1. На телефонах «Мінус для всіх, хто не відповість правильно».
   2. Богдан тисне «Відповісти» → «Ні» → «Прийняти».
   3. Віра тисне «Відповісти» → «Так» → «Прийняти» → «Показати відповідь».
   4. Рахунок на пульті: Віра 500 (100 + 400), Алла −100 (100 − 200), Богдан −200. Знімки `blitz-cell-reveal-stage`, `blitz-cell-reveal-phone`.
4. **Хід 4, Алла, «Міста, 200»** (усна): у Алли «Відповідайте вголос». Ведучий тисне «Зарахувати» → «Показати відповідь» → Алла 100. Знімок `voice-cell-phone`.
5. **Кінець:** «Завершити гру» з підтвердженням. В історії гри для «Гори, 100» є «Бліц» і «Віра: +400, Алла: −200, Богдан: −200». Знімок `history-cells`.

- [ ] **Step 3: Run it**

Run: `pnpm e2e`
Expected: PASS усіх сценаріїв (наявних і нового). З `E2E_SHOTS=1` у `apps/server/e2e/artifacts/shots` з'являються знімки, названі вище.

- [ ] **Step 4: Run unit tests and typecheck**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "test: a mixed board with blitz cells, penalty for all and a voice cell end-to-end"
```

Після фінальної рецензії гілки злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`. Render розгорне сам; міграцій у цьому плані немає.
