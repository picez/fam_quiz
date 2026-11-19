# План 52: «Правда про гравця» — вигадані факти ведучого (41c)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** Усе нове в стані — необов'язкове: `TruthState.fakes?` (вигадки ведучого), `TruthPlay.fake?` (запитання з вигадки); у колоді `TruthState.deck` з'являються id вигадок (`fake-N`) поруч з id людей. Старий знімок не має ні `fakes`, ні id `fake-…` у колоді — раунд грається як до плану (без варіанта «Вигадка»: він з'являється лише тоді, коли в роздачі є вигадка). У вікторині — необов'язкове `TruthRound.fakes?`. Якщо виконавцю знадобиться обов'язкове поле стану чи зміна значення наявного — **зупинитися й спитати контролера** (підвищення обриває живі ігри; власника питають перед пушем).

> **Звірка з кодом.** План спирається на `main` 2026-11-19 (`5706443d`, після плану 50 і специфікацій 41b/41c). План 51 («Думай інакше», `.superpowers/worktrees/plan51`) іде паралельно й раунду truth не торкається; спільні місця — лише рядок-коментар у `restore.ts` і списки `ADDED_*` у `i18n.test.ts` (при злитті — дописати обидва рядки):
> - спільне: `packages/shared/src/truth.ts` (`TRUTH_QUESTION_PREFIX`, `truthText`), `truthRoundSchema` (`packages/shared/src/quiz.ts` ~1410; `LIMITS.truthText: 200` ~27), події `truthFactSchema`/`truthHideSchema` (`events.ts` ~247/261, `'player:truth'` ~378, `'host:truth-hide'` ~463), коди помилок (`game.ts` ~203 `truth_closed`, `truth_own`, `truth_text`), зрізи `TruthInfo`/`TruthCard`/`TruthRecap`/`HostTruth`/`PlayerTruth` (`views.ts` ~1305–1370), історія `GameQuestionResult.truth` (`history.ts` ~165);
> - рушій: `packages/engine/src/truth.ts` (`truthOpen`, `submitTruth`, `hideTruth`, `dealTruth`, `truthQuestion` — згенероване `single` з варіантами-іменами й `correctId: authorId`, `nextTruthQuestion`, `truthHeld`, `truthCount`, `truthPlayFor`, `withTruthPoints` — частка автора), типи `TruthState`/`TruthFact`/`TruthPlay` (`game.ts` ~757–782), `createGame` (~1155: `truth: { facts: {} }`), `submitAnswer` (~2160); зрізи `packages/engine/src/views.ts` ~1264–1425 (`truthCard`, `truthReveal`, `truthRecap`, `truthInfo`, `publicState` — held-маска, `hostTruth`, `playerTruth`) і `base` (~3215: `playerCount` ~3245 = `truthGuessers(state).length`, `answeredCount` ~3550); `restore.ts` ~79–96 (коментар версій, останній рядок `50 без нової версії…`); автопілот гри `autopilot.ts` (`createAutopilotGame`; у грі без ведучого гравці — `hostSide`, `apps/server/src/socket.ts` ~544); фікстура `truthRound(id, options)` (`testing/fixtures.ts` ~843, ціна 300, 30 с);
> - сервер: `rooms/manager.ts` (`HostAction` ~435 `'truth-hide'`, `case 'truth-hide'` ~2518, `truthPassed` ~571, `RateKind 'truth'` ~461, `HOST_RATE_ID` ~194), `socket.ts` (~877 `player:truth`, ~1071 `host:truth-hide`), `recorder.ts` (`truthRef` ~222), `db/schema.ts` (`PlayRef.truth` ~165), `history.ts` (`truthResult` ~148), `round-achievements.ts` ~69 (`mind_reader`, `dark_horse`); тести `rooms/manager.lobby.test.ts` ~94 (`player truth facts (28b)`), `history.test.ts` ~340;
> - веб: `screens/TruthView.tsx` (`TruthFactForm`, `HostTruthFacts`, `TruthNames`, `TruthPick`, `TruthOwn`, `TruthStage` — лічильник «Відповіли» ~239, `TruthReveal`, `TruthRecapView`, `TruthRecapFold`, `TruthHeldPick`), `HostScreen.tsx` (~142 текст правильної відповіді, ~530 `truthActor`, ~799 «Автор: …», ~1606 `HostTruthFacts`), `PlayerScreen.tsx` (~941–963, ~1355–1365, ~1519–1526, ~1693–1699), `StageScreen.tsx` (~1085), `pages/GameHistory.tsx` (`truthLine` ~264, рядок автора ~581), редактор `editor/RoundSettings.tsx` ~181 (ціна й час раунду truth), `editor/draft.ts` (`newTruthRound` ~832, чистка раунду, `truthNumbersBroken` ~1721), `editor/draft-storage.ts` ~586/637;
> - тексти: uk-ключі `truth*` (`apps/web/src/i18n.ts` ~3052–3109), найновіший список — `ADDED_SPY_50` (`i18n.test.ts` ~187, перевірка локалей ~409–413, умова `adds no uk keys beyond the agreed list` ~604); довідка `round.truth.*` (`help/help-uk.ts` ~182–193), `help/__fixtures__/help-uk-golden.json`, `help/help-vars.ts` (`LIMIT_KEYS`), `locales/*.help.json`;
> - тести-зразки: `packages/engine/src/game.truth.test.ts`, `game.truth-lobby.test.ts`, `views.truth.test.ts` (зокрема `nobody but the host and the author knows whose fact it is` ~95 — перевірка `playerCount`); e2e `apps/server/e2e/part28a-c-moreless-truth-drawing.e2e.ts` (`truthGame28b` ~588, сценарії `part 28b` ~457–475).
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

**Мета:** у раунді «Правда про гравця» ведучий додає вигадані факти (у лобі; заготовлені — до 5 у редакторі; без ведучого граються лише заготовлені); у кожному запитанні раунду з вигадками є варіант «Вигадка»; вигадку вгадує той, хто вибрав «Вигадка» (ціна запитання), справжній факт з вибором «Вигадка» — неправильна відповідь (автору — частка, як зараз); розкриття «Це вигадка ведучого»; сцена й телефони до розкриття не знають, яке запитання вигадане, пульт бачить позначку.

