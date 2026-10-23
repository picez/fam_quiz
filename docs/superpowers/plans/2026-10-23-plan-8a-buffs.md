# План 8a: бафи й дебафи в налаштуваннях, перші п'ять бафів

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 8a специфікації (розділ 3).
- У редакторі, у налаштуваннях вікторини, — розділ «Бафи й дебафи»: шість дебафів і вісім бафів із прапорцями та кнопками «Усі / Жодного». Старі й нові вікторини без змін у розділі: усі шість дебафів дозволені, бафів немає. Пульт показує лише дозволені дебафи (жодного — немає дії «Дебаф»), сервер відхиляє заборонений.
- Кожен гравець має по одному кожному дозволеному бафу на всю гру й бере його сам на телефоні: ряд значків під запитанням, не більше одного бафу на запитання, лише до власної відповіді й поки запитання відкрите. Бафи діють у класичному раунді й на звичайних клітинках поля з телефона (лише вибравший).
- П'ять бафів: **50/50**, **подвійні бали**, **друга спроба**, **додатковий час** (+30 с), **щит**. Правила серій: подвійні бали подвоюють бонус серії, щит серію не рятує, правильна друга спроба серію продовжує.
- Сцена показує значок біля імені («½ Оля») і коротке сповіщення «Оля: 50/50»; що саме сталося на телефоні, бачить лише гравець. Коли розкриття чекає гравця з додатковим часом, сцена показує «Чекаємо: Оля · 0:24», а ведучий — кнопку «Не чекати».
- Історія показує значок бафу біля відповіді; бали з подвійними й щитом збігаються в таблиці, історії й профілі.

