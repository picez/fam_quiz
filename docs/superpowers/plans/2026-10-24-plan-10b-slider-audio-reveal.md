# План 10b: повзунок, аудіо, картинка, що проявляється

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 10b специфікації (розділ 6) і спільні правила розділу 14a, що її стосуються.
- **Повзунок (`slider`)** — новий тип запитання. Ведучий задає мінімум, максимум, крок, правильне значення, одиницю (необов'язково), допуск і, за бажання, межу нуля («нуль балів далі ніж ±N»). Гравець тягне повзунок, бачить велике число й підтверджує кнопкою. На розкритті сцена показує шкалу з позначками всіх гравців і правильним значенням. Дозволений скрізь, де дозволене «число».
- **Аудіо** — вкладення до запитання будь-якого типу: завантажений файл (mp3, ogg, m4a, до 5 МБ) із секундою початку й тривалістю фрагмента або YouTube у режимі «лише звук» (теж із тривалістю). Звук грає на сцені; якщо сцена не відкрита — на пульті. На пульті є «Програти ще раз» і «Стоп». Телефони звук не відтворюють. Фрагмент коротший за час запитання — таймер іде паралельно; довший — таймер стартує після фрагмента.
- **Картинка, що проявляється** — режим картинки запитання: «звичайна», «з пікселів», «з розмиття». Картинка стає чіткою за час запитання на сцені й телефонах; гравець відповідає один раз; бали від 100 % ціни (миттєва відповідь) до 30 % (мить повного проявлення), без бонусу за швидкість. Діє в запитаннях «один варіант», «текст», «число»; у класиці й на полі.
- **Що вважається правильним (14a):** у повзунку й картинці, що проявляється, правильна відповідь — та, що дала щонайменше половину ціни. Це живить серії, точність профілю й досягнення.
- **Довідка ведучого:** запис для типу `slider` (typecheck вимагає), записи налаштувань `setting.audio` і `setting.reveal` з «ⓘ» у редакторі й на пульті, оновлені записи, яких торкаються нові правила.

**Архітектура:**
- **Shared (`packages/shared/src/quiz.ts`, `answer.ts`, `views.ts`, `events.ts`, `game.ts`).**
  - `questionSchema` + гілка `slider` (`min`, `max`, `step`, `correct`, `tolerance`, `zeroBeyond?`, `unit?`); `QUESTION_TYPES` + `'slider'`; `SIMPLE_TYPES` + `'slider'`.
  - У `base` запитання — необов'язкові `audio?: QuestionAudio` і `reveal?: 'pixels' | 'blur'`. Відео й аудіо разом не можна.
  - Нові константи: `AUDIO_LIMITS`, `AUDIO_URL`, `LIMITS.sliderUnit`, `LIMITS.maxSliderSteps`, `LIMITS.minAudioSeconds`, `LIMITS.maxAudioSeconds`, `LIMITS.defaultAudioSeconds`, `REVEAL_TYPES`, `REVEAL_MIN_SHARE`.
  - Нові чисті функції (живлять і рушій, і веб): `sliderShare`, `audioLeadMs`, `answerWindowMs`, `revealShare`, `builtInPartial`.
  - `answerSchema` + `{ type: 'slider', value }`.
  - `PublicQuestion` + `slider`, `audio`, `reveal`; `StageView`/`HostView` + `sliderMarks`; `StateMeta` + `stageOnline`; подія `host:audio` і серверна `audio`; `BuffBlock` + `'unfit_reveal'`.
- **Рушій (`packages/engine`).**
  - `check.ts`: `checkAnswer` для `slider`; новий `verdictOf(question, answer, timeMs)` — частка з урахуванням проявлення, `accepted` і `grade` за правилом 14a.
  - `game.ts`: класика й поле беруть `verdictOf`; на полі вбудовані часткові бали не залежать від правила «частково»; бонус за швидкість вимкнено для картинки, що проявляється; серія рахується за `grade === 'correct'`.
  - `timing.ts`: межа часу — `answerWindowMs` (час запитання + тривалість довшого фрагмента).
  - `buffs.ts`: «Друга спроба» на картинці, що проявляється, — `unfit_reveal`; голоси залу для повзунка.
  - `views.ts`: публічні поля (без правильного значення); джерело аудіо — лише сцені й пульту; `sliderMarks` для сцени (на розкритті) і пульта; `audioOf(state)`.
- **Сервер.**
  - `POST /api/uploads/audio` (mp3/ogg/m4a за вмістом, до 5 МБ); `/uploads/:name` віддає й аудіо, з підтримкою `Range` (Safari інакше не грає).
  - Сховище (`storage/images.ts`, `r2.ts`) приймає назви й типи аудіо.
  - Сокет `host:audio` → менеджер перевіряє, що поточне запитання має аудіо, і розсилає `audio` сцені й пульту. Стан гри не змінюється.
  - `StateMeta.stageOnline`: менеджер рахує з'єднання сцени, пульт дізнається, чи грати звук самому.
  - Історія, профіль і досягнення читають `accepted`, який рушій уже рахує за 14a. Окремих змін у них немає, лише тести.
  - Демо `demo` отримує повзунок і YouTube «лише звук».
- **Веб.**
  - Телефон: `SliderInput`; `RevealImage` (canvas для пікселів, CSS-розмиття) з `useRevealProgress`; табло «🎵 Слухайте» в `Timer`; рядок «Картинка проявляється: що раніше відповіси, то більше балів».
  - Сцена: `QuestionAudio` (файл або прихований YouTube), кнопка «🔊 Увімкнути звук», `SliderScale` на розкритті.
  - Пульт: панель звуку («Програти ще раз», «Стоп», де грає), локальне відтворення без сцени, `SliderScale`.
  - Редактор: тіло повзунка, `AudioField` (файл або YouTube «лише звук»), прапорець «Лише звук» у полі відео, вибір режиму картинки, перевірки чернетки.
  - Довідка: записи `question.slider`, `setting.audio`, `setting.reveal`.

**Технології:** TypeScript, zod 4, vitest, Drizzle ORM (PGlite у тестах), Fastify + Socket.IO, React 19 + Vite, Testing Library (jsdom), Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-24-new-formats-design.md`:
- розділ 6 (частина 10b);
- розділ 14a: «що вважається правильною відповіддю», «правила раунду для нових типів», «аудіо з YouTube»;
- розділ 2: анти-цілі «правильна відповідь раніше розкриття», «старі вікторини змінюють бали», «живі ігри обриваються деплоєм»;
- розділ 3: нове поле має типове значення; аудіо у власному сховищі;
- розділ 5, пункт 5: кожен тип має запис у довідці.

Зразки:
- `packages/shared/src/quiz.ts` (гілка `numeric`, `IMAGE_LIMITS`, `IMAGE_URL`, `videoSchema`, `SIMPLE_TYPES`, `superRefine` вікторини з кодами `sort_cell`, `spare_video`);
- `packages/engine/src/check.ts`, `score.ts`, `timing.ts` (`isTimed`, `limitMsOf`);
- `packages/engine/src/game.ts`: `submitAnswer`, `acceptAnswer`, `streakCounts`, `openQuestion`, `resume`;
- `packages/engine/src/buffs.ts` (`fitBlock`, `tallyVotes`);
- `packages/engine/src/views.ts` (`publicQuestion`, `stageView`, `playerView`, `hostView`);
- `packages/engine/src/game.video.test.ts` (відкриття класики в момент 0, `startRound`), `views.marks.test.ts` (перевірки «не витікає»), `restore.test.ts` (`representative`, `STATE_SHAPE`, `KEYS`);
- `apps/server/src/upload-routes.ts`, `uploads.test.ts`, `storage/images.ts`, `storage/r2.ts`;
- `apps/server/src/rooms/manager.ts` (`connect`, `disconnect`, `hostOnline`, `RoomEvent`), `socket.ts` (`push`, `on(...)`), `socket.test.ts`;
- `apps/server/src/history.test.ts` (`history: spare questions`), `apps/server/scripts/demo-quiz.ts` + `demo-quiz.test.ts`;
- `apps/web/src/screens/{AnswerInput,PlayerScreen,StageScreen,HostScreen,SpotlightChoices,QuestionImage,YouTubePlayer}.tsx`, `apps/web/src/live/{Timer,useGame}.ts(x)`;
- `apps/web/src/editor/{QuestionEditor,VideoField,ImageField,BoardEditor,QuizEditor,SparesEditor}.tsx`, `draft.ts`, `draft-storage.ts`;
- `apps/web/src/help/{questions,settings,rounds,powers}.ts`, `host-help.test.ts`;
- `apps/web/src/format.ts`, `guide-text.ts`, `i18n.ts`;
- `apps/server/e2e/full-game.e2e.ts`: помічники `open`, `register`, `join`, `click`, `field`, `shot`, `afterSplash`, `seconds`, `expectNoSideScroll`, `avatarPng`, `youtubeStub`, `numericAnswer`; `hostDiceQuiz` — як отримати `stageUrl`; сценарій 10a `hostHelpGame` — структура.

**Рішення плану там, де специфікація мовчить:**

*Повзунок*
- **Дані.** `{ type: 'slider', min, max, step, correct, tolerance, zeroBeyond?, unit? }`, усі числа скінченні.
  - Умови: `min < max`; `step > 0`; `(max − min) / step ≤ LIMITS.maxSliderSteps` (10 000); `min ≤ correct ≤ max`; `tolerance ≥ 0`; `zeroBeyond > tolerance`, якщо задано.
  - Коди помилок: `slider_range`, `slider_correct`, `slider_zero`.
  - `unit` — до `LIMITS.sliderUnit` (12) символів. Порожня одиниця не зберігається.
- **Частка ціни** (`sliderShare(q, value)`), де `d = |value − correct|`:
  - нескінченне значення або поза `[min, max]` — 0;
  - `d ≤ tolerance` — 1;
  - є `zeroBeyond` і `d < zeroBeyond` — `(zeroBeyond − d) / (zeroBeyond − tolerance)`;
  - інакше — 0.

  Бали — `ціна × частка × швидкість × множник` (наявний `answerPoints`), бонус за швидкість у класиці діє, як у «числа».
- **Вердикт (14a).** `accepted = частка ≥ 0,5`. `grade`: `accepted` — `'correct'`; `0 < частка < 0,5` — `'partial'`; 0 — `'wrong'`. Штраф «мінус» — лише за частку 0 (наявна поведінка `answerPoints`).
- **Поле.** На звичайній клітинці частка діє завжди, незалежно від правила «частково». Наявне правило для «числа» не змінюється.
- **Бліц, бліц-клітинка, фінал.** Повзунок правильний лише в межах допуску. Це те саме правило «лише точне», що в «числа»; рушій там уже порівнює `accuracy === 1`, тож коду не додається.
- **Простий тип.** Повзунок додається в `SIMPLE_TYPES`. Отже, діють «Друга спроба» (перша відповідь не в допуску — вибір «залишити / ще раз», як у «числа» з відхиленням) і «Запитання в залі» (голоси групуються за значенням, як здогадки «числа»). Повзунок може бути запасним запитанням.
- **Телефон.**
  - Повзунок стартує посередині, вирівняний до кроку. Над ним — велике число з одиницею, поруч кнопки «−» і «+» на один крок (точне налаштування одним пальцем). Нижче — «Відповісти».
  - Надіслати можна й не рухаючи повзунок.
  - Число пишеться за `uk-UA`, кількість знаків після коми — як у кроку.
- **Розкриття.** Сцена показує шкалу:
  - межі й позначки шкали;
  - зелена смуга допуску, світліша смуга до межі нуля;
  - правильне значення великим;
  - позначки гравців із нікнеймами. Близькі позначки розводяться по рядках, найближчий до правильного підсвічений.

  У фіналі шкали немає: там розкриття йде по одному гравцю. Пульт бачить ту саму шкалу з етапу `question`. Телефон на розкритті показує міні-шкалу: свою позначку й правильне значення.

*Аудіо*
- **Дані.** `audio?: { source: 'file'; url; start; duration } | { source: 'youtube'; id; start; duration }`:
  - `url` відповідає `AUDIO_URL` (`/uploads/<hex>.(mp3|ogg|m4a)`), `id` — `YOUTUBE_ID`;
  - `start` — ціле 0…`LIMITS.maxVideoStart`;
  - `duration` — ціле `LIMITS.minAudioSeconds` (1)…`LIMITS.maxAudioSeconds` (120), секунди;
  - поле окреме від `video`; відео й аудіо разом — `audio_video`.

  У редакторі YouTube «лише звук» — це прапорець у полі відео. Він переносить посилання в `audio` (тривалість типово `LIMITS.defaultAudioSeconds` = 15) і прибирає `video`; зняття прапорця повертає відео. Звичайне відео працює, як зараз (без таймера).
- **Де дозволене.** У запитаннях будь-якого типу й раунду. Не дозволене в запасних запитаннях (там і далі немає відео): наявний код `spare_video` поширюється на аудіо й проявлення, а речення редактора змінюється на «Запасні запитання: без відео, аудіо й картинки, що проявляється.». Дуелі медіа не мають.
- **Таймер.** `audioLeadMs(q)` = `duration × 1000`, якщо `duration > timeLimit`, інакше 0. `answerWindowMs(q)` = `timeLimit × 1000 + audioLeadMs(q)`; це повний час запитання в рушії (`endsAt`, `limitMsOf`, пауза, «±15 с»).
  - Гравці можуть відповідати й під час фрагмента; бонус за швидкість рахується від усього вікна.
  - Табло показує «🎵 Слухайте» й повний час запитання, поки залишок більший за `timeLimit`; далі — звичайний відлік.
- **Де грає.**
  - Сцена грає фрагмент сама, щойно відкрилося запитання (після заставки), раз на запитання. Перезавантаження сцени грає його знову.
  - Пауза гри ставить звук на паузу, продовження — продовжує.
  - Якщо сцена не відкрита (`StateMeta.stageOnline === false`), грає пульт. Щойно сцена підключилася, пульт свій звук зупиняє.
  - Телефони не грають і **не отримують джерела** (`audio.clip: null`): id ролика YouTube видав би назву пісні. Тривалість телефон отримує — для табло.
- **Кнопки пульта.** «Програти ще раз» і «Стоп» надсилають `host:audio { action: 'replay' | 'stop' }`. Сервер розсилає `audio { action, seq }` сцені й пульту.
  - Годинник гри не змінюється.
  - Кнопки дозволені на етапах `question`, `locked`, `reveal`, якщо поточне запитання має аудіо; інакше `wrong_phase`.
- **Автовідтворення.** Браузер не грає звук без дотику до сторінки. Якщо `navigator.userActivation?.hasBeenActive === false`, а поточне запитання має аудіо, сцена (і пульт, коли грає сам) показує кнопку «🔊 Увімкнути звук». Дотик запускає фрагмент. Помилки `play()` перехоплюються: гра не падає, на картці видно «Звук недоступний».
- **YouTube «лише звук».** Рамка `youtube-nocookie` 200 × 200 з `opacity: 0`, `pointer-events: none`, `aria-hidden`; керування через `postMessage` (`seekTo`, `playVideo`, `pauseVideo`). Видно лише картку «🎵 Слухайте».

*Картинка, що проявляється*
- **Дані.** `reveal?: 'pixels' | 'blur'` (немає — звичайна). Умови:
  - потрібна картинка (`reveal_image`);
  - без відео (`reveal_video`);
  - лише типи `REVEAL_TYPES = ['single', 'text', 'numeric']` (`reveal_type`);
  - лише класика й поле, а на полі — лише звичайна клітинка з телефона (`reveal_place`).

  Редактор пропонує режим лише там, де він діє. Коли клітинку перемикають на бліц чи «вголос», `BoardEditor` прибирає режим сам.
- **Проявлення.** Поступ `p = clamp(elapsed / answerWindowMs(q), 0, 1)`:
  - `elapsed` — від старту таймера, без пауз і утримань. Клієнт рахує його як `limitMs − залишок`; «±15 с» і додатковий час проявлення не продовжують.
  - Від етапу `locked` і далі картинка повна (відповіді вже закриті).
  - Вигляд — 10 дискретних стадій `k = floor(p × 10)`. Пікселі: `round(6 × 1,4^k)` стовпців (6…124), на стадії 10 — оригінал. Розмиття: радіус `round(28 × (1 − k/10)^1,5)` px.
  - Хто вже відповів, бачить ту саму стадію за часом, а не повну картинку.
- **Бали.** `revealShare(timeMs, window) = 1 − 0,7 × clamp(timeMs / window, 0, 1)`. Частка = точність перевірки × `revealShare`. Отже, відповідь у мить 0 дає 100 %, у мить повного проявлення — 30 %, «число» з відхиленням — пропорційно менше.
  - Бонус за швидкість не нараховується.
  - `accepted = частка ≥ 0,5`, тобто правильна відповідь після ≈ 71 % часу ще дає бали, але для серії й точності вважається неправильною (буквально 14a).
  - На полі `timeMs` — до надсилання (годинник стоїть, поки ведучий приймає).
  - Неправильна відповідь — 0 (або мінус зі штрафом).
- **Одна спроба.** «Друга спроба» на такому запитанні недоступна (`unfit_reveal`, «На картинці, що проявляється, відповідь одна.»). Решта бафів діє, як на звичайному запитанні.
- **Ручна оцінка ведучого** (перевизначення на розкритті, усна чи ручна клітинка) — як зараз: «правильно» дає повну ціну.
- **Обмеження, яке лишається.** Адреса картинки потрапляє на телефон, ефект малюється на клієнті. Хто відкриє інструменти розробника, побачить оригінал. Серверне пікселювання — поза 10b (записати в «Обмеження» довідки й у звіт власникові).

*Решта*
- **`GAME_STATE_VERSION` лишається 2.**
  - Нові поля запитання необов'язкові, новий тип відповіді додається до об'єднання; `Question` і `Answer` у `STATE_SHAPE` не відстежуються, а верхні ключі `GameState`, `Play`, `AnswerRecord` не змінюються.
  - Код читає відсутні `audio`/`reveal` як «немає» (збережені кімнати 9b — сирий JSON без zod).
  - Тест `restore.test.ts` додає представника з повзунком, аудіо й проявленням, а `KEYS` не змінюються.
  - Пуш 10b живих ігор не обриває.
- **Міграції немає.** Запитання живуть у jsonb `quiz.rounds`, відповіді — у jsonb `answer.payload`; `accepted` уже є колонкою.
- **Демо.** `demo-quiz.ts` отримує помічники `slider(...)`, `withAudio(...)`, `revealing(...)`. Демо `demo` отримує повзунок («У якому році…») і запитання з YouTube «лише звук» (`fJ9rUzIMcZQ`, 15 с). Картинку, що проявляється, покаже вітрина 10k: демо з картинками вантажать їх із Вікіпедії. Уже засіяні вікторини не змінюються.
- **Чого не робимо:** серверне пікселювання; власний аудіоплеєр на телефонах; обрізання аудіофайлу на сервері (фрагмент задається початком і тривалістю); повзунок із нелінійною шкалою; проявлення відео.

## Глобальні обмеження

- Рушій чистий: жодного годинника, усе від `now`. `verdictOf` бере `timeMs` аргументом.
- **Анти-ціль «відповідь раніше розкриття».**
  - `PublicQuestion.slider` не має `correct`, `tolerance`, `zeroBeyond`.
  - Телефон не отримує джерела аудіо.
  - `sliderMarks` на сцені — лише на `reveal`.
  - Тести задачі 3 закріплюють це через `JSON.stringify(view)`.
- **Старі вікторини й бали не змінюються.**
  - Наявні тести «числа» на полі без «частково» (0 балів за неточне), бліцу (лише точне) і серій лишаються зеленими без змін.
  - Запитання без `audio` мають той самий `endsAt`.
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`, тексти довідки — лише в `apps/web/src/help/*.ts`.
- Телефон 375 px — без горизонтальної прокрутки; повзунок керується одним пальцем.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2`. Якщо PGlite падає з браком пам'яті, запускати окремо `pnpm vitest run --maxWorkers=2 packages`, `pnpm vitest run --maxWorkers=1 apps/server`, `pnpm vitest run --maxWorkers=2 apps/web`.
- Наскрізні тести: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts`. Кадри лягають в `apps/server/e2e/artifacts/shots`.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (проєкт тестовий). Формат стану не змінюється, тож питати власника про живі ігри не треба.

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/quiz.ts`, `quiz.test.ts`, `answer.ts`, `game.ts` | `slider`, `audio`, `reveal`, ліміти, чисті функції, `unfit_reveal` | 1 |
| `apps/web/src/{format.ts,guide-text.ts,i18n.ts}`, `apps/web/src/help/questions.ts`, `apps/web/src/editor/draft.ts`, `apps/web/src/screens/AnswerInput.tsx`, `apps/web/src/editor/QuestionEditor.tsx` | прохід typecheck: назви типу, тексти, `correctText`/`answerText`, `build`/`duplicateQuestion`, тимчасові гілки | 1 |
| `packages/engine/src/{check.ts,game.ts,timing.ts,buffs.ts}`, `testing/fixtures.ts`, нові `game.slider.test.ts`, `game.reveal.test.ts`, `game.audio.test.ts`, `check.test.ts`, `restore.test.ts` | бали, вердикт, вікно часу, бафи | 2 |
| `packages/shared/src/views.ts`, `packages/engine/src/views.ts`, новий `views.media.test.ts`, фабрики зрізів у тестах вебу | публічні поля, `sliderMarks`, `audioOf` | 3 |
| `packages/shared/src/events.ts`, `apps/server/src/{upload-routes.ts,storage/images.ts,storage/r2.ts,rooms/manager.ts,socket.ts}`, `uploads.test.ts`, `storage/images.test.ts`, `socket.test.ts` | аудіофайли, `Range`, `host:audio`, `stageOnline` | 4 |
| `apps/server/src/history.test.ts`, `achievements.test.ts` (або `profiles.test.ts`), `apps/server/scripts/{demo-quiz.ts,demo-quiz.test.ts}` | історія, профіль, досягнення, демо | 5 |
| `apps/web/src/screens/{SliderInput,RevealImage}.tsx` (нові), `apps/web/src/reveal.ts` (новий), `AnswerInput.tsx`, `PlayerScreen.tsx`, `SpotlightChoices.tsx`, `apps/web/src/live/Timer.tsx`, `apps/web/src/i18n.ts`, `styles.css` + тести | телефон | 6 |
| `apps/web/src/screens/{QuestionAudio,SliderScale}.tsx` (нові), `StageScreen.tsx`, `HostScreen.tsx`, `apps/web/src/live/useGame.ts`, `apps/web/src/pages/{Stage,Host}.tsx`, `i18n.ts`, `styles.css` + тести | сцена й пульт | 7 |
| `apps/web/src/editor/{QuestionEditor,AudioField(новий),VideoField,BoardEditor,QuizEditor,SparesEditor}.tsx`, `draft.ts`, `draft-storage.ts`, `apps/web/src/api.ts`, `i18n.ts`, `styles.css` + тести | редактор | 8 |
| `apps/web/src/help/{settings,questions,rounds,powers}.ts`, `host-help.test.ts`, `HostScreen.tsx`, `QuestionEditor.tsx`, `AudioField.tsx` | довідка й «ⓘ» | 9 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 10b з кадрами | 10 |

## Порядок збирання

- 1 → 2 → 3. Задачі 4 і 5 — після 3, між собою незалежні.
- 6 — після 3. 7 — після 3 і 4 (події `audio`, `stageOnline`). 8 — після 1 і 4 (маршрут завантаження аудіо).
- 9 — після 7 і 8 (кнопки «ⓘ» стоять у нових компонентах). 10 — остання.
- **Навмисні зміни наявних очікувань** (лише такі):
  - речення `problemSpareVideo` (новий текст);
  - фабрики `PublicQuestion` / `StageView` / `HostView` у тестах вебу отримують нові поля (`slider: null`, `audio: null`, `reveal: null`, `sliderMarks: null`);
  - тест у `quiz.test.ts`, що звіряє `SIMPLE_TYPES` або перелік типів буквально, отримує `'slider'`;
  - `streakCounts` переходить з `accuracy < 1` на `grade !== 'correct'`. Для старих типів це те саме (`gradeOf`), і наявні тести серій лишаються зеленими без змін. Якщо котрийсь упаде, рецензент розбирає причину, а не правка очікування.

## На що дивитися рецензентові

1. **Нічого не витікає.**
   - Правильне значення повзунка й джерело аудіо не потрапляють на телефон до розкриття.
   - Позначки гравців не потрапляють на сцену до розкриття.
   - Тести: задача 3, `slider correct values never reach the phone or the stage before the reveal`, `the phone never gets the audio source`.
2. **Бали за 14a.**
   - Повзунок: допуск — 100 %, межа нуля — лінійно, половина ціни — «правильно».
   - Картинка: 100 % → 30 %, без бонусу швидкості, одна спроба.
   - Поле не залежить від «частково».
   - Тести: задача 2.
3. **Старе не змінилося.** Наявні тести «числа», бліцу, фіналу, серій і відео — без змін. Запитання без `audio` мають той самий `endsAt`. Тест: задача 2, `a question without audio keeps its timer`.
4. **Таймер аудіо.** Фрагмент довший — `endsAt = start + (timeLimit + duration) × 1000`; коротший — без змін; пауза зберігає залишок. Тести: задача 2.
5. **Сервер.**
   - Аудіо лише за вмістом і до 5 МБ, `Range` віддає 206.
   - `host:audio` чує лише сцена й пульт.
   - Тести: задача 4.
6. **Формат стану.** `GAME_STATE_VERSION` = 2, `KEYS` без змін, представник із новими полями проходить JSON. Тест: задача 2 (`restore.test.ts`).
7. **Довідка.** Записи `question.slider`, `setting.audio`, `setting.reveal` правдиві щодо рушія, з числами з `LIMITS`/`AUDIO_LIMITS`/`REVEAL_MIN_SHARE`. Тести: задача 9.


**Рішення координатора (переважає текст задач нижче):** для картинки, що проявляється, «правильність» для серій, точності й досягнень — це правильність самої відповіді (`checkAnswer`), а не частка балів. Спадання від 100 % до 30 % — це плата за час, як бонус за швидкість, а не часткова правильність. Правило «щонайменше половина ціни» з розділу 14a специфікації стосується лише типів, де бали залежать від близькості відповіді (повзунок, а пізніше точка, стіна тощо).

---

### Задача 1. Shared: тип `slider`, аудіо й проявлення в запитанні, ліміти й чисті функції; прохід typecheck у вебі

**Files:**
- Modify: `packages/shared/src/quiz.ts`, `packages/shared/src/answer.ts`, `packages/shared/src/game.ts`
- Test: `packages/shared/src/quiz.test.ts`
- Modify (прохід typecheck): `apps/web/src/format.ts`, `apps/web/src/guide-text.ts`, `apps/web/src/i18n.ts`, `apps/web/src/help/questions.ts`, `apps/web/src/editor/draft.ts`, `apps/web/src/screens/AnswerInput.tsx`, `apps/web/src/editor/QuestionEditor.tsx`
- Test: `apps/web/src/format.test.ts`, `apps/web/src/editor/draft.test.ts`

**Interfaces:**
- Produces (`quiz.ts`):
  ```ts
  // У LIMITS:
  /** Одиниця повзунка («км», «рік»), символів. */
  sliderUnit: 12,
  /** Найбільше кроків повзунка: (max − min) / step. */
  maxSliderSteps: 10_000,
  /** Тривалість фрагмента аудіо, секунди. */
  minAudioSeconds: 1,
  maxAudioSeconds: 120,
  defaultAudioSeconds: 15,

  /** Обмеження аудіофайлів (10b). */
  export const AUDIO_LIMITS = {
    maxBytes: 5 * 1024 * 1024,
    /** Типи, які приймає маршрут (браузери називають m4a по-різному). */
    types: ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac'],
  } as const;
  /** Адреса завантаженого аудіо: лише власне сховище. */
  export const AUDIO_URL = /^\/uploads\/[a-z0-9]{16,64}\.(mp3|ogg|m4a)$/;

  export const audioSchema = z.discriminatedUnion('source', [
    z.object({ source: z.literal('file'), url: z.string().regex(AUDIO_URL), start: …int 0..LIMITS.maxVideoStart, duration: …int min..max }),
    z.object({ source: z.literal('youtube'), id: z.string().regex(YOUTUBE_ID), start: …, duration: … }),
  ]);
  export type QuestionAudio = z.infer<typeof audioSchema>;

  export const REVEAL_MODES = ['pixels', 'blur'] as const;
  export type RevealMode = (typeof REVEAL_MODES)[number];
  /** Типи, де діє картинка, що проявляється. */
  export const REVEAL_TYPES = ['single', 'text', 'numeric'] as const satisfies readonly Question['type'][];
  /** Частка ціни в мить повного проявлення. */
  export const REVEAL_MIN_SHARE = 0.3;

  // base:
  /** Аудіо до запитання (10b); старі запитання без поля. */
  audio: audioSchema.optional(),
  /** Режим картинки (10b): немає — звичайна. */
  reveal: z.enum(REVEAL_MODES).optional(),

  // Гілка questionSchema:
  z.object({
    ...base,
    type: z.literal('slider'),
    min: z.number().finite(), max: z.number().finite(), step: z.number().finite().positive(),
    correct: z.number().finite(), tolerance: z.number().finite().min(0),
    /** Далі ніж ±zeroBeyond від правильного — 0 балів; немає — лише повні або 0. */
    zeroBeyond: z.number().finite().positive().optional(),
    unit: z.string().trim().min(1).max(LIMITS.sliderUnit).refine(isStorable, UNSTORABLE).optional(),
  }),

  export const QUESTION_TYPES = [..., 'sort', 'slider'] as const;
  export const SIMPLE_TYPES = ['single', 'multi', 'boolean', 'text', 'numeric', 'slider'] as const …;

  /** Частка ціни за значення повзунка (див. рішення плану). */
  export function sliderShare(question: Extract<Question, { type: 'slider' }>, value: number): number;
  /** На скільки довший фрагмент відкладає таймер, мс: duration, якщо він довший за timeLimit; інакше 0. Запитання без audio (і сирі старі) — 0. */
  export function audioLeadMs(question: Pick<Question, 'timeLimit'> & { audio?: QuestionAudio }): number;
  /** Повний час відповіді, мс: timeLimit × 1000 + audioLeadMs. */
  export function answerWindowMs(question: Pick<Question, 'timeLimit'> & { audio?: QuestionAudio }): number;
  /** Частка ціни за час відповіді на картинці, що проявляється: 1 − (1 − REVEAL_MIN_SHARE) × clamp(timeMs / windowMs). */
  export function revealShare(timeMs: number, windowMs: number): number;
  /** Частковість вбудована (повзунок або картинка, що проявляється): правильна — частка ≥ 0,5 (14a). */
  export function builtInPartial(question: Question): boolean;
  ```
  - `superRefine` запитання додає коди:
    - `slider_range` — `min ≥ max`, або кроків більше за ліміт, або нецілий результат `(max − min) / step` з похибкою понад 1e-9 від цілого (щоб `max` був досяжний);
    - `slider_correct` — `correct` поза межами;
    - `slider_zero` — `zeroBeyond ≤ tolerance`;
    - `audio_video` — є і `audio`, і `video`;
    - `reveal_image` — `reveal` без `imageUrl`;
    - `reveal_video` — `reveal` з відео;
    - `reveal_type` — тип не з `REVEAL_TYPES`.
  - `superRefine` вікторини:
    - `reveal_place` — `reveal` у бліці, фіналі або на клітинці поля, що не є звичайною з телефона (`cell.kind !== 'normal' || cellAnswerMode(round, cell) !== 'phone'`);
    - перевірка запасних `spare_video` стає `s.video !== null || s.audio !== undefined || s.reveal !== undefined`.
- Produces (`answer.ts`): `z.object({ type: z.literal('slider'), value: z.number().finite() })`.
- Produces (`game.ts`): `BuffBlock` + `| 'unfit_reveal'` з коментарем «картинка, що проявляється: відповідь одна (10b)».
- Веб (прохід typecheck):
  - `i18n.ts`: `type_slider: 'Повзунок'`, `typeShort_slider: 'повзунок'`, `typeHow_slider: 'Потягніть повзунок до свого числа й натисніть «Відповісти».'`, `buffWhy_unfit_reveal: 'На картинці, що проявляється, відповідь одна.'`, `problemSpareVideo: 'Запасні запитання: без відео, аудіо й картинки, що проявляється.'`;
  - `guide-text.ts`: `TYPE_ICONS.slider = '⟷'`;
  - `format.ts`:
    - `correctText` для `slider` → `"1991 рік (± 2)"` (одиниця через пробіл, «± N» лише за `tolerance > 0`);
    - `answerText` → `"1990 рік"`;
    - новий експорт `sliderNumber(value, step)` — `uk-UA`, знаків після коми як у кроку (`0.5` → 1, `0.25` → 2, `1` → 0);
  - `help/questions.ts`: повний запис `slider` (`title: 'Повзунок'`; «Що це», «Як іде в грі», «Бали» з числами допуску й межі нуля, «половина ціни — правильна» для серій; «Порада»: «ставте розумний діапазон: на телефоні повзунок довжиною ~300 px, кнопки ± допомагають»; «Обмеження»: «у бліці, на бліц-клітинці й у фіналі зараховується лише влучання в допуск», `До ${LIMITS.maxSliderSteps} кроків`);
  - `draft.ts`:
    - `build` для `slider` → `{ min: 0, max: 100, step: 1, correct: 50, tolerance: 0 }`;
    - `duplicateQuestion` копіює як `numeric` (новий id);
    - `changeType` зберігає `audio` для будь-якого типу, а `reveal` — лише для `REVEAL_TYPES` (`Common` + `audio`, `reveal`);
  - `AnswerInput.tsx`: `case 'slider': return null; // задача 6`;
  - `QuestionEditor.tsx` (`Body`): `case 'slider': return null; // задача 8`.

- [ ] **Step 1: Write the failing tests** у `packages/shared/src/quiz.test.ts`:
  ```ts
  describe('slider (10b)', () => {
    const slider = { id: 's1', type: 'slider', text: 'Скільки?', imageUrl: null, video: null, timeLimit: 20, points: 1000,
      min: 0, max: 100, step: 1, correct: 50, tolerance: 2, zeroBeyond: 12, unit: '%' } as const;
    it('a slider is a question type and a simple type', () => {
      expect(QUESTION_TYPES).toContain('slider');
      expect(SIMPLE_TYPES).toContain('slider');
      expect(valid(questionSchema, slider)).toBe(true);
      expect(valid(questionSchema, { ...slider, zeroBeyond: undefined, unit: undefined })).toBe(true);
    });
    it('checks range, step, correct value and the zero distance', () => {
      expect(issues({ ...slider, min: 100 })).toContain('slider_range');
      expect(issues({ ...slider, step: 0.7 })).toContain('slider_range'); // 100 / 0.7 не ціле
      expect(issues({ ...slider, max: 100_001 })).toContain('slider_range'); // > maxSliderSteps
      expect(issues({ ...slider, correct: 101 })).toContain('slider_correct');
      expect(issues({ ...slider, zeroBeyond: 2 })).toContain('slider_zero');
      expect(valid(questionSchema, { ...slider, step: 0 })).toBe(false);
      expect(valid(questionSchema, { ...slider, unit: 'x'.repeat(LIMITS.sliderUnit + 1) })).toBe(false);
    });
    it('sliderShare: full inside the tolerance, linear to zero, nothing outside the range', () => {
      expect(sliderShare(slider, 52)).toBe(1);
      expect(sliderShare(slider, 57)).toBeCloseTo(0.5);
      expect(sliderShare(slider, 58)).toBeCloseTo(0.4);
      expect(sliderShare(slider, 62)).toBe(0);
      expect(sliderShare(slider, 101)).toBe(0);
      expect(sliderShare(slider, Number.NaN)).toBe(0);
      const strict = { ...slider, zeroBeyond: undefined };
      expect(sliderShare(strict, 52)).toBe(1);
      expect(sliderShare(strict, 53)).toBe(0);
    });
  });

  describe('audio and revealing picture (10b)', () => {
    const file = { source: 'file', url: `/uploads/${'a'.repeat(32)}.mp3`, start: 5, duration: 30 } as const;
    it('audio is optional, from our storage or YouTube, never together with a video', () => {
      expect(valid(questionSchema, { ...single, audio: file })).toBe(true);
      expect(valid(questionSchema, { ...single, audio: { source: 'youtube', id: 'dQw4w9WgXcQ', start: 0, duration: 15 } })).toBe(true);
      expect(valid(questionSchema, { ...single, audio: { ...file, url: 'https://evil.example/a.mp3' } })).toBe(false);
      expect(valid(questionSchema, { ...single, audio: { ...file, duration: LIMITS.maxAudioSeconds + 1 } })).toBe(false);
      expect(issues({ ...single, audio: file, video: { id: 'dQw4w9WgXcQ', start: 0 } })).toContain('audio_video');
    });
    it('the audio lead and the answer window', () => {
      expect(audioLeadMs({ timeLimit: 20, audio: file })).toBe(30_000);
      expect(audioLeadMs({ timeLimit: 20, audio: { ...file, duration: 20 } })).toBe(0);
      expect(audioLeadMs({ timeLimit: 20 })).toBe(0);
      expect(answerWindowMs({ timeLimit: 20, audio: file })).toBe(50_000);
      expect(answerWindowMs({ timeLimit: 20 })).toBe(20_000);
    });
    it('revealing picture: needs a picture, no video, single/text/numeric only', () => {
      const img = `/uploads/${'b'.repeat(32)}.png`;
      expect(valid(questionSchema, { ...single, imageUrl: img, reveal: 'pixels' })).toBe(true);
      expect(issues({ ...single, reveal: 'blur' })).toContain('reveal_image');
      expect(issues({ ...single, imageUrl: img, reveal: 'blur', video: { id: 'dQw4w9WgXcQ', start: 0 } })).toContain('reveal_video');
      expect(issues({ ...multiQ, imageUrl: img, reveal: 'blur' })).toContain('reveal_type');
    });
    it('revealShare: 100 % at once, 30 % at full reveal, linear between', () => {
      expect(revealShare(0, 20_000)).toBe(1);
      expect(revealShare(10_000, 20_000)).toBeCloseTo(0.65);
      expect(revealShare(20_000, 20_000)).toBeCloseTo(REVEAL_MIN_SHARE);
      expect(revealShare(30_000, 20_000)).toBeCloseTo(REVEAL_MIN_SHARE);
    });
    it('reveal only in classic and on a normal phone cell; spares take no audio or reveal', () => {
      // blitz → reveal_place; final → reveal_place; board blitz cell / voice cell → reveal_place; classic and normal phone cell → OK
      // quiz.spares з audio або reveal → 'spare_video'
    });
    it('builtInPartial: slider and revealing picture only', () => { … });
  });
  ```
  Назви `single`, `multiQ`, `valid`, `issues` — наявні помічники файлу. Якщо котрогось немає, підняти або створити на верхньому рівні файлу, як у 9d. Повні тіла двох останніх тестів писати за зразком `describe('board round')` і `spare pool rules`. Тест `answerSchema`: `{ type: 'slider', value: 1.5 }` проходить, `value: Infinity` — ні.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared` → FAIL (немає експортів).
- [ ] **Step 3: Implement** схему, функції й коди помилок за інтерфейсом:
  - `sliderShare` бере `EPS = 1e-9` для порівнянь, як `check.ts`;
  - `audioLeadMs` читає `question.audio` через `?.`: сирі старі запитання поля не мають;
  - `revealShare` з `windowMs ≤ 0` повертає `REVEAL_MIN_SHARE`.
- [ ] **Step 4: Прохід typecheck у вебі.** Виконати `pnpm typecheck` і закрити кожну помилку змінами з інтерфейсу. Тести:
  - `format.test.ts`: `correctText` повзунка → `'1991 рік (± 2)'`, без допуску → `'1991 рік'`, без одиниці → `'1991'`; `answerText({ type: 'slider', value: 2.5 }, q з step 0.5)` → `'2,5 км'`; `sliderNumber(1990, 1)` → `'1990'`, `sliderNumber(0.25, 0.25)` → `'0,25'`;
  - `draft.test.ts`: `newQuestion('slider')` проходить `questionSchema`; `changeType` single→text зберігає `reveal` і `audio`, single→multi прибирає `reveal`, але зберігає `audio`.
- [ ] **Step 5: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 6: Commit**
  ```bash
  git add packages/shared apps/web/src
  git commit -m "feat(shared): slider question type, audio clip and revealing picture on questions, limits and pure helpers (share, audio lead, answer window, reveal share)"
  ```

### Задача 2. Рушій: бали повзунка й картинки, що проявляється; вікно часу з аудіо; бафи; формат стану

**Files:**
- Modify: `packages/engine/src/check.ts`, `packages/engine/src/game.ts`, `packages/engine/src/timing.ts`, `packages/engine/src/buffs.ts`, `packages/engine/src/testing/fixtures.ts`
- Test: `packages/engine/src/check.test.ts`, нові `packages/engine/src/game.slider.test.ts`, `game.reveal.test.ts`, `game.audio.test.ts`; `packages/engine/src/restore.test.ts`

**Interfaces:**
- Produces (`check.ts`):
  ```ts
  // checkAnswer: question.type === 'slider' && answer.type === 'slider' → { accepted: share >= 0.5, accuracy: share }, share = sliderShare(question, answer.value)

  export interface Verdict { accepted: boolean; accuracy: number; grade: Grade }
  /**
   * Перевірка з урахуванням часу: на картинці, що проявляється, точність × revealShare(timeMs, answerWindowMs).
   * Вбудовані часткові (builtInPartial): accepted = точність ≥ 0,5, grade 'correct' | 'partial' | 'wrong' за цим правилом;
   * решта — accepted з checkAnswer і grade за точністю (≥1 correct, ≤0 wrong, інакше partial).
   */
  export function verdictOf(question: Question, answer: Answer, timeMs: number): Verdict;
  ```
- Changes (`timing.ts`): `limitMsOf(play)` → `answerWindowMs(play.question) + play.extraMs` для запитань із таймером.
- Changes (`game.ts`):
  - `openQuestion`: `endsAt: isTimed(question) ? at + answerWindowMs(question) : null`.
  - `submitAnswer` (класика):
    ```ts
    const { accepted, accuracy, grade } = verdictOf(asked, answer, timeMs);
    const speed = speedFactor(timeMs, limit ?? 0, round.type === 'classic' && round.speedBonus && limit !== null && asked.reveal === undefined);
    // record.grade = grade
    ```
    `gradeOf` лишається для інших місць.
  - `acceptAnswer` (поле, автоперевірка):
    ```ts
    const asked = questionFor(state, play, pending.playerId);
    const timeMs = Math.max(0, clockOf(state, now) - (state.startedAt ?? now));
    const v = verdictOf(asked, pending.answer, timeMs);
    // Вбудовані часткові бали не залежать від правила «частково» (14a); інші — як було.
    const accuracy = builtInPartial(asked) ? v.accuracy : (старий вираз через checked.accuracy);
    const accepted = builtInPartial(asked) ? v.accepted : accuracy >= 1;
    const grade = builtInPartial(asked) ? v.grade : gradeOf(accuracy);
    ```
  - `streakCounts`: `if (record === undefined || record.grade !== 'correct') break;`.
- Changes (`buffs.ts`):
  - `fitBlock` `'retry'`: перед перевіркою типу `if (question.reveal !== undefined) return 'unfit_reveal';`;
  - `tallyVotes`: `else if (ballot.type === 'slider') guess(String(ballot.value), String(ballot.value));`.
- Produces (`testing/fixtures.ts`):
  ```ts
  export const slider = { ...base, id: 'q10', type: 'slider', text: 'Скільки відсотків поверхні Землі вкриває вода?',
    min: 0, max: 100, step: 1, correct: 50, tolerance: 2, zeroBeyond: 12, unit: '%' } satisfies Question;
  export const IMG = `/uploads/${'b'.repeat(32)}.png`;
  export const withReveal = (question: Question, reveal: RevealMode = 'pixels'): Question => ({ ...question, imageUrl: question.imageUrl ?? IMG, reveal });
  export const withAudio = (question: Question, audio: Partial<QuestionAudio> = {}): Question =>
    ({ ...question, audio: { source: 'file', url: `/uploads/${'a'.repeat(32)}.mp3`, start: 0, duration: 30, ...audio } as QuestionAudio });
  ```

- [ ] **Step 1: Write the failing tests.**
  - `check.test.ts`:
    - `checkAnswer(slider, { type: 'slider', value: 57 })` → `{ accepted: true, accuracy: ≈0.5 }`; `58` → `accepted: false`;
    - відповідь іншого типу → REJECTED;
    - `verdictOf(withReveal(text), right, 10_000)` → `accuracy ≈ 0.65`, `accepted: true`, `grade: 'correct'`; на 15 000 → `≈ 0.475`, `accepted: false`, `grade: 'partial'`; неправильна → `{ accepted: false, accuracy: 0, grade: 'wrong' }`;
    - `verdictOf(numeric, 2111, 0)` — старий тип: `grade: 'partial'`, `accepted: true` (наявна поведінка).
  - `game.slider.test.ts`. Класика `speedBonus: false`; Анна p1, Богдан p2; `startRound(..., 0)`:
    ```ts
    it('a slider scores full inside the tolerance and falls linearly to zero', () => {
      let s = openClassic([slider]);
      s = must(submitAnswer(s, 'p1', { type: 'slider', value: 52 }, 1000));
      s = must(submitAnswer(s, 'p2', { type: 'slider', value: 57 }, 1000));
      expect(recordOf(s, 0, 'p1')).toMatchObject({ points: 1000, accepted: true, grade: 'correct' });
      expect(recordOf(s, 0, 'p2')).toMatchObject({ points: 500, accepted: true, grade: 'correct' });
    });
    ```
    Інші тести файлу:
    - `half the price is correct, less is partial and not accepted` (58 → 400, `accepted: false`, `grade: 'partial'`);
    - `beyond the zero distance gives nothing; the minus penalty applies only to a zero` (63 з `penalty: 'minus'` → −1000; 58 з `minus` → 400);
    - `without a zero distance a slider is all or nothing`;
    - `out of range or the wrong answer type is rejected` (`value: 101` → 0 балів, запис є; `{ type: 'numeric' }` → `type_mismatch`);
    - `the speed bonus applies like a number` (`speedBonus: true`, 52 у мить 10 000 з 20 с → 750);
    - `a streak continues on a half-price slider and breaks below half` (правила `streak: { length: 2, … }`: 57, потім 52 → серія 2; 58 обриває);
    - `on a board cell a slider gets its share without the partial rule` (`boardRound`, `rules.partial: null`, вибравший надсилає 57, `acceptAnswer` → 500, `accepted: true`) і поруч регресія `a number off the exact value still gets 0 on a board without the partial rule` (fixture `numeric` 2111 → 0);
    - `in a blitz a slider counts only inside the tolerance` (`blitzRound`, 57 → неправильно, спроба `grade: 'wrong'`; 52 → правильно);
    - `in the final a slider counts only inside the tolerance`;
    - `the audience groups slider votes by value` (баф `audience`, голоси 40, 40, 60 → `guesses` `[{ text: '40', count: 2 }, { text: '60', count: 1 }]`; зразок — `game.buffs-others.test.ts`);
    - `retry is offered after a slider answer outside the tolerance` (баф `retry`, 57 → етап `choice`).
  - `game.reveal.test.ts`. Класика `speedBonus: true`, `withReveal(text)` (20 с, 1000):
    - `a correct answer at once gets the full price — no speed bonus on top` (0 мс → 1000);
    - `the price falls to 30 % at full reveal` (10 000 → 650; 20 000 → 300; запис `accepted` true / false за 14a: 650 → true, 15 000 → 475 і `accepted: false`, `grade: 'partial'`);
    - `a wrong answer gets 0, or minus with the penalty`;
    - `a number with a tolerance multiplies its accuracy by the reveal share` (`withReveal(numeric)`, 2061 у мить 10 000 → 650);
    - `retry is not available on a revealing picture` (`buffBlock(s, 'p1', 'retry')` → `'unfit_reveal'`; на звичайному `text` — `null`);
    - `extra time does not push the share below 30 %` (баф `time`, відповідь на 25 000 → 300);
    - `on a board cell the time to submit counts, not the time the host takes` (клітинка `withReveal(single)` 1000, вибравший надсилає в 5000, `acceptAnswer` у 9000 → 825);
    - `a host override still gives the full price` (`override(..., 'correct')` на розкритті → 1000).
  - `game.audio.test.ts`:
    - `a clip longer than the question delays the timer` (`withAudio(single, { duration: 30 })`, 20 с: `endsAt` = 50 000; `limitMsOf` = 50 000; відповідь у 45 000 приймається);
    - `a shorter clip runs alongside` (`duration: 10` → `endsAt` 20 000);
    - `a question without audio keeps its timer` (сирий об'єкт без ключа `audio` після `JSON.parse(JSON.stringify(...))` → 20 000);
    - `pause and resume keep the remaining time with the audio lead` (пауза в 10 000, продовження в 15 000 → `endsAt` 55 000);
    - `+15 s works on the whole window` (`adjustTime(s, 15, 1000)`: залишок 49 000 + 15 000 = 64 000 ≤ `MAX_REMAINING_MS` → OK, `endsAt` 65 000);
    - `a video question is still untimed`.
  - `restore.test.ts`: у `representative()` додати стан класики з `[withAudio(slider), withReveal(text)]` і відповіддю на повзунок. Наявний тест JSON-кругообігу й форми проходить. `KEYS` і `GAME_STATE_VERSION` не змінюються.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсом. Перевірити `grep -n "gradeOf(accuracy)" packages/engine/src/game.ts`. Класика й поле тепер беруть `grade` з вердикту; решта місць (`override`, `applyGrade`, бліц, фінал) не змінюються.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS (усі наявні тести рушія без змін).
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine
  git commit -m "feat(engine): slider and revealing-picture scoring by share (half price counts as correct), no speed bonus or retry on a revealing picture, audio lead in the answer window, slider votes"
  ```

### Задача 3. Зрізи: повзунок, аудіо й проявлення без витоку; позначки на шкалі

**Files:**
- Modify: `packages/shared/src/views.ts`, `packages/engine/src/views.ts`, `packages/engine/src/index.ts` (експорт `audioOf`, якщо файл перелічує експорти)
- Test: новий `packages/engine/src/views.media.test.ts`
- Modify (фабрики): тести вебу, що будують `PublicQuestion`/`StageView`/`HostView` вручну (`grep -rln "orderLabels: null" apps/web/src`)

**Interfaces:**
- Produces (`shared/views.ts`):
  ```ts
  /** Повзунок без правильного значення, допуску й межі нуля. */
  export interface PublicSlider { min: number; max: number; step: number; unit: string }
  /** Аудіо запитання: тривалість — усім (табло «Слухайте»); джерело — лише сцені й пульту. */
  export interface PublicAudio { duration: number; clip: QuestionAudio | null }
  // PublicQuestion:
  /** null для інших типів. */
  slider: PublicSlider | null;
  /** null — без аудіо. */
  audio: PublicAudio | null;
  /** null — звичайна картинка. */
  reveal: RevealMode | null;

  /** Позначка гравця на шкалі повзунка. */
  export interface SliderMark { playerId: string; nickname: string; value: number; points: number }
  // StageView:
  /** Позначки на шкалі: лише етап reveal запитання-повзунка поза фіналом; за відстанню до правильного, далі за нікнеймом. Інакше null. */
  sliderMarks: SliderMark[] | null;
  // HostView:
  /** Як у сцени, але з етапу question (ведучий і так бачить відповіді). */
  sliderMarks: SliderMark[] | null;
  ```
- Produces (`engine/views.ts`):
  - `publicQuestion` заповнює `slider` (`unit: question.unit ?? ''`), `audio: question.audio ? { duration: question.audio.duration, clip: question.audio } : null`, `reveal: question.reveal ?? null`;
  - `playerView` замінює `audio.clip` на `null` і в `question`, і в запасному (`spare`) шляху; `reveal` (повне запитання на розкритті) не змінюється;
  - `sliderMarks(state, forHost)` будує позначки з `currentAnswers`, де `answer.type === 'slider'`;
  - ```ts
    /** Аудіо поточного запитання на етапах question/locked/reveal; інакше null. Для сервера (кнопки пульта). */
    export function audioOf(state: GameState): QuestionAudio | null;
    ```
    На полі із заміною — аудіо того запитання, яке бачать усі (`shownQuestion`).

- [ ] **Step 1: Write the failing tests** у `views.media.test.ts` (класика `[slider, withAudio(single, { source: 'youtube', id: 'dQw4w9WgXcQ', start: 0, duration: 30 }), withReveal(text)]`, Анна p1, Богдан p2):
  ```ts
  it('slider correct values never reach the phone or the stage before the reveal', () => {
    const s = openClassic();
    const phone = playerView(s, 'p1')!;
    expect(phone.question?.slider).toEqual({ min: 0, max: 100, step: 1, unit: '%' });
    for (const view of [phone, stageView(s)]) {
      expect(view.question).not.toHaveProperty('correct');
      expect(JSON.stringify(view.question)).not.toMatch(/tolerance|zeroBeyond|"correct"/);
    }
    expect(stageView(s).sliderMarks).toBeNull();
  });
  ```
  Інші тести:
  - `the stage gets the marks only on the reveal, sorted by distance` (p1 57, p2 52; на `question` і `locked` — `null`; на `reveal` — `[{ p2, 52, 1000 }, { p1, 57, 500 }]`);
  - `the host sees the marks while the question runs`;
  - `the phone never gets the audio source` (друге запитання: `playerView.question.audio` = `{ duration: 30, clip: null }`; `JSON.stringify(playerView)` не містить `dQw4w9WgXcQ`; сцена й пульт отримують `clip`);
  - `audioOf follows the current question and phase` (`null` у лобі, на першому запитанні й на `leaderboard`; `clip` на `question`, `locked`, `reveal` другого);
  - `everyone sees the reveal mode; nobody gets extra clues` (`question.reveal === 'pixels'` для всіх ролей, `imageUrl` той самий);
  - `a final slider shows no marks on the stage`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/views.media.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Потім `pnpm typecheck`: тести вебу, що будують зрізи вручну, отримують нові поля (`slider: null, audio: null, reveal: null`, `sliderMarks: null`). Компоненти вебу ще не читають нових полів.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages apps/web/src
  git commit -m "feat(engine): public slider, audio and reveal fields — no correct value or audio source on phones, slider marks for the stage on the reveal and for the host"
  ```

### Задача 4. Сервер: завантаження аудіо, `Range`, кнопки звуку пульта, `stageOnline`

**Files:**
- Modify: `apps/server/src/storage/images.ts`, `apps/server/src/storage/r2.ts`, `apps/server/src/upload-routes.ts`, `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`, `packages/shared/src/events.ts`
- Test: `apps/server/src/storage/images.test.ts`, `apps/server/src/uploads.test.ts`, `apps/server/src/socket.test.ts` (або `rooms/manager.test.ts` для менеджера)

**Interfaces:**
- Produces (`storage/images.ts`):
  ```ts
  export type AudioType = 'audio/mpeg' | 'audio/ogg' | 'audio/mp4';
  export type MediaType = ImageType | AudioType;
  // ImageStorage.put(name, bytes, contentType: MediaType) — назва інтерфейсу лишається (менше змін у main.ts і app.ts)
  export const EXTENSIONS: Record<MediaType, string>; // + mp3, ogg, m4a
  /** Назва файлу сховища: зображення або аудіо. */
  export const isMediaName: (name: string) => boolean; // /^[a-z0-9]{16,64}\.(jpg|png|webp|mp3|ogg|m4a)$/
  export const isAudioName: (name: string) => boolean;
  /** Формат аудіо за вмістом: 'ID3' або кадр MPEG (0xFF, (b & 0xE0) === 0xE0) → mpeg; 'OggS' → ogg; 'ftyp' з 4-го байта → mp4; інакше null. */
  export function sniffAudio(bytes: Uint8Array): AudioType | null;
  ```
  - `memoryStorage`, `diskStorage` і `r2Storage` перевіряють назву через `isMediaName`; `isImageName` лишається для аватарів і там, де його вже вживають.
- Produces (`upload-routes.ts`):
  - **`POST /api/uploads/audio`** в окремій області з власним парсером `AUDIO_LIMITS.types` і `bodyLimit: AUDIO_LIMITS.maxBytes`; та сама перевірка сесії й ліміт частоти (той самий ключ `upload:…`).
    - Відповіді: 201 `{ url: '/uploads/<hex>.<ext>' }`; 400 `{ error: 'bad_audio' }` (вміст не аудіо); 413 `{ error: 'audio_too_large' }`.
    - Наявний `POST /api/uploads` і далі приймає лише зображення.
  - **`GET /uploads/:name`** приймає `isMediaName`. Тип береться з вмісту (`sniffImage` або `sniffAudio`), невідомий вміст — 404.
    - Додаються `accept-ranges: bytes` і підтримка одного діапазону `bytes=a-b` / `bytes=a-` → 206 з `content-range: bytes a-b/size`. Діапазон поза розміром → 416 з `content-range: bytes */size`.
    - Для зображень — так само (нешкідливо).
- Produces (`events.ts`):
  ```ts
  /** Команда звуку від пульта; назва не audioSchema, щоб не плутати зі схемою аудіо запитання. */
  export const audioCommandSchema = z.object({ action: z.enum(['replay', 'stop']) });
  // ClientToServerEvents:
  /** Звук поточного запитання: програти ще раз або зупинити (сцена, а без сцени — пульт). Годинник не змінюється. */
  'host:audio': (payload: z.infer<typeof audioCommandSchema>, ack: Ack) => void;
  // ServerToClientEvents:
  /** Команда звуку від ведучого; seq зростає в межах кімнати. Отримують лише сцена й пульт. */
  audio: (command: { action: 'replay' | 'stop'; seq: number }) => void;
  // StateMeta:
  /** Чи відкрита сцена (є з'єднання ролі stage): без сцени звук грає пульт. */
  stageOnline: boolean;
  ```
- Produces (`manager.ts`):
  - `RoomEvent` + `{ type: 'audio'; action: 'replay' | 'stop'; seq: number }`; `Room` + `audioSeq: number` (у пам'яті, у збережену кімнату не потрапляє, бо `snapshot` бере явний перелік полів — перевірити);
  - `stageOnline(room): boolean`;
  - `connect`/`disconnect` для ролі `stage`: `emit(room, { type: 'changed' })` на першому з'єднанні й після останнього;
  - `audio(room, action): AckResult`: `audioOf(room.state) === null` → `{ ok: false, error: 'wrong_phase' }`; інакше `seq = ++room.audioSeq`, `emit(room, { type: 'audio', action, seq })`, `{ ok: true }`.
- Produces (`socket.ts`):
  - `push` додає `stageOnline: manager.stageOnline(room)` у `StateMeta`;
  - `manager.onEvent`: подія `'audio'` → `members.filter((s) => s.data.identity.role !== 'player').forEach((s) => s.emit('audio', { action, seq }))`;
  - обробник `on('host:audio', …)`: не пульт → `FORBIDDEN`; невалідне → `INVALID`; інакше `manager.audio(room, action)`.

- [ ] **Step 1: Write the failing tests.**
  - `storage/images.test.ts`: `sniffAudio` для `ID3…`, кадру `FF FB 90 64`, `OggS`, `....ftypM4A ` → відповідні типи; PNG → `null`; `isMediaName('a'.repeat(32) + '.mp3')` true, `'../x.mp3'` false; `memoryStorage().put` з `.ogg` не кидає.
  - `uploads.test.ts`, `describe('uploading audio')` за зразком `uploading an image`. Помічник:
    ```ts
    /** Секунда тиші MP3: кадри MPEG-1 Layer III 128 кбіт/с 44,1 кГц із нульовими даними. */
    const silentMp3 = (frames = 38) => Buffer.concat(Array.from({ length: frames }, () => Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(413)])));
    ```
    Тести:
    - `stores an mp3 named by its content` (201, `url` відповідає `AUDIO_URL`, закінчення `.mp3`);
    - `stores ogg and m4a`;
    - `requires a session` (401);
    - `rejects content that is not audio` (PNG з `content-type: audio/mpeg` → 400 `bad_audio`);
    - `rejects audio above 5 MB` (413 `audio_too_large`);
    - `the image route still refuses audio` (mp3 на `/api/uploads` з `audio/mpeg` → 400 `bad_image`).

    `describe('serving audio')`:
    - `serves audio with its type and byte ranges` (GET → 200, `content-type: audio/mpeg`, `accept-ranges: bytes`; `range: bytes=0-9` → 206, `content-range: bytes 0-9/<len>`, тіло 10 байтів; `bytes=10-` → решта; `bytes=999999-` → 416);
    - `an image still serves as before`.
  - `socket.test.ts`, за зразком наявних тестів пульта й сцени:
    - `host:audio reaches the stage and the host, never the players` (вікторина з `withAudio`-запитанням: пульт, сцена, гравець; на запитанні пульт шле `host:audio { action: 'replay' }` → ack `{ ok: true }`; сцена й пульт отримують `audio { action: 'replay', seq: 1 }`, гравець — нічого за 200 мс; `stop` → `seq: 2`);
    - `host:audio outside an audio question is wrong_phase; a player cannot send it; a bad payload is invalid`;
    - `the host learns whether the stage is open` (пульт отримує `state` з `meta.stageOnline === false`; підключилась сцена → новий `state` з `true`; сцена відключилась → `false`).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсом. У `r2.ts` `put` передає `contentType` як є. `main.ts`, `app.ts` змін не потребують: тип `ImageStorage` той самий.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src/events.ts apps/server/src
  git commit -m "feat(server): audio uploads (mp3/ogg/m4a by content, up to 5 MB) served with byte ranges, host replay/stop relayed to the stage and host, stageOnline in the state meta"
  ```

