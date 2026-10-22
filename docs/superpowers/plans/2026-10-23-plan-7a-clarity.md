# План 7a: зручність та інформативність

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** вісім правок після другої гри (розділ 3 специфікації, пункти 3.1–3.8):
1. Поле більше на сцені, телефоні й пульті. Назви категорій переносяться на кілька рядків.
2. Заставка раунду показує кількість запитань і час на кожне. Під час запитання видно «Запитання 3 з 10 · лишилося 7» і таймер «45 / 60 с» зі смужкою.
3. Ведучий бачить той самий таймер, зі станами «Пауза» й «Чекає рішення ведучого».
4. Клітинки пофарбовані за видом (звичайна, бліц, уголос), мають позначки ×2/×3 і «−всім». Поруч є легенда лише з тих видів, що є на полі.
5. Коли відповідає одна людина, варіанти бачать усі й завжди. Ведучий може позначити варіант, названий уголос. Вердикт ≈3 с мигає зеленим або червоним.
6. Маска закриває назву ролика YouTube до розкриття.
7. Запитання «на порядок» мають необов'язкові підписи «що зверху» і «що знизу».
8. Варіанти single/multi можуть бути картинками.

**Архітектура:**
- **Поле для всіх (`shared`, `engine`).** `BoardCellView` отримує `mark`, `kind`, `answerMode` і `penalty` без `null`. `boardInfo` більше не ховає їх від сцени й гравців (специфікація 3.4: вид клітинки бачать усі, формат запитання ні). Пульт отримує те саме поле.
- **Нові поля зрізу (`shared`, `engine`).**
  - `RoundInfo.times` — найменший і найбільший час запитань раунду з таймером.
  - `BaseView.limitMs` — повний час поточного запитання з «±15 с».
  - `BaseView.held` — годинник утримано, бо відповідь чекає на ведучого.
  Кількість запитань раунду вже є (`BaseView.total`).
- **Позначка ведучого (`shared`, `engine`, `server`).**
  - Нова подія `host:name` з `{ answer: Answer | null }` і функція рушія `nameAnswer`.
  - Позначка лежить у `BoardPlay.named` і діє лише на звичайній усній клітинці.
  - `spotlightOf` показує позначку помаранчевою, а на розкритті додає оцінку ведучого.
  - На бали й записи позначка не впливає.
- **Варіанти для всіх і миготіння (`web`).**
  - `SpotlightChoices` малює варіанти й без відповіді. Для text/numeric він показує місце, де з'явиться відповідь, а для order — список.
  - Хук `useVerdictBlink` стоїть на рівні екрана: екран лишається змонтованим, коли етап змінюється з `question` на `reveal`.
  - Хук передає `blink` у `SpotlightChoices`, а клас `is-blinking` вмикає анімацію лише за `prefers-reduced-motion: no-preference`.
- **Маска відео (`web`).** `YouTubePlayer` отримує `masked`. Поверх верхньої смуги плеєра лежить блок, що ловить кліки. Сам `iframe` не перемонтовується, тож після розкриття відео грає далі.
- **Порядок (`shared`).** Запитання `order` отримує `topLabel?` і `bottomLabel?` (до 40 символів). `PublicQuestion.orderLabels` дорівнює `{ top, bottom }` для order і `null` для інших типів.
- **Варіанти-картинки (`shared`).**
  - Варіант single/multi отримує `imageUrl?`. Текст варіанта стає необов'язковим, але хоча б одне з двох обов'язкове.
  - Пари й порядок картинок не мають: вони користуються старою схемою `choice`.
  - Де потрібен текст, `format.ts` підставляє «Картинка Б».

