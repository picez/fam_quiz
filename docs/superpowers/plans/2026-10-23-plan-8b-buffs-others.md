# План 8b: бафи з участю інших — запитання в залі, підказка ведучого, заміна запитання

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 8b специфікації (розділ 4).
- **Запитання в залі** (`audience`). Гравець з бафом запускає 15-секундне голосування «Як думаєте?». У класичному раунді голосують ті, хто вже надіслав свою відповідь; на полі — усі, крім вибравшого. Гравець з бафом бачить відсотки за варіантами (single, multi, boolean) або список здогадок (text, numeric). Голоси не дають балів. Якщо голосувати нікому — кнопка неактивна: «Поки ніхто не може проголосувати.»
- **Підказка ведучого** (`hint`). У редакторі до будь-якого запитання — необов'язкова підказка. Є підказка — гравець бачить її одразу; немає — ведучий бачить «Оля просить підказку» з полем для тексту й кнопкою «Підказав уголос», гравець бачить «Ведучий думає…», потім текст. Таймер не зупиняється. Підказку не бачать ні інші гравці, ні сцена.
- **Заміна запитання** (`swap`). У редакторі — пул **запасних запитань** (single, multi, boolean, text, numeric). Гравець з бафом отримує наступне невикористане запасне; воно варте балів поточного запитання з тим самим множником клітинки; часу — решта, але щонайменше 20 с (розкриття чекає, як із додатковим часом; ведучий може «Не чекати»). У класиці запасне бачить лише цей гравець, сцена показує «Оля відповідає на запасне»; на полі запасне бачать усі. Відповідь записується до основного запитання з позначкою «запасне» й посиланням на запасне; історія показує текст запасного. Кожне запасне — раз на гру. Баф дозволено, а пул порожній — редактор не зберігає.
- Розділ «Бафи й дебафи» більше не має позначок «скоро»: усі вісім бафів можна вибрати. «Великий ерудит» отримує всі вісім бафів, кілька підказок і запасний пул.

**Архітектура:**
- **Дані (`shared`).** `READY_BUFFS` — усі вісім бафів (перевірка `buff_unavailable` лишається в схемі на майбутнє, але більше не спрацьовує). Нові причини `BuffBlock`: `no_voters`, `spares_out`. Нові коди помилок `vote_closed`, `vote_denied`. `LIMITS.hintText = 200`, `LIMITS.maxSpares = 20`. Необов'язкове поле `hint?: string` у кожному запитанні (спільна частина `base`). Необов'язковий пул `quiz.spares?: Question[]` (типи `SPARE_TYPES`, без відео) — поряд із `quiz.duels`, і так само зберігається в jsonb `settings` (`storedSettings`/`getQuiz` у `quizzes.ts`), тож нової колонки для вікторини немає. Події `player:vote` і `host:hint`.
- **Стан (`engine`).** Усе живе в `BuffPlay` журналу, як у 8a; три нові **необов'язкові** поля, що є лише в бафах свого виду (тож наявні `toEqual` 8a не ламаються): `vote?: { endsAt; ballots }` (audience), `hint?: { text; aloud }` (hint), `spare?: { id; presented; startedAt; limitMs }` (swap). `GameState.sparesUsed: string[]` — використані запасні (вилучення гравця їх не повертає). `AnswerRecord.spare?: string` — id запасного, ставиться в `applyBuff` (єдина точка, як позначка `buff`). Нові функції в `buffs.ts`: `castVote`, `giveHint`, `questionFor`, `presentedFor`, `nextSpare`, `answerLimitMs`, `shiftBuffClocks`, `voteOpen`, `voteTally`.
- **Особистий час заміни** — механізм 8a: `grantOvertime(state, id, max(0, now + SWAP_MIN_MS − endsAt))`. Тож `closesAt`, `tick`, `nextDeadline`, «±15 с», пауза, «Не чекати» (`host:lock` з назвою «Не чекати») і `OvertimeRow` працюють без нового коду.
- **Зрізи.** `PlayerActiveBuff` +`hint`, `votes`, `spare`; `PlayerView.me.vote` (запрошення проголосувати); `HostView.hints` (запити підказки); `HostResponse.spare` (запасне запитання з відповіддю — ведучому). Для гравця із запасним у класиці `question`, `reveal` і `limitMs` його власного зрізу — від запасного. На полі із запасним `question`, `reveal`, `stats`, `correct` — від запасного для всіх. Поле `hint` вирізається з `reveal` сцени й гравців.
- **Сервер.** Дві події, колонка `answer.spare_id` (міграція `0009_answer_spares`), `GameResponse.spare` в історії (запасне зі знімка вікторини гри).
- **Веб.** `apps/web/src/editor/SparesEditor.tsx` (пул), поле «Підказка» в `QuestionEditor`, `PowersEditor` без «скоро» з поясненням «Заміна запитання: додайте запасні запитання»; `apps/web/src/screens/Buffs.tsx` +`BuffPanel` (підказка й результати голосування у блоці сталої висоти), `VoteSheet` (запрошення — `position: fixed`), `HintRequests` (пульт); зміни в `PlayerScreen`, `StageScreen`, `HostScreen`, `GameHistory`.

