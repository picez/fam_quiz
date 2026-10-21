# План 6a: час на відповідь і «Мільйонер»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** гравцям вистачає часу на відповідь, а коли відповідає одна людина, усі бачать запитання й те, що вона вибрала. У редакторі з'являється «Однаковий час для всіх запитань раунду», типовий час нового запитання стає 30 с. Під час гри ведучий тисне «−15 с» / «+15 с». У полі (відповідь з телефона) і в бліці відповідь спершу світиться помаранчевим, ведучий тисне «Прийняти» або «Перевибрати», після чого вона загоряється зеленим або червоним.

**Архітектура:**
- **Фактичний час запитання.** `Play` отримує `extraMs`: сума всіх змін «±15 с» (з урахуванням меж). Повний час запитання — `limitMsOf(play) = question.timeLimit × 1000 + extraMs`. Він замінює `timeLimit × 1000` скрізь у рушії: бонус за швидкість, `resume`, час без відповіді. Інваріант `endsAt − startedAt = limitMsOf(play)` зберігається завжди.
- **Помаранчевий стан = «утримання».** `GameState` отримує `heldAt: number | null`: мить, з якої годинник запитання стоїть. Поки `heldAt !== null`, `endsAt` і вікна черги бліцу лишаються на місці, але всі перевірки часу йдуть за «замороженим» годинником `heldAt`. Коли утримання знято (`thaw`), `startedAt`, `endsAt` і вся черга бліцу зсуваються на `now − heldAt`, тобто так само, як після паузи. Пауза поверх утримання годинника не чіпає.
- **Що саме чекає.** Окремого поля для відповіді немає, вона виводиться з наявного стану (`pendingOf`):
  - у полі — `play.board.answer` (поле вже є: раніше воно чекало лише ручної перевірки);
  - у бліці — відповідь голови черги. `settle` тепер зупиняється на голові з відповіддю й за автоматичної перевірки, а не лише за ручної.
- **Розподіл коду рушія:**
  - новий `timing.ts`: межі, `limitMsOf`, `remainingOf`, `adjustTime`;
  - новий `hold.ts`: `pendingOf`, `holdAt`, `thaw`, `clockOf`, `releaseStaleHold`. З `game.ts` він імпортує лише типи;
  - `acceptAnswer` і `repick` живуть у `game.ts`, поряд з `judge` і `override`.
- **Зрізи.** `BaseView.spotlight` несе відповідь одного гравця для всіх ролей: хто, що відповів і вердикт (`null` — ще помаранчевий). Правильної відповіді в ньому немає ніколи.
- **Сервер.** Нові події `host:time`, `host:accept`, `host:repick`. Нова міграція не потрібна: стан гри живе в пам'яті, а журнал (`game.plays`, `answer`) не змінюється.

**Технології:** TypeScript, zod, vitest, Fastify + Socket.IO, React + Vite, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-21-after-first-game-design.md`, лише частини A (розділ 3) і B (розділ 4), а також розділи 2 (анти-цілі) і 11 (тестування) у тій мірі, в якій вони стосуються A і B. Тло: `2026-10-16-rounds-and-rules-design.md`, розділи 6–7.

**Рішення плану там, де специфікація мовчить:**
- **«Прийняти» в полі** веде одразу на розкриття (`reveal`), без проміжного `locked`. Так і з'являється колір: зелений або червоний, а при червоному правильний варіант зелений. Те саме робить ручна оцінка помаранчевої відповіді. Оцінка усної відповіді працює як зараз (→ `locked`).
- **Бліц після неправильного прийняття.** Помилка гравця світиться червоним, але правильний варіант не показується до `reveal`: інакше наступний у черзі отримав би відповідь.
- **Пауза.** `acceptAnswer` і `repick` на паузі відмовляють з `paused` (як уже робить `judge`).
- **«Закрити запитання» під час помаранчевого стану** лишається виходом для ведучого. Відповідь тоді не прийнято:
  - у полі на розкритті вона рахується неправильною, але ведучий може змінити оцінку (як зараз);
  - у бліці черга скидається без балів.
- **Натискання бліцу під час утримання** отримують час `heldAt`, а вікно `heldAt + answerWindow`. Отже, їхнє вікно фактично починається після зняття утримання.
- **Вилучено гравця з помаранчевою відповіддю:**
  - у полі утримання знімається на найближчому `tick`, і таймер запитання йде далі;
  - у бліці помаранчевою стає відповідь наступного в черзі (якщо вона вже є), годинник і далі стоїть.
- **Перевибір без гравця** (гравець відключився) веде до наявних правил: у полі йде таймер запитання, у бліці — вікно відповіді. Додаткових 30 с немає: вони діють лише на етапі вибору клітинки.
- **Межі «±15 с».** «−15 с» при залишку ≤ 5 с і «+15 с» при залишку ≥ 120 с відмовляють з новим кодом `time_limit`. В інших випадках залишок обрізається до 5 с або до 120 с.
- **Інші відповіді в черзі бліцу.** Гравці в черзі, як і раніше, можуть надіслати відповідь заздалегідь. Усім показується лише відповідь голови черги.

## Глобальні обмеження

- Класичний раунд і стара вікторина поводяться точно як зараз. Єдиний виняток: бонус за швидкість рахується від `limitMsOf(play)`, а без змін «±15 с» це те саме число.
- Змінюються лише ті очікування наявних тестів, які прямо названо в задачах:
  - автоматична перевірка в бліці та відповідь з телефона в полі тепер чекають на «Прийняти»;
  - «Прийняти» в полі веде на `reveal`.
- Рушій чистий: без мережі, бази й таймерів. Час (`now`) і `rng` передаються аргументами.
- Значення (точно зі специфікації):
  - крок 15 с;
  - залишок після «−15 с» не менший за 5 с, після «+15 с» не більший за 120 с;
  - час запитання в редакторі 5–120 с (`LIMITS.minTime`/`maxTime`);
  - типовий час нового запитання 30 с (`LIMITS.defaultTime: 30`).
- «±15 с» не змінюють вікна відповіді бліцу, лише таймер запитання.
- Захист від спойлерів: до прийняття зрізи сцени й гравців не містять правильної відповіді (`correctId`, `correctIds`, `correct`, `accepted`, порядок `items` як правильний). Помаранчевий `spotlight` має `grade: null`. На етапі `locked` вердикт у полі не видно.
- Помаранчевий стан стосується лише відповіді з телефона одного гравця: поле з `answerMode: 'phone'` і бліц. В усній клітинці помаранчевого кроку немає.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`. Помаранчевий колір — новий токен `--pending` у `:root` у `styles.css`. Зелений і червоний беруться з наявних `--correct` і `--signal`.
- Кожна задача починається з тесту, що падає. Перед комітом зелені `pnpm test` і `pnpm typecheck` (для задач 2–4 достатньо пакетів, названих у кроці перевірки, але в кінці кожної задачі `pnpm test` має бути зеленим).
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (побажання власника: проєкт тестовий).

