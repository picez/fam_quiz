# План 27d: тип запитання «Слова з літер»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Виконується після мержу 27c («Список на час»).** План спирається на назви 27c: `Play.timedlist`, `timedlist.ts`, `listEntry`, `player:list`, `ADDED_27C`, `off_timedlist`, `timedlist_place`, `TimedListView.tsx`, номер `GAME_STATE_VERSION`. Також на номери рядків у `game.ts`, `views.ts`, `StageScreen.tsx`, `HostScreen.tsx`. **Перед кожною задачею виконавець звіряє ці назви й місця з фактичним кодом `main` після мержу 27c.** Розбіжність — не привід міняти рішення цього плану, лише назви й рядки.

**Мета:** новий тип запитання `letterwords`. Ведучий задає набір літер: або вписує його сам, або задає кількість, і тоді набір підбирає гра. Ще ведучий обирає ціль («найдовше слово» чи «якнайбільше слів») і суму. Гравці (команди) на телефоні складають слова з набору, кожне перевіряється словником «Словесної драбини» на сервері. Бали:
- *якнайбільше слів* — сума за кожне слово або сума за кожну літеру кожного слова;
- *найдовше слово* — сума за кожну літеру найдовшого слова гравця.

Після часу сцена показує найкращі слова кожного гравця й одне-два найдовші можливі слова з цього набору.

**Архітектура:**
- **Дані (`shared`).** Запитання:
  ```ts
  { ...base, type: 'letterwords',
    set: { kind: 'fixed'; letters: string } | { kind: 'random'; count: number },
    goal: 'most' | 'longest',
    per: 'word' | 'letter' }
  ```
  - `points` з `base` — сума **за одиницю** (слово чи літеру);
  - новий файл `packages/shared/src/letterwords.ts` з правилами літер, спільними для схеми, рушія, сервера й телефона: `letterSet`, `wordLetters`, `fitsLetters`, `LETTER_VOWELS`;
  - ключ слова — наявний `ladderKey` з `packages/shared/src/wordladder.ts`.
- **Словник (`apps/server`).** Той самий `apps/server/data/wordladder-uk.txt`: 24 971 іменник, **3–7 літер**. Клієнт словника не отримує ніколи. Наявний `NounDictionary` (`apps/server/src/wordladder/nouns.ts`) дістає метод `keys()`. Новий модуль `apps/server/src/letterwords/deal.ts`:
  - лінивий індекс літер словника;
  - `pickLetters(index, count, rng)` — випадковий набір;
  - `dealOf(index, letters)` — найдовші можливі слова й кількість можливих слів.
- **Стан (`engine`).** Необов'язкове `Play.letterwords?: LetterWordsPlay = { letters: string[] | null; best: string[] | null; possible: number | null; progress: Record<id, { words: string[] }> }`.
  - `openQuestion` записує `letters` для свого набору, а для випадкового — `null`. `best` і `possible` завжди `null`: рушій словника не знає.
  - **Роздача** — `lettersDue(state)` і `dealLetters(state, deal)`. Набір і найкращі слова дописує сервер.
  - Новий файл `packages/engine/src/letterwords.ts`: `letterWordsOf`, `letterWord`, `scoreLetterWords`, `lettersDue`, `dealLetters`, `letterPoints`. Словника рушій не знає: `isNoun` приходить аргументом, як у `ladderWord`.
- **Роздача на сервері — одна точка.** `RoomManager.commit` першим кроком (після `awayStep`) викликає `this.dealLetters(state)`. Коли `lettersDue(state) !== null`, сервер рахує роздачу з `this.rng` кімнати й словника і кладе її в стан **до** розсилки, збереження й планування автопілота. Нове запитання відкривається будь-яким шляхом: `next`, `tick`, автопілот, `pickCell`. Усі вони проходять через `commit`, тож жоден зріз не виходить без набору. Знімок після перезапуску вже містить роздачу, і другої не буде.
- **Зрізи.** Нові поля **необов'язкові** й присутні лише на запитанні цього типу (`question`, `locked`, `reveal`): `PublicQuestion.letterwords`, `BaseView.letterwords`, `HostView.letterwords`, `PlayerView.me.letterwords`. Зрізи інших запитань не змінюються байт у байт, як у 26c/27c.
- **Сервер.** Подія `player:letters { word }`. Ack — `ok` або помилка: `word_unknown` (наявна, «Такого слова не існує»), `letters_not_in_set`, `letters_short`, `letters_repeat`, `letters_too_many`. Маршрут редактора `POST /api/letterwords/check { letters }` → `{ possible, best }`, за зразком `apps/server/src/wordladder-routes.ts`. Це лише попередження ведучому.
- **Веб.** Нові файли:
  - `apps/web/src/editor/LetterWordsEditor.tsx` (зразок — `WordLadderEditor.tsx`);
  - `apps/web/src/screens/LetterWordsView.tsx` (`LetterTiles`, `LetterWordsPlay`, `LetterWordsBoard`, `LetterWordsReveal`; зразок — `WordLadderView.tsx` і `TimedListView.tsx`).

**Технології:** TypeScript, zod 4, vitest, Fastify + Socket.IO, React 19 + Vite, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-11-10-letter-words-design.md`, уся.

## Глобальні обмеження

- 7 мов без ru, нові ключі в усі 7 локалей і списки в i18n.test.ts:
  - uk — у `apps/web/src/i18n.ts`;
  - список `ADDED_27D` додати в `apps/web/src/i18n.test.ts` і в умову `adds no uk keys beyond the agreed list`, поруч з `ADDED_27C`;
  - переклади — у `apps/web/src/locales/{en,pl,de,es,it,ar}.json`;
  - довідка — у `help-uk.ts`, у `help-uk-golden.json` і в `*.help.json`.
- Нічого про росію (і в прикладах). Набори й слова в тестах, e2e й довідці беремо з побуту й природи: «морквасті» (морква, острів, ставок), «квітнесар» (верстак, кентавр, сітка).
- `GAME_STATE_VERSION` можна підвищити (READABLE_STATE_VERSIONS лишити старі читабельними, якщо поля лише додаються). Власник дозволив пушити без запиту.
  - **Рішення плану:** версія **не** підвищується. Тип і `Play.letterwords` необов'язкові, старі знімки їх не містять, як у 26c/27c.
  - У `restore.ts` над `READABLE_STATE_VERSIONS` додається лише коментар: «27d без нової версії: тип 'letterwords' і необов'язкове Play.letterwords».
  - Якщо після 27c версію все ж підняли, лишити ту, що є.
- Юніт-тести: `pnpm vitest run --maxWorkers=2 <шлях>`.
- Ніколи не запускати prettier.
- e2e: `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t <назва>`. Тут назва — `"part 27d"`, запуск на передньому плані, менше 10 хв.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`).
- Таймери у фікстурах, e2e й прикладах ≥ 25 с. Типовий — 90 с.
- Тип не діє в бліці, фіналі, «Ставках», «Аукціоні», «Ва-банку», «Вибуванні», «Мільйонері», у запасних запитаннях і на бліц- чи усній клітинці поля. Перелік — як у 27c, звірити з `timedlist_place`.

## Рішення плану (там, де специфікація мовчить)