**Архітектура:**
- **Дані (`shared`).** `BUFF_KINDS` — усі вісім бафів (`fifty`, `double`, `retry`, `time`, `shield`, `audience`, `hint`, `swap`), `READY_BUFFS` — п'ять бафів 8a (8b допише свої три). Необов'язкові поля налаштувань `settings.debuffs?: DebuffKind[]` і `settings.buffs?: BuffKind[]`: немає поля — типове значення (усі дебафи, жодного бафу), тож старі вікторини, знімки ігор і тестові фікстури не змінюються. Читання лише через `allowedDebuffs(quiz)` і `allowedBuffs(quiz)`. Схема відхиляє баф не з `READY_BUFFS` (`buff_unavailable`), щоб 8b могла додати власні перевірки (заміні потрібні запасні запитання), не зламавши жодної збереженої вікторини. Коди помилок `not_allowed`, `buff_used`, `buff_busy`, `buff_unfit`; події `player:buff`, `player:retry`.
- **Стан (`engine`).** Баф живе в журналі: `Play.buffs?: Record<string, BuffPlay>` — баф кожного гравця на цьому запитанні. Використані за гру — похідні з журналу (`buffsUsed`), окремого «набору» в стані немає: доступні = `allowedBuffs − buffsUsed`. `AnswerRecord.buff?: BuffKind` — позначка для історії. Новий файл `packages/engine/src/buffs.ts` за зразком `debuffs.ts` (той самий коментар про безпечний цикл імпортів з `game.ts`).
- **Особистий час — загальний механізм для 8a й 8b.** `Play.overtime?: Record<string, number>` — додатковий час гравця в мс **понад спільний `endsAt`**. Бо він відносний, пауза, «±15 с» і утримання годинника на полі зсувають особистий кінець разом зі спільним без окремого коду. Додатковий час пише `grantOvertime(state, id, 30_000)`; заміна запитання в 8b запише `max(0, now + 20_000 − endsAt)` тією самою функцією. Нові функції `timing.ts`: `overtimeOf`, `deadlineOf`, `timeOverFor`, `closesAt`, `trimOvertime`, `grantOvertime`; `tick`, `autoLock`, `nextDeadline`, `pause`, `submitAnswer` і `submitBoardAnswer` переходять на них.
- **Бали.** Єдина точка — `withRecord`: кожен запис поточного запитання проходить `applyBuff` (подвійні: додатні бали ×2; щит: від'ємні → 0; позначка `buff`). `override`, `overrideBoard`, `acceptAnswer`, `unansweredIsWrong` і так пишуть через `withRecord` «сирий» запис, тож баф застосовується рівно раз. `withTotals` подвоює бонус серії для `buff === 'double'`. Рекордер пише `record.points`, тож історія й профіль збігаються з таблицею без окремої логіки.
- **Друга спроба.** Стадії в `BuffPlay.retry`: `armed` → (неправильна перша) `again` / (часткова перша) `choice` → `done`. Перша відповідь лежить у `BuffPlay.first`, а не в `answers`, тож `autoLock` чекає на другу сам собою. `lockNow` спершу робить `settleRetries`: незавершена друга спроба зараховує першу відповідь.
- **Зрізи.** `BaseView.buffs` (хто який баф узяв на поточне запитання), `BaseView.buffNotice` (останній узятий баф для сповіщення), `BaseView.overtime` (на кого чекає розкриття); `PlayerView.me.buffs` (ряд кнопок і власний активний баф із прибраними варіантами чи стадією другої спроби), `PlayerView.me.overtime` (особистий таймер); `HostView.allowed`, `HostResponse.buff`.
- **Сервер.** Дві події, колонка `answer.buff` (міграція `0008`), `GameResponse.buff` в історії.
- **Веб.** `apps/web/src/buff-meta.ts` (значки й назви), `apps/web/src/editor/PowersEditor.tsx` (розділ «Бафи й дебафи»), `apps/web/src/screens/Buffs.tsx` (`BuffRow`, `RetryPrompt`, `StageBuffs`, `OvertimeLine`, `BuffToast`); зміни в `PlayerScreen`, `AnswerInput`, `StageScreen`, `HostScreen`, `HostPlayerTools`, `GameHistory`, `LiveNotices`.

**Технології:** TypeScript, zod 4, vitest, Fastify + Socket.IO, Drizzle + PostgreSQL (PGlite у тестах), React + Vite, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-23-buffs-transitions-design.md` — розділ 3 (частина 8a, разом із «Серії й ведучий» і кнопкою «Не чекати»), цілі й не-цілі розділу 2 («бафи в бліц-раундах, на бліц-клітинках поля, у дуелях і у фіналі» — ні; «бафи, які ведучий видає під час гри» — ні; «зміна самих дебафів» — ні), анти-цілі розділу 2 («правильна відповідь потрапляє на телефон раніше, ніж належить», «гра застрягає», «старі вікторини … поводяться інакше», «проста вікторина стала складнішою», «елементи на екрані гравця стрибають, коли хтось інший бере баф»), рішення розділу 8. Зразки: `packages/engine/src/debuffs.ts`, `adjust.ts`, план `2026-10-23-plan-7g-duels.md` (як дуелі лягли в `settings` jsonb), міграція `0007_final_wagers.sql` (план 7e). Частини 7a–7g уже в `main`.

**Рішення плану там, де специфікація мовчить:**
- **Ключі, значки, назви.** `fifty` «½» «50/50»; `double` «×2» «Подвійні бали»; `retry` «↻» «Друга спроба»; `time` «⏱» «Додатковий час»; `shield` «🛡» «Щит»; `audience` «👥» «Запитання в залі»; `hint` «💡» «Підказка ведучого»; `swap` «🔄» «Заміна запитання». Порядок кнопок і прапорців — порядок `BUFF_KINDS`.
- **Редактор показує всі вісім бафів**; три бафи 8b — вимкнені прапорці з позначкою «скоро» (так автор бачить, що буде), «Усі» вмикає лише п'ять готових. Схема їх поки не приймає (`buff_unavailable`).
- **Збереження налаштувань.** Нової колонки немає: `settings` jsonb уже зберігається цілим (`storedSettings` у `quizzes.ts` розгортає `data.settings`). Розділ показує чинні значення (`allowedDebuffs`/`allowedBuffs`); будь-яка зміна в розділі записує обидва масиви явно. Вікторина, у якій розділ не чіпали, зберігається без цих полів. Повтори в масивах — `duplicate_powers`. Чернетка з сесії відновлює масиви, відкидаючи невідомі значення.
- **Набір бафів.** Доступні гравцеві = `allowedBuffs(quiz)` без уже використаних ним у журналі. Гравці приєднуються лише в лобі, а повернення після відключення зберігає id — тож «повний набір пізнішому гравцеві» виконується сам собою. Вилучений гравець зникає з `buffs` і `overtime` усіх запитань.
- **Де бафи діють** (`buffBlock`): етап `question` класичного раунду, крім ланцюжка й сортування (*рішення плану:* вони рахуються окремо в `scoreChain`/`scoreSort`, у 8a бафи на них неактивні з поясненням); звичайна клітинка поля з відповіддю з телефона — лише для вибравшого. Ніде більше: бліц-раунд, бліц-клітинка, усна клітинка, фінал, дуель.
- **Причини неактивної кнопки** (`BuffBlock`, у такому пріоритеті): `used` (уже використано) → `taken` (на це запитання вже взято інший баф) → `answered` (відповідь уже надіслана або чекає на ведучого) → `time` (власний час сплив) → `paused` → `elsewhere` (тут бафів немає: бліц, фінал, ланцюжок, сортування, усна клітинка) → `not_chooser` (на полі відповідає інший) → відповідність бафу запитанню: `unfit_type`, `unfit_options`, `unfit_timer`, `unfit_penalty`, `unfit_manual`. Поза етапом `question` і там, де гравець не відповідає з телефона (`elsewhere`, `not_chooser`), ряду на телефоні немає взагалі; ці причини лишаються для відмов сервера.
- **Перевірки `takeBuff`** по черзі: невідомий гравець → `not_found`; баф не в `allowedBuffs` → `not_allowed`; уже використано → `buff_used`; не `question` або `elsewhere` → `wrong_phase`; пауза → `paused`; `not_chooser` → `not_your_turn`; `answered` → `already_answered`; `time` → `time_over`; `taken` → `buff_busy`; невідповідність → `buff_unfit`.
- **50/50.** single — потрібно ≥ 3 варіанти; лишається `⌈n/2⌉` (разом із правильним), прибирається `n − ⌈n/2⌉` неправильних (3 → 1, 4 → 2, 5 → 2, 6 → 3). multi — потрібно ≥ 2 неправильні; прибирається `max(1, ⌊w/2⌋)` неправильних. *Рішення плану:* single з двома варіантами й multi з одним неправильним — `unfit_options`, бо інакше баф просто показав би відповідь. Вибір: неправильні варіанти в авторському порядку, `k` разів `pool.splice(Math.floor(rng() × pool.length), 1)`. Прибрані варіанти лишаються на телефоні на своєму місці, приглушені й вимкнені (`is-removed`) — список не стискається. Сервер не перевіряє, чи гравець вибрав прибраний варіант (той однаково неправильний). Сцена, ведучий і решта гравців прибраних id не отримують ніколи.
- **Подвійні бали.** `basePoints > 0` → ×2; бонус серії рахується від неподвоєних балів і подвоюється; `basePoints ≤ 0` без змін. На полі множник клітинки вже в `boardPoints`, тож ×2 клітинка + баф = ×4.
- **Щит.** `basePoints < 0` → 0; оцінка лишається `wrong`, тож серія переривається. `unfit_penalty`, якщо `rulesOf(round).penalty === 'none'`. У класиці мовчання не дає запису й мінуса й так; на полі мовчання вибравшого стає записом зі штрафом (`unansweredIsWrong`) — щит його обнуляє.
- **Друга спроба.** Типи single, multi, boolean, text, numeric (`unfit_type` для решти); на полі — лише з `check: 'auto'` (`unfit_manual`). Неправильна перша (`accuracy 0`) → стадія `again`, гравець бачить «Неправильно, ще одна спроба»; друга зараховується, навіть якщо гірша. Часткова перша → стадія `choice`: «Залишити (+N)» записує першу, «Ще спроба» → `again`. *Примітка:* рушій оцінює multi «все або нічого», тож часткова перша в класиці буває лише в числовому запитанні з допуском; на полі — ще й коли правило «частково» ввімкнене. Час другої відповіді рахується від відкриття запитання (бонус швидкості менший). Час сплив або ведучий закрив запитання посеред `again`/`choice` → зараховується перша відповідь. На полі перша відповідь іде через «Прийняти» ведучого: неправильна чи часткова знімає відповідь із клітинки й розморожує годинник (як «Перевибрати»), сцена бачить лише, що відповідь зникла. В історії — лише зарахована відповідь зі значком «↻».
- **Додатковий час.** `grantOvertime(p, 30_000)`; `unfit_timer` без таймера (запитання з відео). Решта після спільного `endsAt` отримують `time_over`, як зараз. Запитання не закривається, доки гравець з бафом не відповість або не скінчиться `endsAt + 30 с`; щойно він відповів після спільного кінця — запитання закривається одразу (`autoLock` з `now`). Відключення не скасовує очікування: вихід — «Не чекати». Пауза посеред додаткового часу зменшує `overtime` на `now − endsAt` (`trimOvertime`), щоб продовження не повернуло вже витрачений час.
- **«Не чекати».** Окремої події немає: на етапі `question`, коли спільний час сплив, а `view.overtime` не порожній, головна кнопка ведучого «Закрити запитання» зветься «Не чекати» й шле наявну `host:lock`. Ненадіслана відповідь — відсутня; незавершена друга спроба — перша.
- **Дебафи.** `setDebuff` для недозволеного виду → `not_allowed` (перевірка після `not_found`). Вікторина в грі — знімок, тож налаштування посеред гри не змінюються.
- **Сповіщення.** `BaseView.buffNotice = { seq, at, nickname, kind }` — останній узятий баф у грі; `seq` — порядковий номер використання в грі (за `at`, потім за порядком гравців). Сповіщення 4 с на сцені, телефонах і в пульті тим самим `useNotice` (узагальненим до `{ seq, at }`), `position: fixed`. Нижче за сповіщення балів ведучого (стовпчиком, як у 7g).
- **Тексти без родів:** «Оля: 50/50», «½ Оля», «Чекаємо: Оля · 0:24», «Неправильно, ще одна спроба», «Частково правильно: +75. Залишити чи ще спроба?», «+30 с — ваш час».
- **Ряд бафів на телефоні.** Під текстом запитання (і картинкою/відео), над полем відповіді; є на всьому етапі `question`, щойно `me.buffs !== null`, з тими самими кнопками в будь-якому стані — нічого не з'являється й не зникає. Кнопка 44 × 44 px; під рядом — рядок пояснень фіксованої висоти (`.buff-why`). *Рішення плану:* узяти баф — **двома дотиками**: перший дотик готової кнопки пише в рядок пояснень «Ще раз — узяти «50/50»» (3 с), другий бере; дотик неактивної кнопки пише причину. Так випадковий дотик не спалює баф, а висота екрана не змінюється.
- **Історія.** Колонка `answer.buff text` (nullable, міграція `0008_answer_buffs`), `GameResponse.buff: BuffKind | null`; значок перед відповіддю з `title` назвою бафу. Статистики бафів у профілі немає.
- **Демо:** «Великий ерудит» отримує `settings.buffs` з усіма п'ятьма бафами (дебафи — типові).

## Глобальні обмеження

- Старі вікторини (без `settings.debuffs`/`settings.buffs`), чернетки, знімки ігор, історія й профіль поводяться як зараз: усі дебафи, жодного бафу, нових рядків на екранах немає. Міграція `0008` лише додає nullable-колонку.
- Проста вікторина створюється так само: розділ «Бафи й дебафи» згорнутий.
- Рушій чистий: `now` і `rng` — аргументи. Бали лише цілі.
- Анти-ціль «спойлер»: до розкриття жоден зріз сцени чи гравця не містить `correctId`/`correctIds`/`correct`/`accepted`; прибрані 50/50 варіанти є лише в зрізі того, хто взяв баф, і серед них ніколи немає правильного; перша відповідь другої спроби — лише в зрізі самого гравця.
- Анти-ціль «гра застрягає»: додатковий час завжди скінчиться за `endsAt + 30 с`, а ведучий може «Не чекати», поставити паузу, завершити раунд чи гру.
- Анти-ціль «стрибки»: ряд бафів і рядок пояснень фіксованої висоти; сповіщення й значки чужих бафів на телефоні — `position: fixed`; прибрані варіанти лишаються на місці.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`. Нові кольори — токени в `:root` у `styles.css` (`--buff-accent`, `--buff-used`, `--buff-active`). Тема лише темна. Поля введення — у `label.field`, шрифт ≥ 16 px. Нові класи мають префікс `buff-` (крім `is-removed`).
- Розкладка працює на ширині 375 px (і 360 px) без горизонтальної прокрутки. Анімації (спалах активної кнопки) — лише за `prefers-reduced-motion: no-preference`.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2` (саме `--maxWorkers=2`: паралельні робітники PGlite падають на цій машині; якщо PGlite все одно падає з браком пам'яті — запускати окремо `pnpm vitest run --maxWorkers=2 packages`, `… apps/server`, `… apps/web`).
- Наскрізні тести: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Кадри — з `E2E_SHOTS=1` у `apps/server/e2e/artifacts/shots`.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (проєкт тестовий).

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/game.ts` | `BUFF_KINDS`, `READY_BUFFS`, `BuffKind`, `RetryStage`, `BuffBlock`, коди помилок | 1 |
| `packages/shared/src/quiz.ts` | `settings.debuffs?`, `settings.buffs?`, `allowedDebuffs`, `allowedBuffs`, перевірки | 1 |
| `packages/shared/src/events.ts` | `buffSchema`, `retrySchema`, дві події | 1 |
| `apps/web/src/i18n.ts` | `err_not_allowed`, `err_buff_*` | 1 |
| `packages/engine/src/buffs.ts` (новий), `game.ts`, `debuffs.ts`, `index.ts`, `testing/fixtures.ts`, `testing/buffs.ts` (новий) | стан бафу, `takeBuff`, 50/50, подвійні, щит, вилучення, дозвіл дебафів | 2 |
| `packages/engine/src/timing.ts`, `buffs.ts`, `game.ts`, `blitz.ts` (`nextDeadline`) | друга спроба, особистий час, «Не чекати» | 3 |
| `packages/shared/src/views.ts`, `packages/engine/src/views.ts` | `buffs`, `buffNotice`, `overtime`, `me.buffs`, `me.overtime`, `allowed`, `HostResponse.buff` | 4 |
| веб-фабрики зрізів у `apps/web/src/**/*.test.tsx` | механічні нові поля | 4 |
| `apps/server/src/socket.ts`, `rooms/manager.ts`, `recorder.ts`, `history.ts`, `db/schema.ts`, `drizzle/0008_answer_buffs.sql` (+ `meta`), `packages/shared/src/history.ts`, `scripts/erudite-quiz.ts` | події, колонка, історія, демо | 5 |
| `apps/web/src/buff-meta.ts` (новий), `apps/web/src/editor/PowersEditor.tsx` (новий), `QuizEditor.tsx`, `draft.ts`, `draft-storage.ts` | розділ «Бафи й дебафи» | 6 |
| `apps/web/src/screens/Buffs.tsx` (новий), `PlayerScreen.tsx`, `AnswerInput.tsx`, `apps/web/src/live/LiveNotices.tsx` | ряд бафів, 50/50 на місці, друга спроба, особистий таймер, сповіщення | 7 |
| `apps/web/src/screens/StageScreen.tsx`, `HostScreen.tsx`, `HostPlayerTools.tsx`, `apps/web/src/pages/GameHistory.tsx` | значки сцени, «Чекаємо», «Не чекати», дозволені дебафи, значки в історії | 8 |
| `apps/web/src/i18n.ts`, `apps/web/src/styles.css` | тексти й стилі веб-задач | 6–8 |
| `apps/server/e2e/full-game.e2e.ts` | наскрізний сценарій 8a | 9 |

## Порядок збирання

- Задача 1 (схема) — основа. Нові коди помилок одразу отримують тексти `err_*` (їх вимагає `errorText`), тож `pnpm typecheck` зелений.
- Задача 2 (рушій: бафи без часу) — на 1. Задача 3 (друга спроба й особистий час) — на 2. Задача 4 (зрізи) — на 2–3; нові обов'язкові поля зрізів закриваються механічними значеннями (`buffs: []`, `buffNotice: null`, `overtime: []`, `me.buffs: null`, `me.overtime: null`, `allowed: { debuffs: [...DEBUFF_KINDS], buffs: [] }`, `buff: null`) у веб-фабриках у тій самій задачі.
- Задача 5 (сервер, історія, демо) — на 1–4. Задача 6 (редактор) — на 1. Задачі 7 і 8 (екрани) — на 4 і 5. Задача 9 (e2e) — остання.
- Наявні тести не змінюють очікувань, окрім механічних полів у веб-фабриках (задача 4) і `makeQuiz` у фікстурах рушія, який тепер передає `debuffs`/`buffs` у налаштування вікторини, а не в раунд (задача 2).

## На що дивитися рецензентові

1. **Відповідь не витікає.** Прибрані 50/50 варіанти — лише в зрізі власника й лише неправильні; ні сцена, ні ведучий, ні сусіди їх не мають; перша відповідь другої спроби та її бали — лише у власника. Тести: задача 2, `50/50 removes half of the wrong options at random and never the right one`; задача 4, `50/50 removed options reach only the player who took it`, `retry shows the first answer to its owner only`.
2. **Бали сходяться скрізь.** Подвійні й щит застосовуються в `withRecord` рівно раз, зокрема після оцінки ведучого на розкритті; бонус серії подвоюється коректно (і відсотковий, і фіксований); щит серію обриває; `answer.points` у базі дорівнює запису, `participant.score` — таблиці. Тести: задача 2, `double points…`, `shield…`, `a host override keeps the buff`; задача 3, `a correct second try continues the streak`; задача 5, `buffed points are saved as on the scoreboard, with the buff`.
3. **Особистий час не ламає годинник.** Решта отримують `time_over` на спільному кінці; розкриття чекає; відповідь з бафом після спільного кінця закриває запитання одразу; `nextDeadline` веде до особистого кінця; пауза не повертає витрачений час; «±15 с» зсуває обидва кінці; «Не чекати» закриває. Тести: задача 3, `extra time…`, `the reveal waits…`, `a pause in overtime…`, `the host does not wait…`; задача 5, `the scheduler closes the question at the personal deadline`.
4. **Друга спроба не застрягає.** `again`/`choice` до кінця часу, закриття ведучим зараховує першу; на полі — через «Прийняти» з розмороженим годинником; заборонені типи й ручна перевірка — `buff_unfit`. Тести: задача 3, `second try…`.
5. **Старі вікторини й проста вікторина.** Вікторина без полів — усі дебафи, жодного бафу, `me.buffs === null`, жодного нового рядка на екранах; збереження без змін у розділі не додає полів; заборонений дебаф відхиляється сервером і зникає з пульта. Тести: задача 1, `a quiz without power settings…`; задача 4, `a quiz without buffs changes nothing on the screens`; задача 5, `power settings survive save and load…`; задача 8, `the host sees only allowed debuffs…`.
6. **Нічого не стрибає.** Ряд бафів і рядок пояснень мають сталу висоту в усіх станах; чужий баф на телефоні — лише фіксоване сповіщення; прибрані варіанти на місці. Тести: задача 7, `the buff row keeps its size…`; задача 9, вимір `y` запитання й ряду на телефоні Петра до й після бафу Олі.

---

### Задача 1. Схема: бафи й дебафи в налаштуваннях, коди помилок, події

**Files:**
- Modify: `packages/shared/src/game.ts` (`BUFF_KINDS`, `READY_BUFFS`, `BuffKind`, `RetryStage`, `BuffBlock`, `ErrorCode`)
- Modify: `packages/shared/src/quiz.ts` (`quizSettingsSchema`, `allowedDebuffs`, `allowedBuffs`, `quizSchema.superRefine`)
- Modify: `packages/shared/src/events.ts` (`buffSchema`, `retrySchema`, `ClientToServerEvents`)
- Modify: `apps/web/src/i18n.ts`
- Test: `packages/shared/src/quiz.test.ts`

**Interfaces:**
- Produces (`shared`):
  ```ts
  // game.ts
  /** Бафи: гравець бере сам на своєму телефоні, по одному кожного дозволеного на гру. */
  export const BUFF_KINDS = ['fifty', 'double', 'retry', 'time', 'shield', 'audience', 'hint', 'swap'] as const;
  export type BuffKind = (typeof BUFF_KINDS)[number];
  /** Бафи, які вже працюють; решту редактор показує з позначкою «скоро», схема їх не приймає. */
  export const READY_BUFFS: readonly BuffKind[] = ['fifty', 'double', 'retry', 'time', 'shield'];
  /** armed — чекає першої відповіді; again — друга спроба відкрита; choice — перша часткова, гравець вибирає; done. */
  export type RetryStage = 'armed' | 'again' | 'choice' | 'done';
  /** Чому кнопку бафу зараз не натиснути. */
  export type BuffBlock =
    | 'used' | 'taken' | 'answered' | 'time' | 'paused' | 'elsewhere' | 'not_chooser'
    | 'unfit_type' | 'unfit_options' | 'unfit_timer' | 'unfit_penalty' | 'unfit_manual';
  // ErrorCode: | 'not_allowed' | 'buff_used' | 'buff_busy' | 'buff_unfit'
  // quiz.ts
  export const quizSettingsSchema = z.object({
    leaderboard: z.enum(['each', 'end']),
    /** Дозволені дебафи; немає поля — усі шість (старі вікторини). */
    debuffs: z.array(z.enum(DEBUFF_KINDS)).max(DEBUFF_KINDS.length).optional(),
    /** Дозволені бафи; немає поля — жодного. */
    buffs: z.array(z.enum(BUFF_KINDS)).max(BUFF_KINDS.length).optional(),
  });
  /** Дозволені дебафи в порядку DEBUFF_KINDS. */
  export function allowedDebuffs(quiz: Pick<Quiz, 'settings'>): DebuffKind[];
  /** Дозволені готові бафи в порядку BUFF_KINDS. */
  export function allowedBuffs(quiz: Pick<Quiz, 'settings'>): BuffKind[];
  // events.ts
  export const buffSchema = z.object({ kind: z.enum(BUFF_KINDS) });
  /** Друга спроба після часткової першої: keep — залишити першу, інакше ще спроба. */
  export const retrySchema = z.object({ keep: z.boolean() });
  'player:buff': (payload: z.infer<typeof buffSchema>, ack: Ack) => void;    // узяти баф на поточне запитання
  'player:retry': (payload: z.infer<typeof retrySchema>, ack: Ack) => void;  // вибір після часткової першої відповіді
  ```
- `quizSchema.superRefine`: повтор у `settings.debuffs` або `settings.buffs` → `duplicate_powers`; баф не з `READY_BUFFS` → `buff_unavailable`. `DEFAULT_SETTINGS` не змінюється (`{ leaderboard: 'each' }`).
- Тексти:
  ```ts
  err_not_allowed: 'У цій вікторині це вимкнено.',
  err_buff_used: 'Цей баф уже використано.',
  err_buff_busy: 'На це запитання баф уже взято.',
  err_buff_unfit: 'Цей баф тут не діє.',
  ```

- [ ] **Step 1: Write the failing tests** у `quiz.test.ts` (наявні `valid`, `baseQuiz`, `issues`; новий `withPowers(settings)` — `{ ...baseQuiz, settings: { ...baseQuiz.settings, ...settings } }`):
  ```ts
  describe('buffs and debuffs in the settings', () => {
    it('a quiz without power settings allows every debuff and no buff', () => {
      const parsed = quizSchema.parse(baseQuiz);
      expect(parsed.settings.debuffs).toBeUndefined();
      expect(parsed.settings.buffs).toBeUndefined();
      expect(allowedDebuffs(parsed)).toEqual([...DEBUFF_KINDS]);
      expect(allowedBuffs(parsed)).toEqual([]);
    });
    it('keeps chosen debuffs and buffs in the canonical order', () => {
      const parsed = quizSchema.parse(withPowers({ debuffs: ['mud', 'fog'], buffs: ['shield', 'fifty'] }));
      expect(allowedDebuffs(parsed)).toEqual(['fog', 'mud']);
      expect(allowedBuffs(parsed)).toEqual(['fifty', 'shield']);
      expect(allowedDebuffs(quizSchema.parse(withPowers({ debuffs: [] })))).toEqual([]);
    });
    it('refuses unknown kinds, repeats and buffs that are not ready yet', () => {
      expect(valid(quizSchema, withPowers({ debuffs: ['rain'] }))).toBe(false);
      expect(issues(withPowers({ buffs: ['double', 'double'] }))).toContain('duplicate_powers');
      expect(issues(withPowers({ debuffs: ['fog', 'fog'] }))).toContain('duplicate_powers');
      expect(issues(withPowers({ buffs: ['swap'] }))).toContain('buff_unavailable');
      expect(issues(withPowers({ buffs: ['audience', 'hint'] }))).toContain('buff_unavailable');
      expect(valid(quizSchema, withPowers({ buffs: [...READY_BUFFS] }))).toBe(true);
    });
    it('buff events check their payloads', () => {
      expect(valid(buffSchema, { kind: 'fifty' })).toBe(true);
      expect(valid(buffSchema, { kind: 'magic' })).toBe(false);
      expect(valid(retrySchema, { keep: true })).toBe(true);
      expect(valid(retrySchema, { keep: 'yes' })).toBe(false);
    });
    it('all eight buff kinds are known, five are ready', () => {
      expect(BUFF_KINDS).toHaveLength(8);
      expect(READY_BUFFS).toEqual(['fifty', 'double', 'retry', 'time', 'shield']);
    });
  });
  ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared`. Очікується FAIL: немає `BUFF_KINDS`, `allowedDebuffs`, полів налаштувань.

- [ ] **Step 3: Implement** усе з Interfaces і тексти в `i18n.ts`. `quiz.ts` імпортує `DEBUFF_KINDS`, `BUFF_KINDS`, `READY_BUFFS` з `./game` (`game.ts` нічого не імпортує, циклу немає).

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/web/src/i18n.ts
git commit -m "feat(shared): buffs and debuffs in the quiz settings — eight buff kinds, five ready, defaults keep old quizzes as they were; buff events and error codes"
```

---

### Задача 2. Рушій: узяти баф, 50/50, подвійні бали, щит, дозволені дебафи

**Files:**
- Create: `packages/engine/src/buffs.ts`, `packages/engine/src/game.buffs.test.ts`, `packages/engine/src/testing/buffs.ts`
- Modify: `packages/engine/src/game.ts` (`AnswerRecord.buff?`, `Play.buffs?`, `Play.overtime?`, `withRecord`, `withTotals`, `removePlayer`), `packages/engine/src/debuffs.ts` (`setDebuff`), `packages/engine/src/index.ts` (`export * from './buffs'`), `packages/engine/src/testing/fixtures.ts` (`makeQuiz` передає `debuffs`/`buffs` у налаштування; `single4`)

**Interfaces:**
- Consumes: `BuffKind`, `BuffBlock`, `RetryStage`, `allowedBuffs`, `allowedDebuffs`, коди помилок (задача 1).
- Produces (`engine`):
  ```ts
  // game.ts
  // AnswerRecord:
  /** Баф, узятий на це запитання; бали вже з ним. Немає — без бафу. */ buff?: BuffKind;
  // Play:
  /** Бафи гравців на цьому запитанні; гравця тут немає, поки він не брав бафу. */ buffs?: Record<string, BuffPlay>;
  /** Особистий додатковий час понад спільний endsAt, мс (додатковий час; у 8b — заміна запитання). */ overtime?: Record<string, number>;
  // buffs.ts
  export interface BuffPlay {
    kind: BuffKind;
    /** Мить, коли баф узято (час сервера). */
    at: number;
    /** fifty: прибрані неправильні варіанти; інакше []. */
    removed: string[];
    /** retry: стадія; null для інших бафів. */
    retry: RetryStage | null;
    /** retry: перша відповідь (неправильна або часткова), поки друга не зарахована; інакше null. */
    first: AnswerRecord | null;
  }
  /** Баф гравця на запитанні; null — немає. */
  export function buffOf(play: Play | undefined, playerId: string): BuffPlay | null;
  /** Бафи, які гравець уже використав у грі, у порядку журналу. */
  export function buffsUsed(state: GameState, playerId: string): BuffKind[];
  /** Чому гравець не може взяти цей баф зараз (пріоритет — «Рішення плану»); null — можна. Дозвіл вікторини не перевіряє. */
  export function buffBlock(state: GameState, playerId: string, kind: BuffKind): BuffBlock | null;
  /** Узяти баф на поточне запитання; перевірки — «Рішення плану». fifty тягне rng; time — grantOvertime (задача 3). */
  export function takeBuff(state: GameState, playerId: string, kind: BuffKind, now: number, rng: Rng): Result;
  /** Скільки варіантів прибирає 50/50; 0 — не діє (unfit_options або не той тип). */
  export function fiftyCount(question: Question): number;
  /** Для withRecord: подвійні (+ ×2) і щит (− → 0), позначка buff. Вхід — запис без бафу. */
  export function applyBuff(record: AnswerRecord, buff: BuffPlay | null): AnswerRecord;
  // testing/fixtures.ts
  /** single на 4 варіанти: a Львів, b Київ (правильний), c Одеса, d Харків. */
  export const single4: Question;
  // testing/buffs.ts
  export const T0 = 1_000_000;
  /** Класика «Розминка» (штраф minus, без бонусу швидкості, без серій): q1 single4, q2 numeric 2061 ± 100, q3 bool, q4 order, q5 multi; усі 1000 балів, 20 с; settings.buffs — усі п'ять готових, якщо patch не каже інакше. */
  export function buffQuiz(patch?: Partial<QuizSettings> & RoundOptions): Quiz;
  /** Оля p1, Петро p2, Іра p3; відкрито q1 о T0 (rng () => 0, порядок варіантів авторський). */
  export function toBuffQuestion(patch?: Partial<QuizSettings> & RoundOptions): GameState;
  /** Поле 3 × 3 (penalty з patch, check auto, з телефона), у c1 друга клітинка x2 на single4; Оля вибирає її о T0. */
  export function toBuffCell(rules?: Partial<RoundRules>, check?: 'auto' | 'manual'): GameState;
  ```
- `withRecord(state, playerId, record)` → `applyBuff(record, buffOf(play, playerId))` перед записом. `withTotals`: для `record.buff === 'double'` бонус = `2 × streakBonus(streakBase(…) / 2, streak.bonus)`, інакше як зараз.
- `removePlayer`: з кожного `play` прибрати `buffs[id]` і `overtime[id]` (як `chain`/`sort`).
- `setDebuff`: після `not_found` — `!allowedDebuffs(state.quiz).includes(kind)` → `not_allowed`.
- `makeQuiz(questions, { leaderboard, debuffs, buffs, ...round })` → `makeRoundsQuiz([...], { leaderboard?, debuffs?, buffs? })` (лише наявні ключі).

- [ ] **Step 1: Write the failing tests** у `game.buffs.test.ts` (`rng0 = () => 0`, `rng9 = () => 0.99`, `answer(s, id, a, at)` = `must(submitAnswer(s, id, a, at))`, `points(s, id)` = рахунок гравця):
  ```ts
  it('the settings decide which buffs exist; each is used once per game', () => {
    expect(takeBuff(toBuffQuestion({ buffs: [] }), 'p1', 'double', T0, rng0)).toEqual({ ok: false, error: 'not_allowed' });
    expect(takeBuff(toBuffQuestion({ buffs: ['shield'] }), 'p1', 'double', T0, rng0)).toEqual({ ok: false, error: 'not_allowed' });
    let s = must(takeBuff(toBuffQuestion(), 'p1', 'double', T0 + 1000, rng0));
    expect(s.plays[0].buffs?.p1).toEqual({ kind: 'double', at: T0 + 1000, removed: [], retry: null, first: null });
    s = must(next(must(lock(s)), T0 + 30_000, rng0)); // reveal
    s = must(next(s, T0 + 31_000, rng0));             // q2
    expect(takeBuff(s, 'p1', 'double', T0 + 32_000, rng0)).toEqual({ ok: false, error: 'buff_used' });
    expect(buffsUsed(s, 'p1')).toEqual(['double']);
    expect(takeBuff(s, 'p9', 'double', T0, rng0)).toEqual({ ok: false, error: 'not_found' });
  });
  it('one buff per question, only before answering, while the question is open', () => {
    let s = must(takeBuff(toBuffQuestion(), 'p1', 'double', T0, rng0));
    expect(takeBuff(s, 'p1', 'shield', T0, rng0)).toEqual({ ok: false, error: 'buff_busy' });
    s = answer(s, 'p2', { type: 'single', optionId: 'b' }, T0 + 1000);
    expect(takeBuff(s, 'p2', 'double', T0 + 2000, rng0)).toEqual({ ok: false, error: 'already_answered' });
    expect(takeBuff(must(pause(s, T0 + 3000)), 'p3', 'double', T0 + 3000, rng0)).toEqual({ ok: false, error: 'paused' });
    expect(takeBuff(s, 'p3', 'double', T0 + 20_001, rng0)).toEqual({ ok: false, error: 'time_over' });
    expect(takeBuff(must(lock(s)), 'p3', 'double', T0 + 3000, rng0)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(buffBlock(s, 'p1', 'shield')).toBe('taken');
    expect(buffBlock(s, 'p2', 'shield')).toBe('answered');
  });
  it('50/50 removes half of the wrong options at random and never the right one', () => {
    // single4 (b правильний): rng0 → removed ['a', 'c']; rng9 → ['d', 'c']; у жодному випадку немає 'b'
    // fiftyCount: single на 3 варіанти → 1; на 5 → 2; на 6 → 3; на 2 → 0; multi (a, c правильні; b, d неправильні) → 1;
    //   multi з одним неправильним → 0; bool, text, numeric, order → 0
    // q3 (bool) → takeBuff 'fifty' → 'buff_unfit', buffBlock → 'unfit_type'; single на 2 варіанти → 'unfit_options'
    // q5 multi з rng0 → removed ['b']
  });
  it('double points: the gain doubles, with the cell multiplier and the streak bonus; a minus does not', () => {
    // q1: p1 бере double, відповідає 'b' → record { basePoints 2000, points 2000, buff 'double' }; p2 без бафу 'b' → 1000
    // p3 бере double, відповідає 'a' (неправильно, штраф minus) → points −1000 (не −2000)
    // серія: buffQuiz({ rules: { ...DEFAULT_RULES, streak: { length: 2, bonus: { kind: 'fixed', value: 100 } } } });
    //   q1 правильно без бафу, q2 правильно з double → streakBonus 200, points 2200;
    //   те саме з bonus percent 10 → streakBonus 200 (10 % від 1000, ×2), points 2200
    // поле: toBuffCell() — x2 клітинка 1000 балів, Оля бере double, відповідає правильно, ведучий «Прийняти» → points 4000
  });
  it('shield: a wrong or missing answer costs nothing, but breaks the streak; useless without a minus', () => {
    // p1 бере shield, відповідає 'a' → record { grade 'wrong', points 0, buff 'shield' }; рахунок 0
    // серія з length 2: q1 правильно, q2 shield + неправильно → streak 0 після q2
    // toBuffCell({ penalty: 'minus' }): Оля бере shield, не відповідає, lock → next (reveal) → запис 'wrong', points 0
    // buffQuiz({ rules: DEFAULT_RULES }) (без мінуса) → takeBuff 'shield' → 'buff_unfit', buffBlock → 'unfit_penalty'
  });
  it('a host override keeps the buff', () => {
    // p1 double, відповідь 'a' (неправильно) → reveal → override(p1, 'correct') → points 2000, buff 'double'
    // p3 shield, відповідь 'b' → reveal → override(p3, 'wrong') → points 0
  });
  it('buffs work only where the player answers from the phone', () => {
    // бліц-раунд → takeBuff → 'wrong_phase', buffBlock 'elsewhere'; фінал (етап question) → 'wrong_phase'
    // ланцюжок і сортування в класиці → 'wrong_phase' ('elsewhere')
    // поле: бліц-клітинка і усна клітинка → 'wrong_phase'; на звичайній клітинці Петро (не вибравший) → 'not_your_turn' ('not_chooser')
    // поле: після відповіді Олі, що чекає «Прийняти» → 'already_answered'
  });
  it('a kicked player leaves no buffs behind', () => {
    // p1 бере fifty → removePlayer(p1) → plays[0].buffs не містить p1; buffsUsed(s, 'p1') → []
  });
  it('debuffs the quiz does not allow are refused', () => {
    // buffQuiz({ debuffs: ['fog'] }): setDebuff(p1, 'shake') → 'not_allowed'; setDebuff(p1, 'fog') → ok
    // buffQuiz({ debuffs: [] }): setDebuff(p1, 'fog') → 'not_allowed'; вікторина без поля → усі шість ok
  });
  ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL: немає `buffs.ts`.

- [ ] **Step 3: Implement** усе з Interfaces за правилами «Рішень плану» (де діють, причини, перевірки, 50/50, подвійні, щит). Гілку `time` і `retry` у `takeBuff` у цій задачі зробити так: `time` → `unfit_timer` без таймера, інакше запис бафу (сам час — задача 3); `retry` → `unfit_type`/`unfit_manual` за правилами, інакше запис зі стадією `armed`. `buffBlock` не дивиться в `allowedBuffs` (кнопок недозволених бафів на телефоні немає; перевірку `not_allowed` робить `takeBuff`).

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): buffs — taken by the player once per game, one per question; 50/50 removes wrong options only, double points double the gain and the streak bonus, a shield cancels the minus; disallowed debuffs are refused"
```

---

### Задача 3. Рушій: друга спроба, додатковий час, «Не чекати»

**Files:**
- Modify: `packages/engine/src/timing.ts` (особистий час), `packages/engine/src/buffs.ts` (`takeBuff` для `time`, `chooseRetry`, `settleRetries`), `packages/engine/src/game.ts` (`submitAnswer`, `submitBoardAnswer`, `acceptAnswer`, `autoLock`, `lockNow`, `tick`, `pause`), `packages/engine/src/blitz.ts` (`nextDeadline`)
- Create: `packages/engine/src/game.buffs-time.test.ts`

**Interfaces:**
- Consumes: усе з задачі 2.
- Produces:
  ```ts
  // timing.ts
  /** Додатковий час гравця понад спільний кінець, мс; 0 — немає. */
  export function overtimeOf(play: Play, playerId: string): number;
  /** Особистий кінець: endsAt + overtimeOf; null — немає endsAt (пауза, без таймера, поза question). */
  export function deadlineOf(state: GameState, play: Play, playerId: string): number | null;
  /** Як timeOver, але з особистим кінцем гравця. */
  export function timeOverFor(state: GameState, play: Play, playerId: string, clock: number): boolean;
  /** Коли запитання закривається за часом: найпізніше з endsAt і особистих кінців гравців у грі без запису; null — немає endsAt. */
  export function closesAt(state: GameState): number | null;
  /** Записує гравцю додатковий час на поточне запитання (більший із наявного й ms). */
  export function grantOvertime(state: GameState, playerId: string, ms: number): GameState;
  /** Пауза посеред додаткового часу: кожен overtime поточного запитання зменшується на max(0, now − endsAt), не нижче 0. */
  export function trimOvertime(state: GameState, now: number): GameState;
  // buffs.ts
  /** Після часткової першої відповіді (стадія choice): keep — записати першу; інакше стадія again. Інакше wrong_phase. */
  export function chooseRetry(state: GameState, playerId: string, keep: boolean, now: number): Result;
  /** Для lockNow: у кого стадія again або choice і немає запису — перша відповідь стає записом. */
  export function settleRetries(state: GameState): GameState;
  /** Секунд додає «Додатковий час». */
  export const EXTRA_TIME_MS = 30_000;
  ```
- Правила:
  - `takeBuff` `time` → `grantOvertime(state, playerId, EXTRA_TIME_MS)`.
  - `submitAnswer` (класика): `timeOver` → `timeOverFor(…, playerId, now)`; після обчислення запису — якщо в гравця `retry` на стадії `armed` і `grade !== 'correct'`: `first = record` (сирий), стадія `again` (accuracy 0) або `choice` (часткова), запису в `answers` немає, `ok(state)`; на стадії `choice` → `wrong_phase`; на стадії `again` — запис як завжди, стадія `done`; у решті випадків стадія `armed` → `done`. Наприкінці `autoLock(…, now)`.
  - `submitBoardAnswer`: `timeOverFor`; стадія `choice` → `wrong_phase`.
  - `acceptAnswer` (поле, auto): якщо `retry` на `armed` і `accuracy < 1` — `first = record`, стадія `again`/`choice`, `board.answer = null`, `thaw(…, now)` + `watchAway`, як у `repick`; без розкриття. Стадія `again` — звичайне розкриття, стадія `done`.
  - `chooseRetry` keep: класика — `autoLock(withRecord(first), now)`; поле — `revealNow(withRecord(first))`. Перевірки по черзі: не `question` → `wrong_phase`; пауза → `paused`; немає бафу `retry` на стадії `choice` → `wrong_phase`; `timeOverFor` → `time_over`.
  - `autoLock(state, now)`: після перевірки етапу й паузи, до гілок бліцу/поля: `closes = closesAt(state)`; `now !== null && closes !== null && now >= closes` → `lockNow`.
  - `lockNow`: `settleRetries` першим кроком ланцюжка.
  - `tick`: `expired` — `now >= closesAt(running)` замість `now >= endsAt`.
  - `nextDeadline` (етап `question`): у `times` замість `state.endsAt` — `closesAt(state)`.
  - `pause` (етап `question` з `endsAt`): спершу `trimOvertime(state, now)`.
  - Ведучий «Не чекати» — наявний `lock`; окремої функції немає.

- [ ] **Step 1: Write the failing tests** у `game.buffs-time.test.ts` (хелпери з `testing/buffs.ts`; `num(v)` = `{ type: 'numeric', value: v }`):
  ```ts
  it('second try: a wrong first answer opens another, the second counts even if worse', () => {
    // q2 numeric (2061 ± 100): p1 бере retry; num(3000) о T0 + 1000 → answers без p1, buffs.p1 { retry 'again', first.grade 'wrong' }
    // num(2061) о T0 + 2000 → record { grade 'correct', buff 'retry', timeMs 2000 }, retry 'done'
    // окремо: q1 single4 — retry, 'a' (неправильно) → again; 'c' (теж неправильно) → record 'wrong', −1000 (штраф minus)
    // перша правильна одразу → record 'correct', buff 'retry', retry 'done'
  });
  it('second try: a partial first answer lets the player keep it or try again', () => {
    // q2: retry, num(2111) → стадія 'choice', first.accuracy 0.75; submitAnswer → 'wrong_phase'
    // chooseRetry(keep) → record { accuracy 0.75, points 750, buff 'retry' }, retry 'done'
    // інша гра: chooseRetry(!keep) → 'again'; num(3000) → record 'wrong' (друга зараховується, навіть гірша)
    // chooseRetry без бафу або на стадії again → 'wrong_phase'
  });
  it('second try: time over or a host lock counts the first answer', () => {
    // retry, неправильна перша о T0 + 1000 (again); tick(T0 + 20_000) → locked, record p1 = перша відповідь, buff 'retry'
    // retry, часткова перша (choice); lock → record з першою частковою
  });
  it('the second try waits: the question does not close while the player may answer again', () => {
    // p2, p3 відповіли; p1 retry + неправильна перша → phase 'question' (autoLock не закрив); p1 друга → locked
  });
  it('second try on a board cell goes through «Прийняти»', () => {
    // toBuffCell(): Оля retry, відповідь 'a' → acceptAnswer → phase 'question', board.answer null, heldAt null, retry 'again'
    // відповідь 'b' → acceptAnswer → phase 'reveal', record correct (x2 клітинка: 2000), buff 'retry'
    // toBuffCell({}, 'manual') → takeBuff 'retry' → 'buff_unfit' ('unfit_manual')
  });
  it('second try fits auto-checked single, multi, boolean, text, numeric only', () => {
    // q4 order → 'buff_unfit' ('unfit_type'); match, chain, sort — не дають (chain/sort — 'wrong_phase', бо 'elsewhere')
  });
  it('a correct second try continues the streak', () => {
    // серія length 2, fixed 100: q1 правильно; q2 retry: неправильна, потім правильна → streakBonus 100 на q2
  });
  it('extra time: +30 s for this player only, others are out at the shared end', () => {
    // q1 (20 с): p1 бере time о T0 + 5000 → plays[0].overtime { p1: 30_000 }
    // p2 відповідає о T0 + 20_001 → 'time_over'; p1 о T0 + 49_000 → ok
    // deadlineOf(s, play, 'p1') → T0 + 50_000; deadlineOf(…, 'p2') → T0 + 20_000
  });
  it('the reveal waits for the player with extra time and closes the moment they answer', () => {
    // p2, p3 відповіли до T0 + 20_000; p1 time; tick(T0 + 20_000) → phase 'question'; closesAt → T0 + 50_000
    // p1 відповідає о T0 + 30_000 → phase 'locked'
    // окремо: p1 мовчить → tick(T0 + 50_000) → locked, запису p1 немає
  });
  it('nextDeadline follows the personal deadline', () => {
    // до T0 + 20_000 → T0 + 50_000 (найпізніше закриття; спільний кінець нічого не змінює в стані);
    // після відповіді p1 до спільного кінця → T0 + 20_000
  });
  it('a pause in overtime does not give the time back; ±15 s moves both ends', () => {
    // p1 time; pause о T0 + 30_000 → remainingMs 0, overtime.p1 20_000; resume о T0 + 90_000 → endsAt T0 + 90_000, deadlineOf p1 T0 + 110_000
    // пауза до спільного кінця (T0 + 10_000) → overtime 30_000 без змін
    // adjustTime(+15) о T0 + 5000 → endsAt T0 + 35_000, deadlineOf p1 T0 + 65_000
  });
  it('the host does not wait: lock closes the question, a missing answer is absent', () => {
    // p1 time; p2, p3 відповіли; о T0 + 25_000 lock → locked, recordOf(p1) undefined, рахунок p1 0 (мовчання без мінуса)
  });
  it('extra time on a board cell and without a timer', () => {
    // toBuffCell(): Оля time → відповідь о T0 + 40_000 ок (до T0 + 50_000), чекає «Прийняти»
    // запитання з відео → 'buff_unfit' ('unfit_timer')
  });
  it('a kicked player with extra time no longer holds the question', () => {
    // p1 time; p2, p3 відповіли; removePlayer(p1) о T0 + 25_000 → closesAt === endsAt; tick(T0 + 25_000) → locked
  });
  ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.

- [ ] **Step 3: Implement** за правилами з Interfaces. `removePlayer` уже прибирає `overtime` (задача 2), а `closesAt` дивиться лише на гравців у грі без запису — тож вилучення звільняє розкриття; після вилучення `autoLock` уже викликається.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS (усі наявні тести таймерів, бліцу, ланцюжка й поля — без змін очікувань).

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): a second try with keep-or-retry after a partial answer, extra time as a personal deadline the reveal waits for, a pause that keeps it fair, the host lock as «don't wait»"
```

---

### Задача 4. Зрізи: ряд бафів для гравця, значки й сповіщення для всіх, особистий таймер

**Files:**
- Modify: `packages/shared/src/views.ts` (`PlayerBuffs`, `BuffSlot`, `PlayerActiveBuff`, `BuffNotice`, `OvertimeRow`, `BuffTag`; поля `BaseView`, `PlayerView.me`, `HostView`, `HostResponse`)
- Modify: `packages/engine/src/views.ts` (`base`, `playerView`, `hostView`), `packages/engine/src/buffs.ts` (`lastBuff`, `currentBuffs`)
- Modify (механічно): фабрики зрізів у `apps/web/src/screens/*.test.tsx`, `apps/web/src/live/*.test.tsx` — знайти через `pnpm typecheck`
- Test: `packages/engine/src/views.buffs.test.ts` (новий)

**Interfaces:**
- Consumes: `buffOf`, `buffsUsed`, `buffBlock`, `deadlineOf`, `overtimeOf` (задачі 2–3).
- Produces (`shared/views.ts`):
  ```ts
  /** Хто який баф узяв на поточне запитання — значок біля імені. */
  export interface BuffTag extends BlitzPlayer { kind: BuffKind }
  /** Останній узятий баф у грі, для сповіщення «Оля: 50/50». seq — номер використання в грі. */
  export interface BuffNotice { seq: number; at: number; nickname: string; kind: BuffKind }
  /** Гравець, на якого чекає розкриття: особистий кінець пізніший за спільний, відповіді ще немає. */
  export interface OvertimeRow extends BlitzPlayer {
    /** Особистий кінець (час сервера); null на паузі. */
    deadline: number | null;
    /** На паузі: залишок до особистого кінця; інакше null. */
    remainingMs: number | null;
  }
  export interface BuffSlot {
    kind: BuffKind;
    /** ready — можна взяти; active — узято на це запитання; used — використано раніше; blocked — не зараз. */
    state: 'ready' | 'active' | 'used' | 'blocked';
    /** Причина для blocked (і 'used' для used); null для ready й active. */
    block: BuffBlock | null;
  }
  export interface PlayerActiveBuff {
    kind: BuffKind;
    /** 50/50: прибрані варіанти (лише неправильні); інакше []. */
    removed: string[];
    retry: RetryStage | null;
    /** retry на again/choice: перша відповідь і її бали (choice — часткові); інакше null. */
    first: { answer: Answer | null; points: number } | null;
  }
  export interface PlayerBuffs {
    /** Усі дозволені бафи вікторини в порядку BUFF_KINDS — ряд однакового розміру в усіх станах. */
    slots: BuffSlot[];
    active: PlayerActiveBuff | null;
  }
  // BaseView:
  /** Бафи поточного запитання (question, locked, reveal); інакше []. */ buffs: BuffTag[];
  /** Останній узятий баф у грі; null — не було. */ buffNotice: BuffNotice | null;
  /** На кого чекає розкриття (етап question); інакше []. */ overtime: OvertimeRow[];
  // PlayerView.me:
  /** Ряд бафів; null — у вікторині немає бафів, етап не question або гравець тут не відповідає з телефона. */ buffs: PlayerBuffs | null;
  /** Власний особистий кінець, якщо він пізніший за спільний (етап question); інакше null. */ overtime: { deadline: number | null; remainingMs: number | null } | null;
  // HostView:
  /** Що дозволено у вікторині: пульт показує лише ці дебафи. */ allowed: { debuffs: DebuffKind[]; buffs: BuffKind[] };
  // HostResponse:
  buff: BuffKind | null;
  ```
- `buffs.ts`: `lastBuff(state): BuffNotice | null` (усі `play.buffs` журналу, сортування за `at`, потім за порядком гравців; `seq` — 1-базова позиція останнього); `currentBuffs(state): BuffTag[]` (у порядку гравців).
- Правила зрізу гравця: `me.buffs = null`, якщо `allowedBuffs(quiz)` порожній, етап не `question` або гравець не відповідає на це запитання з телефона (причина `elsewhere` чи `not_chooser`: бліц, фінал, ланцюжок, сортування, усна клітинка, чужа клітинка поля) — там ряду немає взагалі, і з'являтися посеред запитання йому нема з чого. Слот: узятий на це запитання → `active`; у `buffsUsed` → `used` (block `'used'`); `buffBlock` не null → `blocked`; інакше `ready`. `active.first` — лише на стадіях `again`/`choice` (`points` — бали першої з урахуванням штрафу, без бафу). На паузі `remainingMs` для `OvertimeRow` і `me.overtime` = `state.remainingMs + overtimeOf`.

- [ ] **Step 1: Write the failing tests** у `views.buffs.test.ts`:
  ```ts
  it('phones get their own buff row with reasons; the same slots in every state', () => {
    let s = toBuffQuestion();
    const kinds = (id: string) => playerView(s, id)?.me.buffs?.slots.map((slot) => slot.kind);
    expect(kinds('p1')).toEqual(['fifty', 'double', 'retry', 'time', 'shield']);
    expect(playerView(s, 'p1')?.me.buffs?.slots.every((slot) => slot.state === 'ready')).toBe(true);
    s = must(takeBuff(s, 'p1', 'double', T0, rng0));
    expect(playerView(s, 'p1')?.me.buffs?.slots.map((slot) => [slot.kind, slot.state, slot.block])).toEqual([
      ['fifty', 'blocked', 'taken'], ['double', 'active', null], ['retry', 'blocked', 'taken'], ['time', 'blocked', 'taken'], ['shield', 'blocked', 'taken'],
    ]);
    // на q3 (bool) у наступному запитанні: double 'used' (block 'used'), fifty 'blocked' 'unfit_type'
    // після відповіді — усі не-used 'blocked' 'answered'; на етапі locked і reveal me.buffs === null
    // бліц-раунд, фінал і чужа клітинка поля → me.buffs === null; вибравший клітинку — ряд є
  });
  it('50/50 removed options reach only the player who took it, and never the right one', () => {
    // p1 fifty з rng0 → playerView(p1).me.buffs.active.removed ['a', 'c']; не містить 'b'
    // JSON.stringify(stageView), hostView, playerView(p2) не містять '"removed"' з цими id (у них active null / немає поля)
    // жоден зріз сцени й гравців до reveal не містить 'correctId'
  });
  it('the stage and others see who took which buff, not what it did', () => {
    // p1 fifty, p2 double → stageView.buffs [{ p1 Оля fifty }, { p2 Петро double }]; playerView(p3).buffs те саме
    // після next на наступне запитання → buffs []
  });
  it('a buff notice for everyone: «Оля: 50/50»', () => {
    // немає бафів → buffNotice null; p1 fifty о T0 + 1000 → { seq 1, at T0 + 1000, nickname 'Оля', kind 'fifty' }
    // p2 double о T0 + 2000 → seq 2, 'Петро'; removePlayer(p2) → seq 1, 'Оля'
  });
  it('overtime rows for the stage and host; the player gets a personal timer', () => {
    // p1 time → stageView.overtime [{ playerId 'p1', nickname 'Оля', deadline T0 + 50_000, remainingMs null }]
    // playerView(p1).me.overtime { deadline T0 + 50_000, remainingMs null }; playerView(p2).me.overtime null
    // pause о T0 + 10_000 → overtime[0] { deadline null, remainingMs 40_000 }; p1 відповів → overtime []
  });
  it('retry shows the first answer to its owner only', () => {
    // q2: p1 retry, num(2111) → playerView(p1).me.buffs.active { retry 'choice', first { answer num(2111), points 750 } }
    // playerView(p1).me.answer null; hostView.responses без p1; JSON зрізів p2 і сцени не містить '2111'
  });
  it('the host sees allowed debuffs and buffs, and the buff of each response', () => {
    // buffQuiz({ debuffs: ['fog', 'mud'] }) → hostView.allowed { debuffs ['fog', 'mud'], buffs [п'ять] }
    // p1 double + відповідь → hostView.responses[0].buff 'double'; відповідь без бафу → buff null
  });
  it('a quiz without buffs changes nothing on the screens', () => {
    // makeQuiz([single, text]) → playerView.me.buffs null, me.overtime null, stageView.buffs [], buffNotice null, overtime [];
    // hostView.allowed { debuffs: [...DEBUFF_KINDS], buffs: [] }
  });
  ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.

