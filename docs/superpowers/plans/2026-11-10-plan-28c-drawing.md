# План 28c: тип запитання «Малюнок»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Виконується після мержу 28b («Правда про гравця»).** План спирається на назви з `main` після 28a: `Play.moreless`, `moreless.ts` (`moreLessPick`, `scoreMoreLess`), `player:moreless`, `MORELESS_PICKS_PER_SECOND`, `pickAllowed`, `moreLessRate`, `ADDED_28A`, `off_moreless`, `moreless_place`, `MoreLessView.tsx`, `part 28a`, `GAME_STATE_VERSION = 22`. Легка подія поза станом — зразок нахилу сортування 11d: `RoomEvent { type: 'tilt' }`, `manager.tilt`, `liveTilts`, `socket.emit('sort:tilt')`, `useGame` (`tilts`). Після 28b з'являться `ADDED_28B`, `part 28b`, `truth` — **перед кожною задачею виконавець звіряє назви й рядки з фактичним кодом**. Розбіжність — привід міняти лише назви й рядки, не рішення плану.

**Мета:** новий тип запитання `drawing`. Ведучий у редакторі вписує слово (і прийнятні написання). Кожне наступне запитання «Малюнок» у грі малює наступний гравець (у командах — наступна команда, її учасники по черзі). Слово бачать лише художник і пульт. Художник малює на телефоні (кольори, товщина, гумка, «крок назад», «очистити»), сцена, пульт і телефони вгадувачів показують малюнок наживо. Інші вписують слово з телефона, описки прощаються як у текстових запитаннях. Вгадав — ціна запитання (без швидкості); художник — `ціна × вгадали / могли`. Після відкриття — слово, малюнок і хто вгадав. Малюнок пише історія гри (стиснено).

**Архітектура:**
- **Дані (`shared`).**
  ```ts
  { ...base, type: 'drawing', accepted: spellings }   // accepted[0] — слово, яке бачить художник; решта — прийнятні написання
  ```
  - `timeLimit` за замовчуванням 60 с, `points` з `base` — ціна. Відео, підказки й «перевертання» (`reveal`) заборонені (`drawing_video`, як `moreless_video`).
  - Новий файл `packages/shared/src/drawing.ts`: палітра, товщини, тип штриха, межі, `packStrokes` / `unpackStrokes`, `applyDrawOp` (той самий застосувальник для рушія й клієнта).
- **Штрих.** `Stroke = { c: number; w: number; p: number[] }`:
  - `c` — індекс у `DRAWING_COLORS` (8 кольорів), `c === DRAWING_ERASER` (8) — гумка, малюється кольором тла;
  - `w` — індекс у `DRAWING_WIDTHS` (3 товщини);
  - `p` — пласкі цілі `[x0, y0, x1, y1, …]`, координати **нормалізовані й квантовані** до `0…DRAWING_SCALE` (1000) по ширині й висоті полотна. Полотно завжди `DRAWING_ASPECT = 4 / 3`.
- **Операції малювання** (`DrawOp`, подія `player:draw`):
  - `{ op: 'begin', c, w, p }` — новий штрих (індекс = `strokes.length`);
  - `{ op: 'more', index, p }` — продовження **останнього** штриха (`index` — його номер; інший → `drawing_stale`);
  - `{ op: 'undo' }` — прибрати останній штрих;
  - `{ op: 'clear' }` — прибрати все.
- **Стан (`engine`).** Два нові **необов'язкові** поля, тож `GAME_STATE_VERSION` лишається **22**:
  - `Play.drawing?: DrawingPlay = { drawerId: string | null; side: string | null; strokes: Stroke[]; rev: number; guessed: string[]; scored?: { guessed: number; could: number } }`:
    - `drawerId` — людина, що малює (соло — гравець, командна гра — учасник); `side` — її сторона в `state.players` (соло — той самий id, командна — id команди); `null` — малювати нікому;
    - `rev` — лічильник прийнятих операцій (від 0), для клієнтів;
    - `guessed` — сторони, що вгадали, у порядку вгадування;
    - `scored` — заморожується при закритті (`scoreDrawing`), як `moreless.scored`.
  - `GameState.drawTurns?: { last: string | null; members: Record<string, string> }` — **лічильник черги**: остання сторона, що малювала, і (командна гра) останній художник кожної команди.
  - Новий файл `packages/engine/src/drawing.ts`: `pickDrawer`, `openDrawing`, `drawingOf`, `drawStroke`, `drawGuess`, `drawingPoints`, `drawingCould`, `scoreDrawing`, `drawingDone`.
- **Розсилка.** Штрихи **не** йдуть повним станом:
  - менеджер застосовує операцію до `room.state` **без** `commit` і без `changed`, видає `RoomEvent { type: 'drawing'; op; rev; questionIndex }`;
  - `socket.ts` шле кожному сокету кімнати (сцена, пульт, усі телефони) легку подію `drawing` з цією операцією;
  - `RoomStore` планує запис кімнати й на `drawing` (не лише на `changed`), тож малюнок у знімку за `SAVE_DELAY_MS` і переживає перезапуск;
  - зрізи стану несуть лише **метадані** малюнка (`rev`, хто малює, скільки вгадали), без штрихів. Повний малюнок — подією `drawing { kind: 'sync' }`: при підключенні сокета (як `liveTilts`) і на запит `draw:sync`, коли клієнт бачить, що відстав (`view.drawing.rev > свій rev`).
- **Вгадування.** Подія `player:draw-guess { text }` (`player:guess` уже зайнята ланцюжком). Перевірка — наявна `textAccepts(question.accepted, text)` з `packages/engine/src/check.ts`. Ack — лише `{ ok: true }` (вгадано) чи `{ ok: false, error: 'drawing_miss' }`; слово й відстань не повертаються.
- **Сервер.** `RoomManager.draw`, `RoomManager.drawGuess`, `RoomManager.drawSync`; вікна частоти `drawRate` і `drawGuessRate`; `PlayRef.drawing` у записі гри; `GameQuestionResult.drawing` в історії.
- **Веб.** Нові файли:
  - `apps/web/src/screens/DrawingCanvas.tsx` — полотно (`<canvas>`, масштаб під контейнер і `devicePixelRatio`, дорисовування лише нових відрізків);
  - `apps/web/src/screens/DrawingView.tsx` — `DrawingPad` (інструменти художника), `DrawingGuess` (поле вгадувача), `DrawingBoard` (хто малює, «Вгадали N з M»), `DrawingReveal` (слово, хто вгадав, бали);
  - `apps/web/src/live/drawing.ts` — стан малюнка клієнта (`useDrawing`): знімок + операції, перевірка `rev`, запит `draw:sync`;
  - `apps/web/src/live/pen.ts` — пакетування точок художника (проріджування, `DRAW_FLUSH_MS`, розбиття довгого штриха).

**Технології:** TypeScript, zod 4, vitest, Fastify + Socket.IO, React 19 + Vite, Canvas 2D, Pointer Events, Playwright (+ CDP `Input.dispatchTouchEvent` для дотику).

**Специфікація:** `docs/superpowers/specs/2026-11-10-drawing-design.md`, уся.

## Глобальні обмеження

- 7 мов без ru, нові ключі в усі 7 локалей і списки в i18n.test.ts:
  - uk — у `apps/web/src/i18n.ts`;
  - список `ADDED_28C` у `apps/web/src/i18n.test.ts`, доданий до умови `adds no uk keys beyond the agreed list` поряд з `ADDED_28B`;
  - переклади — у `apps/web/src/locales/{en,pl,de,es,it,ar}.json`;
  - довідка — у `help-uk.ts`, `help-uk-golden.json` і `*.help.json`.
