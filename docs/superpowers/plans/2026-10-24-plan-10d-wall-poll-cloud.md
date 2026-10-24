# План 10d: стіна зв'язків, опитування й «хмара слів» (без балів)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 10d специфікації (розділ 8) і спільні правила розділу 14a, що її стосуються.
- **Стіна зв'язків (`wall`)** — новий тип запитання. Ведучий задає 4 групи по 4 плитки (4×4) або 3 групи по 3 (3×3); у кожної групи є назва зв'язку. Гравець бачить перемішані плитки, вибирає 4 (або 3) і надсилає. Правильна група закріплюється й фарбується. Неправильна — помилка. Після ліміту помилок (1–5, типово 3) стіна для гравця замикається. Кожна знайдена група приносить `ціна / кількість груп`. Коли лишилася одна група, вона складається сама й балів не дає. На розкритті сцена показує групи з назвами і скільки груп знайшов кожен. Тип дозволений у класиці й на звичайній клітинці поля з телефона.
- **Опитування (`poll`)** — варіанти без правильного; сцена після закриття показує стовпчики з відсотками.
- **«Хмара слів» (`wordcloud`)** — кожен гравець пише до 3 коротких слів. Сцена показує хмару: що частіше слово, то воно більше. Однакові слова зводяться разом без урахування регістру й зайвих пробілів. Ведучий одним дотиком ховає непристойне слово з хмари.
- **Опитування й хмара без балів:** не впливають на таблицю, серії, точність, «відповів на N запитань» і досягнення. Дозволені лише в класиці.
- **Що вважається правильним (14a):** стіна — «кількість знайденого»: правильна відповідь та, що дала щонайменше половину ціни (`proximityPartial`). Опитування й хмара не бувають ні правильними, ні неправильними.
- **Анти-ціль «відповідь раніше розкриття»:** групи стіни (назви, склад, id плиток) ніколи не потрапляють на телефон чи сцену до розкриття. Телефон дізнається, що група правильна, лише після надсилання (перевіряє сервер).
- **Дані для 10e:** відповіді «хмари» лежать у стані гри й історії у формі, з якої «100 до 1» збудує дошку (`cloudTally`).
- **Довідка ведучого:** записи `question.wall`, `question.poll`, `question.wordcloud` (typecheck вимагає) і оновлені записи бафів, дебафів, клітинок, раундів, налаштувань.
- **Демо:** у демо `demo` — стіна 4×4 у класиці, стіна 3×3 на клітинці поля з телефона, опитування й хмара в розминці.

**Архітектура:**
- **Shared (`packages/shared/src/quiz.ts`, `answer.ts`, `views.ts`, `events.ts`, `game.ts`).**
  - `questionSchema` + гілки:
    - `wall`: `groups: { id, name, tiles: { id, text }[] }[]` і `mistakes`;
    - `poll`: `options` (як у `single`, без правильного);
    - `wordcloud`: `words` (1…3).
  - `QUESTION_TYPES` + `'wall'`, `'poll'`, `'wordcloud'`. До `SIMPLE_TYPES` і `REVEAL_TYPES` нові типи не входять.
  - Нові константи й функції:
    - `UNSCORED_TYPES`, `isUnscored`;
    - `WALL_SIZES`, `wallScored`, `wallShare`;
    - `cloudKey`, `cloudWords`;
    - `proximityPartial` + `'wall'`;
    - ліміти `LIMITS.wallTile` … `LIMITS.cloudShown`.
  - `answerSchema` + `{ type: 'poll', optionId }` і `{ type: 'wordcloud', words }`. Підсумок стіни `WallAnswer` складає рушій, як `SortAnswer`.
  - Коди схеми: `wall_shape`, `wall_duplicate_tiles`, `wall_video`, `vote_points`; коди вікторини: `wall_place`, `vote_place`.
  - `ErrorCode` + `'wall_pick'`, `'wall_repeat'`; `BuffBlock` + `'off_wall'`, `'off_vote'`.
  - Події: `player:wall` (позиції плиток) і `host:cloud-hide`.
  - Зрізи:
    - `PublicQuestion` + `wall: PublicWall | null` (тексти плиток у порядку показу, без груп) і `cloud: { words: number } | null`;
    - `PlayerView.me.wall`;
    - `wall: WallInfo | null` у зрізах;
    - `StageView.cloud`, `HostView.cloud`;
    - `RevealStats` рахує й опитування.
- **Рушій (`packages/engine`).**
  - Новий `wall.ts` за зразком `sort.ts`: поступ гравця в `Play.wall`, хід `guessWall`, автоскладання останньої групи, замикання після ліміту помилок, записи при завершенні й `scoreWall` на закритті, поле — лише той, хто вибрав, і `revealNow` після завершення.
  - `present()` для стіни перемішує плитки завжди й однаково для всіх. Жоден ряд показу не збігається з групою.
  - Новий `votes.ts`:
    - голос — `AnswerRecord` з нулями (`submitVote`);
    - `cloudTally` / `cloudVoters` — форма для 10e;
    - `hideCloudWord` (`Play.cloudHidden`).
  - `game.ts`:
    - `submitAnswer` віддає опитування й хмару в `submitVote`;
    - `streakCounts` і `withTotals` пропускають запитання без балів (серія, бонус серії, сумарний час);
    - `override` відмовляє для `wall`, `poll`, `wordcloud`;
    - `lockNow` викликає `scoreWall`.
  - `buffs.ts`: `placeBlock` → `off_wall` / `off_vote`.
  - `debuffs.ts`: `fireDebuffs` не запускає дебафи на запитанні без балів (вони чекають наступного).
  - `restore.ts`: **`GAME_STATE_VERSION` 3 → 4** (`Play.wall`, `Play.cloudHidden`, новий тип `WallProgress`), `READABLE_STATE_VERSIONS = [2, 3, 4]`.
  - `views.ts`:
    - `PublicWall` — позиції замість id, без груп;
    - `PlayerWall` — лише власні знайдені групи;
    - `WallInfo` — пульт з етапу `question`, сцена на розкритті, на полі всі бачать стіну того, хто вибрав;
    - хмара: сцена лише на `reveal` і без схованих, пульт з етапу `question` із позначкою «сховано» й авторами;
    - лічильники опитування.
- **Сервер.**
  - Сокети `player:wall` → `manager.wall` → `guessWall` і `host:cloud-hide` → `hideCloudWord`.
  - `recorder.ts`: рядки голосів пишуться з `attempt = VOTE_ATTEMPT (−3)`.
  - `history.ts`:
    - `playerGames` не рахує рядків голосів у `answered` і `marks`;
    - `questionsPlayed` гравця — без запитань без балів (за знімком і журналом);
    - `gameTables` відкидає рядки голосів.
  - Досягнення від цього не змінюються.
  - Демо `demo` отримує стіни, опитування й хмару.
- **Веб.**
  - Спільне: `WallGrid` (сітка плиток, знайдені групи кольорами), `WallReveal` (групи з назвами), `WallTable` (хто скільки знайшов), `PollBars`, `WordCloud`.
  - Телефон:
    - `WallInput` — вибір плиток, «Перевірити», помилки кружечками, трусіння неправильного вибору, «Стіну замкнено» / «Стіну складено»;
    - опитування — кнопки варіантів;
    - `CloudInput` — до N полів;
    - екран після голосу без «правильно / неправильно» й без балів.
  - Сцена:
    - плитки без кольорів під час запитання, на розкритті групи з назвами й таблиця;
    - опитування — варіанти, на розкритті стовпчики з відсотками;
    - хмара — запрошення, на розкритті хмара без схованих слів.
  - Пульт:
    - живі рядки стіни й правильні групи;
    - живі стовпчики опитування;
    - хмара зі словами-кнопками «Сховати» / «Повернути»;
    - без кнопок оцінки на цих типах, кнопка «Показати результати».
  - Редактор:
    - `WallEditor` (4×4 / 3×3, назви груп, плитки, ліміт помилок);
    - тіла опитування й хмари без поля балів;
    - обмеження клітинок поля, перевірки чернетки, відновлення чернетки.
  - Історія: стіна («2 з 4 груп, 1 помилка», групи), стовпчики опитування й слова хмари з відповідей.
  - Довідка: три нові записи й оновлення пов'язаних.

**Технології:** TypeScript, zod 4, vitest, Drizzle ORM (PGlite у тестах), Fastify + Socket.IO, React 19 + Vite, Testing Library (jsdom), Playwright. Нових залежностей немає.

**Специфікація:** `docs/superpowers/specs/2026-10-24-new-formats-design.md`:
- розділ 8 (частина 10d);
- розділ 9 (10e бере дошку з «хмари» — форма даних тут);
- розділ 14a: «що вважається правильною відповіддю» (стіна названа прямо), «правила раунду для нових типів», «деплой»;
- розділ 14, пункт 5: «хмара слів» у командному режимі — кожен гравець окремо (10j; тут нічого не робимо, але форма `cloudTally` рахує гравців, не команди);
- розділ 2: анти-цілі «правильна відповідь раніше розкриття» (групи стіни названо прямо), «старі вікторини змінюють бали», «живі ігри обриваються деплоєм»;
- розділ 3: нове поле має типове значення; телефон — один палець, вузький екран;
- розділ 5, пункт 5: кожен тип має запис у довідці;
- розділ 16: кількість плиток і довжина слів — тут.

Зразки (найближчі прецеденти — 10c, `docs/superpowers/plans/2026-10-24-plan-10c-clues-pin.md`, 10b і злитий код):
- `packages/engine/src/sort.ts` — **головний зразок стіни**: поступ гравця в `Play`, хід із перевіркою, запис при завершенні, `scoreSort` у `lockNow`, `sortsHere` (поле — лише той, хто вибрав), `revealNow` на полі, `shiftSortLocks`. А також `game.sort.test.ts`, `views.sort.test.ts`, `SortView.tsx`, сценарій e2e `sortGame`.
- `packages/shared/src/quiz.ts`:
  - гілки `single`, `sort`, `clues`, `pin`;
  - `proximityPartial`, `questionPrice`;
  - коди `sort_cell`, `clues_place`, `pin_place`, `spare_type`.
- `packages/shared/src/answer.ts` (`SortAnswer`), `views.ts` (`SortInfo`, `PlayerSort`, `RevealStats`), `events.ts` (`sortSchema`, `player:sort`, `host:clue`), `game.ts` (`BuffBlock`, `ErrorCode`).
- `packages/engine/src/check.ts` (`verdictOf`, `gradeOf`, `PROXIMITY_CORRECT_SHARE`), `game.ts`:
  - `present`, `openQuestion`, `submitAnswer`, `override`;
  - `streakCounts`, `withTotals`, `lockNow`, `autoLock`, `removePlayer`.
- `packages/engine/src/buffs.ts` (`placeBlock`, `off_sort`), `debuffs.ts` (`fireDebuffs`), `board-turns.ts` (`boardPoints`), `score.ts` (`answerPoints`), `views.ts` (`publicQuestion`, `sortInfo`, `playerSort`, `revealStats`, `answeredCount`, `stageView`, `hostView`), `restore.ts`, `restore.test.ts` (`STATE_SHAPE`, `KEYS`, `representative`).
- `apps/server/src/rooms/manager.ts` (`sort()`, `HostAction`), `socket.ts` (`player:sort`, `SIMPLE_HOST_ACTIONS`), `recorder.ts` (`answerRows`, `PENALTY_ATTEMPT`), `history.ts` (`playerGames`, `gameTables`, `playedQuestions`, `snapshotOf`), `achievements.ts` (`answersOf`, `bestStreak`, `isPerfect`), `db/schema.ts` (`PENALTY_ATTEMPT`, `ADJUSTMENT_ATTEMPT`).
- Тести сервера: `history.test.ts` (`history: clues and pin (10c)`), `profiles.test.ts`, `achievements.test.ts`, `recorder.test.ts`, `socket.test.ts`, `manager.test.ts`.
- `apps/server/scripts/demo-quiz.ts` (`sort`, `cell`, `opts`), `demo-quiz.test.ts`.
- `apps/web/src/screens/`:
  - `AnswerInput.tsx`, `PlayerScreen.tsx`, `StageScreen.tsx` (`stats` і `.count` біля варіантів), `HostScreen.tsx` (кнопки оцінки, `act('host:override')`), `SortView.tsx`, `ChoiceFace.tsx`, `Debuffs.tsx` (обертання категорій сортування).
- `apps/web/src/editor/`:
  - `QuestionEditor.tsx` (`Rows`, `SortBody`, тіла `single`), `BoardEditor.tsx` (`sortCellNote`), `QuizEditor.tsx`;
  - `draft.ts` (`questionTypesFor`, `build`, `changeType`, `problemKey`, `problemsOf`, `cleanQuestion`), `draft-storage.ts` (`revive`, `numberOr`).
- `apps/web/src/help/{questions,powers,cells,rounds,settings}.ts`, `host-help.test.ts`.
- `apps/web/src/format.ts` (`correctText`, `answerText`), `guide-text.ts` (`TYPE_ICONS`), `i18n.ts` (`type_*`, `typeShort_*`, `typeHow_*`, `buffWhy_off_sort`), `pages/GameHistory.tsx`.
- `apps/server/e2e/full-game.e2e.ts`: `open`, `register`, `join`, `shot`, `afterSplash`, `expectNoSideScroll`, `snapshot`, `problems`, `socketFrames`, `scoreOf`, `toNextQuestion`, сценарії `sortGame` і 10c `cluesPinGame` — структура.

**Рішення плану там, де специфікація мовчить (і рішення координатора):**

*Стіна зв'язків*
- **Дані.** `{ type: 'wall', groups: WallGroup[], mistakes: number }`, де `WallGroup = { id, name, tiles: { id, text }[] }`:
  - `groups.length` ∈ `WALL_SIZES` = `[3, 4]`. Кожна група має рівно стільки плиток, скільки груп (код `wall_shape`): 4×4 або 3×3;
  - `name` — 1…`LIMITS.wallGroupName` (40) символів; `text` плитки — 1…`LIMITS.wallTile` (20) символів (чотири плитки в ряд на телефоні 375 px);
  - тексти плиток різні без урахування регістру й пробілів (`wall_duplicate_tiles`, як `sort_duplicate_words`); id груп і плиток різні (`duplicate_ids`);
  - `mistakes` — ціле `LIMITS.minWallMistakes` (1)…`LIMITS.maxWallMistakes` (5), типово `LIMITS.defaultWallMistakes` (3);
  - `wall_video`: відео не можна (потрібен таймер). Аудіо й звичайна картинка — можна. Проявлення — ні (`reveal_type`).
  - Редактор ставить для нової стіни час `LIMITS.defaultWallTime` (90 с) і ціну 1000.
- **Порядок плиток.** Спільний для всіх гравців: `present()` перемішує id усіх плиток. Жоден ряд показу (позиції `k·n … k·n + n − 1`) не має збігатися з групою. Якщо після 20 спроб `shuffle` такий ряд лишається, береться «по одній з кожної групи» (`g0t0, g1t0, …, g0t1, …`). Тоді кожен ряд містить по плитці з усіх груп. Порядок лежить у наявному `state.presented`, нового стану не треба.
  - *Рішення:* спільне перемішування замість особистого: це прецедент сортування, сцена показує ту саму стіну, що й телефони, а відновлення після перезапуску вже працює.
- **Позиції замість id.** Телефон отримує лише тексти плиток у порядку показу й надсилає **номери позицій** (0…n² − 1). Сервер переводить позиції в id через `state.presented`. Так id плиток (автор може назвати їх як завгодно, наприклад `river-1`) ніколи не виходять за сервер.
- **Хід** (`guessWall(state, playerId, positions, now)`):
  - вибрано рівно `n` різних позицій серед ще не знайдених плиток (інакше `wall_pick`);
  - вибір збігається з групою → група додається в `found`. Якщо знайдено `n − 1` груп, остання додається сама (`found.length === n`) і гравець закінчив;
  - не збігається → `mistakes + 1`. Ключ вибору (відсортовані id через кому) йде в `tried`. Якщо цей самий неправильний вибір уже був у `tried` → `wall_repeat`, помилка не рахується. Коли `mistakes === question.mistakes`, стіна замикається й гравець закінчив;
  - закінчив → `AnswerRecord` одразу (як останнє слово сортування), далі `autoLock` у класиці або `revealNow` на полі;
  - помилки: `wrong_phase`, `paused`, `not_started`, `not_found`, `type_mismatch` (поточне — не стіна), `not_your_turn` (на полі не той, хто вибрав), `already_answered` (є запис: закінчив або замкнено), `time_over`, `wall_pick`, `wall_repeat`.
