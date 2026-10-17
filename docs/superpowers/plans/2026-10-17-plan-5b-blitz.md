# План 5b: раунд «Бліц»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** новий тип раунду «бліц»: гравці натискають «Відповісти» і стають у чергу, відповіді
перевіряються по черзі, бали отримує перший, хто відповів правильно; ведучий налаштовує вікно
відповіді, кількість спроб, спосіб перевірки, штраф, серії й множник.

**Архітектура:** у `shared` з'являється `blitzRoundSchema` як другий член `roundSchema`. У
`engine` зігране запитання бліцу (`Play`) отримує поле `blitz` з чергою натискань і списком
розглянутих спроб; підсумок спроб кожного гравця лишається звичайним `AnswerRecord` у
`play.answers`, тож рахунок, серії, рейтинг і зрізи працюють через наявний код. Логіка черги
живе в окремому файлі `packages/engine/src/blitz.ts`. Сервер планує таймер за новою функцією
`nextDeadline`, бо в бліці, крім кінця запитання, спливають вікна відповіді. У базі кожна спроба
стає окремим рядком `answer` (новий стовпець `attempt`).

**Технології:** TypeScript, zod, vitest, Fastify + Socket.IO, Drizzle (PostgreSQL / PGlite), React + Vite, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-16-rounds-and-rules-design.md`, розділи 4, 6, 9, 10, 11, 12.
Попередній план: `docs/superpowers/plans/2026-10-16-plan-5a-rounds-foundation.md` (виконано).

## Глобальні обмеження

- Класичний раунд і стара вікторина поводяться точно як зараз; усі наявні тести лишаються зеленими без змін очікувань, крім тих, що прямо названо в задачах.
- Рушій чистий: без мережі, бази й таймерів; час (`now`) і генератор випадкових чисел передаються аргументами.
- Зрізи гравця й сцени не містять правильної відповіді до етапу `reveal`; переможець запитання бліцу в них теж з'являється лише з `reveal`.
- У бліці правильною вважається лише відповідь з точністю 1; часткових балів і балів за швидкість немає.
- Бали за вигране запитання `round(P × множник)` плюс бонус серії; штраф за кожну неправильну спробу `−round(P × множник)`, якщо в раунді `penalty: 'minus'`.
- Оцінка в бліці остаточна: `override` у раунді бліцу повертає `wrong_phase`.
- Рахунок може бути від'ємним.
- Тексти інтерфейсу українською, лише через словник `apps/web/src/i18n.ts`.
- Кожна задача починається з тесту, що падає. Перед комітом зелені `pnpm test` і `pnpm typecheck` для пакетів, які вже переведено (див. «Порядок збирання»).
- Після останньої задачі гілку зливають у `main` і пушать (побажання власника: проєкт тестовий).

## Порядок збирання

Нового члена `roundSchema` не знає редактор (`apps/web`), тому `apps/web` не проходить
typecheck від задачі 1 до задачі 5. Вимога для комітів: задачі 1–3 зелені в `packages/shared` і
`packages/engine`; задача 4 також в `apps/server`; з задачі 5 зелений увесь `pnpm test` і
`pnpm typecheck`.

## На що дивитися рецензентові

1. Гравець натиснув «Відповісти» й зник (закрив вкладку). Черга не повинна застрягти: при ввімкненому вікні спроба згорає за вікном; при вимкненому вона згорає з кінцем таймера запитання; ведучий завжди може закрити запитання. Тест: задача 2, `a disconnected head of the queue burns out when the window ends`.
2. Ведучий вилучає гравця, що стоїть першим у черзі. Наступний у черзі, який уже відповів, має перевірятися одразу, без очікування таймера. Тест: задача 2, `kicking the head of the queue checks the next answer at once`.
3. Пауза під час бліцу: вікна відповіді не спливають на паузі, а після продовження кожен має стільки часу, скільки лишалося. Тест: задача 2, `pause freezes answer windows`.
4. Час запитання сплив, а в черзі ще є люди з відкритим вікном: їхні відповіді приймаються й перевіряються, нові натискання ні. Тест: задача 1, `after the timer the queue is still checked but nobody can buzz`.
5. Стара гра в історії й класична вікторина рахують «відповіли» за гравцями, а не за рядками; у бліці один гравець може мати кілька рядків-спроб на запитання. Тест: задача 4, `history counts a player with two blitz attempts once`.

---

### Задача 1: схема бліцу й черга в рушії (автоматична перевірка)

**Files:**
- Modify: `packages/shared/src/quiz.ts`, `packages/shared/src/game.ts`
- Create: `packages/engine/src/blitz.ts`, `packages/engine/src/game.blitz.test.ts`
- Modify: `packages/engine/src/game.ts`, `packages/engine/src/index.ts`, `packages/engine/src/testing/fixtures.ts`, `packages/shared/src/quiz.test.ts`

**Interfaces:**
- Produces (shared, `quiz.ts`):
  ```ts
  export const blitzRoundSchema = z.object({
    id, type: z.literal('blitz'), title,            // ті самі правила, що в classicRoundSchema
    shuffleOptions: z.boolean(),
    /** Секунди на відповідь після натискання; null — до кінця таймера запитання. */
    answerWindow: z.number().int().min(5).max(120).nullable(),
    /** Спроб на запитання; null — без обмежень. */
    attempts: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
    check: z.enum(['auto', 'manual']),
    rules: roundRulesSchema.extend({ partial: z.null() }),
    questions,                                       // як у classicRoundSchema
  });
  export type BlitzRound = z.infer<typeof blitzRoundSchema>;
  export const roundSchema = z.discriminatedUnion('type', [classicRoundSchema, blitzRoundSchema]);
  export const DEFAULT_ANSWER_WINDOW = 15;
  ```
- Produces (shared, `game.ts`): `ErrorCode` доповнюється `'not_in_queue' | 'already_queued' | 'no_attempts'`.
- Produces (engine, `game.ts`):
  ```ts
  export interface BuzzEntry {
    playerId: string;
    /** Час натискання. */
    at: number;
    /** Кінець вікна відповіді; null — до кінця таймера запитання. */
    deadline: number | null;
    answer: Answer | null;
  }
  export interface Attempt {
    playerId: string;
    /** null — не встиг відповісти. */
    answer: Answer | null;
    /** Від відкриття запитання до натискання. */
    timeMs: number;
    grade: 'correct' | 'wrong';
    /** round(P × множник) за правильну, штраф або 0 за неправильну; без бонусу серії. */
    points: number;
  }
  // Play отримує необов'язкове поле лише в раундах бліцу:
  blitz?: { queue: BuzzEntry[]; attempts: Attempt[] };
  // AnswerRecord.answer стає Answer | null (null — бліц, гравець не встиг відповісти).
  // GameState отримує pausedAt: number | null (потрібне задачі 2; createGame ставить null).
  ```
- Produces (engine, `blitz.ts`):
  ```ts
  export function buzz(state: GameState, playerId: string, now: number): Result;
  /** Розглядає голову черги, доки це можливо; now === null — без перевірки вікон і таймера. */
  export function settleQueue(state: GameState, now: number | null): GameState;
  /** Чи час закрити запитання бліцу; now === null — без умови таймера. */
  export function blitzDone(state: GameState, now: number | null): boolean;
  export function attemptsUsed(play: Play, playerId: string): number;
  ```
- Produces (fixtures): `blitzRound(id: string, questions: Question[], options?: Partial<Omit<BlitzRound, 'id' | 'type' | 'questions'>>): BlitzRound` з типовими `title: ''`, `shuffleOptions: false`, `answerWindow: 15`, `attempts: 1`, `check: 'auto'`, `rules: { ...DEFAULT_RULES, partial: null }`.

**Як працює черга (рішення плану, не додумувати інакше):**
- `buzz` можливий лише в етапі `question` раунду бліцу (`wrong_phase`), не на паузі (`paused`), для наявного гравця (`not_found`), до `endsAt` включно (`time_over`), якщо гравця ще немає в черзі (`already_queued`) і `attemptsUsed < attempts` (`no_attempts`; `null` без обмежень). Запис: `{ playerId, at: now, deadline: answerWindow === null ? null : now + answerWindow * 1000, answer: null }` у кінець черги.
- Вікно відповіді відлічується від натискання, а не від миті, коли гравець став першим: поки перший пише, наступні вже відповідають (специфікація, розділ 6).
- `submitAnswer` у раунді бліцу: гравець без запису в черзі отримує `not_in_queue`; запис уже має відповідь: `already_answered`; `now` після `deadline` (або після `endsAt`, коли `deadline === null`): `time_over`; тип не збігся: `type_mismatch`. Відповідь записується в його запис черги, далі `settleQueue(state, now)`, і якщо `blitzDone(state, now)`, запитання закривається так само, як `lock`.
- `settleQueue` у циклі дивиться на голову черги: якщо вже є переможець, зупинка; якщо голова має відповідь і `check === 'auto'`: точність `checkAnswer` дорівнює 1 → спроба `correct` з `round(P × множник)`, черга очищується (решта натискань просто зникає, без штрафу); інакше спроба `wrong` з балами `answerPoints({ points: P, accuracy: 0, speed: 1, multiplier, penalty })`, голова знімається, цикл далі. Голова без відповіді, чий час минув (`now >= deadline`, або `now >= endsAt` при `deadline === null`), дає спробу `wrong` з `answer: null` і тими самими штрафними балами. Інакше зупинка. При `now === null` гілка «час минув» не розглядається. Ручна перевірка (`check === 'manual'`) зупиняє цикл на голові з відповіддю (задача 2).
- Після кожної спроби підсумковий `AnswerRecord` гравця в `play.answers` перебудовується з усіх його спроб: `answer` — відповідь останньої спроби; `timeMs` — першої; `accepted`/`grade` — чи є серед них правильна (`'correct'`, інакше `'wrong'`); `accuracy` 1 або 0; `basePoints` — сума балів спроб; `streakBonus: 0`, `points: basePoints`, `overridden: false`.
- `blitzDone`: є правильна спроба; або черга порожня й жоден підключений гравець не може натиснути (не в черзі, спроби вичерпано); або (лише з `now`) черга порожня й `now >= endsAt`. Якщо підключених гравців немає, друга умова не діє.
- `lock`/`endRound`/`end` у бліці очищують чергу: нерозглянуті натискання не дають ні балів, ні штрафу.
- `tick` для запитання бліцу без паузи: `settleQueue(state, now)`, і якщо `blitzDone(state, now)`, закриття; інакше повертає новий стан (той самий об'єкт, якщо нічого не змінилося). Для класичного раунду `tick` не змінюється.
- `autoLock` для бліцу використовує `blitzDone(state, null)` замість «відповіли всі».
- Серії в бліці (`streakCounts`): гравець без запису в запитанні бліцу серію не обриває й не продовжує (не натискав); запис з `accuracy < 1` обриває; правильний продовжує.
- Бонус серії в `withTotals` для запитання бліцу рахується від балів виграшної спроби, а не від `basePoints` (там можуть бути штрафи тієї самої людини за попередню спробу).
- `totalTimeMs` у `withTotals` додає час лише за запитання класичних раундів (специфікація, розділ 10). Для класичних вікторин нічого не змінюється.
- `override` у раунді бліцу: `fail('wrong_phase')`.
- `openQuestion` для бліцу створює `blitz: { queue: [], attempts: [] }`.

- [ ] **Step 1: Write the failing tests** в `packages/engine/src/game.blitz.test.ts` (вікторина `makeRoundsQuiz([blitzRound('b1', [single, text], …)])`, гравці `lobbyWith(quiz, 'Анна', 'Богдан', 'Віра')` → p1, p2, p3; `single.correctId === 'b'`, `points: 1000`, `timeLimit: 20`):

```ts
it('the first correct answer in the queue wins the question', () => {
  // старт у 0; p1 натискає в 1000, p2 у 1500; p2 відповідає 'b' у 1600 — ще не перевіряється
  // p1 відповідає 'a' у 2000 → p1 wrong, p2 correct, етап 'locked'
  expect(state.phase).toBe('locked');
  expect(state.plays[0].blitz?.attempts.map((a) => [a.playerId, a.grade])).toEqual([['p1', 'wrong'], ['p2', 'correct']]);
  expect(state.players.find((p) => p.id === 'p2')?.score).toBe(1000);
  expect(state.players.find((p) => p.id === 'p1')?.score).toBe(0);
});
it('a wrong attempt costs the question price when the penalty is on', () => {
  // rules: { penalty: 'minus', multiplier: 2 }; p1 відповідає 'a' → p1 −2000; p2 правильно → +2000
});
it('a player with attempts left can buzz again and goes to the end of the queue', () => {
  // attempts: 2; p1 wrong, p1 знову buzz → черга [p3, p1], якщо p3 натиснув раніше
  // третій buzz p1 після ще однієї помилки → { ok: false, error: 'no_attempts' }
});
it('buzzing twice without answering is refused', () => {
  expect(buzz(state, 'p1', 1200)).toEqual({ ok: false, error: 'already_queued' });
});
it('an answer without buzzing is refused', () => {
  expect(submitAnswer(state, 'p1', { type: 'single', optionId: 'b' }, 1000)).toEqual({ ok: false, error: 'not_in_queue' });
});
it('a missed answer window counts as a wrong attempt with the penalty', () => {
  // answerWindow: 5, penalty 'minus'; p1 buzz у 1000; tick(state, 6000) → спроба { answer: null, grade: 'wrong', points: -1000 }
});
it('after the timer the queue is still checked but nobody can buzz', () => {
  // answerWindow: 15; p1 buzz у 19000; buzz p2 у 20001 → time_over; tick(20000) не закриває (p1 ще у вікні)
  // p1 відповідає 'b' у 25000 → correct, 'locked'
});
it('with the window off an unanswered buzz burns out with the question timer', () => {
  // answerWindow: null; p1 buzz у 1000, мовчить; tick(state, 20000) → спроба wrong з answer null, етап 'locked'
});
it('the question closes when nobody can buzz any more', () => {
  // attempts: 1; усі троє помилилися → 'locked' до кінця таймера, переможця немає, бали 0
});
it('lock drops the unchecked queue without points', () => {
  // p1 buzz, p2 buzz; lock → attempts порожні, play.answers порожній, черга порожня
});
it('blitz streak continues only for winners and survives questions a player skipped', () => {
  // streak: { length: 2, bonus: { kind: 'fixed', value: 300 } }, 3 запитання;
  // Q1 виграв p1; Q2 виграв p2 (p1 не натискав); Q3 виграв p1 → у p1 бонус 300 за Q3
  // (Q2 серію p1 не обірвав), у p2 бонусу немає
});
it('the streak bonus percent is taken from the winning attempt, not from earlier penalties', () => {
  // penalty 'minus', attempts: 2, streak { length: 2, bonus: { kind: 'percent', value: 50 } };
  // Q1 p1 виграв з першої спроби; Q2 p1 помилився (−1000), потім виграв (+1000) → бонус 500 (50% від 1000),
  // разом за Q2 500, рахунок p1 1500
});
it('blitz answers do not add to the tie-break time', () => {
  // після закриття запитання бліцу totalTimeMs усіх гравців 0
});
it('the host cannot change a blitz grade after the reveal', () => {
  expect(override(revealed, 'p2', 'wrong')).toEqual({ ok: false, error: 'wrong_phase' });
});
```

У `packages/shared/src/quiz.test.ts` додати: вікторина з раундом бліцу проходить `quizSchema`; `answerWindow: 4`, `attempts: 4` і `rules.partial: 50` у бліці відхиляються.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/engine/src/game.blitz.test.ts packages/shared/src/quiz.test.ts`
Expected: FAIL (`blitzRound`/`buzz` не існують, схема відхиляє `type: 'blitz'`).