- Нічого про росію (і в прикладах). Слова в тестах, e2e й довідці — з побуту й природи: «соняшник», «парасолька», «вишиванка», «маяк», «равлик».
- `GAME_STATE_VERSION` не підвищувати — лише необов'язкові поля (якщо без підвищення ніяк — явно познач у шапці, контролер спитає власника).
  - **Рішення плану:** підвищення **не потрібне**. Тип `drawing`, `Play.drawing` і `GameState.drawTurns` необов'язкові, старі знімки їх не містять.
  - У `restore.ts` над `READABLE_STATE_VERSIONS` додається лише коментар: «28c без нової версії: тип 'drawing', необов'язкові Play.drawing і GameState.drawTurns».
- Юніт-тести `pnpm vitest run --maxWorkers=2`.
- Ніколи не запускати prettier.
- e2e: `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t <назва>`. Тут назва — `"part 28c"`, запуск на передньому плані, менше 10 хв.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`).
- Таймери у фікстурах, e2e й прикладах ≥ 25 с. Типовий — 60 с.
- Місця: **лише класичний раунд**. Не на полі (жодна клітинка, жоден режим відповіді), не в бліці, фіналі, «Ставках», «Аукціоні», «Ва-банку», «Вибуванні», «Мільйонері», «Правді про гравця», не в запасних (`SIMPLE_TYPES` уже відсікає — `spare_type`) і не в дуелях.

## Рішення плану (там, де специфікація мовчить)

- **Назва типу в коді:** `'drawing'`. У `QUESTION_TYPES` — одразу після `'moreless'`.
- **Ліміти** (`LIMITS`):
  - `defaultDrawingTime: 60`, `defaultDrawingPoints: 100`;
  - `maxStrokes: 300` — штрихів у малюнку;
  - `maxStrokePoints: 400` — точок в одному штриху (далі телефон сам починає новий штрих з останньої точки, лінія не рветься);
  - `maxDrawingPoints: 8000` — точок у всьому малюнку (≈ 60 КБ JSON у стані — межа знімка кімнати); після `clear`/`undo` місце звільняється;
  - `drawBatch: 64` — точок в одній події;
  - `drawGuess: 60` — символів у полі вгадування.
- **Палітра** (`drawing.ts`): `DRAWING_COLORS = ['#1f1f1f', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#6d4c41']`, `DRAWING_ERASER = 8`, `DRAWING_BACKGROUND = '#ffffff'`, `DRAWING_WIDTHS = [6, 14, 32]` (у тисячних ширини полотна), `DRAWING_SCALE = 1000`, `DRAWING_ASPECT = 4 / 3`. Гумка за замовчуванням — найтовща.
- **Частоти** (`events.ts`): `DRAW_OPS_PER_SECOND = 25` (телефон шле пакет кожні `DRAW_FLUSH_MS = 80` мс ≈ 12,5 / с, плюс «крок назад» і «очистити»); `DRAW_GUESSES_PER_SECOND = 2` (захист від перебору); `draw:sync` — не частіше 2 / с на сокет (вікно в замиканні `socket.ts`).
- **Хто малює** (`pickDrawer(state)`, викликає `openQuestion`):
  - **Соло:** порядок — `state.players` (порядок приходу). Кандидат — наступний після `drawTurns.last` (не знайдений чи `null` — перший). Іти по колу до першого `connected` (або в `state.awaiting` — чекаємо після перезапуску). Ніхто не на зв'язку — перший кандидат (малюнок порожній, вгадувачі все одно можуть закрити запитання таймером).
  - **Команди:** сторона — наступна команда після `drawTurns.last`, у якої є учасник на зв'язку; художник — наступний учасник цієї команди після `drawTurns.members[team]`, теж на зв'язку (порядок — `teams.members`, як скрізь).
  - `openQuestion` записує `Play.drawing` і оновлює `drawTurns` (`last = side`, `members[team] = drawerId`) **в одному кроці**, тож знімок після перезапуску не дасть другого вибору.
  - **Художник відключився посеред запитання** — лишається художником: малюнок у стані, після повернення він домальовує. Вилучений художник: `drawerId = null`, малювати нікому, вгадувати далі можна; його сторона (команда, якщо лишилася) отримує бали художника при закритті.
- **Операція малювання** — `drawStroke(state, memberId, op, now)`, по черзі:
  1. `wrong_phase`, `paused`, `not_started`, `not_found`;
  2. `type_mismatch`;
  3. `memberId !== play.drawing.drawerId` → `drawing_not_drawer`;
  4. `time_over` (`timeOverFor`);
  5. `more` не до останнього штриха → `drawing_stale`; `undo`/`clear` порожнього малюнка — `ok` без зміни стану (і без події);
  6. понад `maxStrokes` / `maxStrokePoints` / `maxDrawingPoints` → `drawing_full`;
  7. далі `applyDrawOp(strokes, op)`, `rev + 1`.
  - Координати поза `0…1000`, непарна довжина, нецілі, `c`/`w` поза межами — відсікає схема події (`invalid_payload`), рушій їх не бачить.
- **Вгадування** — `drawGuess(state, memberId, text, now)`, по черзі:
  1. `wrong_phase`, `paused`, `not_started`, `not_found`, `type_mismatch`, `time_over`;
  2. сторона гравця (`actorOf(state, memberId, 'answer')` → у командах команда, як у `timedlist`) — сторона художника → `drawing_own`;
  3. сторона вже вгадала → `already_answered`;
  4. `!textAccepts(question.accepted, text)` → `drawing_miss`, стан **той самий** (спроби нікуди не пишуться й нікому не показуються);
  5. вгадано: запис сторони `{ answer: { type: 'drawing', guess: text, drew: null }, grade: 'correct', accepted: true, points: drawingPoints(...) , streakBonus: 0 }`, `guessed.push(side)`, потім `autoLock` (усі, хто міг, вгадали → закриття).
- **Бали:**
  - вгадувач — `round(questionPrice × множник раунду)`, остаточні в мить вгадування (без швидкості, без серії, без бафів — `off_drawing`);
  - художник — при закритті: `round(questionPrice × множник × guessed / could)`, `could === 0` → 0;
  - `could` — сторони, крім художника, що на зв'язку в мить закриття **або** вже вгадали (відключений, що не вгадав, художника не карає). У командах — команди з хоча б одним учасником на зв'язку.
  - записи при закритті: художникові — `{ type: 'drawing', guess: null, drew: { guessed, could } }`, оцінка `correct` (усі, `could > 0`), `partial` (хоч один), `wrong` (ніхто); решті сторін без запису — `guess: null`, 0 балів, `wrong`. Мінус раунду (`unansweredIsWrong`, `wrongPenalty`) не діє, як у moreless.
  - `accuracy`: вгадувач 1/0; художник `guessed / could` (0 при `could = 0`).
  - Оцінку ведучий не змінює (`drawing` у переліках `gradable`/`UNGRADABLE`, як moreless); ручні бали (`adjust`) — як завжди.
- **Автозакриття:** `autoLock` дістає гілку перед загальною: `drawingDone(state)` — є хоч одна сторона, що могла, і всі вони вгадали → `lockNow`. Художник запису до закриття не має, тож загальна гілка запитання не закривала б.
- **Спойлери:**
  - `PublicQuestion` для `drawing` — лише `text`, `points`, `timeLimit`; `accepted` не йде (публічне запитання будується з нуля в `publicQuestion`);
  - слово (`accepted[0]`) бачать: `HostView.drawing.word` завжди; `PlayerView.me.drawing.word` — **лише** людині `drawerId` (у командній гілці `playerView` — перевизначення `me.drawing` за `member.id`, як `canPick` у moreless; командний зріз `ownView(state, teamId)` слова **не** має, тож товариші його не бачать);
  - на `reveal` — `StageView.reveal` (повне запитання) і `DrawingInfo.word` для всіх;
  - імена тих, хто вгадав, до `reveal` бачить лише пульт; сцена й телефони — лише «Вгадали N з M»; свій телефон — «Вгадано!».
  - Чернетки (`player:draft`) для `drawing` не шлються: поле вгадування — не `isAnswerDraft`, `draftQuestionType` типу не знає.
- **Клієнт художника** — оптимістичний: малює локально одразу, власні операції застосовує сам, події `drawing ops` від сервера для себе пропускає (`me.drawing.role === 'drawer'`), `sync` приймає завжди. Будь-яка відмова ack (`drawing_stale`, `drawing_full`, `too_soon`, `time_over`) → `draw:sync`, локальна модель замінюється серверною. Решта клієнтів — модель лише з сервера.
- **Пакетування на телефоні** (`pen.ts`): `pointerdown` → `begin` з першою точкою одразу (щоб сцена бачила початок); `pointermove` (з `getCoalescedEvents`, де є) → точка, якщо відійшла від попередньої щонайменше на `DRAW_MIN_STEP = 3` одиниці; буфер шлеться `more` кожні `DRAW_FLUSH_MS` або при 64 точках; `pointerup`/`pointercancel` → залишок. Штрих досяг `maxStrokePoints` → новий `begin` з останньої точки. Наступний пакет не йде, поки не прийшов ack попереднього (черга ≤ 1 у польоті, решта зливається) — так `more` не обжене `begin`.
- **Історія:** `PlayRef.drawing = { drawer: string; strokes: string }` — нік художника й `packStrokes(strokes)`. Формат: штрихи через `;`, штрих — `c` і `w` цифрами, `:`, далі перша точка абсолютно, решта — різницями, усе base36 зі знаком через `,`. `unpackStrokes(packStrokes(s))` дорівнює `s`; зіпсований рядок → `[]`.
- **Демо-вікторини** не змінюються.

## Порядок збирання

- Задача 1 додає тип у `Question` і `Answer`. Через вичерпні `switch` у `apps/web` повний typecheck у задачах 1–4 не проходить. Там перевірка: `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Від задачі 5 — повний `pnpm typecheck`.
- Залежності: 2 ← 1; 3 ← 2; 4 ← 2, 3; 5 ← 1, 3; 6 ← 4, 5; 7 — остання.

## Фокус рев'ю

1. **Слово не тікає.** До `reveal` `JSON.stringify` зрізу сцени, будь-якого вгадувача й **товариша художника** не містить жодного написання з `accepted`; ack `player:draw-guess` однаковий для будь-якої хибної спроби (`{"ok":false,"error":"drawing_miss"}`); подія `drawing` не несе слова. Тести: задача 3, `only the drawer and the host see the word`; задача 4, `a guess ack tells only yes or no`; задача 7 — через `socketFrames`.
2. **Черга художників:** по колу, пропуск відключених, команди по черзі й учасники всередині команди по черзі; один вибір на відкриття (перезапуск не перевибирає). Тести: задача 2, `drawers take turns and skip the offline`, `teams take turns and so do their members`, `a restored room keeps the drawer`.
3. **Бали:** вгадувач — ціна × множник без швидкості; художник — частка `guessed / could`, `could` без відключених невгадувачів; записи для всіх; оцінки correct/partial/wrong. Тест: задача 2, `the drawer gets a share for every guesser`.
4. **Потік і межі:** штрихи не через `changed`; знімок пишеться й на `drawing`; ліміти точок/штрихів/розміру; `drawing_stale` без зміни стану; частота. Тести: задача 4, `strokes go out as a light event, not a state push`, `a restored room keeps the drawing`, `draw ops are rate limited`.
5. **Відновлення клієнта:** перепідключення художника й сцени, перезапуск сервера — малюнок той самий (`sync` при підключенні, перевірка `rev`). Тести: задача 5, `useDrawing resyncs when the view is ahead`; задача 7.
6. **Місця:** лише класика. Тест: задача 1, `drawing plays in classic rounds only`.

---

### Задача 1. Спільне: схема, ліміти, штрих, пакування, події, помилки

**Files:**
- Create: `packages/shared/src/drawing.ts`, `packages/shared/src/drawing.test.ts`
- Modify:
  - `packages/shared/src/quiz.ts`: `LIMITS`, `QUESTION_TYPES`, гілка `questionSchema` (`accepted: spellings`), перевірка `drawing_video` у `superRefine` (відео, `reveal`, `audio`), `drawing_place` у `quizSchema` поруч з `moreless_place`;
  - `packages/shared/src/index.ts` — `export * from './drawing'`;
  - `packages/shared/src/answer.ts` — `DrawingAnswer` у `Answer` (`answerSchema` його **не** приймає);
  - `packages/shared/src/events.ts` — схеми й частоти, `ClientToServerEvents`, `ServerToClientEvents`;
  - `packages/shared/src/game.ts` — `ErrorCode`: `'drawing_not_drawer' | 'drawing_stale' | 'drawing_full' | 'drawing_miss' | 'drawing_own'`, `'off_drawing'`;
  - `packages/shared/src/facts.ts` — `drawing` як moreless (`wholeRowQuestion` → true, вікна відповіді немає);
  - `packages/shared/src/drafts.ts` — переконатися, що `drawing` не стає типом чернетки.
- Test: `packages/shared/src/quiz.test.ts`, `packages/shared/src/drawing.test.ts`, `packages/shared/src/facts.test.ts`

**Interfaces (Produces):**
```ts
// drawing.ts
export const DRAWING_SCALE = 1000;
export const DRAWING_ASPECT = 4 / 3;
export const DRAWING_COLORS = ['#1f1f1f', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#6d4c41'] as const;
export const DRAWING_ERASER = DRAWING_COLORS.length;          // 8
export const DRAWING_BACKGROUND = '#ffffff';
export const DRAWING_WIDTHS = [6, 14, 32] as const;          // тисячні ширини полотна
export interface Stroke { c: number; w: number; p: number[] }
export type DrawOp =
  | { op: 'begin'; c: number; w: number; p: number[] }
  | { op: 'more'; index: number; p: number[] }
  | { op: 'undo' }
  | { op: 'clear' };
/** Застосовує операцію (без перевірок прав і меж): той самий код у рушії й у клієнта. Нові масиви, вхід не змінюється. */
export function applyDrawOp(strokes: readonly Stroke[], op: DrawOp): Stroke[];
export function strokePoints(strokes: readonly Stroke[]): number;   // Σ p.length / 2
export function packStrokes(strokes: readonly Stroke[]): string;
export function unpackStrokes(packed: string): Stroke[];             // зіпсоване → []
/** Подія drawing: операція чи повний знімок поточного запитання. */
export type DrawingEvent =
  | { kind: 'ops'; questionIndex: number; rev: number; op: DrawOp }
  | { kind: 'sync'; questionIndex: number; rev: number; strokes: Stroke[] };
// quiz.ts
LIMITS: defaultDrawingTime: 60, defaultDrawingPoints: 100, maxStrokes: 300, maxStrokePoints: 400,
        maxDrawingPoints: 8000, drawBatch: 64, drawGuess: 60
{ ...base, type: z.literal('drawing'), /** accepted[0] — слово художника; решта — прийнятні написання. */ accepted: spellings }
// answer.ts
export interface DrawingAnswer { type: 'drawing'; guess: string | null; drew: { guessed: number; could: number } | null }  // лише рушій
// events.ts
export const DRAW_OPS_PER_SECOND = 25;
export const DRAW_GUESSES_PER_SECOND = 2;
export const DRAW_SYNC_PER_SECOND = 2;
const coords = z.array(z.number().int().min(0).max(DRAWING_SCALE)).min(2).max(LIMITS.drawBatch * 2).refine((p) => p.length % 2 === 0);
export const drawOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('begin'), c: z.number().int().min(0).max(DRAWING_ERASER), w: z.number().int().min(0).max(DRAWING_WIDTHS.length - 1), p: coords }).strict(),
  z.object({ op: z.literal('more'), index: z.number().int().min(0).max(LIMITS.maxStrokes - 1), p: coords }).strict(),
  z.object({ op: z.literal('undo') }).strict(),
  z.object({ op: z.literal('clear') }).strict(),
]);
export const drawGuessSchema = z.object({ text: z.string().max(LIMITS.drawGuess).refine(isStorable, UNSTORABLE) });
// ClientToServerEvents
'player:draw': (payload: DrawOp, ack: Ack) => void;
'player:draw-guess': (payload: z.infer<typeof drawGuessSchema>, ack: Ack) => void;
/** Будь-яка роль: прошу повний малюнок поточного запитання (подією drawing { kind: 'sync' }). */
'draw:sync': (ack: Ack) => void;
// ServerToClientEvents
'drawing': (event: DrawingEvent) => void;
```

- [ ] **Step 1: Write the failing tests.**
  - `drawing.test.ts`:
    - `applies begin, more, undo and clear` — `begin` → 1 штрих; `more` дописує точки в кінець; `undo` прибирає останній; `clear` → `[]`; вхідний масив не змінено (`Object.freeze`);
    - `counts points` — `strokePoints` двох штрихів по 3 і 5 точок → 8;
    - `packs and unpacks strokes losslessly` — штрихи з `c = 8` (гумка), `w = 2`, координатами 0 і 1000 і спадними різницями → `unpackStrokes(packStrokes(s))` дорівнює `s`; 300 штрихів по 26 точок → довжина рядка менша за `JSON.stringify` (стиснено);
    - `a broken packed string gives no strokes` — `'zz:'`, `'1:1,2,3'`, `''` → `[]`.
  - `quiz.test.ts`, помічник `drawingQ(patch)` — «Намалюйте рослину», `accepted: ['соняшник', 'соняшник однорічний']`, 100 балів, 60 с:
    - `accepts a drawing question` і `refuses a drawing without a word` (`accepted: []`);
    - `refuses video, reveal and audio on a drawing` → `drawing_video`;
    - `drawing plays in classic rounds only` — бліц, фінал, «Ставки», «Аукціон», «Ва-банк», «Вибування», «Мільйонер», клітинка поля (будь-який `kind` і режим відповіді) → `drawing_place`; класика — ок; запасне запитання цього типу → `spare_type`; дуель не приймає (схема дуелі);
    - `old quizzes still parse`;
    - `the draw events are limited` — `drawOpSchema`: 129 точок, непарна довжина, `x = 1001`, `x = 0.5`, `c = 9`, `w = 3`, `index: 300`, зайве поле → false; `drawGuessSchema` 61 символ → false; `answerSchema` не приймає `{ type: 'drawing', … }`.
  - `facts.test.ts`: `a drawing question has no answer window`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared`. Очікується FAIL.
