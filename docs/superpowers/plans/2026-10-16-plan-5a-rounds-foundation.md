# План 5a: основа раундів і спільні правила балів

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** вікторина стає списком раундів; працює класичний раунд із новими правилами (штраф,
часткові бали від ведучого, серії, множник), дострокове завершення раунду, перехід між
раундами, а старі вікторини, чернетки й історія працюють як раніше.

**Архітектура:** у `shared` з'являється схема раундів і функція оновлення старого формату. У
`engine` відповіді зберігаються не за індексом запитання вікторини, а як журнал зіграних
запитань (`plays`), бо в наступних раундах (поле, бліц) порядок запитань вирішується під час
гри. Сервер записує журнал у базу, клієнт показує раунди в редакторі, пульті, сцені й історії.

**Технології:** TypeScript, zod, vitest, Fastify + Socket.IO, Drizzle (PostgreSQL / PGlite), React + Vite.

**Специфікація:** `docs/superpowers/specs/2026-10-16-rounds-and-rules-design.md` (розділи 3, 4, 5,
9, 10, 11, 12). Бліц, поле й фінал описано в наступних планах 5b, 5c, 5d.

## Що далі після цього плану

| План | Зміст |
|---|---|
| 5b | Бліц: черга натискань, вікно відповіді, спроби, штраф за спробу, ручна перевірка по черзі |
| 5c | Ігрове поле: клітинки й пули, порядок гравців, ротація, вибір клітинки, ставки, множники клітинок, перепідключення |
| 5d | Фінал зі ставками, наскрізний сценарій бліц + поле + фінал, рецензія підпроєкту |

## Глобальні обмеження

- Раундів у вікторині 1–10; запитань у раунді до 100; у вікторині разом до 200.
- Проста вікторина не ускладнюється: нова вікторина має один класичний раунд, і всі нові налаштування мають типові значення, що дорівнюють нинішній поведінці.
- Вікторина з одним раундом проходить ті самі етапи, що й зараз (без заставки раунду й без підсумків раунду).
- Рушій чистий: без мережі, бази й таймерів; час і генератор випадкових чисел передаються аргументами.
- Зрізи гравця й сцени не містять правильної відповіді до етапу `reveal` (як зараз).
- Рахунок може бути від'ємним.
- Тексти інтерфейсу українською, лише через словник `apps/web/src/i18n.ts`.
- Кожна задача: спершу тест, що падає; `pnpm test` і `pnpm typecheck` зелені перед комітом.

## На що дивитися рецензентові

1. Вікторина, збережена до міграції, відкривається в редакторі й дає ті самі бали в грі, що й до змін (бали за швидкість, часткові бали за `numeric` і `order`).
2. Чернетка старого формату в `sessionStorage` (відкрита вкладка редактора під час оновлення) відкривається без помилки.
3. Ведучий тисне «Завершити раунд», коли запитання ще відкрите й гравці відповідають: пізні відповіді отримують `wrong_phase`, уже дані відповіді зараховуються, гра не зависає, історія записується.
4. Штраф робить рахунок від'ємним: рейтинг, подіум, телефон гравця й історія показують мінус коректно; на етапі `locked` телефон не видає оцінку через зміну рахунку (ні мінусом, ні бонусом серії).
5. Стара гра в історії (зіграна до змін, без журналу запитань) показується як один класичний раунд з тими самими запитаннями.

---

### Задача 1: схема раундів і оновлення старого формату (`packages/shared`)

**Files:**
- Modify: `packages/shared/src/quiz.ts`, `packages/shared/src/game.ts`, `packages/shared/src/events.ts`, `packages/shared/src/index.ts`
- Create: `packages/shared/src/upgrade.ts`
- Test: `packages/shared/src/quiz.test.ts`, `packages/shared/src/upgrade.test.ts`

