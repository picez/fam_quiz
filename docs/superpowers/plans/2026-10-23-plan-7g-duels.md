# План 7g: дуелі

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** дуелі між гравцями (розділ 9 специфікації).
- Автор вмикає в редакторі розділ «Дуелі» (не раунд у списку): пул запитань за категоріями (назва + запитання з текстовою відповіддю й прийнятними написаннями, як у типі `text`), кількість запитань за дуель, час на запитання, ставка (0 — без втрат).
- Після ⌈третини⌉ зіграних запитань (без фіналу; кожна клітинка поля, сортування й ланцюжок — по одному) і до початку фіналу (без фіналу — до початку останнього раунду) на телефоні з'являється кнопка «Дуель». Кожен гравець оголошує одну дуель за гру, суперник не може відмовитися; одночасно — одна дуель.
- Дуель починається після розкриття поточного запитання: гра стає на паузу, дуель іде на великому екрані. Той, хто оголосив, вибирає категорію (раз на дуель); запитання беруться випадково, без повторів у межах гри. Обидва дуелянти вписують відповіді, неправильні можна повторювати до кінця часу; перший правильний виграє запитання. Решта бачить запитання й хід дуелі.
- Хто виграв більше запитань — переможець; програвший віддає ставку переможцю (навіть у мінус); нічия — бали не змінюються. Ведучий може скасувати дуель, пропустити запитання дуелі, поставити на паузу. Після дуелі гра йде далі рівно з того місця, де стала.

**Архітектура:**
- **Дані (`shared`).** Необов'язкове поле вікторини `duels?: Duels` (`categories`, `questionsPerDuel`, `timeLimit`, `stake`). Є поле — дуелі ввімкнено; старі вікторини поля не мають. Новий етап гри `Phase` `'duel'`, тип `DuelStage`, коди помилок `duel_used`, `duel_busy`, `duel_empty`, шість подій сокета.
- **Стан (`engine`).** `GameState.duel: DuelState | null` (оголошена або в грі), `duelsDeclared` (хто вже оголошував), `duelUsed` (id запитань пулу, що вже були). Новий файл `packages/engine/src/duel.ts` за зразком `sort.ts` (той самий коментар про безпечний цикл імпортів з `game.ts`). Запитання дуелі **не** потрапляють у `plays`: журнал, поріг третини, номери запитань, серії, історія відповідей і рекордер їх не бачать.
- **Вклинювання в хід гри.** `next` перевіряє оголошену дуель першою (після `paused`): з етапів `intro`, `reveal`, `leaderboard`, `round_end` замість звичайного кроку гра переходить у `phase: 'duel'` і запам'ятовує `duel.returnPhase`. Після підсумку дуелі `next` повертає `returnPhase` і виконує той самий звичайний `next` — відкривається рівно те, що відкрилося б без дуелі. Годинник дуелі — наявні `startedAt` / `endsAt` / `remainingMs` (на етапі `duel` вони вільні), тож пауза, `tick`, `nextDeadline` і таймер клієнтів працюють тим самим механізмом.
- **Бали.** Підсумок дуелі — два коригування `adjustScore(…, 'duel')` поспіль (переможцю `+stake`, програвшому `−stake`), тобто наявний журнал `adjustments`, таблиця `score_adjustment` і рекордер. Міграції немає.
- **Зрізи.** `BaseView.duel: DuelInfo | null` (без прийнятних відповідей до етапу `answer`, без текстів спроб), `HostView.duel: HostDuel | null` (з відповідями й текстами спроб), `PlayerView.me.duel: PlayerDuel | null` (кнопка й власні спроби).
- **Веб.** Новий `apps/web/src/screens/DuelView.tsx` (`DuelButton`, `DuelBanner`, `DuelPlay`, `DuelStage`, `HostDuelPanel`), новий `apps/web/src/editor/DuelsEditor.tsx`; історія показує рядок «Дуель: Іра +300, Оля −300».

**Технології:** TypeScript, zod 4, vitest, Fastify + Socket.IO, Drizzle + PostgreSQL (PGlite у тестах), React + Vite, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-23-after-second-game-design.md`, розділ 9 (частина 7g), анти-цілі розділу 2 («правильна відповідь потрапляє на телефон чи сцену раніше розкриття», «гра застрягає: … у ведучого є вихід — пропустити, кинути за гравця, скасувати», «старі вікторини перестали відкриватися або зламалася історія ігор і профіль», «проста класична вікторина стала складнішою», «елементи на екрані гравця стрибають»), не-ціль «дуелі під час фінального раунду», рішення розділу 11 («дуелі: поріг третини без фіналу, без окремої статистики, ставка може загнати в мінус»; «дуель: категорія вибирається раз на дуель, повторні спроби дозволені, без дуелей у фіналі»). Зразки: `packages/engine/src/sort.ts`, `adjust.ts`, план `2026-10-23-plan-7f-sort.md`. Частини 7a–7f уже в `main`.

**Рішення плану там, де специфікація мовчить:**
- **Модель і межі** (`LIMITS`): категорій 1–8 (`maxDuelCategories`), назва категорії 1–40 (наявний `categoryTitle`), запитань у категорії 1–20 (`maxDuelCategoryQuestions`); запитання дуелі — `{ id, text (≤ 300), accepted: 1–10 написань ≤ 200 }`, без картинки й відео; запитань за дуель 1–7, типово 3 (`maxDuelQuestions`, `defaultDuelQuestions`); час 5–120 с, типово 30 (`minTime`/`maxTime`, `defaultDuelTime`); ставка 0–5000, типово 300 (`maxDuelStake`, `defaultDuelStake`); спроб одного дуелянта на запитання — до 30 (`maxDuelTries`, захист від засипання сервера). Перевірки схеми: кожна категорія має щонайменше `questionsPerDuel` запитань (`duel_category_short`), id категорій і запитань пулу не повторюються (`duplicate_duel_ids`).
- **Увімкнено = поле є.** Окремого прапорця `enabled` немає. Редактор вимикає дуелі, прибираючи поле (із `window.confirm`, якщо в пулі є текст) — так вимкнений недописаний пул не блокує збереження.
- **Поріг і межа.** `duelThreshold(quiz) = ⌈(запитань у всіх раундах, крім фінальних) / 3⌉` (клітинка поля — одне запитання); 0 таких запитань або немає `duels` → дуелей немає. «Зіграно» — закриті записи журналу з раундів не-фіналу. `duelCutoff(quiz)` — індекс першого фінального раунду, без фіналу — останнього раунду. Оголошувати можна на етапах `intro`, `board`, `question`, `locked`, `reveal`, `leaderboard`, `round_end`, якщо `roundIndex < duelCutoff` і поріг досягнуто. Вікторина з одним раундом без фіналу дуелей не має.
- **Коли починається.** Оголошена дуель стартує на найближчому `next` ведучого з `intro`, `reveal`, `leaderboard` або `round_end` (з `locked` — ні: спершу розкриття). Оголошена під час вибору клітинки чи запитання — після розкриття цього запитання; на `round_end` перед фіналом — до заставки фіналу. Тож оголошена дуель завжди встигає до межі.
- **Перевірки оголошення** по черзі: немає `duels` → `wrong_phase`; пауза → `paused`; невідомий гравець, невідомий суперник або суперник = сам → `not_found`; гравець уже оголошував → `duel_used`; інша дуель оголошена або йде → `duel_busy`; вікно закрите (етап, межа, поріг) → `wrong_phase`; у жодній категорії не лишилося запитань → `duel_empty`.
- **Категорія.** Вибирає той, хто оголосив, або ведучий за нього (вихід, якщо гравець відключився). Доступна категорія, у якій лишилося хоч одне невикористане запитання; `total = min(questionsPerDuel, залишок)` на мить вибору. Запитання: `pool[Math.floor(rng() × pool.length)]`, де `pool` — невикористані запитання категорії в авторському порядку; id одразу йде в `duelUsed`.
- **Відповідь.** Перевірка — та сама, що в типі `text` (`textMatches` з `check.ts`: `normalizeText`, будь-яке з написань). Перевірки по черзі: не етап `duel`/`question` → `wrong_phase`; пауза → `paused`; не дуелянт → `not_your_turn`; `now > endsAt` → `time_over`; 30 спроб уже є → `no_attempts`. Неправильна — текст іде в `tries` гравця, ack `{ ok: true }`. Правильна — переможець запитання, етап `answer`, годинник зупиняється. Час минув без правильної — `answer` без переможця (`tick`).
- **Пропустити запитання** (ведучий, етап `question`, не на паузі): запитання знімається з дуелі й не рахується (лишається в `duelUsed`), одразу береться інше з тієї самої категорії зі свіжим таймером; якщо в категорії порожньо — одразу підсумок.
- **Кінець дуелі.** З етапу `answer` `next` веде до підсумку, якщо зіграно `total`, або відрив більший за кількість запитань, що лишилися, або в категорії порожньо; інакше — наступне запитання. Підсумок: більше виграних — переможець; нічия — без змін; `stake > 0` і є переможець — два коригування `'duel'` поспіль (переможець першим). Ставка забирається повністю, навіть якщо рахунок стає від'ємним. Дуель без переміщення балів (нічия, ставка 0) в історії не лишає рядка.
- **Скасування.** Ведучий скасовує оголошену чи поточну дуель: етап повертається на `returnPhase` **без** кроку вперед, бали не змінюються, право того, хто оголосив, витрачене. Вилучення дуелянта скасовує дуель так само; якщо вилучено суперника до підсумку — той, хто оголосив, отримує право назад. `endRound` посеред дуелі скасовує її й завершує раунд; оголошена (ще не почата) дуель переживає `endRound` і стартує з `round_end`. `end` прибирає дуель.
- **Відключення й повернення.** Відключення дуелянта дуель не зупиняє (час іде, ведучий може пропустити запитання, вибрати категорію чи скасувати). Повернення — звичайний зріз зі стану: поле відповіді й власні спроби на місці.
- **Взаємодія з рештою гри.** Поле: `board` не змінюється, `tickBoard` і відлік відсутності на етапі `duel` не працюють, черга ходів після дуелі та сама. Дебафи: `fireDebuffs` викликає лише `openQuestion`, тож на запитаннях дуелі дебаф не спрацьовує, а чекає наступного звичайного запитання. Фінал: дуелі закінчуються до нього, межа ставок береться з рахунку з дуельними балами. `adjustTime` («±15 с») на дуелі — `wrong_phase`. Бали від ведучого під час дуелі дозволені.
- **Без витоку відповідей.** До етапу `answer` поточного запитання ні сцена, ні телефони не отримують жодного прийнятного написання; тексти інших запитань пулу не надсилаються ніколи (лише назви категорій і скільки лишилося); чужі тексти спроб не бачить ніхто, крім ведучого (самі спроби могли б підказати суперникові) — лише їх кількість.
- **Тексти без родів:** «Дуель: Оля — Петро», «Це запитання виграє Оля», «Перемога в дуелі: Оля!», «Оля +300 · Петро −300», в історії «Дуель: Іра +300, Оля −300».
- **Телефон без стрибків:** кнопка «⚔ Дуель» живе в шапці `.bar` (висота шапки не змінюється), вибір суперника — діалог поверх екрана, оголошена дуель — закріплена смуга `DuelBanner` (`position: fixed`), список власних спроб — блок фіксованої висоти з прокруткою всередині.
- **Ведучий:** головна кнопка на `reveal`/`intro`/`leaderboard`/`round_end` з оголошеною дуеллю — «Почати дуель»; на етапі дуелі: `answer` — «Наступне запитання дуелі» або «Підсумок дуелі», `result` — «Продовжити гру». Панель дуелі: категорії «за гравця», «Пропустити запитання», «Скасувати дуель» (з підтвердженням), прийнятні відповіді й тексти спроб.
- **Історія:** лише рядок коригувань (без самих запитань дуелі). `GameAdjustment` отримує `seq`; два коригування `'duel'` з сусідніми `seq` (`+` і `−`) складаються в один рядок; непарне (другого гравця вилучено) — «Дуель: Іра +300». Рядок «Бали від ведучого» тепер лише для `source: 'host'`. Окремої статистики дуелей у профілі немає.
- **Демо:** «Великий ерудит» отримує пул: «Столиці», «Хімічні елементи», «Українська література», по 5 запитань, 3 запитання за дуель, 30 с, ставка 300.

## Глобальні обмеження

- Старі вікторини (без `duels`), чернетки, знімки ігор, історія й профіль поводяться як зараз. Міграцій немає.
- Проста вікторина створюється так само: розділ «Дуелі» згорнутий і вимкнений; увімкнення дає валідні типові значення (3 запитання, 30 с, 300 балів) і одну категорію з трьома порожніми запитаннями.
- Рушій чистий: `now` і `rng` — аргументи. Бали лише цілі.
- Анти-ціль «спойлер»: до етапу `answer` жоден зріз сцени чи гравця не містить жодного написання з `accepted` поточного запитання дуелі; тексти невикористаних запитань пулу не потрапляють у жоден зріз; тексти чужих спроб — лише в `HostView`.
- Анти-ціль «гра застрягає»: на кожному етапі дуелі у ведучого є вихід — вибрати категорію за гравця, пропустити запитання, пауза, скасувати дуель, завершити раунд чи гру.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`. Нові кольори — токени в `:root` у `styles.css` (`--duel-accent`, `--duel-challenger`, `--duel-opponent`). Тема лише темна. Поля введення — у `label.field`, шрифт ≥ 16 px. Нові класи мають префікс `duel-`.
- Розкладка працює на ширині 375 px (і 360 px) без горизонтальної прокрутки. Анімації (пульс «⚔» у смузі) — лише за `prefers-reduced-motion: no-preference`.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2` (саме `--maxWorkers=2`: паралельні робітники PGlite падають на цій машині).
- Наскрізні тести: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Кадри — з `E2E_SHOTS=1` у `apps/server/e2e/artifacts/shots`.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (проєкт тестовий).

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/quiz.ts` | `LIMITS` дуелей, `duelQuestionSchema`, `duelCategorySchema`, `duelsSchema`, `quizSchema.duels`, перевірки | 1 |
| `packages/shared/src/game.ts`, `events.ts` | `Phase` `'duel'`, `DuelStage`, коди помилок, схеми й події | 1 |
| `apps/web/src/i18n.ts` | `phase_duel`, `err_duel_*` | 1 |
| `packages/engine/src/duel.ts` (новий), `check.ts`, `game.ts`, `index.ts`, `testing/fixtures.ts`, `testing/duel.ts` (новий) | стан дуелі, поріг, оголошення, категорія, відповіді, пропуск, підсумок, повернення | 2 |
| `packages/engine/src/game.ts`, `blitz.ts` (`nextDeadline`), `duel.ts` | пауза, вилучення, `endRound`/`end`, поле, дебафи, фінал | 3 |
| `packages/shared/src/views.ts`, `packages/engine/src/views.ts` | `DuelInfo`, `HostDuel`, `PlayerDuel`, годинник дуелі в зрізі | 4 |
| веб-фабрики зрізів у `apps/web/src/screens/*.test.tsx` | механічні `duel: null` | 4 |
| `apps/server/src/socket.ts`, `rooms/manager.ts`, `history.ts`, `packages/shared/src/history.ts` | події дуелі, `GameAdjustment.seq` | 5 |
| `apps/server/scripts/demo-quiz.ts`, `erudite-quiz.ts`, `demo-quiz.test.ts` | пул дуелей у демо | 5 |
| `apps/web/src/editor/DuelsEditor.tsx` (новий), `QuizEditor.tsx`, `QuestionEditor.tsx` (експорт `Rows`, `NumberField`), `draft.ts`, `draft-storage.ts` | розділ «Дуелі» | 6 |
| `apps/web/src/screens/DuelView.tsx` (новий), `PlayerScreen.tsx` | кнопка, діалог, смуга, гра дуелянта й глядача | 7 |
| `apps/web/src/screens/DuelView.tsx`, `StageScreen.tsx`, `HostScreen.tsx`, `apps/web/src/pages/GameHistory.tsx` | сцена, пульт, рядок історії | 8 |
| `apps/web/src/i18n.ts`, `apps/web/src/styles.css` | тексти й стилі веб-задач | 6–8 |
| `apps/server/e2e/full-game.e2e.ts` | наскрізний сценарій 7g | 9 |

