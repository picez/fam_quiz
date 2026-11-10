# План 28a: тип запитання «Більше чи менше»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Звірка з кодом.** План спирається на назви з `main` після мержу 27d: `Play.letterwords`, `letterwords.ts`, `letterWord`, `scoreLetterWords`, `player:letters`, `ADDED_27D`, `off_letterwords`, `letterwords_place`, `LetterWordsView.tsx`, `sort.ts` (`sortWord`, `scoreSort`, `sortsHere`), `team-act.ts` (`actorOf`, `answererActor`), `GAME_STATE_VERSION = 22`. **Перед кожною задачею виконавець звіряє назви й місця з фактичним кодом.** Розбіжність — привід міняти лише назви й рядки, не рішення плану.

**Мета:** новий тип запитання `moreless`. В одному запитанні — ряд від 2 до 20 порівнянь. У кожному порівнянні є:
- запитання порівняння («Що вище?»);
- два варіанти з текстом і значенням («Говерла» — «2061 м», «Ейфелева вежа» — «330 м»);
- позначка правильного варіанта;
- бали за це порівняння.

Кожен гравець (у командах — відповідач команди) проходить увесь ряд **у своєму темпі**. На телефоні одне порівняння за раз: дві великі кнопки й лічильник «3 / 8». Після вибору одразу йде наступне порівняння, правильність не показується. Помилка ряд не зупиняє. Що не встиг до кінця таймера — без балів. Після відкриття сцена показує таблицю порівнянь: значення обох варіантів, правильний варіант і скільки гравців відповіли правильно. Ще показуються бали гравців.

**Архітектура:**
- **Дані (`shared`).** Запитання:
  ```ts
  { ...base, type: 'moreless',
    pairs: { id: string; prompt: string;
             a: { text: string; value: string }; b: { text: string; value: string };
             correct: 'a' | 'b'; points: number }[] }
  ```
  - `points` з `base` дорівнює сумі `pairs[].points` (перевірка схеми `moreless_sum`, редактор тримає суму сам). Тож усі загальні місця, що читають `question.points` (ціна клітинки поля, історія, досягнення), бачать повну ціну ряду.
  - `questionPrice` для `moreless` повертає `Σ pairs[].points`.
- **Стан (`engine`).** Необов'язкове `Play.moreless?: MoreLessPlay = { progress: Record<id, { picks: ('a' | 'b')[] }>; scored?: { right: number[] } }`.
  - `picks[i]` — вибір у порівнянні `i`, вибори йдуть строго по черзі;
  - `scored.right[i]` — скільки гравців (команд) відповіли правильно. Його заморожує `scoreMoreLess` при закритті, тож вилучення гравця після закриття таблицю не змінює (урок 27c).
  - Новий файл `packages/engine/src/moreless.ts`: `moreLessOf`, `moreLessPick`, `moreLessPoints`, `moreLessRight`, `scoreMoreLess`.
- **Зрізи.** Нові поля **необов'язкові** й присутні лише на запитанні цього типу: `PublicQuestion.moreless`, `BaseView.moreless`, `HostView.moreless`, `PlayerView.me.moreless`. Зрізи інших запитань не змінюються байт у байт, як у 27c/27d.
  - До `reveal` значення й `correct` бачить лише пульт.
- **Сервер.** Подія `player:moreless { index, pick }`. `index` — номер порівняння, на яке відповідає телефон. Ack — лише `{ ok: true }` чи помилка, **без правильності**.
- **Веб.** Нові файли:
  - `apps/web/src/editor/MoreLessEditor.tsx` (зразок — `TimedListEditor.tsx`);
  - `apps/web/src/screens/MoreLessView.tsx`: `MoreLessPlay`, `MoreLessBoard`, `MoreLessReveal` (зразок — `LetterWordsView.tsx` і `SortView.tsx`).

**Технології:** TypeScript, zod 4, vitest, Fastify + Socket.IO, React 19 + Vite, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-11-10-more-or-less-design.md`, уся.

## Глобальні обмеження

- 7 мов без ru, нові ключі в усі 7 локалей і списки в i18n.test.ts:
  - uk — у `apps/web/src/i18n.ts`;
  - список `ADDED_28A` додати в `apps/web/src/i18n.test.ts` і в умову `adds no uk keys beyond the agreed list` поруч з `ADDED_27D`;
  - переклади — у `apps/web/src/locales/{en,pl,de,es,it,ar}.json`;
  - довідка — у `help-uk.ts`, `help-uk-golden.json` і `*.help.json`. Якщо приклади довідки мають однакові числа в усіх мовах — виняток у `apps/web/src/locales/exceptions.ts`, як `LETTER_WORD_EXAMPLES`.
- Нічого про росію (і в прикладах).
  - Порівняння в тестах, e2e й довідці беремо з України, природи й побуту. Нічого, що тече, стоїть чи лежить у росії, отже без Байкалу, Волги й Ельбрусу.
  - Набір плану:
    - «Що вище?» Говерла 2061 м / Ейфелева вежа 330 м → **a**;
    - «Що довше?» Рейн 1233 км / Дунай 2850 км → **b**;
    - «Що глибше?» Світязь 58 м / Синевир 22 м → **a**;
    - «Хто важчий?» Бегемот 1500 кг / Африканський слон 6000 кг → **b**;
    - «Чого більше?» Клавіш у фортепіано 88 / Кісток у дорослої людини 206 → **b**;
    - «Що старше?» Софійський собор 1037 / Собор Паризької Богоматері 1163 → **a**.
  - Правильні варіанти перемішані: приблизно половина — «b».
- `GAME_STATE_VERSION` не підвищувати — лише необов'язкові поля (підвищення потребує дозволу власника).
  - Тип і `Play.moreless` необов'язкові, старі знімки їх не містять.
  - У `restore.ts` над `READABLE_STATE_VERSIONS` додається лише коментар: «28a без нової версії: тип 'moreless' і необов'язкове Play.moreless (з необов'язковим scored)».
- Юніт-тести `pnpm vitest run --maxWorkers=2`.
- Ніколи не запускати prettier.
- e2e: `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t <назва>`. Тут назва — `"part 28a"`, запуск на передньому плані, менше 10 хв.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`).
- Таймери у фікстурах, e2e й прикладах ≥ 25 с.
- Тип не діє в бліці, фіналі, «Ставках», «Аукціоні», «Ва-банку», «Вибуванні», «Мільйонері», у запасних запитаннях і на бліц- чи усній клітинці поля. Перелік — як у `letterwords_place`. Запасні закриває вже наявний `spare_type`, бо тип не входить у `SIMPLE_TYPES`.

## Рішення плану (там, де специфікація мовчить)