**Архітектура:** вигадка — ще один запис колоди. `TruthState.fakes?` тримає тексти (заготовлені копіюються з вікторини в `createGame`), `dealTruth` домішує до id авторів id вигадок (не більше, ніж справжніх фактів) і перемішує тим самим `rng`; `truthQuestion` для вигадки дає те саме `single`, але `correctId` — службовий варіант `fake`, що стоїть останнім у кожному запитанні роздачі з вигадками. Бали — звичайна оцінка `single` (вибрав «Вигадка» на вигадці — ціна), частки автора немає (автора серед гравців немає). Зрізи сцени й телефонів не мають жодної ознаки окремого запитання: id вигадки й `fake` — лише в розкритті/підсумку (вже під held-маскою) і в пульті; лічильник «Відповіли N з M» у раунді з вигадками сцені й телефонам не показується (знаменник видав би вигадку).

**Технології:** TypeScript, zod 4, vitest (проєкти `shared`/`engine`/`server`/`web`), Fastify + Socket.IO, React 19 + Vite + Testing Library, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-19-truth-fake-facts-design.md` (41c); основа — `docs/superpowers/specs/2026-11-10-player-truth-design.md`, план `docs/superpowers/plans/2026-11-10-plan-28b-player-truth.md`.

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22.** У коментар до `READABLE_STATE_VERSIONS` (`restore.ts`, після рядка `50 без нової версії…`; якщо план 51 уже додав свій рядок — після нього) додати: «52 без нової версії: truth — необов'язкові GameState.truth.fakes і Play.truth.fake, id вигадок fake-N у колоді; старий знімок їх не має — раунд без варіанта «Вигадка», як до 52».
- Усі тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`; довідка — `help/help-uk.ts`, `help/__fixtures__/help-uk-golden.json`, `help/help-vars.ts`, `locales/*.help.json`. Нові uk-ключі — у новому списку `ADDED_TRUTH_52` (`i18n.test.ts`) — в умову `adds no uk keys beyond the agreed list` і в перевірку наявності в усіх локалях (як `ADDED_SPY_50`). ru немає.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`).
- **Нічого, пов'язаного з росією**, — у прикладах, фікстурах, довідці, e2e (тексти вигадок — нейтральні: хобі, подорожі, вміння).
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|engine|server|web> --maxWorkers=2 [шляхи]`; типи — у задачах 1–4 `pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine && pnpm exec tsc -p apps/server`, з задачі 6 — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів vitest).
- Файли правити лише Edit/Write чи `sed`; **python3 на цій машині — порожня заглушка, ним нічого не правити й не генерувати**; після коміту перевірити `git show --stat`.
- Робоче дерево — лише в `C:\ClaudeCode\quiz\.superpowers\worktrees\plan52`; жодних файлів поза `C:\ClaudeCode\quiz`. Дерево `plan51` не чіпати.
- Таймер кожного запитання у фікстурах і e2e ≥ 25 с (`truthRound` — 30 с).
- e2e: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 52"`; телефон 360 px, світла тема; після — окремо `-t "part 28b"`.
- **Таємниця:** до розкриття, яке бачить зал (для сцени й телефонів — підсумок раунду, бо раунд truth held), у кадрах сцени й телефонів немає ні `"fake":true`, ні id `fake-N`, ні текстів вигадок поза текстом поточного запитання; варіанти запитання з вигадкою й зі справжнім фактом однакові за складом і порядком; `playerCount`/`answeredCount` на `question`/`locked` раунду з вигадками однакові для обох видів запитань. Пульт бачить усе.

## Рішення плану (там, де специфікація мовчить)

**Спільне (`packages/shared`)**
- `LIMITS.truthPresetFakes = 5` (заготовлені в редакторі), `LIMITS.truthFakes = 10` (технічна стеля разом із заготовленими в лобі — захист від спаму; «не більше, ніж справжніх» діє на роздачі).
- `truth.ts`: `TRUTH_FAKE_PREFIX = 'fake-'` (id вигадок `fake-1`, `fake-2`, …; id людей — UUID, тож не перетинаються), `TRUTH_FAKE_OPTION = 'fake'` (id варіанта «Вигадка»), `TRUTH_FAKE_TEXT = 'Вигадка'` (текст варіанта в стані й журналі; веб показує перекладений за id), `isTruthFake(id: string): boolean`.
- `truthRoundSchema.fakes: z.array(z.string().trim().min(1).max(LIMITS.truthText).refine(isStorable, UNSTORABLE)).max(LIMITS.truthPresetFakes).optional()` — doc «Заготовлені вигадки ведучого (41c); у грі копіюються в state.truth.fakes».
- Подія `'host:truth-fake'` з `truthFakeSchema = z.object({ id: z.string().min(1).max(40).nullable(), text: z.string().max(LIMITS.truthText * 2).refine(isStorable, UNSTORABLE) })`: `id: null` + текст — додати; `id` + текст — змінити; `id` + `''` — прибрати.
- Код помилки `'truth_fakes_full'`.
- Зрізи:
  - `TruthInfo.fakes?: true` — «у роздачі є вигадки ведучого (у кожному запитанні є варіант «Вигадка»); ключ лише тоді. Не каже, яке запитання — вигадка.»
  - `TruthCard.fake?: true` — вигадка; тоді `author: { id: 'fake-N', nickname: '' }`, `points: 0`.
  - `HostTruth.fakes: { id: string; text: string; preset: boolean; played: boolean; inDeck: boolean }[]` (до роздачі `inDeck` — вигадка зіграється: серед перших `min(вигадок, нехованих справжніх)`; після — є в колоді); `HostTruth.author: { id: string; nickname: string; fake?: true } | null`.
  - `GameQuestionResult.truth.fake?: true` (`history.ts`); `PlayRef.truth.fake?: true` (`apps/server/src/db/schema.ts`).