**Технології:** TypeScript, zod 4, vitest, Fastify + Socket.IO + Drizzle (PGlite у тестах), React + Vite, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-23-after-second-game-design.md`, розділ 3 (частина 7a). Анти-цілі з розділу 2 обов'язкові. Частини 7b–7g цей план не чіпає.

**Рішення плану там, де специфікація мовчить:**
- **Позначки й вид клітинок бачать усі від початку раунду.** Раніше сцена й гравці бачили їх лише після вибору (план 6f; e2e `mixedBoard` це перевіряє). Специфікація 3.4 це прямо змінює: колір і позначки ×2/×3 і «−всім» видно на полі. Назва в `cellAria` («Міста, 100») не змінюється, на неї спираються e2e.
- **Колір = вигляд клітинки:** `kind === 'blitz'` → бліц; інакше `answerMode === 'voice'` → уголос; інакше звичайна. Усний бліц має колір бліцу й значок 🎤. Текст «Бліц» у клітинці лишається, щоб вид розрізняли й без кольору.
- **Легенда** показує види з усіх клітинок поля, зокрема зіграних. Так вона не стрибає, поки поле порожніє.
- **Прокрутка поля:** на ширині до 599 px стовпець не вужчий за 4,5 rem. Тому 6–8 категорій прокручуються всередині `.gb-scroll`, а сторінка ні. Від 600 px і на сцені стовпці стискаються без прокрутки.
- **Рядок назв однакової висоти:** `.gb` задає `grid-template-rows: auto repeat(N, висота)`, а стовпці беруть рядки через `subgrid`. Найдовша назва задає висоту рядка назв, і клітинки стоять рівно.
- **Факти раунду** («10 запитань · 30–60 с на кожне») бачать сцена, телефон і пульт на заставці. У фіналі їх немає: там одне запитання, а заставка про ставку. Час рахується лише із запитань з таймером. Якщо таймера немає в жодного, видно «без таймера».
- **Рядок запитання:** `Запитання 3 з 10 · лишилося 7 · Раунд 2`. На полі видно `Клітинка 5 з 24 · лишилося 19`. На останньому: «останнє» / «остання». У фіналі «лишилося» не показується. Роздільник перед «Раунд N» змінюється з `, ` на ` · `.
- **Таймер:** `aria-label` лишається числом секунд, бо e2e-функція `seconds()` читає саме його. Повний час береться з `view.limitMs`, тож «+15 с» збільшує і його.
- **Позначка ведучого** діє лише на звичайній усній клітинці й для single, multi та boolean. На усній бліц-клітинці її немає: бліц переробляє 7b. Позначку можна ставити на етапах `question` і `locked`. Повторний дотик до позначеного варіанта single/boolean знімає позначку. У multi дотик перемикає варіант, а порожній вибір знімає позначку.
- **Вердикт усної клітинки видно лише на розкритті.** Оцінка ведучого закриває запитання (`locked`), а `locked`, як і раніше, вердикту не показує. Тому позначка на `locked` лишається помаранчевою, а мигає на `reveal`. Інакше вердикт з'явився б на сцені раніше за розкриття.
- **Миготіння:** 3 с (`BLINK_MS = 3000`), шість циклів по 0,5 с. Миготіння вмикається, коли у відповіді одного гравця з'являється вердикт (ключ `гравець|оцінка|відповідь` змінився на ключ з оцінкою). Під час першого показу екрана (вхід, перепідключення) миготіння немає.
- **Маска:** чорна смуга заввишки `max(3.5rem, 18%)` з підписом «Назву відео приховано до відповіді». Що ще робимо:
  - параметр `iv_load_policy=3` вимикає анотації;
  - `fs=0` і відсутній `allowFullScreen` прибирають повноекранний режим: у ньому маска лишилася б поза плеєром.
  Обмеження, які лишаються:
  - кінцевий екран і панель «Більше відео» на паузі показують інші ролики;
  - логотип YouTube у смузі керування відкриває сторінку ролика в новій вкладці.
  Закрити їх, не заблокувавши керування, не можна. Обидва записати у звіт.
  Маску знімає розкриття. На пульті маска теж є, до `reveal`.
- **Підписи порядку в розкритті:** `Тихий → Атлантичний → Індійський → Північний Льодовитий (зверху — Найбільший, знизу — Найменший)`. Порожній підпис пропускається.
- **«Картинка Б»:**
  - підпис бере літеру показу (`shownChoices`, `pickedText`) або літеру автора (`choicesOf` для історії й пульта);
  - у `correctText` варіант без тексту виглядає як «Б. картинка»;
  - якщо картинка варіанта не завантажилася, телефон і сцена показують «Картинка Б» замість рамки.
- **Демо:** підписи отримують усі запитання «на порядок» у `demo-quiz.ts`, `movie-quiz.ts`, `erudite-quiz.ts` і `party-quiz.ts` (див. задачу 7). Картинок у демо немає: їм потрібне завантаження у сховище.

## Глобальні обмеження

- Старі вікторини, ігри, історія й профіль поводяться як зараз. Що лишається як було:
  - варіант без `imageUrl` і order без підписів проходять `quizSchema`;
  - зіграні ігри відкриваються.
  Міграцій немає: нові поля схеми `.optional()`.
- Наявні тести лишаються зеленими без зміни очікувань, окрім механічних змін, названих у задачах:
  - нові обов'язкові поля в літералах зрізів у `apps/web/src/screens/*.test.tsx`;
  - очікування прихованих позначок у `views.test.ts`;
  - роздільник « · » у рядку запитання;
  - порожній `SpotlightChoices` без відповіді.
- Правильна відповідь не потрапляє на сцену чи телефон раніше розкриття. Зокрема:
  - через вид клітинки (у `BoardCellView` немає типу, тексту й варіантів запитання);
  - через позначку ведучого (на `question`/`locked` у неї `grade: null`);
  - через назву відео.
- Рушій чистий: `now` і `rng` передаються аргументами, без мережі й таймерів.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`. Нові кольори — токени в `:root` у `styles.css`. Тема лише темна.
- Поля вводу — в обгортці `label.field` зі шрифтом ≥ 16 px (раніше вже траплялися нестилізовані поля).
- Розкладка працює на ширині 375 px без горизонтальної прокрутки сторінки. Поле на 8 категорій прокручується лише всередині `.gb-scroll`.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2`. Саме `--maxWorkers=2`, а не `pnpm test`: паралельні робітники PGlite падають на цій машині.
- Наскрізні тести: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Кадри знімаються з `E2E_SHOTS=1` у `apps/server/e2e/artifacts/shots`.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (проєкт тестовий).

## Порядок збирання

- Задача 1 додає поля зрізу (`BoardCellView` без `null`, `RoundInfo.times`, `limitMs`, `held`) і механічно оновлює літерали веб-тестів.
- Задачі 2 і 3 (веб) спираються на 1 і не залежать одна від одної.
- Задача 4 (позначка ведучого: рушій і сервер) незалежна від 2–3. Задача 5 (веб для 3.5) спирається на 4.
- Задача 6 (маска) незалежна.
- Задача 7 (порядок) спирається на 5: підписи йдуть і в список очікування `SpotlightChoices`. Задача 8 (картинки) спирається на 5.
- Задача 9 (e2e) іде останньою.
- **Наскрізні сценарії між задачами 1 і 9 не запускаються.** Задача 1 свідомо ламає дві перевірки `mixedBoard` (`.gb-kind` на сцені й телефонах до вибору). Задача 9 їх оновлює. Per-task перевірка — лише `pnpm typecheck` і `pnpm vitest run --maxWorkers=2`.

## На що дивитися рецензентові

1. **Спойлер через поле чи позначку.** Що перевіряється:
   - `JSON.stringify` зрізу сцени й гравця на етапі `board` не містить тексту, типу (`"type":"single"`) чи `correctId` жодної клітинки;
   - клітинка має рівно ключі `id, price, played, mark, kind, answerMode, penalty`;
   - позначка ведучого до `reveal` має `grade: null`.
   Тести: задача 1, `every role sees each cell's mark, kind, answer mode and penalty but never its question`; задача 4, `the host names the option a voice player said: orange for everyone, the verdict only on reveal`.
2. **Стара вікторина й порожній варіант.** Варіант `{ id, text }` без картинки й order без підписів проходять. Відмова: варіант з порожнім текстом без картинки, підпис довший за 40, картинка не з `/uploads/`. Тести: задача 7, `order labels are optional and at most 40 characters`; задача 8, `an option may be a picture, then its text is optional, but never both empty`.
3. **Телефон 375 px з 8 категоріями й довгими назвами.** Поле прокручується всередині блоку (`.gb-scroll` має `scrollWidth > clientWidth`), сторінка — ні. Назви переносяться, а не обрізаються. Тест: задача 9, `expectNoSideScroll(olya, 'board-legend-phone-375')` і перевірка `.gb-scroll`.
4. **Миготіння при зміні етапу й під час першого показу.** Перехід `question → reveal` на телефоні, що не відповідав, мигає, хоча гілка JSX змінюється. Перший показ екрана вже з вердиктом не мигає. За `prefers-reduced-motion: reduce` анімації немає. Тести: задача 5, `blinks when a verdict arrives, not on the first render` і `the phone of another player blinks the verdict when the question turns to reveal`; задача 9, `emulateMedia({ reducedMotion: 'reduce' })`.
5. **Таймер після «+15 с», під час утримання й без таймера.** Повний час росте з «+15 с». Під час утримання видно «Чекає рішення ведучого», а цифри стоять. Запитання з відео не має таймера ніде, зокрема на пульті. Тести: задача 1, `the view carries the full time limit with ±15 s and whether the clock is held`; задача 3, `the host sees the timer with the full time and its state` і `no timer for a video question on the host`.

---

### Задача 1. Поле, факти раунду й повний час у зрізах

**Files:**
- Modify: `packages/shared/src/views.ts` (`BoardCellView`, `RoundInfo`, `BaseView`, коментар `HostView.board`)
- Modify: `packages/engine/src/views.ts` (`boardInfo`, `hostBoard`, `roundInfo`, `base`)
- Modify: `apps/web/src/screens/Board.tsx` (лише прибрати перевірку `cell.mark !== null`)
- Modify (механічно): `apps/web/src/screens/StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `HostScreen.test.tsx`
- Test: `packages/engine/src/views.test.ts`

**Interfaces:**
- Produces (`packages/shared/src/views.ts`):
  ```ts
  export interface BoardCellView {
    id: string;
    price: number;
    played: boolean;
    /** Позначку, вид, спосіб відповіді й штраф видно всім від початку раунду: формат запитання з них не випливає. */
    mark: CellMark;
    kind: CellKind;
    /** Спосіб клітинки або, якщо його немає, раунду (cellAnswerMode). */
    answerMode: AnswerMode;
    penalty: CellPenalty;
  }
  // RoundInfo:
  /** Найменший і найбільший час (с) запитань раунду з таймером; null — таймера немає в жодного. */
  times: { min: number; max: number } | null;
  // BaseView:
  /** Повний час поточного запитання з «±15 с», мс; лише на етапі question і з таймером, інакше null. */
  limitMs: number | null;
  /** Годинник стоїть, бо відповідь чекає на рішення ведучого. */
  held: boolean;
  ```
- Produces (`packages/engine/src/views.ts`): `boardInfo(state: GameState): BoardInfo | null` без параметра `showAll`; `hostBoard` бере його ж.

- [ ] **Step 1: Write the failing tests** у `views.test.ts` (поруч із наявними тестами поля; `onBoard`, `picked`, `q`, `boardRound` уже є).
  - Тест `stage and player views never carry hidden marks or cell questions` замінити на:
    ```ts
    it("every role sees each cell's mark, kind, answer mode and penalty but never its question", () => {
      const state = onBoard();
      for (const view of [stageView(state), playerView(state, 'p2')!, hostView(state)]) {
        const cells = view.board!.categories.flatMap((c) => c.cells);
        expect(view.board?.categories[0].cells[1].mark).toBe('x2');
        expect(view.board?.categories[1].cells[2].mark).toBe('x3');
        for (const cell of cells) expect(Object.keys(cell).sort()).toEqual(['answerMode', 'id', 'kind', 'mark', 'penalty', 'played', 'price']);
      }
      for (const json of [JSON.stringify(stageView(state)), JSON.stringify(playerView(state, 'p2'))]) {
        expect(json).not.toContain(single.text);
        expect(json).not.toContain('correctId');
        expect(json).not.toContain('"type":"single"');
      }
    });
    ```
  - `a chosen cell shows its mark to everyone and stays shown`: рядок `categories[1].cells.every((cell) => cell.mark === null)` прибрати. Останнє очікування `toMatchObject({ mark: null, played: false })` замінити на `{ mark: 'none', played: false }`.
  - Тест `players see a cell kind and answer mode only after the cell opens` замінити на `players see every cell kind, answer mode and penalty from the start`. Поле з тими самими `cells`, `answerMode: 'phone'` у раунді. До вибору:
    - для сцени й гравця `categories[0].cells[0]` дорівнює `toMatchObject({ kind: 'blitz', answerMode: 'voice', penalty: 'all' })`;
    - `cells[1]` дорівнює `{ kind: 'normal', answerMode: 'phone', penalty: 'none' }`: власного способу немає, тож береться спосіб раунду.
    Після `pickCell` перевірка `board.cell` як була.
  - Новий тест:
    ```ts
    it('the round info carries the time range of timed questions', () => {
      const quiz = makeRoundsQuiz([
        classicRound('r1', [withId(single, 'a'), { ...withId(multi, 'b'), timeLimit: 30 }, withVideo(withId(bool, 'c'))]),
        classicRound('r2', [withVideo(withId(single, 'd'))]),
      ]);
      const state = must(start(lobbyWith(quiz, 'Анна')));
      expect(stageView(state).round?.times).toEqual({ min: 20, max: 30 });
      expect(stageView(onBoard()).round?.times).toEqual({ min: 20, max: 20 });
      // Другий раунд лише з відео: стан на його заставці досягти так само, як у наявних тестах раундів.
      expect(stageView(secondIntro).round?.times).toBeNull();
    });
    ```
  - Новий тест:
    ```ts
    it('the view carries the full time limit with ±15 s and whether the clock is held', () => {
      const state = open(); // класичне запитання single на 20 с, як у наявних тестах
      expect(stageView(state)).toMatchObject({ limitMs: 20_000, held: false });
      expect(stageView(must(adjustTime(state, 15, 1000))).limitMs).toBe(35_000);
      const pending = must(submitAnswer(picked('c11'), 'p1', { type: 'single', optionId: 'b' }, 0));
      expect(stageView(pending)).toMatchObject({ held: true });
      expect(playerView(pending, 'p2')?.held).toBe(true);
      expect(stageView(must(lock(state))).limitMs).toBeNull();
    });
    ```
    Назви допоміжних функцій (`open`, `picked`, `adjustTime` з `./timing`) узяти ті, що вже є у файлі або в рушії. `picked` тут — версія з блоку поля.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/views.test.ts`. Очікується FAIL: `mark: null`, `times` undefined.

- [ ] **Step 3: Implement.**
  - `boardInfo(state)`: кожна клітинка `{ id, price, played, mark, kind, answerMode: cellAnswerMode(round, cell), penalty }`. Прибрати `revealed` і `markOf`. `hostBoard` викликає `boardInfo(state)`.
  - `roundInfo`: `times` з `roundQuestions(round).filter(isTimed).map((q) => q.timeLimit)`. Порожньо → `null`, інакше `{ min, max }`.
  - `base`: `limitMs` дорівнює `limitMsOf(play)`, коли `state.phase === 'question'` і є поточне запитання, інакше `null`. `held: state.heldAt !== null`.
  - Оновити коментарі `BoardCellView`, `BoardInfo.cell`, `HostView.board` («Як у BaseView»).
  - `Board.tsx`: умова `cell.mark !== null && cell.mark !== 'none'` стає `cell.mark !== 'none'`.