- **Назва типу в коді:** `'moreless'`. У `QUESTION_TYPES` — одразу після `'letterwords'`.
- **Ліміти** (`LIMITS`):
  - `minMoreLessPairs: 2`, `maxMoreLessPairs: 20`;
  - `moreLessPrompt: 80` — запитання порівняння;
  - `moreLessOption: 60` — текст варіанта;
  - `moreLessValue: 40` — значення, як у специфікації;
  - `defaultMoreLessTime: 60`, `defaultMoreLessPoints: 100` — бали нового порівняння;
  - `newQuestion` дає 3 порожні порівняння.
- **Бали за кожне порівняння окремо.** «Бали за кожне окреме порівняння» читаємо як окреме поле `points` (1…`maxPoints`) у кожному порівнянні. Нове порівняння в редакторі бере бали попереднього.
  - Кнопка «Однакові бали всім» (`morelessSameAll`) ставить бали першого порівняння всім.
  - Схема: `Σ points > LIMITS.maxPoints` → `moreless_points`; `q.points !== Σ` → `moreless_sum`. Редактор при кожній зміні переписує `points = Σ`, тож ведучий другої помилки не бачить.
- **Інші перевірки схеми:**
  - `moreless_same` — однакові тексти двох варіантів пари (за `answerKey`);
  - `moreless_video` — без таймера ряд не скінчиться;
  - `moreless_place`;
  - `duplicate_ids` — `pairs[].id` додати в загальний список `ids`.
  - Однакові значення варіантів **не** помилка: «рівно» ведучий вирішує сам позначкою.
- **Вибір** — `moreLessPick(state, id, index, pick, now)`. Відмови по черзі, як у `sortWord`/`letterWord`:
  1. `wrong_phase`, `paused`, `not_started`, `not_found`, `bet_skipped` (`betsRefusal`);
  2. `type_mismatch`;
  3. `not_your_turn` — на клітинці поля не той, хто вибрав;
  4. `already_answered` — ряд пройдено, запис уже є;
  5. `time_over` (`timeOverFor`);
  6. `index !== picks.length` → `moreless_stale`, стан той самий.

  Далі `picks` дописується. Після останнього порівняння одразу йде запис з **остаточними** балами: вони залежать лише від запитання, а не від інших гравців. Потім `autoLock(done, now)`, а на клітинці поля — `revealNow(done)`, як у `sortWord` і `listEntry`.
- **Подвійне натискання й пізня відповідь сервера:**
  - сервер приймає вибір лише для `index === picks.length`. Другий натиск з тим самим `index` → `moreless_stale`, стан без змін;
  - телефон це мовчки ковтає, як `sort_stale` у `SortView` (`QUIET`).
- **Бали** (`moreLessPoints(state, play, picks)`):
  - `Σ pairs[i].points` за `picks[i] === correct`, помножена на `rulesOf(round).multiplier × (play.board?.multiplier ?? 1)`;
  - стеля — `questionPrice × ті самі множники` (урок 27d);
  - ціна клітинки поля окремо не діє: вона дорівнює `points`, а це й так сума ряду;
  - без швидкості, без «частково» раунду, без `penalty: 'minus'` раунду, без бафів, `streakBonus` 0, без серій усередині ряду.
- **Оцінка запису:**
  - `grade` — `'correct'`, коли правильні **всі** порівняння ряду. Нижче `total` правильних (а для неповного ряду так завжди), але хоча б 1 — `'partial'`; 0 — `'wrong'`;
  - `accepted = grade === 'correct'`, `accuracy = right / total`;
  - `timeMs` — час до останнього вибору для повного ряду, `limitMs` для неповного.
- **Записи при закритті** (`scoreMoreLess`, у двох ланцюжках `score…` у `game.ts` поруч з `scoreLetterWords`):
  - запис отримують усі, хто має `progress` і ще без запису. Відповідь — `MoreLessAnswer { type: 'moreless'; picks: ('a' | 'b')[]; right: number; total: number }`;
  - на клітинці поля той, хто вибрав і мовчить, дістає запис з `picks: []` і 0 балів, без штрафу (як у 27c/27d);
  - `scored.right` заморожується тут же.
- **Команди:** відповідає відповідач команди, як у сортуванні.
  - `actorOf(state, id, 'answer')` для `moreless` нічого окремого не робить: діє наявна гілка `answererActor`. Типово це капітан (`not_captain`), у режимі 12g — відповідач (`not_answerer`).
  - Менеджер викликає `this.act(room, playerId, 'answerer')`, як `sort`.
  - Бали команди спільні. Інші учасники бачать на телефоні поступ команди без кнопок: `morelessTeamWatch`.
- **Поле:** грає лише той, хто вибрав. Позначка клітинки множить бали. Глядачі клітинки бачать лише `MoreLessBoard`.
- **Хто що бачить:**
  - `PublicQuestion.moreless` — `{ pairs: { id, prompt, a, b, points }[] }`. `a` і `b` — **лише тексти**, без значень і без `correct`. Тексти варіантів — не спойлер, бо їх і так видно на телефоні.
  - **Сцена й інші гравці під час `question`/`locked`:** у рядку кожного гравця лише `done` (скільки пройшов). Ні виборів, ні правильних, ні балів.
  - **Гравець (команда):**
    - `done`, `total`, `canPick`;
    - власні вибори без правильності — щоб телефон після перепідключення знав, де він;
    - на `reveal` — позначки кожного порівняння `'right' | 'wrong' | 'late'` і бали.
  - **Пульт завжди:** значення, `correct`, вибори кожного й `right` наживо. Бали — лише на `reveal`.
  - **`reveal` усім:**
    - таблиця порівнянь: запитання, обидва варіанти зі значеннями, правильний, `right` (з `scored`);
    - рядки гравців з `right`, `total` і балами.
  - **Свій запис до `reveal`.** Повний ряд дає запис уже під час `question`. Тест задачі 3 перевіряє, що ні `grade`, ні `points`, ні `accepted` цього запису не потрапляють у зріз гравця й сцени до `reveal`.
- **Ack без спойлерів:** `{ ok: true }` без `hit`, `right`, `index` і `done`. Тест задачі 4: `JSON.stringify(ack)` для правильного й неправильного вибору однаковий.
- **Частота:**
  - нова стала `MORELESS_PICKS_PER_SECOND = 5` у `packages/shared/src/events.ts`;
  - менеджер тримає власне вікно `pickAllowed`, за зразком `wordAllowed`, але з окремою мапою. Тоді вибори не з'їдають вікно слів;
  - понад межу → `too_soon`.