- **Назва типу в коді:** `'letterwords'`. У `QUESTION_TYPES` — одразу після `'timedlist'`.
- **Ліміти** (`LIMITS`):
  - `minLetterSet: 4`, `maxLetterSet: 12`, `defaultLetterSet: 9`;
  - `minLetterWord: 3` — найкоротше слово;
  - `letterWord: 30` — довжина поля й події;
  - `maxLetterWords: 80` — слів на гравця (команду), щоб стан був обмежений; далі `letters_too_many`;
  - `defaultLetterTime: 90`, `defaultLetterWordPoints: 20`, `defaultLetterLetterPoints: 10`.
  - Межі набору: від 4 літер, бо з меншої кількості майже нічого не складається. До 12 — це два ряди плиток на 320 px.
  - Словник має слова лише до 7 літер, тож «найдовше можливе» ≤ 7. Довідка й підказка редактора про це кажуть.
- **Набір ведучого** (`set.kind === 'fixed'`):
  - `letterSet(text)` робить NFC, малі літери (`toLocaleLowerCase('uk')`), викидає пробіли, коми, дефіси й апострофи (`'’ʼ‘\``);
  - лишаються тільки літери `[а-щьюяєіїґ]`. Будь-який інший символ → `null` (`letterwords_letters`); довжина поза 4…12 — та сама помилка;
  - збережений рядок ведучого не переписується, а нормалізується щоразу через `letterSet`.
- **Нормалізація, як у драбині:**
  - ключ слова — `ladderKey`. «ґ» і «г» — **різні** літери, як у словнику й драбині: «ґава» потребує плитки «ґ»;
  - апостроф — не літера й плитки не займає: «м'ясо» з набору «мясо» складається;
  - літери слова — `wordLetters(key) = [...key.replaceAll("'", '')]`; «ь» — звичайна літера набору.
- **Перевірка слова** — `letterWord(state, id, word, now, isNoun)`, по черзі:
  1. `wrong_phase`, `paused`, `not_started` (зокрема коли роздачі ще немає), `not_found`, `bet_skipped` (`betsRefusal`, як у драбині);
  2. `type_mismatch`;
  3. `not_your_turn` — на клітинці поля не той, хто вибрав;
  4. `time_over`;
  5. `ladderKey(word) === null` → `word_unknown`;
  6. менше 3 літер → `letters_short`;
  7. `!fitsLetters(key, letters)` → `letters_not_in_set`;
  8. уже є в списку гравця (команди) → `letters_repeat`, стан без змін, без кари;
  9. `!isNoun(key)` → `word_unknown`;
  10. слів уже `maxLetterWords` → `letters_too_many`.
  - Далі ключ дописується в `progress[actor].words`.
  - Порядок 7 → 9 обрано свідомо: «не з набору» пояснює гравцеві більше, ніж «не існує».
- **Без живої перевірки й без «Готово».** Слово йде лише кнопкою «Додати» чи Enter. Жива перевірка, як у 27c, зарахувала б «кіт» дорогою до «кітель», і це дармове слово. Запитання закривається таймером або ведучим. Записів до закриття немає, бо додавати слова можна до кінця.
- **Випадковий набір** (`pickLetters(index, count, rng)`, детермінований для того самого `rng`):
  1. Ціль `L = min(7, count)`. Спершу — випадкове слово словника довжини `L` або `L − 1` (для `count ≤ 4` — від 3). Його літери входять у набір, тож **хоча б одне слово ≥ 3 літер є завжди**.
  2. Решта `count − |слово|` літер — випадкові за частотою літер у словнику, без «ґ». Голосних (`LETTER_VOWELS` = а е є и і ї о у ю я) у наборі має бути щонайменше `ceil(count × 0.35)`. Інакше випадкову приголосну доповнення замінити голосною.
  3. Перемішати (`shuffle` з рушія чи власний Fisher–Yates з тим самим `rng`).
  4. Порахувати `possible` — скільки слів словника складається з набору.
  5. До 24 спроб. Перша спроба з `possible ≥ GOOD = count >= 8 ? 12 : 5` перемагає. Інакше — найкраща з усіх за `possible`. Це й є «розумно — кілька слів».
  - Індекс — масив `{ key, letters: Uint8Array(33) }` слів словника за довжиною, будується ліниво при першій роздачі. На 25 тис. слів одна перевірка набору займає кілька мс. Тест часу: `pickLetters(…, 12, rng)` < 200 мс.
- **Найдовші можливі слова** — `dealOf(index, letters) → { best, possible }`:
  - `best` — до двох слів найбільшої довжини (у літерах). Якщо такої довжини лише одне слово, друге береться з наступної довжини;
  - сортування: довжина спадно, далі `localeCompare(…, 'uk')`;
  - набір без жодного слова (лише свій набір ведучого) → `best: []`, `possible: 0`. Сцена тоді пише `lettersNoneExist`.
- **Роздача** (`engine`):
  - `lettersDue(state)` — `{ letters: string[] }` (свій набір, `best === null`), `{ count }` (`letters === null`) чи `null`;
  - `dealLetters(state, { letters, best, possible })` дописує роздачу в поточний `Play.letterwords`, лише якщо вона ще потрібна. Інакше повертає той самий стан (`toBe`);
  - менеджер: `dealLetters(state)` — `const due = lettersDue(state); if (due === null) return state;`. Далі `letters = due.letters ?? pickLetters(index, due.count, this.rng)`, `return dealLetters(state, { letters, ...dealOf(index, letters) })`.
- **Бали** (`letterPoints`):
  - `unit = question.points × rulesOf(round).multiplier × (play.board?.multiplier ?? 1)`. Ціна клітинки поля не діє, як у сортуванні й списку;
  - `most` + `word`: `unit × words.length`;
  - `most` + `letter`: `unit × Σ wordLetters(w).length`;
  - `longest`: `unit × max wordLetters(w).length`, у кожного гравця за **його** найдовшим, а не лише в переможця. `per` для `longest` схема примушує бути `'letter'` (`letterwords_per`);
  - без швидкості, без «частково», без `penalty: 'minus'` раунду, без бафів, `streakBonus` 0;
  - `accepted` і `grade: 'correct'` — коли є хоча б одне слово, інакше `'wrong'` (як `share > 0` у драбині);
  - `accuracy`: для `most` — `min(1, words / possible)`, для `longest` — `найдовше / довжина best[0]`. Коли `possible` 0 чи `null` — 0.
- **Записи** з'являються в `scoreLetterWords` при закритті: лише в тих, хто має `progress`, тобто хоча б одне слово. Відповідь — `LetterWordsAnswer { type: 'letterwords'; words: string[]; longest: number }`.
- **Ціна на табло** (`questionPrice`): `longest` → `points × 7`; `most` → `points × 10` (за слово) чи `points × 40` (за літеру). Це лише орієнтир на клітинці. Перевірка `letterwords_points`: ціна ≤ `LIMITS.maxPoints`.
- **Команди:**
  - `actorOf` (`case 'answer'`) для запитання цього типу дає `actor(team)` будь-якому учаснику, як 27c для списку;
  - слова учасників складаються в спільний `progress[teamId]`, повтор від товариша — `letters_repeat`;
  - у режимі `longest` береться найдовше слово команди.
