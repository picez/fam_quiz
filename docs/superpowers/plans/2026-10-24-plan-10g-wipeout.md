# План 10g: Раунд «Ва-банк» (`wipeout`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 10g специфікації (розділ 11) і правила розділу 14a для «Ва-банк». Це **перший новий тип раунду** в підпроєкті 10: досі частини 10b–10f додавали типи запитань.
- **«Ва-банк» (`wipeout`)** — новий тип раунду. Ведучий задає 5–15 запитань простих типів (один варіант, так/ні, число, текст, повзунок). Ціну кожного задає сам, редактор пропонує зростаючі.
- **Як іде.** Усі, хто ще «в грі», отримують те саме запитання одночасно.
  - Правильна відповідь додає ціну в **банк раунду** гравця.
  - Неправильна або відсутня відповідь обнуляє банк. Гравець **згорає**: до кінця раунду дивиться, але не грає.
  - Після розкриття кожного запитання, крім останнього, гравці, що лишилися, вибирають на телефоні «Далі» або «Забрати». На це є коротке вікно. Хто забрав, переносить банк у свої бали й далі дивиться.
  - Після останнього запитання банки тих, хто вцілів, переносяться в бали самі.
- **Ізоляція (14a).** У раунді не діють бафи, дебафи (ні з крамниці, ні від ведучого), дуелі й правила раунду (множник, штраф, серії, бонус за швидкість). Між запитаннями сцена показує драбину, а не таблицю. Кнопка «Таблиця» на телефоні працює. Банк можна забрати після будь-якого запитання, на яке гравець відповів правильно. Окремого налаштування для цього немає.
- **Сцена:** драбина цін із поточним кроком і стан кожного гравця: у грі (з банком), забрав, згорів. **Пульт:** те саме, а ще рішення наживо, пауза й ручна оцінка текстової відповіді, як у класиці.
- **Історія** зберігає наслідок для кожного гравця на кожному кроці. **Профіль** рахує відповіді як завжди.
- **Довідка ведучого:** запис `round.wipeout` (typecheck вимагає) і оновлені записи бафів, дебафів, дуелей і налаштувань.
- **Демо:** короткий раунд `r-wipeout` у `demo` перед фіналом.

**Архітектура:**
- **Shared (`packages/shared/src/quiz.ts`, новий `wipeout.ts`, `round-brief.ts`, `game.ts`, `views.ts`, `events.ts`, `history.ts`, `index.ts`).**
  - `wipeoutRoundSchema` (без `rules` і `speedBonus`), `ROUND_TYPES` + `'wipeout'`, `WIPEOUT_TYPES`.
  - Ліміти: `LIMITS.minWipeoutQuestions` 5, `LIMITS.maxWipeoutQuestions` 15, `LIMITS.wipeoutDecideSeconds` 10.
  - Код вікторини `wipeout_type`. `rulesOf(wipeout)` → `DEFAULT_RULES`.
  - Новий `wipeout.ts`: чиста функція драбини `wipeoutStandings` і типи `WipeoutStatus`, `WipeoutStep`, `WipeoutStanding`. Її спільно викликають рушій і історія сервера.
  - Код помилки `deciding`, причина бафу `off_wipeout`.
  - Подія `player:wipeout { take }`. Зрізи `BaseView.wipeout: WipeoutInfo | null` і `PlayerView.me.wipeout`. Історія `GameQuestionResult.wipeout`.
- **Рушій (`packages/engine`).**
  - Новий `wipeout.ts`: `wipeoutCorrect`, `submitWipeoutAnswer`, `wipeoutTable`, `wipeoutIn`, `withWipeoutPoints`, `openDecision`, `decideWipeout`, `closeDecision`, `decisionOpen`, `markWipeoutEnd`, `wipeoutPlayOf`, `inWipeoutRound`.
  - `game.ts`: `Play.wipeout?: WipeoutPlay`, `openQuestion`, `submitAnswer`, `withTotals` (`withWipeoutPoints` першим, як `withFinalPoints`), `nextQuestion`, `autoLock`, `next` (`reveal` → вікно на етапі `leaderboard`; `leaderboard` → наступне запитання), `tick`, `pause`, `resume`, `endRound`, `end`, `finishRound`, `override`.
  - `splash.ts`: заставка «Запитання N» і для «Ва-банк».
  - `blitz.ts` (`nextDeadline`): дедлайн вікна рішення.
  - `buffs.ts` → `off_wipeout`; `debuffs.ts`, `duel.ts` — ізоляція.
  - `restore.ts`: **`GAME_STATE_VERSION` 6 → 7**, `READABLE_STATE_VERSIONS = [2, 3, 4, 5, 6, 7]`.
  - `views.ts`: `WipeoutInfo`, `me.wipeout`, приховування до розкриття, драбина замість таблиці.
- **Сервер.** Подія й дія менеджера, `PlayRef.wipeout` у `recorder.ts`, деталі історії в `history.ts`, демо.
- **Веб.**
  - Спільна драбина `WipeoutLadder` (сцена й пульт). Телефон: `WipeoutDecision`.
  - Сцена, пульт (`HostWipeout` з рішеннями й «ⓘ»), історія.
  - Редактор: раунд із п'яти запитань із цінами 100…500, обмежені типи, перевірки кількості.
  - Довідка.

**Технології:** TypeScript, zod 4, vitest, Drizzle ORM (PGlite у тестах), Fastify + Socket.IO, React 19 + Vite, Testing Library (jsdom), Playwright. Нових залежностей немає.

**Специфікація:** `docs/superpowers/specs/2026-10-24-new-formats-design.md`:
- розділ 11 (частина 10g);
- розділ 14a: «Ва-банк» і «Мільйонер» ізольовані (без дебафів з крамниці й від ведучого, без дуелей, без правил раунду, драбина замість таблиці, «Таблиця» на телефоні працює); «банк можна забрати після будь-якого запитання, на яке гравець відповів правильно; окремого налаштування немає»; «деплой»;
- розділ 2: анти-цілі «старі вікторини змінюють бали», «живі ігри обриваються деплоєм»;
- розділ 3: нове поле має типове значення; телефон — один палець, вузький екран;
- розділ 5, пункт 5: кожен тип раунду має запис у довідці;
- розділ 17: «“Ва-банк” і “Вибування” без бафів».
- *Суперечність у специфікації:* розділ 11 каже «задає й те, чи можна забирати банк до першого запитання», а 14a — «окремого налаштування немає». Діє 14a, бо це пізніше уточнення: до першого запитання банк 0, забирати нічого.

Зразки (найближчі прецеденти — злитий код і плани 10e/10f):
- **Раунди-прецеденти:** фінал (`finalRoundSchema`, `rulesOf`, `FinalState` і `enterRound`, `withFinalPoints` у `withTotals`, `finalRoundOf`/`finalInfo` у `views.ts`, `FinalStage` на сцені, `finalResult` в історії) і бліц (`blitzRoundSchema`, `blitzRound` у фікстурах, `off_blitz`).
- `packages/shared/src/quiz.ts`: `classicRoundSchema`, `ROUND_TYPES`, `roundSchema`, `ROUND_TYPES_MATCH_SCHEMA`, `rulesOf`, `quizSchema.superRefine` (коди `bluff_place`, `vote_place`), `SIMPLE_TYPES`, `duelThreshold`.
- `packages/shared/src/round-brief.ts` (`roundBrief`, `emptyBrief`), `guide.ts` (`guidePages`).
- `packages/engine/src/game.ts`: `openQuestion`, `nextQuestion`, `advance`, `finishRound`, `submitAnswer`, `withRecord`, `withTotals`, `withFinalPoints`, `autoLock`, `lockNow`, `next`, `tick`, `pause`, `resume`, `resumeClock`, `endRound`, `end`, `override`, `removePlayer`, `enterRound`.
- `packages/engine/src/{splash.ts (questionSplashKind), blitz.ts (nextDeadline), buffs.ts (placeBlock), debuffs.ts (setDebuff, shopBlock, fireDebuffs), duel.ts (duelWindowOpen, duelDue), present.ts (presentPlayers), check.ts (checkAnswer, sliderShare), timing.ts}`.
- `packages/engine/src/views.ts`: `base`, `roundInfo`, `publicStandings`, `liveTable`, `hiddenPoints`, `stageView`, `playerView`, `hostView`, `playerShop`, `finalInfo`.
- `packages/engine/src/restore.ts`, `restore.test.ts` (`STATE_SHAPE`, `KEYS`, `representative`); `testing/fixtures.ts` (`classicRound`, `blitzRound`, `finalRound`, `makeRoundsQuiz`, `withPoints`, `single`, `bool`, `numeric`, `text`, `slider`); `testing/helpers.ts` (`lobbyWith` дає `p1`, `p2`, …; `must`, `startRound`).
- `apps/server/src/rooms/manager.ts` (`lie`, `bluff`, `HostAction`), `socket.ts` (`player:lie`), `recorder.ts` (`save` → `plays`, `signature`, `answerRows`), `history.ts` (`bluffResult`, `finalResult`, `roundTypesOf`), `db/schema.ts` (`PlayRef`), `achievements.ts` (`roundPoints`, `isComeback`).
- `apps/server/scripts/demo-quiz.ts` (`r-final`), `demo-quiz.test.ts`.
- `apps/web/src/`:
  - `guide-text.ts` (`ROUND_ICONS`, `ROUND_NAMES`, `roundHow`), `round-summary.ts`, `format.ts` (`roundLabel`, `questionLabel`, `roundFacts`), `i18n.ts`;
  - `screens/{PlayerScreen,StageScreen,HostScreen,Standings,TableSheet,RoundBriefing,HostPlayerTools,DebuffShop,Buffs}.tsx`;
  - `pages/GameHistory.tsx`;
  - `editor/{QuizEditor,RoundStrip,RoundSettings,QuestionEditor}.tsx`, `editor/draft.ts` (`questionTypesFor`, `newClassicRound`, `newBoardQuestion`, `problemsOf`, `cleaned`), `editor/draft-storage.ts` (`looksLikeQuiz`, `loadDraft`);
  - `help/{rounds,powers,settings,host-help}.ts`, `host-help.test.ts`.
- `apps/server/e2e/full-game.e2e.ts`: `open`, `register`, `join`, `shot`, `afterSplash`, `expectNoSideScroll`, `expectStageFits`, `snapshot`, `socketFrames`, `framesBeforeReveal`, `scoreOf`, `totalOf`, `toNextQuestion`, `field`, `click`, `makeRoundsQuiz`, `classicRound`; сценарій 10f `bluffGame` — структура.

**Рішення плану там, де специфікація мовчить (і рішення координатора):**

*Дані*
- Схема раунду:
  ```ts
  { id, type: 'wipeout', title, description?, shuffleOptions: boolean, questions: Question[] /* 5…15 */ }
  ```
  Полів `rules`, `speedBonus` і `check` немає. `rulesOf` повертає `DEFAULT_RULES`, тож множник 1, без штрафу, «частково» й серій.
- **Типи запитань:** `WIPEOUT_TYPES = ['single', 'boolean', 'numeric', 'text', 'slider']`. Інший тип у раунді — код вікторини `wipeout_type`.
  - *Рішення:* «кілька варіантів» не входить. «У грі / згорів» має бути однозначним, а часткова відповідь на «кілька» такою не буває.
  - Відео й аудіо дозволені, як у класиці. Картинка, що проявляється, заборонена наявним `reveal_place`.
- **Ціна:** звичайне `points` (0…2000) кожного запитання. Рушій не перевіряє, що ціни зростають. Редактор пропонує зростання: новий раунд — п'ять запитань із цінами 100, 200, 300, 400, 500; нове запитання — попередня ціна + 100 (не більше `LIMITS.maxPoints`).

