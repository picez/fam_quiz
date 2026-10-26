# План 11h: Гра без ведучого — запуск, автор-гравець, історія

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 11h специфікації `docs/superpowers/specs/2026-10-25-after-formats-design.md` (розділ 12; що вже зробив 11g — розділ 11; рішення автора — розділ 14; відповіді власника — розділ 15). У 11g сервер навчився вести гру сам. Тепер це має інтерфейс:
- **Запуск.** Біля «Грати» у списку вікторин з'являється «Провести ботом». Вікно показує зміни з `autopilotCheck`, примітку «Ти автор і знаєш відповіді — грай чесно», нікнейм (типово нікнейм профілю) і «Створити кімнату». Після створення автор одразу на `/play/<code>` як гравець.
- **Автор на телефоні.** У лобі він бачить код, QR, посилання на сцену й «Почати гру». У шапці є «⋯» з такими пунктами:
  - «Пауза / Продовжити»;
  - «Вилучити гравця»;
  - «Завершити гру»;
  - у лобі командної гри — «Як формуємо команди»;
  - на «хмарі слів» і блефі — «Приховати…» (сховати чи повернути слово; прибрати вигадку з повідомленням `pick_first`).
- **Тексти.** На сцені в лобі — «Гру веде бот». Жоден екран гри без ведучого (телефон, сцена) не каже «ведучий» і не чекає на нього.
- **Звук без сцени** грає на телефонах. Неактивна підказка «Мільйонера» пояснює причину видимим текстом, а не лише `title`.
- **Історія.** Гра позначена «Провів бот» у списку, деталях і «Моїх іграх». Вона не рахується в «Проведені ігри» й досягненнях ведучого (`host`, `host_10`). Результат автора як гравця рахується звичайно (відповідь власника 2).
- **Довідка ведучого** отримує запис «Гра без ведучого» з ⓘ у вікні запуску.

**Перевірка пунктів, які 11g лишив на 11h (стан `main` на 1d983d6):**

| Пункт | Що вже є | Що робить 11h |
|---|---|---|
| Позначка «без ведучого» в історії | `game` без поля; `recorder.ts` пише `hostId` = автор | міграція `0013`, `game.autopilot`, поле в `GameSummary` / `GameDetail` / `PlayedGame`, позначки (задачі 2, 9) |
| «Проведені ігри» й досягнення ведучого | `profileFacts` рахує всі `finished` з `hostId` | фільтр `autopilot = false` (задача 2); `host` / `host_10` беруть `stats.hosted` і виправляються самі |
| Звук на телефонах без сцени | `withoutClip` ховає джерело від телефонів завжди; `meta.stageOnline` уже приходить усім | сервер додає `clip` у зріз гравця лише в автопілоті й без сцени (задача 3); телефон грає через `QuestionAudio` після `STAGE_GONE_MS` (задача 8) |
| Видима причина неактивної підказки | `LadderLifelines`: `disabled` + `title` + `sr-only`. На дотик нічого. Баф `hint` з `unfit_host` уже пояснює причину на дотик (`aria-disabled` + `buff-why`) | рядок під кнопками драбини завжди видно, коли є стан `'off'`; тест на баф (задача 8) |
| Вікно запуску | немає; `createGame(quizId)` лише з ведучим | задача 4 |
| Меню «⋯» автора | сервер приймає все (`manager.author`), `PlayerView.author` дає `cloud` / `bluff`. Списку людей для вилучення в зрізі гравця немає (`table` може бути лише свій рядок, `players` є тільки у сцени) | `AuthorView.people` (задача 1), меню (задача 6) |
| Старт автором у лобі | `host:start` від автора → `autopilotStart` | кнопка й панель лобі (задача 5) |
| Тексти без «ведучого» | `hostOnline` = `true` (немає «Чекаємо на ведучого»). Решта текстів телефона й сцени, що згадують ведучого, ще є | задача 7 |

**Стан гри не змінюється: `GAME_STATE_VERSION` лишається 14.**
- `AuthorView.people` — лише зріз.
- `clip` у зрізі гравця — лише зріз сервера.
- Позначка автопілота в історії — колонка бази.
- Живі ігри деплой переживають. Перевірка `live_room` за правилом 14a не потрібна, але міграція бази є. Її ставить сервер під час запуску (`migrate`).

**Архітектура:**
- **Shared.**
  - `views.ts`: `AuthorView.people: AuthorPerson[]` (`{ id, nickname, connected }`).
  - `history.ts`: `GameSummary.autopilot: boolean` (через `Omit` потрапляє і в `GameDetail`) і `PlayedGame.autopilot: boolean`.
- **Рушій.** `views.ts`: `authorView` додає `people` — люди кімнати, крім автора, у порядку входу. Соло — `players`, командна гра — `teams.members`.
- **Сервер.**
  - `drizzle/0013_game_autopilot.sql` + `meta`; `db/schema.ts`: `game.autopilot boolean not null default false`.
  - `recorder.ts`: пише `autopilot` під час першого запису.
  - `history.ts`: поле в трьох відповідях.
  - `profiles.ts`: `hosted` без автопілота.
  - `rooms/manager.ts` (`view`): `clip` для телефонів в автопілоті без сцени.
- **Веб.**
  - `api.ts`: `createAutopilotGame`, `getAutopilotCheck`.
  - `storage.ts`: `saveAuthor` / `loadAuthor` (токен сцени автора).
  - Новий `pages/AutopilotLaunch.tsx` (вікно запуску) у `pages/Quizzes.tsx`.
  - Новий `screens/AuthorLobby.tsx` (код, QR, сцена, «Почати гру»).
  - Новий `screens/AuthorMenu.tsx` («⋯» і аркуш меню).
  - Новий `live/useStageGone.ts` (винесено з `HostScreen.tsx`).
  - Правки: `PlayerScreen.tsx`, `StageScreen.tsx`, `Play.tsx`, `TeamLobby.tsx`, `DuelView.tsx`, `BluffBoard.tsx`, `LadderLifelines.tsx`, `HostCloud.tsx`, `guide-text.ts`, `live/Guide.tsx`, `RoundBriefing.tsx`, `History.tsx`, `GameHistory.tsx`, `MyGames.tsx`, `help/settings.ts`, `i18n.ts`.
- **Наскрізні тести.** Два сценарії «part 11h: …» зі справжніми сторінками: телефони 375 × 812, сцена 1280 × 720. Кадри з префіксом `p11h-`.

**Технології:** TypeScript, React 19, react-router, qrcode.react (уже є), vitest + Testing Library, Fastify + Socket.IO, Drizzle + drizzle-kit + PGlite, Playwright. Нових залежностей немає.

**Рішення плану там, де специфікація мовчить (координатор може змінити):**

*Запуск*
- Специфікація каже «поруч із «Провести гру» (список вікторин, редактор, сторінка старту)». Насправді гру зараз запускає лише кнопка «Грати» у списку вікторин (`Quizzes.tsx`). У редакторі кнопки запуску немає, а «Я ведучий» на головній веде до цього ж списку. Тому «Провести ботом» стоїть лише в списку вікторин, поруч із «Грати». Нової кнопки запуску в редакторі 11h не додає.
- Вікно запуску — аркуш як «Таблиця» (`table-sheet`, портал, `role="dialog"`; Escape і дотик повз картку закривають). Перевірку (`GET /api/quizzes/:id/autopilot`) воно робить під час відкриття.
  - Зміни перелічено за `AUTOPILOT_CHANGES`, кожна з номерами раундів («Раунд 2», «Раунди 1, 3»): 1-базові номери з 0-базових `rounds`. Назв раундів у `QuizSummary` немає, тож лише номери.
  - Змін немає — «Вікторина піде без змін».
  - Якщо `blocked` непорожній (у наявних форматах не буває), видно «Цю вікторину бот провести не може», а «Створити кімнату» вимкнено. Окремих текстів для кодів блокування немає, бо `AUTOPILOT_BLOCKS` порожній.
- Нікнейм: поле, яке заповнюється нікнеймом профілю (`getMyProfile()` → `nickname`; помилка → порожньо). Правила ті самі, що й у формі входу: 2–20 символів, `maxLength={20}`.
- Після `201`:
  - `savePlayer(code, token)`;
  - `saveAuthor(code, { stageToken })`;
  - `saveLastGame(code)`;
  - `navigate('/play/' + code)`.
- Банер «Повернутися до гри» в списку вікторин:
  - для гри з `loadAuthor(code)` веде на `/play/<code>`, а не `/host/<code>`;
  - перевірка «гра ще йде» та сама (`checkCode`);
  - якщо гра скінчилась, `clearLastGame` прибирає банер (`loadAuthor` лишається, як і `loadHost` зараз).

*Автор на телефоні*
- Токен сцени автора є лише на пристрої, з якого створено кімнату (`localStorage`). На іншому пристрої панель лобі не показує посилання на сцену: `host-access` для автопілота навмисно 404 (11g). Код і QR видно завжди.
- QR веде на `/play/<code>` (вхід гравців), як на сцені. Посилання на сцену `${origin}/stage/<code>#<stageToken>` показане текстом, з кнопками «Копіювати» (`navigator.clipboard`; без нього — лише текст) і «Відкрити» (`target="_blank"`).
- «Почати гру» — у панелі лобі, не в меню (специфікація: «кнопка в лобі»). Перед стартом кнопка не перевіряє кількість гравців: помилку повертає сервер (`errorText`).
  - Автор сам у кімнаті → рушій дозволяє `start`, як і з ведучим, і гра йде з одним гравцем.
  - Командна гра, якій не вистачає команд → `teams_few` (наявний текст).
