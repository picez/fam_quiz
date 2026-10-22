# План 7d: бали від ведучого й дебафи

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** ведучий отримує дві «живі» дії над гравцями (розділ 6 специфікації):
1. **Бали (6.1).** Біля кожного гравця в консолі — «Бали»: швидкі −50 / −100 / −200 / +50 / +100 і поле «Своя сума» (будь-яке ціле, крім нуля). Діє з заставки першого раунду до кінця гри (не в лобі й не після фінішу). Сцена й телефони на 4 с показують «Ведучий: −100 — Оля». Коригування входять у рахунок, таблицю, підсумки гри, історію й профіль.
2. **Дебафи (6.2).** Біля кожного гравця — «Дебаф»: шість видів. Дебаф чекає на наступне запитання, у якому гравець відповідає зі свого телефона, і діє на його телефоні до закриття цього запитання. Один дебаф на гравця; поки не спрацював — ведучий може скасувати. Сцена показує «🐞 Оля», гравець на початку запитання бачить «На вас наслано: Туман». Інші гравці й сцена ефекту не бачать.

**Архітектура:**
- **Рушій (`engine`).** Новий `adjust.ts`: `GameState.adjustments: ScoreAdjustment[]` — журнал коригувань (`source: 'host' | 'duel'`, щоб дуелі 7g записували туди ж). `withTotals` додає суму коригувань гравця до його рахунку, тож усе, що рахує від `player.score` (таблиця, ранги, фінал, запис у базу), отримує їх автоматично. Новий `debuffs.ts`: `GameState.debuffs: Record<string, DebuffState>`; `openQuestion` викликає `fireDebuffs` — дебаф спрацьовує, якщо гравець серед тих, хто відповідає на це запитання зі свого телефона, і підключений.
- **Зрізи (`shared`, `engine`).** `BaseView.notice` — останнє коригування від ведучого (для сповіщення); `StageView.debuffs` — лише імена (значок); `PlayerView.me.debuff` — вид і мить спрацювання, **лише** коли дебаф діє в поточному запитанні; `HostView.players[].debuff` — вид і стан.
- **Сервер.** Нові дії ведучого `host:adjust`, `host:debuff`, `host:undebuff` (zod-схеми в `events.ts`). Нова таблиця `score_adjustment` (міграція `0006`): рекордер дописує коригування; історія гри повертає їх списком, `gameTables` додає їх до рядків учасника з `attempt = ADJUSTMENT_ATTEMPT` (−2) для ачівок.
- **Веб (`web`).** `HostPlayerTools.tsx` (панелі «Бали» й «Дебаф» під рядком гравця), `LiveNotices.tsx` (сповіщення про бали й значки дебафів на сцені), `Debuffs.tsx` (обгортка `DebuffZone` навколо запитання на телефоні: банер, тремтіння, заморозка, дзеркало, гості) і `WipeLayers.tsx` (туман і бруд, що стираються пальцем). Історія гри показує «Бали від ведучого: Оля −100, Петро +75» під раундом.

**Технології:** TypeScript, zod 4, vitest, Fastify + Socket.IO, Drizzle + PostgreSQL (PGlite у тестах), React + Vite, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-23-after-second-game-design.md`, розділ 6 (частина 7d), анти-цілі розділу 2 («підказка через дані дебафів», «гра застрягає», «зламалася історія ігор і профіль», «дебаф робить відповідь неможливою», «елементи стрибають під час чужих дій»), рішення розділу 11 («дебаф спрацьовує в наступному запитанні, де гравець відповідає», «заморозка — 5 секунд»), розділ 9 (результати дуелей ідуть у рахунок як коригування). Частини 7a–7c уже в `main`. Частини 7e–7g цей план не чіпає.

**Рішення плану там, де специфікація мовчить:**
- **Коли можна нараховувати бали:** будь-який етап, крім `lobby` і `finished` (зокрема заставка, вибір клітинки, ставки, відкрите запитання, таблиця, підсумки раунду). Межа: ціле від −10 000 до 10 000, не нуль (`LIMITS.maxAdjust = 10_000`). Скасування немає: ведучий нараховує протилежну суму.
- **Ім'я в сповіщенні не відмінюємо** (нікнейми довільні): «Ведучий: −100 — Оля», «Ведучий: +75 — Петро». Значок на сцені: «🐞 Оля». Сповіщення бачать сцена й телефони всіх гравців (ведучий бачить зміну рахунку в списку). Тривалість — 4 с (`NOTICE_MS`); після перепідключення старше сповіщення не показується (порівняння з часом сервера через `offsetMs`).
- **Коригування й фінал.** Межі ставок фіналу фіксуються на вході в `wager`, як і досі; коригування під час ставок їх не змінює. На розкритті фіналу «до → після» рахується від рахунку з коригуваннями. Коригування не змінюють серій і бонусу серії.
- **Коригування й ачівки.** Ідеальна гра, найдовша серія й «влучив у фінал» дивляться лише на відповіді — коригування їх не зачіпають. «Перемога в бліц-раунді» й «камбек» порівнюють бали за раунди — коригування входять (так гравці бачили таблицю). Перемога (`isWin`) і так рахується від `participant.score`, що вже містить коригування.
- **Хто «відповідає» (для дебафу)** — функція `answerersOf(state, play)`:
  - класичний раунд, бліц-раунд (миттєвий і з кнопкою, зокрема «вголос»: натискають на телефоні), фінал, ланцюжок — усі гравці;
  - бліц-клітинка поля — усі гравці (відповідати може будь-хто, зокрема вибравший);
  - звичайна клітинка з відповіддю телефоном — лише вибравший;
  - звичайна клітинка «вголос» — ніхто: на телефоні немає чим відповідати, дебаф чекає далі.
  - Відключений у мить відкриття запитання гравець пропускається — дебаф чекає наступного запитання.
- **Стан дебафу:** `firedAt: null` — чекає; `firedAt = questionIndex` — діє, поки це запитання на етапі `question`. Після закриття запитання (`lockNow`) спрацьовані дебафи видаляються; `fireDebuffs` на відкритті нового запитання ще раз прибирає застарілі (страховка для `end`/`endRound`). Скасувати можна лише дебаф, що чекає (`cancelDebuff` для дебафу, що діє, — `wrong_phase`). Новий дебаф на гравця, який має дебаф, що чекає або діє, — `debuff_busy`. Дебаф можна наслати з того самого етапу, що й бали (не лобі, не фініш); наісланий посеред запитання спрацює в наступному.
- **Що бачить ціль до спрацювання:** нічого (сюрприз). Сцена показує значок і поки дебаф чекає, і поки діє. Інші телефони — нічого. Зрізи інших гравців не містять жодних даних про чужі дебафи.
- **Ефекти лише на клієнті.** Сервер нічого не блокує й не перевіряє: дебаф — косметика телефона цілі; відповідь завжди йде за id варіанта.
  1. **Тремтіння** (`shake`): уміст зони труситься 0,6 с кожні 3 с. Зі зменшеною анімацією — без руху: уміст на 0,8 с кожні 3 с «двоїться» (розмиття 1,5 px і `opacity: 0.6`).
  2. **Туман** (`fog`): шар з `backdrop-filter: blur(7px)` і молочним тлом `--fog` над умістом; маска шару — сітка 12×16 клітинок, клітинки під пальцем (радіус ~1,5 клітинки) очищаються назавжди; маска малюється на крихітному canvas і ставиться як `mask-image`, тож краї м'які. Туман не повертається.
  3. **Заморозка** (`freeze`): уміст зони — у `fieldset disabled` протягом `freezeMs(limitMs)` = 5000 мс, але не більше половини часу запитання (`Math.min(5000, Math.floor(limitMs / 2))`; без таймера — 5000), рахуючи від `since` за годинником сервера. Над умістом — лід (`--ice`) з тріщинами, що з'являються за 3 етапи; наприкінці лід розсипається. Зі зменшеною анімацією лід просто зникає.
  4. **Дзеркало** (`mirror`): уміст зони — `transform: scaleX(-1)`; поля введення перевертаються вдруге (`scaleX(-1)` на `input`), тож набраний текст читається — інакше текстова відповідь стала б майже неможливою. Варіанти single/multi кожні 4 с зсуваються по колу на одну позицію (`rotateChoices`); вибір іде за `choice.id`. У order/match/boolean позиції не міняються (зламали б розкладку відповіді) — лише віддзеркалення.
  5. **Гості** (`guests`): 4 емодзі (🐞 🐈 🐕 🐞) розміром 4–5 rem пробігають зоною з різними затримками й висотами; `pointer-events: none`, зона `overflow: hidden`. Зі зменшеною анімацією гості стоять на місцях і повільно проявляються й зникають (`opacity`, 6 с), без руху.
  6. **Бруд** (`mud`): 6 плям (SVG-клякси кольору `--mud`) у місцях, визначених `questionIndex` (стабільні між перемальовками); кожен рух пальця над плямою зменшує її на 0,2; на 0 пляма зникає.
  - Шари туману, бруду, гостей і банер мають `pointer-events: none`: торкання проходять до варіантів. Стирання слухає `pointermove` і `touchmove` (пасивні) на самій зоні.
  - Банер «На вас наслано: Туман» (+ підказка для туману, бруду й заморозки) лежить поверх зони (`position: absolute`, не зсуває уміст) 3 с від `since`, `role="status"`, не віддзеркалюється.
- **Без зсувів для інших.** `DebuffZone` (обгортка `div.debuff-zone` + `fieldset.debuff-content`) рендериться навколо запитання на етапі `question` **завжди**, з дебафом чи без: для гравців без дебафу DOM той самий, лише без `data-debuff`. Сповіщення про бали й значки сцени — `position: fixed`, нічого не зсувають.
- **Пульт.** Під рядком гравця — дві кнопки «Бали» й «Дебаф» (лише коли гра йде); відкривається одна панель за раз. Біля імені — тег дебафу: «🌫️ Туман · чекає» (з кнопкою «Скасувати дебаф» у панелі) або «🌫️ Туман · діє». Швидкі кнопки надсилають одразу, без підтвердження; «Своя сума» перевіряється на клієнті (ціле, не нуль, у межах).
- **Зберігання.** Окрема таблиця `score_adjustment` (`participant_id` → `participant` з каскадом, `seq`, `round_index`, `after_question`, `points`, `source`), ключ `(participant_id, seq)`. `participant.score` і далі — підсумок з рушія (уже з коригуваннями), тож таблиця історії й профіль збігаються з таблицею гри без змін у запитах. `seq` — зростаючий номер у межах гри з лічильника `GameState.adjustmentSeq`, ніколи не перевикористовується.

## Глобальні обмеження

- Старі вікторини, ігри, історія й профіль поводяться як зараз: схема вікторини не змінюється; у старих іграх `adjustments: []`. Міграція `0006` лише додає таблицю.
- Рушій чистий: `now` і `rng` передаються аргументами, без мережі й таймерів.
- Анти-ціль «підказка через дані дебафів»: зріз сцени містить лише імена цілей, зріз гравця — лише власний дебаф і лише коли він діє; жодних даних про відповідь.
- Анти-ціль «дебаф робить відповідь неможливою»: шари з `pointer-events: none`; заморозка — не довше половини часу; дзеркало не віддзеркалює поля введення й міняє місцями лише за id.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`. Нові кольори — токени в `:root` у `styles.css`. Тема лише темна. Поля введення — у `label.field`, шрифт ≥ 16 px.
- Розкладка працює на ширині 375 px без горизонтальної прокрутки сторінки (зона дебафу `overflow: hidden`). Анімації руху — лише за `prefers-reduced-motion: no-preference`; для `reduce` — описані вище спокійні варіанти. Елементи в інших гравців не стрибають.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2` (саме `--maxWorkers=2`: паралельні робітники PGlite падають на цій машині).
- Наскрізні тести: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Кадри — з `E2E_SHOTS=1` у `apps/server/e2e/artifacts/shots`.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (проєкт тестовий).

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/game.ts` | `ADJUSTMENT_SOURCES`, `AdjustmentSource`, `ErrorCode` `'points_invalid'` | 1 |
| `packages/shared/src/quiz.ts` | `LIMITS.maxAdjust` | 1 |
| `packages/shared/src/events.ts` | `adjustSchema`, `host:adjust` | 1 |
| `packages/shared/src/views.ts` | `AdjustmentNotice`, `BaseView.notice` | 1 |
| `packages/engine/src/adjust.ts` (новий) | `adjustScore`, `adjustmentTotal`, `lastNotice` | 1 |
| `packages/engine/src/game.ts` | `ScoreAdjustment`, `GameState.adjustments`, `createGame`, `withTotals`, `removePlayer` | 1 |
| `packages/engine/src/views.ts` | `notice` у `base` | 1 |
| `apps/server/src/rooms/manager.ts`, `socket.ts` | дія `adjust` | 1 |
| `apps/web/src/screens/*.test.tsx` | фабрики зрізів: `notice: null` | 1 |
| `apps/server/src/db/schema.ts`, `apps/server/drizzle/0006_score_adjustments.sql` (+ `meta`) | таблиця `score_adjustment`, `ADJUSTMENT_ATTEMPT` | 2 |
| `apps/server/src/recorder.ts` | запис коригувань | 2 |
| `apps/server/src/history.ts`, `packages/shared/src/history.ts` | `GameDetail.adjustments`, рядки коригувань у `gameTables` | 2 |
| `apps/web/src/pages/GameHistory.tsx` | «Бали від ведучого» під раундом | 2 |
| `packages/shared/src/game.ts` | `DEBUFF_KINDS`, `DebuffKind`, `ErrorCode` `'debuff_busy'` | 3 |
| `packages/shared/src/events.ts` | `debuffSchema`, `undebuffSchema`, `host:debuff`, `host:undebuff` | 3 |
| `packages/shared/src/views.ts` | `StageView.debuffs`, `PlayerView.me.debuff`, `HostPlayer` | 3 |
| `packages/engine/src/debuffs.ts` (новий) | `setDebuff`, `cancelDebuff`, `fireDebuffs`, `spendDebuffs`, `activeDebuff`, `answerersOf` | 3 |
| `packages/engine/src/game.ts`, `views.ts` | `GameState.debuffs`, виклики в `openQuestion`/`lockNow`/`removePlayer`; зрізи | 3 |
| `apps/server/src/rooms/manager.ts`, `socket.ts` | дії `debuff`, `undebuff` | 3 |
| `apps/web/src/screens/HostPlayerTools.tsx` (новий), `HostScreen.tsx` | панелі «Бали» й «Дебаф» | 4 |
| `apps/web/src/debuff-meta.ts` (новий) | `DEBUFF_ICONS`, `debuffName` | 4 |
| `apps/web/src/live/LiveNotices.tsx` (новий), `StageScreen.tsx`, `PlayerScreen.tsx` | сповіщення про бали, значки на сцені | 5 |
| `apps/web/src/motion.ts` (новий), `apps/web/src/screens/Dice.tsx` | `reducedMotion()` перенесено з `Dice.tsx` | 6 |
| `apps/web/src/screens/Debuffs.tsx` (новий), `PlayerScreen.tsx` | `DebuffZone`, банер, тремтіння, заморозка, дзеркало, гості | 6 |
| `apps/web/src/screens/WipeLayers.tsx` (новий), `apps/web/src/screens/wipe.ts` (новий) | туман і бруд | 7 |
| `apps/web/src/i18n.ts`, `apps/web/src/styles.css` | тексти й стилі кожної веб-задачі | 2, 4–7 |
| `apps/server/e2e/full-game.e2e.ts` | наскрізний сценарій 7d | 8 |

