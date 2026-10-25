# План 11c: Пульт — хто що відповів наживо

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 11c специфікації `docs/superpowers/specs/2026-10-25-after-formats-design.md` (розділ 7, п. 2 побажань). Слова власника: «Ведучий дуже часто не бачить що коїться, як відповідають на питання». Ведучий має бачити, хто що відповів, наживо, під час запитання, ще до розкриття:
- **Одна панель «Відповіді наживо»** на пульті для кожного запитання будь-якого типу й раунду: класика, бліц, поле, фінал, «Ва-банк», «Вибування» (і випробування «на межі»), «Мільйонер», дуель, команди.
  - Стоїть **першою під запитанням** (після рядка таймера), над рештою панелей.
  - До 8 рядків, далі прокрутка в самій панелі.
  - Лічильник «Відповіли N з M» у рядку етапу стає кнопкою, яка прокручує до панелі.
- **Шапка:** «Відповіли 5 з 8» і чипи «Чекаємо: Оля, Петро». Відсутні сірі, з позначкою «поза зв'язком». На закритому запитанні (`locked`) підпис «Не відповіли».
- **Рядок гравця чи команди:**
  - ім'я;
  - відповідь людською мовою (`answerText`);
  - час;
  - баф;
  - запасне запитання;
  - підказка «Хто я?»;
  - **попередній вердикт автоперевірки** кольором: «правильно» / «частково» / «ні»;
  - позначка «чекає рішення», якщо відповідь чекає «Прийняти» чи ручної оцінки.
- **Типи з поступом:**
  - ланцюжок — відгадано N з M, поточне слово, підказки;
  - сортування — поточна картка, розкладено N з M, помилки;
  - стіна — знайдені групи, помилки, «склав» / «замкнено»;
  - блеф — вигадка (фаза вигадок) і вибір (фаза вибору);
  - «100 до 1» — рядок дошки, у який влучила кожна відповідь;
  - повзунок — відстань до правильного;
  - фінал — ставка;
  - удача «Вибування» — вибрані двері;
  - дуель — спроби обох дуелянтів і відповідь, що виграла.
- **Бліц:** у панель переїжджає наявна черга (миттєва з часами чи черга натискань з кнопками «Правильно / Неправильно» для усної відповіді) без зміни розмітки.
- **Згорнуті списки:** привиди «Вибування» (їхні відповіді «для себе») і зал «Мільйонера» — окремим `<details>` під рядками.
- **Командна гра:**
  - рядок на команду, ім'я — назва команди;
  - «діє: Оля» — хто з команди зараз діє (капітан, у бліці — той, хто натиснув);
  - поки відповіді немає, жива **чернетка** капітана курсивом з позначкою «чернетка».
- **Кнопки «Прийняти / Частково / Відхилити / Перевибрати»** лишаються в тих панелях, де вони діють зараз.
- **Хто бачить:** лише роль `host`. `stageView` і `playerView` не отримують нічого нового. Чернетки йдуть пульту з пам'яті кімнати, у стан гри не потрапляють.

**Стан гри не змінюється:** `GAME_STATE_VERSION` той самий, нових ключів `GameState` немає, `restore.ts` не змінюється. Новий лише зріз пульта: `HostView.live`. Пуш живих ігор не обриває.

**Архітектура:**
- **Shared (`packages/shared/src/views.ts`).** Типи `LiveVerdict`, `LiveProgress`, `LiveRow`, `LiveAside`, `HostLive`. Нове поле `HostView.live: HostLive | null`.
- **Рушій (новий `packages/engine/src/live.ts`).**
  - Чиста функція `hostLive(state): HostLive | null` збирає рядки зі стану (записи, бафи, поступ ланцюжка / сортування / стіни, вигадки й вибори блефу, ставки фіналу, відповіді привидів і залу, випробування, дуель).
  - Попередній вердикт там, де запису ще немає або він не остаточний, рахує `verdictOf` (поле, голова черги бліцу, ручний фінал, випробування, друга спроба).
  - `spareOf` і `responseClue` переїжджають з `views.ts` у `live.ts` (експорт), `views.ts` імпортує їх звідти — без циклічного імпорту.
  - `views.ts`: `hostView(...).live = hostLive(state)`.
- **Сервер (`apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`).**
  - `RoomManager.view` для ролі `host` додає до рядків `live` чернетки з `room.drafts` через наявний `liveDraft`.
  - Подія `draft` перезбирає зріз і пульту (крім товаришів по команді).
- **Веб.**
  - Новий `apps/web/src/screens/LiveAnswers.tsx`: панель, рядки, чипи, згорнуті списки, тексти поступу.
  - `HostScreen.tsx`: місце панелі, приховування дублікатів, бліц усередині панелі, лічильник-кнопка.
  - `DuelView.tsx`: `HostDuelPanel` показує рядки дуелі замість рядків «спроби».
  - `i18n.ts`: тексти `live*`.
  - `styles.css`: `.live-answers` і повʼязані класи.
- **Довідка ведучого (`apps/web/src/help/settings.ts`, `help/teams.ts`).** Новий запис `setting.live` і рядок про чернетку в `team.captain`.
- **Наскрізні тести.** Два сценарії 11c з кадрами `p11c-`, підлаштування наявних сценаріїв, що дивилися на сховані панелі.

**Технології:** TypeScript, vitest, Fastify + Socket.IO, React 19 + Vite, Testing Library (jsdom), Playwright. Нових залежностей немає.

**Рішення плану там, де специфікація мовчить (і рішення координатора):**

*Коли панель є*
- `hostLive` не `null` лише тоді, коли йде відповідь:
  - етапи `question` і `locked` будь-якого раунду (зокрема запитання клітинки поля, бліц, фінал, «Ва-банк», «Вибування», «Мільйонер»);
  - етап `leaderboard` з відкритим випробуванням «Вибування» (`trialOpen`) — `kind: 'trial'`;
  - етап `duel` на етапах дуелі `question` і `answer` — `kind: 'duel'`.
- `locked` включено: це «до розкриття». Ведучий ще бачить, хто що відповів, поки не натиснув «Показати відповідь».
- На `reveal` і далі панелі немає. Там працюють наявні панелі: «Відповіді» з кнопками оцінки, прогрес ланцюжка / сортування / стіни, розкриття фіналу, спроби бліцу.
- Етап `wager` фіналу: панелі немає. Наявна панель ставок уже показує, хто поставив, а хто «ще думає», і саме вона — «відповіді наживо» цього етапу.

*Хто в рядках (`rows`) і хто в лічильнику*
- Рядки — **усі**, хто має відповідати, у порядку гравців: і ті, хто відповів, і ті, хто ще ні. Порядок сталий, рядки не стрибають під пальцем ведучого. Чипи «Чекаємо» — ті з них, у кого `answered === false`. Список рядків під шапкою показує тих, хто відповів, має поступ (`progress` не `null` і є хоч один хід) або має чернетку.
- `answered` / `total` у `HostLive` рахуються з `rows`.
- Хто має відповідати:

  | Раунд / випадок | `rows` | `aside` |
  |---|---|---|
  | класика, фінал, бліц | `state.players` (у командній грі — команди) | — |
  | опитування, «хмара» в командній грі | `voterList(state)` (люди) | — |
  | «Ва-банк» | `wipeoutIn(state)` | — (вибулі відповідати не можуть) |
  | «Вибування» | `survivalAlive(state)` | `ghosts`: решта гравців з відповідями «для себе» (`play.survival.ghosts`) |
  | «Мільйонер» | учасник (`play.ladder.contestantId`) | `hall`: решта гравців (записи залу) |
  | поле (звичайна клітинка) | той, хто вибрав (`play.board.chooserId`) | — |
  | випробування (`trial`) | ті, хто «на межі» (`edgeNow`) | — |
  | дуель | дуелянти: виклик і суперник | — |

- Відсутні (`connected === false`) лишаються в рядках і чипах, сірі, з «поза зв'язком». `connected` береться з `PlayerState.connected` (для команди — так, як рушій уже рахує його для команди), для людей командної гри — з `TeamMember.connected`.

*Що в рядку*
- `answer`:
  - запис поточного запитання (`recordOf`);
  - інакше відкладена перша відповідь другої спроби (`buffOf(play, id)?.first?.answer`);
  - на полі до «Прийняти» — `play.board.answer`;
  - у бліці — відповідь у черзі (`blitz.queue`) чи в живій черзі миттєвого бліцу;
  - у випробуванні — `trial.answers[id].answer`;
  - привида — `ghosts[id].answer`.

  Для ланцюжка, сортування, стіни, блефу й дуелі `answer` — `null`: зміст іде в `progress`.
- `answered`:
  - є запис або відкладена перша відповідь (як `answeredCount`);
  - на полі — ще й `board.answer !== null`;
  - блеф — вигадка у фазі вигадок, вибір у фазі вибору (як `answeredCount`);
  - ланцюжок, сортування, стіна — є запис (пройшов, розклав усе чи склав / замкнув стіну);
  - випробування — є відповідь чи вибрані двері;
  - дуель — гравець виграв запитання.
