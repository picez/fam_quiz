# План 27a: раунд «Ставки»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** новий тип раунду `bets`. Перед кожним запитанням іде таємна ставка: гравці бачать лише початок тексту, ставлять від мінімуму, що росте з кожним запитанням, до найбільшої ставки або своїх балів. Потім запитання відкривається повністю, а бали дає лише спільний банк, як у фіналі з режимом «банк».

**Архітектура:**
- **Дані (`shared`).** `betsRoundSchema` `{ id, type: 'bets', title, description?, shuffleOptions, check, betStart, betStep, betMax, questions }`. Позначка обрізу — необов'язкове поле бази запитання `betsCut` (скільки перших слів тексту видно під час ставок). Правила (мінімум, обріз тексту) живуть у новому `packages/shared/src/bets.ts`; їх спільно беруть схема, рушій і редактор.
- **Стан (`engine`) — повторне використання фіналу, без нових полів.** Раунд «Ставки» тримає той самий `GameState.final: FinalState` і `Play.final: FinalPlay`, що й фінал. `enterRound` створює `final` і для `bets`. Кожне запитання проходить `wager → question → locked → reveal → (leaderboard) → wager…`. Новий файл `packages/engine/src/bets.ts` містить вхід у ставки для запитання k, відкриття k-го запитання, межу ставки, «хто грає» і відмову для тих, хто пропускає. `placeWager`, `followWagerLimit`, `finalOutcome` (→ `splitBank`), `settleFinal`, `overrideFinal`, `withFinalPoints`, `finalVisiblePoints` отримують гілку або узагальнення для `bets` — не копію.
- **Зрізи.** Нове **необов'язкове** поле `bets?` у `BaseView`, `HostView` і `PlayerView.me` — лише в раунді «Ставки». Тоді зрізи інших раундів не змінюються байт у байт, а фабрики в тестах `apps/web` правити не треба. `final` (і `me.final`) у раунді «Ставки» лишаються `null`: їх і далі будує лише раунд `final`.
- **Веб.** Новий `apps/web/src/screens/BetsView.tsx` (`BetForm`, `BetResult`, `BetsStage`, `BetsResults`, `HostBetsPanel`), поля раунду в `RoundSettings.tsx`, вибір обрізу `BetsCutField` у `apps/web/src/editor/BetsCutField.tsx`.

