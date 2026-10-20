# План 5d: раунд «Фінал»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** новий тип раунду «Фінал» зі ставками. Сцена показує тему, кожен гравець таємно ставить від 0 до свого рахунку, потім усі відповідають на одне запитання на телефонах. Правильна відповідь дає «плюс ставка», неправильна або відсутня — «мінус ставка». Ведучий розкриває результати по одному гравцю.

**Архітектура:**
- **`shared`.** `finalRoundSchema` стає четвертим членом `roundSchema`. Новий етап `'wager'`, код помилки `'wager_invalid'`. `roundQuestions` для фіналу дає `[round.question]`.
- **`engine`.** `GameState` отримує `final: FinalState | null` зі ставками й порядком розкриття. Логіка в новому файлі `final.ts` (дії ставки) і в гілках `game.ts` (відповідь, оцінка, розкриття), як у поля.
- **Ставка зберігається в записі відповіді** (`AnswerRecord.wager`) і в новому стовпці `answer.wager` (міграція 0004), щоб історія показувала ставки.
- **Оцінка ведучого** при ручній перевірці йде через наявну подію `host:override`, як на полі.

**Технології:** TypeScript, zod, vitest, Fastify + Socket.IO, Drizzle (PostgreSQL / PGlite), React + Vite, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-16-rounds-and-rules-design.md`, розділи 8, 9, 10, 11, 12. Власник підтвердив 2026-10-20: ставки як у специфікації (+ставка / −ставка). Попередній план: `2026-10-17-plan-5c-board.md` (виконано; зразок для гілок нового типу раунду).

## Глобальні обмеження

- Класичний раунд, бліц, поле й стара вікторина поводяться точно як зараз. Наявні тести лишаються зеленими без змін очікувань, окрім механічних (нове поле `final: null` у зрізах, `wager` у записах).
- Рушій чистий: без мережі, бази й таймерів. `now` і `rng` передаються аргументами.
- Ставка — ціле число від 0 до `max(0, рахунок гравця на початку етапу ставок)`. Гравець з рахунком 0 або нижче може поставити лише 0.
- Бали фіналу: правильно `+ставка`, неправильно або без відповіді `−ставка`. Множники, серії, штраф, бонус за швидкість і часткові бали у фіналі не діють.
- Записи фіналу не продовжують і не обривають серії й не дають бонусу серії.
- Час відповідей у фіналі не входить у `totalTimeMs` (рівність за часом рахується лише за класичні раунди).
- Зрізи сцени й гравців не містять чужих ставок до розкриття цього гравця, правильної відповіді до `reveal` і нового рахунку гравця, поки його не розкрито.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`.
- Кожна задача починається з тесту, що падає. Перед комітом зелені `pnpm test` і `pnpm typecheck` для пакетів, які вже переведено (див. «Порядок збирання»).
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать.

## Порядок збирання

`apps/web` не проходить typecheck від задачі 1 до задачі 5: він не знає нового типу раунду й етапу `'wager'`. Задачі 1–3 зелені в `packages/shared` і `packages/engine`; задача 1 також в `apps/server`; задача 4 — в `apps/server`; з задачі 5 зелений увесь репозиторій. Задача 5 відповідає й за те, щоб екрани гри компілювалися (ключ `phase_wager`); повноцінні екрани робить задача 6.

## На що дивитися рецензентові

1. **Гравець відключився під час ставок.** Автоматичний перехід до запитання чекає на всіх, тож гра стоїть, доки ведучий не натисне «Далі»; хто не поставив, грає зі ставкою 0. Тест: задача 2, `the host opens the question without missing wagers and they count as zero`.
2. **Ставка більша за рахунок, дробова чи від'ємна, або гравець з від'ємним рахунком.** Відхиляється з `wager_invalid`, гра не падає; з рахунком −300 приймається лише 0. Тест: задача 2, `wagers outside 0..score are refused`.
3. **Сцена під час розкриття.** Нерозкриті гравці на сцені й у чужих телефонах показуються з рахунком до фіналу, без ставки й відповіді. Тест: задача 3, `the stage reveals final players one by one without spoilers`.
4. **Ведучий змінює оцінку вже розкритого гравця.** Бали й новий рахунок перераховуються, рядок на сцені оновлюється. Тест: задача 2, `the host can change a final grade at the reveal`.
5. **Ведучий вилучає гравця під час фіналу.** Його ставка й місце в порядку розкриття зникають, лічильник розкриття не перескакує через сусіда. Тест: задача 2, `kicking a player during the final keeps the reveal order`.

