# План 7e: ва-банк і ставки зі спільним банком

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** фінальний раунд отримує дві нові речі (розділ 7 специфікації):
1. **Ва-банк.** Біля поля ставки — кнопка «Ва-банк»: ставка = уся поточна межа (усі бали). На розкритті сцена показує «ВА-БАНК!» біля гравця.
2. **Тип ставок фіналу**, який вибирає автор вікторини: «Класичні» (як зараз: правильно — плюс ставка, неправильно — мінус) і «Спільний банк»: хто помилився або мовчав, віддає ставку в банк; хто відповів правильно, зберігає свою й ділить банк пропорційно ставкам. Розкриття — по одному від найменшого рахунку; сцена показує, як банк росте з кожним програвшим, а наприкінці — розподіл між переможцями.

**Архітектура:**
- **Схема (`shared`).** `WAGER_MODES = ['classic', 'bank']`; `finalRoundSchema.wagerMode` з `.default('classic')` — збережені вікторини, знімки ігор і чернетки читаються як «Класичні». `RoundBrief.wagerMode` (null поза фіналом) для пояснення правил.
- **Рушій (`engine`).** Новий `bank.ts` з чистою `splitBank(entries)`. У `game.ts` — `withFinalPoints(state)`: перераховує бали всіх записів поточного запитання фіналу за режимом раунду (класика — `finalPoints`, банк — `splitBank`); викликається з `withTotals` (закриття, оцінка ведучого, вилучення, бали від ведучого) і після запису відповіді фіналу. Бали банку, отже, лежать у звичайних `AnswerRecord.points` — таблиця, `participant.score`, історія й профіль отримують їх без окремих шляхів. Ва-банк — намір у `FinalState.allIn` (ставка йде за межею, коли ведучий змінює бали під час ставок). Розкриття банку отримує додатковий крок `FinalState.split` після останнього гравця.
- **Без спойлерів.** Нова `finalVisiblePoints(state, playerId)`: до свого розкриття гравець має 0; у банку до кроку розподілу — «попередні» бали (помилка → −ставка, правильно → 0); після розподілу — справжні. Від неї рахуються `me.score`, `me.result.points`, `FinalEntry.after`, `FinalInfo.bank` для сцени й телефонів. Ведучий, як і досі, бачить справжні бали (відоме обмеження «консоль ведучого бачить підсумки фіналу до розкриття» лишається).
- **Сервер.** `player:wager` приймає `allIn?: boolean`. Нова колонка `answer.wager` (міграція `0007`): у банку бали ≠ ±ставка, тож історія більше не виводить ставку з `|points|`. Ачівка «Влучна ставка» = правильна відповідь у фіналі з ненульовою ставкою.
- **Веб.** Редактор: «Тип ставок» у налаштуваннях фіналу. Телефон: кнопка «Ва-банк», правило банку на формі ставки, підсумок з «у банк / ставку збережено / з банку / ставки повертаються». Сцена: «ВА-БАНК!», лічильник банку фіксованої висоти, розподіл. Ведучий: тег «ва-банк» у списку ставок, частки, кнопка «Розділити банк».

