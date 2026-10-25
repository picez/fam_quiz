# План 10i: Раунд «Мільйонер» (`ladder`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 10i специфікації (розділ 13) і правила розділу 14a для «Мільйонера»: раунд ізольований, як «Ва-банк» (без дебафів, дуелей і правил раунду, між запитаннями сцена показує драбину), учасник виграє **суму рівня**, а не суму запитань, сума рівня — до 10 000 (власний ліміт). Це **третій новий тип раунду** після «Ва-банк» (10g) і «Вибування» (10h); найближчі прецеденти — їхній злитий код.
- **«Мільйонер» (`ladder`)** — новий тип раунду. Ведучий задає:
  - 5–15 запитань «один варіант», у кожному рівно 4 варіанти;
  - **суму рівня** кожної сходинки (зростає, до `LIMITS.maxLadderLevel` = 10 000);
  - **неспалимі рівні** — позначки на сходинках;
  - **як вибирається учасник:** ведучий сам, жереб або гравець з найменшими балами;
  - **підказки драбини:** 50/50, «Запитання в залі», «Підказка ведучого» — кожну окремо можна ввімкнути, кожна діє раз за драбину, незалежно від бафів вікторини;
  - **таймер на запитання** — необов'язковий (типово вимкнено).
- **Як іде.**
  - На заставці раунду обирають учасника. Ведучий вибирає сам. За жеребом чи «найменшими балами» вибір робить кнопка «Вибрати учасника», і результат зберігається в стані.
  - Учасник відповідає на запитання драбини по черзі. Запитання бачать і телефон, і сцена.
  - Перед кожним запитанням, починаючи з другого, учасник вибирає «Граю далі» або «Забрати гроші». «Забрати» дає суму останнього пройденого рівня.
  - Правильна відповідь — крок угору. Неправильна чи відсутня — учасник отримує суму останнього пройденого неспалимого рівня (0, якщо такого немає). Правильна відповідь на останнє запитання — верхній рівень.
  - Виграш іде учасникові **коригуванням рахунку з джерелом `'ladder'`**.
- **Решта гравців — «зал».** Вони бачать запитання й можуть тихо відповідати «за себе». Кожна їхня правильна відповідь дає 10 % суми рівня (заокруглено) як звичайні бали за відповідь. На учасника це не впливає. «Запитання в залі» — це підсумок відповідей залу.
- **Ізоляція (14a):**
  - бафів немає (`off_ladder`, ряд бафів на телефоні схований);
  - дебафів немає — ні від ведучого, ні з крамниці;
  - дуелей немає;
  - правил раунду немає: ні множника, ні штрафу, ні серій, ні бонусу за швидкість;
  - між запитаннями сцена показує драбину. Кнопка «Таблиця» на телефоні працює.
- **Екрани:**
  - **сцена** — класична драбина з підсвіченим поточним рівнем і неспалимими сумами;
  - **телефон учасника** — підказки й «Граю далі / Забрати» одним пальцем;
  - **телефон залу** — «відповідай за себе: +10 %»;
  - **пульт** — вибір учасника, живий стан, рішення замість учасника, запити підказки (наявний `HintRequests`).
- **Історія:** учасник, сходинка й сума рівня, використані підказки, рішення, чим скінчилася драбина, відповіді залу; виграш — рядком коригування. **Профіль:** запитання драбини, на які глядач не відповідав, не псують йому точності.
- **Довідка ведучого:** запис `round.ladder` (typecheck вимагає) і оновлені записи бафів, дебафів, дуелей і налаштувань.
- **Демо:** раунд «Мільйонер» у `party-quiz.ts` (головна `demo` уже має `LIMITS.maxRounds` = 10 раундів).

**Архітектура:**
- **Shared (`packages/shared/src/quiz.ts`, новий `ladder.ts`, `round-brief.ts`, `game.ts`, `views.ts`, `events.ts`, `history.ts`, `index.ts`).**
  - `ladderRoundSchema` (без `rules` і `speedBonus`) з `levels`, `safe`, `pick`, `lifelines`, `timer`. `ROUND_TYPES` + `'ladder'`, `LADDER_PICKS`, `LIFELINES`.
  - Ліміти: `minLadderQuestions` 5, `maxLadderQuestions` 15, `maxLadderLevel` 10 000, `ladderOptions` 4.
  - Коди вікторини: `ladder_type`, `ladder_levels`, `ladder_safe`, `ladder_lifelines`.
  - `rulesOf(ladder)` → `DEFAULT_RULES`.
  - Новий `ladder.ts`: `LADDER_PRESETS`, `ladderPresetSafe`, `ladderPrize`, `hallPoints`, типи `LadderOutcomeKind`, `LadderOutcomeInfo`.
  - `BuffBlock` + `'off_ladder'`, `AdjustmentSource` + `'ladder'`, `ErrorCode` + `'ladder_pick'`, `RoundBrief.ladder`.
  - Події: `player:lifeline { kind }`, `player:ladder { take }`, `host:ladder-pick { playerId }`, `host:ladder-decide { take }`.
  - Зрізи: `BaseView.ladder: LadderInfo | null`, `PlayerView.me.ladder`. Історія: `GameQuestionResult.ladder`.
- **Рушій (`packages/engine`).**
  - Новий `ladder.ts`:
    - учасник — вибір ведучим і жереб на `intro`;
    - відповіді учасника й залу;
    - підсумок після розкриття, рішення, виграш і коригування, зупинка;
    - підказки (50/50, зал, підказка ведучого).
  - `game.ts`:
    - `GameState.ladder?: LadderState` (лише в раунді «Мільйонер») і `Play.ladder?: LadderPlay`;
    - гілки `ladder` у `enterRound`, `openQuestion`, `nextQuestion`, `submitAnswer`, `autoLock`, `next`, `tick`, `pause`, `resume`, `endRound`, `end`, `finishRound`, `override`, `removePlayer`.
  - `timing.ts`: `timedPlay(play)` — запитання драбини без таймера, коли `round.timer === false`.
  - `buffs.ts`:
    - `off_ladder`;
    - `buffsUsed` не рахує ладдерних записів;
    - `pickRemoved` експортовано;
    - `giveHint` веде до підказки драбини.
  - `debuffs.ts` (`debuffsOff`), `duel.ts` (`duelsOff`), `quiz.ts` (`rulesOf`) — ізоляція.
  - `blitz.ts` (`nextDeadline`): кінець голосування залу.
  - `splash.ts`: «Запитання N» і для «Мільйонера».
  - `restore.ts`: **`GAME_STATE_VERSION` 8 → 9**, `READABLE_STATE_VERSIONS = [2, 3, 4, 5, 6, 7, 8, 9]`.
  - `views.ts`:
    - `LadderInfo`, `me.ladder`;
    - приховування до розкриття, підсумок залу лише після закриття;
    - драбина замість таблиці.
- **Сервер.**
  - Події й дії менеджера.
  - `PlayRef.ladder` у `recorder.ts`.
  - Деталі драбини й коригування `ladder` в `history.ts`.
  - Профіль без запитань драбини, на які глядач мовчав.
  - Помічник тестів `testing/ladder-game.ts`.
  - Демо в `party-quiz.ts`.
- **Веб.**
  - Спільна драбина `LadderBoard` (сцена, пульт, телефон).
  - Телефон: `LadderLifelines`, `LadderDecision`, `LadderHall`.
  - Сцена: питання з драбиною, підсумок залу, рішення й результат.
  - Пульт: `HostLadder` з вибором учасника, рішенням замість учасника й «ⓘ».
  - Історія.
  - Редактор: п'ять запитань по 4 варіанти, таблиця рівнів і неспалимих позначок, вибір учасника, підказки, таймер.
  - Довідка.

**Технології:** TypeScript, zod 4, vitest, Drizzle ORM (PGlite у тестах), Fastify + Socket.IO, React 19 + Vite, Testing Library (jsdom), Playwright. Нових залежностей немає.

**Специфікація:** `docs/superpowers/specs/2026-10-24-new-formats-design.md`:
- розділ 13 (частина 10i);
- розділ 14a:
  - «“Ва-банк” і “Мільйонер” ізольовані» — без дебафів, дуелей і правил раунду, драбина замість таблиці, «Таблиця» на телефоні працює;
  - «“Мільйонер”. Учасник виграє суму рівня, а не суму всіх запитань. Сума рівня — до 10 000 балів (окремий ліміт). Звичайний ліміт ціни (2000) тут не діє»;
  - «деплой»;
- розділ 14, пункт 5 («Мільйонер» у командах — 10j, тут не робимо);
- розділ 2: анти-цілі «правильна відповідь потрапляє на телефон чи сцену раніше розкриття», «старі вікторини змінюють бали», «живі ігри обриваються деплоєм»;
- розділ 3: нове поле має типове значення; телефон — один палець, вузький екран;
- розділ 5, пункт 5: кожен тип раунду має запис у довідці;
- розділ 17: «“Мільйонер”: власні три підказки; глядачі отримують 10 % ціни».

Зразки — злитий код і плани `docs/superpowers/plans/2026-10-24-plan-10g-wipeout.md`, `docs/superpowers/plans/2026-10-25-plan-10h-survival.md`:
- **«Ва-банк» (10g):**
  - shared: `wipeoutRoundSchema`, `wipeout_type`, `off_wipeout`, `deciding`;
  - рушій: `packages/engine/src/wipeout.ts` (`submitWipeoutAnswer`, `decisionOpen`, `decideWipeout`, `markWipeoutEnd`, `wipeoutPlayOf`, `dropUnstarted`);
  - ізоляція: `debuffsOff` (`debuffs.ts`), `duelsOff` (`duel.ts`), `placeBlock` (`buffs.ts`), `rulesOf`;
  - зрізи: `wipeoutInfo`, `playerWipeout`, `publicStandings`, `liveTable` у `views.ts`;
  - сервер: `manager.wipeout`, `socket.ts` (`player:wipeout`), `recorder.ts` (`signature`, `PlayRef.wipeout`), `history.ts` (`wipeoutResult`, `unplayedWipeout`), `testing/wipeout-game.ts`;
  - веб: `WipeoutLadder`, `WipeoutDecision`, `HostWipeout`, `StageScreen` (`WipeoutBetween`), `HostScreen` (`DecidingLabel`), `GameHistory` (`wipeoutLines`);
  - редактор: `RoundSettings.tsx` (блок `wipeout` з «ⓘ»), ціни в списку запитань `QuizEditor.tsx`.
- **«Вибування» (10h):**
  - коригування-бонус `awardSurvivalBonus` (ідемпотентно, `source 'survival'`);
  - `Play.survival` і `KEYS[8]` у `restore.test.ts`;
  - `HostSurvival`, `unplayedSurvival`, `testing/survival-game.ts`;
  - сценарій `survivalGame` у `apps/server/e2e/full-game.e2e.ts`.
- **Бафи 8b (`packages/engine/src/buffs.ts`):**
  - `fiftyCount`, `pickRemoved` (зараз приватна), `voteTally`, `AUDIENCE_MS`, `grantOvertime`, `giveHint`, `shiftBuffClocks`;
  - у зрізах: `playerHint`, `voteClock`, `hintRequests` (`HostView.hints`);
  - у вебі: `Buffs.tsx` (`VoteResults`, `HintRequests`, `BuffPanel`), `AnswerInput` (проп `removed`).
- **Коригування (9c):** `addAdjustment`, `afterQuestionNow` у `packages/engine/src/adjust.ts`; `AdjustmentSource`; рядки коригувань в історії.
- **Помічники тестів:**
  - `testing/fixtures.ts`: `wipeoutRound`, `makeRoundsQuiz`, `single`;
  - `testing/helpers.ts`: `lobbyWith` дає `p1`, `p2`, …; `must`, `startRound`, `lobbyWithSplash`;
  - `restore.test.ts`: `STATE_SHAPE`, `KEYS`, `representative`.
- **Тести наборів вікторин:** `apps/server/scripts/compass-quiz.test.ts`, `horizon-quiz.test.ts` (`LATER_ROUND_TYPES`); `demo-quiz.test.ts` (унікальність текстів між вікторинами).

**Рішення плану там, де специфікація мовчить (і рішення координатора):**

*Дані*
- Схема раунду:
  ```ts
  {
    id, type: 'ladder', title, description?, shuffleOptions: boolean,
    questions: Question[];          // 5…15, лише 'single' з рівно 4 варіантами
    levels: number[];               // сума рівня кожної сходинки: стільки ж, скільки запитань, строго зростає, 1…10 000
    safe: number[];                 // неспалимі сходинки (0-базові індекси), без повторів, кожна < questions.length − 1
    pick: 'host' | 'random' | 'lowest';
    lifelines: ('fifty' | 'audience' | 'hint')[];  // увімкнені підказки, без повторів; [] — без підказок
    timer: boolean;                 // true — таймер на запитання (timeLimit кожного); false — без таймера
  }
  ```
  - **Рівень належить сходинці, а не запитанню:** запитання на позиції k грає за `levels[k]`. Ціна запитання (`question.points`) у драбині не важить. Редактор ставить їй 0 і ховає поле. *Рішення:* ліміт ціни 2000 лишається для всіх інших типів без змін; рівні мають власний ліміт 10 000 (14a).
  - Верхня сходинка неспалимою не позначається: після неї виграш і так верхній.
  - Коди вікторини:
    - `ladder_type` — запитання не `single` або варіантів ≠ 4;
    - `ladder_levels` — довжина `levels` ≠ кількості запитань або рівні не зростають строго;
    - `ladder_safe` — повтор або індекс ≥ `questions.length − 1`;
    - `ladder_lifelines` — повтор.
    - Відео й аудіо в запитаннях дозволені, як у класиці. Картинка, що проявляється, заборонена наявним `reveal_place`.
  - `LIFELINES = ['fifty', 'audience', 'hint'] as const satisfies readonly BuffKind[]`: ті самі назви й значки, що в бафів, а механіка — 8b.
  - Нові поля мають типові значення лише в редакторі: старих раундів `ladder` не буває, тож `.default()` у схемі не потрібен.
- **Пресети рівнів** (`LADDER_PRESETS` у shared, буквальна таблиця, звіряється тестом):
  ```
  5:  100, 300, 1000, 3000, 10000
  6:  100, 250, 600, 1500, 4000, 10000
  7:  100, 200, 500, 1000, 2000, 5000, 10000
  8:  100, 200, 400, 700, 1500, 2500, 5000, 10000
  9:  100, 200, 300, 600, 1000, 2000, 3000, 6000, 10000
  10: 100, 150, 300, 500, 800, 1500, 2000, 4000, 6000, 10000
  11: 100, 150, 250, 400, 600, 1000, 1500, 2500, 4000, 6000, 10000
  12: 100, 150, 250, 400, 500, 800, 1000, 2000, 3000, 4000, 7000, 10000
  13: 100, 150, 200, 300, 500, 700, 1000, 1500, 2000, 3000, 5000, 7000, 10000
  14: 100, 150, 200, 300, 400, 600, 800, 1000, 1500, 2500, 3000, 5000, 7000, 10000
  15: 100, 150, 200, 250, 400, 500, 700, 1000, 1500, 2000, 2500, 4000, 5000, 7000, 10000
  ```
  - `ladderPresetSafe(levels)` — індекси першого рівня ≥ 1000 і першого рівня ≥ 5000, без верхньої сходинки й без повторів. Приклад: для 5 сходинок — `[2]`.

*Учасник*
- `GameState.ladder?: LadderState` — `{ contestantId: string | null; drawn: boolean }`. Ключ є **лише** в раунді «Мільйонер», від `intro` до `round_end` (і на `finished`, якщо раунд останній). `enterRound` прибирає ключ, що лишився від попереднього раунду, і ставить `{ contestantId: null, drawn: false }` на вході в «Мільйонер».
  - *Рішення:* ключ необов'язковий, бо стан версій 2–8 його не має, і ці версії мають лишитися читабельними (див. «Формат стану»).
- **Вибір на `intro`:**
  - `pickContestant(state, playerId)` (подія `host:ladder-pick`) — у будь-якому режимі, поки не відкрито перше запитання. Ставить `drawn: false`. Помилки:
    - `wrong_phase` — не `intro` раунду «Мільйонер»;
    - `paused`;
    - `not_found` — немає гравця;
    - `target_offline` — гравець не на зв'язку.
  - `next` на `intro` без учасника:
    - `pick 'host'` → `fail('ladder_pick')`;
    - `random` → жереб: `rng` серед присутніх гравців;
    - `lowest` → найменший рахунок серед присутніх; рівні розводить `rng`.
    - `drawn: true`, етап лишається `intro`: сцена показує, хто йде на драбину.
    - Рівно **один** виклик `rng`, навіть без нічиєї: детерміновано для тестів і e2e.
    - Присутніх немає → `fail('no_players')`.
  - `next` на `intro` з учасником → перше запитання (`advance`). Після цього вибір змінити не можна.
  - *Рішення:* жереб окремим натиском дає драматичну паузу й не вимагає `rng` у `start` чи `enterRound`. Результат лежить у стані, тож перезапуск сервера нічого не змінює.
- Учасник — один на раунд. Кілька учасників — кілька раундів «Мільйонер» (специфікація).
- **Учасника вилучили** (`removePlayer`):
  - на `intro` → `contestantId: null`, `drawn: false`;
  - посеред драбини → підсумок `stopped` з 0 і без коригування. Запитання, що йде, зал дограє; після розкриття — сторінка драбини з підсумком, далі `round_end`.

