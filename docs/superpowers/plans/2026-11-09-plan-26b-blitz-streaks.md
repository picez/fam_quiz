# План 26b: наростальні серії в бліц-раунді

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** у правилах бліц-раунду з'являються два незалежні перемикачі — плюсова й мінусова серія з кроком у балах. Кожна правильна відповідь поспіль дає на крок більше, кожна помилка поспіль (за мінусової серії) знімає на крок більше. Гравець бачить свою серію на телефоні; сцена й ведучий — позначку біля імені.

**Spec:** `docs/superpowers/specs/2026-11-09-blitz-series-and-word-ladder-design.md`. Розділи: «B. Наростальні серії в бліц-раунді», «Спільні обмеження» і «Рішення будівника для A і B» (пункт B). Частини A і C сюди не входять. Частина A (вид заставки `blitz`, `ADDED_26A`) може вже бути в гілці або йти паралельно; 26b її файлів по суті не торкається.

**Архітектура:**
- **shared** (`packages/shared/src/quiz.ts`): нова `blitzRulesSchema` = `roundRulesSchema.extend({ partial: z.null(), streakPlus, streakMinus })`, обидва поля `z.object({ step }).nullable().optional()`. `blitzRoundSchema.rules` бере її. `RoundBrief` (`round-brief.ts`) отримує `series`.
- **рушій** (`packages/engine/src/blitz.ts`, `score.ts`, `views.ts`). Чиста `blitzSeriesPoints` у `score.ts` рахує бали спроби за формулою власника. `blitzSeries` у `blitz.ts` виводить серію гравця з журналу: спроби (`play.blitz.attempts`) усіх попередніх запитань цього раунду, потім уже оцінені спроби поточного. `BlitzRules.points` отримує третій параметр — оцінені спроби поточного запитання, які `settle` уже дописав у цьому виклику. Бали серії лягають в `Attempt.points`, тож `summaryOf`, `withTotals`, розбивка балів (`breakdown.ts`), факти й записи сервера беруть їх без змін. Лічильників у стані немає.
- **вигляд** (`views.ts` + типи в `packages/shared/src/views.ts`): `PlayerBlitz.series` для телефону (живе), `LobbyPlayer.series?` (число зі знаком) для пульта (живе) і сцени (поточне запитання — лише з розкриття).
- **веб**: рядок серії на телефоні, позначка в `Standings`/`ScoreTable` (сцена) і в списку гравців пульта, рядок у пам'ятці раунду (`round-summary.ts`), два перемикачі з кроком у `RoundSettings.tsx` і довідка `setting.blitzSeries`.

**Технології:** TypeScript, zod, React 19 + Testing Library (jsdom), vitest, Playwright через vitest (e2e).

## Global Constraints

- `GAME_STATE_VERSION` лишається **22** (`packages/engine/src/restore.ts`), `READABLE_STATE_VERSIONS` не змінюється. Стан гри не отримує жодного поля: нові поля живуть лише в правилах вікторини (`state.quiz`), а старі знімки їх просто не мають → поведінка як була. Підняття версії тут не потрібне; якщо виконавець дійде висновку, що без нього ніяк, — зупинитися: пуш лише з дозволу власника.
- Нові поля схем — необов'язкові (`.nullable().optional()`); кожна наявна вікторина і знімок проходять. Об'єкти — `z.object` як сусідні (у `quiz.ts` `.strict()` не вживається; схеми, що вже `.strict()`, такими й лишаються).
- Без `streakPlus` і `streakMinus` (поле відсутнє або `null`) бліц-раунд рахує **рівно як зараз**: той самий `answerPoints`, ті самі `Attempt.points`.
- Формула (власник):
  - правильно: `ціна × множник + (правильних підряд до цієї) × streakPlus.step`;
  - неправильно за `streakMinus`: `−(ціна × множник + (неправильних підряд до цієї) × streakMinus.step)`;
  - неправильно без `streakMinus`: як зараз (`penalty: 'minus'` → `−ціна × множник`, інакше 0).
  - Приклад: ціна 500, крок 250 → 500, 750, 1000, 1250…; −500, −750, −1000…