**Технології:** TypeScript, zod 4, vitest, Fastify + Socket.IO, React 19 + Vite + Testing Library, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-09-bets-round-design.md` — уся, включно з «Мої рішення після перевірки будівником».

## Глобальні обмеження

- `GAME_STATE_VERSION` лишається **22**. Підняття не потрібне: стан не отримує жодного нового поля. Новий тип раунду живе лише в `state.quiz`, `FinalState`/`FinalPlay` мають ту саму форму, а старі знімки раундів `bets` містити не можуть. У `restore.ts` додається лише рядок у коментарі до `READABLE_STATE_VERSIONS` («27a без нової версії: раунд bets на тих самих FinalState/FinalPlay»). Якщо виконавець дійде висновку, що без підняття ніяк, — зупинитися й доповісти. Підняття — окремий крок однієї задачі, а контролер **мусить спитати власника перед пушем**.
- Нові поля схем необов'язкові там, де їх можуть не мати старі вікторини (`betsCut`). Кожна наявна вікторина й знімок проходять без змін.
- Тести: `pnpm vitest run --maxWorkers=2 <шлях>`. Типи: `pnpm typecheck`. Prettier не запускати.
- Наскрізні тести: спершу `pnpm build`, потім на передньому плані `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 27a"`. Один виклик триває менше 10 хв.
- Рядки інтерфейсу:
  - uk у `apps/web/src/i18n.ts`;
  - ключі — у новому списку `ADDED_27A` в `apps/web/src/i18n.test.ts`, доданому до умови `adds no uk keys beyond the agreed list` поряд з `ADDED_26C`;
  - переклади в 6 json-локалях (`en, pl, de, es, it, ar`), довідка — у `*.help.json` тих самих 6 мов;
  - ru ніколи; нічого про росію — ні в рядках, ні в прикладах, ні в тестах, ні в e2e.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`).
- Сімейних фото немає ні в git, ні в тестах, ні в e2e. Картинки в тестах — наявні тестові фікстури.
- Сід-скрипти й демо-вікторини (`apps/server/scripts/*-quiz.ts`) не змінюються.

## Рішення плану

- **Назви й межі (`LIMITS`):**
  - `maxBet: 100_000` — стеля `betStart`, `betStep` і `betMax`;
  - `defaultBetStart: 200`, `defaultBetStep: 100`;
  - `betStart` — ціле від 1, `betStep` — ціле від 0 (0 = мінімум не росте), `betMax` — ціле від 1 або `null` («порожньо — усі свої бали»);
  - запитань — `1…LIMITS.maxQuestions`.
- **Мінімум** запитання k (від 0): `betMinimum(round, k) = betStart + k × betStep`. **Межа** гравця: `betLimit = min(betMax ?? ∞, max(0, рахунок))`. **Може ставити** — `betLimit ≥ betMinimum`. Найбільша ставка не росте.
- **Схема раунду:** `'bets_max'`, якщо `betMax !== null` і `betMinimum(round, questions.length − 1) > betMax`. Сервер перевіряє те саме, бо це правило схеми, а не лише редактора.
- **Типи запитань** — ті самі, що допускає фінал. Це `single, multi, boolean, text, numeric, order, match, chain, wordladder, sort, slider`. Без `clues, pin, wall, survey, bluff, poll, wordcloud`. Наявні правила `*_place` у `quizSchema` (`round.type !== 'classic'`) уже відсікають їх для `bets`. Змінюється лише `wordladder_place`: `bets` допускається, як `final`. Картинка, що проявляється (`reveal`), теж лише в класиці — як зараз. Бліц-раунд і бліц-клітинок тут немає за будовою.
  - Тлумачення: спека каже «будь-який, крім бліцу й опитувань/хмари» і що «фінал уже допускає будь-який тип». Насправді фінал не допускає «Хто я?», точку, стіну, «100 до 1» і блеф. Обрано правило фіналу: воно ж визначає, що таке «правильно» (рішення спеки), а блеф і стіна мають власні фази, несумісні зі ставками. Власник може розширити список окремо.
- **Позначка обрізу** — `betsCut?: number` у базі запитання (ціле `0…LIMITS.questionText`): скільки перших **слів** тексту видно під час ставок.
  - `0` — тексту не видно (сцена показує тему раунду й номер запитання);
  - число ≥ кількості слів — видно весь текст, сховані лише варіанти й медіа.
  - Слова — непорожні шматки між пробільними символами (`/\S+/gu`). `betsTeaser(text, cut)` повертає зріз оригінального тексту від початку до кінця `cut`-го слова (пробіли й переноси всередині зберігаються, кінцевий пробіл відкидається).
  - Схема: у питанні раунду `bets` `betsCut` обов'язковий (`'bets_cut_missing'`); поза раундом `bets` (раунди, клітинки поля, випробування, запасні) його не буває (`'bets_cut_place'`).
  - Редактор чистить `betsCut` при перенесенні запитання з раунду «Ставки» й при зміні типу раунду. При зміні тексту обріз не скидає, лише обмежує показ (`betsTeaser` сам обрізає до наявних слів).
- **Що ховається під час ставок.** На етапі `wager` запитання **не відкрито**: у журналі ще немає `Play`, а `view.question` дорівнює `null`, як у фіналі. Сцена й телефони отримують лише `bets.teaser`: рядок, без варіантів, картинки, аудіо, відео, підказок, одиниць, меж повзунка й будь-яких полів типу. Ведучий отримує повне запитання в `HostBets.question`. Після відкриття всі бачать запитання повністю, як звичайне (і в повторі, історії, підсумках).
- **Цикл раунду** (`next`):
  - `intro` → `enterBetsWager` (запитання 0);
  - `wager` → `openBetsQuestion` (кнопка ведучого «Відкрити запитання», тобто `host:next`, або автоматично, коли поставили всі, хто може);
  - `question` → `locked` — як завжди (таймер / «відповіли всі, хто грає» / ведучий);
  - `locked` → `reveal`: `settleFinalWithOrder`, а потім одразу `shown = order.length, split = true`. Розкриття по одному, як у фіналі, тут немає: сцена одразу показує ставки й виграші кожного;
  - `reveal` → як у класиці: останнє запитання — `finishRound`; `leaderboard: 'each'` — `leaderboard`; інакше — `enterBetsWager` (наступне запитання);
  - `leaderboard` → `enterBetsWager`.
- **`enterBetsWager`** скидає `state.final` до `{ limits, wagers: {}, allIn: [], order: [], shown: 0, split: false }`, де `limits[id] = betLimit` для кожного гравця, і ставить `phase: 'wager'`, `startedAt/endsAt/remainingMs: null`. Таймера ставок немає.
- **`placeWager` у раунді `bets`:**
  - `wrong_phase`, `paused`, `not_found` — як зараз;
  - межа < мінімуму → `'bet_skipped'`;
  - не ціле, < мінімуму чи > межі → `'bet_range'`;
  - `allIn` ставить межу. Ставку можна змінити до відкриття.
  - Коли поставили всі присутні (`presentPlayers`), хто може ставити, і таких хоч один — `openBetsQuestion`. Порожній список тих, хто може, — чекаємо на ведучого чи автопілот.
  - У командній грі ставку робить капітан за команду зі спільних балів: `manager.wager` уже йде через `act(room, id, 'captain')`. Заміна капітана — як у фіналі.
- **`followWagerLimit`** (бали від ведучого на етапі ставок) у `bets` бере `betLimit`. Ставка понад нову межу зменшується до межі. Якщо межа впала нижче мінімуму, ставка **знімається** (гравець пропускає).
- **`openBetsQuestion`** відкриває `round.questions[k]` через `openQuestion` і пише `play.final = { wagers, allIn: [], graded: [] }`. Тут `wagers` — **лише** ті, хто поставив і досі може (межа ≥ мінімуму). Хто не поставив — пропускає.
- **Хто грає** — `betsPlaying(state)`: ключі `play.final.wagers` поточного запитання.
  - `autoLock` (гілка `playing`) і `chainDone` чекають лише присутніх з цього списку.
  - Той, хто пропускає, отримує `'bet_skipped'` у `submitAnswer`, `guessWord`, `takeHint`, `sortWord`, `ladderWord`, `ladderBack`. Перевірка одна — `betsRefusal(state, playerId)`.
- **Розрахунок:** `finalOutcome` для `bets` — `splitBank` лише по тих, хто грає. Хто пропускає, запису не має й отримує 0 за запитання. `settleFinal` пише «неправильно без відповіді» лише тим, хто грає. «Правильно» — те саме, що у фіналі (`submitFinalAnswer`: `accuracy === 1`; ланцюжок, сортування, драбина — їхні `isFinal`-гілки), тож ці `isFinal` стають `wagerRound(...)` (`final` або `bets`).
- **Без додаткових балів:** `rulesOf(bets)` дорівнює `DEFAULT_RULES`, швидкості немає, ціна не важить. Бафи: `roundOff` → `'off_bets'`. Крамниця дебафів закрита, як у фіналі (`debuffs.ts`). Ручна оцінка й апеляції — через `overrideFinal` (бали перераховує `withTotals` → `withFinalPoints`).
- **Межа «відкритого» запитання ставок.** `finalPlayOf` для `bets` повертає запитання лише на `question`, `locked` і `reveal` поточного раунду. На `wager`/`leaderboard` наступного кола — `undefined`. Тоді вилучення гравця чи бали від ведучого між запитаннями не перерозподіляють банк уже показаного запитання.
- **Не діє в раунді `bets`:** «Скасувати» (`UNDOABLE_ROUNDS` не змінюється), штраф за вихід (`AWAY_PENALTY_ROUNDS` не змінюється), досягнення `final_hit`.
  - Дуелі — як після звичайного запитання (`duelCutoff` лише про фінал).
  - Заставка входу — `'round'`, заставка запитання — `'question'` (`splash.ts`).
  - Джерело в розбивці балів — новий `'bets'` (`SCORE_SOURCES`, `answerSource`).
  - `all_rounds` (`goal: ROUND_TYPES.length`) зростає з 7 до 8; тести, що чекають 7, оновити свідомо.
- **Автопілот:**
  - `wager` уже йде `nextAt(from + AUTOPILOT_MS.wager)` (30 с) — нічого нового;
  - `autopilotQuiz` переводить `check: 'manual'` раунду `bets` на `'auto'`, як фінал;
  - `roundChanges` позначає `'manual'` для `bets`.
  - Тестовий бот (`testing/autopilot.ts`) на `wager` у `bets` ставить мінімум тим, хто може, і нічого — решті.
- **Зрізи** (`shared/views.ts`):
  ```ts
  export interface BetsRow { playerId: string; nickname: string; wager: number; grade: Grade; /** Бали за запитання (вже після банку). */ points: number; score: number }
  export interface BetsInfo {
    theme: string; index: number; total: number; minimum: number; maximum: number | null;
    /** Лише на wager: видимий початок тексту ('' — нічого); інакше null. */
    teaser: string | null;
    /** wager — сума зроблених ставок; question…reveal — сума ставок тих, хто грає. */
    bank: number;
    /** wager — хто вже поставив; question…reveal — хто грає. Без сум. */
    placed: { playerId: string; nickname: string }[];
    /** Скільки присутніх можуть ставити (лише wager; інакше 0). */
    eligible: number;
    /** Лише reveal: усі, хто грав, у порядку гравців; інакше null. */
    rows: BetsRow[] | null;
    /** Лише reveal: ніхто не відповів правильно — ставки повернуто. */
    refund: boolean;
  }
  export interface HostBets extends BetsInfo {
    /** Повне запитання k — і на wager. */
    question: Question;
    wagers: { playerId: string; nickname: string; wager: number | null; limit: number; canBet: boolean }[];
    manual: boolean;
    pending: { playerId: string; nickname: string; answer: Answer }[];
  }
  export interface PlayerBets {
    status: 'choosing' | 'placed' | 'low' | 'late' | 'playing';
    wager: number | null; minimum: number; limit: number;
    /** wager, не пауза, status choosing|placed. */
    canBet: boolean;
  }
  // BaseView: bets?: BetsInfo      — від intro до leaderboard раунду bets; поза ним ключа немає
  // HostView: bets?: HostBets
  // PlayerView.me: bets?: PlayerBets
  ```
  `status`: `low` — межа < мінімуму; `late` — запитання відкрито, а ставки не було; `playing` — запитання відкрито й гравець грає. На `intro` — `index` 0, `teaser: null`, `rows: null`.
- **Помилки** (`ErrorCode`): `'bet_skipped'`, `'bet_range'`.
- **Історія:** `history.ts` для запитання раунду `bets` дає `bets: true` поруч з `final`; `GameHistory.tsx` показує рядки `betsHistoryLine` з `row.wager` (рекордер уже пише `wager` для будь-якого `play.final`).

## Порядок збирання

- Задача 1 додає `'bets'` у `ROUND_TYPES` і `Round`. Через вичерпні `Record<RoundBrief['type'], …>` і `switch` у `apps/web` (`guide-text.ts`, `round-summary.ts`, редактор) `tsc -p apps/web` у задачах 1–4 не проходить. Для них перевірка: `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Від задачі 6 — повний `pnpm typecheck`.
- Залежності:
  - 2 спирається на 1;
  - 3 — на 2;
  - 4 — на 2 і 3;
  - 5 — на 3;
  - 6 — на 1 і 5;
  - 7 і 8 — на 3 і 5;
  - 9 іде останньою.

