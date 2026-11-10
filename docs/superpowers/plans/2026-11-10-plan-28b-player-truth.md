# План 28b: раунд «Правда про гравця»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Звірка з кодом.** План спирається на назви з `main` після мержу 28a («Більше чи менше»): `Play.moreless`, `ADDED_28A`, `part 28a`, `GAME_STATE_VERSION = 22`. Зразки — раунди `bets` (27a) і `auction` (27b): `packages/engine/src/bets.ts`, `auction.ts`, гілки `bets`/`auction` у `game.ts` (`enterRound`, `next`, `autoLock`, `speedOn`), `views.ts` (`optional('auction', …)`), `history.ts`, `RoundSettings.tsx`. Лобі-подія — зразок `player:team` → `RoomManager.teamPick` → `pickTeam` (`teams.ts`); дія ведучого — `host:team-assign` → `HostAction` `'team-assign'` (`manager.ts` ~1939). Відмова «свого» — зразок `bluff_own` у `pickBluff` (`bluff.ts`). **Перед кожною задачею виконавець звіряє назви й рядки з фактичним кодом.** Розбіжність — привід міняти лише назви й рядки, не рішення плану.

**Мета:** новий тип раунду `truth`. Поки гра в лобі, кожна людина пише на телефоні один маловідомий факт про себе (до 200 символів; можна змінити). Ведучий бачить усі факти й може сховати недоречний. На старті раунду гра сама створює по запитанню на кожен факт у випадковому порядку (rng кімнати). Запитання — це факт. Гравці вибирають ім'я зі списку гравців, автор не вгадує. Хто вгадав — ціна запитання. Автор отримує частку ціни за кожного, хто не вгадав (повну ціну, якщо не вгадав ніхто). Без фактів раунд пропускається.

**Архітектура:**
- **Дані (`shared`).** `truthRoundSchema` `{ id, type: 'truth', title, description?, points, timeLimit }` без `questions`. Запитання раунду — **згенероване `single`**, тож уся машинерія одиночного вибору (`submitAnswer`, `check.ts`, `present`, «Відповіді наживо», `override`, запис, історія відповідей) працює без нового типу відповіді:
  - `id: 'truth-<k>'`, де k — номер у колоді (непрозорий: **не** id автора);
  - `text` — факт;
  - `options` — усі люди гри на мить відкриття (соло — гравці, командна гра — учасники з командою), `{ id: id людини, text: нікнейм }`, за нікнеймом (`localeCompare`), без перемішування;
  - `correctId` — id автора;
  - `points`/`timeLimit` — з раунду;
  - `imageUrl: null`, `video: null`.
  - Схема `single` має `maxOptions: 6`, а людей буває до 50. Запитання запису через `questionSchema` не перевіряється: він ніде не парситься (звірити `restore`, `saved.ts`, `history.ts`; якщо парситься — пропускати `truth-*`).
- **Стан (`engine`).** Два нові **необов'язкові** поля, тож `GAME_STATE_VERSION` лишається **22**:
  ```ts
  /** «Правда про гравця» (28b): ключ є лише у вікторині з раундом truth (createGame). */
  GameState.truth?: TruthState;
  export interface TruthState {
    /** Факти за id людини (соло — гравець, командна гра — учасник). Немає ключа — факту немає. */
    facts: Record<string, TruthFact>;
    /** Автори в порядку запитань, роздано на старті раунду (rng кімнати); немає ключа — ще не роздано (факти приймаються). */
    deck?: string[];
  }
  export interface TruthFact { text: string; hidden: boolean; at: number }
  /** Лише в запитанні раунду truth. */
  Play.truth?: TruthPlay;
  export interface TruthPlay {
    /** Автор факту (людина). */
    authorId: string;
    /** Учасник рушія автора на мить відкриття: соло — сам автор, командна гра — його команда. */
    actorId: string;
    /** Хто вгадує: присутні учасники рушія на відкритті, крім actorId (як timedlist.present у 27c). Знаменник частки автора. */
    guessers: string[];
  }
  ```
  - Новий файл `packages/engine/src/truth.ts` містить:
    - лобі: `submitTruth`, `hideTruth`, `truthOpen`;
    - роздачу `dealTruth`, генерацію `truthQuestion`, розрахунок `withTruthPoints`;
    - помічники `truthRoundOf`, `truthPlayOf`, `truthGuessers`.
- **Зрізи.** Нові **необов'язкові** `BaseView.truth?`, `HostView.truth?`, `PlayerView.me.truth?` — лише у вікторині з раундом `truth`.
- **Сервер.** Події `player:truth` і `host:truth-hide`. `PlayRef.truth` — згенероване запитання й автор для історії, бо знімок вікторини їх не має.
- **Веб.**
  - Новий `apps/web/src/screens/TruthView.tsx` (`TruthFactForm`, `HostTruthFacts`, `TruthPick`, `TruthOwn`, `TruthStage`, `TruthReveal`, `TruthSkipped`).
  - Поля раунду — у `RoundSettings.tsx`.

**Технології:** TypeScript, zod 4, vitest, Fastify + Socket.IO, React 19 + Vite + Testing Library, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-10-player-truth-design.md` — уся. Зразки: плани `docs/superpowers/plans/2026-11-09-plan-27a-bets-round.md` і `2026-11-10-plan-27b-auction-round.md`. Назви, підхід і стиль тестів — звідти.

## Глобальні обмеження

- 7 мов без ru, нові ключі в усі 7 локалей і списки в i18n.test.ts; нічого про росію.
- `GAME_STATE_VERSION` не підвищувати — лише необов'язкові поля (якщо без підвищення ніяк — явно познач це в шапці, контролер спитає власника).
- Юніт-тести `pnpm vitest run --maxWorkers=2`.
- Ніколи не запускати prettier.
- e2e: `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t <назва>`. Тут назва — `"part 28b"`, запуск на передньому плані, менше 10 хв.
- Конкретика для цього плану:
  - **Версія стану.** Підвищення **не потрібне**. Нові `GameState.truth` і `Play.truth` необов'язкові. Нові значення є лише в типах, яких старий знімок не містить: `RoundType 'truth'`, `ErrorCode`, `BuffWhy 'off_truth'`, `ScoreSource 'truth'`. У коментар до `READABLE_STATE_VERSIONS` (`restore.ts`) додати рядок «28b без нової версії: раунд truth, необов'язкові GameState.truth і Play.truth; старий знімок не містить ні того, ні того». Якщо виконавцю все ж знадобиться обов'язкове поле — **зупинитися й спитати контролера**: власника треба питати.
  - Нові поля схем — необов'язкові або в новому раунді. Кожна наявна вікторина й знімок проходять без змін.
  - Типи: `pnpm typecheck`.
  - uk-рядки — у `apps/web/src/i18n.ts`. Ключі — у новому списку `ADDED_28B` в `apps/web/src/i18n.test.ts`, доданому до умови `adds no uk keys beyond the agreed list` поряд з `ADDED_28A`. Переклади — у `apps/web/src/locales/{en,pl,de,es,it,ar}.json`, довідка — у `*.help.json` тих самих 6 мов. Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`).
  - **Факти — особисті дані гри.** Вони живуть лише в `GameState` (зокрема в збереженому знімку кімнати) і в історії цієї гри (`game.plays` → `PlayRef.truth`). Факти не пишуться ні в логи, ні в події менеджера (`this.emit`), ні в стрічку, лайки, профілі чи досягнення. «Продовжити гру» (12r) у нову гру фактів не переносить.
  - Сімейних фото немає ні в git, ні в тестах, ні в e2e. Сід-скрипти й демо-вікторини (`apps/server/scripts/*-quiz.ts`) не змінюються.

## Рішення плану (там, де специфікація мовчить)