*Хто грає*
- На вході в раунд «у грі» всі гравці. Приєднатися до вже початої гри не можна (`addPlayer` працює лише в лобі), тож правило «хто прийшов посеред раунду, вибуває» виконується само.
- Відповідати можуть лише ті, хто «у грі». Решта отримує `not_allowed`.
- **Відключений гравець** без відповіді згорає, як і будь-хто без відповіді. Після перезапуску сервера (9b) гра стоїть на паузі й чекає гравців, тож перезапуск сам нікого не спалює.

*Правильність (бінарна)*
- `wipeoutCorrect(question, answer)`:
  - `single`, `boolean`, `text` — як `checkAnswer(...).accepted`;
  - `numeric` — у межах допуску (`checkAnswer(...).accepted`; частка «з відхиленням» не важить);
  - `slider` — **лише в межах допуску**: `|value − correct| ≤ tolerance` (з `EPSILON`, як у `check.ts`). `zeroBeyond` і правило «половина ціни = правильно» тут не діють.
- Запис: `accepted = correct`, `accuracy = correct ? 1 : 0`, `grade = correct ? 'correct' : 'wrong'`, `basePoints = points = 0` на мить відповіді (див. «Бали»). Бонусу за швидкість немає.

*Бали (виводяться з журналу)*
- `wipeoutStandings(playerIds, steps, over)` у shared. Кроки: `{ price, correct: id[], took: id[] }` у порядку гри. Для кожного гравця від стану «у грі», банк 0:
  - гравець у грі, правильно → `bank += price`;
  - гравець у грі, неправильно або без відповіді → `bank = 0`, `burned`, `step = i`;
  - потім, якщо він у `took` цього кроку → `took`, `step = i` (банк лишається);
  - після всіх кроків, якщо `over`, тоді «у грі» → `survived`, `step = останній крок`.
- **Перенесення в бали:** `withWipeoutPoints(state)` (у `withTotals`, першим, поруч із `withFinalPoints`) переписує записи закритих запитань раундів «Ва-банк»:
  - запис кроку `step` у гравця зі статусом `took` чи `survived` → `basePoints = points = bank`;
  - решта записів → `0`;
  - `streakBonus = 0`.
  - Так рахунок, турнірна таблиця, історія (`answer.points`), суми раунду в досягненнях і «камбек» працюють без окремих гілок.
- `over` для раунду: на останньому зіграному запитанні раунду стоїть `Play.wipeout.end === true` (ставить `markWipeoutEnd` у `finishRound` і `end`), або фаза `finished`, або гра вже в пізнішому раунді.
  - *Рішення:* прапорець у журналі, а не фаза, бо після `round_end` може початися дуель (фаза `duel` того ж `roundIndex`), і перенесені банки не мають зникнути.
- Множника, штрафу, серій немає. Сумарний час (`totalTimeMs`) рахують лише класичні раунди, тож «Ва-банк» туди не входить, як і бліц.

*Вікно «Далі / Забрати»*
- `next` з `reveal` у «Ва-банк»:
  - якщо це останнє запитання раунду або «у грі» нікого → `finishRound` (банки уцілілих переносяться);
  - інакше → **етап `leaderboard`** (на сцені драбина), вікно рішення: `startedAt = now`, `endsAt = now + LIMITS.wipeoutDecideSeconds × 1000`.
  - Налаштування `leaderboard: 'each' | 'end'` тут не важить: драбина потрібна для рішень.
- `decideWipeout(state, playerId, take, now)`, подія `player:wipeout { take }`. Помилки в такому порядку:
  - `wrong_phase` — не вікно;
  - `paused`;
  - `not_found` — немає гравця;
  - `not_allowed` — гравець не «у грі»;
  - `already_answered` — уже вирішив.
  - **Рішення одне й остаточне.**
  - `take` → гравець у `Play.wipeout.took`, інакше в `stay`.
- **Вікно закривається** (`closeDecision`: невирішені «у грі» → `took`, `endsAt = null`):
  - коли вирішили всі присутні «у грі» (`presentPlayers`);
  - коли сплив час (`tick`, строго `now > endsAt`, як `timeOver`);
  - коли ведучий завершує раунд чи гру.
- **Типово — «Забрати».** *Рішення:* так найменше несподіванок. Гравець, що задивився чи випав зі зв'язку, зберігає зароблене, а не згорає на наступному запитанні без відповіді. Телефон і довідка кажуть це прямо: «Не вибереш за 10 с — банк забереться сам».
- «Далі» ведучого, поки вікно відкрите → **`deciding`** (новий код). Пульт показує кнопку вимкненою з відліком «Гравці вирішують… N с». Після закриття «Далі» відкриває наступне запитання. Якщо «у грі» нікого не лишилося — підсумки раунду (кнопка «Підсумки раунду»).
- **Пауза** зупиняє вікно: `pause` на `leaderboard` з `endsAt` → `remainingMs`; `resume` → `endsAt = now + remainingMs`. `nextDeadline` повертає `endsAt` вікна, тож сервер сам тікне. `suspend` (9b) працює без змін через `tick` + `pause`.
- Дуелі вікно не зупиняють, бо в раунді їх немає (див. «Ізоляція»).

*Кінець раунду достроково*
- «Завершити раунд» чи «Завершити гру» посеред запитання — **як кінець часу**: `lockNow` записує відповіді, хто не встиг, згорає. Банки решти переносяться.
- Посеред вікна — `closeDecision`, потім кінець.
- *Рішення:* так само, як у класиці, без окремих правил. Довідка пояснює.

*Оцінка ведучого*
- Лише на `reveal` поточного запитання, як у класиці. `correct` чи `wrong`; `partial` → `partial_disabled`. Гравець без запису → `not_found`.
- Після «Далі» (вікно) оцінку змінити не можна: `override` на `leaderboard` → `wrong_phase`. Рішення гравців спираються на розкритий вердикт.
- Пульт уже показує «Зарахувати / Відхилити» для текстових відповідей на `reveal` поза бліцом і фіналом. «Ва-банк» туди потрапляє сам.

*Ізоляція (14a)*
- **Бафи:** `placeBlock` → нова причина `off_wipeout` («У «Ва-банк» бафів немає.»). Ряд бафів телефон показує з причиною, як у фіналі.
- **Дебафи:**
  - `setDebuff` у раунді «Ва-банк» (будь-яка фаза, крім `round_end`) → `not_allowed`; `hostView.allowed.debuffs = []` у тих самих фазах, тож пульт ховає меню.
  - `shopBlock` → `'phase'` (крім `round_end`).
  - `fireDebuffs` на запитаннях «Ва-банк» нічого не запускає: дебафи, що чекають, чекають наступного раунду (як на опитуванні).
  - Скасувати дебаф, що чекає, ведучий може й тут.
- **Дуелі:**
  - `duelWindowOpen` → `false` у раунді «Ва-банк», крім `round_end`;
  - `duelDue` → `false` так само: оголошена раніше дуель стартує на `round_end`.
  - Запитання «Ва-банк» входять у поріг дуелей (`duelThreshold`, `duelPlayed`), як і раніше. *Рішення:* не змінюємо спільну формулу заради одного раунду.
- **Правила раунду:** у схемі їх немає. Редактор не показує їхніх елементів.
- **Таблиця:** на `leaderboard` у «Ва-банк» `standings` сцени й телефона — `null` (драбина замість таблиці). `table` телефона (кнопка «Таблиця») — як завжди. На `round_end` — звичайна таблиця.
- **Коригування балів ведучим** (`host:adjust`) діє і тут: це рахунок, а не банк.

*Що видно*
- `WipeoutInfo` (див. задачу 5) — від `intro` до `round_end` раунду «Ва-банк» (і на `finished`, якщо він останній).
- На `question` і `locked` рядки драбини рахуються **без поточного запитання**: банки й статуси — до нього. На `reveal` — з ним.
- Під час вікна:
  - сцена й телефони бачать лише `pending` / `decided` у кожного;
  - пульт — `stay` / `take` наживо;
  - після закриття — статуси.
- `me.wipeout` телефона: власні статус, банк, рішення й чи можна вирішувати.

*Формат стану й деплой*
- **`GAME_STATE_VERSION` 6 → 7.** Новий необов'язковий ключ `Play.wipeout?: WipeoutPlay`:
  ```ts
  interface WipeoutPlay {
    /** Хто забрав банк після цього запитання (сам чи за замовчуванням), у порядку рішень. */
    took: string[];
    /** Хто вибрав «Далі» після цього запитання. */
    stay: string[];
    /** Раунд закінчився на цьому запитанні: банки тих, хто в грі, перенесено. */
    end: boolean;
  }
  ```
  На етапі `leaderboard` у «Ва-банк» тепер бувають `startedAt` / `endsAt` / `remainingMs`. Ключі `GameState` ті самі.
- **`READABLE_STATE_VERSIONS = [2, 3, 4, 5, 6, 7]`.** Зміна лише адитивна, а стан версій 2–6 не може містити раунду «Ва-банк». Кімнати, збережені до розгортання, відновлюються: **пуш не обриває живих ігор**. Перевірку `live_room` за 14a можна не робити. Звіт власникові має назвати це явно.
- **Міграцій немає:**
  - раунд — у jsonb `quiz.rounds`;
  - відповіді й бали — у наявних колонках `answer`;
  - `PlayRef.wipeout` — у jsonb `game.plays`.

*Чого не робимо*
- налаштування «забирати до першого запитання» (14a);
- зміни рішення після натискання;
- «Ва-банк» у командах (10j);
- перевірки, що ціни зростають (лише підказка редактора);
- нового досягнення.

## Глобальні обмеження