- [ ] **Step 3: Implement** типи й зрізи; механічно додати нові поля у веб-фабрики зрізів (`buffs: []`, `buffNotice: null`, `overtime: []`; у `me` — `buffs: null`, `overtime: null`; у `HostView` — `allowed: { debuffs: [...DEBUFF_KINDS], buffs: [] }`; у `HostResponse` — `buff: null`).

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages apps/web/src
git commit -m "feat(engine): buff views — the player's row with reasons and own effect, who took what for everyone, a buff notice, who the reveal waits for, allowed powers for the host"
```

---

### Задача 5. Сервер: події бафів, колонка `answer.buff`, історія, демо

**Files:**
- Modify: `apps/server/src/socket.ts` (`player:buff`, `player:retry`), `apps/server/src/rooms/manager.ts` (`buff`, `retry`)
- Modify: `apps/server/src/db/schema.ts` (`answer.buff`), `apps/server/src/recorder.ts` (`AnswerRow.buff`), `apps/server/src/history.ts` (`responsesOf` з `buff`), `packages/shared/src/history.ts` (`GameResponse.buff`)
- Create: `apps/server/drizzle/0008_answer_buffs.sql` і оновлені `meta/_journal.json`, `meta/0008_snapshot.json` — `pnpm --filter @quiz/server exec drizzle-kit generate --name answer_buffs`; на початок файлу коментар-заголовок, як у `0007`: `-- Баф, узятий на відповідь (план 8a): значок в історії. Старі ігри мають null.`
- Modify: `apps/server/scripts/erudite-quiz.ts`, `apps/server/scripts/demo-quiz.test.ts`
- Test: `apps/server/src/socket.test.ts`, `apps/server/src/rooms/manager.test.ts`, `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts`, `apps/server/src/quizzes.test.ts`, `apps/server/src/db/schema.test.ts` (наявні тести міграцій мають лишитися зеленими)

**Interfaces:**
- Consumes: схеми й події (задача 1), `takeBuff`, `chooseRetry` (задачі 2–3), `AnswerRecord.buff`.
- Produces:
  ```ts
  // manager.ts
  buff(room: Room, playerId: string, kind: BuffKind): AckResult;    // apply(takeBuff(state, playerId, kind, this.now(), this.rng))
  retry(room: Room, playerId: string, keep: boolean): AckResult;    // apply(chooseRetry(state, playerId, keep, this.now()))
  // db/schema.ts, answer:
  /** Баф, узятий на це запитання; null — без бафу (і в старих іграх). */
  buff: text('buff').$type<BuffKind>(),
  // shared/history.ts, GameResponse:
  /** Баф, з яким дано відповідь; null — без бафу. */
  buff: BuffKind | null;
  ```
- `answerRows`: рядок не-бліцу отримує `buff: record.buff ?? null`; рядки бліцу й штрафу — `null`. `onConflictDoUpdate` оновлює й `buff` (входить у `grade`).
- `erudite-quiz.ts`: `settings: { leaderboard: 'each', buffs: ['fifty', 'double', 'retry', 'time', 'shield'] }`; опис вікторини доповнити реченням «У кожного гравця є п'ять бафів — по одному на гру.»

- [ ] **Step 1: Write the failing tests.**
  - `socket.test.ts`: `buff events are role-checked and validated` — у грі з `settings.buffs` на етапі `question`: `player:buff` `{ kind: 'double' }` від гравця → `ok`; від ведучого й сцени → `forbidden`; `{ kind: 'magic' }` → `invalid_payload`; повторно `{ kind: 'shield' }` → `buff_busy`; `player:retry` `{ keep: 'yes' }` → `invalid_payload`, `{ keep: true }` без стадії вибору → `wrong_phase`.
  - `manager.test.ts`: `the scheduler closes the question at the personal deadline` — `FakeScheduler`: Оля бере `time`, решта відповіли; просунути годинник на `timeLimit × 1000` → `phase 'question'`; ще на 30 000 → `phase 'locked'`. `a player with extra time answering late closes the question at once` — відповідь Олі на 25-й секунді → `phase 'locked'`.
  - `recorder.test.ts`: `buffed points are saved as on the scoreboard, with the buff` — Оля `double` правильно, Петро `shield` неправильно (раунд зі штрафом), Іра без бафу; після закриття в `answer` рядки `{ points: 2000, buff: 'double' }`, `{ points: 0, buff: 'shield', accepted: false }`, `{ buff: null }`; `participant.score` кожного дорівнює рахунку в стані; гра без бафів пише `buff: null`.
  - `history.test.ts`: `responses carry the buff` — `GameDetail.questions[0].responses` має `buff: 'double'` у Олі й `buff: null` у решти; стара гра (рядок без `buff`) → `buff: null`.
  - `quizzes.test.ts`: `power settings survive save and load; an old quiz loads with defaults` — збереження з `settings: { leaderboard: 'each', debuffs: ['fog'], buffs: ['fifty', 'shield'] }` повертає ті самі масиви; рядок вікторини без цих ключів (прямий insert, як старі дані) читається з `settings.debuffs`/`buffs` `undefined`; `buffs: ['swap']` → 400.
  - `demo-quiz.test.ts`: `the erudite quiz gives every player the five ready buffs` — `allowedBuffs(eruditeQuiz)` → `READY_BUFFS`; `quizSchema.safeParse(eruditeQuiz).success`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server`. Очікується FAIL.

