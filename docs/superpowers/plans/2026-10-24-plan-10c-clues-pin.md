# План 10c: підказки по черзі («Хто я?») і точка на мапі чи картинці

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 10c специфікації (розділ 7) і спільні правила розділу 14a, що її стосуються.
- **«Хто я?» (`clues`)** — новий тип запитання. Ведучий задає 3–6 підказок від найважчої до найлегшої, правильну відповідь із прийнятними написаннями (як у «тексті») та інтервал між підказками. Підказки відкриваються по одній, гравець відповідає один раз, у будь-який момент. Відповідь після k-ї з n підказок дає `ціна × (n − k + 1) / n`, неправильна — 0. На усній клітинці поля наступну підказку відкриває ведучий кнопкою, бали — за номером відкритої підказки в мить оцінки. Дозволений у класиці й на полі.
- **Точка на мапі чи картинці (`pin`)** — новий тип запитання. Основа: вбудована мапа «Світ», «Європа», «Україна» або власна завантажена картинка. Ведучий ставить правильну точку, задає радіус повних балів і радіус нуля (у відсотках довшої сторони картинки). Гравець тицяє в мапу, до підтвердження точку можна переставити, мапу можна наближати двома пальцями. Усередині першого кола — повні бали, далі лінійно до нуля на другому колі. На розкритті сцена показує всі точки з нікнеймами, правильну точку й кола; найближчий гравець підсвічений. Дозволений у класиці й на звичайній клітинці поля з телефона.
- **Що вважається правильним (14a):** точка — частка ≥ половини ціни (тип із балами за близькість, як повзунок). «Хто я?» — правильна відповідь завжди правильна; спадання за підказками лише зменшує бали (як у картинки, що проявляється, — рішення координатора 10b).
- **Анти-ціль «відповідь раніше розкриття»:** правильна точка й кола, а також ще не відкриті підказки й прийнятні написання ніколи не потрапляють на телефон чи сцену до розкриття.
- **Довідка ведучого:** записи `question.clues`, `question.pin` (typecheck вимагає) і оновлені записи бафів, клітинок, раундів і бонусу за швидкість.
- **Демо:** у демо `demo` — «Хто я?» у класиці й на усній клітинці, точка на мапі «Україна» в класиці й на клітинці поля з телефона.

**Архітектура:**
- **Shared (`packages/shared/src/quiz.ts`, `answer.ts`, `views.ts`, `events.ts`, `game.ts`).**
  - `questionSchema` + гілки `clues` (`clues`, `accepted`, `interval`) і `pin` (`map`, `aspect`, `target`, `fullRadius`, `zeroRadius`); `QUESTION_TYPES` + `'clues'`, `'pin'`. До `SIMPLE_TYPES` і `REVEAL_TYPES` нові типи **не** входять.
  - Нові константи: `PIN_MAPS`, `PIN_MAP_ASPECT`, ліміти `LIMITS.minClues` … `LIMITS.pinMaxAspect`.
  - Нові чисті функції: `cluesAt`, `clueShare`, `pinDistance`, `pinShare`; `proximityPartial` + `'pin'`.
  - `answerSchema` + `{ type: 'clues', value }` і `{ type: 'pin', x, y }`.
  - Коди схеми: `clues_time`, `clues_video`, `pin_base`, `pin_aspect`, `pin_radius`, `pin_video`; коди вікторини: `clues_place`, `pin_place`.
  - `ErrorCode` + `'clues_done'`; подія пульта `host:clue`.
  - `PublicQuestion` + `clues: PublicClues | null`, `pin: PublicPin | null`; `StageView`/`HostView` + `pinMarks`; `HostResponse` + `clue`.
- **Рушій (`packages/engine`).**
  - `check.ts`: `checkAnswer` для `clues` (як «текст») і `pin` (частка `pinShare`, правильна від 0,5). `revealFactor` узагальнюється до `paceFactor(question, timeMs, opened?)`: картинка, що проявляється, — `revealShare`; «Хто я?» — `clueShare`; інакше 1. `paysForTime(question)` вимикає бонус за швидкість.
  - Новий `clues.ts`: скільки підказок відкрито (`Play.clues`), коли відкриється наступна, відкриття за часом у `tick`, `nextClue` для ведучого на усній клітинці, номер підказки відповіді.
  - `game.ts`: `Play.clues` (від 1) з `openQuestion`; `tick` відкриває підказки, чий час настав; `nextDeadline` (`blitz.ts`) чекає й на наступну підказку; класика, поле й оцінка ведучого беруть `paceFactor`.
  - `restore.ts`: **`GAME_STATE_VERSION` 2 → 3** (`Play.clues`).
  - `views.ts`: `publicClues` (лише відкриті підказки), `PublicPin` без правильної точки й кіл, `pinMarks` для сцени (на розкритті) і пульта (з етапу `question`), `HostResponse.clue`.
- **Сервер.**
  - Сокет `host:clue` → менеджер → `nextClue`. Підказки за часом відкриває наявний таймер кімнати (`reschedule` → `nextDeadline` → `tick` → `commit` → розсилка), окремого коду не треба.
  - Історія, профіль і досягнення читають `accepted`, який рушій рахує за 14a; лише тести.
  - Демо `demo` отримує «Хто я?» і точку на мапі.
- **Мапи.** Скрипт `apps/web/scripts/build-maps.mjs` (одноразовий, не в CI) будує з даних Natural Earth три спрощені SVG у `apps/web/public/maps/` (Vite кладе їх у `dist/maps/`, сервер віддає через наявний `@fastify/static`) і файл опорних точок `apps/server/scripts/pin-places.ts` для демо, тестів і e2e.
- **Веб.**
  - Спільне: `PinBoard` (основа + шар SVG: позначки, кола, правильна точка), `PinFrame` (наближення двома пальцями, кнопками й перетягуванням; дотик ставить точку), `pin-zoom.ts` (чиста математика), `pin-maps.ts` (адреси мап), `CluesList`.
  - Телефон: `PinInput` (точка до підтвердження), підказки з відліком до наступної й рядком «Зараз — N % ціни»; міні-розкриття точки.
  - Сцена: підказки великим; мапа без позначок під час запитання; на розкритті — усі точки, кола, правильна точка, найближчий підсвічений.
  - Пульт: усі підказки з позначкою «відкрито», кнопка «Відкрити підказку N» на усній клітинці, номер підказки біля кожної відповіді; живі точки гравців на мапі.
  - Редактор: тіло «Хто я?» (рядки підказок, написання, інтервал), тіло точки (вибір основи, дотик ставить правильну точку, кола наживо, радіуси), обмеження клітинок поля, перевірки чернетки, відновлення чернетки.
  - Історія: мініатюра мапи з правильною точкою й колами для запитання `pin`.
  - Довідка: `question.clues`, `question.pin`, оновлення пов'язаних записів.

**Технології:** TypeScript, zod 4, vitest, Drizzle ORM (PGlite у тестах), Fastify + Socket.IO, React 19 + Vite, Testing Library (jsdom), Playwright. Лише для скрипта мап (devDependencies `apps/web`): `d3-geo@3.1.1`, `topojson-server@3.0.1`, `topojson-simplify@3.0.3`, `topojson-client@3.1.0` (усі ISC).

**Специфікація:** `docs/superpowers/specs/2026-10-24-new-formats-design.md`:
- розділ 7 (частина 10c);
- розділ 14a: «що вважається правильною відповіддю», «правила раунду для нових типів», «деплой»;
- розділ 2: анти-цілі «правильна відповідь раніше розкриття» (координати точки названо прямо), «старі вікторини змінюють бали», «живі ігри обриваються деплоєм»;
- розділ 3: нове поле має типове значення; картинки — у власному сховищі; телефон — один палець, вузький екран;
- розділ 5, пункт 5: кожен тип має запис у довідці;
- розділ 16: вибір вільних векторних мап і спосіб їх зберігання — тут.

Зразки (найближчий прецедент — 10b, `docs/superpowers/plans/2026-10-24-plan-10b-slider-audio-reveal.md`, і злитий код):
- `packages/shared/src/quiz.ts` (гілки `text`, `slider`, `sliderShare`, `proximityPartial`, коди `sort_cell`, `reveal_place`, `spare_video`), `answer.ts`, `views.ts` (`PublicSlider`, `SliderMark`);
- `packages/engine/src/check.ts` (`verdictOf`, `revealFactor`, `gradeOf`), `game.ts` (`openQuestion`, `submitAnswer`, `acceptAnswer`, `overrideBoard`, `override`, `tick`, `resumeClock`), `hold.ts` (`clockOf`, `thaw`), `blitz.ts` (`nextDeadline`), `chain.ts` (поступ гравця в стані), `buffs.ts` (`fitBlock`, `placeBlock`), `board.ts` (`nameAnswer` — дія ведучого на усній клітинці), `views.ts` (`publicQuestion`, `shownPublic`, `sliderMarks`, `withoutClip`), `restore.ts`, `restore.test.ts` (`STATE_SHAPE`, `KEYS`, `representative`);
- тести 10b: `game.slider.test.ts`, `game.reveal.test.ts`, `views.media.test.ts` (як відкрити класику, поле, перевірки «не витікає»);
- `apps/server/src/rooms/manager.ts` (`HostAction`, `host()`, `reschedule`), `socket.ts` (`host:guide-skip` — подія без даних), `manager.test.ts` (`FakeScheduler`), `socket.test.ts`, `history.test.ts` (`history: slider and revealing picture (10b)`), `profiles.test.ts`, `pwa.test.ts` (як сервер читає файли вебу);
- `apps/server/scripts/demo-quiz.ts` (`slider`, `withAudio`, `cell`), `demo-quiz.test.ts`;
- `apps/web/src/screens/{AnswerInput,SliderInput,SliderScale,PlayerScreen,StageScreen,HostScreen,SpotlightChoices,Debuffs}.tsx`, `apps/web/src/slider-scale.ts`, `reveal.ts` (хук з годинником сервера), `live/useGame.ts` (`offsetMs`);
- `apps/web/src/editor/{QuestionEditor,BoardEditor,ImageField,QuizEditor}.tsx` (`Rows`, `useImageUpload`, `sortCellNote`), `draft.ts` (`questionTypesFor`, `build`, `changeType`, `problemKey`, `problemsOf`, `cleanQuestion`), `draft-storage.ts` (`revive`, `numberOr`);
- `apps/web/src/help/{questions,powers,cells,rounds,settings}.ts`, `host-help.test.ts`;
- `apps/web/src/format.ts` (`correctText`, `answerText`), `guide-text.ts` (`TYPE_ICONS`), `i18n.ts`;
- `apps/server/e2e/full-game.e2e.ts`: `open`, `register`, `join`, `click`, `field`, `shot`, `afterSplash`, `seconds`, `expectNoSideScroll`, `snapshot`, `problems`, `socketFrames`, `scoreOf`, `toNextQuestion`, `hostDiceQuiz` (`stageUrl`), сценарій 10b `sliderAudioRevealGame` — структура.

**Рішення плану там, де специфікація мовчить (і рішення координатора):**

*«Хто я?»*
- **Дані.** `{ type: 'clues', clues: string[], accepted: string[], interval: number }`:
  - `clues` — від `LIMITS.minClues` (3) до `LIMITS.maxClues` (6), кожна 1…`LIMITS.clueText` (150) символів, порядок — від найважчої;
  - `accepted` — як у «тексті» (1…`LIMITS.maxAccepted`, до `LIMITS.answerText`), перевірка `textMatches`;
  - `interval` — ціле `LIMITS.minClueSeconds` (3)…`LIMITS.maxClueSeconds` (30), типово `LIMITS.defaultClueSeconds` (8);
  - `clues_time`: остання підказка має відкритися щонайменше за `LIMITS.clueTailSeconds` (5) с до кінця часу: `(n − 1) × interval + 5 ≤ timeLimit`;
  - `clues_video`: відео не можна (немає таймера — немає підказок за часом). Аудіо можна. Картинку (звичайну) можна. Проявлення — ні (`reveal_type`, бо тип не з `REVEAL_TYPES`).
- **Відкриття підказок.**
  - **Класика й звичайна клітинка з телефона:** перша — одразу, k-та — коли від старту таймера минуло `(k − 1) × interval` с. Час — `clockOf(state, now) − startedAt` (пауза й утримання годинник зупиняють, як і бали за швидкість). Сервер тримає кількість у стані (`Play.clues`) і відкриває наступну таймером кімнати: `nextDeadline` повертає мить наступної підказки, `tick` записує нову кількість, менеджер розсилає зрізи.
  - **Усна клітинка поля:** за часом не відкриваються. Ведучий натискає «Відкрити підказку N» (`host:clue` → `nextClue`); таймер клітинки йде як звичайно.
  - Додатковий час («+15 с», баф «Додатковий час») нових підказок не додає: до кінця основного часу всі вже відкриті (`clues_time`).
- **Бали.** `clueShare(n, k) = (n − k + 1) / n`; бали = `ціна × clueShare × множник` (наявний `answerPoints` / `boardPoints` з `accuracy = clueShare`).
  - k у класиці й на клітинці з телефона — `cluesAt(question, timeMs)` = `min(n, 1 + floor(timeMs / (interval × 1000)))`, де `timeMs` — час відповіді (на полі — до надсилання: годинник стоїть, поки ведучий приймає). Це ті самі миті, коли `tick` відкриває підказки, тож гравець платить за те, що бачив.
  - k на усній клітинці — `Play.clues` у мить оцінки ведучого (після оцінки запитання закривається, тож число не змінюється й для перевизначення на розкритті).
  - Бонус за швидкість не нараховується (`paysForTime`): спадання вже вбудоване.
  - **Правильність (рішення координатора):** правильна відповідь — `accepted: true`, `grade: 'correct'` за будь-якої k; серії, точність і досягнення бачать її правильною. Неправильна — 0, зі штрафом «мінус» — мінус ціна.
  - Ручна оцінка ведучого (перевизначення в класиці, ручна перевірка на полі, усна клітинка): «правильно» × `clueShare` за k цієї відповіді; «частково» — частка правила × `clueShare`.
  - Одна спроба: «Друга спроба» недоступна (`unfit_type` — тип не з `SIMPLE_TYPES`).
- **Де діє.** Класика; поле — звичайна клітинка (з телефона чи усна). Не діє в бліці, на бліц-клітинці, у фіналі, у дуелях (свій тип запитань), у запасних (`spare_type`, бо не простий тип). Код `clues_place`.