- **Час для фактів:** `factLimitMs` → `null`, як у списку.
- **Ручна оцінка:** `overrideGrade` → `wrong_phase` (додати `'moreless'` поруч з `'letterwords'`). Три місця `gradable` у `views.ts` виключають і цей тип.
- **Бафи:** `PlaceBlock` `'off_moreless'` у `buffs.ts` (`questionOff`) і текст `buffWhy_off_moreless`.
- **Досягнення:** нових немає. `all_types` росте сам. Тести, що чекають на точну кількість типів (`apps/server/scripts/*-quiz.test.ts`, `EXPECTED_TYPES`), оновлюються з коментарем «28a: новий тип».
- **Бот автопілота** (`testing/autopilot.ts`): проходить увесь ряд правильними виборами.
- **Перевірка витоків** (`apps/server/scripts/logic/check.ts`): `case 'moreless'` → усі `value` обох варіантів. Значення не мають стояти в тексті запитання чи порівняння.
- **Історія гри:** `answerText` → `morelessAnswer` («Правильно: 5 з 8»). Окремого блоку в `GameHistory.tsx` немає.
- **Телефон:**
  - дві великі кнопки одна під одною, кожна на всю ширину (на 320 px довгий текст переноситься, а не ріже);
  - над кнопками — `prompt` і лічильник `morelessCounter` «3 / 8»;
  - **оптимістичний перехід:** натиск одразу показує наступне порівняння. Локальний `index` = `max(локальний, me.moreless.done)`;
  - **захист від подвійного натиску:** після переходу кнопки `aria-disabled` на `MORELESS_TAP_GAP_MS = 350` мс. Натиск зараховується лише з нового `pointerdown`, а не з `click` від того самого дотику. Так подвійний дотик не відповідає за наступну пару, бо кнопки стоять на тому самому місці;
  - **відповідь сервера після переходу:** ack несе в замиканні свій `index`. Помилка для вже пройденого `index` (`moreless_stale`) мовчить. `time_over`, `paused` та інші помилки показують `errorText` у `role="status"` і повертають локальний `index` до `me.moreless.done`;
  - **фокус і клавіатура:**
    - після переходу фокус на першій кнопці нового порівняння, але лише коли фокус був на кнопці попереднього (не красти фокус з інших елементів);
    - клавіші `1`/`2` і `←`/`→` вибирають варіант;
    - `aria-live="polite"` оголошує нове порівняння;
  - пройдено все → «Готово, чекаємо на відкриття» (`morelessDone`);
  - кінець часу за годинником (`endsAt`), як у `LetterWordsPlay` → кнопки гаснуть, текст `morelessLate` «Час вийшов: пройдено {done} з {total}».
- **Анімації:**
  - перехід — `moreless-slide` (200 мс);
  - на розкритті правильний варіант підсвічується `moreless-right`;
  - `prefers-reduced-motion: reduce` вимикає обидві.
- **Демо-вікторини** не змінюються.

## Порядок збирання

- Задача 1 додає тип у `Question` і `Answer`. Через вичерпні `switch` у `apps/web` повний typecheck у задачах 1–4 не проходить. Там перевірка: `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Від задачі 5 — повний `pnpm typecheck`.
- Залежності: 2 ← 1; 3 ← 2; 4 ← 2, 3; 5 ← 3; 6 ← 4, 5; 7 — остання.

## Фокус рев'ю

1. **Спойлерів немає.**
   - До `reveal` `JSON.stringify` зрізу сцени й будь-якого гравця не містить значень (`2061`, `330 м`), `correct`, `right`, балів чи `grade` власного запису;
   - `PublicQuestion.moreless` має лише тексти;
   - ack однаковий для правильного й неправильного вибору.
   - Тести: задача 3, `never sends a value, the right side or a grade before reveal`; задача 4, `a pick ack says nothing about the answer`; задача 7 — через `socketFrames`.
2. **Бали й межі:** окремі бали порівнянь, множники раунду й клітинки, стеля `questionPrice × множники`, без мінуса раунду й швидкості. Неповний ряд — без балів за решту. Тест: задача 2, `sums the points of the right picks only`.
3. **Оцінка:** `correct` лише за весь ряд правильно; `partial` ≥ 1; `wrong` 0; `accuracy`. Тест: задача 2, `grades by the whole row`.
4. **Порядок і гонки:** вибір лише по черзі, `moreless_stale` без змін стану, `already_answered` після кінця, `time_over`.
   - На телефоні: подвійний дотик не відповідає за наступну пару; пізній ack не відкочує новішого порівняння.
   - Тести: задача 2, `picks go in order and a second tap is stale`; задача 6, `a double tap answers one comparison only`, `a late reply does not move the phone back`.
5. **Заморожування:** `scored.right` при закритті, вилучення гравця після закриття таблицю не змінює. Тест: задача 2, `the right counts freeze at the close`.
6. **Команди й поле:** відповідач команди, інші — `not_captain`/`not_answerer`. Той, хто вибрав клітинку й мовчить, — запис 0 без штрафу. Тести: задача 2, `the team answerer plays for the team`, `on a board cell only the chooser plays and silence costs nothing`.

---

### Задача 1. Спільне: схема, ліміти, ціна, підсумок, подія, помилки

**Files:**
- Modify:
  - `packages/shared/src/quiz.ts`:
    - `LIMITS`, `QUESTION_TYPES`;
    - гілка `questionSchema`;
    - `ids` у `superRefine` (`pairs[].id`);
    - перевірки `moreless_same`, `moreless_points`, `moreless_sum`, `moreless_video`;
    - `moreless_place` у `quizSchema` поруч з `letterwords_place`;
    - `questionPrice`.
  - `packages/shared/src/answer.ts` (`MoreLessAnswer`; `answerSchema` його не приймає), `packages/shared/src/events.ts`, `packages/shared/src/game.ts` (`ErrorCode`), `packages/shared/src/facts.ts`
- Test: `packages/shared/src/quiz.test.ts`, `packages/shared/src/facts.test.ts`

**Interfaces (Produces):**
```ts
// quiz.ts
LIMITS: minMoreLessPairs: 2, maxMoreLessPairs: 20, moreLessPrompt: 80, moreLessOption: 60, moreLessValue: 40,
        defaultMoreLessTime: 60, defaultMoreLessPoints: 100
export const MORELESS_SIDES = ['a', 'b'] as const;
export type MoreLessSide = (typeof MORELESS_SIDES)[number];
const moreLessOption = z.object({
  text: z.string().trim().min(1).max(LIMITS.moreLessOption).refine(isStorable, UNSTORABLE),
  value: z.string().trim().min(1).max(LIMITS.moreLessValue).refine(isStorable, UNSTORABLE) });
{ ...base, type: z.literal('moreless'),
  /** Ряд порівнянь; points з base — сума pairs[].points (moreless_sum). */
  pairs: z.array(z.object({ id: z.string().min(1).refine(isStorable, UNSTORABLE),
    prompt: z.string().trim().min(1).max(LIMITS.moreLessPrompt).refine(isStorable, UNSTORABLE),
    a: moreLessOption, b: moreLessOption, correct: z.enum(MORELESS_SIDES),
    points: z.number().int().min(1).max(LIMITS.maxPoints) }))
    .min(LIMITS.minMoreLessPairs).max(LIMITS.maxMoreLessPairs) }