- [ ] **Step 4: Mechanical.** У `StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `HostScreen.test.tsx`:
  - кожна фабрика зрізу (шукати `answeredCount:`) отримує `limitMs: null, held: false`;
  - кожен літерал `RoundInfo` (шукати `brief:`) отримує `times: null`;
  - кожен літерал клітинки `{ id, price, played, mark, kind }` отримує `mark` і `kind` без `null` (`'none'` / `'normal'`, а там, де тест мав `mark: 'x2'`, лишити `'x2'`), а також `answerMode: 'phone', penalty: 'none'`.
  Якщо наявний веб-тест перевіряв, що сцена чи гравець не бачать виду клітинки, змінити очікування на «бачать» і назвати це в коміті. Більше нічого в цих файлах не змінювати.

- [ ] **Step 5: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 6: Commit**

```bash
git add packages apps/web/src/screens
git commit -m "feat(engine): everyone sees the board cell kinds; round times, full limit and hold in the views"
```

---

### Задача 2. Більше поле, кольори видів і легенда

**Files:**
- Modify: `apps/web/src/screens/Board.tsx`, `apps/web/src/screens/StageScreen.tsx` (`BoardStage`), `apps/web/src/screens/PlayerScreen.tsx` (етап `board`), `apps/web/src/screens/HostScreen.tsx` (етап `board`), `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Create: `apps/web/src/screens/Board.test.tsx`
- Test: `apps/web/src/screens/StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `HostScreen.test.tsx`

**Interfaces:**
- Consumes: `BoardCellView` із задачі 1.
- Produces (`Board.tsx`):
  ```ts
  export type CellLook = 'normal' | 'blitz' | 'voice';
  /** Колір клітинки: бліц, інакше уголос, інакше звичайна. */
  export function cellLook(cell: Pick<BoardCellView, 'kind' | 'answerMode'>): CellLook;
  /** Легенда «колір → вид» лише з тих видів і позначок, що є на полі (зокрема серед зіграних клітинок). */
  export function BoardLegend(props: { board: BoardInfo }): JSX.Element;
  ```

**Тексти (`i18n.ts`, точно):**
```ts
legendTitle: 'Види клітинок',
legendNormal: 'Звичайна',
legendBlitz: 'Бліц: відповідає перший, хто натисне',
legendVoice: 'Відповідь уголос',
legendBlitzVoice: '🎤 Бліц уголос',
legendX2: '×2 — подвійна ціна',
legendX3: '×3 — потрійна ціна',
legendPenaltyAll: '−всім: мінус для всіх, хто не вгадав',
cellPenaltyBadge: '−всім',
cellVoiceBadge: '🎤',
```

**Розмітка поля:**
```tsx
<div className="gb-scroll">
  <div className="gb" style={{ gridTemplateColumns: `repeat(${n}, minmax(var(--gb-col-min), 1fr))`, gridTemplateRows: `auto repeat(${rows}, var(--gb-cell-h))` }}>
    {/* rows — найбільша кількість клітинок у категорії */}
    <div className="gb-col" style={{ gridRow: `span ${rows + 1}` }}>
      <h3 className="gb-title">…</h3>
      {/* незіграна: className={`gb-cell is-${cellLook(cell)}`} (+ is-open для кнопки); зіграна — як зараз, без кольору й значків */}
    </div>
  </div>
</div>
```
Незіграна клітинка всередині містить:
- `.price`;
- `.gb-kind` «Бліц» для `kind === 'blitz'`, як зараз;
- `.gb-mark` для ×2/×3;
- `.gb-penalty` «−всім» для `penalty === 'all'`;
- `.gb-voice` «🎤» для усного бліцу.

`aria-label` кнопки не змінюється (`cellAria`).

Легенда: `<ul className="gb-legend" aria-label={t('legendTitle')}>`. Кожен `li` має `<span className={`gb-swatch is-${look}`} aria-hidden="true" />` і текст. Позначки показуються текстом без зразка. Порядок пунктів: звичайна, бліц, уголос, бліц уголос, ×2, ×3, −всім.

**Стилі (`styles.css`):**
- `:root`: `--voice: #9b8cff; --cell-blitz: rgb(255 179 0 / 0.2); --cell-voice: rgb(155 140 255 / 0.22);`.
- `.gb-scroll { overflow-x: auto; max-width: 100%; overscroll-behavior-x: contain; }`.
- `.gb { --gb-col-min: 4.5rem; --gb-cell-h: 3.25rem; }`.
- `.gb-col { display: grid; grid-template-rows: subgrid; }`. Прибрати фіксовані `grid-template-rows` і `grid-auto-rows` у `.gb-col`.
- `.gb-title`:
  - прибрати `overflow: hidden`;
  - `font-size: 0.875rem; line-height: 1.15; align-self: end`;
  - перенос як зараз (`hyphens: auto; overflow-wrap: anywhere`).
- `.gb-cell { font-size: 1.0625rem; }`. Кольори:
  - `.is-blitz` — фон `var(--cell-blitz)`, рамка `var(--amber)`;
  - `.is-voice` — фон `var(--cell-voice)`, рамка `var(--voice)`;
  - `.is-normal` — як зараз.
- `.gb-mark` — плашка: фон `var(--stage)`, колір `var(--amber)`, `font-size: 0.75rem`, `padding: 0.0625rem 0.25rem`, `border-radius: 0.25rem`.
- `.gb-penalty` — у лівому нижньому куті, колір `var(--signal)`, `font-size: 0.6875rem`, вага 700.
- `.gb-voice` — у правому нижньому куті.
- `@media (min-width: 600px)`: `.gb { --gb-col-min: 0px; --gb-cell-h: 3.75rem; }`, `.gb-title { font-size: 1rem }`, `.gb-cell { font-size: 1.25rem }`.
- Пульт: `.host .gb-title { font-size: 1rem }`, `.host .gb-cell { font-size: 1.25rem }`.
- Сцена:
  - `.stage .gb { --gb-col-min: 0px; --gb-cell-h: clamp(4.5rem, 9vh, 7rem); }`;
  - `.stage .gb-title { font-size: clamp(1.25rem, 1.8vw, 2rem) }`;
  - `.stage .gb-cell { font-size: clamp(1.75rem, 3vw, 3rem) }`;
  - позначки на сцені `1.125rem`.
- `.gb-legend` — `display: flex; flex-wrap: wrap; gap: 0.375rem 1rem; list-style: none; padding: 0; margin: 0.75rem 0 0; font-size: 0.9375rem`. `.gb-swatch` — квадрат `1rem` з рамкою кольору виду. `.stage .gb-legend` — у стовпчик, `font-size: clamp(1rem, 1.4vw, 1.5rem)`.
- Сцена: `.board-with-legend { display: grid; grid-template-columns: minmax(0, 1fr) minmax(14rem, 18rem); gap: 2rem; align-items: start; }`. Підпис ходу займає весь рядок. При `max-width: 700px` один стовпчик.

- [ ] **Step 1: Write the failing tests.** `Board.test.tsx` (`// @vitest-environment jsdom`, фабрика `BoardInfo` у файлі):
  ```ts
  it('paints each open cell by its look and keeps the accessible name', () => {
    render(<Board board={board([
      cell('c1', { kind: 'normal', answerMode: 'phone' }),
      cell('c2', { kind: 'blitz', answerMode: 'phone', penalty: 'all', mark: 'x2' }),
      cell('c3', { kind: 'normal', answerMode: 'voice' }),
      cell('c4', { kind: 'blitz', answerMode: 'voice' }),
      cell('c5', { played: true, kind: 'blitz' }),
    ])} onPick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Міста, 100' }).className).toContain('is-normal');
    expect(screen.getByRole('button', { name: 'Міста, 200' }).className).toContain('is-blitz');
    expect(screen.getByRole('button', { name: 'Міста, 200' }).textContent).toContain('×2');
    expect(screen.getByRole('button', { name: 'Міста, 200' }).textContent).toContain('−всім');
    expect(screen.getByRole('button', { name: 'Міста, 300' }).className).toContain('is-voice');
    expect(screen.getByRole('button', { name: 'Міста, 400' }).textContent).toContain('🎤');
    expect(document.querySelector('.gb-cell.is-played')?.className).not.toContain('is-blitz');
  });
  it('the legend lists only the kinds and marks present on the board', () => {
    render(<BoardLegend board={board([cell('c1', {}), cell('c2', { kind: 'blitz', mark: 'x3' })])} />);
    const items = screen.getByRole('list', { name: 'Види клітинок' }).querySelectorAll('li');
    expect([...items].map((li) => li.textContent)).toEqual(['Звичайна', 'Бліц: відповідає перший, хто натисне', '×3 — потрійна ціна']);
  });
  it('wraps the grid in a scroll box and gives every column the title row plus all cell rows', () => {
    const { container } = render(<Board board={twoCategories /* 3 і 2 клітинки */} />);
    expect(container.querySelector('.gb-scroll > .gb')).not.toBeNull();
    expect((container.querySelector('.gb') as HTMLElement).style.gridTemplateRows).toBe('auto repeat(3, var(--gb-cell-h))');
    expect((container.querySelector('.gb-col') as HTMLElement).style.gridRow).toBe('span 4');
  });
  ```
  Тести екранів:
  - `StageScreen.test.tsx` — `the board stage shows the legend beside the board`: на етапі `board` є `getByRole('list', { name: 'Види клітинок' })` усередині `.board-with-legend`.
  - `PlayerScreen.test.tsx` — `the phone shows the legend under the board`.
  - `HostScreen.test.tsx` — `the host shows the legend under the board`.
  Під полем — легенда йде в DOM після `.gb-scroll`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web`. Очікується FAIL.

- [ ] **Step 3: Implement** `cellLook`, розмітку поля, `BoardLegend`, тексти й стилі. Показ легенди:
  - `StageScreen.tsx`, `BoardStage`: `<div className="stage-board board-with-legend">` з `<Board />` і `<aside className="board-aside"><BoardLegend board={board} /><Order board={board} /></aside>`;
  - `PlayerScreen.tsx`: після `<Board …>` на етапі `board`;
  - `HostScreen.tsx`: після `<Board …>` у панелі етапу `board`.
  Оновити JSDoc `Board`: кольори, прокрутка на вузькому екрані.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): a bigger board coloured by cell kind with a legend"
```

---

### Задача 3. Факти раунду, рядок запитання й таймер «45 / 60 с» у всіх, зокрема у ведучого

**Files:**
- Modify: `apps/web/src/format.ts` (`questionLabel`, нова `roundFacts`), `apps/web/src/live/Timer.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Modify: `apps/web/src/screens/StageScreen.tsx` (`Intro`, `Question`), `PlayerScreen.tsx` (`intro`, `question`), `HostScreen.tsx` (панель `intro`, ряд «±15 с»)
- Create: `apps/web/src/live/Timer.test.tsx`
- Test: `apps/web/src/format.test.ts`, `apps/web/src/screens/StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `HostScreen.test.tsx`