## На що дивитися рецензентові

1. **Спойлер на етапі ставок.** До відкриття `JSON.stringify` зрізу сцени й будь-якого гравця не містить ні схованої частини тексту, ні варіантів, ні адреси картинки чи аудіо, ні `accepted`/`answer`. Ведучий бачить усе. Тест: задача 3, `never sends the hidden part, options or media during bets`.
2. **Бали змінюються під час ставок.** Ведучий додає чи знімає бали гравцю, який уже поставив. Межа йде за рахунком, ставка понад межу зменшується, а падіння нижче мінімуму знімає ставку й дає `low`. Тест: задача 2, `host points during bets move the limit and can drop a bet`.
3. **Вилучення й відключення.** Останній, хто міг, вийшов зі зв'язку — решта поставили, і запитання відкривається. Вилучення гравця на ставках наступного запитання не змінює балів попереднього. Відсутній не тримає «поставили всі». Тест: задача 2, `away and removed players neither hold the bets nor re-split a shown question`.
4. **Перезапуск сервера.** Знімок на `wager` зі ставками й на `question` з `play.final` відновлюється з тими самими ставками, мінімумом і списком тих, хто грає, без підняття версії. Тест: задача 4, `a restored bets room keeps the wagers and who plays`.
5. **Пізні й подвійні дії.** Ставка після відкриття — `wrong_phase`. Відповідь того, хто пропускає, — `bet_skipped`, так само для ходів ланцюжка, сортування й драбини. Телефон не шле другої ставки, поки чекає першої. Тести: задача 2, `a skipper cannot answer or move in any question type`; задача 7, `a double tap places one bet`.

---

### Задача 1. Спільне: схема раунду, позначка обрізу, правила мінімуму, помилки

**Files:**
- Create: `packages/shared/src/bets.ts`, `packages/shared/src/bets.test.ts`
- Modify: `packages/shared/src/quiz.ts`:
  - `LIMITS`;
  - `betsCut` у базі запитання;
  - `betsRoundSchema`, `ROUND_TYPES` (`'bets'` після `'final'`), `roundSchema`;
  - `rulesOf`;
  - `superRefine` у `quizSchema` (`bets_max`, `bets_cut_missing`, `bets_cut_place`, `wordladder_place`).
- Modify:
  - `packages/shared/src/game.ts` (`ErrorCode`);
  - `packages/shared/src/round-brief.ts` (`bets` у `RoundBrief`);
  - `packages/shared/src/breakdown.ts` (`'bets'` у `SCORE_SOURCES`, `answerSource`);
  - `packages/shared/src/autopilot.ts` (`convert`, `roundChanges`);
  - `packages/shared/src/index.ts`.
- Test: `packages/shared/src/quiz.test.ts`, `packages/shared/src/autopilot.test.ts`, `packages/shared/src/breakdown.test.ts`, `packages/shared/src/achievements.test.ts` (якщо чекає 7 раундів)

**Interfaces:**
- Produces:
  ```ts
  // quiz.ts LIMITS
  maxBet: 100_000, defaultBetStart: 200, defaultBetStep: 100,
  // база запитання
  /** Раунд «Ставки»: скільки перших слів тексту видно під час ставок; лише в такому раунді (і там обов'язково). */
  betsCut: z.number().int().min(0).max(LIMITS.questionText).optional(),
  // quiz.ts
  /** «Ставки»: перед кожним запитанням таємна ставка від мінімуму (росте на крок) до найбільшої чи своїх балів; бали дає лише банк. */
  export const betsRoundSchema = z.object({
    id, type: z.literal('bets'), title, description: …optional(), shuffleOptions: z.boolean(), check: z.enum(['auto', 'manual']),
    betStart: z.number().int().min(1).max(LIMITS.maxBet),
    betStep: z.number().int().min(0).max(LIMITS.maxBet),
    /** null — можна ставити всі свої бали. */
    betMax: z.number().int().min(1).max(LIMITS.maxBet).nullable(),
    questions: z.array(questionSchema).min(1).max(LIMITS.maxQuestions),
  });
  export type BetsRound = z.infer<typeof betsRoundSchema>;
  // bets.ts (LIMITS лише всередині функцій: quiz.ts імпортує цей файл)
  export function betMinimum(round: Pick<BetsRound, 'betStart' | 'betStep'>, index: number): number;
  export function betsMinimums(round: Pick<BetsRound, 'betStart' | 'betStep'>, count: number): number[];
  export function betsWords(text: string): string[];
  export function betsTeaser(text: string, cut: number): string;
  /** 'bets_max' або null. */
  export function betsRoundIssue(round: Pick<BetsRound, 'betStart' | 'betStep' | 'betMax'>, count: number): 'bets_max' | null;
  // game.ts ErrorCode
  | 'bet_skipped' | 'bet_range'
  // round-brief.ts
  { ...base, type: 'bets', betStart: number, betStep: number, betMax: number | null, count: number }
  ```