*Запитання драбини*
- `openQuestion` у «Мільйонері» додає `Play.ladder`:
  ```
  {
    contestantId,
    step,               // = кількість уже зіграних запитань раунду
    level: round.levels[step],
    timed: round.timer,  // знімок: timedPlay(play) читає його без стану
    lifelines: {},
    decision: null,
    outcome: null,
  }
  ```
  - Варіанти — `present` з `round.shuffleOptions`, як завжди.
  - **Таймер:** `timedPlay(play)` = `isTimed(play.question) && play.ladder?.timed !== false`. Його беруть `limitMsOf`, `timeOver`, `timeOverFor` (timing.ts), `endsAt` в `openQuestion`, гілка «без таймера» в `resumeClock`, `timeLimit` у `publicQuestion` зрізу. Решта місць з `isTimed(question)` не стосується драбини (бліц, поле, заміна) — лишити без змін.
- **Відповідь учасника** — той самий `player:answer`. Запис звичайний: `accepted`, `accuracy` 1/0, `grade` correct/wrong за `checkAnswer`; `basePoints = points = 0`, `streakBonus 0`.
  - *Рішення:* відповіді учасника **рахуються в точність** як звичайні відповіді, але з 0 балів. Виграш іде окремо, коригуванням.
- **Відповідь залу** (будь-хто, крім учасника) — запис звичайний: `points = correct ? hallPoints(level) : 0`, де `hallPoints(level) = Math.round(level / 10)`. Без множника, штрафу, швидкості й серій. Рахується в точність.
  - Помилки, як у класиці: `already_answered`, `time_over`, `type_mismatch`.
  - Після закриття голосування залу (див. підказки) нові відповіді залу → `vote_closed`. *Рішення:* інакше той, хто чекав, списав би з підсумку на сцені.
- `autoLock` у «Мільйонері»: закривається, коли відповів учасник **і** відповіли всі присутні глядачі. Учасника немає на зв'язку → автозакриття немає, закриє ведучий («Закрити») чи таймер. Мовчання учасника = неправильна відповідь.
- Сумарний час (`totalTimeMs`) рахує лише класика — драбина не входить.
- **Оцінка ведучого** на `reveal` — як у «Ва-банк»: `correct` / `wrong`; `partial` → `partial_disabled`. Для залу бали — `hallPoints` або 0; для учасника — 0. Підсумок драбини фіксується лише на «Далі», тож оцінка учасника його змінює.

*Після розкриття: етап `leaderboard` завжди*
- `next` з `reveal` у «Мільйонері» (до перевірки «запитань більше немає»): `settleStep(state, now)`.
  - Учасник правильно, сходинка не остання → `leaderboard` з відкритим рішенням (`decision: null`), без таймера.
  - Учасник правильно на останній → підсумок `top` (`points = levels[last]`).
  - Учасник неправильно чи мовчав → підсумок `wrong`: найвищий неспалимий рівень серед пройдених сходинок, інакше 0.
  - Учасника вже вилучено → підсумок `stopped`, 0.
  - Підсумок пишеться в `Play.ladder.outcome = { kind, passed, points }`, де `passed` — скільки сходинок пройдено. Тоді ж додається коригування (див. «Виграш»).
- Налаштування `leaderboard: 'each' | 'end'` тут не важить: драбина — серце раунду, як у «Ва-банк».
- `next` з `leaderboard`:
  - підсумок є → `finishRound`;
  - рішення не ухвалене → `fail('deciding')` (наявний код);
  - `decision 'go'` → `advance` (наступне запитання).
- **Рішення** (`decideLadder(state, by, take, now)`; `by` — id гравця або `'host'`):
  - Помилки:
    - `wrong_phase` — не `leaderboard` «Мільйонера», рішення не відкрите чи вже є підсумок;
    - `paused`;
    - `not_allowed` — гравець не учасник;
    - `already_answered` — уже вирішено.
  - `take` → `decision 'take'`, підсумок `took` (`points = levels[step]`), коригування.
  - Інакше → `decision 'go'`.
  - Ведучий вирішує замість учасника (подія `host:ladder-decide`): учасник сказав уголос або випав зі зв'язку. *Рішення:* без таймера рішення, бо в «Мільйонері» думати над грошима — частина шоу, а ведучий завжди може вирішити сам.
- Рішення до першого запитання немає: за специфікацією «Забрати» можна з другого.

*Виграш*
- `ladderPrize(levels, safe, passed, kind)` (shared, чиста):
  - `took`, `top`, `stopped` → `passed > 0 ? levels[passed − 1] : 0`;
  - `wrong` → `levels[max(s ∈ safe, s < passed)]`, інакше 0.
- **Коригування** `addAdjustment(state, contestantId, points, now, 'ladder')`, коли фіксується підсумок, якщо `points > 0`. **Ідемпотентно:** якщо коригування `source 'ladder'` цього раунду вже є, нове не додається. Учасника немає серед гравців → без коригування.
  - *Рішення:* коригуванням, бо виграш — сума рівня, а не сума записів. «Рахунок = сума записів + коригування» тримається; рядок коригування вже йде в історію й таблицю рахунку без нових колонок. `LIMITS.maxAdjust` (10 000) обмежує лише ведучого (`adjustScore`), а `addAdjustment` не перевіряє, і 10 000 у межах.
- **Зупинка** (`stopLadder(state, now)` у `finishRound` і `end`; і в `endRound` до `lockNow`). Якщо підсумку ще немає:
  - на `question` (відкрите запитання) → `stopped`, пройдене до цього запитання. Відкрите запитання для учасника не рахується; зал свої бали за нього отримує, як у класиці при «Завершити раунд»;
  - на `locked` чи `reveal` → як `settleStep` (результат запитання рахується);
  - на `leaderboard` з відкритим рішенням → `took` (учасник забирає пройдене);
  - на `intro` (драбина не почалася) → нічого.
  - *Рішення:* «Завершити раунд» = «учасник забирає те, що вже має»; ніхто не втрачає виграного через ведучого.

*Підказки драбини*
- Хто й коли: лише учасник, на етапі `question`, ще не відповів, не пауза, заставка скінчилась, час не сплив; підказка ввімкнена в раунді й ще не використана на цій драбині. Використані = ключі `Play.ladder.lifelines` записів цього раунду.
  - **Кілька підказок на одне запитання можна** (як у телешоу).
  - Помилки `useLifeline(state, playerId, kind, now, rng)`, за порядком:
    - `wrong_phase` — не запитання «Мільйонера»;
    - `not_found` — немає гравця;
    - `not_allowed` — не учасник або підказку не ввімкнено;
    - `buff_used` — уже була на цій драбині;
    - `paused`; `not_started`; `already_answered`; `time_over`;
    - `buff_unfit` — зал без жодного присутнього глядача.
  - Бафи вікторини (`allowedBuffs`) і `buffsUsed` тут не важать. `buffsUsed` не бачить підказок драбини, бо вони лежать у `Play.ladder.lifelines`, а не в `Play.buffs`.
- **50/50:** `removed = pickRemoved(question, rng)` (експортувати з `buffs.ts`). З 4 варіантів прибирає 2 неправильні (`fiftyCount` = 2). Прибрані бачать **усі** (сцена, пульт, телефони), як у телешоу. Відповідь прибраним варіантом рушій приймає як неправильну, а телефон таких не пропонує.
- **«Запитання в залі»:** `audience = { endsAt: now + AUDIENCE_MS, closed: false, ballots: {}, at: now }`. Учасник за увімкненого таймера отримує `grantOvertime(…, AUDIENCE_MS)`, як баф 8b.
  - Голосами є **відповіді залу «за себе»** (і ті, що вже були до підказки). Окремого голосування немає.
  - **Закриття** (`closeAudience`): у мить закриття `ballots` = відповіді глядачів із `play.answers`, `closed: true`. Закривають:
    - `tick` з `endsAt` включно;
    - відповідь останнього присутнього глядача;
    - відповідь учасника;
    - `lockNow`.
  - Пауза зупиняє відлік (`shiftLadderClocks` на `resume`, як `shiftBuffClocks`). `nextDeadline` дає `endsAt` голосування.
  - Що видно: до закриття — лише «проголосували N з M», і це всім. Після — `voteTally(question, ballots)` усім: учасникові, сцені й залу.
  - Після закриття глядачі вже не відповідають (`vote_closed`).
- **«Підказка ведучого»:** `hint = { text: question.hint ?? null, aloud: false, at: now }`.
  - Без підказки з редактора ведучий бачить запит у наявному `HostView.hints` (`hintRequests` додає запит учасника драбини) і відповідає наявним `host:hint`. `giveHint` у «Мільйонері» веде до `Play.ladder.lifelines.hint`.
  - Текст бачать лише учасник і пульт. Сцена бачить «💡 підказку використано», а «Підказав уголос» — лише позначку.
- Історія зберігає, які підказки взято, прибрані варіанти, підсумок залу й текст підказки.

*Ізоляція (14a)*
- **Бафи:** `placeBlock` → `off_ladder`; `buffRowHere` → `false` у «Мільйонері» (ряд бафів схований: учасник має підказки драбини, залу ряд не потрібен); `takeBuff` → `wrong_phase`.
- **Дебафи:** `debuffsOff` → `true` і для «Мільйонера» (крім `round_end`): `setDebuff` → `not_allowed`, крамниця `shopBlock` → `'phase'`, дебаф, що чекає, спрацює в наступному раунді (`fireDebuffs` уже дивиться на `debuffsOff` — перевірити тестом).
- **Дуелі:** `duelsOff` → `true` і для «Мільйонера» (крім `round_end`). Оголошена раніше дуель стартує на `round_end`. Запитання драбини в поріг дуелей входять, як і раніше.
- **Правила раунду:** `rulesOf(ladder)` → `DEFAULT_RULES`. Швидкості немає (`speedOn` → false), серій немає.
- **Таблиця:** на `leaderboard` у «Мільйонері» `standings` сцени й телефона — `null` (драбина). `table` телефона (кнопка «Таблиця») — як у «Ва-банк». На `round_end` — звичайна таблиця.
- **Коригування ведучим** (`host:adjust`) діє, як завжди.

*Що видно (анти-ціль «нічого раніше розкриття»)*
- `LadderInfo` (задача 5) — від `intro` до `round_end` раунду «Мільйонер» (і `finished`, якщо він останній).
- На `question` і `locked`:
  - правильної відповіді немає ніде, крім пульта;
  - вибір учасника (`contestantPick`) — лише з `locked` (на `question` зал міг би списати), пульт — наживо;
  - правильність відповідей залу (`hall.right`) — `null`;
  - підсумок залу — лише після закриття голосування.
- На `reveal`: правильність, `hall.right`, бали залу.
- Підсумок драбини (`outcome`) — лише з `leaderboard`.

*Формат стану й деплой*
- **`GAME_STATE_VERSION` 8 → 9.** Нові необов'язкові ключі `GameState.ladder?: LadderState` і `Play.ladder?: LadderPlay` (задача 2). Нові значення, а не ключі: `AdjustmentSource 'ladder'`. Решта ключів `GameState` ті самі.
- **`READABLE_STATE_VERSIONS = [2, 3, 4, 5, 6, 7, 8, 9]`.** Зміна лише адитивна, а стан версій 2–8 не може містити раунду «Мільйонер» (і ключа `ladder`). Кімнати, збережені до розгортання, відновлюються: **пуш не обриває живих ігор**, тож перевірку `live_room` за 14a можна не робити. Звіт власникові має назвати це явно.
- **Міграцій немає:**
  - раунд лежить у jsonb `quiz.rounds`;
  - відповіді учасника й залу — у наявних рядках `answer`;
  - `PlayRef.ladder` — у jsonb `game.plays`;
  - виграш — рядок коригування; колонка `source` — `text` з `$type<AdjustmentSource>()`, без enum у базі.

*Демо*
- Головна `demo-quiz.ts` уже має `LIMITS.maxRounds` = 10 раундів, і жоден з них не дублює інший формат. Тому раунд «Мільйонер» іде в **`party-quiz.ts`** (зараз 8 раундів → 9) перед `p-final`.
  - Опис вікторини: «Дев'ять раундів: … “Мільйонер” …».
  - Тексти запитань не повторюють інших вікторин: це перевіряють наявні тести `demo-quiz.test.ts` і `compass-quiz.test.ts`.

*Чого не робимо*
- «Мільйонер» у командах (10j);
- нового досягнення;
- таймера на рішення «Граю далі / Забрати»;
- зміни учасника після першого запитання;
- голосування залу окремо від відповідей «за себе»;
- нової заставки (діє «Запитання N»).

## Глобальні обмеження

