# План 12g: команди — капітан вибирає, хто відповідає

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 12g специфікації `docs/superpowers/specs/2026-10-27-subproject-12-design.md`:
- розділ 11 (уся частина);
- обмеження — розділи 2 і 3 (анти-ціль «гра без ведучого зависає на новій механіці: … вибір відповідача», правило «Команди. Кожна частина каже, хто діє»);
- рядок 12g у таблиці частин — розділ 4;
- чернетки відповідача — розділ 6, п. 4 (12b) і розділ 11, п. 7;
- підказки «Хто я?» відкриває відповідач — розділ 7, п. 8 і рядок тестів 12c;
- рішення автора — розділ 18, «Відповідач (12g)»;
- що лишається будівельнику — розділ 17 (`answerers`, `player:pick-answerer`, «смужка відповідача»).

**Рішення власника (з розділу 18):** три режими — капітан / вибирає капітан / по черзі. Вибір діє з наступного запитання. Відповідач бере й бафи. Ставки, рішення й дебафи лишаються капітанові.

Що робить частина:
- **Налаштування команд** `answerer: 'captain' | 'chosen' | 'rotate'`; немає поля — `captain`, усе як зараз.
- **Смужка капітана.** Між запитаннями (етапи `guide`, `intro`, `board`, `wager`, `locked`, `reveal`, `leaderboard`, `round_end`) капітан у режимах `chosen` і `rotate` бачить «Відповідає: [Оля] [Петро] [Я]» і перемикач «на весь раунд».
  - Без перемикача вибір діє одне наступне запитання, потім знову капітан (у `rotate` — наступний по черзі).
  - З перемикачем — до кінця раунду, у якому відкрилося перше таке запитання.
- **Під час запитання** вибір не змінити (`wrong_phase`). Відповідач поза зв'язком → відповідає капітан, як дуелянт у `duelistOf`.
- **Що робить відповідач:**
  - подає відповідь (`answer`), зокрема у фіналі, «Ва-банк», «Мільйонері» й на полі, якщо клітинку вибрала його команда;
  - бере бафи й підказки «Мільйонера»;
  - відкриває підказки «Хто я?» (12c);
  - пише вигадку блефу й вибирає варіант;
  - ходить у ланцюжку, сортуванні (і нахиляє картку 11d) та стіні;
  - відповідає на питання випробування «Вибування» й вибирає двері;
  - бере підказку ланцюжка й вирішує «ще одна спроба».
- **Що лишається капітанові:**
  - вибір клітинки й кидок кубика на полі;
  - ставка фіналу;
  - «Далі / Забрати» у «Ва-банк», «Граю далі / Забираю» у «Мільйонері»;
  - оголошення дуелі, категорія, вибір дуелянта;
  - купівля дебафів;
  - апеляція (12f);
  - вибір відповідача.
- **Не змінюється:** бліц (відповідає той, хто натиснув), дуель (дуелянт), опитування й хмара (кожен сам), голос «Запитання в залі» і голос апеляції (людина сама).
- **Чернетки (11c, 12b):** товариші й пульт бачать чернетку відповідача.
- **Дебаф на команду** діє на телефоні того, хто відповідає (а не капітана, якщо це різні люди): ефект належить полю відповіді.
- **Що видно:**
  - **телефон відповідача:** «Ти відповідаєш за команду» над запитанням;
  - **телефони товаришів:** «Відповідає Оля — радьте вголос» і її чернетка;
  - **сцена 1280 × 720:** рядок під шапкою «Червоні — відповідає: Оля · Сині — відповідає: Марко»;
  - **пульт:** у живому рядку команди — «діє: Оля», у складі команди — позначка 🎤;
  - **редактор:** «Хто відповідає: капітан / вибирає капітан / по черзі».
- **Гра без ведучого:** капітан вибирає так само; не вибрав — відповідає капітан (у `rotate` — черга). Автопілот нічого не чекає: вибір не є кроком.
- **Довідка ведучого:** новий запис `team.answerer` після `team.captain` з таблицею «що робить відповідач, а що — капітан»; оновлені рядки в `team.play`, `team.captain`, `team.formats`.

**Стан гри змінюється: `GAME_STATE_VERSION` 19 → 20, версія 19 лишається читабельною.**
- Нові поля:
  - необов'язкове `TeamsState.answerers?: Record<teamId, AnswererPick>` — вибір капітана;
  - необов'язкове `TeamsState.turns?: Record<teamId, AnswererTurn>` — лічильник черги `rotate`;
  - необов'язкове `TeamsSettings.answerer?` у знімку вікторини (`state.quiz.settings.teams`).
- Чому підняття потрібне: старий сервер не прочитав би стан з новими ключами (розділ 3 специфікації: нове поле стану — +1 версія).
- Чому старі стани читаються: стан версій 2–19 не може містити ні вибору, ні черги, ні поля `answerer` у вікторині. Без них поведінка — режим `captain`, як і була. Тож `READABLE_STATE_VERSIONS` отримує 19 з поясненням у `restore.ts`. Кімнати, збережені до деплою, відновлюються, і живі ігри деплой переживають.
- Міграції бази немає: вікторина зберігається як JSON, нове поле необов'язкове.
- Перед пушем координатор перевіряє `live_room` (правило специфікації, розділ 2). За правилом пам'яті «Deploys kill live games» він питає власника: стара версія читається, але правило вимагає питати перед кожним підняттям `GAME_STATE_VERSION`.

