# План 11a: Редактор — довший опис раунду й заповнені клітинки поля

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 11a специфікації `docs/superpowers/specs/2026-10-25-after-formats-design.md` (розділ 5). Дві незалежні правки редактора:
- **Опис раунду (п. 4 побажань):**
  - `LIMITS.roundDescription` 200 → **600**;
  - у редакторі поле на 4 рядки, що росте до 8, з лічильником «123 / 600», який жовтіє після 500;
  - на сцені (1280 × 720) довгий опис обрізається трьома крапками, якщо разом із поясненням для новачків і рядками правил не вміщається;
  - телефон і пульт показують опис повністю.
- **Заповнені клітинки поля (п. 5 побажань):**
  - три стани клітинки в `BoardEditor` (порожня / не заповнена / готова) і окрема рамка вибраної;
  - у заголовку категорії «4 / 5 готово»; порожня назва категорії позначена, як недороблена клітинка;
  - під полем легенда; на вкладці раунду позначка «2 не готові»;
  - стан рахує **та сама** перевірка запитання, що й `problemsOf` під час збереження;
  - стан входить в `aria-label` клітинки.

**Стан гри не змінюється:** `GAME_STATE_VERSION` той самий, нових ключів стану немає, міграцій немає (раунди лежать у jsonb `quiz.rounds`). Старі вікторини з описом до 200 символів проходять нову схему без змін. **Пуш не обриває живих ігор**, перевірка `live_room` за 14a підпроєкту 10 не потрібна. Звіт власникові має сказати це явно.

**Архітектура:**
- **Shared (`packages/shared/src/quiz.ts`).** Лише число в `LIMITS`. Сім схем раундів уже беруть `LIMITS.roundDescription`.
- **Редактор, опис (`apps/web/src/editor/RoundSettings.tsx`).** `textarea` з `rows={4}`, клас `round-description`. Ріст до 8 рядків — CSS `field-sizing: content` з `min-height` / `max-height` у `lh`. Лічильник під полем, зв'язаний через `aria-describedby`.
- **Сцена (`apps/web/src/screens/RoundBriefing.tsx`, `StageScreen.tsx`).**
  - `RoundBriefing` отримує проп `fit?: boolean`; його передає лише сцена (три виклики: `FinalStage`, `Intro`, `LadderIntro`).
  - З `fit` опис отримує клас `is-fit`. Хук підбирає найбільшу кількість рядків (`-webkit-line-clamp` через змінну `--note-lines`), за якої сцена не прокручується.
  - Чиста функція `fitLines` тестується окремо.
  - Опис довший за 250 символів має клас `is-long` на `.round-brief`.
- **Редактор, поле (`apps/web/src/editor/draft.ts`, `BoardEditor.tsx`, `RoundStrip.tsx`).**
  - `cleanQuestion` виноситься з `cleaned()` на рівень модуля (`cleanedQuestion`) без зміни поведінки.
  - Новий `cellIssue(round, cell)` — перевірка клітинки, яку тепер викликають `problemsOf`, `firstProblem` і стан клітинки.
  - Нові `cellState(round, cell)` і `boardReadiness(round)`.
  - `BoardEditor` малює стани, лічильники категорій і легенду. `RoundStrip` малює позначку на вкладці поля.
- **Довідка ведучого (`apps/web/src/help/settings.ts`, `help/rounds.ts`).** Рядок про довгий опис на заставці й рядок про стани клітинок у редакторі поля.

**Рішення плану там, де специфікація мовчить (і рішення координатора):**

*Опис у редакторі*
- Поле: `rows={4}` (запас для браузерів без `field-sizing`) і CSS:
  ```css
  .field textarea.round-description {
    field-sizing: content;
    min-height: calc(4lh + 1.25rem + 4px);  /* 4 рядки + padding 0.625rem × 2 + рамка 2px × 2 */
    max-height: calc(8lh + 1.25rem + 4px);
    overflow-y: auto;
  }
  ```
  Без `field-sizing` (Firefox, старий Safari) поле лишається на 4 рядки з прокруткою й ручним `resize: vertical`, як зараз. JS-автоматичного росту не робимо.
- Лічильник: `<span id={countId} className="meta field-count">` з текстом `t('roundDescriptionCount', { count, max: LIMITS.roundDescription })` → «123 / 600».
  - `count` — це `(round.description ?? '').length`, без обрізання пробілів: саме це стереже `maxLength`.
  - Клас `is-near`, коли `count > ROUND_DESCRIPTION_WARN` (= 500, константа в `RoundSettings.tsx`). Колір `is-near` — `var(--amber)`.
  - `textarea` має `aria-describedby={countId}`. `aria-live` немає: голосовий помічник не має читати кожну літеру.

*Опис на сцені*
- Кегль. Зараз опис на сцені вже має той самий кегль, що й рядки правил: обидва успадковують `.stage .round-brief { font-size: clamp(1.125rem, 2vw, 2rem) }`. Отже, межа специфікації «не менший за кегль рядків правил» уже досягнута. Тому:
  - короткий опис (≤ 250) — без змін;
  - довгий (`.round-brief.is-long`) не зменшується: тісніший інтервал (`line-height: 1.3`) і ширший блок (`max-width: none` замість `40rem`). Так 600 символів займають ~8 рядків на 1280 px, а не ~12.
- Обрізання — лише зі `fit` (сцена):
  ```css
  .round-brief-note.is-fit {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--note-lines, none);
    line-clamp: var(--note-lines, none);
    overflow: hidden;
  }
  ```
  Повний текст лишається в DOM (його читає голосовий помічник), браузер лише малює три крапки.