- [ ] **Step 3: Implement.** Події — за зразком `player:sort` (`buffSchema`/`retrySchema.safeParse(payloadOf(args))`). Міграцію згенерувати командою з Files, перевірити, що SQL — рівно `ALTER TABLE "answer" ADD COLUMN "buff" text;`. Історія: `buff: answer.buff` у вибірці відповідей і `buff: row.buff ?? null` у `responsesOf`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` (за браком пам'яті PGlite — окремо `pnpm vitest run --maxWorkers=2 apps/server`). Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server packages/shared
git commit -m "feat(server): buff events, the buff of each answer saved and shown in the history, five buffs in the erudite demo"
```

---

### Задача 6. Редактор: розділ «Бафи й дебафи»

**Files:**
- Create: `apps/web/src/buff-meta.ts`, `apps/web/src/editor/PowersEditor.tsx`
- Modify: `apps/web/src/editor/QuizEditor.tsx` (розділ після «Налаштування», перед «Дуелі»), `apps/web/src/editor/draft-storage.ts` (`loadDraft` відновлює масиви), `apps/web/src/editor/draft.ts` (`problemsOf`: `buff_unavailable`, `duplicate_powers` — на випадок підробленої чернетки)
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/editor/QuizEditor.test.tsx`, `apps/web/src/storage.test.ts` (або наявний тест чернетки)

**Interfaces:**
- Consumes: `BUFF_KINDS`, `READY_BUFFS`, `DEBUFF_KINDS`, `allowedDebuffs`, `allowedBuffs` (задача 1); `DEBUFF_ICONS`, `debuffName` з `debuff-meta.ts`.
- Produces:
  ```ts
  // buff-meta.ts
  export const BUFF_ICONS: Record<BuffKind, string>; // fifty '½', double '×2', retry '↻', time '⏱', shield '🛡', audience '👥', hint '💡', swap '🔄'
  export function buffName(kind: BuffKind): string;   // t(`buff_${kind}`)
  // PowersEditor.tsx
  /** Розділ «Бафи й дебафи»: прапорці й «Усі / Жодного»; onChange завжди дає обидва масиви. */
  export function PowersEditor(props: {
    settings: QuizSettings;
    onChange: (powers: { debuffs: DebuffKind[]; buffs: BuffKind[] }) => void;
  }): JSX.Element;
  ```
- Розмітка: `<details className="rules powers">` з `<summary>Бафи й дебафи</summary>`; дві `fieldset.powers-group` з `legend` («Дебафи — ведучий насилає на гравця», «Бафи — гравець бере сам, по одному на гру»), у кожній кнопки «Усі» і «Жодного» (`btn btn-small`), далі `label.powers-item` з `input type="checkbox"`, значком і назвою. Три бафи 8b — `disabled`, з `span.powers-soon` «скоро». Під бафами — `p.meta` з коротким описом кожного ввімкненого бафу (`buffTip_*`).
- Тексти:
  ```ts
  powersTitle: 'Бафи й дебафи',
  powersDebuffs: 'Дебафи — ведучий насилає на гравця',
  powersBuffs: 'Бафи — гравець бере сам, по одному на гру',
  powersAll: 'Усі',
  powersNone: 'Жодного',
  powersSoon: 'скоро',
  buff_fifty: '50/50', buff_double: 'Подвійні бали', buff_retry: 'Друга спроба', buff_time: 'Додатковий час',
  buff_shield: 'Щит', buff_audience: 'Запитання в залі', buff_hint: 'Підказка ведучого', buff_swap: 'Заміна запитання',
  buffTip_fifty: 'прибирає половину неправильних варіантів',
  buffTip_double: 'подвоює бали за запитання (мінус — ні)',
  buffTip_retry: 'після помилки — ще одна спроба',
  buffTip_time: '+30 секунд цьому гравцеві',
  buffTip_shield: 'помилка не знімає балів',
  problemPowers: 'Бафи й дебафи: є недоступний або повторений пункт.',
  ```

- [ ] **Step 1: Write the failing tests** у `QuizEditor.test.tsx` (наявні помічники рендеру й збереження):
  ```ts
  it('a new quiz shows every debuff on and every buff off, and saves without power fields', async () => {
    // відкрити «Бафи й дебафи»: 6 прапорців дебафів checked, 8 бафів unchecked; «Запитання в залі», «Підказка ведучого», «Заміна запитання» disabled з «скоро»
    // «Зберегти» без змін у розділі → тіло запиту: settings без debuffs і buffs
  });
  it('all / none and single boxes write both lists', async () => {
    // бафи «Усі» → buffs [fifty, double, retry, time, shield] (без трьох «скоро»); дебафи «Жодного» → debuffs []
    // зняти «Щит», поставити «Туман» → збереження: debuffs ['fog'], buffs ['fifty', 'double', 'retry', 'time']
  });
  it('an existing quiz shows its stored powers', () => {
    // вікторина з settings { debuffs: ['shake'], buffs: ['time'] } → checked лише «Трясіння» і «Додатковий час»
  });
  ```
  У тесті чернетки: `a draft keeps power settings and drops unknown kinds` — чернетка з `settings: { leaderboard: 'end', debuffs: ['fog', 'rain'], buffs: ['double', 'magic'] }` → `loadDraft` дає `debuffs ['fog']`, `buffs ['double']`; чернетка без полів — без полів; не масив → поле відкидається.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/editor apps/web/src/storage.test.ts`. Очікується FAIL.

