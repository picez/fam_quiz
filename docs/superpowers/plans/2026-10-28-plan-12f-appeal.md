# План 12f: апеляція гравця — голосування залу за 30 с

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 12f специфікації `docs/superpowers/specs/2026-10-27-subproject-12-design.md`:
- розділ 10 (уся частина);
- обмеження — розділи 2 і 3 (анти-ціль «хтось бачить, як голосував конкретний учасник апеляції (і ведучий теж)», «гра без ведучого зависає на новій механіці: апеляція…»);
- рядок 12f у таблиці частин — розділ 4;
- скасування рішення апеляції — розділ 5, п. 2 і 8;
- штраф за вихід, який в автопілоті знімає лише апеляція, — розділ 9, п. 7;
- «Твоя гра» після 12f — розділ 8, «Наприкінці гри», п. 2;
- рішення автора — розділ 18, «Апеляція (12f)»;
- відповідь власника — розділ 19, п. 3.

**Рішення власника:** голосування триває 30 с, апеляцій — дві за гру. Апеляція проходить простою більшістю тих, хто не оскаржує: «так» > «ні». Нічия чи жодного голосу лишають усе як було.

Що робить частина:
- **Кнопка на телефоні.** На розкритті класичного запитання чи звичайної клітинки поля, якщо відповідь не зарахована повністю (`wrong` чи `partial`), гравець бачить «⚖️ Оскаржити (лишилось 2)». У командній грі кнопку бачить капітан.
- **Друга підстава — штраф за вихід (12e).** Якщо за це запитання буде штраф `away`, з'являється «⚖️ Оскаржити штраф (лишилось N)». Це та сама апеляція й той самий ліміт.
- **Голосування.** Голосують люди на зв'язку, крім того, хто оскаржує (у командній грі — люди інших команд, кожна людина окремо). Голосування триває `APPEAL_MS.vote = 30 000` мс або закривається, щойно проголосували всі. Голос можна змінити до кінця.
- **Таємність.** Імен голосів не бачить ніхто, і ведучий теж. Видно лише лічильник «так 3 · ні 1 · ще думають 2».
- **Рішення.**
  - «так» > «ні», підстава `grade`: рушій дописує коригування `appeal` = (бали відповіді як «правильно» за `override`) − (бали запису).
  - «так» > «ні», підстава `away`: штраф за вихід за це запитання не дописується.
  - Інакше нічого не змінюється.
  - Запис відповіді не змінюється.
- **Одна апеляція за раз.** Поки голосування йде, «Далі» з розкриття відповідає новою помилкою `appeal_open`. На пульті кнопка неактивна з написом «Голосує зал». Автопілот чекає.
- **Що діє одразу.** Пауза зупиняє відлік. Вилучення, «Завершити раунд» і «Завершити гру» діють одразу: завершення закриває апеляцію з `cancelled`, і в ліміт вона не рахується.
- **Ведучий.** Оцінка «Правильно» тому, хто оскаржує (підстава `grade`), закриває апеляцію з `host` («Ведучий зарахував»), і в ліміт вона не рахується. Рядок `appeal` ведучий скасовує в аркуші «↶ Бали» (12a): «Оля +150 (апеляція)».
- **Автопілот.**
  - Розкриття триває щонайменше `AUTOPILOT_MS.appealWindow = 8000` мс, якщо хтось ще може оскаржити.
  - Відкриту апеляцію автопілот чекає.
  - Після рішення — ще `AUTOPILOT_MS.appealShown = 3000` мс.
- **Що видно.** Картка апеляції на сцені 1280 × 720, на пульті й на телефонах; результат: «Зараховано! +200», «Лишається як було», «Штраф знято», «Ведучий зарахував».
- **Історія:** «⚖️ зараховано 2:0» біля відповіді.
- **«Твоя гра»:** рядок «⚖️ Апеляції: виграно 1, програно 1».
- **Довідка ведучого:** новий запис `setting.appeal` після `setting.away`; рядки про апеляцію в `setting.away`, `setting.undo` і `setting.autopilot`.

**Стан гри змінюється: `GAME_STATE_VERSION` 17 → 18, версія 17 лишається читабельною.**
- Нові поля:
  - необов'язкове `GameState.appeals?: Appeal[]`;
  - нове значення `AdjustmentSource` `'appeal'`.
- Чому підняття потрібне: старий сервер не прочитав би стан з новим ключем і новим джерелом (розділ 3 специфікації).
- Чому старі стани читаються: стан версій 2–17 не може містити апеляцій, тож `READABLE_STATE_VERSIONS` отримує 17 з поясненням у `restore.ts`. Кімнати, збережені до деплою, відновлюються, і живі ігри деплой переживають.
- Міграція бази `0016_appeal`: нова таблиця `appeal` (гра, учасник, запитання, підстава, «так», «ні», рішення, seq коригування) для історії й ачівок 12j. Її ставить сервер під час запуску (`migrate`).
- Перед пушем координатор перевіряє `live_room` (правило специфікації, розділ 2). За правилом пам'яті «Deploys kill live games» він питає власника: стара версія читається, але правило вимагає питати перед кожним підняттям `GAME_STATE_VERSION`.

**Архітектура:**
- **Shared.**
  - Новий `packages/shared/src/appeal.ts`: `APPEAL_MS`, `APPEALS_PER_GAME`, `APPEAL_ROUNDS`, `APPEAL_VOTES_PER_SECOND`, `APPEAL_REASONS`, `APPEAL_OUTCOMES`, типи `AppealReason` і `AppealOutcome`, чисті `appealDecision` і `appealCounted`.
  - `game.ts`: `AdjustmentSource` + `'appeal'`; `ErrorCode` + `appeal_open`, `appeals_used`, `appeal_unfit`, `no_voters`.
  - `breakdown.ts`: `SCORE_SOURCES` + `'appeal'` після `'away'`.
  - `undo.ts`: `UNDOABLE_SOURCES` = `['host', 'away', 'appeal']`.
  - `events.ts`: `appealSchema`, `appealVoteSchema`, події `'player:appeal'` і `'player:appeal-vote'`.
  - `autopilot.ts`: `AUTOPILOT_MS.appealWindow`, `AUTOPILOT_MS.appealShown`.
  - `views.ts`: `AppealView`, `PlayerAppeal`, `BaseView.appeal`, `PlayerView.me.appeal`, `UndoRow.kind` + `'appeal'`.
  - `history.ts`: `GameAppeal`, `GameResponse.appeal`.
  - `facts.ts`: `FactInput.appeals`, `GameCard.appeals`.
- **Рушій.**
  - `game.ts`: `Appeal`, `GameState.appeals`. Інтеграція в `next`, `tick`, `resume`, `override`, `removePlayer`, `endRound` і `end`.
  - `blitz.ts`: `nextDeadline` на розкритті.
  - Новий `appeal.ts`: голосування, рішення, підстави, ліміт.
  - `restore.ts`: версія 18, читається 17.
  - `away.ts`: апеляція `away` знімає штраф; штраф враховує бали апеляції.
  - `undo.ts`: рядок `kind: 'appeal'`; скасування відповіді знімає й апеляцію за те запитання.
  - `autopilot.ts`: розкриття ≥ 8 с, очікування голосування, 3 с після рішення, `pilotKey`.
  - `views.ts`: `appealView`, `playerAppeal`.
  - `facts.ts`: `appeals` у `factInput`.
- **Сервер.**
  - `drizzle/0016_appeal.sql` + `meta`; `db/schema.ts`: таблиця `appeal`.
  - `recorder.ts`: пише закриті апеляції.
  - `history.ts`: `appeal` у відповідях, `appeals` у `factInputOf`.
  - `rooms/manager.ts`: методи `appeal` і `appealVote`, частота голосів `appealRate`.
  - `socket.ts`: `player:appeal`, `player:appeal-vote`.
- **Веб.**
  - Новий `appeal-text.ts`.
  - Нові `screens/AppealCard.tsx` (картка: сцена, пульт, телефон) і `screens/AppealSheet.tsx` (голосування на телефоні).
  - `screens/PlayerScreen.tsx`, `StageScreen.tsx`, `HostScreen.tsx`.
  - `undo-panel.ts`, `pages/GameHistory.tsx`, `facts-text.ts`, `i18n.ts`, `styles.css`.
  - `clockText` і `useLeftMs` переїжджають із `screens/Buffs.tsx` у `live/Timer.tsx`.
- **Довідка ведучого:** новий запис `setting.appeal` одразу після `setting.away`; оновлені рядки в `setting.away`, `setting.undo`, `setting.autopilot`.
- **Наскрізні тести.** Один сценарій «part 12f: …». Пульт на телефоні 375 × 812, сцена 1280 × 720, три телефони 375 × 812. Кадри з префіксом `p12f-`.

**Технології:** TypeScript, zod, vitest, Fastify + Socket.IO, Drizzle + drizzle-kit + PGlite, React 19 + Vite, Testing Library (jsdom), Playwright. Нових залежностей немає.

**Рішення плану там, де специфікація мовчить чи неоднозначна (координатор може змінити):**

*Стан (`Appeal`)*
- Поля апеляції:
  ```ts
  interface Appeal {
    id: number;                     // номер апеляції в грі, від 1 (appeals.length + 1)
    by: string;                     // учасник рушія: соло-гравець чи команда
    questionIndex: number;          // індекс у plays
    reason: AppealReason;           // 'grade' | 'away'
    openedAt: number;
    endsAt: number;                 // пауза зсуває на свою тривалість
    votes: Record<string, boolean>; // людина → «так»/«ні»; у зрізи не йде ніколи
    outcome: AppealOutcome | null;  // null — голосування триває
    adjustmentSeq?: number;         // seq коригування 'appeal', якщо рішення його дописало
  }
  ```
  Це поля зі специфікації.
- **Голосують люди.** У соло-грі людина — гравець. У командній — учасник (`TeamMember.id`), не команда.
- **Відкрита апеляція (`appealOpen`)** — остання апеляція з `outcome === null`. Таку буває лише на етапі `reveal` її запитання: усі переходи з розкриття її закривають (нижче).

*Коли й що можна оскаржити (`appealReasons`)*
- Для учасника `p` на `reveal` поточного запитання `q` можна оскаржити, якщо виконано все:
  - раунд з `APPEAL_ROUNDS = ['classic', 'board']`;
  - на полі: клітинка `board.kind === 'normal'` і `p === board.chooserId`;
  - є запис `recordOf(state, q, p)` з `answer !== null`. Усна відповідь (голос на усній клітинці) не оскаржується: залу нема що побачити (*рішення плану*);
  - `p` ще не оскаржував це запитання (будь-який результат). Одна апеляція на учасника на запитання.
- **Підстава `grade`:** `record.grade !== 'correct'` і `appealPoints(state, p) > 0`.
  - `appealPoints` — «та сама функція, що й `override`»: `override(state, p, 'correct', now)`, бали запису `p` у новому стані мінус `record.points`.
  - Якщо `override` відмовляє, підстави немає. Так типи, де перевірка однозначна, відпадають самі: ланцюжок, сортування, стіна, «100 до 1», блеф, опитування, хмара.
- **Підстава `away`:** `awayPenalized(state, q).includes(p)`, штрафу ще немає або його не скасовано, а бали, які штраф зняв би, більші за 0: `record.points + appealAdjustmentTotal(state, p, q) > 0`.
- Бліц, фінал, «Ва-банк», «Вибування», «Мільйонер» і дуель не підходять за раундом.

*Порядок перевірок `openAppeal` (коди помилок)*
1. Етап не `reveal` → `wrong_phase`. На паузі → `paused`.
2. Хто діє: `actorOf(state, personId, 'captain')`. Соло — сам гравець. У командній грі — капітан, інакше `not_captain` чи `not_found`.
3. Уже є відкрита апеляція → `appeal_open`.
4. Підстава не підходить → `appeal_unfit`.
5. У `by` уже `APPEALS_PER_GAME` рахованих апеляцій → `appeals_used`.
6. Голосувати нікому → `no_voters`.