- **Поле:** грає лише той, хто вибрав клітинку. Позначка клітинки множить `unit`.
- **Хто що бачить:**
  - **Набір літер** — усім від відкриття запитання (`PublicQuestion.letterwords.letters`). Це не спойлер.
  - **Сцена й інші гравці під час `question`/`locked`:** для кожного гравця лише `found` (скільки слів). Ні самих слів, ні їхніх довжин, ні `best`, ні `possible`.
  - **Гравець (команда):** свої слова `{ text, letters }` у порядку знахідок.
  - **Ведучий завжди:** усі слова наживо, `best` і `possible`. `points` — лише на `reveal`.
  - **На `reveal` усім:**
    - для кожного гравця найкращі слова: для `longest` — одне найдовше; для `most` — до 3 найдовших і «ще N»;
    - бали;
    - `best` і `possible`.
- **Час для фактів:** `factLimitMs` → `null`, як у драбині й списку.
- **Ручна оцінка:** `overrideGrade` → `wrong_phase` (додати `'letterwords'` поруч із `'timedlist'`).
- **Бафи:** `PlaceBlock` `'off_letterwords'` у `buffs.ts` і текст `buffWhy_off_letterwords`.
- **Досягнення:** нових немає. `all_types` росте сам. Тести, що чекають на точну кількість типів, оновлюються свідомо, як у 27c.
- **Бот автопілота (`testing/autopilot.ts`):** вводить `best[0]` з `isNoun = () => true`. Без роздачі нічого не вводить.
- **Перевірка витоків** (`apps/server/scripts/logic/check.ts`): у цього типу немає відповіді-тексту → `[]`.
- **Плитки на телефоні:**
  - сітка `repeat(auto-fill, minmax(2.75rem, 1fr))`; на 320 px 12 плиток лягають у два ряди без горизонтальної прокрутки;
  - натиск додає літеру в поле;
  - плитка, літеру якої поле вже вичерпало (рахунок за `wordLetters` поля), стає `aria-disabled` і бліда;
  - кнопки `⌫` (`lettersErase`) і «Очистити» (`lettersClear`);
  - перемішати плитки — кнопка `lettersShuffle`, порядок лише локальний;
  - з клавіатури можна вводити будь-що: поле не фільтрує, перевіряє сервер.
  - Клієнт перевіряє лише довжину (≥ 3, кнопка неактивна). Чи слово з набору — каже сервер (`letters_not_in_set`), щоб текст помилки був один.
  - Анімації: нове слово — `letterwords-pop` (250 мс); відмова — трус поля `letterwords-shake` (300 мс); повтор — блимання слова в списку `.is-again`. `prefers-reduced-motion: reduce` вимикає всі три.
- **Демо-вікторини** не змінюються.

## Порядок збирання

- Задача 1 додає тип у `Question` і `Answer`. Через вичерпні `switch` у `apps/web` повний typecheck у задачах 1–4 не проходить. Там перевірка: `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Від задачі 5 — повний `pnpm typecheck`.
- Залежності: 2 ← 1; 3 ← 2; 4 ← 2, 3; 5 ← 3; 6 ← 4, 5; 7 — остання.

## Фокус рев'ю

1. **Словник не йде на клієнт і спойлерів немає.**
   - До `reveal` `JSON.stringify` зрізу сцени й будь-якого гравця не містить `best`, `possible` і чужих слів;
   - p1 не бачить слів p2, а `PublicQuestion` не має нічого, крім набору, цілі, способу й суми;
   - `apps/web` не імпортує `wordladder-uk.txt` і `nouns.ts`.
   - Тести: задача 3, `never sends a word or the best words before reveal`; задача 7 — через `socketFrames`.
2. **Роздача.**
   - Випадковий набір завжди містить слово ≥ 3 літер;
   - детермінований за `rng`;
   - роздається один раз, і жоден зріз не виходить з `letters: null`;
   - після перезапуску набір той самий.
   - Тести: задача 4, `a random set always holds a dictionary word and is the same for the same rng`, `every opened letters question is dealt before anyone sees it`, `a restored room keeps its set and words`.
3. **Перевірка слова:** порядок відмов, «ґ» ≠ «г», апостроф без плитки, повтор кількості літер (`мама` з одним «м» — `letters_not_in_set`), повтор слова без кари. Тест: задача 2, `refusals come in order and a repeat costs nothing`.
4. **Бали:** усі три способи, множники раунду й клітинки, `longest` для кожного за своїм словом, команда — найдовше слово команди. Тест: задача 2, `scores per word, per letter and by the longest word`.
5. **Команди:** спільний список, повтор товариша, учасник іншої команди не бачить слів. Тести: задача 2, `teammates fill one word list`; задача 4, `any team member adds letter words`.
6. **Подвійні запити на телефоні:** один запит за раз, поле очищується лише тоді, коли в ньому досі те саме слово. Тест: задача 6, `one request at a time and a cleared field only for the word that was sent`.

---

### Задача 1. Спільне: схема, ліміти, правила літер, підсумок, подія, помилки

**Files:**
- Create: `packages/shared/src/letterwords.ts`, `packages/shared/src/letterwords.test.ts`
- Modify:
  - `packages/shared/src/quiz.ts`:
    - `LIMITS`, `QUESTION_TYPES`;
    - гілка `questionSchema`;
    - перевірки `superRefine` запитання (`letterwords_letters`, `letterwords_per`, `letterwords_points`, `letterwords_video`);
    - `letterwords_place` у `quizSchema` поруч з `timedlist_place`;
    - `questionPrice`.
  - `packages/shared/src/index.ts` (експорт), `packages/shared/src/answer.ts`, `packages/shared/src/events.ts`, `packages/shared/src/game.ts` (`ErrorCode`), `packages/shared/src/facts.ts`
- Test: `packages/shared/src/quiz.test.ts`, `packages/shared/src/facts.test.ts`

**Interfaces (Produces):**
```ts
// letterwords.ts (LIMITS читати лише всередині функцій — цикл імпорту з quiz.ts, як у wordladder.ts)
export const LETTER_VOWELS: ReadonlySet<string>;              // а е є и і ї о у ю я
/** Набір ведучого → літери; інший символ чи довжина поза minLetterSet…maxLetterSet — null. */
export function letterSet(text: string): string[] | null;
/** Літери ключа ladderKey без апострофа. */
export function wordLetters(key: string): string[];
/** Чи складається ключ з набору: кожна літера — не більше разів, ніж у наборі. */
export function fitsLetters(key: string, letters: readonly string[]): boolean;
// quiz.ts
LIMITS: minLetterSet: 4, maxLetterSet: 12, defaultLetterSet: 9, minLetterWord: 3, letterWord: 30, maxLetterWords: 80,
        defaultLetterTime: 90, defaultLetterWordPoints: 20, defaultLetterLetterPoints: 10