- [ ] **Step 3: Implement.** `QuizEditor`: `<PowersEditor settings={settings} onChange={(powers) => setSettings(powers)} />`. Стилі: `.powers-group` — сітка в дві колонки від 480 px, одна — на телефоні; `label.powers-item` ≥ 44 px заввишки.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): the «Бафи й дебафи» editor section — six debuffs and eight buffs with all/none, three marked «скоро», untouched quizzes save as before"
```

---

### Задача 7. Телефон: ряд бафів, 50/50 на місці, друга спроба, особистий таймер, сповіщення

**Files:**
- Create: `apps/web/src/screens/Buffs.tsx`, `apps/web/src/screens/Buffs.test.tsx`
- Modify: `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/screens/AnswerInput.tsx` (`removed?: string[]`), `apps/web/src/live/LiveNotices.tsx` (`useNotice` узагальнено до `{ seq: number; at: number }`, `BuffToast`)
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/PlayerScreen.test.tsx`, `apps/web/src/screens/AnswerInput.test.tsx`, `apps/web/src/live/LiveNotices.test.tsx`

**Interfaces:**
- Consumes: `PlayerBuffs`, `BuffNotice`, `OvertimeRow`, `me.overtime` (задача 4); `BUFF_ICONS`, `buffName` (задача 6); події `player:buff`, `player:retry`.
- Produces:
  ```tsx
  // Buffs.tsx
  /** Ряд кнопок-значків і рядок пояснень фіксованої висоти; перший дотик готової кнопки просить підтвердження, другий (до 3 с) шле player:buff. */
  export function BuffRow(props: { buffs: PlayerBuffs; paused: boolean; send: Send; onError: (m: string | null) => void }): JSX.Element;
  /** Друга спроба: «Неправильно, ще одна спроба» (again) або вибір «Залишити» / «Ще спроба» (choice). */
  export function RetryPrompt(props: { active: PlayerActiveBuff; question: PublicQuestion; send: Send; onError: (m: string | null) => void }): JSX.Element | null;
  /** «Чекаємо: Оля · 0:24» — для сцени й телефонів, коли спільний час сплив. */
  export function OvertimeLine(props: { rows: OvertimeRow[]; offsetMs: number }): JSX.Element | null;
  // LiveNotices.tsx
  export function useNotice<T extends { seq: number; at: number }>(notice: T | null, offsetMs: number): T | null;
  /** «Оля: 50/50»; position: fixed, під сповіщенням балів. */
  export function BuffToast(props: { notice: BuffNotice | null; offsetMs: number }): JSX.Element | null;
  // AnswerInput: removed?: string[] — ці варіанти single/multi лишаються на місці з класом is-removed, disabled, aria-label «… — прибрано»
  ```
