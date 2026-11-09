# План 26c: тип запитання «Словесна драбина»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** новий тип запитання `wordladder`. Гравець іде від стартового слова до цільового, щоразу міняючи одну літеру, і кожне проміжне слово має бути іменником у називному відмінку однини. Хто дійшов за найменше кроків, отримує повну ціну.

**Архітектура:**
- **Дані (`shared`).** Запитання `{ ...base, type: 'wordladder', path: string[], maxSteps: number }`. `path[0]` — стартове слово, `path.at(-1)` — цільове, між ними шлях ведучого. Окремих полів `start`/`target` немає: шлях їх уже містить, тож вони не можуть розійтися. Правила літер (ключ слова, «рівно одна літера», перевірка шляху) живуть у новому `packages/shared/src/wordladder.ts`. Їх спільно використовують схема, рушій, редактор і скрипт словника.
- **Словник (`apps/server`).** Разовий скрипт `apps/server/scripts/wordladder-dict.ts` читає локально завантажений VESUM і пише `apps/server/data/wordladder-uk.txt`. Сервер читає цей файл у `Set` за вузьким інтерфейсом `NounDictionary { isNoun(key) }` (`apps/server/src/wordladder/nouns.ts`). Рушій словника не знає: сервер передає йому `isNoun` аргументом.
- **Стан (`engine`).** Необов'язкове поле `Play.wordladder?: Record<id, { words: string[] }>`, як `play.chain`. Новий файл `packages/engine/src/wordladder.ts` містить `ladderWord`, `ladderBack` і `scoreWordLadder`. Запис відповіді з'являється в мить фінішу. Закриття йде наявним шляхом `autoLock`/`tick`/`lock`, а бали ставить `lockNow`.
- **Зрізи.** Нові поля в зрізах **необов'язкові** й присутні лише на запитанні-драбині: `PublicQuestion.wordladder`, `BaseView.wordladder`, `PlayerView.me.wordladder`, `HostView.wordladder`. Тоді зрізи інших запитань не змінюються байт у байт, а фабрики в тестах `apps/web` правити не треба.
- **Веб.** Новий `apps/web/src/screens/WordLadderView.tsx` (`WordLadderColumn`, `WordLadderPlay`, `WordLadderBoard`), гілка редактора й легкий ендпоінт `POST /api/wordladder/check` для попереджень редактора.

**Технології:** TypeScript, zod 4, vitest, Fastify + Socket.IO + `@fastify/rate-limit`, React 19 + Vite, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-11-09-blitz-series-and-word-ladder-design.md`, розділ «C. Новий тип запитання «Словесна драбина»». Розділи A і B (26a, 26b) сюди не входять.

## Глобальні обмеження

- `GAME_STATE_VERSION` лишається **22**. Підняття не потрібне: нове значення типу запитання й нове поле `Play.wordladder` необов'язкові, а старі знімки їх не містять. У `restore.ts` додається лише рядок у коментарі до `READABLE_STATE_VERSIONS` («26c без нової версії: …»).
- Нові поля схем необов'язкові. Об'єкти схем `.strict()` там, де такі сусіди. Кожна наявна вікторина й знімок проходять без змін.
- Тести: `pnpm vitest run --maxWorkers=2 <шлях>`. Prettier не запускати.
- Наскрізні тести: спершу `pnpm build`, потім на передньому плані `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 26c"`. Один виклик триває менше 10 хв.
- Рядки інтерфейсу:
  - uk у `apps/web/src/i18n.ts`;
  - ключі — у новому списку `ADDED_26C` в `apps/web/src/i18n.test.ts` (додати його до умови `adds no uk keys beyond the agreed list`);
  - переклади в 6 json-локалях (en, pl, de, es, it, ar);
  - ru ніколи, нічого про росію.
  - Якщо на момент злиття 26b уже додав `ADDED_26B`, лишити обидва списки.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`). Тому:
  - перелік українських літер і нормалізація живуть у `packages/shared/src/wordladder.ts` (сканер його не бачить);
  - словник лежить у `apps/server/data/`;
  - слова драбини в тестах і e2e — це дані тестів.
- Без мережі під час роботи сервера й у тестах. Модульні тести беруть крихітний список слів (`nounsOf([...])`). Лише один тест сервера читає справжній закомічений файл словника з диска.
- Ліцензія: дані VESUM — CC BY-NC-SA 4.0. Атрибуція стоїть у новому кореневому файлі `CREDITS` і в шапці файлу словника. Сирих даних VESUM у репозиторії немає.
- Правило власника: у словнику немає слів, пов'язаних з росією (`EXCLUDED` у скрипті, задача 2). Жодне таке слово не з'являється в тестах, e2e і демо.

## Рішення плану

- **Ліміти** (`LIMITS`):
  - `minWordLadderLetters: 3`, `maxWordLadderLetters: 7`;
  - `maxWordLadderSteps: 20` — найбільший `maxSteps` у редакторі, тож у шляху ведучого не більше 21 слова;
  - `defaultWordLadderSteps: 8`;
  - `maxWordLadderWords: 40` — стеля прийнятих слів гравця, щоб стан не ріс без меж; далі `word_too_many`;
  - `wordLadderWord: 30` — символів у полі вводу й у слові схеми до нормалізації;
  - `defaultWordLadderTime: 90`.
- **Ключ слова** — `ladderKey(word)`:
  - кроки: `NFC` → `trim` → `toLocaleLowerCase('uk')` → `’ ʼ ‘ \`` замінюються на `'`;
  - результат має відповідати `/^[а-щьюяєіїґ](?:'?[а-щьюяєіїґ])*$/u`, інакше `null`;
  - літери 3–7 рахуються без апострофа;
  - ґ≠г, и≠і≠ї, е≠є виходять самі собою, бо інших замін немає;
  - латинські двійники («i», «a») дають `null`, а гравець бачить «Такого слова не існує».
- **Рівно одна літера** — `oneLetterApart(a, b)` порівнює ключі однакової довжини (в кодових точках, апостроф — окрема позиція) і вимагає рівно одну відмінну позицію. Різна довжина дає `word_one_letter`.
- **Перевірка шляху** — `ladderPathIssue(path, maxSteps)`, перша знайдена вада по порядку:
  - `'wordladder_word'` — будь-яке слово з `ladderKey === null` або з літерами поза 3–7;
  - `'wordladder_length'` — довжини ключів різні;
  - `'wordladder_step'` — сусіди не `oneLetterApart`;
  - `'wordladder_steps'` — `path.length − 1 > maxSteps`.
  Схема додає ще `'wordladder_video'` (`video !== null`: без таймера немає кінця) і `'wordladder_place'` (раунд не `classic` і не `final`, включно з будь-якою клітинкою поля). Словник схема **не** перевіряє.
- **Хід гравця** — `ladderWord(state, id, word, now, isNoun)`. Перевірки по черзі:
  1. загальні: `wrong_phase`, `paused`, `not_started`, `not_found`, `type_mismatch`, `already_answered` (після фінішу), `time_over` (`timeOverFor`);
  2. `word_too_many` (уже `maxWordLadderWords` слів);
  3. `ladderKey === null` → `word_unknown`;
  4. ключ дорівнює попередньому слову (або стартовому, якщо слів ще немає) → `word_repeat`;
  5. не `oneLetterApart` з попереднім → `word_one_letter`;
  6. ключа немає ні серед ключів `path`, ні в `isNoun` → `word_unknown`.
  Інакше слово додається. Хибна спроба стану не змінює. Повернення до слова, яке вже було раніше (цикл), дозволене — він лише додає кроки.
- **Фініш.** Ключ дорівнює ключу цілі: з'являється запис `answer: { type: 'wordladder', words, steps: words.length, finished: true }`.
  - Класика: `accepted: true`, `grade: 'correct'`, бали тимчасово 0.
  - Фінал: `grade` дорівнює `'correct'`, лише якщо `steps ≤ maxSteps`, далі `withFinalPoints`.
  - Потім `autoLock(…, now)`: коли записи є в усіх підключених, запитання закривається, як звичайне.
