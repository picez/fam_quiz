# План 27c: тип запитання «Список на час»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** новий тип запитання `timedlist`. Ведучий задає завдання й схований список пунктів (кожен з інакшими написаннями), ціну пункту, таймер і необов'язковий мінус за слово не зі списку. Кожен гравець (команда) сам шукає пункти на телефоні, як на Sporcle: правильне слово стає у свою нумеровану клітинку, неправильне зникає. Бали — за рідкісністю: пункт, знайдений k гравцями з N, дає кожному з них `ціна × (N − k + 1) / N`.

**Архітектура:**
- **Дані (`shared`).** Запитання `{ ...base, type: 'timedlist', items: { id, text, accepted }[], minus: number | null }`. `points` з `base` — ціна **одного пункту**. `text` — назва пункту на табло й перше написання, `accepted` — інші написання (як рядок «100 до 1», `surveyRow`). Номер клітинки — позиція пункту в `items`. Підсумок гравця — `TimedListAnswer`, його складає лише рушій.
- **Стан (`engine`).** Необов'язкове поле `Play.timedlist?: TimedListPlay = { present: string[]; progress: Record<id, TimedListProgress> }`. `present` записує `openQuestion` (це N). Новий файл `packages/engine/src/timedlist.ts`: `timedListOf`, `listHit`, `listEntry`, `scoreTimedList`. Збіг слова шукає `textAccepts` з `packages/engine/src/check.ts` — та сама функція, що прощає описки в типі `text`. Бали ставить `lockNow`, поруч зі `scoreWordLadder`.
- **Зрізи.** Нові поля **необов'язкові** й присутні лише тоді, коли поточне запитання — список: `PublicQuestion.timedlist`, `BaseView.timedlist`, `HostView.timedlist`, `PlayerView.me.timedlist`. Тож зрізи інших запитань не змінюються байт у байт, а фабрики тестів `apps/web` правити не треба (так зроблено в 26c).
- **Сервер.** Одна подія `player:list { word, enter }`. Рушій повертає, чим було слово (`found | repeat | miss`). Менеджер комітить стан і перекладає це в ack: `ok`, `list_repeat` чи `list_miss`.
- **Веб.** Нові файли:
  - `apps/web/src/editor/TimedListEditor.tsx` (за зразком `SurveyEditor.tsx`);
  - `apps/web/src/screens/TimedListView.tsx` (`TimedListPlay`, `TimedListCells`, `TimedListBoard`, `TimedListReveal`).