### Задача 5. Історія, профіль, досягнення з новими типами; демо

**Files:**
- Test: `apps/server/src/history.test.ts`, `apps/server/src/achievements.test.ts` (або `profiles.test.ts` — де перевіряють `gameStats`/точність)
- Modify: `apps/server/scripts/demo-quiz.ts`, `apps/server/scripts/demo-quiz.test.ts`

**Interfaces:**
- Consumes: рушій задач 2–3; `recorder.ts` пише `record.accepted` без змін.
- Produces (`demo-quiz.ts`):
  ```ts
  export const slider = (text: string, range: { min: number; max: number; step?: number }, correct: number,
    options: { tolerance?: number; zeroBeyond?: number; unit?: string } = {}, points = 1000): Question;
  export const withAudio = (question: Question, audio: QuestionAudio): Question; // video: null
  export const revealing = (question: Question, mode: RevealMode = 'pixels'): Question;
  ```
  Демо `demo` отримує:
  - у класичному раунді — `slider('У якому році Україна проголосила незалежність?', { min: 1900, max: 2025 }, 1991, { zeroBeyond: 10, unit: 'рік' })`;
  - у класичному раунді — `withAudio(single('Назвіть гурт', ['Queen', 'ABBA', 'The Beatles', 'Pink Floyd'], 0), { source: 'youtube', id: 'fJ9rUzIMcZQ', start: 0, duration: 15 })`.

  Наявні запитання не змінюються, кількість запитань у тесті демо оновлюється.