- `verdict` (`'correct' | 'partial' | 'wrong' | null`):
  - є запис і він остаточний → `record.grade`. Тобто оцінка ведучого вже врахована (`overridden`);
  - ручний фінал (`round.check === 'manual'`) і гравця ще немає в `final.graded` → попередній `verdictOf(question, answer, timeMs).grade`, `awaiting: true`;
  - поле до «Прийняти» → попередній `verdictOf(questionFor(state, play, id), board.answer, 0).grade`, `awaiting: true`;
  - бліц: голова черги з відповіддю → попередній вердикт, `awaiting: true`; розглянута спроба → її `grade`; миттєвий бліц → `BlitzRow.grade` (null — ще не перевірено);
  - відкладена перша відповідь → `first.grade`;
  - випробування → `trial.answers[id].correct ? 'correct' : 'wrong'`;
  - привид → `ghosts[id].correct ? 'correct' : 'wrong'`;
  - блеф у фазі вибору → вибрав правду — `'correct'`, інакше `'wrong'`; у фазі вигадок — `null`;
  - опитування, «хмара» → `null` (голос без вердикту, як `HostResponse`);
  - ланцюжок, сортування, стіна → `null` (бали рахуються при закритті; видно поступ);
  - усна відповідь (поле чи бліц уголос, `answer === null`) → `null`, `awaiting: true`.
- `awaiting` — відповідь чекає дії ведучого: «Прийняти» (поле, бліц з автоперевіркою), ручна оцінка (поле, бліц, фінал), усна відповідь. Інакше `false`.
- `timeMs`:
  - з запису;
  - для блефу — час вибору (`BluffPick`);
  - для бліцу — `BuzzEntry.timeMs`;
  - для випробування — `TrialAnswer.timeMs`;
  - інакше `null`.
- `buff` — `buffOf(play, id)?.kind ?? null`, тобто й тоді, коли гравець ще думає («узяв 50/50»). `spare` — `spareOf(state, record?.spare ?? buffOf(play, id)?.spare?.id)`. `clue` — `responseClue` для записів, інакше `null`.
- `actor` (лише командна гра, інакше `null`) — нікнейм того, хто зараз діє за команду:
  - бліц: `play.buzzers[team]`, якщо він на зв'язку, інакше капітан;
  - дуель: `duelistOf`;
  - решта: `captainOf`.
- `draft` — рушій завжди дає `null`, заповнює сервер.
- `progress`:

  | Тип | `progress` |
  |---|---|
  | ланцюжок | `{ kind: 'chain', solved, total: words.length − 1, word: words[solved + 1] ?? null, hints }` з `chainOf` (поточне слово ведучий і так знає — це його ключ) |
  | сортування | `{ kind: 'sort', card, sorted, total, misses }` з `sortOf`; `card` — текст `queue[0]` (null — усе розкладено) |
  | стіна | `{ kind: 'wall', found, groups, mistakes, locked, solved }`, ті самі числа, що `WallRow` у `wallInfo(state, true)` |
  | блеф | `{ kind: 'bluff', stage, lie: lies[id]?.text ?? null, pick: текст вибраного варіанта ?? null }` |
  | «100 до 1» | `{ kind: 'survey', ranks }`: для кожного значення — місце влученого рядка (як `SurveyRowView.rank`) чи `null` |
  | фінал | `{ kind: 'wager', wager: final.wagers[id] ?? null, allIn }` (знімок `play.final`, якщо він є) |
  | удача випробування | `{ kind: 'door', picked: trial.doors[id] ?? null }` — пастки не показуються |
  | дуель | `{ kind: 'duel', tries: тексти неправильних спроб, won: відповідь, що виграла, ?? null }` (те саме, що `hostDuel` бере для `tryTexts` і `winningAnswer`) |
  | решта | `null` |

  - Повзунок: відстань рахує веб з `correct` (`|value − correct|`), окремого `progress` немає.
  - Точка: `answerText` уже пише «Точка за N % від правильної».
- **Ланцюжок: «помилки» = підказки.** Неправильних спроб ланцюжка рушій не зберігає (`ChainProgress` — `solved`, `shown`, `hints`). Специфікація забороняє нові дані стану, тож рядок показує відкриті підказки. Чи потрібні саме помилкові спроби — питання власникові.
- **Випробування «Вибування»: відповідь видно ведучому наживо.** У 10h `SurvivalRow.answer` сховано до закриття і для пульта. 11c показує її в `live` (лише пульт): це прямо бажання власника бачити все під час відповіді. `SurvivalRow` не змінюється.
- **«Більшість зараз» не робимо.** Рушій не рахує вибору команди більшістю без подання: відповідь команди — це відповідь капітана (опитування й «хмару» кожна людина проходить сама, і рядки там — люди).
- **Живий рух сортування** на полі додасть 11d. 11c показує поточну картку.

*Бліц*
- `kind: 'blitz'` (бліц-раунд і бліц-клітинка поля). Рядки — усі гравці (команди) з `answered`: у миттєвому — чи є рядок у `blitz.rows`, у бліці з кнопкою — чи гравець у черзі чи вже мав спробу. Відповідь і вердикт — за правилами вище.
- Панель на пульті малює **наявну** розмітку черги (`BlitzQueue` у миттєвому бліці; список `blitz.queue` з кнопками «Правильно / Неправильно» для усної голови), перенесену всередину `LiveAnswers`, з тими самими класами (`.blitz-queue`, `li.is-pending`). На них тримаються наскрізні тести 7a, 7b і 9a.
- Чипи «Чекаємо» — лише в миттєвому бліці. У бліці з кнопкою шапка — «у черзі: N» (`blitzQueued`), без чипів.
- Чернетки команд у бліці (той, хто натиснув, пише) — окремим рядком «чернетка» під чергою, для команд з `draft !== null`.
- Панель «Спроби» бліцу лишається окремою, як зараз.

*Дуель*
- `kind: 'duel'`, два рядки. `HostDuelPanel` малює `LiveAnswers` у режимі `compact` одразу під текстом запитання й таймером дуелі, замість рядків `duelTryTexts`. Окремого слота над панелями в дуелі немає: на етапі `duel` іншого запитання на пульті немає, а панель дуелі має кнопки категорій і «Скасувати дуель».

*Місце на пульті й що ховається*
- Слот панелі: після панелі запитання й рядка таймера (`.host-time`), перед аудіо й рештою панелей (рішення, ставки, бліц, підказки, поле, ланцюжок …). Панелі раундів (`HostWipeout`, `HostLadder`, `HostSurvival`) лишаються над запитанням, як зараз. Для випробування «Вибування», де панелі запитання немає, слот стоїть перед `HostSurvival`.
- Поки `view.live !== null`, **ховаються** дублікати без кнопок:
  - класична панель «Відповіді» (її кнопки оцінки діють лише на `reveal`, а там вона знову є);
  - панелі «Ланцюжок» і «Сортування»;
  - таблиця стіни `WallTable` (ключ стіни `WallReveal` лишається: це правильні групи для ведучого);
  - старі панелі черги бліцу (вони тепер у слоті);
  - панель «Відповіді» поля, якщо в ній немає кнопок (`canGradeBoard === false`).
- **Лишаються** панелі з діями:
  - «Відповідь чекає на рішення» («Прийняти», «Перевибрати», оцінка);
  - ручна оцінка фіналу;
  - «Відповіді» поля з кнопками оцінки (`canGradeBoard`);
  - «Спроби» бліцу;
  - запити підказок;
  - блеф (прибрати вигадку);
  - «хмара» (сховати слово);
  - стовпчики опитування;
  - дошка «100 до 1».
- Фікстури тестів вебу мають `live: null`, тож наявні тести `HostScreen` бачать старі панелі й не змінюються.

*Шапка й прокрутка*
- Лічильник у рядку етапу (`answeredOf` / `blitzQueued`) рахується, як зараз. Коли `view.live !== null`, він стає `<button type="button" className="link-button live-jump">` з `aria-label` «До відповідей наживо». Дотик викликає `document.getElementById('live-answers')?.scrollIntoView({ block: 'start' })`. Без панелі — звичайний текст, як зараз.
- Панель: `<section id="live-answers" className="panel live-answers" aria-labelledby="live-answers-title">`. Рядки — `<ul className="live-rows">` з `max-height` на ~8 рядків і `overflow-y: auto`.
- Класи панелі — свої (`live-rows`, `live-answer`, `live-chip`, `live-draft`), а не `.rows` / `.given`. Так наскрізні тести, що шукають `.rows li` з `.given` у класичній панелі, не ловлять двох однакових рядків і не падають у суворому режимі Playwright.

*Командні чернетки (сервер)*
- `RoomManager.view(room, identity)`: для `host` — `this.withLiveDrafts(room, hostView(room.state))`.
  - Без `live` чи поза командною грою зріз той самий.
  - Інакше кожен рядок `live.rows` отримує `draft: this.liveDraft(room, row.id)?.draft ?? null`.
- Пульт бачить і чернетку капітана, і чернетку того, хто натиснув у бліці. Застаріла чернетка відсікається тим самим `liveDraft`: інше запитання, автор уже не діє за команду, відповідь команди змінилася.
- `socket.ts`, подія `draft`: адресати — товариші автора по команді **і всі сокети ролі `host`**. Сцена, автор та інші команди, як і раніше, нічого не отримують.
- `snapshot` (збережена кімната) чернеток як не мав, так і не має.

