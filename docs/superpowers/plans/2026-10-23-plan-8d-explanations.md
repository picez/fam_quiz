# План 8d: пояснення для новачків — «Як грати», пам'ятка раунду, підказка нового типу

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 8d специфікації (розділ 6). У налаштуваннях вікторини — прапорець **«Пояснення для новачків»** (типово вимкнено). Коли він увімкнений:
- **«Як грати» перед грою.** Після «Почати гру» сцена показує кілька сторінок, складених із **цієї** вікторини: як відповідати з телефона; які раунди будуть і як кожен проходить (класика, бліц, поле з кубиками й чергою, фінал зі ставками й режимом ставок); які типи запитань трапляться й як на них відповідати («Розставте рядки стрілками ↑ ↓: зверху — найбільший»); бафи (якщо дозволені), дебафи (якщо дозволені), дуелі (якщо є). Ведучий гортає «Далі» й може пропустити все кнопкою «До гри». Телефони показують ту саму сторінку коротше. Лише після «Як грати» йде заставка «Раунд 1».
- **Пам'ятка перед раундом.** На заставці раунду (етап `intro`) разом з інформацією про раунд — рядок «Як проходить раунд».
- **Підказка нового типу.** Перед першим у грі запитанням кожного типу телефон показує над запитанням один рядок, як на нього відповідати. Таймер не зупиняється, відповідь не блокується.
- Прапорець вимкнений — гра поводиться точно як зараз.

