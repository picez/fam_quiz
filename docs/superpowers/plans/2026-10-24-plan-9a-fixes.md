# План 9a: виправлення й дрібні побажання після третьої гри

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 9a специфікації (розділ 3, вісім пунктів).
- **50/50 видно.** Прибрані варіанти на телефоні того, хто взяв баф, закреслені й мають позначку «прибрано» (місця не змінюються). На полі прибрані так само позначені на сцені, у ведучого й на телефонах глядачів; у класиці їх бачить лише сам гравець. У запитанні з кількома відповідями прибирається половина неправильних, округлено вгору, але один неправильний лишається завжди.
- **«Запитання в залі»** дає гравцеві +15 с особистого часу (як «Додатковий час»). Аркуш голосування — компактна смуга знизу (не вища за 35 % екрана), яку можна згорнути й розгорнути.
- **Бафи на усних клітинках:** подвійні бали, щит, підказка, додатковий час, зал і заміна; 50/50 — лише на запитаннях з варіантами (прибрані видно на сцені); «Ще спроба» на усній клітинці не діє.
- **Описи бафів:** кнопка «?» біля ряду бафів відкриває список — що робить кожен дозволений баф і де він діє. Неактивна кнопка пояснює причину конкретно («На бліц-клітинках бафів немає», «50/50 діє лише на запитаннях з варіантами»).
- **«До меню»** після кінця гри: гравець — на головну, ведучий — до своїх вікторин або історії ігор, сцена — на головну.
- **«Таблиця»** у шапці телефона будь-коли, поверх екрана, закривається одним дотиком. З `leaderboard: 'end'` — лише власне місце й бали.
- **Сортування на полі видно всім:** глядачі бачать запитання, категорії й слова (без права сортувати), а на розкритті — як слова розкладаються. Три й чотири категорії — однакового розміру.
- **Приховані ×2/×3:** сцена й телефони не бачать позначок на полі (на рівні даних, а не CSS); коли клітинку вибрали, перегортання закінчується сюрпризом «×2!» / «×3!». Ведучий бачить позначки завжди.

**Архітектура:**
- **Рушій (`packages/engine`).** `fiftyCount` для `multi`: `min(⌈неправильних/2⌉, неправильних − 1)`. `takeBuff` для `audience` на запитанні з таймером викликає `grantOvertime(…, AUDIENCE_MS)` — особистий кінець = спільний кінець + 15 с, решта механіки 8a (`deadlineOf`, `closesAt`, `personalClock`, «Не чекати», пауза) працює без змін. `placeBlock` переписано: усна звичайна клітинка — тепер «тут можна» (крім «Ще спроби» — нова причина `unfit_voice`), а колишнє `elsewhere` розпадається на конкретні причини `off_blitz`, `off_blitz_cell`, `off_final`, `off_chain`, `off_sort`. `nameAnswer` перевіряє позначку ведучого за запитанням вибравшого (`questionFor`) — після заміни на усній клітинці це запасне. Сюрприз: `openQuestion` дає заставці клітинки з множником довшу тривалість (`SPLASH_MS.cell + CELL_SURPRISE_MS`).
- **Зрізи (`packages/engine/src/views.ts`, `packages/shared/src/views.ts`).** `BaseView.removed` — прибрані 50/50 вибравшого на клітинці поля (усі ролі), у класиці `[]`. `boardInfo(state, forHost)`: для сцени й гравців `mark` незіграної й не вибраної клітинки — `'none'`; нові поля `marks` (які позначки є в раунді — для легенди, без місць) і `marksHidden`. `PlayerView.table` — живий рейтинг із тими самими «прихованими» балами поточного запитання, що вже ховає `me.score` (`hiddenPoints`), повний або лише власний рядок. `SortInfo.words` — слова сортування за абеткою, лише на клітинці поля.
- **Ряд бафів** (`playerBuffs`) з'являється в кожному запитанні, де гравець відповідає з телефона (зокрема бліц, бліц-клітинка, фінал, ланцюжок, сортування) — там усі кнопки неактивні з конкретною причиною. Глядачі на звичайній клітинці поля (не вибравші) ряду, як і раніше, не мають.
- **Веб.** `AnswerInput` і `SpotlightChoices` отримують `removed` і показують «прибрано» (закреслення + позначка поверх варіанта, `position: absolute`). `BuffHelp` — кнопка «?» поза `.buff-row` і аркуш довідки. `VoteSheet` — компактна смуга з кнопкою «Згорнути»/«Розгорнути». `TableButton` + `TableSheet` у шапці телефона. `MenuLinks` на екранах `finished`. `CellFlip` з класом `is-surprise` і штампом «×2!». `SortWatch` зі словами й розкриттям для глядачів; сітка зон «хрестом» з рівними клітинками для 3–4 категорій.
- **Сервер** не змінюється: події й обробники ті самі, змінюються лише зрізи рушія.