*Чого не робимо*
- нових полів стану й підняття версії;
- кнопок оцінки всередині рядків панелі (вони лишаються, де є);
- показу вердикту чи чужих відповідей на сцені й телефонах;
- живого руху сортування (це 11d);
- лічильника помилкових спроб ланцюжка;
- показу пасток удачі ведучому;
- зрізу «відповіді наживо» в грі без ведучого (11g: пульта там немає);
- нового демо-вмісту (тексти e2e — без тем росії й СРСР).

## Глобальні обмеження

- **Анти-ціль:** відповіді наживо, вердикти й чернетки команд потрапляють лише на пульт. Задача 1 перевіряє `stageView` і `playerView` (немає ключа `live`, JSON без текстів відповідей інших гравців). Задача 3 перевіряє, що чернетка не йде сцені, автору й іншій команді.
- Логіка рушія, бали, `GameState` і `restore.ts` не змінюються. `hostView(...).responses` той самий.
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`, тексти довідки — лише в `apps/web/src/help/*.ts`.
- Пульт 1280 і 375 px без горизонтальної прокрутки. Сцена 1280 × 720 і телефони не змінюються.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2`. Якщо PGlite падає з браком пам'яті, запускати окремо:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=1 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- Наскрізні тести: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts`.
  - **Повний прогін триває близько 30 хвилин, і машині може забракнути пам'яті.** Задача 7 запускає свої сценарії (`-t "part 11c"`), а повний прогін — **один раз у фоні** наприкінці.
  - Кадри лежать в `apps/server/e2e/artifacts/shots`, префікс 11c — `p11c-`.
- Новий вміст (тексти e2e) — без тем росії й СРСР.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать. Версія стану не змінюється, тож пуш живих ігор не обриває.

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/views.ts` | типи `LiveVerdict`, `LiveProgress`, `LiveRow`, `LiveAside`, `HostLive`; `HostView.live` | 1 |
| новий `packages/engine/src/live.ts`, новий `live.test.ts`, `views.ts`, `index.ts` | `hostLive` для відповідей, фіналу, поля, «Ва-банк», «Вибування» з привидами, «Мільйонера» із залом, голосів, команд; `spareOf` / `responseClue` переїжджають | 1 |
| `apps/web/src/screens/HostScreen.test.tsx` та інші фікстури `HostView` у вебі (лише `live: null`) | фікстури | 1 |
| `packages/engine/src/live.ts`, `live.test.ts` | ланцюжок, сортування, стіна, блеф, «100 до 1», бліц, випробування, дуель | 2 |
| `apps/server/src/rooms/manager.ts`, `manager.test.ts`, `apps/server/src/socket.ts`, `socket.test.ts` | чернетки пульту | 3 |
| новий `apps/web/src/screens/LiveAnswers.tsx`, новий `LiveAnswers.test.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css` | панель | 4 |
| `apps/web/src/screens/HostScreen.tsx`, `HostScreen.test.tsx`, `apps/web/src/screens/DuelView.tsx`, `DuelView.test.tsx` | місце панелі, дублікати, бліц, дуель, лічильник-кнопка | 5 |
| `apps/web/src/help/settings.ts`, `help/teams.ts`, `help/host-help.test.ts`, `LiveAnswers.tsx` (кнопка «ⓘ») | `setting.live`, рядок у `team.captain` | 6 |
| `apps/server/e2e/full-game.e2e.ts` | сценарії 11c, підлаштування наявних | 7 |

## Порядок збирання

- 1 → 2 → 4 → 5. Задача 3 — після 1 (потрібен `HostView.live`), паралельно з 2 і 4. Задача 6 — після 4 (кнопка «ⓘ» у шапці панелі). Задача 7 — остання.
- **Навмисні зміни наявних очікувань** (лише такі):
  - фікстури `HostView` у тестах вебу: + `live: null` (задача 1);
  - `manager.test.ts`, тест «the captain draft lives in room memory and reaches only the teammates on the same question»: `HOST` переходить зі списку «не бачить чернетки» до тих, хто бачить її в `live.rows` (задача 3);
  - `socket.test.ts`, тест «the captain draft reaches only the teammates: not the other team, the stage or the host»: назва — «… not the other team or the stage; the host sees it in live answers». `host` прибирається з перевірок «нічого не прийшло» й «не містить», додається перевірка, що пульт отримав зріз із чернеткою (задача 3);
  - `DuelView.test.tsx`: рядки `duelTryTexts` на пульті замінює панель дуелі, якщо тест їх звіряє (задача 5);
  - `host-help.test.ts`, якщо звіряє буквально перелік чи кількість записів налаштувань (задача 6);
  - наскрізні сценарії, що дивилися на сховані під час запитання панелі (задача 7, перелік там).
  - Якщо падає інше, рецензент розбирає причину, а не правку очікування.

## На що дивитися рецензентові

1. **Лише пульт.** Ключа `live` немає у `stageView` і `playerView`. Чернетка не доходить до сцени, автора й іншої команди. JSON зрізів сцени й телефона без чужих відповідей. Тести: задачі 1 і 3.
2. **Хто в рядках.** Таблиця «Хто має відповідати» — тест на рядок: «Ва-банк» без вибулих, «Вибування» з привидами в `aside`, «Мільйонер» з учасником у `rows` і залом в `aside`, поле — лише той, хто вибрав, команди — команди, голоси команд — люди. Тести: задачі 1 і 2.
3. **Вердикт.** Остаточний — з запису (з оцінкою ведучого). Попередній з `awaiting` — для поля, бліцу, ручного фіналу. Голоси, ланцюжок, сортування, стіна й фаза вигадок блефу — без вердикту. Тести: задачі 1 і 2.
4. **Коли панель є.** `question`, `locked`, відкрите випробування, дуель на `question` / `answer`. На `reveal`, `wager`, `leaderboard` без випробування — `null`. Тести: задачі 1 і 2.
5. **Стан гри.** `GAME_STATE_VERSION`, `restore.ts`, `STATE_SHAPE` не змінено. `hostLive` не змінює `state` (тест на заморожений стан).
6. **Пульт.** Панель у слоті одразу після запитання й таймера. Дублікати без кнопок сховані лише поки `live !== null`. Кнопки «Прийняти / Частково / Відхилити / Перевибрати» на своїх місцях. Бліц — та сама розмітка черги. Лічильник прокручує. Тести: задачі 4 і 5.
7. **E2E.** Кадри `p11c-*`; на 375 px панель видно без прокрутки на запитанні без картинки. Кожна правка наявного сценарію названа в звіті задачі 7.

---

### Задача 1. Зріз пульта: `HostView.live` для відповідей, фіналу, поля, «Ва-банк», «Вибування», «Мільйонера», голосів і команд

**Files:**
- Modify: `packages/shared/src/views.ts`
- Create: `packages/engine/src/live.ts`, `packages/engine/src/live.test.ts`
- Modify: `packages/engine/src/views.ts`, `packages/engine/src/index.ts`
- Test: фікстури `HostView` у вебі (`apps/web/src/screens/HostScreen.test.tsx`, `ladder-fixtures.ts`, `team-test-view.ts` чи інші, що впадуть на `typecheck`) — лише `live: null`

**Interfaces:**
- `packages/shared/src/views.ts`, після `HostResponse`:
  ```ts
  /** Вердикт автоперевірки для пульта (11c): видно лише ведучому й ще до розкриття. */
  export type LiveVerdict = 'correct' | 'partial' | 'wrong';

  /** Поступ у рядку «Відповідей наживо» для типів, де відповідь — не один вибір (11c). */
  export type LiveProgress =
    | { kind: 'chain'; solved: number; total: number; word: string | null; hints: number }
    | { kind: 'sort'; card: string | null; sorted: number; total: number; misses: number }
    | { kind: 'wall'; found: number; groups: number; mistakes: number; locked: boolean; solved: boolean }
    | { kind: 'bluff'; stage: 'lies' | 'choice'; lie: string | null; pick: string | null }
    | { kind: 'survey'; ranks: (number | null)[] }
    | { kind: 'wager'; wager: number | null; allIn: boolean }
    | { kind: 'door'; picked: number | null }
    | { kind: 'duel'; tries: string[]; won: string | null };

  /** Рядок «Відповідей наживо»: гравець, команда чи людина (голоси командної гри). */
  export interface LiveRow {
    id: string;
    /** Нікнейм; для команди — назва команди. */
    nickname: string;
    connected: boolean;
    /** Подав відповідь (див. план 11c, «Що в рядку»). */
    answered: boolean;
    /** null — ще не відповів, усна відповідь або тип із поступом (див. progress). */
    answer: Answer | null;
    timeMs: number | null;
    verdict: LiveVerdict | null;
    /** Чекає дії ведучого: «Прийняти», ручна оцінка чи усна відповідь. */
    awaiting: boolean;
    buff: BuffKind | null;
    /** Запасне запитання (з правильною відповіддю), на яке гравець відповідає; null — основне. */
    spare: Question | null;
    /** «Хто я?»: на якій підказці дано відповідь; інакше null. */
    clue: number | null;
    /** Командна гра: нікнейм того, хто зараз діє за команду; соло — null. */
    actor: string | null;
    /** Командна гра: жива чернетка (додає сервер з пам'яті кімнати); рушій завжди дає null. */
    draft: Answer | null;
    progress: LiveProgress | null;
  }

  /** Згорнутий список під рядками: привиди «Вибування» чи зал «Мільйонера». */
  export interface LiveAside {
    kind: 'ghosts' | 'hall';
    answered: number;
    total: number;
    rows: LiveRow[];
  }

  /** «Відповіді наживо» (11c): лише пульт; null поза відповіддю. */
  export interface HostLive {
    /** answers — звичайні рядки; blitz — черга бліцу (пульт малює її з HostView.blitz); trial — випробування «на межі»; duel — дуелянти. */
    kind: 'answers' | 'blitz' | 'trial' | 'duel';
    /** Скільки з rows відповіли / усього rows. */
    answered: number;
    total: number;
    /** Усі, хто має відповідати, у порядку гравців (у бліці — теж у порядку гравців). */
    rows: LiveRow[];
    aside: LiveAside | null;
  }
  ```
  `HostView`, після `pace`: `/** Відповіді наживо (11c); лише пульт. */ live: HostLive | null;`.
- `packages/engine/src/live.ts`:
  ```ts
  /** Запасне запитання за id (з правильною відповіддю — лише ведучому); null — основне або немає в пулі. (Переїхало з views.ts.) */
  export function spareOf(state: GameState, id: string | undefined): Question | null;
  /** Номер підказки «Хто я?», на якій дано відповідь; null — не «Хто я?», бліц і фінал. (Переїхало з views.ts.) */
  export function responseClue(state: GameState, playerId: string, timeMs: number): number | null;
  /** Попередній вердикт автоперевірки (verdictOf(...).grade). */
  export function previewVerdict(question: Question, answer: Answer, timeMs: number): LiveVerdict;
  /** «Відповіді наживо» для пульта; null поза відповіддю (див. план 11c, «Коли панель є»). Стан не змінює. */
  export function hostLive(state: GameState): HostLive | null;
  ```
  - Задача 1 реалізує `kind: 'answers'` для класики, фіналу, поля (звичайна клітинка), «Ва-банк», «Вибування» (з `aside: ghosts`), «Мільйонера» (з `aside: hall`), голосів і команд. Решта — задача 2. До неї ланцюжок, сортування, стіна, блеф, бліц, випробування й дуель можуть повертати `null` чи рядки без `progress`: тестів на них у задачі 1 немає.
  - Якщо імпорт `views.ts` → `live.ts` → помічники рушія тягне циклічне завантаження, `live.ts` не імпортує `views.ts` нічого. Потрібне з `views.ts` (`inQuestion`, `currentRound` тощо) брати з їхніх модулів (`game.ts`, `buffs.ts`, `survey.ts`…).
- `views.ts`:
  - прибрати локальні `spareOf` і `responseClue`, імпортувати з `./live`;
  - у `hostView` — `live: hostLive(state)`.
- `index.ts`: `export * from './live';`.

- [ ] **Step 1: Write the failing tests** — `packages/engine/src/live.test.ts`. Фікстури з `./testing/fixtures`, помічники `lobbyWith`, `must`, `openAt`, `acceptAll` з `./testing/helpers`, `teamGame`, `teamQuiz` з `./testing/teams`, `T0 = 1_000_000`.
  - **Поза відповіддю:** `hostLive(lobby)` → `null`; після `start` (етап `intro`) → `null`; на `reveal` і `leaderboard` класики → `null`.
  - **Класика, три гравці** «Оля», «Петро», «Іра», `makeQuiz([text, single])`, `s = openAt(lobby, T0)`:
    - одразу: `{ kind: 'answers', answered: 0, total: 3, aside: null }`, `rows.map(r => r.nickname)` → `['Оля', 'Петро', 'Іра']`, усі `answered: false`, `verdict: null`, `answer: null`, `draft: null`, `actor: null`;
    - `submitAnswer(s, 'p1', { type: 'text', value: 'Одеса' }, T0 + 4200)` → рядок Олі: `answered: true`, `answer` той самий, `timeMs: 4200`, `verdict: 'correct'`, `awaiting: false`; `answered: 1`;
    - Петро «Львів» → `verdict: 'wrong'`;
    - `setConnected(…, 'p3', false, …)` → рядок Іри `connected: false`, лишається в `rows`;
    - після автозакриття (усі присутні відповіли) етап `locked` → `hostLive` не `null`, ті самі рядки;
    - на `reveal` → `hostLive` дає `null`; `hostView(s).responses` той самий, що до 11c (наявні тести `views*.test.ts` зелені без змін).
  - **Баф і запасне:** `toBuffQuestion` з `./testing/buffs` (50/50 узято, ще не відповів) → рядок `buff: 'fifty'`, `answered: false`. Запасне (`swap`, як у `game.buffs-swap.test.ts`) → `spare.id` — id запасного ще до відповіді.
  - **Друга спроба:** як у `game.buffs.test.ts` (retry з першою неправильною відповіддю, що чекає вибору) → `answered: true`, `answer` — перша відповідь, `verdict` — її `grade`.
  - **«Хто я?»:** запитання `clues` (як у `game.clues.test.ts`), відповідь після другої підказки → `clue: 2`.
  - **Фінал:**
    - авто (`finalRound('f', withId(text, 'f1'))`): ставки (`placeWager`), запитання, Оля «Одеса» → `verdict: 'correct'`, `progress: { kind: 'wager', wager: <ставка Олі>, allIn: false }`; Петро без відповіді → `answered: false`, `progress.wager` — його ставка;
    - ручний (`check: 'manual'`): Оля «Одеса» → `verdict: 'correct'`, `awaiting: true`. Після `override` на `locked` (ручна оцінка ведучого) → `awaiting: false`, `verdict` за оцінкою.
  - **Поле** (раунд поля з порядком без кубиків, як у `game.board.test.ts`, автоперевірка):
    - Оля вибрала клітинку `single` → `rows` — лише Оля, `total: 1`;
    - Оля відповіла `b` (Київ) до «Прийняти» → `answered: true`, `verdict: 'correct'`, `awaiting: true`;
    - `acceptAnswer` → етап за правилами поля; якщо ще `question` / `locked`, `awaiting: false`, `verdict` із запису;
    - усна клітинка: `answer: null`, `verdict: null`, `awaiting: true`.
  - **«Ва-банк»** (як у `game.wipeout.test.ts`): після того як Петро згорів, на наступному запитанні `rows` без Петра, `total` = кількість у грі.
  - **«Вибування»** (як у `game.survival.test.ts`): привид Іра відповідає «для себе» → її немає в `rows`; `aside: { kind: 'ghosts', answered: 1, total: 1 }`, рядок Іри `verdict` за `ghosts.correct`.
  - **«Мільйонер»** (як у `game.ladder.test.ts`): учасник Оля → `rows` — лише Оля; Петро із залу відповів → `aside: { kind: 'hall', answered: 1, total: <глядачі> }`, його `verdict` із запису. Відповідь учасника → рядок Олі `answered: true` з вердиктом.
  - **Опитування й «хмара»** (`poll`, `cloud`): голос → `answered: true`, `verdict: null`.
  - **Команди:** `teamGame(teamQuiz([classicRound('r1', [text])]), [['Оля', 'Петро'], ['Іра', 'Марко']])`, запитання відкрито:
    - `rows.map(r => r.nickname)` — назви двох команд, `actor` — `'Оля'` і `'Іра'`;
    - відповідь капітана Олі (`actAnswer`) → рядок Червоних `answered: true`, `verdict: 'correct'`;
    - після `setCaptain(…, t1, 'm2')` → `actor: 'Петро'`;
    - опитування в командній грі → `rows` — чотири людини (`voterList`), `actor: null`.
  - **Лише пульт:** для станів класики, фіналу й команд:
    - `'live' in stageView(s)` → `false`;
    - `'live' in playerView(s, 'p1')` → `false`;
    - `JSON.stringify(playerView(s, 'p2'))` не містить відповіді Олі `'Одеса'`, поки етап `question`.
  - **Без побічних змін:** `hostLive(Object.freeze(structuredClone(s)))` не кидає й повертає те саме, що для `s`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/live.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Типи в shared, `live.ts`, перенесення `spareOf` / `responseClue`, `live: hostLive(state)` у `hostView`, `live: null` у фікстурах вебу (лише там, де падає `pnpm typecheck`).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src packages/engine/src apps/web/src
  git commit -m "feat(engine): live answers for the host view — everyone who should answer in player order with the answer, time, buff, spare, clue and an auto-check verdict (awaiting when the host still decides), final wagers, the board chooser, wipeout players still in, survival ghosts and the ladder hall folded aside, team rows with who acts; only the host gets it, no state change"
  ```