**Рушій**
- `TruthState.fakes?: TruthFake[]`, `interface TruthFake { id: string; text: string; preset?: true }`; `TruthPlay.fake?: true`.
- `createGame`: `truth: { facts: {}, ...(fakes.length > 0 ? { fakes: fakes.map((text, i) => ({ id: \`fake-${i + 1}\`, text: truthText(text), preset: true })) } : {}) }`, де `fakes` — `fakes` першого (єдиного) раунду truth.
- `setTruthFake(state, id: string | null, raw: string): Result` (`truth.ts`): `truth_closed` — `!truthOpen(state)`; `not_allowed` — `state.autopilot !== undefined` (у грі без ведучого події ведучого шлють гравці — їм вигадки недоступні); `truth_text` — довше `LIMITS.truthText` чи `!isStorable`; додавання: `''` → `ok(state)` без змін, `fakes.length >= LIMITS.truthFakes` → `truth_fakes_full`, новий id — `fake-${1 + max(N)}`; зміна: невідомий id → `not_found`, той самий текст → без змін, інакше новий текст (позначка `preset` знімається); прибирання — фільтр. Порядок списку — порядок додавання (заготовлені перші).
- `dealTruth`: `authors` як зараз; `authors.length === 0` → `deck: []` (раунд пропускається, вигадки не грають); інакше `const fakes = (truth.fakes ?? []).slice(0, authors.length).map((f) => f.id)`; `deck = shuffle(fakes.length === 0 ? authors : [...authors, ...fakes], rng)` — без вигадок виклик той самий, що зараз (наявні тести порядку не міняються).
- `truthFaked(state): boolean` — `state.truth?.deck?.some(isTruthFake) === true`.
- `truthQuestion(state, k)`: запис колоди `fake-N` → вигадка зі `state.truth.fakes` (немає — `null`); варіанти — люди за нікнеймом, як зараз, плюс `{ id: TRUTH_FAKE_OPTION, text: TRUTH_FAKE_TEXT }` **останнім у кожному запитанні**, якщо `truthFaked(state)`; `correctId` — `TRUTH_FAKE_OPTION` для вигадки, інакше `authorId`.
- `truthPlayFor`: вигадка (запис колоди `deck[k]`, де `k` — номер з `question.id`) → `{ authorId: 'fake-N', actorId: 'fake-N', guessers: усі присутні, fake: true }`. `actorId` не збігається з жодним гравцем — тож `submitAnswer` (`truth_own`), `truthGuessers`, `withTruthPoints` (частки немає: `!present.has(actorId)`), `publicState` працюють без змін.
- `truthCount` до роздачі — **лише справжні факти** (як зараз: «Фактів: N» у лобі не видає вигадок); після роздачі — колода разом з вигадками («Факт k з n»).
- `hideTruth`, `submitTruth`, `dropTruthFacts`, `truthHeld`, `truthOpen` — без змін.

**Зрізи (`views.ts`)**
- `truthInfo`: `...(truthFaked(state) ? { fakes: true as const } : {})`.
- `truthCard`: вигадка (`play.truth.fake`) → `author: { id: play.truth.authorId, nickname: '' }`, `fake: true`, `points: 0`; `picks` — як зараз (`picked` для варіанта «Вигадка» — `TRUTH_FAKE_TEXT`, веб перекладає за `pickedId`).
- `base(state, forHost)`: на `question`/`locked` запитання truth, якщо `!forHost && truthFaked(state)`, — `playerCount: 0`, `answeredCount: 0` (вгадують N на вигадці й N − 1 на справжньому — знаменник видав би вигадку); ведучий бачить справжні числа.
- `hostTruth`: `fakes` (поле завжди, `[]` без вигадок), `author` вигадки — `{ id, nickname: '', fake: true }`.
- `playerTruth` — без змін (`own` на вигадці ні в кого).

**Сервер**
- `HostAction` `{ type: 'truth-fake'; id: string | null; text: string }`; `case 'truth-fake'`: `truthPassed(room)` → `truth_closed`; ліміт `rateAllowed(room, 'truth', HOST_RATE_ID, now)` → `too_soon`; далі `setTruthFake`.
- `socket.ts`: `on('host:truth-fake')` — `hostSide`, `truthFakeSchema`, `run({ type: 'truth-fake', ...payload.data })`.
- `recorder.truthRef`: вигадка → `authorName: ''`, `fake: true`; `history.truthResult` → `{ author: '', points: 0, fake: true }`.
- `round-achievements.ts`: `mind_reader` рахує лише справжні факти (`q.ref.truth.fake !== true`) — «знаю вас як облуплених» про людей; `dark_horse` — без змін (автор вигадки не людина).

**Веб**
- `truthChoiceText(choice: { id: string; text: string }): string` (`TruthView.tsx`) — `choice.id === TRUTH_FAKE_OPTION ? t('truthFakeOption') : choice.text`; ним показуються варіанти в `TruthPick`, `TruthNames`, `TruthStage`, `TruthHeldPick`, вибори в `TruthReveal`/`TruthRecapView` (за `pickedId`) і текст правильної відповіді на пульті (`HostScreen.tsx` ~142). Варіант «Вигадка» на телефоні — та сама кнопка, що й імена (без іншого кольору), — щоб і вигляд не різнився.
- `TruthStage`: лічильник «Відповіли N з M» не показується, якщо `truth.fakes === true`; так само будь-який «Відповіли» телефона на запитанні truth.
- `TruthReveal` на вигадці: великим «Це вигадка ведучого», рядка «Автор: …» немає; `TruthRecapView`: картка вигадки — рядок автора «Вигадка ведучого» (клас `is-fake`), бали автора не показуються.
- Пульт: на `question`/`locked` замість «Автор: {nickname}» — тег `.tag.truth-fake-mark` «вигадка» і рядок «Вигадка ведучого — правильна відповідь «Вигадка»»; у рядках відповідей (HostScreen ~1421) рядка автора для вигадки немає.
- Лобі ведучого: нова панель `HostTruthFakes({ truth, send, onError })` під `HostTruthFacts` (там само, де `truthFacts`), лише поки `truth.open`: заголовок «Вигадані факти», пояснення, список (текст, тег «з редактора» для `preset`, тег «не зіграється» для `!inDeck`, «Змінити» → поле з «Зберегти», «Прибрати»), поле `maxLength={LIMITS.truthText}` з лічильником `truthFactCount` і кнопка «Додати вигаданий факт»; якщо вигадок більше, ніж нехованих справжніх фактів, — `role="status"` «Вигадок більше, ніж фактів гравців: зіграються лише перші {count}.»; в автопілоті панелі немає (там і ведучого немає).
- Редактор (`RoundSettings`, раунд truth): «Заготовлені вигадки (необов'язково)» — до 5 полів `maxLength={LIMITS.truthText}`, «Додати вигадку» (ховається на 5), «Прибрати» біля кожного; пояснення. Чистка (`draft.ts`) — обрізати, порожні відкинути, порожній список → ключа `fakes` немає. `draft-storage.ts` — `fakes` лише масив рядків, інакше ключа немає.
- Історія (`GameHistory.tsx`): `truthLine` вигадки → «Вигадка ведучого»; рядка автора немає.

## Порядок збирання

- Порядок: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Залежності: 2 ← 1; 3 ← 2; 4 ← 2, 3; 5 — незалежна від 2–4 (лише ключі); 6 ← 3, 5; 7 ← 1, 5; 8 — остання.
- Нові поля зрізів необов'язкові, крім `HostTruth.fakes` (обов'язкове): веб-фікстури `HostTruth` у тестах задачі 6 отримують `fakes: []`; `pnpm typecheck` обов'язково зелений з задачі 6.