## Порядок збирання

- Задача 1 (бали: рушій, зрізи, сервер) — основа; задача 2 (база, історія) спирається на 1.
- Задача 3 (дебафи: рушій, зрізи, сервер) незалежна від 2, спирається на 1 лише через спільні файли.
- Задача 4 (пульт) спирається на 1 і 3. Задача 5 (сповіщення й значки) — на 1 і 3.
- Задача 6 (зона дебафу) — на 3; задача 7 (туман і бруд) — на 6 (вставляє шари в `DebuffZone`). **Тимчасово між задачами 6 і 7** туман і бруд показують лише банер без шару.
- Задача 8 (e2e) — остання. Наявні наскрізні сценарії не змінюються: нові кнопки з'являються лише поруч із «Вилучити», а `DebuffZone` без дебафу нічого не змінює візуально.

## На що дивитися рецензентові

1. **Дебаф спрацьовує лише там, де гравець відповідає з телефона.** Чужа звичайна клітинка, усна клітинка, відключений гравець — дебаф чекає далі; бліц-клітинка, класика, бліц, фінал — спрацьовує. Тести: задача 3, `a debuff waits through a cell chosen by someone else and a voice cell, fires on a blitz cell` і `a disconnected target keeps the debuff for the next question`.
2. **Нічого не просочується.** Зріз іншого гравця без поля `debuff` у `me` для чужих, сцена — лише імена; ціль не бачить дебаф, поки він чекає. Тести: задача 3, `only the target sees its own active debuff; the stage sees names only`.
3. **Підсумки збігаються скрізь.** Таблиця гри = `participant.score` = історія = «Мої ігри»; коригування вилученого гравця зникають; на розкритті фіналу рахунок гравця не видає його результат раніше. Тести: задача 1, `adjustments add to the score, survive recomputation and vanish with a kicked player`, `the final reveal still conceals the result with an adjustment`; задача 2, `history and my games match the leaderboard with adjustments`.
4. **Відповісти завжди можна.** Заморозка ≤ половини часу; шари не перехоплюють дотики; дзеркало міняє лише позиції й лише single/multi, вибір за id; поля введення читаються. Тести: задача 6, `freeze unlocks after five seconds or half the time`, `mirror rotates options and a tap still sends the option id`; задача 7, `fog and mud layers never catch taps`; задача 8 — відповідь під кожним дебафом.
5. **Нічого не стрибає, 375 px.** У гравця без дебафу DOM зони без `data-debuff`, сповіщення й значки фіксовані; гості не роблять горизонтальної прокрутки. Тести: задача 5, `the notice is fixed and does not push the content`; задача 6, `the zone is the same for everyone without a debuff`; задача 8, `expectNoSideScroll` під кожним дебафом.

---

### Задача 1. Бали від ведучого: рушій, зрізи, сервер

