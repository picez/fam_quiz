# План 11d: Сортування видно всім

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 11d специфікації `docs/superpowers/specs/2026-10-25-after-formats-design.md` (розділ 8, п. 1 побажань). Слова власника: «в свайпі все ще не видно що вибирає гравець і куди свайпає». Сцена й інші гравці мають бачити, яке слово тягнуть і в який бік:
- **Де живий показ є.** Лише там, де сортує **одна** сторона, а решта дивиться:
  - звичайна клітинка поля (сортує той, хто вибрав): бачать сцена, інші телефони й пульт;
  - командна гра (будь-який раунд): рух капітана бачать його товариші й пульт.

  У класиці, бліці, фіналі й на бліц-клітинці соло-гри сортують усі одночасно. Там живого руху й чужих слів не бачить ніхто: сцена, як і зараз, показує рядки прогресу, пульт — «Відповіді наживо» (11c).
- **Поточна картка.** Глядачі бачать велику картку посередині між зонами категорій, як на телефоні того, хто сортує. Чипи всіх слів за абеткою лишаються нижче. Розкладені слова з чипів зникають.
- **Рух.** Поки гравець тягне картку, телефон шле **нахил** (у бік якої категорії й наскільки, 0–1) не частіше ніж раз на 100 мс. У глядачів картка зсувається й нахиляється в той бік, а зона підсвічується. Якщо гравець відпустив картку без ходу, вона повертається в центр.
  - Нахил — тимчасовий сигнал. Сервер перевіряє, що його можна слати, пересилає глядачам окремою легкою подією й тримає останній у пам'яті кімнати. У стан гри нахил не потрапляє, у збережену кімнату теж.
  - Хід, як і зараз, — `player:sort`.
  - Після паузи, перепідключення, ходу чи нового слова нахил скидається.
- **Політ і влучання.** Після ходу картка в глядачів летить у вибрану зону:
  - **влучив** — слово лягає в стовпець своєї категорії з короткою зеленою позначкою. Стовпці наповнюються під час гри;
  - **не туди** — картка труситься в зоні, червоніє й повертається. Видно відлік підвисання.
- **Підсумок по словах (розкриття).** Стовпці показують усі слова в правильних категоріях:
  - слово, на якому помилялися, має позначку «✗1», «✗2»;
  - слово, до якого не дійшли, — бліде, з підписом «не встиг».

  У класиці кожен бачить таку розмітку на телефоні лише для себе, а сцена — без особистих позначок. На полі розмітку того, хто сортував, бачать сцена й глядачі.
- **Пульт:** у рядку сортування панелі «Відповіді наживо» до картки додається «→ «Овочі»», поки гравець тягне її в той бік (лише там, де показ дозволено).
- **Сцена 1280 × 720** вміщає картку, стовпці й чипи без прокрутки за 4 категорій і 20 слів.

**Стан гри: `GAME_STATE_VERSION` 11 → 12.**
- Нові необов'язкові ключі `SortProgress`:
  - `wordMisses?: Record<string, number>` — помилки на кожному слові;
  - `missedInto?: string` — у яку категорію пішла остання помилка (зона для трусіння в глядачів).
- `READABLE_STATE_VERSIONS = [2, …, 11, 12]`. Зміна лише адитивна. Кімната версії 11 посеред сортування відновлюється без лічильника:
  - на розкритті немає «✗N» (лише «не встиг» і загальне число помилок, як зараз);
  - політ помилки без зони не показується.
- **Пуш не обриває живих ігор,** але специфікація (розділ 2) вимагає перед пушем перевірити `live_room` за правилом 14a підпроєкту 10. У звіті власникові треба назвати підняття версії й те, що живі ігри його переживають.
- 11b уже на `main` з версією 11, тож 11d піднімає версію сам.

**Архітектура:**
- **Shared.**
  - `packages/shared/src/views.ts`: типи `SortWordView`, `SortMove`, `SortWordMark`, `SortColumn`, `SortLive`.
    - `SortInfo.live: SortLive | null`.
    - `PlayerSort.watched`, `PlayerSort.marks`, `PlayerSort.live`.
    - `LiveProgress` (сортування) + `cardId`, `seq`.
  - `packages/shared/src/events.ts`: `sortTiltSchema`, подія `player:sort-tilt`, серверна подія `sort:tilt` з типом `SortTilt`.
  - `packages/shared/src/game.ts`: `SORT_TILT_MS = 100`, `SORT_TILT_GAP_MS = 80`.
- **Рушій.**
  - `packages/engine/src/game.ts`: два нові ключі в `SortProgress`.
  - `packages/engine/src/sort.ts`:
    - `sortWord` веде `wordMisses` і `missedInto`;
    - нові чисті функції `sortSeq`, `lastSortMove`, `sortMarks`, `sortAudience`, `tiltRefusal`.
  - `restore.ts`: версія 12.
  - `views.ts`: `sortLive(...)` для `SortInfo.live` (поле) і `PlayerSort.live` (команди), `marks` на розкритті, `watched`.
  - `live.ts`: `cardId`, `seq`.