**Interfaces:**
- Consumes: `RoundInfo.times`, `BaseView.limitMs`, `BaseView.held` (задача 1).
- Produces:
  ```ts
  // format.ts
  /** «10 запитань · 30–60 с на кожне»; поле — клітинки; фінал — null. */
  export function roundFacts(round: RoundInfo, total: number): string | null;
  /** «Запитання 3 з 10 · лишилося 7 · Раунд 2»; поле — «Клітинка …»; у фіналі без «лишилося». */
  export function questionLabel(round: RoundInfo | null, index: number, total: number): string;
  // live/Timer.tsx
  export type TimerStatus = 'paused' | 'held' | null;
  export function timerStatus(view: { paused: boolean; held: boolean }): TimerStatus;
  export function Timer(props: {
    view: { endsAt: number | null; remainingMs: number | null };
    offsetMs: number;
    /** Повний час, мс; з ним видно «/ 60 с» і смужку. */
    total?: number | null;
    status?: TimerStatus;
  }): JSX.Element | null;
  ```

**Тексти (`i18n.ts`, точно):**
```ts
cellOf: 'Клітинка {index} з {total}',
leftCount: 'лишилося {count}',
lastQuestion: 'останнє',
lastCell: 'остання',
questionCount_one: '{count} запитання',
questionCount_few: '{count} запитання',
questionCount_many: '{count} запитань',
cellCount_one: '{count} клітинка',
cellCount_few: '{count} клітинки',
cellCount_many: '{count} клітинок',
timeEach: '{seconds} с на кожне',
timeRange: '{min}–{max} с на кожне',
timeEachCell: '{seconds} с на кожну',
timeRangeCell: '{min}–{max} с на кожну',
noTimer: 'без таймера',
timerOf: '/ {seconds} с',
timerPaused: 'Пауза',
timerHeld: 'Чекає рішення ведучого',
```

**Розмітка таймера:**
```tsx
<div className="timer" role="timer" aria-label={String(seconds)}>
  <span className="timer-flaps">{/* наявні .flap */}</span>
  {total != null && <span className="timer-total">{t('timerOf', { seconds: Math.round(total / 1000) })}</span>}
  {total != null && <span className="timer-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>}
  {status != null && <span className="timer-status">{t(status === 'paused' ? 'timerPaused' : 'timerHeld')}</span>}
</div>
```
`pct = min(100, max(0, seconds * 1000 / total * 100))`. Стилі:
- `.timer` стає `flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.5rem`.
- `.timer-total` — колір `var(--dim)`, шрифт `--display`.
- `.timer-bar` — `flex-basis: 100%; height: 0.375rem; border-radius: 999px; background: var(--line)`. Внутрішній блок — `background: var(--amber); transition: width 0.2s linear`, без transition за reduced motion.
- `.timer-status` — `flex-basis: 100%; color: var(--pending); font-size: 0.875rem`.
- `.round-facts` — `color: var(--amber); font-family: var(--display)`; на сцені `font-size: clamp(1.25rem, 2vw, 2rem)`.

