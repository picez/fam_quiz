# План 74. Зручний редактор вікторини: вкладки, картки запитання, комбобокси, живі обов'язкові поля й нагадування

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** редактор вікторини (`apps/web/src/editor/QuizEditor.tsx`) отримує дві вкладки («Загальне» / «Раунди й запитання»), запитання — картки («Запитання», «Медіа», «Відповіді», «Час і бали»), тип запитання й раунд вибираються комбобоксом із пошуком, помилки й нагадування видно під час редагування (з «торкнутістю»), а не лише після «Зберегти».

**Архітектура:** чиста частина — `placedProblemsOf` (той самий `problemsOf`, але кожна проблема з місцем), `cardOfProblem`, `remindersOf`, `touchReducer`, `TYPE_GROUPS`, `question-layout` (умови видимості полів, винесені з `QuestionEditor` без змін). Вигляд — спільний `ui/Combobox`, `EditorCard`, `IssuesPanel`; `QuizEditor` лише з'єднує їх. Схема, сервер і правила перевірки не змінюються.

**Стек:** React + Vite, vitest + @testing-library/react (jsdom), e2e — vitest + playwright-core (`apps/server/e2e`).

**Специфікація:** `docs/superpowers/specs/2026-11-23-editor-layout-design.md` (разом із розділом «Уточнення після перевірки»). Макет (лише візуальний орієнтир): `.superpowers/mockups/editor-74.html`.

> **Версія стану: `GAME_STATE_VERSION` — БЕЗ змін.** Схеми, сервера, рушія, міграцій план не торкається.
>
> **Звірка з кодом.** План спирається на `main` 2026-11-23 (`0762ee14`). Номери рядків — орієнтир; перед кожною задачею виконавець звіряє код.

## Що вже є (коротко)

- `QuizEditor.tsx` (639 рядків): назва; п'ять `<details className="rules …">` (правила/`settingsTitle`, `teams`, `powers`, `spares`, `duels`); `RoundStrip` (вкладки-кнопки `.round-tab`, «+ Раунд» зі списком типів раунду, «Перейменувати», «Вище», «Нижче», «Видалити раунд» — лише коли раундів > 1); `RoundSettings` (`details.round-settings`, керований `open/onToggle`); список запитань `ol.question-list` + навігація «‹ 1/12 ☰ ›»; `QuestionEditor`; нижня панель `footer.actions` зі списком `ul.error.problems role="alert"`. `save()` відкриває розгортки за **префіксами текстів** проблем (`startsWith(t('duelsTitle'))`, `trialPrefix`, `betsMaxPrefix`…) і переходить на `firstProblem`.
- `QuestionEditor.tsx` (~893–1029): чипи типів `.type-chips role="group" aria-label="Тип запитання"` (кнопки з текстом `typeShort_*`, `title` = `type_*`); далі `stage-card`: `ImageField` → режим проявлення → `VideoField` → `AudioField` → текст запитання → `BetsCutField` → підказка → `Body`; під карткою — `.pair` (таймер/бали) і `noPointsNote`. Видимість кожного поля — умови в JSX (типи-винятки, `showTime`, `showPoints`, `showHint`, `showVideo`, `showAudio`, `showReveal`, `timeInLimits`). `QuestionEditor` рендерять також `BoardEditor` (клітинка), `SparesEditor` (загальні запасні, запасні категорії, питання на виживання в `RoundSettings`).
- `draft.ts`: `problemKey` (~1406, перша проблема запитання — `TextKey`), `cellIssue`, `ProblemPlace`/`firstProblem` (~1709/1756), `problemText`, `cellProblem`, `duelProblems`, `spareProblems`, `problemsOf` (~1980; тексти з префіксом `problemRound` коли раундів > 1), `booleanCounts`, `questionTypesFor`, `QUESTION_TYPES` (33 типи з `@quiz/shared`). На `problemsOf` — ~366 перевірок у `draft.test.ts`: вони й лишаються охороною текстів і порядку.
- Значки: `TYPE_ICONS`/`typeIcon`, `ROUND_ICONS`, `ROUND_NAMES` у `apps/web/src/guide-text.ts`; `roundLabel(title, index, type)` у `format.ts`.
- Вкладки з `?tab=`: `apps/web/src/pages/GroupPage.tsx` (`role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, типове значення з URL прибирається). `QuizEditor` рендерять лише `pages/EditQuiz.tsx` (під роутером) і тести **без роутера** — тому стан вкладки керується пропсами з `EditQuiz`.
- Спільний ui-компонент без бібліотеки — зразок `apps/web/src/ui/NumberInput.tsx` (+ `NumberInput.test.tsx`).
- Широкий макет (67): `@media (min-width: 1280px)` — `.editor-grid` дві колонки, `.editor-quiz` — дві колонки налаштувань (кінець `styles.css`, блок «67: редактор вікторин»).

## Глобальні обмеження

- **Жодних змін** у `packages/shared`, `packages/engine`, `apps/server/src`, схемі `quizSchema`, `GAME_STATE_VERSION`; жодних міграцій.
- **Правила перевірки не змінюються.** `problemKey`, `cellIssue`, `firstProblem`, тексти й **порядок** `problemsOf` — ті самі; `problemsOf(quiz)` стає `placedProblemsOf(quiz).map((p) => p.text)`. Додається лише місце (`IssuePlace`) і окремі нагадування, що **ніколи** не блокують збереження.
- **Видимість полів `QuestionEditor` — рівно та сама**, що зараз (для кожного типу й кожного набору прапорців); картки лише групують. Охорона — знімок `QuestionEditor.fields.test.tsx` (Задача 4), записаний **до** перебудови.
- Анти-цілі специфікації: не більше кліків на шлях «тип → текст → відповіді → наступне»; **жодного червоного** на щойно створеному порожньому запитанні до «торкнутості»; вікторина, яку можна було зберегти, зберігається й далі; жодне наявне налаштування не зникає.
- Нові тексти — у 7 мовах: uk у `apps/web/src/i18n.ts`, решта в `apps/web/src/locales/{en,de,pl,es,it,ar}.json`; новий список **`ADDED_74`** у `apps/web/src/i18n.test.ts` і в загальному фільтрі «adds no uk keys beyond the agreed list» (рядок ~1047). Нові uk-тексти — на «ти». Перекладені значення ≠ uk, змінні `{…}` ті самі; `locales/checks.test.ts` має пройти. Без множинних форм (тексти побудовано як «Помилок: {count}»). Старі ключі (`settingsTitle` тощо) **не видаляти**.
- Комбобокс — лише для типу запитання й вибору раунду. Інші `<select>` (рейтинг, режими перевірки, режим клітинки тощо) лишаються рідними.
- **Prettier не запускати.** Коментарі в коді — українською. `python3` тут заглушка: правити лише Edit-інструментом або node-скриптами; після коміту — `git show --stat`.
- Юніт-тести — з кореня, на передньому плані: `pnpm vitest run --project web --maxWorkers=2 <шляхи>`. Типи: `pnpm typecheck` (ціле дерево, разом з `apps/server/e2e`). E2E одного файлу: `pnpm build && pnpm vitest run --config apps/server/e2e/vitest.config.ts <назва> --maxWorkers=2`.
- CSS — блок «74» **у кінці** `apps/web/src/styles.css`, лише нові селектори (`.combo*`, `.editor-tabs`, `.editor-tab*`, `.editor-card*`, `.editor-general`, `.round-bar*`, `.round-menu*`, `.issues*`, `.question-item-mark`, `.is-required`); без `@media (max-width: …)`: телефон — базові правила, ширше — `@media (min-width: 600px)` / `(min-width: 1280px)`. Наявні класи, на які спираються e2e (`details.rules.powers/.spares/.duels`, `details.round-settings`, `.question-field`, `.question-list`, `.question-item`, `.editor-grid`, `.editor-side`, `.editor-stage`, `ul.problems`), **лишаються**.
- Живий підрахунок проблем: `useMemo` від `quiz` і `useDeferredValue(quiz)` — набір тексту в запитанні вікторини на 200 запитань не має гальмувати.
- Повідомлення комітів — англійською в стилі репозиторію, наприкінці «(74)», і два рядки-причепи:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPgRo4NbMXbCQVe4EC6
  ```
- Не комітити нічого поза файлами задачі.

### Нові ключі i18n (uk)

| Ключ | uk |
|---|---|
| `editorTabs` | `Розділи редактора` |
| `editorTabGeneral` | `Загальне` |
| `editorTabRounds` | `Раунди й запитання` |
| `editorTabErrors` | `Помилок: {count}` |
| `requiredMark` | `обов’язкове поле` |
| `issuesButton` | `⚠ Помилок: {errors} · нагадувань: {reminders}` |
| `issuesNone` | `✓ Усе заповнено` |
| `issuesTitle` | `Зауваження` |
| `issuesErrors` | `Не дадуть зберегти` |
| `issuesReminders` | `Нагадування — зберегти можна` |
| `issuesClose` | `Закрити` |
| `saveBlocked` | `Не збережено — помилок: {count}.` |
| `saveBlockedShow` | `Показати` |
| `cardAbout` | `Про вікторину` |
| `cardRules` | `Як грати` |
| `cardQuestion` | `Запитання` |
| `cardMedia` | `Медіа` |
| `cardMediaAdd` | `Додати картинку, відео чи звук` |
| `cardMediaImage` | `картинка` |
| `cardMediaVideo` | `відео` |
| `cardMediaVideoFrom` | `відео з {time}` |
| `cardMediaAudio` | `звук` |
| `cardAnswers` | `Відповіді` |
| `cardTime` | `Час і бали` |
| `summaryPowersOn` | `увімкнено: {count}` |
| `summaryOff` | `вимкнено` |
| `summarySpares` | `запасних: {count}` |
| `summaryDuels` | `категорій: {count}` |
| `markError` | `є помилка` |
| `markReminder` | `є нагадування` |
| `comboSearch` | `Пошук` |
| `comboEmpty` | `Нічого не знайдено. Спробуй інше слово.` |
| `roundPick` | `Раунд` |
| `roundMenu` | `Дії з раундом` |
| `reminderTimer` | `Запитання {index}: таймер {seconds} с — менше за {min} с, гравці можуть не встигнути.` |
| `reminderTimerInline` | `Таймер коротший за {min} с — гравці можуть не встигнути прочитати. Зберегти можна.` |
| `reminderBooleansYes` | `Усі запитання «так чи ні» ({count}) мають відповідь «Так» — зроби частину з відповіддю «Ні».` |
| `reminderBooleansNo` | `Усі запитання «так чи ні» ({count}) мають відповідь «Ні» — зроби частину з відповіддю «Так».` |
| `reminderNoDescription` | `У вікторини немає опису — додай кілька слів, про що вона.` |
| `typeGroup_choice` | `Вибір` |
| `typeGroup_input` | `Ввести відповідь` |
| `typeGroup_media` | `Медіа` |
| `typeGroup_games` | `Ігри й головоломки` |
| `typeGroup_polls` | `Опитування (без балів)` |
| `typeDesc_<type>` × 33 | див. Задачу 1 |

Перед додаванням — `grep -n "issues\|^  card\|comboS\|roundPick\|reminder" apps/web/src/i18n.ts`: придатний наявний ключ — не дублювати (прибрати з таблиці й `ADDED_74`).

### Ухвалені рішення будівельника (з «Що лишається будівельнику»)

- **Групи типів** — 5 груп (Задача 1). «100 до 1» (`survey`) — у «Ігри й головоломки», бо за нього дають бали; «Опитування (без балів)» — лише `poll`, `wordcloud`.
- **Без проблем** кнопка в шапці показує неклікабельне «✓ Усе заповнено» (`aria-disabled`, не прихована); з нагадуваннями без помилок — `issuesButton` з `errors: 0`.
- **Нижній аркуш:** на телефоні спливна частина комбобокса — `position: fixed` знизу на всю ширину, `max-block-size: 70vh`, з прокруткою; від 600 px — випадний список під кнопкою (`position: absolute`).
- **Панель «⚠ N»** — випадна під кнопкою в шапці (як у макеті); «Показати» в нижній панелі відкриває її й прокручує шапку в поле зору. Після невдалого «Зберегти» панель **не** відкривається сама — лише рядок «Не збережено — помилок: N. Показати» (`role="alert"`) і перехід до першої проблеми, як зараз.
- **Вкладки:** рендериться лише активна панель. URL: `?tab=general`; «Раунди й запитання» — типова, з URL прибирається; невідоме значення — типова. Зміна — `setSearchParams(…, { replace: true })`, інші параметри зберігаються.
- **«Як грати», «Про вікторину», «Командна гра»** — звичайні картки (`section`); «Бафи й дебафи», «Запасні», «Дуелі» — згортані `details` з наявними класами (`rules powers` / `rules spares` / `rules duels`) і підсумком у `summary`.
- **⚙ Налаштування раунду** — той самий `details.round-settings`; його `summary` стоїть у смузі раунду поруч із комбобоксом і має вигляд кнопки «⚙ Налаштування раунду» (+ ⚠). Розгорнутий вміст займає наступний рядок.
- **«+ Раунд»** — як зараз: кнопка розкриває кнопки типів раунду з `HelpButton` (тексти й поведінка ті самі).
- **Меню «⋯»** — лише коли раундів > 1 (як нинішні кнопки): `menuitem`-и «Перейменувати», «Вище» (`aria-label` `moveRoundUp`), «Нижче» (`moveRoundDown`), «Видалити раунд»; ті самі `disabled` і підтвердження.
- **Обов'язковість `*`** — CSS `content: ' *' / ''` на `.is-required` (зірочка не потрапляє ні в `textContent`, ні в доступне ім'я — наявні `getByLabelText('Назва вікторини')` і e2e `field(...)` не ламаються) + `aria-required="true"` на полі назви й тексті запитання.
- **Вбудовані помилки** — для основного запитання й клітинки дошки (через `QuestionEditor`), поля назви, карток «Загальне» й `details.round-settings`. Загальні запасні й питання на виживання — лише в панелі.
- **Нагадування про таймер у картці «Час і бали»** (сіре, як у макеті) — щоразу, коли поле таймера видно і `timeLimit < 25`, без «торкнутості» (воно не червоне).