**Технології:** TypeScript, vitest, Fastify + Socket.IO, React + Vite, CSS, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-24-after-third-game-design.md` — розділ 1 (знайдені причини: 50/50 лише притемнення й ⌊неправильних/2⌋; голосування 15 с з'їдає час; усні клітинки без бафів; немає виходу в меню), розділ 3 (частина 9a, пункти 1–8), анти-цілі розділу 2 («правильна відповідь потрапляє на телефон чи сцену раніше розкриття», «старі вікторини, ігри в історії й профілі ламаються»), рішення розділу 8 («50/50 на полі видно на сцені; у класиці — ні», «у multi прибирається половина неправильних, округлено вгору», «зал дає гравцеві +15 с», «на вголос діють усі бафи, крім другої спроби», «при прихованій до кінця таблиці кнопка показує лише власне місце»). Зразки: `packages/engine/src/buffs.ts` (`placeBlock`, `fitBlock`, `pickRemoved`, `takeSpare` з `grantOvertime`), `packages/engine/src/views.ts` (`playerBuffs`, `activeBuff`, `boardInfo`, `sortInfo`, прихований `me.score` у `playerView`), `apps/web/src/screens/Buffs.tsx` (`BuffRow`, `VoteSheet`), `apps/web/src/guide-text.ts` (тексти `buffGuide_*`), `apps/web/src/live/Splash.tsx` (`CellFlip`), `apps/web/src/screens/SortView.tsx` (`Arena`, `SortWatch`, `SortReveal`), перевірки CSS у `apps/web/src/screens/Buffs.test.tsx` (`rule()`).

**Рішення плану там, де специфікація мовчить:**
- **50/50 у `multi`:** прибирається `min(⌈w/2⌉, w − 1)` неправильних, де `w` — кількість неправильних; `w ≤ 1` — баф не діє (`unfit_options`). 2 → 1, 3 → 2, 4 → 2, 5 → 3. `single` — без змін (`n − ⌈n/2⌉`, з двох варіантів не діє).
- **Хто бачить прибрані:** на клітинці поля — усі ролі через `BaseView.removed` на етапах `question`, `locked`, `reveal` (варіанти поля видно всім, і відповідає один). У класиці `removed: []` для всіх, а власні прибрані — як і раніше лише в `me.buffs.active.removed`. Правильна відповідь ніколи не прибирається, тож `removed` нічого не розкриває.
- **Вигляд «прибрано»:** варіант лишається на своєму місці й свого розміру; текст закреслений, непрозорість 0,55 (замість 0,35), у правому верхньому куті — мала позначка «прибрано» (`.removed-tag`, `position: absolute`). На телефоні гравця прибрані кнопки `disabled` (як зараз), на сцені й у ведучого — лише показ. У ведучого на усній клітинці прибраний варіант не можна позначити (кнопка `disabled`).
- **«Зал» і час:** `grantOvertime(taken, playerId, AUDIENCE_MS)` лише для запитання з таймером (`isTimed`); на відео-запитанні особистого часу немає (таймера немає). Голосування й далі триває 15 с від миті, коли баф узято. «Не чекати» ведучого скасовує й цей особистий час (наявна механіка `overtime`).
- **Аркуш голосування:** `max-height: 35vh` (з прокруткою всередині); у заголовку — кнопка «Згорнути» (`aria-expanded`), згорнутий аркуш — лише рядок «Оля питає зал: як думаєте? · 0:12 · Розгорнути». Стан згортання живе в компоненті й скидається з новим запрошенням (інший `asker`). Аркуш, як і раніше, `position: fixed`, тож нічого не зсуває.
- **Бафи на усній клітинці:** `double`, `shield`, `hint`, `time`, `audience`, `swap` — так, як на клітинці з телефона (голосують усі, крім вибравшого; заміна показує запасне на сцені, у ведучого й на телефонах, як уже робить `shownQuestion` на полі); `fifty` — якщо `single`/`multi` (інакше `unfit_type`); `retry` — нова причина `unfit_voice` (перевіряється раніше за тип). Бліц-клітинки (і усні, і з телефона) — без бафів.
- **Причини замість `elsewhere`:** `off_blitz` (бліц-раунд), `off_blitz_cell` (бліц-клітинка поля), `off_final`, `off_chain`, `off_sort`. `elsewhere` лишається лише для «немає відкритого запитання». Порядок у `placeBlock`: спершу поле (`board === undefined` → `elsewhere`; бліц-клітинка → `off_blitz_cell`; не вибравший → `not_chooser`), далі бліц-раунд, фінал, ланцюжок, сортування. `takeBuff` на `off_*` відповідає `wrong_phase`, як і на колишнє `elsewhere`.
- **Ряд бафів у запитаннях без бафів:** з'являється (усі кнопки неактивні, дотик пояснює причину), бо гравцеві треба бачити, чому бафів немає. Немає ряду: вікторина без бафів, етап не `question`, глядач на звичайній клітинці поля, дуель.
- **Тексти причин** (`buffWhy_*`): `off_blitz` «У бліці бафів немає.», `off_blitz_cell` «На бліц-клітинках бафів немає.», `off_final` «У фіналі бафів немає.», `off_chain` «На ланцюжку бафів немає.», `off_sort` «На сортуванні бафів немає.», `unfit_voice` «Друга спроба не діє, коли відповідаєте вголос.». Для `unfit_type` — окремо за бафом: `buffWhy_unfit_type_fifty` «50/50 діє лише на запитаннях з варіантами.», `buffWhy_unfit_type_retry` «Друга спроба діє лише на простих запитаннях: варіанти, так/ні, текст, число.», `buffWhy_unfit_type_audience` «Зал голосує лише на простих запитаннях: варіанти, так/ні, текст, число.»; `whyText` шукає `buffWhy_${block}_${kind}`, а без нього — `buffWhy_${block}`.
- **Довідка «?»:** кнопка `.buff-help` праворуч від `.buff-row` (усередині `.buff-bar`, не в `.buff-row`: кнопок бафів і далі рівно стільки, скільки дозволено), текст «?», `aria-label` «Що роблять бафи», обведене коло — щоб не сплутати з бафом «Підказка» (його значок теж «?»). Аркуш `.buff-help-sheet` (`position: fixed`, `z-index: 75`, над аркушем голосування 70, під діалогом дуелі 80): заголовок «Бафи», для кожного дозволеного бафу — значок, назва, `buffGuide_*` і рядок «Де: …» (`buffWhere_*`), унизу «Не діють: бліц, бліц-клітинки, фінал, ланцюжок, сортування й дуелі.»; закривається кнопкою «Закрити», дотиком по тлу або Escape. Кнопку «?» видно й на паузі та під час заставки — вона нічого не надсилає.
- **«Де» для кожного бафу** (`buffWhere_*`): fifty «Де: запитання з варіантами — у класиці й на полі, і на усних клітинках.»; double «Де: класика й поле у свій хід, і усні клітинки.»; retry «Де: прості запитання в класиці й на полі; не вголос і не там, де оцінює ведучий.»; time «Де: запитання з таймером — у класиці й на полі.»; shield «Де: раунди, де помилка коштує балів.»; audience «Де: прості запитання; поки зал голосує, у вас +15 с.»; hint «Де: класика й поле у свій хід; підказує ведучий.»; swap «Де: класика й поле у свій хід, поки є запасні запитання.». Оновлюються й тексти «Як грати»: `buffGuide_audience` «Інші гравці підказують, як думають; вам +15 с.», `guideBuffsWhere` «У бліці, фіналі, ланцюжку, сортуванні й дуелях бафів немає, а на полі — лише у свій хід (і вголос теж).».
- **«До меню»:** звичайні посилання `<a href>` (повне перезавантаження сторінки закриває сокет; екрани гри рендеряться в тестах без роутера). Гравець — «До меню» → `/`. Ведучий — «До вікторин» → `/quizzes` і «Історія ігор» → `/history` (id збереженої гри пульт не знає, а список історії починається з найновішої — сервер не змінюється). Сцена — мала кнопка «До меню» → `/` у правому нижньому куті (`position: fixed`), не закриває подіуму. Лише на етапі `finished` і не під заставкою «Підсумки» (шар і так перехоплює дотики; кнопки в розкладці стоять одразу, щоб нічого не зсувалось).
- **«Таблиця»:** кнопка `btn-bar` «Таблиця» в шапці телефона між ім'ям і рахунком (та сама висота, що й «⚔ Дуель»; ім'я обрізається трикрапкою — шапка не вища). Немає в лобі (`table: null`). Аркуш `.table-sheet` (`position: fixed`, `z-index: 75`): заголовок «Таблиця», `Standings` з виділенням себе; при `full: false` — лише власний рядок і примітка «Повна таблиця — наприкінці гри.». Закривається дотиком будь-де на аркуші чи тлі або Escape; поява й зникнення нічого не зсувають. Працює й під час запитання, паузи й заставки.
- **Дані таблиці:** `table.rows = rankPlayers(гравці з score − hiddenPoints)`, де `hiddenPoints` — той самий розрахунок, що зараз ховає бали поточного запитання від `me.score` (на `locked` — бали запису; на `reveal` у фіналі — ще не розкриті), тож таблиця не видає правильності до розкриття. `full = leaderboard === 'each' || етап у WITH_STANDINGS (leaderboard, round_end, finished)` — тобто з 'end' таблиця повна на підсумках раунду й наприкінці, як і сцена. При `full: false` — один рядок гравця з його справжнім місцем.
- **Приховані позначки:** для сцени й гравців `BoardCellView.mark` — справжній лише для зіграної клітинки або вибраної зараз (`open.board.cellId`); інакше `'none'`. `BoardInfo.cell.mark` (вибрана) — справжній для всіх. `BoardInfo.marks: ('x2' | 'x3')[]` — які позначки є в раунді (у порядку x2, x3), щоб легенда, як і раніше, пояснювала «×2 — подвійна ціна»; `marksHidden: true` для сцени й гравців, `false` для ведучого. Легенда при `marksHidden` додає рядок «Де ×2 і ×3 — сюрприз.». Зведення раунду («Є клітинки ×2 і ×3») не змінюється — воно не каже де.
- **Сюрприз «×2!»:** `CELL_SURPRISE_MS = 800`; заставка клітинки з множником 2 або 3 триває `1000 + 800 = 1800` мс (таймер стартує після неї — нічий час не губиться), без множника — 1000 мс, як було. Перегортання займає перші 1000 мс (`--splash-flip-ms`), далі поверх звороту картки — великий штамп «×2!» / «×3!» (`.splash-surprise`, масштаб від 1,6 до 1 і проявлення; за «менше руху» — лише проявлення). Без `transitions` (модульні тести) заставки немає — позначка просто з'являється в рядку клітинки над запитанням.
- **Слова сортування на полі:** `SortInfo.words` — усі слова за абеткою (`localeCompare(…, 'uk')`), щоб порядок не видавав авторського групування за категоріями; `null` поза полем. Глядачі на телефоні бачать арену з категоріями (без кнопок), слова чипами під ареною, рядок «Сортує Оля» і прогрес; на розкритті — `SortReveal` з правильним розкладом. Сцена на полі — так само чипи слів під `SortReveal` (до розкриття). Сам вибравший бачить, як і раніше, лише свою картку.
- **Рівні зони:** 2 категорії — як зараз. 3 і 4 — сітка «хрестом» з рівними клітинками `repeat(3, minmax(0, 1fr))`: 3 — два рядки (`top` у середині першого, `left`/центр/`right` у другому), 4 — три рядки (`bottom` у середині третього). Позиції зон і свайпи (`swipeTarget`) не змінюються. Розкриття стовпцями (`SortReveal`) уже однакової ширини.
- **Тексти без родів:** «прибрано», «Згорнути», «Розгорнути», «Що роблять бафи», «Бафи», «Закрити», «Таблиця», «Повна таблиця — наприкінці гри.», «До меню», «До вікторин», «Історія ігор», «Де ×2 і ×3 — сюрприз.», «×2!», «×3!», «Сортує {name}», «Слова».

## Глобальні обмеження

- Схема вікторини не змінюється, міграцій немає; старі вікторини, історія й профіль працюють як були. Сервер не змінюється.
- Рушій чистий: `now` і `rng` — аргументи.
- Анти-ціль «спойлер»: нові поля зрізів (`removed`, `table`, `words`, `marks`) не містять правильних відповідей; бали поточного запитання в `table` ховаються до розкриття так само, як у `me.score`; позначки клітинок сцена й телефони не отримують у даних.
- Анти-ціль «стрибки»: позначка «прибрано», аркуші довідки й таблиці, згортання аркуша голосування, кнопки «До меню» — `position: absolute`/`fixed` або стоять у розкладці від першої миті етапу.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`. Нові кольори — токени в `:root` у `styles.css` (`--removed-tag`, `--surprise`). Тема лише темна.
- Розкладка працює на ширині 375 px (і 360 px) без горизонтальної прокрутки.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2` (саме `--maxWorkers=2`: паралельні робітники PGlite падають на цій машині; якщо PGlite все одно падає з браком пам'яті — запускати окремо `pnpm vitest run --maxWorkers=2 packages`, `… apps/server`, `… apps/web`).
- Наскрізні тести: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Кадри — з `E2E_SHOTS=1` у `apps/server/e2e/artifacts/shots`.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (проєкт тестовий).

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/engine/src/buffs.ts` | `fiftyCount` (multi), `takeBuff` (зал + особистий час) | 1 |
| `packages/shared/src/views.ts`, `packages/engine/src/views.ts` | `BaseView.removed`, `boardRemoved` | 1 |
| `packages/engine/src/game.buffs-9a.test.ts` (новий), `game.buffs.test.ts` | тести 50/50 і залу | 1 |
| веб-фабрики зрізів у `StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `HostScreen.test.tsx`, `DuelView.test.tsx`, `live/Splash.test.tsx` | `removed: []` (1), `marks`/`marksHidden` (3), `table: null` (4), `words: null` (4) | 1, 3, 4 |
| `packages/shared/src/game.ts` | `BuffBlock`: `off_*`, `unfit_voice` | 2 |
| `packages/engine/src/buffs.ts` (`placeBlock`, `fitBlock`, `buffBlock`, `takeBuff`), `views.ts` (`playerBuffs`), `game.ts` (`nameAnswer`) | бафи на усних клітинках, конкретні причини | 2 |
| `apps/web/src/i18n.ts` | `buffWhy_off_*`, `buffWhy_unfit_voice` | 2 |
| `packages/engine/src/splash.ts`, `game.ts` (`openQuestion`) | `CELL_SURPRISE_MS`, тривалість заставки клітинки | 3 |
| `packages/shared/src/views.ts`, `packages/engine/src/views.ts` (`boardInfo`, `hostBoard`, `base`) | приховані позначки, `marks`, `marksHidden` | 3 |
| `packages/engine/src/views.marks.test.ts` (новий) | тести позначок і сюрпризу | 3 |
| `packages/shared/src/views.ts`, `packages/engine/src/views.ts` (`hiddenPoints`, `liveTable`, `sortInfo`) | `PlayerView.table`, `SortInfo.words` | 4 |
| `packages/engine/src/views.table.test.ts` (новий) | тести таблиці й слів | 4 |
| `apps/web/src/screens/AnswerInput.tsx`, `SpotlightChoices.tsx`, `PlayerScreen.tsx`, `StageScreen.tsx`, `HostScreen.tsx`, `Buffs.tsx` (`VoteSheet`), `styles.css`, `i18n.ts` | «прибрано», компактний аркуш голосування | 5 |
| `apps/web/src/screens/Buffs.tsx` (`whyText`, `BuffHelp`), `apps/web/src/i18n.ts`, `styles.css` | довідка «?», причини за бафом, оновлені тексти «Як грати» | 6 |
| `apps/web/src/screens/PlayerScreen.tsx`, `HostScreen.tsx`, `StageScreen.tsx`, `apps/web/src/screens/TableSheet.tsx` (новий), `apps/web/src/screens/MenuLinks.tsx` (новий), `styles.css`, `i18n.ts` | «Таблиця», «До меню» | 7 |
| `apps/web/src/screens/Board.tsx` (`BoardLegend`), `apps/web/src/live/Splash.tsx` (`CellFlip`, `Splash`), `styles.css`, `i18n.ts` | легенда без місць, штамп «×2!» | 8 |
| `apps/web/src/screens/SortView.tsx` (`SortWatch`, `SortWords`), `PlayerScreen.tsx`, `StageScreen.tsx`, `styles.css`, `i18n.ts` | сортування для глядачів, рівні зони | 9 |
| `apps/server/e2e/full-game.e2e.ts` | наявні сценарії + сценарій 9a | 10 |

## Порядок збирання

- Задачі 1–4 — рушій і зрізи; кожна закриває нові обов'язкові поля зрізів механічними значеннями у веб-фабриках у тій самій задачі, тож `pnpm typecheck` зелений після кожної. Задача 2 додає тексти `buffWhy_*` для нових причин (їх вимагає `whyText` і тест i18n, якщо він перебирає `BuffBlock`).
- Задачі 5–9 — веб, кожна на своїх задачах рушія: 5 — на 1; 6 — на 2; 7 — на 4; 8 — на 3; 9 — на 4.
- Задача 10 — остання: спершу наявні сценарії, потім новий.
- Навмисні зміни наявних очікувань (лише такі): `game.buffs.test.ts` — `elsewhere` → `off_blitz`, `off_final`, `off_chain`, `off_sort`, `off_blitz_cell`, а усна клітинка `c12` тепер дозволяє `double` (задача 2); тест `fiftyCount` для `multi` лишається (4 варіанти, 2 неправильні → 1); веб-тести, що чекали відсутності `.buff-row` у бліці, фіналі, ланцюжку чи сортуванні, тепер чекають ряд з неактивними кнопками (задача 2/6); наскрізні — див. задачу 10.

## На що дивитися рецензентові

1. **Жодних спойлерів у даних.** `JSON.stringify` зрізу сцени й гравця на етапі `board` не має `"mark":"x2"`/`"mark":"x3"` для незіграних клітинок; `table` на `locked` не містить балів поточного запитання; `words` — за абеткою. Тести: задача 3, `the stage and the phones get no marks of unplayed cells`; задача 4, `the table hides the current question until the reveal`, `board sort words come in alphabetical order`.
2. **Прибрані видно, де треба, і лише там.** На полі — сцена, ведучий, глядачі; у класиці — лише сам гравець. Тести: задача 1, `on a board cell everybody sees what 50/50 removed; in classic only the taker`; задача 5, `removed options are struck through with «прибрано» and keep their place`.
3. **Зал не з'їдає часу.** Особистий кінець +15 с, голосування 15 с, «Не чекати» й пауза — як для «Додаткового часу». Тест: задача 1, `the audience buff gives the asker 15 s of their own time`.
4. **Усні клітинки.** Усі бафи, крім «Ще спроби»; подвійні й щит рахуються в оцінці ведучого; заміна показує запасне всім і ведучий позначає варіант запасного. Тести: задача 2.
5. **Нічого не стрибає й усе влазить у 375 px.** «прибрано», аркуші, згортання, «Таблиця», «До меню». Тести: задача 5/7 (CSS-правила `position`), задача 10 (виміри й `expectNoSideScroll`).

---

### Задача 1. Рушій: 50/50 — половина неправильних угору й прибрані на полі для всіх; «зал» дає +15 с

**Files:**
- Modify: `packages/engine/src/buffs.ts` (`fiftyCount`, `takeBuff`)
- Modify: `packages/shared/src/views.ts` (`BaseView.removed`)
- Modify: `packages/engine/src/views.ts` (`boardRemoved`, `base`)
- Create: `packages/engine/src/game.buffs-9a.test.ts`
- Modify: веб-фабрики зрізів `apps/web/src/screens/StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `HostScreen.test.tsx`, `DuelView.test.tsx`, `apps/web/src/live/Splash.test.tsx` (`removed: []`)