export type MoreLessPair = Extract<Question, { type: 'moreless' }>['pairs'][number];
// questionPrice: moreless → Σ pairs[].points
// answer.ts
export interface MoreLessAnswer { type: 'moreless'; picks: MoreLessSide[]; right: number; total: number }   // лише рушій
// events.ts
export const MORELESS_PICKS_PER_SECOND = 5;
export const moreLessPickSchema = z.object({ index: z.number().int().min(0).max(LIMITS.maxMoreLessPairs - 1), pick: z.enum(MORELESS_SIDES) });
'player:moreless': (payload: z.infer<typeof moreLessPickSchema>, ack: Ack) => void;
// game.ts ErrorCode: | 'moreless_stale'
// facts.ts: moreless → null
```

- [ ] **Step 1: Write the failing tests.**
  - `quiz.test.ts`, помічник `moreLessQ(patch)` — 3 порівняння з набору плану (Говерла/Ейфелева вежа → a, Рейн/Дунай → b, Світязь/Синевир → a), бали 100, 100, 200, `points: 400`, 60 с:
    - `accepts a more or less question`;
    - `refuses a bad row` → помилка схеми для 1 і 21 порівняння, для значення 41 символ, для порожнього `prompt`. Коди: `moreless_same` (обидва «Говерла»), `moreless_sum` (`points: 300`), `moreless_points` (11 × 200 = 2200 > `LIMITS.maxPoints` 2000; 10 × 200 — ще можна), `moreless_video`, `duplicate_ids`;
    - `more or less plays in classic rounds and normal phone cells only` — той самий перелік, що й `letterwords_place`, з кодом `moreless_place`. Запасне запитання цього типу → `spare_type`;
    - `old quizzes still parse`;
    - `questionPrice of more or less is the sum of its comparisons` → 400;
    - `answerSchema never accepts a more or less summary; the pick event is limited` — `index: 20`, `pick: 'c'`, `index: 1.5` → false.
  - `facts.test.ts`: `a more or less question has no answer window`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared`. Очікується FAIL.
- [ ] **Step 3: Implement** за блоком Interfaces.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/shared && tsc -p packages/shared`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): 28a more or less question — a row of comparisons with values, the right side and points each, sum and place checks, the pick event"
```

---

### Задача 2. Рушій: вибір по черзі, бали, оцінка, заморожування, команди, поле

**Files:**
- Create: `packages/engine/src/moreless.ts`, `packages/engine/src/game.moreless.test.ts`
- Modify:
  - `packages/engine/src/game.ts`:
    - `MoreLessProgress`, `MoreLessPlay`, `Play.moreless`;
    - `openQuestion` — `moreless: { progress: {} }`;
    - `submitAnswer` — `type_mismatch` (поруч з `letterwords`);
    - обидва ланцюжки `score…` (`lockNow` і другий, рядки ~1598 і ~2435) — `scoreMoreLess` поруч із `scoreLetterWords`;
    - `overrideGrade` — `wrong_phase`;
    - `removePlayer` — прибрати `progress` (лише на `question`, як у `timedlist`).
  - `packages/engine/src/buffs.ts` (`'off_moreless'` у `PlaceBlock` і `questionOff`), `packages/engine/src/index.ts`, `packages/engine/src/restore.ts` (коментар)
  - `packages/engine/src/testing/fixtures.ts` (`moreless`), `packages/engine/src/testing/autopilot.ts`
- Test: `packages/engine/src/game.buffs.test.ts`, `packages/engine/src/restore.test.ts` (`keysOf<Play>`), `packages/engine/src/game.teams-act.test.ts`

**Interfaces:**
- Consumes: `MoreLessAnswer`, `MoreLessSide`, `questionPrice`, `rulesOf`, `betsRefusal`, `timeOverFor`, `limitMsOf`, `notStarted`, `withPlay`, `autoLock`, `revealNow`, `recordOf`.
- Produces:
  ```ts
  // game.ts
  export interface MoreLessProgress { picks: MoreLessSide[] }
  /** scored — з закриття (scoreMoreLess): скільки гравців (команд) відповіли правильно на кожне порівняння. */
  export interface MoreLessPlay { progress: Record<string, MoreLessProgress>; scored?: { right: number[] } }
  // Play: /** Лише в запитанні «Більше чи менше» (28a). */ moreless?: MoreLessPlay;
  // moreless.ts
  export function moreLessOf(state: GameState, playerId: string): MoreLessProgress;            // без запису — { picks: [] }
  export function moreLessPick(state: GameState, playerId: string, index: number, pick: MoreLessSide, now: number): Result;
  /** Бали за вибори: сума балів правильних × множник раунду × позначка клітинки, не більше questionPrice × множники. */
  export function moreLessPoints(state: GameState, play: Play, picks: readonly MoreLessSide[]): number;
  /** Скільки гравців (команд) відповіли правильно на кожне порівняння: після закриття — scored, до того — за поточним станом. */
  export function moreLessRight(state: GameState, play: Play): number[];
  export function scoreMoreLess(state: GameState): GameState;   // лише на question, інакше той самий стан
  // fixtures.ts
  export const moreless = { ...base, id: 'q14', type: 'moreless', text: 'Більше чи менше', timeLimit: 60, points: 400,
    pairs: [ /* Говерла/Ейфелева вежа a 100; Рейн/Дунай b 100; Світязь/Синевир a 200 */ ] } satisfies Question;
  ```

- [ ] **Step 1: Write the failing tests** (`game.moreless.test.ts`). Спільне: `fresh()` — старт раунду з Оленою, Тарасом і Вірою, запитання `moreless`.
  - `opening starts an empty row` — `play.moreless` дорівнює `{ progress: {} }`, `moreLessOf` → `{ picks: [] }`.
  - `picks go in order and a second tap is stale`:
    - `index 0, 'a'` → ok;
    - знову `index 0` → `moreless_stale`, стан той самий (`toBe`);
    - `index 2` → `moreless_stale`;
    - `index 1, 'a'` → ok (неправильно, ряд не зупиняється).
  - `refusals come in order` — `wrong_phase`, `paused`, `not_started`, `not_found`, `type_mismatch` (інше запитання), `time_over`; після останнього порівняння → `already_answered`.
  - `a finished row is recorded at once and closes when everyone is done`:
    - Олена проходить усе правильно → запис `grade: 'correct'`, `points: 400`, `timeMs` до останнього вибору, `phase` ще `question`;
    - Тарас і Віра закінчують → `autoLock`.
  - `sums the points of the right picks only`:
    - Тарас a, a, a → правильні 1 і 3 → 300; Віра лише перше порівняння до закриття → 100;
    - множник раунду ×2 і позначка клітинки ×3 множать;
    - стеля `questionPrice × множники` не перевищується;
    - `penalty: 'minus'`, `partial` і швидкість раунду нічого не змінюють; `streakBonus` 0.
  - `grades by the whole row` — усе правильно → `correct`/`accepted`; 2 з 3 → `partial`, `accuracy` 2/3; 0 правильних → `wrong`, 0 балів, **без мінуса**. Неповний ряд з усіма правильними → `partial`.
  - `the right counts freeze at the close` — `moreLessRight` до закриття `[2, 1, 1]`; після `lockNow` → `scored.right` той самий; вилучення Тараса після закриття не змінює `scored.right`, а до закриття — змінює.
  - `the team answerer plays for the team` — 2 команди по 2:
    - капітан → ok у `progress[teamId]`;
    - товариш → `not_captain`;
    - у режимі 12g відповідача — `not_answerer`;
    - бали команди спільні.
  - `on a board cell only the chooser plays and silence costs nothing` — інший → `not_your_turn`. Той, хто вибрав і мовчить, після закриття має запис `picks: []`, `points: 0`, `grade: 'wrong'`, рахунок не зменшився (навіть з `CELL_PENALTIES 'all'`). Повний ряд на клітинці → `revealNow`.
  - `the plain answer event and the host grade do not apply` — `submitAnswer` → `type_mismatch`, `override` → `wrong_phase`.
  - `removing a player drops their picks`.
  - Інші файли:
    - `game.buffs.test.ts` — `'off_moreless'`;
    - `restore.test.ts` — `keysOf<Play>` з `'moreless'`; знімок з виборами й `scored` відновлюється; `GAME_STATE_VERSION` лишається 22;
    - `game.teams-act.test.ts` — `actorOf(…, 'answer')` на `moreless` дає відповідача.
  - Автопілот: наявний тест бота з усіма типами проходить і з `moreless` (бот закриває ряд правильно).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.
