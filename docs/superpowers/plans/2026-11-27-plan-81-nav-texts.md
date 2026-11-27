# План 81. Навігація, етап 6 «Тексти й дрібний лоск»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** усі українські тексти сторінок поза грою звертаються на «ти»; у меню слова біля значків на всіх ширинах, де вміщуються, а голі символи мають підписи; у легкому режимі на 320 px підписи нижнього меню не налазять один на одного (і в адмінському меню з шести пунктів); перемикання вкладок не смикає сторінку, «зменшити рух» поважається.

**Архітектура:** тексти — лише значення в `apps/web/src/i18n.ts` і `apps/web/src/help/help-uk.ts` (ключі ті самі); золотий файл `apps/web/src/__fixtures__/uk-golden.json` оновлюється разом зі значеннями, а змінені ключі записано в `CHANGED_81` (`apps/web/src/i18n.test.ts`) з тестом «81: змінені тексти звертаються на «ти»». Меню — лише CSS (`apps/web/src/styles.css`), перевірка — e2e-зонд `MENU_FITS_14A` у легкому режимі. Вкладки — стала висота смуги вкладок (CSS) і без анімацій за `prefers-reduced-motion`.

**Стек:** React 19, vitest + jsdom, playwright e2e.

**Специфікація:** `docs/superpowers/specs/2026-11-27-navigation-ux-design.md`, «Етап 6».

## Рішення будівельника

- **Що таке «поза грою».** Ключ змінюється, якщо його показують лише сторінки поза `/play`, `/host`, `/stage`, `/bot-host` (граф імпортів від сторінок у `AppRoutes`). Ключі, які показує і гра, і сторінка поза грою, лишаються як є; якщо сторінці поза грою потрібен «ти» — окремий ключ.
  - `/help/play` бере `buffGuide_*` з гри — для трьох рядків на «ви» (`retry`, `time`, `hint`) нові ключі `playHelpBuff_retry|time|hint`.
  - Поле «Ваше ім’я» спільне для входу в гру й реєстрації: для `/login` — новий ключ `loginNicknameLabel` «Твоє ім’я», телефон гравця лишається з «Ваше ім’я».
  - Помилки з сервера (`err_*`), які бувають і в грі (`err_unknown`, `err_internal`, `err_server_busy`, `err_restarting`, `err_rate_limited`), не змінюються; змінюються ті, що бувають лише поза грою (вхід, акаунт, імпорт, завантаження картинок, `err_too_many` з HTTP 429).
  - Звук і відео в редакторі (`melodyBlocked`, `melodyFailed`, `videoclipBlocked`, `videoclipFailed`) — спільні з грою, лишаються.
  - Довідка ведучого (`help-uk.ts`) — сторінка `/help`; ті самі записи відкриває «ⓘ» на пульті, але це довідка, а не ігровий текст — уся на «ти». Цитати ігрових екранів у довідці («Ви — шпигун», «Відповідайте вголос») і зразки запитань для гравців — як у грі.
