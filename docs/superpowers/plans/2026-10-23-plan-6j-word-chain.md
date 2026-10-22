# План 6j: тип запитання «Ланцюжок слів»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** новий тип запитання «Ланцюжок слів» (`'chain'`) у класичному раунді й фіналі.
- Автор задає ланцюжок слів (Форель → Риба → Океан → …), час запитання, бали й скільки секунд додає підказка.
- Усі бачать перше слово, а решту лише як першу літеру й клітинки за довжиною («Р___»).
- Кожен гравець на своєму телефоні вгадує слова по черзі. Підказка відкриває йому одному наступну літеру поточного слова й додає йому секунди.
- Виграє той, у кого найменший час зі штрафом. Хто не пройшов ланцюжок за час запитання, отримує 0.

**Архітектура:**
- **Дані (`shared`).** Запитання `{ ...base, type: 'chain', words: string[], hintSeconds: number }`: `words[0]` — відкрите слово, `words[1..]` — приховані. Слова — літери з пробілами, дефісами чи апострофами між ними.
- **Новий підсумок відповіді.** `ChainAnswer = { type: 'chain'; solved: number; hints: number; timeMs: number }` входить у тип `Answer`, але **не** в `answerSchema`. `player:answer` не може його надіслати: гравець ніколи не повідомляє серверу «я пройшов».
- **Нові події.** `player:guess` (`{ word }`) і `player:hint` (без даних). Обидві перевіряє `zod` на сервері, а правила — рушій.
- **Стан (`engine`).** `Play.chain?: Record<playerId, ChainProgress>` з `{ solved, shown, hints }`. Новий файл `packages/engine/src/chain.ts` містить `guessWord`, `takeHint`, маски, особисті дедлайни й нарахування балів. Він побудований за зразком `blitz.ts`: імпортує з `game.ts`, а `game.ts` імпортує з нього.
- **Час гравця** дорівнює `now − startedAt + hints × hintSeconds × 1000`. `startedAt` після паузи вже зсувається (`resume`), тож пауза в час не входить. Особистий дедлайн: `endsAt − штраф`. «±15 с» ведучого зсуває `endsAt`, а з ним і дедлайни всіх.
- **Бали** рахуються в мить закриття запитання (`lockNow`), коли відомі часи всіх, а не під час відповіді.
- **Зрізи.** `PublicQuestion.chain` містить перше слово й загальні маски (перша літера й розділювачі). `PlayerView.me.chain` містить особисті маски, штраф і годинник. `BaseView.chain` містить поступ гравців без літер. Ведучий бачить слова в `correct`, як і для інших типів.
- **Веб.** Новий файл `apps/web/src/screens/ChainView.tsx` (`ChainPlay`, `ChainWords`, `ChainBoard`). Його використовують `PlayerScreen`, `StageScreen` і `HostScreen`. Редактор показує рядки слів і поле «Підказка додає, с».
- **База.** `answer.payload` — `jsonb` з будь-якою `Answer`, тож міграція не потрібна.

**Технології:** TypeScript, zod 4, vitest, Fastify + Socket.IO + Drizzle (PGlite у тестах), React + Vite, Playwright.

