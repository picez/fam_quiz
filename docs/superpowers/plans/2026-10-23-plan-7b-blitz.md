# План 7b: новий бліц

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** бліц з автоматичною перевіркою на телефоні (бліц-раунд з `check: 'auto'` і телефонна бліц-клітинка поля з `check: 'auto'`) стає «миттєвим» (розділ 4 специфікації):
1. Кнопки «Відповісти» немає. Щойно запитання відкрито, усі бачать варіанти чи поле відповіді й одразу відповідають.
2. Порядок надсилання = черга. Кожен відповідає один раз. Відповідь не можна змінити.
3. Голова черги помаранчева у ведучого. Він, як і зараз, тисне «Прийняти» (автоперевірка) або «Перевибрати». Неправильна → на черзі наступна. Перша правильна виграє й одразу закриває запитання.
4. Під час запитання інші гравці й сцена бачать у черзі лише ім'я, час від відкриття і ✓/✗. Хто що вибрав, видно після розкриття. Відповідач бачить свій вибір помаранчевим, ведучий бачить вибір кожного.
5. Миготіння вердикту (7a) — на рядку черги й на власному виборі відповідача.
6. Запитання закінчується, коли є правильна відповідь, коли вийшов час (і черга розглянута) або коли всі присутні відповіли неправильно.
7. Місце під чергу зарезервоване: варіанти не рухаються. У бліці «уголос» і з ручною перевіркою кнопка лишається, прибирається лише зсув.
8. Налаштування «спроби» й «вікно відповіді» для автоматичного бліцу не показуються й не діють.

**Архітектура:**
- **Рушій (`engine`).** «Миттєвий» бліц = черга, правила якої мають `check === 'auto'` (`isInstant(rules)`). Для нього:
  - `blitzRulesOf` і `cellBlitzRules` дають `answerWindow: null`, `attempts: 1`, незалежно від збереженого в раунді;
  - `buzz` відмовляє (`wrong_phase`);
  - `submitBlitzAnswer` сам ставить гравця в кінець черги з відповіддю (`BuzzEntry` з `answer`);
  - `settle` не утримує годинник (`holdAt` лише для не-миттєвого бліцу);
  - `repick` знімає відповідь голови й дає їй вікно `DEFAULT_ANSWER_WINDOW` від цієї миті;
  - відповіді, яких не розглянули (після переможця або коли ведучий закрив запитання), не зникають, а переходять у новий `BlitzPlay.dropped` — лише для показу; балів і записів у них немає, як і раніше.
  - `BuzzEntry.timeMs` — час від відкриття запитання до натискання/відповіді, знятий у мить надсилання; паузи й утримання його не змінюють.
- **Зрізи (`shared`, `engine`).** `BlitzInfo` отримує `instant` і `rows` (жива черга: розглянуті спроби, потім нерозглянуті, потім `dropped`). Сцені й гравцям `rows[].answer` = `null` до розкриття, ведучому завжди відповідь. `PlayerBlitz` отримує `canAnswer` і `grade` (власний вердикт). У миттєвому бліці `spotlight` для сцени й гравців завжди `null`, для ведучого — лише голова, що чекає. Переможця миттєвого бліцу видно вже на `locked`. `RoundBrief.instant`.
- **Веб (`web`).** Новий компонент `BlitzQueue` (рядки «1 · Оля · 2,4 с · ✗» у блоці фіксованої висоти під варіантами) для телефону, сцени й пульта. Хук `useBlinkingRows` на рівні екрана мигає рядком, у якому щойно з'явився вердикт. Телефон у миттєвому бліці: `AnswerInput` одразу, після надсилання — `SpotlightChoices` з власним вибором на тому самому місці, рядок стану під варіантами. У бліці з кнопкою рядок «Відповідає …» завжди займає місце.
- **Редактор, пояснення, демо.** Для автоматичного бліцу поля «Вікно відповіді» й «Спроб на запитання» сховані. Перемикання на «Автоматично» записує `answerWindow: null, attempts: 1`. Нові пояснення раунду й бліц-клітинки. Демо-вікторини отримують `answerWindow: null, attempts: 1` в автоматичних бліцах.

**Технології:** TypeScript, zod 4, vitest, Fastify + Socket.IO + Drizzle (PGlite у тестах), React + Vite, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-23-after-second-game-design.md`, розділ 4 (частина 7b). Анти-цілі з розділу 2 обов'язкові. Частина 7a вже в `main` (`useVerdictBlink`, `SpotlightChoices` без відповіді, таймер ведучого, рядок таймера без зсуву). Частини 7c–7g цей план не чіпає.

**Рішення плану там, де специфікація мовчить:**
- **Годинник у миттєвому бліці не утримується, поки ведучий вирішує.** Причини:
  1. Час у черзі — справжній час від відкриття. З утриманням усі, хто відповів, поки ведучий думав, отримали б однаковий «заморожений» час, і жива черга з часом втратила б сенс.
  2. Таймер обмежує лише надсилання, а не рішення ведучого. Відповідь, надіслана вчасно, розглядається й після нуля (наявна логіка `blitzDone`: поки черга не порожня, запитання не закрите). Повільний ведучий не забирає ні в кого правильної відповіді.
  3. Бліц лишається швидким: кожна неправильна голова не дарує решті додаткового часу.
  Після нуля нові відповіді не приймаються (`time_over`), ведучий дорозглядає чергу, і запитання закривається на першій правильній або коли черга спорожніла. Пауза, як і раніше, зупиняє годинник. Бліц «уголос» і з ручною перевіркою утримують годинник, як зараз.
- **«Перевибрати» в миттєвому бліці:** голова лишається на своєму місці й зі своїм часом, її відповідь знято, вона отримує `DEFAULT_ANSWER_WINDOW` (15 с) від натискання ведучого, навіть якщо загальний таймер скінчиться раніше. Не встигла — спроба неправильна (як пропущене вікно зараз). Інші тим часом далі відповідають.
- **`answerWindow` і `attempts` у старих вікторинах** з `check: 'auto'` парсяться як і раніше (схема не змінюється), але рушій їх ігнорує: одна спроба, без вікна. Для `check: 'manual'` усе як зараз.
- **Хто що вибрав — з етапу `reveal`.** «Після закриття» специфікації читаємо як розкриття: на `locked` (час вийшов, усі помилилися, ведучий закрив) вибір показав би, які варіанти хибні, ще до правильної відповіді. На `locked` видно рядки з ✓/✗ і переможця (його ім'я відповіді не розкриває). Власний вибір і власний вердикт відповідач бачить одразу.
- **Не розглянуті відповіді** (після переможця або закриті ведучим) показуються в черзі з позначкою «не перевірено», без балів і без рядка в історії (як «натиснув, але не розглянули» зараз). Серію вони обривають, як і зараз.
- **Бліц-клітинка поля:** миттєва, якщо `round.check === 'auto'` і спосіб клітинки `phone`. Хто вибрав клітинку, відповідає разом з усіма (як і зараз; правильна відповідь вибравшого — ×2). Неправильна спроба на клітинці, як і зараз, коштує 0, «Мінус для всіх» — без змін.
- **Сцена в миттєвому бліці** показує варіанти без кольорів до розкриття, на розкритті — правильний зелений і лічильники (`stats`), як класичне запитання. Рядка «Відповідає …» немає: голову видно в черзі з позначкою «Перевіряємо».
- **Черга:** блок `ol.blitz-queue.is-reserved` під варіантами, висота = `min(кількість гравців, 6)` рядків, далі прокрутка всередині блоку. Рядок однієї висоти: ім'я й вибір обрізаються трикрапкою. Порожня черга — «Відповідей ще немає» в тому самому блоці.
- **Миготіння рядка:** `BLINK_MS` з 7a. Мигає позначка ✓/✗ рядка, у якому вердикт з'явився після першого показу екрана. Ключ — `номер запитання|гравець|оцінка`.
- **Демо:** у `demo-quiz.ts`, `movie-quiz.ts`, `erudite-quiz.ts`, `party-quiz.ts` автоматичні бліц-раунди отримують `answerWindow: null, attempts: 1`. Ручні бліци не змінюються.

## Глобальні обмеження

- Старі вікторини, ігри, історія й профіль поводяться як зараз: схема `quiz.ts` не змінюється, міграцій немає, таблиця `answer` пишеться тим самим `recorder.ts` (рядок на розглянуту спробу).
- Правильна відповідь і чужий вибір не потрапляють на сцену чи телефон раніше розкриття. Зокрема через `spotlight`, `blitz.rows`, `blitz.queue`, `stats` і `me.answer` іншого гравця.
- Рушій чистий: `now` і `rng` передаються аргументами, без мережі й таймерів.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`. Нові кольори — токени в `:root` у `styles.css`. Тема лише темна.
- Поля вводу — в обгортці `label.field` зі шрифтом ≥ 16 px.
- Розкладка працює на ширині 375 px без горизонтальної прокрутки сторінки. Анімації — лише за `prefers-reduced-motion: no-preference`.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2` (саме `--maxWorkers=2`: паралельні робітники PGlite падають на цій машині).
- Наскрізні тести: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Кадри — з `E2E_SHOTS=1` у `apps/server/e2e/artifacts/shots`.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (проєкт тестовий).

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/engine/src/game.ts` | `BuzzEntry.timeMs`, `BlitzPlay.dropped`, `submitBlitzAnswer`, `repick`, `dropQueue`, `removePlayer`, ініціалізація черги | 1 |
| `packages/engine/src/blitz.ts` | `isInstant`, `blitzRulesOf`, `buzz`, `settle` | 1 |
| `packages/engine/src/board-cells.ts` | `cellBlitzRules` | 1 |
| `packages/engine/src/testing/helpers.ts` | `sendBlitz` | 1 |
| `packages/engine/src/*.test.ts`, `apps/server/src/**/*.test.ts` | перехід на миттєвий бліц або `check: 'manual'` | 1 |
| `packages/shared/src/views.ts`, `round-brief.ts` | `BlitzRow`, `BlitzInfo.instant/rows`, `PlayerBlitz.canAnswer/grade`, `RoundBrief.instant` | 2 |
| `packages/engine/src/views.ts` | `blitzInfo`, `playerBlitz`, `hostBlitz`, `spotlightOf`, `blitzAnswer` | 2 |
| `apps/web/src/screens/BlitzQueue.tsx` (новий), `verdict-blink.ts` | черга й `useBlinkingRows` | 3 |
| `apps/web/src/screens/PlayerScreen.tsx`, `styles.css`, `i18n.ts` | телефон | 3 |
| `apps/web/src/screens/StageScreen.tsx`, `HostScreen.tsx` | сцена й пульт | 4 |
| `apps/web/src/editor/RoundSettings.tsx`, `draft.ts`, `round-summary.ts`, `screens/Board.tsx` | редактор, пояснення, примітки клітинки, легенда | 5 |
| `apps/server/scripts/*.ts`, `demo-quiz.test.ts` | демо | 5 |
| `apps/server/e2e/full-game.e2e.ts` | наскрізний сценарій і надійність обв'язки | 6 |

