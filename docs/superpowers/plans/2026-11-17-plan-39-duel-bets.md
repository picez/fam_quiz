# План 39: ставки на дуелянтів

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** Нове в стані — лише необов'язкове `DuelState.bets?`, нове значення `AdjustmentSource` `'duelbet'` і необов'язкове поле вікторини `duels.betStake?`; старий знімок не містить нічого з цього (немає `bets` — ставок не було). Ставки лежать у стані — перезапуск відновлює їх.

> **Звірка з кодом.** План спирається на `main` 2026-11-17 (`21db210d`, після плану 38):
> - дуель: `packages/engine/src/duel.ts` — етапи `declared → category → question → answer → result` (`DuelStage`, `packages/shared/src/game.ts:5`), `declareDuel` (~62), `cancelDuel` (~85), `openDuelQuestion` (~100, етап `question` — **тут ставки закриваються**), `pickDuelCategory` (~117), `settleDuel` (~161, ставка дуелянтів — два коригування `'duel'` через `adjustScore`), `skipDuelQuestion` (~175), `beginDuel` (~201), `dropDuel` (~239, також `withoutDuelists`); `DuelState` (`engine/src/game.ts` ~914); вилучення гравця й дуель (`game.ts` ~1373);
> - налаштування: `duelsSchema` (`packages/shared/src/quiz.ts` ~1587: `categories`, `questionsPerDuel`, `timeLimit`, `stake`), `LIMITS.maxDuelStake = 5000`, `defaultDuelStake = 300` (~123), `LIMITS.maxAdjust = 10_000`; редактор — `apps/web/src/editor/DuelsEditor.tsx` (поле `duelsStake` ~64), `newDuels` (`editor/draft.ts` ~903), `duelProblems` (~1855, `problemDuelSettings`), `reviveDuels` (`draft-storage.ts` ~528);
> - команди: у командній грі `state.players` — команди, `challengerId`/`opponentId` — id команд; оголошує й вибирає категорію капітан (`manager.ts` ~2162, `act(room, playerId, 'captain')`), відповідає дуелянт (`TeamAct 'duel'`, `duelistOf`, `teams.ts` ~64), `withoutDuelists` (~71); `actorOf` (`engine/src/team-act.ts` ~45);
> - автопілот: `duelMove` (`engine/src/autopilot.ts` ~240, `category` чекає `AUTOPILOT_MS.duelCategory = 15_000` після заставки), `pickCategory` (~196); `AUTOPILOT_MS` — `packages/shared/src/autopilot.ts` ~32; тестові боти — `engine/src/testing/autopilot.ts` ~431 (`declareDuel` p1 → p2, `pickDuelCategory`);
> - коригування: `adjustScore`/`addAdjustment` (`engine/src/adjust.ts`; `extra.target`), `ScoreAdjustment.target` (`game.ts` ~870, зараз «лише для debuff»), `SCORE_SOURCES` і `ADJUSTMENT_SOURCES` (`packages/shared/src/breakdown.ts`), нотатки лише для `'host'` (`lastNotice`, `adjust.ts` ~90); скасування `'duel'` → `not_allowed` (`game.undo.test.ts` ~90);
> - зрізи: `DuelInfo`/`HostDuel`/`PlayerDuel` (`packages/shared/src/views.ts` ~1439–1483), `duelInfo`/`hostDuel`/`playerDuel` (`engine/src/views.ts` ~2675–2728), `TeamView.canPickDuelist` (~3814);
> - сервер: `player:duel*` (`socket.ts` ~807–873), `manager.ts` ~1646, ~2162–2181; запис коригувань із `targetNickname` (`apps/server/src/recorder.ts` ~430), історія — `target` лише для `debuff` (`history.ts` ~775), досягнення раунду без `'duel'` (`achievements.ts` ~96), `duelist` лише з `'duel'` (`game-achievements.ts` ~185);
> - веб: `DuelView.tsx` (`DuelBanner` ~139, `DuelPlay` ~191, `DuelStage` ~331, `HostDuelPanel` ~405), `DuelistPicker.tsx`, `PlayerScreen.tsx` ~968–1061, `StageScreen.tsx` ~1086/1134, `HostScreen.tsx` ~1456; історія — `duelLines` (`pages/GameHistory.tsx` ~124); «Як грати» — сторінка `duels` (`packages/shared/src/guide.ts` ~63, `apps/web/src/guide-text.ts` ~169); довідка — `setting.duels.*` (`help/help-uk.ts` ~1087);
> - тестові помічники дуелей: `packages/engine/src/testing/duel.ts` (`duelQuiz(patch)`, `toDeclarable`, `toDuelQuestion`; Оля p1, Петро p2, Іра p3);
> - i18n: найновіші списки `ADDED_SPY`/`ADDED_SPY_PLURALS` (`apps/web/src/i18n.test.ts` ~186, перевірка локалей ~389, умова `adds no uk keys…` ~429);
> - e2e-зразки: `apps/server/e2e/part38-spy.e2e.ts` (24 гравці, світла тема, 320 px, `socketFrames`), дуелі — `part07-board-blitz-dice-duels.e2e.ts` ~2157 (`duelGame`, `DUEL_STAGE_GEOMETRY`, помічники `duelButton`, `duelAnswer` з `helpers/common`).
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

**Мета:** поки дуель оголошена й поки дуелянт вибирає категорію, усі інші гравці (у командній грі — інші команди) можуть на телефоні поставити на одного з дуелянтів і змінити вибір; вгадав переможця — +ставка, не вгадав — −ставка, нічия — 0. Розмір ставки задає автор у налаштуваннях дуелей (типово 100, 0 — вимкнено). Сцена показує, хто на кого поставив, а на підсумку — хто виграв ставку.