- **«Крок назад»** — `ladderBack(state, id, now)` прибирає останнє слово. Ті самі загальні перевірки (після фінішу — `already_answered`). Без слів — `word_none`.
- **Бали** — `scoreWordLadder` у `lockNow`, поруч зі `scoreChain` (обидва місця, де той викликається).
  - `best` — найменше `steps` серед записів з `finished && steps ≤ maxSteps`.
  - Класика: `points = round(price × multiplier × wordLadderShare(steps, best, maxSteps))`, де `wordLadderShare = steps > max ? 0 : (max − steps + 1) / (max − best + 1)`. `accuracy` дорівнює частці. `grade` — `'correct'` при частці > 0, інакше `'wrong'` (фініш понад максимум). `streakBonus` 0, як у ланцюжка.
  - Гравці з поступом без фінішу отримують запис `accepted: false`, `grade: 'wrong'`, 0 (у фіналі `finalPoints(wager, false)`), `answer.finished: false`.
  - Хто драбини не торкався, запису не має.
  - Швидкість, «частково», мінус-штраф раунду й бафи не діють. Множник раунду діє. Ніхто не дійшов — 0 усім.
- **Фінал** (тлумачення «правил ставок поверх цих балів»): ціни у фіналі немає ні в кого. Тому драбина у фіналі — «правильно», якщо гравець дійшов за ≤ `maxSteps` кроків (+ставка / частка банку), і «неправильно» в усіх інших випадках. Ручної оцінки немає.
- **Ручна оцінка й апеляції.** `override` повертає `wrong_phase`, як для `chain`. Через `appealPoints` це автоматично вимикає й апеляцію на оцінку. Пульт показує кнопки оцінки лише для `text`, як і зараз.
- **Бафи:** нове `PlaceBlock` `'off_wordladder'` (текст `buffWhy_off_wordladder`).
- **Дебафи:** діють, як на ланцюжку — без нових винятків.
- **Командна гра:** хід робить той, хто відповідає за команду (`act(room, id, 'answerer')`, як `guess`). Поступ веде команда.
- **Хто що бачить:**
  - Сцена й гравці: старт → ціль, кількість літер, `maxSteps`. Для кожного гравця — лише кроки й «фініш», без слів.
  - На `reveal` додаються шлях ведучого, слова фінішерів і бали.
  - Гравець завжди бачить свої слова.
  - Ведучий бачить усе й завжди: свій шлях, слова кожного наживо (`BaseView.wordladder` і `LiveProgress` `kind: 'wordladder'`).
  - У фіналі сцена й гравці не отримують `BaseView.wordladder`, як `chain: null` у фіналі.
- **Стовпчик на телефоні** — `collapseLadder(items)`: якщо елементів (старт + прийняті слова) більше 5, показується `[0], [1], null («…»), [n−2], [n−1]`. Під ним рядок порожніх клітинок за кількістю літер, далі поле вводу, «Додати» й «Крок назад».
- **Словник:**
  - джерело — реліз dict_uk **v6.8.6**, артефакт `dict_corp_vis.txt.bz2` (18 МБ; розпакований `dict_corp_vis.txt` — 319 МБ);
  - рядок формату `слово тег:тег:…`, словоформи з відступом;
  - береться кожен рядок (з відступом чи без), де тег починається з `noun:`, містить `:m:v_naz`, `:f:v_naz` або `:n:v_naz` (однина, називний) і не містить жодного з `prop`, `abbr`, `bad`, `alt`, `vulg`, `obsc`, `pron`;
  - слово, як записане (лише малі літери, тож власні назви з великої відпадають), проходить `ladderKey`, 3–7 літер;
  - далі `EXCLUDED`, `sort -u`.
  - Прототип на v6.8.6 дав **≈25 100 слів, ≈320 КБ** UTF-8 (≈83 КБ у gzip). Стискати не треба: файл — простий текст, одне слово в рядку, сортований, з шапкою з рядків `#`. Специфікація казала «JSON-список». Текст обрано, бо він менший, читається diff-ом і не потребує розбору. Інтерфейс `isNoun` від цього не залежить.
- **Перевірка в редакторі** — `POST /api/wordladder/check { words }` → `{ unknown: string[] }`: слова, яких немає в словнику (зокрема з `ladderKey === null`). Обмеження — 60 за хвилину, ключ `wordladder:<user id | ip>`. Вхід не обов'язковий. Редактор питає сервер із затримкою 600 мс, коли шлях структурно правильний, і показує попередження «Немає в словнику: …». Це не помилка: слова шляху в грі приймаються завжди.
- **Досягнення:** нових немає. `all_types` (`goal: QUESTION_TYPES.length`) зростає з 17 до 18. Уже здобуті лишаються здобутими, бо сховище їх не відкликає. Тести, що чекають 17, оновити свідомо.
- **Демо-вікторини** не змінюються (специфікація цього не просить).

## Порядок збирання

- Задача 1 додає `'wordladder'` у `Question` і `WordLadderAnswer` в `Answer`. Через вичерпні `switch` у `apps/web` (`format.ts`, `draft.ts`, `QuestionEditor.tsx`, `admin-text.ts`, `guide-text.ts`, `LiveAnswers.tsx`) `tsc -p apps/web` у задачах 1–5 не проходить. Для них перевірка: `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Від задачі 6 — повний `pnpm typecheck`.
- Залежності:
  - 2 спирається на 1 (`ladderKey`);
  - 3 — на 1;
  - 4 — на 3;
  - 5 — на 2–4;
  - 6 — на 4;
  - 7 — на 5 і 6;
  - 8 і 9 — на 6;
  - 10 іде останньою.

## На що дивитися рецензентові

1. **Спойлер у зрізі.** До `reveal` `JSON.stringify` зрізу сцени й будь-якого гравця не містить жодного проміжного слова шляху ведучого. Гравець p1 ніколи не бачить слів p2. У фіналі сцена не бачить нічийого поступу. Тест: задача 4, `never sends the host path or another player's words before reveal`.
2. **Юнікод вводу.** Розкладене «й» (`и` + U+0306), «Ї» великою, «м’ята» з типографським апострофом проти `м'ята`, пробіли по краях, латинське «i» замість «і». Перші чотири приймаються як ті самі ключі, латиниця дає `word_unknown`, а не збій. Тести: задача 1, `ladderKey normalizes case, NFC and apostrophes and refuses non-Ukrainian letters`; задача 3, `a decomposed letter and a typographic apostrophe are the same word`.
3. **Бали на краях.**
   - Ніхто не дійшов — 0 усім.
   - Фінішер понад максимум не входить у `best` і отримує 0.
   - Рівний найкращий — повна ціна кожному.
   - Множник ×2 і округлення (ціна 333).
   Тест: задача 3, `scores by the room's best finisher within the maximum`.
4. **Подвійні дотики й пізні ходи.** Друге «Крок назад» на порожньому — `word_none`. Слово після фінішу — `already_answered`. Слово після кінця часу — `time_over`. Слово на паузі — `paused`. Стан при цьому не змінюється. Телефон не шле другий запит, поки чекає першого. Тести: задача 3, `refuses moves after finishing, after time, on pause and an empty step back`; задача 8, `a double tap sends one request`.
5. **Перепідключення, вилучення, перезапуск.** Після повторного входу телефон бачить ті самі слова. Вилучений гравець зникає з `play.wordladder`. Знімок кімнати з `Play.wordladder` відновлюється з тими самими словами без підняття версії. Тести: задача 3, `removing a player drops their ladder`; задача 5, `a restored room keeps every player's ladder words`.

---

### Задача 1. Спільне: схема, правила літер, підсумок, події

**Files:**
- Create: `packages/shared/src/wordladder.ts`, `packages/shared/src/wordladder.test.ts`
- Modify: `packages/shared/src/quiz.ts` (`LIMITS`, `QUESTION_TYPES`, гілка `questionSchema`, `superRefine` запитання й `quizSchema`)
- Modify: `packages/shared/src/answer.ts`, `packages/shared/src/events.ts`, `packages/shared/src/game.ts` (`ErrorCode`), `packages/shared/src/index.ts`
- Test: `packages/shared/src/quiz.test.ts`, наявні тести `achievements` (якщо чекають 17 типів)