- [ ] **Step 1: Write the failing tests.**
  `format.test.ts`:
  ```ts
  const info = (type: RoundInfo['type'], total = 1, times: RoundInfo['times'] = null): RoundInfo => ({
    index: 0, total, title: '', type, partial: false, description: '', brief: emptyBrief(type), times,
  });
  it('round facts: the count and the time per question', () => {
    expect(roundFacts(info('classic', 1, { min: 30, max: 60 }), 10)).toBe('10 запитань · 30–60 с на кожне');
    expect(roundFacts(info('blitz', 1, { min: 20, max: 20 }), 1)).toBe('1 запитання · 20 с на кожне');
    expect(roundFacts(info('classic', 1, null), 3)).toBe('3 запитання · без таймера');
    expect(roundFacts(info('board', 1, { min: 20, max: 20 }), 24)).toBe('24 клітинки · 20 с на кожну');
    expect(roundFacts(info('board', 1, { min: 20, max: 40 }), 25)).toBe('25 клітинок · 20–40 с на кожну');
    expect(roundFacts(info('final', 1, { min: 30, max: 30 }), 1)).toBeNull();
  });
  it('the question label says how many are left', () => {
    expect(questionLabel(info('classic'), 2, 10)).toBe('Запитання 3 з 10 · лишилося 7');
    expect(questionLabel(info('classic'), 9, 10)).toBe('Запитання 10 з 10 · останнє');
    expect(questionLabel(info('board'), 4, 24)).toBe('Клітинка 5 з 24 · лишилося 19');
    expect(questionLabel(info('board'), 23, 24)).toBe('Клітинка 24 з 24 · остання');
    expect(questionLabel({ ...info('classic', 3), index: 1 }, 1, 5)).toBe('Запитання 2 з 5 · лишилося 3 · Раунд 2');
    expect(questionLabel({ ...info('final', 3), index: 2 }, 0, 1)).toBe('Запитання 1 з 1 · Раунд 3');
    expect(questionLabel(null, 0, 3)).toBe('Запитання 1 з 3 · лишилося 2');
  });
  ```
  `Timer.test.tsx` (jsdom):
  - `shows the remaining and the full time with a bar`: `view={{ endsAt: null, remainingMs: 45_000 }}`, `total={60_000}`. Маємо `role="timer"` з `aria-label` «45», текст «/ 60 с», ширину смужки `75%`.
  - `without a total it looks as before`: немає `.timer-total` і `.timer-bar`.
  - `shows the paused and held states`: `status="held"` → «Чекає рішення ведучого»; `status="paused"` → «Пауза».
  - `timerStatus`: `{ paused: true, held: true }` → `'paused'`; `{ paused: false, held: true }` → `'held'`; обидва false → `null`.

  Екрани:
  - `StageScreen.test.tsx`: `the intro shows the round facts` — `intro`, `total: 10`, `times: { min: 30, max: 60 }` → «10 запитань · 30–60 с на кожне». На запитанні з `limitMs: 60_000, remainingMs: 45_000, endsAt: null, held: true` видно «/ 60 с» і «Чекає рішення ведучого».
  - Наявні очікування `'Запитання 1 з 3'` і `/Запитання 2 з 5/` оновити під новий рядок, механічно.
  - `PlayerScreen.test.tsx`: `the phone intro shows the round facts` і на запитанні поля «Клітинка 5 з 24 · лишилося 19». Наявне `/Запитання 2 з 4/` лишається (регулярний вираз).
  - `HostScreen.test.tsx`:
    - `the host sees the timer with the full time and its state` — запитання з `endsAt` у майбутньому й `limitMs: 30_000` дає `getByRole('timer')` і «/ 30 с». З `paused: true` видно «Пауза».
    - `no timer for a video question on the host` — `endsAt: null, remainingMs: null` дає `queryByRole('timer')` null.
    - `the host intro shows the round facts`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - `roundFacts`: `countText('questionCount' | 'cellCount', total, { count: total })`, далі `' · '` і час: `timeEach` / `timeRange` (у полі `…Cell`) або `noTimer`.
  - `questionLabel` — за прикладами з тестів.
  - `Timer` — за розміткою вище.
  - Показ фактів `<p className="round-facts">{facts}</p>` одразу після назви раунду (`h1`), перед `RoundBriefing`, коли `facts !== null`: `StageScreen` `Intro`, `PlayerScreen` гілка `intro`, `HostScreen` панель `intro`.
  - Таймери з `total={view.limitMs} status={timerStatus(view)}`: `StageScreen` `Question`, `PlayerScreen` `question-head`. Бліц-вікно й ланцюжок — без змін.
  - `HostScreen`: ряд «±15 с» (`timeShown`) отримує першим елементом `<Timer view={view} offsetMs={offsetMs} total={view.limitMs} status={timerStatus(view)} />` і клас `panel-actions host-time` (`align-items: center`).

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): round facts on the intro, questions left and a full-time timer, also for the host"
```

---

### Задача 4. Ведучий позначає названий уголос варіант (рушій, події, сервер)

**Files:**
- Modify: `packages/engine/src/game.ts` (`BoardPlay.named`), `packages/engine/src/board.ts` (`nameAnswer`), `packages/engine/src/index.ts` (експорт), `packages/engine/src/views.ts` (`spotlightOf`)
- Modify: `packages/shared/src/events.ts` (`nameSchema`, `'host:name'`), `packages/shared/src/views.ts` (коментар `Spotlight.answer`)
- Modify: `apps/server/src/rooms/manager.ts` (`HostAction`, `case 'name'`), `apps/server/src/socket.ts` (обробник)
- Test: `packages/engine/src/game.board-cells.test.ts`, `packages/engine/src/views.test.ts`, `apps/server/src/socket.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // game.ts, BoardPlay:
  /** Варіант, який гравець назвав уголос, позначений ведучим (лише звичайна усна клітинка); лише для показу. */
  named?: Answer;
  // board.ts:
  /**
   * Ведучий позначає варіант, названий уголос: звичайна усна клітинка, single/multi/boolean, етапи question і locked.
   * null або multi без варіантів знімає позначку. Балів і записів не змінює.
   */
  export function nameAnswer(state: GameState, answer: Answer | null): Result;
  // events.ts:
  export const nameSchema = z.object({ answer: answerSchema.nullable() });
  'host:name': (payload: z.infer<typeof nameSchema>, ack: Ack) => void;
  // manager.ts HostAction:
  | { type: 'name'; answer: SubmittedAnswer | null }
  ```
- Помилки `nameAnswer`:
  - `wrong_phase` — інший етап, не поле, бліц-клітинка або спосіб `phone`;
  - `type_mismatch` — тип відповіді не збігається з запитанням або запитання не single/multi/boolean;
  - `not_found` — `optionId` чи `optionIds` не з варіантів запитання.

- [ ] **Step 1: Write the failing tests.**
  `game.board-cells.test.ts` (поле з однією усною клітинкою `single` і однією телефонною, як у наявних тестах файлу):
  ```ts
  it('nameAnswer marks only a normal voice cell and only one of its options', () => {
    const voice = pickVoiceCell(); // звичайна усна клітинка з single (варіанти a, b, c)
    const named = must(nameAnswer(voice, { type: 'single', optionId: 'a' }));
    expect(named.plays[named.questionIndex].board?.named).toEqual({ type: 'single', optionId: 'a' });
    expect(named.players.map((p) => p.score)).toEqual(voice.players.map((p) => p.score));
    expect(named.plays[named.questionIndex].answers).toEqual({});
    expect(must(nameAnswer(named, null)).plays[named.questionIndex].board?.named).toBeUndefined();
    expect(nameAnswer(voice, { type: 'single', optionId: 'zzz' })).toEqual({ ok: false, error: 'not_found' });
    expect(nameAnswer(voice, { type: 'boolean', value: true })).toEqual({ ok: false, error: 'type_mismatch' });
    expect(nameAnswer(pickPhoneCell(), { type: 'single', optionId: 'a' })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(nameAnswer(pickVoiceBlitzCell(), { type: 'single', optionId: 'a' })).toEqual({ ok: false, error: 'wrong_phase' });
    const judged = must(override(named, chooser, 'correct', 1000)); // locked
    expect(must(nameAnswer(judged, { type: 'single', optionId: 'b' })).phase).toBe('locked');
  });
  it('a multi pick without options clears the mark', () => { /* { type: 'multi', optionIds: [] } → named undefined */ });
  ```
  Назви допоміжних функцій узяти або дописати за зразком наявних у файлі.

  `views.test.ts`, `describe` поля:
  ```ts
  it('the host names the option a voice player said: orange for everyone, the verdict only on reveal', () => {
    const named = must(nameAnswer(picked('c11', { answerMode: 'voice' }), { type: 'single', optionId: 'a' }));
    const pending = { playerId: 'p1', nickname: 'Анна', answer: { type: 'single', optionId: 'a' }, grade: null };
    expect(stageView(named).spotlight).toEqual(pending);
    expect(playerView(named, 'p2')?.spotlight).toEqual(pending);
    expect(hostView(named).spotlight).toEqual(pending);
    const judged = must(override(named, 'p1', 'wrong', 1000));
    expect(judged.phase).toBe('locked');
    expect(stageView(judged).spotlight?.grade).toBeNull();
    const revealed = must(next(judged, 2000));
    expect(stageView(revealed).spotlight).toEqual({ ...pending, grade: 'wrong' });
  });
  ```
  Наявний `voice board, classic and lobby views have no spotlight` лишається: без позначки усна клітинка не має spotlight.

  `socket.test.ts`: `host:name is host-only and validated`. За зразком тестів `host:judge`:
  - гравець отримує `forbidden`;
  - `{ answer: 5 }` дає `invalid_payload`;
  - `{ answer: null }` поза полем дає `wrong_phase`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages apps/server/src/socket.test.ts`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - `nameAnswer` у `board.ts`. Поточну гру замінити через `withCurrentPlay` з `game.ts` (зараз приватна; експортувати з коментарем «для board.ts»). `null` або порожній multi видаляє ключ `named`.
  - `spotlightOf`: після гілки бліцу, для `open.board.answerMode === 'voice'`. Гравець має бути в грі (інакше `null`). Далі:
    - етап `reveal` і є запис → `{ chooser, answer: named ?? null, grade: record.grade }`;
    - інакше `named` є → `{ chooser, answer: named, grade: null }`;
    - інакше `null`.
    Телефонна гілка не змінюється.
  - Коментар `Spotlight.answer`: «null — у бліці гравець не встиг відповісти; на усній клітинці ведучий не позначив варіант».
  - `events.ts`, `manager.ts` (`case 'name': return this.apply(room, nameAnswer(state, action.answer))`), `socket.ts` (обробник за зразком `host:judge` з `nameSchema`).

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages apps/server/src
git commit -m "feat(engine): the host can mark the option a voice player named"
```

---

### Задача 5. Варіанти для всіх, позначка ведучого й миготіння вердикту

**Files:**
- Create: `apps/web/src/screens/verdict-blink.ts`, `apps/web/src/screens/verdict-blink.test.tsx`
- Modify: `apps/web/src/screens/SpotlightChoices.tsx`, `StageScreen.tsx`, `PlayerScreen.tsx`, `HostScreen.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/SpotlightChoices.test.tsx`, `StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `HostScreen.test.tsx`

**Interfaces:**
- Consumes: `host:name`, `Spotlight` з позначкою (задача 4).
- Produces:
  ```ts
  // verdict-blink.ts
  export const BLINK_MS = 3000;
  /** true впродовж BLINK_MS після появи вердикту у відповіді одного гравця; під час першого показу — false. */
  export function useVerdictBlink(spotlight: Spotlight | null): boolean;
  // SpotlightChoices props додатково:
  /** Вердикт щойно з'явився: колір відповіді мигає. */
  blink?: boolean;
  /** Відповідь уголос: замість місця для тексту — «Гравець відповідає вголос». */
  voice?: boolean;
  /** Ведучий на усній клітинці: варіанти single/multi/boolean стають кнопками позначки. */
  onName?: (answer: Answer | null) => void;
  ```

**Тексти (`i18n.ts`, точно):**
```ts
spotlightWaitText: 'Відповідь словами з’явиться тут',
spotlightWaitNumber: 'Відповідь числом з’явиться тут',
spotlightVoice: 'Гравець відповідає вголос',
nameHint: 'Торкніться варіанта, який назвав гравець',
```

**Поведінка `useVerdictBlink`.** Ключ — `${playerId}|${grade}|${JSON.stringify(answer)}`, коли `grade !== null`, інакше `null`. Попередній ключ зберігається в `useRef`. Під час першого рендеру ключ лише запам'ятовується. Коли ключ змінюється на не-`null`, `blink = true`, а через `BLINK_MS` — `false`. Таймер прибирається під час демонтажу й під час наступної зміни.

**`SpotlightChoices`:**
- Колір відповіді — `tone` з додатковим ` is-blinking`, коли `blink` і `grade !== null`. Так мигають і варіанти, і `spotlight-answer`, і `PairList`.
- Без відповіді (`answer === null`):
  - single/multi/boolean — варіанти без кольору, як і зараз;
  - text/numeric — `<p className="spotlight-answer is-waiting">` з `spotlightVoice`, якщо `voice`, інакше `spotlightWaitNumber` для numeric і `spotlightWaitText` для text;
  - order — `<ol className="order spotlight-order">` з `question.choices` у показаному порядку, номери `1…n`, без кнопок;
  - match — `MatchColumns`, як і зараз.
- `onName` (лише single/multi/boolean): `<div className="choices">` з `<button type="button" className={`choice ${color}`} aria-pressed={…}>`.
  - Single чи boolean: дотик до позначеного варіанта дає `onName(null)`, інакше відповідь з цим варіантом.
  - Multi: варіант перемикається; порожній набір дає `onName(null)`.

**Стилі:**
```css
@media (prefers-reduced-motion: no-preference) {
  .is-blinking.is-correct, .is-blinking.is-wrong { animation: verdict-blink 0.5s ease-in-out 6; }
  @keyframes verdict-blink { 50% { opacity: 0.35; } }
}
```
Блок поставити після наявного правила `.choice.is-correct { animation: reveal … }`. Селектор `.choice.is-blinking.is-correct` має перемагати за специфічністю. `.spotlight-answer.is-waiting` — колір `var(--dim)`, рамка `1px dashed var(--line)`, `padding: 0.75rem 1rem`, `border-radius: 0.75rem`.

- [ ] **Step 1: Write the failing tests.**
  `verdict-blink.test.tsx` (fake timers, `renderHook` або тестовий компонент):
  ```ts
  it('blinks when a verdict arrives, not on the first render', () => {
    vi.useFakeTimers();
    const pending = spot(null), wrong = spot('wrong');
    const { result, rerender } = renderHook(({ s }) => useVerdictBlink(s), { initialProps: { s: wrong } });
    expect(result.current).toBe(false);
    rerender({ s: pending });
    expect(result.current).toBe(false);
    rerender({ s: wrong });
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(BLINK_MS));
    expect(result.current).toBe(false);
  });
  it('a new verdict of another player blinks again; the same verdict on re-render does not', () => { … });
  ```
  `SpotlightChoices.test.tsx`:
  - наявне `expect(render(<SpotlightChoices question={textQ} spotlight={null} …/>).container.textContent).toBe('')` замінити на «Відповідь словами з’явиться тут»;
  - `numeric without an answer shows where the number will appear` → «Відповідь числом з’явиться тут»;
  - `a voice answer says the player answers aloud` → з `voice` для text: «Гравець відповідає вголос»;
  - `order without an answer lists the items in the shown order` → `li` з «Ужгород», «Львів»;
  - `a verdict blinks only while blink is on` → `blink` і `grade: 'correct'` дають `.choice.is-correct.is-blinking`; без `blink` класу немає; з `grade: null` і `blink` класу `is-blinking` немає;
  - `the host names an option by tapping it` → з `onName`:
    - кнопка «Київ» викликає `onName({ type: 'single', optionId: 'b' })`;
    - коли `spotlight.answer` уже `{ single, b }`, той самий дотик дає `onName(null)`;
    - у multi з позначеним `a` дотик `c` дає `{ type: 'multi', optionIds: ['a', 'c'] }`.

  Екрани:
  - `StageScreen.test.tsx`: `a voice cell shows the options to the stage and the host's mark in orange` — `board.cell.answerMode: 'voice'`, `spotlight` з `answer` `{ single, a }` і `grade: null` дає `.choice.is-pending`. Без spotlight видно всі варіанти, зокрема для `boolean` («Так», «Ні»).
  - `PlayerScreen.test.tsx`:
    - `the voice chooser sees the options and answers aloud` — вибравший на усній клітинці бачить варіанти й «Відповідайте вголос»;
    - `a queued blitz player on a voice cell sees the options`;
    - `the phone of another player blinks the verdict when the question turns to reveal` — `rerender` з `phase: 'question'`, `spotlight.grade: null` на `phase: 'reveal'`, `grade: 'correct'` дає `.choice.is-blinking`;
    - `the chooser sees the choices with the verdict above the result` — на `reveal` у вибравшого є `.choice.is-correct` і «Правильно!».
  - `HostScreen.test.tsx`:
    - `the host sees the options when one player answers` — бліц або поле з телефоном показують `.choices`;
    - `the host taps the option a voice player named` — звичайна усна клітинка, `phase: 'question'`, видно «Торкніться варіанта, який назвав гравець». Клік «Київ» викликає `send('host:name', { answer: { type: 'single', optionId: 'b' } })`. На усній бліц-клітинці кнопок позначки немає.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - `verdict-blink.ts`, зміни `SpotlightChoices`, тексти, стилі.
  - `StageScreen`: `const blink = useVerdictBlink(view.spotlight)` у `StageScreen` (не в `Question`), далі в `Question` через пропс. Також:
    - `spotlit = view.blitz !== null || view.board !== null`;
    - `SpotlightChoices` отримує `voice={voice} blink={blink}`.
  - `PlayerScreen`: `useVerdictBlink(view.spotlight)` у `PlayerScreen`; `blink` іде в кожен `SpotlightChoices`. Гілки:
    - вибравший на усній клітинці без відповіді — `<SpotlightChoices … voice />` і `<p className="lead">{t('answerAloud')}</p>`;
    - бліц: `SpotlightChoices` показується й тоді, коли `board?.cell?.answerMode === 'voice'` (з `voice`);
    - `reveal` у гілці `Result`: перед `<Result>` стоїть `SpotlightChoices` з `reveal={view.reveal}`, коли `view.spotlight !== null && question !== null && view.final === null`.
  - `HostScreen`: `useVerdictBlink(view.spotlight)`. У панелі запитання після відео, коли `blitz !== null || board !== null`, стоїть `<SpotlightChoices question={view.question} spotlight={view.spotlight} reveal={phase === 'reveal' ? correct : null} blink={blink} voice={board?.cell?.answerMode === 'voice'} onName={canName ? name : undefined} />`. Умови:
    - `canName`: `phase` — `question` або `locked`, `board?.cell` має `answerMode: 'voice'` і `kind: 'normal'`, тип запитання single/multi/boolean;
    - `name = (answer) => void act('host:name', { answer })`;
    - над варіантами `<p className="meta">{t('nameHint')}</p>`, коли `canName`.
  - Наявний рядок `correctAnswer` пульта лишається.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): everyone sees the options of a single answerer; the host marks a voice answer; verdicts blink"