- [ ] **Step 3: Implement** за блоком Interfaces. Пакування: `c` і `w` — по одній цифрі (`c ≤ 8`, `w ≤ 2`), координати base36 зі знаком.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/shared && tsc -p packages/shared`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): 28c drawing question — the word and spellings, strokes in a 0..1000 grid with a palette and widths, draw ops, packing for history, events, classic rounds only"
```

---

### Задача 2. Рушій: черга художників, штрихи, вгадування, бали, автозакриття, команди

**Files:**
- Create: `packages/engine/src/drawing.ts`, `packages/engine/src/game.drawing.test.ts`
- Modify:
  - `packages/engine/src/game.ts`: `DrawingPlay`, `Play.drawing`, `DrawTurns`, `GameState.drawTurns`; `openQuestion` (гілка `drawing`: `openDrawing`); `lockNow` (`scoreDrawing` у ланцюжку поруч з `scoreMoreLess`); `autoLock` (гілка `drawingDone` до загальної); `removePlayer` (вилучений художник → `drawerId: null`; вилучена сторона зникає з `guessed`); `submitAnswer` (`drawing` → `type_mismatch`); переліки типів «без звичайної відповіді» (рядок ~2383, `wrong_phase` для `name`);
  - `packages/engine/src/buffs.ts` — `questionOff`: `'off_drawing'`;
  - `packages/engine/src/team-act.ts` — `actorOf(…, 'answer')`: на `drawing` — команда (будь-який учасник), як `timedlist`;
  - `packages/engine/src/restore.ts` — лише коментар над `READABLE_STATE_VERSIONS`;
  - `packages/engine/src/index.ts` — `export * from './drawing'`;
  - `packages/engine/src/testing/fixtures.ts` — `drawing` (`accepted: ['соняшник']`, 100, 60 с);
  - `packages/engine/src/testing/autopilot.ts` — гілка `drawing`: художник шле `begin` з трьома точками, вгадувачі — `accepted[0]`.