- Рушій чистий: жодного годинника й `Math.random`; усе від `now` і `rng`.
- **Ніщо не видає правильну відповідь раніше розкриття.** На `question` і `locked` зрізи сцени й телефонів не мають `correctId` запитання драбини, правильності залу й підсумку драбини. Вибір учасника видно з `locked`. Тести задачі 5 — через `JSON.stringify(view)`, e2e — через кадри сокета (`socketFrames`, `framesBeforeReveal`).
- **Старі вікторини й бали не змінюються.** Наявні тести класики, бліцу, поля, фіналу, «Ва-банк», «Вибування», бафів (зокрема 50/50, залу й підказки ведучого 8b), дебафів, дуелей, серій, сумарного часу й відновлення лишаються зеленими без змін (крім навмисних, див. «Порядок збирання»).
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`, тексти довідки — лише в `apps/web/src/help/*.ts`.
- Телефон 375 px:
  - без горизонтальної прокрутки, кнопки ≥ 44 px;
  - три підказки в один ряд;
  - «Граю далі» і «Забрати {sum}» — великі, одна під одною.
- Сцена 1280 × 720: запитання з 4 варіантами й драбина до 15 сходинок поруч, без прокрутки.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом — зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2`. Якщо PGlite падає з браком пам'яті, запускати окремо:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=1 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- Наскрізні тести: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts`.
  - **Повний прогін триває близько 12 хвилин:** запускати у фоні й чекати завершення.
  - Кадри — в `apps/server/e2e/artifacts/shots`, префікс 10i — `p10i-`.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать. Живі ігри пуш не обриває: `READABLE_STATE_VERSIONS` містить 8.

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/{quiz.ts,ladder.ts(новий),round-brief.ts,game.ts,index.ts}`, `quiz.test.ts`, новий `ladder.test.ts`, `packages/engine/src/round-brief.test.ts` | схема раунду, ліміти, пресети, коди, `off_ladder`, `ladder_pick`, `'ladder'`, бриф | 1 |
| `apps/web/src/{guide-text.ts,round-summary.ts,format.ts,i18n.ts}`, `help/rounds.ts`, `editor/{draft.ts,draft-storage.ts,QuizEditor.tsx,RoundSettings.tsx}`, `apps/server/scripts/{compass,horizon}-quiz.test.ts` + `round-summary.test.ts`, `draft.test.ts` | прохід typecheck | 1 |
| `packages/engine/src/{ladder.ts(новий),game.ts,timing.ts,splash.ts,restore.ts,index.ts}`, `testing/fixtures.ts`, новий `game.ladder.test.ts`, `restore.test.ts` | учасник, відповіді, 10 %, без таймера, підсумок, рішення, виграш, версія 9 | 2 |
| `packages/engine/src/{ladder.ts,buffs.ts,game.ts,blitz.ts}`, новий `game.ladder-lifelines.test.ts` | 50/50, зал, підказка ведучого; пауза, тік, дедлайн | 3 |
| `packages/engine/src/{buffs.ts,debuffs.ts,duel.ts}`, `packages/shared/src/quiz.ts` (`rulesOf`), новий `game.ladder-isolation.test.ts` | бафи, дебафи, дуелі, правила | 4 |
| `packages/shared/src/views.ts`, `packages/engine/src/views.ts`, новий `views.ladder.test.ts`, фабрики зрізів у тестах вебу | `LadderInfo`, `me.ladder`, приховування | 5 |
| `packages/shared/src/{events.ts,history.ts}`, `apps/server/src/{rooms/manager.ts,socket.ts,recorder.ts,history.ts,db/schema.ts,testing/ladder-game.ts(новий)}`, `apps/server/scripts/{party-quiz.ts,demo-quiz.test.ts}` + тести | події, історія, профіль, демо | 6 |
| `apps/web/src/screens/{LadderBoard,LadderLifelines,LadderDecision,LadderHall}.tsx` (нові), `PlayerScreen.tsx`, `Buffs.tsx` (експорт `VoteResults`), `i18n.ts`, `styles.css` + тести | телефон і спільна драбина | 7 |
| `apps/web/src/screens/{StageScreen,HostScreen,HostLadder(новий)}.tsx`, `pages/GameHistory.tsx`, `i18n.ts`, `styles.css` + тести | сцена, пульт, історія | 8 |
| `apps/web/src/editor/{QuizEditor,RoundSettings,QuestionEditor}.tsx`, `draft.ts`, `i18n.ts` + тести | редактор | 9 |
| `apps/web/src/help/{rounds,powers,settings}.ts`, `i18n.ts`, `host-help.test.ts`, `HostLadder.tsx` | довідка й «ⓘ» | 10 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 10i з кадрами `p10i-` | 11 |

## Порядок збирання

- 1 → 2 → 3 → 4 → 5 → 6.
- 7 — після 5 і 6. 8 — після 7 (`LadderBoard`). 9 — після 1 (від рушія й зрізів не залежить), можна паралельно з 7–8.
- 10 — після 8 і 9. 11 — остання.
- **Навмисні зміни наявних очікувань** (лише такі):
  - `restore.test.ts`:
    - `GAME_STATE_VERSION` 9, новий `KEYS[9]`;
    - `STATE_SHAPE.GameState` + `'ladder'`, `STATE_SHAPE.Play` + `'ladder'`;
    - `STATE_SHAPE.LadderState` / `LadderPlay` / `LadderLifelines` / `LadderOutcome`;
    - `READABLE_STATE_VERSIONS` `[2, 3, 4, 5, 6, 7, 8, 9]`; `KEYS[1..8]` без змін;
  - фабрики `BaseView` / `StageView` / `HostView` / `PlayerView['me']` у тестах вебу отримують `ladder: null` (і `me.ladder: null`); фабрики `RoundBrief` — `ladder: null`;
  - тест у `quiz.test.ts`, що звіряє `ROUND_TYPES` буквально, отримує `'ladder'`;
  - `LATER_ROUND_TYPES` у `compass-quiz.test.ts` і `horizon-quiz.test.ts` — `['wipeout', 'survival', 'ladder']`;
  - тексти «де бафи не діють» (`EXCL` у `help/powers.ts`, `buffHelpNone` і `guideBuffsWhere` в `i18n.ts`) і тест у `host-help.test.ts`, що звіряє їх буквально, — з «Мільйонером»;
  - тест `searchHelp` у `host-help.test.ts`, якщо новий запис змінює буквальний результат пошуку;
  - `demo-quiz.test.ts`: очікувана кількість раундів / опис `partyQuiz`, якщо тест їх звіряє буквально.
  - Якщо падає інше, рецензент розбирає причину, а не правку очікування.

## На що дивитися рецензентові

1. **Учасник.** Ведучий вибирає на `intro` (і замінює до першого запитання); жереб і «найменші бали» — окремим «Далі», рівно один `rng`, результат у стані; без учасника `pick 'host'` → `ladder_pick`. Тести: задача 2.
2. **Сходинки й виграш.** Правильно → рішення; неправильно чи мовчання → неспалимий рівень (0 без нього); остання правильна → верх; «Забрати» → останній пройдений; виграш — одне коригування `ladder` на раунд; зупинка ведучим ніколи не забирає виграного. Тести: задача 2.
3. **Зал.** 10 % рівня за правильну, без правил раунду; на учасника не впливає; після підсумку залу відповідати пізно. Тести: задачі 2, 3.
4. **Підказки.** Кожна раз за драбину, кілька на одне запитання, незалежно від бафів вікторини (і не з'їдають бафів 8b у наступних раундах); 50/50 прибирає 2 неправильні; зал = відповіді «за себе», закривається за часом, усіма, учасником чи закриттям запитання; підказка ведучого — через наявні `hints` / `host:hint`; пауза зупиняє голосування. Тести: задача 3.
5. **Без таймера.** `round.timer === false` → немає `endsAt`, телефон без відліку, пауза зсуває лише `startedAt`. Тести: задачі 2, 5.
6. **Ізоляція.** Бафи (ряд схований), дебафи, дуелі — не діють у раунді, на `round_end` знову діють; правил раунду немає. Тести: задача 4.
7. **Нічого не витікає.** Правильна відповідь, правильність залу й підсумок драбини — лише з розкриття; вибір учасника — з `locked`; підсумок залу — після закриття; текст підказки — лише учасникові й пульту. Тести: задача 5, задача 11 (кадри).
8. **Формат стану.** `GAME_STATE_VERSION` = 9, `KEYS[9]`, представник із відкритим голосуванням залу проходить JSON і `suspend`; `READABLE_STATE_VERSIONS` `[2, …, 9]`.
9. **Старе не змінилося.** Тести класики, бліцу, поля, фіналу, «Ва-банк», «Вибування», бафів, дебафів, дуелей — без змін.
10. **Довідка.** Запис `round.ladder` правдивий щодо рушія й чисел з `LIMITS`. Записи бафів, дебафів, дуелей і налаштувань згадують «Мільйонер». Тести: задача 10.

---

### Задача 1. Shared: раунд `ladder`, ліміти, пресети, коди, причина бафу, джерело коригування, код помилки, бриф; прохід typecheck

**Files:**
- Modify: `packages/shared/src/quiz.ts`, `packages/shared/src/round-brief.ts`, `packages/shared/src/game.ts`, `packages/shared/src/index.ts`
- Create: `packages/shared/src/ladder.ts`
- Test: `packages/shared/src/quiz.test.ts`, новий `packages/shared/src/ladder.test.ts`, `packages/engine/src/round-brief.test.ts`
- Modify (прохід typecheck): `apps/web/src/guide-text.ts`, `apps/web/src/round-summary.ts`, `apps/web/src/format.ts`, `apps/web/src/i18n.ts`, `apps/web/src/help/rounds.ts`, `apps/web/src/editor/draft.ts`, `apps/web/src/editor/draft-storage.ts`, `apps/web/src/editor/QuizEditor.tsx`, `apps/web/src/editor/RoundSettings.tsx`; `apps/server/scripts/compass-quiz.test.ts`, `apps/server/scripts/horizon-quiz.test.ts`
- Test: `apps/web/src/round-summary.test.ts`, `apps/web/src/editor/draft.test.ts`

**Interfaces:**
- Produces (`quiz.ts`):
  ```ts
  // У LIMITS:
  /** «Мільйонер»: запитань у драбині, найбільша сума рівня (власний ліміт, 14a), варіантів у запитанні. */
  minLadderQuestions: 5,
  maxLadderQuestions: 15,
  maxLadderLevel: 10_000,
  ladderOptions: 4,

  /** Як вибирається учасник драбини: ведучий сам, жереб, найменші бали на початку раунду. */
  export const LADDER_PICKS = ['host', 'random', 'lowest'] as const;
  export type LadderPick = (typeof LADDER_PICKS)[number];

  /** Підказки драбини: ті самі назви, що в бафів 8b, але раз за драбину й незалежно від бафів вікторини. */
  export const LIFELINES = ['fifty', 'audience', 'hint'] as const satisfies readonly BuffKind[];
  export type LifelineKind = (typeof LIFELINES)[number];

  /** «Мільйонер»: один учасник іде драбиною запитань «один варіант» (по 4 варіанти); виграє суму рівня. Правил балів немає. */
  export const ladderRoundSchema = z.object({
    id: z.string().min(1).refine(isStorable, UNSTORABLE),
    type: z.literal('ladder'),
    title: z.string().trim().max(LIMITS.roundTitle).refine(isStorable, UNSTORABLE),
    /** Опис раунду від автора для заставки. */
    description: z.string().trim().max(LIMITS.roundDescription).refine(isStorable, UNSTORABLE).optional(),
    shuffleOptions: z.boolean(),
    /** Запитання в порядку сходинок; ціна (points) не важить. */
    questions: z.array(questionSchema).min(LIMITS.minLadderQuestions).max(LIMITS.maxLadderQuestions),
    /** Сума рівня кожної сходинки; належить позиції, а не запитанню. */
    levels: z.array(z.number().int().min(1).max(LIMITS.maxLadderLevel)).min(LIMITS.minLadderQuestions).max(LIMITS.maxLadderQuestions),
    /** Неспалимі сходинки (0-базові). */
    safe: z.array(z.number().int().min(0)).max(LIMITS.maxLadderQuestions),
    pick: z.enum(LADDER_PICKS),
    lifelines: z.array(z.enum(LIFELINES)).max(LIFELINES.length),
    /** true — таймер на запитання (timeLimit кожного); false — без таймера. */
    timer: z.boolean(),
  });
  export type LadderRound = z.infer<typeof ladderRoundSchema>;

  export const ROUND_TYPES = ['classic', 'blitz', 'board', 'final', 'wipeout', 'survival', 'ladder'] as const;
  // roundSchema: + ladderRoundSchema.
  ```
  - `rulesOf`: `final`, `wipeout`, `ladder` → `DEFAULT_RULES`; оновити коментар.
  - `quizSchema.superRefine` поруч із `survival`, для раунду `ladder`:
    - `ladder_type` — `q.type !== 'single' || q.options.length !== LIMITS.ladderOptions`;
    - `ladder_levels` — `levels.length !== questions.length` або не строго зростають;
    - `ladder_safe` — повтор або `s >= questions.length - 1`;
    - `ladder_lifelines` — повтор.
  - `duelThreshold` / `scoredCount` — без змін (запитання драбини рахуються).
- Produces (новий `ladder.ts`, реекспорт з `index.ts`):
  ```ts
  /** Пресети рівнів для 5…15 сходинок (таблиця з плану); кожен строго зростає від 100 до 10 000. */
  export const LADDER_PRESETS: Readonly<Record<number, readonly number[]>>;
  /** Типові неспалимі для рівнів: перший ≥ 1000 і перший ≥ 5000, без верхньої сходинки й повторів. */
  export function ladderPresetSafe(levels: readonly number[]): number[];
  /** Чим скінчилася драбина. */
  export type LadderOutcomeKind = 'took' | 'wrong' | 'top' | 'stopped';
  /** Виграш: took/top/stopped — рівень останньої пройденої (0 без пройдених); wrong — найвищий неспалимий серед пройдених (0 без нього). */
  export function ladderPrize(levels: readonly number[], safe: readonly number[], passed: number, kind: LadderOutcomeKind): number;
  /** Бали залу за правильну відповідь: 10 % рівня, заокруглено. */
  export function hallPoints(level: number): number;
  ```
- Produces (`round-brief.ts`):
  ```ts
  // RoundBrief:
  /** «Мільйонер»: як вибирається учасник, підказки, верхній рівень, чи є таймер; null поза ним. */
  ladder: { pick: LadderPick; lifelines: LifelineKind[]; top: number; timer: boolean } | null;
  ```
  - `emptyBrief` → `ladder: null`; `roundBrief` для `ladder` → `{ ...base, ladder: { pick, lifelines, top: levels.at(-1), timer } }` (без правил, як `wipeout`).
- Produces (`game.ts`):
  - `BuffBlock` + `'off_ladder'` (коментар «“Мільйонер”: бафів немає, свої підказки (10i)»);
  - `AdjustmentSource` + `'ladder'` (коментар «виграш драбини (10i)»);
  - `ErrorCode` + `'ladder_pick'` (коментар «“Мільйонер”: ведучий ще не вибрав учасника (10i)»).
- Веб (прохід typecheck):
  - `i18n.ts`:
    - `roundTypeLadder: 'Мільйонер'`, `ladderLabel: 'Мільйонер'`;
    - `roundHow_ladder: 'Один учасник іде драбиною запитань і в будь-який момент може забрати виграш. Решта відповідає за себе — за правильну відповідь 10 % суми рівня.'`;
    - `summaryLadderContestant: 'Учасник проходить драбину до {top}: помилка — лише неспалима сума, «Забрати» — сума пройденого рівня.'`;
    - `summaryLadderHall: 'Решта відповідає за себе: правильно — 10 % суми рівня.'`;
    - `summaryLadderPick_host: 'Учасника вибирає ведучий.'`, `summaryLadderPick_random: 'Учасника вибере жереб.'`, `summaryLadderPick_lowest: 'Піде той, у кого найменше балів.'`;
    - `summaryLadderLifelines: 'Підказки: {list}.'`;
    - `buffWhy_off_ladder: 'У «Мільйонері» бафів немає — тут свої підказки.'`;
    - `errors.ladder_pick` (чи як оформлено тексти кодів помилок): `'Спершу виберіть учасника драбини.'`;
    - `adjustSource_ladder: 'Виграш драбини'` (якщо історія має мапу підписів джерел; інакше — у задачі 8);
  - `guide-text.ts`: `ROUND_ICONS.ladder = '🪜'`, `ROUND_NAMES.ladder = 'roundTypeLadder'`, `roundHow`: `case 'ladder': return [t('roundHow_ladder')]`;
  - `round-summary.ts`: гілка `ladder` поруч із `wipeout`:
    ```
    [t('summaryLadderContestant', { top }), t(`summaryLadderPick_${pick}`), t('summaryLadderHall'),
     ...(lifelines.length > 0 ? [t('summaryLadderLifelines', { list: назви бафів через кому })] : [])]
    ```
    Без рядка модифікаторів (правил немає).
  - `format.ts`: `roundLabel` для порожньої назви `ladder` → `t('ladderLabel')`;
  - `help/rounds.ts`: повний запис `ladder`. Тексти — з задачі 10; тут їх вписати повністю, а задача 10 звіряє й оновлює пов'язані записи;
  - `editor/draft.ts`:
    - `questionTypesFor('ladder')` → `['single']`; оновити коментар;
    - `newLadderQuestion()` — `newQuestion('single')` з рівно 4 порожніми варіантами й `points: 0`;
    - `newLadderRound()`:
      ```ts
      /** Новий «Мільйонер»: п'ять запитань по 4 варіанти, рівні з пресету, неспалимий — 1000, учасника вибирає ведучий, усі три підказки, без таймера. */
      export function newLadderRound(): LadderRound {
        const levels = [...LADDER_PRESETS[LIMITS.minLadderQuestions]];
        return {
          id: newId(), type: 'ladder', title: '', shuffleOptions: false,
          questions: Array.from({ length: LIMITS.minLadderQuestions }, newLadderQuestion),
          levels, safe: ladderPresetSafe(levels), pick: 'host', lifelines: [...LIFELINES], timer: false,
        };
      }
      ```
  - `draft-storage.ts`: `looksLikeQuiz` — `ladder`, як `wipeout`, без `rules`; `loadDraft` — `ladder` повертається з `questions.map(revive)`;
  - `QuizEditor.tsx`: `addRound('ladder')` → `newLadderRound()` (повний вигляд — задача 9);
  - `RoundSettings.tsx`: правил і бонусу за швидкість для `ladder` немає (як `final` / `wipeout` у наявних умовах); решта вигляду — задача 9;
  - `compass-quiz.test.ts`, `horizon-quiz.test.ts`: `LATER_ROUND_TYPES = new Set<string>(['wipeout', 'survival', 'ladder'])`.

- [ ] **Step 1: Write the failing tests**
  - `packages/shared/src/quiz.test.ts`:
    ```ts
    describe('ladder round (10i)', () => {
      const four = (id: string) => ({ ...singleQ, id, options: ['a', 'b', 'c', 'd'].map((o) => ({ id: o, text: o.toUpperCase() })), correctId: 'b' });
      const qs = [1, 2, 3, 4, 5].map((i) => four(`l${i}`));
      const ladder = { id: 'rl', type: 'ladder', title: '', shuffleOptions: false, questions: qs,
        levels: [100, 300, 1000, 3000, 10000], safe: [2], pick: 'host', lifelines: ['fifty', 'audience', 'hint'], timer: false } as const;
      it('a ladder round has 5–15 four-option questions, rising levels up to 10 000, safe steps, a pick mode, lifelines and a timer flag', () => {
        expect(ROUND_TYPES).toContain('ladder');
        expect(valid(roundSchema, ladder)).toBe(true);
        expect(valid(roundSchema, { ...ladder, questions: qs.slice(0, 4), levels: [100, 300, 1000, 3000] })).toBe(false);
        expect(valid(roundSchema, { ...ladder, levels: [100, 300, 1000, 3000, 10001] })).toBe(false);
        expect(valid(roundSchema, { ...ladder, pick: 'oldest' })).toBe(false);
        expect(valid(roundSchema, { ...ladder, lifelines: ['double'] })).toBe(false);
        expect(rulesOf(roundSchema.parse(ladder))).toEqual(DEFAULT_RULES);
      });
      it('refuses other types, other option counts, broken levels, safe steps and repeated lifelines', () => {
        // multi чи boolean у questions → 'ladder_type'; single з 3 варіантами → 'ladder_type';
        // levels [100, 300, 300, 3000, 10000] → 'ladder_levels'; levels довжини 6 → 'ladder_levels';
        // safe [4] (верхня) → 'ladder_safe'; safe [1, 1] → 'ladder_safe';
        // lifelines ['fifty', 'fifty'] → 'ladder_lifelines'.
      });
    });
    ```
    `singleQ`, `valid`, `quizIssues` — наявні помічники файлу (або найближчі аналоги з тестів `wipeout_type`).
  - Новий `packages/shared/src/ladder.test.ts`:
    - `LADDER_PRESETS` має ключі 5…15; кожен масив довжини n, строго зростає, починається з 100, закінчується 10 000; `LADDER_PRESETS[5]` = `[100, 300, 1000, 3000, 10000]`;
    - `ladderPresetSafe([100, 300, 1000, 3000, 10000])` → `[2]`; `ladderPresetSafe(LADDER_PRESETS[7])` → `[3, 5]`; 10 000 на верхній не стає неспалимою;
    - `ladderPrize(levels5, [2], 0, 'took')` → 0; `(…, 3, 'took')` → 1000; `(…, 5, 'top')` → 10000; `(…, 4, 'wrong')` → 1000; `(…, 2, 'wrong')` → 0; `(…, 3, 'wrong')` → 1000 (неспалима пройдена); `(…, 4, 'stopped')` → 3000;
    - `hallPoints(1000)` → 100; `hallPoints(250)` → 25; `hallPoints(150)` → 15; `hallPoints(5)` → 1 (`Math.round(0.5)`).
  - `round-brief.test.ts`: `roundBrief(ladder)` → `penalty false`, `streak null`, `multiplier 1`, `speedBonus false`, `ladder: { pick: 'host', lifelines: [...], top: 10000, timer: false }`; `emptyBrief('classic').ladder === null`.
  - `apps/web/src/round-summary.test.ts`: бриф `ladder` з `pick 'lowest'`, підказками `['fifty', 'audience']` → рядки `summaryLadderContestant` (з «10 000» або 10000 за форматом наявних чисел), `summaryLadderPick_lowest`, `summaryLadderHall`, `summaryLadderLifelines` з назвами двох бафів; без підказок рядка підказок немає.
  - `apps/web/src/editor/draft.test.ts`: `newLadderRound()` — 5 запитань по 4 варіанти, `points 0`, `levels` = пресет 5, `safe [2]`, `pick 'host'`, три підказки, `timer false`; після заповнення текстів і варіантів проходить `roundSchema`; `questionTypesFor('ladder')` → `['single']`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared` → FAIL.