*Точка на мапі чи картинці*
- **Дані.** `{ type: 'pin', map: PinMap | null, aspect, target: { x, y }, fullRadius, zeroRadius }`:
  - `map` — `'world' | 'europe' | 'ukraine'`; `null` — основа є власна картинка в `imageUrl` запитання (наявне завантаження, `/uploads/...`). Код `pin_base`: `map === null` вимагає `imageUrl`, `map !== null` вимагає `imageUrl === null`;
  - `aspect` — ширина / висота основи, `LIMITS.pinMinAspect` (0,25)…`LIMITS.pinMaxAspect` (4). Для вбудованої мапи дорівнює `PIN_MAP_ASPECT[map]` (код `pin_aspect`, похибка 1e-6); для власної картинки редактор читає з `naturalWidth / naturalHeight`;
  - `target.x`, `target.y` — частки ширини й висоти основи, 0…1;
  - `fullRadius` — 0…`LIMITS.pinMaxFullRadius` (50), `zeroRadius` — (0; `LIMITS.pinMaxZeroRadius` (100)], обидва у відсотках **довшої** сторони; `zeroRadius > fullRadius` (`pin_radius`). Типово 3 і 15;
  - `pin_video`: відео не можна. Аудіо можна. Проявлення — ні.
- **Відстань.** `pinDistance(q, x, y)`: довша сторона = 1; `w = aspect ≥ 1 ? 1 : aspect`, `h = aspect ≥ 1 ? 1 / aspect : 1`; `100 × hypot((x − tx) × w, (y − ty) × h)`. Кола на картинці — справжні кола. Жодної географії: точка — у координатах картинки.
- **Частка** (`pinShare`): нескінченні або поза 0…1 — 0; `d ≤ fullRadius` — 1; `d < zeroRadius` — `(zeroRadius − d) / (zeroRadius − fullRadius)`; інакше 0.
- **Вердикт (14a, рішення координатора).** `proximityPartial` = повзунок або точка: `accepted = частка ≥ 0,5`, `grade` `'correct'` / `'partial'` / `'wrong'`; на полі частка діє незалежно від правила «частково»; штраф «мінус» лише за частку 0. Бонус за швидкість у класиці діє, як у повзунка.
- **Відповідь** — `{ type: 'pin', x, y }`, обидва 0…1.
- **Де діє.** Класика; поле — лише звичайна клітинка з телефона (точку вголос не назвеш). Не діє в бліці, на бліц-клітинці, на усній клітинці, у фіналі, у дуелях, у запасних. Код `pin_place`.
- **Телефон.** Мапа на всю ширину в рамці з пропорцією основи; дотик ставить точку, повторний дотик переставляє; дві руки — наближення до ×5, один палець на наближеній мапі — перетягування; кнопки «＋», «－», «⤢» для тих, хто тримає телефон однією рукою. «Відповісти» вимкнена, доки точки немає. Мітка точки має сталий розмір на екрані за будь-якого наближення.
- **Розкриття.** Сцена: основа, зелене коло повних балів, світліше коло нуля, правильна точка (зірка), точки гравців із нікнеймами, найближчий — підсвічений (перший у `pinMarks`). Телефон: своя точка, правильна точка й кола. Пульт бачить живі точки й правильну точку з етапу `question` (він і так бачить відповіді).
- **Поле.** Інші гравці й сцена до розкриття бачать рядок «{нікнейм}: точку поставлено» (сама точка не таємна, але до розкриття не показується).

*Бафи й дебафи (рішення координатора — «простіше»)*
- «50/50» — `unfit_type` на обох типах (варіантів немає); «ⓘ» запитання пояснює чому.
- «Друга спроба» — `unfit_type` на обох (не прості типи; у «Хто я?» відповідь одна).
- «Запитання в залі» — `unfit_type` на обох (жодної «теплової карти» залу).
- «Подвійні бали», «Щит», «Підказка ведучого», «Додатковий час», «Заміна запитання» — діють як на звичайному запитанні. Після заміни гравець відповідає на просте запасне — без підказок і без мапи.
- Нових `BuffBlock` немає: усе випливає з наявних гілок `fitBlock`. Тести це закріплюють.
- Дебафи діють. «Дзеркало» віддзеркалює мапу разом з рештою екрана; точка стає рівно під пальцем (координати рахуються у власних координатах картинки, `x` перевертається під `.is-mirror`).

*Мапи*
- **Джерело:** Natural Earth (naturalearthdata.com), версія 5.1.2, **суспільне надбання** («All versions of Natural Earth raster + vector map data … are in the public domain»). Атрибуція не обов'язкова; кожен SVG несе коментар `Made with Natural Earth. Public domain. naturalearthdata.com`, а запис довідки `question.pin` має рядок «Вбудовані мапи — Natural Earth, суспільне надбання». Це сумісно з будь-якою ліцензією проєкту.
- **Погляд на кордони:** файли «точки зору України» (`*_admin_0_countries_ukr`) з Natural Earth 5.1+. Крим — частина України; скрипт падає, якщо Сімферополь не всередині України.
- **Файли** (у `apps/web/public/maps/`, фіксовані `viewBox`, тому пропорції відомі наперед):
  - `world.svg` — `0 0 2000 1000` (`PIN_MAP_ASPECT.world = 2`), проєкція `geoNaturalEarth1`, без Антарктиди;
  - `europe.svg` — `0 0 1600 1200` (4 / 3), `geoConicConformal` (`rotate [-15, 0]`, паралелі 40° і 65°), рамка 25° з. д. — 45° с. д., 34°–71° пн. ш.;
  - `ukraine.svg` — `0 0 1600 1100` (16 / 11), `geoConicConformal` (`rotate [-31, 0]`, паралелі 45° і 51°), Україна з межами областей, сусіди сірим, Дніпро лінією.
  - Без підписів (назви видали б відповідь). Море, суходіл, кордони; координати округлені до 0,1; кожен файл ≤ 350 КБ; без `<script>` і зовнішніх посилань.
- **Опорні точки:** скрипт пише `apps/server/scripts/pin-places.ts` — частки x/y кількох міст на кожній мапі (Київ, Львів, Одеса, Харків, Сімферополь, Ужгород на «Україні»; Париж, Рим, Берлін, Мадрид, Лондон, Київ на «Європі»; Київ, Токіо, Каїр, Нью-Йорк, Ріо-де-Жанейро, Сідней на «Світі»). Їх беруть демо, тести й e2e.

*Формат стану й деплой*
- **`GAME_STATE_VERSION` 2 → 3. Підняття неминуче.** На усній клітинці підказки відкриває ведучий — це подія, яку треба пам'ятати між зрізами й після перезапуску. А в класиці зрізи не мають `now`: щоб телефон отримав другу підказку саме в її мить і не отримав її раніше, кількість відкритих підказок мусить лежати в стані й змінюватися через `tick`. Альтернатива без нового ключа (передати `now` у кожен зріз і змусити менеджер розсилати зрізи без зміни стану) значно ширша й не розв'язує усної клітинки.
  - Зміна адитивна: лише необов'язковий `Play.clues?: number`. `KEYS[3]` = `KEYS[2]` з `Play: 'answers,blitz,board,buffs,chain,clues,extraMs,final,overtime,question,roundIndex,sort'`; `KEYS[1]` і `KEYS[2]` не змінюються.
  - Решта нових полів (`Question`, `Answer`) у `STATE_SHAPE` не відстежуються.
  - Наслідок: пуш 10c перерве ігри, що йдуть у мить розгортання (збережені кімнати версії 2 не відновлюються — так задумано в 9b). **За правилом 14a перед пушем перевірити, що в таблиці `live_room` немає рядків** (`SELECT count(*) FROM live_room;` у базі Render), і пушити лише тоді; інакше чекати й перевірити пізніше.
- **Міграцій немає.** Запитання живуть у jsonb `quiz.rounds`, відповіді — у jsonb `answer.payload`, `accepted` — наявна колонка.

*Решта*
- **Демо.** `demo-quiz.ts` отримує помічники `clues(...)` і `pin(...)`; у демо `demo`: «Хто я?» (Тарас Шевченко) і «Де на мапі Львів?» у класичному раунді `r-x3`, точка «Де Одеса?» на клітинці поля з телефона, «Хто я?» (Леся Українка) на усній клітинці. Уже засіяні вікторини не змінюються. Демо у вебі (`apps/web/src/demo-quiz.ts`, «вісім типів») не змінюється.
- **Історія.** Відповіді — `{ type: 'clues', value }` і `{ type: 'pin', x, y }`; `answerText` для точки — «Точка за 4,2 % від правильної»; запитання `pin` в історії показує мініатюру мапи з правильною точкою й колами.
- **Чого не робимо:** «теплову карту» залу на точці; відстань у кілометрах (географію); обрізання власної картинки; наближення мапи на сцені; ранні підказки від ведучого в класиці; підказки-картинки; власні мапи-SVG від ведучого.

## Глобальні обмеження

- Рушій чистий: жодного годинника, усе від `now`. `paceFactor` і `cluesAt` беруть час аргументом.
- **Анти-ціль «відповідь раніше розкриття».**
  - `PublicQuestion.clues.shown` — лише відкриті підказки; прийнятних написань там немає.
  - `PublicQuestion.pin` — лише `map` і `aspect`; немає `target`, `fullRadius`, `zeroRadius`.
  - `pinMarks` на сцені — лише на `reveal`.
  - Тести задачі 3 закріплюють це через `JSON.stringify(view)`, а e2e — через кадри сокета телефона (`socketFrames`).