export const LETTER_GOALS = ['most', 'longest'] as const;
export const LETTER_UNITS = ['word', 'letter'] as const;
{ ...base, type: z.literal('letterwords'),
  set: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('fixed'), letters: z.string().trim().min(1).max(40).refine(isStorable, UNSTORABLE) }),
    z.object({ kind: z.literal('random'), count: z.number().int().min(LIMITS.minLetterSet).max(LIMITS.maxLetterSet) }) ]),
  goal: z.enum(LETTER_GOALS), per: z.enum(LETTER_UNITS) }
// answer.ts
export interface LetterWordsAnswer { type: 'letterwords'; words: string[]; longest: number }   // лише рушій
// events.ts
export const letterWordSchema = z.object({ word: z.string().max(LIMITS.letterWord).refine(isStorable, UNSTORABLE) });
export const letterCheckSchema = z.object({ letters: z.string().max(40) });
'player:letters': (payload: z.infer<typeof letterWordSchema>, ack: Ack) => void;
// game.ts ErrorCode: | 'letters_not_in_set' | 'letters_short' | 'letters_repeat' | 'letters_too_many'
// facts.ts: letterwords → null
```

- [ ] **Step 1: Write the failing tests.**
  - `letterwords.test.ts`:
    - `letterSet normalises the host's letters` — `'М о, р-к в а с т і'` → `['м','о','р','к','в','а','с','т','і']`; `'abc'` → null; `'кіт'` (3) → null; 13 літер → null; `"м'ясо"` → `['м','я','с','о']`;
    - `fitsLetters counts every letter` — `fitsLetters('морква', set('морквасті'))` true; `'мама'` з одним «м» і одним «а» → false; `'ґава'` з набору з «г» → false; `"м'ясо"` з `['м','я','с','о']` → true.
  - `quiz.test.ts`, помічник `lettersQ(patch)` — свій набір «морквасті», `goal: 'most'`, `per: 'word'`, `points: 20`, 90 с:
    - `accepts a letters question with a fixed or a random set`;
    - `refuses bad letters, a longest goal per word, a video and too many points` → `letterwords_letters` (`'abc'`, 3 літери), `letterwords_per` (`goal: 'longest', per: 'word'`), `letterwords_video`, `letterwords_points` (`points: 1000, per: 'letter'`), `count: 3` і `count: 13` — помилка схеми;
    - `letters questions play in classic rounds and normal phone cells only` — той самий перелік місць, що в 27c (`timedlist_place`), з кодом `letterwords_place`;
    - `old quizzes still parse`;
    - `answerSchema never accepts a letters summary; the event is limited` — 31 символ → false;
    - `questionPrice of letters is a guide for the board` — `longest` 10 → 70; `most`/`word` 20 → 200; `most`/`letter` 10 → 400.
  - `facts.test.ts`: `a letters question has no answer window`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared`. Очікується FAIL.
- [ ] **Step 3: Implement** за блоком Interfaces.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/shared && tsc -p packages/shared`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): 27d letter words question — fixed or random set, most or longest, per word or letter, letter rules shared with the server and phone"
```

---

### Задача 2. Рушій: роздача, перевірка слова, бали, команди, поле

**Files:**
- Create: `packages/engine/src/letterwords.ts`, `packages/engine/src/game.letterwords.test.ts`
- Modify:
  - `packages/engine/src/game.ts`:
    - `LetterWordsPlay`, `Play.letterwords`;
    - `openQuestion` — `letters` зі свого набору чи `null`;
    - `submitAnswer` — `type_mismatch`;
    - `lockNow` і друге місце ланцюжка `score…` — `scoreLetterWords` поруч із `scoreTimedList`;
    - `overrideGrade` — `wrong_phase`;
    - `removePlayer` — прибрати `progress`.
  - `packages/engine/src/team-act.ts`, `packages/engine/src/buffs.ts` (`'off_letterwords'`), `packages/engine/src/index.ts`, `packages/engine/src/restore.ts` (коментар)
  - `packages/engine/src/testing/fixtures.ts` (`letterwords`, `letterwordsRandom`), `packages/engine/src/testing/autopilot.ts`
- Test: `packages/engine/src/game.buffs.test.ts`, `packages/engine/src/restore.test.ts` (`keysOf<Play>`), `packages/engine/src/game.teams-act.test.ts`

**Interfaces:**
- Consumes: `ladderKey`, `letterSet`, `wordLetters`, `fitsLetters`, `LetterWordsAnswer`, `rulesOf`, `betsRefusal`, `timeOverFor`, `notStarted`, `withPlay`.
- Produces:
  ```ts
  // game.ts
  export interface LetterWordsProgress { words: string[] }   // ключі ladderKey у порядку знахідок
  /** letters null — набір ще не роздано; best/possible дописує сервер (dealLetters). */
  export interface LetterWordsPlay { letters: string[] | null; best: string[] | null; possible: number | null; progress: Record<string, LetterWordsProgress> }
  // Play: /** Лише в запитанні «Слова з літер» (27d). */ letterwords?: LetterWordsPlay;
  // letterwords.ts
  export type LettersDue = { letters: string[]; count?: undefined } | { letters?: undefined; count: number };
  export function lettersDue(state: GameState): LettersDue | null;
  export function dealLetters(state: GameState, deal: { letters: string[]; best: string[]; possible: number }): GameState;
  export function letterWordsOf(state: GameState, playerId: string): LetterWordsProgress;   // без запису — { words: [] }
  export function letterWord(state: GameState, playerId: string, word: string, now: number, isNoun: (key: string) => boolean): Result;
  /** Бали гравця (команди) за словами й поточним станом; для зрізу reveal і scoreLetterWords. */
  export function letterPoints(state: GameState, play: Play, words: readonly string[]): number;
  export function scoreLetterWords(state: GameState): GameState;   // лише на question, інакше той самий стан
  // fixtures.ts
  export const letterwords = { ...base, id: 'q12', type: 'letterwords', text: 'Складіть слова з літер', timeLimit: 90, points: 20,
    set: { kind: 'fixed', letters: 'морквасті' }, goal: 'most', per: 'word' } satisfies Question;
  export const letterwordsRandom = { ...letterwords, id: 'q13', set: { kind: 'random', count: 9 }, goal: 'longest', per: 'letter', points: 10 } satisfies Question;
  ```

- [ ] **Step 1: Write the failing tests** (`game.letterwords.test.ts`). Спільне:
  - `nouns = new Set(['кіт','сік','рот','сом','морква','острів','ставок','матрос','ворс','сова','ґава',"м'ясо"])`, `isNoun = (k) => nouns.has(k)`;
  - `fresh(q)` — старт раунду з Оленою, Тарасом, Вірою; `dealt(s)` = `dealLetters(s, { letters, best: ['комісар','самотік'], possible: 196 })`.

  Тести:
  - `opening deals nothing but the host's letters` — свій набір: `letters` 9 літер, `best` null, `lettersDue` → `{ letters }`; випадковий: `letters` null, `lettersDue` → `{ count: 9 }`; після `dealLetters` — `lettersDue` null, повторний `dealLetters` повертає той самий стан (`toBe`).
  - `refusals come in order and a repeat costs nothing`:
    - до роздачі → `not_started`;
    - `'abc'` → `word_unknown`;
    - `'ро'` → `letters_short`;
    - `'молоко'` → `letters_not_in_set`;
    - `'ґава'` (у наборі «г» немає) → `letters_not_in_set`;
    - `'ворк'` (з набору, не в словнику) → `word_unknown`;
    - `'КІТ'` → ok, далі `' кіт '` → `letters_repeat` і стан той самий;
    - 81-ше слово → `letters_too_many` (словник `() => true`, слова з повторними наборами, помічник);
    - `type_mismatch`, `paused`, `time_over`.
  - `an apostrophe takes no tile` — набір `мясо`, `"м’ясо"` (типографський) → ok, ключ `"м'ясо"`.
  - `scores per word, per letter and by the longest word`:
    - `most`/`word` 20: Олена «кіт, сік, морква» → 60; Тарас «рот, сом» → 40;
    - `most`/`letter` 10: Олена → 120;
    - `longest` 10: Олена (морква, 6) → 60, Тарас (3) → 30;
    - множник раунду ×2 і позначка клітинки ×3 множать `unit`;
    - Віра без слів — без запису;
    - `accepted`/`grade`/`accuracy` за «Рішеннями плану»; `streakBonus` 0;
    - `speedBonus`, `partial`, `penalty: 'minus'` раунду нічого не змінюють.
  - `teammates fill one word list` — 2 команди по 2: слова двох учасників у `progress[teamId]`; повтор товариша → `letters_repeat`; `longest` — найдовше слово команди.
  - `on a board cell only the chooser plays` — інший → `not_your_turn`; позначка ×3.
  - `the plain answer event and the host grade do not apply` — `submitAnswer` → `type_mismatch`, `override` → `wrong_phase`.
  - `removing a player drops their words`.
  - Інші файли:
    - `game.buffs.test.ts` — `'off_letterwords'`;
    - `restore.test.ts` — `keysOf<Play>` з `'letterwords'`; знімок з роздачею й словами відновлюється; `GAME_STATE_VERSION` той, що після 27c.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.