- **Сервер (`apps/server/src/rooms/manager.ts`, `socket.ts`).**
  - `Room.tilts` — останній нахил кожного, хто сортує (лише пам'ять).
  - `RoomManager.tilt(room, playerId, tilt)` перевіряє (`tiltRefusal`), дроселює й шле подію кімнати `tilt`.
  - Сокет пересилає `sort:tilt` лише дозволеним адресатам.
  - Успішний хід і пауза стирають нахил.
- **Веб.**
  - `apps/web/src/live/useGame.ts`: `tilts` (останній нахил за `sorterId`); сторінки передають їх екранам.
  - `apps/web/src/screens/SortView.tsx`:
    - для того, хто сортує: `tiltOf`, `useTiltSender`, надсилання з `SortPlay`;
    - для глядачів: `liveTilt`, `tiltVars`, `useSortFlight`, `SortLiveCard`;
    - `SortWatch` з живою карткою й стовпцями;
    - новий `SortStage` для сцени;
    - `SortReveal` з `placed` / `toward` / `landed` / `marks`.
  - `StageScreen.tsx`, `PlayerScreen.tsx`, `TeamWatch.tsx`, `LiveAnswers.tsx`, `HostScreen.tsx`, сторінки `Stage.tsx`, `Play.tsx`, `Host.tsx`.
  - `i18n.ts`, `styles.css`.
- **Довідка ведучого (`apps/web/src/help/questions.ts`, `help/teams.ts`).** Рядки про живий показ і позначки.
- **Наскрізні тести.** Два сценарії 11d з кадрами `p11d-`.

**Технології:** TypeScript, vitest, Fastify + Socket.IO, React 19 + Vite, Testing Library (jsdom), Playwright. Нових залежностей немає.

**Рішення плану там, де специфікація мовчить (і рішення координатора):**

*Де показ дозволено (`sortAudience`)*
- `sortAudience(state, play)`:
  - `'all'` — `play.board?.kind === 'normal'` (звичайна клітинка поля, і соло, і командна гра);
  - `'team'` — інакше, якщо `teamsOn(state)` (будь-який раунд командної гри, зокрема бліц, фінал і бліц-клітинка: кожна команда дивиться лише на свого капітана);
  - `null` — решта (класика, бліц, фінал і бліц-клітинка соло-гри).
- На `null` сервер нахилу не приймає (`wrong_phase`), а телефон його й не шле: `PlayerSort.watched === false`.
- Пульт отримує нахил в обох дозволених випадках. У класиці соло пульт бачить те саме, що й зараз: картку й поступ у «Відповідях наживо».

*Нахил: дані й шлях*
- Клієнт → сервер: `player:sort-tilt` з `{ wordId, categoryId: string | null, amount: 0…1 }`. `categoryId: null` означає «відпустив без ходу, картка в центрі».
- Сервер → клієнт: **окрема подія `sort:tilt`**, а не повний зріз стану: `{ sorterId, wordId, toward: string | null, amount, seq }`.
  - Повний зріз 10 разів на секунду кожному сокету кімнати — це зайвий трафік і перемальовування.
  - `sorterId` — id учасника гри: гравця в соло, команди в командній грі.
  - `seq` — `sortSeq(progress)` на мить нахилу.
- **Перевірка (`tiltRefusal(state, sorterId, wordId, categoryId, now)`).** Ті самі умови, що й у `sortWord`, у тому самому порядку:
  - `wrong_phase` (не `question`), `paused`, `not_started`, `not_found` (не гравець), `type_mismatch`, `not_your_turn` (`sortsHere`), `already_answered`, `time_over`, `sort_locked`, `sort_stale`, `not_found` (категорія, якщо не `null`);
  - наприкінці `sortAudience(state, play) === null` → `wrong_phase`.

  Нової помилки немає.
- **Сервер (`RoomManager.tilt`).**
  - Хто діє — `actorOf(…, 'captain')`, як у `sort`.
  - `amount` округлюється до кроку 0,05.
  - `Room.tilts: Map<string, Tilt>`, де `Tilt = { questionIndex, seq, wordId, toward, amount, at }`.
  - Нахил із `toward !== null`, що прийшов раніше ніж через `SORT_TILT_GAP_MS` (80 мс) після попереднього для того самого `sorterId`, `wordId` і `seq`, відкидається з `{ ok: true }` без події.
  - Відпускання (`toward: null`) не дроселюється.
  - Той самий нахил, що й останній, — `{ ok: true }` без події.
  - Подія кімнати `{ type: 'tilt'; tilt: SortTilt; by: string; audience: 'all' | 'team' }`, де `by` — людина, що шле (у командній грі — капітан).
  - Успішний `sort` стирає `room.tilts.get(who.id)`. `pause` стирає всю мапу. Нахил іншого запитання (`questionIndex`) чи старого `seq` вважається відсутнім.
  - `snapshot` нахилів не містить.
- **Адресати (`socket.ts`):**
  - `'all'` — усі сокети кімнати (сцена, пульт, гравці), крім сокетів людини `by`. У командній грі на полі товариші капітана теж отримують нахил;
  - `'team'` — сокети ролі `host` і сокети гравців з `teamOf(state, playerId) === tilt.sorterId`, крім `by`.

  Сцена в командній грі поза полем і інші команди не отримують нічого.
- **Дросель телефона.** `useTiltSender` шле останнє значення не частіше ніж раз на `SORT_TILT_MS` (100 мс), з відкладеним хвостом, як `useDraftSender`. Однакове значення двічі поспіль не шле. `release()` шле `{ categoryId: null, amount: 0 }` одразу й скасовує хвіст.
- **Скидання в глядачів.** Нахил діє лише тоді, коли збігаються:
  - `tilt.seq === live.seq`;
  - `tilt.wordId === live.card?.id`;
  - `!view.paused`;
  - `toward !== null`.

  Так нахил скидається після ходу, нового слова й паузи. `useGame` очищає `tilts`, коли приходить зріз із `paused: true`, і після розриву. Тож після продовження й перепідключення старий нахил не повертається.

*Як телефон рахує нахил (`tiltOf`)*
- `tiltOf(dx, dy, positions, categories, under)`, де `under` — зона під пальцем (`zoneAt`) або `null`:
  - `under !== null` → `{ categoryId: категорія цієї зони, amount: 1 }`;
  - інакше домінуюча вісь дає позицію (як `swipeTarget`, але без порогу). Якщо зони в цій позиції немає або відстань < 12 px → `{ categoryId: null, amount: 0 }`;
  - інакше `amount = min(1, distance / TILT_FULL_PX)`, де `TILT_FULL_PX = 120`, округлено до 0,05.
- `SortPlay` з `sort.watched && sort.canSort`:
  - `onPointerMove` → `push(tiltOf(…))`;
  - `onPointerUp` без ходу й `onPointerCancel` → `release()`;
  - хід (`moveTo`) → лише `cancel()` хвоста: `seq` зміниться сам.

  Дотик до зони й стрілка нахилу не шлють: глядачі бачать одразу політ.

*Що бачать глядачі (`SortLive`)*
- `SortLive` будує рушій з поступу того, хто сортує:
  - `sorterId`, `nickname` (у командній грі — назва команди);
  - `card` — `{ id, text }` голови черги лише на етапі `question` без запису; інакше `null`;
  - `missed` — слово останньої помилки (як `PlayerSort.missed`), для трусіння під час підвисання;
  - `lockedUntil` / `lockRemainingMs` — як у `PlayerSort` (на паузі залишок);
  - `sorted`, `total`, `misses`, `timeMs`;
  - `seq = sorted.length + misses`;
  - `columns: SortColumn[]` — для кожної категорії запитання в порядку автора `{ id: categoryId, words: розкладені слова цієї категорії в порядку ходів }`;
  - `last: SortMove | null` — `lastSortMove`;
  - `marks` — лише на `reveal`, інакше `null`.
- **Ключа `categoryId` у живих полях немає:** стовпець — `id`, хід — `to`, нахил — `toward`. Наявна перевірка «у зрізі глядача немає `categoryId`» (`views.sort.test.ts`) лишається чинною: вона ловить витік категорій нерозкладених слів. Слова в `columns` — лише вже розкладені правильно (їхню категорію глядачі й так бачать у польоті).
- **Куди йде `SortLive`:**
  - `SortInfo.live` — лише коли `sortAudience === 'all'` і той, хто вибрав клітинку, є серед гравців. Сцена, пульт і глядачі отримують його в спільній частині. `playerView` того, хто вибрав (у командній грі — кожного з його команди: `ownView` будується для id команди), отримує `sort: { ...shared.sort, words: null, live: null }`, як зараз зі словами;
  - `PlayerSort.live` — у командній грі (`teamsOn`) завжди, для власної команди: капітан і товариші отримують однаковий `ownView(teamId)`. Капітан його не малює, товариші малюють у `TeamWatch`. У соло — `null`: власні розкладені слова гравцеві не потрібні, і наявний тест «у зрізі p1 лише текст його поточної картки» лишається без змін;
  - `PlayerSort.watched = sortAudience(state, play) !== null`.
- `SortInfo.live` є на `question`, `locked` і `reveal`, як і весь `SortInfo` (`currentSort`). На `locked` `card` — `null`.

*Останній хід (`lastSortMove`)*
- `progress.missed !== null`:
  - `missedInto` є → `{ wordId: missed, to: missedInto, hit: false }`;
  - немає (стан версії 11) → `null`.
- інакше, якщо `sorted.length > 0` → `{ wordId: sorted.at(-1), to: категорія цього слова, hit: true }`;
- інакше `null`.
- `SortMove` у зрізі має ще `text` слова.

*Позначки слів (`sortMarks`)*
- `sortMarks(question, progress, finished)` повертає `SortWordMark[]` у порядку слів запитання, лише для слів з `misses > 0` або `late`:
  - `misses` — `wordMisses[wordId] ?? 0`, але **лише тоді, коли сума `wordMisses` дорівнює `progress.misses`**. Інакше (немає лічильника або кімната версії 11 почала сортування до деплою й рахувала частково) — `0` для всіх, тобто без «✗N»;
  - `late` — `!finished && progress.queue.includes(wordId)`. `finished` — запис `accepted` (усе розкладено).
- Гравець, що не зробив жодного ходу, має всі слова `late` (`sortOf` за замовчуванням дає повну чергу).
- `PlayerSort.marks` і `SortLive.marks` — лише на етапі `reveal`. Сцена в класиці позначок не отримує взагалі (`SortInfo.live === null`).

*Політ (веб)*
- `useSortFlight(live)` стежить за `live.seq`. Перший рендер не анімує (перезавантаження сторінки чи прихід на середину).
  - Коли `seq` зріс і `live.last !== null` → `flight = { wordId, to, hit }` на `FLY_MS = 450`.
  - Для влучання ще `landed = wordId` на `LANDED_MS = 1500`.
  - `prefers-reduced-motion` → без `flight`, лише `landed`.
- Картка в польоті має клас `is-flying` і `data-to`. При помилці — `is-miss` (трусіння й червоний, CSS як `is-shaking` + колір), після `FLY_MS` вона повертається в центр. Поки триває підвисання (`lockedUntil`), у центрі лежить `missed` і видно рядок `.sort-lock` з відліком, як на телефоні.
- Влучене слово з'являється в стовпці `li.is-landed` з «✓» і за `LANDED_MS` втрачає позначку. Слово лежить у стовпці з моменту зрізу, а не після анімації: e2e і модульні тести перевіряють стовпець одразу.

*Вигляд*
- **Картка глядача** — окремий клас `.sort-live-card` (той самий вигляд, що `.sort-card`, через спільний селектор у CSS), а не `.sort-card`. Причини:
  - помічник e2e `sortCard` шукає `.sort-card` і не має бачити чужої картки;
  - перевірка 7f «у глядача немає `.sort-card`» лишається правдою: картка глядача не інтерактивна.
- **Нахил у CSS:** змінні `--tilt` (0…1), `--tilt-x`, `--tilt-y` (−1…1) на картці:
  ```css
  .sort-live-card { transform: translate(calc(var(--tilt-x, 0) * var(--tilt, 0) * var(--tilt-reach, 3rem)), calc(var(--tilt-y, 0) * var(--tilt, 0) * var(--tilt-reach, 3rem))) rotate(calc(var(--tilt-x, 0) * var(--tilt, 0) * 12deg)); transition: transform 120ms linear; }
  ```
  - На телефоні глядача (арена з зонами по краях) зміщення дає позиція зони: left (−1, 0), right (1, 0), top (0, −1), bottom (0, 1).
  - На сцені (стовпці в ряд) `--tilt-x = ((index + 0.5) / count − 0.5) × 2`, `--tilt-y = 1` (до стовпців, що стоять під карткою), `--tilt-reach: 18rem`.
  - Зона чи стовпець, куди хилиться картка або летить, має клас `is-toward`. Картка має `data-toward` з id категорії.
- **Телефон глядача (`SortWatch` з `live`):**
  - угорі `p.sort-watching` «Оля сортує слова»;
  - арена з зонами-`div` (як зараз) і `SortLiveCard` посередині;
  - `.sort-progress` «N з M»;
  - `SortReveal` з `placed` (`.sort-reveal.is-live`, малі стовпці);
  - чипи `SortWords` лише ще не розкладених слів.

  Без `live` (старі зрізи, фікстури) — як зараз.
- **Сцена на полі (`SortStage`)** замінює пару `SortReveal` + `SortWords` у `StageScreen`, коли `view.sort?.live` є:
  - смуга з `sort-watching` і `SortLiveCard` (`layout="stage"`);
  - під нею стовпці `SortReveal` з `placed`, `toward`, `landed`;
  - нижче чипи нерозкладених слів;
  - на `reveal` — `SortReveal` з `question = reveal` (`is-open`) і `marks = live.marks`, без картки й чипів.

  Рядки `SortBoard` під ним лишаються. Висоту стовпців резервує `total`, як зараз, тож блок не росте.
- **Класи стовпців:** `is-live` — наповнення під час гри, `is-open` — лише розкриття. Перевірки 7f і 9a «`.sort-reveal.is-open` до розкриття немає» лишаються чинними.
- **Позначки:** у `li` розкриття `<span class="sort-mark" aria-label="Помилок на слові: 2">✗2</span>`. Слово «не встиг» — `li.is-late` з `<span class="sort-late">не встиг</span>`. Слово може мати обидві позначки.
- **Свій підсумок на телефоні (класика, той, хто вибрав клітинку, команда):** `SortOutcome` на `reveal` під рядком підсумку малює `SortReveal` з `question = view.reveal` і `marks = me.sort.marks`.
- **Пульт:** `LiveAnswers` отримує `tilts`. Для рядка з `progress.kind === 'sort'` бере нахил `tilts[row.id]` за правилом скидання (`cardId`, `seq`, `!paused`, `amount ≥ 0.2`) і дописує до тексту сортування ` · → «{категорія}»`. Категорію бере з `view.question` (повне запитання пульта). Окремої арени на пульті немає: сцена — для залу, пульт — для керування.

*Чого не робимо*
- живого руху й чужих слів у класиці, бліці, фіналі й на бліц-клітинці соло-гри;
- нахилу в стані гри, у збереженій кімнаті й у повному зрізі;
- нової помилки (`ErrorCode`);
- арени сортування на пульті;
- розкладених слів на власному телефоні того, хто сортує, під час гри (там лише картка, як зараз);
- особистих позначок на сцені в класиці;
- нового демо-вмісту (тексти e2e без тем росії й СРСР).

## Глобальні обмеження

- **Анти-ціль:** у класиці, бліці, фіналі й на бліц-клітинці соло-гри ні сцена, ні чужий телефон не отримують чужої картки, розкладених слів, нахилу чи позначок. Перевіряють:
  - задача 2 — зрізи (JSON без слів, `SortInfo.live === null`, `PlayerSort.live === null` у соло);
  - задача 3 — сервер і сокети (нахил відхилено, подій немає);
  - задача 8 — кадри й сокетні кадри.
- У командній грі інша команда й сцена (поза полем) не отримують ні `PlayerSort.live` чужої команди, ні `sort:tilt`.
- Бали, правила сортування й `hostView(...).responses` не змінюються. Нові ключі стану — лише `SortProgress.wordMisses` і `SortProgress.missedInto`.
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`, тексти довідки — лише в `apps/web/src/help/*.ts`.
- Сцена 1280 × 720 без прокрутки. Телефон 360–375 px і пульт 375 px без горизонтальної прокрутки.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2`. Якщо PGlite падає з браком пам'яті, запускати окремо:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=1 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- Наскрізні тести: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts`.
  - **Повний прогін триває близько 30 хвилин, і машині може забракнути пам'яті.** Задача 8 запускає свої сценарії (`-t "part 11d"`), а повний прогін — **один раз у фоні** наприкінці.
  - Затримка 11b в e2e увімкнена (`pacing: true`). Кнопки пульта чекають, доки стануть активними, без снів.
  - Кадри лежать в `apps/server/e2e/artifacts/shots`, префікс 11d — `p11d-`.
- Новий вміст (тексти e2e, приклади в довідці) — без тем росії й СРСР.
- Після останньої задачі й фінальної рецензії гілку зливають у `main`. Перед пушем — перевірка `live_room` (правило 14a) і рядок у звіті про версію 12.

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/engine/src/game.ts`, `sort.ts`, `restore.ts`, `game.sort.test.ts`, `restore.test.ts`, `packages/shared/src/views.ts` (лише `SortWordMark`) | `wordMisses`, `missedInto`, версія 12, `sortSeq`, `lastSortMove`, `sortMarks`, `sortAudience` | 1 |
| `packages/shared/src/views.ts`, `packages/engine/src/views.ts`, `live.ts`, `views.sort.test.ts`, `views.teams.test.ts`, `live.test.ts`; фікстури вебу (лише нові поля) | `SortLive` у `SortInfo` / `PlayerSort`, `watched`, `marks`, `cardId` / `seq` | 2 |
| `packages/shared/src/events.ts`, `game.ts`, `packages/engine/src/sort.ts` (`tiltRefusal`), `game.sort.test.ts`, `apps/server/src/rooms/manager.ts`, `manager.test.ts`, `apps/server/src/socket.ts`, `socket.test.ts` | нахил: схема, перевірка, дросель, адресати | 3 |
| `apps/web/src/live/useGame.ts`, `useGame.test.tsx`, `apps/web/src/pages/Stage.tsx`, `Play.tsx`, `Host.tsx`, `apps/web/src/screens/SortView.tsx`, `SortView.test.tsx` | `tilts`; `tiltOf`, `useTiltSender`, надсилання з `SortPlay` | 4 |
| `apps/web/src/screens/SortView.tsx`, `SortView.test.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css` | `liveTilt`, `tiltVars`, `useSortFlight`, `SortLiveCard`, `SortWatch`, `SortStage`, `SortReveal` | 5 |
| `apps/web/src/screens/StageScreen.tsx`, `PlayerScreen.tsx`, `TeamWatch.tsx`, `LiveAnswers.tsx`, `HostScreen.tsx` і їхні тести | підключення на сцені, телефонах, у команді й на пульті | 6 |
| `apps/web/src/help/questions.ts`, `help/teams.ts`, `help/host-help.test.ts` | довідка | 7 |
| `apps/server/e2e/full-game.e2e.ts` | сценарії 11d | 8 |

## Порядок збирання

- 1 → 2 → 3. Задача 4 — після 3 (типи подій). Задача 5 — після 2 (типи `SortLive`), паралельно з 3 і 4. Задача 6 — після 4 і 5. Задача 7 — будь-коли після 1. Задача 8 — остання.
- **Навмисні зміни наявних очікувань** (лише такі):
  - `restore.test.ts`: `READABLE_STATE_VERSIONS` → `[2, …, 12]`, новий запис `KEYS[12]`, список `missing` у «representative states…» → `['ChainProgress']` (задача 1);
  - `game.sort.test.ts`: перевірки `toEqual` повного `SortProgress` після помилки (якщо такі є) — плюс `wordMisses` і `missedInto` (задача 1);
  - `live.test.ts`: `toEqual` прогресу сортування — плюс `cardId` і `seq` (задача 2);
  - фікстури вебу з `SortInfo`, `PlayerSort`, `LiveProgress` сортування: плюс нові поля (`live: null`, `watched: false`, `marks: null`, `cardId`, `seq`) (задача 2);
  - `StageScreen.test.tsx` / `PlayerScreen.test.tsx`, якщо вони звіряють розмітку поля з `SortWords` під `SortReveal` при `live: null`, — без змін; з `live` — нові тести (задача 6);
  - наскрізні сценарії 7f і 9a лише тоді, коли прогін покаже, що вони дивляться на те, що змінилося (задача 8, перелік там).
  - Якщо падає інше, рецензент розбирає причину, а не правку очікування.

## На що дивитися рецензентові

1. **Лише одна сторона.** У класиці, бліці, фіналі й на бліц-клітинці соло: `SortInfo.live === null`, `PlayerSort.watched === false`, `PlayerSort.live === null`, сервер відхиляє нахил, жоден сокет не отримує `sort:tilt`. Тести: задачі 2 і 3.
2. **Той, хто вибрав, і його команда** не отримують `SortInfo.live` (як і `words`). Інша команда не отримує ні `PlayerSort.live` чужої команди, ні нахилу. Тести: задачі 2 і 3.
3. **Нахил тимчасовий.** Немає в `GameState`, `snapshot`, повному зрізі. Скидається після ходу, паузи, нового слова, перепідключення. Дросель на телефоні й на сервері. Тести: задачі 3, 4 і 5.
4. **Стан гри.** Версія 12, читабельні 2–12, нові ключі лише в `SortProgress`. Кімната версії 11 відновлюється й показує розкриття без «✗N». Тести: задача 1.
5. **Позначки.** «✗N» лише коли сума лічильника дорівнює `misses`. «не встиг» — для слів, що лишилися в черзі. На сцені класики позначок немає. Тести: задачі 1, 2 і 6.
6. **Вигляд.** Картка глядача — `.sort-live-card`, стовпці під час гри — `is-live`, розкриття — `is-open`. Сцена 1280 × 720 з 4 × 5 словами без прокрутки. Кадри `p11d-*`.

---

### Задача 1. Рушій: помилки по словах, зона помилки, версія 12; останній хід, позначки, де показ дозволено

**Files:**
- Modify: `packages/engine/src/game.ts` (`SortProgress`), `packages/engine/src/sort.ts`, `packages/engine/src/restore.ts`, `packages/shared/src/views.ts` (лише `SortWordMark`)
- Test: `packages/engine/src/game.sort.test.ts`, `packages/engine/src/restore.test.ts`

**Interfaces:**
- `packages/engine/src/game.ts`, `SortProgress` — два нові необов'язкові ключі після `missed`:
  ```ts
  /** Помилки на кожному слові (11d); немає — стан до 11d, позначок «✗N» на розкритті немає. */
  wordMisses?: Record<string, number>;
  /** Категорія, у яку пішла остання помилка (11d), — зона трусіння в глядачів; лише разом із missed. */
  missedInto?: string;
  ```
- `packages/shared/src/views.ts`, поруч із `PlayerSort`:
  ```ts
  /** Позначка слова на розкритті сортування (11d): скільки разів помилялися й чи не дійшли до нього. */
  export interface SortWordMark {
    wordId: string;
    /** 0 — немає «✗N» (без помилок або лічильник неповний). */
    misses: number;
    /** «не встиг»: слово лишилося в черзі, коли час скінчився. */
    late: boolean;
  }
  ```
- `sortWord`:
  - помилка → `{ queue: [...rest, wordId], sorted, misses: misses + 1, lockedUntil, missed: wordId, missedInto: categoryId, wordMisses: { ...progress.wordMisses, [wordId]: (progress.wordMisses?.[wordId] ?? 0) + 1 } }`;
  - влучання → як зараз, `missedInto` немає, `wordMisses` переноситься, якщо був: `...(progress.wordMisses === undefined ? {} : { wordMisses: progress.wordMisses })`.
- Нові експорти `sort.ts`:
  ```ts
  type SortQuestion = Extract<Question, { type: 'sort' }>;
  /** Ходів зроблено: правильні + помилки (11d) — ключ польоту картки й свіжості нахилу. */
  export function sortSeq(progress: SortProgress): number;
  /** Останній хід для глядачів (див. план, «Останній хід»); null — ходів немає або помилка без зони (стан до 11d). */
  export function lastSortMove(question: SortQuestion, progress: SortProgress): { wordId: string; to: string; hit: boolean } | null;
  /** Позначки слів на розкритті (див. план, «Позначки слів»); finished — запис accepted. */
  export function sortMarks(question: SortQuestion, progress: SortProgress, finished: boolean): SortWordMark[];
  /** Де живий показ дозволено (11d): 'all' — звичайна клітинка поля; 'team' — командна гра поза нею; null — сортують усі одночасно. */
  export function sortAudience(state: GameState, play: Play): 'all' | 'team' | null;
  ```
- `restore.ts`:
  - `GAME_STATE_VERSION = 12`, рядок у переліку: `12 — 11d: SortProgress.wordMisses (помилки по словах) і SortProgress.missedInto (зона останньої помилки).`;
  - `READABLE_STATE_VERSIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, GAME_STATE_VERSION]` з поясненням: «11 → 12 лише додала необов'язкові SortProgress.wordMisses і missedInto. Без них розкриття не показує «✗N» (лише «не встиг» і загальне число помилок), а помилка без зони не летить. Тож кімната, збережена до розгортання 11d, теж відновлюється».

- [ ] **Step 1: Write the failing tests**
  - `game.sort.test.ts`, новий `describe('sort per-word misses (11d)')`, `toSort()` (Анна p1, Богдан p2, слова w1–w4, категорії c1 / c2):
    - помилка на голові `w` → `sortOf(s, 'p1')` має `wordMisses: { [w]: 1 }`, `missedInto: wrong(w)`;
    - після підвисання правильний хід → `missedInto` немає (`'missedInto' in sortOf(s, 'p1')` → `false`), `wordMisses` той самий;
    - друга помилка на тому самому слові, коли воно знову голова (пройти решту правильно, як у «a wrong move on the last word…») → `wordMisses[w] === 2`, `misses === 2`;
    - `sortSeq`: без ходів 0; після помилки й правильного ходу 2;
    - `lastSortMove`: без ходів `null`; після правильного ходу `{ wordId, to: right(wordId), hit: true }`; після помилки `{ wordId: w, to: wrong(w), hit: false }`; та сама помилка без `missedInto` (прибрати ключ вручну) → `null`;
    - `sortMarks`:
      - помилка на `w`, потім два правильні ходи, гравець не закінчив → позначки в порядку `sortQ.words`: `w` — `{ misses: 1, late: true }` (він у черзі), ще не розкладене слово — `{ misses: 0, late: true }`, розкладені — немає;
      - усе розкладено (`sortAll` після помилки) і `finished: true` → лише `[{ wordId: w, misses: 1, late: false }]`;
      - прогрес з `misses: 2` і `wordMisses: { [w]: 1 }` (неповний) → у всіх `misses: 0`;
      - без ходів → чотири позначки `late: true, misses: 0`;
    - `sortAudience`:
      - класика (`toSort`) → `null`;
      - звичайна клітинка поля (як `onBoardSort` у `views.sort.test.ts`) → `'all'`;
      - бліц-клітинка соло → `null`;
      - бліц-раунд → `null`; фінал → `null`;
      - командна гра (`teamGame(teamQuiz([classicRound('r1', [sortQ])]), [['Оля', 'Петро'], ['Іра', 'Марко']])`, запитання відкрито) → `'team'`;
      - командна гра, звичайна клітинка поля → `'all'`;
    - бали й запис не змінилися: наявні тести `game.sort.test.ts` і `game.sort-rounds.test.ts` зелені.
  - `restore.test.ts`:
    - `STATE_SHAPE.SortProgress` — `['queue', 'sorted', 'misses', 'lockedUntil', 'missed', 'wordMisses', 'missedInto']`;
    - `KEYS[12]` — копія `KEYS[11]` з `SortProgress: 'lockedUntil,missed,missedInto,misses,queue,sorted,wordMisses'`;
    - `READABLE_STATE_VERSIONS` → `[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]`;
    - `representative()` + стан сортування з помилкою (`toSort()` → помилка p1 → правильний хід p2), тож список `missing` → `['ChainProgress']`;
    - новий тест «a sort progress of version 11 (no wordMisses, no missedInto) restores and reveals late marks only»: прогрес `{ queue, sorted, misses: 1, lockedUntil: null, missed: null }` переживає `suspend` і JSON; `sortMarks(…, false)` → `misses: 0` у всіх, `late` — для слів у черзі.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/game.sort.test.ts packages/engine/src/restore.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine/src packages/shared/src
  git commit -m "feat(engine): sorting counts misses per word and remembers the zone of the last miss (state version 12, version 11 still readable), with the move count, the last move for watchers, per-word reveal marks (✗N only when the count is whole, «late» for words left) and where live sorting may be shown — a normal board cell for all, a team for its own captain, nowhere when everyone sorts at once"
  ```