## Фокус перевірки

1. **Типи, де медіа — суть, але `QuestionEditor` сам показує медіа-поле** (`melody`/`videoclip` — `ImageField`; `pin` — `AudioField`; `think`/`spy` — лише картинка): поле не має зникнути. Очікування: ці поля стоять на початку картки «Відповіді», картки «Медіа» немає. Тест — знімок Задачі 4 і `it('keeps the cover image of a melody and the sound of a pin in the answers card')`.
2. **«Торкнутість» на межах:** автор змінив запитання й перемкнув **раунд** (не запитання) комбобоксом; змінив клітинку дошки й вибрав іншу клітинку; змінив назву й не прибрав фокус; натиснув «Зберегти» — тоді торкнуте все. Очікування: червоне з'являється рівно після виходу/спроби, ніколи раніше. Тести — Задача 10 (`marks the question touched when the round changes`, `a fresh empty question has no red until it is left`, `a board cell turns red only after leaving it`).
3. **Застарілі місця в панелі:** панель відкрита, автор видаляє/переносить запитання чи раунд. Очікування: список перераховується від поточної вікторини, клік веде на поточне місце, а не на індекс, якого вже немає. Тест — Задача 9 (`the issues list follows a removed question`).
4. **URL вкладки й чернетка:** `/quizzes/:id/edit?tab=general` з відновленою чернеткою; `?tab=foo`; «Скасувати» після перемикання вкладок. Очікування: `general` відкриває «Загальне», невідоме — «Раунди й запитання», банер чернетки видно над вкладками, підтвердження скасування як раніше. Тест — Задача 7 (`EditQuiz.test.tsx`).
5. **Комбобокс на телефоні й у RTL:** 360 px, нижній аркуш, клік поза ним, Esc, повернення фокуса на кнопку, `dir="rtl"` (ar). Очікування: аркуш не виходить за екран, без бічної прокрутки, фокус повертається на кнопку, закриття не змінює значення. Тести — Задача 2 (`closes on Escape and on a click outside and returns the focus`) і e2e Задачі 11 (кадр 360, `expectNoSideScroll`).

---

### Задача 1. Тексти плану 74 і групи типів

**Файли:** `apps/web/src/editor/type-groups.ts` (новий), `apps/web/src/editor/type-groups.test.ts` (новий), `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,de,pl,es,it,ar}.json`, `apps/web/src/i18n.test.ts`.

**Інтерфейси:**
- Споживає: `QUESTION_TYPES`, `type QuestionType` з `./draft`.
- Видає:
  ```ts
  export type TypeGroupId = 'choice' | 'input' | 'media' | 'games' | 'polls';
  export const TYPE_GROUPS: readonly { id: TypeGroupId; types: readonly QuestionType[] }[];
  /** Лише дозволені типи; порядок груп і порядок усередині групи — як у TYPE_GROUPS; порожні групи відкинуто. */
  export function groupedTypes(allowed: readonly QuestionType[]): { id: TypeGroupId; types: QuestionType[] }[];
  ```
  Ключі `typeGroup_*`, `typeDesc_*` і всі ключі таблиці «Нові ключі i18n».

**Розподіл (рівно один раз кожен із 33):**
- `choice`: single, multi, boolean, order, match, sort, slider
- `input`: text, numeric, chain, wordladder, letterwords, timedlist, wordle
- `media`: melody, videoclip, drawing, pin, jigsaw, spotdiff, memory
- `games`: clues, wall, moreless, survey, bluff, spy, thinkalike, think, crossword, sudoku
- `polls`: poll, wordcloud

**`typeDesc_*` (uk, для автора, ≤ 70 символів; переклади — за змістом, звіряючись із `typeHow_*` тієї мови):**
single «Гравці вибирають один правильний варіант.» · multi «Кілька правильних варіантів — треба позначити всі.» · boolean «Твердження, на яке відповідають «так» або «ні».» · order «Розставити рядки в правильному порядку.» · match «Скласти пари з двох стовпців.» · sort «Розкласти слова по категоріях.» · slider «Вибрати число повзунком на шкалі.» · text «Гравці пишуть відповідь словами.» · numeric «Відповідь — число, можна з допуском.» · chain «Вгадати приховані слова, кожне пов’язане з попереднім.» · wordladder «Від слова до слова, міняючи щоразу одну літеру.» · letterwords «Скласти слова з набору літер.» · timedlist «Назвати якомога більше пунктів схованого списку.» · wordle «Вгадати слово за шість спроб.» · melody «Вгадати пісню за шматками мелодії.» · videoclip «Вгадати за шматками відео.» · drawing «Один малює слово, решта вгадують.» · pin «Поставити точку на мапі чи картинці.» · jigsaw «Скласти картинку зі шматочків.» · spotdiff «Знайти відмінності між двома картинками.» · memory «Знайти пари карток.» · clues «Підказки відкриваються по одній — хто раніше впізнає.» · wall «Розкласти плитки на групи за спільним зв’язком.» · moreless «Ряд порівнянь: що з двох більше.» · survey «Вгадати найпопулярніші відповіді опитування.» · bluff «Вигадати фальшиву відповідь і знайти правду.» · spy «Усі бачать слово, крім шпигуна; знайти його.» · thinkalike «Написати слово, як більшість.» · think «Слово на тему, але не те, що загадав ведучий.» · crossword «Вписати слова за підказками.» · sudoku «Заповнити сітку 6×6 без повторів.» · poll «Опитування без правильної відповіді.» · wordcloud «Хмара слів від гравців.»

- [ ] **Крок 1. Тести (падають):**
  - `type-groups.test.ts`:
    - `it('puts every question type in exactly one group')` — `TYPE_GROUPS.flatMap((g) => g.types)` відсортований `toEqual([...QUESTION_TYPES].sort())` і без повторів (`new Set(...).size === QUESTION_TYPES.length`).
    - `it('keeps only the allowed types and drops empty groups')` — `groupedTypes(['text', 'single', 'poll'])` → `[{ id: 'choice', types: ['single'] }, { id: 'input', types: ['text'] }, { id: 'polls', types: ['poll'] }]`; `groupedTypes(questionTypesFor('puzzles'))` має лише групи з `sudoku`/`crossword`/`jigsaw`/`spotdiff`/`memory`.
    - `it('has a group name and a description for every type in every language')` — для кожного `id` є `t(\`typeGroup_${id}\`)`, для кожного типу — непорожній `typeDesc_*` в uk і в усіх 6 словниках.
  - `i18n.test.ts`: `const ADDED_74 = [...таблиця, ...QUESTION_TYPES.map((type) => \`typeDesc_${type}\`), ...5 typeGroup_*]` (QUESTION_TYPES імпортувати з `@quiz/shared`); новий `it('74 keys (editor layout) are in every locale')` за зразком `73` (є в uk, є в кожному словнику, ті самі змінні, ≠ uk); `uk.issuesButton === '⚠ Помилок: {errors} · нагадувань: {reminders}'`; `ADDED_74` у фільтрі «adds no uk keys beyond the agreed list».
- [ ] **Крок 2.** `pnpm vitest run --project web --maxWorkers=2 apps/web/src/editor/type-groups.test.ts apps/web/src/i18n.test.ts` — падають (немає модуля/ключів).
- [ ] **Крок 3.** Додати `type-groups.ts`; ключі в `i18n.ts` (поруч із `typeShort_*`/`type_*` для типів, решта — одним блоком «74») і в 6 json (алфавітний порядок файлів не ламати, якщо він є).
- [ ] **Крок 4.** Ті самі тести + `apps/web/src/locales` — проходять; `pnpm typecheck`.
- [ ] **Крок 5. Коміт:** `feat(editor): question type groups and the editor layout texts in seven languages (74)`

