# План 27b: раунд «Аукціон»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** новий тип раунду `auction`. Перед кожним запитанням іде відкритий торг: усі бачать тему (початок тексту до позначки обрізу), ціну, поточну найбільшу ставку та її автора й перебивають одне одного. Ставка не більша за власні бали. Торг закриває таймер (після кожної ставки відлік починається заново) або кнопка ведучого «Продано». Відповідає лише переможець: правильно — ціна + ставка, помилка — мінус ставка (або мінус ставка й ціна, як задав автор). Якщо ніхто не поставив, запитання звичайне й відповідають усі.

**Архітектура:**
- **Дані (`shared`).** `auctionRoundSchema` `{ id, type: 'auction', title, description?, shuffleOptions, check, bidMode, bidStep, loss, questions }`. Позначка обрізу — та сама `betsCut` бази запитання, що й у «Ставках»: схема вимагає її в кожному запитанні раунду `auction`, а поза `bets`/`auction` забороняє. Правила торгу (найменша наступна ставка, годинник) — у новому `packages/shared/src/auction.ts`.
- **Стан (`engine`) — знову фінал, без нових полів.** Раунд «Аукціон» тримає той самий `GameState.final: FinalState` і `Play.final: FinalPlay`.
  - Під час торгу (`phase: 'wager'`) `final.wagers` містить **лише поточну найбільшу ставку**: `{}` або `{ [лідер]: ставка }`. `final.limits` — межі гравців (`max(0, рахунок)`).
  - Годинник торгу — звичайні `startedAt` / `endsAt` / `remainingMs` стану на етапі `wager`.
  - Продаж відкриває запитання. Є переможець — `play.final = { wagers: { [переможець]: ставка }, allIn: [], graded: [] }`, і далі працює вся машинерія «Ставок»: `betsPlaying`, `betsRefusal`, `submitFinalAnswer`, `settleFinal`, `overrideFinal`, `withFinalPoints`. Розрахунок дає нова гілка `finalOutcome`. Немає переможця — `play.final` немає, запитання йде класичним шляхом для всіх.
  - Новий файл `packages/engine/src/auction.ts`: вхід у торг, ставка, продаж, лідер, найменша наступна ставка.
- **Зрізи.** Нове **необов'язкове** поле `auction?` у `BaseView`, `HostView` і `PlayerView.me` — лише в раунді «Аукціон», як `bets?` у 27a. `final`/`bets` (і `me.final`/`me.bets`) у цьому раунді — `null`/без ключа.
- **Веб.** Новий `apps/web/src/screens/AuctionView.tsx` (`BidForm`, `AuctionResult`, `AuctionStage`, `AuctionStrip`, `AuctionResults`, `HostAuctionPanel`). Поля раунду — у `RoundSettings.tsx`. `BetsCutField` перевикористовується з пропом `phase`.

**Технології:** TypeScript, zod 4, vitest, Fastify + Socket.IO, React 19 + Vite + Testing Library, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-09-auction-round-design.md` — уся. Зразок: план `docs/superpowers/plans/2026-11-09-plan-27a-bets-round.md` і мерж `a06c9f5` («Ставки»). Назви, підхід і стиль тестів — звідти.

## Глобальні обмеження

- 7 мов без ru, нові ключі в усі 7 локалей і списки в i18n.test.ts; нічого про росію.
- `GAME_STATE_VERSION` можна підвищити (зараз 22, packages/engine/src/restore.ts; READABLE_STATE_VERSIONS лишити читабельними старі версії, якщо поля лише додаються) — власник дозволив пушити без запиту.
- Юніт-тести `pnpm vitest run --maxWorkers=2`.
- Ніколи не запускати prettier.
- e2e: `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t <назва>`.
- Конкретика для цього плану:
  - **Версія стану.** План не додає жодного поля стану: торг живе в `FinalState`, продаж — у `FinalPlay`. Тож `GAME_STATE_VERSION` лишається **22**, а в коментар до `READABLE_STATE_VERSIONS` у `restore.ts` додається рядок «27b без нової версії: раунд auction на тих самих FinalState/FinalPlay; годинник торгу — startedAt/endsAt етапу wager». Якщо виконавцю все ж знадобиться нове поле, він підіймає версію до 23 і додає 22 у `READABLE_STATE_VERSIONS` (поле необов'язкове). Пушити можна без запиту.
  - Нові поля схем необов'язкові там, де їх можуть не мати старі вікторини. Кожна наявна вікторина й знімок проходять без змін.
  - Типи: `pnpm typecheck`.
  - uk-рядки — у `apps/web/src/i18n.ts`. Ключі — у новому списку `ADDED_27B` в `apps/web/src/i18n.test.ts`, доданому до умови `adds no uk keys beyond the agreed list` поряд з `ADDED_27A`. Переклади — у `apps/web/src/locales/{en,pl,de,es,it,ar}.json`, довідка — у `*.help.json` тих самих 6 мов. Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`).
  - Сімейних фото немає ні в git, ні в тестах, ні в e2e. Сід-скрипти й демо-вікторини (`apps/server/scripts/*-quiz.ts`) не змінюються.

## Рішення плану (там, де специфікація мовчить)

- **Поля раунду й межі (`LIMITS`):**
  - `bidMode: z.enum(AUCTION_BID_MODES)`, де `AUCTION_BID_MODES = ['step', 'free']`: «фіксований крок» / «будь-яка сума»;
  - `bidStep: int 1…LIMITS.maxBet` (типово `LIMITS.defaultBidStep = 50`). Поле є завжди, а діє лише в режимі `step`, щоб перемикання режиму в редакторі не губило число;
  - `loss: z.enum(AUCTION_LOSSES)`, де `AUCTION_LOSSES = ['bid', 'bid_price']`;
  - `check: 'auto' | 'manual'` — як у «Ставках» (лише для відповіді переможця);
  - запитань — `1…LIMITS.maxQuestions`. Ціна запитання (`points`) **діє**: редактор її показує.
- **Найменша наступна ставка** — `auctionNextBid(round, bid)`, де `bid` — поточна найбільша (0 — ставок немає):
  - `step` — рівно `bid + bidStep` (перша — `bidStep`); інша сума, ніж ця, — `'bid_low'`. Телефон шле точну суму, тож двоє, які натиснули одночасно, не переплатять: другий отримає `'bid_low'` («Вас уже перебили»).
  - `free` — будь-яке ціле `≥ bid + 1` (перша — від 1).
- **Годинник торгу:**
  - на вході в торг — `AUCTION_OPEN_MS = 15_000`: специфікація каже лише про 5 с після ставки, а 5 с до першої ставки замало, щоб прочитати тему;
  - після кожної прийнятої ставки — `AUCTION_BID_MS = 5_000` від `now`: `startedAt = now`, `endsAt = now + AUCTION_BID_MS`;
  - обидві сталі — у `shared/auction.ts`, бо веб малює ними смугу таймера.
  - Пауза зупиняє годинник (`remainingMs`), продовження відновлює залишок.
  - Ранній продаж, коли перебити вже ніхто не може, **не робимо**: торг закриває таймер або ведучий.
- **`placeWager` у раунді `auction`** → `placeBid`. Перевірки по черзі:
  1. `wrong_phase`, `paused`, `not_found` — як зараз;
  2. межа `wagerLimitOf ≤ 0` → `'bid_none'`;
  3. гравець — поточний лідер → `'bid_leader'` (сам себе не перебиває);
  4. не ціле або менше за `auctionNextBid` (у `step` — не рівне йому) → `'bid_low'`;
  5. більше за межу → `'bid_over'`.
  - Прийнята ставка: `final.wagers = { [id]: amount }` і годинник на 5 с.
  - `allIn` ігнорується. Подія та сама — `player:wager` (`wagerSchema`). У командах ставить капітан: `manager.wager` уже йде через `act(room, id, 'captain')`.
  - Відсутні гравці не ставлять, бо не мають зв'язку. Окремої перевірки немає.