- Рушій чистий: жодного годинника й `Math.random`; усе від `now` і `rng`.
- **Ніщо не видає вердикт раніше розкриття.** На `question` і `locked` зрізи сцени й телефонів не показують нових банків, статусів «згорів» чи бали поточного запитання. Тести задачі 5 — через `JSON.stringify(view)`, e2e — через кадри сокета (`socketFrames`, `framesBeforeReveal`).
- **Старі вікторини й бали не змінюються.** Наявні тести класики, бліцу, поля, фіналу, бафів, дебафів, дуелей, серій, сумарного часу й відновлення лишаються зеленими без змін (крім навмисних, див. «Порядок збирання»).
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`, тексти довідки — лише в `apps/web/src/help/*.ts`.
- Телефон 375 px — без горизонтальної прокрутки, кнопки ≥ 44 px, «Далі» й «Забрати» — великі, одним пальцем. Сцена 1280 × 720 — драбина з 15 сходинок і до 12 гравців без прокрутки; більше гравців — менший шрифт, перенос.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом — зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2`. Якщо PGlite падає з браком пам'яті, запускати окремо:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=1 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- Наскрізні тести: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts`. **Повний прогін триває близько 10 хвилин:** запускати у фоні й чекати завершення. Кадри — в `apps/server/e2e/artifacts/shots`, префікс 10g — `p10g-`.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать. Живі ігри пуш не обриває: `READABLE_STATE_VERSIONS` містить 6.

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/{quiz.ts,wipeout.ts(новий),round-brief.ts,game.ts,index.ts}`, `quiz.test.ts`, новий `wipeout.test.ts` | схема раунду, ліміти, `wipeout_type`, драбина, `deciding`, `off_wipeout` | 1 |
| `apps/web/src/{guide-text.ts,round-summary.ts,format.ts,i18n.ts}`, `help/rounds.ts`, `editor/{draft.ts,draft-storage.ts,QuizEditor.tsx,RoundSettings.tsx}` + `round-summary.test.ts`, `draft.test.ts` | прохід typecheck | 1 |
| `packages/engine/src/{wipeout.ts(новий),game.ts,splash.ts,restore.ts,index.ts}`, `testing/fixtures.ts`, новий `game.wipeout.test.ts`, `restore.test.ts` | відповіді, банки, перенесення, кінець раунду, версія 7 | 2 |
| `packages/engine/src/{wipeout.ts,game.ts,blitz.ts}`, `game.wipeout.test.ts` | вікно рішення, пауза, тік, оцінка ведучого, вилучення | 3 |
| `packages/engine/src/{buffs.ts,debuffs.ts,duel.ts}`, новий `game.wipeout-isolation.test.ts` | бафи, дебафи, дуелі, правила | 4 |
| `packages/shared/src/views.ts`, `packages/engine/src/views.ts`, новий `views.wipeout.test.ts`, фабрики зрізів у тестах вебу | `WipeoutInfo`, `me.wipeout`, приховування | 5 |
| `packages/shared/src/{events.ts,history.ts}`, `apps/server/src/{rooms/manager.ts,socket.ts,recorder.ts,history.ts,db/schema.ts}`, `apps/server/scripts/{demo-quiz.ts,demo-quiz.test.ts}` + тести | подія, історія, демо | 6 |
| `apps/web/src/screens/{WipeoutLadder,WipeoutDecision}.tsx` (нові), `PlayerScreen.tsx`, `i18n.ts`, `styles.css` + тести | телефон і спільна драбина | 7 |
| `apps/web/src/screens/{StageScreen,HostScreen,HostWipeout(новий)}.tsx`, `pages/GameHistory.tsx`, `i18n.ts`, `styles.css` + тести | сцена, пульт, історія | 8 |
| `apps/web/src/editor/{QuizEditor,RoundSettings,RoundStrip}.tsx`, `draft.ts`, `i18n.ts` + тести | редактор | 9 |
| `apps/web/src/help/{rounds,powers,settings}.ts`, `i18n.ts` (`buffHelpNone` тощо), `host-help.test.ts`, `HostWipeout.tsx` | довідка й «ⓘ» | 10 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 10g з кадрами `p10g-` | 11 |

## Порядок збирання

- 1 → 2 → 3 → 4 → 5 → 6.
- 7 — після 5 і 6. 8 — після 7 (`WipeoutLadder`). 9 — після 1 (від рушія й зрізів не залежить), можна паралельно з 7–8.
- 10 — після 8 і 9. 11 — остання.
- **Навмисні зміни наявних очікувань** (лише такі):
  - `restore.test.ts`: `GAME_STATE_VERSION` 7, новий `KEYS[7]`, `STATE_SHAPE.WipeoutPlay`, `STATE_SHAPE.Play` + `'wipeout'`; `READABLE_STATE_VERSIONS` `[2, 3, 4, 5, 6, 7]`; `KEYS[1..6]` без змін;
  - фабрики `BaseView` / `StageView` / `HostView` / `PlayerView['me']` у тестах вебу отримують `wipeout: null` (і `me.wipeout: null`);
  - тест у `quiz.test.ts`, що звіряє `ROUND_TYPES` буквально, отримує `'wipeout'`;
  - тексти «де бафи не діють» (`EXCL` у `help/powers.ts`, `buffHelpNone` в `i18n.ts`) і тест у `host-help.test.ts`, що звіряє їх буквально, — з «Ва-банк»;
  - тест `searchHelp` у `host-help.test.ts`, якщо новий запис змінює буквальний результат пошуку.
  - Якщо падає інше, рецензент розбирає причину, а не правку очікування.

## На що дивитися рецензентові

1. **Драбина.** Правильно → `+ціна` в банк; неправильно чи мовчання → банк 0 і згорів; «Забрати» → бали; останнє запитання → бали самі; нікого в грі → кінець раунду; повзунок — лише в допуску. Тести: задачі 1, 2.
2. **Вікно.** 10 с; одне остаточне рішення; типово «Забрати»; закривається, коли вирішили всі присутні, за часом або з кінцем раунду; «Далі» ведучого до закриття — `deciding`; пауза зупиняє відлік; відновлення після перезапуску. Тести: задачі 3, 5.
3. **Бали в журналі.** `answer.points` — лише на кроці перенесення. Рахунок = сума записів + коригування. Оцінка ведучого на `reveal` змінює банк і статус; після вікна — ні. Тести: задачі 2, 3, 6.
4. **Ізоляція.** Бафи (`off_wipeout`), дебафи (ведучий, крамниця, спрацювання), дуелі (оголошення й старт), правила — не діють у раунді, а на `round_end` знову діють. Тести: задача 4.
5. **Нічого не витікає.** Банки й статуси поточного запитання — лише з розкриття. Рішення інших до закриття вікна — лише «вирішив». Тести: задача 5, задача 11 (кадри).
6. **Формат стану.** `GAME_STATE_VERSION` = 7, `KEYS[7]`, представник з відкритим вікном проходить JSON і `suspend`; `READABLE_STATE_VERSIONS` `[2, 3, 4, 5, 6, 7]`.
7. **Старе не змінилося.** Тести класики, бліцу, поля, фіналу, серій, бафів, дебафів, дуелей, сумарного часу — без змін.
8. **Довідка.** Запис `round.wipeout` правдивий щодо рушія й чисел з `LIMITS`. Записи бафів, дебафів, дуелей і налаштувань згадують «Ва-банк». Тести: задача 10.

---

### Задача 1. Shared: раунд `wipeout`, типи запитань, ліміти, драбина, код помилки й причина бафу; прохід typecheck у вебі

**Files:**
- Modify: `packages/shared/src/quiz.ts`, `packages/shared/src/round-brief.ts`, `packages/shared/src/game.ts`, `packages/shared/src/index.ts`
- Create: `packages/shared/src/wipeout.ts`
- Test: `packages/shared/src/quiz.test.ts`, новий `packages/shared/src/wipeout.test.ts`
- Modify (прохід typecheck): `apps/web/src/guide-text.ts`, `apps/web/src/round-summary.ts`, `apps/web/src/format.ts`, `apps/web/src/i18n.ts`, `apps/web/src/help/rounds.ts`, `apps/web/src/editor/draft.ts`, `apps/web/src/editor/draft-storage.ts`, `apps/web/src/editor/QuizEditor.tsx`, `apps/web/src/editor/RoundSettings.tsx`
- Test: `apps/web/src/round-summary.test.ts`, `apps/web/src/editor/draft.test.ts`

**Interfaces:**
- Produces (`quiz.ts`):
  ```ts
  // У LIMITS:
  /** «Ва-банк»: запитань у раунді й секунд на «Далі / Забрати». */
  minWipeoutQuestions: 5,
  maxWipeoutQuestions: 15,
  wipeoutDecideSeconds: 10,

  /** Типи запитань раунду «Ва-банк»: відповідь однозначно правильна чи ні. */
  export const WIPEOUT_TYPES = ['single', 'boolean', 'numeric', 'text', 'slider'] as const satisfies readonly QuestionType[];

  /** «Ва-банк»: правильна відповідь додає ціну в банк, помилка спалює його; після кожної правильної — «Далі» чи «Забрати». Правил балів немає. */
  export const wipeoutRoundSchema = z.object({
    id: z.string().min(1).refine(isStorable, UNSTORABLE),
    type: z.literal('wipeout'),
    title: z.string().trim().max(LIMITS.roundTitle).refine(isStorable, UNSTORABLE),
    /** Опис раунду від автора для заставки. */
    description: z.string().trim().max(LIMITS.roundDescription).refine(isStorable, UNSTORABLE).optional(),
    shuffleOptions: z.boolean(),
    /** Драбина: запитання в порядку гри, ціна кожного — його points. */
    questions: z.array(questionSchema).min(LIMITS.minWipeoutQuestions).max(LIMITS.maxWipeoutQuestions),
  });
  export type WipeoutRound = z.infer<typeof wipeoutRoundSchema>;

  export const ROUND_TYPES = ['classic', 'blitz', 'board', 'final', 'wipeout'] as const;
  export const roundSchema = z.discriminatedUnion('type', [classicRoundSchema, blitzRoundSchema, boardRoundSchema, finalRoundSchema, wipeoutRoundSchema]);

  /** Правила балів раунду; у фіналі й «Ва-банк» правил немає — DEFAULT_RULES. */
  export function rulesOf(round: Round): RoundRules {
    return round.type === 'final' || round.type === 'wipeout' ? DEFAULT_RULES : round.rules;
  }
  ```
  - `quizSchema.superRefine`, поруч із `bluff_place`: `wipeout_type` — у раунді `wipeout` є запитання з типом поза `WIPEOUT_TYPES`.
  - `duelThreshold` / `scoredCount` — без змін (запитання «Ва-банк» рахуються).
- Produces (новий `wipeout.ts`, реекспорт з `index.ts`):
  ```ts
  /** Стан гравця в раунді «Ва-банк». */
  export type WipeoutStatus = 'in' | 'took' | 'burned' | 'survived';

  /** Один крок драбини: ціна запитання, хто відповів правильно, хто після нього забрав банк. */
  export interface WipeoutStep {
    price: number;
    correct: readonly string[];
    took: readonly string[];
  }

  export interface WipeoutStanding {
    status: WipeoutStatus;
    /** in — банк зараз; took / survived — перенесено в бали; burned — 0. */
    bank: number;
    /** Індекс кроку, на якому гравець забрав, згорів чи доніс банк до кінця; null — у грі. */
    step: number | null;
  }

  /**
   * Драбина «Ва-банк» після кроків steps: хто в грі (вхід — усі playerIds з банком 0), хто згорів, хто забрав.
   * На кроці: у грі й правильно → bank += price; у грі й ні → bank 0, burned; потім, якщо гравець у took цього кроку (і ще в грі) → took.
   * over — раунд скінчився: хто в грі після останнього кроку, стає survived на останньому кроці. Без кроків — усі in з банком 0.
   */
  export function wipeoutStandings(playerIds: readonly string[], steps: readonly WipeoutStep[], over: boolean): Record<string, WipeoutStanding>;
  ```
- Produces (`round-brief.ts`): `roundBrief` для `wipeout` → `emptyBrief('wipeout')` (без правил, швидкості, спроб). Тип `RoundBrief['type']` розширюється сам.
- Produces (`game.ts`):
  - `ErrorCode` + `'deciding'` (коментар: «“Ва-банк”: гравці ще вибирають “Далі” чи “Забрати” (10g).»);
  - `BuffBlock` + `'off_wipeout'` («“Ва-банк”: бафів немає (10g).»).
- Веб (прохід typecheck):
  - `i18n.ts`:
    - `roundTypeWipeout: 'Ва-банк'`, `wipeoutLabel: 'Ва-банк'`;
    - `roundHow_wipeout: 'Правильна відповідь додає ціну в банк, помилка спалює його. Після кожної правильної — «Далі» чи «Забрати».'`;
    - `summaryWipeout: 'Правильно — ціна йде в банк; помилка чи мовчання — банк згорає, і ти до кінця раунду дивишся.'`;
    - `summaryWipeoutTake: 'Після кожної правильної відповіді вибери «Далі» або «Забрати»: забране йде в бали. Після останнього запитання банк переноситься сам.'`;
    - `buffWhy_off_wipeout: 'У «Ва-банк» бафів немає.'`;
    - `err_deciding: 'Гравці ще вирішують — зачекай кілька секунд.'`;
  - `guide-text.ts`: `ROUND_ICONS.wipeout = '💰'`, `ROUND_NAMES.wipeout = 'roundTypeWipeout'`, `roundHow`: `case 'wipeout': return [t('roundHow_wipeout')]`;
  - `round-summary.ts`: гілка `wipeout` → `[t('summaryWipeout'), t('summaryWipeoutTake')]` **до** гілки поля (зараз «решта» = поле);
  - `format.ts`: `roundLabel` для порожньої назви `wipeout` → `t('wipeoutLabel')`. `roundFacts` і `questionLabel` — без змін («5 запитань · 20 с»);
  - `help/rounds.ts`: повний запис `wipeout` (тексти — задача 10; тут вписати повністю, задача 10 звіряє й оновлює пов'язані записи);
  - `editor/draft.ts`:
    - `questionTypesFor('wipeout')` → `WIPEOUT_TYPES`; оновити коментар;
    - `newWipeoutRound()`:
      ```ts
      /** Новий «Ва-банк»: п'ять порожніх запитань «один варіант» з цінами 100…500 (драбина зростає), без перемішування. */
      export function newWipeoutRound(): WipeoutRound {
        return { id: newId(), type: 'wipeout', title: '', shuffleOptions: false,
          questions: Array.from({ length: LIMITS.minWipeoutQuestions }, (_, i) => ({ ...newQuestion('single'), points: 100 * (i + 1) })) };
      }
      ```
    - `cleaned` — гілка «не поле» вже покриває `wipeout`, перевірити типом;
  - `draft-storage.ts`: `looksLikeQuiz` — `wipeout`, як і фінал, без `rules`; `loadDraft` — `wipeout` повертається з `questions.map(revive)` без полів класики;
  - `QuizEditor.tsx`: `addRound('wipeout')` → `newWipeoutRound()` (повний вигляд — задача 9);
  - `RoundSettings.tsx`: `setRules` і блок правил (`round.type !== 'final'`) не для `wipeout` (умова `round.type !== 'final' && round.type !== 'wipeout'`). Решта вигляду — задача 9.

- [ ] **Step 1: Write the failing tests**
  - `packages/shared/src/quiz.test.ts`:
    ```ts
    describe('wipeout round (10g)', () => {
      const ladder = [100, 200, 300, 400, 500].map((points, i) => ({ ...singleQ, id: `w${i + 1}`, points }));
      const wipeout = { id: 'rw', type: 'wipeout', title: '', shuffleOptions: false, questions: ladder } as const;
      it('a wipeout round has 5–15 questions of simple types and no rules', () => {
        expect(ROUND_TYPES).toContain('wipeout');
        expect(valid(roundSchema, wipeout)).toBe(true);
        expect(valid(roundSchema, { ...wipeout, questions: ladder.slice(0, 4) })).toBe(false);
        expect(valid(roundSchema, { ...wipeout, questions: Array.from({ length: 16 }, (_, i) => ({ ...singleQ, id: `x${i}` })) })).toBe(false);
        expect(rulesOf(roundSchema.parse(wipeout))).toEqual(DEFAULT_RULES);
        expect(WIPEOUT_TYPES).toEqual(['single', 'boolean', 'numeric', 'text', 'slider']);
      });
      it('refuses other question types in a wipeout round', () => {
        // multi, order, bluff, poll у раунді → 'wipeout_type'; single/boolean/numeric/text/slider — без помилки.
      });
    });
    ```
    `singleQ`, `valid`, `quizIssues` — наявні помічники файлу (або найближчі аналоги, якими користуються тести `bluff_place`).
  - Новий `packages/shared/src/wipeout.test.ts`:
    ```ts
    describe('wipeoutStandings (10g)', () => {
      const ids = ['p1', 'p2', 'p3'];
      it('everyone starts in with an empty bank', () => {
        expect(wipeoutStandings(ids, [], false)).toEqual({ p1: { status: 'in', bank: 0, step: null }, p2: …, p3: … });
      });
      it('a right answer adds the price, a wrong or missing one burns the bank', () => {
        const steps = [{ price: 100, correct: ['p1', 'p2'], took: [] }, { price: 200, correct: ['p2'], took: [] }];
        // p1: burned, bank 0, step 1; p2: in, 300; p3: burned, 0, step 0
      });
      it('taking moves the bank out of the game; a later step does not touch it', () => {
        // крок 1: p2 у took → took 300, step 1; крок 2 з p2 у correct нічого не змінює
      });
      it('over: whoever is still in survives on the last step', () => {
        // over = true → p2 survived 300 step 1
      });
      it('a burned player in took stays burned', () => { /* took ігнорує згорілого */ });
    });
    ```
  - `apps/web/src/round-summary.test.ts`: `roundSummary(emptyBrief('wipeout'))` → `[summaryWipeout, summaryWipeoutTake]` (тексти з `t`).
  - `apps/web/src/editor/draft.test.ts`:
    - `newWipeoutRound()`: 5 запитань, ціни `[100, 200, 300, 400, 500]`; після заповнення текстів і варіантів проходить `roundSchema`;
    - `questionTypesFor('wipeout')` → `WIPEOUT_TYPES`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared` → FAIL.