---

### Задача 1: схема раунду «Фінал»

**Files:**
- Modify: `packages/shared/src/quiz.ts`, `packages/shared/src/game.ts`, `packages/shared/src/quiz.test.ts`
- Modify: `packages/engine/src/testing/fixtures.ts`, `packages/engine/src/game.ts` (лише `nextQuestion`, щоб компілювалося)

**Interfaces:**
- Produces (shared, `quiz.ts`):
  ```ts
  export const finalRoundSchema = z.object({
    id, type: z.literal('final'), title,            // як у classicRoundSchema; title — тема фіналу
    shuffleOptions: z.boolean(),
    check: z.enum(['auto', 'manual']),
    question: questionSchema,
  });
  export type FinalRound = z.infer<typeof finalRoundSchema>;
  // roundSchema = discriminatedUnion('type', [classic, blitz, board, final]);
  // roundQuestions(final) → [round.question]
  ```
- Produces (shared, `game.ts`): `Phase` доповнюється `'wager'`; `ErrorCode` — `'wager_invalid'`.
- Produces (fixtures): `finalRound(id: string, question: Question, options?: Partial<Omit<FinalRound, 'id' | 'type' | 'question'>>): FinalRound` (типові: `title: ''`, `shuffleOptions: false`, `check: 'auto'`).

**Правила:**
- `questionsOf` і ліміти вікторини рахують запитання фіналу через `roundQuestions`.
- `nextQuestion` для фіналу повертає `undefined`: запитання відкриває етап ставок (задача 2).
- Усі місця в `engine`/`server`, де звужують тип раунду (`round.type === 'board' ? … : round.questions` тощо), мають компілюватися з четвертим типом; поведінку для фіналу дає задача 2.

- [ ] **Step 1: Write the failing tests** у `quiz.test.ts`:

```ts
it('a quiz with a final round passes the schema', () => {});
it('a final round needs exactly one valid question', () => {
  // без question → відхиляється; question з порожнім текстом → відхиляється
});
it('roundQuestions of a final round is its question', () => {});
it('question ids must be unique across a final and other rounds', () => {
  // той самий id у класичному раунді й у фіналі → 'duplicate_question_ids'
});
```

- [ ] **Step 2: Run** `pnpm vitest run packages/shared/src/quiz.test.ts` — FAIL.
- [ ] **Step 3: Implement** схему, тип, фікстуру, `roundQuestions`, `Phase`, `ErrorCode`, звуження типів.
- [ ] **Step 4: Run** `pnpm vitest run packages apps/server && pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine && pnpm exec tsc -p apps/server` — PASS, наявні тести без змін.
- [ ] **Step 5: Commit** `feat(shared): final round schema`

---

### Задача 2: рушій фіналу — ставки, відповіді, оцінка, розкриття

**Files:**
- Create: `packages/engine/src/final.ts`, `packages/engine/src/game.final.test.ts`
- Modify: `packages/engine/src/game.ts`, `packages/engine/src/index.ts`

**Interfaces:**
- Produces (engine, `game.ts`):
  ```ts
  export interface FinalState {
    /** Ставки гравців; гравця без ставки тут немає. */
    wagers: Record<string, number>;
    /** Межа ставки кожного гравця: max(0, рахунок) на вході в етап wager. */
    limits: Record<string, number>;
    /** Порядок розкриття: заповнюється на вході в reveal. */
    order: string[];
    /** Скільки гравців уже розкрито. */
    shown: number;
  }
  // GameState.final: FinalState | null (createGame → null; вхід у раунд фіналу → { wagers: {}, limits: {}, order: [], shown: 0 })
  // AnswerRecord.wager?: number — ставка запису фіналу.
  // Play.final?: { answers: Record<string, Answer> } — відповіді, що чекають на оцінку (check 'manual').
  ```