- **Старі вікторини й бали не змінюються.** Наявні тести повзунка, картинки, що проявляється, «числа», бліцу, фіналу, серій і відео лишаються зеленими без змін (перейменування `revealFactor` → `paceFactor` не міняє чисел).
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`, тексти довідки — лише в `apps/web/src/help/*.ts`.
- Телефон 375 px — без горизонтальної прокрутки; точка ставиться одним пальцем, наближення є й кнопками.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2`. Якщо PGlite падає з браком пам'яті, запускати окремо `pnpm vitest run --maxWorkers=2 packages`, `pnpm vitest run --maxWorkers=1 apps/server`, `pnpm vitest run --maxWorkers=2 apps/web`.
- Наскрізні тести: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts`. Кадри лягають в `apps/server/e2e/artifacts/shots`, префікс кадрів 10c — `p10c-`.
- Після останньої задачі й фінальної рецензії гілку зливають у `main`. **Пуш — лише після перевірки `live_room` (див. «Формат стану й деплой»).**

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/quiz.ts`, `quiz.test.ts`, `answer.ts`, `game.ts` | `clues`, `pin`, ліміти, мапи, чисті функції, коди, `clues_done` | 1 |
| `apps/web/src/{format.ts,guide-text.ts,i18n.ts}`, `apps/web/src/help/questions.ts`, `apps/web/src/editor/draft.ts`, `apps/web/src/screens/AnswerInput.tsx`, `apps/web/src/editor/QuestionEditor.tsx` + `format.test.ts`, `draft.test.ts` | прохід typecheck: назви типів, тексти, `correctText`/`answerText`, `build`/`changeType`/`questionTypesFor`, записи довідки, тимчасові гілки | 1 |
| `packages/engine/src/{check.ts,clues.ts(новий),game.ts,blitz.ts,restore.ts,index.ts}`, `testing/fixtures.ts`, нові `game.clues.test.ts`, `game.pin.test.ts`, `check.test.ts`, `restore.test.ts` | бали, підказки в стані, `nextClue`, `paceFactor`, версія 3 | 2 |
| `packages/shared/src/views.ts`, `packages/engine/src/views.ts`, новий `views.clues-pin.test.ts`, фабрики зрізів у тестах вебу | `PublicClues`, `PublicPin`, `pinMarks`, `HostResponse.clue` | 3 |
| `packages/shared/src/events.ts`, `apps/server/src/{rooms/manager.ts,socket.ts}`, `manager.test.ts`, `socket.test.ts` | `host:clue`, підказки за таймером кімнати | 4 |
| `apps/web/scripts/build-maps.mjs` (новий), `apps/web/package.json`, `apps/web/public/maps/{world,europe,ukraine}.svg` (нові), `apps/server/scripts/pin-places.ts` (новий), `apps/server/src/maps.test.ts` (новий), `apps/web/src/pin-maps.ts` (новий) + тест, `i18n.ts` | вбудовані мапи | 5 |
| `apps/server/src/history.test.ts`, `profiles.test.ts` (або `achievements.test.ts`), `apps/server/scripts/{demo-quiz.ts,demo-quiz.test.ts}` | історія, профіль, досягнення, демо | 6 |
| `apps/web/src/pin-zoom.ts` (новий), `apps/web/src/screens/{PinBoard,PinFrame,PinInput,CluesList}.tsx` (нові), `AnswerInput.tsx`, `PlayerScreen.tsx`, `SpotlightChoices.tsx`, `i18n.ts`, `styles.css` + тести | телефон | 7 |
| `apps/web/src/screens/{StageScreen,HostScreen}.tsx`, `apps/web/src/pages/GameHistory.tsx`, `i18n.ts`, `styles.css` + тести | сцена, пульт, історія | 8 |
| `apps/web/src/editor/{QuestionEditor,BoardEditor,PinEditor(новий)}.tsx`, `draft.ts`, `draft-storage.ts`, `i18n.ts`, `styles.css` + тести | редактор | 9 |
| `apps/web/src/help/{questions,powers,cells,rounds,settings}.ts`, `host-help.test.ts`, `HostScreen.tsx` | довідка й «ⓘ» | 10 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 10c з кадрами `p10c-` | 11 |

## Порядок збирання

- 1 → 2 → 3. Задача 4 — після 3. Задача 5 — після 1 (від рушія не залежить). Задача 6 — після 3 і 5 (опорні точки).
- 7 — після 3 і 5. 8 — після 4 і 7 (`PinBoard`, `CluesList`, подія `host:clue`). 9 — після 5 і 7 (`PinFrame`, `PinBoard`).
- 10 — після 8 і 9. 11 — остання.
- **Навмисні зміни наявних очікувань** (лише такі):
  - `restore.test.ts`: `GAME_STATE_VERSION` 3, новий `KEYS[3]`; `KEYS[1]`, `KEYS[2]` без змін;
  - фабрики `PublicQuestion` / `StageView` / `HostView` / `HostResponse` у тестах вебу отримують `clues: null`, `pin: null`, `pinMarks: null`, `clue: null`;
  - тест у `quiz.test.ts`, що звіряє `QUESTION_TYPES` буквально, отримує `'clues'`, `'pin'`;
  - `questionTypesFor('blitz')` і `questionTypesFor('final')` більше не містять `'clues'`, `'pin'` (тест у `draft.test.ts`, якщо звіряє перелік буквально);
  - якщо тест порівнює `SavedRoom` зі `stateVersion: 2` буквально — замінити на `GAME_STATE_VERSION`.
  Якщо падає інше, рецензент розбирає причину, а не правку очікування.

## На що дивитися рецензентові

1. **Нічого не витікає.**
   - Ще не відкриті підказки й написання не потрапляють на телефон і сцену; правильна точка й радіуси — до розкриття.
   - Тести: задача 3, `hidden clues never reach phones or the stage`, `pin target and circles never reach phones or the stage before the reveal`; задача 11 — кадри сокета.
2. **Бали.**
   - «Хто я?»: `(n − k + 1) / n`, правильна завжди правильна, без бонусу швидкості, одна спроба; усна клітинка — за підказкою, відкритою ведучим.
   - Точка: коло повних — 100 %, далі лінійно, половина — «правильно»; поле не залежить від «частково»; пропорція картинки враховується.
   - Тести: задача 2.
3. **Час підказок.** Пауза й утримання не відкривають підказок; після продовження наступна відкривається через решту інтервалу; на усній клітинці — лише кнопкою. Тести: задача 2 (`pause freezes the clues`, `on a voice cell clues do not open by time`), задача 4 (`a clue opens on time and the room pushes it`).
4. **Старе не змінилося.** Тести повзунка, картинки, що проявляється, і поля — без змін.
5. **Формат стану.** `GAME_STATE_VERSION` = 3, `KEYS[3]` з `Play.clues`; представник із підказками проходить JSON. Пуш — після перевірки `live_room`.
6. **Мапи.** Ліцензія Natural Earth (суспільне надбання) записана в SVG і довідці; Крим — Україна; пропорції `viewBox` = `PIN_MAP_ASPECT`; без скриптів. Тест: задача 5.
7. **Довідка.** Записи `question.clues`, `question.pin` правдиві щодо рушія й чисел з `LIMITS`; бафи, клітинки й раунди згадують нові обмеження. Тести: задача 10.

---

### Задача 1. Shared: типи `clues` і `pin`, відповіді, ліміти, мапи, чисті функції, коди; прохід typecheck у вебі

**Files:**
- Modify: `packages/shared/src/quiz.ts`, `packages/shared/src/answer.ts`, `packages/shared/src/game.ts`
- Test: `packages/shared/src/quiz.test.ts`
- Modify (прохід typecheck): `apps/web/src/format.ts`, `apps/web/src/guide-text.ts`, `apps/web/src/i18n.ts`, `apps/web/src/help/questions.ts`, `apps/web/src/editor/draft.ts`, `apps/web/src/screens/AnswerInput.tsx`, `apps/web/src/editor/QuestionEditor.tsx`
- Test: `apps/web/src/format.test.ts`, `apps/web/src/editor/draft.test.ts`

**Interfaces:**
- Produces (`quiz.ts`):
  ```ts
  // У LIMITS:
  /** «Хто я?»: підказок, символів у підказці, інтервал між підказками (с). */
  minClues: 3,
  maxClues: 6,
  clueText: 150,
  minClueSeconds: 3,
  maxClueSeconds: 30,
  defaultClueSeconds: 8,
  /** Остання підказка відкривається щонайменше за стільки секунд до кінця часу. */
  clueTailSeconds: 5,
  /** Точка: радіуси у відсотках довшої сторони основи; пропорція основи (ширина / висота). */
  pinMaxFullRadius: 50,
  pinMaxZeroRadius: 100,
  defaultPinFull: 3,
  defaultPinZero: 15,
  pinMinAspect: 0.25,
  pinMaxAspect: 4,

  /** Вбудовані мапи для точки (10c); SVG у apps/web/public/maps. */
  export const PIN_MAPS = ['world', 'europe', 'ukraine'] as const;
  export type PinMap = (typeof PIN_MAPS)[number];
  /** Пропорції вбудованих мап = viewBox їхніх SVG (2000×1000, 1600×1200, 1600×1100). */
  export const PIN_MAP_ASPECT: Record<PinMap, number> = { world: 2, europe: 4 / 3, ukraine: 16 / 11 };

  const share01 = z.number().finite().min(0).max(1);

  // Гілки questionSchema:
  z.object({
    ...base,
    type: z.literal('clues'),
    /** Від найважчої до найлегшої; відкриваються по одній. */
    clues: z.array(z.string().trim().min(1).max(LIMITS.clueText).refine(isStorable, UNSTORABLE)).min(LIMITS.minClues).max(LIMITS.maxClues),
    accepted: /* те саме, що в 'text' — винести в спільну константу `spellings` */,
    /** Секунд між підказками (класика й клітинка з телефона; на усній клітинці відкриває ведучий). */
    interval: z.number().int().min(LIMITS.minClueSeconds).max(LIMITS.maxClueSeconds),
  }),
  z.object({
    ...base,
    type: z.literal('pin'),
    /** Вбудована мапа; null — основа є власна картинка imageUrl. */
    map: z.enum(PIN_MAPS).nullable(),
    /** Ширина / висота основи. */
    aspect: z.number().finite().min(LIMITS.pinMinAspect).max(LIMITS.pinMaxAspect),
    /** Правильна точка: частки ширини й висоти основи. */
    target: z.object({ x: share01, y: share01 }),
    /** Радіус повних балів і радіус нуля, % довшої сторони. */
    fullRadius: z.number().finite().min(0).max(LIMITS.pinMaxFullRadius),
    zeroRadius: z.number().finite().positive().max(LIMITS.pinMaxZeroRadius),
  }),

  export const QUESTION_TYPES = [..., 'slider', 'clues', 'pin'] as const;
  // SIMPLE_TYPES і REVEAL_TYPES — без змін.

  /** Скільки підказок відкрито через elapsedMs від старту таймера: 1 + ⌊elapsed / interval⌋, не більше n (від’ємне — 1). */
  export function cluesAt(question: Pick<Extract<Question, { type: 'clues' }>, 'clues' | 'interval'>, elapsedMs: number): number;
  /** Частка ціни за відповідь після opened-ї з total підказок: (total − opened + 1) / total; opened притискається до 1…total. */
  export function clueShare(total: number, opened: number): number;
  /** Відстань від правильної точки у % довшої сторони основи (пропорція враховується). */
  export function pinDistance(question: Pick<Extract<Question, { type: 'pin' }>, 'aspect' | 'target'>, x: number, y: number): number;
  /** Частка ціни за точку: коло повних — 1, до кола нуля — лінійно, далі й поза 0…1 — 0. */
  export function pinShare(question: Extract<Question, { type: 'pin' }>, x: number, y: number): number;
  // proximityPartial: question.type === 'slider' || question.type === 'pin' (коментар оновити: «повзунок і точка»).
  ```
  - `superRefine` запитання додає коди:
    - `clues_time` — `(clues.length − 1) × interval + LIMITS.clueTailSeconds > timeLimit`;
    - `clues_video` — `clues` з відео;
    - `pin_base` — `map === null && imageUrl === null` або `map !== null && imageUrl !== null`;
    - `pin_aspect` — `map !== null && Math.abs(aspect − PIN_MAP_ASPECT[map]) > 1e-6`;
    - `pin_radius` — `zeroRadius ≤ fullRadius`;
    - `pin_video` — `pin` з відео.
  - `superRefine` вікторини (поруч із `reveal_place`, той самий вигляд):
    - `clues_place` — `clues` у бліці, фіналі або на бліц-клітинці поля (`cell.kind !== 'normal'`);
    - `pin_place` — `pin` у бліці, фіналі або на клітинці, що не є звичайною з телефона (`cell.kind !== 'normal' || cellAnswerMode(round, cell) !== 'phone'`).
    - Запасні: наявний `spare_type` уже відкидає обидва типи (не з `SIMPLE_TYPES`) — лише тест.
- Produces (`answer.ts`):
  ```ts
  z.object({ type: z.literal('clues'), value: z.string().max(LIMITS.answerText).refine(isStorable, UNSTORABLE) }),
  z.object({ type: z.literal('pin'), x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }),
  ```
- Produces (`game.ts`): `ErrorCode` + `| 'clues_done'` (коментар: «усі підказки «Хто я?» уже відкрито (10c)»).
- Веб (прохід typecheck):
  - `i18n.ts`:
    - `type_clues: 'Хто я?'`, `typeShort_clues: 'хто я?'`, `typeHow_clues: 'Підказки відкриваються по одній — відповідай, щойно впізнаєш. Що раніше, то більше балів; спроба одна.'`;
    - `type_pin: 'Точка на мапі'`, `typeShort_pin: 'точка'`, `typeHow_pin: 'Торкнися мапи, щоб поставити точку, зведи два пальці, щоб наблизити, і натисни «Відповісти».'`;
    - `err_clues_done: 'Усі підказки вже відкрито.'`;
    - `pinCorrect_world: 'Точка на мапі «Світ»'`, `pinCorrect_europe: 'Точка на мапі «Європа»'`, `pinCorrect_ukraine: 'Точка на мапі «Україна»'`, `pinCorrectImage: 'Точка на картинці'`, `pinAnswerAt: 'Точка за {distance} % від правильної'`, `pinAnswerBare: 'Точка на мапі'`;
  - `guide-text.ts`: `TYPE_ICONS.clues = '…?'`, `TYPE_ICONS.pin = '⌖'`;
  - `format.ts`:
    - `correctText`: `clues` → `accepted[0]`; `pin` → `t(map === null ? 'pinCorrectImage' : `pinCorrect_${map}`)`;
    - `answerText`: `clues` → `value`; `pin` → з запитанням `pin` — `t('pinAnswerAt', { distance })`, де `distance` — `pinDistance` з однією цифрою після коми через `uk-UA` (`4,2`); без запитання — `t('pinAnswerBare')`;
  - `help/questions.ts`: повні записи `clues` і `pin` (тексти — у задачі 10, розділ «Interfaces»; тут вписати їх одразу повністю, задача 10 лише звіряє й доповнює пов'язані записи);
  - `draft.ts`:
    - `questionTypesFor`: бліц — без `chain`, `clues`, `pin`; поле — без `chain`; фінал — без `clues`, `pin`; класика — усі. Оновити коментар;
    - `build('clues')` → `{ ...common, video: null, type, clues: ['', '', ''], accepted: [''], interval: LIMITS.defaultClueSeconds }` (типовий час 30 с вміщує 3 підказки по 8 с);
    - `build('pin')` → `{ ...common, video: null, imageUrl: null, type, map: 'world', aspect: PIN_MAP_ASPECT.world, target: { x: 0.5, y: 0.5 }, fullRadius: LIMITS.defaultPinFull, zeroRadius: LIMITS.defaultPinZero }`;
    - `changeType`: у `pin` картинка запитання прибирається (основа — мапа «Світ»); з `pin` з власною картинкою картинка лишається звичайною картинкою запитання; `reveal` прибирається для обох (не `REVEAL_TYPES`); `audio` зберігається;
    - `duplicateQuestion` — копія з новим id (масиви й `target` копіюються, не діляться);
  - `AnswerInput.tsx`: `case 'clues': case 'pin': return null; // задача 7`;
  - `QuestionEditor.tsx` (`Body`): `case 'clues': case 'pin': return null; // задача 9`.