```

---

### Задача 6. Маска назви відео YouTube

**Files:**
- Modify: `apps/web/src/screens/YouTubePlayer.tsx`, `StageScreen.tsx`, `PlayerScreen.tsx`, `HostScreen.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/YouTubePlayer.test.tsx`

**Interfaces:**
- Produces: `YouTubePlayer(props: { video: Video | null; masked?: boolean })`. `youtubeEmbedUrl` додає `iv_load_policy=3` і `fs=0`.

**Тексти:** `videoTitleHidden: 'Назву відео приховано до відповіді',`

**Розмітка:** усередині `.question-video` після `iframe` стоїть `{masked && <div className="video-mask">{t('videoTitleHidden')}</div>}`. `iframe` без `allowFullScreen`, `allow="encrypted-media; picture-in-picture"`. `key` `iframe` не залежить від `masked`.

**Стилі:**
- `.question-video { position: relative; }`.
- `.video-mask`:
  - `position: absolute; inset: 0 0 auto 0; height: max(3.5rem, 18%); z-index: 1`;
  - `display: flex; align-items: center; padding: 0 1rem`;
  - `background: #000; color: var(--dim); font-size: 0.875rem`;
  - `pointer-events: auto` (кліки по назві не доходять до плеєра).

- [ ] **Step 1: Write the failing tests** у `YouTubePlayer.test.tsx`:
  ```ts
  it('turns off annotations and fullscreen in the embed address', () => {
    const url = youtubeEmbedUrl(video, 'https://quiz.example');
    expect(url).toContain('iv_load_policy=3');
    expect(url).toContain('fs=0');
  });
  it('covers the title band until reveal without reloading the player', () => {
    const { rerender } = render(<YouTubePlayer video={video} masked />);
    const frame = iframe();
    expect(screen.getByText('Назву відео приховано до відповіді')).toBeTruthy();
    expect(frame.hasAttribute('allowfullscreen')).toBe(false);
    rerender(<YouTubePlayer video={video} masked={false} />);
    expect(screen.queryByText('Назву відео приховано до відповіді')).toBeNull();
    expect(iframe()).toBe(frame);
  });
  ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/YouTubePlayer.test.tsx`. Очікується FAIL.

- [ ] **Step 3: Implement.** Використання:
  - `StageScreen` — `masked={reveal === null}`;
  - `PlayerScreen` — `masked={view.reveal === null}`;
  - `HostScreen` — `masked={phase !== 'reveal'}`.
  Оновити JSDoc `YouTubePlayer`: маска до розкриття, без повноекранного режиму. Окремо записати, чого маска не закриває: кінцевий екран і «Більше відео» на паузі показують інші ролики; логотип YouTube у смузі керування відкриває сторінку ролика.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): mask the YouTube title band until the reveal"
```

---

### Задача 7. Підписи «зверху / знизу» в запитаннях на порядок

**Files:**
- Modify: `packages/shared/src/quiz.ts` (`LIMITS.orderLabel`, поля order), `packages/shared/src/views.ts` (`PublicQuestion.orderLabels`), `packages/engine/src/views.ts` (`publicQuestion`)
- Modify: `apps/web/src/format.ts` (`orderLabelsText`, `correctText`), `apps/web/src/screens/AnswerInput.tsx` (`OrderInput`), `SpotlightChoices.tsx` (список очікування), `StageScreen.tsx` (підказка), `apps/web/src/editor/QuestionEditor.tsx`, `apps/web/src/editor/draft.ts` (`cleaned`), `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Modify: `apps/server/scripts/demo-quiz.ts` (`order`), `movie-quiz.ts`, `erudite-quiz.ts`, `party-quiz.ts`
- Modify (механічно): літерали `PublicQuestion` у `apps/web/src/**/*.test.tsx` (шукати `chain: null` поруч із `right:`)
- Test: `packages/shared/src/quiz.test.ts`, `packages/engine/src/views.test.ts`, `apps/web/src/format.test.ts`, `apps/web/src/screens/AnswerInput.test.tsx`, `StageScreen.test.tsx`, `apps/web/src/editor/QuizEditor.test.tsx`, `apps/server/scripts/demo-quiz.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // quiz.ts: LIMITS.orderLabel: 40; в об'єкті order:
  /** Що зверху списку, наприклад «Найбільший»; старі запитання без підпису. */
  topLabel: z.string().trim().max(LIMITS.orderLabel).refine(isStorable, UNSTORABLE).optional(),
  /** Що знизу списку, наприклад «Найменший». */
  bottomLabel: z.string().trim().max(LIMITS.orderLabel).refine(isStorable, UNSTORABLE).optional(),
  // views.ts, PublicQuestion:
  /** Підписи над і під списком order ('' — немає); null для інших типів. */
  orderLabels: { top: string; bottom: string } | null;
  // format.ts:
  /** «зверху — Найбільший, знизу — Найменший»; порожні підписи пропускаються; обидва порожні — ''. */
  export function orderLabelsText(labels: { top: string; bottom: string }): string;
  // demo-quiz.ts:
  export const order = (text: string, items: string[], points?: number, time?: number, labels?: [top: string, bottom: string]): Question;
  ```

**Тексти (`i18n.ts`, точно):**
```ts
orderTop: 'зверху — {label}',
orderBottom: 'знизу — {label}',
orderOnPhoneLabels: 'Розставте на телефоні: {labels}',
orderTopLabel: 'Що зверху (необов’язково)',
orderBottomLabel: 'Що знизу (необов’язково)',
orderTopPlaceholder: 'Наприклад, найбільший',
orderBottomPlaceholder: 'Наприклад, найменший',
```

- [ ] **Step 1: Write the failing tests.**
  `quiz.test.ts`:
  ```ts
  it('order labels are optional and at most 40 characters', () => {
    const withLabels = (patch: object) => ({ ...order, ...patch });
    expect(valid(questionSchema, order)).toBe(true);
    expect(questionSchema.parse(withLabels({ topLabel: '  Найбільший ', bottomLabel: 'Найменший' }))).toMatchObject({ topLabel: 'Найбільший', bottomLabel: 'Найменший' });
    expect(valid(questionSchema, withLabels({ topLabel: 'а'.repeat(40) }))).toBe(true);
    expect(valid(questionSchema, withLabels({ bottomLabel: 'а'.repeat(41) }))).toBe(false);
  });
  ```
  `views.test.ts`: `players see the order labels, other types have none`:
  - запитання order з `topLabel: 'Захід', bottomLabel: 'Схід'` дає `stageView(...).question?.orderLabels` = `{ top: 'Захід', bottom: 'Схід' }`;
  - order без підписів дає `{ top: '', bottom: '' }`;
  - single дає `null`.

  `format.test.ts`:
  ```ts
  it('order labels in words and in the revealed answer', () => {
    expect(orderLabelsText({ top: 'Найбільший', bottom: 'Найменший' })).toBe('зверху — Найбільший, знизу — Найменший');
    expect(orderLabelsText({ top: '', bottom: 'Найменший' })).toBe('знизу — Найменший');
    expect(orderLabelsText({ top: '', bottom: '' })).toBe('');
    expect(correctText({ ...order, topLabel: 'Захід', bottomLabel: 'Схід' })).toBe('Ужгород → Львів → Київ → Харків (зверху — Захід, знизу — Схід)');
    expect(correctText(order)).toBe('Ужгород → Львів → Київ → Харків');
  });
  ```
  Інші тести:
  - `AnswerInput.test.tsx`: `the order input shows what goes on top and at the bottom` — «Захід» стоїть у DOM перед першим елементом списку, «Схід» — після останнього. Без підписів `.order-label` немає.
  - `StageScreen.test.tsx`: `the stage hint names the order labels` — «Розставте на телефоні: зверху — Захід, знизу — Схід». Без підписів лишається «Розставте в правильному порядку на телефоні».
  - `SpotlightChoices.test.tsx`: список очікування order показує підписи над і під списком.
  - `QuizEditor.test.tsx`: `an order question takes optional top and bottom labels`:
    - тип «на порядок», поля «Що зверху (необов’язково)» і «Що знизу (необов’язково)» мають `maxlength` 40;
    - заповнити « Найбільший », зберегти, а `saved(onSave)` дає `topLabel` = «Найбільший»;
    - порожнє поле не потрапляє в збережене запитання (`'bottomLabel' in question` дорівнює `false`).
  - `demo-quiz.test.ts`: `ocean and film-year orders carry labels`:
    - у `eruditeQuiz` запитання «Розставте океани…» має `topLabel` «Найбільший» і `bottomLabel` «Найменший»;
    - «Розставте фільми за роком виходу» має «Найраніше» / «Найпізніше»;
    - кожне order у `demoQuiz`, `movieQuiz`, `eruditeQuiz`, `partyQuiz()` має обидва підписи.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages apps/web apps/server/scripts`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - Схема, `LIMITS.orderLabel = 40`.
  - `publicQuestion`: `orderLabels: question.type === 'order' ? { top: question.topLabel ?? '', bottom: question.bottomLabel ?? '' } : null`.
  - `OrderInput`, а також список очікування `SpotlightChoices`: `<p className="order-label is-top">↑ {top}</p>` перед `ol` і `<p className="order-label is-bottom">↓ {bottom}</p>` після нього, лише непорожні. Стиль: колір `var(--amber)`, шрифт `--display`, `font-size: 0.9375rem`, на сцені більший.
  - Підказка сцени: `hint` для order — `orderOnPhoneLabels` з `orderLabelsText`, якщо текст непорожній.
  - `correctText` для order: `items`, далі ` (${orderLabelsText(...)})`, якщо текст непорожній.
  - Редактор: у `Body`, `case 'order'`, перед `Rows` стоїть `<label className="field"><span>{t('orderTopLabel')}</span><input maxLength={LIMITS.orderLabel} placeholder={t('orderTopPlaceholder')} value={question.topLabel ?? ''} onChange={…} /></label>`. Після `Rows` — таке саме поле для `bottomLabel`, перед `orderHint`.
  - `cleaned`: для order обрізати підписи, а порожній підпис видалити з об'єкта (деструктуризацією, не `undefined`).
  - Механічно: кожен літерал `PublicQuestion` у веб-тестах отримує `orderLabels: null` (для order — `{ top: '', bottom: '' }`).
  - Демо (`labels` → `topLabel`/`bottomLabel`):
    - `demo-quiz.ts`:
      - планети — «Найближча до Сонця» / «Найдальша від Сонця»;
      - тварини — «Найменший» / «Найбільший»;
      - пори року — «Перша» / «Остання»;
      - «Від найлегшого» — «Найлегший» / «Найважчий»;
      - The Beatles — «Найраніше» / «Найпізніше».
    - `erudite-quiz.ts`:
      - океани — «Найбільший» / «Найменший»;
      - епохи — «Найраніше» / «Найпізніше»;
      - перці — «Найм’якший» / «Найгостріший»;
      - фільми за роком — «Найраніше» / «Найпізніше»;
      - «Зоряні війни» — «Найраніше» / «Найпізніше».
    - `movie-quiz.ts`: «Сутінки» і трилогія — «Найраніше» / «Найпізніше».
    - `party-quiz.ts`:
      - чотири хронологічні — «Найраніше» / «Найпізніше»;
      - птахи — «Найменший» / «Найбільший».

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages apps/web/src apps/server/scripts
git commit -m "feat: top and bottom labels for order questions, also in the demo quizzes"
```