**Архітектура:**
- **Shared.**
  - `teams.ts`: `ANSWERER_MODES`, `AnswererMode`, `ANSWERER_SCOPES`, `AnswererScope`, `ANSWERER_PICKS_PER_SECOND`, `answererModeOf`.
  - `quiz.ts`: `teamsSettingsSchema` + `answerer` (необов'язкове).
  - `game.ts`: `ErrorCode` + `not_answerer`.
  - `events.ts`: `pickAnswererSchema`, подія `'player:pick-answerer'`.
  - `views.ts`: `TeamView.answererId`, `TeamsView.answerer`, `PlayerTeam.answererId / answerer / answererMode / canPickAnswerer / answererPick`.
- **Рушій.**
  - `game.ts`: `AnswererPick`, `AnswererTurn`, поля `TeamsState`; `openQuestion` викликає `startAnswerers`.
  - Новий `answerer.ts`: хто відповідає зараз і далі, вибір капітана, черга.
  - `team-act.ts`: `TeamAct` + `'answerer'`; `actorOf(…, 'answer')` поза бліцом і опитуванням → відповідач.
  - `teams.ts`: `withTeams` експортується; `dropMember` і `withoutTeam` прибирають вибір і чергу.
  - `restore.ts`: версія 20, читається 19.
  - `views.ts`: `teamsView`, `playerTeam`, `canActNow` (випробування — відповідач).
  - `live.ts`: `actingNickname` типово — відповідач.
  - `testing/teams.ts`: `teamQuiz(rounds, count, answerer?)`.
- **Сервер.**
  - `rooms/manager.ts`:
    - дії відповідача переходять з `'captain'` на `'answerer'`;
    - `draftStage` випробування — `'answerer'`;
    - метод `pickAnswerer` з частотою `room.pickRate`.
  - `socket.ts`: `player:pick-answerer`.
- **Веб.**
  - Новий `screens/AnswererPicker.tsx` (смужка капітана).
  - Новий `screens/StageAnswerers.tsx` (рядок сцени).
  - `screens/TeamBar.tsx`, `TeamWatch.tsx`, `PlayerScreen.tsx`, `StageScreen.tsx`, `HostTeams.tsx` (`TeamPeople`), `editor/TeamsEditor.tsx`.
  - `i18n.ts`, `styles.css`.
- **Довідка ведучого:** `help/teams.ts` — запис `answerer` після `captain`; правки в `play`, `captain`, `formats`.
- **Наскрізні тести.** Один сценарій «part 12g: …». Пульт на телефоні 375 × 812, сцена 1280 × 720, п'ять телефонів 375 × 812. Дві гри: «вибирає капітан» і «по черзі». Кадри з префіксом `p12g-`.

**Технології:** TypeScript, zod, vitest, Fastify + Socket.IO, Drizzle + PGlite, React 19 + Vite, Testing Library (jsdom), Playwright. Нових залежностей немає.

**Рішення плану там, де специфікація мовчить чи неоднозначна (координатор може змінити):**

*Стан*
- Вибір капітана:
  ```ts
  interface AnswererPick {
    memberId: string;            // людина з команди (TeamMember.id)
    scope: AnswererScope;        // 'question' — одне запитання; 'round' — до кінця раунду
    fromQuestion: number;        // індекс у plays, з якого діє: plays.length у мить вибору (наступне запитання)
    roundIndex: number | null;   // раунд запитання fromQuestion; null — те запитання ще не відкрито
  }
  ```
  - Поля — зі специфікації. `roundIndex` ставить `startAnswerers`, коли відкривається запитання `fromQuestion`, а не мить вибору. Так вибір «на раунд», зроблений на розкритті останнього запитання раунду чи на `round_end`, діє на наступний раунд, а не зникає одразу.
  - Один вибір на команду: новий заміняє старий (і «на раунд» теж).
- Лічильник черги:
  ```ts
  interface AnswererTurn {
    questionIndex: number;       // запитання (індекс у plays), на якому черга дала відповідь цій людині
    memberId: string;            // наступна черга — після неї в порядку команди
  }
  ```
  `TeamsState.turns?: Record<teamId, AnswererTurn>`. Це «лічильник черги» специфікації: замість числа зберігається остання людина, тож пропуск людини поза зв'язком не зсуває коло.

*Хто відповідає (`answerer.ts`)*
- `answererMode(state)` = `answererModeOf(state.quiz.settings.teams)` = `teams?.answerer ?? 'captain'`.
- **`activePick(state, teamId, q)`** — вибір, що діє на запитанні `q`:
  - `scope 'question'`: `pick.fromQuestion === q`;
  - `scope 'round'`: `pick.roundIndex !== null && q >= pick.fromQuestion && state.plays[q]?.roundIndex === pick.roundIndex`.
- **`answererOf(state, teamId)`** — хто відповідає на поточному запитанні `q = state.questionIndex`:
  1. режим `captain` → `captainOf`;
  2. немає `plays[q]`, `plays[q].blitz !== undefined` чи `isUnscored(plays[q].question)` → `captainOf` (бліц, опитування й хмара не змінюються);
  3. кандидат: `activePick(…)?.memberId`, інакше в `rotate` — `turns[teamId]` з `questionIndex === q`;
  4. кандидат є в команді й на зв'язку → він, інакше `captainOf`.
- **`nextAnswerer(state, teamId)`** — хто відповідатиме на наступному запитанні (для зрізів між запитаннями):
  - режим `captain` → `captainOf`;
  - `upcomingPick` (нижче) → його людина на зв'язку, інакше `captainOf`;
  - `rotate` → `queueNext(state, teamId)`;
  - інакше `captainOf`.
- **`upcomingPick(state, teamId)`** — вибір, що ще діятиме: `pick.roundIndex === null` (його запитання ще не відкрито) або `pick.scope === 'round' && pick.roundIndex === state.roundIndex && state.phase !== 'round_end'`.
- **`queueNext(state, teamId)`** — наступний по черзі:
  - люди команди в порядку `teamMembers`;
  - старт — одразу після `turns[teamId].memberId`; без запису чи якщо цієї людини вже немає — з `captainOf` (перший хід — капітан);
  - перший на зв'язку по колу; нікого на зв'язку — `captainOf`.
- **`shownAnswerer(state, teamId)`** — для зрізів: етапи `question`, `locked`, `reveal` або `trialOpen(state)` → `answererOf`; інакше `nextAnswerer`.

*Відкриття запитання (`startAnswerers`)*
- Викликається в `openQuestion` після того, як запис додано (`questionIndex = plays.length − 1`), перед `fireDebuffs`.
- Пришпилює раунд: вибір з `fromQuestion === q` і `roundIndex === null` отримує `roundIndex = plays[q].roundIndex`.
- **Черга `rotate`** — для кожної команди з `actingTeams(state, play)` без `activePick(…, q)`: `turns[team] = { questionIndex: q, memberId: queueNext(state, team) }`.
- `actingTeams(state, play)` — хто на цьому записі справді відповідає:
  - бліц (`play.blitz`) чи опитування й хмара → нікого (черга не рухається);
  - «Мільйонер» → `[play.ladder.contestantId]`;
  - поле (не бліц-клітинка) → `[play.board.chooserId]`;
  - інакше — усі команди з `state.players`.
- **Вибір капітана черги не рухає:** на запитанні з чинним вибором черга стоїть, потім іде далі з того самого місця (*рішення плану*).

*Вибір (`pickAnswerer`)*
- Порядок перевірок і коди:
  1. соло-гра чи режим `captain` → `wrong_phase`;
  2. етап поза `ANSWERER_PICK_PHASES = ['guide', 'intro', 'board', 'wager', 'locked', 'reveal', 'leaderboard', 'round_end']` → `wrong_phase` (лобі, `question`, `duel`, `finished`);
  3. `actorOf(state, personId, 'captain')` → `not_captain` / `not_found`;
  4. `memberId !== null` і людина не з команди капітана → `not_found`.
- Результат:
  - `memberId === null` прибирає вибір: у `chosen` знову капітан, у `rotate` — черга;
  - інакше `answerers[team] = { memberId, scope, fromQuestion: state.plays.length, roundIndex: null }`.
- Пауза вибору не заважає: це між запитаннями.
- Людину поза зв'язком вибрати можна. Поки її немає, відповідає капітан. Смужка на телефоні таких не пропонує.

*Хто діє (`team-act.ts`)*
- `TeamAct` + `'answerer'`: `answererOf(state, team) === memberId` → `actor(team)`, інакше відмова.
- `case 'answer'`: після перевірок опитування й бліцу — та сама перевірка відповідача замість капітана.
- **Код відмови:**
  - режим `captain` → `not_captain`, як зараз (наявні тести не змінюються);
  - інакше → новий `not_answerer`.
- Менеджер переводить з `'captain'` на `'answerer'`:
  - `guess`, `sort`, `tilt`, `wall`;
  - `lie`, `bluff`;
  - `trial`, `door`;
  - `buff`, `lifeline`, `hint`, `retry`.
  - Решта `'captain'` лишається: `wipeout`, `ladderDecide`, `pick`, `roll`, `wager`, `declareDuel`, `duelCategory`, `buyDebuff`.
  - `clue` (12c) і `answer` уже йдуть через `'answer'`.
- **Підказки «Мільйонера» бере відповідач** (*рішення плану*: це «бафи» драбини, вони допомагають відповісти).
- **Випробування «Вибування»** (етап `leaderboard`): відповідач — той, хто відповідав на запис цього раунду (`state.questionIndex`). Вибір, зроблений на таблиці, діє з наступного запитання, а не на випробуванні.

*Вилучення людини*
- `dropMember`: вибір, де `memberId` — ця людина, зникає. Запис черги лишається: `queueNext` без цієї людини стартує з капітана.
- `withoutTeam`: зникають `answerers[team]` і `turns[team]`.

*Хто що бачить*
- `TeamView.answererId: string | null` — `shownAnswerer`; null — команда порожня (лобі). Для всіх ролей: це не таємниця.
- `TeamsView.answerer: AnswererMode` — режим вікторини.
- `PlayerTeam`:
  ```ts
  answererId: string | null;      // shownAnswerer своєї команди
  answerer: boolean;              // answererId === memberId
  answererMode: AnswererMode;
  canPickAnswerer: boolean;       // режим не captain, я — капітан, етап з ANSWERER_PICK_PHASES
  answererPick: { memberId: string; scope: AnswererScope } | null; // upcomingPick своєї команди
  ```
- `PlayerTeam.canAct` (`canActNow`):
  - на `question` — як зараз (`actorOf(…, 'answer')`, тепер відповідач);
  - на `leaderboard` з `trialOpen` — `actorOf(…, 'answerer')`;
  - інакше — капітан.
- `LiveRow.actor` (`live.ts`, `actingNickname`) типово — нікнейм `answererOf` (дуель — дуелянт, бліц — натиснувший, як зараз).

*Екрани (тексти — у `i18n.ts`, без роду)*
- **Телефон капітана** (`AnswererPicker`, під `TeamBar`, як `DuelistPicker`):
  - `section.answerer-picker`: `p.lead` «Відповідає:»;
  - кнопки людей команди на зв'язку (і вибраної, навіть поза зв'язком) з `aria-pressed`; своя кнопка — «Я»;
  - у `rotate` ще кнопка «Черга» (`memberId: null`);
  - у `chosen` «Я» шле `memberId: null` (без вибору відповідає капітан);
  - чекбокс «на весь раунд» (`scope`). Якщо вибір уже є, зміна перемикача шле той самий `memberId` з новим `scope`;
  - `p.meta`: «Діє з наступного запитання» / «Діє до кінця раунду».
- **Телефон відповідача:** у режимах `chosen` / `rotate` на `question` — `p.lead.team-answerer-banner` «Ти відповідаєш за команду» над `h1` запитання. Нижній рядок `.team-you-answer` у цих режимах не показується (у режимі `captain` — як зараз).
- **`TeamBar`:** дуелянт → натиснувший → `answererId !== captainId` («Ти відповідаєш» / «Відповідає Оля») → капітан.
- **`TeamWatch`:**
  - якщо `answererId !== captainId`: лід «Відповідає Оля — радьте вголос», позначка чернетки «чернетка»;
  - для блефу — «Оля вирішує за команду…» замість «Капітан вирішує за команду…».
  - Відповідає капітан — усе як зараз.
- **`PlayerScreen`:**
  - `BuffRow`, `LadderLifelines` і ефект дебафу (`debuff`) — на телефоні `answering = team === null || team.answerer` (було `captain`);
  - `DebuffStrip` — у решти;
  - `DebuffShop` і `DuelButton` — як і були, у капітана;
  - випробування «Вибування» для того, хто не відповідає: «Оля вирішує за команду…».
- **Сцена** (`StageAnswerers`) — у командній грі з режимом не `captain`:
  - на `question` / `locked` / `reveal`, крім бліцу, опитування й хмари;
  - рядок `p.stage-answerers` одразу під шапкою, один рядок без перенесення (`overflow: hidden; text-overflow: ellipsis`);
  - на кожну команду — `span.stage-answerer.team-N` з `strong` назвою й «відповідає: Оля»;
  - на полі — лише команда, що вибрала клітинку; у «Мільйонері» — лише учасник.
- **Пульт:**
  - живий рядок — «діє: Оля» (наявний `liveActs`);
  - у складі команди (`TeamPeople`) — `span.answerer-mark` 🎤 з `aria-label` «відповідає» біля `answererId`.
- **Редактор** (`TeamsEditor`):
  - `select` «Хто відповідає» з варіантами «капітан» / «вибирає капітан» / «по черзі» і «ⓘ» (`team.answerer`);
  - «капітан» прибирає поле (старі вікторини не змінюються);
  - `resize` і `rename` зберігають `answerer`.

*Частота*
- `player:pick-answerer` — не більше `ANSWERER_PICKS_PER_SECOND = 4` за секунду на людину (`room.pickRate`, як `appealRate`), понад — `too_soon`.

*Інтеграція з уже злитими частинами*
- **12a (скасування):** нічого. Бали й рядки — команди.
- **12b (чернетки):** `liveDraft` перевіряє `actorOf(state, found.by, at.act)`. З новим `actorOf` чинна лише чернетка відповідача, тож товариші й пульт бачать її без нового коду. На випробуванні `act` — `'answerer'`.
- **12c (підказки):** `clue` йде через `'answer'`, тож відкриває відповідач без нового коду. Тест це закріплює.
- **12d (цікавинки):** нічого: учасник рушія — команда.
- **12e (вихід):** нічого: штраф отримує команда, якщо відволікався будь-хто з неї.
- **12f (апеляція):** оскаржує капітан, як і було (`actorOf(…, 'captain')`).
- **12r (продовження):** нічого: перша черга нового раунду — капітан.

*Чого не робимо*
- запису в базу, хто з людей відповідав (специфікація для 12g бази не просить). Ачівку `chosen_one` і «ачівки за відповіді — відповідач» вирішує 12j: там «без даних про людину — капітан»;
- вибору відповідача ведучим;
- окремої позначки на сцені для режиму `captain` (там усе як зараз);
- нового демо-вмісту. Тексти e2e й довідки — без тем росії й СРСР.

## Глобальні обмеження