- **Поля раунду:**
  - `points: int 0…LIMITS.maxPoints` (у редакторі типово `LIMITS.defaultPoints`);
  - `timeLimit: int LIMITS.minTime…LIMITS.maxTime` (типово `LIMITS.defaultTime` = 30).
  - `check`, `shuffleOptions` і `rules` раунд не має: `rulesOf(truth) = DEFAULT_RULES`, `speedOn(truth) === false`.
- **Один раунд `truth` на вікторину.** Інакше `superRefine` дає `truth_once`. Факт пишеться один на гру, тож другий раунд був би завжди порожній.
- **`roundQuestions(truth)` = `[]`.** Тому:
  - `scoredCount`, `questionsOf` і `quiz-remove` (`MIN_QUESTIONS.truth: 0`) раунд не рахують;
  - вікторина лише з раундом `truth` валідна, якщо наявні правила не вимагають запитань (звірити `quizSchema`);
  - `roundBrief(truth).count` — число запитань колоди, коли її вже роздано, інакше `null`.
- **Коли приймаються факти.** `truthOpen(state)`: є `state.truth`, `deck === undefined`, `phase !== 'finished'`:
  - у лобі пишуть усі;
  - після старту — лише пізні гравці продовженої гри (`addLatePlayer`, 13b) і ті, хто не встиг, поки раунд `truth` не роздано. Так виконується пункт специфікації «пізні гравці — доки раунд не почався».
  - Роздача — на `next` з `intro` раунду `truth`, тож заставка раунду — останній момент для фактів.
- **`submitTruth(state, personId, raw, now)`:**
  - текст: `replace(/\s+/g, ' ').trim()`, `isStorable`;
  - `''` прибирає факт;
  - понад `LIMITS.truthText = 200` → `'truth_text'`;
  - не та людина → `'not_found'`;
  - факти закрито → `'truth_closed'`;
  - той самий текст → `ok(state)` без змін (`toBe`);
  - нова версія тексту скидає `hidden` у `false`: ведучий бачить новий текст і може сховати знову.
  - Командна гра: людина — учасник (`memberOf`), зокрема без команди в лобі.
- **`hideTruth(state, personId, hidden)`** — лише ведучий:
  - можна, поки запитання про цей факт не відкрилося: у лобі, до роздачі й після неї;
  - сховане після роздачі запитання `nextQuestion` пропускає;
  - відкрите чи зігране → `'truth_closed'`, немає факту → `'not_found'`.
  - У грі без ведучого (автопілот) ховати нікому. Автор кімнати теж вгадує, тож факти йому не показуються, а `manager.author` відповідає `not_allowed`. Модерації в автопілоті немає — у довідці це сказано.
- **Роздача** — `dealTruth(state, rng)` на `next` з `intro` раунду `truth`, перед `advance`:
  1. `deck` = id людей із нехованим фактом, **які ще в грі**, перемішані `shuffle(…, rng)` (rng кімнати: `RoomManager.this.rng` → `next`);
  2. порожня колода → `advance` одразу дає `finishRound`, тобто `round_end` цього раунду без жодного запису. Сцена показує «Фактів немає — раунд пропущено» за `BaseView.truth.skipped`;
  3. `next` з `round_end` — як завжди.
  - Автопілот проходить так само: `moveOf` на `intro` → `next`.
- **Наступне запитання.** `nextQuestion` для `truth` бере перший `deck[k]`, для якого:
  - запис `truth-<k>` ще не зіграно;
  - факт є й не схований;
  - автор ще в грі (соло — у `players`, командна гра — у `members` з командою).
  - Решта колоди лишається незіграною. `comingQuestion` для раунду `truth` до роздачі віддає `null`: запитання ще не існують (12g не пропонує вибір відповідача).
- **Запитання** — `truthQuestion(state, k)` (див. «Архітектура»). Його будує `nextQuestion` у мить відкриття, тож вилучені на той час не потрапляють у варіанти, а пізні — потрапляють.
  - `openQuestion` для `truth`: `presented` — порядок `options`, без rng; `play.truth = { authorId, actorId, guessers }`.
  - `guessers` — `presentPlayers(state)` без `actorId`.
  - `actorId` — соло `authorId`, командна гра `memberOf(state, authorId).teamId`.
