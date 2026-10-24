# План 10h: Раунд «Вибування» (`survival`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 10h специфікації (розділ 12) і правило розділу 14a для «Вибування»: дебафи діють, дуелей немає, правила раунду діють, як у класиці. Це **другий новий тип раунду** після «Ва-банк» (10g); найближчий прецедент — злитий код 10g.
- **«Вибування» (`survival`)** — новий тип раунду. Ведучий задає:
  - список запитань простих типів (один варіант, так/ні, число, текст, повзунок) з цінами;
  - список **питань на виживання** тих самих типів;
  - **бонус виживання** — бали кожному, хто дожив до кінця;
  - **умову кінця**: лишилося N гравців (типово 1) або скінчилися запитання;
  - **вид випробування**: «питання на виживання» або «удача».
- **Як іде.** Усі живі відповідають на запитання. Бали — як у класиці: множник, штраф, часткові, серії, бонус за швидкість.
  - Хто помилився або не відповів, стає **«на межі»**. Одразу після розкриття, за «Далі» ведучого, він проходить **випробування**:
    - **питання на виживання** — одне запасне запитання раунду одночасно для всіх «на межі»; помилка чи мовчання — вибуває;
    - **удача** — кожен «на межі» вибирає одні з трьох дверей; за одними (для кожного свої, випадково) пастка; хто вибрав пастку — вибуває.
  - **Захист:** якщо помилилися **всі** живі, ніхто не вибуває, випробування немає.
  - Коли питання на виживання скінчилися, випробування стає «удачею».
- **Привиди.** Вибулі бачать запитання й відповідають «для себе». Сцена показує, скільки привидів відгадали. Балів, серій, точності й досягнень це не дає.
- **Кінець.** Після випробування, якщо живих ≤ N, або коли скінчилися запитання, кожен живий отримує бонус виживання; раунд закінчується.
- **Ізоляція (14a, розділ 12).** Бафи не діють. Дебафи (від ведучого й з крамниці) діють, але лише на живих. Дуелей у раунді немає. Правила раунду діють.
- **Сцена:** сторінка «живі / привиди», драматична заставка випробування, двері удачі. **Телефон:** випробування одним пальцем (питання чи троє дверей), режим привида. **Пульт:** живий стан випробування, «Закрити випробування», ручна оцінка тексту.
- **Історія:** хто був «на межі», як пройшов випробування, хто вибув, скільки привидів відгадали, бонус. **Профіль:** запитання, на яких гравець був привидом, не псують точності.
- **Довідка ведучого:** запис `round.survival` (typecheck вимагає) і оновлені записи бафів, дебафів, дуелей, налаштувань.
- **Демо:** раунд `r-survival` у `demo` перед фіналом.

**Архітектура:**
- **Shared (`packages/shared/src/quiz.ts`, новий `survival.ts`, `round-brief.ts`, `game.ts`, `views.ts`, `events.ts`, `history.ts`, `index.ts`).**
  - `survivalRoundSchema` (з `rules` і `speedBonus`, як класика, плюс `trials`, `trial`, `survivors`, `bonus`), `ROUND_TYPES` + `'survival'`, `SURVIVAL_TYPES`, `TRIAL_KINDS`.
  - Ліміти: `minSurvivalQuestions` 3, `maxSurvivalQuestions` 30, `maxSurvivalTrials` 10, `maxSurvivors` 10, `survivalLuckSeconds` 10.
  - Коди вікторини `survival_type`, `survival_trials`, `survival_trial_media`.
  - `BuffBlock` + `'off_survival'`, `SplashKind` + `'trial'` (`SPLASH_MS.trial = 2200`), `AdjustmentSource` + `'survival'`.
  - `RoundBrief.survival`. Новий `survival.ts`: типи `SurvivalStatus`, `TrialKind`, `DOOR_COUNT`, функція `survivorsAfter`.
  - Події `player:trial { answer }` і `player:door { door }`. Зрізи `BaseView.survival: SurvivalInfo | null`, `PlayerView.me.survival`. Історія `GameQuestionResult.survival`.
- **Рушій (`packages/engine`).**
  - Новий `survival.ts`: живі й привиди, відповідь привида, «на межі», відкриття, відповіді, двері, закриття й оцінка випробування, кінець і бонус.
  - `game.ts`: `Play.survival?: SurvivalPlay`, `openQuestion`, `nextQuestion`, `submitAnswer`, `autoLock`, `speedOn`, `next` (`reveal` → етап `leaderboard` з випробуванням чи вердиктом; `leaderboard` → закрити випробування або наступне запитання / кінець), `tick`, `pause`, `resume`, `resumeClock`, `endRound`, `end`, `finishRound`, `override`, `removePlayer`, `setConnected`.
  - `splash.ts`: `'question'` і для «Вибування»; `splashLead` знає `'trial'`.
  - `buffs.ts` → `off_survival`; `debuffs.ts` — лише живі; `duel.ts` — `duelsOff` і для «Вибування».
  - `restore.ts`: **`GAME_STATE_VERSION` 7 → 8**, `READABLE_STATE_VERSIONS = [2, 3, 4, 5, 6, 7, 8]`.
  - `views.ts`: `SurvivalInfo`, `me.survival`, приховування до розкриття й до закриття випробування, сторінка «живі / привиди» замість таблиці.
- **Сервер.** Події й дії менеджера; `PlayRef.survival` у `recorder.ts`; деталі історії й «бонус виживання» в `history.ts`; профіль без запитань-привидів; помічник тестів `testing/survival-game.ts`; демо.
- **Веб.**
  - Спільна сторінка `SurvivalBoard` (сцена, пульт, телефон). Телефон: `SurvivalTrial` (питання чи `SurvivalDoors`), режим привида.
  - Сцена (заставка `trial`, двері, вердикт), пульт (`HostSurvival` з «ⓘ»), історія.
  - Редактор: раунд з трьох запитань і двох питань на виживання; вид випробування, N, бонус; узагальнений `SparesEditor`.
  - Довідка.

**Технології:** TypeScript, zod 4, vitest, Drizzle ORM (PGlite у тестах), Fastify + Socket.IO, React 19 + Vite, Testing Library (jsdom), Playwright. Нових залежностей немає.

**Специфікація:** `docs/superpowers/specs/2026-10-24-new-formats-design.md`:
- розділ 12 (частина 10h);
- розділ 14a: «“Вибування”. Дебафи діють, дуелей немає, правила раунду діють, як у класиці»; «що вважається правильною відповіддю» (повзунок — щонайменше половина ціни); «деплой»;
- розділ 2: анти-цілі «правильна відповідь потрапляє на телефон чи сцену раніше розкриття», «старі вікторини змінюють бали», «живі ігри обриваються деплоєм»;
- розділ 3: нове поле має типове значення; телефон — один палець, вузький екран;
- розділ 5, пункт 5: кожен тип раунду має запис у довідці;
- розділ 17: «“Ва-банк” і “Вибування” без бафів. Вибулі в “Вибуванні” — привиди без балів».

Зразки (найближчі прецеденти — злитий код і план `docs/superpowers/plans/2026-10-24-plan-10g-wipeout.md`):
- **«Ва-банк» (10g):**
  - shared: `wipeoutRoundSchema`, `WIPEOUT_TYPES`, `wipeout_type`, `wipeout.ts`, `off_wipeout`;
  - рушій: `packages/engine/src/wipeout.ts` — `wipeoutTable`, `wipeoutIn`, `submitWipeoutAnswer`, `markWipeoutEnd`, `wipeoutPlayOf`, `decisionOpen`, `openDecision`, `decideWipeout`, `closeDecision`, `settleDecision`, `dropUnstarted`;
  - `game.ts`: гілки `wipeout` у `next`, `tick`, `pause`, `resume`, `endRound`, `end`, `override`, `removePlayer`, `autoLock`, `nextQuestion`;
  - ізоляція: `debuffsOff` (`debuffs.ts`), `duelsOff` (`duel.ts`), `placeBlock` (`buffs.ts`);
  - зрізи: `wipeoutInfo`, `playerWipeout`, `publicStandings`, `liveTable` у `views.ts`; тести `views.wipeout.test.ts`, `game.wipeout.test.ts`, `game.wipeout-isolation.test.ts`;
  - сервер: `manager.wipeout`, `socket.ts` (`player:wipeout`), `recorder.ts` (`signature`, `PlayRef.wipeout`), `history.ts` (`wipeoutResult`, `unplayedWipeout`), `testing/wipeout-game.ts`;
  - веб: `WipeoutLadder`, `WipeoutDecision`, `HostWipeout`, `StageScreen` (`WipeoutBetween`), `HostScreen` (`DecidingLabel`), `GameHistory` (`wipeoutLines`), `editor/{draft.ts,QuizEditor.tsx,RoundSettings.tsx,draft-storage.ts}`, `help/rounds.ts`;
  - e2e: сценарій `wipeoutGame` у `apps/server/e2e/full-game.e2e.ts`.
- **Блеф (10f):** `seededRng` у `packages/engine/src/bluff.ts`; власна фаза всередині запитання.
- **Запасні запитання (8b, 9d):** `editor/SparesEditor.tsx`, `allSpares`, `spare_type`, `spare_video`.
- **Коригування (9c):** `addAdjustment`, `afterQuestionNow`, `adjustmentTotal` у `packages/engine/src/adjust.ts`; `AdjustmentSource`; рядки коригувань в історії (`GameHistory.tsx`, `apps/server/src/history.ts`).
- **Заставки (8c):** `withSplash`, `splashLead`, `shiftSplash` (`splash.ts`), `SPLASH_PHASE` і `splashView` (`views.ts`), `apps/web/src/live/Splash.tsx`.
- **Голоси без балів (10d):** `submitVote` (`votes.ts`) — як записати відповідь, що нічого не рахує.
- **Помічники тестів:** `testing/fixtures.ts` (`classicRound`, `wipeoutRound`, `makeRoundsQuiz`, `single`, `bool`, `numeric`, `text`, `slider`); `testing/helpers.ts` (`lobbyWith` дає `p1`, `p2`, …; `must`, `startRound`, `lobbyWithSplash`); `restore.test.ts` (`STATE_SHAPE`, `KEYS`, `representative`).
- **Тести наборів вікторин:** `apps/server/scripts/compass-quiz.test.ts`, `horizon-quiz.test.ts` (`LATER_ROUND_TYPES`).

**Рішення плану там, де специфікація мовчить (і рішення координатора):**

*Дані*
- Схема раунду:
  ```ts
  {
    id, type: 'survival', title, description?, speedBonus: boolean, shuffleOptions: boolean, rules: RoundRules,
    questions: Question[];        // 3…30, лише SURVIVAL_TYPES
    trials: Question[];           // 0…10 питань на виживання, лише SURVIVAL_TYPES, без відео, аудіо й проявлення
    trial: 'question' | 'luck';   // вид випробування
    survivors: number;            // N: 1…10, раунд закінчується, щойно живих ≤ N
    bonus: number;                // 0…LIMITS.maxPoints, кожному живому наприкінці
  }
  ```
  - `SURVIVAL_TYPES = ['single', 'boolean', 'numeric', 'text', 'slider']`. *Рішення:* той самий набір, що й у «Ва-банк»: «на межі» має бути однозначним, а «кілька варіантів» дає часткові відповіді.
  - Коди вікторини: `survival_type` (тип поза `SURVIVAL_TYPES` у `questions` чи `trials`); `survival_trials` (`trial === 'question'` без жодного питання на виживання); `survival_trial_media` (питання на виживання з відео, аудіо чи проявленням).
  - Питання на виживання входять у `too_many_questions` (разом із `questionsOf`) і в `duplicate_question_ids`. `roundQuestions` і `questionsOf` — **лише основні запитання** (лічильники, поріг дуелей, історія).
  - Ціна (`points`) питання на виживання не важить: балів воно не дає. Таймер — його `timeLimit`.
  - Картинка, що проявляється, в основних запитаннях заборонена наявним `reveal_place`. Відео й аудіо в основних дозволені, як у класиці.

*Хто живий*
- На вході в раунд живі всі гравці. Приєднатися посеред гри не можна (`addPlayer` лише в лобі).
- Живі й привиди **виводяться з журналу**: вибулі — об'єднання `Play.survival.trial.out` закритих випробувань цього раунду. Окремого списку в стані немає.
- **Відключений живий гравець** без відповіді стає «на межі», як будь-хто без відповіді. Після перезапуску сервера (9b) гра на паузі й чекає, тож перезапуск сам нікого не вибиває.

*Основне запитання*
- Живий відповідає звичайним класичним шляхом `submitAnswer`. Бали — `answerPoints` з правилами раунду. Бонус за швидкість — `speedOn(round)`: `(classic || survival) && round.speedBonus`. Бафів немає (`off_survival`), тож гілки бафів не спрацьовують.
- **Привид** відповідає тим самим `player:answer`. Відповідь іде в `Play.survival.ghosts[playerId] = { answer, correct, timeMs }`, **не** в `play.answers`. `correct = verdictOf(question, answer, timeMs).grade === 'correct'`.
  - *Рішення про зберігання:* поза `answers`, бо `answers` — джерело рахунку, серій, точності, рядків історії й досягнень. Відповідь привида не торкається жодного з них без окремих гілок. Історія бачить лише лічильник «відповіли / відгадали».
  - Помилки привида: `already_answered`, `time_over`, `type_mismatch` — як у живого.
- `autoLock` у «Вибуванні» чекає лише **присутніх живих**. Привиди запитання не тримають. Якщо присутніх живих немає, автозакриття немає: запитання закриє таймер чи ведучий.
- «Правильно» = `grade === 'correct'` (14a: повзунок — щонайменше половина ціни; число з частковими — `partial`, тобто помилка). Отже **«на межі»** = живий без запису або із записом `grade !== 'correct'`.
- Оцінка ведучого — як у класиці, на `reveal` (зокрема `partial`, якщо правила раунду дозволяють). Вердикт ведучого змінює, хто «на межі»: перелік фіксується лише на «Далі».
- Сумарний час (`totalTimeMs`) рахують лише класичні раунди. «Вибування» туди не входить, як «Ва-банк». *Рішення:* не міняємо спільну формулу.

*Після розкриття: етап `leaderboard` завжди*
- `next` з `reveal` у «Вибуванні» (до перевірки «запитань більше немає»): `openTrialOrBoard(state, now, rng)`:
  - фіксує `Play.survival.edge` = «на межі» зараз;
  - `edge` порожній → **вердикт `all_right`**: етап `leaderboard` без таймера, сцена — «Усі вціліли»;
  - `edge` = усі живі → **вердикт `all_wrong`**: етап `leaderboard` без таймера, сцена — «Помилилися всі — ніхто не вибуває»;
  - інакше → **випробування** (див. нижче): етап `leaderboard`, заставка `trial`, таймер.
- Налаштування `leaderboard: 'each' | 'end'` тут не важить: сторінка «живі / привиди» — серце раунду. *Рішення:* як драбина «Ва-банк».
- Випробування буває й після **останнього** запитання: бонус отримують лише ті, хто його пройшов.
- `next` з `leaderboard`:
  - випробування відкрите → **закрити його зараз** (ведучий «Закрити випробування», як «Закрити» запитання в класиці);
  - інакше → `advance`: `nextQuestion` повертає `undefined`, якщо `survivalOver(state)` або запитань не лишилося → `finishRound` (бонус).

*Випробування*
- **Вид:** `round.trial`. Якщо `'question'`, але невикористаних питань на виживання не лишилося → `'luck'` з `fellBack: true`. Використане питання — те, чий `questionId` уже стоїть у випробуванні цього раунду. Питання беруться за порядком `round.trials`, **одне на випробування** для всіх «на межі».
- **Таймер:** заставка `trial` (`SPLASH_MS.trial`), далі `startedAt = splash.until` (або `now` без переходів), `endsAt = startedAt + limitMs`:
  - питання — `trialQuestion.timeLimit × 1000`;
  - удача — `LIMITS.survivalLuckSeconds × 1000`.