**Interfaces:**
- Produces:
  - `LIMITS.maxRounds = 10`, `LIMITS.maxQuizQuestions = 200`, `LIMITS.roundTitle = 60` (наявний `maxQuestions = 100` тепер означає «у раунді»).
  - `roundRulesSchema`, `type RoundRules = { penalty: 'none' | 'minus'; partial: number | null; streak: { length: number; bonus: { kind: 'percent' | 'fixed'; value: number } } | null; multiplier: 1 | 2 | 3 }`. Межі: `partial` ціле 10–90 (відсоток) або `null`; `streak.length` 2–10; `bonus.value` 1–200 для `percent`, 1–2000 для `fixed`.
  - `DEFAULT_RULES: RoundRules = { penalty: 'none', partial: null, streak: null, multiplier: 1 }`.
  - `classicRoundSchema`: `{ id, type: 'classic', title (0–60, можна порожній), speedBonus: boolean, shuffleOptions: boolean, rules: RoundRules, questions: Question[] (1–100) }`.
  - `roundSchema` — `z.discriminatedUnion('type', [classicRoundSchema])` (плани 5b–5d додають типи); `type Round`, `type ClassicRound`.
  - `quizSettingsSchema` тепер лише `{ leaderboard: 'each' | 'end' }`; `DEFAULT_SETTINGS = { leaderboard: 'each' }`.
  - `quizSchema`: `{ title, description, settings, rounds: Round[] (1–10) }` з перевіркою: разом ≤ 200 запитань, id запитань унікальні в межах вікторини, id раундів унікальні.
  - `questionsOf(quiz: Quiz): Question[]` — усі запитання по порядку раундів.
  - `upgradeQuiz(raw: unknown): unknown` в `upgrade.ts`: об'єкт старого формату `{ title, description, settings: { speedBonus, leaderboard, shuffleOptions }, questions }` перетворює на `{ title, description, settings: { leaderboard }, rounds: [{ id: 'r1', type: 'classic', title: '', speedBonus, shuffleOptions, rules: DEFAULT_RULES, questions }] }`; усе інше повертає без змін.
  - `type Grade = 'correct' | 'partial' | 'wrong'` у `game.ts`.
  - `Phase` доповнено: `'intro'` (заставка раунду) і `'round_end'` (підсумки раунду).
  - `ErrorCode` доповнено: `'partial_disabled'`.
  - `overrideSchema = z.object({ playerId, grade: z.enum(['correct', 'partial', 'wrong']) })`; нова подія `'host:end-round': (ack: Ack) => void`.

- [ ] **Step 1: Тести схеми** у `quiz.test.ts`: вікторина з двома класичними раундами проходить; 0 раундів і 11 раундів не проходять; 201 запитання разом (три раунди 100 + 100 + 1) не проходить; однаковий id запитання у двох раундах не проходить; `partial: 95` і `streak.length: 1` не проходять; `multiplier: 4` не проходить. Наявні тести запитань переписати під нову форму вікторини.
- [ ] **Step 2: Тести оновлення** у `upgrade.test.ts`: старий об'єкт із `speedBonus: false, shuffleOptions: true, leaderboard: 'end'` дає один раунд `r1` з тими самими запитаннями, `speedBonus: false`, `shuffleOptions: true`, `rules` = `DEFAULT_RULES`, `settings` = `{ leaderboard: 'end' }`, і результат проходить `quizSchema`; об'єкт нового формату повертається тим самим об'єктом (`toBe`); `null` і рядок повертаються без змін.
- [ ] **Step 3:** Запустити `pnpm vitest run packages/shared` — тести падають.
- [ ] **Step 4:** Реалізувати схеми, `questionsOf`, `upgradeQuiz`, типи й події за блоком Interfaces.
- [ ] **Step 5:** `pnpm vitest run packages/shared` — зелено. `pnpm typecheck` у цій задачі падатиме в `engine`, `server`, `web`: це очікувано, їх оновлюють наступні задачі; не комітити, доки задачі 1–2 не разом (див. Step 6).
- [ ] **Step 6:** Комміт робиться разом із задачею 2 (рушій), бо без неї репозиторій не збирається.

### Задача 2: журнал запитань і раунди в рушії (`packages/engine`)

**Files:**
- Modify: `packages/engine/src/game.ts`, `packages/engine/src/testing/fixtures.ts`, `packages/engine/src/testing/helpers.ts`, наявні `game.*.test.ts`
- Create: `packages/engine/src/game.rounds.test.ts`