## Порядок збирання

- Задачі 1–5 тримають зеленими `pnpm test` і `pnpm typecheck`.
- Наскрізні сценарії (`pnpm e2e`) не входять у `pnpm test`. Від задачі 3 до задачі 7 наявні сценарії бліцу й поля не проходять, бо в них ще немає кроку «Прийняти». Їх оновлює задача 7.
- Задача 5 додає обов'язкове поле `spotlight` у зрізи. Вона ж механічно додає `spotlight: null` у фабрики зрізів у тестах `apps/web/src/screens/*.test.tsx`, щоб `apps/web` компілювався.

## На що дивитися рецензентові

1. **Ведучий ставить паузу, поки відповідь помаранчева, і знімає її.** Таймер не рушає: він стоїть, доки ведучий не прийме відповідь або не дасть перевибрати. Після перевибору залишок той самий, що був на мить надсилання (з урахуванням «±15 с»). Тест: задача 3, `a pause over a pending answer changes nothing`.
2. **Гравця з помаранчевою відповіддю вилучили.** Гра не застрягає:
   - у полі таймер запитання йде далі з того самого залишку;
   - у бліці відповідь наступного в черзі стає помаранчевою.

   Тести: задача 3, `kicking the pending chooser lets the timer run again`; задача 4, `kicking the pending head passes the hold to the next answer`.
3. **У бліці інші натискають «Відповісти», поки відповідь помаранчева.** Натискання приймаються, їхній порядок зберігається, вікно відповіді кожного починає йти лише після зняття утримання. Тест: задача 4, `a buzz during a pending answer gets its full window after the hold`.
4. **«+15 с» на паузі, потім продовження й відповідь у класиці з бонусом за швидкість.** Додані секунди не забирають бали, а час відповіді не включає паузу. Тест: задача 2, `a change on pause applies to the stored remainder and survives the resume`.
5. **Сцена й чужий телефон під час помаранчевої відповіді на текстове запитання і після прийняття неправильної відповіді в бліці.** Ні прийнятих написань, ні правильного варіанта в зрізах немає. Тест: задача 5, `stage and player views never carry the correct answer before the reveal`.

---

### Задача 1: редактор — однаковий час для раунду й типові 30 с

**Files:**
- Modify: `packages/shared/src/quiz.ts` (`LIMITS.defaultTime`)
- Modify: `apps/web/src/editor/draft.ts`, `apps/web/src/editor/RoundSettings.tsx`, `apps/web/src/i18n.ts`
- Test: `apps/web/src/editor/draft.test.ts`, `apps/web/src/editor/QuizEditor.test.tsx`

**Interfaces:**
- Produces (shared): `LIMITS.defaultTime: 30`.
- Produces (`draft.ts`):
  ```ts
  /** Ставить timeLimit усім запитанням раунду; у полі — усім клітинкам усіх категорій. */
  export function applyRoundTime(round: Round, seconds: number): Round;
  ```

**Правила:**
- **Блок у `RoundSettings`** (для всіх трьох типів раунду, під назвою раунду):
  - підпис «Однаковий час для всіх запитань раунду»;
  - числове поле з підписом «Секунд», початкове значення `LIMITS.defaultTime`;
  - кнопка «Застосувати». Вона неактивна, якщо значення не ціле або поза 5–120, і викликає `onChange(applyRoundTime(round, seconds))`.
- `applyRoundTime` не змінює нічого, крім `timeLimit`, і не перевіряє межі: їх стереже кнопка.
- Старі вікторини не зачіпаються: `defaultTime` використовує лише `newQuestion` у редакторі.
- Ключі `i18n.ts`: `sameTimeTitle`, `sameTimeSeconds`, `sameTimeApply`.

- [ ] **Step 1: Write the failing tests**

```ts
// draft.test.ts
it('a new question gets 30 seconds', () => {
  expect(newQuestion('single').timeLimit).toBe(30);   // наявне очікування 20 у рядку 40 змінюється на 30
});
it('applyRoundTime sets the time of every question in a classic round and every board cell', () => {
  // класичний раунд з timeLimit 10 і 60 → applyRoundTime(round, 45) → усі 45, решта полів без змін (toEqual з підміною timeLimit)
  // newBoardRound() → applyRoundTime(round, 90) → boardCells(round).every(c => c.cell.question.timeLimit === 90), mark і points ті самі
});
// QuizEditor.test.tsx
it('applies one time to all questions of the round', async () => {
  // два запитання з часом 20 і 45; «Налаштування раунду» → поле «Секунд» 40 → «Застосувати» → зберегти →
  // roundQuestions(saved.rounds[0]).map(q => q.timeLimit) == [40, 40]
});
it('the apply button is disabled outside 5–120 seconds', async () => {
  // «Секунд» 4 → кнопка «Застосувати» disabled; 121 → disabled; 120 → enabled
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/web/src/editor`
Expected: FAIL (`applyRoundTime` не існує, час 20).