- [ ] **Step 1: Write the failing tests.**
  - `bets.test.ts`:
    - `minimum grows by the step from zero` — `betMinimum({ betStart: 200, betStep: 100 }, 0) === 200`, `(…, 3) === 500`; `betsMinimums(…, 3)` → `[200, 300, 400]`; крок 0 → `[200, 200]`.
    - `teaser keeps the first words of the original text`:
      - `betsTeaser('Яке місто  є\nстолицею Австралії?', 2) === 'Яке місто'`;
      - `(…, 3) === 'Яке місто  є'`;
      - `(…, 0) === ''`;
      - `(…, 99)` — увесь текст без кінцевих пробілів;
      - `betsWords('  а  б ')` → `['а', 'б']`.
    - `last minimum over the maximum` — `betsRoundIssue({ betStart: 200, betStep: 100, betMax: 300 }, 3) === 'bets_max'`; `betMax: 400` → null; `betMax: null` → null.
  - `quiz.test.ts`, помічник `betsRound(questions, patch)` з `betStart: 200, betStep: 100, betMax: 600, check: 'auto'` і `betsCut: 2` у кожному запитанні:
    - `accepts a bets round` — три запитання (`single`, `boolean`, `numeric`) проходять;
    - `refuses a last minimum over the maximum` — `betMax: 300` з трьома запитаннями → повідомлення `bets_max`;
    - `a bets question needs a cut and only there` — без `betsCut` → `bets_cut_missing`; `betsCut` у класичному раунді, клітинці поля чи запасному → `bets_cut_place`;
    - `bets takes the final's question types` — `clues`, `pin`, `wall`, `survey`, `bluff`, `poll` дають своє `*_place` / `vote_place`; `chain`, `sort`, `wordladder` проходять;
    - `old quizzes still parse` — наявна фікстура без `bets` проходить без змін;
    - `rulesOf(bets)` дорівнює `DEFAULT_RULES`.
  - `autopilot.test.ts`: `autopilotQuiz` робить `check: 'auto'` для `bets` з `manual`, а `autopilotCheck` позначає `manual` у цьому раунді.
  - `breakdown.test.ts`: `answerSource('bets') === 'bets'`.
  - `achievements.test.ts`: якщо чекає `goal` 7 для `all_rounds` — оновити на 8 з коментарем «27a: новий тип раунду».

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared`. Очікується FAIL.

- [ ] **Step 3: Implement** усе з блоку Interfaces і правила схеми з «Рішень плану». `roundQuestions(bets)` дорівнює `round.questions`.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/shared && tsc -p packages/shared`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): 27a bets round schema — start, step, optional maximum, per-question text cut, minimum rules, bet errors"
```

---

### Задача 2. Рушій: ставки на кожне запитання, відкриття, банк, хто пропускає

**Files:**
- Create: `packages/engine/src/bets.ts`, `packages/engine/src/game.bets.test.ts`
- Modify:
  - `packages/engine/src/game.ts`: `enterRound`, `next` (гілки `intro`, `wager`, `locked`, `reveal`, `leaderboard`), `finalPlayOf`, `finalOutcome`, `settleFinal`, `autoLock`, `submitAnswer`, `overrideGrade` (`bets` → `overrideFinal`);
  - `packages/engine/src/final.ts` (`placeWager`), `packages/engine/src/adjust.ts` (`followWagerLimit`);
  - `packages/engine/src/chain.ts`, `sort.ts`, `wordladder.ts` (`isFinal` → `wagerRound`, `betsRefusal` у ходах, `chainDone`);
  - `packages/engine/src/buffs.ts` (`'off_bets'`), `debuffs.ts` (крамниця закрита), `splash.ts`, `live.ts` (`manualFinal` для `bets`);
  - `packages/engine/src/restore.ts` (лише коментар), `packages/engine/src/index.ts`;
  - `packages/engine/src/testing/fixtures.ts` (`betsRound`), `packages/engine/src/testing/autopilot.ts` (бот на `wager`).
- Test: `packages/engine/src/game.final.test.ts` (без змін очікувань), `packages/engine/src/game.buffs.test.ts`, `packages/engine/src/game.autopilot.test.ts`, `packages/engine/src/game.teams.test.ts`, `packages/engine/src/restore.test.ts`

**Interfaces:**
- Consumes: `betMinimum`, `BetsRound`, `'bet_skipped' | 'bet_range'` (задача 1); `splitBank`, `openQuestion`, `withCurrentPlay`, `presentPlayers`.
- Produces:
  ```ts
  // bets.ts (імпорти з game.ts лише під час виклику, як chain.ts)
  /** Раунд зі ставками: final або bets. */
  export function wagerRound(round: Round | undefined): round is FinalRound | BetsRound;
  /** k — номер запитання раунду bets: на wager — наступного, на question…leaderboard — поточного; поза раундом -1. */
  export function betsIndex(state: GameState): number;
  export function betsMinimumNow(state: GameState): number | null;
  export function betLimit(state: GameState, playerId: string): number;
  export function enterBetsWager(state: GameState): GameState;
  export function openBetsQuestion(state: GameState, now: number, rng: Rng): GameState;
  /** Хто грає поточне запитання bets (ключі play.final.wagers); null поза відкритим запитанням bets. */
  export function betsPlaying(state: GameState): string[] | null;
  /** 'bet_skipped' для того, хто не грає відкрите запитання bets; інакше null. */
  export function betsRefusal(state: GameState, playerId: string): ErrorCode | null;
  // testing/fixtures.ts
  export function betsRound(id: string, questions: Question[], options?: Partial<BetsRound>): BetsRound; // betStart 200, betStep 100, betMax null, check 'auto', betsCut 2 у кожного запитання без нього
  ```
- Поведінка — за «Рішеннями плану» (цикл, `placeWager`, `followWagerLimit`, розрахунок, межа відкритого запитання).

- [ ] **Step 1: Write the failing tests.** Спільне:
  - вікторина `makeRoundsQuiz([classicRound('r1', [single]), betsRound('r2', [withId(single,'b1'), withId(bool,'b2'), withId(numeric,'b3')], { betMax: 600 })])`;
  - гравці Олена, Тарас, Віра, Хосе; рахунки на вході в `r2` задаються через `adjustScore` (`source: 'host'`) до входу в раунд: 800 / 500 / 300 / 0.
  - Тести в `game.bets.test.ts`:
    - `each question starts with secret bets from a growing minimum`:
      - після `intro` → `next` фаза `wager`, `state.final.limits` = `{ p1: 600, p2: 500, p3: 300, p4: 0 }` (стеля `betMax`);
      - `betsMinimumNow` 200;
      - на запитанні 2 — 300, на 3 — 400.
    - `refuses bets outside the range and from players below the minimum`:
      - Олена 700 → `bet_range`; 199 → `bet_range`; 2.5 → `bet_range`;
      - Хосе 200 → `bet_skipped`;
      - Олена 400 → ok, потім 450 → ok (змінює);
      - стан після відмови `toBe` попередній.
    - `opens when everyone who can bet has placed` — Олена 400, Тарас 200, Віра 300: фаза `question`, `play.final.wagers` = `{ p1: 400, p2: 200, p3: 300 }` (Хосе немає).
    - `the host can open early; who did not bet skips` — Олена ставить, `next` на `wager` → `question`, у `wagers` лише Олена.
    - `splits the bank of the losers among the winners by stake`:
      - Олена 400 правильно, Тарас 200 і Віра 300 помилково → бали `+500 / −200 / −300`;
      - рахунки 1300 / 300 / 0; у Хосе запису немає.
      - Окремо: двоє правильних 400 і 200 при банку 300 → `+200` і `+100` (округлення й залишок — `splitBank`).
    - `everyone wrong gets the stakes back` — усі, хто грав, помилилися → бали 0 усім, `finalOutcome(state).refund === true`.
    - `a bettor who stays silent loses the stake` — Тарас не відповів, таймер сплив → запис `grade: 'wrong'`, `answer: null`, `−200`.
    - `the question closes when every present bettor has answered` — відповіли Олена, Тарас, Віра → `phase: 'locked'` без Хосе.
    - `reveal shows everyone at once and goes on like a classic round`:
      - `locked` → `next` → `reveal` з `final.shown === final.order.length` і `split === true`;
      - потім з `leaderboard: 'each'` → `leaderboard` → `next` → `wager` запитання 2;
      - з `'end'` → одразу `wager`;
      - після останнього → `round_end` / `finished`.
    - `a player who lost everything skips the rest of the round` — Віра з 0 на запитанні 2: `placeWager` → `bet_skipped`.
    - `host points during bets move the limit and can drop a bet`:
      - Тарас поставив 500, ведучий −100 → межа 400, ставка 400;
      - на ставках запитання 2 (мінімум 300) Тарас з рахунком 300 ставить 300; ведучий −50 → межа 250, ставки Тараса немає, `placeWager` → `bet_skipped`, `betsPlaying` після відкриття його не містить;
      - +1000 Олені → межа 600 (стеля), не більше.
    - `away and removed players neither hold the bets nor re-split a shown question`:
      - Віра поза зв'язком → Олена й Тарас поставили → `question`;
      - після `reveal` запитання 1 і входу в `wager` запитання 2 `removePlayer(Віра)` не змінює `points` записів запитання 1 в Олени й Тараса.
    - `a skipper cannot answer or move in any question type` — Хосе: `submitAnswer` → `bet_skipped`; так само в ланцюжку (`guessWord`, `takeHint`), сортуванні (`sortWord`) і драбині (`ladderWord`, `ladderBack`) у запитаннях раунду `bets` з цими типами.
    - `a bet after the question opened is refused` — `placeWager` на `question` → `wrong_phase`.
    - `manual check and the host grade recompute the bank`:
      - `check: 'manual'`: записи тимчасово «неправильно»;
      - `override(p1, 'correct')` на `locked` → бали Олени `+500`, решти −ставка;
      - `override` на `reveal` повторно перераховує.
    - `no speed, price or multiplier counts` — ціна запитання 1000, `speedBonus` недоступний: бали ті самі, що вище.
    - `nobody can bet` — усі рахунки 0: фаза `wager`, `placeWager` нікому не вдається, `next` відкриває запитання без тих, хто грає; після закриття записів немає й рахунки ті самі.
  - `game.teams.test.ts`, `the captain bets for the team from the shared score` — дві команди, ставка капітана йде на `teamId`; ставка рядового учасника через рушій неможлива (перевірка `act` — у задачі 4).
  - `game.autopilot.test.ts`, `the autopilot walks a bets round` — `autopilotQuiz` з раундом `bets`: тестовий бот ставить мінімум, `tick` через `AUTOPILOT_MS.wager` відкриває запитання, гра доходить до `finished`.
  - `game.buffs.test.ts`: баф у раунді `bets` → `'off_bets'`; крамниця дебафів → `'phase'`.
  - `restore.test.ts`: `GAME_STATE_VERSION === 22`; `keysOf<FinalState>` і `keysOf<FinalPlay>` без змін.
  - Наявний `game.final.test.ts` проходить без змін очікувань.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - `bets.ts` — за зразком `final.ts`/`chain.ts`.
  - У `game.ts` кожне `state.final !== null` у `next` розгалужується за `currentRound(state)?.type`, а фінал іде тим самим шляхом, що й зараз.
  - `finalOutcome` для `bets` будує `entries` лише з ключів `play.final.wagers` і завжди кличе `splitBank`.
  - Переглянути кожне `type === 'final'` у `packages/engine/src` (список — `grep -n "'final'"`) і для кожного вирішити: `wagerRound` чи лише фінал. Лише фінал лишаються:
    - `finalRoundOf`/`finalInfo`/`playerFinal`/`hostFinal` у `views.ts` (задача 3);
    - `duel.ts`;
    - `needsSplit`;
    - `roundSplash` (`'final'` лише для фіналу).

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/engine && tsc -p packages/shared && tsc -p packages/engine`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): 27a bets round — secret bets per question from a growing minimum, early open by the host, bank split among bettors, skippers sit out"
```

---

### Задача 3. Рушій: зрізи ставок, захист від спойлерів

**Files:**
- Modify: `packages/shared/src/views.ts` (типи з «Рішень плану», необов'язкові поля), `packages/engine/src/views.ts`
- Create: `packages/engine/src/views.bets.test.ts`

**Interfaces:**
- Consumes: `betsIndex`, `betsMinimumNow`, `betLimit`, `betsPlaying` (задача 2); `betsTeaser` (задача 1); `finalVisiblePoints`, `finalOutcome`.
- Produces: `BetsRow`, `BetsInfo`, `HostBets`, `PlayerBets`; `BaseView.bets?`, `HostView.bets?`, `PlayerView.me.bets?`. Поле є лише в раунді `bets` на `intro`, `wager`, `question`, `locked`, `reveal`, `leaderboard`; інакше ключа немає (`...(x === null ? {} : { bets: x })`).
- `rows[*].points` — `finalVisiblePoints`, тож до `reveal` чужих балів не видно. `me.result.points` у раунді `bets` теж іде через `finalVisiblePoints`, як у фіналі (`views.ts`, гілка `points: … 'final' ? visible : …` → `wagerRound`).

- [ ] **Step 1: Write the failing tests** (стан із задачі 2):
  - `the stage sees the theme, number, minimum, bank and who placed, never the sums`:
    - на `wager` після ставок Олени 400 і Тараса 200 `stageView(s).bets` → `{ index: 0, total: 3, minimum: 200, maximum: 600, bank: 600, eligible: 3 }`;
    - `placed` — Олена й Тарас без сум;
    - `JSON.stringify(stageView(s))` не містить `'"wager":400'`.
  - `never sends the hidden part, options or media during bets`:
    - запитання `single` з текстом `'Яке місто є столицею Австралії?'`, `betsCut: 2`, картинкою й аудіо з фікстур;
    - на `wager` `stageView` і `playerView(p1)`: `bets.teaser === 'Яке місто'`, `question === null`;
    - `JSON.stringify` не містить `'Австралії'`, `'Канберра'`, адреси картинки й аудіо;
    - `hostView(s).bets.question.text` — повний текст.
  - `cut at zero shows nothing and cut past the end shows the whole text` — `teaser` `''` і повний текст.
  - `after opening everyone sees the full question` — на `question` `stageView(s).question.text` повний, `bets.teaser === null`.
  - `phone status follows the rules`:
    - на `wager` Олена до ставки — `{ status: 'choosing', minimum: 200, limit: 600, canBet: true }`, після — `'placed'`;
    - Хосе — `'low'`, `canBet: false`;
    - після дострокового відкриття той, хто не поставив, — `'late'`; хто поставив — `'playing'`;
    - пауза → `canBet: false`.
  - `reveal rows carry every bettor's wager and win, and the refund flag`:
    - на `reveal` `rows` — `[{ nickname: 'Олена', wager: 400, grade: 'correct', points: 500, score: 1300 }, { 'Тарас', 200, 'wrong', −200, 300 }, { 'Віра', 300, 'wrong', −300, 0 }]`;
    - Хосе немає;
    - на `question`/`locked` `rows === null` і `me.result === null`.
  - `the host sees every wager and limit live` — `hostView(s).bets.wagers` з сумами, `limit`, `canBet` (Хосе false), `pending` для ручної перевірки.
  - `final views stay as they were and other rounds have no bets key` — у раунді `bets` `final === null` і `me.final === null`; у класиці й фіналі ключа `bets` немає.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.

