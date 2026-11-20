# План 65: повтор завершеної гри по кроках в адмінці (44g)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** Рушій (`packages/engine`), `GameState`, `SavedRoom`, зрізи й `Room` не змінюються. Усе нове записування — **на боці рекордера** (`apps/server/src/recorder.ts` + новий `game-events.ts`): він сам порівнює стан кімнати між подіями `changed` і дописує рядки в нову таблицю. Якщо виконавцю здасться, що потрібне нове поле в стані чи `Play`, — **зупинитися й спитати контролера**.

> **Міграція — `0048_game_events`** (остання в `main` — `0047_errors_problems`). Лише додавання: нова таблиця `game_event`, індекс і зовнішні ключі; жодного `DROP` і жодних змін наявних колонок. План 66 (злиття акаунтів), що пишеться паралельно, бере **наступний** номер (`0049`), якщо йому потрібна міграція.

> **Звірка з кодом.** План спирається на `main` 2026-11-20 (`97cb0419`, специфікація 44g):
> - **що вже записано про гру** (`apps/server/src/db/schema.ts`):
>   - `game` — `quizSnapshot`, `plays: PlayRef[]` (на кожне закрите запитання: `roundIndex`, `questionId`, `cell { cellId, chooserId }`, `bluff`, `drawing`, `wipeout`, `survival`, `ladder`, `truth`, `think`…), `questionsPlayed`, `startedAt`, `finishedAt`, `status`, `autopilot`. Рядок завершеної гри більше не змінюється (кеш `playedShapes` у `history.ts`, план 46) — **у `plays` нічого не дописуємо**;
>   - `participant` — `nickname`, `userId`, `score`, `rank`, `isTeam`, `teamId`. **Вилучених гравців `writeGame` стирає разом з відповідями й коригуваннями** (`delete … notInArray(participant.id, ids)`, каскад) — у жодній грі їх не видно;
>   - `answer` — на учасника × запитання × спробу: `payload`, **`timeMs` (від відкриття запитання, без пауз: `resume` зсуває `startedAt`; є в усіх іграх, колонка `NOT NULL` від початку)**, `accepted`, `points`, `streakBonus`, **`overridden` (ручне рішення ведучого; є в усіх іграх)**, `wager`, `buff` (баф на запитанні), `spareId`, `awayMs` (12e), `debuff` (12i), `clue`, `answeredBy` (12i, людина команди). Службові спроби: `PENALTY_ATTEMPT = -1` (штраф, `timeMs 0`), `VOTE_ATTEMPT = -3` (голос), `AWAY_ATTEMPT = -4` (лише позначка виходу, `timeMs 0`). Оцінки `grade` немає: «частково» = `!accepted && points > 0` (рушій ставить `accepted` лише для `correct`, `game.ts` ~2869);
>   - `score_adjustment` — `seq`, `roundIndex`, **`afterQuestion` (скільки запитань закрито на мить коригування)**, `points`, `source` (`host`, `undo` = «↶ Бали», `appeal`, `debuff`, `duel`, `duelbet`, `survival`, `ladder`, `quest`, `away`, `think`, `carry`), `debuff`, `targetNickname`, `undoesQuestion`, `undoesSeq` (12a). Миті коригування (`ScoreAdjustment.at` у стані) у базі немає;
>   - `appeal` (12f) — `seq`, `participantId`, `questionIndex`, `reason`, `yes`, `no`, `outcome`, `adjustmentSeq`; голоси людей не зберігаються (і не мають);
>   - **не записано ніде:** хто приєднався чи був вилучений посеред гри й коли, паузи, якою була автоматична оцінка до ручного рішення ведучого;
> - **рекордер** (`recorder.ts`): `attachRecorder(manager, db, onError, retryMs, maxRetries)` слухає `manager.onEvent`; на `changed` — `adopt(room)` + `record(room)`. `record` виходить у `lobby` і коли `signature(state)` не змінився (пауза підпису не змінює); інакше ставить у чергу `job` → `save(db, snapshot)` (транзакція: `writeGame`, `trimToCheckpoint` для точного продовження, `dropReplaced` для 12r). Пам'ять кімнати — мапи `lastSignature`, `savedQuestions`, `debuffsSeen` (зразок захоплення на боці рекордера — `seeDebuffs`), скидаються в `adopt` (нова кімната під id, підйом після перезапуску) і `forget`. Час менеджера — `manager.now()`. Видалені акаунти посеред гри — `room.forgotten`, нікнейм `DELETED_NICKNAME` (`nickOf` у `writeGame`);
> - **історія й перегляд 58:** `history.ts` `hostGameWithFacts(db, hostId | null, id)` → `{ detail: GameDetail; factInput }` (`null` для hostId — перегляд адміна); помічники `snapshotOf`, `playedQuestions(quiz, plays, questionsPlayed)` (індекс = `answer.question_index`), внутрішні `cellResult` (ціна клітинки `questionPrice(found.cell.question)` × `x2/x3`), `allSpares`, `responsesOf`. `GameDetail.questions[].responses` не має ні часу, ні балів, ні `overridden` — повтору його не досить. Маршрут `GET /api/admin/games/:id` — `admin-card-routes.ts` ~121, **не журналюється**. Веб: `apps/web/src/admin/AdminGame.tsx` (обгортка `GameDetailView` з `pages/GameHistory.tsx`, `back` — `<header className="bar">`), маршрут `games/:id` у `admin/Admin.tsx` ~110, `admin-api.ts` `adminGame`;
> - **журнал адміна:** `packages/shared/src/admin.ts` `ADMIN_ACTION_KINDS`, `ADMIN_LOG_GROUP_KINDS` (група `games: ['game_close']`), `AdminLogDetails { title?; code?; … }`; `bans.ts` `logAction(tx, { adminId, kind, targetUserId, details, now })`; зразок «перегляд пишеться раз на хвилину» — `admin-routes.ts` ~249 `quiz_view` (`VIEW_LOG_MS = 60_000`, мапа `viewed`); веб `admin-text.ts` `logLine`, ключі `adminLog_<kind>`;
> - **веб-тексти, що вже є:** `format.ts` `answerText(answer, question)` («—» для `null`), `correctText(question)`, `secondsText(ms)`, `questionName(question)`, `num`, `signed`; ключі `correctAnswer`, `type_<type>`, `buff_<kind>`, `debuff_<kind>`, `scoreSource_<source>` (усі 12 джерел), `historyAway`, `appeal-text.ts` `historyAppealText(appeal)`;
> - **видалення акаунта:** `account-delete.ts` переписує нікнейми (`participant.nickname`, `score_adjustment.target_nickname`, імена в `plays`) на `DELETED_NICKNAME`; тест `a user with rows in every table that references him is deleted without orphans` (`account-delete.test.ts` ~173) перелічує всі таблиці з посиланням на `user`;
> - тести: `testing/test-db.ts` `createTestDb`, `testing/fake-scheduler.ts`, `testing/team-game.ts`; e2e — `e2e/helpers/setup.ts` (`relisten`, `useE2eServer`, `ctx`, `db`), `helpers/common.ts` (`join`, `click`, `takeBuff`, `expectNoSideScroll`, `POLL`); зразки: `part58-player-card.e2e.ts` (адмін, світла тема, кадри), `part12f-i-appeal-resume-captain-powers.e2e.ts` (апеляція з голосуванням).
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