**Специфікація** (окремого документа немає; обов'язкові вимоги власника, переклад з української):

> Новий тип запитання «Ланцюжок слів». Автор планує ланцюжок слів, наприклад Форель → Риба → Океан → Корабль → Порт → Подорож → Літак, і задає таймер запитання, бали та скільки секунд додає підказка. У грі всі гравці бачать перше слово (Форель), а під ним решту ланцюжка прихованою: лише перша літера й пропуски за довжиною слова (Риба → «Р___»). Кожен гравець на своєму телефоні вгадує слова по черзі. Якщо застряг, гравець може взяти підказку, яка відкриває ще одну літеру поточного слова лише цьому гравцеві й додає до його часу секунди підказки, задані автором (наприклад, на годиннику 15 с, підказка → «Ок___», і годинник показує 20). Виграє той, у кого найменший час.

**Рішення власника (2026-10-23):**
- Час кожного гравця — його власний час від початку запитання плюс секунди штрафу за підказки. Таймер запитання є межею: гравець, який не пройшов увесь ланцюжок за цей час, отримує 0 балів.
- Бали «більше швидшим»: бали отримує кожен, хто пройшов. Найшвидший (найменший час зі штрафом) отримує повну ціну, інші менше залежно від часу (зрозуміла формула, наприклад лінійна між найшвидшим і межею часу з нижньою межею; рівні ділять місце).
- Лише в класичному раунді й фіналі (не в бліці, не в полі). У фіналі: пройшов ланцюжок у межах часу — правильно (ставка виграна), інакше ставка програна; час лише для показу.

**Рішення плану там, де вимоги мовчать:**
- **Розміри:**
  - від 3 до 10 слів (`LIMITS.minChainWords = 3`, `maxChainWords = 10`), тобто від 2 до 9 прихованих;
  - слово від 2 до 30 символів (`LIMITS.chainWord = 30`);
  - підказка від 1 до 30 с, типово 5 (`minHintSeconds`, `maxHintSeconds`, `defaultHintSeconds`).
- **Склад слова:** `CHAIN_WORD = /^\p{L}+(?:[ '’ʼ-]\p{L}+)*$/u` після `trim`. Тобто літери, а між ними по одному пробілу, дефісу чи апострофу («Нью-Йорк», «м'ята», «Біла Церква»). Цифр немає: перша літера має щось підказувати. Розділювачі видно всім одразу («Н__-____»), у кількість літер вони не входять.
- **Порівняння:** `normalizeText(guess) === normalizeText(word)` (регістр, пробіли по краях і всередині, види апострофа). Інших варіантів написання немає: слово однозначне, бо видно першу літеру й довжину.
- **Хибне слово** нічого не змінює й не штрафує: гравець пробує знову скільки завгодно. Сервер відповідає `{ ok: false, error: 'wrong_word' }`, а телефон показує «Не те слово» під полем. Хибні спроби не зберігаються.
- **Перша літера** кожного прихованого слова відкрита від початку (`shown = 1`).
- **Підказка** відкриває наступну закриту літеру зліва направо й ніколи останню: її можна брати, поки `shown < letterCount − 1`. Слово завжди дописує сам гравець. У слові з 2 літер підказок немає (`no_hint`).
  - Підказку, після якої час гравця досягне межі, сервер не дає (`hint_late`): інакше вона миттю закінчила б гру гравцеві.
  - Вгадане слово скидає `shown` до 1 для наступного; кількість підказок і штраф накопичуються.
- **Бали в класиці.** `L` — межа часу (мс, `limitMsOf(play)`, з урахуванням «±15 с»). `f` — найменший час серед тих, хто пройшов. `t` — час гравця. Тоді:
  `chainFactor(t, f, L) = L ≤ f ? 1 : clamp(1 − 0.5 × (t − f) / (L − f), 0.5, 1)`,
  `бали = round(points × multiplier × chainFactor)`.
  - Найшвидший отримує 100 %, той, хто встиг в останню мить, 50 %, між ними лінійно. Рівний час дає рівні бали.
  - Не пройшов, але грав (вгадав хоч одне слово або брав підказку): запис з `accepted: false`, 0 балів. Хибні спроби самі не рахуються: стану вони не змінюють. Штраф раунду `minus` до ланцюжка не застосовується (власник: «отримує 0»).
  - Не торкався ланцюжка: запису немає, як у того, хто мовчав на звичайному запитанні.
  - `speedBonus` і `partial` раунду ланцюжок не враховує. Серії й множник працюють як завжди: пройшов означає `accuracy: 1`.
- **Ручної оцінки немає.** `override` для ланцюжка повертає `wrong_phase` (перевірка за літерами однозначна, а зміна одного вердикту зсунула б найшвидшого й бали інших). Пульт і так показує кнопки оцінки лише для `text`.
- **Фінал.** Пройшов у межах свого часу — `+ставка`, гравав і не пройшов — `−ставка`, мовчав — `−ставка` без відповіді (як зараз). `check: 'manual'` для ланцюжка не діє. Час видно в рядку розкриття.
- **Відео не можна:** ланцюжок без таймера не має межі. Схема відмовляє (`chain_video`), редактор ховає поле відео для цього типу, а зміна типу на ланцюжок прибирає відео.
- **Бліц і поле:** `quizSchema` відмовляє (`chain_round`), а редактор не показує кнопки «ланцюжок» у цих раундах.
- **Автозакриття.** Запитання закривається, коли кожен підключений гравець пройшов ланцюжок (наявний `autoLock`: у кожного є запис) або вичерпав свій час. Друге перевіряє `tick`. `nextDeadline` додає особисті дедлайни гравців зі штрафом, тож сервер прокинеться вчасно.
- **Поступ інших.** Сцена під час запитання показує рядок на кожного гравця: нікнейм, «3 з 6» або час проходження й кількість підказок, без літер. Пульт бачить те саме завжди, також у фіналі. Телефон показує лише власний ланцюжок.
  - У фіналі сцена й телефони поступу інших не отримують (`chain: null`): інакше розкриття по одному втратило б сенс.
- **Розкриття на сцені:** увесь ланцюжок зеленим, під ним рейтинг за часом (час, підказки, бали). Рядка «Правильна відповідь: …» для ланцюжка немає. Телефон і пульт показують `correctText` як «Форель → Риба → Океан → …».
- **Годинник на телефоні:**
  - угорі особистий відлік до свого дедлайну (наявний `Timer` з `endsAt = deadline`);
  - під словами рядок «Ваш час: 20 с», що рахує вгору (`limitMs − залишок`), тож підказка додає до нього 5 с, як у прикладі власника.
- **Відновлення зв'язку:** поступ живе в стані гри. Після повторного входу телефон отримує ті самі маски й годинник, губиться лише недописаний текст у полі.
- **Захист від спойлерів:**
  - до розкриття зрізи сцени й гравців не містять жодного прихованого слова: лише першу літеру, розділювачі й довжину;
  - зріз гравця містить літери, відкриті лише ним, і повні слова, вгадані ним;
  - чужих відкритих літер у ньому немає ніколи.
- **Історія й профіль.** У рядку `answer` лежить `ChainAnswer`, `accepted` = пройшов. Статистика профілю («правильних») і ачівки працюють без змін. Історія показує «Пройдено за 23,4 с, підказок: 1» або «Слів: 3 з 6».
- **«Мільйонер» і утримання** не стосуються: відповідають усі, ведучий нічого не приймає.
- **Демо:**
  - `apps/server/scripts/demo-quiz.ts` отримує ланцюжок власника Форель → Риба → Океан → Корабель → Порт → Подорож → Літак у раунді «Розминка»;
  - `apps/web/src/demo-quiz.ts` отримує ланцюжок `q8` з 4 слів.

## Глобальні обмеження

- Старі вікторини, ігри й історія поводяться як зараз. Наявні тести лишаються зеленими без зміни очікувань, окрім механічних полів `chain: null` у фабриках зрізів у тестах `apps/web/src/screens/*.test.tsx` (задача 5).
- Рушій чистий: `now` і `rng` передаються аргументами, без мережі й таймерів.
- Значення: 3–10 слів, слово 2–30 символів за `CHAIN_WORD`, підказка 1–30 с (типово 5), бали за `chainFactor` з нижньою межею 0.5.
- Повні приховані слова не потрапляють у зріз сцени чи гравця до етапу `reveal`. Чужі відкриті літери не потрапляють у зріз гравця ніколи.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`. Кольори лише через наявні токени `styles.css` (`--paper`, `--dim`, `--amber`, `--correct`, `--signal`, `--line`, `--panel`). Нові класи мають префікс `chain-`.
- Макет працює на ширині 360 px без горизонтальної прокрутки, навіть із 10 словами по 30 символів.
- Кожна задача починається з тесту, що падає. Перед комітом зелені `pnpm vitest run --maxWorkers=2` і перевірка типів за «Порядком збирання». Саме `--maxWorkers=2`, а не `pnpm test`: паралельні робітники PGlite падають на цій машині.
- Наскрізні тести: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Кадри знімаються з `E2E_SHOTS=1`.
- Міграцій немає. Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (проєкт тестовий).

## Порядок збирання

- Задача 1 додає `'chain'` у `Question` і `ChainAnswer` в `Answer`. Через вичерпні `switch` в `apps/web` (`format.ts`, `draft.ts`, `QuestionEditor.tsx`) `tsc -p apps/web` у задачах 1–4 не проходить. Для них перевірка: `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Від задачі 5 — повний `pnpm typecheck`.
- Задача 2 (правила рушія) спирається на 1. Задача 3 (зрізи й нові поля `PublicQuestion.chain`, `BaseView.chain`, `me.chain`) спирається на 2.
- Задача 4 (сервер) спирається на 1–3. Задача 5 (редактор, формат, демо, механічні `chain: null`) — на 1–3. Задача 6 (екрани гри) — на 3 і 5. Задача 7 (e2e) іде останньою.

## На що дивитися рецензентові

1. **Спойлер у зрізі.** До розкриття `JSON.stringify` зрізу сцени й гравця не містить жодного прихованого слова в будь-якому регістрі. Гравець p1 не бачить літер, які відкрив підказкою p2. Тест: задача 3, `never sends hidden words or another player's hint letters`.
2. **Час і пауза.** Штраф входить у час і в дедлайн. Пауза в час не входить. «+15 с» продовжує дедлайн. Гравець, у якого вийшов особистий час, не може вгадувати, а запитання закривається в його дедлайн, якщо інші вже пройшли. Тести: задача 2, `a player out of personal time cannot guess and the question closes at the earliest deadline`, `pause does not count and +15 s moves every personal deadline`.
3. **Підроблені події з сокета:** `player:guess` з числом, із 31+ символом, від ведучого чи сцени; `player:answer` з `{ type: 'chain', … }`; `player:answer` на запитання-ланцюжок. Усе відхиляється без збою (`invalid_payload`, `forbidden`, `type_mismatch`). Тести: задача 4, `player:guess and player:hint are player-only and validated`; задача 2, `the plain answer event cannot answer a chain`.
4. **Слова з дефісом, апострофом, пробілом і різним регістром.** «нью-йорк», «М’ята» з типографським апострофом зараховуються. Розділювач видно в масці й він не рахується як літера для підказки. Тести: задача 2, `separators are shown and do not count as letters`, `guesses go in order, case and spaces do not matter, a wrong word changes nothing`.
5. **Телефон 360 px із довгими словами** (30 символів) і 10 словами. Клітинки переносяться, кнопки «Перевірити» й «Підказка» на екрані, горизонтальної прокрутки немає. Тест: задача 7, `expectNoSideScroll(taras, 'chain-phone-360')` з довгим словом у ланцюжку.

---

### Задача 1. Схема: запитання, підсумок відповіді, події

**Files:**
- Modify: `packages/shared/src/quiz.ts` (`LIMITS`, `CHAIN_WORD`, гілка `questionSchema`, перевірки в `superRefine` запитання й `quizSchema`)
- Modify: `packages/shared/src/answer.ts` (`ChainAnswer`, тип `Answer`)
- Modify: `packages/shared/src/events.ts` (`guessSchema`, `player:guess`, `player:hint`)
- Modify: `packages/shared/src/game.ts` (`ErrorCode`)
- Modify: `packages/shared/src/views.ts` (лише `export type ChainMask = (string | null)[]`)
- Test: `packages/shared/src/quiz.test.ts`

**Interfaces:**
- Produces (shared):
  ```ts
  // LIMITS
  minChainWords: 3, maxChainWords: 10, chainWord: 30, minHintSeconds: 1, maxHintSeconds: 30, defaultHintSeconds: 5,
  /** Слово ланцюжка: літери, між ними по одному пробілу, дефісу чи апострофу. */
  export const CHAIN_WORD = /^\p{L}+(?:[ '’ʼ-]\p{L}+)*$/u;
  // гілка questionSchema
  { ...base, type: 'chain',
    /** words[0] видно всім; решта приховані. */
    words: z.array(z.string().trim().min(2).max(LIMITS.chainWord).regex(CHAIN_WORD).refine(isStorable, UNSTORABLE))
      .min(LIMITS.minChainWords).max(LIMITS.maxChainWords),
    hintSeconds: z.number().int().min(LIMITS.minHintSeconds).max(LIMITS.maxHintSeconds) }
  // answer.ts
  /** Підсумок ланцюжка гравця; його складає рушій, з телефона він не приходить. */
  export interface ChainAnswer { type: 'chain'; solved: number; hints: number; /** Час зі штрафом, мс. */ timeMs: number }
  export type SubmittedAnswer = z.infer<typeof answerSchema>;   // answerSchema без змін
  export type Answer = SubmittedAnswer | ChainAnswer;
  // events.ts
  export const guessSchema = z.object({ word: z.string().max(LIMITS.chainWord).refine(isStorable, UNSTORABLE) });
  'player:guess': (payload: z.infer<typeof guessSchema>, ack: Ack) => void;
  'player:hint': (ack: Ack) => void;
  // game.ts, ErrorCode
  | 'wrong_word' | 'no_hint' | 'hint_late'
  ```
- Правила перевірки:
  - у `superRefine` запитання: `chain` з `video !== null` дає `'chain_video'`;
  - у `quizSchema.superRefine`: запитання `chain` у раунді `blitz` або `board` (через `roundQuestions`) дає `'chain_round'`.

- [ ] **Step 1: Write the failing tests** (`quiz.test.ts`, наявні помічники `valid`, `round`):

```ts
const chainQ = (words: string[], patch: object = {}) => ({ id: 'c', type: 'chain', text: 'Ланцюжок', imageUrl: null, video: null,
  timeLimit: 60, points: 1000, words, hintSeconds: 5, ...patch });
it('accepts a chain of 3 to 10 words', () => {
  expect(valid(questionSchema, chainQ(['Форель', 'Риба', 'Океан']))).toBe(true);
  expect(valid(questionSchema, chainQ(Array.from({ length: 10 }, () => 'Слово')))).toBe(true);
  expect(valid(questionSchema, chainQ(['Форель', 'Риба']))).toBe(false);
  expect(valid(questionSchema, chainQ(Array.from({ length: 11 }, () => 'Слово')))).toBe(false);
});
it('chain words are letters with single spaces, hyphens or apostrophes between them', () => {
  for (const word of ['Нью-Йорк', "м'ята", 'М’ята', 'Біла Церква', 'Ох']) expect(valid(questionSchema, chainQ(['Форель', word, 'Океан']))).toBe(true);
  for (const word of ['Р', 'R2D2', '-Риба', 'Риба-', 'Біла  Церква', 'а'.repeat(31), '']) expect(valid(questionSchema, chainQ(['Форель', word, 'Океан']))).toBe(false);
  expect(questionSchema.parse(chainQ(['  Форель ', 'Риба', 'Океан'])).words[0]).toBe('Форель');
});
it('a hint adds 1 to 30 seconds', () => {
  expect(valid(questionSchema, chainQ(['Форель', 'Риба', 'Океан'], { hintSeconds: 1 }))).toBe(true);
  expect(valid(questionSchema, chainQ(['Форель', 'Риба', 'Океан'], { hintSeconds: 30 }))).toBe(true);
  expect(valid(questionSchema, chainQ(['Форель', 'Риба', 'Океан'], { hintSeconds: 0 }))).toBe(false);
  expect(valid(questionSchema, chainQ(['Форель', 'Риба', 'Океан'], { hintSeconds: 31 }))).toBe(false);
});
it('a chain cannot have a video', () => {
  const parsed = questionSchema.safeParse(chainQ(['Форель', 'Риба', 'Океан'], { video: { id: 'dQw4w9WgXcQ', start: 0 } }));
  expect(parsed.success).toBe(false);
  expect(parsed.error?.issues.map((i) => i.message)).toContain('chain_video');
});
it('a chain plays only in classic and final rounds', () => {
  // quizSchema з chainQ у класичному раунді та у фіналі — true;
  // у бліц-раунді та в клітинці поля — false з message 'chain_round'
});
it('answerSchema never accepts a chain summary and guessSchema limits the word', () => {
  expect(valid(answerSchema, { type: 'chain', solved: 6, hints: 0, timeMs: 1 })).toBe(false);
  expect(valid(guessSchema, { word: 'Риба' })).toBe(true);
  expect(valid(guessSchema, { word: 'а'.repeat(31) })).toBe(false);
  expect(valid(guessSchema, { word: 5 })).toBe(false);
});
```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared`. Очікується FAIL (гілки `chain` немає).

- [ ] **Step 3: Implement** усе з блоку Interfaces. Наявний `ids` у `superRefine` для `chain` дає `[]`. `guessSchema` експортується через наявний `index.ts`.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && tsc -p packages/shared`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): chain question with 3–10 words, its summary answer and guess/hint events"
```

---

### Задача 2. Рушій: вгадування, підказки, час і бали

**Files:**
- Create: `packages/engine/src/chain.ts`, `packages/engine/src/game.chain.test.ts`
- Modify: `packages/engine/src/game.ts` (`Play.chain`, `submitAnswer`, `lockNow`, `tick`, `end`, `override`, `removePlayer`), `packages/engine/src/blitz.ts` (`nextDeadline`), `packages/engine/src/score.ts` (`chainFactor`), `packages/engine/src/index.ts`, `packages/engine/src/testing/fixtures.ts`
- Test: `packages/engine/src/score.test.ts`, `packages/engine/src/game.final.test.ts`

**Interfaces:**
- Consumes: задача 1.
- Produces:
  ```ts
  // fixtures.ts (не додається до типового списку makeQuiz)
  export const chain = { ...base, id: 'q8', type: 'chain', text: 'Від риби до корабля',
    words: ['Форель', 'Риба', 'Океан', 'Корабель'], hintSeconds: 5 } satisfies Question;   // timeLimit 20, points 1000
  // score.ts
  /** Частка ціни за ланцюжок: 1 найшвидшому, лінійно до 0.5 на межі часу. */
  export function chainFactor(timeMs: number, fastestMs: number, limitMs: number): number;
  // game.ts
  export interface ChainProgress {
    /** Скільки прихованих слів уже вгадано. */
    solved: number;
    /** Скільки літер поточного слова відкрито; від 1 (перша літера). */
    shown: number;
    hints: number;
  }
  // Play: /** Лише в запитанні-ланцюжку; гравця тут немає, поки він не торкався ланцюжка. */ chain?: Record<string, ChainProgress>;
  // chain.ts
  export function letterCount(word: string): number;                       // кількість \p{L}
  /** Маска слова: перші `shown` літер і всі розділювачі видно, решта null. */
  export function maskWord(word: string, shown: number): ChainMask;
  /** Поступ гравця; без запису — { solved: 0, shown: 1, hints: 0 }. */
  export function chainOf(state: GameState, playerId: string): ChainProgress;
  export function hintMsOf(question: Question): number;                    // chain ? hintSeconds × 1000 : 0
  /** endsAt − штраф гравця; null без endsAt (пауза, поза question). */
  export function chainDeadline(state: GameState, playerId: string): number | null;
  export function guessWord(state: GameState, playerId: string, word: string, now: number): Result;
  export function takeHint(state: GameState, playerId: string, now: number): Result;
  /** Кожен підключений (і хоч один) пройшов або, якщо now не null, вичерпав свій час. */
  export function chainDone(state: GameState, now: number | null): boolean;
  /** На етапі question: бали тим, хто пройшов, і записи тим, хто грав, але не пройшов; інакше стан без змін. */
  export function scoreChain(state: GameState): GameState;
  ```
- Правила:
  - **Спільні перевірки `guessWord` / `takeHint`, по черзі:**
    1. `phase !== 'question'` дає `wrong_phase`;
    2. `paused` дає `paused`;
    3. немає гравця дає `not_found`;
    4. запитання не `chain` дає `type_mismatch`;
    5. є запис (пройшов) дає `already_answered`;
    6. `chainDeadline !== null && now > chainDeadline` дає `time_over`.
  - **`guessWord`:**
    - хибне слово повертає `fail('wrong_word')` і стану не змінює (`Result` не несе стану разом з помилкою). Гравець потрапляє в `Play.chain` лише після першого вгаданого слова або підказки. Хто лише помилявся, вважається таким, що не торкався ланцюжка;
    - збіг `normalizeText(word) === normalizeText(words[solved + 1])` дає `solved + 1`, `shown = 1`;
    - коли `solved === words.length − 1`, гравець отримує запис `AnswerRecord`: `answer: { type: 'chain', solved, hints, timeMs }`, `timeMs = max(0, now − startedAt) + hints × hintMs`, `accepted: true`, `accuracy: 1`, `grade: 'correct'`, `points: 0` (класика: тимчасово, до `scoreChain`) або `finalPoints(wager, true)` (фінал); потім `autoLock`.
  - **`takeHint`:**
    - `shown >= letterCount(поточне) − 1` дає `no_hint`;
    - `now − startedAt + (hints + 1) × hintMs >= limitMsOf(play)` дає `hint_late`;
    - інакше `shown + 1`, `hints + 1`.
  - **`scoreChain`** (лише `phase === 'question'` і запитання `chain`):
    - класика: `fastest = min(timeMs)` серед записів з `accepted`. Кожному такому записові `basePoints = points = round(question.points × rulesOf(round).multiplier × chainFactor(timeMs, fastest, L))`;
    - кожен гравець із `Play.chain` без запису отримує `{ answer: { type: 'chain', solved, hints, timeMs: L }, timeMs: L, accepted: false, accuracy: 0, grade: 'wrong', points: 0 }`, а у фіналі `points = finalPoints(wager, false)`;
    - повторний виклик дає той самий результат.
  - **Вбудовування в `game.ts`:**
    - `lockNow`: `scoreChain` іде першим, до `dropQueue`;
    - `end`: `scoreChain(state)` перед `dropQueue`;
    - `tick`: після перевірки утримання, для запитання `chain`: `chainDone(running, now) ? lockNow(running) : …` (далі як зараз, з `endsAt`);
    - `nextDeadline` (`blitz.ts`) додає `chainDeadline` кожного гравця з `Play.chain` без запису;
    - `submitAnswer`: одразу після перевірки гравця `if (answer.type === 'chain' || play.question.type === 'chain') return fail('type_mismatch')`;
    - `override`: якщо питання поточного запису `chain`, то `fail('wrong_phase')`, до гілок поля й фіналу;
    - `removePlayer` прибирає гравця з `play.chain`.
  - **`settleFinal`** не змінюється: мовчазним (без запису після `scoreChain`) він сам дає `answer: null` і `−ставка`.

- [ ] **Step 1: Write the failing tests**

```ts
// score.test.ts
it('chain factor is 1 for the fastest, linear to a half at the limit', () => {
  expect(chainFactor(5000, 5000, 20000)).toBe(1);
  expect(chainFactor(20000, 5000, 20000)).toBe(0.5);
  expect(chainFactor(12500, 5000, 20000)).toBeCloseTo(0.75);
  expect(chainFactor(20000, 20000, 20000)).toBe(1);
});
// game.chain.test.ts — state = startRound(lobbyWith(makeQuiz([chain], { speedBonus: true }), 'Олена', 'Тарас', 'Віра'), 0)
it('guesses go in order, case and spaces do not matter, a wrong word changes nothing', () => {
  expect(guessWord(state, 'p1', 'Океан', 1000)).toEqual({ ok: false, error: 'wrong_word' });
  const s = must(guessWord(state, 'p1', '  риба ', 1000));
  expect(chainOf(s, 'p1')).toEqual({ solved: 1, shown: 1, hints: 0 });
  expect(s.plays[0].chain?.p2).toBeUndefined();
});
it('a hint opens the next letter and adds the hint seconds, never the last letter', () => {
  // 'Риба': takeHint ×2 при 1000 → { solved: 0, shown: 3, hints: 2 }; третя → 'no_hint';
  // guessWord 'Риба' → { solved: 1, shown: 1, hints: 2 }; chainDeadline(s, 'p1') === 20000 − 10000
});
it('separators are shown and do not count as letters', () => {
  expect(maskWord('Нью-Йорк', 1)).toEqual(['Н', null, null, '-', null, null, null, null]);
  expect(maskWord("М'ята", 2)).toEqual(['М', "'", 'я', null, null]);
  expect(letterCount('Біла Церква')).toBe(10);
});
it('a hint that would use up the time is refused', () => {
  expect(takeHint(state, 'p1', 15_001)).toEqual({ ok: false, error: 'hint_late' });
  expect(takeHint(state, 'p1', 14_000).ok).toBe(true);
});
it('finishing records the time with penalty and the question closes when everyone is done', () => {
  // p1: Риба, Океан, Корабель при 5000 → recordOf p1: { answer: { type: 'chain', solved: 3, hints: 0, timeMs: 5000 }, accepted: true, timeMs: 5000 }
  // лобі з двох гравців (Олена, Тарас): після p1 phase 'question';
  // p2: hint при 1000, далі всі три слова до 8000 → timeMs 13000; phase 'locked' одразу після останнього слова
});
it('the fastest gets the full price, the others less down to half; non-finishers get nothing', () => {
  // p1 5000, p2 13000 (1 підказка), p3 вгадав лише 'Риба'; lock(s) → next → reveal
  // scores: [1000, 733, 0]; recordOf p3: { accepted: false, points: 0, answer: { type: 'chain', solved: 1, hints: 0, timeMs: 20000 } }
  // у цьому тесті лобі з чотирьох: четверта 'Галя' (p4) лише хибно вгадує 'Сом' → recordOf p4 undefined
  // makeQuiz([chain], { rules: { ...DEFAULT_RULES, multiplier: 2, penalty: 'minus' } }) → [2000, 1467, 0]
});
it('equal times share the full price', () => {
  // p1 і p2 проходять при 6000 без підказок → обидва 1000
});
it('a player out of personal time cannot guess and the question closes at the earliest deadline', () => {
  // p2 дві підказки при 1000 → chainDeadline 10000; p3 видалено; p1 пройшов при 2000
  // nextDeadline(s, 2000) === 10000; guessWord(s, 'p2', 'Риба', 10_001) → 'time_over'
  // tick(s, 10_000).phase === 'locked'; recordOf p2: { accepted: false, answer: { solved: 0, hints: 2 } }
});
it('pause does not count and +15 s moves every personal deadline', () => {
  // pause при 5000, resume при 65000, p1 вгадує всі три слова при 66000 → timeMs 6000
  // adjustTime(s, 15, t) → chainDeadline(p) зростає на 15000
});
it('the plain answer event cannot answer a chain', () => {
  expect(submitAnswer(state, 'p1', { type: 'text', value: 'Риба' }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
  expect(submitAnswer(state, 'p1', { type: 'chain', solved: 3, hints: 0, timeMs: 1 }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
});
it('the host cannot grade a chain by hand', () => {
  // на reveal override(s, 'p3', 'correct') → { ok: false, error: 'wrong_phase' }
});
it('guess and hint follow the phase, pause and player rules', () => {
  // до start → wrong_phase; на паузі → paused; 'zz' → not_found; makeQuiz([single]) → type_mismatch; після проходження → already_answered
});
// game.final.test.ts
it('a chain final: finishing in time wins the wager, playing without finishing loses it, check manual is ignored', () => {
  // s = toQuestion({ check: 'manual' }, chain) (ставки 500 / 400 / 0, відкрито при 10 000)
  // p1 проходить при 15 000; p2 вгадує 'Риба' при 12 000; p3 мовчить; tick(s, 30_000) → locked; next → reveal
  // finalRecord p1: { grade: 'correct', points: 500 }; p2: { grade: 'wrong', points: -400, answer: { type: 'chain', solved: 1 } }; p3: { answer: null, points: 0 }
});
```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.

- [ ] **Step 3: Implement** `chainFactor`, `chain.ts`, фікстуру й вбудовування в `game.ts` та `nextDeadline` за правилами вище. Експорт `chain.ts` з `index.ts`.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Очікується PASS, наявні тести рушія без змін.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): word chain — ordered guesses, private hints with time penalty, faster-gets-more scoring"
```

---

### Задача 3. Зрізи: маски без спойлерів, поступ, особистий годинник

**Files:**
- Modify: `packages/shared/src/views.ts`, `packages/engine/src/views.ts`
- Test: `packages/engine/src/views.test.ts`

**Interfaces:**
- Consumes: задача 2 (`maskWord`, `chainOf`, `chainDeadline`, `hintMsOf`, `letterCount`, `limitMsOf`).
- Produces (shared/views.ts):
  ```ts
  export interface PublicChain {
    first: string;
    /** Маски прихованих слів для всіх: перша літера й розділювачі. */
    masks: ChainMask[];
    hintSeconds: number;
  }
  // PublicQuestion: /** null для інших типів. */ chain: PublicChain | null;
  export interface ChainRow {
    playerId: string; nickname: string; solved: number; hints: number;
    /** Час проходження зі штрафом; null — не пройшов. */
    timeMs: number | null;
    /** Бали за запитання; лише на reveal, інакше null. */
    points: number | null;
  }
  export interface ChainInfo {
    /** Скільки прихованих слів. */
    total: number;
    /** Пройшли за часом, далі за solved спаданням, далі в порядку гравців. */
    rows: ChainRow[];
  }
  // BaseView: /** Поступ ланцюжка; null поза запитанням-ланцюжком, а для сцени й гравців і у фіналі. */ chain: ChainInfo | null;
  // HostView: chain: ChainInfo | null   (у фіналі теж)
  export interface PlayerChain {
    solved: number;
    /** Особисті маски: вгадані слова повністю, поточне з підказками, решта — перша літера. */
    masks: ChainMask[];
    hints: number;
    hintMs: number;
    /** question, не пауза, не пройшов, у поточному слові ще можна відкрити літеру (час клієнт перевіряє сам). */
    canHint: boolean;
    /** Особистий кінець часу: endsAt − штраф; null на паузі й поза question. */
    deadline: number | null;
    /** На паузі: max(0, remainingMs − штраф); інакше null. */
    remainingMs: number | null;
    /** Межа часу запитання з «±15 с». */
    limitMs: number;
    /** Час проходження зі штрафом; null — ще не пройшов. */
    timeMs: number | null;
  }
  // PlayerView.me: /** null поза запитанням-ланцюжком. */ chain: PlayerChain | null;
  ```
- Правила:
  - **`publicQuestion`:** `chain: { first: words[0], masks: words.slice(1).map((w) => maskWord(w, 1)), hintSeconds }` для `chain`, інакше `null`. `choices: []`, `right: []`.
  - **`ChainInfo`:**
    - є в етапах `question`, `locked` і `reveal` (через `inQuestion`), якщо поточне запитання `chain`;
    - `rows` бере кожного гравця: `solved` з `chainOf`; `timeMs` з запису, якщо `accepted`; `points` з запису лише на `reveal`;
    - `base()` дає `null` для раунду `final`, а `hostView` будує `ChainInfo` завжди.
  - **`PlayerChain`:** `masks[i]` для `i < solved` — `[...word]` (повне слово), для `i === solved` — `maskWord(word, shown)`, решта — `maskWord(word, 1)`. Після проходження всі повні.

- [ ] **Step 1: Write the failing tests** (`views.test.ts`, фікстура `chain`):

```ts
it('shows the first word and only first letters of the chain to everyone', () => {
  // stageView(s).question.chain == { first: 'Форель', masks: [['Р',null,null,null], ['О',null,null,null,null], ['К',null,...]], hintSeconds: 5 }
  // playerView(s,'p1').me.chain: { solved: 0, hints: 0, hintMs: 5000, canHint: true, deadline: 20000, remainingMs: null, limitMs: 20000, timeMs: null }
});
it("never sends hidden words or another player's hint letters", () => {
  // p2 takeHint ×2 на 'Риба', p1 вгадав 'Риба' і бере підказку на 'Океан'
  // playerView p2 .me.chain.masks[0] == ['Р','и','б',null]; playerView p1 .me.chain.masks[0] == ['Р','и','б','а'], masks[1] == ['О','к',null,null,null]
  // playerView p2: masks[1] == ['О',null,null,null,null] (літера «к», відкрита p1, до p2 не потрапляє);
  //   JSON.stringify(playerView(s,'p2')).toLowerCase() не містить 'океан' і 'корабель'
  // JSON.stringify(stageView(s)).toLowerCase() і так само playerView p3 не містять 'риба', 'океан', 'корабель'
  // на reveal stageView(s).reveal.words == chain.words
});
it('shows chain progress to the stage and the host without letters, ranked by time', () => {
  // p1 пройшов 5000, p2 solved 1 з 1 підказкою → stageView.chain == { total: 3, rows: [
  //   { playerId:'p1', nickname:'Олена', solved:3, hints:0, timeMs:5000, points:null },
  //   { playerId:'p2', nickname:'Тарас', solved:1, hints:1, timeMs:null, points:null }, { …'p3', solved:0, … } ] }
  // після lock + next (reveal): rows[0].points === 1000
});
it('the final keeps chain progress for the host only', () => {
  // фінал з chain: stageView.chain === null, playerView.chain === null, hostView.chain.rows.length === 3; me.chain у гравця є
});
it('freezes the personal clock on pause with the penalty taken off', () => {
  // p1 підказка при 1000, pause при 3000 → me.chain.deadline === null, remainingMs === 17000 − 5000
});
it('a finished player sees the whole chain and the time; other types have no chain', () => {
  // після проходження: masks усі повні, timeMs 5000, canHint false; makeQuiz([single]) → question.chain null, me.chain null, stage chain null
});
```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/views.test.ts`. Очікується FAIL.

- [ ] **Step 3: Implement** типи й побудову за правилами вище. `base()` отримує `chain`. `stageView` і `playerView` беруть його з `base`, `hostView` перекриває повним.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages
git commit -m "feat(engine): chain views — public first letters, private hint letters, progress without letters"
```

---

### Задача 4. Сервер: події, запис і історія

**Files:**
- Modify: `apps/server/src/socket.ts`, `apps/server/src/rooms/manager.ts`
- Test: `apps/server/src/socket.test.ts`, `apps/server/src/rooms/manager.test.ts`, `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts`

**Interfaces:**
- Consumes: `guessSchema` (задача 1), `guessWord`, `takeHint` (задача 2).
- Produces (`RoomManager`):
  ```ts
  guess(room: Room, playerId: string, word: string): AckResult;   // apply(guessWord(state, playerId, word, now))
  hint(room: Room, playerId: string): AckResult;                  // apply(takeHint(state, playerId, now))
  ```
- Сокет:
  - `on('player:guess')`: лише `player` з `playerId`, інакше `FORBIDDEN`; `guessSchema.safeParse(payloadOf(args))`, інакше `INVALID`;
  - `on('player:hint')`: лише гравець, як `player:buzz`.
- Запис: `recorder.ts` не змінюється. `ChainAnswer` іде в `payload` як є, `accepted` — пройшов.

- [ ] **Step 1: Write the failing tests**

```ts
// socket.test.ts (за зразком 'player:wager is player-only and validated')
it('player:guess and player:hint are player-only and validated', async () => {
  // host і stage: player:guess { word: 'Риба' } і player:hint → forbidden
  // olena: player:guess без даних, { word: 5 }, { word: 'а'.repeat(31) } → invalid_payload
  // у лобі: player:guess { word: 'Риба' } → wrong_phase; player:hint → wrong_phase
});
it('plays a chain over sockets: a wrong word, a hint, a finish', async () => {
  // кімната з makeQuiz([chain]); start + next; olena: guess 'Сом' → { ok: false, error: 'wrong_word' };
  // hint → ok, стан олени: me.chain.masks[0] == ['Р','и',null,null]; стан тараса: masks[0] == ['Р',null,null,null]
  // олена перепідключається з тим самим токеном → у новому стані masks[0] знову ['Р','и',null,null]
  // olena guess Риба/Океан/Корабель → ok; стан сцени: chain.rows[0].timeMs не null
});
// manager.test.ts (наявний фейковий scheduler)
it('closes a chain question at the personal deadline of the last player still playing', () => {
  // Олена проходить; Тарас бере дві підказки при t=1000 → після advance до 10 000 стан 'locked', до 20 000 не чекаємо
});
// recorder.test.ts
it('saves a chain summary as the answer, finished as accepted', async () => {
  // makeQuiz([chain]); Олена проходить, Тарас лише 'Риба'; lock; recorder.idle()
  // рядки answer: Олена { payload: { type: 'chain', solved: 3, hints: 0, timeMs }, accepted: true, points: 1000 }, Тарас { payload.solved 1, accepted: false, points: 0 }
});
// history.test.ts, describe('host history: answers')
it('history lists chain summaries and counts a finished chain as correct', async () => {
  // detail.questions[0].question.type 'chain', responses: Олена accepted true з answer.type 'chain'; standings: Олена correct 1, Тарас 0
});
```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server`. Очікується FAIL.

- [ ] **Step 3: Implement** `guess`, `hint` у менеджері й обробники в `socket.ts`.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src
git commit -m "feat(server): player:guess and player:hint; chain summaries in the game record"
```

---

### Задача 5. Редактор, формат відповіді й демо-вікторини

**Files:**
- Modify: `apps/web/src/editor/draft.ts`, `apps/web/src/editor/QuestionEditor.tsx`, `apps/web/src/editor/QuizEditor.tsx`, `apps/web/src/editor/BoardEditor.tsx`, `apps/web/src/format.ts`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Modify: `apps/web/src/demo-quiz.ts`, `apps/server/scripts/demo-quiz.ts`
- Modify (механічно): фабрики зрізів у `apps/web/src/screens/*.test.tsx` (`question.chain: null`, `view.chain: null`, `me.chain: null`)
- Test: `apps/web/src/editor/draft.test.ts`, `apps/web/src/editor/QuizEditor.test.tsx`, `apps/web/src/format.test.ts`, `apps/web/src/demo-quiz.test.ts`, `apps/server/scripts/demo-quiz.test.ts`

**Interfaces:**
- Consumes: задачі 1–3.
- Produces (`draft.ts`):
  ```ts
  export const QUESTION_TYPES = ['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'chain'] as const;
  /** Типи запитань, доступні в раунді: без ланцюжка в бліці й полі. */
  export function questionTypesFor(roundType: Round['type']): readonly QuestionType[];
  ```
  - `build('chain')`: `{ ...common, video: null, type, words: ['', '', ''], hintSeconds: LIMITS.defaultHintSeconds }`;
  - `duplicateQuestion` копіює `words`;
  - `cleaned`: кожне слово `trim()` і стиснення пробілів (`/\s+/g → ' '`), порожні слова в кінці прибираються, але лишається не менше `minChainWords`;
  - `problemKey`: порожнє слово дає `'problemEmptyWord'`, слово не за `CHAIN_WORD` або довше 30 дає `'problemChainWord'`, `hintSeconds` поза 1–30 дає `'problemHintSeconds'`.
- **`QuestionEditor`:** новий обов'язковий проп `types: readonly QuestionType[]`, кнопки типів будуються з нього.
  - `QuizEditor` передає `questionTypesFor(round.type)`, `BoardEditor` передає `questionTypesFor('board')`.
  - Для `chain` поле відео не показується.
  - Гілка `Body` `chain`: `Rows` з `rows = words.map((text, index) => ({ id: String(index), text }))`, `min 3`, `max 10`, `maxLength 30`, `label 'chainWordN'`, `removeLabel 'removeChainWord'`, `addLabel 'addChainWord'`, `lead` — номер. Під рядками `NumberField` «Підказка додає, с» (`hintSeconds`) і `meta` з `chainHint`.
- Produces (`format.ts`):
  ```ts
  /** Мілісекунди як секунди з однією цифрою після коми: 23400 → «23,4». */
  export function secondsText(ms: number): string;
  ```
  - `correctText(chain)` — `words.join(' → ')`;
  - `answerText(chain, question)`:
    - пройшов (`question` — ланцюжок і `solved === words.length − 1`): `chainAnswerDone` («Пройдено за {time} с, підказок: {hints}»);
    - не пройшов: `chainAnswerPart` («Слів: {solved} з {total}»);
    - без запитання: `chainAnswerBare` («Слів: {solved}»).
- i18n (точно):
  ```ts
  type_chain: 'Ланцюжок слів', typeShort_chain: 'ланцюжок',
  chainWordN: 'Слово {index}', addChainWord: 'Додати слово', removeChainWord: 'Прибрати слово {index}',
  hintSecondsLabel: 'Підказка додає, с',
  chainHint: 'Перше слово побачать усі, інші — лише першу літеру й кількість літер. Гравці вгадують слова по черзі; виграє найшвидший.',
  problemEmptyWord: 'Запитання {index}: заповніть усі слова ланцюжка.',
  problemChainWord: 'Запитання {index}: слово ланцюжка — лише літери (між ними можна пробіл, дефіс чи апостроф), від 2 до 30 символів.',
  problemHintSeconds: 'Запитання {index}: підказка додає від 1 до 30 секунд.',
  chainAnswerDone: 'Пройдено за {time} с, підказок: {hints}', chainAnswerPart: 'Слів: {solved} з {total}', chainAnswerBare: 'Слів: {solved}',
  ```
- **Демо:**
  - `apps/server/scripts/demo-quiz.ts`: помічник `chain(text: string, words: string[], hintSeconds = 5, points?: number, time?: number): Question`. У раунді «Розминка» після `match` додати `chain('Ланцюжок: від форелі до літака', ['Форель', 'Риба', 'Океан', 'Корабель', 'Порт', 'Подорож', 'Літак'], 5, 1500, 90)`. В опис вікторини додати «ланцюжок слів».
  - `apps/web/src/demo-quiz.ts`: `q8` `{ type: 'chain', text: 'Ланцюжок: від форелі до корабля.', words: ['Форель', 'Риба', 'Океан', 'Корабель'], hintSeconds: 5, timeLimit: 60 }`, опис «Вісім запитань, по одному кожного типу.».

- [ ] **Step 1: Write the failing tests**

```ts
// draft.test.ts
it('a new chain question has three empty words, a 5 s hint and no video', () => {});
it('cleaned trims chain words and drops trailing empty ones but keeps three', () => {
  // ['Форель', ' Риба ', 'Біла   Церква', '', ''] → ['Форель', 'Риба', 'Біла Церква']; ['Форель', '', ''] → ['Форель', '', '']
});
it('chain problems: an empty word, a word with digits, a hint out of range', () => {
  // problemsOf: words[1] '' → t('problemEmptyWord', { index: 1 }); 'R2D2' → problemChainWord; hintSeconds 0 → problemHintSeconds
});
it('blitz and board rounds offer no chain type', () => {
  expect(questionTypesFor('classic')).toContain('chain');
  expect(questionTypesFor('final')).toContain('chain');
  expect(questionTypesFor('blitz')).not.toContain('chain');
  expect(questionTypesFor('board')).not.toContain('chain');
});
it('switching a question with a video to a chain drops the video', () => {});
// QuizEditor.test.tsx
it('creates a chain question and saves its words and hint seconds', async () => {
  // «ланцюжок» → текст; «Слово 1..3» = Форель, Риба, Океан → «Додати слово» → «Слово 4» = Корабель;
  // «Підказка додає, с» = 7 → зберегти → saved: { type: 'chain', words: [...4], hintSeconds: 7, video: null }
  // поля «Відео з YouTube» немає
});
it('a blitz round shows no chain chip', async () => {});
// format.test.ts
it('writes the chain and chain answers in words', () => {
  expect(correctText(chainQ)).toBe('Форель → Риба → Океан → Корабель');
  expect(answerText({ type: 'chain', solved: 3, hints: 1, timeMs: 23_400 }, chainQ)).toBe('Пройдено за 23,4 с, підказок: 1');
  expect(answerText({ type: 'chain', solved: 1, hints: 0, timeMs: 20_000 }, chainQ)).toBe('Слів: 1 з 3');
  expect(answerText({ type: 'chain', solved: 1, hints: 0, timeMs: 20_000 }, null)).toBe('Слів: 1');
  expect(secondsText(5000)).toBe('5,0');
});
// demo-quiz.test.ts: список типів містить 'chain' (оновити очікуваний масив)
// apps/server/scripts/demo-quiz.test.ts
it('has the owner chain in the warm-up round', () => {
  // questionsOf(demoQuiz) містить chain з words[0] 'Форель' і words.at(-1) 'Літак'; quizSchema.safeParse — success
});
```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/editor apps/web/src/format.test.ts apps/web/src/demo-quiz.test.ts apps/server/scripts`. Очікується FAIL.

- [ ] **Step 3: Implement** `draft.ts`, проп `types` і гілку `chain` у `QuestionEditor`, передачу `types` з `QuizEditor` і `BoardEditor`, `format.ts`, тексти, обидві демо-вікторини й механічні `chain: null` у фабриках тестів екранів.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS. Наявний `EditQuiz.test.tsx` (`rounds: demoQuiz.rounds` після збереження) зелений: `cleaned` не змінює чисте запитання `chain`.

- [ ] **Step 5: Commit**

```bash
git add apps/web apps/server/scripts
git commit -m "feat(editor): chain questions with 3–10 words and hint seconds; chains in both demo quizzes"
```

---

### Задача 6. Гра: телефон, сцена, пульт

**Files:**
- Create: `apps/web/src/screens/ChainView.tsx`, `apps/web/src/screens/ChainView.test.tsx`
- Modify: `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/HostScreen.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/PlayerScreen.test.tsx`, `apps/web/src/screens/StageScreen.test.tsx`, `apps/web/src/screens/HostScreen.test.tsx`

**Interfaces:**
- Consumes: `PublicChain`, `PlayerChain`, `ChainInfo`, `ChainMask` (задача 3); `secondsText` (задача 5); `secondsLeft` (`clock.ts`); `Timer`.
- Produces (`ChainView.tsx`):
  ```ts
  /** Слова плитками: перше й маски; current — індекс маски поточного слова; tone — '' | 'is-correct'. */
  export function ChainWords(props: { first: string; masks: ChainMask[]; current?: number; tone?: string }): JSX.Element;
  /** Повна маска слова для розкриття. */
  export function fullMask(word: string): ChainMask;
  /** Ланцюжок гравця: плитки, поле слова, «Перевірити», «Підказка», власний час. */
  export function ChainPlay(props: { chain: PlayerChain; question: PublicQuestion; paused: boolean; offsetMs: number; send: Send }): JSX.Element;
  /** Поступ або рейтинг (на reveal) гравців без літер. */
  export function ChainBoard(props: { chain: ChainInfo; reveal: boolean }): JSX.Element;
  ```
- Розмітка й правила:
  - **`ChainWords`:**
    - `ol.chain-words`, у ньому `li.chain-word` (`.is-current` для поточного, `.is-first` для першого);
    - літера — `span.chain-cell`, `null` — `span.chain-cell.is-blank` з `aria-hidden`;
    - розділювач (символ, що не відповідає `/\p{L}/u`) — `span.chain-sep`;
    - `aria-label` слова — текст маски з `_` замість `null` (так тести знаходять «Р___»).
  - **`ChainPlay`:**
    - угорі сам `Timer view={{ endsAt: chain.deadline, remainingMs: chain.remainingMs }}`, тож `PlayerScreen` для ланцюжка не показує спільного таймера;
    - `ChainWords(question.chain.first, chain.masks, current = chain.solved)`;
    - поки не пройшов: форма з полем `aria-label={t('chainGuessLabel')}` (`maxLength 30`, `autoComplete="off"`, `autoCapitalize="none"`, `enterKeyHint="go"`), кнопкою `submit` «Перевірити» й кнопкою «Підказка (+{seconds} с)»;
    - надсилання: `send('player:guess', { word })`. `ok` очищає поле й підказку про помилку, `wrong_word` показує `p.chain-miss[role=status]` «Не те слово. Спробуйте ще.», інша помилка показує `p.error[role=alert]` з `errorText`;
    - «Підказка» неактивна, якщо `!chain.canHint`, на паузі або коли особистий залишок (`secondsLeft`) ≤ `hintMs / 1000`. Вона надсилає `send('player:hint')`;
    - рядок `p.chain-clock` «Ваш час: {time} с»: `secondsText(limitMs − залишок у мс)`, оновлюється раз на 200 мс, як `Timer`;
    - після проходження форма зникає, а `h2` каже «Ланцюжок пройдено за {time} с» (`secondsText(chain.timeMs)`).
  - **`ChainBoard`:**
    - `ol.rows.chain-board`, рядок `li`: `.name`, далі `.tag` «3 з 6» (`chainRowWords`) або «{time} с» (`chainRowTime`), `.tag` «підказок: N» лише якщо `hints > 0`;
    - на `reveal` перед іменем стоїть `.rank` (1…), а `points !== null` дає `.score` зі `signed`. Ті, хто не пройшов, отримують клас `is-out`.
  - **`PlayerScreen`:**
    - на `question`, якщо `question.type === 'chain' && me.chain !== null`, показується `ChainPlay` замість `Timer` у `question-head` і замість гілок відповіді (перед гілкою `me.answer !== null`, бо проходження створює запис);
    - на `reveal` `Result` під заголовком показує `chainDone` з `me.chain.timeMs` або `chainOutOfTime` («Не встигли пройти ланцюжок»), якщо `me.chain` є.
  - **`StageScreen` (`Question`):**
    - під час запитання `ChainWords(question.chain.first, question.chain.masks)`, підказка `chainOnPhone` і `ChainBoard(view.chain, false)`, якщо `view.chain !== null`. Лічильник у шапці — `chainFinishedOf` («Пройшли {finished} з {total}», `finished = answeredCount`);
    - на розкритті `ChainWords(reveal.words[0], reveal.words.slice(1).map(fullMask), tone 'is-correct')` і `ChainBoard(view.chain, true)`;
    - рядка «Правильна відповідь» для `chain` немає. У фіналі на `reveal` лише `FinalReveal`, як зараз.
  - **`HostScreen`:** якщо `view.chain !== null`, над панеллю «Відповіді» стоїть панель `h2` «Ланцюжок» з `ChainBoard(view.chain, phase === 'reveal')`. Відповіді пульт показує через `answerText`, як зараз.
  - **i18n:**
    ```ts
    chainGuessLabel: 'Наступне слово', chainCheck: 'Перевірити', chainHintButton: 'Підказка (+{seconds} с)',
    chainMiss: 'Не те слово. Спробуйте ще.', chainDone: 'Ланцюжок пройдено за {time} с', chainOutOfTime: 'Не встигли пройти ланцюжок',
    chainMyTime: 'Ваш час: {time} с', chainOnPhone: 'Вгадуйте слова ланцюжка на телефоні', chainFinishedOf: 'Пройшли {finished} з {total}',
    chainTitle: 'Ланцюжок', chainRowWords: '{solved} з {total}', chainRowTime: '{time} с', chainHints: 'підказок: {count}',
    err_wrong_word: 'Не те слово. Спробуйте ще.', err_no_hint: 'Більше підказок для цього слова немає.', err_hint_late: 'На підказку вже не вистачає часу.',
    ```
  - **Стилі** (`styles.css`, лише токени):
    - `.chain-words` — `display: grid; gap: 0.5rem`;
    - `.chain-word` — `display: flex; flex-wrap: wrap; gap: 0.2rem`;
    - `.chain-cell` — `min-width: 1.4em`, `text-align: center`, `border-bottom: 2px solid var(--line)`, `font-family: var(--display)`;
    - `.chain-cell.is-blank` — висота як у літери;
    - `.chain-word.is-current .chain-cell` — `border-color: var(--amber)`;
    - `.chain-words.is-correct .chain-cell` — `color: var(--correct)`;
    - `.chain-miss` — `color: var(--signal)`;
    - `.chain-board .is-out` — `color: var(--dim)`;
    - кнопки мінімум 44 px заввишки; на сцені клітинки більші (`.stage .chain-cell { font-size: … }`).

- [ ] **Step 1: Write the failing tests**

```ts
// ChainView.test.tsx
it('shows the first word and masked words with blanks and separators', () => {
  // ChainWords first 'Форель', masks [['Р',null,null,null], ['Н',null,null,'-',null,null,null,null]] →
  // getByLabelText('Р___'), getByLabelText('Н__-____'); .chain-sep з '-'
});
it('sends a guess, clears the field on success and shows a miss inline', async () => {
  // send mock: перший виклик { ok: false, error: 'wrong_word' } → «Не те слово. Спробуйте ще.», поле зберігає 'Сом', role=alert немає;
  // другий { ok: true } → поле '' ; send викликано з ('player:guess', { word: 'Риба' })
});
it('the hint button sends player:hint and is off when no hint is left or time is short', () => {
  // canHint false → disabled; deadline = now + 3000, hintMs 5000 → disabled; інакше click → send('player:hint')
});
it('shows the own time counting up with the penalty', () => {
  // limitMs 20000, deadline = serverNow + 15000 (штраф уже в deadline) → «Ваш час: 5,0 с»
});
it('a finished chain shows the time and no form', () => {});
it('ranks players by time at the reveal with points', () => {
  // ChainBoard reveal: rows → .rank 1 'Олена' '5,0 с' '+1000'; 'Тарас' '1 з 3' з класом is-out
});
// PlayerScreen.test.tsx
it('a chain question shows the own chain and the personal timer instead of the shared one', () => {
  // view.endsAt = now + 20000, me.chain.deadline = now + 15000 → role=timer aria-label '15'
});
it('the reveal of a chain says the own time', () => {});
// StageScreen.test.tsx
it('shows the chain with first letters and the progress during the question, the whole chain and the ranking at the reveal', () => {
  // question: getByLabelText('Р___'), «Вгадуйте слова ланцюжка на телефоні», «Пройшли 1 з 2», текст не містить 'Риба';
  // reveal: getByLabelText('Риба') у .chain-words.is-correct, .chain-board .rank, «Правильна відповідь:» немає
});
// HostScreen.test.tsx
it('the host sees chain progress for every player', () => {});
```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens`. Очікується FAIL.

- [ ] **Step 3: Implement** `ChainView.tsx`, гілки в екранах, тексти й стилі за правилами вище.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): play the word chain on the phone; chain and ranking on stage, progress for the host"
```

---

### Задача 7. Наскрізний сценарій

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе попереднє; помічники файлу `open`, `click`, `field`, `questionText`, `join`, `shot`, `expectNoSideScroll`, `bodyText`, `snapshot`.
- Новий помічник у файлі:
  ```ts
  /** Вводить слово ланцюжка й тисне «Перевірити». */
  async function guess(page: Page, word: string): Promise<void>;
  // field(page, 'Наступне слово').fill(word); click(page, 'Перевірити')
  ```
- `const LONG_WORD = 'Найнайнайвисокогірнішоокеанний'` (30 літер) — третє приховане слово, перевіряє перенесення на 360 px.

- [ ] **Step 1: Новий сценарій** `it('a word chain: first letters for all, a private hint with time penalty, the fastest wins', …)` з `try/catch` і `snapshot()`, як у сусідніх.

  **Редактор (ведучий 1280×900, новий акаунт `host10@example.com`):**
  1. «Нова вікторина», назва «Ланцюжок».
  2. Кнопка «ланцюжок», текст «Від форелі до корабля». «Слово 1..3» = Форель, Риба, Океан. «Додати слово» → «Слово 4» = `LONG_WORD`, «Додати слово» → «Слово 5» = Корабель.
  3. «Підказка додає, с» = 5, «Час, с» = 60. Поля «Відео з YouTube» немає. Кадр `chain-editor`. «Зберегти» → «Грати».

  **Гра:** сцена 1600×900, Оля 390×844, Тарас 360×740. «Почати гру», «Почати раунд».
  1. Сцена показує «Форель» і плитки `getByLabel('Р___')`. `bodyText(stage)` у нижньому регістрі не містить «риба», «океан», «корабель». Те саме для телефона Олі. Кадр `chain-stage-question`.
  2. Тарас: `guess('Сом')` → «Не те слово. Спробуйте ще.». «Підказка (+5 с)» → у Тараса `getByLabel('Ри__')`, в Олі досі `getByLabel('Р___')`. Рядок «Ваш час:» у Тараса показує щонайменше 5 с.
  3. `expectNoSideScroll(taras, 'chain-phone-360')`.
  4. Оля: `guess('риба')`, `guess('Океан')`, `guess(LONG_WORD.toLowerCase())`, `guess('Корабель')` → «Ланцюжок пройдено за». Сцена: «Пройшли 1 з 2», рядок Олі в `.chain-board` має час. Кадр `chain-host` (пульт з панеллю «Ланцюжок»).
  5. Тарас: `guess('Риба')`, `guess('Океан')`, `guess(LONG_WORD)`, `guess('Корабель')`. Запитання закривається саме: у ведучого з'являється «Показати відповідь».
  6. «Показати відповідь». Сцена: `.chain-words.is-correct` містить `getByLabel('Риба')`, перший `.chain-board li` містить «Оля» і «+1000». У Тараса «Правильно!» і бали від 500 до 999 (рядок `.earned`). Кадри `chain-stage-reveal`, `chain-phone-reveal` (Тарас).
  7. «Далі» до подіуму: Оля перша.

  **Історія:** ведучий відкриває гру в історії. Під «Від форелі до корабля» клік «Відповіді (2)» → рядок Олі містить «Пройдено за». Кадр `history-chain`. `expect(problems).toEqual([])`.

- [ ] **Step 2: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв. Потім з `E2E_SHOTS=1` переглянути кадри в `apps/server/e2e/artifacts/shots`:
  - на 360 px довге слово переноситься, плитки й кнопки на екрані;
  - на сцені ланцюжок і рейтинг читаються з відстані;
  - поточне слово виділено бурштиновим.

- [ ] **Step 3: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts
git commit -m "test: a word chain end-to-end — no spoilers, a private hint, the fastest wins"
```

Після фінальної рецензії гілку злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`. Render розгорне сам; міграцій у цьому плані немає.