- [ ] **Step 3: Implement.**
  - `moreless.ts` — за зразком `sort.ts` (порядок перевірок, запис по завершенні, `autoLock`/`revealNow`) і `letterwords.ts` (стеля, запис з 0 тому, хто вибрав клітинку);
  - той самий цикл імпортів з коментарем «game.ts викликає цей файл…».
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/engine && tsc -p packages/shared && tsc -p packages/engine`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): 28a more or less — picks in order with a stale second tap, points of the right picks capped at the price, graded by the whole row, right counts frozen at the close, the team answerer, board cells"
```

---

### Задача 3. Рушій: зрізи без спойлерів і живий рядок

**Files:**
- Modify: `packages/shared/src/views.ts`, `packages/engine/src/views.ts` (`publicQuestion`, `optional('moreless', …)` поруч з `letterwords`, лічильник «відповіли» поруч з `currentLetters`, три місця `gradable`), `packages/engine/src/live.ts` (`PROGRESS_TYPES`, `UNGRADABLE`, `progressOf`, `answered`)
- Test: `packages/engine/src/views.moreless.test.ts` (новий), `packages/engine/src/live.test.ts`

**Interfaces (Produces, `shared/views.ts`):**
```ts
/** Усім: тексти варіантів без значень і без правильного. */
export interface PublicMoreLess { pairs: { id: string; prompt: string; a: string; b: string; points: number }[] }
export interface MoreLessRow { playerId: string; nickname: string; done: number; total: number;
  /** Лише на reveal (ведучому — завжди), інакше null. */ right: number | null;
  /** Лише на reveal. */ points: number | null }
export interface MoreLessPairView { id: string; prompt: string; a: { text: string; value: string }; b: { text: string; value: string };
  correct: MoreLessSide; points: number; right: number }
export interface MoreLessInfo { rows: MoreLessRow[];          // за done спаданням, далі порядок гравців
  /** Ведучому завжди, іншим лише на reveal; інакше null. */ pairs: MoreLessPairView[] | null;
  /** Ведучому — вибори кожного наживо; іншим — null. */ picks: Record<string, MoreLessSide[]> | null }
export interface PlayerMoreLess { done: number; total: number; picks: MoreLessSide[];
  /** Можна вибирати: question, без паузи, цей гравець — той, хто відповідає, ряд не пройдено. */ canPick: boolean;
  /** Лише на reveal: по порівнянню. */ marks: ('right' | 'wrong' | 'late')[] | null; points: number | null }
// PublicQuestion.moreless?, BaseView.moreless?, HostView.moreless?, PlayerView.me.moreless?
// LiveProgress: | { kind: 'moreless'; done: number; total: number; right: number }
```

- [ ] **Step 1: Write the failing tests** (`views.moreless.test.ts`, стан із задачі 2: Олена пройшла все правильно (є запис), Тарас — a, a; Віра нічого):
  - `the public question shows the texts only` — `pairs[0]` = `{ id, prompt: 'Що вище?', a: 'Говерла', b: 'Ейфелева вежа', points: 100 }`. У `JSON.stringify` немає `2061`, `correct`.
  - `never sends a value, the right side or a grade before reveal`:
    - на `question` і `locked` `JSON.stringify(stageView(s))` і `playerView(s, 'p2')` не містять `'2061'`, `'330 м'`, `'2850'`, `"correct"`, `"grade"`, `"right":2`;
    - `playerView(s, 'p1')` (запис уже є) — `me.moreless` = `{ done: 3, total: 3, picks: ['a','b','a'], canPick: false, marks: null, points: null }`; ні `grade`, ні `points` запису Олени в зрізі немає.
  - `stage rows carry how far each got until reveal, then right counts and points` — на `question` `{ done: 3, right: null, points: null }`, `pairs` null; на `reveal` — `right`, бали, `pairs` зі значеннями, `correct` і `right` з `scored`.
  - `the player sees own marks on reveal` — Тарас `marks: ['right','wrong','late']`, `points: 100`.
  - `the host sees values and picks live` — `hostView(s).moreless.pairs[0].a.value === '2061 м'`, `picks.p2 === ['a','a']`, бали — null до `reveal`; `live` рядок `{ kind: 'moreless', done: 2, total: 3, right: 1 }`.
  - `a team member watches the answerer's progress` — товариш капітана: `done` команди, `canPick: false`; капітан: `canPick: true`.
  - `on a board cell only the chooser has a row and a pad` — глядач без `me.moreless`, рядок лише того, хто вибрав.
  - `canPick follows phase, pause and the end of the row`.
  - `other questions keep their views unchanged` — ключа `moreless` немає.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.
- [ ] **Step 3: Implement** за зразком `lettersInfo`/`playerLetterWords`.
  - `canPick` використовує `answererOf` для команд.
  - Кінця часу зріз не знає: телефон гасить кнопки за годинником, як у 27d.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 packages/engine packages/shared && tsc -p packages/shared && tsc -p packages/engine`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/views.ts packages/engine
git commit -m "feat(engine): 28a more or less views — texts only for all, how far each got until reveal, own picks without the answer, values and picks live for the host"
```

---

### Задача 4. Сервер: подія, частота, ack без спойлерів, запис, історія

**Files:**
- Modify:
  - `apps/server/src/rooms/manager.ts`:
    - метод `moreLess`;
    - `private pickAllowed` з окремою мапою вікна;
    - рядок `answerStamp` (`moreLessOf`);
    - чистка вікна при вилученні гравця, як у `wordAllowed`;
  - `apps/server/src/socket.ts` — `player:moreless`;
  - `apps/server/src/recorder.ts` (якщо потрібна гілка; відповідь іде через `payload`);
  - `apps/server/src/history.ts` — ціна й бали з рушія;
  - `apps/server/scripts/logic/check.ts` — `case 'moreless'` → значення.