- **Бали від ведучого під час торгу** (`followWagerLimit`, гілка `auction`): межа = `max(0, рахунок)`. Ставка лідера понад нову межу зменшується до межі, а межа 0 знімає лідера (`wagers = {}`). Годинник не чіпаємо.
- **Продаж** — `sellAuction(state, now, rng)`. Викликається з `tick` (годинник сплив) і з `next` на `wager` («Продано», тобто `host:next`):
  - є лідер — `openQuestion` + `play.final = { wagers: { [лідер]: ставка }, allIn: [], graded: [] }`;
  - лідера немає — `openQuestion` без `play.final`.
- **`tick(state, now, rng = Math.random)`** отримує необов'язковий `rng`, бо продаж відкриває запитання. `RoomManager` передає `this.rng` в обох викликах `tick` (`manager.ts` ~2081/2096; `removePlayer` ~1921 теж). `nextDeadline` (`blitz.ts`) на `wager` раунду `auction` без паузи віддає `endsAt`.
- **Хто відповідає:**
  - продано — лише переможець. `betsPlaying`/`betsRefusal` поширюються на `auction` (ключі `play.final.wagers`), тож решта отримує `'bet_skipped'` у `submitAnswer`, `guessWord`, `takeHint`, `sortWord`, `ladderWord`, `ladderBack`, а `autoLock` чекає лише переможця;
  - не продано — `betsPlaying` дає `null`, і відповідають усі, зокрема гравці з 0 балів.
- **«Правильно»** у проданому запитанні — правило фіналу (`submitFinalAnswer`: `accuracy === 1`; ланцюжок, сортування, драбина — їхні фінальні гілки).
- **Розрахунок** (`finalOutcome`, гілка `auction`) — лише переможець, `bank: 0, refund: false`:
  - правильно — `price + bid`;
  - помилка — `−bid`, або `−bid − price` при `loss: 'bid_price'`;
  - `price` — `play.question.points`; мовчання — помилка (`settleFinal` лише для переможця).
- **Непродане запитання** — бали як у класиці, але з `rulesOf(auction) = DEFAULT_RULES`: ціна × точність, без швидкості, серій і множника. `speedOn(auction) === false`. Перевірка — автоматична, навіть якщо `check: 'manual'`: ведучий і далі може змінити оцінку класичним `override`.
- **Цикл раунду** (`next`):
  - `intro` → `enterAuctionBidding(state, now)`;
  - `wager` → `sellAuction`;
  - `question` → `locked` — як завжди;
  - `locked` → `reveal`: продано — `settleFinalWithOrder` + `showAllFinal`, як у «Ставках»; не продано — класичне `{ ...state, phase: 'reveal' }`;
  - `reveal` / `leaderboard` — як «Ставки», лише з `enterAuctionBidding(state, now)`.
  - `finalPlayOf` для `auction` — як для `bets`: лише на `question`/`locked`/`reveal`.
- **Межа «ставкових» запитань.** `wagerRound(round)` стає `final | bets | auction`. Там, де сенс — «у цього запитання є ставки», перевірка йде за `play.final !== undefined`, а не за типом раунду. Новий помічник у `bets.ts`: `stakedPlay(play): play is Play & { final: FinalPlay }`. Переглянути кожен виклик `wagerRound` (`grep -n wagerRound packages/engine/src`):
  - `submitAnswer` (`game.ts`) → `stakedPlay(play) && wagerRound(round)`;
  - `overrideGrade` (`game.ts`) → `overrideFinal` лише коли `finalPlayOf(state) !== undefined`;
  - `isFinal` у `chain.ts`, `sort.ts`, `wordladder.ts` → `stakedPlay(play)`;
  - `live.ts`: `progressRow` (`finalSort`) і `answerRow` (`manualFinal`) → `stakedPlay(play)`;
  - `views.ts` `answeredCount` → `stakedPlay`; `points: wagerRound(...) ? visible : …` лишається (поза `finalPlayOf` `finalVisiblePoints` віддає `record.points`);
  - `debuffs.ts`: крамниця закрита на весь раунд — `wagerRound`.
  - Фінал і «Ставки» не мають запитань без `play.final`, тож для них поведінка не змінюється. `game.final.test.ts` і `game.bets.test.ts` проходять без змін очікувань.
- **Без бафів і доповнень:**
  - `roundOff` → `'off_auction'` (`BuffWhy`), крамниця дебафів закрита;
  - `UNDOABLE_ROUNDS` і `AWAY_PENALTY_ROUNDS` не змінюються, `final_hit` не діє;
  - дуелі — як після звичайного запитання;
  - заставка входу — `'round'`, заставка запитання — `'question'` (`splash.ts`);
  - джерело балів — новий `'auction'` (`SCORE_SOURCES`, `answerSource`) для всіх запитань раунду;
  - `all_rounds` — goal 9.
- **Автопілот:**
  - `moveOf` на `wager` раунду `auction` віддає `null`: торг закриває годинник рушія через `tick`/`nextDeadline`, «Продано» не потрібне;
  - `autopilotQuiz` переводить `check: 'manual'` на `'auto'`, а `roundChanges` позначає `'manual'` — як для `bets`;
  - тестовий бот (`testing/autopilot.ts`) на `wager` в `auction` ставить `auctionNextBid` за першого гравця з достатньою межею, який не є лідером, один раз за запитання.
- **Помилки** (`ErrorCode`): `'bid_none'`, `'bid_leader'`, `'bid_low'`, `'bid_over'`. Ті, хто не відповідає, — наявний `'bet_skipped'`.
- **Історія.** `HistoryQuestion.auction: boolean`. Для проданого запитання `final = finalResult({ wagerMode: 'classic' }, given, standings)` з одним рядком переможця. Для непроданого `final: null`: звичайні відповіді. Прапорець `final` для цікавинок — лише в проданого.
- **Зрізи** (`shared/views.ts`):
  ```ts
  export interface AuctionInfo {
    theme: string; index: number; total: number;
    /** Ціна запитання k. */
    price: number;
    mode: AuctionBidMode; step: number; loss: AuctionLoss;
    /** Лише на wager: видимий початок тексту ('' — нічого); інакше null. */
    teaser: string | null;
    /** wager — поточна найбільша ставка (0 — немає); question…reveal — за скільки продано (0 — не продано). */
    bid: number;
    /** wager — лідер; question…reveal — переможець; null — немає. Ім'я — actingNickname (у командах — назва команди). */
    leader: { playerId: string; nickname: string } | null;
    /** Лише wager: найменша допустима наступна ставка (auctionNextBid); інакше 0. */
    next: number;
    /** Годинник торгу (лише wager): як у інших таймерах; total — AUCTION_BID_MS, якщо є ставка, інакше AUCTION_OPEN_MS. */
    endsAt: number | null; remainingMs: number | null; totalMs: number;
    /** question…reveal: торг закрито без ставок — відповідають усі. */
    open: boolean;
    /** Лише reveal проданого: оцінка й бали переможця; інакше null. */
    result: { grade: Grade; points: number } | null;
  }
  export interface HostAuction extends AuctionInfo {
    /** Повне запитання k — і на wager. */
    question: Question;
    limits: { playerId: string; nickname: string; limit: number; canBid: boolean }[];
    manual: boolean;
    pending: { playerId: string; nickname: string; answer: Answer }[];
  }
  export interface PlayerAuction {
    /** wager: bidding | leading | short (межа < next, але > 0) | none (0 балів); question…reveal: winner | watching | open. */
    status: 'bidding' | 'leading' | 'short' | 'none' | 'winner' | 'watching' | 'open';
    limit: number; next: number;
    /** wager, не пауза, status bidding. */
    canBid: boolean;
  }
  // BaseView: auction?: AuctionInfo — від intro до leaderboard раунду auction; поза ним ключа немає
  // HostView: auction?: HostAuction; PlayerView.me: auction?: PlayerAuction
  ```
  На `intro` і `leaderboard`: `index` — наступного запитання, `teaser: null`, `leader: null`, `bid: 0`.

## Порядок збирання