> **Точки злиття з планом 66** (злиття двох акаунтів, пишеться паралельно; хто зливається другим — лишає обидві зміни):
> - `packages/shared/src/admin.ts`: рядок `ADMIN_ACTION_KINDS` і `ADMIN_LOG_GROUP_KINDS` — ми додаємо `game_replay_view` у групу `games`; 66 — свій вид (найімовірніше в `players`). Тест «кожен вид має групу» має лишитися зеленим;
> - `apps/web/src/admin/admin-text.ts` `logLine` / ключі `adminLog_*`; `apps/web/src/i18n.ts`, шість JSON, `i18n.test.ts` — обидва плани додають свої `ADDED_*` у довгий рядок умови `adds no uk keys beyond the agreed list` (ми — `ADDED_REPLAY_65`);
> - адмінка, веб: `apps/web/src/admin/Admin.tsx` (`<Routes>`: ми — `games/:id/replay`), картка гравця й перегляд гри (66 змінює картку; ми — лише `AdminGame.tsx`, кнопку в шапці);
> - адмінка, сервер: рядки реєстрації в кінці `admin-routes.ts` (ми — `registerAdminReplayRoutes`), `routes` у `admin-routes.test.ts`;
> - `apps/server/src/db/schema.ts`, `drizzle/meta/_journal.json`, `drizzle/meta/*_snapshot.json`: наша `0048`, їхня — `0049` поверх неї;
> - **`game_event.user_id`** — нове посилання на `user`: злиття акаунтів 66 мусить переносити його з акаунта, що зникає, на той, що лишається (`update game_event set user_id = <лишається> where user_id = <зникає>`), а `account-delete.ts` — затирати нікнейм (задача 2). Обидва плани міняють `account-delete.ts` і `account-delete.test.ts` (перелік таблиць) — лишити обидва.

**Мета:** адмін з перегляду будь-якої незапущеної гри відкриває «Повтор по кроках» і проходить запитання одне за одним: текст, тип, ціна, правильна відповідь; таблиця учасників (відповідь текстом, час у секундах від початку запитання, зараховано / частково / ні, «вручну», бали, рахунок після); події кроку (ручні рішення ведучого, «↶ Бали» й інші коригування, апеляції з голосами, бафи й дебафи, приєднання й вилучення, паузи). Старі ігри показують усе, що записано, а чого немає — «—»; нові ігри відтепер записують приєднання, вилучення, паузи й оцінку до ручного рішення. Кожен перегляд — рядок журналу.

**Архітектура:** спільне — `packages/shared/src/replay.ts` (типи `GameReplay`, вид події, правило вердикту). Сервер: `game-events.ts` (чиста функція порівняння двох станів кімнати → рядки подій; захоплення на боці рекордера) + таблиця `game_event` (`0048`), яку рекордер дописує в тій самій транзакції `save`; `game-replay.ts` будує повтор з `game`, `participant`, `answer`, `score_adjustment`, `appeal`, `game_event`; маршрут `admin-replay-routes.ts` (`GET /api/admin/games/:id/replay`, журнал `game_replay_view` раз на хвилину). Веб: `admin/AdminReplay.tsx` + `admin/replay-text.ts`, кнопка в `AdminGame.tsx`, крок у адресі (`?q=`).

**Технології:** TypeScript, zod 4, Fastify, drizzle (Postgres) + drizzle-kit, vitest (`shared`/`server`/`web`), React 19 + Testing Library, react-router, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-20-game-replay-design.md` (44g); перегляд гри адміна — план 58; апеляції — 12f; скасування — 12a; вихід із гри — 12e; дебафи в записі — 12i.

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22**; `packages/engine` — без жодної зміни (перевірка: `git diff --stat main -- packages/engine` порожній).
- **Міграція одна — `0048_game_events`**, лише `CREATE TABLE` / `CREATE INDEX` / зовнішні ключі. Жодних нових полів у `plays` (рядок завершеної гри незмінний) і в наявних таблицях.
- **Лише адміністратори:** новий `/api/admin/games/:id/replay` — через `read` (ворота `gate`), не-адміну й гостю — та сама **404**; маршрут — у списку `routes` тесту воріт. Перегляд — рядок журналу `game_replay_view` (не частіше разу на 60 с для пари адмін × гра).
- **Жодних особистих даних понад перегляд гри 58:** у відповіді — нікнейми, без email і user id (тест шукає `@` і id акаунтів). Видалений акаунт — `DELETED_NICKNAME` і в нових подіях.
- Запис подій **ніколи не валить гру й запис гри**: збій — як збій запису (повтор черги), без дублікатів (id події стабільний).
- Тексти інтерфейсу — **7 мов**: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`. Нові uk-ключі — у списку `ADDED_REPLAY_65` у `i18n.test.ts` (в умову `adds no uk keys beyond the agreed list` і в перевірку наявності в шести мовах зі збігом змінних, як `ADDED_ERRORS_64`). Множин немає. ru немає. Наявні ключі (`correctAnswer`, `type_*`, `buff_*`, `debuff_*`, `scoreSource_*`, `historyAway`, `historyAppeal*`) — перевикористати, не дублювати.
- Кириличні літерали в `apps/web/src/` — лише в словниках і тестах (`source-scan.test.ts`).
- **Нічого, пов'язаного з росією**, — у фікстурах, запитаннях, ніках, e2e.
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm exec tsc -p <пакет>` у задачах 1–4, з задачі 5 — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів vitest).
- Файли правити лише Edit/Write чи `sed`; **python3 на цій машині — порожня заглушка, ним нічого не правити й не генерувати**; після коміту — `git show --stat`.
- Робоче дерево — лише `C:\ClaudeCode\quiz\.superpowers\worktrees\plan65`; жодних файлів поза `C:\ClaudeCode\quiz` (тимчасові — у `.superpowers` чи scratchpad сесії). Інших дерев не торкатися.
- e2e: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 65"`; телефон 360 × 740 і широкий екран 1280 × 800, світла тема (`quiz:theme = light`, `is-light` на `<html>`); після — окремо `-t "part 58"` і `-t "part 12f"`.

## Рішення плану (там, де специфікація мовчить)