- Produces (`final.ts`):
  ```ts
  export function placeWager(state: GameState, playerId: string, amount: number, now: number, rng: Rng): Result;
  export function finalPoints(wager: number, correct: boolean): number; // correct ? wager : −wager
  ```

**Правила:**
- **Вхід.** `next` з `intro` раунду фіналу переводить в етап `'wager'` і записує `limits` для всіх гравців. Етап `'wager'` без таймера.
- **`placeWager`:** етап `'wager'` (`wrong_phase`), не пауза (`paused`), гравець у грі (`not_found`), ціле `amount` у межах `0..limits[playerId]` (`wager_invalid`). Ставку можна змінити, доки не відкрито запитання. Коли ставка є в кожного гравця зі `state.players`, запитання відкривається одразу (`openQuestion` з `now`, `rng`).
- **`next` з `'wager'`** відкриває запитання; гравці без ставки отримують 0.
- **Відповідь:** відповідають усі гравці, як у класиці (`already_answered`, `time_over`, `type_mismatch`). При `check: 'auto'` запис створюється одразу: точність 1 → `correct`, інакше `wrong` (часткових немає), `wager` у записі, бали `finalPoints`. При `check: 'manual'` відповідь кладеться в `play.final.answers`, запису немає. Коли відповіли всі, запитання закривається, як у класиці (`autoLock`).
- **Оцінка ведучого (`override`)** у фіналі: етапи `'locked'` і `'reveal'` (`wrong_phase` в інших); гравець у грі (`not_found`); `partial` → `partial_disabled`. Запис отримує відповідь із наявного запису або `play.final.answers`, `wager`, бали `finalPoints`, `overridden: phase === 'reveal'`.
- **`next` з `locked` у `reveal`:** кожен гравець без запису отримує запис `wrong` (відповідь із `play.final.answers` або `null`, бали `−ставка`); `order` — id гравців за зростанням рахунку перед фіналом (рахунок мінус бали фіналу), за рівності — у порядку приєднання; `shown = 0`.
- **`next` у `reveal` фіналу:** поки `shown < order.length`, лише `shown + 1`. Коли розкрито всіх, — звичайний перехід далі (`leaderboard` або кінець раунду).
- **Бали й підсумки:** записи фіналу мають `streakBonus: 0`, у `streakCounts` пропускаються (`continue`), у `totalTimeMs` не входять.
- **`removePlayer`** у фіналі прибирає ставку, межу й місце в `order`; якщо його індекс у `order` менший за `shown`, то `shown − 1`.
- `endRound`/`end` дозволені в етапі `'wager'` (`IN_ROUND` доповнюється). Раунд, завершений до розкриття, балів фіналу не дає (запитання без записів).

- [ ] **Step 1: Write the failing tests** у `game.final.test.ts`. Вікторина: класичний раунд з одним запитанням (щоб набрати рахунок), потім `finalRound('f1', single)`; гравці p1, p2, p3 з рахунками 1000, 400, 0 перед фіналом (через відповіді в першому раунді або пряме заповнення стану, як у наявних тестах).