**Технології:** TypeScript, zod 4, vitest, Fastify + Socket.IO, Drizzle + PostgreSQL (PGlite у тестах), React + Vite, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-23-buffs-transitions-design.md` — розділ 4 (частина 8b), спільні правила бафів 3.2 («не більше одного бафу на запитання», «лише до власної відповіді», «де діють», «неактивна кнопка з поясненням», «що саме з'явилося на телефоні, бачить лише гравець»), «Серії й ведучий» (кнопка «Не чекати» для заміни), цілі, не-цілі й анти-цілі розділу 2 («правильна відповідь потрапляє на телефон раніше», «гра застрягає: якщо зал не голосує або ведучий не дав підказки…», «старі вікторини…», «проста вікторина стала складнішою», «елементи на екрані гравця стрибають, коли хтось інший бере баф»), рішення розділу 8 («голосування залу — 15 с, у класичному раунді голосують ті, хто вже відповів», «запасне запитання варте балів поточного», «відповідь на запасне записується до основного з позначкою; швидкість — від отримання запасного», «заміна дає щонайменше 20 с», «ведучий може «Не чекати»»). Зразки: план `2026-10-23-plan-8a-buffs.md` і його код (`packages/engine/src/buffs.ts`, `timing.ts`, `views.ts`; `apps/web/src/screens/Buffs.tsx`), міграція `0008_answer_buffs.sql`, пул дуелей 7g (`quiz.duels` у `settings` jsonb, `DuelsEditor.tsx`, `reviveDuels` у `draft-storage.ts`).

**Рішення плану там, де специфікація мовчить:**
- **Усі вісім бафів готові.** `READY_BUFFS = [...BUFF_KINDS]`; «Усі» в розділі вмикає всі вісім. Щоб тести 8a не змінювали очікувань, `testing/buffs.ts` отримує `FIRST_BUFFS = ['fifty', 'double', 'retry', 'time', 'shield']`, і `buffQuiz`/`toBuffCell` за замовчуванням беруть його, а не `READY_BUFFS`. Нові тести 8b передають `buffs` явно.
- **`fitBlock` без `default`.** Кожен вид має свою гілку, а `switch` перевіряється на повноту (`const never: never = kind`), щоб новий вид не пройшов перевірку мовчки. `audience`: тип не з `VOTE_TYPES` → `unfit_type`, голосувати нікому → `no_voters`. `hint`: підходить завжди (там, де бафи діють). `swap`: пул вичерпано (або його немає) → `spares_out`. Відмова сервера для обох нових причин — `buff_unfit`, як для решти невідповідностей.
- **Типи.** `VOTE_TYPES = SPARE_TYPES = RETRY_TYPES = ['single', 'multi', 'boolean', 'text', 'numeric']` (одна константа `SIMPLE_TYPES` у `shared/quiz.ts`, імпортується в рушій замість локальної `RETRY_TYPES`). Заміна діє на будь-якому запитанні, де діють бафи (і на порядку чи парах): міняється лише те, на що гравець відповідає.
- **Хто голосує.** Класика: інший гравець, у якого на цьому запитанні вже є запис (`recordOf`); перша відповідь, що чекає другої спроби, не рахується. Поле: будь-який інший гравець у грі, крім вибравшого. Перевірка — у мить голосу, тож хто відповів під час голосування, теж може проголосувати. «Нікому» для кнопки — немає жодного такого **підключеного** гравця.
- **Голосування.** `vote = { endsAt: now + AUDIENCE_MS (15 000), ballots: {} }`. Відкрите, поки етап `question`, `now ≤ endsAt` і гравець з бафом ще не відповів (немає запису й відповіді, що чекає на ведучого). Один голос від гравця на одне голосування, без зміни (`already_answered`). Голос — `Answer` того самого типу, що й запитання (`answerSchema`). На паузі голоси не приймаються (`paused`), а `resume` зсуває `endsAt` на тривалість паузи (`shiftBuffClocks`). Окремого планувальника немає: телефон гасить голосування за `endsAt`, сервер відмовляє `vote_closed`. Вилучений гравець зникає з `ballots` усіх голосувань (його голос більше не рахується).
- **Перевірки `castVote(state, voterId, askerId, answer, now)`** по черзі: голосуючого немає → `not_found`; не `question` → `wrong_phase`; пауза → `paused`; в `askerId` немає бафу `audience` на цьому запитанні → `not_found`; голосуючий — сам `askerId`, у класиці без запису, на полі — вибравший → `vote_denied`; `now > endsAt` або гравець з бафом уже відповів → `vote_closed`; уже голосував → `already_answered`; тип відповіді не той → `type_mismatch`.
- **Результати голосування** (`voteTally`): `cast` — кількість голосів; `counts` — за id варіанта (для boolean ключі `"true"`/`"false"`), multi — кожен вибраний варіант окремо; `guesses` — для text і numeric: групування за `normalize` (text) або за значенням (numeric), написання першого голосу, сортування за кількістю спаданням, потім за першим голосом; не більше 6 рядків. Відсотки рахує телефон: `round(count / cast × 100)`. Правильної відповіді в результатах немає (лише вибір людей), а запрошення голосуючому містить лише ім'я гравця з бафом і час.
- **Запрошення для голосуючого** (`me.vote`): найраніше відкрите голосування цього запитання, у якому гравець може голосувати й ще не голосував; `null` — немає. Варіанти беруться з уже наявного `view.question` голосуючого (у класиці він уже відповів на те саме запитання, на полі бачить ту саму клітинку).
- **Підказка.** Береться `play.question.hint` (основне запитання). Є — `hint = { text, aloud: false }` одразу. Немає — `hint = { text: null, aloud: false }`, запит у `HostView.hints` (у порядку гравців). `giveHint(state, playerId, text | null)`: `text` — підказка текстом, `null` — «Підказав уголос». Перевірки: не `question` → `wrong_phase`; у гравця немає бафу `hint`, що чекає (уже підказано або підказка з редактора) → `not_found`. Пауза не заважає (час не задіяний). Відповідь гравця не скасовує запиту: ведучий може відповісти, поки запитання відкрите; закриття запитання прибирає запит. Ведучий бачить запит і після відповіді гравця, бо підказка могла бути вже не потрібна — кнопка «Підказав уголос» просто закриває запит. Гра не чекає на підказку ніколи.
- **Поле `hint` у запитанні:** `z.string().trim().min(1).max(LIMITS.hintText).refine(isStorable).optional()`; редактор показує поле «Підказка (необов'язково)» під текстом кожного запитання, крім запасних; порожнє — поле не зберігається (`cleaned`). Текст підказки від ведучого — до `LIMITS.hintText` символів. Підказка не потрапляє в `PublicQuestion` (той будується явно), а з `reveal` сцени й гравців вирізається (`withoutHint`); ведучий (`correct`, історія) бачить її.
- **Запасний пул:** `quiz.spares?: Question[]`, 1…`LIMITS.maxSpares`; перевірки `superRefine`: тип не з `SPARE_TYPES` → `spare_type`; є відео → `spare_video`; id запасних повторюються або збігаються з id основних запитань → `duplicate_spare_ids`; `swap` у `settings.buffs`, а запасних немає → `spares_empty`. Пул без бафу дозволений (лежить, не використовується). У редакторі запасне має лише тип, картинку, текст і відповідь: час і бали не показуються (у грі їх беруть з основного запитання), у новому запасному вони типові (`LIMITS.defaultTime`, `LIMITS.defaultPoints`), підказки й відео немає.
- **Заміна.** Наступне запасне — перше в порядку `quiz.spares`, якого немає в `state.sparesUsed`; `takeBuff` дописує його id у `sparesUsed`. `spare = { id, presented, startedAt: now, limitMs }`: `presented` — `present(spare, round.shuffleOptions, rng)` (та сама функція, що для основних запитань); `limitMs = max(endsAt − now, SWAP_MIN_MS)` для запитання з таймером, інакше `null` (запитання з відео: запасне теж без таймера й без особистого часу — закриває ведучий). Особистий час — `grantOvertime(state, id, max(0, now + SWAP_MIN_MS − endsAt))`, лише з таймером.
- **Бали й час заміни.** `questionFor(play, playerId)` — запасне для гравця із заміною, інакше основне; ним перевіряються відповідь (`submitAnswer`, `acceptAnswer`) і тип (`type_mismatch`). Бали — `play.question.points` основного (у класиці `answerPoints` з основними балами; на полі `boardPoints` уже бере ціну клітинки з множником). Класика: `timeMs = now − spare.startedAt`, бонус швидкості з `answerLimitMs` (= `spare.limitMs`); ведучий у `override` бере той самий `answerLimitMs`. `resume` зсуває `spare.startedAt` на тривалість паузи (`shiftBuffClocks`), як зсувається `startedAt`. Поле: бонусу швидкості немає, тож `timeMs` рахується, як для решти клітинок (від `state.startedAt`), — утримання й пауза вже враховані. Щит, подвійні, серія — без змін (у запасного з ними не поєднати: один баф на запитання).
- **Хто що бачить при заміні.** Класика: гравець — запасне (`question`, а на розкритті `reveal` і власний результат), сцена й решта — основне, значок «🔄 Оля» й рядок «Оля відповідає на запасне», лічильники розкриття (`stats`) не враховують відповіді на запасні; ведучий — основне в `correct` і запасне в `HostResponse.spare` біля відповіді. Поле: `question`, `reveal`, `stats` і `correct` для всіх — запасне (`shownQuestion`), бо клітинку бачать усі; категорія й ціна клітинки лишаються.
- **Історія.** Колонка `answer.spare_id text` (nullable, міграція `0009_answer_spares`), `GameResponse.spare: Question | null` — запасне зі знімка вікторини гри (`quiz.spares`), `null`, якщо його там немає (старі ігри, зіпсований знімок). Відповідь лишається під основним запитанням; рядок показує позначку «запасне», текст запасного й відповідь, сформатовану за запасним. Профіль рахує зараховані відповіді за `question_index`, як і раніше — окремої логіки немає.
- **Екран гравця, сталі розміри.** Власна дія гравця може додати блок, дії інших — ні. `BuffPanel` (підказка або результати голосування) з'являється під рядом бафів **у мить, коли гравець сам узяв баф**, і має сталу висоту (`.buff-panel`: `height: 6.5rem; overflow-y: auto`): «Ведучий думає…» → текст ведучого, «Чекаємо голосів…» → відсотки — усе всередині блоку. Запрошення голосувати (`VoteSheet`) — нижній аркуш `position: fixed`, тож під ним нічого не зсувається; «Пропустити» ховає його локально до наступного голосування. Заміна — власна дія: запитання на телефоні змінюється.
- **Рядок пояснень бафів** (`.buff-why`) для активного бафу: `swap` — «🔄 Запасне запитання: щонайменше 20 с»; `audience` — «👥 Зал голосує»; `hint` — «💡 Підказка нижче»; решта — як у 8a.
- **Пульт.** `HintRequests` над відповідями етапу `question`: картка на запит із `label.field` (textarea, `maxLength` `LIMITS.hintText`), «Надіслати» (неактивна з порожнім полем) і «Підказав уголос». Біля відповіді на запасне — `span.spare-tag` «запасне» з `title` текстом запасного; сама відповідь форматується за `response.spare`.
- **Тексти без родів:** «Оля питає зал: як думаєте?», «Голос прийнято», «Поки ніхто не може проголосувати.», «Оля просить підказку», «Ведучий думає…», «Ведучий підказав уголос», «Оля відповідає на запасне», «Запасні запитання закінчилися.», «Заміна запитання: додайте запасні запитання».
- **Демо:** «Великий ерудит» — `settings.buffs` з усіма вісьмома бафами, підказки в чотирьох запитаннях розминки, пул із п'яти запасних (по одному кожного типу).

## Глобальні обмеження

- Старі вікторини (без `hint`, `spares`, з будь-якими `settings.buffs` 8a), чернетки, знімки ігор, історія й профіль поводяться як зараз. Міграція `0009` лише додає nullable-колонку.
- Проста вікторина створюється так само: розділ «Запасні запитання» згорнутий і порожній, поле підказки необов'язкове.
- Рушій чистий: `now` і `rng` — аргументи. Бали лише цілі.
- Анти-ціль «спойлер»: до розкриття жоден зріз сцени чи гравця не містить `correctId`/`correctIds`/`correct`/`accepted`. Текст підказки — лише в зрізі того, хто її взяв (і ведучого); запасне запитання — лише в зрізі того, хто його отримав (і ведучого; на полі — у всіх, бо його видно на сцені), а правильна відповідь на нього — лише в `reveal` цього гравця (на полі — у `reveal` усіх). Голоси — лише в зрізі гравця з бафом. Поле `hint` не потрапляє в `reveal` сцени й гравців ніколи.
- Анти-ціль «гра застрягає»: голосування закінчується за 15 с, з відповіддю гравця з бафом або з закриттям запитання; запит підказки ніколи не тримає запитання; заміна має особистий кінець `max(endsAt, now + 20 с)`, після якого запитання закривається, а ведучий може «Не чекати», поставити паузу, завершити раунд чи гру.
- Анти-ціль «стрибки»: `BuffPanel` сталої висоти, `VoteSheet` і сповіщення — `position: fixed`; дії інших не додають і не прибирають блоків на телефоні.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`. Нові кольори — токени в `:root` у `styles.css` (`--vote-bar`, `--spare-accent`). Тема лише темна. Поля введення — у `label.field`, шрифт ≥ 16 px. Нові класи мають префікс `buff-`, `vote-`, `spare-` або `hint-`.
- Розкладка працює на ширині 375 px (і 360 px) без горизонтальної прокрутки. Анімації — лише за `prefers-reduced-motion: no-preference`.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2` (саме `--maxWorkers=2`: паралельні робітники PGlite падають на цій машині; якщо PGlite все одно падає з браком пам'яті — запускати окремо `pnpm vitest run --maxWorkers=2 packages`, `… apps/server`, `… apps/web`).
- Наскрізні тести: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Кадри — з `E2E_SHOTS=1` у `apps/server/e2e/artifacts/shots`.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (проєкт тестовий).

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/game.ts` | `READY_BUFFS` — усі вісім, `BuffBlock` +`no_voters`, `spares_out`, коди `vote_closed`, `vote_denied` | 1 |
| `packages/shared/src/quiz.ts` | `LIMITS.hintText`, `LIMITS.maxSpares`, `SIMPLE_TYPES`, `hint?` у `base`, `quiz.spares?`, перевірки | 1 |
| `packages/shared/src/events.ts` | `voteSchema`, `hintSchema`, дві події | 1 |
| `apps/web/src/i18n.ts` | `err_vote_closed`, `err_vote_denied`, `buffWhy_no_voters`, `buffWhy_spares_out` | 1 |
| `packages/engine/src/buffs.ts`, `game.ts`, `testing/buffs.ts` | голосування, підказка, `fitBlock` повний, `FIRST_BUFFS` | 2 |
| `packages/engine/src/buffs.ts`, `game.ts` (`submitAnswer`, `acceptAnswer`, `override`, `resume`, `createGame`, `removePlayer`, `present` експорт) | заміна запитання | 3 |
| `packages/shared/src/views.ts`, `packages/engine/src/views.ts`, веб-фабрики зрізів | `hint`, `votes`, `spare`, `me.vote`, `hints`, `HostResponse.spare`, зрізи запасного, `withoutHint` | 4 |
| `apps/server/src/socket.ts`, `rooms/manager.ts`, `recorder.ts`, `history.ts`, `quizzes.ts`, `db/schema.ts`, `drizzle/0009_answer_spares.sql` (+ `meta`), `packages/shared/src/history.ts`, `scripts/erudite-quiz.ts`, `scripts/demo-quiz.test.ts` | події, колонка, пул у `settings`, історія, демо | 5 |
| `apps/web/src/editor/SparesEditor.tsx` (новий), `QuestionEditor.tsx`, `PowersEditor.tsx`, `QuizEditor.tsx`, `draft.ts`, `draft-storage.ts` | пул, поле підказки, розділ без «скоро» | 6 |
| `apps/web/src/screens/Buffs.tsx`, `PlayerScreen.tsx` | `BuffPanel`, `VoteSheet`, заміна на телефоні | 7 |
| `apps/web/src/screens/StageScreen.tsx`, `HostScreen.tsx`, `Buffs.tsx` (`HintRequests`, `StageBuffs`), `apps/web/src/pages/GameHistory.tsx` | запити підказки, позначка запасного, сцена, історія | 8 |
| `apps/web/src/i18n.ts`, `apps/web/src/styles.css` | тексти й стилі веб-задач | 6–8 |
| `apps/server/e2e/full-game.e2e.ts` | наскрізний сценарій 8b; сценарій 8a без «скоро» | 9 |

## Порядок збирання

- Задача 1 (схема) — основа. Нові коди помилок і причини одразу отримують тексти `err_*`/`buffWhy_*` (їх вимагають `errorText` і `whyText`), тож `pnpm typecheck` зелений. Тести схеми 8a про `buff_unavailable` для трьох бафів 8b змінюють очікування (тепер вони готові) — це очікувана зміна, описана в задачі.
- Задача 2 (рушій: зал і підказка) — на 1. Задача 3 (рушій: заміна) — на 2. Задача 4 (зрізи) — на 2–3; нові обов'язкові поля зрізів закриваються механічними значеннями (`hint: null`, `votes: null`, `spare: false` в `PlayerActiveBuff`; `me.vote: null`; `hints: []`; `HostResponse.spare: null`) у веб-фабриках у тій самій задачі.
- Задача 5 (сервер, історія, демо) — на 1–4; `GameResponse.spare: null` у веб-фабриках історії — механічно там само. Задача 6 (редактор) — на 1. Задачі 7 і 8 (екрани) — на 4 і 5. Задача 9 (e2e) — остання.
- Наявні тести не змінюють очікувань, окрім: схеми 8a про `buff_unavailable` (задача 1), `READY_BUFFS` у тесті «all eight buff kinds are known, five are ready» (задача 1), редактора 8a про «скоро» й «Усі → п'ять» (задача 1, бо їх ламає саме зміна `READY_BUFFS`), сценарію 8a e2e про «скоро» (задача 9), назви тесту демо про п'ять бафів (задача 5) і механічних полів у веб-фабриках (задачі 4–5).

## На що дивитися рецензентові

1. **Нічого не витікає.** Текст підказки, запасне запитання й голоси — лише в зрізі власника (і ведучого); `hint` вирізано з `reveal` сцени й гравців; правильна відповідь на запасне в класиці — лише в `reveal` власника; лічильники розкриття сцени не враховують запасних. Тести: задача 4, `the hint reaches only its player`, `a spare question reaches only its player in the classic round`, `votes reach only the asker and never carry the answer`.
2. **Бали й час заміни.** Бали основного запитання з множником клітинки; бонус швидкості від отримання запасного з його межею; пауза не входить у час; особистий кінець `max(endsAt, now + 20 с)`; «Не чекати» закриває; ведучий у `override` рахує так само. Тести: задача 3, `swap…`; задача 5, `a spare answer is saved under the main question with the spare id`.
3. **Гра не застрягає.** Голосування з паузою, відповіддю гравця й закриттям; запит підказки без відповіді не тримає запитання; заміна закривається на особистому кінці й за «Не чекати». Тести: задача 2, `the vote ends…`, `a hint request never holds the question`; задача 3, `swap waits at least 20 s…`.
4. **Пул і старі вікторини.** Вікторина без `spares`/`hint` поводиться як раніше; пул зберігається й читається; заміна без пулу не зберігається ні в редакторі, ні на сервері; кожне запасне — раз на гру, і вилучення гравця його не повертає. Тести: задача 1, `spare pool rules`; задача 3, `each spare is used once per game`; задача 5, `the spare pool survives save and load…`; задача 6, `saving is blocked when swap is on and the pool is empty`.
5. **Нічого не стрибає.** `BuffPanel` сталої висоти, `VoteSheet` фіксований. Тести: задача 7, `the buff panel keeps its size…`, `the vote sheet is fixed…`; задача 9, вимір `y` запитання в голосуючого до й після запрошення і поля відповіді гравця з підказкою до й після тексту ведучого.