**Interfaces:**
- Consumes: задача 1.
- Produces:
  - `interface Play { roundIndex: number; question: Question; answers: Record<string, AnswerRecord> }`.
  - `GameState`: поле `answers` замінено на `plays: Play[]`; нове поле `roundIndex: number` (-1 у лобі); `questionIndex` тепер індекс у `plays` (поточне або останнє зігране запитання, -1 до першого).
  - `AnswerRecord` доповнено: `grade: Grade`, `basePoints: number` (бали за відповідь без бонусу серії, зі штрафом), `streakBonus: number`; `points` = `basePoints + streakBonus`.
  - `PlayerState` доповнено: `streak: number` (поточна серія в поточному раунді).
  - `recordOf(state, playIndex, playerId)` — та сама сигнатура, індекс тепер у `plays`.
  - `currentRound(state): Round | null`, `roundQuestionNumber(state): number` (0-базовий номер поточного запитання в раунді).
  - `endRound(state: GameState, now: number): Result`.
  - `start` і `next` — ті самі сигнатури, нові переходи (нижче).

Переходи етапів:
- `start`: якщо раундів більше одного — `intro` з `roundIndex = 0`; інакше одразу перше запитання (як зараз).
- `next` з `intro` — перше запитання раунду `roundIndex`.
- `next` з `reveal`, коли це останнє запитання раунду: останній раунд → `finished`; інакше → `round_end`. Не останнє запитання — як зараз (`leaderboard` або наступне запитання).
- `next` з `round_end` — `intro` наступного раунду.
- `endRound` дозволено в `intro`, `question`, `locked`, `reveal`, `leaderboard`; в інших етапах `wrong_phase`. Відкрите запитання спершу закривається й оцінюється (як `lock`), далі: останній раунд → `finished`, інакше → `round_end`. Пауза знімається.
- Наступне запитання класичного раунду — перше запитання раунду, якого ще немає в `plays` цього раунду (тобто за порядком).
- `withTotals` рахує суму `points` і час по всіх закритих `plays`; для гравця без відповіді додається повний час запитання (як зараз).

- [ ] **Step 1: Тести** у `game.rounds.test.ts` (фікстура: вікторина з двома класичними раундами по 2 запитання):
  - `start` → `phase === 'intro'`, `roundIndex === 0`; `next` → `question`, `plays.length === 1`, `plays[0].roundIndex === 0`;
  - після другого запитання першого раунду `next` з `reveal` → `round_end`; `next` → `intro`, `roundIndex === 1`; останнє запитання другого раунду `next` з `reveal` → `finished`;
  - вікторина з одним раундом: `start` одразу дає `question` (як зараз);
  - `endRound` у `question` першого раунду: дана відповідь зарахована й є в рахунку, `phase === 'round_end'`; подальша `submitAnswer` → `wrong_phase`; друге запитання раунду в `plays` не з'являється;
  - `endRound` в останньому раунді → `finished`; `endRound` у `lobby`, `round_end`, `finished` → `wrong_phase`;
  - `endRound` під час паузи → `paused === false`.
- [ ] **Step 2:** Перенести наявні тести рушія на нову форму (фікстури через один класичний раунд; `state.answers[i]` → `state.plays[i].answers`). Їхні очікування щодо балів і етапів не змінюються.
- [ ] **Step 3:** `pnpm vitest run packages/engine` — нові тести падають.
- [ ] **Step 4:** Реалізувати за блоком Interfaces. У цій задачі `basePoints = points` за чинною формулою, `streakBonus = 0`, `grade` з точності (1 → `correct`, 0 → `wrong`, між → `partial`); правила раунду підключає задача 3.
- [ ] **Step 5:** `pnpm vitest run packages/shared packages/engine` — зелено.
- [ ] **Step 6: Комміт** задач 1–2 (сервер і клієнт ще не збираються; це єдиний такий комміт у плані):
```bash
git add packages/shared packages/engine
git commit -m "feat(engine): quiz as a list of rounds, play log instead of answers by question index"
```

### Задача 3: правила раунду в балах (`packages/engine`)

**Files:**
- Modify: `packages/engine/src/score.ts`, `packages/engine/src/game.ts`
- Test: `packages/engine/src/score.test.ts`, `packages/engine/src/game.rules.test.ts` (створити)

