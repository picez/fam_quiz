# План 11g: Гра без ведучого — рушій і сервер («автопілот»)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 11g специфікації `docs/superpowers/specs/2026-10-25-after-formats-design.md` (розділ 11, п. 8 побажань; рішення автора — розділ 14; відповіді власника — розділ 15). Кімната може бути в режимі **«автопілот»**: пульта немає, гру веде сервер. Він відкриває запитання, чекає таймера чи «відповіли всі», закриває, розкриває, показує таблицю й іде далі. Те, що зазвичай вирішує ведучий, автопілот вирішує лише за ключем відповіді, таймером чи жеребом, ніколи «на смак».
- **Рушій:**
  - позначка автопілота в стані гри з автором, миттю наступного кроку, залишком на паузі й причиною паузи;
  - час кожного етапу (таблиця розділу 11, п. 2) поверх мінімального часу 11b;
  - типові вибори замість ведучого (п. 4): кубики, хід на полі, категорія дуелі, рішення «Мільйонера», формування команд;
  - пауза, коли на зв'язку нікого, і продовження через 3 с після повернення першого гравця (зокрема після перезапуску);
  - перевірка сумісності вікторини (п. 6) і перетворення: «вголос» → «з телефона», ручна перевірка → за ключем, «ведучий вибирає» учасника «Мільйонера» → жереб.
- **Сервер:**
  - створення кімнати-автопілота, у якій автор одразу гравець;
  - жодного токена й зрізу ведучого (п. 7);
  - таймер автопілота поруч із таймером рушія;
  - дії автора з телефона: старт, пауза й продовження, вилучення, «Завершити гру», спосіб формування команд, приховати слово «хмари», прибрати вигадку блефу (п. 8). Решта — `not_allowed`;
  - маршрут перевірки сумісності для 11h.
- **Інтерфейсу немає.** Кнопка «Провести ботом», меню «⋯», «Почати гру» в лобі, «Гру веде бот» на сцені, позначка в історії й довідка — це 11h. У 11g веб змінюється лише там, де цього вимагає `pnpm typecheck`: нові поля фікстур, текст причини бафа й неактивна підказка драбини (задача 3).

**Стан гри змінюється: `GAME_STATE_VERSION` 13 → 14.** Нове необов'язкове `GameState.autopilot`. Версія 13 лишається в `READABLE_STATE_VERSIONS`: без ключа гра — з ведучим, як і була. Тож живі ігри деплой переживають. Перед пушем діє правило 14a підпроєкту 10: перевірити `live_room` (кімнати версії 13 мають підніматися після розгортання). Міграцій бази немає, `SavedRoom` не змінюється: автопілот живе в стані.

**Архітектура:**
- **Shared.**
  - Новий `packages/shared/src/autopilot.ts`:
    - `AUTOPILOT_MS` — час етапів;
    - `AUTOPILOT_CHANGES` / `AutopilotChange`, `AutopilotBlock`, `AutopilotIssue`, `AutopilotCheck`;
    - чисті `autopilotCheck(quiz)`, `autopilotQuiz(quiz)`, `autopilotIntroMs(round)`.
  - `game.ts`: `BuffBlock` + `'unfit_host'`.
  - `views.ts`:
    - `LadderLifelineView.state` + `'off'`;
    - `BaseView.autopilot: boolean`;
    - `PlayerView.author: AuthorView | null` (`AuthorView`, `AuthorCloudWord`, `AuthorBluffOption`).
- **Рушій.**
  - `game.ts`: `AutopilotState` і `GameState.autopilot?`.
  - Новий `packages/engine/src/autopilot.ts`:
    - `createAutopilotGame`, `isAuthor`, `anyonePresent`;
    - `autopilotStart`, `authorPause`, `authorResume`;
    - `pilotKey`, `autopilotDue`, `planAutopilot`, `pilotStep`;
    - `suspendAutopilot`.
  - `buffs.ts` і `ladder.ts`: підказка без тексту в автопілоті недоступна.
  - `restore.ts`: версія 14, `suspend` → `suspendAutopilot`.
  - `views.ts`: `autopilot` у `base`, `author` у зрізі гравця, `'off'` у підказках драбини.
  - Новий `packages/engine/src/testing/autopilot.ts`: драйвер, що імітує сервер (тік рушія, крок і план автопілота) для наскрізних тестів рушія.
- **Сервер.**
  - `apps/server/src/rooms/manager.ts`:
    - `createAutopilot`, `author`;
    - таймер `pilot`, обов'язкова мітка кроку (`stamp`) і `planAutopilot` у `commit`;
    - без ролі `host`, без `hostLeft`, 30 хв без гравців → «Завершити гру»;
    - `hostOnline` → `true`.
  - `apps/server/src/socket.ts`: події `host:*` від гравця в автопілоті йдуть у `manager.author`.
  - `apps/server/src/account-routes.ts`:
    - `POST /api/games` з `autopilot: true` і `nickname`;
    - `GET /api/quizzes/:id/autopilot`;
    - `host-access` для автопілота → 404.
- **Наскрізні тести.** Два сценарії «part 11g: …»: гравці й автор — сокети без браузера (як `socketPlayer` у 11f), сцена — сторінка браузера 1280 × 720 для кадрів `p11g-`.

**Технології:** TypeScript, zod, vitest, Fastify + Socket.IO, Drizzle + PGlite, React 19 (лише фікстури), Playwright (лише сцена). Нових залежностей немає.

**Рішення плану там, де специфікація мовчить (координатор може змінити):**