---

### Задача 2. Спільний `ui/Combobox`

**Файли:** `apps/web/src/ui/Combobox.tsx` (новий), `apps/web/src/ui/Combobox.test.tsx` (новий), `apps/web/src/ui/use-dismiss.ts` (новий), `apps/web/src/styles.css` (блок «74»).

**Інтерфейси:**
- Споживає: `t('comboSearch')`, `t('comboEmpty')`.
- Видає:
  ```ts
  export interface ComboOption<V extends string> {
    value: V;
    label: string;                 // доступне ім'я рядка й кнопки
    description?: string;          // другий рядок; aria-describedby
    icon?: string;                 // aria-hidden
    keywords?: readonly string[];  // теж шукаються (напр. typeShort_*)
    group?: string;                // id групи з groups
    badge?: string;                // видимий значок праворуч (⚠, «2 не готові»)
    note?: string;                 // дописується до aria-label через «, » (напр. «є помилка»)
  }
  export interface ComboboxProps<V extends string> {
    label: string;                                   // «Тип запитання», «Раунд»
    value: V;
    options: readonly ComboOption<V>[];
    groups?: readonly { id: string; label: string }[];
    onChange: (value: V) => void;
    className?: string;
  }
  export function Combobox<V extends string>(props: ComboboxProps<V>): JSX.Element;
  /** Закриття по Esc і по pointerdown поза root, поки open. */
  export function useDismiss(root: RefObject<HTMLElement | null>, open: boolean, onClose: () => void): void;
  ```
- DOM-контракт (на нього спираються тести-помічники й e2e): корінь `div.combo`; кнопка `button.combo-trigger` з `aria-haspopup="listbox"`, `aria-expanded`, `aria-label="{label}: {вибраний label}"` (+ `, {note}` вибраного), вміст — значок, назва, `badge`, «▾»; спливна частина `div.combo-popup` **у тому самому корені** (без порталу) з `input[role="combobox"]` (`aria-label={t('comboSearch')}`, `aria-controls`, `aria-expanded="true"`, `aria-autocomplete="list"`, `aria-activedescendant`) і `div[role="listbox"]` (`aria-label={label}`); групи — `div[role="group"][aria-labelledby]` з заголовком; рядок — `div[role="option"][data-value]` з `aria-selected`, `aria-label` = `label` (+ `, note`), `aria-describedby` на опис.

- [ ] **Крок 1. Тести (падають), `Combobox.test.tsx`** (набір із 3 груп і 7 опцій, одна з `keywords: ['так чи ні']`):
  - `it('shows the chosen value on a button named after the label')` — `getByRole('button', { name: 'Тип: Один варіант' })`, `aria-expanded="false"`, `listbox` відсутній.
  - `it('opens a grouped list with the search focused and the chosen option active')` — клік → `getByRole('listbox')`, 3 `group` з назвами, `document.activeElement` — пошук, `aria-activedescendant` = id вибраної опції, вона `aria-selected="true"`.
  - `it('filters by label, description and keywords, ignoring case and apostrophe kinds')` — «ТАК ЧИ» лишає одну опцію; «пам'ять» знаходить «Пам’ять»; групи без збігів зникають; нічого — `comboEmpty`.
  - `it('moves with arrows, Home and End and picks with Enter')` — ↓↓ Enter → `onChange` з третім видимим значенням, список закрито, фокус на кнопці; після фільтра Enter бере перший видимий.
  - `it('closes on Escape and on a click outside and returns the focus')` — Esc: `onChange` не викликано, фокус на кнопці; `pointerdown` на `document.body` — закрито.
  - `it('picks with a click and does not call onChange for the same value')`.
  - `it('describes each option and keeps the note in its name')` — `getByRole('option', { name: 'Раунд 2, є помилка' })`, `aria-describedby` вказує на текст опису.
- [ ] **Крок 2.** `pnpm vitest run --project web --maxWorkers=2 apps/web/src/ui/Combobox.test.tsx` — падають.
- [ ] **Крок 3.** Реалізувати. Фільтр: `normalize('NFC').toLowerCase()`, `’ ʼ '` → `'`, підрядок у `label`/`description`/`keywords`. Активна опція при відкритті — вибрана (прокрутити `scrollIntoView?.({ block: 'nearest' })`); після зміни фільтра — перша видима. Відкриття також ↓/Enter/Space на кнопці. Tab — закриває. На дотиковому екрані (`window.matchMedia?.('(pointer: coarse)').matches`) фокус іде на `listbox` (`tabIndex={-1}`, ті самі клавіші), щоб не виринала клавіатура. CSS: `.combo-popup` — базово нижній аркуш (`position: fixed; inset-inline: 0; inset-block-end: 0; max-block-size: 70vh; overflow: auto`), `@media (min-width: 600px)` — `position: absolute; inset-inline-start: 0; min-inline-size: 100%; max-inline-size: min(28rem, 90vw)`; логічні властивості (RTL).
- [ ] **Крок 4.** Тест проходить; `pnpm typecheck`.
- [ ] **Крок 5. Коміт:** `feat(ui): a grouped searchable combobox without a library (74)`

---

### Задача 3. Тип запитання — комбобокс у `QuestionEditor` (+ перенесення тестів)

**Файли:** `apps/web/src/editor/QuestionEditor.tsx`, `apps/web/src/editor/editor-testing.ts` (новий, помічники тестів — назва без `.test`, щоб vitest не збирав), `apps/web/src/editor/QuestionEditor.test.tsx`, `apps/web/src/editor/QuizEditor.test.tsx`, `apps/web/src/editor/QuizEditor.bank.test.tsx`, `apps/web/src/editor/BoardEditor.test.tsx`, `apps/web/src/pages/EditQuiz.test.tsx`, `apps/web/src/screens/HostScreen.test.tsx` (якщо там клікають чипи), `apps/web/src/editor/type-menu.test.ts` (лише якщо щось читає `.type-chips`).

**Інтерфейси:**
- Споживає: `Combobox`, `ComboOption` (Задача 2); `groupedTypes`, `TypeGroupId` (Задача 1); `typeIcon` з `../guide-text`; `changeType` з `./draft`.
- Видає (`editor-testing.ts`, на `@testing-library/react`):
  ```ts
  /** Відкриває «Тип запитання» (перший у scope) і вибирає тип за data-value. */
  export function chooseType(type: QuestionType, scope?: HTMLElement): void;
  /** Типи в меню (data-value у порядку показу); меню закривається Esc. */
  export function typeOptions(scope?: HTMLElement): QuestionType[];
  /** Текст вибраного типу на кнопці (повна назва type_*). */
  export function currentTypeLabel(scope?: HTMLElement): string;
  ```

- [ ] **Крок 1. Тести (падають), `QuestionEditor.test.tsx`:**
  - `it('picks the type from a grouped combobox')` — кнопка `Тип запитання: ${t('type_text')}`; `typeOptions()` дорівнює `groupedTypes(questionTypesFor('classic')).flatMap((g) => g.types)`; `chooseType('drawing')` → `onChange` з `{ type: 'drawing' }` (тобто через `changeType`).
  - `it('offers only the round types')` — з `types={questionTypesFor('blitz')}` немає `drawing`, є `single`.
  - `it('finds a type by its short name')` — пошук «хто я» лишає `clues`.
  - Наявний тест 28c (клік `typeShort_drawing`) переписати на `chooseType('drawing')`.
- [ ] **Крок 2.** `pnpm vitest run --project web --maxWorkers=2 apps/web/src/editor/QuestionEditor.test.tsx` — падають.
- [ ] **Крок 3.** У `QuestionEditor` замінити `div.type-chips` на `<Combobox label={t('questionType')} value={question.type} options={…} groups={…} onChange={(type) => onChange(changeType(question, type))} />` поруч із тим самим `HelpButton`. Опція: `{ value, label: t(\`type_${type}\`), description: t(\`typeDesc_${type}\`), icon: typeIcon(type), keywords: [t(\`typeShort_${type}\`)], group }`; групи: `groupedTypes(types)` → `{ id, label: t(\`typeGroup_${id}\`) }`. Порядок опцій — за групами. Змінна `types` (дозволені) не міняється. Тип поточного запитання, якого немає в `types` (легаси/помилка місця), — лишається видимим у кнопці (опція додається в кінець своєї групи), щоб не губити значення.
- [ ] **Крок 4. Перенести тести на `chooseType`/`typeOptions`.** Кліки чипів шукаються за текстами `typeShort_*` (`click('так чи ні')`, `getByRole('button', { name: 'число' })`, `{ pressed: true }` + `typeShort_*`): ~115 у `QuizEditor.test.tsx`, 10 у `BoardEditor.test.tsx`, 6 у `EditQuiz.test.tsx`, 2 у `HostScreen.test.tsx` (перевірити — можуть бути не чипи), кілька в `QuizEditor.bank.test.tsx`. Механічно — node-скриптом із мапою «uk `typeShort_*` → тип», потім **вручну** переглянути збіги неоднозначних текстів (`текст`, `число`, `Слово`, `Відео`, `Блеф`, `Мелодія`) — замінювати лише кліки по чипу типу. «Вибраний тип» (`pressed: true`) → `currentTypeLabel()`. У запасних і клітинці — `chooseType(type, scope)` зі scope редактора.
- [ ] **Крок 5.** `pnpm vitest run --project web --maxWorkers=2 apps/web/src/editor apps/web/src/pages/EditQuiz.test.tsx apps/web/src/screens/HostScreen.test.tsx` — усе зелене; `pnpm typecheck`.
- [ ] **Крок 6. Коміт:** `feat(editor): the question type is a grouped searchable combobox instead of a wall of chips (74)`

---

### Задача 4. Картки запитання: «Запитання», «Медіа», «Відповіді», «Час і бали»

**Файли:** `apps/web/src/editor/question-layout.ts` (новий), `apps/web/src/editor/question-layout.test.ts` (новий), `apps/web/src/editor/QuestionEditor.fields.test.tsx` (новий) + його `__snapshots__`, `apps/web/src/editor/EditorCard.tsx` (новий), `apps/web/src/editor/QuestionEditor.tsx`, `apps/web/src/editor/QuestionEditor.test.tsx`, `apps/web/src/styles.css`.