- [ ] **Step 3: Implement.** `letterwords.ts` — за зразком `wordladder.ts` і `timedlist.ts`: той самий цикл імпортів, `withPlay` з `./blitz`, `checkTurn`-подібна функція перевірок. `openQuestion` додає `...(question.type === 'letterwords' ? { letterwords: { letters: question.set.kind === 'fixed' ? letterSet(question.set.letters) : null, best: null, possible: null, progress: {} } } : {})`.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/engine && tsc -p packages/shared && tsc -p packages/engine`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): 27d letter words — deal hook for the server, ordered refusals, free repeats, points per word, per letter or by the longest word, team lists, board cells"
```

---

### Задача 3. Рушій: зрізи без спойлерів і живий рядок

**Files:**
- Modify: `packages/shared/src/views.ts`, `packages/engine/src/views.ts`, `packages/engine/src/live.ts`
- Test: `packages/engine/src/views.letterwords.test.ts` (новий), `packages/engine/src/live.test.ts`

**Interfaces (Produces, `shared/views.ts`):**
```ts
/** Усім: набір (порожній до роздачі), ціль, спосіб, сума за одиницю. */
export interface PublicLetterWords { letters: string[]; goal: LetterGoal; per: LetterUnit; unit: number }
export interface LetterWordsRow { playerId: string; nickname: string; found: number;
  /** Лише на reveal: longest — одне найдовше; most — до 3 найдовших. Інакше null. */ top: string[] | null;
  /** Лише на reveal, most: скільки слів поза top. */ more: number | null;
  points: number | null }
export interface LetterWordsInfo { rows: LetterWordsRow[];   // за found спаданням, далі порядок гравців
  /** Ведучому завжди, іншим лише на reveal; інакше null. */ best: string[] | null; possible: number | null;
  /** Ведучому — усі слова кожного наживо; іншим — null. */ words: Record<string, string[]> | null }
export interface PlayerLetterWords { words: { text: string; letters: number }[]; canType: boolean }
// PublicQuestion.letterwords?, BaseView.letterwords?, HostView.letterwords?, PlayerView.me.letterwords?
// LiveProgress: | { kind: 'letterwords'; words: string[] }
```
- `live.ts`: `'letterwords'` — у `PROGRESS_TYPES` і `UNGRADABLE`. Три місця `gradable` у `views.ts` виключають і цей тип.

- [ ] **Step 1: Write the failing tests** (`views.letterwords.test.ts`, стан із задачі 2: Олена «кіт, сік, морква», Тарас «рот, сом»):
  - `the public question shows the letters, the goal and the unit only` — `{ letters: [...9], goal: 'most', per: 'word', unit: 20 }`, до роздачі випадкового — `letters: []`.
  - `never sends a word or the best words before reveal`:
    - на `question` і `locked` `JSON.stringify(stageView(s))` не містить `'морква'`, `'кіт'`, `'комісар'`, `'самотік'`, `'196'`;
    - `playerView(s, 'p2')` не містить `'морква'`;
    - `playerView(s, 'p1').me.letterwords.words` дорівнює `[{ text: 'кіт', letters: 3 }, { text: 'сік', letters: 3 }, { text: 'морква', letters: 6 }]`.
  - `stage rows carry counts until reveal, then the best words and points` — на `question` рядки `{ found: 3, top: null, points: null }`, `best` null; на `reveal` — `top: ['морква','кіт','сік']`, бали, `best: ['комісар','самотік']`, `possible: 196`; для `longest` `top` має одне слово.
  - `the host sees every word and the best words live` — `hostView(s).letterwords.words.p1` і `best`; `live` рядок `{ kind: 'letterwords', words: ['кіт','сік','морква'] }`.
  - `a team member sees the team's words`.
  - `canType follows phase, pause and the deal`.
  - `other questions keep their views unchanged` — ключа `letterwords` немає.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.
- [ ] **Step 3: Implement.** `optional('letterwords', …)`, як у `wordladder`/`timedlist`.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/engine packages/shared && tsc -p packages/shared && tsc -p packages/engine`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/views.ts packages/engine
git commit -m "feat(engine): 27d letter words views — letters for all, counts only until reveal, own words for the player, everything live for the host"
```

---

### Задача 4. Сервер: індекс словника, випадковий набір, роздача в commit, подія, маршрут редактора

**Files:**
- Create: `apps/server/src/letterwords/deal.ts`, `apps/server/src/letterwords/deal.test.ts`, `apps/server/src/letterwords-routes.ts`, `apps/server/src/letterwords-routes.test.ts`
- Modify:
  - `apps/server/src/wordladder/nouns.ts` — `keys(): Iterable<string>` у `NounDictionary` (`dictionaryOf`, `lazyNouns`, `nounsOf`);
  - `apps/server/src/rooms/manager.ts`:
    - лінивий `letterIndex` зі `this.nouns`;
    - `private dealLetters(state)` першим кроком `commit` після `awayStep`;
    - метод `letterWord`, рядок `answerStamp`;
  - `apps/server/src/socket.ts` — `player:letters`;
  - реєстрація маршруту поруч з `registerWordLadderRoutes`;
  - `apps/server/scripts/logic/check.ts` — `case 'letterwords'` → `[]`.
- Test: `apps/server/src/socket.test.ts`, `apps/server/src/rooms/manager.test.ts`, `apps/server/src/restart.test.ts`, `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts`, `apps/server/src/wordladder/nouns.test.ts`, `apps/server/src/achievements.test.ts` (якщо падає)

