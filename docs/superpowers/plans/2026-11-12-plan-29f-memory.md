# План 29f: запитання «Пам'ять» (`memory`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> План спирається на `main` після 29d і 29i (`36ccecf1`). Звідти беремо:
> - з 29c: `PUZZLES_ROUND_TYPES`, `jigsaw_place`, `packages/engine/src/jigsaw.ts` (`jigsawRefusal`, `jigsawRecord` — бали за швидкістю, `scoreJigsaw`, `packJigsaws`, `jigsawHoldsEnd`, `liveHolds`), `RoomManager.jigsawApply`/`watchHolds`/`room.holdExpiry`, `jigsawTone` у `views.ts`, `JigsawResults`/`jigsawTablePageSize`/`JIGSAW_TABLE_PAGE`, `useJigsaw.ts` (ack, офлайн);
> - з 29d: `packages/engine/src/spotdiff.ts` (`SpotTap`, `spotdiffRefusal`, `spotdiffOf`), `noDebuffQuestion` у `debuffs.ts`, `spotdiffRate`/`windowAllowed`, `commit(…, puzzle = true)` і `PUZZLE_PUSH_MS`, `SpotdiffView.tsx` (`SpotdiffBoards`, `SpotdiffTable`, `SpotdiffStage`), `useSpotdiff.ts`, `useImageUpload` з `ImageField.tsx`, `ADDED_29D` в `i18n.test.ts`, e2e `part 29d` (`png29d`, `apiPics29d`);
> - `seededRng` (mulberry32) з `packages/shared/src/sudoku.ts`, `randomSudokuSeed` у редакторі, `roundQuestionNumber(state)`, `puzzleGrid`/`puzzlePageSize`/`usePage` з `PuzzleView.tsx`; `GAME_STATE_VERSION = 22`.
>
> **Перед кожною задачею виконавець звіряє назви й рядки з фактичним кодом** (`git show --stat 2e8cab4e` — повний перелік місць, які зачепив 29d; їх треба зачепити й тут).