**Files:**
- Create: `packages/engine/src/adjust.ts`, `packages/engine/src/game.adjust.test.ts`
- Modify: `packages/engine/src/game.ts` (`GameState` ~200, `createGame` ~222, `withTotals` ~553, `removePlayer` ~273), `packages/engine/src/views.ts` (`base` ~500), `packages/engine/src/index.ts` (`export * from './adjust'`)
- Modify: `packages/shared/src/game.ts`, `packages/shared/src/quiz.ts` (`LIMITS`), `packages/shared/src/events.ts`, `packages/shared/src/views.ts` (`BaseView`)
- Modify: `apps/server/src/rooms/manager.ts` (`HostAction`, `host`), `apps/server/src/socket.ts`
- Modify: `apps/web/src/i18n.ts` (`err_points_invalid`)
- Modify (механічно): фабрики зрізів у `apps/web/src/screens/PlayerScreen.test.tsx`, `StageScreen.test.tsx`, `HostScreen.test.tsx` та інших тестах, що будують `GameView` (`notice: null`)
- Test: `packages/engine/src/views.test.ts`, `apps/server/src/rooms/manager.test.ts`, `apps/server/src/socket.test.ts`

**Interfaces:**
- Produces (`shared`):
  ```ts
  // game.ts
  export const ADJUSTMENT_SOURCES = ['host', 'duel'] as const;
  export type AdjustmentSource = (typeof ADJUSTMENT_SOURCES)[number];
  // ErrorCode + 'points_invalid'
  // quiz.ts, LIMITS
  /** Найбільша сума одного коригування балів ведучим (за модулем). */
  maxAdjust: 10_000,
  // events.ts
  export const adjustSchema = z.object({ playerId, points: z.number().int().min(-LIMITS.maxAdjust).max(LIMITS.maxAdjust).refine((n) => n !== 0) });
  'host:adjust': (payload: z.infer<typeof adjustSchema>, ack: Ack) => void;
  // views.ts
  /** Останнє коригування від ведучого, для короткого сповіщення. */
  export interface AdjustmentNotice { seq: number; at: number; nickname: string; points: number }
  // BaseView
  /** Останнє коригування балів ведучим; null — не було. */
  notice: AdjustmentNotice | null;
  ```
- Produces (`engine`):
  ```ts
  // game.ts
  /** Коригування рахунку поза відповідями: бали від ведучого, пізніше — дуелі. */
  export interface ScoreAdjustment {
    /** Зростаючий номер у межах гри, від 1. */
    seq: number;
    playerId: string;
    points: number;
    roundIndex: number;
    /** Скільки запитань журналу було закрито в мить коригування. */
    afterQuestion: number;
    source: AdjustmentSource;
    at: number;
  }
  // GameState: adjustments: ScoreAdjustment[]; /** Останній виданий seq. */ adjustmentSeq: number;   createGame → [], 0
  /** Перерахунок рахунку з журналу (наявна функція, тепер експортована як внутрішня для adjust.ts). */
  export function withTotals(state: GameState): GameState;
  // adjust.ts
  /** Етапи lobby і finished → wrong_phase; невідомий гравець → not_found; не ціле, 0 або |points| > maxAdjust → points_invalid. */
  export function adjustScore(state: GameState, playerId: string, points: number, now: number, source?: AdjustmentSource): Result; // source за замовчуванням 'host'
  export function adjustmentTotal(state: GameState, playerId: string): number;
  /** Останнє коригування з source 'host' гравця, який ще в грі; інакше null. */
  export function lastNotice(state: GameState): AdjustmentNotice | null;
  ```
- Produces (`manager.ts`): `HostAction` + `{ type: 'adjust'; playerId: string; points: number }` → `adjustScore(state, action.playerId, action.points, this.now())`.

- [ ] **Step 1: Write the failing tests** у новому `game.adjust.test.ts` (фікстури: `makeQuiz([single, text])`, `lobbyWith(quiz, 'Олена', 'Тарас')`, `startRound`, `must`; `T0 = 1_000_000`):
  ```ts
  it('the host adds or takes points at any stage of the game but not in the lobby or after the end', () => {
    expect(adjustScore(lobby(), 'p1', -100, T0)).toEqual({ ok: false, error: 'wrong_phase' });
    const intro = must(start(lobby()));
    const state = must(adjustScore(intro, 'p1', -100, T0));
    expect(state.players.find((p) => p.id === 'p1')?.score).toBe(-100);
    expect(state.adjustments).toEqual([{ seq: 1, playerId: 'p1', points: -100, roundIndex: 0, afterQuestion: 0, source: 'host', at: T0 }]);
    expect(adjustScore(must(end(state)), 'p1', 50, T0)).toEqual({ ok: false, error: 'wrong_phase' });
  });
  it('refuses zero, fractions, too large sums and unknown players', () => {
    const intro = must(start(lobby()));
    for (const points of [0, 1.5, 10_001, -10_001]) expect(adjustScore(intro, 'p1', points, T0)).toEqual({ ok: false, error: 'points_invalid' });
    expect(adjustScore(intro, 'p9', 50, T0)).toEqual({ ok: false, error: 'not_found' });
    expect(must(adjustScore(intro, 'p1', 10_000, T0)).players[0].score).toBe(10_000);
  });
  it('adjustments add to the score, survive recomputation and vanish with a kicked player', () => {
    let state = must(adjustScore(startRound(lobby(), T0), 'p1', 75, T0 + 1000)); // під час запитання
    expect(state.adjustments[0]).toMatchObject({ afterQuestion: 0, seq: 1 });
    state = must(submitAnswer(state, 'p1', correct, T0 + 2000));
    state = must(submitAnswer(state, 'p2', wrong, T0 + 2000)); // закриття перераховує рахунок
    expect(state.players[0].score).toBe(recordOf(state, 0, 'p1')!.points + 75);
    state = must(adjustScore(state, 'p2', -50, T0 + 3000));
    expect(state.adjustments.map((a) => [a.seq, a.afterQuestion])).toEqual([[1, 0], [2, 1]]);
    state = must(removePlayer(state, 'p1'));
    expect(state.adjustments.map((a) => a.playerId)).toEqual(['p2']);
    expect(must(adjustScore(state, 'p2', 10, T0)).adjustments.at(-1)?.seq).toBe(3); // номер не перевикористовується
  });
  it('the final reveal still conceals the result with an adjustment', () => {
    // makeRoundsQuiz([classicRound('r1', [single]), finalRound('r2', text)]): після ставок і відповідей на reveal
    // ведучий нараховує p2 +100 до його розкриття → playerView(p2).me.score = рахунок до фіналу + 100 (без результату фіналу);
    // після розкриття p2 — повний рахунок; finalInfo.shown для p2: after − before = бали фіналу.
  });
  it('lastNotice gives the latest host adjustment with the nickname', () => {
    let state = must(adjustScore(must(start(lobby())), 'p1', -100, T0));
    state = must(adjustScore(state, 'p2', 50, T0 + 10, 'duel'));
    expect(lastNotice(state)).toEqual({ seq: 1, at: T0, nickname: 'Олена', points: -100 });
  });
  ```
  У `views.test.ts`: `every role sees the last host adjustment as a notice` — після `adjustScore` у `stageView`, `playerView(…, 'p2')` і `hostView` `notice` дорівнює `{ seq: 1, at: T0, nickname: 'Олена', points: -100 }`; до коригувань — `null`.
  У `manager.test.ts`: `manager.host(room, { type: 'adjust', playerId, points: -100 })` у лобі → `{ ok: false, error: 'wrong_phase' }`; після старту → `ok`, `room.state.players[0].score === -100`.
  У `socket.test.ts`: `host:adjust` від гравця → `forbidden`; від ведучого з `points: 0` → `invalid_payload`; з `points: 1.5` → `invalid_payload`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine apps/server/src/rooms apps/server/src/socket.test.ts`. Очікується FAIL: модуля `adjust` немає.

- [ ] **Step 3: Implement.**
  - `adjust.ts`: `adjustScore` перевіряє етап, гравця, `Number.isInteger(points) && points !== 0 && Math.abs(points) <= LIMITS.maxAdjust`; `seq = state.adjustmentSeq + 1`, лічильник зберігається в стані (після вилучення гравця номер не повторюється); `afterQuestion` — кількість закритих запитань (`phase === 'question' ? plays.length - 1 : plays.length`); `roundIndex` — `state.roundIndex`. Результат проходить через `withTotals` (експортувати з `game.ts` з коментарем «внутрішня функція рушія», як `autoLock`).
  - `game.ts`: `withTotals` після циклу за записами додає `adjustmentTotal(state, player.id)`. `removePlayer` фільтрує `adjustments`. `createGame`: `adjustments: []`, `adjustmentSeq: 0`.
  - `views.ts`: у `base` — `notice: lastNotice(state)`.
  - Сервер: `case 'adjust'` у `host`; `socket.ts` — `on('host:adjust', …)` за зразком `host:kick` з `adjustSchema`.
  - `i18n.ts`: `err_points_invalid: 'Сума має бути цілим числом від −10000 до 10000, крім нуля.'`.
  - Веб-фабрики зрізів: додати `notice: null`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages apps/server/src apps/web/src
git commit -m "feat(engine): host score adjustments — any whole sum at any stage of the game, part of every total, a notice for everyone"
```

---

### Задача 2. Коригування в базі, історії й ачівках