- **Хто вгадує:**
  - `submitAnswer` (поряд із `betsRefusal`): актор відповіді (`playerId` рушія — гравець чи команда) `=== play.truth.actorId` → `'truth_own'`;
  - ведучий за автора не відповідає: `override` запису `actorId` → `'not_allowed'`;
  - `autoLock` (гілка `playing`): `truth` → `truthGuessers(state)` = `guessers ∪ хто вже відповів`, мінус вилучені й `actorId`;
  - `answeringTeams` (`answerer.ts`) для `truth` — `freeForAll`, тобто `[]`. Тоді `StageAnswerers` і зрізи команд **не** дають `answererId: null` команді автора (див. «Фокус рев'ю», п. 1);
  - відповідь — `{ type: 'single', optionId }`, будь-яке ім'я, крім неіснуючого (`not_found`). Можна вибрати й себе — це просто помилка;
  - у командах вибирає капітан чи відповідач 12g, через наявний `act` для `player:answer`.
- **Бали:**
  - вгадувач — звичайний запис `single` з `DEFAULT_RULES`: правильно — `points`, інакше 0; без швидкості, серій, штрафу й множника;
  - автор — `withTruthPoints(state)`, викликається першим у `withTotals` поряд із `withFinalPoints`. Для кожного **закритого** запису з `play.truth`, якщо `actorId` ще в `state.players`:
    - `total = |truthGuessers на закритті|` — `guessers ∪ хто має запис`, без вилучених;
    - `wrong` = скільки з них без запису `grade: 'correct'`;
    - `share = total === 0 ? 0 : Math.round(points × wrong / total)`;
    - запис автора `{ answer: null, timeMs: limitMs, accepted: share > 0, accuracy: share / points (0 при points 0), grade: share === points && share > 0 ? 'correct' : share > 0 ? 'partial' : 'wrong', basePoints: share, streakBonus: 0, points: share, overridden: false }`.
    - `timeMs` = ліміт, як у мовчання, щоб «найшвидші» цікавинки його не брали.
  - Розрахунок іде з усіх записів на кожному `withTotals`, тож `override` ведучим будь-якого вгадувача на `locked`/`reveal` сам перераховує частку автора.
  - Записи вгадувачів заморожені: запитання закрите, `guessers` — знімок відкриття.
  - Пізній запис після закриття неможливий.
  - Нікого вгадувати (`total === 0`) → 0, а не повна ціна: «не вгадав ніхто» вимагає, щоб хтось вгадував.
- **Вилучення:**
  - у лобі чи до роздачі — факт людини зникає (`removeFromGame`/`dropMember` → `truth.facts` без ключа);
  - після роздачі — автор з колоди не зіграється (умова «ще в грі» в `nextQuestion`);
  - вилучений вгадувач на відкритому запитанні зникає з `guessers` (і запис — як зараз), тож `autoLock` його не чекає;
  - вилучений автор на відкритому запитанні: запитання догравається, правильна відповідь — він. Частка нараховується, лише якщо `actorId` ще в грі: у командах це команда, у соло — нікому.
  - Ті, хто вийшов (розрив зв'язку), факт зберігають.
- **Без бафів і доповнень:**
  - `roundOff` → `'off_truth'` (`BuffWhy`), крамниця дебафів закрита на весь раунд (`debuffs.ts`);
  - запасних запитань (`swap`) немає;
  - `UNDOABLE_ROUNDS`, `AWAY_PENALTY_ROUNDS`, `APPEAL_ROUNDS` раунд не додають;
  - лайк запитання `truth-*` → `not_allowed`;
  - дуелі — як після звичайного запитання;
  - заставки: вхід `'round'`, запитання `'question'` (`splash.ts`);
  - джерело балів — новий `'truth'` (`SCORE_SOURCES`, `answerSource`);
  - `factLimitMs` (`shared/facts.ts`) для `truth` → `null`, а цікавинки «Блеф»/«Самотній геній» запис автора (`answer: null`) не рахують як відповідь;
  - `all_rounds` росте сам (`ROUND_TYPES.length`), тести з точним числом оновити з коментарем «28b: новий тип раунду».
- **Автопілот:** раунд не має `check`, тож `autopilotQuiz` і `roundChanges` без змін. Тестовий бот (`testing/autopilot.ts`) на запитанні `truth` відповідає за всіх, крім `actorId`.
- **Помилки** (`ErrorCode`): `'truth_closed'`, `'truth_own'`, `'truth_text'`, `'truth_once'` (лише проблема схеми).
- **Історія:**
  - `PlayRef.truth = { question: Question; author: string; authorName: string; actor: string }`;
  - `playedQuestions` і всі пошуки `roundQuestionsAt(...).find(q.id === ...)` у `apps/server/src/history.ts` (~105, ~309, ~743) для `truth` беруть `ref.truth.question`;
  - `GameQuestionResult.truth?: { author: string /* нікнейм */; points: number }`;
  - відповіді — звичайні рядки (вибір = нікнейм варіанта), запис автора показується рядком «автор факту».
- **Зрізи** (`shared/views.ts`):
  ```ts
  export interface TruthInfo {
    /** Факти ще приймаються (truthOpen). */
    open: boolean;
    /** До роздачі — скільки нехованих фактів написано (лише число, без імен); після — скільки запитань у колоді. */
    count: number;
    /** question…reveal раунду truth: номер запитання (від 0); інакше null. */
    index: number | null;
    /** Лише reveal: чий факт і хто кого вибрав; інакше null. Ім'я вибору — текст варіанта. */
    reveal: {
      author: { id: string; nickname: string };
      /** Бали автора (запис actorId); 0 — нікого не обдурив. */
      points: number;
      picks: { id: string; nickname: string; pickedId: string | null; picked: string | null; correct: boolean }[];
    } | null;
    /** Лише round_end раунду truth з порожньою колодою. */
    skipped: boolean;
  }
  export interface HostTruth extends TruthInfo {
    /** Усі факти в порядку приходу людей: людина, текст, сховано, чи вже зіграно. */
    facts: { id: string; nickname: string; text: string; hidden: boolean; played: boolean }[];
    /** question/locked: автор поточного запитання; інакше null. */
    author: { id: string; nickname: string } | null;
  }
  export interface PlayerTruth {
    /** Свій факт ('' — ще немає) і чи сховав його ведучий. */
    fact: string; hidden: boolean;
    /** Можна написати чи змінити (truthOpen і людина в грі). */
    canWrite: boolean;
    /** question/locked: це мій факт (соло) або факт моєї команди (командна гра). До reveal — лише тут знак автора. */
    own: boolean;
  }
  // BaseView: truth?: TruthInfo — у вікторині з раундом truth на всіх етапах; без раунду ключа немає
  // HostView: truth?: HostTruth; PlayerView.me: truth?: PlayerTruth (і в зрізі людини командної гри — lobbyView / зріз учасника, views.ts ~2540–2640)
  ```
  - `playerCount` на запитанні `truth` = `truthGuessers(state).length`.

## Порядок збирання

- Задача 1 додає `'truth'` у `ROUND_TYPES` і `Round`. Через вичерпні `Record`/`switch` у `apps/web` `tsc -p apps/web` у задачах 1–5 не проходить. Для них перевірка — `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Від задачі 6 — повний `pnpm typecheck`.
- Залежності:
  - 2 — від 1;
  - 3 — від 2;
  - 4 — від 3;
  - 5 — від 4;
  - 6 — від 1 і 5;
  - 7 — від 4 і 6;
  - 8 — остання.

## Фокус рев'ю

1. **Спойлер автора.** До `reveal` автора факту знають лише ведучий і сам автор (у командах — його команда: їй телефон каже, чому вона не вгадує). `JSON.stringify` зрізу сцени й будь-якого іншого гравця на `intro`/`question`/`locked` і ack `player:answer` не містять:
   - `authorId`/`actorId`, `correctId`;
   - id запитання з id автора (id — `truth-<k>`);
   - `own: true`;
   - факти інших людей (у лобі — навіть свого сусіда);
   - списку тих, хто написав факт (сцена бачить лише `count`).
   Немає ознаки «цей не відповідає»: `answeringTeams` для `truth` — `[]`, `StageAnswerers` не пропускає команду автора, «відповіли N з M» — лише числа. Тести: задача 4, `nobody but the host and the author knows whose fact it is` і `the lobby shows only the count`.
2. **Частка автора й заморожування.**
   - `share = round(points × wrong / total)`; нікого не вгадали — повна ціна; нікому вгадувати — 0.
   - `guessers` — знімок відкриття; `override` вгадувача перераховує частку; `override` автора → `not_allowed`.
   - Перезапуск після закриття дає ту саму частку.
   Тести: задача 3, `the author earns a share for everyone who missed` і `a host override moves the author's share`.
3. **Вилучення.** Вилучений до роздачі — без факту й запитання. Вилучений після роздачі автор не зіграється. Вилучений вгадувач не тримає `autoLock` і не рахується в знаменнику. Вилучений автор на відкритому запитанні не ламає закриття. Тест: задача 3, `removal before the deal, after it and during a question`.
4. **Роздача й пропуск.** Порядок — з rng кімнати, детермінований за rng. Сховані й вилучені не входять. Порожня колода — `round_end` без записів і `skipped: true`, автопілот іде далі. Факти після роздачі → `truth_closed`. Тести: задача 3, `the deal shuffles the visible facts with the room rng` і `no facts skip the round`.
5. **Відновлення й гонки.** Збережена кімната в лобі зберігає факти й `hidden`. На запитанні — колоду, `play.truth`, записи. Одночасні `player:truth` і `host:truth-hide`: зміна тексту скидає `hidden` — ведучий бачить «новий текст». Роздача, що йде одночасно з `player:truth`, відмовляє `truth_closed`, факт не губиться мовчки. Тести: задача 5, `a restored room keeps the facts and the deck` і `a fact sent after the deal is refused`.

---

### Задача 1. Спільне: схема раунду, межі, помилки, події, бриф

**Files:**
- Modify:
  - `packages/shared/src/quiz.ts`:
    - `LIMITS.truthText = 200`;
    - `truthRoundSchema`, `ROUND_TYPES` (`'truth'` після `'auction'`), `roundSchema`, `rulesOf`, `roundQuestions` (`[]` для `truth`);
    - `superRefine` у `quizSchema`: `truth_once`.
  - `packages/shared/src/game.ts`: `ErrorCode` + `'truth_closed' | 'truth_own' | 'truth_text'`; `BuffWhy` + `'off_truth'`.
  - `packages/shared/src/events.ts`:
    - `truthFactSchema = z.object({ text: z.string().max(LIMITS.truthText * 2) })` (обрізає й міряє рушій);
    - `truthHideSchema = z.object({ playerId, hidden: z.boolean() })`;
    - у `ClientToServerEvents` — `'player:truth'` і `'host:truth-hide'`.
  - `packages/shared/src/truth.ts` (новий): `truthText(raw): string` (зведення пробілів і обрізання) і `TRUTH_QUESTION_PREFIX = 'truth-'`.
  - `packages/shared/src/round-brief.ts`: `truth: { points: number; time: number } | null`.
  - `packages/shared/src/breakdown.ts`: `'truth'` у `SCORE_SOURCES`, `answerSource`.
  - `packages/shared/src/facts.ts`: `factLimitMs` → `null` для `truth`.
  - `packages/shared/src/autopilot.ts`: `convert` — `case 'truth'` без змін.
  - `packages/shared/src/index.ts`.
- Create: `packages/shared/src/truth.test.ts`
- Test: `packages/shared/src/quiz.test.ts`, `breakdown.test.ts`, `round-brief` (якщо є), `achievements.test.ts` (число раундів), `autopilot.test.ts`

**Interfaces:**
- Produces:
  ```ts
  /** «Правда про гравця»: запитання створює гра на старті раунду з фактів гравців; ціна й таймер — спільні. */
  export const truthRoundSchema = z.object({
    id, type: z.literal('truth'), title, description: …optional(),
    points: z.number().int().min(0).max(LIMITS.maxPoints),
    timeLimit: z.number().int().min(LIMITS.minTime).max(LIMITS.maxTime),
  });
  export type TruthRound = z.infer<typeof truthRoundSchema>;
  export function truthText(raw: string): string; // '  Я  був\nу Перу ' → 'Я був у Перу'
  ```

- [ ] **Step 1: Write the failing tests.**
  - `truth.test.ts`, `a fact is trimmed and spaces collapse` — `truthText('  Я  був\nу Перу ')` дорівнює `'Я був у Перу'`.
  - `quiz.test.ts`:
    - `accepts a truth round` — `{ type: 'truth', title: '', points: 300, timeLimit: 30 }` проходить;
    - `refuses a second truth round` — два раунди → `truth_once`;
    - `refuses broken price or timer` — `points: -1`, `timeLimit: 4`, `2.5` не проходять;
    - `a truth round has no questions` — `roundQuestions(truth)` дорівнює `[]`, `rulesOf(truth)` дорівнює `DEFAULT_RULES`;
    - `old quizzes still parse`.
  - `breakdown.test.ts`: `answerSource('truth') === 'truth'`.
  - `round-brief`: `roundBrief(truth)` → `truth: { points: 300, time: 30 }`; в інших — `truth: null`.
  - `achievements.test.ts`: `all_rounds` — нове число з коментарем «28b: новий тип раунду».

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared`. Очікується FAIL.

- [ ] **Step 3: Implement** блок Interfaces. Вичерпні `Record`/`switch` за типом раунду в `packages/shared` покаже `tsc -p packages/shared`.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/shared && tsc -p packages/shared`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): 28b player truth round schema — price and timer only, one per quiz, fact limits, truth events and errors"
```

---

### Задача 2. Рушій: факти в лобі, приховування, вилучення, відновлення

**Files:**
- Create: `packages/engine/src/truth.ts`, `packages/engine/src/game.truth-lobby.test.ts`
- Modify:
  - `packages/engine/src/game.ts`: `GameState.truth?`, `TruthState`, `TruthFact`, `Play.truth?`, `TruthPlay`, `createGame` (ключ `truth: { facts: {} }` лише з раундом `truth`), `removeFromGame`;
  - `packages/engine/src/teams.ts` (`dropMember` — факт людини);
  - `packages/engine/src/saved.ts` (`addLatePlayer` без змін — перевірити, що пізній пише факт);
  - `packages/engine/src/restore.ts` (лише коментар), `packages/engine/src/index.ts`;
  - `packages/engine/src/testing/fixtures.ts` (`truthRound(id, options?)`: `points: 300`, `timeLimit: 30`).
- Test: `packages/engine/src/restore.test.ts`

**Interfaces:**
- Consumes: `truthText`, `LIMITS.truthText`, нові `ErrorCode` (задача 1); `memberOf`, `teamsOn`, `isStorable`.
- Produces:
  ```ts
  // truth.ts (імпорти з game.ts лише під час виклику, як bets.ts)
  export function truthRoundOf(state: GameState): TruthRound | null;
  /** Чи приймаються факти: є state.truth, колоду не роздано, гра не скінчилась. */
  export function truthOpen(state: GameState): boolean;
  /** Факт людини: '' прибирає; новий текст скидає hidden. truth_closed / truth_text / not_found. */
  export function submitTruth(state: GameState, personId: string, raw: string, now: number): Result;
  /** Ведучий ховає чи показує факт, поки запитання про нього не відкрилося. truth_closed / not_found. */
  export function hideTruth(state: GameState, personId: string, hidden: boolean): Result;
  ```

- [ ] **Step 1: Write the failing tests.** Вікторина `makeRoundsQuiz([classicRound('r1', [single]), truthRound('r2')])`; гравці Олена, Тарас, Віра, Хосе; `t0 = 1_000_000`.
  - `game.truth-lobby.test.ts`:
    - `the lobby collects one fact per person`:
      - `submitTruth(s, p1, '  Я стрибала з парашутом ', t0)` → `facts.p1` дорівнює `{ text: 'Я стрибала з парашутом', hidden: false, at: t0 }`;
      - другий виклик іншим текстом замінює факт;
      - `''` прибирає ключ.
    - `refuses a long fact, a stranger and a quiz without the round`:
      - 201 символ → `truth_text`;
      - невідомий id → `not_found`;
      - вікторина без `truth` → `truth_closed` і ключа `truth` у `createGame` немає;
      - стан після відмови `toBe` попередній.
    - `the same text changes nothing` — повтор → `toBe`.
    - `the host hides and shows a fact; a new text unhides`:
      - `hideTruth(p2, true)` → `hidden: true`;
      - Тарас пише новий текст → `hidden: false`;
      - `hideTruth` без факту → `not_found`.
    - `facts stay open after the start until the deal` — `start` → `intro` → `submitTruth` ok; після `finished` → `truth_closed`.
    - `a late player of a continued game writes a fact` — `addLatePlayer` на `leaderboard` → `submitTruth` ok.
    - `removal drops the fact; leaving keeps it`:
      - `removePlayer(p3)` у лобі → ключа `p3` немає;
      - `setConnected(p4, false)` → факт є.
    - `teams: every member writes, a member without a team too` — командна вікторина: учасник без команди в лобі пише; `dropMember` прибирає його факт.
  - `restore.test.ts`:
    - `keysOf<GameState>` з `'truth'`, `keysOf<Play>` з `'truth'`, нові `keysOf<TruthState>()(['facts', 'deck'])`, `keysOf<TruthFact>`, `keysOf<TruthPlay>`;
    - `GAME_STATE_VERSION === 22`;
    - `a suspended lobby keeps the facts` — `suspend` у лобі з фактами й `hidden` → ті самі.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.

- [ ] **Step 3: Implement** за «Рішеннями плану» («Коли приймаються факти», `submitTruth`, `hideTruth`, «Вилучення» в лобі). Блок раунду в `truth.ts` — у задачі 3.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/engine && tsc -p packages/shared && tsc -p packages/engine`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): 28b player truth facts — one per person in the lobby, editable until the deal, hidden by the host, dropped on removal"
```

---

### Задача 3. Рушій: роздача, запитання, вгадування, частка автора, пропуск, команди, автопілот

**Files:**
- Create: `packages/engine/src/game.truth.test.ts`
- Modify:
  - `packages/engine/src/truth.ts`: `dealTruth`, `truthQuestion`, `truthPlayOf`, `truthGuessers`, `withTruthPoints`;
  - `packages/engine/src/game.ts`:
    - `next` (`intro` → `dealTruth` перед `advance`);
    - `nextQuestion`, `comingQuestion`;
    - `openQuestion` (`play.truth`, `presented`, `round.shuffleOptions` для `truth` — `false`);
    - `submitAnswer` (`truth_own`), `override` (запис автора → `not_allowed`);
    - `autoLock` (`playing`), `withTotals` (`withTruthPoints` першим), `removeFromGame` (`guessers`);
    - `speedOn` (перевірити);
  - `packages/engine/src/answerer.ts` (`answeringTeams` / `freeForAll` для `truth`);
  - `packages/engine/src/live.ts` (хто очікується — `truthGuessers`);
  - `packages/engine/src/buffs.ts` (`'off_truth'`), `debuffs.ts` (крамниця закрита), `splash.ts`, `perks.ts` (підказка рівня на `truth` → `unfit`);
  - `packages/engine/src/facts.ts` (запис автора не відповідь);
  - `packages/engine/src/autopilot.ts` (перевірити `moveOf` на `intro`), `packages/engine/src/testing/autopilot.ts` (бот без автора);
  - `packages/engine/src/index.ts`.
- Test: `packages/engine/src/game.teams.test.ts`, `game.autopilot.test.ts`, `game.buffs.test.ts`, `restore.test.ts`

**Interfaces:**
- Consumes: задачі 1–2; `shuffle`, `presentPlayers`, `memberOf`, `withRecord`, `limitMsOf`, `finishRound`.
- Produces:
  ```ts
  /** Колода: id людей із нехованим фактом, що ще в грі, у порядку shuffle(rng). */
  export function dealTruth(state: GameState, rng: Rng): GameState;
  /** Згенероване single для deck[k] (id 'truth-k'); null — факту чи автора вже немає або факт сховано. */
  export function truthQuestion(state: GameState, k: number): Question | null;
  export function truthPlayOf(state: GameState): (Play & { truth: TruthPlay }) | null;
  /** Хто вгадує поточне запитання: guessers ∪ хто відповів, без вилучених і без actorId. */
  export function truthGuessers(state: GameState, play?: Play): string[];
  /** Записи авторів закритих запитань truth з усіх записів вгадувачів (див. «Бали»). */
  export function withTruthPoints(state: GameState): GameState;
  ```

- [ ] **Step 1: Write the failing tests.** Стан із задачі 2: факти Олени, Тараса, Віри; Хосе без факту; ціна 300; rng — детермінований (`seededRng(7)` з `bluff.ts`).
  - `game.truth.test.ts`:
    - `the deal shuffles the visible facts with the room rng`:
      - `intro` раунду `r2` → `next(s, t0, rng)` → `truth.deck` — перестановка `[p1, p2, p3]`, та сама за того самого зерна;
      - сховане (`hideTruth(p2, true)`) і вилучене не входять;
      - `submitTruth` після роздачі → `truth_closed`.
    - `a question is the fact with every name as an option`:
      - `phase: 'question'`, `play.question` = `{ id: 'truth-0', type: 'single', text: <факт deck[0]>, correctId: deck[0], points: 300, timeLimit: 30 }`;
      - `options` — чотири імена за абеткою, зокрема Хосе;
      - `presented` — той самий порядок;
      - `endsAt === startedAt + 30_000`.
    - `the author cannot guess` — `submitAnswer` автора → `truth_own`, стан `toBe`; Хосе (без факту) відповідає.
    - `everyone but the author closes the question` — троє відповіли → `locked` без автора.
    - `the author earns a share for everyone who missed`:
      - 3 вгадувачі, 1 вгадав → вгадувач +300, автор `round(300 × 2/3) = 200`, `grade: 'partial'`;
      - ніхто не вгадав (двоє мовчать) → автор 300, `grade: 'correct'`;
      - усі вгадали → автор 0, `grade: 'wrong'`;
      - `timeMs` автора — 30_000.
    - `a host override moves the author's share` — на `reveal` `override(вгадувач, 'correct')` → частка автора менша на 100; `override(автор, …)` → `not_allowed`.
    - `no speed, no streak, no buffs` — швидка й повільна правильні дають однаково; баф → `off_truth`; крамниця → `'phase'`.
    - `the round walks fact by fact` — `reveal` → `next` (`leaderboard: 'end'`) → наступне `truth-1`; після останнього → `round_end`. З `'each'` — через `leaderboard`.
    - `no facts skip the round` — без фактів `next` з `intro` → `round_end`, у `plays` раунду немає записів, `truth.deck` дорівнює `[]`.
    - `removal before the deal, after it and during a question`:
      - вилучений до роздачі — не в колоді;
      - вилучений після роздачі автор `deck[1]` — запитання `truth-1` пропущено, далі `truth-2`;
      - вилучений вгадувач на відкритому запитанні — `autoLock` закриває без нього, знаменник 2;
      - вилучений автор на відкритому — закривається таймером, частки немає, рахунки інших за правилами.
    - `a late name joins the next question's options` — пізній гравець після `truth-0` є у варіантах `truth-1`.
  - `game.teams.test.ts`, `teams guess by captain; the author's team waits and earns the share`:
    - факти пишуть учасники;
    - варіанти — імена учасників;
    - капітан команди автора → `truth_own`;
    - частка — записом команди;
    - `answeringTeams` для `truth` — `[]`.
  - `game.autopilot.test.ts`, `the autopilot walks a truth round and skips an empty one` — бот вгадує за всіх, крім автора; гра доходить до `finished`; без фактів — так само.
  - `restore.test.ts`, `a suspended truth question keeps the deck, the author and the records` — після закриття частка та сама.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.