- [ ] **Step 1: Write the failing tests.**
  - `history.test.ts`, `describe('history: slider and revealing picture (10b)')`. Помічники файлу — як у `history: spare questions`: гра через менеджер/рушій із записом. Тест `history shows slider answers and counts half price as correct`:
    - класика `[slider 0..100 (correct 50, tolerance 2, zeroBeyond 12, unit '%'), withReveal(text)]`; Оля 57 і правильний текст у мить 15 000 (475 балів), Петро 58 і неправильний текст;
    - історія: відповіді повзунка з `payload { type: 'slider', value: 57 }`;
    - `accepted`: Оля — true (повзунок), false (картинка, 475 < 500); Петро — false, false;
    - `correct` у підсумку гравців: Оля — `[0]`, Петро — `[]`.
  - Профіль (там, де перевіряють `gameStats`): той самий запис дає Олі точність 50 % (1 з 2). Досягнення «бездоганна гра» не видається, бо є `accepted = false`.
  - `demo-quiz.test.ts`:
    - `demo has a slider and a YouTube audio-only question` (тип `slider` з `zeroBeyond`; запитання з `audio.source === 'youtube'` і `video === null`);
    - уся вікторина проходить `quizSchema`;
    - `the helpers build valid questions` (`revealing(single(...), 'blur')` з картинкою проходить `questionSchema`).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/history.test.ts apps/server/scripts` → FAIL на демо. Тести історії мають пройти одразу, якщо рушій уже рахує `accepted` за 14a. Якщо так, це підтвердження, а не помилка задачі: залишити їх як регресію.
- [ ] **Step 3: Implement** помічники й запитання демо.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server
  git commit -m "test(server): history, profile accuracy and achievements count half-price slider and revealing-picture answers as correct; demo gets a slider and a YouTube audio-only question"
  ```