**Files:**
- Modify: `apps/server/src/db/schema.ts` (таблиця `scoreAdjustment`, `ADJUSTMENT_ATTEMPT`)
- Create: `apps/server/drizzle/0006_score_adjustments.sql` і оновлені `apps/server/drizzle/meta/_journal.json`, `0006_snapshot.json` (генерує drizzle-kit)
- Modify: `apps/server/src/recorder.ts` (`signature`, `save`)
- Modify: `apps/server/src/history.ts` (`hostGame`, `gameTables`), `packages/shared/src/history.ts` (`GameAdjustment`, `GameDetail.adjustments`)
- Modify: `apps/server/src/testing/history-rows.ts` (`SeedPlayer.adjustments?`)
- Modify: `apps/web/src/pages/GameHistory.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css` (за потреби)
- Test: `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts`, `apps/server/src/achievements.test.ts`, `apps/server/src/db/schema.test.ts`, `apps/web/src/pages/History.test.tsx`

**Interfaces:**
- Consumes: `ScoreAdjustment`, `GameState.adjustments` (задача 1).
- Produces (`schema.ts`):
  ```ts
  /** Номер рядка в TableRow для коригування рахунку (не відповідь); у таблиці answer таких рядків немає. */
  export const ADJUSTMENT_ATTEMPT = -2;
  /** Коригування рахунку учасника поза відповідями: бали від ведучого, пізніше — дуелі. */
  export const scoreAdjustment = pgTable('score_adjustment', {
    participantId: uuid('participant_id').notNull().references(() => participant.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    roundIndex: integer('round_index').notNull(),
    afterQuestion: integer('after_question').notNull(),
    points: integer('points').notNull(),
    source: text('source').$type<AdjustmentSource>().notNull(),
  }, (table) => [primaryKey({ columns: [table.participantId, table.seq] })]);
  ```
- Produces (`shared/history.ts`):
  ```ts
  export interface GameAdjustment { roundIndex: number; afterQuestion: number; nickname: string; points: number; source: AdjustmentSource }
  // GameDetail: /** Коригування рахунку за seq; [] у старих іграх. */ adjustments: GameAdjustment[];
  ```

- [ ] **Step 1: Write the failing tests.**
  - `recorder.test.ts`: `stores host adjustments and keeps the participant score equal to the leaderboard` — гра з ведучим-акаунтом: старт, `manager.host(room, { type: 'adjust', playerId: olena, points: -100 })`, запитання з відповіддю, ще `+50` Тарасу, `end`; після `recorder.idle()`: рядки `score_adjustment` за `seq` — `[[olena, 1, 0, 0, -100, 'host'], [taras, 2, 0, 1, 50, 'host']]` (`participantId, seq, roundIndex, afterQuestion, points, source`); `participant.score` кожного = `room.state.players[…].score`; `participant.score` = сума `answer.points` + сума `score_adjustment.points`. Ще тест: `a kicked player's adjustments go with the participant` — після `kick` рядків Олени в `score_adjustment` немає.
  - `history.test.ts`: `the game detail lists adjustments by seq with nicknames; old games have none` — `seedGame` з `adjustments` → `hostGame(...).adjustments` = `[{ roundIndex: 0, afterQuestion: 0, nickname: 'Олена', points: -100, source: 'host' }]`; гра без коригувань → `[]`. `gameTables adds adjustments as rows with ADJUSTMENT_ATTEMPT` — рядок `{ roundIndex: 0, attempt: -2, accepted: false, points: -100 }` серед `rows` учасника. `history and my games match the leaderboard with adjustments` — після гри з рекордером: `hostGame(...).standings[i].score` і `playerGames(...)[0].played.score` = рахунки з `rankPlayers(room.state.players)`.
  - `achievements.test.ts`: `adjustments count for blitz rounds and comebacks but never for the final hit` — `row(1, 40)` фіналу + `{ roundIndex: 0, attempt: ADJUSTMENT_ATTEMPT, accepted: false, points: 30 }`: `hitFinal` не змінюється від рядка коригування з `points > 0` у раунді фіналу (`accepted: false`); коригування в раунді 0 робить `isComeback` хибним, якщо після нього гравець уже вів; коригування в бліц-раунді входить у `wonBlitzRound`.
  - `schema.test.ts`: `an old database migrates to score adjustments and keeps its games` — `createTestDbUpTo('0005_short_default_nicknames')`, вставити гру й учасника, `migrateRest()`, `hostGame` повертає ту саму таблицю й `adjustments: []`.
  - `History.test.tsx`: `the game history shows host adjustments under their round, also in a round without questions` — `GameDetail` з двома раундами, у другому лише коригування → під раундом 1 «Бали від ведучого: Оля −100, Петро +75», під раундом 2 заголовок раунду й «Бали від ведучого: Оля +50».

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server apps/web/src/pages`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - Схема — як в Interfaces. Міграцію згенерувати з `apps/server`: `pnpm exec drizzle-kit generate --name score_adjustments`; на початок SQL додати коментар у стилі наявних: `-- Коригування рахунку поза відповідями (план 7d): бали від ведучого, пізніше — дуелі. Старі ігри їх не мають.`
  - `recorder.ts`: у `signature` додати `state.adjustments.length` (і `adjustmentSeq`); у `save` після вставки учасника — для кожного його коригування `insert(scoreAdjustment).values(...).onConflictDoNothing()`. Коригування незмінні, тож оновлювати не треба.
  - `history.ts`: `hostGame` читає `score_adjustment` учасників гри, сортує за `seq`, мапить `nickname`; `gameTables` дочитує коригування й додає до `rows` учасника `{ roundIndex, attempt: ADJUSTMENT_ATTEMPT, accepted: false, points }`. `achievements.ts` не змінюється (лише коментар у `roundPoints`: «зі штрафними й коригуваннями»).
  - `history-rows.ts`: `SeedPlayer.adjustments?: { seq: number; roundIndex?: number; afterQuestion?: number; points: number }[]`, вставка в `score_adjustment` з `source: 'host'`.
  - `GameHistory.tsx`: для кожного раунду `adjustments.filter(a => a.roundIndex === roundIndex)`; група раунду показується, якщо є запитання **або** коригування; після `ol.rows` — `p.meta.history-adjustments` з `t('historyAdjustments', { list })`, `list` — `"${nickname} ${signed(points)}"` через «, ». Коригування з `source: 'duel'` поки так само (7g уточнить підпис).
  - `i18n.ts`: `historyAdjustments: 'Бали від ведучого: {list}'`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server packages/shared apps/web/src
git commit -m "feat(server): score adjustments are stored, listed in the game history and count for blitz wins and comebacks"
```

---

### Задача 3. Дебафи: рушій, зрізи, сервер

**Files:**
- Create: `packages/engine/src/debuffs.ts`, `packages/engine/src/game.debuffs.test.ts`
- Modify: `packages/engine/src/game.ts` (`GameState`, `createGame`, `openQuestion` ~390, `lockNow` ~600, `removePlayer`), `packages/engine/src/views.ts` (`stageView`, `playerView`, `hostView`), `packages/engine/src/index.ts`
- Modify: `packages/shared/src/game.ts`, `packages/shared/src/events.ts`, `packages/shared/src/views.ts`
- Modify: `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`
- Modify: `apps/web/src/i18n.ts` (`err_debuff_busy`)
- Modify (механічно): веб-фабрики зрізів — `debuffs: []` у сцени, `debuff: null` у `me` й у кожного гравця пульта
- Test: `packages/engine/src/views.test.ts`, `apps/server/src/rooms/manager.test.ts`, `apps/server/src/socket.test.ts`

**Interfaces:**
- Produces (`shared`):
  ```ts
  // game.ts
  export const DEBUFF_KINDS = ['shake', 'fog', 'freeze', 'mirror', 'guests', 'mud'] as const;
  export type DebuffKind = (typeof DEBUFF_KINDS)[number];
  // ErrorCode + 'debuff_busy'
  // events.ts
  export const debuffSchema = z.object({ playerId, kind: z.enum(DEBUFF_KINDS) });
  export const undebuffSchema = z.object({ playerId });
  'host:debuff': (payload: z.infer<typeof debuffSchema>, ack: Ack) => void;
  /** Скасувати дебаф, що ще чекає. */
  'host:undebuff': (payload: z.infer<typeof undebuffSchema>, ack: Ack) => void;
  // views.ts
  export interface HostPlayer extends LobbyPlayer {
    score: number;
    /** fired — діє в поточному запитанні; інакше чекає. */
    debuff: { kind: DebuffKind; fired: boolean } | null;
  }
  // HostView.players: HostPlayer[]
  // StageView: /** Гравці з дебафом, що чекає або діє; лише імена, без виду. */ debuffs: BlitzPlayer[];
  // PlayerView.me: /** Власний дебаф, лише поки діє в поточному запитанні. since — мить відкриття запитання (час сервера). */
  //   debuff: { kind: DebuffKind; since: number } | null;
  ```