**Interfaces:**
- Produces:
  ```ts
  // quiz.ts LIMITS
  minWordLadderLetters: 3, maxWordLadderLetters: 7, maxWordLadderSteps: 20, defaultWordLadderSteps: 8,
  maxWordLadderWords: 40, wordLadderWord: 30, defaultWordLadderTime: 90,
  // QUESTION_TYPES: 'wordladder' одразу після 'chain'
  // гілка questionSchema
  { ...base, type: z.literal('wordladder'),
    /** Шлях ведучого: path[0] — стартове слово, path.at(-1) — цільове. */
    path: z.array(z.string().trim().normalize('NFC').min(1).max(LIMITS.wordLadderWord).refine(isStorable, UNSTORABLE))
      .min(2).max(LIMITS.maxWordLadderSteps + 1),
    /** Після стількох кроків балів немає. */
    maxSteps: z.number().int().min(1).max(LIMITS.maxWordLadderSteps) }
  // wordladder.ts (LIMITS лише всередині функцій: quiz.ts імпортує цей файл)
  export function ladderKey(word: string): string | null;
  export function ladderLetters(key: string): number;              // без апострофа
  export function oneLetterApart(a: string, b: string): boolean;   // аргументи — ключі
  export type LadderPathIssue = 'wordladder_word' | 'wordladder_length' | 'wordladder_step' | 'wordladder_steps';
  export function ladderPathIssue(path: readonly string[], maxSteps: number): LadderPathIssue | null;
  export function collapseLadder<T>(items: readonly T[]): (T | null)[];
  // answer.ts
  /** Підсумок драбини гравця; складає рушій, з телефона не приходить. words — ключі після стартового. */
  export interface WordLadderAnswer { type: 'wordladder'; words: string[]; steps: number; finished: boolean }
  export type Answer = SubmittedAnswer | ChainAnswer | SortAnswer | WallAnswer | SurveyAnswer | BluffAnswer | WordLadderAnswer;
  // events.ts
  export const wordLadderWordSchema = z.object({ word: z.string().max(LIMITS.wordLadderWord).refine(isStorable, UNSTORABLE) });
  export const wordLadderCheckSchema = z.object({ words: z.array(z.string().max(LIMITS.wordLadderWord).refine(isStorable, UNSTORABLE)).min(1).max(LIMITS.maxWordLadderSteps + 1) });
  'player:wordladder': (payload: z.infer<typeof wordLadderWordSchema>, ack: Ack) => void;
  'player:wordladder-back': (ack: Ack) => void;
  // game.ts ErrorCode
  | 'word_one_letter' | 'word_unknown' | 'word_repeat' | 'word_none' | 'word_too_many'
  ```
- Правила перевірки — як у «Рішеннях плану» (`ladderPathIssue` → повідомлення схеми, `wordladder_video`, `wordladder_place`).

- [ ] **Step 1: Write the failing tests.** Літерали — у тестах.
  - `wordladder.test.ts`:
    - `ladderKey normalizes case, NFC and apostrophes and refuses non-Ukrainian letters`:
      - `ladderKey(' ПОЛЕ ') === 'поле'`;
      - `ladderKey('м’ята') === ladderKey('мʼята') === "м'ята"`;
      - `ladderKey('йод') === 'йод'`;
      - `ladderKey('Їжак') === 'їжак'`;
      - `null` для `'pole'`, `'пiле'` (латинське i), `'по ле'`, `"'поле"`, `"по''ле"`, `''`, `'ёж'`.
    - `one letter apart`:
      - `oneLetterApart('поле','пола')` true;
      - `('поле','поле')` false, `('поле','пила')` false, `('поле','полем')` false;
      - `('ґава','гава')` true (ґ ≠ г).
    - `path issues in order`:
      - `ladderPathIssue(['поле','пола','пора','пара','тара'], 4)` null, а з `maxSteps` 3 — `'wordladder_steps'`;
      - `['поле','полем']` — `'wordladder_length'`;
      - `['поле','пила']` — `'wordladder_step'`;
      - `['по','па']` — `'wordladder_word'`;
      - 8-літерне слово — `'wordladder_word'`.
    - `collapse keeps start, second, gap and last two`:
      - `collapseLadder([1,2,3,4,5])` → `[1,2,3,4,5]`;
      - `collapseLadder([1,2,3,4,5,6])` → `[1,2,null,5,6]`.
  - `quiz.test.ts` — помічник `ladderQ(path, patch)`, `maxSteps: 8`, `timeLimit: 90`:
    - `accepts a word ladder with a valid host path` — приклад власника проходить;
    - `refuses a broken path, too many steps and a video` — повідомлення `wordladder_step`, `wordladder_steps`, `wordladder_video`;
    - `a word ladder plays only in classic and final rounds` — `blitzRound`, `wipeoutRound`, клітинка поля дають `wordladder_place`; класика й фінал — true;
    - `old quizzes still parse` — наявна фікстура без драбини проходить без змін;
    - `answerSchema never accepts a ladder summary; the word event is limited`: `answerSchema` з `{ type: 'wordladder', … }` — false; `wordLadderWordSchema` з 31 символом чи числом — false; `wordLadderCheckSchema` з 22 словами — false.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared`. Очікується FAIL (немає `wordladder.ts` і гілки схеми).

- [ ] **Step 3: Implement** усе з блоку Interfaces. Гілка `ids` у `superRefine` для драбини дає `[]`. Якщо тест досягнень чекає `goal` 17, оновити його на 18 з коментарем «26c: новий тип».

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/shared && tsc -p packages/shared`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): 26c word ladder question, letter rules, summary answer and word/back events"
```

---

### Задача 2. Словник: скрипт збирання, файл даних, CREDITS, читач на сервері

**Files:**
- Create: `apps/server/scripts/wordladder-dict.ts`, `apps/server/scripts/wordladder-dict.test.ts`
- Create: `apps/server/data/wordladder-uk.txt` (результат скрипта), `CREDITS` (корінь репозиторію)
- Create: `apps/server/src/wordladder/nouns.ts`, `apps/server/src/wordladder/nouns.test.ts`, `apps/server/src/wordladder/__fixtures__/nouns.txt`

**Interfaces:**
- Consumes: `ladderKey`, `ladderLetters` (задача 1).
- Produces:
  ```ts
  // scripts/wordladder-dict.ts
  export const VESUM_VERSION = 'v6.8.6';
  export const EXCLUDED: ReadonlySet<string>;           // ключі, пов'язані з росією (правило власника)
  /** Рядок dict_corp_vis.txt → ключ іменника в називному однини 3–7 літер або null. */
  export function nounOf(line: string): string | null;
  export function header(): string[];                    // рядки '# …' з атрибуцією й ліцензією
  // src/wordladder/nouns.ts
  export interface NounDictionary { isNoun(key: string): boolean; readonly size: number }
  export const NOUNS_FILE: string;                       // resolve(import.meta.dirname, '../../data/wordladder-uk.txt')
  export function parseNouns(text: string): NounDictionary;   // пропускає порожні й '#'
  export function loadNouns(file?: string): NounDictionary;   // readFileSync
  export function lazyNouns(file?: string): NounDictionary;   // читає файл при першому isNoun/size
  export function nounsOf(words: readonly string[]): NounDictionary; // для тестів, через ladderKey
  ```
- Як запускати скрипт (написати те саме в його шапці):
  - вручну завантажити й розпакувати, у порожню теку поза репозиторієм:
    `curl -L -o dict.bz2 https://github.com/brown-uk/dict_uk/releases/download/v6.8.6/dict_corp_vis.txt.bz2 && bzip2 -dc dict.bz2 > dict_corp_vis.txt`
  - запустити: `pnpm --filter @quiz/server exec tsx scripts/wordladder-dict.ts <шлях до dict_corp_vis.txt>`
  - скрипт читає файл потоком (`readline`), бо в ньому 319 МБ, і перезаписує `apps/server/data/wordladder-uk.txt`.
  - Мережі скрипт не торкається.