**Interfaces:**
- Produces (`shared`):
  ```ts
  // BaseView:
  /** Прибрані 50/50 варіанти вибравшого на клітинці поля (question, locked, reveal) — для всіх ролей; у класиці й без бафу []. */
  removed: string[];
  ```
- Produces (`engine`):
  ```ts
  // buffs.ts
  /** Скільки варіантів прибирає 50/50; 0 — не діє. multi: ⌈неправильних/2⌉, але один неправильний лишається. */
  export function fiftyCount(question: Question): number;
  // views.ts (внутрішнє)
  /** Прибрані 50/50 вибравшого відкритої клітинки поля; інакше []. */
  function boardRemoved(state: GameState): string[];
  ```
- `fiftyCount` для `multi`: `const wrong = …; return wrong >= 2 ? Math.min(Math.ceil(wrong / 2), wrong - 1) : 0;`.
- `takeBuff`: після `const taken = …` — `if (kind === 'time') return ok(grantOvertime(taken, playerId, EXTRA_TIME_MS)); if (kind === 'audience' && isTimed(play.question)) return ok(grantOvertime(taken, playerId, AUDIENCE_MS)); return ok(taken);`.
- `boardRemoved`: `const open = currentBoardPlay(state); return open === null ? [] : (buffOf(state.plays[state.questionIndex], open.board.chooserId)?.removed ?? []);` — `currentBoardPlay` уже обмежує етапами запитання.

- [ ] **Step 1: Write the failing tests** у `game.buffs-9a.test.ts`:
  ```ts
  import type { Question } from '@quiz/shared';
  import { describe, expect, it } from 'vitest';
  import { AUDIENCE_MS, fiftyCount, takeBuff } from './buffs';
  import { lock, next, submitAnswer } from './game';
  import { deadlineOf, overtimeOf } from './timing';
  import { hostView, playerView, stageView } from './views';
  import { T0, toBuffCell, toBuffQuestion, toOthersQuestion } from './testing/buffs';
  import { multi } from './testing/fixtures';
  import { must } from './testing/helpers';

  const rng0 = () => 0;
  const options = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, text: `Варіант ${i}` }));
  /** multi з n варіантами, з яких перші right правильні. */
  const multiOf = (n: number, right: number): Question => ({ ...multi, options: options(n), correctIds: options(right).map((o) => o.id) });
  const kyiv = { type: 'single', optionId: 'b' } as const;

  describe('50/50 that everybody sees', () => {
    it('a multi question loses half of its wrong options rounded up, but one wrong always stays', () => {
      // неправильних: 2 → 1, 3 → 2, 4 → 2, 5 → 3
      expect([multiOf(4, 2), multiOf(4, 1), multiOf(6, 2), multiOf(6, 1)].map(fiftyCount)).toEqual([1, 2, 2, 3]);
      expect(fiftyCount(multiOf(3, 1))).toBe(1);
      expect(fiftyCount(multiOf(3, 2))).toBe(0);
    });

    it('on a board cell everybody sees what 50/50 removed; in classic only the taker', () => {
      const cell = must(takeBuff(toBuffCell(), 'p1', 'fifty', T0 + 1000, rng0));
      const removed = cell.plays[0].buffs?.p1.removed ?? [];
      expect(removed).toHaveLength(2);
      expect(removed).not.toContain('b');
      expect(stageView(cell).removed).toEqual(removed);
      expect(hostView(cell).removed).toEqual(removed);
      expect(playerView(cell, 'p2')?.removed).toEqual(removed);
      expect(playerView(cell, 'p1')?.me.buffs?.active?.removed).toEqual(removed);
      // після закриття й на розкритті позначка лишається
      expect(stageView(must(lock(cell))).removed).toEqual(removed);

      const classic = must(takeBuff(toBuffQuestion(), 'p1', 'fifty', T0 + 1000, rng0));
      expect(stageView(classic).removed).toEqual([]);
      expect(hostView(classic).removed).toEqual([]);
      expect(playerView(classic, 'p2')?.removed).toEqual([]);
      expect(playerView(classic, 'p1')?.removed).toEqual([]);
      expect(playerView(classic, 'p1')?.me.buffs?.active?.removed).toEqual(['a', 'c']);
    });

    it('nothing is removed before a buff and between questions', () => {
      expect(stageView(toBuffCell()).removed).toEqual([]);
      // поле після розкриття й «Далі» (етап board): removed []
    });
  });

  describe('the audience buff', () => {
    it('gives the asker 15 s of their own time, like extra time', () => {
      const answered = must(submitAnswer(toOthersQuestion(), 'p2', kyiv, T0 + 2000));
      const s = must(takeBuff(answered, 'p1', 'audience', T0 + 5000, rng0));
      const play = s.plays[0];
      expect(play.buffs?.p1.vote?.endsAt).toBe(T0 + 5000 + AUDIENCE_MS);
      expect(overtimeOf(play, 'p1')).toBe(AUDIENCE_MS);
      expect(deadlineOf(s, play, 'p1')).toBe(T0 + 20_000 + AUDIENCE_MS);
      expect(playerView(s, 'p1')?.me.overtime).toEqual({ deadline: T0 + 35_000, remainingMs: null });
      expect(submitAnswer(s, 'p1', kyiv, T0 + 30_000).ok).toBe(true);
      expect(submitAnswer(s, 'p1', kyiv, T0 + 35_001)).toEqual({ ok: false, error: 'time_over' });
      // stageView(s).overtime — рядок «Чекаємо: Оля» з deadline T0 + 35_000
    });

    it('a question without a timer gives no extra time', () => {
      // othersQuiz з першим запитанням withVideo(…): audience → overtimeOf(play, 'p1') === 0, deadlineOf === null
    });
  });
  ```
  Чернеткові коментарі розписати повними перевірками за тим самим зразком (`next` з `reveal` у `board` для поля; `withVideo` з `./testing/fixtures`).

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL: `fiftyCount(multiOf(4, 1))` — 1, немає `removed` у зрізі, немає особистого часу після залу.

- [ ] **Step 3: Implement** за Interfaces. У п'яти веб-фабриках зрізів — `removed: []` поруч із `buffNotice: null`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS (наявні тести 8a/8b без змін очікувань: фікстура `multi` має 2 неправильні — 1 як і було; тести голосування не перевіряють `overtime` гравця з бафом — якщо перевіряють, це навмисна зміна: тепер +15 с).

- [ ] **Step 5: Commit**

```bash
git add packages/engine packages/shared apps/web/src
git commit -m "feat(engine): 50/50 removes half of the wrong options rounded up in multi and keeps one, a board cell shows the removed options to every role, the audience buff gives the asker 15 s of their own time"
```

---

### Задача 2. Рушій: бафи на усних клітинках і конкретні причини

**Files:**
- Modify: `packages/shared/src/game.ts` (`BuffBlock`)
- Modify: `packages/engine/src/buffs.ts` (`placeBlock`, `fitBlock`, `buffsHere`, `takeBuff`)
- Modify: `packages/engine/src/views.ts` (`playerBuffs`)
- Modify: `packages/engine/src/game.ts` (`nameAnswer`)
- Modify: `apps/web/src/i18n.ts` (`buffWhy_off_*`, `buffWhy_unfit_voice`)
- Modify: `packages/engine/src/game.buffs-9a.test.ts`, `packages/engine/src/game.buffs.test.ts`

**Interfaces:**
- Produces (`shared`):
  ```ts
  /** Чому кнопку бафу зараз не натиснути. off_* — у цьому запитанні бафів немає взагалі. */
  export type BuffBlock =
    | 'used' | 'taken' | 'answered' | 'time' | 'paused' | 'elsewhere' | 'not_chooser'
    | 'off_blitz' | 'off_blitz_cell' | 'off_final' | 'off_chain' | 'off_sort'
    | 'unfit_type' | 'unfit_options' | 'unfit_timer' | 'unfit_penalty' | 'unfit_manual' | 'unfit_voice'
    | 'no_voters' | 'spares_out' | 'not_started';
  ```
- Produces (`engine`, внутрішнє `buffs.ts`):
  ```ts
  type PlaceBlock = 'elsewhere' | 'not_chooser' | 'off_blitz' | 'off_blitz_cell' | 'off_final' | 'off_chain' | 'off_sort';
  /** Де гравець відповідає: null — тут бафи можна; not_chooser — на полі відповідає інший; elsewhere — немає де; off_* — тут бафів немає. */
  function placeBlock(state: GameState, play: Play, playerId: string): PlaceBlock | null;
  /** Чи показувати гравцеві ряд бафів: він відповідає на це запитання з телефона (зокрема там, де бафів немає). */
  export function buffRowHere(state: GameState, play: Play, playerId: string): boolean;
  ```
  `placeBlock`:
  ```ts
  const round = state.quiz.rounds[play.roundIndex];
  if (round.type === 'board') {
    const board = play.board;
    if (board === undefined) return 'elsewhere';
    if (board.kind === 'blitz') return 'off_blitz_cell';
    if (board.chooserId !== playerId) return 'not_chooser';
  } else if (play.blitz !== undefined || round.type === 'blitz') return 'off_blitz';
  else if (round.type === 'final') return 'off_final';
  if (play.question.type === 'chain') return 'off_chain';
  if (play.question.type === 'sort') return 'off_sort';
  return null;
  ```
  `buffsHere` = `placeBlock(…) === null` (як було); `buffRowHere` = `place !== 'elsewhere' && place !== 'not_chooser'`. `fitBlock` для `retry`: першим рядком `if (play.board?.answerMode === 'voice') return 'unfit_voice';`. `takeBuff`: `if (place === 'elsewhere' || place?.startsWith('off_')) return fail('wrong_phase');` (решта порядку без змін).