**Технології:** TypeScript, zod 4, vitest, Fastify + Socket.IO, Drizzle + PostgreSQL (PGlite у тестах), React + Vite, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-23-after-second-game-design.md`, розділ 7 (частина 7e), анти-цілі розділу 2 («правильна відповідь або підказка потрапляє на телефон чи сцену раніше розкриття», «гра застрягає», «старі вікторини перестали відкриватися або зламалася історія ігор і профіль», «проста класична вікторина стала складнішою у створенні», «елементи на екрані гравця стрибають під час чужих дій»), рішення розділу 11 («банк: округлення вниз, залишок найбільшій ставці; часткова відповідь = неправильна»). Частини 7a–7d уже в `main` (7d: `GameState.adjustments`, `followWagerLimit` у `adjust.ts` — межа ставки йде за рахунком під час ставок). Частини 7f–7g цей план не чіпає.

**Рішення плану там, де специфікація мовчить:**
- **Хто «правильно».** Запис з `grade === 'correct'`. У фіналі «частково» немає взагалі (`overrideFinal` → `partial_disabled`, автоперевірка — лише `accuracy === 1`, ланцюжок — лише пройдений), тож «часткова = неправильна» виконується саме собою. Мовчання = неправильно (як і досі, `settleFinal`). Тимчасовий «неправильно» за ручної перевірки — теж програвший, доки ведучий не оцінить; частки перераховуються після кожної оцінки.
- **Формула банку** (`splitBank`, записи в порядку `state.players`, тобто приєднання):
  - `bank` = сума ставок програвших; програвший отримує `−ставка`.
  - Переможці зі ставкою > 0 — «пайовики»; `sum` = сума їхніх ставок. Частка = `Math.floor(bank × ставка / sum)`; залишок (`bank − сума часток`) — пайовику з найбільшою ставкою, за рівності — першому в порядку приєднання. Переможець зі ставкою 0 отримує 0.
  - **Повернення:** якщо `bank > 0`, а пайовиків немає (ніхто не відповів правильно **або** всі правильні поставили 0) — `refund: true`, усі отримують 0 (ставки повертаються). Друге — моє рішення: інакше банк зник би в нікуди.
  - `bank === 0` (усі правильно або всі програвші поставили 0) — усі отримують 0, `refund: false`.
  - Сума балів банку завжди 0 (без повернення: програвші −bank, пайовики +bank).
- **Ва-банк.**
  - Кнопка ставить одразу (без «Поставити»); ставку, як і будь-яку, можна змінити до відкриття запитання. При межі 0 кнопки немає (лишається «Поставити 0»).
  - `placeWager(…, allIn = true)` ставить `limit` (аргумент `amount` ігнорується) і записує гравця в `FinalState.allIn`, якщо `limit > 0`. Звичайна ставка прибирає гравця з `allIn`.
  - Бали від ведучого під час ставок (`followWagerLimit`): ставка гравця з `allIn` дорівнює новій межі (і вгору, і вниз); межа 0 прибирає його з `allIn`. Ставка інших, як і досі, лише зменшується до межі.
  - «ВА-БАНК!» показується для кожного, чия ставка на мить відкриття запитання дорівнює межі й більша за 0 — натиснув він кнопку чи ввів суму вручну (`FinalPlay.allIn`). Ведучий і сам гравець під час ставок бачать «ва-банк» за тим самим правилом (`wager > 0 && wager === limit`).
  - Діє в обох типах ставок.
- **Розкриття банку** (порядок той самий: за зростанням рахунку до фіналу, рівні — за приєднанням):
  - Крок гравця: програвший — «ставка → у банк», рахунок `до → до − ставка`, лічильник банку зростає на його ставку; переможець — «ставку збережено», рахунок `до → до`, банк не змінюється. Нічого про ще не розкритих гравців не видно.
  - Після останнього гравця, якщо загальний банк > 0, ведучий тисне «Розділити банк» (новий крок `split`): переможцям додаються частки («+642 з банку»), лічильник показує «Банк 1500 розділено»; або, за поверненням, «Ніхто не відповів правильно — ставки повертаються» і рахунки програвших повертаються до «до». Якщо банк 0 — кроку немає, наступне «Далі» завершує раунд (як у класиці).
  - Те, що проміжний рахунок програвшого («до − ставка») потім може повернутися, — не спойлер: він залежить лише від уже розкритого.
  - `end` і `endRound` після відкриття запитання вважають розкритими всіх і `split = true`.
  - Ведучий може змінити оцінку розкритого гравця на розкритті (як і досі) — банк і частки перераховуються.
- **Вилучення гравця** у фіналі прибирає його ставку з банку (його записів більше немає), частки решти перераховуються. Попередні фінали (якщо їх кілька) не чіпаються: `withFinalPoints` працює лише з поточним запитанням фіналу.
- **Кілька фіналів у вікторині** дозволені схемою й раніше — кожен має свій тип ставок. Наскрізний сценарій цим користується.
- **Ведучий** бачить справжні бали записів (як і досі) і ту саму «видиму» суму банку, що й сцена; кнопка «Розділити банк» з'являється за `HostFinal.splitNext`. Ознаку «буде крок розподілу» бачить лише ведучий: на сцені вона видала б, що хтось помилився.
- **Зберігання.** Колонка `answer.wager integer` (nullable): рекордер пише ставку для кожного рядка запитання фіналу; для старих ігор `null` → історія бере `|points|`, як і досі. `GameQuestionResult.final.mode` — тип ставок зі знімка (у старих знімках — `classic` за замовчуванням схеми).
- **Ачівка «Влучна ставка»** (`hitFinal`): рядок фіналу `accepted && (wager ?? points) > 0`. У класиці це те саме, що й було (`points > 0`); у банку правильна відповідь з ненульовою ставкою — влучання навіть тоді, коли банк порожній. Підказку ачівки уточнюємо.
- **Демо:** фінал `movie-quiz.ts` переходить на «Спільний банк»; решта — «Класичні».

## Глобальні обмеження

- Старі вікторини, чернетки, знімки ігор, історія й профіль поводяться як зараз: `wagerMode` за замовчуванням `classic`; міграція `0007` лише додає nullable-колонку.
- Нова вікторина створюється так само просто: «Тип ставок» має значення «Класичні» й не обов'язковий.
- Рушій чистий: `now` і `rng` — аргументи. Бали лише цілі (`Math.floor` у частках).
- Анти-ціль «спойлер»: сцена й телефони до розкриття гравця не бачать ні його ставки, ні результату, ні впливу на банк; до кроку розподілу — жодних часток і жодної ознаки повернення.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`. Нові кольори — токени в `:root` у `styles.css` (`--bank`, `--allin`). Тема лише темна. Поля введення — у `label.field`, шрифт ≥ 16 px.
- Розкладка працює на ширині 375 px без горизонтальної прокрутки. Анімації («ВА-БАНК!», зростання банку) — лише за `prefers-reduced-motion: no-preference`. Під час розкриття нічого не стрибає: лічильник банку й рядок підсумку на телефоні мають фіксовану висоту й лише змінюють текст.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2` (саме `--maxWorkers=2`: паралельні робітники PGlite падають на цій машині).
- Наскрізні тести: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Кадри — з `E2E_SHOTS=1` у `apps/server/e2e/artifacts/shots`.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (проєкт тестовий).

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/quiz.ts` | `WAGER_MODES`, `WagerMode`, `finalRoundSchema.wagerMode` | 1 |
| `packages/shared/src/round-brief.ts` | `RoundBrief.wagerMode` | 1 |
| `packages/engine/src/bank.ts` (новий) | `splitBank`, `BankEntry`, `BankOutcome` | 1 |
| `packages/engine/src/game.ts` | `withFinalPoints`, виклики в `withTotals`/`submitFinalAnswer` | 1 |
| `packages/engine/src/chain.ts` | `guessWord` у фіналі → `withFinalPoints` | 1 |
| `packages/engine/src/testing/fixtures.ts`, `apps/web/src/editor/draft.ts`, `draft-storage.ts`, `apps/server/scripts/*-quiz.ts`, веб-тести з літералами фіналу | `wagerMode: 'classic'` | 1 |
| `packages/engine/src/game.ts`, `final.ts`, `adjust.ts` | `FinalState.allIn`, `FinalPlay.allIn`, `placeWager(…, allIn)`, `followWagerLimit` | 2 |
| `packages/shared/src/events.ts` | `wagerSchema.allIn` | 2 |
| `packages/shared/src/views.ts`, `packages/engine/src/views.ts` | `FinalEntry.allIn`, `HostFinal.wagers[].allIn`, `me.final.allIn` | 2 |
| `apps/server/src/rooms/manager.ts`, `socket.ts` | `wager(room, id, amount, allIn)` | 2 |
| `packages/engine/src/game.ts` | `FinalState.split`, `needsSplit`, крок розподілу в `next`, `finalVisiblePoints` | 3 |
| `packages/shared/src/views.ts`, `packages/engine/src/views.ts` | `FinalInfo.mode/bank/split`, `FinalSplit`, `FinalEntry.share`, `HostFinal.splitNext`; видимі бали в `playerView` | 3 |
| `apps/server/src/db/schema.ts`, `apps/server/drizzle/0007_final_wagers.sql` (+ `meta`) | `answer.wager` | 4 |
| `apps/server/src/recorder.ts`, `history.ts`, `achievements.ts`, `testing/history-rows.ts`, `testing/final-game.ts` | запис ставки, `final.mode`, `TableRow.wager`, `hitFinal` | 4 |
| `packages/shared/src/history.ts`, `apps/web/src/pages/GameHistory.tsx` | `final.mode`, заголовок банку | 4 |
| `apps/web/src/editor/RoundSettings.tsx`, `apps/web/src/round-summary.ts` | «Тип ставок», пояснення банку | 5 |
| `apps/web/src/screens/PlayerScreen.tsx` | `WagerForm` з «Ва-банк», `FinalResult` у банку | 5 |
| `apps/server/scripts/movie-quiz.ts`, `demo-quiz.test.ts` | демо-фінал у банку | 5 |
| `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/HostScreen.tsx` | «ВА-БАНК!», лічильник банку, розподіл; тег, частки, «Розділити банк» | 6 |
| `apps/web/src/i18n.ts`, `apps/web/src/styles.css` | тексти й стилі веб-задач | 4–6 |
| `apps/server/e2e/full-game.e2e.ts` | наскрізний сценарій 7e | 7 |

## Порядок збирання

- Задача 1 (тип ставок і підрахунок банку) — основа. Після неї бали банку правильні в кінці гри, але розкриття ще класичне (крок за кроком без розподілу, «до → після» одразу справжні) — це тимчасово, задача 3 це змінює. Вікторин з банком до задачі 5 у редакторі не створити, тож користувач тимчасового стану не побачить.
- Задача 2 (ва-банк) спирається лише на наявний код; від задачі 1 залежить через спільні файли.
- Задача 3 (розкриття банку й зрізи) — на 1 і 2. Задача 4 (база, історія, ачівка) — на 1.
- Задачі 5 і 6 (веб) — на 2 і 3; 4-та потрібна лише для історії. Задача 7 (e2e) — остання.
- Наявні наскрізні сценарії не змінюються: класичний фінал виглядає як раніше, лише ставка «усе» отримує позначку «ВА-БАНК!» (у `finalGame` Алла ставить 1000 з 1000 — перевірки `toContain('1000→0')` і історія `'Алла:ставка1000,−1000'` лишаються істинними).

## На що дивитися рецензентові

1. **Ніяких спойлерів на розкритті банку.** До свого розкриття гравець без змін; лічильник банку рахує лише розкритих програвших; до розподілу немає часток і ознаки повернення; «Розділити банк» бачить лише ведучий. Тести: задача 3, `nothing about unrevealed players or the split leaks to the stage or phones`, `the split step exists only when the bank is not empty`.
2. **Підсумки збігаються скрізь.** Частки лежать у `AnswerRecord.points` → `participant.score` = таблиця = історія = «Мої ігри»; ставка в історії — зі збереженої колонки, а не з `|points|`. Тести: задача 1, `bank points land in the scores and survive a kick and a manual grade`; задача 4, `history shows the stored wager and the bank mode, totals match`; задача 7 — історія двох фіналів.
3. **Формула на межах.** Залишок, рівні найбільші ставки, переможець зі ставкою 0, усі правильні, ніхто, переможці лише з нулями. Тести: задача 1, усі `splitBank …`.
4. **Ва-банк і бали від ведучого.** Ставка ва-банк іде за межею вгору й униз; звичайна ставка лише зменшується; межа 0 — без ва-банку. Тести: задача 2, `all-in follows host points during the wagers`, `all-in with a zero limit is a plain zero`.
5. **Старі дані й проста вікторина.** Фінал без `wagerMode` читається як «Класичні» (сервер, чернетка, знімок); старі рядки `answer` без ставки показуються як раніше; 375 px без прокрутки; лічильник банку не зсуває список. Тести: задача 1, `a stored final without a wager mode is classic`; задача 4, `old rows without a wager keep |points|`; задача 5, `a draft without a wager mode loads as classic`; задача 6, `the bank meter keeps its place from the first reveal to the split`; задача 7, `expectNoSideScroll`.