```ts
it('the final starts with an intro, then secret wagers with limits from the score', () => {
  // next з intro → 'wager'; final.limits { p1: 1000, p2: 400, p3: 0 }
});
it('wagers outside 0..score are refused', () => {
  // p1 1001 → wager_invalid; −1 → wager_invalid; 1.5 → wager_invalid; p3 (рахунок −300) 1 → wager_invalid, 0 → ok
});
it('the question opens once everyone has wagered and wagers can change before that', () => {
  // p1 500, p1 600 (заміна), p2 400 → ще 'wager'; p3 0 → phase 'question'
});
it('the host opens the question without missing wagers and they count as zero', () => {
  // лише p1 поставив 500; next → 'question'; p2 відповідає неправильно → бали 0
});
it('a correct answer adds the wager and a wrong or missing one subtracts it', () => {
  // ставки 500 / 400 / 0; p1 правильно → +500 (1500); p2 неправильно → −400 (0); p3 мовчить → reveal → запис wrong, 0
});
it('multipliers, streaks and partial credit do not apply in the final', () => {
  // order-запитання з точністю 0.5 → wrong; серія з першого раунду не дає бонусу й не продовжується
});
it('manual check waits for the host and a missing grade is wrong at the reveal', () => {
  // check 'manual': p1 відповідає → запису немає, play.final.answers.p1 є; override(locked, p1, 'correct', t) → +ставка;
  // p2 відповів, але без оцінки → на reveal wrong, −ставка; override(p1, 'partial') → partial_disabled
});
it('the reveal goes player by player from the lowest score', () => {
  // order ['p3','p2','p1']; next → shown 1, 2, 3; ще next → 'leaderboard' або кінець раунду
});
it('the host can change a final grade at the reveal', () => {
  // p2 wrong −400 → override(reveal, p2, 'correct') → +400, overridden true, рахунок перераховано
});
it('kicking a player during the final keeps the reveal order', () => {
  // у wager: removePlayer(p2) → wagers і limits без p2, решта поставила → question;
  // у reveal з shown 2 (p3, p2 розкриті): removePlayer(p3) → order ['p2','p1'], shown 1
});
it('the host can end the final during the wagers', () => {
  // endRound у 'wager' → 'round_end' (або 'finished', якщо раунд останній), записів фіналу немає
});
```

- [ ] **Step 2: Run** `pnpm vitest run packages/engine/src/game.final.test.ts` — FAIL.
- [ ] **Step 3: Implement** `final.ts` і гілки фіналу в `game.ts` за правилами вище (`game.ts` не імпортує з `final.ts` значень, якщо це створює цикл; допоміжні функції без стану можна тримати в `final.ts` з імпортом лише типів, як `board-turns.ts`).
- [ ] **Step 4: Run** `pnpm vitest run packages/shared packages/engine && pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine` — PASS.
- [ ] **Step 5: Commit** `feat(engine): final round with secret wagers and a one-by-one reveal`

---

### Задача 3: зрізи стану для фіналу

**Files:**
- Modify: `packages/shared/src/views.ts`, `packages/engine/src/views.ts`
- Test: `packages/engine/src/views.test.ts`

**Interfaces:**
- Produces (shared):
  ```ts
  export interface FinalEntry {
    playerId: string;
    nickname: string;
    answer: Answer | null;
    grade: Grade;
    wager: number;
    /** Рахунок до фіналу й після нього. */
    before: number;
    after: number;
  }
  export interface FinalInfo {
    /** Тема — назва раунду (може бути порожньою). */
    theme: string;
    /** Скільки гравців уже поставили / усього. */
    placed: number;
    total: number;
    /** Розкриті гравці в порядку розкриття; лише на reveal. */
    shown: FinalEntry[];
    /** Скільки ще не розкрито; на reveal. */
    left: number;
  }
  export interface HostFinal extends FinalInfo {
    /** Усі ставки й записи, незалежно від розкриття. */
    wagers: { playerId: string; nickname: string; wager: number | null }[];
    entries: FinalEntry[];
    manual: boolean;
    /** Відповіді, що чекають на оцінку (check 'manual'). */
    pending: { playerId: string; nickname: string; answer: Answer }[];
  }
  // BaseView.final: FinalInfo | null — у раунді фіналу в етапах intro, wager, question, locked, reveal; інакше null
  // HostView.final: HostFinal | null
  // PlayerView.me.final: { wager: number | null; limit: number } | null — лише в раунді фіналу
  ```