- [ ] **Step 3: Implement** за блоком Interfaces. Імена — `nickname` з тієї ж функції, що й у фіналі (`actingNickname` у командах — назва команди).

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/engine packages/shared && tsc -p packages/shared && tsc -p packages/engine`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/views.ts packages/engine
git commit -m "feat(engine): 27a bets views — only the teaser before opening, bank and who placed without sums, every bettor's stake and win on reveal"
```

---

### Задача 4. Сервер: капітан, перезапуск, записи гри, історія

**Files:**
- Modify: `apps/server/src/history.ts` (`bets: boolean` у запитанні історії), `packages/shared/src/history.ts` (тип), `apps/server/src/rooms/manager.ts` (лише якщо `wager` потребує змін — очікується без змін)
- Test: `apps/server/src/rooms/manager.test.ts`, `apps/server/src/restart.test.ts`, `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts`, `apps/server/src/socket.test.ts`

**Interfaces:**
- Consumes: усе з задач 1–3. Нових подій немає: ставка — наявна `player:wager` (`wagerSchema`), відкриття — `host:next`.
- Produces: `HistoryQuestion.bets: boolean` (поруч із `final`).

- [ ] **Step 1: Write the failing tests:**
  - `socket.test.ts`, `player:wager in a bets round answers with the bet errors` — сума нижче мінімуму → `{ ok: false, error: 'bet_range' }`, гравець з 0 → `bet_skipped`.
  - `manager.test.ts`, `only the captain bets for the team in a bets round` — рядовий учасник → наявна відмова `act` (`not_captain` чи як зараз у фіналі), капітан → ok, ставка на команді.
  - `restart.test.ts`, `a restored bets room keeps the wagers and who plays`:
    - кімната збережена на `wager` зі ставками Олени й Тараса й піднята — `state.final.wagers` ті самі, `betsMinimumNow` той самий;
    - збережена на `question` — `play.final.wagers` ті самі, той, хто пропускає, і далі отримує `bet_skipped`.
  - `recorder.test.ts`, `a bets answer is recorded with its wager and bank points` — рядок `wager: 400`, `points: 500`; у того, хто пропустив, рядка немає.
  - `history.test.ts`, `bets questions are marked in the history` — `bets: true`, `final: false`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/socket.test.ts apps/server/src/rooms/manager.test.ts apps/server/src/restart.test.ts apps/server/src/recorder.test.ts apps/server/src/history.test.ts`. Очікується FAIL.

- [ ] **Step 3: Implement.** Перевірити `apps/server/scripts/logic/check.ts` та інші вичерпні `switch` за типом раунду в `apps/server` (`tsc -p apps/server` їх покаже) — додати гілку `bets`.

- [ ] **Step 4: Run** тести з кроку 2, потім `pnpm vitest run --maxWorkers=2 apps/server/src`, потім `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server packages/shared/src/history.ts
git commit -m "feat(server): 27a bets round — captain bets, restored wagers, recorded stakes, history marks"
```

---

### Задача 5. Веб: назва й пам'ятка раунду, помилки, джерело балів, історія, довідка

**Files:**
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts` (`ADDED_27A`), `apps/web/src/locales/{en,pl,de,es,it,ar}.json`
- Modify: `apps/web/src/guide-text.ts` (`ROUND_ICONS.bets: '🎲'`, `ROUND_NAMES.bets: 'roundTypeBets'`, `roundHow` для `bets`), `apps/web/src/round-summary.ts` (рядки мінімуму й найбільшої), `apps/web/src/pages/GameHistory.tsx` (рядки ставок для `bets`)
- Modify: `apps/web/src/help/help-uk.ts` (`round.bets.*`), `apps/web/src/help/help-vars.ts` (`maxBet`), `apps/web/src/help/__fixtures__/help-uk-golden.json` (нові id, свідомо), `apps/web/src/locales/{en,pl,de,es,it,ar}.help.json`
- Test: `apps/web/src/guide-text.test.ts`, `apps/web/src/round-summary.test.ts`, `apps/web/src/pages/GameHistory.test.tsx`, наявні `help-golden.test.ts`, `locales/checks.test.ts`, `source-scan.test.ts`

