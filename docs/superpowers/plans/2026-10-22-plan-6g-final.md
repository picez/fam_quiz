# План 6g: раунд «Фінал»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** новий тип раунду «Фінал» зі ставками. Сцена показує тему. Кожен гравець таємно ставить від 0 до свого рахунку. Потім усі одночасно відповідають на одне запитання на телефонах. Правильна відповідь дає «плюс ставка», неправильна або відсутня — «мінус ставка». Ведучий розкриває результати по одному гравцю: відповідь, ставку й новий рахунок. Запитання фіналу може мати відео: тоді таймера немає, і запитання закривається, коли відповіли всі підключені гравці, або коли його закриває ведучий.

**Архітектура:**
- **Схема (`shared`).** `finalRoundSchema` стає четвертим членом `roundSchema`. Поля: `id`, `type: 'final'`, `title` (тема), `shuffleOptions`, `check`, `questions` (рівно одне запитання).
  - Масив, а не поле `question`: тоді `roundQuestions`, `nextQuestion`, `cleaned`, `firstProblem` і `applyRoundTime` працюють без нових гілок.
  - Правил балів (`rules`) у фіналі немає. Нова функція `rulesOf(round)` повертає `DEFAULT_RULES` для фіналу й `round.rules` для інших типів. Усі місця, що читають `round.rules` з невідомого типу раунду, переходять на неї. Тоді серії, множник, штраф і «частково» вимкнені у фіналі самі собою.
  - Новий етап `'wager'` і код помилки `'wager_invalid'`.
- **Рушій (`engine`).**
  - `GameState.final: FinalState | null` тримає межі, ставки, порядок розкриття й лічильник розкритих.
  - Запитання фіналу в журналі має `Play.final: FinalPlay` зі знімком ставок (зі ставкою 0 для тих, хто не поставив) і списком оцінених вручну.
  - Дія ставки `placeWager` лежить у новому `final.ts` і імпортує `openQuestion` з `game.ts`, як `board.ts`. Гілки відповіді, оцінки, розкриття й завершення лежать у `game.ts`. `finalPoints` лежить у `score.ts`.
- **Утримання («Мільйонер») у фіналі не діє.** Відповідають усі одночасно, як у класичному раунді, а специфікація B прямо каже, що там нічого не змінюється. `pendingOf` повертає `null`, `spotlight` порожній, «Прийняти» / «Перевибрати» немає. Ручну перевірку ведучий робить через наявний `host:override`.
- **Відео й таймер** не потребують нового коду:
  - `openQuestion` уже ставить `endsAt: null` для запитання з відео;
  - `autoLock` закриває некартковий і небліцовий раунд, коли відповіли всі підключені;
  - `adjustTime` відмовляє (`wrong_phase`), коли таймера немає;
  - для фіналу з таймером «±15 с» діють, як у класичному раунді.
- **Запис і історія без міграції.**
  - Ставка дорівнює `|points|` рядка `answer` фіналу: `points` завжди `+ставка` або `−ставка`, множників немає.
  - Мовчання гравця пишеться рядком з `attempt = PENALTY_ATTEMPT` (−1): це рядок балів, а не відповідь. Тому історія, «Мої ігри», ачівки й частка правильних трактують мовчання у фіналі так само, як мовчання в класичному раунді.

**Технології:** TypeScript, zod 4, vitest, Fastify + Socket.IO, Drizzle (PGlite у тестах), React + Vite, Playwright.