*Стан (`AutopilotState`)*
- `{ authorId: string; at: number | null; left?: number; hold?: 'nobody' | 'author'; starting?: true }`:
  - `authorId` — id людини, що створила кімнату (соло — гравець; у командній грі — учасник `teams.members`);
  - `at` — мить наступного кроку автопілота (чи продовження після паузи «нікого»); `null` — чекати нічого: рушій сам закриє таймером, гравці ще не вирішили, автор поставив паузу;
  - `left` — залишок до кроку, що стояв на момент паузи; є лише на паузі;
  - `hold` — хто поставив паузу: `'nobody'` (на зв'язку нікого чи перезапуск) — автопілот продовжить сам; `'author'` — лише автор. Без паузи ключа немає;
  - `starting` — автор натиснув «Почати гру» в командній грі з кубиками: гра стартує сама, щойно тур закриється.
- Сервер не має окремого поля «автопілот» у `Room`: ознака — `room.state.autopilot !== undefined`.

*Перетворення вікторини (`autopilotQuiz`) і перевірка (`autopilotCheck`)*
- Перетворення робиться один раз, під час створення кімнати; у `state.quiz` лежить уже перетворена вікторина. Рушій потім грає звичайні правила «з телефона» і «за ключем». Окремих гілок «якщо автопілот» для оцінки немає: кроки йдуть тими самими функціями, що й кнопки ведучого.

  | Код зміни | Де | Перетворення |
  |---|---|---|
  | `voice` | раунд поля з `answerMode: 'voice'` або клітинкою `answerMode: 'voice'` | раунд і клітинки → `'phone'` (усний бліц-клітинка теж: її `check` стає `round.check`) |
  | `manual` | раунд `blitz`, `board` чи `final` з `check: 'manual'` | → `'auto'` (миттєва перевірка; «Прийняти / Перевибрати» не виникає) |
  | `ladder_pick` | раунд `ladder` з `pick: 'host'` | → `'random'` |
  | `hint` | баф `hint` у `settings.buffs` і раунд `classic`/`board`, де хоч одне запитання (клітинка) без `hint`; або раунд `ladder` з підказкою `hint` і запитанням без `hint` | без перетворення: така підказка в грі недоступна (задача 3) |
  | `untimed` | запитання з відео в будь-якому раунді (і клітинки поля) або раунд `ladder` з `timer: false` | без перетворення: автопілот закриває через `question.timeLimit` с від старту |

- `rounds` — 0-базові індекси раундів за зростанням, без повторів; зміна без раундів не потрапляє в список. Порядок `changed` — порядок `AUTOPILOT_CHANGES`.
- `blocked` для наявних форматів завжди `[]`. `AutopilotBlock` — порожній перелік (`never`), щоб майбутній формат додав своє слово.
- Перетворена вікторина проходить `quizSchema` (тест на фікстурах усіх форматів).

*Час етапів (`AUTOPILOT_MS`, `autopilotDue`)*
- Відлік іде від `from`: миті, коли почався поточний підкрок автопілота (`planAutopilot` бачить зміну `pilotKey`). Крок ніколи не раніший за вікно 11b: `at = max(from + час, paceWindow(state, дія)?.until ?? 0)`, де дія — `'next'`, `'lock'` чи `'skip'` за таблицею.

  | Стан | Через | Дія автопілота |
  |---|---|---|
  | лобі, тур кубиків команд триває | 15 с від туру (`teamDice`) | `rollTeamRest` |
  | лобі, `starting`, тур не триває | одразу | `start` (і `starting` геть) |
  | `guide`, кожна сторінка | 8 с (`guide`) | `next` |
  | `intro` (заставка раунду) | `autopilotIntroMs(round)` від кінця заставки раунду (`paceWindow(state, 'next').from`; без `stepAt` — `from`) | `next` |
  | `intro` поля, `board.dice === null` і ≥ 2 гравців | одразу | `startDice` (кидки стартують самі) |
  | `intro` поля, тур кубиків триває | 10 с від туру (`boardDice`) | `rollForRest` |
  | `intro` «Мільйонера» з учасником (`ladder.drawn` чи `contestantId`) | 4 с (`introDrawn`) | `next` (перше запитання) |
  | `wager` (ставки фіналу) | 30 с (`wager`); усі поставили — рушій відкриває сам | `next` |
  | `question` з таймером | — (рушій: таймер чи «відповіли всі») | — |
  | `question` без таймера (`!timedPlay(play)`) | `startedAt + question.timeLimit × 1000` (без поля — 30 с, `untimed`) | `lock` |
  | `locked` | 1,5 с (`locked`) | `next` |
  | `reveal` «100 до 1» чи блефу, ще є рядки | 1,5 с (`row`; перший рядок — 2 с через `PACE_MS.step`) | `next` (наступний рядок) |
  | `reveal` «100 до 1» чи блефу, усі рядки відкрито | 4 с (`rowsTail`) | `next` |
  | `reveal` фіналу (кожен гравець, розподіл банку, вихід) | 3 с (`finalRow`) | `next` |
  | `reveal` решти | 6 с (`reveal`) | `next` |
  | `leaderboard`: відкрите вікно «Ва-банк» чи випробування «Вибування» | — (рушій: `tick`) | — |
  | `leaderboard`: «Мільйонер», учасник ще не вирішив | 30 с (`ladderDecision`) | `decideLadder(state, 'host', true, now)` («Забираю») |
  | `leaderboard`: екран рішень «Ва-банк» (`decisionsShown`) | 4 с (`decisions`) | `next` |
  | `leaderboard`: решта (таблиця, вердикт «Вибування», підсумок драбини) | 5 с (`leaderboard`) | `next` |
  | `board` (вибір клітинки) | 30 с від початку ходу (`boardTurn`) | `skipTurn` |
  | `round_end` | 8 с (`roundEnd`) | `next` |
  | `duel`, етап `category` | 15 с від кінця заставки «Дуель!» (`duelCategory`) | `pickDuelCategory(state, null, випадкова категорія з left > 0, …)`; таких немає — `cancelDuel` |
  | `duel`, етап `question` | — (рушій: `tickDuel`) | — |
  | `duel`, етап `answer` | 4 с (`duelAnswer`) | `next` |
  | `duel`, етап `result` | 5 с (`duelResult`) | `next` |
  | `lobby` без кубиків, `finished` | — | — |

- `autopilotIntroMs(round)` = `min(20 000, 8000 + 1000 × ⌈довжина опису / 60⌉)`; без опису — 8000. Довжина — `description.trim().length`.
- Значення, яких немає в таблиці специфікації (будівельник може їх уточнити, розділ 13):
  - 30 с на ставки фіналу;
  - 30 с на хід на полі, навіть коли гравець на зв'язку. Інакше гравець, що мовчить, зупинив би поле назавжди. Ведучий у звичайній грі натиснув би «Пропустити», а автопілот робить те саме за таймером;
  - 4 с після жеребу «Мільйонера»;
  - 4 с на відповідь і 5 с на підсумок дуелі;
  - 3 с на крок розподілу банку фіналу.
- Запитання без таймера: у специфікації — «час клітинки чи раунду, а якщо його немає — 30 с». `timeLimit` у схемі обов'язковий, тож це завжди `question.timeLimit`. 30 с лишається лише запобіжником для сирого запису без поля.
- Відео не має тривалості в схемі: автопілот не чекає кінця ролика. Зміна `untimed` у перевірці сумісності про це попереджає.

*Пауза й продовження*
- **Нікого на зв'язку** (`anyonePresent` = хтось із `players` у соло чи з `teams.members` у командній грі має `connected: true`):
  - на будь-якому етапі, крім `lobby` і `finished`, `planAutopilot` одразу ставить `pause` з `hold: 'nobody'`;
  - хтось повернувся → `at = now + 3000` (`resume`); у цю мить `pilotStep` робить `resume`, якщо хтось і далі на зв'язку;
  - знову всі пішли до кінця відліку → `at: null`.
- **Перезапуск сервера:** `suspend` (як і раніше) ставить паузу. Гра, що йшла, отримує `hold: 'nobody'` і `left` = залишок до `at` на мить знімка. Гра, яку автор уже поставив на паузу, лишається з `hold: 'author'`. Далі діє правило «нікого на зв'язку».
- **Пауза автора** (`authorPause`): `hold: 'author'`, сам автопілот не продовжує. Продовжує лише `authorResume`. На паузі «нікого» (`hold: 'nobody'`) автор (він на зв'язку, бо надсилає дію) теж може продовжити одразу.
- **Залишок:** перехід «йде → пауза» записує `left = max(0, at − now)` (якщо `at` було) і `at: null`. Перехід «пауза → йде»:
  - той самий `pilotKey` → `at = max(now + left, вікно 11b)`;
  - змінився (наприклад, на паузі вилучили гравця, чий хід) → `autopilotDue` наново.
- **30 хв без жодного гравця на зв'язку** (у грі, не в лобі) → сервер робить «Завершити гру» (`AUTOPILOT_EMPTY_MS`), так само як 10 хв без ведучого у звичайній грі. Специфікація посилається на «наявне правило», але для ігор посеред гри такого немає (є лише TTL лобі 2 год і фінішу 30 хв). Тому план додає його за зразком `HOST_ABSENCE_MS`. Лобі закриває наявний `LOBBY_TTL_MS`.

*Без зациклення*
- `pilotStep` завжди повертає стан з `at: null`, і вдалий, і невдалий. Нову мить ставить лише `planAutopilot`, коли змінився `pilotKey` (чи пауза). Тож дія, що не вдалася (`deciding`, `dice_pending` тощо) або нічого не змінила, ніколи не повторюється в циклі. У найгіршому разі гра стоїть, і це ловить наскрізний тест рушія (задача 5) на кожному форматі з гравцями, що мовчать.
- `pilotKey(state)` = `stepKey(state)` + `board?.dice?.tourNo` + чи триває тур поля + `teams?.dice?.tourNo` + чи триває тур команд + `autopilot.starting` (без `paused`, `at`, `left`, `hold`).

*Автор*
- Кімнату створює `POST /api/games` з `{ quizId, autopilot: true, nickname }` від власника вікторини (вхід обов'язковий, як і зараз). Відповідь `201`: `{ gameId, code, stageToken, token, playerId }`. `hostToken` немає. Автор — звичайний гравець (`playerUsers` → його акаунт: результат рахується в профілі, відповідь власника 2). `room.hostUserId` = автор (власник запису історії; позначку «Провів бот» і виключення з «Проведених ігор» додає 11h).
- Сервер приймає від автора (подіями `host:*` з його сокета гравця):
  - `start` → `autopilotStart`:
    - соло → `start`;
    - команди `'host'` чи `'random'` → `dealTeams` у мить старту, потім `start`;
    - `'pick'` → `start` (без команди — у найменші, як і зараз);
    - `'dice'`: тур ще не був (`teams.dice === null`), а хтось без команди → `startTeamDice` + `starting: true` (гра стартує сама, щойно тур закриється). Інакше → `start`;
  - `pause` / `resume` → `authorPause` / `authorResume`;
  - `end` → `end`;
  - `kick` → як у ведучого. Себе вилучити не можна: `not_allowed`;
  - `team-form` → `setTeamForm`, лише в лобі. Спосіб формування в звичайній грі вибирає ведучий, тож інакше рядки «ведучий розподіляє» й «кубики» з таблиці п. 4 не мали б сенсу;
  - `cloud-hide` → `hideCloudWord`, **лише на `reveal`** (поки «хмару» видно на сцені; інакше `wrong_phase`);
  - `bluff-remove` → `removeBluffOption` (рушій сам пускає лише на етапі вибору).
- Будь-яка інша дія від автора → `not_allowed`. Будь-яка дія `host:*` від іншого гравця кімнати-автопілота → `not_allowed`. У звичайній кімнаті гравець, як і досі, отримує `forbidden`.
- Прибрати правду чи запасний варіант блефу рушій не дає (`not_allowed`). Ця відповідь розкриває, що варіант — правда, але автор і так знає відповіді («Ти автор і знаєш відповіді — грай чесно», 11h). Тому окремого приховування немає.
- Капітан команди — «вибраний чи перший» (`captainOf`), тобто перший, хто приєднався: коду не треба, лише тест.
- `hostOnline` у `StateMeta` для автопілота — `true`: телефони й сцена не показують «Чекаємо ведучого». На паузі видно звичайне «Пауза».

*Що бачить автор (`PlayerView.author`)*
- `null` — глядач не автор або гра з ведучим. Автор отримує об'єкт завжди, і в лобі теж: так 11h знає, де показати «Почати гру» й «⋯».
- `cloud` — лише на `reveal` «хмари слів»: слова, які показує сцена (несховані, найчастіші `LIMITS.cloudShown`), плюс сховані (щоб повернути), у порядку `cloudTally`; `{ key, text, count, hidden }`, **без авторів**. Інакше `null`.
- `bluff` — лише на етапі `question` блефу у фазі `choice`: неприбрані варіанти `{ id, text }` у порядку показу, **без `kind` і авторів**. Інакше `null`.
- Сцена працює як завжди, а її `base` має `autopilot: true` (для «Гру веде бот» в 11h). Пульта в автопілоті немає взагалі, тож `hostView` ніхто не отримує: ні відповідей наживо (11c), ні ключа, ні чернеток.

*Звук*
- Пульта немає, тож «±15 с» і повтор звуку зникають самі (`host:time` і `host:audio` від автора → `not_allowed`). Програвання звуку на телефонах без сцени — це інтерфейс 11h. Дані вже є: `StateMeta.stageOnline` і `audio` у публічному запитанні.

*Чого не робимо*
- інтерфейсу запуску, меню «⋯», «Почати гру», «Гру веде бот», позначки в історії, виключення з «Проведених ігор» і досягнень ведучого, сторінки довідки — усе це 11h;
- голосування гравців за усні відповіді, бота-гравця, фільтра слів (не-цілі розділу 2);
- коригувань, дебафів від ведучого, «±15 с», пропуску запитання дуелі в автопілоті;
- змін `recorder.ts`, `history.ts`, схеми бази, `SavedRoom`;
- нового демо-вмісту (тексти тестів — без тем росії й СРСР).

## Глобальні обмеження

- **Анти-цілі:**
  - в автопілоті нікому не дістаються `hostView`, відповіді наживо, ключ чи чернетки команд, і автору теж. Перевіряють: задача 6 (зріз автора без `kind`/`by`/`correct`), задача 7 (`identify` ролі `host` → `null`), задача 8 (сокет ролі `host` не підключається; `host:*` від гравців → `not_allowed`), задача 9 (жоден кадр жодного сокета не містить `"role":"host"` чи `"live":{`);
  - автопілот не робить кроку раніше за вікно 11b (`tooSoon(state, дія, at) === false` у задачі 4);
  - пауза, «Завершити гру» й вилучення не затримуються;
  - старі кімнати (версія 13) відновлюються й лишаються «з ведучим».
- Кроки автопілота йдуть **тими самими функціями рушія**, що й кнопки ведучого (`next`, `lock`, `skipTurn`, `startDice`, `rollForRest`, `rollTeamRest`, `dealTeams`, `start`, `pickDuelCategory`, `cancelDuel`, `decideLadder`, `pause`, `resume`, `end`). Нових правил балів немає.
- Бали, `withTotals`, `recorder.ts`, схема бази не змінюються. Звичайна гра з ведучим поводиться точно як раніше. Наявні тести рушія, сервера й вебу зелені без правок, крім навмисних, перелічених у «Порядку збирання».
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`.
- **TDD:** кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені:
  - `pnpm typecheck`;
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=2 apps/web`;
  - `pnpm vitest run --maxWorkers=1 apps/server`.
- Наскрізні тести: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 11g"`.
  - **Повний прогін триває близько 32 хвилин, і машині може забракнути пам'яті.** Задача 9 запускає свої сценарії, а повний прогін — **один раз у фоні** наприкінці.
  - В e2e увімкнені затримка 11b (`pacing: true`) і заставки (`transitions: true`). Чекати — через `expect.poll` чи кадри сокетів, без снів, крім вимірювання проміжків.
  - Кадри лежать в `apps/server/e2e/artifacts/shots`, префікс 11g — `p11g-`.
- Новий вміст (тексти тестів і e2e) — без тем росії й СРСР.
- **Коміти:** кожен закінчується двома рядками-трейлерами (останній абзац повідомлення):
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  ```
  Тому коміти пишуться через `git commit -F - <<'EOF' … EOF`, як у задачах нижче.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать. Перед пушем потрібна перевірка `live_room` (правило 14a): версія стану піднімається, тож треба переконатися, що кімнати версії 13 читаються.

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/autopilot.ts` (новий), `autopilot.test.ts` (новий), `index.ts` | час етапів, перевірка сумісності, перетворення вікторини | 1 |
| `packages/engine/src/game.ts`, `autopilot.ts` (новий), `game.autopilot.test.ts` (новий), `restore.ts`, `restore.test.ts`, `index.ts` | стан автопілота, створення, старт автора, пауза автора, версія 14, `suspend` | 2 |
| `packages/shared/src/game.ts`, `views.ts`, `packages/engine/src/buffs.ts`, `ladder.ts`, `views.ts`, `game.autopilot.test.ts`, `views.ladder.test.ts`; `apps/web/src/i18n.ts`, `screens/LadderLifelines.tsx`, `LadderLifelines.test.tsx` (наявний чи новий) | підказка без тексту недоступна | 3 |
| `packages/engine/src/autopilot.ts`, `autopilot.test.ts` (новий) | `pilotKey`, `autopilotDue`, `planAutopilot`, `pilotStep`, пауза «нікого» | 4 |
| `packages/engine/src/testing/autopilot.ts` (новий), `autopilot.full.test.ts` (новий) | драйвер і наскрізні ігри всіх форматів без ведучого | 5 |
| `packages/shared/src/views.ts`, `packages/engine/src/views.ts`, `views.autopilot.test.ts` (новий); фікстури вебу (лише нові поля) | `autopilot` у зрізах, `author` у зрізі гравця | 6 |
| `apps/server/src/rooms/manager.ts`, `manager.autopilot.test.ts` (новий), `manager.restore.test.ts` | кімната-автопілот, таймер, дії автора, без пульта, 30 хв, відновлення | 7 |
| `apps/server/src/account-routes.ts`, `socket.ts`, `games.test.ts`, `socket.test.ts` | маршрути, `host:*` від автора, `not_allowed` | 8 |
| `apps/server/e2e/full-game.e2e.ts` | два сценарії «part 11g: …» | 9 |

## Порядок збирання

- 1 → 2 → 3 → 4 → 5; 6 — після 2; 7 — після 4 і 6; 8 — після 7; 9 — останньою.
- **Навмисні зміни наявних очікувань** (лише такі):
  - `restore.test.ts`: `KEYS[14]`, `STATE_SHAPE` з `autopilot` і `AutopilotState`, `READABLE_STATE_VERSIONS` до 14 (задача 2);
  - фікстури вебу з `PlayerView` / `StageView` / `HostView` (`PlayerScreen.test.tsx`, `team-test-view.ts`, `DuelView.test.tsx`, `StageScreen.test.tsx`, `HostScreen.test.tsx`, …) — плюс `autopilot: false`, а в `PlayerView` ще `author: null`. Лише там, де падає `pnpm typecheck` (задача 6);
  - якщо тест i18n вимагає текст для кожної причини `BuffBlock` — новий `buffWhy_unfit_host` (задача 3);
  - `socket.test.ts`: наявні перевірки «гравець шле `host:*` → `forbidden`» лишаються як є (звичайна кімната). Нові перевірки — для автопілота (задача 8).
  - Якщо падає інше, рецензент розбирає причину, а не правку очікування.

## На що дивитися рецензентові

1. **Ті самі функції.** `pilotStep` викликає лише функції рушія, які вже стоять за кнопками ведучого. Нових правил балів немає. Оцінка в автопілоті — звичайна оцінка перетвореної вікторини (`autopilotQuiz`).
2. **Без зациклення й без зупинки.** `pilotStep` завжди скидає `at`, а `planAutopilot` ставить нову мить лише на зміну `pilotKey` чи паузи. Задача 5 доводить кожен формат до `finished` і з гравцями, що відповідають, і з гравцями, що мовчать.
3. **11b.** Жоден крок не раніший за `paceWindow` (тест задачі 4 на кожному рядку таблиці).
4. **Таємність.** Немає ролі `host`, немає `hostView`. Зріз автора — лише те, що видно всім (без авторів слів, без `kind` варіантів блефу). Кадри задачі 9.
5. **Пауза.** «Нікого» → пауза; повернення → 3 с; перезапуск → пауза, і продовження з залишком; пауза автора не знімається сама (задачі 4, 7, 9).
6. **Сумісність станів.** Версія 13 читається й лишається «з ведучим»; `suspend` автопілота пише `hold: 'nobody'` і `left` (задача 2).

---

### Задача 1. Shared: час етапів, перевірка сумісності, перетворення вікторини

**Files:**
- Create: `packages/shared/src/autopilot.ts`, `packages/shared/src/autopilot.test.ts`
- Modify: `packages/shared/src/index.ts` (`export * from './autopilot';`)

**Interfaces:**
```ts
import type { Quiz, Round } from './quiz';

/** Час етапів гри без ведучого, мс (11g; розділ 11 п. 2 специфікації й рішення плану 11g). Відлік — від початку підкроку, не раніше вікна 11b. */
export const AUTOPILOT_MS = {
  guide: 8000,
  intro: 8000,
  /** + стільки на кожні introChars символів опису раунду (з округленням угору), разом не більше introMax. */
  introPerChars: 1000,
  introChars: 60,
  introMax: 20_000,
  /** «Мільйонер»: після жеребу учасника до першого запитання. */
  introDrawn: 4000,
  locked: 1500,
  reveal: 6000,
  /** «100 до 1» і блеф: кожен рядок чи варіант; після останнього — rowsTail. */
  row: 1500,
  rowsTail: 4000,
  /** Фінал: кожен гравець, розподіл банку, вихід. */
  finalRow: 3000,
  leaderboard: 5000,
  /** Екран рішень «Ва-банк» (11e). */
  decisions: 4000,
  roundEnd: 8000,
  /** Запобіжник для запитання без таймера, у якого немає timeLimit. */
  untimed: 30_000,
  wager: 30_000,
  boardTurn: 30_000,
  boardDice: 10_000,
  teamDice: 15_000,
  duelCategory: 15_000,
  duelAnswer: 4000,
  duelResult: 5000,
  /** «Мільйонер»: без рішення — «Забираю». */
  ladderDecision: 30_000,
  /** Після повернення першого гравця на паузі «нікого». */
  resume: 3000,
} as const;

/** Що автопілот змінює у вікторині (розділ 11 п. 6), у порядку списку. */
export const AUTOPILOT_CHANGES = ['voice', 'manual', 'ladder_pick', 'hint', 'untimed'] as const;
export type AutopilotChange = (typeof AUTOPILOT_CHANGES)[number];
/** Чого автопілот не може провести: у наявних форматах нічого; майбутній формат додає своє слово сюди. */
export const AUTOPILOT_BLOCKS = [] as const;
export type AutopilotBlock = (typeof AUTOPILOT_BLOCKS)[number];

/** Одна зміна чи блокування: 0-базові раунди за зростанням, без повторів, непорожні. */
export interface AutopilotIssue<C extends string> {
  code: C;
  rounds: number[];
}

export interface AutopilotCheck {
  blocked: AutopilotIssue<AutopilotBlock>[];
  changed: AutopilotIssue<AutopilotChange>[];
}

/** Перевірка сумісності (11g): блокування (зараз завжди []) і зміни за таблицею плану 11g. */
export function autopilotCheck(quiz: Quiz): AutopilotCheck;
/** Вікторина для автопілота: «вголос» → «з телефона», ручна перевірка → за ключем, «ведучий вибирає» учасника → жереб; решта без змін (новий об'єкт, вхід не змінюється). */
export function autopilotQuiz(quiz: Quiz): Quiz;
/** Заставка раунду в автопілоті: min(introMax, intro + introPerChars × ⌈довжина опису / introChars⌉). */
export function autopilotIntroMs(round: Round): number;
```

- [ ] **Step 1: Write the failing tests** (`autopilot.test.ts`, фікстури — з `@quiz/engine/testing` чи локальні, як у наявних тестах shared; тексти без тем росії й СРСР):
  - `AUTOPILOT_CHANGES` → `['voice', 'manual', 'ladder_pick', 'hint', 'untimed']`; `AUTOPILOT_BLOCKS` → `[]`.
  - **Класична вікторина** без відео й бафів → `{ blocked: [], changed: [] }`; `autopilotQuiz(q)` — `toEqual(q)`.
  - **Поле** раунд 1 (індекс 1) з `answerMode: 'voice'`, `check: 'manual'`; одна клітинка з власним `answerMode: 'phone'`, одна бліц-клітинка без власного:
    - `changed` → `[{ code: 'voice', rounds: [1] }, { code: 'manual', rounds: [1] }]`;
    - у `autopilotQuiz` раунд `answerMode: 'phone'`, `check: 'auto'`, жодна клітинка не має `'voice'`;
    - вхідна вікторина не змінилася (глибока копія до виклику `toEqual` після).
  - Поле з `answerMode: 'phone'` і однією клітинкою `answerMode: 'voice'` → `voice` з цим раундом; після перетворення клітинка `'phone'`.
  - **Бліц** і **фінал** з `check: 'manual'` (раунди 0 і 2) → `{ code: 'manual', rounds: [0, 2] }`; після перетворення `'auto'`.
  - **«Мільйонер»** `pick: 'host'` → `ladder_pick` і `'random'`; `pick: 'lowest'` → без змін.
  - **Підказка:**
    - `settings.buffs: ['hint']`, класичний раунд 0 з одним запитанням без `hint` → `hint` з `[0]`. Якщо всі запитання з `hint` — без зміни. Без бафа `hint` — без зміни;
    - фінал без `hint` при бафі `hint` → без зміни (бафів у фіналі немає);
    - «Мільйонер» з `lifelines: ['hint']` і запитанням без `hint` → `hint` з його індексом; з `lifelines: ['fifty']` → без зміни.
  - **Без таймера:** класичне запитання з `video` у раунді 0 і «Мільйонер» `timer: false` у раунді 3 → `{ code: 'untimed', rounds: [0, 3] }`; перетворення їх не чіпає.
  - Порядок `changed` — порядок `AUTOPILOT_CHANGES` незалежно від порядку раундів.
  - **Схема:** `quizSchema.parse(autopilotQuiz(q))` проходить для вікторини з усіма типами раундів (класика, бліц, поле з усною й бліц-клітинками, фінал, «Ва-банк», «Вибування», «Мільйонер»).
  - `autopilotIntroMs`: без опису → 8000; 1 символ → 9000; 60 → 9000; 61 → 10 000; 130 → 11 000; 600 → 18 000; опис з пробілами по краях рахується без них. Межу 20 000 перевірити напряму: тимчасово підставити об'єкт раунду з описом на 1000 символів (`as Round`) → 20 000.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared/src/autopilot.test.ts` → FAIL.
- [ ] **Step 3: Implement** `autopilot.ts`. Перетворення — через `structuredClone` чи розгортання об'єктів без зміни входу. Хід по раундах один на всі коди, щоб `rounds` йшли за зростанням.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src
  git commit -F - <<'EOF'
  feat(shared): autopilot stage times, the compatibility check (blocked and changed by round) and the autopilot quiz — voice cells answer from the phone, manual checks go by the key, the host-picked ladder contestant is drawn

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  EOF
  ```

### Задача 2. Рушій: стан автопілота, створення з автором, старт і пауза автора, версія 14

**Files:**
- Create: `packages/engine/src/autopilot.ts`, `packages/engine/src/game.autopilot.test.ts`
- Modify: `packages/engine/src/game.ts`, `packages/engine/src/restore.ts`, `packages/engine/src/index.ts` (`export * from './autopilot';`)
- Test: `packages/engine/src/game.autopilot.test.ts`, `packages/engine/src/restore.test.ts`

**Interfaces:**
- `packages/engine/src/game.ts`, поруч з іншими станами:
  ```ts
  /** Гра без ведучого (11g): автор, наступний крок, пауза. Пояснення полів — у плані 11g, «Стан». */
  export interface AutopilotState {
    /** Людина, що створила кімнату: гравець (соло) чи учасник (командна гра). */
    authorId: string;
    /** Мить наступного кроку чи продовження; null — чекати нічого. */
    at: number | null;
    /** Лише на паузі: скільки лишалося до кроку, що стояв. */
    left?: number;
    /** Лише на паузі: nobody — автопілот продовжить сам, коли хтось повернеться; author — лише автор. */
    hold?: 'nobody' | 'author';
    /** Автор натиснув «Почати гру» з кубиками команд: старт, щойно тур закриється. */
    starting?: true;
  }
  ```
  `GameState`, після `stepAt`:
  ```ts
  /** Гра без ведучого (11g); ключ є лише в кімнаті-автопілоті. Без нього — гра з ведучим (і стан до 11g). */
  autopilot?: AutopilotState;
  ```
- `packages/engine/src/autopilot.ts` (ця задача — перша частина файлу; `game.ts` цей файл не імпортує):
  ```ts
  /** Нова гра-автопілот: createGame(autopilotQuiz(quiz), options) → addPlayer(author) → autopilot { authorId, at: null }. Помилки нікнейма — з addPlayer. */
  export function createAutopilotGame(quiz: Quiz, author: { id: string; nickname: string }, options?: GameOptions): Result;
  /** Чи це автор кімнати-автопілота (у командній грі — id учасника). */
  export function isAuthor(state: GameState, personId: string): boolean;
  /** Хтось із людей на зв'язку: соло — players, командна гра — teams.members (awaiting не рахується). */
  export function anyonePresent(state: GameState): boolean;
  /** «Почати гру» від автора (правила — план 11g, «Автор»); не автопілот → not_allowed; поза лобі → wrong_phase. */
  export function autopilotStart(state: GameState, now: number, rng: Rng): Result;
  /** Пауза від автора: pause + hold 'author' (left/at ставить planAutopilot); не автопілот → not_allowed. */
  export function authorPause(state: GameState, now: number): Result;
  /** Продовження від автора: resume, hold і left геть (at ставить planAutopilot); будь-яка пауза — і «нікого» теж. */
  export function authorResume(state: GameState, now: number): Result;
  /** Для suspend: гра, що йшла (wasPaused false, не лобі й не фініш) → hold 'nobody', left = max(0, at − savedAt), at null; уже на паузі → at null; лобі — без змін. */
  export function suspendAutopilot(state: GameState, savedAt: number, wasPaused: boolean): GameState;
  ```
- `packages/engine/src/restore.ts`:
  - `GAME_STATE_VERSION = 14`, рядок у переліку: `14 — 11g: GameState.autopilot (автор, мить наступного кроку автопілота, залишок і причина паузи, старт після кубиків).`;
  - `READABLE_STATE_VERSIONS = [2, 3, …, 12, 13, GAME_STATE_VERSION]` з поясненням: «13 → 14 лише додала необов'язкове GameState.autopilot. Без нього гра — з ведучим, як і була. Тож кімната, збережена до розгортання 11g, теж відновлюється»;
  - `suspend`: запам'ятати `wasPaused = tick(state, at).paused` до паузи. Наприкінці, якщо є `autopilot`, — `suspendAutopilot(s, at, wasPaused)`.

- [ ] **Step 1: Write the failing tests**
  - `game.autopilot.test.ts`, `describe('autopilot state (11g)')`:
    - `createAutopilotGame(quiz, { id: 'a', nickname: 'Марта' }, { transitions: false })` → `ok`. `state.autopilot` → `{ authorId: 'a', at: null }`, гравець `a` у `players` (`connected: true`, як після `addPlayer`). `state.quiz` — `autopilotQuiz(quiz)` (поле з усною клітинкою стало `'phone'`);
    - порожній нікнейм → `nickname_invalid`;
    - командна вікторина → автор у `teams.members` без команди;
    - `isAuthor(s, 'a')` → `true`, `isAuthor(s, 'p2')` → `false`; у грі з ведучим (`createGame`) → `false`;
    - `anyonePresent`: соло — `setConnected(a, false)` при єдиному гравці → `false`; командна гра — за `members`.
  - `describe('author start (11g)')`:
    - соло: `autopilotStart` → етап `intro` (чи `guide` з `newcomers`), як `start`;
    - не автопілот → `not_allowed`; поза лобі → `wrong_phase`;
    - команди `'host'` і `'random'` (`setTeamForm`) → кожен учасник має команду ще до `start` (з детермінованим `rng`). Склад = `dealTeams(state, rng)`. Етап — `intro`;
    - `'pick'`: двоє вибрали команди, третій ні → старт, третій у найменшій (як `start`);
    - `'dice'`, тур ще не був, троє без команди → етап `lobby`, тур триває (`teams.dice.waiting` — усі), `autopilot.starting === true`. Тур триває, і повторний `autopilotStart` → `dice_pending`. Після закритого туру повторний `autopilotStart` → старт;
    - капітан після старту — перший учасник команди за приходом (`captainOf`).
  - `describe('author pause (11g)')`:
    - `authorPause` на `reveal` → `paused`, `hold: 'author'`; на паузі → `paused`; у лобі → `wrong_phase` (з `pause`); не автопілот → `not_allowed`;
    - `authorResume` → гра йде, без `hold` і `left`; з `hold: 'nobody'` теж продовжує.
  - `restore.test.ts`:
    - `STATE_SHAPE.GameState` + `autopilot`; новий `STATE_SHAPE.AutopilotState` → `'at,authorId,hold,left,starting'`;
    - `KEYS[14]` — копія `KEYS[13]` з `GameState` + `autopilot` і `AutopilotState: 'at,authorId,hold,left,starting'`;
    - `READABLE_STATE_VERSIONS` → `[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]`;
    - `representative()` + стан автопілота на паузі автора з `left`, `hold` і `starting` (щоб кожен ключ `AutopilotState` десь траплявся);
    - новий тест «an autopilot game that was running is suspended with hold nobody and the time left»: `reveal`, `autopilot.at = T + 4000`, `suspend(s, T)` → `paused`, `hold: 'nobody'`, `left: 4000`, `at: null`, усі поза зв'язком; переживає JSON;
    - «an autopilot game paused by the author stays paused by the author»: `hold: 'author'`, `left: 2500` → без змін, крім `at: null`;
    - «an autopilot lobby keeps its moment»: лобі з `at` → `at` той самий;
    - «a version 13 state (no autopilot) restores as a hosted game»: `suspend` → без ключа `autopilot`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/game.autopilot.test.ts packages/engine/src/restore.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `autopilotStart` для `'dice'`: «тур ще не був» — `teams.dice === null`; «хтось без команди» — `members.some((m) => m.teamId === null)`. `authorPause` / `authorResume` повертають результат `pause` / `resume` з дописаним `autopilot`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine/src
  git commit -F - <<'EOF'
  feat(engine): the autopilot game state (state version 14, version 13 still readable as a hosted game) — created with its author as a player on the autopilot quiz, the author starts it (teams dealt at start, a lobby dice tour first), pauses and resumes it, and a suspended autopilot game remembers the time left and waits for someone to return

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  EOF
  ```

### Задача 3. Підказка без тексту в автопілоті недоступна (баф і драбина)

**Files:**
- Modify: `packages/shared/src/game.ts` (`BuffBlock`), `packages/shared/src/views.ts` (`LadderLifelineView`), `packages/engine/src/buffs.ts`, `packages/engine/src/ladder.ts`, `packages/engine/src/views.ts` (`ladderInfo`), `apps/web/src/i18n.ts`, `apps/web/src/screens/LadderLifelines.tsx`
- Test: `packages/engine/src/game.autopilot.test.ts`, `packages/engine/src/views.ladder.test.ts`, `apps/web/src/screens/LadderLifelines.test.tsx` (наявний або новий)

**Interfaces:**
- `BuffBlock` + `/** Гра без ведучого: підказки ведучого немає, а автор не написав тексту (11g). */ | 'unfit_host'`.
- `LadderLifelineView.state: 'ready' | 'used' | 'active' | 'off'`, коментар: «off — гра без ведучого, а в поточного запитання немає тексту підказки (11g)».
- `buffs.ts`, гілка `case 'hint'` у перевірці придатності: `return state.autopilot !== undefined && question.hint === undefined ? 'unfit_host' : null;` (`question` — те саме поточне запитання, що й для інших гілок, із заміною). Гілку `'double'` відокремити від `'hint'`.
- `ladder.ts`, `useLifeline`: поруч із перевіркою залу — `if (kind === 'hint' && state.autopilot !== undefined && play.question.hint === undefined) return fail('buff_unfit');`. Коментар над функцією доповнити.
- `views.ts`, `ladderInfo`: підказка `hint`, що була б `'ready'`, в автопілоті на запитанні без `hint` → `'off'`. Поза запитанням (`intro`, `leaderboard`) — за наступним запитанням драбини, якщо воно відоме, інакше `'ready'`.
- `i18n.ts`: `buffWhy_unfit_host: 'У грі без ведучого підказки немає.'`, `ladderLifelineOff: 'У грі без ведучого підказки немає.'`.
- `LadderLifelines.tsx`: `'off'` — кнопка неактивна, як `'used'`, з `title` і `sr-only` текстом `ladderLifelineOff`. Більше нічого (вигляд — 11h).

- [ ] **Step 1: Write the failing tests**
  - `game.autopilot.test.ts`, `describe('host hint in autopilot (11g)')`:
    - класичний раунд, баф `hint` дозволено, запитання без `hint`, автопілот → придатність бафа `hint` гравця → `'unfit_host'`; `takeBuff(…, 'hint')` → помилка придатності (та сама, що для інших `unfit_*`);
    - те саме запитання з `hint: 'Подумай про річки'` → баф береться, `hint.text` = цей текст (як і раніше);
    - гра з ведучим без `hint` → баф береться й чекає ведучого (`text: null`) — без змін;
    - «Мільйонер» з підказкою `hint`, запитання без `hint`, автопілот → `useLifeline(…, 'hint')` → `buff_unfit`; з `hint` → текст одразу.
  - `views.ladder.test.ts`: автопілот, поточне запитання без `hint` → `lifelines` має `{ kind: 'hint', state: 'off' }`; з `hint` → `'ready'`; гра з ведучим → `'ready'`.
  - `LadderLifelines.test.tsx`: `state: 'off'` → кнопка `disabled`, видно «У грі без ведучого підказки немає.».
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/game.autopilot.test.ts packages/engine/src/views.ladder.test.ts` і `pnpm vitest run --maxWorkers=2 apps/web/src/screens/LadderLifelines.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src packages/engine/src apps/web/src
  git commit -F - <<'EOF'
  feat(engine): with no host the host hint works only where the author wrote its text — the hint buff is unfit («У грі без ведучого підказки немає») and the ladder hint lifeline is off otherwise

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  EOF
  ```

### Задача 4. Рушій: коли й що робить автопілот — `autopilotDue`, `planAutopilot`, `pilotStep`

**Files:**
- Modify: `packages/engine/src/autopilot.ts`
- Create: `packages/engine/src/autopilot.test.ts`

**Interfaces** (`autopilot.ts`, друга частина; імпортує `pacing.ts`, `game.ts`, `board.ts`, `board-dice.ts`, `teams.ts`, `duel.ts`, `ladder.ts`, `wipeout.ts`, `survival.ts`, `survey.ts`, `bluff.ts`, `timing.ts`, `splash.ts`):
```ts
/** Ключ підкроку автопілота: stepKey + тури кубиків поля й команд (номер, чи триває) + starting; без paused/at/left/hold. */
export function pilotKey(state: GameState): string;
/**
 * Мить наступного кроку для стану, що йде (не на паузі), якщо підкрок почався в from; null — чекати нічого (рушій сам, гравці, лобі, фініш).
 * Таблиця плану 11g, «Час етапів»; завжди ≥ paceWindow(state, дія)?.until.
 */
export function autopilotDue(state: GameState, from: number): number | null;
/**
 * Після кожної зміни стану (сервер — у commit, після stamp): пауза «нікого», відлік продовження, залишок на паузі, нова мить на зміну pilotKey.
 * Не автопілот → next без змін. Правила — план 11g, «Пауза й продовження».
 */
export function planAutopilot(prev: GameState, next: GameState, now: number): GameState;
/**
 * Крок у мить now ≥ autopilot.at: продовження з паузи «нікого» або дія з таблиці тими самими функціями рушія, що й кнопки ведучого.
 * Завжди повертає стан з at: null (і коли дія не вдалася); now < at, at null чи не автопілот → той самий об'єкт.
 */
export function pilotStep(state: GameState, now: number, rng: Rng): GameState;
```
- `planAutopilot(prev, next, now)` по кроках:
  1. Немає `next.autopilot` → `next`.
  2. Йде (не `paused`), етап не `lobby` / `finished`, `!anyonePresent(next)` → `pause(next, now)` і `autopilot: { …, hold: 'nobody', at: null, left }` (`left` — з `next.autopilot.at`, як у п. 3). Якщо `pause` не вдалася — `next`.
  3. `!prev.paused && next.paused` (щойно пауза: автор, сервер, будь-хто) → `left = at === null ? undefined : max(0, at − now)`, `at: null`. Далі п. 4.
  4. `next.paused`: `hold === 'nobody'` і `anyonePresent(next)` → `at = next.autopilot.at ?? now + AUTOPILOT_MS.resume` (відлік не перезапускається, поки йде); інакше `at: null`.
  5. `prev.paused && !next.paused` (продовжили) → `pilotKey` не змінився і є `left` → `at = max(now + left, paceWindow(next, дія)?.until ?? 0)`; інакше `autopilotDue(next, now)`. `left` і `hold` геть.
  6. Йде, `pilotKey(prev) !== pilotKey(next)` → `at = autopilotDue(next, now)`; інакше `at` без змін.
- `pilotStep`:
  - на паузі з `hold: 'nobody'` і `anyonePresent` → `resume(state, now)`, `hold` геть (залишок поверне `planAutopilot`). Інша пауза → лише `at: null`;
  - йде → дія з таблиці. Її `Result` невдалий → лише `at: null`.

- [ ] **Step 1: Write the failing tests** (`autopilot.test.ts`; фікстури з `testing/fixtures.ts`; стан будувати через `createAutopilotGame`, мітку кроку — через `stamp`, як сервер; `rng` детермінований):
  - **Помічник `plan(prev, next, now)`** = `planAutopilot(prev, stamp(prev, next, now), now)` — так тести бачать те саме, що сервер.
  - `describe('stage times (11g)')`, по рядку таблиці (`at` перевіряти точно; для кожного рядка з дією `next`/`lock`/`skip` ще `tooSoon(state, дія, at) === false`, а `tooSoon(state, дія, at − 1)` збігається з тим, чи вікно 11b довше за час автопілота):
    - `guide` → `from + 8000`;
    - `intro` класики без опису, без заставки (`transitions: false`) → `stepAt + 8000`; з описом 130 символів → `+ 11 000`; із заставкою раунду (`transitions: true`) → `splash.until + 8000`;
    - `intro` поля з двома гравцями → `at === from`; `pilotStep` → тур кубиків триває (`board.dice.tourNo === 1`); новий `at` → `from' + 10 000`; один кинув (`rollDie`), другий ні; `pilotStep` о `from' + 10 000` → кинуто за другого, тур закрито, коло за кидками; новий `at` → кінець заставки + `autopilotIntroMs`; `pilotStep` → `board`;
    - `intro` поля з одним гравцем → без кубиків, `next` через `autopilotIntroMs`;
    - `intro` «Мільйонера» `pick: 'host'` (після `autopilotQuiz` — `'random'`) → `pilotStep` у кінці заставки → учасник витягнутий (етап `intro`); новий `at` → `from + 4000` (але ≥ вікна 11b); далі `pilotStep` → `question`;
    - `wager` → `from + 30 000`; `pilotStep` → `question` фіналу, тих, хто не поставив, рахують зі ставкою 0 (як у `next`);
    - `question` з таймером → `at: null`;
    - `question` з відео (без таймера), `timeLimit: 20` → `startedAt + 20 000`; `pilotStep` → `locked`. «Мільйонер» `timer: false` → так само;
    - `locked` → `from + 1500`;
    - `reveal` класики → `from + 6000`; «100 до 1» з трьома рядками: перший → `from + 2000` (вікно 11b), другий і третій → `+ 1500`, після останнього → `+ 4000`. Блеф — так само по варіантах;
    - `reveal` фіналу: кожен гравець → `+ 3000`; розподіл банку (`wagerMode: 'bank'`) → `+ 3000`; потім `round_end`/`finished`;
    - `leaderboard` класики (`leaderboard: 'each'`) → `+ 5000`; відкрите вікно «Ва-банк» → `null`; після закриття вікна `tick` → екран рішень → `+ 4000`; «Вибування» з відкритим випробуванням → `null`, після закриття → `+ 5000`;
    - «Мільйонер», рішення чекає → `+ 30 000`; `pilotStep` → `ladder.decision === 'take'` (і далі підсумок як у «Забрати»);
    - `board` → `+ 30 000`; `pilotStep` → хід перейшов (`board.done` +1);
    - `round_end` → `+ 8000`;
    - дуель: оголошена гравцем, `next` автопілота з `reveal` починає її (`duel.stage === 'category'`); `at` = кінець заставки «Дуель!» + 15 000; `pilotStep` → категорія з `left > 0` вибрана жеребом (`rng`), етап `question`; без запитань у категоріях → `cancelDuel` (дуель геть). `answer` → `+ 4000`, `result` → `+ 5000`;
    - лобі командної гри, тур кубиків → `+ 15 000`; `pilotStep` → кинуто за всіх, хто не кинув. `starting` і тур закрито → `at === from`, `pilotStep` → гра стартувала, `starting` геть;
    - лобі без кубиків і `finished` → `null`.
  - `describe('pause and resume (11g)')`:
    - йде `reveal` з `at = T + 4000`; єдиний гравець поза зв'язком (`setConnected`), `plan(…, T + 1000)` → `paused`, `hold: 'nobody'`, `left: 3000`, `at: null`;
    - повернувся о `T + 50 000` → `at = T + 53 000`; ще один повернувся о `T + 51 000` → `at` той самий; `pilotStep(…, T + 53 000)` → гра йде; `plan` → `at = T + 56 000` (залишок 3000);
    - пішов до кінця відліку → `at: null`, `pilotStep` у колишню мить нічого не робить;
    - пауза автора (`authorPause`) → `hold: 'author'`, `left`; повернення гравців не ставить `at`; `authorResume` → `at = now + left`;
    - на паузі вилучили гравця, чий хід на полі (`removePlayer`), → після `authorResume` `at = autopilotDue(…)` нового ходу, а не старий залишок;
    - лобі: усі поза зв'язком → без паузи.
  - `describe('no loops (11g)')`:
    - `pilotStep` на `leaderboard` «Ва-банк» з відкритим вікном (підкладений `at`) → `next` не вдається (`deciding`) → стан той самий, крім `at: null`; `plan(prev, stepped)` → `at: null` (ключ той самий);
    - `pilotStep` з `now < at` → той самий об'єкт; у гри з ведучим → той самий об'єкт.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/autopilot.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
  - Кожну дію `pilotStep` брати з тих самих функцій, що стоять за кнопками ведучого в `manager.host`: `next`, `lock`, `skipTurn`, `startDice`, `rollForRest`, `rollTeamRest`, `start`, `pickDuelCategory(state, null, …)`, `cancelDuel`, `decideLadder(state, 'host', true, now)`, `resume`.
  - Категорію дуелі вибирати з `duelCategoriesLeft(state).filter((c) => c.left > 0)` одним викликом `rng`.
  - «Кінець заставки "Дуель!"» — `state.splash` виду `'duel'` (`until`), як у наявних тестах заставок.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine/src
  git commit -F - <<'EOF'
  feat(engine): the autopilot plans its next step from the stage table on top of the 11b minimum (guide 8 s, round intro 8 s plus the description, locked 1.5 s, reveal 6 s or 1.5 s a row then 4 s, table 5 s, decisions 4 s, final 3 s a player, round end 8 s) and takes the host default choices through the same engine functions — dice, turn skip, duel category, ladder take; it pauses when nobody is online and goes on 3 s after someone returns with the time left

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  EOF
  ```

### Задача 5. Рушій: кожен формат від лобі до фіналу без ведучого (драйвер і наскрізні ігри)

**Files:**
- Create: `packages/engine/src/testing/autopilot.ts`, `packages/engine/src/autopilot.full.test.ts`

**Interfaces:**
```ts
/** Що роблять люди на кожному кроці драйвера: дії гравців через публічні функції рушія (submitAnswer, rollDie, pickCell, placeWager, …); повертає новий стан чи той самий. */
export type People = (state: GameState, now: number) => GameState;

/**
 * Імітує сервер (manager.commit/reschedule): наступна подія — найменша з nextDeadline(state, tickedTo) і autopilot.at;
 * у цю мить tick → pilotStep → stamp → planAutopilot; після кожної зміни — people. Ведучого немає: функції пульта драйвер не викликає.
 * Кидає помилку, якщо подій немає, а гра не finished (зупинка), чи після maxSteps (цикл).
 */
export function drive(start: GameState, options: { now: number; rng: Rng; people: People; maxSteps?: number }): { state: GameState; now: number; steps: number };
/** Люди, що відповідають: перший прийнятний варіант / написання, кидають кубики, вибирають першу клітинку, ставлять 0, вирішують «Далі» на першому вікні. */
export const answering: People;
/** Люди на зв'язку, що нічого не роблять. */
export const silent: People;
```

- [ ] **Step 1: Write the tests** (`autopilot.full.test.ts`; кожна вікторина проходить двічі: з `answering` і з `silent`; тексти — без тем росії й СРСР):
  - для кожної з вікторин нижче `drive(createAutopilotGame(…) → autopilotStart …)` → `finished`, без винятку драйвера:
    1. класика з усіма типами запитань (зокрема `chain`, `sort`, `wall`, `pin`, `slider`, `wordcloud`, `survey`, `bluff`, «Хто я?» з підказками, запитання з відео), `leaderboard: 'each'`, `newcomers: true` («Як грати»);
    2. бліц з `check: 'manual'`;
    3. поле 3 × 3 з `answerMode: 'voice'`, `check: 'manual'`, бліц-клітинкою, усною клітинкою «Хто я?», клітинкою ×2;
    4. фінал з `check: 'manual'`, `wagerMode: 'classic'` і окремо `'bank'`;
    5. «Ва-банк»;
    6. «Вибування» з випробуванням `'question'` і окремо `'luck'`;
    7. «Мільйонер» `pick: 'host'`, `timer: false`, усі підказки;
    8. дуелі (`settings.duels`): `answering` оголошує одну дуель на першому `reveal` і відповідає правильно;
    9. командна гра для кожного способу `'host'`, `'pick'`, `'random'`, `'dice'` (`setTeamForm` від автора до старту).
  - Для кожної гри перевірити:
    - **без ведучого:** жодна функція пульта не потрібна (драйвер їх не має);
    - **бали з `answering`:** на полі з усною клітинкою правильна текстова відповідь отримала ціну клітинки (`overridden: false`). На бліці й у фіналі з ручною перевіркою правильна відповідь зарахована одразу, неправильна — «ні»;
    - **сумарний час:** `now − start` менший за суму верхніх меж таблиці плюс таймери запитань (груба межа, щоб цикл без кінця не пройшов тихо);
    - `silent`: усі ходи на полі пропущені за 30 с, ставки фіналу — через 30 с, рішення «Мільйонера» — «Забираю» через 30 с, категорія дуелі — жереб через 15 с.
  - Окремо: пауза посеред гри. `people` на кроці 10 відключає всіх (`setConnected`) → драйвер бачить паузу «нікого» без подій. Тест сам підключає одного → через 3 с гра йде далі й доходить до `finished`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/autopilot.full.test.ts`. Якщо гра зупинилася, це означає діру в таблиці задачі 4: виправити її в `autopilot.ts` і додати рядок у `autopilot.test.ts`. Кожну таку знахідку назвати у звіті задачі. Знахідка, якої немає в рішеннях плану, — питання координаторові, а не тихе нове правило.
- [ ] **Step 3: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages` → PASS.
- [ ] **Step 4: Commit**
  ```bash
  git add packages/engine/src
  git commit -F - <<'EOF'
  test(engine): every format runs from the lobby to the podium with no host — classic with all question types and the guide, manual blitz, a voice board, manual final, wipeout, survival, a host-picked untimed ladder, duels and all four team forms — both with answering and with silent players, and resumes after everyone drops

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  EOF
  ```

### Задача 6. Зрізи: позначка автопілота, що бачить автор

**Files:**
- Modify: `packages/shared/src/views.ts`, `packages/engine/src/views.ts`
- Create: `packages/engine/src/views.autopilot.test.ts`
- Test: нові файли; фікстури вебу (лише нові поля, там, де падає `pnpm typecheck`)

**Interfaces:**
- `packages/shared/src/views.ts`:
  ```ts
  // BaseView, наприкінці:
  /** Гру веде автопілот (11g): сцена покаже «Гру веде бот» (11h). */
  autopilot: boolean;

  /** Слово «хмари» для меню автора (11g): лише те, що сцена показує, і сховане ним; без авторів слів. */
  export interface AuthorCloudWord {
    key: string;
    text: string;
    count: number;
    hidden: boolean;
  }
  /** Варіант блефу для меню автора (11g): без позначки правди й авторів. */
  export interface AuthorBluffOption {
    id: string;
    text: string;
  }
  /** Що бачить лише автор кімнати-автопілота (11g); решту — як усі гравці. */
  export interface AuthorView {
    /** Розкриття «хмари слів»: слова сцени й сховані; інакше null. */
    cloud: AuthorCloudWord[] | null;
    /** Етап вибору блефу: неприбрані варіанти в порядку показу; інакше null. */
    bluff: AuthorBluffOption[] | null;
  }
  // PlayerView, після myBreakdown:
  /** Лише автор кімнати-автопілота (і в лобі); інакше null. */
  author: AuthorView | null;
  ```
- `packages/engine/src/views.ts`:
  - `base(...)` → `autopilot: state.autopilot !== undefined`;
  - `ownView` і `lobbyView` → `author: authorView(state, personId)`. `personId` — id людини (у командній грі — учасника, не команди: `playerView` знає `member.id`);
  - `authorView(state, personId)`:
    - не автор → `null`;
    - `cloud` — на `reveal` поточної «хмари», за `isRevealed`. Видимі ключі — як `stageCloud` (несховані, перші `LIMITS.cloudShown`), результат — `cloudTally(...).filter((e) => e.hidden || visible.has(e.key))` → `{ key, text, count, hidden }`;
    - `bluff` — `bluffPlayOf(state)` на `question` у фазі `choice` → `options.filter((o) => !o.removed)` у порядку показу (той самий, що в зрізі гравця) → `{ id, text }`.

- [ ] **Step 1: Write the failing tests** (`views.autopilot.test.ts`):
  - `stageView` / `playerView` автопілота → `autopilot: true`; гри з ведучим → `false` (і в `hostView`);
  - `playerView(s, автор).author` у лобі → `{ cloud: null, bluff: null }`; `playerView(s, інший).author` → `null`; гра з ведучим → `null` для всіх;
  - «хмара»: троє голосують словами «сонце», «сонце», «море», «ліс»; на `question` / `locked` → `cloud: null`; на `reveal` → три слова з лічильниками, `hidden: false`. Після `hideCloudWord('ліс', true)` → «ліс» є з `hidden: true`, а `stageView(s).cloud` його не має;
    - JSON зрізу автора не містить нікнеймів інших гравців поза полями, де вони є і в зрізі звичайного гравця (`by` і `playerIds` відсутні в `cloud`);
  - блеф: фаза `lies` → `bluff: null`; фаза `choice` → варіанти `{ id, text }` (без `kind`, `authors`, `removed`); після `removeBluffOption` вигадки → її немає; на `reveal` → `null`;
  - командна гра: автор — учасник. `playerView(s, автор).author` не `null`, у його товариша — `null`;
  - `JSON.stringify(stageView(s))` автопілота не містить `"author"`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/views.autopilot.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Потім `pnpm typecheck` і додати `autopilot: false` / `author: null` у фікстури вебу, на які він скаржиться (нічого більше).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src packages/engine/src apps/web/src
  git commit -F - <<'EOF'
  feat(engine): views mark an autopilot game, and only the author gets the word cloud words the stage shows plus the ones they hid (no voters) and the bluff options at the choice stage (no truth mark, no authors) for hiding

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  EOF
  ```

### Задача 7. Сервер: кімната-автопілот у `RoomManager`

**Files:**
- Modify: `apps/server/src/rooms/manager.ts`
- Create: `apps/server/src/rooms/manager.autopilot.test.ts`
- Test: `apps/server/src/rooms/manager.autopilot.test.ts`, `apps/server/src/rooms/manager.restore.test.ts`

**Interfaces:**
```ts
/** Кімната-автопілот без жодного гравця на зв'язку стільки часу (у грі) → «Завершити гру» (11g). */
export const AUTOPILOT_EMPTY_MS = 30 * 60_000;

/** Дії, які автор кімнати-автопілота шле з телефона (11g); решта — not_allowed. */
export type AuthorAction = Extract<HostAction, { type: 'start' | 'pause' | 'resume' | 'end' | 'kick' | 'cloud-hide' | 'bluff-remove' | 'team-form' }>;

// Room, після deadline:
/** Таймер кроку автопілота (11g) на state.autopilot.at; null — немає. */
pilot: unknown;

// RoomManager:
/** Кімната-автопілот: createAutopilotGame з автором-гравцем (поза зв'язком до сокета), токен гравця; hostToken — випадковий і ніде не видається. */
createAutopilot(quiz: Quiz, hostUserId: string, quizId: string | null, nickname: string): { ok: true; room: Room; token: string; playerId: string } | { ok: false; error: ErrorCode | 'restarting' };
/** Дія з телефона гравця подією host:*: звичайна кімната → forbidden; не автор чи дія не з AuthorAction → not_allowed. */
author(room: Room, playerId: string, action: HostAction): AckResult;
```
- `commit(room, state, at)`:
  ```ts
  const stamped = this.pacing || state.autopilot !== undefined ? stamp(room.state, state, at) : state;
  room.state = planAutopilot(room.state, stamped, at);
  ```
  В автопілоті мітка кроку ставиться завжди, навіть коли `pacing` вимкнено (модульні тести): від неї рахуються заставки й вікна 11b.
- `reschedule(room)`: після наявного таймера рушія — таймер `pilot` на `room.state.autopilot?.at`. Коли спрацьовує:
  ```ts
  room.pilot = null;
  room.tickedTo = Math.max(this.now(), at);
  const stepped = pilotStep(tick(room.state, room.tickedTo), room.tickedTo, this.rng);
  if (stepped !== room.state) this.commit(room, stepped, room.tickedTo);
  else this.reschedule(room);
  ```
  `clearTimers` прибирає й `pilot`.
- `identify`: роль `host` у кімнаті з `state.autopilot` → `null` (немає пульта; токен не підходить, навіть якщо його вгадати).
- `hostOnline(room)` → `true` для автопілота.
- `connect` / `disconnect` гравця в автопілоті:
  - після `apply` — `anyonePresent(room.state)` → таймер `absence` геть;
  - нікого й етап не `lobby` / `finished` → `absence` на `AUTOPILOT_EMPTY_MS` → `end`.
  - `hostLeft` для автопілота не викликається ніколи.
- `restore(saved)`: автопілот → замість `hostLeft` таймер «нікого» (`AUTOPILOT_EMPTY_MS`), якщо етап не `lobby` / `finished`.
- `author(...)`:
  1. немає `autopilot` → `{ ok: false, error: 'forbidden' }`;
  2. `!isAuthor(state, playerId)` або тип поза `AuthorAction` → `not_allowed`;
  3. `start` → `autopilotStart(state, now, rng)`;
  4. `pause` → `authorPause` (нахили геть, як у `host`);
  5. `resume` → `authorResume`;
  6. `end` → `end`;
  7. `kick` → себе → `not_allowed`, інакше `this.kick`;
  8. `cloud-hide` → `state.phase !== 'reveal'` → `wrong_phase`, інакше `hideCloudWord`;
  9. `bluff-remove` → `removeBluffOption`;
  10. `team-form` → `setTeamForm`.
  - Затримки 11b для дій автора немає: жодна з них не «Далі».
- `host(room, action)` для автопілота недосяжний (немає ролі `host`). Для певності: `state.autopilot !== undefined` → `forbidden`.

- [ ] **Step 1: Write the failing tests** (`manager.autopilot.test.ts`; `FakeScheduler`, `transitions: false`, `pacing: false` (за замовчуванням) і окремо `pacing: true`; детермінований `rng`):
  - `createAutopilot(quiz, 'u1', 'q1', 'Марта')` → `ok`. Автор поза зв'язком до `connect`. `room.state.autopilot.authorId === playerId`, `room.playerUsers.get(playerId) === 'u1'`;
  - `identify(code, 'host', room.hostToken)` → `null`; `identify(code, 'player', token)` → автор;
  - `hostOnline(room)` → `true`;
  - **дії:**
    - автор `start` → `intro`;
    - другий гравець `start` → `not_allowed`;
    - автор `next`, `lock`, `adjust`, `time`, `end-round`, `skip` → `not_allowed`;
    - у звичайній кімнаті `author(room, гравець, { type: 'start' })` → `forbidden`;
  - **хід гри без натискань:** класика з двома запитаннями, `leaderboard: 'each'`. Обидва підключені, відповідають через `answer`. `scheduler.advance` по кроках:
    - `intro` +8000 → `question`;
    - обидва відповіли → `locked`;
    - +1499 — ще `locked`, +1 → `reveal`;
    - +6000 → `leaderboard`;
    - +5000 → наступне `question`;
    - … → `finished`;
  - **11b:** з `pacing: true` той самий хід, і жоден крок не раніший за `paceWindow` (на `reveal` → `leaderboard` не раніше `stepAt + 2000`, а насправді `+ 6000`);
  - **таймер рушія і автопілот:** запитання з таймером 10 с, ніхто не відповідає → `tick` закриває о +10 000, потім +1500 → `reveal`;
  - **пауза автора:** на `reveal` автор `pause` → `advance(60_000)` → досі `reveal` на паузі. Автор `resume` → решта часу розкриття, потім `leaderboard`;
  - **нікого на зв'язку:** обидва `disconnect` на `question` → `paused`. `advance(10 * 60_000)` → досі пауза (не `finished`: 10 хв ведучого не діють). Один `connect` → `advance(2999)` — пауза, `advance(1)` — гра йде;
  - **30 хв:** усі пішли → `advance(AUTOPILOT_EMPTY_MS)` → `finished`. Повернення до кінця цього часу таймер знімає;
  - **вилучення автором:** автор `kick` другого → гравця немає, його токен не працює; автор `kick` себе → `not_allowed`;
  - **«хмара»:** на `question` автор `cloud-hide` → `wrong_phase`; на `reveal` → слово сховане (`stageView` без нього); другий гравець → `not_allowed`;
  - **блеф:** на етапі вибору автор `bluff-remove` вигадки → прибрано; правди → `not_allowed`; на `reveal` → `wrong_phase`;
  - **командна гра з кубиками:** автор `team-form` `'dice'`, `start` → лобі, тур. Двоє кинули (`teamRoll`), третій ні → `advance(15_000)` → кинуто за нього; тур закрито → старт без натискань;
  - **`view(room, автор)`** → `author` не `null`; `view(room, інший)` → `author: null`.
  - `manager.restore.test.ts`, новий `describe('an autopilot room restored after a restart (11g)')`:
    - знімок на `reveal` з `at` за 4000 мс → `restore` → `paused`, `hold: 'nobody'`, `left: 4000`, таймера `absence` 10 хв немає, є таймер `AUTOPILOT_EMPTY_MS`;
    - гравець підключився → +3000 → гра йде; ще +4000 → `leaderboard`;
    - знімок версії 13 (без `autopilot`) → як раніше (пауза, 10 хв на повернення ведучого).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/rooms` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=1 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/src
  git commit -F - <<'EOF'
  feat(server): autopilot rooms — the author joins as a player, no host token or host view exists, a pilot timer steps the game through the engine, the author may start, pause, resume, kick, end, pick the team form, hide cloud words on the reveal and remove bluff lies (anything else is not_allowed), nobody online pauses it, 30 min with nobody ends it, and a restored autopilot room goes on 3 s after someone returns

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  EOF
  ```

### Задача 8. Сервер: маршрути й сокети автопілота

**Files:**
- Modify: `apps/server/src/account-routes.ts`, `apps/server/src/socket.ts`
- Test: `apps/server/src/games.test.ts`, `apps/server/src/socket.test.ts`

**Interfaces:**
- `account-routes.ts`:
  ```ts
  const fromSaved = z.object({
    quizId: z.string().min(1).max(64),
    /** Гра без ведучого (11g): автор — гравець з цим нікнеймом. */
    autopilot: z.literal(true).optional(),
    nickname: joinSchema.shape.nickname.optional(),
  }).strict();
  ```
  - `autopilot: true` без `nickname` → 400 `invalid_payload`; `nickname` без `autopilot` → 400.
  - `autopilot: true` → `manager.createAutopilot(quiz, user.id, quizId, nickname)`:
    - помилка нікнейма → 409 `{ error }` (як у `/join`);
    - успіх → 201 `{ gameId, code, stageToken, token, playerId }` **без `hostToken`**.
  - Ліміти й перевірки (`maxRooms`, `frozen`, своя вікторина) — ті самі, що для звичайної гри.
  - `GET /api/quizzes/:id/autopilot` → 401 без входу; 404 — не своя чи немає; 200 → `autopilotCheck(quiz)`.
  - `GET /api/games/by-code/:code/host-access`: кімната з `state.autopilot` → 404 `game_not_found` (та сама відповідь, що «не ваша гра»).
- `socket.ts`:
  ```ts
  /** Хто доходить до обробників host:*: пульт; у грі без ведучого — і гравець (manager.author відповідає not_allowed чужим і зайвим діям). */
  const hostSide = isHost || (identity.role === 'player' && identity.playerId !== null && room.state.autopilot !== undefined);
  const run = (action: HostAction): AckResult => (isHost ? manager.host(room, action) : manager.author(room, identity.playerId!, action));
  ```
  - Кожен обробник `host:*` (прості й з даними): `if (!hostSide) return FORBIDDEN;` → перевірка даних, як і зараз → `run(action)`.
  - `host:audio` від гравця-автора → `not_allowed`. Для звичайної кімнати поведінка та сама: гравець отримує `forbidden` ще до перевірки даних.
  - `StateMeta.hostOnline` бере `manager.hostOnline(room)` (для автопілота `true`).

- [ ] **Step 1: Write the failing tests**
  - `games.test.ts`, `describe('autopilot rooms (11g)')`:
    - власник: `POST /api/games { quizId, autopilot: true, nickname: 'Марта' }` → 201. У тілі є `gameId`, `code`, `stageToken`, `token`, `playerId`, але немає `hostToken`. `manager.get(code).state.autopilot.authorId === playerId`;
    - без `nickname` → 400; з `nickname: ''` → 409 `nickname_invalid`; чужа вікторина → 404; без входу → 401;
    - `host-access` для кімнати-автопілота → 404;
    - `GET /api/quizzes/:id/autopilot` для вікторини з усним полем → `{ blocked: [], changed: [{ code: 'voice', rounds: [0] }] }`; чужа → 404; без входу → 401;
    - `POST /api/games/by-code/:code/join` → інші гравці входять як завжди.
  - `socket.test.ts`, `describe('autopilot sockets (11g)')`:
    - сокет ролі `host` з будь-яким токеном → `connect_error` `unauthorized`;
    - автор (сокет гравця) `host:start` → `{ ok: true }`. Інший гравець `host:start` → `{ ok: false, error: 'not_allowed' }`;
    - автор `host:next`, `host:adjust { playerId, points: 50 }`, `host:audio { action: 'replay' }` → `not_allowed`;
    - автор `host:kick` іншого → той отримує `closed` `kicked`, як від ведучого;
    - кадри `state` автора й гравця: `meta.hostOnline === true`, `view.autopilot === true`, у кадрах немає `"role":"host"`, `"live":{`, `"responses":`;
    - звичайна кімната: гравець `host:start` → `forbidden` (наявний тест зелений).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/games.test.ts apps/server/src/socket.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=1 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/src
  git commit -F - <<'EOF'
  feat(server): create an autopilot room from your quiz with your nickname (player token and stage token, never a host token), read the autopilot compatibility of a quiz, no host access for such rooms, and host events from the author phone reach the author actions while other players get not_allowed

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  EOF
  ```

### Задача 9. Наскрізні сценарії «part 11g: …» (сокети без браузера, сцена з кадрами)

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Помічник поруч із `socketPlayer` (11f):
  ```ts
  /** Учасник гри без браузера (11g): сокет за токеном, усі кадри state, дії з підтвердженням; reconnect — новий сокет з тим самим токеном. */
  async function pilotSocket(sockets: Socket[], code: string, token: string, nickname: string): Promise<{
    nickname: string;
    frames: { view: GameView; meta: StateMeta; at: number }[];
    raw: string[];
    emit: (event: string, payload?: unknown) => Promise<AckResult>;
    close: () => void;
    reconnect: () => Promise<void>;
  }>;
  /** Вхід через API (/join) → pilotSocket. */
  async function pilotPlayer(sockets: Socket[], code: string, nickname: string): ReturnType<typeof pilotSocket>;
  /** Чекає кадру, що задовольняє умову, і повертає його (за expect.poll). */
  async function frame(player: Awaited<ReturnType<typeof pilotSocket>>, test: (view: GameView) => boolean): Promise<{ view: GameView; at: number }>;
  /** Мить першого кадру з етапом phase після індексу from. */
  function phaseAt(player: Awaited<ReturnType<typeof pilotSocket>>, phase: string, from?: number): number;
  ```
  `raw` — `JSON.stringify` кожного кадру для перевірок таємності.
- **Допуск проміжків** («± допуск»): від −150 мс (`PACE_GRACE_MS`, ранній таймер) до +1500 мс (мережа, перемальовування). Проміжок міряти між мітками `at` кадрів одного сокета.
- «Хмару» гравці заповнюють `player:answer` з відповіддю типу `wordcloud` (як у наявних сценаріях 10d).
- Вміст — без тем росії й СРСР. Вікторина `Автопілот 11g`, `leaderboard: 'end'`. Так поле йде від клітинки до клітинки без таблиці, і сценарій коротший. Таблицю між запитаннями (5 с) перевіряє другий сценарій (`leaderboard: 'each'`):
  - «Розминка» (класика, `speedBonus: false`, `shuffleOptions: false`, опис на 130 символів про природу Карпат → заставка 11 с):
    - `g1` boolean «Говерла — найвища гора України», `true`, 100, `timeLimit: 20`;
    - `g2` wordcloud «Одне слово про літо», `timeLimit: 20`;
  - «Поле» (поле 3 × 3, мінімум `LIMITS`, `answerMode: 'voice'`, `check: 'manual'`, категорії «Річки», «Гори», «Міста»). Клітинки — text з `accepted`, ціни 100/200/300, тексти на зразок «Яка річка тече через Київ?» → «Дніпро»;
  - «Фінал» (`check: 'manual'`, `wagerMode: 'classic'`): text «Яке місто — столиця України?» → «Київ».

- [ ] **Step 1: Сценарій 1**
  ```ts
  it('part 11g: autopilot — no host token or view, the author starts from the phone, the server opens, closes, reveals and moves on by the stage times on top of 11b, voice board cells and manual checks go by the key from the phone, dice start and finish by themselves, the author hides a cloud word on the 1280 × 720 stage while others get not_allowed, the game reaches the podium', async () => {
    const sockets: Socket[] = [];
    try {
      await autopilot11g(sockets);
    } catch (error) {
      await snapshot();
      throw error;
    } finally {
      for (const socket of sockets) socket.close();
    }
  });
  ```
  **Підготовка `autopilot11g()`:**
  1. `author = open('author11g', 1280, 900)`, `register(author, 'host', 'Марта Авторка', 'author11g@example.com')`. Вікторина → `POST /api/quizzes` → `quizId`.
  2. `GET /api/quizzes/${quizId}/autopilot` → `{ blocked: [], changed: [{ code: 'voice', rounds: [1] }, { code: 'manual', rounds: [1, 2] }] }`.
  3. `author.request.post('/api/games', { data: { quizId, autopilot: true, nickname: 'Марта' } })` → 201; `hostToken` у тілі немає.
  4. `connectSocket(base, { auth: { code, role: 'host', token: 'x'.repeat(32) } })` → `connect_error`.
  5. `marta = pilotSocket(…, token, 'Марта')`, `vira = pilotPlayer(…, 'Віра')`, `petro = pilotPlayer(…, 'Петро')`.
  6. `stage = open('stage11g', 1280, 720)`, `stage.goto(\`${base}/stage/${code}#${stageToken}\`)`, `stageFrames = socketFrames(stage)` (наявний помічник).

  **Кроки:**
  1. **Дії не автора й зайві дії автора.** `vira.emit('host:start')` → `not_allowed`; `marta.emit('host:next')` → `not_allowed`. `marta.emit('host:start')` → `ok`.
  2. **Заставка й запитання.** `phaseAt(vira, 'question') − phaseAt(vira, 'intro')` ≥ тривалість заставки раунду + 11 000 − 150 і ≤ … + 2000. Кадр сцени `p11g-stage-question`.
  3. **g1:** усі «Так» → `locked`. `reveal` настає через 1500 (допуск −150 … +1000). Таблиці між запитаннями немає (`'end'`), тож `question` g2 — через 6000 ± допуск.
  4. **«Хмара».** Віра «сонце», Петро «сонце», Марта «море» → `reveal`:
     - `marta` останній кадр: `view.author.cloud` → слова «сонце» (2) і «море» (1), `hidden: false`; `vira` — `view.author === null`;
     - `vira.emit('host:cloud-hide', { key: 'море', hidden: true })` → `not_allowed`;
     - `marta.emit('host:cloud-hide', { key: 'море', hidden: true })` → `ok`; на сцені слово «море» зникає (`expect.poll` на текст хмари), «сонце» лишається;
     - кадр `p11g-stage-cloud`.
  5. **Кінець раунду** → 8000 ± допуск → `intro` «Поля».
  6. **Кубики самі.** Під час заставки поля в кадрах з'являється тур (`view.board.dice` з трьома рядками, `done: false`). Віра й Петро `player:roll`, Марта ні → через 10 000 ± допуск тур закрито (`done: true`; за нічиєї — новий тур і ще 10 с). `board` настає після кінця заставки + `autopilotIntroMs`.
  7. **Усне поле з телефона.** Хто ходить (`view.board`), той `player:pick` першу незіграну клітинку → `player:answer { type: 'text', value: <правильне написання малими літерами> }` → на `reveal` запис правильний і бали гравця зросли на ціну. Один хід (Петро) — навмисно неправильне написання → «ні», бали без змін (штрафу немає). Решта клітинок — правильно. Кадр сцени `p11g-stage-board` на першому `reveal`.
  8. **Фінал із ручною перевіркою.** Усі `player:wager` (Марта 0, Віра 100, Петро 50) → `question` відкривається сам. Марта й Віра «київ», Петро «Львів». Кожен гравець розкривається через 3000 ± допуск. Віра +100, Петро −50. Потім `finished`; на сцені подіум. Кадр `p11g-stage-podium`.
  9. **Таємність:**
     - жоден рядок `raw` у `marta`, `vira`, `petro` і жоден кадр `stageFrames` не містить `"role":"host"`, `"live":{`, `"responses":[`;
     - кадри Віри й Петра не мають `"author":{`;
     - `meta.hostOnline === true` у всіх кадрах гравців.
  10. `expect(problems).toEqual([])`.
- [ ] **Step 2: Сценарій 2**
  ```ts
  it('part 11g: autopilot pauses with nobody online and after a restart, goes on 3 s after the first player returns with the time left, and the author pause holds until the author resumes', async () => { … });
  ```
  Вікторина `Пауза 11g`: один класичний раунд «Розминка» без опису, `leaderboard: 'each'`, три boolean-запитання («Дніпро впадає в Чорне море», «Карпати — гори», «Світязь — озеро», `true`, 100, `timeLimit: 20`). Автор і Віра — сокети, сцена — сторінка.
  1. Старт автором → перше `question`. Обоє `close()` → у кадрах сцени `paused: true`. Через 5 с ще пауза (сцена). `vira.reconnect()` → `paused: false` через 3000 (−150 … +1500) від повернення.
  2. Обоє відповіли → `reveal`. Через 2 с від початку розкриття — `restart()` (наявний помічник). Після `relisten` сцена перепідключається сама, а сокети — `marta.reconnect()` за 2 с після сервера, Віра пізніше. Кадри сцени: `paused: true` до повернення Марти, потім гра йде через 3 с. Далі `leaderboard` настає приблизно через 4 с залишку розкриття (між 3500 і 6000 від продовження).
  3. **Таблиця між запитаннями** (`leaderboard: 'each'`) → наступне `question` через 5000 ± допуск.
  4. **Пауза автора:** на `reveal` другого запитання `marta.emit('host:pause')` → `ok`. Через 8 с ще пауза. `vira.emit('host:resume')` → `not_allowed`. `marta.emit('host:resume')` → `ok` → `leaderboard` через залишок.
  5. Довести до `finished` (третє запитання). `expect(problems).toEqual([])`.
- [ ] **Step 3: Run** `pnpm build`, потім у фоні `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 11g"` → PASS. Переглянути кадри `p11g-*`: сцена 1280 × 720 без прокрутки показує запитання, хмару без схованого слова, поле й подіум, як у звичайній грі.
- [ ] **Step 4: Повний прогін — один раз, у фоні** (≈ 32 хв + сценарії 11g): `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts` → усі сценарії PASS. Якщо PGlite чи браузер падає з браком пам'яті, перезапустити лише сценарії, що впали (`-t "<назва>"`), і назвати це в звіті.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/e2e
  git commit -F - <<'EOF'
  test: part 11g end-to-end — an autopilot game with headless phones and a 1280 × 720 stage: no host token or view anywhere, the author starts it, the server keeps the stage times on top of 11b, voice board cells and manual checks go by the key, dice finish by themselves, the author hides a cloud word and others get not_allowed; it pauses with nobody online and after a restart, goes on 3 s after someone returns with the time left, and the author pause holds

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  EOF
  ```