## Порядок збирання

- Задача 1 (рушій) — основа. Сервер не змінюється в коді, лише в тестах.
- Задача 2 (зрізи) спирається на 1 і механічно оновлює літерали веб-тестів.
- Задачі 3 і 4 (веб) спираються на 2. Задача 4 використовує `BlitzQueue` і `useBlinkingRows` із задачі 3.
- Задача 5 незалежна від 3–4, але спирається на 2 (`RoundBrief.instant`, `BlitzInfo.instant`).
- Задача 6 (e2e) іде останньою.
- **Наскрізні сценарії між задачами 1 і 6 не запускаються.** Задача 1 ламає `blitzGame()` і бліц-клітинки в `mixedBoard()` (там тиснуть «Відповісти»). Задача 6 їх оновлює. Per-task перевірка — лише `pnpm typecheck` і `pnpm vitest run --maxWorkers=2`.

## На що дивитися рецензентові

1. **Чужий вибір до розкриття.** `JSON.stringify` зрізу сцени й гравця p3 (не відповідав) на `question` і `locked` не містить `"optionId"` і тексту чужої відповіді; `spotlight` = `null`; `blitz.rows[].answer` = `null`. Тести: задача 2, `stage and other players see names, times and verdicts in the instant queue but no picks before the reveal`; задача 4, `the stage shows no picks and no answering line in an instant blitz until the reveal`.
2. **Вчасна відповідь, а ведучий повільний.** Відповідь надіслана за 1 с до кінця, ведучий тисне «Прийняти» після нуля — її розглянуто, переможець отримує бали. Нові відповіді після нуля — `time_over`. Тест: задача 1, `after the timer nobody can answer, but answers sent in time are still checked`.
3. **«Перевибрати» не блокує чергу.** Голова отримує 15 с, інші відповідають, пропущене вікно — неправильна спроба й черга йде далі. Тест: задача 1, `repick keeps the head in place with a fresh window; a missed window is a wrong attempt`.
4. **Стара вікторина з `check: 'auto'`, `attempts: 3`, `answerWindow: 30`** відкривається, грається як миттєва (одна спроба, без вікна), редактор не показує цих полів. Тести: задача 1, `stored attempts and answer window are ignored in an instant blitz`; задача 5, `the window and attempts are hidden for an automatic blitz`.
5. **Телефон 375 px, 6+ гравців, довгі імена.** Варіанти не рухаються, поки інші відповідають і ведучий вирішує; черга прокручується всередині блоку; сторінка без прокрутки вбік. Тести: задача 3, `the queue block reserves its rows and keeps one line per row`; задача 6, перевірка `y` варіантів і `expectNoSideScroll`.

---

### Задача 1. Рушій: миттєвий бліц

**Files:**
- Modify: `packages/engine/src/game.ts` (`BuzzEntry`, `BlitzPlay`, ініціалізація `blitz` у відкритті запитання ~375, `removePlayer` ~266, `dropQueue` ~569, `repick` ~727, `submitBlitzAnswer` ~755)
- Modify: `packages/engine/src/blitz.ts` (`BlitzRules` doc, `isInstant`, `blitzRulesOf`, `buzz`, `settle`)
- Modify: `packages/engine/src/board-cells.ts` (`cellBlitzRules`)
- Modify: `packages/engine/src/index.ts` (експорт `isInstant`)
- Modify: `packages/engine/src/testing/helpers.ts` (`sendBlitz`)
- Test: `packages/engine/src/game.blitz.test.ts`, `game.board-cells.test.ts`
- Modify (перехід): `packages/engine/src/game.video.test.ts`, `game.timing.test.ts`, `game.match.test.ts`, `views.test.ts`, `apps/server/src/recorder.test.ts`, `history.test.ts`, `rooms/manager.test.ts`, `socket.test.ts`

**Interfaces:**
- Produces (`game.ts`):
  ```ts
  export interface BuzzEntry {
    playerId: string;
    at: number;
    /** Від відкриття запитання до натискання (бліц з кнопкою) або до відповіді (миттєвий), мс; паузи й утримання його не змінюють. */
    timeMs: number;
    deadline: number | null;
    answer: Answer | null;
  }
  export interface BlitzPlay {
    queue: BuzzEntry[];
    attempts: Attempt[];
    buzzed: string[];
    /** Відповіді, які не розглядали (після переможця або закриття), у порядку черги; лише для показу, без балів. */
    dropped: BuzzEntry[];
  }
  ```