**Інтерфейси:**
- Видає (`question-layout.ts` — **дослівно ті самі умови**, що зараз у JSX `QuestionEditor` ~893–1029):
  ```ts
  export interface LayoutFlags { showPoints: boolean; showHint: boolean; showTime: boolean; showVideo: boolean; showAudio: boolean; showReveal: boolean }
  export interface MediaFields { image: boolean; reveal: boolean; video: boolean; audio: boolean }
  export function mediaFields(question: Question, flags: LayoutFlags): MediaFields;
  export function hintShown(question: Question, flags: LayoutFlags): boolean;
  export function timeFieldShown(question: Question, flags: LayoutFlags): boolean;   // NumberField таймера (не noTimerHint)
  export function noTimerHintShown(question: Question, flags: LayoutFlags): boolean;
  export function pointsFieldShown(question: Question, flags: LayoutFlags): boolean;
  /** Типи, у яких медіа — суть: картки «Медіа» немає, їхні поля QuestionEditor — на початку «Відповідей». */
  export const MEDIA_NATIVE: ReadonlySet<QuestionType>;  // melody, videoclip, jigsaw, spotdiff, memory, pin
  export function hasMedia(question: Question): boolean;  // imageUrl !== null || video !== null || audio !== undefined
  /** «картинка, відео з 0:42, звук»; null — медіа немає. */
  export function mediaSummary(question: Question): string | null;
  export const REMINDER_MIN_TIME = 25;
  /** Картка редактора запитання (без React: її беруть і draft.ts, і problem-cards.ts). */
  export type QuestionCard = 'type' | 'question' | 'media' | 'answers' | 'time';
  ```
  ```ts
  // EditorCard.tsx (QuestionCard — з ./question-layout)
  interface EditorCardProps {
    card: string;                 // data-card
    title: string;
    required?: boolean;           // заголовок з .is-required
    summary?: string | null;      // після заголовка, .editor-card-summary
    error?: string | null;        // .error.card-error під заголовком + .has-error на картці
    note?: string | null;         // сіре нагадування .card-note
    fold?: { open: boolean; onToggle: (open: boolean) => void };  // тоді <details>, інакше <section>
    className?: string;
    id?: string;
    children: ReactNode;
  }
  export function EditorCard(props: EditorCardProps): JSX.Element;
  ```
  `QuestionEditor` отримує нові необов'язкові пропси (заповнюються в Задачі 10): `issue?: { card: QuestionCard; text: string } | null` — `text` іде в `error` відповідної картки (`'type'` — під комбобоксом).

- [ ] **Крок 1. Знімок видимості — ДО будь-яких змін.** `QuestionEditor.fields.test.tsx`: для кожного типу з `QUESTION_TYPES` (`newQuestion(type)`; для `video`/`audio`/`image` — варіанти з `imageUrl: 'https://x/i.png'`, з `video: { id: 'abc', start: 42 }` (форма — як у наявних тестах VideoField), з `audio`) і для наборів прапорців `{}` (типові), `{ showPoints: false, showHint: false, showVideo: false, showAudio: false }` (як запасні), `{ showTime: false }`, `{ showReveal: true }`, рендер `QuestionEditor` і запис **присутності** маркерів: `addImage|replaceImage` (ImageField), `revealLabel` group, `videoLabel`, аудіо-поля (`addAudio`/`audioFile`), `questionText`, `hintLabel`, `timeLimit`/`bluffLieTime`, `noTimerHint`, `pointsLabel`, `noPointsNote`. `expect(table).toMatchSnapshot()`. Запустити — знімок записано; **закомітити знімок окремим комітом** `test(editor): snapshot which fields the question editor shows for every type (74)`.
- [ ] **Крок 2. Тести (падають):**
  - `question-layout.test.ts`: `it('matches the current visibility rules')` — на тих самих наборах, що знімок, `mediaFields`/`hintShown`/`timeFieldShown`/`pointsFieldShown` дорівнюють присутності маркерів зі знімка (таблиця будується тим самим генератором; генератор — експорт із `QuestionEditor.fields.test.tsx` не потрібен: дубль малого циклу в тесті допустимий); `mediaSummary({ …, imageUrl: 'x', video: { start: 42 } })` → `'картинка, відео з 0:42'`; `hasMedia(newQuestion('single')) === false`.
  - `QuestionEditor.test.tsx`:
    - `it('groups the fields into cards in the agreed order')` — `[...container.querySelectorAll('[data-card]')].map((el) => el.dataset.card)` для `single` → `['question', 'media', 'answers', 'time']`; текст запитання всередині `[data-card="question"]`, підказка там же; `Body` (варіант 1) — у `answers`; таймер і бали — у `time`.
    - `it('folds the media card while the question has no media and names what is inside')` — без медіа `details[data-card="media"]` без `open`, `summary` має `cardMediaAdd`; з `imageUrl` — `open`, підсумок `картинка`.
    - `it('keeps the cover image of a melody and the sound of a pin in the answers card')` — для `melody` немає `[data-card="media"]`, `addImage` всередині `[data-card="answers"]`; для `pin` — аудіо-поле в `answers`.
    - `it('marks the question text and the answers as required without changing their names')` — заголовки `question`/`answers` мають `.is-required`; `getByLabelText(t('questionText'))` (точна назва) знаходиться, `aria-required="true"`.
    - `it('shows a grey timer reminder under a short timer and none when the timer is hidden')` — `timeLimit: 15` → `t('reminderTimerInline', { min: 25 })` у `[data-card="time"]`; з `showTime={false}` — немає.
    - `it('puts an issue text into its card')` — `issue={{ card: 'answers', text: 'X' }}` → `[data-card="answers"].has-error` містить `X`; інші картки без `.has-error`.
- [ ] **Крок 3.** `pnpm vitest run --project web --maxWorkers=2 apps/web/src/editor/question-layout.test.ts apps/web/src/editor/QuestionEditor.test.tsx` — падають.
- [ ] **Крок 4.** Винести умови в `question-layout.ts` (без зміни логіки), перебудувати рендер: комбобокс типу (+ `issue` з `card: 'type'`) → `EditorCard question` (текст — крім `wordle`; `BetsCutField`; підказка) → `EditorCard media` (`fold`, стан `useState(() => hasMedia(question))`, `useEffect`: стало `hasMedia` — відкрити; не показувати, коли `MEDIA_NATIVE` або жодного медіа-поля) → `EditorCard answers` (медіа-поля `MEDIA_NATIVE` на початку, далі `Body`; `required` — крім `thinkalike`) → `EditorCard time` (наявна `.pair` і `noPointsNote`; показується, якщо видно таймер, `noTimerHint`, бали або `noPointsNote`; `note` = нагадування таймера, коли `timeFieldShown && timeLimit < REMINDER_MIN_TIME`). Обгортку `.stage-card` прибрати (селектор у CSS лишити, якщо його беруть інші місця — `grep`). CSS блоку «74»: `.editor-card` (рамка, відступи, `has-error` — червона рамка), `.editor-card-title`, `.editor-card-summary`, `.card-error`, `.card-note`, `.is-required::after { content: ' *' / ''; }`.
- [ ] **Крок 5.** Знімок Кроку 1 **не змінився** (`-u` не запускати); `pnpm vitest run --project web --maxWorkers=2 apps/web/src/editor apps/web/src/pages` — зелене (тести, що шукали поля в `.stage-card` чи розраховували на порядок «картинка → текст», перенести на `[data-card=…]`); `pnpm typecheck`.
- [ ] **Крок 6. Коміт:** `feat(editor): question fields grouped into cards — question, media, answers, time and points (74)`

---

### Задача 5. `placedProblemsOf`: ті самі проблеми, але з місцем

**Файли:** `apps/web/src/editor/problem-cards.ts` (новий), `apps/web/src/editor/problem-cards.test.ts` (новий), `apps/web/src/editor/draft.ts`, `apps/web/src/editor/draft.test.ts`.

**Інтерфейси:**
- Споживає: `QuestionCard`, `MEDIA_NATIVE` з `./question-layout` (Задача 4; файл без React).
- Видає:
  ```ts
  // problem-cards.ts
  export function cardOfProblem(key: TextKey, question: Question): QuestionCard;
  // draft.ts
  export type GeneralCard = 'about' | 'rules' | 'teams' | 'powers' | 'spares' | 'duels';
  export type IssuePlace =
    | { kind: 'title' }
    | { kind: 'general'; card: GeneralCard }
    | { kind: 'round'; round: number; settings: boolean }
    | { kind: 'question'; round: number; question: number; card: QuestionCard }
    | { kind: 'cell'; round: number; category: number; index: number; card: QuestionCard }
    | { kind: 'category'; round: number; category: number }
    | { kind: 'quiz' };
  export interface PlacedProblem { text: string; place: IssuePlace }
  export function placedProblemsOf(quiz: Quiz): PlacedProblem[];
  export function problemsOf(quiz: Quiz): string[];   // = placedProblemsOf(quiz).map((p) => p.text)
  /** Вкладка, на якій видно місце; null — назва (над вкладками). */
  export function tabOf(place: IssuePlace): 'general' | 'rounds' | null;
  ```

**Мапа `cardOfProblem` (решта — `'answers'`):**
- `'question'`: `problemNoText`, `problemBetsCut`, `problemAuctionCut`.
- `'type'`: усі `problem*Place` (`problemPuzzlePlace`, `problemJigsawPlace`, …, `problemWordlePlace`, `problemVotePlace`, `problemBluffPlace`, `problemSurveyPlace`, `problemRevealPlace`, `problemCluesPlace`, `problemSortPlace`, `problemChainPlace`, `problemWordLadderPlace`, `problemListPlace`, `problemLettersPlace`, `problemMoreLessPlace`, `problemDrawingPlace`, `problemPinPlace`, `problemWallPlace`, `problemOvershootPlace`, `problemAlikePlace`, `problemSpyPlace`), `problemPuzzlesType`, `problemSpareType`.
- `'media'`: `problemAudio`, `problemWordleVideo`, `problemSpyMedia` — але для `MEDIA_NATIVE`-типу → `'answers'`.
- `'time'`: `problemLimits` і всі `*Limits` (`problemLettersLimits`, `problemPuzzleLimits`, `problemMelodyLimits`, `problemVideoclipLimits`) — але для `jigsaw`/`spotdiff`/`memory` (`problemJigsawLimits`, `problemSpotdiffLimits`, `problemMemoryLimits`) → `'answers'` (їхній час у власному редакторі).