- **Анти-ціль:** гра без ведучого не зависає. Вибір — не крок автопілота, а без вибору відповідає капітан чи черга (задачі 4 і 6).
- **Анти-ціль:** живі ігри не обриваються деплоєм. Версія 20, 19 — у `READABLE_STATE_VERSIONS` (задачі 3 і 6).
- **Анти-ціль:** старі вікторини не змінюють поведінки. Без поля `answerer` режим `captain`, і `answererOf ≡ captainOf`. Коди помилок ті самі (`not_captain`), наявні тести без змін, крім фікстур (задачі 2, 4, 5).
- **Анти-ціль:** тексти без тем росії й СРСР. Приклади — «Кобзар», Говерла, Дніпро.
- **Тексти без роду:** «ти» в теперішньому часі, безособові форми, без «відповів / відповіла». Роль у копії — «той, хто відповідає»; слово «відповідач» — лише в довідці як назва ролі.
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`, тексти довідки — лише в `apps/web/src/help/*.ts`.
- Сцена 1280 × 720 без прокрутки. Телефон і пульт 375 px без горизонтальної прокрутки сторінки; шапка пульта в один рядок (`HEADER_ONE_LINE`).
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і тести:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=1 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- Наскрізні тести: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 12g"`.
  - **Лише на передньому плані.** Жодного запуску у фоні: команда йде в тому самому кроці, а результат читається одразу.
  - Затримка 11b в e2e увімкнена. Кнопки пульта чекають, доки стануть активними, без снів.
  - Кадри лежать в `apps/server/e2e/artifacts/shots`, префікс — `p12g-`.
- Кожен коміт закінчується рядками:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  ```
- Після останньої задачі й фінальної рецензії гілку зливають у `main`. **Пуш — лише після згоди власника** (версія стану піднімається: правило пам'яті «Deploys kill live games») і після перевірки `live_room`. Якщо власник саме грає (правило «Push hold while playing»), пуш чекає.

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/teams.ts`, `teams.test.ts`, `quiz.ts`, `quiz.test.ts` (чи наявний тест схеми команд), `game.ts`, `events.ts`; `apps/web/src/i18n.ts` (текст помилки) | режими, обсяг, частота, поле налаштувань, помилка, подія | 1 |
| `packages/shared/src/views.ts`; заглушки в `packages/engine/src/views.ts`; фікстури `TeamView` / `TeamsView` / `PlayerTeam` у тестах | поля зрізів із заглушками | 2 |
| `packages/engine/src/game.ts`, `answerer.ts` (новий), `answerer.test.ts` (новий), `teams.ts`, `restore.ts`, `restore.test.ts`, `testing/teams.ts`, `index.ts` | стан, хто відповідає, вибір, черга, версія 20 | 3 |
| `packages/engine/src/team-act.ts`, `game.ts` (`openQuestion`), `teams.ts`, `game.teams-answerer.test.ts` (новий) | хто діє в кожному режимі, черга на відкритті, вилучення | 4 |
| `packages/engine/src/views.ts`, `live.ts`, `views.teams-answerer.test.ts` (новий) | зрізи всіх ролей, «діє: …» на пульті | 5 |
| `apps/server/src/rooms/manager.ts`, `rooms/manager.answerer.test.ts` (новий), `manager.drafts.test.ts`, `manager.restore.test.ts`, `socket.ts`, `socket.test.ts` | дії відповідача, чернетки, подія, частота, версія | 6 |
| `apps/web/src/screens/AnswererPicker.tsx` (новий), `AnswererPicker.test.tsx` (новий), `TeamBar.tsx`, `TeamBar.test.tsx`, `TeamWatch.tsx`, `TeamWatch.test.tsx`, `PlayerScreen.tsx`, `PlayerScreen.test.tsx`, `i18n.ts`, `styles.css` | телефон: смужка, «Ти відповідаєш», товариші, бафи й дебаф | 7 |
| `apps/web/src/screens/StageAnswerers.tsx` (новий), `StageAnswerers.test.tsx` (новий), `StageScreen.tsx`, `StageScreen.test.tsx`, `HostTeams.tsx`, `HostTeams.test.tsx`, `editor/TeamsEditor.tsx`, `TeamsEditor.test.tsx`, `i18n.ts`, `styles.css` | сцена, пульт, редактор | 8 |
| `apps/web/src/help/teams.ts`, `help/host-help.test.ts` | довідка | 9 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 12g | 10 |

## Порядок збирання

- 1 → 2 → 3 → 4 → 5 → 6. Задачі 7 і 8 — після 2 (тести на фікстурах; наживо — після 6). Задача 9 — після 1. Задача 10 — останньою.
- **Навмисні зміни наявних очікувань** (лише такі):
  - **фікстури (задача 2):**
    - кожен `TeamView` отримує `answererId` (у фікстурах — те саме, що `captainId`);
    - кожен `TeamsView` — `answerer: 'captain'`;
    - кожен `PlayerTeam` — `answererId` (= `captainId`), `answerer` (= `captain`), `answererMode: 'captain'`, `canPickAnswerer: false`, `answererPick: null`;
    - файли: `apps/web/src/screens/team-test-view.ts`, `screens/*.test.tsx` з літеральними командами, `packages/engine/src/views.teams.test.ts` та інші тести рушія, де `toEqual` порівнює повний `TeamsView` / `PlayerTeam`, і кожен файл, на який вкаже `pnpm typecheck`;
  - **`packages/engine/src/restore.test.ts` (задача 3):**
    - новий запис `KEYS[20]` (= `KEYS[19]`, де `TeamsState` — `'answerers,captains,dice,duelists,form,list,members,turns'`, плюс `AnswererPick: 'fromQuestion,memberId,roundIndex,scope'`, `AnswererTurn: 'memberId,questionIndex'`, `TeamsSettings: 'answerer,count,names'`);
    - у `STATE_SHAPE` — нові ключі `TeamsState` і рядки `AnswererPick`, `AnswererTurn`, `TeamsSettings`;
    - у циклі `add(...)` — `add('TeamsSettings', [s.quiz.settings.teams])`, `add('AnswererPick', Object.values(s.teams?.answerers ?? {}))`, `add('AnswererTurn', Object.values(s.teams?.turns ?? {}))`;
    - `READABLE_STATE_VERSIONS` у тесті «older readable versions» — `[2, …, 19, 20]`;
    - `representative()` отримує командну гру `rotate` з вибором «на раунд», щоб кожен новий тип трапився з усіма ключами;
    - записи 1–19 не змінюються;
  - **`apps/server/src/rooms/manager.drafts.test.ts` (задача 6):** «the game state version is 19» → «… 20» (`toBe(20)`);
  - **`apps/web/src/help/host-help.test.ts` (задача 9):** `helpIds('teams')` — `[…, 'team.captain', 'team.answerer', 'team.formats']`;
  - **`apps/web/src/i18n.ts` (задача 1):** `err_not_captain` «За команду відповідає капітан.» → «Це робить капітан команди.» (у режимі `chosen` цей код повертають лише дії капітана). Тест, що шукає старий текст, виконавець перелічує у звіті (пошук показує, що таких немає);
  - **e2e:** наявні командні сценарії (10j, 11c, 11d, 11e, 11h) — режим `captain`, нічого не змінюється.
  - Якщо падає інше, рецензент розбирає причину, а не правку очікування.

## На що дивитися рецензентові

1. **Старі вікторини.** Без `answerer` — `answererOf ≡ captainOf`, коди помилок ті самі, черга не пишеться (`turns` немає), зрізи — `answerer: 'captain'` (задачі 3–5).
2. **Хто що робить.** Відповідач: відповідь, бафи, підказки «Мільйонера» й «Хто я?», блеф, ланцюжок, сортування, стіна, випробування й двері. Капітан: клітинка, кубик, ставка, рішення, дуель, дебафи, апеляція, вибір. Бліц, дуель, опитування, хмара — як були (задачі 4, 6).
3. **Час дії вибору.** Лише між запитаннями. «Одне запитання» — рівно наступне. «На раунд» — до кінця раунду першого такого запитання. Новий вибір заміняє старий (задачі 3, 4).
4. **Зв'язок.** Відповідач поза зв'язком → капітан. Черга обходить лише тих, хто на зв'язку. Вилучення прибирає вибір (задачі 3, 4).
5. **Черга.** Перший хід — капітан, далі по порядку команди. Бліц, опитування, хмара, чужа клітинка поля й чужа драбина чергу не рухають. Вибір капітана чергу не рухає (задача 4).
6. **Чернетки й підказки.** Товариші й пульт бачать чернетку відповідача, не капітана. «Ще підказка» — у відповідача (задачі 5, 6, 7).
7. **Стан.** Версія 20, 19 читається. Без міграції бази (задачі 3, 6).
8. **Вигляд.** Смужка капітана на 375 px без горизонтальної прокрутки. Рядок сцени в один рядок у 1280 × 720 і нічого не виштовхує. Банер «Ти відповідаєш за команду» над запитанням. Кадри `p12g-*`.

---

### Задача 1. Shared: режими, поле налаштувань, помилка `not_answerer`, подія `player:pick-answerer`

**Files:**
- Modify: `packages/shared/src/teams.ts`, `quiz.ts`, `game.ts`, `events.ts`; `apps/web/src/i18n.ts`
- Test: `packages/shared/src/teams.test.ts`, тест схеми вікторини з командами (`quiz.test.ts` чи той, де перевіряється `teamsSettingsSchema`)

**Interfaces:**
- `packages/shared/src/teams.ts` (лише `import type` з `./quiz`, як зараз):
  ```ts
  /** Хто відповідає за команду (12g): капітан; кого вибере капітан; по черзі (капітан може перебити вибором). */
  export const ANSWERER_MODES = ['captain', 'chosen', 'rotate'] as const;
  export type AnswererMode = (typeof ANSWERER_MODES)[number];
  /** Обсяг вибору капітана (12g): одне наступне запитання чи до кінця раунду. */
  export const ANSWERER_SCOPES = ['question', 'round'] as const;
  export type AnswererScope = (typeof ANSWERER_SCOPES)[number];
  /** Скільки виборів player:pick-answerer людина може надіслати за секунду; понад — too_soon. */
  export const ANSWERER_PICKS_PER_SECOND = 4;
  /** Режим вікторини; немає поля чи соло — 'captain' (як до 12g). */
  export function answererModeOf(teams: Pick<TeamsSettings, 'answerer'> | undefined | null): AnswererMode;
  ```
- `quiz.ts`, `teamsSettingsSchema` (після `names`):
  ```ts
  /** Хто відповідає за команду (12g); немає поля — капітан. */
  answerer: z.enum(ANSWERER_MODES).optional(),
  ```
- `game.ts`, `ErrorCode` (після `not_duelist`):
  ```ts
  /** Командна гра (12g): за команду зараз відповідає інша людина (вибрана капітаном чи по черзі). */
  | 'not_answerer'
  ```
- `events.ts`:
  ```ts
  /** Вибір відповідача (12g): людина з команди капітана (null — без вибору: капітан чи черга) і обсяг. */
  export const pickAnswererSchema = z.object({ memberId: playerId.nullable(), scope: z.enum(ANSWERER_SCOPES) });
  ```
  `ClientToServerEvents`, після `'player:duelist'`:
  ```ts
  /** Командна гра (12g): капітан вибирає, хто відповідає з наступного запитання. */
  'player:pick-answerer': (payload: z.infer<typeof pickAnswererSchema>, ack: Ack) => void;
  ```
- `apps/web/src/i18n.ts`:
  ```ts
  err_not_answerer: 'За команду зараз відповідає інша людина.',
  err_not_captain: 'Це робить капітан команди.',
  ```

- [ ] **Step 1: Write the failing tests**
  - `teams.test.ts`:
    ```ts
    it('answererModeOf: no field and solo are the captain; the field wins (12g)', () => {
      expect(answererModeOf(undefined)).toBe('captain');
      expect(answererModeOf({})).toBe('captain');
      expect(answererModeOf({ answerer: 'rotate' })).toBe('rotate');
      expect([ANSWERER_MODES, ANSWERER_SCOPES, ANSWERER_PICKS_PER_SECOND]).toEqual([['captain', 'chosen', 'rotate'], ['question', 'round'], 4]);
    });
    ```
  - Схема:
    - `quizSchema` з `teams: { count: 2, names: ['Червоні', 'Сині'], answerer: 'chosen' }` проходить;
    - `answerer: 'host'` — помилка;
    - без поля — проходить, і в результаті ключа `answerer` немає;
    - `pickAnswererSchema.safeParse({ memberId: null, scope: 'round' }).success` → `true`; `{ memberId: 'x', scope: 'game' }` → `false`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared` → FAIL.