- `playerBuffs`: умова появи — `buffRowHere` замість `buffsHere`; слоти — як зараз (`buffBlock` повертає `off_*` для кожного невикористаного бафу).
- `nameAnswer`: `const question = questionFor(state, play, board.chooserId);` замість `play.question` (і для `type_mismatch`, і для перевірки id варіантів).
- Тексти (`i18n.ts`): `buffWhy_off_blitz`, `buffWhy_off_blitz_cell`, `buffWhy_off_final`, `buffWhy_off_chain`, `buffWhy_off_sort`, `buffWhy_unfit_voice` — з «Рішень плану». `buffWhy_elsewhere` лишається.

- [ ] **Step 1: Write the failing tests** (дописати в `game.buffs-9a.test.ts`; імпорти `DEFAULT_RULES`, `BUFF_KINDS` з `@quiz/shared`, `pickCell` з `./board`, `nameAnswer`, `override`, `start` з `./game`, `buffBlock` з `./buffs`, `blitzRound`, `bool`, `boardRound`, `chain`, `finalRound`, `makeQuiz`, `makeRoundsQuiz`, `single4`, `sortQ`, `text`, `withId` з `./testing/fixtures`, `lobbyWith`, `startRound` з `./testing/helpers`):
  ```ts
  /** Поле «Міста»: v1 — усна клітинка x2 (question), v2 — з телефона; штраф minus; усі бафи; запасне s1 bool. Оля p1 вибирає v1 о T0. */
  function toVoiceCell(question: Question = single4): GameState {
    const round = boardRound(
      'g1',
      [{ title: 'Міста', cells: [{ question: withId(question, 'v1'), answerMode: 'voice', mark: 'x2' }, withId(single4, 'v2')] }],
      { rules: { ...DEFAULT_RULES, penalty: 'minus' } },
    );
    const quiz = { ...makeRoundsQuiz([round], { buffs: [...BUFF_KINDS] }), spares: [withId(bool, 's1')] };
    const intro = must(start(lobbyWith(quiz, 'Оля', 'Петро', 'Іра')));
    return must(pickCell(must(next(intro, T0)), 'p1', 'v1', T0, rng0));
  }

  describe('buffs on a voice cell', () => {
    it('the chooser may take double, shield, hint, time, audience and swap; a second try is not for voice', () => {
      for (const kind of ['double', 'shield', 'hint', 'time', 'audience', 'swap'] as const) {
        expect(takeBuff(toVoiceCell(), 'p1', kind, T0 + 2000, rng0).ok, kind).toBe(true);
      }
      expect(buffBlock(toVoiceCell(), 'p1', 'retry')).toBe('unfit_voice');
      expect(takeBuff(toVoiceCell(), 'p1', 'retry', T0 + 2000, rng0)).toEqual({ ok: false, error: 'buff_unfit' });
      expect(playerView(toVoiceCell(), 'p1')?.me.buffs?.slots.find((slot) => slot.kind === 'retry')).toEqual({ kind: 'retry', state: 'blocked', block: 'unfit_voice' });
      expect(playerView(toVoiceCell(), 'p2')?.me.buffs).toBeNull();
    });

    it('50/50 works only with options and the stage shows the removed ones', () => {
      const s = must(takeBuff(toVoiceCell(), 'p1', 'fifty', T0 + 2000, rng0));
      expect(stageView(s).removed).toHaveLength(2);
      expect(buffBlock(toVoiceCell({ ...text, accepted: ['Київ'] }), 'p1', 'fifty')).toBe('unfit_type');
    });

    it('double points and a shield count in the host verdict', () => {
      const price = single4.points;
      const doubled = must(override(must(takeBuff(toVoiceCell(), 'p1', 'double', T0 + 2000, rng0)), 'p1', 'correct', T0 + 3000));
      expect(doubled.plays[0].answers.p1).toMatchObject({ points: price * 2 * 2, buff: 'double' });
      const shielded = must(override(must(takeBuff(toVoiceCell(), 'p1', 'shield', T0 + 2000, rng0)), 'p1', 'wrong', T0 + 3000));
      expect(shielded.plays[0].answers.p1).toMatchObject({ points: 0, buff: 'shield' });
      // без щита: override wrong → points − price * 2 (штраф minus на клітинці x2 — як у наявних тестах поля)
    });

    it('a swap on a voice cell shows the spare to everybody and the host names its answer', () => {
      const s = must(takeBuff(toVoiceCell(), 'p1', 'swap', T0 + 2000, rng0));
      expect(stageView(s).question?.text).toBe(bool.text);
      expect(hostView(s).correct?.id).toBe('s1');
      expect(nameAnswer(s, { type: 'boolean', value: true }).ok).toBe(true);
      expect(nameAnswer(s, { type: 'single', optionId: 'b' })).toEqual({ ok: false, error: 'type_mismatch' });
    });

    it('time and audience give the chooser personal time on a voice cell', () => {
      // time о T0 + 2000 → deadlineOf(s, play, 'p1') === T0 + 20_000 + 30_000; tick о T0 + 20_001 — етап question
      // audience о T0 + 2000 → голосують p2 і p3 (canVote), overtimeOf === 15_000
    });
  });

  describe('specific reasons where there are no buffs', () => {
    it('blitz, a blitz cell, the final, a chain and sorting each say why; the row is still there', () => {
      const buffs = [...BUFF_KINDS];
      const blitz = startRound(lobbyWith(makeRoundsQuiz([blitzRound('b1', [single4])], { buffs }), 'Оля'), T0, rng0);
      expect(buffBlock(blitz, 'p1', 'double')).toBe('off_blitz');
      expect(playerView(blitz, 'p1')?.me.buffs?.slots.every((slot) => slot.block === 'off_blitz')).toBe(true);
      expect(takeBuff(blitz, 'p1', 'double', T0, rng0)).toEqual({ ok: false, error: 'wrong_phase' });

      const final = must(next(must(next(must(start(lobbyWith(makeRoundsQuiz([finalRound('f1', single4)], { buffs }), 'Оля'))), T0, rng0)), T0, rng0));
      expect(buffBlock(final, 'p1', 'double')).toBe('off_final');

      for (const [question, reason] of [[chain, 'off_chain'], [sortQ, 'off_sort']] as const) {
        const s = startRound(lobbyWith(makeQuiz([question], { buffs }), 'Оля'), T0, rng0);
        expect(buffBlock(s, 'p1', 'double')).toBe(reason);
      }
      // бліц-клітинка (kind 'blitz') на полі: buffBlock для p1 і для p2 → 'off_blitz_cell', ряд є в обох
      // звичайна клітинка: p2 (не вибравший) → buffs null, buffBlock → 'not_chooser'
      // використаний баф у бліці: slot { state: 'used', block: 'used' } (used важливіший за off_*)
    });
  });
  ```
  У `game.buffs.test.ts` (`buffs work only where the player answers from the phone`) замінити очікування `'elsewhere'` на `'off_blitz'`, `'off_final'`, `'off_chain'`/`'off_sort'`, `'off_blitz_cell'` (для `c11`); `c12` (усна) прибрати з циклу відмов — тепер `double` там дозволено (перевірка `takeBuff(…).ok === true`).

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL: усна клітинка дає `wrong_phase`, немає `off_*` і `unfit_voice`.

- [ ] **Step 3: Implement** за Interfaces; тексти причин в `i18n.ts`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS. Якщо веб-тест `PlayerScreen.test.tsx` чекав `document.querySelector('.buff-row') === null` у бліці, фіналі, ланцюжку чи сортуванні (зріз у фабриці там має `buffs: null` — тоді тест лишається як є: ряд вирішує зріз, а не екран) — змін не треба.

- [ ] **Step 5: Commit**

```bash
git add packages/shared packages/engine apps/web/src/i18n.ts
git commit -m "feat(engine): buffs on voice cells — double, shield, hint, extra time, the audience and a swap, 50/50 with options, no second try aloud; the buff row says exactly why there are no buffs in blitz, a blitz cell, the final, a chain or sorting"
```

---

### Задача 3. Рушій: приховані ×2/×3 і довша заставка клітинки із сюрпризом

**Files:**
- Modify: `packages/engine/src/splash.ts` (`CELL_SURPRISE_MS`, `withSplash`, `questionSplashMs`)
- Modify: `packages/engine/src/game.ts` (`openQuestion`)
- Modify: `packages/shared/src/views.ts` (`BoardInfo.marks`, `BoardInfo.marksHidden`)
- Modify: `packages/engine/src/views.ts` (`boardInfo(state, forHost)`, `hostBoard`, `base`)
- Create: `packages/engine/src/views.marks.test.ts`
- Modify: веб-фабрики зрізів з `board` (`marks: [], marksHidden: false`)

**Interfaces:**
- Produces (`shared`):
  ```ts
  // BoardInfo:
  /** Які позначки є в раунді (x2, x3 — у цьому порядку), без місць: для легенди. */
  marks: Exclude<CellMark, 'none'>[];
  /** Позначки незіграних клітинок приховані (сцена й гравці); ведучий — false. */
  marksHidden: boolean;
  ```
- Produces (`engine`):
  ```ts
  // splash.ts
  /** Скільки довше триває перегортання клітинки з ×2/×3: сюрприз після перегортання, мс. */
  export const CELL_SURPRISE_MS = 800;
  /** Ставить заставку kind з миті now тривалістю ms (типово SPLASH_MS[kind]); без state.transitions — splash: null. */
  export function withSplash(state: GameState, kind: SplashKind, now: number, ms?: number): GameState;
  /** Тривалість заставки перед запитанням: клітинка з множником — SPLASH_MS.cell + CELL_SURPRISE_MS. */
  export function questionSplashMs(kind: SplashKind, board?: BoardPlay): number;
  // views.ts (внутрішнє)
  /** Поле для ролей; forHost — справжні позначки всіх клітинок. */
  function boardInfo(state: GameState, forHost: boolean): BoardInfo | null;
  ```
- `boardInfo`: `const shownMark = (cell) => forHost || cellPlayed(state, cell.question.id) || cell.question.id === open?.board.cellId ? cell.mark : 'none'`; `marks: (['x2', 'x3'] as const).filter((mark) => round.categories.some((c) => c.cells.some((cell) => cell.mark === mark)))`; `marksHidden: !forHost`. `base(state, forHost)` передає `forHost` у `boardInfo`; `hostBoard` бере `boardInfo(state, true)`.
- `openQuestion`: `withSplash(state, kind, now, questionSplashMs(kind, board))`.