**Місця в `placedProblemsOf` (тексти й порядок — як у нинішньому `problemsOf`):**
- `problemTitle` → `title`.
- Раунд: `problemRules` (правила раунду, числа ставок/аукціону), `problemBetsMax`, `problemTruthNumbers`, `problemThinkNumbers`, `problemSurvivors`, `problemSurvivalBonus`, `problemSurvivalTrials`, `problemSurvivalTrial`, `problemLadderLevels`, `problemLadderSafe`, квест (`problemQuestPrompt`, `problemQuestCode`, `problemQuestOrder`, `problemQuestBuff`, `problemRules` квесту) → `{ round, settings: true }`; `problemTruthOnce`, `problemThinkCount`, `problemThinkType`, `problemWipeout*`, `problemSurvivalFew/Many/Type`, `problemLadderFew/Many/Type`, `problemQuestShort`, `problemQuestType`, `problemBoardTooMany` → `{ round, settings: false }`.
- `problemBetsCut`/`problemAuctionCut` → `question` першого запитання без `betsCut`, картка `'question'`.
- Запитання раунду → `{ kind: 'question', round, question: index, card: cardOfProblem(key, q) }`.
- Дошка: назва категорії і запасні категорії → `category`; клітинка → `cell` (`cardOfProblem`).
- Дуелі (`duelProblems`, `problemDuelUnreachable`) → `general duels`; запасні (`spareProblems`, `problemSparesEmpty`) → `general spares`; команди (`problemTeam*`, `problemSpyTeams`) → `general teams`; `problemDebuffPrice` → `general powers`.
- Остання перевірка схемою: `duel_*` → `duels`; `spare_*`, `spares_empty`, `duplicate_spare_ids` → `spares`; `team_names` → `teams`; `buff_unavailable`/`duplicate_powers` → `powers`; решта (`too_many_questions`, `duplicate_*_ids`, `wipeout_type`, `ladder_*`, `survival_*`, `puzzle_place`, `quest_*`, `think_*`, `puzzles_type`, `problemGeneric`) → `quiz`.
- `tabOf`: `title` → `null`; `general` → `'general'`; решта → `'rounds'`.

- [ ] **Крок 1. Тести (падають):**
  - `problem-cards.test.ts`: `it('sends a missing text to the question card')`, `it('sends a type that does not belong to the round to the type picker')` (`problemDrawingPlace`, `problemPuzzlesType`), `it('sends a broken timer to the time card, but a jigsaw timer to its answers')`, `it('sends a broken sound to the media card, but a melody to its answers')`, `it('sends anything unknown to the answers')`.
  - `draft.test.ts`, новий `describe('placedProblemsOf (74)')`:
    - `it('gives the same texts in the same order as problemsOf')` — для 6–8 наявних фікстур цього файлу з помилками (класика, дошка з порожньою категорією й клітинкою, ставки, виживання з питанням, драбина, дуелі, запасні, команди) `placedProblemsOf(q).map((p) => p.text)` `toEqual(problemsOf(q))`.
    - `it('places question, cell, category, round settings and general problems')` — вікторина: порожня назва; раунд 1 класика з порожнім запитанням 2 → `{ kind: 'question', round: 0, question: 1, card: 'question' }`; раунд 2 дошка з порожньою назвою категорії 1 → `{ kind: 'category', round: 1, category: 0 }` і клітинкою з порожнім варіантом → `{ kind: 'cell', round: 1, category: 0, index: 0, card: 'answers' }`; драбина з поганими рівнями → `{ kind: 'round', settings: true }`; дуелі з короткою категорією → `{ kind: 'general', card: 'duels' }`; перше — `{ kind: 'title' }`.
    - `it('points a missing bets cut at the first question without one')`.
    - `it('names the tab of every place')` — `tabOf` для кожного `kind`.
  - Усі наявні тести `problemsOf`/`firstProblem` — без змін і зелені.
- [ ] **Крок 2.** `pnpm vitest run --project web --maxWorkers=2 apps/web/src/editor/problem-cards.test.ts apps/web/src/editor/draft.test.ts` — нові падають.
- [ ] **Крок 3.** Перенести тіло `problemsOf` у `placedProblemsOf`: кожне `problems.push(text)` → `push({ text, place })`; `where()` лишається; `duelProblems`/`spareProblems` повертають `string[]` як зараз — обгорнути місцем у виклику; для запитань/клітинок узяти `key` (він уже є перед `problemText`). Умова «`problems.length === 0` → схема» — за довжиною нового масиву. `problemsOf` — однорядкова обгортка.
- [ ] **Крок 4.** Тести зелені (усі ~366 наявних `problemsOf`); `pnpm typecheck`.
- [ ] **Крок 5. Коміт:** `refactor(editor): problems carry their place and card, same texts and order (74)`

---

### Задача 6. Нагадування, «торкнутість» і підсумки карток (чисте)

**Файли:** `apps/web/src/editor/reminders.ts` (новий), `apps/web/src/editor/reminders.test.ts` (новий), `apps/web/src/editor/touched.ts` (новий), `apps/web/src/editor/touched.test.ts` (новий), `apps/web/src/editor/summaries.ts` (новий), `apps/web/src/editor/summaries.test.ts` (новий).

**Інтерфейси:**
- Споживає: `IssuePlace` (Задача 5), `timeFieldShown`, `REMINDER_MIN_TIME`, `LayoutFlags` (Задача 4), `booleanCounts`, `questionTypesFor` (`draft.ts`), `allowedBuffs`, `allowedDebuffs`, `boardCells` (`@quiz/shared`).
- Видає:
  ```ts
  // reminders.ts
  export interface Reminder { text: string; place: IssuePlace }
  /** Прапорці видимості, з якими QuizEditor показує запитання раунду (ті самі вирази, що в його JSX). */
  export function roundLayout(round: Round): LayoutFlags;
  export function remindersOf(quiz: Quiz): Reminder[];
  // touched.ts
  export interface TouchedState { all: boolean; pending: ReadonlySet<string>; done: ReadonlySet<string> }
  export type TouchAction = { type: 'edit'; key: string } | { type: 'leave'; key: string } | { type: 'all' };
  export const UNTOUCHED: TouchedState;
  export function touchReducer(state: TouchedState, action: TouchAction): TouchedState;
  export function isTouched(state: TouchedState, key: string): boolean;   // all || done.has(key)
  export const touchKey: { title: 'title'; general: 'general'; round: (roundId: string) => string; question: (questionId: string) => string };
  // summaries.ts
  export function generalSummaries(quiz: Quiz): { powers: string; spares: string; duels: string };
  ```

**Правила `remindersOf` (порядок: опис → раунди по черзі → у раунді спершу таймери за порядком, потім «так чи ні»):**
- `quiz.description.trim() === ''` → `reminderNoDescription`, `{ kind: 'general', card: 'about' }`.
- Таймер: запитання раунду (не `board`/`truth`), де `timeFieldShown(q, roundLayout(round))` і `q.timeLimit < 25` → `reminderTimer` (`index`, `seconds`, `min: 25`) з префіксом `problemRound`, коли раундів > 1 (як `where()` у `problemsOf`), місце `question`, `card: 'time'`. Клітинки дошки — з типовими прапорцями `QuestionEditor` (`showTime: true`) → текст через `problemCell` (категорія з 1, перша літера мала), місце `cell`, `card: 'time'`. Питання на виживання (`showTime` у `SparesEditor`) → `{ kind: 'round', settings: true }`. Загальні запасні (`showTime: false`) і дуелі — **ні**.
- `roundLayout(round)`: `showPoints: !['final','bets','ladder','think'].includes(type)`, `showReveal: type === 'classic'`, `showTime: type !== 'ladder' || round.timer`, решта `true` — рівно як пропси в `QuizEditor` (~562–564).
- «Так чи ні»: у раунді (дошка — усі клітинки разом, `booleanCounts(boardCells(round).map(({ cell }) => cell.question))`) `yes + no >= 4` і (`yes === 0` → `reminderBooleansNo`; `no === 0` → `reminderBooleansYes`), `count: yes + no`, з префіксом раунду, місце `{ kind: 'round', round, settings: false }`. Запасні не рахуються.

**`touchReducer`:** `edit` додає в `pending` (якщо вже в `done` чи `all` — повертає **той самий** об'єкт); `leave` переносить ключ із `pending` у `done` (немає в `pending` — той самий об'єкт); `all` → `all: true`.

**`generalSummaries`:** `powers` — `allowedBuffs(quiz).length + allowedDebuffs(quiz).length` > 0 ? `summaryPowersOn` : `summaryOff`; `spares` — `summarySpares` з `quiz.spares?.length ?? 0`; `duels` — `quiz.duels` ? `summaryDuels` з кількістю категорій : `summaryOff`.

- [ ] **Крок 1. Тести (падають):**
  - `reminders.test.ts`: `it('reminds about a missing description')`; `it('reminds about a timer under 25 s only where the timer field is shown')` (класика 15 с → є, 25 с → немає; драбина без таймера 15 с → немає; запитання з відео в межах часу → немає, бо таймер схований); `it('prefixes the round when there are several and words a board cell like a problem')`; `it('reminds when four or more yes/no questions share the answer')` (4 «так» → `reminderBooleansYes` з `count: 4`; 3 «так» → немає; 3 «так» + 1 «ні» → немає); `it('counts a whole board for yes/no and ignores spares')`; `it('never blocks saving')` — вікторина з нагадуваннями: `problemsOf(q)` порожній.
  - `touched.test.ts`: `it('touches a key only after it is edited and then left')`; `it('touches everything after a save attempt')`; `it('returns the same state when nothing changes')` (`toBe`); `it('leaving an unedited key does nothing')`.
  - `summaries.test.ts`: порожня вікторина → `{ powers: 'вимкнено', spares: 'запасних: 0', duels: 'вимкнено' }`; 2 бафи + 3 дебафи → `'увімкнено: 5'`; дуелі з 3 категоріями → `'категорій: 3'`.
- [ ] **Крок 2.** `pnpm vitest run --project web --maxWorkers=2 apps/web/src/editor/reminders.test.ts apps/web/src/editor/touched.test.ts apps/web/src/editor/summaries.test.ts` — падають.
- [ ] **Крок 3.** Реалізувати.
- [ ] **Крок 4.** Тести зелені; `pnpm typecheck`.
- [ ] **Крок 5. Коміт:** `feat(editor): soft reminders, a touched state and card summaries as pure functions (74)`

---

### Задача 7. Вкладки «Загальне» / «Раунди й запитання» і картки загальних налаштувань

**Файли:** `apps/web/src/editor/QuizEditor.tsx`, `apps/web/src/pages/EditQuiz.tsx`, `apps/web/src/pages/EditQuiz.test.tsx`, `apps/web/src/editor/editor-testing.ts`, `apps/web/src/editor/QuizEditor.test.tsx`, `apps/web/src/editor/QuizEditor.bank.test.tsx`, `apps/web/src/styles.css`.

**Інтерфейси:**
- Споживає: `EditorCard` (Задача 4), `generalSummaries` (Задача 6).
- Видає:
  ```ts
  export type EditorTab = 'general' | 'rounds';
  // QuizEditor Props +
  tab?: EditorTab;                          // керована вкладка; немає — внутрішній стан, типово 'rounds'
  onTabChange?: (tab: EditorTab) => void;
  // QuizEditor (внутрішньо) — єдиний спосіб перемкнути вкладку для наступних задач:
  const showTab: (tab: EditorTab) => void;
  // editor-testing.ts
  export function openTab(tab: EditorTab): void;   // клік по role="tab"
  ```