- [ ] **Step 3: Implement** за «Рішеннями плану». Переглянути всі `round.questions` і вичерпні `switch` за типом раунду в `packages/engine/src` (`grep -n "round.questions\|\.type === 'auction'"`). Для кожного вирішити: `truth` — як класика, `[]` чи гілка `truth`.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/engine && tsc -p packages/shared && tsc -p packages/engine`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): 28b player truth round — facts dealt with the room rng, every name as an option, the author sits out and earns a share for each miss, empty round skipped"
```

---

### Задача 4. Рушій: зрізи — лобі, запитання, розкриття, без спойлерів

**Files:**
- Modify: `packages/shared/src/views.ts` (типи з «Рішень плану»), `packages/engine/src/views.ts` (`stageView`, `playerView`, зріз учасника й `lobbyView` командної гри, `hostView`, `playerCount`)
- Create: `packages/engine/src/views.truth.test.ts`

**Interfaces:**
- Consumes: `truthOpen`, `truthPlayOf`, `truthGuessers`, `truthRoundOf` (задачі 2–3); `memberOf`, `actingNickname`.
- Produces: `TruthInfo`, `HostTruth`, `PlayerTruth`; `BaseView.truth?`, `HostView.truth?`, `PlayerView.me.truth?` (`...optional('truth', …)`).