## Порядок збирання

- Задача 1 (схема) — основа. Новий етап `'duel'` одразу отримує текст `phase_duel` (його вимагає `t(\`phase_${phase}\`)` у пульті), тож `pnpm typecheck` зелений.
- Задача 2 (рушій: цикл дуелі) — на 1. Задача 3 (взаємодія з рештою гри) — на 2. Задача 4 (зрізи) — на 2–3; нові обов'язкові поля зрізів закриваються механічними `duel: null` у веб-фабриках у тій самій задачі.
- Задача 5 (сервер, історія, демо) — на 1–4. Задача 6 (редактор) — на 1. Задачі 7 і 8 (екрани гри) — на 4 і 5 (`GameAdjustment.seq` для історії). Задача 9 (e2e) — остання.
- Наявні тести не змінюють очікувань, окрім механічних `duel: null` у веб-фабриках зрізів (задача 4) і рядка «Бали від ведучого», який тепер фільтрує `source: 'host'` (задача 8 — наявні дані тестів мають `source: 'host'`, очікування ті самі).

## На що дивитися рецензентові

1. **Відповідь дуелі не витікає.** До етапу `answer` `JSON.stringify` зрізів сцени, дуелянта й глядача не містить жодного написання з `accepted`; тексти невикористаних запитань пулу не з'являються ніколи; чужі спроби — лише кількістю. Тести: задача 4, `no answer of a duel question reaches the stage or phones before it closes`, `the duelist sees own tries, the others only counts`.
2. **Гра йде далі рівно з того місця.** Після дуелі з `reveal` відкривається наступне запитання/клітинка, з `round_end` — заставка наступного раунду, з `intro` поля з незакінченими кубиками — та сама заставка; черга ходів поля, дебафи й номери запитань не зсуваються; скасування не робить кроку вперед. Тести: задача 2, `after the duel the game goes on exactly where it was`, `the host cancels a declared or running duel`; задача 3, `board turns stay frozen through a duel`, `debuffs wait for the next real question`.
3. **Вікно доступності.** Поріг ⌈третини⌉ без фіналу з клітинками поля; межа — початок фіналу або останнього раунду; оголошена в останньому раунді перед межею дуель стартує з `round_end`; одна дуель на гравця, одна одночасно. Тести: задача 2, `duels are unavailable before a third…`, `the threshold counts board cells and skips the final`, `duels close when the final round starts…`, `one duel per player and one at a time`; задача 3, `a duel declared in the last round before the final starts at the round end`.
4. **Гра не застрягає й не ламається від підроблених подій:** відповідь не дуелянта, після часу, на паузі, 31-ша спроба; категорія від суперника, порожня категорія; події від неправильної ролі; вилучення дуелянта; відключення того, хто вибирає категорію; пауза посеред запитання дуелі. Тести: задача 2, `the first correct answer wins…`, `the challenger or the host picks a category…`; задача 3, `a pause holds the duel clock`, `kicking a duelist cancels the duel…`, `a disconnected duelist keeps the duel going…`; задача 5, `duel events are role-checked and validated`.
5. **Бали сходяться скрізь.** Ставка — два коригування `'duel'` поспіль, рахунок може піти в мінус, нічия й ставка 0 нічого не пишуть, рекордер зберігає їх з `source: 'duel'`, історія складає пару в один рядок, «Бали від ведучого» не змішуються з дуеллю, сповіщення ведучого не спливає від дуелі. Тести: задача 2, `more questions won wins; the stake moves…`, `a tie or a zero stake changes no points`; задача 5, `duel adjustments are saved with their source`; задача 8, `duel transfers show as duel lines…`.

---

### Задача 1. Схема: пул дуелей у вікторині, етап `duel`, події

**Files:**
- Modify: `packages/shared/src/quiz.ts` (`LIMITS`, нові схеми, `quizSchema`)
- Modify: `packages/shared/src/game.ts` (`Phase`, `DuelStage`, `ErrorCode`), `packages/shared/src/events.ts` (схеми й події)
- Modify: `apps/web/src/i18n.ts`
- Test: `packages/shared/src/quiz.test.ts`

**Interfaces:**
- Produces (`shared`):
  ```ts
  // LIMITS
  maxDuelCategories: 8, maxDuelCategoryQuestions: 20,
  maxDuelQuestions: 7, defaultDuelQuestions: 3, defaultDuelTime: 30,
  maxDuelStake: 5000, defaultDuelStake: 300,
  /** Спроб одного дуелянта на одне запитання. */
  maxDuelTries: 30,
  // quiz.ts
  export const duelQuestionSchema = z.object({
    id,                                                       // як у base
    text: trimmed.min(1).max(LIMITS.questionText),            // + isStorable
    accepted: z.array(trimmed.min(1).max(LIMITS.answerText)).min(1).max(LIMITS.maxAccepted),
  });
  export const duelCategorySchema = z.object({
    id, title: trimmed.min(1).max(LIMITS.categoryTitle),
    questions: z.array(duelQuestionSchema).min(1).max(LIMITS.maxDuelCategoryQuestions),
  });
  /** Дуелі вікторини; немає поля — дуелей немає. */
  export const duelsSchema = z.object({
    categories: z.array(duelCategorySchema).min(1).max(LIMITS.maxDuelCategories),
    questionsPerDuel: z.number().int().min(1).max(LIMITS.maxDuelQuestions),
    /** Секунд на одне запитання дуелі. */
    timeLimit: z.number().int().min(LIMITS.minTime).max(LIMITS.maxTime),
    /** Скільки програвший віддає переможцю; 0 — без втрат. */
    stake: z.number().int().min(0).max(LIMITS.maxDuelStake),
  });
  export type DuelQuestion = z.infer<typeof duelQuestionSchema>;
  export type DuelCategory = z.infer<typeof duelCategorySchema>;
  export type Duels = z.infer<typeof duelsSchema>;
  // quizSchema: duels: duelsSchema.optional()
  // game.ts
  export type Phase = … | 'duel';
  /** declared — оголошена, чекає кінця поточного запитання; далі етапи самої дуелі. */
  export type DuelStage = 'declared' | 'category' | 'question' | 'answer' | 'result';
  // ErrorCode: | 'duel_used' | 'duel_busy' | 'duel_empty'
  // events.ts
  export const declareSchema = z.object({ opponentId: playerId });
  export const duelPickSchema = z.object({ categoryId: id64 });
  export const duelAnswerSchema = z.object({ text: z.string().trim().min(1).max(LIMITS.answerText).refine(isStorable, UNSTORABLE) });
  'player:duel': (payload: z.infer<typeof declareSchema>, ack: Ack) => void;           // оголосити дуель суперникові
  'player:duel-category': (payload: z.infer<typeof duelPickSchema>, ack: Ack) => void; // вибір категорії тим, хто оголосив
  'player:duel-answer': (payload: z.infer<typeof duelAnswerSchema>, ack: Ack) => void;
  'host:duel-category': (payload: z.infer<typeof duelPickSchema>, ack: Ack) => void;   // за гравця
  'host:duel-skip': (ack: Ack) => void;
  'host:duel-cancel': (ack: Ack) => void;
  ```
