# План 28d: раунд «Головоломки» — «Судоку» (6×6) і «Кросворд»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **План виконується після мержу 28c («Малюнок»).** Він спирається на назви з `main` після 28b і на назви, які додасть 28c:
> - з 28b: `truthRoundSchema`, `ROUND_TYPES` з `'truth'`, `rulesOf`, `shuffles`, `roundOff` (`off_truth`), `RoundSettings.tsx`, `newTruthRound`, `ADDED_28B`, `part 28b`;
> - з 28a: `Play.moreless`, `moreless.ts` (`moreLessPick`, `scoreMoreLess`, `moreLessInfo`, `playerMoreLess`), `player:moreless`, `MORELESS_PICKS_PER_SECOND`, `RoomManager.pickAllowed`, `moreLessRate`, `MoreLessView.tsx`;
> - з 28c: `'drawing'` у `QUESTION_TYPES`, `ADDED_28C`, `part 28c`;
> - `GAME_STATE_VERSION = 22`.
>
> Зразки з живим станом гравця й командою «будь-хто за команду»: `timedlist` (`listEntry`, `actorOf(…, 'answer')` у `team-act.ts`, `RoomManager.timedList`, `wordAllowed`). Літери: `ladderKey` (`packages/shared/src/wordladder.ts`), `letterSet` (`letterwords.ts`).
>
> **Перед кожною задачею виконавець звіряє назви й рядки з фактичним кодом.** Розбіжність — привід міняти лише назви й рядки, не рішення плану.