### Задача 2. Зріз пульта: поступ ланцюжка, сортування, стіни, блеф, «100 до 1», бліц, випробування й дуель

**Files:**
- Modify: `packages/engine/src/live.ts`
- Test: `packages/engine/src/live.test.ts`

**Interfaces:** без нових експортів. `hostLive` доповнюється за таблицями «Що в рядку» й «Бліц» з розділу рішень:
- ланцюжок, сортування, стіна → `progress`, `answer: null`, `verdict: null`;
- блеф → `progress: { kind: 'bluff', … }`, вердикт у фазі вибору;
- «100 до 1» → `progress: { kind: 'survey', ranks }`. Місця — той самий порядок, що `SurveyRowView.rank` у `views.ts`. Якщо там є помічник впорядкування дошки, винести його в `survey.ts` і використати в обох місцях без зміни `views.ts`-поведінки;
- бліц → `kind: 'blitz'`;
- випробування → `kind: 'trial'`, `rows` — ті, хто «на межі»;
- дуель → `kind: 'duel'`, два рядки.

- [ ] **Step 1: Write the failing tests** (`live.test.ts`, нові `describe`)
  - **Ланцюжок** (`chain`: Форель → Риба → Океан → Корабель), Оля вгадала «Риба» й узяла одну підказку → рядок Олі `{ answered: false, answer: null, verdict: null, progress: { kind: 'chain', solved: 1, total: 3, word: 'Океан', hints: 1 } }`. Петро не торкався → `progress: { kind: 'chain', solved: 0, total: 3, word: 'Риба', hints: 0 }`. Оля дійшла до кінця → `answered: true`, `word: null`.
  - **Сортування** (`toSort` з `./testing/sort`): після одного правильного ходу Олі → `progress.kind === 'sort'`, `sorted: 1`, `total: 4`, `misses: 0`, `card` — текст слова `sortOf(s, 'p1').queue[0]`. Неправильний хід → `misses: 1`. Усе розкладено → `card: null`, `answered: true`.
  - **Стіна** (`wall`, як у `game.wall.test.ts`): одна знайдена група й одна помилка → `{ kind: 'wall', found: 1, groups: 4, mistakes: 1, locked: false, solved: false }`. Числа збігаються з рядком `wallInfo` пульта (`hostView(s).wall.rows`).
  - **Блеф** (`bluff`):
    - фаза вигадок: Оля пише «Лондон-2» → `{ kind: 'bluff', stage: 'lies', lie: 'Лондон-2', pick: null }`, `answered: true`, `verdict: null`;
    - фаза вибору: Оля вибирає правду «Барселона» → `pick: 'Барселона'`, `verdict: 'correct'`, `timeMs` — час вибору; Петро вибирає вигадку Олі → `verdict: 'wrong'`.
  - **«100 до 1»** (`survey`): Оля «Яблуко, кавун, ананас» → `answer.type === 'survey'`, `progress: { kind: 'survey', ranks: [1, 4, null] }`, `verdict` із запису.
  - **Бліц з кнопкою** (`blitzRound`, як у `game.blitz.test.ts`, автоперевірка):
    - Петро натиснув і відповів, Оля натиснула → `kind: 'blitz'`;
    - рядок Петра `answered: true`, `verdict` — попередній, `awaiting: true` (голова черги);
    - рядок Олі `answered: true`, `answer: null`;
    - Іра `answered: false`.
  - **Миттєвий бліц** (як у тестах 7b): дві відповіді → рядки з `verdict` за `BlitzRow.grade`, третій гравець `answered: false`.
  - **Бліц у командах** (як у `game.teams-act.test.ts`): натиснув Петро (не капітан) → `actor: 'Петро'` у рядку його команди.
  - **Випробування** (як у `game.survival-trial.test.ts`, питання на виживання):
    - на `leaderboard` з відкритим випробуванням → `kind: 'trial'`, `rows` — ті, хто «на межі»;
    - відповідь одного → `answer` — його відповідь, `verdict` за `correct`, `answered: true`;
    - удача (`fellBack` чи `trialKind: 'luck'`): вибір дверей → `progress: { kind: 'door', picked: 2 }`; у JSON зрізу немає `traps`;
    - після закриття випробування → `null`.
  - **Дуель** (`toDuelQuestion` з `./testing/duel`): неправильна спроба виклику «Варшава» → `kind: 'duel'`, `rows` — два дуелянти, у виклику `progress: { kind: 'duel', tries: ['Варшава'], won: null }`. Правильна відповідь суперника → його `progress.won` — текст спроби, `answered: true`. На етапі дуелі `category` → `null`.
  - **Лише пульт:** для станів блефу (вигадки), випробування й дуелі `'live' in stageView(s)` → `false`, `playerView` не містить чужої вигадки й чужої відповіді на випробуванні.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/live.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine/src
  git commit -m "feat(engine): live answers with progress — chain words solved with the current word and hints, the sort card with sorted and misses, wall groups and mistakes, bluff lies then picks with a verdict, survey hits by board rank, the blitz queue with the head awaiting, the survival trial (doors without traps) and both duellists' tries"
  ```

### Задача 3. Сервер: чернетки капітанів — і пульту

**Files:**
- Modify: `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`
- Test: `apps/server/src/rooms/manager.test.ts`, `apps/server/src/socket.test.ts`

**Interfaces:**
- `manager.ts`:
  ```ts
  /** Пульт бачить живі чернетки команд у «Відповідях наживо» (11c); у стан гри вони не потрапляють. */
  private withLiveDrafts(room: Room, view: HostView): HostView {
    if (view.live === null || !teamsOn(room.state)) return view;
    const rows = view.live.rows.map((row) => {
      const found = this.liveDraft(room, row.id);
      return found === null ? row : { ...row, draft: found.draft };
    });
    return { ...view, live: { ...view.live, rows } };
  }
  ```
  `view()`: `if (identity.role === 'host') return this.withLiveDrafts(room, hostView(room.state));`. Коментар до `Room.drafts` доповнити: «… йдуть товаришам по команді й пульту (11c)».
- `socket.ts`, гілка `event.type === 'draft'`: фільтр — `role === 'host' || (role === 'player' && playerId !== null && playerId !== event.by && teamOf(room.state, playerId) === event.teamId)`. Коментар: «Чернетка — решті команди автора й пульту: ні автору, ні сцені, ні іншим командам».

- [ ] **Step 1: Write the failing tests**
  - `manager.test.ts`, у `describe` командної гри (помічник `teamPlaying`):
    - наявний тест «the captain draft lives in room memory…»: `HOST` прибрати з циклу «не містить 'Чернетка-Дніпро'». Додати: `const host = manager.view(room, HOST)`, `host?.role === 'host' && host.live?.rows.find((r) => r.id === red)?.draft` → `draft`. Рядок синіх — `draft: null`. Сцена, Олена (автор), Іра й Марко як і раніше не містять тексту;
    - новий тест «the host sees a team draft until the team answers, and never a stale one»:
      - після `manager.answer(room, olena.playerId, { type: 'text', value: 'Одеса' })` рядок червоних — `draft: null`, `answered: true`;
      - чернетка капітана, якого змінив ведучий (`host captain` на Тараса), → у пульта `draft: null` (автор більше не діє);
      - `JSON.stringify(manager.snapshot(room))` не містить чернетки;
    - новий тест: у соло-грі (`setup()`) і поза запитанням `manager.view(room, HOST)` дорівнює `hostView(room.state)` (той самий вміст `live`).
  - `socket.test.ts`, тест «the captain draft reaches only the teammates…»:
    - перейменувати на «the captain draft reaches the teammates and the host: not the other team or the stage»;
    - `host` прибрати з `counts()` і з перевірки «не містить»;
    - додати `const hostSeen = await until(host, (v) => v.role === 'host' && v.live?.rows.some((r) => r.draft !== null) === true)` і перевірити, що там `{ type: 'text', value: 'Чернетка-Львів' }`;
    - `olena` (автор), `ira`, `marko`, `stage` — як і раніше без нового зрізу й без тексту.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/rooms/manager.test.ts apps/server/src/socket.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/src
  git commit -m "feat(server): the host gets the live team drafts in its live answers — every draft event refreshes the host too, stale drafts stay hidden by the same check, the stage, the author and other teams still get nothing and nothing reaches the saved room"
  ```