- Produces (`blitz.ts`): `export function isInstant(rules: BlitzRules): boolean` — `rules.check === 'auto'`. Коментар до `BlitzRules.check`: `'auto'` — миттєвий бліц без кнопки.
- Produces (`testing/helpers.ts`): `export function sendBlitz(state: GameState, playerId: string, answer: Answer, now: number): GameState` — для бліцу з кнопкою спершу `buzz`, для миттєвого лише `submitAnswer`; обидва через `must`.
- Attempt.timeMs тепер береться з `head.timeMs`.

- [ ] **Step 1: Write the failing tests** — новий `describe('instant blitz', …)` у `game.blitz.test.ts` (функції `open`, `right`, `wrong`, `rules`, `score`, `acceptAll` уже є; `open()` дає раунд з `check: 'auto'`, `answerWindow: 15`, `attempts: 1`, single на 20 с, відкритий у 0):
  ```ts
  it('everyone answers at once without a buzz; the queue keeps the order of answers', () => {
    let state = must(submitAnswer(open(), 'p2', wrong, 2000));
    state = must(submitAnswer(state, 'p1', right, 3500));
    const queue = state.plays[0].blitz!.queue;
    expect(queue.map((e) => [e.playerId, e.timeMs, e.deadline])).toEqual([['p2', 2000, null], ['p1', 3500, null]]);
    expect(pendingOf(state)?.playerId).toBe('p2');
    expect(state.plays[0].blitz?.buzzed).toEqual(['p2', 'p1']);
  });
  it('buzz is refused in an instant blitz', () => {
    expect(buzz(open(), 'p1', 1000)).toEqual({ ok: false, error: 'wrong_phase' });
  });
  it('the clock is not held while the host decides', () => {
    const state = must(submitAnswer(open(), 'p1', wrong, 2000));
    expect(state.heldAt).toBeNull();
    expect(state.endsAt).toBe(20_000);
    expect(nextDeadline(state, 2000)).toBe(20_000);
  });
  it('a wrong verdict passes the queue on at once; the first correct wins and keeps the rest as dropped', () => {
    let state = must(submitAnswer(open(), 'p1', wrong, 1000));
    state = must(submitAnswer(state, 'p2', right, 2000));
    state = must(submitAnswer(state, 'p3', right, 3000));
    state = must(acceptAnswer(state, 'p1', 4000));
    expect(state.phase).toBe('question');
    expect(pendingOf(state)?.playerId).toBe('p2');
    state = must(acceptAnswer(state, 'p2', 5000));
    expect(state.phase).toBe('locked');
    expect(state.plays[0].blitz?.attempts.map((a) => [a.playerId, a.grade, a.timeMs])).toEqual([['p1', 'wrong', 1000], ['p2', 'correct', 2000]]);
    expect(state.plays[0].blitz?.dropped.map((e) => e.playerId)).toEqual(['p3']);
    expect(Object.keys(state.plays[0].answers).sort()).toEqual(['p1', 'p2']);
    expect(score(state, 'p2')).toBe(1000);
  });
  it('a player answers once: a second answer is refused, also after a wrong verdict', () => {
    let state = must(submitAnswer(open(), 'p1', wrong, 1000));
    expect(submitAnswer(state, 'p1', right, 1500)).toEqual({ ok: false, error: 'already_answered' });
    state = must(acceptAnswer(state, 'p1', 2000));
    expect(submitAnswer(state, 'p1', right, 2500)).toEqual({ ok: false, error: 'already_answered' });
  });
  it('after the timer nobody can answer, but answers sent in time are still checked', () => {
    let state = must(submitAnswer(open(), 'p1', wrong, 18_000));
    state = must(submitAnswer(state, 'p2', right, 19_000));
    state = tick(state, 25_000);
    expect(state.phase).toBe('question');
    expect(submitAnswer(state, 'p3', right, 25_000)).toEqual({ ok: false, error: 'time_over' });
    state = acceptAll(state, 26_000);
    expect(state.phase).toBe('locked');
    expect(score(state, 'p2')).toBe(1000);
  });
  it('after the timer the question closes once the queue is checked and nobody won', () => {
    const state = acceptAll(tick(must(submitAnswer(open(), 'p1', wrong, 19_000)), 21_000), 22_000);
    expect(state.phase).toBe('locked');
  });
  it('the question closes when every connected player answered wrong', () => {
    let state = open();
    for (const id of ['p1', 'p2', 'p3']) state = must(submitAnswer(state, id, wrong, 1000));
    expect(acceptAll(state, 2000).phase).toBe('locked');
  });
  it('repick keeps the head in place with a fresh window; a missed window is a wrong attempt', () => {
    let state = must(submitAnswer(open(), 'p1', wrong, 1000));
    state = must(submitAnswer(state, 'p2', right, 2000));
    state = must(repick(state, 'p1', 3000));
    expect(state.plays[0].blitz?.queue[0]).toMatchObject({ playerId: 'p1', answer: null, deadline: 18_000, timeMs: 1000 });
    expect(pendingOf(state)).toBeNull();
    expect(nextDeadline(state, 3000)).toBe(18_000);
    state = tick(state, 18_000);
    expect(state.plays[0].blitz?.attempts.map((a) => [a.playerId, a.grade])).toEqual([['p1', 'wrong']]);
    expect(pendingOf(state)?.playerId).toBe('p2');
    // Друга гілка: голова встигла відповісти після «Перевибрати».
    const again = must(submitAnswer(must(repick(must(submitAnswer(open(), 'p1', wrong, 1000)), 'p1', 3000)), 'p1', right, 4000));
    expect(pendingOf(again)).toEqual({ playerId: 'p1', answer: right });
  });
  it('stored attempts and answer window are ignored in an instant blitz', () => {
    let state = must(submitAnswer(open({ attempts: 3, answerWindow: 30 }), 'p1', wrong, 1000));
    expect(state.plays[0].blitz?.queue[0].deadline).toBeNull();
    state = must(acceptAnswer(state, 'p1', 2000));
    expect(submitAnswer(state, 'p1', right, 2500)).toEqual({ ok: false, error: 'already_answered' });
  });
  it('the minus for a wrong answer still applies', () => {
    let state = open({ rules: rules({ penalty: 'minus' }) });
    state = acceptAll(must(submitAnswer(must(submitAnswer(state, 'p1', wrong, 1000)), 'p2', right, 2000)), 3000);
    expect([score(state, 'p1'), score(state, 'p2')]).toEqual([-1000, 1000]);
  });
  it('lock keeps unchecked answers as dropped without points', () => {
    const state = must(lock(must(submitAnswer(open(), 'p1', right, 1000))));
    expect(state.plays[0].blitz?.dropped.map((e) => e.playerId)).toEqual(['p1']);
    expect(state.plays[0].answers).toEqual({});
  });
  ```
  У `game.video.test.ts` (відео без таймера, функція `openBlitz` уже є):
  ```ts
  it('an untimed instant blitz runs until someone wins or the host closes', () => {
    let state = must(submitAnswer(openBlitz(), 'p1', wrong, 300_000));
    expect(state.plays[0].blitz?.queue[0].deadline).toBeNull();
    state = tick(state, 900_000);
    expect(state.phase).toBe('question');
    state = acceptAll(must(submitAnswer(state, 'p2', right, 901_000)), 902_000);
    expect(state.phase).toBe('locked');
  });
  ```
  У `game.board-cells.test.ts` (наявні допоміжні функції відкриття бліц-клітинки):
  - `a phone blitz cell is instant: the chooser and the others answer at once, once each` — `buzz` відмовляє `wrong_phase`; вибравший і інший гравець відповідають `submitAnswer`; друга відповідь того самого — `already_answered`; правильна відповідь вибравшого після «Прийняти» дає ×2, як у наявному тесті.
  - `a voice blitz cell still needs a buzz` — `buzz` повертає `ok`, `submitAnswer` — `wrong_phase` (як зараз).
  - `a blitz cell with manual check keeps the buzz and the window` — раунд з `check: 'manual'`: `buzz` дає `deadline` = `now + 15000`.
  У `apps/server/src/recorder.test.ts`:
  - `an instant blitz records one row per checked answer with its own time; unchecked answers are not recorded` — у кімнаті з бліц-раундом (`check: 'auto'`) Олена відповідає хибно в 1 с, Тарас правильно в 2 с, третій гравець — після нього; ведучий двічі «Прийняти». Таблиця `answer`: два рядки, `attempt` 0, `timeMs` ≈ 1000 і 2000 (за підставленим `now` менеджера), `accepted` false/true; рядка третього гравця немає; бали учасників збігаються з таблицею.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine apps/server/src/recorder.test.ts`. Очікується FAIL: `buzz` повертає `ok`, `timeMs`/`dropped` undefined, `heldAt` не `null`.

- [ ] **Step 3: Implement.**
  - `blitzRulesOf`: для бліц-раунду з `check: 'auto'` — `answerWindow: null`, `attempts: 1`; для `manual` — як зараз. `cellBlitzRules`: телефонна клітинка з `round.check === 'auto'` — `answerWindow: null, attempts: 1`; телефонна з `manual` — `DEFAULT_ANSWER_WINDOW`, `attempts: null` (як зараз); усна — як зараз.
  - `buzz`: після `openBlitz` — `if (isInstant(rules)) return refuse('wrong_phase')`. Запис черги отримує `timeMs: Math.max(0, clock - (state.startedAt ?? clock))`.
  - `submitBlitzAnswer` для миттєвого бліцу, у такому порядку перевірок: запис у черзі з `answer !== null` або `attemptsUsed > 0` → `already_answered`; запис у черзі з `answer === null` (після «Перевибрати») → як зараз (перевірка `deadline`, тип, `answer` у запис); інакше `timeOver(state, play, now)` → `time_over`; тип → `type_mismatch`; новий запис `{ playerId, at: now, timeMs: max(0, now − startedAt), deadline: null, answer }` у кінець черги, `buzzed` доповнити. Далі `settleQueue(…, now)`.
  - `settle`: `holdAt` лише коли `!isInstant(rules)`. Коли знайдено правильну, решта черги (`rest`) іде в `dropped`, а не зникає. `Attempt.timeMs = head.timeMs`.
  - `repick` для миттєвого бліцу: голові — `answer: null, deadline: now + DEFAULT_ANSWER_WINDOW * 1000`; `thaw` лишається (для бліцу з кнопкою).
  - `dropQueue`: `{ queue: [], dropped: [...dropped, ...queue] }`. `removePlayer` фільтрує й `dropped`. Ініціалізація черги — `{ queue: [], attempts: [], buzzed: [], dropped: [] }`.
  - `sendBlitz` у `testing/helpers.ts` (через `blitzRulesOf` і `isInstant`).

- [ ] **Step 4: Перехід наявних тестів.** Правило для кожного тесту, що натискає `buzz` у раунді чи клітинці з `check: 'auto'`:
  - перевіряє поведінку кнопки (вікно, кілька спроб, повторне натискання, натискання під час утримання, «пише…», `canBuzz`, `deadline` вікна, `−15 с` для вікна) → раунд/клітинка отримує `check: 'manual'`, а `acceptAll`/`acceptAnswer` замінюється на `judge(state, playerId, correct, now)` з тим самим вердиктом;
  - перевіряє переможця, бали, штраф, серію, вилучення, `lock`/`end`, запис в історію → прибрати `buzz`, лишити `submitAnswer` (або `sendBlitz`); очікування часу оновити на час відповіді, якщо тест його перевіряв.
  Серверні тести (`manager.buzz`) — так само: у кімнатах з автоматичним бліцом прибрати `manager.buzz` перед відповіддю, у тестах кнопки (`socket.test.ts` «player:buzz and host:judge…») вікторина отримує `check: 'manual'`. Очікування в старих тестах «годинник стоїть, поки відповідь чекає» лишаються лише для `check: 'manual'` і усних клітинок.

- [ ] **Step 5: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/engine apps/server/src
git commit -m "feat(engine): instant blitz — everyone answers at once, one answer each, the queue is the order of answers, no clock hold"
```