- [ ] **Step 3: Implement** схему, ліміти, `wipeout_type`, `wipeout.ts`, `roundBrief`, `ErrorCode`, `BuffBlock` за інтерфейсом.
- [ ] **Step 4: Прохід typecheck у вебі.** Виконати `pnpm typecheck` і закрити кожну помилку змінами з інтерфейсу. Рушій теж може не скомпілюватися на `Record<RoundType, …>` чи `switch` без гілки. Там — мінімальна гілка без поведінки з коментарем `// задача 2`. Поведінки раунду в цій задачі немає.
- [ ] **Step 5: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 6: Commit**
  ```bash
  git add packages/shared packages/engine apps/web/src
  git commit -m "feat(shared): wipeout round — 5–15 questions of simple types without round rules, the ladder of banks (in, took, burned, survived), error deciding, buff block off_wipeout"
  ```

### Задача 2. Рушій: відповіді лише тих, хто в грі, бінарна правильність, банки, перенесення в бали, кінець раунду; `GAME_STATE_VERSION` 7

**Files:**
- Create: `packages/engine/src/wipeout.ts`
- Modify: `packages/engine/src/game.ts`, `packages/engine/src/splash.ts`, `packages/engine/src/restore.ts`, `packages/engine/src/index.ts`, `packages/engine/src/testing/fixtures.ts`
- Test: новий `packages/engine/src/game.wipeout.test.ts`; `packages/engine/src/restore.test.ts`

**Interfaces:**
- Changes (`game.ts`):
  ```ts
  // Play:
  /** «Ва-банк»: рішення після цього запитання й позначка кінця раунду (10g). */
  wipeout?: WipeoutPlay;

  export interface WipeoutPlay {
    /** Хто забрав банк після цього запитання (сам чи за замовчуванням), у порядку рішень. */
    took: string[];
    /** Хто вибрав «Далі» після цього запитання. */
    stay: string[];
    /** Раунд закінчився на цьому запитанні: банки тих, хто в грі, перенесено в бали. */
    end: boolean;
  }
  ```
  - `openQuestion`: у раунді `wipeout` — `wipeout: { took: [], stay: [], end: false }`. `rng` для цього не тягнеться.
  - `nextQuestion`: у раунді `wipeout`, якщо `wipeoutIn(state)` порожній → `undefined` (решта драбини лишається незіграною).
  - `submitAnswer`: після перевірок фази, паузи, `notStarted`, гравця — `if (round.type === 'wipeout') return submitWipeoutAnswer(state, playerId, answer, now);` (до гілок бліцу, поля й фіналу).
  - `autoLock`: у раунді `wipeout` «усі відповіли» рахується серед `presentPlayers`, які `wipeoutIn`. Якщо присутніх «у грі» немає, автозакриття немає: запитання закриє таймер чи ведучий.
  - `withTotals`: першим рядком `const state = withWipeoutPoints(withFinalPoints(input));`.
  - `finishRound` і `end`: `markWipeoutEnd(state)` перед зміною фази.
  - `removePlayer`: з `Play.wipeout.took` / `stay` прибрати гравця.
- Changes (`splash.ts`): `questionSplashKind` — `classic`, `final` і `wipeout` → `'question'`.
- Produces (`wipeout.ts`):
  ```ts
  /** Чи поточний раунд — «Ва-банк». */
  export function inWipeoutRound(state: GameState): boolean;

  /** Чи відповідь правильна для «Ва-банк»: повзунок — лише в допуску, число — у допуску, решта — як checkAnswer. */
  export function wipeoutCorrect(question: Question, answer: Answer): boolean;

  /**
   * Драбина раунду roundIndex за першими upTo записами журналу (типово — закриті запитання):
   * кроки — запитання цього раунду з правильними (grade 'correct') і took; over — Play.wipeout.end на останньому, фаза finished
   * або гра вже в пізнішому раунді.
   */
  export function wipeoutTable(state: GameState, roundIndex?: number, upTo?: number): Record<string, WipeoutStanding>;

  /** Хто зараз «у грі» в поточному раунді «Ва-банк» за закритими запитаннями; поза раундом — []. */
  export function wipeoutIn(state: GameState): string[];

  /**
   * Відповідь у «Ва-банк»: not_allowed — гравець не в грі; already_answered; time_over (timeOver); type_mismatch.
   * Запис: accepted = correct, accuracy 1/0, grade correct/wrong, basePoints = points = 0, streakBonus 0; далі autoLock(now).
   */
  export function submitWipeoutAnswer(state: GameState, playerId: string, answer: Answer, now: number): Result;

  /**
   * Перераховує записи закритих запитань раундів «Ва-банк»: запис кроку, на якому гравець забрав чи доніс банк, — bank;
   * решта — 0; streakBonus 0. Інші раунди не чіпає (той самий об'єкт, якщо «Ва-банк» у журналі немає).
   */
  export function withWipeoutPoints(state: GameState): GameState;

  /** Ставить end: true на останньому зіграному запитанні поточного раунду «Ва-банк»; інакше стан без змін. */
  export function markWipeoutEnd(state: GameState): GameState;

  /** Поточне запитання «Ва-банк» з його WipeoutPlay; інакше null. */
  export function wipeoutPlayOf(state: GameState): (Play & { wipeout: WipeoutPlay }) | null;
  ```
  - `wipeoutIn` на етапі `question` дивиться на закриті запитання (без відкритого): хто в грі на відкритті, той може відповідати.
- Changes (`testing/fixtures.ts`):
  ```ts
  /** «Ва-банк»: типово title '', shuffleOptions false. */
  export function wipeoutRound(id: string, questions: Question[], options: Partial<Omit<WipeoutRound, 'id' | 'type' | 'questions'>> = {}): WipeoutRound;
  /** П'ять сходинок 100…500: single, bool, numeric, text, slider з id w1…w5. */
  export const wipeoutLadder: Question[];
  ```
- Changes (`restore.ts`): **`GAME_STATE_VERSION = 7`**, коментар «7 — 10g: Play.wipeout (рішення “Ва-банк” і кінець раунду)», `READABLE_STATE_VERSIONS = [2, 3, 4, 5, 6, GAME_STATE_VERSION]` з поясненням «6 → 7 лише додала необов'язкове Play.wipeout, а стан версій 2–6 не може містити “Ва-банк”».