**Interfaces (Produces):**
```ts
// deal.ts
export interface LetterIndex { readonly size: number }   // внутрішньо: { key, letters: Uint8Array } за довжиною + частоти літер
export function letterIndexOf(nouns: NounDictionary): LetterIndex;   // будується при першому виклику, не під час запуску сервера
export function pickLetters(index: LetterIndex, count: number, rng: () => number): string[];
export function dealOf(index: LetterIndex, letters: readonly string[]): { best: string[]; possible: number };
// manager.ts
/** Слово з літер (27d): у командній грі — будь-який учасник за команду. */
letterWord(room: Room, playerId: string, word: string): AckResult;   // this.act(room, playerId, 'answer'); isNoun — this.nouns
// letterwords-routes.ts: POST /api/letterwords/check { letters } → { possible, best } | 400 invalid_payload; rate limit 60/хв, як у драбині
```

- [ ] **Step 1: Write the failing tests:**
  - `deal.test.ts` (словник `nounsOf([...])` з ~40 слів і справжній `loadNouns()` для двох тестів):
    - `a random set always holds a dictionary word and is the same for the same rng` — для `count` 4…12 і 50 зерен (сідований rng з тестових помічників репо) у набору рівно `count` літер, без «ґ», `dealOf(...).possible ≥ 1`. Те саме зерно → той самий набір;
    - `a random set has enough vowels`;
    - `the real dictionary gives several words for nine letters` — на справжньому словнику для `count: 9` і 20 зерен середнє `possible ≥ 12`, а `pickLetters` < 200 мс;
    - `dealOf finds the two longest words` — «морквасті» на справжньому словнику → `best: ['комісар','самотік']`, `possible` 196 (звірити число з файлом на момент виконання), набір без слів → `{ best: [], possible: 0 }`.
  - `nouns.test.ts`: `keys` дає всі ключі.
  - `manager.test.ts`:
    - `every opened letters question is dealt before anyone sees it` — випадковий набір через `next`, через `pickCell` і через автопілот: перший розісланий зріз уже має 9 літер. `lettersDue(room.state)` після commit — null;
    - `letter words reach the engine with the room dictionary` — `ok`, `word_unknown`, `letters_not_in_set`, `letters_repeat`;
    - `any team member adds letter words` — двоє учасників однієї команди, обидва бачать обидва слова; інша команда — ні.
  - `socket.test.ts`, `player:letters is player-only and validated` — ведучий і сцена → `forbidden`; `{ word: 5 }` і 31 символ → `invalid_payload`.
  - `restart.test.ts`, `a restored room keeps its set and words` — піднята кімната має ті самі `letters`, `best`, `progress`, і нової роздачі не було.
  - `recorder.test.ts` — `payload: { type: 'letterwords', words: ['кіт','сік','морква'], longest: 6 }`, `points: 60`.
  - `history.test.ts` — бали в історії дорівнюють балам рушія.
  - `letterwords-routes.test.ts` — `{ letters: 'морквасті' }` → `possible > 0` і `best`; `'abc'` → 400; частота обмежена.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/letterwords apps/server/src/letterwords-routes.test.ts apps/server/src/wordladder apps/server/src/socket.test.ts apps/server/src/rooms/manager.test.ts apps/server/src/restart.test.ts apps/server/src/recorder.test.ts apps/server/src/history.test.ts`. Очікується FAIL.
- [ ] **Step 3: Implement.** Індекс літер — за 33 літерами абетки (`а…я` з «ґ є і ї ь»), лічильник як `Uint8Array`. `possible` рахує лише слова ≥ 3 літер і не довші за набір.
- [ ] **Step 4: Run** тести з кроку 2, потім `pnpm vitest run --maxWorkers=2 apps/server/src apps/server/scripts` і `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Очікується PASS. Тести сценаріїв, що чекають на кількість типів, оновлюються з коментарем «27d: новий тип».
- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat(server): 27d letter words — random sets that always hold a word, the two longest words, dealt in commit before anyone sees them, a team-wide event, an editor check"
```

---

### Задача 5. Веб: тексти, формат, довідка, живий рядок і редактор

**Files:**
- Create: `apps/web/src/editor/LetterWordsEditor.tsx`, `apps/web/src/editor/LetterWordsEditor.test.tsx`
- Modify:
  - `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts` (`ADDED_27D`), 6 json;
  - `apps/web/src/format.ts`, `apps/web/src/admin/admin-text.ts`;
  - `apps/web/src/guide-text.ts` — `typeIcon` `'🔤'`, `typeHow_letterwords`;
  - довідка: `help-uk.ts` (`question.letterwords.*`), `help-vars.ts` (`minLetterSet`, `maxLetterSet`), `help-uk-golden.json`, `*.help.json`;
  - `apps/web/src/screens/LiveAnswers.tsx`;
  - `apps/web/src/editor/draft.ts` — `questionTypesFor`, `newQuestion`, копія, чистка, проблеми, `Place.letterwords`;
  - `apps/web/src/editor/QuestionEditor.tsx` — гілка, відео сховано;
  - `apps/web/src/styles.css` (`letterwords-editor-*`).
- Test: `format.test.ts`, `guide-text.test.ts`, `LiveAnswers.test.tsx`, `draft.test.ts`, `QuizEditor.test.tsx`, `help-golden.test.ts`, `locales/checks.test.ts`, `source-scan.test.ts`

**Interfaces:**
- `newQuestion('letterwords')` → `{ type: 'letterwords', timeLimit: 90, points: 20, set: { kind: 'random', count: 9 }, goal: 'most', per: 'word', video: null }`.
- Редактор:
  - перемикач `lettersSourceRandom: 'Випадковий набір'` / `lettersSourceFixed: 'Свій набір'`;
  - `NumberField` «Скільки літер» (`lettersCount`, 4…12) або поле «Літери» (`lettersOwn`);
  - ціль `lettersGoalMost: 'Якнайбільше слів'` / `lettersGoalLongest: 'Найдовше слово'`;
  - спосіб `lettersPerWord: 'За кожне слово'` / `lettersPerLetter: 'За кожну літеру'`. Для `longest` лише «за літеру», перемикач вимкнено з підказкою `lettersLongestHint`;
  - `NumberField` «Сума» (`lettersUnit`). Зміна способу ставить типову суму, тільки якщо ведучий її не міняв;
  - підказка `lettersHint`: «Гравці складають іменники в називному відмінку з літер набору, від 3 літер; кожну літеру — стільки разів, скільки вона є. Словник має слова до 7 літер.»;
  - для свого набору — попередження після 600 мс через `POST /api/letterwords/check`: `lettersCheckSome: 'Складається слів: {n}, найдовші: {words}'` або `lettersCheckNone: 'З цих літер не складається жодного слова зі словника'`. Помилка мережі нічого не показує.
- Проблеми:
  - `problemLettersSet: 'Набір — від {min} до {max} українських літер'`;
  - `problemLettersPoints: 'Сума завелика: на табло вийде більше {max}'`;
  - `problemLettersPlace: 'Слова з літер — лише в класичному раунді й на звичайній клітинці поля з телефона'`.
- Інші uk-ключі задачі:
  ```ts
  type_letterwords: 'Слова з літер',
  typeShort_letterwords: 'слова з літер',
  typeHow_letterwords: 'Складіть із набору літер якомога більше слів або одне найдовше.',
  buffWhy_off_letterwords: 'У словах з літер бафів немає.',
  lettersAnswer: 'Слів: {n} · найдовше: {longest} літ.',
  lettersLive: 'Слів: {n}',
  err_letters_not_in_set: 'Це слово не складається з літер набору',
  err_letters_short: 'Слово має бути щонайменше з 3 літер',
  err_letters_repeat: 'Це слово вже є у списку',
  err_letters_too_many: 'Більше слів не прийму',
  ```
- `answerText` повертає `lettersAnswer`, правильна відповідь — `'—'` (її немає). Живий рядок пульта — `lettersLive` і слова через « · ».
- Довідка `question.letterwords`:
  - `title`, `what`;
  - `how.0–2` — плитки й клавіатура; повтор не рахується; ґ≠г, апостроф без плитки;
  - `points.0–2` — три способи з прикладом «морква»: 20 за слово; 6 × 10 за літеру; найдовше 6 × 10;
  - `tip.0` — випадковий набір завжди має хоча б одне слово;
  - `limits.0–1`.

- [ ] **Step 1: Write the failing tests** — за переліком вище:
  - `format.test.ts`: `'Слів: 3 · найдовше: 6 літ.'`;
  - `LiveAnswers.test.tsx`: «Слів: 2», обидва слова;
  - `draft.test.ts`: `newQuestion`, `questionTypesFor` (так само, як 27c для списку), чистка (`trim` літер), кожна проблема, бліц-клітинка → `problemLettersPlace`, `longest` примушує `per: 'letter'`;
  - `LetterWordsEditor.test.tsx`, `switches the source, the goal and the unit and warns about a set without words` (fetch — `vi.fn`);
  - `QuizEditor.test.tsx`, `saves a letters question`;
  - `i18n.test.ts`: `ADDED_27D`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/format.test.ts apps/web/src/guide-text.test.ts apps/web/src/screens/LiveAnswers.test.tsx apps/web/src/editor apps/web/src/i18n.test.ts apps/web/src/help apps/web/src/locales`. Очікується FAIL.