---

### Задача 2. Зрізи: жива черга з часом без підказок

**Files:**
- Modify: `packages/shared/src/views.ts` (`BlitzRow`, `BlitzInfo`, `PlayerBlitz`, коментар `HostBlitz`)
- Modify: `packages/shared/src/round-brief.ts` (`RoundBrief.instant`, `emptyBrief`, `roundBrief`)
- Modify: `packages/engine/src/views.ts` (`currentBlitz`, `blitzInfo`, `playerBlitz`, `hostBlitz`, `spotlightOf`, `blitzAnswer`, `base`, `stageView`, `playerView`, `hostView`)
- Test: `packages/engine/src/views.test.ts`, `packages/engine/src/round-brief.test.ts`
- Modify (механічно): `apps/web/src/screens/StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `HostScreen.test.tsx`, `apps/web/src/round-summary.test.ts` (нові поля в літералах)

**Interfaces:**
- Consumes: `isInstant`, `BlitzPlay.dropped`, `BuzzEntry.timeMs` із задачі 1.
- Produces (`packages/shared/src/views.ts`):
  ```ts
  export interface BlitzRow extends BlitzPlayer {
    /** Від відкриття запитання до відповіді, мс. */
    timeMs: number;
    /** null — ще не перевірено або не перевірено до закриття. */
    grade: 'correct' | 'wrong' | null;
    /** Вибір; сцені й гравцям null до розкриття, ведучому завжди (null — після «Перевибрати» ще не відповів). */
    answer: Answer | null;
  }
  export interface BlitzInfo {
    queue: BlitzPlayer[];
    /** Переможець; сцені й гравцям — з reveal, у миттєвому бліці вже з locked. */
    winner: BlitzPlayer | null;
    /** Миттєвий бліц: без кнопки, автоперевірка. */
    instant: boolean;
    /** Жива черга миттєвого бліцу: розглянуті, нерозглянуті, не перевірені до закриття — у порядку надсилання; [] у бліці з кнопкою. */
    rows: BlitzRow[];
  }
  // PlayerBlitz — додати:
  /** Миттєвий бліц: можна надіслати відповідь (ще не відповідав або «Перевибрати»); етап question і не пауза. */
  canAnswer: boolean;
  /** Вердикт власної останньої спроби на цьому запитанні; null — ще немає. */
  grade: 'correct' | 'wrong' | null;
  ```
- Produces (`round-brief.ts`): `RoundBrief.instant: boolean` — бліц-раунд з `check: 'auto'`; тоді `attempts: 1`, `answerWindow: null`. `emptyBrief` — `instant: false`.

- [ ] **Step 1: Write the failing tests** у `views.test.ts` (у `describe('blitz views')`, `blitzGame` і `nicknames` уже є; `blitzGame()` — автоматичний раунд):
  ```ts
  it('stage and other players see names, times and verdicts in the instant queue but no picks before the reveal', () => {
    let state = must(submitAnswer(blitzGame(), 'p1', wrong, 2400));
    state = must(submitAnswer(state, 'p2', right, 3100));
    state = must(acceptAnswer(state, 'p1', 4000));
    for (const view of [stageView(state), playerView(state, 'p3')!]) {
      expect(view.blitz).toMatchObject({ instant: true, winner: null });
      expect(view.blitz?.rows).toEqual([
        { playerId: 'p1', nickname: 'Анна', timeMs: 2400, grade: 'wrong', answer: null },
        { playerId: 'p2', nickname: 'Богдан', timeMs: 3100, grade: null, answer: null },
      ]);
      expect(view.spotlight).toBeNull();
      expect(JSON.stringify(view)).not.toContain('"optionId"');
    }
    const closed = must(acceptAnswer(state, 'p2', 5000));
    expect(closed.phase).toBe('locked');
    expect(stageView(closed).blitz?.winner?.nickname).toBe('Богдан');
    expect(JSON.stringify(stageView(closed))).not.toContain('"optionId"');
    const revealed = must(next(closed, 6000));
    expect(stageView(revealed).blitz?.rows.map((r) => r.answer)).toEqual([wrong, right]);
  });
  it('the answerer sees their own pick and verdict, and can answer only once', () => {
    let state = blitzGame();
    expect(playerView(state, 'p1')?.me.blitz).toMatchObject({ canAnswer: true, canBuzz: false, position: null, grade: null });
    state = must(submitAnswer(state, 'p1', wrong, 1000));
    expect(playerView(state, 'p1')?.me).toMatchObject({ answer: wrong, blitz: { canAnswer: false, position: 1, grade: null } });
    state = must(acceptAnswer(state, 'p1', 2000));
    expect(playerView(state, 'p1')?.me).toMatchObject({ answer: wrong, blitz: { canAnswer: false, position: null, grade: 'wrong' } });
    expect(playerView(must(pause(blitzGame(), 500)), 'p1')?.me.blitz?.canAnswer).toBe(false);
  });
  it('after repick the head can answer again', () => {
    const state = must(repick(must(submitAnswer(blitzGame(), 'p1', wrong, 1000)), 'p1', 2000));
    expect(playerView(state, 'p1')?.me).toMatchObject({ answer: null, blitz: { canAnswer: true, position: 1, deadline: 17_000 } });
  });
  it('an unchecked answer stays visible to its author after the question closes', () => {
    const state = must(lock(must(submitAnswer(blitzGame(), 'p1', right, 1000))));
    expect(playerView(state, 'p1')?.me.answer).toEqual(right);
    expect(stageView(state).blitz?.rows).toEqual([{ playerId: 'p1', nickname: 'Анна', timeMs: 1000, grade: null, answer: null }]);
  });
  it('the host sees every pick and the head as the pending spotlight', () => {
    let state = must(submitAnswer(blitzGame(), 'p1', wrong, 1000));
    state = must(submitAnswer(state, 'p2', right, 2000));
    const host = hostView(state);
    expect(host.blitz?.rows.map((r) => r.answer)).toEqual([wrong, right]);
    expect(host.spotlight).toMatchObject({ playerId: 'p1', answer: wrong, grade: null });
    expect(hostView(must(lock(state))).spotlight).toBeNull();
  });
  it('the button blitz keeps its old view', () => {
    const state = must(buzz(blitzGame({ check: 'manual' }), 'p1', 1000));
    expect(stageView(state).blitz).toMatchObject({ instant: false, rows: [] });
    expect(playerView(state, 'p2')?.me.blitz?.canAnswer).toBe(false);
  });
  ```
  (`next` з етапу `locked` дає `reveal`. Імпортувати `submitAnswer`, `acceptAnswer`, `repick`, `lock`, `next`, `pause` з `./game`, `right`/`wrong` визначити, як у `game.blitz.test.ts`.)
  У `round-brief.test.ts` тест бліцу замінити:
  ```ts
  it('an automatic blitz is instant: one attempt, no window, whatever was stored', () => {
    expect(roundBrief(blitzRound('b1', [single], { answerWindow: 30, attempts: 3 }))).toEqual({ ...emptyBrief('blitz'), instant: true, attempts: 1 });
    expect(roundBrief(blitzRound('b1', [single], { check: 'manual', answerWindow: 15, attempts: 2 }))).toEqual({ ...emptyBrief('blitz'), attempts: 2, answerWindow: 15 });
  });
  ```
  Наявні тести блоку `blitz views`, що натискають `buzz` в автоматичному раунді, переводяться за правилом задачі 1, крок 4.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/views.test.ts packages/engine/src/round-brief.test.ts`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - `blitzRows(state, open, showPicks: boolean): BlitzRow[]` — `attempts` (з `grade`), потім `queue` (`grade: null`), потім `dropped` (`grade: null`); `answer` = `showPicks ? відповідь : null`. Вилучених гравців у рядках немає (їх і так фільтрує `removePlayer`).
  - `blitzInfo(state, forHost: boolean)`: `instant = isInstant(rules)`; `rows = instant ? blitzRows(state, open, forHost || isRevealed(state)) : []`; `winner` — для ведучого завжди, інакше з `isRevealed(state)` або (`instant` і `phase === 'locked'`). `base` отримує параметр ролі або `stageView`/`playerView`/`hostView` перезаписують `blitz` і `spotlight` — вибрати один спосіб і тримати його для обох полів.
  - `spotlightOf`: у миттєвому бліці — для ведучого лише `pendingOf` (голова, що чекає), для сцени й гравців `null` на всіх етапах.
  - `playerBlitz`: `canAnswer = instant && phase === 'question' && !paused && ((запису в черзі немає && attemptsUsed === 0) || (запис — голова з answer === null))`; `grade` — оцінка останньої власної спроби; `canBuzz` у миттєвому — `false`; `deadline` як зараз.
  - `blitzAnswer` шукає і в `queue`, і в `dropped`.
  - `HostBlitz` наслідує нові поля; `hostBlitz` бере `rows` з відповідями.
  - `roundBrief`: бліц з `check: 'auto'` → `{ ...withRules, instant: true, attempts: 1, answerWindow: null }`.
  - Веб-тести: у літерали `BlitzInfo` додати `instant: false, rows: []`, у `PlayerBlitz` — `canAnswer: false, grade: null`, у `RoundBrief` — `instant: false`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages apps/web/src