- Test: `packages/engine/src/game.drawing.test.ts`, `packages/engine/src/restore.test.ts`, `packages/engine/src/autopilot.full.test.ts`, `packages/engine/src/game.buffs.test.ts`, `packages/engine/src/game.teams-act.test.ts`

**Interfaces (Produces):**
```ts
// game.ts
export interface DrawingPlay {
  /** Людина, що малює; null — малювати нікому (вилучено). */
  drawerId: string | null;
  /** Сторона художника в state.players (соло — той самий id, командна — команда); null — немає. */
  side: string | null;
  strokes: Stroke[];
  /** Прийнятих операцій від відкриття. */
  rev: number;
  /** Сторони, що вгадали, у порядку вгадування. */
  guessed: string[];
  /** З закриття (scoreDrawing): скільки вгадали й скільки могли. */
  scored?: { guessed: number; could: number };
}
export interface DrawTurns { last: string | null; members: Record<string, string> }
// Play.drawing?: DrawingPlay;  GameState.drawTurns?: DrawTurns;
// drawing.ts
export function pickDrawer(state: GameState): { drawerId: string; side: string } | null;
/** Для openQuestion: Play.drawing і новий drawTurns. */
export function openDrawing(state: GameState): { drawing: DrawingPlay; drawTurns: DrawTurns };
export function drawingOf(state: GameState): DrawingPlay | null;          // поточне запитання-малюнок на question/locked/reveal
export function drawStroke(state: GameState, memberId: string, op: DrawOp, now: number): Result;
export function drawGuess(state: GameState, memberId: string, text: string, now: number): Result;
export function drawingPoints(state: GameState, play: Play): number;      // round(questionPrice × множник раунду)
export function drawingCould(state: GameState, play: Play): string[];     // сторони, що могли вгадати
export function drawingDone(state: GameState): boolean;
export function scoreDrawing(state: GameState): GameState;
```