- [ ] **Step 3: Implement.** JSDoc українською на кожному експорті.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src apps/web/src/i18n.ts
  git commit -m "feat(shared): who answers for a team — the captain, the one the captain picks or in turn, a pick for one question or the round, the optional team setting that keeps old quizzes on the captain, the not_answerer error and the player:pick-answerer event
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 2. Shared: поля зрізів команд; заглушки й фікстури

**Files:**
- Modify: `packages/shared/src/views.ts`; заглушки — `packages/engine/src/views.ts`
- Modify (фікстури): див. «Порядок збирання» і все, на що вкаже `pnpm typecheck`

**Interfaces:**
- `packages/shared/src/views.ts`:
  - `TeamView` (після `captainId`):
    ```ts
    /** Хто відповідає за команду (12g): на запитанні, закритому чи розкритому, й на випробуванні — зараз; між запитаннями — на наступному. null — команда порожня. */
    answererId: string | null;
    ```
  - `TeamsView` (після `form`):
    ```ts
    /** Режим «Хто відповідає» вікторини (12g). */
    answerer: AnswererMode;
    ```
  - `PlayerTeam` (після `captain`):
    ```ts
    /** Хто відповідає за мою команду (як TeamView.answererId). */
    answererId: string | null;
    /** Я відповідаю за команду. */
    answerer: boolean;
    answererMode: AnswererMode;
    /** Я — капітан, режим не 'captain', етап між запитаннями: можна вибрати відповідача. */
    canPickAnswerer: boolean;
    /** Вибір капітана, що ще діятиме; null — немає (відповідає капітан чи черга). */
    answererPick: { memberId: string; scope: AnswererScope } | null;
    ```
  - JSDoc `PlayerTeam.canAct`: «… на запитанні й випробуванні — той, хто відповідає (12g); поза ними — капітан».
- Заглушки до задачі 5 (`packages/engine/src/views.ts`):
  - `teamsView`: `answerer: 'captain'`, у кожній команді `answererId: captainOf(state, t.id)`;
  - `playerTeam`: `answererId: captainId`, `answerer: captainId === member.id`, `answererMode: 'captain'`, `canPickAnswerer: false`, `answererPick: null`.

- [ ] **Step 1: Write the failing test.** `pnpm typecheck` падає на фікстурах — це і є «тест» задачі. Нових `it` немає.
- [ ] **Step 2: Run** `pnpm typecheck` → FAIL.
- [ ] **Step 3: Implement.** Нові поля обов'язкові. Фікстури — значеннями з «Порядку збирання». Логіки поза заглушками не додавати.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=1 apps/server && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages apps/server/src apps/web/src
  git commit -m "feat(shared): team views name who answers for each team and the mode, and the member view says whether I answer, may pick and what pick is waiting, with captain stubs until the engine fills them
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 3. Рушій: стан `answerers` і `turns`, хто відповідає, вибір капітана, версія 20

**Files:**
- Create: `packages/engine/src/answerer.ts`, `packages/engine/src/answerer.test.ts`
- Modify: `packages/engine/src/game.ts`, `teams.ts` (`export const withTeams`), `restore.ts`, `restore.test.ts`, `testing/teams.ts`, `index.ts` (`export * from './answerer';`)

**Interfaces:**
- `game.ts`: `export interface AnswererPick` і `export interface AnswererTurn` — дослівно з рішень плану («Стан»), з JSDoc на кожному полі. `TeamsState` (після `duelists`):
  ```ts
  /** Вибір капітана (12g): хто відповідає за команду з запитання fromQuestion; немає ключа — капітан чи черга. */
  answerers?: Record<string, AnswererPick>;
  /** Черга «по черзі» (12g): кому черга дала останнє запитання; немає ключа — черга ще не почалася. */
  turns?: Record<string, AnswererTurn>;
  ```
- `restore.ts`:
  - коментар версії: `* 20 — 12g: TeamsState.answerers (вибір капітана) і TeamsState.turns (черга), TeamsSettings.answerer.`;
  - `GAME_STATE_VERSION = 20`;
  - пояснення: `* 19 → 20 лише додала необов'язкові TeamsState.answerers і turns та TeamsSettings.answerer, а стан версій 2–19 не може містити ні вибору відповідача, ні черги, ні режиму (без них — капітан): тож кімната, збережена до розгортання 12g, теж відновлюється.`;
  - `READABLE_STATE_VERSIONS = [2, …, 18, 19, GAME_STATE_VERSION]`.
- `testing/teams.ts`: `teamQuiz(rounds: Round[], count = 2, answerer?: AnswererMode): Quiz` — `answerer` лягає в `settings.teams`, якщо задане.
- `answerer.ts` (імпортує `teams.ts`, `game.ts` під час виклику, `team-act.ts` для `actorOf`, `survival.ts` для `trialOpen`):
  ```ts
  /** Етапи між запитаннями, коли капітан може вибрати відповідача. */
  export const ANSWERER_PICK_PHASES: readonly Phase[] = ['guide', 'intro', 'board', 'wager', 'locked', 'reveal', 'leaderboard', 'round_end'];
  /** Режим гри: answererModeOf(state.quiz.settings.teams). */
  export function answererMode(state: GameState): AnswererMode;
  /** Вибір, що діє на запитанні q (план 12g, «Хто відповідає»); null — немає. */
  export function activePick(state: GameState, teamId: string, q: number): AnswererPick | null;
  /** Вибір, що ще діятиме (його запитання не відкрито чи «на раунд» поточного раунду); null — немає. */
  export function upcomingPick(state: GameState, teamId: string): AnswererPick | null;
  /** Наступний по черзі на зв'язку після turns[teamId]; без запису — з капітана; нікого — капітан. */
  export function queueNext(state: GameState, teamId: string): string | null;
  /** Хто відповідає на поточному запитанні: вибір, черга, капітан; поза зв'язком — капітан; бліц і опитування — капітан. */
  export function answererOf(state: GameState, teamId: string): string | null;
  /** Хто відповідатиме на наступному запитанні (для зрізів між запитаннями). */
  export function nextAnswerer(state: GameState, teamId: string): string | null;
  /** Для зрізів: question / locked / reveal / відкрите випробування — answererOf; інакше nextAnswerer. */
  export function shownAnswerer(state: GameState, teamId: string): string | null;
  /** Капітан вибирає відповідача (null — прибрати вибір). Коди — план 12g, «Вибір». */
  export function pickAnswerer(state: GameState, personId: string, memberId: string | null, scope: AnswererScope): Result;
  /** Після відкриття запитання: пришпилити раунд виборам цього запитання; у rotate — черга командам actingTeams без вибору. */
  export function startAnswerers(state: GameState): GameState;
  ```
  - `startAnswerers` у цій задачі не підключено до `openQuestion` (задача 4). Тести викликають його напряму після `next`.
  - Без зміни (соло, режим `captain` без `rotate`, нема що пришпилити) `startAnswerers` повертає той самий об'єкт.

- [ ] **Step 1: Write the failing tests** (`answerer.test.ts`).
  - Стан: `teamGame(teamQuiz([classicRound('r1', [single, withId(single, 'q2'), withId(single, 'q3')]), classicRound('r2', [withId(single, 'q4')])], 2, 'chosen'), [['Оля', 'Петро', 'Іра'], ['Марко', 'Ната']])` з `./testing/teams`.
    - Люди: `m1` Оля, `m2` Петро, `m3` Іра — `t1`, капітан Оля; `m4` Марко, `m5` Ната — `t2`.
    - Етап `intro` — між запитаннями.
  ```ts
  it('a pick for one question: Петро answers the next question only, then the captain again', () => {
    let s = must(pickAnswerer(intro, 'm1', 'm2', 'question'));
    expect(s.teams?.answerers?.t1).toEqual({ memberId: 'm2', scope: 'question', fromQuestion: 0, roundIndex: null });
    expect(nextAnswerer(s, 't1')).toBe('m2');
    s = startAnswerers(must(next(s, T0, rng)));
    expect(s.teams?.answerers?.t1.roundIndex).toBe(0);
    expect(answererOf(s, 't1')).toBe('m2');
    expect(answererOf(s, 't2')).toBe('m4');
    s = toNextQuestion(s); // lock → reveal → leaderboard → next, + startAnswerers
    expect(answererOf(s, 't1')).toBe('m1');
  });
  ```
  Окремі `it`:
  - **на раунд:** вибір «на раунд» на `intro` → Іра на q1, q2, q3; на q4 (раунд 2) — капітан; `upcomingPick` на `round_end` → `null`;
  - **на раунд з останнього розкриття:** вибір «на раунд» на розкритті q3 → діє на q4 (раунд 2), а не зникає;
  - **заміна:** «на раунд» Петро, потім «одне запитання» Іра → q наступне — Іра, потім — капітан (вибір «на раунд» замінено);
  - **зняття:** `pickAnswerer(…, null, 'question')` прибирає `answerers.t1`;
  - **поза зв'язком:** Петро вибраний і поза зв'язком (`memberConnected(…, 'm2', false, …)`) → `answererOf` = `m1`; повернувся → `m2`;
  - **капітан поза зв'язком:** вибраний Петро на зв'язку, Оля ні → `m2`; Петро теж ні → новий капітан (`captainOf`) Іра;
  - **помилки:**
    - режим `captain` (вікторина без `answerer`) → `wrong_phase`;
    - соло-гра → `wrong_phase`;
    - на `question` → `wrong_phase`; у лобі → `wrong_phase`;
    - некапітан Петро → `not_captain`;
    - людина іншої команди (`m4`) → `not_found`; неіснуюча людина → `not_found`;
    - на паузі між запитаннями — можна;
  - **бліц і опитування:** вибраний Петро, а запитання — бліц-раунд чи `poll` → `answererOf` = капітан;
  - **черга** (вікторина `rotate`):
    - q1 — Оля (перший хід — капітан), q2 — Петро, q3 — Іра, q4 — знову Оля;
    - у `t2` — Марко, Ната, Марко, Ната;
    - `turns.t1` після q2 — `{ questionIndex: 1, memberId: 'm2' }`;
    - Петро поза зв'язком перед q2 → q2 — Іра (Петра пропущено), q3 — Оля;
    - вибір капітана на q2 (Оля «одне запитання» вибирає себе) → q2 — Оля, `turns.t1` не змінено; q3 — Петро (черга стоїть, потім іде далі);
    - бліц-запис між ними чергу не рухає;
    - на полі черга рухається лише в команди, що вибрала клітинку;
  - **`shownAnswerer`:** на `question` — `answererOf`; на `leaderboard` — `nextAnswerer`;
  - **`queueNext`:** людину з `turns` вилучено → старт з капітана.
  - `restore.test.ts`:
    - запис `KEYS[20]`, рядки `STATE_SHAPE`, `add(...)` — за «Порядком збирання»;
    - `representative()` + командна гра `rotate` після першого запитання з вибором «на раунд» (`roundIndex` пришпилено) і записом черги;
    - стан версії 19 читається;
    - стан з вибором і чергою переживає `roundTrip` і `suspend`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/answerer.test.ts packages/engine/src/restore.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Перевірити пошуком, що `answerer.ts` не імпортує `views.ts`, а `teams.ts` не імпортує `answerer.ts`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine/src
  git commit -m "feat(engine): who answers for a team (state version 20, version 19 still restores) — between questions the captain picks a teammate for the next question or the rest of the round, the rotate mode hands the questions round the team starting with the captain and skipping whoever is offline, an offline pick falls back to the captain, and blitz and polls stay as they were
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 4. Рушій: хто діє в кожному режимі, черга на відкритті запитання, вилучення