- Множник раунду множить ціну, а не бонус серії.
- Правильна відповідь обнуляє мінусову серію, неправильна — плюсову. Серія своя в кожного гравця, тягнеться через усі запитання бліц-раунду, на новому раунді — з нуля. Кожна спроба (attempts 2–3) — окремий крок.
- `streakMinus` діє як штраф незалежно від `penalty`; редактор, вмикаючи її, ставить `penalty: 'minus'`. Подвійного штрафу не буває.
- Рахуються лише оцінені спроби (`Attempt` з `grade`); `dropped` і ненатискання серію не рухають.
- Бафи в бліці вимкнені й надалі (`off_blitz`) — нічого не змінюємо. Бліц-клітинки поля (`cellBlitzRules`) і інші раунди не змінюються; наявна `rules.streak` лишається як є.
- Межа кроку: `1…LIMITS.maxPoints` (2000). Стелі серії немає.
- Нові рядки інтерфейсу:
  - uk — в `apps/web/src/i18n.ts`;
  - ключі — у новому списку `ADDED_26B` в `apps/web/src/i18n.test.ts`, доданому до фільтра поряд з останнім `ADDED_*` (якщо 26a вже додав `ADDED_26A` — поруч з ним);
  - переклади — у всіх 6 json (`apps/web/src/locales/{en,pl,de,es,it,ar}.json`), довідка — у `*.help.json` тих самих 6 мов;
  - ru ніколи; нічого про росію.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах.
