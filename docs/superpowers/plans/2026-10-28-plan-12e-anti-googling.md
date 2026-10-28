# План 12e: антигугл — «відволікався», тривога на телефоні й штраф за вихід

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 12e специфікації `docs/superpowers/specs/2026-10-27-subproject-12-design.md` (розділ 9; обмеження — розділи 2 і 3; рядок 12e у таблиці частин — розділ 4; скасування штрафу — розділ 5, п. 2 і 8; «Твоя гра» — розділ 8, «Наприкінці гри», п. 2; рішення автора — розділ 18, «Антигугл (12e)»; відповіді власника — розділ 19, п. 4). Рішення власника: позначка «відволікався» й необов'язковий автоштраф «0 балів за запитання», який ведучий може скасувати. **Додаткова вимога власника (2026-10-28):** «звуковий алярт + червоніння екрану у того хто гуглить, що б було все серйозно» — див. «Тривога на телефоні» в рішеннях і задачу 9.
- **Телефон стежить** за `visibilitychange` → `hidden` і за `blur` вікна (якщо через 300 мс `document.hasFocus()` — `false` і фокус не в `iframe` гри). Він шле `player:away { away: true }` на виході й `{ away: false, ms }` на поверненні.
- **Сервер рахує час** своїм годинником у `Play.away` (у кожної людини: мс, скільки разів, відколи поза грою). Лічильник працює від реального старту запитання до подання своєї відповіді чи до закриття. Пауза його зупиняє. Розрив зв'язку не рахується: частину виходу без зв'язку сервер бере як перетин заявленого телефоном виходу з розривом.
- **Позначка — від 2 с сумарно.**
  - Пульт: у «Відповідях наживо» й у таблиці відповідей — «🙈 відволікався 12 с (2 рази)», поки людина поза грою — «🙈 зараз поза грою».
  - Сцена: рядок «🙈 Оля, Петро» в шапці запитання, без секунд.
  - Телефон гравця: рядок «Ти виходив із гри на 8 с — це видно всім», зі штрафом — ще «За це запитання буде 0 балів».
- **Тривога на телефоні (вимога власника).** Щойно гравець повертається з виходу, що дає позначку, його телефон на 2,5 с вкривається червоним шаром із пульсом («🚨 Ти виходив із гри під час запитання!», зі штрафом — «0 балів за це запитання») і грає сирену Web Audio. Лише той телефон, лише раз на вихід.
- **Штраф (`settings.awayPenalty`, типово вимкнено).** Хто відволікався від 3 с сумарно, отримує 0 за запитання.
  - Рушій дописує коригування `away` = −бали запитання, коли бали остаточні: на виході з розкриття, у бліці — на закритті.
  - Від'ємні бали не знімаються.
  - Штраф діє в класиці, на полі, у бліці й у фіналі.
  - Ведучий скасовує штраф в аркуші «↶ Бали» (рядок «Оля −200 (вихід із гри)»), у грі без ведучого — лише апеляція 12f.
- **Команди.** Позначка й тривога — біля людини. Штраф отримує команда, якщо від 3 с відволікався будь-хто з її людей.
- **Історія:** 🙈 біля відповіді з виходом; «Твоя гра» — рядок «🙈 Відволікався: на 2 запитаннях».
- **Редактор:** прапорець «Штраф за вихід із гри» з поясненням. **Довідка ведучого:** запис `setting.away`.

**Стан гри змінюється: `GAME_STATE_VERSION` 16 → 17, версія 16 лишається читабельною.**
- Нові поля:
  - необов'язкове `Play.away?: Record<string, AwayEntry>` (ключ — людина: соло-гравець чи учасник команди);
  - необов'язкове `QuizSettings.awayPenalty?: boolean`;
  - нове значення `AdjustmentSource` `'away'`.
- Старий сервер такого стану не прочитав би, тож версія піднімається (розділ 3 специфікації). Стан версій 2–16 не може містити виходів чи штрафів, тож `READABLE_STATE_VERSIONS` отримує 16 з поясненням у `restore.ts`. Кімнати, збережені до деплою, відновлюються, і живі ігри деплой переживають.
- Нових полів `ScoreAdjustment` немає: запитання штрафу — `afterQuestion − 1` (рушій дописує штраф саме тоді, коли це так; див. «Штраф»).
- Міграція бази `0015_answer_away`: необов'язковий стовпець `answer.away_ms` (специфікація, «Дані»). Її ставить сервер під час запуску (`migrate`).
- Перед пушем координатор перевіряє `live_room` (правило специфікації, розділ 2) і, за правилом пам'яті «Deploys kill live games», питає власника: стара версія читається, але правило вимагає питати перед кожним підняттям `GAME_STATE_VERSION`.

**Архітектура:**
- **Shared.**
  - Новий `packages/shared/src/away.ts`: `AWAY_MS` (`mark: 2000`, `penalty: 3000`, `blurGrace: 300`, `alarm: 2500`), `AWAY_EVENTS_PER_SECOND`, `AWAY_REPORT_MAX_MS`, `AWAY_PENALTY_ROUNDS`, типи `AwayMark` і `OwnAway`, чисті `awayGapMs` і `awaySeconds`.
  - `game.ts`: `AdjustmentSource` + `'away'`.
  - `quiz.ts`: `quizSettingsSchema.awayPenalty`.
  - `breakdown.ts`: `SCORE_SOURCES` + `'away'` після `'undo'`.
  - `undo.ts`: `UNDOABLE_SOURCES` = `['host', 'away']`.
  - `events.ts`: `awaySchema`, подія `'player:away'`.
  - `views.ts`: `LiveRow.away`, `HostResponse.away`, `StageView.away`, `PlayerView.away`, `UndoRow.kind` + `'away'`.
  - `history.ts`: `GameResponse.awayMs`, `final.entries[].awayMs`.
  - `facts.ts`: `FactInput.away`, `GameCard.away`.
- **Рушій.**
  - `game.ts`: `AwayEntry`, `Play.away`, `shiftAwayClocks` у `resumeClock`.
  - Новий `away.ts`: `awayParticipant`, `awayTracked`, `awayStart`, `awayEnd`, `awayStep` (годинники між кроками + штраф), `awayMarkOf`, `stageAway`, `ownAway`, `awayPeople`.
  - `restore.ts`: версія 17, читається 16.
  - `undo.ts`: рядок `kind: 'away'`.
  - `live.ts`: `LiveRow.away`.
  - `views.ts`: `HostResponse.away`, `StageView.away`, `PlayerView.away`.
  - `facts.ts`: `away` у `factInput`.
- **Сервер.**
  - `drizzle/0015_answer_away.sql` + `meta`; `db/schema.ts`: `answer.awayMs`.
  - `recorder.ts`: пише `away_ms`.
  - `history.ts`: `awayMs` у відповідях і фіналі, `away` у `factInputOf`.
  - `rooms/manager.ts`: пам'ять кімнати `hidden`, `gaps`, `awayRate`; метод `away`; `commit` викликає `awayStep`; `connect` / `disconnect` ведуть `gaps`.
  - `socket.ts`: `player:away`.
- **Веб.**
  - Новий `live/useAwayWatch.ts` (стеження й черга звіту), `pages/Play.tsx` його вмикає.
  - Новий `siren.ts` (`playSiren`), новий `live/AwayAlarm.tsx` (`AwayAlarm`, `AwayNote`).
  - `storage.ts` (`loadAlarmSeen` / `saveAlarmSeen`).
  - `screens/PlayerScreen.tsx`, `screens/LiveAnswers.tsx`, `screens/HostScreen.tsx`, `screens/StageScreen.tsx`.
  - `undo-panel.ts`, `editor/QuizEditor.tsx`, `pages/GameHistory.tsx`, `facts-text.ts`, `away-text.ts` (новий), `i18n.ts`, `styles.css`.
- **Довідка ведучого:** новий запис `setting.away` одразу після `setting.undo`; рядок про штраф у `setting.undo` і `setting.autopilot`.
- **Наскрізні тести.** Один сценарій «part 12e: …». Пульт на телефоні 375 × 812, сцена 1280 × 720, три телефони 375 × 812. Кадри з префіксом `p12e-`, серед них `p12e-phone-alarm`.

**Технології:** TypeScript, zod, vitest, Fastify + Socket.IO, Drizzle + drizzle-kit + PGlite, React 19 + Vite, Testing Library (jsdom), Web Audio API, Playwright. Нових залежностей немає.

**Рішення плану там, де специфікація мовчить або суперечить коду (координатор може змінити):**

*Хто й коли під наглядом (`awayTracked`)*
- **Людина** — ключ `Play.away`: соло-гравець (id гравця) чи учасник команди (id людини, `TeamMember.id`). **Учасник рушія** людини (`awayParticipant`) — сам гравець чи команда людини (`memberOf(state, id).teamId`).
- Людина під наглядом, коли виконано все:
  - етап `question`, запис `plays[questionIndex]` з поточного раунду;
  - людина на зв'язку (`PlayerState.connected` / `TeamMember.connected`);
  - її учасник є серед рядків `hostLive(state)` з `kind` `'answers'` чи `'blitz'` і цей рядок має `answered === false`. Командне опитування й хмара мають рядки людей — тоді шукаємо саму людину.
- Так одне визначення «має відповідати й ще не подав» з 11c (`LiveRow.answered`) покриває всі типи: блеф (вигадка, потім вибір), поле (лише той, хто вибрав; на бліц-клітинці — усі), «Ва-банк» (ті, хто в грі), «Вибування» (живі), «Мільйонер» (учасник), чергу бліцу. Привиди, зал «Мільйонера», випробування й дуель не стежаться: `aside` і `kind` `'trial'` / `'duel'` не беруться.
- Пауза нагляду не знімає, але годинник стоїть (нижче).
- **Заставка:** вихід до реального старту рахується від `startedAt` (`since = max(now, startedAt)`). Тож погляд на сповіщення під час заставки нічого не коштує.

*Годинник (`AwayEntry`)*
- `AwayEntry = { ms: number; count: number; since: number | null }`, як у специфікації:
  - `ms` — закритий час поза грою;
  - `count` — скільки інтервалів закрито з ≥ 1 мс;
  - `since` — відколи людина зараз поза грою (час сервера), інакше `null`.
- `awayStart(state, person, now)`: людина під наглядом і `since === null` → `since = paused ? max(pausedAt, startedAt) : max(now, startedAt ?? now)`. Інакше той самий об'єкт.
- `awayEnd(state, person, now, gapMs = 0)`:
  - відкритий інтервал закривається: `ms += max(0, end − since)`, де `end = paused ? pausedAt : now`. Якщо додано ≥ 1 мс, `count += 1`;
  - `gapMs` (частина виходу без зв'язку, правило 2) додається, лише якщо людина під наглядом зараз. Розмір обмежено `now − startedAt`. Якщо інтервалу не було, а `gapMs > 0` — теж `count += 1`.
- **Пауза.** `resumeClock` зсуває `since` усіх відкритих інтервалів поточного запитання на тривалість паузи (`shiftAwayClocks(state, shift)` поруч із `shiftBuffClocks`, в обох гілках етапу `question`). Тож пауза не рахується, а людина, що досі поза грою, рахується далі.
- **Кінець нагляду** (подала відповідь, запитання закрилося, людина відключилася чи вилучена): `awayStep` закриває інтервал у мить кроку. `lockNow` часу не знає, тож закриття живе на межі кроків — у `RoomManager.commit`, де мить відома (`at`), як `stamp` 11b.

*Розрив зв'язку (правило 2) — тлумачення*
- Специфікація: «сервер бере менше з двох: заявлене й час розриву». Тлумачення плану: частина виходу, коли телефон був без зв'язку, — це **перетин** відрізків розриву `[dropAt, backAt]` (час сервера) і виходу за телефоном `[now − ms, now]`:
  ```
  awayGapMs(gap, ms, now) = max(0, min(backAt, now) − max(dropAt, now − ms))
  ```
  Тому:
  - чистий розрив без виходу (телефон видно, звіту немає або `ms: 0`) нічого не додає;
  - вихід, під час якого мережа впала, рахується повністю;
  - телефон не може заявити більше, ніж сервер бачив розриву.
- Частини виходу на зв'язку сервер рахує інтервалами: `disconnect` закриває інтервал (людина вже не на зв'язку), а телефон після перепідключення, якщо досі прихований, шле `{ away: true }` знову.
- `room.hidden` при розриві очищується, тож на перепідключенні інтервал не відкривається сам.