**Мета:** новий тип раунду `puzzles` («Головоломки») і два нові типи запитань, які живуть **лише** в ньому:
- `sudoku` — судоку 6×6 з блоками 2×3. Ведучий або генерує сітку за складністю (легко / середньо / важко), або сам задає цифри (редактор перевіряє, що розв'язок є і він єдиний).
- `crossword` — кросворд з 4–8 слів із підказками. Гра сама складає сітку до 12×12. Два режими: «ключове слово» (бали лише за ключове слово у виділених клітинках) і «увесь кросворд».

Гравець (команда — одна спільна сітка, вписує будь-хто з учасників) розв'язує на телефоні. Сцена й інші гравці бачать лише **маски заповнення** (які клітинки заповнені й ким), **без значень**. Цифри й літери наживо бачить лише пульт. Кнопка «Готово» фіксує розв'язання. Запитання закривається, коли «Готово» натиснули всі присутні, або коли сплив час. Оцінка: `correct` — повне правильне розв'язання (у кросворді з ключовим словом — правильне ключове слово), інакше `wrong`. Бонусу за швидкість немає. Після часу — повні сітки всіх і правильний розв'язок.

**Архітектура:**
- **Алгоритми (`shared`, чисті й детерміновані).** Їх використовують схема (перевірка), редактор (генерація й прев'ю) і рушій (оцінка).
  - `packages/shared/src/sudoku.ts`:
    - розв'язувач з підрахунком розв'язків до межі (бітові маски, найменше кандидатів — MRV);
    - генератор від `seed` за складністю;
    - пошук конфліктів.
  - `packages/shared/src/crossword.ts`:
    - літери слова (`ladderKey` без апострофа);
    - компонувальник сітки;
    - нумерація;
    - вибір клітинок ключового слова;
    - перевірка збереженої розкладки.
- **Де генерувати.** Генерує **редактор** у браузері (функції з `shared`) і **зберігає** результат у запитанні:
  - у судоку — `givens` + `solution` + `seed`;
  - у кросворді — `layout`.
  Схема на сервері при збереженні вікторини **перевіряє** збережене: розв'язок єдиний, розкладка узгоджена. Перевірка йде розв'язувачем, а не повторною генерацією, тож вона не залежить від версії генератора. Гра читає лише збережене й тому детермінована: усі бачать однакову сітку, а перезапуск нічого не перегенеровує. Окремий серверний маршрут не потрібен: 6×6 розв'язується за мікросекунди, а кросворд з 8 слів компонується за мілісекунди.
- **Дані (`shared`).** `puzzlesRoundSchema { id, type: 'puzzles', title, description?, questions }`, де в `questions` лише `sudoku` / `crossword`. Правила — `DEFAULT_RULES` (`rulesOf`). Без перемішування й без швидкості.
- **Стан (`engine`).** Одне нове **необов'язкове** поле `Play.puzzle?: PuzzlePlay`. Нові значення є лише в типах, яких старий знімок не містить (`RoundType 'puzzles'`, типи запитань, `ErrorCode`, `BuffWhy`). **`GAME_STATE_VERSION` лишається 22 — підвищення не потрібне.**
- **Сервер.** Події `player:puzzle` (пакет клітинок) і `player:puzzle-done` (кнопка «Готово»). У командній грі вписує будь-хто з учасників за команду (`act(room, id, 'answer')`). Частоту обмежує вікно на людину. Збереження — звичайним `commit`, тож стан переживає перезапуск і перепідключення.
- **Веб.**
  - Новий `apps/web/src/screens/PuzzleView.tsx`: `SudokuPlay`, `CrosswordPlay`, `PuzzleBoards` (мініатюри), `PuzzleReveal`.
  - Новий `apps/web/src/live/usePuzzleBoard.ts`: оптимістичні правки, пакетування, злиття з сервером.
  - Редактор: `apps/web/src/editor/SudokuEditor.tsx` і `CrosswordEditor.tsx`.

**Технології:** TypeScript, zod 4, vitest, Fastify + Socket.IO, React 19 + Vite + Testing Library, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-10-puzzles-round-design.md` — уся. Зразки: плани `2026-11-10-plan-28a-more-or-less.md`, `2026-11-10-plan-28b-player-truth.md`, `2026-11-10-plan-27c-timed-list.md`. Назви, підхід і стиль тестів — звідти.

## Глобальні обмеження

- 7 мов без ru, нові ключі в усі 7 локалей і списки в i18n.test.ts; нічого про росію (і в прикладах слів кросворду).
- `GAME_STATE_VERSION` не підвищувати — лише необов'язкові поля (якщо без підвищення ніяк — явно познач у шапці, контролер спитає власника).
- Юніт-тести `pnpm vitest run --maxWorkers=2`.
- Ніколи не запускати prettier.
- e2e: `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t <назва>`. Тут назва — `"part 28d"`, запуск на передньому плані, менше 10 хв.
- Конкретика для цього плану:
  - **Версія стану.** Підвищення **не потрібне**. У `restore.ts` над `READABLE_STATE_VERSIONS` додається лише коментар: «28d без нової версії: раунд puzzles, типи sudoku і crossword, необов'язковий Play.puzzle; старий знімок не містить ні того, ні того». Якщо виконавцю знадобиться обов'язкове поле — **зупинитися й спитати контролера**.
  - Нові поля схем — лише в нових типах. Кожна наявна вікторина й знімок проходять без змін (`old quizzes still parse`).
  - Типи: `pnpm typecheck`.
  - uk-рядки — в `apps/web/src/i18n.ts`, ключі — у новому `ADDED_28D` в `apps/web/src/i18n.test.ts` (додати до умови `adds no uk keys beyond the agreed list` поряд з `ADDED_28C`). Переклади — у `apps/web/src/locales/{en,pl,de,es,it,ar}.json`, довідка — у `*.help.json` тих самих 6 мов і `help-uk.ts` (+ `__fixtures__/help-uk-golden.json`, `help-vars.ts`).
  - Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`).
  - Таймери у фікстурах, e2e й прикладах — щонайменше 25 с. Типові: судоку 180 с, кросворд 240 с.
  - Приклади слів кросворду — українські загальні слова (природа, побут, Україна). Жодних назв, пов'язаних з росією.

## Рішення плану (там, де специфікація мовчить)

- **Назви в коді.**
  - Раунд — `'puzzles'`, у `ROUND_TYPES` одразу після `'truth'`.
  - Типи — `'sudoku'`, `'crossword'`, у `QUESTION_TYPES` одразу після `'drawing'`.
  - Типи доступні **лише** в `puzzles`, і `puzzles` приймає **лише** їх:
    - `puzzle_place` — головоломка будь-де ще: класика, бліц, поле, фінал, ставки, аукціон, ва-банк, вибування, мільйонер, запасні (`spare_type` уже відсікає через `SIMPLE_TYPES`), дуелі (схема дуелі);
    - `puzzles_type` — інший тип у `puzzles`.
- **Ліміти** (`LIMITS`):
  - `maxPuzzles: 10` — запитань у раунді;
  - `defaultSudokuTime: 180`, `defaultCrosswordTime: 240`, `defaultPuzzlePoints: 300`;
  - `minCrosswordWords: 4`, `maxCrosswordWords: 8`;
  - `minCrosswordWord: 2`, `maxCrosswordWord: 12` — літер у слові, без апострофа;
  - `crosswordAnswer: 30` — символів у полі слова;
  - `crosswordClue: 120`;
  - `minCrosswordKey: 3`, `maxCrosswordKey: 12`;
  - `maxCrosswordSide: 12`;
  - `puzzleBatch: 12` — клітинок в одній події.
- **Судоку: подання.**
  - Рядок з 36 символів, клітинка `i = row × 6 + col`, `'0'` — порожня, `'1'…'6'` — цифра. Блоки — 2 рядки × 3 стовпці.
  - Запитання:
    ```ts
    { ...base, type: 'sudoku', level: 'easy' | 'medium' | 'hard' | 'custom', seed: number | null, givens: string, solution: string }
    ```
  - `seed` — лише для «ще одну таку» в редакторі: `seed + 1`. Для `custom` — `null`.
- **Судоку: розв'язувач** `countSudoku(grid, limit = 2): { count: number; solution: string | null }`:
  - бітові маски рядків, стовпців і блоків;
  - рекурсія з вибором порожньої клітинки з найменшою кількістю кандидатів (MRV);
  - зупинка на `limit`;
  - `solution` — перший знайдений розв'язок (`count ≥ 1`).
  - Неправильна сітка з конфліктом заданих цифр → `{ count: 0, solution: null }` без пошуку.
  - На 6×6 це менше 1 мс, тож розв'язувач можна викликати і в `superRefine` схеми, і на кожну правку в редакторі.
- **Судоку: генератор** `generateSudoku(seed: number, level: SudokuLevel): { givens; solution }` — детермінований:
  - `seededRng(seed)` — mulberry32 з `shared/src/sudoku.ts`, не `Math.random`;
  - повна сітка — розв'язувач на порожній сітці з порядком кандидатів, перемішаним `rng`;
  - далі клітинки в перемішаному `rng` порядку прибираються по одній, поки заданих більше за ціль `SUDOKU_GIVENS = { easy: 20, medium: 16, hard: 12 }`. Прибирання лишається, лише якщо `countSudoku(…, 2).count === 1`;
  - `easy` додатково вимагає, щоб сітку розв'язували самі «одиночки» (`singlesSolvable`: голі й приховані). Інакше клітинку не прибирають;
  - `hard`: якщо один прохід зупинився вище 13 заданих — до 20 нових проходів з тим самим `rng`. Береться сітка з найменшою кількістю заданих (за рівності — перша).
  - Однаковий `seed` і `level` завжди дають ту саму сітку.
- **Судоку: перевірка схеми** (`sudokuIssue(givens, solution)`):
  - формат → `sudoku_grid`;
  - конфлікт заданих → `sudoku_conflict`;
  - 0 розв'язків → `sudoku_none`;
  - 2 і більше → `sudoku_many`;
  - `solution` не збігається зі знайденим розв'язком або `givens` не є підмножиною `solution` → `sudoku_solution`;
  - відео → `puzzle_video`.
- **Кросворд: літери.**
  - `crosswordLetters(word): string[] | null` — `ladderKey(word)`, далі апострофи прибираються (`wordLetters` з `letterwords.ts`). Не українське слово або довжина поза 2…12 → `null`.
  - Клітинка — одна літера; ґ ≠ г; апостроф клітинки не займає.
  - `crosswordLetter(ch): string | null` — один введений символ (NFC, `toLocaleLowerCase('uk')`, `/^[а-щьюяєіїґ]$/u`). Його використовують телефон і рушій.
- **Кросворд: запитання.**
  ```ts
  { ...base, type: 'crossword', mode: 'key' | 'full',
    entries: { id: string; answer: string; clue: string }[],      // 4–8
    key: string | null,                                            // лише mode 'key'
    layout: CrosswordLayout | null }                               // null — ще не складено (редактор); зберегти не можна
  interface CrosswordPlacement { id: string; row: number; col: number; dir: 'across' | 'down' }
  interface CrosswordLayout { width: number; height: number; words: CrosswordPlacement[]; keyCells: number[] }  // keyCells — у порядку літер ключа; [] у mode 'full'
  ```
  Клітинка `i = row × width + col`.
- **Кросворд: компонувальник** `layoutCrossword(entries): { ok: true; layout: CrosswordLayout } | { ok: false; reason: 'word' | 'unplaced'; ids: string[] }` — детермінований, без `rng`:
  1. Літери кожного слова (`crosswordLetters`). Невдале слово → `reason: 'word'`.
  2. Порядок — за довжиною спадно, за рівності — за порядком у редакторі.
  3. **Для кожного старту** (кожне слово по черзі) перше слово кладеться горизонтально в (0, 0) у безмежній площині. Далі проходи: кожне ще не покладене слово (у порядку з п. 2) пробує всі перетини з уже покладеними літерами — літера `j` слова на клітинку з тією самою літерою, напрямок перпендикулярний слову цієї клітинки. Кандидат допустимий, якщо:
     - кожна клітинка порожня або має ту саму літеру;
     - є хоча б один перетин;
     - клітинки перед початком і після кінця порожні;
     - у кожної **нової** клітинки сусіди збоку (перпендикулярно напрямку) порожні;
     - уже зайнята клітинка не належить слову того самого напрямку;
     - рамка після розміщення ≤ 12 × 12.
     Найкращий кандидат — більше перетинів, потім менша площа рамки, потім менші (row, col), потім `across` раніше за `down`. Проходи повторюються, поки щось кладеться.
  4. Найкращий старт — більше покладених слів, потім більше перетинів, потім менша площа, потім раніший старт.
  5. Не всі покладені → `{ ok: false, reason: 'unplaced', ids }`. Редактор попереджає: «слова не перетинаються / не вдається скласти: …».
  6. Координати зсуваються до (0, 0).
  Нумерація підказок (`crosswordNumbers`) — стандартна: номер дістають клітинки-початки в порядку читання; `across` і `down` з однієї клітинки мають один номер.
- **Кросворд: ключове слово** — `pickKeyCells(layout, letters, keyLetters): number[] | { missing: string[] }`:
  - Ключ має літери 3…12. Клітинки з однаковою літерою незалежні від інших літер, тож розв'язок існує тоді й лише тоді, коли для кожної літери ключа клітинок з нею в сітці не менше, ніж разів вона є в ключі. Пошук з поверненням не потрібен.
  - Для кожної літери ключа по черзі — ще не взята клітинка з цією літерою. Перевага: (1) слово, з якого ще не брали клітинку (ключ «розкидано» по словах); (2) клітинка не на перетині; (3) порядок читання. Детерміновано.
  - **Літер не вистачає** → `{ missing }` — мультимножина нестачі в порядку ключа, наприклад `['ф', 'о']`. Редактор показує «у словах бракує літер: ф, о — додайте слово з ними або змініть ключ». Зберегти не можна (`crossword_key_letters`), автоматичної заміни немає.
  - На телефоні ключові клітинки мають подвійну рамку й маленький номер позиції в ключі. Під сіткою — смужка ключа з цих клітинок. Тап по її клітинці вибирає клітинку сітки.
- **Кросворд: перевірка схеми** (`crosswordIssue(question)`):
  - слово не українське або поза 2…12 → `crossword_word`;
  - однакові слова (за літерами) → `crossword_duplicate`;
  - `layout === null` → `crossword_layout`;
  - розкладка не та: кожен `entries[].id` рівно раз; у межах ширини й висоти ≤ 12; літери на спільних клітинках збігаються; кожен максимальний відрізок ≥ 2 літер у кожному напрямку — рівно якесь слово; усі слова зв'язні → `crossword_layout`;
  - `mode 'key'` без ключа або ключ не 3…12 українських літер → `crossword_key`;
  - `mode 'full'` з ключем або з `keyCells` → `crossword_key_mode`;
  - `keyCells` не відповідає ключу (довжина, літери в порядку, повтори, клітинка поза сіткою) → `crossword_key_letters`;
  - відео → `puzzle_video`.
  Порожня `clue` відсікається `min(1)`.
- **Стан** (`game.ts`):
  ```ts
  /** «Головоломки» (28d): сітки гравців (команд); гравця тут немає, поки він нічого не вписав. */
  export interface PuzzlePlay {
    /** Гравці (команди), присутні на відкритті: на закритті без дошки отримують запис wrong, 0 (як timedlist.present). */
    present: string[];
    boards: Record<string, PuzzleBoard>;
  }
  export interface PuzzleBoard {
    /** Значення за клітинкою: '' — порожньо; у судоку задані клітинки не пишуться (лишаються ''). */
    cells: string[];
    /** Лише в командній грі: хто з учасників вписав клітинку останнім ('' — ніхто). */
    by?: string[];
    /** Остання змінена клітинка (для «хто зараз пише» на сцені); null — ще нічого. */
    last: number | null;
    /** Прийнятих пакетів від відкриття. */
    seq: number;
    /** Натиснуто «Готово» (у команді — будь-ким). */
    done: boolean;
  }
  // Play.puzzle?: PuzzlePlay;
  ```
  - Розмір: соло — 50 × 144 короткі рядки. У командах `by` — до 10 команд × 144 id.
- **Пакет клітинок** — `puzzleFill(state, actorId, memberId, questionIndex, cells: { i: number; v: string }[], now)`. Перевірки по черзі:
  1. `wrong_phase`, `paused`, `not_started`, `not_found`;
  2. `questionIndex !== state.questionIndex` → `puzzle_stale`;
  3. `type_mismatch`;
  4. `time_over` (`timeOverFor`);
  5. дошка `done` або вже є запис → `puzzle_done`;
  6. клітинка поза сіткою (у кросворді — блок) → `puzzle_cell`;
  7. задана клітинка судоку → `puzzle_given`;
  8. значення: судоку — `'1'…'6'` або `''`; кросворд — `crosswordLetter(v)` або `''`. Інакше → `puzzle_cell`.
  Пакет або приймається цілком, або відкидається цілком. Клітинки застосовуються по порядку: **останній запис виграє** — і в межах пакета, і між учасниками команди (сервер обробляє події по черзі). `seq + 1`, `last` — остання клітинка пакета, `by[i] = memberId` у командах. Пакет без жодної зміни — `ok` з тим самим станом (без розсилки).
- **«Готово»** — `puzzleFinish(state, actorId, now)`. Перевірки — п. 1, 3, 4, 5. Далі `done: true` і запис з **остаточними** балами (сітка вже не зміниться). Потім `autoLock` — загальна гілка «усі присутні мають запис» закриває запитання, як у `moreLessPick`. «Готово» безповоротне, телефон питає підтвердження. Порожня сітка теж дозволена.
- **Оцінка** (`puzzleRecord`, `scorePuzzle` у ланцюжку `lockNow` поряд з `scoreMoreLess`, а також у `stop`, рядок ~2549):
  - судоку — усі 36 клітинок (задані + вписані) збігаються з `solution`;
  - кросворд `full` — усі клітинки сітки збігаються з літерами слів;
  - кросворд `key` — клітинки `keyCells` збігаються з літерами ключа по порядку (решта сітки не важить);
  - `correct` → `points = round(questionPrice × rulesOf(...).multiplier)` (множник `DEFAULT_RULES` — 1), `accuracy = 1`; інакше `wrong`, 0, `accuracy = filled correct / total` (лише для статистики);
  - `streakBonus: 0`, швидкості немає;
  - на закритті запис отримують дошки без запису (повністю правильна сітка без «Готово» — теж `correct`) і **присутні на відкритті** гравці (команди) без дошки — `wrong`, 0. Мінусу немає (`DEFAULT_RULES`).
  - `PuzzleAnswer` (`answer.ts`, лише рушій; `answerSchema` його не приймає):
    ```ts
    { type: 'puzzle'; kind: 'sudoku' | 'crossword'; grid: string; filled: number; total: number; solved: boolean }
    ```
    `grid` — сітка гравця одним рядком (`'0'`/`'.'` — порожньо), для історії.
  - Ведучий оцінку не змінює: `sudoku`/`crossword` додаються до переліків `gradable` у `views.ts` (рядки ~882, 973, 1078) і до `UNGRADABLE`, як `moreless`. Ручні бали (`adjust`) — як завжди.
- **Команди.**
  - `actorOf(…, 'answer')` у `team-act.ts` для `sudoku`/`crossword` повертає команду: будь-який учасник вписує й тисне «Готово».
  - Товариші бачать значення одне одного наживо: зріз команди `ownView(state, teamId)` несе `cells`.
  - Сцена показує, хто з учасників заповнив клітинку: колір учасника з `by`.
- **Спойлери.**
  - `PublicQuestion.puzzle`:
    - судоку — `{ kind: 'sudoku', givens }`. Задані цифри публічні, `solution` не йде;
    - кросворд — `{ kind: 'crossword', mode, width, height, mask, words: [{ number, row, col, dir, length, clue }], keyCells }`, де `mask` — `'1'` клітинка, `'0'` блок. Без `answer` і без `key`; довжина ключа — `keyCells.length`.
  - `BaseView.puzzle?: PuzzleInfo` (сцена, усі телефони) — по дошці кожного гравця (команди): `{ playerId, nickname, mask, filled, total, done, last }`:
    - `mask`: `'0'` порожньо, `'g'` задана (судоку), `'#'` блок, `'1'…'9'` — хто заповнив (соло — завжди `'1'`; у командах — номер учасника в `teams.members` + 1, з 9-го — `'9'`);
    - `cells`, `solved`, `points` — `null` до `reveal`;
    - `solution` — `null` до `reveal`.
  - `HostView.puzzle` — те саме, але `cells` кожної дошки й `solution` **завжди**; `solved` — лише на `reveal`.
  - `PlayerView.me.puzzle?: PlayerPuzzle`:
    ```ts
    { cells: string[]; mask: string; done: boolean; canEdit: boolean; seq: number; result: { solved: boolean; wrong: number[]; points: number } | null }
    ```
    `result` з'являється лише на `reveal`. До кінця гравець правильності не бачить: `wrong` — лише на `reveal`.
  - Записи до `reveal` не розкриваються: у `views.ts` (рядок ~261) `answer.type === 'puzzle'` → `revealed ? answer : null`, як `moreless`.
  - Ack `player:puzzle` / `player:puzzle-done` — лише `{ ok: true }` або помилка, без правильності.
  - Чернетки (`player:draft`) для цих типів не шлються (`draftQuestionType` типів не знає).
- **Частота й пакети.**
  - `PUZZLE_BATCHES_PER_SECOND = 6` на людину (`RoomManager.puzzleAllowed`, власне вікно `puzzleRate`), понад — `too_soon`.
  - Телефон шле пакет не частіше ніж раз на `PUZZLE_FLUSH_MS = 250` мс. У польоті — не більше одного пакета, решта зливається: остання правка клітинки перемагає.
  - `too_soon` чи обрив — пакет повертається в чергу.
  - `puzzle_stale` / `puzzle_done` / `time_over` — черга очищується.
- **Злиття на телефоні** (`usePuzzleBoard`). Показ = серверні `me.puzzle.cells` + накладка ще не підтверджених власних правок (`pending: Map<cell, value>`). Ack знімає накладку. Нове значення від сервера в клітинці без накладки (товариш) показується одразу. Перепідключення: накладка порожня, сітка зі зрізу.
- **Автопілот і боти.** `testing/autopilot.ts`: бот вписує `solution` (кросворд — літери слів) одним-двома пакетами й тисне «Готово». `shared/autopilot.ts`: `puzzles` у `switch`, без `manual`.
- **Історія.** `PuzzleAnswer.grid` пишеться в `answer` як будь-яка відповідь. `PlayRef` не змінюється: запитання є в знімку вікторини. Сторінка історії показує «розв'язано / ні», а для кросворду в режимі ключа — ключове слово гравця. Демо-вікторини не змінюються.

## Порядок збирання

- Задача 2 додає типи в `Question` і `Answer`. Через вичерпні `switch` у `apps/web` повний typecheck у задачах 2–5 не проходить, тому там перевірка — `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Від задачі 6 — повний `pnpm typecheck`.
- Залежності: 2 ← 1; 3 ← 2; 4 ← 3; 5 ← 3, 4; 6 ← 1, 2; 7 ← 4, 6; 8 ← 4, 6, 7; 9 — остання.

## Фокус рев'ю

1. **Значення не тікають.** До `reveal` `JSON.stringify` зрізу сцени й будь-якого **чужого** телефона не містить жодної вписаної цифри/літери, ні `solution`, ні слів, ні ключа. `PublicQuestion` кросворду не має `answer`/`key`. Ack однаковий для правильної й хибної сітки. Тести: задача 4 — `the stage sees masks, never values`, `a rival phone sees only masks`, `the crossword question carries no answers`; задача 9 — через `socketFrames`.
2. **Детермінованість і єдиність.** `generateSudoku` з тим самим `seed` дає ту саму сітку; кожна згенерована сітка має рівно один розв'язок; `easy` розв'язується одиночками. `layoutCrossword` дає ту саму розкладку незалежно від запуску; схема відкидає зіпсовану розкладку. Тести: задача 1.
3. **Швидкість.** 1000 сіток `hard` перевіряються `countSudoku` менш ніж за 1 с; генерація однієї `hard` — менш ніж за 50 мс; компонування 8 слів — менш ніж за 20 мс. Тест: задача 1, `is fast enough for the editor and the schema`.
4. **Ключове слово.** Вибір клітинок, нестача літер, оцінка лише за ключові клітинки. Тести: задача 1, `picks key cells spread over words`, `reports missing key letters`; задача 3, `the key mode scores only the key cells`.
5. **Команди й конфлікти.** Будь-який учасник вписує, останній запис виграє, `by` правильний, «Готово» одного — за команду. Тест: задача 3, `teammates share one grid and the last write wins`.
6. **Стан і частота.** Перезапуск і перепідключення зберігають сітки; пакет понад ліміт відкидається цілком; частота. Тести: задача 5, `a restored room keeps the grids`, `puzzle batches are rate limited`.
7. **Місця.** Головоломки лише в `puzzles`, а `puzzles` — лише головоломки. Тест: задача 2, `puzzles play only in the puzzles round`.

---

### Задача 1. Спільне: розв'язувач і генератор судоку, компонувальник кросворду, ключові клітинки

**Files:**
- Create: `packages/shared/src/sudoku.ts`, `packages/shared/src/sudoku.test.ts`, `packages/shared/src/crossword.ts`, `packages/shared/src/crossword.test.ts`
- Modify: `packages/shared/src/index.ts` — `export * from './sudoku'`, `export * from './crossword'`.

**Interfaces (Produces):**
```ts
// sudoku.ts  (LIMITS тут не потрібні; файл не імпортує quiz.ts)
export const SUDOKU_SIZE = 6;
export const SUDOKU_BOX = { rows: 2, cols: 3 } as const;
export const SUDOKU_CELLS = 36;
export const SUDOKU_LEVELS = ['easy', 'medium', 'hard'] as const;
export type SudokuLevel = (typeof SUDOKU_LEVELS)[number];
export const SUDOKU_GIVENS: Record<SudokuLevel, number> = { easy: 20, medium: 16, hard: 12 };
export const EMPTY_SUDOKU = '0'.repeat(36);
export function seededRng(seed: number): () => number;                     // mulberry32
export function isSudokuGrid(grid: string): boolean;                         // /^[0-6]{36}$/
export function sudokuConflicts(grid: string): number[];                     // клітинки з повтором у рядку/стовпці/блоці
export function countSudoku(grid: string, limit?: number): { count: number; solution: string | null };
export function singlesSolvable(grid: string): boolean;
export function generateSudoku(seed: number, level: SudokuLevel): { givens: string; solution: string };
export type SudokuIssue = 'sudoku_grid' | 'sudoku_conflict' | 'sudoku_none' | 'sudoku_many' | 'sudoku_solution';
export function sudokuIssue(givens: string, solution: string): SudokuIssue | null;
// crossword.ts  (LIMITS читається лише всередині функцій: quiz.ts імпортує цей файл)
export type CrosswordDir = 'across' | 'down';
export interface CrosswordPlacement { id: string; row: number; col: number; dir: CrosswordDir }
export interface CrosswordLayout { width: number; height: number; words: CrosswordPlacement[]; keyCells: number[] }
export function crosswordLetters(word: string): string[] | null;
export function crosswordLetter(input: string): string | null;
export function layoutCrossword(entries: readonly { id: string; answer: string }[]): { ok: true; layout: CrosswordLayout } | { ok: false; reason: 'word' | 'unplaced'; ids: string[] };
/** Літери сітки за клітинкою (null — блок). */
export function crosswordCells(layout: CrosswordLayout, entries: readonly { id: string; answer: string }[]): (string | null)[];
export function crosswordNumbers(layout: CrosswordLayout): { id: string; number: number; dir: CrosswordDir; length: number }[];
export function pickKeyCells(layout: CrosswordLayout, entries: readonly { id: string; answer: string }[], key: string): number[] | { missing: string[] };
export type CrosswordLayoutIssue = 'crossword_layout' | 'crossword_key_letters';
export function crosswordLayoutIssue(layout: CrosswordLayout, entries: readonly { id: string; answer: string }[], key: string | null): CrosswordLayoutIssue | null;
```

- [ ] **Step 1: Write the failing tests.**
  - `sudoku.test.ts`:
    - `counts solutions up to the limit` — повна правильна сітка → `{ count: 1, solution: та сама }`; порожня → `count: 2` (limit 2); сітка з конфліктом → `{ count: 0, solution: null }`; сітка з однією прибраною цифрою → 1 і правильний `solution`;
    - `finds conflicts in rows, columns and boxes` — дві 5 у рядку 0, дві 3 у стовпці 4, дві 1 у блоці (рядки 2–3, стовпці 0–2) → відповідні клітинки;
    - `generates the same grid for the same seed` — `generateSudoku(7, 'medium')` двічі `toEqual`; `seed 8` — інша сітка;
    - `every generated grid has one solution` — `seed` 0…49 × три рівні: `countSudoku(givens).count === 1`, `solution` збігається, `givens` — підмножина `solution`, `sudokuConflicts(solution)` порожній;
    - `levels differ in givens` — `easy` рівно 20 і `singlesSolvable`; `medium` ≤ 17; `hard` ≤ 13 (середнє по 50 seed ≤ 12,5);
    - `checks host digits` — `sudokuIssue` для: неправильного формату (`'7'`, 35 символів) → `sudoku_grid`; конфлікту → `sudoku_conflict`; 4 заданих → `sudoku_many`; несумісних заданих без розв'язку → `sudoku_none`; хибного `solution` → `sudoku_solution`; правильного → `null`;
    - `is fast enough for the editor and the schema` — 1000 × `countSudoku` згенерованих `hard` < 1000 мс; одна `generateSudoku(…, 'hard')` < 50 мс (`performance.now()`; поріг із запасом для CI).
  - `crossword.test.ts` (слова: «калина», «лелека», «вишня», «соняшник», «мак», «криниця»; підказки довільні):
    - `normalizes crossword letters like the ladder` — «М'ята» → `['м','я','т','а']`; «Ґанок» ≠ «ганок» за першою літерою; «sun», «два слова», «а» (1 літера), 13 літер → `null`; `crosswordLetter('Ї') === 'ї'`, `crosswordLetter("'")` і `crosswordLetter('q')` → `null`;
    - `lays out words with crossings` — 6 слів → `ok`; `width`, `height` ≤ 12; кожне слово рівно раз; `crosswordLayoutIssue(layout, entries, null) === null`; хоча б 5 перетинів;
    - `is deterministic` — той самий результат двічі й після переставлення двох слів однакової довжини, якщо їхній порядок у редакторі той самий;
    - `warns when words do not cross` — «дуб», «сік», «вежа», «гриф» (жодної спільної літери) → `{ ok: false, reason: 'unplaced', ids: [...] }`; погане слово → `reason: 'word'`;
    - `keeps within 12 by 12` — вісім 12-літерних слів, що схрещуються лише кінцями → або `ok` у межах 12, або `unplaced`, але ніколи не більше 12;
    - `numbers clues in reading order` — початки across і down з однієї клітинки мають один номер;
    - `picks key cells spread over words` — ключ «ліс» → три різні клітинки, по можливості з трьох різних слів, літери збігаються по порядку; детерміновано;
    - `reports missing key letters` — ключ «футбол» → `{ missing: ['ф', 'у', 'т', 'б', …] }` з точною нестачею (з урахуванням повторів: «око» при одній «о» в сітці → `['о']`);
    - `refuses a broken layout` — зсунуте слово, літера на перетині не збігається, слова торкаються боком (зайвий відрізок), незв'язна розкладка, ширина 13 → `crossword_layout`; `keyCells` з хибною літерою чи повтором → `crossword_key_letters`;
    - `is fast enough for the editor` — 8 слів < 20 мс.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared/src/sudoku.test.ts packages/shared/src/crossword.test.ts`. Очікується FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану». `crossword.ts` імпортує `ladderKey` з `./wordladder` і `wordLetters` з `./letterwords`. `LIMITS` читаються лише всередині функцій (обидва файли імпортує `quiz.ts`).
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/shared && tsc -p packages/shared`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): 28d puzzles — a 6x6 sudoku solver that counts to two, a seeded generator by level, a deterministic crossword layout up to 12x12, key cells and missing letters"
```

---

### Задача 2. Спільне: схеми запитань і раунду, місця, ліміти, відповідь, події, помилки, зрізи, бриф

**Files:**
- Modify:
  - `packages/shared/src/quiz.ts`:
    - `LIMITS`, `QUESTION_TYPES` (+ `'sudoku'`, `'crossword'` після `'drawing'`);
    - гілки `questionSchema`;
    - `superRefine` запитання — `sudokuIssue`, `crosswordIssue`, `puzzle_video`;
    - `puzzlesRoundSchema`, `ROUND_TYPES` (+ `'puzzles'` після `'truth'`), `roundSchema`, `rulesOf` (`puzzles` → `DEFAULT_RULES`), `roundQuestions`;
    - `quizSchema.superRefine` — `puzzle_place`, `puzzles_type`; `bets_cut_place` уже покриває `betsCut`;
    - `questionPrice` — звичайна `points`;
  - `packages/shared/src/answer.ts` — `PuzzleAnswer` в `Answer` (`answerSchema` його **не** приймає);
  - `packages/shared/src/events.ts` — `puzzleFillSchema`, `puzzleDoneSchema`, `PUZZLE_BATCHES_PER_SECOND`, `ClientToServerEvents`;
  - `packages/shared/src/game.ts` — `ErrorCode`: `'puzzle_stale' | 'puzzle_done' | 'puzzle_cell' | 'puzzle_given'`, `BuffWhy`: `'off_puzzles'`;
  - `packages/shared/src/views.ts` — `PublicPuzzle` у `PublicQuestion.puzzle?`, `PuzzleInfo`, `PuzzleBoardView`, `PlayerPuzzle`, `BaseView.puzzle?`, `HostView.puzzle?`, `PlayerView.me.puzzle?`; `LiveProgress` (рядок ~1829) — `{ kind: 'puzzle'; filled: number; total: number; done: boolean }`;
  - `packages/shared/src/facts.ts` — `sudoku`/`crossword` як `moreless` (рядки ~58, ~197: вікна відповіді немає); `puzzles` — як `truth` у рядку ~199;
  - `packages/shared/src/round-brief.ts` — бриф раунду `puzzles` (скільки судоку й кросвордів, таймер);
  - `packages/shared/src/autopilot.ts` — `case 'puzzles'`;
  - `packages/shared/src/drafts.ts` — переконатися, що типи не стають типами чернетки.
- Test: `packages/shared/src/quiz.test.ts`, `packages/shared/src/facts.test.ts`, `packages/shared/src/autopilot.test.ts`

**Interfaces (Produces):**
```ts
// quiz.ts
LIMITS: maxPuzzles: 10, defaultSudokuTime: 180, defaultCrosswordTime: 240, defaultPuzzlePoints: 300,
        minCrosswordWords: 4, maxCrosswordWords: 8, minCrosswordWord: 2, maxCrosswordWord: 12, crosswordAnswer: 30,
        crosswordClue: 120, minCrosswordKey: 3, maxCrosswordKey: 12, maxCrosswordSide: 12, puzzleBatch: 12
export const SUDOKU_SOURCES = [...SUDOKU_LEVELS, 'custom'] as const;
export const CROSSWORD_MODES = ['key', 'full'] as const;
export const PUZZLE_TYPES = ['sudoku', 'crossword'] as const satisfies readonly Question['type'][];
z.object({ ...base, type: z.literal('sudoku'), level: z.enum(SUDOKU_SOURCES), seed: z.number().int().min(0).max(2 ** 32 - 1).nullable(),
           givens: z.string().regex(/^[0-6]{36}$/), solution: z.string().regex(/^[0-6]{36}$/) })
const crosswordLayoutSchema = z.object({
  width: z.number().int().min(1).max(LIMITS.maxCrosswordSide), height: z.number().int().min(1).max(LIMITS.maxCrosswordSide),
  words: z.array(z.object({ id: z.string().min(1).refine(isStorable, UNSTORABLE), row: z.number().int().min(0).max(11), col: z.number().int().min(0).max(11), dir: z.enum(['across', 'down']) })).max(LIMITS.maxCrosswordWords),
  keyCells: z.array(z.number().int().min(0).max(143)).max(LIMITS.maxCrosswordKey),
});
z.object({ ...base, type: z.literal('crossword'), mode: z.enum(CROSSWORD_MODES),
           entries: z.array(z.object({ id, answer: z.string().trim().min(1).max(LIMITS.crosswordAnswer).refine(isStorable, UNSTORABLE), clue: z.string().trim().min(1).max(LIMITS.crosswordClue).refine(isStorable, UNSTORABLE) })).min(LIMITS.minCrosswordWords).max(LIMITS.maxCrosswordWords),
           key: z.string().trim().max(LIMITS.crosswordAnswer).refine(isStorable, UNSTORABLE).nullable(),
           layout: crosswordLayoutSchema.nullable() })
/** «Головоломки» (28d): лише судоку й кросворди; без правил, швидкості й перемішування. */
export const puzzlesRoundSchema = z.object({ id, type: z.literal('puzzles'), title, description: ….optional(), questions: z.array(questionSchema).min(1).max(LIMITS.maxPuzzles) });
export type PuzzlesRound = z.infer<typeof puzzlesRoundSchema>;
// answer.ts
export interface PuzzleAnswer { type: 'puzzle'; kind: 'sudoku' | 'crossword'; grid: string; filled: number; total: number; solved: boolean }
// events.ts
export const PUZZLE_BATCHES_PER_SECOND = 6;
export const puzzleFillSchema = z.object({
  questionIndex: z.number().int().min(0).max(LIMITS.maxQuizQuestions * 2),
  cells: z.array(z.object({ i: z.number().int().min(0).max(143), v: z.string().max(2) }).strict()).min(1).max(LIMITS.puzzleBatch),
}).strict();
export const puzzleDoneSchema = z.object({ questionIndex: z.number().int().min(0).max(LIMITS.maxQuizQuestions * 2) }).strict();
'player:puzzle': (payload: z.infer<typeof puzzleFillSchema>, ack: Ack) => void;
'player:puzzle-done': (payload: z.infer<typeof puzzleDoneSchema>, ack: Ack) => void;
// views.ts
export type PublicPuzzle =
  | { kind: 'sudoku'; givens: string }
  | { kind: 'crossword'; mode: 'key' | 'full'; width: number; height: number; mask: string;
      words: { number: number; row: number; col: number; dir: 'across' | 'down'; length: number; clue: string }[]; keyCells: number[] };
export interface PuzzleBoardView { playerId: string; nickname: string; mask: string; filled: number; total: number; done: boolean; last: number | null;
  /** Ведучому завжди, іншим — лише на reveal; інакше null. */ cells: string[] | null;
  /** Лише на reveal. */ solved: boolean | null; points: number | null }
export interface PuzzleInfo { kind: 'sudoku' | 'crossword'; boards: PuzzleBoardView[]; /** Ведучому завжди, іншим лише на reveal. */ solution: string[] | null }
export interface PlayerPuzzle { cells: string[]; mask: string; done: boolean; canEdit: boolean; seq: number; result: { solved: boolean; wrong: number[]; points: number } | null }
```

- [ ] **Step 1: Write the failing tests** (`quiz.test.ts`; помічники `sudokuQ(patch)` — `generateSudoku(3, 'medium')`, 300 балів, 180 с, і `crosswordQ(patch)` — 6 слів із задачі 1, `layoutCrossword`, `mode: 'full'`, 240 с):
  - `accepts a generated and a custom sudoku` — `level: 'custom'`, `seed: null`, ручні `givens` з єдиним розв'язком;
  - `refuses a sudoku without one solution` — `sudoku_many`, `sudoku_none`, `sudoku_conflict`, `sudoku_solution`, формат → помилка парсингу;
  - `accepts a crossword in both modes` — `full`; `key` з ключем «ліс» і `pickKeyCells`;
  - `refuses a broken crossword` — `layout: null` → `crossword_layout`; англійське слово → `crossword_word`; повтор → `crossword_duplicate`; `key` без ключа → `crossword_key`; `full` з ключем → `crossword_key_mode`; хибні `keyCells` → `crossword_key_letters`; 3 і 9 слів → помилка парсингу;
  - `refuses video on a puzzle` → `puzzle_video`;
  - `puzzles play only in the puzzles round` — судоку в класиці, бліці, полі (будь-яка клітинка), фіналі, ставках, аукціоні, ва-банку, вибуванні, мільйонері → `puzzle_place`; `single` у `puzzles` → `puzzles_type`; запасне судоку → `spare_type`; дуель не приймає (схема дуелі); `puzzles` з 11 запитаннями → помилка;
  - `a puzzles round has no rules` — `rulesOf(puzzlesRound) === DEFAULT_RULES`;
  - `old quizzes still parse`;
  - `the puzzle events are limited` — 13 клітинок, `i = 144`, `v` з 3 символів, зайве поле → false; `answerSchema` не приймає `{ type: 'puzzle', … }`;
  - `ROUND_TYPES_MATCH_SCHEMA` і `QUESTION_TYPES_MATCH_SCHEMA` компілюються (наявні тести).
  - `facts.test.ts`: `a puzzle question has no answer window`.
  - `autopilot.test.ts`: `a puzzles round needs no manual check`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared`. Очікується FAIL.
- [ ] **Step 3: Implement** за блоком Interfaces. `crosswordIssue(q)` у `crossword.ts` поверх `crosswordLayoutIssue`. Місця — окремий блок у `quizSchema.superRefine` поруч з `bluffPlace`:
  ```ts
  const puzzlePlace = round.type === 'board' ? boardCells(round).some(({ cell }) => isPuzzle(cell.question)) : round.type !== 'puzzles' && roundQuestions(round).some(isPuzzle);
  ```
  і так само для `roundTrials` (вибування).
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/shared && tsc -p packages/shared`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): 28d puzzles round — sudoku and crossword questions only there, stored givens, solution and layout checked by the solver, fill and done events, views without values"
```

---

### Задача 3. Рушій: раунд, сітки, пакети, «Готово», оцінка, команди, автозакриття

**Files:**
- Create: `packages/engine/src/puzzles.ts`, `packages/engine/src/game.puzzles.test.ts`
- Modify:
  - `packages/engine/src/game.ts`:
    - `PuzzlePlay`, `PuzzleBoard`, `Play.puzzle`;
    - `openQuestion` — для `sudoku`/`crossword` `puzzle: { present: presentPlayers(state).map((p) => p.id), boards: {} }` (як `timedlist.present`);
    - `lockNow` і `stop` (рядок ~2549) — `scorePuzzle` у ланцюжку поряд з `scoreMoreLess`;
    - `submitAnswer` — `type_mismatch` для головоломок;
    - `shuffles` — `puzzles` → `false`;
    - переліки «без звичайної відповіді» поряд з `moreless`;
  - `packages/engine/src/team-act.ts` — `actorOf(…, 'answer')`: на `sudoku`/`crossword` — команда;
  - `packages/engine/src/buffs.ts` — `roundOff`: `'off_puzzles'`;
  - `packages/engine/src/splash.ts` — `puzzles` у переліку типів із заставкою (рядок ~40);
  - `packages/engine/src/live.ts` — прогрес `{ kind: 'puzzle', filled, total, done }` для «Відповідей наживо»;
  - `packages/engine/src/restore.ts` — лише коментар над `READABLE_STATE_VERSIONS`;
  - `packages/engine/src/index.ts` — `export * from './puzzles'`;
  - `packages/engine/src/testing/fixtures.ts` — `puzzlesQuiz()` (судоку `generateSudoku(1, 'easy')` 180 с + кросворд `full` 240 с + кросворд `key` «ліс» 240 с);
  - `packages/engine/src/testing/autopilot.ts` — гілка головоломок.
- Test: `packages/engine/src/game.puzzles.test.ts`, `restore.test.ts`, `autopilot.full.test.ts`, `game.buffs.test.ts`, `game.teams-act.test.ts`

**Interfaces (Produces):**
```ts
// puzzles.ts
export function puzzleOf(state: GameState, actorId: string): PuzzleBoard | null;        // поточна дошка гравця (команди)
export function puzzleSolution(question: SudokuQuestion | CrosswordQuestion): string[];  // значення за клітинкою ('' — блок/задана не входить)
export function puzzleTotal(question): number;                                            // клітинок для вписування (судоку — порожні, кросворд — літери)
export function puzzleSolved(question, cells: readonly string[]): boolean;               // full / key / судоку
export function puzzleFill(state: GameState, actorId: string, memberId: string, questionIndex: number, cells: readonly { i: number; v: string }[], now: number): Result;
export function puzzleFinish(state: GameState, actorId: string, questionIndex: number, now: number): Result;
export function scorePuzzle(state: GameState): GameState;
```

- [ ] **Step 1: Write the failing tests** (`game.puzzles.test.ts`; гравці Оля, Тарас, Петро; `puzzlesQuiz()`):
  - `a puzzles round opens its questions in order with a splash` — `intro` → судоку → `locked` → `reveal` → кросворд; таймер 180 с;
  - `fills cells and keeps the last write` — Оля шле `[{ i: 2, v: '4' }, { i: 2, v: '5' }]` → `cells[2] === '5'`, `seq: 1`, `last: 2`; порожнє значення стирає; пакет без змін → той самий стан (`toBe`);
  - `refuses a bad batch as a whole` — задана клітинка → `puzzle_given`; `v: '7'` / `'q'` → `puzzle_cell`; блок кросворду → `puzzle_cell`; у кожному випадку жодна клітинка пакета не записана;
  - `refuses late and stale batches` — `questionIndex` попереднього → `puzzle_stale`; після часу → `time_over`; пауза → `paused`; заставка → `not_started`;
  - `crossword letters are normalized` — «Ґ» → `'ґ'`, «'» → `puzzle_cell`;
  - `done fixes the grid and scores it at once` — Оля вписує повний правильний розв'язок і тисне «Готово» → запис `correct`, 300 балів, `streakBonus: 0`, `accuracy: 1`; далі пакет → `puzzle_done`; повторне «Готово» → `puzzle_done`;
  - `a wrong grid is wrong` — одна хибна цифра → `wrong`, 0;
  - `everyone done closes the question` — усі троє «Готово» → `phase: 'locked'`; відключений без «Готово» закриття не тримає;
  - `time out scores every grid` — Тарас повністю правильно без «Готово» → `correct`; Петро нічого не вписав, але був на відкритті → запис `wrong`, 0, `filled: 0`; мінусу немає;
  - `the full crossword needs every letter` — усі слова, крім однієї літери → `wrong`;
  - `the key mode scores only the key cells` — правильні лише ключові клітинки, решта порожня → `correct`; одна ключова хибна → `wrong`;
  - `teammates share one grid and the last write wins` — команди «Соняшники» (Оля, Тарас) і «Маки» (Петро, Ганна): Оля пише `i: 5 = '3'`, Тарас — `i: 5 = '1'` → `cells[5] === '1'`, `by[5] === Тарас`; «Готово» Тараса — запис команди, Оля далі → `puzzle_done`; «Маки» мають свою дошку;
  - `no buffs in the puzzles round` — баф → `off_puzzles`;
  - `the grade is not changed by the host` — `override` на головоломці → відмова, як на `moreless`.
  - `restore.test.ts`, `a restored room keeps the grids` — знімок із `Play.puzzle` читається з тими самими дошками; старий знімок без поля читається; `GAME_STATE_VERSION === 22`.
  - `autopilot.full.test.ts` — `puzzlesQuiz()` грається ботами до кінця, усі `correct`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» й зразком `moreless.ts` (`withPlay`, `limitMsOf`, `timeOverFor`, `notStarted`, `recordOf`, `autoLock`). Запис — `puzzleRecord(state, play, board, timeMs)`, як `rowRecord`. `present` — `presentPlayers(state)` на відкритті.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/engine && tsc -p packages/shared && tsc -p packages/engine`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): 28d puzzles — grids per player or team, batches where the last write wins, done fixes and scores, full or key solve only, time out grades every grid"