- Задача 1 додає `'auction'` у `ROUND_TYPES` і `Round`. Через вичерпні `Record`/`switch` у `apps/web` `tsc -p apps/web` у задачах 1–4 не проходить. Для них перевірка — `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Від задачі 5 — повний `pnpm typecheck`.
- Залежності:
  - 2 — від 1;
  - 3 — від 2;
  - 4 — від 2 і 3;
  - 5 — від 1, 3 і 4;
  - 6 — від 3 і 5;
  - 7 — остання.

## Фокус рев'ю

1. **Спойлер на торгу.** До продажу `JSON.stringify` зрізу сцени й будь-якого гравця не містить схованої частини тексту, варіантів, адрес медіа, `accepted`/`answer`. Ведучий бачить усе. Тест: задача 3, `never sends the hidden part, options or media while bidding`.
2. **Годинник торгу.** Ставка перезапускає 5 с від `now`, відмова годинник не чіпає. Пауза й продовження зберігають залишок. Перезапуск сервера на торгу відновлює лідера, ставку й залишок, а годинник, що сплив до збереження, продає (`suspend` → `tick`). Тести: задача 2, `every bid restarts the five-second clock` і `pause keeps the bidding clock`; задача 4, `a restored auction room keeps the leader, the bid and the clock`.
3. **Гонка ставок.** У режимі `step` дві однакові ставки — перша приймається, друга `'bid_low'`. Лідер не перебиває сам себе. Ставка понад бали — `'bid_over'`, з 0 балів — `'bid_none'`. Стан після відмови `toBe` попередній. Тест: задача 2, `refuses bids that are low, over the score, from the leader or from zero`.
4. **Межа «ставкового» запитання.** Непродане запитання раунду `auction` іде класичним шляхом: відповідають усі, бали — ціна × точність, `override` — класичний, у ланцюжку/сортуванні/драбині — звичайні бали, а не фінальні. Продане — лише переможець, бали за `loss`. Фінал і «Ставки» без змін. Тести: задача 2, `an unsold question is a normal question for everyone` і `final and bets behave as before`.
5. **Бали ведучого й вилучення під час торгу.** Ставка лідера йде за межею вниз; межа 0 знімає лідера. Вилучення лідера на торгу обнуляє торг. Вилучення переможця на запитанні не ламає закриття. Тест: задача 2, `host points and removal during bidding`.

---

### Задача 1. Спільне: схема раунду, режими торгу, найменша ставка, помилки

**Files:**
- Create: `packages/shared/src/auction.ts`, `packages/shared/src/auction.test.ts`
- Modify:
  - `packages/shared/src/quiz.ts`:
    - `LIMITS.defaultBidStep`;
    - `AUCTION_BID_MODES`, `AUCTION_LOSSES`;
    - `auctionRoundSchema`, `ROUND_TYPES` (`'auction'` після `'bets'`), `roundSchema`;
    - `rulesOf`;
    - `superRefine` у `quizSchema`: `bets_cut_missing` і `bets_cut_place` з урахуванням `auction`, `wordladder_place` допускає `auction`;
    - коментар `betsCut` — «раунди «Ставки» й «Аукціон»».
  - `packages/shared/src/game.ts`: `ErrorCode` + `'bid_none' | 'bid_leader' | 'bid_low' | 'bid_over'`; `BuffWhy` + `'off_auction'`.
  - `packages/shared/src/round-brief.ts`: `auction: { mode, step, loss, count } | null`.
  - `packages/shared/src/breakdown.ts`: `'auction'` у `SCORE_SOURCES`, `answerSource`.
  - `packages/shared/src/autopilot.ts`: `convert`, `roundChanges`.
  - `packages/shared/src/index.ts`.
- Test: `packages/shared/src/quiz.test.ts`, `autopilot.test.ts`, `breakdown.test.ts`, `round-brief.test.ts` (якщо є), `achievements.test.ts` (`all_rounds: 9`, коментар «27b: новий тип раунду»)

**Interfaces:**
- Produces:
  ```ts
  // quiz.ts
  defaultBidStep: 50, // у LIMITS
  export const AUCTION_BID_MODES = ['step', 'free'] as const; export type AuctionBidMode = (typeof AUCTION_BID_MODES)[number];
  export const AUCTION_LOSSES = ['bid', 'bid_price'] as const; export type AuctionLoss = (typeof AUCTION_LOSSES)[number];
  /** «Аукціон»: відкритий торг перед кожним запитанням; відповідає лише переможець; без ставок — запитання для всіх. */
  export const auctionRoundSchema = z.object({
    id, type: z.literal('auction'), title, description: …optional(), shuffleOptions: z.boolean(), check: z.enum(['auto', 'manual']),
    bidMode: z.enum(AUCTION_BID_MODES),
    /** Крок ставки; діє лише в режимі step. */
    bidStep: z.number().int().min(1).max(LIMITS.maxBet),
    loss: z.enum(AUCTION_LOSSES),
    questions: z.array(questionSchema).min(1).max(LIMITS.maxQuestions),
  });
  export type AuctionRound = z.infer<typeof auctionRoundSchema>;
  // auction.ts (LIMITS лише всередині функцій: quiz.ts імпортує цей файл)
  export const AUCTION_OPEN_MS = 15_000;
  export const AUCTION_BID_MS = 5_000;
  /** Найменша допустима наступна ставка: step — bid + bidStep, free — bid + 1. */
  export function auctionNextBid(round: Pick<AuctionRound, 'bidMode' | 'bidStep'>, bid: number): number;
  /** Чи прийнятна сума за режимом (без межі балів): step — рівно next, free — ціле ≥ next. */
  export function auctionBidFits(round: Pick<AuctionRound, 'bidMode' | 'bidStep'>, bid: number, amount: number): boolean;
  /** Бали переможця: правильно — price + bid; помилка — −bid або −bid − price. */
  export function auctionPoints(round: Pick<AuctionRound, 'loss'>, price: number, bid: number, correct: boolean): number;
  // round-brief.ts
  auction: { mode: AuctionBidMode; step: number; loss: AuctionLoss; count: number } | null
  ```

- [ ] **Step 1: Write the failing tests.**
  - `auction.test.ts`:
    - `the next bid follows the mode` — `auctionNextBid({ bidMode: 'step', bidStep: 50 }, 0) === 50`, `(…, 150) === 200`; `free`: `(…, 0) === 1`, `(…, 150) === 151`;
    - `step takes only the exact next bid, free takes any higher whole number`:
      - `auctionBidFits(step50, 100, 150) === true`, `(…, 100, 200) === false`, `(…, 100, 100) === false`;
      - `free`: `(…, 100, 101)` і `(…, 100, 5000)` — true; `(…, 100, 100)` і `(…, 100, 150.5)` — false.
    - `points by the loss mode`:
      - `auctionPoints({ loss: 'bid' }, 200, 400, true) === 600`, `(…, false) === -400`;
      - `{ loss: 'bid_price' }`: `false` → `-600`, `true` → `600`.
  - `quiz.test.ts`, помічник `auctionRound(questions, patch)` з `bidMode: 'step', bidStep: 50, loss: 'bid', check: 'auto'` і `betsCut: 2` у кожному запитанні:
    - `accepts an auction round` — `single`, `boolean`, `numeric` проходять; обидва режими й обидва `loss`;
    - `an auction question needs a cut` — без `betsCut` → `bets_cut_missing`; `betsCut` у класиці лишається `bets_cut_place`;
    - `auction takes the final's question types` — `clues`, `pin`, `wall`, `survey`, `bluff`, `poll`, `wordcloud` дають своє `*_place` / `vote_place`; `chain`, `sort`, `wordladder` проходять;
    - `refuses a zero or fractional step` — `bidStep: 0` і `2.5` не проходять;
    - `old quizzes still parse` — наявні фікстури без `auction`;
    - `rulesOf(auction)` дорівнює `DEFAULT_RULES`.
  - `autopilot.test.ts`: `autopilotQuiz` робить `check: 'auto'` для `auction` з `manual`, `autopilotCheck` позначає `manual`.
  - `breakdown.test.ts`: `answerSource('auction') === 'auction'`.
  - `round-brief`: `roundBrief(auction)` → `auction: { mode: 'step', step: 50, loss: 'bid', count: 3 }`; для інших раундів `auction: null`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared`. Очікується FAIL.

- [ ] **Step 3: Implement** блок Interfaces і правила схеми з «Рішень плану». `roundQuestions(auction)` дорівнює `round.questions`. Вичерпні `Record`/`switch` за типом раунду в `packages/shared` покаже `tsc -p packages/shared`.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/shared && tsc -p packages/shared`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): 27b auction round schema — step or free bids, loss of the bid or bid and price, per-question cut, next-bid rules, bid errors"
```

---

### Задача 2. Рушій: торг, годинник, продаж, відповідь переможця, розрахунок

**Files:**
- Create: `packages/engine/src/auction.ts`, `packages/engine/src/game.auction.test.ts`
- Modify:
  - `packages/engine/src/game.ts`:
    - `enterRound` (`final` і для `auction`);
    - `next`: гілки `intro`, `wager`, `locked`, `reveal`, `leaderboard`;
    - `tick` (новий `rng`, гілка `wager`), `pause`, `resumeClock` (годинник `wager`);
    - `finalPlayOf`, `finalOutcome`, `settleFinal` (лише переможець);
    - `submitAnswer`, `submitFinalAnswer` (тип раунду), `overrideGrade`, `autoLock`, `speedOn` (без змін, перевірити);
  - `packages/engine/src/bets.ts`:
    - `wagerRound` + `auction`;
    - `stakedPlay`;
    - `betsIndex`, `betsPlaying` і `betsRefusal` для `bets | auction` через новий `perQuestionStakes(round)`;
    - `betsMinimumNow` і `betLimit` лишаються лише для `bets`;
  - `packages/engine/src/final.ts` (`placeWager` → `placeBid`), `packages/engine/src/adjust.ts` (`followWagerLimit`, гілка `auction`);
  - `packages/engine/src/chain.ts`, `sort.ts`, `wordladder.ts`, `live.ts` (`isFinal`/`finalSort`/`manualFinal` → `stakedPlay`; `live.ts` ~382 — хто очікується в `auction`);
  - `packages/engine/src/blitz.ts` (`nextDeadline`);
  - `packages/engine/src/buffs.ts` (`'off_auction'`), `debuffs.ts`, `splash.ts`, `autopilot.ts` (`moveOf` на `wager`);
  - `packages/engine/src/restore.ts` (лише коментар), `packages/engine/src/index.ts`;
  - `packages/engine/src/testing/fixtures.ts` (`auctionRound`), `packages/engine/src/testing/autopilot.ts` (бот торгу).
- Test: `packages/engine/src/game.final.test.ts` і `game.bets.test.ts` (без змін очікувань), `game.buffs.test.ts`, `game.autopilot.test.ts`, `game.teams.test.ts`, `restore.test.ts`

**Interfaces:**
- Consumes: `auctionNextBid`, `auctionBidFits`, `auctionPoints`, `AUCTION_OPEN_MS`, `AUCTION_BID_MS`, `AuctionRound`, нові `ErrorCode` (задача 1); `openQuestion`, `withCurrentPlay`, `wagerLimitOf`, `presentPlayers`.
- Produces:
  ```ts
  // auction.ts (імпорти з game.ts лише під час виклику, як bets.ts)
  export function auctionRoundOf(state: GameState): AuctionRound | null;
  /** Лідер торгу (лише wager): єдиний запис final.wagers; null — ставок немає. */
  export function auctionLeader(state: GameState): { playerId: string; bid: number } | null;
  /** Найменша наступна ставка зараз (лише wager раунду auction); інакше null. */
  export function auctionNextNow(state: GameState): number | null;
  /** Торг запитання k: межі max(0, рахунок), ставок немає, годинник AUCTION_OPEN_MS від now. */
  export function enterAuctionBidding(state: GameState, now: number): GameState;
  /** Ставка; етап, пауза й гравець уже перевірені в placeWager. */
  export function placeBid(state: GameState, playerId: string, amount: number, now: number): Result;
  /** Закриває торг і відкриває запитання k: з лідером — play.final { wagers: { лідер: ставка } }, без — без play.final. */
  export function sellAuction(state: GameState, now: number, rng: Rng): GameState;
  // bets.ts
  export function stakedPlay(play: Play | undefined): play is Play & { final: FinalPlay };
  // game.ts
  export function tick(state: GameState, now: number, rng: Rng = Math.random): GameState;
  // testing/fixtures.ts
  export function auctionRound(id: string, questions: Question[], options?: Partial<Omit<AuctionRound, 'id' | 'type' | 'questions'>>): AuctionRound;
  // bidMode 'step', bidStep 100, loss 'bid', check 'auto', betsCut 2 у кожного запитання без нього
  ```
- Поведінка — за «Рішеннями плану».

- [ ] **Step 1: Write the failing tests.** Спільне:
  - вікторина `makeRoundsQuiz([classicRound('r1', [single]), auctionRound('r2', [withId(single,'a1'), withId(bool,'a2'), withId(numeric,'a3')])])`;
  - ціни: a1 200, a2 300, a3 200;
  - гравці Олена, Тарас, Віра, Хосе; рахунки на вході в `r2` — через `adjustScore` (`source: 'host'`): 800 / 500 / 300 / 0;
  - час — числа `t0 = 1_000_000`, `t0 + …`.
  - Тести в `game.auction.test.ts`:
    - `bidding starts with the theme clock and no leader`:
      - `intro` → `next(s, t0)` → `phase: 'wager'`, `final.limits` = `{ p1: 800, p2: 500, p3: 300, p4: 0 }`, `final.wagers` = `{}`;
      - `endsAt === t0 + AUCTION_OPEN_MS`;
      - `auctionNextNow` 100.
    - `bids outbid each other in steps`:
      - Тарас 100 → ok, лідер Тарас;
      - Олена 200 → ok, лідер Олена, `final.wagers` = `{ p1: 200 }` (один запис);
      - Тарас 300 → ok.
    - `refuses bids that are low, over the score, from the leader or from zero`:
      - після Тараса 300 Олена 300 → `bid_low`, Олена 500 у `step` → `bid_low`;
      - Тарас 400 → `bid_leader`;
      - Віра 400 → `bid_over`;
      - Хосе 400 → `bid_none`;
      - `free`-раунд: 300.5 → `bid_low`;
      - стан після кожної відмови `toBe` попередній.
    - `two equal step bids — the second is too low` — Олена й Віра обидві шлють 100 на порожньому торгу: Олена ok, Віра `bid_low`.
    - `every bid restarts the five-second clock`:
      - Тарас 100 на `t0 + 3000` → `endsAt === t0 + 8000`;
      - `tick(s, t0 + 7999)` — ще `wager`;
      - Олена 200 на `t0 + 7000` → `endsAt === t0 + 12000`;
      - `tick(s, t0 + 11999)` — `wager`; `tick(s, t0 + 12000)` — `question`, `play.final.wagers` = `{ p1: 200 }`.
    - `nobody bids — the theme clock sells to nobody` — `tick(s, t0 + AUCTION_OPEN_MS)` → `question`, `play.final === undefined`.
    - `the host sells early` — Тарас 100, `next` на `wager` → `question`, переможець Тарас. Без ставок `next` → непродане запитання.
    - `pause keeps the bidding clock`:
      - Тарас 100 на `t0` (кінець `t0 + 5000`), `pause` на `t0 + 2000` → `remainingMs: 3000`, `endsAt: null`;
      - ставка на паузі → `paused`;
      - `resume` на `t0 + 60000` → `endsAt === t0 + 63000`;
      - `tick` до того торгу не закриває.
    - `only the winner answers`:
      - продано Олені за 200;
      - `submitAnswer` Тараса → `bet_skipped`;
      - відповідь Олени закриває запитання (`locked`) без інших;
      - так само `guessWord`/`takeHint`/`sortWord`/`ladderWord`/`ladderBack` для не-переможця в запитаннях цих типів.
    - `the winner gains price and bid when right`:
      - a1 (200), Олена купила за 400 і відповіла правильно → `+600`, рахунок 1400;
      - запис лише в Олени, інші без записів і з тими самими рахунками.
    - `the winner loses the bid, or the bid and the price` — a2 (300), Тарас купив за 100 і помилився: `loss: 'bid'` → `−100`; той самий сценарій з `loss: 'bid_price'` → `−400`.
    - `a silent winner loses as if wrong` — таймер запитання сплив без відповіді → `grade: 'wrong'`, `answer: null`, бали за `loss`.
    - `partial is not right for the winner` — `multi` з частковою відповіддю → `wrong`, `−bid`.
    - `an unsold question is a normal question for everyone`:
      - a3 (200) не продано;
      - відповідають усі, включно з Хосе (0 балів): правильно → `+200`, `numeric` неточно → бали за точністю, як у класиці без швидкості;
      - `override(p4, 'wrong')` — класичний шлях (не `overrideFinal`);
      - у ланцюжку й сортуванні непроданого запитання — звичайні бали класики.
    - `reveal shows the winner at once and goes on like bets`:
      - `locked` → `next` → `reveal` з `final.shown === final.order.length`;
      - далі з `leaderboard: 'each'` → `leaderboard` → `next` → `wager` наступного (годинник від `now`);
      - з `'end'` → одразу `wager`;
      - після останнього → `round_end` / `finished`.
    - `host points and removal during bidding`:
      - Олена лідирує зі 600, ведучий −300 → межа 500, ставка лідера 500;
      - ведучий −500 → межа 0, лідера немає, `auctionNextNow` 100, годинник той самий;
      - `removePlayer` лідера на торгу → `final.wagers` = `{}`;
      - вилучення переможця на `question` — запитання закриває таймер, рахунки інших незмінні.
    - `manual check and the host grade` — `check: 'manual'`: запис переможця тимчасово «неправильно», `override(winner, 'correct')` на `locked` → `price + bid`; повтор на `reveal` перераховує.
    - `final and bets behave as before` — наявні `game.final.test.ts` і `game.bets.test.ts` без змін очікувань (запускаються в Step 4).
  - `game.teams.test.ts`, `the captain bids for the team from the shared score` — ставка йде на `teamId`, межа — спільний рахунок.
  - `game.autopilot.test.ts`, `the autopilot walks an auction round`:
    - бот ставить, `tick` на `endsAt` продає, гра доходить до `finished`;
    - `moveOf` на `wager` раунду `auction` — `null`.
  - `game.buffs.test.ts`: баф у раунді `auction` → `'off_auction'`; крамниця дебафів → `'phase'`.
  - `restore.test.ts`: `GAME_STATE_VERSION === 22`, `keysOf<FinalState>` і `keysOf<FinalPlay>` без змін; `nextDeadline` на торгу — `endsAt`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - `auction.ts` — за зразком `bets.ts`.
  - У `next` кожна гілка `bets` дістає сестру `auction` з тими самими переходами; фінал іде як і раніше.
  - `tick`: перед `if (state.phase !== 'question' …)` вставити гілку `wager`: раунд `auction`, не пауза, `endsAt !== null && now >= endsAt` → `sellAuction(state, now, rng)`.
  - Переглянути всі `wagerRound` і `type === 'bets'` у `packages/engine/src` (`grep -n "wagerRound\|'bets'"`) за списком «Межа ставкових запитань».

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/engine && tsc -p packages/shared && tsc -p packages/engine`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): 27b auction round — open bidding with a resetting clock, early sale by the host, only the winner answers, price plus bid or loss, unsold questions for everyone"
```

---

### Задача 3. Рушій: зрізи аукціону, захист від спойлерів

**Files:**
- Modify: `packages/shared/src/views.ts` (типи з «Рішень плану», необов'язкові поля), `packages/engine/src/views.ts`
- Create: `packages/engine/src/views.auction.test.ts`

**Interfaces:**
- Consumes: `auctionRoundOf`, `auctionLeader`, `auctionNextNow`, `betsIndex`, `betsPlaying`, `wagerLimitOf` (задача 2); `betsTeaser`, `AUCTION_*` (задача 1); `finalVisiblePoints`, `actingNickname`.
- Produces:
  - `AuctionInfo`, `HostAuction`, `PlayerAuction`;
  - `BaseView.auction?`, `HostView.auction?`, `PlayerView.me.auction?` — лише в раунді `auction` на `intro`, `wager`, `question`, `locked`, `reveal`, `leaderboard` (`...optional('auction', …)`, як `bets`).
  - `answering`/«відповіли N з M» у проданому — лише переможець (через `betsPlaying`, як у «Ставках»).

- [ ] **Step 1: Write the failing tests** (стан із задачі 2):
  - `the stage sees the theme, price, top bid and its author`:
    - на `wager` після Тараса 100 і Олени 200 `stageView(s).auction` → `{ index: 0, total: 3, price: 200, mode: 'step', step: 100, bid: 200, leader: { nickname: 'Олена' }, next: 300, totalMs: AUCTION_BID_MS }`;
    - `endsAt` — як у стані.
  - `never sends the hidden part, options or media while bidding`:
    - `single` `'Яке місто є столицею Австралії?'`, `betsCut: 2`, з картинкою й аудіо з фікстур;
    - `stageView` і `playerView(p1)`: `teaser === 'Яке місто'`, `question === null`;
    - `JSON.stringify` не містить `'Австралії'`, `'Канберра'`, адрес медіа;
    - `hostView(s).auction.question.text` — повний.
  - `after the sale everyone sees the full question` — `teaser === null`, `question.text` повний, `leader` — переможець, `bid` — ціна покупки, `open: false`; непродане — `open: true`, `leader: null`.
  - `phone status follows the rules`:
    - на торгу Тарас до ставки — `{ status: 'bidding', limit: 500, next: 100, canBid: true }`;
    - після своєї ставки — `'leading'`, `canBid: false`;
    - Віра при `next` 400 — `'short'`; Хосе — `'none'`;
    - пауза → `canBid: false`;
    - після продажу: переможець — `'winner'`, решта — `'watching'`; непродане — `'open'` у всіх.
  - `reveal carries the winner's grade and points only` — на `reveal` проданого `result` = `{ grade: 'correct', points: 600 }`; на `question`/`locked` — `null`, `me.result === null` в усіх, крім переможця після reveal.
  - `the host sees every limit live` — `hostView(s).auction.limits` з межами й `canBid`, `pending` для `manual`.
  - `other views stay as they were` — у раунді `auction` `final === null`, ключа `bets` немає; у класиці, фіналі й «Ставках» ключа `auction` немає.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.