**Що записувати додатково (лише нові ігри) — таблиця `game_event`**
- Колонки: `id uuid primary key` (генерує рекордер, `randomUUID()` — повтор запису не дублює), `game_id uuid not null → game.id on delete cascade`, `at timestamptz not null` (час `manager.now()` у мить, коли рекордер побачив зміну), `question_index integer not null` — `state.plays.length - 1` у ту мить (`-1` — до першого запитання), `kind text not null` (`GameEventKind`), `participant_id uuid` (без зовнішнього ключа — вилучені учасники стираються), `user_id text → user.id on delete set null`, `nickname text not null` (`''` для паузи й старту), `details jsonb` (`GameEventDetails`). Індекс `game_event_game_idx (game_id, at)`.
- Види (`GAME_EVENT_KINDS`): `start` (перший запис гри поза лобі; **позначка «ця гра записує події»**), `join` (новий id у `state.players` чи `state.teams.members` після старту), `leave` (id зник звідти; `details.score` — рахунок на мить вилучення; у командній — `details.team`), `pause`, `resume` (перехід `state.paused`), `verdict` (запис `plays[i].answers[id]` став `overridden` або змінив `grade` при `overridden`; `details: { from: Grade | null; to: Grade }`, `from` — оцінка, яку рекордер бачив до того, `null` — запису не було). Бліц-спроби (`play.blitz.attempts`) — не `verdict`: їх і так оцінює ведучий.
- **Відключення (`connected`) не записуємо** — на слабкому зв'язку це десятки рядків; для «пішов із гри» є `answer.away_ms` (12e).
- Базова лінія: перше спостереження кімнати поза лобі (і після `adopt` — підйом після перезапуску, точне продовження) лише запам'ятовує стан і дає подію `start` **тільки якщо в базі ще немає `start` цієї гри** (перевірка в транзакції запису: `insert … where not exists`); хибних `join` після перезапуску немає.
- Захоплення — у `record(room)` **до** перевірки підпису (як `seeDebuffs`): `watcher.see(room, manager.now())`. Нові події лягають у чергу кімнати `pending`; `record` не виходить на незмінному підписі, якщо `pending` не порожня (пауза підпису не змінює). `job` бере всі `pending` на свою мить, пише їх у `save` після `writeGame` (`insert … on conflict (id) do nothing`), і лише після успіху прибирає записані id з `pending`. Збережена кімната (`sealed`, 13b) і `forget` — `pending` відкидаються (пауза перед збереженням не варта окремого запису).
- `trimToCheckpoint` ще й видаляє `game_event` гри з `question_index >= closedQuestions(state)` (події продовження, що впало). 12r `dropReplaced` — каскадом.
- Нікнейм події: `DELETED_NICKNAME` для `room.forgotten`; `user_id` — з `room.playerUsers`. `account-delete.ts` у своїй транзакції до видалення: `update game_event set nickname = DELETED_NICKNAME where user_id = <id>`.

**Повтор (`packages/shared/src/replay.ts`, експорт з `index.ts`)**
- `GAME_EVENT_KINDS = ['start', 'join', 'leave', 'pause', 'resume', 'verdict'] as const`, `GameEventKind`, `GameEventDetails { from?: Grade | null; to?: Grade; score?: number; team?: string }`.
- `ReplayVerdict = 'correct' | 'partial' | 'wrong' | 'none'`; `replayVerdict(row: { accepted: boolean; points: number; payload: Answer | null; attempt: number }, unscored: boolean): ReplayVerdict` — `unscored` (опитування, хмара) чи `attempt === VOTE_ATTEMPT` → `'none'`; `accepted` → `'correct'`; `points > 0` → `'partial'`; `payload === null && points === 0` → `'none'` (не відповів); інакше `'wrong'`. Константи спроб `PENALTY_ATTEMPT/VOTE_ATTEMPT/AWAY_ATTEMPT` — серверні; у спільне передати числа як `REPLAY_VOTE_ATTEMPT = -3` (тест звіряє з `schema.ts`).
- Типи:
  - `ReplayRow { nickname; answeredBy: string | null; attempt: number; answer: Answer | null; spare: Question | null; timeMs: number | null; verdict: ReplayVerdict; manual: boolean; points: number; wager: number | null; awayMs: number | null }` — `timeMs: null`, якщо `payload === null` або спроба службова (`PENALTY`/`AWAY`) → «—»;
  - `ReplayScore { nickname; score: number }`;
  - `ReplayEvent` (розмічене `kind`): `{ kind: 'manual'; nickname; from: ReplayVerdict | null; to: ReplayVerdict }` (`from: null` — стара гра), `{ kind: 'adjustment'; nickname; source: AdjustmentSource; points; target?: string | null; debuff?: DebuffKind; undoes?: UndoTarget }`, `{ kind: 'appeal'; nickname; appeal: GameAppeal }` (той самий тип, що в історії — для `historyAppealText`), `{ kind: 'buff'; nickname; buff: BuffKind }`, `{ kind: 'debuff'; nickname; debuff: DebuffKind }`, `{ kind: 'join' | 'leave'; nickname; at: string; team?: string; score?: number }`, `{ kind: 'pause'; at: string; ms: number | null }` (пара `pause`+`resume`; `null` — не відновлено до кінця);
  - `ReplayStep { index; roundIndex; question: Question | null; price: number; multiplier: number; rows: ReplayRow[]; scores: ReplayScore[]; events: ReplayEvent[] }`;
  - `GameReplay { id; title; code; status: GameStatus; startedAt; finishedAt: string | null; autopilot: boolean; teams: boolean; rounds: { title; type }[]; recorded: boolean; start: { scores: ReplayScore[]; events: ReplayEvent[] }; steps: ReplayStep[] }` — `recorded` = є подія `start`.