---

### Задача 1. Схема: усі вісім бафів, підказка в запитанні, запасний пул, події

**Files:**
- Modify: `packages/shared/src/game.ts` (`READY_BUFFS`, `BuffBlock`, `ErrorCode`)
- Modify: `packages/shared/src/quiz.ts` (`LIMITS`, `SIMPLE_TYPES`, `base.hint`, `quizSchema` + `spares`, `superRefine`)
- Modify: `packages/shared/src/events.ts` (`voteSchema`, `hintSchema`, `ClientToServerEvents`)
- Modify: `apps/web/src/i18n.ts`
- Test: `packages/shared/src/quiz.test.ts`

**Interfaces:**
- Produces (`shared`):
  ```ts
  // game.ts
  /** Усі бафи працюють (частина 8b); перевірка buff_unavailable лишається для майбутніх видів. */
  export const READY_BUFFS: readonly BuffKind[] = [...BUFF_KINDS];
  export type BuffBlock =
    | 'used' | 'taken' | 'answered' | 'time' | 'paused' | 'elsewhere' | 'not_chooser'
    | 'unfit_type' | 'unfit_options' | 'unfit_timer' | 'unfit_penalty' | 'unfit_manual'
    | 'no_voters' | 'spares_out';
  // ErrorCode: | 'vote_closed' | 'vote_denied'
  // quiz.ts, LIMITS:
  /** Підказка до запитання (редактор) і від ведучого в грі, символів. */
  hintText: 200,
  /** Запасних запитань для бафу «Заміна запитання». */
  maxSpares: 20,
  /** Типи з автоматичною перевіркою й простою відповіддю: друга спроба, голосування залу, запасні запитання. */
  export const SIMPLE_TYPES = ['single', 'multi', 'boolean', 'text', 'numeric'] as const satisfies readonly Question['type'][];
  // base:
  /** Підказка для бафу «Підказка ведучого»; немає — ведучий підкаже сам. Старі запитання без неї. */
  hint: z.string().trim().min(1).max(LIMITS.hintText).refine(isStorable, UNSTORABLE).optional(),
  // quizSchema:
  /** Запасні запитання для бафу «Заміна запитання»; старі вікторини без поля. */
  spares: z.array(questionSchema).min(1).max(LIMITS.maxSpares).optional(),
  // events.ts
  /** Голос залу за гравця з бафом «Запитання в залі». */
  export const voteSchema = z.object({ askerId: playerId, answer: answerSchema });
  /** Підказка ведучого: text — текстом, null — «Підказав уголос». */
  export const hintSchema = z.object({
    playerId,
    text: z.string().trim().min(1).max(LIMITS.hintText).refine(isStorable, UNSTORABLE).nullable(),
  });
  'player:vote': (payload: z.infer<typeof voteSchema>, ack: Ack) => void;
  'host:hint': (payload: z.infer<typeof hintSchema>, ack: Ack) => void;
  ```
- `quizSchema.superRefine` (після перевірки бафів): кожне запасне — `spare_type`, якщо тип не з `SIMPLE_TYPES`; `spare_video`, якщо `video !== null`; `duplicate_spare_ids`, якщо id запасних повторюються або збігаються з id основних запитань; `spares_empty`, якщо `settings.buffs` містить `swap`, а `spares` немає.
- Тексти:
  ```ts
  err_vote_closed: 'Голосування вже закінчилося.',
  err_vote_denied: 'Тут проголосувати не можна.',
  buffWhy_no_voters: 'Поки ніхто не може проголосувати.',
  buffWhy_spares_out: 'Запасні запитання закінчилися.',
  ```

- [ ] **Step 1: Write the failing tests** у `quiz.test.ts` (наявні `valid`, `baseQuiz`, `issues`, `withPowers`; новий `spareSingle` — single «Яка річка тече через Київ?» з id `s1`):
  ```ts
  describe('hints and the spare pool', () => {
    it('a question may carry a short hint; old questions have none', () => {
      const parsed = quizSchema.parse(baseQuiz);
      expect(questionsOf(parsed)[0].hint).toBeUndefined();
      const withHint = { ...baseQuiz, rounds: [{ ...baseQuiz.rounds[0], questions: [{ ...baseQuiz.rounds[0].questions[0], hint: '  Тече через Київ ' }] }] };
      expect(questionsOf(quizSchema.parse(withHint))[0].hint).toBe('Тече через Київ');
      const long = { ...withHint, rounds: [{ ...withHint.rounds[0], questions: [{ ...withHint.rounds[0].questions[0], hint: 'я'.repeat(LIMITS.hintText + 1) }] }] };
      expect(valid(quizSchema, long)).toBe(false);
      const empty = { ...withHint, rounds: [{ ...withHint.rounds[0], questions: [{ ...withHint.rounds[0].questions[0], hint: '   ' }] }] };
      expect(valid(quizSchema, empty)).toBe(false);
    });
    it('spare pool rules', () => {
      expect(valid(quizSchema, { ...baseQuiz, spares: [spareSingle] })).toBe(true);
      expect(valid(quizSchema, { ...baseQuiz, spares: [] })).toBe(false);
      expect(issues({ ...baseQuiz, spares: [{ ...orderQuestion, id: 's2' }] })).toContain('spare_type'); // будь-яке валідне order з фікстур тесту
      expect(issues({ ...baseQuiz, spares: [{ ...spareSingle, video: { id: 'dQw4w9WgXcQ', start: 0 } }] })).toContain('spare_video');
      expect(issues({ ...baseQuiz, spares: [spareSingle, spareSingle] })).toContain('duplicate_spare_ids');
      const mainId = questionsOf(quizSchema.parse(baseQuiz))[0].id;
      expect(issues({ ...baseQuiz, spares: [{ ...spareSingle, id: mainId }] })).toContain('duplicate_spare_ids');
      expect(valid(quizSchema, { ...baseQuiz, spares: Array.from({ length: LIMITS.maxSpares + 1 }, (_, i) => ({ ...spareSingle, id: `s${i}` })) })).toBe(false);
    });
    it('swap needs spares; a pool without swap is fine', () => {
      expect(issues(withPowers({ buffs: ['swap'] }))).toContain('spares_empty');
      expect(valid(quizSchema, { ...withPowers({ buffs: ['swap'] }), spares: [spareSingle] })).toBe(true);
      expect(valid(quizSchema, { ...withPowers({ buffs: ['audience', 'hint'] }) })).toBe(true);
    });
    it('vote and hint events check their payloads', () => {
      expect(valid(voteSchema, { askerId: PLAYER_UUID, answer: { type: 'single', optionId: 'a' } })).toBe(true);
      expect(valid(voteSchema, { askerId: PLAYER_UUID, answer: { type: 'magic' } })).toBe(false);
      expect(valid(hintSchema, { playerId: PLAYER_UUID, text: 'Тече через Київ' })).toBe(true);
      expect(valid(hintSchema, { playerId: PLAYER_UUID, text: null })).toBe(true);
      expect(valid(hintSchema, { playerId: PLAYER_UUID, text: '  ' })).toBe(false);
      expect(valid(hintSchema, { playerId: PLAYER_UUID, text: 'я'.repeat(LIMITS.hintText + 1) })).toBe(false);
    });
  });
  ```
  `PLAYER_UUID` — будь-який id, що проходить наявну схему `playerId` в `events.ts` (подивитися в наявних тестах подій). Оновити тести 8a: у `refuses unknown kinds, repeats and buffs that are not ready yet` рядки з `buff_unavailable` для `swap` і `['audience', 'hint']` замінити на `expect(issues(withPowers({ buffs: ['swap'] }))).toContain('spares_empty')` і `expect(valid(quizSchema, withPowers({ buffs: ['audience', 'hint'] }))).toBe(true)`; тест `all eight buff kinds are known, five are ready` перейменувати на `all eight buff kinds are known and ready` з `expect(READY_BUFFS).toEqual([...BUFF_KINDS])`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared`. Очікується FAIL: немає `hint`, `spares`, `voteSchema`, `LIMITS.hintText`.

- [ ] **Step 3: Implement** усе з Interfaces і тексти в `i18n.ts`. `SIMPLE_TYPES` оголосити після `Question` (тип) у `quiz.ts`.

- [ ] **Step 4: Keep the old tests green.** Зміна `READY_BUFFS` зачіпає тести, що чекають п'ять бафів, — виправити їх у цій самій задачі, щоб між задачами не лишалося червоного:
  - `packages/engine/src/testing/buffs.ts`: нова експортована константа `FIRST_BUFFS = ['fifty', 'double', 'retry', 'time', 'shield'] as const`; `buffQuiz` і `toBuffCell` беруть її замість `READY_BUFFS` (очікування тестів 8a не змінюються).
  - `apps/web/src/editor/QuizEditor.test.tsx` (тести 8a): перевірку «скоро» й `disabled` для трьох бафів 8b прибрати (позначки зникають самі, бо `PowersEditor` бере їх з `READY_BUFFS`); «Усі» тепер ставить вісім прапорців — перевіряти стан прапорців, а не тіло запиту (без пулу заміна не збережеться; саму перевірку пулу додає задача 6).
  - Будь-які інші тести, що порівнюють `READY_BUFFS` з п'ятьма бафами, — так само (знайти `grep -rn "READY_BUFFS" --include=*.test.* .`).

- [ ] **Step 5: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared packages/engine/src/testing apps/web/src/i18n.ts apps/web/src/editor/QuizEditor.test.tsx
git commit -m "feat(shared): all eight buffs ready, an optional hint on any question, a spare question pool that swap needs, vote and hint events"
```

---

### Задача 2. Рушій: запитання в залі й підказка ведучого

**Files:**
- Modify: `packages/engine/src/buffs.ts` (`BuffPlay.vote?`, `BuffPlay.hint?`, `fitBlock` повний, `takeBuff`, `castVote`, `giveHint`, `voteOpen`, `voteTally`, `shiftBuffClocks`, `AUDIENCE_MS`)
- Modify: `packages/engine/src/game.ts` (`removePlayer` — голоси вилученого, `resume` — `shiftBuffClocks`)
- Create: `packages/engine/src/game.buffs-others.test.ts`
- Modify: `packages/engine/src/testing/buffs.ts` (`othersQuiz`, `toOthersQuestion`, `toOthersCell`)