- `quizSchema.superRefine`: якщо є `duels` — категорія з `questions.length < questionsPerDuel` → `duel_category_short`; повтор серед id категорій і запитань пулу разом → `duplicate_duel_ids`.
- Тексти:
  ```ts
  phase_duel: 'Дуель',
  err_duel_used: 'Ви вже оголошували дуель у цій грі.',
  err_duel_busy: 'Зараз уже оголошено іншу дуель.',
  err_duel_empty: 'Запитання для дуелі скінчилися.',
  ```

- [ ] **Step 1: Write the failing tests** у `quiz.test.ts` (наявні помічники `valid`, `round`; новий `duelsOf(patch)` — 2 категорії «Столиці» (`dc1`: `d1` «Столиця Франції?» [«Париж»], `d2` «Столиця Італії?» [«Рим»]) і «Хімія» (`dc2`: `d3` «Символ Fe — це…» [«Залізо», «Ферум»], `d4` «Символ Au — це…» [«Золото», «Аурум»]), `questionsPerDuel: 2`, `timeLimit: 30`, `stake: 300`):
  ```ts
  it('a quiz without duels stays valid and has none', () => {
    const parsed = quizSchema.parse(baseQuiz);   // наявна валідна вікторина з quiz.test.ts без duels
    expect(parsed.duels).toBeUndefined();
  });
  it('accepts a duel pool by categories with text answers', () => {
    expect(valid(quizSchema, { ...baseQuiz, duels: duelsOf() })).toBe(true);
  });
  it('duel limits', () => {
    // questionsPerDuel 0 і 8; timeLimit 4 і 121; stake −1, 5001, 1.5 — false; stake 0 і 5000 — true
    // 0 і 9 категорій; категорія без запитань і з 21; назва 41 символ; accepted [] і 11 написань; написання 201 символ — false
  });
  it('every duel category holds at least a duel\'s worth of questions', () => {
    // questionsPerDuel 3 при двох запитаннях у категорії → message 'duel_category_short'
  });
  it('duel ids do not repeat', () => { /* id запитання = id категорії або два однакові id запитань у різних категоріях → 'duplicate_duel_ids' */ });
  it('duel events check their payloads', () => {
    expect(valid(declareSchema, { opponentId: 'p2' })).toBe(true);
    expect(valid(declareSchema, { opponentId: 5 })).toBe(false);
    expect(valid(duelPickSchema, { categoryId: 'x'.repeat(65) })).toBe(false);
    expect(valid(duelAnswerSchema, { text: '  ' })).toBe(false);
    expect(valid(duelAnswerSchema, { text: 'я'.repeat(201) })).toBe(false);
    expect(valid(duelAnswerSchema, { text: ' Париж ' })).toBe(true);
  });
  ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared`. Очікується FAIL: схем немає.