### Задача 6. Телефон: повзунок, картинка, що проявляється, табло «Слухайте»

**Files:**
- Create: `apps/web/src/screens/SliderInput.tsx`, `apps/web/src/screens/RevealImage.tsx`, `apps/web/src/reveal.ts`, `apps/web/src/reveal.test.ts`, `apps/web/src/screens/SliderInput.test.tsx`, `apps/web/src/screens/RevealImage.test.tsx`
- Modify: `apps/web/src/screens/AnswerInput.tsx`, `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/screens/SpotlightChoices.tsx`, `apps/web/src/live/Timer.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/AnswerInput.test.tsx`, `PlayerScreen.test.tsx`, `apps/web/src/live/Timer.test.tsx`, `SpotlightChoices.test.tsx`

**Interfaces:**
- Produces (`reveal.ts`):
  ```ts
  /** Стадій проявлення; на REVEAL_STAGES картинка повна. */
  export const REVEAL_STAGES = 10;
  /** Поступ 0…1 за зрізом: (limitMs − залишок) / answerWindowMs(question); поза етапом question або без таймера — 1. */
  export function revealProgress(view: { phase: Phase; endsAt: number | null; remainingMs: number | null; limitMs: number | null }, question: Pick<PublicQuestion, 'timeLimit' | 'audio'>, serverNow: number): number;
  export function revealStage(progress: number): number; // floor(p × 10), 0…10
  /** Стовпців пікселів на стадії: round(6 × 1,4^k); на стадії 10 — null (оригінал). */
  export function pixelColumns(stage: number): number | null;
  /** Радіус розмиття на стадії, px: round(28 × (1 − k/10)^1,5); на 10 — 0. */
  export function blurRadius(stage: number): number;
  /** Хук: поступ, що оновлюється кожні 250 мс, поки йде таймер. */
  export function useRevealProgress(view: …, question: … | null, offsetMs: number): number;
  ```
  `answerWindowMs` з shared приймає `{ timeLimit, audio }`. Публічне `audio` має лише `duration`, тож у вебі `windowMs = timeLimit × 1000 + (duration > timeLimit ? duration × 1000 : 0)` через допоміжну `publicWindowMs(question)` у `reveal.ts`, звірену тестом з `answerWindowMs`.