- [ ] **Step 1: Write the failing tests** у новому `game.wipeout.test.ts`. Вікторина: `makeRoundsQuiz([wipeoutRound('rw', wipeoutLadder), classicRound('r2', [single])])`, гравці `Оля` (p1), `Петро` (p2), `Віра` (p3). Тести:
  - `everyone is in at the start and answers the first rung`: після `startRound` — `wipeoutIn` = `['p1', 'p2', 'p3']`; `openQuestion` дає `play.wipeout = { took: [], stay: [], end: false }`;
  - `a right answer is correct with no points yet; a wrong one burns`: p1 правильно, p2 неправильно, p3 мовчить → `lock` → записи p1 `correct`/`points 0`, p2 `wrong`; після `next` (reveal) `wipeoutTable` = p1 in 100, p2 burned, p3 burned (`step 0`);
  - `a burned player cannot answer the next rung`: p2 на w2 → `not_allowed`; p1 → ok; «усі відповіли» закриває запитання, щойно відповів p1 (єдиний у грі);
  - `slider counts only inside the tolerance`: w5 (correct 50, tolerance 2, zeroBeyond 12) — 52 → правильно, 53 → неправильно (хоч частка ≥ 0,5 за 10b);
  - `numeric inside the tolerance is right even off the exact value`: w3 (2061 ± 100) — 2100 → правильно;
  - `survivors cash in when the last rung closes the round`: p1 правильно на всіх п'яти (рішення «Далі» вписати прямо в `Play.wipeout.stay` через допоміжну функцію тесту або, після задачі 3, через `decideWipeout`). Після `next` з reveal останнього → `round_end`: `play.wipeout.end === true` на w5, запис p1 на w5 `points = 1500`, на w1–w4 — 0, `score = 1500`;
  - `nobody in ends the round early`: усі помилилися на w1 → `next` з reveal → `round_end`; w2–w5 незіграні;
  - `ending the round mid-question is like time over`: p1 відповів правильно на w2, p3 — ні → `endRound` → p3 згорів (без запису), p1 survived із банком w1 + w2;
  - `ending the game moves the banks too`: `end` посеред драбини → `finished`, банки тих, хто в грі, — у балах;
  - `no streaks, no speed bonus, no time for ties`: у записах `streakBonus 0`, `totalTimeMs` гравців після раунду = 0;
  - `a wipeout question opens with the «Запитання N» splash` (гра із заставками, `lobbyWithSplash`): `splash.kind === 'question'`;
  - `the classic round after it plays as before`: після `round_end` → `next` → класика; бали класики додаються до перенесених.
  - `restore.test.ts`: `KEYS[7]` = `KEYS[6]` + `Play: …,wipeout` + `WipeoutPlay: 'end,stay,took'` (порядок — як у наявних записах); `representative()` + стан «Ва-банк» на `reveal` другого запитання з `Play.wipeout`; `READABLE_STATE_VERSIONS` `[2, 3, 4, 5, 6, 7]`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine` → FAIL.
- [ ] **Step 3: Implement** `wipeout.ts`, зміни `game.ts`, `splash.ts`, фікстури, версію.
  - `withWipeoutPoints` збирає `WipeoutStep` з закритих записів раунду: `price = play.question.points`, `correct` — гравці з `grade === 'correct'`, `took = play.wipeout?.took ?? []`. Далі викликає `wipeoutStandings` (shared) і переписує записи.
  - `markWipeoutEnd` у `finishRound` має спрацьовувати до `withTotals` наступного виклику. `finishRound` не викликає `withTotals` сам, тож у `next` / `endRound` / `advance` переконатися, що підсумок рахується (за потреби обгорнути `withTotals(markWipeoutEnd(...))`).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine
  git commit -m "feat(engine): wipeout answers — only players still in answer, the slider counts only inside the tolerance, banks grow or burn, banks move into the score when taken or when the round ends; state version 7"
  ```

### Задача 3. Рушій: вікно «Далі / Забрати», типово «Забрати», пауза й тік, «Далі» ведучого, оцінка ведучого, вилучення

**Files:**
- Modify: `packages/engine/src/wipeout.ts`, `packages/engine/src/game.ts`, `packages/engine/src/blitz.ts`
- Test: `packages/engine/src/game.wipeout.test.ts`

**Interfaces:**
- Produces (`wipeout.ts`):
  ```ts
  export const WIPEOUT_DECIDE_MS = LIMITS.wipeoutDecideSeconds * 1000;

  /** Вікно рішення відкрите: етап leaderboard у «Ва-банк» з endsAt (або на паузі з remainingMs). */
  export function decisionOpen(state: GameState): boolean;

  /** Етап leaderboard з вікном: startedAt = now, endsAt = now + WIPEOUT_DECIDE_MS, remainingMs null. */
  export function openDecision(state: GameState, now: number): GameState;

  /**
   * «Далі» (take false) чи «Забрати» (take true). Помилки: wrong_phase (не вікно), paused, not_found, not_allowed (не в грі), already_answered.
   * Коли вирішили всі присутні в грі — closeDecision.
   */
  export function decideWipeout(state: GameState, playerId: string, take: boolean, now: number): Result;

  /** Закриває вікно: невирішені в грі → took (типово «Забрати»), startedAt/endsAt/remainingMs null; підсумок — withTotals. */
  export function closeDecision(state: GameState): GameState;
  ```
- Changes (`game.ts`):
  - `next`:
    - `case 'reveal'` у «Ва-банк» (до звичайної гілки `nextQuestion`): `nextQuestion === undefined` (останнє або нікого в грі) → `finishRound(markWipeoutEnd(...))`; інакше → `openDecision(state, now)`. Налаштування `leaderboard` не перевіряється;
    - `case 'leaderboard'` у «Ва-банк»: `decisionOpen` → `fail('deciding')`; інакше `advance` (нікого в грі → `finishRound`, бо `nextQuestion` → `undefined`).
  - `tick`: `if (state.phase === 'leaderboard') return state.paused || !decisionOpen(state) || state.endsAt === null || now <= state.endsAt ? state : closeDecision(state);` (строго «>», як `timeOver`).
  - `pause`: умова з таймером — `(phase === 'question' || phase === 'duel' || (phase === 'leaderboard' && decisionOpen(state))) && state.endsAt !== null` → `remainingMs = endsAt − now`, `startedAt`/`endsAt` null. Для `leaderboard` `trimOvertime` не викликати.
  - `resumeClock`: `if (state.phase === 'leaderboard' && state.remainingMs !== null) return ok({ ...state, paused: false, pausedAt: null, remainingMs: null, startedAt: now, endsAt: now + state.remainingMs });`.
  - `endRound`: на `leaderboard` з відкритим вікном — спершу `closeDecision`.
  - `end`: так само `closeDecision`, якщо вікно відкрите.
  - `setConnected` і `removePlayer`: якщо вікно відкрите, а всі присутні в грі вже вирішили → `closeDecision` (як `autoLock` для відповідей). `resume` — так само.
  - `override` у «Ва-банк»: лише `reveal` (як у класиці; `leaderboard` → `wrong_phase`); `partial` → `partial_disabled`; немає запису → `not_found`. Запис: `accepted`/`accuracy`/`grade` за оцінкою, `overridden: true`. Бали — `withTotals` (через `withWipeoutPoints`).
- Changes (`blitz.ts`, `nextDeadline`): `if (state.phase === 'leaderboard') return state.paused || state.endsAt === null || state.endsAt <= now ? null : state.endsAt;` (поза «Ва-банк» `endsAt` на `leaderboard` завжди `null`).

- [ ] **Step 1: Write the failing tests** (`game.wipeout.test.ts`, новий `describe('decisions (10g)')`):
  - `after the reveal the ladder opens a 10-second window`: `next` з reveal w1 → `phase 'leaderboard'`, `endsAt = now + 10_000`, навіть з `leaderboard: 'end'`;
  - `stay keeps the player in, take moves the bank into the score at once`: p1 `take` → `score 100`, статус `took`, запис w1 `points 100`; p2 `stay`; вікно закривається само (усі присутні вирішили), `endsAt null`;
  - `a decision is final`: друге рішення → `already_answered`;
  - `only players still in decide`: згорілий → `not_allowed`; поза вікном → `wrong_phase`;
  - `no choice means take`: p1 вирішив, p2 мовчить → `tick(endsAt + 1)` → p2 `took`; `tick(endsAt)` рівно — ще ні;
  - `an absent player does not hold the window`: p3 відключено → p1 і p2 вирішили → вікно закрите, p3 `took`;
  - `the host cannot skip an open window`: `next` → `deciding`; після закриття — наступне запитання лише для тих, хто «Далі»;
  - `when everybody took, the next step ends the round`: усі `take` → `next` → `round_end`, w3–w5 незіграні;
  - `pause freezes the window`: `pause` на 4-й секунді → `remainingMs 6000`, `tick` нічого не робить; `resume` через 30 с → `endsAt = resume + 6000`;
  - `nextDeadline is the end of the window`: `nextDeadline(state, now)` = `endsAt`; на паузі — `null`;
  - `ending the round mid-window takes for the undecided`: `endRound` → p2 (невирішений) `took` (не `survived`), бали ті самі;
  - `suspend keeps an open window paused and readable` (`restore.ts`): `suspend(state, at)` → `paused`, `remainingMs` = залишок; після `resume` вікно йде далі;
  - `the host override on the reveal brings a burned player back`: текстове запитання w4, p2 «Одесса» (не в `accepted`) → reveal → `override(p2, 'correct')` → p2 in із банком; на `leaderboard` `override` → `wrong_phase`; `partial` → `partial_disabled`;
  - `kicking the last undecided player closes the window`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine
  git commit -m "feat(engine): wipeout decisions — a 10-second window after each reveal, one final choice, no choice means take, the window closes when every present player chose, pauses with the game and blocks the host's next; the host overrides only on the reveal"
  ```

### Задача 4. Рушій: ізоляція «Ва-банк» — без бафів, дебафів, дуелей і правил

**Files:**
- Modify: `packages/engine/src/buffs.ts`, `packages/engine/src/debuffs.ts`, `packages/engine/src/duel.ts`
- Test: новий `packages/engine/src/game.wipeout-isolation.test.ts`

**Interfaces:**
- Changes (`buffs.ts`): `PlaceBlock` + `'off_wipeout'`; у `placeBlock` після бліцу: `else if (round.type === 'wipeout') return 'off_wipeout';`. Ряд бафів телефона показує причину (`buffRowHere` — так).
- Changes (`debuffs.ts`):
  ```ts
  /** У раунді «Ва-банк» дебафів немає (14a): на його етапах, крім round_end. */
  export function debuffsOff(state: GameState): boolean;
  ```
  - `setDebuff`: `debuffsOff` → `not_allowed` (після `not_found`);
  - `shopBlock`: `debuffsOff` → `'phase'` (поруч із фіналом);
  - `fireDebuffs`: на запитанні раунду «Ва-банк» `answering` порожній (дебафи чекають, як на опитуванні).
  - `cancelDebuff` — без змін.
- Changes (`duel.ts`): `duelWindowOpen` і `duelDue` → `false`, якщо поточний раунд «Ва-банк» і фаза не `round_end`.

- [ ] **Step 1: Write the failing tests** (вікторина з бафами `['double', 'fifty']`, дебафами, дуелями; раунди: класика `r1` (1 запитання), `wipeout` `rw`, класика `r3`):
  - `buffs are off with a reason`: на w1 `takeBuff(p1, 'double')` → `buff_unfit` (чи наявний код відмови для `off_*`); `playerView` → слот `blocked` з `off_wipeout`;
  - `the host cannot send a debuff during the round, but can on its round_end`: `setDebuff` на `intro`/`question`/`leaderboard` → `not_allowed`; на `round_end` → ok;
  - `the shop is closed during the round`: `buyDebuff` → `wrong_phase`; `shopBlock` → `'phase'`; на `round_end` — відкрито;
  - `a pending debuff waits through the round and fires in the next one`: дебаф, наісланий у `r1`, на w1…w5 не спрацьовує (`firedAt null`), спрацьовує на першому запитанні `r3`;
  - `no duels in the round`: поріг досягнуто → `duelWindowOpen` false на w-запитаннях; дуель, оголошена в `r1`, не стартує на `intro` раунду «Ва-банк» (`next` відкриває перше запитання), стартує на `round_end`;
  - `round rules do not exist`: `rulesOf(rw)` = `DEFAULT_RULES`; `roundBrief(rw)` — без штрафу, серій, множника, швидкості.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine
  git commit -m "feat(engine): wipeout is isolated — no buffs (off_wipeout), no debuffs from the host or the shop (pending ones wait for the next round), no duels until its round_end"
  ```

### Задача 5. Зрізи: драбина, власний стан гравця, рішення без підглядання, банки лише з розкриття

**Files:**
- Modify: `packages/shared/src/views.ts`, `packages/engine/src/views.ts`
- Test: новий `packages/engine/src/views.wipeout.test.ts`; фабрики зрізів у тестах вебу (`apps/web/src/**/*.test.tsx`, де будують `BaseView`/`PlayerView`)