- Produces (`engine`):
  ```ts
  // game.ts
  export interface DebuffState {
    kind: DebuffKind;
    /** Індекс у plays запитання, у якому дебаф спрацював; null — чекає. */
    firedAt: number | null;
    /** Мить спрацювання; null — чекає. */
    since: number | null;
  }
  // GameState: debuffs: Record<string, DebuffState>;  createGame → {}
  // debuffs.ts
  /** Етапи lobby/finished → wrong_phase; невідомий гравець → not_found; дебаф чекає або діє → debuff_busy; застарілий спрацьований перезаписується. */
  export function setDebuff(state: GameState, playerId: string, kind: DebuffKind): Result;
  /** Немає дебафу → not_found; дебаф уже діє → wrong_phase. */
  export function cancelDebuff(state: GameState, playerId: string): Result;
  /** Гравці, що відповідають на це запитання зі свого телефона (див. рішення плану). */
  export function answerersOf(state: GameState, play: Play): string[];
  /** Викликається в кінці openQuestion: прибирає застарілі спрацьовані, запускає ті, що чекають, для підключених answerersOf. */
  export function fireDebuffs(state: GameState, now: number): GameState;
  /** Викликається в lockNow: прибирає спрацьовані. */
  export function spendDebuffs(state: GameState): GameState;
  /** Дебаф, що діє зараз: firedAt === questionIndex і етап question; інакше null. */
  export function activeDebuff(state: GameState, playerId: string): DebuffState | null;
  /** Дебаф, що чекає або діє (для значка сцени й пульта); застарілий — null. */
  export function shownDebuff(state: GameState, playerId: string): DebuffState | null;
  ```
- Produces (`manager.ts`): `HostAction` + `{ type: 'debuff'; playerId: string; kind: DebuffKind } | { type: 'undebuff'; playerId: string }`.

- [ ] **Step 1: Write the failing tests** у `game.debuffs.test.ts` (гравці p1 Олена, p2 Тарас, p3 Віра; `T0 = 1_000_000`):
  ```ts
  it('a debuff waits until the next question and fires for everyone answering a classic question', () => {
    let state = must(setDebuff(must(start(lobby3())), 'p1', 'fog'));
    expect(state.debuffs.p1).toEqual({ kind: 'fog', firedAt: null, since: null });
    state = must(next(state, T0)); // перше запитання
    expect(state.debuffs.p1).toEqual({ kind: 'fog', firedAt: 0, since: T0 });
    expect(activeDebuff(state, 'p1')?.kind).toBe('fog');
    state = must(lock(state));
    expect(state.debuffs.p1).toBeUndefined();
  });
  it('one debuff per player; a waiting one can be cancelled, a firing one cannot', () => {
    const waiting = must(setDebuff(must(start(lobby3())), 'p1', 'fog'));
    expect(setDebuff(waiting, 'p1', 'mud')).toEqual({ ok: false, error: 'debuff_busy' });
    expect(must(setDebuff(waiting, 'p2', 'mud')).debuffs.p2?.kind).toBe('mud');
    expect(must(cancelDebuff(waiting, 'p1')).debuffs).toEqual({});
    const firing = must(next(waiting, T0));
    expect(cancelDebuff(firing, 'p1')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(setDebuff(firing, 'p1', 'mud')).toEqual({ ok: false, error: 'debuff_busy' });
    expect(cancelDebuff(firing, 'p2')).toEqual({ ok: false, error: 'not_found' });
    expect(setDebuff(lobby3(), 'p1', 'fog')).toEqual({ ok: false, error: 'wrong_phase' });
  });
  it('a debuff cast during a question fires in the next one', () => {
    let state = must(setDebuff(startRound(lobby3(), T0), 'p1', 'shake'));
    expect(state.debuffs.p1.firedAt).toBeNull();
    // закрити, reveal, leaderboard, наступне запитання → firedAt 1
  });
  it('a debuff waits through a cell chosen by someone else and a voice cell, fires on a blitz cell', () => {
    // boardRound: категорія з трьома клітинками — звичайна телефонна, звичайна 'voice', бліц-клітинка (kind 'blitz').
    // Порядок p1, p2, p3; дебаф на p3. p1 вибирає звичайну → p3 чекає. Наступним p2 вибирає усну → p3 чекає.
    // Далі p3 вибирає бліц-клітинку… або p1 вибирає бліц-клітинку → firedAt дорівнює індексу цього запитання для p3.
    // Окремо: дебаф на p1, p1 вибирає звичайну телефонну клітинку → спрацьовує; дебаф на p1, p1 вибирає 'voice' → чекає.
  });
  it('a disconnected target keeps the debuff for the next question', () => {
    let state = must(setDebuff(must(start(lobby3())), 'p2', 'mirror'));
    state = must(setConnected(state, 'p2', false, T0));
    state = must(next(state, T0));
    expect(state.debuffs.p2.firedAt).toBeNull();
  });
  it('blitz rounds, the final and the word chain count as answering for everyone', () => {
    // blitzRound (instant і з кнопкою), finalRound після ставок, classicRound з chain: дебаф p2 спрацьовує на відкритті.
  });
  it('a kicked player loses the debuff; ending the round mid-question leaves no stale debuff on the stage', () => {
    // removePlayer → немає ключа; endRound посеред запитання з дебафом, що діє → shownDebuff(..., 'p1') === null.
  });
  ```
  У `views.test.ts`: `only the target sees its own active debuff; the stage sees names only` — дебаф `fog` на p1, ще не спрацював: `playerView(p1).me.debuff === null`, `stageView.debuffs` = `[{ playerId: 'p1', nickname: 'Олена' }]`, `hostView.players[0].debuff` = `{ kind: 'fog', fired: false }`; після відкриття запитання: `playerView(p1).me.debuff` = `{ kind: 'fog', since: T0 }`, `playerView(p2).me.debuff === null`, `JSON.stringify(stageView(state))` і `JSON.stringify(playerView(state, 'p2'))` не містять `'fog'`; `hostView` — `fired: true`. Після `lock`: скрізь порожньо.
  `manager.test.ts`: `debuff` і `undebuff` через `manager.host` → `ok`; повторний `debuff` → `debuff_busy`. `socket.test.ts`: `host:debuff`/`host:undebuff` від гравця → `forbidden`; `kind: 'rain'` → `invalid_payload`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine apps/server/src/rooms apps/server/src/socket.test.ts`. Очікується FAIL: модуля `debuffs` немає.

- [ ] **Step 3: Implement.**
  - `answerersOf`: `play.board` є і `kind !== 'blitz'` → `answerMode === 'voice' ? [] : [chooserId]`; інакше всі `state.players`.
  - `fireDebuffs(state, now)`: видалити записи з `firedAt !== null`; для кожного, що чекає, — якщо гравець у `answerersOf(state, state.plays[state.questionIndex])` і `connected` → `firedAt = state.questionIndex`, `since = now`.
  - `openQuestion`: результат пропустити через `fireDebuffs(…, now)` (і `openFinalQuestion`, і клітинки поля йдуть через `openQuestion`; режим клітинки береться з `board` у щойно доданому `Play`). `lockNow` — `spendDebuffs`. `removePlayer` — видалити ключ.
  - Зрізи: `stageView.debuffs` — гравці в порядку `state.players`, для яких `shownDebuff` не null; `playerView.me.debuff` — з `activeDebuff`; `hostView.players[].debuff` — з `shownDebuff`, `fired: activeDebuff(...) !== null`.
  - Сервер: `case 'debuff'` → `setDebuff`, `case 'undebuff'` → `cancelDebuff`; `socket.ts` — два `on` зі схемами.
  - `i18n.ts`: `err_debuff_busy: 'На цього гравця вже наслано дебаф.'`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages apps/server/src apps/web/src
git commit -m "feat(engine): host debuffs — wait for the next question the player answers on the phone, one per player, cancel before it fires; the stage sees names only"
```

---

### Задача 4. Пульт: «Бали» й «Дебаф» біля гравця

**Files:**
- Create: `apps/web/src/screens/HostPlayerTools.tsx`, `apps/web/src/screens/HostPlayerTools.test.tsx`, `apps/web/src/debuff-meta.ts`
- Modify: `apps/web/src/screens/HostScreen.tsx` (панель гравців ~656), `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/HostScreen.test.tsx`