- Produces (`RevealImage.tsx`):
  ```tsx
  /** Картинка запитання з режимом проявлення; mode null — звичайна QuestionImage. stage — 0…10; на 10 — оригінал. */
  export function RevealImage({ url, mode, stage, alt }: { url: string | null; mode: RevealMode | null; stage: number; alt?: string }): JSX.Element | null;
  ```
  - Пікселі — `<canvas class="question-image reveal-canvas" data-stage={stage} aria-label={alt}>`: картинка малюється в невидимий canvas шириною `pixelColumns(stage)` і висотою за пропорцією, потім розтягується з `imageSmoothingEnabled = false`.
  - Розмиття — `<img class="question-image" style={{ filter: blur(…px) }} data-stage>` і `overflow: hidden` на обгортці, щоб краї не світилися.
  - Невдале завантаження — `null`, як у `QuestionImage`.
- Produces (`SliderInput.tsx`):
  ```tsx
  export function SliderInput({ question, onSubmit, submitLabel }: { question: PublicQuestion & { slider: PublicSlider }; onSubmit: (a: Answer) => void; submitLabel?: string }): JSX.Element;
  ```
  - Велике число `<output class="slider-value" aria-live="polite">` з одиницею;
  - `<input type="range" aria-label={t('sliderLabel')} min max step>`;
  - кнопки `«−»`/`«+»` з `aria-label` `t('sliderLess', { step })` / `t('sliderMore', { step })`, вимкнені на межах;
  - підписи меж під повзунком;
  - кнопка `submitLabel ?? t('submit')` → `{ type: 'slider', value }`;
  - старт — середина, вирівняна до кроку: `min + round((max − min) / 2 / step) × step`, округлення до знаків кроку проти похибки float.