---

### Задача 1. Тип ставок фіналу й підрахунок спільного банку

**Files:**
- Create: `packages/engine/src/bank.ts`, `packages/engine/src/bank.test.ts`, `packages/engine/src/game.bank.test.ts`
- Modify: `packages/shared/src/quiz.ts` (`finalRoundSchema` ~277), `packages/shared/src/round-brief.ts`, `packages/shared/src/quiz.test.ts`
- Modify: `packages/engine/src/game.ts` (`withTotals` ~596, `submitFinalAnswer` ~728, новий `withFinalPoints`), `packages/engine/src/chain.ts` (`guessWord`), `packages/engine/src/index.ts` (`export * from './bank'`), `packages/engine/src/round-brief.test.ts`
- Modify (механічно, щоб `pnpm typecheck` був зеленим): `packages/engine/src/testing/fixtures.ts` (`finalRound` → `wagerMode: 'classic', ...options`), `apps/web/src/editor/draft.ts` (новий фінал ~188), `apps/web/src/editor/draft-storage.ts` (`loadDraft`: фінал → `wagerMode: round.wagerMode ?? 'classic'`), `apps/server/scripts/demo-quiz.ts`, `erudite-quiz.ts`, `movie-quiz.ts` (`wagerMode: 'classic'`), веб-тести з літералами раунду фіналу (`draft.test.ts`, `QuizEditor.test.tsx`, `History.test.tsx`, `HostScreen.test.tsx`, `PlayerScreen.test.tsx`, `StageScreen.test.tsx` — знайти через `pnpm typecheck`)

**Interfaces:**
- Produces (`shared`):
  ```ts
  // quiz.ts
  /** Тип ставок фіналу: класичні (±ставка) або спільний банк. */
  export const WAGER_MODES = ['classic', 'bank'] as const;
  export type WagerMode = (typeof WAGER_MODES)[number];
  // finalRoundSchema:
  /** Тип ставок; старі вікторини без нього — класичні. */
  wagerMode: z.enum(WAGER_MODES).default('classic'),
  // round-brief.ts, RoundBrief:
  /** Фінал: тип ставок; null поза фіналом. */
  wagerMode: WagerMode | null;   // emptyBrief → null; roundBrief(final) → { ...base, wagerMode: round.wagerMode }
  ```
- Produces (`engine`):
  ```ts
  // bank.ts
  export interface BankEntry { playerId: string; wager: number; correct: boolean }
  export interface BankOutcome {
    /** Сума ставок програвших. */
    bank: number;
    /** bank > 0, а переможців зі ставкою > 0 немає: ставки повертаються, усі отримують 0. */
    refund: boolean;
    /** Бали фіналу кожного гравця з entries. */
    points: Record<string, number>;
  }
  /** Ділить банк між переможцями пропорційно ставкам; entries — у порядку приєднання (для рівних найбільших ставок). */
  export function splitBank(entries: BankEntry[]): BankOutcome;
  // game.ts
  /** Бали фіналу кожного гравця поточного запитання фіналу за типом ставок раунду; гравець без запису — програвший. */
  export function finalOutcome(state: GameState): BankOutcome | null;   // null без відкритого запитання фіналу; у класиці bank 0, refund false, points = finalPoints
  /** Перезаписує basePoints і points усіх записів поточного запитання фіналу за finalOutcome; поза ним — стан без змін. */
  export function withFinalPoints(state: GameState): GameState;
  ```

- [ ] **Step 1: Write the failing tests.**
  `bank.test.ts` (рядки `e(id, wager, correct)` = `{ playerId: id, wager, correct }`):
  ```ts
  it('splitBank gives the losers’ stakes to the winners by their stakes, the remainder to the biggest stake', () => {
    expect(splitBank([e('a', 1000, false), e('b', 400, true), e('c', 200, true)]))
      .toEqual({ bank: 1000, refund: false, points: { a: -1000, b: 667, c: 333 } });
  });
  it('splitBank breaks a tie between the biggest stakes by the join order', () => {
    expect(splitBank([e('a', 101, false), e('b', 300, true), e('c', 300, true)]).points).toEqual({ a: -101, b: 51, c: 50 });
  });
  it('splitBank gives nothing to a winner who staked zero', () => {
    expect(splitBank([e('a', 500, false), e('b', 0, true), e('c', 250, true)]).points).toEqual({ a: -500, b: 0, c: 500 });
  });
  it('splitBank returns the stakes when nobody is right or every winner staked zero', () => {
    expect(splitBank([e('a', 500, false), e('b', 200, false)])).toEqual({ bank: 700, refund: true, points: { a: 0, b: 0 } });
    expect(splitBank([e('a', 500, false), e('b', 0, true)])).toEqual({ bank: 500, refund: true, points: { a: 0, b: 0 } });
  });
  it('splitBank changes nothing when everyone is right or the losers staked zero', () => {
    expect(splitBank([e('a', 500, true), e('b', 200, true)])).toEqual({ bank: 0, refund: false, points: { a: 0, b: 0 } });
    expect(splitBank([e('a', 0, false), e('b', 200, true)])).toEqual({ bank: 0, refund: false, points: { a: 0, b: 0 } });
    expect(splitBank([])).toEqual({ bank: 0, refund: false, points: {} });
  });
  ```
  `game.bank.test.ts` — хелпери за зразком `game.final.test.ts` (`quizWith`, `toRoundEnd`, `toWagers`; рахунки після класичного раунду 1000 / 400 / −400). `toBankQuestion()`: `toWagers({ wagerMode: 'bank' })`, `adjustScore(s, 'p3', 1000, 8500)` (межа Віри 600), ставки p1 1000, p2 400, p3 200 — запитання відкрито.
  ```ts
  it('bank points land in the scores: losers pay their stake, winners split it by stakes', () => {
    let s = toBankQuestion();
    s = must(submitAnswer(s, 'p1', wrong, 11_000));
    s = must(submitAnswer(s, 'p2', right, 11_500));
    s = must(submitAnswer(s, 'p3', right, 12_000)); // усі відповіли → locked
    expect(s.phase).toBe('locked');
    expect([0, 1, 2].map((i) => finalRecord(s, `p${i + 1}`)?.points)).toEqual([-1000, 667, 333]);
    expect(scores(s)).toEqual([0, 1067, 933]);
    expect(finalOutcome(s)).toMatchObject({ bank: 1000, refund: false });
  });
  it('silence is a loss and nobody right returns the stakes', () => {
    // toWagers({ wagerMode: 'bank' }); ставки p1 500, p2 400, p3 0; p1 і p3 неправильно, p2 мовчить; lock
    // → записи всіх трьох з points 0, grade 'wrong'; scores [1000, 400, -400]; finalOutcome → { bank: 900, refund: true }
  });
  it('bank points survive a kick and a manual grade', () => {
    // toBankQuestion з { wagerMode: 'bank', check: 'manual' }: усі троє відповідають → усі тимчасово 'wrong' → refund, scores [1000, 400, 600]
    // override(s, 'p2', 'correct') → p2 +1200 (банк 1000 + 200), scores [0, 1600, 400]
    // removePlayer(s, 'p1') → банк 200, p2 +200, p3 −200: scores [600, 400]
  });
  it('a classic final still adds or takes the wager', () => {
    // toWagers() без wagerMode; ставки 500/400/0; p1 правильно, p2 неправильно, p3 мовчить; lock → scores [1500, 0, -400]
  });
  it('a chain final in the bank mode', () => {
    // quizWith({ wagerMode: 'bank' }, chain): p1 проходить ланцюжок, p2 грає й не проходить → p1 отримує ставку p2 (за зразком наявного тесту ланцюжка у фіналі)
  });
  ```
  `quiz.test.ts`: `a stored final without a wager mode is classic` — `finalRoundSchema.parse({ …без wagerMode })` → `wagerMode === 'classic'`; `{ wagerMode: 'pot' }` → помилка; `'bank'` проходить.
  `round-brief.test.ts`: `roundBrief(finalRound('f1', single))` → `{ ...emptyBrief('final'), wagerMode: 'classic' }`; з `{ wagerMode: 'bank' }` → `'bank'`; класичний раунд → `wagerMode: null`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages`. Очікується FAIL: немає `bank.ts`, `wagerMode`.

- [ ] **Step 3: Implement.**
  - `bank.ts` — за правилами з розділу «Рішення плану»; залишок — `reduce` за найбільшою ставкою з порівнянням `>` (перший з рівних лишається).
  - `game.ts`: `finalOutcome` бере `finalPlayOf(state)`, раунд `state.quiz.rounds[play.roundIndex]`, для кожного з `state.players` — `correct = recordOf(…)?.grade === 'correct'`, `wager = wagerOf(play.final, id)`. `withFinalPoints` змінює лише наявні записи (`basePoints = points = outcome.points[id]`, `streakBonus` лишається 0). `withTotals` першим рядком викликає `withFinalPoints` (ідемпотентно в класиці). `submitFinalAnswer` повертає `autoLock(withFinalPoints(withRecord(…)))` — щоб записи ведучого під час запитання не показували класичну формулу в банку.
  - `chain.ts`: запис пройденого ланцюжка у фіналі теж проходить через `withFinalPoints` (`scoreChain` і так закінчується закриттям → `withTotals`).
  - Механічні правки з переліку Files.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages apps/web/src apps/server/scripts
git commit -m "feat(engine): final wager type — classic or a shared bank split by stakes, remainder to the biggest stake, stakes back when nobody is right"
```