*Телефон, прихований до старту запитання*
- Телефон шле `away: true` на будь-якому етапі гри (не лише на запитанні). Сервер тримає в пам'яті кімнати `hidden: Map<person, at>`. `awayStep` відкриває інтервал кожній людині з `hidden`, яка щойно стала під наглядом. Тож хто сховав телефон на таблиці й так і не повернувся до запитання, рахується від старту запитання.

*Штраф*
- **Коли бали остаточні** (`awayStep`, за `prev` і `next`, запис `q = prev.questionIndex`):
  - **бліц** (`plays[q].blitz` є): коли `prev` на етапі `question`, а `next` — ні або вже інше запитання;
  - **решта:** коли `q` було «відкрите» в `prev` (етап `question`, `locked`, `reveal`, або `duel` з `duel.returnPhase` серед них), а в `next` — ні. Дуель, що вклинилася на розкритті, — ще не кінець.
- Умови штрафу:
  - `state.quiz.settings.awayPenalty === true`;
  - тип раунду з `AWAY_PENALTY_ROUNDS` (`classic`, `blitz`, `board`, `final`);
  - запитання з балами (`!isUnscored`).
- **Хто:**
  - учасник, у якого будь-яка людина має `ms ≥ AWAY_MS.penalty` на `q`;
  - запис учасника на `q` з `record.points > 0`;
  - у журналі ще немає `away` того самого учасника з `afterQuestion − 1 === q` (ідемпотентність: штраф після скасування не повертається).
- **Сума** — `−record.points` (разом із серією й бонусом швидкості) у мить штрафу, як фіксує суму скасування 12a. Від'ємні бали (штраф за помилку, мовчання у фіналі) не чіпаються.
- **Дописування:** `addAdjustment(next, participant, −points, at, 'away', { roundIndex: play.roundIndex })`.
  - Перевірка: `afterQuestionNow(next) − 1 === q`. Так є в усіх переходах (нове запитання, таблиця, поле, підсумки раунду, кінець гри). Якщо ні, штраф не дописується (захист від невідомого переходу).
  - Тест задачі 4 перевіряє кожен перехід.
- **«Ва-банк», «Вибування», «Мільйонер», опитування, хмара** — лише позначка.
- **Автопілот** — штраф так само. Панелі скасування немає (12a), знімає лише апеляція 12f.
- **Сповіщення про штраф** на сцену не йде (специфікація його не просить). Телефон попереджає сам (`OwnAway.penalty`). Скасування штрафу ведучим дає звичайне сповіщення 12a: «Ведучий скасував бали: Оля +200 (запитання 3)».

*Скасування (12a)*
- `UNDOABLE_SOURCES` = `['host', 'away']`. Штраф стоїть під своїм запитанням наявним `hostGroup` (`afterQuestion − 1`, той самий раунд) і схований, поки запитання на `locked` / `reveal`, як бали ведучого.
- `UndoRow.kind: 'away'` → текст «Оля −200 (вихід із гри)».
- «Скасувати все за запитання» скасовує і відповідь, і штраф — разом 0, як і має бути.

*Хто що бачить*
- **Пульт.**
  - `LiveRow.away: AwayMark[]` — люди рядка (соло — сам гравець, команда — її люди), у яких `ms ≥ AWAY_MS.mark` або `since !== null`.
  - `HostResponse.away: AwayMark[]` — те саме для таблиці відповідей на `locked` / `reveal`.
  - `AwayMark = { personId, nickname, ms, count, out }`, де `ms` — закрите (без відкритого інтервалу).
  - Тексти:
    - соло: «🙈 відволікався 12 с (2 рази)» (секунди — `awaySeconds(ms)` = `Math.floor(ms / 1000)`);
    - поза грою зараз: «🙈 зараз поза грою», а якщо вже було ≥ 2 с — «🙈 зараз поза грою · 12 с (2 рази)»;
    - командний рядок: з ім'ям людини — «🙈 Оля: відволікався 12 с (1 раз)».
- **Сцена.** `StageView.away: string[]` — нікнейми людей з `ms ≥ AWAY_MS.mark` на поточному запитанні в порядку гравців (у командній — людей). Є на `question`, `locked`, `reveal`, інакше `[]`. Секунд немає (анти-ціль). У сцени немає рядка імен «хто відповів» — лише лічильник «Відповіли N з M». Тож значок стоїть у шапці запитання поруч із лічильником: `span.away-line` «🙈 Оля, Петро». На розкритті — так само.
- **Телефон.** `PlayerView.away: OwnAway | null`:
  - поля: `{ play, ms, count, out, penalty }` лише своєї людини на поточному запитанні (`play` — індекс у `plays`); `null`, якщо запису немає;
  - `penalty` — штраф діє для цього запитання (налаштування, тип раунду, бали) і поріг 3 с уже пройдено людиною чи її командою.
  - Інші телефони чужих виходів не отримують. Командний зріз спільний (`ownView`), тож `away` додає `playerView` для людини, як `vote`.
- **Рядок на телефоні** `AwayNote` (`p.away-note`) на `question` / `locked` / `reveal`, коли `ms ≥ AWAY_MS.mark`: «Ти виходив із гри на 8 с — це видно всім» і, якщо `penalty`, «За це запитання буде 0 балів». На `reveal` після штрафу текст той самий: бали в результаті вже 0, а за ним видно чому.

*Тривога на телефоні (вимога власника 2026-10-28; рішення координатора)*
- **Коли.** Прихована вкладка не грає й не малює, тож тривога звучить у мить повернення. Тригер — підтверджений сервером стан: у `view.away` зріс `count` (інтервал закрито на поверненні), `ms ≥ AWAY_MS.mark`, `out === false` і сторінку видно. Тож тривога — та сама мить, що дає позначку.
- **Раз на вихід.** Ключ виходу — `${code}:${away.play}:${away.count}`. Останній показаний ключ лежить у `localStorage` (`saveAlarmSeen(code, key)`; читання й запис у `try/catch`, як інші ключі `storage.ts`). Оновлення сторінки чи перепідключення з тим самим `count` тривоги не повторює. Новий вихід (`count + 1`) — нова тривога.
- **Вигляд.** Повноекранний шар `div.away-alarm` з `role="alert"` поверх екрана гравця, тривалістю `AWAY_MS.alarm = 2500` мс:
  - червоне тло з пульсом (анімація `away-pulse`);
  - великий текст «🚨 Ти виходив із гри під час запитання!»;
  - якщо `penalty` — другий рядок «0 балів за це запитання».

  Дотик закриває шар достроково, інакше він зникає сам. З `prefers-reduced-motion: reduce` пульсу немає: статичне червоне тло (CSS під `@media (prefers-reduced-motion: no-preference)`, як наявні анімації `styles.css`).
- **Звук.** `playSiren(ms)` у новому `apps/web/src/siren.ts`:
  - Web Audio без файлу: `OscillatorNode` (`type: 'sawtooth'`) через `GainNode` (0,2);
  - частота ходить 600 ↔ 1200 Гц (`linearRampToValueAtTime`, півперіод 0,4 с) до кінця `ms`, потім `stop()` і `close()`;
  - контекст — `window.AudioContext ?? window.webkitAudioContext`; немає — тиша без помилки; `resume()` — у `try/catch`.

  Жест користувача на телефоні в грі вже був (вхід, відповіді), тож браузер звук дозволяє. Якщо ні — тиша, шар однаково є.
- **Налаштування звуку.** У застосунку немає власного перемикача звуку чи «без звуку» (перевірено: `storage.ts`, `screens/Debuffs.tsx` лише вібрує, `QuestionAudio` бере звук пристрою). Тож поважаємо лише системну гучність пристрою, нового перемикача не додаємо.
- **Хто.** Лише телефон людини, що виходила: `PlayerView.away` — своє. У командній грі тривогу отримує лише та людина, а не вся команда. Сцена й пульт — лише позначка й рядки з правил вище.
- **Сцена й пульт** тривоги не мають ніколи (компонент лише в `PlayerScreen`).

*Телефон: стеження (`useAwayWatch`)*
- Хук вмикається на сторінці гравця (`pages/Play.tsx`) для `view.role === 'player'` поза `lobby` і `finished`.
- Слухає `document` `visibilitychange` і `window` `blur` / `focus`:
  - **вихід:** `visibilityState === 'hidden'`, або `blur`, після якого через `AWAY_MS.blurGrace` `document.hasFocus()` — `false`, а `document.activeElement` — не `IFRAME`. Рішення про `blur` — у чистій функції `blurIsAway(hasFocus, activeTag)`;
  - **повернення:** `visible` чи `focus`, коли вихід зафіксовано.
- Надсилання:
  - на виході: `hiddenAt = Date.now()`, `player:away { away: true }`;
  - на поверненні: `{ away: false, ms: Date.now() − hiddenAt }` (обмежено `AWAY_REPORT_MAX_MS`).
- Без зв'язку звіт повернення чекає (останній лишається в `ref`). Коли `status` знову `'live'`, хук шле його. Якщо сторінка досі прихована — шле `{ away: true }`.
- Старий браузер без `visibilitychange` нічого не шле (чесна межа).

*Частота*
- `player:away` — не більше `AWAY_EVENTS_PER_SECOND = 4` за секунду на людину (`room.awayRate`, як `draftRate`), понад — `too_soon`. Подія, що нічого не змінила (людина не під наглядом), — `{ ok: true }` без `commit` і без розсилки.

*База й історія*
- `answer.away_ms`: у кожен рядок учасника на запитання (усі спроби бліцу й штрафний рядок) пишеться той самий час:
  - соло — `ms` гравця;
  - рядок команди — найбільше `ms` з її людей;
  - рядок голосу людини в командній грі — `ms` людини.

  Пишеться лише від `AWAY_MS.mark`, інакше `null` (позначки немає). Учасник без відповіді рядка не має: вихід без відповіді в базу не потрапляє (на бали він і так не впливає). 12j, якщо треба, допише своє.
- Історія:
  - `GameResponse.awayMs` — з першого рядка, `null` — без позначки;
  - фінал: `entries[].awayMs`.
  - Штраф — рядок `score_adjustment` з `source = 'away'`: розбивка показує «Вихід із гри», скасування 12a — як для будь-якого рядка.
- «🙈 Відволікався: на N запитаннях» у «Твоїй грі»:
  - `GameCard.away` — скільки запитань із позначкою;
  - `FactInput.away: { playerId, questionIndex }[]` (учасник рушія):
    - рушій бере `Play.away` (людина → учасник);
    - історія — рядки `answer` з `away_ms ≥ mark`.
  - Нагороди й таблиця історії від цього не залежать, тож тест «та сама гра — ті самі нагороди» (12d) не зачеплено.

*Чого не робимо*
- нової події-сповіщення про штраф на сцені;
- виявлення другого пристрою (не-ціль), вібрації, власного перемикача звуку;
- позначки чужих виходів на телефонах інших гравців;
- запису виходу без відповіді в базу;
- ачівок «honest» і «wanderer» (12j);
- нового демо-вмісту. Тексти e2e й довідки — без тем росії й СРСР.

## Глобальні обмеження