**Архітектура:**
- **Налаштування.** `quizSettingsSchema.newcomers?: boolean` — необов'язкове поле в тому самому jsonb `settings`; немає поля — вимкнено. Міграцій немає, старі вікторини й історія не змінюються. Редактор пише поле лише як `true` (вимкнення прибирає ключ).
- **Сторінки — чиста функція в `shared`.** `guidePages(quiz): GuidePage[]` (`packages/shared/src/guide.ts`) повертає структуровані сторінки без тексту (вид сторінки + дані: зведення раундів `RoundBrief`, типи запитань з підписом порядку, бафи, дебафи, поріг і ставка дуелей). Тексти — лише у вебі: `apps/web/src/guide-text.ts` перетворює сторінку на заголовок і рядки через `i18n.ts`. Обидві частини тестуються окремо.
- **Етап `guide` у рушії.** Новий `Phase` `'guide'` між `lobby` і `intro` і поле `GameState.guidePage` (0-базова сторінка). `start` з увімкненим прапорцем ставить `phase: 'guide'`, `guidePage: 0` **без заставки**, але вже з `roundIndex: 0` і `enterRound` (стан той самий, що й на `intro` першого раунду, крім етапу й заставки) — тож вихід із «Як грати» — це рівно сьогоднішній `start`: `roundSplash({ ...state, phase: 'intro' }, now)` із заставкою «Раунд 1» / «Фінал». `next` на `guide` гортає сторінку, на останній — виходить у раунд; нова дія `skipGuide(state, now)` (подія `host:guide-skip`, кнопка «До гри») виходить одразу. Сторінка — частина стану, тож перепідключення показує ту саму сторінку.
- **Зрізи.** `BaseView.guide: GuideView | null` (`{ page, pages }`, лише на етапі `guide`), `BaseView.newcomers: boolean` (для пам'ятки раунду), `PlayerView.me.tip: Question['type'] | null` — тип поточного запитання, якщо воно перше такого типу в грі й гравець відповідає на нього з телефона. «Які типи вже були» не зберігається окремо: це виводиться з журналу `plays` (тип є в будь-якому з `plays[0 … questionIndex − 1]`), тож перепідключення й пауза нічого не ламають, а нового стану для історії немає.
- **Веб.** `apps/web/src/live/Guide.tsx`: `GuidePageView` — одна сторінка в трьох розмірах (`stage` — великий заголовок, значки й деталі, сітка у дві колонки; `phone` — заголовок і короткі рядки; `host` — компактно для пульта). Пульт: головна кнопка «Далі» (`host:next`; на останній сторінці підпис «До гри»), поруч «До гри» (`host:guide-skip`). `RoundBriefing` отримує `newcomers` і показує блок «Як проходить раунд». `TypeTip` — рядок над запитанням на телефоні.

**Технології:** TypeScript, zod, vitest, Fastify + Socket.IO, React + Vite, CSS, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-23-buffs-transitions-design.md` — розділ 6 (частина 8d), розділ 2 (критерій успіху «новачок після екрана «Як грати» не питає, що робити»; анти-цілі «старі вікторини … поводяться інакше», «проста вікторина стала складнішою у створенні: усе нове — необов'язкове», «гравець утрачає час через анімацію», «елементи на екрані гравця стрибають»), розділ 7 («тексти пояснень для кожного типу раунду й запитання» — на будівельнику), розділ 8. Зразки: зведення раунду `packages/shared/src/round-brief.ts` і `apps/web/src/round-summary.ts` (`roundSummary`), заставка раунду `roundSplash` у `packages/engine/src/game.ts`, `apps/web/src/screens/RoundBriefing.tsx`, значки й назви бафів і дебафів `apps/web/src/buff-meta.ts`, `apps/web/src/debuff-meta.ts`, розділ налаштувань у `apps/web/src/editor/QuizEditor.tsx` («Правила гри»), сценарій 8c у `apps/server/e2e/full-game.e2e.ts` (`afterSplash`, `splashOn`, `shot`, `noSideScroll`).

**Рішення плану там, де специфікація мовчить:**
- **Назва етапу — `guide`, не `rules`:** слово `rules` у коді вже означає правила балів раунду (`round.rules`, `rulesOf`). Подія «До гри» — `host:guide-skip`; «Далі» — наявна `host:next`.
- **Порядок сторінок** (`GuidePage['kind']`): `phone` (завжди) → `rounds` (завжди) → `questions` (завжди; до 5 типів на сторінку, більше — кілька сторінок) → `buffs` (якщо `allowedBuffs` не порожній) → `debuffs` (якщо `allowedDebuffs` не порожній; старі налаштування без поля — усі шість) → `duels` (якщо `duelThreshold(quiz) !== null`). Типова вікторина — 3–6 сторінок.
- **Раунди на сторінці** — по одному пункту на кожен *вид* раунду в порядку першої появи; вид — `type`, для бліцу ще миттєвий чи з кнопкою, для фіналу — режим ставок (`classic`/`bank`). Пункт бере `RoundBrief` першого раунду цього виду. Два класичні раунди — один пункт.
- **Типи запитань** — у порядку першої появи в раундах (`questionsOf`), без запасних (8b) і без запитань дуелей (про дуелі — своя сторінка). Для `order` береться `topLabel` першого запитання-порядку, де він не порожній (`top: ''` — підпису немає). Текст: «Розставте рядки стрілками ↑ ↓: зверху — {top}» (перша літера підпису мала — «найбільший»); без підпису — «Розставте рядки стрілками ↑ ↓ і натисніть «Відповісти».» (у застосунку порядок міняють стрілками, не перетягуванням).
- **Сцена й телефон.** Обидва показують ту саму сторінку (`guide.page`) — гравець бачить, що зараз пояснює ведучий. Сцена: заголовок, номер «2 з 5», пункти зі значком, назвою, рядком і (для раундів) рядками балів з `roundSummary`, унизу «Те саме — у ваших телефонах». Телефон: заголовок, номер, пункти — назва й рядок, без значків-ілюстрацій і без рядків балів. Пульт: заголовок сторінки, номер і назви пунктів.
- **Пам'ятка перед раундом** — `roundHow(brief)` (той самий текст, що в пункті раунду на сторінці `rounds`) у блоці «Як проходить раунд» над рядками балів у `RoundBriefing`, на сцені, телефоні й пульті, лише якщо `view.newcomers`. Попередній перегляд у редакторі пам'ятки не показує (як і раніше).
- **Підказка нового типу:** «новий» — у грі ще не відкривалося запитання цього типу (`plays` до поточного). Тип стає знайомим, щойно запитання цього типу відкрилося, хоч би хто на нього відповідав (на полі інші бачили його на сцені й телефоні). Підказка — лише тим, хто відповідає з телефона: у класиці, бліці й фіналі — усім; на звичайній клітинці — лише вибравшому; на бліц-клітинці — усім; на усній клітинці — нікому. Показується всю фазу `question` (уже під заставкою запитання, тож поява шару нічого не зсуває). Якщо гравець узяв «Заміну запитання» (запасне в класиці), підказка ховається. Сцена й пульт підказки не мають.
- **Пауза й дії на `guide`.** Пауза дозволена (як на `intro`): «Далі» й «До гри» на паузі відхиляються `paused`, кнопки ховаються. «Завершити гру» працює (гра закінчується, як із `intro`, заставка «Підсумки»). «Завершити раунд» на `guide` недоступне (`wrong_phase`, кнопки немає). Приєднатися на `guide` не можна — як і зараз, лише в лобі. Дуель на `guide` неможлива (поріг ≥ 1 запитання).
- **Без прапорця** `start` іде прямо в `intro`, як зараз; `guide` у зрізах `null`, `newcomers` `false`, `me.tip` `null`. Наявні тести не змінюють очікувань, окрім механічних нових полів у веб-фабриках зрізів.
- **Демо:** прапорець вмикається лише в `apps/server/scripts/school-quiz.ts` («Від шкільної парти до мемів» — найдружніша до новачків); інші демо без змін. Вікторини, уже засіяні у власника, не змінюються — щоб побачити «Як грати», власник вмикає прапорець у редакторі або засіває «шкільну» знову (`seed-demo.ts`).
- **Тексти без родів** (див. задачу 5): «Як грати», «Далі», «До гри», «Те саме — у ваших телефонах», «Як проходить раунд», «Пояснення для новачків» тощо.

## Глобальні обмеження

- Старі вікторини, чернетки, історія й профіль не змінюються: поле `newcomers` необов'язкове, міграцій немає, журнал `plays` не отримує нових полів. Рушій без прапорця поводиться точно як зараз.
- Рушій чистий: `now` — аргумент; `guidePages` — чиста функція без тексту.
- Анти-ціль «втрачений час»: підказка типу не зупиняє таймер і не блокує відповідь; «Як грати» йде до першого запитання, коли жоден таймер ще не біжить.
- Анти-ціль «стрибки»: підказка стоїть з першої миті запитання до його закриття; сторінки «Як грати» не мають анімації появи пунктів.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`. Нові кольори — токени в `:root` у `styles.css` (`--guide-accent`, `--tip-bg`). Тема лише темна. Нові класи мають префікси `guide-` і `type-tip`.
- Розкладка працює на ширині 375 px (і 360 px) без горизонтальної прокрутки; сторінка «Як грати» на сцені вміщується в 1280 × 720 без вертикальної прокрутки.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2` (саме `--maxWorkers=2`; якщо PGlite падає з браком пам'яті — окремо `pnpm vitest run --maxWorkers=2 packages`, `… apps/server`, `… apps/web`).
- Наскрізні тести: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Кадри — з `E2E_SHOTS=1` у `apps/server/e2e/artifacts/shots`.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (проєкт тестовий).

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/quiz.ts`, `quiz.test.ts` | `quizSettingsSchema.newcomers` | 1 |
| `packages/shared/src/guide.ts` (новий), `index.ts` | `GuidePage`, `GuideType`, `GUIDE_TYPES_PER_PAGE`, `guidePages` | 1 |
| `packages/engine/src/guide-pages.test.ts` (новий) | тести `guidePages` на фікстурах рушія | 1 |
| `packages/shared/src/game.ts` | `Phase` + `'guide'` | 2 |
| `apps/web/src/i18n.ts` | `phase_guide` | 2 |
| `packages/engine/src/game.ts` | `GameState.guidePage`, `createGame`, `start`, `next` (`guide`), `skipGuide`, `enterFirstRound` | 2 |
| `packages/engine/src/testing/helpers.ts` | `lobbyWithGuide` | 2 |
| `packages/engine/src/game.guide.test.ts` (новий) | етап `guide` | 2 |
| `packages/shared/src/views.ts`, `packages/engine/src/views.ts` | `GuideView`, `BaseView.guide`, `BaseView.newcomers`, `PlayerView.me.tip`, `typeTip` | 3 |
| `packages/engine/src/views.guide.test.ts` (новий) | зрізи | 3 |
| веб-фабрики зрізів: `StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `HostScreen.test.tsx`, `DuelView.test.tsx`, `live/Splash.test.tsx` | `guide: null`, `newcomers: false`, `me.tip: null` | 3 |
| `packages/shared/src/events.ts`, `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`, `rooms/manager.test.ts`, `socket.test.ts` | `host:guide-skip` | 4 |
| `apps/web/src/guide-text.ts` (новий), `guide-text.test.ts` (новий), `apps/web/src/i18n.ts` | `guidePageText`, `roundHow`, `typeHow`, тексти | 5 |
| `apps/web/src/live/Guide.tsx` (новий), `live/Guide.test.tsx` (новий), `styles.css` | `GuidePageView` | 6 |
| `apps/web/src/screens/StageScreen.tsx`, `PlayerScreen.tsx`, `HostScreen.tsx` і їхні тести | етап `guide` на трьох екранах, кнопки пульта | 6 |
| `apps/web/src/screens/RoundBriefing.tsx`, `StageScreen.tsx`, `PlayerScreen.tsx`, `HostScreen.tsx`, тести, `styles.css` | пам'ятка раунду, `TypeTip` | 7 |
| `apps/web/src/editor/QuizEditor.tsx`, `QuizEditor.test.tsx`, `i18n.ts` | прапорець «Пояснення для новачків» | 8 |
| `apps/server/scripts/school-quiz.ts`, `demo-quiz.test.ts` | прапорець у «шкільній» демо | 8 |
| `apps/server/e2e/full-game.e2e.ts` | наскрізний сценарій 8d | 9 |

## Порядок збирання

- Задача 1 (налаштування й сторінки) — основа, без змін поведінки. Задача 2 (етап `guide`) — на 1; новий `Phase` вимагає `phase_guide` в `i18n.ts` (через `t(`phase_${phase}`)` у пульті), тож він додається в тій самій задачі. Задача 3 (зрізи) — на 1–2; нові обов'язкові поля закриваються механічно в п'яти веб-фабриках у тій самій задачі.
- Задача 4 (сервер) — на 2–3. Задача 5 (тексти) — на 1. Задача 6 (екрани «Як грати») — на 3–5. Задача 7 (пам'ятка й підказка) — на 3 і 5. Задача 8 (редактор і демо) — на 1. Задача 9 (e2e) — остання.
- Наявні тести не змінюють очікувань, окрім механічних полів у веб-фабриках (задача 3). Якщо якийсь тест рушія порівнює цілий зріз через `toEqual`, у нього додаються `guide: null`, `newcomers: false` (і `tip: null` у `me`) — без зміни інших очікувань.

## На що дивитися рецензентові

1. **Вимкнено — як раніше.** Без `newcomers` `start` → `intro` із заставкою, як у 8c; зрізи `guide: null`, `newcomers: false`, `tip: null`; редактор не пише ключа, поки прапорець не ввімкнено. Тести: задача 1, `an old quiz without the flag parses unchanged`; задача 2, `without the flag the game starts as before`; задача 3, `nothing new is shown without the flag`; задача 8, `the flag is written only when on`.
2. **Зміст — із цієї вікторини.** Сторінки змінюються разом з вікториною: лише наявні види раундів, типи запитань, дозволені бафи й дебафи, дуелі за наявності пулу; підпис порядку з вікторини. Тести: задача 1 (весь `describe('guidePages')`), задача 5.
3. **«Як грати» перед заставкою раунду, перепідключення.** На `guide` заставки немає; вихід — заставка «Раунд 1» (або «Фінал»); сторінка в стані, тож перезавантажений телефон показує ту саму. Тести: задача 2, `leaving the guide plays the round splash`; задача 9, перезавантаження телефона посеред «Як грати».
4. **Підказка не краде часу й не стрибає.** `me.tip` лише на `question`, таймер той самий (`startedAt`, `endsAt` не змінюються), відповідь приймається; рядок стоїть з першої миті. Тести: задача 3, `the tip does not touch the clock`; задача 7, `the tip sits above the question and answering still works`; задача 9, вимір `y` запитання до й після заставки.
5. **Пульт.** «Далі» / «До гри», пауза, «Завершити гру» на `guide`; «Завершити раунд» прихована й відхиляється. Тести: задача 2, `pause and end work in the guide; end-round does not`; задача 6, `the host pages the guide and can skip it`.

---

### Задача 1. Налаштування «Пояснення для новачків» і сторінки «Як грати» з вікторини

**Files:**
- Modify: `packages/shared/src/quiz.ts` (`quizSettingsSchema`)
- Modify: `packages/shared/src/quiz.test.ts`
- Create: `packages/shared/src/guide.ts`
- Modify: `packages/shared/src/index.ts` (`export * from './guide'`)
- Create: `packages/engine/src/guide-pages.test.ts`

**Interfaces:**
- Produces (`shared`):
  ```ts
  // quiz.ts, у quizSettingsSchema
  /** Пояснення для новачків (8d): «Як грати», пам'ятка раунду, підказка нового типу; немає поля — вимкнено. */
  newcomers: z.boolean().optional(),

  // guide.ts
  import type { BuffKind, DebuffKind } from './game';
  import type { Question, Quiz } from './quiz';
  import type { RoundBrief } from './round-brief';

  /** Тип запитання на сторінці «Як грати»; top — підпис верху для order ('' — немає або інший тип). */
  export interface GuideType { type: Question['type']; top: string }
  /** Одна сторінка «Як грати» без тексту: тексти складає клієнт. */
  export type GuidePage =
    | { kind: 'phone' }
    | { kind: 'rounds'; rounds: RoundBrief[] }
    | { kind: 'questions'; types: GuideType[] }
    | { kind: 'buffs'; buffs: BuffKind[] }
    | { kind: 'debuffs'; debuffs: DebuffKind[] }
    | { kind: 'duels'; after: number; questions: number; stake: number };
  /** Найбільше типів запитань на одній сторінці. */
  export const GUIDE_TYPES_PER_PAGE = 5;
  /** Чи ввімкнено пояснення для новачків. */
  export function newcomersOn(quiz: Pick<Quiz, 'settings'>): boolean;
  /** Сторінки «Як грати» для цієї вікторини: phone, rounds, questions…, [buffs], [debuffs], [duels]. */
  export function guidePages(quiz: Quiz): GuidePage[];
  ```
- Внутрішнє: ключ виду раунду `${brief.type}:${brief.instant}:${brief.wagerMode}`; пункти — `roundBrief(round)` першого раунду кожного ключа. Типи — `questionsOf(quiz)` у порядку першої появи; `top` — `topLabel` першого `order` з непорожнім `topLabel` (обрізаним `trim`), інакше `''`; для інших типів `''`. `duels`: `after = duelThreshold(quiz)`, `questions = quiz.duels.questionsPerDuel`, `stake = quiz.duels.stake`.

- [ ] **Step 1: Write the failing tests.** У `quiz.test.ts`, у `describe('quizSchema', …)`:
  ```ts
  it('an old quiz without the newcomers flag parses unchanged; the flag is a boolean', () => {
    const old = makeQuizLike(); // наявна в цьому файлі валідна вікторина
    expect(quizSchema.parse(old).settings).toEqual(old.settings);
    expect('newcomers' in quizSchema.parse(old).settings).toBe(false);
    expect(quizSchema.safeParse({ ...old, settings: { ...old.settings, newcomers: true } }).success).toBe(true);
    expect(quizSchema.safeParse({ ...old, settings: { ...old.settings, newcomers: 'так' } }).success).toBe(false);
  });
  ```
  (`makeQuizLike` — ім'я наявної в `quiz.test.ts` фабрики валідної вікторини; якщо такої немає, зібрати мінімальну вікторину з одним класичним раундом прямо в тесті.)

  Новий `packages/engine/src/guide-pages.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { GUIDE_TYPES_PER_PAGE, emptyBrief, guidePages, newcomersOn, roundBrief } from '@quiz/shared';
  import { blitzRound, bool, boardRound, chain, classicRound, duels, finalRound, makeRoundsQuiz, match, multi, numeric, order, single, sortQ, text, withId } from './testing/fixtures';

  const kinds = (quiz: Parameters<typeof guidePages>[0]) => guidePages(quiz).map((page) => page.kind);
  const labelled = { ...order, topLabel: 'Найбільший', bottomLabel: 'Найменший' };

  describe('guidePages', () => {
    it('a plain classic quiz: how to answer, its round and its types; no buffs, no duels', () => {
      const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(bool, 'q2')])], { debuffs: [] });
      expect(guidePages(quiz)).toEqual([
        { kind: 'phone' },
        { kind: 'rounds', rounds: [roundBrief(quiz.rounds[0])] },
        { kind: 'questions', types: [{ type: 'single', top: '' }, { type: 'boolean', top: '' }] },
      ]);
    });

    it('one item per kind of round in order of appearance: two classics are one, an instant and a button blitz are two, a bank final', () => {
      const quiz = makeRoundsQuiz(
        [
          classicRound('r1', [single]),
          blitzRound('b1', [withId(single, 'b1q')]),
          classicRound('r2', [withId(single, 'r2q')]),
          blitzRound('b2', [withId(single, 'b2q')], { check: 'manual' }),
          finalRound('f1', withId(single, 'fq'), { wagerMode: 'bank' }),
        ],
        { debuffs: [] },
      );
      const rounds = guidePages(quiz).find((page) => page.kind === 'rounds');
      expect(rounds?.kind === 'rounds' && rounds.rounds.map((b) => [b.type, b.instant, b.wagerMode])).toEqual([
        ['classic', false, null],
        ['blitz', true, null],
        ['blitz', false, null],
        ['final', false, 'bank'],
      ]);
    });

    it('a board round keeps its brief (dice, voice cells, blitz cells come from it)', () => {
      const cells = (p: string) => [withId(single, `${p}1`), { question: withId(single, `${p}2`), kind: 'blitz' as const }, { question: withId(single, `${p}3`), answerMode: 'voice' as const }];
      const quiz = makeRoundsQuiz([boardRound('g1', [{ title: 'A', cells: cells('a') }, { title: 'B', cells: cells('b') }, { title: 'C', cells: cells('c') }])], { debuffs: [] });
      const rounds = guidePages(quiz)[1];
      expect(rounds).toEqual({ kind: 'rounds', rounds: [{ ...emptyBrief('board'), blitzCells: true, answerModes: ['phone', 'voice'] }] });
    });

    it('question types in order of first appearance, the order label from the quiz, five per page', () => {
      const all = [single, withId(multi, 'm'), withId(bool, 'b'), withId(text, 't'), withId(numeric, 'n'), withId(order, 'o1'), withId(labelled, 'o2'), withId(match, 'p'), withId(chain, 'c'), withId(sortQ, 's')];
      const quiz = makeRoundsQuiz([classicRound('r1', all)], { debuffs: [] });
      const pages = guidePages(quiz).filter((page) => page.kind === 'questions');
      expect(pages.map((page) => page.kind === 'questions' && page.types.length)).toEqual([GUIDE_TYPES_PER_PAGE, 4]);
      const types = pages.flatMap((page) => (page.kind === 'questions' ? page.types : []));
      expect(types.map((x) => x.type)).toEqual(['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'chain', 'sort']);
      // Перший порядок без підпису, другий — з ним: береться перший непорожній.
      expect(types.find((x) => x.type === 'order')?.top).toBe('Найбільший');
    });

    it('spares and duel questions do not add types', () => {
      const quiz = { ...makeRoundsQuiz([classicRound('r1', [single])], { debuffs: [] }), spares: [withId(numeric, 'sp1')], duels };
      const questions = guidePages(quiz).find((page) => page.kind === 'questions');
      expect(questions?.kind === 'questions' && questions.types.map((x) => x.type)).toEqual(['single']);
    });

    it('buffs and debuffs only when allowed; old settings allow all six debuffs', () => {
      const rounds = [classicRound('r1', [single])];
      expect(kinds(makeRoundsQuiz(rounds))).toEqual(['phone', 'rounds', 'questions', 'debuffs']);
      expect(guidePages(makeRoundsQuiz(rounds)).at(-1)).toEqual({ kind: 'debuffs', debuffs: ['shake', 'fog', 'freeze', 'mirror', 'guests', 'mud'] });
      expect(guidePages(makeRoundsQuiz(rounds, { debuffs: ['fog'], buffs: ['double', 'fifty'] })).slice(3)).toEqual([
        { kind: 'buffs', buffs: ['fifty', 'double'] },
        { kind: 'debuffs', debuffs: ['fog'] },
      ]);
    });

    it('duels when the quiz has a pool: after a third of the questions, questions per duel and the stake', () => {
      const quiz = { ...makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2'), withId(single, 'q3'), withId(single, 'q4')])], { debuffs: [] }), duels };
      expect(guidePages(quiz).at(-1)).toEqual({ kind: 'duels', after: 2, questions: duels.questionsPerDuel, stake: duels.stake });
    });

    it('newcomersOn reads the flag; absent is off', () => {
      expect(newcomersOn(makeRoundsQuiz([classicRound('r1', [single])]))).toBe(false);
      expect(newcomersOn(makeRoundsQuiz([classicRound('r1', [single])], { newcomers: true }))).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages`. Очікується FAIL: немає `guidePages`, поле `newcomers` відкидається типом `Partial<QuizSettings>`.

- [ ] **Step 3: Implement** схему й `guide.ts` за Interfaces. `guide.ts` імпортує з `./quiz` (`allowedBuffs`, `allowedDebuffs`, `duelThreshold`, `questionsOf`) і з `./round-brief` (`roundBrief`) — циклу немає (`quiz.ts` не імпортує `guide.ts`). Додати `export * from './guide'` в `index.ts`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared packages/engine/src/guide-pages.test.ts
git commit -m "feat(shared): a «newcomers» quiz setting, off by default, and the «Як грати» pages built from the quiz — how to answer, its kinds of rounds, its question types with the order label, allowed buffs and debuffs, duels"
```

---

### Задача 2. Рушій: етап «Як грати» перед першим раундом

**Files:**
- Modify: `packages/shared/src/game.ts` (`Phase`)
- Modify: `apps/web/src/i18n.ts` (`phase_guide`)
- Modify: `packages/engine/src/game.ts` (`GameState.guidePage`, `createGame`, `start`, `next`, `skipGuide`)
- Modify: `packages/engine/src/testing/helpers.ts` (`lobbyWithGuide`)
- Create: `packages/engine/src/game.guide.test.ts`

**Interfaces:**
- Produces (`shared`): `export type Phase = 'lobby' | 'guide' | 'intro' | …;` (решта без змін).
- Produces (`engine`):
  ```ts
  export interface GameState {
    // …
    /** Сторінка «Як грати» (0-базова); поза етапом guide — 0. */
    guidePage: number;
  }
  /** «Почати гру»: з поясненнями для новачків — етап guide (сторінка 0, без заставки), інакше intro із заставкою, як і раніше. */
  export function start(state: GameState, now?: number): Result;
  /** «До гри»: з будь-якої сторінки «Як грати» — у перший раунд, із заставкою раунду. */
  export function skipGuide(state: GameState, now: number): Result;
  // testing/helpers.ts
  /** Лобі вікторини з поясненнями для новачків (settings.newcomers = true), гравці p1, p2, … */
  export function lobbyWithGuide(quiz: Quiz, ...nicknames: string[]): GameState;
  ```
- Внутрішнє (`game.ts`):
  ```ts
  /** Перший раунд: те, що start робив до 8d (стан intro першого раунду вже готовий), плюс заставка раунду. */
  function enterFirstRound(state: GameState, now?: number): GameState {
    return roundSplash({ ...state, phase: 'intro', guidePage: 0 }, now);
  }
  export function start(state: GameState, now?: number): Result {
    if (state.phase !== 'lobby') return fail('wrong_phase');
    if (state.players.length === 0) return fail('no_players');
    const ready = enterRound({ ...state, roundIndex: 0 });
    return ok(newcomersOn(state.quiz) ? { ...ready, phase: 'guide', guidePage: 0 } : enterFirstRound(ready, now));
  }
  ```
  `next`: `case 'guide': return ok(state.guidePage + 1 < guidePages(state.quiz).length ? { ...state, guidePage: state.guidePage + 1 } : enterFirstRound(state, now));` — гілка стоїть після перевірки `paused` і **до** `duelDue` (дуель на `guide` неможлива, але порядок робить це явним). `skipGuide`: `paused` → `fail('paused')`; `phase !== 'guide'` → `fail('wrong_phase')`; інакше `ok(enterFirstRound(state, now))`.
- `pause`, `resume`, `end`, `removePlayer`, `setConnected` змін не потребують: `guide` не має годинника, `IN_ROUND` (для `endRound`) його не містить. `phase_guide: 'Як грати'` в `i18n.ts`.

- [ ] **Step 1: Write the failing tests** у `game.guide.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { guidePages } from '@quiz/shared';
  import { end, endRound, next, pause, resume, skipGuide, start, submitAnswer, type GameState } from './game';
  import { boardRound, classicRound, finalRound, makeRoundsQuiz, single, withId } from './testing/fixtures';
  import { lobbyWith, lobbyWithGuide, lobbyWithSplash, must } from './testing/helpers';

  const T0 = 1_000_000;
  const rng0 = () => 0;
  // phone, rounds, questions, debuffs (старі налаштування — усі дебафи): 4 сторінки.
  const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')]), finalRound('f1', withId(single, 'fq'))], { newcomers: true });
  const withSplashes = (s: GameState): GameState => ({ ...s, transitions: true });

  describe('the «Як грати» phase', () => {
    it('without the flag the game starts as before', () => {
      const plain = must(start(lobbyWithSplash(makeRoundsQuiz([classicRound('r1', [single])]), 'Анна'), T0));
      expect([plain.phase, plain.guidePage, plain.splash?.kind]).toEqual(['intro', 0, 'round']);
    });

    it('with the flag «Почати гру» opens page 0 without a splash; the first round is already set up', () => {
      const s = must(start(withSplashes(lobbyWithGuide(quiz, 'Анна', 'Богдан')), T0));
      expect([s.phase, s.guidePage, s.roundIndex, s.splash]).toEqual(['guide', 0, 0, null]);
      expect(guidePages(s.quiz)).toHaveLength(4);
    });

    it('«Далі» pages forward; on the last page it leaves the guide with the round splash', () => {
      let s = must(start(withSplashes(lobbyWithGuide(quiz, 'Анна')), T0));
      for (const page of [1, 2, 3]) {
        s = must(next(s, T0 + page * 1000, rng0));
        expect([s.phase, s.guidePage]).toEqual(['guide', page]);
      }
      s = must(next(s, T0 + 10_000, rng0));
      expect([s.phase, s.guidePage]).toEqual(['intro', 0]);
      expect(s.splash).toEqual({ kind: 'round', at: T0 + 10_000, until: T0 + 12_500 });
    });

    it('leaving the guide plays the round splash — «Фінал» when the first round is a final; a board round keeps its fresh turn order', () => {
      const finalFirst = makeRoundsQuiz([finalRound('f1', single)], { newcomers: true });
      const s = must(skipGuide(must(start(withSplashes(lobbyWithGuide(finalFirst, 'Анна')), T0)), T0 + 500));
      expect([s.phase, s.splash?.kind]).toEqual(['intro', 'final']);
      const cells = (p: string) => [withId(single, `${p}1`), withId(single, `${p}2`), withId(single, `${p}3`)];
      const board = makeRoundsQuiz([boardRound('g1', [{ title: 'A', cells: cells('a') }, { title: 'B', cells: cells('b') }, { title: 'C', cells: cells('c') }])], { newcomers: true });
      const guided = must(skipGuide(must(start(lobbyWithGuide(board, 'Анна', 'Богдан'))), T0));
      const direct = must(start(lobbyWith({ ...board, settings: { ...board.settings, newcomers: undefined } }, 'Анна', 'Богдан')));
      expect(guided.board).toEqual(direct.board);
    });

    it('«До гри» skips from any page; outside the guide it is wrong_phase', () => {
      const first = must(start(lobbyWithGuide(quiz, 'Анна')));
      const s = must(skipGuide(must(next(first, T0, rng0)), T0 + 100));
      expect(s.phase).toBe('intro');
      expect(skipGuide(s, T0 + 200)).toEqual({ ok: false, error: 'wrong_phase' });
      expect(skipGuide(lobbyWithGuide(quiz, 'Анна'), T0)).toEqual({ ok: false, error: 'wrong_phase' });
    });

    it('pause and end work in the guide; end-round does not; paging waits for resume', () => {
      const s = must(start(lobbyWithGuide(quiz, 'Анна')));
      const paused = must(pause(s, T0));
      expect(next(paused, T0 + 1, rng0)).toEqual({ ok: false, error: 'paused' });
      expect(skipGuide(paused, T0 + 1)).toEqual({ ok: false, error: 'paused' });
      const resumed = must(resume(paused, T0 + 5000));
      expect([resumed.phase, resumed.guidePage, resumed.paused]).toEqual(['guide', 0, false]);
      expect(endRound(s, T0)).toEqual({ ok: false, error: 'wrong_phase' });
      expect(must(end(withSplashes(s), T0)).phase).toBe('finished');
    });

    it('nothing can be answered in the guide; the first question opens only after the round intro', () => {
      let s = must(start(lobbyWithGuide(quiz, 'Анна')));
      expect(submitAnswer(s, 'p1', { type: 'single', optionId: 'b' }, T0).ok).toBe(false);
      s = must(next(must(skipGuide(s, T0)), T0 + 100, rng0));
      expect(s.phase).toBe('question');
    });
  });
  ```
  (`settings.newcomers: undefined` у тесті з полем — допустимий запис для `optional()`; якщо `exactOptionalPropertyTypes` увімкнено, зібрати налаштування без ключа деструктуризацією.)

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL: немає `skipGuide`, `lobbyWithGuide`, `guidePage`.

- [ ] **Step 3: Implement** за Interfaces; `createGame` — `guidePage: 0`. `lobbyWithGuide(quiz, …names)` = `lobbyWith({ ...quiz, settings: { ...quiz.settings, newcomers: true } }, …names)`. `phase_guide` в `i18n.ts`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS (наявні тести — без змін очікувань: без прапорця `start` той самий).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/game.ts packages/engine apps/web/src/i18n.ts
git commit -m "feat(engine): with explanations on, «Почати гру» opens «Як грати» — the host pages it with «Далі» or skips with «До гри», and only then the first round splash plays; pause and ending the game still work"
```

---

### Задача 3. Зрізи: сторінки «Як грати», прапорець і підказка нового типу

**Files:**
- Modify: `packages/shared/src/views.ts` (`GuideView`, `BaseView.guide`, `BaseView.newcomers`, `PlayerView.me.tip`)
- Modify: `packages/engine/src/views.ts` (`baseView`, `playerView`, нова `typeTip`)
- Create: `packages/engine/src/views.guide.test.ts`
- Modify (механічно): `apps/web/src/screens/StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `HostScreen.test.tsx`, `DuelView.test.tsx`, `apps/web/src/live/Splash.test.tsx` — у фабриках `guide: null`, `newcomers: false`; у `me` — `tip: null`

**Interfaces:**
- Produces (`shared`):
  ```ts
  /** «Як грати»: поточна сторінка й усі сторінки цієї вікторини. */
  export interface GuideView { page: number; pages: GuidePage[] }
  interface BaseView {
    // …
    /** Етап guide: сторінки й поточна; інакше null. */
    guide: GuideView | null;
    /** Пояснення для новачків увімкнено (пам'ятка раунду на intro). */
    newcomers: boolean;
  }
  // PlayerView.me
  /** Тип поточного запитання, якщо воно перше такого типу в грі й гравець відповідає з телефона; лише етап question і з поясненнями. Інакше null. */
  tip: Question['type'] | null;
  ```
- Внутрішнє (`engine/views.ts`):
  ```ts
  /** Підказка нового типу для гравця: див. рішення плану. */
  function typeTip(state: GameState, playerId: string): Question['type'] | null {
    if (!newcomersOn(state.quiz) || state.phase !== 'question') return null;
    const play = state.plays[state.questionIndex];
    if (play === undefined) return null;
    if (play.board !== undefined && (play.board.answerMode === 'voice' || (play.board.kind === 'normal' && play.board.chooserId !== playerId))) return null;
    const type = play.question.type;
    return state.plays.slice(0, state.questionIndex).some((p) => p.question.type === type) ? null : type;
  }
  ```
  `baseView`: `guide: state.phase === 'guide' ? { page: state.guidePage, pages: guidePages(state.quiz) } : null`, `newcomers: newcomersOn(state.quiz)`. `playerView`: `me.tip: typeTip(state, playerId)`. Запасне запитання (`ownSpare`) на `tip` не впливає — ховає клієнт (задача 7).

- [ ] **Step 1: Write the failing tests** у `views.guide.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { guidePages } from '@quiz/shared';
  import { lock, next, start, submitAnswer, type GameState } from './game';
  import { pickCell } from './board';
  import { boardRound, bool, classicRound, makeRoundsQuiz, order, single, withId } from './testing/fixtures';
  import { lobbyWith, lobbyWithGuide, must } from './testing/helpers';
  import { hostView, playerView, stageView } from './views';

  const T0 = 1_000_000;
  const rng0 = () => 0;
  const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(order, 'o1'), withId(single, 'q3'), withId(bool, 'b1')])], { newcomers: true });
  /** «Почати гру» → «До гри» через усі сторінки → перше запитання. */
  const firstQuestion = (s: GameState) => {
    let at = must(start(s));
    while (at.phase === 'guide') at = must(next(at, T0, rng0));
    return must(next(at, T0, rng0));
  };
  /** Закрити, розкрити й відкрити наступне запитання. */
  const nextQuestion = (s: GameState, now: number) => must(next(must(next(must(lock(s)), now, rng0)), now, rng0));

  describe('guide views', () => {
    it('every role sees the guide page and all pages during the guide', () => {
      const s = must(next(must(start(lobbyWithGuide(quiz, 'Анна'))), T0, rng0));
      const pages = guidePages(s.quiz);
      for (const view of [stageView(s), hostView(s), playerView(s, 'p1')]) {
        expect(view?.phase).toBe('guide');
        expect(view?.guide).toEqual({ page: 1, pages });
        expect(view?.newcomers).toBe(true);
      }
    });

    it('nothing new is shown without the flag', () => {
      const s = must(next(must(start(lobbyWith(makeRoundsQuiz([classicRound('r1', [single])]), 'Анна'))), T0, rng0));
      expect([stageView(s).guide, stageView(s).newcomers, playerView(s, 'p1')?.me.tip]).toEqual([null, false, null]);
    });

    it('the first question of each type carries a tip; a repeated type does not', () => {
      let s = firstQuestion(lobbyWithGuide(quiz, 'Анна', 'Богдан'));
      expect(playerView(s, 'p1')?.me.tip).toBe('single');
      s = nextQuestion(s, T0 + 30_000);
      expect(playerView(s, 'p2')?.me.tip).toBe('order');
      s = nextQuestion(s, T0 + 60_000);
      expect(playerView(s, 'p1')?.me.tip).toBeNull(); // single уже був
      s = nextQuestion(s, T0 + 90_000);
      expect(playerView(s, 'p1')?.me.tip).toBe('boolean');
      expect(playerView(must(lock(s)), 'p1')?.me.tip).toBeNull(); // лише на етапі question
    });

    it('the tip does not touch the clock and answering still works', () => {
      const s = firstQuestion(lobbyWithGuide(quiz, 'Анна'));
      expect([s.startedAt, s.endsAt]).toEqual([T0, T0 + 20_000]);
      expect(submitAnswer(s, 'p1', { type: 'single', optionId: 'b' }, T0 + 10).ok).toBe(true);
    });

    it('on the board only the chooser of a normal cell gets the tip, and nobody on a voice cell', () => {
      const cells = (p: string) => [withId(single, `${p}1`), { question: withId(bool, `${p}2`), answerMode: 'voice' as const }, withId(single, `${p}3`)];
      const board = makeRoundsQuiz([boardRound('g1', [{ title: 'A', cells: cells('a') }, { title: 'B', cells: cells('b') }, { title: 'C', cells: cells('c') }])], { newcomers: true });
      let s = must(start(lobbyWithGuide(board, 'Анна', 'Богдан')));
      while (s.phase === 'guide') s = must(next(s, T0, rng0));
      s = must(next(s, T0, rng0)); // intro → поле
      const opened = must(pickCell(s, 'p1', 'a1', T0, rng0));
      expect([playerView(opened, 'p1')?.me.tip, playerView(opened, 'p2')?.me.tip]).toEqual(['single', null]);
      const voice = must(pickCell(s, 'p1', 'a2', T0, rng0));
      expect([playerView(voice, 'p1')?.me.tip, playerView(voice, 'p2')?.me.tip]).toEqual([null, null]);
    });
  });
  ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL: немає `guide`, `newcomers`, `me.tip`.

- [ ] **Step 3: Implement** за Interfaces; у п'ять веб-фабрик додати `guide: null`, `newcomers: false`, у `me` — `tip: null`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/views.ts packages/engine apps/web/src
git commit -m "feat(views): the guide page and all pages for every role, a newcomers flag, and a tip type on the phone for the first question of each type — only for those who answer it from the phone"
```

---

### Задача 4. Сервер: «До гри» (`host:guide-skip`)

**Files:**
- Modify: `packages/shared/src/events.ts` (`'host:guide-skip'`)
- Modify: `apps/server/src/rooms/manager.ts` (`HostAction` + `'guide-skip'`, гілка в `host`)
- Modify: `apps/server/src/socket.ts` (`SIMPLE_HOST_ACTIONS` + `'guide-skip'`)
- Modify: `apps/server/src/rooms/manager.test.ts`, `apps/server/src/socket.test.ts`

**Interfaces:**
- Produces (`shared`): у `ClientToServerEvents` — `/** «До гри»: пропустити решту «Як грати». */ 'host:guide-skip': (ack: Ack) => void;`
- `manager.host`: `case 'guide-skip': return this.apply(room, skipGuide(state, this.now()));`

- [ ] **Step 1: Write the failing tests.** У `manager.test.ts`:
  ```ts
  describe('«Як грати»', () => {
    it('start opens the guide for a quiz with explanations; next pages, guide-skip leaves; plain quizzes start as before', () => {
      const { manager } = setup();
      const room = manager.create(makeRoundsQuiz([classicRound('r1', [single])], { newcomers: true }));
      manager.connect(room, HOST);
      enter(manager, room, 'Олена');
      expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
      expect([room.state.phase, room.state.guidePage]).toEqual(['guide', 0]);
      expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
      expect(room.state.guidePage).toBe(1);
      expect(manager.host(room, { type: 'guide-skip' })).toEqual({ ok: true });
      expect(room.state.phase).toBe('intro');
      expect(manager.host(room, { type: 'guide-skip' })).toEqual({ ok: false, error: 'wrong_phase' });

      const plain = playing();
      expect(plain.room.state.phase).toBe('question');
    });
  });
  ```
  У `socket.test.ts` (за зразком наявних тестів `host:start`): гра з вікториною `{ newcomers: true }`; `send(host, 'host:start')` → `ok`; стан сцени — `phase: 'guide'`, `guide.page: 0`; `send(olena, 'host:guide-skip')` → `{ ok: false, error: 'forbidden' }`; `send(host, 'host:guide-skip')` → `ok`, сцена отримує `phase: 'intro'`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server`. Очікується FAIL: немає `guide-skip`.

- [ ] **Step 3: Implement** за Interfaces (імпорт `skipGuide` з `@quiz/engine`).

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/events.ts apps/server/src
git commit -m "feat(server): «До гри» — host:guide-skip leaves «Як грати» for the first round; only the host can send it"
```

---

### Задача 5. Тексти пояснень: сторінки, пам'ятка раунду, рядок типу

**Files:**
- Create: `apps/web/src/guide-text.ts`
- Create: `apps/web/src/guide-text.test.ts`
- Modify: `apps/web/src/i18n.ts`

**Interfaces:**
- Produces (`web`):
  ```ts
  import type { GuidePage, Question, RoundBrief } from '@quiz/shared';
  /** Пункт сторінки: значок (лише сцена), назва, рядок; details — додаткові рядки сцени (бали раунду). */
  export interface GuideItem { icon: string; name: string; line: string; details: string[] }
  export interface GuideText { title: string; lead: string[]; items: GuideItem[] }
  /** Заголовок, вступні рядки й пункти сторінки «Як грати». */
  export function guidePageText(page: GuidePage): GuideText;
  /** Як проходить раунд — 1 рядок (у фіналі 2: ставка і режим ставок для сторінки rounds; пам'ятка бере лише перший). */
  export function roundHow(brief: RoundBrief): string[];
  /** Як відповідати на запитання цього типу; top — підпис верху порядку ('' — немає). */
  export function typeHow(type: Question['type'], top?: string): string;
  ```
- Значки: раунди — `classic` «❓», `blitz` «⚡», `board` «▦», `final` «🏆»; типи — `single` «◉», `multi` «☑», `boolean` «✓✗», `text` «Аа», `numeric` «123», `order` «↕», `match` «⇆», `chain` «⛓», `sort` «▤»; бафи — `BUFF_ICONS`, дебафи — `DEBUFF_ICONS`; сторінки `phone` і `duels` — пункти без значка (`icon: ''`).
- Пункти: `rounds` — назва `roundTypeClassic` / `roundTypeBlitz` / `roundTypeBoard` / `roundTypeFinal`, `line` = `roundHow(brief).join(' ')`, `details` = `roundSummary(brief)`; `questions` — назва `type_<type>`, `line` = `typeHow(type, top)`; `buffs` — `buffName(kind)` і `buffGuide_<kind>`; `debuffs` — `debuffName(kind)` і `debuffGuide_<kind>`; `phone` і `duels` — без пунктів, лише `lead`.
- Тексти (`i18n.ts`):
  ```ts
  guideTitle: 'Як грати',
  guidePageOf: '{index} з {total}',
  guideToGame: 'До гри',
  guidePhonesToo: 'Те саме — у ваших телефонах',
  guidePhoneTitle: 'Відповідайте з телефона',
  guidePhoneSee: 'Запитання — на великому екрані й у вашому телефоні.',
  guidePhoneAnswer: 'Відповідайте в телефоні, поки йде таймер: торкніться варіанта або введіть відповідь і натисніть «Відповісти».',
  guidePhoneScore: 'Правильну відповідь і бали покаже ведучий; ваш рахунок — угорі телефона.',
  guideRoundsTitle: 'Раунди цієї гри',
  guideQuestionsTitle: 'Типи запитань',
  guideBuffsTitle: 'Бафи — ваші допомоги',
  guideBuffsLead: 'У кожного по одному кожного бафу на всю гру. Кнопки — під запитанням у телефоні: один баф на запитання, до відповіді.',
  guideBuffsWhere: 'У бліці, дуелях і фіналі бафів немає.',
  guideDebuffsTitle: 'Дебафи від ведучого',
  guideDebuffsLead: 'Ведучий може наслати на гравця перешкоду на одне запитання. Відповідати однаково можна.',
  guideDuelsTitle: 'Дуелі',
  guideDuelsWhen: 'Після {count} запитань у шапці телефона з’явиться кнопка «⚔ Дуель».',
  guideDuelsHow: 'Викличте суперника — відмовитися не можна. Одна дуель на гравця за гру.',
  guideDuelsWin: 'Запитань у дуелі: {count}. За кожне бал отримує той, хто першим відповість правильно.',
  guideDuelsStake: 'Переможець забирає в суперника {stake} балів.',
  roundHowTitle: 'Як проходить раунд',
  roundHow_classic: 'Запитання йдуть по черзі; кожен відповідає у своєму телефоні.',
  roundHow_blitz: 'Знаєте відповідь — тисніть «Відповісти» й відповідайте; бали отримує перший правильний.',
  roundHow_blitzInstant: 'Відповідайте одразу в телефоні: бали отримує той, хто першим відповість правильно.',
  roundHow_board: 'Спершу черга: кожен кидає кубик у телефоні (або порядок задає ведучий). У свій хід виберіть клітинку — категорію й ціну.',
  roundHow_final: 'Спершу таємна ставка в телефоні — від 0 до вашого рахунку, потім одне запитання для всіх.',
  typeHow_single: 'Торкніться одного правильного варіанта.',
  typeHow_multi: 'Позначте всі правильні варіанти й натисніть «Відповісти».',
  typeHow_boolean: 'Торкніться «Так» або «Ні».',
  typeHow_text: 'Введіть відповідь і натисніть «Відповісти».',
  typeHow_numeric: 'Введіть число й натисніть «Відповісти».',
  typeHow_order: 'Розставте рядки стрілками ↑ ↓ і натисніть «Відповісти».',
  typeHow_orderTop: 'Розставте рядки стрілками ↑ ↓: зверху — {top}.',
  typeHow_match: 'Складіть пари: торкніться елемента ліворуч, потім праворуч.',
  typeHow_chain: 'Вгадуйте приховані слова по черзі, кожне пов’язане з попереднім. Підказка відкриває літеру, але додає секунди.',
  typeHow_sort: 'Розкладіть слова по категоріях: перетягніть картку або торкніться категорії. Помилка ненадовго зупиняє.',
  buffGuide_fifty: 'Прибирає половину неправильних варіантів.',
  buffGuide_double: 'Подвоює бали за це запитання.',
  buffGuide_retry: 'Помилилися — ще одна спроба.',
  buffGuide_time: 'Ще 30 секунд лише вам.',
  buffGuide_shield: 'Помилка не знімає балів.',
  buffGuide_audience: 'Інші гравці підказують, як думають.',
  buffGuide_hint: 'Підказка від ведучого лише вам.',
  buffGuide_swap: 'Інше запитання замість цього.',
  debuffGuide_shake: 'Екран тремтить.',
  debuffGuide_fog: 'Туман — протріть екран пальцем.',
  debuffGuide_freeze: 'Лід ненадовго закриває екран.',
  debuffGuide_mirror: 'Варіанти переставляються по колу.',
  debuffGuide_guests: 'Екраном ходять гості.',
  debuffGuide_mud: 'Плями бруду — протріть пальцем.',
  ```
  `roundHow`: `classic` → `[roundHow_classic]`; `blitz` → `[brief.instant ? roundHow_blitzInstant : roundHow_blitz]`; `board` → `[roundHow_board]`; `final` → `[roundHow_final, t(brief.wagerMode === 'bank' ? 'summaryFinalBank' : 'summaryFinalScore')]`. `phone` — `lead` з трьох рядків `guidePhoneSee/Answer/Score`. `buffs` — `lead` `[guideBuffsLead, guideBuffsWhere]`. `duels` — `lead` `[guideDuelsWhen, guideDuelsHow, guideDuelsWin]` + `guideDuelsStake`, лише якщо `stake > 0`. `typeHow('order', top)`: `top.trim() !== ''` → `typeHow_orderTop` з `top` у якому перша літера мала (`toLocaleLowerCase('uk')` лише для першого символу), інакше `typeHow_order`.

- [ ] **Step 1: Write the failing tests** у `guide-text.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { emptyBrief, type GuidePage } from '@quiz/shared';
  import { guidePageText, roundHow, typeHow } from './guide-text';
  import { roundSummary } from './round-summary';

  describe('guide texts', () => {
    it('the order line uses the quiz label in lower case; without a label it says how to submit', () => {
      expect(typeHow('order', 'Найбільший')).toBe('Розставте рядки стрілками ↑ ↓: зверху — найбільший.');
      expect(typeHow('order', '')).toBe('Розставте рядки стрілками ↑ ↓ і натисніть «Відповісти».');
      expect(typeHow('single')).toBe('Торкніться одного правильного варіанта.');
    });

    it('every question type has a line', () => {
      for (const type of ['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'chain', 'sort'] as const) expect(typeHow(type).length).toBeGreaterThan(10);
    });

    it('how each round works: an instant blitz differs, the final adds the wager mode', () => {
      expect(roundHow(emptyBrief('classic'))).toEqual(['Запитання йдуть по черзі; кожен відповідає у своєму телефоні.']);
      expect(roundHow({ ...emptyBrief('blitz'), instant: true })[0]).toContain('Відповідайте одразу');
      expect(roundHow(emptyBrief('board'))[0]).toContain('кубик');
      expect(roundHow({ ...emptyBrief('final'), wagerMode: 'bank' })).toEqual([
        'Спершу таємна ставка в телефоні — від 0 до вашого рахунку, потім одне запитання для всіх.',
        'Хто помилився або не відповів, віддає ставку в спільний банк; хто відповів правильно, зберігає свою й ділить банк пропорційно ставкам.',
      ]);
    });

    it('a rounds page lists each kind with its scoring lines; a questions page uses the label', () => {
      const brief = { ...emptyBrief('classic'), speedBonus: true };
      const rounds = guidePageText({ kind: 'rounds', rounds: [brief] });
      expect(rounds.title).toBe('Раунди цієї гри');
      expect(rounds.items).toEqual([{ icon: '❓', name: 'Класичний', line: roundHow(brief).join(' '), details: roundSummary(brief) }]);
      const questions = guidePageText({ kind: 'questions', types: [{ type: 'order', top: 'Найбільший' }] });
      expect(questions.items[0]).toMatchObject({ name: 'Впорядкування', line: 'Розставте рядки стрілками ↑ ↓: зверху — найбільший.' });
    });

    it('buffs, debuffs, the phone page and duels', () => {
      expect(guidePageText({ kind: 'buffs', buffs: ['fifty'] }).items).toEqual([{ icon: '½', name: '50/50', line: 'Прибирає половину неправильних варіантів.', details: [] }]);
      expect(guidePageText({ kind: 'debuffs', debuffs: ['fog'] }).items[0]).toMatchObject({ name: 'Туман' });
      expect(guidePageText({ kind: 'phone' }).lead).toHaveLength(3);
      const duel = (stake: number): GuidePage => ({ kind: 'duels', after: 4, questions: 3, stake });
      expect(guidePageText(duel(300)).lead).toContain('Переможець забирає в суперника 300 балів.');
      expect(guidePageText(duel(0)).lead.join(' ')).not.toContain('забирає');
      expect(guidePageText(duel(0)).lead[0]).toBe('Після 4 запитань у шапці телефона з’явиться кнопка «⚔ Дуель».');
    });
  });
  ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web`. Очікується FAIL: немає `guide-text.ts`.

- [ ] **Step 3: Implement** `guide-text.ts` і тексти за Interfaces (`buffName`/`BUFF_ICONS` з `./buff-meta`, `debuffName`/`DEBUFF_ICONS` з `./debuff-meta`, `roundSummary` з `./round-summary`).

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/guide-text.ts apps/web/src/guide-text.test.ts apps/web/src/i18n.ts
git commit -m "feat(web): texts for «Як грати» — how to answer, how each kind of round goes, a line per question type with the quiz order label, buffs, debuffs and duels"
```

---

### Задача 6. Екрани «Як грати»: сцена, телефон, пульт

**Files:**
- Create: `apps/web/src/live/Guide.tsx`
- Create: `apps/web/src/live/Guide.test.tsx`
- Modify: `apps/web/src/screens/StageScreen.tsx`, `PlayerScreen.tsx`, `HostScreen.tsx`
- Modify: `apps/web/src/screens/StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `HostScreen.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Produces (`web`):
  ```ts
  /** Сторінка «Як грати»: stage — заголовок, номер, пункти зі значками й рядками балів, «Те саме — у ваших телефонах»; phone — заголовок, номер, назви й рядки; host — заголовок, номер і назви пунктів. */
  export function GuidePageView({ guide, size }: { guide: GuideView; size: 'stage' | 'phone' | 'host' }): JSX.Element;
  ```
- Розмітка: `<section className={`guide is-${size}`} aria-labelledby="guide-title">` → `<p className="guide-kicker">Як грати · {index} з {total}</p>`, `<h1 id="guide-title" className="guide-title">`, `lead` — `<p className="guide-lead">` на кожен рядок, пункти — `<ul className="guide-items">` з `<li className="guide-item">` (`.guide-icon` лише на сцені, `.guide-name`, `.guide-line`, `.guide-details` лише на сцені), підвал сцени `.guide-phones`. Номер сторінки — `guidePageOf` з `index = page + 1`, `total = pages.length`.
- Сцена: `{phase === 'guide' && view.guide !== null && <GuidePageView guide={view.guide} size="stage" />}`. Телефон: те саме з `size="phone"` під шапкою. Пульт: `MAIN_ACTION.guide = { label: 'next', event: 'host:next' }`; на останній сторінці підпис `guideToGame` (подія та сама `host:next`); поки сторінка не остання — друга кнопка `guideToGame` з подією `host:guide-skip` (`btn`, ліворуч від головної); над кнопками — `<GuidePageView size="host" />`. На паузі обидві кнопки сховані (як головна зараз). `IN_ROUND` пульта не змінюється (без «Завершити раунд»), «Завершити гру» і «Пауза» є (`live`).
- Стилі: `.guide.is-stage` — сітка пунктів `grid-template-columns: repeat(2, minmax(0, 1fr))`, заголовок `clamp(2.5rem, 5vw, 4.5rem)`, рядки `clamp(1.1rem, 1.6vw, 1.5rem)`, усе вміщується в 1280 × 720 (8 бафів — 4 ряди по 2); `.guide.is-phone` — одна колонка, `overflow-wrap: anywhere`; `.guide-icon` — `--guide-accent`. Анімацій появи немає.

- [ ] **Step 1: Write the failing tests.** `live/Guide.test.tsx`:
  ```tsx
  // @vitest-environment jsdom
  import { cleanup, render, screen } from '@testing-library/react';
  import { afterEach, describe, expect, it } from 'vitest';
  import { emptyBrief, type GuideView } from '@quiz/shared';
  import { GuidePageView } from './Guide';

  afterEach(cleanup);
  const guide: GuideView = {
    page: 1,
    pages: [{ kind: 'phone' }, { kind: 'rounds', rounds: [{ ...emptyBrief('classic'), speedBonus: true }, { ...emptyBrief('final'), wagerMode: 'classic' }] }, { kind: 'questions', types: [{ type: 'order', top: 'Найбільший' }] }],
  };

  describe('GuidePageView', () => {
    it('the stage shows the page number, items with icons and scoring lines and a note about phones', () => {
      render(<GuidePageView guide={guide} size="stage" />);
      expect(screen.getByRole('heading', { name: 'Раунди цієї гри' })).toBeTruthy();
      expect(screen.getByText('Як грати · 2 з 3')).toBeTruthy();
      expect(screen.getByText('Класичний')).toBeTruthy();
      expect(screen.getByText('Фінал')).toBeTruthy();
      expect(screen.getByText('Якщо є таймер, швидша правильна відповідь дає більше балів.')).toBeTruthy();
      expect(document.querySelectorAll('.guide-icon')).toHaveLength(2);
      expect(screen.getByText('Те саме — у ваших телефонах')).toBeTruthy();
    });

    it('the phone shows the same page shorter: names and lines, no icons, no scoring lines', () => {
      render(<GuidePageView guide={guide} size="phone" />);
      expect(screen.getByRole('heading', { name: 'Раунди цієї гри' })).toBeTruthy();
      expect(screen.getByText('Класичний')).toBeTruthy();
      expect(document.querySelector('.guide-icon')).toBeNull();
      expect(screen.queryByText('Якщо є таймер, швидша правильна відповідь дає більше балів.')).toBeNull();
      expect(screen.queryByText('Те саме — у ваших телефонах')).toBeNull();
    });
  });
  ```
  `HostScreen.test.tsx`:
  ```tsx
  describe('HostScreen: «Як грати»', () => {
    const guide = { page: 0, pages: [{ kind: 'phone' as const }, { kind: 'questions' as const, types: [{ type: 'single' as const, top: '' }] }] };
    it('the host pages the guide and can skip it', () => {
      const send = show(view({ phase: 'guide', guide, newcomers: true }));
      expect(screen.getByText('Відповідайте з телефона')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Далі' }));
      expect(send).toHaveBeenCalledWith('host:next');
      fireEvent.click(screen.getByRole('button', { name: 'До гри' }));
      expect(send).toHaveBeenCalledWith('host:guide-skip');
      expect(screen.queryByRole('button', { name: 'Завершити раунд' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Пауза' })).toBeTruthy();
    });
    it('on the last page the main button says «До гри» and there is no second one', () => {
      const send = show(view({ phase: 'guide', guide: { ...guide, page: 1 }, newcomers: true }));
      const buttons = screen.getAllByRole('button', { name: 'До гри' });
      expect(buttons).toHaveLength(1);
      fireEvent.click(buttons[0]);
      expect(send).toHaveBeenCalledWith('host:next');
    });
    it('paused: neither button', () => {
      show(view({ phase: 'guide', guide, newcomers: true, paused: true }));
      expect(screen.queryByRole('button', { name: 'Далі' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'До гри' })).toBeNull();
    });
  });
  ```
  (Як саме `send` викликається — подивитися наявні тести головної кнопки в цьому файлі й перевіряти тим самим способом, наприклад `toHaveBeenCalledWith('host:next', …)`, якщо `send` отримує другий аргумент.)
  `StageScreen.test.tsx`: `show(view({ phase: 'guide', guide }))` → заголовок сторінки є, `.splash` немає, лобі немає. `PlayerScreen.test.tsx`: `show(view({ phase: 'guide', guide }))` → заголовок сторінки, `.guide.is-phone`, рядок «Ви в грі. Чекаємо на старт.» (`inLobby`) не показано.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web`. Очікується FAIL.

- [ ] **Step 3: Implement** за Interfaces.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): «Як грати» on the stage, phones and host console — the same page everywhere, shorter on the phone; the host has «Далі» and «До гри», pause and ending the game"
```

---

### Задача 7. Пам'ятка перед раундом і рядок нового типу на телефоні

**Files:**
- Modify: `apps/web/src/screens/RoundBriefing.tsx` (`newcomers`)
- Modify: `apps/web/src/screens/StageScreen.tsx`, `PlayerScreen.tsx`, `HostScreen.tsx` (передати `newcomers`; `TypeTip` на телефоні)
- Modify: `apps/web/src/screens/StageScreen.test.tsx`, `PlayerScreen.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- `RoundBriefing({ brief, description, newcomers = false })`: якщо `newcomers` — перед списком балів `<div className="round-brief-how"><h2>{t('roundHowTitle')}</h2><p>{roundHow(brief)[0]}</p></div>`. Сцена (обидва місця, де зараз `RoundBriefing`), телефон і пульт передають `newcomers={view.newcomers}`. Редактор не передає (типово `false`).
- `PlayerScreen`: `const tip = me.tip !== null && activeBuff?.spare !== true ? typeHow(me.tip, question.orderLabels?.top ?? '') : null;` — рядок `<p className="type-tip" role="note">💡 {tip}</p>` одразу перед `DebuffZone` (над текстом запитання), поки `phase === 'question'`. Нічого не блокує: поля відповіді, бафи й таймер не залежать від `tip`.
- Стилі: `.type-tip` — `--tip-bg`, `font-size: 0.95rem`, `overflow-wrap: anywhere`, без анімації; `.round-brief-how` — акцентна рамка ліворуч.

- [ ] **Step 1: Write the failing tests.** `PlayerScreen.test.tsx`:
  ```tsx
  describe('PlayerScreen: explanations for newcomers', () => {
    it('the tip sits above the question and answering still works', () => {
      const send = show(onQuestion({ newcomers: true, me: { ...me, tip: 'single' } }));
      const tip = screen.getByRole('note');
      expect(tip.textContent).toContain('Торкніться одного правильного варіанта.');
      const heading = screen.getByRole('heading', { name: 'Столиця України?' });
      expect(tip.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /Київ/ }));
      expect(send).toHaveBeenCalledWith('player:answer', { type: 'single', optionId: 'b' });
    });
    it('the order tip uses the label of this question', () => {
      const ordered = { ...publicQuestion, type: 'order' as const, orderLabels: { top: 'Найбільший', bottom: 'Найменший' } };
      show(onQuestion({ newcomers: true, question: ordered, me: { ...me, tip: 'order' } }));
      expect(screen.getByRole('note').textContent).toContain('зверху — найбільший');
    });
    it('no tip without one in the view', () => {
      show(onQuestion({ newcomers: true }));
      expect(screen.queryByRole('note')).toBeNull();
    });
    it('the round intro has a reminder only with explanations on', () => {
      const round: RoundInfo = { index: 0, total: 2, title: 'Розминка', type: 'classic', partial: false, description: '', brief: emptyBrief('classic'), times: null };
      show(view({ phase: 'intro', round, newcomers: true }));
      expect(screen.getByText('Як проходить раунд')).toBeTruthy();
      expect(screen.getByText('Запитання йдуть по черзі; кожен відповідає у своєму телефоні.')).toBeTruthy();
      cleanup();
      show(view({ phase: 'intro', round }));
      expect(screen.queryByText('Як проходить раунд')).toBeNull();
    });
  });
  ```
  (Як саме `send` отримує відповідь — за наявними тестами відповіді в цьому файлі; перевірку звести до того самого виклику.)
  `StageScreen.test.tsx`: `intro` з `newcomers: true` → «Як проходить раунд» і рядок раунду поля з «кубик»; підказки типу (`role="note"`) на сцені на `question` немає навіть із `newcomers: true`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web`. Очікується FAIL.

- [ ] **Step 3: Implement** за Interfaces.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): a «Як проходить раунд» reminder on the round intro and a one-line tip above the first question of each type on the phone — the timer runs and answering works as usual"
```

---

### Задача 8. Редактор: прапорець «Пояснення для новачків»; «шкільна» демо з поясненнями

**Files:**
- Modify: `apps/web/src/editor/QuizEditor.tsx` (розділ «Правила гри»)
- Modify: `apps/web/src/editor/QuizEditor.test.tsx`
- Modify: `apps/web/src/i18n.ts`
- Modify: `apps/server/scripts/school-quiz.ts`
- Modify: `apps/server/scripts/demo-quiz.test.ts`

**Interfaces:**
- У `<details className="rules">` («Правила гри»), після вибору рейтингу:
  ```tsx
  <label className="field field-check">
    <input type="checkbox" checked={settings.newcomers === true} onChange={(event) => setNewcomers(event.target.checked)} />
    <span>{t('newcomersLabel')}</span>
  </label>
  <p className="meta">{t('newcomersHint')}</p>
  ```
  `setNewcomers(on)`: `const { newcomers: _off, ...rest } = settings; update({ ...quiz, settings: on ? { ...rest, newcomers: true } : rest });` — вимкнений прапорець не лишає ключа.
- Тексти: `newcomersLabel: 'Пояснення для новачків'`, `newcomersHint: 'Перед грою — екран «Як грати» з правилами саме цієї вікторини, перед кожним раундом — пам’ятка, перед новим типом запитання — підказка на телефоні.'`.
- `school-quiz.ts`: `settings: { leaderboard: 'each', newcomers: true, buffs: [...] }`; опис вікторини не змінюється.

- [ ] **Step 1: Write the failing tests.** `QuizEditor.test.tsx`:
  ```tsx
  describe('QuizEditor: explanations for newcomers', () => {
    it('the flag is off by default and is written only when on', async () => {
      const { onSave } = open();
      fill('Назва вікторини', 'Гра');
      fill('Текст запитання', 'Перше?');
      fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
      const box = screen.getByLabelText('Пояснення для новачків') as HTMLInputElement;
      expect(box.checked).toBe(false);
      fireEvent.click(box);
      fireEvent.click(box); // знову вимкнено — ключа немає
      click('Зберегти');
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      expect('newcomers' in saved(onSave).settings).toBe(false);
    });

    it('turning it on saves newcomers: true and a saved quiz opens with it checked', async () => {
      const { onSave } = open();
      fill('Назва вікторини', 'Гра');
      fill('Текст запитання', 'Перше?');
      fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
      fireEvent.click(screen.getByLabelText('Пояснення для новачків'));
      click('Зберегти');
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      const quiz = saved(onSave);
      expect(quiz.settings.newcomers).toBe(true);
      expect(quizSchema.safeParse(quiz).success).toBe(true);
      cleanup();
      open(quiz);
      expect((screen.getByLabelText('Пояснення для новачків') as HTMLInputElement).checked).toBe(true);
    });
  });
  ```
  `demo-quiz.test.ts`, у тесті «gives all eight buffs …»: `expect(schoolQuiz.settings.newcomers).toBe(true);` і окремий тест:
  ```ts
  it('only the school quiz turns explanations on', () => {
    for (const quiz of [demoQuiz, movieQuiz, eruditeQuiz, mosaicQuiz, partyQuiz()]) expect(quiz.settings.newcomers).toBeUndefined();
  });
  ```
  (наявна перевірка `loaded?.duels, loaded?.spares` доповнюється `loaded?.settings.newcomers` → `true`: прапорець переживає збереження в jsonb.)

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web apps/server/scripts`. Очікується FAIL.

- [ ] **Step 3: Implement** за Interfaces.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src apps/server/scripts
git commit -m "feat(editor): «Пояснення для новачків» in the game rules, off by default and not stored when off; the school demo quiz turns it on"
```

---

### Задача 9. Наскрізний сценарій 8d і кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–8.
- Допоміжні функції файлу: `open`, `register`, `join`, `shot`, `click`, `exact`, `snapshot`, `noSideScroll`, `afterSplash`, `splashOn` (8c), `POLL`. Нова локальна `async function guideOn(page: Page, title: string)` — `await page.locator('.guide-title', { hasText: title }).waitFor()`.

- [ ] **Step 1: Add the scenario** `it('part 8d: «Як грати» built from the quiz on the stage, phones and host — paging, a reload mid-guide, «До гри», then «Раунд 1»; a round reminder; a tip above the first question of each type with the timer running; the editor flag', …)` з `try/catch` і `snapshot()`. Підготовка:
  1. Ведучий `register(host, 'host', 'Олег Ведучий', 'host8d@example.com')`. Вікторина «Для новачків» через `host.request.post(`${base}/api/quizzes`, { data })`: `settings: { leaderboard: 'end', newcomers: true, buffs: ['fifty', 'double'], debuffs: ['fog'] }`, `shuffleOptions: false`, `speedBonus: false`, `rules: DEFAULT_RULES`:
     - **Раунд 1, класика** «Розминка»: `q1` single «Столиця Франції?» — «Париж» (правильний), «Ліон», «Марсель»; 20 с. `q2` order «Розставте океани за площею» — «Тихий», «Атлантичний», «Індійський» (у правильному порядку), `topLabel: 'Найбільший'`, `bottomLabel: 'Найменший'`; 30 с. `q3` single «Столиця Італії?» — «Рим» (правильний), «Мілан»; 20 с.
     - **Раунд 2, фінал** «Космос», `wagerMode: 'bank'`: single «Перша людина в космосі?» — «Гагарін» (правильний), «Армстронг»; 30 с.
     - `duels`: категорія «Мови», 2 запитання, `questionsPerDuel: 1`, `timeLimit: 20`, `stake: 200`.
     - Сторінки (6): «Відповідайте з телефона», «Раунди цієї гри», «Типи запитань», «Бафи — ваші допомоги», «Дебафи від ведучого», «Дуелі».
  2. Гра: `stage` 1280 × 720 (найтісніший екран сцени), `olya` 375 × 812, `petro` 360 × 740. Приєднуються Оля й Петро.

- [ ] **Step 2: Assertions and shots** (у такому порядку):
  1. **Редактор.** Відкрити вікторину «Для новачків» у редакторі → розгорнути «Правила гри» → прапорець «Пояснення для новачків» увімкнений; кадр `guide8d-editor`. Повернутися до списку без змін.
  2. **Сторінка 1.** Ведучий «Почати гру» → `guideOn(stage, 'Відповідайте з телефона')`, «Як грати · 1 з 6»; `.splash` на сцені й телефонах немає (заставка раунду ще не грала). Телефони: `guideOn(olya, …)`, `guideOn(petro, …)`. Пульт: «Далі», «До гри», «Пауза», «Завершити гру»; «Завершити раунд» немає. Кадри `guide8d-phone-page-stage`, `guide8d-phone-page-375`, `guide8d-host`.
  3. **Раунди.** «Далі» → «Раунди цієї гри»: на сцені «Класичний» і «Фінал», рядок про банк («віддає ставку в спільний банк»); на телефоні ті самі назви без `.guide-icon`. Сторінка сцени без вертикальної прокрутки: `document.documentElement.scrollHeight <= innerHeight`. Кадри `guide8d-rounds-stage`, `guide8d-rounds-375`.
  4. **Перезавантаження посеред «Як грати».** `olya.reload()` → після входу знову «Раунди цієї гри», «2 з 6».
  5. **Типи.** «Далі» → «Типи запитань»: «Торкніться одного правильного варіанта.» і «Розставте рядки стрілками ↑ ↓: зверху — найбільший.» на сцені й телефонах; `noSideScroll(olya)` і `noSideScroll(petro)` — `true`. Кадри `guide8d-types-stage`, `guide8d-types-375`, `guide8d-types-360`.
  6. **Бафи і пауза.** «Далі» → «Бафи — ваші допомоги»: «50/50», «Подвійні бали», рядок «Кнопки — під запитанням…»; «Заміна запитання» немає (не дозволено). Кадр `guide8d-buffs-stage`. Ведучий «Пауза» → банер «Пауза» на сцені, «Далі» й «До гри» на пульті зникли; «Продовжити» → кнопки повернулися, сторінка та сама.
  7. **«До гри» → «Раунд 1».** Ведучий «До гри» (на 4-й сторінці — дебафи й дуелі пропущено) → `splashOn(stage, 'round')` і «Раунд 1» (заставка йде **після** «Як грати»); `afterSplash(stage, olya, petro)` → на сцені «Як проходить раунд» і «Запитання йдуть по черзі…»; на телефоні Олі те саме. Кадри `guide8d-reminder-stage`, `guide8d-reminder-375`.
  8. **Підказка нового типу (`q1`).** «Почати раунд» → `afterSplash`. У Олі й Петра `.type-tip` з «Торкніться одного правильного варіанта.»; на сцені `.type-tip` немає. Запам'ятати `y` блоку запитання в Олі під час заставки й після неї — однаковий (підказка стоїть з першої миті). Таймер іде: `seconds(olya)` за 2 с зменшився. Оля й Петро відповідають «Париж» — відповідь прийнято (`section.result` після розкриття). Кадр `guide8d-tip-single-375`.
  9. **Порядок (`q2`).** «Далі» → `afterSplash` → `.type-tip` у Олі з «зверху — найбільший»; кадр `guide8d-tip-order-375`; `noSideScroll(olya)` — `true`. Відповіді надіслати.
  10. **Повторний тип (`q3`).** «Далі» → `afterSplash` → `.type-tip` немає ні в кого. Відповіді, розкриття.
  11. **Фінал.** «Наступний раунд» → `splashOn(stage, 'final')` → `afterSplash` → «Як проходить раунд» з «Спершу таємна ставка…»; кадр `guide8d-reminder-final-stage`. Ставки (по 0) → «Далі» → `afterSplash` → `.type-tip` немає (single уже був). Відповіді «Гагарін» → розкриття до подіуму.
  12. **Без прапорця — як раніше:** окремої перевірки тут немає — наявні сценарії 7a–8c з вікторинами без прапорця мають лишитися зеленими (крок 3).
  13. `expect(problems).toEqual([])`.

- [ ] **Step 3: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв (зокрема 8c — заставка раунду там іде одразу після «Почати гру», бо прапорця немає). Потім той самий запуск з `E2E_SHOTS=1` і перегляд кадрів у `apps/server/e2e/artifacts/shots`:
  - сторінки «Як грати» на сцені 1280 × 720 вміщуються, текст читається з відстані (великий заголовок, дві колонки пунктів);
  - на 360–375 px немає обрізаних рядків і горизонтальної прокрутки, телефон помітно коротший за сцену;
  - підказка над запитанням — один-два рядки, не відштовхує варіанти за край екрана;
  - пам'ятка раунду не дублює дослівно рядки балів під нею.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts
git commit -m "test: part 8d end-to-end — the editor flag, «Як грати» on the stage, phones and host built from the quiz, paging, a reload mid-guide, a pause, «До гри» then «Раунд 1», a round reminder, a tip above the first single and order questions and none for a repeated type"
```

Після фінальної рецензії гілку злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`. У звіті власникові назвати рішення: прапорець «Пояснення для новачків» — у розділі «Правила гри» редактора, типово вимкнений; сторінки «Як грати» (3–6 залежно від вікторини: як відповідати, раунди, типи запитань, бафи, дебафи, дуелі) показуються однаково на сцені й телефонах (на телефонах коротше), ведучий гортає «Далі» або пропускає «До гри», а заставка «Раунд 1» іде після них; приєднатися під час «Як грати» не можна, як і після старту зараз; пам'ятка «Як проходить раунд» — на кожній заставці раунду; підказка нового типу — один рядок над запитанням лише тим, хто відповідає з телефона, і тип вважається знайомим після першого запитання цього типу в грі (навіть якщо на полі відповідав інший гравець); прапорець увімкнено лише в демо «Від шкільної парти до мемів» — уже засіяні у власника вікторини не змінюються, прапорець треба ввімкнути в редакторі або засіяти «шкільну» знову.