git commit -m "feat: instant blitz views — live queue with times and verdicts, picks only for the host until the reveal"
```

---

### Задача 3. Телефон: варіанти одразу, свій вибір, черга без зсуву

**Files:**
- Create: `apps/web/src/screens/BlitzQueue.tsx`, `apps/web/src/screens/BlitzQueue.test.tsx`
- Modify: `apps/web/src/screens/verdict-blink.ts` (`useBlinkingRows`), `verdict-blink.test.tsx`
- Modify: `apps/web/src/screens/PlayerScreen.tsx` (гілки `question`, `locked`, `reveal` для бліцу; `BlitzTurn`)
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/PlayerScreen.test.tsx`

**Interfaces:**
- Consumes: `BlitzRow`, `BlitzInfo.instant/rows`, `PlayerBlitz.canAnswer/grade` із задачі 2.
- Produces:
  ```ts
  // verdict-blink.ts
  /** playerId рядків, у яких вердикт з'явився менше ніж BLINK_MS тому; під час першого показу — порожньо. scope — номер запитання. */
  export function useBlinkingRows(rows: BlitzRow[], scope: number): ReadonlySet<string>;
  // BlitzQueue.tsx
  export function BlitzQueue(props: {
    rows: BlitzRow[];
    /** Скільки рядків резервувати: кількість гравців (у CSS не більше 6). */
    reserve: number;
    /** Для підпису вибору літерою показу. */
    question: PublicQuestion | null;
    blinking: ReadonlySet<string>;
    /** Ведучий: перша неперевірена відповідь помаранчева. */
    highlightHead?: boolean;
  }): JSX.Element;
  ```
- Розмітка `BlitzQueue`: `<ol className="rows blitz-queue is-reserved" aria-label="Черга відповідей" style={{ '--rows': Math.min(Math.max(reserve, 1), 6) }}>`; рядок `<li className={голова без оцінки ? 'is-head' (+' is-pending' з highlightHead) : undefined}>` з `span.rank` (1…), `span.name`, `span.time` («2,4 с» через `secondsText`), `span.blitz-mark` (`is-correct` «✓» / `is-wrong` «✗» / голова — тег «Перевіряємо» / після закриття без оцінки — «не перевірено»; `aria-label` «правильно»/«неправильно»), `span.given` лише коли `answer !== null` (`pickedText(answer, shownChoices(question))`). Мигає `span.blitz-mark` з класом `is-blinking`. Порожньо — `li.is-empty` «Відповідей ще немає».