**Interfaces:**
- Consumes: `HostPlayer` (задача 3), `host:adjust` (задача 1), `host:debuff`/`host:undebuff` (задача 3).
- Produces:
  ```ts
  // debuff-meta.ts
  export const DEBUFF_ICONS: Record<DebuffKind, string> = { shake: '📳', fog: '🌫️', freeze: '🧊', mirror: '🪞', guests: '🐾', mud: '🟫' };
  export function debuffName(kind: DebuffKind): string; // t(`debuff_${kind}`)
  // HostPlayerTools.tsx
  export const QUICK_POINTS = [-50, -100, -200, 50, 100] as const;
  /** Розбір «Своєї суми»: «−150», «-150», «+75», « 75 » → число; 0, дроби, текст і |n| > LIMITS.maxAdjust → null. */
  export function parseAdjust(raw: string): number | null;
  export function PointsPanel(props: { player: HostPlayer; send: Send; onError: (message: string | null) => void }): JSX.Element;
  export function DebuffPanel(props: { player: HostPlayer; send: Send; onError: (message: string | null) => void }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing tests.**
  - `HostPlayerTools.test.tsx`:
    - `parseAdjust accepts signed whole numbers within the limit` — `'−150'` → −150, `'-150'` → −150, `'+75'` → 75, `' 75 '` → 75; `'0'`, `'1,5'`, `'abc'`, `''`, `'10001'` → `null`.
    - `quick buttons send the sum at once` — клік «−100» → `send('host:adjust', { playerId: 'p1', points: -100 })`; кнопки підписані «−50», «−100», «−200», «+50», «+100».
    - `the own sum is checked before sending` — поле з підписом «Своя сума» в `label.field`; «abc» + «Нарахувати» → `send` не викликано, видно «Введіть ціле число, наприклад −150 або 75.»; «−150» → `send('host:adjust', { playerId: 'p1', points: -150 })`, поле очищається.
    - `the debuff panel lists six debuffs and sends the chosen one` — шість кнопок «📳 Тремтіння екрана», «🌫️ Туман», «🧊 Заморозка», «🪞 Дзеркало», «🐾 Гості на екрані», «🟫 Брудний екран»; клік «Туман» → `send('host:debuff', { playerId: 'p1', kind: 'fog' })`; підказка «Спрацює в наступному запитанні, де гравець відповідає».
    - `a waiting debuff can be cancelled, a firing one cannot` — `debuff: { kind: 'fog', fired: false }` → «🌫️ Туман · чекає», кнопки видів вимкнені, «Скасувати дебаф» → `send('host:undebuff', { playerId: 'p1' })`; `fired: true` → «🌫️ Туман · діє», кнопки «Скасувати дебаф» немає.
  - `HostScreen.test.tsx`:
    - `points and debuff buttons appear beside each player only while the game runs` — у `lobby` і `finished` кнопок «Бали» й «Дебаф» немає; на `question` — по одній на рядок, «Вилучити» лишається.
    - `one tools panel opens at a time` — «Бали» біля Олени відкриває `PointsPanel`, «Дебаф» біля Тараса закриває першу й відкриває `DebuffPanel` Тараса; повторний клік закриває; кнопка має `aria-expanded`.
    - `the player row shows the debuff tag` — `debuff: { kind: 'mud', fired: true }` → у рядку тег «🟫 Брудний екран · діє».

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - `PointsPanel`: `div.player-tools` з `div.quick-points` (кнопки `btn btn-small`, текст через `signed()` з `format.ts`) і `form` з `label.field` («Своя сума», `inputMode="numeric"`, `autoComplete="off"`) та кнопкою «Нарахувати». Захист від подвійного дотику — як `reorder`/`decide` у `HostScreen` (`useRef`-прапорець, `finally`, запасний `setTimeout` 3 с). Помилка сервера — через `onError(errorText(...))`.
  - `DebuffPanel`: `p.meta` з підказкою; сітка кнопок `div.debuff-picks` (2 стовпці на телефоні, `disabled`, коли `player.debuff !== null`); для дебафу, що чекає, — `btn btn-danger btn-small` «Скасувати дебаф».
  - `HostScreen`: стан `tools: { playerId: string; kind: 'points' | 'debuff' } | null`; у рядку гравця, коли `live`, — кнопки «Бали» й «Дебаф» перед «Вилучити»; під рядком (`li` → вміст + панель у тому самому `li`, панель на всю ширину, `flex-basis: 100%`) — відкрита панель; тег дебафу — `span.tag.debuff-tag`.
  - `i18n.ts`: `points: 'Бали'`, `adjustCustom: 'Своя сума'`, `adjustApply: 'Нарахувати'`, `adjustInvalid: 'Введіть ціле число, наприклад −150 або 75.'`, `debuff: 'Дебаф'`, `debuffHint: 'Спрацює в наступному запитанні, де гравець відповідає.'`, `debuffWaiting: '{icon} {name} · чекає'`, `debuffFiring: '{icon} {name} · діє'`, `debuffCancel: 'Скасувати дебаф'`, `debuff_shake: 'Тремтіння екрана'`, `debuff_fog: 'Туман'`, `debuff_freeze: 'Заморозка'`, `debuff_mirror: 'Дзеркало'`, `debuff_guests: 'Гості на екрані'`, `debuff_mud: 'Брудний екран'`.
  - `styles.css`: `.player-tools`, `.quick-points` (flex, `flex-wrap: wrap`, `gap`), `.debuff-picks` (grid, `repeat(auto-fill, minmax(9rem, 1fr))`), `.debuff-tag`. На 375 px рядок гравця переноситься, сторінка не прокручується вбік.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): host console — points and debuff tools beside each player, quick sums and an own sum, cancel a waiting debuff"
```

---

### Задача 5. Сповіщення про бали й значки дебафів на сцені

**Files:**
- Create: `apps/web/src/live/LiveNotices.tsx`, `apps/web/src/live/LiveNotices.test.tsx`
- Modify: `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/StageScreen.test.tsx`, `apps/web/src/screens/PlayerScreen.test.tsx`

**Interfaces:**
- Consumes: `BaseView.notice` (задача 1), `StageView.debuffs` (задача 3).
- Produces:
  ```ts
  export const NOTICE_MS = 4000;
  /** Видиме сповіщення: нове (seq або at змінилися) і молодше за NOTICE_MS за часом сервера; ховається таймером. */
  export function useNotice(notice: AdjustmentNotice | null, offsetMs: number): AdjustmentNotice | null;
  export function AdjustmentToast(props: { notice: AdjustmentNotice | null; offsetMs: number }): JSX.Element | null;
  export function StageDebuffs(props: { debuffs: BlitzPlayer[] }): JSX.Element | null;
  ```