- [ ] **Step 3: Implement.** Переклади природні, з тими самими плейсхолдерами. `ar` — за наявним стилем.
- [ ] **Step 4: Run** тести з кроку 2, `apps/web/src/source-scan.test.ts` і `pnpm typecheck`. Очікується PASS (повний typecheck зелений).
- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 27d letter words texts, answer format, live row, host help, editor with a random or own set, goal, unit and a dictionary check"
```

---

### Задача 6. Веб: телефон, сцена й пульт

**Files:**
- Create: `apps/web/src/screens/LetterWordsView.tsx`, `apps/web/src/screens/LetterWordsView.test.tsx`
- Modify: `PlayerScreen.tsx`, `StageScreen.tsx` (підказка, лічильник, блок інформації, виключення з «Правильна відповідь»), `HostScreen.tsx`, `styles.css`, `i18n.ts`, 6 json, `ADDED_27D`. Місця — ті самі, що 27c торкнувся для списку; звірити.
- Test: `PlayerScreen.test.tsx`, `StageScreen.test.tsx`, `HostScreen.test.tsx`

**Interfaces (Produces):**
```tsx
/** Плитки набору; used — літери, вже взяті полем; onPick — додати літеру. Без onPick — лише показ (сцена). */
export function LetterTiles(props: { letters: string[]; used?: string[]; onPick?: (letter: string) => void; big?: boolean }): JSX.Element;
/** Телефон: плитки, поле, «Додати», ⌫, «Очистити», «Перемішати», список своїх слів. */
export function LetterWordsPlay(props: { info: PlayerLetterWords; question: PublicQuestion; paused: boolean; send: Send }): JSX.Element;
/** Рядки гравців: «Слів: 5»; на reveal — top, «ще N», бали. */
export function LetterWordsBoard(props: { info: LetterWordsInfo; reveal: boolean }): JSX.Element;
/** Найдовші можливі слова: 1–2 слова з кількістю літер і «Усього слів у наборі: N»; порожньо — lettersNoneExist. */
export function LetterWordsBest(props: { info: LetterWordsInfo }): JSX.Element;
```
- uk-ключі:
  - `lettersLabel: 'Ваше слово'`, `lettersAdd: 'Додати'`, `lettersErase: 'Стерти літеру'`, `lettersClear: 'Очистити'`, `lettersShuffle: 'Перемішати'`;
  - `lettersMine: 'Ваші слова: {n}'`, `lettersOnPhone: 'Складайте слова на телефоні'`, `lettersFound: 'Слів: {n}'`, `lettersMore: 'ще {n}'`;
  - `lettersBestTitle: 'Найдовші слова з цих літер'`, `lettersPossible: 'Усього слів у наборі: {n}'`, `lettersNoneExist: 'З цих літер слів зі словника не складається'`;
  - `lettersTile: 'Літера {letter}'` (`aria-label`), `lettersAdded: 'Додано: {word}'` (`role="status"`).
- Телефон:
  - поле `maxLength={LIMITS.letterWord}`, `autoCapitalize="none"`, `autoComplete="off"`, `autoCorrect="off"`, `spellCheck={false}`, `enterKeyHint="send"`;
  - плитка дописує літеру в кінець поля й повертає фокус у поле;
  - «Додати» неактивна, поки `wordLetters` поля < 3;
  - `busy`-ref — один запит за раз;
  - `ok` очищує поле, лише якщо там досі те саме слово, і нове слово з'являється в списку з `letterwords-pop`;
  - `letters_repeat` блимає наявним словом (`.is-again`) і очищує поле;
  - інші помилки трусять поле, показують `errorText` у `role="status"`, а поле лишається, щоб виправити;
  - список своїх слів — новіші зверху, з кількістю літер.
- Сцена:
  - на `question` — текст, `LetterTiles big`, `lettersOnPhone`, `LetterWordsBoard` (лише кількості);
  - на `reveal` — плитки, `LetterWordsBoard reveal`, `LetterWordsBest`;
  - загального рядка «Правильна відповідь» немає.
- Пульт: плитки, усі слова гравців наживо, `LetterWordsBest` завжди, бали на `reveal`. Кнопок оцінки немає.
- `PlayerScreen`:
  - на `question` — `LetterWordsPlay` (у командній грі в кожного учасника);
  - глядач клітинки поля — `LetterWordsBoard`;
  - на `locked` — свої слова;
  - на `reveal` — `LetterWordsBoard reveal`, свій рядок підсвічено, і `LetterWordsBest`.

- [ ] **Step 1: Write the failing tests** (`LetterWordsView.test.tsx`, `send` — `vi.fn`):
  - `tiles add letters and run out by count` — набір з одним «м»: після натиску «м» плитка `aria-disabled`, ⌫ повертає її;
  - `the add button waits for three letters`;
  - `a found word joins the list and clears the field` — ack `ok`;
  - `a repeat flashes the word and costs nothing` — ack `letters_repeat`;
  - `a refusal shakes and keeps the word to fix` — `letters_not_in_set` і `word_unknown` показують свій текст;
  - `one request at a time and a cleared field only for the word that was sent`;
  - `the stage board shows counts while playing, then the best words`;
  - `LetterWordsBest names the longest words or says none exist`;
  - `PlayerScreen.test.tsx` — поле й плитки на `question`, найдовші слова на `reveal`;
  - `StageScreen.test.tsx`, `letter words show only counts while playing` — до `reveal` немає тексту `морква`, `комісар`;
  - `HostScreen.test.tsx`, `the host sees every word and the best words live`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/LetterWordsView.test.tsx apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/screens/StageScreen.test.tsx apps/web/src/screens/HostScreen.test.tsx apps/web/src/i18n.test.ts apps/web/src/locales`. Очікується FAIL.
