# План 29i: виправлення після вечірньої гри 2026-11-11

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> План спирається на `main` `43aaba6b` (після 29c, план 29d ще не виконано). **Рядки в плані приблизні: перед кожною задачею виконавець звіряє назви й рядки з фактичним кодом.** Задачі незалежні одна від одної, крім спільного списку ключів `ADDED_29I` (його створює задача 2, наступні дописують). Якщо задачу 2 роблять не першою, список створює та задача, що додає ключ першою.

**Goal:** сім виправлень і побажань після гри власника: пазл не губить останній шматочок і дає збільшити прев'ю, апеляції встигають подати кілька гравців по черзі, глядачі клітинки поля бачать хід «Більше чи менше», вгадувачі малюнка не бачать тексту-підказки, кросворд закреслює заповнені підказки, судоку має олівцеві позначки.

**Architecture:** зміни точкові. Рушій (`packages/engine`): автопілот і `playerAppeal` (апеляції), `moreLessInfo` (нове необов'язкове поле `watch`), `base`/`playerView` (приховування тексту малюнка). Спільні типи (`packages/shared/src/views.ts`): лише необов'язкові поля й розширений union. Веб (`apps/web`): `JigsawView`, `ImageZoom`, `MoreLessView`, `PuzzleView`, новий чистий модуль `live/sudoku-pencil.ts`. Сиди: тексти шести малюнків.

**Tech Stack:** TypeScript, vitest, React 19 + Testing Library (jsdom), Playwright через vitest (e2e).

**Spec:** опис пакета 29i від контролера (у цьому плані повторено все, що треба). Зразки: `docs/superpowers/plans/2026-11-11-plan-29c-jigsaw.md`, код 29c (`git log --oneline 1e302e49..5497fe04`).

## Global Constraints

- `GAME_STATE_VERSION` лишається **22**. Стан гри (`GameState`) не змінюється взагалі; у зрізах лише необов'язкові поля й розширений union `PlayerAppeal.block`.
- 7 мов без ru: нові ключі в uk (`apps/web/src/i18n.ts`) і в `apps/web/src/locales/{en,pl,de,es,it,ar}.json`. Список `ADDED_29I` іде в `apps/web/src/i18n.test.ts` поруч з `ADDED_29C` і додається до умови `adds no uk keys beyond the agreed list` (`!ADDED_29I.includes(key)`), плюс перевірки «є в uk» і «є в кожній мові», як для `ADDED_29C`. **Нічого про росію** ніде: ні в текстах, ні в тестах, ні в сидах.
- Кирилиця в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`).
- Юніт-тести: `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' <шляхи>`. Типи: `pnpm typecheck`. **Prettier не запускати ніколи.**
- e2e (лише задача 1): спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 29i"` на передньому плані, менше ніж за 10 хв, Docker вимкнено.
- Таймери у фікстурах і e2e ≥ 25 с. Телефон — 320 px, сцена — 1600×900.
- Коміти — після кожної задачі, з рядками атрибуції з system-reminder сесії.

## Рішення плану (там, де опис мовчить)

- **Пазл, «над рамкою».** Рахується за центром ядра шматочка (кут ядра + пів виміряної клітинки) строго в межах виміряного прямокутника рамки, без запасу. Позиція кута: `x = clamp(round3((coreLeft − rect.left) / cellW), 0, cols − 1)`, так само `y` з `rows − 1`. Прилипання (`jigsawFits`, допуск 0.25) працює вже з обмеженими координатами, тож кидок трохи за лівий край біля свого місця тепер прилипає.
- **Пазл, завислий жест.** Крім `onLostPointerCapture`, додається запасний слухач `pointerup`/`pointercancel` на `window` для `gesture.current.id`: якщо елемент шматочка зник з DOM посеред жесту, React-обробник не спрацює, а завислий `gesture.current` назавжди блокував би `onDown`. Обробник на `window` викликає ту саму функцію скасування; після звичайного `onUp` він нічого не робить (`gesture.current` уже `null`).
- **Прев'ю пазла.** Ширина `.jigsaw-preview` 7rem. Прев'ю загортається в `<button class="jigsaw-preview-open">` з `aria-label={t('imageZoomOpen')}` (ключ уже є, нового не треба). `ImageZoom` отримує необов'язковий `children`: якщо його передано, він малюється замість `<img className="image-zoom-img">`. Пазл передає `PhotoImg` з класом `image-zoom-img jigsaw-zoom-img`, тож обрізка (`aspect`, `focus`) та сама, що в рамці.
- **Апеляції.** Новий код блокування `'appeal_open'` у `PlayerAppeal.block`. Перевірки в `playerAppeal` ідуть у тому самому порядку, що й тепер: капітан, потім «нема кому голосувати», і лише потім відкрита чужа апеляція. Сам автор відкритої апеляції цього тексту не бачить: `appealReasons` для нього вже `[]`, бо апеляція на це запитання в нього є.
- **Апеляції в автопілоті.** Після рішення (не `cancelled`) вікно рахується від `from` (мить рішення, бо на рішенні змінюється `pilotKey`): `at = max(from + appealShown, appealPossible ? from + appealWindow : 0)`. До першої апеляції — як було, від `state.stepAt`. Нескінченного розкриття не буде: кожен учасник має одну апеляцію на запитання.
- **«Більше чи менше» в клітинці поля.** Сам гравець до розкриття правильності й значень **не бачить** (`PlayerMoreLess.marks` лише на reveal, `MoreLessPlay` правильності не показує). Тому й глядачам до розкриття — лише поточна пара (тексти з `question.moreless.pairs`, вони й так публічні) і вибрані тексти попередніх пар, без ✓/✗ і значень. Нове поле зрізу `MoreLessInfo.watch?` (ключа немає поза клітинкою поля); `picks` лишається лише ведучому.
- **Малюнок.** Для сцени, пульта-глядача й телефонів усіх, крім художника (людини `drawerId`), на етапах `question` і `locked` рушій віддає `question.text = ''`. Порожній текст не видає навіть довжини підказки. Веб, побачивши `type === 'drawing'` з порожнім текстом, показує `drawingGuessTitle` («Малюнок — вгадайте, що малює {name}»); без імені художника — `drawingGuessTitleAnon`. Товариші художника в команді тексту теж не бачать (як і слова). Пульт ведучого бачить усе, на reveal текст бачать усі.
- **Тексти малюнків у сидах.** Тести сидів забороняють однакові тексти в межах вікторини й між сидами (`mix-quiz.test.ts` ~168, `mix2-quiz.test.ts`). Тому тексти нейтральні, але пронумеровані: у `mix-quiz.ts` «Малюнок 1: вгадайте, що малює художник» … «Малюнок 3: …», у `mix2/era.ts` «Малюнок 4: …» … «Малюнок 6: …». Інших `drawing(` у `apps/server/scripts` немає (`quick-quiz.ts` бере перший малюнок з `mixQuiz()`).
- **Кросворд.** Слово «заповнене», якщо всі його клітинки в `board.cells` непорожні (свої чи товариша). Клас `is-filled` стоїть на кнопці `.crossword-clue` і на рядку `.crossword-active`. Вигляд: `text-decoration: line-through; opacity: 0.55`. Кнопка лишається натисною.
- **Олівець у судоку.** Позначки — `Record<number, string>`: клітинка → відсортовані цифри (`'136'`). Зберігаються в sessionStorage під ключем `quiz:pencil:${room}` значенням `{ tag, marks }`, де `tag = `${roundIndex}:${questionIndex}:${givens}``. Якщо тег не збігся, позначок немає, а перший запис перезаписує ключ. Так нове запитання очищує старі позначки, а сміття не накопичується. Без `room` (тести, сторінки без коду) позначки живуть лише в пам'яті. Вписана цифра прибирає позначки **назавжди**, бо зміна клітинки з `''` чи іншої цифри на цифру `d` застосовує `pencilAfterWrite`. Стерта цифра їх не повертає. Позначки в непорожній клітинці не малюються ніколи (так і після перезавантаження, якщо товариш вписав цифру, поки телефон спав). У режимі олівця «Стерти» очищує позначки вибраної порожньої клітинки. Перемикач олівця не діє на задані цифри, і цифра в непорожній клітинці в режимі олівця нічого не робить.

## Review Focus

1. **Пазл: кидок шматочка, що лежить на рамці, знову за край.** Шматочок, уже покладений на рамку (не з купки), тягнуть за межі так, що центр поза рамкою. Очікування: він вертається в купку, а не зникає. Тест: задача 1, `a piece on the frame dragged out goes back to the pile`.
2. **Пазл у команді: втрачений захват посеред жесту.** «Тримаю» більше не надсилається, товариші можуть узяти шматочок. Тест: задача 1, `lost pointer capture ends the drag and stops holding` (team, `send` не отримує нових `player:jigsaw-hold` після скасування за `JIGSAW_HOLD_REFRESH_MS`).
3. **Апеляції: третій гравець після двох рішень поспіль і пауза у вікні.** Вікно щоразу відлічується від останнього рішення, а пауза автора зберігає залишок. Тести: задача 2, `two players appeal one after another` і `the window after a decision survives a pause`.
4. **Малюнок: художник перепідключився посеред запитання.** Його зріз будується наново, текст має бути на місці. В іншого гравця тексту немає. Тест: задача 4, `the drawer sees the text in a fresh view, guessers and the stage do not`, у командному варіанті `a teammate of the drawer does not see the text`.
5. **Олівець: товариш вписав цифру в клітинку з позначками і в їхньому рядку.** Позначки клітинки зникають, цифра зникає з позначок сусідів, а стерта товаришем цифра позначок не повертає. Тест: задача 7, `a teammate's digit removes the marks of its cell and that digit from its row, column and box`.

---

### Задача 1. Пазл: останній шматочок не губиться за краєм, прев'ю більше й відкривається на весь екран (п. 1 і 5)

**Files:**
- Modify: `apps/web/src/screens/JigsawView.tsx` (`onDown` ~260, `onUp` ~282-306, `onCancel` ~308, `pieceEl` ~323-347, `jigsaw-head` ~369-372)
- Modify: `apps/web/src/screens/ImageZoom.tsx` (необов'язковий `children`)
- Modify: `apps/web/src/styles.css` (`.jigsaw-preview` ~19884; нові `.jigsaw-preview-open`, `.jigsaw-zoom-img`)
- Test: `apps/web/src/screens/JigsawView.test.tsx`
- Test (e2e): `apps/server/e2e/full-game.e2e.ts` — новий `part 29i`

**Interfaces:**
- Produces: `export function jigsawDropAt(rect: { left: number; top: number; width: number; height: number }, cols: number, rows: number, coreLeft: number, coreTop: number): { x: number; y: number } | null` у `JigsawView.tsx`. `null` означає, що центр ядра поза рамкою (або рамка нульова). Координати округлені до 0.001 і обмежені `[0, cols−1]` × `[0, rows−1]`.
- Produces: `ImageZoom({ url, alt, onClose, children? }: { url: string; alt: string; onClose: () => void; children?: ReactNode })`.

- [ ] **Step 1: Write the failing tests** у `JigsawView.test.tsx`. Розмітка тестів та сама: рамка 304×228 у (0,0), клітинка 76, палець у центрі ядра (`offX = offY = 38`). `pad` береться з `piecePad(76, 76)` (`../live/jigsaw-shape`).

```ts
describe('jigsawDropAt', () => {
  const rect = { left: 0, top: 0, width: 304, height: 228 };
  it('clamps the corner into the frame when the centre is inside', () => {
    expect(jigsawDropAt(rect, 4, 3, 262, 182)).toEqual({ x: 3, y: 2 });
    expect(jigsawDropAt(rect, 4, 3, -18, 62)).toEqual({ x: 0, y: 0.816 });
  });
  it('a centre outside the frame is no drop', () => {
    expect(jigsawDropAt(rect, 4, 3, -58, 62)).toBeNull(); // центр x = −20
    expect(jigsawDropAt(rect, 4, 3, 272, 62)).toBeNull(); // центр x = 310
    expect(jigsawDropAt({ ...rect, width: 0 }, 4, 3, 0, 0)).toBeNull();
  });
});
```

Тести компонента:
- `a piece dropped by the right edge lies inside the frame`. Шматочок 5, повернутий (`turnTo(5, 1)`), відпускають пальцем у (300, 220). Очікування: `.jigsaw-frame [data-piece="5"].is-loose` має `style.left === `${3 * CELL - pad}px`` і `style.top === `${2 * CELL - pad}px``. Потім `dragTo(that element, 1, 1)` знову бере його: шматочок лежить у (1,1).
- `the finger past the left edge within half a cell: back to the pile`. Відпускання в (−20, 100): шматочок 5 знову в `.jigsaw-pile`, `send` не викликано.
- `a piece on the frame dragged out goes back to the pile` (Review Focus 1).
- `lost pointer capture ends the drag`: `pointerDown` → `pointerMove` (40, 40) → `fireEvent.lostPointerCapture(el, { pointerId: 1 })`. Очікування: `[data-dragging]` немає. Після `turnTo(5, 0)` і `dragTo(pieceEl(5), 1, 1)` викликано `send('player:jigsaw', { questionIndex: 2, piece: 5, x: 1, y: 1, rot: 0 })`.
- `lost pointer capture ends the drag and stops holding` (team, Review Focus 2). Після `lostPointerCapture` і `vi.advanceTimersByTime(JIGSAW_HOLD_REFRESH_MS * 2)` нових викликів `player:jigsaw-hold` немає.
- `a pointerup on the window frees a gesture whose piece left the DOM`. `pointerDown` + `pointerMove` на шматочку, потім `fireEvent.pointerUp(window, { pointerId: 1 })`, далі звичайний `dragTo` іншого шматочка спрацьовує.
- `the preview opens the same crop full screen` (`preview: true`, `focus: { x: 0.2, y: 0.7 }`). Кнопка з іменем `t('imageZoomOpen')` є. Клік відкриває `role="dialog"`, усередині `img` з `style.aspectRatio === '4 / 3'` і `style.objectPosition === '20% 70%'`. `Escape` закриває.
- Наявний `the preview shows only when allowed` лишається зеленим.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web/src/screens/JigsawView.test.tsx`
Expected: FAIL (`jigsawDropAt` не експортовано, шматочок за краєм лежить з `left < 0`, кнопки прев'ю немає).

- [ ] **Step 3: Implement**
  - `jigsawDropAt` за інтерфейсом. `onUp` рахує `coreLeft = event.clientX − g.offX`, `coreTop = event.clientY − g.offY` і кличе `model.drop(g.piece, jigsawDropAt(rect, cols, rows, coreLeft, coreTop))`. Старий `margin` прибрати.
  - `pieceEl`: `onLostPointerCapture={onCancel}`.
  - У `JigsawBoard` додати `useEffect` зі слухачами `pointerup`/`pointercancel` на `window`. Вони кличуть ту саму логіку, що й `onCancel`, лише коли `gesture.current?.id === event.pointerId`. Логіку `onCancel` винести у функцію від `pointerId`.
  - Прев'ю: `const [zoom, setZoom] = useState(false)`, кнопка `jigsaw-preview-open` навколо `PhotoImg` (`jigsaw-preview`). Коли `zoom`, малюється `<ImageZoom url={jigsaw.photo} alt={t('jigsawPreview')} onClose={() => setZoom(false)}><PhotoImg jigsaw={jigsaw} className="image-zoom-img jigsaw-zoom-img" alt={t('jigsawPreview')} /></ImageZoom>`.
  - `ImageZoom`: `{children ?? <img className="image-zoom-img" src={url} alt={alt} />}`.
  - CSS:
    - `.jigsaw-preview { width: 7rem; }`;
    - `.jigsaw-preview-open` — без рамки й тла, `padding: 0`, `line-height: 0`, `:focus-visible` як у `.question-image-zoom`;
    - `.jigsaw-zoom-img { width: min(100%, calc((100dvh - 1rem) * var(--ar))); height: auto; }`. `--ar` (число `aspectRatio(jigsaw.aspect)`) ставить `PhotoImg`, якщо `className` містить `jigsaw-zoom-img`, або через новий необов'язковий проп `style` у `PhotoImg`; вибір за виконавцем.
  - Перевірити, що на 320×568 голова з прев'ю 7rem не виштовхує купку за екран: `JIGSAW_FRAME_MAX_VH` не змінювати, у разі потреби зменшити лише відступи `.jigsaw-head`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web/src/screens/JigsawView.test.tsx apps/web/src/screens/ImageZoom* apps/web/src/source-scan.test.ts`
Expected: PASS

- [ ] **Step 5: e2e `part 29i`** (без браузера не перевірити справжній `setPointerCapture`, виміряну рамку й 320 px). Новий `it('part 29i: jigsaw at 320 px — the last piece dropped by the edge stays on the frame and can be taken again, the preview opens full screen', …)` поруч з `part 29c`. Повторно використати `jigsaw29c(…)` і помічники з `jigsawGame29c` (кімната, класичний раунд перед пазлом; номер запитання в межах раунду).
  - Пазл 2×2 з `preview: true` і таймером ≥ 25 с.
  - Телефон 320×568 ставить три шматочки мишею (`page.mouse`), четвертий кидає так, що палець за 10 px від правого краю рамки.
  - Очікування: шматочок видно в межах `.jigsaw-frame` (`boundingBox` усередині рамки). Його знову беруть, повертають до 0 і кладуть на місце, після чого `jigsawDoneIn` видно.
  - Окремо: тап по `.jigsaw-preview-open` відкриває `.image-zoom`, картинка вміщається у вікно (`expectNoSideScroll`), `Escape` закриває.

Run: `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 29i"`
Expected: PASS менше ніж за 10 хв.

- [ ] **Step 6: Commit** — `fix(web): 29i jigsaw — a piece dropped by the edge stays on the frame by its centre, a lost capture ends the drag, the preview is bigger and opens the same crop full screen`

---

### Задача 2. Апеляції: кілька гравців по черзі в автопілоті

**Files:**
- Modify: `packages/engine/src/autopilot.ts` (`moveOf`, `case 'reveal'` ~322-333, коментар)
- Modify: `packages/engine/src/appeal.ts` (`playerAppeal` ~360-374)
- Modify: `packages/shared/src/views.ts` (`PlayerAppeal.block` ~1720)
- Modify: `apps/web/src/screens/PlayerScreen.tsx` (~1493)
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,pl,de,es,it,ar}.json`, `apps/web/src/i18n.test.ts`
- Test: `packages/engine/src/autopilot.appeal.test.ts`, `packages/engine/src/views.appeal.test.ts`, `apps/web/src/screens/PlayerScreen.test.tsx` (або інший файл, де вже тестовано `appeal-block`)

**Interfaces:**
- Produces: `PlayerAppeal.block: 'no_voters' | 'captain' | 'appeal_open' | null`.
- Produces: ключ `appealWaitOther` і список `ADDED_29I = ['appealWaitOther']` в `i18n.test.ts` (наступні задачі дописують сюди).

- [ ] **Step 1: Write the failing tests**
  - `autopilot.appeal.test.ts`: змінити очікування двох наявних тестів:
    - `an early decision while someone else can still appeal…`: тепер `expect(atOf(s)).toBe(R + 2000 + AUTOPILOT_MS.appealWindow)`, назву поправити на `…: a fresh window from the decision`;
    - `a tie while someone else can still appeal…`: так само `R + 2000 + AUTOPILOT_MS.appealWindow`.
  - Новий тест `two players appeal one after another` (`toReveal({ a: RIGHT, p2: WRONG, p3: WRONG })`):
    - p2 оскаржує о R+1000, `a` і `p3` голосують «ні» о R+2000. Очікування: `atOf(s) === R + 2000 + appealWindow`.
    - p3 оскаржує о R+9000 (пізніше за старе вікно R+8000) і отримує `ok`, `a` і `p2` голосують «так» о R+9500. Очікування: `atOf(s) === R + 9500 + AUTOPILOT_MS.appealShown`, `s.appeals?.[1].outcome === 'yes'`, і `go(s).phase !== 'reveal'`.
  - Новий тест `the window after a decision survives a pause`. Після рішення о R+2000 автор ставить паузу о R+3000 (`authorPause`) і продовжує о R+20000 (`authorResume`). Очікування: `atOf(s) === R + 20000 + (appealWindow − 1000)`.
  - Наявний `a second appeal on the same reveal waits again and then shows appealShown` лишається зеленим без змін (там оскаржити більше нікому).
  - `views.appeal.test.ts`, новий тест `while another appeal is open the one who can still appeal is told to wait`. Троє, p2 і p3 помилились, p2 відкрив апеляцію. Очікування:
    - `playerView(s, 'p3').me.appeal` дорівнює `{ left: 2, reasons: [], block: 'appeal_open', voter: true, vote: null }`;
    - у `p2` `block === null` і `reasons` порожні;
    - у `a` (відповів правильно) `block === null`.
    
    Командний варіант: некапітан команди, що може оскаржити, бачить `block: 'captain'`, а не `appeal_open`.
  - Веб: телефон з `me.appeal.block === 'appeal_open'` показує `t('appealWaitOther')` у `.appeal-block`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/engine/src/autopilot.appeal.test.ts packages/engine/src/views.appeal.test.ts`
Expected: FAIL (вікно від `stepAt`, `block` дорівнює `null`).

- [ ] **Step 3: Implement**
  - `moveOf`, `reveal`: `const window = appealPossible(state) ? (decided ? from : (state.stepAt ?? from)) + AUTOPILOT_MS.appealWindow : 0;`. Коментар оновити: «після рішення, поки хтось ще може оскаржити, — appealWindow від миті рішення».
  - `playerAppeal`: `fit` рахувати як `left > 0 ? appealReasons(state, participant) : []` (без умови `open === null`). Після перевірок «капітан» і «no_voters» додати: якщо `open !== null`, повернути `{ left, reasons: [], block: 'appeal_open', voter, vote }`. Решта без змін.
  - `PlayerAppeal.block`: розширити union, оновити JSDoc.
  - `PlayerScreen.tsx`: мапа `const APPEAL_BLOCK_KEY = { captain: 'appealCaptain', no_voters: 'appealNoVoters', appeal_open: 'appealWaitOther' } as const` замість тернарного виразу.
  - Ключ `appealWaitOther` у 7 мовах:
    - uk «Зал голосує за іншу апеляцію — потім зможете й ви»
    - en "The hall is voting on another appeal — you can appeal after it"
    - pl "Sala głosuje nad inną apelacją — potem możesz złożyć swoją"
    - de "Der Saal stimmt über einen anderen Einspruch ab — danach kannst du auch"
    - es "La sala vota otra apelación — después podrás apelar tú"
    - it "La sala vota un altro ricorso — dopo potrai farlo anche tu"
    - ar "القاعة تصوّت على اعتراض آخر — بعده يمكنك الاعتراض أيضًا"
    
    Створити `ADDED_29I` і підключити його в `i18n.test.ts`, як `ADDED_29C`.
  - Перевірити, чи `block` не перелічують інші місця (`grep -rn "'no_voters'" apps packages`), і доповнити їх.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/engine/src/autopilot packages/engine/src/appeal packages/engine/src/views.appeal.test.ts apps/web/src/i18n.test.ts apps/web/src/screens/PlayerScreen.test.tsx` і `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit** — `fix(engine): 29i appeals one after another — after a decision the autopilot keeps a fresh appeal window while someone can still appeal, the phone says the hall is voting on another appeal`

---

### Задача 3. «Більше чи менше» в клітинці поля: глядачі бачать поточну пару й вибори

**Files:**
- Modify: `packages/shared/src/views.ts` (`MoreLessInfo` ~473; новий `MoreLessCellWatch`)
- Modify: `packages/engine/src/views.ts` (`moreLessInfo` ~1476-1510)
- Modify: `apps/web/src/screens/MoreLessView.tsx` (новий `MoreLessWatch`)
- Modify: `apps/web/src/screens/PlayerScreen.tsx` (~1128-1129 question, ~1382 locked), `apps/web/src/screens/StageScreen.tsx` (~479-482)
- Modify: `apps/web/src/styles.css`, словники, `i18n.test.ts`
- Test: `packages/engine/src/views.moreless.test.ts`, `apps/web/src/screens/MoreLessView.test.tsx`

**Interfaces:**
- Produces (shared):
  ```ts
  /** Клітинка поля (28a, 29i): хід того, хто відповідає, — для всіх, без правильності й значень до reveal. */
  export interface MoreLessCellWatch { playerId: string; done: number; picks: MoreLessSide[] }
  // MoreLessInfo:
  /** Лише на клітинці поля; поза нею ключа немає. */
  watch?: MoreLessCellWatch;
  ```
- Produces (web): `export function MoreLessWatch({ info, question }: { info: MoreLessInfo; question: PublicQuestion })`; повертає `null`, якщо `info.watch` немає.

- [ ] **Step 1: Write the failing tests**
  - `views.moreless.test.ts`, поруч з `on a board cell only the chooser has a row and a pad`:
    - `a board cell: the stage and other phones see the answerer's picks without right or wrong`. Обирач зробив 2 вибори `['a','b']`. Очікування:
      - `stageView(s).moreless?.watch` і `playerView(s, other).moreless?.watch` дорівнюють `{ playerId: chooser, done: 2, picks: ['a','b'] }`;
      - `pairs === null`, `picks === null`, `rows[0].right === null`;
      - `JSON.stringify(stageView(s).moreless)` не містить жодного `value` пар і слова `correct`.
    - `a classic moreless has no watch`: `'watch' in stageView(s).moreless!` дорівнює `false`.
    - `the watch stays on locked and reveal`: на reveal `watch` є, `pairs` не `null`.
  - `MoreLessView.test.tsx`: `MoreLessWatch shows the current pair and the chosen texts without marks`. Перевірити:
    - видно `prompt` пари з індексом `done` і обидва тексти;
    - список вибраних: «1. prompt — текст вибраної сторони»;
    - немає `.moreless-pick`, `✓`, `✗`;
    - коли `done === total`, видно `t('morelessDone')`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/engine/src/views.moreless.test.ts apps/web/src/screens/MoreLessView.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement**
  - `moreLessInfo`: якщо `play.board !== undefined`, додати `...optional('watch', { playerId: chooserId, done: picks.length, picks })` (через `moreLessOf(state, chooserId).picks`). Робити це для всіх ролей: пульт поля не використовує, але й не заважає. `picks` і `pairs` не чіпати.
  - `MoreLessWatch`:
    - `.moreless-watch`, без кнопок;
    - лічильник `morelessCounter` (`bdi dir="ltr"`);
    - `h2.moreless-prompt` пари `question.moreless.pairs[done]`;
    - два `span.moreless-option.is-static` з текстами `a` і `b`;
    - нижче `ol.moreless-watch-picks` з заголовком `t('morelessWatchPicks')`: рядки `${i + 1}. ${pair.prompt} — ${pick === 'a' ? pair.a : pair.b}` (`dir="auto"`);
    - коли `done >= total`, замість пари стоїть `morelessDone`.
  - `PlayerScreen` (question і locked, гілка `me.moreless === undefined`) і `StageScreen` (не reveal): `view.moreless.watch !== undefined ? <MoreLessWatch …/> : <MoreLessBoard …/>`. На reveal без змін.
  - На сцені 1600×900 блок має вміщатися: шрифт пари як у `.moreless-stage`; список виборів — до 2 стовпців понад 6 рядків.
  - Ключ `morelessWatchPicks`:
    - uk «Вибори гравця»
    - en "Player's picks"
    - pl "Wybory gracza"
    - de "Auswahl des Spielers"
    - es "Elecciones del jugador"
    - it "Scelte del giocatore"
    - ar "اختيارات اللاعب"
    
    Дописати в `ADDED_29I`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/engine/src/views.moreless.test.ts apps/web/src/screens/MoreLessView.test.tsx apps/web/src/screens/StageScreen.test.tsx apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/i18n.test.ts` і `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit** — `fix: 29i more-or-less on a board cell — the stage and the other phones see the current pair and the answerer's picks, right and wrong only after time`

---

### Задача 4. «Малюнок»: вгадувачі й сцена не бачать тексту запитання до розкриття

**Files:**
- Modify: `packages/engine/src/views.ts` (`base` ~2563-2580, `playerView` ~3025-3050)
- Modify: `apps/web/src/screens/DrawingView.tsx` (новий `drawingTitle`), `apps/web/src/screens/PlayerScreen.tsx` (~1073), `apps/web/src/screens/StageScreen.tsx` (~325)
- Modify: словники, `i18n.test.ts`
- Test: `packages/engine/src/views.drawing.test.ts`, `apps/web/src/screens/DrawingView.test.tsx`

**Interfaces:**
- Produces (engine, внутрішнє): `function drawingTextHidden(state: GameState, personId: string | null): boolean`. Повертає `true`, якщо `drawingOf(state) !== null`, фаза `question` або `locked` і `personId !== drawingOf(state)!.drawerId` (`null` — будь-хто без імені: сцена).
- Produces (web): `export function drawingTitle(question: PublicQuestion, drawerName: string | null): string`. Повертає `question.text`, якщо це не малюнок або текст непорожній. Інакше `t('drawingGuessTitle', { name })` чи `t('drawingGuessTitleAnon')`.

- [ ] **Step 1: Write the failing tests** у `views.drawing.test.ts`:
  - `the drawer sees the text in a fresh view, guessers and the stage do not` (Review Focus 4). На `question` і `locked`:
    - `stageView(s).question?.text === ''`;
    - `playerView(s, guesser).question?.text === ''`;
    - `playerView(s, drawerId).question?.text` дорівнює тексту запитання;
    - `hostView(s).question?.text` дорівнює тексту.
    
    На `reveal` текст бачать усі ролі. Інші поля `question` (тип, `timeLimit`, `points`) у вгадувача ті самі, що в художника.
  - `a teammate of the drawer does not see the text` (команди): художник-учасник бачить текст, його товариш і інша команда — `''`.
  - Наявний `other questions are unchanged` розширити: текст одиночного вибору в усіх ролях не порожній.
  - `DrawingView.test.tsx`: `drawingTitle` дає `t('drawingGuessTitle', { name: 'Оля' })` для малюнка з `text: ''`, `t('drawingGuessTitleAnon')` без імені й сам текст для непорожнього.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/engine/src/views.drawing.test.ts apps/web/src/screens/DrawingView.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement**
  - `base(state, forHost)`: `question` дорівнює `shownPublic(state)`, а коли `!forHost && q !== null && drawingTextHidden(state, null)`, то `{ ...q, text: '' }`.
  - `playerView`: в обох гілках (соло — `playerId`, команди — `member.id`), якщо `view.question?.type === 'drawing'` і `!drawingTextHidden(state, personId)`, повернути `question: { ...view.question, text: shownPublic(state)!.text }`. Окрема функція `withDrawerText(state, personId, view)`.
  - Перевірити `grep -n "question.text\|\.text" packages/engine/src/views.ts`: жоден інший зріз на `question`/`locked` не несе тексту малюнка (`facts.ts` — reveal, `undo.ts` — пульт, апеляція — reveal).
  - Веб: `PlayerScreen` ~1073 і `StageScreen` ~325 малюють `drawingTitle(question, view.drawing?.drawerName ?? null)` замість `question.text`, і `questionClass` від того самого рядка.
  - Ключі:
    - `drawingGuessTitle`:
      - uk «Малюнок — вгадайте, що малює {name}»
      - en "Drawing — guess what {name} is drawing"
      - pl "Rysunek — zgadnij, co rysuje {name}"
      - de "Zeichnung — rate, was {name} zeichnet"
      - es "Dibujo — adivina qué dibuja {name}"
      - it "Disegno — indovina cosa disegna {name}"
      - ar "رسم — خمّن ماذا يرسم {name}"
    - `drawingGuessTitleAnon`:
      - uk «Малюнок — вгадайте, що малюють»
      - en "Drawing — guess what is being drawn"
      - pl "Rysunek — zgadnij, co jest rysowane"
      - de "Zeichnung — rate, was gezeichnet wird"
      - es "Dibujo — adivina qué se dibuja"
      - it "Disegno — indovina cosa si disegna"
      - ar "رسم — خمّن ما يُرسم"
    
    Обидва дописати в `ADDED_29I`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/engine/src/views apps/web/src/screens/DrawingView.test.tsx apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/screens/StageScreen.test.tsx apps/web/src/i18n.test.ts apps/web/src/source-scan.test.ts` і `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit** — `fix: 29i drawing — the stage and the guessers get no question text until the reveal, the phones say guess what the drawer draws`

---

### Задача 5. Сиди: нейтральні тексти малюнків

**Files:**
- Modify: `apps/server/scripts/mix-quiz.ts` (~498, ~525, ~532), `apps/server/scripts/mix2/era.ts` (~54, ~75, ~89)
- Test: `apps/server/scripts/mix-quiz.test.ts`, `apps/server/scripts/mix2-quiz.test.ts`, `apps/server/scripts/mix2/era.test.ts`, `apps/server/scripts/quick-quiz.test.ts`

**Interfaces:** немає.

- [ ] **Step 1: Write the failing test** у `mix-quiz.test.ts` і `mix2-quiz.test.ts`: `drawing texts are neutral`. Кожне запитання `type === 'drawing'` має текст, що відповідає `/^Малюнок \d: вгадайте, що малює художник$/u`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/server/scripts/mix-quiz.test.ts apps/server/scripts/mix2-quiz.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**
  - `mix-quiz.ts`: «Малюнок 1: вгадайте, що малює художник» (тамагочі), «Малюнок 2: …» (пейджер), «Малюнок 3: …» (дискета).
  - `mix2/era.ts`: «Малюнок 4: …» (касета), «Малюнок 5: …» (ролики), «Малюнок 6: …» (розкладачка).
  
  `accepted`, бали й таймери не змінювати. Ще раз перевірити `grep -rn "drawing(" apps/server/scripts`: нових місць немає.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/server/scripts`
Expected: PASS (зокрема перевірки «немає однакових текстів тут і в інших сидах»)

- [ ] **Step 5: Commit** — `fix(seed): 29i drawing texts say only «guess what the drawer draws» — the old texts were hints`

---

### Задача 6. Кросворд: заповнені підказки закреслені

**Files:**
- Modify: `apps/web/src/screens/PuzzleView.tsx` (`CrosswordPlay`: активний рядок ~442-450, список ~526-544)
- Modify: `apps/web/src/styles.css` (`.crossword-clue` ~19220, `.crossword-active`)
- Test: `apps/web/src/screens/PuzzleView.test.tsx`

**Interfaces:**
- Produces: `export function wordFilled(cells: readonly number[], values: readonly string[]): boolean` — `true`, якщо кожна клітинка непорожня (`(values[c] ?? '') !== ''`).

- [ ] **Step 1: Write the failing tests**
  - `wordFilled`: `([0,1,2], ['а','б','в'])` дає `true`, `([0,1,2], ['а','','в'])` — `false`.
  - `a clue whose cells are all filled is struck through, and plain again after an erase`. Ввести всі літери слова 1 → кнопка підказки слова 1 має клас `is-filled`, і `.crossword-active` теж (слово активне). Сусіднє слово класу не має. «Стерти» одну літеру → `is-filled` зникає з обох місць.
  - `a teammate's letters count too`. `rerender` з `info.cells`, де товариш заповнив слово 2 (через той самий шлях, яким `usePuzzleBoard` бере `info`): підказка слова 2 має `is-filled`.
  - `filled says nothing about right or wrong`. Слово, заповнене неправильними літерами, теж `is-filled`. Жодного класу правильності немає.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web/src/screens/PuzzleView.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement**
  - `className={wordFilled(w.cells, board.cells) ? 'crossword-clue is-filled' : 'crossword-clue'}`.
  - Для `p.crossword-active`: `is-filled`, коли `activeWord !== undefined && wordFilled(activeWord.cells, board.cells)`.
  - CSS: `.crossword-clue.is-filled, .crossword-active.is-filled { text-decoration: line-through; opacity: 0.55; }`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web/src/screens/PuzzleView.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit** — `feat(web): 29i crossword — a clue with every cell filled is struck through in the list and the active line, an erased letter brings it back`

---

### Задача 7. Судоку: олівцеві позначки

**Files:**
- Create: `apps/web/src/live/sudoku-pencil.ts`
- Modify: `apps/web/src/screens/PuzzleView.tsx` (`PuzzlePlayProps`, `SudokuPlay` ~149-261)
- Modify: `apps/web/src/screens/PlayerScreen.tsx` (~1142, `<PuzzlePlay …>` у question; у locked — без змін або з тим самим пропом, щоб позначки було видно)
- Modify: `apps/web/src/styles.css` (`.sudoku-pencil`, `.puzzle-pencil[aria-pressed="true"]`)
- Modify: словники, `i18n.test.ts`
- Test: `apps/web/src/live/sudoku-pencil.test.ts`, `apps/web/src/screens/PuzzleView.test.tsx`

**Interfaces:**
- Produces (`sudoku-pencil.ts`):
  ```ts
  /** Клітинка (0…35) → відсортовані цифри-кандидати, напр. '136'; порожніх записів немає. */
  export type PencilMarks = Readonly<Record<number, string>>;
  export function togglePencil(marks: PencilMarks, cell: number, digit: string): PencilMarks;
  /** Вписано digit у cell: позначки cell зникають, digit зникає з позначок рядка, стовпця й блоку 2×3. */
  export function pencilAfterWrite(marks: PencilMarks, cell: number, digit: string): PencilMarks;
  export function loadPencil(room: string, tag: string): PencilMarks; // sessionStorage 'quiz:pencil:' + room, { tag, marks }; інший тег чи помилка → {}
  export function savePencil(room: string, tag: string, marks: PencilMarks): void; // помилки сховища ковтає
  export function usePencil(room: string | undefined, tag: string, cells: readonly string[]): { marks: PencilMarks; toggle(cell: number, digit: string): void; clear(cell: number): void };
  ```
  `usePencil` порівнює `cells` з попередніми (ref). Для кожної клітинки, що стала непорожньою чи змінила цифру, застосовує `pencilAfterWrite` і зберігає результат. Без `room` нічого не зберігає.
- Produces: `PuzzlePlayProps.pencil?: { room: string; round: number }`; тег у `SudokuPlay` дорівнює `${pencil.round}:${questionIndex}:${givens}`.

- [ ] **Step 1: Write the failing tests**
  - `sudoku-pencil.test.ts`:
    - `togglePencil` вмикає й вимикає цифру, тримає цифри відсортованими (`'3'` + `'1'` дає `'13'`), прибирає порожній запис.
    - `pencilAfterWrite(marks, 7, '4')`:
      - видаляє `marks[7]`;
      - прибирає `'4'` з клітинок рядка 1, стовпця 1 і блоку (рядки 0–1, стовпці 0–2);
      - не чіпає `'4'` у клітинці 35;
      - інші цифри сусідів лишає.
    - `loadPencil`/`savePencil`: збережене з тим самим тегом читається; з іншим тегом дає `{}`; зіпсований JSON дає `{}`; `sessionStorage.setItem`, що кидає виняток, не ламає.
  - `PuzzleView.test.tsx`:
    - `the pencil toggles small candidates in an empty cell`. Вибрати порожню клітинку, натиснути `t('sudokuPencil')` (`aria-pressed="true"`), потім 1 і 3. У клітинці `.sudoku-pencil` з цифрами 1 і 3, `board.set` не викликано (`send` не отримав `player:puzzle`). Повторне 3 вимикає.
    - `a written digit hides the marks of its cell and removes it from peers`. Вимкнути олівець, вписати 3 у сусідню клітинку рядка: позначка 3 зникла, 1 лишилась.
    - `a teammate's digit removes the marks of its cell and that digit from its row, column and box` (Review Focus 5). `rerender` з новим `info`, де товариш вписав цифру. Потім ще `rerender`, де товариш її стер: позначки не повернулися.
    - `marks survive a remount for the same question and are gone for another`. Змонтувати з `pencil={{ room: 'ABCD', round: 0 }}`, поставити позначку, `unmount` і змонтувати знову — позначка є. Змонтувати з іншим `questionIndex` чи іншими `givens` — позначок немає.
    - `erase in pencil mode clears the marks of the cell`.
    - `digits in pencil mode do nothing on a filled cell`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web/src/live/sudoku-pencil.test.ts apps/web/src/screens/PuzzleView.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement**
  - `sudoku-pencil.ts` за інтерфейсом. Сусіди — та сама геометрія, що в `peer()` `SudokuPlay`: рядок, стовпець, блок `Math.floor(r / 2)`, `Math.floor(c / 3)`. Винести її в `sudoku-pencil.ts` (`sudokuPeers(cell): number[]`) і використати в `peer()`.
  - `SudokuPlay`:
    - `const [pencilOn, setPencilOn] = useState(false)`, `const pencil = usePencil(props.pencil?.room, tag, board.cells)`;
    - `put(v)`: у режимі олівця для непорожнього `v` — `if (board.cells[sel] === '') pencil.toggle(sel, v)`, для `''` — `pencil.clear(sel)`. Поза режимом — як було;
    - фізичні клавіші йдуть через той самий `put`;
    - у порожній невибраній чи вибраній клітинці з позначками — `<span className="sudoku-pencil" aria-hidden="true">` з шістьма `span` у сітці 2×3 (цифра `d` на місці `d − 1`, відсутня — порожній `span`);
    - `aria-label` клітинки: `cellLabel(...)` + `, ${t('sudokuPencilMarks', { digits: '1, 3' })}`, якщо позначки є;
    - кнопка `btn puzzle-key puzzle-pencil` з `aria-pressed={pencilOn}` останньою в `.puzzle-keypad` (тільки там, де клавіатура видима).
  - CSS:
    - `.sudoku-pencil { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, 1fr); width: 100%; height: 100%; font-size: 0.55em; line-height: 1; color: var(--muted); }`;
    - кнопка олівця з `aria-pressed="true"` — акцентна рамка.
    
    На 320 px клавіатура з 8 кнопок не має виходити за ширину: перевірити наявний тест ширини чи додати `flex-wrap`.
  - `PlayerScreen`: `<PuzzlePlay … pencil={code === '' ? undefined : { room: code, round: view.round?.index ?? 0 }} />` в обох місцях (question і locked).
  - Ключі:
    - `sudokuPencil`:
      - uk «Олівець»
      - en "Pencil"
      - pl "Ołówek"
      - de "Bleistift"
      - es "Lápiz"
      - it "Matita"
      - ar "قلم رصاص"
    - `sudokuPencilMarks`:
      - uk «позначки: {digits}»
      - en "notes: {digits}"
      - pl "notatki: {digits}"
      - de "Notizen: {digits}"
      - es "notas: {digits}"
      - it "note: {digits}"
      - ar "ملاحظات: {digits}"
    
    Обидва дописати в `ADDED_29I`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web/src/live/sudoku-pencil.test.ts apps/web/src/screens/PuzzleView.test.tsx apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/i18n.test.ts apps/web/src/source-scan.test.ts` і `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit** — `feat(web): 29i sudoku pencil — a switch by the keypad toggles small 2×3 candidates in empty cells, a written digit clears them in its cell and its row, column and box, kept per room and question in the session`

---

## Фінальна перевірка

- [ ] `pnpm typecheck`
- [ ] `pnpm vitest run --maxWorkers=2 --exclude '.claude/**'` — весь набір зелений.
- [ ] `ADDED_29I` дорівнює `['appealWaitOther', 'morelessWatchPicks', 'drawingGuessTitle', 'drawingGuessTitleAnon', 'sudokuPencil', 'sudokuPencilMarks']` (порядок довільний), і кожен ключ є в 7 мовах.
- [ ] `GAME_STATE_VERSION === 22` (`git diff main -- packages/engine/src/restore.ts` без зміни версії).
- [ ] e2e `part 29i` зелений після `pnpm build` (задача 1).