- **Розкладка подій по кроках:** коригування з `afterQuestion = k` — на крок `k − 1` (після закриття запитання `k − 1`; так і «↶ Бали», апеляція, штраф за вихід), `afterQuestion = 0` (зокрема `carry`) — у `start`; апеляції — на крок `questionIndex`; `game_event` — на крок `question_index` (`-1` → `start`); `manual` — з рядків `answer.overridden` кроку, а `from` береться з останньої події `verdict` того ж учасника й кроку (немає — `null`); `buff`/`debuff` — з `answer.buff` / `answer.debuff` (по одному на учасника й крок). Порядок подій кроку: manual, buff, debuff, appeal, adjustment (за `seq`), join/leave/pause (за `at`).
- **Рахунок після кроку `k`:** для кожного учасника рушія (соло чи команда) `start` = сума коригувань з `afterQuestion = 0`; далі + сума `answer.points` (усі спроби) з `question_index = k` + сума коригувань з `afterQuestion = k + 1`. Для завершеної гри останній рахунок = `participant.score` (тест).
- **Рядки таблиці кроку:** учасники рушія в порядку місць (`rank`, потім `score`), по рядку на кожну спробу (бліц — кілька); учасник без жодного рядка — один рядок «—» (`verdict 'none'`); `AWAY_ATTEMPT` — лише `awayMs` на рядок учасника; голоси в командній грі (`isUnscored`) — рядки людей, як у `responsesOf`. `answeredBy` — нікнейм людини з `answer.answered_by`.
- **Ціна:** клітинка поля — `questionPrice(клітинки)` і `multiplier` 2/3 (`x2`/`x3`), як `cellResult`; інакше `questionPrice(question)`, `multiplier: 1`. Для цього `history.ts` експортує `cellPriceOf(quiz, ref): { price: number; multiplier: number } | null` (і `cellResult` бере ціну з нього), а також `allSpares`.
- Повтор показує відповіді через `answerText`; особливі вигляди типів (автори блефу, малюнок, сходинки «Мільйонера», місця «Думай інакше») лишаються в перегляді гри 58 — у повторі їх не дублюємо.
- Статус `running` → **409 `replay_running`** (гра ще йде, запис неповний); `finished`, `aborted`, `saved` — можна. Кнопка в `AdminGame` для `running` не показується.
- Зіпсований знімок (`snapshotOf` → `null`): кроки з `question: null`, ціна 0, рядки й події — як є.

**Сервер, маршрут і журнал**
- `apps/server/src/admin-replay-routes.ts`: `registerAdminReplayRoutes(app, deps, { read, write, adminOf })`; `GET /api/admin/games/:id/replay` → `GameReplay` | 404 `not_found` (не uuid, немає гри, не адмін) | 409 `replay_running`. Журнал: `logAction(db, { adminId, kind: 'game_replay_view', targetUserId: game.hostId, details: { title, code }, now })`, не частіше 60 с для `${adminId}:${gameId}` (власна мапа, як `viewed`).
- Вид `game_replay_view` — у `ADMIN_ACTION_KINDS` і групі `games`.

**Веб**
- Маршрут `games/:id/replay` у `Admin.tsx` → `AdminReplay`. `admin-api.ts` `adminGameReplay(gameId): Promise<ApiData<GameReplay>>`.
- `AdminGame.tsx`: у шапці `back` поруч із «Назад» — `Link` «Повтор по кроках» (`/admin/games/:id/replay`), лише коли `status !== 'running'`.
- `AdminReplay.tsx`: шапка `.bar` з «До гри» (`/admin/games/:id`); заголовок `adminReplayTitle`; якщо `recorded === false` — примітка `adminReplayNotRecorded`; блок «Перед першим запитанням» (`start`), якщо є події чи ненульовий рахунок; навігація: `select` «Запитання» з `optgroup` на раунд (`adminReplayRound`), кнопки «Назад» / «Далі» (вимкнені на краях), підпис `adminReplayStep`; крок — у `?q=<номер від 1>` (`useSearchParams`, `replace`), неправильне `q` → 1. Картка кроку: `questionName`, `type_<type>`, `adminReplayPrice` (з `×2/×3`), `correctAnswer` + `correctText`; список рядків `ol.replay-rows > li.replay-row` (сітка: на ≤ 600 px — картка з підписами полів, ширше — колонки «Учасник · Відповідь · Час, с · Рішення · Бали · Рахунок»); події — `ul.replay-events`, порожньо — `adminReplayNoEvents`.
- `admin/replay-text.ts` (чисті функції): `replayTime(ms: number | null): string` (`secondsText` або `'—'`), `verdictText(verdict: ReplayVerdict, manual: boolean): string`, `eventLine(event: ReplayEvent): string`, `priceText(price, multiplier): string`.
- Ключі (uk): `adminReplayOpen` «Повтор по кроках», `adminReplayTitle` «Повтор: «{title}»», `adminReplayBackToGame` «← До гри», `adminReplayPrev` «← Назад», `adminReplayNext` «Далі →», `adminReplayJump` «Запитання», `adminReplayStep` «Запитання {n} з {total}», `adminReplayRound` «Раунд {n}. {title}», `adminReplayStart` «Перед першим запитанням», `adminReplayPrice` «Ціна: {points}», `adminReplayPriceMark` «Ціна: {points} ×{mark}», `adminReplayNotRecorded` «Ця гра зіграна до запису подій: приєднання, вилучення, паузи й оцінка до ручного рішення не збереглися (—).», `adminReplayPlayer` «Учасник», `adminReplayAnswer` «Відповідь», `adminReplayTime` «Час, с», `adminReplayVerdict` «Рішення», `adminReplayPoints` «Бали», `adminReplayScore` «Рахунок», `adminReplayBy` «відповідав(-ла) {name}», `adminReplayVerdict_correct` «зараховано», `adminReplayVerdict_partial` «частково», `adminReplayVerdict_wrong` «не зараховано», `adminReplayVerdict_none` «—», `adminReplayManual` «{verdict} (вручну)», `adminReplayEvents` «Події», `adminReplayNoEvents` «Подій немає», `adminReplayEventManual` «{name}: ведучий вирішив вручну — {from} → {to}», `adminReplayEventAdjust` «{name}: {points} — {source}», `adminReplayEventBuff` «{name}: баф «{buff}»», `adminReplayEventDebuff` «{name}: дебаф «{debuff}»», `adminReplayEventAppeal` «{name} оскаржує: {result}», `adminReplayEventJoin` «{time} — приєднався(-лася) {name}», `adminReplayEventLeave` «{time} — вилучено {name} (рахунок {score})», `adminReplayEventPause` «{time} — пауза {seconds} с», `adminReplayEventPauseOpen` «{time} — пауза до кінця гри», `err_replay_running` «Гра ще йде — повтор буде після її завершення.», `adminLog_game_replay_view` «{admin} переглянув(-ла) повтор гри «{title}» ({target})». `{time}` — київський час `HH:MM:SS` (`kyivWhenText` з `admin-text.ts`).

## Порядок збирання

- 1 → 2 → 3 → 4 → 5 → 6. Залежності: 2 ← 1; 3 ← 1, 2; 4 ← 1; 5 ← 3, 4; 6 — остання.
- `tsc -p apps/web` може падати на `adminLog_game_replay_view` до задачі 4 — очікувано; `pnpm typecheck` обов'язково зелений з задачі 5.

## Фокус рев'ю