- [ ] **Step 3: Implement** схему, коди помилок, `blitz.ts` і зміни в `game.ts` за правилами вище. `blitz.ts` імпортує з `game.ts` лише типи (без циклу під час виконання); `game.ts` викликає `settleQueue`/`blitzDone` з `submitAnswer`, `tick`, `autoLock`. Місця, де TypeScript скаржиться на `round.speedBonus` у бліці, отримують `speedBonus` лише для класичного раунду (у бліці множник швидкості 1).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/shared packages/engine && pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine`
Expected: PASS; усі наявні тести рушія зелені без змін.

- [ ] **Step 5: Commit**

```bash
git add packages/shared packages/engine
git commit -m "feat(engine): blitz round with a buzz queue and automatic checking"
```

---

### Задача 2: ручна перевірка, пауза, вилучення й таймери бліцу

**Files:**
- Modify: `packages/engine/src/blitz.ts`, `packages/engine/src/game.ts`
- Test: `packages/engine/src/game.blitz.test.ts`

**Interfaces:**
- Consumes: усе з задачі 1.
- Produces:
  ```ts
  /** Ведучий оцінює відповідь голови черги в бліці з ручною перевіркою. */
  export function judge(state: GameState, playerId: string, correct: boolean, now: number): Result;
  /** Найближча мить після now, коли tick може змінити стан; null — чекати нічого. */
  export function nextDeadline(state: GameState, now: number): number | null;
  ```

**Правила:**
- `judge`: етап `question` раунду бліцу з `check === 'manual'` (інакше `wrong_phase`), не на паузі (`paused`); `playerId` має бути головою черги з відповіддю (інакше `not_found`, щоб застаріле натискання ведучого не оцінило наступного). Спроба `correct` або `wrong` з балами, як в автоматичній перевірці; далі `settleQueue(state, now)` і закриття, якщо `blitzDone(state, now)`.
- `settleQueue` у ручному режимі зупиняється на голові з відповіддю незалежно від часу: ведучий оцінює й після вікна та таймера.
- `pause` записує `pausedAt: now` (усі етапи, де пауза дозволена); `resume` у запитанні бліцу зсуває `deadline` кожного запису черги на `now - pausedAt`; `resume` завжди скидає `pausedAt` у `null`. `buzz`, `submitAnswer` і `judge` на паузі повертають `paused` (наявна перевірка для `submitAnswer`).
- `removePlayer` прибирає записи гравця з черги й спроб поточного та минулих запитань бліцу, потім `settleQueue(state, null)` і `autoLock`.
- `nextDeadline`: для запитання без паузи — найменше з `endsAt` і `deadline` записів черги, що більше за `now`; поза запитанням або на паузі `null`. Для класичного раунду це `endsAt` (як зараз), якщо він більший за `now`.

- [ ] **Step 1: Write the failing tests** (додати в `game.blitz.test.ts`):

```ts
it('manual check waits for the host and judges the head of the queue', () => {
  // check: 'manual'; p1 і p2 натиснули й відповіли; етап 'question'; attempts порожні
  // judge(state, 'p2', true, t) → { ok: false, error: 'not_found' } (p2 не голова)
  // judge(state, 'p1', false, t) → p1 wrong; judge(state, 'p2', true, t) → p2 correct, 'locked'
});
it('manual check still waits after the window and the timer', () => {
  // answerWindow: 5; p1 відповів у 2000; tick(state, 30000) → етап 'question', спроб немає
});
it('judge is refused in an automatic blitz round', () => {
  expect(judge(state, 'p1', true, 2000)).toEqual({ ok: false, error: 'wrong_phase' });
});
it('pause freezes answer windows', () => {
  // answerWindow: 10; p1 buzz у 1000 (deadline 11000); pause у 5000; resume у 65000
  // → deadline 71000; tick(state, 70999) спроби не дає; tick(state, 71000) дає wrong
});
it('kicking the head of the queue checks the next answer at once', () => {
  // p1 buzz (без відповіді), p2 buzz і відповів 'b'; removePlayer(state, 'p1') → p2 correct, 'locked'
});
it('a disconnected head of the queue burns out when the window ends', () => {
  // answerWindow: 5; p1 buzz у 1000; setConnected(p1, false); tick(6000) → p1 wrong з answer null
});
it('nextDeadline returns the nearest window or the question end', () => {
  // старт у 0 (endsAt 20000); p1 buzz у 1000 з вікном 5 → nextDeadline(state, 1000) === 6000;
  // nextDeadline(state, 6000) === 20000; у класичному раунді nextDeadline(state, 0) === 20000; у lobby null
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/engine/src/game.blitz.test.ts`
Expected: FAIL (`judge`/`nextDeadline` не існують; пауза не зсуває вікна).

- [ ] **Step 3: Implement** `judge`, `nextDeadline` і зміни `pause`/`resume`/`removePlayer` за правилами вище.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/engine && pnpm exec tsc -p packages/engine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): manual blitz judging, pause-aware windows, kick and deadlines"
```

---

### Задача 3: зрізи стану для бліцу

**Files:**
- Modify: `packages/shared/src/views.ts`, `packages/engine/src/views.ts`
- Test: `packages/engine/src/views.test.ts`

**Interfaces:**
- Consumes: `Play.blitz`, `attemptsUsed` (задача 1).
- Produces (shared):
  ```ts
  export interface BlitzPlayer { playerId: string; nickname: string }
  export interface BlitzInfo {
    /** Нерозглянуті натискання по черзі; перший — той, чию відповідь зараз перевіряють. */
    queue: BlitzPlayer[];
    /** Переможець запитання; для сцени й гравців null до reveal. */
    winner: BlitzPlayer | null;
  }
  // BaseView: blitz: BlitzInfo | null   — null поза запитанням раунду бліцу
  // PlayerView.me: blitz: {
  //   position: number | null;      // 1-базове місце в черзі; null — не в черзі
  //   attemptsUsed: number;
  //   attemptsLeft: number | null;  // null — без обмежень
  //   canBuzz: boolean;             // етап question, не пауза, не в черзі, спроби лишилися (час клієнт не перевіряє)
  //   deadline: number | null;      // кінець власного вікна, якщо в черзі
  // } | null
  // HostView: blitz: (BlitzInfo & {
  //   manual: boolean;
  //   queue: (BlitzPlayer & { answer: Answer | null; deadline: number | null })[];
  //   attempts: (BlitzPlayer & { answer: Answer | null; grade: 'correct' | 'wrong'; points: number })[];
  // }) | null
  // HostResponse.answer: Answer | null
  ```
- `PlayerView.me.answer` у бліці: відповідь із власного запису черги, якщо він є; інакше `null`.

**Правила:**
- Сцена й гравці: `winner` лише з `reveal` (етапи `reveal`, `leaderboard`, `finished` з поточним запитанням); у `locked` він `null`. Ведучий бачить переможця одразу.
- Сцена й гравці ніколи не отримують відповіді інших гравців з черги.
- `revealStats` пропускає записи з `answer === null`.

- [ ] **Step 1: Write the failing tests** (у `views.test.ts`):

```ts
it('stage and players see the blitz queue but not the winner before the reveal', () => {
  // p1 buzz, p2 buzz → stageView(state).blitz.queue nicknames ['Анна', 'Богдан']
  // після перемоги p2 (етап locked): stageView.blitz.winner === null, playerView(p3).blitz.winner === null,
  // hostView.blitz.winner.playerId === 'p2'; після next → reveal: stageView.blitz.winner.nickname === 'Богдан'
});
it('the player sees their place, attempts and whether they can buzz', () => {
  // attempts: 2, answerWindow 15; p2 buzz у 1000, p1 buzz у 1500
  // playerView(p1).me.blitz → { position: 2, attemptsUsed: 0, attemptsLeft: 2, canBuzz: false, deadline: 16500 }
  // після помилки p2: playerView(p2).me.blitz → { position: null, attemptsUsed: 1, attemptsLeft: 1, canBuzz: true, deadline: null }
});
it('player and stage views of a blitz question never include other players\' answers', () => {
  // p1 і p2 відповіли (manual check, ще не оцінено): JSON.stringify(stageView) і playerView(p3)
  // не містять 'optionId'
});
it('the host sees queued answers and checked attempts', () => {
  // manual: hostView.blitz.queue[0] має answer; після judge — attempts[0] з grade і points; manual === true
});
it('classic views carry no blitz data', () => {
  // класична вікторина: stageView.blitz === null, playerView.me.blitz === null, hostView.blitz === null
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/engine/src/views.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** типи в `shared/views.ts` і функції в `engine/views.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/shared packages/engine && pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared packages/engine
git commit -m "feat(engine): blitz queue, attempts and winner in role views"
```

---

### Задача 4: сервер — події, таймери, запис спроб, історія

**Files:**
- Modify: `packages/shared/src/events.ts`, `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`, `apps/server/src/recorder.ts`, `apps/server/src/history.ts`, `apps/server/src/db/schema.ts`
- Create: `apps/server/drizzle/0003_blitz_attempts.sql` (+ знімок і запис у `meta/_journal.json` через `drizzle-kit generate`, як у 0002)
- Test: `apps/server/src/rooms/manager.test.ts`, `apps/server/src/socket.test.ts`, `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts`, `apps/server/src/db/schema.test.ts`

**Interfaces:**
- Consumes: `buzz`, `judge`, `nextDeadline` (задачі 1–2), зрізи (задача 3).
- Produces (shared `events.ts`):
  ```ts
  export const judgeSchema = z.object({ playerId, correct: z.boolean() });
  // ClientToServerEvents:
  'player:buzz': (ack: Ack) => void;
  'host:judge': (payload: z.infer<typeof judgeSchema>, ack: Ack) => void;
  ```
- Produces (manager): `buzz(room: Room, playerId: string): AckResult`; `HostAction` доповнюється `{ type: 'judge'; playerId: string; correct: boolean }`.
- Таблиця `answer`: новий стовпець `attempt integer NOT NULL DEFAULT 0`; `payload` стає nullable; первинний ключ `(participant_id, question_index, attempt)`.

**Правила:**
- `reschedule` планує таймер на `nextDeadline(room.state, now)` замість `endsAt` і викликає `tick(room.state, Math.max(this.now(), at))`; коли `tick` повернув той самий стан, але `nextDeadline` дає нову мить, таймер ставиться знову (через `commit` або напряму).
- Міграція: `ALTER TABLE "answer" ADD COLUMN "attempt" integer DEFAULT 0 NOT NULL`, `ALTER TABLE "answer" ALTER COLUMN "payload" DROP NOT NULL`, заміна обмеження `answer_participant_id_question_index_pk` на `answer_participant_id_question_index_attempt_pk`. Наявні рядки отримують `attempt = 0`.
- Recorder: запитання класичного раунду пише рядок `attempt: 0`, як зараз. Запитання бліцу пише по рядку на кожну спробу гравця з `play.blitz.attempts` у порядку: `attempt` — номер спроби цього гравця з нуля; `payload` — відповідь або `null`; `accepted` — `grade === 'correct'`; `points` — бали спроби плюс `streakBonus` запису гравця для виграшної спроби; `streakBonus` — бонус лише у виграшної; `overridden: false`. Конфлікт за `[participantId, questionIndex, attempt]`. Підпис (`signature`) не змінюється: у бліці спроби записуються після закриття запитання.
- Історія: `GameQuestionResult.answered` — кількість різних гравців з рядками для запитання; `accepted` — кількість різних гравців з прийнятим рядком. `GameStanding.correct` і `PlayedGame.correct` — кількість запитань із прийнятим рядком; `PlayedGame.answered` — кількість різних запитань з рядками.

- [ ] **Step 1: Write the failing tests:**

```ts
// manager.test.ts
it('a blitz window expiry is scheduled and burns the attempt', () => {
  // фейковий планувальник; бліц з answerWindow 5; p1 buzz → планувальник має таймер на +5000;
  // прокрутити час → у стані спроба wrong з answer null
});
it('host judge goes through the manager', () => {
  // manual: buzz + answer; host(room, { type: 'judge', playerId, correct: true }) → { ok: true }, етап locked
});
// socket.test.ts
it('player:buzz and host:judge are accepted only from their roles', () => {
  // ведучий шле player:buzz → forbidden; гравець шле host:judge → forbidden;
  // host:judge з { playerId: 1 } → invalid_payload
});
// recorder.test.ts
it('each blitz attempt is stored as its own row', () => {
  // attempts: 2, penalty minus: p1 wrong, p1 correct → два рядки p1: attempt 0 (accepted false, points −1000),
  // attempt 1 (accepted true, points 1000)
});
it('a missed blitz window is stored with an empty payload', () => {
  // рядок з payload null, accepted false
});
// history.test.ts
it('history counts a player with two blitz attempts once', () => {
  // запитання бліцу: p1 дві спроби (друга правильна), p2 одна неправильна →
  // questions[0] { answered: 2, accepted: 1 }; standings p1 correct 1; playerHistory p1 { answered: 1, correct: 1 }
});
// schema.test.ts (або окремий тест міграції через createTestDbUpTo('0002_rounds'))
it('migration 0003 keeps existing answers as attempt 0', () => {
  // вставити answer до міграції, застосувати решту → рядок має attempt 0, payload той самий
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/server`
Expected: FAIL у нових тестах.

- [ ] **Step 3: Implement** події, менеджер, сокет, схему й міграцію, recorder та історію за правилами вище. Міграцію генерує `pnpm --filter @quiz/server exec drizzle-kit generate --name blitz_attempts` (перевірити назву скрипта в `apps/server/package.json`); згенерований SQL перевірити руками на відповідність правилам.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages apps/server && pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine && pnpm exec tsc -p apps/server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/server
git commit -m "feat(server): blitz events, window timers and one answer row per attempt"
```

---

### Задача 5: редактор — раунд бліцу

**Files:**
- Modify: `apps/web/src/editor/draft.ts`, `apps/web/src/editor/draft-storage.ts`, `apps/web/src/editor/RoundSettings.tsx`, `apps/web/src/editor/RoundStrip.tsx`, `apps/web/src/editor/QuizEditor.tsx`, `apps/web/src/format.ts`, `apps/web/src/i18n.ts`
- Test: `apps/web/src/editor/draft.test.ts`, `apps/web/src/editor/QuizEditor.test.tsx`

**Interfaces:**
- Consumes: `BlitzRound`, `DEFAULT_ANSWER_WINDOW` (задача 1).
- Produces:
  ```ts
  // draft.ts
  export function newBlitzRound(): BlitzRound; // title '', shuffleOptions false, answerWindow 15, attempts 1,
                                               // check 'auto', rules { ...defaultRules(), partial: null }, одне порожнє запитання
  // RoundStrip: onAdd: (type: Round['type']) => void
  // RoundSettings: round: Round, onChange: (next: Round) => void
  ```

**Правила:**
- «+ Раунд» розкриває вибір типу: дві кнопки «Класичний» і «Бліц»; вибір додає раунд цього типу й закриває вибір. Нова вікторина, як і раніше, має один класичний раунд.
- `RoundSettings` для бліцу показує: назву; перемішування варіантів; «Вікно відповіді» (select: «Вимкнене», 5, 10, 15, 20, 30, 45, 60, 90, 120 с); «Спроб на запитання» (select: 1, 2, 3, «Без обмежень»); «Перевірка» (select: «Автоматично», «Ведучий»); штраф; серії; множник. Бали за швидкість і «частково» для бліцу не показуються.
- Вкладка раунду й заставка підписують безіменний раунд за типом: `roundLabel(title, index, type?: Round['type'])` для безіменного бліцу дає «Бліц», для класичного або без типу — як зараз. Виклики, де тип відомий (`RoundStrip`, `RoundInfo.type` на екранах гри), його передають.
- `loadDraft` відновлює раунд бліцу без змін полів класичного раунду (`speedBonus`/`shuffleOptions` за замовчуванням додаються лише класичному); `cleaned` і `problemsOf` працюють для обох типів.

- [ ] **Step 1: Write the failing tests:**

```ts
// draft.test.ts
it('newBlitzRound passes the round schema', () => {
  expect(roundSchema.safeParse(newBlitzRound()).success).toBe(true);
});
it('a saved blitz draft comes back unchanged', () => {
  // saveDraft(undefined, quizWithBlitz); loadDraft(undefined) → toEqual(quizWithBlitz)
});
// QuizEditor.test.tsx
it('adds a blitz round and saves its settings', async () => {
  // клік «+ Раунд» → «Бліц»; відкрити «Налаштування раунду»; вибрати вікно 30, спроб 2, перевірка «Ведучий»;
  // заповнити запитання; зберегти → onSave отримує rounds[1] з type 'blitz', answerWindow 30, attempts 2, check 'manual'
});
it('blitz settings hide the speed bonus and partial credit', () => {
  // у бліці немає чекбоксів t('speedBonus') і t('rulePartial')
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
git commit -m "feat(web): blitz rounds in the quiz editor"
```

---

### Задача 6: гра — телефон, сцена й пульт у бліці

**Files:**
- Modify: `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/HostScreen.tsx`, `apps/web/src/format.ts`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/PlayerScreen.test.tsx`, `apps/web/src/screens/StageScreen.test.tsx`, `apps/web/src/screens/HostScreen.test.tsx`

**Interfaces:**
- Consumes: `view.blitz`, `view.me.blitz`, `HostView.blitz` (задача 3); події `player:buzz`, `host:judge` (задача 4).

**Правила:**
- Телефон у запитанні бліцу: `canBuzz` → велика кнопка «Відповісти» (`send('player:buzz')`); у черзі без відповіді → «Ви N-й у черзі» і поле відповіді (`AnswerInput`), а якщо є власне вікно, — свій відлік до `deadline` (компонент `Timer` з `{ endsAt: deadline, remainingMs: null }`); у черзі з відповіддю → «Відповідь надіслано, ви N-й у черзі»; не в черзі, спроби вичерпано → «Спроби вичерпано». Після неправильної спроби (`attemptsUsed > 0`, не в черзі) над кнопкою «Неправильно, спробуйте ще» або «Спроби вичерпано». На `reveal` — результат, як зараз, плюс рядок про переможця.
- Сцена: під запитанням список черги (нікнейми по порядку, перший позначено «Перевіряємо»); на `reveal` рядок «Першим правильно відповів: …» або «Ніхто не відповів правильно».
- Пульт: замість «Відповіді» панель «Черга» (нікнейм, відповідь або «пише…»; у ручному режимі біля голови з відповіддю кнопки «Правильно» / «Неправильно» → `host:judge`) і панель «Спроби» (нікнейм, відповідь або «не встиг», оцінка, бали). Кнопки зміни оцінки на `reveal` у бліці не показуються. Лічильник «відповіли N з M» у бліці замінюється на «у черзі: N».
- Помилки `not_in_queue`, `already_queued`, `no_attempts` мають тексти в `i18n.ts`.

- [ ] **Step 1: Write the failing tests:**

```ts
// PlayerScreen.test.tsx
it('shows the buzz button and sends player:buzz', async () => {
  // view з me.blitz.canBuzz true → клік «Відповісти» → send викликано з 'player:buzz'
});
it('shows the place in the queue and the answer input after buzzing', () => {
  // me.blitz.position 2, me.answer null → текст «Ви 2-й у черзі» (точний текст з i18n) і поле відповіді
});
it('says when attempts are used up', () => {
  // position null, canBuzz false, attemptsUsed 1, attemptsLeft 0 → «Спроби вичерпано», кнопки немає
});
// StageScreen.test.tsx
it('shows the blitz queue and the winner at the reveal', () => {});
// HostScreen.test.tsx
it('judges the head of the queue in a manual blitz round', async () => {
  // blitz.manual true, queue[0] з answer → клік «Правильно» → send('host:judge', { playerId: 'p1', correct: true })
});
it('does not offer grade changes after a blitz reveal', () => {
  // phase reveal, round.type 'blitz', correct.type 'text' → немає кнопки t('accept')
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/web/src/screens`
Expected: FAIL.

- [ ] **Step 3: Implement** екрани за правилами вище у візуальному напрямі «Нічний ефір» (наявні класи `panel`, `rows`, `tag`, `btn`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): buzz button, queue and judging for blitz rounds"
```

---

### Задача 7: наскрізний сценарій бліцу

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе попереднє; допоміжні функції наявних сценаріїв у тому самому файлі.

- [ ] **Step 1: Write the scenario** `it('a blitz round: the queue decides, a wrong attempt costs points, the podium shows it', …)`: ведучий створює в редакторі вікторину з одним раундом бліцу («+ Раунд» → «Бліц», потім вибрати перший, класичний раунд і видалити його; вікторина з одним раундом починається одразу з запитання), налаштування: штраф увімкнено, спроб 1, перевірка автоматична, 2 запитання з одним варіантом (ціна 1000). Двоє гравців. Запитання 1: гравець A натискає першим і відповідає неправильно, гравець B натискає й відповідає правильно → на сцені після «Показати відповідь» видно «Першим правильно відповів: B». Запитання 2: ніхто не натискає, ведучий закриває запитання. Очікування на подіумі: B 1000, A −1000 (точні числа). Історія показує гру з двома зіграними запитаннями й тими самими балами.

- [ ] **Step 2: Run it**

Run: `pnpm e2e`
Expected: PASS усіх сценаріїв (наявні два й новий).

- [ ] **Step 3: Commit, merge, push**

```bash
git add apps/server/e2e
git commit -m "test: blitz round end-to-end"
```

Після фінальної рецензії гілки: злити в `main`, `pnpm test`, `git push origin main` (Render розгорне сам; міграція 0003 застосується під час розгортання).
