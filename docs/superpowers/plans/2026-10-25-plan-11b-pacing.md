# План 11b: Затримка між кроками ведучого й довші переходи

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 11b специфікації `docs/superpowers/specs/2026-10-25-after-formats-design.md` (розділ 6, п. 6 побажань). «Далі» більше не проскакує розкриття:
- **Мінімальний час на кроці (сервер).**
  - Рушій пам'ятає мить останньої зміни кроку: нове необов'язкове поле `GameState.stepAt`.
  - Кроки ведучого, що ведуть гру далі, діють лише після мінімального часу. Раніше сервер відповідає новою помилкою `too_soon` і нічого не змінює.
  - Числа:
    - «Далі» з розкриття, таблиці, кінця раунду, сторінки «Як грати» — 2 с;
    - кожен наступний рядок «100 до 1» і варіант блефу — 1 с;
    - «Далі» із заставки раунду (`intro`) — 3 с після кінця заставки;
    - дострокове «Закрити» (`host:lock`) — 3 с після реального старту запитання (після заставки);
    - «Пропустити хід» на полі й «Продовжити гру» після дуелі — 2 с.
  - Без поля (стан старої версії) обмеження немає.
- **Ніколи не затримуються:** пауза й продовження, «Завершити раунд», «Завершити гру», вилучення гравця, оцінка відповідей, коригування балів, дебафи, підказки, кидок кубика.
- **Пульт:** кнопка неактивна, поки час не сплив, і заповнюється, як смужка прогресу. Підпис кнопки не змінюється. Подвійний дотик не показує помилки.
- **Довші заставки** (`SPLASH_MS`, лише з увімкненими переходами):
  - запитання 1,2 → 1,8 с;
  - клітинка 1 → 1,5 с;
  - раунд 2,5 → 3,5 с;
  - фінал 3,2 → 4 с;
  - дуель 2 → 2,5 с.

  Сюрприз ×2/×3 (`CELL_SURPRISE_MS`), п'єдестал і випробування не змінюються.
- **Без переходів** заставок немає, але мінімальний час діє так само.
- **Сцена й телефони** не змінюються, крім довших заставок.

**Стан гри: `GAME_STATE_VERSION` 10 → 11.**
- Новий необов'язковий ключ `GameState.stepAt?: number`.
- `READABLE_STATE_VERSIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]`. Зміна лише адитивна. Кімната версії 10 відновлюється без `stepAt`, тобто без затримки до першої зміни кроку; далі сервер ставить поле сам.
- **Пуш не обриває живих ігор.** Специфікація (розділ 2) однаково вимагає перед пушем перевірити `live_room` за правилом 14a підпроєкту 10. Звіт власникові має назвати підняття версії й те, що живі ігри його переживають.
- Якщо 11d піде тим самим деплоєм, версію піднімають один раз (11d тоді додає свої ключі до тієї ж 11). Цей план піднімає її сам.

**Архітектура:**
- **Shared (`packages/shared/src/game.ts`, `views.ts`).**
  - `SPLASH_MS` — нові числа.
  - Новий `PACE_MS = { step: 2000, row: 1000, intro: 3000, lock: 3000 }`.
  - `ErrorCode` + `'too_soon'`.
  - Типи `PaceWindow { from; until }` і `HostPace { next; lock; skip }`.
  - `HostView.pace: HostPace`.
- **Рушій (новий `packages/engine/src/pacing.ts`).** Чисті функції:
  - `stepKey(state)` — рядок «який зараз крок»;
  - `stamp(prev, next, now)` — ставить `stepAt = now`, коли `stepKey` змінився;
  - `paceWindow(state, action)` — вікно `{ from, until }` для `'next' | 'lock' | 'skip'` або `null`;
  - `tooSoon(state, action, now)`;
  - `hostPace(state)` — три вікна для зрізу пульта.

  Самі `next`, `lock`, `skipTurn` не змінюються: перевірку робить сервер одним викликом перед дією. `restore.ts` — версія 11 і `READABLE_STATE_VERSIONS`. `views.ts` — `hostView(...).pace = hostPace(state)`.
- **Сервер (`apps/server/src/rooms/manager.ts`, `app.ts`, `main.ts`).**
  - Опція `pacing` (типово `false`, як `transitions`). `main.ts` і наскрізні тести вмикають.
  - З `pacing` кожен `commit` проводить стан через `stamp(prev, next, at)`.
  - `host()` перед дією: якщо дія затримувана й `tooSoon` → `{ ok: false, error: 'too_soon' }`, стан і події без змін.
  - Без `pacing` поля `stepAt` немає ніде, тож наявні тести сервера не змінюються.
- **Веб.**
  - Новий `apps/web/src/pace.ts`: `paceProgress` і хук `usePace`.
  - `HostScreen.tsx`: головна кнопка, «Відкрити всі» («100 до 1»), «Пропустити хід».
  - `HostBluff.tsx`: «Відкрити всі» через наявний проп `busy`.
  - `too_soon` не показується як помилка.
  - `styles.css`: заповнення `.btn.is-pacing`.
  - `i18n.ts`: `err_too_soon`.
- **Довідка ведучого (`apps/web/src/help/settings.ts`).** Новий запис `setting.pacing`.
- **Наскрізні тести.** `pacing: true` в обох `buildApp`, `testTimeout` 180 → 300 с, сценарій 11b з кадрами `p11b-`.

**Технології:** TypeScript, vitest, Fastify + Socket.IO, React 19 + Vite, Testing Library (jsdom), Playwright. Нових залежностей немає.

**Рішення плану там, де специфікація мовчить (і рішення координатора):**

*Де живе мить кроку*
- `stepAt` ставить **сервер**, а не кожна функція рушія. Фаз і підкроків багато (`lockNow`, `finishRound`, `openQuestion`, `enterBoard`, `stepSurvey`, `tick` …), і ставити мітку в кожній — певний шлях щось пропустити. Тому одна чиста функція рушія `stamp(prev, next, now)` порівнює `stepKey` до й після будь-якої зміни. `RoomManager.commit` викликає її на кожну зміну: дії ведучого, дії гравців і таймери (`tick`). Отже, крок, який зробив таймер (автозакриття, кінець вікна «Ва-банк»), теж ставить мітку.
- Мить для `stamp`: у звичайному `commit` — `this.now()`, у гілці таймера — `room.tickedTo` (мить дедлайну).
- `stepKey(state)` — склеєні через `|`:
  - `phase`, `roundIndex`, `questionIndex`, `guidePage`;
  - для `play = state.plays[state.questionIndex]`: `play.survey?.shown`, `play.bluff?.stage`, `play.bluff?.shown`, `play.survival?.trial?.stage`, `play.ladder?.decision`, `play.ladder?.outcome === null`;
  - `final?.shown`, `final?.split`;
  - `duel?.stage`, `duel?.questions.length`;
  - `board?.circleNo`, `board?.done`;
  - `ladder?.contestantId`;
  - `decisionOpen(state)` («Ва-банк»).

  `paused`, `pausedAt`, `remainingMs`, `endsAt`, `splash` до ключа **не входять**: пауза й продовження мітки не переставляють.
- `stamp`: `next === prev` → `prev`; ключі рівні → `next` (зі старим `stepAt`, бо функції рушія розгортають стан); інакше `{ ...next, stepAt: now }`.
- **Без поля обмеження немає.** `createGame` поля не ставить. Перша зміна кроку на сервері з `pacing` його ставить, а лобі → «Почати гру» — це вже зміна кроку. Кімната версії 10 після відновлення лишається без затримки до першої зміни кроку. `stamp` не ставить поле, якщо ключ не змінився, навіть коли в `prev` його немає.