- [ ] **Step 3: Implement** за блоком Interfaces, за зразком `betsRoundOf`/`betsInfo`/`hostBets`/`playerBets` у `views.ts`.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/engine packages/shared && tsc -p packages/shared && tsc -p packages/engine`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/views.ts packages/engine
git commit -m "feat(engine): 27b auction views — only the teaser while bidding, top bid and its author with the clock, the winner's result on reveal"
```

---

### Задача 4. Сервер: годинник у кімнаті, капітан, перезапуск, записи, історія

**Files:**
- Modify:
  - `apps/server/src/rooms/manager.ts`: `tick(…, this.rng)` в усіх викликах;
  - `apps/server/src/history.ts` (`auction`, `final` для проданого);
  - `packages/shared/src/history.ts` (`HistoryQuestion.auction: boolean`);
  - `apps/server/src/quiz-remove.ts` (`MIN_QUESTIONS.auction: 1`);
  - `apps/server/scripts/logic/check.ts` та інші вичерпні `switch` (покаже `tsc -p apps/server`).
- Test: `apps/server/src/rooms/manager.test.ts`, `apps/server/src/restart.test.ts`, `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts`, `apps/server/src/socket.test.ts`

**Interfaces:**
- Consumes: усе з задач 1–3. Нових подій немає: ставка — `player:wager`, «Продано» — `host:next`.
- Produces: `HistoryQuestion.auction: boolean`.