**Архітектура:** ставки живуть у необов'язковому `DuelState.bets` (`ставець → бік`), рушій приймає їх функцією `betDuel` у `duel.ts` на етапах `declared` і `category`; `openDuelQuestion` (перехід у `question`) їх закриває; `settleDuel` після коригувань дуелянтів дописує коригування `'duelbet'` з `target` = дуелянт, на якого ставили. Зрізи: `DuelInfo.bets` (усім — хто на кого), `PlayerDuel.bet` (свій вибір і чи можна ставити). Одна нова подія телефона `player:duel-bet`.

**Технології:** TypeScript, zod 4, vitest (проєкти `shared`/`engine`/`server`/`web`), Fastify + Socket.IO, React 19 + Vite + Testing Library, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-17-queue-37-game-design.md` — розділ 37c, «Спільні обмеження», «Лишається будівничому». Решта черги 37 — плани 37 і 38 (уже злиті).

## Глобальні обмеження

- Усі тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`; довідка — `apps/web/src/help/help-uk.ts`, `help/__fixtures__/help-uk-golden.json`, `help/help-vars.ts`, `locales/*.help.json`. Нові uk-ключі — у нових списках `ADDED_DUEL_BETS`, `ADDED_DUEL_BETS_PLURALS` у `apps/web/src/i18n.test.ts`; обидва — в умову `adds no uk keys beyond the agreed list` і в перевірку наявності в усіх локалях (як `ADDED_SPY*`). ru немає.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`).
- **Нічого, пов'язаного з росією**, — у прикладах, фікстурах, довідці, e2e (запитання дуелей у e2e — столиці не росії, хімія, природа).
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|engine|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm typecheck` (у задачах 1–4 — лише пакети, див. «Порядок збирання»). **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів): паралельні vitest/e2e на цій машині падають за пам'яттю й портами.
- e2e: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 39"`; кадри — з `E2E_SHOTS=1`.
- Таймери: час запитання дуелі у фікстурах і e2e ≥ 25 с (наявна фікстура `duels.timeLimit: 20` у рушійних тестах не змінюється — це не демо); вікно ставок в автопілоті — `AUTOPILOT_MS.duelBets = 25_000` (≥ 25 с).
- **`GAME_STATE_VERSION` лишається 22.** У коментар до `READABLE_STATE_VERSIONS` (`restore.ts`, після рядка `38 без нової версії…`) додати: «39 без нової версії: необов'язкове DuelState.bets (ставки на дуелянтів), значення AdjustmentSource 'duelbet' (target — дуелянт, на якого ставили), необов'язкове duels.betStake вікторини (немає поля — 100)». Якщо виконавцю знадобиться обов'язкове поле стану чи зміна наявного — **зупинитися й спитати контролера** (підвищення обриває живі ігри; власника треба питати перед пушем).
- Наявна поведінка дуелей (ставка дуелянтів `stake`, порядок коригувань `'duel'`, пари в `duelLines`) не змінюється: коригування ставок пишуться **після** обох коригувань дуелянтів.

## Рішення плану (там, де специфікація мовчить)

**Налаштування**
- `duelsSchema` + `betStake: z.number().int().min(0).max(LIMITS.maxDuelStake).optional()` (doc «Ставка інших гравців на дуелянта (39); 0 — ставок немає; немає поля — LIMITS.defaultDuelBetStake»). `LIMITS.defaultDuelBetStake = 100`. Помічник `duelBetStake(quiz: Quiz): number` у `quiz.ts` — `quiz.duels === undefined ? 0 : (quiz.duels.betStake ?? LIMITS.defaultDuelBetStake)`.
- **Старі вікторини з дуелями без поля отримують ставки 100** (так і означає «типово 100»). Нові дуелі в редакторі пишуть `betStake: 100` явно.