---

### Задача 2. Ва-банк: рушій, подія, зрізи

**Files:**
- Modify: `packages/engine/src/game.ts` (`FinalState` ~112, `FinalPlay` ~124, `enterRound` ~933, `openFinalQuestion` ~458, `dropFromFinal` ~345), `packages/engine/src/final.ts` (`placeWager`), `packages/engine/src/adjust.ts` (`followWagerLimit`)
- Modify: `packages/shared/src/events.ts` (`wagerSchema`), `packages/shared/src/views.ts` (`FinalEntry`, `HostFinal.wagers`, `PlayerView.me.final`), `packages/engine/src/views.ts` (`finalEntries`, `hostFinal`, `playerFinal`)
- Modify: `apps/server/src/rooms/manager.ts` (`wager` ~261), `apps/server/src/socket.ts` (`player:wager` ~128)
- Modify (механічно): веб-фабрики зрізів з `FinalEntry`, `me.final`, `HostFinal.wagers` (`allIn: false`)
- Test: `packages/engine/src/game.final.test.ts`, `packages/engine/src/views.test.ts`, `apps/server/src/rooms/manager.test.ts`, `apps/server/src/socket.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // engine/game.ts
  // FinalState: /** Хто натиснув «Ва-банк»: ставка йде за межею, поки триває етап ставок. */ allIn: string[];   enterRound → []
  // FinalPlay:  /** Хто на мить відкриття запитання поставив усю межу (> 0), у порядку гравців. */ allIn: string[];
  // engine/final.ts
  export function placeWager(state: GameState, playerId: string, amount: number, now: number, rng: Rng, allIn?: boolean): Result;
  // shared/events.ts
  export const wagerSchema = z.object({ amount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), allIn: z.boolean().optional() });
  // shared/views.ts
  // FinalEntry: /** Ставка дорівнювала всім балам (> 0). */ allIn: boolean;
  // HostFinal.wagers[]: allIn: boolean   (wager !== null && wager > 0 && wager === limit)
  // PlayerView.me.final: { wager: number | null; limit: number; allIn: boolean } | null   (те саме правило)
  // server/manager.ts
  wager(room: Room, playerId: string, amount: number, allIn?: boolean): AckResult;
  ```

- [ ] **Step 1: Write the failing tests** у `game.final.test.ts` (хелпери файлу: `toWagers`, межі 1000 / 400 / 0):
  ```ts
  it('all-in stakes the whole limit and a plain wager drops it', () => {
    let s = must(placeWager(toWagers(), 'p1', 0, 9000, rng, true));
    expect(s.final?.wagers.p1).toBe(1000);
    expect(s.final?.allIn).toEqual(['p1']);
    s = must(placeWager(s, 'p1', 300, 9100, rng));
    expect(s.final?.allIn).toEqual([]);
  });
  it('all-in follows host points during the wagers', () => {
    let s = must(placeWager(toWagers(), 'p1', 0, 9000, rng, true));
    s = must(adjustScore(s, 'p1', 200, 9100));
    expect([s.final?.limits.p1, s.final?.wagers.p1]).toEqual([1200, 1200]);
    s = must(adjustScore(s, 'p1', -500, 9200));
    expect([s.final?.limits.p1, s.final?.wagers.p1]).toEqual([700, 700]);
    s = must(adjustScore(s, 'p1', -800, 9300));
    expect([s.final?.limits.p1, s.final?.wagers.p1, s.final?.allIn]).toEqual([0, 0, []]);
    // звичайна ставка не росте: p2 ставить 300, +500 → межа 900, ставка 300
  });
  it('all-in with a zero limit is a plain zero', () => {
    const s = must(placeWager(toWagers(), 'p3', 0, 9000, rng, true));
    expect([s.final?.wagers.p3, s.final?.allIn]).toEqual([0, []]);
  });
  it('the question remembers every stake of the whole limit, pressed or typed', () => {
    let s = must(placeWager(toWagers(), 'p1', 0, 9000, rng, true));
    s = must(placeWager(s, 'p2', 400, 9100, rng));
    s = must(placeWager(s, 'p3', 0, 9200, rng));
    expect(last(s).final?.allIn).toEqual(['p1', 'p2']);
  });
  it('kicking a player drops the all-in mark', () => { /* p1 ва-банк, removePlayer(p1) → final.allIn [] */ });
  ```
  `views.test.ts`: `all-in shows on the reveal, in the host wagers and in the own wager` — на ставках `hostView().final.wagers` для p1 `allIn: true`, для p2 (300 з 400) `false`; `playerView(p1).me.final` → `{ wager: 1000, limit: 1000, allIn: true }`; після розкриття p1 `stageView().final.shown[…].allIn === true`.
  `manager.test.ts`: `manager.wager(room, id, 0, true)` на етапі ставок → `ok`, ставка = межа.
  `socket.test.ts`: `player:wager` з `{ amount: 0, allIn: true }` → `ok`; з `{ amount: 0, allIn: 'yes' }` → `invalid_payload`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine apps/server/src/rooms apps/server/src/socket.test.ts`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - `placeWager`: `const amountToPlace = allIn ? limit : amount`; перевірка `wager_invalid` — для `amountToPlace`; `allIn` у стані: додати id, якщо `allIn && limit > 0`, інакше прибрати.
  - `followWagerLimit`: якщо id в `final.allIn` і є ставка — ставка = `limit`; якщо `limit === 0` — прибрати з `allIn`. Інакше — як зараз.
  - `openFinalQuestion`: `allIn = state.players.filter((p) => wagers[p.id] > 0 && wagers[p.id] === limits[p.id]).map((p) => p.id)`.
  - `dropFromFinal` і фільтр `play.final` у `removePlayer` прибирають id з обох `allIn`.
  - Зрізи — за правилом з Interfaces; `FinalEntry.allIn` — з `play.final.allIn`.
  - Сервер: передати `payload.data.allIn ?? false`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages apps/server/src apps/web/src
git commit -m "feat(engine): all-in wager — the whole limit, follows host points during the wagers, marked on the reveal"
```