**Interfaces:**
- Consumes: `RoundBrief` для `bets` (задача 1), `HistoryQuestion.bets` (задача 4), `ErrorCode` (задача 1).
- Produces — uk-ключі цієї задачі (усі в `ADDED_27A`; задачі 6–8 дописують туди свої):
  ```ts
  roundTypeBets: 'Ставки',
  roundHow_bets: 'Перед кожним запитанням — таємна ставка: видно лише початок запитання. Мінімальна ставка з кожним запитанням більша. Помилка віддає ставку в банк, правильні відповіді його ділять.',
  buffWhy_off_bets: 'У раунді «Ставки» бафів немає.',
  scoreSource_bets: 'Ставки',
  err_bet_skipped: 'Це запитання ви пропускаєте.',
  err_bet_range: 'Ставка має бути від мінімальної до найбільшої.',
  summaryBetsMinimum: 'Мінімальна ставка: {start}, далі щоразу +{step}',
  summaryBetsMax: 'Найбільша ставка: {max}',
  summaryBetsAll: 'Можна ставити всі свої бали',
  betsHistoryLine: '{nickname}: ставка {wager}, {points}',
  ```
- Довідка `round.bets`:
  - `title`, `what`;
  - `how.0–3` — ставка з видимим початком; кнопка «Відкрити запитання»; хто не встиг — пропускає; розкриття одразу для всіх;
  - `points.0–2` — банк програвших ділиться пропорційно ставкам; ніхто не правий — ставки повертаються; ціна запитання й бонуси не діють;
  - `tip.0` — обрізайте текст до слова, яке ще не видає відповідь;
  - `limits.0–2`:
    - `Мінімальна ставка останнього запитання не більша за найбільшу; ставки до {maxBet}.`;
    - `Ті самі типи запитань, що й у фіналі.`;
    - `Без бафів, крамниці дебафів і «Скасувати».`
- `help-uk-golden.json` отримує рівно ці нові id з тим самим текстом. Наявні записи не змінюються.

- [ ] **Step 1: Write the failing tests:**
  - `guide-text.test.ts`: `ROUND_NAMES.bets` дає «Ставки», `roundHow` для `bets` непорожній.
  - `round-summary.test.ts`:
    - бриф `{ type: 'bets', betStart: 200, betStep: 100, betMax: 600 }` → рядки «Мінімальна ставка: 200, далі щоразу +100» і «Найбільша ставка: 600»;
    - `betMax: null` → «Можна ставити всі свої бали».
  - `GameHistory.test.tsx`: запитання з `bets: true` показує «Олена: ставка 400, +500».
  - `i18n.test.ts`: `ADDED_27A` з ключами вище.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/guide-text.test.ts apps/web/src/round-summary.test.ts apps/web/src/pages/GameHistory.test.tsx apps/web/src/i18n.test.ts apps/web/src/help apps/web/src/locales`. Очікується FAIL.

- [ ] **Step 3: Implement.** Переклади 6 мов пишуться природно, з тими самими плейсхолдерами; `ar` — за наявним стилем файлу.

- [ ] **Step 4: Run** тести з кроку 2 і `apps/web/src/source-scan.test.ts`. Очікується PASS. Повний `pnpm typecheck` може ще падати на редакторі (задача 6) — тоді лише ці помилки.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 27a bets round name, briefing lines, errors, score source, history lines and host help in uk and six locales"
```

---

### Задача 6. Веб: редактор раунду «Ставки» й позначка обрізу

**Files:**
- Create: `apps/web/src/editor/BetsCutField.tsx`, `apps/web/src/editor/BetsCutField.test.tsx`
- Modify:
  - `apps/web/src/editor/draft.ts`: `newBetsRound`, `questionTypesFor('bets')` = список фіналу, чистка (`betsCut` поза раундом прибирається), проблеми, `Place` для `bets` (як `final`, `wordladder: true`);
  - `apps/web/src/editor/draft-storage.ts` (відновлення чернетки з `bets`);
  - `apps/web/src/editor/QuizEditor.tsx` (новий тип у створенні раунду; ціни запитання не показувати, як у фіналі);
  - `apps/web/src/editor/RoundSettings.tsx` (три поля й перевірка);
  - `apps/web/src/editor/QuestionEditor.tsx` (`BetsCutField` під текстом, лише в раунді `bets`);
  - `apps/web/src/styles.css` (класи `bets-`);
  - `apps/web/src/i18n.ts`, 6 json, `ADDED_27A`.
- Test: `apps/web/src/editor/draft.test.ts`, `apps/web/src/editor/QuizEditor.test.tsx`

**Interfaces:**
- Consumes: `betsRoundSchema`, `betsMinimums`, `betsRoundIssue`, `betsWords`, `betsTeaser`, `LIMITS` (задача 1).
- Produces:
  ```ts
  // draft.ts
  export function newBetsRound(): BetsRound; // { title: '', shuffleOptions: false, check: 'auto', betStart: LIMITS.defaultBetStart, betStep: LIMITS.defaultBetStep, betMax: null, questions: [{ ...newQuestion('single'), betsCut: undefined }] }
  // BetsCutField.tsx
  /** Слова тексту кнопками: «Нічого», кожне слово («обрізати після»), «Увесь текст»; під ними — що видно під час ставок. */
  export function BetsCutField(props: { text: string; cut: number | undefined; onChange: (cut: number) => void }): JSX.Element;
  ```
- Поведінка `BetsCutField`:
  - кнопки — `role="radio"` в `role="radiogroup"` з підписом `betsCutLabel`;
  - «Нічого» дає `0`, слово i (від 1) — `i`, «Увесь текст» — `betsWords(text).length`;
  - вибрана кнопка — `aria-checked="true"`; `cut` більший за кількість слів позначає «Увесь текст»;
  - прев'ю: `betsCutPreview` з `betsTeaser`, або `betsCutPreviewNone`, якщо `''`; під ним — `betsCutHidden`;
  - на 360 px кнопки переносяться, без горизонтальної прокрутки.
- Проблеми (`TextKey`):
  - `problemBetsMax: 'Мінімальна ставка останнього запитання ({min}) більша за найбільшу ставку ({max})'`;
  - `problemBetsCut: 'Позначте, яку частину тексту видно під час ставок'`.
- uk-ключі:
  - `betStartLabel: 'Стартова мінімальна ставка'`;
  - `betStepLabel: 'На скільки мінімум росте з кожним запитанням'`;
  - `betMaxLabel: 'Найбільша ставка'`;
  - `betMaxPlaceholder: 'Порожньо — усі свої бали'`;
  - `betsMinimumsNote: 'Мінімальні ставки за запитаннями: {list}'`;
  - `betsCutLabel: 'Що видно під час ставок'`;
  - `betsCutNone: 'Нічого'`;
  - `betsCutAll: 'Увесь текст'`;
  - `betsCutPreview: 'Під час ставок видно: «{text}»'`;
  - `betsCutPreviewNone: 'Під час ставок видно лише тему раунду й номер запитання'`;
  - `betsCutHidden: 'Варіанти, картинка, аудіо й відео — після відкриття запитання.'`;
  - `betsSettingsNote: 'Ціна запитання тут не діє: бали дають лише ставки.'`