**Interfaces:**
- Consumes: задачі 1–2.
- Produces:
  - `answerPoints(input: { points: number; accuracy: number; speed: number; multiplier: number; penalty: 'none' | 'minus' }): number` у `score.ts`: якщо `accuracy > 0` → `round(points × accuracy × speed × multiplier)`; інакше `penalty === 'minus'` → `-round(points × multiplier)`, інакше 0.
  - `streakBonus(basePoints: number, bonus: { kind: 'percent' | 'fixed'; value: number }): number`: `percent` → `round(basePoints × value / 100)`, `fixed` → `value`.
  - `override(state, playerId, grade: Grade): Result` замість `accepted: boolean`. `correct` → точність 1, `partial` → точність `rules.partial / 100` (якщо `rules.partial === null` → `fail('partial_disabled')`), `wrong` → 0. `accepted = grade === 'correct'`. Бали через `answerPoints` зі збереженим часом.

Правила:
- Автоматична перевірка в класичному раунді, як зараз: точність із `checkAnswer`; `grade` з точності.
- Штраф лише за дану відповідь із точністю 0. Гравець без відповіді отримує 0 і не штрафується.
- Серії в `withTotals`: для кожного раунду з `rules.streak !== null` пройти його закриті `plays` по порядку; для кожного гравця, що є в грі: точність 1 → лічильник +1, інакше (часткова, неправильна або відповіді немає) → 0. Якщо лічильник ≥ `streak.length` → `streakBonus = streakBonus(basePoints, bonus)`, інакше 0. `points = basePoints + streakBonus`. `PlayerState.streak` = лічильник гравця на останньому закритому запитанні поточного раунду; у новому раунді починається з 0.
- Множник раунду діє на бали й штраф (через `answerPoints`), бонус серії рахується від уже помноженого `basePoints`.

- [ ] **Step 1: Тести `score.test.ts`:** `answerPoints({ points: 1000, accuracy: 1, speed: 0.75, multiplier: 2, penalty: 'none' }) === 1500`; `accuracy: 0, penalty: 'minus', multiplier: 3, points: 200` → `-600`; `accuracy: 0, penalty: 'none'` → 0; `accuracy: 0.5, penalty: 'minus', points: 1000, speed: 1, multiplier: 1` → 500 (часткова не штрафується); `streakBonus(1500, { kind: 'percent', value: 50 }) === 750`; `streakBonus(1500, { kind: 'fixed', value: 100 }) === 100`.
- [ ] **Step 2: Тести `game.rules.test.ts`:**
  - штраф: неправильна відповідь при `penalty: 'minus'` і `points: 1000` дає `-1000`, рахунок гравця `-1000`; гравець без відповіді має 0;
  - множник 2 без бонусу швидкості: правильна відповідь на 1000 → 2000;
  - серія `{ length: 2, bonus: { kind: 'fixed', value: 100 } }` у раунді з трьома запитаннями: правильно, правильно, правильно → бонуси 0, 100, 100, `streak === 3`; правильно, без відповіді, правильно → бонуси 0, 0, 0;
  - серія не переходить у наступний раунд: після `intro` другого раунду `streak === 0`, а перша правильна відповідь другого раунду бонусу не дає;
  - `override` з `partial` при `partial: 50` на текстове запитання 1000 без швидкості → 500, `grade === 'partial'`, `accepted === false`; при `partial: null` → `partial_disabled`;
  - `override` з `wrong` на останньому запитанні серії прибирає бонус цього запитання й зменшує `streak` до 0.
- [ ] **Step 3:** `pnpm vitest run packages/engine` — нові тести падають.
- [ ] **Step 4:** Реалізувати за блоками Interfaces і «Правила».
- [ ] **Step 5:** `pnpm vitest run packages/engine` — зелено, наявні тести балів незмінні.
- [ ] **Step 6: Комміт** `feat(engine): penalty, manual partial grade, streaks and round multiplier`.

### Задача 4: зрізи стану з раундами (`packages/shared`, `packages/engine`)

**Files:**
- Modify: `packages/shared/src/views.ts`, `packages/engine/src/views.ts`
- Test: `packages/engine/src/views.test.ts`