## Фокус рев'ю

1. **Витік вигадки до розкриття.** На `question`/`locked`/`reveal` (sealed) кадри сцени й телефонів для запитання-вигадки й запитання-факту однакові за ключами: ті самі `choices` (з «Вигадка» останньою), `playerCount: 0`, `answeredCount: 0`, жодного `"fake":true`, `fake-N`, `correctId`, `authorId`. Задачі 3, 8.
2. **Стара гра й живий знімок.** Знімок посеред раунду truth до плану (без `fakes`, колода лише з людей) після `restore` грається як раніше: без варіанта «Вигадка», `playerCount` — як зараз (N − 1), частка автора та сама. Задачі 2, 3.
3. **Бали.** Вигадка: «Вигадка» — ціна, ім'я — 0, ніхто не отримує частку; справжній факт: «Вигадка» — 0, автор отримує частку й за цей вибір. Команди: капітан вибирає «Вигадка», бали — команді. Задача 2.
4. **Межа «не більше, ніж справжніх».** 2 справжні факти й 4 вигадки → у колоді 2 вигадки (перші за списком), пульт позначає решту «не зіграється»; 0 справжніх → раунд пропущено, вигадки не грають. Задачі 2, 3, 6.
5. **Автопілот.** Гравець гри без ведучого не може додати вигадку (`not_allowed`) навіть через подію ведучого; заготовлені з редактора граються. Задачі 2, 4, 8.

---

### Задача 1. Спільне: заготовлені вигадки в раунді, подія, константи, нові поля зрізів

**Files:**
- Modify: `packages/shared/src/quiz.ts` (`LIMITS.truthPresetFakes`, `LIMITS.truthFakes`, `truthRoundSchema.fakes`), `packages/shared/src/truth.ts` (константи, `isTruthFake`), `packages/shared/src/events.ts` (`truthFakeSchema`, `'host:truth-fake'`), `packages/shared/src/game.ts` (`'truth_fakes_full'`), `packages/shared/src/views.ts` (`TruthInfo.fakes?`, `TruthCard.fake?`, `HostTruth.fakes`, `HostTruth.author.fake?`), `packages/shared/src/history.ts` (`truth.fake?`).
- Test: `packages/shared/src/truth.test.ts`, `packages/shared/src/quiz.test.ts`.

**Interfaces (Produces):**
```ts
// truth.ts
export const TRUTH_FAKE_PREFIX = 'fake-';
export const TRUTH_FAKE_OPTION = 'fake';
export const TRUTH_FAKE_TEXT = 'Вигадка';
export function isTruthFake(id: string): boolean;
// quiz.ts — TruthRound: { …, fakes?: string[] }
// events.ts
export const truthFakeSchema: z.ZodObject<{ id: string | null; text: string }>;
// 'host:truth-fake': (payload: z.infer<typeof truthFakeSchema>, ack: Ack) => void;
```