**Interfaces:**
- Consumes: `SIMPLE_TYPES`, `BuffBlock`, коди помилок (задача 1); `buffOf`, `withBuff`, `placeBlock`, `hasAnswered` (8a).
- Produces (`engine`):
  ```ts
  // buffs.ts
  /** Скільки триває голосування залу, мс. */
  export const AUDIENCE_MS = 15_000;
  export interface BuffPlay {
    // … поля 8a
    /** audience: голосування; лише в бафі audience. */
    vote?: { endsAt: number; ballots: Record<string, Answer> };
    /** hint: text null — чекає ведучого; aloud — ведучий підказав уголос; лише в бафі hint. */
    hint?: { text: string | null; aloud: boolean };
  }
  /** Чи голосування гравця відкрите на мить now (етап question, не пізніше endsAt, гравець з бафом ще не відповів). */
  export function voteOpen(state: GameState, askerId: string, now: number): boolean;
  /** Чи може гравець голосувати за askerId (без перевірки часу й повторного голосу). */
  export function canVote(state: GameState, voterId: string, askerId: string): boolean;
  /** Підсумок голосування; guesses — для text і numeric. */
  export function voteTally(question: Question, ballots: Record<string, Answer>): { cast: number; counts: Record<string, number>; guesses: { text: string; count: number }[] };
  /** Голос за гравця з бафом audience; перевірки — «Рішення плану». */
  export function castVote(state: GameState, voterId: string, askerId: string, answer: Answer, now: number): Result;
  /** Відповідь ведучого на запит підказки: text або null («Підказав уголос»). */
  export function giveHint(state: GameState, playerId: string, text: string | null): Result;
  /** Після паузи: endsAt голосувань і startedAt запасних поточного запитання зсуваються на shiftMs. */
  export function shiftBuffClocks(state: GameState, shiftMs: number): GameState;
  // testing/buffs.ts
  /** Класика без мінуса й без бонусу: q1 single4 з hint «Тече через Київ», q2 numeric 2061 ± 100 без hint, q3 text «Львів», q4 order; усі 1000, 20 с; buffs ['audience', 'hint', 'swap']; spares — s1 bool (true), s2 text «Чернівці», s3 single (b правильний). */
  export function othersQuiz(patch?: Partial<QuizSettings> & RoundOptions & { spares?: Question[] }): Quiz;
  /** Оля p1, Петро p2, Іра p3; відкрито q1 о T0 (rng () => 0). */
  export function toOthersQuestion(patch?: …): GameState;
  /** Поле 3 × 3 (check auto, з телефона), у c1 друга клітинка x2 на single4; buffs ['audience', 'hint', 'swap'], spares як в othersQuiz; Оля вибирає c12 о T0. */
  export function toOthersCell(): GameState;
  ```
- `takeBuff`: `audience` → `vote: { endsAt: now + AUDIENCE_MS, ballots: {} }`; `hint` → `hint: { text: play.question.hint ?? null, aloud: false }`. Без цих полів у бафах інших видів.
- `fitBlock` — гілки `audience` (`unfit_type` для типу не з `SIMPLE_TYPES`; `no_voters`, якщо немає підключеного гравця, для якого `canVote`), `hint` (`null`), `swap` (`spares_out`, якщо `nextSpare` — задача 3 — повертає `null`; у цій задачі — заглушка `spares_out`, якщо `state.quiz.spares` порожній чи відсутній), без `default`, з перевіркою повноти.
- `canVote`: `voterId !== askerId`, гравець у грі; поле (`play.board !== undefined`) — `voterId !== board.chooserId`; класика — `recordOf(state, questionIndex, voterId) !== undefined`.
- `removePlayer`: крім `buffs[id]` — прибрати `ballots[id]` з `vote` кожного бафу кожного `play`.
- `resume` (обидві гілки етапу `question` з `shift`): `shiftBuffClocks(…, shift)` разом із `shiftSortLocks`/`shiftQueue`.

- [ ] **Step 1: Write the failing tests** у `game.buffs-others.test.ts` (`rng0 = () => 0`; `answer(s, id, a, at)` = `must(submitAnswer(s, id, a, at))`; `single(id)` = `{ type: 'single', optionId: id }`):
  ```ts
  it('audience: a 15 s vote among those who already answered in the classic round', () => {
    let s = toOthersQuestion();
    expect(buffBlock(s, 'p1', 'audience')).toBe('no_voters');
    expect(takeBuff(s, 'p1', 'audience', T0, rng0)).toEqual({ ok: false, error: 'buff_unfit' });
    s = answer(s, 'p2', single('b'), T0 + 1000);
    s = must(takeBuff(s, 'p1', 'audience', T0 + 2000, rng0));
    expect(s.plays[0].buffs?.p1.vote).toEqual({ endsAt: T0 + 17_000, ballots: {} });
    expect(castVote(s, 'p3', 'p1', single('a'), T0 + 3000)).toEqual({ ok: false, error: 'vote_denied' }); // Іра ще не відповіла
    s = must(castVote(s, 'p2', 'p1', single('b'), T0 + 3000));
    expect(castVote(s, 'p2', 'p1', single('a'), T0 + 4000)).toEqual({ ok: false, error: 'already_answered' });
    s = answer(s, 'p3', single('c'), T0 + 5000);           // відповіла під час голосування — тепер може
    s = must(castVote(s, 'p3', 'p1', single('c'), T0 + 6000));
    expect(voteTally(single4, s.plays[0].buffs!.p1.vote!.ballots)).toEqual({ cast: 2, counts: { b: 1, c: 1 }, guesses: [] });
    expect(castVote(s, 'p1', 'p1', single('b'), T0 + 6000)).toEqual({ ok: false, error: 'vote_denied' });
    expect(castVote(s, 'p2', 'p3', single('b'), T0 + 6000)).toEqual({ ok: false, error: 'not_found' }); // в Іри немає бафу
    expect(castVote(s, 'p9', 'p1', single('b'), T0 + 6000)).toEqual({ ok: false, error: 'not_found' });
  });
  it('the vote ends after 15 s, when the asker answers, at the question end; pause stops the clock', () => {
    // голосування з T0 + 2000: castVote о T0 + 17_001 → 'vote_closed'; о T0 + 17_000 → ok
    // p1 відповідає о T0 + 8000 → voteOpen(s, 'p1', T0 + 9000) false; castVote → 'vote_closed'
    // lock → castVote → 'wrong_phase'
    // pause о T0 + 5000 → castVote → 'paused'; resume о T0 + 65_000 → vote.endsAt T0 + 77_000
    // тип не той: castVote(…, { type: 'text', value: 'Київ' }) → 'type_mismatch'
  });
  it('audience fits simple types only and works on a board cell for everyone but the chooser', () => {
    // q4 order (лише після відповіді Петра, щоб голосувати було кому) → buffBlock 'unfit_type', takeBuff 'buff_unfit'
    // toOthersCell(): Оля бере audience одразу (Петро й Іра підключені) → ok; Петро й Іра голосують без власної відповіді;
    //   castVote від Олі (вибравшої) → 'vote_denied'
    // усі, крім Олі, відключені → buffBlock 'no_voters'
  });
  it('audience tallies guesses for text and numeric', () => {
    // q3 text: Петро й Іра відповіли; Оля audience; голоси «Львів», « львів », «Київ» (три голосуючі: додати Марту p4 в лобі)
    //   → guesses [{ text: 'Львів', count: 2 }, { text: 'Київ', count: 1 }], counts {}
    // numeric: 2061, 2061, 1990 → guesses [{ text: '2061', count: 2 }, { text: '1990', count: 1 }]
    // multi: голоси ['a', 'c'] і ['c'] → counts { a: 1, c: 2 }, cast 2
    // більше 6 різних здогадок → лише 6 рядків
  });
  it('a kicked voter leaves the tally; a kicked asker takes the vote away', () => {
    // голоси Петра й Іри → removePlayer(p2) → ballots лише p3; removePlayer(p1) → buffs без p1
  });
  it('hint: a written hint shows at once, otherwise the host is asked', () => {
    let s = must(takeBuff(toOthersQuestion(), 'p1', 'hint', T0 + 1000, rng0));
    expect(s.plays[0].buffs?.p1.hint).toEqual({ text: 'Тече через Київ', aloud: false });
    expect(giveHint(s, 'p1', 'інше')).toEqual({ ok: false, error: 'not_found' });   // підказка вже є
    // q2 (без hint): Петро бере hint → hint { text: null, aloud: false }
    //   giveHint(p2, 'Близько 2000') → hint { text: 'Близько 2000', aloud: false }; повторно → 'not_found'
    //   Іра бере hint → giveHint(p3, null) → hint { text: null, aloud: true }
    // giveHint для гравця без бафу → 'not_found'; після lock → 'wrong_phase'; на паузі → ok
  });
  it('a hint request never holds the question', () => {
    // q2: Петро hint (без відповіді ведучого); усі відповіли → phase 'locked' (autoLock); окремо — tick(T0 + 20_000) → locked
  });
  it('hint works on a board cell and is the same buff rules as 8a', () => {
    // toOthersCell(): Оля hint → { text: single4.hint ?? null } (у фікстурі поля без hint → null); giveHint ok; Петро (не вибравший) → 'not_your_turn'
  });
  it('the switch over buff kinds is complete', () => {
    // для кожного з BUFF_KINDS buffBlock на q1 після відповіді Петра повертає значення з BuffBlock або null без винятку;
    //   swap без spares (othersQuiz({ spares: undefined, buffs: ['audience', 'hint'] }) з дописаним 'swap' у settings напряму) → 'spares_out'
  });
  ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL: немає `castVote`, `giveHint`.

- [ ] **Step 3: Implement** за Interfaces і «Рішеннями плану» (хто голосує, голосування, перевірки, результати, підказка). `voteTally` для text групує за `normalize` з `./normalize`, для numeric — за `String(value)`. `othersQuiz` будує запасні з наявних фікстур (`bool`, `text`, `single4`) через `withId`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS (тести 8a — без змін очікувань завдяки `FIRST_BUFFS`).

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): audience vote for 15 s among those who may vote, tallies and guesses, and the host hint — written at once or asked of the host, never holding the question"
```

---

### Задача 3. Рушій: заміна запитання

**Files:**
- Modify: `packages/engine/src/buffs.ts` (`BuffPlay.spare?`, `SWAP_MIN_MS`, `nextSpare`, `questionFor`, `presentedFor`, `answerLimitMs`, `takeBuff` для `swap`, `applyBuff` — `spare`, `fitBlock` `swap` через `nextSpare`)
- Modify: `packages/engine/src/game.ts` (`GameState.sparesUsed`, `createGame`, `AnswerRecord.spare?`, `present` — експорт, `submitAnswer`, `acceptAnswer`, `override`)
- Create: `packages/engine/src/game.buffs-swap.test.ts`

**Interfaces:**
- Consumes: усе з задачі 2; `grantOvertime`, `closesAt`, `deadlineOf` (8a).
- Produces:
  ```ts
  // game.ts
  // GameState:
  /** Id запасних запитань, уже виданих у цій грі; вилучення гравця їх не повертає. */ sparesUsed: string[];
  // AnswerRecord:
  /** Відповідь на запасне запитання з цим id; немає — на основне. */ spare?: string;
  /** Порядок показу варіантів; експортовано для buffs.ts. */ export function present(question: Question, shuffleOptions: boolean, rng: Rng): string[];
  // buffs.ts
  /** Запасне запитання дає щонайменше стільки часу, мс. */
  export const SWAP_MIN_MS = 20_000;
  export interface BuffPlay {
    // …
    /** swap: id запасного, порядок його варіантів, мить видачі, межа для бонусу швидкості (null — без таймера). */
    spare?: { id: string; presented: string[]; startedAt: number; limitMs: number | null };
  }
  /** Наступне невикористане запасне; null — пулу немає або він вичерпаний. */
  export function nextSpare(state: GameState): Question | null;
  /** Запитання, на яке відповідає гравець: запасне після заміни, інакше основне. */
  export function questionFor(state: GameState, play: Play, playerId: string): Question;
  /** Порядок варіантів того, що бачить гравець: presented запасного або state.presented. */
  export function presentedFor(state: GameState, play: Play, playerId: string): string[];
  /** Межа для бонусу швидкості: limitMs запасного або limitMsOf(play). */
  export function answerLimitMs(play: Play, playerId: string): number | null;
  ```
- `takeBuff` `swap`: `spare = nextSpare(state)` (не `null` — гарантує `fitBlock`); `buff.spare = { id, presented: present(spare, round.shuffleOptions, rng), startedAt: now, limitMs }`; стан `{ ...state, sparesUsed: [...state.sparesUsed, spare.id] }`; з таймером — `grantOvertime(…, max(0, now + SWAP_MIN_MS − endsAt))`, `limitMs = max(endsAt − now, SWAP_MIN_MS)`; без таймера — без особистого часу, `limitMs: null`.
- `applyBuff`: для `buff.kind === 'swap' && buff.spare` — `spare: buff.spare.id` у записі (поряд із `buff`).
- `submitAnswer` (класика): `question = questionFor(...)`; `type_mismatch` проти нього; `checkAnswer(question, answer)`; з заміною `timeMs = max(0, now − spare.startedAt)`, `limit = answerLimitMs(...)`; бали — `answerPoints({ points: play.question.points, … })`.
- `acceptAnswer` (поле): `checkAnswer(questionFor(state, play, playerId), pending.answer)`; бали — `boardPoints` як є.
- `override` (класика): `speedFactor(record.timeMs, answerLimitMs(play, playerId) ?? 0, …)`.
- `createGame`: `sparesUsed: []`.

