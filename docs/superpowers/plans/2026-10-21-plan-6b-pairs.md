# План 6b: тип запитання «Пари»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** новий тип запитання «Пари» (`'match'`) працює в класиці, бліці й полі (телефон і усно).
- Автор задає 3–6 пар «ліворуч — праворуч».
- Гравець бачить лівий стовпчик у порядку автора, а правий перемішаним. Він з'єднує пари дотиками й надсилає відповідь, коли з'єднано всі.
- Автоматична перевірка зараховує відповідь лише тоді, коли правильні всі пари.
- На розкритті сцена показує правильні пари, у «Мільйонері» помаранчевим світяться з'єднання гравця.
- Історія гри показує відповідь гравця списком пар.

**Архітектура:**
- **Дані.** Запитання `{ type: 'match', pairs: { left: Choice; right: Choice }[] }`: пари зберігаються правильними. Усі 2N id в запитанні різні.
  - У редакторі id випадкові (`newId`), тож id правого елемента нічого не каже про його пару.
  - Відповідь: `{ type: 'match', links: { left: string; right: string }[] }`. Порядок `links` не важить.
- **Показ.** `GameState.presented` для `match` містить id правих елементів у перемішаному порядку. Як і в `order`, порядок ніколи не збігається з авторським: інакше рядок i ліворуч навпроти рядка i праворуч видав би відповідь.
  - `PublicQuestion` отримує обов'язкове поле `right: Choice[]`: праві елементи в порядку показу, `[]` для інших типів.
  - `choices` для `match` — ліві елементи в порядку автора.
- **Перевірка.** `checkAnswer` повертає `{ accepted: true, accuracy: 1 }` або `{ accepted: false, accuracy: 0 }`. «Частково» дає наявний `override` (`grade: 'partial'`), якщо в раунді ввімкнено `partial`. Нового коду рушія для цього не потрібно.
- **Веб.** Новий файл `apps/web/src/screens/MatchView.tsx` з трьома компонентами:
  - `MatchInput`: телефон, з'єднання дотиками;
  - `MatchColumns`: два стовпчики лише для показу;
  - `PairList`: список пар «ліворуч — праворуч» з кольором.

  Їх використовують `AnswerInput`, `SpotlightChoices`, `StageScreen` і `GameHistory`.
- **Історія.** Зараз історія взагалі не показує відповідей гравців. `GameQuestionResult` отримує знімок запитання й відповіді гравців. Веб показує їх у згорнутому блоці під кожним запитанням (для всіх типів), а відповідь на «Пари» — списком пар.
- **База.** `answer.payload` уже `jsonb` з будь-якою `Answer`, тож міграція не потрібна. Старі записи не змінюються.