**Правила:**
- `BETWEEN_QUESTIONS` доповнюється `'wager'`.
- Поки гравця не розкрито (етапи до `reveal` або індекс у `order` ≥ `shown`), у зрізах сцени й гравців (крім його власного телефона до `reveal`):
  - його рахунок у `players`, `standings` і `me.score` — рахунок до фіналу;
  - `me.result` гравця — `null`, доки його не розкрито;
  - ставка видима лише йому самому (`me.final.wager`).
- `stats` розкриття у фіналі — як у класиці (скільки правильно), показується на `reveal`.

- [ ] **Step 1: Write the failing tests:**

```ts
it('wagers stay secret: the stage sees only how many players placed', () => {
  // p1 поставив 500: JSON.stringify(stageView) і playerView(p2) не містять 500 як ставки; final.placed 1, total 3;
  // playerView(p1).me.final { wager: 500, limit: 1000 }
});
it('the stage reveals final players one by one without spoilers', () => {
  // reveal, shown 1 (p3): stageView.final.shown — лише p3 з before/after; рахунки p1, p2 у standings/players — до фіналу;
  // playerView(p2).me.result null і me.score — до фіналу; після shown 2 у p2 є result і новий рахунок
});
it('the host sees every wager, every entry and pending manual answers', () => {});
it('other rounds carry no final data', () => {});
```

- [ ] **Step 2: Run** `pnpm vitest run packages/engine/src/views.test.ts` — FAIL.
- [ ] **Step 3: Implement** типи й зрізи.
- [ ] **Step 4: Run** `pnpm vitest run packages/shared packages/engine && pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine` — PASS.
- [ ] **Step 5: Commit** `feat(engine): final wagers and reveal in role views`

---

### Задача 4: сервер — ставка, запис, історія

**Files:**
- Create: `apps/server/drizzle/0004_final_wager.sql` (+ оновлення `apps/server/drizzle/meta`)
- Modify: `packages/shared/src/events.ts`, `packages/shared/src/history.ts`, `apps/server/src/db/schema.ts`, `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`, `apps/server/src/recorder.ts`, `apps/server/src/history.ts`
- Test: `apps/server/src/rooms/manager.test.ts`, `socket.test.ts`, `recorder.test.ts`, `history.test.ts`

**Interfaces:**
- Produces (shared `events.ts`): `export const wagerSchema = z.object({ amount: z.number().int().min(0) });` і `'player:wager': (payload, ack: Ack) => void`.
- Produces (manager): `wager(room, playerId, amount): AckResult` (передає `this.now()`, `this.rng`).
- Produces (db): стовпець `answer.wager integer` (nullable), міграція `ALTER TABLE "answer" ADD COLUMN "wager" integer;`. Згенерувати через `drizzle-kit generate` у `apps/server` (так створено попередні міграції) і перевірити SQL та журнал у `meta`.
- Produces (shared `history.ts`): `GameQuestionResult.final: { entries: { nickname: string; wager: number; points: number; accepted: boolean }[] } | null` — ставки й результати фіналу в порядку зростання рахунку до фіналу (як у розкритті); для інших запитань `null`.

**Правила:**
- Recorder пише `wager` із запису (`null` для інших раундів). Оцінки, змінені на `locked`/`reveal`, перезаписують останнє закрите запитання наявним механізмом (тест підтверджує).
- Вилучений гравець в історії фіналу не показується (рядків немає через каскад).

- [ ] **Step 1: Write the failing tests:**

```ts
// manager.test.ts
it('final wagers go through the manager and open the question when everyone placed', () => {});
// socket.test.ts
it('player:wager is player-only and validated', () => {
  // ведучий → forbidden; { amount: -1 } і { amount: 1.5 } → invalid_payload
});
// recorder.test.ts
it('a final answer is stored with its wager', () => {
  // ставка 300, правильно → рядок answer: wager 300, points 300; інший гравець без відповіді → wager 200, points −200
});
// history.test.ts
it('history shows the final wagers and results', () => {
  // questions[k].final.entries [{ nickname: 'Віра', wager: 0, … }, …]; класичне запитання final null
});
```

