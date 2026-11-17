# План 37: крок «Більше чи менше», «Не перебільш», «Думай як усі» (`thinkalike`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** Нове в стані — лише необов'язкове `Play.alike?`; решта — необов'язкові поля запитань (`moreless.step?`, `numeric.noOvershoot?`) і нові значення типів, яких старий знімок не містить.

> **Звірка з кодом.** План спирається на `main` 2026-11-17 (`d3955b73`):
> - `QUESTION_TYPES` — 30 типів, `… 'melody', 'videoclip', 'bluff', 'think'` (`packages/shared/src/question-types.ts`); `UNGRADED_TYPES` виводиться з `hostGraded: false`;
> - `GAME_STATE_VERSION = 22`, коментар `36 без нової версії…` (`packages/engine/src/restore.ts` ~90);
> - «Думай інакше»: `thinkKey`/`thinkStem` (`packages/shared/src/think.ts`), `closeStems`/`thinkHit`/`submitThinkAnswer` (`packages/engine/src/think.ts`), подія `host:think-words` (`events.ts` ~439, `socket.ts` ~1035, `manager.ts` ~2324);
> - «Більше чи менше»: схема `quiz.ts` ~646, `MoreLessEditor.tsx`, `blankMoreLessPair` (`editor/draft.ts` ~129), `reviveMoreLess` (`draft-storage.ts` ~161);
> - числове: схема `quiz.ts` ~460, `checkAnswer` (`engine/src/check.ts`), класична гілка `submitAnswer` (`game.ts` ~2150–2200), `overrideGrade` (~2789), ланцюжки `score*` у `lockNow` (~1965) і `endNow` (~2886), поле редактора `QuestionEditor.tsx` ~480;
> - бафи: `questionOff` (`buffs.ts` ~180), `noDebuffQuestion` (`debuffs.ts`);
> - i18n: найновіші списки `ADDED_VIDEOCLIP`/`ADDED_VIDEOCLIP_PLURALS` (`apps/web/src/i18n.test.ts` ~180, умова `adds no uk keys…` ~379, перевірка локалей ~356);
> - e2e-зразок: `apps/server/e2e/part36-video.e2e.ts` (320 px ~227, світла тема ~374).
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

**Мета:** три малі зміни черги 37 — (b) поле «Крок» у редакторі «Більше чи менше»; (d) вимикач «Не перебільш» у числовому запитанні; (e) новий тип запитання `thinkalike` «Думай як усі»: кожен пише одне слово на тему, бали отримує найбільша група схожих відповідей.

**Архітектура:**
- **37b** — лише редактор і необов'язкове `step` у схемі (щоб крок пам'ятався). Рушій не змінюється.
- **37d** — `numeric.noOvershoot?: boolean`. Відповідь записується тимчасово з 0 (як у «Думай інакше»), а остаточні бали ставить `scoreOvershoot` у ланцюжку `lockNow`/`endNow` (як `scoreMoreLess`): найбільші значення ≤ `correct` — повна ціна, решта — 0. Зріз `BaseView.overshoot?` на `reveal` дає сцені рядки з позначкою «перебільшили».
- **37e** — новий файл `packages/engine/src/alike.ts`: власна гілка відповіді (як `submitThinkAnswer`), групування м'яким порівнянням `thinkStem` + `closeStems` з «Думай інакше», бали в `scoreAlike` при закритті. Ручні правки ведучого на `reveal` (об'єднати / роз'єднати) пишуться в необов'язкове `Play.alike = { labels }` і одразу перераховують бали. Зрізи `BaseView.alike?` (лише `reveal`) і `HostView.alike?` (`locked` і `reveal`, з `editable`).