- Шапка файлу даних і `CREDITS`, по рядку:
  - `Word ladder dictionary derived from VESUM (dict_uk v6.8.6) by brown-uk, https://github.com/brown-uk/dict_uk`;
  - `License: CC BY-NC-SA 4.0, https://creativecommons.org/licenses/by-nc-sa/4.0/`;
  - `Changes: nouns in nominative singular, 3–7 letters, lowercased, filtered`.
  - У `CREDITS` ще один рядок: `Replace this dictionary or obtain the authors' permission before any monetization.`
- `EXCLUDED`: скрипт друкує кандидатів з основами `моск`, `кацап`, `раш`, `рус`, `рос`. Виконавець переглядає їх і вносить у набір **лише** слова, пов'язані з росією (наприклад, `москаль`). Звичайні слова на кшталт `роса` чи `русло` лишаються. Короткий перелік — у коміті.

- [ ] **Step 1: Write the failing tests.**
  - `wordladder-dict.test.ts`, `nounOf` на рядках-фікстурах у тесті:
    - `'поле noun:inanim:n:v_naz'` → `'поле'`;
    - `'  поля noun:inanim:n:v_rod'` → null;
    - `'ножиці noun:inanim:p:v_naz:ns'` → null;
    - `'Аа noun:inanim:f:v_naz:nv:prop:geo'` → null;
    - `'ААА noun:inanim:m:v_naz:nv:abbr'` → null;
    - `'аа intj:bad'` → null;
    - `"м'ята noun:inanim:f:v_naz"` → `"м'ята"`;
    - `'кіт noun:anim:m:v_naz    # тварина'` → `'кіт'`;
    - 2- і 8-літерні іменники → null;
    - `[...EXCLUDED].every((w) => nounOf(\`${w} noun:anim:m:v_naz\`) === null)`.
  - `nouns.test.ts`:
    - `parses a list, skipping comments and blanks` — `parseNouns('# x\nполе\n\nпола\n')`: `size` 2, `isNoun('поле')` true;
    - `loads the fixture file` — `__fixtures__/nouns.txt` з `поле пола пора пара тара кора кара`;
    - `lazyNouns reads the file only when first asked` — неіснуючий шлях не кидає до першого `isNoun`;
    - `the committed dictionary is a real noun list`:
      - `loadNouns()` (локальний файл, без мережі) має `size > 20_000`;
      - містить `поле пола пора пара тара кора кара кіт кит "м'ята"`;
      - не містить `київ` (власна назва), `бігти` (дієслово), жодного з `EXCLUDED`;
      - кожне слово має `ladderKey(w) === w` і 3–7 літер.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/scripts/wordladder-dict.test.ts apps/server/src/wordladder`. Очікується FAIL.

- [ ] **Step 3: Implement** скрипт і читач. Завантажити VESUM у scratch-теку, запустити скрипт і перевірити результат: ≈25 000 рядків, ≈320 КБ. Якщо файл виходить понад 2 МБ — зупинитися й доповісти: фільтр зламався. Написати `CREDITS`.

- [ ] **Step 4: Run** тести з кроку 2 і `tsc -p apps/server`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/scripts/wordladder-dict.ts apps/server/scripts/wordladder-dict.test.ts apps/server/data/wordladder-uk.txt apps/server/src/wordladder CREDITS
git commit -m "feat(server): 26c noun dictionary from VESUM v6.8.6 (CC BY-NC-SA 4.0) behind isNoun, one-off build script, CREDITS"
```

---

### Задача 3. Рушій: хід, крок назад, фініш, бали, фінал

**Files:**
- Create: `packages/engine/src/wordladder.ts`, `packages/engine/src/game.wordladder.test.ts`
- Modify: `packages/engine/src/game.ts`:
  - `WordLadderProgress`, `Play.wordladder`;
  - `submitAnswer`: `type_mismatch` для драбини, як для `chain`;
  - `lockNow` і друге місце виклику `scoreChain` (≈ рядок 2285) — додати `scoreWordLadder`;
  - `overrideGrade`: `wrong_phase`;
  - вилучення гравця: прибрати його з `play.wordladder`, як `chain`;
  - `gradable` у фіналі пульта (`views.ts` ≈ рядок 783) — не тут, а в задачі 4.
- Modify: `packages/engine/src/score.ts` (`wordLadderShare`), `packages/engine/src/buffs.ts` (`'off_wordladder'`), `packages/engine/src/index.ts`, `packages/engine/src/restore.ts` (лише коментар), `packages/engine/src/testing/fixtures.ts` (`wordladder`), `packages/engine/src/testing/autopilot.ts` (бот проходить `path`)
- Test: `packages/engine/src/score.test.ts`, `packages/engine/src/game.final.test.ts`, `packages/engine/src/restore.test.ts` (додати `'wordladder'` у `keysOf<Play>`), `packages/engine/src/game.buffs.test.ts`

**Interfaces:**
- Consumes: `ladderKey`, `oneLetterApart`, `WordLadderAnswer`, `LIMITS` (задача 1).
- Produces:
  ```ts
  // game.ts
  /** Поступ драбини гравця (команди): прийняті слова після стартового, ключами ladderKey. */
  export interface WordLadderProgress { words: string[] }
  // Play: /** Лише в запитанні-драбині; гравця тут немає, поки він не прийняв жодного слова. */ wordladder?: Record<string, WordLadderProgress>;
  // wordladder.ts
  export function wordLadderOf(state: GameState, playerId: string): WordLadderProgress;   // без запису — { words: [] }
  export function ladderWord(state: GameState, playerId: string, word: string, now: number, isNoun: (key: string) => boolean): Result;
  export function ladderBack(state: GameState, playerId: string, now: number): Result;
  export function scoreWordLadder(state: GameState): GameState;   // на етапі question, інакше той самий стан
  // score.ts
  /** Частка ціни драбини: 0 понад max, інакше (max − steps + 1) / (max − best + 1). */
  export function wordLadderShare(steps: number, best: number, max: number): number;
  // testing/fixtures.ts
  export const wordladder = { ...base, id: 'q10', type: 'wordladder', text: 'Від поля до тари', timeLimit: 90, points: 500,
    path: ['поле', 'пола', 'пора', 'пара', 'тара'], maxSteps: 8 } satisfies Question;
  ```
- `ladderWord`, `ladderBack` і бали поводяться за «Рішеннями плану». Після запису фінішу — `autoLock(withFinalPoints(...), now)`, як у `guessWord`.