- Test: `apps/server/src/socket.test.ts`, `apps/server/src/rooms/manager.test.ts`, `apps/server/src/restart.test.ts`, `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts`, `apps/server/scripts/*-quiz.test.ts` (кількість типів)

**Interfaces (Produces):**
```ts
// manager.ts
/** Вибір у «Більше чи менше» (28a): у командній грі — відповідач команди. Ack без правильності. Понад MORELESS_PICKS_PER_SECOND — too_soon. */
moreLess(room: Room, playerId: string, index: number, pick: MoreLessSide): AckResult;   // this.act(room, playerId, 'answerer'); this.apply(...)
```

- [ ] **Step 1: Write the failing tests:**
  - `manager.test.ts`:
    - `more or less picks reach the engine` — `ok`, `moreless_stale` для повтору `index`, `already_answered` після кінця;
    - `a pick ack says nothing about the answer` — `JSON.stringify` ack правильного й неправильного вибору однаковий і дорівнює `{"ok":true}`;
    - `picks are rate limited per person` — 6-й вибір за секунду → `too_soon`, а слова «Списку на час» того ж гравця в іншій кімнаті вікна не ділять (окрема мапа);
    - `only the team answerer picks` — товариш → `not_captain`, обидва телефони команди бачать `done`.
  - `socket.test.ts`, `player:moreless is player-only and validated` — ведучий і сцена → `forbidden`; `{ index: -1 }`, `{ index: 0, pick: 'c' }` → `invalid_payload`.
  - `restart.test.ts`, `a restored room keeps the picks` — піднята кімната має ті самі `picks`; наступний вибір з `index = picks.length` → ok.
  - `recorder.test.ts` — `payload: { type: 'moreless', picks: ['a','a','a'], right: 2, total: 3 }`, `points: 300`.
  - `history.test.ts` — бали в історії дорівнюють балам рушія, ціна — 400.
  - `check.ts`: значення в тексті порівняння дає проблему (тест скрипта, якщо він є; інакше — ручна перевірка в кроці 4).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/socket.test.ts apps/server/src/rooms/manager.test.ts apps/server/src/restart.test.ts apps/server/src/recorder.test.ts apps/server/src/history.test.ts`. Очікується FAIL.
- [ ] **Step 3: Implement** за зразком `sort` (`'answerer'`) і `letterWord` (частота).
- [ ] **Step 4: Run** тести з кроку 2, потім `pnpm vitest run --maxWorkers=2 apps/server/src apps/server/scripts` і `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Очікується PASS. Тести, що чекають на кількість типів, оновлюються з коментарем «28a: новий тип».
- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat(server): 28a more or less — the pick event for the team answerer, its own rate window, an ack that tells nothing, history and the leak check"
```

---

### Задача 5. Веб: тексти, формат, довідка, живий рядок і редактор

**Files:**
- Create: `apps/web/src/editor/MoreLessEditor.tsx`, `apps/web/src/editor/MoreLessEditor.test.tsx`
- Modify:
  - `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts` (`ADDED_28A`), 6 json;
  - `apps/web/src/format.ts`, `apps/web/src/admin/admin-text.ts`;
  - `apps/web/src/guide-text.ts` — `typeIcon` `'⚖️'`, `typeHow_moreless`;
  - довідка: `help-uk.ts` (`question.moreless.*`), `help-vars.ts` (`minMoreLessPairs`, `maxMoreLessPairs`), `help-uk-golden.json`, `*.help.json`, за потреби `locales/exceptions.ts`;
  - `apps/web/src/screens/LiveAnswers.tsx`;
  - `apps/web/src/editor/draft.ts`:
    - `questionTypesFor` — так само, як `letterwords`;
    - `newQuestion`;
    - копія з новими `id` порівнянь;
    - чистка: `trim` і `points = Σ`;
    - проблеми;
    - `Place.moreless`;
  - `apps/web/src/editor/draft-storage.ts` (`reviveMoreLess`), `apps/web/src/editor/QuestionEditor.tsx` (гілка; відео й загальне поле балів сховано), `apps/web/src/editor/BoardEditor.tsx` (`morelessCellNote`, тип у переліку рядка 289), `apps/web/src/styles.css` (`moreless-editor-*`).
- Test: `format.test.ts`, `guide-text.test.ts`, `LiveAnswers.test.tsx`, `draft.test.ts`, `QuizEditor.test.tsx`, `BoardEditor.test.tsx`, `help-golden.test.ts`, `locales/checks.test.ts`, `source-scan.test.ts`

**Interfaces:**
- `newQuestion('moreless')` → `{ type: 'moreless', timeLimit: 60, points: 300, video: null, pairs: [3 × { id, prompt: '', a: { text: '', value: '' }, b: { text: '', value: '' }, correct: 'a', points: 100 }] }`.
- Редактор, рядок порівняння:
  - поле `morelessPrompt` «Запитання порівняння» (заповнювач «Що вище?»);
  - два стовпці — `morelessOptionA` / `morelessOptionB` (текст) і `morelessValue` «Значення» (заповнювач «2061 м»);
  - радіо `morelessCorrect` «Правильний варіант» біля кожного стовпця;
  - `NumberField` `morelessPoints` «Бали»;
  - кнопки `addMoreLessPair`, `removeMoreLessPair`, `moreLessPairUp`/`moreLessPairDown`;
  - під рядами — `morelessSameAll` «Однакові бали всім», `morelessTotal` «Разом: {points}» і підказка `morelessHint` «Гравці бачать лише варіанти; значення з'являться після відкриття. Ліворуч на телефоні — варіант А.»;
  - нове порівняння бере `prompt` і бали попереднього.
- Проблеми:
  - `problemMoreLessPairs: 'Від {min} до {max} порівнянь'`;
  - `problemMoreLessEmpty: 'Заповніть запитання, обидва варіанти й значення в кожному порівнянні'`;
  - `problemMoreLessSame: 'Два варіанти одного порівняння однакові'`;
  - `problemMoreLessPoints: 'Разом забагато балів: більше {max}'`;
  - `problemMoreLessPlace: 'Більше чи менше — лише в класичному раунді й на звичайній клітинці поля з телефона'`.
- Інші uk-ключі задачі:
  ```ts
  type_moreless: 'Більше чи менше',
  typeShort_moreless: 'більше чи менше',
  typeHow_moreless: 'Ряд порівнянь: у кожному виберіть, який із двох варіантів правильний.',
  buffWhy_off_moreless: 'У «Більше чи менше» бафів немає.',
  morelessAnswer: 'Правильно: {right} з {total}',
  morelessLive: '{done} / {total} · правильно {right}',
  err_moreless_stale: 'Це порівняння вже пройдено',
  morelessCellNote: 'Грає той, хто вибрав клітинку; бали — сума балів порівнянь.',
  ```
- `answerText` повертає `morelessAnswer`, правильна відповідь — `'—'`. Живий рядок пульта — `morelessLive`.
- Довідка `question.moreless`:
  - `title`, `what`;
  - `how.0–2` — свій темп; помилка не зупиняє; правильність і значення — лише після відкриття;
  - `points.0–1` — сума за правильні з прикладом «Говерла / Ейфелева вежа»; не встиг — без балів;
  - `teams.0` — відповідає капітан (відповідач);
  - `limits.0–1`.

- [ ] **Step 1: Write the failing tests** — за переліком вище:
  - `format.test.ts`: `'Правильно: 2 з 3'`;
  - `LiveAnswers.test.tsx`: `'2 / 3 · правильно 1'`;
  - `draft.test.ts`:
    - `newQuestion`, `questionTypesFor`;
    - чистка (`trim`, `points = Σ`), кожна проблема;
    - бліц-клітинка → `problemMoreLessPlace`;
    - копія дає нові `id`;
  - `MoreLessEditor.test.tsx`, `adds, moves and removes comparisons, marks the right side and keeps the total` — «Однакові бали всім», «Разом: 300 → 400»;
  - `QuizEditor.test.tsx`, `saves a more or less question` (дані з набору плану);
  - `i18n.test.ts`: `ADDED_28A`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/format.test.ts apps/web/src/guide-text.test.ts apps/web/src/screens/LiveAnswers.test.tsx apps/web/src/editor apps/web/src/i18n.test.ts apps/web/src/help apps/web/src/locales`. Очікується FAIL.