- [ ] **Step 1: Write the failing tests** у `game.buffs-swap.test.ts`:
  ```ts
  it('swap gives the next unused spare at least 20 s, the reveal waits for it', () => {
    let s = must(takeBuff(toOthersQuestion(), 'p1', 'swap', T0 + 15_000, rng0));
    expect(s.plays[0].buffs?.p1.spare).toEqual({ id: 's1', presented: [], startedAt: T0 + 15_000, limitMs: 20_000 });
    expect(s.sparesUsed).toEqual(['s1']);
    expect(deadlineOf(s, s.plays[0], 'p1')).toBe(T0 + 35_000);
    expect(closesAt(s)).toBe(T0 + 35_000);
    // о T0 + 5000 (лишилося 15 с) → overtime 10_000; о T0 + 1000 (лишилося 19 с) → overtime 1000;
    //   якщо лишилося ≥ 20 с (timeLimit 30) → overtime немає, limitMs = решта
  });
  it('the spare is checked instead of the main question and worth the main points', () => {
    // s1 bool (true): p1 swap, submitAnswer({ type: 'single', … }) → 'type_mismatch'; { type: 'boolean', value: true } → record
    //   { accepted: true, points: 1000 (бали q1), spare: 's1', buff: 'swap', timeMs: 4000 } (swap о T0 + 15_000, відповідь о T0 + 19_000)
  });
  it('the speed bonus counts from the moment the spare arrived, without the pause', () => {
    // othersQuiz({ speedBonus: true }); swap о T0 + 10_000 (limitMs 20_000); pause о T0 + 12_000, resume о T0 + 72_000
    //   → spare.startedAt T0 + 70_000; відповідь о T0 + 75_000 → timeMs 5000, бали = answerPoints з speedFactor(5000, 20_000, true)
    // override(p1, 'wrong') → 'correct' на reveal дає ті самі бали (answerLimitMs)
  });
  it('swap waits at least 20 s; the host may not wait; a missing spare answer is absent', () => {
    // p2, p3 відповіли; p1 swap о T0 + 18_000 → tick(T0 + 20_001) → 'question'; tick(T0 + 38_001) → 'locked', запису p1 немає
    // окремо: lock о T0 + 25_000 («Не чекати») → locked, recordOf(p1) undefined
    // p1 відповідає о T0 + 30_000 (усі інші відповіли) → одразу 'locked'
  });
  it('each spare is used once per game; when the pool runs out the button explains', () => {
    // q1: p1 swap (s1), p2 swap (s2), p3 swap (s3) → q2: buffBlock(p?, 'swap') — 'used' для всіх трьох
    // гра з 4 гравцями й 3 запасними: четвертий на q2 → buffBlock 'spares_out', takeBuff 'buff_unfit'
    // removePlayer(p1) → sparesUsed все одно ['s1', 's2', 's3']
  });
  it('swap on a board cell: the spare for the chooser, the cell multiplier applies', () => {
    // toOthersCell(): Оля swap → s1 bool; submitBoardAnswer boolean true → acceptAnswer → reveal, record { points 2000 (x2 клітинка 1000), spare 's1', buff 'swap' }
    // спершу submitBoardAnswer single → 'type_mismatch'
  });
  it('swap shuffles spare options when the round shuffles', () => {
    // othersQuiz({ shuffleOptions: true }, spares [s3 single]) з rng () => 0.99 → presented — перестановка ['a','b','c','d'], інша за авторський порядок
    // shuffleOptions false → авторський порядок
  });
  it('swap without a timer gives no personal time', () => {
    // запитання з відео: swap → spare.limitMs null, overtime немає; відповідь → record без бонусу
  });
  ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.

- [ ] **Step 3: Implement** за Interfaces. Заглушку `spares_out` із задачі 2 замінити на `nextSpare(state) === null`. `shiftBuffClocks` уже зсуває `spare.startedAt` (задача 2) — переконатися тестом про паузу.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): swap — the next unused spare with at least 20 s, worth the main points with the cell multiplier, speed from the moment it arrived, each spare once per game"
```

---

### Задача 4. Зрізи: підказка, голосування й запасне — лише тому, кому належить

**Files:**
- Modify: `packages/shared/src/views.ts` (`PlayerHint`, `VoteTally`, `VotePrompt`, `HintRequest`; поля `PlayerActiveBuff`, `PlayerView.me`, `HostView`, `HostResponse`)
- Modify: `packages/engine/src/views.ts` (`publicQuestion(question, presented)`, `shownQuestion`, `withoutHint`, `playerBuffs`, `playerView`, `stageView`, `hostView`, `revealStats`)
- Modify (механічно): фабрики зрізів у `apps/web/src/screens/*.test.tsx`, `apps/web/src/live/*.test.tsx` — знайти через `pnpm typecheck`
- Test: `packages/engine/src/views.buffs-others.test.ts` (новий)

**Interfaces:**
- Consumes: `voteOpen`, `canVote`, `voteTally`, `questionFor`, `presentedFor` (задачі 2–3).
- Produces (`shared/views.ts`):
  ```ts
  /** Підказка для гравця: waiting — ведучий думає; text — текст; aloud — ведучий підказав уголос. */
  export interface PlayerHint { state: 'waiting' | 'text' | 'aloud'; text: string | null }
  /** Голосування залу для гравця з бафом: правильної відповіді тут немає. */
  export interface VoteTally {
    /** Кінець голосування (час сервера); null на паузі. */
    endsAt: number | null;
    /** На паузі: залишок; інакше null. */
    remainingMs: number | null;
    /** Гравець уже відповів — голосування закрите. */
    closed: boolean;
    cast: number;
    /** Голоси за id варіанта (boolean — "true"/"false"). */
    counts: Record<string, number>;
    /** text, numeric: здогадки за кількістю; не більше 6. */
    guesses: { text: string; count: number }[];
  }
  /** Запрошення проголосувати. */
  export interface VotePrompt { asker: BlitzPlayer; endsAt: number | null; remainingMs: number | null }
  /** Запит підказки для ведучого. */
  export interface HintRequest extends BlitzPlayer { at: number }
  // PlayerActiveBuff:
  hint: PlayerHint | null;     // лише hint
  votes: VoteTally | null;     // лише audience
  /** swap: гравець відповідає на запасне. */ spare: boolean;
  // PlayerView.me:
  /** Відкрите голосування, у якому гравець може й ще не голосував; null — немає. */ vote: VotePrompt | null;
  // HostView:
  /** Запити підказки без відповіді на поточному запитанні (етап question), у порядку гравців. */ hints: HintRequest[];
  // HostResponse:
  /** Запасне запитання, на яке дано відповідь (з правильною відповіддю); null — основне. */ spare: Question | null;
  ```
- Правила:
  - `publicQuestion(question, presented)` — чиста функція від запитання й порядку; `shownQuestion(state)` — на полі, якщо вибравший узяв `swap`, — запасне (з `presented` запасного), інакше `currentQuestion(state)` (з `state.presented`). `base` бере `shownQuestion`.
  - `playerView` для гравця з заміною в класиці: `question = publicQuestion(spare, spare.presented)`, `limitMs = spare.limitMs` (на етапі `question`), `reveal = withoutHint(spare)` на розкритті. Інакше `reveal = withoutHint(shownQuestion)`.
  - `stageView`: `reveal = withoutHint(shownQuestion)`; `revealStats` пропускає записи з `spare` у класиці (на полі — ні).
  - `hostView`: `correct = shownQuestion` (з `hint`); `responses[].spare` — запасне за `record.spare` з `state.quiz.spares`, інакше `null`; `hints` — бафи `hint` з `text === null && !aloud` на етапі `question`.
  - `playerBuffs.active`: `hint` — `waiting` / `text` / `aloud` за станом; `votes` — `voteTally` + `endsAt`/`remainingMs` (на паузі `endsAt − pausedAt`), `closed` — гравець уже відповів (запис або відповідь, що чекає ведучого); `spare` — `own.kind === 'swap'`.
  - `me.vote`: на етапі `question` — перший у порядку гравців `askerId` з бафом `audience`, для якого `canVote(state, me, askerId)`, гравця ще немає в `ballots` і гравець з бафом ще не відповів. Час зріз не перевіряє (він без `now`): `endsAt`/`remainingMs` ідуть у запрошення, і телефон сам ховає його після кінця.
  - `withoutHint(q)` — копія без ключа `hint` (`const { hint: _h, ...rest } = q`).

- [ ] **Step 1: Write the failing tests** у `views.buffs-others.test.ts`:
  ```ts
  it('the hint reaches only its player', () => {
    let s = must(takeBuff(toOthersQuestion(), 'p1', 'hint', T0, rng0));
    expect(playerView(s, 'p1')?.me.buffs?.active?.hint).toEqual({ state: 'text', text: 'Тече через Київ' });
    for (const view of [stageView(s), playerView(s, 'p2'), playerView(s, 'p3')]) expect(JSON.stringify(view)).not.toContain('Тече через Київ');
    s = must(next(must(lock(s)), T0 + 30_000, rng0)); // reveal
    for (const view of [stageView(s), playerView(s, 'p1'), playerView(s, 'p2')]) expect(JSON.stringify(view)).not.toContain('Тече через Київ');
    expect(hostView(s).correct).toMatchObject({ hint: 'Тече через Київ' });
    // q2: Петро hint → active.hint { state 'waiting', text null }; hostView.hints [{ playerId 'p2', nickname 'Петро', at }]
    //   giveHint(p2, 'Близько 2000') → { state 'text' } і hints []; Іра hint → giveHint(p3, null) → { state 'aloud', text null }
    //   JSON сцени й p1, p3 не містить 'Близько 2000'
  });
  it('votes reach only the asker and never carry the answer', () => {
    // Петро відповів 'b'; Оля audience; Петро голосує 'b'
    // playerView(p1).me.buffs.active.votes → { cast 1, counts { b: 1 }, guesses [], closed false, endsAt T0 + 17_000 (від миті бафу), remainingMs null }
    // playerView(p2).me.vote → null (уже голосував); до голосу — { asker { playerId 'p1', nickname 'Оля' }, endsAt, remainingMs null }
    // playerView(p3).me.vote → null (не відповіла); після відповіді Іри → запрошення є
    // JSON(stageView), JSON(hostView) не містить '"ballots"' і '"counts":{"b"'; JSON(playerView(p2)) не містить 'correctId'
    // Оля відповіла → votes.closed true, у Петра й Іри me.vote null
    // pause → votes { endsAt null, remainingMs 15_000 − (pause − at) }
  });
  it('a spare question reaches only its player in the classic round', () => {
    // Оля swap (s3 single «…» з текстом SPARE_TEXT) → playerView(p1).question.text === SPARE_TEXT, limitMs 20_000, active.spare true
    // stageView.question.text === основне q1; JSON сцени, p2, p3 не містить SPARE_TEXT
    // hostView.correct — основне; після відповіді Олі hostView.responses[p1].spare — повне запасне з correctId
    // reveal: playerView(p1).reveal — запасне без hint; playerView(p2).reveal — основне; stageView.stats не враховує відповіді Олі
    // playerView(p1) до reveal не містить 'correctId'
  });
  it('a spare on a board cell is shown to everyone', () => {
    // toOthersCell(): Оля swap → stageView.question, playerView(p2).question, hostView.correct — запасне s1
    // reveal → stageView.reveal — запасне без hint; stats із відповіддю Олі
  });
  it('a quiz without the new buffs changes nothing', () => {
    // buffQuiz() (FIRST_BUFFS): active у всіх видах має hint null, votes null, spare false; me.vote null; hostView.hints []; responses[].spare null
  });
  ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.

- [ ] **Step 3: Implement** типи й зрізи; механічно додати нові поля у веб-фабрики (`hint: null, votes: null, spare: false` у `PlayerActiveBuff`; `vote: null` у `me`; `hints: []` у `HostView`; `spare: null` у `HostResponse`). Наявні тести `views.buffs.test.ts`, що порівнюють `active` цілим через `toEqual`, отримують три поля механічно.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages apps/web/src
git commit -m "feat(engine): views for hints, audience votes and spares — each only for its owner (and the host), a spare on the board for everyone, hints cut from every reveal"
```

---