---

### Задача 8. Варіанти-картинки в single і multi

**Files:**
- Modify: `packages/shared/src/quiz.ts` (схема варіанта single/multi), `packages/shared/src/views.ts` (`Choice.imageUrl?`), `packages/engine/src/views.ts` (`publicQuestion`)
- Modify: `apps/web/src/format.ts` (`choiceLabel`, `choicesOf`, `shownChoices`, `pickedText`, `correctText`), `apps/web/src/screens/AnswerInput.tsx` (`ChoiceButtons`), `SpotlightChoices.tsx`, `StageScreen.tsx` (список варіантів), `apps/web/src/editor/ImageField.tsx`, `apps/web/src/editor/QuestionEditor.tsx`, `apps/web/src/editor/draft.ts` (`cleaned`, перевірка порожнього варіанта), `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Create: `apps/web/src/screens/ChoiceFace.tsx`, `apps/web/src/editor/OptionImage.tsx`
- Test: `packages/shared/src/quiz.test.ts`, `packages/engine/src/views.test.ts`, `apps/web/src/format.test.ts`, `apps/web/src/screens/AnswerInput.test.tsx`, `SpotlightChoices.test.tsx`, `StageScreen.test.tsx`, `apps/web/src/editor/draft.test.ts`, `apps/web/src/editor/QuizEditor.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  // quiz.ts — лише для options у single і multi; order і match лишаються на старій схемі choice.
  const option = z
    .object({
      id: z.string().min(1).refine(isStorable, UNSTORABLE),
      text: z.string().trim().max(LIMITS.optionText).refine(isStorable, UNSTORABLE),
      /** Картинка варіанта; старі варіанти без неї. */
      imageUrl: z.string().regex(IMAGE_URL).optional(),
    })
    .refine((o) => o.text !== '' || o.imageUrl !== undefined, { message: 'empty_option' });
  // views.ts
  export interface Choice { id: string; text: string; /** Лише варіанти single/multi. */ imageUrl?: string }
  // format.ts
  /** Текст варіанта або «Картинка Б» за літерою; index — місце у списку, з якого береться літера. */
  export function choiceLabel(choice: Choice, index: number): string;
  // screens/ChoiceFace.tsx
  /** Вміст варіанта: літера, картинка (не завантажилася — «Картинка Б»), текст. */
  export function ChoiceFace(props: { choice: Choice; letter?: string }): JSX.Element;
  // editor/ImageField.tsx — спільна логіка завантаження:
  export function useImageUpload(onChange: (url: string | null) => void): { busy: boolean; error: string | null; pick: (event: ChangeEvent<HTMLInputElement>) => Promise<void>; clearError: () => void };
  // editor/OptionImage.tsx
  /** Картинка варіанта в редакторі: мініатюра, «додати / замінити» і «прибрати». */
  export function OptionImage(props: { url: string | undefined; index: number; onChange: (url: string | undefined) => void }): JSX.Element;
  ```

**Тексти (`i18n.ts`, точно):**
```ts
imageChoice: 'Картинка {letter}',
imagePlain: 'картинка',
optionImageAdd: 'Картинка для варіанта {index}',
optionImageRemove: 'Прибрати картинку варіанта {index}',
```

**Розмітка й стилі:**
- `ChoiceFace` малює:
  - `{letter && <span className="letter">{letter}</span>}`;
  - картинку `<img className="choice-image" alt={choice.text || t('imageChoice', { letter })}>`. Якщо картинка не завантажилася (`onError`), замість неї `<span className="choice-text">{t('imageChoice', { letter })}</span>`;
  - `{choice.text !== '' && <span className="choice-text">{choice.text}</span>}`.
- Списки варіантів отримують клас `choices has-images`, коли хоча б один варіант має картинку. Це стосується `ChoiceButtons`, `SpotlightChoices` (single/multi, також кнопки `onName`) і списку сцени.
- `.choices.has-images` — `grid-template-columns: repeat(2, minmax(0, 1fr))`. `.choice-image` — `width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 0.5rem`, на телефоні `max-height: 7rem`.
- `.stage .choices.has-images` — `repeat(3, minmax(0, 1fr))`, `.stage .choice-image` — `max-height: 28vh`. Варіант з картинкою — `flex-direction: column; align-items: stretch`, літера в лівому верхньому куті.
- `OptionImage` — мініатюра `2.5rem` і `label.btn.btn-small.file-pick` з `aria-label={t('optionImageAdd', { index })}`, усередині `input type="file"`. Якщо картинка є, поруч кнопка `×` з `aria-label={t('optionImageRemove', { index })}`. Помилка — `p.error` під рядком.

- [ ] **Step 1: Write the failing tests.**
  `quiz.test.ts`:
  ```ts
  it('an option may be a picture, then its text is optional, but never both empty', () => {
    const pic = '/uploads/abcdefabcdefabcd.png';
    const withOptions = (options: object[]) => ({ ...single, options });
    expect(valid(questionSchema, single)).toBe(true);
    expect(valid(questionSchema, withOptions([{ id: 'a', text: '', imageUrl: pic }, { id: 'b', text: 'Київ', imageUrl: pic }, { id: 'c', text: 'Одеса' }]))).toBe(true);
    expect(valid(questionSchema, withOptions([{ id: 'a', text: '  ' }, { id: 'b', text: 'Київ' }]))).toBe(false);
    expect(valid(questionSchema, withOptions([{ id: 'a', text: 'Львів', imageUrl: 'https://evil.example/x.png' }, { id: 'b', text: 'Київ' }]))).toBe(false);
    expect(valid(questionSchema, { ...order, items: [{ id: 'u', text: '', imageUrl: pic }, ...order.items.slice(1)] })).toBe(false);
  });
  ```
  `views.test.ts`: `picture options keep their pictures in the shown order`:
  - single з `imageUrl` у варіанті `b` і `shuffleOptions` — `question.choices.find((c) => c.id === 'b')?.imageUrl` дорівнює адресі;
  - варіант без картинки не має ключа `imageUrl`;
  - `JSON.stringify` зрізу сцени не містить `correctId`.

  `format.test.ts`:
  ```ts
  it('labels a picture-only option by its letter wherever text is needed', () => {
    const pics = { ...single, options: [{ id: 'a', text: 'Львів' }, { id: 'b', text: '', imageUrl: '/uploads/abcdefabcdefabcd.png' }, { id: 'c', text: 'Одеса' }] };
    expect(choiceLabel(pics.options[1], 1)).toBe('Картинка B');
    expect(answerText({ type: 'single', optionId: 'b' }, pics)).toBe('Картинка B');
    expect(correctText(pics)).toBe('B. картинка');
    expect(pickedText({ type: 'single', optionId: 'b' }, [pics.options[1], pics.options[0]])).toBe('Картинка A');
  });
  ```
  Літери беруться з `LETTERS` (латинські A–F, як і зараз на екранах). Тому очікування — «Картинка B». Приклад «Картинка Б» у специфікації ілюстративний.

  Інші тести:
  - `AnswerInput.test.tsx`: `picture options show thumbnails with letters and still answer by id`. Варіант без тексту — кнопка з `img` (`alt` «Картинка B») і літерою «B». Клік дає `onSubmit({ type: 'single', optionId: 'b' })`. Список має клас `has-images`.
  - `SpotlightChoices.test.tsx`: варіант-картинка з позначкою відповіді дає `.choice.is-pending` з `img`.
  - `StageScreen.test.tsx`: `the stage shows picture options as a grid with letters` — `.choices.has-images` з `img` і літерами A–C.
  - `draft.test.ts`: `cleaned keeps a picture-only option and drops an empty spare`. У `cleaned` варіант `{ text: '', imageUrl }` лишається, а порожній запасний без картинки прибирається. Перевірка порожнього варіанта (`problemEmptyOption`) не спрацьовує на варіант лише з картинкою.
  - `QuizEditor.test.tsx`: `an option takes a picture instead of text`. Мок `uploadImage` — так само, як наявні тести зображення запитання (`vi.mock('../api', …)`). Кроки:
    - вибрати файл у полі «Картинка для варіанта 2»;
    - очистити текст варіанта 2;
    - позначити правильний і зберегти.
    Збережений `options[1]` дорівнює `{ id, text: '', imageUrl: '/uploads/…' }`. Потім «Прибрати картинку варіанта 2» прибирає ключ.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages apps/web`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - Схема `option` для `options` single і multi. Стара `choice` лишається для `order` і `match`.
  - `publicQuestion`: у `shown` копіювати `imageUrl`, лише коли він є.
  - `format.ts`:
    - `choicesOf` для single/multi повертає `options.map((o, i) => ({ ...o, text: choiceLabel(o, i) }))`;
    - `shownChoices` — те саме з літерою показу;
    - `pickedText` бере `choiceLabel(choice, index)` у порядку переданих `choices`;
    - `correctText` для варіанта без тексту пише `${letter}. ${t('imagePlain')}`.
  - `ChoiceFace`: використати в `ChoiceButtons`, у `SpotlightChoices` (single/multi, також кнопки `onName`) і в списку варіантів `StageScreen`. Клас `has-images` вмикає функція `hasImages(choices)` у `ChoiceFace.tsx`.
  - `ImageField`: винести вибір і перевірку файла й `uploadImage` з захистом `latest`/`mounted` у `useImageUpload`. `ImageField` поводиться як раніше, його тести без змін.
  - `OptionImage` — на `useImageUpload`.
  - `QuestionEditor`, `single` і `multi`: у `tail` перед `Mark` стоїть `<OptionImage url={row.imageUrl} index={index + 1} onChange={…} />`. Зміна замінює `imageUrl` рядка, а `undefined` видаляє ключ. `Row` отримує `imageUrl?: string`.
  - `draft.ts`: порожній варіант — `text === '' && imageUrl === undefined` (у `withoutSpare` і в перевірці `problemEmptyOption` для single/multi).
  - Історія (`GameHistory.tsx`) бере `answerText`/`choicesOf` і отримує підписи сама. Перевірити, що їй нічого не треба.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages apps/web/src