- [ ] **Step 3: Implement** схему, ліміти, коди, `ladder.ts`, `rulesOf`, `roundBrief`, `BuffBlock`, `AdjustmentSource`, `ErrorCode` за інтерфейсом.
- [ ] **Step 4: Прохід typecheck.** Виконати `pnpm typecheck` і закрити кожну помилку змінами з інтерфейсу.
  - Рушій теж може не скомпілюватися на `Record<RoundType, …>`, `Record<BuffBlock, …>` чи `switch` без гілки. Там — мінімальна гілка без поведінки з коментарем `// задача 2`.
  - Веб: `Record<BuffBlock, …>` / `Record<ErrorCode, …>` у текстах — справжні тексти з інтерфейсу.
  - Поведінки раунду в цій задачі немає.
- [ ] **Step 5: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 6: Commit**
  ```bash
  git add packages/shared packages/engine apps/web/src apps/server/scripts
  git commit -m "feat(shared): ladder round — 5–15 four-option single questions, rising levels up to 10 000 with presets, safe steps, host, random or lowest-score contestant, three lifelines and an optional timer; buff block off_ladder, adjustment source ladder, error ladder_pick, round brief"
  ```

### Задача 2. Рушій: учасник, відповіді учасника й залу, 10 %, без таймера, підсумок, рішення, виграш, зупинка; `GAME_STATE_VERSION` 9

**Files:**
- Create: `packages/engine/src/ladder.ts`
- Modify: `packages/engine/src/game.ts`, `packages/engine/src/timing.ts`, `packages/engine/src/splash.ts`, `packages/engine/src/views.ts` (лише `timeLimit` у `publicQuestion` через `timedPlay`, якщо зріз має доступ до запису; інакше — задача 5), `packages/engine/src/restore.ts`, `packages/engine/src/index.ts`, `packages/engine/src/testing/fixtures.ts`
- Test: новий `packages/engine/src/game.ladder.test.ts`; `packages/engine/src/restore.test.ts`

**Interfaces:**
- Changes (`game.ts`):
  ```ts
  // GameState:
  /** «Мільйонер»: учасник драбини; ключ є лише в раунді «Мільйонер» (від intro до round_end) (10i). */
  ladder?: LadderState;

  export interface LadderState {
    /** Учасник; null — ще не вибрано. */
    contestantId: string | null;
    /** Вибрано жеребом чи за найменшими балами (кнопкою «Вибрати учасника»), а не ведучим вручну. */
    drawn: boolean;
  }

  // Play:
  /** «Мільйонер»: учасник, сходинка, підказки, рішення й підсумок драбини (10i). */
  ladder?: LadderPlay;

  export interface LadderPlay {
    contestantId: string;
    /** Сходинка (0-базова) = номер запитання в раунді. */
    step: number;
    /** Сума рівня сходинки (знімок round.levels[step]). */
    level: number;
    /** Знімок round.timer: false — запитання без таймера (timedPlay читає його без стану). */
    timed: boolean;
    /** Підказки, узяті на цьому запитанні. */
    lifelines: LadderLifelines;
    /** Рішення після цього запитання; null — ще не вирішено або не пропонувалось. */
    decision: 'go' | 'take' | null;
    /** Чим скінчилася драбина на цьому запитанні; null — триває. */
    outcome: LadderOutcome | null;
  }

  export interface LadderLifelines {
    /** 50/50: прибрані неправильні варіанти. */
    fifty?: { removed: string[]; at: number };
    /** Зал: кінець голосування, закрито чи ні, відповіді залу в мить закриття (до того {}). */
    audience?: { endsAt: number; closed: boolean; ballots: Record<string, Answer>; at: number };
    /** Підказка ведучого: text null — чекає ведучого; aloud — підказав уголос. */
    hint?: { text: string | null; aloud: boolean; at: number };
  }

  export interface LadderOutcome {
    kind: LadderOutcomeKind;
    /** Скільки сходинок пройдено. */
    passed: number;
    /** Виграш (ladderPrize). */
    points: number;
  }
  ```
  - `enterRound`: прибрати ключ `ladder` зі стану (деструктуризацією) і для раунду `ladder` поставити `{ contestantId: null, drawn: false }`.
  - `openQuestion`: у раунді `ladder` — `ladder: { contestantId: state.ladder.contestantId, step, level: round.levels[step], timed: round.timer, lifelines: {}, decision: null, outcome: null }`; `endsAt` — через `timedPlay`. `rng` для цього не тягнеться.
  - `nextQuestion`: у раунді `ladder` → `undefined`, якщо в останнього запису раунду є `outcome` або учасника немає серед гравців.
  - `submitAnswer`: після загальних перевірок — `if (round.type === 'ladder') return submitLadderAnswer(state, playerId, answer, now);`.
  - `autoLock`: у раунді `ladder` — `ladderAnswered(state)` (учасник відповів і всі присутні глядачі відповіли); учасника немає серед присутніх → без автозакриття.
  - `next`:
    - `case 'intro'` у «Мільйонері»: без учасника → `drawContestant(state, rng)` (помилки — див. нижче); з учасником → `advance`;
    - `case 'reveal'` у «Мільйонері» — **до** перевірки `nextQuestion(state) === undefined`: `return ok(settleStep(state, now))`;
    - `case 'leaderboard'` у «Мільйонері»: підсумок → `finishRound`; `decision null` → `fail('deciding')`; `'go'` → `advance`.
  - `finishRound` і `end`: `stopLadder(state, now)` перед зміною фази (у `end` — до `lockNow`-подібного закриття відкритого запитання, щоб «відкрите не рахується» працювало). `endRound`: `stopLadder` до `lockNow` на `question`.
  - `override`: у раунді `ladder` на `reveal` — як гілка «Ва-банк»: `partial` → `partial_disabled`; запис учасника — 0 балів; глядача — `hallPoints(play.ladder.level)` або 0; `overridden: true`; `withTotals`.
  - `removePlayer`: гравець — учасник:
    - на `intro` → `state.ladder = { contestantId: null, drawn: false }`;
    - під час драбини (є записи раунду без підсумку) → `outcome { kind: 'stopped', passed, points: 0 }` на поточному записі раунду.
    - `Play.ladder.lifelines.audience.ballots` — без вилученого.
  - `speedOn` — без змін (ladder і так не classic/survival). Знайти інші місця `=== 'classic'` / `=== 'wipeout'`, де драбину треба поставити поруч із «Ва-банк» (`grep -n "=== 'wipeout'" packages/engine/src/*.ts`), і для кожного вирішити й записати коментар.
- Changes (`timing.ts`):
  ```ts
  /** Чи має запис таймер: isTimed(question) і не запитання драбини з ladder.timed === false. */
  export function timedPlay(play: Play): boolean;
  ```
  - *Рішення:* позначка лежить у самому записі (`LadderPlay.timed`, знімок `round.timer`), тож `limitMsOf(play)` і решта не потребують стану.
  - `limitMsOf`, `timeOver`, `timeOverFor`, `resumeClock` (гілка «без таймера») — на `timedPlay`. В `openQuestion` (`endsAt`) запис ще не створено: умова `isTimed(question) && !(round.type === 'ladder' && !round.timer)`.
- Changes (`splash.ts`): `questionSplashKind` — `ladder` → `'question'`.
- Produces (`ladder.ts`):
  ```ts
  /** Чи поточний раунд — «Мільйонер». */
  export function inLadderRound(state: GameState): boolean;
  /** Поточне запитання «Мільйонера» з його LadderPlay; інакше null. */
  export function ladderPlayOf(state: GameState): (Play & { ladder: LadderPlay }) | null;
  /** Учасник поточного раунду «Мільйонер»; null — не вибрано, вилучено або не той раунд. */
  export function contestantOf(state: GameState): string | null;
  /** Ведучий вибирає учасника на intro: wrong_phase, paused, not_found, target_offline. */
  export function pickContestant(state: GameState, playerId: string): Result;
  /**
   * «Далі» на intro без учасника: pick 'host' → ladder_pick; random — rng серед присутніх; lowest — найменший рахунок серед присутніх,
   * рівні — rng. Рівно один виклик rng. Присутніх немає → no_players. drawn: true, етап intro.
   */
  export function drawContestant(state: GameState, rng: Rng): Result;
  /**
   * Відповідь у «Мільйонері»: already_answered; глядач після закриття голосування залу → vote_closed; time_over; type_mismatch.
   * Учасник: запис з checkAnswer, points 0; закриває голосування залу (closeAudience). Глядач: points = correct ? hallPoints(level) : 0.
   * Потім settleAudience (останній присутній глядач закриває голосування) і autoLock(now).
   */
  export function submitLadderAnswer(state: GameState, playerId: string, answer: Answer, now: number): Result;
  /** Учасник відповів і відповіли всі присутні глядачі. */
  export function ladderAnswered(state: GameState): boolean;
  /** Скільки сходинок пройдено до поточного запису включно з його результатом (correct учасника) — для підсумку. */
  export function passedSteps(state: GameState, includeCurrent: boolean): number;
  /**
   * «Далі» після розкриття: етап leaderboard; правильно й не остання — рішення відкрите; правильно й остання — top;
   * неправильно чи мовчання — wrong; учасника немає — stopped (0). Підсумок → awardLadder.
   */
  export function settleStep(state: GameState, now: number): GameState;
  /** Рішення відкрите: етап leaderboard «Мільйонера», decision null, outcome null. */
  export function decisionPending(state: GameState): boolean;
  /** «Граю далі» (take false) чи «Забрати» (take true); by — id гравця або 'host'. Помилки: wrong_phase, paused, not_allowed, already_answered. */
  export function decideLadder(state: GameState, by: string, take: boolean, now: number): Result;
  /** Ставить outcome на поточному записі раунду й додає коригування 'ladder' (points > 0, учасник є, ще не додано в цьому раунді). */
  export function awardLadder(state: GameState, outcome: LadderOutcome, now: number): GameState;
  /** Ведучий завершує раунд чи гру: підсумок, якщо його ще немає (правила зупинки з плану); поза драбиною — стан без змін. */
  export function stopLadder(state: GameState, now: number): GameState;
  ```
- Changes (`testing/fixtures.ts`):
  ```ts
  /** П'ять запитань драбини l1…l5: single з варіантами a, b, c, d; правильні b, c, a, d, b; timeLimit 20; points 0. */
  export const ladderQuestions: Question[];
  /** «Мільйонер»: типово title '', shuffleOptions false, levels [100, 300, 1000, 3000, 10000], safe [2], pick 'host', усі три підказки, timer false. */
  export function ladderRound(id: string, questions?: Question[], options?: Partial<Omit<LadderRound, 'id' | 'type' | 'questions'>>): LadderRound;
  /** Правильна й неправильна відповідь на l1…l5. */
  export const LADDER_RIGHT: Answer[]; export const LADDER_WRONG: Answer[];
  ```
- Changes (`restore.ts`): **`GAME_STATE_VERSION = 9`**, коментар «9 — 10i: GameState.ladder (учасник драбини), Play.ladder (сходинка, підказки, рішення й підсумок “Мільйонера”)», `READABLE_STATE_VERSIONS = [2, 3, 4, 5, 6, 7, 8, GAME_STATE_VERSION]` з поясненням «8 → 9 лише додала необов'язкові GameState.ladder і Play.ladder (і значення AdjustmentSource 'ladder'), а стан версій 2–8 не може містити “Мільйонера”».

- [ ] **Step 1: Write the failing tests** у новому `game.ladder.test.ts`.
  - Вікторина: `makeRoundsQuiz([classicRound('r1', [single]), ladderRound('rl'), classicRound('r3', [withId(single, 'q3')])])`.
  - Гравці: `Оля` (p1), `Петро` (p2), `Віра` (p3). Помічник тесту доводить гру до `intro` раунду `rl`.
  - Тести:
  - `the host picks the contestant on the intro`: `state.ladder` = `{ contestantId: null, drawn: false }`; `next` → `ladder_pick`; `pickContestant(p1)` → ok; ще раз `pickContestant(p2)` → замінено; `next` → `question` l1, `play.ladder` = `{ contestantId: 'p2', step: 0, level: 100, timed: false, lifelines: {}, decision: null, outcome: null }`; після цього `pickContestant` → `wrong_phase`;
  - `pick errors`: невідомий гравець → `not_found`; відключений → `target_offline`; на паузі → `paused`; поза `intro` → `wrong_phase`;
  - `a random draw takes one rng number`: `pick 'random'`, `rng` = `[0.5]` → учасник p2 (⌊0,5·3⌋ = 1), `drawn: true`, етап `intro`; лічильник викликів `rng` = 1; наступний `next` → l1;
  - `the lowest score goes, ties by rng`: після r1 бали p1 100, p2 0, p3 0 → `pick 'lowest'`, `rng` `[0.9]` → p3 (серед p2, p3: ⌊0,9·2⌋ = 1); коли найменший один (p2 −50 через `adjustScore`) → p2, і однаково рівно один виклик `rng`;
  - `absent players are not drawn`: p2 відключений, `random` з `[0.5]` → серед p1, p3 → p3; усі відключені → `no_players`;
  - `the ladder round has no timer by default`: `startedAt` є, `endsAt === null`; відповідь через 10 хвилин приймається; з `timer: true` → `endsAt = startedAt + 20_000`;
  - `the contestant scores nothing per answer, the hall gets 10 %`: на l1 (рівень 100) p2 правильно → запис `points 0`, `grade 'correct'`; p1 правильно → `points 10`; p3 неправильно → 0; рахунок p1 +10; серій немає;
  - `the question closes when the contestant and the present hall answered`: p1 і p3 відповіли — ще `question`; p2 відповів → `locked`; з відключеним p3 — закривається після p1 і p2; з відключеним учасником — не закривається само;
  - `correct means a decision before the next question`: reveal → `next` → `leaderboard`, `decisionPending` true, `endsAt null`; `next` → `deciding`; `decideLadder(p2, false)` → `decision 'go'`; `next` → l2 (`step 1`, `level 300`);
  - `taking the money pays the last passed level`: після l3 правильно → `decideLadder(p2, true)` → `outcome { kind: 'took', passed: 3, points: 1000 }`; коригування `{ source: 'ladder', playerId: 'p2', points: 1000, roundIndex: 1 }`; рахунок p2 +1000; `next` → `round_end`; l4, l5 незіграні;
  - `a wrong answer falls to the last passed safe level`: l1–l4 правильно (рішення 'go'), l5 неправильно → `next` з reveal → `outcome { kind: 'wrong', passed: 4, points: 1000 }`; `next` → `round_end`;
  - `a wrong answer before any safe level pays nothing`: l2 неправильно → `wrong`, 0, без коригування;
  - `silence is a wrong answer`: учасник мовчить, ведучий `lock` → reveal → `wrong`;
  - `the top of the ladder`: усі п'ять правильно → `outcome { kind: 'top', passed: 5, points: 10000 }`, рішення після l5 не пропонується;
  - `only the contestant or the host decides`: `decideLadder(p1, …)` → `not_allowed`; `decideLadder('host', true)` → `took`; повторно → `already_answered`; на паузі → `paused`; на `question` → `wrong_phase`;
  - `the prize is paid once`: `awardLadder` двічі → одне коригування; `stopLadder` після підсумку нічого не додає;
  - `a host override on the reveal changes the outcome`: учасник неправильно на l2 → `override(p2, 'correct')` → `next` → рішення відкрите; глядач p1 неправильно → `override(p1, 'correct')` → `points 30`; `partial` → `partial_disabled`;
  - `ending the round mid-question keeps what was passed`: l1–l2 правильно, `endRound` посеред l3 (учасник уже відповів правильно) → `outcome { kind: 'stopped', passed: 2, points: 300 }`; запис p1 за l3 із 10 % зберігся (`lockNow`);
  - `ending on the reveal counts the question`: `endRound` на reveal l3 (правильно) → `stopped`, `passed 3`, 1000; на reveal з неправильною → `wrong`;
  - `ending during the decision takes the money`: `endRound` на `leaderboard` з відкритим рішенням → `took`;
  - `ending the game pays the prize too`: `end` під час драбини → `finished`, коригування є;
  - `kicking the contestant stops the ladder with nothing`: `removePlayer(p2)` посеред l2 → `outcome stopped, 0`; зал дограє l2; reveal → `next` → `leaderboard` з підсумком → `next` → `round_end`; на `intro` → `contestantId null`;
  - `the leaderboard setting does not matter`: з `leaderboard: 'end'` після reveal — усе одно `leaderboard`;
  - `a ladder question opens with the «Запитання N» splash` (гра із заставками, `lobbyWithSplash`): `splash.kind === 'question'`;
  - `the classic round after it plays as before`: після `round_end` → `next` → `intro` r3, `state.ladder` немає (`'ladder' in state` false); бали класики додаються.
  - `restore.test.ts`:
    - `KEYS[9]` = `KEYS[8]` + `GameState: …,ladder` + `Play: …,ladder`;
    - `LadderState: 'contestantId,drawn'`;
    - `LadderPlay: 'contestantId,decision,level,lifelines,outcome,step,timed'`;
    - `LadderLifelines: 'audience,fifty,hint'`;
    - `LadderOutcome: 'kind,passed,points'`;
    - порядок — як у наявних записах;
    - `representative()` + стан «Мільйонера» на `question` l2 з відповіддю глядача й рішенням 'go' на l1 (голосування залу — у задачі 3);
    - `READABLE_STATE_VERSIONS` `[2, 3, 4, 5, 6, 7, 8, 9]`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine` → FAIL.
- [ ] **Step 3: Implement** `ladder.ts`, зміни `game.ts`, `timing.ts`, `splash.ts`, фікстури, версію.
  - `awardLadder` стоїть на `addAdjustment` з `adjust.ts` (він сам кличе `withTotals`).
  - `stopLadder` у `finishRound` — до зміни фази, щоб `afterQuestion` і `roundIndex` були раунду «Мільйонер».
  - `passedSteps` рахує записи раунду з `grade 'correct'` учасника поспіль від першого; на відкритому запитанні його не враховує.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine
  git commit -m "feat(engine): ladder — the host picks the contestant or one rng draw on the intro, the contestant climbs with zero-point answers, the hall answers for itself for 10 % of the level, no timer unless the round has one, take the money or play on before each next question, a mistake falls to the last safe level, the top pays the top level, the prize is a one-time ladder adjustment, ending the round keeps what was passed; state version 9"
  ```