---

### Задача 3. Розкриття банку без спойлерів: крок розподілу й видимі бали

**Files:**
- Modify: `packages/engine/src/game.ts` (`FinalState.split`, `next` case `'reveal'` ~955, `closeFinal` ~534, нові `needsSplit`, `finalVisiblePoints`)
- Modify: `packages/shared/src/views.ts` (`FinalEntry.share`, `FinalInfo`, `FinalSplit`, `HostFinal.splitNext`), `packages/engine/src/views.ts` (`finalEntries`, `finalInfo`, `hostFinal`, `playerView` ~600)
- Modify (механічно): веб-фабрики зрізів (`mode: 'classic', bank: 0, split: null`, `share: null`, `splitNext: false`)
- Test: `packages/engine/src/game.bank.test.ts`, `packages/engine/src/views.test.ts`

**Interfaces:**
- Consumes: `finalOutcome`, `withFinalPoints` (задача 1); `FinalPlay.allIn` (задача 2).
- Produces:
  ```ts
  // engine/game.ts
  // FinalState: /** Банк розподілено (крок після останнього розкриття); у класиці не використовується. */ split: boolean;   enterRound → false
  /** Раунд з банком, запитання відкрито, загальний банк > 0 і розподілу ще не було. */
  export function needsSplit(state: GameState): boolean;
  /**
   * Бали фіналу гравця, які вже можна показати сцені й телефонам: поза фіналом — points запису;
   * до розкриття гравця — 0; у банку до розподілу — помилка −ставка, правильно 0; далі — points запису.
   */
  export function finalVisiblePoints(state: GameState, playerId: string): number;
  // shared/views.ts
  export interface FinalSplit {
    bank: number;
    refund: boolean;
    /** Переможці з часткою > 0, за спаданням частки. */
    shares: { playerId: string; nickname: string; wager: number; share: number }[];
  }
  // FinalEntry: /** Частка з банку після розподілу; null у класиці й до розподілу. */ share: number | null;
  //             after = before + finalVisiblePoints (для сцени й телефонів)
  // FinalInfo:  mode: WagerMode;
  //             /** Сума ставок розкритих програвших; 0 у класиці й поза reveal. */ bank: number;
  //             /** Підсумок розподілу; null до кроку розподілу й у класиці. */ split: FinalSplit | null;
  // HostFinal:  /** Наступне «Далі» розподіляє банк. */ splitNext: boolean;
  ```

- [ ] **Step 1: Write the failing tests** у `game.bank.test.ts` (`toBankReveal()` = `toBankQuestion()` з відповідями p1 неправильно, p2 і p3 правильно → `next` → reveal; порядок `['p2', 'p3', 'p1']`, рахунки до фіналу 400 / 600 / 1000):
  ```ts
  it('the bank reveal: losers pay in one by one, winners wait, the split comes last', () => {
    let s = must(next(toBankReveal(), 14_000, rng)); // p2
    let stage = stageView(s).final!;
    expect(stage.shown.map((e) => [e.nickname, e.before, e.after, e.allIn, e.share])).toEqual([['Богдан', 400, 400, true, null]]);
    expect([stage.bank, stage.split]).toEqual([0, null]);
    expect(playerView(s, 'p2')!.me).toMatchObject({ score: 400, result: { points: 0 } });
    s = must(next(s, 15_000, rng)); // p3
    s = must(next(s, 16_000, rng)); // p1
    stage = stageView(s).final!;
    expect(stage.shown.at(-1)).toMatchObject({ nickname: 'Анна', before: 1000, after: 0, allIn: true });
    expect([stage.bank, stage.left]).toEqual([1000, 0]);
    expect(hostView(s).final?.splitNext).toBe(true);
    s = must(next(s, 17_000, rng)); // розподіл
    expect([s.phase, s.final?.split]).toEqual(['reveal', true]);
    stage = stageView(s).final!;
    expect(stage.split).toEqual({ bank: 1000, refund: false, shares: [
      { playerId: 'p2', nickname: 'Богдан', wager: 400, share: 667 }, { playerId: 'p3', nickname: 'Віра', wager: 200, share: 333 }] });
    expect(stage.shown.find((e) => e.playerId === 'p2')).toMatchObject({ after: 1067, share: 667 });
    expect(playerView(s, 'p2')!.me.score).toBe(1067);
    expect(hostView(s).final?.splitNext).toBe(false);
    expect(must(next(s, 18_000, rng)).phase).toBe('finished');
  });
  it('nothing about unrevealed players or the split leaks to the stage or phones', () => {
    // після першого кроку (p2): JSON.stringify(stageView(s)) і playerView(s, 'p3') не містять 667, 1067, 333, 933;
    // stageView(s).final.bank === 0, хоча p1 уже програв; playerView(s, 'p1').me.score === 1000, result === null;
    // ключа splitNext немає в stageView(s).final і playerView(s, 'p1').final
  });
  it('a refund: the losers’ scores come back on the split step', () => {
    // ставки p1 500 (неправильно), p2 400 (мовчить), p3 0 (неправильно); порядок ['p3', 'p2', 'p1'];
    // після трьох кроків bank 900, рядок p2: before 400, after 0; після розподілу split { bank: 900, refund: true, shares: [] },
    // рядок p2 after 400, playerView(p1).me.score 1000
  });
  it('the split step exists only when the bank is not empty', () => {
    // усі правильно (ставки 500/400/0): після трьох кроків splitNext false, наступне next → finished
    // класика: needsSplit завжди false, кроків стільки ж, скільки гравців
  });
  it('ending the round or the game during the bank reveal splits it', () => {
    // toBankReveal → endRound → split true, scores [0, 1067, 933]; так само end()
  });
  it('the host regrades a revealed player and the bank follows', () => {
    // ручна перевірка: після розподілу ведучий ставить p3 'wrong' → p2 отримує весь банк 1200; stageView.final.split оновлено
  });
  ```
  `views.test.ts`: `the classic reveal keeps before → after and no bank` — у класичному фіналі `final.mode === 'classic'`, `bank === 0`, `split === null`, `share === null`, `after` = справжній рахунок (наявна поведінка не змінилась).

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - `needsSplit`: `round.wagerMode === 'bank' && finalPlayOf(state) !== undefined && !state.final.split && (finalOutcome(state)?.bank ?? 0) > 0`.
  - `next`, `'reveal'` у фіналі: `shown < order.length` → `shown + 1`; інакше `needsSplit` → `split: true`; інакше `finishRound`.
  - `closeFinal`: окрім `shown = order.length`, ставить `split: true`.
  - `finalVisiblePoints`: як у Interfaces; «у банку до розподілу» = `wagerMode === 'bank' && !state.final.split`; попередні бали — `grade === 'correct' ? 0 : -wager`.
  - `views.ts`: `finalEntries(state, visible: boolean)` — для сцени й телефонів `after = before + finalVisiblePoints`, `share` — `outcome.points[id]` для переможця лише після `split`; ведучий — `visible = false` (справжні бали, як зараз). `FinalInfo.bank` — сума `wager` розкритих рядків з `grade !== 'correct'`. `split` — з `finalOutcome` після `state.final.split`. `playerView`: `hidden = phase === 'locked' ? record.points : phase === 'reveal' ? record.points - finalVisiblePoints(state, playerId) : 0`; `result.points = finalVisiblePoints(…)` у фіналі.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages apps/web/src