- [ ] **Step 1: Write the failing tests** (`game.drawing.test.ts`; гравці Оля, Тарас, Петро, Ганна; `drawing` з фікстур; класика з множником 1 і окремо 2):
  - `drawers take turns and skip the offline` — три запитання-малюнки поспіль: Оля, Тарас, Петро; Петро відключений перед третім → Ганна; четверте → Оля (по колу після Ганни); між ними звичайне запитання черги не зсуває;
  - `nobody online still opens the drawing` — усі відключені → `drawerId` — перший кандидат, запитання відкрите;
  - `teams take turns and so do their members` — команди «Соняшники» (Оля, Тарас) і «Маки» (Петро, Ганна): малюють Оля, Петро, Тарас, Ганна; відключений Тарас → його черга йде Олі;
  - `only the drawer draws` — `begin` від Тараса → `drawing_not_drawer`; від Олі → `rev: 1`; `more` з `index: 0` → точки дописано; `more` з `index: 1` → `drawing_stale`, стан той самий (`toBe`); `undo`, `clear` → `rev` росте; `undo` порожнього → `ok`, стан той самий;
  - `the drawing has limits` — 301-й штрих, 401-ша точка штриха, 8001-ша точка малюнка → `drawing_full`; після `clear` знову можна;
  - `no drawing in a pause, before the start or after the time` — `paused`, `not_started` (заставка), `time_over`;
  - `a guess forgives typos and tells nothing else` — «соняшнк» → запис Тараса `correct`, 100 балів, `streakBonus: 0`, `guess: 'соняшнк'`; «ромашка» → `drawing_miss`, стан `toBe` той самий; повтор після вгадування → `already_answered`; Оля → `drawing_own`;
  - `the drawer's team does not guess` — товариш Олі → `drawing_own`; учасник «Маків» вгадує за команду; другий учасник «Маків» → `already_answered`;
  - `the drawer gets a share for every guesser` — Тарас і Петро вгадали, Ганна ні, усі на зв'язку → після `lock` Оля `round(100 × 2 / 3) = 67`, `partial`, `drew: { guessed: 2, could: 3 }`; Ганна — запис 0, `wrong`, `guess: null`; з множником раунду 2 — 200 / 200 / 133;
  - `an offline non-guesser does not cost the drawer` — Ганна відключилася до закриття → `could: 2`, Оля 100, `correct`;
  - `nobody could guess gives the drawer nothing` — сам художник у грі → 0, `wrong`;
  - `everyone guessed closes the question` — третій вгадав → `phase: 'locked'`; відключений, що не вгадав, закриття не тримає;
  - `the counts freeze at the close` — вилучення Петра після `lock` не змінює `scored` і балів Олі;
  - `a removed drawer leaves the drawing to nobody` — вилучення Олі посеред запитання → `drawerId: null`, `begin` від будь-кого → `drawing_not_drawer`, вгадування працює;
  - `no buffs on a drawing` — баф → `off_drawing`.
  - `restore.test.ts`, `a restored room keeps the drawer and the strokes` — знімок без `drawTurns` (старий) читається; знімок з `Play.drawing` дає ті самі штрихи, `rev` і художника; `GAME_STATE_VERSION === 22`.
  - `autopilot.full.test.ts` — малюнок у класиці грається ботами до кінця.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» й зразком `moreless.ts` (`withPlay`, `betsRefusal` не потрібен — класика без ставок, `limitMsOf`, `timeOverFor`, `notStarted`). `openQuestion` повертає стан з `drawTurns` — переконатися, що жоден інший шлях відкриття (`pickCell`, запасні) тип не відкриває: схема не пускає.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/engine && tsc -p packages/shared && tsc -p packages/engine`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): 28c drawing — drawers take turns and skip the offline, teams and their members in turn, strokes with limits, typo-forgiving guesses, the drawer's share, auto close"
```

---

### Задача 3. Рушій: зрізи без спойлерів і живий рядок

**Files:**
- Modify:
  - `packages/shared/src/views.ts`: `DrawingInfo`, `HostDrawing`, `PlayerDrawing`, `BaseView.drawing?`, `HostView.drawing?`, `PlayerView.me.drawing?`, `LiveProgress` `{ kind: 'drawing'; … }`, `GameQuestionResult.drawing?`;
  - `packages/engine/src/views.ts`: `drawingInfo(state, forHost)`, `playerDrawing(state, personId)`, `optional('drawing', …)` у `base`, у `ownView` і перевизначення `me.drawing` у командній гілці `playerView` (поруч з `moreless.canPick`); `drawing` у трьох переліках `gradable`; `answeredCount` для `drawing` — кількість `guessed`; `playerCount` — `drawingCould`;
  - `packages/engine/src/live.ts`: `PROGRESS_TYPES`, `UNGRADABLE`, прогрес `drawing`.
- Test: `packages/engine/src/views.drawing.test.ts` (новий), `packages/engine/src/live.test.ts`

**Interfaces (Produces):**
```ts
// views.ts (shared)
/** Малюнок для всіх: без штрихів (вони йдуть подією drawing) і без слова до reveal. */
export interface DrawingInfo {
  drawerId: string | null;          // людина
  drawerName: string | null;
  side: string | null;
  rev: number;
  guessed: number;                  // скільки сторін вгадало
  could: number;                    // скільки могли (до закриття — за поточним станом, потім scored)
  /** Лише reveal: слово й хто вгадав (сторони в порядку вгадування, з балами); художник — з балами. */
  word: string | null;
  guessers: { id: string; nickname: string; points: number }[] | null;
  drawerPoints: number | null;
}
export interface HostDrawing extends DrawingInfo { word: string; guessers: { id: string; nickname: string; points: number }[] }   // пульт: слово й імена завжди (бали — з записів)
export interface PlayerDrawing {
  role: 'drawer' | 'teammate' | 'guesser';
  /** Лише художникові. */
  word: string | null;
  guessed: boolean;
  canDraw: boolean;                 // художник, question, не пауза
  canGuess: boolean;                // guesser, question, не пауза, ще не вгадав
  points: number | null;            // reveal
}
// LiveProgress: | { kind: 'drawing'; role: 'drawer' | 'guesser'; guessed: boolean }
// GameQuestionResult.drawing?: { drawer: string; strokes: string }   // packStrokes
```

