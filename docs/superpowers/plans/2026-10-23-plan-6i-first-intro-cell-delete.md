# План 6i: заставка перед першим раундом і видалення запитання в полі

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** дві правки після перевірки 6h.
1. Кожна гра, навіть з одним класичним чи бліц-раундом, починається із заставки першого раунду з поясненням правил (`RoundBriefing`). Перше запитання відкриває ведучий кнопкою «Почати раунд».
2. У редакторі поля кнопка «Прибрати запитання» стоїть просто в сітці під вибраною клітинкою. Коли в категорії мінімум запитань, вона видима, але вимкнена, і під нею коротка підказка.

**Архітектура:**
- **Рушій (`engine`).** Зараз `start` у `packages/engine/src/game.ts` дає заставку лише тоді, коли `state.quiz.rounds.length > 1 || type === 'board' || type === 'final'`, інакше одразу `advance(first, now, rng)`. Умова зникає: `start` завжди повертає `{ ...enterRound({ ...state, roundIndex: 0 }), phase: 'intro' }`. Час і `rng` йому більше не потрібні, тож сигнатура стає `start(state: GameState): Result`. Перше запитання відкриває наявна гілка `next` з `intro` (`advance(state, now, rng)`), як для другого раунду.
- **Сервер.** `RoomManager.host` викликає `start(state)`. Таймерів на заставці немає (`endsAt === null`), тож `reschedule` нічого не ставить. Рекордер уже вміє заставку: запис починається з першої фази після `lobby`, `closedQuestions` дає 0, як зараз у грі з кількома раундами.
- **Екрани (`web`).** Заставка вже є на сцені, телефоні й пульті з 6h. Для вікторини з одним раундом прибирається рядок «Раунд 1 з 1»: він нічого не каже.
- **Редактор поля (`web`).** У `BoardEditor.tsx` кнопка видалення переїжджає з панелі клітинки (`.toolbar` під редактором запитання) у стовпець вибраної клітинки, одразу під «+ Запитання». На мінімумі вона `disabled` з підказкою через `aria-describedby`.

**Технології:** TypeScript, vitest, Fastify, React + Vite, Playwright.