- [ ] **Step 1: Write the failing tests.**
  - `BlitzQueue.test.tsx` (`// @vitest-environment jsdom`):
    - `shows rank, name, time and verdict, and the pick only when it is given` — рядки Оля 2400 wrong без відповіді, Петро 3100 null з `{ type: 'single', optionId: 'b' }`: тексти `1`, `Оля`, `2,4 с`, `✗`; у першому рядку немає `.given`, у другому `.given` містить «Б»; голова неперевірених — «Перевіряємо».
    - `reserves its rows and keeps one line per row` — `reserve: 9` → `style` містить `--rows: 6`; клас `is-reserved`; порожній список — «Відповідей ще немає».
    - `the host head is orange` — `highlightHead` → перший рядок без оцінки має `is-pending`.
  - `verdict-blink.test.tsx`: `useBlinkingRows blinks a row whose verdict arrives, not on the first render, and not again for the next question with the same verdict` — `renderHook` з рядками; перший рендер з `grade: 'wrong'` → порожньо; оновлення з новим рядком `grade: 'correct'` → `Set(['p2'])`; через `BLINK_MS` (`vi.advanceTimersByTime`) → порожньо; `scope` 1 → 2 з тим самим `p1|wrong`, що з'явився після порожнього списку → мигає.
  - `PlayerScreen.test.tsx` (фабрики зрізу вже є; бліц-зріз з `blitz: { instant: true, rows, queue, winner: null }`, `me.blitz: { canAnswer, grade, position, … }`):
    - `instant blitz: options at once without the buzz button; a tap sends the answer` — немає кнопки «Відповісти»; клік по варіанту «Київ» викликає `send('player:answer', { type: 'single', optionId: … })`.
    - `after sending, the own pick is orange in the same list and the status line says the place` — `me.answer` задано, `canAnswer: false`, `position: 2` → `.choice.is-pending` з «Київ»; «Відповідь надіслано · ви 2-й у черзі»; є `ol.blitz-queue`.
    - `the own wrong verdict blinks; other rows show no picks` — rerender з `grade: 'wrong'` → `.choice.is-wrong.is-blinking`; у `.blitz-queue` немає `.given`.
    - `no answering line above the question in an instant blitz` — голова черги інша людина → тексту «Відповідає» немає.
    - `after repick the options are tappable again with a note` — `canAnswer: true`, `position: 1`, `deadline` задано → кнопки варіантів і «Ведучий просить вибрати ще раз».
    - `the button blitz keeps the buzz button and always reserves the answering line` — `instant: false`, черга порожня → кнопка «Відповісти» і порожній `p.answering-line`; з головою «Анна» → той самий елемент з «Відповідає Анна».
    - `on locked the winner is shown with the queue; on reveal the own pick and the correct answer are coloured` — `phase: 'locked'`, `winner` → «Першим правильно відповів: Богдан»; `reveal` → `.choice.is-correct`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - `PlayerScreen`: `const instant = view.blitz?.instant === true`. Власний spotlight `own = instant && me.answer !== null ? { playerId: me.id, nickname: me.nickname, answer: me.answer, grade: me.blitz?.grade ?? null } : null`. На рівні екрана: `blink = useVerdictBlink(instant ? own : spotlight)`, `rowBlink = useBlinkingRows(view.blitz?.rows ?? [], view.questionIndex)`.
  - У миттєвому бліці `answering` = `null` (рядка «Відповідає …» немає). Гілка `question`: `me.blitz.canAnswer` → `fieldset.inputs` з `AnswerInput` (`key` = `${questionIndex}-${position ?? 0}-${me.answer === null}`), інакше `SpotlightChoices` з `own`, `reveal={null}`, `blink`. Під варіантами — `p.blitz-status` (завжди, мінімальна висота в один рядок) і `BlitzQueue` з `reserve={view.playerCount}`. Таймер вікна після «Перевибрати» — як у `BlitzTurn`, у рядку стану.
  - Рядок стану (`blitz-status`): `canAnswer && position === 1` → «Ведучий просить вибрати ще раз»; `position === 1` → «Ведучий перевіряє вашу відповідь»; `position > 1` → «Відповідь надіслано · ви {position}-й у черзі»; `grade === 'wrong'` → «Неправильно — чекаємо інших»; `grade === 'correct'` → «Правильно!»; інакше порожньо.
  - `locked` і `reveal` у миттєвому бліці: `SpotlightChoices` з `own` (на `reveal` — з `view.reveal`), `BlitzQueue`, на `locked` — рядок переможця (`blitzWinner`/`blitzNoWinner`, як у `Result`) і `waitReveal`; на `reveal` — `Result`.
  - Бліц з кнопкою: над запитанням завжди `p.lead.answering-line` (порожній, коли ніхто не відповідає) замість умовного рядка; CSS `min-height` одного рядка. Решта `BlitzTurn` без змін.
  - `i18n.ts`: `blitzQueueLabel: 'Черга відповідей'`, `blitzQueueEmpty: 'Відповідей ще немає'`, `blitzRowTime: '{time} с'`, `blitzRowCorrect: 'правильно'`, `blitzRowWrong: 'неправильно'`, `blitzUnchecked: 'не перевірено'`, `blitzMineQueued: 'Відповідь надіслано · ви {position}-й у черзі'`, `blitzMineChecking: 'Ведучий перевіряє вашу відповідь'`, `blitzMineWrong: 'Неправильно — чекаємо інших'`, `blitzMineCorrect: 'Правильно!'`, `blitzRepickAgain: 'Ведучий просить вибрати ще раз'`.
  - `styles.css`: `.blitz-queue.is-reserved { --row-h: 2.75rem; min-height: calc(var(--rows) * var(--row-h)); max-height: calc(var(--rows) * var(--row-h)); overflow-y: auto; }`, рядок висотою `--row-h`, `white-space: nowrap`, `.name` і `.given` з `min-width: 0; overflow: hidden; text-overflow: ellipsis`; кольори ✓/✗ — наявні токени правильного/неправильного; помаранчевий `is-pending` — наявний токен 7a; `.blitz-mark.is-blinking` — та сама анімація, що й `.choice.is-blinking`, у тому самому `@media (prefers-reduced-motion: no-preference)`; `.blitz-status, .answering-line { min-height: 1.5em; }`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): instant blitz on the phone — options at once, own pick in place, a reserved live queue with verdict blinks"