- **Бали.**
  - `wallScored(found, n) = min(found, n − 1)` — остання група балів не дає;
  - частка `wallShare = scored / n`;
  - класика: `answerPoints({ points, accuracy: share, speed: 1, multiplier: rules.multiplier, penalty: rules.penalty })`;
  - поле: `boardPoints(round, board, share)` (ціна клітинки × позначка × множник раунду, штраф раунду).
  - Приклади для 4×4 і ціни 1000:
    - 1 група — 250;
    - 2 групи — 500;
    - уся стіна (3 + автоматична) — 750.
  - Приклади для 3×3 і ціни 900: 1 група — 300; уся стіна — 600.
  - *Рішення:* спадання вже вбудоване, тому бонусу за швидкість немає, як у сортуванні й ланцюжку. Правило «частково» нічого не міняє.
- **Правильність (14a, рішення координатора).**
  - `proximityPartial` + `'wall'`; спільна функція `shareVerdict(share)` у `check.ts`: `accepted = share ≥ 0,5 − ε`; `grade` — `'correct'` / `'partial'` (частка > 0) / `'wrong'`.
  - Для 4×4 «правильно» — від 2 груп. Для 3×3 — лише вся стіна (1 група = 33 %).
- **Штраф «мінус» (14a).** Лише гравцеві, який зробив хоч одну спробу й отримав 0 балів. Він отримує мінус ціну × множник (так само рахує `answerPoints` з `accuracy 0`).
  - Хто стіни не торкався, запису не має (у класиці це 0 балів без мінуса).
  - На полі той, хто вибрав, отримує запис завжди, як у сортуванні. Не торкався — 0 без мінуса.
- **Закриття.** `scoreWall` у `lockNow` (поруч зі `scoreSort`) пише записи всім, хто торкався й не закінчив: `answer.timeMs = null`, `record.timeMs = limitMs`. Автозакриття класики — наявне «усі підключені мають запис».
- **Де діє.** Класика; поле — лише звичайна клітинка з телефона (код `wall_place`, як `pin_place`). Не діє в бліці, на бліц- та усній клітинці, у фіналі, у дуелях і в запасних (`spare_type`).
- **Ручна оцінка.** `override` для стіни відмовляє (`wrong_phase`, як для сортування й ланцюжка). Пульт кнопок оцінки не показує.
- **Бафи (рішення координатора «fit/unfit»).** Жоден баф на стіні не діє: `placeBlock` → `'off_wall'`, як `off_sort`. Причина та сама, що в сортуванні: багатокрокова відповідь, бали рахуються окремо. Ряд бафів показує «На стіні бафів немає».
- **Дебафи** діють, як на сортуванні. `Debuffs.tsx` не переставляє плиток: позиції мають лишатися справжніми. Решта ефектів накладається на весь екран.
- **Що видно.**
  - Телефон гравця: плитки, власні знайдені групи (позиції) кольорами, помилки, «замкнено». Назв груп до розкриття немає навіть для знайдених.
  - Сцена в класиці під час запитання: сітка плиток без кольорів і «Закінчили стіну: N з M». На розкритті — групи з назвами й таблиця `WallTable`: нікнейм, груп, помилок, бали.
  - Пульт бачить живі рядки й правильні групи (з `view.correct`) з етапу `question`.
  - На полі сцена, пульт і глядачі бачать стіну того, хто вибрав, з його знайденими групами (`WallInfo.rows[0].tiles`): глядачі тут не відповідають.

*Опитування й хмара*
- **Дані.**
  - `{ type: 'poll', options }` — ті самі `options`, що в `single` (`LIMITS.minOptions`…`maxOptions`, текст і/або картинка), без правильного;
  - `{ type: 'wordcloud', words }` — `words` ціле 1…`LIMITS.maxCloudWords` (3), типово 3;
  - для обох `points === 0` (код `vote_points`). Редактор ховає поле ціни й ставить 0. `questionPrice` повертає 0;
  - відео, аудіо й картинка можна (з відео таймера немає — ведучий закриває сам). Проявлення — ні.
- **Відповіді.** `{ type: 'poll', optionId }`; `{ type: 'wordcloud', words: string[] }` — 1…3 слова, кожне після обрізання 1…`LIMITS.cloudWord` (24) символів.
  - Рушій чистить слова `cloudWords(words, question.words)`: обрізає, зводить пробіли, відкидає порожні й повтори з однаковим `cloudKey` і бере перші `question.words`.
  - Нічого не лишилося — `type_mismatch`.
- **Нормалізація слова** (`cloudKey`): `NFC`, обрізати, будь-які пробіли → один, апострофи `’ ʼ ‘ \`` → `'`, `toLocaleLowerCase('uk')`. «Київ», « КИЇВ » і «київ» — одне слово.
  - На сцені слово показується в найчастішому написанні серед гравців (після обрізання й зведення пробілів). За рівності — у написанні першого гравця за порядком гравців.
- **Голос — `AnswerRecord` з нулями:** `accepted: false`, `accuracy: 0`, `grade: 'wrong'`, `basePoints: 0`, `streakBonus: 0`, `points: 0`.
  - Так безкоштовно працюють `answeredCount`, автозакриття «усі відповіли», `me.answer`, список відповідей пульта, вилучення гравця й запис в історію.
  - Ніде в інтерфейсі цей `grade` не показується: екрани гілкуються за `isUnscored(question)`.
  - Голос один, як звичайна відповідь (`already_answered`).
- **Без балів і статистики (рішення координатора).**
  - `streakCounts`: запитання без балів пропускається для всіх (`continue`): серія не обривається й не росте.
  - `withTotals`: бонус серії не рахується. Сумарний час (рівний рахунок) запитання без балів не додає, інакше швидкий голос давав би перевагу.
  - Таблиця не змінюється: бали 0.
  - Історія: рядки голосів пишуться з `attempt = VOTE_ATTEMPT` (−3, поруч із `PENALTY_ATTEMPT` −1 і `ADJUSTMENT_ATTEMPT` −2).
    - `playerGames` не бере їх у `answered` і `marks`. Тож `bestStreak` і `isPerfect` їх не бачать: голос не обриває серії й не псує «бездоганної гри».
    - `questionsPlayed` гравця (знаменник точності й «правильних N з M» у «Моїх іграх») — без запитань без балів.
    - `gameTables` відкидає рядки голосів.
    - Деталі гри ведучого показують голоси й слова всіх (сторінка лише для ведучого).
  - Міграцій немає: `attempt` — звичайне ціле, нове значення −3.
- **Бафи.** Не діють: `placeBlock` → `'off_vote'` («Без балів — без бафів»).
- **Дебафи.** На запитанні без балів дебафи, що чекають, **не спрацьовують** і чекають наступного запитання з балами. Покупець не втрачає дебаф на опитуванні. `fireDebuffs` пропускає таке запитання.
- **Що видно.**
  - Опитування. Сцена під час запитання: варіанти, як в `single`, і «Проголосували N з M». На **розкритті** — стовпчики з відсотками й кількістю (`stats.counts`, відсоток від тих, хто проголосував).
  - Телефон: варіанти. Після голосу — «Голос прийнято», на розкритті — свій вибір і «Результати — на екрані».
  - Пульт бачить живі стовпчики з етапу `question` (рахує з `responses`).
  - Хмара. Сцена під час запитання: запрошення й «Написали N з M», на **розкритті** — хмара. Пульт бачить живу хмару з етапу `question`.
  - *Рішення:* сцена показує результати лише на розкритті: ведучий має час прибрати непристойне слово, доки хмари не видно, а натиснути «Показати результати» — звична дія.
  - Сховане слово ніколи не йде на сцену й телефони, навіть у даних. Ведучий може повернути слово (другий дотик) — на випадок промаху.
  - На сцені щонайбільше `LIMITS.cloudShown` (40) найчастіших слів. Розмір шрифту лінійно від 1 rem (1 голос) до 4,5 rem (найчастіше).
- **Де діють.** Лише класика (код `vote_place` для бліцу, поля, фіналу). Не в запасних (`spare_type`), не в дуелях.
- **Ручна оцінка.** `override` для обох типів відмовляє (`wrong_phase`).
- **Форма для 10e.**
  - Стан: голоси лежать у `Play.answers` (`answer.type === 'wordcloud'`), сховані ключі — у `Play.cloudHidden?: string[]`.
  - Чиста функція `cloudTally(play, players): CloudEntry[]`, де `CloudEntry = { key, text, count, playerIds, hidden }`:
    - `count` — скільки **гравців** назвали слово;
    - порядок — за `count` спаданням, далі за `text` (`localeCompare('uk')`).
  - `cloudVoters(play)` — скільки гравців написали хоч одне слово.
  - 10e збудує дошку з `cloudTally(state.plays.find((p) => p.question.id === cloudQuestionId), state.players)` без схованих слів, з популярністю `round(count / voters × 100)`.
  - Історія має ті самі слова в `payload` рядків `VOTE_ATTEMPT`, тож дошку можна відтворити й після гри.

*Формат стану й деплой*
- **`GAME_STATE_VERSION` 3 → 4.** Нові необов'язкові ключі:
  - `Play.wall?: Record<string, WallProgress>` (`WallProgress = { found: string[]; mistakes: number; tried: string[] }`);
  - `Play.cloudHidden?: string[]`.
- `KEYS[4]` = `KEYS[3]` з `Play: 'answers,blitz,board,buffs,chain,cloudHidden,clues,extraMs,final,overtime,question,roundIndex,sort,wall'` і новим `WallProgress: 'found,mistakes,tried'`. `KEYS[1]`, `KEYS[2]`, `KEYS[3]` не змінюються.
- **`READABLE_STATE_VERSIONS = [2, 3, 4]`**: зміна лише адитивна, а стан версій 2 і 3 не може містити стіни, опитування чи хмари (без `Play.wall` — порожній поступ). Тож кімнати, збережені до розгортання, відновлюються, і **пуш не обриває живих ігор**. Перевірку `live_room` за 14a можна не робити. Звіт власникові має назвати це явно.
- **Міграцій немає.** Запитання — у jsonb `quiz.rounds`, відповіді — у jsonb `answer.payload`; `VOTE_ATTEMPT` — нове значення наявної колонки `attempt`.

*Решта*
- **Демо.** `demo-quiz.ts` отримує помічники `wall(...)`, `poll(...)`, `cloud(...)`. У демо `demo`:
  - у розминці `r-warmup` — опитування «Яка пора року найкраща для вікторини?» і хмара «Одним словом: з чим у вас асоціюється Київ?»;
  - у класиці `r-x3` — стіна 4×4;
  - у полі `r-board-phone` — клітинка зі стіною 3×3.
  - Уже засіяні вікторини не змінюються.
- **Історія ведучого.** `answerText` стіни — «2 з 4 груп, 1 помилка» (або «Стіну складено, 0 помилок»), опитування — текст варіанта, хмари — слова через кому. Запитання стіни показує групи з назвами. Опитування — стовпчики з відповідей, хмара — список слів з кількістю (`cloudKey`). Рядок «відповіли / правильно» для опитування й хмари — «Проголосували N».
- **Чого не робимо:**
  - підказки «майже» (одна плитка не та);
  - особистого перемішування стіни;
  - назв груп для знайдених груп до розкриття;
  - множинного вибору в опитуванні;
  - автоматичного фільтра лайки;
  - хмари на телефонах;
  - опитування й хмари на полі;
  - команд (10j).

## Глобальні обмеження

- Рушій чистий: жодного годинника, усе від `now` і `rng`.
- **Анти-ціль «відповідь раніше розкриття».**
  - `PublicQuestion.wall` — лише `tiles` (тексти в порядку показу), `size`, `groupCount`, `maxMistakes`. Ні назв груп, ні id груп і плиток, ні ключа `groups`.
  - `PlayerWall` — лише власні знайдені групи позиціями.
  - Сцена до `reveal` не отримує `reveal`-запитання (наявне правило) і `WallInfo` (у класиці).
  - Жоден ряд `presented` не є групою.
  - Тести задачі 4 закріплюють це через `JSON.stringify(view)`, e2e — через кадри сокета телефона й сцени (`socketFrames`).