### Задача 3. Рушій: підказки драбини — 50/50, «Запитання в залі», «Підказка ведучого»

**Files:**
- Modify: `packages/engine/src/ladder.ts`, `packages/engine/src/buffs.ts`, `packages/engine/src/game.ts`, `packages/engine/src/blitz.ts`, `packages/engine/src/views.ts` (лише `hintRequests`), `packages/engine/src/index.ts`
- Test: новий `packages/engine/src/game.ladder-lifelines.test.ts`; `packages/engine/src/restore.test.ts` (представник із відкритим голосуванням)

**Interfaces:**
- Changes (`buffs.ts`):
  - `export function pickRemoved(question: Question, rng: Rng): string[]` (зараз приватна; без зміни поведінки);
  - `giveHint`: якщо поточний раунд `ladder` → `giveLadderHint(state, playerId, text)` (ladder.ts); інакше як зараз;
  - `buffsUsed` — без змін (ladder-підказки поза `Play.buffs`); тест це закріплює.
- Produces (`ladder.ts`):
  ```ts
  /** Підказки, уже використані на драбині поточного раунду. */
  export function lifelinesUsed(state: GameState): LifelineKind[];
  /**
   * Учасник бере підказку. Помилки за порядком: wrong_phase, not_found, not_allowed (не учасник або не ввімкнено), buff_used,
   * paused, not_started, already_answered, time_over, buff_unfit (зал без присутніх глядачів).
   * fifty — pickRemoved(question, rng); audience — endsAt = now + AUDIENCE_MS, за timedPlay — grantOvertime(учасник, AUDIENCE_MS);
   * hint — text = question.hint ?? null. Кілька підказок на одне запитання можна.
   */
  export function useLifeline(state: GameState, playerId: string, kind: LifelineKind, now: number, rng: Rng): Result;
  /** Голосування залу відкрите: є audience, closed false. */
  export function audienceOpen(state: GameState): boolean;
  /** Закриває голосування: ballots = відповіді глядачів у play.answers, closed true. Без відкритого — стан без змін. */
  export function closeAudience(state: GameState): GameState;
  /** Закриває відкрите голосування, якщо відповіли всі присутні глядачі; на паузі — ні. */
  export function settleAudience(state: GameState): GameState;
  /** Ведучий відповідає на запит підказки учасника: text або null («уголос»); not_found — немає запиту, що чекає. */
  export function giveLadderHint(state: GameState, playerId: string, text: string | null): Result;
  /** Після паузи: endsAt голосування зсувається на shiftMs. */
  export function shiftLadderClocks(state: GameState, shiftMs: number): GameState;
  ```
  - `submitLadderAnswer` (задача 2): учасник → `closeAudience` перед `autoLock`; глядач після `closed` → `vote_closed`; після запису глядача — `settleAudience`.
- Changes (`game.ts`):
  - `tick` на `question`: перед `closesAt` — `audienceOpen && !paused && now >= endsAt` → `closeAudience`;
  - `lockNow` → `closeAudience` (поруч зі `settleRetries`);
  - `resumeClock` (обидві гілки `question`) → `shiftLadderClocks(…, shift)` поруч із `shiftBuffClocks`;
  - `setConnected`, `removePlayer`, `resume` → `settleAudience` (поруч з `autoLock`);
  - `removePlayer` → `audience.ballots` без вилученого (задача 2).
- Changes (`blitz.ts`, `nextDeadline`): у `times` — `endsAt` відкритого голосування залу.
- Changes (`views.ts`, `hintRequests`): додає запит учасника драбини (`lifelines.hint` з `text null`, `aloud false`) з `at` — пульт бачить його в наявному `HostView.hints`.

- [ ] **Step 1: Write the failing tests** (`game.ladder-lifelines.test.ts`; учасник p2, глядачі p1, p3; `rng` — детермінований масив):
  - `50/50 removes two wrong options`: на l1 (правильна b) `rng` `[0, 0]` → `removed` = `['a', 'c']` (перший неправильний з [a, c, d], потім з [c, d]); `lifelinesUsed` = `['fifty']`; на l2 → `buff_used`;
  - `lifelines are the round's, not the quiz buffs`: вікторина без бафів (`settings.buffs` немає) — підказки працюють; `ladderRound(..., { lifelines: ['fifty'] })` → `audience` → `not_allowed`; після драбини в класичному раунді з бафом `fifty` гравець p2 бере 50/50 (`buffsUsed(p2)` порожній);
  - `several lifelines on one question`: 50/50, потім зал, потім підказка на l1 — усі ok;
  - `only the contestant, before answering`: p1 → `not_allowed`; після відповіді p2 → `already_answered`; пауза → `paused`; заставка (`lobbyWithSplash`) → `not_started`; `timer: true` після `endsAt` → `time_over`; на `leaderboard` → `wrong_phase`;
  - `the hall votes with its own answers`: p1 відповів b до підказки; p2 бере зал → `audience.closed false`, `ballots {}`; p3 відповідає c → усі присутні глядачі відповіли → `closed true`, `ballots` = `{ p1: b, p3: c }`; `voteTally(question, ballots).counts` = `{ b: 1, c: 1 }`;
  - `the vote closes on time`: p3 мовчить → `tick(endsAt − 1)` відкрите; `tick(endsAt)` → закрите з `{ p1: b }`; p3 відповідає → `vote_closed`;
  - `the contestant answering closes the vote`: відкрите голосування, p2 відповідає → `closed true`;
  - `no present hall means no audience`: p1 і p3 відключені → `buff_unfit`;
  - `the audience gives the contestant extra time with a timer`: `timer: true` → особистий `overtime[p2]` = `AUDIENCE_MS`; без таймера — без `overtime`;
  - `pause freezes the vote`: пауза посеред голосування на 30 с → `resume` → `endsAt` зсунуто на 30 с; `tick` на паузі нічого не закриває; `nextDeadline` = `endsAt` голосування;
  - `suspend keeps an open vote readable` (`restore.ts`): `suspend` → JSON туди й назад — той самий стан; `resume` через годину — голосування продовжується;
  - `the host hint`: l1 без `hint` → `hint { text: null, aloud: false }`; `hostView.hints` містить p2; `giveHint(p2, 'Подумай про столиці')` → `text`; повторно → `not_found`; `giveHint(p2, null)` на новій драбині → `aloud true`; запитання з `hint` у редакторі → текст одразу, запиту немає;
  - `lifelines across the ladder`: 50/50 на l1, зал на l3 → на l4 доступна лише підказка ведучого; новий раунд «Мільйонер» → усі знову доступні.
  - `restore.test.ts`: `representative()` отримує ще стан із відкритим голосуванням залу (без цього новий ключ `LadderLifelines.audience` не потрапить у перевірку покриття).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine
  git commit -m "feat(engine): ladder lifelines — 50/50 removes two wrong options for everyone, ask the hall tallies the hall's own answers and closes on time, when all voted or when the contestant answers, the host hint goes through the usual hint requests; each once per ladder, several on one question, independent of quiz buffs; the vote pauses and survives a restart"
  ```

### Задача 4. Рушій: ізоляція «Мільйонера» — без бафів, дебафів, дуелей і правил раунду

**Files:**
- Modify: `packages/engine/src/buffs.ts`, `packages/engine/src/debuffs.ts`, `packages/engine/src/duel.ts`
- Test: новий `packages/engine/src/game.ladder-isolation.test.ts`

**Interfaces:**
- Changes (`buffs.ts`): `PlaceBlock` + `'off_ladder'`; у `placeBlock` поруч із «Вибуванням»: `else if (round.type === 'ladder') return 'off_ladder';`. `buffRowHere` → `false`, якщо поточний раунд `ladder` (ряд бафів не показується ні учасникові, ні залу). `takeBuff` → `wrong_phase` (наявна гілка `isOff`).
- Changes (`debuffs.ts`): `debuffsOff` → `(type === 'wipeout' || type === 'ladder') && state.phase !== 'round_end'`; оновити коментар.
- Changes (`duel.ts`): `duelsOff` → і для `ladder`; оновити коментар.
- `rulesOf` (задача 1) уже дає `DEFAULT_RULES`; `totalTimeMs` — лише класика (без змін).

- [ ] **Step 1: Write the failing tests**:
  - Вікторина: бафи `['double', 'fifty']`, дебафи `['fog', 'shake']`, крамниця, дуелі.
  - Раунди: класика `r1` (1 запитання), «Мільйонер» `rl`, класика `r3`.
  - Тести:
  - `buffs are off and the row is hidden`: на l1 `takeBuff(p1, 'double')` → `wrong_phase`; `buffBlock(p1, 'double')` → `off_ladder`; `playerView(p1).me.buffs === null` (ряд схований) і в учасника теж;
  - `debuffs are off in the round`: `setDebuff(p2, 'fog')` на `intro` / `question` / `leaderboard` → `not_allowed`; на `round_end` → ok; `shopBlock` → `'phase'`, `buyDebuff` → `wrong_phase`;
  - `a debuff pending from before waits for the next round`: дебаф, наісланий на p2 у `r1`, не спрацьовує на l1…l5 (`firedAt null`), спрацьовує на першому запитанні `r3`;
  - `no duels in the round`: поріг досягнуто → `duelWindowOpen` false на `intro`, `question`, `leaderboard`; дуель, оголошена в `r1`, не стартує в раунді, стартує на `round_end`;
  - `no round rules`: `rulesOf(rl)` = `DEFAULT_RULES`; у записах залу `streakBonus 0` навіть після трьох правильних поспіль; `roundBrief(rl)` — `penalty false`, `streak null`, `multiplier 1`, `speedBonus false`;
  - `the ladder does not count toward total time`: `totalTimeMs` гравців не змінюється за раунд `rl` з `timer: true`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine
  git commit -m "feat(engine): ladder isolation — no buffs and no buff row (off_ladder), no debuffs from the host or the shop until its round_end, a pending debuff waits for the next round, no duels, no round rules or total time"
  ```

### Задача 5. Зрізи: драбина для всіх, власний стан учасника й залу, приховування до розкриття, підсумок залу після закриття

**Files:**
- Modify: `packages/shared/src/views.ts`, `packages/engine/src/views.ts`
- Test: новий `packages/engine/src/views.ladder.test.ts`; фабрики зрізів у тестах вебу (`apps/web/src/**/*.test.tsx`, де будують `BaseView` / `PlayerView` / `RoundBrief`)

**Interfaces:**
- Produces (`shared/views.ts`):
  ```ts
  /** Сходинка драбини. */
  export interface LadderStep {
    level: number;
    safe: boolean;
    /** passed — пройдена; current — поточна (запитання йде чи щойно розкрите); failed — на ній помилка; ahead — попереду. */
    state: 'passed' | 'current' | 'failed' | 'ahead';
  }

  /** Підказка драбини: ready — можна (за станом, без часу), used — використана раніше, active — узята на цьому запитанні, off — не ввімкнена в раунді не показується. */
  export interface LadderLifelineView {
    kind: LifelineKind;
    state: 'ready' | 'used' | 'active';
  }

  /** «Мільйонер» (10i). */
  export interface LadderInfo {
    contestant: BlitzPlayer | null;
    pick: LadderPick;
    drawn: boolean;
    /** Знизу вгору, у порядку сходинок. */
    steps: LadderStep[];
    /** Поточна сходинка (0-базова); -1 до першого запитання. */
    current: number;
    timer: boolean;
    lifelines: LadderLifelineView[];
    /** 50/50 на поточному запитанні: прибрані варіанти (бачать усі); null — не брали. */
    fifty: string[] | null;
    /** Зал: voting — лише скільки проголосували; closed — підсумок для всіх. */
    audience: {
      state: 'voting' | 'closed';
      endsAt: number | null;
      remainingMs: number | null;
      voted: number;
      total: number;
      /** Лише після закриття; інакше null. */
      tally: { cast: number; counts: Record<string, number> } | null;
    } | null;
    /** Підказка ведучого на поточному запитанні: стан без тексту (текст — лише учасникові й пульту). */
    hint: 'waiting' | 'text' | 'aloud' | null;
    /** Вибір учасника: сцена й телефони — з locked; пульт — наживо. */
    contestantPick: string | null;
    /** Зал на поточному запитанні: answered — наживо; right — лише з розкриття. */
    hall: { answered: number; total: number; right: number | null };
    /** На leaderboard: pending — учасник вирішує; go / take — вирішено; null — поза рішенням. */
    decision: 'pending' | 'go' | 'take' | null;
    /** Підсумок драбини — лише з leaderboard; null — триває. */
    outcome: { kind: LadderOutcomeKind; passed: number; points: number } | null;
    /** Що учасник має зараз (останній пройдений рівень) і гарантовано (неспалимий). */
    banked: number;
    guaranteed: number;
  }

  // BaseView:
  /** «Мільйонер»: від intro до round_end свого раунду (і finished, якщо він останній); інакше null. */
  ladder: LadderInfo | null;

  // PlayerView['me']:
  /** Власний стан у «Мільйонері»; null поза раундом. */
  ladder: {
    role: 'contestant' | 'hall';
    /** Учасник: можна брати підказки зараз (question, не відповів, не пауза; заставку й час перевіряє телефон). */
    canLifeline: boolean;
    /** Учасник: текст підказки ведучого або її стан. */
    hint: PlayerHint | null;
    /** Учасник: рішення відкрите. */
    canDecide: boolean;
    /** Зал: голосування залу закрилося — відповідати пізно. */
    hallClosed: boolean;
    /** Зал: скільки дасть правильна відповідь на поточне запитання (hallPoints). */
    hallPoints: number | null;
    /** Учасник на round_end / finished: виграш; інакше null. */
    won: number | null;
  } | null;
  ```
- Changes (`engine/views.ts`):
  - `ladderInfo(state, forHost)` і `playerLadder(state, playerId)` за зразком `wipeoutInfo` / `playerWipeout`; `LADDER_PHASES` — як `WIPEOUT_PHASES` (+ `intro`);
  - `steps[i].state`:
    - `passed` — пройдені;
    - `current` — поточна на `question`…`reveal`, а на `leaderboard` — `passed` чи `failed` за підсумком;
    - `failed` — сходинка з неправильною відповіддю, лише з `reveal`;
    - `ahead` — решта;
  - `contestantPick` — `optionId` запису учасника: `forHost` з `question`, інакше з `locked`;
  - `hall.right` — з `reveal`;
  - `outcome` — з `leaderboard`;
  - `decision` — на `leaderboard`;
  - `audience.tally` — лише `closed`;
  - `audience.endsAt` — через наявний `voteClock`;
  - `publicQuestion` запитання драбини: `timeLimit` — `timedPlay ? timeLimit : null`;
  - `me.ladder.hint` — `playerHint` (наявний) лише учасникові;
  - `publicStandings`: на `leaderboard` у «Мільйонері» → `null`;
  - `liveTable` — `full`, як у «Ва-банк»;
  - `answeredCount` на сцені — не міняти (сцена бере `ladder.hall`).
- Фабрики зрізів у тестах вебу: `ladder: null`, `me.ladder: null`, `RoundBrief.ladder: null`.