- DOM: `div.editor-tabs[role="tablist"][aria-label=editorTabs]` з двома `button[role="tab"]` (`id="editor-tab-general|rounds"`, `aria-selected`, `aria-controls`), у кожній — назва й (Задача 9) значок; під ними `div[role="tabpanel"]#editor-panel-<tab>`. «Загальне» — `div.editor-general` з картками: `EditorCard about` (`#editor-card-about`, опис), `EditorCard rules` (`cardRules`: рейтинг, новачки, сімейна, штраф — ті самі поля, підказки й `HelpButton`), `EditorCard teams` (`teamsTitle`, `TeamsEditor`), `details.rules.powers` / `details.rules.spares` / `details.rules.duels` через `EditorCard` з `fold` і `summary` з `generalSummaries` (стан `powersOpen` — новий; `sparesOpen`, `duelsOpen` — наявні). Назва вікторини, банер, «Довідка ведучого» — **над** вкладками.

- [ ] **Крок 1. Тести (падають):**
  - `QuizEditor.test.tsx`, `describe('tabs (74)')`:
    - `it('opens on rounds and questions with the title above the tabs')` — `getByRole('tab', { name: /Раунди й запитання/ })` `aria-selected="true"`; `getByLabelText('Назва вікторини')` є; `queryByLabelText(t('quizDescription'))` — `null`; текст запитання є.
    - `it('shows the general settings as cards on the general tab')` — `openTab('general')` → заголовки `Про вікторину`, `Як грати`, `Командна гра`; `details.powers`, `details.spares`, `details.duels` згорнуті; `summary` бафів містить `вимкнено`; поле опису, рейтинг, три галочки — на місці; запитання не видно.
    - `it('keeps the settings when switching tabs')` — змінити опис на «Загальному», перейти на «Раунди…» і назад → значення те саме; «Зберегти» зберігає опис.
  - `EditQuiz.test.tsx`: `it('opens the general tab from ?tab=general and keeps it in the address')`; `it('falls back to rounds for an unknown tab and drops it from the address')`; `it('writes no tab for rounds')`; `it('keeps the draft notice above the tabs and asks before cancel after switching tabs')` — відновлена чернетка + `?tab=general`: банер `draftRestored` стоїть перед `tablist`; змінити опис, «Скасувати» → `window.confirm` викликано (за наявним `MemoryRouter`-обгортанням; адресу читати з тестового маршруту, що виводить `useLocation().search`).
- [ ] **Крок 2.** `pnpm vitest run --project web --maxWorkers=2 apps/web/src/editor/QuizEditor.test.tsx apps/web/src/pages/EditQuiz.test.tsx` — нові падають.
- [ ] **Крок 3.** Реалізувати: `EditQuiz` — `useSearchParams`, `tab = params.get('tab') === 'general' ? 'general' : 'rounds'`, невідоме значення — прибрати `replace`-ом; `onTabChange` пише/прибирає `tab` (`replace: true`, інші параметри не чіпати). `QuizEditor` — `const [ownTab, setOwnTab] = useState<EditorTab>('rounds')`, `current = tab ?? ownTab`, `showTab` викликає обидва. У `save()` нинішні `setDuelsOpen(true)`/`setSparesOpen(true)` лишаються (місця перебудує Задача 9). CSS: `.editor-tabs` (на телефоні — вкладки на всю ширину, рівні частки), `.editor-general` (один стовпець; `@media (min-width: 1280px)` — `repeat(2, minmax(0, 1fr))`, `align-items: start`).
- [ ] **Крок 4. Перенести наявні тести**: усе, що торкається опису, правил, команд, бафів, запасних, дуелей, — спершу `openTab('general')`, потім, якщо далі запитання, `openTab('rounds')` (≈20 місць у `QuizEditor.test.tsx`; `grep -n "quizDescription\|Правила гри\|Командна гра\|Бафи й дебафи\|Запасні запитання\|Дуелі\|leaderboard\|newcomers\|family\|awayPenalty\|details.rules\|\\.powers\|\\.spares\|\\.duels\|\\.teams"`). Тест 67 (якщо є юніт-перевірка `.editor-quiz > details.rules`) — на `.editor-general > .editor-card`.
- [ ] **Крок 5.** `pnpm vitest run --project web --maxWorkers=2 apps/web/src/editor apps/web/src/pages` — зелене; `pnpm typecheck`.
- [ ] **Крок 6. Коміт:** `feat(editor): general and rounds tabs, general settings as cards with summaries, tab kept in the URL (74)`

---

### Задача 8. Смуга раунду: комбобокс раунду, «⋯», «⚙ Налаштування раунду»

**Файли:** `apps/web/src/editor/RoundStrip.tsx`, `apps/web/src/editor/RoundSettings.tsx`, `apps/web/src/editor/QuizEditor.tsx`, `apps/web/src/editor/editor-testing.ts`, `apps/web/src/editor/QuizEditor.test.tsx`, `apps/web/src/editor/QuizEditor.bank.test.tsx`, `apps/web/src/styles.css`.

**Інтерфейси:**
- Споживає: `Combobox`, `useDismiss` (Задача 2); `ROUND_ICONS`, `ROUND_NAMES` (`guide-text.ts`); `roundLabel` (`format.ts`); `boardReadiness` (`draft.ts`).
- Видає:
  ```ts
  // RoundStrip Props — наявні + 
  flagged?: ReadonlySet<number>;   // раунди з видимими помилками (Задача 10 заповнить; поки порожньо)
  // RoundSettings Props — наявні +
  flagged?: boolean;               // ⚠ у summary
  // editor-testing.ts
  export function chooseRound(name: string): void;          // опція з data-name === roundLabel(...)
  export function roundNames(): string[];                    // data-name усіх опцій
  export function roundAction(name: string): void;          // відкриває «⋯» і клікає menuitem з цим доступним ім'ям
  ```
- DOM: `div.round-strip.round-bar[role="group"][aria-label=roundsLabel]`: `Combobox` (`label=roundPick`, `className="round-pick"`; опція `value = round.id`, `label = \`${index + 1} · ${roundLabel(title, index, type)} (${t(ROUND_NAMES[type])})\``, `icon = ROUND_ICONS[type]`, `badge` = `countText('boardNotReady', n, { count: n })` для дошки з неготовими, `note` = `markError` коли в `flagged`; на кожній опції ще `data-name={roundLabel(title, index, type)}`); «+ Раунд» і кнопки типів — як зараз; `button.round-menu-button` (`aria-label=roundMenu`, `aria-haspopup="menu"`, `aria-expanded`, текст «⋯») → `div.round-menu[role="menu"]` з `button[role="menuitem"]`: `renameRound`, `moveUpShort` (`aria-label moveRoundUp`), `moveDownShort` (`aria-label moveRoundDown`), `removeRound` (`btn-danger`), ті самі `disabled`; меню лише коли раундів > 1; Esc/клік поза — закриває (`useDismiss`), ↑/↓ між пунктами, після дії — закрите. `QuizEditor` кладе `RoundStrip` і `RoundSettings` в один `div.round-bar-row`; `details.round-settings > summary` — «⚙ » (`aria-hidden`) + `roundSettings` + ⚠ (`role="img"`, `aria-label=markError`) коли `flagged`.

- [ ] **Крок 1. Тести (падають), `QuizEditor.test.tsx`, `describe('round bar (74)')`:**
  - `it('picks a round from a combobox named number, title and type')` — два раунди → `roundNames()` = `['Раунд 1', 'Фінал']` (за `roundLabel`); кнопка `Раунд: 1 · Раунд 1 (Класичний)`; `chooseRound('Фінал')` перемикає список запитань.
  - `it('shows the not-ready badge of a board round')` — дошка з порожніми клітинками: опція має `boardNotReady`.
  - `it('keeps rename, up, down and remove in the ⋯ menu with the same confirmations')` — `roundAction('Перейменувати')` викликає `window.prompt`; `roundAction('Раунд 2 вище')` міняє порядок; `roundAction('Видалити раунд')` з текстом питає `confirm`; з одним раундом кнопки «⋯» немає.
  - `it('opens the round settings from the gear next to the round picker')` — `summary` з текстом `Налаштування раунду` у `.round-bar-row`; клік відкриває `details.round-settings`.
- [ ] **Крок 2.** `pnpm vitest run --project web --maxWorkers=2 apps/web/src/editor/QuizEditor.test.tsx` — нові падають.
- [ ] **Крок 3.** Переписати `RoundStrip` (назву файлу й компонента лишити), додати `flagged` у `RoundSettings`; CSS `.round-bar`, `.round-bar-row` (`display: flex; flex-wrap: wrap; gap`; `details.round-settings[open]` — `flex-basis: 100%`), `.round-menu*` (позиція `inset-inline-end: 0`). Старі `.round-tab*`-правила не видаляти, якщо `grep` бачить інших користувачів; інакше лишити — без шкоди.
- [ ] **Крок 4. Перенести наявні тести:** кліки вкладок раундів (`getByRole('button', { name: <назва раунду> })` у `.round-tabs`, `aria-current` раунду) → `chooseRound`; «Перейменувати», «Вище/Нижче» раунду (`moveRoundUp/Down`), «Видалити раунд» → `roundAction`; `.round-tab-badge` → бейдж опції. `grep -n "round-tab\|renameRound\|Перейменувати\|Видалити раунд\|вище'\|нижче'\|aria-current" apps/web/src/editor/*.test.tsx`. Помічник `addRound` у тестах (клік «+ Раунд» → тип) лишається.
- [ ] **Крок 5.** `pnpm vitest run --project web --maxWorkers=2 apps/web/src/editor apps/web/src/pages` — зелене; `pnpm typecheck`.
- [ ] **Крок 6. Коміт:** `feat(editor): a round combobox, a ⋯ menu for round actions and the round settings gear beside them (74)`

---

### Задача 9. Панель «⚠ N», значки вкладок, рядок у нижній панелі, переходи за місцем

**Файли:** `apps/web/src/editor/IssuesPanel.tsx` (новий), `apps/web/src/editor/IssuesPanel.test.tsx` (новий), `apps/web/src/editor/QuizEditor.tsx`, `apps/web/src/editor/editor-testing.ts`, `apps/web/src/editor/QuizEditor.test.tsx`, `apps/web/src/pages/EditQuiz.test.tsx`, `apps/web/src/styles.css`.