**Files:**
- Create: `packages/engine/src/game.teams-answerer.test.ts`
- Modify: `packages/engine/src/team-act.ts`, `game.ts`, `teams.ts`

**Interfaces:**
- `team-act.ts`:
  - `export type TeamAct = 'captain' | 'answer' | 'buzz' | 'vote' | 'duel' | 'self' | 'answerer';` (JSDoc: «answerer — той, хто відповідає за команду на поточному запитанні (12g): бафи, блеф, ланцюжок, сортування, стіна, випробування, підказки драбини»);
  - внутрішня:
    ```ts
    /** Відповідач команди (12g): answererOf === memberId → команда; інакше not_captain у режимі captain (як до 12g) чи not_answerer. */
    function answererActor(state: GameState, memberId: string, team: string): Actor;
    ```
  - `actorOf`:
    - `case 'answer'`: після перевірок опитування й бліцу — `return answererActor(state, memberId, team);` (замість `break`);
    - `case 'answerer'`: `return answererActor(state, memberId, team);`.
- `game.ts`, `openQuestion`: `return fireDebuffs(startAnswerers(opened), at);`.
- `teams.ts`:
  - `dropMember`: у `withTeams(…)` ще `answerers: withoutPicksOf(state.teams.answerers, [memberId])`;
  - `withoutTeam`: без ключа команди в `answerers` і `turns`;
  - внутрішня:
    ```ts
    /** Вибори відповідачів без цих людей; undefined лишається undefined (старі стани без ключа). */
    function withoutPicksOf(picks: Record<string, AnswererPick> | undefined, ids: string[]): Record<string, AnswererPick> | undefined;
    ```

- [ ] **Step 1: Write the failing tests** (`game.teams-answerer.test.ts`; склад — як у задачі 3, `const rng = () => 0`):
  ```ts
  it('the picked teammate answers for the team and the captain gets not_answerer', () => {
    const s = must(next(must(pickAnswerer(intro, 'm1', 'm2', 'question')), T0, rng));
    expect(actAnswer(s, 'm1', RIGHT, T0 + 1000)).toEqual({ ok: false, error: 'not_answerer' });
    const answered = must(actAnswer(s, 'm2', RIGHT, T0 + 1000));
    expect(recordOf(answered, 0, 't1')).toMatchObject({ answer: RIGHT });
  });
  ```
  Окремі `it` (матриця `actorOf` для кожної дії в кожному режимі):
  - **режим `captain`:** `actorOf(…, 'answer' | 'answerer' | 'captain')` — лише капітан, решта `not_captain` (як до 12g); `turns` не з'являється після `next`;
  - **режим `chosen`, вибрано Петра:**
    - `answer`, `answerer` — `m2` → `t1`, `m1` і `m3` → `not_answerer`;
    - `captain` — лише `m1`;
    - `vote`, `self` — кожен сам;
    - `duel` — дуелянт;
    - `buzz` — команда;
  - **режим `rotate`:** на q2 `actorOf(…, 'answer')` → лише Петро;
  - **бліц** (бліц-раунд, режим `chosen`, вибрано Петра): натискає будь-хто, відповідає той, хто натиснув; без натиснувшого — капітан, як до 12g;
  - **опитування й хмара:** кожен сам у всіх режимах;
  - **«Хто я?» у власному темпі (12c):** `openClue` через `actorOf(…, 'answer')` — Петро відкриває, Оля → `not_answerer`; `clueOpens` — під `t1`;
  - **фінал:** ставка — `actorOf(…, 'captain')` лише Оля; відповідь у фіналі — Петро;
  - **«Ва-банк»:** відповідь — Петро; `decideWipeout` через `actorOf(…, 'captain')` — Оля;
  - **«Мільйонер»:** учасник `t1`; відповідь і `actorOf(…, 'answerer')` (підказки) — Петро; рішення — Оля;
  - **поле:** клітинку вибирає Оля (`captain`), відповідає Петро;
  - **«Вибування»:** на відкритому випробуванні `actorOf(…, 'answerer')` — той, хто відповідав на запис раунду; вибір, зроблений на цій таблиці, — з наступного запитання;
  - **черга на відкритті:** `next` сам пише `turns` (без ручного `startAnswerers`);
  - **вилучення:**
    - Петра вибрано, Петра вилучено (`dropMember`) → `answerers.t1` немає, відповідає капітан;
    - команду вилучено → немає `answerers.t2` і `turns.t2`;
  - **автопілот:** `createAutopilotGame` з командною вікториною `chosen` без жодного вибору — `planAutopilot` іде як раніше, відповідає капітан; з вибором — відповідає вибраний (гра не чекає нічого нового).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/game.teams-answerer.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Наявні `game.teams-act.test.ts`, `game.teams.test.ts`, `game.teams-formats.test.ts` мають лишитися зеленими без змін.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine/src
  git commit -m "feat(engine): the team answerer acts — answers (final, wipeout, ladder and board included), buffs, ladder lifelines, own-pace clues, bluff, chain, sort, wall and the survival trial go to whoever answers while cell picks, wagers, decisions, duels, debuffs and appeals stay with the captain; blitz, duels, polls and clouds keep their rules, every question opening moves the turn, and kicks drop stale picks
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 5. Рушій: зрізи всіх ролей і «діє: …» на пульті

**Files:**
- Create: `packages/engine/src/views.teams-answerer.test.ts`
- Modify: `packages/engine/src/views.ts`, `live.ts`

**Interfaces:**
- `views.ts`:
  - `teamsView`:
    - `answerer: answererMode(state)`;
    - у кожній команді `answererId: state.phase === 'lobby' ? captainOf(state, t.id) : shownAnswerer(state, t.id)`;
  - `playerTeam`:
    - `answererId = teamId === null || lobby ? captainId : shownAnswerer(state, teamId)`;
    - `answerer: answererId === member.id`;
    - `answererMode: answererMode(state)`;
    - `canPickAnswerer: teamId !== null && captainId === member.id && answererMode(state) !== 'captain' && ANSWERER_PICK_PHASES.includes(state.phase)`;
    - `answererPick`: `upcomingPick(state, teamId)` → `{ memberId, scope }`, інакше `null`;
  - `canActNow`: перед рядком «Поза запитанням — капітан» — `if (state.phase === 'leaderboard' && trialOpen(state)) return actorOf(state, memberId, 'answerer').ok;`.
- `live.ts`, `actingNickname`: типовий третій аргумент — `(teamId) => answererOf(state, teamId)`. Дуель (`duelistOf`) і бліц (`blitzActor`) — як були.

- [ ] **Step 1: Write the failing tests** (`views.teams-answerer.test.ts`):
  - **режим `captain`:** `stageView(s).teams` — `answerer: 'captain'`, `answererId` = капітан; `playerView(s, 'm2').team` — `answerer: false`, `canPickAnswerer: false`, `answererPick: null`;
  - **смужка:**
    - режим `chosen` на `intro`: капітан `m1` — `canPickAnswerer: true`; `m2` — `false`;
    - на `question` — `false` для всіх;
  - **після вибору** Петра «на раунд» на `intro`:
    - `m1` — `answererPick: { memberId: 'm2', scope: 'round' }`;
    - `TeamView.answererId` `t1` — `m2` (наступне запитання);
    - на `question` — `m2`, у `m2` `answerer: true`, `canAct: true`; у `m1` — `canAct: false`;
    - сцена, пульт і телефони `t2` бачать той самий `answererId`;
  - **ставка фіналу:** на `wager` `canAct` лише в капітана, навіть з вибраним Петром;
  - **випробування «Вибування»:** на відкритому випробуванні `canAct` — у відповідача;
  - **черга:** режим `rotate` на q2 — `answererId` `t1` = Петро; на таблиці після q2 — Іра (наступна);
  - **пульт:** `hostView(s).live.rows` рядок `t1` — `actor: 'Петро'`; у дуелі — дуелянт (як було);
  - **поза зв'язком:** Петро вибраний і поза зв'язком → `answererId` = капітан, `actor: 'Оля'`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/views.teams-answerer.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Заглушки задачі 2 замінити.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine/src
  git commit -m "feat(engine): every role sees who answers for each team now or next, the captain's phone may pick between questions and sees the waiting pick, the answerer's phone acts on questions and survival trials while wagers and decisions stay with the captain, and the host live row names the answerer
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 6. Сервер: дії відповідача, чернетки, подія `player:pick-answerer`, частота, версія