### Задача 4. Веб: панель «Відповіді наживо»

**Files:**
- Create: `apps/web/src/screens/LiveAnswers.tsx`, `apps/web/src/screens/LiveAnswers.test.tsx`
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/styles.css`

**Interfaces:**
- `LiveAnswers.tsx`:
  ```ts
  interface Props {
    view: HostView;
    live: HostLive;
    /** Бліц: розмітка черги, яку HostScreen переносить сюди без змін (задача 5). */
    blitz?: ReactNode;
    /** Дуель: без заголовка й рамки панелі, усередині HostDuelPanel. */
    compact?: boolean;
  }
  export function LiveAnswers({ view, live, blitz, compact }: Props): JSX.Element;
  /** Текст відповіді рядка людською мовою з деталями типу (див. нижче). */
  export function liveAnswerText(row: LiveRow, correct: Question | null, choices: { id: string }[] | undefined): string;
  ```
- Розмітка (без `compact`):
  ```tsx
  <section id="live-answers" className="panel live-answers" aria-labelledby="live-answers-title">
    <h2 id="live-answers-title">{t('liveTitle')}</h2>
    <p className="meta live-count">{t('answeredOf', { answered: live.answered, total: live.total })}</p>
    {waiting.length > 0 && (
      <div className="live-waiting">
        <span className="meta">{t(view.phase === 'locked' ? 'liveSilent' : 'liveWaiting')}</span>
        <ul>{waiting.map((row) => <li key={row.id} className={row.connected ? 'live-chip' : 'live-chip is-offline'}>{row.nickname}{!row.connected && <span className="live-offline">{t('liveOffline')}</span>}</li>)}</ul>
      </div>
    )}
    {blitz ?? <ul className="live-rows">…</ul>}
    {live.aside !== null && <details className="live-aside"><summary>…</summary><ul className="live-rows">…</ul></details>}
  </section>
  ```
  - Чипи — `live.rows.filter((r) => !r.answered)`. У `kind: 'blitz'` чипи лише тоді, коли `view.blitz?.instant`. Шапка бліцу з кнопкою — `blitzQueued` замість `answeredOf`. У `kind: 'duel'` шапки й чипів немає.
  - Список рядків — `live.rows.filter((r) => r.answered || started(r.progress) || r.draft !== null)`, де `started` — є хоч один хід (ланцюжок `solved > 0 || hints > 0`, сортування `sorted > 0 || misses > 0`, стіна `found > 0 || mistakes > 0`, блеф `lie !== null || pick !== null`, дуель `tries.length > 0 || won !== null`, ставка й двері — не рахуються). Порожньо → `<p className="meta">{t('noResponses')}</p>`.
  - Рядок `<li className="live-row">`:
    - `<span className="name">` (ім'я обрізається трьома крапками);
    - `actor !== null` → `<span className="meta live-actor">{t('liveActs', { name })}</span>`;
    - `BuffBadge` і `SpareMark` з `./Buffs`, як у класичній панелі;
    - відповідь `<span className="live-answer">{liveAnswerText(...)}</span>`, або, якщо `!answered && draft !== null`, `<span className="live-draft"><em>{answerText(draft, …)}</em> <span className="tag">{t('liveDraft')}</span></span>`;
    - `clue` → `t('clueAt', { n })`;
    - час → `secondsText(timeMs)`;
    - вердикт → `<span className={`tag is-${verdict}`}>{t(`liveVerdict_${verdict}`)}</span>`;
    - `awaiting` → `<span className="tag is-pending">{t('liveAwaiting')}</span>`.
  - Рядки `aside` — та сама розмітка. `<summary>`: `t(kind === 'ghosts' ? 'liveGhosts' : 'liveHall', { answered, total })`.
- `liveAnswerText(row, correct, choices)`:
  - `answer !== null` → `answerText(answer, row.spare ?? correct, row.spare === null ? choices : undefined)`; плюс:
    - повзунок (`correct.type === 'slider'`) → `· t('liveDistance', { distance })`, де `distance` — `sliderNumber(|value − correct.correct|, step)` з одиницею;
    - `progress.kind === 'survey'` → значення з місцями: `t('liveSurveyRow', { value, rank })` / `t('surveyMiss', { value })` через кому;
  - `progress`:
    - ланцюжок → `t('liveChain', { solved, total, word, hints })` або `t('liveChainDone', { hints })`, якщо `word === null`;
    - сортування → `t('liveSort', { card, sorted, total, misses })` або `t('liveSortDone', { misses })`, якщо `card === null`;
    - стіна → `answerText`-подібно: `t('wallAnswerPart', …)` / `t('wallAnswerDone', …)` з цими числами, плюс `t('wallTableLocked')`, якщо `locked`;
    - блеф → `t('liveLie', { text })` у фазі вигадок; `t('livePick', { text })` у фазі вибору;
    - ставка → додається `· t('liveWager', { wager: num(wager) })` і позначка «ва-банк» (`finalAllInTag`), якщо `allIn`;
    - двері → `t('liveDoor', { n: picked + 1 })`;
    - дуель → `t('liveDuelTries', { list })` і / або `t('liveDuelWon', { text })`;
  - без відповіді й поступу: усна відповідь (`awaiting`) → `t('answeredAloud')`, інакше `'—'`.
- `i18n.ts` (нові ключі поруч із `responses`):
  ```ts
  liveTitle: 'Відповіді наживо',
  liveJump: 'До відповідей наживо',
  liveWaiting: 'Чекаємо:',
  liveSilent: 'Не відповіли:',
  liveOffline: 'поза зв’язком',
  liveDraft: 'чернетка',
  liveActs: 'діє: {name}',
  liveAwaiting: 'чекає рішення',
  liveVerdict_correct: 'правильно',
  liveVerdict_partial: 'частково',
  liveVerdict_wrong: 'ні',
  liveChain: 'відгадано {solved} з {total} · зараз «{word}» · підказок {hints}',
  liveChainDone: 'ланцюжок пройдено · підказок {hints}',
  liveSort: 'картка «{card}» · розкладено {sorted} з {total} · помилок {misses}',
  liveSortDone: 'розкладено все · помилок {misses}',
  liveLie: 'вигадка: «{text}»',
  livePick: 'вибрав «{text}»',
  liveWager: 'ставка {wager}',
  liveDistance: 'відстань {distance}',
  liveSurveyRow: '{value} → №{rank}',
  liveDoor: 'двері {n}',
  liveDuelTries: 'спроби: {list}',
  liveDuelWon: 'вгадав: «{text}»',
  liveGhosts: 'Привиди: відповіли {answered} з {total}',
  liveHall: 'Зал: відповіли {answered} з {total}',
  ```
  Якщо ключ з такою назвою вже є, узяти наявний, а не дублювати.
- `styles.css`:
  ```css
  /* 11c: «Відповіді наживо» — до ~8 рядків, далі прокрутка в панелі. */
  .live-rows { list-style: none; margin: 0; padding: 0; max-height: 22rem; overflow-y: auto; }
  .live-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.5rem; padding: 0.35rem 0; border-bottom: 1px solid var(--line, rgb(0 0 0 / 0.08)); }
  .live-row .name { font-weight: 600; min-width: 0; max-width: 12rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .live-answer { flex: 1 1 10rem; min-width: 0; overflow-wrap: anywhere; }
  .live-draft { flex: 1 1 10rem; opacity: 0.75; }
  .live-waiting ul { display: flex; flex-wrap: wrap; gap: 0.25rem; list-style: none; margin: 0.25rem 0 0.5rem; padding: 0; }
  .live-chip { padding: 0.1rem 0.5rem; border-radius: 999px; background: var(--chip, rgb(0 0 0 / 0.06)); }
  .live-chip.is-offline { opacity: 0.55; }
  .live-offline { margin-left: 0.3rem; font-size: 0.8em; }
  .tag.is-partial { /* той самий вигляд, що «частково» в наявних тегах; колір між is-correct і is-wrong */ }
  .link-button.live-jump { /* виглядає як текст лічильника, з підкресленням */ }
  ```
  Кольори брати з наявних змінних і тегів (`.tag.is-correct`, `.tag.is-wrong`, `.tag.is-pending`). Нових кольорів без потреби не вводити. Якщо `.link-button` уже є, лише додати `live-jump`.

- [ ] **Step 1: Write the failing tests** — `LiveAnswers.test.tsx`. Фікстура `HostView` з `HostScreen.test.tsx` (винести в спільний `host-test-view.ts`, якщо зручно, інакше скопіювати мінімум) і помічник `row(over: Partial<LiveRow>)`:
  - шапка: «Відповіли 1 з 3»; чипи «Петро» та «Іра»; Іра `connected: false` → чип з класом `is-offline` і текстом «поза зв’язком»; на `locked` підпис «Не відповіли:»;
  - рядок Олі: «Оля», «Одеса», «4,2 с», тег «правильно» з класом `is-correct`;
  - `verdict: 'partial'` → «частково», `is-partial`; `'wrong'` → «ні»; `awaiting` → «чекає рішення» (`is-pending`);
  - чернетка: команда без відповіді з `draft: { type: 'text', value: 'Оде' }` і `actor: 'Оля'` → `.live-draft em` з «Оде», тег «чернетка», «діє: Оля»; після `answered: true` чернетки немає;
  - поступ: ланцюжок → «відгадано 1 з 3 · зараз «Океан» · підказок 1»; сортування → «картка «Буряк» · розкладено 1 з 4 · помилок 0»; блеф → «вигадка: «Лондон-2»», потім «вибрав «Барселона»»; «100 до 1» з `ranks: [1, null]` → «Яблуко → №1, ананас ✗»; повзунок (правильне 50, відповідь 47, `%`) → «47 % · відстань 3 %»; ставка 300 → «… · ставка 300»;
  - список не показує тих, хто ще не почав (немає рядка Петра), але показує Олю з поступом без відповіді;
  - `aside` привидів: `<details>` з `summary` «Привиди: відповіли 1 з 2», усередині рядок;
  - `kind: 'blitz'` з `blitz={<div className="blitz-queue">черга</div>}` → панель містить цей вузол замість `.live-rows`; без `instant` чипів немає;
  - `compact` → немає `h2` і `id="live-answers"`;
  - понад 8 рядків → `.live-rows` той самий (прокрутку задає CSS; тест лише перевіряє, що всі 12 рядків у DOM).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/LiveAnswers.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): a live answers panel — answered N of M, waiting chips with offline ones grey, rows with the answer in words, time, buff, spare, clue, a coloured verdict or «чекає рішення», a team captain's draft in italics with who acts, chain, sort, wall, bluff, survey, slider, wager, door and duel details, ghosts and the hall folded, up to eight rows before it scrolls"
  ```

### Задача 5. Пульт: панель першою під запитанням, без дублікатів, бліц і дуель усередині, лічильник прокручує

**Files:**
- Modify: `apps/web/src/screens/HostScreen.tsx`, `apps/web/src/screens/DuelView.tsx`
- Test: `apps/web/src/screens/HostScreen.test.tsx`, `apps/web/src/screens/DuelView.test.tsx`

**Interfaces:**
- `HostScreen.tsx`:
  ```ts
  const live = view.live;
  const liveOn = live !== null && live.kind !== 'duel';
  const jump = () => document.getElementById('live-answers')?.scrollIntoView({ block: 'start' });
  ```
  - **Лічильник:** частину рядка етапу з `answeredOf` / `blitzQueued` винести в змінну `countText`. Коли `liveOn`, вона рендериться як `<button type="button" className="link-button live-jump" aria-label={t('liveJump')} onClick={jump}>{countText}</button>`, інакше як текст (`, ${countText}` — як зараз).
  - **Слот:** одразу після блоку `timeShown && <div className="panel-actions host-time">…</div>`:
    ```tsx
    {liveOn && <LiveAnswers view={view} live={live} blitz={live.kind === 'blitz' ? blitzLive : undefined} />}
    ```
    Блок аудіо (`clip !== null && …`) переноситься під слот (порядок: запитання → таймер → панель → аудіо).
  - **Випробування:** поки `live?.kind === 'trial'`, `HostSurvival` рендериться після слота, а не перед панеллю запитання. Решта випадків — як зараз.
  - **Бліц:** два наявні блоки черги (`blitz !== null && instant` з `BlitzQueue` і `phase === 'question'`-список черги з кнопками «Правильно / Неправильно») виносяться в `const blitzLive = (…)` без змін розмітки й класів (без обгортки `<section className="panel">` і без `h2` «Черга»: заголовок дає панель). На їхньому старому місці рендеряться лише тоді, коли `!liveOn`. Панель «Спроби» (`blitz.attempts.length > 0`) — без змін.
  - **Що ховається, поки `liveOn`:**
    - класична панель «Відповіді» (до умови додати `&& !liveOn`);
    - `view.chain !== null` і `view.sort !== null` панелі (`&& !liveOn`);
    - у панелі стіни `WallTable` (`view.wall !== null && !liveOn`), `WallReveal` лишається;
    - панель «Відповіді» поля (`board !== null && blitz === null`) — лише коли `liveOn && !canGradeBoard`.
  - Решта панелей не змінюється.
- `DuelView.tsx`, `HostDuelPanel`: на етапах `question` і `answer`, якщо `view.live?.kind === 'duel'`, замість `tries.map(… duelTryTexts …)` рендериться `<LiveAnswers view={view} live={view.live} compact />`. Без `live` (старі фікстури) — як зараз.

- [ ] **Step 1: Write the failing tests**
  - `HostScreen.test.tsx`, новий `describe('live answers (11c)')`, фікстура `during('question', textQuestion, { live: { kind: 'answers', answered: 1, total: 2, rows: [...], aside: null } })`:
    - `#live-answers` є, заголовок «Відповіді наживо»;
    - **порядок:** серед прямих нащадків `main` перший `section.panel` після панелі запитання й `.host-time` — це `.live-answers` (порівняти `compareDocumentPosition` з кожною іншою `section.panel`, крім панелі запитання);
    - класичної панелі «Відповіді» (`getByRole('heading', { name: 'Відповіді', exact: true })`) немає; з `live: null` (той самий вид) — є;
    - лічильник «Відповіли 1 з 2» — кнопка з `aria-label` «До відповідей наживо»; `Element.prototype.scrollIntoView = vi.fn()` → клік → виклик з `{ block: 'start' }`. З `live: null` кнопки немає, текст є;
    - ланцюжок: `view.chain` заповнений і `live` з `kind: 'answers'` → панелі «Ланцюжок» немає; на `reveal` (`live: null`) — є. Те саме для сортування; для стіни — `WallReveal` є, `WallTable` немає;
    - поле з усною клітинкою на `question` (`board.manual`, `canGradeBoard`) → панель «Відповіді» поля з кнопками «Зарахувати» лишається поруч із панеллю наживо; поле з телефоном до відповіді → панелі «Відповіді» поля немає, а «Відповідь чекає на рішення» з «Прийняти» є, коли `spotlight` чекає;
    - миттєвий бліц (`blitz.instant`, `rows` з двома відповідями, `live.kind === 'blitz'`) → `.blitz-queue` усередині `#live-answers`; другої `.blitz-queue` немає;
    - бліц з кнопкою й усною головою → кнопки «Правильно» / «Неправильно» всередині `#live-answers` і шлють `host:judge`, як раніше;
    - «Вибування» з `live.kind === 'trial'` → `#live-answers` перед панеллю `HostSurvival` (`compareDocumentPosition`);
    - фінал на `wager` (`live: null`) → панель ставок як зараз, `#live-answers` немає;
    - наявні тести (усі з `live: null`) зелені без змін.
  - `DuelView.test.tsx`: `HostDuelPanel` з `live.kind === 'duel'` і спробою «Варшава» → «спроби: Варшава» всередині `.duel-host`, рядка `duelTryTexts` немає; без `live` — рядок `duelTryTexts`, як зараз.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): the live answers panel stands first under the question and the timer, the answered counter jumps to it; while it is up the plain responses, chain, sort and wall tables and the old blitz queue step aside (the queue moves inside with the same markup), action panels stay where they act, the survival trial and the duel get it too"
  ```

### Задача 6. Довідка ведучого: «Відповіді наживо» й чернетка капітана

**Files:**
- Modify: `apps/web/src/help/settings.ts`, `apps/web/src/help/teams.ts`, `apps/web/src/screens/LiveAnswers.tsx` (кнопка «ⓘ»)
- Test: `apps/web/src/help/host-help.test.ts`, `apps/web/src/screens/LiveAnswers.test.tsx`

**Interfaces:**
- `SETTING_HELP_KEYS`: `'live'` одразу після `'pacing'`.
- `SETTING_HELP.live`:
  ```ts
  live: {
    title: 'Відповіді наживо',
    what: 'Панель на пульті під запитанням: хто вже відповів і що саме, хто ще думає — ще до розкриття. Її бачите лише ви: на сцені й телефонах її немає.',
    how: [
      'Угорі — «Відповіли 5 з 8» і чипи «Чекаємо: …». Сірий чип — гравець поза зв’язком. Дотик до лічильника в рядку етапу прокручує до панелі.',
      'У рядку — відповідь, час, баф, запасне запитання й попередній вердикт автоперевірки: «правильно», «частково» чи «ні». «Чекає рішення» — відповідь чекає вашого «Прийняти» чи оцінки.',
      'Ланцюжок, сортування й стіна показують поступ: скільки слів відгадано й поточне слово, поточну картку й помилки, знайдені групи. Блеф — вигадку, а потім вибір. «100 до 1» — у який рядок дошки влучила відповідь. Бліц — живу чергу.',
      '«Вибування» й «Мільйонер» показують лише тих, хто в грі, і учасника; привиди й зал — у згорнутому списку під рядками.',
      'У командній грі рядок — команда: хто з неї зараз діє і, поки відповіді немає, чернетка капітана курсивом.',
      'Кнопки «Прийняти», «Частково», «Відхилити» й «Перевибрати» лишаються там, де були. Після розкриття панель змінюється звичайними «Відповідями» з оцінкою.',
    ],
    points: ['На бали не впливає: вердикт попередній, остаточний рахує гра на розкритті (з вашою оцінкою).'],
    tip: ['Не читайте вердикт уголос до розкриття: екран пульта бачите лише ви.'],
  },
  ```
- `TEAM_HELP.captain.how`: новий рядок «Ведучий бачить чернетку капітана наживо в «Відповідях наживо»; сцена й інші команди — ні.»
- `LiveAnswers.tsx`: у `h2` після тексту — `<HelpButton id="setting.live" />` (як `HelpButton` у заголовках «Стіна зв’язків» чи «Опитування»).

- [ ] **Step 1: Write the failing tests**
  - `host-help.test.ts`:
    - `helpIds('settings')` містить `'setting.live'` одразу після `'setting.pacing'`; наявна перевірка «filled» проходить і для нього;
    - `text('setting.live')` містить «Чекаємо», «чекає рішення», «чернетка», «лише ви»;
    - `text('team.captain')` містить «Відповідях наживо»;
    - `searchHelp('наживо')` містить `'setting.live'`.
  - `LiveAnswers.test.tsx`: кнопка «Довідка: Відповіді наживо» є в заголовку панелі (без `compact`).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/help apps/web/src/screens/LiveAnswers.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Якщо інші тести довідки звіряють буквально перелік чи кількість записів налаштувань, оновити їх (навмисна зміна).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): host help on live answers — what the panel shows for every format, the preliminary verdict, waiting and offline chips, ghosts and the hall, team drafts — with ⓘ on the panel and a captain line about the host seeing the draft"
  ```