- Скільки рядків. Розраховувати наперед ненадійно: правила переносяться, а на заставці поля під описом ростуть кубики й черга. Тому хук міряє:
  - спершу без обмеження: якщо сцена не прокручується, обмеження немає;
  - інакше від 12 рядків вниз, доки сцена прокручується, але не менше 2.
  - «Прокручується»: `document.documentElement.scrollHeight > innerHeight + 1` **або** `.app` (найближчий предок) має `scrollHeight > clientHeight + 1`. Друга умова — для сцен, замкнених у `100dvh; overflow: hidden` (заставка «Мільйонера»).
  - Хук перераховує на зміну тексту й `newcomers`, на `resize` вікна й через `ResizeObserver` на `.app` (кубики й черга поля з'являються пізніше). Перерахунок іде через `requestAnimationFrame`, без React-стану: хук пише `style.setProperty('--note-lines', …)` і `dataset.lines` прямо в елемент. React цих властивостей не чіпає, бо пропа `style` в елемента немає.
  - Без `ResizeObserver` (jsdom) хук міряє один раз, як `PinBoard.tsx`.
- Пульт і телефон — без `fit`: опис повністю, прокрутка звичайна. Редакторський попередній перегляд у `RoundSettings` — теж без `fit`.

*Стан клітинки*
- **Одне джерело.** `problemsOf`, `firstProblem` і `cellState` викликають той самий `cellIssue(round, cell)`. Його тіло — колишній виклик `problemKey(cell.question, cellPlace(round, cell))`. `cellState` спершу чистить запитання тим самим `cleanedQuestion`, що й `cleaned()`: «   » стає порожнім текстом, порожні варіанти понад мінімум відкидаються. Тому редактор і збереження бачать те саме запитання.
- **Порожня** — після чищення `question.text === ''` (це й `problemNoText`). **Не заповнена** — `cellIssue` повертає інший ключ. **Готова** — `null`.
- **Прогалина, яку закриваємо.** Схема (`quizSchema`) відкидає сортування на клітинці, що не є звичайною клітинкою з телефона (`sort_cell`). `problemKey` цього не перевіряв: така клітинка вийшла б «готовою», а збереження впало б на `problemGeneric`. Тому:
  - `Place` отримує поле `sort`: у `ANYWHERE` і `roundPlace` — `true`, у `cellPlace` — `phone`;
  - `problemKey` повертає новий ключ `problemSortPlace`.

  Редактор такої клітинки сам не створює (тип «сортування» примусово ставить `kind: 'normal'`, `answerMode: 'phone'`), але старі чернетки можуть її мати.
  - Ланцюжок на полі редактор не пропонує (`questionTypesFor('board')`), тож окремої перевірки не додаємо.
  - Дублікати id не стосуються окремої клітинки.
- **Вибрана клітинка** — біле кільце `outline: 3px solid var(--paper); outline-offset: 2px`. Зараз вибрана клітинка має бурштинову рамку й фон, а бурштин тепер означає «не заповнена», тому бурштин з `.is-on` прибираємо. Рамка стану під кільцем лишається видимою.
- Кольори:
  - порожня — пунктир `var(--line)`, фон немає, текст `var(--dim)`;
  - не заповнена — суцільна 2 px `var(--amber)` і «!»;
  - готова — суцільна 1 px `var(--correct)`, фон `rgb(61 220 192 / 0.1)` і «✓».

  Значки в `<span className="board-edit-state" aria-hidden="true">`.
- **Слова станів** (легенда й `aria-label`): «порожня», «не заповнена», «готова». Це приклади `aria-label` зі специфікації («…, готова» / «…, не заповнена»). Назву «недороблена» зі специфікації в інтерфейсі не вживаємо: «не заповнена» зрозуміліша автору.
- **`aria-label` клітинки:** `'Категорія {category}, клітинка {index}: {points}{mark}, {state}'`. Початок рядка той самий, тож наявні регулярні вирази `/^Категорія 1, клітинка 1: 100/` у тестах і e2e працюють. Два точні імена в e2e (рядки з `200 ×2`) переходять на регулярні вирази (задача 4).
- **Заголовок категорії:** під полем назви — `<span className="meta board-edit-ready">` з «{ready} / {total} готово». Якщо назва порожня, поле назви має клас `is-incomplete` (рамка `var(--amber)`), `aria-invalid="true"`, а лічильник починається з «! ». Порожня назва не зменшує «готово»: це лічильник клітинок.
- **Легенда** під полем (`<p className="meta board-legend" aria-label="Стан клітинок">`): три зразки-квадратики з підписами. Якщо є неготові клітинки, наприкінці стоїть « · 2 не готові» (`countText('boardNotReady', n)`). Так кількість видно й тоді, коли раунд один і вкладок немає: `RoundStrip` показує вкладки лише з кількома раундами.
- **Позначка на вкладці** (`RoundStrip`, лише раунди `board`): `<span id={…} className="round-tab-badge">2 не готові</span>` усередині кнопки вкладки.
  - Кнопка отримує `aria-label={назва раунду}` і `aria-describedby` на позначку. Доступне ім'я вкладки лишається назвою раунду, тож наявні точні пошуки вкладок (`QuizEditor.test.tsx`: «Ігрове поле»; e2e: `.round-tabs` «Поле») не ламаються.
  - Число — лише неготові **клітинки**. Порожня назва категорії видна в заголовку й у списку проблем після «Зберегти».
- Інші раунди (класика, бліц тощо) без підсвічування — так у специфікації.

*Довідка*
- `setting.newcomers` (`help/settings.ts`), до `how`: «Опис раунду (до {LIMITS.roundDescription} символів) стоїть на заставці над пам’яткою. Якщо разом не вміщається на сцені, сцена обрізає опис трьома крапками; телефони й пульт показують його повністю.»
- `round.board` (`help/rounds.ts`), до `tip`: «У редакторі клітинка з ✓ готова, з ! — не заповнена, пунктирна — порожня; над стовпцем видно, скільки готово. “Зберегти” перевіряє те саме.»

*Чого не робимо*
- підсвічування заповнення поза полем;
- зміни ліміту опису вікторини (500);
- довшої заставки для довгого опису — це 11g;
- нового демо-вмісту (тексти e2e — без тем росії й СРСР).

## Глобальні обмеження

- **Старі вікторини й бали не змінюються.** Рушій, сервер і зрізи не змінюються зовсім. Наявні тести лишаються зеленими без змін, крім навмисних (див. «Порядок збирання»).
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`, тексти довідки — лише в `apps/web/src/help/*.ts`.
- Сцена 1280 × 720 без прокрутки й без обрізаних блоків (`expectStageInView`) на заставці поля з 600 символами опису, поясненням для новачків і чотирма рядками правил, до й після кубиків.
- Телефон 375 px — без горизонтальної прокрутки, і в редакторі поля, і на заставці.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2`. Якщо PGlite падає з браком пам'яті, запускати окремо:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=1 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- Наскрізні тести: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts`.
  - **Повний прогін триває близько 12 хвилин:** запускати у фоні й чекати завершення.
  - Кадри лежать в `apps/server/e2e/artifacts/shots`, префікс 11a — `p11a-`.
- Новий вміст (тексти e2e) — без тем росії й СРСР.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать. Живих ігор пуш не обриває: стан гри не змінився.

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/quiz.ts`, `quiz.test.ts` | `LIMITS.roundDescription` 600 | 1 |
| `apps/web/src/editor/RoundSettings.tsx`, `i18n.ts`, `styles.css`, `editor/QuizEditor.test.tsx` | поле на 4–8 рядків, лічильник | 1 |
| `apps/web/src/screens/RoundBriefing.tsx`, новий `RoundBriefing.test.tsx`, `StageScreen.tsx`, `styles.css`, `StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `HostScreen.test.tsx` | `fit`, `is-long`, `fitLines`, обрізання на сцені | 2 |
| `apps/web/src/editor/draft.ts`, `i18n.ts`, `editor/draft.test.ts` | `cleanedQuestion`, `cellIssue`, `sort` у `Place`, `cellState`, `boardReadiness` | 3 |
| `apps/web/src/editor/{BoardEditor,RoundStrip}.tsx`, `i18n.ts`, `styles.css`, `BoardEditor.test.tsx`, `QuizEditor.test.tsx`, `help/{settings,rounds}.ts`, `help/host-help.test.ts`, `apps/server/e2e/full-game.e2e.ts` (два точні імена) | стани клітинок, лічильники, легенда, позначка вкладки, довідка | 4 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 11a з кадрами `p11a-` | 5 |

## Порядок збирання

- 1 → 2. 3 → 4. Пари незалежні, 3 можна робити паралельно з 1–2. 5 — остання.
- **Навмисні зміни наявних очікувань** (лише такі):
  - `quiz.test.ts`, «round description»: `'а'.repeat(200)` / `201` → `600` / `601`;
  - `QuizEditor.test.tsx`, «saves an author note…»: `maxlength` `'200'` → `'600'`;
  - `full-game.e2e.ts`: точні імена клітинок редактора `'Категорія 1, клітинка 2: 200 ×2'` (сценарій сортування 7f) і `'Категорія 2, клітинка 3: 200 ×2'` → регулярні вирази `/^Категорія 1, клітинка 2: 200 ×2, /` і `/^Категорія 2, клітинка 3: 200 ×2, /`;
  - тести `host-help.test.ts`, що звіряють буквально записи `setting.newcomers` чи `round.board` або результат `searchHelp`, якщо новий рядок їх змінює.
  - Якщо падає інше, рецензент розбирає причину, а не правку очікування.

## На що дивитися рецензентові

1. **Ліміт.** 600 у `LIMITS`, сім схем раундів беруть його. 601 відкидається, старі описи проходять. `maxLength` поля дорівнює 600. Тести: задача 1.
2. **Лічильник.** «N / 600», `is-near` лише з 501. `aria-describedby` є, `aria-live` немає. Тести: задача 1.
3. **Сцена.** `fit` передає лише сцена. Пульт, телефон і попередній перегляд в редакторі показують повний текст без `is-fit`. `fitLines` дає `null` без переповнення, інакше найбільше значення ≤ 12, за якого сцена не прокручується, і не менше 2. Хук стоїть за `ResizeObserver` і `requestAnimationFrame`, без нескінченного циклу. Тести: задача 2, кадри задачі 5.
4. **Одне джерело.** `problemsOf` і `firstProblem` клітинок викликають `cellIssue`. `cellState` чистить тим самим `cleanedQuestion`. Для кожної клітинки «готова» ⇔ у `problemsOf` немає рядка «Категорія c, запитання i:». Тести: задача 3.
5. **Сортування на усній клітинці.** `problemSortPlace`, а не «готова» з `problemGeneric` при збереженні. Тести: задача 3.
6. **Поле.** Три стани відрізняються рамкою й значком, не лише кольором. Вибрана клітинка має кільце, а не бурштин. Стан стоїть в `aria-label`. «x / y готово» в кожному стовпці, порожня назва позначена. Легенда з кількістю. Позначка вкладки не змінює доступного імені. Тести: задача 4.
7. **Довідка.** Рядки правдиві: 600 з `LIMITS`, обрізання лише на сцені, «Зберегти» перевіряє те саме. Тести: задача 4.
8. **Старе не змінилося.** `GAME_STATE_VERSION`, рушій, сервер, зрізи — без змін (`git diff --stat` не торкається `packages/engine`, `apps/server/src`).

---

### Задача 1. Ліміт опису 600 і поле редактора на 4–8 рядків з лічильником

**Files:**
- Modify: `packages/shared/src/quiz.ts`
- Test: `packages/shared/src/quiz.test.ts`
- Modify: `apps/web/src/editor/RoundSettings.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/editor/QuizEditor.test.tsx`

**Interfaces:**
- `quiz.ts`: `LIMITS.roundDescription: 600` з коментарем `/** Опис раунду для гравців: ~8–10 речень (11a). */`.
- `RoundSettings.tsx`:
  ```ts
  /** З якої довжини лічильник опису жовтіє (11a). */
  export const ROUND_DESCRIPTION_WARN = 500;
  ```
  - `textarea`: `rows={4}`, `className="round-description"`, `maxLength={LIMITS.roundDescription}`, `aria-describedby={countId}` (`useId()`).
  - Під `textarea`, усередині `label.field`: `<span id={countId} className={near ? 'meta field-count is-near' : 'meta field-count'}>{t('roundDescriptionCount', { count, max: LIMITS.roundDescription })}</span>`.
- `i18n.ts`: `roundDescriptionCount: '{count} / {max}'`.
- `styles.css`: правило `.field textarea.round-description` з розділу «Опис у редакторі»; `.field-count { justify-self: end; font-variant-numeric: tabular-nums; }`; `.field-count.is-near { color: var(--amber); }`.

- [ ] **Step 1: Write the failing tests**
  - `quiz.test.ts` («round description»): `'а'.repeat(600)` → `true`, `'а'.repeat(601)` → `false`. Старий рядок з 200 / 201 замінити.
  - `QuizEditor.test.tsx` («saves an author note…»): `maxlength` → `'600'`. Новий тест «round description counter»:
    - після відкриття: поле `rows` = `'4'`, під ним «0 / 600», без `is-near`;
    - `fill('Опис раунду для гравців', 'Кіно 90-х')` → «9 / 600»;
    - `'а'.repeat(500)` → «500 / 600», без `is-near`;
    - `'а'.repeat(501)` → «501 / 600», з `is-near`;
    - `screen.getByLabelText('Опис раунду для гравців').getAttribute('aria-describedby')` вказує на елемент з текстом «501 / 600».
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared apps/web/src/editor` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src apps/web/src
  git commit -m "feat: round descriptions up to 600 characters — a four-line editor field that grows to eight with a counter that turns amber past 500"
  ```

### Задача 2. Сцена: довгий опис ширший і обрізається трьома крапками, якщо не вміщається; телефон і пульт — повністю

**Files:**
- Modify: `apps/web/src/screens/RoundBriefing.tsx`, `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/styles.css`
- Create: `apps/web/src/screens/RoundBriefing.test.tsx`
- Test: `apps/web/src/screens/StageScreen.test.tsx`, `apps/web/src/screens/PlayerScreen.test.tsx`, `apps/web/src/screens/HostScreen.test.tsx`

**Interfaces:**
- `RoundBriefing.tsx`:
  ```ts
  /** Опис, довший за це, на сцені ширший і з тіснішим інтервалом (11a). */
  export const LONG_NOTE = 250;
  /** Межі обрізання опису на сцені, рядків. */
  export const STAGE_NOTE_LINES = { max: 12, min: 2 } as const;

  /**
   * Скільки рядків опису лишити: null — обмеження не треба (без нього не переповнено);
   * інакше найбільше з max…min, за якого не переповнено, або min.
   * overflows(lines) застосовує обмеження й каже, чи сцена прокручується.
   */
  export function fitLines(overflows: (lines: number | null) => boolean, max = STAGE_NOTE_LINES.max, min = STAGE_NOTE_LINES.min): number | null;

  export function RoundBriefing(props: { brief: RoundBrief; description: string; newcomers?: boolean; fit?: boolean }): JSX.Element;
  ```
  - `.round-brief` отримує `is-long`, коли `description.trim().length > LONG_NOTE`.
  - З `fit` і непорожнім описом `<p className="round-brief-note is-fit" ref={noteRef}>`. Приватний хук `useStageFit(noteRef, enabled, [description, newcomers])`:
    - `apply(lines)` → `style.setProperty('--note-lines', lines === null ? 'none' : String(lines))` і `dataset.lines = lines === null ? 'none' : String(lines)`;
    - `overflows(lines)` → `apply(lines)`, потім умова «прокручується» з розділу «Опис на сцені»;
    - після `fitLines` хук ще раз викликає `apply(result)`: на межі `min` останнім застосованим лишилося `min + 1`;
    - `useLayoutEffect`: `fitLines(overflows)` одразу; далі `resize` вікна й `ResizeObserver` на `noteRef.current.closest('.app')` (за наявності) → `requestAnimationFrame` → `fitLines(overflows)`; прибирання — `disconnect`, `removeEventListener`, `cancelAnimationFrame`.
- `StageScreen.tsx`: `fit` у трьох викликах `RoundBriefing` (`FinalStage`, `Intro`, `LadderIntro`).
- `styles.css`:
  - `.round-brief-note.is-fit { … }` з розділу «Опис на сцені»;
  - `.stage .round-brief.is-long { max-width: none; }`;
  - `.stage .round-brief.is-long .round-brief-note { line-height: 1.3; }`.

- [ ] **Step 1: Write the failing tests**
  - `RoundBriefing.test.tsx` (`// @vitest-environment jsdom`):
    - `fitLines(() => false)` → `null`;
    - `fitLines((lines) => lines === null || lines > 4)` → `4`;
    - `fitLines(() => true)` → `2`;
    - `fitLines((lines) => lines === null)` → `12`;
    - перший виклик `overflows` — з `null`, далі 12, 11, … (записати аргументи, для `lines > 4` → `[null, 12, 11, 10, 9, 8, 7, 6, 5, 4]`);
    - `render(<RoundBriefing brief={emptyBrief('classic')} description={'а'.repeat(251)} />)` → `.round-brief.is-long`, без `.is-fit`; з `'а'.repeat(250)` — без `is-long`; текст опису повний;
    - з `fit` і 600 символами: `.round-brief-note.is-fit`, `textContent` — усі 600 символів, `dataset.lines === 'none'` (у jsdom розміри 0 — переповнення немає);
    - з `fit` і змодельованим переповненням: `window.innerHeight = 720`, геттер `document.documentElement.scrollHeight`:
      ```ts
      () => { const lines = document.querySelector<HTMLElement>('.round-brief-note')?.dataset.lines; return lines === undefined || lines === 'none' ? 900 : 600 + Number(lines) * 30; }
      ```
      → після рендеру `dataset.lines === '4'`. Після тесту властивість повернути (`configurable: true`).
    - з `fit` і порожнім описом `.round-brief-note` немає.
  - `StageScreen.test.tsx` (блок заставки біля рядка 199): заставка класики з `description: 'а'.repeat(600)` → `.round-brief-note.is-fit` і `.round-brief.is-long`; те саме для заставки поля й фіналу (фабрики є в цьому файлі).
  - `PlayerScreen.test.tsx` і `HostScreen.test.tsx`: заставка з 600 символами → текст повністю (`getByText('а'.repeat(600))`), `.is-fit` немає.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): long round descriptions on the stage — wider with tighter lines, clipped with an ellipsis to the most lines that keep the 1280 × 720 stage from scrolling (refit when the board dice and order grow); phones and the host show the whole text"
  ```

### Задача 3. Стан клітинки з тієї самої перевірки, що й збереження

**Files:**
- Modify: `apps/web/src/editor/draft.ts`, `apps/web/src/i18n.ts`
- Test: `apps/web/src/editor/draft.test.ts`

**Interfaces:**
- `draft.ts`:
  ```ts
  /** Запитання в тому вигляді, у якому воно піде на сервер (те саме чищення, що в cleaned). */
  export function cleanedQuestion(question: Question): Question;

  /** Що заважає зберегти клітинку (уже почищену); null — клітинка готова. Одне джерело для problemsOf, firstProblem і cellState. */
  export function cellIssue(round: BoardRound, cell: BoardCell): TextKey | null;

  export type CellState = 'empty' | 'incomplete' | 'ready';
  /** Стан клітинки в редакторі: порожня (немає тексту), не заповнена (cellIssue ≠ null) чи готова. */
  export function cellState(round: BoardRound, cell: BoardCell): CellState;

  export interface CategoryReadiness { ready: number; total: number; titleMissing: boolean }
  export interface BoardReadiness { ready: number; total: number; notReady: number; categories: CategoryReadiness[] }
  /** Скільки клітинок поля готові: усього й по категоріях; порожня назва категорії — окремо. */
  export function boardReadiness(round: BoardRound): BoardReadiness;
  ```
  - `cleanedQuestion` — колишні `cleanBody` + `cleanQuestion` з `cleaned()` на рівні модуля; `cleaned()` викликає їх. Поведінка `cleaned` не змінюється: наявні тести `cleaned` / `problemsOf` зелені без змін.
  - `cellIssue(round, cell)` = `problemKey(cell.question, cellPlace(round, cell))`. Цикли клітинок у `problemsOf` і `firstProblem` викликають `cellIssue` замість прямого `problemKey(…, cellPlace(…))`.
  - `cellState`: `const question = cleanedQuestion(cell.question)`; `question.text === ''` → `'empty'`; `cellIssue(round, { ...cell, question }) !== null` → `'incomplete'`; інакше `'ready'`.
  - `boardReadiness`: `titleMissing = category.title.trim() === ''`, `notReady = total − ready`.
  - `Place.sort: boolean`: `ANYWHERE.sort = true`; `roundPlace(...)` — `sort: true` в обох гілках; `cellPlace` — `sort: phone`. У `problemKey` поруч з іншими перевірками місця: `if (question.type === 'sort' && !place.sort) return 'problemSortPlace';`.
- `i18n.ts`: `problemSortPlace: 'Запитання {index}: сортування діє лише на звичайній клітинці поля з телефона.'`.

- [ ] **Step 1: Write the failing tests** (`draft.test.ts`, новий `describe('board readiness (11a)')`). Помічник `filled(text, a = 'Осло', b = 'Берген')` — `newQuestion('single')` з текстом і двома заповненими варіантами (`correctId` — перший).
  - `cellState`:
    - клітинка з `newBoardRound()` → `'empty'`;
    - текст `'   '` → `'empty'`;
    - текст «Столиця Норвегії?» з порожніми варіантами → `'incomplete'`;
    - `filled('Столиця Норвегії?')` → `'ready'`;
    - `newQuestion('text')` з текстом «Найвища гора України?» і `accepted: ['']` → `'incomplete'` (після чищення `accepted` порожній);
    - заповнене «Хто я?» (3 підказки, `accepted: ['Говерла']`, інтервал і час такі, щоб на звичайній клітинці з телефона було `'ready'`) на клітинці `kind: 'blitz'` → `'incomplete'` (`problemCluesPlace`);
    - заповнене сортування (2 категорії, 4 слова, `points: 100`, `lockSeconds: LIMITS.defaultLockSeconds`) на звичайній клітинці з телефона → `'ready'`; та сама клітинка з `answerMode: 'voice'` → `'incomplete'`, і `problemsOf` вікторини з нею містить «сортування діє лише на звичайній клітинці поля з телефона».
  - `boardReadiness`:
    - `newBoardRound()` → `{ ready: 0, total: 9, notReady: 9 }`, усі три категорії `{ ready: 0, total: 3, titleMissing: true }`;
    - поле «Річки» / «Гори» / `''` зі станами `[ready, empty, incomplete]`, `[ready, ready, ready]`, `[ready, ready, empty]` → `{ ready: 6, total: 9, notReady: 3 }`, категорії `{1,3,false}`, `{3,3,false}`, `{2,3,true}`.
  - **Одне джерело:** у вікторині з цим полем (назва «Гра») для кожної клітинки `(c, i)`: `cellState(...) === 'ready'` ⇔ жоден рядок `problemsOf(quiz)` не містить `Категорія ${c + 1}, запитання ${i + 1}:`. Окремо: `problemsOf` містить «Категорія 3: немає назви.».
  - Поле з усіма готовими клітинками й назвами → `problemsOf` порожній, `boardReadiness(...).notReady === 0`.
  - `firstProblem` на тому самому полі → `{ round: 0, question: 1, cell: { category: 0, index: 1 } }` (перша неготова клітинка).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/editor/draft.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): board cell readiness from the save check — empty, incomplete or ready through one cellIssue used by problemsOf, firstProblem and the editor; sorting off a phone cell is now caught before the schema"
  ```