**Технології:** TypeScript, zod 4, vitest, Fastify + Socket.IO, React 19 + Vite, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-11-09-timed-list-design.md`, уся.

## Глобальні обмеження

- 7 мов без ru. Нові ключі — в усі 7 локалей і в списки в `i18n.test.ts`:
  - uk — у `apps/web/src/i18n.ts`;
  - список `ADDED_27C` додати в `apps/web/src/i18n.test.ts` і в умову `adds no uk keys beyond the agreed list`;
  - переклади — у `apps/web/src/locales/{en,pl,de,es,it,ar}.json`;
  - довідка — у `help-uk.ts`, у `help-uk-golden.json` і в `*.help.json`.
- Нічого про росію, і в прикладах теж. Тому приклад специфікації «озера Європи» (Ладога, Онега) у тестах, e2e й довідці **не** вживається. Беремо планети Сонячної системи, кольори веселки й міста України.
- `GAME_STATE_VERSION` можна підвищити (`packages/engine/src/restore.ts`). Якщо поля лише додаються, `READABLE_STATE_VERSIONS` має лишити старі версії читабельними. Власник дозволив пушити без запиту. **Рішення плану:** версія лишається **22**. Нове значення типу й поле `Play.timedlist` необов'язкові, а старі знімки їх не містять (так само, як 26c). У `restore.ts` додається лише рядок у коментарі над `READABLE_STATE_VERSIONS`: «27c без нової версії: тип 'timedlist' і необов'язкове Play.timedlist».
- Юніт-тести: `pnpm vitest run --maxWorkers=2 <шлях>`.
- Ніколи не запускати prettier.
- e2e: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 27c"`, на передньому плані, менше 10 хв.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`). Пункти в тестах — це дані тестів.
- Таймери у фікстурах, e2e й прикладах ≥ 25 с. Типовий — 90 с.
- Тип не діє в бліці, «Ставках», «Аукціоні», фіналі, «Ва-банку», «Вибуванні», «Мільйонері», у запасних запитаннях і на бліц- чи усній клітинці поля.

## Рішення плану (там, де специфікація мовчить)

- **Назва типу в коді:** `'timedlist'`. У `QUESTION_TYPES` він стоїть одразу після `'survey'`.
- **Ліміти** (`LIMITS`):
  - `minListItems: 3`, `maxListItems: 30`;
  - `listItemText: 60` — довжина назви пункту й кожного написання;
  - `listWord: 60` — довжина поля вводу й події;
  - `defaultListTime: 90`, `defaultListPoints: 100`, `defaultListMinus: 50`;
  - написань на пункт — до `LIMITS.maxAccepted` разом з `text` (тобто `accepted` ≤ 9).
  - Сума `points × items.length ≤ LIMITS.maxPoints`, інакше `timedlist_points` (як `sort_points`).
- **Перевірки схеми:**
  - `timedlist_duplicate` — те саме написання (`answerKey`) у двох різних пунктах; повтор усередині одного пункту не заважає, як у `survey_duplicate`;
  - `timedlist_video` — без таймера список не скінчиться;
  - `timedlist_points`;
  - `timedlist_place` — раунд не `classic` і не `board`; на полі — клітинка не `kind: 'normal'` або `cellAnswerMode(round, cell) !== 'phone'`.
  - Id пунктів ідуть у загальну перевірку `duplicate_ids`.
- **Збіг слова** — `listHit(items, found, value)`, по черзі:
  1. Точний `textMatches([text, ...accepted], value)` по всіх пунктах за порядком. Уже знайдений пункт → `repeat`, інакше → `found`.
  2. `textAccepts` (описки) спершу серед **незнайдених** пунктів → `found`, потім серед знайдених → `repeat`.
  3. Інакше → `miss`.
  - Порожнє після `normalizeText` слово — `miss`, яке не рахується ніколи.
  - Цифри, як і в `textAccepts`, описок не мають.
- **Без кнопки «Надіслати»** (подія `player:list { word, enter }`):
  - телефон шле `enter: false` після 400 мс без змін у полі. Сервер приймає лише `found`/`repeat`, а `miss` тоді не рахується ніколи;
  - Enter на клавіатурі (`enterKeyHint="done"`, `onSubmit` форми) шле `enter: true`. Лише такий `miss` — «слово не зі списку»: він збільшує `wrong`, коли `minus !== null`;
  - мінус ніколи не діє через проміжні літери, бо живе введення рахує лише влучання;
  - описка в живому введенні може зарахуватися на літеру раніше («Юпітр» → Юпітер). Так і задумано, бо описки прощаються.
- **Мінус** — лише за `miss` з `enter: true` і лише коли `minus !== null`. Повтор і описка, яку впізнали, — без мінуса. Коли мінус вимкнено, `wrong` не росте і стан не змінюється.
- **N** = `present ∪ ключі progress`, лише ті, хто ще є в `state.players`:
  - `present` — `presentPlayers(state)` у мить `openQuestion`; на клітинці поля — `[board.chooserId]`;
  - хто приєднався пізніше й щось знайшов, додається до N, тож `k ≤ N` завжди;
  - вилучений гравець зникає і з `present`, і з `progress`.
- **Ціна пункту з множниками:** `unit = question.points × rulesOf(round).multiplier × (play.board?.multiplier ?? 1)`. Ціна клітинки на полі не діє, як у сортуванні (`sortPoints`).
- **Бали:**
  - за кожен знайдений пункт — `Math.round(unit × listShare(N, k))`, де `listShare = (N − k + 1) / N` у `score.ts`. Округлюється кожен пункт окремо, далі сума;
  - мінус: `−wrong × Math.round(minus × multiplier × cellMark)`. Підсумок може бути від'ємним;
  - `accuracy = found / items.length`, `accepted` і `grade` — з `shareVerdict(accuracy)`;
  - `streakBonus` 0;
  - швидкість, «частково», штраф раунду `penalty: 'minus'` і бафи не діють.
- **Записи:**
  - знайшов усі пункти — запис одразу (`accepted: true`, бали тимчасово 0), далі `autoLock(…, now)`; на клітинці поля — `revealNow`, як у стіни;
  - решта записів з'являється в `scoreTimedList` при закритті — для кожного, хто має `progress` (знахідку чи `wrong`);
  - хто нічого не робив, запису не має, але в N рахується.
- **Ручна оцінка й апеляції:** `overrideGrade` дає `wrong_phase` (додати `'timedlist'` до списку типів у `game.ts` ≈ рядок 2290). Апеляція вимикається сама через `appealPoints`.
- **Бафи:** нове `PlaceBlock` `'off_timedlist'` у `buffs.ts` (`questionOff`), текст `buffWhy_off_timedlist`. Дебафи діють без нових винятків, як на драбині.
- **Команди:**
  - у `actorOf` (`packages/engine/src/team-act.ts`, `case 'answer'`) запитання-список дає `actor(team)` для **будь-якого** учасника, до гілок бліцу й відповідача;
  - через це `canActNow` дає `true` кожному, і `TeamWatch` не вмикається;
  - знахідки лягають у спільний `progress[teamId]`, а зріз команди спільний для всіх її учасників;
  - N — кількість команд.
- **Хто що бачить:**
  - **Сцена й гравці під час `question`/`locked`:** `total`, `minus` і для кожного гравця лише `found` (кількість) і `wrong`. Ні назв, ні номерів пунктів.
  - **Гравець:** завжди свої знахідки `{ index, text }`, де `text` — назва пункту ведучого, а не те, що він набрав.
  - **На `reveal` усім:** увесь список (номер, назва, хто знайшов, бали за пункт кожному) і підсумки рядків.
  - **Ведучий завжди:** увесь список і хто що знайшов наживо. `points` пунктів — лише на `reveal`, бо до закриття N ще може змінитися.
  - Інші написання (`accepted`) не йдуть у жоден зріз, окрім зрізу ведучого.
- **Час для фактів:** `factLimitMs` повертає `null`, як у драбини. Список рахує знахідки, а не швидкість.
- **Досягнення:** нових немає. `all_types` (`goal: QUESTION_TYPES.length`) зростає на 1 сам. Тести, що чекають на точну кількість типів, оновити свідомо (як у 26c: `apps/server/src/achievements.test.ts` і тести сценаріїв `apps/server/scripts/*-quiz.test.ts`, якщо вони її чекають).
- **Клітинки на телефоні:**
  - сітка `repeat(auto-fill, minmax(8.5rem, 1fr))`; на 320 px — дві колонки, без горизонтальної прокрутки;
  - порожня клітинка показує лише номер;
  - нова знахідка з'являється з анімацією `timedlist-pop` (масштаб 0.85 → 1 і прозорість, 250 мс);
  - повтор блимає вже знайденою клітинкою (`.is-again`, 600 мс);
  - промах з Enter трусить поле (`timedlist-shake`, 300 мс) і з мінусом показує «−50» біля лічильника;
  - `prefers-reduced-motion: reduce` вимикає всі три анімації.
- **Демо-вікторини** не змінюються.

## Порядок збирання

- Задача 1 додає `'timedlist'` у `Question` і `TimedListAnswer` в `Answer`. Через вичерпні `switch` у `apps/web` повний typecheck у задачах 1–4 не проходить. Там перевірка: `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Від задачі 5 — повний `pnpm typecheck`.
- Залежності:
  - 2 спирається на 1;
  - 3 — на 2;
  - 4 — на 2 і 3;
  - 5 — на 3;
  - 6 — на 4 і 5;
  - 7 іде останньою.

## Фокус рев'ю

1. **Спойлер у зрізі.** До `reveal` `JSON.stringify` зрізу сцени й будь-якого гравця не містить назви жодного пункту, якого цей гравець не знайшов, і жодного написання з `accepted`. p1 не бачить знахідок p2. `PublicQuestion` не має `items`. Тест: задача 3, `never sends an unfound item or a spelling before reveal`. В e2e — те саме через `socketFrames`.
2. **Збіг і мінус.**
   - Описка → `found`.
   - Повтор, зокрема повтор з опискою, → `repeat` без мінуса.
   - Живе введення (`enter: false`) ніколи не дає мінуса.
   - Enter з промахом дає мінус лише при `minus !== null`.
   - Описка, ближча до вже знайденого пункту, не забирає незнайдений пункт.
   Тести: задача 2, `listHit prefers exact, then typos among unfound items` і `a miss costs only on enter and only with a minus`.
3. **Бали на краях.**
   - 4 гравці: 100 / 75 / 50 / 25.
   - Пункт, який знайшли всі, дає бали.
   - Пізній гравець збільшує N.
   - Вилучений зменшує N.
   - Множник раунду ×2 і позначка клітинки ×3.
   - Ціна 333 з округленням кожного пункту.
   - Від'ємний підсумок.
   Тест: задача 2, `scores by rarity among the players present`.
4. **Команди.** Двоє учасників однієї команди вводять різні пункти — обидва лягають у спільний список. Повтор від товариша — `repeat`. N = команди. Тести: задача 2, `teammates fill one list`; задача 4, `any team member enters list words`.
5. **Перепідключення й перезапуск.** Знімок кімнати з `Play.timedlist` відновлюється з тими самими знахідками без підняття версії. Телефон після повторного входу бачить свої клітинки. Тест: задача 4, `a restored room keeps every player's list finds`.
6. **Подвійні запити.** Телефон не шле другого запиту, поки чекає першого. Остання зміна поля йде після відповіді. Поле очищується лише тоді, коли в ньому досі те саме слово, що пішло на сервер. Тест: задача 6, `one request at a time and a cleared field only for the word that was sent`.

---

### Задача 1. Спільне: схема, ліміти, місця, підсумок, подія, помилки

**Files:**
- Modify: `packages/shared/src/quiz.ts`:
  - `LIMITS`, `QUESTION_TYPES`;
  - гілка `questionSchema`;
  - `ids` і перевірки в `superRefine` запитання;
  - `timedlist_place` у `superRefine` `quizSchema`, поруч із `surveyPlace`;
  - `questionPrice`.
- Modify: `packages/shared/src/answer.ts`, `packages/shared/src/events.ts`, `packages/shared/src/game.ts` (`ErrorCode`), `packages/shared/src/facts.ts` (`factLimitMs`)
- Test: `packages/shared/src/quiz.test.ts`, `packages/shared/src/facts.test.ts`, `packages/shared/src/achievements.test.ts` (лише якщо падає)

**Interfaces:**
- Produces:
  ```ts
  // quiz.ts LIMITS
  minListItems: 3, maxListItems: 30, listItemText: 60, listWord: 60,
  defaultListTime: 90, defaultListPoints: 100, defaultListMinus: 50,
  // QUESTION_TYPES: 'timedlist' одразу після 'survey'
  // гілка questionSchema
  { ...base, type: z.literal('timedlist'),
    /** Схований список; номер клітинки — позиція пункту. */
    items: z.array(z.object({
      id: z.string().min(1).refine(isStorable, UNSTORABLE),
      /** Назва на табло; вона ж перше написання. */
      text: z.string().trim().min(1).max(LIMITS.listItemText).refine(isStorable, UNSTORABLE),
      /** Інші написання (без text). */
      accepted: z.array(z.string().trim().min(1).max(LIMITS.listItemText).refine(isStorable, UNSTORABLE)).max(LIMITS.maxAccepted - 1),
    })).min(LIMITS.minListItems).max(LIMITS.maxListItems),
    /** Мінус за слово не зі списку; null — без мінуса. */
    minus: z.number().int().min(1).max(LIMITS.maxPoints).nullable() }
  export type TimedListItem = Extract<Question, { type: 'timedlist' }>['items'][number];
  // questionPrice: timedlist → points × items.length
  // answer.ts
  /** Підсумок списку гравця (команди); складає рушій, з телефона не приходить. found — id пунктів у порядку знахідок. */
  export interface TimedListAnswer { type: 'timedlist'; found: string[]; total: number; wrong: number }
  export type Answer = … | WordLadderAnswer | TimedListAnswer;
  // events.ts
  export const timedListWordSchema = z.object({ word: z.string().max(LIMITS.listWord).refine(isStorable, UNSTORABLE), enter: z.boolean() });
  'player:list': (payload: z.infer<typeof timedListWordSchema>, ack: Ack) => void;
  // game.ts ErrorCode
  | 'list_miss' | 'list_repeat'
  // facts.ts factLimitMs: question.type === 'timedlist' → null
  ```

- [ ] **Step 1: Write the failing tests.** У `quiz.test.ts` додати помічник `listQ(patch)`:
  - пункти «Меркурій», «Венера», «Земля», «Марс» (`accepted: ['Червона планета']`), «Юпітер»;
  - `points: 100`, `timeLimit: 90`, `minus: 50`.

  Тести в `quiz.test.ts`:
  - `accepts a timed list with spellings and an optional minus` — проходить з `minus: 50` і з `minus: null`.
  - `refuses duplicate spellings across items, a video, too few items and too many points`:
    - написання `'марс'` у двох пунктах → `timedlist_duplicate`;
    - `['Марс', 'марс']` в одному пункті — без помилки;
    - `video` → `timedlist_video`;
    - 2 пункти → помилка схеми;
    - 30 пунктів × 100 → `timedlist_points`;
    - `minus: 0` → помилка.
  - `a timed list plays in classic rounds and normal phone cells only`:
    - класика — true;
    - звичайна клітинка поля з телефона — true;
    - `timedlist_place` дають:
      - бліц;
      - фінал;
      - «Ставки» (з `betsCut`);
      - «Аукціон»;
      - «Ва-банк»;
      - бліц-клітинка;
      - усна клітинка (`answerMode: 'voice'`).
  - `old quizzes still parse` — наявна фікстура без списку проходить без змін.
  - `answerSchema never accepts a list summary; the list event is limited`:
    - `answerSchema` з `{ type: 'timedlist', … }` — false;
    - `timedListWordSchema` з 61 символом, без `enter` чи з `enter: 'yes'` — false.
  - `questionPrice of a timed list is the price of every item` — 5 × 100 = 500.

  Тест у `facts.test.ts`: `a timed list has no answer window` — `factLimitMs(listQ(), classic, false) === null`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared`. Очікується FAIL.