**Технології:** TypeScript, zod 4, vitest (проєкти `shared`/`engine`/`server`/`web`), Fastify + Socket.IO, React 19 + Vite + Testing Library, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-17-queue-37-game-design.md` — розділи 37b, 37d, 37e і «Спільні обмеження». 37a (шпигун) і 37c (ставки на дуелі) — **не в цьому плані** (плани 38, 39).

## Глобальні обмеження

- Усі тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`; довідка — `apps/web/src/help/help-uk.ts`, `help/__fixtures__/help-uk-golden.json`, `help/help-vars.ts`, `locales/*.help.json`. Нові uk-ключі — у нових списках `ADDED_MORELESS_STEP`, `ADDED_OVERSHOOT`, `ADDED_THINKALIKE`, `ADDED_THINKALIKE_PLURALS` у `apps/web/src/i18n.test.ts`; усі чотири — в умову `adds no uk keys beyond the agreed list` і в перевірку наявності в усіх локалях (як `ADDED_VIDEOCLIP*`). Назв `ADDED_37*` не брати. ru немає.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`).
- **Нічого, пов'язаного з росією**, — у прикладах, фікстурах, довідці, сіді, e2e.
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|engine|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm typecheck` (у задачах 3–5 — лише пакети, див. «Порядок збирання»). **Ніколи не запускати prettier.**
- e2e: спершу `pnpm build`, потім на передньому плані `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 37"`; кадри — з `E2E_SHOTS=1`. Телефон 320 px і світла тема — як у `part36-video.e2e.ts`.
- Таймер кожного запитання у фікстурах, сіді й e2e ≥ 25 с; типово для `thinkalike` — 30 с.
- **`GAME_STATE_VERSION` лишається 22.** У коментар до `READABLE_STATE_VERSIONS` (`restore.ts`, після рядка 36) додати: «37 без нової версії: тип thinkalike (ручні групи — у необов'язковому Play.alike), numeric.noOvershoot і moreless.step — необов'язкові поля запитань». Якщо виконавцю знадобиться обов'язкове поле стану чи зміна наявного — **зупинитися й спитати контролера** (підвищення обриває живі ігри; власника треба питати перед пушем).
- **Чужі відповіді не йдуть на телефони й сцену до `reveal`**: `BaseView.alike` і `BaseView.overshoot` з'являються лише на `reveal`; пульт бачить `alike` з `locked`.

## Рішення плану (там, де специфікація мовчить)

**37b «Крок»**
- Схема: `moreless.step: z.number().int().min(0).max(LIMITS.maxPoints).optional()` — doc «37b: крок балів редактора; рушій не читає». Рушій, зрізи, підрахунок — без змін.
- Редактор: поле «Крок» (`NumberField`) під рядом порівнянь; порожнє — `step` прибирається з запитання (не `NaN`, не 0).
- Перезаповнення `pairs[i].points = min(LIMITS.maxPoints, pairs[0].points + i × step)` — **лише** коли змінюється сам крок або бали першого порівняння при заданому кроці. Ручна правка балів 2-го і далі порівняння лишається, доки не змінять крок чи перше. Додане порівняння — `min(maxPoints, попереднє + step)` (без кроку — як зараз, `попереднє`). Перестановка й вилучення не перезаповнюють. «Однакові для всіх» (`morelessSameAll`) прибирає `step`.
- Сума понад `LIMITS.maxPoints` — наявна проблема `moreless_points` (нічого нового).

**37d «Не перебільш»**
- Схема: `numeric.noOvershoot: z.boolean().optional()`. `tolerance` зберігається як є, але при `noOvershoot: true` не діє (вимкнули — допуск повертається). Помічник `overshootOn(question: Question): boolean` у `quiz.ts`.
- **Місце — лише класичні раунди**: інакше (будь-який інший раунд, клітинка поля, питання на виживання) — `numeric_overshoot_place`; запасне з `noOvershoot` — `spare_type`. Причина: «найближчий знизу» має сенс, лише коли відповідають усі одночасно; на клітинці поля відповідає один, у бліці — черга, у фіналі — ставки.
- Бали: відповідь > `correct` (з `EPSILON`) — 0; серед решти найбільше значення (рівні в межах `EPSILON` — усі) — `round(ціна × множник раунду)`, **без бонусу швидкості**, без мінуса за правилами раунду (`penalty: 'none'`); решта — 0, `grade 'wrong'`. Від'ємні `correct` працюють так само (≤).
- Тимчасовий запис при відповіді: `accepted false, accuracy 0, grade 'wrong', points 0` (як у «Думай інакше»); остаточний — у `scoreOvershoot` при закритті (до розкриття бали й так не видно, а тимчасова «правильність» видала б, що ти нижче). `overridden` записи `scoreOvershoot` не чіпає.
- Оцінка ведучого на `reveal` — звичайна (`numeric` лишається `hostGraded`), але для `overshootOn` — без швидкості й з `penalty: 'none'`.
- Бафи й дебафи вимкнено: `questionOff` → `'off_overshoot'` (друга спроба, «Ризик», «Межі» суперечать правилу); `noDebuffQuestion` — так само.
- Зріз: `BaseView.overshoot?: OvershootRow[]` лише на `reveal` запитання з `noOvershoot`; порядок — спершу не перебільшені за значенням спадно, потім перебільшені за значенням зростанно; рівні — за порядком `state.players`.

**37e «Думай як усі» (`thinkalike`)**
- Назва типу `thinkalike`, префікс ключів `alike`. У `QUESTION_TYPES` — одразу після `'bluff'` (перед `'think'`), щоб «соціальні» типи стояли поряд у меню. `all_types` — 31.
- Запитання: `{ ...base, type: z.literal('thinkalike') }` — тема в `text`; `imageUrl`/`video`/`audio` дозволені; `reveal` → `thinkalike_reveal` (картинка, що проявляється, платить за час), `hint` → `thinkalike_hint` (бафи вимкнено).
- **Місце — лише класичні раунди** (`thinkalike_place`; у раунді `think` — `think_type`; запасне → `spare_type`). Специфікація каже «класичні раунди й поле», але на звичайній клітинці поля відповідає лише той, хто вибрав, тож група завжди з одного — балів не буває ніколи. Поле виключено; це варто сказати власнику.
- Трейти: `rounds: ['classic']`, `simple: false`, `speed: false`, `progress: false`, `hostGraded: false` (ручна оцінка → `wrong_phase`, ведучий правує групи), `teamWide: false`, бафи всі `false`, `time: minTime…maxTime`.
- Відповідь: `{ type: 'thinkalike', value }`, `value` ≤ `LIMITS.thinkWord` (40). Зведена (`/\s+/` → пробіл, обрізано); `thinkKey(value) === ''` → `think_word` (наявний текст «Слово порожнє або задовге…»). Одна спроба. Команди — пише відповідач 12g (типово капітан), як у `text`.
- **Групування** (`alikeGroups`): записи `thinkalike` у порядку `state.players`; ключ — `thinkStem(value)`; дві відповіді в одній групі, якщо `thinkClose(a, b)` = `closeStems(a, b) || closeStems(b, a)` (`closeStems` експортується з `think.ts` під назвою `thinkClose`, симетрично); групи — компоненти зв'язності (union-find), тож результат не залежить від порядку. Ключ автогрупи — id її першого учасника.
- **Ручні групи**: `Play.alike?: { labels: Record<actorId, string> }`. Перша правка «матеріалізує» поточні групи (кожному відповідачу — ключ його групи), далі:
  - `alikeJoin(from, to)` — усім з групи `from` ставить мітку `to`;
  - `alikeSplit(playerId)` — гравцеві мітку `solo:<playerId>`.
  Після кожної правки бали перераховуються одразу (`withTotals`). Лише `phase === 'reveal'` поточного запитання `thinkalike`, не в автопілоті (`not_allowed`); невідомий ключ, `from === to`, гравець без відповіді чи вже сам у групі → `alike_group`.
- **Бали**: найбільший розмір групи `max`; якщо `max ≥ 2` — кожна група розміру `max` отримує `round(ціна × множник раунду)` кожному учаснику, `grade 'correct'`; решта й порожні — 0, `grade 'wrong'`. Без швидкості, без мінуса. Тимчасовий запис при відповіді — з 0, як у 37d.
- Зрізи: `BaseView.alike?: AlikeInfo` лише на `reveal`; `HostView.alike?: HostAlike` на `locked` і `reveal` (`editable` = `reveal` і не автопілот). До `reveal` сцена показує звичайне «Відповіли: n з m».
- Сцена й телефон на `reveal`: картки груп (слова й імена), найбільші підсвічені й мають «+бали»; нижче — «Без відповіді». Пульт: те саме + на кожній групі `<select>` «Об'єднати з…» (інші групи) і на кожному імені в групі ≥ 2 — кнопка «Окремо».
- Сід: новий `apps/server/scripts/alike-quiz.ts` «Думай як усі» (див. задачу 5) — тут же демо для 37b і 37d. Досягнень під тип немає.

## Порядок збирання

- Задача 3 додає `thinkalike` у `Question`/`Answer`, і вичерпні `switch` у `apps/web` ламаються. У задачах 3–5 перевіряються лише `pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine && pnpm exec tsc -p apps/server`; з задачі 6 — `pnpm typecheck`.
- Залежності: 2 ← 1; 4 ← 3; 5 ← 2, 4; 6 ← 1, 3; 7 ← 6; 8 ← 2, 4, 6; 9 — остання.

## Фокус рев'ю

1. **Чужі відповіді до розкриття.** На `question`/`locked` у зрізах телефонів і сцени немає `alike`, `overshoot` і чужих слів чи чисел (`JSON.stringify` зрізу без «яблуко»/`85`) — задачі 2, 4 і e2e (`socketFrames`).
2. **Межі «Не перебільш».** Усі перебільшили → ніхто нічого; лише одна відповідь ≤ — вона повна; рівні дробові (`8.5` і `8.50`), від'ємне `correct` (`−40`: `−41` — ок, `−39` — перебільшили); ніхто не відповів — без помилки. Задача 2.
3. **Правки груп.** Об'єднання групи з собою, розділення одинака, вилучення гравця після правки, повтор тієї самої правки, правка після переходу далі — передбачувані помилки, бали не дублюються. Задача 4.
4. **Крок у редакторі.** Порожнє поле прибирає `step` (не `NaN`), обрізання до `maxPoints`, сума понад 2000 показує наявну проблему, ручна правка 3-го порівняння не скидається додаванням нового. Задача 7.
5. **Старі вікторини й знімки.** Вікторини без `step`/`noOvershoot` парсяться без змін; знімок з `numeric` і `moreless` без нових полів відновлюється; `GAME_STATE_VERSION === 22`. Задачі 1, 2, 4.

---

### Задача 1. Спільне: `moreless.step` і `numeric.noOvershoot`

**Files:**
- Modify: `packages/shared/src/quiz.ts` (поля схем, `overshootOn`, `numeric_overshoot_place` у `quizSchema.superRefine` поряд із `melodyPlace`, запасне з `noOvershoot` → `spare_type`), `packages/shared/src/game.ts` (`BuffWhy` + `'off_overshoot'`), `packages/shared/src/views.ts` (`OvershootRow`, `BaseView.overshoot?`).
- Test: `packages/shared/src/quiz.test.ts`

**Interfaces (Produces):**
```ts
// quiz.ts
export function overshootOn(question: Question): boolean; // type === 'numeric' && noOvershoot === true
// views.ts
/** «Не перебільш» (37d): рядок відповіді на reveal. */
export interface OvershootRow { playerId: string; nickname: string; value: number; over: boolean; points: number }
// BaseView: /** Лише reveal запитання numeric з noOvershoot (37d). */ overshoot?: OvershootRow[];
```

- [ ] **Step 1: Write the failing tests** (`quiz.test.ts`):
  - `moreless keeps an optional step` — `step: 50` парситься й лишається; без `step` — ключа немає; `step: 0` — ок; `-1`, `2001`, `12.5` → помилка.
  - `numeric keeps the no-overshoot switch` — `noOvershoot: true` з `tolerance: 5` парситься (обидва лишаються); без поля — ключа немає; `overshootOn` — `true` лише для `numeric` з `noOvershoot: true`, `false` для `text` і для `noOvershoot: false`.
  - `no overshoot plays only in classic rounds` — у `classic` ок; у `blitz`, `final`, `bets`, `auction`, `truth`, `wipeout`, `survival` (і trial), `quest`, на клітинці `board` → `numeric_overshoot_place`; той самий `numeric` без перемикача в усіх цих місцях — без цієї проблеми; запасне з `noOvershoot` → `spare_type`.
  - `old quizzes still parse` (наявний тест) — зелений.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/quiz.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану».
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 && pnpm exec tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 37b/37d — an optional points step for more-or-less, a no-overshoot switch for numeric questions only in classic rounds, overshoot rows for the reveal"
```

---

### Задача 2. Рушій: бали «Не перебільш», бафи, оцінка ведучого, зріз

**Files:**
- Create: `packages/engine/src/overshoot.ts`, `packages/engine/src/game.overshoot.test.ts`
- Modify:
  - `packages/engine/src/game.ts` — у класичній гілці `submitAnswer` після `verdictOf`: `overshootOn(asked)` → тимчасовий запис (0, `wrong`); `scoreOvershoot` у ланцюжки `lockNow` і `endNow` (поряд із `scoreMoreLess`, з рядком у коментарі над `lockNow`); `overrideGrade` — для `overshootOn(asked)` `speed` вимкнено й `penalty: 'none'`;
  - `packages/engine/src/buffs.ts` (`questionOff` → `'off_overshoot'`), `packages/engine/src/debuffs.ts` (`noDebuffQuestion`);
  - `packages/engine/src/views.ts` — `overshoot: overshootRows(state)` у зрізах сцени, телефона й пульта (ключ лише коли не `undefined`);
  - `packages/engine/src/restore.ts` — коментар (див. «Глобальні обмеження»);
  - `packages/engine/src/testing/fixtures.ts` — `overshoot` («Скільки клавіш у стандартного фортепіано?», `correct: 88`, `tolerance: 5`, `noOvershoot: true`, 30 с, 1000) і `overshootQuiz(settings?)` — класика з `overshoot`.
- Test: `game.overshoot.test.ts`, `game.buffs.test.ts`, `restore.test.ts`, `views`-тест (де тести `sliderMarks`).

**Interfaces (Produces):**
```ts
// overshoot.ts — game.ts імпортує цей файл, а він — game.ts (звертання лише під час виклику)
/** Id записів-переможців запитання: найбільші value ≤ correct (± EPSILON); [] — немає таких. Порядок state.players. */
export function overshootWinners(state: GameState, index: number): string[];
/** На question поточного запитання з noOvershoot: переписує не overridden записи (переможці — повна ціна × множник, решта — 0, wrong); інакше той самий стан. */
export function scoreOvershoot(state: GameState): GameState;
/** Лише reveal такого запитання; інакше undefined. Порядок — «Рішення плану». */
export function overshootRows(state: GameState): OvershootRow[] | undefined;
```

- [ ] **Step 1: Write the failing tests** (`game.overshoot.test.ts`; Оля, Тарас, Петро; `overshootQuiz()`, ціна 1000; класика з `speed` увімкненим — щоб перевірити, що бонусу немає):
  - `the closest from below takes the full price` — Оля 85 (на 1-й с), Тарас 90, Петро 80 (на 20-й с) → після `lock`: Оля 1000 `correct`, Тарас 0 `wrong`, Петро 0 `wrong`.
  - `an exact answer is the closest` — Оля 88, Тарас 87 → Оля 1000, Тарас 0.
  - `ties share the full price` — Оля 85, Петро 85.0, Тарас 90 → Оля 1000, Петро 1000, Тарас 0; `8.5` і `8.50` при `correct: 10` — обидва 1000.
  - `tolerance does not apply` — Тарас 90 (у межах `tolerance: 5`) → 0.
  - `everybody overshot` — 89, 90, 100 → усі 0, без помилки; ніхто не відповів → `lock` без помилки.
  - `negative numbers` — `correct: -40`: −41 і −45 → −41 повна ціна; −39 → 0.
  - `answers stay at zero until the lock` — одразу після відповіді Олі 85 запис `points 0`, `grade 'wrong'`; рахунок Олі 0.
  - `no minus and the round multiplier counts` — раунд `penalty: 'minus'`, множник 2: переможець 2000, перебільшив — 0 (не −1000).
  - `ending the game scores the open question` — `end` під час `question` → бали переможця вже в підсумку.
  - `the host override pays without speed` — на `reveal` Тарасу `correct` → 1000 рівно; `partial` за правил 50 % → 500.
  - `buffs and debuffs are off` — баф → `off_overshoot`; дебаф на це запитання не діє.
  - `the same numeric without the switch keeps tolerance` — `noOvershoot` прибрано: 90 → `partial` за наявною формулою (контроль).
  - `reveal rows mark who overshot` — на `reveal` `overshootRows` = `[Оля 85 over false 1000, Петро 80 false 0, Тарас 90 true 0]`; на `question` і `locked` ключа `overshoot` немає в зрізах сцени й телефона (`JSON.stringify` без `"overshoot"`).
  - `restore.test.ts`: `a restored room keeps a no-overshoot question` — знімок з `overshoot` на `question` читається; `GAME_STATE_VERSION === 22`.
- [ ] **Step 2: Run** `pnpm test --project engine --maxWorkers=2 packages/engine/src/game.overshoot.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test --project engine --maxWorkers=2 && pnpm exec tsc -p packages/engine`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/engine
git commit -m "feat(engine): 37d no overshoot — answers above the truth score nothing, the closest from below take the full price at lock, no speed or minus, buffs off, reveal rows mark who overshot"
```

---

### Задача 3. Спільне: тип `thinkalike` — схема, трейти, відповідь, помилки, події, зрізи

**Files:**
- Modify:
  - `packages/shared/src/quiz.ts` — гілка `thinkalike` у `questionSchema`; `superRefine` запитання: `thinkalike_reveal`, `thinkalike_hint`; `thinkalikePlace` у `quizSchema.superRefine` (вираз як у `melodyPlace`; у раунді `think` — наявне `think_type`);
  - `packages/shared/src/question-types.ts` — `'thinkalike'` після `'bluff'`; `QUESTION_TYPE_TRAITS.thinkalike` (doc «Думай як усі (37e)…»);
  - `packages/shared/src/answer.ts` — `{ type: z.literal('thinkalike'), value: z.string().max(LIMITS.thinkWord).refine(isStorable, UNSTORABLE) }`;
  - `packages/shared/src/drafts.ts` — `thinkalike` як `text`;
  - `packages/shared/src/game.ts` — `ErrorCode` + `'alike_group'`; `BuffWhy` + `'off_thinkalike'`;
  - `packages/shared/src/events.ts` — схеми й події (нижче);
  - `packages/shared/src/views.ts` — типи (нижче), `BaseView.alike?`, `HostView.alike?`;
  - `packages/shared/src/round-brief.ts` — `thinkalikes` у класиці (лише > 0);
  - `packages/shared/src/achievements.test.ts` — `all_types: 31`.
- Test: `quiz.test.ts`, `question-types.test.ts`, `answer`-тест (де `videoclip`), `facts.test.ts`, тест брифу, `achievements.test.ts`, `events`-тест (де `thinkWordsEventSchema`).

**Interfaces (Produces):**
```ts
// events.ts
export const alikeJoinSchema = z.object({ from: z.string().min(1).max(100), to: z.string().min(1).max(100) });
export const alikeSplitSchema = z.object({ playerId: z.string().min(1).max(100) });
/** «Думай як усі» (37e): об'єднати групу from з групою to; ack ok чи alike_group / wrong_phase / not_allowed. */
'host:alike-join': (payload: z.infer<typeof alikeJoinSchema>, ack: Ack) => void;
/** Винести відповідь гравця (команди) в окрему групу. */
'host:alike-split': (payload: z.infer<typeof alikeSplitSchema>, ack: Ack) => void;
// views.ts
export interface AlikeGroupView { key: string; words: string[]; members: { id: string; nickname: string }[]; top: boolean; points: number }
/** «Думай як усі» (37e): групи від більших до менших, далі за першим учасником у порядку гравців; silent — без відповіді. */
export interface AlikeInfo { groups: AlikeGroupView[]; silent: { id: string; nickname: string }[] }
export interface HostAlike extends AlikeInfo { editable: boolean }
// BaseView.alike?: AlikeInfo — лише reveal; HostView.alike?: HostAlike — locked і reveal
```

- [ ] **Step 1: Write the failing tests:**
  - `quiz.test.ts` — помічник `alikeQ(patch)` («Назвіть фрукт, який першим спадає на думку», 30 с, 1000): `accepts a thinkalike` (з картинкою — ок; `timeLimit` 25 — ок); `refuses a broken thinkalike` (`reveal` → `thinkalike_reveal`, `hint` → `thinkalike_hint`); `a thinkalike plays only in classic rounds` (класика ок; `blitz`, `final`, `bets`, `auction`, `truth`, `wipeout`, `survival`, `ladder`, `puzzles`, `quest`, клітинка `board` → `thinkalike_place`; раунд `think` → `think_type`; запасне → `spare_type`).
  - Відповідь: `answerSchema.parse({ type: 'thinkalike', value: 'яблуко' })` — ок; 41 символ → помилка.
  - `question-types.test.ts`: меню `classic` має `'thinkalike'` одразу після `'bluff'`, жодне інше меню не має; `UNGRADED_TYPES` містить `'thinkalike'` (оновити очікуваний список `!t.hostGraded`).
  - Події: `alikeJoinSchema` приймає `{ from: 'p1', to: 'solo:p2' }`, відкидає `from: ''`; `alikeSplitSchema` — так само.
  - Бриф: класика з 2 `thinkalike` → `thinkalikes: 2`; без — ключа немає. `achievements.test.ts` — 31. `facts.test.ts` — `thinkalike` без вікна відповіді особливого (як `text`).
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 && pnpm exec tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 37e thinkalike question — a theme for one word each, only in classic rounds, host join and split events, group views for the reveal"
```

---

### Задача 4. Рушій: «Думай як усі» — відповідь, групи, бали, правки ведучого, зрізи

**Files:**
- Create: `packages/engine/src/alike.ts`, `packages/engine/src/game.thinkalike.test.ts`
- Modify:
  - `packages/engine/src/think.ts` — `export function thinkClose(a: string, b: string): boolean` (симетричне `closeStems`);
  - `packages/engine/src/game.ts` — `Play.alike?: AlikePlay` (doc «Лише в запитанні thinkalike (37e) після першої правки ведучого»); у `submitAnswer` після гілки `isUnscored`: `play.question.type === 'thinkalike'` → `submitAlikeAnswer`; `scoreAlike` у ланцюжки `lockNow`/`endNow`; вилучення гравця (~1250) прибирає його ключ з `alike.labels`;
  - `packages/engine/src/buffs.ts` (`'off_thinkalike'`), `debuffs.ts`;
  - `packages/engine/src/views.ts` — `alike` у зрізах (сцена й телефон — `alikeInfo(state)`, пульт — `hostAlike(state)`);
  - `packages/engine/src/index.ts` — `export * from './alike'`;
  - `packages/engine/src/testing/fixtures.ts` — `thinkalike` (тема вище, 30 с, 1000), `thinkalike2` («Назвіть колір, який першим спадає на думку», 25 с, 500), `alikeQuiz(settings?)` — класика `[thinkalike, thinkalike2]`;
  - `packages/engine/src/testing/autopilot.ts` — `case 'thinkalike'`: боти пишуть по черзі зі списку `['яблуко', 'груша', 'яблуко', 'слива']`;
  - `packages/engine/src/schema-golden.test.ts` — рядки місць `thinkalike=…` після `bluff=…`.
- Test: `game.thinkalike.test.ts`, `restore.test.ts`, `autopilot.full.test.ts`, `game.buffs.test.ts`, `schema-golden.test.ts`.

**Interfaces (Produces):**
```ts
// game.ts
export interface AlikePlay { /** Мітка групи кожного відповідача після першої правки ведучого. */ labels: Record<string, string> }
// alike.ts
export interface AlikeGroup { key: string; ids: string[]; words: string[] /* різні написання в порядку гравців */ }
export function alikeGroups(state: GameState, index: number): AlikeGroup[];   // порядок — як AlikeInfo
export function alikeTop(groups: readonly AlikeGroup[]): string[];            // ключі груп-переможців; [] — найбільша < 2
export function submitAlikeAnswer(state: GameState, playerId: string, answer: Answer, now: number): Result;
export function scoreAlike(state: GameState): GameState;                      // на question поточного thinkalike; інакше той самий стан
export function alikeJoin(state: GameState, from: string, to: string): Result;
export function alikeSplit(state: GameState, playerId: string): Result;
export function alikeInfo(state: GameState): AlikeInfo | undefined;           // лише reveal
export function hostAlike(state: GameState): HostAlike | undefined;           // locked і reveal
```
`submitAlikeAnswer` перевіряє: гравець (`not_found`), запис (`already_answered`), час (`time_over`), тип (`type_mismatch`), слово (`think_word`) — і пише тимчасовий запис з 0, далі `autoLock`.

- [ ] **Step 1: Write the failing tests** (`game.thinkalike.test.ts`; Оля, Тарас, Петро, Ганна; `alikeQuiz()`; помічник `say(state, who, word, t)`):
  - `the biggest group takes the price` — Оля «Яблуко», Тарас «яблука», Петро «груша», Ганна «Яблуко!» → після `lock`: Оля, Тарас, Ганна по 1000 `correct`; Петро 0 `wrong`.
  - `typos join a group` — «полуниця» і «полуныця» (одна описка, 8 літер) → одна група; «банан» і «баран» → різні (коротке слово без описок).
  - `ties at the top all score` — «яблуко», «яблуко», «груша», «груша» → усі по 1000.
  - `all different scores nothing` — чотири різні слова → усі 0; один гравець відповів — 0.
  - `silence and empty words` — Петро не відповів → 0 і в `silent`; «!!!» → `think_word`, запису немає; 41 символ → `think_word`.
  - `grouping does not depend on order` — ті самі слова в іншому порядку гравців → ті самі групи (порівняти множини `ids`).
  - `one answer, no speed, no minus` — друга відповідь → `already_answered`; раунд `penalty: 'minus'`, множник 2: переможці 2000, решта 0; відповідь на 1-й і 25-й с — однакові бали; одразу після відповіді запис `points 0`.
  - `the host joins two groups on reveal` — Оля, Тарас «яблуко», Петро «груша», Ганна «слива» → Петро й Ганна 0; `alikeJoin(state, 'Петро-id', 'Ганна-id')` → дві групи по 2 → усі по 1000, рахунки оновлено (`withTotals`); повтор тієї самої правки → `alike_group` (групи `Петро-id` вже немає).
  - `the host splits a word out` — «яблуко» ×3, «груша»: `alikeSplit(Ганна)` → групи 2, 1, 1 → Оля й Тарас 1000, Ганна 0; повторний `alikeSplit(Ганна)` → `alike_group`.
  - `edit refusals` — на `question`/`locked` → `wrong_phase`; `from === to`, невідомий ключ, гравець без відповіді → `alike_group`; в автопілоті → `not_allowed`; не `thinkalike` → `wrong_phase`; ручна оцінка `override` → `wrong_phase`.
  - `a removed player leaves the groups` — після `alikeSplit` вилучити Тараса → ключа немає в `labels`, групи без нього.
  - `teams answer once by the answerer` — «Соняшники» (Оля, Тарас), «Маки» (Петро, Ганна), режим `captain`: капітан Оля пише «яблуко», Петро — «яблуко» → обидві команди по 1000; відповідь Тараса (не капітан) → та сама помилка, що дає `text` у режимі `captain`.
  - `views hide words until reveal` — на `question`/`locked` сцена й телефон без `alike` і без «Яблуко» в `JSON.stringify`; пульт на `locked` має `alike` з `editable false`; на `reveal` — `editable true`, групи `[{ words: ['Яблуко', 'яблука', 'Яблуко!'], top: true, points: 1000 }, { words: ['груша'], top: false, points: 0 }]`, `silent []`.
  - `buffs and debuffs are off` — `off_thinkalike`.
  - `restore.test.ts`: знімок з `Play.alike.labels` на `reveal` читається; `GAME_STATE_VERSION === 22`.
  - `autopilot.full.test.ts`: `alikeQuiz()` грається ботами до кінця; «яблуко» — 1000.
- [ ] **Step 2: Run** `pnpm test --project engine --maxWorkers=2 packages/engine/src/game.thinkalike.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test --project engine --maxWorkers=2 && pnpm exec tsc -p packages/engine`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/engine
git commit -m "feat(engine): 37e thinkalike — one word each grouped by soft stems, the biggest groups take the price at lock, host join and split on reveal rescore at once, groups hidden until reveal"
```

---

### Задача 5. Сервер: події правок, вичерпні `switch`, сід «Думай як усі»

**Files:**
- Modify:
  - `apps/server/src/rooms/manager.ts` — дії `{ type: 'alike-join'; from: string; to: string }`, `{ type: 'alike-split'; playerId: string }` → `alikeJoin`/`alikeSplit` (з `this.apply`);
  - `apps/server/src/socket.ts` — `on('host:alike-join')`, `on('host:alike-split')` за зразком `host:think-words` (`safeParse` → `INVALID`);
  - вичерпні `switch` за типом, які покаже `tsc` (`achievement-games.ts`, `game-achievements.ts`, `type-achievements.ts`) — `thinkalike` як `text`;
  - `all_types` у серверних тестах — 31;
  - сід-тести, що звіряють типи з `QUESTION_TYPES` (`compass`, `evening`, `family`, `family2`, `fun`, `grand`, `halloween`, `horizon`, `world`, `video`, `think` і будь-які, що впадуть): `&& t !== 'thinkalike'` з коментарем `37: новий тип, демо — у сіді alike`;
  - `apps/server/scripts/seed-demo.ts` — `alikeQuiz` з `./alike-quiz`, `'alike'` у `SEEDS`, `case 'alike'`, doc-рядок запуску.
- Create: `apps/server/src/rooms/manager.thinkalike.test.ts`, `apps/server/scripts/alike-quiz.ts`, `apps/server/scripts/alike-quiz.test.ts`
- Test: `socket.test.ts`, `history.test.ts`

**Сід `alike` — «Думай як усі».** `settings: { leaderboard: 'end', newcomers: true }`, усі таймери ≥ 25 с:
- Раунд 1, класика «Думай як усі»: 6 `thinkalike` (25–40 с, ціни 300…800, не однакові підряд). Кандидати: «Назвіть фрукт, який першим спадає на думку», «Тварина, яку діти найчастіше малюють», «Колір літа», «Страва, без якої немає святкового столу», «Місто України, куди їдуть до моря», «Що беруть із собою в похід». Повтори з іншими сідами — заборонені (перед комітом `grep -rn "<тема>" apps/server/scripts` порожній).
- Раунд 2, класика «Не перебільш»: 3 `numeric` з `noOvershoot: true` (30–40 с; 600, 1000, 800) на перевірені відомі факти; кандидати: клавіші фортепіано — 88; кістки дорослої людини — 206; висота Ейфелевої вежі з антенами — 330 м. Плюс 1 `moreless` з `step: 50` (бали 100, 150, 200, 250, сума = `points`) — порівняння неросійських фактів (площа, висота гір, роки), кожен факт перевірити.
- Якість (пам'ять власника): відповіді немає в тексті; без повторів; «так/ні» не стосується.

- [ ] **Step 1: Write the failing tests:**
  - `manager.thinkalike.test.ts` (`alikeQuiz()`): `answers through the socket and scores at lock` — `player:answer { type: 'thinkalike', value: 'яблуко' }` від Олі й Тараса, Петро «груша» → після кінця часу історія: 1000, 1000, 0; `host joins and splits on reveal` — `host:alike-split { playerId: Тарас }` → `{ ok: true }`, сцена отримала зріз з 3 групами й 0 у Олі; `host:alike-join` назад → 1000; на `question` → `wrong_phase`; погане тіло → `invalid`; `a restored room keeps the host groups` — після `restart` зріз пульта має ті самі групи.
  - `history.test.ts`: `{ type: 'thinkalike', value: 'яблуко' }` з 1000 читається.
  - `alike-quiz.test.ts` (за зразком `video-quiz.test.ts`, той самий `BANNED`): `passes the quiz schema and starts the autopilot` (`autopilotCheck(quiz).blocked` = `[]`); `round one is thinkalike only` (6); `round two has no-overshoot numerics and a stepped more-or-less` (`step 50`, бали `[100, 150, 200, 250]`); `timers are at least 25 seconds`; `points follow difficulty`; `no answer leaks into the text`; `nothing about russia`.
  - Сід-тести: `pnpm test --project server --maxWorkers=2 apps/server/scripts` зелені.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/rooms/manager.thinkalike.test.ts apps/server/src/history.test.ts apps/server/scripts/alike-quiz.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server
git commit -m "feat(server): 37e host join and split events for thinkalike groups; a «Думай як усі» seed with no-overshoot numerics and a stepped more-or-less; other seeds skip the new type"
```

---

### Задача 6. Веб: тексти, довідка, формат, бриф

**Files:**
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts`, `apps/web/src/locales/{en,de,es,it,pl,ar}.json`; `help/help-uk.ts` (`question.thinkalike.*`: `title`, `what`, `how.0…2`, `points.0…1`, `tip.0…1`, `limits.0…1`; у наявні сторінки `question.numeric` і `question.moreless` — по пункту про «Не перебільш» і «Крок»), `help/__fixtures__/help-uk-golden.json`, `locales/*.help.json`; `format.ts` (`correctText`: `thinkalike` → `alikeCorrect`; `numeric` з `noOvershoot` → `«{correct} (не більше)»` через `overshootCorrect`; `answerText`: `thinkalike` → `value`); `live-drafts.ts`, `admin/admin-text.ts` (як `text`); `guide-text.ts` (`TYPE_ICONS.thinkalike = '🤝'`); `round-summary.ts` (`summaryAlikes_*` з `brief.thinkalikes`); `screens/AnswerInput.tsx` (`thinkalike` як `text`, `maxLength` `LIMITS.thinkWord`).
- Вичерпні `switch`, які покаже `pnpm typecheck`, — тут; `QuestionEditor`/`PlayerScreen`/`StageScreen`/`HostScreen` тимчасово отримують мінімальні гілки (`thinkalike` як `text`, з `// 37: задачі 7–8`).
- Test: `i18n.test.ts`, `help/*.test.ts`, `format.test.ts`, `round-summary.test.ts`.

**Ключі** (uk; інші 6 мов — переклади):
- `ADDED_MORELESS_STEP`: `morelessStep` «Крок», `morelessStepHint` «Задайте крок — бали підуть по наростаючій: перше, перше + крок… Кожне можна змінити вручну.»
- `ADDED_OVERSHOOT`: `overshootLabel` «Не перебільш», `overshootHint` «Більше за правильну — 0. Усю ціну отримують найближчі знизу; точна — найближча. Допуск не діє.», `overshootCorrect` «{correct} (не більше)», `overshootOver` «перебільшили», `overshootRowsTitle` «Хто ближче знизу», `buffWhy_off_overshoot`, `problemOvershootPlace` «„Не перебільш“ — лише в класичному раунді».
- `ADDED_THINKALIKE`: `type_thinkalike` «Думай як усі», `typeShort_thinkalike` «Як усі», `typeHow_thinkalike` «Напишіть одне слово на тему. Бали отримають ті, чиє слово збіглося з найбільшою групою.», `buffWhy_off_thinkalike`, `err_alike_group` «Цю групу вже змінено. Оновіть і спробуйте ще раз.», `problemAlikePlace`, `alikeDefaultText` «Назвіть фрукт, який першим спадає на думку», `alikeEditorHint` «Тема — у тексті запитання. Схожі слова програма об'єднає сама; на розкритті ви зможете виправити групи.», `alikePhoneHint` «Напишіть те, що напише більшість», `alikeCorrect` «Найбільша група», `alikeGroupsTitle` «Групи слів», `alikeTop` «Найбільша», `alikeSilent` «Без відповіді», `alikeNobody` «Усі слова різні — балів немає», `alikeJoin` «Об'єднати з…», `alikeSplit` «Окремо», `alikeManual` «Групи змінив ведучий», `summaryAlikes_one` «{count} «Думай як усі»: бали отримує найбільша група однакових слів».
- `ADDED_THINKALIKE_PLURALS`: `summaryAlikes_few`, `summaryAlikes_many`.

- [ ] **Step 1: Write the failing tests:** `i18n.test.ts` — чотири нові списки в усіх 7 мовах і в умові `adds no uk keys…`; сторінка `question.thinkalike` є в усіх `*.help.json`; `format.test.ts` — `correctText` числового з `noOvershoot` → «88 (не більше)», без нього — «88 (± 5)» (контроль); `answerText({ type: 'thinkalike', value: 'яблуко' })` → «яблуко»; `round-summary.test.ts` — «2 «Думай як усі»: …».
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/i18n.test.ts apps/web/src/help apps/web/src/format.test.ts apps/web/src/round-summary.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 37 texts and help in seven languages — more-or-less step, no overshoot, thinkalike; answer format and round summary"
```

---

### Задача 7. Веб: редактори — крок, «Не перебільш», `thinkalike`

**Files:**
- Modify:
  - `apps/web/src/editor/MoreLessEditor.tsx` — поле «Крок» і правила перезаповнення («Рішення плану»);
  - `apps/web/src/editor/draft.ts` — `steppedPoints(first: number, step: number, count: number): number[]` (кожне `min(LIMITS.maxPoints, first + i × step)`); `newQuestion('thinkalike')` (`alikeDefaultText`, 30 с, `LIMITS.defaultPoints`); `Place.thinkalike` (лише класика); `problemKey`: `problemAlikePlace`, `problemOvershootPlace` (числове з `noOvershoot` поза класикою); перетворення `text` → `thinkalike` зберігає `text`;
  - `apps/web/src/editor/draft-storage.ts` — `reviveMoreLess`: `step` — ціле `0…maxPoints`, інакше без ключа; `numeric`: `noOvershoot` — лише `true` лишається; `reviveThinkalike` — лише `base` без `reveal`/`hint`;
  - `apps/web/src/editor/QuestionEditor.tsx` — `case 'numeric'`: перемикач «Не перебільш» (`<label className="check">` з `checkbox`), при увімкненому — поле `tolerance` і `toleranceHint` сховані, показано `overshootHint`; вимкнення прибирає ключ `noOvershoot`; `case 'thinkalike'` → лише `alikeEditorHint` (без підказки й «перевертання», як `melody`).
- Test: `MoreLessEditor.test.tsx`, `QuestionEditor.test.tsx`, `draft.test.ts`, `type-menu.test.ts`, тест `draft-storage`.

- [ ] **Step 1: Write the failing tests:**
  - `MoreLessEditor.test.tsx`:
    - `a step fills the points upward` — 3 порівняння по 100, «Крок» 50 → `[100, 150, 200]`, `step 50`, `points 450`;
    - `the first pair moves the ladder` — далі перше 200 → `[200, 250, 300]`;
    - `manual points stay until the step changes` — 3-є вручну 500 → `[200, 250, 500]`; «Додати порівняння» → 4-те 550 і 3-є лишилося 500; крок 10 → `[200, 210, 220, 230]`;
    - `an empty step clears it` — поле очищено → у `onChange` немає ключа `step`, бали не змінились;
    - `points are capped` — перше 1900, крок 200, 2 порівняння → `[1900, 2000]`;
    - `same for all clears the step` — «Однакові для всіх» → без `step`.
  - `QuestionEditor.test.tsx`: `no overshoot hides tolerance` — перемикач «Не перебільш» → `noOvershoot: true`, поля «Допуск» немає, є `overshootHint`; вимкнення → ключа немає, поле «Допуск» зі старим значенням 5; `thinkalike shows only the theme hint`.
  - `draft.test.ts`/`type-menu.test.ts`: `thinkalike` лише в меню `classic` одразу після `bluff`; нове — 30 с, текст «Назвіть фрукт…»; у бліці → `problemAlikePlace`; числове з `noOvershoot` у бліці → `problemOvershootPlace`; `steppedPoints(100, 50, 3)` = `[100, 150, 200]`, `steppedPoints(1950, 100, 2)` = `[1950, 2000]`.
  - `draft-storage`: `step: 'x'` → без ключа; `step: 3000` → без ключа; `noOvershoot: 'yes'` → без ключа; `thinkalike` з `hint` → без `hint`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/editor`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 37 editors — a points step for more-or-less, a no-overshoot switch that hides tolerance, the thinkalike question in classic rounds"
```

---

### Задача 8. Веб: телефон, сцена, пульт — групи й «перебільшили»

**Files:**
- Create: `apps/web/src/screens/AlikeView.tsx`, `apps/web/src/screens/AlikeView.test.tsx`, `apps/web/src/screens/OvershootRows.tsx`, `apps/web/src/screens/OvershootRows.test.tsx`
- Modify:
  - `apps/web/src/screens/PlayerScreen.tsx` — `thinkalike`: `AnswerInput` + `alikePhoneHint`; на `reveal` — `AlikeGroups` (своя група виділена); числове з `view.overshoot` — свій рядок «перебільшили», якщо `over`;
  - `apps/web/src/screens/StageScreen.tsx` — на `reveal`: `view.alike` → `AlikeGroups`; `view.overshoot` → `OvershootRows` (поряд із блоком `SliderScale` ~607);
  - `apps/web/src/screens/HostScreen.tsx` — `view.alike` → `AlikeGroups host` з `onJoin`/`onSplit` (`send('host:alike-join' | 'host:alike-split', …)`; відмова — текст помилки); `view.overshoot` → `OvershootRows`;
  - `apps/web/src/screens/LiveAnswers.tsx` — `thinkalike` як `text` (без вердикту до `reveal`);
  - `apps/web/src/styles.css` — `.alike-groups` (сітка карток, `minmax(0, 1fr)`, перенос довгих слів `overflow-wrap: anywhere`), `.alike-top`, `.overshoot-over`; кольори — змінні теми (світла тема).
- Test: `AlikeView.test.tsx`, `OvershootRows.test.tsx`, `StageScreen.test.tsx`, `HostScreen.test.tsx`, `PlayerScreen.test.tsx`.

**Interfaces (Produces):**
```ts
// AlikeView.tsx
export function AlikeGroups(props: { info: AlikeInfo; mine?: string /* id свого учасника */; host?: { editable: boolean; onJoin(from: string, to: string): void; onSplit(playerId: string): void } }): JSX.Element;
// OvershootRows.tsx
export function OvershootRows(props: { rows: readonly OvershootRow[]; correct: number }): JSX.Element;
```

- [ ] **Step 1: Write the failing tests:**
  - `AlikeView.test.tsx`: `groups go from the biggest` — дві групи: перша з `alike-top`, «Найбільша», «+1000», імена; `nobody scores when all differ` — без `top` → «Усі слова різні — балів немає»; `silent players are listed`; `the host joins and splits` — `<select>` «Об'єднати з…» на групі «груша» → `onJoin('p3', 'p1')`; «Окремо» біля Тараса → `onSplit('p2')`; на одинаку «Окремо» немає; `editable false` — жодних керувань; `long words wrap at 320 px` — 40-символьне слово не дає ширини > контейнера.
  - `OvershootRows.test.tsx`: `marks who overshot` — рядки «Оля 85 +1000», «Петро 80 0», «Тарас 90 перебільшили» з `.overshoot-over`.
  - `StageScreen.test.tsx`: на `reveal` `thinkalike` — групи; на `question` — немає `.alike-groups` і слів; числове з `overshoot` — рядки під правильною відповіддю «88 (не більше)».
  - `HostScreen.test.tsx`: `the host edits groups` — `send('host:alike-split', { playerId: 'p2' })`; на `locked` групи видно без керувань.
  - `PlayerScreen.test.tsx`: `thinkalike phone` — поле з `maxLength 40` і підказкою; `reveal` — своя група виділена; `own overshoot` — «перебільшили» у власному рядку.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/screens`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 37 screens — thinkalike word groups on the reveal with host join and split, who overshot on the stage, host and phone"
```

---

### Задача 9. Наскрізні сценарії й кадри (`part37-step-overshoot-alike.e2e.ts`)

**Files:**
- Create: `apps/server/e2e/part37-step-overshoot-alike.e2e.ts` (структура `it(… try/catch snapshot …, 600_000)`, `useE2eServer()`, помічники `open`, `join`, `expectNoSideScroll`, `socketFrames`, `shot`, `restart` — як у `part36-video.e2e.ts`).

**Сценарії** (таймери ≥ 25 с):
1. `it('part 37: editor — a more-or-less step fills points upward and keeps manual ones, no overshoot hides tolerance, thinkalike only in classic rounds')`:
   - «Більше чи менше» з 3 порівняннями: перше 100, «Крок» 50 → 100/150/200; 3-є вручну 500; «Додати порівняння» → 550; сума «1300»; збережене запитання має `step: 50`; повторне відкриття показує «Крок» 50;
   - числове: «Не перебільш» ховає «Допуск», збережено `noOvershoot: true`; у бліці той самий перемикач дає проблему «„Не перебільш“ — лише в класичному раунді»;
   - «Думай як усі» є в меню класики й немає в бліці; кадр `step37-editor`.
2. `it('part 37: thinkalike and no overshoot — the biggest group scores, the host splits and joins, the closest from below wins, nothing leaks before reveal, 320 px, light theme')`:
   - класика: `thinkalike` «Назвіть фрукт…» (30 с, 1000), `numeric` «Скільки клавіш у фортепіано?» `correct 88`, `noOvershoot` (30 с, 1000); 3 телефони: Оля 320 × 640, Тарас 375, Петро 360;
   - Оля «Яблуко», Тарас «яблука», Петро «груша»; до `reveal` у `socketFrames` телефонів і сцени й у DOM сцени немає «яблука»/«груша»; кадр `alike37-phone-320`, `expectNoSideScroll(olya, …)`;
   - `reveal`: сцена — дві групи, «Найбільша» з Олею й Тарасом, «+1000»; історія: 1000, 1000, 0; пульт «Окремо» біля Тараса → сцена «Усі слова різні — балів немає», Оля 0; «Об'єднати з…» назад → 1000; кадри `alike37-stage`, `alike37-host`;
   - числове: Оля 85, Тарас 90, Петро 80 → бали 1000, 0, 0; сцена — «88 (не більше)», рядок Тараса «перебільшили»; телефон Тараса — «перебільшили»; кадр `overshoot37-stage`;
   - **світла тема** (як `part36-video.e2e.ts` ~374): `quiz:theme = light` на сцені й в Олі, `is-light` на `<html>`; кадри `alike37-light-stage`, `overshoot37-light-phone-320`; `expectNoSideScroll(olya, …)` у світлій темі; підсвітка найбільшої групи й «перебільшили» мають видимий контраст (колір тексту ≠ фону).
3. `it('part 37: thinkalike in teams — the captain writes, a restart keeps host groups, 320 px')` — 2 команди по 2, `captain`; телефон не-капітана 320 px — поле неактивне з наявним текстом відповідача; обидва капітани «груша» → по 1000; пульт «Окремо» → `restart()` → групи пульта ті самі; кадр `alike37-teams-phone`.

- [ ] **Step 1: Write the scenarios.**
- [ ] **Step 2: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 37"` (з `E2E_SHOTS=1`). Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 3: Переглянути кадри:** на 320 px картки груп і рядки «перебільшили» без горизонтального скролу, довгі слова переносяться; на сцені 1600×900 групи не вилазять; світла тема читається.
- [ ] **Step 4: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 37 — a more-or-less step in the editor, no overshoot hiding tolerance, thinkalike groups with host split and join, the closest from below, nothing before reveal, 320 px, light theme, teams and a restart"
```