- [ ] **Step 1: Write the failing tests:**
  - `draft.test.ts`:
    - `newBetsRound()` → `toMatchObject` з блоку Interfaces;
    - `questionTypesFor('bets')` дорівнює `questionTypesFor('final')`;
    - раунд з `betMax: 300` і трьома запитаннями → `problemBetsMax` з `{min}` 400 і `{max}` 300;
    - запитання без `betsCut` → `problemBetsCut`;
    - перенесене в класику запитання втрачає `betsCut`;
    - чернетка з `bets` проходить `quizSchema` після чистки.
  - `BetsCutField.test.tsx`:
    - текст `'Яке місто є столицею Австралії?'`: клік на «місто» → `onChange(2)`, прев'ю «Під час ставок видно: «Яке місто»»;
    - «Нічого» → `0` і `betsCutPreviewNone`;
    - «Увесь текст» → `5`;
    - `cut: 9` позначає «Увесь текст».
  - `QuizEditor.test.tsx`, `creates a bets round with growing minimums and a cut per question`:
    - додати раунд «Ставки», задати 200 / 100 / 300, три запитання → видно проблему мінімуму;
    - поставити 600 → проблема зникає, `betsMinimumsNote` «200, 300, 400»;
    - обрати обріз у кожному запитанні;
    - зберегти → `{ type: 'bets', betStart: 200, betStep: 100, betMax: 600 }`, `questions[0].betsCut === 2`;
    - порожнє поле найбільшої дає `betMax: null`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/editor apps/web/src/i18n.test.ts apps/web/src/locales`. Очікується FAIL.

- [ ] **Step 3: Implement** за блоком Interfaces. Поля — `NumberField`, як у сусідніх раундах; найбільша — порожнє значення = `null`.

- [ ] **Step 4: Run** тести з кроку 2 і `pnpm typecheck`. Очікується PASS: від цієї задачі повний typecheck зелений.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 27a bets round editor — start, step and optional maximum with the last-minimum check, a word-by-word cut per question with a preview"
```

---

### Задача 7. Веб: телефон гравця

**Files:**
- Create: `apps/web/src/screens/BetsView.tsx`, `apps/web/src/screens/BetsView.test.tsx`
- Modify: `apps/web/src/screens/PlayerScreen.tsx` (етапи `wager`, `question`, `locked`, `reveal` у раунді `bets`), `apps/web/src/screens/TeamWatch.tsx` (не капітан бачить статус лише для читання), `apps/web/src/styles.css`, `apps/web/src/i18n.ts`, 6 json, `ADDED_27A`
- Test: `apps/web/src/screens/PlayerScreen.test.tsx`

**Interfaces:**
- Consumes: `BetsInfo`, `PlayerBets` (задача 3); `player:wager`; `errorText` для `bet_*` і `wager_*`.
- Produces:
  ```tsx
  /** Телефон на wager: тема, «Запитання k з n», початок тексту, поле ставки (min…limit), «Мінімум», «Поставити», власна ставка; low — пояснення без поля. */
  export function BetForm(props: { bets: BetsInfo; mine: PlayerBets; send: Send }): JSX.Element;
  /** Підсумок гравця на reveal: ставка й +бали / «у банк» / «повернуто»; late/low — «пропускаєте». */
  export function BetResult(props: { bets: BetsInfo; mine: PlayerBets; playerId: string }): JSX.Element | null;
  ```
- uk-ключі:
  - `betsQuestionOf: 'Запитання {index} з {total}'`;
  - `betsTeaserLabel: 'Початок запитання'`;
  - `betsPrompt: 'Ваша ставка від {min} до {limit}'`;
  - `betsPlace: 'Поставити'`;
  - `betsMinimumButton: 'Мінімум'`;
  - `betsMine: 'Ваша ставка: {wager}'`;
  - `betsSkipLow: 'Ваших балів менше за мінімальну ставку {min} — це запитання ви пропускаєте'`;
  - `betsSkipLate: 'Ставки закрито без вашої — це запитання ви пропускаєте'`;
  - `betsWon: 'Ставка {wager}: +{points} з банку'`;
  - `betsLost: 'Ставка {wager} пішла в банк'`;
  - `betsRefunded: 'Ніхто не відповів правильно — ставку повернуто'`;
  - `betsKeptNoBank: 'Ставку збережено'`.
- Поведінка:
  - відповідь `ok` лишає введене значення й показує `betsMine`;
  - відмова показує `errorText(error)` під полем (`role="status"`);
  - `busy`-ref не дає другого запиту, поки триває перший;
  - поле `type="number"`, `inputMode="numeric"`, `min`/`max` з `mine`, `dir="ltr"`; форма `noValidate`, щоб сума поза межами йшла на сервер і гравець бачив його причину;
  - «Мінімум» ставить `minimum` у поле (без надсилання);
  - на `question` гравець із `status` `late`/`low` бачить запитання без поля відповіді й рядок пропуску;
  - не капітан у командах — наявний `teamCaptainWager`;
  - на 320 px без горизонтальної прокрутки.