- Changes:
  - `AnswerInput.tsx`: `case 'slider': return <SliderInput …/>` замість тимчасового `null`.
  - `Timer.tsx`: новий проп `leadMs?: number`. Поки `left × 1000 > total − leadMs`, табло показує `total − leadMs` (повний час запитання), статус «🎵 Слухайте» (`timerListening`) на місці «/ 30 с», смужка повна. `TimerStatus` + `'listening'`. Пауза й утримання мають пріоритет над «Слухайте».
  - `PlayerScreen.tsx`:
    - `QuestionImage` → `RevealImage` з `revealStage(useRevealProgress(...))`; від `locked` стадія 10;
    - під картинкою `question.reveal !== null` — рядок `t('revealHint')` і `t('revealNow', { percent })`, де `percent = round(revealShare(elapsed, window) × 100)`;
    - `Timer` отримує `leadMs`;
    - на екрані «відповідь прийнято» картинка далі проявляється за часом (не повна);
    - на розкритті повзунка — міні-шкала «Твоя відповідь: 57 % · правильна: 50 % (± 2)». Повна `SliderScale` з'явиться в задачі 7, тут — текстовий рядок `t('sliderYours', …)`.
  - `SpotlightChoices.tsx`: повзунок на полі показує значення вибравшого (`spotlightSlider`: «{name}: 57 %») або «Чекаємо на число…» (`spotlightWaitNumber`, наявний ключ).
  - `i18n.ts`:
    - `sliderLabel: 'Повзунок'`, `sliderLess: 'Менше на {step}'`, `sliderMore: 'Більше на {step}'`;
    - `sliderYours: 'Твоя відповідь: {value} · правильна: {correct}'`, `spotlightSlider: '{name}: {value}'`;
    - `revealHint: 'Картинка проявляється: що раніше відповіси, то більше балів.'`, `revealNow: 'Зараз: до {percent} % ціни'`;
    - `timerListening: '🎵 Слухайте'`.
  - `styles.css`: `.slider-input`, `.slider-value` (великий шрифт, `tabular-nums`), повзунок на всю ширину з великим повзунцем (≥ 44 px), `.reveal-canvas` (`image-rendering: pixelated`), `.reveal-frame`.

- [ ] **Step 1: Write the failing tests.**
  - `reveal.test.ts`:
    - `revealStage(0) === 0`, `(0.55) === 5`, `(1) === 10`;
    - `pixelColumns(0) === 6`, `(9) === 124`, `(10) === null`; `blurRadius(0) === 28`, `(10) === 0`;
    - `revealProgress` на `question`: `limitMs 20000`, `endsAt` за 15 000 від `serverNow` → 0.25; пауза з `remainingMs 5000` → 0.75; з `extraMs` (`limitMs 35000`, залишок 25 000) → 0.5; `locked` → 1;
    - з аудіо: `timeLimit 20`, `duration 30` → вікно 50 000;
    - `publicWindowMs` збігається з `answerWindowMs` shared для трьох прикладів.
  - `SliderInput.test.tsx`:
    - стартує з 50 на 0…100;
    - «Більше на 1» → 51, на `max` кнопка вимкнена;
    - зміна `range` на 73 → число «73 %»;
    - «Відповісти» → `onSubmit({ type: 'slider', value: 73 })`;
    - крок 0,5 → «2,5»;
    - крок 0,1 після десяти «+» дає рівно `1` (без `0.9999999`).
  - `RevealImage.test.tsx`: `mode 'pixels'` → `canvas[data-stage="3"]`; `'blur'` → `img` з `filter: blur(Npx)` за `blurRadius(3)`; `stage 10` → звичайний `img` без фільтра; `mode null` → `QuestionImage`. Canvas у jsdom мокнути через `HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn(), imageSmoothingEnabled: true }))`.
  - `Timer.test.tsx`: `leadMs 30000`, `total 50000`, залишок 40 000 → табло «20», статус «🎵 Слухайте»; залишок 15 000 → «15» і «/ 20 с»; пауза під час «Слухайте» → «Пауза».
  - `PlayerScreen.test.tsx`:
    - повзунок рендериться, надсилає `player:answer` з `slider`;
    - картинка `reveal: 'blur'` на `question` має `data-stage` < 10 і рядок «Картинка проявляється…»;
    - після відповіді (є `me.answer`) картинка не повна;
    - на `locked` — повна;
    - на розкритті повзунка — «Твоя відповідь: 57 % · правильна: 50 % (± 2)».
  - `SpotlightChoices.test.tsx`: повзунок на полі з відповіддю вибравшого → «Оля: 57 %».
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсом.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): slider on the phone with a big number and ± steps, revealing picture by pixels or blur that depends only on time, «🎵 Listen» timer during a long clip"
  ```

### Задача 7. Сцена й пульт: звук, кнопки звуку, шкала повзунка, проявлення на сцені

**Files:**
- Create: `apps/web/src/screens/QuestionAudio.tsx`, `apps/web/src/screens/SliderScale.tsx`, `apps/web/src/slider-scale.ts`, тести `QuestionAudio.test.tsx`, `SliderScale.test.tsx`, `slider-scale.test.ts`
- Modify: `apps/web/src/live/useGame.ts`, `apps/web/src/pages/Stage.tsx`, `apps/web/src/pages/Host.tsx`, `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/HostScreen.tsx`, `apps/web/src/screens/PlayerScreen.tsx` (міні-шкала замість рядка задачі 6), `apps/web/src/screens/YouTubePlayer.tsx` (експорт для команд), `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `useGame.test.tsx`, `StageScreen.test.tsx`, `HostScreen.test.tsx`

**Interfaces:**
- Produces (`useGame.ts`): повертає також `stageOnline: boolean` (з `meta.stageOnline`, типово `true`) і `audioCommand: { action: 'replay' | 'stop'; seq: number } | null` (останнє з події `audio`).
- Produces (`QuestionAudio.tsx`):
  ```tsx
  interface Props {
    clip: QuestionAudio;
    /** Ключ запитання (раунд:номер): новий ключ — фрагмент грає з початку. */
    questionKey: string;
    /** Чи можна починати: етап question і заставка скінчилась. */
    ready: boolean;
    paused: boolean;
    command: { action: 'replay' | 'stop'; seq: number } | null;
  }
  /** Грає фрагмент: файл через <audio>, YouTube — у прихованій рамці. data-state: idle|playing|stopped|blocked|failed; data-plays — скільки разів запускався. */
  export function QuestionAudio(props: Props): JSX.Element;
  ```
  - **Автостарт:** раз на `questionKey`, коли `ready`.
  - **Команди:** нова `command.seq` → `replay` (з початку) або `stop`.
  - **Пауза гри:** `paused` ставить на паузу, зняття паузи продовжує, якщо фрагмент не скінчився й не зупинений.
  - **Кінець фрагмента:** через `duration` с від старту (з урахуванням паузи) — зупинка, `stopped`.
  - **Без дотику до сторінки:** `navigator.userActivation?.hasBeenActive === false` → кнопка «🔊 Увімкнути звук» (`audioUnlock`), що запускає фрагмент.
  - **Помилки:** `play()` → `.catch`: `NotAllowedError` → `blocked` (та сама кнопка), інше → `failed` («Звук недоступний», `audioFailed`).
  - **Картка:** «🎵 Слухайте» з пульсом, поки грає.
  - **YouTube:** `<iframe class="audio-only-frame" aria-hidden tabIndex={-1} src={youtubeEmbedUrl({ id, start }, origin) + '&controls=0'}>`. Команди через `postMessage` `{ event: 'command', func: 'seekTo' | 'playVideo' | 'pauseVideo', args, id: 1, channel: 'widget' }` на `YOUTUBE_ORIGIN`.
- Produces (`slider-scale.ts`):
  ```ts
  /** Позиція значення на шкалі, % (0…100). */
  export function scalePct(value: number, min: number, max: number): number;
  /** Рядки підписів: позначки за значенням; кожна йде в перший рядок, де від попередньої не менше gapPct. */
  export function layoutMarks<T extends { value: number }>(marks: T[], min: number, max: number, gapPct?: number): (T & { pct: number; row: number })[];
  ```
- Produces (`SliderScale.tsx`):
  ```tsx
  export function SliderScale({ slider, correct, tolerance, zeroBeyond, marks, highlight }: {
    slider: PublicSlider; correct: number; tolerance: number; zeroBeyond?: number;
    marks: { playerId: string; nickname: string; value: number }[];
    /** Підсвітити найближчого (сцена) або себе (телефон). */
    highlight?: string;
  }): JSX.Element;
  ```
  - Вісь з підписами меж, смуга допуску (`.scale-tolerance`) і межі нуля (`.scale-zero`).
  - Правильне значення — великий маркер із підписом (`sliderNumber` + одиниця).
  - Позначки — шпильки з нікнеймами в рядках `layoutMarks`; `aria-label` «{nickname}: {value}».
- Changes:
  - `StageScreen.tsx`:
    - `QuestionImage` → `RevealImage` (той самий хук задачі 6);
    - підказка для повзунка: `t('sliderOnPhone', { min, max })` («Тягніть повзунок на телефоні: від 0 до 100 %»);
    - `QuestionAudio` — коли `question.audio?.clip`;
    - на розкритті повзунка — `SliderScale` з `view.sliderMarks`, `highlight` — найближчий (перший), замість рядка «Правильна відповідь»;
    - `Timer` отримує `leadMs`.
  - `HostScreen.tsx`:
    - панель `.host-audio`, коли `view.question?.audio?.clip` і етап `question`/`locked`/`reveal`. Рядок `stageOnline ? t('audioOnStage') : t('audioHere')`; кнопки «Програти ще раз» (`audioReplay`) і «Стоп» (`audioStop`) → `send('host:audio', { action })`. Без сцени (`!stageOnline`) у панелі є `QuestionAudio` з `command`, тож кнопки керують локальним звуком через ту саму подію `audio`;
    - картинка, що проявляється, на пульті — повна, з позначкою `t('revealTag_pixels')`/`t('revealTag_blur')` і `t('revealNow', …)`;
    - `SliderScale` з `view.sliderMarks` під відповідями (етапи `question`, `locked`, `reveal`);
    - `Timer` отримує `leadMs`.
  - `PlayerScreen.tsx`: рядок `sliderYours` на розкритті доповнюється `SliderScale` з однією позначкою (своєю) і `highlight` = свій id.
  - `Stage.tsx`/`Host.tsx` передають `stageOnline` і `audioCommand` з `useGame`.
  - `i18n.ts`:
    - `audioUnlock: '🔊 Увімкнути звук'`, `audioFailed: 'Звук недоступний'`, `audioListen: '🎵 Слухайте'`;
    - `audioOnStage: '🎵 Звук грає на сцені'`, `audioHere: '🎵 Сцена не відкрита — звук грає тут'`, `audioReplay: 'Програти ще раз'`, `audioStop: 'Стоп'`;
    - `sliderOnPhone: 'Тягніть повзунок на телефоні: від {min} до {max}'`;
    - `revealTag_pixels: 'Проявляється з пікселів'`, `revealTag_blur: 'Проявляється з розмиття'`.
  - `styles.css`: `.audio-card`, `.audio-only-frame` (200 × 200, `position: absolute`, `opacity: 0`, `pointer-events: none`), `.slider-scale` і його частини, `.host-audio`; сцена 1280 × 720 і телефон 375 без прокрутки вбік.