**Interfaces:**
- Consumes: задачі 1–3.
- Produces:
  - `interface RoundInfo { index: number; total: number; title: string; type: Round['type']; partial: boolean }` у `views.ts` (`partial` — чи ввімкнено «частково» для ведучого).
  - `BaseView` доповнено полем `round: RoundInfo | null` (null у лобі); `questionIndex` у зрізі — номер запитання в раунді (0-базовий), `total` — кількість запитань раунду.
  - `LobbyPlayer` доповнено `streak: number`.
  - `PlayerResult` доповнено `grade: Grade`, `streakBonus: number`; `HostResponse` доповнено `grade: Grade`, `streakBonus: number`.
  - Етап `round_end` показує рейтинг так само, як `leaderboard` (`standings` у сцені й гравця не null).

- [ ] **Step 1: Тести:** у `intro` другого раунду `round` = `{ index: 1, total: 2, title, type: 'classic', partial }`, `question === null`; `questionIndex` другого запитання другого раунду дорівнює 1 при `total` раунду; на `round_end` `standings` є в зрізах сцени й гравця; на `locked` рахунок гравця не містить ні штрафу (`-1000`), ні бонусу серії поточного запитання; на `reveal` `me.result.grade` і `streakBonus` є; зріз гравця на `question` не має `reveal` (як зараз).
- [ ] **Step 2:** `pnpm vitest run packages/engine` — падають.
- [ ] **Step 3:** Реалізувати.
- [ ] **Step 4:** `pnpm vitest run packages/engine` — зелено.
- [ ] **Step 5: Комміт** `feat(engine): round info, streaks and grades in state views`.

### Задача 5: сервер, база й історія (`apps/server`)

**Files:**
- Modify: `apps/server/src/db/schema.ts`, `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`, `apps/server/src/recorder.ts`, `apps/server/src/quizzes.ts`, `apps/server/src/history.ts`, `packages/shared/src/history.ts`, наявні тести сервера
- Create: `apps/server/drizzle/0002_rounds.sql` (згенерувати `drizzle-kit generate`, потім дописати перенесення даних), оновити `apps/server/drizzle/meta`
- Test: `apps/server/src/quizzes.test.ts`, `recorder.test.ts`, `history.test.ts`, `socket.test.ts`, `manager.test.ts`

**Interfaces:**
- Consumes: задачі 1–4.
- Produces:
  - Таблиця `quiz`: стовпець `questions` замінено на `rounds jsonb not null`; `settings` містить лише `{ leaderboard }`.
  - Таблиця `game`: новий стовпець `plays jsonb not null default '[]'` — масив `{ roundIndex: number; questionId: string }` у порядку гри; `questions_played` = кількість закритих `plays`.
  - Таблиця `answer`: нові стовпці `round_index integer not null default 0`, `streak_bonus integer not null default 0`; `question_index` тепер індекс у `plays`; `points` = повні бали (з бонусом).
  - `RoomManager`: метод `endRound(roomId)` поруч із наявними `next`/`lock`; подія сокета `host:end-round`; `host:override` приймає `{ playerId, grade }`.
  - `QuizSummary.questionCount` = усі запитання вікторини (`questionsOf`).
  - `GameSummary.questionCount` = усі запитання знімка. `GameDetail` доповнено `rounds: { title: string; type: Round['type'] }[]`; `GameQuestionResult` доповнено `roundIndex: number`.
  - Знімок вікторини в історії завжди читається через `quizSchema.parse(upgradeQuiz(row.quizSnapshot))`.

Перенесення даних у `0002_rounds.sql` (після згенерованих `ALTER`):
```sql
UPDATE "quiz" SET
  "rounds" = jsonb_build_array(jsonb_build_object(
    'id', 'r1', 'type', 'classic', 'title', '',
    'speedBonus', "settings"->'speedBonus', 'shuffleOptions', "settings"->'shuffleOptions',
    'rules', '{"penalty":"none","partial":null,"streak":null,"multiplier":1}'::jsonb,
    'questions', "questions")),
  "settings" = jsonb_build_object('leaderboard', "settings"->'leaderboard');
```
Порядок у файлі: додати `rounds` як nullable → `UPDATE` → `SET NOT NULL` → видалити `questions`.

Історія старих ігор: якщо `plays` порожній, а `questions_played > 0`, запитання гри — перші `questions_played` запитань із `questionsOf(знімок)` у порядку, усі з `roundIndex: 0`.