- [ ] **Step 1: Write the failing tests** (`BetsView.test.tsx`, `send` — `vi.fn`):
  - `shows the number, the teaser and the range` — «Запитання 1 з 3», «Яке місто», «Ваша ставка від 200 до 600».
  - `places a bet` — ввести 400, «Поставити» → `send('player:wager', { amount: 400 })`; після `ok` — «Ваша ставка: 400».
  - `shows the server's reason` — `{ ok: false, error: 'bet_range' }` → «Ставка має бути від мінімальної до найбільшої.».
  - `a double tap places one bet` — два сабміти до відповіді → один виклик.
  - `the minimum button fills the field` — «Мінімум» → значення поля 300 на запитанні 2.
  - `low points explain the skip without a field` — `status: 'low'` → `betsSkipLow` з 200, поля немає.
  - `teaser-less question shows only the theme and number` — `teaser: ''` → немає блоку `betsTeaserLabel`.
  - `the result shows a win, a loss and a refund` — `+500`, «Ставка 200 пішла в банк», «ставку повернуто».
  - `PlayerScreen.test.tsx`:
    - на `wager` з `me.bets` рендериться `BetForm`;
    - на `question` з `status: 'late'` поля відповіді немає, а є `betsSkipLate`;
    - на `reveal` — `BetResult`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/BetsView.test.tsx apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/i18n.test.ts apps/web/src/locales`. Очікується FAIL.

- [ ] **Step 3: Implement** за зразком `WagerForm` у `PlayerScreen.tsx` (класи `wager-*` для спільного вигляду; без «Ва-банк»).

- [ ] **Step 4: Run** тести з кроку 2, `apps/web/src/source-scan.test.ts` і `pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 27a bets on the phone — teaser, range from the growing minimum, one bet per tap, skip notes, stake and win on reveal"
```

---

### Задача 8. Веб: сцена й пульт ведучого

**Files:**
- Modify: `apps/web/src/screens/BetsView.tsx` (`BetsStage`, `BetsResults`, `HostBetsPanel`), `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/HostScreen.tsx`, `apps/web/src/styles.css`, `apps/web/src/i18n.ts`, 6 json, `ADDED_27A`
- Test: `apps/web/src/screens/BetsView.test.tsx`, `apps/web/src/screens/StageScreen.test.tsx`, `apps/web/src/screens/HostScreen.test.tsx`

**Interfaces:**
- Consumes: `BetsInfo`, `HostBets` (задача 3).
- Produces:
  ```tsx
  /** Сцена на wager: тема, «Запитання k з n», початок тексту (або нічого), мінімум і найбільша, банк, хто поставив (імена без сум). */
  export function BetsStage(props: { bets: BetsInfo }): JSX.Element;
  /** Таблиця reveal: кожен, хто грав, — ставка, ✓/✗, бали; refund — рядок «Ставки повернуто»; нижче — хто пропускав. */
  export function BetsResults(props: { bets: BetsInfo; players: { id: string; nickname: string }[] }): JSX.Element;
  /** Пульт: повне запитання з позначеним обрізом, ставки всіх із сумами й межами, «Відкрити запитання» (host:next) на wager; на locked/reveal — оцінка для manual. */
  export function HostBetsPanel(props: { bets: HostBets; send: Send }): JSX.Element;
  ```
- uk-ключі:
  - `betsBank: 'Банк: {bank}'`;
  - `betsPlacedNames: 'Поставили: {names}'`;
  - `betsNobodyYet: 'Ще ніхто не поставив'`;
  - `betsMinimumStage: 'Мінімальна ставка {min}'`;
  - `betsMaximumStage: 'Найбільша ставка {max}'`;
  - `betsSkipping: 'Пропускають: {names}'`;
  - `betsOpen: 'Відкрити запитання'`;
  - `betsHostCut: 'Гравці бачать'`;
  - `betsHostLimit: 'до {limit}'`;
  - `betsHostCannot: 'менше за мінімум'`;
  - `betsRefundStage: 'Ніхто не відповів правильно — ставки повернуто'`;
  - `betsRowStake: 'ставка {wager}'`.
- Сцена:
  - на `wager` — `BetsStage` (без `view.question`);
  - на `question`/`locked` — звичайне запитання + смуга «Банк: N · Поставили: …»;
  - на `reveal` — звичайна правильна відповідь + `BetsResults`.
  - Компонент `FinalStage`/`FinalReveal` для `bets` не вмикається (`view.final === null`).
- Пульт:
  - на `wager` — `HostBetsPanel` з кнопкою `betsOpen` замість загального «Далі» (та сама подія `host:next`);
  - кнопки оцінки — як у фіналі (`finalGradeCorrect`/`finalGradeWrong`) для `pending`.

- [ ] **Step 1: Write the failing tests:**
  - `BetsStage`:
    - банк 600, «Поставили: Олена, Тарас», «Мінімальна ставка 200», «Найбільша ставка 600»;
    - без найбільшої рядка `betsMaximumStage` немає;
    - сума ставки окремого гравця ніде не показана.
  - `BetsResults`:
    - рядки «Олена · ставка 400 · +500», «Тарас · ставка 200 · −200»;
    - «Пропускають: Хосе»;
    - `refund` → `betsRefundStage`.
  - `HostBetsPanel`:
    - видно повний текст і позначку «Гравці бачать: Яке місто»;
    - Олена `400`, Хосе «менше за мінімум»;
    - «Відкрити запитання» шле `host:next`.
  - `StageScreen.test.tsx`, `a bets round shows the teaser while betting and the stakes after reveal` — на `wager` немає тексту `Австралії`, на `reveal` видно `+500`.
  - `HostScreen.test.tsx`, `the host opens the bets question early`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/BetsView.test.tsx apps/web/src/screens/StageScreen.test.tsx apps/web/src/screens/HostScreen.test.tsx apps/web/src/i18n.test.ts apps/web/src/locales`. Очікується FAIL.

- [ ] **Step 3: Implement** за зразком `FinalStage`, `FinalReveal` (`StageScreen.tsx`) і пульта фіналу (`HostScreen.tsx`, `isFinal`). Числа — через `signed()` з `format.ts`, з `dir="ltr"`.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 apps/web` і `pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 27a bets on the stage and the host console — teaser, bank and names while betting, early open, every stake and win on reveal"
```

---

### Задача 9. Наскрізний сценарій і кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе вище. Помічники e2e: `open`, `register`, `click`, `shot`, `expectNoSideScroll`, `snapshot`, `POLL` і фабрики вікторин файла (за зразком `part 26c`).

- [ ] **Step 1: Write the scenario.** `it('part 27a: a bets round — a partly visible question, a growing minimum, the bank split, a refund, a zero-score player skipping and the host opening early', …)` з `try/catch` → `snapshot()`, як `part 26c`.
  - **Редактор.** Ведучий створює вікторину через редактор:
    - класичний раунд: «один варіант» ціною 500 і «текст» ціною 300, без бонусу швидкості;
    - раунд «Ставки» 200 / 100 / найбільша 300 з трьома запитаннями:
      - Б1 — «один варіант» `Яке місто є столицею Австралії?`: Сідней / **Канберра** / Мельбурн / Перт, обріз після «місто»;
      - Б2 — «так/ні» `Чи є кит рибою?`, правильна «ні», обріз «Нічого»;
      - Б3 — «число» `Скільки ніг у павука?`, 8, обріз «Увесь текст».
    - Видно проблему мінімуму (400 > 300); поставити 600 — проблема зникає. Кадр `bets27a-editor`.
  - **Гра.** Сцена 1600×900. Оля — 375×812, Тарас — 360×740, Іра — 360×740, Хосе — 320×640 `es-ES`.
  - **Класика:** Оля правильно на обидва (800), Тарас — на перше (500), Іра — на друге (300), Хосе — ні на що (0).
  - **Б1 (мінімум 200):**
    - на сцені й телефонах видно «Яке місто», а в `stage.content()` і `olya.content()` немає `Австралії` і `Канберра`;
    - Оля пробує 700 → відмова; ставить 400. Тарас 200, Іра 300;
    - Хосе бачить пояснення пропуску (es) без поля;
    - сцена: «Банк: 900», «Поставили: …» без сум;
    - коли поставили всі, хто може, запитання відкривається саме, і видно варіанти;
    - Оля — Канберра, Тарас і Іра — Сідней;
    - розкриття: «Оля · ставка 400 · +500», «Тарас · ставка 200 · −200», «Іра · ставка 300 · −300», «Пропускають: Хосе»;
    - рахунки 1300 / 300 / 0 / 0.
  - **Б2 (мінімум 300):**
    - на сцені немає тексту запитання, лише тема й «Запитання 2 з 3»;
    - Тарас пробує 200 → відмова, ставить 300; Оля 500;
    - Іра тепер теж пропускає (0 балів);
    - Оля «так», Тарас «ні» → Тарас `+500`, Оля `−500`; рахунки 800 / 800.
  - **Б3 (мінімум 400):**
    - видно весь текст «Скільки ніг у павука?», а поля відповіді ще немає;
    - Оля ставить 400, Тарас не ставить;
    - ведучий тисне «Відкрити запитання»; Тарас бачить «Ставки закрито без вашої…» і не має поля відповіді;
    - Оля відповідає 6 → запитання закривається (відповіли всі, хто грає);
    - розкриття: «Ніхто не відповів правильно — ставки повернуто», рахунок Олі 800.
  - **Перевірки:**
    - `expectNoSideScroll` для `BetForm` на 320 px (`es`) і 360 px;
    - пульт на ставках бачить суми й повне запитання;
    - історія гри показує «Оля: ставка 400, +500».
  - **Кадри (`E2E_SHOTS=1`):** `bets27a-stage-wager`, `bets27a-phone-wager`, `bets27a-phone-low-es-320`, `bets27a-host-wager`, `bets27a-stage-reveal`, `bets27a-phone-won`, `bets27a-stage-refund`, `bets27a-phone-late`.

- [ ] **Step 2: Run** `pnpm build`, потім на передньому плані `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 27a"` (менше 10 хв). Очікується PASS.

- [ ] **Step 3: Переглянути кадри:**
  - поле ставки й кнопки на 320/360 px не вилазять;
  - імена «Поставили: …» переносяться;
  - таблиця розкриття читається на 1600×900;
  - іспанська розкладка ціла.
  Якщо щось ламається — виправити CSS, коміт окремо.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2` (усе) і `pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts apps/web/src/styles.css
git commit -m "test(e2e): part 27a bets round — teaser only while betting, growing minimum, bank split 400/200/300, refund, zero-score skip, early open"
```