- [ ] **Step 3: Implement** за зразком `WordLadderPlay` (форма, `busy`, фокус) і `TimedListBoard`.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 apps/web`, `source-scan.test.ts` і `pnpm typecheck`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 27d letter words on the phone, stage and host — tiles that run out, free repeats, counts only while playing, best words and the longest possible on reveal"
```

---

### Задача 7. Наскрізні сценарії й кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`; `apps/web/src/styles.css` (лише якщо кадри покажуть ваду, окремим комітом)

**Interfaces:**
- Consumes: помічники e2e, ті самі, що в 27c:
  - `open`, `register`, `join`, `click`, `field`, `shot`, `afterSplash`, `expectNoSideScroll`, `snapshot`, `liveRow`, `socketFrames`, `pickTeamOn`, `stageTeam`;
  - `makeRoundsQuiz`, `classicRound`, `POST /api/quizzes`.
- Помічники сценарію:
  - `lettersType27d(page, word)` — `fill` + Enter;
  - `lettersTap27d(page, word)` — натиск плиток по літерах;
  - `lettersTiles27d(page)` — літери плиток;
  - `lettersMine27d(page)`;
  - `formable27d(letters)` — у тесті читає `apps/server/data/wordladder-uk.txt` через `node:fs` і повертає слова, що складаються з набору, за довжиною спадно. Це потрібно, щоб грати випадковим набором.
- Слова сценарію (усі звірено з поточним словником): «морквасті» → `кіт`, `сік`, `рот`, `сом`, `морква`, `острів`, `ставок`; найдовші — `комісар`, `самотік`; не зі словника — `ворк`; не з набору — `молоко`. «квітнесар» → `сітка`, `рік`, `ніс`, `верстак`, `кентавр`. Перед написанням звірити ще раз (`grep -x`).

- [ ] **Step 1: Write the scenario.** `it('part 27d: letter words — most words per word and per letter, the longest word from a random set, refusals and free repeats, a team list, only counts on the stage', …)` за зразком `part 27c` (`try/catch` → `snapshot()`).
  - **Редактор.** Класичний раунд з трьома запитаннями:
    1. свій набір «морквасті», «якнайбільше», за слово, 20, 90 с;
    2. свій набір «квітнесар», «якнайбільше», за літеру, 10, 60 с;
    3. випадковий набір, 9 літер, «найдовше» (перемикач способу вимкнено на «за літеру»), 10, 60 с.

    Перевірки: набір `abc` дає `problemLettersSet`; попередження перевірки словника показує «Складається слів:» для «морквасті». Кадр `letterwords27d-editor`.
  - **Гра.** Сцена 1600×900 (`socketFrames`). Телефони: Оля 375×812, Тарас 360×740 (`socketFrames`), Хосе 320×640 `es-ES`.
  - **Запитання 1 (за слово):**
    - Оля:
      - `кіт` плитками → «Ваші слова: 1»;
      - `КІТ` з клавіатури → повтор, лічильник той самий;
      - `молоко` → «Це слово не складається з літер набору»;
      - `ворк` → «Такого слова не існує»;
      - `ро` — кнопка неактивна;
      - `сік`, `морква` → 3.
    - Тарас: `рот`, `сом`.
    - До розкриття:
      - сцена — «Слів: 3», «Слів: 2»;
      - у `stage.content()` і `stageFrames` немає `морква`, `комісар`, `самотік`; у `tarasFrames` немає `морква`;
      - пульт бачить слова Олі (`liveRow`) і `комісар`;
      - `expectNoSideScroll(hose, 'letterwords27d-phone-es-320')`, 9 плиток без прокрутки.
    - Розкриття:
      - Оля +60 (`морква`, `кіт`, `сік`), Тарас +40;
      - сцена показує «комісар», «самотік» і «Усього слів у наборі:».
  - **Запитання 2 (за літеру):** Оля — `сітка`, `рік` → +80; Тарас — `верстак` → +70; Хосе — нічого, без запису й без балів.
  - **Запитання 3 (випадковий набір, найдовше):**
    - сцена й телефони показують ті самі 9 плиток; `formable27d` дає хоча б одне слово ≥ 3 літер;
    - Оля вводить найдовше з них (`w1`) і одне з 3 літер, Тарас — коротше слово (`w2`);
    - до розкриття `w1` немає в `stageFrames`;
    - на розкритті Оля +10 × |w1|, Тарас +10 × |w2|;
    - сцена в рядку Олі показує лише `w1`, а серед найдовших можливих — слово довжини |w1|.
  - **Історія.** Історія гри Олі показує «Слів: 3 · найдовше: 6 літ.».
  - **Команди** (друга вікторина через API, `teams: { count: 2, names: ['Червоні', 'Сині'] }`, одне запитання: «морквасті», «якнайбільше», за слово, 20):
    - Оля й Петро (Червоні) вводять `острів` і `ставок` — обидва телефони показують обидва слова;
    - Петро вводить `острів` → повтор;
    - Іра (Сині) — `кіт`;
    - розкриття: Червоні +40, Сині +20;
    - Марко (Сині) бачить `кіт` і не бачить `острів` (`markoFrames`).
  - **Кадри (`E2E_SHOTS=1`):**
    - `letterwords27d-phone-tiles`, `letterwords27d-phone-refused`, `letterwords27d-phone-repeat`, `letterwords27d-phone-es-320`;
    - `letterwords27d-stage-question`, `letterwords27d-host-live`, `letterwords27d-stage-reveal`, `letterwords27d-stage-random-reveal`, `letterwords27d-phone-reveal`;
    - `letterwords27d-team-phone`, `letterwords27d-team-stage-reveal`.
- [ ] **Step 2: Run** `pnpm build`, потім на передньому плані `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 27d"` (менше 10 хв). Очікується PASS.
- [ ] **Step 3: Переглянути кадри:**
  - плитки на 320/360 px у межах екрана й достатньо великі для пальця;
  - на сцені 1600×900 плитки великі, рядки й найдовші слова не обрізано;
  - іспанська й арабська розкладки цілі.
  Вада → CSS окремим комітом.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2` (усе) і `pnpm typecheck`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts
git commit -m "test(e2e): part 27d letter words — per word, per letter, the longest from a random set, not in the set, not a word, free repeats, a team list, only counts on the stage"
```