*Хто голосує (`appealVoters`)*
- Присутні люди (на зв'язку чи в `awaiting`, як `presentPlayers` / `presentMembers`), крім того, хто оскаржує.
  - Соло: `presentPlayers(state)` без `by`.
  - Командна гра: `presentMembers(state)` з `teamId !== null`, `teamId !== by` і командою, що є в `state.players`.
- Перелік рахується в мить запиту, без знімка на відкритті. Хто перепідключився, може голосувати. Голос того, хто відключився, лишається.
- Ведучий не голосує ніколи. Автор автопілота голосує як звичайний гравець.

*Голос (`castAppealVote`)*
- Помилки:
  - людини немає в грі → `not_found`;
  - немає відкритої апеляції або `appealId` не той → `vote_closed`;
  - на паузі → `paused`;
  - людина не серед `appealVoters` → `vote_denied`.
- Голос записується (`votes[personId] = yes`; повтор того самого — той самий результат, зміна — нове значення).
- Якщо після голосу проголосували всі присутні виборці (і їх ≥ 1), рішення ухвалюється одразу.
- Голоси на паузі відхиляються, як голос бафу «Запитання в залі» (`castVote`). Тож пауза не закриває голосування.

*Рішення (`decideAppeal`)*
- `yes` і `no` — голоси людей, які ще є в грі. `outcome = appealDecision(yes, no)`: `yes > no` → `'yes'`, `no > yes` → `'no'`, інакше `'tie'` (і 0 : 0 теж).
- `'yes'`, підстава `grade`:
  - `points = appealPoints(state, by)`;
  - якщо `points > 0`: `addAdjustment(state, by, points, now, 'appeal', { roundIndex: play.roundIndex })`, у запис апеляції — `adjustmentSeq`.
  - На `reveal` `afterQuestionNow` = `plays.length`, тож `afterQuestion − 1 === q`. Рядок стоїть під своїм запитанням (`hostGroup` 12a) і схований, поки запитання на розкритті.
- `'yes'`, підстава `away`:
  - Зазвичай штрафу ще немає (12e дописує його на виході з розкриття). Тоді нічого не дописується, а `awayPenalized` пропускає учасника з такою апеляцією, тож штраф не з'явиться.
  - Якщо ж нескасований штраф `away` за `q` уже є (захист), дописується `appeal` = `−penalty.points` з `adjustmentSeq`.
- Записи відповідей не змінюються, серії не перераховуються.
- Межа `LIMITS.maxAdjust` до `appeal` не застосовується (як до `undo` і `away`).

*Закриття без рішення*
- **`host`:** `override` тому, хто оскаржує, з оцінкою `'correct'` при відкритій апеляції з підставою `grade` закриває її з `'host'`. Інші оцінки (частково, неправильно) голосування не зупиняють. Апеляцію `away` оцінка ведучого не закриває: штраф 12e від оцінки не залежить.
- **`cancelled`:**
  - `endRound` і `end` (до своїх перетворень);
  - вилучення того, хто оскаржує (`by` зник із `state.players`).
  - Вилучена людина-виборець просто зникає з `votes`.
- `appealCounted(outcome)` — `outcome !== 'host' && outcome !== 'cancelled'`. Відкрита апеляція (`null`) рахується.

*Годинник*
- `tick` на `reveal` (не на паузі): відкрита апеляція з `now >= endsAt` → рішення.
- `nextDeadline` на `reveal` (не на паузі): `endsAt` відкритої апеляції, якщо воно пізніше за `now`. Сервер ставить таймер через наявний `reschedule`.
- `resume` зсуває `endsAt` відкритої апеляції на тривалість паузи (`shiftAppealClock(state, now − pausedAt)`), поруч зі `shiftSplash`.
- Перезапуск сервера (`suspend`) ставить паузу, тож відлік стоїть і продовжується з того самого залишку.

*Штраф за вихід (12e) і апеляція*
- `awayPenalized(state, q)` не повертає учасника, у якого є апеляція `away` за `q` з `outcome === 'yes'`. Тоді все, що на ньому стоїть, узгоджене само собою:
  - штраф (`withPenalties`);
  - `OwnAway.penalty`;
  - `HostResponse.awayPenalty` («→ 0 (вихід із гри)»).
  - Читання — прямо зі `state.appeals` у `away.ts`, без імпорту `appeal.ts`.
- Сума штрафу дорівнює `−(record.points + appealAdjustmentTotal(state, p, q))`, якщо це додатне число. Інакше вихід рятував би бали, які зал щойно зарахував (*рішення плану*). Тож «оскаржив оцінку, але виходив від 3 с» дає 0 за запитання, як і задумано в 12e.

*Скасування (12a)*
- `UNDOABLE_SOURCES` = `['host', 'away', 'appeal']`.
- `UndoRow.kind: 'appeal'` → текст «Оля +150 (апеляція)».
- Скасування відповіді учасника за `q` знімає разом з нею й нескасовані `appeal` того самого учасника під `q`, як уже знімає штрафи `away` (`openPenalties` → `openRiders` для обох джерел). «Повернути» таке скасування повертає й їх (`penaltyRedos` для обох). Так «Скасувати» відповідь з апеляцією дає 0 за запитання.
- Після кінця гри аркуш, як і раніше, показує лише штрафи `away`. Апеляцій після кінця не буває: `end` їх закриває.
- В історії «↶ Скасовано: Оля −150 (апеляція)» (`historyUndoAppeal`).

*Автопілот*
- `moveOf`, `case 'reveal'`:
  - відкрита апеляція → `null` (закриває `tick` рушія);
  - інакше `nextAt(max(base, revealStart + window))`, де:
    - `revealStart = state.stepAt ?? from`;
    - `base = from + AUTOPILOT_MS.appealShown`, якщо на цьому запитанні вже є закрита апеляція, інакше `from + revealMs(state)`;
    - `window = AUTOPILOT_MS.appealWindow`, якщо `appealPossible(state)`, інакше 0.
- `appealPossible(state)` — є учасник з непорожніми `appealReasons` і рахованих апеляцій менше ліміту, немає відкритої апеляції, а `appealVoters` для нього не порожні.
- `pilotKey` + частина `appealKey(state)` = `${кількість апеляцій на поточному запитанні}:${outcome останньої ?? 'open'}`. Відкриття й закриття змінюють ключ, тож `planAutopilot` рахує мить від миті зміни (`from` = відкриття чи закриття).
- Автор у грі без ведучого апеляцію не закриває й не скасовує: панелі 12a немає, а `override` автору недоступний.

*Хто що бачить*
- **`BaseView.appeal: AppealView | null`** — сцена, пульт і телефони однаково. Це остання апеляція на поточному запитанні на етапі `reveal`, відкрита чи закрита; інакше `null`.
  ```ts
  interface AppealView {
    id: number;
    by: BlitzPlayer;              // { playerId: by, nickname } — гравець чи команда
    reason: AppealReason;
    answer: Answer | null;        // grade — відповідь запису; away — null
    question: Question;           // questionFor(state, play, by): з правильною відповіддю (розкриття), запасне — своє
    points: number;               // відкрита — скільки дасть «так» (grade: appealPoints; away: бали, які зніме штраф); 'yes' — що дала; інакше 0
    endsAt: number | null;        // відкрита й не на паузі; інакше null
    remainingMs: number | null;   // відкрита на паузі: endsAt − pausedAt; інакше null
    yes: number;
    no: number;
    waiting: number;              // відкрита: присутні виборці без голосу; закрита — 0
    outcome: AppealOutcome | null;
  }
  ```
  У `AppealView` немає жодного id людини, крім `by.playerId`. Голоси ніколи не йдуть у зріз.
- **`PlayerView.me.appeal: PlayerAppeal | null`** (лише на `reveal`, інакше `null`):
  ```ts
  interface PlayerAppeal {
    left: number;                       // APPEALS_PER_GAME − раховані апеляції свого учасника
    reasons: AppealReason[];            // з якими можна оскаржити зараз (усі перевірки openAppeal пройдено); [] — кнопки немає
    block: 'no_voters' | 'captain' | null; // відповідь не зарахована, але: голосувати нікому / оскаржує капітан
    voter: boolean;                     // відкрита апеляція, і ця людина серед виборців
    vote: boolean | null;               // свій голос у відкритій апеляції; null — ще не голосувала чи не виборець
  }
  ```
  - Поле особисте (людина, а не команда). У командній грі `playerView` додає його поверх спільного `ownView`, як `away` і `vote`.
  - Чужих голосів телефон не отримує, свій — лише свій.
- **Пульт** бачить той самий `AppealView`: лічильник і відлік. Імен виборців немає.

*Екрани (тексти — у `i18n.ts`, без роду)*
- **Телефон того, хто може оскаржити.** Під результатом на розкритті:
  - кнопка `button.appeal-button` «⚖️ Оскаржити (лишилось 2)» (`grade`) чи «⚖️ Оскаржити штраф (лишилось 1)» (`away`), по кнопці на підставу;
  - `block: 'no_voters'` → `p.meta` «Нема кому голосувати»;
  - `block: 'captain'` → «Оскаржує капітан»;
  - ліміт вичерпано → нічого («третьої кнопки немає»).
- **Телефон виборця.** Нижній аркуш `section.appeal-sheet` (`position: fixed`, як `vote-sheet`):
  - заголовок «⚖️ Оля оскаржує» (команда — «⚖️ Команда «Червоні» оскаржує»);
  - текст для `grade` — «Відповідь «Шевченко», правильна — «Тарас Шевченко». Зарахувати?», для `away` — «Штраф за вихід із гри. Зняти штраф?»;
  - кнопки [Так] [Ні] з `aria-pressed` свого голосу;
  - лічильник «так 1 · ні 0 · ще думають 1» і відлік «0:21»;
  - після голосу — «Твій голос: так · можна змінити до кінця».
- **Телефон того, хто оскаржує (і його команди) та інших не-виборців.** Картка `AppealCard size="phone"` «⚖️ Зал голосує… 0:21» з лічильником.
- **Сцена.** Картка `AppealCard size="stage"` (`position: fixed` унизу, не зсуває розкриття):
  - заголовок і текст, як в аркуші;
  - смужка «так / ні» (частки від `yes + no`);
  - лічильник і відлік.
- **Пульт.** Картка `AppealCard size="host"` з лічильником і відліком. Головна кнопка розкриття неактивна з написом «Голосує зал».
- **Результат** (усі ролі, поки триває розкриття) — рядок `.appeal-result` у картці:
  - «⚖️ Зараховано! +200»;
  - «⚖️ Штраф знято»;
  - «⚖️ Лишається як було · так 1 · ні 1»;
  - «⚖️ Ведучий зарахував».

  Для `cancelled` картки немає (розкриття вже скінчилося).

*Частота*
- `player:appeal-vote` — не більше `APPEAL_VOTES_PER_SECOND = 4` за секунду на людину (`room.appealRate`, як `draftRate`), понад — `too_soon`.
- `player:appeal` частоти не має: його стереже рушій (`appeal_open`, `appeal_unfit` на повтор).

*База й історія*
- Таблиця `appeal`:
  - `game_id` (uuid → `game.id`, cascade);
  - `seq` (= `Appeal.id`);
  - `participant_id` (uuid → `participant.id`, cascade);
  - `question_index`, `reason`, `yes`, `no`, `outcome`, `adjustment_seq` (null).
  - Первинний ключ — `(game_id, seq)`.
- Рекордер пише закриті апеляції (`outcome !== null`) учасників, що є в грі, з `onConflictDoNothing`: закрита апеляція незмінна. Підпис `signature` враховує `outcome` апеляцій: рішення «ні» нічого іншого не змінює.
- Історія:
  - `GameResponse.appeal: GameAppeal | null` — на першому рядку відповіді учасника на запитання (без `cancelled`);
  - `GameAppeal = { reason, yes, no, outcome }`;
  - текст — «⚖️ зараховано 2:0», «⚖️ лишилось як було 1:1», «⚖️ ведучий зарахував», для `away` — «⚖️ штраф знято 2:0» і т. д.
- «Твоя гра»:
  - `FactInput.appeals: { playerId: string; outcome: 'yes' | 'no' | 'tie' }[]` — лише раховані закриті;
  - `GameCard.appeals: { won: number; lost: number }` (`lost` — `no` і `tie`);
  - рядок «⚖️ Апеляції: виграно 1, програно 1», лише коли `won + lost > 0`.

*Чого не робимо*
- права вето ведучого;
- налаштування вікторини «вимкнути апеляції» (специфікація його не просить);
- ачівок «lawyer» і «hammer» (12j);
- сповіщення `notice` про рішення: результат і так видно в картці;
- нового демо-вмісту. Тексти e2e й довідки — без тем росії й СРСР.

## Глобальні обмеження

- **Анти-ціль:** «хтось бачить, як саме голосував конкретний учасник апеляції (і ведучий теж)».
  - `Appeal.votes` не потрапляє в жоден зріз. `AppealView` має лише лічильники. Свій голос — лише у своєму `PlayerAppeal.vote`.
  - Перевіряють задачі 6 (зрізи всіх ролей) і 12 (кадри сцени, пульта й телефонів без id і нікнеймів виборців у полі `appeal`).
- **Анти-ціль:** гра без ведучого не зависає. Автопілот чекає лише до `endsAt`, а рушій сам закриває голосування (`tick`) (задачі 4 і 5).
- **Анти-ціль:** живі ігри не обриваються деплоєм. Версія 18, 17 — у `READABLE_STATE_VERSIONS` (задачі 3 і 8).
- **Анти-ціль:** «скасування балів ламає історію». `appeal` — звичайне коригування. Задача 7 перевіряє: Σ `answer.points` + Σ `score_adjustment.points` = `participant.score` після апеляції й після її скасування.
- **Анти-ціль:** старі вікторини не змінюють правил балів. Апеляція — нова механіка, що діє, лише коли гравець її відкрив. Без апеляцій бали ті самі.
- **Анти-ціль:** тексти без тем росії й СРСР. Приклади — «Заповіт» і Тарас Шевченко, Говерла.
- **Тексти без роду:** «ти» в теперішньому часі, безособові форми («лишилось», «можна змінити»), без «голосував / голосувала». Команда — через «Команда «…» оскаржує».
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`, тексти довідки — лише в `apps/web/src/help/*.ts`.
- Сцена 1280 × 720 без прокрутки. Телефон і пульт 375 px без горизонтальної прокрутки сторінки; шапка пульта в один рядок (`HEADER_ONE_LINE`).
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і тести:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=1 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- Наскрізні тести: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 12f"`.
  - **Лише на передньому плані.** Жодного запуску у фоні: команда йде в тому самому кроці, а результат читається одразу.
  - Затримка 11b в e2e увімкнена. Кнопки пульта чекають, доки стануть активними, без снів. Сон дозволено лише для перевірки, що відлік на паузі стоїть.
  - Кадри лежать в `apps/server/e2e/artifacts/shots`, префікс — `p12f-`.
- Кожен коміт закінчується рядками:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  ```
- Після останньої задачі й фінальної рецензії гілку зливають у `main`. **Пуш — лише після згоди власника** (версія стану піднімається: правило пам'яті «Deploys kill live games») і після перевірки `live_room`. Якщо власник саме грає (правило «Push hold while playing»), пуш чекає.

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/appeal.ts` (новий), `appeal.test.ts` (новий), `index.ts`, `game.ts`, `breakdown.ts`, `breakdown.test.ts`, `undo.ts`, `undo.test.ts`, `events.ts`, `autopilot.ts`; `apps/web/src/i18n.ts` (тексти помилок і джерела) | сталі, типи, джерело, помилки, події | 1 |
| `packages/shared/src/views.ts`, `history.ts`, `facts.ts`, `facts.test.ts`; заглушки в `packages/engine/src/views.ts`, `undo.ts`, `facts.ts`; `apps/server/src/history.ts`; фікстури зрізів, `GameResponse`, `GameCard`, `FactInput` у тестах | поля зрізів, історії й цікавинок із заглушками | 2 |
| `packages/engine/src/game.ts`, `appeal.ts` (новий), `appeal.test.ts` (новий), `restore.ts`, `restore.test.ts`, `index.ts` | стан, відкриття, голос, рішення, версія 18 | 3 |
| `packages/engine/src/game.ts`, `blitz.ts`, `appeal.ts`, `appeal.flow.test.ts` (новий), `away.ts`, `away.penalty.test.ts`, `undo.ts`, `views.undo.test.ts`, `facts.ts`, `facts.test.ts` | «Далі», годинник, пауза, оцінка ведучого, вилучення, завершення, штраф, скасування, цікавинки | 4 |
| `packages/engine/src/autopilot.ts`, `autopilot.appeal.test.ts` (новий), наявні тести автопілота (див. «Порядок збирання») | автопілот | 5 |
| `packages/engine/src/views.ts`, `views.appeal.test.ts` (новий) | зрізи всіх ролей, таємність | 6 |
| `apps/server/drizzle/0016_appeal.sql` + `meta`, `src/db/schema.ts`, `recorder.ts`, `recorder.test.ts`, `history.ts`, `history.appeal.test.ts` (новий) | міграція, запис і читання | 7 |
| `apps/server/src/rooms/manager.ts`, `rooms/manager.appeal.test.ts` (новий), `manager.drafts.test.ts`, `manager.restore.test.ts`, `socket.ts`, `socket.test.ts` | події, частота, таймер, версія | 8 |
| `apps/web/src/appeal-text.ts` (новий), `appeal-text.test.ts` (новий), `screens/AppealCard.tsx` (новий), `AppealCard.test.tsx` (новий), `screens/AppealSheet.tsx` (новий), `AppealSheet.test.tsx` (новий), `live/Timer.tsx`, `screens/Buffs.tsx`, `screens/PlayerScreen.tsx`, `PlayerScreen.test.tsx`, `i18n.ts`, `styles.css` | телефон: кнопка, аркуш голосу, картка, результат | 9 |
| `apps/web/src/screens/StageScreen.tsx`, `StageScreen.test.tsx`, `HostScreen.tsx`, `HostScreen.test.tsx`, `undo-panel.ts`, `undo-panel.test.ts`, `i18n.ts`, `styles.css` | сцена, пульт, аркуш скасування, розбивка | 10 |
| `apps/web/src/help/settings.ts`, `help/host-help.test.ts`, `pages/GameHistory.tsx`, `pages/GameHistory.test.tsx`, `facts-text.ts`, `facts-text.test.ts`, `i18n.ts` | довідка, історія, «Твоя гра» | 11 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 12f | 12 |

## Порядок збирання

- 1 → 2 → 3 → 4 → 5 → 6. Задача 7 — після 4. Задача 8 — після 6. Задачі 9, 10, 11 — після 2 (тести на фікстурах; наживо — після 8). Задача 12 — останньою.
- **Навмисні зміни наявних очікувань** (лише такі):
  - **фікстури (задача 2):**
    - кожен зріз (`StageView`, `HostView`, `PlayerView`) отримує `appeal: null`, кожен `PlayerView.me` — `appeal: null`;
    - `GameResponse` — `appeal: null`, `GameCard` — `appeals: { won: 0, lost: 0 }`, `FactInput` у тестах — `appeals: []`;
    - файли: `apps/web/src/screens/*.test.tsx`, `team-test-view.ts`, `ladder-fixtures.ts`, `live/*.test.tsx`, `pages/History.test.tsx`, `pages/GameHistory.test.tsx`, `packages/shared/src/facts.test.ts`, `packages/engine/src/*.test.ts` з літеральними зрізами і кожен файл, на який вкаже `pnpm typecheck`;
  - **`packages/engine/src/restore.test.ts` (задача 3):**
    - новий запис `KEYS[18]` (`GameState` + `appeals`, новий тип `Appeal`);
    - рядок `Appeal` у `STATE_SHAPE`;
    - `READABLE_STATE_VERSIONS` у тесті «older readable versions» — `[2, …, 17, 18]`;
    - `representative()` отримує стан з апеляціями (закрита з `adjustmentSeq` і відкрита), щоб `Appeal` трапився;
    - записи 1–17 не змінюються;
  - **`packages/shared/src/breakdown.test.ts`:** перелік `SCORE_SOURCES` з `'appeal'` після `'away'`. **`undo.test.ts`:** `UNDOABLE_SOURCES` — `['host', 'away', 'appeal']` (задача 1);
  - **`packages/engine/src/away.penalty.test.ts` (задача 4):** наявні очікування не змінюються (без апеляцій сума штрафу та сама); нові тести дописуються;
  - **тести автопілота (задача 5):** `autopilot.test.ts`, `autopilot.full.test.ts`, `game.autopilot.test.ts`, `views.autopilot.test.ts`.
    - Тест, що міряє розкриття класики чи звичайної клітинки поля, де хтось відповів неправильно чи частково й є кому голосувати, тепер чекає `max(AUTOPILOT_MS.reveal, AUTOPILOT_MS.appealWindow)` = 8 с від початку розкриття, а не 6 с.
    - Тести, де всі відповіли правильно (наприклад, «classic reveal 6 s, table 5 s» з `RIGHT`), не змінюються.
    - Кожну таку правку виконавець перелічує у звіті;
  - **`apps/server/src/rooms/manager.drafts.test.ts`:** «the game state version is 17» → 18 (задача 8);
  - **`apps/server/src/rooms/manager.restore.test.ts`, тест 12e** (рядок з `toBe(17)`): → `toBe(GAME_STATE_VERSION)` (задача 8);
  - **`apps/web/src/help/host-help.test.ts` (задача 11):**
    - `SETTING_HELP_KEYS` з `'appeal'` одразу після `'away'`, `autopilot` лишається останнім;
    - у тесті 12e: «штраф поки що зняти не можна» → новий текст про апеляцію, `not.toMatch(/апеляц|будь-хто/)` → `not.toMatch(/будь-хто/)`, і обидва рядки `setting.autopilot` — за новим текстом;
    - тест 11g (рядок з `AUTOPILOT_MS.reveal`) лишається, бо `6 с` у тексті лишається;
  - **e2e:** наявні сценарії з ведучим не змінюються: апеляцію ніхто не відкриває, а кнопка «Оскаржити» нічого не зсуває.
    - Сценарій 11g: якщо `expectGap(… 6000, 'reveal to the next question')` стоїть після запитання, де хтось відповів неправильно, очікування стає 8000 (навмисна зміна; виконавець задачі 12 перевіряє кожен такий `expectGap` і перелічує правки у звіті).
  - Якщо падає інше, рецензент розбирає причину, а не правку очікування.

## На що дивитися рецензентові

1. **Таємність.** `votes` ніколи не в зрізі. Сцена, пульт і чужі телефони — лише лічильники; свій голос — лише свій (задачі 6, 12).
2. **Рішення.** `так > ні` → `appeal` = бали `override('correct')` − бали запису. Нічия й 0 : 0 → без змін. Запис відповіді не змінюється. Підстава `away` → штрафу немає (задачі 3, 4).
3. **Ліміт.** 2 на учасника. Рахується відкрита. Не рахуються `host` і `cancelled`. Одна апеляція на запитання. Одна відкрита в грі (задачі 3, 4).
4. **Плин гри.** «Далі» → `appeal_open`. Пауза зупиняє відлік. «Завершити раунд / гру» і вилучення діють одразу. Оцінка «Правильно» закриває з `host` (задача 4).
5. **Автопілот.** Розкриття ≥ 8 с, якщо є кому оскаржити. Чекає голосування. +3 с після рішення. Без апеляцій час той самий (задача 5).
6. **Скасування й штраф.** Рядок «(апеляція)» під своїм запитанням, схований до кінця розкриття. Скасування відповіді знімає й апеляцію. Штраф за вихід знімає й бали апеляції. Σ рядків = рахунок (задачі 4, 7).
7. **Стан і база.** Версія 18, 17 читається. Міграція `0016` лише додає таблицю (задачі 3, 7, 8).
8. **Вигляд.** Картка на сцені 1280 × 720 не зсуває розкриття й не прокручується. Аркуш на 375 px не налазить на результат. Кнопка пульта «Голосує зал» у шапці не ламає один рядок. Кадри `p12f-*`.

---

### Задача 1. Shared: сталі, джерело `appeal`, помилки, події, час автопілота

**Files:**
- Create: `packages/shared/src/appeal.ts`, `packages/shared/src/appeal.test.ts`
- Modify: `packages/shared/src/index.ts` (`export * from './appeal';`), `game.ts`, `breakdown.ts`, `undo.ts`, `events.ts`, `autopilot.ts`; `apps/web/src/i18n.ts`
- Test: `appeal.test.ts`, `breakdown.test.ts`, `undo.test.ts`

**Interfaces:**
- `packages/shared/src/appeal.ts`:
  ```ts
  import type { RoundType } from './quiz';

  /** Апеляція (12f): скільки триває голосування залу, мс. */
  export const APPEAL_MS = { vote: 30_000 } as const;
  /** Скільки апеляцій за гру має гравець (у командній грі — команда); відкрита рахується, закрита ведучим чи кінцем — ні. */
  export const APPEALS_PER_GAME = 2;
  /** Раунди, де можна оскаржити: класика й звичайна клітинка поля. */
  export const APPEAL_ROUNDS: readonly RoundType[] = ['classic', 'board'];
  /** Скільки голосів player:appeal-vote людина може надіслати за секунду; понад — too_soon. */
  export const APPEAL_VOTES_PER_SECOND = 4;

  /** Підстава: grade — відповідь не зарахували повністю; away — штраф за вихід із гри (12e). */
  export const APPEAL_REASONS = ['grade', 'away'] as const;
  export type AppealReason = (typeof APPEAL_REASONS)[number];
  /** Рішення: yes — «так» > «ні»; no — «ні» > «так»; tie — нарівно (і 0 : 0); host — ведучий зарахував сам; cancelled — завершення раунду чи гри, вилучення. */
  export const APPEAL_OUTCOMES = ['yes', 'no', 'tie', 'host', 'cancelled'] as const;
  export type AppealOutcome = (typeof APPEAL_OUTCOMES)[number];

  /** Проста більшість тих, хто не оскаржує: yes > no → 'yes', no > yes → 'no', інакше 'tie'. */
  export function appealDecision(yes: number, no: number): 'yes' | 'no' | 'tie';
  /** Чи рахується апеляція в ліміт: відкрита (null) і рішення залу — так; host і cancelled — ні. */
  export function appealCounted(outcome: AppealOutcome | null): boolean;
  ```
- `game.ts`:
  - `AdjustmentSource` + рядок
    ```ts
      /** Рішення залу за апеляцією (12f): бали «правильно» мінус бали запису (чи зняття вже дописаного штрафу); запитання — afterQuestion − 1. */
      | 'appeal';
    ```
  - `ErrorCode` + чотири коди з JSDoc:
    - `appeal_open` — «Апеляція (12f): зал ще голосує — «Далі» й нова апеляція чекають»;
    - `appeals_used` — «Апеляція (12f): ліміт на гру вичерпано»;
    - `appeal_unfit` — «Апеляція (12f): цю відповідь чи цей раунд оскаржити не можна»;
    - `no_voters` — «Апеляція (12f): голосувати нікому».
- `breakdown.ts`: `SCORE_SOURCES = ['answers', 'final', 'duel', 'debuff', 'host', 'undo', 'away', 'appeal', 'wipeout', 'survival', 'ladder']`; `ADJUSTMENT_SOURCES` + `appeal: 'appeal'`.
- `undo.ts`: `UNDOABLE_SOURCES = ['host', 'away', 'appeal']`; коментар «12f допише 'appeal'» прибрати.
- `events.ts`:
  ```ts
  /** Апеляція (12f): підстава; хто оскаржує — з ідентичності сокета (у командній грі — капітан). */
  export const appealSchema = z.object({ reason: z.enum(APPEAL_REASONS) });
  /** Голос в апеляції (12f): номер апеляції (щоб голос не впав на новішу) і «так» / «ні»; змінити можна до кінця. */
  export const appealVoteSchema = z.object({ appealId: z.number().int().min(1), yes: z.boolean() });
  ```
  `ClientToServerEvents`, після `'player:away'`:
  ```ts
  /** Апеляція (12f): гравець (капітан) просить зал зарахувати відповідь чи зняти штраф за вихід. */
  'player:appeal': (payload: z.infer<typeof appealSchema>, ack: Ack) => void;
  /** Апеляція (12f): голос людини «так» / «ні»; імена голосів не бачить ніхто. */
  'player:appeal-vote': (payload: z.infer<typeof appealVoteSchema>, ack: Ack) => void;
  ```
- `autopilot.ts`, `AUTOPILOT_MS` (після `retry`):
  ```ts
    /** Апеляція (12f): розкриття триває щонайменше стільки, якщо хтось ще може оскаржити. */
    appealWindow: 8000,
    /** Апеляція (12f): після рішення залу розкриття стоїть ще стільки. */
    appealShown: 3000,
  ```
- `apps/web/src/i18n.ts` (уже тут, бо `Record<ScoreSource, …>` і тексти помилок):
  ```ts
  scoreSource_appeal: 'Апеляція',
  err_appeal_open: 'Зал ще голосує.',
  err_appeals_used: 'Апеляцій більше немає.',
  err_appeal_unfit: 'Цю відповідь оскаржити не можна.',
  err_no_voters: 'Нема кому голосувати.',
  ```

- [ ] **Step 1: Write the failing tests**
  - `appeal.test.ts`:
    ```ts
    import { describe, expect, it } from 'vitest';
    import { APPEAL_MS, APPEALS_PER_GAME, appealCounted, appealDecision } from './appeal';

    describe('appeal basics (12f)', () => {
      it('a simple majority of the voters decides; a tie and no votes keep the result', () => {
        expect(appealDecision(2, 0)).toBe('yes');
        expect(appealDecision(2, 1)).toBe('yes');
        expect(appealDecision(1, 2)).toBe('no');
        expect(appealDecision(1, 1)).toBe('tie');
        expect(appealDecision(0, 0)).toBe('tie');
      });
      it('an open appeal and every hall decision count toward the limit; the host and the end do not', () => {
        expect([null, 'yes', 'no', 'tie'].map((o) => appealCounted(o as never))).toEqual([true, true, true, true]);
        expect(appealCounted('host')).toBe(false);
        expect(appealCounted('cancelled')).toBe(false);
        expect([APPEAL_MS.vote, APPEALS_PER_GAME]).toEqual([30_000, 2]);
      });
    });
    ```
  - `breakdown.test.ts`: перелік `SCORE_SOURCES` з `'appeal'` після `'away'`; `adjustmentSource('appeal')` → `'appeal'`.
  - `undo.test.ts`: `UNDOABLE_SOURCES` → `['host', 'away', 'appeal']`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared` → FAIL.
- [ ] **Step 3: Implement.** JSDoc українською на кожному експорті.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src apps/web/src/i18n.ts
  git commit -m "feat(shared): appeal basics — 30 s vote, two appeals a game, classic and board only, the grade and away reasons, the simple-majority decision with a tie keeping the result, the appeal adjustment source in the breakdown and the undo sheet, four new error codes, the player:appeal and player:appeal-vote events and the autopilot reveal window
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 2. Shared: поля зрізів, історії й цікавинок; заглушки й фікстури

**Files:**
- Modify: `packages/shared/src/views.ts`, `history.ts`, `facts.ts`; заглушки — `packages/engine/src/views.ts`, `undo.ts`, `facts.ts`, `apps/server/src/history.ts`
- Modify (фікстури): див. «Порядок збирання» і все, на що вкаже `pnpm typecheck`
- Test: `packages/shared/src/facts.test.ts`

**Interfaces:**
- `packages/shared/src/views.ts`:
  - нові `AppealView` і `PlayerAppeal` — дослівно з рішень плану («Хто що бачить»), з JSDoc на кожному полі;
  - `BaseView` (після `facts`):
    ```ts
    /** Апеляція (12f): остання на поточному запитанні на етапі reveal (відкрита чи з рішенням); інакше null. Лише лічильники, без імен голосів. */
    appeal: AppealView | null;
    ```
  - `PlayerView.me` (після `vote`):
    ```ts
    /** Своя апеляція (12f) на reveal: кнопки, ліміт, свій голос; людина, не команда; інакше null. */
    appeal: PlayerAppeal | null;
    ```
  - `UndoRow.kind: 'answer' | 'host' | 'away' | 'appeal';` (JSDoc: «appeal — рішення залу, ціль { seq }»).
- `packages/shared/src/history.ts`:
  ```ts
  /** Апеляція до відповіді в історії (12f). */
  export interface GameAppeal {
    reason: AppealReason;
    yes: number;
    no: number;
    /** Без cancelled: таку історія не показує. */
    outcome: Exclude<AppealOutcome, 'cancelled'>;
  }
  ```
  `GameResponse` + `/** Апеляція учасника до цього запитання (12f), на першому рядку його відповіді; null — не було чи стара гра. */ appeal: GameAppeal | null;`
- `packages/shared/src/facts.ts`:
  - `FactInput` + `/** Раховані апеляції з рішенням залу (12f): учасник рушія й рішення. */ appeals: { playerId: string; outcome: 'yes' | 'no' | 'tie' }[];`
  - `GameCard` + `/** Апеляції учасника (12f): won — зал зарахував; lost — «ні» чи нічия. */ appeals: { won: number; lost: number };`
  - `gameCard`: `appeals: { won: own.filter((a) => a.outcome === 'yes').length, lost: own.filter((a) => a.outcome !== 'yes').length }`, де `own = input.appeals.filter((a) => a.playerId === playerId)`.
- Заглушки до задач 4–7:
  - `packages/engine/src/views.ts`: `base` — `appeal: null`; `buildOwnView`, `lobbyView` — `me.appeal: null`;
  - `undo.ts` — без змін (`kind` ще без `'appeal'`);
  - `facts.ts`, `factInput` — `appeals: []`;
  - `apps/server/src/history.ts` — `appeal: null` у `responsesOf`, `appeals: []` у `factInputOf`.

- [ ] **Step 1: Write the failing test.** У `packages/shared/src/facts.test.ts`: `gameCard` з `appeals: [{ playerId: 'o', outcome: 'yes' }, { playerId: 'o', outcome: 'tie' }, { playerId: 'p', outcome: 'no' }]` → в Олі `appeals: { won: 1, lost: 1 }`, у Петра `{ won: 0, lost: 1 }`, в Іри `{ won: 0, lost: 0 }`.
- [ ] **Step 2: Run** `pnpm typecheck` → FAIL (фікстури), `pnpm vitest run --maxWorkers=2 packages/shared/src/facts.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Нові поля обов'язкові. Фікстури — значеннями з «Порядку збирання». Логіки поза `gameCard` не додавати.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=1 apps/server && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages apps/server/src apps/web/src
  git commit -m "feat(shared): the appeal card for every role with counts only, the own appeal state on the phone, the appeal undo row kind, the appeal beside history answers and the won and lost appeals in the game card, with empty stubs until the engine and the history fill them
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 3. Рушій: стан `appeals`, відкриття, голос, рішення й версія 18

**Files:**
- Create: `packages/engine/src/appeal.ts`, `packages/engine/src/appeal.test.ts`
- Modify: `packages/engine/src/game.ts`, `restore.ts`, `restore.test.ts`, `index.ts` (`export * from './appeal';`)

**Interfaces:**
- `game.ts`: `export interface Appeal` — дослівно з рішень плану («Стан»), з JSDoc на кожному полі. `GameState` (після `autopilot`):
  ```ts
  /** Апеляції гри (12f) у порядку відкриття; немає ключа — не було жодної. Голоси (votes) у зрізи не йдуть. */
  appeals?: Appeal[];
  ```
- `restore.ts`:
  - коментар версії: `* 18 — 12f: GameState.appeals (апеляції й голоси залу), значення AdjustmentSource 'appeal'.`;
  - `GAME_STATE_VERSION = 18`;
  - пояснення: `* 17 → 18 лише додала необов'язкове GameState.appeals (і значення AdjustmentSource 'appeal'), а стан версій 2–17 не може містити апеляцій: тож кімната, збережена до розгортання 12f, теж відновлюється.`;
  - `READABLE_STATE_VERSIONS = [2, …, 16, 17, GAME_STATE_VERSION]`.
- `appeal.ts` (імпортує `game.ts` під час виклику, як `votes.ts`; ще `teams.ts`, `present.ts`, `team-act.ts`, `away.ts`, `adjust.ts`, `buffs.ts` для `questionFor`):
  ```ts
  /** Відкрита апеляція (outcome null); null — немає. */
  export function appealOpen(state: GameState): Appeal | null;
  /** Остання апеляція на поточному запитанні на етапі reveal; інакше null. */
  export function lastAppeal(state: GameState): Appeal | null;
  /** Скільки апеляцій ще має учасник рушія: APPEALS_PER_GAME − раховані (appealCounted). */
  export function appealsLeft(state: GameState, participant: string): number;
  /** Хто голосує в апеляції учасника by: присутні люди, крім by (у командній грі — люди інших команд). */
  export function appealVoters(state: GameState, by: string): string[];
  /** Скільки дасть «так» за оцінку: бали override(…, 'correct') мінус бали запису на поточному запитанні; не вийшло — 0. */
  export function appealPoints(state: GameState, participant: string): number;
  /** Сума нескасованих коригувань 'appeal' учасника під запитанням q (afterQuestion − 1 === q). */
  export function appealAdjustmentTotal(state: GameState, participant: string, q: number): number;
  /** Підстави, з якими учасник може оскаржити поточне запитання (лише придатність відповіді, без ліміту, відкритої апеляції й виборців). */
  export function appealReasons(state: GameState, participant: string): AppealReason[];
  /** Хтось ще може відкрити апеляцію: придатна підстава, ліміт є, відкритої немає, голосувати є кому. */
  export function appealPossible(state: GameState): boolean;
  /** «так» і «ні» апеляції: лише голоси людей, що є в грі. */
  export function appealTally(state: GameState, appeal: Appeal): { yes: number; no: number };
  /** Відкрити апеляцію (personId — соло-гравець чи учасник команди, тоді лише капітан). Коди — план 12f, «Порядок перевірок openAppeal». */
  export function openAppeal(state: GameState, personId: string, reason: AppealReason, now: number): Result;
  /** Голос людини в апеляції appealId; останній голос присутніх закриває її рішенням. Коди — план 12f, «Голос». */
  export function castAppealVote(state: GameState, personId: string, appealId: number, yes: boolean, now: number): Result;
  /** Рішення відкритої апеляції зараз (план 12f, «Рішення»); немає відкритої — той самий об'єкт. */
  export function decideAppeal(state: GameState, now: number): GameState;
  ```
  - Відкрита апеляція оновлюється через внутрішню `withAppeal(state, appeal)` (заміна за `id`).
  - `appealReasons` і `openAppeal` — за рішеннями плану («Коли й що можна оскаржити», «Порядок перевірок»).
  - `appealPoints` викликає `override` з `game.ts`. Результат `override` у стан не потрапляє (серія й рахунок не змінюються).

- [ ] **Step 1: Write the failing tests** (`appeal.test.ts`).
  - Стан: `const t100 = withPoints(text, 100);` і `startRound(lobbyWith(makeRoundsQuiz([classicRound('r1', [t100, withId(t100, 't2'), withId(t100, 't3')], { speedBonus: false, rules: DEFAULT_RULES })], { leaderboard: 'each' }), 'Оля', 'Петро', 'Іра'), T0, rng)` з `./testing/helpers` і `./testing/fixtures` (у фікстурі `text` — 1000 балів, тож ціна явна).
  - Оля відповідає «Одеська» (неправильно), Петро й Іра — «Одеса».
  - Далі `lock` → `next` → `reveal`.
  ```ts
  it('two yes votes out of two add the right-answer points as an appeal adjustment and leave the record', () => {
    let s = must(openAppeal(reveal, 'p1', 'grade', T1));
    expect(appealOpen(s)).toMatchObject({ id: 1, by: 'p1', questionIndex: 0, reason: 'grade', endsAt: T1 + 30_000, outcome: null });
    s = must(castAppealVote(s, 'p2', 1, true, T1 + 1000));
    expect(appealOpen(s)).not.toBeNull();
    s = must(castAppealVote(s, 'p3', 1, true, T1 + 2000));
    expect(s.appeals?.[0]).toMatchObject({ outcome: 'yes', adjustmentSeq: 1 });
    expect(s.adjustments).toEqual([expect.objectContaining({ playerId: 'p1', points: 100, source: 'appeal', afterQuestion: 1, roundIndex: 0 })]);
    expect(recordOf(s, 0, 'p1')).toEqual(recordOf(reveal, 0, 'p1'));
    expect(s.players.find((p) => p.id === 'p1')?.score).toBe(100);
  });
  ```
  Окремі `it`:
  - **рішення:** 1 : 1 → `tie`, без коригування; 0 : 0 після `decideAppeal(s, T1 + 30_000)` → `tie`; 1 : 2 → `no`;
  - **зміна голосу:** Іра «ні», потім «так», потім Петро «так» → `yes`; лічильник на кожному кроці — `appealTally`;
  - **часткова:** з `rules.partial` і `override(…, 'partial')` на розкритті підстава `grade` є; `appealPoints` = повні − часткові;
  - **неприйнятне:** правильна відповідь, немає відповіді, `questionIndex` уже оскаржено, бліц, фінал, «Ва-банк», «Мільйонер», «Вибування», ланцюжок, блеф, опитування, бліц-клітинка поля, чужа клітинка поля, усна клітинка без відповіді з телефона → `appeal_unfit`;
  - **поле:** звичайна клітинка, той, хто вибрав, відповів неправильно (штраф `minus`) → `appealPoints` = повна ціна клітинки + модуль штрафу; голосують усі, крім нього;
  - **ліміт:** дві апеляції Олі на t1 і t2 (обидві `tie`) → на t3 `appeals_used`; `appealsLeft` 2 → 1 → 0;
  - **одна за раз:** Оля відкрила, Петро на тому самому запитанні → `appeal_open`; після рішення — може (якщо підходить);
  - **виборці:** Петро поза зв'язком і не в `awaiting` → виборець лише Іра, її голос закриває; усі, крім Олі, поза зв'язком → `no_voters`;
  - **голоси:** Оля голосує за себе → `vote_denied`; неіснуюча людина → `not_found`; `appealId: 2` → `vote_closed`; на паузі → `paused`; після рішення → `vote_closed`;
  - **етап і пауза:** `openAppeal` на `locked` → `wrong_phase`, на паузі → `paused`;
  - **команди:** `teamGame(teamQuiz([classicRound(…)]), [['Оля', 'Петро'], ['Віра', 'Іра']])` (`./testing/teams`):
    - відкриває лише капітан (некапітан → `not_captain`);
    - `by` — команда `t1`;
    - виборці — `m3`, `m4` (свої `m1`, `m2` → `vote_denied`);
    - «так» → коригування команди `t1`;
  - **підстава `away`:** вікторина з `awayPenalty: true`, Оля відповіла правильно й виходила 3500 мс (`awayStart` / `awayEnd` із `./away`):
    - `appealReasons` → `['away']`;
    - «так» → коригування немає, `outcome: 'yes'`;
    - перевірку «штраф не дописується» робить задача 4.
  - `restore.test.ts`:
    - запис `KEYS[18]`;
    - `Appeal: keysOf<Appeal>()(['id', 'by', 'questionIndex', 'reason', 'openedAt', 'endsAt', 'votes', 'outcome', 'adjustmentSeq'], true)` у `STATE_SHAPE` і `'appeals'` у `GameState`;
    - `representative()` + стан з закритою (`adjustmentSeq`) і відкритою апеляцією, `add('Appeal', s.appeals ?? [])`;
    - стан версії 17 читається;
    - стан з відкритою апеляцією переживає `roundTrip` і `suspend` (на паузі, `endsAt` той самий).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/appeal.test.ts packages/engine/src/restore.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Перевірити пошуком, що `game.ts` імпортує з `appeal.ts` лише те, що викликає під час виклику (задача 4), а `appeal.ts` не імпортує `views.ts`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine/src
  git commit -m "feat(engine): the player appeal (state version 18, version 17 still restores) — the player or captain opens a 30 s hall vote on an unaccepted classic or board answer or on a coming away penalty, everyone present but the appellant's side votes and may change the vote, a simple majority adds the right-answer points as an appeal adjustment while a tie keeps the result, one open appeal at a time and two a game
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 4. Рушій: «Далі», годинник, пауза, ведучий, завершення, штраф, скасування, цікавинки

**Files:**
- Create: `packages/engine/src/appeal.flow.test.ts`
- Modify: `packages/engine/src/game.ts`, `blitz.ts`, `appeal.ts`, `away.ts`, `undo.ts`, `facts.ts`
- Test: `appeal.flow.test.ts`, `away.penalty.test.ts`, `views.undo.test.ts`, `facts.test.ts`

**Interfaces:**
- `appeal.ts`:
  ```ts
  /** Відкрита апеляція, чий час сплив (now ≥ endsAt, не пауза) → рішення; інакше той самий об'єкт. */
  export function closeDueAppeal(state: GameState, now: number): GameState;
  /** Кінець відкритої апеляції для nextDeadline: endsAt, якщо не пауза й endsAt > now; інакше null. */
  export function appealDeadline(state: GameState, now: number): number | null;
  /** Після паузи: endsAt відкритої апеляції + shift; без відкритої — той самий об'єкт. */
  export function shiftAppealClock(state: GameState, shift: number): GameState;
  /** Відкрита апеляція → outcome 'cancelled' (не рахується в ліміт); інакше той самий об'єкт. */
  export function cancelAppeal(state: GameState): GameState;
  /** Оцінка ведучого: відкрита апеляція grade учасника participant і grade 'correct' → outcome 'host'; інакше той самий об'єкт. */
  export function closeAppealByHost(state: GameState, participant: string, grade: Grade): GameState;
  /** Вилучення: людина зникає з голосів; відкрита апеляція учасника, якого вже немає в players, → 'cancelled'. */
  export function dropFromAppeals(state: GameState, removedId: string): GameState;
  ```
- `game.ts`:
  - `next`: одразу після перевірки паузи — `if (appealOpen(state) !== null) return fail('appeal_open');`. Це раніше за дуель, «100 до 1» і блеф.
  - `tick`: перед `if (state.phase !== 'question' || state.paused)` — `if (state.phase === 'reveal') return state.paused ? state : closeDueAppeal(state, now);`.
  - `resume`: у ланцюжку повернення — `shiftAppealClock(…, now − pausedAt)` (поруч зі `shiftSplash`).
  - `override`: наявне тіло → внутрішня `overrideGrade`; публічна `override` повертає `result.ok ? ok(closeAppealByHost(result.state, target, grade)) : result`, де `target = active?.board?.chooserId ?? playerId` (як уже рахує тіло).
  - `removePlayer`: успішний результат → `ok(dropFromAppeals(result.state, playerId))`.
  - `endRound` і `end`: першим рядком `state = cancelAppeal(state)` (до `decisionOpen` / `dropUnstarted`).
- `blitz.ts`, `nextDeadline`: перед рядком `if (state.phase !== 'question' || state.paused || state.heldAt !== null) return null;` — `if (state.phase === 'reveal') return appealDeadline(state, now);`.
- `away.ts`:
  - `awayPenalized`: пропускає учасника, у якого є апеляція `{ reason: 'away', questionIndex: q, outcome: 'yes' }` у `state.appeals` (читання напряму, без імпорту `appeal.ts`);
  - `withPenalties`: `points = (recordOf(s, q, participant)?.points ?? 0) + appealTotal(s, participant, q)`, де `appealTotal` — та сама сума нескасованих `appeal`, що й `appealAdjustmentTotal`. Щоб не імпортувати `appeal.ts`, внутрішня функція в `away.ts` з `undoLedger`, як `penaltyUndone`. `appeal.ts` реекспортує її як `appealAdjustmentTotal`.
- `undo.ts`:
  - `kind`: `adjustment.source === 'away' ? 'away' : adjustment.source === 'appeal' ? 'appeal' : 'host'`;
  - `openPenalties` → `openRiders`: джерела `'away'` і `'appeal'`;
  - `penaltyRedos`: `target?.source === 'away' || target?.source === 'appeal'`.
- `facts.ts`, `factInput`: `appeals` — `(state.appeals ?? [])` з `outcome` `yes` / `no` / `tie` і `by` серед `state.players`, `{ playerId: by, outcome }`.

- [ ] **Step 1: Write the failing tests** (`appeal.flow.test.ts`; стан і відповіді — як у задачі 3):
  ```ts
  it('«Далі» waits for the hall: appeal_open while the vote is open, then the reveal moves on', () => {
    const s = must(openAppeal(reveal, 'p1', 'grade', T1));
    expect(next(s, T1 + 1000, rng)).toEqual({ ok: false, error: 'appeal_open' });
    const closed = tick(s, T1 + 30_000);
    expect(closed.appeals?.[0].outcome).toBe('tie');
    expect(must(next(closed, T1 + 30_001, rng)).phase).toBe('leaderboard');
  });
  ```
  Окремі `it`:
  - **годинник:** `nextDeadline(s, T1)` → `T1 + 30_000`; без апеляції на розкритті → `null`; на паузі → `null`;
  - **пауза:** `pause` у `T1 + 5000`, `resume` у `T1 + 65_000` → `endsAt` = `T1 + 90_000`; `tick` у `T1 + 60_000` на паузі нічого не закриває;
  - **оцінка ведучого:** `override(s, 'p1', 'correct')` → `outcome: 'host'`, ліміт Олі знову 2, коригування `appeal` немає (бали — через запис); `override(s, 'p1', 'partial')` (з `partial`) → голосування триває;
  - **завершення:** `endRound(s, …)` і `end(s, …)` → `outcome: 'cancelled'`, ліміт не зменшено;
  - **вилучення:** Олю вилучено → `cancelled`; Іру вилучено → її голос зник, `appealTally` без неї;
  - **дуель на розкритті:** Петро оголосив дуель, апеляція відкрита → `next` → `appeal_open` (дуель не стартує);
  - **штраф за вихід (`away.penalty.test.ts`, нові `it`):**
    - апеляція `away` з `yes` → на виході з розкриття штрафу немає, `ownAway(…).penalty` → `false`, `awayPenalized` без Олі;
    - апеляція `away` з `no` → штраф є;
    - апеляція `grade` з `yes` (+100) і вихід 3500 мс → штраф `−(0 + 100)`, рахунок за запитання 0;
  - **скасування (`views.undo.test.ts`):**
    - після апеляції `yes` і виходу з розкриття аркуш має рядок `{ kind: 'appeal', points: 100, target: { seq } }` під своїм запитанням (до виходу з розкриття — немає);
    - `undoScore({ seq })` → бали повертаються, «Повернути» повертає;
    - `undoScore({ question: 0, playerId: 'p1' })` (Оля з частковою відповіддю й апеляцією) знімає і відповідь, і апеляцію: рахунок за запитання 0; «Повернути» повертає обидва;
  - **цікавинки (`facts.test.ts`):** `factInput(s).appeals` → `[{ playerId: 'p1', outcome: 'yes' }]`; `host` і `cancelled` — немає.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/appeal.flow.test.ts packages/engine/src/away.penalty.test.ts packages/engine/src/views.undo.test.ts packages/engine/src/facts.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Наявні тести `away.penalty.test.ts` мають лишитися зеленими без змін.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine/src
  git commit -m "feat(engine): the appeal holds the reveal — «Далі» answers appeal_open, the vote closes by itself at its end and a pause stops its clock, the host's «correct» closes it as «Ведучий зарахував», ending the round or game or kicking the appellant cancels it without using the limit, a passed away appeal drops the coming penalty while the penalty also takes the appeal points, the appeal is an undoable row that goes with its answer, and the facts count won and lost appeals
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 5. Рушій: автопілот чекає апеляцію

**Files:**
- Create: `packages/engine/src/autopilot.appeal.test.ts`
- Modify: `packages/engine/src/autopilot.ts`; наявні тести автопілота (див. «Порядок збирання»)

**Interfaces:**
- `autopilot.ts`:
  - `moveOf`, `case 'reveal'` — за рішеннями плану («Автопілот»):
    ```ts
    case 'reveal': {
      // Апеляція (12f): голосування закриває tick рушія; після рішення — ще appealShown; поки хтось може оскаржити — не менше appealWindow від початку розкриття.
      if (appealOpen(state) !== null) return null;
      const decided = lastAppeal(state) !== null;
      const base = from + (decided ? AUTOPILOT_MS.appealShown : revealMs(state));
      const window = appealPossible(state) ? (state.stepAt ?? from) + AUTOPILOT_MS.appealWindow : 0;
      return nextAt(Math.max(base, window));
    }
    ```
  - `pilotKey` + частина `appealKey(state)`:
    ```ts
    /** Підкрок апеляції (12f): кількість апеляцій на поточному запитанні й рішення останньої ('open' — відкрита). */
    function appealKey(state: GameState): string;
    ```

- [ ] **Step 1: Write the failing tests** (`autopilot.appeal.test.ts`, за зразком `autopilot.test.ts`: `begin`, `go`, `atOf`, `answerAll`, `RIGHT` / `WRONG` або `wrongAnswer` з `./testing/autopilot`):
  - **хтось може оскаржити:** класика, автор Оля й Петро, Петро відповів неправильно → розкриття до `t + 1500 + 8000` (а не 6000);
  - **ніхто:** усі правильно → `t + 1500 + 6000` (як раніше);
  - **ліміт вичерпано:** у Петра 0 апеляцій → 6000;
  - **чекає голосування:** Петро відкрив апеляцію на 2-й секунді розкриття → `autopilot.at === null`; голос Олі закриває → `at = мить рішення + 3000`, але не раніше `початок розкриття + 8000`;
  - **сплив час:** ніхто не голосує → `tick` у `endsAt` закриває (`tie`) → `at = endsAt + 3000`;
  - **пауза автора** під час голосування: `authorPause` → `endsAt` стоїть; `authorResume` → голосування триває з того самого залишку;
  - **`pilotKey`** змінюється на відкритті й на рішенні.
  - Наявні тести: правки лише за «Порядком збирання»; кожну перелічити у звіті.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/autopilot.appeal.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine/src
  git commit -m "feat(engine): with no host the reveal lasts at least 8 s while someone can still appeal, the bot waits for an open hall vote and keeps the result on screen 3 s more, and reveals with nothing to appeal keep their old timing
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 6. Рушій: картка апеляції для всіх ролей і своя апеляція телефона

**Files:**
- Create: `packages/engine/src/views.appeal.test.ts`
- Modify: `packages/engine/src/views.ts`, `appeal.ts`
- Test: `views.appeal.test.ts`

**Interfaces:**
- `appeal.ts`:
  ```ts
  /** Картка апеляції (12f) для сцени, пульта й телефонів: lastAppeal на reveal; лічильники без імен; null — немає. */
  export function appealView(state: GameState): AppealView | null;
  /** Своя апеляція людини (personId) її учасника рушія (participant) на reveal; інакше null. */
  export function playerAppeal(state: GameState, personId: string, participant: string): PlayerAppeal | null;
  ```
  - `appealView.points`:
    - відкрита `grade` — `appealPoints`;
    - відкрита `away` — бали, які зніме штраф: `record.points + appealAdjustmentTotal`;
    - `yes` — бали коригування за `adjustmentSeq` (`grade`) чи бали, які зняв би штраф (`away`);
    - решта — 0.
  - `appealView.waiting` — присутні виборці без голосу (відкрита), інакше 0.
  - `appealView.question` — `questionFor(state, play, by)`.
  - `playerAppeal`:
    - `reasons` порожні, якщо є відкрита апеляція, ліміт вичерпано, голосувати нікому чи людина — не капітан у командній грі;
    - `block` — за рішеннями плану (`'captain'` має перевагу над `'no_voters'`);
    - `voter` і `vote` — за відкритою апеляцією.
- `views.ts`:
  - `base` — `appeal: appealView(state)`;
  - `playerView`:
    - соло — `me: { ...view.me, appeal: playerAppeal(state, playerId, playerId) }`;
    - командна гра — `playerAppeal(state, member.id, member.teamId)` поверх спільного `ownView`, як `vote`.

- [ ] **Step 1: Write the failing tests** (`views.appeal.test.ts`):
  - **кнопка:** на розкритті Оля (неправильно) — `me.appeal` = `{ left: 2, reasons: ['grade'], block: null, voter: false, vote: null }`; Петро (правильно) — `reasons: []`, `block: null`; на `locked` і на таблиці — `me.appeal` `null`;
  - **нема кому:** Петро й Іра поза зв'язком → в Олі `reasons: []`, `block: 'no_voters'`;
  - **капітан:** у командній грі некапітан `m2` — `reasons: []`, `block: 'captain'`; капітан `m1` — `['grade']`;
  - **відкрита:** у стані з голосом Петра «так»:
    - картка `stageView(s).appeal` — `{ by: { playerId: 'p1', nickname: 'Оля' }, reason: 'grade', answer: { type: 'text', value: 'Одеська' }, yes: 1, no: 0, waiting: 1, outcome: null, endsAt: T1 + 30_000, remainingMs: null, points: 100 }`;
    - `hostView(s).appeal` — те саме;
    - Петро — `me.appeal.voter: true, vote: true`; Іра — `voter: true, vote: null`; Оля — `voter: false`, `reasons: []`;
  - **пауза:** `endsAt: null`, `remainingMs` = залишок;
  - **таємність:**
    - для сцени, пульта й кожного телефона `JSON.stringify(view.appeal)` не містить `'p2'`, `'p3'`, `'Петро'`, `'Іра'` (у командній грі — id і нікнеймів людей);
    - ключа `votes` немає ніде в зрізі (`JSON.stringify(view)` не містить `"votes"`);
    - зріз Іри не містить голосу Петра;
  - **рішення:** після `yes` — `outcome: 'yes', points: 100, endsAt: null, waiting: 0`; на таблиці — `appeal: null`;
  - **підстава `away`:** `answer: null`, `points` = бали, які зняв би штраф.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/views.appeal.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Заглушки задачі 2 замінити.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine/src
  git commit -m "feat(engine): every role gets the same appeal card with the answer, the right answer, the yes, no and still-thinking counts, the countdown and the result, never a voter name; the phone gets its own buttons, the left count, «no one to vote» and «the captain appeals», and only its own vote
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 7. Сервер: міграція `0016`, запис і читання апеляцій

**Files:**
- Create: `apps/server/drizzle/0016_appeal.sql` (+ `apps/server/drizzle/meta/_journal.json`, `0016_snapshot.json`), `apps/server/src/history.appeal.test.ts`
- Modify: `apps/server/src/db/schema.ts`, `recorder.ts`, `history.ts`
- Test: `history.appeal.test.ts`, `recorder.test.ts`

**Interfaces:**
- `schema.ts` (після `scoreAdjustment`):
  ```ts
  /** Апеляція гравця (12f): закрита апеляція з лічильником голосів і рішенням; голоси людей не зберігаються. */
  export const appeal = pgTable(
    'appeal',
    {
      gameId: uuid('game_id').notNull().references(() => game.id, { onDelete: 'cascade' }),
      /** Номер апеляції в грі (Appeal.id). */
      seq: integer('seq').notNull(),
      participantId: uuid('participant_id').notNull().references(() => participant.id, { onDelete: 'cascade' }),
      /** Індекс у game.plays. */
      questionIndex: integer('question_index').notNull(),
      reason: text('reason').$type<AppealReason>().notNull(),
      yes: integer('yes').notNull(),
      no: integer('no').notNull(),
      outcome: text('outcome').$type<AppealOutcome>().notNull(),
      /** seq коригування 'appeal'; null — рішення його не дописало. */
      adjustmentSeq: integer('adjustment_seq'),
    },
    (table) => [primaryKey({ columns: [table.gameId, table.seq] })],
  );
  ```
- Міграцію згенерувати з теки `apps/server`: `pnpm exec drizzle-kit generate --name appeal`. Перший рядок — коментар, як у `0015_answer_away.sql`: `-- Апеляція гравця (план 12f): закриті апеляції з лічильником «так / ні» і рішенням, для історії й ачівок.` Решта — те, що згенерував drizzle-kit (`CREATE TABLE "appeal" …` і два зовнішні ключі).
- `recorder.ts`:
  - `signature` + `state.appeals?.map((a) => a.outcome ?? 'open') ?? null`;
  - у `save` після коригувань:
    ```ts
    // Апеляції (12f): лише закриті й лише учасників, що є в грі (вилучених прибирає каскад); закрита незмінна.
    const closedAppeals = (state.appeals ?? []).filter((a) => a.outcome !== null && state.players.some((p) => p.id === a.by));
    if (closedAppeals.length > 0) await tx.insert(appeal).values(closedAppeals.map((a) => ({ gameId: snapshot.id, seq: a.id, participantId: a.by, questionIndex: a.questionIndex, reason: a.reason, ...appealTally(state, a), outcome: a.outcome!, adjustmentSeq: a.adjustmentSeq ?? null }))).onConflictDoNothing();
    ```
- `history.ts`:
  - у `hostGameWithFacts` — вибірка `appeal` за `gameId`;
  - `responsesOf` отримує `appeals` і ставить `appeal` на перший (найменший `attempt ≥ 0`) рядок учасника на запитання (без `cancelled`);
  - `factInputOf` → `appeals`: рядки з `outcome` `yes` / `no` / `tie` учасників таблиці.

- [ ] **Step 1: Write the failing tests** (`history.appeal.test.ts`; підготовка — як у `history.away.test.ts`: `createTestDb`, `buildApp`, `signUp`, `ctx.manager`, `recorder.idle()`):
  - **запис і читання:**
    - гра з трьома гравцями: Оля відповідає неправильно й оскаржує (`manager.appeal`, задача 8; якщо задачі 8 ще немає — `room.state = must(openAppeal(…))` через `commit`-подібний шлях, як 12e робив з `awayStart`), Петро й Іра «так»;
    - далі «Далі» до `finished`;
    - `detail.questions[0].responses` Олі має `appeal: { reason: 'grade', yes: 2, no: 0, outcome: 'yes' }`, у Петра — `null`;
    - коригування `{ source: 'appeal', points: 100 }` є в `detail.adjustments`;
    - розбивка Олі має `appeal: { plus: 100 }`;
  - **нічия:** друга апеляція 1 : 1 → `appeal: { …, outcome: 'tie' }` і без коригування;
  - **Σ рядків = рахунок:** Σ `answer.points` + Σ `score_adjustment.points` = `participant.score` після апеляції й після `host:undo { seq }` її рядка;
  - **цікавинки:** `facts.awards` і `facts.table` рівні `gameAwards(factInput(room.state))` і `factTable(...)` (як у 12d);
  - **стара гра** (`seedGame` без апеляцій) → `appeal: null` скрізь;
  - `recorder.test.ts`:
    - відкрита апеляція не пишеться, закрита — один рядок навіть після кількох збережень;
    - апеляція вилученого учасника не валить запис (зовнішній ключ).
  - Міграція: PGlite піднімає схему з `0016` (наявні `schema.test.ts` / `client.test.ts` — без правок, лише прогін).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/history.appeal.test.ts apps/server/src/recorder.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=1 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server
  git commit -m "feat(server): closed appeals are stored with their yes and no counts and the decision but never the voters (migration 0016, the appeal table), the history shows the appeal beside the answer, the appeal adjustment gets its breakdown line, and stored rows still sum to the score after an appeal and its undo
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 8. Сервер: події `player:appeal` і `player:appeal-vote`, частота, таймер

**Files:**
- Create: `apps/server/src/rooms/manager.appeal.test.ts`
- Modify: `apps/server/src/rooms/manager.ts`, `socket.ts`, `rooms/manager.drafts.test.ts`, `rooms/manager.restore.test.ts`
- Test: `manager.appeal.test.ts`, `socket.test.ts`, `manager.restore.test.ts`, `manager.drafts.test.ts`

**Interfaces:**
- `manager.ts`, `Room` (після `awayRate`):
  ```ts
  /** Вікно частоти player:appeal-vote (12f), як draftRate. Лише в пам'яті. */
  appealRate: Map<string, { from: number; count: number }>;
  ```
  Порожня мапа — там само, де `draftRate` (створення й відновлення кімнати). `kick` прибирає людину з неї.
- Методи поруч із `vote`:
  ```ts
  /** Апеляція (12f): гравець (у командній грі — капітан) відкриває голосування залу; права й підстави перевіряє рушій. */
  appeal(room: Room, personId: string, reason: AppealReason): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, openAppeal(room.state, personId, reason, this.now()));
  }

  /** Голос в апеляції (12f): людина сама; понад APPEAL_VOTES_PER_SECOND за секунду — too_soon. */
  appealVote(room: Room, personId: string, appealId: number, yes: boolean): AckResult {
    if (!this.alive(room)) return this.gone();
    // частота — як draft (room.appealRate)
    return this.apply(room, castAppealVote(room.state, personId, appealId, yes, this.now()));
  }
  ```
  Таймер кінця голосування ставить наявний `reschedule` (`nextDeadline` з задачі 4). Окремого коду не треба, але тест це перевіряє.
- `socket.ts`, поруч із `player:vote`:
  ```ts
  on('player:appeal', (args) => {
    if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
    const payload = appealSchema.safeParse(payloadOf(args));
    return payload.success ? manager.appeal(room, identity.playerId, payload.data.reason) : INVALID;
  });
  on('player:appeal-vote', (args) => {
    if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
    const payload = appealVoteSchema.safeParse(payloadOf(args));
    return payload.success ? manager.appealVote(room, identity.playerId, payload.data.appealId, payload.data.yes) : INVALID;
  });
  ```
  Події від гравця, тож автор автопілота діє як звичайний гравець.

- [ ] **Step 1: Write the failing tests**
  - `manager.appeal.test.ts` (за зразком `manager.away.test.ts`: `FakeScheduler`, `RoomManager`, `HOST`, `scheduler.advance(SPLASH_MS.question)`):
    - **голосування:** Оля оскаржує, Петро й Іра «так» → бали Олі +100; пульт (`manager.view(room, HOST)`) має `appeal.outcome: 'yes'`;
    - **таймер:** голосів немає, `scheduler.advance(APPEAL_MS.vote)` → `outcome: 'tie'`, `manager.host(room, { type: 'next' })` проходить; до того — `appeal_open`;
    - **пауза:** `host pause` на 5-й секунді, `advance(60_000)` → голосування відкрите; `resume`, `advance(25_000)` → закрите;
    - **оцінка ведучого:** `host override correct` → `outcome: 'host'`;
    - **автопілот:** у кімнаті-автопілоті Петро оскаржує, автор Оля голосує «так» (`manager.appealVote`) → +бали; без голосів автопілот іде далі через `APPEAL_MS.vote + AUTOPILOT_MS.appealShown`;
    - **частота:** п'ятий голос за секунду → `too_soon`;
    - **невідома людина** → `not_found`;
    - **перезапуск:** кімната з відкритою апеляцією зберігається (`stateVersion` 18) і відновлюється на паузі з тим самим залишком; після `resume` таймер закриває голосування вчасно.
  - `socket.test.ts`:
    - гравець шле `player:appeal { reason: 'grade' }` на розкритті → `{ ok: true }`;
    - пульт шле `player:appeal` → `forbidden`;
    - `{ reason: 'x' }` → `invalid`;
    - `player:appeal-vote { appealId: 0, yes: true }` → `invalid`.
  - `manager.restore.test.ts`: кімната версії 17 (знімок з `stateVersion: 17`) відновлюється; тест 12e: `toBe(17)` → `toBe(GAME_STATE_VERSION)`.
  - `manager.drafts.test.ts`: «the game state version is 18» (`toBe(18)`).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/rooms/manager.appeal.test.ts apps/server/src/socket.test.ts apps/server/src/rooms/manager.restore.test.ts apps/server/src/rooms/manager.drafts.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=1 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/src
  git commit -m "feat(server): player:appeal opens the hall vote and player:appeal-vote casts or changes a vote at most four times a second, the room timer closes the vote on time and a pause or a restart keeps the time left, the bot room waits for it, and version 17 rooms still restore
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 9. Веб, телефон: кнопка «Оскаржити», аркуш голосу, картка й результат

**Files:**
- Create: `apps/web/src/appeal-text.ts`, `appeal-text.test.ts`, `screens/AppealCard.tsx`, `AppealCard.test.tsx`, `screens/AppealSheet.tsx`, `AppealSheet.test.tsx`
- Modify: `apps/web/src/live/Timer.tsx`, `screens/Buffs.tsx`, `screens/PlayerScreen.tsx`, `PlayerScreen.test.tsx`, `i18n.ts`, `styles.css`

**Interfaces:**
- `live/Timer.tsx`: перенести з `screens/Buffs.tsx` і експортувати `clockText(ms)` і `useLeftMs(clock, offsetMs)`. `Buffs.tsx` імпортує їх звідси (поведінка та сама, тести `Buffs.test.tsx` без змін).
- `appeal-text.ts`:
  ```ts
  /** «⚖️ Оля оскаржує»; командна гра — «⚖️ Команда «Червоні» оскаржує». */
  export function appealTitle(view: AppealView, teams: boolean): string;
  /** grade — «Відповідь «Одеська», правильна — «Одеса». Зарахувати?»; away — «Штраф за вихід із гри. Зняти штраф?». */
  export function appealAsk(view: AppealView): string;
  /** «так 3 · ні 1 · ще думають 2»; без тих, хто думає, — «так 3 · ні 1». */
  export function appealCountText(view: Pick<AppealView, 'yes' | 'no' | 'waiting'>): string;
  /** «⚖️ Зараховано! +200» (без балів — «⚖️ Зараховано!»), «⚖️ Штраф знято», «⚖️ Лишається як було · так 1 · ні 1», «⚖️ Ведучий зарахував»; відкрита чи cancelled — null. */
  export function appealResultText(view: AppealView): string | null;
  /** «⚖️ Оскаржити (лишилось 2)» / «⚖️ Оскаржити штраф (лишилось 1)». */
  export function appealButtonText(reason: AppealReason, left: number): string;
  ```
  Тексти відповідей — `answerText(view.answer, view.question)` і `correctText(view.question)` з `format.ts`.
- `screens/AppealCard.tsx`:
  ```ts
  /**
   * Картка апеляції (12f): заголовок, питання залу, смужка «так / ні» (stage), лічильник і відлік «0:21»;
   * після рішення — рядок .appeal-result. size: stage — на сцені, host — на пульті, phone — на телефоні того, хто не голосує.
   */
  export function AppealCard({ view, size, teams, offsetMs }: { view: AppealView; size: 'stage' | 'host' | 'phone'; teams: boolean; offsetMs: number }): JSX.Element;
  ```
  - Розмітка: `section.appeal-card.is-{size}` з `role="status"` і `aria-live="polite"`, а в ній:
    - `h2.appeal-title`;
    - `p.appeal-ask` (на phone замість нього «⚖️ Зал голосує…»);
    - `div.appeal-bar` (stage) з двома частками;
    - `p.appeal-count`;
    - `span.appeal-time` (`clockText(useLeftMs(view, offsetMs))`; на паузі — `remainingMs`);
    - `p.appeal-result`.
- `screens/AppealSheet.tsx`:
  ```ts
  /**
   * Нижній аркуш голосу (12f) для виборця: заголовок, питання, [Так] [Ні] з aria-pressed свого голосу, лічильник і відлік;
   * після голосу — «Твій голос: так · можна змінити до кінця». Шле player:appeal-vote { appealId, yes }. На паузі кнопки неактивні.
   */
  export function AppealSheet({ view, mine, teams, paused, offsetMs, send, onError }: { view: AppealView; mine: PlayerAppeal; teams: boolean; paused: boolean; offsetMs: number; send: Send; onError: (message: string | null) => void }): JSX.Element | null;
  ```
  Розмітка: `section.appeal-sheet` (`position: fixed` унизу, як `.vote-sheet`; нічого не зсуває).
- `PlayerScreen.tsx`, на `reveal`:
  - Після `<Result view={view} />` (і після `OwnRevealLine`):
    - `me.appeal?.reasons.map((reason) => <button className="btn appeal-button" …>{appealButtonText(reason, me.appeal.left)}</button>)`. Дотик — `useGuardedSend(send, setError).run('player:appeal', { reason })`;
    - `block` → `p.meta.appeal-block` («Нема кому голосувати» / «Оскаржує капітан»).
  - Картка: `view.appeal !== null && !(view.appeal.outcome === null && me.appeal?.voter)` → `<AppealCard size="phone" …/>`.
  - Аркуш: `view.appeal?.outcome === null && me.appeal?.voter` → `<AppealSheet …/>` поруч із `VoteSheet` (фіксований шар).
- `i18n.ts`:
  ```ts
  appealButton: '⚖️ Оскаржити (лишилось {left})',
  appealButtonAway: '⚖️ Оскаржити штраф (лишилось {left})',
  appealNoVoters: 'Нема кому голосувати',
  appealCaptain: 'Оскаржує капітан',
  appealTitle: '⚖️ {name} оскаржує',
  appealTitleTeam: '⚖️ Команда «{name}» оскаржує',
  appealAsk: 'Відповідь «{answer}», правильна — «{correct}». Зарахувати?',
  appealAskAway: 'Штраф за вихід із гри. Зняти штраф?',
  appealHall: '⚖️ Зал голосує…',
  appealCount: 'так {yes} · ні {no}',
  appealCountWaiting: 'так {yes} · ні {no} · ще думають {waiting}',
  appealYes: 'Так',
  appealNo: 'Ні',
  appealMine: 'Твій голос: {vote} · можна змінити до кінця',
  appealMineYes: 'так',
  appealMineNo: 'ні',
  appealResultYes: '⚖️ Зараховано! {points}',
  appealResultYesBare: '⚖️ Зараховано!',
  appealResultAway: '⚖️ Штраф знято',
  appealResultKept: '⚖️ Лишається як було · {count}',
  appealResultHost: '⚖️ Ведучий зарахував',
  ```
- `styles.css`:
  - `.appeal-button` — на всю ширину 375 px;
  - `.appeal-sheet` — як `.vote-sheet`, кнопки «Так» / «Ні» поруч, по 50 %, `aria-pressed="true"` — заливка;
  - `.appeal-card.is-phone` — у потоці під результатом;
  - `.appeal-result` — великий жирний рядок.

- [ ] **Step 1: Write the failing tests**
  - `appeal-text.test.ts`: кожен текст з інтерфейсу вище. Команда — «⚖️ Команда «Червоні» оскаржує». `appealCountText({ yes: 3, no: 1, waiting: 0 })` → «так 3 · ні 1». У жодному тексті немає «-ла» / «-в» минулого часу (перевірити регулярним виразом `/голосував|голосувала|оскаржив|оскаржила/`).
  - `AppealSheet.test.tsx` (`vi.useFakeTimers()`, `send = vi.fn().mockResolvedValue({ ok: true })`):
    - «Так» → `send('player:appeal-vote', { appealId: 1, yes: true })`;
    - з `mine.vote: true` — «Так» `aria-pressed="true"` і «Твій голос: так · можна змінити до кінця»;
    - «Ні» після «Так» шле `yes: false`;
    - на паузі кнопки неактивні;
    - відлік «0:30» → «0:29» за секунду;
    - помилка `vote_closed` → `onError('…')`.
  - `AppealCard.test.tsx`:
    - відкрита на `stage` — заголовок, питання «Відповідь «Одеська», правильна — «Одеса». Зарахувати?», `.appeal-bar`, «так 1 · ні 0 · ще думають 1», відлік;
    - `phone` — «⚖️ Зал голосує…» без кнопок;
    - рішення `yes` з `points: 100` → «⚖️ Зараховано! +100»; `tie` 1 : 1 → «⚖️ Лишається як було · так 1 · ні 1»; `host` → «⚖️ Ведучий зарахував»;
    - у DOM немає жодного нікнейма, крім того, хто оскаржує.
  - `PlayerScreen.test.tsx`:
    - зріз `reveal` з `me.appeal.reasons: ['grade']` → кнопка «⚖️ Оскаржити (лишилось 2)», дотик шле `player:appeal { reason: 'grade' }`;
    - `block: 'no_voters'` → «Нема кому голосувати» без кнопки;
    - виборець з відкритою апеляцією → аркуш `.appeal-sheet`;
    - той, хто оскаржує, → картка «⚖️ Зал голосує…»;
    - командна фікстура (`team-test-view.ts`) з `appeal: null` → нічого.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/appeal-text.test.ts apps/web/src/screens/AppealSheet.test.tsx apps/web/src/screens/AppealCard.test.tsx apps/web/src/screens/PlayerScreen.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): on the reveal the phone offers «⚖️ Оскаржити (лишилось 2)» or «⚖️ Оскаржити штраф», says «Нема кому голосувати» or «Оскаржує капітан», voters get a bottom sheet with Так / Ні, the counts, the countdown and a changeable own vote, the appellant sees «⚖️ Зал голосує…», and everyone sees «Зараховано! +200» or «Лишається як було»
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 10. Веб, сцена й пульт: картка, «Голосує зал», аркуш скасування