*Вікна (`paceWindow`)*
- `state.stepAt === undefined` → `null` для всіх дій.
- `'lock'`: етап `question` і `startedAt !== null` → `{ from: startedAt, until: startedAt + PACE_MS.lock }`, інакше `null`.
  - `startedAt` — це вже кінець заставки запитання (`openQuestion`), а `resume` зсуває його на тривалість паузи. Тож 3 с — це 3 с справжньої гри.
  - Фаза вигадок блефу («До вибору») і фаза вибору — так само: `startChoice` ставить свій `startedAt`. Задача 1 це перевіряє.
  - «Не чекати» (та сама `host:lock` після спільного часу) підпадає під те саме правило, але час тоді давно минув.
- `'skip'`: етап `board` → `{ from: stepAt, until: stepAt + PACE_MS.step }`. Кожен пропуск змінює `board.done` / `board.circleNo` і переставляє мітку.
- `'next'`:

  | Етап | `from` | `until` |
  |---|---|---|
  | `guide`, `round_end` | `stepAt` | `+ PACE_MS.step` |
  | `reveal`: «100 до 1» чи блеф, де `0 < shown < total` | `stepAt` | `+ PACE_MS.row` |
  | `reveal`: решта (зокрема перший рядок, вихід після останнього, кожен гравець фіналу й розподіл банку) | `stepAt` | `+ PACE_MS.step` |
  | `leaderboard`: відкрите випробування «Вибування» (`trialOpen`) | `startedAt ?? stepAt` | `+ PACE_MS.lock` |
  | `leaderboard`: вікно «Ва-банк» відкрите (`decisionOpen`) або учасник «Мільйонера» вирішує (`decisionPending`) | — | `null` (рушій відповість `deciding`) |
  | `leaderboard`: решта | `stepAt` | `+ PACE_MS.step` |
  | `intro` | `max(stepAt, кінець заставки 'round' / 'final', якщо вона є)` | `+ PACE_MS.intro` |
  | `duel` зі `stage === 'result'` | `stepAt` | `+ PACE_MS.step` |
  | інші (`lobby`, `wager`, `question`, `locked`, `board`, `finished`, `duel` на інших етапах) | — | `null` |

  `total` — `play.question.rows.length` для «100 до 1» і `bluffOrder(play).length` для блефу, як у `next`.
- **Вихід після останнього рядка — 2 с, а не 1 с.** Буквально за специфікацією: «“Далі” з розкриття — 2 с; кожен наступний рядок — 1 с». Вихід — це вже не рядок, а повна дошка заслуговує на погляд.
- **Гравці фіналу на розкритті — по 2 с.** Специфікація пільгу в 1 с дає лише рядкам «100 до 1» і варіантам блефу.
- **`intro` і учасник «Мільйонера».** `ladder.contestantId` входить до ключа. Після жеребу («Вибрати учасника») чи вибору ведучим (`host:ladder-pick`) «Почати драбину» чекає ще 3 с, щоб зал побачив, хто грає.
- **`locked` → `reveal` («Показати відповідь») не затримується.** У таблиці специфікації цього кроку немає, а подвійний дотик тепер зупиняється на розкритті: друге «Далі» чекає 2 с.
- `wager` → запитання фіналу («Показати запитання») — без затримки, як у специфікації.
- **«До гри» (`host:guide-skip`) не затримується.** Це явний пропуск усіх сторінок, як «Завершити раунд». Затримується лише «Далі» на сторінці.
- «Відкрити всі» (`host:survey-all`, `host:bluff-all`) затримується за вікном `'next'`. Поки рядки лишаються, це рядкове правило: 2 с до першого, 1 с після попереднього.
- Дуель: `next` на етапі `answer` («Наступне запитання дуелі» / «Підсумок дуелі») не затримується, «Продовжити гру» з `result` — 2 с. Оголошена дуель стартує з `next` того етапу, де її оголосили, тож діє вікно цього етапу.

*Сервер*
- Затримувані дії — таблиця в `manager.ts`:
  ```ts
  /** Кроки ведучого з мінімальним часом (11b) і вікно, яке їх стереже. Решта дій не затримується ніколи. */
  const PACED: Partial<Record<HostAction['type'], PacedAction>> = { next: 'next', lock: 'lock', skip: 'skip', 'survey-all': 'next', 'bluff-all': 'next' };
  ```
  Не затримуються: `start`, `pause`, `resume`, `end-round`, `end`, `override`, `judge`, `accept`, `repick`, `adjust`, `debuff`, `undebuff`, `kick`, `dice`, `roll`, `pick`, `clue`, `time`, `name`, `order`, `cloud-hide`, `bluff-remove`, `duel-*`, `guide-skip`, `team-*`, `captain`, а також `hostHint`, `hostLadderPick`, `hostLadderDecide` (окремі методи).
- Порядок перевірок у `host()`: спершу `alive`, потім `!state.paused && paced !== undefined && tooSoon(state, paced, now)` → `too_soon`. На паузі `next` і далі відповідає `paused`, як зараз.
- Перевірка — лише в `RoomManager.host`. Інших викликів `next` / `lock` / `skipTurn` поза тестами немає. Автопілот 11g планує свої кроки на `paceWindow(...).until` і йде через ту саму перевірку.
- Опція `pacing` (а не завжди ввімкнено) — за прецедентом `transitions`. Тести сервера, що тиснуть «Далі» підряд з тим самим годинником, лишаються зеленими без змін. Справжній сервер і наскрізні тести вмикають `pacing` явно.

*Пульт*
- `HostView.pace: HostPace` — абсолютні миті сервера. Пульт рахує залишок сам через наявний `offsetMs`, як таймер і заставки.
- `paceProgress(window, serverNow)`: `null` — чекати не треба; інакше частка 0…1.
  - Кінець вікна для пульта — `until + PACE_MARGIN_MS` (100 мс). Зсув годинника пульт рахує з `serverNow` у мить отримання, тож затримка мережі робить його оцінку пізнішою, а не ранішою. Запас 100 мс поверх цього означає, що кнопка не вмикається раніше, ніж дозволить сервер.
- `usePace(window, offsetMs)` перемальовує кожні 100 мс, поки вікно триває, і зупиняється, коли воно скінчилося.
- Головна кнопка бере вікно за своєю подією: `host:lock` → `pace.lock`, `host:next` → `pace.next`. Поки триває:
  - `disabled`;
  - клас `is-pacing`;
  - `style={{ '--pace': progress }}`.

  Підпис і доступне ім'я кнопки не змінюються: «Далі» лишається «Далі». На цьому тримаються наявні e2e: Playwright `click` сам чекає, доки кнопка стане активною.
- Те саме для «Відкрити всі» («100 до 1» — `HostScreen`, блеф — `HostBluff` через `busy`) за `pace.next` і для «Пропустити хід» за `pace.skip`.
- `too_soon` у відповіді (дотик на межі вікна) не показується: `setError(null)`. Решта помилок — як зараз.
- **Чому без гонки в e2e.** Сокет шле `state` синхронно в `commit`, ще до підтвердження дії (`socket.ts`: `manager.onEvent` → `push`, потім `ack`). Тож нове вікно доходить до пульта раніше, ніж кнопка звільняється від `stepping`.

*Заставки*
- `SPLASH_MS = { round: 3500, final: 4000, question: 1800, cell: 1500, duel: 2500, podium: 2500, trial: 2200 }`. `CELL_SURPRISE_MS` = 800 без змін, тож заставка клітинки ×2 = 2300 мс. Перегортання клітинки (`CELL_FLIP_MS = SPLASH_MS.cell`) і CSS (`--splash-ms`) беруть числа з shared — правок вебу немає.
- Тести, що звіряють буквальні 1200 / 2500 / 3200 / 1000 / 2000 тривалостей заставок і похідні числа (`21_200` тощо), переходять на `SPLASH_MS.*` (задача 4). Тести, що лише будують `splash` із власними числами (`Splash.test.tsx`), не змінюються.