git commit -m "feat: picture options in single and multi questions"
```

---

### Задача 9. Наскрізний сценарій 7a і кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–8.
- Допоміжні функції файлу: `open`, `register`, `shot`, `click`, `field`, `seconds`, `arrange`, `join`, `expectNoSideScroll`, `avatarPng`. З `@quiz/engine/testing` імпортувати `boardRound`, `classicRound`, `makeRoundsQuiz`, `order`, `single`, `withId`, `withPoints`, `withVideo`.

- [ ] **Step 1: Update `mixedBoard()`**. Перевірки «до вибору сцена й телефони не бачать типу» (`.gb-kind` count 0 на `stage`, `alla`, `bohdan`) замінити на «бачать»: `.gb-cell.is-blitz` більше 0 на `host`, `stage`, `alla`, `bohdan`. Також на `stage` є `getByRole('list', { name: 'Види клітинок' })`. Коментар над перевіркою оновити.

- [ ] **Step 2: Add the scenario** `it('part 7a: a bigger coloured board with a legend, round facts, the host timer, options and verdict blinks for everyone, a masked video, order labels and picture options', …)` з `try/catch` і `snapshot()`, як інші. Підготовка:
  1. Ведучий `register(host, 'host', 'Ірина Ведуча', 'host7a@example.com')`.
  2. Чотири картинки завантажити як `host.request.post(`${base}/api/uploads`, { data: avatarPng(), headers: { 'content-type': 'image/png' } })` і взяти `url` з JSON.
  3. Вікторину «Ясність» опублікувати через `host.request.post(`${base}/api/quizzes`, { data })`, де `data` = `makeRoundsQuiz([...])` з `title: 'Ясність'`:
     - **Раунд 1, класичний** (`speedBonus: false`) з трьох запитань:
       - order «Розставте океани від найбільшого до найменшого»: Тихий, Атлантичний, Індійський, Північний Льодовитий; `topLabel` «Найбільший», `bottomLabel` «Найменший»; `timeLimit` 30;
       - single «Який прапор України?»: A — картинка без тексту (правильний), B — картинка з текстом «Польща», C — текст «Італія»; 20 с;
       - `withVideo(single)` з id `q-video`.
     - **Раунд 2, поле**: 8 категорій по 3 клітинки (`withPoints(withId(single, …), 100|200|300)`). Перша категорія — «Географія та подорожі світом» (переноситься на кілька рядків). Інші клітинки:
       - «Міста, 100» — звичайна телефонна;
       - «Міста, 200» — `answerMode: 'voice'`;
       - «Міста, 300» — `mark: 'x2'`;
       - одна `kind: 'blitz', penalty: 'all'`;
       - одна `mark: 'x3'`.
       Решта звичайні телефонні.
  4. Гра: `stage` 1600×900, `olya` 375×812, `taras` 360×740. Обидва гравці приєднуються, порядок поля — за приєднанням.

- [ ] **Step 3: Assertions and shots** (у такому порядку):
  1. **Заставка раунду 1.**
     - На сцені й у Олі «3 запитання · 20–30 с на кожне»;
     - кадри `intro-facts-stage`, `intro-facts-phone`.
  2. **Order.**
     - На сцені рядок «Запитання 1 з 3 · лишилося 2» і «/ 30 с»;
     - у Олі `.order-label.is-top` «↑ Найбільший» над списком і «↓ Найменший» під ним;
     - на сцені «Розставте на телефоні: зверху — Найбільший, знизу — Найменший»;
     - у ведучого `getByRole('timer')` і «/ 30 с»;
     - кадри `order-labels-phone`, `order-labels-stage`, `timer-host`.
     Далі гравці відповідають (`arrange`). Після розкриття на сцені `.answer` містить «(зверху — Найбільший, знизу — Найменший)», кадр `order-labels-reveal-stage`.
  3. **Картинки.**
     - На сцені `.choices.has-images img` — 2 елементи, видно літери A, B, C;
     - у Тараса кнопка з `img[alt="Картинка A"]`;
     - кадри `image-options-stage`, `image-options-phone`;
     - `expectNoSideScroll(olya, 'image-options-phone-375')`.
     Оля вибирає A, Тарас — «Італія». Після розкриття на сцені «Правильна відповідь: A. картинка».
  4. **Відео.**
     - На сцені й у Олі є `.video-mask` з текстом «Назву відео приховано до відповіді»;
     - точка в центрі верхньої смуги плеєра належить масці: `stage.evaluate` з `document.elementFromPoint(x, y)?.closest('.video-mask') !== null` для `x` = центр `.question-video`, `y` = верх + 10 px;
     - кадри `video-mask-stage`, `video-mask-phone`.
     Після розкриття `.video-mask` count 0, кадр `video-unmasked-stage`.
  5. **Заставка поля.** «24 клітинки · 20 с на кожну».
  6. **Поле.**
     - На сцені `.board-with-legend` і легенда з пунктами «Звичайна», «Бліц: відповідає перший, хто натисне», «Відповідь уголос», «×2 — подвійна ціна», «×3 — потрійна ціна», «−всім: мінус для всіх, хто не вгадав». Пункту «🎤 Бліц уголос» немає;
     - у Олі `expectNoSideScroll(olya, 'board-legend-phone-375')`, а `.gb-scroll` має `scrollWidth > clientWidth`;
     - висота `.gb-title` першої категорії (`boundingBox().height`) більша за висоту назви «Міста»: назва переноситься;
     - кадри `board-legend-stage`, `board-legend-host`.
  7. **Телефонна клітинка й варіанти до відповіді.**
     - Оля вибирає «Міста, 100»;
     - у Тараса до відповіді видно три `.choice` (Львів, Київ, Одеса), кадр `spotlight-before-answer-phone-other`;
     - на сцені «Клітинка 1 з 24 · лишилося 23».
     Оля відповідає «Київ». У Тараса й на сцені з'являється `.choice.is-pending`, на сцені «Чекає рішення ведучого». Ведучий натискає «Прийняти». Тоді:
     - на сцені й у Тараса `.choice.is-correct.is-blinking`;
     - кадри `verdict-blink-stage`, `verdict-blink-phone-other`, `verdict-blink-host`;
     - `await expect.poll(() => stage.locator('.is-blinking').count(), { timeout: 6000 }).toBe(0)`;
     - `.choice.is-correct` лишається.
  8. **Усна клітинка.**
     - Тарас вибирає «Міста, 200»;
     - у Тараса видно варіанти й «Відповідайте вголос»;
     - у ведучого «Торкніться варіанта, який назвав гравець»;
     - ведучий торкається «Одеса»: на сцені й у Олі `.choice.is-pending` з «Одеса»;
     - кадри `voice-named-stage`, `voice-named-phone-other`, `voice-named-host`.
     Ведучий натискає «Не зараховувати» (наявна кнопка `gradeWrong`). На сцені ще немає `.is-wrong`. Далі «Показати відповідь». На сцені `.choice.is-wrong.is-blinking` («Одеса») і `.choice.is-correct` («Київ»), кадр `voice-verdict-stage`.
  9. **Зменшений рух.** До кроку 8 викликати `await olya.emulateMedia({ reducedMotion: 'reduce' })`. На розкритті кроку 8 в Олі `getComputedStyle(.choice.is-wrong).animationName` дорівнює `'none'`.
  10. «Завершити гру» і `expect(problems).toEqual([])`.

- [ ] **Step 4: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв. Потім той самий запуск з `E2E_SHOTS=1`. Переглянути кадри в `apps/server/e2e/artifacts/shots`:
  - клітинки й назви помітно більші на сцені, телефоні й пульті;
  - кольори видів розрізняються, легенда на сцені збоку, на телефоні й у ведучого під полем;
  - факти раунду й «/ 30 с» зі смужкою;
  - маска закриває смугу назви;
  - підписи над і під списком;
  - сітка картинок з літерами на сцені, мініатюри на телефоні 375 px без прокрутки вбік.

- [ ] **Step 5: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts
git commit -m "test: part 7a end-to-end — board colours and legend, round facts, host timer, verdict blinks, video mask, order labels, picture options"
```

Після фінальної рецензії гілку злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`. У звіті власникові назвати обмеження маски відео (кінцевий екран, «Більше відео» на паузі, логотип YouTube; повноекранний режим вимкнено).