- **Анти-ціль:** «секунди «відволікався» … потрапляють на сцену або телефон. Сцена отримує лише значок». `StageView.away` — лише імена. Телефон бачить лише свої секунди (`PlayerView.away`). Перевіряють задачі 5 (зрізи) і 12 (кадри сцени без `"ms":` у `away`, кадри Олі без чужого `personId`).
- **Анти-ціль:** живі ігри не обриваються деплоєм. Версія 17, 16 — у `READABLE_STATE_VERSIONS` (задачі 3 і 7).
- **Анти-ціль:** «скасування балів ламає історію: сума рядків гравця в базі перестає дорівнювати його рахунку». Штраф — звичайне коригування. Задача 6 перевіряє: Σ `answer.points` + Σ `score_adjustment.points` = `participant.score` після штрафу й після його скасування.
- **Анти-ціль:** гра без ведучого не зависає. Штраф не чекає нічого, автопілот не змінюється. Подія `player:away` — від гравця, не «ведуча» (задача 7).
- **Анти-ціль:** старі вікторини не змінюють поведінки. Без `awayPenalty` штрафу немає, позначка — так (це нова механіка, а не зміна правил балів).
- **Анти-ціль:** тексти без тем росії й СРСР.
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`, тексти довідки — лише в `apps/web/src/help/*.ts`.
- Сцена 1280 × 720 без прокрутки. Телефон і пульт 375 px без горизонтальної прокрутки сторінки; шапка пульта в один рядок (`HEADER_ONE_LINE`).
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і тести:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=1 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- Наскрізні тести: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 12e"`.
  - **Лише на передньому плані.** Жодного запуску у фоні: команда йде в тому самому кроці, а результат читається одразу.
  - Затримка 11b в e2e увімкнена. Кнопки пульта чекають, доки стануть активними, без снів. Сон дозволено лише гравцям (вихід на 4 с).
  - Кадри лежать в `apps/server/e2e/artifacts/shots`, префікс — `p12e-`.
- Кожен коміт закінчується рядками:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  ```
- Після останньої задачі й фінальної рецензії гілку зливають у `main`. **Пуш — лише після згоди власника** (версія стану піднімається: правило пам'яті «Deploys kill live games») і після перевірки `live_room`. Якщо власник саме грає (правило «Push hold while playing»), пуш чекає.

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/away.ts` (новий), `away.test.ts` (новий), `index.ts`, `game.ts`, `quiz.ts`, `quiz.test.ts`, `breakdown.ts`, `breakdown.test.ts`, `undo.ts`, `events.ts` | сталі, типи, чисті функції, схема, джерело, подія | 1 |
| `packages/shared/src/views.ts`, `history.ts`, `facts.ts`; заглушки в `packages/engine/src/views.ts`, `live.ts`, `undo.ts`, `facts.ts`; `apps/server/src/history.ts`; фікстури зрізів, `LiveRow`, `HostResponse`, `GameDetail`, `GameCard` у тестах вебу й рушія | поля зрізів, історії й цікавинок із заглушками | 2 |
| `packages/engine/src/game.ts`, `away.ts` (новий), `away.test.ts` (новий), `restore.ts`, `restore.test.ts`, `index.ts` | стан, годинники, нагляд, версія 17 | 3 |
| `packages/engine/src/away.ts`, `away.penalty.test.ts` (новий), `undo.ts`, `views.undo.test.ts`, `facts.ts`, `facts.test.ts` | штраф, рядок скасування, `away` у цікавинках | 4 |
| `packages/engine/src/live.ts`, `live.test.ts`, `views.ts`, `views.away.test.ts` (новий) | пульт, сцена, свій телефон | 5 |
| `apps/server/drizzle/0015_answer_away.sql` + `meta`, `src/db/schema.ts`, `recorder.ts`, `recorder.test.ts`, `history.ts`, `history.away.test.ts` (новий), `testing/history-rows.ts` | міграція, запис і читання | 6 |
| `apps/server/src/rooms/manager.ts`, `rooms/manager.away.test.ts` (новий), `manager.drafts.test.ts`, `manager.restore.test.ts`, `socket.ts`, `socket.test.ts` | подія, годинник у `commit`, розриви, версія | 7 |
| `apps/web/src/live/useAwayWatch.ts` (новий), `useAwayWatch.test.tsx` (новий), `pages/Play.tsx`, `pages/Play.test.tsx` | стеження на телефоні | 8 |
| `apps/web/src/siren.ts` (новий), `siren.test.ts` (новий), `live/AwayAlarm.tsx` (новий), `live/AwayAlarm.test.tsx` (новий), `storage.ts`, `storage.test.ts`, `screens/PlayerScreen.tsx`, `PlayerScreen.test.tsx`, `i18n.ts`, `styles.css` | тривога, сирена, рядок на телефоні | 9 |
| `apps/web/src/away-text.ts` (новий), `away-text.test.ts` (новий), `screens/LiveAnswers.tsx`, `LiveAnswers.test.tsx`, `HostScreen.tsx`, `HostScreen.test.tsx`, `StageScreen.tsx`, `StageScreen.test.tsx`, `undo-panel.ts`, `undo-panel.test.ts`, `i18n.ts`, `styles.css` | пульт, сцена, аркуш скасування, розбивка | 10 |
| `apps/web/src/editor/QuizEditor.tsx`, `QuizEditor.test.tsx`, `help/settings.ts`, `help/host-help.test.ts`, `pages/GameHistory.tsx`, `pages/GameHistory.test.tsx`, `facts-text.ts`, `facts-text.test.ts`, `i18n.ts` | редактор, довідка, історія, «Твоя гра» | 11 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 12e | 12 |

## Порядок збирання

- 1 → 2 → 3 → 4 → 5. Задача 6 — після 4. Задача 7 — після 5. Задачі 8, 9, 10, 11 — після 2 (тести на фікстурах; наживо — після 7). Задача 12 — останньою.
- **Навмисні зміни наявних очікувань** (лише такі):
  - фікстури (задача 2):
    - кожен `LiveRow` отримує `away: []`, кожен `HostResponse` — `away: []`, кожен `StageView` — `away: []`, кожен `PlayerView` — `away: null`;
    - `GameResponse` — `awayMs: null`, записи фіналу історії — `awayMs: null`, `GameCard` — `away: 0`, `FactInput` у тестах shared — `away: []`;
    - файли: `apps/web/src/screens/*.test.tsx`, `team-test-view.ts`, `ladder-fixtures.ts`, `live/*.test.tsx`, `pages/History.test.tsx`, `pages/GameHistory.test.tsx`, `packages/shared/src/facts.test.ts`, `packages/engine/src/live.test.ts` і кожен файл, на який вкаже `pnpm typecheck`;
  - `packages/engine/src/restore.test.ts`: новий запис `KEYS[17]` (`Play` + `away`, `QuizSettings` + `awayPenalty`, новий рядок `AwayEntry` у `STATE_SHAPE`); записи 1–16 не змінюються (задача 3);
  - `apps/server/src/rooms/manager.drafts.test.ts`: «the game state version is 16» → 17 (задача 7);
  - `apps/server/src/rooms/manager.restore.test.ts`, тест 12c: `toBe(16)` → `toBe(GAME_STATE_VERSION)` (задача 7);
  - `packages/shared/src/breakdown.test.ts` і `undo.test.ts`: якщо котрийсь перелічує `SCORE_SOURCES` чи `UNDOABLE_SOURCES` повністю, до переліку додається `'away'` (задача 1);
  - `apps/web/src/help/host-help.test.ts`: порядок записів `setting.*` з новим `away` після `undo` (`SETTING_HELP_KEYS`), `autopilot` лишається останнім (задача 11);
  - e2e: наявні сценарії не змінюються. Playwright емулює фокус кожної сторінки, тож `blur` не приходить сам. Якщо в повному прогоні десь з'явиться «🙈» без виходу, це помилка `useAwayWatch`, а не привід правити очікування;
  - якщо падає інше, рецензент розбирає причину, а не правку очікування.

## На що дивитися рецензентові

1. **Годинник сервера.** Час рахує лише сервер. Пауза стоїть. Після подання відповіді вихід не рахується. Розрив без виходу — 0. Перетин розриву з виходом — так (задачі 3, 7).
2. **Штраф.** Лише з `awayPenalty`, лише від 3 с, лише додатні бали, лише раз; у бліці — на закритті, решта — на виході з розкриття; не в «Ва-банк» / «Вибуванні» / «Мільйонері» / опитуванні / хмарі; команда — за будь-кого з людей. `afterQuestion − 1` = запитання в кожному переході (задача 4).
3. **Скасування.** Рядок «(вихід із гри)» під своїм запитанням, схований до кінця розкриття. «Повернути» працює. Автопілот панелі не має (задачі 4, 10, 12).
4. **Таємність.** Секунди — лише пульт і свій телефон. Сцена — імена. Тривога — лише своя людина (задачі 5, 9, 12).
5. **Тривога.** Раз на вихід (ключ у `localStorage`), не на оновленні сторінки. `role="alert"`. Без пульсу з `prefers-reduced-motion`. Сирена без файлу. Немає `AudioContext` — без помилки (задача 9).
6. **Стан і база.** Версія 17, 16 читається; міграція `0015` лише додає стовпець; Σ рядків = рахунок (задачі 3, 6, 7).
7. **Вигляд.** Рядок «🙈 …» у шапці сцени 1280 × 720 не ламає шапку; рядки пульта на 375 px не налазять; шар тривоги на весь екран 375 × 812. Кадри `p12e-*`.

---

### Задача 1. Shared: сталі, джерело `away`, налаштування й подія

**Files:**
- Create: `packages/shared/src/away.ts`, `packages/shared/src/away.test.ts`
- Modify: `packages/shared/src/index.ts` (`export * from './away';`), `game.ts`, `quiz.ts`, `breakdown.ts`, `undo.ts`, `events.ts`
- Test: `packages/shared/src/away.test.ts`, `quiz.test.ts`, `breakdown.test.ts`

**Interfaces:**
- `packages/shared/src/away.ts`:
  ```ts
  import type { RoundType } from './quiz';

  /** Антигугл (12e): поріг позначки, поріг штрафу (сумарно за запитання), пауза перевірки blur, тривалість тривоги на телефоні, мс. */
  export const AWAY_MS = { mark: 2000, penalty: 3000, blurGrace: 300, alarm: 2500 } as const;
  /** Скільки подій player:away людина може надіслати за секунду; понад — too_soon. */
  export const AWAY_EVENTS_PER_SECOND = 4;
  /** Найдовший вихід, який телефон може заявити в одному звіті, мс. */
  export const AWAY_REPORT_MAX_MS = 3_600_000;
  /** Раунди, де діє штраф за вихід; у «Ва-банк», «Вибуванні» й «Мільйонері» — лише позначка. */
  export const AWAY_PENALTY_ROUNDS: readonly RoundType[] = ['classic', 'blitz', 'board', 'final'];

  /** Позначка людини на поточному запитанні для пульта (12e): ms — закритий час без відкритого інтервалу; out — зараз поза грою. */
  export interface AwayMark {
    personId: string;
    nickname: string;
    ms: number;
    count: number;
    out: boolean;
  }

  /** Свій вихід на поточному запитанні (12e), лише телефону цієї людини: play — індекс у plays (ключ тривоги); penalty — за це запитання буде 0. */
  export interface OwnAway {
    play: number;
    ms: number;
    count: number;
    out: boolean;
    penalty: boolean;
  }

  /**
   * Частина виходу, коли телефон був без зв'язку (12e, правило 2): перетин розриву [dropAt, backAt] (час сервера)
   * з виходом за телефоном [now − reportedMs, now]. Без розриву, без повернення чи без виходу — 0.
   */
  export function awayGapMs(gap: { dropAt: number; backAt: number | null } | null, reportedMs: number, now: number): number;

  /** Цілі секунди для тексту: 4999 мс → 4. */
  export function awaySeconds(ms: number): number;
  ```
- `game.ts`: `AdjustmentSource` + рядок
  ```ts
    /** Штраф за вихід із гри (12e): мінус бали запитання; запитання — afterQuestion − 1. */
    | 'away';
  ```
- `quiz.ts`, `quizSettingsSchema` (після `debuffShop`):
  ```ts
    /** Штраф за вихід із гри (12e): від AWAY_MS.penalty сумарно — 0 за запитання; немає поля — вимкнено. */
    awayPenalty: z.boolean().optional(),
  ```
- `breakdown.ts`: `SCORE_SOURCES = ['answers', 'final', 'duel', 'debuff', 'host', 'undo', 'away', 'wipeout', 'survival', 'ladder']`; `ADJUSTMENT_SOURCES` + `away: 'away'`.
- `undo.ts`: `export const UNDOABLE_SOURCES: readonly AdjustmentSource[] = ['host', 'away'];` (коментар: «12f допише 'appeal'»).
- `events.ts`:
  ```ts
  /** Вихід із гри (12e): away true — пішов; false — повернувся, ms — скільки тривав вихід за годинником телефона. */
  export const awaySchema = z.object({ away: z.boolean(), ms: z.number().int().min(0).max(AWAY_REPORT_MAX_MS).optional() });
  ```
  `ClientToServerEvents`, після `'player:draft'`:
  ```ts
  /** Антигугл (12e): телефон пішов із гри чи повернувся; час рахує сервер. */
  'player:away': (payload: z.infer<typeof awaySchema>, ack: Ack) => void;
  ```

- [ ] **Step 1: Write the failing tests**
  - `away.test.ts`:
    ```ts
    import { describe, expect, it } from 'vitest';
    import { awayGapMs, awaySeconds, AWAY_MS } from './away';

    describe('away helpers (12e)', () => {
      it('counts only the part of the hide when the phone was offline', () => {
        // Вихід 10 с: 1000…11000; розрив 4000…9000 → 5000.
        expect(awayGapMs({ dropAt: 4000, backAt: 9000 }, 10_000, 11_000)).toBe(5000);
        // Розрив почався до виходу: перетин лише з виходом.
        expect(awayGapMs({ dropAt: 0, backAt: 9000 }, 3000, 11_000)).toBe(1000);
        // Розрив без виходу (телефон видно) — 0; немає розриву чи повернення — 0.
        expect(awayGapMs({ dropAt: 4000, backAt: 9000 }, 0, 11_000)).toBe(0);
        expect(awayGapMs(null, 10_000, 11_000)).toBe(0);
        expect(awayGapMs({ dropAt: 4000, backAt: null }, 10_000, 11_000)).toBe(0);
      });
      it('whole seconds and the thresholds', () => {
        expect(awaySeconds(4999)).toBe(4);
        expect(AWAY_MS.mark).toBeLessThan(AWAY_MS.penalty);
      });
    });
    ```
  - `quiz.test.ts`: вікторина з `awayPenalty: true` проходить схему; без поля — теж; `awayPenalty: 'yes'` — ні.
  - `breakdown.test.ts`: `adjustmentSource('away')` → `'away'`; `breakdownOf` ставить `away` після `undo`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared` → FAIL.