- «Як формуємо команди» — у меню «⋯», лише в лобі командної гри. Вибір із трьох: «Гравці обирають», «Випадково», «Кубик».
  - «Розподіляю сам» (`'host'`) в автопілоті — це випадковий розподіл у мить старту (11g), тож окремою кнопкою його не показано.
  - Якщо в налаштуваннях вікторини стоїть `'host'`, жодна з трьох не позначена, а лобі каже «Команди розподілить бот, щойно автор почне гру».
- Меню «⋯» — кнопка в шапці телефона, лише коли `view.author !== null` і `phase !== 'finished'`. Пункти за етапом:

  | Пункт | Коли видно | Подія |
  |---|---|---|
  | «Пауза» / «Продовжити» | не `lobby`; підпис за `view.paused` | `host:pause` / `host:resume` |
  | «Вилучити гравця…» → список `author.people` з `connected` | завжди; порожній список — «Більше нікого немає» | `window.confirm(kickConfirm)` → `host:kick { playerId }` |
  | «Як формуємо команди» | `lobby` і `view.teams !== null` | `host:team-form { form }` |
  | «Приховати…» | `author.cloud !== null` чи `author.bluff !== null` | див. нижче |
  | «Завершити гру» | не `lobby` (рушій не завершує лобі: `wrong_phase`) | `window.confirm(endConfirm)` → `host:end` |

- «Приховати…» на «хмарі»: перевикористати `HostCloud`. Поле `by` стає необов'язковим, а `AuthorCloudWord` авторів не має. Дотик — `host:cloud-hide { key, hidden: !word.hidden }`. Слово, яке сховали, лишається в списку закресленим (повернути).
- «Приховати…» на блефі: список `author.bluff`, дотик — `window.confirm(bluffRemoveConfirm)` → `host:bluff-remove { optionId }`. Помилки показано в аркуші:
  - `pick_first` → `errorText('pick_first')` («Спершу зробіть свій вибір.»);
  - `not_allowed` → новий текст «Цей варіант прибрати не можна.» (вибраний, правда чи запасна; що саме — не кажемо).

  Наперед варіанти не вимикаємо: де «свій вибір» (автор чи його команда), знає сервер.
- Пауза автора на телефоні: банер «Пауза» в автора має кнопку «Продовжити» (той самий `host:resume`), щоб не шукати її в меню. Інші гравці бачать звичайне «Пауза».

*Тексти*
- Що вважається «екраном гри без ведучого»: усе, що рендерять `PlayerScreen` і `StageScreen` при `view.autopilot === true`, плюс повідомлення про вилучення в `Play.tsx`.
  - Форма входу (`JoinForm`: `gameGone`, `err_game_started`) лишається спільною: це ще не гра, і кімнати там може не бути.
  - Історія й довідка не входять: історія показує запис, а «Підказка ведучого» в історії «Мільйонера» — назва бафа.
- Тексти, що згадують ведучого, але в автопілоті недосяжні, не міняються:
  - ручна перевірка, «Прийняти / Перевибрати», усна клітинка й «Хто я?» вголос → `autopilotQuiz` перетворює їх;
  - коригування балів і дебафи від ведучого → в автопілоті їх немає;
  - `hintWaiting` / `hintAloud` → підказка без тексту `off`, а з текстом приходить одразу.

  Гарантує це тест-сторож задачі 7: він рендерить автопілотні зрізи досяжних етапів і шукає `/ведуч/i`.