```

---

### Задача 4. Сцена й пульт ведучого

**Files:**
- Modify: `apps/web/src/screens/StageScreen.tsx` (рядок «Відповідає …», заголовок, черга, переможець)
- Modify: `apps/web/src/screens/HostScreen.tsx` (панель черги ~450–500, лічильник у заголовку ~220)
- Modify: `apps/web/src/styles.css` (лише якщо сцені чи пульту потрібні свої розміри рядка)
- Test: `apps/web/src/screens/StageScreen.test.tsx`, `HostScreen.test.tsx`

**Interfaces:**
- Consumes: `BlitzQueue`, `useBlinkingRows` (задача 3); `BlitzInfo.instant/rows/winner` (задача 2).

- [ ] **Step 1: Write the failing tests.**
  - `StageScreen.test.tsx`:
    - `the stage shows no picks and no answering line in an instant blitz until the reveal` — зріз `question` з `rows` (Оля wrong, Петро null), `spotlight: null`: є `ol.blitz-queue` з «Оля», «2,4 с», «✗»; немає `.given`, немає «Відповідає»; варіанти без `is-pending`; у заголовку «відповіли: 2 з 3».
    - `on locked the stage shows the winner, on reveal the picks and the correct option` — `locked` з `winner` → «Першим правильно відповів: Петро», рядки без `.given`; `reveal` з `rows[].answer` і `reveal` → `.given` у кожному рядку, `.choice.is-correct`, лічильники `stats`.
    - `a row blinks when its verdict arrives` — rerender з оцінкою → `.blitz-mark.is-blinking`.
    - `the button blitz reserves the answering line` — `instant: false`: порожній `p.answering-line` присутній і без голови.
  - `HostScreen.test.tsx`:
    - `the host sees each pick in the instant queue and the head orange with accept and repick` — зріз ведучого з `rows` з відповідями і `spotlight` голови: у `.blitz-queue` `.given` для кожного рядка; перший рядок `is-pending`; кнопки «Прийняти» й «Перевибрати» (наявна панель); немає старих списків «Черга»/«Спроби».
    - `the button blitz host panel is unchanged` — `instant: false`: заголовки «Черга» і «Спроби» на місці.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - `StageScreen`: `instant = view.blitz?.instant === true`. Миттєвий: `answering = null`; заголовок `answeredOf` з `answered = rows.length`; `spotlit` хибне (spotlight `null`), тож варіанти йдуть звичайною гілкою з `correctIds` і `stats`; під ними `BlitzQueue` (`reserve={view.playerCount}`, `blinking` з `useBlinkingRows` на рівні `StageScreen`) на `question`, `locked`, `reveal`; рядок переможця на `locked` і `reveal`. Бліц з кнопкою: рядок «Відповідає …» — завжди присутній `p.lead.answering-line` (у блоці клітинки — завжди присутній `span`), стара черга без змін.
  - `HostScreen`: миттєвий — замість списків «Черга»/«Спроби» `BlitzQueue` з `highlightHead`, `reserve={view.playerCount}`; лічильник у заголовку — `answeredOf` з `rows.length`; панель «Прийняти / Перевибрати» без змін (її живить `spotlight` голови).

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): instant blitz on the stage and the host console — live queue with times, picks for the host, winner on close"
```

---

### Задача 5. Редактор, пояснення раунду, примітки клітинки й демо

**Files:**
- Modify: `apps/web/src/editor/RoundSettings.tsx` (блок `round.type === 'blitz'`), `apps/web/src/editor/draft.ts` (~179)
- Modify: `apps/web/src/round-summary.ts`, `apps/web/src/screens/Board.tsx` (`BlitzCellNotes`), виклики `BlitzCellNotes` у `PlayerScreen.tsx`, `StageScreen.tsx`, `HostScreen.tsx`
- Modify: `apps/web/src/i18n.ts`
- Modify: `apps/server/scripts/demo-quiz.ts`, `movie-quiz.ts`, `erudite-quiz.ts`, `party-quiz.ts`
- Test: `apps/web/src/editor/QuizEditor.test.tsx`, `apps/web/src/editor/draft.test.ts`, `apps/web/src/round-summary.test.ts`, `apps/web/src/screens/Board.test.tsx`, `apps/server/scripts/demo-quiz.test.ts`

**Interfaces:**
- Consumes: `RoundBrief.instant` і `BlitzInfo.instant` (задача 2).
- Produces: `BlitzCellNotes({ board, instant }: { board: BoardInfo; instant: boolean })`.

- [ ] **Step 1: Write the failing tests.**
  - `QuizEditor.test.tsx`: `the window and attempts are hidden for an automatic blitz` — новий бліц-раунд: є «Перевірка» = «Автоматично», немає полів «Вікно відповіді» й «Спроб на запитання»; вибір «Ведучий» показує обидва; повернення на «Автоматично» ховає їх, а збережений раунд має `answerWindow: null, attempts: 1`.
  - `draft.test.ts`: новий бліц-раунд чернетки — `{ check: 'auto', answerWindow: null, attempts: 1 }`.
  - `round-summary.test.ts`: `an instant blitz explains answering at once with one attempt` — `roundSummary({ ...emptyBrief('blitz'), instant: true, attempts: 1 })` дорівнює `['Бали отримує лише той, хто першим правильно відповість.', 'Відповідайте одразу, без кнопки: одна спроба, відповіді перевіряються в порядку надходження.']` (плюс рядок модифікаторів, якщо він не порожній). Наявний тест бліцу з кнопкою — з `instant: false`, тексти без змін.
  - `Board.test.tsx`: `BlitzCellNotes` з `instant` → «Відповідають усі одразу, перевіряємо по черзі. Хто вибрав клітинку, отримує ×2»; без `instant` → наявний текст «Відповідає перший, хто натисне «Відповісти»…». Легенда: пункт бліцу — «Бліц: бали першому, хто правильно відповість» (оновити два наявні очікування з 'Бліц: відповідає перший, хто натисне').
  - `demo-quiz.test.ts`: `automatic blitz rounds in the demo quizzes carry no window and one attempt` — для `demoQuiz`, `movieQuiz`, `eruditeQuiz`, `partyQuiz()`: кожен раунд `type === 'blitz' && check === 'auto'` має `answerWindow === null && attempts === 1`; усі вікторини проходять `quizSchema`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web apps/server/scripts`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - `RoundSettings`: у бліці спершу «Перевірка»; «Вікно відповіді» й «Спроб на запитання» — лише за `round.check === 'manual'`. Зміна на `auto` → `{ ...round, check: 'auto', answerWindow: null, attempts: 1 }`; на `manual` — `{ ...round, check: 'manual' }` (значення лишаються, `null`-вікно = «Вимкнене», `1` спроба).
  - `draft.ts`: `answerWindow: null`.
  - `round-summary.ts`: бліц з `brief.instant` → `summaryBlitz`, `summaryBlitzInstant`, `modifiers(brief, [])`; інакше як зараз.
  - `BlitzCellNotes`: текст правила — `cellBlitzRuleInstant` за `instant`, інакше `cellBlitzRule`. Виклики: `instant={view.blitz?.instant === true}`.
  - `i18n.ts`: `summaryBlitzInstant: 'Відповідайте одразу, без кнопки: одна спроба, відповіді перевіряються в порядку надходження.'`, `cellBlitzRuleInstant: 'Відповідають усі одразу, перевіряємо по черзі. Хто вибрав клітинку, отримує ×2'`, `legendBlitz: 'Бліц: бали першому, хто правильно відповість'`.
  - Демо: у кожному бліц-раунді з `check: 'auto'` (`demo-quiz.ts` ~144, `erudite-quiz.ts` ~124, `movie-quiz.ts` ~55, `party-quiz.ts` — знайти раунди `type: 'blitz'`) — `answerWindow: null, attempts: 1`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src apps/server/scripts
git commit -m "feat: hide window and attempts for the automatic blitz; instant blitz briefing, cell note, legend and demo quizzes"
```

---

### Задача 6. Наскрізний сценарій 7b, кадри й надійна обв'язка

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–5.
- Допоміжні функції файлу: `open`, `register`, `join`, `shot`, `click`, `field`, `seconds`, `expectNoSideScroll`, `snapshot`. З `@quiz/engine/testing` — `blitzRound`, `boardRound`, `makeRoundsQuiz`, `single`, `withId`, `withPoints`, `withVideo` (додати `blitzRound` до імпорту, якщо його немає).

- [ ] **Step 1: Надійна обв'язка.**
  - `open()` записує контекст у масив поточного тесту `contexts: BrowserContext[]`. `afterEach`: закрити всі контексти тесту (`await Promise.all(contexts.map((c) => c.close().catch(() => undefined)))`), очистити `contexts` і `pages`. `beforeEach`: `problems.length = 0`.
  - Запис проблеми з консолі: `${name} console: ${message.text()} @ ${message.location().url}`; з `pageerror`: `${name}: ${error.message} @ ${page.url()}`.
  - `snapshot()` лишається в `catch` кожного сценарію й устигає до `afterEach`.
  - Кожен сценарій і далі закінчується `expect(problems).toEqual([])` — тепер це проблеми лише цього тесту.