**Files:**
- Modify: `apps/web/src/screens/StageScreen.tsx`, `HostScreen.tsx`, `apps/web/src/undo-panel.ts`, `i18n.ts`, `styles.css`
- Test: `StageScreen.test.tsx`, `HostScreen.test.tsx`, `undo-panel.test.ts`

**Interfaces:**
- `StageScreen.tsx`: на `reveal` — `{view.appeal !== null && <AppealCard view={view.appeal} size="stage" teams={view.teams !== null} offsetMs={offsetMs} />}`.
  - Картка `position: fixed` унизу по центру (ширина ≤ 960 px, висота ≤ 240 px), поверх розкриття й нічого не зсуває.
  - `expectStageInView` 1280 × 720 має проходити.
- `HostScreen.tsx`:
  - `const appealVoting = phase === 'reveal' && view.appeal?.outcome === null;`
  - головна дія при `appealVoting` — та сама `host:next`, але `disabled` і з написом `t('appealVoting')` «Голосує зал»;
  - під панеллю розкриття — `<AppealCard view={view.appeal} size="host" … />`, коли `view.appeal !== null`.
  - Шапка лишається в один рядок (`HEADER_ONE_LINE`): напис — на головній кнопці, не в шапці.
- `undo-panel.ts`:
  - `undoRowText`: `if (row.kind === 'appeal') return t('undoAppealRow', vars);`;
  - `historyUndoLines`: ціль `{ seq }` з `source === 'appeal'` → `historyUndoAppeal`.