- Тести: `pnpm vitest run --maxWorkers=2 <шлях>`. Типи: `pnpm typecheck`. Prettier не запускати.
- e2e: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "<частина>"`. На передньому плані, до 10 хв на один виклик.

## Рішення будівника (зафіксовані тут)

- **Бали серії — в `Attempt.points` у мить оцінки.** Серія виводиться з журналу щоразу, коли `settle` оцінює спробу; збереженого лічильника немає. Переоцінки спроби бліцу в рушії немає: `overrideGrade` для бліц-раунду відмовляє `wrong_phase` (`game.ts:2216`), апеляції — лише `classic` і `board` (`APPEAL_ROUNDS`). «Скасувати» (`undo.ts`) дописує коригування й оцінок не змінює — серія від нього не рухається (і не має). Отже, оцінка в мить спроби і є «перерахунок з журналу»; окремий перерахунок наступних спроб не потрібен. Якщо колись з'явиться переоцінка бліцу, вона має перераховувати `Attempt.points` наступних спроб раунду через `blitzSeries` — коментар про це над `blitzSeries`.
- **Натиснув і змовчав до кінця вікна** — це оцінена спроба `grade: 'wrong'` (рушій і зараз дає за неї штраф), тож вона — крок мінусової серії й обриває плюсову. «Не відповідав» зі спеки = не натискав.
- Сортування в бліц-раунді (без черги, `play.blitz === undefined`) серію не рухає й бонусу не має.
- Видалений гравець: його спроби зникають з журналу разом з ним (`game.ts:932`), на серії інших це не впливає.
- Командна гра: серія належить тому `playerId`, на якого записано спробу, — так само, як бали.
- Стара серія `rules.streak` і `streakPlus` в одному бліц-раунді: редактор не дає їх разом (ввімкнення плюсової серії ставить `streak: null` і ховає «Серії»). Рушій особливо не обробляє: якщо вручну задано обидві, стара рахується, як зараз, від `points` виграшної спроби.
- Вигляд серії:
  - `PlayerBlitz.series: { plus: number; minus: number; nextCorrect: number | null; nextWrong: number | null } | null` — `null`, коли в раунді немає ні `streakPlus`, ні `streakMinus` (і для бліц-клітинок). `nextCorrect` — `null` без `streakPlus`, `nextWrong` — `null` без `streakMinus`. Живе: з усіма оціненими спробами гравця, і поточного запитання теж (свою оцінку гравець і так бачить у `grade`).
  - `LobbyPlayer.series?: number` — `+plus`, коли `streakPlus` є і `plus > 0`; `−minus`, коли `streakMinus` є і `minus > 0`; інакше ключа немає. Лише поки поточний раунд — бліц із серією. Пульт — живе. Сцена — на етапах `question` і `locked` без спроб поточного запитання (у бліці з кнопкою сцена до розкриття оцінок не бачить), з `reveal` — з ними.
- Телефон: один рядок над чергою/кнопкою, `«Серія +3 · наступна правильна +1250»` або `«Серія −2 · наступна помилка −1000»`; плюсовий — коли `nextCorrect !== null && plus > 0`, мінусовий — коли `nextWrong !== null && minus > 0`. Числа через `signed()` з `format.ts` (знак «−», ізоляція в RTL).
- Сцена й пульт: позначка `«Серія +2»` / `«Серія −2»` поруч із 🔥, від 1.
- Редактор: крок за замовчуванням **250**; ввімкнена мінусова серія тримає «Штраф: мінус» увімкненим і вимкненим для зміни (підпис-пояснення під ним); вимкнення мінусової серії `penalty` не чіпає.
- Пам'ятка раунду: `RoundBrief.series: { plus: number | null; minus: number | null } | null`, `penalty` — `true` і тоді, коли є лише `streakMinus`.
- Сід-скрипти (`apps/server/scripts/*-quiz.ts`) не змінюються: старі бліц-раунди без нових полів рахують як були.
- uk-рядки (переклади — тієї ж будови, `{count}`/`{points}`/`{step}` без змін):
  - `ruleSeriesPlus: 'Плюсова серія: кожна правильна поспіль дає на крок більше'`
  - `ruleSeriesMinus: 'Мінусова серія: кожна помилка поспіль знімає на крок більше'`
  - `ruleSeriesStep: 'Крок, балів'`
  - `ruleSeriesMinusPenalty: 'Мінусова серія вже штрафує за помилки'`
  - `summarySeriesPlus: 'серія: кожна правильна поспіль +{step}'`
  - `summarySeriesMinus: 'серія: кожна помилка поспіль −{step}'`
  - `blitzSeriesPlus: 'Серія {count} · наступна правильна {points}'`
  - `blitzSeriesMinus: 'Серія {count} · наступна помилка {points}'`
  - `seriesMark: 'Серія {count}'`

## Review Focus

1. Кілька спроб на запитання (attempts 2–3): дві помилки одного гравця на тому самому запитанні — два кроки мінусу (−500, −750), правильна після них — плюс з нуля (+500). Тест — у задачі 2.
2. Миттєвий бліц (`check: 'auto'`): кілька гравців оцінюються в одному виклику `settle`; серія кожного рахується лише з його спроб, а спроби інших у тому ж виклику її не зсувають. Тест — у задачі 2.
3. Гравець пропускає запитання (не натискає), а інший відповідає: серія того, хто пропустив, лишається, і наступна його правильна йде з тим самим кроком. Тест — у задачі 2.
4. Сцена не видає оцінку до розкриття: у бліці з кнопкою, після «Правильно» ведучого на етапі `question`, `stageView` ще показує серію без цього запитання, а `hostView` — уже з ним. Тест — у задачі 3.
5. Порожнє чи нечислове поле кроку в редакторі (`NaN`) або 0: зберегти не дає — проблема «правила» в списку проблем чернетки, як для бонусу старої серії. Тест — у задачі 5.

---

### Задача 1. Shared: схема правил бліцу й пам'ятка раунду

**Files:**
- Modify: `packages/shared/src/quiz.ts:739-756` (нові `blitzSeriesSchema`, `blitzRulesSchema`, тип `BlitzRules` → назвати `BlitzRoundRules`, щоб не плутати з рушієвим `BlitzRules`)
- Modify: `packages/shared/src/round-brief.ts`
- Test: `packages/shared/src/quiz.test.ts`, `packages/engine/src/round-brief.test.ts`

**Interfaces:**
- Produces:
  - `blitzSeriesSchema = z.object({ step: z.number().int().min(1).max(LIMITS.maxPoints) })`;
  - `blitzRulesSchema = roundRulesSchema.extend({ partial: z.null(), streakPlus: blitzSeriesSchema.nullable().optional(), streakMinus: blitzSeriesSchema.nullable().optional() })`;
  - `type BlitzRoundRules = z.infer<typeof blitzRulesSchema>`; `blitzRoundSchema.rules: blitzRulesSchema`;
  - `RoundBrief.series: { plus: number | null; minus: number | null } | null` (`emptyBrief` — `null`).

- [ ] **Крок 1: Тести, що падають.**
  - `quiz.test.ts`, `blitz series steps are optional and bounded`:
    - бліц-раунд без полів, з `streakPlus: null`, з `{ streakPlus: { step: 250 }, streakMinus: { step: 2000 } }` — валідні;
    - `{ step: 0 }`, `{ step: 2001 }`, `{ step: 2.5 }`, `{}` — невалідні;
    - розпарсений раунд з `streakPlus: { step: 250 }` зберігає поле (не стирається).
  - `round-brief.test.ts`, `a blitz brief carries the series steps; streakMinus alone counts as the penalty`:
    - без полів: `series: null`, `penalty: false`;
    - `streakPlus: { step: 250 }` → `series: { plus: 250, minus: null }`;
    - `streakMinus: { step: 100 }`, `penalty: 'none'` → `series: { plus: null, minus: 100 }`, `penalty: true`;
    - класичний раунд і бліц-клітинки поля — `series: null`.
- [ ] **Крок 2: Запустити — FAIL.**
  Run: `pnpm vitest run --maxWorkers=2 packages/shared/src/quiz.test.ts packages/engine/src/round-brief.test.ts`
- [ ] **Крок 3: Реалізація** за Interfaces. У `roundBrief` для `round.type === 'blitz'`: `series` — `null`, коли обидва поля відсутні/`null`; `penalty: rules.penalty === 'minus' || streakMinus != null`. Коментарі українською, як сусідні.
- [ ] **Крок 4: Запустити — PASS**, потім `pnpm vitest run --maxWorkers=2 packages/shared packages/engine/src/round-brief.test.ts` і `pnpm typecheck` — без помилок.
- [ ] **Крок 5: Коміт.**
  ```bash
  git add packages/shared/src packages/engine/src/round-brief.test.ts
  git commit -m "feat(shared): 26b optional streakPlus / streakMinus steps in blitz round rules; the round brief carries them"
  ```

---

### Задача 2. Рушій: бали спроби з серією, виведеною з журналу

**Files:**
- Modify: `packages/engine/src/score.ts` (нова `blitzSeriesPoints`)
- Modify: `packages/engine/src/blitz.ts` (`BlitzRules.points`, `blitzRulesOf`, `settle`, нові `BlitzSeries`, `blitzSeries`)
- Modify: `packages/engine/src/game.ts:154-163` (лише коментар до `Attempt.points`: «з бонусом бліц-серії 26b, без бонусу `rules.streak`»)
- Modify: `packages/engine/src/index.ts` (експорт `blitzSeries`, `BlitzSeries`, якщо вигляд/тести беруть через індекс)
- Test: `packages/engine/src/score.test.ts` (або сусідній тест `answerPoints`), `packages/engine/src/game.blitz.test.ts`, `packages/engine/src/breakdown.test.ts`

**Interfaces:**
- Consumes: `BlitzRoundRules` (задача 1).
- Produces:
  - `export interface BlitzSeries { plus: number; minus: number }` — правильних / неправильних поспіль перед наступною спробою; одне з двох завжди 0;
  - `export function blitzSeries(state: GameState, roundIndex: number, playerId: string, upTo: number, current: readonly Attempt[] = []): BlitzSeries` — спроби гравця з `state.plays[i].blitz?.attempts` для `i < upTo` з `plays[i].roundIndex === roundIndex` у порядку журналу, далі його спроби з `current`; рахує хвіст однакових оцінок;
  - `export function blitzSeriesPoints(input: { price: number; multiplier: number; penalty: 'none' | 'minus'; plus: { step: number } | null; minus: { step: number } | null; series: BlitzSeries; correct: boolean }): number`;
  - `BlitzRules.points(playerId: string, correct: boolean, current: readonly Attempt[]): number`. `cellBlitzRules` (`board-cells.ts`) третій параметр ігнорує — без змін у тілі.

- [ ] **Крок 1: Тести, що падають.**
  - `score.test.ts`, `blitz series points follow the owner's formula`:
    - ціна 500, крок 250, множник 1: правильні з `plus` 0,1,2,3 → `500, 750, 1000, 1250`; неправильні з `minus` 0,1,2 за `minus: {step:250}` → `-500, -750, -1000`;
    - множник 2, ціна 500, крок 250, `plus` 2 → `1500` (множиться лише ціна);
    - без `minus`, `penalty: 'minus'` → `-500` за будь-якого `series.minus`; без `minus`, `penalty: 'none'` → `0`;
    - `minus` задано, `penalty: 'none'` → `-500` (штраф незалежно від `penalty`);
    - `plus: null`, правильно, `series.plus` 3 → `500`.
  - `game.blitz.test.ts`, нові тести (фікстура `blitzRound` з `check: 'manual'`, `attempts: 1`, ціни 500, `rules: { ...DEFAULT_RULES, partial: null, streakPlus: { step: 250 }, streakMinus: { step: 250 } }`; гравці `p1`, `p2`; хелпери `buzz`/`answer`/`judge` як у сусідніх тестах):
    - `a plus series grows by the step across the blitz round`: p1 правильно на q1, q2, q3, q4 → `Attempt.points` `[500, 750, 1000, 1250]`, рахунок p1 3500;
    - `a minus series grows by the step and a correct answer resets it`: p2 неправильно на q1, q2 (`-500`, `-750`), правильно на q3 (`+500`), неправильно на q4 (`-500`);
    - `two wrong attempts on one question are two steps` (Review Focus 1): `attempts: 2`, p1 неправильно двічі, потім правильно на наступному запитанні → `[-500, -750, 500]`;
    - `an instant blitz grades each player from their own attempts only` (Review Focus 2): `check: 'auto'`; q1 — p2 неправильно, p1 правильно (`-500`, `500`); q2 — p2 надсилає неправильну, p1 одразу правильну, обидві оцінюються в одному `settle` → p2 `-750`, p1 `750` (помилка p2 у тому ж виклику серію p1 не обриває);
    - `a skipped question leaves the series as it was` (Review Focus 3): p1 правильно на q1, на q2 не натискає (відповідає p2), на q3 правильно → `750`;
    - `a buzz left silent until the window ends is a wrong step`: p1 натиснув, вікно минуло (`tick` після `deadline`) → `-500`, наступна його помилка `-750`;
    - `the series starts over in the next blitz round`: два бліц-раунди поспіль, у першому p1 тричі правильно, у другому перша правильна → `500`;
    - `without series rules a blitz round scores exactly as before`: той самий сценарій без полів і з `streakPlus: null, streakMinus: null` — `Attempt.points` і рахунки рівні значенням зі звичайним `answerPoints` (`500` за кожну правильну, `-500` / `0` за помилку з `penalty` `'minus'` / `'none'`);
    - `blitz grades stay final: override refuses in a blitz round` — `override(state, 'p1', 'wrong', now)` на `reveal` бліц-раунду з серіями дає `{ ok: false, error: 'wrong_phase' }` (пінить рішення «переоцінки бліцу немає»).
  - `breakdown.test.ts`, `blitz series points add up to the score in the breakdown`: після сценарію «плюс + мінус» сума рядків розбивки кожного гравця = його рахунок.
- [ ] **Крок 2: Запустити — FAIL.**
  Run: `pnpm vitest run --maxWorkers=2 packages/engine/src/score.test.ts packages/engine/src/game.blitz.test.ts packages/engine/src/breakdown.test.ts`
- [ ] **Крок 3: Реалізація.**
  - `score.ts`: `blitzSeriesPoints` за Global Constraints; база `Math.round(price * multiplier)`.
  - `blitz.ts`, `blitzRulesOf` для бліц-раунду: коли обидва поля відсутні/`null`, `points` лишається рівно `answerPoints(...)`, як зараз. Інакше `points: (playerId, correct, current) => blitzSeriesPoints({ price: play.question.points, multiplier, penalty, plus, minus, correct, series: blitzSeries(state, play.roundIndex, playerId, state.questionIndex, current) })`.
  - `settle`: `rules.points(head.playerId, correct, attempts)` — локальний `attempts` уже містить спроби, оцінені раніше в цьому ж виклику.
  - Над `blitzSeries` — коментар з рішення «переоцінки бліцу немає; якщо з'явиться — перерахувати `points` наступних спроб раунду через `blitzSeries`».
- [ ] **Крок 4: Запустити — PASS**, потім уся хвиля `pnpm vitest run --maxWorkers=2 packages/engine apps/server/src` і `pnpm typecheck`. Наявні тести бліцу мають пройти без змін очікувань.
- [ ] **Крок 5: Коміт.**
  ```bash
  git add packages/engine/src
  git commit -m "feat(engine): 26b blitz streaks — each correct in a row adds a step, each wrong in a row takes a step more; derived from the round's graded attempts"
  ```

---

### Задача 3. Рушій: серія у вигляді телефону, пульта й сцени

**Files:**
- Modify: `packages/shared/src/views.ts:411-417` (`LobbyPlayer.series?`), `:463-477` (`PlayerBlitz.series`)
- Modify: `packages/engine/src/views.ts` (`playerBlitz`, `stageView` ~2032, `hostView` ~2402, новий хелпер `shownSeries`)
- Test: `packages/engine/src/views.test.ts`

**Interfaces:**
- Consumes: `blitzSeries`, `blitzSeriesPoints` (задача 2).
- Produces:
  - `PlayerBlitz.series: { plus: number; minus: number; nextCorrect: number | null; nextWrong: number | null } | null`;
  - `LobbyPlayer.series?: number` (зі знаком; ключа немає, коли показувати нічого);
  - у `views.ts`: `function shownSeries(state: GameState, playerId: string, live: boolean): number | undefined`.

- [ ] **Крок 1: Тести, що падають** (`views.test.ts`, бліц-раунд з обома кроками 250, ціни 500):
  - `the phone shows its own blitz series and the next step`: після двох правильних p1 на q3 `playerView(...).me.blitz.series` дорівнює `{ plus: 2, minus: 0, nextCorrect: 1000, nextWrong: -500 }`; p2 після двох помилок — `{ plus: 0, minus: 2, nextCorrect: 500, nextWrong: -1000 }`;
  - `without series rules the phone gets series null`: звичайний бліц-раунд і бліц-клітинка поля → `series: null`;
  - `nextWrong is null without streakMinus`: лише `streakPlus` → `nextWrong: null`;
  - `stage and host mark the series next to the player; the stage waits for the reveal` (Review Focus 4): на q3 p1 натиснув, ведучий «Правильно» (етап `question` або `locked`): `hostView(...).players` для p1 — `series: 3`, `stageView(...).players` — `series: 2`; після `reveal` сцена — `3`; p2 з двома помилками — `-2` на обох;
  - `no series key outside a blitz round with series`: після переходу в наступний (класичний) раунд ключа `series` немає.
- [ ] **Крок 2: Запустити — FAIL.**
  Run: `pnpm vitest run --maxWorkers=2 packages/engine/src/views.test.ts`
- [ ] **Крок 3: Реалізація.**
  - `playerBlitz`: правила раунду беруть з `state.quiz.rounds[play.roundIndex]` (лише `type === 'blitz'`); `series = blitzSeries(state, play.roundIndex, playerId, state.questionIndex, blitz.attempts)`; `nextCorrect`/`nextWrong` — `blitzSeriesPoints` з `correct: true/false`, `null` без відповідного кроку.
  - `shownSeries`: лише коли `currentRound(state)` — бліц з `streakPlus` або `streakMinus`; `current` — спроби поточного запитання, якщо `live` або етап не `question`/`locked`, інакше `[]`. Значення — за рішенням «Вигляд серії».
  - `stageView`: `...(series === undefined ? {} : { series })` з `live: false`; `hostView` — з `live: true`.
- [ ] **Крок 4: Запустити — PASS**, потім `pnpm vitest run --maxWorkers=2 packages/engine apps/server/src` і `pnpm typecheck`.
- [ ] **Крок 5: Коміт.**
  ```bash
  git add packages/shared/src/views.ts packages/engine/src
  git commit -m "feat(engine): 26b the phone sees its blitz series and the next step; host and stage get a series mark, the stage after the reveal"
  ```

---

### Задача 4. Веб: рядок серії на телефоні, позначка на сцені й пульті, пам'ятка раунду

**Files:**
- Modify: `apps/web/src/screens/PlayerScreen.tsx:943` (рядок серії після `BlitzCellNotes`, лише коли `me.blitz?.series` дає що показати)
- Modify: `apps/web/src/screens/Standings.tsx`, `apps/web/src/screens/ScoreTable.tsx` (новий необов'язковий проп `series?: Record<string, number>`), `apps/web/src/format.ts` (новий `seriesOf(players: LobbyPlayer[]): Record<string, number>`), місця на сцені, що передають `streaksOf(...)`, передають і `seriesOf(...)` (grep `streaksOf(`)
- Modify: `apps/web/src/screens/HostScreen.tsx:1266` (позначка поруч із 🔥)
- Modify: `apps/web/src/round-summary.ts` (`modifiers`: рядки `summarySeriesPlus`/`summarySeriesMinus` після штрафу)
- Modify: `apps/web/src/styles.css` (класи `.blitz-series`, `.series` поруч із `.standings .streak`; `.series.is-minus` — колір мінусу як у `.round-gain.is-minus`)
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts` (`ADDED_26B` — ключі цієї й наступної задачі), 6 `apps/web/src/locales/*.json`
- Test: `apps/web/src/screens/PlayerScreen.test.tsx`, `apps/web/src/screens/Standings.test.tsx`, `apps/web/src/screens/HostScreen.test.tsx`, `apps/web/src/round-summary.test.ts`

**Interfaces:**
- Consumes: `PlayerBlitz.series`, `LobbyPlayer.series?`, `RoundBrief.series` (задачі 1, 3).
- Produces: ключі `blitzSeriesPlus`, `blitzSeriesMinus`, `seriesMark`, `summarySeriesPlus`, `summarySeriesMinus`; `seriesOf` у `format.ts`.

- [ ] **Крок 1: Тести, що падають.**
  - `PlayerScreen.test.tsx`, `the phone shows the blitz series line`: `series: { plus: 3, minus: 0, nextCorrect: 1250, nextWrong: -500 }` → текст `Серія +3 · наступна правильна +1250`; `{ plus: 0, minus: 2, nextCorrect: 500, nextWrong: -1000 }` → `Серія −2 · наступна помилка −1000`; `{ plus: 0, minus: 0, … }`, `series: null`, і `{ plus: 2, nextCorrect: null, … }` → рядка `.blitz-series` немає.
  - `Standings.test.tsx`, `a series mark stands next to the player`: `series={{ a: 2, b: -3 }}` → `Серія +2` у рядку `a`, `Серія −3` у рядку `b` з класом `is-minus`; без пропа — нічого.
  - `HostScreen.test.tsx`: гравець із `series: -2` у списку — `Серія −2`.
  - `round-summary.test.ts`: бліц з `series: { plus: 250, minus: 250 }` → рядок модифікаторів містить `серія: кожна правильна поспіль +250` і `серія: кожна помилка поспіль −250`; `series: null` — рядки як зараз (наявні тести не змінюються).
- [ ] **Крок 2: Запустити — FAIL.**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/screens/Standings.test.tsx apps/web/src/screens/HostScreen.test.tsx apps/web/src/round-summary.test.ts`
- [ ] **Крок 3: Реалізація** за рішеннями «Телефон» і «Сцена й пульт»; числа — `signed()`. uk-рядки — з розділу рішень, переклади в 6 json, ключі в `ADDED_26B`. Рядок на телефоні — `<p className="blitz-series">`, без зсуву поля відповіді (стоїть над рядком `answering-line`).
- [ ] **Крок 4: Запустити — PASS**, потім `pnpm vitest run --maxWorkers=2 apps/web/src/i18n.test.ts apps/web/src/screens apps/web/src/round-summary.test.ts` і `pnpm typecheck`.
- [ ] **Крок 5: Коміт.**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): 26b the phone shows «Серія +3 · наступна правильна +1250»; stage and host mark the series; the round brief explains the steps"
  ```

---

### Задача 5. Веб: перемикачі серій у редакторі бліц-раунду й довідка

**Files:**
- Modify: `apps/web/src/editor/RoundSettings.tsx:357-455` (лише для `round.type === 'blitz'`: два перемикачі з полем кроку після «Штраф»; приховування «Серії» за ввімкненої плюсової)
- Modify: `apps/web/src/editor/draft.ts:1140` (для бліц-раунду перевіряти `blitzRulesSchema` замість `roundRulesSchema`)
- Modify: `apps/web/src/help/help-uk.ts` (нова довідка `setting.blitzSeries`: `title`, `what`, `how.0`, `points.0..2`, `tip.0`, `limits.0`), `apps/web/src/help/__fixtures__/help-uk-golden.json` (той самий запис), 6 `apps/web/src/locales/*.help.json`
- Modify: `apps/web/src/i18n.ts`, 6 `apps/web/src/locales/*.json`, `ADDED_26B` (`ruleSeriesPlus`, `ruleSeriesMinus`, `ruleSeriesStep`, `ruleSeriesMinusPenalty`)
- Test: `apps/web/src/editor/QuizEditor.test.tsx`, `apps/web/src/editor/draft.test.ts` (або сусідній тест проблем чернетки), `apps/web/src/help/host-help.test.ts`

**Interfaces:**
- Consumes: `blitzRulesSchema`, `BlitzRoundRules` (задача 1).
- Produces: `onChange` бліц-раунду з `rules.streakPlus`/`rules.streakMinus` `{ step }` або `null`.

- [ ] **Крок 1: Тести, що падають.**
  - `QuizEditor.test.tsx`, `a blitz round gets plus and minus series with a step`:
    - перемикачі `Плюсова серія…` і `Мінусова серія…` є лише в бліц-раунді (у класичному — немає);
    - ввімкнення плюсової → `rules.streakPlus` `{ step: 250 }`, `rules.streak` `null`, перемикача «Серії» (`ruleStreak`) не видно; зміна кроку на 400 → `{ step: 400 }`;
    - ввімкнення мінусової → `rules.streakMinus` `{ step: 250 }` і `rules.penalty` `'minus'`; перемикач «Штраф» відмічений і `disabled`, під ним `Мінусова серія вже штрафує за помилки`;
    - вимкнення мінусової → `streakMinus: null`, `penalty` лишається `'minus'`.
  - draft-тест (Review Focus 5): бліц-раунд з `streakPlus: { step: NaN }` або `{ step: 0 }` → у проблемах чернетки є `problemRules`; з `{ step: 250 }` — немає.
  - `host-help.test.ts`: `has('setting.blitzSeries', ['множник'])` — довідка каже, що множник множить ціну, а не крок.
- [ ] **Крок 2: Запустити — FAIL.**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/editor apps/web/src/help`
- [ ] **Крок 3: Реалізація.** Розмітка — як у старої серії (`with-help` + `HelpButton id="setting.blitzSeries"`, поле кроку `type="number"`, `min={1}`, `max={LIMITS.maxPoints}`, `toNumber`). `setRules` для бліцу приймає й нові поля (тип патча — `Partial<Omit<BlitzRoundRules, 'partial'>>` для бліц-гілки). Зміст довідки uk:
  - `what`: кожна правильна відповідь поспіль дає на крок більше, кожна помилка поспіль — на крок більший мінус;
  - `how.0`: гравець бачить на телефоні серію й скільки дасть наступна відповідь; сцена й пульт — позначку біля імені;
  - `points.0`: приклад «ціна 500, крок 250: 500, 750, 1000…; −500, −750, −1000…»;
  - `points.1`: правильна обнуляє мінусову, помилка — плюсову; хто не натискав, серію не рухає; кожна спроба — окремий крок;
  - `points.2`: множник раунду множить ціну, а не крок;
  - `tip.0`: мінусова серія робить вгадування навмання невигідним;
  - `limits.0`: лише в бліц-раунді; на нові раунди серія починається з нуля; у бліц-клітинок поля серій немає.
  Той самий запис — у golden і в 6 `*.help.json` (переклади).
- [ ] **Крок 4: Запустити — PASS**, потім `pnpm vitest run --maxWorkers=2 apps/web/src` і `pnpm typecheck`.
- [ ] **Крок 5: Коміт.**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): 26b the blitz round editor gets plus and minus series with a step; minus series keeps the penalty on; help «setting.blitzSeries»"
  ```

---

### Задача 6. e2e частини 26b і знімки

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts` (новий `it('part 26b: …')` поруч із `backlog 3: blitz answer fields never move`, з тими самими хелперами `open`, `register`, `join`, `click`, `shot`, `snapshot`)

- [ ] **Крок 1: Тест.** `it('part 26b: blitz streaks — a plus series grows by the step, a minus series takes a step more, the phone shows the next step, stage and host mark the series, the editor sets them', …, 600_000)`:
  - Редактор (ведучий, 1280×900): нова вікторина з бліц-раундом (як у наявних e2e редактора — grep `'Штраф: мінус ціна запитання'`), ввімкнути обидві серії, крок плюсу 250; знімок `26b-editor`; «Штраф» відмічений і вимкнений; зберегти; `GET /api/quizzes/:id` має `streakPlus: { step: 250 }`, `streakMinus: { step: 250 }`, `penalty: 'minus'`. Той самий екран на 375×812 — без прокрутки вбік (як `expectFitsWidth13a`); знімок `26b-editor-phone`.
  - Гра: вікторина через API — `blitzRound('r26b', [q1, q2, q3], { title: 'Бліц із серіями', check: 'manual', attempts: 1, answerWindow: 20, rules: { ...DEFAULT_RULES, partial: null, penalty: 'minus', streakPlus: { step: 250 }, streakMinus: { step: 250 } } })`, ціни 500, `timeLimit: 60`; сцена 1280×720, Оля й Тарас 375×812.
  - q1 і q2: Тарас тисне першим, ведучий «Неправильно»; Оля тисне, «Правильно»; «Показати відповідь», «Далі», «Наступне запитання».
  - На q3 до відповідей: телефон Олі — `Серія +2 · наступна правильна +1000`, Тараса — `Серія −2 · наступна помилка −1000`; знімки `26b-olya-plus`, `26b-taras-minus`; сцена — `Серія +2` і `Серія −2` біля імен, знімок `26b-stage`; пульт — ті самі позначки, знімок `26b-host`.
  - q3: Оля не тисне; Тарас тисне, «Правильно» → телефон Тараса `Серія +1 · наступна правильна +750`, у Олі й далі `Серія +2 …`.
  - Після розкриття q3 рахунок: Оля **1250** (500 + 750), Тарас **−750** (−500 − 750 + 500).
- [ ] **Крок 2: Збірка й запуск.**
  Run: `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 26b"` (передній план, до 10 хв).
  Expected: PASS; знімки в теці знімків e2e. Переглянути їх: рядок серії не обрізаний на 375 px, позначка не ламає рядок таблиці сцени, в ar (якщо e2e має RTL-перевірку сусідніх частин — повторити) знак стоїть перед числом.
- [ ] **Крок 3: Повна перевірка.**
  Run: `pnpm vitest run --maxWorkers=2 packages apps/server/src apps/web/src`, `pnpm typecheck`. Expected: PASS. Плюс сусідні e2e бліцу: `-t "backlog 3"`.
- [ ] **Крок 4: Коміт.**
  ```bash
  git add apps/server/e2e/full-game.e2e.ts
  git commit -m "test(e2e): part 26b blitz streaks end to end — editor, phones, stage, host, scores"
  ```