- [ ] **Step 3: Implement** усе з Interfaces і тексти в `i18n.ts`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/web/src/i18n.ts
git commit -m "feat(shared): duels in the quiz — a pool by categories with text answers, questions per duel, time, stake; the duel phase and its events"
```

---

### Задача 2. Рушій: оголошення, категорія, відповіді, підсумок, повернення в гру

**Files:**
- Create: `packages/engine/src/duel.ts`, `packages/engine/src/game.duel.test.ts`, `packages/engine/src/testing/duel.ts`
- Modify: `packages/engine/src/check.ts` (`textMatches`, гілка `text` через неї), `packages/engine/src/game.ts` (`DuelState`, `DuelQuestionPlay`, поля `GameState`, `createGame`, `next`, `tick`), `packages/engine/src/index.ts` (`export * from './duel'`), `packages/engine/src/testing/fixtures.ts` (`duels`)

**Interfaces:**
- Consumes: `Duels`, `DuelStage`, коди `duel_*` (задача 1); `adjustScore` з `adjust.ts`.
- Produces (`engine`):
  ```ts
  // check.ts
  /** Чи збігається відповідь з одним із написань (як у типі text): normalizeText, порожня — ні. */
  export function textMatches(accepted: string[], value: string): boolean;
  // game.ts
  export interface DuelQuestionPlay {
    questionId: string;
    /** Неправильні спроби кожного дуелянта в порядку надсилання. */
    tries: Record<string, string[]>;
    /** Хто першим відповів правильно; null — ще ніхто або ніхто. */
    winnerId: string | null;
    /** Правильна відповідь переможця, як він її написав. */
    answer: string | null;
    /** Від відкриття запитання до правильної відповіді, мс. */
    timeMs: number | null;
  }
  export interface DuelState {
    challengerId: string;
    opponentId: string;
    stage: DuelStage;
    /** Етап гри, з якого почалася дуель; туди гра повертається. null, поки дуель лише оголошена. */
    returnPhase: Phase | null;
    categoryId: string | null;
    /** Скільки запитань зіграти: min(questionsPerDuel, залишок категорії) на мить вибору; до вибору 0. */
    total: number;
    /** Зіграні запитання й поточне (останнє); пропущені сюди не потрапляють. */
    questions: DuelQuestionPlay[];
    /** Переможець дуелі на етапі result; null — нічия або ще не result. */
    winnerId: string | null;
  }
  // GameState:
  /** Оголошена або поточна дуель; null — немає. */ duel: DuelState | null;
  /** Хто вже оголошував дуель у цій грі. */ duelsDeclared: string[];
  /** id запитань пулу, які вже з'являлися в дуелях цієї гри. */ duelUsed: string[];
  // duel.ts
  /** ⌈запитань не-фінальних раундів / 3⌉; null — дуелей немає (немає duels або таких запитань 0). */
  export function duelThreshold(quiz: Quiz): number | null;
  /** Індекс першого фінального раунду; без фіналу — останнього раунду. */
  export function duelCutoff(quiz: Quiz): number;
  /** Скільки запитань не-фінальних раундів уже закрито. */
  export function duelPlayed(state: GameState): number;
  /** Чи можна зараз оголосити дуель за етапом, межею й порогом (без перевірок гравця й зайнятості). */
  export function duelWindowOpen(state: GameState): boolean;
  /** Категорії пулу в авторському порядку зі скількома невикористаними запитаннями; [] без duels. */
  export function duelCategoriesLeft(state: GameState): { id: string; title: string; left: number }[];
  /** Поточне запитання дуелі (етапи question, answer); інакше null. */
  export function duelQuestionOf(state: GameState): DuelQuestion | null;
  export function declareDuel(state: GameState, challengerId: string, opponentId: string): Result;
  /** Ведучий: прибирає оголошену або поточну дуель (dropDuel); немає дуелі → not_found. */
  export function cancelDuel(state: GameState): Result;
  /** playerId null — ведучий за гравця. */
  export function pickDuelCategory(state: GameState, playerId: string | null, categoryId: string, now: number, rng: Rng): Result;
  export function answerDuel(state: GameState, playerId: string, text: string, now: number): Result;
  export function skipDuelQuestion(state: GameState, now: number, rng: Rng): Result;
  /** Чи веде наступне «Далі» з етапу answer до підсумку. */
  export function duelEnds(state: GameState): boolean;
  // внутрішні, для game.ts (коментар «не для сервера»):
  /** Оголошена дуель стартує на цьому next: етап intro, reveal, leaderboard або round_end і roundIndex < duelCutoff. */
  export function duelDue(state: GameState): boolean;
  /** phase 'duel', stage 'category', returnPhase = поточний етап, годинник порожній. */
  export function beginDuel(state: GameState): GameState;
  /** next на етапі duel: answer → наступне запитання або підсумок; result → повернення; інакше wrong_phase. */
  export function advanceDuel(state: GameState, now: number, rng: Rng): Result;
  /** tick на етапі duel: час запитання сплив → answer без переможця. */
  export function tickDuel(state: GameState, now: number): GameState;
  /** Прибирає дуель; на етапі duel повертає returnPhase з порожнім годинником (startedAt, endsAt, remainingMs — null). */
  export function dropDuel(state: GameState): GameState;
  // testing/fixtures.ts
  export const duels: Duels = { categories: [
      { id: 'dc1', title: 'Столиці', questions: [d1 «Столиця Франції?» [Париж], d2 «Столиця Італії?» [Рим], d3 «Столиця Польщі?» [Варшава]] },
      { id: 'dc2', title: 'Хімія', questions: [d4 «Символ Fe — це…» [Залізо, Ферум], d5 «Символ Au — це…» [Золото, Аурум], d6 «Символ O — це…» [Кисень, Оксиген]] } ],
    questionsPerDuel: 2, timeLimit: 20, stake: 300 };
  // testing/duel.ts
  /** Класика q1–q3, класика q4–q6, фінал; duels з patch. Поріг 2, межа — раунд 2. */
  export function duelQuiz(patch?: Partial<Duels>): Quiz;
  /** Оля p1, Петро p2, Іра p3; q1 і q2 зіграно (усі відповіли правильно), етап reveal q2, T0 = 1_000_000. */
  export function toDeclarable(patch?: Partial<Duels>): GameState;
  /** toDeclarable → p1 оголошує p2 → next → p1 вибирає 'dc1' з rng () => 0 о T1 → запитання d1, endsAt T1 + 20_000. */
  export function toDuelQuestion(patch?: Partial<Duels>): GameState;
  ```
- `next`: одразу після перевірки `paused` — `if (state.phase === 'duel') return advanceDuel(state, now, rng); if (duelDue(state)) return ok(beginDuel(state));`. `tick`: на початку — `if (state.phase === 'duel') return state.paused ? state : tickDuel(state, now);`.
- Повернення (`advanceDuel` з `result`): `back = { ...state, phase: returnPhase, duel: null }`; `moved = next(back, now, rng)`; `moved.ok ? moved : ok(back)` (наприклад, `dice_pending` на заставці поля).
- Підсумок: `wins` — кількість `winnerId` кожного; більше — `winnerId`; рівно — `null`. `stake > 0` і переможець → `adjustScore(s, winner, +stake, now, 'duel')`, далі `adjustScore(s, loser, −stake, now, 'duel')`. Годинник порожній.

- [ ] **Step 1: Write the failing tests** у `game.duel.test.ts` (`T0`, `T1 = T0 + 60_000`, `rng0 = () => 0`, `answers(s, id)` — `s.duel.questions.at(-1).tries[id]`):
  ```ts
  it('duels are unavailable before a third of the questions is played', () => {
    // гра duelQuiz на reveal q1 (1 закрите) → declareDuel(p1, p2) → 'wrong_phase'; toDeclarable() → ok, duel { stage 'declared', challengerId 'p1', opponentId 'p2', returnPhase null }
  });
  it('the threshold counts board cells and skips the final', () => {
    // класика 2 запитання + поле 3×3 + фінал → duelThreshold 4 (⌈11/3⌉); duelCutoff 2
    // класика 3 + класика 3 без фіналу → threshold 2, cutoff 1; лише один класичний раунд → cutoff 0 (дуелей немає)
    // вікторина без duels → null; лише фінал → null
  });
  it('duels close when the final round starts, or the last round without a final', () => {
    // duelQuiz: round_end раунду 2 (roundIndex 1) — ok; intro фіналу — 'wrong_phase'
    // без фіналу (класика 3 + класика 3): reveal q2 — ok; будь-який етап раунду 2 — 'wrong_phase'
  });
  it('one duel per player and one at a time', () => {
    // p1 → p2 ok; p3 → p1 'duel_busy'; p1 → p1 'not_found'; p1 → 'p9' 'not_found'; на паузі 'paused'
    // після скасування: p1 → p3 'duel_used', p3 → p2 ok; без duels → 'wrong_phase'
  });
  it('the duel starts after the reveal and pauses the round', () => {
    // оголошено під час запитання q2 (до lock): lock → locked; next → reveal (ще не дуель); next → phase 'duel',
    // duel { stage 'category', returnPhase 'reveal' }; plays.length не змінився, startedAt/endsAt null
  });
  it('the challenger or the host picks a category once; an empty category is unavailable', () => {
    // етап category: p2 → 'not_your_turn'; p1 'dc1' о T1 з rng0 → stage 'question', categoryId 'dc1', total 2,
    //   questions [{ questionId 'd1', tries {}, winnerId null }], duelUsed ['d1'], startedAt T1, endsAt T1 + 20_000
    // повторний вибір → 'wrong_phase'; ведучий (null) на етапі category — ok; 'dc9' → 'not_found'
    // duelUsed = ['d1','d2','d3'] → 'dc1' → 'duel_empty'; одна невикористана в 'dc1' → total 1
  });
  it('questions are drawn at random without repeats within the game', () => {
    // rng () => 0.99 → 'd3'; далі дуель Іри в тій самій категорії бере лише з d1, d2; duelCategoriesLeft → Столиці left 1
  });
  it('the first correct answer wins the question; wrong answers can be retried until the time is over', () => {
    let s = toDuelQuestion();
    s = must(answerDuel(s, 'p2', 'Львів', T1 + 1000));
    expect(answers(s, 'p2')).toEqual(['Львів']);
    expect(s.duel?.stage).toBe('question');
    s = must(answerDuel(s, 'p2', 'Ліон', T1 + 2000));
    expect(answerDuel(s, 'p3', 'Париж', T1 + 2500)).toEqual({ ok: false, error: 'not_your_turn' });
    s = must(answerDuel(s, 'p1', '  париж ', T1 + 3000));
    expect(s.duel?.questions[0]).toMatchObject({ winnerId: 'p1', answer: '  париж ', timeMs: 3000 });
    expect(s.duel?.stage).toBe('answer');
    expect(s.endsAt).toBeNull();
    expect(answerDuel(s, 'p2', 'Париж', T1 + 4000)).toEqual({ ok: false, error: 'wrong_phase' });
  });
  it('answers after the time or beyond the try limit are refused', () => {
    // відповідь о T1 + 20_001 → 'time_over'; 30 неправильних спроб p2 → 31-ша 'no_attempts'
  });
  it('time over: nobody wins the question', () => {
    // tick(s, T1 + 20_000) → stage 'answer', winnerId null; tick раніше — без змін
  });
  it('skipping a question draws another and does not count it', () => {
    // toDuelQuestion → skipDuelQuestion(s, T1 + 5000, rng0) → questions [{ questionId 'd2' }], duelUsed ['d1','d2'],
    //   startedAt T1 + 5000, endsAt T1 + 25_000; на етапі answer → 'wrong_phase'
    // усі запитання категорії використано → skip → stage 'result' (нічия, бо виграних немає)
  });
  it('more questions won wins; the stake moves as duel adjustments, even below zero', () => {
    // questionsPerDuel 3, stake 300; перед дуеллю ведучий знімає p2 весь рахунок (adjustScore на −рахунок, source 'host') → 0
    // p1 виграє d1 і d2 → після другого answer duelEnds === true (2:0, лишилося 1) → next → stage 'result', winnerId 'p1'
    // adjustments.slice(-2) → [{ playerId 'p1', points 300, source 'duel' }, { playerId 'p2', points −300, source 'duel' }], seq сусідні
    // рахунок p2 −300; lastNotice(s) — те саме коригування ведучого (дуельні пропускає)
  });
  it('a tie or a zero stake changes no points', () => {
    // 1:1 → result, winnerId null, adjustments без нових; stake 0, p1 виграв 2:0 → winnerId 'p1', adjustments без нових
  });
  it('after the duel the game goes on exactly where it was', () => {
    // з reveal q2: result → next → phase 'question', поточне запитання q3, plays.length 3, duel null
    // з round_end раунду 1 (оголошено на round_end) → після дуелі intro раунду 2, roundIndex 1
    // з leaderboard (settings.leaderboard 'each'): оголошено на leaderboard → після дуелі відкривається q3
    // з intro раунду поля з незакінченими кубиками (dice) → після дуелі phase 'intro' (next дав dice_pending)
  });
  it('the host cancels a declared or running duel', () => {
    // оголошена: cancelDuel → duel null, duelsDeclared ['p1'], етап reveal не змінився
    // на етапі question дуелі: cancelDuel → phase 'reveal', duel null, startedAt/endsAt/remainingMs null, adjustments без змін; next → q3
    // без дуелі → 'not_found'
  });
  ```
  `check.test.ts`: `textMatches(['Залізо', 'Ферум'], ' ферум ')` → `true`; `textMatches(['Залізо'], '')` → `false`; гілка `text` у `checkAnswer` поводиться як раніше (наявні тести).

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL: немає `duel.ts`.

- [ ] **Step 3: Implement** усе з Interfaces за правилами з «Рішень плану» (поріг, межа, перевірки оголошення, категорія, відповідь, пропуск, кінець дуелі, скасування). `createGame`: `duel: null, duelsDeclared: [], duelUsed: []`. `declareDuel` дописує гравця в `duelsDeclared`. Відкриття запитання дуелі (вибір категорії, наступне, заміна після пропуску): `startedAt = now`, `endsAt = now + timeLimit × 1000`, `remainingMs = null`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): duels — a third of the questions opens them, one per player, the challenger picks a category, the first right answer wins a question, retries until time, the stake moves as duel adjustments, the game goes on where it stood"
```

---

### Задача 3. Рушій: пауза, вилучення, кінець раунду, поле, дебафи, фінал

**Files:**
- Modify: `packages/engine/src/game.ts` (`pause`, `resume`, `removePlayer`, `endRound` і його `IN_ROUND`, `end`), `packages/engine/src/blitz.ts` (`nextDeadline`), `packages/engine/src/duel.ts` (за потреби)
- Create: `packages/engine/src/game.duel-play.test.ts`

**Interfaces:**
- Consumes: усе з задачі 2.
- Правила:
  - `pause`: етап `duel` з `endsAt !== null` — та сама гілка, що й для `question` (`remainingMs`, `startedAt`/`endsAt` → null); інші етапи дуелі — загальна гілка.
  - `resume`: етап `duel` з `remainingMs !== null` → `endsAt = now + remainingMs`, `startedAt = endsAt − timeLimit × 1000`, `remainingMs = null`.
  - `nextDeadline`: етап `duel` → `endsAt`, якщо не пауза, `endsAt !== null` і `endsAt > now`; інакше `null`.
  - `removePlayer`: гравця прибрано з `duelsDeclared`; дуель з ним → `dropDuel`; якщо вилучено суперника і дуель ще не на `result` — той, хто оголосив, теж прибирається з `duelsDeclared` (право повертається).
  - `endRound`: `'duel'` у `IN_ROUND`; на етапі `duel` спершу `dropDuel`, далі як завжди (`finishRound`). Оголошена дуель (`stage 'declared'`) не чіпається.
  - `end`: `duel: null`.

- [ ] **Step 1: Write the failing tests** у `game.duel-play.test.ts` (хелпери з `testing/duel.ts`):
  ```ts
  it('a pause holds the duel clock', () => {
    // toDuelQuestion (endsAt T1 + 20_000); pause о T1 + 5000 → remainingMs 15_000, endsAt null; answerDuel → 'paused'
    // tick о T1 + 30_000 на паузі — без змін; resume о T1 + 60_000 → endsAt T1 + 75_000; tick о T1 + 74_000 — stage 'question'
  });
  it('nextDeadline points at the duel question end', () => {
    // на question → T1 + 20_000; на паузі, на category, answer, result → null
  });
  it('board turns stay frozen through a duel', () => {
    // класика 2 + поле 3×3 + фінал, duels; поріг 4 досягнуто на полі (2 класичні + 2 клітинки); p1 оголошує p2 під час клітинки
    // паралельно стан без дуелі: next(reveal) → board з chooser X; з дуеллю: next → duel …(виграти й підсумок)… next → board з тим самим chooser, board.done і circleNo ті самі
    // на етапі duel setConnected(chooser, false) → board.awaySince null, nextDeadline null
  });
  it('debuffs wait for the next real question', () => {
    // setDebuff(p1, 'fog') до дуелі; протягом дуелі debuffs.p1.firedAt === null; після повернення відкривається q3 → firedAt = індекс q3
  });
  it('kicking a duelist cancels the duel; kicking the opponent gives the challenger the right back', () => {
    // на етапі question: removePlayer(p2) → phase 'reveal', duel null, duelsDeclared не містить p1 (може оголосити знову)
    // removePlayer(p1) посеред дуелі → phase 'reveal', duel null
    // вилучення p3 (не дуелянт) → дуель без змін
    // на result вилучено p2 → дуель прибрано, p1 лишається в duelsDeclared, його +300 лишається
  });
  it('ending the round or the game mid-duel drops the duel', () => {
    // endRound на етапі question дуелі → phase 'round_end', duel null, adjustments без змін; оголошена дуель переживає endRound (stage 'declared')
    // end посеред дуелі → phase 'finished', duel null
  });
  it('a disconnected duelist keeps the duel going; the host may pick the category', () => {
    // setConnected(p1, false) на етапі category → duel без змін; pickDuelCategory(s, null, 'dc2', …) → stage 'question'
  });
  it('a duel declared in the last round before the final starts at the round end', () => {
    // оголошено під час q6 (раунд 2), next … → round_end → next → phase 'duel', returnPhase 'round_end'; після підсумку next → intro фіналу
  });
  it('duel points count towards the final wager limit', () => {
    // p1 виграв дуель (+300) → далі до етапу wager → final.limits.p1 === рахунок p1 з дуельними балами
  });
  it('host time buttons do nothing in a duel', () => { /* adjustTime(s, 15, …) на question дуелі → 'wrong_phase' */ });
  ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.

- [ ] **Step 3: Implement** правила з Interfaces.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): duels and the rest of the game — a pause holds the duel clock, kicks and round ends drop the duel, board turns and debuffs wait, duel points reach the final limit"
```