- [ ] **Step 1: Write the failing tests** (стан із задач 2–3):
  - `the lobby shows only the count`:
    - на сцені `truth` дорівнює `{ open: true, count: 3, index: null, reveal: null, skipped: false }`;
    - `JSON.stringify(stageView)` і `playerView(p4)` не містять жодного тексту факту;
    - `playerView(p1).me.truth` дорівнює `{ fact: 'Я стрибала з парашутом', hidden: false, canWrite: true, own: false }`;
    - `hostView.truth.facts` — усі три з `nickname`, `hidden`, `played: false`;
    - сховане не входить у `count`.
  - `the hidden author sees the host's mark` — `playerView(p2).me.truth.hidden === true` після `hideTruth`.
  - `nobody but the host and the author knows whose fact it is`:
    - на `question` і `locked` `JSON.stringify` сцени й гравців, крім автора, не містять `correctId`, id автора поряд із `truth`/`author`, `'own":true'`;
    - `question.id === 'truth-0'`;
    - автор: `me.truth.own === true`;
    - `hostView.truth.author` — автор;
    - у командах — уся команда автора `own: true`, інші команди — `false`.
  - `the stage does not single out the silent author` — командна гра з `answerer: 'pick'`: `teams.teams[*].answererId` не `null` для команди автора; `playerCount` дорівнює числу вгадувачів.
  - `reveal names the author and every pick` — `reveal` дорівнює `{ author: { nickname: 'Олена' }, points: 200, picks: [{ nickname: 'Тарас', picked: 'Олена', correct: true }, { nickname: 'Віра', picked: 'Хосе', correct: false }, { nickname: 'Хосе', picked: null, correct: false }] }`; `question.correctId` видно лише тут (як у `single`).
  - `a skipped round says so` — `round_end` без фактів → `skipped: true`; в іншому раунді — `false`.
  - `facts close after the deal` — після роздачі `open: false`, `count` — довжина колоди, `me.truth.canWrite === false`.
  - `other quizzes have no truth key` — класика, «Ставки», «Аукціон»: ключа `truth` немає ні в одному зрізі.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.