**Files:**
- Create: `apps/server/src/rooms/manager.answerer.test.ts`
- Modify: `apps/server/src/rooms/manager.ts`, `socket.ts`, `rooms/manager.drafts.test.ts`, `rooms/manager.restore.test.ts`
- Test: `manager.answerer.test.ts`, `socket.test.ts`, `manager.drafts.test.ts`, `manager.restore.test.ts`

**Interfaces:**
- `manager.ts`:
  - `this.act(room, playerId, 'captain')` → `'answerer'` у методах `guess`, `sort`, `tilt`, `wall`, `lie`, `bluff`, `trial`, `door`, `buff`, `lifeline`, `hint`, `retry`. Решта — без змін (список — у рішеннях плану).
  - `draftStage`: випробування — `act: 'answerer'`; JSDoc поля `act`: «на запитанні — як за відповідь (у бліці той, хто натиснув), на виживанні — той, хто відповідає (12g)».
  - `Room` (після `appealRate`):
    ```ts
    /** Вікно частоти player:pick-answerer (12g), як appealRate. Лише в пам'яті. */
    pickRate: Map<string, { from: number; count: number }>;
    ```
    Порожня мапа там само, де `appealRate` (створення й відновлення кімнати). `kick` прибирає людину з неї.
  - Метод поруч із `duelist`:
    ```ts
    /** Командна гра (12g): капітан вибирає відповідача з наступного запитання; понад ANSWERER_PICKS_PER_SECOND за секунду — too_soon. */
    pickAnswerer(room: Room, playerId: string, memberId: string | null, scope: AnswererScope): AckResult {
      if (!this.alive(room)) return this.gone();
      // частота — як appealVote (room.pickRate)
      return this.apply(room, pickAnswerer(room.state, playerId, memberId, scope));
    }
    ```
- `socket.ts`, поруч із `player:duelist`:
  ```ts
  on('player:pick-answerer', (args) => {
    if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
    const payload = pickAnswererSchema.safeParse(payloadOf(args));
    return payload.success ? manager.pickAnswerer(room, identity.playerId, payload.data.memberId, payload.data.scope) : INVALID;
  });
  ```
  Подія від гравця, тож автор автопілота діє як звичайний гравець (капітан своєї команди).

- [ ] **Step 1: Write the failing tests**
  - `manager.answerer.test.ts` (за зразком `manager.clues-self.test.ts` і `manager.drafts.test.ts`: `startTeamGame` з `../testing/team-game`, `FakeScheduler`, `HOST`):
    - **вибір і відповідь:** вікторина `chosen`; на заставці раунду Оля (капітан) — `manager.pickAnswerer(room, olya, petro, 'question')` → `{ ok: true }`; на запитанні `manager.answer(room, olya, …)` → `not_answerer`, `manager.answer(room, petro, …)` → `ok`;
    - **дії відповідача:** з вибраним Петром `buff` (вікторина з бафом), `lie` / `bluff` (блеф), `guess` (ланцюжок), `wall`, `sort` — Оля отримує `not_answerer`, Петро — `ok`; `trial` / `door` — на випробуванні «Вибування»; `lifeline` — у «Мільйонері»;
    - **дії капітана:** `wager`, `wipeout`, `ladderDecide`, `pick` (поле), `buyDebuff` — Петро отримує `not_captain`, Оля — `ok`;
    - **чернетка відповідача (12b):** Петро шле `player:draft`; товариш Іра отримує `team.draft`, пульт з «наживо» — у `liveDrafts`; чернетка Олі (капітана) не йде нікому;
    - **підказки 12c:** `manager.clue(room, petro)` → `ok`, `manager.clue(room, olya)` → `not_answerer`;
    - **під час запитання:** `pickAnswerer` → `wrong_phase`;
    - **некапітан:** Петро вибирає → `not_captain`;
    - **частота:** п'ятий вибір за секунду → `too_soon`;
    - **режим `captain`:** `pickAnswerer` → `wrong_phase`; некапітан на запитанні → `not_captain` (як до 12g);
    - **автопілот:** кімната-автопілот з командною вікториною `rotate` — гра доходить до кінця раунду сама, черга міняє `actor` у живих рядках; капітан вибирає з телефона (`manager.pickAnswerer`) — працює;
    - **перезапуск:** кімната з вибором «на раунд» і чергою зберігається (`stateVersion` 20) і відновлюється з тим самим відповідачем.
  - `socket.test.ts`:
    - капітан шле `player:pick-answerer { memberId, scope: 'question' }` між запитаннями → `{ ok: true }`;
    - пульт шле → `forbidden`;
    - `{ scope: 'game' }` → `invalid`.
  - `manager.restore.test.ts`: кімната версії 19 (знімок з `stateVersion: 19`) відновлюється.
  - `manager.drafts.test.ts`: «the game state version is 20» (`toBe(20)`).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/rooms/manager.answerer.test.ts apps/server/src/socket.test.ts apps/server/src/rooms/manager.restore.test.ts apps/server/src/rooms/manager.drafts.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=1 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/src
  git commit -m "feat(server): player:pick-answerer lets the captain pick at most four times a second, buffs, bluff, chain, sort, wall, survival trials and ladder lifelines come from whoever answers, teammates and the host see the answerer's draft, the bot room plays rotate by itself, and version 19 rooms still restore
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 7. Веб, телефон: смужка капітана, «Ти відповідаєш за команду», товариші, бафи й дебаф

**Files:**
- Create: `apps/web/src/screens/AnswererPicker.tsx`, `AnswererPicker.test.tsx`
- Modify: `apps/web/src/screens/TeamBar.tsx`, `TeamWatch.tsx`, `PlayerScreen.tsx`, `i18n.ts`, `styles.css`
- Test: `AnswererPicker.test.tsx`, `TeamBar.test.tsx`, `TeamWatch.test.tsx`, `PlayerScreen.test.tsx`

**Interfaces:**
- `screens/AnswererPicker.tsx`:
  ```ts
  /**
   * Смужка капітана (12g): «Відповідає:» і кнопки людей команди на зв'язку (своя — «Я»), у rotate ще «Черга»; перемикач «на весь раунд».
   * Шле player:pick-answerer { memberId, scope }; у chosen «Я» — memberId null. Зміна перемикача з наявним вибором шле той самий memberId з новим scope.
   * Немає team.canPickAnswerer — нічого.
   */
  export function AnswererPicker({ view, send, onError }: { view: PlayerView; send: Send; onError: (text: string | null) => void }): JSX.Element | null;
  ```
  - Розмітка: `section.answerer-picker` → `p.lead` «Відповідає:», `div.answerer-options` (кнопки `btn answerer-option` з `aria-pressed`), `label.field-check` з чекбоксом «на весь раунд», `p.meta.answerer-hint`.
  - `aria-pressed`:
    - вибрана людина (`answererPick.memberId`);
    - без вибору в `chosen` — «Я»;
    - у `rotate` — «Черга».
  - Кнопки неактивні під час `guard.busy`.
- `TeamBar.tsx`: між гілками натиснувшого й капітана —
  `team.answererId !== null && team.answererId !== team.captainId ? (team.answerer ? t('teamYouAnswerBar') : t('teamAnswererBar', { name: memberName(view, team.answererId) })) : …`.
- `TeamWatch.tsx`:
  - `const other = team.answererId !== null && team.answererId !== team.captainId;`
  - `lead`: бліц — як був; `other` → `t('teamWatchAnswerer', { name: memberName(view, team.answererId) })`; інакше `teamWatchLead`;
  - `mark`: `other` → `teamDraftNeutral`;
  - блеф: `other` → `t('teamAnswererDecides', { name })`, інакше `teamCaptainDecides`.
- `PlayerScreen.tsx`:
  - `<AnswererPicker view={view} send={send} onError={setError} />` одразу після `DuelistPicker`;
  - `const answering = team === null || team.answerer;`
    - `debuff = answering ? me.debuff : null`;
    - `BuffRow` і `LadderLifelines` — за `answering` (було `captain`);
    - `DebuffStrip` — `team !== null && !answering && me.debuff !== null`; текст — `teamCaptainDebuff`, коли відповідає капітан, інакше `teamAnswererDebuff`;
  - банер над `h1` на `question`: `team !== null && team.answerer && team.answererMode !== 'captain'` → `<p className="lead team-answerer-banner">{t('teamYouAnswer')}</p>`. Рядок `.team-you-answer` під полем — лише в режимі `captain`;
  - випробування «Вибування» для того, хто не відповідає: `team.answererId !== team.captainId` → `t('teamAnswererDecides', { name })` замість `teamCaptainDecides`; позначка чернетки — `teamDraftNeutral`.
- `i18n.ts`:
  ```ts
  answererPickLead: 'Відповідає:',
  answererMe: 'Я',
  answererQueue: 'Черга',
  answererRound: 'на весь раунд',
  answererHintQuestion: 'Діє з наступного запитання',
  answererHintRound: 'Діє до кінця раунду',
  teamYouAnswerBar: 'Ти відповідаєш',
  teamAnswererBar: 'Відповідає {name}',
  teamWatchAnswerer: 'Відповідає {name} — радьте вголос',
  teamAnswererDecides: '{name} вирішує за команду…',
  teamAnswererDebuff: 'Дебаф у того, хто відповідає: {name}',
  ```
- `styles.css`:
  - `.answerer-picker` — як `.duelist-picker`;
  - `.answerer-options` — `flex-wrap: wrap`, кнопки не ширші за 375 − 32 px;
  - `.team-answerer-banner` — смуга кольору команди над запитанням.

