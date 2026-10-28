# План 12r: продовжити гру — стартовий раунд і перенесені бали

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** швидка правка на прохання власника. Розділу в специфікації немає, тож джерело — запит власника дослівно:

> «Можеш додати швидку правку, що б можна було на початку вікторини ввести раунд з якого починати і кількість балів у гравців (доречі дати можливість вводити бали типу 42434), що б можна було продовжити гру якщо попередня вікторина передчасно завершилась. … особливо це цікавить коли бот проводить.»

**Рішення координатора** (обов'язкові):
1. **Де.** У лобі, перед «Почати гру», — панель, що розгортається: «Продовжити попередню гру».
   - Бачить ведучий на пульті. У грі без ведучого (автопілот) — автор на своєму телефоні, бо гру починає він.
   - У панелі:
     - список «Почати з раунду» з раундами вікторини (типово — раунд 1);
     - поле балів для кожного учасника, що вже зайшов: соло — кожен гравець, командна гра — кожна команда. Цілі числа від −9 999 999 до 9 999 999 (приймає й 42434). Типово — 0.
   - Хто зайде після того, як значення вписано, починає з 0.
2. **«Підставити з попередньої гри».** Кнопка бере недавні ігри цієї самої вікторини з історії ведучого. Кілька ігор — ведучий вибирає одну (найновіша перша). Кнопка заповнює:
   - стартовий раунд: перший незавершений раунд тієї гри або наступний після останнього зіграного;
   - бали кожного учасника, зіставлені за нікнеймом (нормалізованим). Незіставлені лишаються з 0.
   - Усе лишається редагованим.
   - Автопілот: автор — завжди користувач з акаунтом і власник вікторини (див. «Хто бачить кнопку»), тож кнопка є і в нього.
3. **Рушій.**
   - Стартові бали — по одному коригуванню на учасника в мить старту, нове `AdjustmentSource` `'carry'`. Розбивка показує «Перенесено з попередньої гри». Історія й цікавинки бачать його як інші коригування.
   - Рядки `'carry'` у «↶ Бали» не скасовуються.
   - Раунди до стартового не граються й випадають з історії та статистики так само, як незіграні раунди сьогодні.
   - Екрани кажуть справжній номер раунду («Раунд 3»).
   - Цікавинки (12d) не рахують `'carry'` балами раунду ні в стовпчиках раундів, ні в камбеку (див. «Цікавинки»).
4. **Перевірка на сервері:** номер раунду в межах; бали — цілі в межах; учасники існують. Значення можна задати лише в лобі, лише ведучому чи автору автопілота.
5. **Версія стану:** 18 → 19, 18 читається (як 12e і 12f). Підняття потрібне (див. нижче).
6. **Тексти й вигляд.** Українською, без роду (більшість гравців — жінки). Влазить у телефон 375 px. Сцені нового нічого не треба: перша таблиця й заставка раунду просто показують перенесені бали й справжній номер.

Що робить частина:
- **Пульт і телефон автора в лобі.** Згорнута панель `details.resume-panel` «Продовжити попередню гру» над кнопкою «Почати гру». Розгорнута:
  - список «Почати з раунду» («Раунд 1 · Розминка», «Раунд 2 · Річки», …);
  - кнопка «Підставити з попередньої гри»;
  - поле балів на кожного учасника;
  - рядок підсумку «Старт: Раунд 3 · Річки. Перенесені бали: 2 з 3.» і «Хто зайде пізніше, почне з 0.».
- **«Почати гру»** надсилає `host:start` з `{ resume: { roundIndex, points } }`, якщо панель розгорнута й щось відрізняється від типового. Інакше подія та сама, що й досі, без даних.
- **Рушій** готує стартовий раунд замість першого і дописує по рядку `'carry'` на кожного учасника з ненульовими балами. Далі гра йде звично: заставка «Раунд 3», бали в таблиці, «Фінал» зі ставками від перенесеного рахунку.
- **Історія.** Пропущені раунди не показуються, бо в них немає запитань і коригувань. Під стартовим раундом — рядок «Перенесено з попередньої гри: Оля +42 434, Петро +1 200». У розбивці «+ / −» — «Перенесено з попередньої гри».

**Стан гри змінюється: `GAME_STATE_VERSION` 18 → 19, версія 18 лишається читабельною.**
- Нові поля:
  - нове значення `AdjustmentSource` `'carry'`;
  - необов'язкове `AutopilotState.resume?: ResumeSetup`. Автор натиснув «Почати гру» з кубиками команд: старт відкладено до кінця туру, і значення панелі мусять дожити до нього.
- **Чому підняття потрібне.** Старий сервер (відкат деплою) підняв би стан із `'carry'`, і `adjustmentSource('carry')` повернув би `undefined`. Розбивка, таблиця й рекордер зламалися б. Ключ `resume` старий сервер теж не знає. Правило специфікації (розділ 3) — будь-яке нове значення чи ключ стану піднімає версію.
- **Чому 18 читається.** Стан версій 2–18 не може містити ні `'carry'`, ні `AutopilotState.resume`. Тож `READABLE_STATE_VERSIONS` отримує 18 з поясненням у `restore.ts`. Кімнати, збережені до деплою, відновлюються, і живі ігри деплой переживають.
- **Міграції бази немає.** `score_adjustment.source` — `text` (`$type<AdjustmentSource>()`), нове значення пишеться як є.
- Перед пушем координатор перевіряє `live_room` і питає власника (правило пам'яті «Deploys kill live games»: питати перед кожним підняттям `GAME_STATE_VERSION`, навіть коли стара версія читається).

**Архітектура:**
- **Shared.**
  - Новий `packages/shared/src/resume.ts`: `RESUME_POINTS_MAX`, `RESUME_OPTIONS`, типи `ResumeSetup`, `ResumeLobby`, `ResumeOption`.
  - `events.ts`: `resumeSchema`, `startSchema`; `'host:start'` приймає необов'язкові дані.
  - `game.ts`: `AdjustmentSource` + `'carry'`; `ErrorCode` + `resume_invalid`.
  - `breakdown.ts`: `ScoreSource` `'carry'` першим у `SCORE_SOURCES`; `roundTotals` пропускає `'carry'`.
  - `views.ts`: `HostView.resume`, `AuthorView.resume`.
  - `facts.ts`: `FactInput.players[].carry`, місце «до» й камбек від перенесених балів.
- **Рушій.**
  - Новий `carry.ts`: `resumeParticipants`, `resumeLobby`, `resumeError`, `withCarry`.
  - `game.ts`: `start(state, now?, resume?)`; `AutopilotState.resume`.
  - `autopilot.ts`: `autopilotStart(state, now, rng, resume?)`, `startAfterTour` і `notStarting` з `resume`.
  - `views.ts`: `resume` у `hostView` і `authorView`.
  - `facts.ts`: `carry` у `factInput`.
  - `restore.ts`: версія 19, читається 18.
- **Сервер.**
  - `socket.ts`: окремий обробник `host:start` з `startSchema`.
  - `rooms/manager.ts`: `HostAction` / `AuthorAction` `start` з `resume`.
  - `history.ts`: `resumeRound`, `resumeOptions`; `carry` у `factInputOf`.
  - `account-routes.ts`: `GET /api/games/by-code/:code/resume`.
  - `achievements.ts`: `'carry'` не бали раунду.
- **Веб.**
  - Новий `resume.ts` (чисті помічники) і `screens/ResumePanel.tsx`.
  - `screens/HostScreen.tsx`, `screens/AuthorLobby.tsx`, `screens/PlayerScreen.tsx` (передає `view.author.resume`).
  - `api.ts`: `resumeOptions(code)`.
  - `pages/GameHistory.tsx`: рядок перенесених балів.
  - `i18n.ts`, `styles.css`.
- **Наскрізні тести.** Один сценарій «part 12r: …»: гра з ведучим і гра без ведучого. Пульт і телефони 375 × 812, сцена 1280 × 720. Кадри з префіксом `p12r-`.

**Технології:** TypeScript, zod, vitest, Fastify + Socket.IO, Drizzle + PGlite, React 19 + Vite, Testing Library (jsdom), Playwright. Нових залежностей немає.

**Рішення плану там, де координатор мовчить (координатор може змінити):**

*Дані старту (`ResumeSetup`)*
```ts
interface ResumeSetup {
  roundIndex: number;              // 0-базовий стартовий раунд
  points: Record<string, number>;  // учасник рушія (соло — id гравця, командна гра — id команди) → бали
}
```
- Йде даними `host:start`: `{ resume?: ResumeSetup }`. Без даних (старі клієнти, звичайний старт) — старт як досі.
- Окремої події «задати значення в лобі» й поля стану в лобі немає. Значення живуть на пульті чи телефоні автора, доки не натиснуто «Почати гру». Тож «хто зайшов пізніше — 0» виходить само: учасника немає в `points`.
- Веб не надсилає `resume`, якщо панель згорнута або раунд 1 і всі бали 0. Це рівно звичайний старт.
- Нульові бали в `points` дозволені, але рядка не дають.

*Перевірка (`resumeError`, порядок)*
1. `roundIndex` не ціле, < 0 чи ≥ `quiz.rounds.length` → `resume_invalid`.
2. Будь-які бали не цілі або |бали| > `RESUME_POINTS_MAX` (9 999 999) → `resume_invalid`.
3. Ключів більше за `LIMITS.maxPlayers` → `resume_invalid`.
4. Ключ не серед `resumeParticipants(state)` → `not_found`.
- `resumeParticipants`: соло — `state.players` (`id`, `nickname`); командна гра — `state.teams.list` (`id`, `nickname: name`), усі команди з налаштувань.
- Зовні сокет уже відсіює форму `startSchema` (`invalid_payload`). Рушій перевіряє ще раз: дія автора йде тим самим шляхом, а тести рушія кличуть `start` прямо.
- Поза лобі → `wrong_phase` (як і досі в `start`). Тож «лише в лобі» тримає саме рушій. «Лише ведучий чи автор» — сокет (`hostSide`) і `manager.author` (`not_allowed` чужим).

*Старт (`start(state, now?, resume?)`)*
- Перевірка `resumeError` — до формування команд.
- Далі все як досі: формування команд, `no_players`.
- `enterRound({ ...formed, roundIndex: resume?.roundIndex ?? 0 })`.
- `withCarry(ready, resume, now ?? 0)`: для кожного `p` з `ready.players` (у їхньому порядку, щоб seq був передбачуваний) з `points[p.id]` ≠ 0 → `addAdjustment(state, p.id, points, now, 'carry')`. Поля рядка:
  - `roundIndex` — стартовий раунд (поточний `state.roundIndex`);
  - `afterQuestion` = 0 (`afterQuestionNow` у лобі / на `intro` = `plays.length` = 0).
- Ключі, яких після формування немає серед гравців (порожня команда, яку `formTeams` відкинула), мовчки пропускаються.
- Потім як досі: `guide` для новачків або `enterFirstRound` із заставкою «Раунд N», де N = `roundIndex + 1`.
- Межа `LIMITS.maxAdjust` до `'carry'` не застосовується (як до `undo`, `away`, `appeal`). Сповіщення `notice` немає: `lastNotice` дивиться лише на `'host'`.

*Пропущені раунди*
- У `plays` немає жодного запитання раундів 0…start−1. Тож:
  - історія (`playedQuestions`) їх не має;
  - `GameHistory` ховає раунд без запитань і коригувань (наявна умова `questions.length === 0 && roundAdjustments.length === 0`);
  - `FactInput.questions` їх не має.
- `roundCount(state)` = `roundIndex + 1`, тож у таблиці колонки «Р1», «Р2» пропущених раундів показують 0, а Σ містить перенесене. Розбивка «+ / −» пояснює різницю рядком «Перенесено з попередньої гри». Ховати колонки пропущених раундів не будемо: для цього знадобилося б нове поле стану чи зрізу (*рішення плану*).
- Стовпчики раундів у «Твоїй грі» (`GameCard.rounds`) так само показують 0 для пропущених раундів з їхніми справжніми підписами «Р1», «Р2».

*Перенесене й бали раунду*
- `roundTotals(lines, count)` пропускає рядки з `source === 'carry'`. Це одне місце для рушія (`withRounds`) і історії (`standings.rounds`). Колонки раундів, «+N за раунд», «Найкращий у раунді» не бачать перенесеного. `breakdownOf` рахує всі рядки, тож розбивка й Σ його мають.
- `roundHighlights` (веб) рахує «місце до раунду» як `score − приріст`. Перенесене там уже є, тож «Найбільший ривок» першого зіграного раунду рахується від перенесених балів. Змін не треба.

*Цікавинки (12d)*
- `FactInput.players[i].carry?: number` — сума `'carry'` учасника. Рушій і історія ставлять його завжди (0 — без перенесеного), щоб звірка рушій ↔ історія (`history.facts.test.ts`) лишалася рівною. Літеральні фікстури без ключа — 0.
- `placeAfter(input, id, count)` = `carry` + сума `rounds[0..count)`.
- `firstRound(input)` = найменший `roundIndex` серед `input.questions` (порожньо — 0).
- **Камбек:**
  - потрібно ≥ 2 зіграних раунди: `p.rounds.length − firstRound ≥ 2` (було `p.rounds.length ≥ 2`);
  - «з» = `placeAfter(input, p.id, firstRound + 1)`: місце після першого зіграного раунду разом із перенесеним.
  - Перенесене не є «раундом»: хто прийшов першим за перенесеним і лишився першим, камбеку не має.
- **«Твій раунд», місце «до»:** `null`, якщо `roundIndex ≤ firstRound` і ні в кого немає перенесеного; інакше `placeAfter(input, id, roundIndex)`. Для звичайної гри (`firstRound` = 0, перенесеного немає) — рівно як досі.

*Ачівки (`achievements.ts`)*
- `roundPointsOfPlay` (перемога в бліц-раунді) пропускає `'carry'`.
- `isComeback`:
  - «до останнього раунду» рахує й рядки `'carry'` (`row.roundIndex < last || row.source === 'carry'`);
  - «≥ 2 зіграні раунди» — від першого раунду з відповідями: `last − first < 1` → `false`, де `first` — найменший `roundIndex` рядків-відповідей. Для звичайної гри `first` = 0, тобто як досі.

*Хто бачить кнопку «Підставити з попередньої гри»*
- **Ведучий.** Пульт відкривають з акаунта: `POST /api/games` і `host-access` вимагають `currentUser`.
- **Автор автопілота.** `POST /api/games` з `autopilot: true` теж вимагає `currentUser` і `getQuiz(db, user.id, …)` (вікторина своя). `createAutopilot(quiz, user.id, …)` пише `room.hostUserId = user.id`, а рекордер — `game.hostId`. Тож автор — завжди користувач з акаунтом і власник вікторини, ігри автопілота лежать у його історії. Кнопка є і на телефоні автора.
- Якщо сесію втрачено (401) чи кімнати вже немає (404), панель пише «Попередніх ігор цієї вікторини не знайдено.», а ручне введення працює далі.

*Маршрут `GET /api/games/by-code/:code/resume`*
- `CODE_LIMIT`.
- `locate(code) === 'restarting'` → 503 `restarting`.
- Немає користувача, немає кімнати в пам'яті, `room.hostUserId !== user.id` або `room.quizId === null` → 404 `game_not_found` (однаково, як у `host-access`).
- `room.state.phase !== 'lobby'` → 409 `wrong_phase`.
- Інакше `resumeOptions(db, user.id, room.quizId, room.id)` → `ResumeOption[]`.
- Ключ — код кімнати, а не id вікторини: пульт і телефон автора знають код, а не `quizId`.

*`resumeOptions` і `resumeRound` (`history.ts`)*
- Ігри: `game.hostId = hostId`, `game.quizId = quizId`, `game.id ≠ excludeId`, `questionsPlayed > 0`; за `startedAt` спадно; не більше `RESUME_OPTIONS = 5`. Статус будь-який (`running`, `finished`, `aborted`).
- Рахунок — рядки таблиці (`participant.teamId IS NULL`: соло-гравці й команди), `{ nickname, score }`, за місцем, потім за балами.
- `resumeRound(quiz, plays, questionsPlayed)`:
  - `refs = plays.slice(0, questionsPlayed)`; порожньо → 0;
  - `last = refs.at(-1).roundIndex`; знімок не читається → `last`;
  - раунд `last` завершений, якщо зіграних у ньому запитань ≥ `roundQuestions(quiz.rounds[last]).length` → `last + 1`, інакше `last`;
  - обмеження зверху — `quiz.rounds.length − 1`.
  - Евристика проста й редагована. «Мільйонер», «Вибування» й «Ва-банк», що скінчилися раніше за останнє запитання, вважаються незавершеними, і ведучий за потреби міняє раунд руками (*рішення плану*).
- Знімок старої гри міг мати інакше число раундів. Веб обмежує `roundIndex` раундами поточної вікторини.

*Зіставлення (`fillFromGame`, веб)*
- Ключ — `answerKey(nickname)` з `@quiz/shared`: та сама нормалізація, що й `normalizeText` рушія для «нікнейм зайнятий». Тож «оля» = «Оля», зайві пробіли не важать.
- Учасники панелі без пари → 0 і рядок «Не знайдено в тій грі, лишається 0: Тарас».
- Учасники тієї гри без пари просто не використовуються.
- Командна гра: учасники панелі — команди, ключі — назви команд.

*Поле балів*
- `<input type="number" step="1">` з `min` / `max`. На Android і iOS цифрова клавіатура має «−», бо `inputMode` не ставимо.
- `parsePoints(text)`:
  - порожньо → 0;
  - пробіли (звичайні, нерозривні, вузькі) прибираються;
  - «−» = «-»;
  - `^-?\d+$` і |n| ≤ `RESUME_POINTS_MAX` → число, інакше `null`.
- Хибне поле: під ним `p.error` «Ціле число від −9 999 999 до 9 999 999», а «Почати гру» неактивна, поки панель розгорнута.
- Згорнута панель нічого не надсилає і нічого не блокує (*рішення плану*: згорнути — означає «звичайний старт»).

*Хто що бачить*
- `HostView.resume: ResumeLobby | null` і `AuthorView.resume: ResumeLobby | null` — у лобі `resumeLobby(state)`, інакше `null`:
  ```ts
  interface ResumeLobby {
    rounds: { title: string; type: RoundType }[];  // усі раунди вікторини
    participants: { id: string; nickname: string }[]; // resumeParticipants
  }
  ```
- Сцена й інші телефони цього поля не мають. На сцені й у гравців нічого нового.

*Тексти (у `i18n.ts`, без роду, безособово)*
- `resumeTitle`: «Продовжити попередню гру»
- `resumeHint`: «Якщо попередня гра обірвалась: гра почнеться з вибраного раунду з цими балами.»
- `resumeRound`: «Почати з раунду»
- `resumeRoundOption`: «Раунд {n} · {title}» (порожня назва → `roundLabel`)
- `resumeFill`: «Підставити з попередньої гри»
- `resumeLoading`: «Шукаємо попередні ігри…»
- `resumeNone`: «Попередніх ігор цієї вікторини не знайдено.»
- `resumePick`: «Яку гру продовжити?»
- `resumeOption`: «{date} · {played} з {total} запитань · далі {round}»
- `resumeFilled`: «Підставлено гру від {date}. Усе можна змінити.»
- `resumeUnmatched`: «Не знайдено в тій грі, лишається 0: {names}»
- `resumeInvalid`: «Ціле число від −9 999 999 до 9 999 999»
- `resumeSummary`: «Старт: {round}. Перенесені бали: {count} з {total}.»
- `resumeLater`: «Хто зайде пізніше, почне з 0.»
- `historyCarry`: «Перенесено з попередньої гри: {list}»
- `scoreSource_carry`: «Перенесено з попередньої гри»
- `err_resume_invalid`: «Перевірте раунд і бали.»

*Чого не робимо*
- нового запису довідки ведучого (швидка правка; панель має власну підказку);
- нічого нового на сцені;
- поля стану «значення в лобі» й живого показу значень іншим;
- приховування колонок пропущених раундів;
- нового демо-вмісту. Тексти e2e — без тем росії й СРСР (річки, гори, озера України).

## Глобальні обмеження

- **Анти-ціль:** «живі ігри не обриваються деплоєм». Версія 19, 18 — у `READABLE_STATE_VERSIONS` (задача 2).
- **Анти-ціль:** «скасування балів ламає історію». `'carry'` — звичайне коригування, не скасовується. Задача 4 перевіряє: Σ `answer.points` + Σ `score_adjustment.points` = `participant.score` у грі з перенесеним.
- **Анти-ціль:** старі вікторини не змінюють правил балів. Без `resume` старт той самий байт у байт (задача 2: стан `start(lobby)` = стан `start(lobby, undefined, undefined)`).
- **Анти-ціль:** цікавинки й ачівки не вважають перенесене грою раунду (задача 3).
- **Анти-ціль:** тексти без тем росії й СРСР.
- **Тексти без роду:** безособові форми («лишається 0», «почне з 0», «можна змінити»), без «зіграв / зіграла».
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`.
- Телефон і пульт 375 px без горизонтальної прокрутки сторінки; довгий нікнейм у панелі переноситься (`overflow-wrap: anywhere`), поле балів не стискається менше 8rem.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і тести:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=1 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- Наскрізні тести: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 12r"`.
  - **Лише на передньому плані.** Жодного запуску у фоні: команда йде в тому самому кроці, а результат читається одразу.
  - Затримка 11b в e2e увімкнена. Кнопки пульта чекають, доки стануть активними, без снів.
  - Кадри лежать в `apps/server/e2e/artifacts/shots`, префікс — `p12r-`.
- Кожен коміт закінчується рядками:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  ```
- Після останньої задачі й фінальної рецензії гілку зливають у `main`. **Пуш — лише після згоди власника** (версія стану піднімається: правило «Deploys kill live games») і після перевірки `live_room`. Якщо власник саме грає (правило «Push hold while playing»), пуш чекає.

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/resume.ts` (новий), `index.ts`, `game.ts`, `breakdown.ts`, `breakdown.test.ts`, `events.ts`, `events.test.ts` (або новий `resume.test.ts`), `views.ts`; заглушки `resume: null` у `packages/engine/src/views.ts`; фікстури `HostView` / `AuthorView`; `apps/web/src/i18n.ts` (`scoreSource_carry`, `err_resume_invalid`) | джерело `carry`, типи, схеми, подія, помилка, поля зрізів | 1 |
| `packages/engine/src/carry.ts` (новий), `carry.test.ts` (новий), `game.ts`, `autopilot.ts`, `views.ts`, `index.ts`, `restore.ts`, `restore.test.ts`; `apps/server/src/rooms/manager.appeal.test.ts`, `manager.drafts.test.ts` (версія) | старт з раунду, рядки `carry`, автопілот, лобі в зрізах, версія 19 | 2 |
| `packages/shared/src/facts.ts`, `facts.test.ts`, `packages/engine/src/facts.ts`, `facts.test.ts`, `apps/server/src/history.ts` (`factInputOf`), `history.facts.test.ts`, `achievements.ts`, `achievements.test.ts` | цікавинки й ачівки без перенесеного як «раунду» | 3 |
| `apps/server/src/socket.ts`, `socket.test.ts`, `rooms/manager.ts`, `rooms/manager.resume.test.ts` (новий), `history.ts` (`resumeRound`, `resumeOptions`), `history.resume.test.ts` (новий), `account-routes.ts`, `games.test.ts` | подія, дії, маршрут, запис | 4 |
| `apps/web/src/resume.ts` (новий), `resume.test.ts` (новий), `screens/ResumePanel.tsx` (новий), `screens/ResumePanel.test.tsx` (новий), `screens/HostScreen.tsx`, `HostScreen.test.tsx`, `screens/AuthorLobby.tsx`, `screens/PlayerScreen.tsx`, `PlayerScreen.test.tsx`, `api.ts`, `pages/GameHistory.tsx`, `pages/GameHistory.test.tsx`, `i18n.ts`, `styles.css` | панель, старт з даними, історія | 5 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 12r | 6 |

## Порядок збирання

- 1 → 2 → 3. Задача 4 — після 2 (і 3, бо `factInputOf`). Задача 5 — після 1 (на фікстурах; наживо — після 4). Задача 6 — останньою.
- **Навмисні зміни наявних очікувань** (лише такі):
  - **`packages/shared/src/breakdown.test.ts` (задача 1):** перелік `SCORE_SOURCES` — `['carry', 'answers', 'final', 'duel', 'debuff', 'host', 'undo', 'away', 'appeal', 'wipeout', 'survival', 'ladder']`;
  - **фікстури (задача 1):**
    - кожен літеральний `HostView` отримує `resume: null`, кожен літеральний `AuthorView` — `resume: null`;
    - файли: `apps/web/src/screens/*.test.tsx`, `team-test-view.ts`, `ladder-fixtures.ts`, `live/*.test.tsx`, `packages/engine/src/*.test.ts` з літеральними зрізами і кожен файл, на який вкаже `pnpm typecheck`;
  - **тести зрізів рушія (задача 2):** `toEqual` цілого `AuthorView` чи `HostView` **у лобі** отримує `resume: resumeLobby(state)` (раунди й учасники). Поза лобі — `null` з задачі 1. Виконавець перелічує такі правки у звіті;
  - **`packages/engine/src/restore.test.ts` (задача 2):**
    - новий запис `KEYS[19]`: усе з `KEYS[18]`, `AutopilotState` + `resume`, новий рядок `ResumeSetup: 'points,roundIndex'`;
    - рядок `ResumeSetup` у `STATE_SHAPE` (`keysOf<ResumeSetup>()(['roundIndex', 'points'])`);
    - `READABLE_STATE_VERSIONS` у тесті «older readable versions» — `[2, …, 18, 19]`;
    - `representative()` отримує автопілот зі `starting: true` і `resume`, а також рядок `'carry'`;
    - записи 1–18 не змінюються;
  - **`apps/server/src/rooms/manager.drafts.test.ts`:** «the game state version is 18» → 19; **`manager.appeal.test.ts`:** `toBe(18)` → `toBe(GAME_STATE_VERSION)` (задача 2);
  - **`packages/shared/src/facts.test.ts` (задача 3):** наявні очікування камбеку й «Твого раунду» не змінюються (без перенесеного й з раунду 0 — те саме); нові тести дописуються;
  - **`apps/server/src/socket.test.ts` (задача 4):** якщо тест перелічує `SIMPLE_HOST_ACTIONS` чи шле `host:start` з довільним сміттям, тепер `invalid_payload` замість `ok` — лише для непорожніх хибних даних. `host:start` без даних — як досі;
  - **e2e:** наявні сценарії не змінюються: панель згорнута, «Почати гру» шле ту саму подію без даних.
  - Якщо падає інше, рецензент розбирає причину, а не правку очікування.

## На що дивитися рецензентові

1. **Старт.** Без `resume` стан той самий. З `resume` — стартовий раунд `intro` із заставкою «Раунд N» (N — справжній), рядки `'carry'` лише ненульові, `afterQuestion` 0, у раунді старту (задача 2).
2. **Перевірка.** Раунд поза межами, дробові чи завеликі бали → `resume_invalid`; чужий учасник → `not_found`; поза лобі → `wrong_phase`; гравець у грі з ведучим → `forbidden`, чужий у автопілоті → `not_allowed` (задачі 2, 4).
3. **Скасування.** У «↶ Бали» рядка `'carry'` немає; `undoScore({ seq })` на нього → `not_allowed` (задача 2).
4. **Раунди й цікавинки.** Колонки раундів без перенесеного, Σ і розбивка — з ним. Камбек і «місце до» — від перенесених балів, а не від «раунду 0». Ачівки: бліц-перемога без перенесеного, камбек з ним (задачі 1, 3).
5. **Автопілот.** Тур кубиків команд зберігає `resume` і стартує з ним; зміна способу формування скасовує і старт, і `resume` (задача 2).
6. **Маршрут.** Лише свої ігри цієї вікторини, без поточної, найновіша перша, не більше 5; чужий код → 404; поза лобі → 409 (задача 4).
7. **Стан.** Версія 19, 18 читається; міграції немає (задачі 2, 4).
8. **Вигляд.** Панель на 375 px: список, поля й кнопки на всю ширину, без горизонтальної прокрутки, довгий нікнейм переноситься; 9 999 999 влазить у поле й у таблицю. Кадри `p12r-*` (задачі 5, 6).

---

### Задача 1. Shared: джерело `carry`, типи й схеми старту, помилка, поля зрізів

**Files:**
- Create: `packages/shared/src/resume.ts`
- Modify: `packages/shared/src/index.ts` (`export * from './resume';`), `game.ts`, `breakdown.ts`, `events.ts`, `views.ts`; `packages/engine/src/views.ts` (заглушки); `apps/web/src/i18n.ts`
- Modify (фікстури): див. «Порядок збирання» і все, на що вкаже `pnpm typecheck`
- Test: `packages/shared/src/breakdown.test.ts`, `packages/shared/src/resume.test.ts` (новий)

**Interfaces:**
- `packages/shared/src/resume.ts`:
  ```ts
  import type { RoundType } from './quiz';
  import type { GameStatus } from './history';

  /** Продовжити гру (12r): найбільші перенесені бали за модулем. */
  export const RESUME_POINTS_MAX = 9_999_999;
  /** Скільки попередніх ігор цієї вікторини пропонує «Підставити з попередньої гри». */
  export const RESUME_OPTIONS = 5;

  /** Дані «Продовжити гру» в host:start: стартовий раунд (0-базовий) і бали учасників рушія (соло — гравець, командна гра — команда). */
  export interface ResumeSetup {
    roundIndex: number;
    points: Record<string, number>;
  }

  /** Лобі «Продовжити гру» на пульті й у автора: раунди вікторини й учасники, яким можна перенести бали. */
  export interface ResumeLobby {
    rounds: { title: string; type: RoundType }[];
    participants: { id: string; nickname: string }[];
  }

  /** Попередня гра цієї вікторини для «Підставити з попередньої гри». */
  export interface ResumeOption {
    gameId: string;
    startedAt: string;
    status: GameStatus;
    questionsPlayed: number;
    /** Усі запитання знімка тієї гри. */
    questionCount: number;
    autopilot: boolean;
    /** Раунд, з якого продовжити (resumeRound), 0-базовий. */
    roundIndex: number;
    /** Рядки таблиці тієї гри: соло-гравці чи команди. */
    scores: { nickname: string; score: number }[];
  }
  ```
  Якщо імпорт `GameStatus` з `history.ts` дає цикл, тип переноситься або імпортується як `import type` (він і так лише тип).
- `game.ts`:
  - `AdjustmentSource` + рядок
    ```ts
      /** Перенесено з попередньої гри (12r): стартові бали учасника; раунд — стартовий, afterQuestion 0; не скасовується й не є балами раунду. */
      | 'carry';
    ```
  - `ErrorCode` + `resume_invalid` — «Продовжити гру (12r): раунд поза вікториною чи бали не цілі або поза межами».
- `breakdown.ts`:
  - `SCORE_SOURCES = ['carry', 'answers', 'final', 'duel', 'debuff', 'host', 'undo', 'away', 'appeal', 'wipeout', 'survival', 'ladder']`;
  - `ADJUSTMENT_SOURCES` + `carry: 'carry'`;
  - `roundTotals`: рядок з `source === 'carry'` пропускається (JSDoc: «перенесене (12r) — не бали раунду»).
- `events.ts`:
  ```ts
  /** Продовжити гру (12r): стартовий раунд і бали учасників. */
  export const resumeSchema = z
    .object({
      roundIndex: z.number().int().min(0).max(LIMITS.maxRounds - 1),
      points: z
        .record(playerId, z.number().int().min(-RESUME_POINTS_MAX).max(RESUME_POINTS_MAX))
        .refine((points) => Object.keys(points).length <= LIMITS.maxPlayers),
    })
    .strict();
  /** host:start: без даних — звичайний старт; resume — продовжити гру (12r). */
  export const startSchema = z.object({ resume: resumeSchema.optional() }).strict();
  ```
  (`playerId` — наявна схема id у `events.ts`; якщо її немає під цим ім'ям — `z.string().min(1).max(64)`.)

  `ClientToServerEvents`:
  ```ts
  /** «Почати гру»; з даними — продовжити попередню гру (12r). */
  'host:start': (...args: [ack: Ack] | [payload: z.infer<typeof startSchema>, ack: Ack]) => void;
  ```
  Наявні типізовані `emit('host:start', ack)` у тестах мають лишитися валідними. Якщо типи Socket.IO не приймають об'єднання кортежів, виконавець вибирає найближчу форму, з якою проходять і старі виклики, і `emit('host:start', { resume }, ack)`, і пише про це у звіті.
- `views.ts`:
  - `HostView` (після `undo`):
    ```ts
    /** Лобі «Продовжити гру» (12r): раунди й учасники; поза лобі null. */
    resume: ResumeLobby | null;
    ```
  - `AuthorView` (після `people`): те саме поле з тим самим JSDoc.
- Заглушки в `packages/engine/src/views.ts`: `resume: null` у `hostView` і `authorView` (справжнє значення — задача 2).
- `apps/web/src/i18n.ts` (уже тут, бо `Record<ScoreSource, …>` і тексти помилок):
  ```ts
  scoreSource_carry: 'Перенесено з попередньої гри',
  err_resume_invalid: 'Перевірте раунд і бали.',
  ```

- [ ] **Step 1: Write the failing tests**
  - `breakdown.test.ts`:
    - перелік `SCORE_SOURCES` з `'carry'` першим;
    - `adjustmentSource('carry')` → `'carry'`;
    - новий тест:
      ```ts
      it('carried points are not round points but count in the breakdown (12r)', () => {
        const lines = [
          { roundIndex: 2, source: 'carry' as const, points: 42_434 },
          { roundIndex: 2, source: 'answers' as const, points: 200 },
        ];
        expect(roundTotals(lines, 3)).toEqual([0, 0, 200]);
        expect(breakdownOf(lines)).toEqual({ parts: [{ source: 'carry', plus: 42_434, minus: 0 }, { source: 'answers', plus: 200, minus: 0 }], plus: 42_634, minus: 0 });
      });
      ```
  - `resume.test.ts` (схеми з `events.ts`):
    ```ts
    import { describe, expect, it } from 'vitest';
    import { RESUME_POINTS_MAX, startSchema } from './index';

    describe('start payload (12r)', () => {
      it('accepts a round and integer points within ±9 999 999, and an empty start', () => {
        expect(startSchema.safeParse({}).success).toBe(true);
        expect(startSchema.safeParse({ resume: { roundIndex: 2, points: { p1: 42_434, p2: -150, p3: 0 } } }).success).toBe(true);
        expect(startSchema.safeParse({ resume: { roundIndex: 0, points: { p1: RESUME_POINTS_MAX, p2: -RESUME_POINTS_MAX } } }).success).toBe(true);
      });
      it('refuses fractions, values out of range, a negative round and extra keys', () => {
        for (const resume of [
          { roundIndex: 0, points: { p1: 1.5 } },
          { roundIndex: 0, points: { p1: RESUME_POINTS_MAX + 1 } },
          { roundIndex: -1, points: {} },
          { roundIndex: 10, points: {} },
          { roundIndex: 0, points: {}, extra: 1 },
        ]) expect(startSchema.safeParse({ resume }).success).toBe(false);
        expect(startSchema.safeParse({ resume: { roundIndex: 0, points: Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`p${i}`, 1])) } }).success).toBe(false);
      });
    });
    ```
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared` → FAIL.
- [ ] **Step 3: Implement**, потім оновити фікстури (`resume: null`) за `pnpm typecheck`. JSDoc українською на кожному експорті.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages apps/web/src
  git commit -m "feat(shared): resume a game basics — the carry adjustment source first in the breakdown and left out of round totals, the start payload with a round and integer points within ±9 999 999, the resume_invalid error and the lobby resume field for the host and the autopilot author
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 2. Рушій: старт з раунду, рядки `carry`, автопілот, лобі в зрізах, версія 19

**Files:**
- Create: `packages/engine/src/carry.ts`, `packages/engine/src/carry.test.ts`
- Modify: `packages/engine/src/game.ts` (`start`, `AutopilotState`), `autopilot.ts`, `views.ts`, `index.ts` (`export * from './carry';` або явні імена), `restore.ts`
- Modify (тести): `restore.test.ts`; `apps/server/src/rooms/manager.drafts.test.ts`, `manager.appeal.test.ts`; тести зрізів у лобі (див. «Порядок збирання»)

**Interfaces:**
- `packages/engine/src/carry.ts`:
  ```ts
  import { LIMITS, RESUME_POINTS_MAX, type ErrorCode, type ResumeLobby, type ResumeSetup } from '@quiz/shared';
  import { addAdjustment } from './adjust';
  import type { GameState } from './game';
  import { teamsOn } from './teams';

  /** Кому можна перенести бали (12r): соло — гравці, командна гра — команди з налаштувань (усі, і порожні). */
  export function resumeParticipants(state: GameState): { id: string; nickname: string }[];
  /** Лобі «Продовжити гру» для пульта й автора; поза лобі null. */
  export function resumeLobby(state: GameState): ResumeLobby | null;
  /** Перевірка даних «Продовжити гру» у лобі; null — гаразд. Порядок — план 12r, «Перевірка». */
  export function resumeError(state: GameState, resume: ResumeSetup): ErrorCode | null;
  /** Рядки 'carry' гравцям, що є в state.players, у їхньому порядку; нуль і чужі ключі пропускаються. Раунд — поточний state.roundIndex. */
  export function withCarry(state: GameState, resume: ResumeSetup, now: number): GameState;
  ```
  Цикл `game.ts` ↔ `carry.ts` — як `game.ts` ↔ `adjust.ts`: лише виклики під час роботи, без використання на рівні модуля.
- `game.ts`:
  ```ts
  export function start(state: GameState, now?: number, resume?: ResumeSetup): Result {
    if (state.phase !== 'lobby') return fail('wrong_phase');
    // «Продовжити гру» (12r): перевірка до формування команд — ключі командної гри є id команд з налаштувань.
    if (resume !== undefined) {
      const error = resumeError(state, resume);
      if (error !== null) return fail(error);
    }
    // …формування команд і no_players — як досі…
    const ready = enterRound({ ...formed, roundIndex: resume?.roundIndex ?? 0 });
    const carried = resume === undefined ? ready : withCarry(ready, resume, now ?? 0);
    return ok(newcomersOn(state.quiz) ? { ...carried, phase: 'guide', guidePage: 0 } : enterFirstRound(carried, now));
  }
  ```
  JSDoc `start` доповнюється: «з resume — стартовий раунд замість першого й перенесені бали (12r)».

  `AutopilotState` (після `starting`):
  ```ts
  /** Лише зі starting: «Продовжити гру» (12r), з яким автор натиснув «Почати гру»; старт після туру бере його. */
  resume?: ResumeSetup;
  ```
- `autopilot.ts`:
  - `autopilotStart(state, now, rng, resume?: ResumeSetup)`:
    - `not_allowed` / `wrong_phase` — як досі;
    - потім `resumeError` → помилка;
    - `startNow(state, now, resume)` в усіх гілках;
    - у гілці туру кубиків: `withPilot(tour.state, (pilot) => ({ ...pilot, starting: true, ...(resume === undefined ? {} : { resume }) }))`.
  - `startNow(state, now, resume?)` передає `resume` у `start`.
  - `startAfterTour`: `startNow(state, now, state.autopilot?.resume)`.
  - `notStarting` прибирає і `starting`, і `resume`. Тож `authorTeamForm` (зміна способу) скасовує і відкладений старт, і його дані.
- `views.ts`: `hostView` — `resume: resumeLobby(state)`; `authorView` — `resume: resumeLobby(state)`.
- `restore.ts`:
  - `GAME_STATE_VERSION = 19`;
  - рядок у JSDoc: `19 — 12r: AutopilotState.resume (дані «Продовжити гру» до кінця туру кубиків), значення AdjustmentSource 'carry'.`;
  - пояснення: `18 → 19 лише додала необов'язкове AutopilotState.resume (і значення AdjustmentSource 'carry'), а стан версій 2–18 не може містити ні того, ні того: тож кімната, збережена до розгортання 12r, теж відновлюється.`;
  - `READABLE_STATE_VERSIONS` + 18.

- [ ] **Step 1: Write the failing tests** — `carry.test.ts` на `undoQuiz` (`testing/undo.ts`: два раунди) і `makeRoundsQuiz` з трьома класичними раундами:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { classicRound, makeRoundsQuiz, single, withId } from './testing/fixtures';
  import { lobbyWith, lobbyWithGuide, lobbyWithSplash, must } from './testing/helpers';
  import { teamLobby, teamQuiz } from './testing/teams';
  import { createAutopilotGame, autopilotStart, authorTeamForm } from './autopilot';
  import { addPlayer, next, start } from './game';
  import { undoPanel, undoScore } from './undo';
  import { hostView, playerView } from './views';
  import { resumeError, resumeLobby } from './carry';

  const T0 = 1_000_000;
  const R = { speedBonus: false };
  const three = makeRoundsQuiz([
    classicRound('r1', [single], { ...R, title: 'Розминка' }),
    classicRound('r2', [withId(single, 'q2')], { ...R, title: 'Річки' }),
    classicRound('r3', [withId(single, 'q3')], { ...R, title: 'Гори' }),
  ]);
  ```
  Тести (назви англійською, як у репозиторії):
  1. **`a start without resume is unchanged`** — `start(lobby)` і `start(lobby, undefined, undefined)` дають рівні стани; `adjustments` порожні; `roundIndex` 0.
  2. **`resume starts at the chosen round with one carry row per non-zero participant`** — `lobbyWithSplash(three, 'Оля', 'Петро', 'Іра')`, `start(s, T0, { roundIndex: 2, points: { p1: 42_434, p2: -150, p3: 0 } })`:
     - `phase` `'intro'`, `roundIndex` 2, `splash.kind` `'round'`;
     - `adjustments` = `[{ seq: 1, playerId: 'p1', points: 42_434, roundIndex: 2, afterQuestion: 0, source: 'carry', at: T0 }, { seq: 2, playerId: 'p2', points: -150, … }]` (без `p3`);
     - рахунки 42 434, −150, 0;
     - `hostView(state).round?.index` = 2;
     - `next` відкриває `q3`, а `plays` не має запитань раундів 0–1.
  3. **`the guide keeps the resumed round`** — `lobbyWithGuide`: після `start` з `roundIndex: 1` → `guide`; останнє «Далі» → `intro` раунду 1 з тими самими рядками `carry`.
  4. **`checks`** — `resumeError`:
     - `roundIndex: 3` (раундів 3) → `resume_invalid`;
     - бали `1.5` чи `10_000_000` → `resume_invalid`;
     - ключ `'p9'` → `not_found`;
     - `start` з тими самими даними → ті самі помилки, стан лобі не змінено;
     - після старту `start(…, resume)` → `wrong_phase`.
  5. **`late joiners start from zero`** — дані без `p4`, `addPlayer` p4 після підготовки даних, `start` → у p4 0 і немає рядка.
  6. **`teams carry per team; an empty team is skipped`** — `teamQuiz` з трьома командами, учасники лише в двох; бали трьом командам (id з `teams.list`) → рядки лише двом командам, що грають; ключ-людина (id учасника) → `not_found`.
  7. **`carry rows are not undoable`** — після старту з перенесеним і першого запитання: `undoPanel` не має рядка з `seq` рядка `carry`; `undoScore(state, { seq: 1 }, now)` → `not_allowed`.
  8. **`round totals leave carry out`** — `hostView(state).standings` після першої відповіді: `rounds` = `[0, 0, 100]`, `score` = 42 534; `breakdowns.p1.parts[0]` = `{ source: 'carry', plus: 42_434, minus: 0 }`.
  9. **`the final round wagers from the carried score`** — вікторина з класикою й фіналом, старт з `roundIndex: 1` (фінал) і `p1: 500` → на `wager` межа p1 — 500.
  10. **`the lobby shows rounds and participants to the host and the author only`**:
      - `resumeLobby(lobby)` = `{ rounds: [{ title: 'Розминка', type: 'classic' }, …], participants: [{ id: 'p1', nickname: 'Оля' }, …] }`;
      - у команд — назви команд;
      - після старту `hostView(state).resume` — `null`;
      - `playerView` автора автопілота в лобі має `author.resume`, а звичайний гравець — `author: null`.
  11. **`the autopilot author starts with resume, also after a team dice tour`**:
      - соло: `autopilotStart(createAutopilotGame(three, { id: 'a', nickname: 'Марта' }) + гравець, T0, rng, { roundIndex: 1, points: { a: 300 } })` → `intro` раунду 1, рядок `carry` у `a`;
      - команди з `form: 'dice'`: `autopilotStart` з `resume` → `autopilot.starting === true`, `autopilot.resume` збережено; після закриття туру крок автопілота (`startAfterTour` через `planAutopilot` / `stepAutopilot`, як у наявних тестах 11g) → гра стартує з раунду й рядками;
      - `authorTeamForm` під час туру → немає ні `starting`, ні `resume`;
      - хибні дані → помилка ще до туру (тур не починається).
  - `restore.test.ts`: зміни з «Порядку збирання» і новий тест:
    ```ts
    it('a room saved at version 18 restores; a resumed game round-trips with its carry rows and the author resume', () => {
      // старий стан без carry і без resume: як у тесті 12f
      // новий: автопілот зі starting і resume у турі кубиків → roundTrip(suspend(…)) зберігає resume; після туру — старт з рядками carry
      expect(READABLE_STATE_VERSIONS).toContain(18);
    });
    ```
  - `manager.drafts.test.ts`: «the game state version is 19»; `manager.appeal.test.ts`: `toBe(GAME_STATE_VERSION)`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=1 apps/server && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages apps/server/src
  git commit -m "feat(engine): resume a game — start at the chosen round with the real round number, one carry row per participant with non-zero points that the undo sheet never lists, checks for the round, the points and the participants, the autopilot author start that keeps the values through a team dice tour, the lobby resume field for the host and the author, state version 19 with 18 readable
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 3. Цікавинки й ачівки: перенесене — не бали раунду

**Files:**
- Modify: `packages/shared/src/facts.ts`, `packages/engine/src/facts.ts`, `apps/server/src/history.ts` (`factInputOf` і його виклик), `apps/server/src/achievements.ts`
- Test: `packages/shared/src/facts.test.ts`, `packages/engine/src/facts.test.ts`, `apps/server/src/history.facts.test.ts`, `apps/server/src/achievements.test.ts`

**Interfaces:**
- `packages/shared/src/facts.ts`:
  - `FactInput.players[i]` + `/** Перенесені бали (12r): сума рядків 'carry'; у rounds не входять; без ключа — 0. */ carry?: number;`
  - `placeAfter(input, playerId, count)`: `(player.carry ?? 0) + sum(rounds.slice(0, count))`. JSDoc доповнюється: «від перенесених балів (12r)».
  - нові приватні `firstRound(input): number` (найменший `roundIndex` серед `input.questions`, порожньо — 0) і `carried(input): boolean` (хтось має `carry ≠ 0`).
  - `comeback`: умова `p.rounds.length - firstRound(input) >= 2`; «з» = `placeAfter(input, p.id, firstRound(input) + 1)`.
  - `roundCard`: `before: roundIndex <= firstRound(input) && !carried(input) ? null : placeAfter(input, playerId, roundIndex)`.
- `packages/engine/src/facts.ts` (`factInput`): `carry: state.adjustments.filter((a) => a.source === 'carry' && a.playerId === row.participantId).reduce((s, a) => s + a.points, 0)` у кожного гравця.
- `apps/server/src/history.ts` (`factInputOf`):
  - параметр `adjustments` + `points: number`;
  - `carry` кожного рядка таблиці — сума `'carry'` цього учасника. Виклик у `hostGameWithFacts` передає ті самі рядки `scoreAdjustment`.
- `apps/server/src/achievements.ts`:
  - `roundPointsOfPlay`: ще й `row.source !== 'carry'`;
  - `isComeback`: `first` = найменший `roundIndex` рядків-відповідей (`attempt !== ADJUSTMENT_ATTEMPT`); `if (!won || last - first < 1) return false`; `before = rows.filter((row) => row.roundIndex < last || row.source === 'carry')`.

- [ ] **Step 1: Write the failing tests**
  - `packages/shared/src/facts.test.ts`, новий `describe('carried points (12r)')` на літеральному `FactInput` (рядки з `roundIndex` 2 і 3; `players` з `rounds: [0, 0, r2, r3]`):
    - **камбек від перенесеного:** Оля `carry: 40_000`, Петро `carry: 0`; після раунду 2 Петро нижче, після раунду 3 — перший → камбек Петра `{ from: 2, to: 1 }`. Те саме без `carry` у Олі, але з тим самим порядком після раунду 2 — те саме місце «з».
    - **перенесене не робить камбеку саме:** Петро з `carry: 0` попереду за раундами 2–3, Оля з `carry: 40_000` перша наприкінці → Олі камбеку немає (вона була першою від початку).
    - **один зіграний раунд — без камбеку:** лише раунд 3 → `null`.
    - **«Твій раунд»:** раунд 2 (перший зіграний) з перенесеним → `place.before` = місце за `carry`; без перенесеного у всіх → `before: null`.
    - Наявні тести камбеку й `roundCard` — без змін і зелені.
  - `packages/engine/src/facts.test.ts`: після `start` з `{ roundIndex: 1, points: { p1: 500 } }` (`undoQuiz`) `factInput(state).players` має `carry: 500` у p1 і `carry: 0` у p2, а `rounds` p1 — без 500.
  - `apps/server/src/history.facts.test.ts`: наявні звірки рушій ↔ історія лишаються рівними (обидва боки тепер ставлять `carry: 0`). Звірка гри з перенесеним потребує дії `start` з `resume` у менеджері, тож вона йде в задачу 4 (`history.resume.test.ts`).
  - `achievements.test.ts`:
    - бліц-раунд, де Оля має перенесені 10 000 у тому самому раунді, а Петро більше балів за відповіді → бліц-перемога Петра, не Олі;
    - камбек: гра з раундів 2 і 3, перенесене Петра 10 000 робить його лідером перед раундом 3, Оля виграє → `isComeback` Олі `true`; гра, де зіграно лише раунд 3 → `false`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages` і `pnpm vitest run --maxWorkers=1 apps/server/src/achievements.test.ts apps/server/src/history.facts.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=1 apps/server && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages apps/server/src
  git commit -m "feat: carried points are not a round — the comeback and the own round place start from the carried score after the first played round, round bars leave it out, the blitz-round achievement ignores it and the comeback achievement counts it
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 4. Сервер: `host:start` з даними, дії ведучого й автора, маршрут попередніх ігор

**Files:**
- Modify: `apps/server/src/socket.ts`, `rooms/manager.ts`, `history.ts`, `account-routes.ts`
- Create: `apps/server/src/rooms/manager.resume.test.ts`, `apps/server/src/history.resume.test.ts`
- Test: також `socket.test.ts`, `games.test.ts`

**Interfaces:**
- `rooms/manager.ts`:
  ```ts
  export type HostAction =
    | { type: 'start'; resume?: ResumeSetup }
    | { type: 'lock' | 'next' | 'pause' | 'resume' | 'end-round' | 'end' | 'dice' | 'roll' | 'skip' | 'duel-skip' | 'duel-cancel' | 'guide-skip' | 'clue' | 'survey-all' | 'bluff-all' }
    | …;
  export type AuthorAction =
    | { type: 'start'; resume?: ResumeSetup }
    | { type: 'pause' | 'resume' | 'end' }
    | Extract<HostAction, { type: 'kick' | 'cloud-hide' | 'bluff-remove' | 'team-form' }>;
  ```
  - `host`: `case 'start': return this.apply(room, start(state, this.now(), action.resume));`
  - `author`: `case 'start': return this.apply(room, autopilotStart(state, this.now(), this.rng, action.resume));`
- `socket.ts`: `'start'` геть із `SIMPLE_HOST_ACTIONS`; окремий обробник:
  ```ts
  on('host:start', (args) => {
    if (!hostSide) return FORBIDDEN;
    const raw = payloadOf(args);
    if (raw === undefined) return run({ type: 'start' });
    const payload = startSchema.safeParse(raw);
    if (!payload.success) return INVALID;
    return run(payload.data.resume === undefined ? { type: 'start' } : { type: 'start', resume: payload.data.resume });
  });
  ```
- `history.ts`:
  ```ts
  /** Раунд, з якого продовжити гру (12r): план 12r, «resumeOptions і resumeRound». */
  export function resumeRound(quiz: Quiz | null, plays: PlayRef[], questionsPlayed: number): number;
  /** Свої ігри цієї вікторини з хоч одним закритим запитанням, без поточної; найновіша перша; не більше RESUME_OPTIONS. */
  export async function resumeOptions(db: Db, hostId: string, quizId: string, excludeId: string): Promise<ResumeOption[]>;
  ```
  `questionCount` — `questionCountOf(row.quizSnapshot)`; `roundIndex` — `resumeRound(snapshotOf(row.quizSnapshot), row.plays, row.questionsPlayed)`.
- `account-routes.ts`, поруч із `host-access`:
  ```ts
  app.get<{ Params: { code: string } }>('/api/games/by-code/:code/resume', CODE_LIMIT, async (request, reply) => {
    if ((await locate(request.params.code)) === 'restarting') return reply.code(503).send(RESTARTING);
    const user = await currentUser(request);
    const room = manager.get(request.params.code);
    // Автор автопілота — власник вікторини з акаунтом: room.hostUserId = його id (createAutopilot).
    if (user === null || room === undefined || room.hostUserId !== user.id || room.quizId === null) {
      return reply.code(404).send({ error: 'game_not_found' });
    }
    if (room.state.phase !== 'lobby') return reply.code(409).send({ error: 'wrong_phase' });
    return resumeOptions(db, user.id, room.quizId, room.id);
  });
  ```
  Відповідь — масив, як `GET /api/games`.

- [ ] **Step 1: Write the failing tests**
  - `manager.resume.test.ts` (за зразком `manager.appeal.test.ts`: `RoomManager`, `FakeScheduler`, `manager.join` + `connect`):
    1. ведучий: `manager.host(room, { type: 'start', resume: { roundIndex: 1, points: { [olya]: 42_434 } } })` → `ok`; `room.state.roundIndex` 1; рядок `carry`;
    2. помилки: `roundIndex: 5` → `resume_invalid`; чужий ключ → `not_found`; повтор після старту → `wrong_phase`;
    3. автор автопілота: `manager.createAutopilot` + `manager.author(room, authorId, { type: 'start', resume })` → `ok` і рядок; інший гравець → `not_allowed`;
    4. збережена кімната (`SavedRoom`) з автопілотом у турі кубиків і `resume` піднімається (`stateVersion` 19), і старт після туру переносить бали.
  - `socket.test.ts` (наявний спосіб підключення пульта й гравця):
    - `host:start` без даних → `ok` (як досі);
    - `{ resume: { roundIndex: 1, points: { [id]: 42434 } } }` → `ok` і рахунок 42 434 у зрізі;
    - `{ resume: { roundIndex: 0, points: { [id]: 1.5 } } }` → `invalid_payload`;
    - гравець у грі з ведучим → `forbidden`.
  - `history.resume.test.ts`:
    - `resumeRound` (чиста, на `makeRoundsQuiz` з трьома раундами по 2 запитання):
      - `[]` → 0;
      - 2 запитання раунду 0 → 1;
      - 2 з раунду 0 і 1 з раунду 1 → 1;
      - усі 6 → 2 (обмеження зверху);
      - `quiz` `null` → `last`;
      - `questionsPlayed` менше за довжину `plays` — рахується лише закрите.
    - маршрут (за зразком `games.test.ts`: `buildApp`, `signUp`, `call`):
      - ведучий зіграв дві гри вікторини A (записані рекордером через `manager.host` — `start`, відповіді, `end`; або `seedGame` з `testing/history-rows.ts`) і одну гру вікторини B;
      - створює третю кімнату вікторини A → `GET …/resume` = дві гри A, найновіша перша, без поточної й без гри B, з `roundIndex`, `scores` (`{ nickname, score }`), `questionsPlayed`;
      - чужий користувач → 404; без cookie → 404; після старту → 409 `wrong_phase`;
      - кімната-автопілот (`POST /api/games` з `autopilot: true`) того самого автора → 200 і ті самі ігри (автор бачить кнопку).
    - запис: гра з перенесеним, записана рекордером → рядок `score_adjustment` з `source: 'carry'`, `round_index` стартового раунду; Σ `answer.points` + Σ `score_adjustment.points` = `participant.score`; `hostGame` → `standings[i].rounds` без перенесеного, `breakdown.parts[0]` = `carry`, `adjustments` має рядок `carry`; пропущений раунд без запитань.
    - цікавинки: `hostGameWithFacts(db, HOST, room.id).factInput` = `factInput(room.state)` для гри з перенесеним (звірка рушій ↔ історія з `carry`, перенесена з задачі 3).
    - ланцюжок: друга гра, продовжена з першої, — у `resumeOptions` для третьої її `scores` містять перенесене (рахунок учасника).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=1 apps/server && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/src
  git commit -m "feat(server): resume a game — host:start takes an optional round and points for the host and the autopilot author, a forbidden or malformed start is refused, GET /api/games/by-code/:code/resume lists the own recent games of this quiz newest first with the round to go on from and the table scores, and the carry rows land in score_adjustment and the history
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 5. Веб: панель «Продовжити попередню гру» на пульті й у автора, рядок в історії

**Files:**
- Create: `apps/web/src/resume.ts`, `resume.test.ts`, `screens/ResumePanel.tsx`, `screens/ResumePanel.test.tsx`
- Modify: `apps/web/src/screens/HostScreen.tsx`, `HostScreen.test.tsx`, `screens/AuthorLobby.tsx`, `screens/PlayerScreen.tsx`, `PlayerScreen.test.tsx`, `api.ts`, `pages/GameHistory.tsx`, `pages/GameHistory.test.tsx`, `i18n.ts`, `styles.css`

**Interfaces:**
- `apps/web/src/resume.ts`:
  ```ts
  import { answerKey, RESUME_POINTS_MAX, type ResumeLobby, type ResumeOption, type ResumeSetup } from '@quiz/shared';

  /** Стан панелі: розгорнута, стартовий раунд, текст поля кожного учасника (id → текст; немає — «0»). */
  export interface ResumeDraft { open: boolean; roundIndex: number; points: Record<string, string> }
  export const emptyDraft = (): ResumeDraft => ({ open: false, roundIndex: 0, points: {} });
  /** Текст поля → ціле в межах ±RESUME_POINTS_MAX; порожньо — 0; пробіли геть, «−» = «-»; інакше null. */
  export function parsePoints(text: string): number | null;
  /**
   * Дані host:start: згорнута панель або раунд 1 і всі нулі → undefined (звичайний старт);
   * хибне поле учасника з info → 'invalid'; інакше { resume } з ненульовими балами учасників info і раундом у межах info.rounds.
   */
  export function resumePayload(draft: ResumeDraft, info: ResumeLobby): { resume: ResumeSetup } | undefined | 'invalid';
  /** Заповнює з гри: раунд (обмежений раундами info), бали за answerKey(nickname); unmatched — нікнейми учасників info без пари (у них «0»). */
  export function fillFromGame(draft: ResumeDraft, info: ResumeLobby, option: ResumeOption): { draft: ResumeDraft; unmatched: string[] };
  /** «Раунд 3 · Гори»; порожня назва — roundLabel. */
  export function resumeRoundText(info: ResumeLobby, index: number): string;
  ```
- `api.ts`: `export const resumeOptions = (code: string) => fetchData<ResumeOption[]>(`${gameUrl(code)}/resume`);`
- `screens/ResumePanel.tsx`:
  ```ts
  export function ResumePanel(props: {
    code: string;
    info: ResumeLobby;
    draft: ResumeDraft;
    onChange: (draft: ResumeDraft) => void;
  }): JSX.Element;
  ```
  - `details.card.resume-panel` з `open={draft.open}` і `onToggle` → `onChange({ ...draft, open })`; `summary` — `resumeTitle`.
  - Усередині:
    - `p.meta` `resumeHint`;
    - `label` `resumeRound` + `select` (`resumeRoundText` для кожного раунду);
    - кнопка `resumeFill` (`.btn`, на всю ширину):
      - `api.resumeOptions(code)` → завантаження (`resumeLoading`, кнопка неактивна);
      - помилка чи `[]` → `p.meta` `resumeNone`;
      - одна гра → `fillFromGame` одразу;
      - кілька → `section.resume-pick` із заголовком `resumePick` і кнопкою на гру (`resumeOption`: `formatDate(startedAt)`, `questionsPlayed`, `questionCount`, `resumeRoundText(info, option.roundIndex)` з обмеженням); дотик → `fillFromGame` і список ховається;
      - після заповнення — `p.meta` `resumeFilled` і, якщо є, `resumeUnmatched`;
    - `ul.resume-points`: на учасника `li` з `label` (нікнейм) і `input type="number" step="1" min={-RESUME_POINTS_MAX} max={RESUME_POINTS_MAX}` (`aria-label` = нікнейм), значення `draft.points[id] ?? '0'`; фокус виділяє текст; хибне — `p.error` `resumeInvalid`;
    - `p.meta resume-summary` (`resumeSummary`: раунд, кількість ненульових, усього учасників) і `p.meta` `resumeLater`.
  - Новий учасник з'являється з «0», бо `info.participants` іде зі зрізу.
  - Вилучений просто зникає. `resumePayload` бере лише учасників `info`, тож чужих ключів не надсилає.
- `HostScreen.tsx`:
  - `const [resumeDraft, setResumeDraft] = useState(emptyDraft)`;
  - `const resumeSend = view.resume === null ? undefined : resumePayload(resumeDraft, view.resume)`;
  - у лобі над `footer.actions`: `{phase === 'lobby' && view.resume !== null && view.resume.rounds.length > 0 && <ResumePanel code={code} info={view.resume} draft={resumeDraft} onChange={setResumeDraft} />}`;
  - головна кнопка в лобі: `onClick={() => step(main.event, phase === 'lobby' && resumeSend !== 'invalid' ? resumeSend : undefined)}`; до `disabled` + `(phase === 'lobby' && resumeSend === 'invalid')`.
- `AuthorLobby.tsx`: нові пропси `resume: ResumeLobby | null` і власний `useState(emptyDraft)`; панель між `author-lobby` і `authorStartHint`; «Почати гру» шле `guard.run('host:start', payload)` (без даних — `undefined`) і неактивна при `'invalid'`.
- `PlayerScreen.tsx`: `<AuthorLobby … resume={view.author.resume} />`.
- `GameHistory.tsx`: у групі раунду, перед запитаннями — `carry = roundAdjustments.filter((a) => a.source === 'carry')`; якщо є, `p.meta.history-carry` з `t('historyCarry', { list: carry.map((a) => `${a.nickname} ${signed(a.points)}`).join(', ') })`.
- `i18n.ts`: ключі з «Тексти» (без `scoreSource_carry` і `err_resume_invalid` — вони вже з задачі 1).
- `styles.css`:
  - `.resume-panel` — відступи як у `.card`; `summary` — ціль дотику ≥ 44 px;
  - `.resume-points li` — `display: grid; grid-template-columns: minmax(0, 1fr) minmax(8rem, 40%); gap`; нікнейм `overflow-wrap: anywhere`;
  - `input` на всю ширину колонки, цифри `font-variant-numeric: tabular-nums`;
  - `.resume-pick` — кнопки стовпчиком на всю ширину.
  - Без горизонтальної прокрутки на 375 px.

- [ ] **Step 1: Write the failing tests**
  - `resume.test.ts`:
    ```ts
    const info: ResumeLobby = {
      rounds: [{ title: 'Розминка', type: 'classic' }, { title: '', type: 'classic' }, { title: 'Гори', type: 'classic' }],
      participants: [{ id: 'p1', nickname: 'оля' }, { id: 'p2', nickname: 'Петро' }, { id: 'p3', nickname: 'Тарас' }],
    };
    it('parses points like 42434, with spaces and a minus sign, within ±9 999 999', () => {
      expect(parsePoints('42434')).toBe(42_434);
      expect(parsePoints(' 42 434 ')).toBe(42_434);
      expect(parsePoints('−150')).toBe(-150);
      expect(parsePoints('')).toBe(0);
      expect(parsePoints('9999999')).toBe(9_999_999);
      for (const bad of ['10000000', '1.5', '1e3', 'abc', '--1']) expect(parsePoints(bad)).toBeNull();
    });
    it('sends nothing for a folded panel or the default values, invalid for a bad field', () => {
      expect(resumePayload({ open: false, roundIndex: 2, points: { p1: '5' } }, info)).toBeUndefined();
      expect(resumePayload({ open: true, roundIndex: 0, points: { p1: '0' } }, info)).toBeUndefined();
      expect(resumePayload({ open: true, roundIndex: 0, points: { p1: 'x' } }, info)).toBe('invalid');
      expect(resumePayload({ open: true, roundIndex: 2, points: { p1: '42434', p2: '0', gone: '7' } }, info)).toEqual({ resume: { roundIndex: 2, points: { p1: 42_434 } } });
    });
    it('fills from a game by normalized nickname; the unmatched stay at 0', () => {
      const option = { gameId: 'g', startedAt: '2026-10-27T17:40:00.000Z', status: 'aborted', questionsPlayed: 4, questionCount: 6, autopilot: false, roundIndex: 5, scores: [{ nickname: 'Оля', score: 200 }, { nickname: ' петро ', score: 100 }, { nickname: 'Іра', score: 50 }] } as const;
      const { draft, unmatched } = fillFromGame({ ...emptyDraft(), open: true }, info, option);
      expect(draft).toEqual({ open: true, roundIndex: 2, points: { p1: '200', p2: '100', p3: '0' } });
      expect(unmatched).toEqual(['Тарас']);
    });
    it('names rounds with the real number', () => {
      expect(resumeRoundText(info, 0)).toBe('Раунд 1 · Розминка');
      expect(resumeRoundText(info, 1)).toBe('Раунд 2');
    });
    ```
  - `ResumePanel.test.tsx` (мок `api.resumeOptions`):
    - згорнута за замовчуванням; розгортання показує список із трьома раундами й поля з «0»;
    - одна гра → поля заповнені, «Підставлено гру від …», «Не знайдено в тій грі, лишається 0: Тарас»;
    - дві гри → «Яку гру продовжити?» з двома кнопками в порядку відповіді; дотик до другої заповнює з неї;
    - `[]` чи помилка → «Попередніх ігор цієї вікторини не знайдено.»;
    - «10000000» → «Ціле число від −9 999 999 до 9 999 999».
  - `HostScreen.test.tsx`:
    - лобі з `resume` → панель є; «Почати гру» без розгортання шле `send('host:start', undefined)`;
    - розгорнута, раунд 3, «42434» у першого → `send('host:start', { resume: { roundIndex: 2, points: { p1: 42434 } } })`;
    - хибне поле → кнопка неактивна;
    - поза лобі (`resume: null`) панелі немає.
  - `PlayerScreen.test.tsx`: автор у лобі бачить панель і «Почати гру» шле дані; звичайний гравець (`author: null`) панелі не бачить.
  - `GameHistory.test.tsx`: гра з `adjustments` `carry` у раунді 1 і запитаннями лише раунду 1 → «Перенесено з попередньої гри: Оля +42 434, Петро +1 200» під «Раунд 2»; раунду 0 у списку немає; розбивка рядка Олі в таблиці — «Перенесено з попередньої гри +42 434».
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web && pnpm vitest run --maxWorkers=2 packages` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): «Продовжити попередню гру» in the lobby of the host and the autopilot author — a folded panel with the start round named by its real number, a points field per player or team that takes values like 42434, «Підставити з попередньої гри» with a pick of recent games newest first and nickname matching, the start sends the values only when they differ from a plain start, and the history lists the carried points under the first played round
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 6. Наскрізний сценарій 12r з кадрами

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Помічники беруться як є:
  - сторінки й кліки: `open`, `register`, `join`, `click`, `afterSplash`, `splashOn`, `field`;
  - автопілот: `launchBot11h`, `joinBy11h`;
  - кадри й кадри сокета: `shot`, `snapshot`, `socketFrames`, `stateViews`;
  - перевірки: `expectNoSideScroll`, `POLL`, `exact`, `squash`, `problems`, `undoRows`;
  - вікторина: `classicRound`, `makeRoundsQuiz`.
- Вміст без тем росії й СРСР. Вікторина «Продовження 12r», `settings: { leaderboard: 'each', newcomers: false }`, три класичні раунди (`speedBonus: false`, `shuffleOptions: false`):
  ```ts
  function resumeQuestions12r() {
    const common = { imageUrl: null, video: null, timeLimit: 30 };
    const yes = (id: string, text: string) => ({ ...common, id, type: 'boolean' as const, text, points: 100, correct: true });
    return {
      r1: [yes('w1', 'Говерла — найвища гора України'), yes('w2', 'Світязь — озеро на Волині')],
      r2: [yes('v1', 'Дніпро тече через Київ')],
      r3: [yes('g1', 'Дунай впадає в Чорне море')],
    };
  }
  // раунди: 'Розминка' (r1), 'Річки' (r2), 'Гори й моря' (r3)
  ```
- Пульт — телефон 375 × 812 (`host12r`), сцена — 1280 × 720 (`stage12r`), телефони 375 × 812.
- Допоміжні локатори:
  - `panel(page) = page.locator('details.resume-panel')`;
  - `pointsField(page, nickname) = panel(page).getByLabel(nickname, exact)`;
  - `roundSelect(page) = panel(page).getByLabel('Почати з раунду', exact)`.

- [ ] **Step 1: Add the scenario** у кінець файлу за зразком 12f:
  ```ts
  it('part 12r: resume a game — after a game stops in round 2 the 375 host opens «Продовжити попередню гру», «Підставити з попередньої гри» fills «Раунд 2» and the points by nickname, a new player gets 42434 by hand and a late joiner 0, the stage says «Раунд 2» and the table shows the carried points that the undo sheet never lists; then the author of a bot game picks the newer of two games on a 375 phone and the bot goes on from «Раунд 3»; the history hides the skipped rounds and lists «Перенесено з попередньої гри»', async () => {
    try {
      await resume12r();
    } catch (error) {
      await snapshot();
      throw error;
    }
  }, 900_000);
  ```
  **Підготовка `resume12r()`:**
  1. `host = open('host12r', 375, 812)`, `register(host, 'host', 'Ліна Ведуча', 'host12r@example.com')`; вікторина вище → `POST /api/quizzes`.
  2. **Гра A (обірвана).** «Грати» → телефони Оля, Петро, Іра (`join`) → «Почати гру» → `afterSplash` → «Почати раунд».
     - w1: Оля й Петро «Так», Іра «Ні»; w2: Оля «Так», Петро й Іра «Ні». Пульт крокує до кінця раунду 1 (`leaderboard: 'each'`).
     - Рахунок: Оля 200, Петро 100, Іра 0.
     - «Наступний раунд» → заставка й `intro` раунду 2 → «Завершити гру» (як у наявних сценаріях) → `finished`.
  **Кроки:**
  1. **Гра B: панель на пульті.** `/quizzes` → «Грати» → код. Сцена `stage12r` відкривається. Телефони `olya2` (нікнейм «оля» — малими, перевіряє нормалізацію), `petro2` («Петро»), `taras` («Тарас») входять.
     - `panel(host)` згорнута (`open` немає); кнопка «Почати гру» активна.
     - Розгорнути (дотик до `summary` «Продовжити попередню гру»). `expectNoSideScroll(host, 'p12r-host-panel-empty')`; кадр `p12r-host-panel-empty`.
  2. **Підставити.** «Підставити з попередньої гри» → одна попередня гра (A) заповнює одразу:
     - `roundSelect(host)` — «Раунд 2 · Річки»;
     - «оля» — 200, «Петро» — 100, «Тарас» — 0;
     - текст «Не знайдено в тій грі, лишається 0: Тарас».
  3. **Вручну й пізній вхід.**
     - Тарасу вписати `42434` (`fill`). Підсумок «Старт: Раунд 2 · Річки. Перенесені бали: 3 з 3.».
     - Телефон `ira2` входить як «Іра» вже після цього: у панелі з'являється поле «Іра» з 0, решта значень на місці.
     - Хибне значення: «оля» → `10000000` → «Ціле число від −9 999 999 до 9 999 999» і «Почати гру» неактивна; повернути `200`.
     - `expectNoSideScroll(host, 'p12r-host-panel')`; кадр `p12r-host-panel`.
  4. **Старт.** «Почати гру»:
     - `splashOn(stage, 'round')`, текст заставки містить «Раунд 2»; кадр `p12r-stage-splash` (`{ splash: true }`);
     - у кадрах телефону Тараса (`stateViews`) `round.index` = 1, а рахунок Тараса — 42 434 ще до першого запитання;
     - `afterSplash(...)` → «Почати раунд» → v1: усі «Так» → розкриття → таблиця (`leaderboard: 'each'`);
     - на сцені Тарас перший з `/42\s?534/`, «оля» — `/300/`, Петро — `/200/`, Іра — `/100/`. `expectStageInView`, якщо його використовують сусідні сценарії; кадр `p12r-stage-table`.
  5. **«↶ Бали».** На пульті відкрити аркуш: `undoRows(sheet)` не містить «42», «Перенесено» і жодного рядка без запитання. Лише відповіді v1. Escape.
  6. **Кінець гри B.** «Далі» до `round_end` → «Наступний раунд» → `intro` раунду 3 → «Завершити гру» → `finished`. Тож остання зіграна — раунд 2 (індекс 1), повністю.
  7. **Гра C: бот.** `code = launchBot11h(host, 'Продовження 12r', 'Ліна')` (той самий акаунт — автор і власник). Телефони `olya3` («Оля») і `taras3` («Тарас») входять (`joinBy11h`).
     - На телефоні автора (`host`, 375) `panel(host)` згорнута → розгорнути → «Підставити з попередньої гри» → «Яку гру продовжити?» з двома кнопками, перша — гра B (новіша, «далі Раунд 3 · Гори й моря»), друга — A.
     - `expectNoSideScroll(host, 'p12r-author-pick')`; кадр `p12r-author-pick`.
     - Дотик до першої:
       - раунд «Раунд 3 · Гори й моря»;
       - «Оля» — 300 (з «оля» гри B);
       - «Тарас» — 42 534;
       - «Ліна» — 0 і «Не знайдено в тій грі, лишається 0: Ліна».
     - Кадр `p12r-author-panel`; `expectNoSideScroll`.
     - Телефони Олі й Тараса панелі не мають (`panel(olya3).count()` = 0), а в їхніх кадрах `author` — `null`.
  8. **Бот продовжує.** «Почати гру» на телефоні автора:
     - на телефонах заставка з «Раунд 3» (`splashOn(olya3, 'round')`);
     - бот відкриває g1 сам; усі «Так»;
     - таблиця на телефоні Олі («Таблиця») — Тарас `/42\s?634/`, Оля `/400/`, Ліна `/100/`;
     - бот доводить гру до `finished` (чекати «Переможці» чи фінального екрана з тайм-аутом, як в 11h). Кадр `p12r-bot-table` з телефона Олі.
  9. **Історія.** `` host.goto(`${base}/history`) ``:
     - **гра B:** розділу «Розминка» немає; під «Річки» — «Перенесено з попередньої гри: оля +200, Петро +100, Тарас +42 434»; рядок Тараса в таблиці — Σ `/42\s?534/`, «Р1» — 0; дотик до рядка Тараса → розбивка «Перенесено з попередньої гри +42 434»; `expectNoSideScroll(host, 'p12r-history')`; кадр `p12r-history`;
     - **гра C:** «Провів бот»; під «Гори й моря» — рядок «Перенесено з попередньої гри: …» з «Оля +300» і «Тарас +42 534».
  10. **Сцена без зайвого.** У жодному кадрі сцени немає ключа `"resume"`.
  11. `expect(problems).toEqual([])`.
- [ ] **Step 2: Run** на передньому плані (не у фоні): `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 12r"` → PASS. Переглянути кадри `p12r-*`:
  - пульт і телефон автора 375: панель на всю ширину, `summary` читається, список і поля не вилазять, «42434» влазить у поле, кнопки вибору гри стовпчиком, без горизонтальної прокрутки;
  - сцена 1280 × 720: заставка «Раунд 2», таблиця з 42 534 без обрізання;
  - історія 375: рядок «Перенесено…» переноситься, таблиця прокручується лише у своїй області.
- [ ] **Step 3: Регресія старту — один раз, на передньому плані** (не у фоні): `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 11g|part 11h|part 12a"` → PASS. Ці сценарії стартують з пульта й з телефону автора та відкривають «↶ Бали». Якщо PGlite чи браузер падають від нестачі пам'яті, прогнати кожен `-t` окремо (теж на передньому плані) і назвати це в звіті.
- [ ] **Step 4: Commit**
  ```bash
  git add apps/server/e2e
  git commit -m "test: part 12r end-to-end — a game stops in round 2, the 375 host fills «Раунд 2» and the points by nickname from it, types 42434 for a new player, a late joiner gets 0, the stage says «Раунд 2» and shows the carried points that the undo sheet never lists, the bot game author picks the newer of two games on a 375 phone and the bot goes on from «Раунд 3», and the history hides the skipped rounds and lists the carried points
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```