- [ ] **Step 1: Write the failing tests** у `packages/shared/src/quiz.test.ts`:
  ```ts
  describe('clues (10c)', () => {
    const cluesQ = { id: 'c1', type: 'clues', text: 'Хто я?', imageUrl: null, video: null, timeLimit: 30, points: 1000,
      clues: ['Я народився 1814 року.', 'Я був кріпаком.', 'Я художник.', 'Я написав «Кобзар».', 'Я на купюрі 100 гривень.'],
      accepted: ['Шевченко', 'Тарас Шевченко'], interval: 5 } as const;
    it('is a question type but not a simple or reveal type', () => {
      expect(QUESTION_TYPES).toContain('clues');
      expect(SIMPLE_TYPES).not.toContain('clues');
      expect(valid(questionSchema, cluesQ)).toBe(true);
    });
    it('checks the clue count, length, interval and that the last clue opens 5 s before the end', () => {
      expect(valid(questionSchema, { ...cluesQ, clues: cluesQ.clues.slice(0, 2) })).toBe(false);
      expect(valid(questionSchema, { ...cluesQ, clues: [...cluesQ.clues, 'a', 'b'] })).toBe(false); // 7 > 6
      expect(valid(questionSchema, { ...cluesQ, clues: ['x'.repeat(LIMITS.clueText + 1), 'b', 'c'] })).toBe(false);
      expect(valid(questionSchema, { ...cluesQ, interval: 2 })).toBe(false);
      expect(issues({ ...cluesQ, timeLimit: 24 })).toContain('clues_time'); // 4 × 5 + 5 = 25 > 24
      expect(issues({ ...cluesQ, timeLimit: 25 })).not.toContain('clues_time');
      expect(issues({ ...cluesQ, video: { id: 'dQw4w9WgXcQ', start: 0 } })).toContain('clues_video');
    });
    it('cluesAt and clueShare', () => {
      expect(cluesAt(cluesQ, 0)).toBe(1);
      expect(cluesAt(cluesQ, 4999)).toBe(1);
      expect(cluesAt(cluesQ, 5000)).toBe(2);
      expect(cluesAt(cluesQ, 60_000)).toBe(5);
      expect(cluesAt(cluesQ, -100)).toBe(1);
      expect([1, 2, 3, 4, 5].map((k) => clueShare(5, k))).toEqual([1, 0.8, 0.6, 0.4, 0.2]);
      expect(clueShare(5, 9)).toBe(0.2);
    });
  });

  describe('pin (10c)', () => {
    const pinQ = { id: 'p1', type: 'pin', text: 'Де Київ?', imageUrl: null, video: null, timeLimit: 30, points: 1000,
      map: 'world', aspect: 2, target: { x: 0.5, y: 0.5 }, fullRadius: 3, zeroRadius: 15 } as const;
    const img = `/uploads/${'b'.repeat(32)}.png`;
    it('a pin is a question type, not simple; a map or an own picture as the base', () => {
      expect(QUESTION_TYPES).toContain('pin');
      expect(SIMPLE_TYPES).not.toContain('pin');
      expect(valid(questionSchema, pinQ)).toBe(true);
      expect(valid(questionSchema, { ...pinQ, map: null, imageUrl: img, aspect: 0.75 })).toBe(true);
      expect(issues({ ...pinQ, map: null })).toContain('pin_base');
      expect(issues({ ...pinQ, imageUrl: img })).toContain('pin_base');
      expect(issues({ ...pinQ, aspect: 1.5 })).toContain('pin_aspect');
      expect(issues({ ...pinQ, zeroRadius: 3 })).toContain('pin_radius');
      expect(issues({ ...pinQ, video: { id: 'dQw4w9WgXcQ', start: 0 } })).toContain('pin_video');
      expect(valid(questionSchema, { ...pinQ, target: { x: 1.2, y: 0.5 } })).toBe(false);
      expect(valid(questionSchema, { ...pinQ, map: null, imageUrl: img, aspect: 5 })).toBe(false);
    });
    it('pinDistance measures in % of the longer side and respects the aspect', () => {
      expect(pinDistance(pinQ, 0.52, 0.5)).toBeCloseTo(2);
      expect(pinDistance(pinQ, 0.5, 0.68)).toBeCloseTo(9); // висота — половина ширини
      expect(pinDistance({ ...pinQ, aspect: 0.5 }, 0.68, 0.5)).toBeCloseTo(9); // тепер довша — висота
    });
    it('pinShare: full inside the inner circle, linear to the outer, nothing outside', () => {
      expect(pinShare(pinQ, 0.52, 0.5)).toBe(1);
      expect(pinShare(pinQ, 0.59, 0.5)).toBeCloseTo(0.5);
      expect(pinShare(pinQ, 0.62, 0.5)).toBeCloseTo(0.25);
      expect(pinShare(pinQ, 0.66, 0.5)).toBe(0);
      expect(pinShare(pinQ, Number.NaN, 0.5)).toBe(0);
    });
    it('proximityPartial: slider and pin only', () => {
      expect(proximityPartial(pinQ)).toBe(true);
      // clues, single, text — false
    });
  });

  describe('where clues and pins live (10c)', () => {
    // clues у класиці, на звичайній клітинці з телефона й на усній — OK; у бліці, фіналі, на бліц-клітинці → 'clues_place'
    // pin у класиці й на звичайній клітинці з телефона — OK; у бліці, фіналі, на бліц-клітинці й на усній клітинці → 'pin_place'
    // quiz.spares з clues або pin → 'spare_type'
  });
  ```
  Тести `answerSchema`: `{ type: 'clues', value: 'Шевченко' }` проходить; `{ type: 'pin', x: 0.3, y: 1 }` проходить, `x: -0.1` і `y: Infinity` — ні. Повні тіла `where clues and pins live` писати за зразком тестів `reveal_place` 10b. Помічники `valid`, `issues` — наявні.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared` → FAIL (немає експортів).
- [ ] **Step 3: Implement** схему, функції й коди за інтерфейсом:
  - спільну константу написань `spellings` винести з гілки `text` і вжити в обох;
  - `pinShare` і `pinDistance` порівнюють з `EPS = 1e-9`, як `sliderShare`;
  - `cluesAt` з нескінченним `elapsedMs` повертає n (додатне) або 1 (від'ємне/NaN).
- [ ] **Step 4: Прохід typecheck у вебі.** Виконати `pnpm typecheck` і закрити кожну помилку змінами з інтерфейсу. Тести:
  - `format.test.ts`: `correctText` для `clues` → `'Шевченко'`; для `pin` з мапою «Україна» → `'Точка на мапі «Україна»'`, з власною картинкою → `'Точка на картинці'`; `answerText({ type: 'pin', x: 0.52, y: 0.5 }, pinQ)` → `'Точка за 2,0 % від правильної'`; `answerText({ type: 'clues', value: 'Шевченко' }, cluesQ)` → `'Шевченко'`;
  - `draft.test.ts`: `newQuestion('clues')` і `newQuestion('pin')` проходять `questionSchema` (після заповнення текстів); `questionTypesFor('blitz')` не має `clues`/`pin`, `questionTypesFor('board')` має обидва, `questionTypesFor('final')` — жодного; `changeType` single з картинкою → pin: `imageUrl === null`, `map === 'world'`.
- [ ] **Step 5: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 6: Commit**
  ```bash
  git add packages/shared apps/web/src
  git commit -m "feat(shared): «Who am I?» clues and pin-on-a-map question types, answers, limits, built-in map aspects, pure helpers (clues at a time, clue share, pin distance and share), placement rules"
  ```

### Задача 2. Рушій: бали «Хто я?» і точки, підказки в стані, відкриття за часом і ведучим, `GAME_STATE_VERSION` 3

**Files:**
- Create: `packages/engine/src/clues.ts`
- Modify: `packages/engine/src/check.ts`, `packages/engine/src/game.ts`, `packages/engine/src/blitz.ts`, `packages/engine/src/restore.ts`, `packages/engine/src/index.ts` (експорт `nextClue`, `cluesOpen`, `paceFactor`, якщо файл перелічує експорти), `packages/engine/src/testing/fixtures.ts`
- Test: нові `packages/engine/src/game.clues.test.ts`, `packages/engine/src/game.pin.test.ts`; `check.test.ts`, `restore.test.ts`

**Interfaces:**
- Produces (`check.ts`):
  ```ts
  // checkAnswer:
  //   clues & answer.type 'clues' → full(textMatches(question.accepted, answer.value))
  //   pin & answer.type 'pin' → share = pinShare(question, x, y); share ≤ 0 → REJECTED; { accepted: share ≥ PROXIMITY_CORRECT_SHARE − EPSILON, accuracy: share }

  /** Чи тип платить за час часткою ціни (без бонусу швидкості): картинка, що проявляється, і «Хто я?». */
  export function paysForTime(question: Question): boolean;
  /**
   * Множник ціни за темп: картинка, що проявляється, — revealShare від повного вікна; «Хто я?» — clueShare(n, opened ?? cluesAt(question, timeMs));
   * інакше 1. Замінює revealFactor (перейменування, числа ті самі).
   */
  export function paceFactor(question: Question, timeMs: number, opened?: number): number;
  /** opened — для усної клітинки (підказки відкрив ведучий). */
  export function verdictOf(question: Question, answer: Answer, timeMs: number, opened?: number): Verdict;
  ```
  `verdictOf` для `pin` іде гілкою `proximityPartial` (як повзунок), для `clues` — гілкою «решта» з `paceFactor`.
- Produces (`clues.ts`):
  ```ts
  /** Підказки відкриває ведучий: звичайна усна клітинка поля. */
  export function cluesByHost(play: Play): boolean;
  /** Скільки підказок відкрито в play; сирий стан без поля — 1. */
  export function cluesOpen(play: Play): number;
  /**
   * Мить (час сервера), коли відкриється наступна підказка: startedAt + cluesOpen × interval × 1000.
   * null — не етап question, не «Хто я?» (на полі із заміною — те, що бачать усі), ведучий відкриває сам, усі відкриті, пауза, утримання або startedAt === null.
   */
  export function nextClueAt(state: GameState): number | null;
  /** Відкриває підказки, чий час настав (за clockOf − startedAt); той самий об’єкт, якщо нічого не змінилось. */
  export function openDueClues(state: GameState, now: number): GameState;
  /**
   * Ведучий відкриває наступну підказку на усній клітинці.
   * Помилки: wrong_phase — не етап question, поточне запитання не «Хто я?» або клітинка не усна; paused; not_started — ще йде заставка; clues_done — усі відкриті.
   */
  export function nextClue(state: GameState, now: number): Result;
  /** На якій підказці дано відповідь: усна клітинка — cluesOpen(play); інакше cluesAt(question, timeMs). Для інших типів — null. */
  export function cluesAnswered(play: Play, question: Question, timeMs: number): number | null;
  ```
- Changes (`game.ts`):
  - `Play` + `/** «Хто я?»: скільки підказок відкрито (від 1); лише в такому запитанні (10c). */ clues?: number;`
  - `openQuestion`: для `question.type === 'clues'` — `clues: 1` у новому `Play`.
  - `tick`: після перевірки `running.heldAt !== null` і перед закриттями — `const opened = openDueClues(running, now)`; далі логіка працює з `opened`. Без змін — той самий об'єкт (менеджер не комітить зайвого).
  - `submitAnswer` (класика): `verdictOf(asked, answer, timeMs)`; бонус швидкості — `… && !paysForTime(asked)` замість `asked.reveal == null`.
  - `acceptAnswer` (поле, автоперевірка): `paceFactor(asked, timeMs)` замість `revealFactor(asked, timeMs)` (k — за часом до надсилання).
  - `overrideBoard`: `paceFactor(questionFor(state, play, playerId), timeMs, cluesByHost(play) ? cluesOpen(play) : undefined)`.
  - `override` (класика): `paceFactor(asked, record.timeMs)`; бонус швидкості — `!paysForTime(asked)`.
  - `grep -n "revealFactor\|reveal == null" packages/engine/src` — після задачі жодного входження поза `paceFactor`.
- Changes (`blitz.ts`, `nextDeadline`): до переліку `times` додати `nextClueAt(state)`.
- Changes (`restore.ts`): `GAME_STATE_VERSION = 3`; коментар `3 — 10c: Play.clues (скільки підказок «Хто я?» відкрито).`
- Changes (буфи): коду не потрібно — «50/50» (не single/multi), «Друга спроба» й «Запитання в залі» (не `SIMPLE_TYPES`) уже дають `unfit_type`. Лише тести.
- Produces (`testing/fixtures.ts`):
  ```ts
  export const clues = { ...base, id: 'q11', type: 'clues', text: 'Хто я?', timeLimit: 30,
    clues: ['Я народився 1814 року.', 'Я був кріпаком.', 'Я художник.', 'Я написав «Кобзар».', 'Я на купюрі 100 гривень.'],
    accepted: ['Шевченко', 'Тарас Шевченко'], interval: 5 } satisfies Question;
  export const pin = { ...base, id: 'q12', type: 'pin', text: 'Де Київ?', timeLimit: 30,
    map: 'world', aspect: 2, target: { x: 0.5, y: 0.5 }, fullRadius: 3, zeroRadius: 15 } satisfies Question;
  ```

- [ ] **Step 1: Write the failing tests.**
  - `check.test.ts`:
    - `checkAnswer(clues, { type: 'clues', value: ' тарас шевченко ' })` → FULL; `'Франко'` → REJECTED; `{ type: 'text' }` → REJECTED;
    - `checkAnswer(pin, { type: 'pin', x: 0.59, y: 0.5 })` → `accepted: true`, `accuracy ≈ 0.5`; `0.62` → `accepted: false`, `≈ 0.25`;
    - `verdictOf(clues, right, 5000)` → `accuracy 0.8`, `accepted: true`, `grade: 'correct'`; `verdictOf(clues, right, 0, 4)` → `0.4`; неправильна → `{ false, 0, 'wrong' }`;
    - `verdictOf(pin, 0.62)` → `grade: 'partial'`, `accepted: false`;
    - `paysForTime`: `clues` і `withReveal(text)` — true; `pin`, `slider`, `text` — false.
  - `game.clues.test.ts`. Класика `speedBonus: true`, `[clues]` (5 підказок, 5 с, 30 с, 1000), Анна p1, Богдан p2, `startRound(..., 0)` (старт таймера в 0, як у `game.reveal.test.ts`):
    ```ts
    it('the first clue is open at once and the rest open by the interval', () => {
      const s = openClassic([clues]);
      expect(currentPlay(s).clues).toBe(1);
      expect(tick(s, 4999)).toBe(s);
      expect(currentPlay(tick(s, 5000)).clues).toBe(2);
      expect(currentPlay(tick(s, 12_000)).clues).toBe(3); // кілька підказок за один тік
    });
    ```
    Інші тести файлу:
    - `nextDeadline waits for the next clue, then for the end` (`nextDeadline(s, 0)` = 5000; після `tick(s, 20_000)` — 30 000);
    - `the answer after the k-th of n clues pays price × (n − k + 1) / n, without a speed bonus` (у мить 1000 → 1000; 5000 → 800; 12 000 → 600; 21 000 → 200; усі `accepted: true`, `grade: 'correct'`);
    - `a wrong answer pays 0, or minus with the penalty, at any clue`;
    - `one answer only` (друга відповідь — `already_answered`);
    - `a correct answer at the last clue keeps the streak` (правила `streak: { length: 2, … }`, два запитання `clues`, обидві відповіді на 5-й підказці → серія 2);
    - `the multiplier applies` (×2, відповідь у 5000 → 1600);
    - `pause freezes the clues: after resume the next clue opens the rest of the interval later` (пауза в 3000, продовження в 10 000 → `nextClueAt` = 12 000; `tick(…, 11_999)` — 1 підказка; `12_000` — 2);
    - `a host override on the reveal keeps the clue decay` (відповідь «Франко» у 5000 → `override(..., 'correct')` → 800);
    - `extra time opens no new clues` (баф `time`, відповідь у 40 000 → 200, `clues` = 5);
    - `50/50, a second try and the audience are not available; double works` (`buffBlock` → `'unfit_type'` для `fifty`, `retry`, `audience`; `double` → `null`; відповідь з `double` у 1000 → 2000);
    - **поле, клітинка з телефона** (`boardRound` з клітинкою `clues`, вибравший p1): `the clock stops while the host accepts; the clue is the one at submission` (надсилання в 6000 → утримання; `tick(…, 15_000)` не відкриває нових підказок; `acceptAnswer` у 20 000 → 800);
    - `after repick the clues continue from where the clock stopped` (надсилання в 6000, `repick` у 9000 → `nextClueAt` = 13 000);
    - **поле, усна клітинка** (`answerMode: 'voice'`): `clues do not open by time on a voice cell` (`tick(…, 25_000)` — 1 підказка; `nextDeadline` = кінець часу);
    - `the host opens the next clue; the verdict pays by the open clue` (`nextClue` ×2 → 3; `override(s, 'p1', 'correct', now)` на етапі `question` → 600, запитання закрите);
    - `nextClue errors` (після 5-ї — `clues_done`; на клітинці з телефона й у класиці — `wrong_phase`; на паузі — `paused`; на `reveal` — `wrong_phase`);
    - `a re-grade on the reveal keeps the clue number` (після 600 → `override(…, 'wrong')` → 0 → `'correct'` → 600).
    - `a suspended room resumes the clues where they stopped` (`suspend(s, 7000)` → `resume(…, 100_000)` → `cluesOpen` 2, `nextClueAt` = 103 000).
  - `game.pin.test.ts`. Класика `speedBonus: false`, `[pin]` (мапа «Світ», `aspect 2`):
    - `full inside the inner circle, half on the middle, nothing outside` (0.52 → 1000 `correct`; 0.59 → 500 `correct`, `accepted: true`; 0.5/0.68 → 500 — пропорція; 0.62 → 250 `partial`, `accepted: false`; 0.66 → 0 `wrong`);
    - `the minus penalty only for zero` (0.66 з `minus` → −1000; 0.62 з `minus` → 250);
    - `the speed bonus applies like a slider` (`speedBonus: true`, 0.52 у мить 15 000 з 30 с → 750);
    - `on a board phone cell a pin gets its share without the partial rule` (`rules.partial: null`, 0.59 → 500 `accepted: true`);
    - `50/50, a second try and the audience are not available` (`unfit_type` ×3);
    - `a wrong answer type is a type_mismatch`.
  - `restore.test.ts`:
    - `KEYS[3]` = `KEYS[2]` з `Play` `answers,blitz,board,buffs,chain,clues,extraMs,final,overtime,question,roundIndex,sort`; `STATE_SHAPE.Play` + `'clues'`;
    - у `representative()` — класика з `[clues, pin]` і відповіддю на `clues`; наявні тести кругообігу й «жодних ключів понад закріплені» проходять.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсом. `openDueClues` використовує `clockOf(state, now) − state.startedAt` і `cluesAt`; поза `question`, на паузі, з утриманням, на усній клітинці й до старту (`now < startedAt`) нічого не робить. `nextClue` змінює `Play` через `withCurrentPlay`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS (усі наявні тести рушія без змін, крім `KEYS`/версії).
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine
  git commit -m "feat(engine): «Who am I?» clues open by the timer (by the host on a voice cell) and pay price × (n − k + 1) / n without a speed bonus; pin scores by distance with half price as correct; GAME_STATE_VERSION 3 (Play.clues)"
  ```

### Задача 3. Зрізи: підказки без витоку, точка без правильної відповіді, позначки на мапі, номер підказки для пульта

**Files:**
- Modify: `packages/shared/src/views.ts`, `packages/engine/src/views.ts`
- Test: новий `packages/engine/src/views.clues-pin.test.ts`
- Modify (фабрики): тести вебу, що будують `PublicQuestion` / `StageView` / `HostView` / `HostResponse` вручну (`grep -rln "sliderMarks: null\|slider: null" apps/web/src`)