- [ ] **Step 3: Implement.** JSDoc українською на кожному експорті. Якщо `undo.test.ts` чи `breakdown.test.ts` перелічують джерела повністю — дописати `'away'` (навмисна правка з «Порядку збирання»).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages` → PASS. Якщо typecheck падає на `Record<AdjustmentSource, …>` у вебі (тексти джерел), додати `scoreSource_away: 'Вихід із гри'` в `i18n.ts` уже тут.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src apps/web/src/i18n.ts
  git commit -m "feat(shared): anti-googling basics — thresholds for the marker, the penalty, the blur check and the phone alarm, the away adjustment source in the breakdown and the undo sheet, the awayPenalty quiz setting, the player:away event and the offline-part-of-a-hide helper

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 2. Shared: поля зрізів, історії й цікавинок; заглушки й фікстури

**Files:**
- Modify: `packages/shared/src/views.ts`, `history.ts`, `facts.ts`; заглушки — `packages/engine/src/live.ts`, `views.ts`, `undo.ts`, `facts.ts`, `apps/server/src/history.ts`
- Modify (фікстури): див. «Порядок збирання» і все, на що вкаже `pnpm typecheck`

**Interfaces:**
- `packages/shared/src/views.ts`:
  - `LiveRow` (після `wager`):
    ```ts
    /** Хто з людей рядка відволікався на цьому запитанні (12e): від AWAY_MS.mark або зараз поза грою; соло — сам гравець, команда — її люди. */
    away: AwayMark[];
    ```
  - `HostResponse` (після `clue`): `away: AwayMark[];` з тим самим JSDoc.
  - `StageView` (після `cloudVoters`):
    ```ts
    /** Нікнейми людей з позначкою «відволікався» на поточному запитанні (12e): question, locked, reveal; інакше []. Без секунд. */
    away: string[];
    ```
  - `PlayerView` (після `own`):
    ```ts
    /** Свій вихід на поточному запитанні (12e): лише ця людина (у командній грі — людина, не команда); null — виходів немає. */
    away: OwnAway | null;
    ```
  - `UndoRow.kind: 'answer' | 'host' | 'away';` (JSDoc: «away — штраф за вихід, ціль { seq }»).
- `packages/shared/src/history.ts`:
  - `GameResponse` + `/** Вихід із гри на цьому запитанні від AWAY_MS.mark, мс (12e); null — позначки немає чи стара гра. */ awayMs: number | null;`
  - `GameQuestionResult.final.entries[]` + `awayMs: number | null`.
- `packages/shared/src/facts.ts`:
  - `FactInput` + `/** Позначки «відволікався» (12e): учасник рушія × запитання. */ away: { playerId: string; questionIndex: number }[];`
  - `GameCard` + `/** На скількох запитаннях учасник відволікався (12e). */ away: number;`
  - `gameCard`: `away: new Set(input.away.filter((a) => a.playerId === playerId).map((a) => a.questionIndex)).size`.
- Заглушки до задач 4–6:
  - `live.ts`, `emptyRow` — `away: []`;
  - `views.ts`, `hostView` (відповіді) — `away: []`, `stageView` — `away: []`, `buildOwnView` / `lobbyView` / `playerView` — `away: null`;
  - `undo.ts` — без змін (`kind` ще `'host'`);
  - `facts.ts`, `factInput` — `away: []`;
  - `apps/server/src/history.ts` — `awayMs: null` у `responsesOf` і `finalResult`, `away: []` у `factInputOf`.

- [ ] **Step 1: Write the failing test.** У `packages/shared/src/facts.test.ts`: `gameCard` з `away: [{ playerId: 'o', questionIndex: 0 }, { playerId: 'o', questionIndex: 0 }, { playerId: 'o', questionIndex: 2 }]` → `away: 2`; у Петра — 0.
- [ ] **Step 2: Run** `pnpm typecheck` → FAIL (фікстури), `pnpm vitest run --maxWorkers=2 packages/shared/src/facts.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Нові поля обов'язкові. Фікстури — значеннями з «Порядку збирання». Логіки поза `gameCard` не додавати.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=1 apps/server && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages apps/server/src apps/web/src
  git commit -m "feat(shared): away marks on live rows and host responses, away names on the stage, the own away on the phone, the away undo row kind, away milliseconds in the history and the away count in the game card, with empty stubs until the engine and the history fill them

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 3. Рушій: стан `Play.away`, годинник, нагляд і версія 17

**Files:**
- Create: `packages/engine/src/away.ts`, `packages/engine/src/away.test.ts`
- Modify: `packages/engine/src/game.ts`, `restore.ts`, `restore.test.ts`, `index.ts` (`export * from './away';`)

**Interfaces:**
- `game.ts`:
  ```ts
  /** Вихід людини з гри на одному запитанні (12e): закритий час, скільки інтервалів закрито (≥ 1 мс), відколи поза грою зараз (час сервера) чи null. */
  export interface AwayEntry {
    ms: number;
    count: number;
    since: number | null;
  }
  ```
  `Play` (після `buzzers`):
  ```ts
  /** Антигугл (12e): виходи людей (соло — гравець, командна гра — людина) на цьому запитанні; немає ключа — не виходив. */
  away?: Record<string, AwayEntry>;
  ```
  Внутрішня `shiftAwayClocks(state, shift)` поруч із `shiftBuffClocks`: для `plays[questionIndex].away` кожне `since !== null` → `since + shift`. Викликається в обох гілках `resumeClock` для етапу `question` (таймер і без таймера), у тому самому ланцюжку, що `shiftBuffClocks`. Без змін — той самий об'єкт.
- `restore.ts`:
  - коментар версії: `* 17 — 12e: Play.away (виходи людей із гри), QuizSettings.awayPenalty, значення AdjustmentSource 'away'.`;
  - `GAME_STATE_VERSION = 17`;
  - пояснення: `* 16 → 17 лише додала необов'язкові Play.away і QuizSettings.awayPenalty (і значення AdjustmentSource 'away'), а стан версій 2–16 не може містити виходів чи штрафів: тож кімната, збережена до розгортання 12e, теж відновлюється.`;
  - `READABLE_STATE_VERSIONS = [2, …, 15, 16, GAME_STATE_VERSION]`.
- `away.ts` (не імпортує `views.ts`; імпортує `live.ts`, `game.ts`, `teams.ts`, `adjust.ts`):
  ```ts
  /** Учасник рушія людини (12e): соло — сам гравець; командна гра — команда людини; null — немає такої людини чи команди. */
  export function awayParticipant(state: GameState, personId: string): string | null;
  /** Людина під наглядом: етап question поточного раунду, на зв'язку, її рядок «Відповідей наживо» (answers / blitz) ще без відповіді. */
  export function awayTracked(state: GameState, personId: string): boolean;
  /** Людина пішла: відкриває інтервал (since — не раніше startedAt; на паузі — pausedAt). Не під наглядом чи вже поза грою — той самий об'єкт. */
  export function awayStart(state: GameState, personId: string, now: number): GameState;
  /** Людина повернулася: закриває інтервал (на паузі — до pausedAt) і додає gapMs, якщо людина під наглядом (не більше now − startedAt). Без змін — той самий об'єкт. */
  export function awayEnd(state: GameState, personId: string, now: number, gapMs?: number): GameState;
  /**
   * Годинник виходів між кроками (12e), викликає RoomManager.commit до stamp:
   * 1) закриває інтервали запитання prev, чиї люди в next уже не під наглядом (подали відповідь, закрито, розрив, вилучення);
   * 2) відкриває інтервали людям із hidden, які в next щойно стали під наглядом;
   * 3) дописує штрафи, бали яких стали остаточними (задача 4; тут — тотожність).
   * Без змін — той самий об'єкт next.
   */
  export function awayStep(prev: GameState, next: GameState, at: number, hidden: ReadonlySet<string>): GameState;
  ```
  - `awayTracked`: `hostLive(state)` один раз на стан (кеш `WeakMap<GameState, Set<string>>` множини людей під наглядом). Рядок `answered === false` з `kind` `'answers'` чи `'blitz'`: якщо рядок — команда (`teamsOn` і рядок не людина), до множини йдуть її люди на зв'язку (`TeamMember.connected`); інакше — сам id, якщо на зв'язку.
  - Ключ запису — людина; записи інших запитань не чіпаються.