**Хто й коли ставить**
- **Ставці** (`duelBettors(state): string[]`, порядок `state.players`): соло — усі гравці, крім `challengerId` і `opponentId`; командна гра — усі команди, крім двох у дуелі (дуелі в командах є — команда проти команди, тож ставки теж є). У командній грі ставить **капітан за команду** (`actorOf(…, 'captain')`, як оголошення дуелі й вибір категорії), виграш чи програш — бали команди; інші члени команди бачать вибір команди без кнопок. Дві команди в грі → ставців немає, ставок не видно.
- Автор автопілота ставить як усі (знання відповідей не каже, хто з двох відповість швидше).
- **Вікно:** ставки приймаються, поки `duel.stage` — `'declared'` або `'category'` (на будь-якому етапі гри, зокрема поки йде звичайне запитання). **Ставки закриваються в мить, коли відкривається перше запитання дуелі** (`openDuelQuestion` → `stage: 'question'`, тобто вибір категорії гравцем, ведучим чи автопілотом), — навіть якщо таймер запитання стартує після заставки. Окремого таймера ставок у грі з ведучим немає.
- **Автопілот:** на етапі `category`, якщо ставки відкриті й є хоч один ставець, вибір категорії чекає `AUTOPILOT_MS.duelBets = 25_000` після заставки (замість `duelCategory = 15_000`); інакше — як було. Автопілот сам за гравців не ставить.
- `betDuel(state, bettorId, side: DuelSide | null)`: `null` — зняти ставку (ставити необов'язково); той самий бік ще раз — без змін, `ok`. Помилки по черзі: немає дуелі → `wrong_phase`; `duelBetStake === 0` → `duel_bets_off`; етап після `category` → `duel_bets_closed`; пауза → `paused`; невідомий ставець → `not_found`; дуелянт (чи команда-дуелянт) → `duel_bet_self`.
- **Менше балів, ніж ставка, — ставити можна; програш веде в мінус** (як правило мінуса деінде; межі ставки за рахунком немає).
- Новий гравець, що прийшов після оголошення, може ставити, поки вікно відкрите. Вилучений ставець — його ставку знято. Вилучення дуелянта, скасування дуелі ведучим, «Завершити раунд/гру» до підсумку — дуель зникає (`dropDuel`), ставки не рахуються.

**Розрахунок** (`settleDuel`, етап `result`)
- Після двох коригувань `'duel'` (якщо вони є) — для кожного ставця в порядку `state.players`, що є в грі: `winnerId === null` (нічия) → нічого; поставив на переможця → `addAdjustment(…, +betStake, now, 'duelbet', { target: winnerId })`; на переможеного → `−betStake` з `target` = той, на кого ставив. `ScoreAdjustment.target` — doc розширити: «debuff — кому куплено; duelbet — на кого ставили».
- Ставки працюють і тоді, коли `stake` дуелянтів 0. `skipDuelQuestion` без запасних запитань теж іде через `settleDuel` — ставки рахуються за тим самим правилом.
- `'duelbet'` не скасовується ведучим (`not_allowed`, як `'duel'`), не дає нотатки, у розбивці — окреме джерело `'duelbet'` одразу після `'duel'` у `SCORE_SOURCES` («Ставки на дуелі»).
- **Таблиця й історія:** бали ставок одразу в рахунку й таблиці; в історії гри — окремий рядок раунду «Ставки на дуель: Іра +100 (на Оля), Тарас −100 (на Петро)» (нікнейм як є). **Досягнення:** ставки не входять у бали раунду для досягнень раунду (як `'duel'`, `achievements.ts` ~96) і не дають `duelist`; у загальний рахунок (переможець гри) входять. Нових досягнень немає.

**Зрізи**
- `DuelSide = 'challenger' | 'opponent'` (`shared/game.ts`).
- `DuelInfo.bets: DuelBets | null` — `null`, коли `duelBetStake === 0` або ставців немає; інакше `{ stake: number; open: boolean; challenger: BlitzPlayer[]; opponent: BlitzPlayer[] }` (хто на кого, порядок `state.players`; `open` — етап `declared`/`category`). Видно всім ролям на всіх етапах дуелі (ставки відкриті, таємниці немає).
- `PlayerDuel.bet: { side: DuelSide | null; can: boolean } | null` — `null`, коли гравець не ставець (дуелянт, ставки вимкнено, немає дуелі); `side` — свій вибір (у команді — вибір команди); `can` — вікно відкрите, не пауза, і (у команді) це капітан.
- `HostDuel` успадковує `bets`; окремих полів пульта немає.

**Екрани**
- Телефон: `DuelBet` — дві кнопки з іменами дуелянтів (`aria-pressed`) і «Без ставки», підпис «Ставка: 100». Показується ставцеві на `declared` (під смугою дуелі, крім фази `question`, де телефон зайнятий відповіддю) і в `DuelPlay` на `category`. На `result` — свій рядок: «Ставка зіграла: +100» / «Ставка не зіграла: −100» / «Нічия — ставка без змін».
- Смуга `DuelBanner` на сцені й телефонах при відкритих ставках дописує лічильники «Ставки: Оля — 3, Петро — 2».
- Сцена `DuelStage`: під іменем кожного дуелянта — «Поставили: n» і імена (понад 8 — щільний вигляд `.is-many`, імена дрібніше в кілька колонок); на `question`/`answer` — лише лічильники; на `result` — «Вгадали: …  +100» і «Не вгадали: …  −100», нічия — «Нічия — ставки без змін».
- Пульт: у `HostDuelPanel` — ті самі два списки наживо.

## Порядок збирання

- Задача 1 додає обов'язкові поля в `DuelInfo`/`PlayerDuel` і нове значення `AdjustmentSource` (вичерпний `Record` у `breakdown.ts`), тож `apps/web` ламається. У задачах 1–4 перевіряються лише `pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine && pnpm exec tsc -p apps/server`; з задачі 5 — `pnpm typecheck`.
- Залежності: 2 ← 1; 3 ← 2; 4 ← 3; 5 ← 1; 6 ← 5; 7 ← 3, 5; 8 — остання.

## Фокус рев'ю

1. **Мить закриття.** Ставка на `category` за мить до вибору — прийнята; після вибору категорії (етап `question`, навіть під час заставки) — `duel_bets_closed`; вибір категорії ведучим за гравця й автопілотом закриває так само; запитання дуелі пропущено й категорія порожня — підсумок рахує ставки. Задачі 2, 3.
2. **Нічия, мінус і порядок рядків.** Нічия — жодного рядка `'duelbet'`; гравець з 0 балів програє ставку → −100; рядки `'duelbet'` стоять після пари `'duel'`, і `duelLines` історії й далі складає пару дуелянтів у один рядок. Задачі 2, 4, 5.
3. **Команди.** Ставить лише капітан команди не з дуелі; некапітан → `not_captain`, член команди-дуелянта → `duel_bet_self`; бали йдуть команді; у грі двох команд `bets === null` і автопілот не чекає 25 с. Задачі 2, 3, 4.
4. **Склад на льоту й відновлення.** Вилучений ставець — ставку знято, рядка немає; вилучений дуелянт чи скасування — ставок немає; новий гравець після оголошення ставить; знімок на `declared` і `category` після `restore` дає ті самі ставки; знімок без `bets` — порожньо, без падіння. Задачі 2, 3, 8.
5. **Вміщення.** 22 ставці на сцені 1280×720 у темній і світлій темі; телефон 320 px з довгими іменами дуелянтів у кнопках без бокового скролу; смуга з лічильниками не перекриває вміст. Задачі 7, 8.

---

### Задача 1. Спільне: `betStake`, `'duelbet'`, помилки, подія, зрізи, «Як грати»

**Files:**
- Modify:
  - `packages/shared/src/quiz.ts` — `LIMITS.defaultDuelBetStake: 100`; `betStake` у `duelsSchema`; `duelBetStake(quiz)`;
  - `packages/shared/src/game.ts` — `AdjustmentSource` + `'duelbet'` (doc «Ставка на дуелянта (39): ±betStake на підсумку дуелі; target — на кого ставили»); `export type DuelSide = 'challenger' | 'opponent'`; `ErrorCode` + `'duel_bets_off' | 'duel_bets_closed' | 'duel_bet_self'`;
  - `packages/shared/src/breakdown.ts` — `'duelbet'` після `'duel'` у `SCORE_SOURCES`, `duelbet: 'duelbet'` в `ADJUSTMENT_SOURCES`;
  - `packages/shared/src/autopilot.ts` — `duelBets: 25_000` (doc «Вибір категорії дуелі, коли відкриті ставки (39)»);
  - `packages/shared/src/events.ts`, `views.ts` — нижче;
  - `packages/shared/src/history.ts` — doc `GameAdjustment.target`: «debuff — ціль; duelbet — на кого ставили (null — вилучено)»;
  - `packages/shared/src/guide.ts` — сторінка `duels` + `bets: number` (`duelBetStake(quiz)`).
- Test: `quiz.test.ts`, `breakdown.test.ts`, тест подій (де `duelPickSchema`), `guide.test.ts`.

**Interfaces (Produces):**
```ts
// quiz.ts
export function duelBetStake(quiz: Quiz): number; // немає duels — 0; немає betStake — 100
// events.ts
export const duelBetSchema = z.object({ side: z.enum(['challenger', 'opponent']).nullable() });
/** Ставка на дуелянта (39): бік або null — зняти; лише на етапах declared і category. */
'player:duel-bet': (payload: z.infer<typeof duelBetSchema>, ack: Ack) => void;
// views.ts
export interface DuelBets {
  stake: number;
  /** Етап declared чи category: ще можна ставити. */
  open: boolean;
  challenger: BlitzPlayer[];   // хто поставив на того, хто викликав; порядок state.players
  opponent: BlitzPlayer[];
}
// DuelInfo.bets: DuelBets | null — null: ставки вимкнено або ставців немає
// PlayerDuel.bet: { side: DuelSide | null; can: boolean } | null — null: не ставець
```

- [ ] **Step 1: Write the failing tests:**
  - `quiz.test.ts`: `duels accept a bet stake` — `betStake` 0, 100, 5000 — ок; 5001, −1, 1.5 → помилка; без поля — ок; `duelBetStake`: без `duels` → 0, `duels` без поля → 100, `betStake: 0` → 0, `betStake: 250` → 250.
  - `breakdown.test.ts`: оновити очікуваний `SCORE_SOURCES` (`… 'final', 'duel', 'duelbet', 'debuff', …`); `adjustmentSource('duelbet') === 'duelbet'`; `breakdownOf([line('duelbet', 100), line('duelbet', -100)])` → частина `{ source: 'duelbet', plus: 100, minus: -100 }`.
  - Події: `duelBetSchema` приймає `{ side: 'opponent' }`, `{ side: null }`; відкидає `{ side: 'both' }`, `{}`.
  - `guide.test.ts`: вікторина з дуелями без `betStake` → сторінка `duels` має `bets: 100`; з `betStake: 0` → `bets: 0`.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану».
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 && pnpm exec tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 39 duel bets — a bet stake in the duel settings (100 by default, 0 turns bets off), a duelbet score source, a phone event and views of who bet on whom"
```

---

### Задача 2. Рушій: прийом ставок, закриття, розрахунок

**Files:**
- Create: `packages/engine/src/game.duel-bets.test.ts`
- Modify:
  - `packages/engine/src/game.ts` — `DuelState.bets?: Record<string, DuelSide>` (doc «Ставки (39): ставець (гравець чи команда) → бік; немає поля — ставок немає»); `ScoreAdjustment.target` — doc; вилучення гравця (~1373) — прибрати його ставку з `state.duel.bets`;
  - `packages/engine/src/duel.ts` — `duelBettors`, `betDuel`, `betsOpen`; розрахунок у `settleDuel` після коригувань `'duel'`;
  - `packages/engine/src/undo.ts` — `'duelbet'` не скасовується (як `'duel'`);
  - `packages/engine/src/testing/duel.ts` — `toDeclarableWith(names: string[], patch?)` (як `toDeclarable`, але з іменами; `toDeclarable` переписати через нього).
- Test: `game.duel-bets.test.ts`, `game.undo.test.ts`.

**Interfaces (Produces):**
```ts
// duel.ts
export function duelBettors(state: GameState): string[];               // id гравців (соло) чи команд, крім двох у дуелі; [] без дуелі
export function betsOpen(state: GameState): boolean;                   // дуель на declared/category, duelBetStake > 0, ставці є
export function betDuel(state: GameState, bettorId: string, side: DuelSide | null): Result;
```

- [ ] **Step 1: Write the failing tests** (`game.duel-bets.test.ts`; `toDeclarableWith(['Оля', 'Петро', 'Іра', 'Тарас'])` — p1…p4; Оля оголошує Петрові; `rng0`; помічник `score(s, id)`; `toResult(s, winner)` — як у `game.duel-play.test.ts`, але переможець — заданий дуелянт; `tie(s)` — обидва по одному запитанню):
  - `others bet while the duel is declared and while the category is picked` — на `declared` Іра → `challenger`, Тарас → `opponent` (ок); `next` → `category`; Іра змінює на `opponent` (ок); `bets` = `{ p3: 'opponent', p4: 'opponent' }`; Тарас знімає (`null`) → ключа `p4` немає.
  - `bets close when the first duel question opens` — `pickDuelCategory` → етап `question`; Іра → `duel_bets_closed` (і під час заставки, і після); вибір категорії ведучим (`playerId null`) закриває так само; на `answer` і `result` — `duel_bets_closed`.
  - `who may not bet` — Оля й Петро → `duel_bet_self`; `'p9'` → `not_found`; пауза → `paused`; `betStake: 0` → `duel_bets_off`; без дуелі → `wrong_phase`.
  - `a right bet wins the stake, a wrong one loses it` — Іра на Олю, Тарас на Петра, Оля виграє (stake дуелянтів 300): Оля +300, Петро −300, Іра +100, Тарас −100; `adjustments` по черзі: `duel` p1 +300, `duel` p2 −300, `duelbet` p3 +100 `target: 'p1'`, `duelbet` p4 −100 `target: 'p2'`.
  - `a tie changes nothing` — нічия → жодного рядка `duelbet`, бали Іри й Тараса без змін.
  - `a bet can push the score below zero` — Тарас без балів (q1, q2 неправильно: власна вікторина чи `adjustScore` вниз до 0), ставить на переможеного → −100.
  - `the bet stake is the author's` — `betStake: 250` → ±250; без поля → ±100; ставка дуелянтів `stake: 0` — ставки все одно ±100.
  - `no bet, no line` — Іра не ставила → рядка немає.
  - `a skipped duel with no questions left settles the bets` — пропуск останнього запитання категорії без запасу → `result` нічиєю чи з переможцем за виграними; ставки — за тим самим правилом.
  - `a removed bettor loses the bet, a removed duellist drops the bets` — вилучили Іру на `category` → ключа `p3` немає, рядка на підсумку немає; вилучили Петра на `category` → дуелі немає, жодного `duelbet`; `cancelDuel` на `category` → жодного `duelbet`.
  - `a late joiner may bet` — Ганна приєдналась на `declared` → ставка ок.
  - `teams: captains of other teams bet for the team` — 3 команди (помічник командної гри з `game.teams.test.ts` / `views.teams.test.ts` — звірити), команда A оголошує команді B; `betDuel(s, 'C', 'challenger')` ок; `betDuel(s, 'A', …)` → `duel_bet_self`; A виграє → команда C +100 (`target: 'A'`); з 2 командами `duelBettors` → `[]`, `betsOpen` → `false`.
  - `game.undo.test.ts`: `'duelbet'` у списку `duels, debuffs and format bonuses are not undone`.
- [ ] **Step 2: Run** `pnpm test --project engine --maxWorkers=2 packages/engine/src/game.duel-bets.test.ts packages/engine/src/game.undo.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану».
- [ ] **Step 4: Run** `pnpm test --project engine --maxWorkers=2 && pnpm exec tsc -p packages/engine`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/engine
git commit -m "feat(engine): 39 duel bets — everyone but the duellists bets until the first duel question opens, a right bet wins the stake, a wrong one loses it, a tie changes nothing; team captains bet for their team"
```

---

### Задача 3. Рушій: зрізи, автопілот, тестові боти, відновлення

**Files:**
- Modify:
  - `packages/engine/src/views.ts` — `duelInfo` → `bets` (через `betsOpen`/`duelBettors`, `blitzPlayer`); `playerDuel` → `bet` (у командній грі — вибір команди, `can` лише капітанові: звірити, яким id викликається `playerDuel` для члена команди, ~3938);
  - `packages/engine/src/autopilot.ts` — `duelMove` `category`: `betsOpen(state) ? AUTOPILOT_MS.duelBets : AUTOPILOT_MS.duelCategory`;
  - `packages/engine/src/testing/autopilot.ts` — конфіг `bet?: boolean` (типово `true`): на `declared`/`category`, до вибору категорії, кожен бот-ставець, крім `idle`, ставить: парний за індексом у `duelBettors` → `challenger`, непарний → `opponent`;
  - `packages/engine/src/restore.ts` — коментар («Глобальні обмеження»);
  - `packages/engine/src/restore.test.ts` — `'bets'` у `keysOf<DuelState>` (~453).
- Test: `views.duel.test.ts`, `autopilot.test.ts` (де `duelCategory`), `autopilot.full.test.ts`, `restore.test.ts`.

**Interfaces:** Consumes `duelBettors`, `betsOpen`, `betDuel` (задача 2); типи — задача 1.

- [ ] **Step 1: Write the failing tests:**
  - `views.duel.test.ts`: `everyone sees who bet on whom` — Іра на Олю, Тарас на Петра: сцена, телефони й пульт — `bets: { stake: 100, open: true, challenger: [{ playerId: 'p3', nickname: 'Іра' }], opponent: [{ playerId: 'p4', … }] }`; на `question` — ті самі списки, `open: false`; на `result` — ті самі.
  - `views.duel.test.ts`: `the phone knows its own bet` — Іра: `me.duel.bet = { side: 'challenger', can: true }`; на паузі `can: false`; на `question` `can: false`; Оля (дуелянт) — `bet: null`; `betStake: 0` → `bets: null` усім і `bet: null`.
  - `views.duel.test.ts` (команди): 3 команди — капітан C `can: true`, член C не капітан — `side` команди, `can: false`; члени A — `bet: null`; 2 команди — `bets: null`.
  - `autopilot.test.ts`: `bets give the category pick 25 seconds` — автопілот на `category` зі ставцями: хід о `splashEnd + 25_000`; `betStake: 0` чи гра двох — `splashEnd + 15_000`.
  - `autopilot.full.test.ts`: `duelQuiz()` з 4 ботами грається до кінця; у `adjustments` є рядки `duelbet` (ставили p3 і p4 на різні боки — сума `duelbet` = 0 при переможці, жодного при нічиї).
  - `restore.test.ts`: `a restored room keeps the duel bets` — знімки на `declared` і на `category` зі ставками → після `restore` ті самі `bets`, далі розрахунок як без перезапуску; знімок дуелі **без** `bets` (як старий) → ставки порожні, Іра може поставити; `GAME_STATE_VERSION === 22`.
- [ ] **Step 2: Run** `pnpm test --project engine --maxWorkers=2 packages/engine/src/views.duel.test.ts packages/engine/src/restore.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test --project engine --maxWorkers=2 && pnpm exec tsc -p packages/engine`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/engine
git commit -m "feat(engine): 39 duel bet views for every role, the own bet on the phone, the autopilot waits 25 s for bets before the category, test bots bet, a restart keeps the bets"
```

---

### Задача 4. Сервер: подія, запис, історія, досягнення

**Files:**
- Modify:
  - `apps/server/src/rooms/manager.ts` — `duelBet(room, playerId, side)`: `this.act(room, playerId, 'captain')` → `betDuel(room.state, who.id, side)` через `this.apply` (як `declareDuel` ~2162);
  - `apps/server/src/socket.ts` — `on('player:duel-bet')` за зразком `player:duel-category` (~813: `safeParse` → `INVALID`);
  - `apps/server/src/history.ts` (~775) — `target: targetNickname` і для `source === 'duelbet'`;
  - `apps/server/src/achievements.ts` (~96) — виключити `'duelbet'` з балів раунду (поряд із `'duel'`);
  - `recorder.ts` — без змін (уже пише `targetNickname` з `target`), перевірити тестом.
- Create: `apps/server/src/rooms/manager.duel-bets.test.ts`
- Test: `socket.test.ts`, `history.test.ts`, `achievements.test.ts` / `game-achievements.test.ts`.

- [ ] **Step 1: Write the failing tests:**
  - `manager.duel-bets.test.ts` (4 гравці, `duelQuiz()`; помічники менеджерних дуельних тестів — звірити з наявними): `bets through the socket` — `player:duel-bet { side: 'challenger' }` від Іри → сцена отримала `duel.bets.challenger` з Ірою; повтор `{ side: 'opponent' }` → переїхала; Оля → `duel_bet_self`; після `player:duel-category` → `duel_bets_closed`; `bad bodies are invalid` — `{ side: 'x' }`, `{}` → `invalid`; `a team member who is not the captain` → `not_captain`; `a restart keeps the bets` — `restart` на `category` → пульт має ті самі списки.
  - `history.test.ts`: гра з дуеллю (переможець Оля) і ставками Іри (+100 на Олю) і Тараса (−100 на Петра) → `adjustments` історії мають `{ source: 'duelbet', nickname: 'Іра', points: 100, target: 'Оля' }` і `{ … 'Тарас', -100, target: 'Петро' }`; рядки `'duel'` — без `target`, як були.
  - Досягнення: виграна ставка не дає `duelist`; бали `'duelbet'` не входять у бали раунду для досягнень раунду (гравець, що лише виграв ставку в раунді, не отримує досягнення «найкращий раунд»-типу — звірити з `achievements.ts` ~96 і взяти найближчий наявний тест).
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/rooms/manager.duel-bets.test.ts apps/server/src/history.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server
git commit -m "feat(server): 39 duel bet phone event (captains in team games), bet lines with the duellist in the history, bets kept out of round achievements"
```

---

### Задача 5. Веб: тексти, довідка, «Як грати», історія, розбивка

**Files:**
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts`, `apps/web/src/locales/{en,de,es,it,pl,ar}.json`; `help/help-uk.ts` (`setting.duels.how.3`, `setting.duels.points.1`, `setting.duels.limits.3`), `help/__fixtures__/help-uk-golden.json`, `help/help-vars.ts` (`defaultDuelBetStake`), `locales/*.help.json`; `guide-text.ts` (сторінка `duels`: рядок `guideDuelsBets`, лише `bets > 0`); `pages/GameHistory.tsx` — `duelBetLines(adjustments): string[]` поряд із `duelLines`, у тому самому місці раунду (~441).
- Вичерпні місця, які покаже `pnpm typecheck` (`scoreSource_*` за `ScoreSource`, `ErrorCode` → `err_*`), — тут; `DuelView`/`PlayerScreen` тимчасово без нового UI (з `// 39: задачі 6–7`).
- Test: `i18n.test.ts`, `help/*.test.ts`, `guide-text.test.ts`, `pages/GameHistory.test.tsx`.

**Ключі** (uk; інші 6 мов — переклади):
- `ADDED_DUEL_BETS`: `scoreSource_duelbet` «Ставки на дуелі», `err_duel_bets_off` «У цій вікторині ставок на дуелі немає.», `err_duel_bets_closed` «Ставки вже закрито — дуель почалася.», `err_duel_bet_self` «На свою дуель ставити не можна.», `duelsBetStake` «Ставка інших гравців на дуелянта», `duelsBetStakeHint` «Поки дуель не почалася, інші гравці можуть поставити на одного з дуелянтів: вгадав — +ставка, ні — −ставка, нічия — 0. 0 — ставок немає.», `duelBetTitle` «На кого ставите?», `duelBetStake` «Ставка: {stake}», `duelBetNone` «Без ставки», `duelBetTeam` «Ставить капітан за команду», `duelBetWon` «Ставка зіграла: +{stake}», `duelBetLost` «Ставка не зіграла: −{stake}», `duelBetTie` «Нічия — ставка без змін», `duelBetsTie` «Нічия — ставки без змін», `duelBetsBanner` «Ставки: {challenger} — {a}, {opponent} — {b}», `duelBetsWinners` «Вгадали: {names} +{stake}», `duelBetsLosers` «Не вгадали: {names} −{stake}», `duelBetsNobody` «Ніхто не ставив», `historyDuelBets` «Ставки на дуель: {list}», `historyDuelBet` «{name} {points} (на {target})», `guideDuelsBets` «Інші гравці можуть поставити на дуелянта: вгадав — +{stake}, ні — −{stake}.».
- `ADDED_DUEL_BETS_PLURALS`: `duelBetsCount_one` «Поставив {count}», `duelBetsCount_few` «Поставили {count}», `duelBetsCount_many` «Поставили {count}».
- Довідка: `how.3` «Поки дуель оголошена й поки вибирають категорію, інші гравці можуть на телефоні поставити на одного з дуелянтів і змінити вибір. З першим запитанням дуелі ставки закриваються.»; `points.1` «Вгадав переможця — +ставка, не вгадав — −ставка (можна піти в мінус), нічия — 0. Ставку задає автор, типово {defaultDuelBetStake}; 0 — ставок немає.»; `limits.3` «У командній грі ставить капітан команди, що не бере участі в дуелі; бали — команді.».

- [ ] **Step 1: Write the failing tests:** `i18n.test.ts` — два нові списки в усіх 7 мовах і в умові `adds no uk keys…`; ключі довідки `setting.duels.how.3`, `points.1`, `limits.3` в усіх `*.help.json`; `guide-text.test.ts` — сторінка дуелей з `bets: 100` має рядок «…+100, ні — −100.», з `bets: 0` — немає; `GameHistory.test.tsx` — `duelBetLines` з двох рядків → `['Ставки на дуель: Іра +100 (на Оля), Тарас −100 (на Петро)']` (нікнейм як є, без відмінювання), без рядків → `[]`, `target: null` → без дужок; `duelLines` тих самих коригувань (пара `'duel'` + два `'duelbet'`) — як і було, один рядок дуелі.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/i18n.test.ts apps/web/src/help apps/web/src/guide-text.test.ts apps/web/src/pages/GameHistory.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** `{target}` — нікнейм як є (відмінків не будуємо).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 39 duel bet texts and help in seven languages, a «How to play» line, bet lines in the game history, a score source label"
```

---

### Задача 6. Веб: поле ставки в редакторі дуелей

**Files:**
- Modify:
  - `apps/web/src/editor/DuelsEditor.tsx` — `NumberField` `duelsBetStake` (значення `duels.betStake ?? LIMITS.defaultDuelBetStake`) + `duelsBetStakeHint`, одразу після поля `duelsStake`;
  - `apps/web/src/editor/draft.ts` — `newDuels()` + `betStake: LIMITS.defaultDuelBetStake`; `duelProblems` — `betStake` (якщо є) у тій самій перевірці `problemDuelSettings` (`inRange(…, 0, LIMITS.maxDuelStake)`);
  - `apps/web/src/editor/draft-storage.ts` — `reviveDuels`: `betStake: number(duels.betStake, LIMITS.defaultDuelBetStake)`.
- Test: `DuelsEditor.test.tsx` (або тест редактора, де `duelsStake`), `draft.test.ts`, тест `draft-storage`.

- [ ] **Step 1: Write the failing tests:**
  - `DuelsEditor.test.tsx`: `edits the bet stake` — увімкнути дуелі → поле «Ставка інших гравців на дуелянта» показує 100; ввести 0 → `onChange` з `betStake: 0`; ввести 250 → `betStake: 250`; підказка `duelsBetStakeHint` видно.
  - `draft.test.ts`: `newDuels().betStake === 100`; `betStake: 5001` → `problemDuelSettings`; вікторина з дуелями без `betStake` — без проблеми.
  - `draft-storage`: `betStake: 'x'` → 100; без поля → 100; `0` лишається 0.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/editor`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 39 duel editor — a bet stake for the other players, 100 by default, 0 turns bets off"
```

---

### Задача 7. Веб: телефон, смуга, сцена, пульт

**Files:**
- Create: `apps/web/src/screens/DuelBet.tsx`, `apps/web/src/screens/DuelBet.test.tsx`
- Modify:
  - `apps/web/src/screens/DuelView.tsx` — `DuelBanner` дописує `duelBetsBanner` при `duel.bets?.open`; `DuelPlay` на `category` — `DuelBet` для ставця, на `result` — рядок свого ставця (`duelBetWon`/`duelBetLost`/`duelBetTie`; бік переможця — з `duel.winner` і `duel.bets`); `DuelStage` — списки під дуелянтами (`.duel-stage-bets`), на `result` — `duelBetsWinners`/`duelBetsLosers`/`duelBetsTie`; `HostDuelPanel` — ті самі списки;
  - `apps/web/src/screens/PlayerScreen.tsx` — `DuelBet` на `declared`, коли `phase !== 'question'` (поряд із `DuelistPicker`, ~1023);
  - `apps/web/src/styles.css` — `.duel-bet` (дві кнопки `minmax(0, 1fr)`, `overflow-wrap: anywhere`, «Без ставки» окремим рядком), `.duel-stage-bets` (список імен; `.is-many` понад 8 — менший шрифт і 2 колонки), `.duel-bet-result.is-won/.is-lost`; кольори — змінні теми (світла тема).
- Test: `DuelBet.test.tsx`, `DuelView.test.tsx`, `PlayerScreen.test.tsx`.

**Interfaces (Produces):**
```ts
export function DuelBet(props: { duel: DuelInfo; bet: NonNullable<PlayerDuel['bet']>; paused: boolean; send: Send; onError: (text: string | null) => void }): JSX.Element | null;
// null, коли duel.bets === null або !duel.bets.open; кнопки disabled, коли !bet.can; без can у команді — підпис duelBetTeam
```

- [ ] **Step 1: Write the failing tests:**
  - `DuelBet.test.tsx`: `two names and no bet` — «На кого ставите?», «Ставка: 100», кнопки «Оля», «Петро», «Без ставки»; клік «Петро» → `send('player:duel-bet', { side: 'opponent' })`; `side: 'opponent'` → «Петро» `aria-pressed="true"`; «Без ставки» → `{ side: null }`; `can: false` — кнопки вимкнені, у команді — «Ставить капітан за команду»; `open: false` → нічого; помилка `duel_bets_closed` показує текст; `long names fit 320 px` — нікнейми по 30 символів не ширші за контейнер.
  - `DuelView.test.tsx`: `the banner counts bets` — «Ставки: Оля — 1, Петро — 2»; `bets === null` — без рядка; `the stage lists bettors` — на `category` під Олею «Поставив 1» і «Іра», під Петром «Поставили 2» і імена; 10 імен → `.is-many`; `the stage result` — переможець Оля: «Вгадали: Іра +100», «Не вгадали: Тарас, Ганна −100»; нічия — «Нічия — ставки без змін»; ніхто не ставив — «Ніхто не ставив»; `the phone result` — Іра: «Ставка зіграла: +100», Тарас: «Ставка не зіграла: −100», нічия: «Нічия — ставка без змін»; дуелянт — без рядка; `the host sees both lists`.
  - `PlayerScreen.test.tsx`: `a bet on a declared duel` — фаза `reveal`, `declared` → `DuelBet` є; фаза `question` → немає; дуелянт — немає.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/screens`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 39 duel bet screens — two name buttons on the phone until the first duel question, bet counts in the duel banner, bettors under each duellist and who won their bet on the stage, both lists on the host"
```

---

### Задача 8. Наскрізні сценарії й кадри (`part39-duel-bets.e2e.ts`)

**Files:**
- Create: `apps/server/e2e/part39-duel-bets.e2e.ts` (структура `it(… try/catch snapshot …, 600_000)`, `useE2eServer()`, помічники `open`, `join`, `expectNoSideScroll`, `socketFrames`, `shot`, `restart`, `duelButton`, `duelAnswer` з `helpers/common`; вміщення сцени — як `expectBoardInView38` у `part38-spy.e2e.ts`, тут `expectBoardInView39`).

**Вікторина e2e:** дві класики по 3 запитання (поріг дуелі 2), дуелі: категорії «Столиці» (Франція, Італія, Польща, Іспанія), «Природа» (найбільший океан, найвища гора, найдовша річка України — Дніпро), `questionsPerDuel: 2`, `timeLimit: 30`, `stake: 300`, `betStake: 100` (у сценарії 2 — без поля); таймери звичайних запитань ≥ 25 с.

**Сценарії:**
1. `it('part 39: editor — a bet stake for the other players, 100 by default, 0 turns bets off')` — увімкнути дуелі → поле ставки 100; зберегти — `duels.betStake: 100`; ввести 5001 — проблема налаштувань дуелей, зберегти не можна; 0 — зберігається; кадр `bets39-editor`.
2. `it('part 39: duel bets — others bet and change their minds until the first duel question, the stage shows who, the result pays them, 320 px, light theme')`:
   - 5 телефонів: Оля 320 × 640, Петро 375, Іра 360, Тарас 360, Ганна 360; після 2 запитань Оля викликає Петра на `reveal`;
   - на телефонах Іри, Тараса, Ганни — «На кого ставите?» з кнопками «Оля»/«Петро»; в Олі й Петра — немає; Іра → Оля, Тарас → Петро, Ганна → Петро, потім Ганна → Оля; смуга на сцені «Ставки: Оля — 2, Петро — 1»; кадри `bets39-phone-320` (Оля — дуелянт, без ставки; окремо — Іра на 320 через `setViewportSize`), `bets39-banner-stage`; `expectNoSideScroll` для 320;
   - `next` → `category`: сцена — «Поставили 2» під Олею з іменами, «Поставив 1» під Петром; Тарас міняє на Олю до вибору (ок); Оля вибирає «Столиці» → ставка Іри після цього → помилка «Ставки вже закрито…» на телефоні; кадр `bets39-category-stage`;
   - Оля виграє обидва → `result`: сцена «Вгадали: Іра, Тарас, Ганна +100», «Ніхто не ставив»-гілки немає; телефон Іри «Ставка зіграла: +100»; таблиця: Іра +100 до свого рахунку; кадр `bets39-result-stage`, `bets39-result-phone`;
   - історія гри: рядок «Дуель: Оля +300, Петро −300» і «Ставки на дуель: Іра +100 (на Оля), …»;
   - `socketFrames` телефонів і сцени на `category` — без `accepted` запитань дуелі й без `tryTexts`; кожен телефон несе лише свій `me.duel.bet`;
   - **світла тема** (як `part38`): `quiz:theme = light`, `is-light` на `<html>`; кадри `bets39-light-stage`, `bets39-light-phone-320`; позначка вибраної кнопки має видимий контраст.
3. `it('part 39: duel bets — a tie pays nothing, a loser goes below zero, a restart keeps the bets')` — 4 гравці; Тарас з 0 балів (не відповідає) ставить на Петра; `restart()` на `category` → телефони й сцена — ті самі ставки; дуель нічиєю → жодних змін, «Нічия — ставки без змін»; друга гра (окрема кімната): Тарас на переможеного → у таблиці −100.
4. `it('part 39: teams — a captain of a third team bets for the team, two teams have no bets')` — 3 команди по 2; команда A викликає B; капітан C бачить кнопки, другий член C — «Ставить капітан за команду» без кнопок; члени A і B — без ставки; A виграє → команда C +100; окрема кімната з 2 командами — панелі ставок немає ніде.
5. `it('part 39: 24 players — bettors under the duellists stay inside 1280×720 in dark and light theme')` — 24 гравці через сокети (імена як `NAMES37`, без російського, частина — довгі до 24 символів), 22 ставлять (12 на одного, 10 на іншого); сцена 1280 × 720 на `category` і на `result`: `expectBoardInView39(stage, '.duel-stage', …)` у темній і світлій темі; телефон 320 px — кнопки з довгими іменами дуелянтів без бокового скролу; автопілот-варіант: та сама кімната з автопілотом чекає ≥ 25 с на `category` (вибір категорії не раніше 25 с після заставки); кадри `bets39-24-category-stage`, `bets39-24-result-stage`, `bets39-24-light-stage`, `bets39-24-phone-320`.

- [ ] **Step 1: Write the scenarios.**
- [ ] **Step 2: Run** `pnpm build`, потім (після завершення збирання) `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 39"` з `E2E_SHOTS=1` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 3: Переглянути кадри:** на 320 px кнопки ставок і «Без ставки» без горизонтального скролу, довгі імена переносяться; смуга дуелі не перекриває вміст; на сцені 1280×720 з 22 ставцями все вміщується; світла тема читається.
- [ ] **Step 4: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 39 — duel bet stake in the editor, bets and changes until the first duel question, bettors on the stage, a paid result, a tie, a minus, a restart, team captains, 24 players at 1280×720, 320 px, light theme"
```