---

### Задача 4. Зрізи: дуель для всіх, відповіді й спроби — лише ведучому

**Files:**
- Modify: `packages/shared/src/views.ts` (`DuelInfo`, `HostDuel`, `PlayerDuel`, `BaseView.duel`, `HostView.duel`, `PlayerView.me.duel`)
- Modify: `packages/engine/src/views.ts` (`BETWEEN_QUESTIONS` + `'duel'`, `base`, нові `duelInfo`, `hostDuel`, `playerDuel`)
- Modify (механічно): фабрики зрізів у `apps/web/src/screens/*.test.tsx` і `apps/web/src/live/*.test.tsx` (`duel: null` у корені зрізу й у `me`) — знайти через `pnpm typecheck`
- Test: `packages/engine/src/views.duel.test.ts` (новий)

**Interfaces:**
- Consumes: `duelCategoriesLeft`, `duelQuestionOf`, `duelEnds`, `duelWindowOpen` (задача 2).
- Produces (`shared/views.ts`):
  ```ts
  export interface DuelInfo {
    challenger: BlitzPlayer;
    opponent: BlitzPlayer;
    stage: DuelStage;
    /** Категорії пулу: назва й скільки запитань ще не було; left 0 — недоступна. */
    categories: { id: string; title: string; left: number }[];
    /** Назва вибраної категорії; null до вибору. */
    category: string | null;
    /** 1-базовий номер поточного запитання дуелі; 0 до першого. */
    number: number;
    /** Скільки запитань у дуелі: після вибору категорії — total, до того — questionsPerDuel. */
    total: number;
    /** Текст поточного запитання (question, answer); інакше null. */
    question: string | null;
    /** Прийнятні написання поточного запитання; сцені й гравцям — лише на answer, інакше null. */
    accepted: string[] | null;
    wins: { challenger: number; opponent: number };
    /** Скільки неправильних спроб у поточному запитанні; самих текстів тут немає. */
    tries: { challenger: number; opponent: number };
    /** answer: хто виграв запитання (null — ніхто) і як написав. */
    questionWinner: BlitzPlayer | null;
    winningAnswer: string | null;
    /** result: переможець; null — нічия. */
    winner: BlitzPlayer | null;
    stake: number;
    /** answer: наступне «Далі» веде до підсумку. */
    ending: boolean;
  }
  /** Як DuelInfo, але accepted заповнене і на question. */
  export interface HostDuel extends DuelInfo {
    /** Тексти неправильних спроб у поточному запитанні. */
    tryTexts: { challenger: string[]; opponent: string[] };
  }
  export interface PlayerDuel {
    /** Кнопка «Дуель»: null — не показувати (ще рано, уже пізно, своя дуель уже була, запитання скінчилися, не етап гри). */
    rights: { canDeclare: boolean; opponents: BlitzPlayer[] } | null;
    /** Власні неправильні спроби в поточному запитанні дуелі; [] для глядача. */
    tries: string[];
    /** Дуелянт, етап question, не пауза, запитання ще не виграно. */
    canAnswer: boolean;
    /** Цей гравець оголосив дуель і зараз етап category. */
    canPick: boolean;
  }
  // BaseView: /** Оголошена або поточна дуель; null — немає. */ duel: DuelInfo | null;
  // HostView: duel: HostDuel | null;
  // PlayerView.me: /** null — у вікторині немає дуелей. */ duel: PlayerDuel | null;
  ```
- `rights`: `null`, якщо `!duelWindowOpen(state)`, гравець у `duelsDeclared` або всі категорії порожні; інакше `canDeclare = state.duel === null && !state.paused && opponents.length > 0`, `opponents` — усі інші гравці в порядку гравців.
- `base`: `duel: duelInfo(state, false)`; `limitMs` на етапі `duel`/`question` — `timeLimit × 1000`; `question`, `board`, `blitz`, `spotlight` на етапі `duel` — `null` (через `BETWEEN_QUESTIONS`).

- [ ] **Step 1: Write the failing tests** у `views.duel.test.ts`:
  ```ts
  it('no answer of a duel question reaches the stage or phones before it closes', () => {
    let s = toDuelQuestion();
    s = must(answerDuel(s, 'p2', 'Львів', T1 + 1000));
    for (const json of [JSON.stringify(stageView(s)), JSON.stringify(playerView(s, 'p1')), JSON.stringify(playerView(s, 'p3'))]) {
      expect(json).toContain('Столиця Франції?');
      expect(json).not.toContain('Париж');
      for (const other of ['Столиця Італії?', 'Столиця Польщі?', 'Символ Fe — це…', 'Рим', 'Залізо']) expect(json).not.toContain(other);
    }
    // після правильної відповіді p1 (етап answer): stageView(s).duel.accepted === ['Париж'], winningAnswer, questionWinner Оля
  });
  it('the host sees the accepted answers and every try', () => {
    // hostView(s).duel → accepted ['Париж'] на question, tryTexts { challenger: [], opponent: ['Львів'] }
  });
  it('the duelist sees own tries, the others only counts', () => {
    // playerView(p2).me.duel.tries ['Львів'], canAnswer true; playerView(p3).me.duel → tries [], canAnswer false; JSON p3 без 'Львів'
    // stageView.duel.tries { challenger: 0, opponent: 1 }; на паузі canAnswer false
  });
  it('the duel button: hidden before a third and after the own duel, disabled while another is declared', () => {
    // reveal q1: me.duel.rights null; toDeclarable: rights { canDeclare: true, opponents: [Петро, Іра] } для Олі
    // p1 оголосив: p1 rights null, p3 rights.canDeclare false, stageView.duel.stage 'declared', challenger Оля, opponent Петро, number 0, total 2
    // вікторина без duels: me.duel null, stageView.duel null; intro фіналу: rights null
  });
  it('the duel clock lives in the base view', () => {
    // на question дуелі: endsAt T1 + 20_000, limitMs 20_000, question null, board null; на паузі remainingMs; на answer limitMs null
  });
  it('the challenger picks; categories count what is left', () => {
    // етап category: playerView(p1).me.duel.canPick true, p2 false; categories [{ id 'dc1', title 'Столиці', left 3 }, { 'dc2', 'Хімія', left 3 }]
    // після дуелі в 'dc1' з двома запитаннями → left 1
  });
  it('the result shows the winner, the stake and the ending flag', () => {
    // на answer другого запитання 2:0 → ending true; result → winner Оля, wins { 2, 0 }, stake 300; нічия → winner null
  });
  ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.

- [ ] **Step 3: Implement** за Interfaces; `tries` і `wins` — у порядку `challenger`, `opponent`; `number = duel.questions.length` на етапах question/answer/result.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages apps/web/src
git commit -m "feat(engine): duel views — the duel for everyone without its answers before they close, tries only as counts, the button rights on the phone, answers and tries for the host"
```

---

### Задача 5. Сервер: події дуелі, історія коригувань, демо-пул

**Files:**
- Modify: `apps/server/src/socket.ts` (шість подій), `apps/server/src/rooms/manager.ts` (`declareDuel`, `duelCategory`, `duelAnswer`, `HostAction`), `apps/server/src/history.ts` (`seq` у `adjustments`), `packages/shared/src/history.ts` (`GameAdjustment.seq`)
- Modify: `apps/server/scripts/demo-quiz.ts` (помічник `duelQ`), `apps/server/scripts/erudite-quiz.ts`, `apps/server/scripts/demo-quiz.test.ts`
- Test: `apps/server/src/socket.test.ts`, `apps/server/src/rooms/manager.test.ts`, `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts`, `apps/server/src/quizzes.test.ts`

**Interfaces:**
- Consumes: схеми й події (задача 1), функції рушія (задачі 2–3).
- Produces:
  ```ts
  // manager.ts
  declareDuel(room: Room, playerId: string, opponentId: string): AckResult;              // apply(declareDuel(…))
  duelCategory(room: Room, playerId: string, categoryId: string): AckResult;             // apply(pickDuelCategory(…, this.now(), this.rng))
  duelAnswer(room: Room, playerId: string, text: string): AckResult;                     // apply(answerDuel(…, this.now()))
  // HostAction: { type: … | 'duel-skip' | 'duel-cancel' } | { type: 'duel-category'; categoryId: string }
  //   'duel-skip' → skipDuelQuestion(state, now, rng); 'duel-cancel' → cancelDuel(state); 'duel-category' → pickDuelCategory(state, null, …)
  // shared/history.ts, GameAdjustment: /** Номер коригування в грі: два дуельні поспіль — одна дуель. */ seq: number;
  // scripts/demo-quiz.ts
  /** Запитання дуелі: текст і прийнятні написання. */
  export const duelQ = (text: string, accepted: string[]): DuelQuestion;   // id через наявний id('d')
  ```
- Демо в `erudite-quiz.ts` (`duels`, після `rounds`), `questionsPerDuel: 3`, `timeLimit: 30`, `stake: 300`; категорії з `id('dc')`:
  - «Столиці»: «Столиця Канади?» [Оттава]; «Столиця Австралії?» [Канберра]; «Столиця Туреччини?» [Анкара]; «Столиця Бразилії?» [Бразиліа, Бразилія]; «Столиця Казахстану?» [Астана];
  - «Хімічні елементи»: «Який елемент позначають символом Fe?» [Залізо, Ферум]; «… Au?» [Золото, Аурум]; «… Na?» [Натрій]; «… Ag?» [Срібло, Аргентум]; «… K?» [Калій];
  - «Українська література»: «Хто написав повість «Кайдашева сім'я»?» [Іван Нечуй-Левицький, Нечуй-Левицький]; «Хто автор «Енеїди» (1798)?» [Іван Котляревський, Котляревський]; «Хто написав поему «Мойсей»?» [Іван Франко, Франко]; «Хто авторка драми-феєрії «Лісова пісня»?» [Леся Українка]; «Хто написав роман «Тигролови»?» [Іван Багряний, Багряний].
  - Опис вікторини доповнити реченням «Після третини запитань можна викликати суперника на дуель.»