- [ ] **Step 1: Write the failing tests** (фікстури — `team-test-view.ts`):
  - `AnswererPicker.test.tsx` (`send = vi.fn().mockResolvedValue({ ok: true })`):
    - `canPickAnswerer: false` → нічого;
    - `chosen`, капітан Оля — кнопки «Я», «Петро»; Ната поза зв'язком — немає; «Я» `aria-pressed="true"`;
    - «Петро» → `send('player:pick-answerer', { memberId: 'u3', scope: 'question' })`;
    - чекбокс «на весь раунд», потім «Петро» → `scope: 'round'`;
    - з `answererPick: { memberId: 'u3', scope: 'question' }` перемикач шле `{ memberId: 'u3', scope: 'round' }`; «Петро» `aria-pressed="true"`, підказка «Діє з наступного запитання»;
    - `chosen`: «Я» шле `memberId: null`; `rotate`: є «Черга» (`null`), а «Я» шле `memberId: 'u2'`;
    - помилка `wrong_phase` → `onError('…')`.
  - `TeamBar.test.tsx`: `answererId: 'u3'` у Петра (`memberId: 'u3', answerer: true`) — «Ти відповідаєш»; в Олі — «Відповідає Петро»; `answererId` = капітан — «Ти капітан» (як було).
  - `TeamWatch.test.tsx`: `answererId: 'u3'` → «Відповідає Петро — радьте вголос», позначка «чернетка»; блеф — «Петро вирішує за команду…»; `answererId` = капітан — тексти як були.
  - `PlayerScreen.test.tsx`:
    - Петро-відповідач у режимі `chosen` на `question` — `.team-answerer-banner` «Ти відповідаєш за команду» стоїть перед `h1`, поле відповіді є, `.team-you-answer` немає;
    - Петро бачить `BuffRow`, Оля (капітан, не відповідає) — ні; `DebuffShop` — лише в Олі;
    - дебаф команди — ефект `DebuffZone` у Петра; в Олі — `DebuffStrip` «Дебаф у того, хто відповідає: …»;
    - Оля на `intro` з `canPickAnswerer: true` — `.answerer-picker`;
    - режим `captain` — без банера, `.team-you-answer` на місці (наявний тест 3010 без змін).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/AnswererPicker.test.tsx apps/web/src/screens/TeamBar.test.tsx apps/web/src/screens/TeamWatch.test.tsx apps/web/src/screens/PlayerScreen.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Тексти — без роду (див. «Глобальні обмеження»).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): between questions the captain's phone shows «Відповідає: [Оля] [Петро] [Я]» with «на весь раунд» (and «Черга» in turns), the answerer sees «Ти відповідаєш за команду» above the question with the buffs, lifelines and any debuff effect, teammates read «Відповідає Петро — радьте вголос» with the draft, and the captain keeps the shop and duels
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 8. Веб, сцена, пульт і редактор: «відповідає: Оля», 🎤, «Хто відповідає»

**Files:**
- Create: `apps/web/src/screens/StageAnswerers.tsx`, `StageAnswerers.test.tsx`
- Modify: `apps/web/src/screens/StageScreen.tsx`, `HostTeams.tsx`, `apps/web/src/editor/TeamsEditor.tsx`, `i18n.ts`, `styles.css`
- Test: `StageAnswerers.test.tsx`, `StageScreen.test.tsx`, `HostTeams.test.tsx`, `editor/TeamsEditor.test.tsx`

**Interfaces:**
- `screens/StageAnswerers.tsx`:
  ```ts
  /**
   * Рядок сцени (12g): «Червоні — відповідає: Оля · Сині — відповідає: Марко» в один рядок.
   * Лише командна гра з режимом не captain, на question / locked / reveal, без бліцу, опитування й хмари;
   * на полі — лише команда, що вибрала клітинку (board.turn); у «Мільйонері» — лише учасник. Інакше нічого.
   */
  export function StageAnswerers({ view }: { view: StageView }): JSX.Element | null;
  ```
  - Розмітка: `p.stage-answerers` → на команду `span.stage-answerer.team-{color}` з `span.team-dot`, `strong` (назва) і `t('stageAnswerer', { name })`.
  - Нікнейм — з `TeamView.members` за `answererId`.
- `StageScreen.tsx`: `<StageAnswerers view={view} />` одразу після `</header>` у `stage-question`.
  - Рядок має сталу висоту (`min-height` одного рядка): поява не зсуває запитання між question і reveal.
  - `expectStageInView` 1280 × 720 має проходити.
- `HostTeams.tsx`, `TeamPeople`: біля нікнейма `member.id === team.answererId && team.answererId !== team.captainId` → `<span className="answerer-mark" role="img" aria-label={t('teamAnswererMark')}>🎤</span>`. Лише в грі: у лобі `answererId` = капітан, тож знака немає.
- `editor/TeamsEditor.tsx`:
  - під назвами команд — `label.field` з `select` (`aria-label` «Хто відповідає») і `HelpButton id="team.answerer"`;
  - значення `teams.answerer ?? 'captain'`;
  - `onChange`: `'captain'` → `onChange(withoutAnswerer(teams))`, інакше `{ ...teams, answerer }`;
  - `resize` → `onChange({ ...teams, count, names })`; `rename` уже зберігає решту полів.
- `i18n.ts`:
  ```ts
  stageAnswerer: 'відповідає: {name}',
  teamAnswererMark: 'відповідає',
  teamsAnswererLabel: 'Хто відповідає',
  teamsAnswerer_captain: 'капітан',
  teamsAnswerer_chosen: 'вибирає капітан',
  teamsAnswerer_rotate: 'по черзі',
  ```
- `styles.css`:
  - `.stage-answerers` — `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`, шрифт як `.meta` сцени;
  - `.stage-answerer + .stage-answerer::before { content: ' · ' }`;
  - `.answerer-mark` — як `.captain-mark`.

- [ ] **Step 1: Write the failing tests**
  - `StageAnswerers.test.tsx`:
    - режим `chosen`, `question`, `answererId` у «Червоних» — Петро, у «Синіх» — Марко → «Червоні», «відповідає: Петро», «Сині», «відповідає: Марко»;
    - режим `captain` → нічого;
    - бліц (`view.blitz !== null`) → нічого; `poll` → нічого;
    - поле з `board.turn` «Червоні» → лише «Червоні»;
    - `leaderboard` → нічого.
  - `StageScreen.test.tsx`: зріз `question` командної гри `rotate` → `.stage-answerers` після `header.bar` і до `h1`.
  - `HostTeams.test.tsx`: `TeamPeople` з `answererId: 'u3'`, `captainId: 'u2'` → 🎤 з `aria-label` «відповідає» біля «Петро»; `answererId` = `captainId` → знака немає.
  - `TeamsEditor.test.tsx`:
    - «Хто відповідає» показує «капітан» для `{ count: 2, names }`;
    - вибір «по черзі» → `onChange({ count: 2, names, answerer: 'rotate' })`;
    - «капітан» → без ключа `answerer`;
    - «Більше команд» з `answerer: 'chosen'` → `answerer` лишається;
    - є кнопка «Довідка: Хто відповідає».
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/StageAnswerers.test.tsx apps/web/src/screens/StageScreen.test.tsx apps/web/src/screens/HostTeams.test.tsx apps/web/src/editor/TeamsEditor.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): the 1280 × 720 stage names who answers under each team name in one line, the host team list marks the answerer with 🎤, and the quiz editor sets «Хто відповідає: капітан / вибирає капітан / по черзі» without touching old quizzes
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 9. Веб: довідка «Хто відповідає»

**Files:**
- Modify: `apps/web/src/help/teams.ts`
- Test: `apps/web/src/help/host-help.test.ts`

**Interfaces:**
- `TEAM_HELP_KEYS = ['play', ...TEAM_FORMS, 'captain', 'answerer', 'formats'] as const;`
- запис:
  ```ts
  answerer: {
    title: 'Хто відповідає',
    what: 'Капітан може передати відповідь іншій людині з команди: на одне запитання чи на весь раунд. Або гра сама передає її по колу.',
    how: [
      'У редакторі, у «Командна гра», виберіть «Хто відповідає»: капітан (як завжди), вибирає капітан або по черзі.',
      'Між запитаннями (таблиця, розкриття, заставка раунду, поле перед вибором клітинки) капітан бачить на телефоні смужку «Відповідає: [Оля] [Петро] [Я]» і перемикач «на весь раунд».',
      'Вибір діє з наступного запитання. Без перемикача — одне запитання, потім знову капітан (по черзі — наступний у колі). З перемикачем — до кінця раунду.',
      'По черзі: перше запитання — капітан, далі кожен по порядку команди; хто не на зв’язку, того коло пропускає. Капітан може перебити чергу вибором, а кнопка «Черга» повертає коло.',
      'Під час запитання того, хто відповідає, не змінити. Якщо ця людина вийшла зі зв’язку, відповідає капітан.',
      'На телефоні того, хто відповідає, — «Ти відповідаєш за команду»; товариші бачать «Відповідає Оля» і її чернетку наживо. Сцена пише під назвою команди «відповідає: Оля», а у «Відповідях наживо» — «діє: Оля».',
    ],
    points: [
      'Бали йдуть команді, як і раніше: змінюється лише те, хто з людей тисне кнопки.',
      'Що робить той, хто відповідає: подає відповідь (і у фіналі, «Ва-банк», «Мільйонері», на клітинці своєї команди), бере бафи й підказки «Мільйонера», відкриває підказки «Хто я?», пише вигадку блефу й вибирає варіант, ходить у ланцюжку, сортуванні й стіні, відповідає на випробуванні «Вибування».',
      'Що лишається капітанові: вибір клітинки й кубик на полі, ставка фіналу, «Далі / Забрати» у «Ва-банк», «Граю далі / Забираю» у «Мільйонері», дуелі й дуелянт, дебафи, апеляція й сам вибір того, хто відповідає.',
    ],
    tip: [
      '«По черзі» зручно з дітьми: кожен отримає своє запитання.',
      'Дебаф, насланий на команду, діє на телефоні того, хто відповідає: саме там поле відповіді.',
    ],
    limits: [
      'Бліц (відповідає той, хто натиснув), дуель (дуелянт), опитування й хмара (кожен сам) працюють як завжди.',
      'У грі без ведучого все так само: капітан вибирає з телефона, а без вибору відповідає капітан чи черга. Бот нічого не чекає.',
    ],
  },
  ```
- Правки:
  - `play.how[3]` → «Під час гри відповідає капітан або той, кого вибрано (див. «Хто відповідає»); решта бачить чернетку наживо на телефоні й радить уголос.»;
  - `captain.how[1]` → додати речення «Якщо у вікторині ввімкнено «вибирає капітан» чи «по черзі», відповідь, бафи й ходи переходять до того, хто відповідає.»;
  - `captain.limits[0]` → «Дебаф, насланий на команду, діє на телефоні того, хто відповідає (без вибору — капітана); решта команди бачить позначку.»;
  - `formats.how[0]` → «…: відповідає капітан (чи той, кого вибрано, — «Хто відповідає»); спроби й час — на команду.»; `formats.how[8]` — «…діють на того, хто відповідає.».

