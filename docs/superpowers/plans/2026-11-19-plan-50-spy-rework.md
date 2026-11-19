# План 50: «Шпигун» по-новому — шпигун знає лише, що він шпигун, і підказку ведучого (41a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** `SpyPlay` (`packages/engine/src/game.ts` ~490: `stage`, `spyId`, `spyName?`, `words`, `votes`, `guess`) не змінюється — слова шпигуна в ньому ніколи не було. Слово шпигуна живе лише в копії вікторини `GameState.quiz`; у схемі воно стає **необов'язковим** (`spyWord?`), нове поле запитання `spyHint?` — теж необов'язкове. Знімок до плану читається як є: у старому запитанні є `spyWord` і немає `spyHint` — рушій слово просто не читає, підказки немає. Якщо виконавцю знадобиться обов'язкове поле стану чи зміна наявного — **зупинитися й спитати контролера** (підвищення обриває живі ігри; власника питають перед пушем).

> **Звірка з кодом.** План спирається на `main` 2026-11-19 (`a497cdda`, після плану 49 і специфікації 41a):
> - схема: гілка `spy` у `questionSchema` (`packages/shared/src/quiz.ts` ~805: `accepted: spellings`, `spyWord` обов'язкове, `voteTime`); `superRefine` запитання (~1004: `spy_word_long`, `spy_same`, `spy_leak` через локальну `wordsOf`, `spy_reveal`, `spy_hint` — це **баф-підказка** `base.hint` ~372, не підказка шпигуну, `spy_media`); `spy_place` (~1805), `spy_teams` (~1922); `LIMITS.spyGuessTime`/`minSpyPlayers` (~291);
> - зрізи: `SpyInfo`/`HostSpy`/`PlayerSpy` (`packages/shared/src/views.ts` ~1715–1770; `SpyInfo.spyWord`, `HostSpy.spyWord: string`, `PlayerSpy.word: string`, `PlayerSpy.spy: boolean | null` — лише reveal);
> - рушій: `packages/engine/src/spy.ts` — `ownWord` (~56, шпигун → `spyWord`), `writeSpyWord` (~81, `spy_word` — близькість до власного слова), `fullInfo` (~258, `spyWord: question.spyWord`), `spyInfo` (~292), `hostSpy` (~302), `playerSpy` (~311); автопілот тестів `packages/engine/src/testing/autopilot.ts` ~356 (`mine.word`); фікстури `spy`/`spy2`/`spyQuiz` (`testing/fixtures.ts` ~673–700); `schema-golden.test.ts` ~90; коментар версій `restore.ts` ~92–95 (останній рядок — `48 без нової версії…`);
> - сервер: `manager.spyWord`/`spyVote`/`spyGuess` (`rooms/manager.ts` ~2180), `socket.ts` ~705 — **не змінюються**; тест `rooms/manager.spy.test.ts` (~52 `me(petro)?.word === 'чай'`, ~75 перевірка витоку `'чай'`);
> - веб: `editor/SpyEditor.tsx` (слово гравців + написання, слово шпигуна, `same`), `editor/draft.ts` (порожнє ~391, чистка ~1132, `spyLeaks` ~1387, `problemKey` ~1641), `editor/draft-storage.ts` ~230, `admin/admin-text.ts` ~61; `screens/SpyPhone.tsx` (`own` — «Ваше слово», `spyCaughtYou`), `screens/SpyBoard.tsx` (`SpyVerdict` — `spyRevealWords`), `screens/HostSpy.tsx`, `screens/PlayerScreen.tsx` ~326 (`SpyResult`, `me.spy?.spy`); стилі `apps/web/src/styles.css` (`.spy-me-word`);
> - тексти: uk-ключі `spy*`/`problemSpy*` (`apps/web/src/i18n.ts` ~4381–4423), списки `ADDED_SPY`/`ADDED_SPY_PLURALS` (`i18n.test.ts` ~186, перевірка локалей ~408, умова `adds no uk keys…` ~603), найновіші — `ADDED_LEVELS_49*` (~205); довідка `question.spy.*` (`help/help-uk.ts` ~588–600, `help/__fixtures__/help-uk-golden.json`, `help/help-vars.ts` ~120, `locales/*.help.json`);
> - сіди: `apps/server/scripts/spy-quiz.ts` (6 пар, `spy(n, text, players, spyWord, time, points)`), `spy-quiz.test.ts`, `school3/kit.ts` ~40 (`spy(text, players[], spyWord, points, time, voteTime)`), `school3/play.ts` ~12–16 (5 пар), `school3-quiz.test.ts` ~160, ~172; `seed-demo.ts --update <quizId> <seed>`;
> - e2e-зразок: `apps/server/e2e/part38-spy.e2e.ts` (4 сценарії; кадри сокета, світла тема, 320 px).
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

**Мета:** у «Шпигуні» шпигун більше не отримує свого слова: на його телефоні великим «Ви — шпигун» і, якщо ведучий дав, «Підказка: …»; решта бачать загальне слово; етапи й бали без змін; у редакторі — «Загальне слово» і необов'язкова «Підказка шпигуну»; старі запитання зі словом шпигуна лишаються валідними.

**Архітектура:** схема отримує необов'язкове `spyHint` (≤ 120) і робить `spyWord` необов'язковим (застаріле, ніде не показується). Рушій у `spy.ts` змінює лише зрізи й перевірку асоціації шпигуна; стан гри той самий. Підказка — у зрізі шпигуна з відкриття, у пульта з відкриття, у сцени й інших телефонів — лише з `reveal`.

**Технології:** TypeScript, zod 4, vitest (проєкти `shared`/`engine`/`server`/`web`), Fastify + Socket.IO, React 19 + Vite + Testing Library, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-19-spy-rework-design.md` (41a).

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22.** У коментар до `READABLE_STATE_VERSIONS` (`restore.ts`, після рядка `48 без нової версії…`) додати: «50 без нової версії: spy — необов'язкові spyHint і spyWord (застаріле, рушій його не читає); Play.spy без змін».
- Усі тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`; довідка — `help/help-uk.ts`, `help/__fixtures__/help-uk-golden.json`, `help/help-vars.ts`, `locales/*.help.json`. Нові uk-ключі — у новому списку `ADDED_SPY_50` (`i18n.test.ts`) — в умову `adds no uk keys beyond the agreed list` і в перевірку наявності в усіх локалях (як `ADDED_SPY`). ru немає.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`).
- **Нічого, пов'язаного з росією**, — у прикладах, фікстурах, довідці, сідах, e2e.
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|engine|server|web> --maxWorkers=2 [шляхи]`; типи — у задачах 1–2 `pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine && pnpm exec tsc -p apps/server`, з задачі 3 — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів vitest).
- Файли правити лише Edit/Write чи `sed`; **python3 на цій машині — порожня заглушка, ним нічого не правити й не генерувати**; після коміту перевірити `git show --stat`.
- Робоче дерево — лише в `C:\ClaudeCode\quiz\.superpowers\worktrees\…`; жодних файлів поза `C:\ClaudeCode\quiz`.
- Таймер кожного запитання й голосування у фікстурах, сідах і e2e ≥ 25 с.
- e2e: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 50"` з `E2E_SHOTS=1`; телефон 360 px, світла тема.
- **Таємниця:** до `reveal` у зрізі телефона шпигуна немає загального слова (ні `accepted`, ні `playersWord`); у зрізах сцени й інших телефонів немає ні підказки, ні позначки шпигуна, ні голосів. Пульт бачить усе з відкриття.