**Interfaces:**
- Produces (`shared/views.ts`):
  ```ts
  /** Рядок драбини: гравець, стан, банк і рішення у вікні. */
  export interface WipeoutRow extends BlitzPlayer {
    status: WipeoutStatus;
    /** in — банк зараз; took / survived — перенесено; burned — 0. */
    bank: number;
    /** Крок (0-базовий), на якому забрав, згорів чи доніс; null — у грі. */
    step: number | null;
    /** Лише у вікні рішення й лише для тих, хто в грі: сцена й телефони — pending / decided; пульт — pending / stay / take. Інакше null. */
    decision: 'pending' | 'decided' | 'stay' | 'take' | null;
  }

  /** «Ва-банк» (10g). */
  export interface WipeoutInfo {
    /** Ціни запитань раунду в порядку гри. */
    ladder: number[];
    /** Поточна сходинка: запитання, що йде чи щойно розкрите (0-базове); -1 до першого. */
    current: number;
    /** Скільки сходинок пройдено й розкрито: на question / locked поточна не входить. */
    done: number;
    /** У порядку гравців. */
    rows: WipeoutRow[];
    /** Скільки зараз у грі (на question — хто може відповідати). */
    inCount: number;
    /** Вікно «Далі / Забрати»; null — вікна немає. */
    decide: { endsAt: number | null; remainingMs: number | null; decided: number; total: number } | null;
  }

  // BaseView:
  /** «Ва-банк»: від intro до round_end свого раунду (і finished, якщо він останній); інакше null. */
  wipeout: WipeoutInfo | null;

  // PlayerView['me']:
  /** Власний стан у «Ва-банк»; null поза раундом. canDecide — вікно відкрите, гравець у грі, ще не вирішив, не пауза. */
  wipeout: { status: WipeoutStatus; bank: number; decision: 'stay' | 'take' | null; canDecide: boolean } | null;
  ```
- Changes (`engine/views.ts`):
  - `wipeoutInfo(state, forHost)`: рядки — `wipeoutTable(state, roundIndex, upTo)`, де `upTo` на `question`/`locked` = `questionIndex` (без поточного), інакше — усі закриті. `decision` — за `Play.wipeout.took`/`stay` поточного запитання лише при `decisionOpen`. Для сцени й телефонів `stay`/`take` → `decided`.
  - `playerWipeout(state, playerId)`.
  - `publicStandings`: на `leaderboard` у «Ва-банк» → `null` (сцена й телефон); `liveTable` — без змін.
  - `hostView.allowed.debuffs`: `debuffsOff(state)` → `[]`.
  - `hostView.standings` — як завжди.
- Фабрики зрізів у тестах вебу: `wipeout: null`, `me.wipeout: null`.

- [ ] **Step 1: Write the failing tests** (`views.wipeout.test.ts`):
  - `the ladder shows prices and everyone in on the intro`: `stageView` на `intro` — `ladder [100…500]`, `current -1`, `done 0`, усі `in` з 0, `decide null`;
  - `no new bank or burn reaches the stage or phones before the reveal`: p1 правильно, p2 неправильно на w2; на `question` і `locked` `JSON.stringify(stageView)` і `playerView(p2)` не містять `"burned"` для p2 і банку 300 для p1; `me.wipeout.status` p2 — `in`; на `reveal` — p2 `burned`, p1 `in` 300;
  - `phones and the stage see only who decided; the host sees the choice`: у вікні p1 `take` → stage/phone рядок p1 `decision 'decided'`, рядок p2 `'pending'`; host — `'take'`; `JSON.stringify(stageView)` не містить `"take"` і `"stay"`;
  - `the window carries its clock`: `decide.endsAt` = `state.endsAt`; на паузі `endsAt null`, `remainingMs` = залишок; `decided`/`total`;
  - `me.wipeout`: `canDecide` true лише у вікні, для того, хто в грі й не вирішив; false на паузі й після рішення; `decision` — власне;
  - `the ladder replaces the leaderboard, the table button still works`: на `leaderboard` у «Ва-банк» `stageView.standings === null`, `playerView.standings === null`, `playerView.table` не `null`;
  - `the host loses the debuff menu during the round`: `hostView.allowed.debuffs` `[]` на w-запитанні й `[...]` на `round_end`;
  - `outside wipeout there is no ladder`: класика → `wipeout: null`, `me.wipeout: null`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared packages/engine apps/web/src
  git commit -m "feat(engine): wipeout views — the ladder with banks and states, own state on the phone, decisions shown only as decided until the window closes, banks of the current question only from the reveal, the ladder instead of the leaderboard"
  ```

### Задача 6. Сервер і демо: подія рішення, рішення в історії, раунд «Ва-банк» у демо

**Files:**
- Modify: `packages/shared/src/events.ts`, `packages/shared/src/history.ts`, `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`, `apps/server/src/recorder.ts`, `apps/server/src/history.ts`, `apps/server/src/db/schema.ts`, `apps/server/scripts/demo-quiz.ts`
- Test: `apps/server/src/socket.test.ts`, `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts`, `apps/server/src/profiles.test.ts`, `apps/server/scripts/demo-quiz.test.ts`

**Interfaces:**
- Produces (`events.ts`):
  ```ts
  /** «Ва-банк»: «Забрати» (true) чи «Далі» (false). */
  export const wipeoutSchema = z.object({ take: z.boolean() });
  // ClientToServerEvents:
  /** «Ва-банк»: рішення після розкриття (10g). */
  'player:wipeout': (payload: z.infer<typeof wipeoutSchema>, ack: Ack) => void;
  ```
- Changes (`manager.ts`): `wipeout(room, playerId, take): AckResult` → `this.apply(room, decideWipeout(room.state, playerId, take, this.now()))`. Розклад тіку бере `nextDeadline` (задача 3) — перевірити тестом, що вікно закривається саме.
- Changes (`socket.ts`): `on('player:wipeout', …)` за зразком `player:bluff` (лише гравець; `wipeoutSchema.safeParse`).
- Changes (`db/schema.ts`, `PlayRef`):
  ```ts
  /** «Ва-банк»: хто забрав банк після цього запитання (id учасників) і чи скінчився на ньому раунд. */
  wipeout?: { took: string[]; end?: true };
  ```
- Changes (`recorder.ts`, `save` → `plays`): `...(play.wipeout === undefined ? {} : { wipeout: { took: play.wipeout.took, ...(play.wipeout.end ? { end: true as const } : {}) } })`. `signature` уже бачить зміну балів останнього закритого запитання. Перевірити тестом, що рішення без зміни фази записується.
- Produces (`shared/history.ts`, `GameQuestionResult`):
  ```ts
  /** «Ва-банк»: ціна сходинки й стан кожного учасника після неї (за турнірною таблицею). */
  wipeout?: { price: number; rows: { nickname: string; status: WipeoutStatus; bank: number }[] };
  ```
- Changes (`server/history.ts`): для запитань раунду `wipeout` — `wipeoutResult(...)`. Кроки раунду до цього запитання включно: `price` зі знімка, `correct` — учасники з рядком `accepted` (attempt 0), `took` — з `ref.wipeout.took`. `over` — `ref.wipeout.end` на цьому запитанні. Далі `wipeoutStandings` (shared), нікнейми за `standings`. Учасник, якого вилучили, у рядки не потрапляє.
- Демо (`demo-quiz.ts`): раунд `r-wipeout` «Ва-банк: столиці» перед `r-final`. П'ять запитань із цінами 100, 200, 300, 400, 500 (усі чотири прості типи й повзунок). Факти — перевірені, по одному реченню в коментарі біля кожного:
  1. `single` «Столиця Канади?» — Оттава (Торонто, Монреаль, Ванкувер), 100;
  2. `boolean` «Канберра — столиця Австралії», true, 200;
  3. `numeric` «Скільки областей в Україні?» — 24, допуск 0, 300 (24 області, окремо — Автономна Республіка Крим і два міста зі спеціальним статусом);
  4. `text` «Столиця Туреччини?» — `['Анкара']`, 400;
  5. `slider` «Скільки країн-членів має ООН?» — 193, 150…210, крок 1, допуск 2, 500.

  Вікторина лишається в межах `LIMITS.maxRounds` (було 8 → 9) і `LIMITS.maxQuizQuestions`.

- [ ] **Step 1: Write the failing tests**
  - `socket.test.ts`:
    - `player:wipeout` записує рішення; невалідне тіло → `invalid_payload`; від ведучого → `forbidden`; поза вікном → `wrong_phase`;
    - вікно закривається само за 10 с без рішень (фейковий годинник менеджера, як у наявних тестах дедлайнів) і дає `took`.
  - `recorder.test.ts`: після «Забрати» `game.plays[i].wipeout.took` містить гравця, `answer.points` рядка цього запитання = банк; після кінця раунду `end: true` на останньому; рахунок учасника = банк.
  - `history.test.ts` (`history: wipeout (10g)`): три учасники (згорів на 2-му, забрав після 2-го, доніс до кінця) → у кожного запитання раунду `wipeout.rows` з правильними статусами й банками; `standings.correct` рахує прийняті відповіді як завжди.
  - `profiles.test.ts`: точність гравця, що згорів, — з його відповідей (прийняті / усі рядки-відповіді); незіграні ним сходинки рядків не мають і точність не псують.
  - `demo-quiz.test.ts`: `quizSchema.safeParse(demoQuiz).success`; є раунд `wipeout` з 5 запитаннями й зростаючими цінами; усі типи з `WIPEOUT_TYPES`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared apps/server
  git commit -m "feat(server): wipeout — player:wipeout decisions, the window closes on its own deadline, decisions and the round end in game plays, ladder states per question in the history; a wipeout round in the demo quiz"
  ```

### Задача 7. Телефон: драбина, «Далі / Забрати» одним пальцем, власний банк і стан