- [ ] **Step 3: Implement** усе з блоку Interfaces.
  - `ids` у `superRefine`: `q.type === 'timedlist' ? q.items.map((i) => i.id)`.
  - Ключі дублікатів — `[...new Set([i.text, ...i.accepted].map(answerKey))]` на пункт, далі `hasDuplicates`, як у `survey`.
  - Місце на полі: `boardCells(round).some(({ cell }) => cell.question.type === 'timedlist' && (cell.kind !== 'normal' || cellAnswerMode(round, cell) !== 'phone'))`. Поза полем — `round.type !== 'classic'`.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/shared && tsc -p packages/shared`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): 27c timed list question — items with spellings, price per item, optional minus, classic and phone cells only, list event"
```

---

### Задача 2. Рушій: знахідки, мінус, бали за рідкісністю, команди, поле

**Files:**
- Create: `packages/engine/src/timedlist.ts`, `packages/engine/src/game.timedlist.test.ts`
- Modify:
  - `packages/engine/src/game.ts`:
    - `TimedListProgress`, `TimedListPlay`, `Play.timedlist`;
    - `openQuestion` — `present`;
    - `submitAnswer` — `type_mismatch`, як для `wordladder` (≈ рядок 1650);
    - `lockNow` і друге місце виклику ланцюжка `score…` (≈ рядок 2370) — додати `scoreTimedList`;
    - `overrideGrade` — `wrong_phase`;
    - `removePlayer` — прибрати з `present` і `progress`, як `wordladder` (≈ рядок 885).
  - `packages/engine/src/team-act.ts` (`case 'answer'`), `packages/engine/src/score.ts` (`listShare`), `packages/engine/src/buffs.ts` (`'off_timedlist'`), `packages/engine/src/index.ts`, `packages/engine/src/restore.ts` (лише коментар)
  - `packages/engine/src/testing/fixtures.ts` (`timedlist`), `packages/engine/src/testing/autopilot.ts` (бот вводить перший пункт)
- Test: `packages/engine/src/score.test.ts`, `packages/engine/src/game.buffs.test.ts`, `packages/engine/src/restore.test.ts` (`'timedlist'` у `keysOf<Play>`), `packages/engine/src/game.teams-act.test.ts`