### Задача 2. Зрізи: `SortLive` для поля й команди, позначки на розкритті, `watched`; картка й ходи в «Відповідях наживо»

**Files:**
- Modify: `packages/shared/src/views.ts`, `packages/engine/src/views.ts`, `packages/engine/src/live.ts`
- Test: `packages/engine/src/views.sort.test.ts`, `packages/engine/src/views.teams.test.ts`, `packages/engine/src/live.test.ts`; фікстури вебу (лише нові поля, там, де падає `pnpm typecheck`)

**Interfaces:**
- `packages/shared/src/views.ts`:
  ```ts
  /** Слово сортування в зрізі. */
  export interface SortWordView { id: string; text: string }

  /** Хід, який глядачі бачать польотом (11d): to — id категорії, куди пішла картка. */
  export interface SortMove { wordId: string; text: string; to: string; hit: boolean }

  /** Стовпець категорії під час гри (11d): id категорії й розкладені в неї слова в порядку ходів. */
  export interface SortColumn { id: string; words: SortWordView[] }

  /**
   * Живе сортування однієї сторони для глядачів (11d): звичайна клітинка поля — сцені, пульту й іншим телефонам;
   * командна гра — команді (через PlayerSort.live). Ключа categoryId тут немає навмисно: категорії нерозкладених слів не йдуть нікуди.
   */
  export interface SortLive {
    /** Id учасника гри: гравця або команди. */
    sorterId: string;
    nickname: string;
    /** Поточна картка; лише на етапі question без запису, інакше null. */
    card: SortWordView | null;
    /** Слово останньої помилки (для трусіння під час підвисання). */
    missed: SortWordView | null;
    lockedUntil: number | null;
    lockRemainingMs: number | null;
    sorted: number;
    total: number;
    misses: number;
    timeMs: number | null;
    /** Ходів зроблено (sorted + misses): ключ польоту й свіжості нахилу. */
    seq: number;
    /** Усі категорії в порядку автора. */
    columns: SortColumn[];
    last: SortMove | null;
    /** Лише на reveal; інакше null. */
    marks: SortWordMark[] | null;
  }
  ```
  - `SortInfo` + `/** Живий показ (11d): лише звичайна клітинка поля; тому, хто сортує, — null. */ live: SortLive | null;`
  - `PlayerSort`:
    - `/** Нахил цього гравця бачать інші (11d): телефон шле його лише тоді. */ watched: boolean;`
    - `/** Позначки слів на розкритті (11d); інакше null. */ marks: SortWordMark[] | null;`
    - `/** Командна гра: живий показ власної команди для товаришів (11d); соло — null. */ live: SortLive | null;`
  - `LiveProgress`, варіант `'sort'`: `{ kind: 'sort'; card: string | null; cardId: string | null; seq: number; sorted: number; total: number; misses: number }`.