- [ ] **Step 2: Оновити наявні сценарії під миттєвий бліц.**
  - `blitzGame()`: рядок вибору «Спроб на запитання» замінити на перевірку `expect(await host.locator('label.field', { hasText: 'Спроб на запитання' }).count()).toBe(0)` за «Автоматично». Запитання 1: без `click(anna, 'Відповісти')` і без «Ви 1-й у черзі». Анна одразу вибирає «Львів»; на сцені немає `.choice.is-pending` і немає «Відповідає Анна», натомість `.blitz-queue li` з «Анна»; у ведучого «Прийняти» й «Перевибрати». Борис відповідає «Київ». «Перевибрати» → в Анни «Ведучий просить вибрати ще раз» і кнопки варіантів; вона знову вибирає «Львів». «Прийняти» → на сцені `.blitz-mark.is-wrong` у рядку Анни, `.choice.is-correct` немає. «Прийняти» → «Першим правильно відповів: Борис» на сцені вже до «Показати відповідь». Кадри перейменувати з `blitz-pending-*` на `blitz-queue-*`. Подіум і історія без змін.
  - `mixedBoard()`, ходи 2 і 3: прибрати натискання «Відповісти»; замість `.choice.is-pending` на сцені — рядок черги з іменем; замість «Відповідає Алла» у Віри — `.blitz-queue` з «Алла». Бали без змін. Хід 5 (усний бліц) без змін: там кнопка лишається.
  - Сценарій 7a: очікування легенди «Бліц: відповідає перший, хто натисне» → «Бліц: бали першому, хто правильно відповість».

- [ ] **Step 3: Add the scenario** `it('part 7b: an instant blitz — options at once, a live queue with times, a wrong head then the next, the winner closes, nothing moves; a voice blitz keeps its button', …)` з `try/catch` і `snapshot()`. Підготовка:
  1. Ведучий `register(host, 'host', 'Ірина Ведуча', 'host7b@example.com')`.
  2. Вікторина «Миттєвий бліц» через `host.request.post(`${base}/api/quizzes`, { data })`, `data` = `makeRoundsQuiz([...])`:
     - **Раунд 1, бліц** (`check: 'auto'`, `answerWindow: 20`, `attempts: 3` — старі значення, що мають ігноруватися; `rules.penalty: 'minus'`): single «Столиця України?» (Львів, Київ, Одеса; правильний Київ; 30 с) і single «Найбільша річка?» (Дніпро правильний, Дунай, Десна; 30 с).
     - **Раунд 2, поле** (`check: 'auto'`): категорія «Міста» — клітинка 100 `kind: 'blitz'` (телефонна), клітинка 200 `kind: 'blitz', answerMode: 'voice'`, клітинка 300 звичайна.
  3. Гра: `stage` 1600×900, `olya` 375×812, `taras` 360×740, `ira` 390×844. Порядок поля — за приєднанням (Оля, Тарас, Іра).

- [ ] **Step 4: Assertions and shots** (у такому порядку):
  1. **Варіанти одразу.** Після «Почати раунд» у Олі, Тараса й Іри видно кнопки «Київ» і немає кнопки «Відповісти» (`getByRole('button', { name: 'Відповісти', ...exact })` count 0). Кадр `blitz7b-options-phone`. Зберегти `yOf(page) = page.locator('.choice').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))` для `olya` і `stage`.
  2. **Черга з часом.** Тарас вибирає «Львів», потім Іра «Київ».
     - на сцені й в Олі `.blitz-queue li` — 2 рядки: перший містить «Тарас» і текст за `/\d+,\d с/`, другий «Іра»; `.blitz-queue .given` count 0; `stage.locator('.blitz-queue').innerText()` не містить «Львів»;
     - у Тараса `.choice.is-pending` з «Львів» і «Ведучий перевіряє вашу відповідь»; в Іри «ви 2-й у черзі»;
     - у ведучого `.blitz-queue .given` містить «Львів» і «Київ», перший рядок `is-pending` з «Тарас», кнопки «Прийняти» й «Перевибрати»;
     - кадри `blitz7b-queue-stage`, `blitz7b-queue-phone-other` (Оля), `blitz7b-queue-phone-mine` (Тарас), `blitz7b-queue-host`;
     - `expect(await yOf(olya)).toEqual(olyaY)` і те саме для `stage`;
     - `expectNoSideScroll(olya, 'blitz7b-queue-phone-375')`.
  3. **Хибна голова, далі наступний.** Ведучий «Прийняти».
     - на сцені й в Олі рядок Тараса має `.blitz-mark.is-wrong`; на сцені `.blitz-mark.is-blinking`; у Тараса `.choice.is-wrong.is-blinking` і «Неправильно — чекаємо інших»;
     - у ведучого перший неперевірений рядок `is-pending` тепер з «Іра»;
     - кадри `blitz7b-wrong-stage`, `blitz7b-wrong-phone-mine`;
     - `yOf(olya)` і `yOf(stage)` незмінні.
  4. **Переможець закриває.** Ведучий «Прийняти».
     - на сцені й в Олі «Першим правильно відповів: Іра» ще до «Показати відповідь»; у Олі немає кнопок варіантів; на сцені `.blitz-queue .given` count 0;
     - кадр `blitz7b-winner-stage`.
     «Показати відповідь» → на сцені `.blitz-queue .given` містить «Львів» і «Київ», `.choice.is-correct` з «Київ», кадр `blitz7b-reveal-stage`. Бали на пульті (як `score()` у `mixedBoard`): Іра 1000, Тарас −1000 (ціна фікстури `single` — 1000; мінус за помилку діє), Оля 0. «Далі», «Наступне запитання».
  5. **Усі помилилися.** Запитання 2: Оля «Дунай», Тарас «Десна», Іра «Дунай»; ведучий тричі «Прийняти» → «Ніхто не відповів правильно» на сцені без «Закрити запитання». Далі до заставки поля.
  6. **Бліц-клітинка телефоном.** Оля вибирає «Міста, 100»: в Олі (вибрала) і в Тараса одразу варіанти, кнопки «Відповісти» немає; Тарас відповідає правильно, ведучий «Прийняти» → клітинка закрита, переможець Тарас. Кадр `blitz7b-cell-stage`.
  7. **Усний бліц лишається з кнопкою.** Тарас вибирає «Міста, 200». В Олі й Іри кнопка «Відповісти»; зберегти `yOf(ira)`; Оля тисне «Відповісти» → в Іри «Відповідає Оля», `yOf(ira)` незмінний. Кадри `blitz7b-voice-button-phone`, `blitz7b-voice-answering-phone`. Ведучий «Закрити клітинку».
  8. «Завершити гру» і `expect(problems).toEqual([])`.

- [ ] **Step 5: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв. Потім той самий запуск з `E2E_SHOTS=1`. Переглянути кадри в `apps/server/e2e/artifacts/shots`:
  - варіанти на телефоні одразу, без кнопки;
  - черга з часом і ✓/✗ під варіантами на сцені й телефонах, блок фіксованої висоти, ім'я не ламає рядок;
  - у ведучого видно вибір кожного й помаранчеву голову;
  - на 375 px без прокрутки вбік.

- [ ] **Step 6: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts
git commit -m "test: part 7b end-to-end — instant blitz queue with times, wrong head then next, winner closes, no layout shift, voice blitz button; per-test e2e problems and contexts"
```

Після фінальної рецензії гілку злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`. У звіті власникові назвати рішення про годинник (не утримується; вчасні відповіді розглядаються й після нуля) і про те, що вибір видно з розкриття.