- [ ] **Step 1: Write the failing tests** (`views.drawing.test.ts`; соло й команди з задачі 2):
  - `only the drawer and the host see the word` — на `question` і `locked` `JSON.stringify` `stageView`, `playerView` Тараса, Петра й (команди) товариша художника **не містить** «соняшник» і жодного написання; `playerView` Олі — `me.drawing.word === 'соняшник'`, `role: 'drawer'`; `hostView.drawing.word` — є;
  - `the public question has no spellings` — `view.question` не має ключа `accepted`;
  - `names of guessers wait for the reveal` — до `reveal` `DrawingInfo.guessers === null`, `guessed: 1`, `could: 3`; на пульті — `[Тарас]`; на `reveal` у всіх — слово, `guessers` з балами, `drawerPoints: 67`;
  - `the views carry no strokes` — `JSON.stringify` будь-якого зрізу після 3 штрихів не містить масиву точок; `rev: 3`;
  - `phone roles` — Тарас `guesser`, `canGuess: true`; після вгадування `guessed: true`, `canGuess: false`; товариш Олі — `teammate`, `canGuess: false`; пауза гасить `canDraw` і `canGuess`;
  - `other questions are unchanged` — зрізи запитання іншого типу не мають ключа `drawing` (байт у байт, як у 27c/28a).
  - `live.test.ts`: `live rows of a drawing show who guessed and who draws` — без текстів спроб.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/views.drawing.test.ts packages/engine/src/live.test.ts`. Очікується FAIL.
- [ ] **Step 3: Implement** за зразком `moreLessInfo` / `playerMoreLess`. Слово — `question.accepted[0]`.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/engine && tsc -p packages/shared && tsc -p packages/engine`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/shared packages/engine
git commit -m "feat(engine): 28c drawing views — the word only for the drawer and the host, names of guessers on reveal, no strokes in views, live rows"
```

---

### Задача 4. Сервер: легка подія штрихів, вгадування, синхронізація, частота, знімок, історія

**Files:**
- Modify:
  - `apps/server/src/rooms/manager.ts`:
    - `Room.drawRate`, `Room.drawGuessRate` (обидві «Лише в пам'яті», як `moreLessRate`), створення в обох місцях (~646, ~720), чистка при вилученні (`kick`, поруч з `moreLessRate.delete`);
    - `RoomEvent`: `| { type: 'drawing'; event: DrawingEvent }`;
    - `draw(room, personId, op)`, `drawGuess(room, personId, text)`, `drawSnapshot(room)`;
    - `private sketch(room, state, op)` — `room.state = state` без `commit` (без `awayStep`, `stamp`, `planAutopilot`, `reschedule`: таймер і крок не змінюються), `emit({ type: 'drawing', … })`;
  - `apps/server/src/rooms/store.ts` — `schedule(room)` і на `event.type === 'drawing'`;
  - `apps/server/src/socket.ts`:
    - `on('player:draw')`, `on('player:draw-guess')` (лише гравець), `on('draw:sync')` (будь-яка роль, вікно `DRAW_SYNC_PER_SECOND` у замиканні);
    - гілка `event.type === 'drawing'` у `manager.onEvent` — `members.forEach((s) => s.emit('drawing', event.event))`, до перевірки `never`;
    - при підключенні (поруч з `liveTilts`) і після `host:live`/перепідключення: `const snap = manager.drawSnapshot(room); if (snap !== null) socket.emit('drawing', snap)`;
  - `apps/server/src/db/schema.ts` — `PlayRef.drawing?: { drawer: string; strokes: string }`;
  - `apps/server/src/recorder.ts` — `writeGame`: `...(play.drawing === undefined ? {} : { drawing: { drawer: <нік художника або ''>, strokes: packStrokes(play.drawing.strokes) } })`;
  - `apps/server/src/history.ts` — `...(ref?.drawing === undefined || question.type !== 'drawing' ? {} : { drawing: ref.drawing })` поруч з `letterwords`;
  - `apps/server/scripts/logic/check.ts` — `case 'drawing'`: написання слова в тексті запитання — проблема (витік).
- Test: `apps/server/src/rooms/manager.test.ts`, `apps/server/src/socket.test.ts`, `apps/server/src/restart.test.ts`, `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts`, `apps/server/scripts/*-quiz.test.ts` (кількість типів)

**Interfaces (Produces):**
```ts
// manager.ts
/** Операція художника (28c): лише людина drawerId; стан міняється без changed — подія drawing; понад DRAW_OPS_PER_SECOND — too_soon. */
draw(room: Room, personId: string, op: DrawOp): AckResult;      // this.act(room, personId, 'self'); drawStroke(...)
/** Вгадування (28c): ack лише ok чи drawing_miss / відмова; вгадано — commit (changed). Понад DRAW_GUESSES_PER_SECOND — too_soon. */
drawGuess(room: Room, personId: string, text: string): AckResult;
/** Повний малюнок поточного запитання для sync; null — запитання не «Малюнок». */
drawSnapshot(room: Room): DrawingEvent | null;
```

- [ ] **Step 1: Write the failing tests:**
  - `manager.test.ts`:
    - `strokes go out as a light event, not a state push` — `onEvent` збирає події: `begin` + 3 × `more` → 4 події `drawing` з `rev` 1…4 і **жодної** `changed`; `room.state.plays[i].drawing.strokes` має 1 штрих з усіма точками;
    - `a stale or full op changes nothing` — `drawing_stale` / `drawing_full` → стан `toBe` той самий, подій немає;
    - `draw ops are rate limited` — 26-та операція за секунду (FakeScheduler) → `too_soon`; вікно вгадувань окреме;
    - `a guess ack tells only yes or no` — `JSON.stringify` ack «ромашка» і «парасолька» однаковий: `{"ok":false,"error":"drawing_miss"}`; «соняшнк» → `{"ok":true}` і подія `changed`; 3-тя спроба за секунду → `too_soon`;
    - `the snapshot gives the whole drawing` — `drawSnapshot` після `undo` → `kind: 'sync'`, той самий `rev` і штрихи; на запитанні іншого типу → `null`;
    - `a kicked drawer stops drawing` — вилучення Олі → її вікна прибрано, `begin` від іншого → `drawing_not_drawer`.
  - `socket.test.ts`:
    - `player:draw and player:draw-guess are player-only and validated` — ведучий і сцена → `forbidden`; `{ op: 'begin', c: 9, … }`, 129 точок → `invalid_payload`;
    - `every socket of the room gets the drawing event, the word never` — сцена, пульт і другий телефон отримують `drawing { kind: 'ops' }`; у кадрах сцени й вгадувача немає «соняшник»;
    - `a new socket gets the drawing on connect` — сцена підключається після 3 штрихів → перша подія `drawing { kind: 'sync' }` з 3 штрихами; `draw:sync` дає те саме; 3-й `draw:sync` за секунду — без відповіді-події (`too_soon`).
  - `restart.test.ts`, `a restored room keeps the drawing` — `drawing`-подія → запис кімнати за `SAVE_DELAY_MS` (без жодного `changed`); піднята кімната має ті самі штрихи, `rev` і художника; наступний `more` з тим самим `index` → ok.
  - `recorder.test.ts` — запис гри: `plays[i].drawing.strokes` — рядок, `unpackStrokes` дає штрихи стану; `payload` художника `{ type: 'drawing', guess: null, drew: { guessed: 2, could: 3 } }`, `points: 67`.
  - `history.test.ts` — деталі гри мають `drawing.drawer === 'Оля'` і рядок штрихів; бали дорівнюють балам рушія.
  - `check.ts` — слово в тексті запитання дає проблему.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/rooms/manager.test.ts apps/server/src/socket.test.ts apps/server/src/restart.test.ts apps/server/src/recorder.test.ts apps/server/src/history.test.ts`. Очікується FAIL.
- [ ] **Step 3: Implement** за зразками `tilt` / `liveTilts` (легка подія), `moreLess` / `pickAllowed` (частота), `letterwords` у `recorder.ts` і `history.ts`. `draw` при `ok` без зміни стану (порожній `undo`) події не шле.
- [ ] **Step 4: Run** тести з кроку 2, потім `pnpm vitest run --maxWorkers=2 apps/server/src apps/server/scripts` і `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Очікується PASS. Тести, що чекають на кількість типів, оновлюються з коментарем «28c: новий тип».
- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat(server): 28c drawing — strokes as a light event saved with the room, sync on connect and on request, guesses with a yes-or-no ack, rate windows, history with packed strokes"
```

---

### Задача 5. Веб: тексти, формат, довідка, редактор, полотно й стан малюнка

**Files:**
- Create: `apps/web/src/screens/DrawingCanvas.tsx`, `apps/web/src/screens/DrawingCanvas.test.tsx`, `apps/web/src/live/drawing.ts`, `apps/web/src/live/drawing.test.ts`, `apps/web/src/live/pen.ts`, `apps/web/src/live/pen.test.ts`
- Modify:
  - `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts` (`ADDED_28C`), `apps/web/src/locales/{en,pl,de,es,it,ar}.json`;
  - `apps/web/src/format.ts` (`case 'drawing'` у обох `switch`: «вгадав: соняшнк» / «намалював: вгадали 2 з 3»), `apps/web/src/guide-text.ts` (`drawing: '🎨'`), `apps/web/src/admin/admin-text.ts`, `apps/web/src/screens/LiveAnswers.tsx` (прогрес `drawing`);
  - `apps/web/src/help/help-uk.ts`, `help-uk-golden.json`, `*.help.json`, `apps/web/src/help/help-vars.ts` (`maxStrokes`, якщо довідка його називає);
  - `apps/web/src/editor/draft.ts` (новий тип: `timeLimit: LIMITS.defaultDrawingTime`, `points: LIMITS.defaultDrawingPoints`, `accepted: ['']`; `Place.drawing` — лише класика; `problemDrawingWord`, `problemDrawingPlace`; переліки без відео), `apps/web/src/editor/draft-storage.ts` (`reviveDrawing`), `apps/web/src/editor/QuestionEditor.tsx` (`case 'drawing'` — наявний `Rows` написань, як `case 'text'`, з підписом «Перше написання бачить художник»; без відео й підказки), `apps/web/src/editor/BoardEditor.tsx` (тип не пропонується на полі);
  - `apps/web/src/live/useGame.ts` — `socket.on('drawing', …)` → `useDrawing`; `requestSync()` через `draw:sync`; скидання на `disconnect`;
  - `apps/web/src/live/types.ts` — `Send` знає три нові події.