**Goal:** новий тип запитання `memory` («Пам'ять»): ведучий вписує 6, 8 або 10 пар «питання — відповідь» (кожна половина — текст або картинка) і обирає сітку 3×4, 4×4 або 4×5. Кожен гравець (команда — одна спільна сітка) відкриває по 2 картки; пара лишається відкритою, непара закривається через 1 с. Бали — `максимум × час найшвидшого / свій час`, хто не знайшов усіх пар — 0.

**Architecture:**
- **Логіка (`shared/src/memory.ts`, чиста й детермінована):** розміри сіток, розклад карток із `seed` (`memoryLayout`), «чи це пара», ключ картки для перевірки повторів, бали за швидкістю. Користуються схема, редактор, рушій і e2e. Телефон розкладу **не знає**: ні `seed`, ні пар у його зрізах немає до розкриття.
- **Стан (`engine/src/memory.ts`):** необов'язкове `Play.memory?: MemoryPlay`. Дошки гравців (команд): знайдені пари (клітинки), відкрита перша картка ходу, показ непари до `until`, у командах — чий хід і до коли. Сервер приймає лише «відкрив клітинку k». Час закриття непари й кінця ходу — мс сервера, а зрізи будуються від `now`; у мить, коли спливає найближчий таймер, кімната шле зрізи ще раз (узагальнений `watchHolds`). `GAME_STATE_VERSION` лишається 22.
- **Веб:** телефон — сітка карток (сорочки), вміст картки приходить у власному зрізі лише після відкриття. Сцена й пульт — мініатюри сіток, на яких світиться лише **кількість** знайдених пар, не їхні місця. Розкриття — усі пари списком «половина ↔ половина» й таблиця часу. Редактор — вибір сітки, рядки пар із перемикачем «Текст / Картинка» для кожної половини, кнопка «Перемішати».

**Tech Stack:** TypeScript, zod 4, vitest, Fastify + Socket.IO, React 19 + Vite + Testing Library, Playwright через vitest (e2e).

**Spec:** `docs/superpowers/specs/2026-11-11-memory-pairs-design.md` (обов'язкова). Зразки: `docs/superpowers/plans/2026-11-11-plan-29d-spotdiff.md`, `docs/superpowers/plans/2026-11-11-plan-29c-jigsaw.md` і їхній код (`git log --oneline 5497fe04..2e8cab4e`, `git log --oneline 1e302e49..5497fe04`). Назви файлів у задачах повторюють зачеплені ними місця.

## Global Constraints

- 7 мов без ru. Нові ключі додаються в uk (`apps/web/src/i18n.ts`) і в `apps/web/src/locales/{en,pl,de,es,it,ar}.json`. Списки `ADDED_29F` і `ADDED_29F_PLURALS` ідуть в `apps/web/src/i18n.test.ts` і додаються до умови `adds no uk keys beyond the agreed list`, як `ADDED_29D`. Довідка: `help-uk.ts`, `__fixtures__/help-uk-golden.json`, `help-vars.ts`, `locales/*.help.json`. **Нічого про росію** — у прикладах пар, фікстурах, довідці й e2e (столиці/прапори — лише нейтральні країни, наприклад Україна, Польща, Франція, Японія, Канада; картинки в e2e — синтетичні PNG).
- `GAME_STATE_VERSION` не підвищувати, лишається **22**. Додаються лише необов'язкові поля: `Play.memory?`, `BaseView.memory?`, `HostView.memory?`, `PlayerView.me.memory?`, `PublicQuestion.memory?`. У `restore.ts` біля коментаря 29d додати рядок «29f без нової версії: тип memory і необов'язковий Play.memory». Якщо знадобиться обов'язкове поле, **зупинитися й спитати контролера**.
- **Вміст закритих карток ніколи не йде на телефон.** До `reveal` ні `PublicQuestion`, ні базовий зріз (сцена, телефони), ні зріз пульта не містять `seed`, `pairs`, тексту чи адреси картинки жодної картки. Телефон отримує вміст лише тих клітинок своєї (командної) дошки, які зараз відкриті, показані як непара або знайдені. Сцена й пульт не отримують і **місць** знайдених пар (розклад однаковий для всіх, тож місця підказали б суперникам).
- Сітки: `3x4` (3 стовпці × 4 рядки, 6 пар), `4x4` (8 пар), `4x5` (4 стовпці × 5 рядків, 10 пар). Розклад однаковий для всіх гравців і детермінований з `question.seed`.
- Непара показується **1000 мс** (`MEMORY_SHOW_MS`), потім обидві картки закриваються; поки вона показана, ця дошка не приймає відкриттів (`memory_wait`).
- Команди: одна спільна сітка; хід — дві картки одного учасника. Поки хід триває (перша картка відкрита або непара показана), інші учасники отримують `memory_busy` / `memory_wait`.
- Бали: перший, хто знайшов усі пари, — `base = round(ціна × multiplier)`; інші — `round(base × fastest / max(1, own))`; не знайшов усіх — 0, `grade 'wrong'`. Час — сервер. `streakBonus: 0`, **`basePoints` = остаточні бали** (урок 9f030b98).
- Таймер: типово **90 с**, мінімум **25 с** (схема), максимум `LIMITS.maxPuzzleTime` (600). Усі таймери у фікстурах і e2e мають бути ≥ 25 с.
- Тип дозволений **лише** в раундах `classic` і `puzzles`. Будь-де ще схема дає `memory_place`.
- **Номер запитання в подіях — номер у межах раунду** (`roundQuestionNumber(state)`, те, що телефон бачить у `view.questionIndex`), **не** `state.questionIndex`. Кожна перевірка застарілої події порівнює саме його. e2e грає «Пам'ять» **після попереднього раунду**.
- Поле на телефоні має ключ за запитанням: `key={`${view.round?.index ?? 0}:${view.questionIndex}:${question.memory.id}`}` (урок 4491f2a3).
- Юніт-тести: `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' …`. Prettier ніколи не запускати. Типи перевіряє `pnpm typecheck`.
- e2e: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 29f"` на передньому плані, менше ніж за 10 хв, Docker вимкнено.
- Кириличні літерали в `apps/web/src` допускаються лише в словниках і тестах (`source-scan.test.ts`). Кадри сцени 1600×900, телефон 320 px.

## Рішення плану (там, де специфікація мовчить)

- **Назва.** Тип називається `'memory'` і стоїть у `QUESTION_TYPES` одразу після `'spotdiff'` (перед `'bluff'`). До `PUZZLE_TYPES` **не** додається. `PUZZLES_ROUND_TYPES` стає `[...PUZZLE_TYPES, 'jigsaw', 'spotdiff', 'memory']`. `all_types` у досягненнях зростає до 27 (тест `achievements.test.ts`, коментар `29f`).
- **Запитання:**
  ```ts
  type MemoryCard = { text: string /* trim, ≤ MEMORY_TEXT_MAX = 40 */; imageUrl?: string /* IMAGE_URL */ };
  { ...base, type: 'memory',
    timeLimit: int 25…600,
    grid: '3x4' | '4x4' | '4x5',
    pairs: { a: MemoryCard; b: MemoryCard }[],  // рівно memoryGridSize(grid).pairs
    seed: int 0…2³²−1 }                          // розклад; «Перемішати» в редакторі дає новий
  ```
  Картка — **або** текст, **або** картинка: `text !== ''` xor `imageUrl !== undefined`, інакше `memory_card` (підпис під картинкою підказав би пару). Схема перевіряє: `imageUrl` запитання не null → `memory_image`; відео, аудіо чи `reveal` → `memory_video`; `hint` → `memory_hint`; кількість пар не дорівнює сітці → `memory_count`; дві однакові картки в усьому запитанні (за `memoryCardKey`) → `memory_duplicate`, бо однакові картки з різних пар не розрізнити.
- **Розклад** `memoryLayout(pairs, seed)`: Фішер—Єйтс над `[0 … 2·pairs − 1]` з `seededRng(seed)`; `layout[cell] = card`, де `card = 2·pair + side` (`side 0` — `a`, `1` — `b`). Клітинка `cell = row × cols + col`. Пара — `Math.floor(layout[c1] / 2) === Math.floor(layout[c2] / 2)`. Сітка `cols × rows`: `3x4` → 3×4, `4x4` → 4×4, `4x5` → 4 стовпці × 5 рядків (вертикальна, під телефон). `seed` належить запитанню: розклад той самий у кожній грі цієї вікторини (як відповіді) — так каже специфікація.
- **Ключ картки** `memoryCardKey(card)`: `'i:' + imageUrl` або `'t:' + text.normalize('NFC').trim().toLocaleLowerCase('uk')` (повтор «Київ» / «київ» — помилка).
- **Стан** (`game.ts`):
  ```ts
  /** «Пам'ять» (29f): дошки поточного запитання; openQuestion спорожнює дошки минулих (запис зберігає answer). */
  export interface MemoryPlay { boards: Record<string, MemoryBoard>; /** Лише в командах: учасники на відкритті (колір). */ order?: Record<string, string[]> }
  export interface MemoryBoard {
    /** Клітинки знайдених пар у порядку знахідок, парами поспіль: [c1, c2, c3, c4, …]. */ matched: number[];
    /** Лише в командах: хто знайшов кожну пару, паралельно matched / 2. */ by?: string[];
    /** Перша картка поточного ходу; null — нічого не відкрито. */ open: number | null;
    /** Непара, показана до until (мс сервера); прострочена = закрита. */ shown: { cells: [number, number]; until: number } | null;
    /** Лише в командах: чий хід і до коли (мс сервера); прострочений = вільно, і open закривається. */ turn?: { by: string; until: number } | null;
    /** Завершені ходи (дві картки). */ moves: number;
    /** Мить, коли знайдено останню пару (мс від startedAt); null — ще ні. */ doneMs: number | null;
    seq: number;
  }
  // Play.memory?: MemoryPlay;
  ```
  Прострочене (`shown.until ≤ now`, `turn.until ≤ now`) нічого не важить: рушій і зрізи «осідають» дошку функцією `settleMemory(board, now)` і не покладаються на те, що хтось її записав. Дошка з'являється на першому відкритті. Видалення гравця прибирає його дошку (`game.ts` ~1119, поряд зі `spotdiff`).
- **Хід у командах.** Перша картка учасника M ставить `turn = { by: M, until: now + MEMORY_TURN_MS }` (`MEMORY_TURN_MS = 5000`): якщо M не відкрив другу за 5 с, перша картка закривається, і сітка вільна (інакше учасник, що відійшов, заблокував би команду). Друга картка знімає `turn`. Соло `turn` немає й перша картка не спливає.
- **Подія** `player:memory` `{ questionIndex, cell }` обробляється функцією `memoryFlip`. Перевірки йдуть по черзі:
  - `wrong_phase`, `paused`, `not_started`, `not_found` (зокрема учасник не цієї команди);
  - `questionIndex !== roundQuestionNumber(state)` → `memory_stale`;
  - `type_mismatch`, `time_over`;
  - усі пари знайдено або запис уже є → `memory_done`;
  - `cell` поза `0 … cols·rows − 1` → `memory_cell`;
  - (на осілій дошці) показана непара → `memory_wait`;
  - хід іншого учасника → `memory_busy`;
  - клітинка вже знайдена → `memory_matched`; це та сама відкрита картка → `memory_open` (без зміни стану).

  Далі:
  - `open === null` → `open = cell`, у командах `turn`; `outcome 'open'`;
  - пара → `matched.push(open, cell)`, `by`, `open = null`, `turn = null`, `moves + 1`; `outcome 'match'`;
  - непара → `shown = { cells: [open, cell], until: now + MEMORY_SHOW_MS }`, `open = null`, `turn = null`, `moves + 1`; `outcome 'miss'`.

  Кожна зміна — `seq + 1`. Остання пара ставить `doneMs = now − startedAt`, пише запис і викликає `autoLock`.
- **Ack без нових полів.** Рушій повертає `MemoryFlip = { ok: true; state: GameState; outcome: 'open' | 'match' | 'miss' } | { ok: false; error: ErrorCode }`; менеджер на будь-який `ok` відповідає `{ ok: true }`. Вміст картки приходить лише зрізом (`me.memory.cells`), ніколи в ack.
- **Розсилка й таймери.** Частота `MEMORY_FLIPS_PER_SECOND = 4` на людину, вікно `memoryRate`; понад ліміт — `too_soon`. Відкриття йдуть `commit(room, state, now, true)` (перший зріз одразу, далі не частіше за `PUZZLE_PUSH_MS`); остання пара й закриття — одразу (як `jigsawApply`). `watchHolds` узагальнюється до `watchTimers(room)`: таймер `room.holdExpiry` ставиться на `min(jigsawHoldsEnd, memoryTimersEnd)`; `memoryTimersEnd(state, now)` — найближча мить після `now`, коли спливає `shown.until` або `turn.until` поточного запитання на етапі `question`. Його ж викликає відновлення кімнати (`manager.ts` ~828).
- **Оцінка** (`memoryRecord`):
  - знайшов усе: `fastest = min(timeMs усіх записів «done» цього запитання, свій)`; `points = memoryPoints(base, fastest, own)`, `grade 'correct'`, `accuracy 1`. Перший завжди найшвидший, тож бали остаточні в мить завершення;
  - на закритті (`scoreMemory` у ланцюжку `lockNow` і `stop` поряд зі `scoreSpotdiff`): дошки без запису → `wrong`, 0, `accuracy = пари / усього`, `timeMs` = ліміт. Хто не відкрив жодної картки, запису не має;
  - `basePoints: points`, `streakBonus: 0`, `multiplier` — `rulesOf(раунд)` (у `puzzles` — 1).
- `MemoryAnswer` (`answer.ts`, лише рушій; `answerSchema` його не приймає): `{ type: 'memory'; pairs: number; total: number; done: boolean; timeMs: number | null; moves: number }`.
- **Бафи й дебафи вимкнено**, як у пазлі й відмінностях: `questionOff` → `'off_memory'`; `noDebuffQuestion` і `answerersOf` у `debuffs.ts` — також для `memory`. Тип іде в `UNGRADABLE` і `PROGRESS_TYPES` (`live.ts`), у переліки `gradable` (`views.ts`, 3 місця), у `freeForAll` і «наступне без відповідача» (`answerer.ts`), у `team-act.ts` (`'answer'` — команді), у перелік `wrong_phase` (`game.ts` ~2614), а `submitAnswer` дає `type_mismatch`.
- **Зрізи:**
  - `PublicQuestion.memory?: PublicMemory = { id: string /* question.id, для ключа поля */; grid; cols; rows; total /* пар */; pairs: { a: MemoryCard; b: MemoryCard }[] | null }`. `pairs` присутні **лише на `reveal`**. `seed` і розкладу немає ніколи. `choices` і `right` — `[]`.
  - `BaseView.memory?` і `HostView.memory?`: `MemoryInfo = { boards: MemoryBoardView[] }`, `MemoryBoardView = { playerId, nickname, pairs: number /* лише кількість */, total, moves, done, timeMs, points: number | null /* лише на reveal */ }`. До `reveal` — порядок гравців; на `reveal` — `done` спершу за `timeMs`, далі за `pairs` спадно, за рівності — порядок гравців. Дошки є для всіх гравців (команд), навіть порожні. **Клітинок і вмісту тут немає**, і на пульті теж (пульт бачить те саме, що й сцена, плюс `moves`).
  - `PlayerView.me.memory?: PlayerMemory = { cells: (MemoryCellView | null)[] /* довжина cols·rows; null — закрита */; pairs; total; moves; done; canFlip: boolean; busy: { nickname: string; tone: string } | null /* лише команди: хід товариша */; closesInMs: number | null /* скільки ще показана непара */; seq; timeMs: number | null; result: { points: number } | null /* лише на reveal */ }`, де `MemoryCellView = { text: string; imageUrl: string | null; state: 'open' | 'shown' | 'matched'; tone: string | null }`. `tone` — `'1'…'9'` у командах (`jigsawTone` за `order`: хто знайшов пару чи чий хід), соло `null`. `canFlip` — `question`, не пауза, не все знайдено, немає показаної непари й чужого ходу. На `reveal` `cells` містить усі картки (гравець бачить, що де лежало).
  - `LiveProgress` — `{ kind: 'memory'; pairs: number; total: number; done: boolean }`.
- **Сцена:** сітка мініатюр «нік · x з N пар» (✓ і час у тих, хто знайшов усе), сторінки за `puzzleGrid`/`puzzlePageSize`/`usePage`. Мініатюра — `cols × rows` квадратиків, з яких світяться перші `2 · pairs` **у порядку читання** (не справжні місця). На розкритті — усі пари списком «a ↔ b» (текст чи картинка) і таблиця «місце · нік · час · бали» з тим самим зменшенням шрифту, що в `JigsawResults` (урок a129ef46).
- **Пульт** бачить те саме, що й сцена, плюс кількість ходів у рядку дошки. Ведучий і так знає пари з редактора, але пульт часто видно залі, тому розкладу там немає.
- **Редактор:** вибір сітки (три кнопки «3×4 · 6 пар» тощо). Зміна сітки дописує порожні пари або відкидає зайві з кінця. Кожна половина пари має перемикач «Текст / Картинка»: текстове поле (`maxLength 40`) або `useImageUpload` (R2/диск без змін). Кнопка «Перемішати» ставить новий `seed` (`randomSudokuSeed`). Попереднього перегляду розкладу немає.
- **Нове запитання** має `grid: '3x4'`, 6 пар з порожніми текстовими половинами, `seed: randomSudokuSeed()`, `imageUrl: null`, текст `memoryDefaultText` («Знайдіть пари»), 90 с, 300 балів. Помилки чернетки: `problemMemoryPairs` (порожня половина), `problemMemoryDuplicate`, `problemMemoryPlace`, `problemMemoryLimits`.
- **Телефон:** картки квадратні, `cols` у ряд. Розмір картки: `min((ширина − відступи) / cols, (100dvh − 190px) / rows)`, тож 4×5 на 320×568 вміщається без прокрутки. Текст картки зменшується за довжиною (≤ 8 символів — 16 px, ≤ 18 — 13 px, далі 11 px, до 3 рядків), картинка — `object-fit: contain`. Тап по закритій картці одразу показує «перевертання» (без вмісту), доки зріз не принесе вміст; `memory_wait`/`memory_busy`/`memory_open`/`too_soon` тихо скасовують «перевертання». Непара — червона рамка, закривається локально через `closesInMs` (і зрізом). Знайдена пара — зелена (у командах — колір `tone`) і притлумлена. У командах під час чужого ходу — рядок «{name} ходить» і сітка неактивна.

## Порядок збирання

- Задача 2 додає `memory` у `Question`/`Answer`, і вичерпні `switch` у `apps/web` ламаються. Тому в задачах 2–5 перевіряються лише `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`, а з задачі 6 — `pnpm typecheck`.
- Залежності: 2 ← 1; 3 ← 2; 4 ← 3; 5 ← 3, 4; 6 ← 1, 2; 7 ← 4, 6; 8 ← 4, 7; 9 — остання.

## Review Focus

1. **Вміст закритих карток не витікає.** До `reveal` у `JSON.stringify` зрізу сцени, пульта, `PublicQuestion` і телефону суперника немає тексту чи адреси жодної картки й `seed`; телефон бачить вміст лише відкритих, показаних і знайдених клітинок своєї дошки; сцена й пульт не мають місць знайдених пар. Тести: задача 4 `closed cards never reach a phone`, `the stage and host get counts only`; задача 9 — перевірка кадрів сокета.
2. **Непара закривається рівно через 1 с.** Відкриття в `t + 999` дає `memory_wait`, у `t + 1000` проходить, і показані картки вже закриті; сервер сам шле зріз у `t + 1000` без жодної події. Тести: задача 3 `a wrong pair closes after a second`; задача 5 `the server pushes the closing at one second`.
3. **Хід у команді.** Поки учасник відкрив першу картку, товариш отримує `memory_busy`; після 5 с без другої картки сітка вільна, а перша картка закрита; суперники мають свою сітку. Тести: задача 3 `teams share one grid, one move at a time`.
4. **Запитання після попереднього раунду.** Відкриття з номером у межах раунду приймається, а з `state.questionIndex` (коли вони різні) дає `memory_stale`. Тести: задача 3 `flips after an earlier round by the round-local number`; задача 5 `flips through the socket after a classic round`; задача 9 — сценарій після класики.
5. **Бали за швидкістю.** Перший — повна ціна (×2 у класиці з множником), другий — `round(base × t₁ / t₂)`, не встиг — 0 навіть з 5 з 6 парами; правило серії не змінює `basePoints`. Тести: задача 1 `points scale by the fastest time`; задача 3 `the fastest gets the full price, the rest by time, unfinished zero`.
6. **Тип не в тому раунді чи з поганими парами.** Бліц, фінал, поле, ставки, аукціон, вибування, виживання, мільйонер, запасні й дуель дають помилку; класика й «Головоломки» проходять. 7 пар на `3x4`, порожня половина, текст разом із картинкою, повтор картки — помилки. Тест: задача 2 `a memory plays only in classic and puzzles rounds` і `refuses a broken memory`.

---

### Задача 1. Спільне: сітки, розклад, пари, бали

**Files:**
- Create: `packages/shared/src/memory.ts`, `packages/shared/src/memory.test.ts`
- Modify: `packages/shared/src/index.ts` — `export * from './memory'`.

**Interfaces (Produces):**
```ts
export const MEMORY_GRIDS = ['3x4', '4x4', '4x5'] as const;
export type MemoryGrid = (typeof MEMORY_GRIDS)[number];
export const MEMORY_TEXT_MAX = 40;
export const MEMORY_MAX_CELLS = 20;
export interface MemoryCard { text: string; imageUrl?: string }
export function memoryGridSize(grid: MemoryGrid): { cols: number; rows: number; pairs: number };
export function memoryLayout(pairs: number, seed: number): number[];          // layout[cell] = card (2·pair + side)
export function memoryPairOf(layout: readonly number[], cell: number): number; // Math.floor(layout[cell] / 2)
export function memoryCardAt(question: { pairs: readonly { a: MemoryCard; b: MemoryCard }[] }, layout: readonly number[], cell: number): MemoryCard;
export function memoryCardKey(card: MemoryCard): string;
export function memoryPoints(base: number, fastestMs: number, ownMs: number): number; // round(base × fastest / max(1, own))
```
`seededRng` імпортувати з `./sudoku`; `LIMITS` тут не імпортувати (`quiz.ts` імпортує цей файл).

- [ ] **Step 1: Write the failing tests** (`memory.test.ts`):
  - `grids give columns, rows and pairs` — `3x4` → `{ cols: 3, rows: 4, pairs: 6 }`, `4x4` → `{ 4, 4, 8 }`, `4x5` → `{ cols: 4, rows: 5, pairs: 10 }`.
  - `the layout is a fixed shuffle of every card` — `memoryLayout(6, 12345)` має довжину 12, `[...].sort()` дорівнює `0…11`; повторний виклик дає той самий масив; `memoryLayout(6, 12346)` інший; `memoryLayout(10, 7)` — перестановка `0…19`. Значення `memoryLayout(6, 12345)` закріпити `toMatchInlineSnapshot` після першого зеленого запуску (зміна алгоритму зламала б збережені ігри).
  - `two cells are a pair when their cards share a pair` — для `layout = [3, 0, 2, 1]`: `memoryPairOf(layout, 0) === 1`, `memoryPairOf(layout, 3) === 0`; клітинки 0 і 2 — пара 1 (картки 3 і 2), 1 і 3 — пара 0.
  - `the card at a cell` — `memoryCardAt` з `pairs [{a:{text:'Україна'}, b:{text:'Київ'}}]` і `layout [1, 0]` → клітинка 0 — `Київ`, 1 — `Україна`.
  - `card keys ignore case and spaces` — `memoryCardKey({ text: ' Київ ' }) === memoryCardKey({ text: 'київ' })`; картинка дає `'i:/uploads/…'`, і вона не дорівнює ключу тексту з тим самим рядком.
  - `points scale by the fastest time` — `memoryPoints(300, 40000, 40000) === 300`, `memoryPoints(300, 40000, 60000) === 200`, `memoryPoints(300, 40000, 90000) === 133`, `memoryPoints(600, 30000, 45000) === 400`, `memoryPoints(300, 0, 0) === 300`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/shared/src/memory.test.ts`. Expected: FAIL (модуля немає).
- [ ] **Step 3: Implement** за «Рішеннями плану» (Фішер—Єйтс як `shuffle` у `sudoku.ts`; якщо її не експортовано — локальна копія з тим самим порядком викликів `rng`).
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/shared && tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 29f memory logic — 3×4, 4×4 and 4×5 grids, a fixed seeded layout, pair checks, card keys, points by the fastest time"
```

---

### Задача 2. Спільне: запитання, місця, ліміти, відповідь, подія, помилки, зрізи

**Files:**
- Modify:
  - `packages/shared/src/quiz.ts`:
    - `LIMITS`: `minMemoryTime: 25`, `defaultMemoryTime: 90`, `defaultMemoryPoints: 300` (з doc-коментарями, як у `spotdiff`);
    - `QUESTION_TYPES`: `'memory'` після `'spotdiff'`;
    - гілка `questionSchema`;
    - `superRefine` запитання: `memory_image`, `memory_video`, `memory_hint`, `memory_count`, `memory_card`, `memory_duplicate`;
    - `PUZZLES_ROUND_TYPES` + `'memory'`;
    - блок `memory_place` у `quizSchema.superRefine` поряд зі `spotdiffPlace` (той самий вираз, тип `'memory'`).
  - `packages/shared/src/answer.ts` — `MemoryAnswer` в `Answer`.
  - `packages/shared/src/events.ts` — `memoryFlipSchema`, `MEMORY_FLIPS_PER_SECOND = 4`, `MEMORY_SHOW_MS = 1000`, `MEMORY_TURN_MS = 5000`, `'player:memory'` у `ClientToServerEvents` (doc-коментар з переліком помилок, як у `player:spotdiff`).
  - `packages/shared/src/game.ts`:
    - `ErrorCode`: `'memory_stale' | 'memory_done' | 'memory_cell' | 'memory_wait' | 'memory_busy' | 'memory_matched' | 'memory_open'`;
    - `BuffWhy`: `'off_memory'`.
  - `packages/shared/src/views.ts`:
    - типи `PublicMemory`, `MemoryBoardView`, `MemoryInfo`, `MemoryCellView`, `PlayerMemory`;
    - поля `PublicQuestion.memory?`, `BaseView.memory?`, `HostView.memory?`, `PlayerView.me.memory?`;
    - `LiveProgress` `{ kind: 'memory' … }`.
  - `packages/shared/src/facts.ts` — `memory` без вікна відповіді (у ті самі два місця, що й `spotdiff`).
  - `packages/shared/src/round-brief.ts` — лічильник `memory` у брифі `puzzles`.
  - `packages/shared/src/achievements.test.ts` — `all_types: 27`, у коментар додати `29f`.
- Test: `packages/shared/src/quiz.test.ts`, `packages/shared/src/facts.test.ts`, `packages/shared/src/achievements.test.ts`

**Interfaces (Produces):**
```ts
// quiz.ts
const memoryCard = z.object({ text: z.string().trim().max(MEMORY_TEXT_MAX).refine(isStorable, UNSTORABLE), imageUrl: z.string().regex(IMAGE_URL).optional() });
z.object({ ...base, type: z.literal('memory'),
  timeLimit: z.number().int().min(LIMITS.minMemoryTime).max(LIMITS.maxPuzzleTime),
  grid: z.enum(MEMORY_GRIDS),
  pairs: z.array(z.object({ a: memoryCard, b: memoryCard })).min(6).max(10),
  seed: z.number().int().min(0).max(2 ** 32 - 1) })
// events.ts — questionIndex: номер у раунді, без верхньої межі
export const memoryFlipSchema = z.object({ questionIndex: z.number().int().nonnegative(), cell: z.number().int().min(0).max(MEMORY_MAX_CELLS - 1) }).strict();
'player:memory': (payload: z.infer<typeof memoryFlipSchema>, ack: Ack) => void;
// answer.ts
export interface MemoryAnswer { type: 'memory'; pairs: number; total: number; done: boolean; timeMs: number | null; moves: number }
// views.ts — форми з «Рішень плану»
```

- [ ] **Step 1: Write the failing tests** (`quiz.test.ts`). Помічник `memQ(patch)`: `grid: '3x4'`, 6 пар (п'ять текстових «країна — столиця» нейтральних країн і одна з картинкою-прапором `'/uploads/' + 'f'.repeat(32) + '.png'` у половині `a`), `seed: 42`, 90 с, 300 балів, `imageUrl: null`.
  - `accepts a memory` — парситься; `4x4` з 8 парами й `4x5` з 10 теж.
  - `refuses a broken memory`:
    - `imageUrl` не null → `memory_image`;
    - відео, аудіо чи `reveal` → `memory_video`;
    - `hint` → `memory_hint`;
    - 7 пар на `3x4`, 8 пар на `4x5` → `memory_count`;
    - половина `{ text: '' }` без картинки → `memory_card`; `{ text: 'Київ', imageUrl }` → `memory_card`;
    - `a: 'Київ'` в одній парі й `b: ' київ'` в іншій → `memory_duplicate`; дві однакові адреси картинок → `memory_duplicate`;
    - текст 41 символ, `seed: -1`, `grid: '5x5'`, `timeLimit: 24`, картинка `'https://x/y.png'` → помилка парсингу;
    - `timeLimit: 25` → ок.
  - `a memory plays only in classic and puzzles rounds`:
    - у `classic` і в `puzzles` (разом із судоку, пазлом і відмінностями) → ок;
    - у `blitz`, `final`, на клітинці `board`, у `bets`, `auction`, `wipeout`, `survival` (і в trial) та `ladder` → `memory_place`;
    - запасне запитання цього типу → `spare_type`;
    - дуель його не приймає.
  - `the memory event is limited` — `cell: 20`, `cell: -1`, `cell: 1.5`, зайве поле → false; `{ questionIndex: 7, cell: 19 }` → true; `answerSchema` не приймає `{ type: 'memory', … }`.
  - `QUESTION_TYPES_MATCH_SCHEMA` компілюється; `QUESTION_TYPES.indexOf('memory') === QUESTION_TYPES.indexOf('spotdiff') + 1`; `old quizzes still parse` лишається без змін.
  - `facts.test.ts`: `a memory has no answer window`.
  - `achievements.test.ts`: `all_types: 27`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/shared`. Expected: FAIL.
- [ ] **Step 3: Implement** за Interfaces. Перевірка `memory_count` — `pairs.length !== memoryGridSize(grid).pairs`; `memory_duplicate` — по всіх `2·pairs` картках через `memoryCardKey`.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/shared && tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 29f memory question — 6, 8 or 10 pairs of text or picture halves on a seeded grid, only in classic and puzzles rounds, a flip event, views without card contents before reveal"
```

---

### Задача 3. Рушій: відкриття, пара й непара, хід команди, оцінка, закриття

**Files:**
- Create: `packages/engine/src/memory.ts`, `packages/engine/src/game.memory.test.ts`
- Modify:
  - `packages/engine/src/game.ts`:
    - `MemoryPlay`, `MemoryBoard`, `Play.memory?`;
    - `openQuestion` (~1437): для `memory` той самий вираз `{ boards: {}, order? }`, що в `spotdiff`; `plays` через `packMemories`;
    - видалення гравця (~1119) прибирає його дошку;
    - `lockNow` (~1826) і `stop` (~2696) — `scoreMemory` поряд зі `scoreSpotdiff`;
    - `submitAnswer` (~1972) — `type_mismatch`; перелік ~2614 — `memory`.
  - `packages/engine/src/team-act.ts`, `packages/engine/src/answerer.ts` — `memory` поряд зі `spotdiff`.
  - `packages/engine/src/buffs.ts` — `PlaceBlock`/`questionOff` → `'off_memory'`.
  - `packages/engine/src/debuffs.ts` — `noDebuffQuestion` і `answerersOf` також для `memory`.
  - `packages/engine/src/live.ts` — `PROGRESS_TYPES`, `UNGRADABLE`, прогрес `memory`.
  - `packages/engine/src/restore.ts` — лише коментар; `packages/engine/src/index.ts` — `export * from './memory'`.
  - `packages/engine/src/testing/fixtures.ts` — `memory` (3×4, 6 пар, одна половина — картинка, `seed: 42`, 90 с, 300 балів), `memorySmall` (4×4, 8 пар, 60 с) і `memoryQuiz(settings)`:
    - раунд `classic` з одним `single` на 30 с;
    - раунд `classic` з `memory`;
    - раунд `puzzles` із судоку й `memorySmall`.
  - `packages/engine/src/testing/autopilot.ts` — бот відкриває клітинки пар за `memoryLayout(question.pairs.length, question.seed)` з номером `roundQuestionNumber`, пару за парою.
- Test: `game.memory.test.ts`, `restore.test.ts`, `autopilot.full.test.ts`, `game.buffs.test.ts`

**Interfaces:**
- Consumes: `memoryLayout`, `memoryPairOf`, `memoryGridSize`, `memoryPoints`, `MEMORY_SHOW_MS`, `MEMORY_TURN_MS`, `MemoryAnswer`, `roundQuestionNumber`, `withPlay`, `autoLock`, `recordOf`, `timeOverFor`, `limitMsOf`, `notStarted`, `teamsOn`, `memberOf`, `questionPrice`, `rulesOf`.
- Produces:
```ts
export type MemoryQuestion = Extract<Question, { type: 'memory' }>;
export type MemoryFlip = { ok: true; state: GameState; outcome: 'open' | 'match' | 'miss' } | { ok: false; error: ErrorCode };
export function memoryOf(state: GameState, actorId: string): MemoryBoard | null;
export function settleMemory(board: MemoryBoard, now: number): MemoryBoard;   // прострочені shown/turn знято, open після turn закрито; без змін — той самий об'єкт
export function memoryFlip(state: GameState, actorId: string, memberId: string, questionIndex: number, cell: number, now: number): MemoryFlip;
export function memoryTimersEnd(state: GameState, now: number): number | null;
export function scoreMemory(state: GameState): GameState;
export function packMemories(plays: Play[]): Play[];
```

- [ ] **Step 1: Write the failing tests** (`game.memory.test.ts`). Гравці: Оля, Тарас, Петро. Береться `memoryQuiz()`, а помічник `toMemory(state)` проходить перший раунд і відкриває `memory`, тож `roundQuestionNumber = 0`, а `state.questionIndex = 1`. Помічник `cellsOf(pair)` повертає дві клітинки пари за `memoryLayout(6, 42)`; `wrongPair()` — дві клітинки різних пар.
  - `flips after an earlier round by the round-local number` — відкриття з `questionIndex: 0` → `outcome 'open'`, `open` = клітинка; з `questionIndex: 1` → `memory_stale`.
  - `a pair stays open` — дві клітинки пари 0 → `outcome 'match'`, `matched` = ці дві, `open null`, `moves 1`, `seq 2`.
  - `a wrong pair closes after a second`:
    - Петро відкриває непару в `t` → `outcome 'miss'`, `shown.until = t + 1000`, `moves 1`;
    - відкриття в `t + 999` → `memory_wait`, стан той самий (`toBe`);
    - у `t + 1000` нове відкриття проходить, і `shown` уже `null`;
    - `memoryTimersEnd(state, t)` → `t + 1000`; `memoryTimersEnd(state, t + 1000)` → `null`.
  - `refuses bad flips` — `cell: 12` на `3x4` → `memory_cell`; знайдена клітинка → `memory_matched`; та сама відкрита → `memory_open` без зміни стану; пауза → `paused`; після `timeLimit` → `time_over`; заставка → `not_started`; `locked` → `wrong_phase`.
  - `the fastest gets the full price, the rest by time, unfinished zero`:
    - Оля знаходить усі 6 пар за 40 с → запис `correct`, 300, `basePoints 300`, `streakBonus 0`, `answer { pairs: 6, total: 6, done: true, timeMs: 40000, moves: 6 }`;
    - далі відкриття → `memory_done`;
    - Тарас знаходить усі за 60 с → 200;
    - Петро знайшов 5 з 6 → на закритті `wrong`, 0, `accuracy 5/6`, `timeMs` = ліміт;
    - гравець без відкриттів — без запису.
  - `a classic ×2 doubles the base, a streak rule keeps basePoints` — раунд з `multiplier: 2`: перший має 600; з правилом серії `points` і `basePoints` однакові (урок 9f030b98).
  - `everyone done closes the question` — усі троє знайшли все → `phase: 'locked'`.
  - `the puzzles round has no multiplier and no buffs` — у `puzzles` (4×4, `roundQuestionNumber 1`) перший має повну ціну; баф → `off_puzzles`; у класиці баф → `off_memory`; дебаф на `memory` не ставиться.
  - `teams share one grid, one move at a time`. Команди «Соняшники» (Оля, Тарас) і «Маки» (Петро, Ганна).
    - Оля відкриває клітинку → `turn.by = Оля`, `turn.until = t + 5000`;
    - Тарас у `t + 100` → `memory_busy`;
    - Оля другою карткою знаходить пару → `by [Оля]`, `turn null`; Тарас одразу може ходити;
    - Тарас відкриває непару → Оля в `t' + 500` отримує `memory_wait`;
    - Оля відкриває одну картку й більше нічого: у `t'' + 5000` Тарас ходить, а перша картка Олі закрита (`settleMemory` → `open null`);
    - «Маки» мають свою дошку, і їхнє відкриття не бачить `turn` «Соняшників»;
    - у раунді з відповідачем `captain` ходити може й не капітан.
  - `the grade is not changed by the host` — `override` дає відмову, як на `spotdiff`.
  - `a removed player leaves no board` і `the next question empties the boards` (`packMemories`).
  - `restore.test.ts`: `a restored room keeps the memory boards` — знімок із `Play.memory` (з `shown` і `turn`) читається з тими самими `matched`/`moves`; старий знімок без поля теж читається; `GAME_STATE_VERSION === 22`.
  - `autopilot.full.test.ts`: `memoryQuiz()` грається ботами до кінця, усі `memory` мають `correct`, а найшвидший — повну ціну.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/engine/src/game.memory.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» і зразками `packages/engine/src/spotdiff.ts` (перевірки, `SpotTap` → `MemoryFlip`) та `packages/engine/src/jigsaw.ts` (`jigsawRecord` → `memoryRecord`: найшвидший серед записів `done`; `jigsawHoldsEnd` → `memoryTimersEnd`). Порожня дошка: `{ matched: [], ...(teamsOn ? { by: [], turn: null } : {}), open: null, shown: null, moves: 0, doneMs: null, seq: 0 }`. Розклад рахується з запитання при кожному відкритті (у стан не пишеться).
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/engine && tsc -p packages/shared && tsc -p packages/engine`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/engine
git commit -m "feat(engine): 29f memory — server-checked flips on a seeded grid, a wrong pair shown for a second, one move at a time on a shared team grid, points by the fastest time"
```

---

### Задача 4. Рушій: зрізи

**Files:**
- Modify: `packages/engine/src/views.ts`:
  - `publicQuestion`: `memory: publicMemory(question, revealed)`, де `pairs` лише на `reveal`; `seed` ніколи;
  - `memoryInfo(state, reveal)` → `optional('memory', …)` у базовому зрізі (~2720);
  - `hostView` (~3486) — той самий `memoryInfo` (без клітинок);
  - `playerMemory(state, actorId, memberId, now)` → `me.memory` у соло-гілці (~3133) і командній (~3148, `memberId = member.id`);
  - `answer.type === 'memory'` → `revealed ? answer : null` (~285);
  - `gradable` без `memory` (3 місця).
- Test: Create `packages/engine/src/views.memory.test.ts`

**Interfaces:**
- Consumes: `memoryOf`, `settleMemory`, `memoryLayout`, `memoryCardAt`, `jigsawTone`, `MemoryPlay`.
- Produces: `PublicMemory`, `MemoryInfo`, `PlayerMemory` у зрізах (форми — задача 2).

- [ ] **Step 1: Write the failing tests:**
  - `closed cards never reach a phone`:
    - на `question` і `locked`: `publicQuestion.memory.pairs === null`, немає ключа `seed`, `choices`/`right` порожні, `imageUrl: null`;
    - Оля відкрила одну клітинку: `JSON.stringify` зрізу сцени, пульта й телефонів Тараса й Петра не містить жодного тексту карток і адреси картинки; телефон Олі містить текст лише цієї клітинки, а `cells` має рівно один не-`null` елемент;
    - на `reveal` `pairs` мають 6 пар, а `me.memory.cells` — усі 12 карток.
  - `a wrong pair is visible while shown` — після непари в `t` телефон у `t + 500` має дві клітинки `state 'shown'` і `closesInMs 500`; у `t + 1000` обидві `null` і `closesInMs null` (зріз від `now`, без зміни стану).
  - `the stage and host get counts only` — Оля 2 пари, Тарас 0 → `boards` для всіх трьох у порядку гравців, `pairs` 2 і 0, `total 6`, `moves`, `points: null`; у `MemoryBoardView` немає ключів `cells`/`matched`.
  - `teammates see the move and the finder colours` — у командах Тарас бачить відкриту картку Олі (`state 'open'`, `tone '1'`), `busy { nickname: 'Оля', tone: '1' }` і `canFlip false`; знайдена Олею пара має `tone '1'`; «Маки» нічого з цього не бачать.
  - `reveal ranks by time` — на `reveal` спершу ті, хто знайшов усе (за `timeMs`), далі за `pairs` спадно; `points` заповнені; `me.memory.result.points`.
  - `can flip only while open` — `canFlip` false на паузі, під час показаної непари, після «знайшов усе» й на `locked`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/engine/src/views.memory.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за зразком `spotdiffInfo`/`playerSpotdiff` і `playerJigsaw` (тон і `now`) у тому ж файлі.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/engine && tsc -p packages/engine`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/engine
git commit -m "feat(engine): 29f memory views — pair counts for the stage and host, only open, shown and matched cards on the own phone, teammate moves with colours, all pairs on reveal"
```

---

### Задача 5. Сервер: подія, частота, таймери розсилки, історія, seed-тести

**Files:**
- Modify:
  - `apps/server/src/rooms/manager.ts`:
    - `memoryFlip(room, playerId, payload): AckResult` — `this.act(room, playerId, 'answer')`, далі `windowAllowed(room.memoryRate, playerId, now, MEMORY_FLIPS_PER_SECOND)`, потім `memoryFlip` рушія; на будь-який `ok` — `{ ok: true }`;
    - коміт: остання пара (`doneMs` з'явився) або зміна етапу — `commit(room, state, now)`, інакше `commit(room, state, now, true)`;
    - поле `memoryRate` у `Room` і обох місцях створення (~738, ~819), очищення при виході (~2262);
    - `watchHolds` → `watchTimers`: найближчий із `jigsawHoldsEnd` і `memoryTimersEnd`; виклики в `jigsawApply`, `memoryFlip` і відновленні (~828); doc-коментар оновити;
    - `answerStamp` (~609) — `memoryOf`.
  - `apps/server/src/socket.ts` — `on('player:memory')` за зразком `player:spotdiff`.
  - `apps/server/src/history.ts` — рядок `MemoryAnswer` («pairs/total»); вичерпні `switch` у `achievement-games.ts` і `game-achievements.ts`.
  - `apps/server/scripts/{compass,evening,family,family2,fun,grand,halloween,horizon,world}-quiz.test.ts`: у фільтр типів додати `&& t !== 'memory'` з коментарем `29f: новий тип, демо без «Пам'яті»`. Списки `mix2-quiz.test.ts` і `showcase-quiz.test.ts` не чіпати. Перевірити `grep -n "'spotdiff'" apps/server/scripts/*.test.ts`.
- Test: Create `apps/server/src/rooms/manager.memory.test.ts`; `apps/server/src/socket.test.ts`, `apps/server/src/history.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - `flips through the socket after a classic round` — `memoryQuiz()`, після першого раунду `player:memory` з `questionIndex: view.questionIndex` (0) → `{ ok: true }`, власний зріз приносить вміст клітинки; з `state.questionIndex` (1) → `memory_stale`.
  - `the server pushes the closing at one second` (керований `scheduler`) — непара в `t`; без жодної події в `t + 1000` телефон отримує зріз, де обидві клітинки `null`; так само в командах — кінець ходу в `t + 5000`.
  - `a restored room keeps the grid and the timers` — після `restart` менеджера `matched` ті самі, перепідключений телефон бачить їх у `me.memory`, а показана до рестарту непара закривається зрізом у свою мить.
  - `memory flips are rate limited` — 5 відкриттів за секунду від однієї людини: п'яте дає `too_soon`; у двох товаришів окремі вікна.
  - `the last pair goes out at once` — завершення приходить без очікування вікна `puzzleGapMs`.
  - `history shows pairs of total` — рядок «6 з 6» з балами й «4 з 6» з 0.
  - Seed-тести: `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/server/scripts` зелені.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/server/src/rooms/manager.memory.test.ts apps/server/src/socket.test.ts apps/server/src/history.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за зразком `RoomManager.spotdiffTap` і `jigsawApply`/`watchHolds`.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/server && tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server
git commit -m "feat(server): 29f memory — a flip event with the round-local number, a rate window, a timed push when a wrong pair or a team move ends, history rows; seed demos skip the new type"
```

---

### Задача 6. Веб: редактор, чернетки, тексти, довідка

**Files:**
- Create: `apps/web/src/editor/MemoryEditor.tsx`, `apps/web/src/editor/MemoryEditor.test.tsx`
- Modify:
  - `apps/web/src/editor/draft.ts`:
    - `questionTypesFor`: `classic` має `memory`, `puzzles` бере `PUZZLES_ROUND_TYPES`, решта раундів без `memory` (фільтр ~100);
    - `newQuestion('memory')` за «Рішеннями плану» (текст за замовчуванням замінює `sudokuDefaultText`/`crosswordDefaultText`/`jigsawDefaultText`, як у `jigsaw`);
    - `maxTimeOf`/`minTimeOf` (~1152) — `LIMITS.maxPuzzleTime` і `LIMITS.minMemoryTime`;
    - `problemKey`: `problemMemoryPairs`, `problemMemoryDuplicate`, `problemMemoryPlace`, `problemMemoryLimits`; `problemPuzzlesType` (~1172) не для `memory`.
  - `apps/web/src/editor/draft-storage.ts` — `reviveMemory`, за зразком `reviveSpotdiff`:
    - `grid` з `MEMORY_GRIDS` (інакше `'3x4'`), `seed` ціле в межах (інакше новий);
    - пари доводяться до кількості сітки (зайві відкидаються, бракує — порожні);
    - половина: текст — рядок, обрізаний до 40; `imageUrl` лише за `IMAGE_URL`;
    - без `hint`/`audio`/`reveal`, `imageUrl: null`.
  - `apps/web/src/editor/QuestionEditor.tsx` — `case 'memory'` без загального `ImageField`, відео, аудіо, підказки й «перевертання» (ті самі умови, що й для `spotdiff`, ~874–975).
  - `apps/web/src/format.ts` (`correctText` → `'—'`, `answerText` → `memoryAnswerDone`/`memoryUndone`), `apps/web/src/guide-text.ts` (`TYPE_ICONS.memory = '🃏'`), `apps/web/src/round-summary.ts` (`summaryMemories_one/_few/_many`).
  - `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts` (`ADDED_29F`, `ADDED_29F_PLURALS`), `apps/web/src/locales/*.json`, `apps/web/src/help/help-uk.ts` (`question.memory.*`: `title`, `what`, `how.0…2`, `points.0`, `tip.0`, `limits.0…1`), `help-vars.ts` (`minMemoryTime`, `defaultMemoryTime`), `__fixtures__/help-uk-golden.json`, `apps/web/src/locales/*.help.json`; у довідці «Головоломок» і `typeHow` раунду `puzzles` додати «Пам'ять» (як 29d `2795f6dd`). Ключі:
    - назви й тексти типу: `type_memory`, `typeShort_memory`, `typeHow_memory`, `buffWhy_off_memory`;
    - помилки: `err_memory_stale`, `err_memory_done`, `err_memory_cell`, `err_memory_wait`, `err_memory_busy`, `err_memory_matched`, `err_memory_open`;
    - проблеми чернетки: `problemMemoryPairs`, `problemMemoryDuplicate`, `problemMemoryPlace`, `problemMemoryLimits`;
    - редактор: `memoryDefaultText`, `memoryGridLabel`, `memoryGrid` («{cols}×{rows} · {pairs} пар»), `memoryPairLabel` («Пара {n}»), `memoryHalfText`, `memoryHalfImage`, `memoryTextPlaceholderA`, `memoryTextPlaceholderB`, `memoryShuffle`, `memoryShuffled`;
    - телефон, сцена й таблиця (задачі 7–8 беруть їх звідси): `memoryProgress` («Знайдено {found} з {total} пар»), `memoryCard` («Картка {n}»), `memoryCardClosed`, `memoryBusy` («{name} ходить»), `memoryDoneIn`, `memoryTimeUp`, `memoryClosed`, `memoryOffline`, `memoryPlayersDone`, `memoryTeamsDone`, `memoryRevealPairs`, `memoryTableMoves`, `memoryTableLabel`, `memoryAnswerDone`, `memoryUndone`, `summaryMemories_one`.
- Test: `apps/web/src/editor/draft.test.ts`, `apps/web/src/editor/draft-storage` (наявний тест), `apps/web/src/i18n.test.ts`, `apps/web/src/help/*.test.ts`, `apps/web/src/round-summary.test.ts`

**Interfaces (Produces):**
```ts
export type MemoryQuestion = Extract<Question, { type: 'memory' }>;   // draft.ts
export function MemoryEditor(props: { question: MemoryQuestion; onChange: (q: Question) => void }): JSX.Element;
```

- [ ] **Step 1: Write the failing tests:**
  - `draft.test.ts`:
    - `a memory lives in classic and puzzles only` — `classic` і `puzzles` містять тип, `blitz`/`final`/`board`/`bets` — ні;
    - `a new memory waits for its pairs` — нове запитання → `problemMemoryPairs`; після заповнення всіх 12 половин — без проблеми; `seed` — ціле `0…2³²−1`;
    - `a repeated card is a problem` → `problemMemoryDuplicate`;
    - `the timer floor is 25` — `minTimeOf({ type: 'memory' }) === 25`, `maxTimeOf` — 600.
  - `draft-storage`: `a stored memory is revived within limits` — 9 пар на `3x4` дають 6; `grid: '9x9'` → `'3x4'` із 6 парами; текст 60 символів обрізається до 40; `imageUrl: 'https://x'` зникає; `hint` зникає.
  - `MemoryEditor.test.tsx` (`useImageUpload` замокано):
    - `the grid buttons resize the pairs` — `4×5` → 10 рядків пар, назад `3×4` → 6 (перші 6 збережені);
    - `a half switches between text and picture` — «Картинка» на половині `b` пари 1 → після завантаження `{ text: '', imageUrl: '/uploads/…' }`; назад «Текст» → `{ text: '' }` без `imageUrl`;
    - `text is cut at forty` — поле має `maxLength 40`;
    - `shuffle gives a new seed` — «Перемішати» викликає `onChange` з іншим `seed`, пари ті самі.
  - `i18n.test.ts` — `ADDED_29F` є в усіх 7 мовах; `ADDED_29F_PLURALS` — у тих мовах, що мають ці форми; нова сторінка довідки є в усіх `*.help.json`.
  - `round-summary.test.ts` — «1 пазл · 2 «Пам'яті»» (точні форми — з uk-словника).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web/src/editor apps/web/src/i18n.test.ts apps/web/src/help apps/web/src/round-summary.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Розмітка редактора за зразком `SpotdiffEditor.tsx` (поле часу й балів — як там). Приклади в довідці нейтральні («Україна — Київ», «Японія — Токіо», прапор — країна).
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 29f memory editor — a grid of 3×4, 4×4 or 4×5, pairs with text or picture halves, a shuffle, texts and help in seven languages"
```

---

### Задача 7. Веб: телефон — сітка карток, відкриття, непара, хід товариша

**Files:**
- Create: `apps/web/src/live/useMemory.ts`, `apps/web/src/live/useMemory.test.ts`, `apps/web/src/screens/MemoryView.tsx`, `apps/web/src/screens/MemoryView.test.tsx`
- Modify: `apps/web/src/screens/PlayerScreen.tsx` — гілка `me.memory !== undefined` поряд зі `SpotdiffPlay` (~1169 і закрита ~1398, з ключем із Global Constraints), а на розкритті `MemoryReveal`; `apps/web/src/styles.css`.

**Interfaces:**
- Consumes: `PlayerMemory`, `PublicMemory`, `MemoryCellView`, `Send`, `MEMORY_SHOW_MS`.
- Produces:
```ts
export const MEMORY_ACK_MS = 5000;       // як SPOTDIFF_ACK_MS: без ack — «перевертання» скасовується
export function memoryTextSize(text: string): 'l' | 'm' | 's';   // ≤ 8 — l, ≤ 18 — m, інакше s
export function useMemory(info: PlayerMemory, questionIndex: number /* view.questionIndex */, send: Send): {
  cells: (MemoryCellView | 'pending' | null)[];  // 'pending' — тапнуто, вмісту ще немає
  canFlip: boolean;                              // info.canFlip і немає pending, і локальний показ непари скінчився
  flip(cell: number): void;
};
export function MemoryGrid(props: { cols: number; rows: number; cells: readonly (MemoryCellView | 'pending' | null)[]; onFlip?: (cell: number) => void; disabled?: boolean }): JSX.Element;
export function MemoryPlay(props: { info: PlayerMemory; question: PublicQuestion; questionIndex: number; paused: boolean; timeUp: boolean; send: Send; closed?: boolean }): JSX.Element;
export function MemoryReveal(props: { mine: PlayerMemory | undefined; question: PublicQuestion }): JSX.Element;
```

**Телефон:**
- Над сіткою рядок `memoryProgress`; у командах під час чужого ходу — `memoryBusy` з кольором `tone`.
- Сітка: квадратні картки, розмір за «Рішеннями плану»; закрита картка — сорочка з номером для `aria-label` `memoryCard`.
- Тап по закритій картці: `send('player:memory', { questionIndex, cell })` і стан `'pending'` (анімація «перевертання» без вмісту). `memory_wait`, `memory_busy`, `memory_open`, `memory_matched`, `too_soon`, офлайн і відсутній ack за `MEMORY_ACK_MS` скасовують `'pending'` мовчки.
- Непара (`state 'shown'`) — червона рамка; локальний таймер `closesInMs` закриває її, навіть якщо зріз запізнюється, і поки вона видна, тапи не надсилаються.
- Знайдена пара — зелена рамка (у командах колір `tone`), притлумлена, тапи по ній не надсилаються.
- Після «знайшов усе» — `memoryDoneIn` з часом, тапи вимкнено.

- [ ] **Step 1: Write the failing tests:**
  - `useMemory.test.ts`:
    - `a flip sends the round-local number` — `flip(5)` з `questionIndex 0` → `send('player:memory', { questionIndex: 0, cell: 5 })`, `cells[5] === 'pending'`;
    - `the view replaces pending with the card` — новий `info` з `cells[5] = { text: 'Київ', state: 'open', … }` → `cells[5]` — ця картка;
    - `a refused flip drops pending` — ack `memory_busy` → `cells[5] === null`;
    - `a wrong pair closes locally after closesInMs` (fake timers) — `info` з двома `shown` і `closesInMs 1000`: `canFlip` false; через 1000 мс обидві `null` і `canFlip` true, навіть без нового `info`;
    - `taps on matched or shown cards send nothing`.
  - `MemoryView.test.tsx`:
    - `closed cards show no content` — у DOM немає тексту закритих карток (`info.cells` з `null`);
    - `text size follows the length` — `memoryTextSize('Рим') === 'l'`, `memoryTextSize('Буенос-Айрес') === 'm'`, 25 символів → `'s'`;
    - `a picture half shows as an image` — `<img src="/uploads/…">` з `object-fit: contain` (клас);
    - `a teammate move disables the grid` — `busy` → видно «Оля ходить», картки `aria-disabled`;
    - `fits 320 px` — 4×5 на ширині 320: жодна картка не ширша за `(320 − 2·12 − 3·6) / 4`, сітка не ширша за 320 (розміри з CSS-змінних, як тест `fits 320 px` у `SpotdiffView.test.tsx`);
    - `another memory in the same slot starts afresh` — інший `memory.id` під тим самим номером скидає `'pending'` (ключ із Global Constraints);
    - `reveal shows every card` — `MemoryReveal` з 12 картками.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web/src/live/useMemory.test.ts apps/web/src/screens/MemoryView.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за зразком `useSpotdiff.ts` (ack, офлайн, номер із `view.questionIndex`) і гілки `SpotdiffPlay` у `PlayerScreen.tsx`.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 29f memory phone — a grid of card backs, a flip shows the card only from the own view, a wrong pair in red closes after a second, a teammate move locks the grid, 320 px"
```

---

### Задача 8. Веб: сцена, пульт, розкриття, живі відповіді, історія

**Files:**
- Modify:
  - `apps/web/src/screens/MemoryView.tsx`:
    - `MemoryBoards` — мініатюри `cols × rows` з `2 · pairs` світлими квадратиками в порядку читання, «нік · x з N», ✓ і час у тих, хто знайшов усе; сторінки за `puzzleGrid`/`puzzlePageSize`/`usePage` з `PuzzleView.tsx`;
    - `MemoryPairs` — усі пари «a ↔ b» (текст чи картинка);
    - `MemoryTable` / `MemoryResults` — таблиця «місце · нік · час · бали» (на пульті ще «ходи») з тим самим зменшенням шрифту, що в `JigsawResults` (`jigsawTablePageSize`);
    - `MemoryStage` — мініатюри до розкриття, пари й таблиця на розкритті.
  - `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/HostScreen.tsx` — гілки поряд зі `SpotdiffStage` (`HostScreen` «answeredOf», без «correctAnswer», панель, `liveHides` — ті самі місця, що в 29d).
  - `apps/web/src/screens/LiveAnswers.tsx` — прогрес `memory` (`pairs/total`, ✓).
  - `apps/web/src/pages/GameHistory.tsx` — рядок «знайдено x з N пар».
- Test: `apps/web/src/screens/MemoryView.test.tsx`, `StageScreen.test.tsx`, `HostScreen.test.tsx`, `LiveAnswers.test.tsx`, `apps/web/src/pages/GameHistory.test.tsx`

- [ ] **Step 1: Write the failing tests:**
  - `the stage shows counts and no cards before reveal` — 3 дошки, в Олі «2 з 6», у її мініатюрі рівно 4 світлі квадратики, і це перші 4 в DOM-порядку; на сцені немає жодного тексту карток.
  - `the host sees moves` — у рядку Олі «ходи: 5».
  - `reveal shows every pair and the table` — 6 пар «a ↔ b», картинка-половина — `<img>`; рядки таблиці за «знайшов усе / timeMs», далі за `pairs`; є бали.
  - `twelve rows fit the stage` — 12 рядків таблиці вміщаються в 1600×900 (як тест `JigsawResults`).
  - `live answers show pairs and done`; `history shows pairs of total`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web/src/screens apps/web/src/pages/GameHistory.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за зразком `SpotdiffBoards`/`SpotdiffTable`/`SpotdiffStage` і `JigsawResults`.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 29f memory stage and host — mini grids with the pair count only, every pair and a time table after time"
```

---

### Задача 9. Наскрізні сценарії й кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`. Додати нові `it('part 29f: …')` після `part 29d` і помічники:
  - `memory29f(id, grid, pairs, timeLimit, seed)`;
  - `flagPng29f()` — синтетичний PNG 200×140 із трьох кольорових смуг (через `png29d`, без реальних прапорів і фото);
  - `cellsOf29f(question, pair)` — клітинки пари за `memoryLayout` з `@quiz/shared`;
  - `flip29f(page, cell)` — тап по картці за `aria-label`.

**Сценарії** (таймери ≥ 25 с):
1. `it('part 29f: memory after a classic round — pairs with text and picture halves in the editor, a wrong pair closes after a second, the fastest gets the maximum, 320 px')`:
   - **Редактор.** Перший раунд класичний з одним `single` (30 с). Другий раунд класичний з `memory`:
     - сітка 3×4, 5 текстових пар («країна — столиця», нейтральні країни) і одна пара «картинка-прапор — країна» через завантаження;
     - повтор картки показує `problemMemoryDuplicate`, виправлення знімає;
     - «Перемішати» змінює `seed`;
     - раунд «Головоломки» має судоку й `memory` 4×4;
     - у бліц-раунді типу «Пам'ять» у меню немає;
     - кадр `memory29f-editor`.
   - **Гра на 3 телефонах (один 320 px).** Спершу класичне запитання, потім `memory`:
     - Петро відкриває непару: обидві картки видно, тап по третій під час показу нічого не відкриває, через ~1 с обидві закриті (сорочки);
     - до відкриття в DOM телефону Петра й у кадрах його сокета (`socketFrames`) немає тексту жодної ще не відкритої картки;
     - Оля знаходить усі 6 пар першою, Тарас — усі 6 пізніше, Петро не встигає.
   - **Перевірки балів і сцени:**
     - Оля 300, Тарас `round(300 × tОля / tТарас)` (з `timeMs` історії) і менше 300, Петро 0;
     - до розкриття на сцені немає тексту карток, а мініатюри показують лічильники; на розкритті є 6 пар і таблиця;
     - `memory` у раунді «Головоломки» після судоку має номер у раунді 1, і відкриття проходять.
   - **Кадри:** `memory29f-phone-320`, `memory29f-phone-wrong-pair`, `memory29f-stage` (1600×900), `memory29f-host`, `memory29f-reveal-stage`.
2. `it('part 29f: memory in teams — one shared grid, one move at a time, a teammate sees the open card, a restart keeps the pairs, 4×5 at 320 px')`:
   - 2 команди по 2 учасники, сітка 4×5, телефон Б — 320 px;
   - А відкриває картку → на телефоні Б картку видно й рядок «А ходить»; тап Б нічого не відкриває;
   - А відкриває непару → обидва телефони бачать її, через ~1 с обидві закриті; далі ходить Б і знаходить пару — на телефоні А вона кольору Б;
   - А відкриває одну картку й чекає 5 с → картка закривається, Б може ходити;
   - `restart()` посеред запитання → знайдені пари на місці, телефони продовжують;
   - `expectPhoneFit` для 4×5 на 320 px;
   - кадри: `memory29f-teams-phone`, `memory29f-teams-stage`.
3. `it('part 29f: memory with 24 players — the stage mini grids fit 1600×900')` — 24 сокет-гравці відкривають випадкові клітинки; `expectNoSideScroll`, кадр `memory29f-24-stage`.

- [ ] **Step 1: Write the scenarios** за зразком `part 29d` (`socketFrames`, `shot`, `restart`, `expectPhoneFit`, `expectNoSideScroll`, завантаження в редакторі як у `part 29d`).
- [ ] **Step 2: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 29f"`. Expected: PASS; кадри в `artifacts/shots`.
- [ ] **Step 3: Переглянути кадри.** Перевірити, що:
  - 3×4 і 4×5 на 320 px без горизонтального скролу, тексти карток не обрізані посеред слова, картинка-прапор ціла;
  - непару видно червоною рамкою;
  - на сцені до розкриття немає вмісту карток, мініатюри читаються при 24 гравцях;
  - на розкритті є всі пари й таблиця.
- [ ] **Step 4: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 29f memory — after a classic round, text and picture pairs in the editor, a wrong pair closing after a second at 320 px, speed scoring, a shared team grid with one move at a time, a restart, 24 mini grids"
```