git commit -m "feat(engine): bank reveal — losers pay in one by one, winners wait, a split step at the end, nothing leaks early"
```

---

### Задача 4. Ставка в базі, історії й ачівці

**Files:**
- Modify: `apps/server/src/db/schema.ts` (`answer`: `wager: integer('wager')` з коментарем «Ставка у фіналі; null поза фіналом і в старих іграх»)
- Create: `apps/server/drizzle/0007_final_wagers.sql` (`ALTER TABLE "answer" ADD COLUMN "wager" integer;` з коментарем-заголовком, як у `0006`) і оновлені `meta/_journal.json`, `meta/0007_snapshot.json` — `pnpm --filter @quiz/server exec drizzle-kit generate --name final_wagers`
- Modify: `apps/server/src/recorder.ts` (`AnswerRow.wager`, `answerRows`), `apps/server/src/history.ts` (`finalResult`, `TableRow`, `gameTables`), `apps/server/src/achievements.ts` (`hitFinal`)
- Modify: `packages/shared/src/history.ts` (`GameQuestionResult.final.mode`), `apps/server/src/testing/history-rows.ts` (`rows[].wager?`), `apps/server/src/testing/final-game.ts` (`playToEnd` — опційний `wrongAnswers: string[] = []`)
- Modify: `apps/web/src/pages/GameHistory.tsx` (~100), `apps/web/src/i18n.ts` (`historyFinalBank`, `achievementHint_final_hit`)
- Test: `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts`, `apps/server/src/achievements.test.ts`, `apps/server/src/profiles.test.ts`, `apps/web/src/pages/History.test.tsx`

**Interfaces:**
- Consumes: бали банку в записах (задача 1), `wagerOf` (у `game.ts` — експортувати як `finalWagerOf(play: Play, playerId: string): number` або взяти з `play.final.wagers`).
- Produces:
  ```ts
  // shared/history.ts, GameQuestionResult.final:
  final: { mode: WagerMode; entries: { nickname: string; answer: Answer | null; wager: number; points: number; accepted: boolean }[] } | null;
  // server/history.ts
  export interface TableRow { roundIndex: number; attempt: number; accepted: boolean; points: number; /** Ставка фіналу; null поза фіналом і в старих іграх. */ wager: number | null }
  // achievements.ts
  /** У фінал-раунді є рядок учасника accepted && (wager ?? points) > 0. */
  export function hitFinal(table: GameTable, participantId: string): boolean;
  ```

- [ ] **Step 1: Write the failing tests.**
  - `recorder.test.ts`: `the final rows keep the wager, the bank shares are the points` — гра `playToEnd` з фіналом `wagerMode: 'bank'` (3 гравці, ставки через `stake`, один неправильно через `wrongAnswers`) → рядки `answer` запитання фіналу мають `wager` = ставки, `points` = частки/мінуси, сума `points` рядків + інших рядків = `participant.score`; рядки класичного раунду — `wager: null`.
  - `history.test.ts`: `history shows the stored wager and the bank mode, totals match` — `final.mode === 'bank'`, рядок переможця `{ wager: 400, points: 667 }` (не `|points|`); `standings` = `participant.score`. `old rows without a wager keep |points|` — `seedGame` зі знімком класичного фіналу й рядком без `wager` → `wager === Math.abs(points)`, `mode === 'classic'`.
  - `achievements.test.ts`: `hitFinal counts a right answer with a stake even when the bank was empty` — рядок `{ accepted: true, points: 0, wager: 300 }` → true; `{ accepted: true, points: 0, wager: 0 }` → false; старий `{ accepted: true, points: 500, wager: null }` → true; `{ accepted: false, points: -500, wager: 500 }` → false.
  - `History.test.tsx`: фінал з `mode: 'bank'` → заголовок «Ставки фіналу · спільний банк», рядок «Богдан: ставка 400, +667»; `mode: 'classic'` — «Ставки фіналу», як і було.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server apps/web/src/pages`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - Рекордер: `wager` у `AnswerRow` — для `state.plays[index].final !== undefined` ставка гравця з `play.final.wagers` (без ставки — 0), інакше `null`; у бліці — `null`. `wager` іде і в `values`, і в `set` (`...grade`).
  - `finalResult`: `wager: row.wager ?? Math.abs(row.points)`; `mode` — `quiz.rounds[roundIndex].wagerMode` (знімок уже пройшов схему, тож у старих — `'classic'`).
  - `gameTables`: вибирати `answer.wager`; рядки коригувань — `wager: null`.
  - `GameHistory.tsx`: заголовок `t(question.final.mode === 'bank' ? 'historyFinalBank' : 'historyFinal')`.
  - `i18n.ts`: `historyFinalBank: 'Ставки фіналу · спільний банк'`, `achievementHint_final_hit: 'Правильно відповісти у фіналі з ненульовою ставкою'`.
  - Тести `db/schema.test.ts` (міграції застосовуються до PGlite) мають лишитися зеленими.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server packages/shared apps/web/src
git commit -m "feat(server): the final wager is stored with each answer — bank shares in the history and my games, a right answer with a stake earns the achievement"
```

---

### Задача 5. Редактор, пояснення правил і телефон: «Тип ставок», «Ва-банк», підсумок у банку

**Files:**
- Modify: `apps/web/src/editor/RoundSettings.tsx` (блок фіналу ~117), `apps/web/src/round-summary.ts`
- Modify: `apps/web/src/screens/PlayerScreen.tsx` (`WagerForm` ~112, `FinalResult` ~168)
- Modify: `apps/server/scripts/movie-quiz.ts` (`wagerMode: 'bank'`), `apps/server/scripts/demo-quiz.test.ts`
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/editor/QuizEditor.test.tsx`, `apps/web/src/editor/draft.test.ts` (або тест `draft-storage`), `apps/web/src/round-summary.test.ts` (наявний або новий), `apps/web/src/screens/PlayerScreen.test.tsx`

**Interfaces:**
- Consumes: `WagerMode`, `RoundBrief.wagerMode` (задача 1); `me.final.allIn`, `player:wager { amount, allIn }` (задача 2); `FinalInfo.mode/split`, видимі `me.result.points` (задача 3).
- Тексти (`i18n.ts`):
  ```ts
  finalWagerMode: 'Тип ставок',
  wagerModeClassic: 'Класичні',
  wagerModeBank: 'Спільний банк',
  wagerModeClassicHint: 'Правильна відповідь додає ставку, неправильна забирає.',
  wagerModeBankHint: 'Хто помилився, віддає ставку в банк; хто відповів правильно, ділить банк пропорційно своїм ставкам.',
  summaryFinalBank: 'Хто помилився або не відповів, віддає ставку в спільний банк; хто відповів правильно, зберігає свою й ділить банк пропорційно ставкам.',
  finalAllIn: 'Ва-банк',
  finalMyWagerAllIn: 'Ваша ставка: {wager} — ва-банк!',
  finalBankRule: 'Спільний банк: помилка віддає ставку в банк, правильні відповіді його ділять.',
  finalLostToBank: 'Ставка пішла в банк',
  finalKeptStake: 'Ставку збережено — чекаємо на розподіл банку',
  finalBankShare: '+{share} з банку',
  finalNoShare: 'Ставка 0 — частки з банку немає',
  finalRefund: 'Ніхто не відповів правильно — ставки повертаються',
  ```