**Інтерфейси:**
- Споживає: `placedProblemsOf`, `tabOf`, `IssuePlace`, `PlacedProblem` (Задача 5); `remindersOf`, `Reminder` (Задача 6); `showTab` (Задача 7); `useDismiss` (Задача 2).
- Видає:
  ```ts
  interface IssuesPanelProps {
    id: string;
    errors: readonly PlacedProblem[];
    reminders: readonly Reminder[];
    onGo: (place: IssuePlace) => void;   // панель закривається після переходу
    onClose: () => void;
  }
  export function IssuesPanel(props: IssuesPanelProps): JSX.Element;
  // QuizEditor (внутрішньо)
  const goTo: (place: IssuePlace) => void;
  // editor-testing.ts
  /** Клікає «Показати» в нижній панелі (або кнопку в шапці) і повертає текст ul.problems панелі. */
  export function showProblems(): string;
  ```
- DOM: у шапці (рядок над вкладками, праворуч) `div.issues` з `button.issues-button` (`aria-expanded`, `aria-controls`; текст `issuesButton` або неклікабельне `issuesNone` з `aria-disabled="true"`, коли немає ні помилок, ні нагадувань) і `section.issues-panel[aria-label=issuesTitle]`: заголовок, кнопка `issuesClose`, розділ `issuesErrors` → `ul.problems` з `li > button` (текст проблеми), розділ `issuesReminders` → `ul.reminders` (ⓘ). Значок вкладки: `span.editor-tab-badge` «⚠{n}» з `aria-label=editorTabErrors` (n — помилки з `tabOf(place) === tab`, 0 — не показувати; нейтральний колір). Нижня панель: коли `saveFailed` — `p.error[role="alert"]` «`saveBlocked`» + `button.btn-quiet` `saveBlockedShow`; помилка сервера з `onSave` — у тому ж `p.error[role="alert"]` своїм текстом (як зараз).

**`goTo(place)`** (закриває панель; після кадру — `scrollIntoView?.({ block: 'center' })` цілі й фокус на перше поле, якщо є):
- `title` → фокус поля назви.
- `general` → `showTab('general')`; `powers`/`spares`/`duels` — розгорнути; ціль `#editor-card-<card>`.
- `round` → `showTab('rounds')`, `selectRound(round)`; `settings` → `setSettingsOpen(true)`; ціль `.round-bar-row`.
- `question` → `showTab('rounds')`, раунд, `setSelected(question)`; ціль `.editor-stage [data-card="<card>"]`.
- `cell` → `showTab('rounds')`, раунд, `setBoardFocus({ category, index })`; ціль та сама.
- `category` → `showTab('rounds')`, раунд, `setBoardFocus({ category, index: 0 })`.
- `quiz` → `showTab('rounds')`.

**`save()` з помилками** (замість префіксів текстів): `touch({ type: 'all' })` (з Задачі 10; тут — прапорець `saveFailed`), для кожної помилки — `general` → розгорнути її картку; `round … settings: true` → `setSettingsOpen(true)`; далі, як зараз, `firstProblem(quiz)` → раунд/запитання/клітинка; вкладка — `'rounds'`, якщо є хоч одна помилка з `tabOf === 'rounds'`, інакше `'general'`, якщо є `general`. `update()` скидає `saveFailed` і помилку сервера (як нині `setProblems([])`). Лічильники — `useMemo` від `useDeferredValue(quiz)`.

- [ ] **Крок 1. Тести (падають):**
  - `IssuesPanel.test.tsx`: `it('lists errors and reminders in two sections')`; `it('goes to the place of a clicked row and closes')` (`onGo` з тим самим `place`, `onClose`); `it('closes on Escape')`.
  - `QuizEditor.test.tsx`, `describe('issues (74)')`:
    - `it('counts all errors and reminders in the header from the start without red')` — нова вікторина: кнопка `⚠ Помилок: 2 · нагадувань: 1` (назва, текст; опис), жодного `.has-error`.
    - `it('says everything is filled in when nothing is left')` — коректна вікторина з описом → `issuesNone`, `aria-disabled="true"`.
    - `it('badges each tab with its own errors')` — коротка категорія дуелей → `Загальне` з `Помилок: 1`; порожнє запитання → `Раунди й запитання` з `Помилок: 1`; назва не рахується в жодній.
    - `it('jumps from a row to the question, the cell and the round settings')` — клік по `Запитання 2: …` вибирає 2-ге; по клітинці — `BoardEditor` фокусує її; по рівнях драбини — `details.round-settings[open]`; по дуелях — вкладка «Загальне» і `details.duels[open]`.
    - `it('the issues list follows a removed question')` — відкрити панель, видалити запитання 1 → рядок «Запитання 2: …» став «Запитання 1: …», клік веде на 1-ше.
    - `it('a failed save shows one line with a show button and opens the place of the first problem')` — `getByRole('alert').textContent` містить `Не збережено — помилок: 1.`; `showProblems()` містить `Запитання 2: впишіть текст запитання.`; вибране запитання 2.
    - `it('a reminder never blocks saving')` — вікторина з таймером 15 с і без опису зберігається (`onSave` викликано), нагадування в панелі.
- [ ] **Крок 2.** `pnpm vitest run --project web --maxWorkers=2 apps/web/src/editor/IssuesPanel.test.tsx apps/web/src/editor/QuizEditor.test.tsx` — нові падають.
- [ ] **Крок 3.** Реалізувати; прибрати з `save()` усі префіксні перевірки (`trialPrefix`, `betsMaxPrefix`, `sparePrefixes`, `startsWith(t('duelsTitle'))` тощо) — їх замінює `place`. CSS `.issues*` (панель — `position: absolute; inset-inline-end: 0; inline-size: min(24rem, 92vw)`, `max-block-size: 60vh; overflow: auto`), `.editor-tab-badge`.
- [ ] **Крок 4. Перенести наявні тести:** перевірки тексту проблем через `getByRole('alert').textContent` / `document.querySelector('.problems')` → `showProblems()` (≈13 + 5 у `QuizEditor.test.tsx`, 4 у `EditQuiz.test.tsx`); «помилка сервера» — лишається в `alert`; `alert.closest('footer')` — лишається. Тести «відкриває дуелі/запасні/налаштування раунду при помилці» мають пройти без змін логіки перевірок (лише `openTab` там, де потрібно).
- [ ] **Крок 5.** `pnpm vitest run --project web --maxWorkers=2 apps/web/src/editor apps/web/src/pages` — зелене; `pnpm typecheck`.
- [ ] **Крок 6. Коміт:** `feat(editor): a live «⚠ N» issues panel with places, tab badges and a one-line save message (74)`

---

### Задача 10. «Торкнуті» поля: вбудовані помилки, ⚠ і ⓘ у списку й у виборі раунду

**Файли:** `apps/web/src/editor/QuizEditor.tsx`, `apps/web/src/editor/BoardEditor.tsx`, `apps/web/src/editor/BoardEditor.test.tsx`, `apps/web/src/editor/RoundSettings.tsx`, `apps/web/src/editor/QuizEditor.test.tsx`, `apps/web/src/styles.css`.

**Інтерфейси:**
- Споживає: `touchReducer`, `isTouched`, `touchKey`, `UNTOUCHED` (Задача 6); `PlacedProblem`, `IssuePlace` (Задача 5); `Reminder` (Задача 6); `QuestionEditor` проп `issue` (Задача 4); `RoundStrip.flagged`, `RoundSettings.flagged` (Задача 8).
- Видає:
  ```ts
  // BoardEditor Props +
  cellIssue?: (questionId: string) => { card: QuestionCard; text: string } | null;  // уже з урахуванням «торкнутості»
  onCellEdit?: (questionId: string) => void;
  onCellLeave?: (questionId: string) => void;   // вибрано іншу клітинку/категорію або розмонтовано
  // RoundSettings Props +
  errors?: readonly string[];   // видимі (торкнуті) помилки налаштувань — списком угорі розгортки
  ```

**Правила:**
- `useReducer(touchReducer, UNTOUCHED)`. Запитання раунду: `onChange` `QuestionEditor` → `edit(q:<id>)`; `select()`, `selectRound()`, `add/duplicate/remove/move`, перемикання вкладки → `leave(q:<id поточного>)`. Клітинка: `onCellEdit`/`onCellLeave`. Назва: `onChange` → `edit('title')`, `onBlur` → `leave('title')`. «Загальне»: `onChange` будь-якого поля в `div.editor-general` → `edit('general')`, `onBlur` (focusout) панелі → `leave('general')`. Налаштування раунду: те саме з `round:<id>` на `details.round-settings`. «Зберегти» з помилками → `all`.
- Видимі помилки: `question`/`cell` — `isTouched(q:<id>)`; `round` — `isTouched(round:<id>)` або торкнуте будь-яке запитання цього раунду (для ⚠ у виборі раунду); `general` — `isTouched('general')`; `title` — `isTouched('title')`.
- Поточне запитання: перша видима помилка з `place.kind === 'question'` для `(ri, selected)` → `QuestionEditor issue={{ card, text }}`; клітинка — через `cellIssue`.
- Назва: видима помилка → `p.error.field-error` під полем, `aria-invalid="true"`.
- «Загальне»: видима помилка з `card` → `EditorCard error` (перші тексти через «; »).
- Список запитань: `span.question-item-mark.is-error` «⚠» (`role="img"`, `aria-label=markError`) для запитань із видимою помилкою; `span.question-item-mark.is-soft` «ⓘ» (`aria-label=markReminder`) для запитань лише з нагадуваннями (нагадування видно без «торкнутості», вони не червоні); кнопка `question-item` отримує `aria-describedby` на значок, а її `aria-label` **не змінюється**.
- Вибір раунду: `flagged` — індекси раундів з видимими помилками; `RoundSettings flagged` + `errors` — видимі помилки `round … settings: true` поточного раунду.

- [ ] **Крок 1. Тести (падають):**
  - `QuizEditor.test.tsx`, `describe('touched (74)')`:
    - `it('a fresh empty question has no red until it is left')` — нова вікторина: жодного `.has-error`, `.question-item-mark.is-error`, `aria-invalid`; змінити варіант 1 → досі нічого; «Додати запитання» (перехід) → у запитання 1 `⚠` у списку; повернутися на 1 → `[data-card="question"].has-error` з `Запитання 1: впишіть текст запитання.`.
    - `it('marks the question touched when the round changes')` — змінити запитання, `chooseRound(...)` іншого раунду → опція першого раунду має `note` «є помилка» (`getByRole('option', { name: /є помилка/ })` після відкриття), у списку раунду 1 — `⚠`.
    - `it('shows every error after a save attempt')` — два порожні запитання, «Зберегти» → обидва з `⚠`, назва з `aria-invalid`, `p.field-error`.
    - `it('shows the title error after the title loses focus')` — ввести й стерти назву, `blur` → `problemTitle` під полем.
    - `it('shows a general card error once the general tab is left')` — `openTab('general')`, увімкнути дуелі, `focusOut` → `details.duels .card-error`.
    - `it('marks a question with only reminders softly')` — таймер 15 с → `ⓘ` у списку (без «торкнутості»), без `⚠`; `aria-label` кнопки запитання — той самий.
  - `BoardEditor.test.tsx`: `it('a board cell turns red only after leaving it')` — з `cellIssue`, що враховує торкнутість через обгортку-тест: змінити клітинку → без червоного; вибрати іншу → `onCellLeave` з id першої; повернутися → `.has-error`.