**Interfaces:**
- Produces (`shared/views.ts`):
  ```ts
  /** «Хто я?» без прихованих підказок і відповіді. */
  export interface PublicClues {
    total: number;
    /** Відкриті підказки, від найважчої. */
    shown: string[];
    /** Мить наступної підказки (час сервера); null — ведучий відкриває сам, усі відкриті, пауза, утримання або не етап question. */
    nextAt: number | null;
    /** Наступну відкриває ведучий (усна клітинка). */
    byHost: boolean;
    intervalSeconds: number;
  }
  /** Основа точки без правильної точки й кіл. */
  export interface PublicPin { map: PinMap | null; aspect: number }
  // PublicQuestion:
  /** null для інших типів. */
  clues: PublicClues | null;
  /** null для інших типів; картинка власної основи — у imageUrl. */
  pin: PublicPin | null;

  /** Точка гравця на мапі. */
  export interface PinMark { playerId: string; nickname: string; x: number; y: number; points: number }
  // StageView:
  /** Точки гравців: лише етап reveal запитання-точки; від найближчої, далі за нікнеймом. Інакше null. */
  pinMarks: PinMark[] | null;
  // HostView:
  /** Як у сцени, але з етапу question. */
  pinMarks: PinMark[] | null;
  // HostResponse:
  /** «Хто я?»: на якій підказці дано відповідь; інакше null. */
  clue: number | null;
  ```
- Produces (`engine/views.ts`):
  - `publicQuestion(question, presented, clues: PublicClues | null = null)` заповнює `clues` з аргументу (для інших типів `null`) і `pin: question.type === 'pin' ? { map: question.map, aspect: question.aspect } : null`;
  - `publicClues(state): PublicClues | null` — для показаного запитання (`shownQuestion`) типу `clues`: `shown = question.clues.slice(0, cluesOpen(play))`, `nextAt = nextClueAt(state)`, `byHost = cluesByHost(play)`; `shownPublic` передає його; шлях запасного (`spare`) — `null`;
  - `pinMarks(state, forHost)` — як `sliderMarks`: `answer.type === 'pin'`, сортування за `pinDistance` від `target`, далі за нікнеймом; сцена — лише `reveal`, пульт — `question`/`locked`/`reveal`;
  - `HostResponse.clue = cluesAnswered(play, questionFor(state, play, playerId), record.timeMs)` (для бліцу й фіналу — `null`).

- [ ] **Step 1: Write the failing tests** у `views.clues-pin.test.ts` (класика `[clues, pin]`, Анна p1, Богдан p2; поле з усною клітинкою `clues` для двох тестів):
  ```ts
  it('hidden clues never reach phones or the stage', () => {
    const s = openClassic();
    const phone = playerView(s, 'p1')!;
    expect(phone.question?.clues).toMatchObject({ total: 5, shown: ['Я народився 1814 року.'], nextAt: 5000, byHost: false, intervalSeconds: 5 });
    for (const view of [phone, stageView(s)]) {
      const json = JSON.stringify(view);
      for (const hidden of clues.clues.slice(1)) expect(json).not.toContain(hidden);
      expect(json).not.toMatch(/Шевченко|"accepted"/);
    }
    expect(JSON.stringify(hostView(s).correct)).toContain('Я на купюрі 100 гривень.');
  });
  ```
  Інші тести:
  - `the next clue reaches every view after the tick` (`tick(s, 5000)` → `shown.length === 2` у телефона, сцени й пульта);
  - `nextAt is null on pause and on a voice cell; byHost on a voice cell`;
  - `pin target and circles never reach phones or the stage before the reveal` (`phone.question.pin` = `{ map: 'world', aspect: 2 }`; `JSON.stringify` телефона й сцени на `question` і `locked` не має `target`, `fullRadius`, `zeroRadius`; на `reveal` сцена має `reveal.target`);
  - `the stage gets the pins only on the reveal, closest first` (p1 0.59, p2 0.52 → `[p2 1000, p1 500]`);
  - `the host sees the pins while the question runs`;
  - `host responses carry the clue number` (класика: відповідь у 6000 → `clue: 2`; усна клітинка: два `nextClue` і оцінка → `clue: 3`; точка → `clue: null`);
  - `an own-picture pin keeps the picture url for everyone` (`imageUrl` у всіх ролей, `pin.map === null`).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/views.clues-pin.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Потім `pnpm typecheck`: фабрики зрізів у тестах вебу отримують `clues: null`, `pin: null`, `pinMarks: null`, `clue: null`. Компоненти вебу ще не читають нових полів.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages apps/web/src
  git commit -m "feat(engine): public clues show only the opened ones with the next clue time, public pin without the target or circles, pin marks for the stage on the reveal and for the host, clue number in host responses"
  ```

### Задача 4. Сервер: кнопка «Відкрити підказку» і підказки за таймером кімнати

**Files:**
- Modify: `packages/shared/src/events.ts`, `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`
- Test: `apps/server/src/rooms/manager.test.ts`, `apps/server/src/socket.test.ts`, `apps/server/src/rooms/manager.restore.test.ts` (лише якщо там буквальна версія)

**Interfaces:**
- Produces (`events.ts`, `ClientToServerEvents`):
  ```ts
  /** «Хто я?» на усній клітинці: відкрити наступну підказку (10c). */
  'host:clue': (ack: Ack) => void;
  ```
- Produces (`manager.ts`): `HostAction` + `| { type: 'clue' }`; у `host()` — `case 'clue': return this.apply(room, nextClue(state, this.now()));`.
- Produces (`socket.ts`): `on('host:clue', () => (isHost ? manager.host(room, { type: 'clue' }) : FORBIDDEN))` — за зразком `host:guide-skip`.
- Підказки за часом: окремого коду немає — `reschedule` бере `nextDeadline`, що тепер повертає мить наступної підказки, а `tick` записує її в стан і `commit` розсилає зрізи.

- [ ] **Step 1: Write the failing tests.**
  - `manager.test.ts` (з `FakeScheduler`):
    - `a clue opens on time and the room pushes it` (класика з `clues` 5 с: після старту запитання `scheduler.advance(5000)` → `plays[…].clues === 2`, серед подій є `changed`; ще `advance(5000)` → 3);
    - `an early timer still opens the clue` (`new FakeScheduler(5)`, те саме).
  - `socket.test.ts` (за зразком наявних тестів пульта):
    - `host:clue opens the next clue on a voice cell and every phone sees it` (поле з усною клітинкою `clues`; ведучий вибирає клітинку; `host:clue` → ack `{ ok: true }`; гравець отримує `state` з `question.clues.shown.length === 2`);
    - `host:clue: a player cannot send it; in a classic question it is wrong_phase; after the last clue — clues_done`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсом.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src/events.ts apps/server/src
  git commit -m "feat(server): host:clue opens the next «Who am I?» clue on a voice cell; timed clues open through the room timer and reach every phone"
  ```

### Задача 5. Вбудовані мапи «Світ», «Європа», «Україна» з Natural Earth

**Files:**
- Create: `apps/web/scripts/build-maps.mjs`, `apps/web/public/maps/world.svg`, `apps/web/public/maps/europe.svg`, `apps/web/public/maps/ukraine.svg`, `apps/server/scripts/pin-places.ts`, `apps/server/src/maps.test.ts`, `apps/web/src/pin-maps.ts`, `apps/web/src/pin-maps.test.ts`
- Modify: `apps/web/package.json` (devDependencies), `pnpm-lock.yaml`, `apps/web/src/i18n.ts`

**Interfaces:**
- **Дані.** Natural Earth 5.1.2 (суспільне надбання) у GeoJSON з репозиторію `nvkelso/natural-earth-vector`, тег `v5.1.2`, тека `geojson/` (`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/<назва>.geojson`). Завантажити в окрему порожню теку в scratchpad (не в репозиторій):
  - `ne_50m_admin_0_countries_ukr.geojson` — країни з погляду України (світ, Європа, контур і сусіди України). Якщо 50m-файлу точки зору немає, узяти `ne_10m_admin_0_countries_ukr.geojson` (сильніше спростити). Файл без `_ukr` **не брати**;
  - `ne_10m_admin_1_states_provinces.geojson` — області України (`adm0_a3 === 'UKR'`);
  - `ne_10m_rivers_lake_centerlines.geojson` — Дніпро (`name` `Dnipro` або `Dnieper`).
  Якщо GeoJSON у теці немає, узяти zip-архіви шейпфайлів з `naciscdn.org/naturalearth/5.1.2/` і перетворити тимчасово встановленим `shapefile` (не додавати в залежності).
- **Скрипт** `node apps/web/scripts/build-maps.mjs <тека-з-geojson>` (ESM, devDependencies `d3-geo@3.1.1`, `topojson-server@3.0.1`, `topojson-simplify@3.0.3`, `topojson-client@3.1.0`):
  - спрощення: `topojson.presimplify` + `simplify` до порогу, за якого кожен файл ≤ 350 КБ; межі — одна `mesh` (спільні кордони не дублюються);
  - SVG: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H" width="W" height="H">`, перший рядок усередині — `<!-- Made with Natural Earth. Public domain. naturalearthdata.com -->`; `<rect>` моря `#cfe3f0`; суходіл одним `<path>` `#f3efe6`; межі країн `<path fill="none" stroke="#8f8676" stroke-width="1">`; на «Україні» — сусіди `#e4e1da`, Україна `#f7f1df`, межі областей тонше (`0.6`), Дніпро `#7fb0d4`; координати округлені до 0,1; без підписів, без `<script>`, без зовнішніх `href`;
  - проєкції й рамки — як у рішеннях плану («Мапи»); `fitExtent` у `[[20, 20], [W − 20, H − 20]]`, `clipExtent` на весь `viewBox` для Європи й України;
  - перевірки (скрипт падає з поясненням): `d3.geoContains(україна, [34.10, 44.95])` (Сімферополь); серед областей є Крим і Севастополь; кожен файл ≤ 350 000 байтів;
  - пише `apps/server/scripts/pin-places.ts`:
    ```ts
    /** Згенеровано apps/web/scripts/build-maps.mjs: частки x/y міст на вбудованих мапах (для демо, тестів і e2e). Не редагувати вручну. */
    export const PIN_PLACES = {
      ukraine: { kyiv: { x: …, y: … }, lviv: …, odesa: …, kharkiv: …, simferopol: …, uzhhorod: … },
      europe: { paris: …, rome: …, berlin: …, madrid: …, london: …, kyiv: … },
      world: { kyiv: …, tokyo: …, cairo: …, newYork: …, rio: …, sydney: … },
    } as const satisfies Record<PinMap, Record<string, { x: number; y: number }>>;
    ```
    (довгота/широта міст — у скрипті; частки з чотирма знаками після коми.)
- Produces (`apps/web/src/pin-maps.ts`):
  ```ts
  /** Адреса SVG вбудованої мапи (Vite кладе public/maps у dist/maps). */
  export const PIN_MAP_URL: Record<PinMap, string> = { world: '/maps/world.svg', europe: '/maps/europe.svg', ukraine: '/maps/ukraine.svg' };
  /** Адреса основи точки: вбудована мапа або власна картинка; null — немає. */
  export function pinBaseUrl(pin: { map: PinMap | null }, imageUrl: string | null): string | null;
  ```
- `i18n.ts`: `pinMap_world: 'Світ'`, `pinMap_europe: 'Європа'`, `pinMap_ukraine: 'Україна'`, `pinMapAlt: 'Мапа для відповіді'`.

- [ ] **Step 1: Write the failing tests.**
  - `apps/server/src/maps.test.ts` (за зразком `pwa.test.ts` — сервер читає файли вебу):
    - `each built-in map has the aspect of PIN_MAP_ASPECT` (для кожного `PIN_MAPS`: файл `public/maps/<map>.svg` існує, `viewBox` w / h = `PIN_MAP_ASPECT[map]` з похибкою 1e-3);
    - `maps credit Natural Earth, carry no scripts or external links and stay small` (містить `Natural Earth`; не містить `<script`, `href="http`, `xlink:href="http`; розмір ≤ 350 000);
    - `reference places sit inside the maps in the right order` (усі частки 0…1; на «Україні» `lviv.x < kyiv.x < kharkiv.x`, `kyiv.y < odesa.y < simferopol.y`; на «Світі» `newYork.x < kyiv.x < tokyo.x`, `kyiv.y < cairo.y < sydney.y`).
  - `apps/web/src/pin-maps.test.ts`: `pinBaseUrl({ map: 'ukraine' }, null)` → `/maps/ukraine.svg`; `pinBaseUrl({ map: null }, '/uploads/x.png')` → картинка; `pinBaseUrl({ map: null }, null)` → `null`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/maps.test.ts apps/web/src/pin-maps.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `pnpm add -D --filter @quiz/web d3-geo@3.1.1 topojson-server@3.0.1 topojson-simplify@3.0.3 topojson-client@3.1.0`; написати скрипт; завантажити дані в scratchpad; запустити скрипт; закомітити SVG і `pin-places.ts` (сирі GeoJSON — ні). Переглянути кожну мапу в браузері: Крим у межах України, Європа не обрізана на сході до Києва, світ без Антарктиди.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS; `pnpm build` → у `apps/web/dist/maps/` є три файли.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/scripts apps/web/public/maps apps/web/package.json pnpm-lock.yaml apps/web/src/pin-maps.ts apps/web/src/pin-maps.test.ts apps/web/src/i18n.ts apps/server/scripts/pin-places.ts apps/server/src/maps.test.ts
  git commit -m "feat(web): built-in World, Europe and Ukraine maps for pin questions, simplified SVGs from Natural Earth (public domain, Ukraine point of view), reference places for demos and tests"
  ```

### Задача 6. Історія, профіль, досягнення з новими типами; демо

**Files:**
- Test: `apps/server/src/history.test.ts`, `apps/server/src/profiles.test.ts` (або `achievements.test.ts` — де перевіряють точність)
- Modify: `apps/server/scripts/demo-quiz.ts`, `apps/server/scripts/demo-quiz.test.ts`

**Interfaces:**
- Consumes: рушій задач 2–3; `PIN_PLACES` задачі 5; `recorder.ts` пише `record.accepted` без змін.
- Produces (`demo-quiz.ts`):
  ```ts
  export const clues = (text: string, hints: string[], accepted: string[], interval = LIMITS.defaultClueSeconds, points?: number, time = 40): Question;
  /** base — вбудована мапа або власна картинка з пропорцією; radii — [повні, нуль], %. */
  export const pin = (text: string, base: PinMap | { imageUrl: string; aspect: number }, target: { x: number; y: number }, radii: [number, number] = [LIMITS.defaultPinFull, LIMITS.defaultPinZero], points?: number, time?: number): Question;
  ```
  Демо `demo` отримує:
  - у раунді `r-x3` — `clues('Хто я?', ['Я народився в Моринцях 1814 року.', 'Мене викупили з кріпацтва 1838 року.', 'Я був і художником, і поетом.', 'Мій «Кобзар» вийшов 1840 року.', 'Мій портрет — на купюрі 100 гривень.'], ['Тарас Шевченко', 'Шевченко'], 6)` (4 × 6 + 5 = 29 ≤ 40) і `pin('Де на мапі Львів?', 'ukraine', PIN_PLACES.ukraine.lviv)`;
  - у раунді `r-board-phone`, категорія `c-geo` — `cell(pin('Де на мапі Одеса?', 'ukraine', PIN_PLACES.ukraine.odesa, [3, 15], 500, 30))`;
  - у раунді `r-board-voice`, категорія `c-lang` — `cell(clues('Хто я?', ['Я народилася в Новограді-Волинському.', 'Мій дядько — Михайло Драгоманов.', 'Я написала «Лісову пісню».', 'Мій псевдонім пов’язаний з назвою країни.'], ['Леся Українка', 'Лариса Косач'], 8, 400))`;
  - опис демо згадує «Хто я?» і точку на мапі.

  Наявні запитання не змінюються.

- [ ] **Step 1: Write the failing tests.**
  - `history.test.ts`, `describe('history: clues and pin (10c)')` (помічники — як у `history: slider and revealing picture (10b)`). Тест `history shows clue and pin answers; a correct clue answer is correct, a pin is correct from half the price`:
    - класика `[clues (5 підказок, 5 с), pin (мапа «Світ»)]`; Оля відповідає «Шевченко» в мить 12 000 (600) і ставить точку 0.59/0.5 (500); Петро — «Франко» і 0.62/0.5 (250);
    - історія: `payload` `{ type: 'clues', value: 'Шевченко' }` і `{ type: 'pin', x: 0.59, y: 0.5 }`;
    - `accepted`: Оля — true, true; Петро — false, false;
    - `correct` у підсумку гравців: Оля — `[0, 1]`, Петро — `[]`.
  - Профіль: той самий запис дає Олі точність 100 %, Петрові 0 %; «бездоганна гра» в Олі можлива за наявним правилом (перевірити, що досягнення рахує `accepted`).
  - `demo-quiz.test.ts`:
    - `demo has «Who am I?» in classic and on a voice cell, and a pin on the Ukraine map in classic and on a phone cell` (типи й місця; `pin.map === 'ukraine'`; клітинка точки — `kind 'normal'`, спосіб раунду `phone`; клітинка «Хто я?» — в усному раунді);
    - уся вікторина проходить `quizSchema`;
    - `the helpers build valid questions` (`pin(…, { imageUrl: '/uploads/<hex>.png', aspect: 1.5 }, …)` проходить `questionSchema`; `clues` з 6 підказками й інтервалом 8 — `clues_time` при часі 40 → помічник має підняти час до 45, тест це перевіряє).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/history.test.ts apps/server/src/profiles.test.ts apps/server/scripts` → FAIL на демо. Тести історії мають пройти одразу, якщо рушій уже рахує `accepted` за 14a; тоді лишити їх як регресію.