- [ ] **Step 1: Write the failing tests.**
  - Спільне для тестів:
    - `isNoun = (k) => NOUNS.has(k)`, де `NOUNS = new Set(['поле','пола','пора','пара','тара','кора','кара'])`;
    - `fresh()` = `startRound(lobbyWith(makeQuiz([wordladder]), 'Олена', 'Тарас', 'Віра'), 0)`;
    - `walk(s, id, words, now)` — послідовні `ladderWord`.
  - `game.wordladder.test.ts`:
    - `accepts one changed letter and refuses the rest without changing state`:
      - `'ПОЛА'` → `wordLadderOf(...).words` `['пола']`;
      - потім `'пола'` → `word_repeat`;
      - `'пила'` від `пола` → `word_one_letter`;
      - `'полем'` → `word_one_letter`;
      - `'поси'` → `word_one_letter`;
      - `'пофа'` (одна літера від `пола`, немає в словнику) → `word_unknown`;
      - `'pola'` → `word_unknown`;
      - після кожної відмови стан `toBe` попередній.
    - `the host path is always accepted even when the dictionary lacks it` — `isNoun = () => false`, увесь `path` проходить і фінішує.
    - `a decomposed letter and a typographic apostrophe are the same word` — запитання зі шляхом `["м'ята","м'яти"]`: `'М’ЯТИ'` фінішує; `ladderKey` у `й` перевірено в задачі 1.
    - `step back removes the last word; finishing fixes the result`:
      - `ladderBack` прибирає останнє слово;
      - фініш дає запис `{ answer: { type: 'wordladder', steps: 4, finished: true }, accepted: true, grade: 'correct' }`.
    - `refuses moves after finishing, after time, on pause and an empty step back`:
      - після фінішу `ladderBack` і `ladderWord` → `already_answered`;
      - `now` після `endsAt` → `time_over`;
      - `pause` → `paused`;
      - `ladderBack` без слів → `word_none`.
    - `stops at the word cap` — після 40 слів (поле↔пола туди-назад) → `word_too_many`.
    - `the question closes when every connected player has finished` — останній фініш дає `phase: 'locked'`; поки Віра не фінішувала, запитання відкрите; `tick` після `endsAt` закриває.
    - `scores by the room's best finisher within the maximum`:
      - ціна 500, `maxSteps` 8: Олена 4 кроки → 500, Тарас 5 → 400 (`поле пола пора кора кара тара`);
      - Віра з поступом без фінішу → запис `accepted: false`, 0;
      - хто не торкався — без запису.
      - Окремі випадки:
        - двоє з 4 кроками — 500 обом;
        - фінішер з 9 кроками при `maxSteps` 8 — `grade: 'wrong'`, 0, і в `best` не входить (сам-один: 0, інші без змін);
        - ніхто не дійшов — 0 усім;
        - множник раунду 2, ціна 333, 4 і 5 кроків → 666 і `Math.round(666 × 4 / 5)` = 533;
        - `speedBonus`, `partial` і `penalty: 'minus'` раунду балів не змінюють.
    - `the plain answer event and the host grade do not apply` — `submitAnswer(..., { type: 'wordladder', … })` → `type_mismatch`; `override` → `wrong_phase`.
    - `removing a player drops their ladder` — `removePlayer` прибирає ключ з `plays[0].wordladder`.
  - `score.test.ts`: `wordLadderShare(5, 4, 8) === 0.8`, `(4,4,8) === 1`, `(9,4,8) === 0`, `(8,4,8) === 0.2`.
  - `game.final.test.ts`, `a word ladder in the final wins the wager within the maximum`:
    - ставка 400, фініш за 4 кроки → +400;
    - фініш за 9 при `maxSteps` 8 → −400;
    - поступ без фінішу при закритті → −400.
  - `game.buffs.test.ts`: на драбині баф відмовляє з `'off_wordladder'`.
  - `restore.test.ts`:
    - `keysOf<Play>` з `'wordladder'`;
    - знімок з `plays[0].wordladder = { p1: { words: ['пола'] } }` відновлюється й зберігає слова;
    - `GAME_STATE_VERSION` дорівнює 22.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - `wordladder.ts` — за зразком `chain.ts`: імпорти з `game.ts` лише під час виклику. Цикл імпортів той самий, що описаний у `blitz.ts`.
  - `normalizeText` тут не використовується, лише `ladderKey`.
  - Бот `testing/autopilot.ts`: `case 'wordladder'` проходить `path.slice(1)` з `isNoun = () => false`.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/engine && tsc -p packages/shared && tsc -p packages/engine`. Очікується PASS. Наявні тести без змін очікувань, окрім `keysOf<Play>`.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): 26c word ladder — one-letter moves checked against the host path and isNoun, step back, scoring by the room's best within the maximum, final wagers"
```

---

### Задача 4. Рушій: зрізи, живі відповіді, захист від спойлерів