- Розміщення в `PlayerScreen` на етапі `question`: `BuffRow` — одразу під `QuestionImage`/`YouTubePlayer`, усередині `DebuffZone`, перед полем відповіді; показується, якщо `me.buffs !== null` (ряд є з першої миті запитання до його закриття). `AnswerInput` отримує `removed={me.buffs?.active?.removed}`. Коли `active.retry` — `again` або `choice`, над полем відповіді `RetryPrompt` (на `choice` замість поля відповіді). `Timer` гравця з `me.overtime` бере `{ endsAt: me.overtime.deadline, remainingMs: me.overtime.remainingMs }` і показує позначку «+30 с — ваш час». У решти після спільного кінця, поки `view.overtime` не порожній, під таймером — `OvertimeLine`. `BuffToast` — поруч з `AdjustmentToast`.
- Тексти:
  ```ts
  buffRowLabel: 'Бафи',
  buffConfirm: 'Ще раз — узяти «{name}»',
  buffTaken: '{icon} {name}: діє на цьому запитанні',
  buffWhy_used: 'Уже використано.',
  buffWhy_taken: 'На це запитання баф уже взято.',
  buffWhy_answered: 'Відповідь уже надіслана.',
  buffWhy_time: 'Час вийшов.',
  buffWhy_paused: 'Гру поставлено на паузу.',
  buffWhy_elsewhere: 'Тут бафи не діють.',
  buffWhy_not_chooser: 'Відповідає інший гравець.',
  buffWhy_unfit_type: '«{name}» не діє на запитання цього типу.',
  buffWhy_unfit_options: 'Замало варіантів для 50/50.',
  buffWhy_unfit_timer: 'У цього запитання немає таймера.',
  buffWhy_unfit_penalty: 'Щит не потрібен: у цьому раунді помилка не коштує балів.',
  buffWhy_unfit_manual: 'Відповідь тут оцінює ведучий.',
  retryAgain: 'Неправильно, ще одна спроба',
  retryChoice: 'Частково правильно: {points}. Залишити чи ще спроба?',
  retryKeep: 'Залишити',
  retryMore: 'Ще спроба',
  overtimeMine: '+30 с — ваш час',
  overtimeWait: 'Чекаємо: {name} · {time}',
  buffNotice: '{name}: {buff}',
  ```