- Test: `apps/web/src/format.test.ts`, `apps/web/src/editor/draft.test.ts`, `apps/web/src/editor/QuestionEditor.test.tsx`, `apps/web/src/help/help-golden.test.ts`, `apps/web/src/live/useGame.test.tsx`, нові тести вище

**Interfaces (Produces):**
```ts
// live/drawing.ts
export interface DrawingModel { questionIndex: number; rev: number; strokes: Stroke[]; stale: boolean }
/** Застосовує подію: sync — завжди замінює; ops — лише свого запитання й rev === model.rev + 1 (менший — пропуск, більший — stale). */
export function reduceDrawing(model: DrawingModel | null, event: DrawingEvent): DrawingModel;
/** Зріз випередив модель (view.drawing.rev > model.rev) чи нове запитання — треба sync. */
export function needsSync(model: DrawingModel | null, view: GameView): boolean;
// useGame повертає ще: drawing: DrawingModel | null; requestSync: () => void
// live/pen.ts — без DOM, тестується чисто
export const DRAW_FLUSH_MS = 80;
export const DRAW_MIN_STEP = 3;
export interface Pen { down(x: number, y: number, c: number, w: number): void; move(x: number, y: number): void; up(): void; flush(): DrawOp[] }
export function createPen(next: () => number /* індекс наступного штриха */): Pen;   // квантування 0..1000, проріджування, розбиття на maxStrokePoints / drawBatch
// DrawingCanvas.tsx
export function DrawingCanvas(props: { strokes: Stroke[]; live?: Stroke | null; className?: string; label: string }): JSX.Element;
// <canvas data-strokes={n} data-points={m} role="img" aria-label=…>, розмір — ResizeObserver × devicePixelRatio, 4:3
```
- uk-ключі (усі в `ADDED_28C`; задача 6 дописує свої): `type_drawing` «Малюнок», `drawingHelp`, `drawingWordHint` «Перше написання бачить художник; решта — теж зараховуються», `problemDrawingWord`, `problemDrawingPlace` «Малюнок — лише в звичайному раунді», `drawingAnswer`, `drawingDrewAnswer`, `drawingLive`, `drawingCanvasLabel`.

- [ ] **Step 1: Write the failing tests:**
  - `pen.test.ts`:
    - `quantizes and thins points` — точки 0.5004/0.5 → 500; рух на 1 одиницю не додає точки, на 3 — додає;
    - `the first flush begins a stroke, the rest continue it` — `down`, 10 × `move`, `flush` → `begin` з усіма точками; ще `move`, `flush` → `more` з `index` штриха;
    - `a long stroke splits without a gap` — 450 точок → два штрихи, другий починається з останньої точки першого; жоден пакет не більший за `drawBatch`;
    - `an eraser stroke uses the eraser color`.
  - `drawing.test.ts`:
    - `sync replaces and ops follow rev` — `sync rev 3` → 3 штрихи; `ops rev 4` → застосовано; повтор `rev 4` → без змін; `rev 6` → `stale: true`; `ops` іншого `questionIndex` → пропуск;
    - `needsSync` — `view.drawing.rev 5` при моделі `rev 3` → true; нове `questionIndex` → true.
  - `DrawingCanvas.test.tsx` — `data-strokes` / `data-points` відповідають пропсам; `undo` (менше штрихів) перемальовує все (шпигун `clearRect`), додавання точок — ні.
  - `useGame.test.tsx` — `socket.fire('drawing', …)` дає `drawing`; `state` з більшим `rev` викликає `draw:sync`; `disconnect` скидає модель.
  - `format.test.ts`, `draft.test.ts` (`a new drawing is classic only`, `an empty word is a problem`), `QuestionEditor.test.tsx` (`edits the word and spellings of a drawing`), довідка — золотий файл.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/live apps/web/src/screens/DrawingCanvas.test.tsx apps/web/src/format.test.ts apps/web/src/editor apps/web/src/help apps/web/src/i18n.test.ts`. Очікується FAIL.
- [ ] **Step 3: Implement.** Полотно: `lineCap`/`lineJoin = 'round'`, ширина `DRAWING_WIDTHS[w] / 1000 × ширина`, гумка — `DRAWING_BACKGROUND`; штрих з однієї точки — крапка. Дорисовування: пам'ятати `(штрихів, точок останнього)` з минулого рендера.
- [ ] **Step 4: Run** тести з кроку 2, потім `pnpm typecheck`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): 28c drawing — texts in 7 languages, help, the editor with the word and spellings, a scalable canvas, the drawing model with rev and sync, a batching pen"
```

---

### Задача 6. Веб: телефон художника й вгадувача, сцена, пульт, історія

**Files:**
- Create: `apps/web/src/screens/DrawingView.tsx`, `apps/web/src/screens/DrawingView.test.tsx`
- Modify:
  - `apps/web/src/screens/PlayerScreen.tsx` — гілка `question.type === 'drawing'` поруч з moreless (~1073): `drawer` → `DrawingPad`; `guesser` → `DrawingCanvas` + `DrawingGuess`; `teammate` → полотно + `drawingTeamWatch`; `locked` (~1277) і `reveal` (~354) — `DrawingReveal`; переліки типів без `SpotlightChoices` (~1341);
  - `apps/web/src/screens/StageScreen.tsx` — велике полотно, `DrawingBoard` («Малює: Оля», «Вгадали 2 з 3»), `reveal` — `DrawingReveal`;
  - `apps/web/src/screens/HostScreen.tsx` — панель `host-drawing`: слово, полотно, хто вгадав (імена наживо), «Відповіли N з M» (~518) за `guessed / could`; рядок правильної відповіді (~774) показує слово;
  - сторінка деталей історії гри (там, де `letterwords` з `GameQuestionResult`) — полотно з `unpackStrokes(drawing.strokes)` і нік художника;
  - `apps/web/src/styles.css` — класи `drawing-`; `apps/web/src/i18n.ts`, 6 json, `ADDED_28C`.
- Test: `apps/web/src/screens/DrawingView.test.tsx`, `PlayerScreen.test.tsx`, `StageScreen.test.tsx`, `HostScreen.test.tsx`

**Interfaces (Consumes):** `DrawingInfo`, `HostDrawing`, `PlayerDrawing` (задача 3); `drawing`, `requestSync`, `Pen`, `DrawingCanvas` (задача 5); події `player:draw`, `player:draw-guess`.
```ts
/** Художник: полотно з touch-action: none і pointer-подіями (setPointerCapture), 8 кольорів, 3 товщини, гумка, «Крок назад», «Очистити».
 *  Локальна модель; пакет — кожні DRAW_FLUSH_MS, один у польоті; відмова ack → requestSync. Слово — великим над полотном. */
export function DrawingPad(props: { info: PlayerDrawing; model: DrawingModel | null; paused: boolean; timeUp: boolean; send: Send; requestSync: () => void }): JSX.Element;
/** Вгадувач: поле + «Вгадати»; ok → «Вгадано!» і поле зникає; drawing_miss → «Ні» на 1,5 с, поле очищається; too_soon → «Зачекайте». */
export function DrawingGuess(props: { info: PlayerDrawing; paused: boolean; timeUp: boolean; send: Send }): JSX.Element;
export function DrawingBoard(props: { info: DrawingInfo }): JSX.Element;
export function DrawingReveal(props: { info: DrawingInfo; strokes: Stroke[]; me?: string }): JSX.Element;
```
- uk-ключі: `drawingYourWord` «Ваше слово», `drawingYouDraw` «Ви малюєте!», `drawingDrawer` «Малює: {name}», `drawingGuessed` «Вгадано!», `drawingMiss` «Ні», `drawingGuessPlaceholder` «Що це?», `drawingGuessButton` «Вгадати», `drawingCount` «Вгадали {guessed} з {could}», `drawingTeamWatch` «Малює {name} з вашої команди — ви не вгадуєте», `drawingUndo` «Крок назад», `drawingClear` «Очистити», `drawingEraser` «Гумка», `drawingColor` «Колір {n}», `drawingWidth_0…2` «Тонка / Середня / Товста», `drawingWordWas` «Слово: {word}», `drawingNobody` «Ніхто не вгадав», `drawingFull` «Малюнок завеликий — зітріть щось».