- **Питання на виживання:** порядок варіантів `presented` — перемішаний `rng`, лише якщо `round.shuffleOptions` і тип `single`; інакше як у питанні. Відповідає лише «на межі» (`player:trial`). Помилки за порядком:
  - `wrong_phase` — випробування не відкрите чи вже закрите;
  - `paused`; `not_started` — заставка ще грає;
  - `not_found`; `not_allowed` — гравець не «на межі»;
  - `already_answered`; `time_over` (`now ≥ endsAt`: з цієї миті tick закриває випробування, як `decideWipeout`); `type_mismatch`.
  - `correct = verdictOf(...).grade === 'correct'`. **Відповідь одна й остаточна.**
- **Удача:** на відкритті для кожного «на межі» в порядку гравців тягнуться два числа `rng`: пастка `traps[id] = min(2, ⌊rng() × 3⌋)` і запасні двері `fallback[id]` так само. *Рішення:* пастка своя в кожного, бо кожен вибирає окремо; запасні двері вирішують за того, хто не вибрав. Числа лежать у стані, тож перезапуск сервера нічого не міняє. Вибір — `player:door { door: 0 | 1 | 2 }`, помилки ті самі, що в питання, крім `type_mismatch`. Вибір один і остаточний.
- **Хто не встиг:** у питанні — вибуває (мовчання = помилка, як у специфікації). В удачі — **двері вибираються самі** (`fallback`). *Рішення:* так удача лишається удачею навіть для того, хто випав зі зв'язку. Телефон і довідка кажуть прямо: «Не вибереш за 10 с — двері виберуться самі».
- **Закриття** (`closeTrial`: `stage 'closed'`, `out` заповнено, `startedAt/endsAt/remainingMs = null`):
  - коли відповіли / вибрали всі присутні «на межі» (`settleTrial`, як `autoLock`; не на паузі; без присутніх «на межі» — чекає таймера);
  - коли сплив час (`tick`, з `endsAt` включно, як `closeDecision` у 10g: `now < endsAt` → ще ні);
  - ведучий «Закрити випробування» (`next`);
  - ведучий завершує раунд чи гру — **як кінець часу**: випробування закривається, потім кінець.
  - `out`: питання — «на межі» без правильної відповіді; удача — «на межі», чиї двері (`doors[id] ?? fallback[id]`) = `traps[id]`.
  - Захист «ніхто з живих не лишився» не потрібен: хоча б один живий відповів правильно, інакше випробування не було б.
- **Оцінка ведучого в питанні на виживання** — після закриття, на тому ж етапі (`host:override` на `leaderboard` із закритим випробуванням): `correct` / `wrong`; `partial` → `partial_disabled`; без відповіді → `not_found`; удача → `wrong_phase`. Оцінка перераховує `out`. Після «Далі» — ні. *Рішення:* текстове питання з одруківкою не має вибивати гравця без шансу на ручне зарахування.
- **Пауза** зупиняє заставку й таймер випробування: як вікно 10g, плюс `splashLead` рахує заставку `trial`. `suspend` (9b) працює через `tick` + `pause`.
- Дебафи на випробуванні не спрацьовують і нічого не змінюють. *Рішення:* випробування — не запитання раунду.
- Дуелей у раунді немає, тож випробування вони не перебивають.

*Кінець і бонус*
- `survivalOver(state)`: живих ≤ `round.survivors` **і** у цьому раунді хтось уже вибув. *Рішення:* без «хтось вибув» гра на двох при N = 1… N = 2 закінчувалася б до першого запитання. Тож якщо гравців від початку ≤ N, раунд іде до кінця запитань.
- `awardSurvivalBonus(state, now)` у `finishRound` і `end`:
  - ставить `end: true` на останньому зіграному запитанні раунду (як `markWipeoutEnd`);
  - кожному живому — коригування `{ source: 'survival', points: bonus }` через `addAdjustment` (`roundIndex` поточний);
  - **ідемпотентно:** якщо коригування `source 'survival'` цього раунду вже є, нічого не додає;
  - бонус 0 або жодного закритого запитання раунду → коригувань немає, але `end` ставиться, якщо запис є.
  - *Рішення:* коригування, а не бали в записах. Живий міг не відповісти на останнє запитання (тоді запису немає), а рядок коригування вже йде в історію й таблицю рахунку без нових колонок. «Рахунок = сума записів + коригування» тримається.
- «Завершити раунд» посеред запитання — як у класиці: `lockNow`, випробування немає, живі отримують бонус. Посеред випробування — `closeTrial`, потім кінець.

*Привиди*
- Бачать запитання й відповідають «для себе». Телефон показує «Ти привид: відповідай для себе — балів не буде», а на розкритті — «Відгадав(-ла)» чи «Не відгадав(-ла)».
- Сцена на розкритті: «Привиди: K з M відгадали» (M — скільки привидів відповіли).
- Ведучий оцінити відповідь привида не може: `override` → `not_found` (запису немає).
- **Дебафи:** ціль-привид у раунді «Вибування» (етапи `intro`…`leaderboard`, не `round_end`):
  - `setDebuff` → `not_allowed`; `buyDebuff` → `not_allowed`;
  - `fireDebuffs` на запитанні «Вибування» запускає дебафи лише живим. Дебаф, що чекає на привида, чекає наступного раунду.
  - Привид **може купувати** дебафи за свої бали й насилати на живих (крамниця діє за 14a).
  - Пульт ховає меню дебафів біля привида; крамниця телефона не пропонує привидів цілями.
  - *Рішення:* дебаф на привида нічого не дає, бо балів у нього немає.

*Ізоляція (14a)*
- **Бафи:** `placeBlock` → `off_survival` («У «Вибуванні» бафів немає.»).
- **Дебафи** від ведучого й з крамниці діють (з обмеженням щодо привидів вище). `debuffsOff` — без змін.
- **Дуелі:** `duelsOff` → `true` у раунді «Вибування», крім `round_end`. Оголошена раніше дуель стартує на `round_end`. Запитання «Вибування» входять у поріг дуелей, як і раніше.
- **Правила раунду** діють: множник, штраф (лише за відповідь із 0 балів, лише в живого, що відповів), часткові, серії, бонус за швидкість.
- **Таблиця:** на `leaderboard` у «Вибуванні» `standings` сцени й телефона — `null` (сторінка «живі / привиди»). `table` телефона (кнопка «Таблиця») — як у «Ва-банк»: повна з `leaderboard 'each'`, інакше лише свій рядок. На `round_end` — звичайна таблиця.
- **Коригування ведучим** (`host:adjust`) діє і тут, зокрема привидам.

*Що видно (анти-ціль «нічого раніше розкриття»)*
- `SurvivalInfo` (задача 5) — від `intro` до `round_end` раунду «Вибування» (і `finished`, якщо він останній).
- На `question` і `locked`: статусу `edge` немає ні в кого; `ghosts.right` — `null`; `verdict` — `null`; правильність відповіді привида — `null`, навіть для нього самого.
- На `reveal`: `edge` — наживо з записів (оцінка ведучого змінює); `ghosts.right`; `verdict`.
- Випробування відкрите:
  - питання — `PublicQuestion` без правильної відповіді; `reveal` — `null`;
  - пастки — `null` **усім, зокрема пульту**; вибрані двері: сцена й телефони — лише `done`; пульт бачить номер дверей наживо;
  - правильність відповідей на питання — ні в кого до закриття.
- Після закриття: правильна відповідь, двері (`auto` — вибрано самі), пастки, `safe` / `out`.

*Формат стану й деплой*
- **`GAME_STATE_VERSION` 7 → 8.** Новий необов'язковий ключ `Play.survival?: SurvivalPlay` (задача 2). На етапі `leaderboard` у «Вибуванні» бувають `startedAt` / `endsAt` / `remainingMs` і заставка `trial`. Нові значення (не ключі): `SplashKind 'trial'`, `AdjustmentSource 'survival'`. Ключі `GameState` ті самі.
- **`READABLE_STATE_VERSIONS = [2, 3, 4, 5, 6, 7, 8]`.** Зміна лише адитивна, а стан версій 2–7 не може містити раунду «Вибування». Кімнати, збережені до розгортання, відновлюються: **пуш не обриває живих ігор**. Перевірку `live_room` за 14a можна не робити. Звіт власникові має назвати це явно.
- **Міграцій немає:**
  - раунд — у jsonb `quiz.rounds`;
  - відповіді живих — у наявних колонках `answer`; відповіді привидів у базу не йдуть (лише лічильники в `PlayRef.survival`);
  - `PlayRef.survival` — у jsonb `game.plays`;
  - бонус — рядки коригувань; колонка `source` — `text` з `$type<AdjustmentSource>()`, без enum у базі.

*Чого не робимо*
- «Вибування» в командах (10j);
- нового досягнення;
- випробування без таймера;
- окремої оцінки ведучим відповідей привидів;
- зміни вибору дверей чи відповіді на випробуванні після надсилання.

## Глобальні обмеження