- [ ] **Step 1: Write the failing tests.**
  - `Buffs.test.tsx`:
    ```tsx
    it('the buff row keeps its size in every state', () => {
      // рендер BuffRow для ready / active / used / blocked: однакова кількість кнопок, у .buff-why завжди є елемент (порожній рядок)
      // кнопки blocked і used мають aria-disabled="true", а не disabled (дотик пояснює)
    });
    it('two taps take a buff; one tap explains a blocked one', async () => {
      // перший дотик «½» → у .buff-why «Ще раз — узяти «50/50»», send не викликано; другий → send('player:buff', { kind: 'fifty' })
      // через 3 с після першого дотику підтвердження зникає; дотик «🛡» з block 'unfit_penalty' → текст причини, send не викликано
      // на паузі готові кнопки не шлють нічого
    });
    it('retry prompt: again or keep / more', async () => {
      // again → «Неправильно, ще одна спроба»; choice з points 750 → «Частково правильно: 750…», «Залишити» → send('player:retry', { keep: true }), «Ще спроба» → { keep: false }
    });
    it('overtime line counts down the personal deadline', () => {
      // rows [{ nickname 'Оля', deadline: now + 24_000 }] → «Чекаємо: Оля · 0:24»; [] → нічого
    });
    ```
  - `AnswerInput.test.tsx`: `50/50 keeps removed options in place, faded and disabled` — single на 4 варіанти з `removed ['a', 'c']`: 4 кнопки в тому самому порядку, `a` і `c` з `is-removed` і `disabled`; дотик `b` → `onSubmit({ type: 'single', optionId: 'b' })`; multi з `removed` — прибрані не вибираються.
  - `PlayerScreen.test.tsx`: `the buff row sits under the question for the whole question` (етап question з `me.buffs` → ряд є; `me.buffs null` → ряду немає; етап locked → немає); `another player's buff only shows a fixed notice` (новий `buffNotice` → `.live-notice` «Петро: Подвійні бали», ряд і запитання не змінились); `extra time shows my own timer` (`me.overtime` → таймер від `deadline`, «+30 с — ваш час»); `others see who the reveal waits for` (спільний час сплив, `overtime` з Олею → «Чекаємо: Оля · …»).
  - `LiveNotices.test.tsx`: `buff toast shows «Оля: 50/50» for four seconds` — за зразком наявного тесту `AdjustmentToast`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens apps/web/src/live`. Очікується FAIL.

- [ ] **Step 3: Implement.** Стилі: `.buff-row` — `display: flex; gap: 8px; min-height: 44px`; `.buff-btn` 44 × 44 px з `--buff-accent`, `.is-active` — `--buff-active` і спалах лише за `prefers-reduced-motion: no-preference`, `.is-used` — `--buff-used` і закреслення, `[aria-disabled='true']` — приглушено; `.buff-why` — `min-height: 1.4em` (рядок завжди займає місце), шрифт 15–16 px; `.choice.is-removed` — `opacity: .35`, текст закреслено, та сама висота. `BuffToast` стоїть під `AdjustmentToast` (класи `live-notice is-buff`, той самий стовпчик сповіщень з 7g).

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): the phone buff row with two-tap take and reasons, 50/50 options faded in place, the second try prompt, a personal timer for extra time, a buff notice"
```

---

### Задача 8. Сцена, пульт ведучого й історія