- [ ] **Step 3: Implement** помічники (`clues` піднімає `time` до `(n − 1) × interval + LIMITS.clueTailSeconds`, якщо замало) і запитання демо.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server
  git commit -m "test(server): history, profile accuracy and achievements for «Who am I?» (a correct answer is correct at any clue) and pins (half price counts); demo gets clues in classic and on a voice cell and pins on the Ukraine map"
  ```

### Задача 7. Телефон: підказки по черзі, точка з наближенням, розкриття точки

**Files:**
- Create: `apps/web/src/pin-zoom.ts`, `apps/web/src/pin-zoom.test.ts`, `apps/web/src/screens/PinBoard.tsx`, `apps/web/src/screens/PinFrame.tsx`, `apps/web/src/screens/PinInput.tsx`, `apps/web/src/screens/CluesList.tsx`, тести `PinBoard.test.tsx`, `PinInput.test.tsx`, `CluesList.test.tsx`
- Modify: `apps/web/src/screens/AnswerInput.tsx`, `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/screens/SpotlightChoices.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `AnswerInput.test.tsx`, `PlayerScreen.test.tsx`, `SpotlightChoices.test.tsx`

**Interfaces:**
- Produces (`pin-zoom.ts`):
  ```ts
  export const PIN_MAX_ZOOM = 5;
  /** Наближення рамки: scale 1…PIN_MAX_ZOOM, зсув у пікселях рамки. */
  export interface ZoomView { scale: number; x: number; y: number }
  export const NO_ZOOM: ZoomView;
  export interface Box { width: number; height: number }
  /** Картинка не виходить за рамку: зсув притискається до [box × (1 − scale), 0]. */
  export function clampView(view: ZoomView, box: Box): ZoomView;
  /** Наближення в factor разів навколо точки рамки (cx, cy). */
  export function zoomAround(view: ZoomView, factor: number, cx: number, cy: number, box: Box): ZoomView;
  /** Дві руки: від початкового view і початкових точок a0, b0 до поточних a1, b1 (масштаб — за відстанню, зсув — за серединою). */
  export function pinchView(start: ZoomView, a0: Point, b0: Point, a1: Point, b1: Point, box: Box): ZoomView;
  /** Точка рамки (px, py) → частки основи 0…1; mirrored — рамка під «Дзеркалом» (x перевертається). */
  export function toImagePoint(view: ZoomView, px: number, py: number, box: Box, mirrored: boolean): { x: number; y: number };
  ```
- Produces (`PinBoard.tsx`):
  ```tsx
  /** Основа точки з шаром SVG: кола (за наявності radii), правильна точка, позначки. Пропорція — aspect; позначки сталого розміру. */
  export function PinBoard(props: {
    pin: PublicPin;
    imageUrl: string | null;
    marks?: { playerId: string; nickname: string; x: number; y: number }[];
    target?: { x: number; y: number };
    radii?: { full: number; zero: number };
    /** Підсвітити найближчого (сцена) або себе (телефон). */
    highlight?: string;
    /** Додатковий шар (живий pin у PinFrame). */
    children?: ReactNode;
  }): JSX.Element;
  ```
  - Обгортка `.pin-board` з `aspect-ratio: {aspect}`, `<img class="pin-base" src={pinBaseUrl(...)} alt={t('pinMapAlt')}>` і `<svg class="pin-layer" viewBox="0 0 W H" preserveAspectRatio="none">`, де довша сторона = 1000 (`W = aspect ≥ 1 ? 1000 : 1000 × aspect`).
  - Кола: `.pin-circle-zero` (світліше), `.pin-circle-full` (зелене), радіус `r = radius / 100 × 1000`.
  - Правильна точка — `.pin-target` (зірка) з `aria-label` `t('pinTarget')`.
  - Позначки — `.pin-mark` з `aria-label` = нікнейм, підсвічена — `.is-best`; підписи нікнеймів не накладаються (зсув підпису, якщо дві позначки ближчі за 4 % — простий розвід по вертикалі).
- Produces (`PinFrame.tsx`):
  ```tsx
  /** Рамка з наближенням: дві руки — масштаб, один палець на наближеній — зсув, короткий дотик — onPlace(частки). Кнопки «＋», «－», «⤢». */
  export function PinFrame(props: { pin: PublicPin; imageUrl: string | null; point: { x: number; y: number } | null; onPlace: (point: { x: number; y: number }) => void; overlay?: ReactNode }): JSX.Element;
  ```
  - Pointer Events; `touch-action: none` на рамці; дотик = відпускання без руху понад 8 px і без другої руки за час жесту;
  - «Дзеркало»: `mirrored = frame.closest('.is-mirror') !== null`;
  - кнопки: «＋» (`pinZoomIn`), «－» (`pinZoomOut`), «⤢» (`pinZoomReset`), наближення ×1,5 навколо центру;
  - поставлена точка — `.pin-mark.is-mine` поверх основи, у тому самому трансформованому шарі (стоїть на місці при наближенні), сталий розмір (`scale(1 / view.scale)`).
- Produces (`PinInput.tsx`):
  ```tsx
  export function PinInput({ question, onSubmit, submitLabel }: { question: PublicQuestion & { pin: PublicPin }; onSubmit: (a: Answer) => void; submitLabel?: string }): JSX.Element;
  ```
  `PinFrame` + рядок `t('pinHint')` + кнопка `submitLabel ?? t('submit')`, вимкнена без точки, → `{ type: 'pin', x, y }`.
- Produces (`CluesList.tsx`):
  ```tsx
  /** Підказки «Хто я?»: відкриті з номерами (остання підсвічена), далі заглушки «Підказка N — за M с» або «— відкриє ведучий». all — після розкриття: усі. */
  export function CluesList(props: { clues: PublicClues; offsetMs: number; all?: string[]; big?: boolean }): JSX.Element;
  ```
  Відлік «за M с» — від `nextAt` і годинника сервера (`Date.now() + offsetMs`), оновлення раз на 250 мс, лише поки `nextAt !== null`.
- Changes:
  - `AnswerInput.tsx`: `case 'clues'` → `TypedInput`, що для `clues` надсилає `{ type: 'clues', value }` (тип відповіді — з типу запитання); `case 'pin'` → `PinInput`, якщо `question.pin !== null`.
  - `PlayerScreen.tsx`:
    - над полем відповіді для `clues` — `CluesList` і рядок `t('cluesNow', { k, n, percent })`, де `percent = round(clueShare(n, k) × 100)`; той самий рядок і список після відповіді (підказки далі відкриваються);
    - на розкритті `clues` — `CluesList` з `all = reveal.clues`;
    - на розкритті `pin` — `PinBoard` зі своєю позначкою (`highlight` = свій id), `target` і `radii` з `view.reveal`;
    - глядачі на клітинці поля бачать підказки так само (вибравший відповідає).
  - `SpotlightChoices.tsx`: `clues` — як текст; `pin` — «{name}: точку поставлено» (`spotlightPin`) або «Чекаємо на точку…» (`spotlightWaitPin`).
  - `i18n.ts`:
    - `cluesNow: 'Підказка {k} з {n}: правильна відповідь зараз — {percent} % ціни'`, `clueN: 'Підказка {n}'`, `clueSoon: 'Підказка {n} — за {seconds} с'`, `clueByHost: 'Підказка {n} — відкриє ведучий'`;
    - `pinHint: 'Торкнися мапи, щоб поставити точку. Двома пальцями — наблизити.'`, `pinZoomIn: 'Наблизити'`, `pinZoomOut: 'Віддалити'`, `pinZoomReset: 'Уся мапа'`, `pinTarget: 'Правильна точка'`, `pinMine: 'Твоя точка'`, `pinFrameLabel: 'Мапа: торкнися, щоб поставити точку'`;
    - `spotlightPin: '{name}: точку поставлено'`, `spotlightWaitPin: 'Чекаємо на точку…'`.
  - `styles.css`: `.clues-list`, `.clue`, `.clue.is-new` (коротка поява з урахуванням `prefers-reduced-motion`), `.clue.is-hidden`; `.pin-frame` (`touch-action: none`, `overflow: hidden`), `.pin-board`, `.pin-base`, `.pin-layer`, `.pin-mark`, `.pin-target`, `.pin-circle-*`, `.pin-zoom` (кнопки ≥ 44 px). Телефон 375 — без прокрутки вбік.

- [ ] **Step 1: Write the failing tests.**
  - `pin-zoom.test.ts`:
    - `clampView({ scale: 2, x: 50, y: -999 }, { width: 300, height: 150 })` → `{ 2, 0, -150 }`;
    - `zoomAround(NO_ZOOM, 2, 150, 75, box)` → точка під центром лишається на місці (`toImagePoint` центру = 0.5/0.5 до й після);
    - `pinchView`: руки розійшлися вдвічі → `scale 2`; вище `PIN_MAX_ZOOM` → `5`;
    - `toImagePoint(NO_ZOOM, 75, 75, { 300, 150 }, false)` → `{ 0.25, 0.5 }`; з `mirrored: true` → `{ 0.75, 0.5 }`; поза рамкою притискається до 0…1.
  - `PinInput.test.tsx` (мок `getBoundingClientRect` рамки → 300 × 150; події `pointerdown`/`pointerup` з `clientX/Y`):
    - «Відповісти» вимкнена без точки;
    - дотик у (75, 75) → `.pin-mark.is-mine` з'явилася; другий дотик у (150, 30) переставляє; «Відповісти» → `onSubmit({ type: 'pin', x: 0.5, y: 0.2 })`;
    - «Наблизити» → трансформ шару має `scale(1.5)`; дотик після наближення дає частки з урахуванням зсуву;
    - рух пальця на 20 px — не дотик (точка не ставиться);
    - дві руки, що розходяться, збільшують масштаб;
    - під `.is-mirror` дотик у (75, 75) → `x: 0.75`.
  - `PinBoard.test.tsx`: з `radii { full: 3, zero: 15 }` для `aspect 2` — кола з `r` 30 і 150; `target` → `.pin-target`; три позначки з `aria-label`, `highlight` → одна `.is-best`; основа `/maps/world.svg` для `map: 'world'`.
  - `CluesList.test.tsx` (фальшиві таймери): 2 з 5 відкриті, `nextAt` за 3000 → «Підказка 3 — за 3 с», через 1 с — «за 2 с»; `byHost` → «Підказка 3 — відкриє ведучий»; `all` → усі 5 без заглушок.
  - `AnswerInput.test.tsx`: `clues` → введення «Шевченко» → `{ type: 'clues', value: 'Шевченко' }`.
  - `PlayerScreen.test.tsx`:
    - `clues` на `question`: дві підказки, «Підказка 2 з 5: правильна відповідь зараз — 80 % ціни», поле відповіді; після відповіді — список далі видно;
    - `pin` на `question`: є рамка мапи з кнопкою «Наблизити»; надсилання → `player:answer` з `pin`;
    - розкриття `pin`: своя позначка, `.pin-target`, кола; розкриття `clues`: усі підказки.
  - `SpotlightChoices.test.tsx`: точка вибравшого на полі → «Оля: точку поставлено».
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсом.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): «Who am I?» clues on the phone with a countdown to the next clue and the current share, pin input with pinch zoom and zoom buttons, movable until submit, pin reveal with circles"
  ```

### Задача 8. Сцена, пульт, історія: підказки великим, мапа з точками на розкритті, кнопка «Відкрити підказку»

**Files:**
- Modify: `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/HostScreen.tsx`, `apps/web/src/pages/GameHistory.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `StageScreen.test.tsx`, `HostScreen.test.tsx`, тест сторінки історії (наявний файл для `GameHistory`, якщо є; інакше новий `GameHistory.test.tsx` за зразком сусідніх сторінок)

**Interfaces:**
- Changes (`StageScreen.tsx`):
  - `clues` на `question`: `CluesList big` замість картинки варіантів; підказка `t('cluesOnPhone')` (на усній клітинці — без неї);
  - `pin` на `question`: `PinBoard` без позначок і кіл + `t('pinOnPhone')`;
  - розкриття `pin`: `PinBoard` з `view.pinMarks`, `target`, `radii`, `highlight` = перший, підпис `t('pinBest', { name, distance })` («Найближче: Оля — 1,2 %»); рядок «Правильна відповідь» не показується;
  - розкриття `clues`: `CluesList` з `all`, далі звичайний рядок «Правильна відповідь: …».