- [ ] **Step 1: Write the failing tests:**
  - `quiz.test.ts` `a truth round takes up to five preset fakes`: `truthRound` з `fakes: ['Я вмію жонглювати п’ятьма м’ячами', 'Я тричі бачила північне сяйво']` проходить `quizSchema`; без `fakes` — теж; 6 вигадок → помилка; `'   '` → помилка; 201 символ → помилка; 200 — ок.
  - `truth.test.ts`: `truthFakeSchema` — `{ id: null, text: 'Я вмію жонглювати' }` ок, `{ id: 'fake-1', text: '' }` ок, без `id` → помилка, `text` 401 символ → помилка; `isTruthFake('fake-3') === true`, `isTruthFake('3f2a…uuid') === false`, `isTruthFake('fake') === false` (це id варіанта, не вигадки).
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/quiz.test.ts packages/shared/src/truth.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (спільне) й Interfaces.
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 && pnpm exec tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 52 truth fakes — up to five preset fakes in the truth round, the host:truth-fake event, the «made up» option id, and view fields that mark a fake only in the reveal and on the host"
```

---

### Задача 2. Рушій: вигадки в стані, роздача, запитання, бали, автопілот, знімок

**Files:**
- Modify: `packages/engine/src/game.ts` (`TruthState.fakes?`, `TruthFake`, `TruthPlay.fake?`, `createGame`), `packages/engine/src/truth.ts` (`setTruthFake`, `truthFaked`, `dealTruth`, `truthQuestion`, `truthPlayFor`), `packages/engine/src/restore.ts` (коментар).
- Create: `packages/engine/src/game.truth-fakes.test.ts`.
- Test: `packages/engine/src/restore.test.ts`, наявні `game.truth.test.ts`, `game.truth-lobby.test.ts` (мають лишитися зеленими без змін).

**Interfaces:**
- Consumes: Задача 1.
- Produces:
```ts
export interface TruthFake { id: string; text: string; preset?: true }
// TruthState { facts; deck?; fakes?: TruthFake[] }; TruthPlay { authorId; actorId; guessers; right?; fake?: true }
export function setTruthFake(state: GameState, id: string | null, raw: string): Result;
export function truthFaked(state: GameState): boolean;
```

- [ ] **Step 1: Write the failing tests** (`game.truth-fakes.test.ts`; гравці Оля/Петро/Марко/Ната, `truthRound('r1', { fakes: ['Я тричі бачила північне сяйво'] })`, фіксований `rng`):
  - `preset fakes come from the quiz`: `createGame` → `state.truth.fakes` = `[{ id: 'fake-1', text: 'Я тричі бачила північне сяйво', preset: true }]`; без `fakes` у раунді — ключа `fakes` немає.
  - `the host adds, edits and removes a fake in the lobby`: `setTruthFake(s, null, '  Я вмію  жонглювати ')` → `fake-2`, текст `'Я вмію жонглювати'`; зміна `fake-1` → новий текст без `preset`; `setTruthFake(s, 'fake-2', '')` прибирає; `'fake-9'` → `not_found`; 201 символ → `truth_text`; додавання до 10-ї → `truth_fakes_full`; після роздачі → `truth_closed`.
  - `no fakes in a game without a host`: `createAutopilotGame` → `setTruthFake(…)` → `not_allowed`; заготовлена в колоді після старту.
  - `the deal mixes fakes in, never more than the real facts`: 2 справжні + 3 вигадки → у колоді 4 записи, з вигадок — `fake-1`, `fake-2`; 0 справжніх + 2 вигадки → `deck: []`, раунд пропущено (`truthSkipped`); без вигадок колода та сама, що в наявному тесті `the deal shuffles…`.
  - `every question of a faked round has the «made up» option last`: кожне `truthQuestion` → останній варіант `{ id: 'fake', text: 'Вигадка' }`; вигадка — `correctId: 'fake'`, справжній — `correctId` автора; у раунді без вигадок варіанта немає.
  - `a fake is guessed by «made up»`: на вигадці Оля → `fake` (запис `correct`, бали 300), Петро → ім'я Марка (0); `withTruthPoints` не додає жодного запису частки; закриття — коли відповіли всі 4 (ніхто не автор).
  - `«made up» on a real fact is wrong and feeds the author's share`: факт Марка, Оля → `fake` (0), Петро → Марко (300), Ната → Оля (0) → Марко отримує `round(300 × 2 / 3) = 200`.
  - `teams: the captain picks «made up»` (`teamQuiz`, 2 команди, `chosen`): вигадка, капітан команди → `fake` → бали команді; команда автора справжнього факту — як зараз.
  - `restore.test.ts`: `an old truth snapshot plays on without the «made up» option` — знімок з колодою лише з людей, без `fakes`, на етапі `question` → `restore` → наступне запитання без варіанта `fake`, частка автора та сама; `a snapshot with fakes keeps the deck and the fake play` — знімок на вигадці → після `restore` той самий `play.truth.fake`, оцінка «Вигадка» — `correct`.