*Довідка*
- Запис `setting.pacing` у темі «Налаштування», одразу після `newcomers`. Окремої теми «Як іде гра» немає, а це правило гри, яке ведучий шукатиме поруч із «Як грати». Числа — з `PACE_MS`. Текст — у задачі 6.

*Наскрізні тести*
- Тестового скорочення затримок немає. Наскрізні тести йдуть зі справжніми числами (`pacing: true`) і чекають, доки кнопка стане активною (Playwright `click` / `expect.poll(() => button.isDisabled())`), без `waitForTimeout`.
- Кожен крок ведучого додає до 2–3 с, тож `testTimeout` у `apps/server/e2e/vitest.config.ts` 180 → 300 с. Повний прогін довшає приблизно з 12 до 17 хв.

*Чого не робимо*
- кнопки «пропустити очікування» для ведучого;
- затримок для дій гравців;
- окремого скорочення затримок для тестів;
- змін сцени й телефонів, крім довших заставок;
- нового демо-вмісту (тексти e2e — без тем росії й СРСР).

## Глобальні обмеження

- **Старі вікторини, ігри й бали не змінюються.** Логіка `next`, `lock`, `skipTurn` та інших дій рушія не змінюється. Нове — лише `stamp`, `paceWindow` і перевірка в менеджері.
- **Анти-ціль:** затримка не ламає паузи, «Завершити раунд», «Завершити гру» й вилучення гравця. Задача 2 перевіряє кожну з цих дій одразу після кроку з `pacing: true`.
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`, тексти довідки — лише в `apps/web/src/help/*.ts`.
- Пульт 1280 і 375 px без горизонтальної прокрутки; сцена 1280 × 720 не змінюється.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2`. Якщо PGlite падає з браком пам'яті, запускати окремо:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=1 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- Наскрізні тести: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts`.
  - **Повний прогін триває близько 17 хвилин:** запускати у фоні й чекати завершення.
  - Кадри лежать в `apps/server/e2e/artifacts/shots`, префікс 11b — `p11b-`.
- Новий вміст (тексти e2e) — без тем росії й СРСР.
- Після останньої задачі й фінальної рецензії гілку зливають у `main`. Перед пушем перевірити `live_room` (14a підпроєкту 10). Пуш живих ігор не обриває: `READABLE_STATE_VERSIONS` містить 10.

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/game.ts` | `PACE_MS`, `ErrorCode` `'too_soon'` | 1 |
| новий `packages/engine/src/pacing.ts`, новий `pacing.test.ts`, `game.ts` (`GameState.stepAt`), `index.ts`, `restore.ts`, `restore.test.ts`, `apps/web/src/i18n.ts` (`err_too_soon`) | `stepKey`, `stamp`, `paceWindow`, `tooSoon`; версія 11 | 1 |
| `apps/server/src/rooms/manager.ts`, `manager.test.ts`, `app.ts`, `main.ts`, `socket.test.ts` | опція `pacing`, `stamp` у `commit`, `too_soon` у `host()` | 2 |
| `packages/shared/src/views.ts`, `packages/engine/src/pacing.ts` (`hostPace`), `views.ts`, `pacing.test.ts`, `apps/web/src/screens/HostScreen.test.tsx` (фікстура) | `HostView.pace` | 3 |
| `packages/shared/src/game.ts`, тести з буквальними тривалостями заставок (`game.splash.test.ts`, `views.splash.test.ts`, `restore.test.ts`, `socket.test.ts` та інші, що впадуть) | довші заставки | 4 |
| новий `apps/web/src/pace.ts`, новий `pace.test.ts`, `screens/HostScreen.tsx`, `screens/HostBluff.tsx`, `styles.css`, `HostScreen.test.tsx`, `HostBluff.test.tsx` | кнопки ведучого чекають і заповнюються | 5 |
| `apps/web/src/help/settings.ts`, `help/host-help.test.ts` | `setting.pacing` | 6 |
| `apps/server/e2e/full-game.e2e.ts`, `apps/server/e2e/vitest.config.ts` | `pacing: true`, 300 с, сценарій 11b | 7 |

## Порядок збирання

- 1 → 2 → 3 → 5. Задача 4 незалежна (можна паралельно з 1–3). Задача 6 — після 1 (`PACE_MS`). Задача 7 — остання.
- **Навмисні зміни наявних очікувань** (лише такі):
  - `restore.test.ts`:
    - `STATE_SHAPE.GameState` + `'stepAt'`;
    - новий `KEYS[11]`;
    - `READABLE_STATE_VERSIONS` `[2, …, 10]` → `[2, …, 11]`;
  - задача 4: буквальні тривалості заставок (1200 / 2500 / 3200 / 1000 / 2000 і похідні) у тестах рушія, сервера й вебу → вирази через `SPLASH_MS`;
  - `HostScreen.test.tsx`: фікстура `view()` отримує `pace: { next: null, lock: null, skip: null }` (задача 3);
  - `host-help.test.ts`, якщо звіряє перелік записів налаштувань буквально (задача 6);
  - `apps/server/e2e/vitest.config.ts`: `testTimeout` 180 000 → 300 000; обидва `buildApp` у `full-game.e2e.ts` + `pacing: true` (задача 7);
  - сценарії e2e, що впадуть після `pacing: true`: виправляти лише очікуванням стану (кнопка активна, елемент з'явився), не сном і не зміною вмісту. Кожну таку правку назвати у звіті задачі 7.
  - Якщо падає інше, рецензент розбирає причину, а не правку очікування.

## На що дивитися рецензентові

1. **Ключ кроку.** Пауза, продовження, відповіді гравців, `tick` без зміни етапу мітки не переставляють. Кожен рядок «100 до 1» / варіант блефу, сторінка «Як грати», гравець фіналу, пропуск ходу, кінець вікна «Ва-банк», рішення учасника драбини — переставляють. Тести: задача 1.
2. **Вікна.** Таблиця з розділу «Вікна» — один тест на рядок, з числами. Без `stepAt` — усе `null`. Тести: задача 1.
3. **Сервер.** `too_soon` не змінює стану й не шле `changed`. Не затримуються пауза, продовження, «Завершити раунд», «Завершити гру», вилучення, оцінка, коригування, дебафи, підказки й кубики. На паузі — `paused`, а не `too_soon`. Без `pacing` поля `stepAt` немає. Тести: задача 2.
4. **Версія.** `GAME_STATE_VERSION` 11, `KEYS[11]`, представник зі `stepAt` проходить JSON і `suspend`. `READABLE_STATE_VERSIONS` `[2, …, 11]`, пояснення в коментарі. Тести: задача 1.
5. **Зріз.** `pace` лише в зрізі пульта; сцена й телефон його не мають. Тести: задача 3.
6. **Заставки.** Нові числа в одному місці (`SPLASH_MS`), тести звіряють через `SPLASH_MS`, а не нові буквальні числа. Тести: задача 4.
7. **Пульт.** Кнопка неактивна й заповнюється, підпис той самий. `too_soon` без повідомлення. Таймер зупиняється, коли вікно скінчилося, і прибирається на демонтажі. Тести: задача 5.
8. **Довідка.** Числа з `PACE_MS`, перелік дій, що не затримуються, збігається з `PACED`. Тести: задача 6.
9. **E2E.** Жодного нового `waitForTimeout` заради затримки: лише очікування стану. Кадри `p11b-*`. Задача 7.

---

### Задача 1. Рушій: мить кроку, вікна мінімального часу, `too_soon`, `GAME_STATE_VERSION` 11

**Files:**
- Modify: `packages/shared/src/game.ts`
- Create: `packages/engine/src/pacing.ts`, `packages/engine/src/pacing.test.ts`
- Modify: `packages/engine/src/game.ts` (лише тип `GameState`), `packages/engine/src/index.ts`, `packages/engine/src/restore.ts`, `apps/web/src/i18n.ts`
- Test: `packages/engine/src/restore.test.ts`

**Interfaces:**
- `packages/shared/src/game.ts`, поруч із `SPLASH_MS`:
  ```ts
  /** Мінімальний час перед кроком ведучого, мс (11b): крок (розкриття, таблиця, кінець раунду, «Як грати», пропуск ходу, після дуелі), рядок «100 до 1» / варіант блефу, заставка раунду (після її кінця), дострокове закриття (після старту). */
  export const PACE_MS = { step: 2000, row: 1000, intro: 3000, lock: 3000 } as const;
  ```
  `ErrorCode`, наприкінці: `/** Крок ведучого раніше за мінімальний час (11b). */ | 'too_soon'`.
- `packages/engine/src/game.ts`, у `GameState` після `teams?`:
  ```ts
  /** Мить останньої зміни кроку (11b): ставить сервер через stamp; без ключа мінімального часу немає (стан до 11b, тести рушія). */
  stepAt?: number;
  ```
- `packages/engine/src/pacing.ts`:
  ```ts
  import { PACE_MS } from '@quiz/shared';
  import { bluffOrder, bluffPlayOf } from './bluff';
  import type { GameState } from './game';
  import { decisionPending } from './ladder';
  import { surveyPlayOf } from './survey';
  import { trialOpen } from './survival';
  import { decisionOpen } from './wipeout';

  /** Кроки ведучого з мінімальним часом (11b). */
  export type PacedAction = 'next' | 'lock' | 'skip';
  /** Вікно очікування: від from (час сервера) до until, раніше за until крок не діє. */
  export interface PaceWindow { from: number; until: number }

  /** Який зараз крок гри: зміна рядка — новий крок (див. план 11b, «Де живе мить кроку»). */
  export function stepKey(state: GameState): string;
  /** next після зміни кроку отримує stepAt = now; без зміни — той самий об'єкт next; next === prev → prev. */
  export function stamp(prev: GameState, next: GameState, now: number): GameState;
  /** Вікно для дії; null — дія не затримується (або немає stepAt). */
  export function paceWindow(state: GameState, action: PacedAction): PaceWindow | null;
  /** Чи дія ще зарано на мить now. */
  export function tooSoon(state: GameState, action: PacedAction, now: number): boolean;
  ```
  - Тип `PaceWindow` у задачі 3 переїжджає в shared (`views.ts`), і `pacing.ts` імпортує його звідти. Тут оголошується локально, щоб задача 1 не торкалася зрізів. Якщо зручніше, його можна одразу оголосити в `packages/shared/src/views.ts` поруч із `HostView`.
  - Якщо `bluffPlayOf` / `surveyPlayOf` чи інші помічники тягнуть циклічний імпорт під час завантаження модулів (`game.ts` ↔ `pacing.ts`), `pacing.ts` не імпортується з `game.ts`. Його імпортують лише `views.ts`, `index.ts` і тести.
- `index.ts`: `export * from './pacing';`.
- `restore.ts`:
  - `GAME_STATE_VERSION = 11`, рядок коментаря «11 — 11b: GameState.stepAt (мить останньої зміни кроку для мінімального часу перед кроком ведучого)»;
  - `READABLE_STATE_VERSIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10, GAME_STATE_VERSION]`, пояснення: «10 → 11 лише додала необов'язкове GameState.stepAt; без нього мінімального часу немає до першої зміни кроку, тож кімната, збережена до розгортання 11b, теж відновлюється».
- `i18n.ts`: `err_too_soon: 'Ще мить: гравці мають побачити екран.'` (поруч з `err_deciding`).

- [ ] **Step 1: Write the failing tests** — `pacing.test.ts`. `T0 = 1_000_000` з `./testing/buffs`, помічники `lobbyWith`, `lobbyWithSplash`, `lobbyWithGuide`, `must` з `./testing/helpers`, фікстури з `./testing/fixtures`. Помічник:
  ```ts
  /** Крок рушія, як його проводить сервер з pacing: результат через stamp на ту саму мить. */
  const go = (prev: GameState, result: Result, now: number) => stamp(prev, must(result), now);
  ```
  Вікторина `quiz2 = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q1b')]), classicRound('r2', [withId(single, 'q2a')])], { leaderboard: 'each' })`, гравці «Оля», «Петро».
  - **Без поля:**
    - `'stepAt' in lobbyWith(quiz2, 'Оля')` → `false`;
    - `paceWindow(lobby, 'next')`, `'lock'`, `'skip'` → `null`;
    - `must(start(lobby, T0))` (без `stamp`) → `paceWindow(..., 'next') === null`, `tooSoon(..., 'next', T0) === false`.
  - **Мітка:**
    - `s = go(lobby, start(lobby, T0), T0)` → `s.phase === 'intro'`, `s.stepAt === T0`;
    - `stamp(s, { ...s, players: [...s.players] }, T0 + 500).stepAt === T0` (ключ той самий);
    - `stamp(s, s, T0 + 500)` повертає `s` (той самий об'єкт).
  - **`intro` без переходів:** `paceWindow(s, 'next')` → `{ from: T0, until: T0 + 3000 }`; `tooSoon(s, 'next', T0 + 2999)` → `true`; `tooSoon(s, 'next', T0 + 3000)` → `false`.
  - **Запитання:**
    - `q = go(s, next(s, T0 + 3000), T0 + 3000)` → `q.stepAt === T0 + 3000`;
    - `paceWindow(q, 'next') === null`;
    - `paceWindow(q, 'lock')` → `{ from: T0 + 3000, until: T0 + 6000 }`;
    - відповідь гравця (`submitAnswer(q, 'p1', { type: 'single', optionId: 'b' }, T0 + 4000)` через `go`) мітки не змінює.
  - **Пауза:**
    - `p = go(q, pause(q, T0 + 4000), T0 + 4000)` → `stepAt === T0 + 3000`;
    - `r = go(p, resume(p, T0 + 14_000), T0 + 14_000)` → `stepAt === T0 + 3000`;
    - `paceWindow(r, 'lock')` → `{ from: T0 + 13_000, until: T0 + 16_000 }` (`startedAt` зсунуто на 10 с паузи).
  - **Розкриття й таблиця:**
    - з `q`: `lock` на `T0 + 6000` → `locked`: `paceWindow(..., 'next') === null` (крок «Показати відповідь» не затримується);
    - `next` на `T0 + 7000` → `reveal`: `{ from: T0 + 7000, until: T0 + 9000 }`;
    - `next` на `T0 + 9000` → `leaderboard`: `{ from: T0 + 9000, until: T0 + 11_000 }`.
  - **Кінець раунду:** `endRound` через `go` на `T0 + 20_000` → `round_end`: `{ from: T0 + 20_000, until: T0 + 22_000 }`. Наступний `next` на `T0 + 22_000` → `intro` раунду 2: `{ from: T0 + 22_000, until: T0 + 25_000 }`.
  - **`intro` із заставкою:** `lobbyWithSplash(quiz2, 'Оля', 'Петро')`, `go(…, start(…, T0), T0)` → `{ from: T0 + SPLASH_MS.round, until: T0 + SPLASH_MS.round + PACE_MS.intro }`. Далі `next` на тій межі → запитання: `paceWindow(..., 'lock')` → `{ from: T1 + SPLASH_MS.question, until: T1 + SPLASH_MS.question + PACE_MS.lock }`, де `T1` — мить `next`.
  - **Фінал:** `makeRoundsQuiz([finalRound('f', withId(single, 'f1'))])` із заставками → вікно `intro` від кінця заставки `final` (`SPLASH_MS.final`).
  - **«Як грати»:**
    - `lobbyWithGuide(quiz2, 'Оля', 'Петро')`, `go(start)` на `T0` → `guide`, `{ from: T0, until: T0 + 2000 }`;
    - `next` на `T0 + 2000` → `guidePage` 1, `stepAt === T0 + 2000`;
    - `skipGuide` (через `go`) на `T0 + 2100` → `intro`, `stepAt === T0 + 2100`.
  - **«100 до 1»:** `makeRoundsQuiz([classicRound('r1', [survey])])`. Відповідь обох, `lock`, `next` на `R` → `reveal`, `survey.shown === 0`: `{ R, R + 2000 }`. Далі:
    - `next` на `R + 2000` → `shown` 1: `{ R + 2000, R + 3000 }`;
    - `next` на `R + 3000` → `shown` 2: `{ R + 3000, R + 4000 }`;
    - ще три `next` через 1 с → `shown` 5 (`= rows.length`): `{ t, t + 2000 }`;
    - окремо `revealSurveyAll` з `shown` 1 → `shown` 5, нова мітка, вікно 2 с.
  - **Блеф:** вікторина з `bluff` (як у `game.bluff.test.ts`).
    - Фаза вигадок: `paceWindow(..., 'lock')` від `startedAt`.
    - Після `lock(s, now)` («До вибору») фаза вибору: `paceWindow(..., 'lock').from` дорівнює новому `startedAt` (`startChoice`).
    - На розкритті — те саме рядкове правило, що в «100 до 1», за `bluffOrder(play).length`.
  - **Поле:** раунд поля з порядком без кубиків (як у `game.board.test.ts`).
    - На `board`: `paceWindow(..., 'skip')` → `{ t, t + 2000 }`, `paceWindow(..., 'next') === null`;
    - `skipTurn` через `go` на `t + 2000` → нова мітка `t + 2000` (`board.done` змінився).
  - **Дуель** (як у `game.duel-play.test.ts`): на етапі `answer` `paceWindow(..., 'next') === null`; на `result` → `{ t, t + 2000 }`.
  - **«Вибування»** (як у `game.survival-trial.test.ts`): з відкритим випробуванням `paceWindow(..., 'next')` → `{ from: startedAt, until: startedAt + 3000 }`. Після закриття (`next`) — нова мітка й `{ t, t + 2000 }`.
  - **«Ва-банк»** (як у `game.wipeout.test.ts`): з відкритим вікном рішення `paceWindow(..., 'next') === null`. `tick` після кінця вікна через `stamp` на мить `endsAt` → нова мітка, `{ endsAt, endsAt + 2000 }`.
  - **«Мільйонер»** (як у `game.ladder.test.ts`): на `intro` жереб (`next`) через `go` → `contestantId` з'явився, нова мітка, вікно `intro` від неї. На `leaderboard` з `decisionPending` → `null`.
  - **Стан старої версії:** будь-який зі станів вище з видаленим `stepAt` (`const { stepAt: _, ...old } = s`) → три вікна `null`.
  - `restore.test.ts`:
    - `STATE_SHAPE.GameState` + `'stepAt'`;
    - новий `KEYS[11]`: копія `KEYS[10]` з `GameState`, де в алфавітному порядку додано `stepAt`;
    - `READABLE_STATE_VERSIONS` `[2, 3, 4, 5, 6, 7, 8, 9, 10, 11]`;
    - до `representative()` додати стан зі `stepAt`: `stamp(lobby, must(start(lobby, T0)), T0)` на класиці. Він має пройти JSON (`roundTrip`) і `suspend` (той самий `stepAt` після `suspend(s, T0 + 1000)`).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/pacing.test.ts packages/engine/src/restore.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src packages/engine/src apps/web/src/i18n.ts
  git commit -m "feat(engine): pacing — the moment of the last step change (GameState.stepAt, state version 11 keeping 10 readable) stamped by one stepKey comparison, minimum-time windows for next, lock and skip (2 s on reveal, leaderboard, round end and guide pages, 1 s per survey row or bluff option, 3 s after the round splash, early close 3 s after the real start) and a too_soon error; no stepAt, no limit"
  ```

### Задача 2. Сервер: опція `pacing`, мітка в `commit`, `too_soon` для кроків ведучого

**Files:**
- Modify: `apps/server/src/rooms/manager.ts`, `apps/server/src/app.ts`, `apps/server/src/main.ts`
- Test: `apps/server/src/rooms/manager.test.ts`, `apps/server/src/socket.test.ts`

**Interfaces:**
- `manager.ts`:
  - `RoomManagerOptions.pacing?: boolean` з коментарем «Мінімальний час перед кроками ведучого (11b); типово вимкнено, справжній сервер (main.ts) вмикає»; поле `private readonly pacing: boolean`.
  - `PACED` з розділу «Сервер» (імпорт `stamp`, `tooSoon`, `type PacedAction` з `@quiz/engine`).
  - `commit(room, state, at = this.now())`: `room.state = this.pacing ? stamp(room.state, state, at) : state;` далі як зараз. Гілка таймера в `reschedule` передає `room.tickedTo`: `this.commit(room, ticked, room.tickedTo)`.
  - `host()`: після `alive`:
    ```ts
    const paced = PACED[action.type];
    if (paced !== undefined && !state.paused && tooSoon(state, paced, this.now())) return { ok: false, error: 'too_soon' };
    ```
- `app.ts`: `AppOptions.pacing?: boolean` («Мінімальний час перед кроками ведучого (11b); типово вимкнено, справжній сервер (main.ts) і наскрізні тести вмикають»), передати в `RoomManager` поруч із `transitions`.
- `main.ts`: `pacing: true` поруч із `transitions: true`, коментар «Єдине місце, де вмикається мінімальний час справжньої гри (11b)».

- [ ] **Step 1: Write the failing tests**
  - `manager.test.ts`, новий `describe('pacing (11b)')`. Помічник `pacedPlaying(quiz = makeQuiz([single, text]))`: `new FakeScheduler()`, `new RoomManager(scheduler, () => 0.5, { pacing: true })`, ведучий і два гравці (як `playing()`), але лише `start`. Мить старту `T = scheduler.now()`.
    - Після `start`: `room.state.stepAt === T`. `host next` одразу → `{ ok: false, error: 'too_soon' }`, `room.state.phase === 'intro'`, жодної нової події `changed`. `advance(2999)` → `too_soon`; `advance(1)` → `{ ok: true }`, етап `question`, `stepAt === T + 3000`.
    - `host lock` одразу → `too_soon`; `advance(3000)` → ok, етап `locked`.
    - `host next` одразу після `locked` → ok (`reveal`), бо «Показати відповідь» не затримується.
    - Подвійний `next` на `reveal`: перший після `advance(2000)` → ok (`leaderboard` чи наступне запитання — за налаштуванням `makeQuiz`), другий одразу → `too_soon`, стан той самий об'єкт.
    - **Ніколи не затримуються** — кожна дія одразу після щойно зробленого кроку (на `reveal`, мітка щойно поставлена), кожна у свіжій кімнаті:
      - `pause` → ok, а `next` на паузі → `paused` (не `too_soon`); `resume` одразу → ok;
      - `adjust` (+100 Олені) → ok;
      - `override` текстової відповіді (`makeQuiz([text])`, `grade: 'correct'`) → ok;
      - `kick` Тараса → ok;
      - `end-round` → ok, етап `round_end` / `finished`;
      - `end` → ok, `finished`.
    - **«Відкрити всі»:** вікторина `makeQuiz([survey])` (фікстура `survey`); на `reveal`: `survey-all` одразу → `too_soon`, після `advance(2000)` → ok. `next` з `shown` 1 → `too_soon` до `advance(1000)`.
    - **Таймер ставить мітку:** запитання з `timeLimit` 20 с без відповідей → `advance` до кінця часу → етап `locked`, `stepAt` — мить дедлайну (`room.tickedTo`).
    - **Без `pacing`:** звичайний `setup()` → після `start` `'stepAt' in room.state === false`, `next` одразу → ok. Решта наявних тестів не змінюються.
  - `socket.test.ts`, новий `describe('pacing over real sockets (11b)')` за зразком «transition splashes over real sockets»: `buildApp({ db, auth: TEST_AUTH, pacing: true, scheduler })` з `const scheduler = new FakeScheduler()`.
    - `host:start` → ok; `host:next` → `{ ok: false, error: 'too_soon' }`;
    - `scheduler.advance(3000)` → `host:next` → ok, `until(olena, inPhase('question'))`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/rooms/manager.test.ts apps/server/src/socket.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/src
  git commit -m "feat(server): a pacing option (on in main.ts) — every commit stamps the step moment, timers at their deadline; next, lock, skip and «open all» answer too_soon before their window without touching the room; pause, resume, end round, end game, kick, grading, adjustments, debuffs, hints and dice never wait"
  ```

### Задача 3. Зріз пульта: вікна очікування (`HostView.pace`)

**Files:**
- Modify: `packages/shared/src/views.ts`, `packages/engine/src/pacing.ts`, `packages/engine/src/views.ts`
- Test: `packages/engine/src/pacing.test.ts`, `apps/web/src/screens/HostScreen.test.tsx` (лише фікстура)

**Interfaces:**
- `packages/shared/src/views.ts`:
  ```ts
  /** Вікно мінімального часу перед кроком ведучого (11b): миті сервера; раніше за until крок не діє. */
  export interface PaceWindow { from: number; until: number }
  /** Вікна кроків ведучого: «Далі» (і «Відкрити всі»), «Закрити», «Пропустити хід»; null — без очікування. */
  export interface HostPace { next: PaceWindow | null; lock: PaceWindow | null; skip: PaceWindow | null }
  ```
  `HostView.pace: HostPace` з коментарем «Мінімальний час кроків (11b); лише пульт».
- `pacing.ts`: `PaceWindow` імпортується з `@quiz/shared` (локальне оголошення прибрати); новий `export function hostPace(state: GameState): HostPace` → `{ next: paceWindow(state, 'next'), lock: paceWindow(state, 'lock'), skip: paceWindow(state, 'skip') }`.
- `views.ts`: у `hostView` — `pace: hostPace(state)`.
- `HostScreen.test.tsx`: фікстура `view()` + `pace: { next: null, lock: null, skip: null }`.

- [ ] **Step 1: Write the failing tests** (`pacing.test.ts`, новий `describe('host view pace')`)
  - `hostView(s).pace` для `intro` зі `stepAt` (без переходів, мітка `T0`) → `{ next: { from: T0, until: T0 + 3000 }, lock: null, skip: null }`;
  - на запитанні: `lock` заданий, `next` і `skip` — `null`;
  - стан без `stepAt` → `{ next: null, lock: null, skip: null }`;
  - `'pace' in stageView(s)` і `'pace' in playerView(s, 'p1')` → `false`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/pacing.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src packages/engine/src apps/web/src/screens/HostScreen.test.tsx
  git commit -m "feat: the host view carries pace windows for next, lock and skip (server moments); the stage and phones get none"
  ```

### Задача 4. Довші заставки

**Files:**
- Modify: `packages/shared/src/game.ts`
- Test: тести з буквальними тривалостями заставок. Відомі заздалегідь:
  - `packages/engine/src/game.splash.test.ts` (1200, 2500, 3200, `21_200`, `36_200`, `6200` …);
  - `packages/engine/src/views.splash.test.ts`;
  - `packages/engine/src/restore.test.ts` (рядки 134–137);
  - `apps/server/src/socket.test.ts` (рядок 132, `2500`).

  Решту покаже прогін; підозрювані — файли з `transitions: true` / `lobbyWithSplash`: `game.guide.test.ts`, `game.ladder*.test.ts`, `game.survival*.test.ts`, `game.wall.test.ts`, `game.wipeout.test.ts`, `views.marks.test.ts`, `views.survival.test.ts`, `manager.test.ts`.

**Interfaces:**
- `SPLASH_MS = { round: 3500, final: 4000, question: 1800, cell: 1500, duel: 2500, podium: 2500, trial: 2200 }`. Коментар над ним: «8c; 11b — довші приблизно в півтора раза (крім п'єдесталу й випробування)». `CELL_SURPRISE_MS` без змін.

- [ ] **Step 1: Write the failing test.** `packages/shared/src/game.test.ts` (створити, якщо немає; інакше дописати): `expect(SPLASH_MS).toEqual({ round: 3500, final: 4000, question: 1800, cell: 1500, duel: 2500, podium: 2500, trial: 2200 })`, `expect(CELL_SURPRISE_MS).toBe(800)`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared` → FAIL.
- [ ] **Step 3: Implement.** Змінити числа. Прогнати `pnpm vitest run --maxWorkers=2 packages apps/web` і `pnpm vitest run --maxWorkers=1 apps/server`. Кожне падіння через буквальну тривалість переписати через `SPLASH_MS.*`. Наприклад:
  - `T0 + 1200` → `T0 + SPLASH_MS.question`;
  - `[T0 + 1200, T0 + 21_200]` → `[T0 + SPLASH_MS.question, T0 + SPLASH_MS.question + 20_000]`;
  - `toBe(2500)` для раунду → `toBe(SPLASH_MS.round)`.

  Нових буквальних чисел не вписувати. Якщо тест падає з іншої причини (не тривалість заставки), зупинитися й розібратися.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages apps/server/src apps/web/src
  git commit -m "feat: transition splashes about half again as long — question 1.8 s, cell 1.5 s, round 3.5 s, final 4 s, duel 2.5 s (surprise, podium and trial unchanged); tests read SPLASH_MS instead of literal durations"
  ```

### Задача 5. Пульт: кнопки чекають і заповнюються, `too_soon` без повідомлення

**Files:**
- Create: `apps/web/src/pace.ts`, `apps/web/src/pace.test.ts`
- Modify: `apps/web/src/screens/HostScreen.tsx`, `apps/web/src/screens/HostBluff.tsx` (лише якщо `busy` треба перейменувати — інакше без змін), `apps/web/src/styles.css`
- Test: `apps/web/src/screens/HostScreen.test.tsx`, `apps/web/src/screens/HostBluff.test.tsx` (якщо змінюється проп)

**Interfaces:**
- `pace.ts`:
  ```ts
  import type { PaceWindow } from '@quiz/shared';
  /** Запас поверх кінця вікна: кнопка вмикається трохи пізніше, ніж дозволяє сервер (11b). */
  export const PACE_MARGIN_MS = 100;
  /** Крок перемальовування смужки, мс. */
  export const PACE_TICK_MS = 100;
  /** Частка вікна, що минула (0…1), або null — чекати не треба (немає вікна чи воно скінчилося з запасом). */
  export function paceProgress(window: PaceWindow | null, serverNow: number): number | null;
  /** paceProgress на поточну мить (Date.now() + offsetMs); перемальовує кожні PACE_TICK_MS, поки вікно триває. */
  export function usePace(window: PaceWindow | null, offsetMs: number): number | null;
  ```
  - `paceProgress`: `end = until + PACE_MARGIN_MS`; `serverNow >= end` → `null`; інакше `clamp((serverNow − from) / (end − from), 0, 1)`.
  - `usePace`: `useState`-лічильник і `setInterval(PACE_TICK_MS)`, лише поки `paceProgress(...) !== null`. Інтервал прибирається, коли вікно скінчилося, змінилося (`window?.from`, `window?.until` у залежностях) і на демонтажі.
- `HostScreen.tsx`:
  ```ts
  const nextPace = usePace(view.pace.next, offsetMs);
  const lockPace = usePace(view.pace.lock, offsetMs);
  const skipPace = usePace(view.pace.skip, offsetMs);
  const mainPace = main?.event === 'host:lock' ? lockPace : main?.event === 'host:next' ? nextPace : null;
  ```
  - Головна кнопка: `disabled={… наявне … || mainPace !== null}`, `className={mainPace !== null ? 'btn btn-primary is-pacing' : 'btn btn-primary'}`, `style={mainPace !== null ? ({ '--pace': mainPace } as CSSProperties) : undefined}`. Підпис без змін.
  - «Відкрити всі» («100 до 1»): `disabled={stepping || nextPace !== null}`, ті самі клас і стиль від `nextPace`.
  - `HostBluff`: `busy={stepping || nextPace !== null}`. Заповнення в блефі — лише на головній кнопці, «Відкрити всі» просто неактивна.
  - «Пропустити хід»: `disabled={skipPace !== null}`, клас `btn is-pacing` і `--pace` від `skipPace`.
  - `act`: `setError(result.ok || result.error === 'too_soon' ? null : errorText(result.error));`.
- `styles.css`:
  ```css
  /* 11b: поки сервер не дозволяє крок, кнопка заповнюється зліва направо (--pace 0…1); підпис той самий. */
  .btn.is-pacing {
    background-image: linear-gradient(90deg, rgb(255 255 255 / 0.22) calc(var(--pace, 0) * 100%), transparent 0);
    cursor: progress;
  }
  .btn.is-pacing:disabled { opacity: 0.85; }
  ```
  Перевірити наявне правило `.btn:disabled`: заповнення має бути видно і на `btn-primary`, і на звичайній `btn` (кадри задачі 7).

- [ ] **Step 1: Write the failing tests**
  - `pace.test.ts`, вікно `{ from: 1000, until: 3000 }`:
    - `paceProgress(null, 0)` → `null`;
    - `paceProgress(w, 500)` → `0`;
    - `paceProgress(w, 1000)` → `0`;
    - `paceProgress(w, 2050)` → `0.5`;
    - `paceProgress(w, 3099)` — не `null`, менше за 1;
    - `paceProgress(w, 3100)` → `null`.
    - Хук (`renderHook`, `vi.useFakeTimers()`, `vi.setSystemTime(1000)`): спершу `0`; після `advanceTimersByTime(1050)` → `0.5`; після ще `1050` → `null`; `vi.getTimerCount()` → `0` (інтервал прибрано).
  - `HostScreen.test.tsx`, новий `describe('pacing (11b)')` з `vi.useFakeTimers(); vi.setSystemTime(T)` і `afterEach(vi.useRealTimers)`:
    - `reveal` з `pace.next = { from: T − 500, until: T + 1500 }`: кнопка «Далі» `disabled`, клас `is-pacing`, `Number(style.getPropertyValue('--pace'))` ≈ `500 / 2100` (`toBeCloseTo(0.238, 2)`). Після `advanceTimersByTime(1599)` ще `disabled`; після `advanceTimersByTime(1)` — активна, без `is-pacing`. Клік шле `host:next`.
    - `question` з `pace.lock = { from: T, until: T + 3000 }`: «Закрити» `disabled` і з `is-pacing`; `pace.next` на цьому етапі не впливає.
    - `reveal` «100 до 1» (`survey: { shown: 0, total: 5, … }` як у тесті «the main button opens the next row…») з `pace.next`: «Відкрити рядок 1 з 5» і «Відкрити всі» обидві `disabled`.
    - Блеф на розкритті (як у тесті «reveal: «Відкрити варіант 2 з 5» steps…») з `pace.next`: «Відкрити всі» `disabled`.
    - `board` з `pace.skip`: «Пропустити хід» `disabled`, `is-pacing`; після кінця вікна — активна.
    - `send` повертає `{ ok: false, error: 'too_soon' }` → після кліку немає `role="alert"`. З `{ ok: false, error: 'wrong_phase' }` alert є (як зараз).
    - Наявні тести з `pace` = `null` — зелені без змін.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/pace.test.ts apps/web/src/screens` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): the host's next, close, «open all» and skip buttons stay disabled and fill like a progress bar until the server allows the step, with the same label; a too_soon answer shows no error"
  ```

### Задача 6. Довідка ведучого: запис про мінімальний час

**Files:**
- Modify: `apps/web/src/help/settings.ts`
- Test: `apps/web/src/help/host-help.test.ts`

**Interfaces:**
- `SETTING_HELP_KEYS`: `'pacing'` одразу після `'newcomers'`.
- `SETTING_HELP.pacing` (імпорт `PACE_MS` з `@quiz/shared`; `s = (ms: number) => \`${ms / 1000} с\``):
  ```ts
  pacing: {
    title: 'Пауза перед «Далі»',
    what: 'Гра не дає перескочити екран: крок ведучого, що веде гру далі, діє лише після короткої паузи, щоб усі встигли побачити розкриття й таблицю.',
    how: [
      `«Далі» з розкриття, таблиці, підсумків раунду й кожної сторінки «Як грати» — не раніше ніж через ${s(PACE_MS.step)}; кожен наступний рядок «100 до 1» і варіант блефу — через ${s(PACE_MS.row)}.`,
      `«Почати раунд» — через ${s(PACE_MS.intro)} після заставки раунду; «Закрити» запитання достроково — через ${s(PACE_MS.lock)} після його старту; «Пропустити хід» на полі й «Продовжити гру» після дуелі — через ${s(PACE_MS.step)}.`,
      'Поки пауза триває, кнопка неактивна й заповнюється, як смужка. Подвійний дотик нічого не пропускає.',
      'Пауза, «Завершити раунд», «Завершити гру», вилучення гравця, оцінка відповідей, коригування балів, дебафи, підказки й кубики діють одразу.',
    ],
    points: ['На бали не впливає.'],
    tip: ['Натискайте спокійно: кнопка сама покаже, коли можна далі.'],
  },
  ```
  Це не налаштування вікторини: перемикача в редакторі немає й не з'являється.