- Changes (`HostScreen.tsx`):
  - панель `.host-clues`, коли поточне запитання `clues`: усі підказки з `view.correct` з позначками «відкрито» / «за N с» / «закрито»; рядок `t('cluesHostNow', { k, n, percent })`;
  - на усній клітинці (`view.question.clues.byHost`) — кнопка `t('clueOpen', { n: k + 1 })` → `send('host:clue')`; після останньої кнопка вимкнена з підписом `t('cluesAllOpen')`;
  - у рядку кожної відповіді на `clues` — `t('clueAt', { n: response.clue })` («на підказці 2»);
  - для `pin` — `PinBoard` з живими `view.pinMarks`, `target` і `radii` з `view.correct` з етапу `question`.
- Changes (`GameHistory.tsx`): запитання `pin` показує `PinBoard` (мала, `max-width: 320px`) з правильною точкою й колами, без позначок гравців.
- `i18n.ts`: `cluesOnPhone: 'Відповідайте на телефоні, щойно впізнаєте: що раніше, то більше балів.'`, `pinOnPhone: 'Ставте точку на телефоні'`, `pinBest: 'Найближче: {name} — {distance} %'`, `cluesHostNow: 'Відкрито {k} з {n}: правильна відповідь зараз — {percent} % ціни'`, `clueOpen: 'Відкрити підказку {n}'`, `cluesAllOpen: 'Усі підказки відкрито'`, `clueAt: 'на підказці {n}'`, `clueOpened: 'відкрито'`, `clueClosed: 'закрито'`.
- `styles.css`: `.host-clues`, великі підказки на сцені (1280 × 720 без прокрутки для 6 підказок по 150 символів — шрифт підбирається класом за кількістю), мапа сцени вписується у висоту.

- [ ] **Step 1: Write the failing tests.**
  - `StageScreen.test.tsx`:
    - `clues` на `question` — дві підказки й «Відповідайте на телефоні…»; на усній клітинці — без цього рядка;
    - `pin` на `question` — `img.pin-base` і «Ставте точку на телефоні», без `.pin-mark` і `.pin-target`;
    - розкриття `pin` — дві `.pin-mark` («Оля», «Петро»), `.is-best` на першій, `.pin-target`, обидва кола, «Найближче: Оля — 2,0 %».
  - `HostScreen.test.tsx`:
    - `clues` у класиці: усі 5 підказок, 2 позначені «відкрито», кнопки «Відкрити підказку» немає; відповідь Олі з `clue: 2` → «на підказці 2»;
    - усна клітинка: «Відкрити підказку 3» → `send('host:clue')`; на 5 з 5 — «Усі підказки відкрито» й кнопка вимкнена;
    - `pin` на `question`: `.pin-mark` гравців і `.pin-target`.
  - Історія: відповідь на `pin` показує мапу з `.pin-target` і рядок «Точка за 2,0 % від правильної».
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсом.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): stage shows clues large and every pin with the target and circles on the reveal, host console lists all clues and opens the next one on a voice cell, live pins for the host, pin thumbnail in history"
  ```

### Задача 9. Редактор: «Хто я?», точка з вибором основи, обмеження клітинок, перевірки чернетки

**Files:**
- Create: `apps/web/src/editor/PinEditor.tsx`, `apps/web/src/editor/PinEditor.test.tsx`
- Modify: `apps/web/src/editor/QuestionEditor.tsx`, `apps/web/src/editor/BoardEditor.tsx`, `apps/web/src/editor/draft.ts`, `apps/web/src/editor/draft-storage.ts`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `QuizEditor.test.tsx`, `BoardEditor.test.tsx`, `draft.test.ts`, `draft-storage.test.ts`

**Interfaces:**
- Changes (`QuestionEditor.tsx`):
  - новий проп `cluesByHost?: boolean` (типово `false`; `BoardEditor` → `cellAnswerMode(round, cell) === 'voice'`);
  - для `pin` не показуються загальні `ImageField` і `VideoField` (основою керує `PinEditor`); для `clues` — не показується `VideoField`; `AudioField` — для обох;
  - `Body`, `case 'clues'`:
    - `Rows` підказок (`min LIMITS.minClues`, `max LIMITS.maxClues`, `maxLength LIMITS.clueText`, підписи `clueRowN` «Підказка {n}», `addClue` «Додати підказку», `removeClue` «Прибрати підказку»; з ↑ ↓, якщо `Rows` уміє перестановку, — інакше без неї); над ними `t('cluesOrderHint')` «Від найважчої до найлегшої: перша відкривається одразу.»;
    - `Rows` написань — як у «тексті» (`spellingN`, `addSpelling`, `spellingHint`);
    - без `cluesByHost`: `NumberField` «Нова підказка кожні, с» (`cluesInterval`) і рядок `t('cluesTimeHint', { at, time })` «Остання підказка відкриється на {at}-й секунді з {time}.»; з `cluesByHost` — рядок `t('cluesVoiceHint')` «На усній клітинці підказки відкриваєте ви кнопкою на пульті.» і без поля інтервалу;
    - зміна кількості підказок або інтервалу піднімає `timeLimit` до `(n − 1) × interval + LIMITS.clueTailSeconds`, якщо його замало (не вище `LIMITS.maxTime`; що не влазить — ловить перевірка чернетки).
  - `Body`, `case 'pin'` → `<PinEditor question onChange />`.
- Produces (`PinEditor.tsx`):
  ```tsx
  export function PinEditor({ question, onChange }: { question: Extract<Question, { type: 'pin' }>; onChange: (q: Question) => void }): JSX.Element;
  ```
  - Вибір основи — група `aria-pressed`: «Світ», «Європа», «Україна» (`pinMap_*`), «Своя картинка» (`pinOwnImage`). Мапа → `{ map, aspect: PIN_MAP_ASPECT[map], imageUrl: null }`, точка — у центр. «Своя картинка» → кнопка завантаження через `useImageUpload` (та сама, що в `ImageField`); після завантаження пропорція з `naturalWidth / naturalHeight` (тайм-аут 3 с → помилка `pinImageFailed`); пропорція поза 0,25…4 → `pinAspectBad` «Картинка надто видовжена: довша сторона може бути щонайбільше вчетверо більшою за коротшу.» і основа не змінюється.
  - `PinFrame` з `overlay` — кола й правильна точка наживо; дотик ставить `target`. Підпис `t('pinTargetHint')` «Торкніться мапи, щоб поставити правильну точку.».
  - `NumberField decimal`: «Повні бали в межах, %» (`pinFull`) і «Нуль балів далі ніж, %» (`pinZero`) у `.pair`; рядок `t('pinRadiusHint')` «Відстань — у відсотках довшої сторони мапи. Половина ціни й більше вважається правильною відповіддю.».
- Changes (`BoardEditor.tsx`):
  - вибір типу `pin` → клітинка `{ kind: 'normal', answerMode: 'phone', penalty: 'none' }` і замість вибору виду й способу — `t('pinCellNote')` «Точку ставлять лише з телефона на звичайній клітинці.» (як `sortCellNote`);
  - вибір типу `clues` → `kind: 'normal'`, у виборі виду немає «Бліц» (рядок `t('cluesCellNote')` «Підказки по черзі — лише на звичайній клітинці.»), спосіб відповіді лишається вибором;
  - `QuestionEditor` отримує `cluesByHost`.
- Changes (`draft.ts`):
  - `cleanQuestion`: підказки й написання обрізаються;
  - `problemKey`:
    - `clues`: порожня підказка → `problemClueEmpty` «Запитання {index}: заповніть кожну підказку.»; порожні написання — як у «тексті»; `(n − 1) × interval + 5 > timeLimit` → `problemCluesTime` «Запитання {index}: остання підказка відкривається на {at}-й секунді — дайте щонайменше {need} с часу або зменште інтервал.»; інтервал поза межами → `problemCluesInterval` «Запитання {index}: інтервал між підказками — від 3 до 30 с.» (числа з `LIMITS`);
    - `pin`: власна основа без картинки → `problemPinImage` «Запитання {index}: завантажте картинку для точки або виберіть мапу.»; радіуси нескінченні, поза межами або нуль ≤ повних → `problemPinRadius` «Запитання {index}: радіус нуля має бути більшим за радіус повних балів (до 100 %).».
  - `problemsOf` (місце): `clues` у бліці чи фіналі, на бліц-клітинці → `problemCluesPlace` «Запитання {index}: «Хто я?» діє лише в класиці й на звичайній клітинці поля.»; `pin` у бліці, фіналі, на бліц- чи усній клітинці → `problemPinPlace` «Запитання {index}: точка на мапі діє лише в класиці й на звичайній клітинці поля з телефона.». Окремих речень для схемних `pin_base`, `pin_aspect`, `clues_video`, `pin_video` не треба: редактор не дає їх створити.
- Changes (`draft-storage.ts`, `revive`):
  - `clues`: масив рядків або `['', '', '']`; `accepted` — як у «тексті»; `interval` через `numberOr`;
  - `pin`: `map` з `PIN_MAPS` або `null`; `aspect`, `fullRadius`, `zeroRadius`, `target.x`, `target.y` через `numberOr`; невідома мапа → `'world'` з її пропорцією.
- `i18n.ts`: усі ключі, названі вище (`clueRowN`, `addClue`, `removeClue`, `cluesOrderHint`, `cluesInterval`, `cluesTimeHint`, `cluesVoiceHint`, `pinOwnImage`, `pinImageFailed`, `pinAspectBad`, `pinTargetHint`, `pinFull`, `pinZero`, `pinRadiusHint`, `pinCellNote`, `cluesCellNote`, `problemClueEmpty`, `problemCluesTime`, `problemCluesInterval`, `problemPinImage`, `problemPinRadius`, `problemCluesPlace`, `problemPinPlace`).

- [ ] **Step 1: Write the failing tests.**
  - `draft.test.ts`:
    - `clues` з порожньою підказкою → `problemClueEmpty`; 6 підказок по 8 с при 30 с → `problemCluesTime` з `at: 40`, `need: 45`; правильне — `[]`;
    - `pin` з `map: null` і без картинки → `problemPinImage`; `zeroRadius: 2, fullRadius: 3` → `problemPinRadius`;
    - `clues` на бліц-клітинці → `problemCluesPlace`; `pin` на усній клітинці → `problemPinPlace`; на звичайній клітинці з телефона — без проблем.
  - `draft-storage.test.ts`: точка з `NaN` радіусом відновлюється з проблемою; `map: 'mars'` → `'world'` з пропорцією 2; підказки з `null` → порожні рядки.
  - `PinEditor.test.tsx`:
    - «Україна» → `onChange` з `map: 'ukraine'`, `aspect: 16 / 11`, `imageUrl: null`;
    - дотик по рамці (мок 320 × 220) → `target` з частками; кола видно (`.pin-circle-full`);
    - «Своя картинка» + файл (мок `uploadImage` і `naturalWidth 1200`, `naturalHeight 800`) → `map: null`, `imageUrl`, `aspect: 1.5`; картинка 1000 × 100 → «Картинка надто видовжена…», основа не змінюється;
    - поле «Нуль балів далі ніж, %» = 20 → `zeroRadius: 20`.
  - `QuizEditor.test.tsx`:
    - чип «хто я?» → три поля «Підказка 1…3», «Нова підказка кожні, с», «Остання підказка відкриється на 16-й секунді з 30.»; «Додати підказку» ×3 → час піднімається до 45; «Зберегти» шле `{ type: 'clues', clues: [...6], accepted: ['Шевченко'], interval: 8, timeLimit: 45 }`;
    - чип «точка» → немає загальної «Додати картинку» й поля відео; є «Світ», «Європа», «Україна», «Своя картинка»; збережене має `type: 'pin'`;
    - у бліці немає чипів «хто я?» і «точка».
  - `BoardEditor.test.tsx`: тип «точка» на усній клітинці перемикає її на звичайну з телефона й показує «Точку ставлять лише з телефона…»; «хто я?» на усній клітинці лишається усною й показує «На усній клітинці підказки відкриваєте ви кнопкою на пульті.» без поля інтервалу.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/editor` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсом. На 375 px пари полів переходять в один стовпчик (наявний `.pair`); рамка мапи — на всю ширину картки.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): editor for «Who am I?» (clues hardest first, spellings, interval with the time raised to fit) and pins (World, Europe, Ukraine or an own picture, tap to set the target, live circles, radii), board cell rules and draft checks"
  ```

### Задача 10. Довідка ведучого: «Хто я?», точка, оновлені записи бафів, клітинок, раундів і налаштувань

**Files:**
- Modify: `apps/web/src/help/questions.ts`, `apps/web/src/help/powers.ts`, `apps/web/src/help/cells.ts`, `apps/web/src/help/rounds.ts`, `apps/web/src/help/settings.ts`, `apps/web/src/screens/HostScreen.tsx`
- Test: `apps/web/src/help/host-help.test.ts`, `HostScreen.test.tsx`

**Interfaces:**
- `questions.ts` (записи, вписані в задачі 1; тут звірити з рушієм і доповнити):
  - `clues`:
    - `title: 'Хто я?'` (= `t('type_clues')`);
    - «Що це»: «Підказки відкриваються по одній, від найважчої до найлегшої; хто раніше впізнає відповідь, отримає більше.»;
    - «Як іде в грі»: ви задаєте `${LIMITS.minClues}–${LIMITS.maxClues}` підказок, написання відповіді й інтервал; перша підказка видна одразу, наступні — кожні N секунд (на сцені великим, на телефонах — список із відліком до наступної); гравець пише відповідь будь-коли, але лише раз; на усній клітинці поля наступну підказку відкриваєте ви кнопкою «Відкрити підказку» на пульті; пульт показує, на якій підказці відповів кожен;
    - «Бали»: «Відповідь після k-ї з n підказок — ціна × (n − k + 1) / n: з 5 підказок це 100, 80, 60, 40 і 20 % ціни.», «Неправильна відповідь — 0 (зі штрафом «мінус» — мінус ціна).», «Правильна відповідь вважається правильною на будь-якій підказці: вона йде в серію, точність і досягнення.», «Бонусу за швидкість немає — спадання вже вбудоване.», «На усній клітинці бали — за підказкою, відкритою в мить вашої оцінки.»;
    - «Порада»: «Перша підказка має бути справді важкою, остання — майже відповіддю.», «Інтервал 6–10 секунд дає час прочитати підказку вголос.»;
    - «Обмеження»: «Лише класика й звичайна клітинка поля (з телефона або вголос).», «Не діють 50/50, «Друга спроба» і «Запитання в залі».», `Остання підказка має відкритися щонайменше за ${LIMITS.clueTailSeconds} с до кінця часу.`, «Без відео; аудіо можна.».
  - `pin`:
    - `title: 'Точка на мапі'` (= `t('type_pin')`);
    - «Що це»: «Гравець ставить точку на мапі чи картинці; що ближче до правильної, то більше балів.»;
    - «Як іде в грі»: основа — вбудована мапа «Світ», «Європа», «Україна» або ваша картинка; ви ставите правильну точку й задаєте два кола; гравець торкається мапи (точку можна переставляти до «Відповісти»), наближає двома пальцями або кнопками; на розкритті сцена показує всі точки з нікнеймами, правильну точку й кола, найближчий підсвічений;
    - «Бали»: «Усередині першого кола — повна ціна; далі бали спадають рівномірно до нуля на другому колі.», «Радіуси — у відсотках довшої сторони мапи.», «Відповідь, що дала щонайменше половину ціни, вважається правильною: вона йде в серію, точність і досягнення.», «На полі частка діє завжди, правило «частково» не потрібне.», «Бонус за швидкість у класиці діє.»;
    - «Порада»: «Для міст беріть «Україну» чи «Європу»: на «Світі» точка в місто майже неможлива — збільште кола.», «Своя картинка підходить для схем, полотен, фото натовпу («де Уолі?»).», «Вбудовані мапи — Natural Earth, суспільне надбання; кордони — з погляду України.»;
    - «Обмеження»: «Лише класика й звичайна клітинка поля з телефона.», «50/50 тут не діє: варіантів немає. Не діють і «Друга спроба» та «Запитання в залі».», `Своя картинка — сторони відрізняються не більше ніж учетверо.`, «Без відео; аудіо можна.».
- `powers.ts`:
  - `fifty.limits`: + «Не діє на «Хто я?» і точці на мапі.»;
  - `retry.limits`: + «Не діє на «Хто я?» (відповідь одна) і точці на мапі.»;
  - `audience.limits`: + «Не діє на «Хто я?» і точці на мапі.»;
  - `time.points`: + «На «Хто я?» додатковий час нових підказок не відкриває — усі вже відкриті.»;
  - `swap.limits` — перелік простих типів доповнити «повзунок» (якщо його там ще немає), без нових типів.
- `cells.ts`: `voice.how` + ««Хто я?» на усній клітинці: наступну підказку відкриваєте ви кнопкою «Відкрити підказку»; бали — за підказкою, на якій прозвучала відповідь.»; `voice.limits` (або `normal.limits`) + «Точка на мапі — лише звичайна клітинка з телефона.»; `blitz.limits` + «Не для «Хто я?» і точки на мапі.».
- `rounds.ts`: `blitz.limits` і `final.limits` + ««Хто я?» і точка на мапі тут недоступні.»; `classic.tip` + «Географічний раунд — звичайний раунд, де всі запитання — «Точка на мапі».».
- `settings.ts`: `speedBonus` — «Не нараховується на картинці, що проявляється, і на «Хто я?».».
- Пульт: панель `.host-clues` має `<HelpButton id="question.clues" />` біля заголовка; мапа точки на пульті — `<HelpButton id="question.pin" />`. Кнопки «ⓘ» біля типу в `.host-context` (10a) уже ведуть на ці записи.

- [ ] **Step 1: Write the failing tests.**
  - `host-help.test.ts`:
    - наявні тести «кожен тип має запис» і «назви збігаються» тепер покривають `clues` і `pin`;
    - новий `10c entries tell the engine numbers`: `question.clues.points` містить «100, 80, 60, 40 і 20 %» — і ці числа дорівнюють `[1, 2, 3, 4, 5].map((k) => Math.round(clueShare(5, k) * 100))`; `question.clues.how` містить `${LIMITS.minClues}–${LIMITS.maxClues}`, а `question.clues.limits` — `${LIMITS.clueTailSeconds} с`; `question.pin.points` містить «половин»; `question.pin.limits` містить «50/50»; `question.pin.tip` містить «Natural Earth»;
    - `related entries mention the new limits`: `buff.fifty`, `buff.retry`, `buff.audience` — «Хто я?»; `cell.voice` — «Відкрити підказку»; `setting.speedBonus` — «Хто я?»; `round.blitz` і `round.final` — «точка на мапі».
  - `HostScreen.test.tsx`: запитання `clues` → кнопка «Довідка: Хто я?» у панелі підказок; `pin` → «Довідка: Точка на мапі»; натиск нічого не надсилає.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/help apps/web/src/screens/HostScreen.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Звірити кожне речення з рушієм задачі 2 і з рішеннями плану.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "docs(web): host help for «Who am I?» and pins (scoring, voice-cell clues, map licence), buff, cell, round and speed-bonus limits updated; ⓘ on the host clue panel and pin map"
  ```