- `packages/engine/src/views.ts`:
  ```ts
  /** Живий показ поступу sorterId для глядачів (див. план 11d, «Що бачать глядачі»). */
  function sortLive(state: GameState, open: NonNullable<ReturnType<typeof currentSort>>, sorterId: string): SortLive;
  ```
  - `sortInfo`: `live: sortAudience(state, play) === 'all' && play.board?.chooserId !== undefined && state.players.some((p) => p.id === play.board?.chooserId) ? sortLive(state, open, play.board.chooserId) : null`.
  - `playerSort(state, playerId)`:
    - `watched: sortAudience(state, open.play) !== null`;
    - `marks: state.phase === 'reveal' ? sortMarks(question, progress, record?.accepted === true) : null`;
    - `live: teamsOn(state) ? sortLive(state, open, playerId) : null`.
  - Вирізання для того, хто вибрав клітинку (поруч із наявним для `words`): `{ sort: { ...shared.sort, words: null, live: null } }`.
- `packages/engine/src/live.ts`: прогрес сортування + `cardId: progress.queue[0] ?? null` (null, коли `card` null) і `seq: sortSeq(progress)`.

- [ ] **Step 1: Write the failing tests**
  - `views.sort.test.ts`, новий `describe('live sorting views (11d)')`:
    - **Класика без живого показу:** `toSort()`, хід p1 → `stageView(s).sort?.live` → `null`; `playerView(s, 'p2')?.sort?.live` → `null`; `playerView(s, 'p1')?.me.sort` має `watched: false`, `live: null`, `marks: null`. Наявний тест «never sends a word's category…» зелений без змін.
    - **Поле (`onBoardSort`):**
      - одразу: `stageView(s).sort?.live` має `{ sorterId: 'p1', nickname: 'Анна', card: wordOf(head(s, 'p1')), sorted: 0, misses: 0, seq: 0, last: null, marks: null }`, `columns` — `[{ id: 'c1', words: [] }, { id: 'c2', words: [] }]`;
      - `hostView(s).sort?.live` і `playerView(s, 'p2')?.sort?.live` — той самий об'єкт;
      - `playerView(s, 'p1')?.sort?.live` → `null`; `playerView(s, 'p1')?.me.sort?.watched` → `true`;
      - правильний хід `w` → `columns` має `w` у його стовпці (`{ id: right(w), words: [wordOf(w)] }`), `last: { wordId: w, text, to: right(w), hit: true }`, `seq: 1`, `card` — нова голова;
      - помилка → `last.hit === false`, `last.to === wrong(w)`, `missed: wordOf(w)`, `lockedUntil` з поступу; на паузі (`pause`) `lockedUntil: null`, `lockRemainingMs` — залишок;
      - `JSON.stringify(playerView(s, 'p2'))` не містить `categoryId` і не містить текстів нерозкладених слів **поза** `sort.words` (вирізати `sort.words` перед перевіркою: там усі слова за абеткою, як і раніше) і поза поточною карткою;
      - на `locked` → `live.card === null`, стовпці ті самі;
      - на `reveal` → `live.marks` дорівнює `sortMarks(...)` поступу p1; `playerView(s, 'p1')?.me.sort?.marks` — те саме.
    - **Бліц-клітинка соло** (клітинка `kind: 'blitz'` із сортуванням, як у `game.board-cells.test.ts`) → `live: null`, `watched: false`.
    - **Розкриття класики:** p1 помилився на `w` і розклав усе, p2 зробив один хід → на `reveal` `playerView(s, 'p1')?.me.sort?.marks` → `[{ wordId: w, misses: 1, late: false }]`; у p2 три позначки `late: true`; `stageView(s).sort?.live` → `null`; `JSON.stringify(stageView(s))` не містить `wordMisses` і `"marks":[`.
  - `views.teams.test.ts`, новий тест «a captain sorts: the own team sees the live card and columns, the other team and the stage see nothing (11d)»: `teamGame(teamQuiz([classicRound('r1', [sortQ])]), [['Оля', 'Петро'], ['Іра', 'Марко']])`, запитання відкрито, капітан Оля (`actorOf` → `t1`) зробила правильний хід:
    - `playerView(s, 'm2')?.me.sort?.live` (Петро) має `sorterId: 't1'`, `sorted: 1`, розкладене слово в стовпці, `card` — голова черги `t1`;
    - `playerView(s, 'm1')?.me.sort?.watched` → `true`;
    - `playerView(s, 'm4')?.me.sort?.live?.sorterId` (Марко) → `'t2'`, `sorted: 0`, порожні стовпці: зріз Марка не містить розкладеного слова Червоних;
    - `stageView(s).sort?.live` → `null`;
    - командна гра, звичайна клітинка поля Червоних → `stageView(s).sort?.live?.sorterId === 't1'`; `playerView(s, 'm3')?.sort?.live` (Іра) — є; `playerView(s, 'm2')?.sort?.live` (Петро, команда, що вибрала) → `null`, а `me.sort.live` — є.
  - `live.test.ts`: наявна перевірка `toEqual({ kind: 'sort', card, sorted: 1, total: 4, misses: 0 })` → `{ kind: 'sort', card, cardId: head(s, 'p1'), seq: 1, sorted: 1, total: 4, misses: 0 }` (навмисна зміна); усе розкладено → `cardId: null`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/views.sort.test.ts packages/engine/src/views.teams.test.ts packages/engine/src/live.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Типи в shared, `sortLive`, поля в `sortInfo` / `playerSort`, вирізання для того, хто вибрав, `cardId` / `seq` у `live.ts`. Фікстури вебу: лише нові поля (`live: null`, `watched: false`, `marks: null`, `cardId`, `seq`) там, де падає `pnpm typecheck`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src packages/engine/src apps/web/src
  git commit -m "feat(engine): live sorting views — on a normal board cell the stage, the host and the other phones get the chooser's card, columns of placed words, the last move and the lock, a team gets its own captain's, per-word marks on the reveal for the player and for board watchers; nothing new where everyone sorts at once, no categories of unplaced words anywhere; the host live row carries the card id and move count"
  ```

### Задача 3. Нахил: подія, перевірка рушія, дросель і адресати на сервері

**Files:**
- Modify: `packages/shared/src/events.ts`, `packages/shared/src/game.ts`, `packages/engine/src/sort.ts`, `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`
- Test: `packages/engine/src/game.sort.test.ts`, `apps/server/src/rooms/manager.test.ts`, `apps/server/src/socket.test.ts`

**Interfaces:**
- `packages/shared/src/game.ts`:
  ```ts
  /** Телефон шле нахил картки сортування не частіше ніж раз на стільки мс (11d). */
  export const SORT_TILT_MS = 100;
  /** Сервер відкидає нахил, що прийшов раніше ніж через стільки мс після попереднього (запас на тремтіння мережі). */
  export const SORT_TILT_GAP_MS = 80;
  ```
- `packages/shared/src/events.ts`:
  ```ts
  /** Нахил картки сортування (11d): категорія, у бік якої тягнуть (null — відпустив без ходу), і наскільки. */
  export const sortTiltSchema = z.object({ wordId: id64, categoryId: id64.nullable(), amount: z.number().min(0).max(1) });
  /** Нахил для глядачів (11d): sorterId — учасник гри (гравець або команда), seq — ходів на мить нахилу. */
  export interface SortTilt { sorterId: string; wordId: string; toward: string | null; amount: number; seq: number }
  ```
  - `ClientToServerEvents`: `/** Сортування: нахил картки, поки її тягнуть (11d); у стан гри не йде. */ 'player:sort-tilt': (payload: z.infer<typeof sortTiltSchema>, ack: Ack) => void;`
  - `ServerToClientEvents`: `/** Нахил картки того, хто сортує (11d): лише там, де показ дозволено. */ 'sort:tilt': (tilt: SortTilt) => void;`
- `packages/engine/src/sort.ts`:
  ```ts
  /** Чи можна зараз слати нахил (див. план 11d, «Перевірка»); null — можна. */
  export function tiltRefusal(state: GameState, sorterId: string, wordId: string, categoryId: string | null, now: number): ErrorCode | null;
  ```
- `manager.ts`:
  ```ts
  /** Останній нахил того, хто сортує (11d): лише пам'ять, не стан гри й не збережена кімната. */
  export interface Tilt { questionIndex: number; seq: number; wordId: string; toward: string | null; amount: number; at: number }
  ```
  - `Room.tilts: Map<string, Tilt>` (коментар як у `drafts`), у створенні й відновленні кімнати — `new Map()`.
  - `RoomEvent` + `| { type: 'tilt'; tilt: SortTilt; by: string; audience: 'all' | 'team' }`.
  - Метод:
    ```ts
    /** Нахил картки (11d): перевірка рушія, дросель SORT_TILT_GAP_MS, подія кімнати лише з новим значенням; стан гри не змінюється. */
    tilt(room: Room, playerId: string, tilt: { wordId: string; categoryId: string | null; amount: number }): AckResult;
    ```
    Порядок: `alive` → `act(…, 'captain')` → `tiltRefusal` → `audience = sortAudience(...)` → округлення `amount` → дросель і повтор → `room.tilts.set` → `emit`.
  - `sort()`: після успішного `apply` — `room.tilts.delete(who.id)`.
  - `host()` з `pause`: після успіху `room.tilts.clear()`.
- `socket.ts`:
  - `on('player:sort-tilt', …)` — лише `player`, `sortTiltSchema`, `manager.tilt(...)`.
  - У `manager.onEvent`, гілка `event.type === 'tilt'`:
    ```ts
    // Нахил — лише там, де сортує одна сторона: на полі — усім, крім автора; у команді — його команді й пульту.
    members
      .filter((socket) => {
        const { role, playerId } = socket.data.identity;
        if (playerId !== null && playerId === event.by) return false;
        if (event.audience === 'all') return true;
        return role === 'host' || (role === 'player' && playerId !== null && teamOf(room.state, playerId) === event.tilt.sorterId);
      })
      .forEach((socket) => socket.emit('sort:tilt', event.tilt));
    ```

- [ ] **Step 1: Write the failing tests**
  - `game.sort.test.ts`, `describe('tilt rules (11d)')`:
    - класика (`toSort`) → `tiltRefusal(s, 'p1', head(s, 'p1'), 'c1', 2000)` → `'wrong_phase'`;
    - поле (`onBoardSort`, винести в `testing/sort.ts` як `toBoardSort()`, якщо зручно): той, хто вибрав, голова черги, `'c1'` → `null`; `categoryId: null` → `null`;
    - не голова → `'sort_stale'`; невідома категорія → `'not_found'`; інший гравець (p2) → `'not_your_turn'`; на паузі → `'paused'`; під час підвисання → `'sort_locked'`; після запису → `'already_answered'`; на `locked` → `'wrong_phase'`;
    - командна гра (класичний раунд) → для `'t1'` `null`.
  - `manager.test.ts`, новий `describe('sort tilt (11d)')`:
    - **поле:** кімната з раундом поля й клітинкою сортування (як у наявних тестах поля менеджера), гравець вибрав клітинку:
      - `manager.tilt(room, chooser, { wordId: head, categoryId: c, amount: 0.62 })` → `{ ok: true }`; `events` містить `{ type: 'tilt', tilt: { sorterId: chooser, wordId: head, toward: c, amount: 0.6, seq: 0 }, by: chooser, audience: 'all' }`;
      - стан гри не змінився (`room.state` той самий об'єкт); подій `changed` немає;
      - другий нахил через 50 мс (`scheduler.advance(50)`) → `{ ok: true }` без нової події; через 100 мс — нова подія;
      - той самий нахил ще раз → без події;
      - відпускання (`categoryId: null`) одразу після нахилу → подія з `toward: null, amount: 0`;
      - `JSON.stringify(manager.snapshot(room))` не містить `tilts` і `toward`;
      - успішний `manager.sort(...)` → `room.tilts.has(chooser)` → `false`;
      - `host pause` → `room.tilts.size === 0`;
    - **класика:** `manager.tilt` → `{ ok: false, error: 'wrong_phase' }`, подій немає;
    - **команди** (`teamPlaying([classicRound('r1', [sortQ])])`): капітан Олена → подія з `tilt.sorterId === red`, `by === olena.playerId`, `audience: 'team'`; Тарас (не капітан) → `{ ok: false, error: 'not_captain' }`.
  - `socket.test.ts`, новий `describe('sort tilt over sockets (11d)')` з помічником `listen` для `'sort:tilt'` (як у `describe('audio over sockets')`):
    - **поле:** гравець вибрав клітинку сортування, шле `player:sort-tilt` → сцена, пульт і інший гравець отримують `SortTilt` з `toward`; сам автор — ні. Кругообіг підтвердження (`send` будь-якої події кожному) гарантує, що нічого не загубилося;
    - **класика:** `player:sort-tilt` → `{ ok: false, error: 'wrong_phase' }`, ніхто нічого не отримав;
    - **команди** (помічник `teamLobby([classicRound('r1', [sortQ])])`): Олена (капітан червоних) шле нахил → Тарас і пульт отримують; Іра, Марко, сцена й сама Олена — ні;
    - неправильне тіло (`amount: 2`, `wordId: 5`) → `invalid_payload`; від сцени чи пульта → `forbidden`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/game.sort.test.ts` і `pnpm vitest run --maxWorkers=1 apps/server/src/rooms/manager.test.ts apps/server/src/socket.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src packages/engine/src apps/server/src
  git commit -m "feat(server): relay the sort card tilt — player:sort-tilt checked by the same rules as a move, throttled and rounded, kept only in room memory, sent as a light sort:tilt event to everyone but the author on a board cell and to the own team and the host in team play; refused where everyone sorts at once; a move and a pause clear it"
  ```