### Задача 7. Наскрізні сценарії 11c з кадрами; наявні сценарії з новою панеллю

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Помічник поруч з `click`:
  ```ts
  /** Рядок «Відповідей наживо» на пульті (11c). */
  const liveRow = (host: Page, name: string) => host.locator('#live-answers .live-row', { has: host.locator('.name', { hasText: name }) });
  ```
- Вміст сценаріїв — без тем росії й СРСР.

- [ ] **Step 1: Add the scenarios** у кінець файлу за зразком 11b:
  ```ts
  it('part 11c: live answers on the host — the panel first under the question with answered N of M and waiting chips (an offline player grey), each answer with an auto-check verdict before the reveal and never on the stage or phones, the counter jumps to it on 375 px, a sort card and progress, bluff lies then picks; the plain responses come back on the reveal', async () => {
    try {
      await liveGame11c();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });

  it('part 11c: team live answers — the captain draft in italics with who acts on the host only, then the team answer with its verdict', async () => {
    try {
      await teamLive11c();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Підготовка `liveGame11c()`:**
  1. `const host = await open('host11c', 1280, 900); await register(host, 'host', 'Марта Ведуча', 'host11c@example.com');`
  2. Раунд `rc11c` — `classicRound('rc11c', [t1, s1, so1, b1], { title: 'Наживо 11c', speedBonus: false, shuffleOptions: false })`:
     - `t1` — `text` «Яке місто називають перлиною біля моря?», `accepted: ['Одеса']`, `timeLimit: 60`, `points: 100`;
     - `s1` — `single` «Яка річка найдовша в Україні?»: `s1-a` Дніпро (правильний), `s1-b` Дністер, `s1-c` Десна, `timeLimit: 60`;
     - `so1` — `sort` «Овочі й фрукти» (Овочі: Морква, Буряк; Фрукти: Яблуко, Груша), `lockSeconds: 3`, `timeLimit: 60`, `points: 100`;
     - `b1` — `bluff` «Найбільше природне озеро України — …», `accepted: ['Ялпуг']`, `lies: ['Світязь', 'Синевир', 'Кагул']`, `timeLimit: 60`, `choiceTime: 30`, `points: 1000`;
     - `imageUrl: null`, `video: null` у всіх.
  3. `makeRoundsQuiz([rc11c], { leaderboard: 'each' })`, `title: 'Наживо 11c'` → `POST /api/quizzes`, `expect(saved.ok())`.
  4. «Грати» → `code`, `stageUrl`; `stage = open('stage11c', 1280, 720)`; `olya`, `petro`, `ira` — `open(…, 375, 812)`, `join` («Оля», «Петро», «Іра»). `stageFrames = socketFrames(stage)`, `petroFrames = socketFrames(petro)` до старту.

  **Кроки з перевірками й кадрами (у такому порядку):**
  1. **Чекаємо.** «Почати гру» → `afterSplash` → «Почати раунд» → `afterSplash`. На `t1`:
     - `#live-answers` видно, `.live-count` — «Відповіли 0 з 3», чипи «Оля», «Петро», «Іра»;
     - **порядок:** `host.evaluate` — серед `main > section.panel` перша після панелі з `h1.question` — це `#live-answers`;
     - Іра йде (`ira.context().close()`, `pages.delete('ira11c')`) → чип «Іра» з класом `is-offline` і текстом «поза зв’язком». Кадр `p11c-host-waiting`.
  2. **Рядок і вердикт.**
     - Оля пише «Одеса» й відповідає → `liveRow(host, 'Оля')` містить «Одеса» і `.tag.is-correct` «правильно»; чип Олі зник, чип «Петро» лишився. Кадр `p11c-host-live-row`.
     - **Не витікає:** `stage.locator('#live-answers, .live-answers').count()` → 0; `stage.locator('.tag.is-correct, .tag.is-wrong').count()` → 0; `bodyText(stage)` не містить «Одеса»; `bodyText(petro)` не містить «Одеса»; `stageFrames` і `petroFrames` не містять `"live"` і «Одеса».
     - Петро «Львів» → рядок «ні» (`.tag.is-wrong`). Запитання закривається само (Іра поза зв’язком). На `locked` панель лишається з підписом «Не відповіли:» і чипом «Іра».
  3. **Розкриття.** «Показати відповідь» → `#live-answers` зникає, звичайна панель «Відповіді» з кнопкою «Зарахувати» біля Петра (як у наявних сценаріях). «Далі» → «Наступне запитання» → `afterSplash`.
  4. **Пульт на телефоні.** `host.setViewportSize({ width: 375, height: 812 })` на `s1`:
     - `(await host.locator('#live-answers').boundingBox())!.y` < 812 (видно без прокрутки);
     - `host.evaluate('scrollTo(0, document.body.scrollHeight)')`, клік по кнопці «До відповідей наживо» → `#live-answers` у видимій області (`expect.poll` на `boundingBox().y` між 0 і 812);
     - `expectNoSideScroll(host, 'p11c-host-375')`. Кадр `p11c-host-375-live`.
     - Оля «Дніпро», Петро «Десна» → назад 1280 × 900 → закриття → «Показати відповідь» → «Далі» → «Наступне запитання» → `afterSplash`.
  5. **Сортування.**
     - Картка Олі `sortCard(olya)`, `sortBy(olya, 'tap', ['Морква', 'Буряк'].includes(card) ? 'Овочі' : 'Фрукти')`;
     - `liveRow(host, 'Оля')` містить «розкладено 1 з 4» і «картка «<нова картка Олі>»» (`sortCard(olya)` після ходу);
     - панелі «Сортування» (`.sort-board`) на пульті немає. Кадр `p11c-host-sort`;
     - «Закрити» → «Показати відповідь» → `.sort-board` знову є (розкриття). «Далі» → «Наступне запитання» → `afterSplash`.
  6. **Блеф.**
     - `writeLie(olya, 'Шацьке')`, `writeLie(petro, 'Тилігул')` → рядки «вигадка: «Шацьке»» і «вигадка: «Тилігул»» без тегу вердикту. Телефон Петра не містить «Шацьке».
     - «До вибору» → `pickBluff(olya, 'Тилігул')`, `pickBluff(petro, 'Ялпуг')` → рядок Олі «вибрав «Тилігул»» з «ні», Петра — «вибрав «Ялпуг»» з «правильно». Кадр `p11c-host-bluff`. `bodyText(stage)` не містить «вибрав».
  7. Наприкінці `expect(problems).toEqual([])`.

  **Підготовка `teamLive11c()`:**
  1. `host11ct` 1280 × 900, `register(host, 'host', 'Марта Ведуча', 'host11ct@example.com')`.
  2. Раунд `classicRound('rt11c', [{ text «Яке місто називають перлиною біля моря?», accepted ['Одеса'], timeLimit 90, points 100 }], { title: 'Команди 11c', speedBonus: false })`. `makeRoundsQuiz([rt11c], { leaderboard: 'each', teams: { count: 2, names: ['Червоні', 'Сині'] } })`, `title: 'Команди 11c'`.
  3. Сцена, телефони `olya`, `petro`, `ira`, `marko` (375 × 812), `join`; `pickTeamOn`: Оля й Петро — «Червоні», Іра й Марко — «Сині» (капітани — перші: Оля, Іра). `stageFrames`, `iraFrames`, `markoFrames`, `hostFrames` — `socketFrames`.
  4. «Почати гру» → `afterSplash` → «Почати раунд» → `afterSplash`.

  **Кроки:**
  1. Чипи «Червоні», «Сині»; рядків немає.
  2. `field(olya, 'Ваша відповідь').fill('Одес')` → `liveRow(host, 'Червоні').locator('.live-draft em', { hasText: 'Одес' }).waitFor({ timeout: 2000 })`, у рядку «діє: Оля» і тег «чернетка». Кадр `p11c-host-draft`.
     - `hostFrames` містить «Одес»;
     - `stageFrames`, `iraFrames`, `markoFrames` — ні;
     - `petro` бачить `.team-draft` «Одес» (як у 10j).
  3. Оля дописує «Одеса» й відповідає → рядок Червоних «Одеса» з «правильно», `.live-draft` немає. Іра «Львів» → «ні». Кадр `p11c-host-team`.
  4. `expect(problems).toEqual([])`.