- [ ] **Step 3: Implement.** Переклади природні, з тими самими плейсхолдерами. `ar` — за наявним стилем.
- [ ] **Step 4: Run** тести з кроку 2, `apps/web/src/source-scan.test.ts` і `pnpm typecheck`. Очікується PASS (повний typecheck зелений).
- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 28a more or less texts, answer format, live row, host help, editor with comparisons, values, the right side and points each"
```

---

### Задача 6. Веб: телефон, сцена й пульт

**Files:**
- Create: `apps/web/src/screens/MoreLessView.tsx`, `apps/web/src/screens/MoreLessView.test.tsx`
- Modify: `PlayerScreen.tsx`, `StageScreen.tsx` (підказка, лічильник, блок інформації, виключення із загального рядка «Правильна відповідь» і «відповіли правильно %»), `HostScreen.tsx`, `styles.css`, `i18n.ts`, 6 json, `ADDED_28A`. Місця — ті самі, що 27d торкнувся для `letterwords`; звірити.
- Test: `PlayerScreen.test.tsx`, `StageScreen.test.tsx`, `HostScreen.test.tsx`

**Interfaces (Produces):**
```tsx
export const MORELESS_TAP_GAP_MS = 350;
/** Телефон: одне порівняння, дві кнопки, лічильник; оптимістичний перехід, захист від подвійного дотику, мовчазний moreless_stale. */
export function MoreLessPlay(props: { info: PlayerMoreLess; question: PublicQuestion; paused: boolean; timeUp: boolean; send: Send }): JSX.Element;
/** Рядки гравців: «3 / 8»; на reveal — «правильно 5 з 8» і бали. */
export function MoreLessBoard(props: { info: MoreLessInfo; reveal: boolean; me?: string }): JSX.Element;
/** Таблиця порівнянь: варіанти зі значеннями, правильний підсвічено, «правильно: N»; marks — позначки гравця на телефоні. */
export function MoreLessReveal(props: { pairs: MoreLessPairView[]; marks?: PlayerMoreLess['marks']; compact?: boolean }): JSX.Element;
```
- uk-ключі:
  - `morelessCounter: '{n} / {total}'`, `morelessPick: 'Вибрати: {option}'` (`aria-label`);
  - `morelessDone: 'Готово! Чекаємо на відкриття'`, `morelessLate: 'Час вийшов: пройдено {done} з {total}'`;
  - `morelessTeamWatch: 'Відповідає {name}: {done} / {total}'`, `morelessOnPhone: 'Порівнюйте на телефоні'`, `morelessProgress: '{done} / {total}'`;
  - `morelessRightOf: 'правильно {right} з {total}'`, `morelessRightCount: 'Правильно: {n}'`, `morelessTitle: 'Порівняння'`;
  - `morelessMarkRight: 'правильно'`, `morelessMarkWrong: 'помилка'`, `morelessMarkLate: 'не встиг'`;
  - `morelessNext: 'Порівняння {n}: {prompt}'` (`aria-live`).
- Телефон (`MoreLessPlay`):
  - `prompt` великим шрифтом, лічильник, дві кнопки на всю ширину (`.moreless-option`, мінімум 64 px заввишки), текст переноситься;
  - локальний `index` = `max(local, info.done)`;
  - натиск: `busy` за `index` (один запит на порівняння), `send('player:moreless', { index, pick })`, одразу `index + 1` і `moreless-slide`, кнопки `aria-disabled` на `MORELESS_TAP_GAP_MS`;
  - натиск — з `pointerdown`/клавіші; `click` без попереднього `pointerdown` у цій кнопці (і не з клавіатури) не рахується;
  - ack: `moreless_stale` для `index < local` — нічого; інші помилки → `errorText` у `role="status"`, `local = info.done`;
  - клавіші `1`/`2`, `←`/`→`;
  - фокус переходить на першу кнопку нового порівняння, лише коли був на кнопці попереднього;
  - `paused` чи `timeUp` — кнопки гаснуть; `timeUp` → `morelessLate`; `done === total` → `morelessDone`.
- Сцена:
  - на `question` — текст, `morelessOnPhone`, `MoreLessBoard` (лише `done`);
  - на `reveal` — `MoreLessReveal` (до 20 рядків у 1600×900: два стовпці, коли порівнянь > 10) і `MoreLessBoard reveal`.
- Пульт: `MoreLessReveal` завжди (значення й правильні), `MoreLessBoard` з `right` наживо, бали на `reveal`. Кнопок оцінки немає.
- `PlayerScreen`:
  - на `question` — `MoreLessPlay` у того, хто відповідає. Решта команди бачить `morelessTeamWatch`. Глядач клітинки поля — `MoreLessBoard`;
  - на `locked` — `morelessDone`/`morelessLate`;
  - на `reveal` — `MoreLessReveal compact` зі своїми `marks`, свої бали й `MoreLessBoard reveal` з підсвіченим своїм рядком.

- [ ] **Step 1: Write the failing tests** (`MoreLessView.test.tsx`, `send` — `vi.fn`, таймери — `vi.useFakeTimers`):
  - `shows one comparison with a counter and moves on at once` — «1 / 3», натиск «Говерла» → `send` з `{ index: 0, pick: 'a' }`, на екрані «2 / 3» і «Що довше?» ще до ack;
  - `a double tap answers one comparison only` — два `pointerdown` за 100 мс → один `send`; через 350 мс новий натиск іде з `index: 1`;
  - `a late reply does not move the phone back` — ack `moreless_stale` для `index 0` після переходу до 2 → лишається «3 / 3», без тексту помилки;
  - `a refusal shows its text and returns to the server's place` — ack `time_over` → текст, `index = info.done`;
  - `keys pick and focus follows the next comparison`;
  - `the end of time and the end of the row turn the buttons off`;
  - `the stage board shows how far each got, then right counts and points`;
  - `the reveal table shows values, the right side and how many got it` — підсвічено «Дунай», «Правильно: 1»;
  - `PlayerScreen.test.tsx` — кнопки в капітана, `morelessTeamWatch` у товариша, свої позначки на `reveal`;
  - `StageScreen.test.tsx`, `more or less shows only progress while playing` — до `reveal` немає `2061 м`; немає рядка «Правильна відповідь»;
  - `HostScreen.test.tsx`, `the host sees values and picks live`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/MoreLessView.test.tsx apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/screens/StageScreen.test.tsx apps/web/src/screens/HostScreen.test.tsx apps/web/src/i18n.test.ts apps/web/src/locales`. Очікується FAIL.
- [ ] **Step 3: Implement** за зразком `LetterWordsPlay` (`busy`, фокус, годинник кінця часу) і `SortPlay` (`QUIET`).
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 apps/web`, `source-scan.test.ts` і `pnpm typecheck`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 28a more or less on the phone, stage and host — one comparison at a time, no double tap, a quiet stale reply, progress only while playing, values and right counts on reveal"
```

---

### Задача 7. Наскрізні сценарії й кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`; `apps/web/src/styles.css` (лише якщо кадри покажуть ваду, окремим комітом)