- **Сховані слова** не потрапляють у `StageView` і `PlayerView` (тест задачі 4, e2e — кадри сцени).
- **Старі вікторини й бали не змінюються.** Наявні тести сортування, серій, сумарного часу, дебафів і бафів лишаються зеленими без змін. Пропуск запитань без балів у `streakCounts` / `withTotals` / `fireDebuffs` не зачіпає жодного наявного типу.
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`, тексти довідки — лише в `apps/web/src/help/*.ts`.
- Телефон 375 px — без горизонтальної прокрутки. Плитки 4×4 вміщуються в ширину (4 стовпчики, шрифт зменшується класом для довгих текстів). Кнопки ≥ 44 px.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2`. Якщо PGlite падає з браком пам'яті, запускати окремо:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=1 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- Наскрізні тести: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts`. Кадри лягають в `apps/server/e2e/artifacts/shots`, префікс кадрів 10d — `p10d-`.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать. Живі ігри пуш не обриває: `READABLE_STATE_VERSIONS` містить 3.

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/{quiz.ts,answer.ts,game.ts}`, `quiz.test.ts` | `wall`, `poll`, `wordcloud`, ліміти, `UNSCORED_TYPES`, `wallScored`, `cloudKey`, коди, помилки, причини бафів | 1 |
| `apps/web/src/{format.ts,guide-text.ts,i18n.ts}`, `help/questions.ts`, `editor/draft.ts`, `screens/AnswerInput.tsx`, `editor/QuestionEditor.tsx` + `format.test.ts`, `draft.test.ts` | прохід typecheck | 1 |
| `packages/engine/src/{wall.ts(новий),check.ts,game.ts,buffs.ts,restore.ts,index.ts}`, `testing/fixtures.ts`, новий `game.wall.test.ts`, `check.test.ts`, `restore.test.ts` | стіна, `shareVerdict`, `off_wall`, версія 4 | 2 |
| `packages/engine/src/{votes.ts(новий),game.ts,buffs.ts,debuffs.ts,index.ts}`, новий `game.votes.test.ts` | голоси, серії й час без запитань без балів, дебафи чекають, `cloudTally`, `hideCloudWord` | 3 |
| `packages/shared/src/views.ts`, `packages/engine/src/views.ts`, новий `views.wall-votes.test.ts`, фабрики зрізів у тестах вебу | `PublicWall`, `PlayerWall`, `WallInfo`, хмара, лічильники опитування | 4 |
| `packages/shared/src/events.ts`, `apps/server/src/{rooms/manager.ts,socket.ts,recorder.ts,history.ts,db/schema.ts}`, тести `socket.test.ts`, `recorder.test.ts`, `history.test.ts`, `profiles.test.ts`, `achievements.test.ts` | `player:wall`, `host:cloud-hide`, `VOTE_ATTEMPT`, статистика без голосів | 5 |
| `apps/server/scripts/{demo-quiz.ts,demo-quiz.test.ts}` | демо | 6 |
| `apps/web/src/screens/{WallGrid,WallInput,CloudInput}.tsx` (нові), `AnswerInput.tsx`, `PlayerScreen.tsx`, `Debuffs.tsx`, `i18n.ts`, `styles.css` + тести | телефон | 7 |
| `apps/web/src/screens/{WallReveal,WallTable,PollBars,WordCloud,HostCloud}.tsx` (нові), `StageScreen.tsx`, `HostScreen.tsx`, `pages/GameHistory.tsx`, `i18n.ts`, `styles.css` + тести | сцена, пульт, історія | 8 |
| `apps/web/src/editor/{WallEditor(новий),QuestionEditor,BoardEditor}.tsx`, `draft.ts`, `draft-storage.ts`, `i18n.ts`, `styles.css` + тести | редактор | 9 |
| `apps/web/src/help/{questions,powers,cells,rounds,settings}.ts`, `host-help.test.ts`, `HostScreen.tsx` | довідка й «ⓘ» | 10 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 10d з кадрами `p10d-` | 11 |

## Порядок збирання

- 1 → 2 → 3 → 4 → 5 → 6.
- 7 — після 4 і 5 (подія `player:wall`). 8 — після 7 (`WallGrid`). 9 — після 1 (від рушія й зрізів не залежить), можна паралельно з 7–8.
- 10 — після 8 і 9. 11 — остання.
- **Навмисні зміни наявних очікувань** (лише такі):
  - `restore.test.ts`: `GAME_STATE_VERSION` 4, новий `KEYS[4]`, `STATE_SHAPE.WallProgress`; `READABLE_STATE_VERSIONS` `[2, 3, 4]`; `KEYS[1..3]` без змін;
  - фабрики `PublicQuestion` / `StageView` / `HostView` / `PlayerView['me']` / `BaseView` у тестах вебу отримують `wall: null`, `cloud: null` (і `me.wall: null`);
  - тест у `quiz.test.ts`, що звіряє `QUESTION_TYPES` буквально, отримує `'wall'`, `'poll'`, `'wordcloud'`;
  - тести `questionTypesFor` у `draft.test.ts`, якщо звіряють перелік буквально;
  - тести, що буквально звіряють `PlayedGame.questionsPlayed` гри без опитувань, лишаються без змін (без опитувань число те саме).
  - Якщо падає інше, рецензент розбирає причину, а не правку очікування.

## На що дивитися рецензентові

1. **Нічого не витікає.**
   - Групи стіни (назви, склад, id) — ні на телефоні, ні на сцені до розкриття. Телефон надсилає позиції, а не id. Жоден ряд показу не є групою.
   - Сховані слова — ніколи на сцені й телефонах.
   - Тести: задача 4 (`wall groups never reach phones or the stage before the reveal`, `hidden words never reach the stage`), задача 2 (`no shown row is a group`), задача 11 — кадри сокета.
2. **Бали стіни.**
   - `ціна / n` за групу, остання — автоматично без балів; половина ціни — «правильно»; мінус лише тому, хто спробував і має 0.
   - Замикання на ліміті; повтор неправильного вибору не рахується; поле — лише той, хто вибрав, і `revealNow`.
   - Тести: задача 2.
3. **Без балів — без сліду.**
   - Опитування й хмара не міняють рахунку, серії, сумарного часу, точності, `answered`, «бездоганної гри» й найдовшої серії; дебафи чекають.
   - Тести: задача 3, задача 5 (`a poll between correct answers keeps the streak and the perfect game`).
4. **Хмара.** Нормалізація (регістр, пробіли, апострофи), повтори одного гравця не рахуються, найчастіше написання, сховане слово зникає зі сцени й повертається. `cloudTally` — у формі для 10e. Тести: задача 3, 4.
5. **Формат стану.** `GAME_STATE_VERSION` = 4, `KEYS[4]` з `Play.wall`, `Play.cloudHidden`, `WallProgress`; представник зі стіною й хмарою проходить JSON; `READABLE_STATE_VERSIONS` `[2, 3, 4]`.
6. **Старе не змінилося.** Тести сортування, серій, сумарного часу, дебафів і бафів — без змін.
7. **Довідка.** Записи `question.wall`, `question.poll`, `question.wordcloud` правдиві щодо рушія й чисел з `LIMITS`. Бафи, дебафи, клітинки, раунди й налаштування згадують нові обмеження. Тести: задача 10.

---

### Задача 1. Shared: типи `wall`, `poll`, `wordcloud`, відповіді, ліміти, чисті функції, коди; прохід typecheck у вебі

**Files:**
- Modify: `packages/shared/src/quiz.ts`, `packages/shared/src/answer.ts`, `packages/shared/src/game.ts`
- Test: `packages/shared/src/quiz.test.ts`
- Modify (прохід typecheck): `apps/web/src/format.ts`, `apps/web/src/guide-text.ts`, `apps/web/src/i18n.ts`, `apps/web/src/help/questions.ts`, `apps/web/src/editor/draft.ts`, `apps/web/src/screens/AnswerInput.tsx`, `apps/web/src/editor/QuestionEditor.tsx`
- Test: `apps/web/src/format.test.ts`, `apps/web/src/editor/draft.test.ts`

**Interfaces:**
- Produces (`quiz.ts`):
  ```ts
  // У LIMITS:
  /** Стіна зв'язків: символів у плитці й назві групи, ліміт помилок, типовий час (с). */
  wallTile: 20,
  wallGroupName: 40,
  minWallMistakes: 1,
  maxWallMistakes: 5,
  defaultWallMistakes: 3,
  defaultWallTime: 90,
  /** «Хмара слів»: слів від гравця, символів у слові, слів на сцені. */
  maxCloudWords: 3,
  cloudWord: 24,
  cloudShown: 40,

  /** Розміри стіни: 3×3 або 4×4 (груп = плиток у групі). */
  export const WALL_SIZES = [3, 4] as const;

  // Гілки questionSchema:
  z.object({
    ...base,
    type: z.literal('wall'),
    groups: z
      .array(
        z.object({
          id: z.string().min(1).refine(isStorable, UNSTORABLE),
          /** Назва зв'язку; гравці бачать її лише на розкритті. */
          name: z.string().trim().min(1).max(LIMITS.wallGroupName).refine(isStorable, UNSTORABLE),
          tiles: z
            .array(z.object({ id: z.string().min(1).refine(isStorable, UNSTORABLE), text: z.string().trim().min(1).max(LIMITS.wallTile).refine(isStorable, UNSTORABLE) }))
            .min(3)
            .max(4),
        }),
      )
      .min(3)
      .max(4),
    /** Скільки помилок до замикання стіни для гравця. */
    mistakes: z.number().int().min(LIMITS.minWallMistakes).max(LIMITS.maxWallMistakes),
  }),
  z.object({ ...base, type: z.literal('poll'), options }),
  z.object({
    ...base,
    type: z.literal('wordcloud'),
    /** Скільки слів може написати гравець. */
    words: z.number().int().min(1).max(LIMITS.maxCloudWords),
  }),

  export const QUESTION_TYPES = [..., 'clues', 'pin', 'wall', 'poll', 'wordcloud'] as const;
  // SIMPLE_TYPES і REVEAL_TYPES — без змін.

  /** Типи без балів (10d): не йдуть у таблицю, серії, точність і досягнення. */
  export const UNSCORED_TYPES = ['poll', 'wordcloud'] as const satisfies readonly Question['type'][];
  export function isUnscored(question: { type: Question['type'] }): boolean;
  /** Груп, що дають бали: остання група стіни складається сама й балів не дає. */
  export function wallScored(found: number, groups: number): number; // min(max(found, 0), groups − 1)
  /** Частка ціни стіни: wallScored / groups. */
  export function wallShare(found: number, groups: number): number;
  /** Ключ слова «хмари»: NFC, обрізано, пробіли зведено, апострофи ’ʼ‘` → ', toLocaleLowerCase('uk'). */
  export function cloudKey(word: string): string;
  /** Слова гравця: обрізані, пробіли зведено, без порожніх і повторів за cloudKey, не більше max. */
  export function cloudWords(words: readonly string[], max: number): string[];
  // proximityPartial: 'slider' | 'pin' | 'wall'; коментар: «бали за близькість чи кількість знайденого (повзунок, точка, стіна)».
  // questionPrice: poll і wordcloud — 0 (points і так 0); решта без змін.
  ```
  - `superRefine` запитання:
    - `ids` для `duplicate_ids`: `wall` — id груп і плиток; `poll` — id варіантів;
    - `wall_shape` — `groups.some((g) => g.tiles.length !== groups.length)`;
    - `wall_duplicate_tiles` — повтори `text.trim().toLocaleLowerCase('uk')` серед усіх плиток;
    - `wall_video` — стіна з відео;
    - `vote_points` — `poll`/`wordcloud` з `points !== 0`.
  - `superRefine` вікторини (поруч із `pin_place`, той самий вигляд):
    - `wall_place` — `wall` у бліці, фіналі або на клітинці, що не звичайна з телефона;
    - `vote_place` — `poll`/`wordcloud` у будь-якому раунді, крім класики;
    - запасні: наявний `spare_type` уже відкидає всі три типи — лише тест.
- Produces (`answer.ts`):
  ```ts
  z.object({ type: z.literal('poll'), optionId: id }),
  z.object({
    type: z.literal('wordcloud'),
    words: z.array(z.string().trim().min(1).max(LIMITS.cloudWord).refine(isStorable, UNSTORABLE)).min(1).max(LIMITS.maxCloudWords),
  }),

  /** Підсумок стіни гравця; складає рушій, з телефона не приходить. */
  export interface WallAnswer {
    type: 'wall';
    /** Знайдено груп разом з автоматичною останньою. */
    found: number;
    groups: number;
    mistakes: number;
    /** Час, коли гравець закінчив (склав або замкнув стіну), мс; null — не встиг. */
    timeMs: number | null;
  }
  export type Answer = SubmittedAnswer | ChainAnswer | SortAnswer | WallAnswer;
  ```
- Produces (`game.ts`):
  - `ErrorCode` + `| 'wall_pick'` («вибір плиток стіни не підходить: не та кількість, повтор, знайдена плитка або поза стіною (10d)») `| 'wall_repeat'` («цей неправильний вибір уже був — помилка не рахується (10d)»);
  - `BuffBlock` + `| 'off_wall'` (коментар «стіна: бафів немає (10d)») `| 'off_vote'` («опитування й хмара: без балів — без бафів (10d)»).
- Веб (прохід typecheck):
  - `i18n.ts`:
    - стіна: `type_wall: 'Стіна зв'язків'`, `typeShort_wall: 'стіна'`, `typeHow_wall: 'Знайди групи плиток зі спільним зв'язком: вибери плитки однієї групи й натисни «Перевірити». Помилок можна небагато.'`;
    - опитування: `type_poll: 'Опитування'`, `typeShort_poll: 'опитування'`, `typeHow_poll: 'Правильної відповіді немає — просто вибери свій варіант. Балів не буде.'`;
    - хмара: `type_wordcloud: 'Хмара слів'`, `typeShort_wordcloud: 'хмара'`, `typeHow_wordcloud: 'Напиши до трьох коротких слів. Що частіше слово, то більшим воно буде на екрані. Балів не буде.'`;
    - помилки: `err_wall_pick: 'Вибери плитки ще раз.'`, `err_wall_repeat: 'Цей набір ти вже пробував.'` (одне речення і для 4×4, і для 3×3);
    - причини бафів: `buffWhy_off_wall: 'На стіні бафів немає.'`, `buffWhy_off_vote: 'Без балів — без бафів.'`;
    - історія: `pollNoCorrect: 'Без правильної відповіді'`, `wallCorrect: 'Групи: {groups}'`, `wallAnswerDone: 'Стіну складено, помилок: {mistakes}'`, `wallAnswerPart: '{found} з {groups} груп, помилок: {mistakes}'`;
  - `guide-text.ts`: `TYPE_ICONS.wall = '▦'`, `TYPE_ICONS.poll = '▮▮'`, `TYPE_ICONS.wordcloud = '☁'`;
  - `format.ts`:
    - `correctText`: `wall` → `t('wallCorrect', { groups: names.join('; ') })`; `poll`, `wordcloud` → `t('pollNoCorrect')`;
    - `answerText`: `poll` → текст варіанта (як `single`); `wordcloud` → `words.join(', ')`; `wall` → `found === groups` → `wallAnswerDone`, інакше `wallAnswerPart`;
  - `help/questions.ts`: повні записи `wall`, `poll`, `wordcloud` (тексти — задача 10, розділ «Interfaces»; тут вписати повністю, задача 10 лише звіряє й доповнює пов'язані записи);
  - `draft.ts`:
    - `questionTypesFor`: бліц — без `chain`, `clues`, `pin`, `wall`, `poll`, `wordcloud`; поле — без `chain`, `poll`, `wordcloud`; фінал — без `clues`, `pin`, `wall`, `poll`, `wordcloud`; класика — усі. Оновити коментар;
    - `build('wall')`:
      ```ts
      { ...common, video: null, type, timeLimit: LIMITS.defaultWallTime, mistakes: LIMITS.defaultWallMistakes,
        groups: Array.from({ length: 4 }, () => ({ id: newId(), name: '', tiles: blanks(4) })) }
      ```
    - `build('poll')` → `{ ...common, type, points: 0, options: blanks(LIMITS.minOptions) }`;
    - `build('wordcloud')` → `{ ...common, type, points: 0, words: LIMITS.maxCloudWords }`;
    - `changeType`:
      - у `poll`/`wordcloud` — `points: 0`;
      - з них в інший тип — `points: LIMITS.defaultPoints`;
      - зі `single`/`multi` у `poll` — варіанти зберігаються (тексти, картинки), із `poll` у `single` — правильним стає перший;
      - `reveal` прибирається для всіх трьох; у `wall` прибирається відео;
    - `duplicateQuestion` — глибока копія груп і плиток з новими id;
  - `AnswerInput.tsx`: `case 'wall': case 'poll': case 'wordcloud': return null; // задача 7`;
  - `QuestionEditor.tsx` (`Body`): `case 'wall': case 'poll': case 'wordcloud': return null; // задача 9`.