- [ ] **Step 1: Write the failing tests** (`host-help.test.ts`):
  - навмисна правка: `helpIds('teams')` — `['team.play', 'team.host', 'team.pick', 'team.random', 'team.dice', 'team.captain', 'team.answerer', 'team.formats']`;
  - новий `it('12g answerer entry follows «captain» and lists what the answerer and the captain do', …)`:
    - `text('team.answerer')` містить «вибирає капітан», «по черзі», «на весь раунд», «з наступного запитання», «Ти відповідаєш за команду», «відповідає: Оля», «бафи», «ставка фіналу», «дебафи», «апеляція», «без ведучого»;
    - без `/росі|срср/i`, без `/відповів |відповіла|вибрав |вибрала/`;
    - `searchHelp('відповідає')` містить `team.answerer`;
  - наявні перевірки `team.captain` (`наступн`, `на зв’язку`, `Відповідях наживо`, `картку капітана`) і `team.formats` (`натиснув`, `інших команд`, `кожен окремо`, `капітан`) лишаються зеленими.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/help/host-help.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Приклади — без тем росії й СРСР; текст без роду, крім уже наявних рядків довідки.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src/help
  git commit -m "feat(web): the host help entry «Хто відповідає» on the three modes, when a pick takes effect, the turn order, offline fallback, what the answerer and the captain each do and the bot game, and the team play, captain and formats entries point to it
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 10. Наскрізний сценарій 12g з кадрами

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Помічники беруться як є:
  - сторінки й кліки: `open`, `register`, `join`, `click`, `afterSplash`, `pickTeamOn`, `stageTeam`, `field`, `numericAnswer`;
  - кадри й кадри сокета: `shot`, `snapshot`, `socketFrames`;
  - перевірки: `expectNoSideScroll`, `expectStageInView`, `HEADER_ONE_LINE`, `POLL`, `exact`, `NL`, `problems`, `liveRow`;
  - вікторина: `classicRound`, `makeRoundsQuiz`.
- Текстова відповідь на телефоні: `field(page, 'Ваша відповідь').fill(…)`, потім `click(page, 'Відповісти')`.
- Вміст без тем росії й СРСР:
  ```ts
  function answererQuestions12g() {
    const common = { imageUrl: null, video: null, timeLimit: 90, points: 100 };
    const q = (id: string, text: string, accepted: string[]) => ({ ...common, id, type: 'text' as const, text, accepted });
    return [
      q('a1', 'Хто написав «Кобзар»?', ['Тарас Шевченко', 'Шевченко']),
      q('a2', 'Яка гора найвища в Україні?', ['Говерла']),
      q('a3', 'Яка річка тече через Київ?', ['Дніпро']),
      q('a4', 'Яке місто на Поділлі славиться фортецею над каньйоном Смотрича?', ['Кам’янець-Подільський', 'Кам’янець']),
    ];
  }
  ```
  - Гра A — «Відповідач 12g»: `teams: { count: 2, names: ['Червоні', 'Сині'], answerer: 'chosen' }`, раунд «Розминка» (`a1`, `a2`, `a3`), раунд «Другий» (`a4`); `speedBonus: false`.
  - Гра B — «По черзі 12g»: `answerer: 'rotate'`, один раунд (`a1`–`a4`), `speedBonus: false`.
- Пульт — телефон 375 × 812 (`host12g`), сцена — 1280 × 720 (`stage12g`, `stage12gb`). Телефони 375 × 812: Червоні — Оля (капітан, перша в команді), Петро, Іра; Сині — Марко (капітан), Ната. `stageFrames`, `markoFrames`, `nataFrames` — `socketFrames`.
- Локатори:
  - `picker(page) = page.locator('.answerer-picker')`;
  - `option(page, name) = picker(page).getByRole('button', { name, ...exact })`;
  - `stageLine(stage) = stage.locator('.stage-answerers')`.

- [ ] **Step 1: Add the scenario** у кінець файлу за зразком 12f:
  ```ts
  it('part 12g: the captain picks who answers — on a 375 phone Оля picks Петро for one question, Петро sees «Ти відповідаєш за команду» and answers while Оля cannot, teammates watch his draft that the other team never gets, the 1280 × 720 stage says «Червоні — відповідає: Петро», the 375 host row says «діє: Петро», the next question is the captain again, «на весь раунд» gives Іра the rest of the round and ends with it, the editor sets «по черзі», and in turns the stage goes Оля, Петро, Оля by the captain, Іра', async () => {
    try {
      await answerer12g();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Підготовка `answerer12g()`:**
  1. `host = open('host12g', 375, 812)`, `register(host, 'host', 'Ліна Ведуча', 'host12g@example.com')`.
  2. Обидві вікторини → `POST /api/quizzes`.
  3. Гра A: «Грати» → `code`, `stageUrl`; `stage = open('stage12g', 1280, 720)`; телефони `olya`, `petro`, `ira`, `marko`, `nata` — `join(page, code, nickname, false)`, потім `pickTeamOn(page, team)`; `stageTeam` чекає склад обох команд.
  4. «Почати гру» → `afterSplash(...all)`. Перший вибір робиться на заставці раунду (етап `intro`), тобто до «Почати раунд».

  **Кроки:**
  1. **Смужка капітана (етап `intro`).**
     - Оля: `picker(olya)` з кнопками «Я», «Петро», «Іра» і чекбоксом «на весь раунд»; «Я» `aria-pressed="true"`.
     - Марко — капітан Синіх: у нього своя смужка («Я», «Ната»). У Петра, Іри й Нати смужки немає.
     - `expectNoSideScroll(olya, 'p12g-captain-strip')`; кадр `p12g-captain-strip`.
     - Оля тисне «Петро» → «Петро» `aria-pressed="true"`, «Діє з наступного запитання».
     - У Петра `TeamBar` — «Ти відповідаєш».
  2. **a1: відповідає Петро.** `click(host, 'Почати раунд')` → `afterSplash(...all)`.
     - Петро: `.team-answerer-banner` «Ти відповідаєш за команду» над запитанням, поле «Ваша відповідь» є; `expectNoSideScroll(petro, 'p12g-phone-answerer')`; кадр `p12g-phone-answerer`.
     - Оля: поля відповіді немає (`field(olya, 'Ваша відповідь').count()` → 0), `.team-watch-lead` — «Відповідає Петро — радьте вголос».
     - Петро друкує «Шевч» → в Олі й Іри `.team-draft` «Шевч»; кадр `p12g-phone-teammate` (Оля); у `markoFrames` і `nataFrames` немає «Шевч».
     - Сцена: `stageLine(stage)` містить «Червоні», «відповідає: Петро», «Сині», «відповідає: Марко»; `expectStageInView(stage, 'p12g-stage-question')`; кадр `p12g-stage-question`.
     - Пульт: `liveRow(host, 'Червоні')` — «діє: Петро»; `HEADER_ONE_LINE`; `expectNoSideScroll(host, 'p12g-host-row')`; кадр `p12g-host-row`.
     - Петро — «Тарас Шевченко» → «Відповісти»; Марко — «Франко».
     - «Показати відповідь» → «Далі» → таблиця: у «Червоних» 100.
  3. **a2: знову капітан.** «Далі» → `afterSplash`.
     - Оля: поле відповіді є, банера немає (відповідає капітан); Петро: «Відповідає капітан Оля — радьте вголос».
     - Сцена: «Червоні — відповідає: Оля».
     - Оля — «Говерла», Марко — «Говерла» → «Показати відповідь».
  4. **«На весь раунд».** На розкритті a2 Оля вмикає «на весь раунд» і тисне «Іра» → «Діє до кінця раунду».
     - «Далі» → таблиця → «Далі» → a3: Іра відповідає («Дніпро»); сцена — «відповідає: Іра».
     - «Показати відповідь» → «Далі» → кінець раунду → «Далі» → заставка раунду «Другий»: в Олі «Я» знову `aria-pressed="true"` (вибір «на раунд» скінчився). «Почати раунд» → a4: відповідає Оля, сцена — «відповідає: Оля».
     - Оля — «Кам’янець», Марко — «Кам’янець» → «Показати відповідь» → «Далі» до `finished`.
  5. **Редактор.** `host.goto(`${base}/quizzes`)` → «По черзі 12g» → «Редагувати» → `details.teams` → `summary`:
     - `select` «Хто відповідає» має значення «по черзі»;
     - `expectNoSideScroll(host, 'p12g-editor')`; кадр `p12g-editor`.
  6. **Гра B: по черзі.** «Грати» з «По черзі 12g» → новий `code`; `stage.goto(новий stageUrl)`; ті самі п'ять телефонів `join` з новим кодом і `pickTeamOn`. «Почати гру» → `afterSplash` → «Почати раунд» → `afterSplash`.
     - a1: сцена — «Червоні — відповідає: Оля», «Сині — відповідає: Марко». Оля й Марко відповідають.
     - a2: «Петро», «Ната»; кадр `p12g-stage-rotate` (`expectStageInView`). Петро й Ната відповідають.
     - На розкритті a2 Оля тисне «Я» (у `rotate` — вибір себе на одне запитання): `option(olya, 'Я')` `aria-pressed="true"`, «Черга» — ні.
     - a3: «Червоні — відповідає: Оля» (вибір), «Сині — відповідає: Марко» (черга).
     - a4: «Червоні — відповідає: Іра» (черга стояла на Петрові й пішла далі), «Сині — відповідає: Ната».
     - «Показати відповідь» → «Далі» до `finished`.
  7. `expect(problems).toEqual([])`.
- [ ] **Step 2: Run** на передньому плані (не у фоні): `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 12g"` → PASS. Переглянути кадри `p12g-*`:
  - телефон 375: смужка капітана не ширша за екран, кнопки переносяться, чекбокс читається;
  - банер «Ти відповідаєш за команду» над запитанням, не налазить на поле;
  - товариш: лід «Відповідає Петро — радьте вголос» і чернетка;
  - сцена 1280 × 720: рядок «відповідає: …» під шапкою в один рядок, запитання не зсунуто, нічого не обрізано;
  - пульт 375: «діє: Петро» в рядку, шапка в один рядок;
  - редактор 375 — без горизонтальної прокрутки.
- [ ] **Step 3: Повний прогін — один раз, на передньому плані** (не у фоні): `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts` → усі сценарії PASS. Особливо:
  - 10j (капітан відповідає, дебаф на капітані, ставка фіналу — режим `captain`);
  - 11c, 11d, 11e (чернетки й рішення команд);
  - 11h (командне лобі бота);
  - 12b (живі вибори), 12c (підказки), 12f (апеляція);
  - 9b-перезапуски (`restart`).

  Жоден наявний сценарій не має показати смужку капітана чи рядок `.stage-answerers`. Якщо PGlite чи браузер падають від нестачі пам'яті, прогнати групами за `-t` (теж на передньому плані) і назвати це в звіті.
- [ ] **Step 4: Commit**
  ```bash
  git add apps/server/e2e
  git commit -m "test: part 12g end-to-end — on a 375 phone Оля picks Петро for one question, Петро answers under «Ти відповідаєш за команду» while Оля has no field, teammates watch his draft and the other team never gets it, the 1280 × 720 stage and the 375 host name him, the next question is the captain again, «на весь раунд» gives Іра the rest of the round only, the editor shows «по черзі», and in turns the stage goes Оля, Петро, Оля by the captain's pick, then Іра
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```