- [ ] **Step 2: Run** `pnpm build`, потім у фоні `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 11c"` → PASS. Переглянути кадри `p11c-*`:
  - панель першою під запитанням;
  - вердикти читаються кольором і словом;
  - сірий чип поза зв'язком;
  - чернетка курсивом;
  - на 375 px рядки не ламаються, довге ім'я обрізається.
- [ ] **Step 3: Підлаштувати наявні сценарії.** Відомі заздалегідь місця, що дивилися на сховані під час запитання панелі:
  - **ланцюжок** (`chainGame`, ~рядок 1864): `host.getByRole('heading', { name: 'Ланцюжок', exact: true })` під час запитання → `host.locator('#live-answers')` і `liveRow(host, 'Оля')` з «ланцюжок пройдено»;
  - **сортування 7f** (`sortGame`, ~рядок 3866): `.sort-board li` з довгим ім'ям Петра на 375 px під час запитання → `liveRow(host, 'Петро')` і його `.name` (та сама перевірка обрізання). Кадр `sort7f-host-progress` тепер знімає панель наживо;
  - **стіна 10d**, якщо сценарій чекає `WallTable` на пульті під час запитання → рядки панелі наживо.

  Решту покаже прогін. Лагодити лише заміною селектора на панель наживо (`#live-answers`, `.live-row`), не сном і не зміною вмісту. Бліц (`.blitz-queue`) має пройти без змін: розмітка та сама. Кожну правку назвати в коміті й у звіті задачі.
- [ ] **Step 4: Повний прогін — один раз, у фоні** (≈ 30 хв): `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts` → усі сценарії PASS. Якщо PGlite чи браузер падає з браком пам'яті, перезапустити лише сценарії, що впали (`-t "<назва>"`), і назвати це в звіті.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/e2e
  git commit -m "test: part 11c end-to-end — live answers first under the question with waiting and offline chips, verdicts before the reveal that never reach the stage or phones, the counter jump on 375 px, a sort card, bluff lies and picks, the plain responses back on the reveal; a team captain draft on the host only; chain and sort scenarios read the live panel during the question"
  ```