- [ ] **Step 1: Write the failing tests:**
  - `socket.test.ts`, `player:wager in an auction answers with the bid errors` — сума нижче наступної → `{ ok: false, error: 'bid_low' }`; гравець з 0 → `bid_none`; понад бали → `bid_over`.
  - `manager.test.ts`:
    - `the room sells the auction when the clock runs out` — фейковий планувальник: після ставки кімната ставить дедлайн на `endsAt` і на ньому відкриває запитання для переможця;
    - `only the captain bids for the team in an auction` — рядовий → наявна відмова `act`, капітан → ok.
  - `restart.test.ts`, `a restored auction room keeps the leader, the bid and the clock`:
    - збережено на торгу з лідером Оленою (200) і залишком 3 с, піднято — `final.wagers` той самий, `remainingMs` 3000 на паузі, після `resume` дедлайн через 3 с;
    - збережено, коли годинник уже сплив, — піднята кімната на `question` з переможцем.
  - `recorder.test.ts`, `an auction answer is recorded with its bid and points` — рядок переможця `wager: 400`, `points: 600`; у непроданому — звичайні рядки всіх з `wager: null`.
  - `history.test.ts`, `auction questions are marked in the history` — продане: `auction: true`, `final.entries` з одним рядком переможця; непродане: `auction: true`, `final: null`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/socket.test.ts apps/server/src/rooms/manager.test.ts apps/server/src/restart.test.ts apps/server/src/recorder.test.ts apps/server/src/history.test.ts`. Очікується FAIL.

- [ ] **Step 3: Implement.** Тест `all_rounds` у `apps/server` (як `96c610f` у 27a) оновити до 9.

- [ ] **Step 4: Run** тести з кроку 2, потім `pnpm vitest run --maxWorkers=2 apps/server/src` і `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server packages/shared/src/history.ts
git commit -m "feat(server): 27b auction round — the room's clock sells, captain bids, restored bidding, recorded bids, history marks"
```

---

### Задача 5. Веб: назва, пам'ятка, помилки, історія, довідка й редактор раунду

**Files:**
- Modify:
  - `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts` (`ADDED_27B`), `apps/web/src/locales/{en,pl,de,es,it,ar}.json`;
  - `apps/web/src/guide-text.ts` (`ROUND_ICONS.auction: '🔨'`, `ROUND_NAMES.auction`, `roundHow`), `apps/web/src/round-summary.ts`, `apps/web/src/pages/GameHistory.tsx`;
  - `apps/web/src/help/help-uk.ts` (`round.auction.*`), `apps/web/src/help/__fixtures__/help-uk-golden.json` (нові id, свідомо), `apps/web/src/locales/{en,pl,de,es,it,ar}.help.json`;
  - `apps/web/src/editor/draft.ts`:
    - `newAuctionRound`;
    - `questionTypesFor('auction')` = список фіналу;
    - чистка `betsCut` поза `bets`/`auction`;
    - `Place` (`wordladder: true`);
    - проблеми;
  - `apps/web/src/editor/draft-storage.ts`;
  - `apps/web/src/editor/QuizEditor.tsx`: створення раунду; `showPoints` для `auction` — **так**; `betsCut={round.type === 'bets' || round.type === 'auction'}`;
  - `apps/web/src/editor/RoundSettings.tsx` (перевірка, режим, крок, втрати);
  - `apps/web/src/editor/QuestionEditor.tsx`, `apps/web/src/editor/BetsCutField.tsx` (проп `phase: 'bets' | 'auction'`);
  - `apps/web/src/styles.css`.
- Test: `apps/web/src/guide-text.test.ts`, `round-summary.test.ts`, `pages/GameHistory.test.tsx`, `editor/draft.test.ts`, `editor/BetsCutField.test.tsx`, `editor/QuizEditor.test.tsx`, наявні `help-golden.test.ts`, `locales/checks.test.ts`, `source-scan.test.ts`

**Interfaces:**
- Consumes: `auctionRoundSchema`, `AUCTION_BID_MODES`, `AUCTION_LOSSES`, `LIMITS.defaultBidStep`, `RoundBrief.auction`, `ErrorCode` (задача 1); `HistoryQuestion.auction` (задача 4).
- Produces:
  ```ts
  // draft.ts
  export function newAuctionRound(): AuctionRound;
  // { title: '', shuffleOptions: false, check: 'auto', bidMode: 'step', bidStep: LIMITS.defaultBidStep, loss: 'bid', questions: [newQuestion('single')] }
  // BetsCutField.tsx
  export function BetsCutField(props: { text: string; cut: number | undefined; onChange: (cut: number) => void; phase?: 'bets' | 'auction' }): JSX.Element; // типово 'bets'
  ```
- uk-ключі (усі в `ADDED_27B`; задача 6 дописує свої):
  ```ts
  roundTypeAuction: 'Аукціон',
  roundHow_auction: 'Перед кожним запитанням — торг: видно лише тему й ціну. Хто поставив найбільше, той і відповідає: правильно — ціна й ставка, помилка — мінус. Ніхто не поставив — відповідають усі.',
  buffWhy_off_auction: 'У раунді «Аукціон» бафів немає.',
  scoreSource_auction: 'Аукціон',
  err_bid_none: 'Без балів у торгу участі не берете.',
  err_bid_leader: 'Ваша ставка й так найбільша.',
  err_bid_low: 'Вас уже перебили — ставка має бути більшою за поточну.',
  err_bid_over: 'Більше за свої бали поставити не можна.',
  summaryAuctionStep: 'Ставки кроком +{step}',
  summaryAuctionFree: 'Ставка — будь-яка сума, більша за поточну',
  summaryAuctionLossBid: 'Помилка коштує ставки',
  summaryAuctionLossPrice: 'Помилка коштує ставки й ціни запитання',
  auctionHistoryLine: '{nickname} купив за {wager}: {points}',
  auctionHistoryOpen: 'Ніхто не купив — відповідали всі',
  auctionModeLabel: 'Як ставлять',
  auctionModeStep: 'Фіксованим кроком',
  auctionModeFree: 'Будь-яку суму, більшу за поточну',
  auctionStepLabel: 'Крок ставки',
  auctionLossLabel: 'Що втрачає той, хто помилився',
  auctionLossBid: 'Лише ставку',
  auctionLossBidPrice: 'Ставку й ціну запитання',
  auctionSettingsNote: 'Перша ставка — протягом 15 с, далі торг триває, поки перебивають: після кожної ставки ще 5 с. Ведучий може закрити торг раніше.',
  auctionCutLabel: 'Що видно під час торгу',
  auctionCutPreview: 'Під час торгу видно: «{text}»',
  auctionCutPreviewNone: 'Під час торгу видно лише тему раунду, номер і ціну запитання',
  auctionCutHidden: 'Варіанти, картинка, аудіо й відео — після продажу.',
  problemAuctionCut: 'Позначте, яку частину тексту видно під час торгу',
  ```
  - Числа поза межами (крок) — наявна проблема `problemRules`, як `betsNumbersBroken`.
  - `BetsCutField` з `phase: 'auction'` бере `auctionCut*` замість `betsCut*`. Кнопки «Нічого» / «Увесь текст» — ті самі ключі.
- Довідка `round.auction`:
  - `title`, `what`;
  - `how.0–3` — торг із темою й ціною; перебивання й годинник (15 с / 5 с); «Продано»; відповідає лише переможець, а без ставок — усі;
  - `points.0–2` — правильно: ціна + ставка; помилка: за налаштуванням; без ставок — ціна, як у звичайному запитанні, без бонусу швидкості;
  - `tip.0` — обріз до слова, що ще не видає відповідь, і ціна, яку варто перебивати;
  - `limits.0–2`:
    - ставка не більша за власні бали, з 0 балів у торгу не беруть участі;
    - ті самі типи запитань, що й у фіналі;
    - без бафів, крамниці дебафів і «Скасувати».
  - `help-uk-golden.json` отримує рівно ці нові id. Наявні записи не змінюються.

- [ ] **Step 1: Write the failing tests:**
  - `guide-text.test.ts`: `ROUND_NAMES.auction` → «Аукціон», `roundHow` непорожній.
  - `round-summary.test.ts`:
    - бриф `{ mode: 'step', step: 50, loss: 'bid' }` → «Ставки кроком +50», «Помилка коштує ставки»;
    - `free` + `bid_price` → «Ставка — будь-яка сума, більша за поточну», «Помилка коштує ставки й ціни запитання».
  - `GameHistory.test.tsx`:
    - продане запитання — «Оля купив за 400: +600»;
    - непродане — «Ніхто не купив — відповідали всі» і звичайні рядки.
  - `draft.test.ts`:
    - `newAuctionRound()` → `toMatchObject` з Interfaces;
    - `questionTypesFor('auction')` дорівнює `questionTypesFor('final')`;
    - без `betsCut` → `problemAuctionCut`;
    - перенесене в класику запитання втрачає `betsCut`, а між `bets` і `auction` — зберігає;
    - чернетка з `auction` після чистки проходить `quizSchema`.
  - `BetsCutField.test.tsx`: `phase: 'auction'` — підпис «Що видно під час торгу», прев'ю «Під час торгу видно: «Яке місто»».
  - `QuizEditor.test.tsx`, `creates an auction round with a mode, a step, a loss and a cut per question`:
    - додати «Аукціон», режим «Фіксованим кроком», крок 50, «Ставку й ціну запитання»;
    - три запитання з цінами й обрізом;
    - зберегти → `{ type: 'auction', bidMode: 'step', bidStep: 50, loss: 'bid_price' }`, `questions[0].betsCut === 2`, `questions[0].points` — введена ціна;
    - поле кроку сховане в режимі «Будь-яку суму», але число зберігається.
  - `i18n.test.ts`: `ADDED_27B`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/guide-text.test.ts apps/web/src/round-summary.test.ts apps/web/src/pages/GameHistory.test.tsx apps/web/src/editor apps/web/src/i18n.test.ts apps/web/src/help apps/web/src/locales`. Очікується FAIL.