### Задача 4. Веб: нахили в `useGame`; телефон того, хто сортує, шле нахил

**Files:**
- Modify: `apps/web/src/live/useGame.ts`, `apps/web/src/pages/Stage.tsx`, `apps/web/src/pages/Play.tsx`, `apps/web/src/pages/Host.tsx`, `apps/web/src/screens/SortView.tsx`
- Test: `apps/web/src/live/useGame.test.tsx`, `apps/web/src/screens/SortView.test.tsx`

**Interfaces:**
- `useGame.ts`:
  - `const [tilts, setTilts] = useState<Record<string, SortTilt>>({})`;
  - `socket.on('sort:tilt', (tilt) => setTilts((prev) => ({ ...prev, [tilt.sorterId]: tilt })))`;
  - у `'state'`: `if (next.paused) setTilts({})`;
  - у `'disconnect'` і на зміні з'єднання (початок ефекту): `setTilts({})`;
  - повертає `tilts`.
- Сторінки: `tilts={game.tilts}` у `StageScreen`, `PlayerScreen`, `HostScreen`. Проп у трьох екранах — `tilts?: Record<string, SortTilt>` (типово `{}`). Задача 4 лише пропускає його далі, а малюють задачі 5–6.
- `SortView.tsx`:
  ```ts
  /** Відстань, на якій нахил стає повним (1), px. */
  export const TILT_FULL_PX = 120;
  /** Нахил з руху пальця (див. план 11d, «Як телефон рахує нахил»). */
  export function tiltOf(dx: number, dy: number, positions: ZonePosition[], categories: Choice[], under: ZonePosition | null): { categoryId: string | null; amount: number };
  export type TiltSender = ((tilt: { categoryId: string | null; amount: number }) => void) & { release: () => void; cancel: () => void };
  /** Нахил на сервер (11d): не частіше SORT_TILT_MS, з хвостом, без повторів; release — одразу «в центр»; wordId — поточна картка. */
  export function useTiltSender(send: Send, active: boolean, wordId: string | null): TiltSender;
  ```
  - `useTiltSender`:
    - шле `send('player:sort-tilt', { wordId, categoryId, amount })`;
    - зміна `wordId` чи `active` → скасувати хвіст і забути «вже надіслано»;
    - `release()` шле, лише якщо останнім надісланим був нахил не в центр.
  - `SortPlay`:
    - `const tilt = useTiltSender(send, sort.watched && sort.canSort, sort.card?.id ?? null)`;
    - у `onPointerMove` — `tilt(tiltOf(dx, dy, positions, categories, zoneAt(event.clientX, event.clientY)))`;
    - у `onPointerUp`: якщо `pos === null` → `tilt.release()`, інакше `tilt.cancel()` перед `moveTo`;
    - `onPointerCancel` → `tilt.release()`.