- [ ] **Step 1: Write the failing tests.**
  - `slider-scale.test.ts`: `scalePct(50, 0, 100) === 50`; `layoutMarks` з 50, 51, 80 і `gapPct 8` → рядки 0, 1, 0; позначки поза межами притискаються до 0 / 100.
  - `QuestionAudio.test.tsx` (мок `HTMLMediaElement.prototype.play` → `Promise.resolve()`, `pause` → `vi.fn()`, фальшиві таймери):
    - `ready` → `play` один раз, `currentTime === start`, `data-state="playing"`, `data-plays="1"`;
    - через `duration` с → `pause`, `stopped`;
    - нова `command { replay, seq: 1 }` → `data-plays="2"`; `{ stop, seq: 2 }` → `stopped`;
    - та сама `seq` після перерендеру нічого не робить;
    - `paused` → `pause`, зняття → `play`;
    - `play` відхиляється з `NotAllowedError` → кнопка «🔊 Увімкнути звук», дотик → `play` ще раз;
    - інша помилка → «Звук недоступний», без викинутої помилки;
    - YouTube-кліп: рамка з `youtube-nocookie.com/embed/<id>` і `aria-hidden`; `ready` → `postMessage` з `seekTo` і `playVideo`.
  - `SliderScale.test.tsx`: три позначки з `aria-label` «Оля: 57 %»; маркер правильного з «50 %»; смуга допуску займає `left: 48%; width: 4%` для 0…100, `tolerance 2`.
  - `useGame.test.tsx`: подія `audio` з'являється в `audioCommand`; `meta.stageOnline` — у `stageOnline`.
  - `StageScreen.test.tsx`:
    - на запитанні з `audio.clip` є `.audio-card`;
    - на розкритті повзунка — шкала з позначками й без рядка «Правильна відповідь»;
    - `reveal: 'pixels'` → `canvas[data-stage]`;
    - підказка «Тягніть повзунок на телефоні: від 0 до 100 %».
  - `HostScreen.test.tsx`:
    - з `stageOnline: true` — «🎵 Звук грає на сцені» і немає `.audio-card`;
    - «Програти ще раз» → `send('host:audio', { action: 'replay' })`; «Стоп» → `stop`;
    - з `stageOnline: false` — «Сцена не відкрита — звук грає тут» і є `QuestionAudio`;
    - картинка, що проявляється, на пульті — звичайний `img` з позначкою «Проявляється з пікселів»;
    - шкала повзунка видна на `question`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсом.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): stage plays the audio clip (host console without a stage) with replay/stop from the host, slider scale with every player's mark on the reveal, revealing picture on the stage"
  ```

### Задача 8. Редактор: повзунок, аудіо, «лише звук», режим картинки, перевірки чернетки

**Files:**
- Create: `apps/web/src/editor/AudioField.tsx`, `apps/web/src/editor/AudioField.test.tsx`
- Modify: `apps/web/src/editor/QuestionEditor.tsx`, `VideoField.tsx`, `BoardEditor.tsx`, `QuizEditor.tsx`, `SparesEditor.tsx`, `draft.ts`, `draft-storage.ts`, `apps/web/src/api.ts`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `QuizEditor.test.tsx`, `BoardEditor.test.tsx`, `draft.test.ts`, `draft-storage.test.ts`, `api.test.ts`

**Interfaces:**
- Produces (`api.ts`): `uploadAudio(file: File): Promise<ApiResult<{ url: string }>>` → `POST /api/uploads/audio` з `content-type: file.type || 'audio/mpeg'`.
- Produces (`AudioField.tsx`):
  ```tsx
  interface Props {
    audio: QuestionAudio | undefined;
    /** Час запитання, с: для підказки про відкладений таймер. */
    timeLimit: number;
    onChange: (audio: QuestionAudio | undefined) => void;
    /** «Лише звук» знято: повернути YouTube-аудіо у відео. */
    onToVideo: (video: Video) => void;
  }
  ```
  - **Без аудіо:** кнопка-файл «Додати аудіо» (`addAudio`, `accept` = `AUDIO_LIMITS.types` + `.mp3,.ogg,.m4a`). Клієнтські перевірки: тип (`err_bad_audio`) і розмір (`err_audio_too_large`).
  - **Після завантаження:** тривалість файлу читається через `loadedmetadata` (тайм-аут 3 с; не вдалося — `LIMITS.defaultAudioSeconds`). Значення: `{ source: 'file', url, start: 0, duration: min(round(fileSeconds), LIMITS.defaultAudioSeconds) }`.
  - **З файлом:** підпис «Аудіофайл», кнопка «▶ Прослухати фрагмент» (`audioPreview`, грає від `start` `duration` с, повторний натиск зупиняє), поля «Початок, с» (`audioStart`) і «Тривалість, с» (`audioDuration`), «Замінити аудіо», «Прибрати аудіо».
  - **З YouTube:** рядок «YouTube — лише звук: {посилання}», поле «Тривалість, с», прапорець «Лише звук» увімкнений; зняття → `onToVideo({ id, start })`.
  - **Підказка часу.** Тривалість > час запитання: `t('audioLeadHint', { audio, time, total })` — «Фрагмент 40 с довший за час 30 с: таймер стартує після фрагмента (разом 70 с).». Інакше `t('audioParallelHint')` — «Таймер іде разом зі звуком.».
  - Помилки завантаження — як у `ImageField`, через `errorText`.
- Changes (`VideoField.tsx`): проп `onAudioOnly?: (video: Video) => void`. Коли посилання розібрано й проп є, під плеєром з'являється прапорець «Лише звук (картинку сховано)» (`audioOnly`). Позначка → `onAudioOnly(video)`.
- Changes (`QuestionEditor.tsx`):
  - Нові пропи:
    - `showAudio?: boolean` — типово `true`; `SparesEditor` → `false`;
    - `showReveal?: boolean` — типово `false`. `QuizEditor` → `round.type === 'classic'`, `BoardEditor` → `cell.kind === 'normal' && cellAnswerMode(round, cell) === 'phone'`.
  - **Поле відео** (коли видне) отримує `onAudioOnly`: `{ ...question, video: null, audio: { source: 'youtube', id, start, duration: LIMITS.defaultAudioSeconds } }`.
  - **`AudioField`** (коли `showAudio`). Ховається, поки є відео: відео й аудіо разом не можна, а з відео в аудіо веде лише «Лише звук». `onToVideo` → `{ ...question, audio: undefined (ключ прибрано), video }`.
  - **Вибір режиму картинки** — коли `showReveal && question.imageUrl !== null && question.video === null && REVEAL_TYPES.includes(question.type)`. Група з трьох кнопок `aria-pressed`: «Звичайна» (`revealNone`), «З пікселів» (`revealPixels`), «З розмиття» (`revealBlur`) під картинкою. «Звичайна» прибирає ключ `reveal`.
  - **Прибирання картинки** прибирає й `reveal`.
  - **Час.** Поле часу видно й для аудіо (таймер є). `noTimerHint` — лише для відео.
  - **`Body`, `case 'slider'`:**
    - пари полів `NumberField decimal`: «Мінімум» (`sliderMin`) / «Максимум» (`sliderMax`), «Крок» (`sliderStep`) / «Одиниця» (`sliderUnit`, текст, `maxLength LIMITS.sliderUnit`, плейсхолдер «км, рік, %»);
    - «Правильне значення» (`sliderCorrect`) / «Допуск ±» (`sliderTolerance`);
    - «Нуль балів далі ніж ±» (`sliderZero`): порожнє поле прибирає `zeroBeyond`, плейсхолдер «лише повні або нуль»;
    - вимкнений повзунок-прев'ю з правильним значенням;
    - `t('sliderHint')` — «У допуску — повні бали; далі бали спадають до нуля на межі «нуль балів». Без межі — лише повні або нуль. Половина ціни й більше вважається правильною відповіддю.».
- Changes (`BoardEditor.tsx`): `setCell` при `kind: 'blitz'` або `answerMode: 'voice'` прибирає `reveal` з запитання клітинки.
- Changes (`draft.ts`):
  - **`cleanQuestion`:** `unit` обрізається, порожня прибирається; `zeroBeyond` `NaN` прибирається; `reveal` без картинки прибирається тихо (картинку прибрали).
  - **`problemKey` (повзунок):**
    - нескінченні числа, `min ≥ max`, `step ≤ 0`, `(max − min) / step` понад ліміт або нецілий → `problemSliderRange` («Запитання {index}: повзунок — перевірте мінімум, максимум і крок.»);
    - `correct` поза межами або `tolerance < 0` → `problemSliderCorrect` («Запитання {index}: правильне значення має бути між мінімумом і максимумом.»);
    - `zeroBeyond ≤ tolerance` → `problemSliderZero` («Запитання {index}: межа «нуль балів» має бути більшою за допуск.»).
  - **`problemKey` (аудіо, будь-який тип):** `start`/`duration` не цілі або поза межами → `problemAudio` («Запитання {index}: аудіо — початок від 0 с, тривалість від 1 до 120 с.», числа з `LIMITS`).
  - **`problemsOf` (місце проявлення):** `reveal` у бліці чи фіналі → `where(t('problemRevealPlace', { index }))` («Запитання {index}: картинка, що проявляється, діє лише в класиці й на звичайній клітинці поля з телефона.»). На клітинці бліц/«вголос» — те саме речення через `cellProblem`. Окремих речень для схемних кодів `reveal_*`, `audio_video`, `slider_*` у фінальній перевірці не треба: перевірки вище ловлять ці випадки раніше. `reveal_image` неможливий, бо `cleanQuestion` прибирає режим без картинки; `audio_video` неможливий, бо редактор не показує обидва поля.
- Changes (`draft-storage.ts`, `revive`):
  - повзунок: `min`, `max`, `step`, `correct`, `tolerance` через `numberOr`; `zeroBeyond` — число або ключ прибрано; `unit` — рядок або прибрано;
  - `audio` лишається, якщо `source` і `url`/`id` правильні, а `start`/`duration` — через `numberOr`; інакше прибирається;
  - `reveal` — `'pixels' | 'blur'` або прибирається.
- `i18n.ts`:
  - аудіо: `addAudio`, `replaceAudio`, `removeAudio`, `audioLabel: 'Аудіо до запитання'`, `audioFile: 'Аудіофайл'`, `audioYoutube: 'YouTube — лише звук: {link}'`, `audioStart: 'Початок, с'`, `audioDuration: 'Тривалість, с'`, `audioPreview: '▶ Прослухати фрагмент'`, `audioOnly: 'Лише звук (картинку сховано)'`, `audioLeadHint`, `audioParallelHint`;
  - помилки: `err_bad_audio: 'Підходять лише аудіо MP3, OGG або M4A.'`, `err_audio_too_large: 'Аудіо завелике: дозволено до 5 МБ.'`;
  - картинка: `revealLabel: 'Картинка, що проявляється'`, `revealNone: 'Звичайна'`, `revealPixels: 'З пікселів'`, `revealBlur: 'З розмиття'`;
  - повзунок: `sliderMin`, `sliderMax`, `sliderStep`, `sliderUnit`, `sliderUnitPlaceholder`, `sliderCorrect`, `sliderTolerance`, `sliderZero`, `sliderZeroPlaceholder`, `sliderHint`;
  - перевірки: `problemSliderRange`, `problemSliderCorrect`, `problemSliderZero`, `problemAudio`, `problemRevealPlace`.

- [ ] **Step 1: Write the failing tests.**
  - `draft.test.ts`:
    - `problemsOf` для повзунка з `min 10, max 10` → `problemSliderRange`; `correct 200` → `problemSliderCorrect`; `zeroBeyond 1, tolerance 2` → `problemSliderZero`; правильний повзунок — `[]`;
    - аудіо `duration 0` → `problemAudio`;
    - `reveal` у бліці → `problemRevealPlace` з «Раунд 2»; на звичайній клітинці з телефона — без проблем; на бліц-клітинці — проблема;
    - `cleaned` прибирає порожню `unit` і `reveal` без картинки.
  - `draft-storage.test.ts`: повзунок з порожнім полем (`NaN` → `null` у JSON) відновлюється з `NaN` і проблемою; `audio` з чужою адресою прибирається; `reveal: 'sparkles'` прибирається.
  - `api.test.ts`: `uploadAudio` шле `POST /api/uploads/audio` з типом файлу.
  - `AudioField.test.tsx`:
    - вибір `song.mp3` (`audio/mpeg`, мок `uploadAudio` → `/uploads/<hex>.mp3`, мок тривалості 42 с) → `onChange({ source: 'file', url, start: 0, duration: 15 })`;
    - `image/png` → «Підходять лише аудіо MP3, OGG або M4A.» без запиту;
    - 6 МБ → «Аудіо завелике…»;
    - тривалість 40 за часу 30 → «Фрагмент 40 с довший за час 30 с: таймер стартує після фрагмента (разом 70 с).»;
    - YouTube-аудіо: зняття «Лише звук» → `onToVideo({ id, start })`.
  - `QuizEditor.test.tsx`:
    - чип «повзунок» → поля «Мінімум»…«Нуль балів далі ніж ±»; заповнення й «Зберегти» шлють вікторину з `{ type: 'slider', min: 1900, max: 2025, step: 1, correct: 1991, tolerance: 0, zeroBeyond: 10, unit: 'рік' }`;
    - у класиці з картинкою є «З пікселів»; натиск → `reveal: 'pixels'` у збереженому; у фіналі вибору немає;
    - поле відео з посиланням → «Лише звук (картинку сховано)» → поле відео зникає, є «YouTube — лише звук», у збереженому `audio.source === 'youtube'`, `video === null`;
    - запасні запитання не мають ні аудіо, ні вибору режиму.
  - `BoardEditor.test.tsx`: звичайна клітинка з картинкою має вибір режиму; перемикання на «Бліц» прибирає `reveal` і ховає вибір.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/editor apps/web/src/api.test.ts` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсом. `NumberField decimal` уже вміє коми. На 375 px пари полів переходять в один стовпчик (наявний клас `.pair`).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): editor for the slider, audio clip (file upload or YouTube audio only) with start and duration, revealing-picture mode where it works, draft checks"
  ```

### Задача 9. Довідка ведучого: аудіо, картинка, що проявляється, оновлені записи; «ⓘ» у редакторі й на пульті

**Files:**
- Modify: `apps/web/src/help/settings.ts`, `apps/web/src/help/questions.ts`, `apps/web/src/help/rounds.ts`, `apps/web/src/help/powers.ts`, `apps/web/src/editor/AudioField.tsx`, `apps/web/src/editor/QuestionEditor.tsx`, `apps/web/src/screens/HostScreen.tsx`
- Test: `apps/web/src/help/host-help.test.ts`, `QuizEditor.test.tsx`, `HostScreen.test.tsx`

**Interfaces:**
- Produces (`settings.ts`): `SETTING_HELP_KEYS` + `'audio'`, `'reveal'` (у кінці переліку) і записи:
  - `audio`:
    - `title: 'Аудіо до запитання'` (= `t('audioLabel')`);
    - «Що це»: звук до запитання будь-якого типу — файл або YouTube «лише звук»;
    - «Як іде в грі»: звук грає на сцені, без сцени — на пульті; телефони не грають; кнопки «Програти ще раз» і «Стоп»; фрагмент коротший за час — таймер паралельно, довший — таймер стартує після фрагмента («🎵 Слухайте» на табло); пауза гри ставить звук на паузу; на сцені може знадобитися один дотик «🔊 Увімкнути звук»;
    - «Бали»: «На бали не впливає; бонус за швидкість рахується від усього часу разом зі звуком.»;
    - «Порада»: «Музичний раунд — звичайний раунд, де всі запитання з аудіо.», «5–15 секунд фрагмента досить, щоб упізнати пісню.», «YouTube «лише звук» ховає картинку й назву ролика.»;
    - «Обмеження»: `MP3, OGG або M4A до ${AUDIO_LIMITS.maxBytes / 1024 / 1024} МБ.`, `Фрагмент від ${LIMITS.minAudioSeconds} до ${LIMITS.maxAudioSeconds} с.`, «Не разом зі звичайним відео; не в запасних запитаннях.».
  - `reveal`:
    - `title: 'Картинка, що проявляється'` (= `t('revealLabel')`);
    - «Як іде в грі»: картинка стає чіткою за час запитання на сцені й телефонах; стадія залежить лише від часу; відповідь одна;
    - «Бали»: `Миттєва відповідь — 100 % ціни, у мить повного проявлення — ${REVEAL_MIN_SHARE * 100} %, між ними — рівномірно.`, «Бонусу за швидкість немає — він уже вбудований.», «Правильною для серій і точності вважається відповідь, що дала щонайменше половину ціни.»;
    - «Порада»: «Беріть упізнавані картинки: логотипи, обличчя, місця.», «Розмиття м’якше, пікселі — складніше.»;
    - «Обмеження»: «Лише «один варіант», «текст» і «число»; лише класика й звичайна клітинка поля з телефона.», «Друга спроба недоступна.», «Хитрий гравець з інструментами розробника може побачити оригінал картинки.».
- Changes:
  - `questions.ts`: `numeric.tip` + «Хочете, щоб гравці не вводили, а тягнули, — візьміть «Повзунок».».
  - `rounds.ts`: `classic.tip` + «Тематичний чи музичний раунд — це звичайний раунд, де всі запитання одного виду (наприклад, усі з аудіо).».
  - `powers.ts`: `retry.limits` + «Не діє на картинці, що проявляється.»; `audience` — повзунок серед простих типів, якщо типи там перелічено.
  - `settings.ts`: `speedBonus` — «Не нараховується на картинці, що проявляється.».
  - «ⓘ» у редакторі: `<HelpButton id="setting.audio" />` у заголовку `AudioField`, `<HelpButton id="setting.reveal" />` біля групи режимів картинки (обгортка `.with-help`, поза `<label>`).
  - Пульт: у `.host-context` після типу запитання — «· 🎵 ⓘ» (`setting.audio`), якщо в запитання є аудіо, і «· {revealTag} ⓘ» (`setting.reveal`), якщо `reveal !== null`.

- [ ] **Step 1: Write the failing tests.**
  - `host-help.test.ts`:
    - наявний тест «кожне налаштування з переліку має запис» тепер покриває `audio` і `reveal`;
    - новий `10b entries tell the engine numbers`: `helpEntry('setting.reveal').points.join(' ')` містить «100 %» і `${REVEAL_MIN_SHARE * 100} %`; `setting.audio.limits` містить «5 МБ» і `${LIMITS.maxAudioSeconds} с`; `question.slider.points` містить «половин»;
    - `titles match the editor labels`: `helpEntry('setting.audio').title === t('audioLabel')`, `setting.reveal` — `t('revealLabel')`, `question.slider` — `t('type_slider')`.
  - `QuizEditor.test.tsx`: «Довідка: Аудіо до запитання» і «Довідка: Картинка, що проявляється» відкривають вікна; вікторина не стає «зміненою».
  - `HostScreen.test.tsx`: запитання з аудіо й `reveal: 'blur'` → у `.host-context` кнопки «Довідка: Аудіо до запитання» і «Довідка: Картинка, що проявляється»; натиск нічого не надсилає.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/help apps/web/src/editor apps/web/src/screens/HostScreen.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Звірити кожне речення з рушієм задачі 2 і з рішеннями плану.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "docs(web): host help for the audio clip, the revealing picture and the slider; music-round tip, retry and speed-bonus limits; ⓘ in the editor and on the host console"
  ```