**Interfaces:**
- Consumes: помічники e2e, ті самі, що в 27d:
  - `open`, `register`, `join`, `click`, `field`, `shot`, `afterSplash`, `expectNoSideScroll`, `snapshot`, `liveRow`, `socketFrames`, `pickTeamOn`, `stageTeam`;
  - `makeRoundsQuiz`, `classicRound`, `POST /api/quizzes`.
- Помічники сценарію:
  - `morelessPick28a(page, option)` — натиск кнопки за текстом;
  - `morelessCounter28a(page)`;
  - `morelessRow28a(stage, nickname)`.

- [ ] **Step 1: Write the scenario.** `it('part 28a: more or less — own pace, a miss does not stop the row, out of time, no spoilers on the stage, values on reveal, a team answerer, a board cell, 320 px', …)` за зразком `part 27d` (`try/catch` → `snapshot()`).
  - **Редактор.** Класичний раунд з двома запитаннями:
    1. 6 порівнянь з набору плану, бали 100 (останнє — 200), 60 с;
    2. 4 порівняння, по 100, **25 с** — щоб Тарас не встиг.

    Перевірки: однакові варіанти дають `problemMoreLessSame`; «Разом: 700» оновлюється. Кадр `moreless28a-editor`.
  - **Гра.** Сцена 1600×900 (`socketFrames`). Телефони: Оля 375×812, Тарас 360×740 (`socketFrames`), Хосе 320×640 `es-ES`.
  - **Запитання 1 — власний темп, помилка не зупиняє:**
    - Оля проходить усі 6, з них 1 помилка: після кожного натиску «N / 6» росте, правильність не видно. Наприкінці — «Готово! Чекаємо на відкриття»;
    - Тарас робить 2 вибори й чекає: «3 / 6» на його телефоні, у той самий час у Олі вже «Готово»;
    - подвійний дотик Хосе (`dblclick` по першій кнопці) → лічильник «2 / 6», а не «3 / 6»;
    - до розкриття:
      - сцена — «6 / 6», «2 / 6», «1 / 6»;
      - у `stage.content()`, `stageFrames` і `tarasFrames` немає `2061`, `330 м`, `"correct"`;
      - пульт бачить значення й `liveRow` Олі з «правильно 5»;
    - `expectNoSideScroll(hose, 'moreless28a-phone-es-320')`: кнопки в межах екрана, довгий варіант переноситься;
    - розкриття (ведучий закриває):
      - сцена показує таблицю зі значеннями «2061 м», «2850 км», правильний підсвічено, «Правильно: N»;
      - Оля +600 (помилка в одному зі 100-бальних: 4 × 100 + 200), Тарас — за свої 2, Хосе — за 1;
      - позначки «не встиг» у Тараса на телефоні.
  - **Запитання 2 — не встиг до кінця часу:** Оля проходить усе, Тарас — 1 вибір і чекає 25 с. Телефон Тараса показує «Час вийшов: пройдено 1 з 4», кнопки неактивні; бали лише за 1.
  - **Історія.** Історія гри Олі показує «Правильно: 5 з 6».
  - **Команди** (друга вікторина через API, `teams: { count: 2, names: ['Червоні', 'Сині'] }`, одне запитання з 3 порівнянь):
    - капітан Червоних проходить ряд; товариш бачить «Відповідає …: 2 / 3» і не має кнопок (подія від нього → `not_captain`);
    - Сині — капітан 1 вибір;
    - розкриття: бали спільні для команди; у `markoFrames` (Сині) до розкриття немає значень.
  - **Клітинка поля** (третя вікторина: поле 1×2 з `moreless` на звичайній клітинці з телефона, позначка ×2):
    - Оля вибирає клітинку й проходить ряд → одразу розкриття, бали ×2;
    - друга клітинка: Тарас вибирає й мовчить до кінця часу → запис 0, рахунок Тараса не зменшився;
    - глядачі бачать лише поступ.
  - **Кадри (`E2E_SHOTS=1`):**
    - `moreless28a-phone-pick`, `moreless28a-phone-done`, `moreless28a-phone-late`, `moreless28a-phone-es-320`;
    - `moreless28a-stage-question`, `moreless28a-host-live`, `moreless28a-stage-reveal`, `moreless28a-phone-reveal`;
    - `moreless28a-team-watch`, `moreless28a-team-stage-reveal`, `moreless28a-board-cell`.
- [ ] **Step 2: Run** `pnpm build`, потім на передньому плані `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 28a"` (менше 10 хв). Очікується PASS.
- [ ] **Step 3: Переглянути кадри:**
  - кнопки на 320/360 px у межах екрана, великі для пальця, довгі варіанти не обрізано;
  - на сцені 1600×900 таблиця з 6 (і до 20) порівнянь читається із зали;
  - іспанська й арабська розкладки цілі (у `ar` варіанти А/Б стоять дзеркально, але порядок кнопок — як у редакторі).

  Вада → CSS окремим комітом.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2` (усе) і `pnpm typecheck`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts
git commit -m "test(e2e): part 28a more or less — own pace, a miss does not stop, out of time, a double tap, no spoilers on the stage, values on reveal, a team answerer, a board cell, 320 px"
```