**Специфікація:**
- `docs/superpowers/specs/2026-10-16-rounds-and-rules-design.md`: розділ 8 «Фінал» (обов'язковий), а також 4 (ставки, порядок обчислення), 9 (керування, зміна оцінки у фіналі), 10 (рейтинг), 11 (редактор), 12 (історія), 14 (тестування).
- `docs/superpowers/specs/2026-10-21-after-first-game-design.md`:
  - розділ 4 (частина B): утримання лише тоді, коли відповідає одна людина; у фіналі відповідають усі;
  - розділ 7 (частина E): відео у фіналі дозволене за тими самими правилами, тобто без таймера; закривається, коли відповіли всі, хто може відповідати, або ведучим;
  - розділ 9, пункт 6: план 5d треба узгодити з B і E.

Попередній план `docs/superpowers/plans/2026-10-20-plan-5d-final.md` написано до планів 6a–6f. Він лишається без змін. Звідти взято правила ставок, розкриття й вилучення гравця. Змінено форму даних (масив `questions`, `rulesOf`), ручну оцінку, запис без міграції, взаємодію з утриманням, відео й «±15 с». Додано профіль, демо й редактор після 6e/6f.

**Рішення плану там, де специфікація мовчить:**
- **Заставка завжди.** Фінал починається з `intro`, навіть якщо він єдиний або перший раунд вікторини (як поле). Фінал першим раундом дозволено: усі мають рахунок 0 і ставлять 0.
- **Межа ставки** дорівнює `max(0, рахунок)` у мить переходу `intro → wager`. Гравець з рахунком 0 або нижче може поставити лише 0.
- **Ставку можна змінювати**, поки не відкрито запитання.
- **Запитання відкривається само**, коли поставили всі підключені гравці (і є хоч один підключений). Відключення або вилучення гравця запитання саме не відкриває: у `setConnected` і `removePlayer` немає `rng` для порядку варіантів. Тоді ведучий тисне «Показати запитання». Хто не поставив, грає зі ставкою 0.
- **Ручна перевірка.** Відповідь одразу отримує тимчасовий запис «неправильно» (`−ставка`) і не потрапляє в `final.graded`. Так `autoLock`, `answeredCount` і recorder працюють без змін. Ведучий оцінює на `locked` і `reveal` («Зарахувати» / «Не зараховувати»). Неоцінена відповідь лишається неправильною.
- **Мовчання.** Під час переходу `locked → reveal` кожен гравець без запису отримує запис «неправильно» з `answer: null` і `−ставка`. Те саме відбувається, якщо ведучий завершує раунд або гру після відкриття запитання (`endRound`, `end`): тоді всіх вважають розкритими. Якщо раунд завершено на етапі ставок, записів немає.
- **Оцінка мовчання.** `override` для гравця без відповіді (`answer === null`) дає `not_found`, а `'partial'` дає `partial_disabled`.
- **Порядок розкриття:** за зростанням рахунку до фіналу (`score − points` фіналу), за рівності в порядку приєднання. Порядок фіксується на вході в `reveal` і від пізніших змін оцінки не залежить.
- **Захист від спойлерів на розкритті.**
  - Правильна відповідь видна всім з початку `reveal`.
  - `stats` (скільки правильно) у фіналі завжди `null`, бо вони видали б результат ще не розкритих гравців.
  - Рахунок і результат гравця видно лише після його розкриття. На власному телефоні гравець теж бачить свій результат лише тоді, бо це момент драми.
- **Після останнього розкриття** рейтингу між запитаннями немає: `next` веде одразу до `round_end` або `finished`.
- **Рівність, серії, бонус:**
  - час фіналу не входить у `totalTimeMs`: це вже так, бо час рахують лише за класичні раунди;
  - серій немає, бо `rulesOf` дає `streak: null`;
  - бонусу за швидкість немає.
- **Вилучення гравця.** Його ставка, межа й місце в `order` зникають. Якщо його вже було розкрито, `shown` зменшується на 1, тож лічильник не перескакує через сусіда.
- **Історія.**
  - `GameQuestionResult.final` дає рядок на кожного учасника з рядками на це запитання: нікнейм, відповідь (`null` для мовчання), ставка `|points|`, бали й чи зараховано. Порядок рядків — турнірна таблиця, як у `responses`.
  - `answered` фіналу рахує лише рядки з відповіддю. Мовчання має `attempt −1` і не рахується.
- **Профіль («Мої ігри», статистика, ачівки).** Запитання фіналу — звичайне зігране запитання:
  - воно входить у `questionsPlayed`, тобто в знаменник частки правильних;
  - відповідь з `accepted: true` (правильна, навіть зі ставкою 0) рахується правильною й продовжує серію для «Серія 5 правильних поспіль»;
  - неправильна відповідь обриває серію й робить гру неідеальною;
  - мовчання, як у класичному раунді, не є відповіддю: воно не обриває «ідеальну гру» й не рахується в `answered`, але й правильним не стає;
  - програна ставка сама собою не є окремою «помилкою»: помилкою є лише неправильна відповідь;
  - перемога рахується за підсумковим рахунком, як і раніше.
- **Редактор:**
  - у фіналі немає списку запитань, навігації, «+ Запитання» й поля «Бали» (значення `points` лишається в даних і ні на що не впливає);
  - кнопки «Однаковий час для всіх запитань раунду» немає: запитання одне, і його поле часу поруч;
  - поле «Відео з YouTube» працює, як усюди, і ховає поле часу;
  - бали запитання фіналу на екранах гри не показуються.
- **Демо.** `apps/server/scripts/demo-quiz.ts` отримує восьмий раунд «Фінал: Космос»: single, автоматична перевірка, без відео. Наявний тест «відео в класичному й бліц-раунді» лишається без змін. `party-quiz.ts` і `apps/web/src/demo-quiz.ts` не змінюються. Демо-вікторини, що вже лежать в акаунті власника, оновлюються лише повторним запуском `seed-demo.ts`, за бажанням власника.

## Глобальні обмеження

- Класичний раунд, бліц, поле, старі вікторини й історія поводяться точно як зараз. Наявні тести лишаються зеленими без змін очікувань, окрім механічних змін: поле `final: null` у зрізах і стані.
- Рушій чистий: без мережі, бази й таймерів. `now` і `rng` передаються аргументами.
- Значення (точно зі специфікації):
  - ставка — ціле число від 0 до свого рахунку; гравці з рахунком 0 або нижче ставлять 0;
  - правильно: `+ставка`; неправильно або без відповіді: `−ставка`;
  - множники, серії й часткові бали у фіналі не діють;
  - на розкритті ведучий може змінити оцінку (правильно / неправильно), і бали перераховуються;
  - запитання з відео не має таймера, кнопок «±15 с» і бонусу за швидкість.
- Зрізи сцени й гравців до розкриття гравця не містять ані чужих ставок (лише кількість поставлених), ані його нового рахунку чи результату. До `reveal` вони не містять правильної відповіді.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`. Кольори лише через наявні токени `styles.css` (`--correct`, `--signal`, `--amber`, `--pending` тощо). Нові класи мають префікс `wager-` і не перевизначають наявних (клас `is-final` уже зайнято подіумом).
- Меню (6f) на екранах гри не показується: нічого не змінюється.
- Кожна задача починається з тесту, що падає. Перед комітом зелені `pnpm vitest run --maxWorkers=2` і `pnpm typecheck`. Саме `--maxWorkers=2`, а не `pnpm test`: паралельні робітники PGlite падають під навантаженням на цій машині.
- Наскрізні тести: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Запити до YouTube у Playwright підміняються наявною заглушкою.
- Міграцій бази немає.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (побажання власника: проєкт тестовий).

## Порядок збирання

- Задача 1 додає тип раунду й етап і в тій самій задачі механічно доводить до компіляції весь репозиторій (`pnpm typecheck` зелений). Що треба змінити:
  - `round.rules` на `rulesOf(round)` там, де тип раунду не звужено: `engine/src/game.ts` (`streakCounts`, `withTotals`), `engine/src/views.ts` (`roundInfo`), `web/src/editor/draft.ts` (`problemsOf`);
  - `RoundSettings.tsx`: гілки правил звужуються до `round.type !== 'final'`;
  - `format.ts` (`roundLabel`);
  - `QuizEditor.tsx` (`addRound`);
  - `draft-storage.ts`: `looksLikeQuiz` не вимагає `rules` у фіналі, `loadDraft` має гілку `final`;
  - `apps/web/src/i18n.ts`: ключі `phase_wager`, `roundTypeFinal`, `finalLabel`, `err_wager_invalid`, бо типи ключів перевіряє компілятор.

  Поведінку фіналу в рушії дає задача 2, у редакторі задача 5.
- Задача 3 додає `BaseView.final`, `HostView.final`, `PlayerView.me.final` і механічно оновлює фабрики зрізів у `apps/web/src/screens/*.test.tsx` (`final: null`).
- Задача 4 додає `GameQuestionResult.final` і механічно оновлює фабрики історії в `apps/web/src/pages/History.test.tsx` (`final: null`).
- Наскрізні сценарії не входять у `vitest run`. Наявні сценарії мають лишатися зеленими після кожної задачі.

## На що дивитися рецензентові

1. **Гравець відключився на етапі ставок.** Запитання саме не відкривається, доки не поставили всі підключені. Відключений гравець запитання не тримає: коли поставили решта підключених, воно відкривається. Якщо він відключився вже після того, як поставили всі інші, ведучий тисне «Показати запитання», і гравець без ставки грає з 0. Тест: задача 2, `the question opens once every connected player has wagered` і `the host opens the question without missing wagers and they count as zero`.
2. **Ставка поза межами або гравець з від'ємним рахунком.** 1001 при рахунку 1000, −1, 1.5, `NaN` і будь-що, крім 0, при рахунку −400 відхиляються з `wager_invalid`, а гра не падає. Через сокет `{ amount: -1 }` і `{ amount: 1.5 }` дають `invalid_payload`. Тести: задача 2, `wagers outside 0..limit are refused`; задача 4, `player:wager is player-only and validated`.
3. **Спойлер на розкритті.** Нерозкритий гравець на сцені й у чужих телефонах не має ні ставки, ні відповіді, ні нового рахунку. На власному телефоні рахунок у нього старий, а `result` дорівнює `null`. `stats` у фіналі `null`. Тест: задача 3, `the reveal shows players one by one without spoilers`.
4. **Фінал з відео й мовчазним гравцем.** Таймера немає, «±15 с» відмовляє, запитання закривається, коли відповіли всі підключені. Мовчазний гравець на розкритті отримує «−ставка». Тест: задача 2, `a final question with a video has no timer and closes when every connected player answered`.
5. **Вилучення посеред розкриття.** Порядок і лічильник лишаються узгодженими. Вилучений рядок зникає з історії: каскадом прибирається учасник разом з його рядками. Тести: задача 2, `kicking a player during the final keeps the reveal order`; задача 4, `history shows final wagers and silence is not an answer`.

---

### Задача 1. Схема раунду «Фінал» і компіляція всього репозиторію

**Files:**
- Modify: `packages/shared/src/quiz.ts`, `packages/shared/src/game.ts`
- Modify: `packages/engine/src/testing/fixtures.ts`, `packages/engine/src/game.ts` (лише `rulesOf`), `packages/engine/src/views.ts` (лише `rulesOf`)
- Modify (механічно): `apps/web/src/editor/draft.ts` (`problemsOf`), `apps/web/src/editor/draft-storage.ts`, `apps/web/src/editor/RoundSettings.tsx`, `apps/web/src/editor/QuizEditor.tsx` (`addRound`), `apps/web/src/format.ts` (`roundLabel`), `apps/web/src/i18n.ts`
- Test: `packages/shared/src/quiz.test.ts`, `apps/web/src/format.test.ts`

**Interfaces:**
- Produces (shared, `quiz.ts`):
  ```ts
  /** Фінал: тема (title), таємні ставки й одне запитання для всіх. */
  export const finalRoundSchema = z.object({
    id: /* як у classicRoundSchema */,
    type: z.literal('final'),
    title: /* як у classicRoundSchema */,
    shuffleOptions: z.boolean(),
    check: z.enum(['auto', 'manual']),
    /** Рівно одне запитання. */
    questions: z.array(questionSchema).length(1),
  });
  export type FinalRound = z.infer<typeof finalRoundSchema>;
  // roundSchema = z.discriminatedUnion('type', [classic, blitz, board, final]);
  /** Правила балів раунду; у фіналі правил немає — DEFAULT_RULES (без серій, штрафу, частково, множник 1). */
  export function rulesOf(round: Round): RoundRules;
  ```
- Produces (shared, `game.ts`): `Phase` доповнюється `'wager'`; `ErrorCode` доповнюється `'wager_invalid'`.
- Produces (fixtures):
  ```ts
  /** Типові: title '', shuffleOptions false, check 'auto'. */
  export function finalRound(id: string, question: Question, options?: Partial<Omit<FinalRound, 'id' | 'type' | 'questions'>>): FinalRound;
  ```
- Produces (web): `roundLabel('', i, 'final')` повертає `t('finalLabel')`. Ключі `i18n.ts`: `phase_wager: 'Ставки'`, `roundTypeFinal: 'Фінал'`, `finalLabel: 'Фінал'`, `err_wager_invalid: 'Ставка має бути цілим числом від 0 до вашого рахунку.'`.

- [ ] **Step 1: Write the failing tests**

```ts
// quiz.test.ts
describe('final round', () => {
  it('a quiz with a final round passes the schema', () => {
    // classic + finalRound('f', single з id 'f1') → success
  });
  it('a final round has exactly one valid question', () => {
    // questions: [] → fail; два запитання → fail; одне з text '' → fail
  });
  it('a final round has no rules and rulesOf gives the defaults', () => {
    expect(rulesOf(finalRound('f', single))).toEqual(DEFAULT_RULES);
    expect(rulesOf(classicRound('r', [single], { rules: { ...DEFAULT_RULES, multiplier: 2 } })).multiplier).toBe(2);
  });
  it('question ids stay unique across a final and other rounds', () => {
    // той самий id у класичному раунді й у фіналі → issue 'duplicate_question_ids'
  });
  it('roundQuestions of a final round is its one question', () => {});
});
// format.test.ts
it('an untitled final round is called «Фінал»', () => {
  expect(roundLabel('', 3, 'final')).toBe('Фінал');
  expect(roundLabel('Космос', 3, 'final')).toBe('Космос');
});
```

Фікстури `classicRound`/`finalRound` у тестах shared не доступні. У `quiz.test.ts` будуйте раунди літералами, як у наявних тестах цього файлу.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared apps/web/src/format.test.ts`. Очікується FAIL: `finalRoundSchema`/`rulesOf` не визначено.
- [ ] **Step 3: Implement** схему, `rulesOf`, `Phase`, `ErrorCode`, фікстуру й механічні зміни з «Порядку збирання»:
  - `RoundSettings.tsx`: для `final` поки що показується лише назва й перемішування, повну панель дає задача 5;
  - `draft-storage.ts`: `loadDraft` для `final` повертає `{ ...round, questions: round.questions.map(revive) }`;
  - `addRound('final')` поки що може додавати класичний раунд, бо кнопки «Фінал» ще немає (її дає задача 5). Тип параметра вже `Round['type']`.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS, наявні тести без змін.
- [ ] **Step 5: Commit**

```bash
git add packages/shared packages/engine apps/web/src
git commit -m "feat(shared): final round schema and rulesOf"
```

---

### Задача 2. Рушій фіналу: ставки, відповіді, оцінка, розкриття

**Files:**
- Create: `packages/engine/src/final.ts`, `packages/engine/src/game.final.test.ts`
- Modify: `packages/engine/src/game.ts`, `packages/engine/src/score.ts`, `packages/engine/src/index.ts` (`export * from './final'`)

**Interfaces:**
- Consumes: `FinalRound`, `rulesOf`, `Phase 'wager'`, `'wager_invalid'` (задача 1).
- Produces (`game.ts`):
  ```ts
  /** Фінал поточного раунду; null поза раундом фіналу. */
  export interface FinalState {
    /** Межа ставки: max(0, рахунок) на вході в етап wager. */
    limits: Record<string, number>;
    /** Ставки; гравця без ставки тут немає. */
    wagers: Record<string, number>;
    /** Порядок розкриття; заповнюється на вході в reveal. */
    order: string[];
    /** Скільки гравців з order уже розкрито. */
    shown: number;
  }
  /** Запитання фіналу в журналі. */
  export interface FinalPlay {
    /** Ставка кожного гравця на мить відкриття запитання (без ставки — 0). */
    wagers: Record<string, number>;
    /** Кого ведучий уже оцінив вручну (check 'manual'). */
    graded: string[];
  }
  // GameState.final: FinalState | null — createGame: null.
  // Play.final?: FinalPlay — лише в запитанні раунду фіналу.
  /** Чи розкрито результат гравця у фіналі поточного запитання (для зрізів). Поза фіналом — true. */
  export function finalShown(state: GameState, playerId: string): boolean;
  ```
- Produces (`score.ts`): `export function finalPoints(wager: number, correct: boolean): number;` повертає `correct ? wager : -wager`.
- Produces (`final.ts`):
  ```ts
  export function placeWager(state: GameState, playerId: string, amount: number, now: number, rng: Rng): Result;
  ```

**Правила:**
- **Вхід.**
  - `start` для вікторини, де перший раунд фінал, іде в `intro`, як для поля, і ставить `final` так само, як `enterRound`.
  - `round_end → intro` раунду фіналу ставить `final: { limits: {}, wagers: {}, order: [], shown: 0 }`, а для інших раундів `final: null` (у `enterRound`).
  - `next` з `intro` фіналу переводить в етап `'wager'` і записує `limits[id] = max(0, score)` для кожного гравця.
  - Етап `'wager'` без таймера: `startedAt`, `endsAt` і `remainingMs` дорівнюють `null`.
- **`placeWager`** перевіряє по черзі:
  - етап `'wager'` (інакше `wrong_phase`);
  - не пауза (`paused`);
  - гравець у грі (`not_found`);
  - `Number.isInteger(amount) && 0 <= amount <= limits[playerId]` (інакше `wager_invalid`).

  Ставка записується або замінюється. Коли кожен підключений гравець має ставку і є хоч один підключений, запитання відкривається (`openFinalQuestion` з `now`, `rng`).
- **`next` з `'wager'`** відкриває запитання. `Play.final.wagers` містить кожного гравця (`wagers[id] ?? 0`), `graded: []`. Відкриття йде через `openQuestion`: таймер або його відсутність для відео працюють як завжди.
- **Відповідь** (`submitAnswer`, гілка фіналу перед загальною):
  - перевірки ті самі, що в класиці: `already_answered`, `time_over` через `timeOver`, `type_mismatch`;
  - `correct = checkAnswer(...).accuracy === 1`: часткових балів немає;
  - за `check: 'auto'` запис дорівнює `{ accepted: correct, accuracy: correct ? 1 : 0, grade, basePoints = points = finalPoints(wager, correct), streakBonus: 0, overridden: false }`;
  - за `check: 'manual'` запис тимчасовий: `{ accepted: false, accuracy: 0, grade: 'wrong', points: −wager }`, гравця немає в `graded`;
  - далі `autoLock`, як у класиці.
- **Оцінка ведучого** (`override`, гілка фіналу):
  - лише етапи `'locked'` і `'reveal'`, інакше `wrong_phase`;
  - гравець у грі й має запис з `answer !== null`, інакше `not_found`;
  - `'partial'` дає `partial_disabled`;
  - запис отримує `accepted`, `accuracy` 1/0, `grade`, `points = finalPoints(wager, grade === 'correct')`, `overridden: phase === 'reveal'`;
  - гравець додається в `graded`;
  - далі `withTotals`.
- **`next` з `locked` фіналу** спершу викликає `settleFinal`: кожен гравець без запису отримує `{ answer: null, timeMs: limitMsOf(play) ?? 0, accepted: false, accuracy: 0, grade: 'wrong', points: −wager, overridden: false }`. Далі `withTotals`. Потім `order`: id гравців за зростанням `score − points` фіналу, за рівності в порядку `state.players`. `shown = 0`, етап `'reveal'`.
- **`next` на `reveal` фіналу:** поки `shown < order.length`, лише `shown + 1`. Коли розкрито всіх, `finishRound` (рейтингу між запитаннями немає).
- **`finalShown(state, id)`:** етап `reveal` або пізніший і `order.indexOf(id)` від 0 до `shown − 1`. Гравця немає в `order` — `false`. Поза фіналом — `true`.
- **Завершення.** `endRound` і `end` після відкриття запитання фіналу (етапи `question`, `locked`, `reveal`) спершу закривають запитання, як зараз, потім викликають `settleFinal`, а `shown = order.length`. `endRound` і `end` дозволені в етапі `'wager'` (`IN_ROUND` доповнюється `'wager'`). Без запитання записів немає.
- **`removePlayer`:**
  - прибирає гравця з `final.limits`, `final.wagers` і `final.order`; якщо його індекс у `order` менший за `shown`, то `shown − 1`;
  - прибирає його з `Play.final.wagers` і `graded`;
  - автоматичного відкриття запитання немає.
- **Таймер і пауза.** `pause`/`resume` в етапі `'wager'` ідуть загальною гілкою. Утримання немає, бо `pendingOf` повертає `null`: перевірити, що для фіналу він справді `null`.

- [ ] **Step 1: Write the failing tests** у `game.final.test.ts`. Вікторина: класичний раунд `r1`, `speedBonus: false`, `penalty: 'minus'`, з двома запитаннями. Перше: `q1` за 1000; p1 правильно, p2 і p3 мовчать, ведучий закриває. Друге: `q2` за 400; p2 правильно, p3 неправильно (−400), p1 мовчить. Далі `finalRound('f', withId(single, 'f1'))`, `leaderboard: 'end'`. Гравці Анна p1, Богдан p2, Віра p3, рахунки перед фіналом 1000, 400, −400. Допоміжна `toWagers(final?: Partial<FinalRound>, question?: Question): GameState` доводить гру до етапу `'wager'`.

```ts
it('the final starts with an intro, then secret wagers with limits from the score', () => {
  // round_end → next → intro фіналу; next → phase 'wager'; final.limits { p1: 1000, p2: 400, p3: 0 }; endsAt null
});
it('a quiz that starts with a final still opens with an intro and zero limits', () => {});
it('wagers outside 0..limit are refused', () => {
  // p1: 1001, -1, 1.5, NaN → 'wager_invalid'; p3: 1 → 'wager_invalid', 0 → ok; на паузі → 'paused'; ведучий не гравець 'px' → 'not_found'
});
it('the question opens once every connected player has wagered, and wagers can change before that', () => {
  // p1 500, p1 600 (заміна), p2 400 → ще 'wager'; p3 0 → phase 'question', plays[last].final.wagers { p1: 600, p2: 400, p3: 0 }
  // окремо: p3 відключений, p1 і p2 поставили → 'question', wagers.p3 === 0
});
it('the host opens the question without missing wagers and they count as zero', () => {
  // лише p1 500; next → 'question'; final.wagers { p1: 500, p2: 0, p3: 0 }
});
it('a correct answer adds the wager and a wrong or missing one subtracts it', () => {
  // ставки 500 / 400 / 0; p1 правильно, p2 неправильно, p3 мовчить; lock; next → reveal
  // рахунки 1500, 0, -400; запис p3: answer null, grade 'wrong', points 0
});
it('multipliers, streaks, partial credit and the speed bonus do not apply in the final', () => {
  // r1 з multiplier 2 і серією length 2: у фіналі points === ±ставка, streakBonus 0, player.streak 0;
  // order-запитання у фіналі з точністю 0.5 → grade 'wrong', −ставка
});
it('final answer time does not count towards the tie-break time', () => {
  // totalTimeMs кожного гравця до й після фіналу однаковий
});
it('manual check keeps a provisional wrong grade until the host decides', () => {
  // check 'manual': p1 і p2 відповідають → записи wrong −ставка, graded []; lock;
  // override(locked, p1, 'correct') → +ставка, overridden false, graded ['p1']; override(p1, 'partial') → 'partial_disabled';
  // p2 без оцінки → на reveal лишається wrong; override(question) → 'wrong_phase'
});
it('the reveal goes player by player from the lowest score before the final', () => {
  // order ['p3', 'p2', 'p1']; next → shown 1, 2, 3; ще next → finished (останній раунд); finalShown(p2) false при shown 1, true при 2
});
it('ties in the reveal order follow the join order', () => {});
it('the host can change a final grade at the reveal, but not for a silent player', () => {
  // p2 wrong −400 → override(reveal, p2, 'correct') → +400, overridden true, рахунок перераховано;
  // p3 мовчав → override(p3, 'correct') → 'not_found'
});
it('a final question with a video has no timer and closes when every connected player answered', () => {
  // withVideo(single): endsAt null; tick(1e9) не закриває; adjustTime(+15) → 'wrong_phase';
  // p3 відключений, p1 і p2 відповіли → 'locked'; reveal → p3 −ставка
});
it('a timed final question takes ±15 s like a classic one', () => {
  // adjustTime(+15) → ok, limitMsOf зростає на 15000
});
it('nobody waits for the host in the final: there is no hold', () => {
  // після відповіді p1: pendingOf(state) === null, heldAt === null
});
it('kicking a player during the final keeps the reveal order', () => {
  // у wager: removePlayer(p2) → limits і wagers без p2;
  // у reveal з shown 2 (p3, p2 розкриті): removePlayer(p3) → order ['p2', 'p1'], shown 1
});
it('ending the round during the wagers leaves no final records; ending after the question settles everyone', () => {
  // endRound у 'wager' → 'finished', plays без запитання фіналу;
  // інша гра: p1 відповів правильно, endRound у 'question' → p1 +ставка, p2 і p3 −ставка, final.shown === order.length
});
```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/game.final.test.ts`. Очікується FAIL.
- [ ] **Step 3: Implement** `finalPoints`, `FinalState`, `FinalPlay`, `finalShown`, `settleFinal` (приватна в `game.ts`), гілки `start`/`enterRound`/`next`/`submitAnswer`/`override`/`endRound`/`end`/`removePlayer` і `placeWager` у `final.ts` за правилами вище. `final.ts` імпортує з `game.ts` значення (`openQuestion`, `ok`, `fail`), а `game.ts` з `final.ts` нічого не імпортує. Відкриття запитання фіналу оформити однією експортованою функцією в `game.ts`, `openFinalQuestion(state, now, rng): GameState`, і викликати її з `next` і з `placeWager`.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): final round with secret wagers and a one-by-one reveal"
```

---

### Задача 3. Зрізи стану для фіналу

**Files:**
- Modify: `packages/shared/src/views.ts`, `packages/engine/src/views.ts`
- Modify (механічно): фабрики зрізів у `apps/web/src/screens/*.test.tsx` (`final: null`, у `me` теж `final: null`)
- Test: `packages/engine/src/views.test.ts`

**Interfaces:**
- Consumes: `FinalState`, `FinalPlay`, `finalShown` (задача 2).
- Produces (shared, `views.ts`):
  ```ts
  export interface FinalEntry {
    playerId: string;
    nickname: string;
    /** null — гравець мовчав. */
    answer: Answer | null;
    grade: Grade;
    wager: number;
    /** Рахунок до фіналу й після нього. */
    before: number;
    after: number;
  }
  export interface FinalInfo {
    /** Тема — назва раунду (може бути порожньою). */
    theme: string;
    /** Скільки гравців уже поставили; усього гравців. */
    placed: number;
    total: number;
    /** Розкриті гравці в порядку розкриття (лише reveal); останній — щойно розкритий. */
    shown: FinalEntry[];
    /** Скільки ще не розкрито (лише reveal; інакше 0). */
    left: number;
  }
  export interface HostFinal extends FinalInfo {
    /** Ставки всіх гравців; null — ще не поставив. */
    wagers: { playerId: string; nickname: string; wager: number | null; limit: number }[];
    /** Записи всіх гравців незалежно від розкриття, у порядку розкриття (до reveal — у порядку гравців). */
    entries: FinalEntry[];
    manual: boolean;
    /** Відповіді, що чекають на ручну оцінку (manual, answer не null, гравця немає в graded). */
    pending: { playerId: string; nickname: string; answer: Answer }[];
  }
  // BaseView.final: FinalInfo | null — у раунді фіналу в етапах intro, wager, question, locked, reveal; інакше null.
  // HostView.final: HostFinal | null.
  // PlayerView.me.final: { wager: number | null; limit: number } | null — у тих самих етапах.
  ```

**Правила:**
- `BETWEEN_QUESTIONS` доповнюється `'wager'`.
- `roundInfo.partial` рахується через `rulesOf`. Для фіналу це `false` (уже з задачі 1).
- Для гравця, якого ще не розкрито (`!finalShown(state, id)`), у зрізах сцени й гравців (включно з його власним):
  - `me.score` дорівнює рахунку до фіналу (`score − points` запису). На `locked` це вже робить наявне `hidden`, а на `reveal` правило поширюється на нерозкритих;
  - `me.result` дорівнює `null`;
  - чужої ставки немає ніде. Свою гравець бачить у `me.final.wager`.
- `stats` у фіналі завжди `null`. `reveal` (правильна відповідь) показується з початку `reveal`, як зараз.
- `spotlight` у фіналі завжди `null` (уже так, бо `pendingOf` повертає `null`, а поля немає). Тест це закріплює.
- Ведучий бачить усе: усі ставки, усі записи, `pending`.

- [ ] **Step 1: Write the failing tests** (той самий сценарій p1/p2/p3, що в задачі 2; допоміжні функції можна винести в `testing/` як `finalGame()`, якщо вони потрібні обом файлам):

```ts
it('wagers stay secret: the stage and other players only see how many have placed', () => {
  // p1 поставив 777: JSON.stringify(stageView(s)) і JSON.stringify(playerView(s, 'p2')) не містять '777';
  // stageView.final { theme: 'Космос', placed: 1, total: 3, shown: [], left: 0 };
  // playerView(p1).me.final { wager: 777, limit: 1000 }; playerView(p3).me.final { wager: null, limit: 0 }
});
it('the reveal shows players one by one without spoilers', () => {
  // reveal, shown 1 (p3): stageView.final.shown — лише p3 { before: -400, after: -400, wager: 0 }; left 2; stats null;
  // playerView(p2).me.result null, me.score === 400 (до фіналу), хоча p2 уже має запис;
  // playerView(p3).me.result не null; після next (shown 2) у p2 є result і новий рахунок
});
it('the host sees every wager, every entry and pending manual answers', () => {
  // manual: hostView.final.wagers усі з сумами; після відповідей pending [p1, p2]; після override(p1) pending [p2]
});
it('the final has no spotlight and no partial button', () => {});
it('other rounds carry no final data', () => {
  // класичне запитання: final null, me.final null
});
```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/views.test.ts`. Очікується FAIL.
- [ ] **Step 3: Implement** типи й зрізи; механічно оновити фабрики зрізів у тестах `apps/web`.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add packages apps/web/src/screens
git commit -m "feat(engine): final wagers and reveal in role views"
```

---

### Задача 4. Сервер: подія ставки, запис, історія й профіль

**Files:**
- Modify: `packages/shared/src/events.ts`, `packages/shared/src/history.ts`, `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`, `apps/server/src/recorder.ts`, `apps/server/src/history.ts`, `apps/server/src/db/schema.ts` (лише коментар `PENALTY_ATTEMPT`)
- Modify (механічно): `apps/web/src/pages/History.test.tsx` (`final: null` у фабриці запитання історії)
- Test: `apps/server/src/rooms/manager.test.ts`, `apps/server/src/socket.test.ts`, `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts`, `apps/server/src/profiles.test.ts`

**Interfaces:**
- Consumes: `placeWager` (задача 2).
- Produces (shared, `events.ts`):
  ```ts
  export const wagerSchema = z.object({ amount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) });
  // ClientToServerEvents: 'player:wager': (payload: z.infer<typeof wagerSchema>, ack: Ack) => void;
  ```
- Produces (manager): `wager(room: Room, playerId: string, amount: number): AckResult` викликає `placeWager(room.state, playerId, amount, this.now(), this.rng)`.
- Produces (shared, `history.ts`):
  ```ts
  // GameQuestionResult доповнюється:
  /** Запитання фіналу: ставки й результати учасників за турнірною таблицею; null поза фіналом. */
  final: {
    entries: { nickname: string; answer: Answer | null; wager: number; points: number; accepted: boolean }[];
  } | null;
  ```
- Produces (db, без міграції): коментар `PENALTY_ATTEMPT` стає «рядок балів без відповіді: штраф бліц-клітинки або мовчання у фіналі».

**Правила:**
- **Recorder** (`answerRows`): запис фіналу з `answer === null` пишеться одним рядком з `attempt: PENALTY_ATTEMPT` (бали `−ставка`, `accepted: false`). Запис з відповіддю пишеться звичайним рядком з `attempt 0`. Ставка окремо не зберігається, бо дорівнює `|points|`. Зміна оцінки на `locked`/`reveal` перезаписує останнє закрите запитання наявним механізмом (`signature` уже містить оцінки).
- **Історія** (`hostGame`):
  - для запитання з раунду `final` (за знімком) `final.entries` дає рядок на кожного учасника з рядками на це запитання (attempt 0 або −1), за турнірною таблицею: `answer` з `payload` (для −1 це `null`), `wager = Math.abs(points)`, `points`, `accepted`;
  - для інших запитань `final: null`;
  - `answered`, `responses` і `correct` не змінюються: мовчання (−1) вже не є відповіддю.
- **Профіль:** код `profiles.ts`/`achievements.ts` не змінюється. Тест закріплює рішення плану: правильна відповідь у фіналі рахується правильною; мовчання не є відповіддю й не ламає «Ідеальну гру»; запитання фіналу входить у `questionsPlayed`.
- Вилучений гравець в історії фіналу не показується: рядків немає через каскад.

- [ ] **Step 1: Write the failing tests**

```ts
// manager.test.ts
it('final wagers go through the manager and open the question when everyone placed', () => {
  // кімната з класичним раундом і фіналом; manager.wager(room, p1, 0) → { ok: true }; коли поставили всі → room.state.phase 'question'
  // manager.wager(room, p1, 5) у 'question' → { ok: false, error: 'wrong_phase' }
});
// socket.test.ts
it('player:wager is player-only and validated', async () => {
  // ведучий → 'forbidden'; { amount: -1 }, { amount: 1.5 }, { amount: '5' } → 'invalid_payload'; гравець { amount: 0 } у лобі → 'wrong_phase'
});
// recorder.test.ts
it('a final answer is stored with its signed wager and silence as a points row', async () => {
  // ставки p1 300, p2 200; p1 правильно, p2 мовчить; reveal
  // рядки: p1 { attempt: 0, points: 300, accepted: true }, p2 { attempt: -1, payload: null, points: -200, accepted: false };
  // override(reveal, p1, 'wrong') → рядок p1 points -300, overridden true; participant.score відповідає рахунку
});
// history.test.ts
it('history shows final wagers and silence is not an answer', async () => {
  // questions[k].final.entries [{ nickname: 'Анна', answer: {…}, wager: 300, points: 300, accepted: true }, { nickname: 'Богдан', answer: null, wager: 200, points: -200, accepted: false }];
  // questions[k].answered === 1, responses без Богдана; класичне запитання final === null;
  // після kick гравця його рядка в entries немає
});
// profiles.test.ts
it('a final answer counts like any answer in profile stats, silence does not break a perfect game', async () => {
  // гравець з акаунта: 5 класичних правильних + фінал мовчки → isPerfect true, accuracy 5/6 → 83;
  // той самий з правильною відповіддю у фіналі (ставка 0) → correct 6, bestStreak 6
});
```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server`. Очікується FAIL.
- [ ] **Step 3: Implement** подію, менеджер, сокет (за зразком `player:pick`), recorder, історію, механічне оновлення фабрики історії у web.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/server apps/web/src/pages/History.test.tsx
git commit -m "feat(server): final wagers over the socket, in answers, history and profile stats"
```

---

### Задача 5. Редактор: раунд «Фінал»

**Files:**
- Modify: `apps/web/src/editor/draft.ts`, `apps/web/src/editor/RoundStrip.tsx`, `apps/web/src/editor/RoundSettings.tsx`, `apps/web/src/editor/QuizEditor.tsx`, `apps/web/src/editor/QuestionEditor.tsx`, `apps/web/src/i18n.ts`
- Test: `apps/web/src/editor/draft.test.ts`, `apps/web/src/editor/QuizEditor.test.tsx`

**Interfaces:**
- Consumes: `FinalRound` (задача 1).
- Produces:
  - `newFinalRound(): FinalRound` повертає `{ id: newId(), type: 'final', title: '', shuffleOptions: false, check: 'auto', questions: [newQuestion('single')] }`;
  - `QuestionEditor` отримує необов'язковий проп `showPoints?: boolean` (типово `true`).

**Правила:**
- «+ Раунд» пропонує четверту кнопку `t('roundTypeFinal')` («Фінал»). `addRound('final')` додає `newFinalRound()`.
- Для фіналу ліва колонка ховає `question-nav`, список запитань і «+ Запитання» (умова `round.type !== 'board' && round.type !== 'final'`). Праворуч `QuestionEditor` єдиного запитання з `showPoints={false}`.
- `RoundSettings` для фіналу:
  - поле назви з підписом `t('finalTheme')` («Тема фіналу») і заповнювачем `t('finalThemePlaceholder')` («Наприклад, Космос»);
  - перемішування варіантів;
  - `t('finalCheck')` («Перевірка відповіді») з варіантами `blitzCheckAuto` / `blitzCheckManual`.

  Блоку «Однаковий час», бонусу за швидкість і правил (штраф, частково, серії, множник) немає.
- `problemsOf` для фіналу не перевіряє правил; проблема запитання має звичайний текст з номером 1 і префіксом раунду. Решта функцій (`cleaned`, `firstProblem`, збереження й відновлення чернетки, підтвердження видалення раунду) працюють з фіналом: тест закріплює.

- [ ] **Step 1: Write the failing tests**

```ts
// draft.test.ts
it('newFinalRound passes the schema once its question is filled', () => {});
it('a saved final draft comes back unchanged', () => {
  // saveDraft → loadDraft: rounds[1] toEqual вихідний фінал (без поля rules)
});
it('problemsOf names the final question problem without checking rules', () => {
  // порожній текст запитання фіналу в раунді 2 → ['Раунд 2: …'] без t('problemRules')
});
// QuizEditor.test.tsx
it('adds a final round with a theme and a question and saves it', async () => {
  // «+ Раунд» → «Фінал»; «Тема фіналу» → 'Космос'; текст і варіанти запитання; поля «Бали» немає;
  // «+ Запитання» немає; зберегти → rounds[1] { type: 'final', title: 'Космос', check: 'auto', questions.length 1 }
});
it('final settings show only the theme, shuffle and check', async () => {
  // немає t('speedBonus'), t('sameTimeTitle'), t('ruleMinus'), t('ruleStreak'), t('ruleMultiplier'); є t('finalCheck')
});
it('a final question with a video hides the time field', async () => {});
```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/editor`. Очікується FAIL.
- [ ] **Step 3: Implement**; тексти в `i18n.ts`.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): final rounds in the quiz editor"
```

---

### Задача 6. Телефон гравця й сцена у фіналі

**Files:**
- Modify: `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/PlayerScreen.test.tsx`, `apps/web/src/screens/StageScreen.test.tsx`

**Interfaces:**
- Consumes: `FinalInfo`, `FinalEntry`, `PlayerView.me.final` (задача 3); подія `'player:wager'` (задача 4).

**Правила (тексти — ключі `i18n.ts`):**
- **Телефон:**
  - `intro` фіналу: назва раунду (`roundLabel`) і тема;
  - `wager` за `limit > 0`: `finalWagerPrompt` («Ваша ставка від 0 до {limit}»), числове поле з підписом `finalWagerLabel` («Ставка», `inputMode="numeric"`, `min 0`, `max limit`) і кнопка `finalPlace` («Поставити»), яка надсилає `send('player:wager', { amount })`. Після ставки видно `finalMyWager` («Ваша ставка: {wager}»), а поле лишається, щоб змінити;
  - `wager` за `limit === 0`: `finalZeroScore` («Ваш рахунок не більший за 0: ставка лише 0») і кнопка `finalPlaceZero` («Поставити 0»);
  - помилка ставки показується через `errorText`;
  - запитання — як у класиці (`AnswerInput`, плеєр відео, таймер лише за `timeLimit !== null`), без балів запитання;
  - `reveal`: доки `me.result === null`, видно `finalWaitReveal` («Чекаємо на розкриття»). Потім свій результат: «+{wager}» зеленим або «−{wager}» червоним і новий рахунок.
- **Сцена:**
  - `intro`: `finalLabel` і тема великими літерами;
  - `wager`: тема й `finalStageWagers` («Ставки зроблено: {placed} з {total}»);
  - запитання: як у класиці (лічильник відповідей, таймер лише з таймером, плеєр відео);
  - `reveal`: правильна відповідь і стовпчик `final.shown`. Кожен рядок містить нікнейм, відповідь (`answerText`, для `null` — «—»), `finalWagerTag` («Ставка {wager}») і «{before} → {after}». Останній рядок виділено класом `wager-latest`. Під стовпчиком `finalLeft` («Ще {left}»), якщо `left > 0`.
- Нові класи: `wager-form`, `wager-list`, `wager-latest`, `wager-delta`. Кольори лише через токени.
- Телефон 360 px: поле й кнопка в один стовпчик, без горизонтального гортання.

- [ ] **Step 1: Write the failing tests**

```ts
// PlayerScreen.test.tsx
it('places and changes a final wager within the limit', async () => {
  // phase 'wager', me.final { wager: null, limit: 400 }: ввести 300 → «Поставити» → send('player:wager', { amount: 300 });
  // me.final.wager 300 → видно «Ваша ставка: 300»
});
it('a player with no points can only wager zero', async () => {
  // limit 0 → кнопка «Поставити 0» → send('player:wager', { amount: 0 }); поля немає
});
it('a player waits for their own reveal, then sees the signed wager', () => {
  // reveal, me.result null → «Чекаємо на розкриття»; result { grade: 'correct', points: 300 } → «+300»
});
it('the final question shows no points', () => {});
// StageScreen.test.tsx
it('shows the theme and how many have wagered', () => {});
it('shows only revealed final players, the latest highlighted', () => {
  // final.shown [Віра, Богдан], left 1: два рядки, другий з класом wager-latest, «400 → 800», «Ще 1»; Анни немає
});
```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens`. Очікується FAIL.
- [ ] **Step 3: Implement** у стилі «Нічний ефір» (наявні класи `panel`, `rows`, `tag`, `btn`).
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): final wagers and reveal on the phone and the stage"
```

---

### Задача 7. Пульт ведучого й сторінка історії у фіналі

**Files:**
- Modify: `apps/web/src/screens/HostScreen.tsx`, `apps/web/src/pages/GameHistory.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/HostScreen.test.tsx`, `apps/web/src/pages/History.test.tsx`

**Interfaces:**
- Consumes: `HostFinal` (задача 3), `GameQuestionResult.final` (задача 4).

**Правила:**
- **Головна кнопка** (`MAIN_ACTION` і підписи):
  - `intro` фіналу: `finalStart` («Почати фінал»);
  - `wager`: `finalShowQuestion` («Показати запитання», `host:next`);
  - `reveal` фіналу, поки `left > 0`: `finalNextPlayer` («Наступний гравець»), далі звичайне «Далі».

  `IN_ROUND` пульта доповнюється `'wager'`, тож «Завершити раунд» є і на етапі ставок.
- **`wager`:** `finalPlaced` («Поставили {placed} з {total}») і список `final.wagers`: нікнейм, ставка або `finalThinking` («ще думає»), межа.
- **Запитання й `locked`:** як у класиці. «±15 с» видно лише з таймером, як зараз. Відповіді всіх гравців видно в `responses`.
- **Ручна перевірка:** на `locked` і `reveal` список `final.pending` з кнопками `finalGradeCorrect` («Зарахувати») і `finalGradeWrong` («Не зараховувати»), які викликають `host:override`.
- **`reveal`:**
  - `finalRevealed` («Розкрито {shown} з {total}»);
  - список `final.entries`: нікнейм, відповідь, ставка, «{before} → {after}», ознака розкритого;
  - кожен запис з відповіддю має кнопку зміни оцінки на протилежну («Зарахувати» / «Не зараховувати»).
- **Історія:** запитання фіналу показує `historyFinal` («Ставки фіналу»), а для кожного рядка `entries` — «{nickname}: ставка {wager}, {signed(points)}» з класом `is-correct` / `is-wrong`. Відповіді показуються наявним блоком `responses`.

- [ ] **Step 1: Write the failing tests**

```ts
// HostScreen.test.tsx
it('shows who has wagered and opens the final question', async () => {
  // wager: «Поставили 2 з 3», «ще думає» біля Віри, суми ставок; «Показати запитання» → send('host:next')
});
it('reveals the next final player and regrades an entry', async () => {
  // reveal, left 2: «Наступний гравець» → host:next; «Зарахувати» біля Богдана → host:override { playerId: 'p2', grade: 'correct' }
});
it('grades pending manual final answers', async () => {});
it('lets the host end the round during the wagers', async () => {});
// History.test.tsx
it('shows final wagers and results', async () => {
  // «Ставки фіналу», «Анна: ставка 300, +300», «Богдан: ставка 200, −200»
});
```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/HostScreen.test.tsx apps/web/src/pages`. Очікується FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): final wagers and reveal on the host console and in game history"
```

---

### Задача 8. Демо-вікторина й наскрізний сценарій фіналу

**Files:**
- Modify: `apps/server/scripts/demo-quiz.ts`, `apps/server/scripts/demo-quiz.test.ts`, `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з попередніх задач.

- [ ] **Step 1: Write the failing test** у `demo-quiz.test.ts`:

```ts
it('ends with a final round', () => {
  const last = demoQuiz.rounds[demoQuiz.rounds.length - 1];
  expect(last.type).toBe('final');
  expect(last.title).toBe('Фінал: Космос');
  expect(quizSchema.safeParse(demoQuiz).success).toBe(true);
});
```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/scripts`. Очікується FAIL.
- [ ] **Step 3: Implement** восьмий раунд демо: `{ id: 'r-final', type: 'final', title: 'Фінал: Космос', shuffleOptions: true, check: 'auto', questions: [single('Яка планета найбільша в Сонячній системі?', ['Сатурн', 'Юпітер', 'Нептун', 'Земля'], 1, 1000, 30)] }`. Оновити коментар угорі файлу (додати фінал).
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 apps/server/scripts`. Очікується PASS.
- [ ] **Step 5: Write the e2e scenario** `it('a final round: secret wagers, a video question without a timer, a one-by-one reveal and the history', …)` з функцією `finalGame()` за зразком `videoGame()`. Ведуча `host9`, сцена `stage9`, гравці Алла (390×844), Богдан (360×740), Віра (360×740).

  Підготовка через редактор:
  1. Класичний раунд: бонус за швидкість вимкнено (`openRoundSettings`, прапорець `t('speedBonus')`). Одне запитання з одним правильним варіантом за 1000.
  2. «+ Раунд» → «Фінал». «Тема фіналу» = «Космос». Запитання з одним правильним варіантом і відео `https://youtu.be/dQw4w9WgXcQ`: поля «Бали» й «Час, с» немає.
  3. Зберегти, «Грати».

  Хід гри:
  1. Класичний раунд: Алла й Богдан відповідають правильно (по 1000), Віра неправильно (0).
  2. Фінал: сцена показує «Космос». «Почати фінал».
  3. Ставки: Алла 1000, Богдан 300, Віра бачить «Поставити 0» і тисне його. Запитання відкривається само, ведучій кнопка не потрібна. До цього пульт показує «Поставили 2 з 3», а сцена «Ставки зроблено: 2 з 3» і не містить тексту «Ставка». Розкриття ще попереду, тож чужих ставок ніде немає.
  4. Запитання: плеєр на всіх екранах, `getByRole('timer')` немає, кнопок «−15 с» / «+15 с» немає. Алла відповідає неправильно, Богдан і Віра правильно. Запитання закривається саме.
  5. «Показати відповідь» → «Наступний гравець» тричі. Порядок розкриття: Віра (0 → 0), Алла (1000 → 0), Богдан (1000 → 1300). Алла й Богдан мають рівний рахунок до фіналу, тож порядок за приєднанням. Після першого кроку телефон Богдана показує «Чекаємо на розкриття», після третього «+300».
  6. «Далі»: подіум.

  Очікування:
  - подіум: Богдан першим з 1300. Алла й Віра мають по 0 і стоять на місцях 2 і 3 у будь-якому порядку: перевіряти числа, не порядок рівних;
  - історія ведучої: запитання фіналу показує «Ставки фіналу» з «Алла: ставка 1000, −1000», «Богдан: ставка 300, +300», «Віра: ставка 0, 0». Числа йдуть через `num`/`signed` з відступом тисяч, тож текст порівнюється після `replace(/\s/g, '')`, як рахунок у `videoGame()`;
  - кадри `E2E_SHOTS`: `final-wager-phone`, `final-wager-stage`, `final-reveal-stage`, `final-reveal-host`;
  - `expectPhoneFit(bohdan, 'final-wager-phone-360')` на етапі ставок;
  - `problems` порожній.
- [ ] **Step 6: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв, наявні без змін.
- [ ] **Step 7: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.
- [ ] **Step 8: Commit**

```bash
git add apps/server/scripts apps/server/e2e/full-game.e2e.ts
git commit -m "test: final round end-to-end; demo quiz ends with a final"
```

Після фінальної рецензії гілку злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`. Міграцій немає.