- `i18n.ts`:
  ```ts
  appealVoting: 'Голосує зал',
  undoAppealRow: '{name} {points} (апеляція)',
  historyUndoAppeal: ' (апеляція)',
  ```
- `styles.css`: `.appeal-card.is-stage` (великі шрифти, смужка «так / ні» двома кольорами теми), `.appeal-card.is-host` (компактна).

- [ ] **Step 1: Write the failing tests**
  - `StageScreen.test.tsx`:
    - зріз `reveal` з відкритою апеляцією → `.appeal-card.is-stage` з «⚖️ Оля оскаржує», питанням і «так 1 · ні 0 · ще думають 1»;
    - з `outcome: 'yes', points: 200` → «⚖️ Зараховано! +200»;
    - `appeal: null` — картки немає.
  - `HostScreen.test.tsx`:
    - відкрита апеляція → кнопка «Голосує зал» неактивна, «Далі» немає; картка з лічильником;
    - після рішення — «Далі» активна.
  - `undo-panel.test.ts`:
    - `undoRowText({ kind: 'appeal', nickname: 'Оля', points: 150, … })` → «Оля +150 (апеляція)»;
    - `historyUndoLines` зі скасуванням `appeal` → «↶ Скасовано: Оля −150 (апеляція)».
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/StageScreen.test.tsx apps/web/src/screens/HostScreen.test.tsx apps/web/src/undo-panel.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): the 1280 × 720 stage shows the appeal card with the question to the hall, a yes / no bar, the counts and the countdown, then «Зараховано! +200» or «Лишається як було»; the host sees the same counts with «Голосує зал» on the disabled main button, and the undo sheet and history name «(апеляція)»
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 11. Веб: довідка, історія й «Твоя гра»