1. **Стара гра.** Рядки `answer`/`score_adjustment`/`appeal` без жодного `game_event` → `recorded: false`, `manual.from: null`, час відповідей є (із `time_ms`), паузи й приєднання — жодних, у вебі — примітка й «—». Повтор не падає на зіпсованому знімку. Задачі 3, 5, 6.
2. **Рахунок сходиться.** Останній `scores` завершеної гри = `participant.score` для кожного — і з «↶ Бали», апеляцією «так», штрафом за вихід, ставками фіналу, перенесеними балами (`carry`). Задача 3.
3. **Запис подій не шкодить грі.** Перезапуск (кімната піднята, `adopt`) не дає хибних `join`/`start`; збій бази й повтор не дублюють події; пауза без іншої зміни все одно записується; точне продовження прибирає події після точки. Задача 2.
4. **Особисте.** Видалений акаунт — `DELETED_NICKNAME` у подіях (і тих, що вже записані, і після `room.forgotten`); у відповіді маршруту немає `@` і id акаунтів. Задачі 2, 3.
5. **Ворота й журнал.** Не-адміну й гостю — 404; два перегляди за хвилину — один рядок журналу; `running` — 409. Задачі 3, 6.

---

### Задача 1. Спільне: типи повтору, вид події, правило вердикту, вид журналу

**Files:**
- Create: `packages/shared/src/replay.ts`, `packages/shared/src/replay.test.ts`.
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/admin.ts`.
- Test: `packages/shared/src/admin.test.ts`.

**Interfaces:**
- Consumes: `Answer`, `Question`, `Grade`, `AdjustmentSource`, `BuffKind`, `DebuffKind`, `UndoTarget`, `GameAppeal`, `GameStatus`, `Round`.
- Produces: `GAME_EVENT_KINDS`, `GameEventKind`, `GameEventDetails`, `REPLAY_VOTE_ATTEMPT`, `ReplayVerdict`, `replayVerdict(row, unscored)`, `ReplayRow`, `ReplayScore`, `ReplayEvent`, `ReplayStep`, `GameReplay`; вид журналу `game_replay_view` (група `games`).

- [ ] **Step 1: Write the failing tests:**
  - `replay.test.ts` `the verdict follows the stored row`: `{ accepted: true, points: 100, payload: text, attempt: 0 }` → `'correct'`; `{ accepted: false, points: 50, … }` → `'partial'`; `{ accepted: false, points: -100, … }` → `'wrong'`; `{ accepted: false, points: 0, payload: text }` → `'wrong'`; `{ accepted: false, points: 0, payload: null }` → `'none'`; будь-що з `unscored = true` → `'none'`; `attempt: REPLAY_VOTE_ATTEMPT` → `'none'`.
  - `replay.test.ts` `event kinds`: `GAME_EVENT_KINDS` = `['start', 'join', 'leave', 'pause', 'resume', 'verdict']`.
  - `admin.test.ts`: `ADMIN_ACTION_KINDS` містить `game_replay_view`; `ADMIN_LOG_GROUP_KINDS.games` містить його; наявний тест «кожен вид має групу» — зелений.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/replay.test.ts packages/shared/src/admin.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (повтор).
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 && pnpm exec tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 65 game replay types — steps with rows (answer, time, verdict, manual, points), running scores and events (manual decisions, adjustments, appeals, buffs, debuffs, joins, leaves, pauses), the verdict rule from stored rows, game event kinds, the game_replay_view log kind"
```

---

### Задача 2. Сервер: міграція `0048`, захоплення подій на боці рекордера

**Files:**
- Create: `apps/server/drizzle/0048_game_events.sql` (+ знімок і рядок журналу від drizzle-kit), `apps/server/src/game-events.ts`, `apps/server/src/game-events.test.ts`, `apps/server/src/recorder.events.test.ts`.
- Modify: `apps/server/src/db/schema.ts` (`gameEvent`), `apps/server/src/recorder.ts` (`watcher`, `pending`, `save`, `trimToCheckpoint`, `adopt`/`forget`), `apps/server/src/account-delete.ts`.
- Test: `apps/server/src/db/schema.test.ts`, `apps/server/src/account-delete.test.ts`, `apps/server/src/recorder.test.ts`, `apps/server/src/recorder.saved.test.ts`.

**Interfaces:**
- Consumes: задача 1; `GameState`, `Room` (`state`, `playerUsers`, `forgotten`), `manager.now()`, `DELETED_NICKNAME`.
- Produces: `gameEvent` (drizzle; `GameEventRow = typeof gameEvent.$inferInsert`); у `game-events.ts`: `interface Seen { players: Map<string, { nickname; teamId: string | null; score: number }>; paused: boolean; grades: Map<string, { grade: Grade; overridden: boolean }> }`, `seenOf(state): Seen`, `diffEvents(prev: Seen, next: GameState, at: Date, who: { users: ReadonlyMap<string, string>; forgotten: ReadonlySet<string> }): Omit<GameEventRow, 'gameId'>[]`, `createEventWatcher(): { see(room: Room, now: number): void; pending(roomId: string): GameEventRow[]; written(roomId: string, ids: string[]): void; reset(roomId: string): void }`. Ключ `grades` — `${index}:${participantId}` для двох останніх `plays`.