- [ ] **Step 1: Write the failing tests** (`views.ladder.test.ts`):
  - `the intro shows the ladder and who climbs`: `stageView` на `intro` до вибору — `contestant null`, `steps` п'ять з `safe` на сходинці 2, усі `ahead`, `current -1`; після `pickContestant(p2)` — `contestant.nickname 'Петро'`, `drawn false`; після жеребу — `drawn true`;
  - `nothing is decided before the reveal`: p2 відповів b, p1 відповів c на l1 → на `question`: `JSON.stringify(stageView)` і `playerView(p1)` не містять `"correctId"`; `contestantPick null`, `hall { answered: 1, total: 2, right: null }`; пульт — `contestantPick 'b'`; на `locked` — сцена `contestantPick 'b'`; на `reveal` — `hall.right` 0 або 1, `steps[0].state 'current'`;
  - `the outcome only from the leaderboard`: на `reveal` неправильної відповіді — `outcome null`, `steps[k] 'failed'`; на `leaderboard` — `outcome { kind: 'wrong', … }`;
  - `fifty is seen by everyone`: після 50/50 — `ladder.fifty` у сцени й обох телефонів однаковий;
  - `the hall tally only after the vote closes`: під час голосування `audience { state: 'voting', voted: 1, total: 2, tally: null }` у сцени, учасника й пульта; після закриття — `tally.counts` усім;
  - `the hint text only for the contestant and the host`: `stageView.ladder.hint === 'text'`, у `JSON.stringify(stageView)` і `playerView(p1)` немає тексту підказки; `playerView(p2).me.ladder.hint` = `{ state: 'text', text }`; `hostView.hints` до відповіді ведучого містить p2;
  - `me.ladder`:
    - учасник: `role 'contestant'`, `canLifeline` true лише на `question` до відповіді й без паузи, `canDecide` true лише на відкритому рішенні;
    - зал: `role 'hall'`, `hallPoints` 10 на l1, `hallClosed` true після закриття голосування;
    - `won` 1000 на `round_end` в учасника, `null` у залу;
  - `lifelines state`: увімкнені лише `fifty`, `hint` → у `lifelines` два записи; після 50/50 — `active` на цьому запитанні, `used` на наступному;
  - `banked and guaranteed`: після трьох правильних — `banked 1000`, `guaranteed 1000`; після двох — `banked 300`, `guaranteed 0`;
  - `no timer on the phone`: `playerView(p1).question.timeLimit === null` за `timer: false`; 20 за `timer: true`;
  - `the ladder replaces the leaderboard, the table button still works`: на `leaderboard` `stageView.standings === null`, `playerView.standings === null`, `playerView.table` не `null`;
  - `outside the ladder there is none`: класика → `ladder: null`, `me.ladder: null`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared packages/engine apps/web/src
  git commit -m "feat(engine): ladder views — the ladder with safe steps and the current one, the contestant and how they were chosen, lifelines, 50/50 for everyone, the hall tally only once the vote closes, the hint text only for the contestant and the host, the contestant's pick from locked, hall hits from the reveal, the outcome from the leaderboard, own contestant or hall state on the phone, the ladder instead of the leaderboard"
  ```

### Задача 6. Сервер і демо: події драбини, «Мільйонер» в історії й профілі, виграш в історії, раунд у демо

**Files:**
- Modify: `packages/shared/src/events.ts`, `packages/shared/src/history.ts`, `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`, `apps/server/src/recorder.ts`, `apps/server/src/history.ts`, `apps/server/src/db/schema.ts`, `apps/server/scripts/party-quiz.ts`
- Create: `apps/server/src/testing/ladder-game.ts`
- Test: `apps/server/src/socket.test.ts`, `apps/server/src/rooms/manager.test.ts`, `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts`, `apps/server/src/profiles.test.ts`, `apps/server/scripts/demo-quiz.test.ts`

**Interfaces:**
- Produces (`events.ts`):
  ```ts
  /** «Мільйонер»: учасник бере підказку драбини (10i). */
  export const lifelineSchema = z.object({ kind: z.enum(LIFELINES) });
  /** «Мільйонер»: «Забрати гроші» (take true) чи «Граю далі» (10i). */
  export const ladderDecideSchema = z.object({ take: z.boolean() });
  /** «Мільйонер»: ведучий вибирає учасника на заставці раунду (10i). */
  export const ladderPickSchema = z.object({ playerId });
  // ClientToServerEvents:
  'player:lifeline': (payload: z.infer<typeof lifelineSchema>, ack: Ack) => void;
  'player:ladder': (payload: z.infer<typeof ladderDecideSchema>, ack: Ack) => void;
  'host:ladder-pick': (payload: z.infer<typeof ladderPickSchema>, ack: Ack) => void;
  'host:ladder-decide': (payload: z.infer<typeof ladderDecideSchema>, ack: Ack) => void;
  ```
  - Підказка ведучого — наявний `host:hint` (рушій сам веде в драбину).
- Changes (`manager.ts`):
  - `lifeline(room, playerId, kind)` → `useLifeline(state, playerId, kind, now, rng)`;
  - `ladderDecide(room, playerId, take)` → `decideLadder(state, playerId, take, now)`;
  - `hostLadderPick(room, playerId)` → `pickContestant`;
  - `hostLadderDecide(room, take)` → `decideLadder(state, 'host', take, now)`.
  - Розклад тіку бере `nextDeadline` — перевірити тестом, що голосування залу закривається саме за часом.
- Changes (`socket.ts`): чотири `on(...)` за зразком `player:wipeout` / `host:hint` (`safeParse`, ролі: `player:*` — лише гравець, `host:*` — лише ведучий).
- Changes (`db/schema.ts`, `PlayRef`):
  ```ts
  /** «Мільйонер»: учасник, сходинка, підказки, рішення й підсумок (id учасника). */
  ladder?: {
    contestant: string;
    step: number;
    level: number;
    lifelines?: {
      fifty?: string[];
      audience?: { cast: number; counts: Record<string, number> };
      hint?: { text: string | null; aloud: boolean };
    };
    decision?: 'go' | 'take';
    outcome?: { kind: LadderOutcomeKind; passed: number; points: number };
  };
  ```
- Changes (`recorder.ts`):
  - `signature`: окрім `wipeout` і `survival`, ще `ladder` останнього запису (підказки й рішення без зміни фази теж записуються);
  - `save` → `plays`: `PlayRef.ladder` з `Play.ladder`; голосування — лише закрите (`voteTally(question, ballots)` → `cast`, `counts`);
  - коригування `source 'ladder'` пишуться наявним шляхом (перевірити тестом).
- Produces (`shared/history.ts`, `GameQuestionResult`):
  ```ts
  /** «Мільйонер»: учасник, сходинка, підказки, рішення, підсумок і зал на цьому запитанні. */
  ladder?: {
    contestant: string;            // нікнейм
    step: number;                  // з 0
    level: number;
    safe: boolean;
    lifelines: { kind: LifelineKind; removed: string[] | null; tally: { cast: number; counts: Record<string, number> } | null; hint: string | null; aloud: boolean }[];
    decision: 'go' | 'take' | null;
    outcome: { kind: LadderOutcomeKind; passed: number; points: number } | null;
    /** Скільки глядачів відповіли й відгадали. */
    hall: { answered: number; right: number };
  };
  ```
- Changes (`server/history.ts`):
  - для запитань раунду `ladder` — `ladderResult(quiz, plays, index, participants)`: `safe` — з `round.safe` знімка за `step`; `hall` — з рядків-відповідей учасників, крім учасника драбини. Вилучений учасник — нікнейм з учасників гри, як у наявних результатах;
  - коригування `source 'ladder'` у підсумках — як інші джерела (поле `source` у рядку);
  - **профіль:** `unplayedLadder(snapshot, plays, questionsPlayed, participantId, answered)` поруч з `unplayedSurvival`. Запитання раунду «Мільйонер», де учасник гри **не** був учасником драбини й не має рядка-відповіді, не рахуються його запитаннями. *Рішення:* зал відповідає за бажанням, тож мовчання глядача — не помилка. Віднімати в `playerGames` поруч з `unplayedSurvival`; `answered` = множина `questionIndex` рядків гравця.
- Produces (`testing/ladder-game.ts`) — помічник за зразком `testing/survival-game.ts`:
  ```ts
  /** Правильна й неправильна відповідь на l1…l5 (`ladderQuestions`). */
  export const LADDER_RIGHT: Answer[]; export const LADDER_WRONG: Answer[];
  /**
   * Грає одне запитання драбини до етапу leaderboard: contestant — правильно / неправильно / мовчить; hall — відповіді глядачів
   * (true правильно, false неправильно, немає — мовчить); lifelines — що взяти перед відповіддю.
   */
  export function playLadderQuestion(manager: RoomManager, room: Room, plan: { contestant: boolean | null; hall?: Record<string, boolean>; lifelines?: LifelineKind[] }): void;
  ```
- Демо (`party-quiz.ts`): раунд `p-ladder` «Мільйонер: дивні рекорди» перед `p-final`.
  - Налаштування: `pick: 'lowest'`, `lifelines: ['fifty', 'audience', 'hint']`, `timer: false`, `shuffleOptions: false`, `levels: LADDER_PRESETS[7]`, `safe: ladderPresetSafe(levels)` (`[3, 5]`).
  - Сім запитань по 4 варіанти. Факти — перевірені, по одному реченню в коментарі біля кожного; тексти не повторюють інших вікторин (`demo-quiz.test.ts`, `compass-quiz.test.ts` це перевіряють):
    1. «Яка тварина найбільша з тих, що будь-коли жили на Землі?» — синій кит (африканський слон, аргентинозавр, мегалодон);
    2. «Скільки разів на хвилину в середньому б'ється серце колібрі в спокої?» — близько 500 (60, 150, 2000);
    3. «Яке найглибше озеро світу?» — Байкал (Танганьїка, Каспійське море, Верхнє);
    4. «Найвищий водоспад світу?» — Анхель (Ніагарський, Вікторія, Ігуасу);
    5. «Яка найдовша гірська система на суходолі?» — Анди (Гімалаї, Скелясті гори, Урал);
    6. «Яка країна має найбільше островів?» — Швеція (Індонезія, Філіппіни, Канада);
    7. «Яка найменша кістка в тілі людини?» — стремінце (молоточок, ковадло, під'язикова).
    - Факти звірити перед комітом; спірний замінити іншим однозначним.
  - Підказки до 2–3 запитань (поле `hint`) — щоб «Підказка ведучого» в демо працювала й без ведучого.
  - Опис вікторини: «Дев'ять раундів: …, “Мільйонер”, …».
  - Вікторина лишається в межах `LIMITS.maxRounds` (8 → 9) і `LIMITS.maxQuizQuestions`.

- [ ] **Step 1: Write the failing tests**
  - `socket.test.ts`:
    - `player:lifeline` від учасника — ok; невалідне тіло (`kind: 'double'`) → `invalid_payload`; від ведучого → `forbidden`;
    - `player:ladder` від учасника на рішенні — ok; від глядача → `not_allowed`;
    - `host:ladder-pick` на `intro` — ok; від гравця → `forbidden`;
    - `host:ladder-decide` — ok;
    - голосування залу закривається саме за часом без відповідей (фейковий годинник менеджера, як у наявних тестах дедлайнів).
  - `manager.test.ts`: `host:hint` на запит підказки драбини віддає текст учасникові (`playerView(p2).me.ladder.hint.text`).
  - `recorder.test.ts`:
    - після драбини `game.plays[i].ladder` має `contestant`, `step`, `level`, `lifelines.fifty`, `lifelines.audience.counts`, `decision`, а на останньому — `outcome`;
    - рядки `answer` учасника з `points 0` і глядачів з 10 %;
    - рядок коригування `source 'ladder'` з виграшем;
    - рахунок учасника = відповіді + коригування.
  - `history.test.ts` (`history: ladder (10i)`): три учасники, учасник драбини бере 50/50 на l1 і зал на l2, забирає після l3 →
    - у кожного запитання `ladder` з правильними `step`, `level`, `safe`, підказками, `decision`, `hall`;
    - на l3 — `outcome { kind: 'took', points: 1000 }`;
    - коригування виграшу в підсумках з `source 'ladder'`.
  - `profiles.test.ts`: точність глядача, що відповів лише на l1 з трьох запитань драбини, — 1 з 1 (мовчання не рахується); точність учасника — з усіх його відповідей драбини.
  - `demo-quiz.test.ts`:
    - `quizSchema.safeParse(partyQuiz()).success`;
    - є раунд `ladder` із 7 запитаннями по 4 варіанти, `levels` = `LADDER_PRESETS[7]`;
    - `partyQuiz().rounds.length ≤ LIMITS.maxRounds`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared apps/server
  git commit -m "feat(server): ladder — player:lifeline, player:ladder, host:ladder-pick and host:ladder-decide, the hall vote closes on its own deadline, contestant, step, lifelines, decision and outcome in game plays, ladder details per question in the history, the prize as a ladder adjustment, silent hall questions left out of accuracy; a ladder round in the party quiz"
  ```

### Задача 7. Телефон: спільна драбина, підказки одним пальцем, «Граю далі / Забрати», режим залу

**Files:**
- Create: `apps/web/src/screens/LadderBoard.tsx`, `apps/web/src/screens/LadderLifelines.tsx`, `apps/web/src/screens/LadderDecision.tsx`, `apps/web/src/screens/LadderHall.tsx`
- Modify: `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/screens/Buffs.tsx` (лише `export` для `VoteResults`, без зміни вигляду), `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: нові `LadderBoard.test.tsx`, `LadderLifelines.test.tsx`, `LadderDecision.test.tsx`, `LadderHall.test.tsx`; `PlayerScreen.test.tsx`

**Interfaces:**
- Produces:
  ```tsx
  /** Драбина: сходинки згори вниз (верх — найбільша сума), неспалимі — виділені, поточна — підсвічена, пройдені — приглушені; size — сцена, пульт чи телефон (компактна смуга). */
  export function LadderBoard({ info, size }: { info: LadderInfo; size: 'stage' | 'host' | 'phone' }): JSX.Element;

  /** Три кнопки підказок учасника (лише ввімкнені): ready — натискається; used — перекреслена; active — підсвічена. Під ними — підсумок залу (VoteResults) і підказка ведучого. */
  export function LadderLifelines({ view, offsetMs, onUse }: { view: PlayerView; offsetMs: number; onUse: (kind: LifelineKind) => void }): JSX.Element | null;

  /** Рішення учасника: «Граю далі» і «Забрати {banked}», під ними «Гарантовано: {guaranteed}» і «Наступне запитання — за {next}». */
  export function LadderDecision({ info, disabled, onDecide }: { info: LadderInfo; disabled: boolean; onDecide: (take: boolean) => void }): JSX.Element;

  /** Смуга залу над полем відповіді: «Драбину проходить {name}. Відповідай за себе: правильно — +{points}»; після закриття залу — «Зал уже проголосував». */
  export function LadderHall({ view }: { view: PlayerView }): JSX.Element | null;
  ```
- `PlayerScreen.tsx`:
  - `intro` «Мільйонера»:
    - учасникові — `ladderYouClimb` («Ти йдеш на драбину!»);
    - залу — `ladderWhoClimbs` з нікнеймом;
    - до вибору — `ladderWaitPick`;
  - `question`, учасник:
    - `LadderLifelines` над полем відповіді;
    - `AnswerInput` з `removed={view.ladder.fifty ?? []}` (наявний проп);
    - після відповіді — `ladderFinalAnswer` («Остаточна відповідь прийнята»);
  - `question`, зал:
    - `LadderHall` над полем;
    - поле з тими самими `removed`;
    - після закриття голосування поле вимкнене з `ladderHallClosed`;
  - `reveal`:
    - зал — «+N балів» як завжди;
    - учасник — `ladderStepRight` / `ladderStepWrong` замість балів;
  - `leaderboard` у «Мільйонері» замість таблиці:
    - учасник з відкритим рішенням — `LadderDecision`;
    - інакше — підсумок (`ladderOutcome_took` / `_wrong` / `_top` / `_stopped`) або «Граємо далі!»;
    - під цим — компактна `LadderBoard size="phone"`;
  - `send('player:lifeline', { kind })` і `send('player:ladder', { take })` через `useGuardedSend`; помилку з ack показати, як у `WallInput`;
  - `round_end` учасника — `ladderWon` («Твій виграш: {points}»).
- `i18n.ts`:
  - `ladderYouClimb: 'Ти йдеш на драбину!'`, `ladderWhoClimbs: 'Драбину проходить {name}'`, `ladderWaitPick: 'Ведучий вибирає, хто піде на драбину…'`;
  - `ladderLifeline_fifty: '50/50'`, `ladderLifeline_audience: 'Зал'`, `ladderLifeline_hint: 'Підказка'` (або назви бафів з `buff-meta.ts`, якщо вони короткі);
  - `ladderHallVoting: 'Зал голосує: {voted} з {total}'`, `ladderHallResult: 'Що каже зал'`;
  - `ladderFinalAnswer: 'Остаточна відповідь прийнята.'`;
  - `ladderHallBanner: 'Драбину проходить {name}. Відповідай за себе: правильно — +{points}.'`, `ladderHallClosed: 'Зал уже проголосував — на це запитання відповідати пізно.'`;
  - `ladderStepRight: 'Правильно! Сходинка {level}.'`, `ladderStepWrong: 'Неправильно.'`;
  - `ladderGoOn: 'Граю далі'`, `ladderTake: 'Забрати {points}'`, `ladderGuaranteed: 'Гарантовано: {points}'`, `ladderNextFor: 'Наступне запитання — за {points}'`, `ladderPlayingOn: 'Граємо далі!'`;
  - `ladderOutcome_took: '{name} забирає {points}'`, `ladderOutcome_wrong: 'Помилка — {name} отримує {points}'`, `ladderOutcome_top: '{name} пройшов(-ла) драбину: {points}!'`, `ladderOutcome_stopped: 'Драбину зупинено: {name} отримує {points}'`;
  - `ladderWon: 'Твій виграш: {points}'`;
  - `ladderSafe: 'неспалима'`.

- [ ] **Step 1: Write the failing tests**
  - `LadderBoard.test.tsx`: п'ять сходинок згори вниз (перша в DOM — 10 000); неспалима має клас і `aria-label` з «неспалима»; поточна підсвічена; пройдені приглушені; `failed` — позначена.
  - `LadderLifelines.test.tsx`:
    - три кнопки з назвами, ≥ 44 px (клас); `ready` + `canLifeline` → натиск → `onUse('fifty')`; `used` — вимкнена й перекреслена;
    - `canLifeline false` (пауза) — усі вимкнені;
    - під час голосування — `ladderHallVoting`; після закриття — відсотки `VoteResults`;
    - підказка ведучого: `waiting` → `hintWaiting`, `text` → текст, `aloud` → `hintAloud` (наявні ключі).
  - `LadderDecision.test.tsx`: дві кнопки «Граю далі» і «Забрати 1 000» (формат чисел як у наявних екранах); натиск «Забрати» → `onDecide(true)`; `disabled` → без виклику; «Гарантовано: 1 000», «Наступне запитання — за 3 000».
  - `LadderHall.test.tsx`: банер з нікнеймом учасника й «+10»; `hallClosed` → `ladderHallClosed`; учасникові — `null`.
  - `PlayerScreen.test.tsx`:
    - учасник на `question` бачить підказки й поле без прибраних варіантів (`removed` → клас `is-removed`);
    - зал бачить банер;
    - ряду бафів немає (`me.buffs null`);
    - на `leaderboard` з `canDecide` — `LadderDecision`, без `Standings`; натиск «Забрати» шле `player:ladder { take: true }`;
    - `round_end` учасника — `ladderWon`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web` → FAIL.