- **Варіанти для автопілота** (нові ключі; функції отримують `autopilot: boolean`):

  | Де | Ключ зараз | Ключ в автопілоті |
  |---|---|---|
  | `Play.tsx`, вилучення | `kicked` | `kickedByAuthor` |
  | `TeamLobby.tsx`, форма `'host'` | `teamWaitHost` | `teamWaitBot` |
  | `PlayerScreen.tsx`, intro «Мільйонера» без учасника | `ladderWaitPick` | `ladderWaitDraw` |
  | `DuelView.tsx` (`duelStartText`) | `duelStartsOnContinue` | `duelStartsSoon` |
  | `BluffBoard.tsx`, запасна вигадка | `bluffSpare` | `bluffSpareQuiz` |
  | `PlayerScreen.tsx`, вибір зник | `bluffPickRemoved` | `bluffPickRemovedAuthor` |
  | `guide-text.ts`, сторінка «Телефон» | `guidePhoneScore` | `guidePhoneScoreAuto` |
  | `guide-text.ts`, «Дебафи» | `guideDebuffsLead` | `guideDebuffsLeadAuto` |
  | `guide-text.ts`, «Бафи» (`hint`) | `buffGuide_hint` | `buffGuide_hintAuto` |
  | `guide-text.ts` `roundHow` (поле; пам'ятка раунду й «Як грати») | `roundHow_board` | `roundHow_boardAuto` |

- Що `Play.tsx` знає про автопілот у мить вилучення: останній зріз (`useRef` з `view.autopilot`). Зріз зникає разом із токеном, тож прапорець треба запам'ятати до `clearPlayer`.

*Звук без сцени*
- Джерело аудіо видає назву пісні, тому телефони його досі не отримують. В автопілоті без сцени звук нема де грати, крім телефонів (розділ 11 п. 4), тож сервер додає `clip` лише тоді, коли виконано все:
  - `room.state.autopilot !== undefined`;
  - `!stageOnline(room)`;
  - етап `question` / `locked` / `reveal`;
  - `view.question?.audio != null`.

  Джерело — `audioOf(state)`. Сцена під'єдналась → наступний `changed` прибирає `clip`. Підключення й відключення сцени вже шлють `changed`.
- Телефон грає, коли `clip !== null` і сцени немає вже `STAGE_GONE_MS` (3 с, як на пульті). Грають усі телефони кімнати, бо без сцени кожен слухає свій. Автостарт, «заблоковано» й дотик для звуку — як у `QuestionAudio` на пульті. Кнопок «Ще раз» / «Стоп» немає (11g: повтору звуку немає).
- Випробування «Вибування» (`me.survival` з власним запитанням) аудіо не отримує. Як і на пульті, звук іде лише для `view.question`.

*Історія й статистика*
- Колонка `game.autopilot boolean not null default false`. Старі записи — з ведучим. `recorder.ts` пише `autopilot: state.autopilot !== undefined` у `values` першого запису; `onConflictDoUpdate` її не чіпає.
- «Провів бот» — у списку «Проведені» (`History.tsx`), деталях (`GameHistory.tsx`) і «Моїх іграх» (`MyGames.tsx`). Позначка поруч із «Командна гра» (той самий клас `team-game-mark`, новий `autopilot-mark`).
- `profileFacts`: `hosted` = `finished` з `hostId = userId` **і** `autopilot = false`. Досягнення `host` / `host_10` беруть `stats.hosted`, тож окремої правки не треба (тест є). Гравцеві-автору його рядок `participant` дає гру, перемогу, п'єдестал і решту досягнень, як будь-кому.

*Чого не робимо*
- запрошень друзів з телефона автора (`InviteFriends` лишається на пульті), відновлення токена сцени на іншому пристрої, кнопки запуску в редакторі;
- оцінок, балів, ключа відповідей, «±15 с», повтору звуку в меню автора (розділ 12 п. 3: «більше нічого»);
- змін рушія поза `authorView`, змін `GameState`, `SavedRoom`, `GAME_STATE_VERSION`;
- нового демо-вмісту (тексти тестів — без тем росії й СРСР).

## Глобальні обмеження

- **Анти-цілі:**
  - автор не отримує нічого, що не видно всім: `AuthorView.people` має лише нікнейм і зв'язок (без балів чи відповідей). Меню не показує ключа, авторів вигадок чи правди. Перевіряють задачі 1 і 10;
  - телефон отримує `clip` лише в автопілоті без сцени. У грі з ведучим телефони джерела не бачать, як і раніше (задача 3; наявний сценарій 10b не змінюється);
  - гра з ведучим поводиться точно як раніше: «Грати», пульт, тексти, історія без позначки, «Проведені ігри» рахуються.
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`.
- **TDD:** кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені:
  - `pnpm typecheck`;
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=2 apps/web`;
  - `pnpm vitest run --maxWorkers=1 apps/server`.
- Наскрізні тести: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 11h"`.
  - **Повний прогін триває понад 32 хвилини, і машині може забракнути пам'яті.** Задача 10 запускає свої сценарії, а повний прогін — **один раз у фоні** наприкінці.
  - Чекати — через `expect.poll` чи кадри сокетів, без снів, крім вимірювання проміжків.
  - Кадри лежать в `apps/server/e2e/artifacts/shots`, префікс `p11h-`.
- Розкладка: телефон 375 px без прокрутки вбік (`expectPhoneFit`). Шапка з «⋯» не переноситься: кнопка не вища за рядок шапки (як `DuelButton`). Сцена 1280 × 720 без прокрутки.
- Новий вміст (тексти тестів і e2e) — без тем росії й СРСР.
- **Коміти:** кожен закінчується двома рядками-трейлерами (останній абзац повідомлення):
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  ```
  Тому коміти пишуться через `git commit -F - <<'EOF' … EOF`, як у задачах нижче.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать. `GAME_STATE_VERSION` не змінюється, тож питати перед пушем не треба (правило «deploys kill live games» стосується лише підняття версії).

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/views.ts`, `packages/engine/src/views.ts`, `views.autopilot.test.ts` | `AuthorView.people` | 1 |
| `packages/shared/src/history.ts`; `apps/server/src/db/schema.ts`, `drizzle/0013_game_autopilot.sql` + `drizzle/meta/*`, `recorder.ts`, `history.ts`, `profiles.ts`, `history.test.ts`, `recorder.test.ts`, `profile-routes.test.ts` (чи `profiles.test.ts`); фікстури вебу з `GameSummary` / `PlayedGame` | позначка в базі й відповідях, «Проведені ігри» без автопілота | 2 |
| `apps/server/src/rooms/manager.ts`, `manager.autopilot.test.ts` | `clip` для телефонів без сцени | 3 |
| `apps/web/src/api.ts`, `api.test.ts`, `storage.ts`, `storage.test.ts`, `pages/AutopilotLaunch.tsx` (новий), `AutopilotLaunch.test.tsx` (новий), `pages/Quizzes.tsx`, `Quizzes.test.tsx`, `i18n.ts`, `styles.css` | вікно запуску | 4 |
| `apps/web/src/screens/AuthorLobby.tsx` (новий), `AuthorLobby.test.tsx` (новий), `PlayerScreen.tsx`, `PlayerScreen.test.tsx`, `pages/Play.tsx`, `i18n.ts`, `styles.css` | лобі автора, «Почати гру», `stageOnline` у `PlayerScreen` | 5 |
| `apps/web/src/screens/AuthorMenu.tsx` (новий), `AuthorMenu.test.tsx` (новий), `HostCloud.tsx`, `HostCloud.test.tsx`, `PlayerScreen.tsx`, `i18n.ts`, `styles.css` | меню «⋯» | 6 |
| `apps/web/src/screens/StageScreen.tsx`, `TeamLobby.tsx`, `DuelView.tsx`, `BluffBoard.tsx`, `PlayerScreen.tsx`, `pages/Play.tsx`, `guide-text.ts`, `live/Guide.tsx`, `screens/RoundBriefing.tsx`, `i18n.ts`, тести поруч, `screens/autopilot-copy.test.tsx` (новий) | «Гру веде бот», тексти без ведучого, тест-сторож | 7 |
| `apps/web/src/live/useStageGone.ts` (новий), `HostScreen.tsx`, `PlayerScreen.tsx`, `PlayerScreen.test.tsx`, `LadderLifelines.tsx`, `LadderLifelines.test.tsx`, `Buffs.test.tsx`, `styles.css` | звук на телефоні без сцени, видима причина `'off'` | 8 |
| `apps/web/src/pages/History.tsx`, `GameHistory.tsx`, `MyGames.tsx`, тести поруч, `i18n.ts` | «Провів бот» | 9 |
| `apps/web/src/help/settings.ts`, `help/host-help.test.ts`; `apps/server/e2e/full-game.e2e.ts` | довідка «Гра без ведучого»; два сценарії «part 11h: …» | 10 |

## Порядок збирання

- 1 → 2 → 3 (сервер); 4 — після 2 (фікстури `GameSummary`); 5 → 6 → 7 → 8; 9 — після 2; 10 — останньою.
- **Навмисні зміни наявних очікувань** (лише такі):
  - `views.autopilot.test.ts` (11g): очікуваний `author` дістає `people` (задача 1);
  - фікстури `GameSummary` / `GameDetail` / `PlayedGame` у тестах вебу й сервера — плюс `autopilot: false`, лише там, де падає `pnpm typecheck` чи `toEqual` (задача 2);
  - `history.test.ts` / `profiles.test.ts`: очікувані відповіді з `autopilot: false` (задача 2);
  - `HostScreen.test.tsx`, якщо він імпортує `STAGE_GONE_MS` з `HostScreen` — `HostScreen.tsx` реекспортує його з `live/useStageGone.ts`, тож правка не потрібна (задача 8);
  - тести `guide-text` / `Guide` / `RoundBriefing`, що викликають функції без нового аргументу: аргумент необов'язковий (`autopilot = false`), тож очікування не змінюються (задача 7).
  - Якщо падає інше, рецензент розбирає причину, а не правку очікування.

## На що дивитися рецензентові

1. **Таємність.** `people` — лише `id`, `nickname`, `connected`. `clip` — лише в автопілоті без сцени і лише гравцям. Меню нічого не показує поза `AuthorView`.
2. **Гра з ведучим без змін.** «Грати», пульт, `kicked`, `teamWaitHost`, `bluffSpare`, гід — ті самі тексти, коли `autopilot === false`. «Проведені ігри» рахують ігри з ведучим.
3. **Тексти.** Тест-сторож задачі 7 перевіряє кожен досяжний етап автопілота на телефоні й сцені. e2e задачі 10 перевіряє справжні сторінки.
4. **Телефон 375.** Шапка з «⋯», панель лобі автора, вікно запуску й аркуш меню без прокрутки вбік (кадри `p11h-`).
5. **База.** Міграція лише додає колонку з типовим `false`. Старі ігри — з ведучим. `recorder` не перезаписує позначку.

---

### Задача 1. Рушій: список людей для меню автора

**Files:**
- Modify: `packages/shared/src/views.ts`, `packages/engine/src/views.ts`
- Test: `packages/engine/src/views.autopilot.test.ts`

**Interfaces:**
```ts
// packages/shared/src/views.ts
/** Людина кімнати-автопілота для меню автора (11h): лише те, що видно всім у лобі. */
export interface AuthorPerson {
  id: string;
  nickname: string;
  connected: boolean;
}

export interface AuthorView {
  cloud: AuthorCloudWord[] | null;
  bluff: AuthorBluffOption[] | null;
  /** Люди кімнати, крім автора, у порядку входу (соло — players, команди — teams.members); для «Вилучити гравця». */
  people: AuthorPerson[];
}
```
- `authorView(state, personId)` додає `people`. Соло: `state.players` без `personId`. Командна гра: `state.teams.members` без `personId` (лише люди, без рядків команд). Поля — лише три з інтерфейсу.

- [ ] **Step 1: Write the failing tests** (`views.autopilot.test.ts`, наявні фабрики 11g; нікнейми на зразок «Марта», «Віра», «Петро»):
  - соло, автор Марта, далі Віра й Петро; Петро від'єднаний → `playerView(state, марта).author.people` → `[{ id: віра, nickname: 'Віра', connected: true }, { id: петро, nickname: 'Петро', connected: false }]`; ключі об'єкта — рівно `['id', 'nickname', 'connected']`;
  - у лобі й посеред гри (`question`) список той самий;
  - командна гра (`teams` з двома командами, автор — учасник) → `people` — інші учасники `teams.members` (без id команд);
  - вилучений гравець зникає з `people`;
  - `playerView(state, віра).author` → `null` (як і було);
  - наявні очікування 11g для `author` дістають `people` (навмисна зміна).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/views.autopilot.test.ts` → FAIL (`people` undefined).
- [ ] **Step 3: Implement** `AuthorPerson`, поле в `AuthorView`, `authorPeople(state, personId)` у `views.ts` рушія.
- [ ] **Step 4: Run** `pnpm typecheck`, `pnpm vitest run --maxWorkers=2 packages`, `pnpm vitest run --maxWorkers=2 apps/web`, `pnpm vitest run --maxWorkers=1 apps/server` → PASS. Фікстури вебу з `author: null` не змінюються.
- [ ] **Step 5: Commit**
  ```bash
  git add packages
  git commit -F - <<'EOF'
  feat(engine): the author view of an autopilot room lists the other people (id, nickname, online) in join order for the kick menu — players solo, members in a team game

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  EOF
  ```

### Задача 2. Сервер: позначка «без ведучого» в базі й історії, «Проведені ігри» без неї

**Files:**
- Modify: `packages/shared/src/history.ts`, `apps/server/src/db/schema.ts`, `apps/server/src/recorder.ts`, `apps/server/src/history.ts`, `apps/server/src/profiles.ts`
- Create: `apps/server/drizzle/0013_game_autopilot.sql` (+ оновлення `apps/server/drizzle/meta/_journal.json`, `0013_snapshot.json`)
- Test: `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts`, `apps/server/src/profiles.test.ts` (або `profile-routes.test.ts` — там, де вже перевіряють `hosted` і `host`); фікстури вебу (`History.test.tsx`, `GameHistory.test.tsx`, `MyGames.test.tsx`, `profile.test.tsx` — лише за потреби)

**Interfaces:**
```ts
// packages/shared/src/history.ts
export interface GameSummary {
  // …
  /** Гра без ведучого (11h): «Провів бот». */
  autopilot: boolean;
}
export interface PlayedGame {
  // …
  /** Гра без ведучого (11h). */
  autopilot: boolean;
}
// GameDetail extends Omit<GameSummary, 'playerCount'> — поле приходить саме.

// apps/server/src/db/schema.ts, таблиця game
/** Гру вів автопілот (11h); старі ігри — false. */
autopilot: boolean('autopilot').notNull().default(false),
```
- Міграцію згенерувати з теки `apps/server`: `pnpm exec drizzle-kit generate --name game_autopilot`. Потім дописати перший рядок-коментар, як у `0012_teams.sql`: `-- Гра без ведучого (план 11h): позначка автопілота. Старі ігри — false.` Очікуваний SQL: `ALTER TABLE "game" ADD COLUMN "autopilot" boolean DEFAULT false NOT NULL;`.
- `recorder.ts`: `autopilot: snapshot.state.autopilot !== undefined` у `values(...)`. У `set` для `onConflictDoUpdate` поля немає.
- `history.ts`: `hostGames`, `hostGame` → `autopilot: row.autopilot`; `playerGames` → `autopilot: row.game.autopilot`.
- `profiles.ts` (`profileFacts`): `.where(and(eq(game.hostId, userId), eq(game.status, 'finished'), eq(game.autopilot, false)))`.

- [ ] **Step 1: Write the failing tests:**
  - `recorder.test.ts`: кімната-автопілот (`manager.createAutopilot`, як у `manager.autopilot.test.ts`), гра до `finished` (або перший запис після старту) → рядок `game` має `autopilot: true`, `hostId` = автор. Звичайна кімната → `false`. Повторний запис (перезапуск, `onConflictDoUpdate`) позначку не змінює;
  - `history.test.ts`:
    - `hostGames` повертає `autopilot: true` для гри-автопілота й `false` для звичайної;
    - `hostGame` — те саме в деталях;
    - `playerGames` / `playerHistory` автора → його гра з `autopilot: true`;
    - наявні очікування дістають `autopilot: false` (навмисна зміна);
  - профіль автора (`profileFacts` чи `GET /api/me/profile`): автор провів 1 звичайну гру й зіграв 1 автопілот, у якому виграв (2 гравці, бали > 0) →
    - `stats.hosted === 1`, `stats.games === 1`, `stats.wins === 1`;
    - досягнення `host` здобуте (від звичайної гри), `first_game` і `first_win` теж;
  - профіль, де є лише автопілот → `hosted === 0`, `host` не здобуте, `first_game` здобуте;
  - публічний профіль (`GET /api/profiles/:id`) — ті самі `hosted` і досягнення;
  - міграція: PGlite піднімає схему з `0013` (наявний `schema.test.ts` / `client.test.ts` — без правок, лише прогін).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/recorder.test.ts apps/server/src/history.test.ts apps/server/src/profiles.test.ts` → FAIL.
- [ ] **Step 3: Implement** схему, міграцію, `recorder`, `history`, `profiles`, поля shared. Виправити фікстури вебу, на які лається `pnpm typecheck` (`autopilot: false`).
- [ ] **Step 4: Run** `pnpm typecheck` і три прогони vitest → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared apps/server apps/web
  git commit -F - <<'EOF'
  feat(server): games remember they ran with no host (migration 0013, game.autopilot) — the history list, details and played games carry the flag, and hosted games and the host achievements count only games with a host while the author's result counts as any player's

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  EOF
  ```

### Задача 3. Сервер: аудіо для телефонів у грі без ведучого й без сцени

**Files:**
- Modify: `apps/server/src/rooms/manager.ts`
- Test: `apps/server/src/rooms/manager.autopilot.test.ts`

**Interfaces:**
```ts
// manager.ts, view(): після playerView і чернетки
/** Автопілот без сцени (11h): звук нема де грати, крім телефонів — гравці дістають джерело поточного запитання. */
private withPhoneClip(room: Room, view: PlayerView): PlayerView;
```
- Умова: `room.state.autopilot !== undefined && !this.stageOnline(room) && view.question?.audio != null && audioOf(room.state) !== null` (етап `audioOf` перевіряє сам). Тоді `{ ...view, question: { ...view.question, audio: { ...view.question.audio, clip: audioOf(room.state) } } }`. Інакше зріз без змін.
- `audioOf` імпортувати з `@quiz/engine` (уже експортований для пульта; якщо ні — додати в `index.ts` рушія).

- [ ] **Step 1: Write the failing tests** (`manager.autopilot.test.ts`; вікторина з класичним запитанням з `audio: { source: 'file', url: '/uploads/0123456789abcdef.mp3', duration: 2 }`; тексти без тем росії й СРСР):
  - автопілот, сцени немає, етап `question` → `manager.view(room, { role: 'player', playerId: автор })` і зріз іншого гравця мають `question.audio.clip` = джерело;
  - `connect(room, { role: 'stage' })` → обидва зрізи мають `clip: null`; `disconnect` сцени → знову з джерелом;
  - на `reveal` — з джерелом; на `leaderboard` і в лобі — `question` без аудіо, без помилок;
  - запитання без аудіо → `audio: null` без змін;
  - **звичайна кімната** без сцени → у гравців `clip: null` (як і раніше); зріз сцени й пульта не змінюється;
  - підключення сцени шле `changed` (наявна поведінка — тест на кількість подій, якщо такого ще немає).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/rooms/manager.autopilot.test.ts` → FAIL.
- [ ] **Step 3: Implement** `withPhoneClip` у `view`.
- [ ] **Step 4: Run** `pnpm typecheck` і три прогони vitest → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server packages/engine
  git commit -F - <<'EOF'
  feat(server): in a game with no host and no stage the phones get the audio source of the current question so the sound plays on them; once a stage connects they lose it again, and hosted games never send it to phones

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  EOF
  ```

### Задача 4. Веб: «Провести ботом» і вікно запуску

**Files:**
- Modify: `apps/web/src/api.ts`, `apps/web/src/storage.ts`, `apps/web/src/pages/Quizzes.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Create: `apps/web/src/pages/AutopilotLaunch.tsx`, `apps/web/src/pages/AutopilotLaunch.test.tsx`
- Test: `apps/web/src/api.test.ts`, `apps/web/src/storage.test.ts`, `apps/web/src/pages/Quizzes.test.tsx`

**Interfaces:**
```ts
// api.ts
export const getAutopilotCheck = (quizId: string) => request<AutopilotCheck>(`${quizUrl(quizId)}/autopilot`);
export const createAutopilotGame = (quizId: string, nickname: string) =>
  request<{ gameId: string; code: string; stageToken: string; token: string; playerId: string }>('/api/games', {
    body: { quizId, autopilot: true, nickname },
  });

// storage.ts — ключ `quiz:author:<code>`
export interface AuthorTokens { stageToken: string }
export const saveAuthor: (code: string, tokens: AuthorTokens) => void;
export function loadAuthor(code: string): AuthorTokens | null;

// pages/AutopilotLaunch.tsx
/** Вікно «Гра без ведучого» (11h): перевірка сумісності, примітка, нікнейм, «Створити кімнату». */
export function AutopilotLaunch(props: { quiz: QuizSummary; onClose: () => void }): JSX.Element;
```
- **Тексти** (`i18n.ts`):
  - `autopilotLaunch: 'Провести ботом'`, `autopilotTitle: 'Гра без ведучого'`;
  - `autopilotLead: 'Гру веде бот: відкриває запитання, чекає таймера, розкриває відповіді й іде далі. Ти граєш як звичайний гравець.'`;
  - `autopilotChecking: 'Перевіряємо вікторину…'`, `autopilotNoChanges: 'Вікторина піде без змін.'`, `autopilotChangesTitle: 'Що зміниться без ведучого'`;
  - `autopilotChange_voice: 'Відповіді «вголос» гравці пишуть з телефона, перевірка — за ключем.'`;
  - `autopilotChange_manual: 'Ручну перевірку замінить ключ відповіді: написання, якого немає в ключі, не зарахується.'`;
  - `autopilotChange_ladder_pick: 'Учасника «Мільйонера» вибере жереб.'`;
  - `autopilotChange_hint: 'Підказка діятиме лише там, де ти написав її текст у запитанні.'`;
  - `autopilotChange_untimed: 'Запитання без таймера закриються через свій час; відео бот не дочікується.'`;
  - `autopilotRounds_one: 'Раунд {list}'`, `autopilotRounds_few` / `_many: 'Раунди {list}'` (через `countText`);
  - `autopilotBlocked: 'Цю вікторину бот провести не може.'`, `err_autopilot_blocked` — той самий текст;
  - `autopilotHonest: 'Ти автор і знаєш відповіді — грай чесно.'`, `autopilotNickname: 'Твій нікнейм у грі'`, `autopilotCreate: 'Створити кімнату'`.
- **Вигляд:**
  - аркуш `table-sheet` (портал у `document.body`), картка з заголовком і ⓘ `<HelpButton id="setting.autopilot" />` (запис додає задача 10; до неї — тимчасово `setting.pacing`, а задача 10 змінює id);
  - список змін `<ul className="autopilot-changes">`;
  - примітка `autopilotHonest` (`role="note"`);
  - поле нікнейма;
  - кнопки «Створити кімнату» (`btn-primary`) і «Скасувати».

  Escape і дотик повз картку закривають, фокус повертається на «Провести ботом».
- **Поведінка:**
  - під час відкриття паралельно `getAutopilotCheck(quiz.id)` і `getMyProfile()` (нікнейм; помилка → `''`);
  - поки перевірка йде — `autopilotChecking`, кнопка вимкнена. Помилка перевірки → `errorText`, кнопка вимкнена;
  - кнопка також вимкнена, коли `nickname.trim().length < 2` чи йде створення;
  - успіх → `savePlayer`, `saveAuthor`, `saveLastGame`, `navigate('/play/<code>')`. Помилка → `errorText` у вікні; `unauthorized` → перехід на вхід, як у `Quizzes`.
- `Quizzes.tsx`:
  - кнопка `autopilotLaunch` (`btn`) одразу після «Грати»; стан `launch: QuizSummary | null`;
  - банер «Повернутися до гри»: якщо `loadAuthor(code) !== null` — `Link` на `/play/<code>`. Умова показу: `loadHost(code) !== null || loadAuthor(code) !== null`.

- [ ] **Step 1: Write the failing tests:**
  - `api.test.ts`: `createAutopilotGame('q1', 'Марта')` шле `POST /api/games` з `{ quizId: 'q1', autopilot: true, nickname: 'Марта' }`; `getAutopilotCheck('q1')` → `GET /api/quizzes/q1/autopilot`;
  - `storage.test.ts`: `saveAuthor` / `loadAuthor` (зламаний JSON → `null`; ключ не перетинається з `quiz:host:`);
  - `AutopilotLaunch.test.tsx` (`api` мокнуто):
    - перевірка `{ blocked: [], changed: [{ code: 'voice', rounds: [1] }, { code: 'manual', rounds: [1, 2] }] }` → видно `autopilotChange_voice` з «Раунд 2» і `autopilotChange_manual` з «Раунди 2, 3», у порядку `AUTOPILOT_CHANGES`; видно `autopilotHonest`;
    - `changed: []` → `autopilotNoChanges`;
    - `blocked` непорожній (тест підставляє `as AutopilotCheck`) → `autopilotBlocked`, кнопка вимкнена;
    - нікнейм з профілю (`'Марта Авторка'`) у полі; змінити на «Марта» → «Створити кімнату» → `createAutopilotGame('q1', 'Марта')`, потім `savePlayer('123456', 't')`, `saveAuthor('123456', { stageToken: 's' })`, `saveLastGame`, перехід на `/play/123456`;
    - `{ ok: false, error: 'autopilot_blocked' }` → текст помилки у вікні, переходу немає;
    - нікнейм з 1 символу → кнопка вимкнена;
    - Escape закриває.
  - `Quizzes.test.tsx`:
    - кнопка «Провести ботом» у кожному рядку відкриває вікно з назвою вікторини;
    - «Грати» поводиться як раніше (`createGame`);
    - банер для `loadAuthor` веде на `/play/…`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/pages/AutopilotLaunch.test.tsx apps/web/src/pages/Quizzes.test.tsx apps/web/src/api.test.ts apps/web/src/storage.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck` і три прогони vitest → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web
  git commit -F - <<'EOF'
  feat(web): «Провести ботом» beside «Грати» opens the no-host launch — what changes by round from the compatibility check, «Ти автор і знаєш відповіді — грай чесно», the profile nickname to edit and «Створити кімнату» that takes the author straight to the game as a player; the back-to-game banner knows author games

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  EOF
  ```

### Задача 5. Веб: лобі автора — код, QR, сцена, «Почати гру»

**Files:**
- Create: `apps/web/src/screens/AuthorLobby.tsx`, `apps/web/src/screens/AuthorLobby.test.tsx`
- Modify: `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/pages/Play.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/PlayerScreen.test.tsx`

**Interfaces:**
```ts
// screens/AuthorLobby.tsx
/** Лобі автора (11h): код, QR входу, посилання на сцену (якщо токен сцени збережено на цьому пристрої) і «Почати гру». */
export function AuthorLobby(props: {
  code: string;
  /** null — токена сцени на цьому пристрої немає: посилання не показано. */
  stageUrl: string | null;
  joinUrl: string;
  send: Send;
  onError: (message: string | null) => void;
}): JSX.Element;

// PlayerScreen Props — нові необов'язкові
code?: string;            // з Play.tsx
stageUrl?: string | null; // з loadAuthor(code)
stageOnline?: boolean;    // з useGame (задача 8 використовує)
```
- `Play.tsx`:
  - передає `code`, `stageUrl = loadAuthor(code) ? \`${origin}/stage/${code}#${stageToken}\` : null` і `stageOnline={game.stageOnline}` (`useGame` уже повертає `stageOnline`);
  - `joinUrl` = `${origin}/play/${code}`.
- `PlayerScreen`: у `lobby` при `view.author !== null` над `TeamLobby` рендерить `AuthorLobby` замість рядка `inLobby`. Не автор бачить усе як раніше.
- **Вигляд `AuthorLobby`** (телефон 375):
  - картка `author-lobby`: «Код кімнати» і код `123 456` великим;
  - QR `QRCodeSVG` 168 px (кольори як на сцені);
  - блок «Сцена для телевізора»: посилання з переносом (`overflow-wrap: anywhere`), «Копіювати» → «Скопійовано» на 2 с, «Відкрити» (`target="_blank"`, `rel="noopener"`);
  - під карткою — `authorStartHint` і на всю ширину `btn btn-primary` «Почати гру».
- **Тексти:** `authorCodeLabel: 'Код кімнати'`, `authorStageLabel: 'Сцена для телевізора'`, `authorStageHint: 'Відкрийте на великому екрані — там гравці бачать запитання.'`, `authorCopy: 'Копіювати'`, `authorCopied: 'Скопійовано'`, `authorOpen: 'Відкрити'`, `authorStart: 'Почати гру'`, `authorStartHint: 'Почніть, коли всі зайдуть.'`.
- «Почати гру» → `send('host:start')` через `useGuardedSend` (без подвійного дотику). Помилка → `onError(errorText(error))`.

- [ ] **Step 1: Write the failing tests:**
  - `AuthorLobby.test.tsx`:
    - код у вигляді `123 456`, `svg` QR зі значенням `joinUrl` (атрибут чи `title`);
    - посилання на сцену видно зі `stageUrl`, а з `stageUrl: null` блоку немає;
    - «Копіювати» викликає `navigator.clipboard.writeText(stageUrl)` і показує «Скопійовано»;
    - «Почати гру» → `send('host:start')` один раз за подвійний дотик;
    - `{ ok: false, error: 'teams_few' }` → `onError` з текстом.
  - `PlayerScreen.test.tsx` (фікстура лобі з `autopilot: true`, `author: { cloud: null, bluff: null, people: [] }`):
    - видно «Почати гру» й код;
    - зріз іншого гравця (`author: null`) — `inLobby`, без «Почати гру»;
    - гра з ведучим (`autopilot: false`, `author: null`) — без змін.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/AuthorLobby.test.tsx apps/web/src/screens/PlayerScreen.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck` і три прогони vitest → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web
  git commit -F - <<'EOF'
  feat(web): the author lobby on the phone — the room code, a join QR, the stage link to copy or open on a TV (on the device that made the room) and «Почати гру»; other players keep the usual lobby

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  EOF
  ```

### Задача 6. Веб: меню автора «⋯»

**Files:**
- Create: `apps/web/src/screens/AuthorMenu.tsx`, `apps/web/src/screens/AuthorMenu.test.tsx`
- Modify: `apps/web/src/screens/HostCloud.tsx`, `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/HostCloud.test.tsx`, `apps/web/src/screens/PlayerScreen.test.tsx`

**Interfaces:**
```ts
// screens/AuthorMenu.tsx
/** «⋯» у шапці автора (11h): кнопка не вища за рядок шапки; аркуш як «Таблиця» з пунктами за етапом (план 11h). */
export function AuthorMenu(props: { view: PlayerView; send: Send }): JSX.Element | null;

// HostCloud.tsx — by необов'язкове: автор авторів слів не бачить
export function HostCloud(props: { words: (HostCloudWord | AuthorCloudWord)[]; onHide: (key: string, hidden: boolean) => void }): JSX.Element;
```
- `null`, коли `view.author === null` чи `phase === 'finished'`.
- Кнопка `⋯` (`aria-label={t('authorMenu')}`, `aria-haspopup="dialog"`, клас `author-menu-btn`) — у шапці перед `TableButton`.
- Аркуш (`table-sheet`, портал, Escape і дотик повз картку закривають, фокус повертається) має екрани:
  - **головний** — пункти з таблиці плану (видимість за етапом);
  - **«Вилучити гравця»** — список `author.people` (нікнейм; від'єднані — клас `is-away`). Дотик → `window.confirm(t('kickConfirm', { name }))` → `send('host:kick', { playerId })`;
  - **«Як формуємо команди»** — три кнопки `aria-pressed` (`'pick'`, `'random'`, `'dice'`; підписи `teamForm_*`) і ⓘ `HelpButton id="team.<form>"` біля кожної (записи `team.pick` / `team.random` / `team.dice` уже є в `help/teams.ts`). Дотик → `send('host:team-form', { form })`;
  - **«Приховати…»**:
    - на «хмарі» — `authorHideCloudHint` + `HostCloud` → `send('host:cloud-hide', { key, hidden })`;
    - на блефі — `authorHideBluffHint` + кнопки варіантів (`bluffRemoveLabel`) → `window.confirm(t('bluffRemoveConfirm', { text }))` → `send('host:bluff-remove', { optionId })`.

  «Назад» повертає на головний екран.
- «Пауза» / «Продовжити» та «Завершити гру» (`window.confirm(t('endConfirm'))`) закривають аркуш після `ok`.
- Помилки — рядок `role="alert"` в аркуші:
  - `bluff-remove` з `not_allowed` → `authorBluffRefused`;
  - решта → `errorText` (`pick_first` → «Спершу зробіть свій вибір.»).
- Аркуш, відкритий на «Приховати…», сам повертається на головний екран, коли `author.cloud` і `author.bluff` стали `null` (етап минув).
- `PlayerScreen`: банер паузи в автора має кнопку «Продовжити» (`host:resume`) поруч із текстом.
- **Тексти:** `authorMenu: 'Меню автора'`, `authorPause: 'Пауза'`, `authorResume: 'Продовжити'`, `authorKick: 'Вилучити гравця'`, `authorKickNone: 'Більше нікого немає.'`, `authorEnd: 'Завершити гру'`, `authorHide: 'Приховати…'`, `authorBack: 'Назад'`, `authorHideCloudHint: 'Торкніться слова, щоб сховати його зі сцени. Ще дотик — повернути.'`, `authorHideBluffHint: 'Торкніться образливої вигадки, щоб прибрати її. Правда тут не позначена.'`, `authorBluffRefused: 'Цей варіант прибрати не можна.'`.

- [ ] **Step 1: Write the failing tests** (`AuthorMenu.test.tsx`, `send` — `vi.fn` з `{ ok: true }`, `window.confirm` → `true`):
  - `author: null` → кнопки немає; `finished` → кнопки немає;
  - **лобі соло:** пункти «Вилучити гравця»; немає «Пауза», «Завершити гру», «Як формуємо команди», «Приховати…»;
  - **лобі командне:** є «Як формуємо команди»; «Випадково» → `send('host:team-form', { form: 'random' })`; поточна форма `'dice'` позначена `aria-pressed`; форма `'host'` → жодна не позначена;
  - **`question`:** «Пауза» → `send('host:pause')`, аркуш закрито; зріз з `paused: true` → пункт «Продовжити» → `host:resume`;
  - «Завершити гру» → `confirm` → `send('host:end')`; `confirm` → `false` → нічого;
  - «Вилучити гравця» → список з `people` (від'єднаний з `is-away`) → «Петро» → `send('host:kick', { playerId: 'p3' })`; `people: []` → `authorKickNone`;
  - **«хмара»:** `author.cloud` з «сонце» (2) і «море» (1, `hidden: true`) → у списку обидва, «море» `aria-pressed="true"`; дотик «сонце» → `send('host:cloud-hide', { key: 'сонце', hidden: true })`; авторів слів у DOM немає;
  - **блеф:** `author.bluff` із двома варіантами → дотик → `confirm` → `send('host:bluff-remove', { optionId: 'o2' })`:
    - відповідь `pick_first` → «Спершу зробіть свій вибір.»;
    - `not_allowed` → «Цей варіант прибрати не можна.»;
  - «Приховати…» немає, коли `cloud` і `bluff` — `null`; відкритий екран «Приховати…» повертається на головний, коли вони зникли;
  - Escape закриває аркуш і повертає фокус на `⋯`.
  - `HostCloud.test.tsx`: слово без `by` рендериться без рядка авторів; наявні тести пульта без змін.
  - `PlayerScreen.test.tsx`: шапка автора має `⋯`, шапка іншого гравця — ні; банер паузи автора має «Продовжити» → `host:resume`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/AuthorMenu.test.tsx apps/web/src/screens/HostCloud.test.tsx apps/web/src/screens/PlayerScreen.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck` і три прогони vitest → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web
  git commit -F - <<'EOF'
  feat(web): the author «⋯» menu on the phone — pause and resume, kick a player, end the game, the team form in the lobby, and «Приховати…» that hides or returns word cloud words and removes a bluff lie with «Спершу зробіть свій вибір» until the author has picked; nothing else (no grades, points or key)

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  EOF
  ```

### Задача 7. Веб: «Гру веде бот» і тексти без ведучого

**Files:**
- Modify: `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/TeamLobby.tsx`, `apps/web/src/screens/DuelView.tsx`, `apps/web/src/screens/BluffBoard.tsx`, `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/pages/Play.tsx`, `apps/web/src/guide-text.ts`, `apps/web/src/live/Guide.tsx`, `apps/web/src/screens/RoundBriefing.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Create: `apps/web/src/screens/autopilot-copy.test.tsx`
- Test: `StageScreen.test.tsx`, `TeamLobby.test.tsx`, `DuelView.test.tsx`, `BluffBoard.test.tsx`, `guide-text.test.ts`, `RoundBriefing.test.tsx`, `pages/Play.test.tsx`

**Interfaces:**
```ts
// guide-text.ts — необов'язковий прапорець, типово false (гра з ведучим без змін)
export function roundHow(brief: RoundBrief, autopilot?: boolean): string[];
export function guidePageText(page: GuidePage, autopilot?: boolean): GuideText;
// live/Guide.tsx: GuidePageView отримує autopilot?: boolean і передає далі
// RoundBriefing: autopilot?: boolean → roundHow(brief, autopilot)
// DuelView.tsx: duelStartText(phase, autopilot); DuelBanner({ duel, phase, autopilot? })
// BluffBoard: autopilot?: boolean (сцена передає view.autopilot)
```
- **Сцена.** `Lobby` при `view.autopilot` показує над запрошенням рядок `stage-bot` «🤖 Гру веде бот» (кегль як у `meta` запрошення, у межах 1280 × 720 без зсуву ростера).
- **Нові тексти:**
  - `stageBotHosts: 'Гру веде бот'`;
  - `kickedByAuthor: 'Автор гри вилучив вас із гри.'`;
  - `teamWaitBot: 'Команди розподілить бот, щойно автор почне гру.'`;
  - `ladderWaitDraw: 'Жереб вибирає, хто піде на драбину…'`;
  - `duelStartsSoon: 'Почнеться після цього екрана.'`;
  - `bluffSpareQuiz: 'Запасна вигадка з вікторини'`;
  - `bluffPickRemovedAuthor: 'Автор гри прибрав цей варіант — вибери інший'`;
  - `guidePhoneScoreAuto: 'Правильну відповідь і бали покаже сцена; ваш рахунок — угорі телефона.'`;
  - `guideDebuffsLeadAuto: 'Перешкоду на одне запитання можна купити суперникові за бали (кнопка 😈). Відповісти все одно можна.'`;
  - `buffGuide_hintAuto: 'Підказка з вікторини лише вам.'`;
  - `roundHow_boardAuto: 'Спершу черга: кожен кидає кубик у телефоні. У свій хід виберіть клітинку — категорію й ціну.'`.
- Заміни — за таблицею «Варіанти для автопілота» в рішеннях плану. Кожен компонент бере прапорець з `view.autopilot` (телефон, сцена). `Play.tsx` пам'ятає `autopilot` останнього зрізу в `useRef` до `clearPlayer`.

- [ ] **Step 1: Write the failing tests:**
  - `StageScreen.test.tsx`: лобі з `autopilot: true` → «Гру веде бот»; з `false` — немає;
  - `TeamLobby.test.tsx`: форма `'host'`, автопілот → `teamWaitBot`; з ведучим → `teamWaitHost`;
  - `DuelView.test.tsx`: оголошена дуель на `reveal` в автопілоті → `duelStartsSoon`; з ведучим → `duelStartsOnContinue`;
  - `BluffBoard.test.tsx`: запасна вигадка на розкритті з `autopilot` → `bluffSpareQuiz`;
  - `guide-text.test.ts`: `guidePageText({ kind: 'phone' }, true).lead` містить `guidePhoneScoreAuto`; `roundHow(boardBrief, true)` → `roundHow_boardAuto`; без прапорця — як раніше;
  - `Play.test.tsx`: вилучення в автопілоті → `kickedByAuthor` у формі входу; у грі з ведучим → `kicked`;
  - **`autopilot-copy.test.tsx` (сторож):** фабрика автопілотних зрізів (`autopilot: true`; у телефона — і автора, і не автора) для досяжних етапів:
    - лобі соло й командне з формою `'host'` і `'dice'`;
    - `guide` з усіма сторінками (телефон, раунди з полем, бафи з `hint`, дебафи, дуелі);
    - `intro` поля з кубиками;
    - `intro` «Мільйонера» без учасника;
    - `question` класики з бафом `hint` (`unfit_host`);
    - блеф на виборі з прибраним варіантом;
    - `reveal` блефу із запасною вигадкою;
    - оголошена дуель;
    - пауза;
    - `finished`.

    Для кожного рендерить `PlayerScreen` і `StageScreen` і перевіряє, що `container.textContent` (і `title` / `aria-label` усіх елементів) не має `/ведуч/i`. Той самий зріз з `autopilot: false` у лобі командної гри з формою `'host'` має «Ведучий» — це перевіряє, що сторож справді бачить текст.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/autopilot-copy.test.tsx apps/web/src/guide-text.test.ts apps/web/src/screens/StageScreen.test.tsx apps/web/src/screens/TeamLobby.test.tsx apps/web/src/screens/DuelView.test.tsx apps/web/src/screens/BluffBoard.test.tsx apps/web/src/pages/Play.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Якщо сторож знайде ще текст із «ведучим» на досяжному етапі, додати автопілотний варіант за тим самим зразком і назвати його в звіті задачі.
- [ ] **Step 4: Run** `pnpm typecheck` і три прогони vitest → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web
  git commit -F - <<'EOF'
  feat(web): no host anywhere in a game with no host — the stage lobby says «Гру веде бот», and the phone and stage texts for the guide, the board briefing, the team lobby, the ladder draw, duels, bluff spares and removed picks and the kick notice name the bot, the quiz or the author; a guard test renders every reachable autopilot screen and finds no «ведучий»

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  EOF
  ```

### Задача 8. Веб: звук на телефонах без сцени й видима причина неактивної підказки

**Files:**
- Create: `apps/web/src/live/useStageGone.ts`
- Modify: `apps/web/src/screens/HostScreen.tsx`, `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/screens/LadderLifelines.tsx`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/PlayerScreen.test.tsx`, `apps/web/src/screens/LadderLifelines.test.tsx`, `apps/web/src/screens/Buffs.test.tsx`

**Interfaces:**
```ts
// live/useStageGone.ts (перенесено з HostScreen без змін поведінки)
/** Сцена, якої нема вже STAGE_GONE_MS: короткий розрив не вмикає звук деінде. */
export const STAGE_GONE_MS = 3000;
export function useStageGone(stageOnline: boolean): boolean;
// HostScreen.tsx: import { STAGE_GONE_MS, useStageGone } from '../live/useStageGone'; export { STAGE_GONE_MS };
```
- **Телефон.** У `PlayerScreen`, коли `view.autopilot && question?.audio?.clip != null && useStageGone(stageOnline)` і етап `question` / `locked` / `reveal`, під запитанням рендериться `QuestionAudio`:
  - пропси як на пульті: `key` і `questionKey` = `${round.index}:${questionIndex}`;
  - `ready = phase === 'question' && !notStarted && !view.paused`;
  - `paused = view.paused`, `command = null`;
  - `elapsedMs = () => questionElapsedMs(view, Date.now() + offsetMs)`, `splash = notStarted`.

  Обгортка `player-audio` (компактна, як `host-audio`, без кнопок «Ще раз» / «Стоп»). Стан «заблоковано» показує наявну кнопку дотику з `QuestionAudio`.
- **Підказка «Мільйонера».** У `LadderLifelines`, коли хоч одна кнопка має `state === 'off'`, в `ladder-lifeline-info` завжди видно `<p className="meta ladder-lifeline-off">{t('ladderLifelineOff')}</p>`. `title` лишається (миша). `sr-only` у кнопці прибрати: текст тепер видно. Кнопка лишається `disabled`.
- **Баф `hint` (`unfit_host`).** Уже пояснює причину на дотик (`aria-disabled`, рядок `buff-why`). Код не змінюється, лише тест.

- [ ] **Step 1: Write the failing tests:**
  - `PlayerScreen.test.tsx` (фейкові таймери):
    - автопілот, `question` з `audio.clip` файлу, `stageOnline: false` → через `STAGE_GONE_MS` у DOM є `audio` з `src` кліпу, до того — немає;
    - `stageOnline: true` → немає;
    - `clip: null` (сцена чи гра з ведучим) → немає;
    - під заставкою запитання `audio` є, але не стартує (`play` не викликано, мок `HTMLMediaElement.prototype.play`);
  - `LadderLifelines.test.tsx`: `lifelines: [{ kind: 'fifty', state: 'ready' }, { kind: 'hint', state: 'off' }]` → видимий (не `sr-only`) текст «У грі без ведучого підказки немає.» у `.ladder-lifeline-info`, кнопка «Підказка» `disabled`. Без `'off'` рядка немає;
  - `Buffs.test.tsx`: слот `hint` з блоком `unfit_host` → дотик показує «У грі без ведучого підказки немає.» у `buff-why`, `send` не викликано.

  Якщо `Buffs.test.tsx` уже зелений, тест лишається як фіксація поведінки.

  Примітка: «У грі без ведучого…» — пояснення причини, а не назва ведучого в ролі, тож сторож задачі 7 цей рядок пропускає явним винятком (`ladderLifelineOff`, `buffWhy_unfit_host`). Специфікація формулює цей текст саме так (розділ 11 п. 4).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/screens/LadderLifelines.test.tsx apps/web/src/screens/Buffs.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Додати виняток у сторож задачі 7 (`/ведуч/i`, крім точних рядків `ladderLifelineOff` і `buffWhy_unfit_host`) і показати їх у фікстурі сторожа, щоб виняток був перевірений.
- [ ] **Step 4: Run** `pnpm typecheck` і три прогони vitest → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web
  git commit -F - <<'EOF'
  feat(web): with no host and no stage the question audio plays on the phones after the stage has been gone for 3 s (start after the splash, pause with the game, tap when the browser blocks it), and a ladder hint that is off says why in visible text under the lifelines, not only in a tooltip

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  EOF
  ```

### Задача 9. Веб: «Провів бот» в історії й «Моїх іграх»

**Files:**
- Modify: `apps/web/src/pages/History.tsx`, `apps/web/src/pages/GameHistory.tsx`, `apps/web/src/pages/MyGames.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css` (лише якщо треба)
- Test: `apps/web/src/pages/History.test.tsx`, `GameHistory.test.tsx`, `MyGames.test.tsx`

**Interfaces:**
- `historyAutopilot: 'Провів бот'`.
- `History.tsx` і `GameHistory.tsx`: `{game.autopilot && <p className="meta autopilot-mark">{t('historyAutopilot')}</p>}` поруч із `team-game-mark` (обидві позначки можуть стояти разом).
- `MyGames.tsx`: та сама позначка в рядку гри.

- [ ] **Step 1: Write the failing tests:**
  - список «Проведені» з двома іграми (`autopilot: true` і `false`) → «Провів бот» лише в першому рядку;
  - деталі гри-автопілота → «Провів бот»; командна гра-автопілот → обидві позначки;
  - «Мої ігри» → позначка в рядку автопілота.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/pages/History.test.tsx apps/web/src/pages/GameHistory.test.tsx apps/web/src/pages/MyGames.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck` і три прогони vitest → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web
  git commit -F - <<'EOF'
  feat(web): «Провів бот» marks a game with no host in the hosted games list, the game details and «Мої ігри»

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  EOF
  ```

### Задача 10. Довідка «Гра без ведучого» й наскрізні сценарії «part 11h: …»

**Files:**
- Modify: `apps/web/src/help/settings.ts`, `apps/web/src/help/host-help.test.ts`, `apps/web/src/pages/AutopilotLaunch.tsx` (ⓘ → `setting.autopilot`), `apps/server/e2e/full-game.e2e.ts`

**Довідка (10a).**
- `SETTING_HELP_KEYS`: `'autopilot'` в кінці переліку.
- Запис `autopilot`:
  - `title: 'Гра без ведучого'`;
  - `what`: гру веде бот, автор грає як звичайний гравець, пульта немає.
  - `how` (рядки):
    1. Запуск: «Провести ботом» у списку вікторин → зміни → «Створити кімнату» → ви на телефоні як гравець; код, QR, посилання на сцену й «Почати гру» в лобі.
    2. Що бот робить сам: відкриває, закриває, розкриває, таблиця, далі; кубики (за тих, хто не кинув, за `AUTOPILOT_MS.boardDice` / `teamDice` с), пропуск ходу на полі, категорія дуелі, жереб «Мільйонера», «Забираю» без рішення за `ladderDecision`, команди «Розподіляю сам» — випадково на старті.
    3. Час етапів — числа з `AUTOPILOT_MS` через `s()`: «Як грати» `guide`, заставка раунду `intro` + `introPerChars` на кожні `introChars` символів опису до `introMax`, закрито → розкриття `locked`, розкриття `reveal`, рядок «100 до 1» / варіант блефу `row` і `rowsTail` після останнього, таблиця `leaderboard`, рішення «Ва-банк» `decisions`, кінець раунду `roundEnd`, фінал `finalRow` на гравця. Усе — не раніше мінімального часу 11b.
    4. Що змінюється у форматах — тексти `autopilotChange_*`.
    5. Меню «⋯» автора: пауза, вилучення, завершення, команди в лобі, «Приховати…» для «хмари» й блефу (вигадку — лише після свого вибору).
    6. Нікого на зв'язку → пауза; хтось повернувся → гра йде через `AUTOPILOT_MS.resume` с; після перезапуску сервера — так само.
    7. Звук грає на сцені, а без сцени — на телефонах.
  - `points`: результат автора рахується, як у будь-кого; «Проведені ігри» й досягнення ведучого за таку гру не додаються.
  - `tip`: відкрийте сцену на телевізорі за посиланням з лобі; грайте чесно.
  - `limits`: ні оцінок, ні коригувань, ні дебафів від ведучого, ні «±15 с», ні повтору звуку; підказка лише з текстом у запитанні; ручна перевірка — за ключем.
- `host-help.test.ts`: новий `it('11h autopilot entry follows «reveal» and tells the stage times and what the author menu does', …)`:
  - `helpIds('settings').at(-1) === 'setting.autopilot'`;
  - текст містить `${AUTOPILOT_MS.reveal / 1000} с`, `${AUTOPILOT_MS.leaderboard / 1000} с`, `${AUTOPILOT_MS.resume / 1000} с`, «Приховати», «Провести ботом»;
  - `title === t('autopilotTitle')`.

**Наскрізні сценарії.** Помічники — наявні:
- `open`, `register`, `shot`, `snapshot`, `expectPhoneFit`, `noSideScroll`, `socketFrames`, `silentMp3`;
- `pilotSocket` / `pilotPlayer` / `frame` з 11g.

Новий помічник поруч:
```ts
/** Видимий текст сторінки (innerText body, title й aria-label усіх елементів) не згадує ведучого, крім причини неактивної підказки (план 11h). */
async function expectNoHost(page: Page, where: string): Promise<void>;
```
Вміст — без тем росії й СРСР.

- [ ] **Step 1: Довідка** — тест → FAIL → запис → PASS; ⓘ вікна запуску → `setting.autopilot`.
- [ ] **Step 2: Сценарій 1**
  ```ts
  it('part 11h: the author launches a game with no host from the quiz list on a 375 phone — the changes and «грай чесно», the lobby with code, QR, stage link and «Почати гру», «Гру веде бот» on the 1280 × 720 stage, the «⋯» menu pauses, hides a cloud word, refuses a bluff lie before the own pick and removes one after it, kicks a player; no screen names a host; the history says «Провів бот» and hosted games stay 0', async () => { … });
  ```
  **Вікторина `Бот веде 11h`** (`leaderboard: 'end'`, `newcomers: false`):
  - раунд 0 «Розминка» (класика, `speedBonus: false`, `shuffleOptions: false`):
    - `b1` boolean «Говерла — найвища гора України», `true`, 100, `timeLimit: 20`;
    - `c1` wordcloud «Одне слово про осінь», `timeLimit: 20`;
    - `f1` bluff «Найдовша річка, що тече лише Україною, — …» (`accepted: ['Південний Буг']`, `lies` — дві запасні; форма — як у 10f);
  - раунд 1 «Фінал» (`check: 'manual'`, `wagerMode: 'classic'`): text «Яке місто — столиця України?» → «Київ».

  **Кроки:**
  1. `marta = open('marta11h', 375, 812)`, `register(marta, 'host', 'Марта Авторка', 'marta11h@example.com')`. Вікторина — `POST /api/quizzes`. Перейти на `/quizzes`.
  2. «Провести ботом» → вікно:
     - видно `autopilotChange_manual` з «Раунд 2» і «Ти автор і знаєш відповіді — грай чесно»;
     - нікнейм у полі — нікнейм профілю;
     - ⓘ відкриває «Гра без ведучого»;
     - `expectPhoneFit(marta, 'launch-375')`, кадр `p11h-launch-375`.
  3. Нікнейм «Марта» → «Створити кімнату» → URL `/play/<code>`:
     - видно код, `svg` QR, посилання на сцену й «Почати гру»;
     - `expectPhoneFit`, кадр `p11h-author-lobby-375`.
  4. `stage = open('stage11h', 1280, 720)` за `href` посилання зі сторінки Марти → «Гру веде бот», кадр `p11h-stage-lobby`.
  5. `vira = open('vira11h', 375, 812)` входить формою на `/play/<code>` → «Ви в грі. Чекаємо на старт.», немає «Почати гру» й `⋯`. `petro = pilotPlayer(sockets, code, 'Петро')`.
  6. Марта «Почати гру» → `intro` → `question` `b1` (на сцені й телефонах). Усі «Так».
  7. **Пауза.** Марта `⋯` → кадр `p11h-author-menu-375` → «Пауза»:
     - у Віри й на сцені «Пауза»;
     - через 4 с ще пауза;
     - банер Марти має «Продовжити» → гра йде (`expect.poll` на зникнення «Пауза» в Віри).
  8. **«Хмара».** Марта «море», Віра «сонце», Петро «сонце» → `reveal`:
     - Марта `⋯` → «Приховати…» → «море» (`aria-pressed="false"`) → на сцені «море» зникає, «сонце» лишається;
     - у меню «море» `aria-pressed="true"`; авторів слів у меню немає;
     - кадр `p11h-author-hide-cloud-375`.
  9. **Блеф.**
     - Вигадки: Віра «Інгулець», Петро «Рось».
     - На виборі Марта `⋯` → «Приховати…» → «Рось» → «Спершу зробіть свій вибір.».
     - Марта вибирає «Південний Буг». Знову «Рось» → прибрано: зникає з вибору Віри й зі сцени, а Петро в кадрах не має варіанта «Рось».
     - «Південний Буг» (вибраний) → «Цей варіант прибрати не можна.».
     - Кадр `p11h-author-hide-bluff-375`.
  10. **Вилучення.** До фіналу (на `round_end` чи `intro` фіналу) Марта `⋯` → «Вилучити гравця» → «Петро» → підтвердити → сокет Петра отримує `closed: 'kicked'`; у меню лишається Віра.
  11. Фінал: ставки (Марта 0, Віра 100) → «київ» обидві → `finished`, подіум на сцені.
  12. **Тексти без ведучого:** `expectNoHost` для Марти й Віри на кроках 3, 5, 6, 7 (пауза), 8, 9, 11 і для сцени на кроках 4, 6, 11.
  13. **Історія:**
      - Марта `/history` → рядок «Бот веде 11h» з «Провів бот»; деталі → «Провів бот»;
      - `/me` («Мої ігри») → гра з позначкою;
      - `GET /api/me/profile` → `stats.hosted === 0`, `stats.games === 1`, досягнення `host` не здобуте, `first_game` здобуте;
      - кадр `p11h-history-375`.
  14. Таємність: жоден кадр Віри й Петра не має `"author":{` з непорожнім вмістом (лише `"author":null`). Кадри Марти не мають `"by":[` у `author.cloud` і `"kind":` в `author.bluff`. `expect(problems).toEqual([])`.
- [ ] **Step 3: Сценарій 2**
  ```ts
  it('part 11h: with no stage the question sound plays on the 375 phones and stops coming once a stage opens, a ladder hint lifeline that is off says why in visible text, and team lobby texts name the bot', async () => { … });
  ```
  **Вікторина `Без сцени 11h`:**
  - раунд 0 класика:
    - `a1` choice з аудіо-файлом (`silentMp3()` через `POST /api/uploads/audio` з акаунта Марти; `duration: 2`), «Що звучить?», варіанти «Тиша», «Дощ», «Вітер»;
    - `a2` boolean «Світязь — озеро», `true`;
  - раунд 1 «Мільйонер»: `pick: 'host'`, `lifelines: ['fifty', 'hint']`, три запитання без `hint`, `timer: true`.

  **Кроки:**
  1. `GET /api/quizzes/:id/autopilot` → `changed` з `ladder_pick` і `hint` (раунд 1).
  2. Марта (375) створює кімнату через вікно запуску (як у сценарії 1). Віра (375) входить формою. Сцени немає.
  3. Старт → `a1`. Через `STAGE_GONE_MS` після кінця заставки запитання на обох телефонах є `audio` з `src` = URL файлу (кадр `p11h-phone-audio-375`). Віра: `expectNoHost`.
  4. `stage = open(…, 1280, 720)` за посиланням → протягом 2 с у кадрах Віри `question.audio.clip === null` (через `socketFrames`), а `audio` зникає з телефонів.
  5. Сцену закрити. Далі `a2`, кінець раунду, intro «Мільйонера»:
     - жереб вибирає учасника, і текст «Жереб вибирає…» чи «Ти йдеш на драбину» без «ведучого»;
     - на першому запитанні в телефоні учасника кнопка «Підказка» `disabled` і під кнопками видно «У грі без ведучого підказки немає.» (`isVisible`, не `sr-only`);
     - кадр `p11h-ladder-off-375`, `expectPhoneFit`.
  6. Довести до `finished` (учасник відповідає правильно чи «Забираю»).
  7. **Команди** (окрема мала кімната в тому ж сценарії): вікторина `Команди 11h` з `teams` (дві команди, `form: 'host'`), автопілот → у Віри в лобі «Команди розподілить бот, щойно автор почне гру». Марта `⋯` → «Як формуємо команди» → «Кубик» → у Віри тур кубиків. `expectNoHost` для обох, кадр `p11h-team-lobby-375`.
  8. `expect(problems).toEqual([])`.
- [ ] **Step 4: Run** `pnpm build`, потім у фоні `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 11h"` → PASS. Переглянути кадри `p11h-*`:
  - телефон 375 без прокрутки вбік;
  - шапка з `⋯` в один рядок;
  - аркуші не виходять за екран;
  - сцена 1280 × 720 з «Гру веде бот» без зсуву ростера.
- [ ] **Step 5: Повний прогін — один раз, у фоні:** `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts` → усі сценарії PASS. Особливо 10b (телефони без джерела в грі з ведучим) і 11g. Якщо PGlite чи браузер падає з браком пам'яті, перезапустити лише сценарії, що впали (`-t "<назва>"`), і назвати це в звіті.
- [ ] **Step 6: Commit**
  ```bash
  git add apps/web apps/server/e2e
  git commit -F - <<'EOF'
  test: part 11h end-to-end — the author launches a no-host game from the quiz list on a 375 phone, sees the changes and «грай чесно», gets the lobby with code, QR, stage link and «Почати гру», the 1280 × 720 stage says «Гру веде бот», the «⋯» menu pauses, hides a cloud word, refuses a bluff lie before the own pick and removes one after it, kicks a player, no screen names a host and the history says «Провів бот» with hosted games at 0; with no stage the sound plays on the phones until a stage opens, the off ladder hint says why, the team lobby names the bot; host help gets «Гра без ведучого»

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  EOF
  ```