- [ ] **Step 1: Write the failing tests:**
  - `DrawingView.test.tsx`:
    - `the drawer sees the word and the tools` — 8 кнопок кольорів з `aria-pressed`, 3 товщини, гумка, «Крок назад», «Очистити»; полотно має `style.touchAction === 'none'`;
    - `drawing sends begin then more, one batch in flight` — `pointerdown`/`pointermove` × 20/`pointerup` з фальшивим таймером → перший `send('player:draw', { op: 'begin', … })`; поки ack не прийшов, другого виклику немає; після ack — `more`;
    - `a refused op resyncs` — ack `drawing_stale` → `requestSync` викликано;
    - `undo and clear go to the server` — кнопки шлють `{ op: 'undo' }` і `{ op: 'clear' }`; пауза їх гасить;
    - `a guess shows yes or no only` — ok → «Вгадано!», поля немає; `drawing_miss` → «Ні», поле порожнє й знову активне;
    - `a teammate watches without a field`.
  - `PlayerScreen.test.tsx` — гравець-вгадувач бачить полотно й поле, але не слово; художник — слово.
  - `StageScreen.test.tsx` — «Малює: Оля», «Вгадали 1 з 3», без слова до `reveal`; на `reveal` — слово й імена з балами.
  - `HostScreen.test.tsx` — слово й імена тих, хто вгадав, наживо.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens`. Очікується FAIL.
- [ ] **Step 3: Implement.** Зразки: `MoreLessView.tsx` (структура, `useTimeRanOut`), `PinFrame.tsx` / `wipe.ts` (pointer-події), `TimedListView.tsx` (поле з ack). На 320 px інструменти — у два ряди; полотно — на всю ширину, 4:3. `ar` — інструменти дзеркально, полотно ні (`dir="ltr"` на полотні).
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 apps/web` і `pnpm typecheck`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): 28c drawing screens — the drawer's pad with colors, widths, eraser, undo and clear, the guess field with yes or no, the live canvas on the stage, the host and the phones, history"
```

---

### Задача 7. Наскрізні сценарії й кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts` — `it('part 28c: …')` після `part 28b`, помічники з суфіксом `28c`.

**Помічники:**
```ts
/** Запитання «Малюнок» для API. */
function drawing28c(id: string, text: string, accepted: string[], timeLimit: number, points = 100);
/** Малює мишею по полотну: точки в частках 0..1 полотна. */
async function mouseDraw28c(page: Page, path: [number, number][]);   // boundingBox, mouse.move/down/move({ steps: 8 })/up
/** Малює дотиком через CDP Input.dispatchTouchEvent (touchStart / touchMove / touchEnd) — Chrome робить з нього pointer-події з pointerType 'touch'. */
async function touchDraw28c(page: Page, path: [number, number][]);
/** Стан полотна: data-strokes, data-points і кількість нетлових пікселів (getImageData). */
async function canvasOf28c(page: Page): Promise<{ strokes: number; points: number; inked: number }>;
async function guess28c(page: Page, text: string);
```

**Сценарій** (`it('part 28c: drawing — turns, mouse and touch, a typo forgiven, the drawer\'s share, a team, reconnect and restart keep the drawing, no word on the stage', …, 600_000)`):
1. **Соло, 4 гравці** (Оля, Тарас, Петро — телефон з `hasTouch` і `isMobile`, Ганна). Класика з трьома запитаннями «Малюнок» (60, 40, 30 с): «соняшник», «парасолька», «маяк», між ними одне `single`.
2. **Перше:** малює Оля. Її телефон показує «соняшник», телефони інших і сцена — ні (`socketFrames` сцени й Тараса без «соняшник»).
   - Оля малює мишею коло й стебло (2 штрихи), змінює колір на жовтий і товщину на «Товста», «Крок назад», ще штрих. На сцені, пульті й телефоні Тараса `canvasOf28c` → `strokes: 2`, `inked > 0`, точки збігаються з телефоном Олі (`expect.poll`).
   - Тарас вводить «соняшнк» → «Вгадано!», поле зникає. Ганна — «ромашка» → «Ні», потім нічого. Петро — «соняшник» → «Вгадано!».
   - Сцена до `reveal`: «Вгадали 2 з 3», без імен. Ведучий закриває й відкриває: слово «соняшник», Тарас 100, Петро 100, Ганна 0, Оля 67.
3. **Друге:** Тарас закриває сторінку до відкриття → малює **Петро** (пропуск відключеного). Петро малює **дотиком** (`touchDraw28c`) — на сцені штрихи з'являються. Посеред малювання:
   - Петро перезавантажує сторінку → його полотно відновлено (ті самі `strokes`/`points`), малює далі;
   - сцена перезавантажується → малюнок той самий;
   - `restart()` сервера (як у 9b) → після повернення сцена й телефони мають ті самі штрихи; Петро домальовує;
   - Оля й Ганна вгадують → усі, хто міг (Тарас відключений), вгадали — запитання закривається саме; Петро — 100 (`could: 2`).
4. **Команди:** «Соняшники» (Оля, Тарас) і «Маки» (Петро, Ганна); два малюнки: малює Оля (Тарас бачить «Малює Оля з вашої команди — ви не вгадуєте» і не бачить слова), потім Петро. Ганна вгадує за «Маків» — Петро бачить «Вгадано!» на своїй команді; бали команди художника — частка.
5. **Історія:** деталі гри ведучого показують полотно з малюнком першого запитання й «Оля».
6. **Ліміт:** у редакторі тип «Малюнок» не пропонується на полі й у бліці (підказка `problemDrawingPlace`).

**Кадри** (`shot`, лише з `E2E_SHOTS=1`): `drawing-phone-drawer` (375 px, інструменти), `drawing-phone-drawer-320`, `drawing-phone-guess`, `drawing-phone-guessed`, `drawing-phone-team-watch`, `drawing-stage-question` (1600 × 900), `drawing-stage-reveal`, `drawing-host`, `drawing-history`, `drawing-phone-drawer-ar`. Перевірки розмітки: на 375/320 px немає прокрутки вбік; полотно на сцені 4:3 і вміщається без прокрутки.

- [ ] **Step 1: Write** сценарій і помічники.
- [ ] **Step 2: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 28c"` (на передньому плані). Виправити знайдене в коді задач 2–6 окремими комітами `fix(...)`: 28c ….
- [ ] **Step 3: Run** з `E2E_SHOTS=1`, переглянути кадри (інструменти не налазять, слово читається, полотно не розмите на `devicePixelRatio 2`).
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2` і `pnpm typecheck`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e
git commit -m "test(e2e): part 28c — drawing turns, mouse and touch, a forgiven typo, the drawer's share, a team, reconnect and restart keep the drawing, no word on the stage, shots"
```