- [ ] **Step 3: Implement.** Стилі:
  - драбина — класична: темне тло, золоті неспалимі, поточна — яскрава смуга;
  - на телефоні — компактна смуга з поточною і двома сусідніми сходинками;
  - підказки — три кола в ряд, на 375 px без прокрутки вбік;
  - `prefers-reduced-motion` — без анімації підсвітки.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): ladder on the phone — the shared ladder with safe steps, three lifeline buttons with the hall tally and the host hint, removed 50/50 options, play on or take the money with what is guaranteed, the hall banner with its 10 % and too late once the hall voted, the outcome and the prize"
  ```

### Задача 8. Сцена, пульт, історія: драбина поруч із запитанням, підсумок залу, рішення й результат, вибір учасника

**Files:**
- Create: `apps/web/src/screens/HostLadder.tsx`
- Modify: `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/HostScreen.tsx`, `apps/web/src/pages/GameHistory.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `StageScreen.test.tsx`, `HostScreen.test.tsx`, новий `HostLadder.test.tsx`, `GameHistory.test.tsx`

**Interfaces:**
- `StageScreen.tsx`:
  - `intro` «Мільйонера» — під `RoundBriefing` `LadderBoard size="stage"` і картка учасника:
    - до вибору — `ladderStageWho` («Хто піде на драбину?»);
    - після — нікнейм великим і `ladderStageDrawn` («за жеребом» / «найменше балів»), якщо `drawn`;
  - `question` / `locked` — `LadderStage`:
    - зліва запитання з 4 варіантами (прибрані 50/50 — порожні місця);
    - справа `LadderBoard size="stage"`;
    - над варіантами — значки підказок (використані перекреслені);
    - `ladderHallVoting`, а після закриття — `VoteResults` на сцені;
    - з `locked` — вибір учасника підсвічено (`ladderStageFinal` «Остаточна відповідь»);
    - «Зал відповів: N з M» з `ladder.hall`;
  - `reveal` — правильний варіант, вибір учасника зелений / червоний, `ladderStageHall` («Зал: {right} з {answered} відгадали — по +{points}»);
  - `leaderboard` у «Мільйонері» — `LadderBetween`:
    - `LadderBoard size="stage"` великою;
    - `decision 'pending'` → `ladderStageDeciding` («{name} вирішує: грати далі чи забрати {banked}?»);
    - `'go'` → `ladderPlayingOn`;
    - підсумок → `ladderOutcome_*` великими літерами;
  - `round_end` — як завжди (таблиця).
  - `expectStageFits` у задачі 11 перевіряє 1280 × 720.
- `HostLadder.tsx`:
  ```tsx
  /** Пульт «Мільйонера»: на intro — вибір учасника (список гравців, «Вибрати»), далі — учасник, сходинка, вибір наживо, підказки, зал, рішення замість учасника («Грає далі» / «Забирає»), «ⓘ» раунду. */
  export function HostLadder({ view, offsetMs, send }: { view: HostView; offsetMs: number; send: Send }): JSX.Element | null;
  ```
  - `intro`: кнопки гравців (≥ 44 px), поточний вибір позначено; відключені — вимкнені з «не на зв'язку»; натиск → `host:ladder-pick { playerId }`.
  - `question`: «{name} вибрав(-ла): {option}» наживо або «думає…»; підказки; голосування залу наживо.
  - `leaderboard` з відкритим рішенням: «Грає далі» / «Забирає {banked}» → `host:ladder-decide { take }`.
  - Запит підказки — наявні `HintRequests` (`view.hints`) у `HostScreen` на `question`, нічого не дублювати.
- `HostScreen.tsx`:
  - `HostLadder` на етапах раунду;
  - головна дія:
    - `intro` без учасника: `pick 'host'` → кнопка вимкнена з `ladderPickFirst`; `random` / `lowest` → `ladderDraw` («Вибрати учасника»);
    - `intro` з учасником → `ladderStart` («Почати драбину»);
    - `leaderboard` з `decision 'pending'` → вимкнена `ladderDecidingWait` («Учасник вирішує…»);
    - підсумок → `ladderToResults` («Підсумки раунду») або `next` в останньому раунді;
    - інакше — «Наступне запитання».
  - Меню дебафів біля гравців у «Мільйонері» не показується (`debuffsOff` уже ховає дії) — перевірити тестом.
- `GameHistory.tsx`: для запитання з `ladder` — під відповідями:
  - `historyLadderStep: '{name} · сходинка {n} · {level}'` (+ `historyLadderSafe: '(неспалима)'`);
  - підказки: `historyLadderFifty: '50/50: прибрано {options}'`, `historyLadderAudience: 'Зал: {list}'` (відсотки за варіантами), `historyLadderHint: 'Підказка ведучого: {text}'` / `historyLadderHintAloud: 'Підказка ведучого — уголос'`;
  - `historyLadderTook: '{name} забрав(-ла) {points}'`, `historyLadderWrong: 'Помилка — {name} отримує {points}'`, `historyLadderTop: '{name} пройшов(-ла) драбину: {points}'`, `historyLadderStopped: 'Драбину зупинено: {points}'`, `historyLadderGo: 'Грає далі'`;
  - `historyLadderHall: 'Зал: {right} з {answered} відгадали'`;
  - коригування `source 'ladder'` — `historyLadderPrize: 'Виграш драбини: {name} +{points}'` (у тому ж блоці, де коригування дуелей, дебафів і бонусу виживання).
- `i18n.ts`:
  - `ladderStageWho: 'Хто піде на драбину?'`, `ladderStageDrawn_random: 'за жеребом'`, `ladderStageDrawn_lowest: 'найменше балів'`;
  - `ladderStageFinal: 'Остаточна відповідь'`, `ladderStageHall: 'Зал: {right} з {answered} відгадали — по +{points}'`, `ladderStageDeciding: '{name} вирішує: грати далі чи забрати {points}?'`;
  - `ladderPickFirst: 'Виберіть учасника'`, `ladderDraw: 'Вибрати учасника'`, `ladderStart: 'Почати драбину'`;
  - `ladderDecidingWait: 'Учасник вирішує…'`, `ladderToResults: 'Підсумки раунду'`;
  - `hostLadderPick: 'Хто йде на драбину'`, `hostLadderPicked: '{name} вибрав(-ла): {option}'`, `hostLadderThinking: 'думає…'`, `hostLadderGoOn: 'Грає далі'`, `hostLadderTake: 'Забирає {points}'`, `hostLadderOffline: 'не на зв\'язку'`.

- [ ] **Step 1: Write the failing tests**
  - `StageScreen.test.tsx`:
    - `intro` — драбина й `ladderStageWho`, після вибору — нікнейм;
    - `question` — запитання й драбина поруч, прибрані варіанти не показані, `ladderHallVoting`;
    - `locked` — `ladderStageFinal` біля вибору учасника;
    - `reveal` — `ladderStageHall`;
    - `leaderboard` — `ladderStageDeciding`, без `Standings`; з підсумком `took` — `ladderOutcome_took`.
  - `HostLadder.test.tsx`: на `intro` клік на «Петро» шле `host:ladder-pick { playerId: 'p2' }`; відключений вимкнений; на рішенні «Забирає 1 000» шле `host:ladder-decide { take: true }`; «ⓘ» з `round.ladder`; вибір учасника наживо.
  - `HostScreen.test.tsx`: головна кнопка — вимкнена `ladderPickFirst` (`pick 'host'`, без учасника), `ladderDraw` (`random`), `ladderStart` (з учасником), вимкнена `ladderDecidingWait` на рішенні, `ladderToResults` з підсумком.
  - `GameHistory.test.tsx`: рядки сходинки, 50/50, залу, підказки, рішення, підсумку, залу й виграшу.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): ladder on the stage, host and history — the question beside a classic ladder with safe steps, lifeline icons, the hall tally once closed, the final answer from locked, hall hits on the reveal, deciding, playing on or the outcome between questions; the host picks or draws the contestant, sees the pick live and decides for the contestant; steps, lifelines, decisions, outcomes and the prize in the history"
  ```

### Задача 9. Редактор: «Мільйонер» — запитання по 4 варіанти, рівні й неспалимі, учасник, підказки, таймер

**Files:**
- Modify: `apps/web/src/editor/QuizEditor.tsx`, `apps/web/src/editor/RoundSettings.tsx`, `apps/web/src/editor/QuestionEditor.tsx`, `apps/web/src/editor/draft.ts`, `apps/web/src/i18n.ts`
- Test: `apps/web/src/editor/QuizEditor.test.tsx`, `apps/web/src/editor/draft.test.ts`

**Interfaces:**
- `QuestionEditor.tsx`: новий проп `fixedOptions?: number`. Коли заданий, рядки варіантів мають `min = max = fixedOptions` (кнопок «додати / прибрати варіант» немає). Типово — без змін.
- `draft.ts`:
  - `problemsOf`:
    - раунд `ladder` з менш ніж `LIMITS.minLadderQuestions` запитаннями → `problemLadderFew`; з більш ніж `maxLadderQuestions` → `problemLadderMany`;
    - запитання не `single` чи варіантів ≠ 4 → `problemLadderType`;
    - рівні не зростають чи > `maxLadderLevel` → `problemLadderLevels`;
    - неспалима верхня сходинка → `problemLadderSafe`;
    - в останній перевірці схемою: `ladder_type` → `problemLadderType`, `ladder_levels` → `problemLadderLevels`, `ladder_safe` → `problemLadderSafe`, `ladder_lifelines` → `problemLadderType` (не буває з редактора; на всяк випадок).
  - `resizeLadder(round, count): LadderRound`:
    - якщо `levels` дорівнює `LADDER_PRESETS[old]` і `safe` дорівнює `ladderPresetSafe(levels)` → новий пресет і його `safe`;
    - інакше: додавання → `levels` + `min(maxLadderLevel, last + 1000)`; вилучення → без верхнього рівня;
    - `safe` без індексів ≥ `count − 1`.
- `QuizEditor.tsx`:
  - «Додати запитання» в раунді `ladder` → `newLadderQuestion()` і `resizeLadder`;
  - `roomForMore` — `questions.length < LIMITS.maxLadderQuestions` і загальний ліміт вікторини;
  - кнопка «Видалити» вимкнена на `LIMITS.minLadderQuestions` з підказкою `ladderMinHint`; видалення → `resizeLadder`;
  - у списку запитань — чип суми рівня сходинки (як ціна в «Ва-банк»), з 🛡 для неспалимої;
  - `QuestionEditor`:
    - `types={['single']}`, `fixedOptions={LIMITS.ladderOptions}`;
    - `showPoints={false}`, `showReveal={false}`, `allowCloud={false}`;
    - `showTime={round.timer}`;
    - `showHint` — так: підказка з редактора для «Підказки ведучого».
- `RoundSettings.tsx` для `ladder`:
  - назва, опис, «Перемішувати варіанти» — як у «Ва-банк»; правил і бонусу за швидкість немає (`ladderSettingsNote`);
  - блок «Мільйонер» з `HelpButton id="round.ladder"`:
    - «Хто йде на драбину»: три радіо `ladderPick_host` / `ladderPick_random` / `ladderPick_lowest` (≥ 44 px);
    - «Підказки»: три прапорці `ladderLifeline_fifty` / `_audience` / `_hint` (порядок `LIFELINES`);
    - «Таймер на запитання»: прапорець; підпис `ladderTimerNote`;
    - «Драбина»: рядок на кожну сходинку згори вниз: «{n}» · поле суми (1…`maxLadderLevel`, крок 50) · прапорець «неспалима» (на верхній вимкнений) · кнопка «Пресет» (`ladderUsePreset`) повертає `LADDER_PRESETS[count]` і його `safe`.
- `RoundStrip.tsx` — без змін (кнопка «Мільйонер» з «ⓘ» з'являється сама з `ROUND_TYPES`). Перевірити тестом.
- `i18n.ts`:
  - `problemLadderFew: 'У «Мільйонері» щонайменше {min} запитань.'`, `problemLadderMany: 'У «Мільйонері» щонайбільше {max} запитань.'`;
  - `problemLadderType: 'У «Мільйонері» лише запитання «один варіант» з рівно 4 варіантами.'`;
  - `problemLadderLevels: 'Суми рівнів мають зростати знизу вгору й не перевищувати {max}.'`;
  - `problemLadderSafe: 'Верхня сходинка не буває неспалимою.'`;
  - `ladderMinHint: 'Менше {min} запитань у «Мільйонері» не буває.'`;
  - `ladderSettingsNote: 'Правил балів, бафів, дебафів і дуелей у «Мільйонері» немає — лише свої підказки.'`;
  - `ladderPickTitle: 'Хто йде на драбину'`, `ladderPick_host: 'Вибирає ведучий'`, `ladderPick_random: 'Жереб'`, `ladderPick_lowest: 'Найменше балів'`;
  - `ladderLifelinesTitle: 'Підказки (кожна раз за драбину)'`;
  - `ladderTimer: 'Таймер на запитання'`, `ladderTimerNote: 'Без таймера учасник думає скільки треба; час кожного запитання — у самому запитанні.'`;
  - `ladderLevelsTitle: 'Драбина'`, `ladderLevel: 'Сума сходинки {n}'`, `ladderSafeMark: 'неспалима'`, `ladderUsePreset: 'Типові суми'`.

- [ ] **Step 1: Write the failing tests**
  - `draft.test.ts`:
    - `problemsOf` для 4 запитань → `problemLadderFew`; запитання з 3 варіантами → `problemLadderType`; рівні `[100, 300, 300, …]` → `problemLadderLevels`; `safe` з верхньою → `problemLadderSafe`; заповнений раунд → без проблем;
    - `resizeLadder`: з пресету 5 до 6 → `LADDER_PRESETS[6]` і його `safe`; змінені рівні 5 → 6 → додано `min(10000, last + 1000)`; 6 → 5 → без верхнього, `safe` без індексу 4.
  - `QuizEditor.test.tsx`:
    - «+ Раунд» → «Мільйонер» → вкладка з п'ятьма запитаннями, чипи сум 100…10 000, 🛡 біля 1000;
    - у запитанні — лише тип «один варіант», рівно 4 варіанти без кнопок додати / прибрати, без поля ціни, без часу (таймер вимкнено);
    - «Додати запитання» → шосте, суми — пресет 6; видалення вимкнене на п'яти;
    - радіо «Жереб» → `pick 'random'`; зняти «Зал» → `lifelines` без `audience`;
    - «Таймер на запитання» → поле часу в запитанні з'являється;
    - зміна суми сходинки 3 на 1200 → `levels[2] = 1200`; прапорець «неспалима» на сходинці 4 → `safe` містить 3; верхній прапорець вимкнений; «Типові суми» повертає пресет;
    - у налаштуваннях раунду немає «Мінус за помилку» й «Бонус за швидкість».
  - Наявні тести `QuestionEditor` / `QuizEditor` — зелені без змін.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): editor for the ladder — five four-option questions to start, level chips with safe marks in the list, a ladder table with sums, safe steps and preset sums that follow the question count, host, random or lowest-score contestant, lifeline toggles, an optional timer, no round rules"
  ```

### Задача 10. Довідка ведучого: «Мільйонер» і оновлені записи бафів, дебафів, дуелей і налаштувань

**Files:**
- Modify: `apps/web/src/help/rounds.ts`, `apps/web/src/help/powers.ts`, `apps/web/src/help/settings.ts`, `apps/web/src/i18n.ts`, `apps/web/src/screens/HostLadder.tsx`
- Test: `apps/web/src/help/host-help.test.ts`