**Files:**
- Create: `apps/web/src/screens/WipeoutLadder.tsx`, `apps/web/src/screens/WipeoutDecision.tsx`
- Modify: `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: нові `WipeoutLadder.test.tsx`, `WipeoutDecision.test.tsx`; `PlayerScreen.test.tsx`

**Interfaces:**
- Produces:
  ```tsx
  /** Драбина «Ва-банк»: сходинки цін знизу вгору з поточною; size — розміри сцени, пульта чи телефона; highlightId — свій рядок. */
  export function WipeoutLadder({ info, size, highlightId }: { info: WipeoutInfo; size: 'stage' | 'host' | 'phone'; highlightId?: string }): JSX.Element;
  /** Гравці за станом: у грі (банк), забрали, згоріли, донесли; рішення у вікні — позначка «вирішив» (сцена) чи вибір (пульт). */
  export function WipeoutPlayers({ info, size }: { info: WipeoutInfo; size: 'stage' | 'host' | 'phone' }): JSX.Element;

  /** Телефон у вікні: «Далі» / «Забрати N» з відліком; після рішення чи поза грою — рядок стану. */
  export function WipeoutDecision({ view, offsetMs, onDecide }: { view: PlayerView; offsetMs: number; onDecide: (take: boolean) => void }): JSX.Element | null;
  ```
- `PlayerScreen.tsx`:
  - на `leaderboard` у «Ва-банк» замість таблиці — `WipeoutDecision` + компактна `WipeoutLadder size="phone"`;
  - `send('player:wipeout', { take })` через наявний `useGuardedSend` (помилку з ack показати, як у `WallInput`);
  - на `question` гравця не в грі — рядок «Ти вже не граєш у цьому раунді — дивись» замість поля відповіді (поле не показувати);
  - на `reveal` у «Ва-банк» під вердиктом — «Банк: N» або «Банк згорів» з `me.wipeout` замість «+N балів» (`me.result.points` тут не показувати: це не бали за запитання);
  - на `round_end` — рядок підсумку: «Забрано N» / «Донесено до кінця: N» / «Банк згорів».
  - Ряд бафів з причиною `off_wipeout` — наявний `Buffs.tsx`, нічого не міняти.
- `i18n.ts`:
  - `wipeoutGo: 'Далі'`, `wipeoutTake: 'Забрати {bank}'`;
  - `wipeoutDefault: 'Не вибереш за {seconds} с — банк забереться сам.'`;
  - `wipeoutBank: 'Банк: {bank}'`, `wipeoutBurned: 'Банк згорів'`;
  - `wipeoutTook: 'Забрано {bank}'`, `wipeoutSurvived: 'Донесено до кінця: {bank}'`;
  - `wipeoutStayed: 'Ти йдеш далі. Чекаємо інших…'`, `wipeoutOut: 'Ти вже не граєш у цьому раунді — дивись.'`;
  - `wipeoutLadderTitle: 'Драбина'`, `wipeoutStep: 'Сходинка {index} з {total}'`;
  - `wipeoutGroupIn: 'У грі'`, `wipeoutGroupTook: 'Забрали'`, `wipeoutGroupBurned: 'Згоріли'`, `wipeoutGroupSurvived: 'Донесли'`;
  - `wipeoutDecided: 'Вирішили {n} з {total}'`.

- [ ] **Step 1: Write the failing tests**
  - `WipeoutLadder.test.tsx`: 5 сходинок, поточна має `aria-current="step"`, пройдені — позначені; гравці згруповані; `decision 'decided'` → позначка «✓ вирішив» без вибору.
  - `WipeoutDecision.test.tsx`:
    - `canDecide` → дві кнопки «Далі» і «Забрати 300», відлік і `wipeoutDefault`; натиск → `onDecide(true|false)`;
    - `decision 'stay'` → `wipeoutStayed`, кнопок немає; `took` → «Забрано 300»; `burned` → «Банк згорів»;
    - на паузі кнопки вимкнені.
  - `PlayerScreen.test.tsx`: на `leaderboard` у «Ва-банк» немає `Standings`, є кнопки; на `question` гравця `burned` поля відповіді немає, є `wipeoutOut`; на `reveal` — «Банк: 300», без «+300».
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web` → FAIL.
- [ ] **Step 3: Implement.** Стилі: кнопки на всю ширину, ≥ 56 px, «Забрати» — акцентна, «Далі» — звичайна; 375 px без прокрутки вбік.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): wipeout on the phone — big «Далі» and «Забрати» with a countdown and the take-by-default line, own bank on the reveal, a watching line for burned players, the shared ladder"
  ```

### Задача 8. Сцена, пульт, історія: драбина між запитаннями, рішення наживо, вимкнене «Далі» під час вікна

**Files:**
- Create: `apps/web/src/screens/HostWipeout.tsx`
- Modify: `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/HostScreen.tsx`, `apps/web/src/pages/GameHistory.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `StageScreen.test.tsx`, `HostScreen.test.tsx`, новий `HostWipeout.test.tsx`, `GameHistory.test.tsx`

**Interfaces:**
- `StageScreen.tsx`:
  - `intro` «Ва-банк» — під `RoundBriefing` драбина `WipeoutLadder size="stage"`;
  - `question` / `locked` / `reveal` — вузька смуга драбини з поточною сходинкою й ціною («Сходинка 3 з 5 · 300»);
  - `leaderboard` у «Ва-банк» — велика драбина + `WipeoutPlayers` + «Вирішили N з M» з відліком `Timer` від `info.decide`; після закриття — без відліку;
  - `round_end` — як завжди (таблиця).
  - `expectStageFits` у задачі 11 перевіряє 1280 × 720.
- `HostWipeout.tsx`:
  ```tsx
  /** Пульт «Ва-банк»: драбина, гравці з банками й рішеннями наживо, «ⓘ» раунду. */
  export function HostWipeout({ view, offsetMs }: { view: HostView; offsetMs: number }): JSX.Element | null;
  ```
- `HostScreen.tsx`:
  - `HostWipeout` на етапах раунду;
  - головна дія на `leaderboard` у «Ва-банк»: поки `info.decide !== null` — кнопка вимкнена з текстом `wipeoutDeciding` («Гравці вирішують… {seconds} с»); після закриття — «Наступне запитання» або, якщо в грі нікого, «Підсумки раунду» (`wipeoutToResults`);
  - рядок «Відповіли N з M» на `question` у «Ва-банк» — `M = info.inCount`.
  - Меню дебафів у `HostPlayerTools` ховається саме (`allowed.debuffs = []`), перевірити тестом. Кнопки «Зарахувати / Відхилити» на `reveal` текстового запитання — наявні.
- `GameHistory.tsx`: для запитання з `wipeout` — під відповідями рядок стану учасників («Оля — банк згорів · Петро — забрав 300 · Віра — у грі, 300»; після кінця — «донесла 1500»). Тексти:
  - `historyWipeoutIn: '{name} — у грі, {bank}'`;
  - `historyWipeoutTook: '{name} — забрав(-ла) {bank}'`;
  - `historyWipeoutBurned: '{name} — банк згорів'`;
  - `historyWipeoutSurvived: '{name} — доніс(-ла) {bank}'`.
  - *Рішення:* без роду за нікнеймом, як у наявних текстах історії.
- `i18n.ts`: `wipeoutDeciding: 'Гравці вирішують… {seconds} с'`, `wipeoutToResults: 'Підсумки раунду'`, `wipeoutStageStrip: 'Сходинка {index} з {total} · {price}'`, `wipeoutChoiceStay: 'далі'`, `wipeoutChoiceTake: 'забирає'`, `wipeoutChoicePending: 'думає…'`.

- [ ] **Step 1: Write the failing tests**
  - `StageScreen.test.tsx`: `leaderboard` у «Ва-банк» — драбина, групи гравців, «Вирішили 1 з 2», без `Standings`; `intro` — драбина під пам'яткою; `question` — смуга «Сходинка 2 з 5 · 200».
  - `HostWipeout.test.tsx`: рішення наживо («Оля — забирає», «Петро — думає…»); «ⓘ» з `round.wipeout`.
  - `HostScreen.test.tsx`: головна кнопка вимкнена, поки `decide` не `null`; «Підсумки раунду», коли в грі нікого; немає меню дебафів у «Ва-банк».
  - `GameHistory.test.tsx`: рядки стану з `wipeout.rows`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): wipeout on the stage, host and history — the ladder on the intro and between questions, a rung strip during questions, live decisions and a disabled next while players decide, ladder states in the history"
  ```

### Задача 9. Редактор: раунд «Ва-банк» із зростаючими цінами, лише прості типи, 5–15 запитань

**Files:**
- Modify: `apps/web/src/editor/QuizEditor.tsx`, `apps/web/src/editor/RoundSettings.tsx`, `apps/web/src/editor/draft.ts`, `apps/web/src/i18n.ts`
- Test: `apps/web/src/editor/QuizEditor.test.tsx`, `apps/web/src/editor/draft.test.ts`

**Interfaces:**
- `draft.ts`:
  ```ts
  /** Нове запитання драбини «Ва-банк»: «один варіант», ціна на сотню вища за попереднє (не більше максимуму); перше — 100. */
  export function newWipeoutQuestion(after: Question | undefined): Question;
  ```
  - `problemsOf`:
    - раунд `wipeout` з менш ніж `LIMITS.minWipeoutQuestions` запитаннями → `problemWipeoutFew`;
    - з більш ніж `LIMITS.maxWipeoutQuestions` → `problemWipeoutMany`;
    - запитання з типом поза `WIPEOUT_TYPES` (раунд імпортовано зі старої чернетки) → `problemWipeoutType`;
    - в останній перевірці схемою `wipeout_type` → `problemWipeoutType`.
  - `roundPlace` для `wipeout` — як бліц/фінал (нічого з нового).
- `QuizEditor.tsx`:
  - «Додати запитання» в раунді `wipeout` → `newWipeoutQuestion(останнє)`;
  - `roomForMore` ще й `questions.length < LIMITS.maxWipeoutQuestions`;
  - кнопка «Видалити» запитання в «Ва-банк» вимкнена, коли запитань `LIMITS.minWipeoutQuestions`, з підказкою `wipeoutMinHint`;
  - `QuestionEditor`: `types={questionTypesFor('wipeout')}`, `showPoints`, `showReveal={false}`, `allowCloud={false}`;
  - у списку запитань біля кожного — ціна («100», «200»…), щоб драбину було видно (`question-item-price`).
- `RoundSettings.tsx` для `wipeout`:
  - назва, опис, «Однаковий час», «Перемішувати варіанти»;
  - без правил, бонусу за швидкість і перевірки;
  - рядок `wipeoutSettingsNote` («Правил балів, бафів, дебафів і дуелей у «Ва-банк» немає.») з `HelpButton id="round.wipeout"`.
- `RoundStrip.tsx` — без змін (кнопка «Ва-банк» з «ⓘ» з'являється сама з `ROUND_TYPES`). Перевірити тестом.
- `i18n.ts`:
  - `problemWipeoutFew: 'У «Ва-банк» щонайменше {min} запитань.'`;
  - `problemWipeoutMany: 'У «Ва-банк» щонайбільше {max} запитань.'`;
  - `problemWipeoutType: 'У «Ва-банк» лише запитання: один варіант, так/ні, число, текст, повзунок.'`;
  - `wipeoutMinHint: 'Менше {min} запитань у «Ва-банк» не буває.'`;
  - `wipeoutSettingsNote: 'Правил балів, бафів, дебафів і дуелей у «Ва-банк» немає.'`.

- [ ] **Step 1: Write the failing tests**
  - `draft.test.ts`:
    - `newWipeoutQuestion(undefined).points === 100`; після запитання з 1950 → 2000; після 2000 → 2000;
    - `problemsOf` для 4 запитань → `problemWipeoutFew`; для запитання `multi` у раунді → `problemWipeoutType`; заповнений раунд з 5 → без проблем.
  - `QuizEditor.test.tsx`:
    - «+ Раунд» → «Ва-банк» → вкладка з п'ятьма запитаннями, у списку ціни 100…500;
    - вибір типу запитання має лише 5 типів;
    - «Додати запитання» → шосте з ціною 600;
    - видалення вимкнене на п'яти;
    - у налаштуваннях раунду немає «Мінус за помилку» й «Бонус за швидкість», є `wipeoutSettingsNote`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): editor for wipeout — a new round with five rising prices, each new rung a hundred higher, only simple question types, 5–15 questions, no round rules"
  ```

### Задача 10. Довідка ведучого: «Ва-банк» і оновлені записи бафів, дебафів, дуелей і налаштувань

**Files:**
- Modify: `apps/web/src/help/rounds.ts`, `apps/web/src/help/powers.ts`, `apps/web/src/help/settings.ts`, `apps/web/src/i18n.ts`, `apps/web/src/screens/HostWipeout.tsx`
- Test: `apps/web/src/help/host-help.test.ts`