- [ ] **Step 1: Write the failing tests:**
  - `game-events.test.ts` (чисті стани з `@quiz/engine/testing`):
    - `a late player is a join, a kicked one is a leave with the score`: стан з Олею й Петром → той самий + Марко → одна подія `join` `nickname 'Марко'`, `question_index` = `plays.length - 1`; далі без Петра (рахунок 300) → `leave` `details { score: 300 }`.
    - `pause and resume are two events`: `paused false → true → false` → `pause`, потім `resume`.
    - `a host decision keeps the grade it replaced`: запис Петра `wrong` → той самий з `overridden: true, grade: 'correct'` → `verdict` `{ from: 'wrong', to: 'correct' }`; ще раз той самий стан → нічого; ручна оцінка гравця без запису → `from: null`.
    - `blitz attempts are no verdicts`: зміна `play.blitz.attempts` → жодної `verdict`.
    - `a forgotten seat is the deleted player`: `forgotten` містить id Петра → `nickname DELETED_NICKNAME`, `userId null`.
  - `recorder.events.test.ts` (`RoomManager` + `FakeScheduler` + `attachRecorder` + `createTestDb`, як `recorder.test.ts`):
    - `a game records start, a late join, a pause, a manual decision and a kick`: старт → запитання 1 → `manager.join` Марка → `host(room, { type: 'pause' })`, `resume` → відповіді, `lock`, `override` Петра на `correct` → `kick` Марка → фініш; після `recorder.idle()` у `game_event` за `at`: `start`, `join` (Марко, `question_index 0`), `pause`, `resume`, `verdict` (`from 'wrong'`, `to 'correct'`), `leave` (Марко, з рахунком); `start` — рівно один.
    - `a pause alone is written`: пауза без іншої зміни стану → після `idle()` рядок `pause` у базі.
    - `a failed write retries without duplicates`: перший `save` кидає (`onQuery`/шпигун, як у `recorder.test.ts` для повторів) → після повтору кожна подія — один рядок.
    - `a room raised after a restart adds no joins and no second start`: кімнату піднято (`adopt` нової `Room` з тим самим id і станом посеред гри) → нових `join`/`start` немає.
    - `the exact continuation trims later events`: `trimToCheckpoint` (як у `recorder.saved.test.ts`) прибирає події з `question_index >= closed`.
    - `GAME_STATE_VERSION stays 22`: `expect(GAME_STATE_VERSION).toBe(22)` (імпорт з `@quiz/engine`).
  - `schema.test.ts` `describe('game events (65)')`: подія без `participant_id` і `user_id` приймається; видалення гри стирає її події; видалення `user` ставить `user_id null`.
  - `account-delete.test.ts`: у тесті «rows in every table that references him» — рядок `game_event` Тараса; після видалення `nickname = DELETED_NICKNAME`, `user_id null`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/game-events.test.ts apps/server/src/recorder.events.test.ts apps/server/src/db/schema.test.ts apps/server/src/account-delete.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `gameEvent` у `schema.ts` за «Рішеннями плану» (запис); `pnpm --filter @quiz/server exec drizzle-kit generate --name game_events` → перевірити, що файл — `0048_game_events.sql` і SQL — лише `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY`. Далі `game-events.ts`, підключення в `recorder.ts` (виклик `watcher.see` у `record` до підпису; `record` не виходить при непорожній `pending`; `job` передає `events` у `save`; `written` після успіху; `reset` в `adopt` і `forget`), `trimToCheckpoint`, `account-delete.ts`.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/game-events.test.ts apps/server/src/recorder.events.test.ts apps/server/src/db/schema.test.ts apps/server/src/account-delete.test.ts apps/server/src/recorder.test.ts apps/server/src/recorder.saved.test.ts apps/server/src/history.test.ts apps/server/src/rooms/manager.restore.test.ts apps/server/src/restart.test.ts apps/server/src/db-backup.test.ts && pnpm exec tsc -p apps/server && git diff --stat main -- packages/engine`. Expected: PASS, diff рушія порожній.
- [ ] **Step 5: Commit**
```bash
git add apps/server/drizzle apps/server/src
git commit -m "feat(server): 65 game events — migration 0048 adds game_event; the recorder compares room states and records the start, late joins, kicks with the score, pauses and resumes, and the grade a host decision replaced, written in the game transaction without duplicates on retry and without false joins after a restart; deleted accounts become the deleted player; GAME_STATE_VERSION stays 22"
```

---

### Задача 3. Сервер: повтор гри з записаних рядків і маршрут адміна з журналом

**Files:**
- Create: `apps/server/src/game-replay.ts`, `apps/server/src/game-replay.test.ts`, `apps/server/src/admin-replay-routes.ts`, `apps/server/src/admin-replay-routes.test.ts`.
- Modify: `apps/server/src/history.ts` (експорт `cellPriceOf`, `allSpares`; `cellResult` бере ціну з `cellPriceOf`), `apps/server/src/admin-routes.ts` (реєстрація).
- Test: `apps/server/src/admin-routes.test.ts`, `apps/server/src/history.test.ts`.

**Interfaces:**
- Consumes: задачі 1–2; `snapshotOf`, `playedQuestions`, `isUnscored`, `questionPrice`, `logAction`, `AdminDeps`, ворота `read`/`adminOf`.
- Produces: `gameReplay(db: Db, id: string): Promise<GameReplay | 'running' | null>`; `registerAdminReplayRoutes(app, deps, guards)`; `GET /api/admin/games/:id/replay` → 200 `GameReplay` / 404 / 409 `replay_running`.

- [ ] **Step 1: Write the failing tests:**
  - `game-replay.test.ts` (гра через `RoomManager` + рекордер, вікторина `makeQuiz([text, single, single], { speedBonus: false })` з бафами й апеляціями в правилах):
    - `each step has the question, the price, the rows with time and verdict, and the running score`: Оля відповідає «Париж» через 4 с (`scheduler.advance(4000)`) → рядок `timeMs 4000`, `verdict 'correct'`, `points 100`; Петро мовчить → рядок `answer null`, `timeMs null`, `verdict 'none'`; `price 100`, `multiplier 1`; `scores` кроку 1 — `[Оля 100, Петро 0]`.
    - `manual decisions, undo, appeal, buff and debuff are events of their step`: `override` Петра → `{ kind: 'manual', from: 'wrong', to: 'correct' }` і рядок `manual: true`; `undo` балів Олі → `adjustment` `source 'undo'` на тому ж кроці; апеляція Петра «так» 2:0 → `appeal` з `outcome 'yes'` і `adjustment 'appeal'`; Оля з бафом `double` → `{ kind: 'buff', buff: 'double' }`; дебаф `fog` від ведучого Петру → `{ kind: 'debuff', debuff: 'fog' }`.
    - `joins, kicks and pauses land on the step they happened`: Марко приєднався на запитанні 2 й вилучений на 3 → `join` на кроці 2, `leave` на 3 з `score`; пауза на 2 тривалістю 30 с → `{ kind: 'pause', ms: 30000 }`; `recorded: true`.
    - `the last running score equals the stored score`: окремо гра з фіналом (ставки), «↶ Бали», апеляцією, штрафом за вихід і перенесеними балами (`carry`, 12r) → для кожного учасника `steps.at(-1).scores` = `participant.score`.
    - `an old game shows what was stored and nothing else`: та сама гра, потім `delete from game_event` → `recorded: false`, `manual.from: null`, час відповідей лишився, подій `join`/`pause` немає, рахунок той самий.
    - `a team game shows team rows with who answered and people's votes on polls`: `recordedTeamGame` (`testing/team-game.ts`) → рядки команд з `answeredBy`, на опитуванні — рядки людей, `verdict 'none'`.
    - `a board cell carries its price and mark`: клітинка `x2` → `price` клітинки, `multiplier 2`.
    - `a broken snapshot still gives steps`: `quiz_snapshot = {}` → кроки з `question: null`, рядки є.
    - `a running game is not replayed`: `status 'running'` → `'running'`; невідомий uuid і `'abc'` → `null`.
  - `admin-replay-routes.test.ts` (`buildApp` з адміном, як `admin-card-routes.test.ts`):
    - `the admin gets the replay and each view within a minute is one log line`: 200, тіло без `@` і без id акаунтів учасників; два запити поспіль → один рядок `game_replay_view` з `details { title, code }` і `targetUserId` ведучого; через 61 с (`now`) — другий.
    - `everyone else gets 404, a running game 409`: гість і не-адмін → 404; `'abc'` → 404; гра, що йде → 409 `replay_running`.
  - `admin-routes.test.ts`: у `routes` — `GET /api/admin/games/:id/replay`.
  - `history.test.ts`: наявні тести ціни клітинки — зелені після переносу в `cellPriceOf`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/game-replay.test.ts apps/server/src/admin-replay-routes.test.ts apps/server/src/admin-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `game-replay.ts` за «Рішеннями плану» (розкладка подій, рахунок, рядки, ціна) — шість запитів (`game`, `participant`, `answer` усіх учасників, `score_adjustment`, `appeal`, `game_event` гри), без N+1; нікнейм події — з `participant`, якщо рядок є, інакше збережений. Далі `admin-replay-routes.ts` і реєстрація.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/game-replay.test.ts apps/server/src/admin-replay-routes.test.ts apps/server/src/admin-routes.test.ts apps/server/src/admin-card-routes.test.ts apps/server/src/history.test.ts apps/server/src/history.appeal.test.ts apps/server/src/history.facts.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 65 game replay for admins — steps built from stored answers, adjustments, appeals and game events: answer, time from the question start, verdict, manual mark, points and the running score, events placed on their step; old games show what was stored; GET /api/admin/games/:id/replay with a log line once a minute, 404 to everyone else, 409 while the game runs"