- Рушій чистий: жодного годинника й `Math.random`; усе від `now` і `rng`.
- **Ніщо не видає вердикт раніше розкриття.** На `question` і `locked` зрізи сцени й телефонів не показують «на межі», правильності привидів і балів поточного запитання. Під час відкритого випробування ніхто (і пульт) не бачить пасток, правильної відповіді питання на виживання й чужої правильності. Тести задачі 5 — через `JSON.stringify(view)`, e2e — через кадри сокета (`socketFrames`, `framesBeforeReveal`).
- **Старі вікторини й бали не змінюються.** Наявні тести класики, бліцу, поля, фіналу, «Ва-банк», бафів, дебафів, дуелей, серій, сумарного часу й відновлення лишаються зеленими без змін (крім навмисних, див. «Порядок збирання»).
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`, тексти довідки — лише в `apps/web/src/help/*.ts`.
- Телефон 375 px — без горизонтальної прокрутки, кнопки ≥ 44 px; троє дверей в один ряд, кожні ≥ 96 px заввишки, одним пальцем. Сцена 1280 × 720 — до 12 гравців у «живі / привиди» без прокрутки; більше — менший шрифт, перенос.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом — зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2`. Якщо PGlite падає з браком пам'яті, запускати окремо:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=1 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- Наскрізні тести: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts`. **Повний прогін триває близько 11 хвилин:** запускати у фоні й чекати завершення. Кадри — в `apps/server/e2e/artifacts/shots`, префікс 10h — `p10h-`.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать. Живі ігри пуш не обриває: `READABLE_STATE_VERSIONS` містить 7.

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/{quiz.ts,survival.ts(новий),round-brief.ts,game.ts,index.ts}`, `quiz.test.ts`, новий `survival.test.ts` | схема раунду, ліміти, коди, `off_survival`, `trial`, `survival` | 1 |
| `apps/web/src/{guide-text.ts,round-summary.ts,format.ts,i18n.ts}`, `help/rounds.ts`, `editor/{draft.ts,draft-storage.ts,QuizEditor.tsx,RoundSettings.tsx}`, `apps/server/scripts/{compass,horizon}-quiz.test.ts` + `round-summary.test.ts`, `draft.test.ts` | прохід typecheck | 1 |
| `packages/engine/src/{survival.ts(новий),game.ts,splash.ts,restore.ts,index.ts}`, `testing/fixtures.ts`, новий `game.survival.test.ts`, `restore.test.ts` | живі, привиди, «на межі», вердикт, кінець, бонус, версія 8 | 2 |
| `packages/engine/src/{survival.ts,game.ts,splash.ts}`, новий `game.survival-trial.test.ts` | випробування: питання, удача, закриття, пауза, оцінка | 3 |
| `packages/engine/src/{buffs.ts,debuffs.ts,duel.ts}`, новий `game.survival-isolation.test.ts` | бафи, дебафи на привидів, дуелі, правила | 4 |
| `packages/shared/src/views.ts`, `packages/engine/src/views.ts`, новий `views.survival.test.ts`, фабрики зрізів у тестах вебу | `SurvivalInfo`, `me.survival`, приховування | 5 |
| `packages/shared/src/{events.ts,history.ts}`, `apps/server/src/{rooms/manager.ts,socket.ts,recorder.ts,history.ts,db/schema.ts,testing/survival-game.ts(новий)}`, `apps/server/scripts/{demo-quiz.ts,demo-quiz.test.ts}` + тести | події, історія, профіль, демо | 6 |
| `apps/web/src/screens/{SurvivalBoard,SurvivalTrial,SurvivalDoors}.tsx` (нові), `PlayerScreen.tsx`, `DebuffShop.tsx`, `i18n.ts`, `styles.css` + тести | телефон і спільна сторінка | 7 |
| `apps/web/src/screens/{StageScreen,HostScreen,HostSurvival(новий),HostPlayerTools}.tsx`, `live/Splash.tsx`, `pages/GameHistory.tsx`, `i18n.ts`, `styles.css` + тести | сцена, пульт, заставка, історія | 8 |
| `apps/web/src/editor/{QuizEditor,RoundSettings,SparesEditor}.tsx`, `draft.ts`, `i18n.ts` + тести | редактор | 9 |
| `apps/web/src/help/{rounds,powers,settings}.ts`, `i18n.ts`, `host-help.test.ts`, `HostSurvival.tsx` | довідка й «ⓘ» | 10 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 10h з кадрами `p10h-` | 11 |

## Порядок збирання

- 1 → 2 → 3 → 4 → 5 → 6.
- 7 — після 5 і 6. 8 — після 7 (`SurvivalBoard`). 9 — після 1 (від рушія й зрізів не залежить), можна паралельно з 7–8.
- 10 — після 8 і 9. 11 — остання.
- **Навмисні зміни наявних очікувань** (лише такі):
  - `restore.test.ts`: `GAME_STATE_VERSION` 8, новий `KEYS[8]`, `STATE_SHAPE.SurvivalPlay` / `SurvivalTrial` / `GhostAnswer` / `TrialAnswer`, `STATE_SHAPE.Play` + `'survival'`; `READABLE_STATE_VERSIONS` `[2, 3, 4, 5, 6, 7, 8]`; `KEYS[1..7]` без змін;
  - фабрики `BaseView` / `StageView` / `HostView` / `PlayerView['me']` у тестах вебу отримують `survival: null` (і `me.survival: null`); фабрики `RoundBrief` — `survival: null`;
  - тест у `quiz.test.ts`, що звіряє `ROUND_TYPES` буквально, отримує `'survival'`;
  - `LATER_ROUND_TYPES` у `compass-quiz.test.ts` і `horizon-quiz.test.ts` — `['wipeout', 'survival']`;
  - тест `SPLASH_MS` (якщо звіряє буквально) — з `trial`;
  - тексти «де бафи не діють» (`EXCL` у `help/powers.ts`, `buffHelpNone` в `i18n.ts`) і тест у `host-help.test.ts`, що звіряє їх буквально, — з «Вибуванням»;
  - тест `searchHelp` у `host-help.test.ts`, якщо новий запис змінює буквальний результат пошуку.
  - Якщо падає інше, рецензент розбирає причину, а не правку очікування.

## На що дивитися рецензентові

1. **«На межі» й вердикт.** Помилка, часткова чи мовчання живого → «на межі»; усі живі помилилися → ніхто не вибуває; оцінка ведучого на `reveal` змінює перелік; перелік фіксується на «Далі». Тести: задачі 2, 5.
2. **Випробування.** Одне питання на всіх «на межі», по порядку `trials`; коли скінчилися — удача з `fellBack`; пастка й запасні двері з `rng` у стані; мовчання в питанні вибиває, в удачі — двері самі; закриття за всіма присутніми, за часом (з `endsAt`), ведучим, із кінцем раунду; пауза й заставка; ручна оцінка після закриття. Тести: задача 3.
3. **Привиди.** Відповідь у `Play.survival.ghosts`, не в `answers`: ні балів, ні серій, ні рядків історії; `autoLock` не чекає привидів; лічильник «відгадали» з розкриття. Тести: задачі 2, 5, 6.
4. **Кінець і бонус.** Живих ≤ N після вибування чи кінець запитань → бонус кожному живому одним коригуванням `survival`, рівно раз (і з `end`); випробування після останнього запитання. Тести: задачі 2, 6.
5. **Ізоляція.** Бафи (`off_survival`), дуелі (оголошення й старт) — не діють у раунді, на `round_end` знову діють; дебафи діють, але не на привидів; правила раунду діють. Тести: задача 4.
6. **Нічого не витікає.** Статуси «на межі» й правильність привидів — лише з розкриття; пастки й правильна відповідь випробування — лише після закриття, і пульту теж. Тести: задача 5, задача 11 (кадри).
7. **Формат стану.** `GAME_STATE_VERSION` = 8, `KEYS[8]`, представник із відкритим випробуванням проходить JSON і `suspend`; `READABLE_STATE_VERSIONS` `[2, 3, 4, 5, 6, 7, 8]`.
8. **Старе не змінилося.** Тести класики, бліцу, поля, фіналу, «Ва-банк», серій, бафів, дебафів, дуелей, сумарного часу — без змін.
9. **Довідка.** Запис `round.survival` правдивий щодо рушія й чисел з `LIMITS`. Записи бафів, дебафів, дуелей і налаштувань згадують «Вибування». Тести: задача 10.

---

### Задача 1. Shared: раунд `survival`, типи, ліміти, коди, причина бафу, заставка й джерело коригування; прохід typecheck

**Files:**
- Modify: `packages/shared/src/quiz.ts`, `packages/shared/src/round-brief.ts`, `packages/shared/src/game.ts`, `packages/shared/src/index.ts`
- Create: `packages/shared/src/survival.ts`
- Test: `packages/shared/src/quiz.test.ts`, новий `packages/shared/src/survival.test.ts`
- Modify (прохід typecheck): `apps/web/src/guide-text.ts`, `apps/web/src/round-summary.ts`, `apps/web/src/format.ts`, `apps/web/src/i18n.ts`, `apps/web/src/help/rounds.ts`, `apps/web/src/editor/draft.ts`, `apps/web/src/editor/draft-storage.ts`, `apps/web/src/editor/QuizEditor.tsx`, `apps/web/src/editor/RoundSettings.tsx`; `apps/server/scripts/compass-quiz.test.ts`, `apps/server/scripts/horizon-quiz.test.ts`
- Test: `apps/web/src/round-summary.test.ts`, `apps/web/src/editor/draft.test.ts`

**Interfaces:**
- Produces (`quiz.ts`):
  ```ts
  // У LIMITS:
  /** «Вибування»: запитань і питань на виживання в раунді, скільки може лишитися, секунд на двері удачі. */
  minSurvivalQuestions: 3,
  maxSurvivalQuestions: 30,
  maxSurvivalTrials: 10,
  maxSurvivors: 10,
  survivalLuckSeconds: 10,

  /** Типи запитань раунду «Вибування» (основних і питань на виживання): відповідь однозначно правильна чи ні. */
  export const SURVIVAL_TYPES = ['single', 'boolean', 'numeric', 'text', 'slider'] as const satisfies readonly QuestionType[];

  /** Вид випробування «на межі»: окреме питання або троє дверей. */
  export const TRIAL_KINDS = ['question', 'luck'] as const;

  /** «Вибування»: хто помилився, проходить випробування; хто його не пройде, стає привидом. Правила балів — як у класиці. */
  export const survivalRoundSchema = z.object({
    id: z.string().min(1).refine(isStorable, UNSTORABLE),
    type: z.literal('survival'),
    title: z.string().trim().max(LIMITS.roundTitle).refine(isStorable, UNSTORABLE),
    /** Опис раунду від автора для заставки. */
    description: z.string().trim().max(LIMITS.roundDescription).refine(isStorable, UNSTORABLE).optional(),
    speedBonus: z.boolean(),
    shuffleOptions: z.boolean(),
    rules: roundRulesSchema,
    questions: z.array(questionSchema).min(LIMITS.minSurvivalQuestions).max(LIMITS.maxSurvivalQuestions),
    /** Питання на виживання — по одному на випробування, за порядком; ціна не важить, таймер — його timeLimit. */
    trials: z.array(questionSchema).max(LIMITS.maxSurvivalTrials),
    trial: z.enum(TRIAL_KINDS),
    /** Раунд закінчується, щойно після вибування живих ≤ survivors. */
    survivors: z.number().int().min(1).max(LIMITS.maxSurvivors),
    /** Бали кожному, хто дожив до кінця раунду. */
    bonus: z.number().int().min(0).max(LIMITS.maxPoints),
  });
  export type SurvivalRound = z.infer<typeof survivalRoundSchema>;
  export type TrialKind = (typeof TRIAL_KINDS)[number];

  export const ROUND_TYPES = ['classic', 'blitz', 'board', 'final', 'wipeout', 'survival'] as const;
  // roundSchema: + survivalRoundSchema.

  /** Питання на виживання раунду; поза «Вибуванням» — []. */
  export function roundTrials(round: Round): Question[];
  ```
  - `rulesOf` — без змін за змістом (у `survival` є `rules`); оновити коментар.
  - `quizSchema.superRefine`:
    - `too_many_questions` — `questions.length + quiz.rounds.flatMap(roundTrials).length > LIMITS.maxQuizQuestions`;
    - `duplicate_question_ids` — з урахуванням `roundTrials` (і в перевірці `duplicate_spare_ids` теж);
    - поруч із `wipeout_type`: у раунді `survival` — `survival_type` (тип поза `SURVIVAL_TYPES` у `questions` чи `trials`), `survival_trials` (`trial === 'question' && trials.length === 0`), `survival_trial_media` (питання на виживання з `video !== null`, `audio` чи `reveal`).
  - `duelThreshold` / `scoredCount` — без змін (основні запитання «Вибування» рахуються).
- Produces (новий `survival.ts`, реекспорт з `index.ts`):
  ```ts
  /** Стан гравця в «Вибуванні»: alive — живий; edge — на межі (з розкриття до кінця випробування); ghost — привид. */
  export type SurvivalStatus = 'alive' | 'edge' | 'ghost';

  /** Скільки дверей в удачі. */
  export const DOOR_COUNT = 3;

  /** Живі після кроків: усі playerIds без тих, хто є в будь-якому з outs (вибулі кожного випробування), у порядку playerIds. */
  export function survivorsAfter(playerIds: readonly string[], outs: readonly (readonly string[])[]): string[];
  ```
- Produces (`round-brief.ts`):
  ```ts
  // RoundBrief:
  /** «Вибування»: вид випробування, скільки має лишитися, бонус; null поза ним. */
  survival: { trial: TrialKind; survivors: number; bonus: number } | null;
  ```
  - `emptyBrief` → `survival: null`; `roundBrief` для `survival` → правила й `speedBonus`, як у класики, плюс `survival`.
- Produces (`game.ts`):
  - `BuffBlock` + `'off_survival'` («“Вибування”: бафів немає (10h).»);
  - `SplashKind` + `'trial'`; `SPLASH_MS.trial = 2200` (коментар: «драматична заставка випробування “Вибування” (10h)»);
  - `AdjustmentSource` + `'survival'` (коментар: «бонус виживання (10h)»).
  - Нового `ErrorCode` немає: вистачає наявних.
- Веб (прохід typecheck):
  - `i18n.ts`:
    - `roundTypeSurvival: 'Вибування'`, `survivalLabel: 'Вибування'`;
    - `roundHow_survival: 'Хто помилився чи змовчав, стає «на межі» й проходить випробування. Хто його не пройде, стає привидом і грає лише для себе.'`;
    - `summarySurvival: 'Бали — як у класиці. Помилка чи мовчання — ти «на межі» й проходиш випробування; не пройдеш — станеш привидом без балів.'`;
    - `summarySurvivalTrial_question: 'Випробування — окреме питання на виживання.'`, `summarySurvivalTrial_luck: 'Випробування — удача: одні з трьох дверей ховають пастку.'`;
    - `summarySurvivalBonus: 'Хто доживе до кінця, отримає +{bonus}.'`;
    - `buffWhy_off_survival: 'У «Вибуванні» бафів немає.'`;
    - `adjustSource_survival: 'Бонус виживання'` (якщо історія має мапу підписів джерел; інакше — у задачі 8);
  - `guide-text.ts`: `ROUND_ICONS.survival = '🪦'` (або інший однозначний значок без бренду), `ROUND_NAMES.survival = 'roundTypeSurvival'`, `roundHow`: `case 'survival': return [t('roundHow_survival')]`;
  - `round-summary.ts`: гілка `survival` **до** гілки поля → `[t('summarySurvival'), t(\`summarySurvivalTrial_${brief.survival.trial}\`), …(bonus > 0 ? [t('summarySurvivalBonus', …)] : []), modifiers(brief, brief.speedBonus ? [t('summarySpeed')] : [])]` — рівно як класика, лише перший рядок інший;
  - `format.ts`: `roundLabel` для порожньої назви `survival` → `t('survivalLabel')`;
  - `help/rounds.ts`: повний запис `survival` (тексти — задача 10; тут вписати повністю, задача 10 звіряє й оновлює пов'язані записи);
  - `editor/draft.ts`:
    - `questionTypesFor('survival')` → `SURVIVAL_TYPES`; оновити коментар;
    - `newSurvivalRound()`:
      ```ts
      /** Нове «Вибування»: три порожні запитання «один варіант» по 100, два питання на виживання, випробування — питання, лишається 1, бонус 500. */
      export function newSurvivalRound(): SurvivalRound {
        return {
          id: newId(), type: 'survival', title: '', speedBonus: false, shuffleOptions: false, rules: DEFAULT_RULES,
          questions: Array.from({ length: LIMITS.minSurvivalQuestions }, () => ({ ...newQuestion('single'), points: 100 })),
          trials: [newQuestion('single'), newQuestion('single')],
          trial: 'question', survivors: 1, bonus: 500,
        };
      }
      ```
    - `cleaned` — пройтися й по `trials` (так само, як по `questions`);
  - `draft-storage.ts`: `looksLikeQuiz` — `survival` має `rules`, тож проходить; `loadDraft` — `survival` повертається з `questions.map(revive)` і `trials.map(revive)`;
  - `QuizEditor.tsx`: `addRound('survival')` → `newSurvivalRound()` (повний вигляд — задача 9);
  - `RoundSettings.tsx`: правила й бонус за швидкість для `survival` — як для класики (переконатися, що `setRules` типізується). Решта вигляду — задача 9.
  - `compass-quiz.test.ts`, `horizon-quiz.test.ts`: `LATER_ROUND_TYPES = new Set<string>(['wipeout', 'survival'])`.

- [ ] **Step 1: Write the failing tests**
  - `packages/shared/src/quiz.test.ts`:
    ```ts
    describe('survival round (10h)', () => {
      const qs = [1, 2, 3].map((i) => ({ ...singleQ, id: `s${i}`, points: 100 }));
      const trials = [{ ...boolQ, id: 't1' }];
      const survival = { id: 'rs', type: 'survival', title: '', speedBonus: false, shuffleOptions: false, rules: DEFAULT_RULES,
        questions: qs, trials, trial: 'question', survivors: 1, bonus: 500 } as const;
      it('a survival round has 3–30 simple questions, trials, an end condition and a bonus', () => {
        expect(ROUND_TYPES).toContain('survival');
        expect(valid(roundSchema, survival)).toBe(true);
        expect(valid(roundSchema, { ...survival, questions: qs.slice(0, 2) })).toBe(false);
        expect(valid(roundSchema, { ...survival, survivors: 0 })).toBe(false);
        expect(valid(roundSchema, { ...survival, survivors: 11 })).toBe(false);
        expect(valid(roundSchema, { ...survival, bonus: 2001 })).toBe(false);
        expect(valid(roundSchema, { ...survival, trial: 'luck', trials: [] })).toBe(true);
        expect(SURVIVAL_TYPES).toEqual(['single', 'boolean', 'numeric', 'text', 'slider']);
        expect(rulesOf(roundSchema.parse(survival))).toEqual(DEFAULT_RULES);
      });
      it('refuses other types, a question trial without trials and trials with media', () => {
        // multi у questions → 'survival_type'; order у trials → 'survival_type';
        // trial 'question' + trials [] → 'survival_trials'; trial 'luck' + trials [] → без помилки;
        // питання на виживання з video / audio → 'survival_trial_media'.
      });
      it('trials count toward the quiz limit and must not reuse question ids', () => {
        // trials з id 's1' → 'duplicate_question_ids'.
      });
    });
    ```
    `singleQ`, `boolQ`, `valid`, `quizIssues` — наявні помічники файлу (або найближчі аналоги з тестів `wipeout_type`).
  - Новий `packages/shared/src/survival.test.ts`: `survivorsAfter(['p1','p2','p3'], [])` → усі; `[['p2'], ['p3']]` → `['p1']`; порядок — за `playerIds`; повтори в `outs` не ламають.
  - `round-brief` (наявний тест у `packages/engine/src/round-brief.test.ts` чи shared): `roundBrief(survival)` → `speedBonus`, `penalty`, `streak`, `multiplier` з правил і `survival: { trial: 'question', survivors: 1, bonus: 500 }`; `emptyBrief('classic').survival === null`.
  - `apps/web/src/round-summary.test.ts`: `roundSummary` для брифу `survival` з `trial 'luck'`, бонусом 500 і штрафом → перший рядок `summarySurvival`, далі `summarySurvivalTrial_luck`, `summarySurvivalBonus` з 500, рядок модифікаторів зі штрафом; з бонусом 0 рядка бонусу немає.
  - `apps/web/src/editor/draft.test.ts`:
    - `newSurvivalRound()`: 3 запитання по 100, 2 питання на виживання, `trial 'question'`, `survivors 1`, `bonus 500`; після заповнення текстів і варіантів проходить `roundSchema`;
    - `questionTypesFor('survival')` → `SURVIVAL_TYPES`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared` → FAIL.
- [ ] **Step 3: Implement** схему, ліміти, коди, `survival.ts`, `roundTrials`, `roundBrief`, `BuffBlock`, `SplashKind`/`SPLASH_MS`, `AdjustmentSource` за інтерфейсом.
- [ ] **Step 4: Прохід typecheck.** Виконати `pnpm typecheck` і закрити кожну помилку змінами з інтерфейсу. Рушій теж може не скомпілюватися на `Record<RoundType, …>`, `Record<SplashKind, …>` (`SPLASH_PHASE` у `views.ts` → `trial: 'leaderboard'`) чи `switch` без гілки. Там — мінімальна гілка без поведінки з коментарем `// задача 2`. Веб: `Record<SplashKind, …>` у `Splash.tsx` чи стилях — порожня гілка `// задача 8`. Поведінки раунду в цій задачі немає.
- [ ] **Step 5: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 6: Commit**
  ```bash
  git add packages/shared packages/engine apps/web/src apps/server/scripts
  git commit -m "feat(shared): survival round — 3–30 simple questions with classic rules, trial questions, question or luck trials, survivors to stop at and a survival bonus; buff block off_survival, trial splash, adjustment source survival"
  ```

### Задача 2. Рушій: живі й привиди, відповіді привидів поза балами, «на межі», вердикт, кінець і бонус; `GAME_STATE_VERSION` 8

**Files:**
- Create: `packages/engine/src/survival.ts`
- Modify: `packages/engine/src/game.ts`, `packages/engine/src/splash.ts`, `packages/engine/src/restore.ts`, `packages/engine/src/index.ts`, `packages/engine/src/testing/fixtures.ts`
- Test: новий `packages/engine/src/game.survival.test.ts`; `packages/engine/src/restore.test.ts`

**Interfaces:**
- Changes (`game.ts`):
  ```ts
  // Play:
  /** «Вибування»: відповіді привидів, хто «на межі», випробування й позначка кінця раунду (10h). */
  survival?: SurvivalPlay;

  /** «Вибування» в журналі. */
  export interface SurvivalPlay {
    /** Відповіді привидів «для себе» за id: поза answers, тож ні балів, ні серій, ні точності. */
    ghosts: Record<string, GhostAnswer>;
    /** Хто був «на межі» — фіксується на «Далі» після розкриття; null — ще не вирішено. */
    edge: string[] | null;
    /** Випробування після цього запитання; null — його не було (усі вціліли, помилилися всі або ще не вирішено). */
    trial: SurvivalTrial | null;
    /** Раунд закінчився на цьому запитанні: бонус нараховано. */
    end: boolean;
  }

  export interface GhostAnswer {
    answer: Answer;
    /** grade 'correct' за verdictOf. */
    correct: boolean;
    timeMs: number;
  }

  /** Випробування «на межі». */
  export interface SurvivalTrial {
    kind: TrialKind;
    /** Мало бути питання, але питання на виживання скінчилися. */
    fellBack: boolean;
    stage: 'open' | 'closed';
    /** Питання на виживання: id з round.trials; null — удача. */
    questionId: string | null;
    /** Порядок варіантів питання; [] для удачі й без варіантів. */
    presented: string[];
    /** Відповіді на питання за id. */
    answers: Record<string, TrialAnswer>;
    /** Удача: пастка (0…DOOR_COUNT − 1) кожного «на межі». */
    traps: Record<string, number>;
    /** Удача: двері, які вибрав гравець. */
    doors: Record<string, number>;
    /** Удача: двері, що виберуться самі, якщо гравець не вибрав. */
    fallback: Record<string, number>;
    /** Хто вибув; заповнюється при закритті (і після оцінки ведучого). */
    out: string[];
  }

  export interface TrialAnswer {
    answer: Answer;
    correct: boolean;
    timeMs: number;
    overridden: boolean;
  }
  ```
  - `openQuestion`: у раунді `survival` — `survival: { ghosts: {}, edge: null, trial: null, end: false }`. `rng` для цього не тягнеться.
  - `nextQuestion`: у раунді `survival`, якщо `survivalOver(state)` → `undefined`.
  - `submitAnswer`: після загальних перевірок (фаза, пауза, `notStarted`, гравець) — `if (round.type === 'survival' && isGhost(state, playerId)) return submitGhostAnswer(state, playerId, answer, now);`. Живі йдуть класичним шляхом.
  - Бонус за швидкість: нова функція `speedOn(round)` (`(classic || survival) && speedBonus`) замість `round.type === 'classic' && round.speedBonus` у `submitAnswer` і `override`. Знайти інші місця `=== 'classic'` у рушії (`grep -n "=== 'classic'" packages/engine/src/*.ts`). Для кожного вирішити й записати коментар: сумарний час — лише класика (без змін); бафи — не важить (вимкнено); решта — як класика, якщо стосується балів.
  - `autoLock`: у раунді `survival` «усі відповіли» — серед `presentPlayers`, які `survivalAlive`. Без присутніх живих автозакриття немає.
  - `next`:
    - `case 'reveal'` у «Вибуванні» — **до** перевірки `nextQuestion(state) === undefined`: `return ok(openTrialOrBoard(state, now, rng))`;
    - `case 'leaderboard'` у «Вибуванні»: випробування відкрите → задача 3; інакше `advance`.
  - `finishRound` і `end`: `awardSurvivalBonus(state, now)` перед зміною фази (у `end` — після закриття відкритого запитання, разом з `markWipeoutEnd`).
  - `removePlayer`: з `Play.survival` прибрати гравця (`ghosts`, `edge`, а в `trial` — `answers`, `traps`, `doors`, `fallback`, `out`).
- Changes (`splash.ts`): `questionSplashKind` — `classic`, `final`, `wipeout`, `survival` → `'question'`.
- Produces (`survival.ts`):
  ```ts
  /** Чи поточний раунд — «Вибування». */
  export function inSurvivalRound(state: GameState): boolean;

  /** Поточне запитання «Вибування» з його SurvivalPlay; інакше null. */
  export function survivalPlayOf(state: GameState): (Play & { survival: SurvivalPlay }) | null;

  /** Вибулі раунду roundIndex за першими upTo записами журналу (типово — усі), у порядку вибування: out закритих випробувань. */
  export function survivalOut(state: GameState, roundIndex?: number, upTo?: number): string[];

  /** Живі зараз у поточному раунді «Вибування» (у порядку гравців); поза раундом — []. */
  export function survivalAlive(state: GameState): string[];

  /** Привид: поточний раунд «Вибування», гравець є й не живий. */
  export function isGhost(state: GameState, playerId: string): boolean;

  /**
   * Відповідь привида «для себе»: already_answered (уже є в ghosts), time_over, type_mismatch.
   * Запис у Play.survival.ghosts (correct — verdictOf(...).grade === 'correct'); answers не змінюється; autoLock(now) — привиди його не тримають.
   */
  export function submitGhostAnswer(state: GameState, playerId: string, answer: Answer, now: number): Result;

  /** «На межі» зараз: живі без запису поточного запитання або з grade ≠ 'correct' (наживо — оцінка ведучого змінює). */
  export function edgeNow(state: GameState): string[];

  /**
   * «Далі» після розкриття: фіксує edge; порожній — етап leaderboard без таймера (усі вціліли);
   * усі живі — leaderboard без таймера (ніхто не вибуває); інакше — випробування (openTrial, задача 3; до неї — заглушка, що відкриває
   * leaderboard з trial: null і коментарем `// задача 3`).
   */
  export function openTrialOrBoard(state: GameState, now: number, rng: Rng): GameState;

  /** Вердикт поточного запитання після розкриття: trial / all_wrong / all_right; до розкриття — null. */
  export function survivalVerdict(state: GameState): 'trial' | 'all_wrong' | 'all_right' | null;

  /** Раунд закінчено: живих ≤ round.survivors і в цьому раунді хтось уже вибув. */
  export function survivalOver(state: GameState): boolean;

  /**
   * Кінець раунду «Вибування»: end: true на останньому зіграному запитанні; кожному живому — коригування source 'survival' на bonus
   * (addAdjustment). Ідемпотентно: якщо коригування survival цього раунду вже є — без нових. Поза раундом — стан без змін.
   */
  export function awardSurvivalBonus(state: GameState, now: number): GameState;
  ```
- Changes (`testing/fixtures.ts`):
  ```ts
  /** «Вибування»: типово title '', speedBonus false, shuffleOptions false, DEFAULT_RULES, trial 'question', survivors 1, bonus 500. */
  export function survivalRound(id: string, questions: Question[], trials: Question[], options: Partial<Omit<SurvivalRound, 'id' | 'type' | 'questions' | 'trials'>> = {}): SurvivalRound;
  /** П'ять запитань s1…s5 по 100: single, bool, numeric, text, slider (відповіді — як у wipeoutLadder). */
  export const survivalQuestions: Question[];
  /** Два питання на виживання t1 (boolean, true), t2 (single, правильний 'b'), timeLimit 15. */
  export const survivalTrials: Question[];
  ```
- Changes (`restore.ts`): **`GAME_STATE_VERSION = 8`**, коментар «8 — 10h: Play.survival (привиди, “на межі”, випробування й кінець “Вибування”)», `READABLE_STATE_VERSIONS = [2, 3, 4, 5, 6, 7, GAME_STATE_VERSION]` з поясненням «7 → 8 лише додала необов'язкове Play.survival (і значення SplashKind 'trial', AdjustmentSource 'survival'), а стан версій 2–7 не може містити “Вибування”».

- [ ] **Step 1: Write the failing tests** у новому `game.survival.test.ts`. Вікторина: `makeRoundsQuiz([survivalRound('rs', survivalQuestions, survivalTrials), classicRound('r2', [single])])`, гравці `Оля` (p1), `Петро` (p2), `Віра` (p3). Вибування в цих тестах — через допоміжну функцію тесту, що вписує закрите випробування в `Play.survival.trial` (`{ kind: 'question', stage: 'closed', out: [...] , …}`); після задачі 3 її можна замінити справжнім випробуванням. Тести:
  - `everyone is alive at the start`: після `startRound` — `survivalAlive` = `['p1','p2','p3']`; `openQuestion` дає `play.survival = { ghosts: {}, edge: null, trial: null, end: false }`;
  - `alive players score like classic`: правила раунду `{ penalty: 'minus', multiplier: 2, streak: { length: 2, bonus: … } }`, `speedBonus: true` — бали p1 за правильну відповідь = класична формула з множником і швидкістю; неправильна p2 → мінус; серія на другому запитанні додає бонус;
  - `a mistake or silence puts a living player on the edge`: p1 правильно, p2 неправильно, p3 мовчить → `lock` → `next` (reveal) → `edgeNow` = `['p2','p3']`; `survivalVerdict` = `'trial'`;
  - `a host override on the reveal changes the edge`: текстове s4, p2 «Одесса» → reveal → `override(p2, 'correct')` → `edgeNow` без p2;
  - `partial counts as a mistake`: s3 з правилом часткових — p1 відповідь у частковій зоні → `grade 'partial'` → p1 на межі;
  - `when everyone alive erred nobody is out`: усі помилилися → `next` з reveal → `phase 'leaderboard'`, `play.survival.edge` = усі, `trial: null`, `survivalVerdict` = `'all_wrong'`, `endsAt null`; `next` → s2, усі живі;
  - `when everyone was right there is no trial`: усі правильно → `'all_right'`, `trial: null`;
  - `the leaderboard setting does not matter`: з `leaderboard: 'end'` після reveal — усе одно `leaderboard`;
  - `a ghost answers for herself without points`: p3 вибула (тестова функція) → на s2 `submitAnswer(p3, правильно)` → ok; `play.answers` без p3; `play.survival.ghosts.p3 = { correct: true, … }`; рахунок p3 не змінився; повторна → `already_answered`; не той тип → `type_mismatch`;
  - `ghosts do not hold the question`: p3 привид, p1 і p2 відповіли → запитання закрилося саме (`locked`);
  - `a ghost answer keeps streaks and accuracy untouched`: `streakCounts` p3 — 0, записів p3 у вибуванні немає (`recordOf` → `undefined`);
  - `the round ends when alive ≤ survivors after someone is out`: N = 1, p2 і p3 вибули на s1 → `next` з `leaderboard` → `round_end`; s2–s5 незіграні; `play.survival.end === true` на s1; коригування `{ source: 'survival', points: 500, playerId: 'p1', roundIndex: 0 }`; рахунок p1 включає 500;
  - `few players play every question`: гра з одним гравцем і N = 1 → раунд іде до s5, бонус наприкінці;
  - `running out of questions ends the round with the bonus for everyone alive`: N = 1, ніхто не вибув → після s5 `next` з `leaderboard` → `round_end`, коригування 500 у кожного з трьох;
  - `the bonus is given once`: `awardSurvivalBonus` двічі → одне коригування на гравця; `endRound` на `round_end` → `wrong_phase`;
  - `bonus 0 adds nothing`: `bonus: 0` → коригувань `survival` немає, `end` стоїть;
  - `ending the round mid-question is like classic`: `endRound` посеред s2 → `lockNow`, без випробування, живі отримують бонус;
  - `ending the game pays the bonus too`: `end` посеред раунду → `finished`, коригування бонусу є;
  - `a survival question opens with the «Запитання N» splash` (гра із заставками, `lobbyWithSplash`): `splash.kind === 'question'`;
  - `the classic round after it plays as before`: після `round_end` → `next` → класика; бали класики додаються.
  - `restore.test.ts`: `KEYS[8]` = `KEYS[7]` + `Play: …,survival` + `SurvivalPlay: 'edge,end,ghosts,trial'`, `GhostAnswer: 'answer,correct,timeMs'`, `SurvivalTrial: 'answers,doors,fallback,fellBack,kind,out,presented,questionId,stage,traps'`, `TrialAnswer: 'answer,correct,overridden,timeMs'` (порядок — як у наявних записах); `representative()` + стан «Вибування» на `reveal` другого запитання з привидом у `ghosts`; `READABLE_STATE_VERSIONS` `[2, 3, 4, 5, 6, 7, 8]`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine` → FAIL.
- [ ] **Step 3: Implement** `survival.ts`, зміни `game.ts`, `splash.ts`, фікстури, версію.
  - `survivalOut` збирає `trial.out` закритих (`stage 'closed'`) випробувань записів раунду; `survivalAlive` = `survivorsAfter(players, outs)` (shared).
  - `awardSurvivalBonus` стоїть на `addAdjustment` з `adjust.ts` (він сам кличе `withTotals`). У `finishRound` — до зміни фази, щоб `afterQuestion` і `roundIndex` були раунду «Вибування».
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine
  git commit -m "feat(engine): survival — alive players score like classic, a mistake or silence puts them on the edge, nobody is out when everyone erred, ghosts answer for themselves outside the score, the round ends at N survivors or out of questions with a one-time survival bonus; state version 8"
  ```

### Задача 3. Рушій: випробування — питання на виживання й удача, закриття, пауза, ручна оцінка, вилучення

**Files:**
- Modify: `packages/engine/src/survival.ts`, `packages/engine/src/game.ts`, `packages/engine/src/splash.ts`, `packages/engine/src/index.ts`
- Test: новий `packages/engine/src/game.survival-trial.test.ts`

**Interfaces:**
- Produces (`survival.ts`):
  ```ts
  export const SURVIVAL_LUCK_MS = LIMITS.survivalLuckSeconds * 1000;

  /** Перше невикористане питання на виживання поточного раунду (за порядком round.trials); null — скінчилися. */
  export function unusedTrial(state: GameState): Question | null;

  /** Питання випробування поточного запитання; null — удача чи випробування немає. */
  export function trialQuestionOf(state: GameState): Question | null;

  /** Випробування відкрите: етап leaderboard у «Вибуванні», trial.stage 'open' (з таймером або на паузі з remainingMs). */
  export function trialOpen(state: GameState): boolean;

  /**
   * Відкриває випробування для edge: вид — round.trial, або 'luck' з fellBack, якщо питань не лишилося.
   * Питання: presented — перемішані rng лише за round.shuffleOptions і типу single. Удача: для кожного з edge у порядку гравців —
   * traps[id] = min(2, ⌊rng()·3⌋), потім fallback[id] так само (рівно два виклики rng на гравця, інших немає).
   * Етап leaderboard, заставка 'trial' (withSplash), startedAt = кінець заставки (або now), endsAt = startedAt + ліміт.
   */
  export function openTrial(state: GameState, edge: string[], now: number, rng: Rng): GameState;

  /**
   * Відповідь на питання на виживання. Помилки: wrong_phase (не відкрите чи удача), paused, not_started (заставка), not_found,
   * not_allowed (не на межі), already_answered, time_over (now ≥ endsAt), type_mismatch. Потім settleTrial.
   */
  export function answerTrial(state: GameState, playerId: string, answer: Answer, now: number): Result;

  /** Вибір дверей (0…DOOR_COUNT − 1). Помилки — як answerTrial, без type_mismatch; wrong_phase — і для питання; двері поза 0…2 — not_found. Потім settleTrial. */
  export function pickDoor(state: GameState, playerId: string, door: number, now: number): Result;

  /**
   * Закриває випробування: stage 'closed', out (питання — без правильної відповіді; удача — doors ?? fallback === traps),
   * startedAt/endsAt/remainingMs null. Не відкрите — стан без змін.
   */
  export function closeTrial(state: GameState): GameState;

  /** Закриває відкрите випробування, якщо всі присутні на межі вже відповіли / вибрали; на паузі й без присутніх — ні. */
  export function settleTrial(state: GameState): GameState;

  /**
   * Оцінка ведучого питання на виживання після закриття (той самий етап leaderboard): correct / wrong → перерахунок out;
   * partial → partial_disabled; удача → wrong_phase; немає відповіді → not_found.
   */
  export function overrideTrial(state: GameState, playerId: string, grade: Grade): Result;
  ```
  - `openTrialOrBoard` (задача 2) тепер кличе `openTrial` замість заглушки.
- Changes (`game.ts`):
  - `next`, `case 'leaderboard'` у «Вибуванні»: `trialOpen` → `ok(closeTrial(state))`; інакше `advance`.
  - `tick`: на `leaderboard` — окрім гілки «Ва-банк»: `trialOpen && !paused && endsAt !== null && now >= endsAt` → `closeTrial` (з `endsAt` включно, як `closeDecision`).
  - `pause`: умова таймера — ще й `(phase === 'leaderboard' && trialOpen(state))`. Залишок — як зараз: `endsAt − max(now, startedAt)` (заставку resume бере із самої заставки).
  - `resumeClock`: на `leaderboard` з `remainingMs` для випробування — `startedAt = now + splashLead(state, pausedAt)`, `endsAt = startedAt + remainingMs` (як для запитання). Гілка «Ва-банк» без змін (`splashLead` там 0).
  - `resume`: після `settleDecision` — `settleTrial`.
  - `setConnected`, `removePlayer`: `settleTrial` (як `settleDecision`).
  - `endRound` і `end`: якщо `trialOpen` — спершу `closeTrial` (поруч із `closeDecision`).
  - `override`: якщо поточний раунд `survival` і `phase === 'leaderboard'` → `overrideTrial`. На `reveal` — класичний шлях (задача 2).
- Changes (`splash.ts`): `splashLead` враховує й `'trial'`.
- Changes (`blitz.ts`, `nextDeadline`): перевірити, що на `leaderboard` з `endsAt` повертається `endsAt` (гілка 10g загальна). Інакше доповнити.

- [ ] **Step 1: Write the failing tests** (`game.survival-trial.test.ts`; гравці p1–p4: Оля, Петро, Віра, Гліб; `rng` тестів — детермінований масив чисел):
  - `a survival question for everyone on the edge`: s1 — p1 правильно, p2 і p3 неправильно → reveal → `next` → `phase 'leaderboard'`, `trial.kind 'question'`, `questionId 't1'`, `stage 'open'`, `endsAt = startedAt + 15_000`; p2 правильно, p3 неправильно → закрилося само (усі присутні на межі відповіли) → `out ['p3']`; `survivalAlive` = p1, p2, p4;
  - `silence on the survival question means out`: p2 мовчить → `tick(endsAt − 1)` — ще відкрите; `tick(endsAt)` → закрито, p2 у `out`;
  - `only players on the edge answer the trial`: p1 → `not_allowed`; другий раз → `already_answered`; на паузі → `paused`; під час заставки (`lobbyWithSplash`) → `not_started`; після `endsAt` → `time_over`; boolean-відповідь на single → `type_mismatch`;
  - `trial questions are used in order, then luck`: перше випробування бере t1, друге — t2, третє — удача з `fellBack: true`;
  - `luck: a trap per player from the rng, picking it means out`: `rng` = `[0.05, 0.5, 0.9, 0.1]` → для p2 `traps 0, fallback 1`, для p3 `traps 2, fallback 0`; p2 вибирає 0 → out; p3 вибирає 1 → safe; закрилося само;
  - `luck: no pick means the fallback door`: p3 не вибрав → `tick(endsAt)` → двері `fallback`; якщо `fallback === trap` — out, інакше safe; `doors` без p3;
  - `pickDoor errors`: двері 3 → помилка (рушій: `not_found` для поза 0…2; zod на сервері відсіє раніше); `pickDoor` на питанні → `wrong_phase`; `answerTrial` на удачі → `wrong_phase`;
  - `the host closes the trial early`: `next` під час відкритого → закрито (мовчуни питання вибули); наступний `next` → s2;
  - `an absent player does not hold the trial`: p3 відключено → p2 відповів → закрито, p3 вибув (питання) / двері самі (удача);
  - `pause freezes the trial clock and the splash`: пауза посеред заставки й посеред таймера — `tick` нічого не робить; `resume` через 30 с → `endsAt` зсунуто на всю паузу; заставка дограє першою;
  - `suspend keeps an open trial paused and readable` (`restore.ts`): `suspend(state, at)` → `paused`, `remainingMs` = залишок; JSON туди й назад — той самий стан;
  - `the host can accept a survival answer after closing`: текстове питання на виживання (фікстура з `text`), p3 «Анкарра» → закрито, p3 у `out` → `override(p3, 'correct')` на `leaderboard` → p3 не в `out`, живий; `partial` → `partial_disabled`; удача → `wrong_phase`; після `next` (наступне запитання) оцінка вже не про випробування;
  - `a trial after the last question decides who gets the bonus`: s5 — p2 помилився → випробування → вибув → `next` → `round_end`, бонус лише в живих;
  - `the round ends after the trial that leaves N alive`: N = 2, з чотирьох вибули двоє → `next` → `round_end`;
  - `ending the round during the trial closes it like time over`: `endRound` під час відкритого → мовчуни вибули, бонус живим;
  - `kicking the last undecided player closes the trial`;
  - `debuffs do not fire on a trial`: дебаф, що чекає на p2, не спрацьовує на випробуванні (`firedAt null`).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine
  git commit -m "feat(engine): survival trials — one survival question for everyone on the edge or three doors with a trap each from the rng, luck when trial questions run out, silence means out but an unpicked door picks itself, the trial closes when all present answered, on time, by the host or with the round, pauses with its splash; the host can accept a trial answer after it closes"
  ```

### Задача 4. Рушій: ізоляція «Вибування» — без бафів і дуелей, дебафи лише на живих, правила діють

**Files:**
- Modify: `packages/engine/src/buffs.ts`, `packages/engine/src/debuffs.ts`, `packages/engine/src/duel.ts`
- Test: новий `packages/engine/src/game.survival-isolation.test.ts`

**Interfaces:**
- Changes (`buffs.ts`): `PlaceBlock` + `'off_survival'`; у `placeBlock` поруч із «Ва-банк»: `else if (round.type === 'survival') return 'off_survival';`. Ряд бафів телефона показує причину.
- Changes (`debuffs.ts`):
  ```ts
  /** «Вибування»: ціль — привид на етапах раунду (крім round_end); дебаф на нього нічого не дає. */
  export function ghostTarget(state: GameState, playerId: string): boolean;
  ```
  - `setDebuff`: `ghostTarget` → `not_allowed` (після `not_found`, поруч із `debuffsOff`);
  - `buyDebuff`: `ghostTarget(targetId)` → `not_allowed` (після перевірки `not_found`). Покупець-привид — дозволено;
  - `fireDebuffs`: на запитанні раунду «Вибування» `answering` — лише `survivalAlive` (привидам дебаф чекає);
  - `debuffsOff`, `shopBlock`, `cancelDebuff` — без змін.
- Changes (`duel.ts`): `duelsOff` → `true` і для раунду `survival` (фаза не `round_end`). Оновити коментар.

- [ ] **Step 1: Write the failing tests** (вікторина з бафами `['double', 'fifty']`, дебафами `['fog', 'shake']`, крамницею, дуелями; раунди: класика `r1` (1 запитання), «Вибування» `rs`, класика `r3`):
  - `buffs are off with a reason`: на s1 `takeBuff(p1, 'double')` → наявний код відмови для `off_*`; `playerView` → слот `blocked` з `off_survival`;
  - `debuffs work on the living`: ведучий `setDebuff(p2, 'fog')` на `intro` раунду → ok; спрацьовує на s1 для p2;
  - `the shop works in the round`: `buyDebuff(p1 → p2)` на `question` → ok; `shopBlock` → `null`;
  - `ghosts are not debuff targets`: p3 привид → `setDebuff(p3)` → `not_allowed`, `buyDebuff(p1 → p3)` → `not_allowed`; на `round_end` → ok;
  - `a ghost can buy a debuff for the living`: p3 привид з балами → `buyDebuff(p3 → p1)` → ok;
  - `a debuff pending on a ghost waits for the next round`: дебаф, наісланий на p3 у `r1`, а p3 вибуває на s1 → на s2…s5 не спрацьовує, спрацьовує на першому запитанні `r3`;
  - `no duels in the round`: поріг досягнуто → `duelWindowOpen` false на запитаннях і на `leaderboard` раунду; дуель, оголошена в `r1`, не стартує на `intro` «Вибування», стартує на його `round_end`;
  - `round rules apply`: `rulesOf(rs)` = правила раунду; `roundBrief(rs)` — штраф, серія, множник, швидкість із раунду.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine
  git commit -m "feat(engine): survival isolation — no buffs (off_survival), no duels until its round_end, debuffs from the host and the shop work on the living only, a debuff pending on a ghost waits for the next round, round rules apply"
  ```

### Задача 5. Зрізи: «живі / привиди», «на межі» лише з розкриття, випробування без пасток і відповіді до закриття, власний стан гравця

**Files:**
- Modify: `packages/shared/src/views.ts`, `packages/engine/src/views.ts`
- Test: новий `packages/engine/src/views.survival.test.ts`; фабрики зрізів у тестах вебу (`apps/web/src/**/*.test.tsx`, де будують `BaseView`/`PlayerView`/`RoundBrief`)

**Interfaces:**
- Produces (`shared/views.ts`):
  ```ts
  /** Рядок «Вибування»: гравець, стан, коли вибув, відповідь привида, випробування. */
  export interface SurvivalRow extends BlitzPlayer {
    /** edge — лише з розкриття до закриття випробування. */
    status: SurvivalStatus;
    /** Номер запитання раунду (з 1), після якого вибув; null — живий. */
    outAfter: number | null;
    /** Привид на поточному запитанні: correct — лише з розкриття (до того null); null — не привид або не відповідав. */
    ghost: { correct: boolean | null } | null;
    /** Для «на межі»: pending / done, поки випробування відкрите (і пульт); safe / out — після закриття; інакше null. */
    trial: 'pending' | 'done' | 'safe' | 'out' | null;
    /** Удача: picked — вибрані двері (сцена й телефони — лише після закриття, пульт — наживо); auto — вибрано самі; trap — лише після закриття. */
    door: { picked: number | null; auto: boolean; trap: number | null } | null;
  }

  /** Випробування для всіх. */
  export interface SurvivalTrialInfo {
    kind: TrialKind;
    fellBack: boolean;
    stage: 'open' | 'closed';
    endsAt: number | null;
    remainingMs: number | null;
    limitMs: number;
    /** Скільки на межі вже відповіли / вибрали і скільки їх усього. */
    done: number;
    total: number;
    /** Питання на виживання без правильної відповіді; null — удача. */
    question: PublicQuestion | null;
    /** Правильна відповідь питання — лише після закриття (без підказки); інакше null. */
    reveal: Question | null;
  }

  /** «Вибування» (10h). */
  export interface SurvivalInfo {
    /** Поточне запитання раунду (0-базове); -1 до першого. */
    current: number;
    total: number;
    /** Скільки має лишитися, бонус, вид випробування й скільки питань на виживання ще є. */
    target: number;
    bonus: number;
    trialKind: TrialKind;
    trialsLeft: number;
    /** У порядку гравців. */
    rows: SurvivalRow[];
    aliveCount: number;
    ghostCount: number;
    /** Привиди на поточному запитанні: answered — наживо; right — лише з розкриття. */
    ghosts: { answered: number; right: number | null };
    /** Після розкриття; null до нього. */
    verdict: 'trial' | 'all_wrong' | 'all_right' | null;
    trial: SurvivalTrialInfo | null;
    /** Наступне «Далі» ведучого завершить раунд (живих ≤ target після вибування або запитань більше немає). */
    ending: boolean;
  }

  // BaseView:
  /** «Вибування»: від intro до round_end свого раунду (і finished, якщо він останній); інакше null. */
  survival: SurvivalInfo | null;

  // PlayerView['me']:
  /** Власний стан у «Вибуванні»; null поза раундом. */
  survival: {
    status: SurvivalStatus;
    outAfter: number | null;
    /** Привид: правильність власної відповіді «для себе» — лише з розкриття. */
    ghostCorrect: boolean | null;
    /** На межі, питання відкрите, заставка скінчилась, ще не відповів, не пауза. */
    canAnswerTrial: boolean;
    trialAnswer: Answer | null;
    /** На межі, удача відкрита, заставка скінчилась, ще не вибрав, не пауза. */
    canPickDoor: boolean;
    door: number | null;
    /** Після закриття випробування для того, хто був на межі. */
    result: 'safe' | 'out' | null;
    /** На round_end / finished — бонус, який гравець отримав; інакше null. */
    bonus: number | null;
  } | null;
  ```
- Changes (`engine/views.ts`):
  - `survivalInfo(state, forHost)` і `playerSurvival(state, playerId)` за зразком `wipeoutInfo` / `playerWipeout`;
  - `SURVIVAL_PHASES` — як `WIPEOUT_PHASES`;
  - `edge` у рядках — на `reveal` з `edgeNow`, на `leaderboard` з `play.survival.edge` (до закриття випробування; після — `safe` → `alive`, `out` → `ghost`);
  - `trial.question` — `publicQuestion(trialQuestion, trial.presented)` (без кліпу, як `withoutClip`), `reveal` — `withoutHint(trialQuestion)` лише при `stage 'closed'`;
  - `me.answer` привида — його відповідь із `ghosts` (через `publicAnswer(..., revealed)`); `me.result` привида — `null`;
  - `answeredCount` — лише живі (відповіді привидів поза `answers`, перевірити тестом);
  - `publicStandings`: на `leaderboard` у «Вибуванні» → `null`; `liveTable` — `full` як у «Ва-банк» (не підсумки на `leaderboard` раунду);
  - `playerShop`: цілі без привидів (`ghostTarget`);
  - `typeTip` — привид отримує підказку, як живий (він відповідає з телефона);
  - `SPLASH_PHASE.trial = 'leaderboard'` (`splashView`).
- Фабрики зрізів у тестах вебу: `survival: null`, `me.survival: null`, `RoundBrief.survival: null`.

- [ ] **Step 1: Write the failing tests** (`views.survival.test.ts`):
  - `everyone alive on the intro`: `stageView` на `intro` — `current -1`, `total 5`, `target 1`, `bonus 500`, `trialKind 'question'`, `trialsLeft 2`, усі `alive`, `verdict null`, `trial null`;
  - `nobody is on the edge before the reveal`: p2 неправильно на s1; на `question` і `locked` `JSON.stringify(stageView)` і `playerView(p2)` не містять `"edge"`; `verdict null`; на `reveal` — p2 `edge`, `verdict 'trial'`;
  - `ghost answers count only from the reveal`: p3 привид відповів правильно → на `question`: `ghosts { answered: 1, right: null }`, рядок p3 `ghost { correct: null }`, `me.survival.ghostCorrect null`; на `reveal`: `right 1`, `correct true`; `me.answer` p3 — його відповідь; `me.result` p3 — `null`; `answeredCount` — лише живі;
  - `an open survival question hides the answer`: `trial.question` — без `correct`/`accepted`; `trial.reveal === null`; `JSON.stringify(hostView)` теж без правильної відповіді питання; після закриття — `reveal` є;
  - `traps stay hidden from everyone, the host included, until the trial closes`: удача з пастками → `JSON.stringify(stageView)`, `playerView(p2)`, `hostView` не містять `"trap":0`/`1`/`2` (усі `trap: null`); сцена й телефони — `door.picked null` після вибору p2, `trial 'done'`; пульт — `picked` наживо; після закриття — `trap`, `picked`, `auto`, `safe`/`out` для всіх;
  - `the trial clock`: `trial.endsAt` = `state.endsAt`; на паузі `endsAt null`, `remainingMs` = залишок; `done`/`total`; `limitMs` 15 000 (питання) / 10 000 (удача);
  - `me.survival`: `canAnswerTrial` true лише для «на межі» під час відкритого питання після заставки, false на паузі й після відповіді; `canPickDoor` так само для удачі; `result` після закриття; `bonus` 500 на `round_end` у живих і `null` у привидів;
  - `the board replaces the leaderboard, the table button still works`: на `leaderboard` у «Вибуванні» `stageView.standings === null`, `playerView.standings === null`, `playerView.table` не `null`;
  - `the shop offers no ghost targets`: `me.shop.targets` без p3-привида; на `round_end` — з ним;
  - `the trial splash shows on the leaderboard`: `stageView.splash.kind === 'trial'` одразу після відкриття випробування (гра із заставками);
  - `outside survival there is no board`: класика → `survival: null`, `me.survival: null`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared packages/engine apps/web/src
  git commit -m "feat(engine): survival views — the alive and ghosts board, the edge only from the reveal, ghost hits only from the reveal, an open trial without its answer or traps for anyone, the host included, own trial state and bonus on the phone, the board instead of the leaderboard, no ghost debuff targets in the shop"
  ```

### Задача 6. Сервер і демо: події випробування, «Вибування» в історії й профілі, бонус в історії, раунд у демо

**Files:**
- Modify: `packages/shared/src/events.ts`, `packages/shared/src/history.ts`, `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`, `apps/server/src/recorder.ts`, `apps/server/src/history.ts`, `apps/server/src/db/schema.ts`, `apps/server/scripts/demo-quiz.ts`
- Create: `apps/server/src/testing/survival-game.ts`
- Test: `apps/server/src/socket.test.ts`, `apps/server/src/rooms/manager.test.ts`, `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts`, `apps/server/src/profiles.test.ts`, `apps/server/scripts/demo-quiz.test.ts`

**Interfaces:**
- Produces (`events.ts`):
  ```ts
  /** «Вибування»: відповідь на питання на виживання (10h). */
  export const trialSchema = z.object({ answer: answerSchema });
  /** «Вибування»: вибір дверей удачі (10h). */
  export const doorSchema = z.object({ door: z.number().int().min(0).max(DOOR_COUNT - 1) });
  // ClientToServerEvents:
  'player:trial': (payload: z.infer<typeof trialSchema>, ack: Ack) => void;
  'player:door': (payload: z.infer<typeof doorSchema>, ack: Ack) => void;
  ```
  - Оцінка ведучого випробування — наявний `host:override` (рушій сам розводить за етапом).
- Changes (`manager.ts`):
  - `trial(room, playerId, answer): AckResult` → `this.apply(room, answerTrial(room.state, playerId, answer, this.now()))`;
  - `door(room, playerId, door): AckResult` → `this.apply(room, pickDoor(room.state, playerId, door, this.now()))`.
  - Розклад тіку бере `nextDeadline` — перевірити тестом, що випробування закривається саме за часом.
- Changes (`socket.ts`): `on('player:trial', …)` і `on('player:door', …)` за зразком `player:wipeout` (лише гравець; `safeParse`).
- Changes (`db/schema.ts`, `PlayRef`):
  ```ts
  /** «Вибування»: хто був на межі, випробування, привиди й кінець раунду (id учасників). */
  survival?: {
    edge: string[];
    /** Скільки привидів відповіли «для себе» й скільки відгадали; немає — жоден не відповідав. */
    ghosts?: { answered: number; right: number };
    trial?: {
      kind: TrialKind;
      fellBack?: true;
      questionId?: string;
      /** Питання: відповіді на межі (answer і correct). */
      answers?: Record<string, { answer: Answer; correct: boolean }>;
      /** Удача: двері (picked чи auto) і пастка кожного на межі. */
      doors?: Record<string, { door: number; auto: boolean; trap: number }>;
      out: string[];
    };
    end?: true;
  };
  ```
- Changes (`recorder.ts`):
  - `signature`: окрім `wipeout`, ще `survival` останнього запису (зміни в привидах і випробуванні без зміни фази теж записуються);
  - `save` → `plays`: `PlayRef.survival` з `Play.survival`. `edge` — `play.survival.edge ?? []`; випробування — лише закрите (`stage 'closed'`); `doors` — `doors[id] ?? fallback[id]`, `auto: !(id in doors)`. Відповіді привидів не йдуть у рядки `answer`.
  - Коригування `source 'survival'` пишуться наявним шляхом (перевірити тестом).
- Produces (`shared/history.ts`, `GameQuestionResult`):
  ```ts
  /** «Вибування»: вердикт після розкриття, випробування, привиди й хто живий після цього запитання. */
  survival?: {
    verdict: 'trial' | 'all_wrong' | 'all_right';
    ghosts: { answered: number; right: number };
    trial: {
      kind: TrialKind;
      fellBack: boolean;
      /** Текст питання на виживання; null — удача. */
      question: string | null;
      rows: { nickname: string; out: boolean; answer: Answer | null; door: number | null; auto: boolean; trap: number | null }[];
    } | null;
    /** Живі після цього запитання (нікнейми). */
    alive: string[];
    /** На цьому запитанні раунд скінчився. */
    end: boolean;
  };
  ```
- Changes (`server/history.ts`):
  - для запитань раунду `survival` — `survivalResult(quiz, plays, index, standings)`: вердикт із `edge` (порожній → `all_right`; дорівнює живим до запитання → `all_wrong`; інакше `trial`); текст питання — зі знімка за `questionId` у `round.trials`; живі — `survivorsAfter` (shared) за `trial.out` записів раунду до цього включно. Учасник, якого вилучили, у рядки не потрапляє;
  - коригування `source 'survival'` у підсумках — як інші джерела (поле `source` у рядку);
  - **профіль:** `unplayedSurvival(snapshot, plays, questionsPlayed, participantId)` поруч з `unplayedWipeout`: запитання раунду «Вибування» після того, як учасник вибув (за `trial.out`), не рахуються його запитаннями (там у нього немає рядків-відповідей). Віднімати в `playerGames` поруч з `unplayedWipeout`.
- Produces (`testing/survival-game.ts`): помічник за зразком `testing/wipeout-game.ts`:
  ```ts
  /** Правильна й неправильна відповідь на s1…s5 (`survivalQuestions`) і на t1, t2 (`survivalTrials`). */
  export const SURVIVAL_RIGHT: Answer[]; export const SURVIVAL_WRONG: Answer[];
  export const TRIAL_RIGHT: Answer[]; export const TRIAL_WRONG: Answer[];
  /**
   * Грає одне запитання «Вибування» до кінця випробування: right — хто з живих відповідає правильно (решта неправильно, null — мовчить),
   * ghosts — відповіді привидів, trial — хто проходить питання (або doors — хто які двері вибирає). Зупиняється на leaderboard.
   */
  export function playSurvivalQuestion(manager: RoomManager, room: Room, plan: { right: string[]; silent?: string[]; ghosts?: Record<string, boolean>; trial?: string[]; doors?: Record<string, number> }): void;
  ```
- Демо (`demo-quiz.ts`): раунд `r-survival` «Вибування: природа» перед `r-final`. `trial: 'question'`, `survivors: 1`, `bonus: 300`, `speedBonus: false`, `DEFAULT_RULES`. Факти — перевірені, по одному реченню в коментарі біля кожного:
  1. `single` «Найбільший океан Землі?» — Тихий (Атлантичний, Індійський, Північний Льодовитий), 100;
  2. `boolean` «Кит — ссавець», true, 200;
  3. `numeric` «Скільки ніг у павука?» — 8, допуск 0, 300;
  4. `text` «Найвища гора світу?» — `['Еверест', 'Джомолунгма']`, 400;
  5. `slider` «За скільки градусів Цельсія кипить вода на рівні моря?» — 100, 0…200, крок 1, допуск 2, 500.
  - Питання на виживання: `boolean` «Пінгвіни живуть в Антарктиді», true; `single` «Яка планета найближча до Сонця?» — Меркурій (Венера, Марс, Земля).
  - Вікторина лишається в межах `LIMITS.maxRounds` (було 9 → 10) і `LIMITS.maxQuizQuestions`.

- [ ] **Step 1: Write the failing tests**
  - `socket.test.ts`:
    - `player:trial` приймає відповідь «на межі»; невалідне тіло → `invalid_payload`; від ведучого → `forbidden`; поза випробуванням → `wrong_phase`;
    - `player:door` з `door: 3` → `invalid_payload`; валідний — ok;
    - випробування закривається саме за часом без відповідей (фейковий годинник менеджера, як у наявних тестах дедлайнів).
  - `manager.test.ts`: `host:override` на `leaderboard` після закриття питання на виживання повертає гравця живим.
  - `recorder.test.ts`: після випробування `game.plays[i].survival` має `edge`, `trial.kind`, `trial.out`; рядків `answer` привидів немає; лічильник `ghosts`; після кінця раунду `end: true` і рядки коригувань `source 'survival'` для живих; рахунок учасника = відповіді + коригування.
  - `history.test.ts` (`history: survival (10h)`): чотири учасники — один вибув на питанні (s1), усі помилилися (s2 → `all_wrong`), один вибув на дверях (s3, удача з `fellBack`), кінець із бонусом → у кожного запитання `survival` з правильним вердиктом, рядками випробування, `ghosts`, `alive`, `end`; коригування бонусу в підсумках.
  - `profiles.test.ts`: точність гравця, що вибув на s1, — з його відповідей; запитання, на яких він був привидом, не рахуються; відповіді привида точність не змінюють.
  - `demo-quiz.test.ts`: `quizSchema.safeParse(demoQuiz).success`; є раунд `survival` з 5 запитаннями й 2 питаннями на виживання; усі типи з `SURVIVAL_TYPES`; `rounds.length ≤ LIMITS.maxRounds`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared apps/server
  git commit -m "feat(server): survival — player:trial and player:door, the trial closes on its own deadline, edge, trials, ghost counts and the round end in game plays, survival details per question in the history, the bonus as survival adjustments, ghost questions left out of accuracy; a survival round in the demo quiz"
  ```

### Задача 7. Телефон: сторінка «живі / привиди», випробування одним пальцем, троє дверей, режим привида

**Files:**
- Create: `apps/web/src/screens/SurvivalBoard.tsx`, `apps/web/src/screens/SurvivalTrial.tsx`, `apps/web/src/screens/SurvivalDoors.tsx`
- Modify: `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/screens/DebuffShop.tsx` (лише якщо цілі фільтрує клієнт), `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: нові `SurvivalBoard.test.tsx`, `SurvivalTrial.test.tsx`, `SurvivalDoors.test.tsx`; `PlayerScreen.test.tsx`

**Interfaces:**
- Produces:
  ```tsx
  /** «Живі / привиди»: дві групи (живі — великі, на межі — підсвічені, привиди — блідо, з «вибув після N»); size — сцена, пульт чи телефон; highlightId — свій рядок; forHost — двері наживо. */
  export function SurvivalBoard({ info, size, highlightId }: { info: SurvivalInfo; size: 'stage' | 'host' | 'phone'; highlightId?: string }): JSX.Element;

  /** Випробування на телефоні: для «на межі» — питання (AnswerInput з info.trial.question) чи двері; для інших — рядок «Дивись: випробування для …»; після закриття — «Пронесло!» / «Ти вибуваєш». */
  export function SurvivalTrial({ view, offsetMs, onAnswer, onDoor }: { view: PlayerView; offsetMs: number; onAnswer: (answer: Answer) => void; onDoor: (door: number) => void }): JSX.Element | null;

  /** Троє дверей: picked — вибрані; disabled; reveal — після закриття: пастка й вибрані (auto — «вибрано самі»). */
  export function SurvivalDoors({ picked, disabled, reveal, onPick, size }: { picked: number | null; disabled: boolean; reveal: { picked: number | null; auto: boolean; trap: number } | null; onPick?: (door: number) => void; size: 'stage' | 'phone' }): JSX.Element;
  ```
- `PlayerScreen.tsx`:
  - на `question` привида — над полем відповіді смуга `survivalGhostBanner`; поле працює як завжди (`player:answer`); після відповіді — `survivalGhostSent`;
  - на `reveal` привида — `survivalGhostRight` / `survivalGhostWrong` замість «+N балів»; живого «на межі» — `survivalEdge` під вердиктом;
  - на `leaderboard` у «Вибуванні» замість таблиці: `SurvivalTrial` (під час випробування) + компактна `SurvivalBoard size="phone"`; без випробування — вердикт (`survivalAllWrong` / `survivalAllRight`) і дошка;
  - `send('player:trial', { answer })` і `send('player:door', { door })` через `useGuardedSend` (помилку з ack показати, як у `WallInput`);
  - на `round_end` — `survivalBonusGot` («Ти дожив(-ла) до кінця: +{bonus}») або `survivalOutAfter` («Ти вибув(-ла) після запитання {n}»);
  - ряд бафів з причиною `off_survival` — наявний `Buffs.tsx`, нічого не міняти;
  - крамниця дебафів: цілі вже без привидів із зрізу (задача 5); якщо `DebuffShop` має власний фільтр — нічого не додавати.
- `i18n.ts`:
  - `survivalAlive: 'Живі'`, `survivalGhosts: 'Привиди'`, `survivalEdgeGroup: 'На межі'`;
  - `survivalGhostBanner: 'Ти привид: відповідай для себе — балів не буде.'`, `survivalGhostSent: 'Відповідь для себе прийнято.'`;
  - `survivalGhostRight: 'Відгадав(-ла) — для себе.'`, `survivalGhostWrong: 'Не відгадав(-ла).'`;
  - `survivalEdge: 'Ти на межі — зараз випробування.'`;
  - `survivalTrialQuestion: 'Питання на виживання'`, `survivalTrialLuck: 'Удача: вибери двері'`, `survivalFellBack: 'Питань на виживання не лишилося — удача.'`;
  - `survivalDoor: 'Двері {n}'`, `survivalDoorDefault: 'Не вибереш за {seconds} с — двері виберуться самі.'`, `survivalDoorPicked: 'Двері {n}. Чекаємо інших…'`, `survivalDoorAuto: 'вибрано самі'`, `survivalTrap: 'Пастка!'`;
  - `survivalWatchTrial: 'Випробування для: {names}'`;
  - `survivalSafe: 'Пронесло! Ти живий(-а).'`, `survivalOut: 'Ти вибуваєш — тепер ти привид.'`;
  - `survivalAllWrong: 'Помилилися всі — ніхто не вибуває.'`, `survivalAllRight: 'Усі вціліли.'`;
  - `survivalOutAfterShort: 'вибув(-ла) після {n}'`, `survivalCount: 'Живих: {alive} · привидів: {ghosts}'`;
  - `survivalBonusGot: 'Ти дожив(-ла) до кінця: +{bonus}'`, `survivalOutAfter: 'Ти вибув(-ла) після запитання {n}.'`;
  - `survivalGhostHits: 'Привиди: {right} з {answered} відгадали'`.

- [ ] **Step 1: Write the failing tests**
  - `SurvivalBoard.test.tsx`: групи «Живі» / «На межі» / «Привиди»; у привида «вибув(-ла) після 1»; свій рядок підсвічено; `trial 'done'` → позначка «✓» без вибору.
  - `SurvivalDoors.test.tsx`: три кнопки з `aria-label` «Двері 1…3», ≥ 96 px (клас); натиск → `onPick(i)`; `disabled` → без виклику; `reveal` → пастка позначена «Пастка!», вибрані — підсвічені, `auto` → «вибрано самі».
  - `SurvivalTrial.test.tsx`:
    - на межі, питання, `canAnswerTrial` → `AnswerInput` з питанням випробування, натиск → `onAnswer`;
    - на межі, удача, `canPickDoor` → двері й `survivalDoorDefault`; після вибору → `survivalDoorPicked`;
    - не на межі → `survivalWatchTrial` з нікнеймами;
    - після закриття → `survivalSafe` / `survivalOut`;
    - `fellBack` → `survivalFellBack`;
    - на паузі кнопки вимкнені.
  - `PlayerScreen.test.tsx`: привид на `question` бачить `survivalGhostBanner` і поле відповіді; на `reveal` — `survivalGhostRight`, без «+N»; на `leaderboard` у «Вибуванні» немає `Standings`, є дошка; `round_end` — `survivalBonusGot` у живого, `survivalOutAfter` у привида.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web` → FAIL.
- [ ] **Step 3: Implement.** Стилі: двері — три в ряд на 375 px, кожні ≥ 96 px заввишки, з номером; відкриття пастки — коротка анімація (з `prefers-reduced-motion` — без неї); привиди — напівпрозорі з 👻; без прокрутки вбік.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): survival on the phone — the alive and ghosts board, a survival question or three big doors with the picks-itself line, safe or out after the trial, a ghost banner and answers for yourself, the bonus or when you dropped out at the round end"
  ```

### Задача 8. Сцена, пульт, заставка, історія: «живі / привиди», драматична заставка, двері на сцені, «Закрити випробування»

**Files:**
- Create: `apps/web/src/screens/HostSurvival.tsx`
- Modify: `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/HostScreen.tsx`, `apps/web/src/screens/HostPlayerTools.tsx`, `apps/web/src/live/Splash.tsx`, `apps/web/src/pages/GameHistory.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `StageScreen.test.tsx`, `HostScreen.test.tsx`, новий `HostSurvival.test.tsx`, `HostPlayerTools.test.tsx`, `live/Splash.test.tsx`, `GameHistory.test.tsx`

**Interfaces:**
- `Splash.tsx`: вид `'trial'` — велике «Випробування!», під ним `survivalTrialQuestion` чи `survivalTrialLuck` (з `view.survival.trial.kind`; `fellBack` — `survivalFellBack`) і нікнейми «на межі». Тривалість — `SPLASH_MS.trial`. З `prefers-reduced-motion` — статично.
- `StageScreen.tsx`:
  - `intro` «Вибування» — під `RoundBriefing` дошка `SurvivalBoard size="stage"` і рядок «Лишиться {target} · бонус {bonus}»;
  - `question` / `locked` — вузька смуга `survivalStageStrip` («Запитання {index} з {total} · живих {alive} · привидів {ghosts}»); «Відповіли N з M» — `M = info.aliveCount`;
  - `reveal` — під розкриттям `survivalGhostHits` (якщо привиди відповідали) і підсвічені «на межі»;
  - `leaderboard` у «Вибуванні» — `SurvivalBetween`:
    - випробування-питання: питання (`info.trial.question`), відлік `Timer`, «Відповіли {done} з {total}», рядки «на межі»; після закриття — правильна відповідь (`info.trial.reveal`) і `safe` / `out`;
    - удача: у кожного «на межі» ряд `SurvivalDoors size="stage"` («вибрав(-ла)» до закриття; після — двері, пастка, `auto`);
    - без випробування — `survivalAllWrong` / `survivalAllRight` великими літерами;
    - завжди — `SurvivalBoard size="stage"`;
  - `round_end` — як завжди (таблиця).
  - `expectStageFits` у задачі 11 перевіряє 1280 × 720.
- `HostSurvival.tsx`:
  ```tsx
  /** Пульт «Вибування»: живі, на межі (з дверима й відповідями наживо), привиди, скільки питань на виживання лишилося, «ⓘ» раунду. */
  export function HostSurvival({ view, offsetMs }: { view: HostView; offsetMs: number }): JSX.Element | null;
  ```
- `HostScreen.tsx`:
  - `HostSurvival` на етапах раунду;
  - головна дія на `leaderboard` у «Вибуванні»: випробування відкрите → `survivalCloseTrial` («Закрити випробування»); інакше, якщо `info.ending` → `survivalToResults` («Підсумки раунду») або `next` в останньому раунді; інакше — «Наступне запитання»;
  - кнопки «Зарахувати / Відхилити» для текстового питання на виживання після закриття — поруч із рядком гравця в `HostSurvival` (`host:override`);
  - рядок «Відповіли N з M» на `question` — `M = info.aliveCount`.
- `HostPlayerTools.tsx`: меню дебафів біля привида не показується (з `view.survival.rows`), біля живого — як завжди. Решта — без змін.
- `GameHistory.tsx`: для запитання з `survival` — під відповідями:
  - `historySurvivalAllWrong: 'Помилилися всі — ніхто не вибув'`, `historySurvivalAllRight: 'Усі вціліли'`;
  - `historySurvivalTrialQuestion: 'Питання на виживання: {question}'`, `historySurvivalTrialLuck: 'Удача'` (+ `historySurvivalFellBack: '(питань не лишилося)'`);
  - рядки: `historySurvivalSafe: '{name} — вижив(-ла)'`, `historySurvivalOut: '{name} — вибув(-ла)'`, двері: `historySurvivalDoor: 'двері {door}, пастка {trap}'`, `historySurvivalDoorAuto: 'двері {door} (самі), пастка {trap}'`;
  - `historySurvivalGhosts: 'Привиди: {right} з {answered} відгадали'`;
  - коригування `source 'survival'` — `historySurvivalBonus: 'Бонус виживання: {name} +{points}'` (у тому ж блоці, де коригування дуелей і дебафів).
  - *Рішення:* без роду за нікнеймом, як у наявних текстах історії.
- `i18n.ts`: `survivalStageStrip: 'Запитання {index} з {total} · живих {alive} · привидів {ghosts}'`, `survivalCloseTrial: 'Закрити випробування'`, `survivalToResults: 'Підсумки раунду'`, `survivalTarget: 'Лишиться {target} · бонус {bonus}'`, `survivalTrialsLeft: 'Питань на виживання: {n}'`, `survivalPicked: 'вибрав(-ла)'`, `survivalAnswering: 'думає…'`, `splashTrial: 'Випробування!'`.

- [ ] **Step 1: Write the failing tests**
  - `Splash.test.tsx`: вид `trial` — «Випробування!», підпис за видом, нікнейми «на межі».
  - `StageScreen.test.tsx`: `intro` — дошка й `survivalTarget`; `question` — смуга `survivalStageStrip`, «Відповіли 1 з 3» за `aliveCount`; `leaderboard` з питанням — питання й «Відповіли 1 з 2», без `Standings`; з удачею — по три двері на кожного «на межі», після закриття — «Пастка!»; `all_wrong` — `survivalAllWrong`.
  - `HostSurvival.test.tsx`: двері наживо («Петро — двері 2»), «думає…»; `survivalTrialsLeft`; «ⓘ» з `round.survival`; «Зарахувати» біля текстової відповіді після закриття шле `host:override`.
  - `HostScreen.test.tsx`: головна кнопка — «Закрити випробування» під час випробування, «Підсумки раунду» при `ending`; «Відповіли N з M» з `aliveCount`.
  - `HostPlayerTools.test.tsx`: біля привида немає меню дебафів.
  - `GameHistory.test.tsx`: рядки вердикту, випробування (питання й удача з дверима), привидів, бонусу.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): survival on the stage, host and history — a dramatic trial splash, the alive and ghosts board, the survival question or doors per player with traps after closing, ghost hits on the reveal, live trial state and close trial on the host, no debuff menu for ghosts, trials, ghosts and the bonus in the history"
  ```

### Задача 9. Редактор: «Вибування» — запитання, питання на виживання, вид випробування, N і бонус

**Files:**
- Modify: `apps/web/src/editor/QuizEditor.tsx`, `apps/web/src/editor/RoundSettings.tsx`, `apps/web/src/editor/SparesEditor.tsx`, `apps/web/src/editor/draft.ts`, `apps/web/src/i18n.ts`
- Test: `apps/web/src/editor/QuizEditor.test.tsx`, `apps/web/src/editor/draft.test.ts`

**Interfaces:**
- `SparesEditor.tsx` — узагальнити без зміни наявного вигляду (типові значення = нинішня поведінка):
  ```ts
  interface Props {
    spares: Question[] | undefined;
    onChange: (next: Question[] | undefined) => void;
    max?: number;
    hint?: string;
    /** Дозволені типи (типово SIMPLE_TYPES). */
    types?: readonly QuestionType[];
    /** Показувати час (типово false). */
    showTime?: boolean;
    /** Підпис чіпа (типово «Запасне N»), кнопки додавання й вилучення. */
    chipLabel?: (index: number) => string;
    addLabel?: string;
    removeLabel?: string;
  }
  ```
- `draft.ts`:
  - `problemsOf`:
    - раунд `survival` з менш ніж `LIMITS.minSurvivalQuestions` запитаннями → `problemSurvivalFew`; з більш ніж `maxSurvivalQuestions` → `problemSurvivalMany`;
    - тип поза `SURVIVAL_TYPES` (у запитаннях чи питаннях на виживання) → `problemSurvivalType`;
    - `trial 'question'` без питань на виживання → `problemSurvivalTrials`;
    - питання на виживання з порожнім текстом / варіантами — наявні перевірки запитань з префіксом `trialN`;
    - в останній перевірці схемою: `survival_type` → `problemSurvivalType`, `survival_trials` → `problemSurvivalTrials`, `survival_trial_media` → `problemSurvivalTrialMedia`.
  - `newSurvivalQuestion()` не потрібен: нове запитання — `newQuestion('single')` з ціною 100.
- `QuizEditor.tsx`:
  - «Додати запитання» в раунді `survival` → `{ ...newQuestion('single'), points: 100 }`; `roomForMore` — `questions.length < LIMITS.maxSurvivalQuestions` і загальна кількість (з питаннями на виживання) < `LIMITS.maxQuizQuestions`;
  - кнопка «Видалити» вимкнена на `LIMITS.minSurvivalQuestions` з підказкою `survivalMinHint`;
  - `QuestionEditor`: `types={questionTypesFor('survival')}`, `showPoints`, `showReveal={false}`, `allowCloud={false}`.
- `RoundSettings.tsx` для `survival`:
  - назва, опис, «Однаковий час», «Перемішувати варіанти», правила й бонус за швидкість — як у класиці;
  - блок «Вибування» з `HelpButton id="round.survival"`:
    - «Випробування»: два перемикачі `survivalTrialQuestionOpt` / `survivalTrialLuckOpt` (радіо, ≥ 44 px);
    - «Скільки має лишитися» — число 1…`LIMITS.maxSurvivors`;
    - «Бонус виживання» — число 0…`LIMITS.maxPoints`, крок 50;
    - «Питання на виживання» — `SparesEditor` з `types={SURVIVAL_TYPES}`, `showTime`, `max={LIMITS.maxSurvivalTrials}`, `hint={t('survivalTrialsHint')}`, `chipLabel={(i) => t('trialN', { index: i + 1 })}`; `onChange(undefined)` → `trials: []`. Показується за будь-якого виду (для удачі з поясненням `survivalTrialsLuckNote`).
- `RoundStrip.tsx` — без змін (кнопка «Вибування» з «ⓘ» з'являється сама з `ROUND_TYPES`). Перевірити тестом.
- `i18n.ts`:
  - `problemSurvivalFew: 'У «Вибуванні» щонайменше {min} запитання.'`, `problemSurvivalMany: 'У «Вибуванні» щонайбільше {max} запитань.'`;
  - `problemSurvivalType: 'У «Вибуванні» лише запитання: один варіант, так/ні, число, текст, повзунок.'`;
  - `problemSurvivalTrials: 'Для випробування «питання» додай хоча б одне питання на виживання.'`;
  - `problemSurvivalTrialMedia: 'Питання на виживання — без відео, аудіо й проявлення.'`;
  - `survivalMinHint: 'Менше {min} запитань у «Вибуванні» не буває.'`;
  - `survivalTrialKind: 'Випробування'`, `survivalTrialQuestionOpt: 'Питання на виживання'`, `survivalTrialLuckOpt: 'Удача (троє дверей)'`;
  - `survivalSurvivors: 'Скільки має лишитися'`, `survivalBonusLabel: 'Бонус виживання'`;
  - `survivalTrialsTitle: 'Питання на виживання'`, `survivalTrialsHint: 'Одне питання на кожне випробування, за порядком. Коли скінчаться — буде удача.'`, `survivalTrialsLuckNote: 'З удачею ці питання не потрібні.'`;
  - `trialN: 'Питання {index}'`, `addTrial: '+ Питання на виживання'`, `removeTrial: 'Прибрати питання'`.

- [ ] **Step 1: Write the failing tests**
  - `draft.test.ts`:
    - `problemsOf` для 2 запитань → `problemSurvivalFew`; `multi` у питаннях на виживання → `problemSurvivalType`; `trial 'question'` без питань → `problemSurvivalTrials`; `trial 'luck'` без питань → без проблеми; заповнений раунд → без проблем.
  - `QuizEditor.test.tsx`:
    - «+ Раунд» → «Вибування» → вкладка з трьома запитаннями й двома питаннями на виживання;
    - вибір типу запитання має лише 5 типів (і в питанні на виживання теж);
    - «Додати запитання» → четверте з ціною 100; видалення вимкнене на трьох;
    - перемикач «Удача» → `trial 'luck'`; «Скільки має лишитися» 2 → `survivors 2`; бонус 0 → `bonus 0`;
    - «+ Питання на виживання» додає третє; «Прибрати питання» прибирає;
    - у налаштуваннях раунду є «Мінус за помилку» й «Бонус за швидкість».
  - Наявні тести `SparesEditor` (у `QuizEditor.test.tsx` / `BoardEditor.test.tsx`) — зелені без змін.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): editor for survival — three simple questions to start, a list of survival questions, question or luck trials, how many survive and the survival bonus, classic round rules"
  ```

### Задача 10. Довідка ведучого: «Вибування» й оновлені записи бафів, дебафів, дуелей і налаштувань

**Files:**
- Modify: `apps/web/src/help/rounds.ts`, `apps/web/src/help/powers.ts`, `apps/web/src/help/settings.ts`, `apps/web/src/i18n.ts`, `apps/web/src/screens/HostSurvival.tsx`
- Test: `apps/web/src/help/host-help.test.ts`

**Interfaces:**
- `ROUND_HELP.survival`:
  - **title** `'Вибування'`.
  - **what:** «Усі відповідають на запитання, а хто помилився чи змовчав, стає “на межі” й проходить випробування. Хто його не пройде, стає привидом: дивиться й відповідає для себе, але балів не отримує.»
  - **how:**
    - «Живі отримують те саме запитання; бали — як у класиці.»
    - «Після “Показати відповідь” сцена підсвічує тих, хто “на межі”: помилилися, відповіли частково чи не відповіли (зокрема випали зі зв'язку). Текстову відповідь ще можна зарахувати вручну — це рятує від межі.»
    - «Ви натискаєте “Далі” — починається випробування з драматичною заставкою. Питання на виживання: одне для всіх “на межі”, хто помилився чи змовчав — вибуває. Удача: кожен вибирає одні з трьох дверей, за одними — пастка (у кожного своя, випадково); хто вибрав пастку — вибуває.»
    - `` `На двері — ${LIMITS.survivalLuckSeconds} секунд; хто не вибрав, за того двері виберуться самі. На питання — його власний час.` ``
    - «Випробування закривається, щойно відповіли всі “на межі”, коли сплив час або коли ви натиснете “Закрити випробування”. Пауза зупиняє відлік і заставку.»
    - «Відповідь на текстове питання на виживання можна зарахувати чи відхилити, поки на сцені результат випробування (до “Далі”).»
    - «Якщо помилилися всі, хто живий, ніхто не вибуває й випробування немає.»
    - «Коли питання на виживання скінчаться, випробуванням стає удача.»
    - «Раунд закінчується, щойно після вибування лишилося стільки живих, скільки ви задали (або менше), чи коли скінчилися запитання. Випробування буває й після останнього запитання.»
  - **points:**
    - «Живі отримують бали, як у класиці: множник, мінус за помилку, частково, серії й бонус за швидкість раунду діють.»
    - «Хто дожив до кінця, отримує бонус виживання.»
    - «Привиди балів не отримують; їхні відповіді не впливають на точність, серії й досягнення. Сцена лише показує, скільки привидів відгадали.»
    - «Питання на виживання балів не дає — воно лише вирішує, хто лишиться.»
  - **tip:**
    - «Для швидкого раунду ставте “лишається 1” і удачу; для чесного — питання на виживання, простіші за основні.»
    - «Додайте кілька питань на виживання: коли вони скінчаться, буде удача.»
    - «Бонус виживання робить кінець раунду напруженим — ставте його відчутним.»
  - **limits:**
    - `` `${LIMITS.minSurvivalQuestions}–${LIMITS.maxSurvivalQuestions} запитань і до ${LIMITS.maxSurvivalTrials} питань на виживання: один варіант, так/ні, число, текст, повзунок.` ``
    - «Питання на виживання — без відео, аудіо й проявлення.»
    - «Бафи й дуелі в цьому раунді не діють; оголошена раніше дуель почнеться після раунду.»
    - «Дебафи (від ведучого й з крамниці) діють, але лише на живих: на привида наслати дебаф не можна, а той, що чекав на нього, спрацює в наступному раунді. Привиди можуть купувати дебафи для живих.»
    - «Між запитаннями сцена показує “живі / привиди”, а не таблицю; кнопка “Таблиця” в телефоні працює.»
    - «Якщо гравців від початку не більше, ніж має лишитися, раунд іде до кінця запитань.»
    - «Завершити раунд посеред запитання — як у класиці, без випробування; посеред випробування — як кінець часу. Живі отримують бонус.»
- Пов'язані записи:
  - `help/powers.ts`: `EXCL` — «…у фіналі, у “Ва-банк” і “Вибуванні”, на запитаннях…». Записи дебафів (розділ «Обмеження», якщо є) — «у “Вибуванні” не насилаються на привидів».
  - `i18n.ts`: `buffHelpNone` узгодити з `EXCL` («…“Ва-банк”, “Вибування”, …»). Знайти й доповнити інші переліки «де не діє» (`grep -n "Ва-банк" apps/web/src/i18n.ts` — тексти крамниці, дуелей, гайда).
  - `help/settings.ts`:
    - `leaderboard` — «у “Вибуванні” між запитаннями завжди сторінка “живі / привиди”»;
    - `speedBonus`, `penalty`, `partial`, `streak`, `multiplier` — «у “Вибуванні” діють, як у класиці»;
    - `debuffShop` — «у “Вибуванні” купується, але не на привидів»;
    - `duels` — «у “Вибуванні” дуелі не оголошуються й не починаються; оголошена раніше почнеться після раунду»;
    - `spares` — «запасні для бафу “Заміна” — не те саме, що питання на виживання раунду “Вибування”».
  - `help/rounds.ts`: `round.classic` (`tip`) — «“Вибування” — окремий тип раунду, де помилка загрожує вибуванням».
- `HostSurvival.tsx`: «ⓘ» з `round.survival` біля заголовка панелі (якщо ще немає з задачі 8).

- [ ] **Step 1: Write the failing tests** (`host-help.test.ts`):
  - наявні загальні тести (кожен тип раунду має запис, назва = `t(ROUND_NAMES.survival)`, теми за `ROUND_TYPES`) покривають `round.survival` самі. Додати:
    - `expect(text('round.survival')).toContain(String(LIMITS.survivalLuckSeconds))`, `.toContain(\`${LIMITS.minSurvivalQuestions}–${LIMITS.maxSurvivalQuestions}\`)`, `.toContain('виберуться самі')`, `.toContain('ніхто не вибуває')`, `.toContain('привид')`;
    - кожен баф: «Обмеження» містить «Вибуванні» (через оновлений буквальний `EXCL`);
    - `setting.debuffShop`, `setting.duels`, `setting.leaderboard`, `setting.speedBonus` згадують «Вибуванні»;
    - `setting.spares` згадує питання на виживання;
    - `searchHelp('вибування')` містить `round.survival`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/help` → FAIL.
- [ ] **Step 3: Implement.** Тексти звірити з рушієм (задачі 2–4): двері самі, мовчання в питанні вибиває, усі помилилися — ніхто не вибуває, кінець за N після вибування, бонус коригуванням, дебафи лише на живих.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "docs(web): host help for survival (the edge, survival question or luck with doors that pick themselves, nobody out when everyone erred, ghosts without points, the end at N survivors with a bonus, classic rules, no buffs or duels, debuffs on the living only); buff, debuff, duel, leaderboard, rules and spares entries updated; ⓘ on the host survival panel"
  ```

### Задача 11. Наскрізний сценарій 10h з кадрами

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–10. Помічники:
  - `open`, `register`, `join`, `shot`, `afterSplash`, `expectNoSideScroll`, `expectStageFits`, `field`, `click`;
  - `snapshot`, `socketFrames`, `framesBeforeReveal`, `scoreOf`, `totalOf`, `toNextQuestion`, `makeRoundsQuiz`;
  - `rigged` (черга чисел для `rng` сервера).
- Нові помічники у файлі:
  ```ts
  /** Підкладає пастки й запасні двері для наступного випробування-удачі: пари [trap, fallback] у порядку гравців «на межі». Двері d → грань 2d + 1 (rng = 2d/6 + 0.01 → ⌊·3⌋ = d). */
  function rigDoors(...pairs: [number, number][]): void;
  /** Натискає двері n (0…2) на телефоні. */
  async function pickDoor(page: Page, door: number): Promise<void>;
  /** Група, у якій стоїть нікнейм на дошці «живі / привиди» (сцена чи пульт): «Живі», «На межі» чи «Привиди». */
  async function survivalGroupOf(page: Page, nickname: string): Promise<string>;
  ```
  - *Важливо:* `rigDoors` викликати **безпосередньо перед** натиском «Далі» на розкритті, що відкриває удачу: на цьому кроці `rng` тягне лише випробування (раунд без перемішування).

- [ ] **Step 1: Add the scenario** у кінець файлу за зразком 10g:
  ```ts
  it('part 10h: survival — the editor builds a survival round with trials, bonus and survivors (375 px too), a mistake puts players on the edge, a survival question knocks one out, a ghost answers for herself without points, everyone wrong means nobody is out, luck with doors when trial questions run out (a trap picked, a door that picks itself), the round ends at one survivor with the bonus, no buffs, debuffs only on the living, the board instead of the leaderboard, nothing leaks before the reveal or the trial closing, survival details in the history', async () => {
    try {
      await survivalGame();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Підготовка `survivalGame()`:**
  1. `const host = await open('host10h', 1280, 900); await register(host, 'host', 'Ірина Ведуча', 'host10h@example.com');`
  2. Вікторина «Вибування 10h» через `POST /api/quizzes`. `settings: { leaderboard: 'each', buffs: ['double'], debuffs: ['fog'] }`. Один раунд `rs` «Вибування» «Хто лишиться», `speedBonus: false`, `shuffleOptions: false`, `DEFAULT_RULES`, `trial: 'question'`, `survivors: 1`, `bonus: 500`:
     - `s1` single «Столиця Канади?» (Оттава / Торонто / Монреаль), 100;
     - `s2` boolean «Сонце — зірка», true, 100;
     - `s3` numeric «Скільки сантиметрів в одному метрі?», 100, допуск 0, 100;
     - `s4` single «Найбільша планета Сонячної системи?» (Юпітер / Сатурн / Марс), 100;
     - `s5` text «Столиця Туреччини?», `['Анкара']`, 100;
     - кожне з `timeLimit: 20`;
     - питання на виживання — **одне**: `t1` boolean «Вода кипить при 100 °C на рівні моря», true, `timeLimit: 15`.

  **Кроки з перевірками й кадрами (у такому порядку):**
  1. **Редактор (1280 × 900).** «Редагувати» у «Вибування 10h»:
     - вкладка «Хто лишиться»: блок «Вибування» з «ⓘ», «Питання на виживання» вибрано, «Скільки має лишитися» = 1, «Бонус виживання» = 500, одне питання на виживання; є «Мінус за помилку» → кадр `p10h-editor-survival`;
     - вибір типу запитання має рівно 5 типів;
     - «+ Раунд» → «Вибування» → новий раунд із трьома запитаннями й двома питаннями на виживання → кадр `p10h-editor-new-survival`; перемкнути «Удача»; прибрати новий раунд;
     - 375 × 812: `expectNoSideScroll(host, 'p10h-editor-survival-375')` → назад 1280 × 900;
     - «Зберегти» без змін → `/quizzes`.
  2. **Гра.**
     - «Грати» → `code`, `stageUrl`; `stage = open('stage10h', 1280, 720)`; `socketFrames(stage)`.
     - `olya`, `petro`, `vira`, `hlib` — `open(…, 375, 812)`, `join` («Оля», «Петро», «Віра», «Гліб»); `socketFrames` кожного.
     - «Почати гру» → `afterSplash`.
  3. **Intro.** Сцена: дошка з чотирма живими, «Лишиться 1 · бонус 500» → кадр `p10h-stage-intro` (`expectStageFits`). «Почати раунд» → `afterSplash`.
  4. **s1 — питання на виживання.**
     - Телефон Олі: ряд бафів, «Подвійні бали» вимкнено з «У «Вибуванні» бафів немає.» → кадр `p10h-phone-no-buffs`.
     - Пульт: меню гравця Петра має дебафи (живий).
     - Оля, Петро, Віра «Оттава», Гліб «Торонто».
     - **Перевірка витоку:** `framesBeforeReveal` кадрів сцени й Гліба для s1 не містять `"status":"edge"`.
     - reveal → сцена: Гліб «на межі» → кадр `p10h-stage-edge`; телефон Гліба `survivalEdge`.
     - «Далі» → заставка «Випробування!» → кадр `p10h-stage-trial-splash` (`shot(stage, …, { splash: true })`) → `afterSplash(stage, hlib)`.
     - Сцена: питання на виживання, «Відповіли 0 з 1» → кадр `p10h-stage-trial-question` (`expectStageFits`). Пульт: «Закрити випробування».
     - **Перевірка витоку:** у кожному кадрі сцени й Гліба, де `survival.trial.stage === 'open'` (розібрати JSON кадру), `trial.reveal === null`, а `trial.question` не має ключа `correct`.
     - Телефон Гліба: питання → кадр `p10h-phone-trial` + `expectNoSideScroll(hlib, …)`; Гліб «Ні» → випробування закрилося саме → телефон `survivalOut` → кадр `p10h-phone-out`; сцена: Гліб у «Привиди» (`survivalGroupOf(stage, 'Гліб')`).
     - «Таблиця» на телефоні Віри відкривається й показує рахунок → закрити.
     - Пульт: меню гравця Гліба без дебафів.
  5. **s2 — помилилися всі живі, привид відгадав.**
     - Телефон Гліба: `survivalGhostBanner` і поле → кадр `p10h-phone-ghost`; Гліб «Так» (правильно).
     - Оля, Петро, Віра «Ні».
     - reveal → сцена `survivalGhostHits` «Привиди: 1 з 1 відгадали» → кадр `p10h-stage-ghost-hits`; телефон Гліба `survivalGhostRight`, без «+».
     - «Далі» → без заставки, сцена `survivalAllWrong` → кадр `p10h-stage-all-wrong`; живі ті самі троє.
     - `scoreOf(host, 'Гліб')` = 0.
  6. **s3 — удача, бо питання на виживання скінчились.**
     - Оля «100», Петро «90», Віра «50».
     - reveal → «на межі» Петро й Віра.
     - `rigDoors([0, 1], [2, 0])` → «Далі» → `afterSplash` → телефон Петра: `survivalFellBack`, три двері, `survivalDoorDefault` → кадр `p10h-phone-doors` + `expectNoSideScroll(petro, …)`.
     - **Перевірка витоку:** у кожному кадрі сцени й Петра, де `survival.trial.stage === 'open'`, усі `rows[].door.trap` — `null` (рядки не містять `"trap":0`, `"trap":1`, `"trap":2`).
     - *Номери дверей у тексті інтерфейсу й історії — з 1; у даних — з 0.*
     - Петро двері 1 (`pickDoor(petro, 0)`), Віра двері 2 (`pickDoor(vira, 1)`) → закрилося саме.
     - Сцена: у Петра «Пастка!» на вибраних, у Віри — ні → кадр `p10h-stage-doors` (`expectStageFits`); телефон Петра `survivalOut`, Віри `survivalSafe` → кадр `p10h-phone-safe`.
     - Пульт: «Наступне запитання».
  7. **s4 — двері вибираються самі, кінець раунду.**
     - Оля «Юпітер», Віра «Сатурн»; привиди Петро й Гліб відповідають «для себе».
     - reveal → «Далі» з `rigDoors([1, 1])` → `afterSplash`; Віра не вибирає; пауза на пульті → відлік на телефоні Віри стоїть (дві перевірки тексту з інтервалом 1,5 с однакові) → «Продовжити» → чекати кінця 10 с.
     - Сцена: у Віри двері 2 «вибрано самі» й «Пастка!»; Віра в «Привиди».
     - Пульт: «Підсумки раунду» → кадр `p10h-host-ending`. Натиснути → `finished` (останній раунд; заставка «Підсумки»).
     - Рахунки: `scoreOf(host, 'Оля')` = 800 (100 + 100 + 100 + бонус 500), `Петро` = 100, `Віра` = 100, `Гліб` = 0.
     - Телефон Олі `survivalBonusGot` «+500» → кадр `p10h-phone-bonus`; телефон Віри `survivalOutAfter` «після запитання 4».
  8. **Історія.** Пульт → «Мої ігри» → «Вибування 10h»:
     - у s1 — «Питання на виживання: Вода кипить…», «Гліб — вибув(-ла)»;
     - у s2 — «Помилилися всі — ніхто не вибув», «Привиди: 1 з 1 відгадали»;
     - у s3 — «Удача (питань не лишилося)», «Петро — вибув(-ла)» з дверима й пасткою, «Віра — вижив(-ла)»;
     - у s4 — «двері 2 (самі), пастка 2»;
     - «Бонус виживання: Оля +500» → кадр `p10h-history`.
- [ ] **Step 2: Run** `pnpm build`, потім у фоні `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 10h"` → PASS. Переглянути кадри `p10h-*`: дошка й двері читаються з 3 м, двері на телефоні великі, нічого не обрізано, заставка драматична.
- [ ] **Step 3: Повний прогін** у фоні (≈ 11 хв): `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts` → усі сценарії PASS.
- [ ] **Step 4: Commit**
  ```bash
  git add apps/server/e2e
  git commit -m "test: part 10h end-to-end — the editor builds a survival round (375 px too); a survival question knocks a player out; a ghost answers for herself without points; everyone wrong means nobody is out; luck with doors once trial questions run out, a trap picked and a door that picks itself; the round ends at one survivor with the bonus; no buffs, debuffs only on the living; nothing leaks before the reveal or the trial closing; survival details in the history"
  ```