**Interfaces:**
- `ROUND_HELP.wipeout`:
  - **title** `'Ва-банк'`.
  - **what:** «Драбина запитань: правильна відповідь додає ціну в банк, помилка його спалює. Після кожної правильної гравець вирішує — ризикнути далі чи забрати банк у бали.»
  - **how:**
    - «Усі, хто ще в грі, отримують те саме запитання одночасно.»
    - «Після “Показати відповідь” сцена показує, хто вцілів і скільки в банку. Хто помилився чи не відповів (зокрема випав зі зв'язку), згорає: банк 0, до кінця раунду лише дивиться.»
    - `«Ви натискаєте “Далі” — на сцені драбина, а гравці в грі вибирають у телефоні “Далі” чи “Забрати”. На це ${LIMITS.wipeoutDecideSeconds} секунд; хто не вибрав, забирає банк сам.»`
    - «Поки гравці вирішують, кнопка “Далі” на пульті чекає. Пауза зупиняє відлік.»
    - «Після останнього запитання банки тих, хто вцілів, переносяться в бали самі. Якщо в грі нікого не лишилося, раунд закінчується раніше.»
    - «Текстову відповідь можна зарахувати чи відхилити вручну, поки на сцені відповідь (до “Далі”).»
  - **points:**
    - «Бали дає лише забраний або донесений до кінця банк: сума цін запитань, на які гравець відповів правильно.»
    - «Згорілий банк не дає нічого, але й не забирає вже набраних балів гри.»
    - «Число й повзунок зараховуються лише в межах допуску: часткових балів тут немає.»
    - «Множника, штрафу, серій і бонусу за швидкість у “Ва-банк” немає.»
  - **tip:**
    - «Ставте ціни, що зростають: 100, 200, 300… Тоді останні сходинки справді спокусливі.»
    - «Перші запитання — легкі, щоб банк устиг набратися; останні — важкі.»
    - «Не плутайте з кнопкою “Ва-банк” у ставках фіналу: там ставиться весь рахунок на одне запитання.»
  - **limits:**
    - `` `${LIMITS.minWipeoutQuestions}–${LIMITS.maxWipeoutQuestions} запитань: один варіант, так/ні, число, текст, повзунок.` ``
    - «Бафи, дебафи (і від ведучого, і з крамниці) та дуелі в цьому раунді не діють; дебаф, що чекає, спрацює в наступному раунді.»
    - «Між запитаннями сцена показує драбину, а не таблицю; кнопка “Таблиця” в телефоні працює.»
    - «Банк можна забрати лише після правильної відповіді; до першого запитання забирати нічого.»
    - «Завершити раунд посеред запитання — як кінець часу: хто не встиг відповісти, згорає.»
- Пов'язані записи:
  - `help/powers.ts`: `EXCL` для бафів: «…у фіналі, у “Ва-банк”, на запитаннях…». Записи дебафів (якщо в них є розділ «Обмеження» про фінал чи крамницю) — «у “Ва-банк” дебафів немає».
  - `i18n.ts`: `buffHelpNone` (текст для гравця) узгодити з `EXCL`. Знайти й доповнити інші переліки «де не діє» (`grep -n "фінал" apps/web/src/i18n.ts` — `guideBuffsWhere`, тексти крамниці й дуелей).
  - `help/settings.ts`:
    - `leaderboard` — «у “Ва-банк” між запитаннями завжди драбина»;
    - `speedBonus`, `penalty`, `partial`, `streak`, `multiplier` — «у фіналі й “Ва-банк” …немає»;
    - `debuffShop` — «не купується у фіналі, у “Ва-банк”, на паузі й під час дуелі»;
    - `duels` — «у “Ва-банк” дуелі не оголошуються й не починаються; оголошена раніше почнеться після раунду».
  - `help/rounds.ts`: `round.final` → порада «Кнопка “Ва-банк” у ставках — не те саме, що раунд “Ва-банк”»; `round.classic` (`tip`) — «“Ва-банк” — окремий тип раунду для напруги наприкінці гри».
- `HostWipeout.tsx`: «ⓘ» з `round.wipeout` біля заголовка панелі (якщо ще немає з задачі 8).

- [ ] **Step 1: Write the failing tests** (`host-help.test.ts`):
  - наявні загальні тести (кожен тип раунду має запис, назва = `t(ROUND_NAMES.wipeout)`, теми за `ROUND_TYPES`) покривають `round.wipeout` самі. Додати:
    - `expect(text('round.wipeout')).toContain(String(LIMITS.wipeoutDecideSeconds))`, `.toContain(\`${LIMITS.minWipeoutQuestions}–${LIMITS.maxWipeoutQuestions}\`)`, `.toContain('забирає банк сам')`;
    - кожен баф: «Обмеження» містить «у “Ва-банк”» (через оновлений буквальний `EXCL`);
    - `setting.debuffShop`, `setting.duels`, `setting.leaderboard` згадують «Ва-банк»;
    - `round.final` згадує, що кнопка «Ва-банк» — не раунд;
    - `searchHelp('ва-банк')` містить `round.wipeout`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/help` → FAIL.
- [ ] **Step 3: Implement.** Тексти звірити з рушієм (задачі 2–4): типово «Забрати», 10 с, допуск повзунка, кінець раунду.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "docs(web): host help for wipeout (the ladder, burning, take or go with take by default, banks at the end, no buffs, debuffs, duels or round rules); buff, debuff, duel, leaderboard and final entries updated; ⓘ on the host wipeout panel"
  ```

### Задача 11. Наскрізний сценарій 10g з кадрами

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–10. Помічники:
  - `open`, `register`, `join`, `shot`, `afterSplash`, `expectNoSideScroll`, `expectStageFits`, `field`, `click`;
  - `snapshot`, `socketFrames`, `framesBeforeReveal`, `scoreOf`, `totalOf`, `toNextQuestion`, `makeRoundsQuiz`, `classicRound`.
- Нові помічники у файлі:
  ```ts
  /** Натискає «Далі» (take false) чи «Забрати …» (take true) на телефоні. */
  async function decide(page: Page, take: boolean): Promise<void>;
  /** Стан гравця на драбині сцени чи пульта: текст групи, у якій стоїть нікнейм. */
  async function ladderGroupOf(page: Page, nickname: string): Promise<string>;
  ```

- [ ] **Step 1: Add the scenario** у кінець файлу за зразком 10f:
  ```ts
  it('part 10g: wipeout — the editor builds a ladder with rising prices (375 px too), only players still in answer, a wrong answer burns the bank, take or go on the phone with a countdown, the host waits and pauses the window, a text verdict overridden on the reveal, survivors cash in at the end, no buffs or debuffs, the ladder instead of the leaderboard, banks never leak before the reveal, ladder states in the history', async () => {
    try {
      await wipeoutGame();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Підготовка `wipeoutGame()`:**
  1. `const host = await open('host10g', 1280, 900); await register(host, 'host', 'Ірина Ведуча', 'host10g@example.com');`
  2. Вікторина «Ва-банк 10g» через `POST /api/quizzes`. `settings: { leaderboard: 'each', buffs: ['double'], debuffs: ['fog'] }`. Раунди:
     - `r1` класика (`DEFAULT_RULES`, `speedBonus: false`): `q0` single «Розминка: 2 + 2?» («4», «5»), 100;
     - `rw` «Ва-банк» «Драбина», `shuffleOptions: false`:
       - `w1` single «Столиця Канади?» (Оттава / Торонто / Монреаль), 100;
       - `w2` boolean «Канберра — столиця Австралії», true, 200;
       - `w3` numeric «Скільки сантиметрів в одному метрі?», 100, допуск 0, 300;
       - `w4` text «Столиця Туреччини?», `['Анкара']`, 400;
       - `w5` slider «Скільки країн-членів має ООН?», 150…210, крок 1, 193, допуск 2, 500.
     - Кожне з `timeLimit: 20`.

  **Кроки з перевірками й кадрами (у такому порядку):**
  1. **Редактор (1280 × 900).** «Редагувати» у «Ва-банк 10g»:
     - вкладка «Драбина»: у списку ціни 100…500; у налаштуваннях раунду є `wipeoutSettingsNote` і «ⓘ», немає «Мінус за помилку» → кадр `p10g-editor-wipeout`;
     - вибір типу запитання має рівно 5 типів;
     - «+ Раунд» → «Ва-банк» → новий раунд із п'ятьма запитаннями 100…500 → кадр `p10g-editor-new-wipeout`; «Додати запитання» → шосте з ціною 600; прибрати новий раунд;
     - 375 × 812: `expectNoSideScroll(host, 'p10g-editor-wipeout-375')` → назад 1280 × 900;
     - «Зберегти» без змін → `/quizzes`.
  2. **Гра.**
     - «Грати» → `code`, `stageUrl`; `stage = open('stage10g', 1280, 720)`; `socketFrames(stage)`.
     - `olya`, `petro`, `vira` — `open(…, 375, 812)`, `join` («Оля», «Петро», «Віра»); `socketFrames` кожного.
     - «Почати гру» → `afterSplash` → «Почати раунд». Розминка `q0`: усі «4» → бали по 100 → далі до кінця раунду → «Наступний раунд».
  3. **Intro «Ва-банк».** Сцена: драбина з 5 сходинок → кадр `p10g-stage-intro` (`expectStageFits`). «Почати раунд» → `afterSplash`.
  4. **w1.**
     - Телефон Олі: ряд бафів, «Подвійні бали» вимкнено з «У «Ва-банк» бафів немає.» → кадр `p10g-phone-no-buffs`.
     - Пульт: у меню гравця немає дебафів.
     - Усі «Оттава» → reveal → «Банк: 100» на телефонах → кадр `p10g-phone-reveal`.
     - «Далі» → сцена: драбина, «Вирішили 0 з 3», відлік → кадр `p10g-stage-ladder` (`expectStageFits`).
     - Пульт: головна кнопка вимкнена «Гравці вирішують…» → кадр `p10g-host-deciding`.
     - Телефон Петра: «Далі», «Забрати 100», `wipeoutDefault` → кадр `p10g-phone-decide` + `expectNoSideScroll(petro, …)`.
     - «Таблиця» на телефоні Віри відкривається й показує рахунок → закрити.
     - Пауза на пульті → відлік на телефоні стоїть (дві перевірки тексту з інтервалом 1,5 с однакові) → «Продовжити».
     - Усі тричі `decide(…, false)` → вікно закривається; сцена «Вирішили 3 з 3» без відліку; пульт «Наступне запитання».
  5. **w2.**
     - Оля «Ні» (неправильно), Петро і Віра «Так».
     - **Перевірка витоку:** `framesBeforeReveal` кадрів сцени й Петра для w2 не містять стану Олі `"status":"burned"`.
     - reveal → телефон Олі «Банк згорів» → «Далі».
     - Сцена: Оля в «Згоріли» (`ladderGroupOf(stage, 'Оля')`).
     - Петро `decide(petro, true)` («Забрати 300»), Віра — «Далі». Пульт наживо «Петро — забирає», потім «Віра — далі» → кадр `p10g-host-live`.
     - `scoreOf(host, 'Петро')` = 400 (100 розминки + 300).
  6. **w3.**
     - Телефон Олі: `wipeoutOut`, поля відповіді немає → кадр `p10g-phone-out`. Телефон Петра — так само («Забрано 300»).
     - Віра «100» → запитання закривається саме (єдина в грі) → reveal → «Банк: 600» → «Далі» → Віра «Далі».
  7. **w4 (ручна оцінка).**
     - Віра «Анкарра» → reveal: «Банк згорів».
     - Пульт: «Зарахувати» біля Віри → телефон «Банк: 1000» → кадр `p10g-host-override`.
     - «Далі» → Віра «Далі».
  8. **w5.**
     - Віра ставить 195 (у допуску ±2) → reveal «Банк: 1500».
     - «Далі» → підсумки раунду (без вікна): `scoreOf(host, 'Віра')` = 1600, `scoreOf(host, 'Петро')` = 400, `scoreOf(host, 'Оля')` = 100.
     - Телефон Віри «Донесено до кінця: 1500» → кадр `p10g-phone-survived`.
     - «Завершити гру» (або далі до фінішу).
  9. **Історія.** Пульт → «Мої ігри» → «Ва-банк 10g»:
     - у w2 — «Оля — банк згорів», «Петро — забрав(-ла) 300»;
     - у w5 — «Віра — доніс(-ла) 1500» → кадр `p10g-history`.
- [ ] **Step 2: Run** `pnpm build`, потім у фоні `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 10g"` → PASS. Переглянути кадри `p10g-*`: драбина читається з 3 м, кнопки телефона великі, нічого не обрізано.
- [ ] **Step 3: Повний прогін** у фоні (≈ 10 хв): `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts` → усі сценарії PASS.
- [ ] **Step 4: Commit**
  ```bash
  git add apps/server/e2e
  git commit -m "test: part 10g end-to-end — the editor builds a wipeout ladder with rising prices (375 px too); a wrong answer burns, one player takes midway, one survives to the end; take or go with a countdown that pauses; a text verdict overridden on the reveal; no buffs or debuffs; the ladder instead of the leaderboard; banks never leak before the reveal; ladder states in the history"
  ```