**Files:**
- Modify: `apps/web/src/screens/StageScreen.tsx` (`StageBuffs`, `OvertimeLine`, `BuffToast`), `apps/web/src/screens/Buffs.tsx` (`StageBuffs`)
- Modify: `apps/web/src/screens/HostScreen.tsx` (головна кнопка «Не чекати», значок бафу у відповідях, `BuffToast`, `OvertimeLine`, кнопка інструмента «Дебаф» лише за дозволених дебафів), `apps/web/src/screens/HostPlayerTools.tsx` (`DebuffPanel` бере `kinds`)
- Modify: `apps/web/src/pages/GameHistory.tsx` (значок бафу біля відповіді)
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/StageScreen.test.tsx`, `apps/web/src/screens/HostScreen.test.tsx`, `apps/web/src/screens/HostPlayerTools.test.tsx`, `apps/web/src/pages/History.test.tsx`

**Interfaces:**
- Consumes: `BaseView.buffs`, `buffNotice`, `overtime`, `HostView.allowed`, `HostResponse.buff` (задача 4), `GameResponse.buff` (задача 5), `BUFF_ICONS`, `buffName` (задача 6), `OvertimeLine`, `BuffToast` (задача 7).
- Produces:
  ```tsx
  /** Значки сцени: «½ Оля» біля кожного гравця, що взяв баф на це запитання. */
  export function StageBuffs(props: { buffs: BuffTag[] }): JSX.Element | null;
  // HostPlayerTools: DebuffPanel({ player, kinds, send, onError }) — kinds: DebuffKind[] (HostView.allowed.debuffs)
  ```
- Сцена: `StageBuffs` поруч зі `StageDebuffs` (той самий рядок значків, `aria-label` «Бафи гравців»), на етапах `question`, `locked`, `reveal`; `OvertimeLine` під таймером, коли спільний час сплив і `overtime` не порожній; `BuffToast` у кутку, як сповіщення балів.
- Пульт: головна кнопка етапу `question` — `t('noWait')` замість `t('lock')`, якщо `view.overtime.length > 0` і спільний час сплив (`secondsLeft(endsAt, offsetMs) === 0` або `remainingMs === 0`); подія та сама `host:lock`. У рядку відповіді — `span.buff-tag` зі значком і `title` назвою, якщо `response.buff !== null`. Рядок гравця: кнопка інструмента «Дебаф» лише якщо `view.allowed.debuffs.length > 0`; `DebuffPanel` показує лише `kinds`.
- Історія: у `li` відповіді перед `.responses-answer` — `span.buff-tag` з `BUFF_ICONS[response.buff]`, `title={buffName(response.buff)}`, `aria-label` «Баф: …».
- Тексти:
  ```ts
  noWait: 'Не чекати',
  stageBuffsLabel: 'Бафи гравців',
  buffTagLabel: 'Баф: {name}',
  ```

- [ ] **Step 1: Write the failing tests.**
  - `StageScreen.test.tsx`: `the stage shows who took which buff, not what it did` — `buffs [{ Оля, fifty }, { Петро, double }]` → «½ Оля», «×2 Петро»; немає тексту прибраних варіантів; `buffs []` → списку немає. `the stage waits for a player with extra time` — спільний час сплив, `overtime [{ Оля, deadline: now + 24 000 }]` → «Чекаємо: Оля · 0:24». `a buff notice on the stage` — «Оля: 50/50».
  - `HostScreen.test.tsx`: `the host can stop waiting` — етап question, час сплив, `overtime` з Олею → головна кнопка «Не чекати», дотик → `send('host:lock')`; без `overtime` — «Закрити запитання» (наявна назва). `responses show the buff icon` — відповідь з `buff: 'shield'` → «🛡» з `title` «Щит». `the host sees only allowed debuffs and no debuff tool when none are allowed` — `allowed.debuffs ['fog', 'mud']` → у панелі лише «Туман» і «Багнюка»; `allowed.debuffs []` → кнопки інструмента «Дебаф» немає.
  - `HostPlayerTools.test.tsx`: `DebuffPanel lists the given kinds only`.
  - `History.test.tsx`: `history answers show the buff they were given with` — відповідь з `buff: 'double'` → «×2» з підписом «Баф: Подвійні бали»; `buff: null` → без значка.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens apps/web/src/pages`. Очікується FAIL.

- [ ] **Step 3: Implement.** Стилі `.stage-buffs` за зразком `.stage-debuffs` (той самий розмір, читається з відстані), `.buff-tag` — невелика пігулка з `--buff-accent`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): buff icons on the stage, «waiting for» with a countdown, «Не чекати» for the host, only allowed debuffs in the console, buff icons in the history"
```

---

### Задача 9. Наскрізний сценарій 8a і кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–8.
- Допоміжні функції файлу: `open`, `register`, `join`, `shot`, `click`, `field`, `exact`, `bodyText`, `expectNoSideScroll`, `snapshot`, `rigged` (грань 1 → `rng` дає 0.01 → 50/50 прибирає перші неправильні варіанти в авторському порядку), `yOf`. Нові локальні: `takeBuff(page, icon)` — два дотики кнопки бафу з `aria-label` назви, чекає класу `is-active`; `pickOption(page, text)` — дотик варіанта; `numericAnswer(page, value)` — заповнює поле числа й тисне «Відповісти».

- [ ] **Step 1: Add the scenario** `it('part 8a: buffs and debuffs in the editor, a buff row on the phone, 50/50, double points, a second try with a choice, extra time with «Не чекати», a shield, double points on a x2 cell, icons and totals in the history', …)` з `try/catch` і `snapshot()`. Підготовка:
  1. Ведучий `register(host, 'host', 'Олег Ведучий', 'host8a@example.com')`. Вікторина «Бафи» через `host.request.post(`${base}/api/quizzes`, { data })`, `settings: { leaderboard: 'end', debuffs: ['fog', 'shake'], buffs: ['fifty', 'double', 'retry', 'time', 'shield'] }`, усі раунди `shuffleOptions: false`:
     - **Раунд 1, класика** «Розминка», `speedBonus: false`, `rules: { ...DEFAULT_RULES, penalty: 'minus' }`:
       - `q1` single «Найбільше озеро України?» — «Ялпуг» (правильний), «Світязь», «Синевир», «Кугурлуй»; 100 балів, 20 с;
       - `q2` numeric «Рік проголошення незалежності України?» — 1991, допуск 10; 100 балів, 30 с;
       - `q3` single «Столиця Буковини?» — «Чернівці» (правильний), «Ужгород», «Луцьк»; 100 балів, 5 с;
       - `q4` boolean «Дніпро впадає в Чорне море?» — так; 100 балів, 5 с.
     - **Раунд 2, поле** «Поле», `answerMode: 'phone'`, `check: 'auto'`, порядок за приєднанням (без кубиків), `rules: DEFAULT_RULES` (без мінуса): 3 категорії по 3 клітинки single (100/200/300), у першій категорії клітинка 100 позначена `x2`.
  2. **Редактор.** Ведучий відкриває «Бафи» зі списку `/quizzes`, розгортає «Бафи й дебафи»: checked «Туман», «Трясіння» й п'ять бафів; «Запитання в залі», «Підказка ведучого», «Заміна запитання» вимкнені з «скоро»; кадр `buff8a-editor`. Дебафи «Жодного» → усі шість зняті; «Усі» → усі шість; знову залишити лише «Туман» і «Трясіння»; «Зберегти». На 375 px — `expectNoSideScroll(host, 'buff8a-editor-375')`, потім 1280 × 900.
  3. Гра: `stage` 1600 × 900, `olya` 375 × 812, `petro` 360 × 740, `ira` 390 × 844. Приєднуються Оля, Петро, Іра. У пульті в рядку Олі інструмент «Дебаф» показує рівно «Туман» і «Трясіння»; кадр `buff8a-host-debuffs`; панель закрити.

- [ ] **Step 2: Assertions and shots** (у такому порядку):
  1. **Ряд бафів і 50/50 (`q1`).** У кожного телефона під запитанням ряд із п'яти кнопок; кадр `buff8a-row-phone` (Оля). Запам'ятати `y` блоку `.question` і `.buff-row` у Петра. `rigged.push(1, 1)`; Оля перший дотик «½» → «Ще раз — узяти «50/50»»; другий → «Світязь» і «Синевир» приглушені на своїх місцях (`is-removed`), «Ялпуг» і «Кугурлуй» активні; кадр `buff8a-fifty-phone`; `expectNoSideScroll(olya, 'buff8a-fifty-375')`. На сцені «½ Оля» й сповіщення «Оля: 50/50»; `bodyText(stage)` не містить «прибрано»; кадр `buff8a-fifty-stage`. У Петра сповіщення «Оля: 50/50», а `y` `.question` і `.buff-row` ті самі. Петро бере «×2», Іра — «🛡». Оля й Петро «Ялпуг», Іра «Синевир». Ведучий закриває й розкриває: у відповідях «×2» біля Петра й «🛡» біля Іри; кадр `buff8a-reveal-host`. Рахунки: Оля 100, Петро 200, Іра 0 (не −100).
  2. **Друга спроба (`q2`).** У Олі кнопка «½» `is-used`, дотик → «Уже використано.». Оля бере «↻», вводить 1996 → «Частково правильно: 75. Залишити чи ще спроба?»; кадр `buff8a-retry-choice`; «Ще спроба» → 1991. Петро бере «↻», вводить 2005 → «Неправильно, ще одна спроба»; кадр `buff8a-retry-again`; 1991. Іра 1991. Розкриття → рахунки Оля 200, Петро 300, Іра 100; на сцені й в Іри ніде немає «1996» чи «2005».
  3. **Додатковий час (`q3`, 5 с).** Іра бере «⏱» → у неї таймер із «+30 с — ваш час». Оля й Петро відповідають «Чернівці». Після спільних 5 с: сцена «Чекаємо: Іра · 0:…»; кадр `buff8a-overtime-stage`; у ведучого головна кнопка «Не чекати»; Петро бачить «Чекаємо: Іра · …»; Іра відповідає «Чернівці» на ~8-й секунді → запитання закривається саме (у ведучого «Показати відповідь»). Розкриття → Оля 300, Петро 400, Іра 200.
  4. **«Не чекати» (`q4`, 5 с).** Іра дотик «½» → ««50/50» не діє на запитання цього типу.» (рядок пояснень, висота ряду та сама). Петро бере «⏱»; Оля й Іра «Так». Після 5 с ведучий «Не чекати» → `locked`; кадр `buff8a-nowait-host`. Розкриття → Петро без відповіді й без мінуса: Оля 400, Петро 400, Іра 300.
  5. **Поле.** «Наступний раунд» → заставка → поле; Оля вибирає клітинку «×2» за 100. Дотик «🛡» в Олі → «Щит не потрібен: у цьому раунді помилка не коштує балів.»; у Петра й Іри ряду бафів немає (відповідає Оля). Оля бере «×2», відповідає правильно, ведучий «Прийняти» → +400; кадр `buff8a-board-phone`. Рахунок Олі 800.
  6. **Історія.** Ведучий «Завершити гру» (підтвердити) → `/history` → «Бафи»: таблиця Оля 800, Петро 400, Іра 300; у відповідях `q1` «½» (Оля), «×2» (Петро), «🛡» (Іра), у `q2` «↻» в Олі й Петра з відповіддю 1991, у `q3` «⏱» в Іри; кадр `buff8a-history-host`. `expectNoSideScroll(olya, 'buff8a-phone-375')` на фінальному екрані.
  7. `expect(problems).toEqual([])`.

- [ ] **Step 3: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв. Потім той самий запуск з `E2E_SHOTS=1` і перегляд кадрів у `apps/server/e2e/artifacts/shots`:
  - ряд бафів не зсуває запитання; рядок пояснень не стрибає; кнопки 44 px і помітні на 360–375 px;
  - прибрані 50/50 варіанти читаються як прибрані, але лишаються на місці;
  - сповіщення «Оля: 50/50» не перекриває дій і стоїть під сповіщенням балів;
  - сцена: значки «½ Оля» читаються з відстані, «Чекаємо: Іра · 0:24» помітне;
  - пульт: «Не чекати» на місці головної кнопки, значки у відповідях;
  - історія показує той самий рахунок, що й таблиця, і значки біля відповідей.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts
git commit -m "test: part 8a end-to-end — the powers editor, the phone buff row, 50/50 in place, double points, a second try with a choice, extra time and «Не чекати», a shield, a doubled x2 cell, icons and totals in the history"
```

Після фінальної рецензії гілку злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`. У звіті власникові назвати рішення: редактор показує всі вісім бафів, три з 8b — «скоро» й поки не приймаються схемою; розділ, якого не чіпали, не змінює вікторину; 50/50 не діє на single з двома варіантами й multi з одним неправильним (інакше видав би відповідь), прибрані варіанти лишаються на місці приглушеними; у 8a бафи не діють на ланцюжок і сортування; часткова перша відповідь у класиці можлива лише в числовому запитанні (multi рушій оцінює «все або нічого»); на полі друга спроба йде через «Прийняти» ведучого; баф береться двома дотиками; «Не чекати» — це головна кнопка «Закрити запитання» з іншою назвою; пауза в додатковому часі його не повертає; в історії — значок біля зарахованої відповіді (першу відповідь другої спроби не зберігаємо); міграція `0008` лише додає колонку `answer.buff`; «Великий ерудит» отримав п'ять бафів.