**Files:**
- Modify: `apps/web/src/help/settings.ts`, `pages/GameHistory.tsx`, `facts-text.ts`, `appeal-text.ts`, `i18n.ts`
- Test: `help/host-help.test.ts`, `pages/GameHistory.test.tsx`, `facts-text.test.ts`, `appeal-text.test.ts`

**Interfaces:**
- `help/settings.ts`:
  - `SETTING_HELP_KEYS` — `'appeal'` одразу після `'away'`;
  - імпорт `APPEAL_MS`, `APPEALS_PER_GAME`;
  - запис:
  ```ts
  appeal: {
    title: 'Апеляція',
    what: 'Гравець, якому не зарахували відповідь, просить зал: 30 секунд голосування, і зал вирішує без ведучого.',
    how: [
      'На розкритті класичного запитання чи звичайної клітинки поля той, чию відповідь не зарахували повністю, бачить на телефоні «⚖️ Оскаржити (лишилось 2)». У командній грі оскаржує капітан.',
      `Голосують усі на зв’язку, крім того, хто оскаржує (у командній грі — люди інших команд, кожен окремо). Голосування триває ${s(APPEAL_MS.vote)} або закривається, щойно проголосували всі. Голос можна змінити до кінця.`,
      'На сцені й на телефонах — картка «Оля оскаржує: відповідь «…», правильна — «…». Зарахувати?», лічильник «так 3 · ні 1 · ще думають 2» і відлік. Хто як голосував, не бачить ніхто — і ви теж.',
      'Поки зал голосує, «Далі» неактивне: на кнопці написано «Голосує зал». Пауза зупиняє відлік. «Завершити раунд», «Завершити гру» й вилучення діють одразу.',
      'Якщо за запитання буде штраф за вихід із гри, гравець може оскаржити й штраф: «⚖️ Оскаржити штраф». Це та сама апеляція й той самий ліміт.',
    ],
    points: [
      '«Так» більше, ніж «ні», — відповідь зараховано: окремий рядок «апеляція» дає стільки, скільки дала б оцінка «Правильно». Нічия чи жодного голосу — усе лишається як було. Серії не змінюються.',
      `Ліміт — ${APPEALS_PER_GAME} апеляції за гру на гравця чи команду; рахується й та, яку зал відхилив.`,
    ],
    tip: [
      'Права вето у вас немає. Якщо ж ви самі згодні з гравцем, натисніть «Правильно» ще під час голосування: апеляцію закрито з написом «Ведучий зарахував», і в ліміт вона не рахується.',
      'Рішення залу скасовується в аркуші «↶ Бали», як будь-який рядок: «Оля +150 (апеляція)».',
    ],
    limits: [
      'Бліц, фінал, «Ва-банк», «Вибування», «Мільйонер», дуель, ланцюжок, сортування, стіна, «100 до 1», блеф, опитування й хмара не оскаржуються: там перевірка однозначна чи правила свої.',
      'Усну відповідь на клітинці поля оскаржити не можна: залу нема що побачити.',
      'Якщо голосувати нікому, кнопки немає: телефон пише «Нема кому голосувати».',
    ],
  },
  ```
  - `setting.away`, `points`: «У грі без ведучого штраф поки що зняти не можна.» → «У грі без ведучого штраф знімає лише апеляція: гравець просить зал, і зал голосує.»
  - `setting.undo`, `points`: «Штраф за вихід із гри теж скасовується: це рядок «(вихід із гри)». Після кінця гри скасувати можна лише його.» → додати речення «Рішення апеляції — теж: рядок «(апеляція)»; скасування відповіді знімає й апеляцію за те запитання.»
  - `setting.autopilot`:
    - `limits[0]` → «Штраф за вихід діє й без ведучого. У грі без ведучого штраф знімає лише апеляція.»;
    - у `how` («Час етапів») після «розкриття — 6 с» додати «(щонайменше ${s(AUTOPILOT_MS.appealWindow)}, якщо хтось ще може оскаржити; голосування апеляції бот чекає, а після рішення — ще ${s(AUTOPILOT_MS.appealShown)})».