- **«Ви» множини лишається**, де звертаються до кількох людей: «Ви ще не грали разом» (ти і друг), історії групи («ваші історії», «записуйте разом»), «Знаю вас як облуплених».
- **Рід.** Минулий час і прикметники з «ви» перебудовано без роду: «ви натиснули» → «натиснуто», «Помилилися» → «Помилка — …».
- **Меню телефона, легкий режим ≤ 400 px:** шрифт підпису від ширини екрана `clamp(0.5rem, 3.4vw, 0.8125rem)` (шість пунктів — `3.2vw`), `letter-spacing: -0.02em`, значок 1.125rem, дзвіночок 2rem: на 320 px «Вікторини» ≈ 51 px у пункті 55 px. Висота панелі та сама.
- **Верхнє меню (≥ 701 px) у легкому режимі чи з шістьма пунктами** на 701–1100 px гортало вбік: значок над словом, вужчі поля, «Вигляд» лише значком (назва — в `aria-label`); 1101–1280 px — лише вужчі поля. Слова біля значків лишаються на всіх ширинах.
- **Слова біля дзвіночка й «Вигляду»:** дзвіночок у меню компʼютера отримує слово «Вхідні» (`.menu-word`, `aria-hidden` — назва вже в `aria-label`), «Вигляд» більше не ховається за шириною 701–900 px. Чи вміщуються — вирішує `Menu`: до відмалювання й на кожну зміну ширини (ResizeObserver) знімає `is-tight`, міряє `scrollWidth > clientWidth` і, якщо панель ширша, ставить `is-tight` — лишаються значки. Так довгі назви інших мов («Bandeja de entrada») не дають прокрутки вбік. На телефоні дзвіночок — лише значок.
- **Голі символи:** перевірено кнопки з одним символом (×, ✕, ↑, ↓, ⋯, ‹, ›, ⤢) у редакторі, групах, оголошенні, адмінці, призах — у всіх уже є `aria-label` (або видиме слово поряд); змін не треба.
- **Знайдене e2e:** у легкому режимі на 320 px адмінка гортала вбік через приховану таблицю графіка (`table.sr-only` не стискається до 1 px) — таблиця тепер в обгортці `div.sr-only`.
- **Вкладки без стрибків:** смуги вкладок «Вікторини», «Історія», «Стрічка/Календар», адмінки — стала висота (`min-block-size`), однаковий відступ під ними, смуга прокрутки сторінки не зсуває вміст (`scrollbar-gutter: stable` на `html`), переходи вкладок — лише колір, і `prefers-reduced-motion: reduce` прибирає їх.

## Глобальні обмеження

- **`GAME_STATE_VERSION` не змінювати**, міграцій немає, ігрові екрани (тексти й розкладка) — без змін.
- Нові ключі — у 7 мовах (переклад той самий, що в ключа-джерела), `ADDED_81` у `i18n.test.ts`; `pnpm l10n check <lang>` для en, de, es, it, pl, ar.
- Prettier не запускати; `python3` — заглушка; `git stash` — ні. Тести — у передньому плані, по одному, `--maxWorkers=2`.
- Коміти англійською з «(81)» і рядками `Co-Authored-By`/`Claude-Session`. Не зливати й не пушити.

## Задачі

### Задача 1. Довідка ведучого на «ти»
- [ ] `help-uk.ts`: ≈190 значень; золотий `help/__fixtures__/help-uk-golden.json` з `helpEntry`; `host-help.test.ts`.
- [ ] Коміт `feat(web): host help speaks «ти» (81)`.

### Задача 2. Тексти сторінок поза грою на «ти»
- [ ] Кандидати — скрипт (слова «ви/вас/ваш…», наказовий спосіб на -іть/-йте/-те, дієслова на -ете/-ите) + класифікація за графом імпортів; кожне значення переписати й перечитати.
- [ ] `uk-golden.json` — нові значення; `CHANGED_81` + тест; нові ключі `loginNicknameLabel`, `playHelpBuff_*` у 7 мовах.
- [ ] Вебтести й e2e, що шукають старі тексти, — на нові.
- [ ] Коміти по областях (редактор; профіль, групи, виклики, вхід, адмінка; помилки).

### Задача 3. Меню: легкий режим 320 px, верхня панель, голі символи
- [ ] CSS (див. рішення); e2e: `MENU_FITS_14A` на 320/360/375 у легкому й звичайному режимі, світла й темна тема, звичайний акаунт і адмін (part31).
- [ ] Підписи до голих символів.

### Задача 4. Вкладки без стрибків
- [ ] Стала висота смуг вкладок, `scrollbar-gutter`, `prefers-reduced-motion`; тест CSS.

### Задача 5. Перевірка
- [ ] `pnpm build`, e2e файлів зі зміненими текстами, вебтести частинами, `pnpm typecheck`.

## Змінені ключі

Список — у кінці після виконання (додаток нижче).

### Додаток: змінені ключі (81)

**i18n.ts — 123 ключів** (у золотому файлі 62; усі — у `CHANGED_81`). Заміни слів у значенні:

- `noQuizzes`: «ваші» → «твої», «Створіть» → «Створи», «додайте» → «додай»
- `powersSwapNeedsSpares`: «додайте» → «додай»
- `questBuffNone` (поза золотим): «Увімкніть» → «Увімкни»
- `problemQuestPrompt` (поза золотим): «напишіть» → «напиши»
- `categorySparesLegacy`: «додасте» → «додаси»
- `powersSwapClassicEmpty`: «додайте» → «додай»
- `problemSparesEmpty`: «додайте» → «додай»
- `problemSpareDuplicate`: «Видаліть» → «Видали», «додайте» → «додай»
- `problemDuplicateIds`: «Видаліть» → «Видали», «додайте» → «додай»
- `problemBetsCut` (поза золотим): «Позначте» → «Познач»
- `problemAuctionCut` (поза золотим): «Позначте» → «Познач»
- `sliderZeroInvalid`: «Впишіть» → «Впиши», «залиште» → «залиш»
- `wordLadderHint` (поза золотим): «Задайте» → «Задай»
- `problemSortText`: «заповніть» → «заповни»
- `matchHint`: «Запишіть» → «Запиши»
- `orderHint`: «Запишіть» → «Запиши»
- `spellingHint`: «Додайте» → «Додай»
- `problemTitle`: «Дайте» → «Дай»
- `problemNoText`: «впишіть» → «впиши»
- `problemEmptyOption`: «заповніть» → «заповни», «приберіть» → «прибери»
- `problemEmptyPair`: «заповніть» → «заповни»
- `problemNoCorrect`: «позначте» → «познач»
- `problemNoAccepted`: «впишіть» → «впиши»
- `problemNumber`: «впишіть» → «впиши»
- `problemSliderRange`: «перевірте» → «перевір»
- `problemSliderCorrect`: «перевірте» → «перевір»
- `problemGeneric`: «перевірте» → «перевір»
- `problemEmptyWord`: «заповніть» → «заповни»
- `problemWordLadderEmpty` (поза золотим): «заповніть» → «заповни»
- `problemRules`: «перевірте» → «перевір»
- `problemDuelQuestion`: «заповніть» → «заповни»
- `problemDuelDuplicate`: «Додайте» → «Додай»
- `playedAs`: «ви грали як {nickname}» → «твій нік у грі — {nickname}»
- `versusTitle`: «Ви і» → «Ти і»
- `versusYouHigher_one`: «ви вище» → «ти вище»
- `versusYouHigher_few`: «ви вище» → «ти вище»
- `versusYouHigher_many`: «ви вище» → «ти вище»
- `versusYourAccuracy`: «у вас» → «у тебе»
- `versusGame`: «ви —» → «ти —»
- `signInToFollow`: «Увійдіть» → «Увійди»
- `thisIsYou`: «ваш» → «твій»
- `invitesTitle`: «Вас» → «Тебе»
- `surveyNoClouds`: «Додайте» → «Додай»
- `surveyCloudHint`: «вами» → «тобою»
- `surveyTotalOver`: «зменште» → «зменш»
- `problemSurveyCloud`: «виберіть» → «вибери», «введіть» → «введи»
- `bluffFactHint`: «Напишіть» → «Напиши»
- `problemBluffTruth`: «напишіть» → «напиши»
- `cluesVoiceHint`: «відкриваєте ви» → «відкриваєш ти»
- `cluesSelfVoiceNote`: «відкриваєте ви» → «відкриваєш ти»
- `pinImageFailed`: «Спробуйте» → «Спробуй»
- `pinTargetHint`: «Торкніться» → «Торкнися»
- `problemClueEmpty`: «заповніть» → «заповни»
- `problemCluesTime`: «дайте» → «дай», «зменште» → «зменш»
- `problemCluesSelfTime`: «дайте» → «дай»
- `problemCluesTimeVoice`: «дайте» → «дай»
- `problemPinImage`: «завантажте» → «завантаж», «виберіть» → «вибери»
- `wallOrderHint`: «Пишіть» → «Пиши»
- `cloudHint`: «ви сховаєте» → «ти сховаєш»
- `problemWallEmpty`: «заповніть» → «заповни»
- `problemMoreLessEmpty` (поза золотим): «заповніть» → «заповни»
- `problemDrawingWord` (поза золотим): «впишіть» → «впиши»
- `truthPresetHint` (поза золотим): «ви зможете» → «ти зможеш»
- `sudokuGenerateConfirm` (поза золотим): «Ваші» → «Твої»
- `sudokuMany` (поза золотим): «додайте» → «додай»
- `sudokuNone` (поза золотим): «перевірте» → «перевір»
- `crosswordUnplaced` (поза золотим): «Додайте» → «Додай», «замініть» → «заміни»
- `crosswordMissing` (поза золотим): «додайте» → «додай», «змініть» → «зміни»
- `crosswordHelp` (поза золотим): «ваших» → «твоїх», «лише ви» → «лише ти»
- `problemSudokuGrid` (поза золотим): «згенеруйте» → «згенеруй», «задайте» → «задай»
- `problemSudokuNone` (поза золотим): «перевірте» → «перевір»
- `problemSudokuMany` (поза золотим): «додайте» → «додай»
- `problemCrosswordWords` (поза золотим): «впишіть» → «впиши»
- `problemCrosswordKey` (поза золотим): «впишіть» → «впиши»
- `problemJigsawPhoto` (поза золотим): «додайте» → «додай»
- `problemJigsawGrid` (поза золотим): «виберіть» → «вибери»
- `jigsawPhotoNeed` (поза золотим): «Додайте» → «Додай»
- `jigsawCrop` (поза золотим): «перетягніть» → «перетягни»
- `jigsawCropHint` (поза золотим): «Перетягніть» → «Перетягни»
- `problemSpotdiffImages` (поза золотим): «додайте» → «додай»
- `problemSpotdiffSpots` (поза золотим): «позначте» → «познач»
- `problemSpotdiffSame` (поза золотим): «завантажте» → «завантаж»
- `spotdiffNeedOriginal` (поза золотим): «завантажте» → «завантаж»
- `spotdiffMarkHint` (поза золотим): «Торкніться другої» → «Торкнися другої», «перетягніть» → «перетягни», «Торкніться кола» → «Торкнися кола»
- `problemMemoryPairs` (поза золотим): «заповніть» → «заповни»
- `problemMelodyTrack` (поза золотим): «додайте» → «додай», «вкажіть» → «вкажи»
- `problemMelodyAccepted` (поза золотим): «впишіть» → «впиши»
- `melodyAcceptedHint` (поза золотим): «Додайте» → «Додай»
- `problemVideoclipLink` (поза золотим): «додайте» → «додай»
- `problemVideoclipAccepted` (поза золотим): «впишіть» → «впиши»
- `videoclipAcceptedHint` (поза золотим): «Додайте» → «Додай»
- `studioStickerNeedPick` (поза золотим): «Оберіть» → «Обери»
- `studioStickerNeedPlace` (поза золотим): «Оберіть» → «Обери»
- `studioStickerNoRoom` (поза золотим): «приберіть» → «прибери»
- `problemThinkWordEmpty` (поза золотим): «впишіть» → «впиши», «приберіть» → «прибери»
- `morelessStepHint` (поза золотим): «Задайте» → «Задай»
- `alikeEditorHint` (поза золотим): «ви зможете» → «ти зможеш»
- `problemSpyTeams` (поза золотим): «вимкніть» → «вимкни», «приберіть» → «прибери»
- `problemSpyWordEmpty` (поза золотим): «впишіть» → «впиши»
- `spyEditorHint` (поза золотим): «вашу підказку» → «твою підказку»
- `bankNone` (поза золотим): «ваших» → «твоїх»
- `challengeCopyFailed` (поза золотим): «виділіть» → «виділи»
- `challengeSignIn` (поза золотим): «Увійдіть» → «Увійди»
- `levelMapHere` (поза золотим): «Ви тут» → «Ти тут»
- `adminCardGrantPick` (поза золотим): «Оберіть» → «Обери»
- `adminCardGiftPick` (поза золотим): «Оберіть» → «Обери»
- `adminCardGiftNone` (поза золотим): «Вашому» → «твоєму», «створіть» → «створи»
- `adminCardDeleteType` (поза золотим): «Введіть» → «Введи»
- `adminGroupDeleteType` (поза золотим): «Введіть» → «Введи»
- `adminLogCsvCapped` (поза золотим): «звузьте» → «звузь»
- `crashHint`: «Спробуйте» → «Спробуй», «повідомте, що ви робили перед цим» → «повідом, що відбувалося перед цим»
- `err_account_not_linked`: «Увійдіть» → «Увійди»
- `err_google`: «Спробуйте» → «Спробуй»
- `err_too_many`: «Зачекайте» → «Зачекай»
- `err_email_taken`: «Спробуйте» → «Спробуй»
- `err_bad_email`: «Перевірте» → «Перевір»
- `err_wrong_address`: «Відкрийте» → «Відкрий», «додайте» → «додай»
- `err_storage_unavailable`: «Спробуйте» → «Спробуй»
- `err_io_newer` (поза золотим): «Оновіть» → «Онови», «спробуйте» → «спробуй»
- `err_io_unknown_file` (поза золотим): «Виберіть» → «Вибери»
- `err_io_csv_encoding` (поза золотим): «Збережіть» → «Збережи»
- `err_io_too_many_rows` (поза золотим): «розділіть» → «розділи»
- `err_delete_failed` (поза золотим): «спробуйте» → «спробуй»