### Задача 10. Наскрізний сценарій 10b з кадрами

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–9.
  - Помічники: `open`, `register`, `join`, `click`, `field`, `questionText`, `shot`, `afterSplash`, `seconds`, `expectNoSideScroll`, `snapshot`, `problems`, `avatarPng`, `exact`.
  - Фікстури: `classicRound`, `makeRoundsQuiz`, `withId`.
  - YouTube у тестах — заглушка `youtubeStub`: вона мовчки приймає команди `seekTo` і `playVideo`.
- Новий помічник у файлі:
  ```ts
  /** Секунда тиші MP3 (кадри MPEG-1 Layer III з нульовими даними): Chromium її декодує. */
  function silentMp3(frames = 38): Buffer { … як у задачі 4 … }
  /** Стадія проявлення картинки на сторінці (data-stage) або null. */
  const revealStageOf = async (page: Page) => Number(await page.locator('[data-stage]').first().getAttribute('data-stage'));
  ```

- [ ] **Step 1: Add the scenario** у кінець файлу за зразком 10a:
  ```ts
  it('part 10b: slider, audio and revealing picture — the editor builds them, the host plays a clip without a stage, the stage plays and obeys replay/stop, the timer waits for a long clip, the slider scale on the reveal, the picture sharpens with time and pays less later', async () => {
    try {
      await sliderAudioRevealGame();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Підготовка `sliderAudioRevealGame()`:**
  1. `const host = await open('host10b', 1280, 900); await register(host, 'host', 'Ірина Ведуча', 'host10b@example.com');`
  2. Завантажити картинку: `const img = (await (await host.request.post(`${base}/api/uploads`, { data: avatarPng(), headers: { 'content-type': 'image/png' } })).json()).url`.
  3. Вікторина «Звуки й картинки 10b» через `POST /api/quizzes`, класичний раунд `r1` «Звуки й картинки» (`speedBonus: true`):
     - `a1` single «Що це за звук?» — «Тиша» (правильний), «Дзвін», 20 с, 1000 балів. Без аудіо: аудіо додасть редактор;
     - `s1` slider «Скільки відсотків поверхні Землі вкриває вода?», 0…100, крок 1, правильне 71, допуск 2, `zeroBeyond` 12, одиниця «%», 30 с, 1000;
     - `y1` single «Назвіть гурт» — «Queen» (правильний), «ABBA», 5 с, 1000, `audio: { source: 'youtube', id: 'fJ9rUzIMcZQ', start: 0, duration: 8 }`;
     - `p1` text «Що на картинці?» (`accepted: ['Коло', 'Жовте коло']`), `imageUrl: img`, `reveal: 'pixels'`, 12 с, 1000.

  **Кроки з перевірками й кадрами (у такому порядку):**
  1. **Редактор (1280 × 900).** «Редагувати» у «Звуки й картинки 10b»:
     - **Запитання 1.** «Додати аудіо» ← `setInputFiles({ name: 'silence.mp3', mimeType: 'audio/mpeg', buffer: silentMp3() })` → з'являються «Аудіофайл», «Початок, с», «Тривалість, с». Поле «Тривалість, с» показує ≤ 15 (файл триває секунду → 1) → заповнити «2» → «Таймер іде разом зі звуком.» → кадр `slider10b-editor-audio`.
     - **Запитання 2 (повзунок).** Поля «Мінімум» = 0, «Максимум» = 100, «Правильне значення» = 71, «Нуль балів далі ніж ±» = 12 → кадр `slider10b-editor-slider`.
     - Вписати «Мінімум» = 100 → у панелі проблем «повзунок — перевірте мінімум, максимум і крок» → повернути 0.
     - **Запитання 4.** Кнопка «З пікселів» має `aria-pressed="true"` → кадр `slider10b-editor-reveal`.
     - **Запитання 3.** «YouTube — лише звук» і «Фрагмент 8 с довший за час 5 с: таймер стартує після фрагмента (разом 13 с).».
     - 375 × 812: `expectNoSideScroll(host, 'slider10b-editor-375')` → назад 1280 × 900.
     - «Зберегти». Потім `GET /api/quizzes/<id>`: у запитання `a1` `audio.source === 'file'`, `audio.url` відповідає `/uploads/…mp3`, `audio.duration === 2`.
  2. **Гра без сцени.**
     - «Грати» → `code`, `stageUrl` (посилання «Відкрити сцену», як у `hostDiceQuiz`).
     - `olya = open('olya10b', 375, 812)`, `petro = open('petro10b', 375, 812)`, `join` обох.
     - «Почати гру» → `afterSplash` → «Почати раунд» → `afterSplash(host, olya, petro)`.
     - **Запитання 1 (аудіо з файлу, сцени немає).** На пульті «🎵 Сцена не відкрита — звук грає тут».
     - Якщо видна «🔊 Увімкнути звук» — натиснути. `host.locator('[data-plays]')` має `data-plays="1"` → кадр `audio10b-host-local`.
     - «Програти ще раз» → `data-plays="2"`.
     - Телефони не мають `audio`, `iframe` ні `.audio-card` (`olya.locator('audio, .audio-card, .audio-only-frame').count() === 0`).
     - Оля торкається «Тиша», Петро — «Дзвін» → «Показати відповідь» → «Далі» (до наступного запитання, `afterSplash`).
  3. **Сцена й повзунок.**
     - `stage = open('stage10b', 1280, 720); stage.goto(stageUrl)`. Пульт показує «🎵 Звук грає на сцені» лише на запитаннях з аудіо, тож тут перевірки немає.
     - **Запитання 2.** Сцена — «Тягніть повзунок на телефоні: від 0 до 100 %».
     - На телефоні Олі велике число «50 %». «Більше на 1» ×3 → «53 %». Повзунок `fill('70')` (Playwright для `input[type=range]` → `locator.fill`) → «70 %» → кадр `slider10b-phone-slider` (375) → `expectNoSideScroll(olya, 'slider10b-phone')` → «Відповісти».
     - Петро ставить 80 → «Відповісти».
     - «Показати відповідь» → на сцені `.slider-scale` з позначками `aria-label` «Оля: 70 %» і «Петро: 80 %», правильне «71 %» → кадр `slider10b-stage-scale`.
     - На телефоні Олі «Твоя відповідь: 70 % · правильна: 71 % (± 2)».
     - Бали з рядків відповідей пульта: в Олі більше 0 (у допуску, з бонусом за швидкість). Петро (відстань 9, частка 0,3) має менше, ніж Оля, але більше 0. Точних чисел не перевіряти: їх змінює бонус за швидкість.
     - «Далі» до наступного запитання (через рейтинг, якщо він є).
  4. **Аудіо з YouTube, довгий фрагмент.**
     - Сцена: якщо видна «🔊 Увімкнути звук» — натиснути. `stage.locator('[data-plays]')` → `data-plays="1"`, `.audio-only-frame` має `aria-hidden="true"`.
     - Табло сцени показує «🎵 Слухайте» → кадр `audio10b-stage-listening`.
     - На пульті «🎵 Звук грає на сцені», локального `[data-plays]` на пульті немає → «Програти ще раз» → сцена `data-plays="2"` → «Стоп» → сцена `data-state="stopped"` → кадр `audio10b-host-controls` (пульт).
     - `seconds(stage)` через 1 с усе ще показує 5 (таймер чекає фрагмента).
     - Оля торкається «Queen» → Петро мовчить → чекати автозакриття (≈ 13 с від старту) або «Закрити» на пульті → «Показати відповідь» → «Далі».
  5. **Картинка, що проявляється (12 с).**
     - Одразу після `afterSplash`: `revealStageOf(stage) ≤ 2` → кадр `reveal10b-stage-early`.
     - На телефоні Петра рядок «Картинка проявляється: що раніше відповіси, то більше балів.».
     - Оля через ~1 с вписує «Коло» → «Відповісти».
     - Чекати ~6 с: `revealStageOf(olya) ≥ 4` (після відповіді картинка в Олі не повна) і `< 10` → кадр `reveal10b-phone-mid` (Оля, 375).
     - Петро вписує «Квадрат» → запитання закривається → `revealStageOf(stage) === 10` або немає `canvas` (оригінал) → кадр `reveal10b-stage-full`.
     - «Показати відповідь»: у Олі бали в межах 850…1000 (відповідь до ~2 с: 1 − 0,7 × 2/12 ≈ 0,88), у Петра 0. Перевірка за рядком відповідей пульта.
  6. `expect(problems).toEqual([])`.

- [ ] **Step 2: Run** `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв.
  - Наявні сценарії шукають кнопки за назвою. Новий чип «повзунок» може зачепити `getByRole('button', { name: 'число' })` без `exact` — тоді додати `exact`.
  - Якщо Chromium у тесті не декодує тишу MP3, на картці буде «Звук недоступний». Перевірки `data-plays` від цього не залежать, тож сценарій лишається чесним; записати це в звіт задачі.
  - Переглянути кадри в `apps/server/e2e/artifacts/shots`:
    - повзунок на 375 px керується пальцем, число велике, кнопки ± не налазять;
    - шкала на сцені читається, підписи не накладаються;
    - стадії картинки помітно різні (рання — великі блоки, середня — дрібніші, повна — оригінал);
    - панель звуку на пульті не ламає верстку запитання;
    - «🎵 Слухайте» на табло сцени не зсуває екран.
- [ ] **Step 3: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 4: Commit**
  ```bash
  git add apps/server/e2e/full-game.e2e.ts
  git commit -m "test: part 10b end-to-end — editor builds a slider, an audio clip and a revealing picture; host plays a clip without a stage, the stage plays and obeys replay/stop, the timer waits for a long clip; slider scale on the reveal; the picture sharpens with time and pays less later"
  ```

Після фінальної рецензії гілку злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`. `GAME_STATE_VERSION` не змінювався, тож пуш ігор, що йдуть, не перериває.

У звіті власникові назвати рішення:
- **Повзунок:**
  - бали лінійно до нуля на межі «нуль балів», без межі — повні або нуль;
  - половина ціни й більше — «правильно»;
  - у бліці й фіналі — лише влучання в допуск;
  - діє «Друга спроба» і «Запитання в залі».
- **Аудіо:**
  - файл або YouTube «лише звук» (прапорець у полі відео);
  - фрагмент до 120 с;
  - довгий фрагмент відкладає таймер («🎵 Слухайте»);
  - сцена грає сама, без сцени — пульт;
  - телефони не отримують навіть посилання (щоб не видати назву пісні);
  - на сцені може знадобитися один дотик «🔊 Увімкнути звук».
- **Картинка, що проявляється:**
  - 10 стадій за час запитання;
  - бали 100 % → 30 %, без бонусу швидкості й без другої спроби;
  - за 14a відповідь після ~71 % часу ще дає бали, але для серій і точності не «правильна»;
  - оригінал можна дістати інструментами розробника (серверне пікселювання — можливе наступне покращення).
- **Демо:** у «demo» — повзунок і YouTube «лише звук»; картинку, що проявляється, покаже вітрина 10k.