- [ ] **Step 1: Write the failing tests** у `packages/shared/src/quiz.test.ts`:
  ```ts
  describe('wall (10d)', () => {
    const tiles = (prefix: string, ...texts: string[]) => texts.map((text, i) => ({ id: `${prefix}${i + 1}`, text }));
    const wallQ = { id: 'w1', type: 'wall', text: 'Знайдіть зв'язки', imageUrl: null, video: null, timeLimit: 90, points: 1000, mistakes: 3,
      groups: [
        { id: 'gr', name: 'Річки', tiles: tiles('r', 'Дніпро', 'Десна', 'Рось', 'Псел') },
        { id: 'gm', name: 'Гори', tiles: tiles('m', 'Говерла', 'Петрос', 'Піп Іван', 'Бребенескул') },
        { id: 'gl', name: 'Озера', tiles: tiles('l', 'Світязь', 'Синевир', 'Ялпуг', 'Кагул') },
        { id: 'gi', name: 'Острови', tiles: tiles('i', 'Хортиця', 'Джарилгач', 'Зміїний', 'Бірючий') },
      ] } as const;
    it('a wall is a question type, not simple; 4×4 and 3×3 only', () => {
      expect(QUESTION_TYPES).toContain('wall');
      expect(SIMPLE_TYPES).not.toContain('wall');
      expect(valid(questionSchema, wallQ)).toBe(true);
      const small = { ...wallQ, groups: wallQ.groups.slice(0, 3).map((g) => ({ ...g, tiles: g.tiles.slice(0, 3) })) };
      expect(valid(questionSchema, small)).toBe(true);
      expect(issues({ ...wallQ, groups: [...wallQ.groups.slice(0, 3), { ...wallQ.groups[3], tiles: wallQ.groups[3].tiles.slice(0, 3) }] })).toContain('wall_shape');
      expect(issues({ ...small, groups: [...small.groups.slice(0, 2), wallQ.groups[3]] })).toContain('wall_shape');
    });
    it('checks tiles, names, mistakes, duplicates and video', () => {
      const dupe = { ...wallQ, groups: [{ ...wallQ.groups[0], tiles: tiles('r', 'Дніпро', ' дніпро ', 'Рось', 'Псел') }, ...wallQ.groups.slice(1)] };
      expect(issues(dupe)).toContain('wall_duplicate_tiles');
      expect(valid(questionSchema, { ...wallQ, mistakes: 0 })).toBe(false);
      expect(valid(questionSchema, { ...wallQ, mistakes: 6 })).toBe(false);
      expect(valid(questionSchema, { ...wallQ, groups: [{ ...wallQ.groups[0], name: '' }, ...wallQ.groups.slice(1)] })).toBe(false);
      expect(valid(questionSchema, { ...wallQ, groups: [{ ...wallQ.groups[0], tiles: tiles('r', 'x'.repeat(LIMITS.wallTile + 1), 'Десна', 'Рось', 'Псел') }, ...wallQ.groups.slice(1)] })).toBe(false);
      expect(issues({ ...wallQ, video: { id: 'dQw4w9WgXcQ', start: 0 } })).toContain('wall_video');
      expect(issues({ ...wallQ, groups: [{ ...wallQ.groups[0], id: 'gm' }, ...wallQ.groups.slice(1)] })).toContain('duplicate_ids');
    });
    it('wallScored: the last group gives nothing; wallShare', () => {
      expect([0, 1, 2, 4].map((f) => wallScored(f, 4))).toEqual([0, 1, 2, 3]);
      expect(wallShare(2, 4)).toBe(0.5);
      expect(wallShare(3, 3)).toBeCloseTo(2 / 3);
      expect(proximityPartial(wallQ)).toBe(true);
    });
  });

  describe('poll and word cloud (10d)', () => {
    const pollQ = { id: 'p1', type: 'poll', text: 'Найкраща пора року?', imageUrl: null, video: null, timeLimit: 20, points: 0,
      options: [{ id: 'a', text: 'Весна' }, { id: 'b', text: 'Літо' }, { id: 'c', text: 'Осінь' }] } as const;
    const cloudQ = { id: 'k1', type: 'wordcloud', text: 'З чим асоціюється Київ?', imageUrl: null, video: null, timeLimit: 30, points: 0, words: 3 } as const;
    it('both are unscored types with zero points', () => {
      expect(isUnscored(pollQ)).toBe(true);
      expect(isUnscored(cloudQ)).toBe(true);
      expect(isUnscored({ type: 'single' })).toBe(false);
      expect(valid(questionSchema, pollQ)).toBe(true);
      expect(valid(questionSchema, cloudQ)).toBe(true);
      expect(issues({ ...pollQ, points: 100 })).toContain('vote_points');
      expect(issues({ ...cloudQ, points: 100 })).toContain('vote_points');
      expect(valid(questionSchema, { ...cloudQ, words: 4 })).toBe(false);
      expect(questionPrice(pollQ)).toBe(0);
    });
    it('cloudKey ignores case, spaces and apostrophe variants; cloudWords dedupes and caps', () => {
      expect(cloudKey('  КИЇВ ')).toBe('київ');
      expect(cloudKey('Нью   Йорк')).toBe('нью йорк');
      expect(cloudKey('м’ята')).toBe(cloudKey("М'ята"));
      expect(cloudWords([' Каштани ', 'каштани', '', 'Дніпро', 'Лавра'], 3)).toEqual(['Каштани', 'Дніпро', 'Лавра']);
      expect(cloudWords(['a', 'b', 'c', 'd'], 2)).toEqual(['a', 'b']);
    });
  });

  describe('where walls, polls and clouds live (10d)', () => {
    // wall у класиці й на звичайній клітинці поля з телефона — OK; у бліці, фіналі, на бліц- й усній клітинці → 'wall_place'
    // poll і wordcloud у класиці — OK; у бліці, фіналі й на будь-якій клітинці поля → 'vote_place'
    // quiz.spares з wall, poll або wordcloud → 'spare_type'
  });
  ```
  - Тести `answerSchema`:
    - `{ type: 'poll', optionId: 'a' }` проходить;
    - `{ type: 'wordcloud', words: ['каштани'] }` проходить;
    - `words: []`, 4 слова, слово на 25 символів і `words: ['  ']` — ні.
  - Повні тіла `where …` писати за зразком тестів `pin_place` 10c. Помічники `valid`, `issues` — наявні.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared` → FAIL (немає експортів).
- [ ] **Step 3: Implement** схему, функції й коди за інтерфейсом. `cloudKey`: `word.normalize('NFC').trim().replace(/\s+/gu, ' ').replace(/[’ʼ‘`]/gu, "'").toLocaleLowerCase('uk')`. `cloudWords` повертає обрізаний текст зі зведеними пробілами (не ключ).
- [ ] **Step 4: Прохід typecheck у вебі.** Виконати `pnpm typecheck` і закрити кожну помилку змінами з інтерфейсу. Тести:
  - `format.test.ts`:
    - `correctText(wallQ)` → `'Групи: Річки; Гори; Озера; Острови'`; `correctText(pollQ)` → `'Без правильної відповіді'`;
    - `answerText({ type: 'wall', found: 2, groups: 4, mistakes: 1, timeMs: null })` → `'2 з 4 груп, помилок: 1'`; `found: 4` → `'Стіну складено, помилок: 1'`;
    - `answerText({ type: 'poll', optionId: 'b' }, pollQ)` → `'Літо'`; `answerText({ type: 'wordcloud', words: ['каштани', 'Дніпро'] })` → `'каштани, Дніпро'`;
  - `draft.test.ts`:
    - `newQuestion('wall')` після заповнення назв і плиток проходить `questionSchema`, `timeLimit` 90, `mistakes` 3;
    - `newQuestion('poll')` і `newQuestion('wordcloud')` мають `points: 0` і проходять схему;
    - `questionTypesFor('board')` має `wall`, не має `poll`/`wordcloud`; `questionTypesFor('blitz')` і `questionTypesFor('final')` не мають жодного з трьох;
    - `changeType` single з варіантами → poll: варіанти ті самі, `points: 0`; poll → single: `points: 1000`, `correctId` — перший.
- [ ] **Step 5: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 6: Commit**
  ```bash
  git add packages/shared apps/web/src
  git commit -m "feat(shared): connections wall, poll and word cloud question types, answers, limits, unscored types, wall scoring and cloud word keys, placement rules"
  ```

### Задача 2. Рушій: стіна зв'язків — порядок плиток, хід, автоскладання, замикання, бали, поле; `GAME_STATE_VERSION` 4

**Files:**
- Create: `packages/engine/src/wall.ts`
- Modify: `packages/engine/src/check.ts`, `packages/engine/src/game.ts`, `packages/engine/src/buffs.ts`, `packages/engine/src/restore.ts`, `packages/engine/src/index.ts`, `packages/engine/src/testing/fixtures.ts`
- Test: новий `packages/engine/src/game.wall.test.ts`; `check.test.ts`, `restore.test.ts`

**Interfaces:**
- Produces (`check.ts`):
  ```ts
  /** Вердикт за часткою ціни для типів з балами за близькість чи кількість знайденого (14a): правильна — частка ≥ 0,5. */
  export function shareVerdict(share: number): Verdict;
  ```
  Гілку `proximityPartial` у `verdictOf` переписати через `shareVerdict(checked.accuracy)` (числа ті самі; тести повзунка й точки без змін).
- Changes (`game.ts`):
  ```ts
  // Play:
  /** Лише в запитанні-стіні; гравця тут немає, поки він не надіслав жодного вибору (10d). */
  wall?: Record<string, WallProgress>;
  /** «Хмара слів»: ключі cloudKey, які ведучий сховав (10d). */
  cloudHidden?: string[];

  /** Поступ гравця на стіні. */
  export interface WallProgress {
    /** Id знайдених груп у порядку знаходження; остання автоматична теж тут. */
    found: string[];
    mistakes: number;
    /** Неправильні вибори: відсортовані id плиток через кому. */
    tried: string[];
  }
  ```
  - `present()`: `if (question.type === 'wall') return wallPresent(question, rng);`.
  - `removePlayer`: прибирає гравця з `play.wall` (як `sort`).
  - `submitAnswer`: `answer.type === 'wall' || play.question.type === 'wall'` → `fail('type_mismatch')` (стіна — лише через `guessWall`).
  - `lockNow`: `scoreWall(scoreSort(scoreChain(...)))`.
  - `override`: для `type === 'wall'` — `fail('wrong_phase')` (поруч із `chain`, `sort`).
- Produces (`wall.ts`):
  ```ts
  /** Порядок показу плиток (id): перемішано rng; жоден ряд з n плиток не є групою (20 спроб, далі — по одній з кожної групи). */
  export function wallPresent(question: Extract<Question, { type: 'wall' }>, rng: Rng): string[];
  /** Поступ гравця; без ходів — { found: [], mistakes: 0, tried: [] }. */
  export function wallOf(state: GameState, playerId: string): WallProgress;
  /** Чи гравець складає цю стіну: на клітинці поля — лише той, хто вибрав; інакше будь-який гравець. */
  export function wallsHere(state: GameState, play: Play, playerId: string): boolean;
  /** Чи гравець закінчив: є запис (склав, замкнув або закрито запитання). */
  export function wallDone(state: GameState, playerId: string): boolean;
  /** Бали за found груп: класика — answerPoints, поле — boardPoints; accuracy = wallShare. */
  export function wallPoints(state: GameState, play: Play, found: number): number;
  /**
   * Хід: positions — позиції в state.presented. Правильно — група в found (на n − 1 — і остання);
   * неправильно — помилка (повтор — wall_repeat); на ліміті помилок або після останньої групи — запис.
   */
  export function guessWall(state: GameState, playerId: string, positions: number[], now: number): Result;
  /** На етапі question: записи тим, хто ходив і не закінчив; на полі той, хто вибрав, отримує запис завжди. */
  export function scoreWall(state: GameState): GameState;
  ```
  - Запис гравця, що закінчив:
    ```ts
    { answer: { type: 'wall', found, groups: n, mistakes, timeMs }, timeMs, accepted, accuracy: wallShare(found, n), grade,
      basePoints: points, streakBonus: 0, points, overridden: false }
    ```
    `{ accepted, grade } = shareVerdict(wallShare(found, n))`; `timeMs = max(0, now − startedAt)`.
  - Запис від `scoreWall`: `answer.timeMs = null`, `record.timeMs = limitMsOf(play) ?? 0`.
  - Мінус: `wallPoints` для гравця з `found = 0` дає мінус ціни через `answerPoints`/`boardPoints`, лише якщо `progress` існує. Той, хто вибрав на полі й не ходив, отримує запис `points: 0` без мінуса (прямо, без `wallPoints`).
  - Після запису: на полі — `revealNow(done)`; інакше — `autoLock(done, now)`.
- Changes (`buffs.ts`, `placeBlock`): `if (play.question.type === 'wall') return 'off_wall';` поруч з `off_sort`.
- Changes (`restore.ts`):
  - `GAME_STATE_VERSION = 4`; коментар `4 — 10d: Play.wall (поступ стіни), Play.cloudHidden (сховані слова «хмари»).`;
  - `READABLE_STATE_VERSIONS = [2, 3, GAME_STATE_VERSION]` з коментарем: 3 → 4 лише додала необов'язкові ключі, а стан версій 2–3 не може містити стіни, опитування чи хмари.
- Produces (`testing/fixtures.ts`):
  ```ts
  const tiles = (prefix: string, ...texts: string[]) => texts.map((text, i) => ({ id: `${prefix}${i + 1}`, text }));
  export const wall = { ...base, id: 'q13', type: 'wall', text: 'Знайдіть зв'язки', timeLimit: 90, points: 1000, mistakes: 3,
    groups: [
      { id: 'gr', name: 'Річки', tiles: tiles('r', 'Дніпро', 'Десна', 'Рось', 'Псел') },
      { id: 'gm', name: 'Гори', tiles: tiles('m', 'Говерла', 'Петрос', 'Піп Іван', 'Бребенескул') },
      { id: 'gl', name: 'Озера', tiles: tiles('l', 'Світязь', 'Синевир', 'Ялпуг', 'Кагул') },
      { id: 'gi', name: 'Острови', tiles: tiles('i', 'Хортиця', 'Джарилгач', 'Зміїний', 'Бірючий') },
    ] } satisfies Question;
  export const wall3 = { ...base, id: 'q14', type: 'wall', text: 'Швидка стіна', timeLimit: 60, points: 900, mistakes: 2,
    groups: [
      { id: 'ga', name: 'Фрукти', tiles: tiles('a', 'Яблуко', 'Груша', 'Слива') },
      { id: 'gb', name: 'Птахи', tiles: tiles('b', 'Сова', 'Лелека', 'Чапля') },
      { id: 'gc', name: 'Метали', tiles: tiles('c', 'Мідь', 'Залізо', 'Олово') },
    ] } satisfies Question;
  ```

- [ ] **Step 1: Write the failing tests.**
  - Помічник у тесті: `const at = (s: GameState, ...ids: string[]) => ids.map((id) => s.presented.indexOf(id));` (позиції плиток).
  - `check.test.ts`: `shareVerdict(0.5)` → `{ accepted: true, accuracy: 0.5, grade: 'correct' }`; `0.25` → `partial`, `accepted: false`; `0` → `wrong`; `0.4999999999` → `accepted: true` (ε).
  - `game.wall.test.ts`. Класика `speedBonus: true`, `[wall]` (4×4, 1000, ліміт 3), Анна p1, Богдан p2, `startRound(..., 0)`:
    ```ts
    it('no shown row is a group, whatever the rng', () => {
      for (const rng of [() => 0, () => 0.999, seeded(1), seeded(7)]) {
        const s = openClassic([wall], rng);
        expect(new Set(s.presented)).toEqual(new Set(wall.groups.flatMap((g) => g.tiles.map((t) => t.id))));
        for (let row = 0; row < 4; row++) {
          const ids = new Set(s.presented.slice(row * 4, row * 4 + 4));
          expect(wall.groups.some((g) => g.tiles.every((t) => ids.has(t.id)))).toBe(false);
        }
      }
    });
    it('a right group is found, the third right group completes the wall and pays 3 of 4 groups', () => {
      let s = openClassic([wall]);
      s = must(guessWall(s, 'p1', at(s, 'r1', 'r2', 'r3', 'r4'), 1000));
      expect(wallOf(s, 'p1').found).toEqual(['gr']);
      s = must(guessWall(s, 'p1', at(s, 'm1', 'm2', 'm3', 'm4'), 2000));
      s = must(guessWall(s, 'p1', at(s, 'l1', 'l2', 'l3', 'l4'), 3000));
      expect(wallOf(s, 'p1').found).toEqual(['gr', 'gm', 'gl', 'gi']);
      expect(recordOf(s, 0, 'p1')).toMatchObject({ points: 750, accepted: true, grade: 'correct', answer: { type: 'wall', found: 4, groups: 4, mistakes: 0, timeMs: 3000 } });
    });
    ```
    Інші тести файлу:
    - `a wrong pick is a mistake; the same wrong pick again is wall_repeat and costs nothing` (`r1 r2 r3 m1` → `mistakes 1`; знову ті самі позиції в іншому порядку → `wall_repeat`, `mistakes 1`);
    - `the wall locks at the mistake limit and pays the groups found` (1 група, далі 3 різні помилки → запис 250, `accepted: false`, `grade: 'partial'`; наступний хід → `already_answered`);
    - `two groups are correct (half the price)` (2 групи, далі час минув: `tick(s, 90_001)` → запис 500, `accepted: true`, `answer.timeMs === null`);
    - `bad picks: wrong size, duplicates, found tiles, out of range → wall_pick` (3 позиції; `[0, 0, 1, 2]`; позиція знайденої плитки; `16`);
    - `the minus penalty only for a player who tried and found nothing` (правила `penalty: 'minus'`: p1 одна помилка й час минув → −1000; p2 не торкався → запису немає, рахунок 0);
    - `no speed bonus; the round multiplier applies` (×2, дві групи → 1000);
    - `everyone done closes the question` (p1 складає, p2 замикається → етап `locked`);
    - `a disconnected player does not hold the question` (як у сортуванні — наявне правило `autoLock`);
    - `a 3×3 wall: one group is a third and not correct, two groups complete it` (`wall3`: 1 група й час → 300 `partial`; дві групи → автоскладання, 600 `correct`);
    - `pause blocks guesses` (`pause` → `paused`); `before the splash ends — not_started`; `time over — time_over`;
    - `submitAnswer refuses a wall` (`type_mismatch`); `override refuses a wall` (`wrong_phase`);
    - `no buff fits a wall` (`buffBlock` для кожного з `BUFF_KINDS` → `'off_wall'`);
    - `streak: a correct wall continues it` (правила `streak: { length: 2, … }`, дві стіни по 2 групи → серія 2);
    - **поле, клітинка з телефона** (`boardRound` з клітинкою-стіною, позначка ×2, вибравший p1):
      - `only the chooser guesses` (p2 → `not_your_turn`);
      - `the last group reveals the cell at once` (три групи → етап `reveal`, бали `round(1000 × 3/4 × 2)` = 1500);
      - `locked at the limit reveals too` (3 помилки → `reveal`, 0 балів, без мінуса за правил `penalty: 'none'`);
      - `a chooser who never touched gets a zero record when time is over`;
    - `a removed player leaves no wall progress` (`removePlayer` → `play.wall` без p1).
  - `restore.test.ts`:
    - `KEYS[4]` = `KEYS[3]` з `Play: 'answers,blitz,board,buffs,chain,cloudHidden,clues,extraMs,final,overtime,question,roundIndex,sort,wall'` і `WallProgress: 'found,mistakes,tried'`;
    - `STATE_SHAPE.Play` + `'wall'`, `'cloudHidden'`; `STATE_SHAPE.WallProgress = keysOf<WallProgress>()(['found', 'mistakes', 'tried'], true)`;
    - `READABLE_STATE_VERSIONS` дорівнює `[2, 3, 4]`;
    - у `representative()` — класика `[wall]` з поступом одного гравця (одна група й одна помилка) і `cloudHidden: ['лайка']` на окремому `Play` (можна вписати в JSON-об'єкт вручну, як інші рідкісні ключі в `representative`).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсом.
  - `wallPresent`: `mixed = shuffle(ids, rng)`; `while (groupedRow(mixed) && tries++ < 20) mixed = shuffle(mixed, rng)`; якщо ряд лишився — по одній з кожної групи. `groupedRow` перевіряє лише ряди по `n`.
  - `guessWall` перевіряє в порядку `sortWord`: етап, пауза, заставка, гравець, тип, `wallsHere`, запис, час, вибір. Позиції → id через `state.presented`; знайдені плитки — `found.flatMap(group → tiles)`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS (усі наявні тести рушія без змін, крім `KEYS`/версії).
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine
  git commit -m "feat(engine): connections wall — shared shuffle with no grouped row, guesses by position, the last group completes itself without points, lock at the mistake limit, price / groups per group with half as correct, board cell reveals at the end; GAME_STATE_VERSION 4 (Play.wall, Play.cloudHidden)"
  ```

### Задача 3. Рушій: опитування й хмара без балів — голоси, серії й час без них, дебафи чекають, хмара для 10e, ховання слів

**Files:**
- Create: `packages/engine/src/votes.ts`
- Modify: `packages/engine/src/game.ts`, `packages/engine/src/buffs.ts`, `packages/engine/src/debuffs.ts`, `packages/engine/src/index.ts`, `packages/engine/src/testing/fixtures.ts`
- Test: новий `packages/engine/src/game.votes.test.ts`

**Interfaces:**
- Produces (`votes.ts`):
  ```ts
  /** Голос у запитанні без балів: запис з нулями (accepted false, grade 'wrong' — ніде не показується); слова хмари чистить cloudWords. */
  export function submitVote(state: GameState, playerId: string, answer: Answer, now: number): Result;

  /** Слово «хмари» з підрахунком (форма для «100 до 1», 10e). */
  export interface CloudEntry {
    /** cloudKey слова. */
    key: string;
    /** Найчастіше написання серед гравців; за рівності — першого за порядком гравців. */
    text: string;
    /** Скільки гравців назвали слово. */
    count: number;
    /** Хто назвав, у порядку гравців. */
    playerIds: string[];
    hidden: boolean;
  }
  /** Підрахунок хмари в play (запитання wordcloud): за count спаданням, далі за text (uk). Для інших типів — []. */
  export function cloudTally(play: Play, players: readonly { id: string }[]): CloudEntry[];
  /** Скільки гравців написали хоч одне слово. */
  export function cloudVoters(play: Play): number;
  /**
   * Ведучий ховає (hidden true) або повертає слово хмари поточного запитання.
   * Помилки: wrong_phase — не question/locked/reveal або поточне не wordcloud; not_found — такого ключа в хмарі немає.
   */
  export function hideCloudWord(state: GameState, key: string, hidden: boolean): Result;
  ```
- Changes (`game.ts`):
  - `present()`: `poll` — як `single`/`multi` (перемішування за `round.shuffleOptions`).
  - `submitAnswer`: після перевірок етапу, паузи, заставки й гравця — `if (isUnscored(play.question)) return submitVote(state, playerId, answer, now);`.
  - `submitVote`: `already_answered`, `time_over` (`timeOverFor`), `type_mismatch` (тип відповіді ≠ тип запитання; у хмари після `cloudWords` нічого не лишилося; `optionId` поза варіантами — `not_found`). Запис: `answer` (у хмари — `{ type: 'wordcloud', words: cloudWords(answer.words, question.words) }`), `timeMs`, нулі. Далі `autoLock(withRecord(...), now)`.
  - `streakCounts`: на початку тіла циклу — `if (isUnscored(state.plays[i].question)) continue;`. Коментар функції доповнити: «запитання без балів (опитування, хмара) серію не обривають і не продовжують».
  - `withTotals`: у циклі бонусів — `if (isUnscored(play.question)) return play;`; у сумарному часі — `if (isUnscored(play.question)) continue;` перед `limitMs`.
  - `override`: `isUnscored(type)` → `fail('wrong_phase')`.
- Changes (`buffs.ts`, `placeBlock`): `if (isUnscored(play.question)) return 'off_vote';`.
- Changes (`debuffs.ts`, `fireDebuffs`): якщо поточне запитання без балів — `answering` порожній (дебафи, що чекають, лишаються чекати; застарілі спрацьовані прибираються як і раніше). Коментар: «на опитуванні й хмарі дебаф не згорає даремно».
- Produces (`testing/fixtures.ts`):
  ```ts
  export const poll = { ...base, id: 'q15', type: 'poll', text: 'Найкраща пора року?', timeLimit: 20, points: 0,
    options: [{ id: 'a', text: 'Весна' }, { id: 'b', text: 'Літо' }, { id: 'c', text: 'Осінь' }] } satisfies Question;
  export const cloud = { ...base, id: 'q16', type: 'wordcloud', text: 'З чим асоціюється Київ?', timeLimit: 30, points: 0, words: 3 } satisfies Question;
  ```

- [ ] **Step 1: Write the failing tests** у `game.votes.test.ts` (класика `streak: { length: 2, bonus: { kind: 'fixed', value: 100 } }`, Анна p1, Богдан p2, Віра p3):
  ```ts
  it('a vote is recorded with zero points and changes no score', () => {
    let s = openClassic([poll]);
    s = must(submitAnswer(s, 'p1', { type: 'poll', optionId: 'b' }, 1000));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ points: 0, accepted: false, answer: { type: 'poll', optionId: 'b' } });
    s = answerAll(s, { p2: { type: 'poll', optionId: 'a' }, p3: { type: 'poll', optionId: 'b' } });
    expect(s.phase).toBe('locked');
    expect(s.players.map((p) => p.score)).toEqual([0, 0, 0]);
  });
  ```
  Інші тести:
  - `a poll between two correct answers keeps the streak and its bonus` (`[single, poll, single]`, p1 правильно — голос — правильно → серія 2 і бонус 100 на третьому);
  - `missing a poll does not break the streak either` (p1 не голосує);
  - `polls add nothing to the total time` (два гравці з однаковими балами за `single`, p1 голосує за 1 с, p2 за 15 с → `totalTimeMs` рівні за опитування; порівняти з грою без опитування);
  - `one vote only; unknown option — not_found; a text answer to a poll — type_mismatch; time over — time_over`;
  - `cloud words are cleaned: trimmed, deduped by key, capped` (`['  Каштани ', 'КАШТАНИ', 'Дніпро', 'Лавра']` при `words: 3` → `['Каштани', 'Дніпро', 'Лавра']`; при `words: 1` → `['Каштани']`; `['   ']` не пройде схему — у рушії `type_mismatch` для `[]`);
  - `cloudTally counts players, picks the most common spelling, sorts by count` (p1 `['каштани', 'Дніпро']`, p2 `['каштани', 'Лавра']`, p3 `['КАШТАНИ', 'Лавра']` → перший запис `{ key: 'каштани', text: 'каштани', count: 3, playerIds: ['p1', 'p2', 'p3'], hidden: false }`, далі «Лавра» 2, «Дніпро» 1; `cloudVoters` = 3; окремо — рівність написань «Каштани» (p1) і «каштани» (p2) дає `text: 'Каштани'`, бо p1 перший);
  - `hideCloudWord hides and restores a word; unknown key — not_found; works on question, locked and reveal; not on a poll` (`cloudHidden` = `['каштани']` → `cloudTally(...)[0].hidden === true`; `false` → прибрано);
  - `no buff fits a poll or a cloud` (кожен вид → `'off_vote'`);
  - `a waiting debuff does not fire on a poll and fires on the next scored question` (`buyDebuff` на p2 перед опитуванням → після `openQuestion(poll)` `firedAt === null`; після наступного `single` — `firedAt` = його індекс);
  - `override refuses polls and clouds` (`wrong_phase`).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/game.votes.test.ts` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсом. `cloudTally` іде записами в порядку `players` (а не `Object.keys`), щоб порядок і «перше написання» були сталими.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS (наявні тести серій, сумарного часу й дебафів без змін).
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine
  git commit -m "feat(engine): polls and word clouds record zero-point votes that never touch scores, streaks or total time; no buffs, waiting debuffs skip them; cloud tally by player with the most common spelling (for 10e) and host hiding of words"
  ```

### Задача 4. Зрізи: стіна без груп, власний поступ, таблиця стіни, хмара без схованих слів, лічильники опитування

**Files:**
- Modify: `packages/shared/src/views.ts`, `packages/engine/src/views.ts`
- Test: новий `packages/engine/src/views.wall-votes.test.ts`
- Modify (фабрики): тести вебу, що будують `PublicQuestion` / `StageView` / `HostView` / `PlayerView` вручну (`grep -rln "pinMarks: null\|pin: null" apps/web/src`)

**Interfaces:**
- Produces (`shared/views.ts`):
  ```ts
  /** Стіна без груп: лише тексти плиток у порядку показу; гравець надсилає позиції. */
  export interface PublicWall {
    tiles: string[];
    /** Плиток у групі (= груп): 3 або 4. */
    size: number;
    groupCount: number;
    maxMistakes: number;
  }
  // PublicQuestion:
  /** null для інших типів. */
  wall: PublicWall | null;
  /** «Хмара слів»: скільки слів може написати гравець; null для інших типів. */
  cloud: { words: number } | null;

  /** Стіна для самого гравця: лише власні знайдені групи (позиції), без назв. */
  export interface PlayerWall {
    /** Знайдені групи в порядку знаходження; color — номер кольору (0…3). */
    found: { tiles: number[]; color: number }[];
    mistakes: number;
    maxMistakes: number;
    /** Стіну замкнено помилками. */
    locked: boolean;
    /** Склав усю стіну. */
    solved: boolean;
    /** question, не пауза, гравець складає тут, запису ще немає. */
    canGuess: boolean;
  }
  // PlayerView['me']:
  /** null поза стіною і для того, хто тут не складає (глядач на полі). */
  wall: PlayerWall | null;

  export interface WallRow {
    playerId: string;
    nickname: string;
    /** Знайдено груп разом з автоматичною. */
    found: number;
    mistakes: number;
    locked: boolean;
    solved: boolean;
    /** Бали; лише на reveal, інакше null. */
    points: number | null;
    /** Позиції знайдених груп; лише на полі (стіна того, хто вибрав) і для пульта, інакше null. */
    tiles: number[][] | null;
  }
  /** Поступ стіни. Пульт — з question; сцена в класиці — лише на reveal; на полі — усі ролі з question. */
  export interface WallInfo {
    groupCount: number;
    /** Порядок: склали (за часом), далі за found спаданням, далі за mistakes зростанням, далі в порядку гравців. На полі — лише той, хто вибрав. */
    rows: WallRow[];
  }
  // BaseView:
  /** null поза стіною; див. WallInfo. */
  wall: WallInfo | null;

  /** Слово хмари для сцени: без схованих і без авторів. */
  export interface CloudWord { key: string; text: string; count: number }
  /** Слово хмари для пульта: з позначкою «сховано» й нікнеймами авторів. */
  export interface HostCloudWord extends CloudWord { hidden: boolean; by: string[] }
  // StageView:
  /** «Хмара слів»: лише на reveal, без схованих, не більше LIMITS.cloudShown найчастіших. Інакше null. */
  cloud: CloudWord[] | null;
  /** Скільки гравців написали слова (для підпису «Написали N»); null поза хмарою на reveal. */
  cloudVoters: number | null;
  // HostView:
  /** Уся хмара з question/locked/reveal, разом зі схованими. Інакше null. */
  cloud: HostCloudWord[] | null;
  ```
- Produces (`engine/views.ts`):
  - `publicQuestion`:
    - `poll` бере `question.options` як `source` для `choices` (порядок — `presented`, задача 3);
    - `wall: question.type === 'wall' ? { tiles: presented.map((id) => textOf(id)), size: n, groupCount: n, maxMistakes: question.mistakes } : null`;
    - `cloud: question.type === 'wordcloud' ? { words: question.words } : null`.
  - `playerWall(state, playerId)` — як `playerSort`: позиції знайдених груп через `state.presented`, `color` = індекс у `found`.
  - `wallInfo(state, role)`:
    - класика: пульт — `question`/`locked`/`reveal`, сцена й гравці — лише `reveal`;
    - поле: усі ролі з `question`, `rows` — лише той, хто вибрав, з `tiles`;
    - пульт отримує `tiles` завжди; `points` — лише на `reveal`.
  - `revealStats`: `known` для `poll` — id варіантів; `answer.type === 'poll'` → `[answer.optionId]`.
  - Хмара:
    - `stageCloud` бере `cloudTally(play, state.players)`, відкидає `hidden`, бере перші `LIMITS.cloudShown` і віддає лише `{ key, text, count }`;
    - `hostCloud` віддає всі записи з `hidden` і `by` (нікнейми з `playerIds`).
  - `answeredCount` без змін (голоси — записи).
  - `me.answer` для голосів — наявне (з запису). `me.result` для запитання без балів — `null` (екран не показує «0 балів»).

- [ ] **Step 1: Write the failing tests** у `views.wall-votes.test.ts` (класика `[wall, poll, cloud]`, Анна p1, Богдан p2; поле з клітинкою-стіною для двох тестів):
  ```ts
  it('wall groups never reach phones or the stage before the reveal', () => {
    let s = openClassic();
    s = must(guessWall(s, 'p1', at(s, 'r1', 'r2', 'r3', 'r4'), 1000));
    for (const phase of ['question', 'locked'] as const) {
      const t = phase === 'locked' ? lock(s) : s;
      for (const view of [playerView(t, 'p1')!, playerView(t, 'p2')!, stageView(t)]) {
        const json = JSON.stringify(view);
        for (const group of wall.groups) expect(json).not.toContain(group.name);
        expect(json).not.toMatch(/"groups"|"gr"|"gm"|"r1"|"m1"/);
      }
    }
    const phone = playerView(s, 'p1')!;
    expect(phone.question?.wall).toEqual({ tiles: s.presented.map(textOf), size: 4, groupCount: 4, maxMistakes: 3 });
    expect(phone.me.wall).toMatchObject({ found: [{ tiles: at(s, 'r1', 'r2', 'r3', 'r4'), color: 0 }], mistakes: 0, canGuess: true });
    expect(playerView(s, 'p2')!.me.wall?.found).toEqual([]);
    expect(JSON.stringify(hostView(s).correct)).toContain('Річки');
  });
  ```
  Інші тести:
  - `the stage sees the wall rows only on the reveal; the host from the question` (класика: `stageView(s).wall === null` на `question` і `locked`; на `reveal` — рядки з `points`; `hostView(s).wall.rows` на `question` з `tiles`, `points: null`);
  - `on a board cell everyone watches the chooser's wall` (сцена й p2 на `question` бачать `rows[0].tiles` вибравшого; `me.wall` у p2 — `null`, у p1 — є);
  - `locked and solved flags` (після 3 помилок `me.wall.locked`, `canGuess: false`; після складання — `solved`);
  - `poll choices and reveal counts` (`question.choices` — три варіанти; після голосів p1 «b», p2 «b» на `reveal` `stats.counts` = `{ b: 2 }`, `stats.accepted` = 0; `me.result === null`);
  - `the cloud reaches the stage only on the reveal, without hidden words` (p1 «каштани», «лайка», p2 «каштани»; `hideCloudWord('лайка')`; на `question` і `locked` `stageView.cloud === null`; на `reveal` — `[{ key: 'каштани', text: 'каштани', count: 2 }]`, `cloudVoters` 2; `JSON.stringify(stageView)` і `JSON.stringify(playerView(p2))` не містять «лайка»);
  - `the host sees the whole cloud with hidden words and authors from the question` (`hostView.cloud` має «лайка» з `hidden: true`, `by: ['Анна']`);
  - `the stage shows at most cloudShown words` (45 гравців з різними словами → 40 слів).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/views.wall-votes.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Потім `pnpm typecheck`: фабрики зрізів у тестах вебу отримують `wall: null`, `cloud: null`, `cloudVoters: null`, `me.wall: null`. Компоненти вебу ще не читають нових полів.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages apps/web/src
  git commit -m "feat(engine): public wall shows tile texts by position without groups, own found groups for each phone, wall rows for the host and on the reveal (the chooser's wall on a board cell), poll counts on the reveal, word cloud for the stage on the reveal without hidden words and for the host with authors"
  ```

### Задача 5. Сервер: `player:wall`, `host:cloud-hide`, голоси в історії без статистики

**Files:**
- Modify: `packages/shared/src/events.ts`, `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`, `apps/server/src/recorder.ts`, `apps/server/src/history.ts`, `apps/server/src/db/schema.ts`
- Test: `apps/server/src/socket.test.ts`, `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts`, `apps/server/src/profiles.test.ts`, `apps/server/src/achievements.test.ts`

**Interfaces:**
- Produces (`events.ts`):
  ```ts
  /** Вибір плиток стіни: позиції в порядку показу (10d). */
  export const wallSchema = z.object({ tiles: z.array(z.number().int().min(0).max(15)).min(3).max(4) });
  /** Сховати чи повернути слово «хмари» (10d). */
  export const cloudHideSchema = z.object({ key: z.string().min(1).max(LIMITS.cloudWord * 2), hidden: z.boolean() });
  // ClientToServerEvents:
  'player:wall': (payload: z.infer<typeof wallSchema>, ack: Ack) => void;
  'host:cloud-hide': (payload: z.infer<typeof cloudHideSchema>, ack: Ack) => void;
  ```
- Produces (`manager.ts`):
  - `wall(room, playerId, tiles): AckResult` → `this.apply(room, guessWall(room.state, playerId, tiles, this.now()))` (за зразком `sort()`);
  - `HostAction` + `| { type: 'cloud-hide'; key: string; hidden: boolean }` → `hideCloudWord(state, key, hidden)`.
- Produces (`socket.ts`):
  - `on('player:wall', …)` за зразком `player:sort` (`wallSchema.safeParse`);
  - `on('host:cloud-hide', …)` за зразком подій пульта з даними (`isHost` інакше `FORBIDDEN`).
- Produces (`db/schema.ts`):
  ```ts
  /** Номер рядка answer для голосу в запитанні без балів (опитування, хмара, 10d): не відповідь для статистики. */
  export const VOTE_ATTEMPT = -3;
  ```
- Changes (`recorder.ts`, `answerRows`): якщо `isUnscored(state.plays[index].question)` — `attempt: VOTE_ATTEMPT`, решта рядка як зараз (`payload`, `timeMs`, `accepted: false`, `points: 0`).
- Changes (`history.ts`):
  - `playerGames`:
    - `answered` і `marks` — без рядків `VOTE_ATTEMPT`. `correct` і так рахує лише `accepted`;
    - `questionsPlayed: row.game.questionsPlayed − unscoredPlayed(row.game.quizSnapshot, row.game.plays, row.game.questionsPlayed)`;
  - нова функція (без розбору схемою, бо профіль читає всі ігри):
    ```ts
    /** Скільки з перших questionsPlayed запитань журналу — без балів (опитування, хмара). Старі ігри без журналу — 0. */
    function unscoredPlayed(snapshot: unknown, plays: PlayRef[] | null, questionsPlayed: number): number;
    ```
    Вона йде `plays.slice(0, questionsPlayed)`, бере `snapshot.rounds[ref.roundIndex].questions` (лише масив; поле — пропуск) і шукає `id === ref.questionId` з `isUnscored`;
  - `gameTables`: рядки з `attempt === VOTE_ATTEMPT` відкидаються (досягнення «бліц», «камбек», «влучив у фінал» їх і не бачили б, але так надійніше);
  - `hostGame` без змін: голоси йдуть у `responses` (ведучий бачить, хто що вибрав), `answered` рахує голоси, `accepted` — 0.

- [ ] **Step 1: Write the failing tests.**
  - `socket.test.ts`:
    - `player:wall finds a group and the phone gets it by position` (класика зі стіною; гравець надсилає позиції групи — їх тест бере з кімнати на сервері через `manager` / доступ до стану, як інші тести сокетів, — ack `{ ok: true }`; наступний `state` має `me.wall.found.length === 1`);
    - `player:wall: bad payload — invalid; the host cannot send it`;
    - `no socket frame to a phone carries the wall groups` (збирати всі `state` гравця до `reveal`: жоден не містить назв груп і `"groups"`);
    - `host:cloud-hide hides a word from the stage` (хмара, два гравці пишуть слова, `host:lock`, далі `host:next` — розкриття; `host:cloud-hide { key: 'лайка', hidden: true }` → наступний `state` сцени без «лайка»; гравець → `FORBIDDEN`).
  - `recorder.test.ts`: `poll and cloud votes are stored with attempt VOTE_ATTEMPT, zero points and the payload` (рядок `{ attempt: -3, accepted: false, points: 0, payload: { type: 'wordcloud', words: [...] } }`); відповідь на стіну — `attempt 0`, `payload.type === 'wall'`.
  - `history.test.ts`, `describe('history: wall, poll and cloud (10d)')`. Тест `history shows wall results, poll and cloud votes; votes do not count as answers`:
    - класика `[wall, poll, cloud, single]`; Оля — 2 групи (500, `accepted: true`), голос «Літо», слова «каштани», правильна `single`; Петро — 1 група (250, `false`), голос «Весна», «Дніпро», неправильна `single`;
    - деталі ведучого: `responses` опитування й хмари мають голоси; `answered` опитування = 2, `accepted` = 0;
    - `playerGames` Олі: `correct` 2, `answered` 2, `questionsPlayed` 2 (4 зіграні − 2 без балів); `marks` без рядків −3.
  - `profiles.test.ts`: та сама гра → точність Олі 100 %, Петра 0 % (без опитувань знаменник — 2).
  - `achievements.test.ts`: `a poll between correct answers keeps the best streak and the perfect game` (5 правильних, між ними 2 голоси → `bestStreak` 5, `isPerfect` true).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсом.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src/events.ts apps/server/src
  git commit -m "feat(server): player:wall guesses tiles by position, host:cloud-hide hides a cloud word; poll and cloud votes are stored as VOTE_ATTEMPT rows that never count for accuracy, answered questions, streaks or the perfect game"
  ```

### Задача 6. Демо: стіни, опитування й хмара

**Files:**
- Modify: `apps/server/scripts/demo-quiz.ts`, `apps/server/scripts/demo-quiz.test.ts`

**Interfaces:**
- Produces (`demo-quiz.ts`):
  ```ts
  /** groups: [назва, плитки][]; 4 групи по 4 або 3 по 3. Id плиток — наскрізні id('t'), не з назви групи. */
  export const wall = (text: string, groups: [string, string[]][], mistakes = LIMITS.defaultWallMistakes, points?: number, time = LIMITS.defaultWallTime): Question;
  export const poll = (text: string, options: string[], time = 20): Question;
  export const cloud = (text: string, words = LIMITS.maxCloudWords, time = 30): Question;
  ```
- Демо `demo` отримує:
  - у `r-warmup` (у кінці раунду):
    - `poll('Яка пора року найкраща для вікторини?', ['Весна', 'Літо', 'Осінь', 'Зима'])`;
    - `cloud('Одним словом: з чим у вас асоціюється Київ?')`;
  - у `r-x3` — `wall('Стіна зв'язків: знайдіть чотири четвірки', …)`:
    - `['Річки України', ['Дніпро', 'Десна', 'Рось', 'Псел']]`;
    - `['Вершини Карпат', ['Говерла', 'Петрос', 'Піп Іван', 'Бребенескул']]`;
    - `['Озера', ['Світязь', 'Синевир', 'Ялпуг', 'Кагул']]`;
    - `['Острови', ['Хортиця', 'Джарилгач', 'Зміїний', 'Бірючий']]`;
  - у `r-board-phone`, категорія `c-geo` — `cell(wall('Швидка стіна', …, 2, 600, 60))`:
    - `['Фрукти', ['Яблуко', 'Груша', 'Слива']]`;
    - `['Птахи', ['Сова', 'Лелека', 'Чапля']]`;
    - `['Метали', ['Мідь', 'Залізо', 'Олово']]`;
  - опис демо згадує стіну зв'язків, опитування й хмару слів.
- Наявні запитання не змінюються.

- [ ] **Step 1: Write the failing tests** у `demo-quiz.test.ts`:
  - `demo has a 4×4 wall in classic, a 3×3 wall on a phone board cell, a poll and a word cloud in the warm-up` (типи й місця; клітинка стіни — `kind 'normal'`, спосіб раунду `phone`);
  - уся вікторина проходить `quizSchema`; кількість раундів і запитань у межах `LIMITS`;
  - `the helpers build valid questions` (`wall` з 3 групами по 3; `poll` має `points: 0`; `cloud(…, 1)`); id плиток не містять назв груп.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/scripts` → FAIL.
- [ ] **Step 3: Implement** помічники й запитання демо.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/scripts
  git commit -m "feat(server): demo gets a 4×4 connections wall in classic, a 3×3 wall on a phone board cell, a poll and a word cloud in the warm-up"
  ```

### Задача 7. Телефон: стіна з вибором плиток, опитування, хмара, екран після голосу

**Files:**
- Create: `apps/web/src/screens/WallGrid.tsx`, `apps/web/src/screens/WallInput.tsx`, `apps/web/src/screens/CloudInput.tsx`, тести `WallGrid.test.tsx`, `WallInput.test.tsx`, `CloudInput.test.tsx`
- Modify: `apps/web/src/screens/AnswerInput.tsx`, `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/screens/Debuffs.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `AnswerInput.test.tsx`, `PlayerScreen.test.tsx`

**Interfaces:**
- Produces (`WallGrid.tsx`):
  ```tsx
  /**
   * Сітка стіни: спершу знайдені групи рядами (кольори .wall-color-0…3), далі решта плиток у порядку показу.
   * selected — позиції, вибрані гравцем; onToggle — дотик (немає — лише перегляд); shake — позиції для трусіння.
   */
  export function WallGrid(props: {
    wall: PublicWall;
    found: { tiles: number[]; color: number }[];
    selected?: number[];
    onToggle?: (position: number) => void;
    shake?: number[];
    big?: boolean;
  }): JSX.Element;
  ```
  - Плитка — `<button class="wall-tile" aria-pressed>` (перегляд — `<div>`), `aria-label` = текст.
  - Сітка `grid-template-columns: repeat(size, 1fr)`; клас `.is-long` для тексту довше 12 символів (менший шрифт).
  - Знайдена плитка — `.is-found .wall-color-N`, недоступна для дотику.
- Produces (`WallInput.tsx`):
  ```tsx
  export function WallInput(props: { question: PublicQuestion & { wall: PublicWall }; wall: PlayerWall; paused: boolean; send: Send }): JSX.Element;
  ```
  - Дотик вибирає плитку, повторний — знімає. Більше `size` вибрати не можна.
  - Рядок `t('wallPicked', { picked, size })` «Вибрано {picked} з {size}».
  - Кнопка `t('wallCheck')` «Перевірити» вимкнена, доки не вибрано `size` або `!canGuess` → `send('player:wall', { tiles: selected })`.
  - Помилки кружечками `.wall-mistakes` (`aria-label` `t('wallMistakes', { used, max })` «Помилок: {used} з {max}»).
  - Відповідь сервера:
    - `mistakes` зросло → трусіння вибраних (`shake`, 400 мс, без анімації за `prefers-reduced-motion`) і вибір знято;
    - `found` зросло → вибір знято;
    - `wall_repeat` → рядок `t('err_wall_repeat')`, вибір лишається;
  - Стан після кінця: `locked` → `t('wallLocked')` «Стіну замкнено: помилки скінчилися. Знайдено груп: {found}.»; `solved` → `t('wallSolved')` «Стіну складено! Останню групу склали за тебе.»
- Produces (`CloudInput.tsx`):
  ```tsx
  export function CloudInput(props: { words: number; onSubmit: (a: Answer) => void }): JSX.Element;
  ```
  - Одне поле (`maxLength LIMITS.cloudWord`, `aria-label` `t('cloudWordN', { n })` «Слово {n}»).
  - Кнопка `t('cloudMore')` «＋ Ще слово» додає поле до `words`.
  - `t('submit')` вимкнена, доки всі поля порожні → `{ type: 'wordcloud', words: непорожні обрізані }`.
  - Повтори в полях підсвічуються (`cloudKey`) з підписом `t('cloudSame')` «Це слово вже є».
- Changes:
  - `AnswerInput.tsx`: `case 'poll'` → кнопки варіантів (`ChoiceFace`, як `single`) → `{ type: 'poll', optionId }`; `case 'wordcloud'` → `CloudInput`; `case 'wall'` → `null` (стіну веде `PlayerScreen`, як сортування).
  - `PlayerScreen.tsx`:
    - на `question` для `wall` з `me.wall !== null` — `WallInput`; глядач на полі — `WallGrid` без дотиків з `view.wall.rows[0].tiles`;
    - після голосу (`isUnscored`) — `t('voteSent')` «Голос прийнято» і свій вибір / слова, без балів і без «правильно / неправильно»;
    - на розкритті без балів — `t('voteResultsOnStage')` «Результати — на екрані.» і свій вибір;
    - на розкритті стіни:
      - власна `WallGrid` (знайдені кольорами);
      - під нею правильні групи з назвами з `view.reveal` (`WallReveal` з задачі 8 — тут простий список назв і плиток, той самий компонент можна винести одразу, якщо зручно);
      - рядок результату `t('wallResult', { found, groups, points })`;
    - результат «+N балів» і кольорове миготіння (`verdict-blink`) для `poll`/`wordcloud` не показуються.
  - `Debuffs.tsx`: для `wall` обертання (як категорій сортування) не застосовується — повернути запитання без змін (коментар: «позиції плиток мають лишатися справжніми»).
  - `i18n.ts`: `wallPicked`, `wallCheck`, `wallMistakes`, `wallLocked`, `wallSolved`, `wallResult: 'Груп: {found} з {groups} · {points}'`, `wallFinishedOf: 'Закінчили стіну: {finished} з {total}'`, `cloudWordN`, `cloudMore`, `cloudSame`, `voteSent`, `voteResultsOnStage`.
  - `styles.css`:
    - `.wall-grid`, `.wall-tile` (≥ 44 px заввишки, перенос слів, `hyphens: auto`), `.wall-tile.is-selected`, `.wall-tile.is-found`, `.wall-color-0…3` (чотири контрастні кольори, читабельні в темній темі), `.wall-shake`, `.wall-mistakes`;
    - `.cloud-input`;
    - телефон 375 — без прокрутки вбік.

- [ ] **Step 1: Write the failing tests.**
  - `WallGrid.test.tsx`:
    - 16 плиток у порядку `tiles`;
    - знайдена група (позиції 3, 7, 9, 12) йде першим рядом з `.wall-color-0`, решта — в порядку показу;
    - без `onToggle` плитки не кнопки.
  - `WallInput.test.tsx`:
    - «Перевірити» вимкнена до 4 вибраних; п'ятий дотик нічого не вибирає;
    - «Перевірити» → `send('player:wall', { tiles: [вибрані позиції] })`;
    - зміна пропсів `mistakes` 0 → 1 → вибір знято, `.wall-shake` на вибраних;
    - `locked` → «Стіну замкнено…», кнопки немає;
    - відповідь `wall_repeat` → «Цей набір ти вже пробував.»;
    - пауза → кнопка вимкнена.
  - `CloudInput.test.tsx`:
    - «＋ Ще слово» двічі → три поля, далі кнопки немає (`words: 3`);
    - «Каштани» і « каштани » → «Це слово вже є»;
    - надсилання → `{ type: 'wordcloud', words: ['Каштани', 'Дніпро'] }`.
  - `AnswerInput.test.tsx`: опитування — дотик «Літо» → `{ type: 'poll', optionId: 'b' }`.
  - `PlayerScreen.test.tsx`:
    - стіна на `question`: сітка з 16 плиток і «Перевірити»; на розкритті — групи з назвами й «Груп: 2 з 4 · 500»;
    - опитування після голосу: «Голос прийнято», немає «балів» і `verdict` класів; розкриття — «Результати — на екрані.»;
    - глядач на клітинці зі стіною бачить сітку без кнопок.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсом.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): connections wall on the phone — pick tiles, check, mistakes as dots, shake on a miss, locked and solved states, groups with names on the reveal; poll buttons, word cloud input with up to three words, vote screens without points"
  ```

### Задача 8. Сцена, пульт, історія: розкриття стіни, стовпчики опитування, хмара, ховання слів

**Files:**
- Create: `apps/web/src/screens/WallReveal.tsx`, `apps/web/src/screens/WallTable.tsx`, `apps/web/src/screens/PollBars.tsx`, `apps/web/src/screens/WordCloud.tsx`, `apps/web/src/screens/HostCloud.tsx`, тести `WallReveal.test.tsx`, `PollBars.test.tsx`, `WordCloud.test.tsx`, `HostCloud.test.tsx`
- Modify: `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/HostScreen.tsx`, `apps/web/src/pages/GameHistory.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `StageScreen.test.tsx`, `HostScreen.test.tsx`, `History.test.tsx` (наявний тест сторінки історії)

**Interfaces:**
- Produces:
  ```tsx
  /** Правильні групи стіни: рядок на групу — назва й плитки, кольори .wall-color-N за порядком груп. */
  export function WallReveal(props: { question: Extract<Question, { type: 'wall' }>; big?: boolean }): JSX.Element;
  /** Таблиця стіни: нікнейм, груп (з позначкою «склав» / «замкнено»), помилок, бали (на reveal). */
  export function WallTable(props: { info: WallInfo }): JSX.Element;
  /** Стовпчики опитування: варіант, смуга шириною у відсоток, «{percent} % · {count}»; найпопулярніший підсвічений. */
  export function PollBars(props: { choices: Choice[]; counts: Record<string, number>; total: number; big?: boolean }): JSX.Element;
  /** Хмара: слова розміром за count (1 rem … 4,5 rem лінійно між найменшим і найбільшим), порядок — стабільний за хешем key. */
  export function WordCloud(props: { words: CloudWord[] }): JSX.Element;
  /** Хмара для пульта: кожне слово — кнопка «Сховати» / «Повернути» (aria-pressed = hidden), поруч кількість і автори в title. */
  export function HostCloud(props: { words: HostCloudWord[]; onHide: (key: string, hidden: boolean) => void }): JSX.Element;
  ```
  - `WordCloud` ставить найбільші слова ближче до середини (сортування за `count`, далі розкладка «середина-краї»), `flex-wrap: wrap; justify-content: center`. Кольори циклом з палітри. 40 слів уміщуються в 1280 × 720 без прокрутки (шрифт зменшується класом, якщо слів > 25).
- Changes (`StageScreen.tsx`):
  - `wall`:
    - на `question` — `WallGrid big` без дотиків і `t('wallOnPhone')` «Шукайте групи на телефоні», лічильник `t('wallFinishedOf', …)` з `answeredCount`;
    - на полі — стіна вибравшого з його знайденими групами (`view.wall.rows[0].tiles`);
    - на `reveal` — `WallReveal big` і `WallTable` (рядок «Правильна відповідь» не показується);
  - `poll`:
    - на `question` — варіанти, як в `single` (без лічильників), `t('answeredOf')` → `t('votedOf', { voted, total })` «Проголосували {voted} з {total}»;
    - на `reveal` — `PollBars big` з `stats.counts` і `stats.answered`; рядка «Правильна відповідь» немає;
  - `wordcloud`:
    - на `question` — `t('cloudOnPhone')` «Пишіть до {words} слів на телефоні» і «Написали {n} з {total}» (`cloudWrittenOf`);
    - на `reveal` — `WordCloud` з `view.cloud` і підпис `t('cloudCaption', { voters })` «Написали {voters}»; порожня хмара — `t('cloudEmpty')` «Ніхто нічого не написав».
- Changes (`HostScreen.tsx`):
  - кнопки оцінки («Правильно» / «Неправильно» / «Частково») не показуються для `wall`, `poll`, `wordcloud`; рядок відповіді — `answerText`;
  - кнопка розкриття для `poll`/`wordcloud` — `t('revealVotes')` «Показати результати»;
  - `wall` — панель `.host-wall`:
    - `WallReveal` з `view.correct` (ведучий бачить групи завжди);
    - `WallTable` з `view.wall` наживо;
  - `poll` — `PollBars` з лічильників, порахованих з `view.responses` (з етапу `question`);
  - `wordcloud` — `HostCloud` з `view.cloud` → `act('host:cloud-hide', { key, hidden })`; підказка `t('cloudHideHint')` «Торкніться слова, щоб сховати його з екрана. Ще дотик — повернути.»
- Changes (`GameHistory.tsx`):
  - `wall` — `WallReveal` (малий);
  - `poll` — `PollBars` з лічильників за `responses`;
  - `wordcloud` — список слів з кількістю (зведення через `cloudKey` з `responses`);
  - для `poll`/`wordcloud` замість `answeredStat` — `t('votedStat', { voted })` «Проголосували: {voted}».
- `i18n.ts`: `wallOnPhone`, `votedOf`, `cloudOnPhone`, `cloudWrittenOf`, `cloudCaption`, `cloudEmpty`, `revealVotes`, `cloudHideHint`, `cloudHide: 'Сховати «{word}»'`, `cloudShow: 'Повернути «{word}»'`, `votedStat`, `wallTableGroups: 'Груп'`, `wallTableMistakes: 'Помилок'`, `wallTableSolved: 'склав'`, `wallTableLocked: 'замкнено'`, `pollPercent: '{percent} % · {count}'`.
- `styles.css`: `.wall-reveal`, `.wall-table`, `.poll-bars` (смуга з `transition` і `prefers-reduced-motion`), `.word-cloud`, `.host-cloud` (сховане — перекреслене й бліде), `.host-wall`. Сцена 1280 × 720 без прокрутки для 4×4 і для 40 слів.

- [ ] **Step 1: Write the failing tests.**
  - `WallReveal.test.tsx`: чотири рядки з назвами «Річки»… і плитками; кольори за порядком.
  - `PollBars.test.tsx`: `counts { a: 1, b: 3 }`, `total 4` → «75 % · 3» для «Літо», «25 % · 1» для «Весна», «0 % · 0» для «Осінь»; найбільший `.is-top`; `total 0` → усі 0 % без ділення на нуль.
  - `WordCloud.test.tsx`: слово з `count 5` має більший `font-size`, ніж з `count 1`; порядок однаковий між двома рендерами.
  - `HostCloud.test.tsx`: дотик «каштани» → `onHide('каштани', true)`; сховане слово має `aria-pressed="true"` і другий дотик → `onHide(key, false)`.
  - `StageScreen.test.tsx`:
    - стіна на `question`: 16 `.wall-tile`, жодного `.wall-color-*`, «Шукайте групи на телефоні»; на `reveal` — назви груп і рядки таблиці;
    - опитування на `reveal` — стовпчики з відсотками, немає «Правильна відповідь»;
    - хмара на `question` — «Пишіть до 3 слів на телефоні», без слів; на `reveal` — слова з `view.cloud`.
  - `HostScreen.test.tsx`:
    - стіна: групи з назвами й таблиця, немає кнопок «Правильно»;
    - опитування: живі стовпчики з `responses`, кнопка «Показати результати»;
    - хмара: дотик слова → `send('host:cloud-hide', { key, hidden: true })`.
  - `History.test.tsx`: гра зі стіною, опитуванням і хмарою: групи стіни, «Проголосували: 2», стовпчики, слова з кількістю.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсом.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): stage shows the wall without colours, then groups with names and a table of groups found; poll bars with percentages and a word cloud on the reveal; host sees groups, live wall rows, live poll bars and hides cloud words with one tap; history shows walls, polls and clouds"
  ```

### Задача 9. Редактор: стіна, опитування, хмара, обмеження клітинок, перевірки чернетки

**Files:**
- Create: `apps/web/src/editor/WallEditor.tsx`, `apps/web/src/editor/WallEditor.test.tsx`
- Modify: `apps/web/src/editor/QuestionEditor.tsx`, `apps/web/src/editor/BoardEditor.tsx`, `apps/web/src/editor/draft.ts`, `apps/web/src/editor/draft-storage.ts`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `QuizEditor.test.tsx`, `BoardEditor.test.tsx`, `draft.test.ts`, `draft-storage.test.ts`

**Interfaces:**
- Produces (`WallEditor.tsx`):
  ```tsx
  export function WallEditor({ question, onChange }: { question: Extract<Question, { type: 'wall' }>; onChange: (q: Question) => void }): JSX.Element;
  ```
  - Розмір — група `aria-pressed`: «4×4» (`wallSize4`), «3×3» (`wallSize3`).
    - 4 → 3 обрізає останню групу й останню плитку кожної групи. Якщо там був текст — спершу `confirm(t('wallShrinkConfirm'))` «Остання група й останні плитки зникнуть. Продовжити?».
    - 3 → 4 додає порожню групу й порожню плитку кожній групі.
  - Картка групи `.wall-group-edit` з кольором `.wall-color-N`:
    - поле «Назва групи {n}» (`wallGroupName`, `maxLength LIMITS.wallGroupName`, підказка `t('wallGroupNameHint')` «Гравці побачать назву лише на розкритті.»);
    - `n` полів «Плитка {k}» (`wallTileN`, `maxLength LIMITS.wallTile`) у `.pair`-сітці (2 в ряд на 375 px).
  - `NumberField` «Помилок до замикання» (`wallMistakesField`, 1…5).
  - Рядок `t('wallPointsHint', { per, max })` «Кожна група — {per} балів. Остання складається сама, тож за всю стіну — {max}.» (рахувати з `points` і `n`).
  - Порада `t('wallOrderHint')` «Пишіть групи як завгодно: гравці побачать плитки перемішаними.»
- Changes (`QuestionEditor.tsx`):
  - `Body`:
    - `case 'wall'` → `<WallEditor />`;
    - `case 'poll'` → рядки варіантів, як у `single`, але без позначки «правильний» (наявні `Rows` + `OptionImage`; якщо тіло `single` уміє `mark: 'none'`, використати його), підказка `t('pollHint')` «Правильної відповіді немає: сцена покаже, скільки відсотків вибрали кожен варіант.»;
    - `case 'wordcloud'` → `NumberField` «Слів від гравця» (`cloudWordsField`, 1…3) і `t('cloudHint')` «Однакові слова зводяться без урахування регістру. Непристойне слово ви сховаєте з пульта одним дотиком.»;
  - для `poll`/`wordcloud` поле ціни не показується (`showPoints` false); замість нього `t('noPointsNote')` «Без балів: не впливає на таблицю й точність.»;
  - для `wall` не показується `VideoField`.
- Changes (`BoardEditor.tsx`): тип `wall` → клітинка `{ kind: 'normal', answerMode: 'phone', penalty: 'none' }` і `t('wallCellNote')` «Стіну складають лише з телефона на звичайній клітинці.» замість вибору виду й способу (як `sortCellNote`).
- Changes (`draft.ts`):
  - `cleanQuestion`: назви груп, плитки й варіанти обрізаються;
  - `problemKey`:
    - `wall`:
      - порожня назва або плитка → `problemWallEmpty` «Запитання {index}: заповніть назву й плитки кожної групи.»;
      - повтор плитки → `problemWallDuplicate` «Запитання {index}: плитка «{tile}» повторюється.»;
      - ціна понад межу не можлива (`points ≤ 2000` — наявна перевірка);
    - `poll`: порожній варіант — наявне речення варіантів `single`;
  - `problemsOf` (місце):
    - `wall` у бліці, фіналі, на бліц- чи усній клітинці → `problemWallPlace` «Запитання {index}: стіна зв'язків діє лише в класиці й на звичайній клітинці поля з телефона.»;
    - `poll`/`wordcloud` поза класикою → `problemVotePlace` «Запитання {index}: опитування й хмара слів — лише в класичному раунді.»
- Changes (`draft-storage.ts`, `revive`):
  - `wall`: групи — масив об'єктів з рядками або 4 порожні групи по 4. Довжини вирівнюються до розміру за кількістю груп (3 чи 4, інакше 4). `mistakes` — через `numberOr`;
  - `poll`: варіанти — як у `single`;
  - `wordcloud`: `words` — через `numberOr`, типово 3;
  - для обох `points: 0`.
- `i18n.ts`: усі ключі, названі вище: `wallSize4`, `wallSize3`, `wallShrinkConfirm`, `wallGroupName`, `wallGroupNameHint`, `wallTileN`, `wallMistakesField` (ключ `wallMistakes` уже зайнятий у задачі 7), `wallPointsHint`, `wallOrderHint`, `pollHint`, `cloudWordsField`, `cloudHint`, `noPointsNote`, `wallCellNote`, `problemWallEmpty`, `problemWallDuplicate`, `problemWallPlace`, `problemVotePlace`.

- [ ] **Step 1: Write the failing tests.**
  - `draft.test.ts`:
    - стіна з порожньою плиткою → `problemWallEmpty`; з плитками «Дніпро» і «дніпро» → `problemWallDuplicate` з `tile: 'дніпро'`; повна — `[]`;
    - стіна на усній клітинці → `problemWallPlace`; на звичайній з телефона — без проблем;
    - опитування в бліці → `problemVotePlace`.
  - `draft-storage.test.ts`: стіна з 3 групами, де одна має 4 плитки, відновлюється як 3×3 з проблемою або обрізаною плиткою (вирівнювання); `wordcloud` з `words: 'x'` → 3.
  - `WallEditor.test.tsx`:
    - «3×3» → `onChange` з 3 групами по 3; з текстом в останній групі спершу `confirm` (мок → `false` нічого не змінює);
    - «4×4» з 3×3 → 4 групи по 4 з порожніми полями;
    - зміна «Назва групи 1» і «Плитка 2» → `onChange` з новими значеннями;
    - «Помилок до замикання» = 5 → `mistakes: 5`;
    - підказка «Кожна група — 250 балів… за всю стіну — 750.» для ціни 1000.
  - `QuizEditor.test.tsx`:
    - чип «стіна» → чотири картки груп, «Помилок до замикання», немає поля відео; заповнення й «Зберегти» шле `{ type: 'wall', groups: [...4], mistakes: 3, timeLimit: 90 }`;
    - чип «опитування» → немає поля ціни, є «Без балів…»; збережене має `points: 0`;
    - чип «хмара» → «Слів від гравця» = 3;
    - у бліці немає чипів «стіна», «опитування», «хмара»; у полі немає «опитування» й «хмара».
  - `BoardEditor.test.tsx`: тип «стіна» на усній клітинці перемикає її на звичайну з телефона й показує «Стіну складають лише з телефона…».
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/editor` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсом. На 375 px картки груп — на всю ширину, плитки по дві в ряд (`.pair`).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): editor for the connections wall (4×4 or 3×3, group names, tiles, mistake limit, points per group), polls without a correct option and word clouds without points; board cell rules and draft checks"
  ```

### Задача 10. Довідка ведучого: стіна, опитування, хмара, оновлені записи бафів, дебафів, клітинок, раундів і налаштувань

**Files:**
- Modify: `apps/web/src/help/questions.ts`, `apps/web/src/help/powers.ts`, `apps/web/src/help/cells.ts`, `apps/web/src/help/rounds.ts`, `apps/web/src/help/settings.ts`, `apps/web/src/screens/HostScreen.tsx`
- Test: `apps/web/src/help/host-help.test.ts`, `HostScreen.test.tsx`

**Interfaces:**
- `questions.ts` (записи, вписані в задачі 1; тут звірити з рушієм і доповнити):
  - `wall`:
    - `title: 'Стіна зв'язків'` (= `t('type_wall')`);
    - «Що це»: «Плитки треба розкласти на групи зі спільним зв'язком; самі зв'язки гравці мають вгадати.»;
    - «Як іде в грі»:
      - ви задаєте 4 групи по 4 плитки або 3 по 3 і назву кожного зв'язку;
      - гравці бачать ті самі плитки, перемішані так, що жоден ряд не є готовою групою;
      - гравець вибирає 4 (або 3) плитки й натискає «Перевірити»: правильна група фарбується й закріплюється, неправильна — помилка;
      - коли лишилася одна група, вона складається сама;
      - після ліміту помилок стіна для гравця замикається;
      - на розкритті сцена показує групи з назвами і скільки груп знайшов кожен;
      - відмінність від сортування: там категорії відомі, тут їх треба вгадати;
    - «Бали»:
      - «Кожна знайдена група — ціна / кількість груп. Остання група складається сама й балів не дає: за всю стіну 4×4 — 75 % ціни, 3×3 — 67 %.»;
      - «Половина ціни й більше вважається правильною відповіддю (для 4×4 — від двох груп): вона йде в серію, точність і досягнення.»;
      - «Штраф «мінус» — лише тому, хто пробував і не знайшов жодної групи.»;
      - «Бонусу за швидкість немає. На полі — ціна клітинки × позначка × множник раунду.»;
    - «Порада»: «Додайте «пастку»: слово, що пасує до двох груп. Так стіна стає цікавою.», «Підніміть ціну: за всю стіну гравець отримає не більше трьох чвертей.», `Плитка — до ${LIMITS.wallTile} символів: на телефоні їх чотири в ряд.`;
    - «Обмеження»: «Лише класика й звичайна клітинка поля з телефона.», «Бафи на стіні не діють.», `Ліміт помилок — ${LIMITS.minWallMistakes}–${LIMITS.maxWallMistakes}, типово ${LIMITS.defaultWallMistakes}.`, «Без відео; аудіо й картинку можна.».
  - `poll`:
    - `title: 'Опитування'`;
    - «Що це»: «Варіанти без правильного: дізнайтеся, що думає зал.»;
    - «Як іде в грі»: гравці вибирають один варіант; сцена під час запитання показує, скільки проголосували; після «Показати результати» — стовпчики з відсотками; на пульті стовпчики видно наживо;
    - «Бали»: «Балів немає. Опитування не впливає на таблицю, серії, точність і досягнення; серія через нього не обривається.»;
    - «Порада»: «Добра розминка на початку або пауза між важкими раундами.», «Можна дати варіантам картинки.»;
    - «Обмеження»: «Лише класичний раунд.», «Бафи не діють; дебафи, куплені суперниками, чекають наступного запитання з балами.».
  - `wordcloud`:
    - `title: 'Хмара слів'`;
    - «Що це»: «Кожен гравець пише до трьох коротких слів, а сцена складає з них хмару: що частіше слово, то воно більше.»;
    - «Як іде в грі»:
      - кількість слів від гравця (1–3) задаєте ви;
      - однакові слова зводяться разом без урахування регістру, зайвих пробілів і виду апострофа;
      - одне слово від одного гравця рахується один раз;
      - пульт бачить хмару наживо, разом з авторами;
      - торкніться слова, щоб сховати його з екрана, ще дотик — повернути;
      - сцена показує хмару після «Показати результати» — без схованих слів, до `${LIMITS.cloudShown}` найчастіших;
    - «Бали»: «Балів немає; на таблицю, серії, точність і досягнення хмара не впливає.»;
    - «Порада»: «Запитання на асоціацію («з чим у вас асоціюється…») дає найкращу хмару.», «Хмару, що прозвучала, згодом можна буде взяти за дошку «100 до 1».» — **цей рядок додати лише разом із 10e**; у 10d — без нього;
    - «Обмеження»: `Слово — до ${LIMITS.cloudWord} символів.`, «Лише класичний раунд.», «Бафи не діють; дебафи чекають наступного запитання з балами.».
- `powers.ts`:
  - у кожного бафу (`BUFF_HELP.*.limits`), де перелічено місця без бафів (ланцюжок, сортування): + «стіна зв'язків, опитування, хмара слів». Якщо там спільний рядок — розширити його;
  - кожен дебаф (`DEBUFF_HELP.*.limits`): + спільний рядок «На опитуванні й хмарі слів дебаф не спрацьовує — чекає наступного запитання з балами.» (винести в константу файлу).
- `cells.ts`: `normal.limits` + «Стіна зв'язків — лише з телефона.»; `voice.limits` і `blitz.limits` + «Не для стіни зв'язків.».
- `rounds.ts`:
  - `classic.tip` + «Опитування чи хмара слів на початку — добрий спосіб розігріти зал (без балів).»;
  - `classic.how`/`limits` — згадка, що опитування й хмара лише тут;
  - `board.limits` + «Опитування й хмара слів недоступні: на полі відповідає один гравець.»;
  - `blitz.limits` і `final.limits` + «Стіна зв'язків, опитування й хмара слів тут недоступні.».
- `settings.ts`: `speedBonus` + «Не нараховується на стіні зв'язків.»; `leaderboard` (або запис таблиці «до кінця») + «Опитування й хмара не змінюють таблиці.».
- Пульт: панель `.host-wall` має `<HelpButton id="question.wall" />` біля заголовка, панель хмари — `<HelpButton id="question.wordcloud" />`, стовпчики опитування — `<HelpButton id="question.poll" />`. Кнопки «ⓘ» біля типу в `.host-context` (10a) уже ведуть на ці записи.

- [ ] **Step 1: Write the failing tests.**
  - `host-help.test.ts`:
    - наявні тести «кожен тип має запис» і «назви збігаються» тепер покривають `wall`, `poll`, `wordcloud`;
    - новий `10d entries tell the engine numbers`:
      - `question.wall.points` містить «75 %» і «67 %», а ці числа дорівнюють `Math.round(wallShare(4, 4) * 100)` і `Math.round(wallShare(3, 3) * 100)`;
      - `question.wall.limits` містить `${LIMITS.minWallMistakes}–${LIMITS.maxWallMistakes}`;
      - `question.wall.tip` містить `${LIMITS.wallTile}`;
      - `question.poll.points` і `question.wordcloud.points` містять «Балів немає»;
      - `question.wordcloud.how` містить `${LIMITS.cloudShown}` і «сховати»;
      - `question.wordcloud.tip` не містить «100 до 1» (з'явиться в 10e);
    - `related entries mention the new limits`:
      - `buff.double` — «стіна»;
      - кожен `debuff.*` — «опитуванні»;
      - `cell.normal` — «Стіна зв'язків»;
      - `round.board` — «Опитування»;
      - `round.blitz` і `round.final` — «стіна зв'язків»;
      - `setting.speedBonus` — «стіні».
  - `HostScreen.test.tsx`:
    - стіна → кнопка «Довідка: Стіна зв'язків» у панелі стіни;
    - хмара → «Довідка: Хмара слів»;
    - опитування → «Довідка: Опитування»;
    - натиск нічого не надсилає.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/help apps/web/src/screens/HostScreen.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Звірити кожне речення з рушієм задач 2–3 і з рішеннями плану.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "docs(web): host help for the connections wall (scoring with the free last group, mistake limit), polls and word clouds (no points, hiding words); buff, debuff, cell, round and speed-bonus entries updated; ⓘ on the host wall, poll and cloud panels"
  ```

### Задача 11. Наскрізний сценарій 10d з кадрами

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–10. Помічники: `open`, `register`, `join`, `field`, `shot`, `afterSplash`, `expectNoSideScroll`, `snapshot`, `problems`, `socketFrames`, `scoreOf`, `toNextQuestion`.
- Нові помічники у файлі:
  ```ts
  /** Торкається плиток стіни за текстами й натискає «Перевірити». */
  async function pickWall(page: Page, texts: string[]): Promise<void>;
  /** Кадри сокета до першого кадру з phase "reveal" для поточного запитання (для перевірки витоку). */
  const framesBeforeReveal = (frames: string[]) => frames.slice(0, Math.max(0, frames.findIndex((f) => f.includes('"phase":"reveal"'))));
  ```
  `pickWall` шукає `.wall-tile` за `aria-label`, торкається кожної, далі — кнопку «Перевірити».

- [ ] **Step 1: Add the scenario** у кінець файлу за зразком 10c:
  ```ts
  it('part 10d: wall, poll and word cloud — the editor builds a wall (375 px too), wall groups never leak to phones or the stage, the phone finds groups and locks at the limit, the stage reveals groups with names, poll bars and a word cloud on the reveal, the host hides a word', async () => {
    try {
      await wallPollCloudGame();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Підготовка `wallPollCloudGame()`:**
  1. `const host = await open('host10d', 1280, 900); await register(host, 'host', 'Ірина Ведуча', 'host10d@example.com');`
  2. Вікторина «Стіна й голоси 10d» через `POST /api/quizzes`, раунд `r1` класика (`speedBonus: false`, `DEFAULT_RULES`, `shuffleOptions: false`):
     - `w1` wall «Знайдіть зв'язки», 4×4, 90 с, 1000, `mistakes: 2`. Групи як у фікстурі рушія («Річки», «Гори», «Озера», «Острови»), але id плиток — `river-1` … (навмисно «промовисті», щоб перевірити, що id не виходять за сервер). Назва четвертої групи в запиті — `'Ост'`: редактор виправить її на «Острови»;
     - `p1` poll «Найкраща пора року?»: «Весна», «Літо», «Осінь», «Зима», 20 с;
     - `k1` wordcloud «Одним словом: з чим асоціюється Київ?», `words: 3`, 30 с.

  **Кроки з перевірками й кадрами (у такому порядку):**
  1. **Редактор (1280 × 900).** «Редагувати» у «Стіна й голоси 10d»:
     - **Запитання 1.** Видно чотири картки груп, «Помилок до замикання» = 2, «Кожна група — 250 балів… за всю стіну — 750.»
     - «Назва групи 4» = «Острови» → кадр `p10d-editor-wall`.
     - «Плитка 1» групи 2 = «Дніпро» → у панелі проблем «плитка «дніпро» повторюється» → повернути «Говерла».
     - 375 × 812: `expectNoSideScroll(host, 'p10d-editor-wall-375')` (кадр) → назад 1280 × 900.
     - **Запитання 2.** Поля ціни немає, є «Без балів…» → кадр `p10d-editor-poll`.
     - «Зберегти». `GET /api/quizzes/<id>`: у `w1` назва четвертої групи «Острови»; `p1.points === 0`.
  2. **Гра.**
     - «Грати» → `code`, `stageUrl`; `stage = open('stage10d', 1280, 720)` → `stage.goto(stageUrl)`; почати збирати `socketFrames(stage)`.
     - `olya = open('olya10d', 375, 812)`, `petro = open('petro10d', 375, 812)`, `join` обох; почати збирати `socketFrames(olya)` і `socketFrames(petro)`.
     - «Почати гру» → `afterSplash` → «Почати раунд» → `afterSplash(host, olya, petro, stage)`.
  3. **Стіна.**
     - Сцена: 16 `.wall-tile`, жодного `.wall-color-*`, «Шукайте групи на телефоні».
     - Оля: «Перевірити» вимкнена → `pickWall(olya, ['Дніпро', 'Десна', 'Рось', 'Псел'])` → перший ряд — `.wall-color-0` з цими плитками; «Помилок: 0 з 2».
     - Оля вибирає `['Говерла', 'Петрос', 'Світязь', 'Хортиця']`, «Перевірити» → «Помилок: 1 з 2», вибір знято.
     - Оля вибирає 2 плитки наступної групи (`'Світязь', 'Синевир'`) → кадр `p10d-phone-wall` (посеред стіни: одна група кольором, одна помилка, дві плитки вибрано) → `expectNoSideScroll(olya, 'p10d-phone-wall')`.
     - Оля довибирає `'Ялпуг', 'Кагул'` → «Перевірити» → дві групи.
     - Петро: дві різні неправильні четвірки → «Стіну замкнено…» (ліміт 2).
     - Оля: `pickWall(olya, ['Говерла', 'Петрос', 'Піп Іван', 'Бребенескул'])` → «Стіну складено!»; запитання закривається (обидва закінчили).
     - **Перевірка витоку:** жоден з `framesBeforeReveal` Олі, Петра й сцени не містить «Річки», «Гори», «Озера», «Острови», `"groups"`, `river-1`.
     - «Показати відповідь»:
       - сцена має чотири рядки `.wall-reveal` з назвами й таблицю: «Оля» — 4 груп «склав», «Петро» — 0 «замкнено» → кадр `p10d-stage-wall`;
       - `scoreOf(host, 'Оля') === 750`, Петро — 0;
       - телефон Олі: групи з назвами й «Груп: 4 з 4 · 750».
     - `toNextQuestion(host)`.
  4. **Опитування.**
     - Сцена: чотири варіанти, «Проголосували 0 з 2».
     - Оля — «Літо», Петро — «Літо»; телефон Олі: «Голос прийнято», немає «балів».
     - Пульт до розкриття: стовпчик «Літо» «100 % · 2».
     - «Показати результати»: сцена `.poll-bars`, «Літо» — «100 % · 2», «Весна» — «0 % · 0», немає «Правильна відповідь» → кадр `p10d-stage-poll`.
     - Рахунки не змінилися (Оля 750, Петро 0).
     - `toNextQuestion(host)`.
  5. **Хмара.**
     - Сцена: «Пишіть до 3 слів на телефоні», жодного слова.
     - Оля: «Каштани», «＋ Ще слово», «Лайкаслово» → «Відповісти».
     - Петро: « каштани », «Дніпро» → «Відповісти».
     - Пульт: хмара «каштани» (2), «Лайкаслово», «Дніпро».
     - Торкнутися «Лайкаслово» → воно перекреслене (`aria-pressed="true"`) → кадр `p10d-host-cloud-hide`.
     - «Показати результати»:
       - сцена `.word-cloud` має «каштани» (більший шрифт, ніж «Дніпро»), «Дніпро» і **не** має «Лайкаслово»;
       - жоден кадр сокета сцени й телефонів не містить «Лайкаслово» → кадр `p10d-stage-cloud`.
     - Торкнутися «Лайкаслово» ще раз → сцена показує його (повернення працює) → знову сховати.
     - Рахунки без змін.
  6. **Історія.** Пульт → «Завершити гру» → історія гри: групи стіни, «Проголосували: 2», стовпчики опитування, слова хмари.
  7. `expect(problems).toEqual([])`.

- [ ] **Step 2: Run** `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв.
  - Наявні сценарії шукають кнопки за назвою. Нові чипи «стіна», «опитування», «хмара» й кнопка «Показати результати» можуть зачепити `getByRole('button', { name: … })` без `exact` — тоді додати `exact`.
  - Переглянути кадри в `apps/server/e2e/artifacts/shots`:
    - редактор на 375 px: картки груп і плитки не вилазять за край, перемикач 4×4 / 3×3 не налазить;
    - телефон: 4 плитки в ряд читаються (довгі слова переносяться), «Перевірити» видно без прокрутки, кружечки помилок помітні;
    - сцена: стіна 4×4 і розкриття з таблицею вміщуються в 720 px; стовпчики з відсотками не обрізані; хмара без прокрутки, слова не накладаються;
    - пульт: хмара з перекресленим словом, кнопки ≥ 44 px.
- [ ] **Step 3: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 4: Commit**
  ```bash
  git add apps/server/e2e/full-game.e2e.ts
  git commit -m "test: part 10d end-to-end — editor builds a wall (375 px too); wall groups never reach phones or the stage before the reveal; the phone finds groups, misses and locks at the limit; the stage reveals groups with names and a table; poll bars and a word cloud on the reveal; the host hides and restores a word"
  ```

Після фінальної рецензії гілку злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`. **`GAME_STATE_VERSION` піднято до 4**, але `READABLE_STATE_VERSIONS = [2, 3, 4]`, тож кімнати, збережені до розгортання, відновлюються, і живі ігри пуш не обриває. Перевірка `live_room` не обов'язкова. Якщо рецензія змінить це рішення (стан 3 стане нечитабельним), то за правилом 14a спершу `SELECT count(*) FROM live_room;` у базі Render і пуш лише за 0.

У звіті власникові назвати рішення:
- **Стіна:**
  - 4×4 або 3×3, плитка до 20 символів, назва групи до 40, ліміт помилок 1–5 (типово 3);
  - плитки перемішані однаково для всіх, жоден ряд не є готовою групою; телефон надсилає позиції, групи й id плиток до розкриття не виходять за сервер;
  - бали: ціна / груп за групу, остання складається сама без балів (за всю стіну 75 % або 67 % ціни); від половини ціни — «правильно»; мінус лише тому, хто пробував і нічого не знайшов; бонусу швидкості немає;
  - повтор того самого неправильного вибору не рахується; назви груп — лише на розкритті;
  - бафи на стіні не діють (як на сортуванні); класика й звичайна клітинка поля з телефона.
- **Опитування й хмара:**
  - лише класика, без балів; серії, сумарний час, точність, «відповів на N», «бездоганна гра» й найдовша серія їх не бачать;
  - бафи не діють, дебафи чекають наступного запитання з балами;
  - результати на сцені — після «Показати результати» (ведучий встигає сховати слово); сховане слово ніколи не йде на сцену й телефони, його можна повернути;
  - до 3 слів по 24 символи, однакові зводяться без регістру, пробілів і виду апострофа; на сцені до 40 найчастіших.
- **Для 10e:** `cloudTally` рахує, скільки гравців назвали кожне слово, з найчастішим написанням; голоси лежать у стані гри й в історії (`VOTE_ATTEMPT`).
- **Формат стану:** `GAME_STATE_VERSION` 4 (поступ стіни, сховані слова), старі версії 2–3 читаються — пуш не обриває ігор. Міграцій немає.
- **Демо:** у «demo» — опитування й хмара в розминці, стіна 4×4 у класиці, стіна 3×3 на клітинці поля.