### Задача 5. Сервер: події, `answer.spare_id`, пул у налаштуваннях, історія, демо

**Files:**
- Modify: `apps/server/src/socket.ts` (`player:vote`, `host:hint`), `apps/server/src/rooms/manager.ts` (`vote`, `hint`)
- Modify: `apps/server/src/db/schema.ts` (`answer.spareId`, тип `settings` jsonb + `spares?`), `apps/server/src/quizzes.ts` (`storedSettings`, `getQuiz`), `apps/server/src/recorder.ts` (`AnswerRow.spareId`), `apps/server/src/history.ts` (`responsesOf` зі `spare`), `packages/shared/src/history.ts` (`GameResponse.spare`)
- Create: `apps/server/drizzle/0009_answer_spares.sql` і оновлені `meta/_journal.json`, `meta/0009_snapshot.json` — `pnpm --filter @quiz/server exec drizzle-kit generate --name answer_spares`; на початок файлу коментар-заголовок, як у `0008`: `-- Запасне запитання, на яке дано відповідь (план 8b): текст в історії. Старі ігри мають null.`
- Modify: `apps/server/scripts/erudite-quiz.ts`, `apps/server/scripts/demo-quiz.test.ts`
- Modify (механічно): веб-фабрики `GameResponse` (`spare: null`) у `apps/web/src/pages/*.test.tsx`
- Test: `apps/server/src/socket.test.ts`, `apps/server/src/rooms/manager.test.ts`, `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts`, `apps/server/src/quizzes.test.ts`, `apps/server/src/db/schema.test.ts` (наявні тести міграцій зелені)

**Interfaces:**
- Consumes: `voteSchema`, `hintSchema` (задача 1), `castVote`, `giveHint` (задача 2), `AnswerRecord.spare` (задача 3).
- Produces:
  ```ts
  // manager.ts
  vote(room: Room, playerId: string, askerId: string, answer: Answer): AckResult; // apply(castVote(state, playerId, askerId, answer, this.now()))
  hint(room: Room, playerId: string, text: string | null): AckResult;             // apply(giveHint(state, playerId, text))
  // db/schema.ts, answer:
  /** Запасне запитання, на яке дано відповідь; null — основне (і в старих іграх). */
  spareId: text('spare_id'),
  // quiz.settings: jsonb.$type<QuizSettings & { duels?: Duels; spares?: Question[] }>()
  // shared/history.ts, GameResponse:
  /** Запасне запитання (зі знімка гри), на яке дано відповідь; null — основне. */
  spare: Question | null;
  ```
- `storedSettings(data)`: `{ ...data.settings, ...(duels ? { duels } : {}), ...(spares ? { spares } : {}) }`; `getQuiz` розгортає `spares` назад у вікторину, як `duels`. Рядок без ключа `spares` — вікторина без поля.
- `answerRows`: рядок не-бліцу — `spareId: record.spare ?? null`; бліц і штраф — `null`; `onConflictDoUpdate` оновлює й `spareId`. Ключ змін для перезапису (`[record.accepted, record.points, …]`) не змінюється: запасне не змінюється після запису.
- `history.ts`: `spareId: answer.spareId` у вибірці; `responsesOf(given, standings, spares)` → `spare: spares.find((q) => q.id === a.spareId) ?? null` (`spares = quiz?.spares ?? []`).
- `erudite-quiz.ts`: `settings.buffs` — усі вісім (`[...BUFF_KINDS]` не імпортувати — перелічити явно, як у 8a); `hint` у чотирьох запитаннях розминки (Коцюбинський — «Автор „Intermezzo“ і „Fata morgana“»; ван Гог — «Нідерландський постімпресіоніст»; Говерла — «Чорногора»; вареники — «Варять, а не печуть»); `spares` — п'ять запитань (по одному з `single`, `multi`, `bool`, `textQ`, `numeric` з `demo-quiz.ts`, наприклад «Яка річка найдовша в Європі?» Волга, «Які з цих міст стоять на Дніпрі?», «Київ старший за Москву.», «Як називається найбільше озеро України?» Ялпуг, «Скільки областей в Україні?» 24); опис вікторини: «У кожного гравця є вісім бафів — по одному на гру.»