- [ ] **Step 1: Write the failing tests** у `views.marks.test.ts`:
  ```ts
  import type { BoardInfo } from '@quiz/shared';
  import { describe, expect, it } from 'vitest';
  import { pickCell } from './board';
  import { next, start } from './game';
  import { CELL_SURPRISE_MS } from './splash';
  import { hostView, playerView, stageView } from './views';
  import { boardRound, makeRoundsQuiz, single, withId } from './testing/fixtures';
  import { lobbyWith, lobbyWithSplash, must } from './testing/helpers';

  const T0 = 1_000_000;
  const rng0 = () => 0;
  /** Міста: a1 x2, a2; Річки: b1 x3, b2 — усі single, з телефона. */
  const quiz = makeRoundsQuiz([
    boardRound('g1', [
      { title: 'Міста', cells: [{ question: withId(single, 'a1'), mark: 'x2' }, withId(single, 'a2')] },
      { title: 'Річки', cells: [{ question: withId(single, 'b1'), mark: 'x3' }, withId(single, 'b2')] },
    ]),
  ]);
  const toBoard = (lobby = lobbyWith(quiz, 'Оля', 'Петро')) => must(next(must(start(lobby)), T0));
  const marksOf = (board: BoardInfo | null | undefined) => board?.categories.flatMap((c) => c.cells.map((cell) => cell.mark));

  describe('hidden ×2/×3', () => {
    it('the stage and the phones get no marks of unplayed cells; the host sees all', () => {
      const s = toBoard();
      expect(marksOf(stageView(s).board)).toEqual(['none', 'none', 'none', 'none']);
      expect(marksOf(playerView(s, 'p1')?.board)).toEqual(['none', 'none', 'none', 'none']);
      expect(marksOf(hostView(s).board)).toEqual(['x2', 'none', 'x3', 'none']);
      expect(JSON.stringify(stageView(s).board?.categories)).not.toMatch(/"mark":"x[23]"/);
      expect(stageView(s).board).toMatchObject({ marks: ['x2', 'x3'], marksHidden: true });
      expect(hostView(s).board).toMatchObject({ marks: ['x2', 'x3'], marksHidden: false });
    });

    it('a chosen cell shows its mark to everybody; a played cell keeps it', () => {
      const open = must(pickCell(toBoard(), 'p1', 'a1', T0, rng0));
      expect(stageView(open).board?.cell?.mark).toBe('x2');
      expect(marksOf(playerView(open, 'p2')?.board)).toEqual(['x2', 'none', 'none', 'none']);
      // закрити, розкрити, «Далі» до поля: a1 зіграна (played), її mark 'x2', b1 — досі 'none'
    });

    it('a marked cell flips longer for the surprise; an unmarked one keeps 1 s', () => {
      const marked = must(pickCell(toBoard(lobbyWithSplash(quiz, 'Оля', 'Петро')), 'p1', 'a1', T0, rng0));
      expect(marked.splash).toEqual({ kind: 'cell', at: T0, until: T0 + 1000 + CELL_SURPRISE_MS });
      expect(marked.startedAt).toBe(T0 + 1800);
      expect(marked.endsAt).toBe(T0 + 1800 + 20_000);
      const plain = must(pickCell(toBoard(lobbyWithSplash(quiz, 'Оля', 'Петро')), 'p1', 'a2', T0, rng0));
      expect(plain.splash).toEqual({ kind: 'cell', at: T0, until: T0 + 1000 });
      // без transitions: pickCell a1 → splash null, startedAt T0
    });
  });
  ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL: позначки видно всім, немає `marks`, заставка клітинки x2 — 1000 мс.

- [ ] **Step 3: Implement** за Interfaces; у веб-фабриках зрізів, де є `board`, — `marks: [], marksHidden: false` (фабрики, що будують поле з позначками для легенди, — `marks` з відповідними значеннями, щоб наявні тести легенди лишились зеленими після задачі 8).

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS (тест 8c `a board cell flips for 1 s` бере клітинку без позначки — без змін).

- [ ] **Step 5: Commit**

```bash
git add packages/engine packages/shared apps/web/src
git commit -m "feat(engine): the stage and phones get no ×2/×3 of unplayed cells, only the host does; a chosen marked cell flips 800 ms longer for the surprise, the timer still starts after it"
```

---

### Задача 4. Рушій: таблиця балів будь-коли й слова сортування на полі

**Files:**
- Modify: `packages/shared/src/views.ts` (`PlayerTable`, `PlayerView.table`, `SortInfo.words`)
- Modify: `packages/engine/src/views.ts` (`hiddenPoints`, `liveTable`, `playerView`, `sortInfo`)
- Create: `packages/engine/src/views.table.test.ts`
- Modify: веб-фабрики зрізів (`table: null` у гравця, `words: null` у `SortInfo`)

**Interfaces:**
- Produces (`shared`):
  ```ts
  /** Таблиця балів для кнопки «Таблиця»: full — усі гравці, інакше лише власний рядок (leaderboard 'end'). */
  export interface PlayerTable {
    rows: Standing[];
    full: boolean;
  }
  // PlayerView:
  /** Живий рейтинг без балів ще не розкритого запитання; null у лобі. */
  table: PlayerTable | null;
  // SortInfo:
  /** Клітинка поля: усі слова за абеткою (для глядачів); інакше null. */
  words: { id: string; text: string }[] | null;
  ```
- Produces (`engine`, внутрішнє):
  ```ts
  /** Бали поточного запитання, яких гравцеві ще не видно (locked; reveal у фіналі до його розкриття). */
  function hiddenPoints(state: GameState, playerId: string): number;
  function liveTable(state: GameState, playerId: string): PlayerTable | null;
  ```
- `hiddenPoints` — винесений із `playerView` розрахунок `hidden` (`record === undefined ? 0 : locked ? record.points : reveal ? record.points − finalVisiblePoints : 0`); `playerView` використовує його для `me.score`.
- `liveTable`: `phase === 'lobby'` → `null`; `const rows = rankPlayers(state.players.map((p) => ({ ...p, score: p.score - hiddenPoints(state, p.id) })))`; `const full = state.quiz.settings.leaderboard === 'each' || WITH_STANDINGS.includes(state.phase)`; `{ rows: full ? rows : rows.filter((row) => row.participantId === playerId), full }`.
- `sortInfo`: `words: play.board === undefined ? null : [...open.question.words].map(({ id, text }) => ({ id, text })).sort((a, b) => a.text.localeCompare(b.text, 'uk'))`.

- [ ] **Step 1: Write the failing tests** у `views.table.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { pickCell } from './board';
  import { lock, next, start, submitAnswer } from './game';
  import { playerView, stageView } from './views';
  import { boardRound, makeQuiz, makeRoundsQuiz, single, sortQ, withId } from './testing/fixtures';
  import { lobbyWith, must, startRound } from './testing/helpers';

  const T0 = 1_000_000;
  const rng0 = () => 0;
  const kyiv = { type: 'single', optionId: 'b' } as const;
  const names = (rows: { nickname: string; score: number }[] | undefined) => rows?.map((row) => `${row.nickname} ${row.score}`);

  describe('the table at any time', () => {
    it('everybody sees all places during a question with leaderboard each', () => {
      const s = startRound(lobbyWith(makeQuiz([single, withId(single, 'q2')], { leaderboard: 'each' }), 'Оля', 'Петро'), T0, rng0);
      expect(playerView(s, 'p2')?.table).toEqual({ full: true, rows: expect.any(Array) });
      expect(playerView(s, 'p2')?.table?.rows).toHaveLength(2);
      expect(playerView(lobbyWith(makeQuiz([single]), 'Оля'), 'p1')?.table).toBeNull();
    });

    it('the table hides the current question until the reveal', () => {
      let s = startRound(lobbyWith(makeQuiz([single, withId(single, 'q2')], { leaderboard: 'each' }), 'Оля', 'Петро'), T0, rng0);
      s = must(submitAnswer(s, 'p1', kyiv, T0 + 1000));
      s = must(lock(s));
      expect(s.players[0].score).toBeGreaterThan(0);
      // рівні бали: вище той, у кого менший час (Оля відповіла за 1 с, Петро без відповіді — повний ліміт)
      expect(names(playerView(s, 'p2')?.table?.rows)).toEqual(['Оля 0', 'Петро 0']);
      expect(playerView(s, 'p1')?.table?.rows.find((row) => row.nickname === 'Оля')?.score).toBe(0);
      s = must(next(s, T0 + 30_000, rng0)); // reveal
      expect(playerView(s, 'p2')?.table?.rows[0]).toMatchObject({ nickname: 'Оля', rank: 1 });
    });

    it('with leaderboard end a player sees only their own place and score, all of them at round end', () => {
      let s = startRound(lobbyWith(makeQuiz([single], { leaderboard: 'end' }), 'Оля', 'Петро'), T0, rng0);
      s = must(next(must(lock(must(submitAnswer(s, 'p2', kyiv, T0 + 1000)))), T0 + 30_000, rng0)); // reveal
      expect(playerView(s, 'p2')?.table).toEqual({ full: false, rows: [expect.objectContaining({ nickname: 'Петро', rank: 1 })] });
      expect(playerView(s, 'p1')?.table?.rows).toEqual([expect.objectContaining({ nickname: 'Оля', rank: 2 })]);
      // next → round_end/finished: full true, два рядки
    });
  });

  describe('board sort for the watchers', () => {
    it('board sort words come in alphabetical order; classic sort has none', () => {
      const round = boardRound('g1', [{ title: 'Їжа', cells: [withId(sortQ, 's1'), withId(single, 'a2')] }]);
      const board = must(next(must(start(lobbyWith(makeRoundsQuiz([round]), 'Оля', 'Петро'))), T0));
      const s = must(pickCell(board, 'p1', 's1', T0, rng0));
      expect(playerView(s, 'p2')?.sort?.words?.map((word) => word.text)).toEqual(['Буряк', 'Груша', 'Морква', 'Яблуко']);
      expect(stageView(s).sort?.words).toHaveLength(4);
      expect(JSON.stringify(stageView(s).sort)).not.toContain('categoryId');
      const classic = startRound(lobbyWith(makeQuiz([sortQ]), 'Оля'), T0, rng0);
      expect(stageView(classic).sort?.words).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL: немає `table` і `words`.

- [ ] **Step 3: Implement** за Interfaces; у веб-фабриках — `table: null` (гравець) і `words: null` (кожен `SortInfo`).

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine packages/shared apps/web/src
git commit -m "feat(engine): a live table for every phone that hides the current question until the reveal and shows only one's own place with leaderboard end; board sort words for the watchers in alphabetical order"
```

---

### Задача 5. Веб: «прибрано» на телефоні, сцені й пульті; компактний аркуш голосування

**Files:**
- Modify: `apps/web/src/screens/AnswerInput.tsx` (`ChoiceButtons`)
- Modify: `apps/web/src/screens/SpotlightChoices.tsx` (`removed`)
- Modify: `apps/web/src/screens/PlayerScreen.tsx`, `StageScreen.tsx`, `HostScreen.tsx` (передати `view.removed`)
- Modify: `apps/web/src/screens/Buffs.tsx` (`VoteSheet`)
- Modify: `apps/web/src/i18n.ts` (`removedTag`, `voteCollapse`, `voteExpand`), `apps/web/src/styles.css`
- Modify: `apps/web/src/screens/AnswerInput.test.tsx`, `SpotlightChoices.test.tsx`, `Buffs.test.tsx`, `StageScreen.test.tsx`

**Interfaces:**
- `ChoiceButtons`: для `gone` — усередині кнопки після `ChoiceFace` `<span className="removed-tag">{t('removedTag')}</span>`; клас, `disabled` і `aria-label` (`choiceRemoved`) — як зараз.
- `SpotlightChoices` — новий проп:
  ```ts
  /** 50/50 на клітинці поля: прибрані варіанти закреслені з позначкою «прибрано» (лише показ). */
  removed?: string[];
  ```
  Для `single`/`multi`: `li` і кнопки позначки ведучого отримують `is-removed` і `removed-tag`; кнопка позначки прибраного — `disabled`.
- `PlayerScreen`: `AnswerInput` вибравшого — `removed={activeBuff?.removed ?? view.removed}`; кожен `SpotlightChoices` у гілках поля (глядач, усна клітинка вибравшого, `myPending`, `locked`, `reveal`) — `removed={view.removed}`. `StageScreen` (`spotlit` гілка) і `HostScreen` (`SpotlightChoices` у панелі запитання) — `removed={view.removed}`.
- `VoteSheet`: стан `const [collapsed, setCollapsed] = useState(false)`, що скидається при зміні `prompt?.asker.playerId`; у `.vote-sheet-head` — кнопка `btn btn-small vote-toggle` з `aria-expanded={!collapsed}` і текстом «Згорнути»/«Розгорнути»; згорнутий — `section.vote-sheet.is-collapsed`, поле відповіді й «Пропустити» не рендеряться (але `live`-регіон лишається).
- CSS: `.choice.is-removed { opacity: 0.55; position: relative }`, `.removed-tag { position: absolute; top: 0.25rem; right: 0.375rem; font-size: 0.75rem; color: var(--removed-tag); text-decoration: none }`; `.vote-sheet { max-height: 35vh }`, `.vote-sheet.is-collapsed { gap: 0 }`. Токен `--removed-tag` у `:root`.

- [ ] **Step 1: Write the failing tests:**
  ```tsx
  // AnswerInput.test.tsx
  it('removed options are struck through with «прибрано» and keep their place', () => {
    render(<AnswerInput question={single4q} removed={['a', 'c']} onSubmit={() => {}} />);
    const removed = screen.getAllByRole('button').filter((button) => button.classList.contains('is-removed'));
    expect(removed).toHaveLength(2);
    for (const button of removed) {
      expect(button).toBeDisabled();
      expect(within(button).getByText('прибрано')).toBeTruthy();
    }
    expect(screen.getAllByRole('button').map((button) => button.textContent?.replace('прибрано', ''))).toEqual(['AЛьвів', 'BКиїв', 'CОдеса', 'DХарків']);
  });
  // SpotlightChoices.test.tsx
  it('the stage and the host see the removed options of a board cell', () => {
    const { container } = render(<SpotlightChoices question={single4q} spotlight={null} reveal={null} removed={['a']} />);
    expect(container.querySelector('li.choice.is-removed')?.textContent).toContain('прибрано');
    // з onName (ведучий, усна клітинка): кнопка прибраного disabled, решта активні
  });
  // StageScreen.test.tsx
  it('a board question on the stage marks the removed options', () => {
    // фабрика поля з question single4q, removed: ['a', 'c'] → 2 × .choice.is-removed; класика з removed: [] → жодного
  });
  // Buffs.test.tsx
  it('the vote sheet is a compact strip that folds and unfolds', async () => {
    render(<VoteSheet prompt={prompt} question={single} paused={false} offsetMs={0} send={send} onError={() => {}} />);
    const toggle = screen.getByRole('button', { name: 'Згорнути' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(document.querySelector('.vote-sheet.is-collapsed')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Пропустити' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Розгорнути' }));
    expect(screen.getByRole('button', { name: 'Пропустити' })).toBeTruthy();
    expect(rule('.vote-sheet')).toContain('max-height: 35vh');
    expect(rule('.removed-tag')).toContain('position: absolute');
  });
  ```
  (`single4q` — `PublicQuestion` single з чотирма варіантами a–d, як у наявних фабриках; `prompt` — наявна фабрика `VotePrompt` у `Buffs.test.tsx`.)

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web`. Очікується FAIL: немає «прибрано», немає пропу `removed` у `SpotlightChoices`, немає кнопки «Згорнути».

- [ ] **Step 3: Implement** за Interfaces; тексти `removedTag: 'прибрано'`, `voteCollapse: 'Згорнути'`, `voteExpand: 'Розгорнути'`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 50/50 options struck through with «прибрано» on the phone, and on a board cell also on the stage, the host and the watchers' phones; the audience vote is a compact strip that folds"
```

---

### Задача 6. Веб: довідка «?» про бафи й причини словами

**Files:**
- Modify: `apps/web/src/screens/Buffs.tsx` (`whyText`, `BuffRow`, новий `BuffHelp`)
- Modify: `apps/web/src/i18n.ts` (`buffWhy_unfit_type_*`, `buffWhere_*`, `buffHelp*`, `buffGuide_audience`, `guideBuffsWhere`)
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/screens/Buffs.test.tsx`, `apps/web/src/guide-text.test.ts` (якщо перевіряє старі тексти)

**Interfaces:**
- `whyText(block, kind)`: `const specific = \`buffWhy_${block}_${kind}\`; return hasText(specific) ? t(specific) : t(\`buffWhy_${block}\`, { name })`, де `hasText` — перевірка ключа в словнику `i18n.ts` (якщо такої функції немає — додати `export function hasText(key: string): key is TextKey` поруч із `t`).
- Новий компонент:
  ```tsx
  /** Кнопка «?» і аркуш: що робить кожен дозволений баф і де діє. Нічого не надсилає — працює й на паузі. */
  export function BuffHelp({ kinds }: { kinds: BuffKind[] }): JSX.Element;
  ```
  `BuffRow` рендерить `<BuffHelp kinds={buffs.slots.map((slot) => slot.kind)} />` у `.buff-bar` поруч із `.buff-row` (обгортка `.buff-line` — flex, ряд і «?» в одному рядку; висота ряду не змінюється). Аркуш: `div.buff-help-sheet[role=dialog][aria-modal=true][aria-labelledby]` з `h2` «Бафи», `ul` пунктів (`BUFF_ICONS`, `buffName`, `t('buffGuide_' + kind)`, `t('buffWhere_' + kind)`), рядком `buffHelpNone` і кнопкою «Закрити»; дотик по тлу (`.buff-help-backdrop`) і Escape закривають; фокус — на «Закрити», після закриття — на «?».
- Тексти — з «Рішень плану»: `buffHelpOpen: 'Що роблять бафи'`, `buffHelpTitle: 'Бафи'`, `buffHelpNone: 'Не діють: бліц, бліц-клітинки, фінал, ланцюжок, сортування й дуелі.'`, `buffHelpClose: 'Закрити'`, вісім `buffWhere_*`, три `buffWhy_unfit_type_*`, нові `buffGuide_audience` і `guideBuffsWhere`.
- CSS: `.buff-help` — коло 2rem з рамкою `var(--line)`, без заливки; `.buff-help-sheet` — `position: fixed; inset: auto 0 0 0; z-index: 75; max-height: 70vh; overflow-y: auto`; `.buff-help-backdrop` — `position: fixed; inset: 0; z-index: 74`.

- [ ] **Step 1: Write the failing tests** (`Buffs.test.tsx`):
  ```tsx
  it('«?» lists what each allowed buff does and where it works', () => {
    render(<BuffRow buffs={slotsOf(['fifty', 'audience'])} paused={false} send={send} onError={() => {}} />);
    expect(document.querySelectorAll('.buff-row .buff-btn')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Що роблять бафи' }));
    const sheet = screen.getByRole('dialog', { name: 'Бафи' });
    expect(within(sheet).getByText('Прибирає частину неправильних варіантів.')).toBeTruthy();
    expect(within(sheet).getByText('Де: запитання з варіантами — у класиці й на полі, і на усних клітинках.')).toBeTruthy();
    expect(within(sheet).getByText('Інші гравці підказують, як думають; вам +15 с.')).toBeTruthy();
    expect(within(sheet).queryByText(/Подвоює бали/)).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a disabled button says exactly why', () => {
    const blocked = (kind: BuffKind, block: BuffBlock): PlayerBuffs => ({ slots: [{ kind, state: 'blocked', block }], active: null });
    const why = (buffs: PlayerBuffs, name: string) => {
      const { unmount } = render(<BuffRow buffs={buffs} paused={false} send={send} onError={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name }));
      const text = document.querySelector('.buff-why')?.textContent;
      unmount();
      return text;
    };
    expect(why(blocked('double', 'off_blitz_cell'), 'Подвійні бали')).toBe('На бліц-клітинках бафів немає.');
    expect(why(blocked('fifty', 'unfit_type'), '50/50')).toBe('50/50 діє лише на запитаннях з варіантами.');
    expect(why(blocked('retry', 'unfit_voice'), 'Ще спроба')).toBe('Друга спроба не діє, коли відповідаєте вголос.');
    expect(why(blocked('swap', 'spares_out'), 'Заміна запитання')).toBe('Запасні запитання закінчилися.');
  });

  it('the help sheet is a fixed layer above the vote sheet', () => {
    expect(rule('.buff-help-sheet')).toContain('position: fixed');
    expect(rule('.buff-help-sheet')).toContain('z-index: 75');
  });
  ```
  Назви бафів (`aria-label`) узяти з наявних `buff_*` в `i18n.ts` (у плані — як у наявних тестах `Buffs.test.tsx`).

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web`. Очікується FAIL: немає «?» і текстів.

- [ ] **Step 3: Implement** за Interfaces.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS (тести «Як грати», що порівнюють `guideBuffsWhere`/`buffGuide_audience` дослівно, оновити на нові тексти — навмисна зміна).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): «?» beside the buff row lists what each allowed buff does and where it works; a disabled buff says exactly why — no buffs on blitz cells, 50/50 only with options, no second try aloud"
```

---

### Задача 7. Веб: «Таблиця» в шапці телефона й «До меню» після гри

**Files:**
- Create: `apps/web/src/screens/TableSheet.tsx` (`TableButton`)
- Create: `apps/web/src/screens/MenuLinks.tsx` (`MenuLinks`)
- Create: `apps/web/src/screens/TableSheet.test.tsx`
- Modify: `apps/web/src/screens/PlayerScreen.tsx` (шапка, `finished`), `HostScreen.tsx` (`finished`), `StageScreen.tsx` (`finished`)
- Modify: `apps/web/src/i18n.ts` (`tableOpen`, `tableTitle`, `tableOwnOnly`, `toMenu`, `toQuizzes`, `toHistory`), `apps/web/src/styles.css`
- Modify: `apps/web/src/screens/PlayerScreen.test.tsx`, `HostScreen.test.tsx`, `StageScreen.test.tsx`

**Interfaces:**
- Produces (`web`):
  ```tsx
  /** Кнопка «Таблиця» в шапці й аркуш поверх екрана; закривається дотиком будь-де або Escape. */
  export function TableButton({ table, meId }: { table: PlayerTable; meId: string }): JSX.Element;
  /** Посилання після кінця гри: player — «До меню»; host — «До вікторин» і «Історія ігор»; stage — «До меню» в куті. */
  export function MenuLinks({ role }: { role: 'player' | 'host' | 'stage' }): JSX.Element;
  ```
- `PlayerScreen` шапка: `<span>{me.nickname}</span>`, `DuelButton`, `{view.table !== null && <TableButton table={view.table} meId={me.id} />}`, рахунок. `TableButton` — `button.btn.btn-bar` (той самий клас і висота, що в «⚔ Дуель»; якщо класу `btn-bar` немає — взяти клас кнопки `DuelButton`). Аркуш — `div.table-sheet[role=dialog][aria-label="Таблиця"]` з `Standings highlightId={meId}`; при `!table.full` — ще `p.meta` «Повна таблиця — наприкінці гри.»; `onClick` на аркуші й тлі закриває.
- `MenuLinks`: `nav.menu-links` з `a.btn` — player: `/` «До меню»; host: `/quizzes` «До вікторин», `/history` «Історія ігор»; stage: `a.btn.btn-small.stage-menu` `/` «До меню» (`position: fixed; right: 1rem; bottom: 1rem`). Рендериться на етапі `finished` у трьох екранах (у гравця й ведучого — під таблицею підсумків).
- CSS: `.table-sheet { position: fixed; inset: 0; z-index: 75; … }`, `.stage-menu { position: fixed; … }`.

- [ ] **Step 1: Write the failing tests:**
  ```tsx
  // TableSheet.test.tsx
  const rows: Standing[] = [
    { participantId: 'p2', nickname: 'Петро', score: 300, totalTimeMs: 0, rank: 1 },
    { participantId: 'p1', nickname: 'Оля', score: 100, totalTimeMs: 0, rank: 2 },
  ];
  it('«Таблиця» opens all places over the screen and one tap closes it', () => {
    render(<TableButton table={{ rows, full: true }} meId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Таблиця' }));
    const sheet = screen.getByRole('dialog', { name: 'Таблиця' });
    expect(within(sheet).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['1Петро300', '2Оля100']);
    expect(sheet.querySelector('.is-me')?.textContent).toContain('Оля');
    fireEvent.click(sheet);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('with the table hidden till the end it shows only one’s own place', () => {
    render(<TableButton table={{ rows: [rows[1]], full: false }} meId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Таблиця' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Повна таблиця — наприкінці гри.')).toBeTruthy();
  });
  it('the sheet is a fixed layer', () => {
    expect(rule('.table-sheet')).toContain('position: fixed');
  });
  // PlayerScreen.test.tsx
  it('the header has «Таблиця» during a question, none in the lobby; «До меню» after the game', () => {
    // onQuestion({ table: { rows, full: true } }) → кнопка «Таблиця» в header.bar
    // лобі (table: null) → немає
    // finished → link «До меню» з href "/"
  });
  // HostScreen.test.tsx
  it('after the game the host goes to the quizzes or the game history', () => {
    // finished → links «До вікторин» (/quizzes) і «Історія ігор» (/history); до кінця гри — немає
  });
  // StageScreen.test.tsx
  it('the podium has a small «До меню» in the corner', () => {
    // finished → a.stage-menu з href "/"; rule('.stage-menu') містить position: fixed
  });
  ```
  (`rule()` — скопіювати з `Buffs.test.tsx` або винести в спільний `apps/web/src/test-css.ts`, якщо так уже зроблено в репозиторії.)

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web`. Очікується FAIL: немає `TableSheet.tsx`, `MenuLinks.tsx`.

- [ ] **Step 3: Implement** за Interfaces; тексти: `tableOpen: 'Таблиця'`, `tableTitle: 'Таблиця'`, `tableOwnOnly: 'Повна таблиця — наприкінці гри.'`, `toMenu: 'До меню'`, `toQuizzes: 'До вікторин'`, `toHistory: 'Історія ігор'`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): «Таблиця» in the phone header at any time — all places over the screen or only one's own with the table hidden till the end; «До меню» after the game for players, the stage and the host (quizzes or history)"
```

---

### Задача 8. Веб: поле без позначок і сюрприз «×2!»

**Files:**
- Modify: `apps/web/src/screens/Board.tsx` (`BoardLegend`)
- Modify: `apps/web/src/live/Splash.tsx` (`CellFlip`, `Splash`)
- Modify: `apps/web/src/i18n.ts` (`legendMarksHidden`, `splashSurprise`), `apps/web/src/styles.css`
- Modify: `apps/web/src/screens/Board.test.tsx`, `apps/web/src/live/Splash.test.tsx`

**Interfaces:**
- `BoardLegend`: рядки `legendX2`/`legendX3` — за `board.marks.includes('x2' | 'x3')` (а не за клітинками); при `board.marksHidden && board.marks.length > 0` — ще рядок `legendMarksHidden` «Де ×2 і ×3 — сюрприз.». Решта легенди — без змін.
- `CellFlip`: `const surprise = cell.mark !== 'none'`; корінь — `div.splash-flip` як зараз; поруч (усередині шару) — `{surprise && <p className="splash-surprise">{t('splashSurprise', { mark: markText(cell.mark) })}</p>}` (`splashSurprise: '{mark}!'`). `Splash` для `kind === 'cell'` з позначкою додає клас `is-surprise` і змінну `--splash-flip-ms: ${CELL_FLIP_MS}ms` (`const CELL_FLIP_MS = 1000` — дорівнює `SPLASH_MS.cell` рушія; коментар про це).
- CSS: `.splash.is-surprise .splash-flip { animation-duration: var(--splash-flip-ms) }`; `.splash-surprise` — по центру поверх картки, `color: var(--surprise)`, розмір як `.splash-title`; анімація `splash-surprise` з `animation-delay: calc(var(--splash-elapsed) + var(--splash-flip-ms))` і тривалістю `calc(var(--splash-ms) - var(--splash-flip-ms))`, `animation-fill-mode: both` (до свого часу невидимий); масштаб — лише в `@media (prefers-reduced-motion: no-preference)`, базово — `opacity`. Токен `--surprise` у `:root`.

- [ ] **Step 1: Write the failing tests:**
  ```tsx
  // Board.test.tsx
  it('the legend still explains ×2 and ×3 when the marks are hidden, and says where they are is a surprise', () => {
    const board = boardOf({ marks: ['x2', 'x3'], marksHidden: true }); // усі клітинки mark 'none'
    render(<BoardLegend board={board} />);
    const legend = screen.getByRole('list', { name: 'Види клітинок' });
    for (const text of ['×2 — подвійна ціна', '×3 — потрійна ціна', 'Де ×2 і ×3 — сюрприз.']) expect(within(legend).getByText(text)).toBeTruthy();
    expect(document.querySelector('.gb-mark')).toBeNull();
  });
  it('the host legend has no surprise line', () => {
    // boardOf({ marks: ['x2'], marksHidden: false }) з клітинкою mark 'x2' → .gb-mark «×2», немає «Де ×2 і ×3 — сюрприз.»
  });
  // Splash.test.tsx
  it('a marked cell ends its flip with «×2!»', () => {
    // зріз з splash { kind: 'cell', at: now, until: now + 1800 } і board.cell.mark 'x2'
    // → .splash.is-cell.is-surprise, .splash-surprise з текстом «×2!», style містить --splash-flip-ms: 1000ms
    // board.cell.mark 'none' → немає is-surprise і .splash-surprise
  });
  it('the surprise moves only without reduced motion', () => {
    // rule('.splash-surprise') не містить transform; @media (prefers-reduced-motion: no-preference) містить splash-surprise
  });
  ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web`. Очікується FAIL: легенда рахує позначки клітинок, немає «×2!».

- [ ] **Step 3: Implement** за Interfaces.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): the board hides where ×2 and ×3 are — the legend still explains them; a chosen marked cell ends its flip with a big «×2!» / «×3!»"
```

---

### Задача 9. Веб: сортування на полі видно всім і рівні зони

**Files:**
- Modify: `apps/web/src/screens/SortView.tsx` (`SortWatch`, новий `SortWords`)
- Modify: `apps/web/src/screens/PlayerScreen.tsx` (глядач на `question`, `locked`, `reveal`)
- Modify: `apps/web/src/screens/StageScreen.tsx` (слова під `SortReveal` на полі)
- Modify: `apps/web/src/i18n.ts` (`sortWords`), `apps/web/src/styles.css`
- Modify: `apps/web/src/screens/SortView.test.tsx`, `PlayerScreen.test.tsx`, `StageScreen.test.tsx`

**Interfaces:**
- Produces (`web`):
  ```tsx
  /** Слова сортування чипами (лише показ): глядачі поля й сцена до розкриття. */
  export function SortWords({ words }: { words: { id: string; text: string }[] }): JSX.Element;
  ```
  `ul.chips.sort-words[aria-label="Слова"]`.
- `SortWatch` — під ареною й прогресом `{info.words !== null && <SortWords words={info.words} />}`; рядок «Сортує Оля» (`sortWatching`) лишається.
- `PlayerScreen`: на `reveal` у гілці `board !== null && !chooserIsMe` для сортування — `SortReveal categories={question.sort.categories} question={view.reveal}` замість порожнього місця (зараз `!isSort` ховає `SpotlightChoices`). Етапи `question`/`locked` уже показують `SortWatch`.
- `StageScreen`: у гілці `question.sort !== null` при `view.board !== null && reveal === null && view.sort?.words` — `SortWords` під `SortReveal`.
- CSS рівних зон:
  ```css
  .sort-arena[data-zones='3'],
  .sort-arena[data-zones='4'] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sort-arena[data-zones='3'] { grid-template-rows: repeat(2, minmax(0, 1fr)); }
  .sort-arena[data-zones='4'] { grid-template-rows: repeat(3, minmax(0, 1fr)); }
  .sort-arena[data-zones='3'] .sort-zone[data-pos='left'],
  .sort-arena[data-zones='4'] .sort-zone[data-pos='left'] { grid-column: 1; grid-row: 2; }
  /* right — колонка 3, рядок 2; top — колонка 2, рядок 1; bottom — колонка 2, рядок 3; центр — колонка 2, рядок 2 */
  ```
  (для 3 і 4 зон `min-height` зон `top`/`bottom` знімається, щоб клітинки були рівні). 2 зони — без змін.

- [ ] **Step 1: Write the failing tests:**
  ```tsx
  // SortView.test.tsx
  it('a watcher on the board sees the categories, all words and who sorts', () => {
    render(<SortWatch question={sortQuestion} info={{ total: 4, rows: [row('Оля', 2)], winner: null, words: words(['Буряк', 'Груша', 'Морква', 'Яблуко']) }} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(within(screen.getByRole('list', { name: 'Слова' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Буряк', 'Груша', 'Морква', 'Яблуко']);
    expect(screen.getByText('Сортує Оля')).toBeTruthy(); // текст sortWatching — як у i18n
  });
  it('three and four categories get equal zones', () => {
    expect(rule(".sort-arena[data-zones='4']")).toContain('grid-template-rows: repeat(3, minmax(0, 1fr))');
    expect(css).toContain(".sort-arena[data-zones='3'],\n.sort-arena[data-zones='4'] {\n  grid-template-columns: repeat(3, minmax(0, 1fr));");
  });
  // PlayerScreen.test.tsx
  it('a watcher sees how the words fall into the categories at the reveal', () => {
    // зріз reveal на полі, chooser p2, question sort, reveal — повне запитання sort → .sort-reveal.is-open з чотирма li
  });
  // StageScreen.test.tsx
  it('the stage shows the board sort words until the reveal', () => {
    // question на полі з sort.words → .sort-words з 4 чипами; reveal → .sort-words немає, .sort-reveal.is-open
  });
  ```
  Текст «Сортує {name}»: якщо наявний `sortWatching` звучить інакше — тест бере наявний текст, ключ не змінюється.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web`. Очікується FAIL: немає слів і розкриття в глядача, зони нерівні.

- [ ] **Step 3: Implement** за Interfaces; текст `sortWords: 'Слова'`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): board sorting for everybody — the watchers and the stage see the categories and all words, and how they fall at the reveal; three or four categories get equal zones"
```

---

### Задача 10. Наскрізні: наявні сценарії й сценарій 9a з кадрами

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–9.
- Допоміжні функції файлу: `open`, `register`, `join`, `shot`, `click`, `field`, `exact`, `bodyText`, `expectNoSideScroll`, `snapshot`, `seconds`, `afterSplash`, `splashOn`, з 8a — `buffButton`, `takeBuff`, `tapBuff`, `pickOption`, `boxOf`, з 8b — `vote`, з 7f — `sortZone`, `sortBy`, `sortZoneBoxes`.
- Нова локальна: `async function removedTexts(page: Page): Promise<string[]>` — тексти `.choice.is-removed` без «прибрано».

- [ ] **Step 1: Run the existing suite first.** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Записати, що впало й чому. Очікувані місця й виправлення (перевірок не послаблювати):
  - 7a (легенда поля): рядки «×2 — подвійна ціна», «×3 — потрійна ціна» лишаються (з `marks`), додається рядок «Де ×2 і ×3 — сюрприз.» — наявні `waitFor` проходять; якщо сценарій перевіряє `.gb-mark` на сцені чи телефоні до вибору клітинки — перевірку перенести на пульт ведучого (там позначки є) і додати `expect(await stage.locator('.gb-mark').count()).toBe(0)`.
  - 8a (`.buff-row .buff-btn` = 5, 50/50 `.choice.is-removed` = 2): кнопка «?» поза `.buff-row` — лічильник той самий; «прибрано» в тексті кнопки — `hasText: 'Світязь'` і далі знаходить.
  - 8b (аркуш голосування): кнопки «Голосувати»/варіанти — у розгорнутому аркуші, як і раніше; `max-height: 35vh` на 360–375 px може вимагати прокрутки всередині аркуша — Playwright прокручує сам.
  - 8c (перегортання «Міста · 300» з «×2»): заставка клітинки тепер 1,8 с — `afterSplash` чекає; `seconds(olya) ≥ 19` лишається.
  - сценарії з бліцем, фіналом, ланцюжком і сортуванням у вікторинах із бафами — тепер є ряд бафів із неактивними кнопками; виміри, що порівнюють позиції до й після кроку, не змінюються (ряд стоїть з першої миті запитання).
  Якщо падіння не пояснюється змінами 9a — це вада, її виправляти в коді задач 1–9.

- [ ] **Step 2: Add the scenario** `it('part 9a: 50/50 struck through for the taker and on the stage for a board cell, the audience with +15 s and a folding sheet, buffs on a voice cell, «?» help and exact reasons, «Таблиця» at any time, hidden ×2 with a «×2!» surprise, board sorting for everybody with equal zones, «До меню» after the game', …)` з `try/catch` і `snapshot()`. Підготовка:
  1. Ведучий `register(host, 'host', 'Олег Ведучий', 'host9a@example.com')`. Вікторина «Після третьої гри» через `host.request.post(`${base}/api/quizzes`, { data })`, `settings: { leaderboard: 'end', buffs: ['fifty', 'double', 'retry', 'time', 'shield', 'audience', 'hint', 'swap'] }`, запасні — один `boolean` «Сонце — зірка?» (так), усі раунди `shuffleOptions: false`, `speedBonus: false`, `rules: { ...DEFAULT_RULES, penalty: 'minus' }`:
     - **Раунд 1, класика** «Розминка»: `q1` single «Найбільше озеро України?» — «Ялпуг» (правильний), «Світязь», «Синевир», «Кагул»; 100 балів, 30 с. `q2` multi «Які міста стоять на Дніпрі?» — «Київ», «Дніпро», «Черкаси» (правильні), «Львів», «Ужгород», «Одеса» (6 варіантів, 3 неправильні — 50/50 прибирає 2); 100 балів, 30 с. `q3` text «Столиця Франції?» — прийнятне «Париж»; 100 балів, 30 с.
     - **Раунд 2, поле** «Поле», `answerMode: 'phone'`, `check: 'auto'`, порядок за приєднанням: «Міста» (100 — single «Столиця Італії?» «Рим»/«Мілан»/«Неаполь»/«Турин»; 200 — **усна**, single «Столиця Іспанії?» «Мадрид»/«Барселона»/«Севілья»; 300 — `x2`, single «Столиця Польщі?» «Варшава»/«Краків»/«Гданськ»), «Їжа» (100 — sort «Овочі, фрукти чи ягоди?» з трьома категоріями «Овочі», «Фрукти», «Ягоди» по два слова; 200 — бліц-клітинка single; 300 — single), «Гори» по 3 single.
  2. Гра: `stage` 1600 × 900, `olya` 375 × 812, `petro` 360 × 740, `ira` 390 × 844. Приєднуються Оля, Петро, Іра. Ведучий «Почати гру» → `afterSplash` → «Почати раунд».

- [ ] **Step 3: Assertions and shots** (у такому порядку):
  1. **50/50 у класиці (`q1`).** Оля «?» біля ряду → аркуш «Бафи» з вісьмома пунктами й рядками «Де: …»; кадр `buff9a-help-375`; `expectNoSideScroll(olya, 'buff9a-help-375')`; Escape. Оля бере «50/50» → `removedTexts(olya)` — два варіанти без «Ялпуг», кожен з «прибрано», `boxOf` варіантів до й після однакові; кадр `buff9a-fifty-375`. На сцені й у Петра `.choice.is-removed` немає (класика). Усі відповідають.
  2. **50/50 у multi (`q2`).** Петро бере «50/50» → `removedTexts(petro)` — рівно 2 з «Львів», «Ужгород», «Одеса»; кадр `buff9a-fifty-multi-360`.
  3. **Зал і +15 с (`q3`).** Петро й Іра відповідають «Париж»; Оля бере «Зал» → у Олі особистий таймер: `seconds(olya)` більший за `seconds(stage)` щонайменше на 14; у Петра аркуш `.vote-sheet` не вищий за 35 % висоти вікна (`boxOf(petro, '.vote-sheet').height ≤ 0.35 × 740 + 1`); кадр `buff9a-vote-360`; Петро «Згорнути» → лишається рядок із «Розгорнути», висота аркуша менша; кадр `buff9a-vote-folded-360`; «Розгорнути» → `vote(petro, 'Париж')`. Спільний час минає — сцена показує «Чекаємо: Оля»; Оля відповідає «Париж».
  4. **«Таблиця» з leaderboard end.** Під час `q3` Іра «Таблиця» → аркуш з одним рядком (своє місце й бали) і «Повна таблиця — наприкінці гри.»; кадр `buff9a-table-390`; дотик — аркуш зник, запитання на місці (`boxOf` h1 до й після однакові).
  5. **Приховані ×2 і сюрприз.** «Наступний раунд» → поле: на сцені й телефонах `.gb-mark` немає, у ведучого «×2» на «Міста 300»; легенда сцени має «×2 — подвійна ціна» і «Де ×2 і ×3 — сюрприз.»; кадр `buff9a-board-stage`. Оля вибирає «Міста, 300» → `splashOn(stage, 'cell')` → `stage.locator('.splash-surprise', { hasText: '×2!' }).waitFor()`; кадри `buff9a-surprise-stage`, `buff9a-surprise-375` (`{ splash: true }`). `afterSplash` → `seconds(olya) ≥ 19`. Оля бере «50/50» → на сцені, у ведучого, у Петра й Іри по 1 `.choice.is-removed` з «прибрано» (single на 3 варіанти прибирає 1); кадр `buff9a-board-fifty-stage`. Оля «Варшава» → «Прийняти».
  6. **Усна клітинка з бафами.** Петро вибирає «Міста, 200» → у Петра ряд бафів активний; дотик «Ще спроба» → «Друга спроба не діє, коли відповідаєте вголос.»; Петро бере «Подвійні бали» → ведучий «Правильно» → рахунок Петра +400 (200 без позначки × 2 за бафом); кадр `buff9a-voice-360`.
  7. **Бліц-клітинка — причина.** Іра вибирає «Їжа, 200» (бліц) → у кожного ряд бафів з неактивними кнопками; дотик → «На бліц-клітинках бафів немає.». Хтось відповідає, розкриття.
  8. **Сортування для всіх.** Оля вибирає «Їжа, 100» → у Петра й Іри арена з трьома зонами без кнопок, рядок «Сортує Оля» і шість слів за абеткою в `.sort-words`; на сцені ті самі слова; розміри трьох зон у Олі (`sortZoneBoxes`) рівні (ширина й висота однакові ±1 px); кадри `sort9a-watch-360`, `sort9a-play-375`, `sort9a-stage`. Оля сортує все (`sortBy(olya, 'tap', …)`), розкриття → у Петра `.sort-reveal.is-open` з усіма словами по категоріях; кадр `sort9a-reveal-360`.
  9. **«До меню».** Ведучий «Завершити гру» (підтвердити) → `afterSplash` → у Олі «До меню» (`href="/"`), у ведучого «До вікторин» і «Історія ігор», на сцені `.stage-menu`; кадри `menu9a-player-375`, `menu9a-host`, `menu9a-stage`; Оля «До меню» → головна (`/`); ведучий «Історія ігор» → список історії з цією грою зверху. `expectNoSideScroll(olya, 'menu9a-player-375')`.
  10. `expect(problems).toEqual([])`.

- [ ] **Step 4: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв. Потім той самий запуск з `E2E_SHOTS=1` і перегляд кадрів у `apps/server/e2e/artifacts/shots`:
  - «прибрано» читається на 360–390 px, варіанти не зсунулись і не обрізались;
  - аркуш голосування не вищий за третину екрана, згорнутий — один рядок; довідка «?» влазить і прокручується;
  - на полі немає позначок до вибору; штамп «×2!» помітний на сцені й телефоні;
  - три зони сортування рівні; слова глядачів не налазять на арену;
  - «До меню» на сцені не закриває подіуму.

- [ ] **Step 5: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts
git commit -m "test: part 9a end-to-end — 50/50 struck through and on the stage for a board cell, the audience with +15 s and a folding sheet, buffs on a voice cell with exact reasons and «?» help, «Таблиця» at any time, hidden ×2 with a «×2!» surprise, board sorting for everybody with equal zones, «До меню» after the game"
```

Після фінальної рецензії гілку злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`. У звіті власникові назвати рішення: у «кілька відповідей» 50/50 прибирає половину неправильних угору, але один неправильний лишається; прибрані закреслені з позначкою «прибрано» й не зсуваються, на полі їх бачать сцена, ведучий і інші телефони, у класиці — лише сам гравець; «Зал» дає +15 с особистого часу, аркуш голосування до третини екрана й згортається; на усних клітинках діють усі бафи, крім «Ще спроби», 50/50 — лише з варіантами; ряд бафів тепер видно й там, де бафів немає (бліц, бліц-клітинка, фінал, ланцюжок, сортування) — з конкретною причиною; «?» показує, що робить кожен баф і де діє; «Таблиця» в шапці телефона працює завжди, з «таблиця лише в кінці» показує тільки власне місце (повна — на підсумках раунду й наприкінці), бали поточного запитання до розкриття в ній не видно; «До меню» — гравцеві на головну, ведучому «До вікторин» і «Історія ігор» (без переходу до конкретної гри), сцені — мала кнопка в куті; позначок ×2/×3 на полі не видно нікому, крім ведучого, але легенда каже, що вони є, і «Де ×2 і ×3 — сюрприз»; перегортання клітинки з позначкою на 0,8 с довше й закінчується штампом «×2!», таймер стартує після нього; глядачі сортування на полі бачать усі слова за абеткою й розклад на розкритті; три й чотири категорії — рівні клітинки «хрестом».