## Рішення плану (там, де специфікація мовчить)

**Схема (`packages/shared/src/quiz.ts`)**
- `LIMITS.spyHint = 120`.
- Гілка `spy`: `spyHint: z.string().trim().min(1).max(LIMITS.spyHint).refine(isStorable, UNSTORABLE).optional()`; `spyWord` — те саме, що було, але `.optional()` (doc «Застаріле (38): слово шпигуна; з 50 не показується й не читається»). Назва `spyHint`, а не `hint`: `hint` уже є в `base` (баф-підказка, заборонена в `spy` — `spy_hint`).
- Нова спільна `export function wordIn(text: string, word: string): boolean` — ціле слово `word` (за `answerKey`, межі `/[^\p{L}\p{N}']+/u`) трапляється в `text`; порожній ключ → `false`. Схема (`spy_leak`) і редактор (`spyLeaks`, `spyHintLeaks`) користуються нею замість локальних `wordsOf`.
- Проблеми `spy`: **прибрати `spy_same`**; `spy_leak` — лише `wordIn(q.text, accepted[0])` (слово шпигуна більше не перевіряється); підказку схема **не** перевіряє на загальне слово — це лише попередження редактора (специфікація: «Попередження»). Решта (`spy_word_long`, `spy_reveal`, `spy_hint`, `spy_media`, `spy_place`, `spy_teams`) — без змін.
- `packages/shared/src/drafts.ts` — нічого нового (поля необов'язкові); перевірити, що чернетка `spy` проходить.

**Рушій (`packages/engine/src/spy.ts`)**
- `ownWord(question, spy, playerId): string | null` — шпигун → `null`, решта → `accepted[0]`.
- `writeSpyWord`: перевірка `spy_word` (близькість до власного слова) — **лише для не-шпигуна**. Шпигун пише будь-яку чисту асоціацію (порожня/задовга → `think_word`): відмова «надто близько до слова» підказала б шпигуну загальне слово.
- Зрізи (типи — Задача 1):
  - `fullInfo` → `playersWord: accepted[0]`, `spyHint: question.spyHint ?? null` (пульт — з відкриття);
  - `spyInfo` до `reveal` → `spyHint: null` (разом з іншими `null`); на `reveal` — як у пульта без `spyId`;
  - `playerSpy` → `word: ownWord(…)` (шпигун — `null`), `hint`: шпигунові — `question.spyHint ?? null`, решті — `null`; `spy: isSpy` **з відкриття** (шпигун і так це знає; іншим — `false`, що нічого не видає).
- Бали, етапи, голоси, останній шанс, `spyCaught`, `scoreSpy`, `SpyAnswer` — без змін.
- Автопілот тестів: шпигун (`mine.word === null`) бере перше слово `SPY_WORDS` без перевірки близькості.

**Редактор**
- Поля: «Загальне слово» (наявний ключ `spyPlayersWord` з новим значенням) з іншими написаннями (як зараз) + «Підказка шпигуну (необов'язково)» — `<input maxLength={LIMITS.spyHint}>`; порожнє при чистці → ключа `spyHint` немає.
- Попередження (не блокує збереження): `spyHintLeaks(question)` — `accepted.some((w) => wordIn(question.spyHint ?? '', w))` → `role="status"` «Підказка містить саме загальне слово — шпигун його просто прочитає».
- **Старі запитання (рішення):** якщо в запитанні є непорожнє `spyWord`, редактор показує рядок «Раніше тут було слово шпигуна «{word}». Тепер шпигун його не бачить.» і кнопки «Зробити підказкою» (`spyHint = spyWord`, якщо підказка порожня, інакше кнопки немає; `spyWord` прибирається) і «Прибрати» (лише прибирає `spyWord`). Чистка чернетки (`draft.ts` ~1132) **завжди відкидає `spyWord`**: після першого збереження в редакторі слова шпигуна в запитанні немає. Невідредаговані вікторини лишаються з `spyWord` — валідні й граються за новими правилами.
- `problemKey`: `problemSpyWordEmpty` — лише порожнє загальне слово; `problemSpySame` прибрати; `problemSpyLeak` — через `wordIn` лише для загального слова.
- `draft-storage.ts`: `spyHint` — рядок, якщо рядок, інакше ключа немає; `spyWord` — лише якщо непорожній рядок (для рядка про старе слово).
- `admin-text.ts` (тексти для модерації): `[...accepted, ...(spyHint ? [spyHint] : []), ...(spyWord ? [spyWord] : [])]`.

**Телефони, сцена, пульт**
- Телефон шпигуна (усі етапи до `reveal`): замість «Ваше слово: …» — картка `.spy-you` з великим `<strong>` «Ви — шпигун» і, якщо `mine.hint !== null`, рядком «Підказка: {hint}» (`dir="auto"`). Без підказки — нічого більше. Поле асоціації й голосування — як зараз.
- Інші телефони — як зараз («Ваше слово» + слово).
- Етап `guess`, шпигун: «Вас викрили! Впишіть загальне слово» (нове значення `spyCaughtYou`).
- Розкриття (`SpyVerdict`) і пульт: «Загальне слово — {word}» (новий ключ `spyRevealWord`, замість `spyRevealWords`) і, якщо є, «Підказка шпигуну: {hint}» (`spyRevealHint`); пульт без підказки — «Без підказки» (`spyNoHint`).
- Сцена до `reveal` — без змін.

**Тексти** — повний список у Задачі 3. Звертання — **«Ви»**, як в усіх наявних текстах «Шпигуна» («Ваше слово», «Вас викрили!»), тож «Ти — шпигун» специфікації пишеться «Ви — шпигун» (див. «Розбіжності»).

## Порядок збирання

- Задача 1 змінює типи зрізів (`PlayerSpy.word: string | null`, `spyHint` замість `spyWord`), задача 3 прибирає 4 uk-ключі — `apps/web` не компілюється, доки задачі 4 (екрани) і 5 (редактор, адмінка) не завершені. У задачах 1–4 перевіряються тести й `tsc` пакетів/сервера; `pnpm typecheck` — обов'язково зелений з задачі 5.
- Порядок: 1 → 2 → 3 → 4 → 5 → 6 → 7. Залежності: 2 ← 1; 3 ← 1; 4 ← 2, 3; 5 ← 1, 3; 6 ← 1; 7 — остання.

## Фокус рев'ю

1. **Витік загального слова шпигунові.** На `question` (усі три етапи) і `locked` `JSON.stringify` зрізу телефона шпигуна не містить `accepted[0]` (і жодного написання); `publicQuestion` для `spy` не несе `accepted`/`spyHint`/`spyWord`. Задачі 2, 7.
2. **Витік підказки й ролі іншим.** До `reveal` кадри сцени й інших телефонів не містять тексту підказки; `PlayerSpy.spy` інших — `false`, а не `null`/відсутнє в одних і `true` в інших (зріз шпигуна відрізняється лише власним телефоном). Задачі 2, 7.
3. **Стара вікторина й живий знімок.** Запитання з `spyWord` і без `spyHint` проходить `quizSchema`; знімок, збережений на етапі `words`/`vote`/`guess` до плану (з `spyWord` у `state.quiz`), після `restore` дає того самого шпигуна, ті самі асоціації й голоси, шпигунові — `word: null`, `hint: null`; бали — як раніше. Задачі 1, 2.
4. **Асоціація шпигуна.** Шпигун може написати слово, близьке до загального (навіть саме загальне), — `ok`, без `spy_word`; не-шпигун — як раніше `spy_word`. Задача 2.
5. **Редактор і старе слово.** Відкриття старого запитання показує рядок про слово шпигуна; «Зробити підказкою» переносить його; збереження без натискань відкидає `spyWord`; підказка з загальним словом — попередження, але збереження й запуск доступні. Задача 5.

---

### Задача 1. Спільне: `spyHint`, необов'язкове `spyWord`, `wordIn`, нові зрізи

**Files:**
- Modify: `packages/shared/src/quiz.ts` (`LIMITS.spyHint`, гілка `spy`, `wordIn`, `superRefine` — див. «Рішення плану»), `packages/shared/src/views.ts` (типи нижче), `packages/shared/src/index.ts` (якщо `wordIn` не експортується через `export *`).
- Test: `packages/shared/src/quiz.test.ts`, `packages/shared/src/challenge.test.ts` (фікстура `spy` ~50: `spyWord: 'Дністер'` → `spyHint: 'Найдовша річка країни'`).

**Interfaces (Produces):**
```ts
// quiz.ts
export function wordIn(text: string, word: string): boolean;
// Question 'spy': { …base, type: 'spy', accepted: string[], spyHint?: string, spyWord?: string /* застаріле */, voteTime: number }
// views.ts
export interface SpyInfo {
  stage: SpyStage; written: number; voted: number; total: number; rows: SpyRow[] | null;
  playersWord: string | null;  // лише reveal
  spyHint: string | null;      // лише reveal (null і тоді, коли підказки немає); замість spyWord
  spyName: string | null; caught: boolean | null; guess: string | null; guessed: boolean | null;
}
export interface HostSpy extends SpyInfo { spyId: string; playersWord: string; rows: SpyRow[] } // spyHint — з відкриття
export interface PlayerSpy {
  word: string | null;         // null — гравець шпигун (слова не бачить)
  hint: string | null;         // лише шпигунові: підказка ведучого; іншим — null
  wrote: string | null; vote: string | null; spectator: boolean; guessing: boolean; guess: string | null;
  spy: boolean;                // з відкриття
}
```

- [ ] **Step 1: Write the failing tests** (`quiz.test.ts`, помічник `spyQ` — `accepted: ['кава']`, без `spyWord`):
  - `accepts a spy without a spy word` — без `spyHint` ок; `spyHint: 'Що п'ють зранку з молоком?'` ок; `spyHint` 120 символів ок, 121 → помилка; `spyHint: '   '` → помилка (min 1 після trim).
  - `still accepts an old spy with a spy word` — `spyWord: 'чай'` ок; `spyWord: 'Кава'` теж ок (**`spy_same` більше немає**).
  - `spy_leak only for the common word` — текст «Що ви п'єте: кава?» → `spy_leak`; текст «Що ви п'єте: чай?» зі `spyWord: 'чай'` — без `spy_leak`; `spyHint: 'кава з молоком'` — без проблем схеми.
  - `wordIn` — `wordIn('Що ви п'єте: кава?', 'Кава') === true`; `wordIn('Кавалер прийшов', 'кава') === false`; `wordIn('будь-що', '') === false`.
  - Наявні `refuses a broken spy` — вилучити очікування `spy_same`; решта (`spy_reveal`, `spy_hint`, `spy_media`, `spy_word_long`, `spy_place`, `spy_teams`) — без змін.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/quiz.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» й Interfaces.
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 && pnpm exec tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 50 spy — an optional host hint for the spy, the spy word becomes optional legacy, wordIn for whole-word leaks, views where the spy gets no word"
```

---

### Задача 2. Рушій і сервер: шпигун без слова, підказка в зрізах

**Files:**
- Modify: `packages/engine/src/spy.ts` (`ownWord`, `writeSpyWord`, `fullInfo`, `spyInfo`, `playerSpy` + doc-коментарі), `packages/engine/src/testing/autopilot.ts` (~361), `packages/engine/src/testing/fixtures.ts` (`spy`: без `spyWord`, `spyHint: 'Її п'ють зранку'` — **не** містить «кава»; `spy2`: без `spyWord` і без підказки; новий `spyLegacy` — `accepted: ['вітрило']`, `spyWord: 'парус'`, 30 с, `voteTime: 25`, 500), `packages/engine/src/schema-golden.test.ts` (~90: `spyWord` → `spyHint`), `packages/engine/src/restore.ts` (коментар).
- Test: `packages/engine/src/game.spy.test.ts`, `packages/engine/src/restore.test.ts`, `apps/server/src/rooms/manager.spy.test.ts` (оновити ~52, ~75 під нові зрізи).

**Interfaces:**
- Consumes: типи Задачі 1.
- Produces: `playerSpy(state, playerId): PlayerSpy | undefined`, `spyInfo(state): SpyInfo | undefined`, `hostSpy(state): HostSpy | undefined` — ті самі сигнатури, нові поля.

- [ ] **Step 1: Write the failing tests** (`game.spy.test.ts`, 4 гравці, фіксований `rng` → шпигун відомий):
  - `the spy sees no word, only the hint` — `playerSpy(шпигун)` → `{ word: null, hint: 'Її п'ють зранку', spy: true }`; інший → `{ word: 'кава', hint: null, spy: false }`; `JSON.stringify(playerView(шпигун))` на `words`, `vote`, `guess` і `locked` не містить «кава».
  - `without a hint the spy gets only the role` — `spy2`: шпигун `{ word: null, hint: null, spy: true }`.
  - `the stage and other phones get the hint only at reveal` — `spyInfo` на `question`/`locked` → `spyHint: null`; рядок підказки відсутній у `JSON.stringify(stageView)` і `playerView(інший)`; на `reveal` → `spyHint: 'Її п'ють зранку'`, `playersWord: 'кава'`; `hostSpy` з відкриття → `spyHint: 'Її п'ють зранку'`, без `spyWord` у зрізі.
  - `the spy may write a word close to the common one` — шпигун «кавовий» → `ok`; не-шпигун «кавовий» → `spy_word`.
  - `an old spy question with a spy word plays by the new rules` — `spyLegacy`: шпигун `word: null`, `hint: null`; зріз не містить «парус».
  - Бали — наявні тести (викрили + вгадав → половина; не викрили → подвійна) зелені без змін.
  - `restore.test.ts`: `an old snapshot mid spy keeps the spy and the votes` — знімок на етапі `vote` вікторини з `spyLegacy` → `restore` → той самий `spyId`, ті самі `words`/`votes`, `playerSpy(шпигун).word === null`.
  - `manager.spy.test.ts`: `me(шпигун)` → `word: null`, `hint` фікстури; перевірка витоку: кадри сцени й інших телефонів до `reveal` без тексту підказки, кадр шпигуна без «кава».
- [ ] **Step 2: Run** `pnpm test --project engine --maxWorkers=2 packages/engine/src/game.spy.test.ts packages/engine/src/restore.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (рушій) і коментар у `restore.ts`.
- [ ] **Step 4: Run** `pnpm test --project engine --maxWorkers=2`, потім `pnpm test --project server --maxWorkers=2 apps/server/src/rooms/manager.spy.test.ts apps/server/src/socket.test.ts`, потім `pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/engine apps/server/src/rooms/manager.spy.test.ts
git commit -m "feat(engine): 50 spy — the spy's phone gets no word but the host hint, the stage and other phones see the hint only at reveal, the spy's association is not checked against the hidden word, old questions with a spy word play by the new rules"
```

---

### Задача 3. Веб: тексти в 7 мовах і довідка

**Files:**
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,de,es,it,pl,ar}.json`, `apps/web/src/i18n.test.ts`, `apps/web/src/help/help-uk.ts`, `apps/web/src/help/__fixtures__/help-uk-golden.json`, `apps/web/src/help/help-vars.ts` (+ `'spyHint'`), `apps/web/src/locales/{en,de,es,it,pl,ar}.help.json`.

**Ключі (uk):**
- Нові, `ADDED_SPY_50`: `spyYouAreSpy` «Ви — шпигун»; `spyHintLine` «Підказка: {hint}»; `spyHintField` «Підказка шпигуну (необов'язково)»; `spyHintFieldHint` «Слово-натяк або запитання, що веде до загального слова. Бачить лише шпигун, усі — на розкритті.»; `spyHintLeak` «Підказка містить саме загальне слово — шпигун його просто прочитає»; `spyLegacyWord` «Раніше тут було слово шпигуна «{word}». Тепер шпигун його не бачить.»; `spyLegacyToHint` «Зробити підказкою»; `spyLegacyDrop` «Прибрати»; `spyRevealWord` «Загальне слово — {word}»; `spyRevealHint` «Підказка шпигуну: {hint}»; `spyNoHint` «Без підказки».
- Нові значення наявних: `spyPlayersWord` «Загальне слово»; `spyPlayersWordHint` «Інші написання зарахуються шпигунові, якщо його викриють і він вгадає слово.»; `spyCaughtYou` «Вас викрили! Впишіть загальне слово»; `spyDefaultText` «Напишіть одне слово-асоціацію до загального слова»; `typeHow_spy` «Усі, крім шпигуна, бачать одне слово; шпигун знає лише, що він шпигун. Напишіть асоціацію, а потім знайдіть шпигуна голосуванням.»; `problemSpyLeak` «Запитання {index}: текст запитання видає загальне слово»; `problemSpyWordEmpty` «Запитання {index}: впишіть загальне слово.»; `problemSpyWordLong` «Запитання {index}: загальне слово — до 40 символів»; `spyEditorHint` «Шпигуна вибере програма; він бачитиме лише «Ви — шпигун» і вашу підказку. Потрібно щонайменше 3 гравці; з меншою кількістю запитання пропуститься.»
- Прибрати (з `i18n.ts`, 6 локалей і списку `ADDED_SPY`): `spySpyWord`, `spySpyWordHint`, `problemSpySame`, `spyRevealWords`.
- Довідка `question.spy.*` (ті самі ключі, нові значення; «підказка» бафа — «підказка-баф», щоб не плутати): `what` — шпигун бачить лише «Ви — шпигун» і підказку ведучого, решта — загальне слово; `how.0` — ведучий вписує загальне слово (з написаннями) і, за бажанням, підказку шпигуну до {spyHint} символів: слово-натяк чи запитання; шпигуна вибирає програма; `how.1` — асоціація: не-шпигун не може писати своє слово чи близьке, шпигун пише будь-яке; `how.3` — на розкритті загальне слово, шпигун, підказка (якщо була), голоси й бали; `limits.0` + «Підказка шпигуну — до {spyHint} символів.»; `limits.1` — «без … підказки-бафу …»; `tip.0` — порада про підказку: «Підказка має звужувати, а не видавати: «Її п'ють зранку» для «кава» краще, ніж «кава з молоком». Без підказки шпигунові важче — тоді беріть слова, асоціації до яких легко вгадати з чужих.»; `tip.1` — «У полі «Загальне слово» можна додати інші прийнятні написання…». Приклади пар («кава» і «чай») прибрати.
- Інші мови — ті самі ключі тим самим змістом; «шпигун» — як уже перекладено `type_spy` у кожній локалі; звертання — як у наявних `spy*` локалі.

- [ ] **Step 1: Write the failing test** — `ADDED_SPY_50` в `i18n.test.ts` (умова `adds no uk keys…` і перевірка локалей); з `ADDED_SPY` вилучити 4 прибрані ключі; у `help-golden` — нові значення.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/i18n.test.ts apps/web/src/help`. Expected: FAIL.
- [ ] **Step 3: Implement** ключі, локалі й довідку (місця використання прибраних ключів правляться в задачах 4–5; див. «Порядок збирання»).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/i18n.test.ts apps/web/src/locales apps/web/src/help apps/web/src/source-scan.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/i18n.ts apps/web/src/i18n.test.ts apps/web/src/locales apps/web/src/help
git commit -m "feat(web): 50 spy texts in seven languages — «you are the spy», the host hint, the common word, the legacy spy word notice, and the help about the new rules"
```

---

### Задача 4. Веб: телефон шпигуна, розкриття, пульт

**Files:**
- Modify: `apps/web/src/screens/SpyPhone.tsx`, `apps/web/src/screens/SpyBoard.tsx` (`SpyVerdict`), `apps/web/src/screens/HostSpy.tsx`, `apps/web/src/screens/PlayerScreen.tsx` (`SpyResult` — `me.spy?.spy` тепер є з відкриття; «Ви були шпигуном» лишається лише на reveal), `apps/web/src/styles.css` (`.spy-you` — великий рядок ролі, `.spy-hint`; обидві теми, без бокового скролу на 360 px).
- Test: `SpyPhone.test.tsx`, `SpyBoard.test.tsx`, `HostSpy.test.tsx`, `PlayerScreen.test.tsx`, `HostScreen.test.tsx`, `StageScreen.test.tsx` (фікстури зрізів: `spyWord` → `spyHint`, `word: null` для шпигуна).

- [ ] **Step 1: Write the failing tests:**
  - `SpyPhone`: `the spy sees only the role and the hint` — `mine = { word: null, hint: 'Її п'ють зранку', spy: true, … }`, етап `words` → є «Ви — шпигун», «Підказка: Її п'ють зранку», поле асоціації; немає «Ваше слово»; `vote` — те саме + кнопки голосу.
  - `the spy without a hint sees only the role` — `hint: null` → «Ви — шпигун», жодного «Підказка».
  - `other players still see their word` — `word: 'кава'` → «Ваше слово» і «кава», немає «Ви — шпигун».
  - `guess` для шпигуна → «Вас викрили! Впишіть загальне слово» і поле.
  - `SpyBoard`/`SpyVerdict` на reveal: «Загальне слово — кава», «Підказка шпигуну: Її п'ють зранку»; без підказки — рядка немає.
  - `HostSpy`: з відкриття «Загальне слово — кава» і «Підказка шпигуну: …»; без підказки — «Без підказки».
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/screens/SpyPhone.test.tsx apps/web/src/screens/SpyBoard.test.tsx apps/web/src/screens/HostSpy.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (телефони, сцена, пульт).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/screens`. Expected: PASS (`pnpm typecheck` ще може падати лише в `editor/`/`admin/` — задача 5).
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/screens apps/web/src/styles.css
git commit -m "feat(web): 50 spy screens — the spy's phone says only «you are the spy» and the host hint, the reveal and the host show the common word and the hint"
```

---

### Задача 5. Веб: редактор — загальне слово, підказка шпигуну, старе слово

**Files:**
- Modify: `apps/web/src/editor/SpyEditor.tsx`, `apps/web/src/editor/draft.ts` (порожнє `spy` ~391 — `accepted: ['']` без `spyWord`; чистка ~1132; `spyLeaks` через `wordIn`; нова `export function spyHintLeaks(question: Extract<Question, { type: 'spy' }>): boolean`; `problemKey` ~1641), `apps/web/src/editor/draft-storage.ts` (~230), `apps/web/src/admin/admin-text.ts` (~61).
- Test: `apps/web/src/editor/SpyEditor.test.tsx`, `apps/web/src/editor/draft.test.ts`, `apps/web/src/admin/AdminQuiz.test.tsx` (якщо фікстура з `spyWord`).

- [ ] **Step 1: Write the failing tests:**
  - `SpyEditor`: є поле «Загальне слово» й «Підказка шпигуну (необов'язково)», немає «Слово шпигуна»; введення підказки → `onChange` з `spyHint`; підказка «кава з молоком» при `accepted: ['кава']` → `role="status"` «Підказка містить саме загальне слово…»; «Кавалерія» — без попередження.
  - `an old spy word is offered as the hint` — `spyWord: 'чай'`, без `spyHint` → рядок «Раніше тут було слово шпигуна «чай»…»; «Зробити підказкою» → `onChange` з `spyHint: 'чай'` і без ключа `spyWord`; «Прибрати» → без `spyWord`, без `spyHint`; при непорожній підказці кнопки «Зробити підказкою» немає.
  - `draft.test.ts`: чистка `spy` з `spyHint: '  '` → без ключа `spyHint`; з `spyWord: 'чай'` → без ключа `spyWord`; `problemKey` — порожнє загальне слово → `problemSpyWordEmpty`, підказка з загальним словом → `null` (не блокує), текст з загальним словом → `problemSpyLeak`, текст зі старим `spyWord` → `null`; чистий результат проходить `quizSchema`.
  - `draft-storage`: чернетка зі `spyHint` і `spyWord` відновлюється з обома; без них — без ключів.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/editor/SpyEditor.test.tsx apps/web/src/editor/draft.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (редактор).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/editor apps/web/src/admin && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/editor apps/web/src/admin
git commit -m "feat(web): 50 spy editor — the common word and an optional spy hint with a leak warning, an old spy word can become the hint and is dropped on save"
```

---

### Задача 6. Сіди `spy` і `school3`: підказки замість слів шпигуна

**Files:**
- Modify: `apps/server/scripts/spy-quiz.ts` (помічник `spy(n, text, players, hint: string | null, timeLimit, points)`, опис вікторини й раунду — шпигун не має слова, бачить лише підказку), `apps/server/scripts/spy-quiz.test.ts`, `apps/server/scripts/school3/kit.ts` (`spy(text, players[], hint: string | null, points, time = 40, voteTime = 30)`; `null` → без ключа `spyHint`), `apps/server/scripts/school3/play.ts`, `apps/server/scripts/school3-quiz.test.ts` (~160, ~172).

**Запитання (тексти без «вашого/свого слова»; загальні слова ті самі):**
- `spy`: 1 «Шпигун 1: одне слово про загальне слово» — `потяг`, «Їздить рейками від вокзалу», 35 с, 500; 2 «Шпигун 2: з чим у вас асоціюється загальне слово?» — `молоко`, «Що дає корова?», 40 с, 700; 3 «Шпигун 3: одне слово-натяк на загальне слово» — `парасолька`, «Рятує від дощу», 40 с, 600; 4 «Шпигун 4: що спадає на думку від загального слова?» — `борщ`, **без підказки**, 45 с, 800; 5 «Шпигун 5: коротка асоціація, яка не видасть загального слова» — `гітара`, «Шість струн і гриф», 45 с, 1000; 6 «Шпигун 6: одне слово, що найкраще описує загальне слово» — `річка`, «Тече між берегами», 40 с, 900. Усі `voteTime: 30`.
- `school3` (префікс «Шпигун на уроці N:» лишається, решту тексту — без «вашого слова»): `зошит` — «Що підписують на обкладинці й здають учителеві?»; `лінійка` — «Нею креслять прямі»; `крейда` — «Пише на дошці»; `барабан` — «Що б'ють паличками в оркестрі?»; `циркуль` — **без підказки**. Ціни й час — як зараз.

- [ ] **Step 1: Write the failing tests:**
  - `spy-quiz.test.ts`: замість `pairs are different words` — `no question has a spy word, the hints never contain the common word` (`spyWord` немає ніде; для кожного `spyHint` — `wordIn(spyHint, w) === false` для всіх `accepted` і перші 5 літер слова не трапляються в підказці); `at least one question has no hint`; `repeats no question or hint of the other seeds` (тексти й підказки — як нинішня перевірка текстів); таймери ≥ 25 с; «nothing about russia» — без змін; `quizSchema` проходить.
  - `school3-quiz.test.ts` ~160: перевірка витоку — лише `accepted[0]` у текстах вікторини + підказка не містить загального слова; ~172 — повтори підказок з іншими сідами замість пар.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/scripts/spy-quiz.test.ts apps/server/scripts/school3-quiz.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** сіди.
- [ ] **Step 4: Run** ту саму команду й `pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/scripts
git commit -m "feat(server): 50 spy and school3 seeds — host hints instead of spy words, one question in each without a hint"
```
- [ ] **Step 6 (контролер, після злиття й пушу):** оновити вікторини власника: `DATABASE_URL=… pnpm --filter @quiz/server seed:demo --update <quizId> spy` і `… --update <quizId> school3` (id — пошуком вікторин власника за назвою).

---

### Задача 7. Наскрізні сценарії й кадри (`part50-spy-hint.e2e.ts`), оновлення part 38

**Files:**
- Create: `apps/server/e2e/part50-spy-hint.e2e.ts` (за зразком `part38-spy.e2e.ts`: кадри сокета, гравці-сокети + сторінки Playwright, світла тема `quiz:theme = light`, `is-light` на `<html>`).
- Modify: `apps/server/e2e/part38-spy.e2e.ts` — лише перевірки, що чекали слова шпигуна на телефоні (тепер «Ви — шпигун»), і редактор (поле «Слово шпигуна» → «Підказка шпигуну»).

**Сценарії** (4 гравці, класика: `кава` з підказкою «Її п'ють зранку», 30 с, `voteTime: 25`; `гітара` без підказки, 30 с, `voteTime: 25`; шпигун — з `hostSpy`/кадру пульта):
1. `it('part 50: editor — the common word and a spy hint, a warning when the hint holds the word, an old spy word becomes the hint')` — нова вікторина: «Загальне слово» «кава», «Підказка шпигуну» «кава з молоком» → попередження, кнопка запуску доступна; виправити на «Її п'ють зранку» → попередження зникає; вікторина через API зі старим `spyWord: 'чай'` → у редакторі рядок «Раніше тут було слово шпигуна «чай»…», «Зробити підказкою» → у полі «чай»; зберегти → у базі без `spyWord`; кадр `spy50-editor-360`.
2. `it('part 50: the spy sees only «you are the spy» and the hint, the others see the word, caught and guessed, phone 360 px, light theme')` — телефон шпигуна: «Ви — шпигун», «Підказка: Її п'ють зранку», жодного «кава» в тексті сторінки й у кадрах сокета до `reveal`; інші телефони — «Ваше слово» «кава», без тексту підказки; сцена до `reveal` — без підказки й імені шпигуна; усі за шпигуна → `guess`: «Вас викрили! Впишіть загальне слово» → «кава» → розкриття «Загальне слово — кава», «Підказка шпигуну: Її п'ють зранку», шпигун +половина ціни, голосувальники — ціна; кадри `spy50-spy-phone-light-360`, `spy50-player-phone-light-360`, `spy50-reveal-light`; `expectNoSideScroll`.
3. `it('part 50: no hint — the spy sees only the role and stays hidden for double points')` — `гітара`: телефон шпигуна лише «Ви — шпигун» (без «Підказка»), голоси розкидано → шпигун подвійна ціна; пульт «Без підказки»; кадр `spy50-nohint-phone-360`.

- [ ] **Step 1: Write the scenarios** і правки part 38.
- [ ] **Step 2: Run** `pnpm build`, потім (після завершення збирання) `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 50"` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 3: Run** `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 38"` (після part 50, не одночасно). Expected: PASS.
- [ ] **Step 4: Переглянути кадри:** на 360 px «Ви — шпигун» великим, підказка читається в світлій темі, без бокового скролу; розкриття показує загальне слово й підказку.
- [ ] **Step 5: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 50 — the spy hint in the editor with a leak warning and the legacy spy word, the spy's phone with only the role and the hint, other phones with the word, caught and guessed, no hint and hidden, 360 px, light theme"
```

---

## Розбіжності зі специфікацією (рішення плану)

1. **`GAME_STATE_VERSION` не підвищується (22).** `Play.spy` не змінюється; слово шпигуна лежить лише в копії вікторини в стані, а в схемі стає необов'язковим; `spyHint` — нове необов'язкове поле. **Живі кімнати посеред «Шпигуна» не обриваються:** після деплою знімок відновлюється з тим самим шпигуном, асоціаціями й голосами. Єдиний наслідок — у кімнаті, де запитання `spy` відкрите саме під час деплою, телефон шпигуна замість його слова покаже «Ви — шпигун» (без підказки — у старих запитаннях її немає), тобто шпигун посеред запитання дізнається свою роль. Бали рахуються так само. Пуш не потребує питання власника (правило — питати лише про підвищення версії).
2. **«Ти — шпигун» → «Ви — шпигун».** Усі наявні тексти «Шпигуна» й застосунку звертаються на «Ви» («Ваше слово», «Вас викрили!»); на одному екрані «Ти» поруч із «Впишіть» виглядало б помилкою. Якщо власник хоче саме «Ти» — це одна зміна значення `spyYouAreSpy` в uk.
3. **Старе слово шпигуна (рішення, яке специфікація лишила будівничому):** схема його приймає (необов'язкове), рушій і екрани не читають. Редактор показує його рядком «Раніше тут було слово шпигуна…» з кнопками «Зробити підказкою» і «Прибрати»; будь-яке збереження в редакторі поле відкидає. Невідредаговані вікторини граються за новими правилами без підказки.
4. **Попередження про загальне слово в підказці — лише в редакторі**, не проблема схеми: збереження й запуск доступні (специфікація каже «попередження»). Перевірка — цілим словом за `answerKey` (як `spy_leak`), тож «Кавалерія» для «кава» не попереджає.
5. **`spy_same` прибрано**, `spy_leak` перевіряє лише загальне слово: слова шпигуна в грі більше немає, тож його збіг чи поява в тексті нічого не видає.
6. **Асоціація шпигуна не перевіряється на близькість** до загального слова (`spy_word` — лише для інших): відмова «надто близько» підказала б шпигуну приховане слово. Шпигун може навіть написати саме слово — це його ризик (інші побачать «заборонене» слово й зрозуміють).
7. **`PlayerSpy.spy` — з відкриття, не лише з `reveal`:** шпигун тепер знає свою роль; інші отримують `false`, що нічого не видає (кожен телефон бачить лише себе).
8. **Підказка на розкритті видна всім** (специфікація: «на розкритті — … підказка (якщо була)»); до розкриття — лише шпигунові й пульту.
9. **Назва поля — `spyHint`**, не `hint`: `hint` уже є в кожному запитанні (баф-підказка) і в `spy` заборонений (`spy_hint`). У довідці баф названо «підказка-баф», щоб не плутати.
10. **Довідка:** ті самі ключі `question.spy.*` з новими значеннями (нових ключів довідки немає); у `help-vars` додано `spyHint` (120).
11. **Сіди:** у кожному з двох сідів одне запитання без підказки — показує, що підказка необов'язкова. Після злиття контролер оновлює вікторини власника `seed:demo --update`.