```

---

### Задача 4. Рушій: зрізи — маски без значень, значення пульту, розкриття

**Files:**
- Modify:
  - `packages/engine/src/views.ts`:
    - `publicQuestion` — `puzzle: publicPuzzle(question)`;
    - `puzzleInfo(state, forHost)` → `...optional('puzzle', …)` у базовому зрізі (поряд з `optional('moreless', …)`, рядок ~2321) і в `hostView`;
    - `playerPuzzle(state, actorId, memberId)` → `me.puzzle`;
    - у командній гілці `playerView` (рядок ~2742) — `me.puzzle` з дошки команди, `canEdit` для будь-якого учасника;
    - рядок ~261 — `puzzle` відкривається лише на `reveal`;
    - `gradable` — без `sudoku`/`crossword`.
- Test: Create `packages/engine/src/views.puzzles.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - `the stage sees masks, never values` — Оля вписала 5 цифр, Тарас 3 → `stageView.puzzle.boards` — `filled` 5 і 3, `mask` з `'1'` на цих клітинках і `'g'` на заданих, `cells: null`, `solution: null`; `JSON.stringify(stageView)` не містить `solution` судоку (36-символьний рядок) і вписаних значень як рядків клітинок;
  - `a rival phone sees only masks` — телефон Тараса: свої `me.puzzle.cells` зі значеннями; дошка Олі в `puzzle.boards` — лише маска;
  - `the crossword question carries no answers` — `JSON.stringify(publicQuestion)` не містить жодного слова з `entries` і ключа; `mask`, номери й довжини правильні; `keyCells` є лише в `mode 'key'`;
  - `the host sees values live` — `hostView.puzzle.boards[*].cells` і `solution` до `reveal`; `solved: null` до `reveal`;
  - `teams see who filled` — у командах `mask` має `'1'` для Олі й `'2'` для Тараса (порядок `teams.members`); товариш бачить значення команди; суперник — лише маску;
  - `reveal shows every grid and the solution` — на `reveal` у всіх `cells`, `solved`, `points`, `solution`; `me.puzzle.result.wrong` — індекси хибних клітинок, `solved`;
  - `can edit only while open` — `canEdit` false на паузі, після «Готово», на `locked`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/views.puzzles.test.ts`. Очікується FAIL.
- [ ] **Step 3: Implement.** Рядки на `reveal` — за `points` спадно, далі `filled`; до того — порядок гравців (сцена стабільна).
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/engine && tsc -p packages/engine`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): 28d puzzle views — the stage and rivals see fill masks and who filled, the host sees values live, every grid and the solution on reveal"
```

---

### Задача 5. Сервер: події, команди, частота, знімок, історія

**Files:**
- Modify:
  - `apps/server/src/rooms/manager.ts`:
    - `puzzleFill(room, playerId, questionIndex, cells)` і `puzzleDone(room, playerId, questionIndex)`: `this.act(room, playerId, 'answer')` → `who.id` (команда) і `playerId` (учасник для `by`);
    - `puzzleAllowed` + `puzzleRate` у `Room` і обох місцях створення (рядки ~691, ~766);
    - `answerStamp` — `puzzleOf(state, id)`;
  - `apps/server/src/socket.ts` — `on('player:puzzle')`, `on('player:puzzle-done')` за зразком `player:moreless`;
  - `apps/server/src/history.ts` — `PuzzleAnswer` у рядку відповіді (`solved`, `filled/total`; ключ у режимі `key`), `puzzles` у підсумку раунду;
  - `apps/server/src/achievement-games.ts` / `game-achievements.ts` — звірити вичерпні `switch` за типом відповіді.
- Test: `apps/server/src/rooms/manager.puzzles.test.ts` (Create), `apps/server/src/socket.test.ts`, `apps/server/src/history.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - `fills a grid through the socket` — `player:puzzle` → `{ ok: true }`, зріз телефона з новими `cells`, сцена — маска;
  - `a fill ack tells nothing about correctness` — правильна й хибна цифра → однаковий `{"ok":true}`;
  - `puzzle batches are rate limited` — 7 пакетів за секунду → сьомий `too_soon`, стан без нього; через секунду — знову можна;
  - `any teammate fills for the team` — два учасники однієї команди, останній запис у стані; «Готово» одного → `puzzle_done` іншому;
  - `a restored room keeps the grids` — `restart` менеджера зі збереженого знімка → ті самі `cells`, `seq`, `done`; перепідключений телефон отримує свою сітку;
  - `history shows a solved puzzle` — запис гри з головоломками: рядок відповіді з `solved`, сітка в `answer`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server`. Очікується FAIL.
- [ ] **Step 3: Implement** за зразком `RoomManager.timedList` (команда — `'answer'`) і `pickAllowed` (вікно). `puzzleFill` використовує `this.apply`: стан той самий — без розсилки.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 apps/server && tsc -p apps/server`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat(server): 28d puzzles — fill and done events, any teammate writes for the team, a rate window per person, grids survive a restart, history rows"
```

---

### Задача 6. Веб: тексти, формат, довідка, редактор раунду й головоломок

**Files:**
- Create: `apps/web/src/editor/SudokuEditor.tsx`, `apps/web/src/editor/CrosswordEditor.tsx`, `apps/web/src/editor/SudokuEditor.test.tsx`, `apps/web/src/editor/CrosswordEditor.test.tsx`
- Modify:
  - `apps/web/src/editor/draft.ts`:
    - `questionTypesFor` — `puzzles` → `PUZZLE_TYPES`; решта раундів без них;
    - `newQuestion` для `sudoku` (`generateSudoku(randomSeed, 'medium')`, 180 с, 300) і `crossword` (4 порожні слова, `layout: null`, `full`, 240 с);
    - `newPuzzlesRound`, `cleanBody` (обрізання слів/підказок, перескладання `layout`), `duplicateQuestion` (нові id слів → `layout` перескладається), `applyRoundTime`;
    - `problemKey` — ключі проблем;
    - `roundPlace`;
  - `apps/web/src/editor/draft-storage.ts` — `puzzles` без правил (рядок ~360);
  - `apps/web/src/editor/QuizEditor.tsx` — новий раунд `puzzles` у меню (рядок ~177);
  - `apps/web/src/editor/RoundSettings.tsx` — `puzzles` без правил, перемішування й швидкості (рядки ~51, ~99, ~127, ~481); примітка «лише судоку й кросворди»;
  - `apps/web/src/editor/QuestionEditor.tsx` — `case 'sudoku'`/`'crossword'`; без відео, підказки й «перевертання» (рядки ~867, ~901, ~918);
  - `apps/web/src/format.ts`, `apps/web/src/admin/admin-text.ts`, `apps/web/src/guide-text.ts`, `apps/web/src/round-summary.ts` — гілки нових типів і раунду;
  - `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts` (`ADDED_28D`), `apps/web/src/locales/*.json`, `apps/web/src/help/help-uk.ts`, `help-vars.ts`, `__fixtures__/help-uk-golden.json`, `apps/web/src/locales/*.help.json` — `round.puzzles.*`, `question.sudoku.*`, `question.crossword.*`.
- Test: `apps/web/src/editor/draft.test.ts`, `apps/web/src/i18n.test.ts`, `apps/web/src/help/*.test.ts`

**Редактор судоку** (`SudokuEditor`):
- Перемикач «Згенерувати» / «Задати свої».
- «Згенерувати»: вибір складності (легко / середньо / важко) і кнопка «Нова сітка» (`seed` — `crypto.getRandomValues`). Сітка-прев'ю з заданими цифрами й лічильником «задано N з 36». Зміна складності генерує нову сітку з тим самим `seed`.
- «Задати свої»: сітка 6×6 з полями (одна цифра 1–6, стрілки, Backspace). Під сіткою — живий стан `sudokuIssue`:
  - «Розв'язок єдиний ✓» (тоді `solution` записується);
  - «Розв'язків кілька — додайте цифри»;
  - «Розв'язку немає»;
  - «Повтор у рядку / стовпці / блоці» — конфліктні клітинки підсвічено.
  Перехід з «Згенерувати» копіює поточні задані цифри (`level: 'custom'`, `seed: null`).

**Редактор кросворду** (`CrosswordEditor`):
- 4–8 рядків «слово + підказка», «+ Слово», прибрати, вгору/вниз.
- Перемикач режиму «Увесь кросворд» / «Ключове слово» + поле ключа.
- Кожна зміна слова, ключа чи режиму синхронно перескладає `layout` (`layoutCrossword` + `pickKeyCells`). Невдача → `layout: null` і попередження:
  - `unplaced` — «слова не перетинаються: …»;
  - `word` — «лише українські слова з 2–12 літер»;
  - `missing` — «у словах бракує літер для ключа: …».
- Прев'ю сітки з номерами, літерами (лише в редакторі) і виділеними ключовими клітинками; список підказок «по горизонталі / по вертикалі».

- [ ] **Step 1: Write the failing tests:**
  - `draft.test.ts`:
    - `puzzles take only sudoku and crossword` (`questionTypesFor`);
    - `a new sudoku is generated and valid` — `newQuestion('sudoku')` проходить `questionSchema`;
    - `a new crossword waits for words` — `problemKey` → `problemCrosswordWords`;
    - `cleaning relays the crossword` — пробіли в словах, `layout` той самий, що й з `layoutCrossword`;
    - `duplicating a crossword keeps a valid layout`;
    - `puzzle problems point at the question` — `problemSudokuMany`, `problemSudokuNone`, `problemSudokuConflict`, `problemCrosswordLayout`, `problemCrosswordWord`, `problemCrosswordDuplicate`, `problemCrosswordKey`, `problemCrosswordKeyLetters`, `problemPuzzlePlace`, `problemPuzzlesType`.
  - `SudokuEditor.test.tsx`:
    - `generates by level` — клік «Нова сітка» з `easy` → 20 заданих;
    - `checks host digits live` — 4 цифри → «розв'язків кілька», конфлікт → підсвітка, єдиний → ✓ і `solution` у `onChange`.
  - `CrosswordEditor.test.tsx`:
    - `lays out the words as you type` — 4 слова з перетинами → прев'ю з номерами;
    - `warns about words that do not cross`;
    - `shows missing key letters`;
    - `key cells are marked in the preview`.
  - `i18n.test.ts` — `ADDED_28D` у всіх 7 мовах; `help` — нові сторінки в усіх `*.help.json`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/editor apps/web/src/i18n.test.ts apps/web/src/help`. Очікується FAIL.
- [ ] **Step 3: Implement.** Кириличні літерали — лише в словниках. Приклади в довідці й placeholder — «калина», «лелека», «вишня».
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 apps/web && pnpm typecheck`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): 28d puzzles editor — a puzzles round, sudoku by level or the host's digits with a live uniqueness check, a crossword laid out as you type with a key word, texts in seven languages"
```

---

### Задача 7. Веб: телефон — сітка судоку й кросворду, пакети, «Готово»

**Files:**
- Create: `apps/web/src/live/usePuzzleBoard.ts`, `apps/web/src/live/usePuzzleBoard.test.ts`, `apps/web/src/screens/PuzzleView.tsx`, `apps/web/src/screens/PuzzleView.test.tsx`, `apps/web/src/screens/puzzle.css` (або розділ у наявному CSS екранів)
- Modify: `apps/web/src/screens/PlayerScreen.tsx` — гілки `question.type === 'sudoku' | 'crossword'` поряд з `moreless` (рядки ~1090, ~1304, ~1373, ~1396, ~1414); на розкритті — `PuzzleReveal`.

**Interfaces (Produces):**
```ts
export const PUZZLE_FLUSH_MS = 250;
export function usePuzzleBoard(info: PlayerPuzzle, questionIndex: number, send: Send): {
  cells: string[];                 // показ: сервер + накладка
  set(i: number, v: string): void; // '' — стерти
  done(): Promise<AckResult>;
  status: '' | 'sending' | 'offline';
};
export function SudokuPlay(props: { info: PlayerPuzzle; question: PublicQuestion; paused: boolean; timeUp: boolean; send: Send }): JSX.Element;
export function CrosswordPlay(props: same): JSX.Element;
```

- **Судоку на телефоні.**
  - Сітка на всю ширину (квадрат, на 320 px — клітинки ≥ 44 px). Товсті межі блоків 2×3; задані цифри напівжирні й не вибираються.
  - Тап → вибрана клітинка, підсвічено її рядок, стовпець і блок.
  - Клавіатура 1–6 і «Стерти» під сіткою; фізична клавіатура (1–6, Backspace, стрілки) теж працює.
  - Кнопка «Готово» відкриває підтвердження «Зафіксувати розв'язання? Змінити вже не вийде».
- **Кросворд на телефоні.**
  - Вгорі — активна підказка («3 ↓ Червона ягода, символ України»). Нижче — сітка, на 12 стовпцях клітинки ≥ 24 px, горизонтальний скрол не потрібен. Під сіткою — смужка ключа (режим `key`) і згорнутий список підказок «По горизонталі / По вертикалі».
  - Тап по клітинці вибирає слово, повторний тап на перетині змінює напрямок. Тап по підказці вибирає слово й першу порожню клітинку.
  - Введення — прихований `<input>` з фокусом (системна клавіатура, `autoCapitalize="none"`, `autoCorrect="off"`). Кожен символ проходить `crosswordLetter`, решта ігнорується (апостроф теж). Після літери курсор перескакує на наступну клітинку слова, а в кінці слова — на наступне незаповнене слово. Backspace стирає й відступає.
- **Після «Готово» / часу:** сітка лише для перегляду, «Чекаємо інших». У командах товариші бачать ту саму сітку, а клітинки, вписані іншими, мають колір учасника.

- [ ] **Step 1: Write the failing tests:**
  - `usePuzzleBoard.test.ts`:
    - `batches edits and keeps one in flight` — 5 правок за 100 мс → один пакет; наступний — після ack;
    - `the last edit of a cell wins in a batch`;
    - `server values show where nothing is pending` — товариш змінив клітинку → видно одразу; своя непідтверджена правка не перезаписується;
    - `too soon requeues the batch`;
    - `stale clears the queue`.
  - `PuzzleView.test.tsx`:
    - `a given digit cannot be selected`;
    - `the keypad fills the selected cell`;
    - `typing jumps to the next cell of the word`;
    - `a second tap on a crossing turns the direction`;
    - `apostrophes and latin letters are ignored`;
    - `done asks to confirm`;
    - `fits 320 px` (класи без фіксованої ширини > 320).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/live/usePuzzleBoard.test.ts apps/web/src/screens/PuzzleView.test.tsx`. Очікується FAIL.
- [ ] **Step 3: Implement** за зразком `MoreLessView.tsx` (`useTimeRanOut`, `Send`, обробка ack).
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 apps/web && pnpm typecheck`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): 28d puzzle phone — a 6x6 grid with a 1-6 keypad, a crossword with jump-ahead typing, turning direction and clues, batched edits merged with teammates, done with a confirm"
```

---

### Задача 8. Веб: сцена з мініатюрами, пульт зі значеннями, розкриття, історія

**Files:**
- Modify:
  - `apps/web/src/screens/PuzzleView.tsx` — `PuzzleBoards` (мініатюри за масками), `PuzzleReveal` (повні сітки, хибні клітинки, розв'язок);
  - `apps/web/src/screens/StageScreen.tsx` — гілки поряд з `moreless` (рядки ~253, ~468, ~524);
  - `apps/web/src/screens/HostScreen.tsx` — гілка поряд з `moreless` (рядок ~1143): дошки зі значеннями, розв'язок збоку;
  - `apps/web/src/screens/LiveAnswers.tsx` — прогрес `puzzle` (рядки ~42, ~98, ~285): `filled/total`, «Готово»;
  - сторінка історії гри (там, де рендериться `moreless`) — сітка гравця й «розв'язано / ні».
- Test: `apps/web/src/screens/PuzzleView.test.tsx`, `apps/web/src/screens/StageScreen.test.tsx`, `apps/web/src/screens/HostScreen.test.tsx`

- **Сцена.**
  - Сітка мініатюр усіх гравців (команд): нік, `filled/total`, позначка «Готово ✓», підсвітка `last` (коротке спалахування). Клітинка — колір заповнювача: соло — колір гравця, команда — колір учасника. Задані цифри судоку — сірі квадрати **без цифр**, блоки кросворду — темні.
  - На 1600×900 вміщається до 24 мініатюр (6 × 4). Далі мініатюри зменшуються до мінімуму 90 px, понад 40 — дві сторінки по черзі (як інші довгі списки сцени).
  - Після часу (`reveal`) — повні сітки зі значеннями: хибні клітинки червоні, «розв'язано» зелене. Великий розв'язок ліворуч; у кросворді — слова з підказками, у режимі `key` — ключове слово великими літерами.
- **Пульт.** Ті самі дошки, але з цифрами й літерами наживо та розв'язком збоку.
- **Чужі телефони** під своєю сіткою можуть бачити лише смужку «Готово: 3 з 7» — без мініатюр (місце).

- [ ] **Step 1: Write the failing tests:**
  - `the stage draws masks without values` — у DOM немає цифр 1–6 у клітинках мініатюр;
  - `the host sees digits and letters`;
  - `reveal marks wrong cells and shows the solution`;
  - `the key word is shown on reveal`;
  - `live answers show progress and done`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens`. Очікується FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 apps/web && pnpm typecheck`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): 28d puzzle stage and host — thumbnails of every grid by fill mask and filler, values only on the host, full grids with wrong cells and the solution after time"
```

---

### Задача 9. Наскрізні сценарії й кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts` — нові `it('part 28d: …')` і помічники `sudoku28d`, `crossword28d`, `fillSudoku28d`, `typeCrossword28d`.

**Сценарії** (таймери ≥ 25 с; слова — «калина», «лелека», «вишня», «соняшник», «криниця», «мак»; ключ — «ліс»):
1. `it('part 28d: puzzles — a generated and a custom sudoku, both crossword modes, no values on the stage, values on the host, done closes, 320 px')`:
   - Редактор: раунд «Головоломки»:
     - судоку «Згенерувати / середньо»;
     - судоку «Задати свої» — спершу 4 цифри → «розв'язків кілька», потім повна єдина сітка;
     - кросворд «Увесь кросворд» з 6 слів;
     - кросворд «Ключове слово» з ключем «ліс»; перевірити попередження про бракуючі літери з ключем «футбол».
     Кадри редактора.
   - Гра, 3 телефони (один 320 px):
     - судоку: Оля розв'язує правильно й тисне «Готово», Тарас помиляється в одній клітинці, Петро не встигає;
     - кросворд `full` — набір з фізичної клавіатури з перескоком і зміною напрямку;
     - кросворд `key` — правильні лише ключові клітинки.
   - Перевірки:
     - **сцена 1600×900 без значень**: `socketFrames(stage)` до `reveal` не містить `solution` і вписаних значень; DOM мініатюр без цифр;
     - **пульт зі значеннями**;
     - «Готово» всіх → `locked`;
     - бали: судоку `correct` лише в Олі; `key` — `correct`.
   - Кадри:
     - `puzzles28d-sudoku-phone-320`, `puzzles28d-sudoku-stage`, `puzzles28d-sudoku-host`, `puzzles28d-sudoku-reveal-stage`;
     - `puzzles28d-crossword-phone-320`, `puzzles28d-crossword-stage`, `puzzles28d-crossword-host`;
     - `puzzles28d-key-phone`, `puzzles28d-key-reveal-stage`.
2. `it('part 28d: puzzles in teams — one shared grid, any member writes, the last write wins, the stage shows who filled, a restart keeps the grids')`:
   - 2 команди по 2 учасники; обидва учасники «Соняшників» вписують у ту саму клітинку — у стані останній;
   - товариш бачить значення, суперник — лише маску;
   - сцена — кольори учасників;
   - `restart()` посеред судоку → сітки ті самі, телефони продовжують;
   - «Готово» одного учасника фіксує команду.
   - Кадри: `puzzles28d-teams-stage`, `puzzles28d-teams-phone`.
3. `it('part 28d: puzzles with 24 players — the stage thumbnails fit 1600×900')` — 24 сокет-гравці заповнюють випадкові клітинки, кадр сцени `puzzles28d-24-stage` без прокрутки (`expectNoSideScroll`).

- [ ] **Step 1: Write the scenarios** (помічники за зразком `moreLess28a`, `morelessPick28a`, `socketFrames`, `shot`, `restart`, `expectPhoneFit`).
- [ ] **Step 2: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 28d"` (на передньому плані, менше 10 хв). Очікується PASS; кадри в `artifacts/shots`.
- [ ] **Step 3: Переглянути кадри**: 320 px без горизонтального скролу; сцена без цифр/літер до розкриття; пульт зі значеннями; розкриття з розв'язком.
- [ ] **Step 4: Commit**

```bash
git add apps/server/e2e
git commit -m "test(e2e): part 28d puzzles — generated and custom sudoku, both crossword modes, masks on the stage, values on the host, teams sharing a grid, a restart, 24 thumbnails"
```