### Задача 4. Редактор поля: стани клітинок, «x / y готово», легенда, позначка вкладки; довідка

**Files:**
- Modify: `apps/web/src/editor/BoardEditor.tsx`, `apps/web/src/editor/RoundStrip.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`, `apps/web/src/help/settings.ts`, `apps/web/src/help/rounds.ts`, `apps/server/e2e/full-game.e2e.ts` (лише два точні імена, див. «Порядок збирання»)
- Test: `apps/web/src/editor/BoardEditor.test.tsx`, `apps/web/src/editor/QuizEditor.test.tsx`, `apps/web/src/help/host-help.test.ts`

**Interfaces:**
- `BoardEditor.tsx`:
  - `const readiness = boardReadiness(round)`; для кожної клітинки `const state = cellState(round, cell)`;
  - кнопка клітинки: `className` = `board-edit-cell is-${state}` + `is-on` для вибраної; `aria-label` = `t('boardCellLabel', { …як зараз, state: t(\`boardCellState_${state}\` as TextKey) })`; усередині, після ціни й позначок, — `<span className="board-edit-state" aria-hidden="true">{state === 'ready' ? '✓' : state === 'incomplete' ? '!' : ''}</span>`;
  - поле назви категорії: `is-incomplete` і `aria-invalid` при порожній назві;
  - під полем назви: `<span className="meta board-edit-ready">{(titleMissing ? '! ' : '') + t('boardCategoryReady', { ready, total })}</span>`;
  - після `.board-frame`: `<p className="meta board-legend" aria-label={t('boardLegendLabel')}>` з трьома `<span className="board-legend-item"><span className="board-legend-swatch is-empty|is-incomplete|is-ready" aria-hidden="true">…</span>{t('boardCellState_…')}</span>`; якщо `readiness.notReady > 0`, наприкінці — ` · ${countText('boardNotReady', n, { count: n })}`.