- `GameHistory.tsx`: біля відповіді з `response.appeal !== null` — `span.meta.history-appeal` з `historyAppealText(response.appeal)`.
- `appeal-text.ts`:
  ```ts
  /** «⚖️ зараховано 2:0», «⚖️ лишилось як було 1:1», «⚖️ ведучий зарахував»; away — «⚖️ штраф знято 2:0» / «⚖️ штраф лишився 0:2». */
  export function historyAppealText(appeal: GameAppeal): string;
  ```
- `facts-text.ts`, `gameCardLines`: рядок `gameCardAppeals` «⚖️ Апеляції: виграно {won}, програно {lost}», лише коли `won + lost > 0` (однаково для команди).
- `i18n.ts`:
  ```ts
  historyAppealYes: '⚖️ зараховано {yes}:{no}',
  historyAppealKept: '⚖️ лишилось як було {yes}:{no}',
  historyAppealHost: '⚖️ ведучий зарахував',
  historyAppealAwayYes: '⚖️ штраф знято {yes}:{no}',
  historyAppealAwayKept: '⚖️ штраф лишився {yes}:{no}',
  gameCardAppeals: '⚖️ Апеляції: виграно {won}, програно {lost}',
  ```

- [ ] **Step 1: Write the failing tests**
  - `host-help.test.ts`:
    - новий `it('12f appeal entry follows «away» …')`: `setting.appeal` заповнено; стоїть одразу після `setting.away`; `autopilot` — останній; текст містить `30 с`, `2 апеляції`, «Голосує зал», «не бачить ніхто», «Ведучий зарахував», «(апеляція)», «Нема кому голосувати», «Оскаржити штраф»; без `/росі|срср/i`; `searchHelp('апеляція')` містить `setting.appeal`;
    - навмисні правки тесту 12e — за «Порядком збирання»: `setting.away` містить «штраф знімає лише апеляція»; `setting.autopilot` містить «У грі без ведучого штраф знімає лише апеляція.» і `8 с`.
  - `GameHistory.test.tsx`: відповідь з `appeal: { reason: 'grade', yes: 2, no: 0, outcome: 'yes' }` → «⚖️ зараховано 2:0»; `tie` 1 : 1 → «⚖️ лишилось як було 1:1»; `null` — нічого.
  - `facts-text.test.ts`: `gameCardLines({ …, appeals: { won: 1, lost: 1 } }, false)` містить «⚖️ Апеляції: виграно 1, програно 1»; `{ won: 0, lost: 0 }` — рядка немає.
  - `appeal-text.test.ts`: `historyAppealText` — усі варіанти.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/help/host-help.test.ts apps/web/src/pages/GameHistory.test.tsx apps/web/src/facts-text.test.ts apps/web/src/appeal-text.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Приклади довідки — без тем росії й СРСР.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): the host help entry «Апеляція» on when, where, who votes, how it counts, the limit, what the host can do and the bot game, the away, undo and autopilot entries now say an appeal lifts the penalty with no host, ⚖️ beside history answers and «⚖️ Апеляції: виграно 1, програно 1» in the own game card
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 12. Наскрізний сценарій 12f з кадрами

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Помічники беруться як є:
  - сторінки й кліки: `open`, `register`, `join`, `click`, `afterSplash`, `pickOption`, `sleep`;
  - кадри й кадри сокета: `shot`, `snapshot`, `socketFrames`, `stateViews`;
  - перевірки: `expectNoSideScroll`, `expectStageInView`, `HEADER_ONE_LINE`, `POLL`, `exact`, `NL`, `squash`, `problems`, `undoRows`;
  - вікторина: `classicRound`, `makeRoundsQuiz`, `DEFAULT_RULES`.