- [ ] **Step 2: Run** `pnpm test --project engine --maxWorkers=2 packages/engine/src/game.truth-fakes.test.ts packages/engine/src/restore.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (рушій) і коментар у `restore.ts`.
- [ ] **Step 4: Run** `pnpm test --project engine --maxWorkers=2`, потім `pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine`. Expected: PASS (наявні тести truth — без змін).
- [ ] **Step 5: Commit**
```bash
git add packages/engine
git commit -m "feat(engine): 52 truth fakes — host fakes in the lobby and presets from the quiz, dealt among the facts but never more than them, a «made up» option in every question of such a round, «made up» scores on a fake and misses on a real fact, none in a game without a host"
```

---

### Задача 3. Рушій: зрізи — жодної ознаки вигадки до розкриття, пульт бачить

**Files:**
- Modify: `packages/engine/src/views.ts` (`truthInfo`, `truthCard`, `hostTruth`, `base` — `playerCount`/`answeredCount`).
- Create: `packages/engine/src/views.truth-fakes.test.ts`.
- Test: наявний `views.truth.test.ts` (без змін, зелений).

**Interfaces:**
- Consumes: Задачі 1–2 (`truthFaked`, `TruthPlay.fake`).
- Produces: `stageView`/`playerView`/`hostView` з полями Задачі 1.

- [ ] **Step 1: Write the failing tests** (`views.truth-fakes.test.ts`; 4 гравці, 3 справжні факти, 1 заготовлена вигадка, 1 додана в лобі → колода з 5):
  - `the stage and the phones cannot tell a fake from a fact`: для запитання-вигадки й запитання-факту на `question` і `locked` — `stageView` і `playerView` не-автора: однакові `question.choices.map((c) => c.id)` (крім id людей — той самий список), `JSON.stringify` не містить `"fake":true`, `fake-1`, `fake-2`, `correctId`, `authorId`; `playerCount === 0`, `answeredCount === 0`; `truth.fakes === true`; `truth.reveal === null`.
  - `a mid-round reveal of a fake stays sealed for the hall`: `reveal` вигадки (не останньої) → сцена й телефони: `phase: 'locked'`, `truth.sealed === true`, без `"fake":true`.
  - `the host sees the mark`: `hostView` на вигадці → `truth.author` `{ id: 'fake-…', nickname: '', fake: true }`, `playerCount` — 4; на факті — автор без `fake`; `truth.fakes` — обидві з `preset` true/false, `inDeck` true; до роздачі при 1 справжньому факті й 2 вигадках — у другої `inDeck: false`.
  - `the recap says «made up by the host»`: останнє розкриття → `truth.recap.facts` вигадки — `{ fake: true, author: { nickname: '' }, points: 0 }`, `picks` з `pickedId: 'fake'` і `correct: true` у того, хто вибрав «Вигадка».
  - `the lobby count stays the real facts`: у лобі з 3 фактами й 2 вигадками `stageView(s).truth.count === 3`; після роздачі — 5.
  - `a round without fakes keeps its counter`: без вигадок `stageView(locked).playerCount === 3` (як `nobody but the host…`), ключа `fakes` немає.
- [ ] **Step 2: Run** `pnpm test --project engine --maxWorkers=2 packages/engine/src/views.truth-fakes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (зрізи).
- [ ] **Step 4: Run** `pnpm test --project engine --maxWorkers=2 && pnpm exec tsc -p packages/engine`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/engine/src/views.ts packages/engine/src/views.truth-fakes.test.ts
git commit -m "feat(engine): 52 truth fake views — the hall sees the same question for a fake and a fact and no answered counter in such a round, the recap says made up by the host, the host sees the mark and which fakes will be played"
```

---

### Задача 4. Сервер: подія ведучого, історія, досягнення

**Files:**
- Modify: `apps/server/src/rooms/manager.ts` (`HostAction`, `case 'truth-fake'`), `apps/server/src/socket.ts` (`host:truth-fake`), `apps/server/src/recorder.ts` (`truthRef`), `apps/server/src/db/schema.ts` (`PlayRef.truth.fake?`), `apps/server/src/history.ts` (`truthResult`), `apps/server/src/round-achievements.ts` (`mind_reader`).
- Test: `apps/server/src/rooms/manager.lobby.test.ts` (блок `player truth facts (28b)`), `apps/server/src/socket.test.ts`, `apps/server/src/history.test.ts`, `apps/server/src/mechanic-achievements.test.ts` або той файл, де тест `mind_reader` (звірити `grep -rn mind_reader apps/server/src/*.test.ts`).

- [ ] **Step 1: Write the failing tests:**
  - `manager.lobby.test.ts` `the host adds a fake in the lobby, the players never see it`: `host:truth-fake` `{ id: null, text: 'Я вмію жонглювати' }` → `ok`; кадр ведучого — `truth.fakes[0].text`; кадри гравців і сцени — без цього тексту; другий запит у ту саму мить → `too_soon`; лобі продовження після раунду truth → `truth_closed`.
  - `socket.test.ts`: `host:truth-fake` від гравця звичайної гри → `forbidden`; від гравця гри-автопілота → `not_allowed` (з рушія); кривий payload → `invalid`.
  - `history.test.ts` `a fake in the record is «made up by the host»`: журнал гри з вигадкою → `GameQuestionResult.truth` `{ author: '', points: 0, fake: true }`; справжній факт — як зараз.
  - `mind_reader` не рахує вигадок: 3 чужі справжні факти вгадано + вигадку не вгадано → досягнення є; 2 факти + 1 вигадка вгадано → немає.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/rooms/manager.lobby.test.ts apps/server/src/socket.test.ts apps/server/src/history.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (сервер).
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2`, потім `pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 52 truth fakes — host:truth-fake in the lobby with a rate limit, none for players of a game without a host, the history records a fake as made up by the host, mind reader counts only real facts"
```

---

### Задача 5. Веб: тексти в 7 мовах і довідка

**Files:**
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,de,es,it,pl,ar}.json`, `apps/web/src/i18n.test.ts`, `apps/web/src/help/help-uk.ts`, `apps/web/src/help/__fixtures__/help-uk-golden.json`, `apps/web/src/help/help-vars.ts` (+ `'truthPresetFakes'` у `LIMIT_KEYS`), `apps/web/src/locales/{en,de,es,it,pl,ar}.help.json`.

**Ключі (uk), `ADDED_TRUTH_52`:** `truthFakeOption` «Вигадка»; `truthFakeIs` «Це вигадка ведучого»; `truthFakeLabel` «Вигадка ведучого»; `truthFakeHostMark` «вигадка»; `truthFakeHostAnswer` «Вигадка ведучого — правильна відповідь «Вигадка»»; `truthFakesTitle` «Вигадані факти»; `truthFakesHint` «Вигадайте факт, схожий на справжні, щоб заплутати гравців. Тоді в кожному запитанні раунду буде варіант «Вигадка»: хто вибере його на вашій вигадці, отримає ціну запитання. Гравці не бачать, яке запитання вигадане.»; `truthFakeAdd` «Додати вигаданий факт»; `truthFakePlaceholder` «Наприклад: Я вмію жонглювати п’ятьма м’ячами»; `truthFakeEdit` «Змінити»; `truthFakeRemove` «Прибрати»; `truthFakePreset` «з редактора»; `truthFakeSkip` «не зіграється»; `truthFakesOver` «Вигадок більше, ніж фактів гравців: зіграються лише перші {count}.»; `err_truth_fakes_full` «Більше вигадок додати не можна.»; `truthPresetLabel` «Заготовлені вигадки (необов’язково)»; `truthPresetHint` «До 5 вигаданих фактів. У лобі ви зможете прибрати їх чи додати ще; у грі без ведучого граються лише ці.»; `truthPresetAdd` «Додати вигадку».
- Довідка: нові `round.truth.how.4` «Можна заплутати гравців: у лобі додайте вигадані факти (або заготуйте до {truthPresetFakes} у редакторі). Вигадок зіграється не більше, ніж фактів гравців. У кожному запитанні раунду тоді є варіант «Вигадка», і ніхто, крім вас, не знає, яке запитання вигадане.»; `round.truth.points.2` «На вигадці ціну отримує кожен, хто вибрав «Вигадка». На справжньому факті «Вигадка» — неправильна відповідь, і автор отримує за неї свою частку.»; `round.truth.limits.2` (нове значення) «У грі без ведучого факти ніхто не перевіряє, а граються лише вигадки, заготовлені в редакторі.»; `round.truth.tip.1` «Вигадка має звучати як справжній факт когось із гравців — тоді «Вигадку» вибиратимуть і на справжніх фактах.»
- Інші мови — ті самі ключі тим самим змістом; «Вигадка» — коротке слово з тим самим змістом (en «Made up», de «Erfunden», es «Inventado», it «Inventato», pl «Zmyślone», ar «مختلَق»); звертання — як у наявних `truth*` локалі.

- [ ] **Step 1: Write the failing test** — `ADDED_TRUTH_52` в `i18n.test.ts` (умова `adds no uk keys…` і перевірка локалей, як `ADDED_SPY_50`); у `help-golden` — нові ключі й значення.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/i18n.test.ts apps/web/src/help`. Expected: FAIL.
- [ ] **Step 3: Implement** ключі, локалі й довідку.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/i18n.test.ts apps/web/src/locales apps/web/src/help apps/web/src/source-scan.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/i18n.ts apps/web/src/i18n.test.ts apps/web/src/locales apps/web/src/help
git commit -m "feat(web): 52 truth fake texts in seven languages — the «made up» option, the host lobby panel, editor presets, the reveal and the help about host fakes"
```

---

### Задача 6. Веб: лобі ведучого, варіант «Вигадка», розкриття, пульт, історія

**Files:**
- Modify: `apps/web/src/screens/TruthView.tsx` (`truthChoiceText`, нова `HostTruthFakes`, `TruthPick`, `TruthNames`, `TruthStage`, `TruthHeldPick`, `TruthReveal`, `TruthRecapView`), `apps/web/src/screens/HostScreen.tsx` (~142, ~799, ~1421, ~1606), `apps/web/src/screens/PlayerScreen.tsx` (лічильник «Відповіли» на запитанні truth при `truth.fakes`), `apps/web/src/pages/GameHistory.tsx` (`truthLine`, рядок автора), `apps/web/src/styles.css` (`.truth-fakes`, `.truth-fake-mark`, `.truth-recap-card.is-fake`; обидві теми, без бокового скролу на 360 px).
- Test: `apps/web/src/screens/TruthView.test.tsx`, `HostScreen.test.tsx`, `PlayerScreen.test.tsx`, `StageScreen.test.tsx`, `apps/web/src/pages/GameHistory.test.tsx` (фікстури `HostTruth` + `fakes: []`).

**Interfaces:**
- Consumes: зрізи Задачі 1, ключі Задачі 5.
- Produces: `export function truthChoiceText(choice: { id: string; text: string }): string`; `export function HostTruthFakes(props: { truth: HostTruth; send: Send; onError?: (text: string | null) => void }): JSX.Element | null`.

- [ ] **Step 1: Write the failing tests:**
  - `HostTruthFakes`: `the host adds a fake` — ввести текст, «Додати вигаданий факт» → `send('host:truth-fake', { id: null, text })` один раз; `edits and removes` — «Змінити» → поле з текстом → «Зберегти» → `{ id: 'fake-1', text: нове }`; «Прибрати» → `{ id: 'fake-1', text: '' }`; тег «з редактора» на `preset`; «не зіграється» на `inDeck: false`; `role="status"` «Вигадок більше, ніж фактів гравців: зіграються лише перші 1.» при 1 нехованому факті й 2 вигадках; `truth.open === false` → нічого.
  - `TruthPick`: варіант `{ id: 'fake', text: 'Вигадка' }` показано як «Вигадка» (uk) тим самим класом `btn truth-name`; натиск → `player:answer` `{ type: 'single', optionId: 'fake' }`.
  - `TruthStage`: `truth.fakes: true` → немає «Відповіли»; без `fakes` — є (наявний тест).
  - `TruthReveal` з `reveal.fake` → «Це вигадка ведучого», немає «Автор:»; вибір `pickedId: 'fake'` → «Оля → Вигадка ✓». `TruthRecapView`: картка вигадки — «Вигадка ведучого», клас `is-fake`, без балів автора.
  - `HostScreen`: на `question` з `truth.author.fake` — тег «вигадка» і «Вигадка ведучого — правильна відповідь «Вигадка»», немає «Автор:»; лобі — панель «Вигадані факти» під «Факти гравців».
  - `GameHistory`: `truth: { author: '', points: 0, fake: true }` → «Вигадка ведучого», рядка «автор факту» немає.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/screens/TruthView.test.tsx apps/web/src/screens/HostScreen.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (веб).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/screens apps/web/src/pages && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/screens apps/web/src/pages apps/web/src/styles.css
git commit -m "feat(web): 52 truth fake screens — the host adds, edits and removes fakes in the lobby, «made up» looks like any name, no answered counter in a faked round, the reveal and the recap say made up by the host, the host sees the mark"
```

---

### Задача 7. Веб: редактор — заготовлені вигадки

**Files:**
- Modify: `apps/web/src/editor/RoundSettings.tsx` (раунд truth ~181), `apps/web/src/editor/draft.ts` (чистка раунду truth), `apps/web/src/editor/draft-storage.ts` (~586, ~637).
- Test: `apps/web/src/editor/RoundSettings.test.tsx` (або наявний тест налаштувань раунду truth — звірити), `apps/web/src/editor/draft.test.ts`, `apps/web/src/editor/draft-storage.test.ts`.

- [ ] **Step 1: Write the failing tests:**
  - `RoundSettings` раунду truth: є «Заготовлені вигадки (необов’язково)»; «Додати вигадку» → `onChange` з `fakes: ['']`; введення → `fakes: ['Я тричі бачила північне сяйво']`; на 5 полях кнопки «Додати вигадку» немає; «Прибрати» → без цього рядка; поле має `maxLength=200`.
  - `draft.test.ts`: чистка `fakes: ['  Я вмію жонглювати ', '', '  ']` → `['Я вмію жонглювати']`; `fakes: ['']` → без ключа `fakes`; чистий результат проходить `quizSchema`; `newTruthRound()` без `fakes`.
  - `draft-storage.test.ts`: раунд truth з `fakes` відновлюється з ними; `fakes: 'текст'` (не масив) → без ключа; масив з не-рядком → лише рядки.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/editor/RoundSettings.test.tsx apps/web/src/editor/draft.test.ts apps/web/src/editor/draft-storage.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (редактор).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/editor && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/editor
git commit -m "feat(web): 52 truth fake presets in the editor — up to five made-up facts for the truth round, empty ones dropped on save"
```

---

### Задача 8. Наскрізні сценарії й кадри (`part52-truth-fakes.e2e.ts`), повтор part 28b

**Files:**
- Create: `apps/server/e2e/part52-truth-fakes.e2e.ts` (за зразком `truthGame28b` у `part28a-c-moreless-truth-drawing.e2e.ts`: кадри сокета, гравці-сокети + сторінки Playwright, світла тема `quiz:theme = light`, `is-light` на `<html>`).

**Сценарії** (вікторина: `truthRound` 300 балів, 30 с, + класичний раунд з одним `single` 30 с; гравці Оля, Петро, Марко, Ната):
1. `it('part 52: editor — preset fakes for the truth round are saved, empty ones dropped')` — у редакторі раунд truth: «Додати вигадку» двічі, «Я тричі бачила північне сяйво» і порожнє → зберегти → у вікторині через API `fakes: ['Я тричі бачила північне сяйво']`; кадр `truth52-editor-360`.
2. `it('part 52: the host adds a fake in the lobby, «made up» in every question, a fake guessed and missed, «made up» on a real fact, phone 360 px, light theme')` — лобі: Оля, Петро, Марко пишуть факти; ведучий бачить заготовлену «з редактора», додає «Я вмію жонглювати п’ятьма м’ячами», змінює, — кадр `truth52-host-lobby`; у колоді 5. На кожному запитанні: телефон і сцена показують «Вигадка» останньою, немає «Відповіли N з M»; кадри сокета сцени й телефонів до останнього розкриття не містять `"fake":true`, `fake-1`, `fake-2`; яке запитання вигадка — лише з кадру пульта (`truth.author.fake`), пульт показує тег «вигадка». На вигадці: Ната → «Вигадка», Петро → ім'я; на справжньому факті Марка: Оля → «Вигадка». Підсумок (останнє розкриття): картки «Вигадка ведучого», у Нати +300 за вигадку, у Петра 0, Марко отримує частку й за вибір Олі; кадри `truth52-phone-pick-light-360`, `truth52-stage-question`, `truth52-recap-light`, `truth52-recap-phone-360`; `expectNoSideScroll`.
3. `it('part 52: without a host only the presets play and a player cannot add a fake')` — гра-автопілот з заготовленою вигадкою: гравець шле `host:truth-fake` → `not_allowed`; заготовлена вигадка грається, «Вигадка» на ній — ціна; підсумок «Вигадка ведучого»; кадр `truth52-autopilot-360`.

- [ ] **Step 1: Write the scenarios.**
- [ ] **Step 2: Run** `pnpm build`, потім (після завершення збирання) `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 52"` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 3: Run** `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 28b"` (після part 52, не одночасно). Expected: PASS — раунд без вигадок як раніше (лічильник «Відповіли» є, варіанта «Вигадка» немає).
- [ ] **Step 4: Переглянути кадри:** на 360 px «Вигадка» — така сама кнопка, як імена; панель вигадок у лобі ведучого читається в світлій темі; підсумок на сцені й телефоні показує «Вигадка ведучого»; без бокового скролу.
- [ ] **Step 5: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 52 — truth fake presets in the editor, the host's lobby fakes, «made up» in every question with no answered counter, a fake guessed and missed, «made up» on a real fact, presets only without a host, 360 px, light theme"
```

---

## Розбіжності зі специфікацією (рішення плану)

1. **`GAME_STATE_VERSION` не підвищується (22).** Нове в стані — лише необов'язкове (`truth.fakes`, `Play.truth.fake`) плюс нові значення в наявному `deck: string[]` (id `fake-N`), яких у старих знімках немає. **Живі кімнати посеред раунду truth не обриваються** й догравають раунд як до плану (без «Вигадки»). Пуш не потребує питання власника.
2. **«Вигадка» — лише в раундах, де в роздачі є вигадка** (тоді — у кожному запитанні, останнім варіантом). Специфікація вимагає варіант у кожному запитанні, щоб його поява не видавала вигадку; у раунді без вигадок він тільки забирав би бали ні за що. Те, що в раунді взагалі є вигадки, гравці знають (так і задумано), яке запитання — ні.
3. **Межа кількості:** у лобі — технічна стеля 10 разом із заготовленими; правило «не більше, ніж справжніх» діє на роздачі: грають перші за списком (заготовлені першими), решту пульт позначає «не зіграється» й попереджає. Жорсткої відмови при додаванні немає, бо справжні факти ще можуть з'явитися чи зникнути до старту.
4. **Лічильник «Відповіли N з M» у раунді з вигадками сцені й телефонам не показується** (`playerCount`/`answeredCount` = 0 у їхніх зрізах): на справжньому факті вгадують N − 1 (автор чекає), на вигадці — N, тож знаменник видав би вигадку. Ведучий бачить справжні числа. Лишаються дві «фізичні» підказки, які зрізами не прибрати: запитання закривається, коли відповіли всі вгадувачі (на вигадці — на одного більше), і в кімнаті видно, хто не натискає (як і до плану — автор справжнього факту). Це прийнято.
5. **«Фактів: N» у лобі рахує лише факти гравців**, «Факт k з n» після роздачі — усі запитання разом з вигадками: різницю гравці можуть помітити (скільки вигадок), але не яке запитання вигадане.
6. **Розкриття для зали — у підсумку раунду**, як і для справжніх фактів (раунд truth held, план 28b): «Це вигадка ведучого» на сцені й телефонах з'являється на останньому розкритті та в підсумку; ведучий бачить позначку з відкриття запитання й на кожному розкритті.
7. **Автопілот:** у грі без ведучого події ведучого шлють гравці (`hostSide`), тож рушій відмовляє `setTruthFake` (`not_allowed`) при `state.autopilot`; граються лише заготовлені — як у специфікації.
8. **Текст варіанта в стані — «Вигадка» (uk), веб показує перекладений за id `fake`.** Журнал гри й серверні тексти історії бачать uk-слово; сторінка історії показує «Вигадка ведучого» за прапорцем `fake`.
9. **Досягнення:** «Знаю вас як облуплених» (`mind_reader`) рахує лише справжні факти (вигадка — не факт про людину); «Темна конячка» не змінюється (автор вигадки — не людина).
10. **Заготовлені вигадки — частина вікторини:** хто бачить вміст вікторини в бібліотеці (як і правильні відповіді інших раундів), побачить і їх; у грі вони до гравців не йдуть (`roundInfo` полів раунду не передає).
11. **Сіди не змінюються:** специфікація цього не просить; заготовлені вигадки — у фікстурах тестів і e2e.