- [ ] **Step 1: Тести:**
  - `quizzes.test.ts`: вікторина з двома раундами зберігається й читається без змін; `questionCount` рахує обидва раунди;
  - міграція: у `quizzes.test.ts` (PGlite) вставити рядок старого формату через SQL до застосування `0002`, застосувати міграції, `getQuiz` повертає один класичний раунд із тими самими запитаннями (якщо тестова інфраструктура застосовує всі міграції разом, винести цю перевірку в окремий тест, що застосовує `0000`–`0001`, вставляє рядок, потім `0002`);
  - `socket.test.ts`: `host:end-round` від ведучого переводить гру в `round_end` або `finished`; від гравця → `forbidden`; `host:override` з `{ grade: 'partial' }` у раунді без часткових балів → `partial_disabled`;
  - `recorder.test.ts`: після гри з двох раундів, де перший завершено достроково, `game.plays` містить лише зіграні запитання з правильними `roundIndex`, `answer.round_index` і `streak_bonus` записані, `participant.score` враховує штраф;
  - `history.test.ts`: `hostGame` повертає `rounds` і запитання з `roundIndex`; стара гра (рядок `game` без `plays`, знімок старого формату) повертає один раунд і ті самі результати, що й до змін.
- [ ] **Step 2:** `pnpm vitest run apps/server` — падають.
- [ ] **Step 3:** Згенерувати міграцію (`pnpm --filter @quiz/server exec drizzle-kit generate --name rounds`), дописати перенесення даних, реалізувати решту.
- [ ] **Step 4:** `pnpm vitest run apps/server` і `pnpm typecheck` для `shared`, `engine`, `server` — зелено.
- [ ] **Step 5: Комміт** `feat(server): store rounds, play log, end-round event and graded overrides`.

### Задача 6: раунди в редакторі (`apps/web`)

**Files:**
- Modify: `apps/web/src/editor/draft.ts`, `draft-storage.ts`, `QuizEditor.tsx`, `apps/web/src/demo-quiz.ts`, `apps/web/src/i18n.ts`, стилі редактора
- Create: `apps/web/src/editor/RoundSettings.tsx`
- Test: `apps/web/src/editor/draft.test.ts`, `QuizEditor.test.tsx`, `EditQuiz.test.tsx`

**Interfaces:**
- Consumes: задача 1.
- Produces:
  - `newQuiz(): Quiz` — один класичний раунд з одним порожнім запитанням `single`, `speedBonus: true`, `shuffleOptions: false`, `rules: DEFAULT_RULES`.
  - `newClassicRound(): ClassicRound` — так само, назва порожня.
  - `loadDraft` пропускає збережене через `upgradeQuiz` перед перевіркою форми; перевірка `looksLikeQuiz` дивиться на `rounds`.
  - `RoundSettings` — панель налаштувань одного класичного раунду: назва, бали за швидкість, перемішування варіантів, штраф (немає / мінус ціна), «частково» (вимкнено або відсоток 10–90), серії (вимкнено або поріг 2–10 + бонус відсоток / фіксовано), множник ×1/×2/×3.

Вигляд: над нинішнім редактором (список запитань біля сцени) смуга раундів. Коли раунд один, у смузі лише кнопка «+ Раунд», а налаштування раунду сховані під «Налаштування раунду» — тож створення простої вікторини не змінюється. Коли раундів кілька, смуга показує «Раунд 1», «Раунд 2» (або їхні назви) з перемиканням, і кожен раунд має кнопки перейменувати, вгору/вниз, видалити (останній раунд видалити не можна). Список запитань і сцена показують запитання вибраного раунду. Налаштування «рейтинг після кожного запитання / лише в кінці» лишається на рівні вікторини; бали за швидкість і перемішування переїжджають у панель раунду.