- Текстова відповідь на телефоні: поле з підписом «Ваша відповідь» (`page.getByLabel('Ваша відповідь', exact).fill(…)`), потім `click(page, 'Відповісти')`.
- Вміст без тем росії й СРСР. Вікторина «Апеляція 12f», `settings: { leaderboard: 'each' }`, один класичний раунд «Розминка» (`speedBonus: false`, `shuffleOptions: false`, `rules: DEFAULT_RULES`):
  ```ts
  function appealQuestions12f() {
    const common = { imageUrl: null, video: null, timeLimit: 60 };
    const p1 = { ...common, id: 'p1', type: 'text' as const, text: 'Хто написав «Заповіт»?', points: 200, accepted: ['Тарас Шевченко'] };
    const p2 = {
      ...common, id: 'p2', type: 'single' as const, text: 'Яка гора найвища в Україні?', points: 100,
      options: [{ id: 'p2-a', text: 'Говерла' }, { id: 'p2-b', text: 'Петрос' }, { id: 'p2-c', text: 'Піп Іван' }],
      correctId: 'p2-a',
    };
    const p3 = { ...common, id: 'p3', type: 'boolean' as const, text: 'Дунай впадає в Чорне море', points: 100, correct: true };
    return { p1, p2, p3 };
  }
  ```