Додатково: «заповни усі» → «заповни всі», «впиши усі» → «впиши всі», «Напиши у тексті» → «Напиши в тексті» (милозвучність).

**Нові ключі (`ADDED_81`):** `playHelpBuff_retry`, `playHelpBuff_time`, `playHelpBuff_hint`, `loginNicknameLabel`.

**Лишились на «ви» свідомо:** спільні з грою `err_unknown`, `err_internal`, `err_server_busy`, `err_restarting`, `err_rate_limited`, `err_game_not_found`, `melodyBlocked`, `melodyFailed`, `videoclipBlocked`, `videoclipFailed`, `nicknameLabel`, `buffGuide_*`; тексти запитань за замовчуванням, які бачать гравці (`sudokuDefaultText`, `crosswordDefaultText`, `jigsawDefaultText`, `memoryDefaultText`, `alikeDefaultText`, `spyDefaultText`); множина `versusNone`, `groupsEmpty`, `itemsEmpty`, `achievement_mind_reader`.

**help-uk.ts — 188 ключів:** `round.classic.how.0`, `round.classic.how.1`, `round.classic.tip.3`, `round.blitz.how.0`, `round.blitz.how.2`, `round.board.how.0`, `round.board.how.1`, `round.board.how.3`, `round.board.how.5`, `round.board.tip.0`, `round.board.tip.2`, `round.board.limits.5`, `round.final.how.1`, `round.final.how.2`, `round.final.tip.0`, `round.wipeout.how.2`, `round.wipeout.tip.0`, `round.wipeout.tip.2`, `round.survival.how.2`, `round.survival.how.3`, `round.survival.how.4`, `round.survival.how.5`, `round.survival.how.8`, `round.survival.tip.0`, `round.survival.tip.1`, `round.ladder.how.0`, `round.ladder.how.2`, `round.ladder.how.4`, `round.ladder.how.5`, `round.ladder.tip.0`, `round.ladder.tip.1`, `round.ladder.tip.2`, `round.bets.how.1`, `round.bets.tip.0`, `round.auction.how.2`, `round.auction.tip.0`, `round.truth.how.1`, `round.truth.how.4`, `round.truth.tip.0`, `round.puzzles.how.1`, `round.puzzles.tip.0`, `round.quest.how.2`, `round.quest.tip.0`, `round.think.tip.0`, `question.multi.tip.0`, `question.boolean.tip.0`, `question.text.how.2`, `question.text.tip.0`, `question.numeric.tip.0`, `question.numeric.tip.1`, `question.slider.how.0`, `question.slider.tip.0`, `question.clues.how.0`, `question.clues.how.6`, `question.clues.points.4`, `question.clues.tip.2`, `question.clues.limits.5`, `question.pin.how.0`, `question.pin.how.2`, `question.pin.tip.0`, `question.wall.how.0`, `question.wall.how.4`, `question.wall.tip.0`, `question.wall.tip.1`, `question.poll.what`, `question.survey.how.0`, `question.survey.how.1`, `question.survey.how.2`, `question.survey.how.4`, `question.survey.how.5`, `question.survey.tip.0`, `question.survey.tip.1`, `question.bluff.how.0`, `question.bluff.how.2`, `question.bluff.how.3`, `question.bluff.how.4`, `question.bluff.how.5`, `question.bluff.tip.1`, `question.wordcloud.how.0`, `question.wordcloud.how.4`, `question.order.tip.0`, `question.chain.tip.0`, `question.wordladder.tip.0`, `question.timedlist.tip.0`, `question.letterwords.how.0`, `question.moreless.tip.0`, `question.drawing.tip.0`, `question.sudoku.how.0`, `question.sudoku.how.1`, `question.sudoku.tip.0`, `question.crossword.what`, `question.crossword.how.0`, `question.crossword.how.2`, `question.crossword.tip.0`, `question.jigsaw.how.0`, `question.jigsaw.how.1`, `question.jigsaw.tip.0`, `question.spotdiff.how.0`, `question.spotdiff.tip.0`, `question.memory.how.0`, `question.memory.tip.0`, `question.melody.how.0`, `question.melody.tip.0`, `question.melody.tip.1`, `question.videoclip.how.0`, `question.videoclip.tip.0`, `question.videoclip.tip.2`, `question.think.how.0`, `question.thinkalike.how.0`, `question.thinkalike.tip.0`, `question.thinkalike.tip.1`, `question.spy.tip.0`, `cell.normal.tip.0`, `cell.blitz.how.0`, `cell.blitz.how.1`, `cell.blitz.how.2`, `cell.voice.what`, `cell.voice.how.1`, `cell.voice.how.2`, `cell.voice.how.3`, `cell.marks.tip.0`, `buff.hint.how.2`, `buff.hint.tip.0`, `buff.swap.tip.0`, `buff.risk.points.3`, `buff.letter.how.2`, `buff.guard.tip.0`, `debuff.shake.how.0`, `debuff.fog.how.0`, `debuff.freeze.how.0`, `debuff.mirror.how.0`, `debuff.mirror.tip.0`, `debuff.guests.how.0`, `debuff.mud.how.0`, `debuff.flip.how.0`, `debuff.torch.how.0`, `debuff.sticky.how.0`, `debuff.noclock.how.0`, `debuff.bubbles.how.0`, `setting.newcomers.how.0`, `setting.newcomers.tip.0`, `setting.family.how.1`, `setting.pacing.how.2`, `setting.pacing.tip.0`, `setting.live.what`, `setting.live.how.5`, `setting.live.points.0`, `setting.live.tip.0`, `setting.live.tip.1`, `setting.scores.how.1`, `setting.scores.tip.0`, `setting.undo.what`, `setting.undo.how.4`, `setting.undo.points.2`, `setting.undo.points.3`, `setting.undo.tip.0`, `setting.away.points.1`, `setting.appeal.how.2`, `setting.appeal.tip.0`, `setting.appeal.tip.1`, `setting.description.what`, `setting.description.tip.0`, `setting.speedBonus.tip.0`, `setting.debuffShop.how.3`, `setting.debuffShop.tip.1`, `setting.levelBonuses.how.0`, `setting.levelBonuses.how.1`, `setting.levelBonuses.tip.0`, `setting.duels.how.1`, `setting.duels.how.2`, `setting.partial.what`, `setting.partial.how.0`, `setting.reveal.tip.0`, `setting.autopilot.how.0`, `setting.autopilot.tip.0`, `team.play.how.0`, `team.play.how.1`, `team.host.what`, `team.host.how.0`, `team.host.tip.0`, `team.pick.how.2`, `team.random.how.2`, `team.random.tip.0`, `team.captain.tip.0`, `team.answerer.how.0`, `team.formats.how.2`, `team.formats.tip.0`, `setting.groups.how.2`.