- [ ] **Step 3: Implement.** Поля — за зразком блоку `bets` у `RoundSettings.tsx`. Режим і втрати — `<select>`, як `finalCheck`. Переклади 6 мов — природні, з тими самими плейсхолдерами; `ar` — за стилем файлу.

- [ ] **Step 4: Run** тести з кроку 2, `apps/web/src/source-scan.test.ts` і `pnpm typecheck`. Очікується PASS: від цієї задачі повний typecheck зелений. Якщо телефон чи сцена ще мають вичерпний `switch` без `auction`, додати мінімальну гілку, а повний UI — у задачі 6.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 27b auction round name, briefing, bid errors, history lines, host help and the round editor — mode, step, loss, a cut per question"
```

---

### Задача 6. Веб: телефон, сцена й пульт ведучого

**Files:**
- Create: `apps/web/src/screens/AuctionView.tsx`, `apps/web/src/screens/AuctionView.test.tsx`
- Modify:
  - `apps/web/src/screens/PlayerScreen.tsx`: `wager`, `question`, `locked`, `reveal` у раунді `auction`;
  - `apps/web/src/screens/TeamWatch.tsx`: не капітан бачить торг лише для читання;
  - `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/HostScreen.tsx`;
  - `apps/web/src/styles.css` (класи `auction-`);
  - `apps/web/src/i18n.ts`, 6 json, `ADDED_27B`.
- Test: `apps/web/src/screens/PlayerScreen.test.tsx`, `StageScreen.test.tsx`, `HostScreen.test.tsx`

**Interfaces:**
- Consumes: `AuctionInfo`, `HostAuction`, `PlayerAuction` (задача 3); `AUCTION_BID_MS`/`AUCTION_OPEN_MS` через `totalMs`; `Timer` (`view={{ endsAt, remainingMs }} offsetMs total`); `player:wager`, `host:next`; `errorText`; `signed()` з `format.ts`.
- Produces:
  ```tsx
  /** Шапка торгу для всіх: тема, «Запитання k з n», ціна, початок тексту, найбільша ставка й автор, годинник. */
  export function AuctionHeader(props: { auction: AuctionInfo; offsetMs: number }): JSX.Element;
  /** Телефон на wager: step — одна кнопка «Поставити {next}»; free — поле (next…limit) і «Поставити»; leading/short/none — рядок без дії. */
  export function BidForm(props: { auction: AuctionInfo; mine: PlayerAuction; send: Send }): JSX.Element;
  /** Телефон на question…reveal: winner — «Ви купили за {bid}»; watching — «Відповідає {nickname}»; open — «Ніхто не купив»; на reveal — бали переможця. */
  export function AuctionResult(props: { auction: AuctionInfo; mine: PlayerAuction }): JSX.Element | null;
  /** Сцена на wager: велика ставка й автор, годинник, тема без схованого. */
  export function AuctionStage(props: { auction: AuctionInfo; offsetMs: number }): JSX.Element;
  /** Смуга на question/locked: «Продано: {nickname} за {bid}» або «Ніхто не купив — відповідають усі». */
  export function AuctionStrip(props: { auction: AuctionInfo }): JSX.Element;
  /** Рядок reveal проданого: переможець · ставка · ✓/✗ · бали. */
  export function AuctionResults(props: { auction: AuctionInfo }): JSX.Element | null;
  /** Пульт: повне запитання з позначеним обрізом, межі всіх, лідер, «Продано» (host:next) на wager; оцінка для manual. */
  export function HostAuctionPanel(props: { auction: HostAuction; send: Send; onError?: (text: string | null) => void }): JSX.Element;
  ```
- uk-ключі (`betsQuestionOf` і `betsHostCut` — перевикористати):
  ```ts
  auctionPrice: 'Ціна запитання: {price}',
  auctionTopBid: 'Найбільша ставка: {bid} — {nickname}',
  auctionNoBids: 'Ставок ще немає',
  auctionRaise: 'Поставити {amount}',
  auctionBidLabel: 'Ставка',
  auctionBidPrompt: 'Від {min} до {limit}',
  auctionBidPlace: 'Поставити',
  auctionLeading: 'Ваша ставка найбільша',
  auctionShort: 'Більше за ваші бали ({limit}) поставити не можна',
  auctionNone: 'Без балів у торгу участі не берете; якщо ніхто не купить — відповідаєте з усіма',
  auctionWinnerYou: 'Ви купили запитання за {bid} — відповідайте!',
  auctionWinnerOther: 'Відповідає {nickname} — купив за {bid}',
  auctionOpenAll: 'Ніхто не купив — відповідають усі',
  auctionResultRight: 'Правильно: {points}',
  auctionResultWrong: 'Помилка: {points}',
  auctionSold: 'Продано',
  auctionSoldTo: 'Продано: {nickname} за {bid}',
  auctionTimerLabel: 'До кінця торгу',
  auctionHostLimit: 'бали {limit}',
  auctionHostCannot: 'не може перебити',
  ```
- Поведінка телефона:
  - `busy`-ref — один запит за раз;
  - відмова — `errorText(error)` під кнопкою (`role="status"`, клас `auction-error`), зникає з новою ставкою чи зміною поля;
  - `step` шле `{ amount: auction.next }`. Кнопка вимкнена, якщо `!mine.canBid`;
  - `free` — поле `type="number"`, `inputMode="numeric"`, `dir="ltr"`, `min`/`max` з `next`/`limit`, форма `noValidate`, щоб сума поза межами йшла на сервер і гравець бачив причину (`bid_over`). Після нової чужої ставки поле не скидає введене;
  - на `question` гравець зі статусом `watching` бачить запитання без поля відповіді й рядок `auctionWinnerOther`;
  - не капітан у командах — наявний `teamCaptainWager`;
  - 320 px без горизонтальної прокрутки.
- Сцена:
  - `wager` — `AuctionStage` (без `view.question`);
  - `question`/`locked` — звичайне запитання + `AuctionStrip`;
  - `reveal` — звичайна правильна відповідь + `AuctionResults` (лише продане).
  - `FinalStage`/`BetsStage` не вмикаються.
- Пульт: на `wager` — `HostAuctionPanel` з кнопкою «Продано» замість «Далі» (та сама `host:next`); кнопки оцінки — як у `HostBetsPanel`.

- [ ] **Step 1: Write the failing tests** (`AuctionView.test.tsx`, `send` — `vi.fn`):
  - `shows the theme, price, top bid and the clock` — «Запитання 1 з 3», «Ціна запитання: 200», «Яке місто», «Найбільша ставка: 200 — Олена».
  - `a step bid sends the exact next amount` — «Поставити 300» → `send('player:wager', { amount: 300 })`.
  - `a free bid sends the typed amount and shows the server's reason` — 900 → `{ ok: false, error: 'bid_over' }` → «Більше за свої бали поставити не можна.».
  - `a double tap places one bid` — два дотики до відповіді → один виклик.
  - `the leader, the short and the zero see a line, not a button` — `leading` → «Ваша ставка найбільша»; `short` → `auctionShort`; `none` → `auctionNone`.
  - `after the sale the phone says who answers` — `winner` → «Ви купили запитання за 400 — відповідайте!»; `watching` → «Відповідає Олена — купив за 400»; `open` → «Ніхто не купив — відповідають усі».
  - `the result shows the winner's points` — «Правильно: +600», «Помилка: −400».
  - `the stage hides the rest and shows the sale` — `AuctionStage` без `Австралії`; `AuctionStrip` «Продано: Олена за 400».
  - `the host sells` — `HostAuctionPanel` показує повний текст, «Гравці бачать: Яке місто», межі (Хосе «не може перебити»), «Продано» шле `host:next`.
  - `PlayerScreen.test.tsx`: на `wager` з `me.auction` — `BidForm`; на `question` зі `watching` поля відповіді немає; з `open` — є.
  - `StageScreen.test.tsx`, `an auction round shows the teaser while bidding and the winner after reveal`.
  - `HostScreen.test.tsx`, `the host sells the auction early`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/AuctionView.test.tsx apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/screens/StageScreen.test.tsx apps/web/src/screens/HostScreen.test.tsx apps/web/src/i18n.test.ts apps/web/src/locales`. Очікується FAIL.

- [ ] **Step 3: Implement** за зразком `BetsView.tsx` (класи `wager-*` для спільного вигляду, `auction-*` — свої). Числа — `signed()`, `dir="ltr"`.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 apps/web`, `apps/web/src/source-scan.test.ts` і `pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 27b auction on the phone, stage and host console — top bid with its author and clock, step or free bids, sale by the host, who answers, the winner's points"
```