- [ ] **Step 1: Write the failing tests** (фальшиві таймери vitest).
  - `LiveNotices.test.tsx`:
    - `a new adjustment shows for four seconds` — `notice: { seq: 1, at: now, nickname: 'Оля', points: -100 }` → `role="status"` «Ведучий: −100 — Оля»; через 4000 мс зникає.
    - `an old adjustment after a reconnect is not shown` — `at: now − 10_000` → нічого.
    - `the next adjustment replaces the current one` — `seq: 2`, `+75`, «Петро» → «Ведучий: +75 — Петро», таймер починається заново.
    - `the notice is fixed and does not push the content` — компонент рендерить рівно один елемент `div.live-notice` без обгорток (`container.firstChild`); `position: fixed` задає `styles.css`, а відсутність зсуву перевіряє задача 8 (`boundingBox` заголовка до й після сповіщення).
    - `the stage shows a bug beside each debuffed player and nothing else` — `StageDebuffs` з Олею й Петром → `ul.stage-debuffs` з «🐞 Оля», «🐞 Петро», `aria-label` списку «Наслано дебаф»; порожній список → нічого.
  - `StageScreen.test.tsx`: `the stage shows the adjustment notice and the debuff badges in every phase` — на `question` і `leaderboard` є `.live-notice` і `.stage-debuffs`; на `lobby` (`debuffs: []`, `notice: null`) — немає.
  - `PlayerScreen.test.tsx`: `every phone shows the adjustment notice` — `notice` про іншого гравця → «Ведучий: −100 — Тарас» у телефоні Олени.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - `useNotice`: ключ `${seq}-${at}`; на зміну ключа — якщо `Date.now() + offsetMs − at < NOTICE_MS`, показати й поставити `setTimeout` на залишок; прибирати таймер при розмонтуванні.
  - `AdjustmentToast`: `div.live-notice` з `role="status"`, `aria-live="polite"`, текст `t('adjustNotice', { points: signed(points), name: nickname })`; клас `is-up`/`is-down` за знаком.
  - `StageDebuffs`: `ul.stage-debuffs` з `li` «🐞 {nickname}».
  - `StageScreen`: обидва компоненти на верхньому рівні `main` у кожній фазі (offset — з props). `PlayerScreen`: `AdjustmentToast` на верхньому рівні.
  - `i18n.ts`: `adjustNotice: 'Ведучий: {points} — {name}'`, `stageDebuffsLabel: 'Наслано дебаф'`.
  - `styles.css`: токени `--notice-bg: rgb(14 16 32 / 0.92)`, `--notice-up: var(--correct)`, `--notice-down: var(--signal)`; `.live-notice` (`position: fixed`, угорі по центру, `max-width: calc(100vw - 2rem)`, `z-index` над вмістом, рамка за знаком; поява `opacity` лише за `no-preference`); `.stage-debuffs` (`position: fixed`, правий верхній кут, колонка чипів, великий шрифт сцени).

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): stage and phones briefly show «Ведучий: −100 — Оля»; the stage shows a bug beside each debuffed player"
```

---

### Задача 6. Зона дебафу на телефоні: банер, тремтіння, заморозка, дзеркало, гості

**Files:**
- Create: `apps/web/src/motion.ts`, `apps/web/src/screens/Debuffs.tsx`, `apps/web/src/screens/Debuffs.test.tsx`
- Modify: `apps/web/src/screens/Dice.tsx` (імпорт `reducedMotion` з `../motion`), `apps/web/src/screens/PlayerScreen.tsx` (гілка `phase === 'question'` ~305), `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/PlayerScreen.test.tsx`, `apps/web/src/screens/Dice.test.tsx` (лише імпорт, якщо треба)

**Interfaces:**
- Consumes: `PlayerView.me.debuff` (задача 3), `DEBUFF_ICONS`, `debuffName` (задача 4).
- Produces:
  ```ts
  // motion.ts
  export function reducedMotion(): boolean; // тіло перенести з Dice.tsx
  // Debuffs.tsx
  export const BANNER_MS = 3000;
  export const MIRROR_SWAP_MS = 4000;
  /** 5000 мс, але не більше половини часу запитання; без таймера — 5000. */
  export function freezeMs(limitMs: number | null): number;
  /** Зсув варіантів по колу на step позицій (лише single/multi; інші типи без змін). */
  export function rotateChoices(question: PublicQuestion, step: number): PublicQuestion;
  /** Запитання для показу: під «Дзеркалом» варіанти зсуваються кожні MIRROR_SWAP_MS; інакше те саме запитання. */
  export function useDebuffQuestion(question: PublicQuestion | null, debuff: PlayerView['me']['debuff']): PublicQuestion | null;
  export function DebuffZone(props: {
    debuff: PlayerView['me']['debuff'];
    limitMs: number | null;
    offsetMs: number;
    /** Ключ запитання: стан шарів скидається з новим запитанням. */
    questionIndex: number;
    children: ReactNode;
  }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing tests** (`Debuffs.test.tsx`, фальшиві таймери; `matchMedia` — як у `Dice.test.tsx`).
  - `the zone is the same for everyone without a debuff` — `debuff: null` → `div.debuff-zone` без `data-debuff`, всередині `fieldset.debuff-content` не `disabled`, без банера й шарів.
  - `the target sees what was cast for three seconds` — `{ kind: 'fog', since: now }` → `role="status"` «На вас наслано: Туман» і підказка «Протріть екран пальцем, щоб розвіяти туман»; `data-debuff="fog"`; через 3000 мс банера немає. `since` 10 с тому (перепідключення) → банера немає.
  - `freeze unlocks after five seconds or half the time` — `freezeMs(30_000) === 5000`, `freezeMs(6000) === 3000`, `freezeMs(null) === 5000`; зона `freeze` з `since: now`, `limitMs: 30_000`: `fieldset.debuff-content` `disabled`, кнопка варіанта всередині недоступна (`toBeDisabled`), `.debuff-ice` є; через 5000 мс — `fieldset` не `disabled`, льоду немає. З `since` 4 с тому — розмерзає через 1 с.
  - `mirror rotates options and a tap still sends the option id` — компонент-обгортка з `useDebuffQuestion` і `AnswerInput` для `single` з варіантами a, b, c: спершу порядок «a b c», через 4000 мс — «b c a», ще через 4000 — «c a b»; клік по кнопці з текстом варіанта «b» → `onSubmit({ type: 'single', optionId: 'b' })`. Для `order` порядок не змінюється. Зона має клас `is-mirror`.
  - `shake and guests have calm variants under reduced motion` — `shake`: клас `is-shake`; з `matchMedia` reduce — `is-shake is-calm`. `guests`: 4 елементи `.debuff-guest` з `aria-hidden`; з reduce — клас `is-calm` на зоні.
  - `layers never catch taps` — у `guests` елементи-шари мають клас `debuff-layer` (у CSS `pointer-events: none`); клік по варіанту під шаром викликає `onSubmit`.
  - `PlayerScreen.test.tsx`: `a debuffed question wraps the answer area; other phones get the same zone without a debuff` — `onQuestion({ me: { ...me, debuff: { kind: 'mirror', since: … } } })` → `[data-debuff="mirror"]` містить `h1.question` і варіанти; без дебафу — `.debuff-zone` є, `[data-debuff]` немає, набір і порядок дочірніх елементів `main` той самий, що до зміни (знімок `main.children` класів).

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - `DebuffZone`: `div.debuff-zone` (`position: relative; overflow: hidden`) з класами `is-<kind>` і `is-calm` (коли `reducedMotion()`), `data-debuff`; усередині `fieldset.debuff-content` (`disabled` лише під час заморозки; стилі — як у `fieldset.inputs`: без рамки й відступів, `min-width: 0`) з `children`; далі шари: заморозка — `div.debuff-layer.debuff-ice` з трьома SVG-тріщинами, що проявляються на 1/3, 2/3 і в кінці (`data-stage` 0–3 оновлюється таймером); гості — 4 `span.debuff-layer.debuff-guest` з емодзі й інлайн-змінними CSS (`--lane`, `--delay`, детерміновані від `questionIndex`); банер — `p.debuff-banner` поверх (поза `fieldset`, тож не віддзеркалюється). Час — `Date.now() + offsetMs` відносно `since`.
  - `PlayerScreen`: уся гілка запитання після `question-head` і рядків клітинки (від `h1` до поля відповіді) — усередині `<DebuffZone debuff={me.debuff} limitMs={view.limitMs} offsetMs={offsetMs} questionIndex={view.questionIndex}>`; `const shown = useDebuffQuestion(question, me.debuff)` викликати на рівні екрана (до умовних гілок: хук приймає й повертає `null`) і передавати `shown` у `AnswerInput` (всі три місця) замість `question`. Ключі `AnswerInput` не змінювати: інакше зсув варіантів стер би вибране в multi.
  - `styles.css`:
    - токени `--ice: rgb(190 230 255 / 0.55)`, `--ice-line: rgb(255 255 255 / 0.85)`;
    - `.is-mirror .debuff-content { transform: scaleX(-1) }`, `.is-mirror .debuff-content input, .is-mirror .debuff-content textarea { transform: scaleX(-1) }`;
    - під `@media (prefers-reduced-motion: no-preference)`: `@keyframes debuff-shake` (3 с, рух лише в перші 20 %: `translate` ±6 px і `rotate` ±1°), `.is-shake:not(.is-calm) .debuff-content { animation: debuff-shake 3s infinite }`; `@keyframes debuff-run` (гість іде з-за лівого краю за правий за 5 с), `.debuff-guest { animation: debuff-run 5s linear var(--delay) infinite }`; тріщини й розсипання льоду;
    - `.is-calm.is-shake .debuff-content { animation: debuff-ghost 3s infinite }` (`filter: blur(1.5px)`, `opacity: 0.6` у перші 25 %, без руху — дозволено й під `reduce`); `.is-calm .debuff-guest { animation: debuff-peek 6s var(--delay) infinite; left: var(--spot) }` (лише `opacity`);
    - `.debuff-layer { position: absolute; pointer-events: none }`, `.debuff-banner { position: absolute; inset: 0 0 auto; pointer-events: none }`.
  - `i18n.ts`: `debuffCast: 'На вас наслано: {name}'`, `debuffTip_fog: 'Протріть екран пальцем, щоб розвіяти туман'`, `debuffTip_mud: 'Протріть плями пальцем'`, `debuffTip_freeze: 'Лід скоро трісне'`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): debuffs on the target phone — banner, shaking, freeze for five seconds, mirror with swapping options, running guests; calm variants for reduced motion"
```

---

### Задача 7. Туман і бруд, що стираються пальцем

**Files:**
- Create: `apps/web/src/screens/wipe.ts`, `apps/web/src/screens/wipe.test.ts`, `apps/web/src/screens/WipeLayers.tsx`, `apps/web/src/screens/WipeLayers.test.tsx`
- Modify: `apps/web/src/screens/Debuffs.tsx` (шари для `fog` і `mud`), `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `DebuffZone` (задача 6).
- Produces:
  ```ts
  // wipe.ts — чиста логіка, координати в частках зони 0…1
  export const FOG_COLS = 12;
  export const FOG_ROWS = 16;
  export type FogGrid = boolean[]; // true — туман; індекс row * FOG_COLS + col
  export function fullFog(): FogGrid;
  /** Очищає клітинки в радіусі radius клітинок від точки (x, y). */
  export function wipeFog(grid: FogGrid, x: number, y: number, radius?: number): FogGrid; // radius за замовчуванням 1.5
  export interface Splat { id: number; x: number; y: number; size: number; left: number } // left 1 → 0
  /** 6 плям у стабільних місцях для цього запитання (псевдовипадково від seed). */
  export function splatsFor(seed: number): Splat[];
  /** Кожна пляма, що містить точку, втрачає 0.2; пляма з left ≤ 0 зникає зі списку. */
  export function wipeSplats(splats: Splat[], x: number, y: number): Splat[];
  /** Слухає pointermove і touchmove (пасивні) на елементі й віддає точки в частках його розміру. */
  export function useWipe(ref: RefObject<HTMLElement | null>, onWipe: (x: number, y: number) => void): void;
  // WipeLayers.tsx
  export function FogLayer(props: { zone: RefObject<HTMLElement | null> }): JSX.Element;
  export function MudLayer(props: { zone: RefObject<HTMLElement | null>; seed: number }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing tests.**
  - `wipe.test.ts`:
    - `wiping clears fog cells around the finger and nothing else` — `wipeFog(fullFog(), 0.5, 0.5)`: клітинка центру (`row 8, col 6`) `false`, кути `true`; кількість очищених між 4 і 12; повторне стирання тієї самої точки нічого не повертає.
    - `splats are stable per question and vanish after five wipes` — `splatsFor(3)` дорівнює `splatsFor(3)`, відрізняється від `splatsFor(4)`, довжина 6, усі `x, y` в 0.1…0.9; п'ять `wipeSplats` у центр першої плями → її немає, решта на місці.
  - `WipeLayers.test.tsx` (мок `getBoundingClientRect` зони 300×400; `HTMLCanvasElement.prototype.getContext` у jsdom повертає `null` — шар має це пережити):
    - `fog covers the zone and a finger move clears it where it passes` — `.debuff-fog` з `data-cleared="0"`; `fireEvent.pointerMove(zone, { clientX: 150, clientY: 200 })` → `data-cleared` більше 0.
    - `mud splats disappear when wiped` — 6 `.debuff-splat`; п'ять рухів у центр першої → 5.
    - `fog and mud layers never catch taps` — обидва шари мають клас `debuff-layer`; клік по варіанту під шаром викликає `onSubmit`.
    - `the layers reset with a new question` — зміна `seed`/ключа → знову 6 плям, туман повний.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - `useWipe`: `addEventListener('pointermove' | 'touchmove', …, { passive: true })`, точки з `touches` теж; координати ділити на розмір зони, відкидати поза 0…1 і нульовий розмір.
  - `FogLayer`: стан `FogGrid`; `div.debuff-layer.debuff-fog` (`inset: 0`, `backdrop-filter: blur(7px)`, `-webkit-backdrop-filter`, тло `--fog`); маска: крихітний canvas `FOG_COLS × FOG_ROWS` (білий — туман, прозорий — чисто), `toDataURL()` у `mask-image`/`-webkit-mask-image` з `mask-size: 100% 100%` (м'які краї дає масштабування); оновлення маски не частіше за кадр (`requestAnimationFrame`); якщо `getContext` повернув `null` — маски немає (шар лишається суцільним, стирання видно лише в `data-cleared`). Туман не повертається.
  - `MudLayer`: `splatsFor(seed)`; кожна пляма — `svg.debuff-layer.debuff-splat` (клякса з `path`, колір `--mud`, темніший край `--mud-dark`), `opacity: left`, позиція й розмір у відсотках.
  - `DebuffZone`: для `fog` — `<FogLayer zone={zoneRef} />`, для `mud` — `<MudLayer zone={zoneRef} seed={questionIndex} />`; обидва з `key={questionIndex}`.
  - `styles.css`: токени `--fog: rgb(222 226 238 / 0.78)`, `--mud: #5b3a1e`, `--mud-dark: #3e2612`; `.debuff-fog`, `.debuff-splat`; зникання плями — `transition: opacity` лише за `no-preference`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): fog and mud on the target phone are wiped away by the finger and never block a tap"