**Interfaces:**
- Consumes: `textMatches`, `textAccepts` (`check.ts`), `normalizeText`, `shareVerdict`, `presentPlayers`, `rulesOf`, `TimedListAnswer`, `TimedListItem` (задача 1).
- Produces:
  ```ts
  // game.ts
  /** Знахідки гравця (команди): id пунктів у порядку знахідок; wrong — промахи з Enter, лише коли є мінус. */
  export interface TimedListProgress { found: string[]; wrong: number }
  /** present — хто був на початку запитання (N); на клітинці поля — той, хто вибрав. */
  export interface TimedListPlay { present: string[]; progress: Record<string, TimedListProgress> }
  // Play: /** Лише в запитанні-списку (27c). */ timedlist?: TimedListPlay;
  // timedlist.ts
  export type ListHit = { kind: 'found'; id: string } | { kind: 'repeat'; id: string } | { kind: 'miss' };
  export function listHit(items: readonly TimedListItem[], found: readonly string[], value: string): ListHit;
  export function timedListOf(state: GameState, playerId: string): TimedListProgress;   // без запису — { found: [], wrong: 0 }
  /** Гравці, що грали запитання (N): present ∪ ключі progress серед state.players. */
  export function listPlayers(state: GameState, play: Play): string[];
  export type ListResult = { ok: true; state: GameState; hit: ListHit['kind'] } | { ok: false; error: ErrorCode };
  export function listEntry(state: GameState, playerId: string, word: string, enter: boolean, now: number): ListResult;
  export function scoreTimedList(state: GameState): GameState;   // на етапі question, інакше той самий стан
  /** Бали за кожен пункт для гравця за поточним станом (для зрізу reveal і для scoreTimedList). */
  export function listItemPoints(state: GameState, play: Play): Record<string, { finders: string[]; points: number }>;
  // score.ts
  /** Частка ціни пункту, знайденого k гравцями з n: (n − k + 1) / n; k поза 1…n — 0. */
  export function listShare(n: number, k: number): number;
  // testing/fixtures.ts
  export const timedlist = { ...base, id: 'q11', type: 'timedlist', text: 'Планети Сонячної системи', timeLimit: 90, points: 100, minus: 50,
    items: [ { id: 'l1', text: 'Меркурій', accepted: [] }, { id: 'l2', text: 'Венера', accepted: [] }, { id: 'l3', text: 'Земля', accepted: [] },
             { id: 'l4', text: 'Марс', accepted: ['Червона планета'] }, { id: 'l5', text: 'Юпітер', accepted: [] }, { id: 'l6', text: 'Сатурн', accepted: [] },
             { id: 'l7', text: 'Уран', accepted: [] }, { id: 'l8', text: 'Нептун', accepted: [] } ] } satisfies Question;
  ```
- `listEntry` перевіряє по черзі:
  1. `wrong_phase`, `paused`, `not_started`, `not_found`;
  2. `type_mismatch` — поточне запитання не список;
  3. `not_your_turn` — на клітинці поля не той, хто вибрав;
  4. `already_answered` — уже є запис, тобто знайдено все;
  5. `time_over` (`timeOverFor`).
  Далі `listHit`:
  - `found` — id дописується в `progress`; якщо знайдено всі пункти — запис і `autoLock` (на полі — `revealNow`);
  - `repeat` — стан без змін;
  - `miss` — `wrong + 1` лише при `enter && minus !== null && normalizeText(word) !== ''`, інакше стан без змін.
- `scoreTimedList` бере дані з `listItemPoints` і ставить записи за «Рішеннями плану». Наявні записи тих, хто знайшов усе, переписуються справжніми балами.

- [ ] **Step 1: Write the failing tests.** Спільне:
  - `fresh()` = `startRound(lobbyWith(makeQuiz([timedlist]), 'Олена', 'Тарас', 'Віра', 'Хосе'), 0)`;
  - `enter(s, id, words, now, enter = true)` — послідовні `listEntry`.

  `game.timedlist.test.ts`:
  - `listHit prefers exact, then typos among unfound items`:
    - `'ЮПІТЕР'` → `found l5`;
    - `'Юпітр'` → `found l5`;
    - `'червона  планета'` → `found l4`;
    - при знайденому `l5` слово `'Юпітер'` → `repeat`, а `'Юпітр'` → `repeat`;
    - `'Плутон'` → `miss`;
    - `''` → `miss`;
    - для пунктів `Сатурн`/`Сатурнія` з уже знайденим `Сатурн` слово `'Сатурнія'` → `found` іншого пункту.
  - `a found word takes its place and a repeat changes nothing` — `timedListOf(...).found` `['l5', 'l2']`; повтор повертає `hit: 'repeat'` і стан `toBe` той самий.
  - `a miss costs only on enter and only with a minus`:
    - `enter: false` з `'Плутон'` — `wrong` 0;
    - `enter: true` — `wrong` 1;
    - з `minus: null` — `wrong` 0 і стан `toBe` попередній;
    - повтор з `enter: true` — `wrong` не росте.
  - `refuses after time, on pause, before the start and for other questions` — `time_over`, `paused`, `not_started`, `type_mismatch`; стан не змінюється.
  - `finding everything records at once and the question closes when everyone has` — запис `accepted: true`; запитання відкрите, поки решта не знайшла всього; `tick` після `endsAt` закриває.
  - `scores by rarity among the players present`:
    - Юпітер у всіх чотирьох → 25 кожному; Венера в Олени й Тараса → 75; Марс в Олени → 100; Меркурій у Тараса → 100;
    - Олена з одним мінусом: `25 + 75 + 100 − 50 = 150`; Тарас 200; Віра (лише Юпітер) 25; Хосе (Юпітер) 25;
    - `accuracy` Олени — 3/8, `grade` — `'partial'`, `streakBonus` 0;
    - хто був присутній і нічого не ввів — без запису, але в N.
    - Окремі випадки:
      - пункт, який знайшли всі 4, дає 25;
      - пізній гравець (`addPlayer` після старту), що знайшов Марс, робить N = 5: Марс у двох → 80;
      - вилучений Хосе зменшує N до 3: Юпітер у трьох → 33;
      - множник раунду 2 і ціна 333: один знахідник з 4 → 666;
      - мінус ×2 → −100;
      - підсумок лише з мінусів від'ємний: −50;
      - `speedBonus`, `partial`, `penalty: 'minus'` раунду нічого не змінюють.
  - `teammates fill one list`:
    - у командній грі (2 команди по 2) `actorOf(state, member, 'answer')` дає команду для кожного учасника;
    - знахідки двох учасників у `progress[teamId]`;
    - повтор товариша → `repeat`;
    - N = 2: пункт в обох командах → 50, в одній → 100.
  - `on a board cell only the chooser plays and the cell mark multiplies` — не той, хто вибрав → `not_your_turn`; N = 1; кожен пункт × позначка ×3 → 300; знайдено все → `phase: 'reveal'`.
  - `the plain answer event and the host grade do not apply` — `submitAnswer(..., { type: 'timedlist', … })` → `type_mismatch`; `override` → `wrong_phase`.
  - `removing a player drops their finds` — ключ зникає з `present` і `progress`.

  Інші файли:
  - `score.test.ts`: `listShare(4,1) === 1`, `(4,2) === 0.75`, `(4,4) === 0.25`, `(1,1) === 1`, `(4,0) === 0`, `(4,5) === 0`.
  - `game.buffs.test.ts`: баф на списку відмовляє з `'off_timedlist'`.
  - `restore.test.ts`: `keysOf<Play>` з `'timedlist'`; знімок з `plays[0].timedlist` відновлюється й зберігає знахідки; `GAME_STATE_VERSION` дорівнює 22.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.

- [ ] **Step 3: Implement.** `timedlist.ts` пишеться за зразком `wordladder.ts`: імпорти з `game.ts` використовуються лише під час виклику (той самий цикл імпортів). `withPlay` береться з `./blitz`. `openQuestion` додає `...(question.type === 'timedlist' ? { timedlist: { present, progress: {} } } : {})`.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/engine && tsc -p packages/shared && tsc -p packages/engine`. Очікується PASS. Наявні тести лишаються без змін очікувань, окрім `keysOf<Play>`.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): 27c timed list — typo-forgiving finds, repeats free, a minus only on enter, rarity points among those present, team lists, board cells"
```

---

### Задача 3. Рушій: зрізи, живі відповіді, захист від спойлерів