- [ ] **Step 1: Write the failing tests**
  - `useGame.test.tsx` (за зразком наявних тестів з підробним сокетом): подія `sort:tilt` → `result.current.tilts[sorterId]` — той нахил; другий від того самого `sorterId` замінює перший; зріз з `paused: true` → `tilts` порожні; `disconnect` → порожні.
  - `SortView.test.tsx`, `describe('tilt sending (11d)')`:
    - `tiltOf`:
      - `(60, 5, ['left', 'right'], cats, null)` → `{ categoryId: cats[1].id, amount: 0.5 }`;
      - `(-200, 0, …)` → `{ categoryId: cats[0].id, amount: 1 }`;
      - `(5, 4, …)` → `{ categoryId: null, amount: 0 }`;
      - `(0, -80, ['left', 'right'], …)` → `null`-нахил (зверху зони немає);
      - `(10, 0, …, 'left')` → `{ categoryId: cats[0].id, amount: 1 }`;
    - `useTiltSender` з підробним `send` і `vi.useFakeTimers()`:
      - три виклики за 30 мс → через 100 мс один `send` з останнім значенням;
      - однакове значення двічі поспіль → один `send`;
      - `release()` → одразу `send` з `{ categoryId: null, amount: 0 }`, хвіст скасовано;
      - `active: false` → нічого;
      - зміна `wordId` → хвіст скасовано;
    - `SortPlay` з `sort.watched: true`: `pointerDown` на картці, `pointerMove` на (80, 0) → за 100 мс `send('player:sort-tilt', { wordId, categoryId: правої зони, amount: 0.65 })`; `pointerUp` на місці (без зони, `dx` < порогу свайпу) → `send` з `categoryId: null`. З `watched: false` — жодного `player:sort-tilt`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/live/useGame.test.tsx apps/web/src/screens/SortView.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): the sorter's phone sends the card tilt while dragging where others may watch — direction from the dominant axis or the zone under the finger, strength up to 1 at 120 px, at most every 100 ms with a trailing send and no repeats, back to the centre on a release without a move; the game hook keeps the latest tilt per sorter and forgets them on a pause or a lost connection"
  ```

### Задача 5. Веб: картка глядача, нахил, політ, стовпці й позначки

**Files:**
- Modify: `apps/web/src/screens/SortView.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/SortView.test.tsx`

**Interfaces:**
- `SortView.tsx`:
  ```ts
  export const FLY_MS = 450;
  export const LANDED_MS = 1500;
  /** Нахил, що діє зараз (див. план 11d, «Скидання в глядачів»); інакше null. */
  export function liveTilt(live: SortLive, tilts: Record<string, SortTilt>, paused: boolean): SortTilt | null;
  /** Зміщення картки до зони телефона-глядача: left (−1, 0), right (1, 0), top (0, −1), bottom (0, 1). */
  export function zoneOffset(pos: ZonePosition): { x: number; y: number };
  /** Зміщення картки до стовпця сцени: x = ((index + 0.5) / count − 0.5) × 2, y = 1. */
  export function columnOffset(index: number, count: number): { x: number; y: number };
  /** CSS-змінні нахилу: --tilt-x, --tilt-y, --tilt. */
  export function tiltVars(offset: { x: number; y: number }, amount: number): CSSProperties;
  /** Політ після ходу й щойно влучене слово (див. план 11d, «Політ»). */
  export function useSortFlight(live: SortLive): { flight: { wordId: string; to: string; hit: boolean } | null; landed: string | null };
  /** Картка глядача: поточне слово (під час підвисання — помилкове), нахил, політ, трусіння, відлік підвисання. */
  export function SortLiveCard(props: {
    live: SortLive;
    categories: Choice[];
    tilt: SortTilt | null;
    flight: { wordId: string; to: string; hit: boolean } | null;
    paused: boolean;
    offsetMs: number;
    layout: 'phone' | 'stage';
  }): JSX.Element | null;
  /** Сцена, звичайна клітинка поля (11d): смуга з карткою, стовпці, чипи нерозкладених; на розкритті — стовпці з позначками. */
  export function SortStage(props: { question: PublicQuestion; info: SortInfo; live: SortLive; reveal: Extract<Question, { type: 'sort' }> | null; tilts: Record<string, SortTilt>; paused: boolean; offsetMs: number }): JSX.Element;
  ```
  - `SortWatch` — нові необов'язкові пропи `live?: SortLive | null` (типово `info.live`), `tilts?`, `paused?`, `offsetMs?`, `team?: boolean`. Розмітка з `live` — у розділі рішень («Телефон глядача»). Рядок угорі — `t(team ? 'sortWatchingTeam' : 'sortWatching', { name: live.nickname })`: у командній грі `nickname` — назва команди, а «Червоні сортує слова» звучить криво. Без `live` — без змін.
  - `SortStage` має той самий проп `team?: boolean`.
  - `SortReveal` — нові необов'язкові пропи:
    - `placed?: SortColumn[]` — під час гри (без `question`) у стовпцях розкладені слова, клас `is-live`;
    - `toward?: string | null` — стовпець з класом `is-toward`;
    - `landed?: string | null` — `li.is-landed` з `<span className="sort-landed" aria-hidden="true">✓</span>`;
    - `marks?: SortWordMark[] | null` — позначки в `li` розкриття (див. «Позначки»).
  - `SortLiveCard`:
    - `<div className="sort-live-card …" role="img" aria-label={t('sortLiveCard', { word })} data-toward={…} style={tiltVars(…)}>`;
    - класи `is-tilting` (є нахил), `is-flying` + `data-to` (політ), `is-miss` (політ помилки), `is-hit`;
    - під час підвисання — слово `missed` і `<p className="sort-lock" role="status"><span className="sort-lock-text">{t('sortLocked', { seconds })}</span></p>` з тим самим відліком, що в `SortPlay` (`secondsLeft`);
    - нахил ігнорується під час польоту.
- `i18n.ts`:
  ```ts
  sortLiveCard: 'Зараз на картці: {word}',
  sortWatchingTeam: 'Команда «{name}» сортує слова',
  sortLate: 'не встиг',
  sortMarkMisses: '✗{n}',
  sortMarkLabel: 'Помилок на слові: {n}',
  sortLandedLabel: 'Влучив',
  liveSortToward: '→ «{name}»',
  ```
- `styles.css` (нові правила поруч з `.sort-*`):
  ```css
  /* 11d: картка глядача — той самий вигляд, що в того, хто сортує, нахил змінними. */
  .sort-card, .sort-live-card { /* наявні правила .sort-card переносяться на обидва селектори */ }
  .sort-live-card { pointer-events: none; transform: translate(calc(var(--tilt-x, 0) * var(--tilt, 0) * var(--tilt-reach, 3rem)), calc(var(--tilt-y, 0) * var(--tilt, 0) * var(--tilt-reach, 3rem))) rotate(calc(var(--tilt-x, 0) * var(--tilt, 0) * 12deg)); transition: transform 120ms linear; }
  .sort-live-card.is-flying { transition: transform 450ms ease-in; --tilt: 1; }
  .sort-live-card.is-miss { animation: sort-shake 400ms; background: var(--wrong, #c0392b); color: #fff; }
  .sort-zone.is-toward, .sort-reveal-col.is-toward { outline: 3px solid var(--accent); background: var(--sort-zone-hot, rgb(155 140 255 / 0.32)); }
  .sort-reveal.is-live li { /* малі чипи слів у стовпці */ }
  .sort-reveal li.is-landed { background: var(--right-soft, rgb(46 160 67 / 0.2)); }
  .sort-mark { margin-left: 0.3rem; color: var(--wrong, #c0392b); font-weight: 700; }
  .sort-reveal li.is-late { opacity: 0.45; }
  .sort-late { margin-left: 0.3rem; font-size: 0.8em; }
  .stage-sort-live { display: grid; gap: 0.75rem; }
  .stage-sort-live .sort-live-strip { display: flex; flex-direction: column; align-items: center; min-height: 7.5rem; }
  .stage-sort-live .sort-live-card { --tilt-reach: 18rem; }
  @media (prefers-reduced-motion: reduce) { .sort-live-card { transition: none; } .sort-live-card.is-miss { animation: none; } }
  ```
  Кольори брати з наявних змінних (`--accent`, кольори вердиктів). Нових кольорів без потреби не вводити. Анімацію трусіння взяти наявну від `.sort-card.is-shaking`. Точні кеглі й висоти сцени підбирає будівельник за кадрами задачі 8 (4 × 5 слів у 1280 × 720).

- [ ] **Step 1: Write the failing tests** (`SortView.test.tsx`, `describe('watching a live sort (11d)')`, помічник `liveOf(over: Partial<SortLive>)` і категорії «Овочі» (`c1`), «Фрукти» (`c2`)):
  - `liveTilt`:
    - нахил із тим самим `seq` і `wordId` → він;
    - інший `seq` → `null`; інше слово → `null`; `paused` → `null`; `toward: null` → `null`;
  - `tiltVars(zoneOffset('left'), 0.5)` → `{ '--tilt-x': -1, '--tilt-y': 0, '--tilt': 0.5 }`;
  - `columnOffset(0, 4)` → `{ x: -0.75, y: 1 }`; `columnOffset(3, 4)` → `{ x: 0.75, y: 1 }`;
  - `SortWatch` з `live` (картка «Буряк»):
    - `.sort-live-card` з текстом «Буряк» і `aria-label` «Зараз на картці: Буряк»;
    - `.sort-card` немає; кнопок `button.sort-zone` немає;
    - «Анна сортує слова» є;
  - нахил `{ toward: 'c2', amount: 0.6 }` → зона «Фрукти» має `is-toward`, картка `data-toward="c2"`, `style` містить `--tilt: 0.6`; той самий нахил зі старим `seq` → без `is-toward`;
  - стовпці: `live.columns` з «Морква» в `c1` → `.sort-reveal.is-live` має «Морква» в стовпці «Овочі»; `.sort-reveal.is-open` немає; чипи `SortWords` з `info.words` (Буряк, Груша, Морква, Яблуко) без «Морква»;
  - політ (`vi.useFakeTimers()`): перший рендер з `seq: 1` і `last` → без `is-flying`; ререндер з `seq: 2`, `last: { hit: true, to: 'c1', wordId: 'w3', text: 'Буряк' }` → `.sort-live-card.is-flying` з `data-to="c1"` і `li.is-landed` «Буряк» у стовпці «Овочі»; через 450 мс `is-flying` немає; через 1500 мс `is-landed` немає;
  - помилка: `seq` зріс, `last.hit === false`, `lockedUntil` у майбутньому → `.sort-live-card.is-miss`, зона `last.to` з `is-toward`, текст «Помилка! Підвисання: 3 с»;
  - `prefers-reduced-motion` (як у наявних тестах `reducedMotion`) → без `is-flying`, `is-landed` є;
  - `SortReveal` з `marks`: `[{ wordId: 'w1', misses: 2, late: false }, { wordId: 'w4', misses: 0, late: true }]` → у `li` «Морква» `.sort-mark` «✗2» з `aria-label` «Помилок на слові: 2»; `li` «Груша» з класом `is-late` і текстом «не встиг»; решта без позначок;
  - `SortStage` під час гри: `.stage-sort-live` містить `.sort-live-card`, стовпці `is-live`, чипи; нахил у бік `c2` → `.sort-reveal-col` «Фрукти» з `is-toward` і `style` картки з `--tilt-x: 0.5`; з `reveal` — `.sort-reveal.is-open` з позначками, без картки й чипів;
  - без `live` `SortWatch` малює те саме, що й до 11d (наявні тести зелені).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/SortView.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): watching a live sort — the sorter's card in the middle with its tilt toward a highlighted zone or column, a flight after each move (a hit lands in its column with a green tick, a miss shakes red with the lock countdown), columns filling during the play while the alphabetical chips lose placed words, ✗N and «не встиг» marks on the reveal, a stage layout for the board"
  ```

### Задача 6. Підключення: сцена поля, телефони глядачів, свій підсумок, команда, пульт

**Files:**
- Modify: `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/screens/TeamWatch.tsx`, `apps/web/src/screens/LiveAnswers.tsx`, `apps/web/src/screens/HostScreen.tsx`
- Test: `apps/web/src/screens/StageScreen.test.tsx`, `apps/web/src/screens/PlayerScreen.test.tsx`, `apps/web/src/screens/TeamWatch.test.tsx`, `apps/web/src/screens/LiveAnswers.test.tsx`

**Interfaces:**
- `StageScreen.tsx`, гілка `question.sort !== null`:
  ```tsx
  view.sort?.live ? (
    <SortStage question={question} info={view.sort} live={view.sort.live} reveal={reveal !== null && reveal.type === 'sort' ? reveal : null} tilts={tilts} paused={view.paused} offsetMs={offsetMs} />
  ) : (
    <>…наявні SortReveal і SortWords…</>
  )
  ```
  `tilts` доходить з `StageScreen` до `Question`. `SortStage` і `SortWatch` отримують `team={view.teams !== null}`.
- `PlayerScreen.tsx`:
  - `isSort` на `question` і `locked`: `SortWatch` отримує `tilts`, `paused={view.paused}`, `offsetMs`;
  - розкриття поля для глядача (гілка `board !== null && !chooserIsMe`): `SortReveal` + `marks={view.sort?.live?.marks ?? null}`;
  - `SortOutcome` на `reveal`, коли `view.reveal?.type === 'sort'` і `question?.sort` є: під рядком підсумку `SortReveal` з `question = view.reveal`, `total`, `marks = me.sort.marks`. Це покриває класику, того, хто вибрав клітинку, і команду (`me.sort` — команди);
  - `TeamWatch` отримує `tilts` і `offsetMs`.
- `TeamWatch.tsx`: замість `view.sort !== null && <SortWatch question={question} info={view.sort} />`:
  ```tsx
  question.type === 'sort' && view.sort !== null && <SortWatch question={question} info={view.sort} live={me.sort?.live ?? null} tilts={tilts} paused={view.paused} offsetMs={offsetMs} team />
  ```
- `LiveAnswers.tsx`:
  - проп `tilts?: Record<string, SortTilt>`;
  - для рядка з `progress.kind === 'sort'` нахил `tilts[row.id]` діє, якщо `tilt.wordId === progress.cardId && tilt.seq === progress.seq && !view.paused && tilt.toward !== null && tilt.amount >= 0.2`;
  - тоді до тексту сортування додається ` · ${t('liveSortToward', { name })}`, де `name` — текст категорії з `view.question` (тип `sort`);
  - `liveAnswerText` отримує необов'язковий четвертий параметр `toward: string | null`.
- `HostScreen.tsx`: проп `tilts` → `LiveAnswers`.

- [ ] **Step 1: Write the failing tests**
  - `StageScreen.test.tsx`:
    - поле, `phase: 'question'`, `sort.live` з карткою «Буряк» і `columns` з «Морква» → `.stage-sort-live .sort-live-card` «Буряк»; стовпець «Овочі» містить «Морква»; чипи без «Морква»;
    - `tilts={{ p1: { sorterId: 'p1', wordId: <id Буряка>, toward: 'c2', amount: 0.7, seq } }}` → стовпець «Фрукти» з `is-toward`;
    - `reveal` з `live.marks` → `.sort-mark` «✗1»;
    - класика (`sort.live: null`) на `reveal` → `.sort-mark` і `.sort-late` немає; розмітка як до 11d.
  - `PlayerScreen.test.tsx`:
    - глядач поля на `question` → `.sort-live-card` з карткою того, хто вибрав; `.sort-card` немає;
    - той, хто вибрав (`me.sort` з `watched: true`), — `SortPlay` з `.sort-card`, без `.sort-live-card`;
    - розкриття класики з `me.sort.marks` → у підсумку `.sort-reveal.is-open` з `.sort-mark` «✗1» на своєму слові й `li.is-late` «не встиг»;
    - глядач поля на розкритті → позначки з `view.sort.live.marks`.
  - `TeamWatch.test.tsx`: некапітан, `me.sort.live` з карткою «Груша» → `.sort-live-card` «Груша»; нахил із `tilts` для `sorterId` команди → зона з `is-toward`.
  - `LiveAnswers.test.tsx`:
    - рядок сортування з `cardId: 'w3'`, `seq: 1` і `tilts` `{ toward: 'c1', amount: 0.5, seq: 1, wordId: 'w3' }`, `view.question` — сортування з категорією `c1` «Овочі» → текст рядка містить «→ «Овочі»»;
    - `amount: 0.1`, інший `seq` або `view.paused` → без стрілки.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): live sorting on every screen it belongs to — the board stage and the other phones watch the chooser's card, tilt, flight and filling columns, teammates watch their captain, each phone shows its own ✗N and «не встиг» marks on the reveal (board watchers see the chooser's), the host live row adds where the card is heading; classic, blitz and final screens stay as they were"
  ```

### Задача 7. Довідка ведучого: живе сортування й позначки

**Files:**
- Modify: `apps/web/src/help/questions.ts`, `apps/web/src/help/teams.ts`
- Test: `apps/web/src/help/host-help.test.ts`

**Interfaces:**
- `QUESTION_HELP.sort.how` — нові рядки в кінці:
  - «На полі той, хто вибрав клітинку, сортує сам, а сцена й інші телефони бачать його картку, куди він її тягне, політ і стовпці, що наповнюються. Помилка — картка труситься червоним, видно відлік підвисання.»
  - «У класиці, бліці й фіналі сортують усі одночасно: чужої картки й руху не бачить ніхто, сцена показує лише рядки поступу.»
  - «На розкритті слова стоять у правильних стовпцях: «✗2» — на цьому слові помилялися двічі, бліде «не встиг» — до слова не дійшли. У класиці кожен бачить свої позначки на телефоні, сцена — без них.»
- `TEAM_HELP.captain.how` — новий рядок: «У сортуванні товариші бачать картку капітана й куди він її тягне; інші команди — ні.»

- [ ] **Step 1: Write the failing tests** (`host-help.test.ts`):
  - `text('question.sort')` містить «куди він її тягне», «не встиг», «✗2», «чужої картки й руху не бачить ніхто»;
  - `text('team.captain')` містить «картку капітана»;
  - `searchHelp('не встиг')` містить `'question.sort'`;
  - наявна перевірка «без бафів» лишається зеленою.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/help` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src/help
  git commit -m "feat(web): host help on live sorting — who watches the card and its tilt on a board cell, nobody in classic, blitz or final, ✗N and «не встиг» on the reveal, teammates watching their captain"
  ```

### Задача 8. Наскрізні сценарії 11d з кадрами

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Помічники поруч з `sortBy`:
  ```ts
  /** Тягне картку частку share шляху до зони й тримає палець (11d): нахил без ходу. */
  async function holdToward(page: Page, zone: string, share: number) {
    const card = (await page.locator('.sort-card').boundingBox())!;
    const to = (await sortZone(page, zone).boundingBox())!;
    const [x0, y0] = [card.x + card.width / 2, card.y + card.height / 2];
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x0 + (to.x + to.width / 2 - x0) * share, y0 + (to.y + to.height / 2 - y0) * share, { steps: 8 });
    return async () => {
      await page.mouse.move(x0, y0, { steps: 4 });
      await page.mouse.up();
    };
  }
  /** Текст картки глядача; null — картки немає. */
  const liveCard = async (page: Page) => (await page.evaluate("document.querySelector('.sort-live-card')?.textContent ?? null")) as string | null;
  /** Стовпець сортування за назвою категорії. */
  const sortColumn = (page: Page, name: string) => page.locator('.sort-reveal-col', { has: page.locator('h3', { hasText: name }) });
  ```
- Вміст — без тем росії й СРСР. Слова 4 × 5:
  - «Овочі»: Морква, Буряк, Цибуля, Капуста, Гарбуз;
  - «Фрукти»: Яблуко, Груша, Слива, Персик, Абрикос;
  - «Ягоди»: Малина, Смородина, Аґрус, Ожина, Чорниця;
  - «Горіхи»: Фундук, Мигдаль, Фісташка, Пекан, Макадамія.

- [ ] **Step 1: Add the scenarios** у кінець файлу за зразком 11c:
  ```ts
  it('part 11d: sorting seen by all — classic keeps cards private (no tilt sent or received, own ✗N and «не встиг» on the phone, none on the stage), a board cell shows the chooser card on the 1280 × 720 stage and other phones with a live tilt toward a zone, a hit landing in its column, a miss with the lock, chips losing placed words, the host row heading, and per-word marks on the reveal', async () => {
    try {
      await visibleSort11d();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });

  it('part 11d: team sorting — a teammate watches the captain card, tilt and columns; the other team and the stage get nothing', async () => {
    try {
      await teamSort11d();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Підготовка `visibleSort11d()`:**
  1. `host = open('host11d', 1280, 900)`, `register(host, 'host', 'Марта Ведуча', 'host11d@example.com')`.
  2. `where` і `sortQuestion` — як у `sortGame` (7f), локально.
     - `cs` — «Хто це?», категорії «Ссавці», «Птахи», слова Кит, Сова, Кажан, Лелека; `points: 100`, `lockSeconds: 3`, `timeLimit: 60`.
     - `bs` — «Що в кошику?», чотири категорії й 20 слів (вище); `points: 20`, `lockSeconds: 3`, `timeLimit: 120`.
  3. Раунди:
     - `classicRound('rc11d', [cs], { title: 'Класика 11d', speedBonus: false })`;
     - `boardRound('rb11d', [{ title: 'Кошик', cells: [{ question: bs, answerMode: 'phone' }, cellQ('b2', 'Яке місто стоїть на Дніпрі?', 100)] }, { title: 'Міста', cells: [cellQ('b3', 'Столиця Франції?', 100), cellQ('b4', 'Столиця Італії?', 200)] }], { title: 'Поле 11d' })`, де `cellQ` — як у 7f.
     - `makeRoundsQuiz([...], { leaderboard: 'end' })`, `title: 'Сортування 11d'` → `POST /api/quizzes`.
  4. «Грати» → `code`, `stageUrl`; `stage = open('stage11d', 1280, 720)`; `olya = open('olya11d', 375, 812)`, `petro = open('petro11d', 375, 812)`, `join` («Оля», «Петро»). `stageFrames = socketFrames(stage)`, `petroFrames = socketFrames(petro)`, `olyaSent = sentFrames(olya)` до старту.

  **Кроки (у такому порядку):**
  1. **Класика — без живого показу.**
     - «Почати гру» → `afterSplash` → «Почати раунд» → `afterSplash`; обидва телефони мають `.sort-card`.
     - `const back = await holdToward(olya, where[(await sortCard(olya))!]!, 0.6)`.
     - `await olya.waitForTimeout(300)`. Коментар у коді: «глядача тут немає, тож чекати нема на що: пауза лише дає дроселю шанс надіслати нахил, якби телефон його слав». Це єдиний сон у сценарії.
     - `await back()`.
     - `olyaSent.some((f) => f.includes('player:sort-tilt'))` → `false`;
     - `stageFrames` і `petroFrames` не містять `sort:tilt`;
     - `stage.locator('.sort-live-card, .stage-sort-live').count()` → 0;
     - `petro.locator('.sort-live-card').count()` → 0.
     - Оля: одна навмисна помилка (`sortBy(olya, 'tap', <інша зона>)`), чекати, доки зникне `.sort-lock`, потім `sortRest(olya)` (як у 7f). Петро: один правильний хід. «Закрити запитання» → «Показати відповідь».
     - **Свої позначки:**
       - на телефоні Олі `.sort-reveal.is-open` має `li` з помилковим словом і `.sort-mark` «✗1», `li.is-late` немає;
       - у Петра три `li.is-late` з «не встиг»;
       - `stage.locator('.sort-mark, .sort-late').count()` → 0.
     - Кадри `p11d-classic-phone-marks` (Оля), `p11d-classic-late` (Петро), `p11d-classic-stage`. `expectNoSideScroll(olya, 'p11d-classic-phone-marks')`.
  2. **Поле — старт.**
     - «Далі» → до наступного раунду, як у 7f (`toNextRound`-кроки локально). «За порядком приєднання» → «Почати раунд». Оля: `cell` «Кошик, 400» (ціна — 20 слів × 20) → `afterSplash(stage, olya, petro)`.
     - `olyaCard = await sortCard(olya)`;
     - `expect.poll(() => liveCard(stage))` → `olyaCard`; те саме для `petro`;
     - `petro.locator('.sort-card').count()` → 0; `petro.locator('button.sort-zone').count()` → 0;
     - `stage.locator('.sort-words li').count()` → 20; `stage.locator('.sort-reveal.is-open').count()` → 0.
     - **Сцена вміщається:**
       - `stage.evaluate('document.documentElement.scrollHeight <= innerHeight')` → `true`;
       - нижній край кожного `.sort-reveal-col` і `.sort-live-card` ≤ 720.
     - `expectNoSideScroll(petro, 'p11d-watch-start')`. Кадри `p11d-stage-start`, `p11d-watch-start`.
  3. **Нахил.**
     - `const zone = where[olyaCard!]!`, `const release = await holdToward(olya, zone, 0.6)`;
     - на сцені `sortColumn(stage, zone)` отримує клас `is-toward` (`expect.poll(() => sortColumn(stage, zone).getAttribute('class'))` містить `is-toward`), картка має `data-toward`, а її `style` містить `--tilt`;
     - у Петра `.sort-zone.is-toward` з текстом `zone`;
     - на пульті `liveRow(host, 'Оля')` містить `→ «${zone}»`.
     - Кадри `p11d-stage-tilt`, `p11d-watch-tilt`, `p11d-host-tilt`, `p11d-play-hold` (Оля).
     - `await release()` → `expect.poll` на `stage.locator('.is-toward').count()` → 0; у Петра теж 0.
  4. **Влучання.**
     - `sortBy(olya, 'drag', zone)`;
     - `sortColumn(stage, zone).getByText(olyaCard!, exact).waitFor()`; `stage.locator('.sort-words li', { hasText: olyaCard! }).count()` → 0;
     - нова картка на сцені дорівнює `sortCard(olya)`;
     - те саме в стовпцях Петра.
     - Кадр `p11d-stage-hit` одразу після ходу (позначку `is-landed` перевіряє модульний тест задачі 5).
  5. **Помилка.**
     - `missed = await sortCard(olya)`, `sortBy(olya, 'tap', <будь-яка інша категорія>)`;
     - на сцені й у Петра `.sort-lock` з текстом «Підвисання»; картка — `missed`.
     - Кадри `p11d-stage-miss`, `p11d-watch-miss`.
     - Дочекатися, доки зникне `.sort-lock` в Олі, і зробити ще 3 правильні ходи (`sortBy(olya, 'tap', where[...])`). Сцена: `.sort-words li` → 16; у стовпцях разом 4 слова.
  6. **Розкриття з позначками.**
     - «Закрити запитання» → «Показати відповідь» (як у сценаріях поля; кнопки чекають на 11b);
     - сцена: `.sort-reveal.is-open`; `li` слова `missed` має `.sort-mark` «✗1»; `li.is-late` — 16 (`missed` серед них: 20 слів, 4 розкладено);
     - сцена вміщається (`scrollHeight <= innerHeight`);
     - у Петра ті самі позначки; в Олі (свій підсумок) — теж.
     - Кадри `p11d-stage-reveal`, `p11d-watch-reveal`, `p11d-play-reveal`.
  7. `expect(problems).toEqual([])`.

  **Підготовка `teamSort11d()`:**
  1. `host11dt` 1280 × 900, `register(host, 'host', 'Марта Ведуча', 'host11dt@example.com')`.
  2. Раунд `classicRound('rt11d', [cs], { title: 'Команди 11d', speedBonus: false })` (питання `cs` з першого сценарію, локально), `makeRoundsQuiz([rt11d], { leaderboard: 'each', teams: { count: 2, names: ['Червоні', 'Сині'] } })`, `title: 'Команди 11d'`.
  3. Сцена 1280 × 720, телефони `olya`, `petro`, `ira`, `marko` (375 × 812), `join`, `pickTeamOn`: Оля й Петро — «Червоні», Іра й Марко — «Сині» (капітани — Оля, Іра). `stageFrames`, `iraFrames`, `markoFrames`, `petroFrames`, `hostFrames` — `socketFrames`.
  4. «Почати гру» → `afterSplash` → «Почати раунд» → `afterSplash`.

  **Кроки:**
  1. Петро бачить `.sort-live-card` з текстом `sortCard(olya)` і «Команда «Червоні» сортує слова» (`sortWatchingTeam`). `.sort-card` у Петра немає.
  2. `holdToward(olya, zone, 0.6)`:
     - у Петра `.sort-zone.is-toward` з текстом `zone`;
     - `hostFrames` містить `sort:tilt`;
     - `stageFrames`, `iraFrames`, `markoFrames` — ні.
     - Кадр `p11d-team-watch-tilt`. Відпустити.
  3. Оля робить правильний хід:
     - у Петра стовпець `zone` містить слово;
     - у Марка `.sort-reveal.is-live li` → 0 (Іра ще не ходила);
     - на сцені `.sort-live-card` немає.
     - Кадр `p11d-team-watch-column`.
  4. `expect(problems).toEqual([])`.
- [ ] **Step 2: Run** `pnpm build`, потім у фоні `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 11d"` → PASS. Переглянути кадри `p11d-*`:
  - картка глядача посередині, нахил видно, зона підсвічена;
  - стовпці наповнюються, чипи меншають;
  - помилка червона з відліком;
  - сцена 4 × 5 без прокрутки й без обрізаних слів;
  - позначки «✗1» і «не встиг» читаються на 375 px і на сцені.
- [ ] **Step 3: Підлаштувати наявні сценарії, якщо прогін покаже.** Очікувано без змін:
  - 7f (`sortGame`, поле): «у Петра немає `.sort-card`» — картка глядача має інший клас; «`.sort-reveal.is-open` до розкриття немає» — під час гри стовпці мають `is-live`; `.sort-progress` «3 з 4» лишається;
  - 9a (`sort9a`): `.sort-words li` на старті — усі слова; «слова під ареною» — стовпці стоять між ареною й чипами.

  Якщо щось падає, лагодити лише заміною селектора на новий вигляд, не сном і не зміною вмісту. Кожну правку назвати в коміті й у звіті задачі.
- [ ] **Step 4: Повний прогін — один раз, у фоні** (≈ 30 хв): `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts` → усі сценарії PASS. Якщо PGlite чи браузер падає з браком пам'яті, перезапустити лише сценарії, що впали (`-t "<назва>"`), і назвати це в звіті.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/e2e
  git commit -m "test: part 11d end-to-end — classic sorting sends and shows no tilt with own ✗N and «не встиг» on phones and none on the stage; a board cell with 4 × 20 words fits the 1280 × 720 stage, the chooser card and its tilt reach the stage, the other phone and the host row, a hit lands in its column, a miss shows the lock, marks on the reveal; a teammate watches the captain while the other team and the stage get nothing"
  ```