- [ ] **Step 1: Write the failing tests.**
  - `QuizEditor.test.tsx`: `the final round chooses the wager type, classic by default` — новий фінал: `select` «Тип ставок» зі значенням «Класичні» і підказкою `wagerModeClassicHint`; вибір «Спільний банк» → підказка банку, у збереженій вікторині `wagerMode: 'bank'`. У класичного раунду поля немає.
  - Тест чернетки: `a draft without a wager mode loads as classic` — `sessionStorage` з фіналом без `wagerMode` → `loadDraft` дає `'classic'`.
  - `round-summary`: бриф фіналу з `wagerMode: 'bank'` → `[summaryFinal, summaryFinalBank]`; `'classic'` → `[summaryFinal, summaryFinalScore]`.
  - `PlayerScreen.test.tsx`:
    - `all-in places the whole limit at once` — етап `wager`, `me.final = { wager: null, limit: 1000, allIn: false }`: кнопка «Ва-банк» поруч із полем; клік → `send('player:wager', { amount: 1000, allIn: true })`; з `{ wager: 1000, limit: 1000, allIn: true }` — «Ваша ставка: 1000 — ва-банк!». При `limit: 0` кнопки «Ва-банк» немає.
    - `the wager form explains the bank` — `final.mode: 'bank'` → текст `finalBankRule`; `'classic'` — немає.
    - `the bank result line keeps its place` — розкритий програвший (`result.points: -500`, `split: null`) → «Ставка пішла в банк»; переможець до розподілу (`points: 0`) → «Ставку збережено — чекаємо на розподіл банку»; після (`split.shares` з ним, `points: 667`) → «+667 з банку»; `split.refund` → «Ніхто не відповів правильно — ставки повертаються». В усіх чотирьох станах `.wager-note` — один і той самий елемент (рендериться завжди в банку).
  - `demo-quiz.test.ts`: `the movie quiz plays its final with a shared bank` — `movieQuiz.rounds.at(-1)` має `wagerMode: 'bank'`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web apps/server/scripts`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - `RoundSettings.tsx`: у блоці фіналу після «Перевірка відповіді» — `label.field` «Тип ставок» з `select` (`classic` / `bank`) і `p.meta` з підказкою вибраного типу.
  - `WagerForm`: рядок `.wager-row` = поле (у `label.field`, шрифт ≥ 16 px, `min-width: 0`, `flex: 1`) + `button.btn.btn-allin` «Ва-банк» (`type="button"`, ставить `setValue(String(limit))` і `send('player:wager', { amount: limit, allIn: true })`). У банку над формою — `p.meta` `finalBankRule`. «Ваша ставка» — `finalMyWagerAllIn`, якщо `final.allIn`.
  - `FinalResult`: у банку під дельтою — завжди `p.wager-note` з одним із текстів за станом (`view.final.split`, `result.grade`, `result.points`); висота фіксована (`min-height: 1.5em`), тож дельта й рахунок не зсуваються.
  - `styles.css`: `--allin` (наприклад `#ff4f81`) у `:root`; `.wager-row { display: flex; gap; }`, `.btn-allin` кольору `--allin`; на 375 px рядок не переноситься й не виходить за ширину.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src apps/server/scripts
git commit -m "feat(web): wager type in the final settings, an all-in button on the phone, bank rules and a steady bank result line"
```

---

### Задача 6. Сцена й консоль ведучого: «ВА-БАНК!», банк, що росте, і розподіл

**Files:**
- Modify: `apps/web/src/screens/StageScreen.tsx` (`FinalReveal` ~65), `apps/web/src/screens/HostScreen.tsx` (кнопка «Далі» ~80, список ставок і розкриття ~410–480)
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/StageScreen.test.tsx`, `apps/web/src/screens/HostScreen.test.tsx`

**Interfaces:**
- Consumes: `FinalEntry.allIn/share`, `FinalInfo.mode/bank/split`, `HostFinal.splitNext`, `HostFinal.wagers[].allIn` (задачі 2–3).
- Тексти (`i18n.ts`):
  ```ts
  finalAllInBadge: 'ВА-БАНК!',
  finalBank: 'Банк: {bank}',
  finalBankSplit: 'Банк {bank} розділено',
  finalStakeKept: 'ставку збережено',
  finalStakeToBank: 'у банк',
  finalShare: '+{share} з банку',
  finalSplitBank: 'Розділити банк',
  finalAllInTag: 'ва-банк',
  // finalRefund — із задачі 5
  ```