**Files:**
- Modify: `packages/shared/src/views.ts` (нові типи й необов'язкові поля), `packages/engine/src/views.ts`, `packages/engine/src/live.ts`
- Test: `packages/engine/src/views.timedlist.test.ts` (новий), `packages/engine/src/live.test.ts`

**Interfaces:**
- Consumes: `timedListOf`, `listPlayers`, `listItemPoints` (задача 2).
- Produces (`shared/views.ts`):
  ```ts
  /** Видиме всім: скільки пунктів і мінус (без назв). */
  export interface PublicTimedList { total: number; minus: number | null }
  export interface TimedListRow { playerId: string; nickname: string; found: number; wrong: number;
    /** Бали лише на reveal, інакше null. */ points: number | null }
  export interface TimedListItemView { index: number; text: string;
    /** Хто знайшов: ведучому завжди, іншим лише на reveal. */ finders: string[];
    /** Бали кожному знахіднику — лише на reveal, інакше null. */ points: number | null }
  export interface TimedListInfo { total: number; minus: number | null;
    /** N — гравці, що грали запитання. */ players: number;
    /** За found спаданням, далі в порядку гравців. */ rows: TimedListRow[];
    /** Увесь список: ведучому завжди, іншим лише на reveal; інакше null. */ items: TimedListItemView[] | null }
  export interface PlayerTimedList { found: { index: number; text: string }[]; total: number; wrong: number;
    /** question, не пауза, немає запису. */ canType: boolean; /** Знайдено все. */ done: boolean }
  // PublicQuestion: timedlist?: PublicTimedList
  // BaseView: timedlist?: TimedListInfo
  // HostView: timedlist?: TimedListInfo
  // PlayerView.me: timedlist?: PlayerTimedList
  // LiveProgress: | { kind: 'timedlist'; found: string[]; total: number; wrong: number }   // назви пунктів
  ```
- Поля є лише тоді, коли поточне запитання — список (`question`, `locked`, `reveal`). Інакше ключа немає взагалі: `optional('timedlist', …)`, як `wordladder`.
- `live.ts`: `'timedlist'` додається в `PROGRESS_TYPES` і `UNGRADABLE`.
- `views.ts`: три місця `gradable` (≈ рядки 846, 937, 1041) виключають і список.

- [ ] **Step 1: Write the failing tests** (`views.timedlist.test.ts`). Стан із задачі 2: Олена має Юпітер, Венера, Марс; Тарас — Юпітер, Меркурій.
  - `the public question shows the count and the minus only` — `stageView(s).question.timedlist` дорівнює `{ total: 8, minus: 50 }`, ключа `items` немає.
  - `never sends an unfound item or a spelling before reveal`:
    - на `question` і `locked` `JSON.stringify(stageView(s))` не містить `'Меркурій'`, `'Марс'`, `'Червона планета'`, `'Нептун'`;
    - `JSON.stringify(playerView(s, 'p2'))` (Тарас) не містить `'Марс'` і `'Венера'`;
    - `playerView(s, 'p1').me.timedlist.found` дорівнює `[{ index: 5, text: 'Юпітер' }, { index: 2, text: 'Венера' }, { index: 4, text: 'Марс' }]` (номери з 1).
  - `stage rows carry only counts until reveal, then every item with its finders and points`:
    - на `question` `items` — null, рядки `{ found: 3, wrong: 1, points: null }`;
    - на `reveal` 8 пунктів з `finders`, у Юпітера `points` 25, `players` 4, у рядків — бали.
  - `the host sees the whole list and the finders live` — `hostView(s).timedlist.items[4].finders` з обома; `points` null до reveal; `live` рядок `{ kind: 'timedlist', found: ['Юпітер','Венера','Марс'], total: 8, wrong: 1 }`.
  - `a team member sees the team's finds` — у командній грі `playerView(s, member2).me.timedlist.found` містить знахідку `member1`.
  - `canType follows phase, pause and done`.
  - `other questions keep their views unchanged` — для `single` у зрізах немає ключа `timedlist`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.

- [ ] **Step 3: Implement** за блоком Interfaces. `publicQuestion` додає `timedlist` лише як `{ total, minus }`. Наявний вивід полів (`choices` і т. д.) уже явний, тож `items` туди не просочується. Тест це закріплює.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/engine packages/shared && tsc -p packages/shared && tsc -p packages/engine`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/views.ts packages/engine
git commit -m "feat(engine): 27c timed list views — counts only for the stage until reveal, own finds for the player, the whole list live for the host"
```

---

### Задача 4. Сервер: подія, менеджер, записи, історія, перезапуск

**Files:**
- Modify:
  - `apps/server/src/rooms/manager.ts`: метод `timedList`, рядок `answerStamp`;
  - `apps/server/src/socket.ts`: подія `player:list`;
  - `apps/server/scripts/logic/check.ts`: `case 'timedlist'` — усі написання, для перевірки витоків відповіді.
- Test: `apps/server/src/socket.test.ts`, `apps/server/src/rooms/manager.test.ts`, `apps/server/src/restart.test.ts`, `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts`, `apps/server/src/achievements.test.ts` (лише якщо падає через кількість типів)

**Interfaces:**
- Consumes: `listEntry`, `timedListOf` (задача 2); `timedListWordSchema` (задача 1).
- Produces:
  ```ts
  // manager.ts
  /** Слово списку (27c): у командній грі — будь-який учасник за команду. found → ok; repeat → list_repeat; miss → list_miss (стан з мінусом уже збережено). */
  timedList(room: Room, playerId: string, word: string, enter: boolean): AckResult;   // this.act(room, playerId, 'answer')
  // answerStamp: play?.question.type === 'timedlist' ? timedListOf(state, id) : null
  // socket.ts: 'player:list' (timedListWordSchema) — лише player, інакше FORBIDDEN; кривий payload — INVALID
  ```
- Стан з `listEntry` комітиться через той самий шлях, що й `apply` (`commit` з розсилкою зрізів), **до** того, як ack перекладає `repeat`/`miss` у помилку.

- [ ] **Step 1: Write the failing tests:**
  - `socket.test.ts`, `player:list is player-only and validated`:
    - ведучий і сцена → `forbidden`;
    - `{ word: 5, enter: true }` і 61 символ → `invalid_payload`;
    - справжній пункт → `{ ok: true }`;
    - повтор → `{ ok: false, error: 'list_repeat' }`;
    - промах → `{ ok: false, error: 'list_miss' }`.
  - `manager.test.ts`:
    - `a list miss on enter is kept and still answered as a miss` — з мінусом після промаху гравець отримує новий зріз з `me.timedlist.wrong === 1`, а ack — `list_miss`;
    - `any team member enters list words` — два учасники однієї команди вводять по пункту, обидва в `me.timedlist.found` кожного з них; учасник іншої команди їх не бачить.
  - `restart.test.ts`, `a restored room keeps every player's list finds` — збережена й піднята кімната має той самий `play.timedlist` (`present` і `progress`).
  - `recorder.test.ts`, `a timed list answer is recorded with its summary` — `payload: { type: 'timedlist', found: ['l5','l2','l4'], total: 8, wrong: 1 }`, `points: 150`.
  - `history.test.ts`, `a timed list game lands in the history with rarity points` — підсумкові бали гравців у записі гри дорівнюють балам рушія.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/socket.test.ts apps/server/src/rooms/manager.test.ts apps/server/src/restart.test.ts apps/server/src/recorder.test.ts apps/server/src/history.test.ts`. Очікується FAIL.

- [ ] **Step 3: Implement.** Обмеження частоти для події не потрібне. Стан обмежений сам: у `progress` лише id пунктів (≤ 30) і лічильник, а телефон шле не більше одного запиту за раз.

- [ ] **Step 4: Run** тести з кроку 2, потім увесь `pnpm vitest run --maxWorkers=2 apps/server/src apps/server/scripts`, потім `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Очікується PASS. Якщо тести сценаріїв у `scripts/` чекають на точну кількість типів, оновити їх свідомо з коментарем «27c: новий тип».

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat(server): 27c timed list event — any team member, misses kept with their minus, records, restored rooms"
```

---

### Задача 5. Веб: тексти, формат, історія, довідка, живий рядок і редактор

**Files:**
- Create: `apps/web/src/editor/TimedListEditor.tsx`, `apps/web/src/editor/TimedListEditor.test.tsx`
- Modify:
  - `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts` (`ADDED_27C`), `apps/web/src/locales/{en,pl,de,es,it,ar}.json`;
  - `apps/web/src/format.ts` — `answerText` і правильна відповідь;
  - `apps/web/src/admin/admin-text.ts` (`questionLines`);
  - `apps/web/src/guide-text.ts` — `typeIcon` `'📝'`, `typeHow_timedlist`;
  - `apps/web/src/help/help-uk.ts` (`question.timedlist.*`), `apps/web/src/help/help-vars.ts` (`minListItems`, `maxListItems`), `apps/web/src/help/__fixtures__/help-uk-golden.json` (лише нові id), `apps/web/src/locales/*.help.json`;
  - `apps/web/src/screens/LiveAnswers.tsx` (`case 'timedlist'`);
  - `apps/web/src/editor/draft.ts`:
    - `questionTypesFor`: без `'timedlist'` для `blitz`, `final`, `bets`, `auction`, `wipeout`, `survival`, `ladder`; з ним — для `classic` і `board`;
    - `newQuestion`, копія, чистка, проблеми, `Place.timedlist`;
  - `apps/web/src/editor/QuestionEditor.tsx` — гілка `case 'timedlist'`, відео сховано;
  - `apps/web/src/styles.css` — класи `timedlist-editor-*`.
- Test: `apps/web/src/format.test.ts`, `apps/web/src/guide-text.test.ts`, `apps/web/src/screens/LiveAnswers.test.tsx`, `apps/web/src/editor/draft.test.ts`, `apps/web/src/editor/QuizEditor.test.tsx`, наявні `help-golden.test.ts`, `locales/checks.test.ts`, `source-scan.test.ts`

**Interfaces:**
- Consumes: типи з задач 1 і 3, `LIMITS`.
- Produces:
  ```ts
  // draft.ts
  newQuestion('timedlist') → { ...common, video: null, type: 'timedlist', timeLimit: LIMITS.defaultListTime, points: LIMITS.defaultListPoints,
    minus: null, items: [blank, blank, blank] }   // blank = { id: newId(), text: '', accepted: [] }
  // Place: timedlist: boolean — класика true; клітинка поля — normal && phone; решта раундів false
  // TimedListEditor.tsx
  export function TimedListEditor(props: { question: Extract<Question, { type: 'timedlist' }>; onChange: (q: Question) => void }): JSX.Element;
  ```
- Чистка: `trim` назв і написань. Порожні пункти (назва й написання порожні) відкидаються. Порожні написання відкидаються.
- Проблеми (`TextKey`):
  - `problemListItems: 'У списку має бути від {min} до {max} пунктів'`;
  - `problemListEmpty: 'Пункт {index} без назви'`;
  - `problemListDuplicate: 'Те саме написання в двох пунктах: {text}'`;
  - `problemListPoints: 'Ціна пункту × кількість пунктів — не більше {max}'`;
  - `problemListPlace: 'Список на час — лише в класичному раунді й на звичайній клітинці поля з телефона'`.
- UI (зразок — `SurveyEditor.tsx`):
  - рядки «Пункт {index}» (`listItemN`) з групою «Інші написання пункту {index}» (`listOtherSpellings`);
  - кнопки `addListItem: 'Додати пункт'`, `removeListItem: 'Прибрати пункт {index}'`, `listItemUp`/`listItemDown` ('Вище'/'Нижче' — номер клітинки = порядок);
  - `NumberField` «Ціна пункту» (`listPrice`);
  - прапорець «Мінус за слово не зі списку» (`listMinusOn`) і `NumberField` «Скільки знімати» (`listMinus`, типово `LIMITS.defaultListMinus`);
  - підказка `listHint: 'Гравці вводять пункти на телефоні без кнопки: правильне слово саме стає на своє місце. Описки прощаються. Рідкісний пункт дає більше: знайдений k гравцями з N — ціна × (N − k + 1) / N.'`.
- Інші uk-ключі цієї задачі (усі йдуть в `ADDED_27C`; задача 6 дописує туди свої):
  ```ts
  type_timedlist: 'Список на час',
  typeShort_timedlist: 'список на час',
  typeHow_timedlist: 'Назвіть якомога більше пунктів зі схованого списку. Що рідкісніша знахідка, то більше балів.',
  buffWhy_off_timedlist: 'У списку на час бафів немає.',
  listAnswer: 'Знайдено {found} з {total}',
  listAnswerWrong: 'Знайдено {found} з {total} · помилок: {wrong}',
  listLive: '{found} / {total}',
  err_list_miss: 'Такого пункту немає в списку',
  err_list_repeat: 'Цей пункт уже знайдено',
  ```
- `answerText(answer, question)`:
  - `listAnswer`, або `listAnswerWrong`, коли `wrong > 0`;
  - правильна відповідь — `items.map((i, n) => \`${n + 1}. ${i.text}\`).join(', ')`.
- Живий рядок пульта: `listLive` і назви знайдених пунктів через « · », а при `wrong > 0` ще й `−{wrong}`.
- Довідка `question.timedlist`:
  - `title`, `what`;
  - `how.0–2` — поле без кнопки; клітинки й лічильник; Enter і мінус;
  - `points.0–1` — формула з прикладом 100 / 75 / 50 / 25 для 4 гравців; повтор і впізнана описка без мінуса;
  - `tip.0` — додавайте поширені інші написання;
  - `limits.0–1`:
    - `{minListItems}–{maxListItems} пунктів.`;
    - `Лише класика й звичайна клітинка поля з телефона; без відео й бафів.`

- [ ] **Step 1: Write the failing tests:**
  - `format.test.ts`:
    - `answerText({ type: 'timedlist', found: ['l5','l2','l4'], total: 8, wrong: 1 }, listQ)` → `'Знайдено 3 з 8 · помилок: 1'`;
    - з `wrong: 0` → `'Знайдено 3 з 8'`;
    - правильна відповідь починається з `'1. Меркурій, 2. Венера'`.
  - `guide-text.test.ts`: `typeHow('timedlist').length > 10`.
  - `LiveAnswers.test.tsx`: `progress: { kind: 'timedlist', found: ['Юпітер','Марс'], total: 8, wrong: 1 }` показує «2 / 8», обидві назви й «−1».
  - `draft.test.ts`:
    - `newQuestion('timedlist')` → `toMatchObject` з блоку Interfaces;
    - `questionTypesFor` для `blitz | final | bets | auction | wipeout` без `'timedlist'`, для `classic | board` — з ним;
    - чистка прибирає порожній пункт і порожні написання;
    - кожна проблема з переліку;
    - список на бліц-клітинці → `problemListPlace`;
    - змінений на список тип прибирає відео.
  - `TimedListEditor.test.tsx`, `edits items, spellings, order, price and the minus` — додати пункт, написання, «Нижче» міняє номери, увімкнути мінус 50.
  - `QuizEditor.test.tsx`, `saves a timed list` — збережено `{ type: 'timedlist', items: [...8], points: 100, minus: 50, video: null }`.
  - `i18n.test.ts`: `ADDED_27C` з усіма ключами задачі.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/format.test.ts apps/web/src/guide-text.test.ts apps/web/src/screens/LiveAnswers.test.tsx apps/web/src/editor apps/web/src/i18n.test.ts apps/web/src/help apps/web/src/locales`. Очікується FAIL.

- [ ] **Step 3: Implement.** Переклади 6 мов пишуться природно, з тими самими плейсхолдерами. Для `ar` — за наявним стилем файлу.

- [ ] **Step 4: Run** тести з кроку 2, `apps/web/src/source-scan.test.ts` і `pnpm typecheck`. Очікується PASS: від цієї задачі повний typecheck зелений.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 27c timed list texts, answer format, live row, host help, editor with spellings, order, price and minus"
```

---

### Задача 6. Веб: телефон, сцена й пульт

**Files:**
- Create: `apps/web/src/screens/TimedListView.tsx`, `apps/web/src/screens/TimedListView.test.tsx`
- Modify:
  - `apps/web/src/screens/PlayerScreen.tsx` — етапи `question`, `locked`, `reveal`; глядач клітинки поля;
  - `apps/web/src/screens/StageScreen.tsx` — підказка `hint` (≈ рядок 220), лічильник (≈ рядок 238), блок інформації (≈ рядок 418), виключення з рядка «Правильна відповідь» (≈ рядок 476);
  - `apps/web/src/screens/HostScreen.tsx` — блок, як для `wordladder` (≈ рядок 1076);
  - `apps/web/src/styles.css`, `apps/web/src/i18n.ts`, 6 json, `ADDED_27C`.
- Test: `apps/web/src/screens/PlayerScreen.test.tsx`, `apps/web/src/screens/StageScreen.test.tsx`, `apps/web/src/screens/HostScreen.test.tsx`

**Interfaces:**
- Consumes: `PublicTimedList`, `PlayerTimedList`, `TimedListInfo` (задача 3); подія `player:list` (задача 4); `errorText`.
- Produces:
  ```tsx
  /** Нумеровані клітинки: знайдені — з назвою; fresh — щойно знайдена (анімація), again — повтор (блимання). */
  export function TimedListCells(props: { total: number; found: { index: number; text: string }[]; fresh?: number | null; again?: number | null }): JSX.Element;
  /** Телефон: лічильник, поле без кнопки, клітинки; живе введення через 400 мс, Enter — з мінусом. */
  export function TimedListPlay(props: { list: PlayerTimedList; question: PublicQuestion; paused: boolean; send: Send }): JSX.Element;
  /** Рядки гравців: «6 / 10», помилки; на reveal — бали. */
  export function TimedListBoard(props: { info: TimedListInfo; reveal: boolean }): JSX.Element;
  /** Увесь список: номер, назва, знахідники (імена), бали кожному; mine — підсвітити власні знахідки. */
  export function TimedListReveal(props: { info: TimedListInfo; mine?: string }): JSX.Element;
  ```
- uk-ключі:
  - `listLabel: 'Ваш варіант'`;
  - `listCount: '{found} / {total}'`;
  - `listMinusNote: 'Слово не зі списку: −{minus}'`;
  - `listWrong: 'Помилок: {wrong}'`;
  - `listDone: 'Усе знайдено!'`;
  - `listOnPhone: 'Пишіть пункти на телефоні'`;
  - `listFoundOf: 'Знайшли: {found} з {total}'`;
  - `listTitle: 'Список на час'`;
  - `listFinders: 'Знайшли: {names}'`;
  - `listNobody: 'Ніхто не знайшов'`;
  - `listPlayersNote: 'Гравців: {n} · рідкісніше — дорожче'`;
  - `listCellN: 'Клітинка {index}'` (`aria-label` порожньої клітинки).
- Поведінка телефона:
  - поле `maxLength={LIMITS.listWord}`, `autoCapitalize="none"`, `autoComplete="off"`, `autoCorrect="off"`, `spellCheck={false}`, `enterKeyHint="done"`; фокус лишається в полі;
  - кнопки «Надіслати» немає, а форма з `onSubmit` шле `enter: true`;
  - зміна поля → таймер 400 мс → `enter: false`, якщо значення непорожнє й відрізняється від останнього перевіреного;
  - `busy`-ref тримає один запит; поки він іде, остання зміна чекає й іде після ack;
  - `ok` (found) чи `list_repeat` очищує поле, **лише якщо** в ньому досі те саме слово. Знайдене стає в клітинку з `fresh`, а при повторі блимає клітинка з `again`, визначена за назвою з `list.found`;
  - `list_miss` після `enter: true` трусить поле й очищує його. Якщо `minus !== null` — показ «−{minus}» на 1,5 с і рядок `listWrong`. Після `enter: false` нічого не відбувається;
  - `role="status"` з `aria-live="polite"` читає «Знайдено: Юпітер» чи `err_list_repeat`;
  - лічильник `listCount` і, коли `minus !== null`, `listMinusNote` над полем;
  - `done` ховає поле й показує `listDone`;
  - власного годинника немає: працює загальний `Timer` екрана.
- `PlayerScreen`:
  - на `question` з `me.timedlist` рендериться `TimedListPlay` (у командній грі — у кожного учасника);
  - глядач клітинки поля бачить `TimedListBoard` з рядком того, хто вибрав;
  - на `locked` — `TimedListCells` і лічильник;
  - на `reveal` — `TimedListReveal mine={me.id}`.
- Сцена:
  - на `question` — текст завдання, `listOnPhone`, `listFoundOf` (сума — найбільше `found` серед рядків, як у `wordLadderFinishedOf`) і `TimedListBoard` без пунктів;
  - на `reveal` — `TimedListReveal` (на 1600×900 — дві колонки від 11 пунктів), `listPlayersNote` і `TimedListBoard reveal`;
  - загальний рядок «Правильна відповідь» для списку не показується.
- Пульт: `listTitle`, `TimedListReveal` з живими знахідниками (бали лише на reveal) і `TimedListBoard`. Кнопок оцінки немає.

- [ ] **Step 1: Write the failing tests** (`TimedListView.test.tsx`, `send` — `vi.fn`, фейкові таймери):
  - `shows the counter and numbered empty cells` — «0 / 8», 8 клітинок з `aria-label` «Клітинка 1»…
  - `a pause in typing checks the word without enter` — через 400 мс `send('player:list', { word: 'Юпітер', enter: false })`; до 400 мс — нічого.
  - `enter sends with enter: true; a miss with a minus shakes and shows −50` — ack `list_miss`: поле порожнє, «−50» видно; з `minus: null` «−50» немає.
  - `a repeat flashes the found cell and costs nothing` — ack `list_repeat`: клітинка «Юпітер» має `.is-again`, поле порожнє.
  - `one request at a time and a cleared field only for the word that was sent` — два значення під час запиту: один виклик, друге значення йде після ack; якщо гравець дописав поле, ack `ok` його не стирає.
  - `found words take their numbered place` — `found: [{ index: 5, text: 'Юпітер' }]` у 5-й клітинці.
  - `done hides the input`.
  - `TimedListBoard shows counts during play and points on reveal`.
  - `TimedListReveal lists every item with finders and per-finder points; nobody — «Ніхто не знайшов»`.
  - `PlayerScreen.test.tsx`: на `question` з `me.timedlist` рендериться поле `listLabel` без кнопки submit; на `reveal` — список з підсвіченими власними пунктами.
  - `StageScreen.test.tsx`, `a timed list shows only counts while playing, then the whole list` — до `reveal` немає тексту `Меркурій`, на `reveal` він є разом з іменами знахідників.
  - `HostScreen.test.tsx`, `the host sees the list and the finders live`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/TimedListView.test.tsx apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/screens/StageScreen.test.tsx apps/web/src/screens/HostScreen.test.tsx apps/web/src/i18n.test.ts apps/web/src/locales`. Очікується FAIL.

- [ ] **Step 3: Implement** за зразком `WordLadderPlay` (форма, `busy`, фокус) і `WordLadderBoard`. Анімації — з «Рішень плану», з `prefers-reduced-motion`.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 apps/web`, `apps/web/src/source-scan.test.ts` і `pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 27c timed list on the phone, stage and host — no send button, numbered cells, counts only while playing, the whole list with finders on reveal"
```

---

### Задача 7. Наскрізні сценарії й кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`; `apps/web/src/styles.css` (лише якщо кадри покажуть ваду, окремим комітом)

**Interfaces:**
- Consumes: усе вище. Помічники e2e:
  - `open`, `register`, `join`, `click`, `field`, `shot`, `afterSplash`, `expectNoSideScroll`, `snapshot`, `liveRow`;
  - `socketFrames`, `pickTeamOn`, `stageTeam`;
  - `makeRoundsQuiz`, `classicRound`, збереження через `POST /api/quizzes`.
- Помічники цього сценарію:
  - `listInput27c(page)` — `.timedlist-form input`;
  - `listType27c(page, word, { enter })` — `fill`, далі або `press('Enter')`, або очікування авто-перевірки 400 мс;
  - `listCells27c(page)` — тексти клітинок;
  - `listCount27c(page)`.

- [ ] **Step 1: Write the scenario.** `it('part 27c: a timed list — typos forgiven, repeats free, a minus only on enter, rarity points for four players, a team list, only counts on the stage', …)` за зразком `part 26c` (`try/catch` → `snapshot()`).
  - **Редактор.** Ведучий через редактор створює класичний раунд і в ньому два запитання.
    - **Запитання 1:** «Планети Сонячної системи», 8 пунктів (Марс з написанням «Червона планета»), ціна 100, мінус 50, 90 с.
    - **Запитання 2:** «Кольори веселки», 7 пунктів, ціна 100, без мінуса, 60 с.
    - Перевірки редактора: дубль написання показує `problemListDuplicate`, після виправлення проблема зникає.
    - Кадр `timedlist27c-editor`.
  - **Гра.** Сцена 1600×900 (`socketFrames`). Телефони:
    - Оля — 375×812;
    - Тарас — 360×740 (`socketFrames`);
    - Іра — 360×740;
    - Хосе — 320×640 `es-ES`.
  - **Запитання 1 (мінус увімкнено):**
    - Оля:
      - `Юпітр` без Enter → стає в клітинку 5 (описка);
      - `юпітер` з Enter → повтор, лічильник лишається «1 / 8», без «−50»;
      - `Венера`, `червона планета` → «3 / 8»;
      - `Плутон` без Enter → нічого;
      - потім з Enter → «−50» і «Помилок: 1».
    - Тарас: `Юпітер`, `Венера`, `Меркурій`.
    - Іра: `Юпітер`.
    - Хосе: `Юпітер`.
    - Перевірки до розкриття:
      - на сцені рядки «3 / 8», «3 / 8», «1 / 8», «1 / 8»;
      - у `stage.content()` і в `stageFrames` немає `Меркурій`, `Марс`, `Червона планета`, `Нептун`;
      - у `tarasFrames` немає `Марс`;
      - пульт бачить знахідки Олі наживо (`liveRow`);
      - `expectNoSideScroll(hose, 'timedlist27c-phone-es-320')` з клітинками в дві колонки;
      - ведучий закриває запитання наявною кнопкою.
    - На розкритті сцена показує всі 8 пунктів:
      - у Юпітера знахідники Оля, Тарас, Іра, Хосе — «+25»;
      - Венера — Оля й Тарас, «+75»;
      - Марс і Меркурій — «+100»;
      - Нептун — «Ніхто не знайшов».
    - Бали: Оля +150, Тарас +200, Іра +25, Хосе +25.
  - **Запитання 2 (мінус вимкнено):**
    - Оля: `синій`; `фіолетовй` (описка) → «2 / 7»; `Плутон` з Enter → без «−» і без рядка помилок.
    - Тарас: `синій`.
    - На розкритті: синій (k = 2 з N = 4) — «+75» Олі й Тарасу, фіолетовий (лише Оля) — «+100». За запитання Оля отримує +175 без мінуса, Тарас — +75.
  - **Історія.** Історія гри Олі показує «Знайдено 3 з 8 · помилок: 1» і «Знайдено 2 з 7».
  - **Команди** (друга вікторина через API, `teams: { count: 2, names: ['Червоні', 'Сині'] }`, одне запитання «Обласні центри України» з 8 пунктів: Київ, Львів, Харків, Одеса, Дніпро, Вінниця, Полтава, Ужгород; ціна 100, без мінуса):
    - Оля й Петро (Червоні) вводять різні міста — обидва телефони показують обидві знахідки; Петро вводить місто, яке вже знайшла Оля → повтор;
    - Іра (Сині) вводить Київ і Ужгород;
    - на розкритті Київ у двох команд «+50», решта — «+100»;
    - Марко (Синій) бачить знахідки Іри й не бачить знахідок Червоних (`markoFrames`).
  - **Кадри (`E2E_SHOTS=1`):**
    - `timedlist27c-phone-typing`, `timedlist27c-phone-found`, `timedlist27c-phone-repeat`, `timedlist27c-phone-minus`, `timedlist27c-phone-es-320`;
    - `timedlist27c-stage-question`, `timedlist27c-host-live`, `timedlist27c-stage-reveal`, `timedlist27c-phone-reveal`;
    - `timedlist27c-team-phone`, `timedlist27c-team-stage-reveal`.

- [ ] **Step 2: Run** `pnpm build`, потім на передньому плані `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 27c"` (менше 10 хв). Очікується PASS.

- [ ] **Step 3: Переглянути кадри:**
  - клітинки на 320/360 px не вилазять;
  - анімація не лишає клітинку в проміжному стані на кадрі;
  - на сцені 1600×900 список у дві колонки без обрізаних назв;
  - іспанська й арабська розкладки цілі.
  Якщо щось ламається — виправити CSS, окремим комітом.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2` (усе) і `pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts
git commit -m "test(e2e): part 27c timed list — typo, repeat, minus on and off, rarity points for four players, a team list, counts only on the stage"
```