- [ ] **Step 1: Write the failing tests.**
  - `socket.test.ts`: `vote and hint events are role-checked and validated` — гра з `othersQuiz`-подібними налаштуваннями (через API тестів сокета): Петро відповів, Оля взяла `audience`; `player:vote` від Петра `{ askerId: Оля, answer: single b }` → `ok`; від ведучого й сцени → `forbidden`; `{ askerId: 'x' }` → `invalid_payload`; повторно → `already_answered`. Оля взяла б `hint` на іншому запитанні — `host:hint` `{ playerId: Оля, text: 'Тече' }` від ведучого → `ok`; від гравця → `forbidden`; `{ text: '' }` → `invalid_payload`.
  - `manager.test.ts`: `a swap holds the reveal for 20 s and the host may not wait` — `FakeScheduler`: решта відповіли, Оля бере `swap` на 18-й секунді 20-секундного запитання; годинник на 20 с → `phase 'question'`; ще на 18 с → `phase 'locked'`. Окремо `host:lock` раніше — `locked`.
  - `recorder.test.ts`: `a spare answer is saved under the main question with the spare id` — Оля `swap` правильно; рядок `answer` Олі з `question_index` основного запитання, `spare_id: 's1'`, `buff: 'swap'`, `points` як у стані; у решти `spare_id: null`.
  - `history.test.ts`: `responses carry the spare question` — `GameDetail.questions[0].responses` Олі має `spare` із текстом запасного й `buff: 'swap'`, у решти `spare: null`; старий рядок без `spare_id` → `spare: null`; `spare_id`, якого немає в знімку, → `spare: null`.
  - `quizzes.test.ts`: `the spare pool survives save and load; an old quiz loads without it` — збереження з `spares: [s1, s2]` і `hint` у запитанні повертає те саме; рядок вікторини без `spares` (прямий insert) читається з `spares === undefined`; `settings.buffs: ['swap']` без `spares` → 400.
  - `demo-quiz.test.ts`: тест 8a перейменувати на `the erudite quiz gives every player all eight buffs` (`allowedBuffs(eruditeQuiz)` → `[...READY_BUFFS]`, тобто всі вісім); новий `the erudite quiz has hints and a spare pool of every simple type` — `questionsOf(eruditeQuiz).filter((q) => q.hint).length === 4`; `eruditeQuiz.spares` має типи `['single', 'multi', 'boolean', 'text', 'numeric']`; у `seeding the erudite quiz` додати `expect(loaded?.spares).toEqual(eruditeQuiz.spares)`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server`. Очікується FAIL.

- [ ] **Step 3: Implement.** Події — за зразком `player:buff` (`voteSchema`/`hintSchema.safeParse(payloadOf(args))`; `host:hint` — лише ведучому, як `host:debuff`). Міграцію згенерувати командою з Files; перевірити, що SQL — рівно `ALTER TABLE "answer" ADD COLUMN "spare_id" text;`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` (за браком пам'яті PGlite — окремо `pnpm vitest run --maxWorkers=2 apps/server`). Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server packages/shared apps/web/src/pages
git commit -m "feat(server): vote and hint events, the spare pool kept with the quiz settings, a spare answer saved with its spare id and shown in the history, all eight buffs, hints and spares in the erudite demo"
```

---

### Задача 6. Редактор: поле підказки, запасні запитання, розділ без «скоро»

**Files:**
- Create: `apps/web/src/editor/SparesEditor.tsx`
- Modify: `apps/web/src/editor/QuestionEditor.tsx` (`showHint`, `showTime`; поле «Підказка»), `apps/web/src/editor/PowersEditor.tsx` (без «скоро», пояснення для `swap`), `apps/web/src/editor/QuizEditor.tsx` (розділ «Запасні запитання» після «Бафи й дебафи», перед «Дуелі»; `PowersEditor` отримує `spares`), `apps/web/src/editor/draft.ts` (`newSpare`, `cleaned` — `hint` і `spares`, `problemsOf` — пул), `apps/web/src/editor/draft-storage.ts` (`reviveSpares`)
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/editor/QuizEditor.test.tsx`, `apps/web/src/editor/draft.test.ts`, наявний тест чернетки

**Interfaces:**
- Consumes: `SIMPLE_TYPES`, `LIMITS.hintText`, `LIMITS.maxSpares`, `quiz.spares`, `READY_BUFFS` (задача 1).
- Produces:
  ```ts
  // SparesEditor.tsx
  /** Розділ «Запасні запитання»: чіпи запасних, редактор вибраного (лише тип, картинка, текст, відповідь), «Додати» / «Видалити». Порожній пул — undefined. */
  export function SparesEditor(props: { spares: Question[] | undefined; onChange: (next: Question[] | undefined) => void }): JSX.Element;
  // QuestionEditor: showHint?: boolean (типово true), showTime?: boolean (типово true); для запасних — showHint false, showTime false, showPoints false, без VideoField (types = SIMPLE_TYPES)
  // PowersEditor: props + spares: Question[] | undefined — під бафами p.meta.powers-warn «Заміна запитання: додайте запасні запитання», якщо swap увімкнено, а пул порожній
  // draft.ts
  export function newSpare(type?: QuestionType): Question; // newQuestion(type ?? 'single') з типовими часом і балами, без hint
  ```
- `QuestionEditor`: під полем тексту запитання — `label.field.hint-field` з `textarea` (`rows={2}`, `maxLength={LIMITS.hintText}`, `placeholder` «Що підкаже ведучий, якщо гравець візьме баф») і підписом «Підказка (необов'язково)»; порожнє значення прибирає ключ `hint`. `changeType` зберігає `hint` (перевірити тестом; якщо він збирає запитання з полів `base` поіменно — додати `hint`).
- `cleaned`: `hint` обрізається, порожній — ключ прибирається; `spares` — кожне через `cleanQuestion`, порожній масив → ключ прибирається.
- `problemsOf`: запасне з проблемою → «Запасне N: …» (`problemSpare`, той самий `problemKey`); `swap` увімкнено, пулу немає → `problemSparesEmpty`; коди схеми `spare_type`, `spare_video`, `duplicate_spare_ids`, `spares_empty` → ті самі тексти (на випадок підробленої чернетки).
- `draft-storage.ts`: `reviveSpares` — масив об'єктів-запитань лишається (кожне через наявне відновлення запитання, як у раундах), не масив чи порожній → ключ прибирається.
- Розмітка `SparesEditor`: `<details className="rules spares">` із `<summary>Запасні запитання</summary>` (у `QuizEditor`), `p.meta` «Для бафу «Заміна запитання»: гравець отримає наступне запасне замість поточного. Бали й час — від поточного запитання.», ряд `type-chips` з чіпами «Запасне N · {typeShort}» і «Додати запасне» (неактивна на `LIMITS.maxSpares`), під ним `QuestionEditor` вибраного і «Видалити запасне». `QuizEditor` відкриває розділ, якщо проблема стосується пулу (як `duelsOpen`).
- Тексти:
  ```ts
  sparesTitle: 'Запасні запитання',
  sparesHint: 'Для бафу «Заміна запитання»: гравець отримає наступне запасне замість поточного. Бали й час — від поточного запитання.',
  spareN: 'Запасне {index}',
  addSpare: 'Додати запасне',
  removeSpare: 'Видалити запасне',
  hintLabel: 'Підказка (необов\'язково)',
  hintPlaceholder: 'Що підкаже ведучий, якщо гравець візьме баф',
  powersSwapNeedsSpares: 'Заміна запитання: додайте запасні запитання',
  problemSparesEmpty: 'Заміна запитання: додайте запасні запитання.',
  problemSpare: 'Запасне {index}: {problem}',
  buffTip_audience: 'решта гравців голосують 15 секунд',
  buffTip_hint: 'підказка з редактора або від ведучого',
  buffTip_swap: 'інше запитання із запасних, щонайменше 20 секунд',
  ```
  Ключ `powersSoon` і клас `.powers-soon` прибрати.

- [ ] **Step 1: Write the failing tests** у `QuizEditor.test.tsx` (наявні помічники рендеру й збереження):
  ```ts
  it('all eight buffs can be chosen; «Усі» turns on all eight', async () => {
    // розгорнути «Бафи й дебафи»: жоден прапорець бафу не disabled, тексту «скоро» немає
    // «Усі» (бафи) → під бафами «Заміна запитання: додайте запасні запитання»; «Зберегти» → запиту немає, у списку проблем «Заміна запитання: додайте запасні запитання.», розділ «Запасні запитання» відкритий
  });
  it('the spare pool: add, edit, remove; saving sends the pool', async () => {
    // «Запасні запитання» → «Додати запасне» → чіпи «Запасне 1 · …»; типи лише п'ять простих (немає «Порядок», «Пари», «Ланцюжок», «Сортування»)
    // полів «Час» і «Бали», «Підказка», відео в запасному немає
    // ввести текст і варіанти single → «Зберегти» з увімкненою заміною → тіло запиту має spares [ { type 'single', text … } ], без hint
    // «Видалити запасне» (останнє) → у тілі запиту немає ключа spares
  });
  it('saving is blocked when swap is on and the pool is empty', async () => {
    // вікторина з settings.buffs ['swap'] і без spares → «Зберегти» → запиту немає, проблема видима
  });
  it('a question hint is optional; an empty one is not saved', async () => {
    // поле «Підказка (необов'язково)» є в редакторі запитання класики й клітинки поля; ввести «Тече через Київ» → тіло запиту має hint
    // очистити → ключа hint немає; змінити тип запитання → підказка лишається
  });
  ```
  Тести 8a про «скоро» й «Усі» вже оновлено в задачі 1; тут їх не чіпати.
  У `draft.test.ts`: `cleaned drops empty hints and an empty pool` і `problemsOf names the spare with a problem` («Запасне 2: …»). У тесті чернетки: `a draft keeps the spare pool and drops a broken one` — `spares: [s1]` лишається; `spares: 'x'` → ключа немає.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/editor apps/web/src/storage.test.ts`. Очікується FAIL.

- [ ] **Step 3: Implement.** Стилі: `.hint-field textarea` — шрифт ≥ 16 px; `.spares` за зразком `.duels`; `.powers-warn` — колір `--warn` (наявний токен попереджень; якщо його немає — `--spare-accent`).

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): an optional hint on every question, the «Запасні запитання» pool editor, all eight buffs selectable with a note when swap has no spares, saving blocked until it has"
```

---

### Задача 7. Телефон: підказка й голоси в блоці сталої висоти, запрошення проголосувати, запасне запитання

**Files:**
- Modify: `apps/web/src/screens/Buffs.tsx` (`BuffPanel`, `VoteSheet`, рядок пояснень для нових бафів)
- Modify: `apps/web/src/screens/PlayerScreen.tsx`
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/Buffs.test.tsx`, `apps/web/src/screens/PlayerScreen.test.tsx`

**Interfaces:**
- Consumes: `PlayerActiveBuff.hint`, `votes`, `spare`, `me.vote` (задача 4); подія `player:vote`; `BUFF_ICONS`, `buffName`.
- Produces:
  ```tsx
  /** Блок сталої висоти під рядом бафів для власного hint або audience: «Ведучий думає…» → текст, «Чекаємо голосів…» → відсотки чи здогадки. */
  export function BuffPanel(props: { active: PlayerActiveBuff; question: PublicQuestion; offsetMs: number }): JSX.Element | null;
  /** Нижній аркуш position: fixed — «Оля питає зал: як думаєте?», відлік, варіанти або поле, «Голосувати», «Пропустити». */
  export function VoteSheet(props: { prompt: VotePrompt; question: PublicQuestion; paused: boolean; offsetMs: number; send: Send; onError: (m: string | null) => void }): JSX.Element | null;
  ```
- `BuffPanel`: `section.buff-panel` (`aria-live="polite"`), лише для `active.kind` `hint` або `audience`. Підказка: `waiting` — «Ведучий думає…», `text` — «💡 {text}», `aloud` — «Ведучий підказав уголос». Голоси: `cast === 0` — «Чекаємо голосів…»; для single/multi/boolean — рядок на кожен варіант `view.question.choices` (boolean — «Так»/«Ні») з `span.vote-bar` шириною `{pct}%` і текстом «{pct} %»; для text/numeric — «Здогадки залу: Львів ×2, Київ ×1»; відлік до `endsAt` (або «Голосування закінчено», коли `closed` чи час сплив). Розмір блоку не залежить від вмісту.
- `VoteSheet`: показується, поки `prompt !== null`, час до `endsAt` не сплив і гравець не натиснув «Пропустити» для цього `asker.playerId`; single/boolean — дотик варіанта одразу шле `player:vote`; multi — вибір і «Голосувати»; text/numeric — `label.field` з полем (`inputMode="decimal"` для numeric) і «Голосувати». Після `ok` — «Голос прийнято» на 1,5 с, далі аркуш зникає (зріз і так прибирає `me.vote`). На паузі кнопки неактивні.
- `PlayerScreen` на етапі `question`: `BuffPanel` — одразу під `BuffRow` (усередині `DebuffZone`); `VoteSheet` — на рівні `main`, поза `DebuffZone` (поруч із тостами), для `me.vote`, і на етапі `question` незалежно від того, чи гравець уже відповів. Для запасного нічого окремого не потрібно (зріз уже дав запасне в `question`), лише в `.question-meta` до підпису додається `span.spare-tag` «Запасне запитання» (у тому самому рядку, без нового блоку).
- `BuffRow` idle-рядок: `swap` → `t('swapMine')`, `audience` → `t('audienceMine')`, `hint` → `t('hintMine')`.
- Тексти:
  ```ts
  hintWaiting: 'Ведучий думає…',
  hintAloud: 'Ведучий підказав уголос',
  votesWaiting: 'Чекаємо голосів…',
  votesGuesses: 'Здогадки залу: {list}',
  votesClosed: 'Голосування закінчено',
  votesLeft: 'Ще {time}',
  voteAsk: '{name} питає зал: як думаєте?',
  voteSend: 'Голосувати',
  voteSkip: 'Пропустити',
  voteThanks: 'Голос прийнято',
  spareTag: 'Запасне запитання',
  swapMine: '🔄 Запасне запитання: щонайменше 20 с',
  audienceMine: '👥 Зал голосує',
  hintMine: '💡 Підказка нижче',
  ```

- [ ] **Step 1: Write the failing tests.**
  - `Buffs.test.tsx`:
    ```tsx
    it('the buff panel keeps its size for waiting, text, votes and guesses', () => {
      // рендер BuffPanel для hint waiting / text (довгий текст на 200 символів) / aloud і для votes (0 голосів, 2 голоси, 6 здогадок):
      //   той самий клас buff-panel; у CSS-тесті (getComputedStyle після імпорту styles.css, як у наявних тестах розмірів) height однакова й overflow-y auto
    });
    it('votes show percentages per option, never which one is right', () => {
      // single 4 варіанти, counts { b: 1, c: 1 }, cast 2 → «Київ 50 %», «Одеса 50 %», «Львів 0 %»; немає класів correct/is-right
      // text → «Здогадки залу: Львів ×2, Київ ×1»; closed → «Голосування закінчено»
    });
    it('the vote sheet sends a ballot, thanks, and can be skipped', async () => {
      // prompt { asker Оля } → «Оля питає зал: як думаєте?»; дотик «Київ» → send('player:vote', { askerId: 'p1', answer: { type: 'single', optionId: 'b' } }) → «Голос прийнято»
      // «Пропустити» → аркуш зник, send не викликано; новий prompt від іншого гравця → аркуш знову є
      // після endsAt (фальшиві таймери) → аркуш зник; на паузі кнопки disabled
    });
    it('the vote sheet is fixed and does not take room in the page', () => {
      // .vote-sheet має position: fixed (getComputedStyle)
    });
    ```
  - `PlayerScreen.test.tsx`: `a hint arrives inside the panel without moving the answer` (етап question, `active.hint waiting` → «Ведучий думає…»; новий зріз з `text` → текст у тому самому `.buff-panel`; кількість дітей між рядом бафів і полем відповіді не змінилася); `voters get a sheet over the page` (`me.vote` є після власної відповіді → `.vote-sheet`, а секція «Відповідь надіслана» на місці); `the spare question replaces the question on my phone only` (зріз з `active.spare true` і запасним у `question` → текст запасного й «Запасне запитання» в рядку підпису); `another player's audience changes nothing on my screen` (новий `buffNotice` і `buffs` з чужим `audience`, але `me.vote null` (не відповів) → лише тост).

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens`. Очікується FAIL.

- [ ] **Step 3: Implement.** Стилі: `.buff-panel` — `height: 6.5rem; overflow-y: auto; box-sizing: border-box`, шрифт 16 px; `.vote-bar` — смуга `--vote-bar` під текстом рядка (абсолютно в рядку, без зміни висоти); `.vote-sheet` — `position: fixed; inset: auto 0 0 0; max-height: 60vh; overflow-y: auto; padding-bottom: env(safe-area-inset-bottom)`, над тостами за `z-index` нижче за банер дуелі; кнопки ≥ 44 px; на 360 px без горизонтальної прокрутки. `.spare-tag` — пігулка `--spare-accent`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): the hint and the audience results in a fixed-size panel, a fixed vote sheet for voters, the spare question on my phone with its tag"
```

---

### Задача 8. Сцена, пульт ведучого й історія

**Files:**
- Modify: `apps/web/src/screens/Buffs.tsx` (`HintRequests`, `StageBuffs` — рядок для заміни, `SpareMark`)
- Modify: `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/HostScreen.tsx`, `apps/web/src/pages/GameHistory.tsx`
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/StageScreen.test.tsx`, `apps/web/src/screens/HostScreen.test.tsx`, `apps/web/src/pages/History.test.tsx`

**Interfaces:**
- Consumes: `HostView.hints`, `HostResponse.spare` (задача 4), `GameResponse.spare` (задача 5), подія `host:hint`.
- Produces:
  ```tsx
  /** Запити підказки на пульті: «Оля просить підказку», поле, «Надіслати», «Підказав уголос». */
  export function HintRequests(props: { hints: HintRequest[]; send: Send; onError: (m: string | null) => void }): JSX.Element | null;
  /** Позначка відповіді на запасне: «запасне» з текстом запасного в title. */
  export function SpareMark(props: { spare: Question }): JSX.Element;
  // StageBuffs: тег swap у класиці — «🔄 Оля відповідає на запасне»; на полі (prop board) — «🔄 Оля: запасне запитання»
  ```
- Пульт: `HintRequests` — першим у панелі етапу `question` (над «Відповіді»); на кожен запит — `article.hint-request` з `h3` «{name} просить підказку», `label.field` (textarea `maxLength={LIMITS.hintText}`, підпис «Підказка»), «Надіслати» (`btn btn-primary`, неактивна з порожнім полем) → `send('host:hint', { playerId, text })`, «Підказав уголос» → `send('host:hint', { playerId, text: null })`. Рядок відповіді (класика й поле): якщо `response.spare !== null` — `SpareMark` після `BuffBadge`, а відповідь — `answerText(response.answer, response.spare)` (без `choices` основного).
- Пульт, картка запитання: якщо `view.correct?.hint` є — рядок `p.meta.hint-known` «Підказка: {hint}» під правильною відповіддю (ведучий знає, що побачить гравець з бафом).
- Сцена: `StageBuffs` як є, тег `swap` з текстом за правилом вище; на полі запасне вже в `view.question` (задача 4) — сцена показує його як звичайне запитання клітинки.
- Історія: у `li` відповіді — після значка бафу `SpareMark`; текст відповіді — `answerText(response.answer, response.spare ?? question.question)`; під іменем — `span.spare-text` «Запасне: {text}».
- Тексти:
  ```ts
  hintRequest: '{name} просить підказку',
  hintField: 'Підказка',
  hintSend: 'Надіслати',
  hintAloudBtn: 'Підказав уголос',
  stageSpare: '{name} відповідає на запасне',
  stageSpareBoard: '{name}: запасне запитання',
  spareMark: 'запасне',
  spareText: 'Запасне: {text}',
  hintKnown: 'Підказка: {hint}',
  ```

- [ ] **Step 1: Write the failing tests.**
  - `HostScreen.test.tsx`: `the host answers a hint request with text or aloud` — `hints [{ Оля }]` → «Оля просить підказку»; «Надіслати» неактивна, ввести «Тече через Київ» → `send('host:hint', { playerId: 'p1', text: 'Тече через Київ' })`; «Підказав уголос» → `{ text: null }`; `hints []` → карток немає; `correct.hint` «Тече через Київ» → «Підказка: Тече через Київ» у картці запитання. `a spare answer shows the mark and is read against the spare` — відповідь `{ type: 'boolean', value: true }` з `spare` bool → «Так» і «запасне» з `title` текстом запасного. `the host does not wait for a swap` — `overtime` з Олею після спільного кінця → «Не чекати» (як 8a).
  - `StageScreen.test.tsx`: `the stage says who answers a spare, not what it is` — `buffs [{ Оля, swap }]` у класиці → «🔄 Оля відповідає на запасне»; тексту запасного немає (його немає в зрізі). `the stage shows the hint and audience icons only` — `buffs [{ Петро, hint }, { Іра, audience }]` → «💡 Петро», «👥 Іра».
  - `History.test.tsx`: `history shows the spare text and reads the answer against it` — `responses [{ Оля, answer bool true, buff 'swap', spare bool «Чорне море солоніше за Азовське?» }]` → «Запасне: Чорне море солоніше за Азовське?», «Так», «запасне»; `spare: null` → без позначки.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens apps/web/src/pages`. Очікується FAIL.

- [ ] **Step 3: Implement.** Стилі: `.hint-request` — картка на ширину панелі, textarea 16 px; `.spare-tag`, `.spare-text` — `--spare-accent`, читаються на сцені з відстані (`.stage-buffs li` за розміром як у 8a).

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): hint requests on the host console with text or «Підказав уголос», the spare mark in responses and history, «Оля відповідає на запасне» on the stage"
```

---

### Задача 9. Наскрізний сценарій 8b і кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–8.
- Допоміжні функції файлу: `open`, `register`, `join`, `shot`, `click`, `field`, `exact`, `bodyText`, `expectNoSideScroll`, `snapshot`, `rigged`, `yOf`, а з 8a — `takeBuff(page, name)`, `pickOption(page, text)`, `numericAnswer(page, value)`. Нові локальні: `textAnswer(page, value)` — поле тексту й «Відповісти»; `vote(page, text)` — дотик варіанта в `.vote-sheet` (або поле й «Голосувати» для text/numeric).
- Сценарій 8a: крок 2 «Редактор» більше не перевіряє «скоро» й вимкнені прапорці трьох бафів (замість цього — що всі вісім прапорців активні); решта без змін.

- [ ] **Step 1: Add the scenario** `it('part 8b: hints and spares in the editor, a written hint, the audience vote with percentages and guesses, a host hint and «Підказав уголос», a spare question on one phone and on the board stage, «Не чекати» for a swap, spares in the history', …)` з `try/catch` і `snapshot()`. Підготовка:
  1. Ведучий `register(host, 'host', 'Олег Ведучий', 'host8b@example.com')`. Вікторина «Бафи 2» через `host.request.post(`${base}/api/quizzes`, { data })`, `settings: { leaderboard: 'end', buffs: ['audience', 'hint'] }` (заміну ввімкне редактор), без `spares`, усі раунди `shuffleOptions: false`, `speedBonus: false`, `rules: DEFAULT_RULES`:
     - **Раунд 1, класика** «Розминка»:
       - `q1` single «Найдовша річка України?» — «Дніпро» (правильний), «Дністер», «Південний Буг», «Десна»; 100 балів, 30 с; `hint: 'Тече через Київ'`;
       - `q2` numeric «Скільки областей в Україні?» — 24, допуск 0; 100 балів, 30 с;
       - `q3` text «Столиця Галичини?» — «Львів»; 100 балів, 30 с;
       - `q4` single «Найвища гора України?» — «Говерла» (правильний), «Піп Іван», «Петрос»; 100 балів, 5 с.
     - **Раунд 2, поле** «Поле», `answerMode: 'phone'`, `check: 'auto'`, порядок за приєднанням (без кубиків): «Міста», «Річки», «Гори» по 3 клітинки single (100/200/300).
  2. **Редактор.** Ведучий відкриває «Бафи 2» зі списку `/quizzes`. У редакторі `q1` поле «Підказка (необов'язково)» містить «Тече через Київ»; кадр `buff8b-editor-hint`. «Бафи й дебафи»: жодного «скоро», ставить «Заміна запитання» → «Заміна запитання: додайте запасні запитання»; «Зберегти» → помилка «Заміна запитання: додайте запасні запитання.», розділ «Запасні запитання» відкрився; кадр `buff8b-editor-empty`. «Додати запасне» тричі:
     - «Запасне 1» — тип «Так/ні» (`typeShort_boolean`), текст «Чорне море солоніше за Азовське?», правильна — «Так»;
     - «Запасне 2» — тип «Текст», «Столиця Буковини?», прийнятна «Чернівці»;
     - «Запасне 3» — тип «Число», «Скільки днів у високосному році?», 366.
     У запасному немає полів «Час», «Бали», «Підказка»; кадр `buff8b-editor-spares`. «Зберегти» → збережено. На 375 px — `expectNoSideScroll(host, 'buff8b-editor-375')`, потім 1280 × 900.
  3. Гра: `stage` 1600 × 900, `olya` 375 × 812, `petro` 360 × 740, `ira` 390 × 844. Приєднуються Оля, Петро, Іра. У кожного телефона ряд із трьох кнопок «👥 💡 🔄».

- [ ] **Step 2: Assertions and shots** (у такому порядку; рахунки — без бонусу швидкості й мінуса):
  1. **Підказка з редактора (`q1`).** Оля бере «💡» (два дотики) → у `.buff-panel` «💡 Тече через Київ»; кадр `buff8b-hint-written` (375 px); `expectNoSideScroll(olya, 'buff8b-hint-375')`. `bodyText` сцени, Петра й Іри не містить «Тече через Київ»; на сцені «💡 Оля» й сповіщення «Оля: Підказка ведучого». Оля й Петро «Дніпро», Іра «Дністер». Закрити, розкрити: «Тече через Київ» на сцені немає й тепер. Рахунки: Оля 100, Петро 100, Іра 0.
  2. **Запитання в залі (`q2`, число).** Петро вводить 24, Іра — 25. Запам'ятати `y` блоку `.question` у Петра. Оля бере «👥» → у Петра й Іри нижній аркуш «Оля питає зал: як думаєте?»; кадр `buff8b-vote-sheet` (Петро, 360 px); `y` `.question` у Петра той самий. Петро голосує 24, Іра — 25 (поле й «Голосувати») → «Голос прийнято». В Олі в `.buff-panel` «Здогадки залу: 24 ×1, 25 ×1»; кадр `buff8b-vote-guesses`. Сцена не містить «Здогадки». Оля вводить 24. Розкриття → Оля 200, Петро 200, Іра 0.
  3. **Підказка від ведучого, заміна й голосування з текстом (`q3`).**
     - Іра дотик «👥» → «Поки ніхто не може проголосувати.» (ніхто ще не відповів).
     - Петро бере «💡» → «Ведучий думає…». Запам'ятати `y` поля відповіді в Петра. У ведучого «Петро просить підказку»; кадр `buff8b-hint-request`; ведучий вводить «Місто Лева» → «Надіслати» → у Петра в `.buff-panel` «💡 Місто Лева», `y` поля відповіді той самий; сцена, Оля й Іра не містять «Місто Лева».
     - Оля бере «🔄» → на телефоні Олі «Чорне море солоніше за Азовське?» з «Так»/«Ні», у рядку підпису «Запасне запитання», рядок пояснень «🔄 Запасне запитання: щонайменше 20 с»; кадр `buff8b-swap-phone` (375 px); `expectNoSideScroll(olya, 'buff8b-swap-375')`. Сцена показує «Столиця Галичини?» і «🔄 Оля відповідає на запасне»; `bodyText(stage)` не містить «Чорне море»; кадр `buff8b-swap-stage`.
     - Петро вводить «Львів». Іра бере «👥» → у Петра аркуш, Петро голосує «Львів» → в Іри «Здогадки залу: Львів ×1». Іра вводить «Львів». Оля «Так».
     - Розкриття: в Олі — правильна відповідь «Так» на запасне; у ведучого біля Олі «запасне» і «Так»; кадр `buff8b-swap-reveal-host`. Рахунки: Оля 300, Петро 300, Іра 100.
  4. **Заміна й «Не чекати» (`q4`, 5 с).** Іра бере «💡» → «Ведучий думає…»; ведучий «Підказав уголос» → в Іри «Ведучий підказав уголос». Петро бере «🔄» → «Столиця Буковини?» з полем тексту й таймером ~0:20. Оля й Іра «Говерла». Після спільних 5 с: сцена «Чекаємо: Петро · 0:1…»; кадр `buff8b-swap-wait-stage`; у ведучого «Не чекати» → `locked`. Розкриття → Петро без відповіді: Оля 400, Петро 300, Іра 200.
  5. **Поле.** «Наступний раунд» → заставка → поле. Оля вибирає «Міста» 100, відповідає правильно, ведучий «Прийняти» → Оля 500. Петро вибирає «Річки» 100, бере «👥» → у Олі (375 px) й Іри аркуш одразу (на полі голосують усі, крім вибравшого); кадр `buff8b-vote-board-375` (Оля); Оля й Іра голосують за правильний варіант → у Петра «… 100 %»; сцена без відсотків. Петро відповідає правильно, «Прийняти» → Петро 400. Іра вибирає «Гори» 100, бере «🔄» → на сцені й у всіх телефонах «Скільки днів у високосному році?»; кадр `buff8b-swap-board-stage`; Іра вводить 366, ведучий «Прийняти» → Іра 300.
  6. **Історія.** Ведучий «Завершити гру» (підтвердити) → `/history` → «Бафи 2»: таблиця Оля 500, Петро 400, Іра 300; у `q3` в Олі «🔄», «запасне», «Запасне: Чорне море солоніше за Азовське?» і «Так»; у `q1` «💡» в Олі; у клітинці «Гори» в Іри «Запасне: Скільки днів у високосному році?» і 366; кадр `buff8b-history-host`. `expectNoSideScroll(olya, 'buff8b-phone-375')` на фінальному екрані.
  7. `expect(problems).toEqual([])`.

- [ ] **Step 3: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв (зокрема 8a з оновленим кроком редактора). Потім той самий запуск з `E2E_SHOTS=1` і перегляд кадрів у `apps/server/e2e/artifacts/shots`:
  - `.buff-panel` однакової висоти з «Ведучий думає…», текстом і здогадками; довгий текст прокручується всередині;
  - аркуш голосування не перекриває шапки й не зсуває запитання; кнопки ≥ 44 px на 360–375 px;
  - запасне на телефоні читається як запасне («Запасне запитання» в рядку підпису); сцена в класиці не має тексту запасного, на полі показує його як запитання клітинки;
  - пульт: картка запиту підказки не ламає панель; «запасне» біля відповіді;
  - історія показує текст запасного й той самий рахунок, що й таблиця.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts
git commit -m "test: part 8b end-to-end — hints and spares in the editor, a written hint, the audience vote on the phone and the board, a host hint and «Підказав уголос», a spare on one phone and on the board stage, «Не чекати» for a swap, spares in the history"
```

Після фінальної рецензії гілку злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`. У звіті власникові назвати рішення: усі вісім бафів готові, «Усі» вмикає й заміну (тоді потрібен пул); у класиці голосують ті, хто вже має відповідь, і хто відповів під час голосування, теж може голосувати; голос — один, без зміни; голосування закінчується за 15 с, з відповіддю гравця з бафом або із закриттям запитання; у текстових і числових — список до шести здогадок; запит підказки ніколи не тримає запитання, ведучий відповідає текстом або «Підказав уголос»; підказку з редактора бачить і ведучий (у своїй картці запитання), сцена й гравці — ніколи, навіть на розкритті; заміна діє на будь-якому запитанні, де діють бафи (і на порядку чи парах), а запасні — лише п'ять простих типів без відео; час і бали запасного в редакторі не задаються — беруться з поточного; на полі бонусу швидкості немає, тож час запасного рахується як для звичайної клітинки; запасне, видане вилученому гравцю, не повертається в пул; міграція `0009` лише додає `answer.spare_id`; «Великий ерудит» отримав вісім бафів, чотири підказки й п'ять запасних.