- [ ] **Step 2: Run** `pnpm vitest run apps/server` — FAIL.
- [ ] **Step 3: Implement** подію, менеджер, сокет, міграцію, recorder, історію.
- [ ] **Step 4: Run** `pnpm vitest run packages apps/server && pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine && pnpm exec tsc -p apps/server` — PASS.
- [ ] **Step 5: Commit** `feat(server): final wagers in events, answers and game history`

---

### Задача 5: редактор — раунд «Фінал»

**Files:**
- Modify: `apps/web/src/editor/draft.ts`, `draft-storage.ts`, `RoundSettings.tsx`, `RoundStrip.tsx`, `QuizEditor.tsx`, `QuestionEditor.tsx`, `apps/web/src/format.ts`, `apps/web/src/i18n.ts`
- Modify (лише щоб компілювалося): екрани гри та історії
- Test: `apps/web/src/editor/draft.test.ts`, `QuizEditor.test.tsx`

**Interfaces:**
- Produces: `newFinalRound(): FinalRound` — `title: ''`, `shuffleOptions: false`, `check: 'auto'`, одне порожнє single-запитання. `QuestionEditor` отримує необов'язковий проп `showPoints?: boolean` (типово `true`).

**Правила:**
- «+ Раунд» пропонує четверту кнопку «Фінал». `roundLabel` для безіменного фіналу дає «Фінал».
- Для фіналу ліва колонка ховає список запитань, навігацію й «+ Запитання»; праворуч — `QuestionEditor` єдиного запитання з `showPoints={false}` (бали дає ставка).
- Налаштування фіналу: «Тема фіналу» (поле назви раунду з цим підписом), перемішування варіантів, «Перевірка» («Автоматично» / «Ведучий»). Правил балів (штраф, частково, серії, множник, швидкість) немає.
- `cleaned`, `problemsOf` (місце «Фінал: …»), `firstProblem`, `loadDraft` (без полів інших типів), підтвердження видалення раунду — підтримують фінал.

- [ ] **Step 1: Write the failing tests:**

```ts
// draft.test.ts
it('newFinalRound passes the schema once its question is filled', () => {});
it('a saved final draft comes back unchanged', () => {});
it('problemsOf names the final question problem', () => {});
// QuizEditor.test.tsx
it('adds a final round with a theme and a question and saves', async () => {
  // «+ Раунд» → «Фінал»; «Тема фіналу» → 'Космос'; запитання; поля «Бали» немає; зберегти → rounds[1] type 'final', title 'Космос'
});
it('final settings show only the check and shuffle', async () => {
  // немає t('speedBonus'), штрафу, серій, множника
});
```

- [ ] **Step 2: Run** `pnpm vitest run apps/web/src/editor` — FAIL.
- [ ] **Step 3: Implement**; тексти в `i18n.ts` (ключ `phase_wager` теж).
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck` — PASS (від цієї задачі зелений увесь репозиторій).
- [ ] **Step 5: Commit** `feat(web): final rounds in the quiz editor`

---

### Задача 6: гра — пульт, телефон, сцена й історія для фіналу

**Files:**
- Modify: `apps/web/src/screens/HostScreen.tsx`, `PlayerScreen.tsx`, `StageScreen.tsx`, `apps/web/src/pages/GameHistory.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `HostScreen.test.tsx`, `PlayerScreen.test.tsx`, `StageScreen.test.tsx`, тест `GameHistory`

**Правила:**
- **Пульт:**
  - `intro` фіналу: тема; головна кнопка «Почати фінал» (`host:next`);
  - `wager`: «Поставили {placed} з {total}», список гравців зі ставкою або «ще думає» (ведучий бачить суми), головна кнопка «Показати запитання» (`host:next`);
  - запитання й `locked`: як у класиці; при `manual` список `pending` з кнопками «Зарахувати» / «Не зараховувати» (`host:override`) на `locked` і `reveal`;
  - `reveal`: «Розкрито {n} з {total}», головна кнопка «Наступний гравець», поки є нерозкриті, потім звичайне «Далі»; кожен запис має кнопки зміни оцінки.