- [ ] **Step 1: Write the failing tests.**
  - `socket.test.ts`: `duel events are role-checked and validated` — у грі з `duels` на `reveal` після порогу: `player:duel` `{ opponentId: <id Петра> }` від гравця → `ok`; від ведучого й сцени → `forbidden`; `{ opponentId: 5 }` → `invalid_payload`; `player:duel-answer` `{ text: 'я'.repeat(201) }` → `invalid_payload`; `host:duel-category` від гравця → `forbidden`; `host:duel-skip` і `host:duel-cancel` від гравця → `forbidden`, від ведучого без дуелі → `wrong_phase` і `not_found`.
  - `manager.test.ts`: `a duel question closes on time by the scheduler` — `FakeScheduler`: дуель на етапі question, просунути годинник на `timeLimit × 1000` → `room.state.duel.stage === 'answer'`; `kicking a duelist mid-duel returns the game to the reveal` — `host({ type: 'kick', playerId: p2 })` → `phase 'reveal'`, `duel null`.
  - `recorder.test.ts`: `duel adjustments are saved with their source` — після підсумку зі ставкою 300 у `score_adjustment` два рядки `{ points: 300, source: 'duel' }` і `{ points: −300, source: 'duel' }` з сусідніми `seq`; `participant.score` збігається з рахунком.
  - `history.test.ts`: `history adjustments carry seq and source` — `GameDetail.adjustments` у порядку `seq` з полями `seq` і `source` (`'host'` і два `'duel'`).
  - `quizzes.test.ts`: `a quiz with duels saves and loads; an invalid pool is refused` — збереження з `duels` повертає ті самі `duels`; категорія з меншим за `questionsPerDuel` числом запитань → 400.
  - `demo-quiz.test.ts`: `the erudite quiz has a duel pool` — `eruditeQuiz.duels` має 3 категорії по 5 запитань, `questionsPerDuel 3`, `stake 300`; `quizSchema.safeParse(eruditeQuiz).success`; кожне запитання пулу має ≥ 1 написання.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server`. Очікується FAIL.

- [ ] **Step 3: Implement.** `socket.ts` — за зразком `player:sort` і `host:pick`; `'duel-skip'`, `'duel-cancel'` додати до `SIMPLE_HOST_ACTIONS`. Рекордер не змінюється (коригування вже пишуться всі; тест це фіксує).

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server packages/shared
git commit -m "feat(server): duel events, adjustment numbers in the history, a duel pool in the erudite demo"
```

---

### Задача 6. Редактор: розділ «Дуелі»

**Files:**
- Create: `apps/web/src/editor/DuelsEditor.tsx`
- Modify: `apps/web/src/editor/QuizEditor.tsx` (розділ після `details.rules`; помилки дуелей розгортають його), `apps/web/src/editor/QuestionEditor.tsx` (експорт `Rows` і `NumberField` без змін поведінки), `apps/web/src/editor/draft.ts` (`newDuels`, `newDuelCategory`, `newDuelQuestion`, `cleaned`, `problemsOf`), `apps/web/src/editor/draft-storage.ts` (`loadDraft` відновлює `duels`)
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/editor/draft.test.ts`, `apps/web/src/editor/QuizEditor.test.tsx`, `apps/web/src/storage.test.ts` або наявний тест `draft-storage`

**Interfaces:**
- Consumes: `Duels`, `LIMITS` (задача 1).
- Produces:
  ```ts
  // draft.ts
  export function newDuelQuestion(): DuelQuestion;              // { id: newId(), text: '', accepted: [''] }
  export function newDuelCategory(count: number): DuelCategory; // { id: newId(), title: '', questions: count × newDuelQuestion() }
  export function newDuels(): Duels;                            // 1 категорія з defaultDuelQuestions запитань; questionsPerDuel 3, timeLimit 30, stake 300
  // DuelsEditor.tsx
  export function DuelsEditor(props: { duels: Duels | undefined; onChange: (next: Duels | undefined) => void }): JSX.Element;
  ```
- Розкладка `DuelsEditor`: `label.check` «Дуелі між гравцями» (вимкнення з текстом у пулі — `window.confirm(t('duelsOffConfirm'))`); коли ввімкнено — `p.meta` `duelsHint`, три `NumberField` («Запитань за дуель», «Час на запитання дуелі, с», «Ставка: програвший віддає переможцю») і `p.meta` `duelsStakeHint`; чипи категорій («Столиці · 3 запитання» через `countText('questionCount', …)`, порожня назва — «Категорія N») і «Додати категорію» (до 8); під чипами — вибрана категорія: `label.field` «Назва категорії» (`maxLength 40`), «Прибрати категорію «…»» (вимкнена, коли категорія одна), запитання блоками: `label.field` «Запитання N» (`textarea`, `maxLength 300`), `Rows` написань (наявні ключі `spellingN`, `addSpelling`, `removeSpelling`, до 10), «Прибрати запитання N» (не нижче 1), «Додати запитання» (до 20).
- `cleaned`: тексти й назви `trim`; написання `trim` і без порожніх; повністю порожні запитання в кінці категорії прибираються, поки їх не менше `questionsPerDuel`.
- `problemsOf` (після проблем раундів, у такому порядку): налаштування поза межами → `problemDuelSettings`; категорія без назви → `problemDuelTitle`; запитання без тексту або без написання → `problemDuelQuestion`; запитань менше за `questionsPerDuel` → `problemDuelShort`. `firstProblem` не змінюється.
- `loadDraft`: `duels` з об'єктом і масивом `categories` лишається (числа, яких немає, — типові значення); інакше поле прибирається.
- Тексти:
  ```ts
  duelsTitle: 'Дуелі',
  duelsToggle: 'Дуелі між гравцями',
  duelsHint: 'Після третини запитань гравець може раз за гру викликати суперника на дуель. Обидва вписують відповіді на запитання з вибраної категорії; хто першим відповість правильно, виграє запитання.',
  duelsPerDuel: 'Запитань за дуель',
  duelsTime: 'Час на запитання дуелі, с',
  duelsStake: 'Ставка: програвший віддає переможцю',
  duelsStakeHint: '0 — без втрат: бали не змінюються.',
  duelsOffConfirm: 'Вимкнути дуелі? Категорії й запитання дуелей буде видалено.',
  duelCategoryN: 'Категорія {index}',
  duelCategoryTitle: 'Назва категорії',
  addDuelCategory: 'Додати категорію',
  removeDuelCategory: 'Прибрати категорію «{name}»',
  duelQuestionN: 'Запитання {index}',
  addDuelQuestion: 'Додати запитання',
  removeDuelQuestion: 'Прибрати запитання {index}',
  problemDuelSettings: 'Дуелі: запитань за дуель — від 1 до 7, час — від 5 до 120 с, ставка — від 0 до 5000.',
  problemDuelTitle: 'Дуелі: у категорії {index} немає назви.',
  problemDuelQuestion: 'Дуелі, «{category}»: у запитанні {index} заповніть текст і хоча б одну правильну відповідь.',
  problemDuelShort: 'Дуелі, «{category}»: замало запитань — потрібно щонайменше {needed}.',
  ```

- [ ] **Step 1: Write the failing tests.**
  - `draft.test.ts`:
    - `new duels are valid once their texts are filled` — `newDuels()` має 1 категорію з 3 запитаннями, `questionsPerDuel 3`, `timeLimit 30`, `stake 300`; після заповнення назви, текстів і написань `problemsOf({ ...quiz, duels })` порожній, `quizSchema.safeParse(cleaned(…)).success`.
    - `cleaning duels trims texts, drops blank spellings and blank trailing questions above the need` — 5 запитань (2 останні порожні) при `questionsPerDuel 3` → 3; написання `[' Париж ', '']` → `['Париж']`.
    - `duel problems name the cause` — `questionsPerDuel 8` → `problemDuelSettings`; порожня назва → `problemDuelTitle` з `index 1`; запитання без написання → `problemDuelQuestion`; 2 запитання при `questionsPerDuel 3` → «Дуелі, «Столиці»: замало запитань — потрібно щонайменше 3.»
    - `a quiz without duels has no duel problems` — `newQuiz()` без `duels`.
  - draft-storage (тест поруч із наявними тестами `loadDraft`): `a draft keeps its duels; broken duels are dropped` — чернетка з `duels` повертається з ними; `duels: 'x'` → поля немає; чернетка без `duels` — без нього.
  - `QuizEditor.test.tsx`:
    - `the author turns on duels and fills the pool` — розділ «Дуелі» згорнутий; галочка «Дуелі між гравцями» показує поля «Запитань за дуель» = 3, «Час на запитання дуелі, с» = 30, «Ставка: програвший віддає переможцю» = 300, підказки, чип «Категорія 1 · 3 запитання»; заповнити «Назва категорії», «Запитання 1…3», «Написання 1»; «Додати категорію» → другий чип вибраний; «Прибрати категорію «…»» прибирає його; «Зберегти» → `onSave` отримує вікторину з `duels`, що проходить `quizSchema`.
    - `too few questions in a duel category stops saving with a clear message` — «Запитань за дуель» 4 при 3 запитаннях → у `.problems` «Дуелі, «Столиці»: замало запитань — потрібно щонайменше 4.», розділ розгорнутий, `onSave` не викликано.
    - `turning duels off asks before dropping a filled pool` — `confirm` → `false`: дуелі лишаються; `true`: поля зникають, збережена вікторина без `duels`; вимкнення порожнього пулу не питає.
    - `every duel input sits in a field wrapper` — усі нові `input`, `textarea` у `label.field` (галочка — у `label.check`).

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/editor apps/web/src/storage.test.ts`. Очікується FAIL.

- [ ] **Step 3: Implement** за Interfaces. `QuizEditor`: `<details className="rules duels" open={duelsOpen}>` з `summary` «Дуелі» одразу після `details.rules`; `update({ ...quiz, duels })` або без поля, коли вимкнено. `styles.css`: чипи категорій переносяться, блок запитання не ширший за екран на 375 px.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): duels in the editor — on/off, questions per duel, time, stake, a pool by categories with accepted spellings, a check that each category fills a duel"
```

---

### Задача 7. Телефон: кнопка «Дуель», вибір суперника, смуга, гра дуелянта й глядача

**Files:**
- Create: `apps/web/src/screens/DuelView.tsx` (`DuelButton`, `DuelBanner`, `DuelPlay`, `duelScoreText`), `apps/web/src/screens/DuelView.test.tsx`
- Modify: `apps/web/src/screens/PlayerScreen.tsx` (кнопка в `.bar`, смуга, гілка `phase === 'duel'`)
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/styles.css` (`--duel-accent`, `--duel-challenger`, `--duel-opponent` у `:root`, класи `duel-*`)
- Test: `apps/web/src/screens/PlayerScreen.test.tsx`