**Технології:** TypeScript, zod, vitest, Fastify + Socket.IO + Drizzle (PGlite у тестах), React + Vite, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-21-after-first-game-design.md`, лише частина C (розділ 5), а також розділи 2 (анти-цілі) і 11 (тестування) у тій мірі, в якій вони стосуються пар. Зразок стилю: `docs/superpowers/plans/2026-10-21-plan-6a-timing-millionaire.md`.

**Рішення плану там, де специфікація мовчить:**
- **Правий стовпчик перемішується завжди**, незалежно від `shuffleOptions` раунду. Лівий завжди йде в порядку автора, навіть із `shuffleOptions: true`.
- **Дотики на телефоні:**
  - дотик до вільного лівого елемента вибирає його; повторний дотик знімає вибір; дотик до іншого вільного лівого переносить вибір на нього;
  - дотик до вільного правого, коли вибрано лівий, з'єднує їх;
  - дотик до правого без вибраного лівого нічого не робить;
  - дотик до з'єднаного елемента (лівого чи правого) знімає зв'язок;
  - номер пари (1…N за лівим стовпчиком) стоїть бейджем на обох з'єднаних елементах;
  - «Відповісти» неактивна, поки не з'єднано всі ліві.
- **Усна клітинка.** Сцена показує обидва стовпчики (як варіанти single в усній клітинці). Телефон гравця, чий хід, показує лише «Відповідайте вголос», як для інших типів.
- **Статистика розкриття** (`RevealStats.counts`) для `match` порожня.
- **Розкриття на сцені.** Замість рядка «Правильна відповідь: …» сцена показує заголовок «Правильні пари» і `PairList` зеленим. Телефон і пульт показують текст `correctText` у вигляді «Київ — Дніпро; Львів — Полтва; …».
- **Історія.** Під кожним запитанням є `<details>` «Відповіді (N)» з рядками «нікнейм: відповідь» для всіх типів. Без цього пари нема де показати. Спроби бліцу йдуть окремими рядками, а пропущена спроба (`payload: null`) показується як «—».
- **Редактор:**
  - рядок пари — два поля («Ліворуч N», «Праворуч N») і кнопка «Прибрати пару N»; під рядками кнопка «Додати пару»;
  - Enter нових рядків не додає;
  - `cleaned` прибирає повністю порожні пари в кінці, але так, щоб лишилося не менше 3.
- **Демо-вікторини.** В обох демо id правих елементів не повторюють номер своєї пари: там не можна `l1`↔`r1`.

## Глобальні обмеження

- Старі вікторини, ігри й історія поводяться як зараз. Нових міграцій немає.
- Значення (зі специфікації): від 3 до 6 пар (`LIMITS.minPairs: 3`, `LIMITS.maxPairs: 6`), тексти до 120 символів (`LIMITS.optionText`).
- Рушій чистий: `now` і `rng` передаються аргументами.
- **Захист від спойлерів.** До розкриття зрізи сцени й гравців не містять `pairs`. У них лише `choices` (ліві) і `right` (перемішані праві). Помаранчевий `spotlight` несе лише `links` гравця й `grade: null`.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`. Нові CSS-класи мають префікс `match-`: `.order` і `.pair` у `styles.css` уже зайняті. Кольори беруться з наявних `--correct`, `--signal`, `--pending`.
- Макет працює на ширині 360 px без горизонтальної прокрутки, навіть із текстами по 120 символів.
- Проста класична вікторина не ускладнюється: новий тип — лише ще одна кнопка серед типів.
- Кожна задача починається з тесту, що падає. Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (проєкт тестовий).

## Порядок збирання