```

---

### Задача 4. Веб: тексти повтору, рядок журналу, 7 мов

**Files:**
- Create: `apps/web/src/admin/replay-text.ts`, `apps/web/src/admin/replay-text.test.ts`.
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,de,es,it,pl,ar}.json`, `apps/web/src/admin/admin-text.ts` (`logLine` для `game_replay_view`, якщо потрібне окреме поле), `apps/web/src/admin/admin-api.ts` (`adminGameReplay`).
- Test: `apps/web/src/i18n.test.ts` (`ADDED_REPLAY_65`), `apps/web/src/admin/admin-text.test.ts`.

**Interfaces:**
- Consumes: задача 1; `secondsText`, `historyAppealText`, ключі `buff_*`, `debuff_*`, `scoreSource_*`, `signed`.
- Produces: `replayTime(ms: number | null): string`, `verdictText(verdict: ReplayVerdict, manual: boolean): string`, `eventLine(event: ReplayEvent): string`, `priceText(price: number, multiplier: number): string`; `adminGameReplay(gameId): Promise<ApiData<GameReplay>>`; ключі `ADDED_REPLAY_65`.

- [ ] **Step 1: Write the failing tests:**
  - `replay-text.test.ts`: `replayTime(4000)` → `'4,0'`, `replayTime(null)` → `'—'`; `verdictText('partial', false)` → `'частково'`, `verdictText('correct', true)` → `'зараховано (вручну)'`; `eventLine({ kind: 'manual', nickname: 'Петро', from: null, to: 'correct' })` містить `'—'` і `'зараховано'`; `eventLine({ kind: 'adjustment', nickname: 'Оля', source: 'undo', points: -100 })` → `'Оля: −100 — Скасовано ведучим'` (знак — як `signed`); `eventLine({ kind: 'pause', at, ms: 30000 })` містить `'30'`; `eventLine({ kind: 'buff', nickname: 'Оля', buff: 'double' })` містить назву бафу з `buff_double`; `priceText(200, 2)` → `'Ціна: 200 ×2'`.
  - `admin-text.test.ts`: `logLine` для `game_replay_view` з `details { title: 'Осінній квіз', code: '123456' }` → містить `повтор гри «Осінній квіз»`.
  - `i18n.test.ts`: `ADDED_REPLAY_65` — у загальній умові й у перевірці шести мов зі збігом змінних.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/admin/replay-text.test.ts apps/web/src/admin/admin-text.test.ts apps/web/src/i18n.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** ключі за «Рішеннями плану» (веб) у `i18n.ts` і шести JSON (переклад змістовний, змінні ті самі), `replay-text.ts`, `adminGameReplay`.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/admin/replay-text.test.ts apps/web/src/admin/admin-text.test.ts apps/web/src/i18n.test.ts apps/web/src/source-scan.test.ts && pnpm exec tsc -p apps/web`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src
git commit -m "feat(web): 65 game replay texts in 7 languages — time in seconds or a dash, verdicts with the manual mark, event lines for host decisions, adjustments, appeals, buffs, debuffs, joins, kicks and pauses, the price with its mark, the replay view log line"
```

---

### Задача 5. Веб: сторінка повтору і кнопка в перегляді гри

**Files:**
- Create: `apps/web/src/admin/AdminReplay.tsx`, `apps/web/src/admin/AdminReplay.test.tsx`.
- Modify: `apps/web/src/admin/Admin.tsx` (маршрут `games/:id/replay`), `apps/web/src/admin/AdminGame.tsx` (кнопка), `apps/web/src/styles.css` (стилі `.replay-*` поруч з `.admin-card-section`).
- Test: `apps/web/src/admin/AdminGame.test.tsx`.

**Interfaces:**
- Consumes: задачі 3–4; `useAdminData`, `answerText`, `correctText`, `questionName`, `t('type_…')`, `historyAway`.
- Produces: `AdminReplay(): JSX.Element` за адресою `/admin/games/:id/replay?q=<n>`.

- [ ] **Step 1: Write the failing tests:**
  - `AdminReplay.test.tsx` (заглушка `fetch` з фікстурою `GameReplay` на три кроки, два раунди):
    - `shows the first step with the question, price, correct answer, rows and events`: заголовок `Повтор: «…»`, `Запитання 1 з 3`, тип з `type_text`, `Ціна: 100`, `Правильна відповідь: Париж`; рядок Олі: `Париж`, `4,0`, `зараховано`, `100`, рахунок `100`; рядок Петра: `—`, `—`; події кроку — рядок ручного рішення.
    - `next, back and the jump list move between steps and keep the step in the address`: «Далі →» → `Запитання 2 з 3`, `location.search` = `?q=2`; «← Назад» вимкнена на 1-му, «Далі →» — на останньому; `select` «Запитання» з двома `optgroup` → вибір 3-го → `?q=3`; адреса `?q=99` → крок 1.
    - `an old game shows the note and dashes`: `recorded: false`, `manual.from: null` → примітка `adminReplayNotRecorded` і `—` у рядку рішення.
    - `the start block shows carried points`: подія `adjustment` `carry` у `start` → блок «Перед першим запитанням».
    - `a running game error is shown with retry`: 409 `replay_running` → текст `err_replay_running`.
  - `AdminGame.test.tsx`: для `status 'finished'` — посилання «Повтор по кроках» на `/admin/games/<id>/replay`; для `'running'` — немає.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/admin/AdminReplay.test.tsx apps/web/src/admin/AdminGame.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (веб): сітка рядків — одна колонка з підписами полів до 600 px, шість колонок ширше; довгі відповіді переносяться (`overflow-wrap: anywhere`), без бокового скролу на 360 px; кольори — змінні теми (світла й темна).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/admin && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src