**Interfaces:**
- Consumes: `DuelInfo`, `PlayerDuel` (задача 4); події `player:duel`, `player:duel-category`, `player:duel-answer` (задача 1).
- Produces:
  ```ts
  /** «Оля 1 : 0 Петро». */
  export function duelScoreText(duel: DuelInfo): string;
  /** Кнопка в шапці; null без rights. Відкриває діалог вибору суперника. */
  export function DuelButton(props: { duel: PlayerDuel | null; send: Send; onError: (text: string | null) => void }): JSX.Element | null;
  /** Закріплена смуга оголошеної дуелі (stage 'declared'); position: fixed — нічого не зсуває. */
  export function DuelBanner(props: { duel: DuelInfo | null }): JSX.Element | null;
  /** Екран етапу duel на телефоні: дуелянт відповідає, решта дивиться. */
  export function DuelPlay(props: { view: PlayerView; offsetMs: number; send: Send; onError: (text: string | null) => void }): JSX.Element;
  ```
- Тексти:
  ```ts
  duelButton: '⚔ Дуель',
  duelBusy: 'Зараз уже оголошено дуель',
  duelPickTitle: 'Кого викликати на дуель?',
  duelPickHint: 'Одна дуель за гру. Суперник не може відмовитися.',
  duelBanner: '⚔ Дуель: {challenger} — {opponent}. Почнеться після цього запитання.',
  duelTitle: 'Дуель',
  duelScore: '{challenger} {a} : {b} {opponent}',
  duelQuestionOf: 'Запитання {index} з {total} · {category}',
  duelChooseCategory: 'Виберіть категорію',
  duelCategoryLeft: '{title} · лишилося {left}',
  duelChoosing: '{name} вибирає категорію',
  duelAnswerLabel: 'Ваша відповідь',
  duelSend: 'Відповісти',
  duelWrongTry: '✗ {text}',
  duelTries: 'Спроби: {challenger} {a} · {opponent} {b}',
  duelCorrect: 'Правильна відповідь: {answer}',
  duelQuestionWon: 'Це запитання виграє {name}: «{answer}»',
  duelNobody: 'Ніхто не відповів правильно',
  duelWinner: 'Перемога в дуелі: {name}!',
  duelTransfer: '{winner} +{stake} · {loser} −{stake}',
  duelTie: 'Нічия — бали не змінюються',
  duelNoStake: 'Без ставки — бали не змінюються',
  ```

- [ ] **Step 1: Write the failing tests** у `DuelView.test.tsx` (фабрики `duelInfo(patch)`, `playerDuel(patch)`; `send = vi.fn().mockResolvedValue({ ok: true })`):
  ```ts
  it('the duel button opens the opponent list and declares', async () => {
    // rights { canDeclare: true, opponents: [Петро p2, Іра p3] } → кнопка «⚔ Дуель»; клік → role="dialog" «Кого викликати на дуель?», duelPickHint,
    // кнопки «Петро», «Іра», «Скасувати»; клік «Петро» → send('player:duel', { opponentId: 'p2' }), діалог закрито
  });
  it('the button hides without rights and is disabled while another duel is declared', () => {
    // rights null → кнопки немає; canDeclare false → disabled, title «Зараз уже оголошено дуель»
  });
  it('the declared duel shows a fixed banner', () => {
    // duelInfo({ stage: 'declared' }) → .duel-banner «⚔ Дуель: Оля — Петро. Почнеться після цього запитання.»; на stage 'question' банера немає
  });
  it('the challenger picks a category, the others wait', () => {
    // canPick → «Виберіть категорію», кнопки «Столиці · лишилося 3», «Хімія · лишилося 0» (disabled); клік → send('player:duel-category', { categoryId: 'dc1' })
    // canPick false → «Оля вибирає категорію», кнопок немає
  });
  it('a duelist types answers until right; a wrong try stays listed', async () => {
    // canAnswer → питання, Timer, label.field «Ваша відповідь» (font ≥ 16 px через клас), «Відповісти»;
    // ввести «Львів», надіслати → send('player:duel-answer', { text: 'Львів' }); поле очищене й у фокусі;
    // rerender з tries ['Львів'] → «✗ Львів» у .duel-tries; поки відповідь летить, друге надсилання не йде
    // canAnswer false → поле disabled; .duel-tries є і порожнім (місце зарезервоване)
  });
  it('spectators see the question, the clock and the score, not the tries', () => {
    // me.duel.canAnswer false, tries [] → текст запитання, «Оля 0 : 0 Петро», «Спроби: Оля 0 · Петро 2», поля відповіді немає
  });
  it('the answer and the result', () => {
    // answer: «Правильна відповідь: Париж», «Це запитання виграє Оля: «париж»»; без переможця — «Ніхто не відповів правильно»
    // result: «Перемога в дуелі: Оля!», «Оля +300 · Петро −300»; winner null → «Нічия — бали не змінюються»; stake 0 → «Без ставки — бали не змінюються»
  });
  it('reduced motion: the banner does not pulse', () => { /* matchMedia reduce → .duel-banner без класу is-pulsing */ });
  ```
  `PlayerScreen.test.tsx`:
  - `the duel button sits in the header and moves nothing` — з `me.duel.rights` і без нього елемент `.question` той самий, кнопка всередині `header.bar`.
  - `phase duel shows the duel instead of the game` — `phase: 'duel'`, `view.duel` → `DuelPlay`; рахунок у шапці; `AdjustmentToast` лишається.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - `DuelButton`: діалог — `div.duel-dialog[role="dialog"][aria-modal="true"]` поверх екрана (`position: fixed`), Escape і «Скасувати» закривають; поки подія летить — кнопки вимкнені; помилка — через `onError(errorText(…))`.
  - `DuelPlay`: зверху `h2` «Дуель», рядок `duelScoreText` (кольори `--duel-challenger` / `--duel-opponent`), `duelQuestionOf`; далі за `stage`. Таймер — наявний `Timer` з `total={view.limitMs}` і `timerStatus(view)`. Форма: `label.field` + кнопка; після ack `{ ok: true }` поле очищується. `.duel-tries` — фіксована висота (3 рядки), прокрутка всередині.
  - `PlayerScreen`: `DuelButton` у `header.bar` між іменем і рахунком; `DuelBanner` поруч з `AdjustmentToast`; `{phase === 'duel' && view.duel !== null && <DuelPlay … />}`.
  - `styles.css`: `.duel-button` не вища за рядок шапки; `.duel-banner` знизу екрана, не перекриває кнопки дій (відступ `safe-area`); пульс «⚔» лише за `no-preference`; на 360 px ніщо не виходить за ширину.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): duels on the phone — the duel button in the header, an opponent list, a fixed banner, the challenger picks a category, duelists type answers with their tries, the others watch"
```

---

### Задача 8. Сцена, пульт ведучого й історія

**Files:**
- Modify: `apps/web/src/screens/DuelView.tsx` (`DuelStage`, `HostDuelPanel`), `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/HostScreen.tsx` (`IN_ROUND` + `'duel'`, головна дія, панель), `apps/web/src/pages/GameHistory.tsx` (рядки дуелей, «Бали від ведучого» лише `host`)
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/DuelView.test.tsx`, `apps/web/src/screens/StageScreen.test.tsx`, `apps/web/src/screens/HostScreen.test.tsx`, `apps/web/src/pages/History.test.tsx`

**Interfaces:**
- Consumes: `DuelInfo`, `HostDuel` (задача 4), `GameAdjustment.seq` (задача 5), `duelScoreText` (задача 7).
- Produces:
  ```ts
  /** Дуель на великому екрані: імена один проти одного, рахунок, категорія, запитання, таймер, кількість спроб, розкриття, підсумок. */
  export function DuelStage(props: { view: StageView; offsetMs: number }): JSX.Element;
  /** Панель дуелі в пульті: оголошена (скасувати), вибір категорії за гравця, відповіді й спроби, пропуск, скасування. */
  export function HostDuelPanel(props: { view: HostView; send: Send; onError: (text: string | null) => void }): JSX.Element | null;
  // GameHistory.tsx
  /** Рядки дуелей: пари 'duel' з сусідніми seq (+ і −) — один рядок; непарне — окремо. */
  export function duelLines(adjustments: GameAdjustment[]): string[];
  ```
- Головна дія ведучого: на `intro`/`reveal`/`leaderboard`/`round_end` з `view.duel?.stage === 'declared'` — «Почати дуель» (`host:next`); на етапі `duel`: `answer` — `ending ? 'duelResults' : 'duelNextQuestion'`, `result` — `'duelContinue'`, `category`/`question` — головної кнопки немає (дії в панелі). Пауза працює як завжди.
- Тексти:
  ```ts
  duelStart: 'Почати дуель',
  duelNextQuestion: 'Наступне запитання дуелі',
  duelResults: 'Підсумок дуелі',
  duelContinue: 'Продовжити гру',
  duelDeclared: 'Оголошено дуель: {challenger} — {opponent}',
  duelCancel: 'Скасувати дуель',
  duelCancelConfirm: 'Скасувати дуель? Бали не зміняться.',
  duelSkip: 'Пропустити запитання',
  duelHostPick: 'Категорію вибирає {name}. Якщо треба, виберіть за гравця:',
  duelAccepted: 'Прийнятні відповіді: {list}',
  duelTryTexts: 'Спроби {name}: {list}',
  historyDuel: 'Дуель: {winner} {plus}, {loser} {minus}',
  historyDuelOne: 'Дуель: {name} {points}',
  ```

- [ ] **Step 1: Write the failing tests.**
  - `DuelView.test.tsx`: `duelLines pairs consecutive duel adjustments` — `[{ seq 1, host, Оля +100 }, { seq 2, duel, Іра +300 }, { seq 3, duel, Оля −300 }, { seq 5, duel, Петро +200 }]` → `['Дуель: Іра +300, Оля −300', 'Дуель: Петро +200']`.
  - `StageScreen.test.tsx`:
    - `the stage shows the duel big` — `phase 'duel'`, stage `question`: імена «Оля» і «Петро» по боках `.duel-stage`, «1 : 0», «Запитання 2 з 3 · Столиці», текст запитання, `Timer`, «Спроби: Оля 0 · Петро 2»; написань немає (у `view` їх і немає — перевірка, що `accepted: null` нічого не малює).
    - `the stage reveals the duel answer and the result` — `answer`: «Правильна відповідь: Париж», «Це запитання виграє Оля: «Париж»»; `result`: «Перемога в дуелі: Оля!», «Оля +300 · Петро −300»; категорія: «Оля вибирає категорію» і назви категорій з залишком.
    - `a declared duel shows its banner over the round` — `phase 'reveal'` з `duel.stage 'declared'` → `.duel-banner`.
  - `HostScreen.test.tsx`:
    - `the host starts, steers and cancels a duel` — `reveal` з оголошеною дуеллю: панель «Оголошено дуель: Оля — Петро», головна кнопка «Почати дуель» → `host:next`; «Скасувати дуель» з `confirm` → `host:duel-cancel` (без `confirm` — нічого).
    - `the host picks for the challenger and skips a question` — етап `category`: `duelHostPick` і кнопки категорій (порожня вимкнена) → `host:duel-category { categoryId }`; етап `question`: «Прийнятні відповіді: Париж», «Спроби Петро: Львів, Ліон», «Пропустити запитання» → `host:duel-skip`; головної кнопки немає; «Пауза» → `host:pause`.
    - `the main button walks the duel` — `answer` з `ending: false` → «Наступне запитання дуелі»; `ending: true` → «Підсумок дуелі»; `result` → «Продовжити гру»; усі → `host:next`; на етапі `duel` є «Завершити раунд».
  - `History.test.tsx`: `duel transfers show as duel lines, host points stay separate` — `adjustments` з прикладу вище в раунді 1 → «Бали від ведучого: Оля +100» і окремі `p.meta.history-duel` «Дуель: Іра +300, Оля −300», «Дуель: Петро +200»; гра без дуелей — як раніше.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens apps/web/src/pages`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - `DuelStage`: сітка `1fr auto 1fr` — ліворуч той, хто оголосив (ім'я, великий рахунок, «спроб: N»), праворуч суперник, посередині «⚔», категорія, `duelQuestionOf`, запитання великим шрифтом, `Timer`; розкриття й підсумок — у тому самому центральному блоці (висота блоку не стрибає між етапами). Усе видно на 1600 × 900 без прокрутки.
  - `StageScreen`: `{phase === 'duel' && view.duel !== null && <DuelStage … />}`; `DuelBanner` поруч з `AdjustmentToast`.
  - `HostScreen`: `'duel'` в `IN_ROUND`; головна дія за Interfaces; `HostDuelPanel` над панеллю гравців, коли `view.duel !== null`.
  - `GameHistory`: `historyAdjustments` — лише `source === 'host'`; під ним `duelLines(дуельні коригування раунду)` окремими `p.meta.history-duel`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): duels on the stage and the host console — the duel big on screen, start, pick for the challenger, skip, cancel, continue; duel lines in the history apart from host points"
```