**Files:**
- Modify: `packages/shared/src/views.ts` (нові типи й необов'язкові поля), `packages/engine/src/views.ts`, `packages/engine/src/live.ts`
- Test: `packages/engine/src/views.wordladder.test.ts` (новий), `packages/engine/src/live.test.ts`

**Interfaces:**
- Consumes: `wordLadderOf`, записи з задачі 3.
- Produces (`shared/views.ts`):
  ```ts
  export interface PublicWordLadder { start: string; target: string; /** Літер у слові. */ letters: number; maxSteps: number }
  export interface WordLadderRow {
    playerId: string; nickname: string; steps: number; finished: boolean;
    /** Слова гравця після стартового: ведучому завжди; сцені й гравцям — лише на reveal і лише фінішерів; інакше null. */
    words: string[] | null;
    /** Бали лише на reveal, інакше null. */
    points: number | null;
  }
  export interface WordLadderInfo {
    start: string; target: string; maxSteps: number;
    /** Шлях ведучого: ведучому завжди, іншим лише на reveal; інакше null. */
    path: string[] | null;
    /** Фінішери за кроками за зростанням, далі решта за кроками спаданням, далі в порядку гравців. */
    rows: WordLadderRow[];
  }
  export interface PlayerWordLadder { words: string[]; steps: number; finished: boolean;
    /** question, не пауза, не фінішував. */ canAdd: boolean; /** canAdd і є слова. */ canBack: boolean }
  // PublicQuestion: wordladder?: PublicWordLadder
  // BaseView: wordladder?: WordLadderInfo   (сцена й гравці у фіналі — поля немає)
  // PlayerView.me: wordladder?: PlayerWordLadder
  // HostView: wordladder?: WordLadderInfo   (і у фіналі)
  // LiveProgress: | { kind: 'wordladder'; steps: number; words: string[]; finished: boolean }
  ```
- Поля є лише тоді, коли поточне запитання — драбина (`question`, `locked`, `reveal`). Інакше ключа немає взагалі (`...(x === undefined ? {} : { wordladder: x })`).
- `live.ts`: `'wordladder'` у `PROGRESS_TYPES` і `UNGRADABLE`.
- `views.ts` ≈ рядок 783: `gradable` у фіналі виключає й драбину.

- [ ] **Step 1: Write the failing tests** (`views.wordladder.test.ts`; стан із задачі 3, де Олена має `['пола','пора']`, а Тарас `['пола']`):
  - `the public question shows start, target, letters and the maximum` — `{ start: 'поле', target: 'тара', letters: 4, maxSteps: 8 }`; у `stageView` немає `path`.
  - `never sends the host path or another player's words before reveal`:
    - на `question` і `locked` `JSON.stringify(stageView(s))` не містить `'пора'` і `'пара'`;
    - `JSON.stringify(playerView(s, 'p2'))` не містить `'пора'`;
    - `playerView(s,'p1').me.wordladder.words` — `['пола','пора']`;
    - у фіналі в `stageView` немає `wordladder`.
  - `stage rows carry only steps until reveal, then the finishers' words and points`:
    - на `question` `rows[*].words` — null;
    - на `reveal` `path` — шлях ведучого, у фінішерів `words` і `points`, у нефінішера `words` null.
  - `the host sees every player's words live and the path` — `hostView(s).wordladder.path` і `rows` з `words`; `live` рядок `{ kind: 'wordladder', steps: 2, words: ['пола','пора'], finished: false }`.
  - `other questions keep their views unchanged` — для `single` у зрізах немає ключа `wordladder`.
  - `canAdd and canBack follow phase, pause and finish`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.

- [ ] **Step 3: Implement** за блоком Interfaces. `start`/`target` — `path[0]`/`path.at(-1)` як записав ведучий; регістр показу задає CSS.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/engine packages/shared && tsc -p packages/shared && tsc -p packages/engine`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/views.ts packages/engine
git commit -m "feat(engine): 26c word ladder views — steps only for the stage until reveal, own words for the player, everything live for the host"
```

---

### Задача 5. Сервер: події гравця, словник у кімнатах, ендпоінт перевірки

**Files:**
- Create: `apps/server/src/wordladder-routes.ts`, `apps/server/src/wordladder-routes.test.ts`
- Modify:
  - `apps/server/src/rooms/manager.ts`: `RoomManagerOptions.nouns`, методи, `answerStamp`;
  - `apps/server/src/socket.ts`: дві події;
  - `apps/server/src/app.ts`: `AppOptions.nouns`; `const nouns = options.nouns ?? lazyNouns()` передається менеджеру й маршруту.
- Test: `apps/server/src/socket.test.ts`, `apps/server/src/rooms/manager.test.ts`, `apps/server/src/restart.test.ts`, `apps/server/src/recorder.test.ts`

**Interfaces:**
- Consumes: `NounDictionary`, `lazyNouns`, `nounsOf` (задача 2); `ladderWord`, `ladderBack`, `wordLadderOf` (задача 3); `wordLadderWordSchema`, `wordLadderCheckSchema` (задача 1).
- Produces:
  ```ts
  // RoomManagerOptions: /** Словник драбини; типово lazyNouns() — файл читається при першому слові. */ nouns?: NounDictionary;
  wordLadderWord(room: Room, playerId: string, word: string): AckResult;   // act(room, playerId, 'answerer'), як guess
  wordLadderBack(room: Room, playerId: string): AckResult;
  // socket.ts: 'player:wordladder' (wordLadderWordSchema) і 'player:wordladder-back' — лише player, інакше FORBIDDEN; кривий payload — INVALID
  // wordladder-routes.ts
  export async function registerWordLadderRoutes(app: FastifyInstance, deps: { nouns: NounDictionary; currentUser: (r: FastifyRequest) => Promise<{ id: string } | null> }): Promise<void>;
  // POST /api/wordladder/check { words } → 200 { unknown: string[] } (слова як надіслано); 400 { error: 'invalid_payload' };
  // rateLimit { max: 60, timeWindow: '1 minute', keyGenerator: `wordladder:${user?.id ?? ip}` }
  ```

- [ ] **Step 1: Write the failing tests:**
  - `socket.test.ts`, `player:wordladder and player:wordladder-back are player-only and validated`:
    - ведучий і сцена отримують `forbidden`;
    - `{ word: 5 }` і 31 символ — `invalid_payload`;
    - справжнє слово через сокет повертає `{ ok: true }`, а відмова — `{ ok: false, error: 'word_one_letter' }`.
    - Менеджер у тестах створюється з `nouns: nounsOf([...])`.
  - `manager.test.ts`, `word ladder moves reach the engine with the room dictionary and change the answer stamp` — після слова гравець отримує новий зріз з `me.wordladder.words`.
  - `restart.test.ts`, `a restored room keeps every player's ladder words` — збережена й піднята кімната має ті самі `play.wordladder`.
  - `recorder.test.ts`, `a word ladder answer is recorded with its summary` — `payload: { type: 'wordladder', steps: 4, finished: true }`, `accepted: true`, `points: 500`.
  - `wordladder-routes.test.ts`:
    - `returns the words missing from the dictionary` — `{ words: ['ПОЛЕ','поси','pola'] }` → `{ unknown: ['поси','pola'] }`;
    - `refuses a bad body` — 22 слова чи не масив → 400;
    - `limits the rate` — 61-й запит за хвилину → 429.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/socket.test.ts apps/server/src/rooms/manager.test.ts apps/server/src/restart.test.ts apps/server/src/recorder.test.ts apps/server/src/wordladder-routes.test.ts`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - Переконатися, що нічого в сервері не читає справжній словник у тестах, які драбини не торкаються (`lazyNouns`).
  - `apps/server/scripts/logic/check.ts` (вичерпний `switch` за типом): додати `case 'wordladder'`, що перевіряє `ladderPathIssue`.

- [ ] **Step 4: Run** тести з кроку 2, потім увесь `pnpm vitest run --maxWorkers=2 apps/server/src`, потім `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat(server): 26c word ladder socket events with the room dictionary and a rate-limited editor check endpoint"
```

---

### Задача 6. Веб: тексти типу, формат відповіді, історія, довідка

**Files:**
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts` (`ADDED_26C`), `apps/web/src/locales/{en,pl,de,es,it,ar}.json`
- Modify: `apps/web/src/format.ts` (`answerText`, правильна відповідь), `apps/web/src/admin/admin-text.ts`, `apps/web/src/guide-text.ts` (`typeIcon` `'🔤'`, `typeHow_wordladder`)
- Modify: `apps/web/src/help/help-uk.ts` (`question.wordladder.*`), `apps/web/src/help/help-vars.ts` (`minWordLadderLetters`, `maxWordLadderLetters`, `maxWordLadderSteps`), `apps/web/src/help/__fixtures__/help-uk-golden.json` (нові id, свідомо), `apps/web/src/locales/{en,pl,de,es,it,ar}.help.json`
- Modify: `apps/web/src/screens/LiveAnswers.tsx` (`case 'wordladder'`: «Кроків: N · пола → пора»)
- Test: `apps/web/src/format.test.ts`, `apps/web/src/guide-text.test.ts`, `apps/web/src/screens/LiveAnswers.test.tsx`, наявні `help-golden.test.ts`, `locales/checks.test.ts`, `source-scan.test.ts`

**Interfaces:**
- Consumes: типи з задач 1 і 4.
- Produces — uk-ключі цієї задачі (усі йдуть в `ADDED_26C`; задачі 7–9 дописують туди свої):
  ```ts
  type_wordladder: 'Словесна драбина',
  typeShort_wordladder: 'драбина слів',
  typeHow_wordladder: 'Від стартового слова дійдіть до цільового, міняючи щоразу одну літеру. Кожне слово — іменник. Менше кроків — більше балів.',
  buffWhy_off_wordladder: 'На словесній драбині бафів немає.',
  wordLadderAnswerDone: 'Дійшли за кроків: {steps}',
  wordLadderAnswerPart: 'Не дійшли, кроків: {steps}',
  wordLadderLiveSteps: 'Кроків: {steps}',
  err_word_one_letter: 'Ви замінили більше ніж одну літеру',
  err_word_unknown: 'Такого слова не існує',
  err_word_repeat: 'Це те саме слово, що й попереднє',
  err_word_none: 'Немає кроку, який можна прибрати',
  err_word_too_many: 'Забагато кроків',
  ```
- `answerText(answer, question)` для драбини:
  - фініш — `wordLadderAnswerDone`;
  - інакше — `wordLadderAnswerPart`.
- Правильна відповідь драбини — `path.join(' → ')` великими літерами (`toLocaleUpperCase('uk')`).
- Довідка `question.wordladder`:
  - `title`, `what`;
  - `how.0–2` — старт і ціль, одна літера й іменники в називному, «Крок назад»;
  - `points.0–2` — формула словами з прикладом власника 500/400/300/200/100; ніхто не дійшов — 0; у фіналі — ставка;
  - `tip.0` — перевірте шлях уголос;
  - `limits.0–2`:
    - `{minWordLadderLetters}–{maxWordLadderLetters} літер, до {maxWordLadderSteps} кроків.`;
    - `Лише в класичному раунді й у фіналі.`;
    - `Без відео й без бафів.`
- `help-uk-golden.json` отримує рівно ці нові id з тим самим текстом. Наявні записи не змінюються.

- [ ] **Step 1: Write the failing tests:**
  - `format.test.ts`:
    - `answerText({ type: 'wordladder', words: ['пола','пора','пара','тара'], steps: 4, finished: true }, ladderQ)` → `'Дійшли за кроків: 4'`;
    - `finished: false`, `steps: 2` → `'Не дійшли, кроків: 2'`;
    - правильна відповідь → `'ПОЛЕ → ПОЛА → ПОРА → ПАРА → ТАРА'`.
  - `guide-text.test.ts`: `typeHow('wordladder').length > 10`.
  - `LiveAnswers.test.tsx`: рядок з `progress: { kind: 'wordladder', steps: 2, words: ['пола','пора'], finished: false }` показує «Кроків: 2» і слова.
  - `i18n.test.ts`: `ADDED_26C` з ключами вище.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/format.test.ts apps/web/src/guide-text.test.ts apps/web/src/screens/LiveAnswers.test.tsx apps/web/src/i18n.test.ts apps/web/src/help apps/web/src/locales`. Очікується FAIL.

- [ ] **Step 3: Implement.** Переклади 6 мов пишуться природно, з тими самими плейсхолдерами. Для `ar` — за наявним стилем файлу.

- [ ] **Step 4: Run** тести з кроку 2 і `apps/web/src/source-scan.test.ts`. Очікується PASS. Повний `pnpm typecheck` може ще падати на `draft.ts`/`QuestionEditor.tsx` (задача 7) — тоді лише ці помилки.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 26c word ladder texts, answer format, live row, host help in uk and six locales"
```

---

### Задача 7. Веб: редактор драбини й попередження словника

**Files:**
- Modify:
  - `apps/web/src/editor/draft.ts`: `questionTypesFor` — лише `classic` і `final`; `newQuestion`, копія, чистка, проблеми, `Place.wordladder`;
  - `apps/web/src/editor/QuestionEditor.tsx`: гілка `case 'wordladder'`; відео сховано, як для `chain`;
  - `apps/web/src/api.ts`: `checkLadderWords`;
  - `apps/web/src/styles.css`: класи `wordladder-`;
  - `apps/web/src/i18n.ts`, 6 json, `ADDED_26C`.
- Test: `apps/web/src/editor/draft.test.ts`, `apps/web/src/editor/QuizEditor.test.tsx`

**Interfaces:**
- Consumes: `ladderPathIssue`, `ladderKey`, `LIMITS` (задача 1); `POST /api/wordladder/check` (задача 5).
- Produces:
  ```ts
  // api.ts
  /** Слова, яких немає в словнику драбини; null — сервер не відповів (попередження тоді не показується). */
  export async function checkLadderWords(words: string[]): Promise<string[] | null>;
  // draft.ts
  newQuestion('wordladder') → { ...common, video: null, type: 'wordladder', timeLimit: LIMITS.defaultWordLadderTime,
    path: ['', '', ''], maxSteps: LIMITS.defaultWordLadderSteps }
  // Place: wordladder: boolean — класика й фінал true; бліц, поле, «Ва-банк», «Вибування», «Мільйонер» false
  ```
- Проблеми (`TextKey`):
  - `problemEmptyWord` (наявний) — порожнє стартове чи цільове;
  - `problemWordLadderWord: 'Слово драбини — від 3 до 7 українських літер'`;
  - `problemWordLadderLength: 'Усі слова драбини мають бути однакової довжини'`;
  - `problemWordLadderStep: 'Кожне наступне слово має відрізнятися від попереднього рівно однією літерою'`;
  - `problemWordLadderSteps: 'Шлях довший за найбільшу кількість кроків'`;
  - `problemWordLadderPlace: 'Словесна драбина — лише в класичному раунді й у фіналі'`.
- Чистка: `trim` і `NFC` кожного слова; порожні **проміжні** рядки відкидаються, перше й останнє слово лишаються.
- UI (зразок — `Rows` і `NumberField` гілки `chain`):
  - поле «Стартове слово» (`wordLadderStart`);
  - рядки «Крок {index}» (`wordLadderStepN`, `addWordLadderStep: 'Додати слово'`, `removeWordLadderStep: 'Прибрати слово {index}'`);
  - поле «Цільове слово» (`wordLadderTarget`);
  - `NumberField` «Найбільше кроків» (`wordLadderMaxSteps`);
  - підказка `wordLadderHint: 'Задайте хоча б один правильний шлях. Гравці міняють щоразу одну літеру; кожне слово — іменник у називному відмінку однини. Хто дійде за найменше кроків, отримає повну ціну; після найбільшої кількості кроків — 0.'`;
  - коли `ladderPathIssue === null`, через 600 мс без змін — `checkLadderWords(path)`; непорожній результат показує `wordLadderUnknown: 'Немає в словнику: {words}. У грі ці слова однаково зарахуються.'` (`role="status"`, не помилка).

- [ ] **Step 1: Write the failing tests:**
  - `draft.test.ts`:
    - `newQuestion('wordladder')` → `toMatchObject` з блоку Interfaces;
    - `questionTypesFor('blitz' | 'board' | 'wipeout')` без `'wordladder'`, `classic`/`final` з ним;
    - чистка `['поле','',' пора ','тара']` → `['поле','пора','тара']`;
    - проблеми для кожного випадку вище;
    - драбина в раунді бліцу → `problemWordLadderPlace`;
    - змінений на драбину тип прибирає відео.
  - `QuizEditor.test.tsx`, `edits a word ladder and warns about words missing from the dictionary`:
    - `fetch` підмінено: `/api/wordladder/check` → `{ unknown: ['поси'] }`;
    - ввести ПОЛЕ / ПОЛА / ПОРА / ПАРА / ТАРА, максимум 8;
    - зберегти → `{ type: 'wordladder', path: ['ПОЛЕ','ПОЛА','ПОРА','ПАРА','ТАРА'], maxSteps: 8, video: null }`;
    - зі словом `поси` в шляху (зламаним кроком) запит не йде й показано проблему;
    - з повідомленням `unknown` видно попередження, а зберегти можна.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/editor apps/web/src/i18n.test.ts apps/web/src/locales`. Очікується FAIL.

- [ ] **Step 3: Implement** за блоком Interfaces.

- [ ] **Step 4: Run** тести з кроку 2 і `pnpm typecheck`. Очікується PASS: від цієї задачі повний typecheck зелений.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 26c word ladder editor — start, steps, target and maximum, path rules, dictionary warning"
```

---

### Задача 8. Веб: телефон гравця

**Files:**
- Create: `apps/web/src/screens/WordLadderView.tsx`, `apps/web/src/screens/WordLadderView.test.tsx`
- Modify: `apps/web/src/screens/PlayerScreen.tsx` (етапи `question`, `locked`, `reveal`), `apps/web/src/screens/TeamWatch.tsx` (стовпчик команди лише для читання), `apps/web/src/styles.css`, `apps/web/src/i18n.ts`, 6 json, `ADDED_26C`
- Test: `apps/web/src/screens/PlayerScreen.test.tsx`

**Interfaces:**
- Consumes: `PublicWordLadder`, `PlayerWordLadder` (задача 4); `collapseLadder` (задача 1); події задачі 5; `errorText` для `word_*`.
- Produces:
  ```tsx
  /** Стовпчик: старт, прийняті слова (згорнуті понад 5), рядок порожніх клітинок, якщо current. */
  export function WordLadderColumn(props: { start: string; target: string; words: string[]; letters: number; current?: boolean }): JSX.Element;
  /** Телефон: «ПОЛЕ → ТАРА», стовпчик, поле вводу, «Додати», «Крок назад», повідомлення сервера; після фінішу — «Готово! Кроків: N». */
  export function WordLadderPlay(props: { ladder: PlayerWordLadder; question: PublicQuestion; paused: boolean; send: Send }): JSX.Element | null;
  ```
- uk-ключі:
  - `wordLadderGoal: '{start} → {target}'`;
  - `wordLadderLabel: 'Наступне слово'`;
  - `wordLadderAdd: 'Додати'`;
  - `wordLadderBack: 'Крок назад'`;
  - `wordLadderDone: 'Готово! Кроків: {steps}'`;
  - `wordLadderOut: 'Не встигли дійти до цілі'`;
  - `wordLadderMax: 'Бали — до {max} кроків'`;
  - `wordLadderWait: 'Чекаємо на інших'`;
  - `wordLadderGap: 'Пропущені слова'` (`aria-label` для «…»).
- Поведінка:
  - відповідь `ok` очищає поле;
  - відмова показує `errorText(error)` під полем (`role="status"`) і лишає слово в полі;
  - `busy`-ref не дає другого запиту, поки триває перший (і для «Крок назад»);
  - «Крок назад» вимкнено при `!canBack`;
  - поле вводу `maxLength={LIMITS.wordLadderWord}`, `autoCapitalize="none"`, `autoComplete="off"`, `enterKeyHint="go"`;
  - слова показано великими літерами CSS (`text-transform: uppercase`), клітинки — `.wordladder-cell`;
  - на 360 px без горизонтальної прокрутки з 7-літерними словами.

- [ ] **Step 1: Write the failing tests** (`WordLadderView.test.tsx`, `send` — `vi.fn`):
  - `shows the goal, the start and the empty cells`: «ПОЛЕ → ТАРА» (текст `поле → тара` з CSS-регістром перевіряється як текст `поле`/`тара`), 4 клітинки.
  - `adds a word and clears the field on ok` — `send('player:wordladder', { word: 'пола' })`.
  - `shows the server's reason and keeps the word` — `{ ok: false, error: 'word_one_letter' }` → «Ви замінили більше ніж одну літеру»; `word_unknown` → «Такого слова не існує».
  - `a double tap sends one request` — два сабміти до відповіді → один виклик.
  - `step back is off without words and after finishing`.
  - `collapses more than five words to start, second, gap and last two` — 6 слів + старт: видно `поле`, перше слово, «…» з `aria-label` «Пропущені слова», два останні.
  - `finished shows the step count without the input` — «Готово! Кроків: 4», поля немає.
  - `PlayerScreen.test.tsx`: на `question` з `me.wordladder` рендериться `WordLadderPlay`; на `locked` — стовпчик і `wordLadderDone`/`wordLadderOut`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/WordLadderView.test.tsx apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/i18n.test.ts apps/web/src/locales`. Очікується FAIL.

- [ ] **Step 3: Implement** за зразком `ChainPlay` (форма, `busy`, фокус). Власного годинника немає: працює загальний `Timer` екрана.

- [ ] **Step 4: Run** тести з кроку 2, `apps/web/src/source-scan.test.ts` і `pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 26c word ladder on the phone — goal, column with a collapsed middle, one-letter moves with the server's reasons, step back"
```

---

### Задача 9. Веб: сцена й пульт ведучого

**Files:**
- Modify: `apps/web/src/screens/WordLadderView.tsx` (`WordLadderBoard`), `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/HostScreen.tsx`, `apps/web/src/styles.css`, `apps/web/src/i18n.ts`, 6 json, `ADDED_26C`
- Test: `apps/web/src/screens/WordLadderView.test.tsx`, `apps/web/src/screens/StageScreen.test.tsx`, `apps/web/src/screens/HostScreen.test.tsx`

**Interfaces:**
- Consumes: `WordLadderInfo` (задача 4), `WordLadderColumn` (задача 8).
- Produces:
  ```tsx
  /** Рядки гравців: кроки / «фініш»; на reveal — місце, слова фінішера й бали; ведучому слова видно завжди (info.rows[*].words). */
  export function WordLadderBoard(props: { info: WordLadderInfo; reveal: boolean }): JSX.Element;
  ```
- uk-ключі:
  - `wordLadderOnPhone: 'Ведіть драбину на телефоні'`;
  - `wordLadderFinishedOf: 'Дійшли {finished} з {total}'`;
  - `wordLadderTitle: 'Словесна драбина'`;
  - `wordLadderRowSteps: 'кроків: {steps}'`;
  - `wordLadderRowFinished: 'фініш'`;
  - `wordLadderHostPath: 'Шлях ведучого'`.
- Сцена:
  - на `question` — «ПОЛЕ → ТАРА», `wordLadderOnPhone`, лічильник `wordLadderFinishedOf` (як `chainFinishedOf`) і `WordLadderBoard` без слів;
  - на `reveal` — `wordLadderHostPath` зі шляхом і `WordLadderBoard reveal`;
  - загальний рядок «Правильна відповідь: …» для драбини не показується (як для `chain` у `StageScreen.tsx` ≈ рядок 460);
  - у фіналі — як ланцюжок: дошки немає, розкриття йде по одному.
- Пульт: `wordLadderTitle`, шлях ведучого й `WordLadderBoard` зі словами завжди, також у фіналі. Кнопок оцінки немає.

- [ ] **Step 1: Write the failing tests:**
  - `WordLadderBoard`:
    - під час гри рядок показує «кроків: 2», без слів;
    - фінішер — «фініш»;
    - на `reveal` — місце, слова й `+400`;
    - рівні кроки ділять місце.
  - `StageScreen.test.tsx`, `a word ladder shows the goal and step counts, then the host path and the players' paths` — до `reveal` немає тексту `пора`; на `reveal` видно «Шлях ведучого».
  - `HostScreen.test.tsx`, `the host sees the path and every player's words live`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/WordLadderView.test.tsx apps/web/src/screens/StageScreen.test.tsx apps/web/src/screens/HostScreen.test.tsx apps/web/src/i18n.test.ts apps/web/src/locales`. Очікується FAIL.

- [ ] **Step 3: Implement** за зразком `ChainBoard` і місць, де `StageScreen`/`HostScreen` показують `chain`.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 apps/web` і `pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 26c word ladder on the stage and the host console — counts during play, paths and points on reveal"
```

---

### Задача 10. Наскрізний сценарій і кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе вище. Помічники e2e: `open`, `register`, `click`, `shot`, `expectNoSideScroll`, `snapshot`, `makeRoundsQuiz`, `classicRound`-подібні фабрики файла. Сервер e2e бере справжній словник з диска.

- [ ] **Step 1: Write the scenario.** `it('part 26c: a word ladder — one-letter moves checked by the dictionary, step back, only counts on the stage, the fewest steps win', …)` за зразком `part 26a` (`try/catch` → `snapshot()`).
  - **Редактор.** Ведучий створює вікторину через редактор: класичний раунд, драбина ПОЛЕ → ПОЛА → ПОРА → ПАРА → ТАРА, максимум 8, ціна 500, 90 с.
    - Слово `поси` в шляху показує проблему кроку; після виправлення попередження словника немає.
    - Кадр `wordladder26c-editor`.
  - **Гра.** Сцена 1600×900. Оля — 375×812, Тарас — 360×740, Іра — 360×740, Хосе — 320×640 `es-ES`.
  - **Хід гри:**
    - Тарас вводить `ПІЛА` → «Ви замінили більше ніж одну літеру»;
    - `ПОСЕ` → «Такого слова не існує»;
    - `пола`, потім «Крок назад»;
    - далі `ПОЛА ПОРА КОРА КАРА ТАРА` → «Готово! Кроків: 5»;
    - Оля: `ПОЛА ПОРА ПАРА ТАРА` → «Готово! Кроків: 4»;
    - Іра вводить `ПОЛА` і зупиняється;
    - Хосе не грає.
  - **Перевірки:**
    - до розкриття на сцені немає тексту `ПОРА`/`пора` (і в DOM `stage.content()`), а рядки сцени показують кроки;
    - пульт бачить слова Тараса наживо;
    - `expectNoSideScroll(taras, 'wordladder26c-phone-360')` з 6 словами, тобто згорнутим стовпчиком;
    - ведучий закриває запитання наявною кнопкою;
    - на розкритті сцена показує шлях ведучого, Олю `+500`, Тараса `+400`, Іру без балів;
    - історія гри показує «Дійшли за кроків: 4».
  - **Кадри (`E2E_SHOTS=1`):** `wordladder26c-phone-move`, `wordladder26c-phone-error`, `wordladder26c-phone-done`, `wordladder26c-phone-es-320`, `wordladder26c-stage-question`, `wordladder26c-host-live`, `wordladder26c-stage-reveal`, `wordladder26c-phone-reveal`.

- [ ] **Step 2: Run** `pnpm build`, потім на передньому плані `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 26c"` (менше 10 хв). Очікується PASS.

- [ ] **Step 3: Переглянути кадри:**
  - стовпчик і клітинки на 320/360 px не вилазять;
  - «…» на місці;
  - арабська й іспанська розкладки цілі.
  Якщо щось ламається — виправити CSS, коміт окремо.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2` (усе) і `pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts apps/web/src/styles.css
git commit -m "test(e2e): part 26c word ladder — dictionary and one-letter refusals, step back, counts only on the stage, 500/400 by fewest steps"
```