git commit -m "feat(web): 65 the admin replay page — a «Step by step» button in the admin game view opens the replay: question, type, price and correct answer, participants with answer, time, verdict, points and running score, the step's events, back/next and a jump list by round, the step kept in the address; old games show a note and dashes"
```

---

### Задача 6. Наскрізний сценарій і кадри (`part65-game-replay.e2e.ts`), повтор part 58 / 12f

**Files:**
- Create: `apps/server/e2e/part65-game-replay.e2e.ts`.

**Interfaces:**
- Consumes: усе вище; `relisten`, `useE2eServer`, `ctx`, `db`, `register`, `join`, `click`, `takeBuff`, `expectNoSideScroll`, `POLL`; зразки адміна й кадрів — `part58-player-card.e2e.ts`, апеляції — `part12f-i-appeal-resume-captain-powers.e2e.ts`.
- Produces: `it('part 65: game replay — …')`.

- [ ] **Step 1: Write the e2e:** сервер з адміном (`relisten({ adminEmails })`, як part 58); адмін-ведучий створює вікторину з трьох запитань одного раунду (текстове «Як називається найбільша річка України?» — «Дніпро»; вибір «Скільки областей в Україні?» — 24; вибір «Яке місто — столиця Львівської області?» — Львів), бафи ввімкнено (`×2`), апеляції ввімкнено. Гравці Оля, Петро, Марко (телефони 360 × 740, світла тема).
  - Запитання 1: Оля «Дніпро», Петро «Днiпро» з латинською `i` → не зараховано → ведучий зараховує вручну на пульті; Марко мовчить. Після запитання 1 приєднується Ірина.
  - Запитання 2: Оля бере баф `×2`; ведучий ставить паузу на ~3 с і знімає; Марко відповідає неправильно й оскаржує, зал голосує «так» → зараховано.
  - Запитання 3: ведучий вилучає Ірину; відповіді; фініш.
  - Адмін (широкий екран 1280 × 800): `/admin/games/<id>` (id — з `db`) → «Повтор по кроках» → крок 1: рядок Олі «Дніпро», час — число `^\d+,\d$`, «зараховано»; рядок Петра «зараховано (вручну)»; подія «ведучий вирішив вручну — не зараховано → зараховано»; подія приєднання Ірини. «Далі →» → крок 2: подія бафу Олі, пауза з секундами, апеляція Марка «зараховано 2:0» (або фактичний рахунок голосів), рядок коригування «Апеляція». Вибір у списку «Запитання» → крок 3: подія вилучення Ірини з рахунком. Останній рахунок кожного = рядок турнірної таблиці перегляду гри. Кадри `part65-replay-step1-wide`, `part65-replay-step2-wide`.
  - Те саме на телефоні 360 × 740 (адмін): кадри `part65-replay-step1-phone`, `part65-replay-step2-phone`; `expectNoSideScroll` на кожному кроці; `is-light` на `<html>`.
  - Стара гра: `delete from game_event where game_id = <id>` → перезавантаження кроку 1 → примітка «Ця гра зіграна до запису подій…», у події ручного рішення — «—», час Олі той самий; кадр `part65-replay-old-phone`.
  - Журнал: `/admin/log` → рядок «переглянув(-ла) повтор гри «…»» (один, хоча кроків відкрито кілька — у межах хвилини); `fetch('/api/admin/games/<id>/replay')` з телефону Олі (не адмін) → 404.
- [ ] **Step 2: Run** `pnpm build && E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 65"`. Expected: PASS; кадри в `apps/server/e2e/artifacts/shots`. Переглянути кадри: таблиця не обрізана, підписи полів на телефоні, світла тема.
- [ ] **Step 3: Run** окремо `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 58"`, потім `-t "part 12f"`. Expected: PASS.
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2`, потім `pnpm test --project server --maxWorkers=2`, потім `pnpm test --project web --maxWorkers=2`, потім `pnpm typecheck` (по одній, на передньому плані). Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/e2e/part65-game-replay.e2e.ts
git commit -m "test(e2e): 65 game replay — a short game with a text and two choice questions, a host decision, an appeal won by the hall, a buff, a pause, a late join and a kick, replayed step by step by the admin on a wide screen and a 360 px phone in the light theme; an old game shows the note and dashes; the view is logged once; 404 to a player"
```

---

## Розбіжності зі специфікацією (рішення плану)

1. **Час відповіді є і в старих іграх.** Специфікація наводить «точний час відповіді» як приклад того, чого в старих іграх немає; насправді `answer.time_ms` (мс від відкриття запитання, без пауз) записується від самого початку. «—» стоїть лише там, де відповіді не було (мовчання, штрафний рядок, позначка виходу).
2. **Чого старі ігри не покажуть ніколи:** приєднання посеред гри, паузи, автоматичну оцінку до ручного рішення (видно лише «вручну» — `answer.overridden`), мить коригування всередині запитання. Повтор пише для них примітку й «—». Нові ігри записують це в `game_event` (лише нова таблиця, міграція `0048`; формат збереженого стану й `plays` не змінюються).
3. **Вилучених гравців не видно в таблиці ні в старих, ні в нових іграх:** рекордер стирає їхні рядки й відповіді (як і раніше — від цього залежать історія, статистика й досягнення). Нові ігри показують лише подію «вилучено {нік} (рахунок N)»; їхніх відповідей немає.
4. **Відключення від мережі не записуються** (шум на слабкому зв'язку); вихід із гри видно через наявну позначку `away_ms` (12e) на рядку учасника.
5. **Коригування лягають на крок після закриття запитання** (`afterQuestion − 1`): бали від ведучого, дані посеред відкритого запитання, показуються на попередньому кроці — точної миті в базі немає й для нових ігор (стан має `at`, але колонку не додаємо: подій кроку досить).
6. **Повтор не дублює особливих виглядів типів** (автори блефу, малюнок, сходинки «Мільйонера», місця «Думай інакше») — для них лишається перегляд гри 58; повтор показує відповідь текстом (`answerText`).
7. **Повтор доступний для `finished`, `aborted` і `saved`**, а для гри, що йде, — 409 і без кнопки: специфікація каже «завершеної гри», але перервані й збережені теж бувають предметом скарг.
8. **Перегляд журналюється раз на хвилину** для пари адмін × гра (як `quiz_view`), а не на кожен крок: кроки — це одна сторінка.
9. **«Частково» в старих іграх виводиться з балів** (`!accepted && points > 0`), бо оцінки `grade` у `answer` немає; для ручних рішень нових ігор точна оцінка є в події `verdict`.