- [ ] **Step 3: Implement** за блоком Interfaces, за зразком `auctionInfo`/`hostAuction`/`playerAuction` у `views.ts`.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/engine packages/shared && tsc -p packages/shared && tsc -p packages/engine`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/views.ts packages/engine
git commit -m "feat(engine): 28b player truth views — the count for everyone, own fact on the phone, all facts for the host, the author known only to the host and the author until reveal"
```

---

### Задача 5. Сервер: події, дія ведучого, частота, перезапуск, запис, історія

**Files:**
- Modify:
  - `apps/server/src/socket.ts`:
    - `on('player:truth')` — як `player:team`: роль гравця, `truthFactSchema`;
    - `on('host:truth-hide')` — `hostSide` → `run({ type: 'truth-hide', … })`.
  - `apps/server/src/rooms/manager.ts`:
    - `truth(room, personId, text)` — `submitTruth(…, this.now())`; частота — не більше `TRUTH_PER_SECOND = 2`, інакше `too_soon` (як `draftRate`);
    - `HostAction` + `{ type: 'truth-hide'; playerId: string; hidden: boolean }` → `hideTruth`;
    - `author()` → `not_allowed` для `truth-hide`;
    - `next` уже передає `this.rng`.
  - `apps/server/src/db/schema.ts` (`PlayRef.truth`), `apps/server/src/recorder.ts` (`writeGame` → `truth` у `progress.plays`);
  - `apps/server/src/history.ts`:
    - `playedQuestions` і пошуки запитання за id (~105, ~309, ~743);
    - `GameQuestionResult.truth`;
  - `packages/shared/src/history.ts` (тип результату);
  - `apps/server/src/quiz-remove.ts` (`MIN_QUESTIONS.truth: 0`);
  - лайки (`apps/server/src/rooms/likes.ts` чи `likes.ts`): запитання `truth-*` → `not_allowed`;
  - `apps/server/scripts/logic/check.ts` та інші вичерпні `switch` (покаже `tsc -p apps/server`).
- Test: `apps/server/src/socket.test.ts`, `apps/server/src/rooms/manager.lobby.test.ts`, `manager.autopilot.test.ts`, `apps/server/src/restart.test.ts`, `recorder.test.ts`, `history.test.ts`, `likes.test.ts`

**Interfaces:**
- Consumes: задачі 1–4.
- Produces: `PlayRef.truth?: { question: Question; author: string; authorName: string; actor: string }`; `GameQuestionResult.truth?: { author: string; points: number }`.

- [ ] **Step 1: Write the failing tests:**
  - `socket.test.ts`:
    - `player:truth saves the fact and answers ok only` — ack дорівнює `{ ok: true }`;
    - чужий зріз (другий гравець) не містить тексту;
    - 201 символ → `truth_text`;
    - ведучий шле `player:truth` → `FORBIDDEN`.
  - `socket.test.ts`, `host:truth-hide hides a fact; the autopilot author cannot` — ведучий ok; автор кімнати-автопілота → `not_allowed`.
  - `manager.lobby.test.ts`, `facts are rate limited and not emitted` — третій за секунду → `too_soon`; жодна `RoomEvent` не містить тексту факту.
  - `manager.lobby.test.ts`, `a fact sent after the deal is refused` — `host:next` з `intro` раунду `truth` (колода роздана) → наступний `player:truth` → `truth_closed`.
  - `restart.test.ts`, `a restored room keeps the facts and the deck` — збережено в лобі з фактами й `hidden` → ті самі; збережено на запитанні `truth` → колода, `play.truth` і записи ті самі, частка після закриття та сама.
  - `recorder.test.ts`, `a truth question is recorded with its generated question` — `plays[i].truth.question.text` — факт, `author` — id; рядки відповідей вгадувачів `{ type: 'single', optionId }`, рядок автора з `answer: null` і його балами.
  - `history.test.ts`, `truth questions come from the game, not the quiz` — запитання з `ref.truth.question`, `truth: { author: 'Олена', points: 200 }`, вибори — нікнейми; пропущений раунд записів не має.
  - `likes.test.ts`, `a truth question cannot be liked` — `not_allowed`.
  - `manager.autopilot.test.ts`, `the autopilot plays a truth round with facts and without` — доходить до `finished`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/socket.test.ts apps/server/src/rooms/manager.lobby.test.ts apps/server/src/rooms/manager.autopilot.test.ts apps/server/src/restart.test.ts apps/server/src/recorder.test.ts apps/server/src/history.test.ts apps/server/src/likes.test.ts`. Очікується FAIL.

- [ ] **Step 3: Implement.** Тест `all_rounds` у `apps/server` (як у 27b) оновити до нового числа.

- [ ] **Step 4: Run** тести з кроку 2, потім `pnpm vitest run --maxWorkers=2 apps/server/src` і `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server packages/shared/src/history.ts
git commit -m "feat(server): 28b player truth — fact and hide events, rate limit, restored facts and deck, generated questions in the record and history"
```

---

### Задача 6. Веб: назва, пам'ятка, помилки, історія, довідка й редактор раунду

**Files:**
- Modify:
  - `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts` (`ADDED_28B`), `apps/web/src/locales/{en,pl,de,es,it,ar}.json`;
  - `apps/web/src/guide-text.ts` (`ROUND_ICONS.truth: '🕵️'`, `ROUND_NAMES.truth`, `roundHow`), `apps/web/src/round-summary.ts`, `apps/web/src/pages/GameHistory.tsx`;
  - `apps/web/src/help/help-uk.ts` (`round.truth.*`), `apps/web/src/help/__fixtures__/help-uk-golden.json` (нові id, свідомо), `apps/web/src/locales/{en,pl,de,es,it,ar}.help.json`;
  - `apps/web/src/editor/draft.ts` (`newTruthRound`, проблеми: другий раунд `truth` → `problemTruthOnce`), `apps/web/src/editor/draft-storage.ts`;
  - `apps/web/src/editor/QuizEditor.tsx` — створення раунду; для `truth` немає списку запитань, лише пояснення `truthEditorNote`;
  - `apps/web/src/editor/RoundSettings.tsx` — ціна й таймер;
  - `apps/web/src/styles.css`.
- Test: `apps/web/src/guide-text.test.ts`, `round-summary.test.ts`, `pages/GameHistory.test.tsx`, `editor/draft.test.ts`, `editor/QuizEditor.test.tsx`, наявні `help-golden.test.ts`, `locales/checks.test.ts`, `source-scan.test.ts`

**Interfaces:**
- Consumes: `truthRoundSchema`, `LIMITS`, `RoundBrief.truth`, `ErrorCode` (задача 1); `GameQuestionResult.truth` (задача 5).
- Produces:
  ```ts
  export function newTruthRound(): TruthRound; // { title: '', points: LIMITS.defaultPoints, timeLimit: LIMITS.defaultTime }
  ```
- uk-ключі (усі в `ADDED_28B`; задача 7 дописує свої):
  ```ts
  roundTypeTruth: 'Правда про гравця',
  roundHow_truth: 'Кожен пише в лобі маловідомий факт про себе. У раунді на екрані — факт, а ви вибираєте, хто його написав. Вгадали — ціна запитання; автор отримує бали за кожного, хто не вгадав.',
  buffWhy_off_truth: 'У раунді «Правда про гравця» бафів немає.',
  scoreSource_truth: 'Правда про гравця',
  err_truth_closed: 'Факти вже не приймаються.',
  err_truth_own: 'Це ваш факт — вгадують інші.',
  err_truth_text: 'Факт задовгий: до 200 символів.',
  summaryTruth: 'Запитання — факти гравців; вгадали — {points}, автор — частка за кожного, хто не вгадав',
  truthHistoryAuthor: 'Факт написав(ла): {nickname} · автор {points}',
  truthHistoryAuthorRow: 'автор факту',
  truthPointsLabel: 'Ціна запитання',
  truthTimeLabel: 'Час на запитання, с',
  truthEditorNote: 'Запитання гра створить сама на старті раунду — по одному на кожен факт, що гравці напишуть у лобі. Без фактів раунд пропускається.',
  problemTruthOnce: 'Раунд «Правда про гравця» може бути лише один',
  ```
- Довідка `round.truth`:
  - `title`, `what`;
  - `how.0–3`:
    - факт у лобі, до 200 символів, можна змінити;
    - ведучий бачить факти й ховає недоречні;
    - на старті раунду — запитання з кожного факту у випадковому порядку;
    - вибір імені, автор не вгадує;
  - `points.0–1`:
    - вгадали — ціна;
    - автор — частка за кожного, хто не вгадав, повна ціна, якщо не вгадав ніхто; без бонусу швидкості;
  - `tip.0` — попросити факт, якого ніхто не знає, але без особистого;
  - `limits.0–2`:
    - один такий раунд на вікторину;
    - без фактів раунд пропускається;
    - у грі без ведучого факти ніхто не перевіряє.
  - `help-uk-golden.json` отримує рівно ці нові id.

- [ ] **Step 1: Write the failing tests:**
  - `guide-text.test.ts`: `ROUND_NAMES.truth` → «Правда про гравця».
  - `round-summary.test.ts`: бриф `{ points: 300, time: 30 }` → рядок `summaryTruth` з «300».
  - `GameHistory.test.tsx`: запитання `truth` → факт як текст, «Факт написав(ла): Олена · автор +200», рядок автора «автор факту».
  - `draft.test.ts`:
    - `newTruthRound()` → `toMatchObject` з Interfaces;
    - два раунди `truth` → `problemTruthOnce`;
    - чернетка з `truth` після чистки проходить `quizSchema`.
  - `QuizEditor.test.tsx`, `creates a truth round with a price and a timer` — додати «Правда про гравця», ціна 300, час 30, видно `truthEditorNote`, списку запитань немає; збережено `{ type: 'truth', points: 300, timeLimit: 30 }`.
  - `i18n.test.ts`: `ADDED_28B`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/guide-text.test.ts apps/web/src/round-summary.test.ts apps/web/src/pages/GameHistory.test.tsx apps/web/src/editor apps/web/src/i18n.test.ts apps/web/src/help apps/web/src/locales`. Очікується FAIL.