- [ ] **Step 1: Write the failing tests** (`host-help.test.ts`):
  - `helpIds('settings')` містить `'setting.pacing'` одразу після `'setting.newcomers'`; наявна перевірка «filled» проходить і для нього;
  - `text('setting.pacing')` містить `'2 с'`, `'1 с'`, `'3 с'`, «Завершити раунд», «вилучення гравця»;
  - `searchHelp('пауза')` містить `'setting.pacing'`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/help` → FAIL.
- [ ] **Step 3: Implement.** Якщо інші тести довідки звіряють буквально перелік чи кількість записів налаштувань, оновити їх (навмисна зміна).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src/help
  git commit -m "feat(web): host help on the pause before «Далі» — the minimum times from PACE_MS, the filling button and what never waits"
  ```

### Задача 7. Наскрізний сценарій 11b з кадрами; наявні сценарії зі справжніми затримками

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`, `apps/server/e2e/vitest.config.ts`

**Interfaces:**
- `vitest.config.ts`: `testTimeout: 300_000` з коментарем «11b: кожен крок ведучого чекає мінімальний час».
- `full-game.e2e.ts`:
  - обидва `buildApp` (у `beforeAll` і `relisten`) + `pacing: true`;
  - новий помічник поруч із `click`:
    ```ts
    /** Скільки мс кнопка була неактивною від цієї миті (11b): чекає, доки вона стане активною. */
    async function enabledAfter(button: Locator, timeout = 8000): Promise<number> {
      const from = Date.now();
      await expect.poll(() => button.isDisabled(), { timeout }).toBe(false);
      return Date.now() - from;
    }
    ```
    `Locator` — тип із `playwright` поруч з наявним імпортом `Page` (додати до імпорту, якщо його там немає).
  - вміст сценарію — без тем росії й СРСР.

- [ ] **Step 1: Перевести наявні сценарії на справжні затримки.** Додати `pacing: true` і 300 с. `pnpm build`, потім у фоні повний прогін (`E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts`, ≈ 17 хв).
  - Більшість сценаріїв мають пройти без змін: `click` сам чекає, доки кнопка стане активною.
  - Що може впасти й як лагодити (лише очікуванням стану):
    - **(а)** Ведучий тисне «Закрити», поки гравці ще відповідають, а запитання за 3 с закривається само. Тоді кнопки «Закрити» вже немає. Лагодити так: чекати кнопку, яка буде після закриття («Показати відповідь»), або дати відповідь до закриття.
    - **(б)** Очікування з коротким `timeout`, що стартує до кліку ведучого й не дочікується кінця затримки. Лагодити так: збільшити `timeout` саме цього очікування або перенести його після кліку.
    - **(в)** `toNextQuestion` і схожі помічники з `waitFor({ timeout: 3000 })` після «Далі». Кнопка таблиці з'являється відразу після кроку, тож має працювати. Якщо ні — `timeout` 6000.
  - Кожну правку назвати в коміті й у звіті задачі.
- [ ] **Step 2: Add the scenario** у кінець файлу за зразком 11a:
  ```ts
  it('part 11b: pacing — the host button stays disabled and fills while the minimum time runs (guide page 2 s, round intro 3 s after the longer splash, early close 3 s after the start, reveal and leaderboard 2 s, survey rows 1 s after the first), a double tap stops on the reveal without an error, «До гри», pause and end round never wait (375 px too)', async () => {
    try {
      await pacingGame11b();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Підготовка `pacingGame11b()`:**
  1. `const host = await open('host11b', 1280, 900); await register(host, 'host', 'Марта Ведуча', 'host11b@example.com');`
  2. Помічник `q(id, text, right, wrong)` — `single`, `${id}-a` (правильний) і `${id}-b`, `points: 100`, `timeLimit: 30`, `imageUrl: null`, `video: null`.
  3. Раунд `rc11b` — `classicRound('rc11b', [q('p1', 'Яка планета найбільша в Сонячній системі?', 'Юпітер', 'Сатурн'), q('p2', 'Скільки ніг у павука?', '8', '6')], { title: 'Розминка 11b', speedBonus: false, shuffleOptions: false })`.
  4. Раунд `rs11b` — `classicRound('rs11b', [s1], { title: 'Сто до одного 11b', speedBonus: false, shuffleOptions: false })`, де `s1` — «Назвіть фрукт, який люблять діти» з п'ятьма рядками, як `s1` у сценарії 10e (Яблуко 32 / Банан 25 / Полуниця 15 / Кавун 10 / Груша 8, `answers: 3`, `timeLimit: 45`, `points: 1000`).
  5. `makeRoundsQuiz([rc11b, rs11b], { leaderboard: 'each', newcomers: true })`, `title: 'Темп 11b'` → `POST /api/quizzes`, `expect(saved.ok())`.
  6. «Грати» → `code`, `stageUrl`; `stage = open('stage11b', 1280, 720)`; `olya`, `petro` — `open(…, 375, 812)`, `join` («Оля», «Петро»).

  **Кроки з перевірками й кадрами (у такому порядку):**
  1. **«Як грати».** `click(host, 'Почати гру')`.
     - `next = host.getByRole('button', { name: 'Далі', ...exact })`: `isDisabled()` → `true`, клас містить `is-pacing`.
     - Кадр `p11b-host-guide-pacing`.
     - `enabledAfter(next)` ≥ 1500 і ≤ 4000.
     - Клік «Далі» → сторінка 2 (сторінок «Як грати» в цій вікторині щонайменше три: телефон, раунди, типи запитань). Одразу після кліку «Далі» знову `disabled`, а «До гри» (`getByRole('button', { name: 'До гри', ...exact })`) активна: `isDisabled()` → `false`. Клік «До гри» → `intro` без очікування.
  2. **Заставка раунду й «Почати раунд».**
     - `stage.locator('.splash')` атрибут `style` містить `--splash-ms: 3500ms`.
     - `afterSplash(stage, olya, petro)`.
     - Одразу після: «Почати раунд» `disabled`, `is-pacing`. Кадр `p11b-host-intro-pacing`.
     - `enabledAfter(...)` ≥ 2300 (3 с після кінця заставки мінус затримки сторінок) і ≤ 6000. Клік.
  3. **Запитання 1.**
     - Заставка запитання на сцені: `--splash-ms: 1800ms`.
     - `afterSplash(stage, olya, petro)`.
     - «Закрити» `disabled` → `enabledAfter` ≥ 2300.
     - Оля відповідає «Юпітер» до того, як «Закрити» активується (Петро мовчить).
     - Клік «Закрити» → «Показати відповідь».
  4. **Подвійний дотик.**
     - `host.getByRole('button', { name: 'Показати відповідь', ...exact }).dblclick()`.
     - Сцена на розкритті (правильний варіант «Юпітер» позначений, як в інших сценаріях класики). «Далі» на пульті `disabled`.
     - `host.getByRole('alert')` — 0.
     - Через 1 с (`expect.poll` на те, що сцена **досі** на розкритті, а пульт не показує «Наступне запитання») — гра не проскочила.
     - Кадри `p11b-host-reveal-pacing`, `p11b-stage-reveal`.
     - `enabledAfter(next)` ≥ 1000 (від миті після подвійного дотику). Клік → таблиця.
     - «Наступне запитання» `disabled` → `enabledAfter` ≥ 1500. Клік → запитання 2 (`afterSplash`).
  5. **Що не чекає.** Одразу після відкриття запитання 2:
     - «Пауза» активна → клік → «Продовжити» є → клік (без очікування);
     - «Завершити раунд» активна → клік (діалог приймає наявний `page.on('dialog')`) → пульт «Наступний раунд».
     - `host.getByRole('alert')` — 0.
  6. **«100 до 1».**
     - «Наступний раунд» → `enabledAfter` ≥ 1500 → клік → `afterSplash` → «Почати раунд» → `enabledAfter` ≥ 2300 → клік → `afterSplash`.
     - Оля — `answerSurvey(olya, ['Яблуко', 'Банан', 'Груша'])`, Петро — `answerSurvey(petro, ['Кавун', 'Полуниця', 'ананас'])` → «Запитання закрите» → «Показати відповідь».
     - «Відкрити рядок 1 з 5» і «Відкрити всі» обидві `disabled`. Кадр `p11b-host-survey-first`.
     - `enabledAfter(row1)` ≥ 1500 → клік.
     - «Відкрити рядок 2 з 5»: `enabledAfter` ≥ 600 і ≤ 2000. Кадр `p11b-host-survey-row` (з частковим заповненням, знятий до кінця вікна). Клік.
     - «Відкрити всі»: `enabledAfter` ≥ 600 → клік → сцена показує 5 відкритих рядків (`.survey-row:not(.is-closed)` — 5).
     - «Далі»: `enabledAfter` ≥ 1500. Кадр `p11b-stage-survey` (сцена).
  7. **Пульт на телефоні.**
     - `host.setViewportSize({ width: 375, height: 812 })`.
     - Пульт на кроці з очікуванням (після кліку «Далі» з дошки — таблиця, «Наступне запитання» / «Підсумки» `disabled`): `expectNoSideScroll(host, 'p11b-host-375')`.
     - Назад 1280 × 900.
  8. Наприкінці `expect(problems).toEqual([])`: жодної помилки сторінки чи консолі, зокрема жодного `too_soon` у вигляді alert.
- [ ] **Step 3: Run** `pnpm build`, потім у фоні `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 11b"` → PASS. Переглянути кадри `p11b-*`:
  - заповнення видно на `btn-primary` і на звичайній кнопці «Відкрити всі»;
  - підпис кнопки читається поверх заповнення;
  - на 375 px панель дій не ламається.
- [ ] **Step 4: Повний прогін** у фоні (≈ 17 хв): `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts` → усі сценарії PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/e2e
  git commit -m "test: part 11b end-to-end — real pacing in every scenario (300 s per test); the host button disabled and filling on a guide page, the round intro after the 3.5 s splash, an early close, the reveal after a double tap with no error and the leaderboard, survey rows 1 s apart after the first; «До гри», pause and end round never wait (375 px too)"
  ```