- [ ] **Step 1: Write the failing tests** (`away.test.ts`; стан — `startRound(lobbyWith(makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')], { speedBonus: false, rules: DEFAULT_RULES })]), 'Оля', 'Петро'), 1000, rng)` з `./testing/helpers` і `./testing/fixtures`, як у `facts.test.ts`):
  ```ts
  it('the server clock counts from leave to return', () => {
    let s = awayStart(s0, 'p1', 2000);
    expect(s.plays[0].away?.p1).toEqual({ ms: 0, count: 0, since: 2000 });
    s = awayEnd(s, 'p1', 6500);
    expect(s.plays[0].away?.p1).toEqual({ ms: 4500, count: 1, since: null });
  });
  ```
  Окремі `it`:
  - **заставка:** вихід до `startedAt` → `since === startedAt`; повернення до старту → `ms: 0`, `count: 0`;
  - **пауза:** вихід 2000, `pause(…, 3000)`, `resume(…, 10_000)`, повернення 11_000 → `ms` = 1000 + 1000 = 2000 (пауза не рахується); повернення на паузі (у 5000) → `ms` = 1000;
  - **вихід на паузі:** `pause` у 3000, вихід у 4000, `resume` у 10_000, повернення 12_000 → `ms` 2000;
  - **після подання:** Оля відповіла → `awayTracked(s, 'p1')` `false`, `awayStart` повертає той самий об'єкт;
  - **`awayStep` закриває:** відкритий інтервал Петра, `next = lock(s)` → `awayStep(s, next, 9000, new Set())` закриває в 9000; той самий виклик без змін → `next` (той самий об'єкт);
  - **`awayStep` відкриває для прихованих:** `prev` — таблиця між запитаннями, `next` — нове запитання з `startedAt` 20_000 → `awayStep(prev, next, 19_000, new Set(['p2']))` дає `since: 20_000` у нового запису;
  - **розрив:** `setConnected(s, 'p2', false, …)` → не під наглядом; `awayStep` закриває інтервал у мить розриву;
  - **`gapMs`:** `awayEnd(s, 'p2', 15_000, 4000)` без відкритого інтервалу → `ms: 4000`, `count: 1`; на закритому запитанні `gapMs` не додається;
  - **поле:** на звичайній клітинці під наглядом лише той, хто вибрав; на бліц-клітинці — усі (фікстури поля, як `game.board.test.ts`);
  - **блеф:** у фазі вигадок під наглядом ті, хто ще не написав; у фазі вибору — хто не вибрав (`game.bluff.test.ts`);
  - **«Вибування»:** привиди не під наглядом;
  - **команди:** `teamGame(…)` (`./testing/teams`) — під наглядом люди команди на зв'язку, ключ запису — `m1`; після відповіді капітана — ніхто з команди.
  - `restore.test.ts`: запис `KEYS[17]` і `AwayEntry: keysOf<AwayEntry>()(['ms', 'count', 'since'], true)` у `STATE_SHAPE`; стан версії 16 читається (`READABLE_STATE_VERSIONS` містить 16); `suspend` стану з відкритим інтервалом не ламає (інтервал закриється на першому `awayStep` після повернення; перевірити `awayStep(suspended, suspended, at, new Set())` → закрито до `pausedAt`).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/away.test.ts packages/engine/src/restore.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `awayStep` поки без штрафу (крок 3 — тотожність із `TODO(12e задача 4)` без коду). Перевірити пошуком, що `away.ts` не імпортує `views.ts`, а `game.ts` не імпортує `away.ts`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine/src
  git commit -m "feat(engine): the server clock for leaving the game (state version 17, version 16 still restores) — counted from the real question start until the own answer or the close, frozen by a pause, stopped by a disconnect, watching exactly who still has to answer in every format and the people of a team, and opened for phones that were hidden before the question began

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 4. Рушій: штраф, рядок скасування, `away` у цікавинках

**Files:**
- Create: `packages/engine/src/away.penalty.test.ts`
- Modify: `packages/engine/src/away.ts`, `undo.ts`, `facts.ts`
- Test: `away.penalty.test.ts`, `views.undo.test.ts`, `facts.test.ts`

**Interfaces:**
- `away.ts`:
  ```ts
  /** Чи діє штраф на запитанні plays[q]: awayPenalty, раунд з AWAY_PENALTY_ROUNDS, запитання з балами. */
  export function awayPenaltyOn(state: GameState, q: number): boolean;
  /** Учасники, яких штраф зачепить на plays[q]: будь-яка людина учасника має ms ≥ AWAY_MS.penalty. Порядок — state.players. */
  export function awayPenalized(state: GameState, q: number): string[];
  ```
  Крок 3 `awayStep` — за правилами «Штраф» у рішеннях плану: `due(prev, next)` → для кожного `awayPenalized(next, q)` з `record.points > 0` і без наявного `away` (той самий `playerId`, `afterQuestion − 1 === q`) → `addAdjustment(…, 'away', { roundIndex })`, якщо `afterQuestionNow(next) − 1 === q`.
- `undo.ts`, `rowsOf`: `kind: adjustment.source === 'away' ? 'away' : 'host'` (решта як є — `hostGroup`, `visible`, `{ seq }`).
- `facts.ts`, `factInput`: `away` — для кожного закритого запитання `q` і кожного запису `play.away` з `ms ≥ AWAY_MS.mark`: `{ playerId: awayParticipant(state, person), questionIndex: q }` (без `null`, без повторів).

- [ ] **Step 1: Write the failing tests** (`away.penalty.test.ts`; вікторина з `settings: { ...DEFAULT_SETTINGS, awayPenalty: true }`):
  ```ts
  it('three seconds away cost the positive points of the question once, on leaving the reveal', () => {
    // Оля виходила 3500 мс і відповіла правильно (+100); Петро — неправильно.
    const reveal = must(next(locked, 9000, rng)); // locked → reveal
    expect(awayStep(locked, reveal, 9000, new Set()).adjustments).toEqual([]);
    const moved = must(next(reveal, 10_000, rng)); // reveal → leaderboard
    const s = awayStep(reveal, moved, 10_000, new Set());
    expect(s.adjustments).toEqual([expect.objectContaining({ playerId: 'p1', points: -100, source: 'away', afterQuestion: 1, roundIndex: 0 })]);
    expect(s.players.find((p) => p.id === 'p1')?.score).toBe(0);
    expect(awayStep(s, s, 11_000, new Set())).toBe(s);
  });
  ```
  Окремі `it`:
  - **поріг:** 2900 мс — штрафу немає; 3000 — є; дві відлучки по 1600 — є (сумарно);
  - **без налаштування:** `awayPenalty` немає — штрафу немає за 10 с;
  - **від'ємні бали:** з `penalty: 'minus'` неправильна відповідь (−100) і 5 с — штрафу немає;
  - **оцінка ведучого на розкритті:** `override(…, 'correct')` на розкритті, потім вихід із розкриття → штраф дорівнює новим балам;
  - **бліц:** штраф на закритті (`prev` — `question`, `next` — `locked`), сума — бали спроб гравця;
  - **поле:** звичайна клітинка — штраф на виході з розкриття; `afterQuestion − 1` — індекс клітинки;
  - **фінал:** штраф на виході з розкриття фіналу (`finishRound`), сума — видимі бали фіналу;
  - **«Ва-банк», «Вибування», «Мільйонер», опитування** — без штрафу (позначка лишається в `Play.away`);
  - **переходи:** для кожного з «нове запитання», «таблиця», «підсумки раунду», «кінець гри», «Завершити раунд» з етапу `question` — `afterQuestion − 1 === q`;
  - **дуель на розкритті:** `reveal` → `duel` — штрафу немає; повернення з дуелі й вихід із розкриття — штраф;
  - **команда:** людина `m2` команди `t1` виходила 3500 мс, відповідав капітан правильно → штраф `t1`;
  - **автопілот:** стан з `autopilot` — штраф так само;
  - **скасування:** `undoScore(s, { seq }, …)` штрафу → бали повертаються; `awayStep` штрафу знову не дописує.
  - `views.undo.test.ts`: після штрафу аркуш має рядок `{ kind: 'away', points: -100, target: { seq } }` під своїм запитанням, лише коли розкриття скінчилося; «Скасувати все за запитання» дає 0 за запитання.
  - `facts.test.ts`: `factInput(s).away` — `[{ playerId: 'p1', questionIndex: 0 }]` від 2 с; 1900 мс — немає; команда — `t1`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/away.penalty.test.ts packages/engine/src/views.undo.test.ts packages/engine/src/facts.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Суму бере `recordOf(next, q, participant).points`. Межа `LIMITS.maxAdjust` до штрафу не застосовується (як до скасування).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine/src
  git commit -m "feat(engine): with awayPenalty three seconds away zero the positive points of the question once its points are final — on leaving the reveal, in a blitz on the close — in classic, board, blitz and final rounds only, for a team when any of its people left; the penalty is an undoable row under its question and the away marks feed the own game card

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 5. Рушій: позначки для пульта, сцени й свого телефона

**Files:**
- Create: `packages/engine/src/views.away.test.ts`
- Modify: `packages/engine/src/away.ts`, `live.ts`, `views.ts`
- Test: `views.away.test.ts`, `live.test.ts`

**Interfaces:**
- `away.ts`:
  ```ts
  /** Позначка людини на поточному запитанні: від AWAY_MS.mark або зараз поза грою; інакше null. */
  export function awayMarkOf(state: GameState, personId: string): AwayMark | null;
  /** Позначки людей учасника рушія (соло — гравець; команда — її люди в порядку teams.members). */
  export function awayPeople(state: GameState, participantId: string): AwayMark[];
  /** Нікнейми з позначкою (ms ≥ mark) для сцени: question, locked, reveal; інакше []. */
  export function stageAway(state: GameState): string[];
  /** Свій вихід людини на поточному запитанні; null — запису немає чи етап не question / locked / reveal. */
  export function ownAway(state: GameState, personId: string): OwnAway | null;
  ```
  - `ownAway.penalty`: `awayPenaltyOn(state, q)` і (`ms` людини ≥ `penalty` або учасник уже в `awayPenalized`), а запис учасника не має від'ємних балів, якщо він уже є.
- `live.ts`: `answerRow`, `blitzRow`, `progressRow`, `ghostRow`, `trialLive`, `duelLive` — `away: awayPeople(state, who.id)` для рядків `answers` / `blitz` (у командному опитуванні рядок — людина, тоді `awayMarkOf` як масив з одного). Привиди, зал, випробування, дуель — `[]`.
- `views.ts`:
  - `hostView`, кожен `HostResponse` — `away: awayPeople(state, player.id)` (голоси без балів у командній грі — `awayMarkOf` людини);
  - `stageView` — `away: stageAway(state)`;
  - `playerView` — `away: ownAway(state, personId)`, де `personId` — соло-гравець чи `member.id`; `lobbyView` — `away: null`.

- [ ] **Step 1: Write the failing tests** (`views.away.test.ts`):
  - **пульт наживо:** Оля поза грою 1 с → рядок `away: [{ nickname: 'Оля', ms: 0, out: true }]`; повернулася на 1500 мс → `[]` (менше порогу); ще вихід 1000 мс → `[{ ms: 2500, count: 2, out: false }]`;
  - **таблиця відповідей:** на `reveal` у `HostResponse` Олі — та сама позначка;
  - **сцена:** `stageView(s).away` → `['Оля']` на `question`, `locked`, `reveal`; на таблиці — `[]`; у `JSON.stringify(stageView(s))` немає `"ms"` поруч із `away` (перевірити, що `away` — масив рядків);
  - **свій телефон:** `playerView(s, 'p1').away` → `{ play: 0, ms: 2500, count: 2, out: false, penalty: false }`; `playerView(s, 'p2').away` → `null` і в зрізі Петра немає `'p1'` у `away`;
  - **штраф наперед:** з `awayPenalty` і 3500 мс — `penalty: true` ще на `question`; без налаштування — `false`; у «Ва-банк» — `false`;
  - **команди:** `playerView(s, 'm2').away` — запис `m2`; `playerView(s, 'm1').away` — `null`, хоча зріз команди спільний; рядок пульта команди — `away: [{ personId: 'm2', … }]`.
  - `live.test.ts`: наявні очікування з `away: []` (задача 2) лишаються; новий тест — рядок бліцу з позначкою.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/views.away.test.ts packages/engine/src/live.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Заглушки задачі 2 замінити.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine/src
  git commit -m "feat(engine): away marks for the host live rows and the answer table with seconds, times and «out now», names only for the stage, the own away with the coming penalty only on the own phone — the person, not the whole team

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 6. Сервер: міграція `0015`, запис і читання `away_ms`

**Files:**
- Create: `apps/server/drizzle/0015_answer_away.sql` (+ `apps/server/drizzle/meta/_journal.json`, `0015_snapshot.json`), `apps/server/src/history.away.test.ts`
- Modify: `apps/server/src/db/schema.ts`, `recorder.ts`, `history.ts`, `testing/history-rows.ts`
- Test: `history.away.test.ts`, `recorder.test.ts`

**Interfaces:**
- `schema.ts`, `answer` (після `spareId`):
  ```ts
  /** Вихід із гри на цьому запитанні від AWAY_MS.mark, мс (12e); null — без позначки (і в старих іграх). */
  awayMs: integer('away_ms'),
  ```
- Міграцію згенерувати з теки `apps/server`: `pnpm exec drizzle-kit generate --name answer_away`. Перший рядок — коментар, як у `0014_score_undo.sql`. Очікуваний SQL:
  ```sql
  -- Антигугл (план 12e): скільки мс учасник був поза грою на цьому запитанні (від порогу позначки). Старі рядки — null.
  ALTER TABLE "answer" ADD COLUMN "away_ms" integer;
  ```
- `recorder.ts`:
  - `AnswerRow` + `awayMs: number | null`;
  - нова функція поруч з `answerRows`:
    ```ts
    /** Вихід учасника на запитанні для away_ms (12e): соло — свій; команда — найбільший з людей; людина (голос) — свій; менше AWAY_MS.mark — null. */
    function awayMsOf(state: GameState, index: number, participantId: string): number | null;
    ```
    Кожен рядок `answerRows(state, index, id)` отримує `awayMs: awayMsOf(state, index, id)`;
  - `saveAnswers`: `awayMs` іде і в `values`, і в `set` (`...grade`).
  - Коригування `away` пишуться наявним кодом (`source`).
- `history.ts`:
  - вибірка `answers` + `awayMs: answer.awayMs`;
  - `responsesOf` → `awayMs: a.awayMs ?? null`; `finalResult` → `awayMs` рядка;
  - `factInputOf` → `away`: рядки з `awayMs ≥ AWAY_MS.mark` і `attempt >= 0` учасників таблиці, без повторів.
- `testing/history-rows.ts`: рядок відповіді приймає `awayMs?`.

- [ ] **Step 1: Write the failing tests** (`history.away.test.ts`; підготовка — як у `history.test.ts`: `createTestDb`, `buildApp`, `signUp`, `ctx.manager`, `recorder.idle()`):
  - **запис і читання:** гра з `awayPenalty`: Оля виходила 3,5 с (через `manager.away`, задача 7; якщо задачі 7 ще немає — прямим `room.state = awayEnd(awayStart(…))` з FakeScheduler) і відповіла правильно. Після виходу з розкриття й `finished`:
    - `detail.questions[0].responses` Олі має `awayMs` ≥ 3000, у Петра — `null`;
    - коригування `{ source: 'away', points: -100 }` є в `detail.adjustments`;
    - розбивка Олі має `away: { minus: -100 }`;
  - **Σ рядків = рахунок:** для кожного учасника Σ `answer.points` + Σ `score_adjustment.points` = `participant.score` — після штрафу й після `host:undo { seq }` штрафу;
  - **команда:** рядок команди має найбільше `awayMs` людей;
  - **стара гра** (`seedGame` без `awayMs`) → `awayMs: null`, `facts.awards` як раніше;
  - **«Твоя гра» з історії не рахується**, але `factInputOf(...).away` має запис Олі (через `gameCard` нічого не викликається — перевірка через експорт для тесту не потрібна: перевірити, що `facts.awards` і `facts.table` гри з виходом рівні `gameAwards(factInput(room.state))` і `factTable(...)`, як у 12d).
  - `recorder.test.ts`: рядок бліцу з двома спробами — обидва з тим самим `away_ms`; вихід 1,5 с — `null`.
  - Міграція: PGlite піднімає схему з `0015` (наявні `schema.test.ts` / `client.test.ts` — без правок, лише прогін).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/history.away.test.ts apps/server/src/recorder.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=1 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server
  git commit -m "feat(server): answers keep how long their player was out of the game (migration 0015, answer.away_ms, from the marker threshold; the longest of the people for a team), the history detail shows it beside answers and final entries, the away penalty is a stored adjustment with its own breakdown line, and stored rows still sum to the score after a penalty and its undo

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 7. Сервер: подія `player:away`, годинник у `commit`, розриви

**Files:**
- Create: `apps/server/src/rooms/manager.away.test.ts`
- Modify: `apps/server/src/rooms/manager.ts`, `socket.ts`, `rooms/manager.drafts.test.ts`, `rooms/manager.restore.test.ts`
- Test: `manager.away.test.ts`, `socket.test.ts`, `manager.restore.test.ts`, `manager.drafts.test.ts`

**Interfaces:**
- `manager.ts`, `Room` (після `awardsSeq`):
  ```ts
  /** Антигугл (12e): людина → мить (час менеджера), коли телефон сказав «пішов»; повернення чи розрив прибирає. Лише в пам'яті. */
  hidden: Map<string, number>;
  /** Антигугл (12e): людина → останній розрив (dropAt) і повернення (backAt, null — ще без зв'язку); звіт повернення прибирає. Лише в пам'яті. */
  gaps: Map<string, { dropAt: number; backAt: number | null }>;
  /** Вікно частоти player:away (12e), як draftRate. Лише в пам'яті. */
  awayRate: Map<string, { from: number; count: number }>;
  ```
  Початкові порожні мапи — там само, де `drafts` / `draftRate` (створення й відновлення кімнати). Вилучення людини (`kick`, `removePlayer`) прибирає її з усіх трьох.
- Метод поруч із `draft`:
  ```ts
  /**
   * Антигугл (12e): телефон людини пішов із гри (away) чи повернувся (ms — тривалість за телефоном). Час рахує рушій за годинником
   * менеджера; частина виходу без зв'язку — awayGapMs. Понад AWAY_EVENTS_PER_SECOND за секунду — too_soon. Незмінений стан — { ok: true } без commit.
   */
  away(room: Room, personId: string, away: boolean, ms?: number): AckResult {
    if (!this.alive(room)) return this.gone();
    if (awayParticipant(room.state, personId) === null) return { ok: false, error: 'not_found' };
    // частота — як draft (room.awayRate)
    const now = this.now();
    let next: GameState;
    if (away) {
      room.hidden.set(personId, now);
      next = awayStart(room.state, personId, now);
    } else {
      room.hidden.delete(personId);
      const gap = room.gaps.get(personId) ?? null;
      room.gaps.delete(personId);
      next = awayEnd(room.state, personId, now, awayGapMs(gap, ms ?? 0, now));
    }
    if (next === room.state) return { ok: true };
    this.commit(room, next);
    return { ok: true };
  }
  ```
- `commit`: першим рядком `state = awayStep(room.state, state, at, new Set(room.hidden.keys()))` (до `stamp`). Перевірити, що інші місця, які пишуть `room.state` в обхід `commit`, — лише відновлення й заморожування (пошуком `room.state =`), і записати це в звіті.
- `connect` (людина, `count === 1`): якщо є `gaps.get(person)` з `backAt === null` → `backAt = now`. `disconnect` (людина, останнє з'єднання): `gaps.set(person, { dropAt: now, backAt: null })`, `hidden.delete(person)` — перед `apply(setConnected…)`, тож `awayStep` у тому `commit` уже бачить розрив.
- `socket.ts`, поруч із `player:draft`:
  ```ts
  on('player:away', (args) => {
    if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
    const payload = awaySchema.safeParse(payloadOf(args));
    return payload.success ? manager.away(room, identity.playerId, payload.data.away, payload.data.ms) : INVALID;
  });
  ```
  Подія від гравця, тож автор автопілота діє як звичайний гравець.

- [ ] **Step 1: Write the failing tests**
  - `manager.away.test.ts` (за зразком `manager.clues-self.test.ts`: `FakeScheduler`, `RoomManager`, `HOST`, `scheduler.advance(SPLASH_MS.question)`):
    - **годинник менеджера:** вихід у t, повернення через 4000 мс (`scheduler.advance(4000)`) → `room.state.plays[0].away[olena].ms === 4000`; пульт (`manager.view(room, HOST)`) має `live.rows` Олени з `away: [{ ms: 4000, count: 1 }]`;
    - **після відповіді не рахується:** відповідь, потім вихід 5 с → `ms` 0, запису немає;
    - **розрив без виходу:** `disconnect` на 6 с, `connect`, звіт `{ away: false, ms: 0 }` → 0;
    - **вихід із розривом:** `away: true`, через 1 с `disconnect`, через 5 с `connect`, через 1 с `{ away: false, ms: 7000 }` → `ms` = 1000 (на зв'язку до розриву) + 5000 (перетин) = 6000;
    - **прихований до запитання:** `away: true` на таблиці, потім «Далі» і 3 с запитання, потім повернення → `ms` ≈ 3000 від `startedAt` (заставка не рахується);
    - **штраф у commit:** вікторина з `awayPenalty`, 3,5 с поза грою, правильна відповідь, «Показати відповідь» і «Далі» → у `room.state.adjustments` — `away`; `manager.host(room, { type: 'undo', target: { seq } })` → бали повертаються;
    - **автопілот:** у кімнаті-автопілоті той самий вихід дає штраф без пульта; `manager.author(room, author, { type: 'undo', … })` → `not_allowed` (наявне правило 12a);
    - **частота:** п'ята подія за секунду → `too_soon`;
    - **незмінений стан:** `away: false` без виходу → `{ ok: true }` і жодної події `changed`;
    - **невідома людина** → `not_found`.
  - `socket.test.ts`: гравець шле `player:away { away: true }` → `{ ok: true }`; пульт шле `player:away` → `forbidden`; `{ away: 'x' }` → `invalid`.
  - `manager.restore.test.ts`: кімната з відкритим інтервалом зберігається (`stateVersion` 17) і відновлюється; після повернення гравця й першого `commit` інтервал закрито до миті збереження; кімната версії 16 (збережений знімок з `stateVersion: 16`) відновлюється. Тест 12c: `toBe(16)` → `toBe(GAME_STATE_VERSION)`.
  - `manager.drafts.test.ts`: «the game state version is 17» (`toBe(17)`).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/rooms/manager.away.test.ts apps/server/src/socket.test.ts apps/server/src/rooms/manager.restore.test.ts apps/server/src/rooms/manager.drafts.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=1 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/src
  git commit -m "feat(server): player:away lets a phone say it left the game or came back — the room clock counts it in every committed step, a pure disconnect costs nothing while the offline part of a real hide counts as the overlap with the gap, phones hidden before the question are counted from its start, the penalty lands when points are final and the host can undo it, and version 16 rooms still restore

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 8. Веб, телефон: стеження за виходом

**Files:**
- Create: `apps/web/src/live/useAwayWatch.ts`, `apps/web/src/live/useAwayWatch.test.tsx`
- Modify: `apps/web/src/pages/Play.tsx`
- Test: `useAwayWatch.test.tsx`, `pages/Play.test.tsx`

**Interfaces:**
- `useAwayWatch.ts`:
  ```ts
  import { AWAY_MS, AWAY_REPORT_MAX_MS, type GameView } from '@quiz/shared';
  import type { Send } from './types';
  import type { Status } from './useGame';

  /** Чи blur — вихід із гри (12e): фокусу немає, і він не в iframe гри (відео YouTube). */
  export function blurIsAway(hasFocus: boolean, activeTag: string | null): boolean;

  /**
   * Антигугл (12e): стежить за visibilitychange і blur / focus на сторінці гравця й шле player:away.
   * Вихід — { away: true }; повернення — { away: false, ms } (за годинником телефона, не більше AWAY_REPORT_MAX_MS).
   * Без зв'язку звіт чекає; після перепідключення (status 'live') — звіт, а якщо сторінка досі прихована — { away: true }.
   * Вимкнено поза роллю player, у лобі й після кінця гри.
   */
  export function useAwayWatch(send: Send, status: Status, view: GameView | null): void;
  ```
  - Стан у `ref`: `hiddenAt: number | null`, `pending: { away: false; ms: number } | null`, таймер перевірки `blur`.
  - `blur` → `setTimeout(AWAY_MS.blurGrace)` → `blurIsAway(document.hasFocus(), document.activeElement?.tagName ?? null)` → вихід. `focus` до кінця 300 мс скасовує перевірку.
  - Подвійний вихід (`hidden` після `blur`) — один вихід; повернення — коли сторінку видно й є фокус або прийшов `visible`.
  - `send` не чекає відповіді (помилки ігноруються: телефон не блокується).
- `Play.tsx`: `useAwayWatch(game.send, game.status, game.view)` поруч із `useGame`.

- [ ] **Step 1: Write the failing tests** (`useAwayWatch.test.tsx`; `renderHook`, `vi.useFakeTimers()`, `send = vi.fn().mockResolvedValue({ ok: true })`, `visibilityState` — через `Object.defineProperty(document, 'visibilityState', { configurable: true, get })` і `document.dispatchEvent(new Event('visibilitychange'))`, як `useInvites.test.tsx`):
  - прихована сторінка → `send('player:away', { away: true })`; через 4000 мс видно → `send('player:away', { away: false, ms: 4000 })`;
  - `blur` з `hasFocus() === false` → через 300 мс вихід; `blur` з фокусом в `IFRAME` (`document.activeElement` — `iframe`) → нічого; `blur`, а через 100 мс `focus` → нічого;
  - `blurIsAway(false, 'IFRAME')` → `false`, `blurIsAway(false, 'BODY')` → `true`, `blurIsAway(true, null)` → `false`;
  - `status: 'offline'` на поверненні → нічого не шле; `rerender` зі `status: 'live'` → шле `{ away: false, ms }`;
  - перепідключення, поки прихована → `{ away: true }` знову;
  - роль `stage` / `host`, лобі, `finished` → жодного `send`.
  - `Play.test.tsx`: сторінка гравця з фейковим сокетом шле `player:away` на `visibilitychange` (якщо в тесті є зручний фейк `useGame`; інакше достатньо тестів хука й перевірки, що `Play.tsx` викликає хук — `vi.mock('../live/useAwayWatch')`).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/live/useAwayWatch.test.tsx apps/web/src/pages/Play.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Слухачі знімаються в очищенні ефекту.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): the player page tells the server when the phone leaves the game — a hidden tab or a real blur (not a game iframe, checked after 300 ms) — and when it comes back with how long, keeping the report through a reconnect and saying again it is hidden after one

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 9. Веб, телефон: тривога (червоний екран і сирена) й рядок «Ти виходив із гри»

Ця задача виконує додаткову вимогу власника від 2026-10-28 («звуковий алярт + червоніння екрану у того хто гуглить»). Правила — у рішеннях плану, «Тривога на телефоні».

**Files:**
- Create: `apps/web/src/siren.ts`, `apps/web/src/siren.test.ts`, `apps/web/src/live/AwayAlarm.tsx`, `apps/web/src/live/AwayAlarm.test.tsx`
- Modify: `apps/web/src/storage.ts`, `storage.test.ts`, `screens/PlayerScreen.tsx`, `screens/PlayerScreen.test.tsx`, `i18n.ts`, `styles.css`

**Interfaces:**
- `siren.ts`:
  ```ts
  /**
   * Сирена тривоги (12e): Web Audio без файлу — пилка через гучність 0,2, частота 600 ↔ 1200 Гц (півперіод 0,4 с) протягом ms,
   * потім stop і close. Немає AudioContext чи браузер не дозволив — тиша без помилки. Повертає функцію, що зупиняє звук достроково.
   */
  export function playSiren(ms: number): () => void;
  ```
- `storage.ts`:
  ```ts
  /** Останній вихід, для якого телефон уже показав тривогу (12e): `${play}:${count}`; null — не було. */
  export const loadAlarmSeen = (code: string): string | null => read(`quiz.alarm.${code}`);
  export const saveAlarmSeen = (code: string, key: string): void => write(`quiz.alarm.${code}`, key);
  ```
  (назву ключа узгодити з наявними префіксами `storage.ts`).
- `live/AwayAlarm.tsx`:
  ```ts
  /** Чи показати тривогу для цього стану (12e): вихід закрито (out false), ms ≥ AWAY_MS.mark, count > 0, ключ ще не показано. */
  export function alarmKey(away: OwnAway | null, seen: string | null): string | null;
  /**
   * Тривога (12e): повноекранний червоний шар role="alert" на AWAY_MS.alarm з «🚨 Ти виходив із гри під час запитання!»
   * (і «0 балів за це запитання» зі штрафом) і сирена; дотик закриває. Раз на вихід: ключ у localStorage. Лише коли сторінку видно.
   */
  export function AwayAlarm({ code, away }: { code: string; away: OwnAway | null }): JSX.Element | null;
  /** Рядок під запитанням (12e): «Ти виходив із гри на 8 с — це видно всім» (+ «За це запитання буде 0 балів»), від AWAY_MS.mark. */
  export function AwayNote({ away }: { away: OwnAway | null }): JSX.Element | null;
  ```
  - `AwayAlarm`: `useEffect` на `alarmKey(away, loadAlarmSeen(code))`. Якщо ключ є і `document.visibilityState === 'visible'` → `saveAlarmSeen`, `open = true`, `stop = playSiren(AWAY_MS.alarm)`, таймер `AWAY_MS.alarm` закриває. Дотик (`onClick` на шарі) закриває й викликає `stop()`. Очищення ефекту — `stop()` і таймер.
  - Розмітка: `<div className="away-alarm" role="alert" onClick={close}><p className="away-alarm-title">🚨 …</p>{penalty && <p className="away-alarm-penalty">…</p>}</div>`.
- `PlayerScreen.tsx`: `<AwayAlarm code={code} away={view.away} />` останнім дочірнім елементом кореня екрана (поверх заставок); `<AwayNote away={view.away} />` під рядком запитання на `question` / `locked` / `reveal`.
- `i18n.ts`:
  ```ts
  awayAlarmTitle: '🚨 Ти виходив із гри під час запитання!',
  awayAlarmPenalty: '0 балів за це запитання',
  awayNote: 'Ти виходив із гри на {seconds} с — це видно всім',
  awayNotePenalty: 'За це запитання буде 0 балів',
  ```
- `styles.css`:
  - `.away-alarm { position: fixed; inset: 0; z-index: <вище за .splash>; display: grid; place-content: center; gap: 12px; padding: 24px 16px; background: #c62828; color: #fff; text-align: center; }`, великий заголовок;
  - під `@media (prefers-reduced-motion: no-preference)` — `animation: away-pulse 0.5s ease-in-out infinite alternate` (`#c62828` ↔ `#ff1744`);
  - `.away-note` — рядок `meta` червоного кольору теми.

- [ ] **Step 1: Write the failing tests**
  - `siren.test.ts` (мок `AudioContext` у `globalThis`: фабрика з `createOscillator` → `{ type, frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() }`, `createGain` → `{ gain: { value: 0, setValueAtTime: vi.fn() }, connect: vi.fn() }`, `destination`, `currentTime: 0`, `resume`, `close`):
    - `playSiren(2500)` створює один осцилятор `sawtooth`, частота ходить між 600 і 1200 (`linearRampToValueAtTime` викликано з обома значеннями, остання мить ≤ 2,5 с), `start` і `stop(2.5)`;
    - функція зупинки викликає `stop` і `close`;
    - без `AudioContext` (і `webkitAudioContext`) — не кидає й повертає функцію;
    - `AudioContext`, що кидає в конструкторі, — не кидає.
  - `AwayAlarm.test.tsx` (мок `../siren`: `playSiren: vi.fn(() => stop)`; `vi.useFakeTimers()`):
    - `away = { play: 3, ms: 4200, count: 1, out: false, penalty: false }` → `getByRole('alert')` з «🚨 Ти виходив із гри під час запитання!», без «0 балів»; `playSiren` викликано один раз з `AWAY_MS.alarm`;
    - з `penalty: true` → ще «0 балів за це запитання»;
    - через 2500 мс шару немає; дотик раніше — шару немає й `stop` викликано;
    - **раз на вихід:** другий рендер з тим самим `away` (новий монтаж, як після оновлення сторінки) — шару немає, `playSiren` не викликано; `count: 2` — шар знову;
    - `out: true`, `ms: 1500`, `away: null`, прихована сторінка → нічого;
    - `alarmKey` — чисті випадки вище;
    - `AwayNote`: `ms: 8400` → «Ти виходив із гри на 8 с — це видно всім»; `penalty` → «За це запитання буде 0 балів»; `ms: 1500` → нічого;
    - **reduced motion:** у `styles.css` анімація `away-pulse` стоїть лише під `prefers-reduced-motion: no-preference` (перевірити читанням файлу через `?raw`, як інші тести стилів, якщо такі є; інакше — пункт ручної перевірки рецензента).
  - `PlayerScreen.test.tsx`: зріз з `away` → шар `role="alert"` і рядок `.away-note`; у командній фікстурі (`team-test-view.ts`) з `away: null` — нічого.
  - `storage.test.ts`: `saveAlarmSeen` / `loadAlarmSeen`; `localStorage`, що кидає, → `null` без помилки.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/siren.test.ts apps/web/src/live/AwayAlarm.test.tsx apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/storage.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): the phone that left the game turns red with a synthesised siren the moment it comes back — «🚨 Ти виходив із гри під час запитання!» and «0 балів за це запитання» with the penalty, an alert role, no pulse with reduced motion, closed by a tap or after 2.5 s, once per leave even after a reload — and keeps «Ти виходив із гри на 8 с — це видно всім» under the question

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 10. Веб, пульт і сцена: позначки, аркуш скасування, розбивка

**Files:**
- Create: `apps/web/src/away-text.ts`, `apps/web/src/away-text.test.ts`
- Modify: `apps/web/src/screens/LiveAnswers.tsx`, `HostScreen.tsx`, `StageScreen.tsx`, `apps/web/src/undo-panel.ts`, `i18n.ts`, `styles.css`
- Test: `away-text.test.ts`, `LiveAnswers.test.tsx`, `HostScreen.test.tsx`, `StageScreen.test.tsx`, `undo-panel.test.ts`

**Interfaces:**
- `away-text.ts`:
  ```ts
  /** «🙈 відволікався 12 с (2 рази)», «🙈 зараз поза грою», «🙈 зараз поза грою · 12 с (2 рази)»; withName — «🙈 Оля: відволікався 4 с (1 раз)». */
  export function awayMarkText(mark: AwayMark, withName: boolean): string;
  /** Рядок сцени: «🙈 Оля, Петро»; порожньо — ''. */
  export function stageAwayText(names: string[]): string;
  ```
  `рази` — через `countText` (`awayTimes`: «1 раз», «2 рази», «5 разів»).
- `i18n.ts`:
  ```ts
  awayMark: '🙈 відволікався {seconds} с ({times})',
  awayMarkNamed: '🙈 {name}: відволікався {seconds} с ({times})',
  awayOut: '🙈 зараз поза грою',
  awayOutNamed: '🙈 {name}: зараз поза грою',
  awayOutMore: '🙈 зараз поза грою · {seconds} с ({times})',
  awayStage: '🙈 {names}',
  undoAwayRow: '{name} {points} (вихід із гри)',
  scoreSource_away: 'Вихід із гри',
  ```
  і форми `awayTimes` за зразком наявних лічильників (`undoPlayers`).
- `LiveAnswers.tsx`, `Row`: після `live-time` — `row.away.map((mark) => <span key={mark.personId} className="meta live-away">{awayMarkText(mark, view.teams !== null)}</span>)`.
- `HostScreen.tsx`, рядок `view.responses`: так само `span.meta.response-away` після `clue`.
- `StageScreen.tsx`, `header.bar` запитання: після лічильника — `{view.away.length > 0 && <span className="away-line">{stageAwayText(view.away)}</span>}`. Шапка не переноситься (CSS: `white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width`).
- `undo-panel.ts`, `undoRowText`: `if (row.kind === 'away') return t('undoAwayRow', vars);`.

- [ ] **Step 1: Write the failing tests**
  - `away-text.test.ts`: `{ ms: 12_400, count: 2, out: false }` → «🙈 відволікався 12 с (2 рази)»; `out: true, ms: 0` → «🙈 зараз поза грою»; `out: true, ms: 4000, count: 1` → «🙈 зараз поза грою · 4 с (1 раз)»; з іменем → «🙈 Оля: відволікався 4 с (1 раз)»; `stageAwayText(['Оля', 'Петро'])` → «🙈 Оля, Петро».
  - `LiveAnswers.test.tsx`: рядок з `away` → текст «🙈 відволікався 4 с (1 раз)»; командний рядок — з іменем людини.
  - `HostScreen.test.tsx`: на `reveal` у таблиці відповідей Олі — «🙈 відволікався 4 с (1 раз)».
  - `StageScreen.test.tsx`: зріз `question` з `away: ['Оля']` → `.away-line` «🙈 Оля»; без секунд (`queryByText(/\d+ с/)` у `.away-line` — немає); `away: []` — рядка немає.
  - `undo-panel.test.ts`: `undoRowText({ kind: 'away', nickname: 'Оля', points: -200, … })` → «Оля −200 (вихід із гри)».
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/away-text.test.ts apps/web/src/screens/LiveAnswers.test.tsx apps/web/src/screens/HostScreen.test.tsx apps/web/src/screens/StageScreen.test.tsx apps/web/src/undo-panel.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): the host sees «🙈 відволікався 12 с (2 рази)» or «🙈 зараз поза грою» in live answers and the answer table (with the person's name in a team row), the 1280 × 720 stage shows «🙈 Оля, Петро» in the question header with no seconds, the undo sheet lists «Оля −200 (вихід із гри)» and the breakdown says «Вихід із гри»

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 11. Веб: редактор, довідка, історія й «Твоя гра»

**Files:**
- Modify: `apps/web/src/editor/QuizEditor.tsx`, `help/settings.ts`, `pages/GameHistory.tsx`, `facts-text.ts`, `i18n.ts`, `styles.css`
- Test: `editor/QuizEditor.test.tsx`, `help/host-help.test.ts`, `pages/GameHistory.test.tsx`, `facts-text.test.ts`

**Interfaces:**
- `QuizEditor.tsx`: у `details` загальних налаштувань після «Пояснення для новачків» — прапорець, як `setNewcomers`:
  ```tsx
  const setAwayPenalty = (on: boolean) => {
    const { awayPenalty: _off, ...rest } = settings;
    update({ ...quiz, settings: on ? { ...rest, awayPenalty: true } : rest });
  };
  ```
  Розмітка — `div.with-help` з `label.field.field-check` «Штраф за вихід із гри» і `HelpButton id="setting.away"`, під ним `p.meta` «Хто виходить із гри під час запитання від 3 с, отримує за нього 0. Позначку «відволікався» видно завжди.».
- `i18n.ts`: `awayPenaltyLabel`, `awayPenaltyHint`, `historyAway: '🙈 {seconds} с'`, `gameCardAway: '🙈 Відволікався: на {count}'` з формами «1 запитанні / 2 запитаннях / 5 запитаннях» (`countText`), командна форма «🙈 Команда відволікалася: …» за прапорцем `team`, як у `gameCardLines`.
- `help/settings.ts`: `SETTING_HELP_KEYS` — `'away'` одразу після `'undo'`; запис:
  ```ts
  away: {
    title: 'Відволікався й штраф за вихід',
    what: 'Телефон помічає, що гравець пішов із гри під час відкритого запитання: інша вкладка чи програма, заблокований екран, дзвінок.',
    how: [
      `Рахується від старту запитання (після заставки) до своєї відповіді або закриття. Час рахує сервер, пауза його зупиняє. Від ${s(AWAY_MS.mark)} сумарно біля імені з'являється 🙈: на пульті — «відволікався 12 с (2 рази)», на сцені — лише значок з ім'ям, без секунд.`,
      'Телефон того, хто виходив, на поверненні на мить червоніє й звучить сирена: «Ти виходив із гри під час запитання!». Іншим телефонам нічого не показується.',
      'Розрив зв’язку не рахується: мережа губиться й без гугла. Якщо телефон сховали й зв’язок упав, рахується лише час, коли телефон справді був прихований.',
      `Штраф за вихід (прапорець у налаштуваннях вікторини): від ${s(AWAY_MS.penalty)} сумарно — 0 балів за запитання. Діє в класиці, на полі, у бліці й фіналі; у «Ва-банк», «Вибуванні», «Мільйонері», опитуванні й хмарі — лише позначка.`,
      'У командній грі позначка й тривога — біля людини, а штраф отримує команда, якщо від 3 с виходив будь-хто з неї.',
    ],
    points: [
      'Знімаються лише зароблені бали: мінус за помилку вихід не скасовує.',
      'Штраф — окремий рядок «вихід із гри» в аркуші «↶ Бали»: скасуйте його одним дотиком, якщо гравцеві просто подзвонили. У грі без ведучого штраф знімає лише апеляція.',
    ],
    tip: [
      'Чесні межі: другий пристрій, ноутбук поруч чи підказку сусіда не видно. На деяких телефонах шторка сповіщень дає вихід. Старий браузер нічого не надсилає.',
    ],
  },
  ```
  Рядок у `setting.undo` (`how` чи `points`): «Штраф за вихід із гри теж скасовується — рядок «(вихід із гри)».». Рядок у `setting.autopilot`: «Штраф за вихід діє й без ведучого; зняти його може лише апеляція.».
- `GameHistory.tsx`: біля відповіді з `awayMs !== null` — `span.meta.history-away` «🙈 4 с»; так само в записах фіналу.
- `facts-text.ts`, `gameCardLines`: рядок `gameCardAway`, лише коли `card.away > 0`.

- [ ] **Step 1: Write the failing tests**
  - `QuizEditor.test.tsx` (`describe('QuizEditor: away penalty (12e)')`, за зразком «explanations for newcomers»): типово вимкнено й `'awayPenalty' in saved.settings === false`; увімкнення зберігає `awayPenalty: true`; збережена вікторина відкривається з прапорцем.
  - `host-help.test.ts`: `setting.away` заповнено; стоїть одразу після `setting.undo`; `autopilot` — останній; текст містить «2 с», «3 с», «лише значок», «Розрив зв’язку не рахується», «другий пристрій».
  - `GameHistory.test.tsx`: відповідь з `awayMs: 4200` → «🙈 4 с»; `null` — нічого.
  - `facts-text.test.ts`: `gameCardLines({ …, away: 2 }, false)` містить «🙈 Відволікався: на 2 запитаннях»; `away: 0` — рядка немає; `team: true` — командна форма.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/editor/QuizEditor.test.tsx apps/web/src/help/host-help.test.ts apps/web/src/pages/GameHistory.test.tsx apps/web/src/facts-text.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Приклади довідки — без тем росії й СРСР.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): the editor switch «Штраф за вихід із гри» with a note, the host help entry on the marker, the phone alarm, disconnects, the penalty, teams and the honest limits, 🙈 beside history answers with an away and «🙈 Відволікався: на 2 запитаннях» in the own game card

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 12. Наскрізний сценарій 12e з кадрами

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Помічники беруться як є: `open`, `register`, `join`, `click`, `afterSplash`, `shot`, `snapshot`, `socketFrames`, `stateViews`, `pickOption`, `expectNoSideScroll`, `expectStageInView`, `HEADER_ONE_LINE`, `POLL`, `exact`, `NL`, `sleep`, `problems`, `classicRound`, `makeRoundsQuiz`, `DEFAULT_RULES`, `undoRows`.
- Новий помічник поруч зі сценарієм:
  ```ts
  /** Сторінка ховається чи повертається (12e): visibilityState і hidden підмінено, подія visibilitychange — як у справжнього телефона. */
  async function setHidden(page: Page, hidden: boolean): Promise<void> {
    await page.evaluate((h) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  }
  ```