**Interfaces:**
- `ROUND_HELP.ladder`:
  - **title** `'Мільйонер'`.
  - **what:** «Один учасник іде драбиною запитань з чотирма варіантами. Кожна правильна відповідь — сходинка вгору; перед кожним наступним запитанням він може забрати гроші. Решта — зал: відповідає за себе й отримує 10 % суми рівня.»
  - **how:**
    - «На заставці раунду виберіть учасника на пульті. За жеребом чи “найменшими балами” натисніть “Вибрати учасника” — сцена покаже, хто йде. До першого запитання учасника можна замінити.»
    - «Учасник відповідає на запитання по черзі; запитання бачать і сцена, і всі телефони. Вибір учасника сцена показує, щойно запитання закрилося.»
    - «Після “Показати відповідь” і “Далі” сцена показує драбину. Якщо відповідь правильна, учасник вибирає на телефоні “Граю далі” чи “Забрати”. Якщо він вирішив уголос або випав зі зв'язку, вирішіть за нього на пульті.»
    - «Неправильна відповідь чи мовчання — драбина закінчується, учасник отримує суму останньої пройденої неспалимої сходинки (або нічого). Правильна відповідь на останнє запитання — верхня сума.»
    - «Підказки: 50/50 прибирає два неправильні варіанти (бачать усі); “Зал” — відсотки відповідей залу (поки зал голосує, ${AUDIENCE_SECONDS} с, решта бачить лише лічильник; хто не встиг, на це запитання вже не відповідає); “Підказка ведучого” — текст із редактора або ваша підказка з пульта. Кожна — раз за драбину, на одному запитанні можна кілька.»
    - «Таймер на запитання — за бажанням; без нього учасник думає скільки треба, а запитання закриваєте ви.»
    - «Завершити раунд посеред драбини — учасник забирає те, що вже пройшов.»
    - Де `AUDIENCE_SECONDS` = `AUDIENCE_MS / 1000` (імпорт з `@quiz/engine` чи число 15 з коментарем, як у наявному записі бафу «Зал»).
  - **points:**
    - `` `Учасник виграє суму рівня, а не суму запитань: до ${LIMITS.maxLadderLevel} балів. Виграш додається одним рядком «Виграш драбини».` ``
    - «Відповіді учасника рахуються в точність, але самі балів не дають.»
    - «Зал отримує 10 % суми рівня за кожну правильну відповідь; на учасника це не впливає. Мовчання залу не псує точності.»
  - **tip:**
    - «Хочете кількох учасників — додайте кілька раундів “Мільйонер” (наприклад, з вибором “найменше балів”).»
    - «Ставте неспалимі сходинки на третину й дві третини драбини — так ризик відчутний, але не руйнівний.»
    - «Запишіть підказку в запитання — тоді “Підказка ведучого” не відволікатиме вас посеред гри.»
  - **limits:**
    - `` `${LIMITS.minLadderQuestions}–${LIMITS.maxLadderQuestions} запитань «один варіант», у кожному рівно ${LIMITS.ladderOptions} варіанти.` ``
    - `` `Суми сходинок зростають знизу вгору, до ${LIMITS.maxLadderLevel}; верхня не буває неспалимою.` ``
    - «Бафи вікторини, дебафи (від ведучого й з крамниці) і дуелі в цьому раунді не діють; дебаф, що чекав, і оголошена раніше дуель — після раунду.»
    - «Правил раунду немає: ні множника, ні мінуса, ні серій, ні бонусу за швидкість.»
    - «Між запитаннями сцена показує драбину, а не таблицю; кнопка “Таблиця” в телефоні працює.»
    - «Учасник — один на раунд, його не можна змінити після першого запитання.»
- Пов'язані записи:
  - `help/powers.ts`:
    - `EXCL` — «…у фіналі, у “Ва-банк”, “Вибуванні” й “Мільйонері”, на запитаннях…»;
    - записи `fifty`, `audience`, `hint` — додати рядок «У “Мільйонері” це окрема підказка драбини: вмикається в раунді, діє раз за драбину й не забирає бафу»;
    - `WAITS` (дебафи) — «У “Мільйонері” дебафів немає: дебаф, що чекає, спрацює в наступному раунді.»
  - `i18n.ts`: `buffHelpNone` і `guideBuffsWhere` узгодити з `EXCL` («…“Ва-банк”, “Вибування”, “Мільйонер”, …»). Знайти й доповнити інші переліки «де не діє» (`grep -n "Вибуван" apps/web/src/i18n.ts` — тексти крамниці, дуелей, гайда).
  - `help/settings.ts`:
    - `leaderboard` — «у “Мільйонері” між запитаннями завжди драбина»;
    - `speedBonus`, `penalty`, `partial`, `streak`, `multiplier` — «у “Мільйонері” не діють»;
    - `debuffShop` — «у “Мільйонері” крамниця закрита»;
    - `duels` — «у “Мільйонері” дуелі не оголошуються й не починаються; оголошена раніше почнеться після раунду»;
    - `buffs` — «у “Мільйонері” бафи вікторини не діють, там свої підказки».
  - `help/rounds.ts`: `round.wipeout` (`tip`) — «Схожа драбина для одного гравця — раунд “Мільйонер”».
- `HostLadder.tsx`: «ⓘ» з `round.ladder` біля заголовка панелі (якщо ще немає з задачі 8).

- [ ] **Step 1: Write the failing tests** (`host-help.test.ts`):
  - наявні загальні тести (кожен тип раунду має запис, назва = `t(ROUND_NAMES.ladder)`, теми за `ROUND_TYPES`) покривають `round.ladder` самі. Додати:
    - `expect(text('round.ladder')).toContain(String(LIMITS.maxLadderLevel))`;
    - `.toContain(\`${LIMITS.minLadderQuestions}–${LIMITS.maxLadderQuestions}\`)`;
    - `.toContain('10 %')`, `.toContain('неспалим')`, `.toContain('раз за драбину')`, `.toContain('Забрати')`;
    - кожен баф: «Обмеження» містить «Мільйонері» (через оновлений буквальний `EXCL`);
    - `buff.fifty`, `buff.audience`, `buff.hint` згадують «підказка драбини»;
    - `setting.debuffShop`, `setting.duels`, `setting.leaderboard`, `setting.speedBonus` згадують «Мільйонері»;
    - `searchHelp('мільйонер')` містить `round.ladder`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/help` → FAIL.
- [ ] **Step 3: Implement.** Тексти звірити з рушієм (задачі 2–4):
  - жереб окремим «Далі»;
  - заміна учасника до першого запитання;
  - рішення без таймера, ведучий вирішує за учасника;
  - неспалима сума при помилці;
  - зал = відповіді «за себе», після закриття відповідати пізно;
  - кілька підказок на одне запитання;
  - «Завершити раунд» = забрати пройдене;
  - дебафи, бафи й дуелі не діють.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "docs(web): host help for the ladder (picking or drawing the contestant, play on or take the money, a mistake falls to the safe sum, the top sum, three lifelines once per ladder with several per question, the hall answers for itself for 10 % and is too late after its vote, an optional timer, ending keeps what was passed, no buffs, debuffs, duels or round rules); buff, debuff, duel, leaderboard and rules entries updated; ⓘ on the host ladder panel"
  ```

### Задача 11. Наскрізний сценарій 10i з кадрами

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–10. Помічники:
  - `open`, `register`, `join`, `shot`, `afterSplash`, `expectNoSideScroll`, `expectStageFits`, `field`, `click`;
  - `snapshot`, `socketFrames`, `framesBeforeReveal`, `scoreOf`, `toNextQuestion`;
  - `rigged` (черга граней для `rng` сервера: грань f → `(f − 1) / 6 + 0.01`).
- Нові помічники у файлі:
  ```ts
  /** Сходинка, підсвічена на драбині сцени чи пульта (номер з 1). */
  async function ladderCurrent(page: Page): Promise<number>;
  /** Натискає підказку драбини на телефоні учасника. */
  async function useLifeline(page: Page, name: '50/50' | 'Зал' | 'Підказка'): Promise<void>;
  ```
  - *Важливо:* `rigged.push(1, 1)` викликати **безпосередньо перед** натиском 50/50: раунд без перемішування, тож `rng` тягне лише 50/50 (грань 1 → 0,01 → перший неправильний з тих, що лишилися, двічі).

- [ ] **Step 1: Add the scenario** у кінець файлу за зразком 10h:
  ```ts
  it('part 10i: ladder — the editor builds a ladder round with levels, safe steps, contestant pick, lifelines and a timer flag (375 px too), the host picks the contestant, 50/50 and ask the hall with the hall answering for itself for 10 %, play on and take the money at a safe level, a lowest-score contestant with the host hint falls to the safe sum, no buffs or debuffs, the ladder instead of the leaderboard, nothing leaks before the reveal or the hall vote closing, ladder details and the prize in the history', async () => {
    try {
      await ladderGame();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Підготовка `ladderGame()`:**
  1. `const host = await open('host10i', 1280, 900); await register(host, 'host', 'Ірина Ведуча', 'host10i@example.com');`
  2. Вікторина «Мільйонер 10i» через `POST /api/quizzes`. `settings: { leaderboard: 'each', buffs: ['double'], debuffs: ['fog'] }`. Два раунди «Мільйонер», кожен `shuffleOptions: false`, `levels: [100, 300, 1000, 3000, 10000]`, запитання — `single` з 4 варіантами, `points: 0`, `timeLimit: 20`:
     - `rl1` «Драбина Олі»: `pick 'host'`, `lifelines ['fifty', 'audience', 'hint']`, `timer: false`, `safe: [2]`:
       - `a1` «Столиця Австралії?» (Сідней / Канберра / Мельбурн / Перт), правильна Канберра;
       - `a2` «Скільки континентів на Землі за найпоширенішою моделлю?» (5 / 6 / 7 / 8), правильна 7;
       - `a3` «Хімічний символ золота?» (Ag / Au / Gd / Go), правильна Au;
       - `a4` «Хто написав “Кобзар”?» (Франко / Шевченко / Леся Українка / Котляревський), правильна Шевченко;
       - `a5` «Найбільший океан?» (Атлантичний / Індійський / Тихий / Північний Льодовитий), правильна Тихий;
     - `rl2` «Драбина за балами»: `pick 'lowest'`, `lifelines ['hint']`, `timer: true`, `safe: [0]`:
       - `b1` «Скільки днів у високосному році?» (365 / 366 / 364 / 360), 366;
       - `b2` «Яка планета — Червона?» (Венера / Марс / Юпітер / Меркурій), Марс;
       - `b3` «У якому році проголошено незалежність України?» (1989 / 1990 / 1991 / 1992), 1991;
       - `b4`, `b5` — будь-які однозначні (не граються).
     - У запитаннях підказок з редактора немає (щоб «Підказка ведучого» йшла через пульт).

  **Кроки з перевірками й кадрами (у такому порядку):**
  1. **Редактор (1280 × 900).** «Редагувати» у «Мільйонер 10i»:
     - вкладка «Драбина Олі»: блок «Мільйонер» з «ⓘ», «Вибирає ведучий», три підказки ввімкнені, таймер вимкнено, таблиця сум 100…10 000 з «неспалима» на 1000 → кадр `p10i-editor-ladder`;
     - у запитанні рівно 4 варіанти без кнопок додавання й лише тип «один варіант»;
     - «+ Раунд» → «Мільйонер» → новий раунд із п'ятьма запитаннями → кадр `p10i-editor-new-ladder`; прибрати новий раунд;
     - 375 × 812: `expectNoSideScroll(host, 'p10i-editor-ladder-375')` → назад 1280 × 900;
     - «Зберегти» без змін → `/quizzes`.
  2. **Гра.**
     - «Грати» → `code`, `stageUrl`; `stage = open('stage10i', 1280, 720)`; `socketFrames(stage)`.
     - `olya`, `petro`, `vira` — `open(…, 375, 812)`, `join` («Оля», «Петро», «Віра»); `socketFrames` кожного.
     - «Почати гру» → `afterSplash`.
  3. **Intro `rl1`.**
     - Сцена: драбина й «Хто піде на драбину?» → кадр `p10i-stage-intro` (`expectStageFits`).
     - Пульт: головна кнопка вимкнена «Виберіть учасника»; клік «Оля» у `HostLadder` → сцена показує «Оля»; пульт «Почати драбину» → `afterSplash`.
  4. **a1 — 50/50, зал відповідає за себе.**
     - Телефон Олі: три підказки, ряду бафів немає → кадр `p10i-phone-contestant` + `expectNoSideScroll(olya, …)`.
     - Телефон Петра: банер «Драбину проходить Оля… +10» → кадр `p10i-phone-hall`.
     - Пульт: дебафів біля гравців немає.
     - `rigged.push(1, 1)` → Оля «50/50» → у всіх трьох телефонах і на сцені видно лише два варіанти (Канберра й Перт: прибрано Сідней і Мельбурн) → кадр `p10i-stage-fifty`.
     - Петро «Канберра», Віра «Перт». Оля «Канберра» → закрилося.
     - **Перевірка витоку:** `framesBeforeReveal` кадрів сцени, Петра й Віри для a1 не містять `"correctId"`; у кадрах сцени на `question` — `"contestantPick":null`.
     - Reveal → сцена «Зал: 1 з 2 відгадали — по +10» → кадр `p10i-stage-reveal`; телефон Петра «+10».
     - «Далі» → сцена «Оля вирішує…»; пульт вимкнена «Учасник вирішує…» → кадр `p10i-stage-deciding`.
     - Телефон Олі: «Граю далі» / «Забрати 100» → кадр `p10i-phone-decision`; «Граю далі».
     - «Таблиця» на телефоні Віри відкривається → закрити.
  5. **a2 — зал.**
     - Оля «Зал» → сцена «Зал голосує: 0 з 2».
     - **Перевірка витоку:** у кожному кадрі сцени й Олі, де `ladder.audience.state === 'voting'` (розібрати JSON кадру), `tally === null`.
     - Петро «7», Віра «7» → голосування закрилося само → сцена й телефон Олі показують 100 % за «7» → кадр `p10i-stage-hall-tally`.
     - Оля «7» → reveal → «Далі» → «Граю далі».
  6. **a3 — неспалима, «Забрати».**
     - Оля «Au», Петро «Ag», Віра «Gd» (запитання закривається, лише коли відповіли учасник і весь присутній зал) → reveal → «Далі» → телефон Олі «Забрати 1 000».
     - Сцена «Оля забирає 1 000», драбина з підсвіченою 1000 → кадр `p10i-stage-took` (`expectStageFits`).
     - Пульт «Підсумки раунду» → `round_end`.
     - Рахунки: `scoreOf(host, 'Оля')` = 1000; `Петро` = 10 + 30 = 40; `Віра` = 30.
  7. **Intro `rl2` — найменше балів.**
     - Пульт «Вибрати учасника» → сцена «Віра · найменше балів» → кадр `p10i-stage-drawn`. «Почати драбину» → `afterSplash`.
  8. **b1–b3 — підказка ведучого, падіння до неспалимої.**
     - b1: телефон Віри показує відлік (таймер увімкнено); Оля «366», Петро «365», Віра «366» → reveal → «Далі» → «Граю далі».
     - b2: Віра «Підказка» → пульт «Віра просить підказку» → ввести «Її називають Червоною» → «Надіслати» → телефон Віри показує текст → кадр `p10i-phone-hint`. На сцені тексту немає (`bodyText(stage)` не містить «Червоною»). Оля «Марс», Петро «Венера», Віра «Марс» → reveal → «Далі» → «Граю далі».
     - b3: Оля «1991», Петро «1990», Віра «1990» → reveal → «Далі» → сцена «Помилка — Віра отримує 100» → кадр `p10i-stage-wrong`.
     - Пульт «Підсумки раунду» → `finished` (останній раунд; заставка «Підсумки»).
     - Рахунки: `Віра` = 30 + 100 = 130; `Оля` = 1000 + 30 + 10 + 100 = 1140; `Петро` = 40.
     - Телефон Віри «Твій виграш: 100» → кадр `p10i-phone-won`.
  9. **Історія.** Пульт → «Мої ігри» → «Мільйонер 10i»:
     - у a1 — «Оля · сходинка 1 · 100», «50/50: прибрано Сідней, Мельбурн», «Зал: 1 з 2 відгадали»;
     - у a2 — «Зал: 7 — 100 %»;
     - у a3 — «Оля забрав(-ла) 1 000», «(неспалима)»;
     - у b2 — «Підказка ведучого: Її називають Червоною»;
     - у b3 — «Помилка — Віра отримує 100»;
     - «Виграш драбини: Оля +1000», «Виграш драбини: Віра +100» → кадр `p10i-history`.
- [ ] **Step 2: Run** `pnpm build`, потім у фоні `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 10i"` → PASS. Переглянути кадри `p10i-*`:
  - драбина читається з 3 м, неспалимі виділені;
  - запитання й драбина поміщаються на сцені 1280 × 720;
  - кнопки підказок і рішення великі на телефоні;
  - нічого не обрізано.
- [ ] **Step 3: Повний прогін** у фоні (≈ 12 хв): `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts` → усі сценарії PASS.
- [ ] **Step 4: Commit**
  ```bash
  git add apps/server/e2e
  git commit -m "test: part 10i end-to-end — the editor builds a ladder round (375 px too); the host picks the contestant; 50/50 for everyone and ask the hall from the hall's own answers; the hall earns 10 %; play on and take the money at the safe level; a lowest-score contestant asks the host for a hint and falls to the safe sum; no buffs or debuffs; the ladder instead of the leaderboard; nothing leaks before the reveal or the hall vote closing; ladder details and the prize in the history"
  ```