- **Телефон:**
  - `wager`: «Ваша ставка від 0 до {limit}», числове поле, кнопка «Поставити» (`player:wager`), після ставки «Ставка: {wager}» і можливість змінити; при `limit === 0` — «Ваш рахунок 0: ставка 0» і кнопка «Поставити 0»;
  - запитання — як у класиці; `reveal` — свій результат «+{wager}» / «−{wager}», коли гравця розкрито, до того «Чекаємо на розкриття».
- **Сцена:**
  - `intro`: «Фінал» і тема великими літерами;
  - `wager`: тема, «Ставки зроблено: {placed} з {total}»;
  - запитання — як у класиці;
  - `reveal`: правильна відповідь і стовпчик розкритих гравців: нікнейм, відповідь, ставка, «{before} → {after}»; останній розкритий виділений.
- **Історія:** запитання фіналу показує таблицю «гравець — ставка — результат» (`signed(points)`).
- Помилка `wager_invalid` має текст у `i18n.ts`.

- [ ] **Step 1: Write the failing tests:**

```ts
// HostScreen.test.tsx
it('shows who has wagered and opens the final question', async () => {});
it('reveals the next final player and regrades an entry', async () => {});
// PlayerScreen.test.tsx
it('places and changes a final wager within the limit', async () => {
  // limit 400: ввести 300 → «Поставити» → send('player:wager', { amount: 300 })
});
it('a player with no points can only wager zero', () => {});
it('a player waits for their own reveal', () => {});
// StageScreen.test.tsx
it('shows the theme, the wager count and revealed players only', () => {});
// GameHistory test
it('shows final wagers and results', () => {});
```

- [ ] **Step 2: Run** `pnpm vitest run apps/web/src/screens apps/web/src/pages` — FAIL.
- [ ] **Step 3: Implement** у стилі «Нічний ефір» (наявні класи `panel`, `rows`, `tag`, `btn`). Нові класи мають унікальні імена з префіксом `final-` (без перевизначення наявних класів).
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck` — PASS. Потім зібрати й зняти знімки екранів через `E2E_SHOTS=1` (задача 7 додає кадри) або вручну переглянути в браузері, що нічого не накладається на телефоні 360 px.
- [ ] **Step 5: Commit** `feat(web): final wagers and reveal on host, phone and stage`

---

### Задача 7: наскрізний сценарій фіналу

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

- [ ] **Step 1: Write the scenario** `it('a final round: secret wagers, a one-by-one reveal and the podium', …)`.

Підготовка: вікторина з класичним раундом (одне запитання з одним правильним варіантом, 1000 балів, без бонусу за швидкість) і фіналом «Космос» (одне запитання з одним правильним варіантом, перевірка автоматична). Троє гравців: A, B, C.

Хід гри:
1. Класичний раунд: A і B відповідають правильно (по 1000), C неправильно (0).
2. Фінал: на заставці тема «Космос»; «Почати фінал».
3. Ставки: A 1000, B 300, C 0 (поле з межею 0). Запитання відкривається само, коли поставили всі.
4. A неправильно, B правильно, C правильно.
5. Розкриття: C (0 → 0), B (1000 → 1300), A (1000 → 0) — по одному, сцена показує кожного.

Очікування:
- подіум: B 1300, C 0 і A 0 (ділять місце або в порядку правил рівності — перевірити точні числа, не порядок рівних);
- історія показує фінал зі ставками 1000, 300, 0 і результатами −1000, +300, 0.
- Кадри `E2E_SHOTS`: `final-wager-phone`, `final-wager-stage`, `final-reveal-stage`, `final-reveal-host`.

- [ ] **Step 2: Run** `pnpm e2e` — PASS усіх сценаріїв.
- [ ] **Step 3: Commit** `test: final round end-to-end`

Після фінальної рецензії гілку злити в `main`, запустити `pnpm test` і `git push origin main`. Міграцію 0004 Render застосує сам під час старту сервера.