- [ ] **Step 3: Implement.** Поля — за зразком блоку `auction` у `RoundSettings.tsx`. Усі місця, що ходять по `round.questions`, у веб-редакторі (`grep -n "round.questions" apps/web/src/editor`) для `truth` отримують `[]` через `roundQuestions` або гілку. Переклади 6 мов — природні, з тими самими плейсхолдерами.

- [ ] **Step 4: Run** тести з кроку 2, `apps/web/src/source-scan.test.ts` і `pnpm typecheck`. Очікується PASS: від цієї задачі повний typecheck зелений. Вичерпні `switch` на телефоні, сцені й пульті отримують мінімальну гілку, повний UI — у задачі 7.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 28b player truth round name, briefing, errors, history lines, host help and the round editor — price and timer only"
```

---

### Задача 7. Веб: факт у лобі, пульт фактів, вибір імені, сцена й розкриття

**Files:**
- Create: `apps/web/src/screens/TruthView.tsx`, `apps/web/src/screens/TruthView.test.tsx`
- Modify:
  - `apps/web/src/screens/PlayerScreen.tsx`:
    - лобі (~874–893) — `TruthFactForm`;
    - етапи між запитаннями — та сама форма для `canWrite && fact === ''`;
    - `question`/`locked` раунду `truth` — `TruthPick` або `TruthOwn` замість звичайного `single` з `AnswerInput.tsx`;
  - `apps/web/src/screens/TeamWatch.tsx` — не капітан бачить вибір лише для читання, команда автора бачить `TruthOwn`;
  - `apps/web/src/screens/StageScreen.tsx`:
    - `Lobby` — «Фактів: N»;
    - `question`/`locked` — `TruthStage`;
    - `reveal` — `TruthReveal`;
    - `round_end` — `TruthSkipped`;
  - `apps/web/src/screens/HostScreen.tsx` — лобі (~1352–1370) і далі до роздачі — `HostTruthFacts`; на запитанні — рядок автора;
  - `apps/web/src/styles.css` (класи `truth-`), `apps/web/src/i18n.ts`, 6 json, `ADDED_28B`.
- Test: `apps/web/src/screens/PlayerScreen.test.tsx`, `StageScreen.test.tsx`, `HostScreen.test.tsx`, `TeamWatch.test.tsx`

**Interfaces:**
- Consumes: `TruthInfo`, `HostTruth`, `PlayerTruth` (задача 4); `player:truth`, `host:truth-hide`, `player:answer`; `errorText`, `Timer`, `signed()`.
- Produces:
  ```tsx
  /** Телефон: поле факту (textarea, maxLength 200, лічильник), «Зберегти»; збережений текст; «Ведучий сховав ваш факт — напишіть інший». */
  export function TruthFactForm(props: { truth: PlayerTruth; send: Send }): JSX.Element | null;
  /** Пульт: людина · факт · «Сховати»/«Показати» (host:truth-hide); зіграні — без кнопки; число нехованих. */
  export function HostTruthFacts(props: { truth: HostTruth; send: Send; onError?: (text: string | null) => void }): JSX.Element;
  /** Телефон на question: факт і список імен кнопками (одна колонка, переносяться), один вибір → player:answer { type: 'single', optionId }. */
  export function TruthPick(props: { question: PublicQuestion; disabled: boolean; send: Send }): JSX.Element;
  /** Телефон автора (і його команди): «Це ваш факт — вгадують інші». */
  export function TruthOwn(props: { team: boolean }): JSX.Element;
  /** Сцена на question/locked: «Хто це написав?», факт великим, «Факт k з n», таймер; імена дрібно. */
  export function TruthStage(props: { view: StageView; offsetMs: number }): JSX.Element;
  /** Сцена й телефони на reveal: автор великим, бали автора, хто кого вибрав (✓/✗). */
  export function TruthReveal(props: { truth: TruthInfo }): JSX.Element | null;
  /** Сцена й телефони на round_end пропущеного раунду. */
  export function TruthSkipped(): JSX.Element;
  ```
- uk-ключі:
  ```ts
  truthFactLabel: 'Ваш маловідомий факт',
  truthFactHint: 'Те, чого про вас мало хто знає. Його покажуть у раунді «Правда про гравця», а інші вгадуватимуть, чий він.',
  truthFactSave: 'Зберегти',
  truthFactSaved: 'Ваш факт: «{text}»',
  truthFactCount: '{count} / 200',
  truthFactHidden: 'Ведучий сховав ваш факт — напишіть інший.',
  truthFactsCount: 'Фактів: {count}',
  truthHostTitle: 'Факти гравців',
  truthHostHide: 'Сховати',
  truthHostShow: 'Показати',
  truthHostHiddenMark: 'сховано',
  truthHostPlayed: 'зіграно',
  truthHostNone: 'Ще ніхто не написав факт',
  truthHostAuthor: 'Автор: {nickname}',
  truthWho: 'Хто це написав?',
  truthOf: 'Факт {index} з {total}',
  truthOwn: 'Це ваш факт — вгадують інші.',
  truthOwnTeam: 'Це факт вашої команди — вгадують інші.',
  truthAuthorIs: 'Це написав(ла) {nickname}',
  truthAuthorPoints: 'Автор: {points}',
  truthPicked: '{nickname} → {picked}',
  truthNoPick: '{nickname} — без вибору',
  truthSkipped: 'Фактів немає — раунд «Правда про гравця» пропущено.',
  ```
- Поведінка:
  - **Телефон:**
    - `busy`-ref — один запит за раз;
    - помилка — `errorText` (`role="status"`);
    - поле не скидається від нових зрізів, поки людина пише;
    - імена — `dir="auto"`;
    - 320 px без горизонтальної прокрутки й з довгими іменами;
    - автор не бачить кнопок взагалі.
  - **Сцена:** `TruthStage` не показує стандартних варіантів `single` (A–F) і жодних позначок «відповів» по людях. Лічильник «відповіли N з M» лишається.
  - **Пульт:** звичайні «Відповіді наживо» й `override`; рядок автора — без кнопок оцінки.

- [ ] **Step 1: Write the failing tests** (`TruthView.test.tsx`, `send` — `vi.fn`):
  - `the phone saves a fact and shows the host's mark`:
    - ввести «Я стрибала з парашутом» → «Зберегти» → `send('player:truth', { text: 'Я стрибала з парашутом' })`;
    - `hidden: true` → `truthFactHidden`;
    - 200 символів — лічильник «200 / 200», більше не вводиться.
  - `a late answer from the server shows the reason` — `{ ok: false, error: 'truth_closed' }` → «Факти вже не приймаються.».
  - `the host hides and shows` — «Сховати» → `send('host:truth-hide', { playerId: 'p2', hidden: true })`; зіграний — без кнопки; порожньо → `truthHostNone`.
  - `a guess sends the name once` — подвійний дотик → один `player:answer` з `optionId`.
  - `the author sees a notice, not names` — `own: true` → `truthOwn`, кнопок немає; командна → `truthOwnTeam`.
  - `the stage asks who wrote it and hides the answer` — «Хто це написав?», факт, «Факт 1 з 3»; немає `correct`/`✓` до `reveal`.
  - `reveal shows the author and every pick` — «Це написав(ла) Олена», «Автор: +200», «Тарас → Олена ✓», «Хосе — без вибору».
  - `a skipped round says so` — `truthSkipped`.
  - `PlayerScreen.test.tsx`: у лобі з `me.truth` — форма; без `me.truth` — немає.
  - `StageScreen.test.tsx`, `the lobby shows the fact count, the round the fact and the reveal the author`.
  - `HostScreen.test.tsx`, `the host sees and hides facts in the lobby`.
  - `TeamWatch.test.tsx`, `a teammate of the author sees the team notice`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/TruthView.test.tsx apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/screens/StageScreen.test.tsx apps/web/src/screens/HostScreen.test.tsx apps/web/src/screens/TeamWatch.test.tsx apps/web/src/i18n.test.ts apps/web/src/locales`. Очікується FAIL.

- [ ] **Step 3: Implement** за зразком `AuctionView.tsx` (структура) і `BluffChoice.tsx` (список варіантів з «своїм» без кнопки). Числа — `signed()`, `dir="ltr"`.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 apps/web`, `apps/web/src/source-scan.test.ts` і `pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 28b player truth on the phone, stage and host console — a fact in the lobby, the host hiding it, names to pick, the author's notice, the reveal and the skipped round"
```