**Специфікація** (окремого документа немає; обов'язкові вимоги власника від 2026-10-23):
1. **Always show the round intro before the first round.** Today a quiz whose first round is a single classic or blitz round (more precisely: whatever condition the engine uses to skip the intro — find it, e.g. in `packages/engine/src/game.ts` start/`enterRound`) starts straight at the first question, so players never see the round rules summary and author note (added in plan 6h: `RoundBriefing`, `roundSummary`, round `description`/`brief` in round info). Owner: «перероби старт гри… треба максимально робити інформативно для учасників вікторини». Make every round, including the first round of every quiz, start with its intro screen (stage, phone, host), with the host pressing «Далі»/next to open the first question as for later rounds. Find every engine/server test and e2e scenario that assumes the game starts at the first question and update them (the 6h plan estimated ~13 engine/server tests plus the blitz e2e). Check history/recorder/profile stats, auto-start/timers, pause, reconnect and the final round (already always has an intro) are unaffected. Consider whether the intro should also show something useful for a one-round quiz (quiz title/rules?) — keep YAGNI, state your decision.
2. **Board editor: deleting a question (cell) is not discoverable.** Owner screenshot: categories can be added and removed, but questions can't be deleted. In `apps/web/src/editor/BoardEditor.tsx` the «Видалити» cell button exists only in the toolbar at the bottom of the cell panel (far below the grid) and is hidden when the column has `LIMITS.minCategoryQuestions` cells. Make deletion obvious right in the grid (e.g. a small delete control on the selected cell / next to «+ Запитання», with confirm when the question has text as now) and, when the column is at the minimum, show it disabled with a short hint explaining the minimum (find the value in shared LIMITS) instead of hiding it. Keep classic-round question deletion as is.

**Рішення плану там, де вимоги мовчать:**
- **Причина вимоги 2.** Нова категорія й нове поле мають рівно 3 клітинки (`newBoardCategory`: 100, 200, 300), а `LIMITS.minCategoryQuestions = 3`. Тому в щойно доданому полі кнопки видалення не було ніде, доки не додати четверте запитання.
- **Сигнатура `start(state)`.** Невикористані `now` і `rng` прибираються, а не лишаються для сумісності. `pnpm typecheck` покаже кожен виклик, і це заодно повний список тестів, які треба переглянути.
- **Тести, що чекали запитання одразу після старту,** отримують один крок «Почати раунд»: у рушії це новий помічник `startRound(lobby, now, rng?)` у `packages/engine/src/testing/helpers.ts`, на сервері `host('next')` або `send(host, 'host:next')` одразу після старту. Очікування щодо балів, таймерів і журналу не змінюються: «Почати раунд» натискається в той самий момент часу, що й старт.
- **Тест-специфікація старого правила** (`game.rounds.test.ts`, `starts a quiz of one round straight with its first question`) переписується на нове правило, а не видаляється.
- **Що показує заставка вікторини з одним раундом.** Назву раунду й пояснення правил (`RoundBriefing`), як заставка будь-якого раунду. Назву вікторини не додаємо (YAGNI): її немає в зрізах рушія, а гравці вже бачили її під час входу. Рядок «Раунд 1 з 1» (і «, Раунд 1 з 1» у рядку фази на пульті) не показується, коли `round.total === 1`. Це стосується й поля та фіналу з одним раундом.
- **Головна кнопка ведучого на заставці** лишається «Почати раунд» (`MAIN_ACTION.intro`), для фіналу «Почати фінал». Нового тексту не треба.
- **Кнопка видалення клітинки.** Одна на поле, лише в стовпці вибраної клітинки, після «+ Запитання». Так «+ Запитання» лишається на однаковій висоті в усіх стовпцях. Текст той самий, «Прибрати запитання» (`boardRemoveCell`), стиль `btn btn-small btn-danger`. Підтвердження як зараз (`boardRemoveCellConfirm`, лише коли в запитанні є текст). Кнопка з панелі клітинки прибирається, щоб не було двох однакових. Стрілки ↑/↓ лишаються в панелі.
- **Підказка мінімуму:** `boardCellMinHint: 'Щонайменше {min} запитання в категорії'` з `min = LIMITS.minCategoryQuestions` (3). Вона видима (`p.meta.board-edit-hint`) лише при `cells.length <= LIMITS.minCategoryQuestions` і пов'язана з кнопкою через `aria-describedby` (`useId`).
- **«Прибрати категорію»** на мінімумі категорій лишається схованою, як зараз: власник просив лише про запитання.

## Глобальні обмеження

- Бали, етапи після заставки, таймери, історія й статистика поводяться точно як зараз. Єдина зміна гри: після «Почати гру» завжди йде `intro` першого раунду.
- Рушій чистий: без мережі, бази й таймерів.
- Значення: `LIMITS.minCategoryQuestions = 3`, `LIMITS.maxCategoryQuestions = 10` (`packages/shared/src/quiz.ts`), не дублювати числа в коді й тестах редактора, окрім готового тексту підказки.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`. Кольори лише через наявні токени `styles.css` (`--paper`, `--dim`, `--amber`, `--line`). Тема лише темна. Новий клас лише `board-edit-hint`, наявні не перевизначаються.
- Кожна задача починається з тесту, що падає. Перед комітом зелені `pnpm vitest run --maxWorkers=2` і `pnpm typecheck`. Саме `--maxWorkers=2`, а не `pnpm test`: паралельні робітники PGlite падають під навантаженням на цій машині.
- Наскрізні тести: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Кадри для перевірки дизайну знімаються з `E2E_SHOTS=1`.
- Міграцій бази немає.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (побажання власника: проєкт тестовий).

## Порядок збирання

- Задача 1 (рушій і сервер) змінює сигнатуру `start`, тож усі виклики й тести рушія та сервера оновлюються в ній самій, щоб коміт був зеленим.
- Задача 2 (екрани з одним раундом) і задача 3 (редактор поля) незалежні від задачі 1 і одна від одної.
- Задача 4 (наскрізні сценарії) іде останньою: після задачі 1 чотири сценарії e2e падають, доки не отримають «Почати раунд». Між задачами 1 і 4 e2e не запускати як критерій.

## На що дивитися рецензентові

1. **Пауза, «Завершити раунд» і «Завершити гру» на першій заставці.** Пауза на `intro` дозволена (`pause` відмовляє лише в `lobby`/`finished`), «Почати раунд» під час паузи дає `paused`. `endRound` з першої заставки єдиного раунду веде до `round_end`/кінця без запитань і без бонусів. Тест: задача 1, `pauses and ends the game from the intro of the only round`.
2. **Таймер першого запитання рахується від «Почати раунд», а не від старту.** Ведучий може тримати заставку скільки завгодно. Тест: задача 1, `starts every quiz with the intro of its first round` (`endsAt` = момент `next` + 20 000).
3. **Перемішування варіантів** тепер відбувається на `next`, тож `rng` у тестах `order`/`match`/`shuffleOptions` (`game.flow.test.ts`, `views.test.ts`) передається в `startRound`, а не в `start`. Якщо його загубити, тести впадуть не одразу, а лише випадково. Тест: наявні тести перемішування, переведені на `startRound(..., rng)`.
4. **Історія гри, завершеної на першій заставці.** Рекордер створює запис гри з 0 зіграних запитань, як зараз у грі з кількома раундами. Профіль і ачівки не отримують відповідей. Тест: задача 1, `records a game ended on the first intro without answers`.
5. **Видалення на мінімумі та вибір після видалення.** На 3 клітинках кнопка вимкнена й підказка видима. Після видалення останньої клітинки вибір переходить на попередню в тому самому стовпці. Перемикання на інший стовпець переносить кнопку туди. Тест: задача 3, `deletes a cell right from the grid and explains the minimum`; задача 4, кроки в `boardGame`.

---

### Задача 1. Рушій і сервер: кожна гра починається із заставки

**Files:**
- Modify: `packages/engine/src/game.ts` (`start`), `packages/engine/src/testing/helpers.ts`, `apps/server/src/rooms/manager.ts` (`case 'start'`)
- Test (оновлюються): `packages/engine/src/game.{blitz,board-cells,board,control,final,flow,full,match,rounds,rules,timing,video}.test.ts`, `packages/engine/src/views.test.ts`; `apps/server/src/{rooms/manager,socket,history,recorder,profiles,games,app}.test.ts`

**Interfaces:**
- Produces: `start(state: GameState): Result` — з `lobby` завжди `phase: 'intro'`, `roundIndex: 0`, `plays: []`, `startedAt`/`endsAt` без змін (`null`); помилки ті самі (`wrong_phase`, `no_players`).
- Produces (тести рушія): `startRound(lobby: GameState, now: number, rng?: Rng): GameState` у `testing/helpers.ts` = `must(next(must(start(lobby)), now, rng))`.

- [ ] **Step 1: Write the failing tests.** У `game.rounds.test.ts` тест `starts a quiz of one round straight with its first question` замінити на:

```ts
it('starts every quiz with the intro of its first round, even a quiz of one round', () => {
  for (const quiz of [makeQuiz([single, text]), makeRoundsQuiz([blitzRound('b1', [single])])]) {
    const intro = must(start(lobbyWith(quiz, 'Олена')));
    expect(intro).toMatchObject({ phase: 'intro', roundIndex: 0, plays: [], endsAt: null });
    const open = must(next(intro, T0 + 5_000));
    expect(open).toMatchObject({ phase: 'question', roundIndex: 0, questionIndex: 0, startedAt: T0 + 5_000 });
    expect(open.plays).toHaveLength(1);
  }
});

it('pauses and ends the game from the intro of the only round', () => {
  const intro = must(start(lobbyWith(makeQuiz([single, text]), 'Олена')));
  const paused = must(pause(intro, T0));
  expect(next(paused, T0)).toEqual({ ok: false, error: 'paused' });
  const ended = must(endRound(must(resume(paused, T0)), T0));
  expect(ended.plays).toHaveLength(0);
  expect(ended.players[0].score).toBe(0);
});
```

  У `game.flow.test.ts` `started` стає `() => startRound(lobbyWith(quiz, 'Олена', 'Тарас'), T0)`, а `opens the first question with a deadline` лишається з тими самими очікуваннями (`startedAt: T0`, `endsAt: T0 + 20_000`). Тести `requires at least one player` і `cannot be called twice` викликають `start(…)` без `T0`.

  До імпортів `game.rounds.test.ts` додати `resume`, `blitzRound`.

  У `apps/server/src/recorder.test.ts` новий тест `records a game ended on the first intro without answers` (за зразком `saves the game and its players when it starts`): `const ctx = await setup(); ctx.host('start'); ctx.host('end');`, далі `const { games, answers } = await ctx.saved();` — `games` має один рядок `toMatchObject({ status: 'finished', questionsPlayed: 0, plays: [] })`, `answers` дорівнює `[]`. До зміни `start` тест падає на `questionsPlayed`/`plays`, бо однораундова гра відкривала запитання. Тест `saves answers and scores once a question is closed…` після вставки `ctx.host('next')` має дочекатися `await ctx.recorder.idle()` до `vi.spyOn`, як і зараз після старту.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine apps/server/src/recorder.test.ts`. Очікується FAIL: нові тести падають (у тому числі на типах через `start` з одним аргументом).

- [ ] **Step 3: Implement** `start(state: GameState): Result` у `game.ts`: перевірки фази й гравців як зараз, далі `return ok({ ...enterRound({ ...state, roundIndex: 0 }), phase: 'intro' });`. Коментар над функцією: «Кожна гра починається із заставки першого раунду; перше запитання відкриває `next`.» `manager.ts`: `return this.apply(room, start(state));`. Додати `startRound` у `testing/helpers.ts` (імпорт `next`, `start`, `type Rng` з `../game`).

- [ ] **Step 4: Fix the callers.** `pnpm typecheck` покаже всі виклики `start(x, now[, rng])`. Правило для кожного:
  - вікторина з одним класичним або бліц-раундом і тест далі чекає запитання → `startRound(x, now[, rng])`;
  - поле, фінал або кілька раундів (тест уже чекає `intro` і сам викликає `next`) → просто `start(x)`;
  - `rng` для перемішування (`order`, `match`, `shuffleOptions`) переходить у `startRound` / `next`, а не губиться.

  Потім `pnpm vitest run --maxWorkers=2 apps/server`. У серверних тестах, де однораундова класична чи бліц-вікторина після `start` чекає запитання (`manager.test.ts`, `socket.test.ts`, `history.test.ts`, `recorder.test.ts`, `profiles.test.ts`, `games.test.ts`), одразу після старту додати `host(room, { type: 'next' })` або `send(host, 'host:next')` у той самий момент фейкового часу. Очікування балів, часу, дедлайнів і рядків історії не змінювати. Якщо тест падає з іншої причини, ніж «чекав запитання, а там заставка», зупинитися й розібратися. `app.test.ts` (`409 when the game has already started`) і `testing/final-game.ts` мають пройти без змін.

- [ ] **Step 5: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/engine apps/server/src
git commit -m "feat(engine): every game opens with the intro of its first round"
```

---

### Задача 2. Заставка вікторини з одним раундом без «Раунд 1 з 1»

**Files:**
- Modify: `apps/web/src/screens/StageScreen.tsx` (`Intro`), `apps/web/src/screens/PlayerScreen.tsx` (гілка `phase === 'intro'`), `apps/web/src/screens/HostScreen.tsx` (рядок фази й панель `intro`)
- Test: `apps/web/src/screens/StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `HostScreen.test.tsx`

**Interfaces:**
- Consumes: `RoundInfo` (`index`, `total`, `brief`, `description`) без змін.

- [ ] **Step 1: Write the failing tests** (по одному на екран, у `describe` з заставками раунду, з літералом `RoundInfo` класичного раунду `{ index: 0, total: 1, title: '', type: 'classic', partial: false, description: '', brief: { ...emptyBrief('classic'), speedBonus: true } }`):
  - `StageScreen`: `the intro of a one-round quiz shows the rules without a round counter` — є `heading` «Раунд 1», є «Відповідають усі: бали отримує кожен, хто відповів правильно.», `queryByText('Раунд 1 з 1')` дорівнює `null`. Для `total: 2` «Раунд 1 з 2» видно (наявний тест або новий рядок).
  - `PlayerScreen`: `the intro of a one-round quiz has no round counter` — ті самі перевірки.
  - `HostScreen`: `the intro of a one-round quiz has no round counter` — `queryByText(/Раунд 1 з 1/)` дорівнює `null`, кнопка «Почати раунд» є, пояснення є.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens`. Очікується FAIL.

- [ ] **Step 3: Implement.** У чотирьох місцях, де виводиться `t('roundOf', …)` на заставці (сцена `Intro`, телефон, панель пульта, рядок фази пульта для `intro`/`round_end`), показувати його лише при `round.total > 1`. Інших змін розмітки немає.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens
git commit -m "fix(web): no 'round 1 of 1' on the intro of a one-round quiz"
```

---

### Задача 3. Редактор поля: «Прибрати запитання» у сітці з підказкою мінімуму

**Files:**
- Modify: `apps/web/src/editor/BoardEditor.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/editor/QuizEditor.test.tsx` (блок з `addBoard`)

**Interfaces:**
- Consumes: `LIMITS.minCategoryQuestions`, `LIMITS.maxCategoryQuestions` з `@quiz/shared`; наявні `removeCell`, `boardRemoveCell`, `boardRemoveCellConfirm`.

**Тексти (`i18n.ts`, точно, поруч із `boardRemoveCell`):**
```ts
boardCellMinHint: 'Щонайменше {min} запитання в категорії',
```

- [ ] **Step 1: Write the failing tests.** У `board limits show in the editor` замінити `expect(screen.queryByRole('button', { name: 'Прибрати запитання' })).toBeNull();` на перевірку вимкненої кнопки й підказки; останній рядок тесту (після семи «+ Запитання») — на `expect(removeButton().disabled).toBe(false)`. Новий тест:

```ts
const removeButton = () => screen.getByRole('button', { name: 'Прибрати запитання' }) as HTMLButtonElement;
const column = (n: number) => screen.getAllByRole('button', { name: new RegExp(`^Категорія ${n}, клітинка \\d+:`) });

it('deletes a cell right from the grid and explains the minimum', () => {
  open();
  addBoard();
  // Одна кнопка на все поле, у стовпці вибраної клітинки, і вона вимкнена на мінімумі.
  expect(screen.getAllByRole('button', { name: 'Прибрати запитання' })).toHaveLength(1);
  expect(removeButton().disabled).toBe(true);
  const hint = screen.getByText('Щонайменше 3 запитання в категорії');
  expect(removeButton().getAttribute('aria-describedby')).toBe(hint.id);
  expect(removeButton().closest('.board-column')).toBe(cell(1, 1).closest('.board-column'));

  fireEvent.click(screen.getAllByRole('button', { name: '+ Запитання' })[1]);
  expect(removeButton().closest('.board-column')).toBe(cell(2, 4).closest('.board-column'));
  expect(removeButton().disabled).toBe(false);
  expect(screen.queryByText('Щонайменше 3 запитання в категорії')).toBeNull();

  // Запитання з текстом прибирається лише після підтвердження.
  fill('Текст запитання', 'Питання?');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  click('Прибрати запитання');
  expect(column(2)).toHaveLength(4);
  click('Прибрати запитання');
  expect(confirm).toHaveBeenCalledWith('Прибрати запитання разом із його текстом?');
  expect(column(2)).toHaveLength(3);
  expect(cell(2, 3).getAttribute('aria-current')).toBe('true');
  expect(removeButton().disabled).toBe(true);
  // У панелі клітинки кнопки видалення більше немає.
  expect(screen.getByRole('region', { name: /^Клітинка/ }).querySelector('.btn-danger')).toBeNull();
});
```

  Назву регіону панелі взяти з `boardCellPanel` в `i18n.ts` (якщо вона починається не з «Клітинка», підставити її початок). `removes a category and a cell` має пройти без змін.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/editor`. Очікується FAIL.

- [ ] **Step 3: Implement** у `BoardEditor.tsx`:
  - `const hintId = useId();` і `const atMin = cells.length <= LIMITS.minCategoryQuestions;`;
  - у `board-column`, після кнопки «+ Запитання», лише для `columnIndex === category`: `<button type="button" className="btn btn-small btn-danger" disabled={atMin} aria-describedby={atMin ? hintId : undefined} onClick={removeCell}>{t('boardRemoveCell')}</button>` і при `atMin` `<p id={hintId} className="meta board-edit-hint">{t('boardCellMinHint', { min: LIMITS.minCategoryQuestions })}</p>`;
  - прибрати кнопку `boardRemoveCell` з `.toolbar` панелі;
  - оновити JSDoc компонента: під стовпцем вибраної клітинки кнопки «+ Запитання» і «Прибрати запитання».
  - `styles.css`: `.board-edit-hint { margin: 0; font-size: 0.8125rem; line-height: 1.3; }` (колір від `.meta`, тобто `--dim`).

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): remove a board question right from the grid; explain the minimum"
```

---

### Задача 4. Наскрізні сценарії: перша заставка й видалення клітинки

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–3. Допоміжні функції файлу: `click`, `field`, `shot`, `expectNoSideScroll`, `exact`.

- [ ] **Step 1: «Почати раунд» після «Почати гру»** у сценаріях з одним класичним або бліц-раундом: `scenario()`, `blitzGame()`, `videoGame()`, `menuProfileFriends()`. У `twoRounds()`, `boardGame()`, `mixedBoard()`, `finalGame()` крок уже є, їх не чіпати.
  - `scenario()`: перед «Почати раунд» сцена показує «Відповідають усі: бали отримує кожен, хто відповів правильно.», а `stage.getByText('Раунд 1 з 1')` має `count() === 0`.
  - `blitzGame()`: перед «Почати раунд» сцена, телефон Анни (390×844) і пульт показують «Бали отримує лише той, хто першим правильно відповість.» і рядок штрафу. Кадри `blitz-intro-stage`, `blitz-intro-host`; `expectNoSideScroll(boris, 'blitz-intro-phone-360')`.

- [ ] **Step 2: Видалення клітинки в `boardGame()`**, після «Застосувати» й до заповнення категорій (вибрана клітинка 1 категорії 1):
  1. `const remove = host.getByRole('button', { name: 'Прибрати запитання', ...exact });` `expect(await remove.isDisabled()).toBe(true);` `await host.getByText('Щонайменше 3 запитання в категорії').waitFor();`
  2. `await host.getByRole('button', { name: '+ Запитання', ...exact }).first().click();` `expect(await remove.isDisabled()).toBe(false);` кадр `editor-cell-remove`.
  3. `await remove.click();` (запитання порожнє, підтвердження немає), далі `expect(await host.getByRole('button', { name: /^Категорія 1, клітинка \d+:/ }).count()).toBe(3)` і `remove` знову вимкнена.
  Поле лишається 3×3, решта сценарію без змін.

- [ ] **Step 3: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв. Потім той самий запуск з `E2E_SHOTS=1` і перегляд кадрів у `apps/server/e2e/artifacts/shots`: на першій заставці бліцу назва раунду й пояснення читаються на сцені й телефоні 360 px без накладань; у редакторі поля кнопка «Прибрати запитання» стоїть під «+ Запитання» вибраного стовпця, а підказка вміщується в ширину стовпця (9.5rem) без горизонтальної прокрутки.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts
git commit -m "test: first-round intro and removing a board question end-to-end"
```

Після фінальної рецензії гілку злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`.