- `RoundStrip.tsx`: для вкладки раунду `board` з `boardReadiness(round).notReady > 0` кнопка отримує `aria-label={nameOf(round, index)}` і `aria-describedby={badgeId}`, а всередині — `<span id={badgeId} className="round-tab-badge">{countText('boardNotReady', n, { count: n })}</span>`. `badgeId` = `${baseId}-${index}`, де `const baseId = useId()` — один виклик на початку компонента. Інші вкладки без змін.
- `i18n.ts`:
  - `boardCellLabel: 'Категорія {category}, клітинка {index}: {points}{mark}, {state}'`;
  - `boardCellState_empty: 'порожня'`, `boardCellState_incomplete: 'не заповнена'`, `boardCellState_ready: 'готова'`;
  - `boardCategoryReady: '{ready} / {total} готово'`;
  - `boardLegendLabel: 'Стан клітинок'`;
  - `boardNotReady_one: '{count} не готова'`, `boardNotReady_few: '{count} не готові'`, `boardNotReady_many: '{count} не готових'`.
- `styles.css`:
  - `.board-edit-cell.is-empty { border-style: dashed; color: var(--dim); }`;
  - `.board-edit-cell.is-incomplete { border: 2px solid var(--amber); }`;
  - `.board-edit-cell.is-ready { border-color: var(--correct); background: rgb(61 220 192 / 0.1); }`;
  - `.board-edit-cell.is-on { outline: 3px solid var(--paper); outline-offset: 2px; }` (бурштинові `border-color`, `background`, `color` з `.is-on` прибрати);
  - `.board-edit-title.is-incomplete { border: 2px solid var(--amber); }`;
  - `.board-legend { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; margin: 0.5rem 0 0; }`; зразки — квадрат 1rem з тими самими рамками й фоном, що й стани;
  - `.round-tab-badge { margin-left: 0.375rem; font-size: 0.75rem; color: var(--amber); }`.
  - Телефон 375 px: стовпці поля вже гортаються в `.board-frame`, легенда переноситься — горизонтальної прокрутки сторінки немає.