---

### Задача 8. Наскрізні сценарії й кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе вище. Помічники e2e: `open`, `register`, `field`, `click`, `questionText`, `openRoundSettings`, `shot`, `expectNoSideScroll`, `snapshot`, `POLL`, `exact` і зразок `part 27b`. Свої помічники — з суфіксом `28b`.

- [ ] **Step 1: Write the scenarios** з `try/catch` → `snapshot()`, як `part 27b`; `leaderboard: 'end'`.
  - **`it('part 28b: player truth — facts in the lobby, the host hiding one, guessing names, the author sitting out, the author's share, an empty round skipped', …, 600_000)`.**
    - **Редактор.** Ведучий створює вікторину: класика «один варіант» `Яка планета найбільша?` (Юпітер) за 100 + раунд «Правда про гравця», ціна 300, час 30. Видно `truthEditorNote`, списку запитань немає. Кадр `truth28b-editor`.
    - **Гра.** Сцена 1600×900. Оля — 375×812, Тарас — 360×740, Іра — 360×740, Хосе — 320×640 `es-ES`.
    - **Лобі:**
      - Оля пише «Я стрибала з парашутом», Тарас — «Я вмію жонглювати п'ятьма м'ячами», Іра — «Я бачила полярне сяйво», а потім змінює на «Я їла сарану».
      - Хосе пише в полі текст понад 200 символів, але лічильник зупиняється на 200. Потім він стирає його й лишається без факту.
      - Сцена — «Фактів: 3»; `stage.content()` і `olya.content()` не містять «жонглювати».
      - Пульт бачить три факти.
      - Ведучий ховає факт Тараса. Тарас бачить `truthFactHidden` і пише «Я вивчив іспанську за рік». На пульті факт знову видно.
      - Ведучий ховає факт Іри остаточно.
      - Кадри `truth28b-phone-fact`, `truth28b-phone-hidden`, `truth28b-host-facts`, `truth28b-stage-lobby`.
    - **Класика:** Оля й Тарас правильно.
    - **Раунд.** Два запитання (Оля, Тарас — порядок із rng). На кожному:
      - сцена — «Хто це написав?» і факт, чотири імена;
      - автор бачить «Це ваш факт — вгадують інші.» без кнопок;
      - сцена, Хосе й інший гравець не містять «Це ваш факт».
      - **Запитання про Олю:** Тарас вибирає Олю, Іра — Хосе, Хосе мовчить. Запитання закриває таймер (Хосе мовчить), або ведучий «Закрити».
        - Розкриття: «Це написав(ла) Оля», «Автор: +200», «Тарас → Оля ✓».
      - **Запитання про Тараса:** усі троє не вгадали → «Автор: +300».
    - **Перевірки:**
      - рахунки після раунду відповідають формулі;
      - `expectNoSideScroll` для форми й списку імен на 320 px (`es`) і 360 px;
      - історія гри — «Факт написав(ла): Оля · автор +200» і рядок «автор факту».
    - **Пропуск.** Друга кімната з тією самою вікториною: ніхто не пише факт. Після класики на сцені й телефонах — «Фактів немає — раунд «Правда про гравця» пропущено.», далі `finished`. Кадр `truth28b-stage-skipped`.
  - **`it('part 28b: player truth in teams — every member writes, captains guess, the author's team waits and takes the share', …, 600_000)`:**
    - командна вікторина з двома командами по двоє;
    - факти пишуть усі четверо;
    - на запитанні про учасника команди А капітан А бачить `truthOwnTeam`, а капітан Б вибирає ім'я;
    - не капітан Б бачить вибір лише для читання;
    - на сцені рядок відповідачів (`answerer: 'pick'`) показує обидві команди;
    - частка — команді А.
    - Кадри `truth28b-team-own`, `truth28b-team-pick`, `truth28b-stage-reveal`.
  - **Кадри (`E2E_SHOTS=1`):** `truth28b-editor`, `truth28b-phone-fact`, `truth28b-phone-hidden`, `truth28b-host-facts`, `truth28b-stage-lobby`, `truth28b-stage-question`, `truth28b-phone-pick-es-320`, `truth28b-phone-own`, `truth28b-stage-reveal`, `truth28b-stage-skipped`, `truth28b-team-own`, `truth28b-team-pick`.

- [ ] **Step 2: Run** `pnpm build`, потім на передньому плані `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 28b"` (менше 10 хв). Очікується PASS.

- [ ] **Step 3: Переглянути кадри:**
  - поле факту й лічильник на 320/360 px не вилазять;
  - довгі імена в списку й у «Тарас → Оля» переносяться;
  - факт на сцені читається на 1600×900;
  - іспанська розкладка ціла.
  Якщо щось ламається — виправити CSS, коміт окремо.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2` (усе) і `pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts apps/web/src/styles.css
git commit -m "test(e2e): part 28b player truth — facts in the lobby, host hiding, guessing names, the author sitting out, the author's share, an empty round skipped, teams"
```