### Задача 11. Наскрізний сценарій 10c з кадрами

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–10; `PIN_PLACES` з `apps/server/scripts/pin-places.ts` (якщо tsconfig e2e не бачить `scripts`, імпортувати відносним шляхом, як інші e2e-імпорти зі `scripts`, або додати шлях у `include`).
  - Помічники: `open`, `register`, `join`, `click`, `field`, `shot`, `afterSplash`, `seconds`, `expectNoSideScroll`, `snapshot`, `problems`, `socketFrames`, `scoreOf`, `toNextQuestion`.
- Нові помічники у файлі:
  ```ts
  /** Дотик у частку (x, y) мапи: рахує піксель з рамки .pin-frame (без наближення). */
  async function tapMap(page: Page, point: { x: number; y: number }): Promise<void>;
  /** Тексти відкритих підказок на сторінці. */
  const shownClues = async (page: Page) => page.locator('.clue:not(.is-hidden)').allTextContents();
  ```

- [ ] **Step 1: Add the scenario** у кінець файлу за зразком 10b:
  ```ts
  it('part 10c: «Who am I?» and pins — the editor builds both (375 px too), clues open one by one and never leak, the pin moves until submit and zooms, the stage reveals every pin with circles, the host opens clues on a voice cell', async () => {
    try {
      await cluesPinGame();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Підготовка `cluesPinGame()`:**
  1. `const host = await open('host10c', 1280, 900); await register(host, 'host', 'Ірина Ведуча', 'host10c@example.com');`
  2. Вікторина «Хто я й де це 10c» через `POST /api/quizzes`:
     - раунд `r1` класика «Хто я й де це» (`speedBonus: false`, `DEFAULT_RULES`):
       - `c1` clues «Хто я?»: 4 підказки (`'Я народився в Моринцях.'`, `'Я був кріпаком.'`, `'Я художник і поет.'`, `'Мій портрет — на 100 гривнях.'`), `accepted: ['Шевченко', 'Тарас Шевченко']`, `interval: 4`, 30 с, 1000;
       - `p1` pin «Де на мапі Львів?»: `map: 'world'` (редактор змінить на «Україну» й поставить точку), `aspect: 2`, `target { 0.5, 0.5 }`, радіуси 3 / 15, 30 с, 1000;
     - раунд `r2` поле, `answerMode: 'voice'`, `check: 'manual'`, 3 категорії по 3 клітинки (прості `text`), у першій клітинці першої категорії — clues «Хто я?» (3 підказки про Лесю Українку, `accepted: ['Леся Українка']`, `interval: 8`, 30 с, 300 балів).
  **Кроки з перевірками й кадрами (у такому порядку):**
  1. **Редактор (1280 × 900).** «Редагувати» у «Хто я й де це 10c»:
     - **Запитання 1.** Видно «Підказка 1»…«Підказка 4» і «Остання підказка відкриється на 12-й секунді з 30.» → «Додати підказку» → п'ята «Підказка 5» = «Я написав «Кобзар».» → рядок «…на 16-й секунді з 30.» → кадр `p10c-editor-clues`.
     - **Запитання 2.** «Україна» → `aria-pressed="true"`; `tapMap(host, PIN_PLACES.ukraine.lviv)` → `.pin-target` і обидва кола видно → кадр `p10c-editor-pin`.
     - «Нуль балів далі ніж, %» = 2 → у панелі проблем «радіус нуля має бути більшим…» → повернути 15.
     - 375 × 812: запитання 1 — `expectNoSideScroll(host, 'p10c-editor-clues-375')`; запитання 2 — `expectNoSideScroll(host, 'p10c-editor-pin-375')` (кадри обох) → назад 1280 × 900.
     - «Зберегти». `GET /api/quizzes/<id>`: у `c1` 5 підказок; у `p1` `map === 'ukraine'`, `aspect ≈ 16 / 11`, `target` у межах ±0,01 від `PIN_PLACES.ukraine.lviv`.
  2. **Гра.**
     - «Грати» → `code`, `stageUrl`; `stage = open('stage10c', 1280, 720)` → `stage.goto(stageUrl)`.
     - `olya = open('olya10c', 375, 812)`, `petro = open('petro10c', 375, 812)`, `join` обох; почати збирати `socketFrames(olya)`.
     - «Почати гру» → `afterSplash` → «Почати раунд» → `afterSplash(host, olya, petro, stage)`.
  3. **«Хто я?» (класика).**
     - Одразу: `shownClues(olya)` = 1 підказка; на сцені — та сама; на телефоні Олі «Підказка 2 — за … с».
     - Чекати, доки `shownClues(olya).length === 2` (≈ 4 с) → рядок «Підказка 2 з 5: правильна відповідь зараз — 80 % ціни» → кадр `p10c-phone-clues` (Оля, 375) → `expectNoSideScroll(olya, 'p10c-phone-clues')`.
     - Перевірка витоку: жоден кадр сокета Олі досі не містить «Я художник і поет.», «Мій портрет — на 100 гривнях.», «Я написав «Кобзар».» і «Шевченко».
     - Оля вписує «Шевченко» → «Відповісти». Петро чекає 3-ї підказки → вписує «Франко» → «Відповісти» → запитання закривається (усі відповіли).
     - «Показати відповідь»: на сцені всі 5 підказок; на пульті в рядку Олі «на підказці 2», `scoreOf(host, 'Оля') === 800`, Петро — 0.
     - `toNextQuestion(host)`.
  4. **Точка (класика).**
     - Сцена: `img.pin-base` з `/maps/ukraine.svg`, «Ставте точку на телефоні», жодної `.pin-target`.
     - Оля: «Відповісти» вимкнена → `tapMap(olya, PIN_PLACES.ukraine.kharkiv)` → `tapMap(olya, PIN_PLACES.ukraine.lviv)` (точка переставлена: одна `.pin-mark.is-mine`) → «Наблизити» (масштаб 1,5) → кадр `p10c-phone-pin` (до підтвердження) → `expectNoSideScroll(olya, 'p10c-phone-pin')` → «Уся мапа» → «Відповісти».
     - Петро: `tapMap(petro, PIN_PLACES.ukraine.kharkiv)` → «Відповісти».
     - Перевірка витоку: жоден кадр сокета Олі до розкриття не містить `"target"`, `"fullRadius"`, `"zeroRadius"`.
     - Пульт (до розкриття): дві `.pin-mark` і `.pin-target` → кадр `p10c-host-pins`.
     - «Показати відповідь»: на сцені `.pin-mark` з `aria-label` «Оля» (`.is-best`) і «Петро», `.pin-target`, `.pin-circle-full`, `.pin-circle-zero`, «Найближче: Оля» → кадр `p10c-stage-pins`. `scoreOf(host, 'Оля')` = 1800, Петро — 0.
     - Телефон Олі на розкритті: своя позначка, `.pin-target` і кола.
  5. **«Хто я?» на усній клітинці.**
     - Далі до раунду `r2` (`afterSplash`) → вибирає гравець, чий хід (або ведучий через `host:pick` кнопкою на пульті) клітинку «Хто я?».
     - Пульт: панель підказок, 1 з 3 «відкрито», «Відкрити підказку 2» → натиснути → сцена й телефони показують 2 підказки; рядок «Відкрито 2 з 3: правильна відповідь зараз — 67 % ціни» → кадр `p10c-host-clues`.
     - Через 10 с (інтервал 8) третя підказка **не** відкрилась сама.
     - Ведучий позначає вибравшому «Правильно» → його бали зросли на 200 (300 × 2 / 3).
  6. `expect(problems).toEqual([])`.

- [ ] **Step 2: Run** `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв.
  - Наявні сценарії шукають кнопки за назвою. Нові чипи «хто я?» і «точка» можуть зачепити `getByRole('button', { name: … })` без `exact` (наприклад, «текст» / «точка») — тоді додати `exact`.
  - Переглянути кадри в `apps/server/e2e/artifacts/shots`:
    - редактор на 375 px: рядки підказок і рамка мапи не вилазять за край, кнопки ± основи не налазять;
    - телефон: підказки читаються, відлік видно, поле відповіді не ховається під клавіатурою (кнопка лишається видимою);
    - точка до підтвердження: мітка сталого розміру на наближеній мапі, кнопки наближення не закривають мапу;
    - сцена: кола й підписи нікнеймів не накладаються, найближчий помітно виділений, мапа вміщується в 720 px;
    - пульт: панель підказок і кнопка «Відкрити підказку» не ламають верстку запитання.
- [ ] **Step 3: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 4: Commit**
  ```bash
  git add apps/server/e2e/full-game.e2e.ts
  git commit -m "test: part 10c end-to-end — editor builds «Who am I?» and a pin on the Ukraine map (375 px too); clues open one by one without leaking; the pin moves until submit and zooms; the stage reveals every pin with circles; the host opens clues on a voice cell"
  ```

Після фінальної рецензії гілку злити в `main` і запустити `pnpm vitest run --maxWorkers=2`. **`GAME_STATE_VERSION` піднято до 3**, тому за правилом 14a: перед `git push origin main` перевірити в базі Render `SELECT count(*) FROM live_room;` — пушити лише за 0; інакше чекати й перевірити пізніше.

У звіті власникові назвати рішення:
- **«Хто я?»:**
  - 3–6 підказок до 150 символів, інтервал 3–30 с, остання — щонайменше за 5 с до кінця (редактор сам піднімає час);
  - бали ціна × (n − k + 1) / n, без бонусу швидкості, одна спроба; правильна відповідь правильна на будь-якій підказці;
  - на усній клітинці підказки відкриває ведучий кнопкою; бали — за відкритою підказкою в мить оцінки;
  - ще не відкриті підказки на телефон не потрапляють навіть у даних.
- **Точка:**
  - мапи «Світ», «Європа», «Україна» з Natural Earth (суспільне надбання, кордони з погляду України, Крим — Україна) або своя картинка;
  - радіуси — у відсотках довшої сторони; половина ціни й більше — «правильно»; бонус за швидкість діє;
  - наближення двома пальцями й кнопками, точку можна переставляти до «Відповісти»;
  - правильна точка й кола не надсилаються до розкриття.
- **Бафи:** 50/50, «Друга спроба» і «Запитання в залі» на обох типах не діють; решта — як завжди.
- **Формат стану:** `GAME_STATE_VERSION` 3 (кількість відкритих підказок у стані) — пуш перерве ігри, що йдуть; тому пуш лише за порожньої `live_room`.
- **Демо:** у «demo» — «Хто я?» в класиці й на усній клітинці, «Де Львів?» і «Де Одеса?» на мапі «Україна».