- Пульт — телефон 375 × 812 (`host12f`), сцена — 1280 × 720 (`stage12f`), телефони 375 × 812: Оля, Петро, Іра. `stageFrames`, `hostFrames`, `olyaFrames`, `petroFrames`, `iraFrames` — `socketFrames`.

- [ ] **Step 1: Add the scenario** у кінець файлу за зразком 12e:
  ```ts
  it('part 12f: the player appeal — Оля appeals «Шевченко» from a 375 phone, Петро and Іра vote on a bottom sheet (Іра changes «Ні» to «Так») while the 1280 × 720 stage and the 375 host show only «так · ні · ще думають» and «Голосує зал», two yes add 200 and the table and stage update, a pause stops the countdown, the second appeal ends in a tie and changes nothing, there is no third button, the host sheet lists «Оля +200 (апеляція)», the history shows ⚖️, and no frame names a voter', async () => {
    try {
      await appeal12f();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Підготовка `appeal12f()`:**
  1. `host = open('host12f', 375, 812)`, `register(host, 'host', 'Ліна Ведуча', 'host12f@example.com')`.
  2. Вікторина вище → `POST /api/quizzes`.
  3. «Грати» → `code`, `stageUrl`; `stage = open('stage12f', 1280, 720)`; телефони `olya`, `petro`, `ira` з `join`.
  4. «Почати гру» → `afterSplash(...all)` → «Почати раунд» → `afterSplash(...all)`.

  Допоміжні локатори: `appealButton(page) = page.locator('.appeal-button')`, `sheet(page) = page.locator('.appeal-sheet')`, `card(page) = page.locator('.appeal-card')`, `count(page) = card(page).locator('.appeal-count')`.

  **Кроки:**
  1. **p1: відповіді.** Оля — «Шевченко», Петро — «Тарас Шевченко», Іра — «Франко» (поле «Ваша відповідь» → «Відповісти»). Запитання закривається само (відповіли всі).
     - `click(host, 'Показати відповідь')`.
     - Оля: `appealButton(olya)` — «⚖️ Оскаржити (лишилось 2)».
     - Петро (правильно): кнопки немає.
     - Іра: кнопка є.
     - `expectNoSideScroll(olya, 'p12f-phone-button')`; кадр `p12f-phone-button`.
  2. **Апеляція.** Оля тисне кнопку.
     - Сцена: `card(stage)` з `.appeal-title` «⚖️ Оля оскаржує», `.appeal-ask` «Відповідь «Шевченко», правильна — «Тарас Шевченко». Зарахувати?», `count(stage)` — «так 0 · ні 0 · ще думають 2». `expectStageInView(stage, 'p12f-stage-vote')`; кадр `p12f-stage-vote`.
     - Пульт: кнопка «Голосує зал» неактивна (`isDisabled()`), `count(host)` той самий. `HEADER_ONE_LINE`. `expectNoSideScroll(host, 'p12f-host-vote')`; кадр `p12f-host-vote`.
     - Оля: `card(olya)` «⚖️ Зал голосує…», кнопки «Оскаржити» вже немає; кадр `p12f-phone-waiting`.
     - Петро: `sheet(petro)` з кнопками «Так» / «Ні»; `expectNoSideScroll(petro, 'p12f-phone-vote')`; кадр `p12f-phone-vote`.
  3. **Зміна голосу.**
     - Іра — «Ні» → на сцені «так 0 · ні 1 · ще думають 1».
     - Іра — «Так» → «так 1 · ні 0 · ще думають 1»; у Іри «Так» `aria-pressed="true"` і «Твій голос: так · можна змінити до кінця».
     - Петро — «Так» → голосування закривається одразу.
  4. **Рішення «так».**
     - Сцена: `.appeal-result` «⚖️ Зараховано! +200»; кадр `p12f-stage-yes`.
     - Пульт: рахунок Олі — 200, «Далі» активна.
     - Оля: «⚖️ Зараховано! +200».
     - `click(host, 'Далі')` → таблиця: у сцени Оля й Петро з 200.
  5. **p2: пауза й нічия.** «Далі» → `afterSplash`. Оля — «Петрос», Петро й Іра — «Говерла» → «Показати відповідь».
     - Оля: «⚖️ Оскаржити (лишилось 1)» → тисне.
     - **Пауза:** пульт ставить паузу (кнопка паузи, як у сценарії 12c), відлік на сцені `.appeal-time` — запам'ятати; `sleep(1500)`; відлік той самий; у Петра кнопки аркуша неактивні; продовження.
     - Петро «Так», Іра «Ні» → «⚖️ Лишається як було · так 1 · ні 1» на сцені й у Олі; кадр `p12f-phone-tie` (Оля).
     - Рахунок Олі — 200 (без змін).
     - «Далі».
  6. **p3: третьої кнопки немає.** «Далі» → `afterSplash`. Оля — «Ні», решта — «Так» → «Показати відповідь».
     - В Олі `appealButton(olya).count()` → 0 протягом 1 с (`expect.poll`).
     - В Іри (правильно) кнопки немає.
  7. **Аркуш скасування.** «↶ Бали» → `undoRows(sheet)` містить «Оля +200 (апеляція)» під запитанням 1. `expectNoSideScroll(host, 'p12f-host-sheet')`; кадр `p12f-host-sheet`. Escape. «Далі» → `finished`.
  8. **Таємність.**
     - Для `stageFrames`, `hostFrames`, `olyaFrames` (усі зрізи з `appeal !== null`): `JSON.stringify(view.appeal)` не містить id Петра й Іри (із зрізів таблиці) і рядків «Петро», «Іра».
     - У жодному кадрі сцени, пульта й телефонів немає `"votes"`.
     - `petroFrames`: `me.appeal.vote` — лише `true` / `null`, і жоден зріз Петра не містить голосу Іри.
  9. **Історія.** `` host.goto(`${base}/history`) `` → гра «Апеляція 12f»:
     - біля відповіді Олі на запитання 1 — «⚖️ зараховано 2:0»;
     - на запитання 2 — «⚖️ лишилось як було 1:1».
     - `expectNoSideScroll(host, 'p12f-history')`; кадр `p12f-history`.
  10. `expect(problems).toEqual([])`.
- [ ] **Step 2: Run** на передньому плані (не у фоні): `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 12f"` → PASS. Переглянути кадри `p12f-*`:
  - телефон 375: кнопка «⚖️ Оскаржити (лишилось 2)» на всю ширину, не налазить на результат; аркуш голосу знизу не закриває кнопок і тексту;
  - сцена 1280 × 720: картка внизу не зсуває правильну відповідь, смужка «так / ні» і лічильник читаються, нічого не обрізано;
  - пульт 375: «Голосує зал» на головній кнопці, шапка в один рядок;
  - аркуш: рядок «(апеляція)» під запитанням 1;
  - історія 375 — без горизонтальної прокрутки.
- [ ] **Step 3: Повний прогін — один раз, на передньому плані** (не у фоні): `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts` → усі сценарії PASS. Особливо:
  - 12a (аркуш скасування з новим джерелом);
  - 12e (штраф за вихід і його скасування);
  - 12d (нагороди й «Твоя гра»);
  - 11g / 11h (автопілот: розкриття 8 с там, де є кому оскаржити — правки за «Порядком збирання», перелічити у звіті);
  - 9b-перезапуски (`restart`).

  Жоден наявний сценарій з ведучим не має показати картку апеляції. Якщо PGlite чи браузер падають від нестачі пам'яті, прогнати групами за `-t` (теж на передньому плані) і назвати це в звіті.
- [ ] **Step 4: Commit**
  ```bash
  git add apps/server/e2e
  git commit -m "test: part 12f end-to-end — Оля appeals «Шевченко» from a 375 phone, Петро and Іра vote on the bottom sheet and Іра changes her vote, the 1280 × 720 stage and the 375 host show only the counts and «Голосує зал», two yes add 200 to the table and the stage, a pause stops the countdown, the second appeal ties and changes nothing, no third button, «Оля +200 (апеляція)» in the undo sheet, ⚖️ in the history, and no frame names a voter
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```