```

---

### Задача 8. Наскрізний сценарій 7d і кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–7.
- Допоміжні функції файлу: `open`, `register`, `join`, `shot`, `click`, `field`, `expectNoSideScroll`, `snapshot`, `exact`. З `@quiz/engine/testing` — `makeQuiz`, `single`, `withId`.

- [ ] **Step 1: Add the scenario** `it('part 7d: host points with a notice everywhere, totals in the history and my games; six debuffs on the target phone only, a bug on the stage, cancel before it fires, answering still works', …)` з `try/catch` і `snapshot()`. Підготовка:
  1. Ведучий `register(host, 'host', 'Олег Ведучий', 'host7d@example.com')`; Оля — `register(olya, 'player', 'Оля', 'olya7d@example.com')` (акаунт, щоб перевірити «Мої ігри»).
  2. Вікторина «Пакості» через `host.request.post(`${base}/api/quizzes`, { data })`: класичний раунд, 7 запитань `single` (`withId(single, 'q1'…'q7')`, `timeLimit: 30`, різні тексти «Запитання 1»…), таблиця після кожного запитання — як у налаштуваннях за замовчуванням.
  3. Гра: `stage` 1600×900, `olya` 375×812, `petro` 360×740, `ira` 390×844. Приєднуються Оля, Петро, Іра.

- [ ] **Step 2: Assertions and shots** (у такому порядку; кожне запитання доводити до таблиці так само, як наявні класичні сценарії, — ведучий «Закрити запитання», «Показати відповідь», «Далі»):
  1. **Лобі.** У ведучого біля гравців немає «Бали» й «Дебаф», «Вилучити» є.
  2. **Бали.** «Почати гру» (заставка раунду). Ведучий «Бали» біля Олі → панель зі швидкими кнопками й «Своя сума»; кадр `points7d-panel-host`. «−100» → на сцені й у всіх телефонах `.live-notice` «Ведучий: −100 — Оля»; кадри `points7d-notice-stage`, `points7d-notice-phone-petro`; у шапці Олі «−100», у ведучого в рядку Олі «−100». Через 5 с сповіщення немає. Положення `h1` в Петра до й після сповіщення однакове (`boundingBox().y`).
  3. **Своя сума.** «Бали» біля Петра, «Своя сума» = `abc` → «Введіть ціле число, наприклад −150 або 75.», рахунок не змінився; `75` → «Нарахувати» → «Ведучий: +75 — Петро».
  4. **Туман (Оля) і значок.** Ведучий «Дебаф» біля Олі → кадр `debuff7d-panel-host`; «Туман» → у рядку Олі «🌫️ Туман · чекає»; на сцені `.stage-debuffs` «🐞 Оля» — кадр `debuff7d-badge-stage`. У телефоні Олі ще нічого. «Почати раунд» → в Олі `.debuff-zone[data-debuff="fog"]` і «На вас наслано: Туман» — кадр `debuff7d-fog-phone`; у Петра й Іри `.debuff-zone` без `data-debuff`, `.debuff-layer` count 0; на сцені `[data-debuff]` немає, «🐞 Оля» є. У ведучого «🌫️ Туман · діє», «Скасувати дебаф» немає. Оля веде мишею по зоні (`olya.mouse.move` кількома точками) → `data-cleared` > 0, кадр `debuff7d-fog-wiped`; Оля тисне правильний варіант → «Відповідь надіслано». `expectNoSideScroll(olya, 'debuff7d-fog-375')`. Після закриття запитання значка на сцені немає.
  5. **Тремтіння (Іра) і Заморозка (Петро)** на запитанні 2: в Іри `.is-shake` — кадр `debuff7d-shake-phone`; у Петра `fieldset.debuff-content` `disabled` і `.debuff-ice` — кадр `debuff7d-freeze-phone`; кнопка варіанта в Петра `toBeDisabled()`; через 5 с (`expect.poll`, `timeout: 7000`) кнопка доступна, Петро відповідає. Іра відповідає під тремтінням.
  6. **Дзеркало (Іра)** на запитанні 3: `.is-mirror`, обчислений `transform` `.debuff-content` починається з `matrix(-1`; порядок текстів варіантів змінюється за ≤ 5 с (`expect.poll`) — кадр `debuff7d-mirror-phone`; Іра тисне варіант за текстом правильної відповіді → після розкриття в Іри результат «правильно».
  7. **Бруд (Оля) і скасування (Петро)** на запитанні 4: перед запитанням ведучий насилає Петрові «Гості на екрані», на сцені «🐞 Петро», потім «Скасувати дебаф» → значка Петра немає, у рядку тегу немає. Запитання 4: у Петра немає `data-debuff`; в Олі 6 `.debuff-splat` — кадр `debuff7d-mud-phone`; Оля протирає першу пляму (5 рухів через її центр) → 5 плям; Оля відповідає. `expectNoSideScroll(olya, 'debuff7d-mud-375')`.
  8. **Гості зі зменшеною анімацією (Оля) і тремтіння зі зменшеною анімацією (Іра)** на запитанні 5: `olya.emulateMedia({ reducedMotion: 'reduce' })`, `ira.emulateMedia({ reducedMotion: 'reduce' })`. В Олі `.is-guests.is-calm`, 4 `.debuff-guest` — кадр `debuff7d-guests-calm-phone`; `expectNoSideScroll(olya, 'debuff7d-guests-375')`; в Іри `.is-shake.is-calm` — кадр `debuff7d-shake-calm-phone`. Обидві відповідають. Потім `emulateMedia({ reducedMotion: 'no-preference' })`.
  9. **Гості з анімацією (Петро)** на запитанні 6: `.is-guests:not(.is-calm)` — кадр `debuff7d-guests-phone`; Петро відповідає; в Олі й Іри `data-debuff` немає.
  10. **Таблиця й підсумки.** Запитання 7 без дебафів, «Завершити гру». Зчитати рахунки з фінальної таблиці сцени; кадр `points7d-final-stage`. Ведучий відкриває `/history`, гру «Пакості» → таблиця з тими самими рахунками, під раундом «Бали від ведучого: Оля −100, Петро +75» — кадр `points7d-history-host`. Оля відкриває «Мої ігри» → у грі «Пакості» рахунок Олі такий самий, як у таблиці; кадр `points7d-my-games-phone`.
  11. `expect(problems).toEqual([])`.

- [ ] **Step 3: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв. Потім той самий запуск з `E2E_SHOTS=1`. Переглянути кадри в `apps/server/e2e/artifacts/shots`:
  - панель балів і дебафів у ведучого читається на телефонній ширині, рядок гравця не ламається;
  - сповіщення помітне на сцені й телефоні та не закриває запитання надовго;
  - кожен із шести дебафів упізнаваний, а варіанти лишаються досяжними; спокійні варіанти без руху;
  - значок «🐞» на сцені не перекриває запитання й таблицю;
  - історія й «Мої ігри» показують ті самі рахунки, що й фінальна таблиця.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts
git commit -m "test: part 7d end-to-end — host points with notices and matching history, six debuffs on the target phone only, the stage bug, cancel before it fires, answering under every debuff"
```

Після фінальної рецензії гілку злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`. У звіті власникові назвати рішення: ім'я в сповіщенні не відмінюється («Ведучий: −100 — Оля», «🐞 Оля»); бали можна з заставки першого раунду до фінішу, від −10 000 до 10 000; коригування входять у «бліц-перемогу» й «камбек», але не в ідеальну гру, серію й «влучив у фінал»; межі ставок фіналу не перераховуються; дебаф чекає на усній клітинці й для відключеного гравця; заморозка — не довше половини часу запитання; дзеркало не віддзеркалює поле введення й міняє місцями лише варіанти single/multi; туман не повертається.