- [ ] **Крок 2.** `pnpm vitest run --project web --maxWorkers=2 apps/web/src/editor/QuizEditor.test.tsx apps/web/src/editor/BoardEditor.test.tsx` — нові падають.
- [ ] **Крок 3.** Реалізувати. CSS `.question-item-mark` (⚠ — колір попередження, ⓘ — приглушений), `.field-error`.
- [ ] **Крок 4.** `pnpm vitest run --project web --maxWorkers=2 apps/web/src` — увесь веб зелений; `pnpm typecheck`.
- [ ] **Крок 5. Коміт:** `feat(editor): inline errors and list marks once a question, cell or field is touched (74)`

---

### Задача 11. E2E: помічники, перенесення наявних частин і частина 74

**Файли:** `apps/server/e2e/helpers/common.ts`, `apps/server/e2e/part74-editor-layout.e2e.ts` (новий), наявні частини зі списку нижче.

**Інтерфейси (`helpers/common.ts`):**
```ts
import type { QuestionType } from '@quiz/shared';
/** Перший «Тип запитання» у scope (на полі — клітинка, а не запасні категорії): відкрити, вибрати за data-value, дочекатися закриття. */
export async function pickType(scope: Page | Locator, type: QuestionType): Promise<void>;
export async function typeOptions(scope: Page | Locator): Promise<string[]>;   // data-value; закриває Esc
export async function pickRound(page: Page, name: string): Promise<void>;     // [role=option][data-name=name]
export async function roundNames(page: Page): Promise<string[]>;
export async function roundBadge(page: Page, name: string): Promise<string | null>;
export async function roundAction(page: Page, name: string): Promise<void>;   // «⋯» → menuitem
export async function editorTab(page: Page, tab: 'Загальне' | 'Раунди й запитання'): Promise<void>;
export async function openMedia(scope: Page | Locator): Promise<void>;        // розгорнути details[data-card="media"], якщо закритий
export async function showProblems(page: Page): Promise<Locator>;             // «Показати» → ul.problems панелі
```

**Що перенести** (знайдено `grep` по `apps/server/e2e`; перед роботою — повторити пошук `typeShort`-текстів у `click(host, '…')`, `getByRole('group', { name: 'Тип запитання' })`, `.round-tab`, `.round-tabs`, `.round-tab-badge`, `'Видалити раунд'`, `'Перейменувати'`, `'Раунд N вище/нижче'`, `details.rules`, `details.teams`, `details.powers|spares|duels > summary`, `.editor-quiz`, `.problems`, `ul.problems`, `Додати зображення|Відео з YouTube|Аудіо до запитання|Картинка, що проявляється|Лише звук`):
- **Чипи типів → `pickType`/`typeOptions`:** `core.e2e.ts` (54–89, 310, 333, 465, 1034, 1472), `part08-buffs-hints-guide` (408–416, у `sparesBox`), `part09-buffs-restart-debuffs-spares` (1066, `citySpares`), `part12f-i-appeal-resume-captain-powers` (2299), `part27-bets-auction-list-letters` (50–82, 323–373, 699, 713, 1123–1156), `part28a-c-moreless-truth-drawing` (104, 125, 1225–1239), `part28d-puzzles` (235–296), `part29-board-stealth-quest` (681–724), `part29-jigsaw-spotdiff` (255–311, 1049–1099), `part29-memory-melody` (210–257, 896–935), `part36-video` (162–202), `part37-step-overshoot-alike` (201–246), `part38-spy` (215–230), `part48-wordle` (434–456), `part50-spy-hint` (159).
- **Вкладки раундів і дії → `pickRound`/`roundNames`/`roundBadge`/`roundAction`:** `core.e2e.ts` (451, 589, 797 — «Видалити раунд»), `part09` (1058), `part10a-e` (104, 120), `part10f-j` (401–419, 700, 1016–1045), `part11a-f` (158–205 — бейджі), `part12f-i` (2067), `part28d` (234), `part29-jigsaw-spotdiff` (312, 1100), `part29-memory-melody` (258, 931). «+ Раунд» → тип — без змін.
- **«Загальне» → `editorTab(host, 'Загальне')` перед, `'Раунди й запитання'` після:** `part07` (2239), `part08` (71, 393, 399, 1005), `part09` (671, 1050), `part10a-e` (83–92), `part10f-j` (1352–1359 — `details.teams` → `section.editor-card` «Командна гра»), `part12a-e` (1136–1147), `part12f-i` (1239), `part67-wide-layout` (399–411: `.editor-quiz > details.rules` → `.editor-general > .editor-card`, дві колонки на 1280+).
- **Список проблем → `showProblems`:** `part07` (2246), `part10a-e` (288, 554, 775), `part11a-f` (188), `part29-board-stealth-quest` (679, 680, 714), `part29-memory-melody` (229, 903), `part36-video` (174), `part29-jigsaw-spotdiff` (1078 — `getByRole('alert')` з текстом редактора типу; перевірити, чи це не повідомлення самого `SpotdiffEditor`).
- **Медіа → `openMedia` перед полем:** кандидати `core.e2e.ts`, `part10a-e`, `part12f-i`, `part27`, `part28a-c`, `part29-jigsaw-spotdiff`, `part29-memory-melody`, `part32-weak-network`, `part36-video` — лише там, де поле картинки/відео/звуку з `QuestionEditor` (не з `JigsawEditor`/`MelodyEditor`…).

**Частина 74 (`part74-editor-layout.e2e.ts`)** — каркас як `part73-quiz-folders.e2e.ts`/`part67-wide-layout.e2e.ts` (`useE2eServer`, `register`, `expectNoSideScroll`, `shot` під `E2E_SHOTS=1`); один `it(…, 600_000)`:
1. «Марта 74» реєструється, «Нова вікторина» на **360 × 800**: вкладка «Раунди й запитання» вибрана; шапка `⚠ Помилок: 2 · нагадувань: 1`; жодного `.has-error`; кадр `74-editor-360`; без бічної прокрутки.
2. Комбобокс типу: відкрити → нижній аркуш у межах екрана (`boundingBox` у `0…360`), 5 груп; ввести «хто я» → одна опція «Хто я?»; Esc → фокус на кнопці, тип не змінився; знову відкрити, ввести «так чи», Enter → «Так чи ні»; кадр `74-type-sheet-360`.
3. Текст запитання порожній → «+ Додати запитання» → у списку (кнопка ☰) запитання 1 з `⚠`; повернутися → картка «Запитання» червона з `Запитання 1: впишіть текст запитання.`.
4. Таймер 15 с → у картці «Час і бали» сіре нагадування; у списку `ⓘ`; панель «⚠» має розділ «Нагадування — зберегти можна» з `Запитання 1: таймер 15 с — менше за 25 с…`.
5. Клік по рядку помилки в панелі → вибране запитання 2, картка в полі зору.
6. «Загальне»: картки «Про вікторину», «Як грати», «Командна гра», згорнуті «Бафи й дебафи · вимкнено», «Запасні запитання · запасних: 0», «Дуелі · вимкнено»; URL `?tab=general`; `page.reload()` → та сама вкладка (банер чернетки над вкладками).
7. Дописати назву, тексти й відповіді (таймер лишити 15 с, опис порожній) → «Зберегти» → збережено попри нагадування (повернення на `/quizzes`, вікторина в списку).
8. **1920 × 1080**: відкрити збережену вікторину — список ліворуч, редактор праворуч, картки запитання; «Загальне» у два стовпці (верх перших двох карток на одній висоті ±1 px); комбобокс типу — випадний під кнопкою (не на всю ширину); кадри `74-editor-1920`, `74-general-1920`; без бічної прокрутки.
9. Дві раунди: «+ Раунд» → «Фінал»; `roundNames` = `['Раунд 1', 'Фінал']`; `roundAction('Раунд 2 вище')` → порядок змінився; «⚙ Налаштування раунду» стоїть у тому самому рядку, що й вибір раунду (`y` ±8 px), відкривається.

- [ ] **Крок 1.** Додати помічники в `common.ts`; `pnpm typecheck` (перевіряє й `apps/server/e2e`).
- [ ] **Крок 2.** Написати `part74-editor-layout.e2e.ts`; `pnpm build && pnpm vitest run --config apps/server/e2e/vitest.config.ts part74 --maxWorkers=2` — зелене (кадри — з `E2E_SHOTS=1`, переглянути 360 і 1920).
- [ ] **Крок 3.** Перенести наявні частини зі списку. Запускати по одному файлу (кожен піднімає свій сервер): `pnpm vitest run --config apps/server/e2e/vitest.config.ts <part> --maxWorkers=2` для `core`, `part07`, `part08`, `part09`, `part10a-e`, `part10f-j`, `part11a-f`, `part12a-e`, `part12f-i`, `part12l`, `part27`, `part28a-c`, `part28d`, `part29-board-stealth-quest`, `part29-jigsaw-spotdiff`, `part29-memory-melody`, `part32`, `part35`, `part36`, `part37`, `part38`, `part48`, `part50`, `part51`, `part52`, `part67`; збірку (`pnpm build`) — один раз перед серією. Падіння, не пов'язані з редактором, — зафіксувати, не «лагодити» чужу поведінку.
- [ ] **Крок 4.** `pnpm typecheck`; `pnpm vitest run --project web --maxWorkers=2` (увесь веб).
- [ ] **Крок 5. Коміти:** `test(e2e): editor helpers for the type and round comboboxes, tabs and the issues panel; existing parts moved to them (74)`; `test(e2e): part 74 — editor tabs, cards, type combobox with search, touched marks, timer reminder and saving with a reminder at 360 and 1920 px (74)`

---

## Перевірка після всіх задач

- `pnpm typecheck`; `pnpm vitest run --maxWorkers=2` (усі юніт-тести, 4 проєкти).
- `git diff 0762ee14 --stat -- packages apps/server/src apps/server/drizzle` — порожньо.
- `QuestionEditor.fields.test.tsx.snap` не змінювався після коміту знімка (`git log --oneline -- apps/web/src/editor/__snapshots__` — один коміт).
- `grep -n "startsWith(t(\|trialPrefix\|betsMaxPrefix\|sparePrefixes" apps/web/src/editor/QuizEditor.tsx` — порожньо.
- Блок «74» у `styles.css` — лише нові префікси, без `@media (max-width: …)`.
- Злити в `main` і запушити (версія стану не змінюється — питати не треба).