- Задача 1 додає `'match'` у `Question` і `Answer`, а задача 2 додає обов'язкове `PublicQuestion.right`. Через вичерпні `switch` у `apps/web` (`format.ts`, `draft.ts`) `tsc -p apps/web` у задачах 1–2 не проходить.
- Для задач 1–2 перевірка: `pnpm test` і `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Від задачі 3 — повний `pnpm typecheck`.
- Задача 3 механічно додає `right: []` у фабрики `PublicQuestion` у тестах `apps/web/src/screens/*.test.tsx`.

## На що дивитися рецензентові

1. **Однакові тексти.** Два праві елементи з однаковим текстом (наприклад, «1991» двічі) або той самий текст ліворуч і праворуч. З'єднання йде за id, а не за текстом, і правильну відповідь зараховано. Тест: задача 4, `match: links by id when two right items have the same text`.
2. **Підроблена відповідь із сокета:** дублікати лівих або правих, чужий id, неповний набір, 7 зв'язків. Відповідь відхиляється без збою: схема відмовляє в >6, а рушій дає точність 0. Тести: задача 1, `answerSchema accepts match links and refuses more than six`; задача 2, `match: duplicate, unknown or missing links are wrong`.
3. **Правий стовпчик випадково в авторському порядку.** Рушій зсуває його, тож гравець ніколи не отримує готової відповіді. Тест: задача 2, `never shows the right column in the author order`.
4. **Телефон 360 px із довгими текстами** (120 символів у кожному елементі, 6 пар). Немає горизонтальної прокрутки, кнопки не вилазять за екран. Тест: задача 6, `scrollWidth <= 360` на телефоні Тараса.
5. **Історія старої гри й пропущена спроба бліцу** (`payload: null`). Блок відповідей показує «—», сторінка не падає. Тест: задача 5, `shows each player's answer, a match answer as pairs and a missed attempt as a dash`.

---

### Задача 1: схема — запитання й відповідь «Пари»

**Files:**
- Modify: `packages/shared/src/quiz.ts` (`LIMITS`, `questionSchema`)
- Modify: `packages/shared/src/answer.ts`
- Test: `packages/shared/src/quiz.test.ts`

**Interfaces:**
- Produces (shared):
  ```ts
  LIMITS.minPairs = 3; LIMITS.maxPairs = 6;
  // гілка questionSchema; пари зберігаються правильними
  { ...base, type: 'match', pairs: { left: Choice; right: Choice }[] }   // min 3, max 6
  // гілка answerSchema
  { type: 'match', links: { left: string; right: string }[] }           // id як у наявних гілках, max LIMITS.maxPairs
  ```
- Правила: `choice` той самий (`text` 1–120 символів, `isStorable`). У `superRefine` id для перевірки `duplicate_ids` — це `pairs.flatMap(p => [p.left.id, p.right.id])`.

- [ ] **Step 1: Write the failing tests**

```ts
// quiz.test.ts
const pair = (l: string, r: string, i: number) => ({ left: { id: `a${i}`, text: l }, right: { id: `z${i}`, text: r } });
const matchQ = (n: number) => ({ id: 'm', type: 'match', text: 'З’єднайте', imageUrl: null, timeLimit: 30, points: 1000,
  pairs: Array.from({ length: n }, (_, i) => pair(`Л${i}`, `П${i}`, i)) });
it('accepts a match question with 3 to 6 pairs', () => {
  expect(valid(questionSchema, matchQ(3))).toBe(true);
  expect(valid(questionSchema, matchQ(6))).toBe(true);
  expect(valid(questionSchema, matchQ(2))).toBe(false);
  expect(valid(questionSchema, matchQ(7))).toBe(false);
});
it('refuses a match pair text longer than 120 characters or empty', () => {
  // pairs[0].right.text = 'x'.repeat(121) → false; 'x'.repeat(120) → true; '  ' → false
});
it('refuses a match question whose ids repeat across both columns', () => {
  // pairs[1].right.id = pairs[0].left.id → false з message 'duplicate_ids'
});
it('answerSchema accepts match links and refuses more than six', () => {
  expect(valid(answerSchema, { type: 'match', links: [{ left: 'a0', right: 'z0' }] })).toBe(true);
  // 7 зв'язків → false; left '' → false; right з UNSTORABLE-символом → false
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/shared`
Expected: FAIL (гілки `match` немає).

- [ ] **Step 3: Implement** `LIMITS.minPairs/maxPairs`, гілки `match` у `questionSchema` і `answerSchema` за правилами вище.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test && tsc -p packages/shared`
Expected: PASS (наявні тести старих вікторин теж зелені).

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): match question with 3–6 pairs and its answer"
```

---

### Задача 2: рушій — перевірка, перемішування й зрізи

**Files:**
- Modify: `packages/engine/src/check.ts`, `packages/engine/src/game.ts` (`present`), `packages/engine/src/views.ts` (`publicQuestion`)
- Modify: `packages/shared/src/views.ts` (`PublicQuestion.right`)
- Modify: `packages/engine/src/testing/fixtures.ts`
- Test: `packages/engine/src/check.test.ts`, `packages/engine/src/game.flow.test.ts`, `packages/engine/src/views.test.ts`, Create: `packages/engine/src/game.match.test.ts`

**Interfaces:**
- Consumes: задача 1.
- Produces:
  ```ts
  // shared/views.ts, PublicQuestion
  /** Праві елементи пар у порядку показу; [] для інших типів. */
  right: Choice[];
  // fixtures.ts (експортується з @quiz/engine/testing)
  export const match = { ...base, id: 'q7', type: 'match', text: 'З’єднайте місто з річкою',
    pairs: [ { left: { id: 'a', text: 'Київ' },    right: { id: 'x', text: 'Дніпро' } },
             { left: { id: 'b', text: 'Львів' },   right: { id: 'y', text: 'Полтва' } },
             { left: { id: 'c', text: 'Ужгород' }, right: { id: 'z', text: 'Уж' } } ] } satisfies Question;
  ```
  `match` не додається до типового списку `makeQuiz()`, щоб не зсунути наявні тести.
- Правила:
  - **`checkAnswer`, `match`:** `FULL`, якщо `links.length === pairs.length`, ліві id різні й покривають усі ліві, праві id різні, і кожен зв'язок збігається з парою. Інакше `REJECTED`.
  - **`present`, `match`:** `shuffle(rightIds, rng)`; якщо результат збігся з авторським порядком, то `[...ids.slice(1), ids[0]]`, як у `order`. `shuffleOptions` не враховується.
  - **`publicQuestion`, `match`:** `choices` = ліві в порядку автора, `right` = `presented`, перетворені на праві `Choice`. Для інших типів `right: []`.

- [ ] **Step 1: Write the failing tests**

```ts
// check.test.ts
it('match: all pairs right in any link order is fully correct', () => {
  expect(checkAnswer(match, { type: 'match', links: [{ left: 'c', right: 'z' }, { left: 'a', right: 'x' }, { left: 'b', right: 'y' }] })).toEqual(FULL);
});
it('match: one swapped pair makes the whole answer wrong', () => {
  expect(checkAnswer(match, { type: 'match', links: [{ left: 'a', right: 'y' }, { left: 'b', right: 'x' }, { left: 'c', right: 'z' }] })).toEqual(REJECTED);
});
it('match: duplicate, unknown or missing links are wrong', () => {
  // два зв'язки з left 'a'; два з right 'x'; right 'zzz'; лише 2 зв'язки; 4 зв'язки з повтором → REJECTED
});
// game.flow.test.ts, describe('presented order')
it('presents the right column of a match question shuffled even without shuffleOptions', () => {
  // makeQuiz([match]) з rng, що дає ['z','x','y'] → state.presented == ['z','x','y']
});
it('never shows the right column in the author order', () => {
  // identity rng → state.presented == ['y','z','x']
});
// views.test.ts
it('shows a match question as left in author order and right in the presented order', () => {
  // stageView/playerView .question: choices == [{a,Київ},{b,Львів},{c,Ужгород}], right == presented як Choice; для single right == []
});
it('does not leak the pairs of a match question to the stage or to players', () => {
  // JSON.stringify(stageView(s).question) і playerView(s,'p1').question: немає 'pairs'; reveal === null
  // на етапі reveal: stageView(s).reveal має pairs
});
// views.test.ts, describe('spotlight views')
it('the pending match answer shows the player links and no pairs', () => {
  // answered({}, { type: 'match', links: [...] }, match) → stageView.spotlight == { answer: { type: 'match', links }, grade: null };
  // JSON.stringify(stageView(s)) не містить '"pairs"'
});
// game.match.test.ts
it('a classic round scores a correct match fully and a wrong one with nothing', () => {
  // makeQuiz([match], { speedBonus: false }), p1 правильно, p2 одна пара переставлена → reveal: 1000 і 0
});
it('the host can grade a wrong match answer as partial when the round allows it', () => {
  // rules { ...DEFAULT_RULES, partial: 50 }, p2 неправильно → override(s, 'p2', 'partial') → points 500
});
it('a blitz round accepts a match answer from the head of the queue', () => {
  // blitzRound('b1', [match]): buzz p1 → submitAnswer правильно → acceptAnswer → reveal-переможець p1, 1000
});
it('a board cell plays a match question by phone and by voice', () => {
  // phone: pickCell → submitAnswer → spotlight grade null → acceptAnswer → reveal, бали ціни клітинки
  // voice: answerMode 'voice' → judge(s, chooser, true) → бали нараховано, відповіді-телефону немає
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/engine`
Expected: FAIL.

- [ ] **Step 3: Implement** `right` у `PublicQuestion`, фікстуру `match`, `checkAnswer`, `present` і `publicQuestion` за правилами вище.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test && tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages
git commit -m "feat(engine): match check all-or-nothing, shuffled right column, no pairs before reveal"
```

---

### Задача 3: редактор, формат відповіді й демо-вікторини

**Files:**
- Modify: `apps/web/src/editor/draft.ts`, `apps/web/src/editor/QuestionEditor.tsx`, `apps/web/src/format.ts`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Modify: `apps/web/src/demo-quiz.ts`, `apps/server/scripts/demo-quiz.ts`
- Modify: фабрики `PublicQuestion` у `apps/web/src/screens/*.test.tsx` (`right: []`)
- Test: `apps/web/src/editor/draft.test.ts`, `apps/web/src/editor/QuizEditor.test.tsx`, `apps/web/src/editor/new-id.test.ts`, `apps/web/src/format.test.ts`, `apps/web/src/demo-quiz.test.ts`, Create: `apps/server/scripts/demo-quiz.test.ts`

**Interfaces:**
- Consumes: задачі 1–2.
- Produces (`draft.ts`): `QUESTION_TYPES` з `'match'` в кінці. У `build`, `duplicateQuestion`, `cleaned` і `problemKey` є випадки `match`:
  - нове запитання має 3 порожні пари з новими id;
  - копія отримує нові id для всіх 2N елементів;
  - `cleaned` обрізає пробіли й прибирає порожні пари в кінці (обидва тексти `''`), лишаючи не менше `LIMITS.minPairs`;
  - порожній текст у будь-якій парі дає `'problemEmptyOption'`.
- Produces (`format.ts`):
  ```ts
  export interface PairText { left: string; right: string }
  /** Варіанти запитання для пошуку назв за id; для match — ліві й праві. */
  export function choicesOf(question: Question | null): Choice[];        // стає експортованою
  /** Усі показані варіанти: choices і right. */
  export function shownChoices(question: PublicQuestion): Choice[];
  /** Зв'язки відповіді словами; невідомий id показується як є. */
  export function pairTexts(links: { left: string; right: string }[], choices: Choice[]): PairText[];
  /** Правильні пари словами; для інших типів []. */
  export function correctPairs(question: Question): PairText[];
  ```
  `correctText`, `answerText` і `pickedText` для `match` дають пари `«ліве — праве»` через `'; '`.
- i18n:
  - `type_match: 'Пари'`, `typeShort_match: 'пари'`;
  - `pairLeftN: 'Ліворуч {index}'`, `pairRightN: 'Праворуч {index}'`, `addPair: 'Додати пару'`, `removePair: 'Прибрати пару {index}'`;
  - `matchHint: 'Запишіть правильні пари. Гравці побачать правий стовпчик перемішаним.'`.
- **Редактор (`Body`, випадок `match`).** Компонент `PairRows` у `QuestionEditor.tsx`:
  - рядок: номер, поле «Ліворуч N» і поле «Праворуч N» (`maxLength` 120), кнопка «Прибрати пару N»;
  - «Прибрати» неактивна при 3 парах, «Додати пару» неактивна при 6;
  - на ширині ≤ 480 px поля рядка стоять одне під одним (клас `.match-edit-row`).
- **Демо:**
  - `apps/web/src/demo-quiz.ts`: запитання `q7` «Пари» (три пари міст і річок), опис «Сім запитань, по одному кожного типу.»;
  - `apps/server/scripts/demo-quiz.ts`: помічник `match(text, pairs: [string, string][], points?, time?)`; id лівих `${qid}-l${i}`, правих `${qid}-r${(i + 2) % n}`; одне запитання з 4 парами в раунді «Розминка», «пари» в описі вікторини.

- [ ] **Step 1: Write the failing tests**

```ts
// draft.test.ts
it('a new match question has three empty pairs with distinct ids', () => {
  // newQuestion('match'): pairs.length 3, 6 різних id, усі тексти ''
});
it('a duplicated match question gets new ids for both columns', () => {});
it('cleaned drops trailing empty pairs but keeps three', () => {
  // 5 пар, останні дві порожні → 3; 3 пари з порожньою третьою → 3 (лишається, про неї скаже problemsOf)
});
it('a match pair with an empty side is a problem', () => {
  // problemsOf: pairs[1].right.text '' → містить t('problemEmptyOption', { index: 1 })
});
// new-id.test.ts: у циклі за типами додати 'match'
// QuizEditor.test.tsx
it('creates a match question and saves its pairs in the author order', async () => {
  // «Додати запитання» → «пари» → текст; «Ліворуч 1..3» / «Праворуч 1..3» → «Додати пару» → «Ліворуч 4»/«Праворуч 4» → зберегти →
  // saved question.type 'match', pairs.map(p => [p.left.text, p.right.text]) у порядку введення
});
it('a match question cannot have fewer than three or more than six pairs', async () => {
  // 3 пари: «Прибрати пару 1» disabled; після трьох «Додати пару» — «Додати пару» disabled
});
// format.test.ts
it('writes match answers and the correct pairs as pairs', () => {
  expect(correctText(matchQ)).toBe('Київ — Дніпро; Львів — Полтва; Ужгород — Уж');
  expect(answerText({ type: 'match', links: [{ left: 'b', right: 'x' }, { left: 'a', right: 'y' }] }, matchQ)).toBe('Львів — Дніпро; Київ — Полтва');
  expect(pairTexts([{ left: 'a', right: '??' }], choicesOf(matchQ))).toEqual([{ left: 'Київ', right: '??' }]);
});
// demo-quiz.test.ts: список типів містить 'match'
// apps/server/scripts/demo-quiz.test.ts
it('the seeded demo quiz is valid and shows every question type including pairs', () => {
  // quizSchema.safeParse(demoQuiz).success; типи questionsOf(demoQuiz) містять 'match';
  // для кожної пари match: right.id не дорівнює left.id з заміною 'l' на 'r'
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/web/src/editor apps/web/src/format.test.ts apps/web/src/demo-quiz.test.ts apps/server/scripts`
Expected: FAIL.

- [ ] **Step 3: Implement** `draft.ts`, `PairRows`, `format.ts`, тексти, стиль `.match-edit-row`, обидві демо-вікторини й `right: []` у фабриках тестів екранів.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: PASS. Наявний `EditQuiz.test.tsx` (`rounds: demoQuiz.rounds` після збереження) зелений: `cleaned` не змінює вже чисте запитання `match`.

- [ ] **Step 5: Commit**

```bash
git add apps/web apps/server/scripts
git commit -m "feat(editor): match questions with 3–6 pairs; pairs in both demo quizzes"
```

---

### Задача 4: гра — телефон, сцена, «Мільйонер»

**Files:**
- Create: `apps/web/src/screens/MatchView.tsx`
- Modify: `apps/web/src/screens/AnswerInput.tsx`, `apps/web/src/screens/SpotlightChoices.tsx`, `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/AnswerInput.test.tsx`, `apps/web/src/screens/SpotlightChoices.test.tsx`, `apps/web/src/screens/StageScreen.test.tsx`, `apps/web/src/screens/PlayerScreen.test.tsx`

**Interfaces:**
- Consumes: `shownChoices`, `pairTexts`, `correctPairs`, `PairText` (задача 3); `PublicQuestion.right` (задача 2).
- Produces (`MatchView.tsx`):
  ```ts
  export function MatchInput(props: { question: PublicQuestion; onSubmit: (answer: Answer) => void }): JSX.Element;
  export function MatchColumns(props: { left: Choice[]; right: Choice[] }): JSX.Element;
  /** tone: '' | 'is-correct' | 'is-wrong' | 'is-pending' — клас кожного рядка. */
  export function PairList(props: { pairs: PairText[]; tone: string }): JSX.Element;
  ```
- Розмітка й правила:
  - **`MatchInput`:**
    - `div.match-columns` з двома `div.match-col`: ліві кнопки `.match-left`, праві `.match-right`;
    - вибраний лівий має `aria-pressed="true"` і `.is-picked`, з'єднані мають `.is-linked` і `span.match-badge` з номером пари;
    - кнопка «Відповісти» неактивна, доки не з'єднано всі; надсилає `{ type: 'match', links }` у порядку лівого стовпчика;
    - дотики працюють за правилами з розділу рішень;
    - стан живе в компоненті, тож пауза (`fieldset disabled`) його не скидає.
  - **`MatchColumns`:** той самий макет, але `ul`/`li` замість кнопок.
  - **`PairList`:** `ol.match-list`, рядок `li.match-row` + `tone`, у ньому `«ліве» — «праве»`.
  - **Макет 360 px:** `.match-columns` — `grid-template-columns: 1fr 1fr`, `gap` 8 px, `overflow-wrap: anywhere`, кнопки мінімум 44 px заввишки.
  - **`AnswerInput`:** `case 'match': return <MatchInput … />`.
  - **`SpotlightChoices`, гілка `match`:**
    - reveal `null`, відповіді немає — `MatchColumns`;
    - reveal `null`, відповідь є — `PairList(pairTexts(links, shownChoices(question)), tone)` (помаранчевий до рішення);
    - на розкритті — заголовок «Правильні пари» і `PairList(correctPairs(reveal), 'is-correct')`; якщо `grade !== 'correct'`, вище ще з'єднання гравця з тоном вердикту.
  - **`StageScreen`, гілка без spotlight (класика, усна клітинка):**
    - під час запитання `MatchColumns(question.choices, question.right)` і підказка `matchOnPhone` (в усній клітинці підказки немає);
    - на розкритті «Правильні пари» + `PairList(correctPairs(reveal), 'is-correct')`;
    - нижній рядок «Правильна відповідь: …» для `match` не показується в жодній гілці (зі spotlight теж): пари вже показано списком.
  - **`PlayerScreen`:** усі виклики `pickedText(me.answer, question.choices)` стають `pickedText(me.answer, shownChoices(question))`, щоб надіслана відповідь показала праві назви.
  - **i18n:** `matchOnPhone: 'З’єднайте пари на телефоні'`, `correctPairs: 'Правильні пари'`, `matchPickHint: 'Торкніться елемента ліворуч, потім праворуч'` (показується над стовпчиками в `MatchInput`).

- [ ] **Step 1: Write the failing tests**

```ts
// AnswerInput.test.tsx (question: choices a,b,c = Київ, Львів, Ужгород; right z,x,y = Уж, Дніпро, Полтва)
it('match: connects left then right and sends all links when everything is connected', () => {
  // «Відповісти» disabled; Київ→Дніпро, Львів→Полтва, Ужгород→Уж → enabled →
  // onSubmit({ type: 'match', links: [{ left:'a', right:'x' }, { left:'b', right:'y' }, { left:'c', right:'z' }] })
});
it('match: tapping a connected item removes the link', () => {
  // Київ→Дніпро; тап «Дніпро» → обидва без .is-linked; тап Київ→Дніпро, тап «Київ» → знову без зв'язку; «Відповісти» disabled
});
it('match: a right tap without a picked left does nothing and a second left moves the pick', () => {
  // тап «Уж» → нічого .is-linked; тап «Київ», тап «Львів» → aria-pressed лише у «Львів»
});
it('match: links by id when two right items have the same text', () => {
  // right: [{x,'1991'},{y,'1991'},{z,'Уж'}]; з'єднати Київ з першою «1991» → links містить { left:'a', right:'x' }, не 'y'
});
it('match: shows the pair number on both connected items', () => {
  // Львів→Дніпро → .match-badge «2» у кнопок «Львів» і «Дніпро»
});
// SpotlightChoices.test.tsx
it('match: shows the columns, then the player links in orange, then the correct pairs at the reveal', () => {
  // без відповіді: .match-columns; links + grade null → li.match-row.is-pending з 'Львів — Дніпро';
  // reveal + grade 'wrong' → .is-wrong рядки гравця і .is-correct 'Київ — Дніпро', heading «Правильні пари»
});
// StageScreen.test.tsx
it('shows both match columns during the question and only the correct pairs at the reveal', () => {
  // classic: question match → .match-columns, текст «З’єднайте пари на телефоні», .match-list немає;
  // reveal → три li.match-row.is-correct, «Правильна відповідь:» немає
});
it('a voice board cell shows the match columns without the phone hint', () => {});
// PlayerScreen.test.tsx
it('shows a sent match answer with the right column names', () => {
  // me.answer { links [{a,x}] } → «Київ — Дніпро»
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/web/src/screens`
Expected: FAIL.

- [ ] **Step 3: Implement** `MatchView.tsx`, гілки `match` в екранах, тексти й стилі за правилами вище.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): connect pairs on the phone, pairs on stage and in the pending spotlight"
```

---

### Задача 5: історія — відповіді гравців, «Пари» списком

**Files:**
- Modify: `packages/shared/src/history.ts`, `apps/server/src/history.ts`, `apps/web/src/pages/GameHistory.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/server/src/history.test.ts`, `apps/web/src/pages/History.test.tsx`

**Interfaces:**
- Consumes: `PairList`, `pairTexts`, `choicesOf`, `answerText` (задачі 3–4); фікстура `match` (задача 2).
- Produces (shared):
  ```ts
  export interface GameResponse {
    nickname: string;
    /** null — спроба бліцу без відповіді. */
    answer: Answer | null;
    accepted: boolean;
  }
  // GameQuestionResult отримує:
  /** Знімок запитання з правильною відповіддю: історію бачить лише ведучий. */
  question: Question;
  /** Відповіді в порядку: учасник за турнірною таблицею, потім номер спроби. */
  responses: GameResponse[];
  ```
- Правила:
  - **Сервер.** `hostGame` додає до вибірки `answer.payload` і `answer.attempt`. Нікнейм береться з `participant`, порядок — як у `standings`, потім за `attempt`. `playerHistory` не змінюється.
  - **Веб.** Під тегами кожного запитання стоїть `<details className="responses">` з `<summary>` «Відповіді ({count})» (кількість рядків). Рядок — `nickname` і відповідь, з класом `is-correct` або `is-wrong` за `accepted`. Відповідь `match` показується як `PairList(pairTexts(links, choicesOf(question)), '')`, решта — `answerText(answer, question)`. Без відповідей блоку немає.
  - **i18n:** `responsesTitle: 'Відповіді ({count})'`.

- [ ] **Step 1: Write the failing tests**

```ts
// history.test.ts, новий describe('host history: answers')
it('history returns each player answer with the question snapshot, a match answer as links', async () => {
  // makeQuiz([match], { speedBonus: false }); Олена правильно, Тарас одна пара переставлена; lock, next, next; recorder.idle()
  // detail.questions[0]: question.type 'match', responses == [
  //   { nickname: 'Олена', answer: { type: 'match', links: [...] }, accepted: true },
  //   { nickname: 'Тарас', answer: { type: 'match', links: [...] }, accepted: false } ]
});
it('history lists a missed blitz attempt with a null answer', async () => {
  // як 'history counts a player with two blitz attempts once', але вікно спливає без відповіді → responses містить { answer: null, accepted: false }
});
// History.test.tsx, describe('GameHistory'): у фікстуру detail.questions додати question і responses
it("shows each player's answer, a match answer as pairs and a missed attempt as a dash", async () => {
  // клік «Відповіді (3)» → «Олена» з li.match-row 'Київ — Дніпро'; «Тарас» з '—'; рядок «Віра» з текстом відповіді single
});
it('shows no answers block for a question nobody answered', async () => {});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/server/src/history.test.ts apps/web/src/pages/History.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** типи, вибірку в `hostGame`, блок відповідей і стиль `.responses` за правилами вище.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: PASS (наявні тести історії, зокрема зі зіпсованим знімком, зелені).

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/server apps/web
git commit -m "feat(history): players' answers under each question, pairs as a list"
```

---

### Задача 6: наскрізний сценарій

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе попереднє; наявні помічники файлу (`open`, `click`, `field`, `questionText`, `join`, `shot`, `reveal`, `toNext`).
- Новий помічник у файлі:
  ```ts
  /** З'єднує пари на телефоні: дотик ліворуч, потім праворуч. */
  async function connect(page: Page, pairs: [string, string][]): Promise<void>;
  // page.locator('.match-left', { hasText: l }).click(); page.locator('.match-right', { hasText: r }).click()
  ```

- [ ] **Step 1: Доповнити класичний сценарій** (`scenario`, перейменувати тест на `'a host and two players go from sign-up to the podium and the history with every question type'`).

У редакторі після запитання «порядок»:
1. «Додати запитання» → «пари» → текст «З’єднайте місто з річкою».
2. «Ліворуч 1..3» = Київ, Львів, Ужгород. «Праворуч 1..3» = Дніпро, Полтва і для третьої пари довгий текст «Уж — річка, що тече через Ужгород і впадає в Лаборець на території Словаччини, довжина 133 км» (≤ 120 символів).

Під час гри, запитання 7 (після «Порядок» `toNext()` замість `toNext(true)`):
1. На сцені `.match-columns` із 3 + 3 елементами, `.match-list` немає, текст сцени не містить «Київ — Дніпро». Праві тексти на телефоні Олі (`.match-right`) за порядком ≠ `['Дніпро', 'Полтва', 'Уж — …']`.
2. Тарас з'єднує Київ→Полтва, потім торкається «Київ» (зв'язок знято, «Відповісти» disabled). Потім з'єднує Київ→Полтва, Львів→Дніпро, Ужгород→«Уж — …». На телефоні Тараса (360 px) `document.documentElement.scrollWidth <= 360`. `shot(taras, 'match-phone')`, `shot(stage, 'match-stage-question')`.
3. Оля: `connect` правильно → «Відповісти». Тарас → «Відповісти».
4. `reveal()`. На сцені три `li.match-row.is-correct`, перший «Київ — Дніпро». У Олі «Правильно!», у Тараса «Неправильно». `shot(stage, 'match-stage-reveal')`. Далі `toNext(true)`.

Подіум і історія:
- Подіум не змінюється: Оля перша.
- В історії «Оля … правильних: 7», «Тарас … правильних: 1».
- Під запитанням «З’єднайте місто з річкою» клік «Відповіді (2)» → у рядку Олі `li.match-row` «Київ — Дніпро». `shot(host, 'history-match')`.

- [ ] **Step 2: Run it**

Run: `pnpm e2e`
Expected: PASS усіх сценаріїв; `problems` порожній. З `E2E_SHOTS=1` з'являються знімки `match-phone`, `match-stage-question`, `match-stage-reveal`, `history-match`. Переглянути їх: на 360 px два стовпчики вміщаються, бейджі видно.

- [ ] **Step 3: Commit**

```bash
git add apps/server/e2e
git commit -m "test: a pairs question end-to-end in a classic round, no pairs before the reveal"
```

Після фінальної рецензії гілки злити в `main`, запустити `pnpm test` і `git push origin main`. Render розгорне сам; міграцій у цьому плані немає.