- [ ] **Step 1: Тести:** `draft.test.ts`: `newQuiz()` проходить `quizSchema` після заповнення тексту й варіантів; чернетка старого формату в `sessionStorage` повертається з `loadDraft` як вікторина з одним раундом. `QuizEditor.test.tsx`: нова вікторина показує кнопку «+ Раунд» і не показує смугу з назвами раундів; після «+ Раунд» є «Раунд 1» і «Раунд 2», перемикання показує запитання другого раунду; видалити єдиний раунд неможливо; помилка в запитанні другого раунду при збереженні перемикає на цей раунд і підсвічує запитання. `EditQuiz.test.tsx`: збереження надсилає `rounds`.
- [ ] **Step 2:** `pnpm vitest run apps/web/src/editor apps/web/src/pages/EditQuiz.test.tsx` — падають.
- [ ] **Step 3:** Реалізувати; рядки в `i18n.ts`.
- [ ] **Step 4:** Тести зелені.
- [ ] **Step 5: Комміт** `feat(web): rounds in the quiz editor with per-round rules`.

### Задача 7: раунди в живій грі й історії (`apps/web`)

**Files:**
- Modify: `apps/web/src/screens/HostScreen.tsx`, `StageScreen.tsx`, `PlayerScreen.tsx`, `Standings.tsx`, `apps/web/src/pages/GameHistory.tsx`, `apps/web/src/live/useGame.ts`, `apps/web/src/api.ts`, `apps/web/src/i18n.ts`, стилі
- Test: `HostScreen.test.tsx`, `StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `apps/web/src/pages/History.test.tsx`

**Interfaces:**
- Consumes: задачі 4–5 (зрізи, події `host:end-round`, `host:override { playerId, grade }`, `GameDetail.rounds`).

Що показати:
- `intro`: сцена й телефон — «Раунд N з M» і назва раунду; пульт — та сама заставка й головна кнопка «Почати раунд».
- `round_end`: рейтинг із заголовком «Підсумки раунду N»; головна кнопка пульта «Наступний раунд».
- Пульт: кнопка «Завершити раунд» доступна в `intro`, `question`, `locked`, `reveal`, `leaderboard`, з підтвердженням; в останньому раунді підпис «Завершити гру».
- Оцінка відповіді на пульті: «Зарахувати» / «Відхилити», і третя «Частково», коли `round.partial`.
- Номер запитання «Запитання 2 з 5» рахується в межах раунду; коли раундів більше одного, поруч «Раунд 1».
- Серія: біля нікнейму в рейтингу на сцені й пульті 🔥 з числом, коли `streak ≥ 2`.
- Телефон гравця: на `reveal` бали можуть бути від'ємними («−1000»), бонус серії окремим рядком «+100 за серію».
- Історія гри: запитання згруповані за раундами з назвами; гра з одним раундом виглядає, як зараз.

- [ ] **Step 1: Тести:** пульт на `intro` має «Почати раунд» і надсилає `host:next`; «Завершити раунд» після підтвердження надсилає `host:end-round`; «Частково» видно лише з `round.partial: true` і воно надсилає `{ grade: 'partial' }`; сцена на `round_end` показує «Підсумки раунду 1»; телефон показує «−1000» і «+100 за серію»; історія з двома раундами показує дві назви раундів.
- [ ] **Step 2:** Тести падають.
- [ ] **Step 3:** Реалізувати.
- [ ] **Step 4:** `pnpm test` і `pnpm typecheck` — зелено.
- [ ] **Step 5: Комміт** `feat(web): round intro, round results, end round and partial grade in the live game`.

### Задача 8: наскрізний сценарій, документація, рецензія

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`, `README.md`, `docs/superpowers/specs/2026-10-16-rounds-and-rules-design.md` (розділ про відхилення, якщо є)

- [ ] **Step 1:** Доповнити `full-game.e2e.ts`: вікторина з двох класичних раундів, у другому ввімкнено штраф і серію; перший раунд ведучий завершує достроково після першого запитання; гра доходить до подіуму; в історії видно два раунди.
- [ ] **Step 2:** `pnpm e2e` — зелено.
- [ ] **Step 3:** README: короткий абзац про раунди й правила раунду.
- [ ] **Step 4: Комміт** `test: two-round end-to-end game with early round end`.
- [ ] **Step 5:** Незалежна рецензія всієї гілки з переліком «На що дивитися рецензентові»; виправити важливі зауваження окремими комітами; злиття в `main` після погодження власника (push у `main` одразу розгортає на Render і перериває ігри, тож час push узгодити).