- Довідка — два рядки з розділу «Довідка»; число в `setting.newcomers` — `${LIMITS.roundDescription}`.
- `full-game.e2e.ts`: два точні імена → регулярні вирази (див. «Порядок збирання»).

- [ ] **Step 1: Write the failing tests**
  - `BoardEditor.test.tsx`, новий `describe('BoardEditor readiness (11a)')`. Поле `boardWith(0)` (назви «Спорт», «Міста», «Річки», усі клітинки порожні), далі заповнювати через `filled(...)` (як у задачі 3, локальний помічник):
    - усі клітинки порожні: `getAllByRole('button', { name: /, порожня$/ })` — 9; кожен стовпець «0 / 3 готово»; легенда (`getByLabelText('Стан клітинок')`) містить «порожня», «не заповнена», «готова» і «9 не готових»;
    - клітинка 1/1 готова, 1/2 з текстом без варіантів: `getByRole('button', { name: 'Категорія 1, клітинка 1: 100, готова' })` має клас `is-ready` і значок «✓»; `'Категорія 1, клітинка 2: 200, не заповнена'` має клас `is-incomplete` і «!»; перший стовпець «1 / 3 готово»; легенда «8 не готових»;
    - вибрана клітинка (типово 1/1) має `is-on` разом з `is-ready`;
    - назва категорії 3 порожня → `getByLabelText('Назва категорії 3')` має `is-incomplete` і `aria-invalid="true"`, лічильник стовпця «! 0 / 3 готово»;
    - усе поле готове → немає «не готов» у легенді, кожен стовпець «3 / 3 готово».
  - `QuizEditor.test.tsx`:
    - `open(brokenBoard())` (одна порожня клітинка 2/3) → вкладка `getByRole('button', { name: 'Ігрове поле' })` (точне ім'я не змінилося) має `aria-describedby` на елемент «1 не готова»; вкладка класичного раунду позначки не має;
    - після заповнення клітинки 2/3 (текст і варіанти) позначка зникає;
    - наявні тести «opens the broken board cell…» і «does not jump back…» — зелені без змін.
  - `host-help.test.ts`:
    - `text('setting.newcomers')` містить `String(LIMITS.roundDescription)` і «трьома крапками»;
    - `text('round.board')` містить «✓», «не заповнена» і «Зберегти».
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/editor apps/web/src/help` → FAIL.
- [ ] **Step 3: Implement.** Замінити два точні імена в `full-game.e2e.ts`. Перевірити `grep -n "клітинка [0-9]: " apps/server/e2e/full-game.e2e.ts`: решта пошуків — регулярні вирази з `^`, інших точних імен клітинок редактора немає.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src apps/server/e2e
  git commit -m "feat(web): board editor marks cells empty (dashed), incomplete (amber, !) or ready (accent, ✓) with the state in the cell label, a white ring for the picked cell, «x / y готово» per category with a marked empty title, a legend with the not-ready count and a not-ready badge on the board round tab; host help on long descriptions and cell marks"
  ```

### Задача 5. Наскрізний сценарій 11a з кадрами

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–4. Помічники файлу:
  - `open`, `register`, `join`, `shot`, `afterSplash`, `click`, `field`, `exact`;
  - `expectNoSideScroll`, `expectStageInView`, `snapshot`, `rigged`;
  - фікстури `boardRound`, `classicRound`, `makeRoundsQuiz` з `@quiz/engine/testing`.
- Константи сценарію (вміст — без тем росії й СРСР):
  ```ts
  const NOTE_TAIL = 'Удачі на полі!';
  const NOTE_BODY =
    'Це поле — про річки, гори й острови світу. Кожен по черзі вибирає клітинку, а відповідає той, хто вибрав. ' +
    'Дешеві клітинки вгорі, дорогі внизу; дві клітинки приховують ×2, одна — бліц, де відповідає найшвидший. ' +
    'На усній клітинці відповідайте вголос, ведучий позначить результат. ';
  const LONG_NOTE_TEXT = `${NOTE_BODY.repeat(4).slice(0, 600 - NOTE_TAIL.length - 1).trimEnd().padEnd(600 - NOTE_TAIL.length - 1, '.')} ${NOTE_TAIL}`;
  // expect(LONG_NOTE_TEXT.length).toBe(600) — на початку сценарію.
  ```

- [ ] **Step 1: Add the scenario** у кінець файлу за зразком 10j:
  ```ts
  it('part 11a: editor — a 600-character round description with a counter, clipped with an ellipsis on the 1280 × 720 stage next to the newcomers note and the longest board rules (before and after the dice) but whole on the phone and the host; board cells marked empty, incomplete and ready by the same check as saving, per-category counts, a legend and a round tab badge (375 px too)', async () => {
    try {
      await editorGame11a();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Підготовка `editorGame11a()`:**
  1. `const host = await open('host11a', 1280, 900); await register(host, 'host', 'Ірина Ведуча', 'host11a@example.com');`
  2. Помічник `q(id, text, a, b, points)` — `single` з двома варіантами (`${id}-a` правильний), `imageUrl: null`, `video: null`, `timeLimit: 30`.
  3. Раунд `rb11a` — `boardRound('rb11a', …, { title: 'Поле 11a', description: LONG_NOTE_TEXT, answerMode: 'phone', check: 'auto', rules: { penalty: 'minus', partial: null, streak: { length: 3, bonus: { kind: 'percent', value: 50 } }, multiplier: 2 } })`. Категорії:
     - «Річки»:
       - `r1` «Яка річка тече через Відень?» (Дунай / Рейн), 100;
       - `r2` «Через яке місто тече Темза?» (Лондон / Париж), 200, `mark: 'x2'`;
       - `r3` «Яка річка найдовша в Україні?» (Дніпро / Дністер), 300, `kind: 'blitz'`, `penalty: 'all'`;
     - «Гори»:
       - `g1` «Найвища гора України?» (Говерла / Петрос), 100;
       - `g2` «Монблан стоїть на кордоні Франції та…» (Італії / Іспанії), 200, `answerMode: 'voice'`;
       - `g3` «Найвища гора світу?» (Еверест / Кіліманджаро), 300, `mark: 'x3'`;
     - «Острови»:
       - `o1` «Найбільший острів світу?» (Гренландія / Мадагаскар), 100;
       - `o2` «На якому острові стоїть Палермо?» (Сицилія / Сардинія), 200;
       - `o3` «Хортиця — острів на якій річці?» (Дніпро / Дунай), 300.

     Це найдовші правила поля: чотири рядки (`summaryBoard`; «телефон або вголос»; бліц-клітинка; позначки · мінус усім · штраф · серія · ×2).
  4. Раунд `rc11a` — `{ ...classicRound('rc11a', [q('c1', 'Скільки континентів на Землі за найпоширенішою моделлю?', '7', '6', 100)], { title: 'Розминка', speedBonus: false }), description: 'Коротко: одне запитання для розгону.' }`.
  5. `makeRoundsQuiz([rb11a, rc11a], { leaderboard: 'each', newcomers: true })`, `title: 'Редактор 11a'` → `POST /api/quizzes`, `expect(saved.ok())`.

  **Кроки з перевірками й кадрами (у такому порядку):**
  1. **Опис у редакторі (1280 × 900).** `/quizzes` → «Редагувати» у «Редактор 11a» → `main.editor`. Відкрити «Налаштування раунду» (`summary`), якщо закрито.
     - `field(host, 'Опис раунду для гравців').inputValue()` має довжину 600; `.field-count` — «600 / 600» з класом `is-near`.
     - Висота поля з 600 символами (`boundingBox().height`) більша, ніж після `fill('Коротко')`. Лічильник «7 / 600» без `is-near`. Повернути `fill(LONG_NOTE_TEXT)`.
     - Кадр `p11a-editor-description`.
  2. **Поле в редакторі.**
     - `getByRole('button', { name: /^Категорія \d, клітинка \d: .*, готова$/ })` — 9; три «3 / 3 готово»; `.round-tab-badge` — 0.
     - Клітинка `/^Категорія 1, клітинка 1: 100/` → `field(host, 'Текст запитання').fill('')` → є кнопка з іменем `'Категорія 1, клітинка 1: 100, порожня'` (`exact`).
     - Клітинка `/^Категорія 2, клітинка 3: 300/` → `field(host, 'Варіант 2').fill('')` → `'Категорія 2, клітинка 3: 300 ×3, не заповнена'` (`exact`).
     - `field(host, 'Назва категорії 3').fill('')` → поле має клас `is-incomplete`.
     - Лічильники стовпців: «2 / 3 готово», «2 / 3 готово», «! 3 / 3 готово». Легенда містить «2 не готові». Вкладка `.round-tabs` «Поле 11a» (`exact`, ім'я не змінилося) містить `.round-tab-badge` «2 не готові».
     - У вибраної клітинки 2/3 класи `is-on` і `is-incomplete`; `getComputedStyle(...).outlineStyle === 'solid'`.
     - Кадр `p11a-editor-board`.
     - 375 × 812: `expectNoSideScroll(host, 'p11a-editor-board-375')` → назад 1280 × 900.
     - «Зберегти» → `ul.problems` містить «Категорія 3: немає назви.», «Категорія 1, запитання 1: впишіть текст запитання.» і «Категорія 2, запитання 3: заповніть усі варіанти» (з префіксом раунду), інших рядків немає (`li` — 3). URL лишається на редакторі. Кадр `p11a-editor-problems`.
     - Відновити: клітинка 1/1 — текст «Яка річка тече через Відень?»; клітинка 2/3 — «Варіант 2» «Кіліманджаро»; назва 3 — «Острови». Знову 9 «, готова», `.round-tab-badge` — 0.
     - «Зберегти» → `/quizzes`.
  3. **Гра.**
     - «Грати» → `code`, `stageUrl`; `stage = open('stage11a', 1280, 720)`.
     - `olya`, `petro` — `open(…, 375, 812)`, `join` («Оля», «Петро»).
     - «Почати гру» → «Як грати» → пульт «До гри» → `afterSplash(stage, olya, petro)`.
  4. **Заставка поля на сцені.**
     - `.round-brief.is-long` є; `.round-brief-how` видно; `.round-brief-lines li` — 4.
     - `.round-brief-note`: `textContent === LONG_NOTE_TEXT`; `dataset.lines` — число від 2 до 12; `scrollHeight > clientHeight + 1` (обрізано).
     - `expectStageInView(stage, 'p11a-stage-intro')` → кадр `p11a-stage-intro`.
     - `rigged.push(4, 2)` → пульт «Кидати кубики» → «Кинути за тих, хто лишився» → на сцені `.dice-rows .die` і «Порядок визначено».
     - Сцена знову `expectStageInView(stage, 'p11a-stage-dice')`, `dataset.lines` не більше, ніж до кубиків → кадр `p11a-stage-dice`.
  5. **Телефон.**
     - `olya.locator('.round-brief-note')`: `textContent === LONG_NOTE_TEXT`; `.is-fit` немає; `scrollHeight <= clientHeight + 1` (не обрізано); містить `NOTE_TAIL`.
     - `expectNoSideScroll(olya, 'p11a-phone-intro')` (кадр на всю сторінку з прокруткою).
  6. **Пульт.**
     - `host.locator('.round-brief-note')`: повний текст, без `.is-fit`, не обрізано.
     - Кадр `p11a-host-intro`.
     - 375 × 812: `expectNoSideScroll(host, 'p11a-host-intro-375')`.
  7. Наприкінці `expect(problems).toEqual([])`, як в інших сценаріях: жодної помилки сторінки чи консолі (зокрема «ResizeObserver loop…» від хука обрізання).
- [ ] **Step 2: Run** `pnpm build`, потім у фоні `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 11a"` → PASS. Переглянути кадри `p11a-*`:
  - три стани клітинок відрізняються й без кольору (пунктир, «!», «✓»);
  - кільце вибраної клітинки видно поверх бурштину;
  - лічильник читається;
  - на сцені три крапки в кінці видимого опису, пам'ятка й правила не обрізані, черга й кубики в межах екрана;
  - на телефоні й пульті «Удачі на полі!» видно.
- [ ] **Step 3: Повний прогін** у фоні (≈ 12 хв): `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts` → усі сценарії PASS (зокрема 7f і сценарій з `200 ×2` після задачі 4).
- [ ] **Step 4: Commit**
  ```bash
  git add apps/server/e2e
  git commit -m "test: part 11a end-to-end — a 600-character round description with a counter in the editor, clipped with an ellipsis on the 1280 × 720 board intro beside the newcomers note and four rule lines (before and after the dice), whole on the phone and the host; board cells empty, incomplete and ready with per-category counts, a legend, a tab badge and the same three problems on save (375 px too)"
  ```