---

### Задача 9. Наскрізний сценарій 7g і кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–8.
- Допоміжні функції файлу: `open`, `register`, `join`, `shot`, `click`, `field`, `exact`, `bodyText`, `expectNoSideScroll`, `snapshot`, `rigged` (грань 1 → `rng` дає 0.01 → перше невикористане запитання категорії). Нові локальні: `duelAnswer(page, text)` — заповнює «Ваша відповідь» і тисне «Відповісти», чекає ack (поле порожнє); `answerAll(host, players)` — відповідь кожного кнопкою варіанта й кроки ведучого до `reveal`, як у `twoRounds`.

- [ ] **Step 1: Add the scenario** `it('part 7g: duels — the editor section, the button after a third, an opponent picked, others disabled, the duel on the stage, phones and host, a category, first right answer wins, retries, a skip, a tie, a stake moved with a line in the history, a cancel, the game going on where it stood', …)` з `try/catch` і `snapshot()`. Підготовка:
  1. Ведучий `register(host, 'host', 'Олег Ведучий', 'host7g@example.com')`. Вікторина «Дуелі» через `host.request.post(`${base}/api/quizzes`, { data })`, `leaderboard: 'end'`, усі раунди `shuffleOptions: false`:
     - **Раунд 1, класика** «Розминка»: `q1`–`q3` single по 100 балів, 20 с (правильний — перший варіант);
     - **Раунд 2, класика** «Другий»: `q4`–`q6` single по 100 балів;
     - **Раунд 3, фінал** «Фінал»: один single.
     - `duels`: «Столиці» (`d1` «Столиця Франції?» [Париж], `d2` «Столиця Італії?» [Рим], `d3` «Столиця Польщі?» [Варшава]), «Хімія» (`d4` «Символ Fe — це…» [Залізо, Ферум], `d5` «Символ Au — це…» [Золото, Аурум], `d6` «Символ O — це…» [Кисень, Оксиген]); `questionsPerDuel: 2`, `timeLimit: 30`, `stake: 300`. Поріг — ⌈6/3⌉ = 2.
  2. **Редактор.** Ведучий відкриває «Дуелі» зі списку `/quizzes`, розгортає розділ «Дуелі»: «Запитань за дуель» = 2, «Ставка…» = 300, чипи «Столиці · 3 запитання», «Хімія · 3 запитання»; ставить «Запитань за дуель» 4 і тисне «Зберегти» → «Дуелі, «Столиці»: замало запитань — потрібно щонайменше 4.»; повертає 2; кадр `duel7g-editor`; «Зберегти». На 375 px — `expectNoSideScroll(host, 'duel7g-editor-375')`, потім 1280 × 900.
  3. Гра: `stage` 1600 × 900, `olya` 375 × 812, `petro` 360 × 740, `ira` 390 × 844. Приєднуються Оля, Петро, Іра.

- [ ] **Step 2: Assertions and shots** (у такому порядку):
  1. **До третини.** `q1`: усі правильно, розкриття → у жодного телефона немає кнопки «⚔ Дуель». `q2`: запам'ятати `y` блоку `.question` у Петра під час запитання (кнопки ще немає); після закриття й розкриття — кнопка є в усіх трьох (кадр `duel7g-button-phone`). Пізніше, під час `q3` (у Петра кнопка є), `y` `.question` той самий — шапка не виросла.
  2. **Оголошення.** На розкритті `q2` Оля тисне «⚔ Дуель» → діалог «Кого викликати на дуель?» з «Петро» та «Іра»; кадр `duel7g-pick-phone`; `expectNoSideScroll(olya, 'duel7g-pick-375')`; «Петро». У Петра й Іри кнопка вимкнена; в Олі кнопки немає; на сцені й телефонах смуга «⚔ Дуель: Оля — Петро. Почнеться після цього запитання.»; кадр `duel7g-declared-stage`. У ведучого «Оголошено дуель: Оля — Петро», головна кнопка «Почати дуель».
  3. **Категорія.** Ведучий «Почати дуель» → сцена «Оля вибирає категорію» з назвами й залишком; Петро бачить те саме без кнопок; в Олі кнопки категорій; кадр `duel7g-category-phone`. `rigged.push(1)`; Оля «Столиці · лишилося 3».
  4. **Запитання 1: спроби й перший правильний.** Сцена: «Оля 0 : 0 Петро», «Запитання 1 з 2 · Столиці», «Столиця Франції?», таймер; `bodyText(stage)` і `bodyText(ira)` не містять «Париж». Петро `duelAnswer` «Ліон» → у Петра «✗ Ліон», на сцені й в Іри «Спроби: Оля 0 · Петро 1», а в Іри й Олі немає тексту «Ліон»; у ведучого «Прийнятні відповіді: Париж», «Спроби Петро: Ліон»; кадр `duel7g-question-host`. Петро `petro.reload()` → поле відповіді й «✗ Ліон» на місці. `expectNoSideScroll(petro, 'duel7g-question-360')`. Оля `duelAnswer` «париж» → сцена «Правильна відповідь: Париж», «Це запитання виграє Оля: «париж»», «Оля 1 : 0 Петро»; кадр `duel7g-answer-stage`.
  5. **Пропуск.** `rigged.push(1)`; ведучий «Наступне запитання дуелі» → «Столиця Італії?»; `rigged.push(1)`; ведучий «Пропустити запитання» → «Столиця Польщі?», «Запитання 2 з 2». Петро «Варшава» → «Оля 1 : 1 Петро»; головна кнопка «Підсумок дуелі».
  6. **Нічия.** «Підсумок дуелі» → сцена й телефони «Нічия — бали не змінюються»; кадр `duel7g-tie-stage`; рахунки ті самі (Оля 200, Петро 200, Іра 200). «Продовжити гру» → сцена показує `q3` (гра пішла рівно далі), смуги немає.
  7. **Ставка.** Після розкриття `q3` Іра оголошує дуель Олі (в Олі кнопки немає — свою вже витратила, у Петра вимкнена). Ведучий «Почати дуель» → етап категорії; ведучий вибирає за Іру «Хімія» (`rigged.push(1)`), кадр `duel7g-host-pick`. Іра «Залізо», потім (`rigged.push(1)`, «Наступне запитання дуелі») «Аурум» → «Іра 2 : 0 Оля», «Підсумок дуелі» → «Перемога в дуелі: Іра!», «Іра +300 · Оля −300»; кадр `duel7g-result-stage`; кадр телефона Олі `duel7g-result-phone`. Рахунки: Іра 600, Оля 0, Петро 300 (`q3` усі правильно; спершу перевірити, що рахунки до дуелі по 300). «Продовжити гру» → `round_end` раунду 1 («Наступний раунд» у ведучого).
  8. **Скасування.** На `round_end` Петро оголошує дуель Ірі. Ведучий «Почати дуель», далі «Скасувати дуель» (підтвердити діалог) → знову підсумки раунду 1, рахунки без змін, у Петра кнопки немає. «Наступний раунд» → заставка раунду 2 (гра пішла далі звичайно). У раунді 2 кнопки «⚔ Дуель» немає ні в кого (усі витратили).
  9. **Історія.** Ведучий «Завершити гру» (підтвердити) → `/history` → «Дуелі»: таблиця Іра 600, Петро 300, Оля 0; у раунді 1 рядок «Дуель: Іра +300, Оля −300» і жодного «Бали від ведучого»; кадр `duel7g-history-host`. `expectNoSideScroll(olya, 'duel7g-phone-375')` на фінальному екрані.
  10. `expect(problems).toEqual([])`.

- [ ] **Step 3: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв. Потім той самий запуск з `E2E_SHOTS=1` і перегляд кадрів у `apps/server/e2e/artifacts/shots`:
  - кнопка в шапці не зсуває запитання; діалог вибору й смуга не перекривають дій і не виходять за 360–375 px;
  - дуель на сцені читається з відстані: хто проти кого, рахунок, запитання, таймер; розкриття й підсумок без прокрутки на 1600 × 900;
  - у глядача немає чужих текстів спроб і правильної відповіді до розкриття;
  - пульт ведучого показує відповіді, спроби й усі виходи (вибрати за гравця, пропустити, скасувати, пауза);
  - історія показує той самий рахунок, що й таблиця, і рядок дуелі окремо від балів ведучого.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts
git commit -m "test: part 7g end-to-end — the duel editor, the button after a third, an opponent, a category, retries and the first right answer, a skip, a tie, a stake with a history line, a cancel, the game going on where it stood"
```

Після фінальної рецензії гілку злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`. У звіті власникові назвати рішення: межі (1–8 категорій до 40 символів, 1–20 запитань у категорії, 1–7 запитань за дуель, типово 3; 5–120 с, типово 30; ставка 0–5000, типово 300; до 30 спроб на запитання); «увімкнено» — це наявність розділу, вимкнення з текстом перепитує; дуель стартує на найближчому «Далі» з розкриття, заставки, рейтингу чи підсумків раунду; ведучий може вибрати категорію за гравця; пропущене запитання не рахується й замінюється іншим з тієї самої категорії; дуель закінчується достроково, коли відрив уже не наздогнати; скасування повертає гру на той самий етап без кроку вперед і витрачає право; вилучення суперника повертає право тому, хто оголосив; відключення дуель не зупиняє; дебафи на запитаннях дуелі не спрацьовують; чужі тексти спроб бачить лише ведучий; в історії — лише рядок «Дуель: Іра +300, Оля −300» (нічия й нульова ставка рядка не дають), міграції немає; демо «Великий ерудит» отримав пул зі столиць, хімічних елементів і української літератури.