---

### Задача 7. Наскрізний сценарій і кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе вище. Помічники e2e: `open`, `register`, `field`, `click`, `questionText`, `openRoundSettings`, `shot`, `expectNoSideScroll`, `snapshot`, `POLL`, `exact` і зразок `part 27a` (`step27a`, `next27a`, `phoneScore27a`). Свої помічники — з суфіксом `27b`.

- [ ] **Step 1: Write the scenario.** `it('part 27b: an auction round — outbidding with a resetting clock, the host selling early, the winner right and wrong in both loss modes, nobody bidding and the score cap', …, 600_000)` з `try/catch` → `snapshot()`, як `part 27a`. `leaderboard: 'end'`.
  - **Редактор.** Ведучий створює вікторину через редактор:
    - класика без бонусу швидкості: «один варіант» `Яка планета найбільша?` (Юпітер) за 500 і «текст» `Столиця Франції?` (Париж) за 300;
    - раунд А «Аукціон», «Фіксованим кроком» +100, «Лише ставку»:
      - А1 — «один варіант» `Яке місто є столицею Австралії?`: Сідней / **Канберра** / Мельбурн / Перт, ціна 200, обріз після «місто»;
      - А2 — «так/ні» `Чи є кит рибою?`, правильна «ні», ціна 300, обріз «Нічого»;
      - А3 — «число» `Скільки ніг у павука?`, 8, ціна 200, обріз «Увесь текст».
    - раунд Б «Аукціон», «Будь-яку суму», «Ставку й ціну запитання»:
      - Б1 — «текст» `Столиця Японії?` (Токіо), ціна 300, обріз після «Столиця»;
      - Б2 — «один варіант» `Який океан найбільший?`: Атлантичний / **Тихий** / Індійський, ціна 400, обріз після «океан».
    - Без обрізу видно проблему «Позначте, яку частину тексту видно під час торгу». Кадр `auction27b-editor`.
  - **Гра.** Сцена 1600×900. Оля — 375×812, Тарас — 360×740, Іра — 360×740, Хосе — 320×640 `es-ES`.
  - **Класика:** Оля — обидва правильно (800), Тарас — перше (500), Іра — друге (300), Хосе — нічого (0).
  - **А1 — торг із перебиванням і таймер, що обнуляється (режим «лише ставку», правильно):**
    - сцена й телефони показують «Яке місто» й «Ціна запитання: 200»; `stage.content()` і `olya.content()` не містять `Австралії` й `Канберра`;
    - Хосе бачить пояснення (es) без кнопки;
    - Тарас «Поставити 100», Оля «Поставити 200», Тарас «Поставити 300»;
    - на телефоні Тараса — «Ваша ставка найбільша», без кнопки;
    - через ~3 с Оля «Поставити 400»; сцена — «Найбільша ставка: 400 — Оля»;
    - **таймер обнуляється:** через 3 с після ставки Олі (тобто понад 5 с від ставки Тараса) торг ще йде;
    - Іра бачить «Більше за ваші бали (300) поставити не можна»;
    - торг закривається сам ≤ 7 с після ставки Олі;
    - Тарас і Іра бачать «Відповідає Оля — купив за 400» без поля; Оля — Канберра;
    - розкриття: «Оля · ставка 400 · +600»; рахунки 1400 / 500 / 300 / 0.
  - **А2 — «Продано» ведучого (режим «лише ставку», хибна):**
    - на сцені немає тексту запитання;
    - Тарас «Поставити 100», ведучий одразу тисне «Продано» (менше ніж за 5 с);
    - Тарас «так» → «Помилка: −100», рахунок 400.
  - **А3 — ніхто не поставив:**
    - видно весь текст, поля відповіді ще немає;
    - ведучий «Продано» без ставок → «Ніхто не купив — відповідають усі» на сцені й телефонах;
    - Оля, Тарас, Хосе — 8, Іра — 6;
    - рахунки 1600 / 600 / 300 / 200 (Хосе з 0 балів теж відповідає).
  - **Б1 — межа ставки балами (режим «ставку й ціну», хибна):**
    - на сцені «Столиця» без «Японії»;
    - Іра вводить 500 → «Більше за свої бали поставити не можна.»;
    - Тарас 250;
    - Хосе вводить 200 → «Вас уже перебили…» (es-текст із локалі), потім 300 → `bid_over` (es);
    - Іра 300;
    - годинник закриває торг; Іра «Кіото» → «Помилка: −600»;
    - рахунки 1600 / 600 / −300 / 200.
  - **Б2 — режим «ставку й ціну», правильна:**
    - Оля 1000, ведучий «Продано»;
    - Оля «Тихий» → «Правильно: +1400», рахунок 3000.
  - **Перевірки:**
    - `expectNoSideScroll` для `BidForm` на 320 px (`es`, обидва режими) і 360 px;
    - пульт на торгу бачить повне запитання й межі;
    - історія гри показує «Оля купив за 400: +600» і «Ніхто не купив — відповідали всі».
  - **Кадри (`E2E_SHOTS=1`):**
    - `auction27b-stage-bidding`, `auction27b-phone-step`, `auction27b-phone-leading`, `auction27b-phone-none-es-320`, `auction27b-host-bidding`;
    - `auction27b-phone-watching`, `auction27b-stage-reveal`, `auction27b-stage-open`;
    - `auction27b-phone-free-over`, `auction27b-phone-free-es-320`.

- [ ] **Step 2: Run** `pnpm build`, потім на передньому плані `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 27b"` (менше 10 хв). Очікується PASS.

- [ ] **Step 3: Переглянути кадри:**
  - кнопка й поле ставки на 320/360 px не вилазять;
  - довгі імена в «Найбільша ставка: … — …» переносяться;
  - годинник торгу видно на сцені й телефоні;
  - смуга продажу й рядок розкриття читаються на 1600×900;
  - іспанська розкладка ціла.
  Якщо щось ламається — виправити CSS, коміт окремо.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2` (усе) і `pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts apps/web/src/styles.css
git commit -m "test(e2e): part 27b auction round — outbidding with a resetting clock, early sale, winner right and wrong in both loss modes, nobody bidding, score cap"
```