- Вміст — без тем росії й СРСР. Вікторина «Антигугл 12e», `settings: { leaderboard: 'each', awayPenalty: true }`, один класичний раунд «Розминка» (`speedBonus: false`, `shuffleOptions: false`, `rules: DEFAULT_RULES`):
  ```ts
  function awayQuestions12e() {
    const common = { imageUrl: null, video: null, timeLimit: 30 };
    const a1 = {
      ...common, id: 'a1', type: 'single' as const, text: 'Яка річка тече через Київ?', points: 200,
      options: [{ id: 'a1-a', text: 'Дніпро' }, { id: 'a1-b', text: 'Десна' }, { id: 'a1-c', text: 'Рось' }],
      correctId: 'a1-a',
    };
    const a2 = { ...common, id: 'a2', type: 'boolean' as const, text: 'Пінгвіни живуть в Антарктиді', points: 100, correct: true };
    return { a1, a2 };
  }
  ```
- Пульт — телефон 375 × 812 (`host12e`), сцена — 1280 × 720 (`stage12e`), телефони 375 × 812: Оля, Петро, Іра. `stageFrames`, `olyaFrames`, `petroFrames` — `socketFrames`.

- [ ] **Step 1: Add the scenario** у кінець файлу за зразком 12d:
  ```ts
  it('part 12e: anti-googling — a phone hidden for 4 s during a question gives «🙈 відволікався 4 с (1 раз)» on the 375 host and only «🙈 Оля» on the 1280 × 720 stage, the phone turns red with «🚨 Ти виходив із гри під час запитання!» and «0 балів за це запитання» once per leave even after a reload, the penalty zeroes the right answer when the reveal ends, the host undoes «Оля −200 (вихід із гри)» and the points come back, the editor shows the switch, the history shows 🙈, and no seconds reach the stage or other phones', async () => {
    try {
      await away12e();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Підготовка `away12e()`:**
  1. `host = open('host12e', 375, 812)`, `register(host, 'host', 'Ліна Ведуча', 'host12e@example.com')`.
  2. Вікторина вище → `POST /api/quizzes`.
  3. **Редактор:** «/quizzes» → вікторина «Антигугл 12e» → «Редагувати». Прапорець «Штраф за вихід із гри» позначено (`getByLabel(…).isChecked()`). `expectNoSideScroll(host, 'p12e-editor')`, кадр `p12e-editor`. Назад до «/quizzes».
  4. «Грати» → `code`, `stageUrl`; `stage = open('stage12e', 1280, 720)`; телефони `olya`, `petro`, `ira` з `join`.
  5. «Почати гру» → `afterSplash(...all)` → «Почати раунд» → `afterSplash(...all)`.

  **Кроки:**
  1. **a1 — вихід Олі на 4 с.** `stage.getByText('Яка річка тече через Київ?', exact).waitFor()`. Петро — «Десна», Іра — «Дніпро».
     - `setHidden(olya, true)`. Пульт: рядок Олі в «Відповідях наживо» → `host.locator('.live-row', { hasText: 'Оля' }).locator('.live-away')` = «🙈 зараз поза грою» (`expect.poll`). Кадр `p12e-host-out`.
     - `await sleep(4000)`; `setHidden(olya, false)`.
  2. **Тривога.** `olya.getByRole('alert')` видно, містить «🚨 Ти виходив із гри під час запитання!» і «0 балів за це запитання».
     - `expectNoSideScroll(olya, 'p12e-phone-alarm')`; кадр `p12e-phone-alarm` (375 × 812, шар на весь екран: `boundingBox` шару = 375 × 812).
     - Петро й Іра — `getByRole('alert')` немає (`count() === 0`).
     - Через 3 с шару в Олі немає. `.away-note` — «Ти виходив із гри на 4 с — це видно всім» (регулярний вираз `/на [45] с/`: між подіями й сервером є затримка) і «За це запитання буде 0 балів».
  3. **Позначки.**
     - Пульт: `.live-away` Олі — `/^🙈 відволікався [45] с \(1 раз\)$/`. `HEADER_ONE_LINE` пульта. `expectNoSideScroll(host, 'p12e-host-mark')`; кадр `p12e-host-mark`.
     - Сцена: `.away-line` — «🙈 Оля» точно. `expectStageInView(stage, 'p12e-stage-mark')`; кадр `p12e-stage-mark`.
  4. **Оновлення не повторює тривогу.** `olya.reload()` → сторінка гравця знову з запитанням; `getByRole('alert')` немає протягом 2 с (`expect.poll` з `count() === 0`), `.away-note` є.
  5. **Відповідь і розкриття.** Оля — «Дніпро» → «Запитання закрите» → «Показати відповідь».
     - На розкритті: таблиця відповідей пульта має `.response-away` Олі; сцена — «🙈 Оля» в шапці.
     - Бали Олі ще 200: штраф — на виході з розкриття.
  6. **Штраф.** «Далі» → таблиця.
     - Рахунок Олі на пульті — 0, Іри — 200.
     - «↶ Бали» → аркуш: `undoRows(sheet)` → `['Оля +200', 'Іра +200', 'Оля −200 (вихід із гри)']` (у запитанні спершу відповіді в порядку гравців, потім коригування за `seq`, як у `rowsOf`; Петро з 0 балів рядка не має).
     - `expectNoSideScroll(host, 'p12e-host-sheet')`; кадр `p12e-host-sheet`.
  7. **Скасування.** У рядку «Оля −200 (вихід із гри)» — «Скасувати» → рядок `is-undone`.
     - Рахунок Олі — 200.
     - Сцена й телефони: сповіщення «Ведучий скасував бали: Оля +200 (запитання 1)».
     - Escape закриває аркуш.
  8. **a2 без виходу.** «Далі» → `afterSplash` → усі «Так» → розкриття: `.away-line` на сцені немає, `.live-away` / `.response-away` немає → «Далі» → `finished`.
  9. **Таємність.**
     - `stageFrames.join(NL)`: у кожному `stateViews`-зрізі сцени `away` — масив рядків (`every((v) => v.away.every((x) => typeof x === 'string'))`), немає `"ms":` у полі `away`;
     - `petroFrames`: у жодному зрізі Петра `away` не має `ms > 0` (свій — `null`), і в кадрах Петра немає рядка «Ти виходив»;
     - `olyaFrames`: у зрізах Олі `away.play === 0` на першому запитанні.
  10. **Історія.** `` host.goto(`${base}/history`) `` → гра «Антигугл 12e» → у відповідях першого запитання біля Олі — «🙈 4 с» або «🙈 5 с». `expectNoSideScroll(host, 'p12e-history')`; кадр `p12e-history`.
  11. `expect(problems).toEqual([])`.
- [ ] **Step 2: Run** на передньому плані (не у фоні): `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 12e"` → PASS. Переглянути кадри `p12e-*`:
  - телефон 375, тривога: червоний шар на весь екран, текст читається, нічого не обрізано;
  - сцена 1280 × 720: «🙈 Оля» у шапці в один рядок, запитання не зсунуте;
  - пульт 375: «🙈 відволікався 4 с (1 раз)» у рядку не налазить на час і вердикт, шапка в один рядок;
  - аркуш: рядок «(вихід із гри)» під запитанням;
  - редактор і історія 375 — без горизонтальної прокрутки.
- [ ] **Step 3: Повний прогін — один раз, на передньому плані** (не у фоні): `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts` → усі сценарії PASS. Особливо:
  - 12a (аркуш скасування з новим джерелом);
  - 12d (нагороди й «Твоя гра»);
  - 11g / 11h (автопілот);
  - 9b-перезапуски (`restart`).

  Жоден наявний сценарій не має показати «🙈» чи шар тривоги. Якщо PGlite чи браузер падають від нестачі пам'яті, прогнати групами за `-t` (теж на передньому плані) і назвати це в звіті.
- [ ] **Step 4: Commit**
  ```bash
  git add apps/server/e2e
  git commit -m "test: part 12e end-to-end — a phone hidden for 4 s shows «🙈 зараз поза грою» then «🙈 відволікався 4 с (1 раз)» on the 375 host and only «🙈 Оля» on the 1280 × 720 stage, turns red with the siren alert and «0 балів за це запитання» once per leave even after a reload, the penalty zeroes the right answer after the reveal, the host undoes «Оля −200 (вихід із гри)», the editor switch and the history 🙈 are there, and no away seconds reach the stage or other phones

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```