- [ ] **Step 3: Implement** `LIMITS.defaultTime: 30`, `applyRoundTime` і блок у `RoundSettings` за правилами вище.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/web
git commit -m "feat(editor): one time for all questions of a round, 30 s by default"
```

---

### Задача 2: «−15 с» / «+15 с» у рушії та на сервері

**Files:**
- Create: `packages/engine/src/timing.ts`, `packages/engine/src/game.timing.test.ts`
- Modify: `packages/engine/src/game.ts`, `packages/engine/src/index.ts`
- Modify: `packages/shared/src/game.ts` (`ErrorCode`), `packages/shared/src/events.ts`
- Modify: `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`
- Test: `apps/server/src/rooms/manager.test.ts`, `apps/server/src/socket.test.ts`

**Interfaces:**
- Produces (engine, `game.ts`): `Play.extraMs: number` (`openQuestion` ставить 0).
- Produces (engine, `timing.ts`; з `game.ts` лише типи):
  ```ts
  export const TIME_STEP_S = 15;
  export const MIN_REMAINING_MS = 5_000;
  export const MAX_REMAINING_MS = 120_000;
  /** Повний час запитання з урахуванням змін ведучого. */
  export function limitMsOf(play: Play): number;          // question.timeLimit * 1000 + extraMs
  /** Залишок таймера поточного запитання; null — не етап question або таймера немає. */
  export function remainingOf(state: GameState, now: number): number | null;
  /** seconds — +15 або −15. */
  export function adjustTime(state: GameState, seconds: number, now: number): Result;
  ```
- Produces (shared): `ErrorCode` доповнюється `'time_limit'`. У `events.ts`:
  ```ts
  export const timeSchema = z.object({ seconds: z.union([z.literal(-15), z.literal(15)]) });
  'host:time': (payload: z.infer<typeof timeSchema>, ack: Ack) => void;
  ```
- Produces (manager): `HostAction` доповнюється `{ type: 'time'; seconds: -15 | 15 }` → `adjustTime(state, seconds, this.now())`.

**Правила:**
- **`remainingOf`** (задача 3 додає першу гілку з `heldAt`; тут її ще немає):
  - на паузі `remainingMs`;
  - інакше `max(0, endsAt − now)`;
  - поза `question` або без `endsAt` і `remainingMs` — `null`.
- **`adjustTime`:**
  - умови: етап `question` (`wrong_phase`), `remainingOf !== null` (`wrong_phase`);
  - нове значення залишку: −15 при залишку ≤ `MIN_REMAINING_MS` відмовляє з `time_limit`, інакше `max(MIN, r − 15000)`; +15 при залишку ≥ `MAX_REMAINING_MS` відмовляє з `time_limit`, інакше `min(MAX, r + 15000)`;
  - нове значення пишеться туди, звідки його взято: на паузі в `remainingMs`, інакше `endsAt = now + нове`;
  - `play.extraMs += нове − r`, `startedAt` не змінюється;
  - діє в класиці, бліці й полі однаково; черга бліцу (`deadline`) не змінюється.
- **`limitMsOf` замість `timeLimit × 1000`** у `game.ts`:
  - `speedFactor` у `submitAnswer` і в `override` класики;
  - `resume`: `startedAt = endsAt − limitMsOf(play)`;
  - `withTotals`: час гравця без відповіді;
  - `overrideBoard` і `unansweredIsWrong`: час без відповіді.
- Сокет: `host:time` перевіряє `timeSchema` (`invalid_payload`) і роль ведучого (`forbidden`). Таймер кімнати переплановує наявний `reschedule` через `nextDeadline`, бо змінився `endsAt`.

- [ ] **Step 1: Write the failing tests** у `game.timing.test.ts` (класичний раунд, `single` з `timeLimit: 20`, `points: 1000`, відкрито в момент 0):

```ts
it('+15 adds to the running timer and to the question total', () => {
  // adjustTime(state, 15, 0) → endsAt 35000, plays[0].extraMs 15000
});
it('−15 never leaves less than five seconds and is refused at five or less', () => {
  // at 12000: adjustTime(−15) → endsAt 17000 (залишок 5000), extraMs −3000; ще раз −15 → time_limit
});
it('+15 never leaves more than 120 seconds and is refused at 120', () => {
  // сім разів +15 у момент 0 → залишки 35,50,65,80,95,110,120 с (останній +10); восьмий → time_limit
});
it('a change on pause applies to the stored remainder and survives the resume', () => {
  // classic speedBonus true: pause у 5000 (remainingMs 15000) → +15 → remainingMs 30000, endsAt null;
  // resume у 100000 → endsAt 130000, startedAt 95000; відповідь правильно в 112500
  // (час 17500 з 35000) → бали 750, timeMs 17500
});
it('the speed bonus uses the real total time', () => {
  // speedBonus: +15 у 0, правильна відповідь у 17500 → 750 (без зміни було б 563)
});
it('the blitz answer window is not changed', () => {
  // бліц answerWindow 15: buzz p1 у 1000 → deadline 16000; adjustTime(+15, 2000) → endsAt 35000, deadline 16000
});
it('adjustTime is refused outside a running question', () => {
  // intro, locked, board → wrong_phase
});
```

```ts
// manager.test.ts
it('host time moves the room timer', () => {
  // класика timeLimit 20: start; host { type: 'time', seconds: 15 }; advance(34_999) → question; advance(1) → locked
});
// socket.test.ts
it('host:time is accepted only from the host and only with ±15', async () => {
  // гравець → forbidden; { seconds: 10 } → invalid_payload; { seconds: -15 } → ok
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/engine/src/game.timing.test.ts apps/server/src/rooms apps/server/src/socket.test.ts`
Expected: FAIL (`adjustTime` не існує).

- [ ] **Step 3: Implement** `timing.ts`, `extraMs`, заміни на `limitMsOf`, подію, менеджер і сокет.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: PASS; наявні тести зелені без змін.

- [ ] **Step 5: Commit**

```bash
git add packages apps/server
git commit -m "feat(engine): host adds or removes 15 seconds, speed bonus from the real total"
```

---

### Задача 3: «Мільйонер» у полі — утримання, «Прийняти», «Перевибрати»

**Files:**
- Create: `packages/engine/src/hold.ts`
- Modify: `packages/engine/src/game.ts`, `packages/engine/src/timing.ts` (`remainingOf`), `packages/engine/src/blitz.ts` (`nextDeadline`), `packages/engine/src/index.ts`, `packages/engine/src/testing/helpers.ts`
- Modify: `packages/shared/src/events.ts`, `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`
- Test: `packages/engine/src/game.board.test.ts`, `apps/server/src/rooms/manager.test.ts`, `apps/server/src/socket.test.ts`
- Modify (механічно, новий крок «Прийняти»): `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts` — тести поля, де гравець відповідає з телефона

**Interfaces:**
- Produces (engine, `game.ts`): `GameState.heldAt: number | null` (`createGame` → `null`).
  ```ts
  /** «Прийняти» за автоматичної перевірки. */
  export function acceptAnswer(state: GameState, now: number): Result;
  /** «Перевибрати»: відповідь знято, годинник іде з того самого залишку. */
  export function repick(state: GameState, now: number): Result;
  ```
- Produces (`hold.ts`; з `game.ts` лише типи):
  ```ts
  export interface Pending { playerId: string; answer: Answer }
  /** Відповідь одного гравця, що чекає на рішення ведучого; null — немає. */
  export function pendingOf(state: GameState): Pending | null;
  /** Годинник запитання: heldAt під час утримання, інакше now. */
  export function clockOf(state: GameState, now: number): number;
  /** heldAt = now, якщо ще не стоїть. */
  export function holdAt(state: GameState, now: number): GameState;
  /** Знімає утримання: startedAt, endsAt і черга бліцу (at, deadline) зсуваються на now − heldAt; heldAt = null. */
  export function thaw(state: GameState, now: number): GameState;
  /** Утримання без відповіді, що чекає (гравця вилучили), знімається. */
  export function releaseStaleHold(state: GameState, now: number): GameState;
  ```
  `shiftQueue` переїжджає з `game.ts` у `hold.ts` (експортується), бо його використовують і `resume`, і `thaw`.
- Produces (testing `helpers.ts`): `acceptAll(state: GameState, now: number): GameState`. Поки `pendingOf(state) !== null`, викликає `acceptAnswer`.
- Produces (shared `events.ts`): `'host:accept': (ack: Ack) => void; 'host:repick': (ack: Ack) => void;`.
- Produces (manager): `HostAction` простих дій доповнюється `'accept' | 'repick'`; обидві викликаються з `this.now()`. Сокет додає `'accept'`, `'repick'` у `SIMPLE_HOST_ACTIONS`.

**Правила:**
- **`pendingOf` для поля** повертає `{ chooserId, board.answer }`, якщо виконано все:
  - етап `question`;
  - раунд поля з `answerMode: 'phone'`;
  - `play.board.answer !== null`;
  - `chooserId` є серед гравців.

  Гілку бліцу додає задача 4.
- **`submitBoardAnswer`.** Перевірки ті самі. Далі відповідь кладеться в `play.board.answer` за будь-якої перевірки (`auto` і `manual`), стан стає `holdAt(…, now)`, етап лишається `question`. Запис не створюється.
- **`acceptAnswer` у полі:**
  - умови: немає `pendingOf` → `wrong_phase`; пауза → `paused`; `check: 'manual'` → `wrong_phase`;
  - запис робиться як раніше в автоматичному `submitBoardAnswer`: часткові бали лише з `rules.partial`, `boardPoints`, `timeMs = clockOf(state, now) − startedAt`;
  - далі `lockNow`, етап `reveal` і `withTotals`.
- **Ручна оцінка помаранчевої відповіді** (`override` у полі в етапі `question`, коли `board.answer !== null`) теж веде на `reveal`. `spentMs = clockOf(state, now) − startedAt`. Оцінка усної відповіді в `question`, як і раніше, веде на `locked`.
- **`repick`:**
  - умови: немає `pendingOf` → `wrong_phase`; пауза → `paused`;
  - у полі `board.answer = null`, потім `thaw(state, now)`;
  - кількість перевиборів не обмежена.
- **Годинник під час утримання:**
  - `remainingOf` отримує першу гілку: `heldAt !== null` → `endsAt − heldAt` (також на паузі);
  - `adjustTime` під час утримання пише `endsAt = heldAt + нове`;
  - `tick`: спершу `releaseStaleHold(state, now)`. Якщо утримання лишилося, повертається той самий об'єкт;
  - `nextDeadline` під час утримання повертає `null`;
  - `lockNow` і `end` ставлять `heldAt = null`.
- **Пауза й утримання:**
  - `pause` за `heldAt !== null` ставить лише `paused: true, pausedAt: now`, без `remainingMs` і без обнулення `endsAt`;
  - `resume` за `heldAt !== null` ставить лише `paused: false, pausedAt: null`, а потім `releaseStaleHold(…, now)`.
- **Вилучення й відключення:**
  - `removePlayer` не змінюється: `releaseStaleHold` у `tick`, який менеджер уже викликає після вилучення, знімає утримання;
  - відключений гравець з помаранчевою відповіддю лишається серед гравців, тож `acceptAnswer`, `override` і `repick` працюють.
- **Механічні зміни наявних тестів поля (`game.board.test.ts`, `views.test.ts`, server):**
  - після відповіді з телефона з `check: 'auto'` додається `acceptAll(state, t)`;
  - очікування `phase 'locked'` після неї стає `'reveal'`;
  - тест `manual check waits for the host after the phone answer` очікує `phase 'question'`, `heldAt === t`, а оцінка ведучого веде на `'reveal'` з `overridden false`.

- [ ] **Step 1: Write the failing tests** (у `game.board.test.ts`; `single.correctId === 'b'`, `timeLimit: 20`; p1 вибрав c12 (200) у момент 0):

```ts
it('a phone answer waits for the host and stops the question timer', () => {
  // submitAnswer(p1, 'a', 5000) → phase 'question', heldAt 5000, plays.at(-1).board.answer 'a', записів немає;
  // remainingOf(state, 60000) === 15000; tick(state, 60000) — той самий об'єкт; nextDeadline(state, 60000) null
});
it('accept grades the answer and goes straight to the reveal', () => {
  // 'a' → acceptAnswer(state, 9000) → phase 'reveal', запис wrong, timeMs 5000, heldAt null; з 'b' — correct, +200
});
it('repick clears the answer and resumes from the same remainder, as often as needed', () => {
  // 'a' у 5000 → repick у 50000 → board.answer null, heldAt null, endsAt 65000, startedAt 45000;
  // знову 'a' у 52000 → repick у 60000 → endsAt 73000, startedAt 53000; 'b' у 61000 → accept → correct, timeMs 8000
});
it('manual check: the host grades the pending answer, partial included, and repick stays', () => {
  // check 'manual', rules.partial 50: 'a' → acceptAnswer → wrong_phase; override('p1','partial', 8000) → phase 'reveal', 100;
  // у новій грі repick після відповіді працює так само, як в автоматичній
});
it('a pause over a pending answer changes nothing', () => {
  // 'a' у 5000 → pause у 6000 → endsAt 20000 (не null), remainingMs null; resume у 900000 → heldAt 5000, phase 'question';
  // repick у 900000 → endsAt 915000
});
it('±15 on a pending answer works on the stored remainder', () => {
  // 'a' у 5000 → adjustTime(+15, 40000) → remainingOf === 30000; repick у 50000 → endsAt 80000
});
it('a disconnected pending player can still be accepted or re-picked', () => {
  // 'b' → setConnected(p1, false, 6000) → acceptAnswer → correct; у новій грі repick → tick(endsAt) → 'locked'
});
it('kicking the pending chooser lets the timer run again', () => {
  // 'a' у 5000 → removePlayer(p1) → tick(state, 30000) → heldAt null, endsAt 45000; tick(45000) → 'locked'
});
it('voice mode has no pending step', () => {
  // answerMode 'voice': submitAnswer → wrong_phase; override('p1','correct') у question → 'locked' (як і було)
});
it('accept and repick are refused without a pending answer or on pause', () => {
  // без відповіді → wrong_phase; 'a' → pause → acceptAnswer і repick → paused
});
```

```ts
// manager.test.ts
it('a pending board answer stops the room timer until the host re-picks', () => {
  // поле, p1 вибрав клітинку timeLimit 20 у 0, відповідь у 5000; advance(10 хв) → question;
  // host repick → advance(14_999) → question; advance(1) → locked
});
it('host accept goes through the manager', () => {
  // відповідь 'b' → host accept → phase 'reveal', рахунок p1 = ціна клітинки
});
// socket.test.ts
it('host:accept and host:repick are accepted only from the host', async () => {
  // гравець → forbidden
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/engine/src/game.board.test.ts apps/server/src/rooms apps/server/src/socket.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `hold.ts`, гілки поля, паузу, `tick`, `nextDeadline`, події й менеджер. Механічно додати «Прийняти» в наявні тести поля (див. правила).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages apps/server
git commit -m "feat(engine): a board phone answer waits for accept or re-pick with the timer stopped"
```

---

### Задача 4: «Мільйонер» у бліці

**Files:**
- Modify: `packages/engine/src/blitz.ts`, `packages/engine/src/hold.ts` (`pendingOf`), `packages/engine/src/game.ts`
- Test: `packages/engine/src/game.blitz.test.ts`, `apps/server/src/rooms/manager.test.ts`
- Modify (механічно): `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts` — тести бліцу з автоматичною перевіркою

**Interfaces:**
- Consumes: `pendingOf`, `holdAt`, `thaw`, `clockOf`, `acceptAnswer`, `repick`, `acceptAll` (задача 3).
- Changes: `applyVerdict(state, playerId, correct, now)` лишається для `judge` і стає спільною основою для `acceptAnswer` у бліці.

**Правила:**
- **`pendingOf` для бліцу:** етап `question`, раунд бліцу, `queue[0]?.answer !== null` → `{ queue[0].playerId, queue[0].answer }`.
- **`settle`** зупиняється на голові з відповіддю за будь-якої перевірки (`auto` і `manual`), якщо немає `verdict`. Коли він зупинився так і `now !== null`, стан стає `holdAt(…, now)`. Голова без відповіді, чиє вікно сплило, і далі отримує `wrong` автоматично, без утримання.
- **Вердикти:**
  - `acceptAnswer` у бліці: умови як у полі (`wrong_phase`, `paused`, `check: 'manual'` → `wrong_phase`); вердикт `checkAnswer(question, answer).accuracy === 1`;
  - `judge` у ручному раунді: вердикт від ведучого (як зараз, автоматичний раунд і далі дає `wrong_phase`);
  - обидва роблять `thaw(state, now)`, потім `settle(now, verdict)`. Якщо `blitzDone`, далі `lockNow`. Правильна відповідь закриває запитання (→ `locked`, як зараз), неправильна передає чергу далі. Якщо наступний у черзі вже має відповідь, вона одразу стає помаранчевою (`heldAt = now`).
- **`repick` у бліці:** голова отримує `answer = null`, потім `thaw(state, now)`. Вікно голови йде далі з того самого залишку.
- **Натискання й відповіді під час утримання:**
  - `buzz` дозволений (пауза, як і раніше, `paused`). Перевірка часу йде за `clockOf`: `clock > endsAt` → `time_over`;
  - запис отримує `at = clock` і `deadline = clock + answerWindow × 1000` (або `null`), тож після `thaw` вікно починається з моменту зняття утримання;
  - `submitBlitzAnswer` перевіряє вікно теж за `clockOf`.
- **`removePlayer` голови з помаранчевою відповіддю.** Черга фільтрується, як зараз. Нова голова з відповіддю одразу є `pendingOf`, тож утримання триває з того самого `heldAt`. Нова голова без відповіді — `releaseStaleHold` у `tick` знімає утримання.
- **Механічні зміни наявних тестів бліцу:**
  - допоміжна `buzzAndAnswer` у `game.blitz.test.ts` після відповіді викликає `acceptAll(state, now)`;
  - у тестах, що відповідають через `submitAnswer` напряму й чекають перевірки (`the first correct answer in the queue wins the question` та подібні), перед очікуванням додається `acceptAll(state, t)`;
  - решта очікувань не змінюється.

- [ ] **Step 1: Write the failing tests** (у `game.blitz.test.ts`, наявна функція `open`, `timeLimit: 20`):

```ts
it('the head answer waits for accept and stops the question timer', () => {
  // buzz p1 у 1000, 'a' у 3000 → phase 'question', heldAt 3000, attempts []; tick(60000) — той самий об'єкт
});
it('accepting a wrong answer passes the queue on and resumes the timer', () => {
  // p1 'a' у 3000, p2 buzz у 3500 і 'b' у 4000 (під час утримання) → acceptAnswer у 10000 →
  // attempts [p1 wrong], нова голова p2 з відповіддю → heldAt 10000, endsAt 27000; acceptAnswer → 'locked', p2 +1000
});
it('repick clears the head answer and resumes its window from the same remainder', () => {
  // answerWindow 15: buzz p1 у 1000 (deadline 16000), 'a' у 3000 → repick у 50000 → queue[0].answer null,
  // deadline 63000, endsAt 67000; 'b' у 51000 → accept → correct
});
it('a buzz during a pending answer gets its full window after the hold', () => {
  // answerWindow 15: p1 'a' у 3000 (утримання); buzz p2 у 40000 → at 3000, deadline 18000;
  // acceptAnswer у 50000 (wrong) → p2 deadline 65000; tick(64999) — p2 ще в черзі; tick(65000) → спроба p2 wrong
});
it('manual check: judge works on the pending head and repick stays', () => {
  // check 'manual': acceptAnswer → wrong_phase; judge(p1, false, t) → далі як в автоматичному; repick дозволений
});
it('kicking the pending head passes the hold to the next answer', () => {
  // p1 'a' у 3000, p2 'b' у 4000; removePlayer(p1) → pendingOf → p2, heldAt 3000; tick(9000) не знімає утримання
});
it('a pause over a pending blitz answer changes nothing', () => {
  // p1 'a' у 3000 → pause у 4000 → resume у 500000 → heldAt 3000; repick у 500000 → endsAt 517000
});
```

```ts
// manager.test.ts
it('a pending blitz answer stops the window timer until the host decides', () => {
  // answerWindow 5: buzz і відповідь голови → advance(10 хв) → спроб немає, queue[0] з відповіддю;
  // host accept → наступний розгляд за звичайними таймерами
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/engine/src/game.blitz.test.ts apps/server/src/rooms`
Expected: FAIL у нових тестах.

- [ ] **Step 3: Implement** за правилами вище; механічні зміни наявних тестів бліцу.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages apps/server
git commit -m "feat(engine): a blitz head answer waits for accept or re-pick, buzzes still queue"
```

---

### Задача 5: зрізи — відповідь одного гравця для всіх і зупинений таймер

**Files:**
- Modify: `packages/shared/src/views.ts`, `packages/engine/src/views.ts`
- Modify (механічно, нове поле): фабрики зрізів у `apps/web/src/screens/HostScreen.test.tsx`, `PlayerScreen.test.tsx`, `StageScreen.test.tsx`
- Test: `packages/engine/src/views.test.ts`

**Interfaces:**
- Produces (shared):
  ```ts
  /** Відповідь одного гравця, яку бачать усі («Мільйонер»). Правильної відповіді тут немає ніколи. */
  export interface Spotlight {
    playerId: string;
    nickname: string;
    /** null — у бліці гравець не встиг відповісти у вікно. */
    answer: Answer | null;
    /** null — чекає на рішення ведучого (помаранчевий); інакше вердикт. */
    grade: Grade | null;
  }
  // BaseView: spotlight: Spotlight | null;
  ```

**Правила:**
- **`spotlight` у полі** (лише `answerMode: 'phone'`, гравець, чий хід, ще в грі):
  - `question`: є `board.answer` → `grade: null`, інакше `null`;
  - `locked`: є `board.answer` → `grade: null` (вердикт до розкриття не видно), інакше `null`;
  - `reveal`: є запис → `{ answer: record.answer, grade: record.grade }`, інакше `null`.
- **`spotlight` у бліці** (етапи `question`, `locked`, `reveal`): `pendingOf` → `grade: null`; інакше остання спроба з `attempts` (`grade` спроби); інакше `null`. Поза полем і бліцем — `null`.
- **Зупинений таймер у зрізі.** Поки `heldAt !== null`, `BaseView.endsAt = null`, `remainingMs = remainingOf(state, heldAt)`, а `PlayerBlitz.deadline = null`. `canBuzz` під час утримання не змінюється (натискати можна).
- `reveal`/`correct` і `blitz.winner` не змінюються: правильну відповідь сцена й гравці отримують лише на `reveal`, ведучий — завжди.

- [ ] **Step 1: Write the failing tests:**

```ts
it('everyone sees the pending board answer in orange and the stopped timer', () => {
  // p1 відповів 'a' у 5000: stageView, playerView(p2), hostView → spotlight { nickname 'Анна', answer 'a', grade null };
  // stageView.endsAt null, remainingMs 15000
});
it('after accept everyone sees the verdict and the correct answer at the reveal', () => {
  // 'a' → acceptAnswer → stageView.spotlight.grade 'wrong', stageView.reveal.correctId 'b'
});
it('stage and player views never carry the correct answer before the reveal', () => {
  // текстове запитання в полі, відповідь у очікуванні → JSON.stringify(stageView) і playerView(p2) без 'accepted' і без
  // прийнятих написань; бліц: після прийняття неправильної відповіді → spotlight.grade 'wrong', reveal null, без 'correctId'
});
it('the blitz spotlight shows the pending head, then the last attempt', () => {
  // голова 'a' → grade null; accept → { p1, grade 'wrong' }; голова p2 'b' → grade null
});
it('the blitz window is hidden from the player while an answer is pending', () => {
  // answerWindow 15, p2 у черзі під час утримання → playerView(p2).me.blitz.deadline null, canBuzz для p3 true
});
it('voice board, classic and lobby views have no spotlight', () => {});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/engine/src/views.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** тип і проєкції; додати `spotlight: null` у фабрики зрізів тестів `apps/web`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages apps/web/src/screens
git commit -m "feat(engine): one player's answer and the stopped timer in all role views"
```

---

### Задача 6: гра — пульт, телефон і сцена

**Files:**
- Create: `apps/web/src/screens/SpotlightChoices.tsx`
- Modify: `apps/web/src/screens/HostScreen.tsx`, `PlayerScreen.tsx`, `StageScreen.tsx`, `apps/web/src/format.ts` (сюди переїжджає `pickedText` з `PlayerScreen.tsx`), `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/HostScreen.test.tsx`, `PlayerScreen.test.tsx`, `StageScreen.test.tsx`, `apps/web/src/screens/SpotlightChoices.test.tsx`

**Interfaces:**
- Consumes: `view.spotlight`, `view.endsAt`/`remainingMs` (задача 5); події `host:time`, `host:accept`, `host:repick` (задачі 2–3); `HostBoard.manual`, `HostBlitz.manual`.
- Produces:
  ```ts
  // format.ts
  export function pickedText(answer: Answer, choices: Choice[]): string;
  // SpotlightChoices.tsx
  /** Запитання для тих, хто не відповідає: варіанти лише для показу з кольором відповіді гравця. */
  export function SpotlightChoices(props: { question: PublicQuestion; spotlight: Spotlight | null; reveal: Question | null }): JSX.Element;
  ```

**Правила:**
- **`SpotlightChoices`:**
  - **Що показує.** Для `single`/`multi` — список `ul.choices` з буквами, для `boolean` — два пункти «Так»/«Ні» (ключі `yes`/`no`). Для `text`/`numeric`/`order` — рядок `p.spotlight-answer` з `pickedText(spotlight.answer, choices)` або нічого, якщо відповіді немає.
  - **Класи кольору** на варіанті, який вибрав гравець, або на рядку відповіді: `is-pending` при `grade === null`, `is-correct` при `correct`, `is-wrong` при `wrong`/`partial`.
  - **Правильний варіант** отримує `is-correct` лише з `reveal !== null`.
- **Напис «Відповідає {name}»** (наявний ключ `boardAnswering`) стоїть над текстом запитання на сцені й на телефонах тих, хто не відповідає. Ім'я — `spotlight?.nickname ?? board.turn?.nickname ?? blitz.queue[0]?.nickname`.
- **Телефон:**
  - **поле, не гравець, чий хід:** запитання й `SpotlightChoices` замість самого напису;
  - **поле, гравець, чий хід, з відповіддю в очікуванні:** його відповідь з `is-pending` і «Чекаємо на рішення ведучого»;
  - **бліц, гравець не в черзі:** запитання, `SpotlightChoices` і кнопка «Відповісти», як зараз;
  - **бліц, голова з відповіддю:** те саме, що в полі;
  - **`reveal`:** не гравець, чий хід, бачить `SpotlightChoices` з `reveal`, гравець, чий хід, — `Result`, як зараз.
- **Сцена.** У полі (телефон) і в бліці під варіантами — кольори `SpotlightChoices` замість простого списку. Лічильники `stats` на `reveal` лишаються.
- **Пульт:**
  - **«−15 с» / «+15 с»** (`host:time` з `{ seconds: -15 }` / `{ seconds: 15 }`) видно в етапі `question`, коли `endsAt !== null || remainingMs !== null`, у будь-якому раунді. Обидві діють і на паузі. «−15 с» неактивна, якщо `secondsLeft(view) ≤ 5`, «+15 с» — якщо `≥ 120`;
  - **панель «Відповідь чекає на рішення»** (`spotlight.grade === null` в етапі `question`) показує нікнейм і відповідь:
    - автоматична перевірка: «Прийняти» (`host:accept`) і «Перевибрати» (`host:repick`);
    - поле з `board.manual`: «Правильно» / «Частково» (якщо `round.partial`) / «Неправильно» (`host:override` з `chooserId`) і «Перевибрати»;
    - бліц з `blitz.manual`: «Правильно» / «Неправильно» (`host:judge` для голови) і «Перевибрати». Наявні кнопки суду в рядку черги прибираються, щоб не дублювати;
  - **кнопки оцінки поля** в `question` (`canGradeBoard`) лишаються лише для `answerMode: 'voice'`; у `locked`/`reveal` — як зараз.
- **Стилі:** токен `--pending` (помаранчевий, відмінний від `--amber`, наприклад `#ff7a1a`) у `:root`; `.choice.is-pending`, `.choice.is-wrong`, `.spotlight-answer.is-*`. Телефон 360 px — без горизонтальної прокрутки.
- **Ключі `i18n.ts`:** `timeMinus: '−15 с'`, `timePlus: '+15 с'`, `acceptAnswer: 'Прийняти'`, `repick: 'Перевибрати'`, `pendingTitle: 'Відповідь чекає на рішення'`, `pendingWait: 'Чекаємо на рішення ведучого'`, `err_time_limit: 'Залишок часу має бути від 5 до 120 секунд.'`.

- [ ] **Step 1: Write the failing tests:**

```ts
// HostScreen.test.tsx
it('adds or removes 15 seconds while the timer runs and respects the limits', async () => {
  // question, endsAt через 20 с: «+15 с» → send('host:time', { seconds: 15 }); залишок 5 с → «−15 с» disabled;
  // remainingMs 120000 (пауза) → «+15 с» disabled; етап reveal → кнопок немає
});
it('accepts or re-picks a pending answer in an automatic round', async () => {
  // spotlight { grade null }: «Прийняти» → 'host:accept'; «Перевибрати» → 'host:repick'
});
it('grades a pending board answer by hand and can still re-pick', async () => {
  // board.manual, round.partial: «Правильно» → send('host:override', { playerId: 'p1', grade: 'correct' }); «Частково» є; «Перевибрати» є
});
it('judges a pending blitz head by hand', async () => {
  // blitz.manual: «Неправильно» → send('host:judge', { playerId: 'p1', correct: false })
});
// PlayerScreen.test.tsx
it('shows the full question with the pending answer to a player who is not answering', () => {
  // board.turn інший, spotlight { nickname 'Анна', optionId 'a', grade null } → «Відповідає Анна» перед заголовком,
  // варіант «Львів» з класом is-pending, поля відповіді немає
});
it('the answering player sees their own pending answer and a waiting note', () => {});
// StageScreen.test.tsx
it('colours the pending answer, then the verdict with the correct option at the reveal', () => {
  // question + spotlight grade null → «Львів» is-pending, жодного is-correct; reveal з correctId 'b' + grade 'wrong' → «Львів» is-wrong, «Київ» is-correct
});
// SpotlightChoices.test.tsx
it('shows a typed answer for text, numeric and order questions', () => {
  // text 'Одеса' grade null → p.spotlight-answer.is-pending з 'Одеса'; order → 'Ужгород → Львів → …'
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/web/src/screens`
Expected: FAIL.

- [ ] **Step 3: Implement** екрани, компонент, стилі й тексти за правилами вище, у наявному візуальному напрямі (`panel`, `rows`, `tag`, `btn`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): ±15 s, pending answers with accept and re-pick on host, phone and stage"
```

---

### Задача 7: наскрізні сценарії

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе попереднє; наявні допоміжні функції файлу (`open`, `click`, `field`, `join`, `openRoundSettings`, `shot`). Залишок таймера читається через `page.getByRole('timer').getAttribute('aria-label')`.

- [ ] **Step 1: Оновити наявні сценарії бліцу й поля** під новий крок «Прийняти», зберігши їхні очікування подіуму й історії:
  - **бліц, запитання 1:** після відповідей Анни й Бориса ведучий тисне «Прийняти» (Анна, неправильно), потім ще раз «Прийняти» (Борис, правильно), потім «Показати відповідь»;
  - **поле:** кожна відповідь з телефона → «Прийняти» замість «Показати відповідь» (розкриття настає одразу), далі «Далі», як і було.

- [ ] **Step 2: Доповнити сценарій поля** (перейменувати на `'a board round: order, a doubled cell, pending answers with re-pick, ±15 s and an early end'`).

У редакторі, до заповнення клітинок:
- «Налаштування раунду» → «Однаковий час для всіх запитань раунду», «Секунд» 40 → «Застосувати»;
- після збереження перше запитання в редакторі має час 40.

Хід 1 (Алла, «Міста, 100»):
1. На сцені таймер ≤ 40. Ведучий тисне «+15 с» → таймер на сцені й на телефоні Богдана > 40.
2. Алла тисне «Ні» (неправильно). На сцені «Ні» має `.choice.is-pending`, а `.choice.is-correct` немає. У Богдана на телефоні «Відповідає Алла» і `.choice.is-pending`. Таймер на сцені стоїть: два читання з проміжком 1,5 с однакові.
3. Ведучий тисне «Перевибрати». Алла бачить варіанти знову й тисне «Так».
4. Ведучий тисне «Прийняти». На сцені «Так» `.is-correct`, у Алли «Правильно!».

Хід 2 (Богдан, ×2) і хід 3 (Богдан, «Річки, 100», неправильно), як і було, але через «Прийняти». На ході 3 на сцені «Ні» має `.is-wrong`, а «Так» — `.is-correct`.

Очікування подіуму й історії не змінюються: Богдан 400, Алла 100, ті самі три клітинки.

- [ ] **Step 3: Доповнити сценарій бліцу** (перейменувати на `'a blitz round: pending answers with re-pick, the queue decides, −15 s, the podium shows it'`).

Запитання 1:
1. Анна натискає й вибирає «Львів». На сцені «Відповідає Анна» і «Львів» `.is-pending`.
2. Борис натискає «Відповісти» під час помаранчевого стану й стає 2-м у черзі.
3. Ведучий тисне «Перевибрати». Анна знову вибирає «Львів».
4. Борис вибирає «Київ».
5. Ведучий тисне «Прийняти»: сцена показує «Львів» `.is-wrong` без `.is-correct`. Потім ще раз «Прийняти» (Борис), потім «Показати відповідь».

Запитання 2: ведучий тисне «−15 с» → таймер на сцені ≤ 15. Далі «Закрити запитання», як і було.

Очікування подіуму не змінюються: Борис 1000, Анна −1000.

- [ ] **Step 4: Run it**

Run: `pnpm e2e`
Expected: PASS усіх сценаріїв (наявні й оновлені); `problems` порожній.

- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e
git commit -m "test: ±15 s and pending answers with re-pick end-to-end on board and blitz"
```

Після фінальної рецензії гілки злити в `main`, запустити `pnpm test` і `git push origin main`. Render розгорне сам; міграцій у цьому плані немає.