- [ ] **Step 1: Write the failing tests.**
  - `StageScreen.test.tsx`:
    - `an all-in stake is announced on the reveal` — розкритий рядок з `allIn: true` має `.allin-badge` «ВА-БАНК!»; без — бейджа немає. Класичний фінал без `.bank-meter`.
    - `the bank meter keeps its place from the first reveal to the split` — банк: `bank: 0` → `.bank-meter` «Банк: 0»; `bank: 1500` → «Банк: 1500»; `split: { bank: 1500, refund: false, … }` → «Банк 1500 розділено»; `refund: true` → «Ніхто не відповів правильно — ставки повертаються». Елемент `.bank-meter` той самий (рендериться завжди на reveal у банку).
    - `bank rows say where the stake went and the share after the split` — програвший: «у банк», `500 → 0`; переможець до розподілу: «ставку збережено», `1000 → 1000`; після: `1000 → 1642` і «+642 з банку».
  - `HostScreen.test.tsx`:
    - `the wager list marks all-in` — рядок з `allIn: true` має тег «ва-банк».
    - `the host splits the bank after the last reveal` — `final.left === 0`, `splitNext: true` → головна кнопка «Розділити банк» надсилає `host:next`; `splitNext: false` і `left === 0` → звичайне «Далі»; `left > 0` → «Наступний гравець».
    - `the host reveal list shows the bank and the shares` — «Банк: 1500», у рядку переможця після розподілу «+642 з банку».

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - `FinalReveal`: у банку над списком — `div.bank-meter[role="status"]` (фіксована висота, `--bank` золотий) з текстом за станом; у рядку — `span.allin-badge` поруч з іменем, коли `entry.allIn`; `span.tag` — як було «Ставка {wager}» плюс у банку `finalStakeToBank` / `finalStakeKept`; `span.wager-delta` — `before → after`; `span.wager-share` (порожній до розподілу, з `visibility: hidden`, щоб рядок не змінював висоти) — `finalShare`.
  - Анімації лише в `@media (prefers-reduced-motion: no-preference)`: `.allin-badge` у найновішому рядку — коротке збільшення з поворотом (~0,6 с); `.bank-meter` при зміні суми — пульс (ключ анімації за `bank`, щоб перезапускалась). Для `reduce` — без руху.
  - `HostScreen`: гілка `isFinal && phase === 'reveal' && final?.splitNext` → `{ label: 'finalSplitBank', event: 'host:next' }` перед гілкою «Наступний гравець»; тег «ва-банк» у списку ставок; у розкритті — рядок «Банк: …» / підсумок розподілу й частки біля рядків.
  - `styles.css`: `--bank` (наприклад `#f5c542`) у `:root`; `.bank-meter`, `.allin-badge` (`--allin`), `.wager-share`. Сцена 1600×900: найновіший рядок, як і зараз, видно без прокрутки (лічильник — частина того самого блоку, не зсуває його за межі).

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): stage and host for the bank final — ВА-БАНК! on the reveal, a growing bank, the split with shares or a refund"
```

---

### Задача 7. Наскрізний сценарій 7e і кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–6.
- Допоміжні функції файлу: `open`, `register`, `join`, `shot`, `click`, `field`, `exact`, `bodyText`, `expectNoSideScroll`, `snapshot`, `openRoundSettings`. З `@quiz/engine/testing` — `makeRoundsQuiz`, `classicRound`, `finalRound`, `single`, `withId`, `withPoints`.

- [ ] **Step 1: Add the scenario** `it('part 7e: all-in on the phone and ВА-БАНК! on the stage, the wager type in the editor, a bank final with a growing bank and a proportional split with the remainder, a refund when nobody is right, the history and my games match', …)` з `try/catch` і `snapshot()`. Підготовка:
  1. Ведучий `register(host, 'host', 'Олег Ведучий', 'host7e@example.com')`; Петро — `register(petro, 'player', 'Петро', 'petro7e@example.com')` (акаунт для «Мої ігри» й ачівки).
  2. Вікторина «Банк» через `host.request.post(`${base}/api/quizzes`, { data })`, `leaderboard: 'end'`: класичний раунд без бонусу за швидкість — `withId(withPoints(single, 1000), 'q1')`, `withId(withPoints(single, 500), 'q2')`, `timeLimit: 30`; **фінал 1** «Космос» (`single`, `withId(…, 'f1')`, `timeLimit: 30`, `wagerMode: 'classic'` — змінимо в редакторі); **фінал 2** «Історія» (`withId(…, 'f2')`, `timeLimit: 30`, `wagerMode: 'bank'`).
  3. **Редактор.** Ведучий відкриває «Банк» у редакторі зі списку `/quizzes`, переходить до фіналу 1, `openRoundSettings`, «Тип ставок» = «Спільний банк» → видно підказку банку; кадр `bank7e-editor-host`; «Зберегти». На ширині 375 px (`host.setViewportSize`) — `expectNoSideScroll(host, 'bank7e-editor-375')`, потім назад 1280×900.
  4. Гра: `stage` 1600×900, `olya` 375×812, `petro` 360×740, `ira` 390×844, `marko` 360×740. Приєднуються в порядку Оля, Петро, Іра, Марко.

- [ ] **Step 2: Assertions and shots** (у такому порядку):
  1. **Класичний раунд** → рахунки: Оля 1500 (обидва правильно), Петро 1000 (q1), Іра 500 (q2), Марко 1000 (q1).
  2. **Заставка фіналу 1:** сцена показує «Космос» і текст `summaryFinalBank` («…віддає ставку в спільний банк…»); кадр `bank7e-intro-stage`.
  3. **Ставки фіналу 1.** В Іри «Спільний банк: помилка віддає ставку в банк…» і кнопка «Ва-банк»; Іра тисне «Ва-банк» → «Ваша ставка: 500 — ва-банк!»; кадр `bank7e-allin-phone`; `expectNoSideScroll(olya, 'bank7e-wager-375')`. Оля вводить 1000 → «Поставити»; Петро 300; Марко 400. У ведучого в рядку Іри тег «ва-банк» (кадр `bank7e-wagers-host`). Сцена не містить «ВА-БАНК» і жодної ставки.
  4. **Відповіді:** Оля й Іра — неправильний варіант, Петро й Марко — правильний.
  5. **Розкриття (порядок Іра 500, Петро 1000, Марко 1000, Оля 1500).** Після «Показати відповідь» на сцені «Банк: 0», жодних рядків.
     - «Наступний гравець» → рядок Іри з «ВА-БАНК!», «у банк», `500→0`; «Банк: 500»; кадр `bank7e-allin-stage`. Положення `.bank-meter` (`boundingBox().y`) запам'ятати.
     - «Наступний гравець» → Петро: «ставку збережено», `1000→1000`, «Банк: 500»; у телефоні Петра «Ставку збережено — чекаємо на розподіл банку». Сцена й телефони не містять `642`, `858`, `1642`, `1858`, «з банку».
     - «Наступний гравець» → Марко так само; «Наступний гравець» → Оля: «у банк», `1500→500`, «Банк: 1500»; кадр `bank7e-bank-grown-stage`. `.bank-meter` на тому самому `y`.
     - Головна кнопка ведучого — «Розділити банк»; на сцені її ознак немає. Клік → «Банк 1500 розділено», рядок Петра `1000→1642` і «+642 з банку», Марка `1000→1858` і «+858 з банку» (залишок 1 — Маркові, найбільша ставка); у телефоні Петра «+642 з банку», рахунок 1642; кадри `bank7e-split-stage`, `bank7e-split-phone`. `.bank-meter` на тому самому `y`. `expectNoSideScroll(olya, 'bank7e-result-375')`.
  6. **Фінал 2 (повернення).** «Далі» → підсумки раунду → «Наступний раунд» → заставка «Історія» (кнопки — як у наявному `finalGame`). Ставки: Іра «Поставити 0», Оля «Ва-банк» (500), Петро 600, Марко вводить 0. Відповіді: Іра, Оля, Петро — неправильно, Марко мовчить; ведучий «Закрити запитання». Розкриття (Іра 0, Оля 500, Петро 1642, Марко 1858): «Банк: 0» → «Банк: 500» (з «ВА-БАНК!» в Олі) → «Банк: 1100» → «Банк: 1100»; «Розділити банк» → «Ніхто не відповів правильно — ставки повертаються», рядок Олі `500→500`, Петра `1642→1642`; у телефоні Олі той самий текст; кадр `bank7e-refund-stage`.
  7. **Підсумки.** «Далі» → «Переможці»: Марко 1858, Петро 1642, Оля 500, Іра 0; кадр `bank7e-final-stage`.
  8. **Історія.** Ведучий `/history` → «Банк»: таблиця з тими самими рахунками; у фіналі 1 заголовок «Ставки фіналу · спільний банк» і рядки (без пробілів) `'Оля:ставка1000,−1000'`, `'Петро:ставка300,+642'`, `'Іра:ставка500,−500'`, `'Марко:ставка400,+858'`; у фіналі 2 — `'Оля:ставка500,0'`, `'Петро:ставка600,0'`, `'Іра:ставка0,0'`, `'Марко:ставка0,0'`; кадр `bank7e-history-host`.
  9. **«Мої ігри» й ачівка.** Петро `/me`: у грі «Банк» «1642 балів»; ачівка «Влучна ставка» отримана; `expectNoSideScroll(petro, 'bank7e-my-games-phone')`.
  10. `expect(problems).toEqual([])`.

- [ ] **Step 3: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв (зокрема наявного `finalGame` — класичний фінал не змінився, лише «ВА-БАНК!» в Алли). Потім той самий запуск з `E2E_SHOTS=1` і перегляд кадрів у `apps/server/e2e/artifacts/shots`:
  - «Тип ставок» у редакторі читається, підказка не ламає форму на 375 px;
  - кнопка «Ва-банк» поруч із полем, рядок не переноситься на 375 px;
  - «ВА-БАНК!» помітний на сцені й не перекриває рядок; лічильник банку не зсуває список;
  - розподіл і повернення зрозумілі без пояснень ведучого;
  - історія й «Мої ігри» показують ті самі рахунки, що й фінальна таблиця.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts
git commit -m "test: part 7e end-to-end — all-in on the phone and the stage, the wager type in the editor, a bank final with a proportional split and the remainder, a refund, matching history and my games"
```

Після фінальної рецензії гілку злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`. У звіті власникові назвати рішення: за рівних найбільших ставок залишок отримує той, хто раніше приєднався; якщо всі правильні поставили 0 — ставки теж повертаються; ва-банк ставить одразу й іде за межею, коли ведучий змінює бали під час ставок; «ВА-БАНК!» — для кожного, хто поставив усе (кнопкою чи вручну), в обох типах ставок; у банку переможці під час розкриття «зберігають ставку», а частки з'являються на окремому кроці «Розділити банк» (якщо банк порожній — кроку немає); вилучений гравець забирає ставку з банку; «Влучна ставка» — правильна відповідь з ненульовою ставкою; демо «Кіно» грає фінал зі спільним банком; консоль ведучого, як і досі, бачить справжні підсумки фіналу до розкриття.
