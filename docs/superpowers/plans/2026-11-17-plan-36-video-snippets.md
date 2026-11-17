# План 36: запитання «Відео за фрагментами» (`videoclip`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Звірка з кодом.** План спирається на назви з `main` на 2026-11-17 (`7829311a`):
> - `QUESTION_TYPES` — 29 типів: `… 'memory', 'melody', 'bluff', 'think'` (`packages/shared/src/question-types.ts`), `QUESTION_TYPE_TRAITS.melody`;
> - `GAME_STATE_VERSION = 22` (`packages/engine/src/restore.ts`, коментар `29e без нової версії…` ~85);
> - найновіші списки ключів у `apps/web/src/i18n.test.ts` — `ADDED_THINK`, `ADDED_35` (судоку), `ADDED_MEMORY_PEEK`. Назви `ADDED_36*` **не** брати (номери вже плутались), беремо `ADDED_VIDEOCLIP` і `ADDED_VIDEOCLIP_PLURALS`.
>
> Зразок — «Мелодія за нотами» (29e), увесь її код:
> - `packages/shared/src/melody.ts` (`MELODY_STEPS`, `MELODY_SHARES`, `MELODY_STEP_COUNT`, `MELODY_REVEAL_SECONDS`, `melodyShare`, `melodySeconds`, `melodyClip`, `melodyRevealClip`);
> - `packages/engine/src/melody.ts` (`melodyHeard`, `melodyPaid`, `melodyOpen`, `melodyStartEnd`), гілки `melody` у `game.ts` (~237 `Play.melody`, ~671 `MelodyPlay`, ~1233 вилучення, ~1570 `openQuestion`, ~2157 `submitAnswer`, ~2847 оцінка ведучого), `check.ts` (~129, ~198, ~208), `team-act.ts` ~98, `answerer.ts` ~60/124/138, `buffs.ts` ~196, `debuffs.ts` ~23/187, `live.ts` ~181, `views.ts` (~380 `publicMelody`, ~537 `audioOf`, ~2115 `currentMelody`/`melodyInfo`/`playerMelody`, ~3227, ~3676);
> - сервер: `RoomManager.melodyOpen` (~1889), `watchTimers` з `melodyStartEnd` (~1855), `on('player:melody')` у `socket.ts` (~626);
> - веб: `screens/MelodyView.tsx` (`MelodySteps`, `MelodyPlay`, `MelodyBoards`, `MelodyTable`, `MelodyStage`), `live/useMelodyClip.tsx`, `editor/MelodyEditor.tsx`, гілки `melody` у `PlayerScreen.tsx` (~765, ~1260, ~1812), `StageScreen.tsx` (~263, ~377, ~563), `HostScreen.tsx` (~373, ~879, ~1249), `LiveAnswers.tsx`, `AnswerInput.tsx`, `QuestionEditor.tsx` (~829, ~913–965), `draft.ts`, `draft-storage.ts`, `format.ts`, `live-drafts.ts`, `admin/admin-text.ts`, `guide-text.ts`, `live/speech.ts` ~83, `round-brief.ts` ~114;
> - YouTube: `screens/YouTubePlayer.tsx` (`YOUTUBE_ORIGIN`, `youtubeEmbedUrl`, `.video-mask`), `screens/QuestionAudio.tsx` (`YOUTUBE_BLOCK_MS`), `editor/VideoField.tsx`, `packages/shared/src/youtube.ts` (`parseYouTubeLink`, `videoLink`), `videoSchema`/`Video`/`YOUTUBE_ID` у `quiz.ts`;
> - e2e: `apps/server/e2e/part29-memory-melody.e2e.ts` (частина 29e), заглушка YouTube `youtubeStub`/`BROKEN_VIDEO` (`apps/server/e2e/helpers/setup.ts` ~60) і маршрут у `open` (`helpers/common.ts` ~22), світла тема — `part35-think.e2e.ts` ~287.
>
> **Перед кожною задачею виконавець звіряє назви й рядки з фактичним кодом** (`git grep -n melody -- packages apps` — повний перелік місць). Розбіжність — привід міняти лише назви й рядки, не рішення плану.

**Мета:** новий тип запитання `videoclip` («Відео за фрагментами») — відеоаналог «Мелодії». Ведучий вставляє посилання YouTube, задає секунду початку фрагмента, вмикач «Без звуку / Зі звуком» і прийнятні написання відповіді. Кожен гравець на **своєму** телефоні дотиком відкриває шматки 1, 2, 4, 8, 16 с (кожен — з початку фрагмента), переглядає відкрите скільки завгодно й один раз пише відповідь. Бали — частка ціни за найдовшим відкритим шматком: 100 / 80 / 60 / 40 / 25 %; неправильно чи без відповіді — 0. Сцена під час запитання відео не показує (лише хто відповів і на якому шматку); після часу відео грає на сцені, показуються відповідь і бали.

**Архітектура:**
- **Спільні шматки (`shared/src/snippets.ts`, новий, чистий).** Сходинки, частки, тривалість розкриття й функції `snippetShare`/`snippetSeconds` **виносяться** з `melody.ts`; `melody.ts` лишає старі назви як псевдоніми (`MELODY_STEPS = SNIPPET_STEPS` …), тож наявний код і тести «Мелодії» не міняються.
- **Запитання (`quiz.ts`).** `{ ...base, type: 'videoclip', timeLimit 25…120, clip: Video /* { id, start } — наявний videoSchema */, muted: boolean, accepted: spellings }`. Лише в раундах `classic` (як `melody`).
- **Стан (`engine/src/snippets.ts`, новий).** Шматки обох типів живуть у **наявному** необов'язковому полі `Play.melody?: MelodyPlay` (`{ heard, by? }`), яке вже вміють вилучення гравця, команди (`teams.ts` ~243) і відновлення. Нового поля стану немає. Логіку `melodyHeard`/`melodyPaid`/`melodyOpen`/`melodyStartEnd` узагальнено до `snippetHeard`/`snippetPaid`/`snippetOpen`/`snippetStartEnd` для `isSnippetQuestion(q)` (`melody | videoclip`); старі назви в `melody.ts` — тонкі обгортки.
- **Подія.** Наявна `player:melody` `{ questionIndex, step }` — загальна за формою; тепер приймає й `videoclip` (рушій `snippetOpen`). Нової події немає.
- **Відповідь.** `{ type: 'videoclip', value }` з телефона; рушій дописує `heard` (`VideoclipAnswer`), як у «Мелодії».
- **Зрізи.** `PublicQuestion.videoclip?: PublicVideoclip`, `BaseView.videoclip?`/`HostView.videoclip?: SnippetInfo`, `PlayerView.me.videoclip?: PlayerSnippets`, `LiveProgress { kind: 'videoclip' }`. Типи рядків — узагальнені `SnippetRow`/`SnippetInfo`/`PlayerSnippets` (`MelodyRow` тощо стають псевдонімами).
- **Веб.**
  - `live/useYouTubeFrame.ts` (новий) — рукостискання з рамкою YouTube (`listening`, черга команд, `onStateChange`/`onError`, `infoDelivery`), **винесене** з `useMelodyClip.tsx`; `useMelodyClip` використовує його без зміни поведінки.
  - `live/useVideoClip.tsx` (новий) — видима рамка YouTube 16:9 і `play(seconds)`/`stop()` синхронно в дотику; затулка поза шматком, маска назви.
  - `screens/SnippetView.tsx` (новий) — `SnippetSteps`, `SnippetBoards`, `SnippetTable`, **винесені** з `MelodyView.tsx` з пропом текстів; `MelodyView.tsx` користується ними.
  - `screens/VideoclipView.tsx` (новий) — `VideoclipPlay` (телефон), `VideoclipStage`, `VideoclipReveal` (відео на сцені й у пульті без сцени).
  - `editor/VideoclipEditor.tsx` (новий).

**Технології:** TypeScript, zod 4, vitest (проєкти `shared`/`engine`/`server`/`web`), Fastify + Socket.IO, React 19 + Vite + Testing Library, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-17-video-snippets-design.md` — уся. Зразки: специфікація й план «Мелодії» (`docs/superpowers/specs/2026-11-11-melody-snippets-design.md`, `docs/superpowers/plans/2026-11-12-plan-29e-melody.md`), стиль — `docs/superpowers/plans/2026-11-17-plan-35-think-round.md`.

## Глобальні обмеження

- Усі тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`; довідка — `apps/web/src/help/help-uk.ts`, `help/__fixtures__/help-uk-golden.json`, `help/help-vars.ts`, `locales/*.help.json`. Нові uk-ключі — у списках `ADDED_VIDEOCLIP` і `ADDED_VIDEOCLIP_PLURALS` в `apps/web/src/i18n.test.ts`; обидва додаються до довгої умови `adds no uk keys beyond the agreed list` (~360) і до перевірки наявності в усіх локалях (як `ADDED_29E`/`ADDED_29E_PLURALS`). ru немає.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`).
- **Нічого, пов'язаного з росією**, — у прикладах, фікстурах, довідці, сіді, e2e (і в самих відео сіду).
- Тести — завжди `--maxWorkers=2`:
  - юніт-тести проєкту: `pnpm test --project <shared|engine|server|web> --maxWorkers=2 [шляхи]`;
  - типи: `pnpm typecheck` (у задачах 2–5 — лише пакети, див. «Порядок збирання»);
  - **ніколи не запускати prettier.**
- e2e: спершу `pnpm build`, потім на передньому плані `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 36"`, менше 10 хв; кадри — з `E2E_SHOTS=1`. YouTube у e2e — **лише заглушка** (`youtubeStub`), мережі немає.
- Таймер кожного запитання в фікстурах, сіді й e2e ≥ 25 с; типово для `videoclip` — 60 с.
- **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).**
  - Нове в стані — нічого: шматки `videoclip` лежать у наявному необов'язковому `Play.melody`.
  - Нові значення є лише в типах, яких старий знімок не містить: `QuestionType 'videoclip'`, `Answer 'videoclip'`, `BuffWhy 'off_videoclip'`, `ErrorCode 'videoclip_unseen'`, `LiveProgress { kind: 'videoclip' }`.
  - У коментар до `READABLE_STATE_VERSIONS` (`restore.ts`, біля рядка 29e) додати: «36 без нової версії: тип videoclip; його шматки — у наявному необов'язковому Play.melody».
  - Якщо виконавцю знадобиться обов'язкове поле чи зміна наявного — **зупинитися й спитати контролера** (підвищення до 23 обриває живі ігри; власника треба питати перед пушем).
- **Відповідь не йде на телефон і сцену до `reveal`**: до `reveal` жоден зріз, крім пульта, не містить `accepted` чи будь-якого написання. Телефон і сцена отримують YouTube `id`, `start` і `muted`. Видимий `id` прийнятний (як у «Мелодії»): довідка про це чесно каже.

## Рішення плану (там, де специфікація мовчить)

- **Назва типу — `videoclip`.** `video` зайнята: це поле `video: Video | null` кожного запитання (`base` у `quiz.ts`, `VideoField.tsx`, помилки `*_video`), і тип `'video'` плутав би `q.type === 'video'` з `q.video !== null`. Ключі: `type_videoclip`, `videoclip_place`, `off_videoclip`. У `QUESTION_TYPES` — одразу після `'melody'` (перед `'bluff'`), щоб меню редактора тримало два типи «за шматками» поряд (так само зробив 29e). `all_types` зростає до 30.
- **Запитання:**
  ```ts
  z.object({ ...base, type: z.literal('videoclip'),
    timeLimit: z.number().int().min(LIMITS.minVideoclipTime).max(LIMITS.maxTime),   // 25…120
    /** Відео YouTube і секунда початку фрагмента; шматки 1, 2, 4, 8, 16 с — від неї. */
    clip: videoSchema,
    /** «Без звуку» (типово): музика чи голос не підкажуть відповідь. На розкритті звук є завжди. */
    muted: z.boolean().default(true),
    /** Прийнятні написання; перше показується на розкритті. */
    accepted: spellings })
  ```
  - `LIMITS`: `minVideoclipTime: 25`, `defaultVideoclipTime: 60` (doc-коментарі, як у `melody`).
  - `superRefine`: `q.video !== null || q.audio !== undefined || q.reveal !== undefined` → `videoclip_video` (власне джерело — `clip`); `q.hint !== undefined` → `videoclip_hint` (бафи вимкнено). `imageUrl` дозволено (картинка-обкладинка до запитання — справа ведучого; на сцені під час запитання вона й так замість відео).
  - Місце: `videoclip_place` поряд із `melodyPlace` у `quizSchema.superRefine` (той самий вираз: поле — будь-яка клітинка; інакше `round.type !== 'classic'` і питання разом із `roundTrials(round)`); запасне → `spare_type` (уже, бо тип не простий); дуель не приймає.
- **Звук — типово «Без звуку»** (`muted: true`). Причина: специфікація пояснює вмикач саме тим, що звук видає відповідь; беззвучне відео ще й надійніше стартує з дотику на iOS. **На розкритті звук є завжди** (відповідь уже відома): сцена вмикає відео зі звуком, а якщо браузер сцени не дав звук без жесту — грає без звуку й показує кнопку «🔊 Увімкнути звук».
- **Шматки й бали — як у «Мелодії»:** `SNIPPET_STEPS = [1, 2, 4, 8, 16]`, `SNIPPET_SHARES = [1, 0.8, 0.6, 0.4, 0.25]`, по черзі (`melody_step`), повтор відкритого — `ok` без зміни стану; `round(ціна × SNIPPET_SHARES[heard − 1] × multiplier)`; без бонусу швидкості (`paysForTime`); неправильно — 0 навіть з `penalty: 'minus'` (`penalty: 'none'` для обох типів); без відкритого шматка — `videoclip_unseen` (новий код: текст «Спершу перегляньте шматок відео», бо `err_melody_unheard` каже про мелодію); одна спроба (`already_answered`). Оцінка ведучого й апеляція — як у `melody`.
- **Коди помилок події.** `melody_stale` («Це запитання вже закінчилося.») і `melody_step` («Спершу послухайте попередній шматок.») — `melody_stale` загальний, лишається; для `videoclip` телефон показує власний текст замість `err_melody_step`: `videoclipStepFirst` («Спершу перегляньте попередній шматок.»). Рушій кодів не множить.
- **Команди:** шматки відкриває будь-хто з команди, `heard` спільне, перша відповідь фіксується (і в режимі відповідача `captain`/`rotate`) — гілки `team-act.ts`/`answerer.ts` розширюються на `videoclip`. Відео в товаришів **само не вмикається** (iOS і чесність): їхня драбинка показує відкрите й «{name}: відкрито {seconds} с», переглянути можна дотиком.
- **Бафи й дебафи вимкнено**: `questionOff` → `'off_videoclip'`; `noDebuffQuestion` і `answerersOf` — також для `videoclip`. Тип **не** йде в `UNGRADABLE`, `PROGRESS_TYPES`, `gradable`.
- **Трейти** `QUESTION_TYPE_TRAITS.videoclip` — копія `melody` (`rounds: ['classic']`, `simple: false`, `wholeRow: false`, `speed: true`, `progress: false`, `hostGraded: true`, `teamWide: true`, `buffs` усі `false`), лише `time: { min: 'minVideoclipTime', max: 'maxTime' }`.
- **Зрізи** (`packages/shared/src/views.ts`):
  ```ts
  /** Узагальнені рядки шматків (29e → 36); MelodyRow/MelodyInfo/PlayerMelody — псевдоніми. */
  export interface SnippetRow { playerId: string; nickname: string; heard: number; answered: boolean; correct: boolean | null; points: number | null; timeMs: number | null }
  export interface SnippetInfo { rows: SnippetRow[] }
  export interface PlayerSnippets { heard: number; canOpen: boolean; canAnswer: boolean; openedBy: string | null }
  export type MelodyRow = SnippetRow; export type MelodyInfo = SnippetInfo; export type PlayerMelody = PlayerSnippets;
  /** «Відео за фрагментами» (36): для всіх ролей однаковий; answer — accepted[0] лише на reveal. */
  export interface PublicVideoclip { id: string /* question.id */; clip: Video; muted: boolean; answer: string | null }
  // PublicQuestion.videoclip?, BaseView.videoclip?: SnippetInfo, HostView.videoclip?: SnippetInfo, PlayerView.me.videoclip?: PlayerSnippets
  // LiveProgress: | { kind: 'videoclip'; heard: number; total: number }
  ```
  Порядок рядків, `canOpen`/`canAnswer`, `openedBy` — точно як у `melodyInfo`/`playerMelody`.
- **`audioOf`** на `reveal` запитання `videoclip` повертає `{ source: 'youtube', id, start, duration: SNIPPET_REVEAL_SECONDS }` — лише щоб наявна `host:audio` («Ще раз / Стоп») пройшла перевірку й дійшла до сцени як `audioCommand`. Сцена й пульт для `videoclip` **не** рендерять `QuestionAudio` — вони слухають `audioCommand` у `VideoclipReveal`. На `question`/`locked` — `null`.
- **Програвач відео** (`useVideoClip`):
  - рамка — `youtubeEmbedUrl({ id, start }, origin)` + `&controls=0&disablekb=1&modestbranding=1` (+ `&mute=1`, коли `muted`); у `youtubeEmbedUrl` уже є `rel=0`, `playsinline=1`, `enablejsapi=1`, `iv_load_policy=3`, `fs=0`; `modestbranding` нині нічого не робить, але не шкодить;
  - контейнер `.videoclip-frame`: `width: 100%`, `aspect-ratio: 16 / 9`, `max-width: 100%`, `overflow: hidden`, `position: relative`; рамка `pointer-events: none` (дотик не відкриє YouTube, пауза не покаже «Більше відео»);
  - **затулка** `.videoclip-cover` (непрозора, `var(--video-mask)`, «🎬» і `aria-label` `videoclipCover`) — поверх рамки **завжди, крім** відтворення шматка: знімається з першим `onStateChange 1` після `play`, повертається одразу в `halt` (раніше за `pauseVideo`). Так не видно превʼю з назвою, кадру паузи, «Більше відео» і кінцевих заставок;
  - **маска назви** `.videoclip-mask-top` — смуга зверху (`height: var(--videoclip-mask-top, 26%)`) і `.videoclip-mask-corner` справа внизу (логотип/водяний знак, `22% × 16%`), лише поки грає; кольори — змінні теми (`--video-mask`), тож світла тема теж працює;
  - `play(seconds)` у тому самому виклику, що й дотик: `seekTo [start, true]`, `mute` або `unMute` (за `muted`), `playVideo`; таймер зупинки стартує з `onStateChange 1`; `onStateChange 0` (кінець відео) — `halt`; `YOUTUBE_BLOCK_MS` без 1/3 — `'blocked'`; `onError` — `'failed'`; пауза гри / кінець запитання / розмонтування — тиша;
  - опція `reveal: true` (сцена, пульт без сцени, телефон «Переглянути ще раз») — звук завжди (`unMute`), без затулки на час `SNIPPET_REVEAL_SECONDS`; якщо стан не 1 за `YOUTUBE_BLOCK_MS` — `mute` + `playVideo` (беззвучний запасний шлях) і `state 'muted-fallback'`, кнопка `videoclipSoundTap` робить `unMute` у дотику.
- **Сцена:** на `question`/`locked` — текст запитання й плитки «нік · 👁 {seconds} с» / `videoclipStageNone`, ✓ у тих, хто відповів (`SnippetBoards`, сітка `puzzleGrid`/`usePage`); рамки YouTube немає взагалі (ні прихованої). На `reveal` — `videoclipRevealTitle`, `SnippetTable` і `VideoclipReveal` (ready = `phase === 'reveal' && !busy && !view.paused`, `command = audioCommand`).
- **Пульт:** ті самі плитки (секція `host-videoclip`); правильну відповідь бачить завжди (як `text`); на `reveal` — панель `host-audio` «Ще раз / Стоп»; без сцени (`stageGone`) — у панелі `VideoclipReveal` замість `QuestionAudio`. Під час запитання пульт відео не грає (ведучий бачить його в редакторі).
- **Телефон:** зверху рамка `useVideoClip(...).element` (на 320 px — 296 × 166,5 px при відступах 12), під нею рядок `videoclipMutedNote` («🔇 Без звуку»), коли `muted`; далі драбинка `SnippetSteps` з текстами `videoclipWatch` («Дивитись {seconds} с»), `melodyMore` («Ще: {seconds} с»), `videoclipReplay` («Переглянути {seconds} с»); `melodyShareNow`, `videoclipWatchFirst`, `melodyOpenedBy`, `melodyAnswered` — загальні тексти «Мелодії» беруться як є. Поле — `AnswerInput` типу `videoclip`. На `reveal` — звичайне розкриття текстової відповіді й кнопка `videoclipWatchAgain` (30 с зі звуком, дотиком).
- **Редактор** (`VideoclipEditor`): поле посилання — наявний `VideoField` з новим пропом `preview={false}` (без `YouTubePlayer`, бо попередній перегляд дає `useVideoClip`); `t=` стає `start`; поле «З якої секунди»; перемикач `videoclipSoundLabel`: «Без звуку» / «Зі звуком» (дві кнопки `aria-pressed`, типово «Без звуку») з підказкою `videoclipSoundHint`; рамка `useVideoClip` і 5 кнопок «▶ 1 с»…«▶ 16 с»; якщо плеєр повідомив `infoDelivery.duration` і `duration < start + 16` — `videoclipShortVideo` з `need`; `Rows` написань (як у `MelodyEditor`). Нове запитання: `clip: { id: '', start: 0 }` (чернетка, `problemVideoclipLink`), `muted: true`, `accepted: ['']`, текст `videoclipDefaultText` («Що це за відео?»), 60 с, `LIMITS.defaultPoints`. Перетворення `text`/`clues`/`melody` ↔ `videoclip` зберігає `accepted`.
- **Голос ведучого** (`speech.ts` ~83): для `videoclip` — `null`, як для `melody`.
- **Досягнень під тип немає** (у «Мелодії» є `first_note`; специфікація мовчить — не вигадуємо). Змінюються лише числа `all_types`.
- **Сід** `video` — окремий файл `apps/server/scripts/video-quiz.ts` (одна класика «Кадр за кадром» на 6 запитань `videoclip`), див. задачу 5.

## Порядок збирання

- Задача 2 додає `videoclip` у `Question`/`Answer`, і вичерпні `switch` у `apps/web` ламаються. Тому в задачах 2–5 перевіряються лише `pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine && pnpm exec tsc -p apps/server`, а з задачі 6 — `pnpm typecheck`.
- Залежності: 2 ← 1; 3 ← 2; 4 ← 3; 5 ← 3, 4; 6 ← 2; 7 ← 6; 8 ← 4, 7; 9 ← 8; 10 — остання.

## Фокус рев'ю

1. **«Мелодія» не змінила поведінки.** Усі наявні тести `melody` (`game.melody.test.ts`, `views.melody.test.ts`, `manager.melody.test.ts`, `useMelodyClip.test.tsx`, `MelodyView.test.tsx`, `MelodyEditor.test.tsx`, e2e `part 29e`) зелені **без правок**, крім імпортів, якщо їх перенесено.
2. **Відповідь не витікає до розкриття.** `JSON.stringify` зрізів сцени, телефонів і `PublicQuestion` на `question`/`locked` без написань (задача 4, e2e — `socketFrames`). Сцена до `reveal` не має `iframe` YouTube.
3. **Відео ховається поза шматком.** Затулка є до першого дотику, між шматками й після відповіді; знімається лише після `onStateChange 1`; рамка `pointer-events: none`; у `src` — `controls=0`, `rel=0`, `playsinline=1`, `disablekb=1`, `mute=1` (коли без звуку). Тести: задача 7 і e2e.
4. **iOS-жест.** `seekTo`, `mute/unMute`, `playVideo` постяться синхронно в обробнику дотику; таймер шматка — від `onStateChange 1`. Тести: задача 7.
5. **Бали й команди** — як у «Мелодії» (задача 3).
6. **320 px і світла тема** — рамка, драбинка й поле не вилазять за ширину (задача 8, e2e).
7. **Стан не міняється** — `GAME_STATE_VERSION === 22`, знімок зі шматками `videoclip` відновлюється (задачі 3, 5).

---

### Задача 1. Спільне: винести шматки в `snippets.ts`

**Files:**
- Create: `packages/shared/src/snippets.ts`, `packages/shared/src/snippets.test.ts`
- Modify:
  - `packages/shared/src/melody.ts` — константи й `melodyShare`/`melodySeconds` стають псевдонімами з `snippets.ts`; `MelodyTrack`, `melodyClip`, `melodyRevealClip` лишаються тут (`melodyRevealClip` бере `SNIPPET_REVEAL_SECONDS`);
  - `packages/shared/src/index.ts` — `export * from './snippets'`.
- Test: `packages/shared/src/melody.test.ts` — без змін (має лишитися зеленим).

**Interfaces (Produces):**
```ts
// snippets.ts — без імпортів значень з quiz.ts (quiz.ts імпортує цей файл)
/** Шматки «Мелодії» (29e) і «Відео за фрагментами» (36): секунди від початку фрагмента. */
export const SNIPPET_STEPS = [1, 2, 4, 8, 16] as const;
/** Частка ціни за найдовшим відкритим шматком. */
export const SNIPPET_SHARES = [1, 0.8, 0.6, 0.4, 0.25] as const;
export const SNIPPET_STEP_COUNT = 5;
/** Скільки секунд грає розкриття на сцені. */
export const SNIPPET_REVEAL_SECONDS = 30;
export function snippetShare(heard: number): number;   // < 1, NaN — 1; > 5 — 0.25
export function snippetSeconds(heard: number): number; // 0 → 0; 1…5 → STEPS; більше — 16

// melody.ts
export const MELODY_STEPS = SNIPPET_STEPS;
export const MELODY_SHARES = SNIPPET_SHARES;
export const MELODY_STEP_COUNT = SNIPPET_STEP_COUNT;
export const MELODY_REVEAL_SECONDS = SNIPPET_REVEAL_SECONDS;
export const melodyShare = snippetShare;
export const melodySeconds = snippetSeconds;
```

- [ ] **Step 1: Write the failing tests** (`snippets.test.ts`):
  - `steps double and shares fall` — `SNIPPET_STEPS` = `[1, 2, 4, 8, 16]`, `SNIPPET_SHARES` = `[1, 0.8, 0.6, 0.4, 0.25]`, обидва довжини `SNIPPET_STEP_COUNT`; `SNIPPET_REVEAL_SECONDS === 30`;
  - `shares by the chunk` — `[1..5].map((n) => Math.round(1000 * snippetShare(n)))` = `[1000, 800, 600, 400, 250]`; `snippetShare(0) === 1`, `snippetShare(NaN) === 1`, `snippetShare(9) === 0.25`, `snippetShare(2.7) === 0.8`;
  - `seconds of the longest chunk` — `snippetSeconds(0) === 0`, `(1) === 1`, `(4) === 8`, `(5) === 16`, `(9) === 16`;
  - `melody keeps its names` — `MELODY_STEPS === SNIPPET_STEPS` (`toBe`), `melodyShare === snippetShare`, `melodySeconds === snippetSeconds`.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/snippets.test.ts`. Expected: FAIL (модуля немає).
- [ ] **Step 3: Implement** — тіла функцій переносяться з `melody.ts` дослівно (лише назви).
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 && pnpm exec tsc -p packages/shared`. Expected: PASS (зокрема `melody.test.ts` без змін).
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "refactor(shared): 36 snippets — chunk steps, shares and the reveal length move out of melody into a shared module; melody keeps its names as aliases"
```

---

### Задача 2. Спільне: тип `videoclip` — схема, межі, трейти, відповідь, помилки, зрізи, бриф

**Files:**
- Modify:
  - `packages/shared/src/quiz.ts` — `LIMITS.minVideoclipTime`/`defaultVideoclipTime`; гілка `videoclip` у `questionSchema` (за «Рішеннями плану»); `superRefine` запитання: `videoclip_video`, `videoclip_hint`; блок `videoclipPlace` у `quizSchema.superRefine` поряд із `melodyPlace` (~1685).
  - `packages/shared/src/question-types.ts` — `'videoclip'` після `'melody'`; `QUESTION_TYPE_TRAITS.videoclip`.
  - `packages/shared/src/answer.ts` — гілка `answerSchema` `{ type: z.literal('videoclip'), value: z.string().max(LIMITS.answerText).refine(isStorable, UNSTORABLE) }`; `VideoclipAnswer { type: 'videoclip'; value: string; heard: number }` в `Answer`; `snippetHeardOf(answer)` — `heard` для `melody` **і** `videoclip`; `melodyHeardOf` лишається (лише `melody`, бо ним рахується `first_note`).
  - `packages/shared/src/drafts.ts` — `videoclip` поряд із `melody` (~23, ~41).
  - `packages/shared/src/events.ts` — doc-коментар `melodyOpenSchema` і `'player:melody'`: «також «Відео за фрагментами» (36)»; імпорт `SNIPPET_STEP_COUNT`.
  - `packages/shared/src/game.ts` — `ErrorCode` + `'videoclip_unseen'`; `BuffWhy` + `'off_videoclip'`.
  - `packages/shared/src/views.ts` — `SnippetRow`/`SnippetInfo`/`PlayerSnippets` (+ псевдоніми `Melody*`), `PublicVideoclip`, поля `PublicQuestion.videoclip?`, `BaseView.videoclip?`, `HostView.videoclip?`, `PlayerView.me.videoclip?`, `LiveProgress { kind: 'videoclip' }`.
  - `packages/shared/src/round-brief.ts` — у класиці поряд із `melodies`: `videoclips` (лише > 0).
  - `packages/shared/src/achievements.test.ts` — `all_types: 30`, коментар `36: новий тип videoclip`.
  - `packages/engine/src/schema-golden.test.ts` — у кожному рядку місць додати `videoclip=…` після `melody=…` (класика `ok`, решта `videoclip_place`, `think` — `think_type`, як у `melody`); фікстура `videoclip` з задачі 3 імпортується тут, тож **ця правка — у задачі 3** (тут лише перелік).
- Test: `packages/shared/src/quiz.test.ts`, `question-types.test.ts`, `facts.test.ts`, `achievements.test.ts`, тест брифу (де `melodies`).

- [ ] **Step 1: Write the failing tests** (`quiz.test.ts`). Помічник `vidQ(patch)`: `clip: { id: 'E2Evideo001', start: 12 }`, `muted: true`, `accepted: ['Take On Me', 'Тейк он мі']`, текст «Що це за відео?», 60 с, 1000 балів, `imageUrl: null`, `video: null`.
  - `accepts a videoclip` — парситься; без `muted` → `muted: true`; `muted: false` — ок; `timeLimit` 25 і 120 — ок; `imageUrl` з `/uploads/…png` — ок.
  - `refuses a broken videoclip`:
    - `video` (не null), `audio` чи `reveal` → `videoclip_video`; `hint` → `videoclip_hint`;
    - `accepted: []`, `clip.id: 'short'`, `clip.start: -1`, `clip.start: 43_201`, `timeLimit: 24`, `121`, без `clip`, `muted: 'yes'` → помилка парсингу.
  - `a videoclip plays only in classic rounds` — у `classic` ок; у `blitz`, `final`, на клітинці `board`, у `bets`, `auction`, `wipeout`, `survival` (і trial), `ladder`, `puzzles`, `quest` → `videoclip_place`; у `think` → `think_type`; запасне → `spare_type`; дуель не приймає.
  - `a videoclip answer comes from the phone without heard` — `answerSchema.parse({ type: 'videoclip', value: 'Take On Me', heard: 1 })` = `{ type: 'videoclip', value: 'Take On Me' }`; 201 символ → false; `snippetHeardOf({ type: 'videoclip', value: 'x', heard: 3 }) === 3`, `snippetHeardOf({ type: 'melody', value: 'x', heard: 2 }) === 2`, `melodyHeardOf({ type: 'videoclip', … heard: 3 }) === null`, `snippetHeardOf(null) === null`.
  - `QUESTION_TYPES.indexOf('videoclip') === QUESTION_TYPES.indexOf('melody') + 1`; `QUESTION_TYPES_MATCH_SCHEMA` компілюється; `old quizzes still parse`.
  - `question-types.test.ts` — меню `classic` має `'videoclip'` одразу після `'melody'`; жодне інше меню не має.
  - `facts.test.ts` — `a videoclip keeps the answer window` (як `melody`).
  - Бриф — класика з 2 `videoclip` і 1 `melody` → `videoclips: 2`, `melodies: 1`; без них ключів немає.
  - `achievements.test.ts` — `all_types: 30`.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану».
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 && pnpm exec tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 36 videoclip question — a YouTube clip with a start second, sound off by default, accepted spellings, only in classic rounds, a text answer, shared snippet view types"
```

---

### Задача 3. Рушій: шматки для обох типів, відповідь, бали, команди, оцінка ведучого

**Files:**
- Create: `packages/engine/src/snippets.ts`, `packages/engine/src/game.videoclip.test.ts`
- Modify:
  - `packages/engine/src/melody.ts` — `melodyHeard`/`melodyPaid`/`melodyOpen`/`melodyStartEnd` стають обгортками `snippet*` (поведінка для `melody` та сама; `melodyOpen` на `videoclip` тепер **не** `type_mismatch` — це й потрібно серверу);
  - `packages/engine/src/game.ts`:
    - doc `MelodyPlay`: «шматки melody і videoclip (36)»;
    - `openQuestion` (~1570): `isSnippetQuestion(question)` → `melody: teamsOn ? { heard: {}, by: {} } : { heard: {} }`;
    - `submitAnswer` (~2157): `if (isSnippetQuestion(asked) && answer.type === asked.type)`: `heard = snippetHeard(play, playerId)`; `heard < 1` → `fail(asked.type === 'melody' ? 'melody_unheard' : 'videoclip_unseen')`; `answer = { type: asked.type, value: answer.value, heard }`;
    - `cluesPaid(…) ?? snippetPaid(…)` у `verdictOf` (~2166) і оцінці ведучого (~2847); `penalty: isSnippetQuestion(asked) ? 'none' : …` в обох місцях;
  - `packages/engine/src/check.ts` — `checkAnswer` (`videoclip` → `textAccepts`), `paysForTime` (+ `videoclip`), `paceFactor` (`isSnippetQuestion` → `snippetShare(opened ?? 1)`);
  - `packages/engine/src/team-act.ts` ~98, `answerer.ts` ~60/124/138 — `isSnippetQuestion` замість `=== 'melody'`;
  - `packages/engine/src/buffs.ts` — `questionOff` → `'off_videoclip'` (тип у `PlaceBlock`); `debuffs.ts` ~23/187 — також `videoclip`;
  - `packages/engine/src/restore.ts` — лише коментар; `index.ts` — `export * from './snippets'`;
  - `packages/engine/src/testing/fixtures.ts` — `videoclip` («Що це за кліп?», `clip { id: 'E2Evideo001', start: 12 }`, `muted: true`, написання «Take On Me», «Тейк он мі», 60 с, 1000), `videoclipLoud` (`muted: false`, `clip { id: 'E2Evideo002', start: 0 }`, «Ярослава Магучіх», «Магучіх», «Mahuchikh», 45 с) і `videoclipQuiz(settings)`: класика з одним `single` на 30 с → класика з `videoclip`, `videoclipLoud`;
  - `packages/engine/src/testing/autopilot.ts` — `case 'videoclip'` як `case 'melody'` (через `snippetOpen`), неправильна відповідь — «Bohemian Rhapsody»;
  - `packages/engine/src/schema-golden.test.ts` — рядки місць (див. задачу 2).
- Test: `game.videoclip.test.ts`, `check.test.ts`, `restore.test.ts`, `autopilot.full.test.ts`, `game.buffs.test.ts`, `schema-golden.test.ts`; `game.melody.test.ts` — без змін.

**Interfaces (Produces):**
```ts
// snippets.ts — game.ts імпортує цей файл, а він — game.ts (звертання лише під час виклику, як melody.ts)
export type SnippetQuestion = Extract<Question, { type: 'melody' | 'videoclip' }>;
export function isSnippetQuestion(question: Question): question is SnippetQuestion;
/** Скільки шматків відкрив гравець рушія (команда); 0 — не відкривав або тип не «за шматками». */
export function snippetHeard(play: Play, actorId: string): number;
export function snippetPaid(play: Play, actorId: string): number | undefined;
export function snippetOpen(state: GameState, actorId: string, memberId: string, questionIndex: number, step: number, now: number): Result;
export function snippetStartEnd(state: GameState, now: number): number | null;  // melody, videoclip, memory
```
`snippetOpen` — тіло `melodyOpen` дослівно, лише `play.question.type !== 'melody'` → `!isSnippetQuestion(play.question)` і `MELODY_STEP_COUNT` → `SNIPPET_STEP_COUNT`.

- [ ] **Step 1: Write the failing tests** (`game.videoclip.test.ts`). Гравці: Оля, Тарас, Петро. `videoclipQuiz()`, помічник `toClip(state)` проходить перший раунд і відкриває `videoclip` (`roundQuestionNumber = 0`, `state.questionIndex = 1`), `open(state, who, step, t)` — `snippetOpen` з номером 0.
  - `opens chunks one by one by the round-local number` — `step 1` з номером 0 → `play.melody.heard[Оля] === 1`; з номером 1 → `melody_stale`; `step 3` при `heard 1` → `melody_step`; повтор `step 1` → той самий стан (`toBe`).
  - `the old melody entry point opens video chunks too` — `melodyOpen(…)` на `videoclip` → `ok` (сервер кличе його).
  - `refuses chunks out of time` — пауза → `paused`; заставка → `not_started`; `startedAt + 60_000` → `time_over`; `locked` → `wrong_phase`; невідомий гравець → `not_found`; на `single` першого раунду → `type_mismatch`.
  - `points by the longest chunk seen` — 5 станів, Оля відкриває 1…n і відповідає «Take On Me»: `[1000, 800, 600, 400, 250]`, `grade 'correct'`, `answer` = `{ type: 'videoclip', value: 'Take On Me', heard: n }`.
  - `spellings and typos count as in text` — «take on me» → 1000; «Тейк он мі» → 1000; «Teke On Me» → 1000 (описка); «Hunting High and Low» → `wrong`, 0.
  - `a wrong answer gives zero even with a minus rule`; `no speed bonus` (відповідь на 1-й і 50-й секунді після `step 2` — по 800); `a classic ×2 doubles` (`step 2` → 1600).
  - `one try` — друга відповідь і `step 3` після відповіді → `already_answered`.
  - `answering needs a chunk` — без відкриттів → `videoclip_unseen` (а в `melody` — так само `melody_unheard`: контроль).
  - `the phone cannot claim a shorter chunk` — після `step 4` відповідь з `heard: 1` → запис `heard 4`, 400.
  - `sound does not change the points` — `videoclipLoud` (`muted: false`) після `step 1` → 1000 (ціна 1000).
  - `the host override pays by the chunk` — неправильна після `step 2`, ведучий `correct` → 800; `partial` за правила 50 % → 400.
  - `teams share chunks, the first answer counts` — «Соняшники» (Оля, Тарас), «Маки» (Петро, Ганна), `captain` (Оля): Оля `step 1`, Тарас `step 2` → `heard[Соняшники] 2`, `by[Соняшники] Тарас`; Тарас відповідає → 800, Оля → `already_answered`; Ганна `step 2` → `melody_step`.
  - `buffs and debuffs are off` — баф → `off_videoclip`; `answerersOf` порожній.
  - `a removed player leaves no chunks` — ключ Олі зникає з `heard`.
  - `check.test.ts`: `checkAnswer` для `videoclip` — `textAccepts`; `paceFactor(videoclip, 0, 3) === 0.6`; `paysForTime(videoclip) === true`.
  - `restore.test.ts`: `a restored room keeps the video chunks` — знімок з `Play.melody` на запитанні `videoclip` читається; `GAME_STATE_VERSION === 22`.
  - `autopilot.full.test.ts`: `videoclipQuiz()` грається ботами до кінця; правильні — 1000, неправильні — 0, у кожного запису є `heard`.
  - `schema-golden.test.ts`: оновлені рядки.
- [ ] **Step 2: Run** `pnpm test --project engine --maxWorkers=2 packages/engine/src/game.videoclip.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Спершу перенести логіку в `snippets.ts` і переконатися, що `game.melody.test.ts` зелений, потім додавати `videoclip`.
- [ ] **Step 4: Run** `pnpm test --project engine --maxWorkers=2 && pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/engine
git commit -m "feat(engine): 36 videoclip — melody chunk logic generalised to snippets, one text answer checked like text, points by the longest chunk, zero for wrong, shared chunks and the first answer in teams, no new state field"
```

---

### Задача 4. Рушій: зрізи, наживо, кліп розкриття

**Files:**
- Modify:
  - `packages/engine/src/views.ts`:
    - `publicQuestion` (~380): `...(question.type === 'videoclip' ? { videoclip: publicVideoclip(question, revealed) } : {})` — `clip`, `muted` завжди, `answer` лише на `reveal`, `accepted` ніколи;
    - `currentMelody` → `currentSnippets(state, type)`; `melodyInfo` → `snippetInfo(state, type)`; `playerMelody` → `playerSnippets(state, actorId, now, type)` — тіла ті самі; виклики для `melody` не міняються, для `videoclip` — `optional('videoclip', snippetInfo(state, 'videoclip'))` у базовому зрізі (~3227) і в `hostView`, `me.videoclip` у соло-гілці й командній (~3676);
    - `audioOf` (~537): `videoclip` на `reveal` → `{ source: 'youtube', id: clip.id, start: clip.start, duration: SNIPPET_REVEAL_SECONDS }`, інакше `null`.
  - `packages/engine/src/live.ts` ~181 — `{ kind: 'videoclip', heard, total: SNIPPET_STEP_COUNT }`.
- Test: Create `packages/engine/src/views.videoclip.test.ts`; `views.melody.test.ts` — без змін.

- [ ] **Step 1: Write the failing tests** (`views.videoclip.test.ts`):
  - `the answer never reaches a phone or the stage before reveal` — на `question` і `locked` `JSON.stringify` зрізу сцени, телефонів Олі й Тараса й `publicQuestion` не містить «Take On Me», «Тейк он мі» і ключа `accepted`; містить `"id":"E2Evideo001"`, `"start":12`, `"muted":true`; `videoclip.answer === null`; на `reveal` — `'Take On Me'`.
  - `the stage sees who answered and on which chunk` — як у `views.melody.test.ts` (рядки в порядку гравців, без `answer`/`value`); `view.melody` відсутній (ключі не змішуються).
  - `reveal ranks by chunk` — правильні за `heard` зростанням, далі неправильні, далі без відповіді.
  - `the phone can open and answer only while open` — `canOpen`/`canAnswer` як у «Мелодії» (до шматка, після `step 1`, після `step 5`, пауза, заставка, після відповіді, `time_over`, `locked`).
  - `teammates see the shared chunk and who opened it` — `openedBy 'Тарас'`; суперники — `heard 0`, `openedBy null`; соло — `null`.
  - `the host sees the chunk in live answers` — `progress { kind: 'videoclip', heard: 2, total: 5 }`, `answer { type: 'videoclip', value: 'Take On Me', heard: 2 }`, `verdict 'correct'`.
  - `the reveal clip exists only on reveal` — `audioOf` на `question`/`locked` → `null`; на `reveal` → `{ source: 'youtube', id: 'E2Evideo001', start: 12, duration: 30 }`.
- [ ] **Step 2: Run** `pnpm test --project engine --maxWorkers=2 packages/engine/src/views.videoclip.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test --project engine --maxWorkers=2 && pnpm exec tsc -p packages/engine`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/engine
git commit -m "feat(engine): 36 videoclip views — the clip and the sound switch without the answer before reveal, who answered and on which chunk for the stage and host, the shared chunk on teammate phones, a 30-second reveal for the host controls"
```

---

### Задача 5. Сервер: подія шматка, розсилка, історія, сід `video`

**Files:**
- Modify:
  - `apps/server/src/rooms/manager.ts` — `melodyOpen` (~1889) кличе `snippetOpen` (doc: «і «Відео за фрагментами» (36)»); `watchTimers` (~1855) — `snippetStartEnd` замість `melodyStartEnd`; `answerStamp` — `snippetHeard`, якщо там `melodyHeard`.
  - `apps/server/src/socket.ts` — лише doc-коментар біля `on('player:melody')`.
  - Вичерпні `switch` за типом (якщо `tsc` покаже: `achievement-games.ts`, `game-achievements.ts`, `type-achievements.ts`) — `videoclip` як `text`; `first_note` лишається лише для `melody`.
  - `apps/server/src/achievements.test.ts` (та інші місця з `all_types`/кількістю типів) — 30.
  - Сід-тести з очікуваними типами з `QUESTION_TYPES` (`compass`, `evening`, `family`, `family2`, `fun`, `grand`, `halloween`, `horizon`, `world` і будь-які інші, які впадуть): `&& t !== 'videoclip'` з коментарем `36: новий тип, демо без «Відео за фрагментами»`. Списки `wanted` у `fest-quiz.test.ts`/`mega-quiz.test.ts` — перевірити, чи вони звіряються з `QUESTION_TYPES`; якщо так — так само виключити.
  - `apps/server/scripts/seed-demo.ts` — імпорт `videoQuiz`, `'video'` у `SEEDS`, `case 'video'`, назва в doc-рядку запуску.
- Create: `apps/server/src/rooms/manager.videoclip.test.ts`, `apps/server/scripts/video-quiz.ts`, `apps/server/scripts/video-quiz.test.ts`
- Test: `apps/server/src/socket.test.ts`, `apps/server/src/history.test.ts`

**Сід `video` — «Кадр за кадром».** Одна класика, 6 запитань `videoclip` (**жоден ролик не повторює наявні сіди**: перед використанням `grep -r <id> apps/server/scripts` має бути порожнім; правило власника «без повторів»), 60 с кожне, ціни за складністю (400…1500, без однакових підряд), `settings: { leaderboard: 'end', newcomers: true }`. Кандидати (усі — **перевірити** перед комітом: `https://www.youtube.com/oembed?url=https://youtu.be/<id>&format=json` має відповісти 200 з очікуваним `title`/`author_name`, а `start` — переглядом; що не підтвердилось — замінити іншим відомим неросійським роликом і записати перевірку в коментарі, як у `evening/culture.ts`):
  - `9bZkp7q19f0` (PSY «Gangnam Style», офіційний канал officialpsy) — «Як називається пісня з цього кліпу?» → «Gangnam Style», «Ґанґнам стайл», «Гангнам стайл»; **без звуку**; 400.
  - `kJQP7kiw5Fk` (Luis Fonsi «Despacito» ft. Daddy Yankee) — «Хто виконує цю пісню? Назвіть головного співака» → «Луїс Фонсі», «Luis Fonsi», «Фонсі»; **зі звуком** (назва пісні не є відповіддю); 1000.
  - «Stefania» Kalush Orchestra (переможець Євробачення-2022, офіційний канал) — «Який гурт знявся в цьому кліпі?» → «Kalush Orchestra», «Kalush», «Калуш»; **без звуку**; 1500. `id` знайти й підтвердити через oEmbed; якщо не вдалося — запитання не додавати й узяти інший відомий український неросійський кліп.
  - Ще три — нові відомі неросійські ролики на вибір виконавця (спорт, мультфільм, фільм — для різноманіття, не лише кліпи), так само перевірені через oEmbed і grep.
  - Перевірка якості (памʼять власника): відповіді немає в тексті запитання; написання не повторюють одне одного; «зі звуком» — щонайменше одне, «без звуку» — більшість.

- [ ] **Step 1: Write the failing tests:**
  - `manager.videoclip.test.ts` (за зразком `manager.melody.test.ts`, `videoclipQuiz()`):
    - `opens video chunks through the melody event after a classic round` — `player:melody { questionIndex: 0, step: 1 }` → `{ ok: true }`, `me.videoclip.heard 1`, сцена — рядок `heard 1`; номер 1 → `melody_stale`;
    - `a teammate gets the shared chunk at once`; `a repeated chunk sends nothing`;
    - `answers through the socket pay by the chunk` — `player:answer { type: 'videoclip', value: 'Take On Me' }` після `step 3` → 600; без шматка → `videoclip_unseen`;
    - `host replay works on reveal only` — `host:audio { action: 'replay' }` на `reveal` → `ok` і команда сцені; на `question` → `wrong_phase`;
    - `a restored room keeps the chunks` — після `restart` перепідключений телефон має той самий `me.videoclip.heard`.
  - `history.test.ts`: `history shows the videoclip answer and the chunk` — `{ type: 'videoclip', value: 'Take On Me', heard: 2 }` з 800 читається з тим самим `heard`.
  - `video-quiz.test.ts` (за зразком `think-quiz.test.ts`, той самий список `BANNED`):
    - `passes the quiz schema and starts the autopilot` — `quizSchema.safeParse` без проблем, `autopilotCheck(quiz).blocked` = `[]`, один раунд `classic`;
    - `every question is a videoclip with a valid clip` — 5–6 запитань, усі `videoclip`, `clip.id` за `/^[\w-]{11}$/`, `start ≥ 0`;
    - `sound is mostly off` — `muted: true` у більшості, `muted: false` — хоча б одне;
    - `timers are at least 25 seconds`; `points follow difficulty` — не всі ціни однакові;
    - `no answer leaks into the text` — жодне написання (`answerKey`) не входить у текст свого запитання;
    - `nothing about russia` — `BANNED` у JSON вікторини немає.
  - Сід-тести: `pnpm test --project server --maxWorkers=2 apps/server/scripts` зелені.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/rooms/manager.videoclip.test.ts apps/server/src/history.test.ts apps/server/scripts/video-quiz.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server
git commit -m "feat(server): 36 videoclip — video chunks through the melody event pushed at once to teammates, host replay on reveal; a «Кадр за кадром» video seed; seed demos skip the new type"
```

---

### Задача 6. Веб: тексти, довідка, формат, бриф, адмінка, голос

**Files:**
- Modify:
  - `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts` (`ADDED_VIDEOCLIP`, `ADDED_VIDEOCLIP_PLURALS` + умова `adds no uk keys…` + перевірка локалей), `apps/web/src/locales/{en,de,es,it,pl,ar}.json`;
  - `apps/web/src/help/help-uk.ts` (`question.videoclip.*`: `title`, `what`, `how.0…2`, `points.0…1`, `tip.0…2`, `limits.0…2`), `help/help-vars.ts` (`minVideoclipTime`, `defaultVideoclipTime`), `help/__fixtures__/help-uk-golden.json`, `locales/*.help.json`;
  - `apps/web/src/format.ts` — `correctText` → `accepted[0]`; `answerText` — `snippetHeardOf` + наявний `melodyAnswerHeard` («{answer} · {seconds} с»);
  - `apps/web/src/live-drafts.ts`, `apps/web/src/admin/admin-text.ts` — `videoclip` поряд із `melody`;
  - `apps/web/src/guide-text.ts` — `TYPE_ICONS.videoclip = '🎬'`;
  - `apps/web/src/round-summary.ts` — `summaryVideoclips_one/_few/_many` з `brief.videoclips`;
  - `apps/web/src/live/speech.ts` ~83 — `question.videoclip !== undefined` → `null`;
  - `apps/web/src/screens/AnswerInput.tsx` (~107, ~264) — `videoclip` як `melody` (`TypedInput`, чернетка).
  - Вичерпні `switch`, які покаже `pnpm typecheck` поза екранами задач 7–9, — тут; `QuestionEditor`/`PlayerScreen`/`StageScreen`/`HostScreen` тимчасово отримують мінімальні гілки (`videoclip` → `null`/як `melody`, з `// 36: задача 7–9`), щоб `pnpm typecheck` був зелений.
- Test: `apps/web/src/i18n.test.ts`, `apps/web/src/help/*.test.ts`, `format.test.ts`, `round-summary.test.ts`, `live/speech.test.ts`, `admin`-тест тексту, якщо є.

**Ключі `ADDED_VIDEOCLIP`** (uk — нижче; інші 6 мов — переклади; загальні тексти «Мелодії» — `melodyMore`, `melodyStep`, `melodyShareNow`, `melodyOpenedBy`, `melodyAnswered`, `melodyPlayersAnswered`, `melodyTableChunk`, `melodyAnswerHeard`, `err_melody_stale` — **не дублювати**, брати як є):
- тип: `type_videoclip` «Відео за фрагментами», `typeShort_videoclip` «Відео», `typeHow_videoclip` «Подивіться шматок відео й напишіть, що це. Шматки відкриваєте самі: 1, 2, 4, 8, 16 секунд. Чим коротший, тим більше балів.», `buffWhy_off_videoclip`;
- помилки: `err_videoclip_unseen` «Спершу перегляньте шматок відео.», `videoclipStepFirst` «Спершу перегляньте попередній шматок.»;
- проблеми чернетки: `problemVideoclipLink` «Додайте посилання на YouTube», `problemVideoclipAccepted`, `problemVideoclipPlace`, `problemVideoclipLimits`;
- редактор: `videoclipDefaultText` «Що це за відео?», `videoclipStart` «З якої секунди», `videoclipSoundLabel` «Звук», `videoclipMuted` «Без звуку», `videoclipSound` «Зі звуком», `videoclipSoundHint` «Без звуку — щоб музика чи голос не підказали відповідь. На розкритті звук буде.», `videoclipPreview` «▶ {seconds} с», `videoclipShortVideo` «Відео коротше за {need} с — останні шматки обріжуться», `videoclipAcceptedHint`;
- телефон: `videoclipWatch` «Дивитись {seconds} с», `videoclipReplay` «Переглянути {seconds} с», `videoclipWatchFirst` «Спершу перегляньте шматок», `videoclipMutedNote` «🔇 Без звуку», `videoclipCover` «Відео сховано до шматка», `videoclipBlocked` «Браузер не дав увімкнути відео. Торкніться ще раз.», `videoclipFailed` «Відео не вдалося увімкнути. Спробуйте ще раз.», `videoclipWatchAgain` «Переглянути ще раз»;
- сцена й пульт: `videoclipStageNone` «ще не дивився», `videoclipStageSeen` «👁 {seconds} с», `videoclipRevealTitle` «Це було: «{title}»», `videoclipTableLabel`, `videoclipSoundTap` «🔊 Увімкнути звук», `summaryVideoclips_one` «{count} відео: бали за найдовшим шматком, який переглянули»;
- `ADDED_VIDEOCLIP_PLURALS`: `summaryVideoclips_few`, `summaryVideoclips_many`.

Довідка (`question.videoclip`): «Відео грає на телефоні кожного гравця, а сцена під час запитання його не показує»; бали 100/80/60/40/25 %; «Неправильна відповідь — 0»; «Без звуку — типово; на розкритті звук є»; «Назву ролика YouTube ховаємо, але хитрий гравець може знайти її в коді сторінки — для чесної гри домовтеся»; «Лише YouTube; деякі ролики власник забороняє вбудовувати — перевірте прев'ю в редакторі»; приклад — спортивний рекорд чи кліп (без росії).

- [ ] **Step 1: Write the failing tests:** `i18n.test.ts` — `ADDED_VIDEOCLIP` в усіх 7 мовах, `ADDED_VIDEOCLIP_PLURALS` — де є ці форми; сторінка `question.videoclip` є в усіх `*.help.json`; `format.test.ts` — `correctText` → «Take On Me», `answerText({ type: 'videoclip', value: 'Take On Me', heard: 2 })` → «Take On Me · 2 с»; `round-summary.test.ts` — «2 відео: …»; `speech.test.ts` — запитання `videoclip` не читається.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/i18n.test.ts apps/web/src/help apps/web/src/format.test.ts apps/web/src/round-summary.test.ts apps/web/src/live/speech.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 36 videoclip texts and help in seven languages, answer format with the chunk, round summary, no speech for video"
```

---

### Задача 7. Веб: рамка YouTube, програвач шматків відео, редактор

**Files:**
- Create: `apps/web/src/live/useYouTubeFrame.ts`, `apps/web/src/live/useVideoClip.tsx`, `apps/web/src/live/useVideoClip.test.tsx`, `apps/web/src/editor/VideoclipEditor.tsx`, `apps/web/src/editor/VideoclipEditor.test.tsx`
- Modify:
  - `apps/web/src/live/useMelodyClip.tsx` — YouTube-гілка через `useYouTubeFrame` (поведінка й тести `useMelodyClip.test.tsx` без змін);
  - `apps/web/src/editor/VideoField.tsx` — проп `preview?: boolean` (типово `true`; `false` — без `YouTubePlayer`);
  - `apps/web/src/editor/draft.ts` — `VideoclipQuestion`; `newQuestion('videoclip')`; `minTimeOf` → `LIMITS.minVideoclipTime`; `Place.videoclip` (лише класика); `problemKey`: `problemVideoclipPlace`, `problemVideoclipLink` (`!YOUTUBE_ID.test(clip.id)` чи `start` поза `0…maxVideoStart`), `problemVideoclipAccepted`, `problemVideoclipLimits` (формула `min`); перетворення `text`/`clues`/`melody` ↔ `videoclip` (зберігає `accepted`);
  - `apps/web/src/editor/draft-storage.ts` — `reviveVideoclip`: `clip.id` лише за `YOUTUBE_ID`, інакше `''`; `start` — ціле `0…maxVideoStart`, інакше 0; `muted` — boolean, інакше `true`; `accepted` — як у `reviveMelody`; без `hint`/`audio`/`video`/`reveal`;
  - `apps/web/src/editor/QuestionEditor.tsx` — `case 'videoclip'` → `VideoclipEditor`; без загальних `VideoField`, `AudioField`, «перевертання» й підказки (ті самі умови, що для `melody`, ~913–965); `ImageField` лишається;
  - `apps/web/src/styles.css` — `.videoclip-frame`, `.videoclip-cover`, `.videoclip-mask-top`, `.videoclip-mask-corner`, `.videoclip-sound` (світла тема — через наявні змінні).
- Test: `useVideoClip.test.tsx`, `VideoclipEditor.test.tsx`, `apps/web/src/editor/draft.test.ts`, `type-menu.test.ts`, тест `draft-storage`, `useMelodyClip.test.tsx` (без змін).

**Interfaces (Produces):**
```ts
// live/useYouTubeFrame.ts — винесено з useMelodyClip без зміни логіки
export function useYouTubeFrame(id: string | null, on: { state(playerState: number): void; error(): void; duration?(seconds: number): void }): {
  frameRef: RefObject<HTMLIFrameElement | null>;
  /** Команда в цьому ж виклику; плеєр, що ще не відгукнувся, отримає її з черги. */
  command(func: string, args?: unknown[]): void;
  /** Останній відомий стан плеєра (-1 — невідомо). */
  playerState(): number;
  /** onLoad рамки: «listening» і addEventListener(onStateChange/onError), до відповіді або LISTEN_MAX_TICKS. */
  onLoad(): void;
};

// live/useVideoClip.tsx
export type VideoPlayState = 'idle' | 'playing' | 'blocked' | 'failed' | 'muted-fallback';
export function useVideoClip(clip: Video, opts: { muted: boolean; paused: boolean; live: boolean; reveal?: boolean }): {
  play(seconds: number): void;   // синхронно в дотику: seekTo [start, true], mute|unMute, playVideo
  stop(): void;
  unmute(): void;                // кнопка «🔊 Увімкнути звук» (у дотику)
  state: VideoPlayState;
  playing: number | null;
  /** Затулка поверх рамки: true скрізь, крім шматка, що вже грає (onStateChange 1). */
  covered: boolean;
  /** .videoclip-frame: рамка (pointer-events: none), маски й затулка; рендерити один раз. */
  element: JSX.Element;
  /** Тривалість ролика, якщо плеєр повідомив (infoDelivery.duration); інакше null. */
  duration: number | null;
};
// editor/VideoclipEditor.tsx
export function VideoclipEditor(props: { question: VideoclipQuestion; onChange: (q: Question) => void }): JSX.Element;
```
Ескіз ядра `useVideoClip` (зразок — `useMelodyClip`, лише YouTube):
```ts
const play = (seconds: number) => {
  if (optsRef.current.paused || !optsRef.current.live) return;
  const token = ++run.current.token;
  run.current = { token, seconds, armed: false };
  setCovered(true); setPlaying(seconds); setState('playing');
  frame.command('seekTo', [clipRef.current.start, true]);
  frame.command(optsRef.current.muted && !optsRef.current.reveal ? 'mute' : 'unMute');
  frame.command('playVideo');
  if (frame.playerState() === 1) arm();          // уже грав: подія 1 може не прийти
  block.current = setTimeout(() => {
    if (run.current.token !== token || frame.playerState() === 1 || frame.playerState() === 3) return;
    if (optsRef.current.reveal) { frame.command('mute'); frame.command('playVideo'); setState('muted-fallback'); }
    else halt('blocked');
  }, YOUTUBE_BLOCK_MS);
};
// on.state(1) → arm() і setCovered(false); on.state(0) → halt(null); halt: setCovered(true) ДО command('pauseVideo').
```
Рамка: `src = youtubeEmbedUrl({ id, start }, origin) + '&controls=0&disablekb=1&modestbranding=1' + (muted && !reveal ? '&mute=1' : '')`, `allow="autoplay; encrypted-media"`, `title={t('videoclipCover')}`, `tabIndex={-1}`, `key={id}`.

- [ ] **Step 1: Write the failing tests:**
  - `useVideoClip.test.tsx` (фейкові таймери; `postMessage` рамки замокано, рамка вже відгукнулась — як у `useMelodyClip.test.tsx`):
    - `commands go out inside the tap` — у `onClick` тестової кнопки `clip.play(1)`; одразу після `fireEvent.click` постнуто `seekTo [12, true]`, `mute`, `playVideo` (у цьому порядку);
    - `with sound the player is unmuted` — `muted: false` → `unMute` замість `mute`; `src` рамки без `mute=1`; з `muted: true` — `mute=1`;
    - `the embed hides YouTube extras` — `src` містить `controls=0`, `rel=0`, `playsinline=1`, `disablekb=1`, `iv_load_policy=3`, `fs=0`, `start=12`, без `autoplay`; рамка має `pointer-events: none` (клас) і `tabIndex -1`;
    - `the cover lifts only while a chunk plays` — до `play` `covered true`; після `play` без події — `true`; `onStateChange 1` → `false`; 1000 мс → `pauseVideo`, `covered true`, `state 'idle'`;
    - `the chunk timer starts when the video plays` — 300 мс без події 1 → не зупинено; подія 1, далі 999 мс → ні, 1000 → так;
    - `the end of the video covers it` — `onStateChange 0` → `covered true`, `playing null`;
    - `a silent player is reported` — `YOUTUBE_BLOCK_MS` без стану 1/3 → `'blocked'`; `onError` → `'failed'`;
    - `the reveal falls back to mute` — `reveal: true`, без стану 1 за `YOUTUBE_BLOCK_MS` → постнуто `mute`, `playVideo`, `state 'muted-fallback'`; `unmute()` → `unMute`;
    - `pause and the end of the question stop the video` — `paused: true` / `live: false` → `pauseVideo`, `covered true`;
    - `duration comes from infoDelivery` — повідомлення `{ event: 'infoDelivery', info: { duration: 14 } }` → `duration 14`.
  - `useMelodyClip.test.tsx` — без змін, зелений.
  - `draft.test.ts` / `type-menu.test.ts`: `videoclip` лише в меню `classic` одразу після `melody`; нове запитання → `problemVideoclipLink`, 60 с, `muted true`; з посиланням — `problemVideoclipAccepted`; з написанням — без проблеми; `minTimeOf({ type: 'videoclip' }) === 25`, 24 с → `problemVideoclipLimits`; `text` → `videoclip` зберігає написання.
  - `draft-storage`: `a stored videoclip is revived within limits` — `id: 'x'` → `''`; `start: 99_999` → 0; `muted: 'no'` → `true`; 300 символів → 200; `hint` зникає.
  - `VideoclipEditor.test.tsx` (`useVideoClip` замокано):
    - `a YouTube link sets the id and the start` — «https://youtu.be/E2Evideo001?t=42» → `clip { id: 'E2Evideo001', start: 42 }`; «https://example.com» → `videoInvalid`, `onChange` не з поганим id; у редакторі немає `.question-video` (`preview={false}`);
    - `the start field moves the chunks` — «З якої секунди» 30 → `start 30`;
    - `sound is off by default and can be switched` — «Без звуку» `aria-pressed true`; «Зі звуком» → `muted: false`;
    - `five preview buttons` — «▶ 1 с»…«▶ 16 с»; «▶ 4 с» → `play(4)` хука;
    - `a short video is flagged` — хук повертає `duration 14`, `start 0` → `videoclipShortVideo` з `need 16`;
    - `spellings are edited as in text` — «Додати написання», `maxLength` 200.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/live apps/web/src/editor`. Expected: FAIL.
- [ ] **Step 3: Implement.** Спершу `useYouTubeFrame` + перехід `useMelodyClip` (зелені старі тести), потім `useVideoClip`, потім редактор (розмітка — за зразком `MelodyEditor.tsx`).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 36 videoclip editor and player — a YouTube link with a start second and a sound switch, chunk previews; a visible frame covered outside a chunk, title masks, commands inside the tap; the YouTube handshake shared with melody"
```

---

### Задача 8. Веб: телефон — рамка, драбинка, відповідь, команди, розкриття

**Files:**
- Create: `apps/web/src/screens/SnippetView.tsx`, `apps/web/src/screens/VideoclipView.tsx`, `apps/web/src/screens/VideoclipView.test.tsx`
- Modify:
  - `apps/web/src/screens/MelodyView.tsx` — `MelodySteps`/`MelodyBoards`/`MelodyTable` стають обгортками `SnippetSteps`/`SnippetBoards`/`SnippetTable` з текстами «Мелодії» (тести `MelodyView.test.tsx` без змін); `MELODY_ACK_MS`, `withTimeout` — у `SnippetView.tsx` як `SNIPPET_ACK_MS`, `withTimeout` (реекспорт старої назви);
  - `apps/web/src/screens/PlayerScreen.tsx` — гілка `question.type === 'videoclip'` поряд із `melody` (~1260): `me.videoclip !== undefined && question.videoclip !== undefined` → `VideoclipPlay` з `key={`${view.round?.index ?? 0}:${view.questionIndex}:${question.videoclip.id}`}`; на `reveal` — блок «Переглянути ще раз» (`VideoclipReveal` з `onDemand`, лише дотиком);
  - `apps/web/src/styles.css`.
- Test: `VideoclipView.test.tsx`, `PlayerScreen.test.tsx`, `MelodyView.test.tsx` (без змін).

**Interfaces (Produces):**
```ts
// SnippetView.tsx
export interface SnippetTexts { first(seconds: number): string; more(seconds: number): string; replay(seconds: number): string; none: string; seen(seconds: number): string; table: string }
export function SnippetSteps(props: { heard: number; canOpen: boolean; playing: number | null; onPlay: (step: number) => void; texts: SnippetTexts }): JSX.Element;
export function SnippetBoards(props: { rows: readonly SnippetRow[]; host?: boolean; texts: SnippetTexts }): JSX.Element;
export function SnippetTable(props: { rows: readonly SnippetRow[]; host?: boolean; texts: SnippetTexts }): JSX.Element;
// VideoclipView.tsx
export const VIDEOCLIP_TEXTS: SnippetTexts;
export function VideoclipPlay(props: { info: PlayerSnippets; question: PublicQuestion & { videoclip: PublicVideoclip }; questionIndex: number; paused: boolean; live: boolean; send: Send; onSubmit: (answer: SubmittedAnswer) => void; onDraft?: (answer: SubmittedAnswer | null) => void; answer: string | null }): JSX.Element;
export function VideoclipReveal(props: { videoclip: PublicVideoclip; ready: boolean; paused: boolean; command?: AudioCommand | null; onDemand?: boolean }): JSX.Element;
```

**Телефон** (як `MelodyBoard`, лише текст і програвач):
- Дотик до наступної комірки: **у тому самому обробнику** `clip.play(SNIPPET_STEPS[step − 1])`, потім `send('player:melody', { questionIndex, step })`; `pendingStep` до ack; відмова → `clip.stop()`, `pendingStep` знімається, текст помилки (для `melody_step` — `videoclipStepFirst`). Дотик до відкритої — лише `clip.play(seconds)`.
- Рядок частки за `max(heard, pendingStep)`; до першого шматка — `videoclipWatchFirst`; `muted` — `videoclipMutedNote`.
- Поле — `AnswerInput` з `disabled = !info.canAnswer && pendingStep === null`.
- Команди: `openedBy` → `melodyOpenedBy`; відео в товариша не вмикається.
- Після відповіді — `melodyAnswered`, драбинка лише для перегляду.
- `blocked`/`failed` — `videoclipBlocked`/`videoclipFailed` (`role="status"`).

- [ ] **Step 1: Write the failing tests** (`VideoclipView.test.tsx`, `useVideoClip` замокано):
  - `the first tap plays and sends the round-local number` — «Дивитись 1 с» → `play(1)` раніше за `send('player:melody', { questionIndex: 0, step: 1 })`;
  - `only the next chunk can be opened` — `heard 2`: 1–2 «Переглянути», 3 «Ще: 4 с», 4–5 `disabled`; дотик до 1 → `play(1)` без `send`;
  - `a refused chunk stops the video` — ack `time_over` → `stop()`, комірка закрита, текст помилки; ack `melody_step` → «Спершу перегляньте попередній шматок.»;
  - `the answer waits for a chunk` — до шматка поле неактивне, «Спершу перегляньте шматок»; після — `onSubmit({ type: 'videoclip', value: 'Take On Me' })`;
  - `the sound note follows the switch` — `muted: true` → «🔇 Без звуку»; `false` — немає;
  - `a teammate chunk shows who opened it` — «Тарас: відкрито 2 с», `play` не викликано;
  - `after the answer only replays`;
  - `the frame and the ladder fit 320 px` — ширина `.videoclip-frame` ≤ `320 − 2·12`, висота = ширина × 9/16, 5 комірок в один ряд (як `fits 320 px` у `MelodyView.test.tsx`);
  - `another videoclip in the same slot starts afresh` — інший `videoclip.id` скидає `pendingStep`;
  - `PlayerScreen.test.tsx`: `a videoclip reveal offers watching again` — на `reveal` кнопка «Переглянути ще раз», рамки до дотику немає `playVideo`; на `question` — `VideoclipPlay`, немає `.player-audio`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/screens/VideoclipView.test.tsx apps/web/src/screens/MelodyView.test.tsx apps/web/src/screens/PlayerScreen.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** — спершу винести `SnippetView.tsx` (зелений `MelodyView.test.tsx`), потім `VideoclipPlay`.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 36 videoclip phone — the hidden frame above a ladder of five chunks started by a tap, a sound note, one answer after the first chunk, a teammate's chunk, watching again on reveal, 320 px; snippet ladder, tiles and table shared with melody"
```

---

### Задача 9. Веб: сцена, пульт, живі відповіді, історія

**Files:**
- Modify:
  - `apps/web/src/screens/VideoclipView.tsx` — `VideoclipStage` (`SnippetBoards` до розкриття; `videoclipRevealTitle` + `SnippetTable` + `VideoclipReveal` на розкритті);
  - `apps/web/src/screens/StageScreen.tsx` — гілка поряд із `MelodyStage` (~563); у ~263 умова «не показувати варіанти» доповнюється `view.videoclip === undefined`; `VideoclipReveal` з `ready = view.phase === 'reveal' && !busy && !view.paused`, `command = audioCommand`; до розкриття жодної рамки YouTube;
  - `apps/web/src/screens/HostScreen.tsx` — `clip` (~373): для `videoclip` на `reveal` — кліп з `audioOf`-форми (`{ source: 'youtube', id, start, duration: SNIPPET_REVEAL_SECONDS }`), щоб з'явилася панель «Ще раз / Стоп»; у панелі `host-audio` при `stageGone` для `videoclip` — `VideoclipReveal` замість `QuestionAudio`; `canGrade` (~374) — і `correct?.type === 'videoclip'`; секція `host-videoclip` з `VideoclipStage … host`;
  - `apps/web/src/screens/LiveAnswers.tsx` (~52, ~134) — прогрес `videoclip`: `videoclipStageSeen`, текст і вердикт як `text`;
  - `apps/web/src/pages/GameHistory.tsx` — без змін коду, якщо `answerText` уже покриває (тест фіксує).
- Test: `VideoclipView.test.tsx`, `StageScreen.test.tsx`, `HostScreen.test.tsx`, `LiveAnswers.test.tsx`, `apps/web/src/pages/GameHistory.test.tsx`

- [ ] **Step 1: Write the failing tests:**
  - `the stage shows chunks and no video before reveal` — Оля «👁 2 с ✓», Тарас «👁 1 с», Петро «ще не дивився»; «Відповіли: 1 з 3»; у DOM сцени немає «Take On Me» і немає `iframe`;
  - `the stage plays the video after time` — на `reveal` є `.videoclip-frame` з `iframe` (`src` без `mute=1`), «Це було: «Take On Me»», таблиця з балами 1000, 800, 0; `audioCommand { action: 'stop' }` → `stop()` хука;
  - `a muted autoplay offers sound on the stage` — хук у `muted-fallback` → кнопка «🔊 Увімкнути звук», дотик → `unmute()`;
  - `twenty-four players fit the stage` — 24 плитки в 1600×900, 12 рядків таблиці;
  - `the host gets replay and stop on reveal` — кнопки «Ще раз»/«Стоп» шлють `host:audio`; на `question` панелі немає; без сцени в панелі — `VideoclipReveal`, не `<audio>`;
  - `the host can grade a videoclip` — на `reveal` є кнопки оцінки;
  - `live answers show the chunk and the answer` — «Оля · «Take On Me» · 👁 2 с · ✓»;
  - `history shows the chunk` — «Take On Me · 2 с».
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/screens apps/web/src/pages/GameHistory.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за зразком `MelodyStage` і блоків `QuestionAudio` у `StageScreen.tsx` (~377) та `HostScreen.tsx` (~862).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 36 videoclip stage and host — who answered and on which chunk with no video, then the answer, a points table and the video with sound, host replay and stop, grading and live answers"
```

---

### Задача 10. Наскрізні сценарії й кадри (`part36-video.e2e.ts`)

**Files:**
- Create: `apps/server/e2e/part36-video.e2e.ts`
- Modify: `apps/server/e2e/helpers/setup.ts` — `PLAYABLE_VIDEOS = ['E2Evideo001', 'E2Evideo002']` і розширення `youtubeStub(url)`: для цих id сторінка заглушки (1) пише кожну команду в `window.__yt` (`{ func, args }`), (2) на `playVideo` відповідає `onStateChange 1`, на `pauseVideo` — `2`, на `listening` — ще й `infoDelivery { duration: 60 }`. Для інших id поведінка **та сама**, що зараз (наявні частини 10, 16b, 29e не міняються).
  ```ts
  const playable = PLAYABLE_VIDEOS.some((id) => url.includes(id))
    ? `window.__yt = [];
       addEventListener('message', (e) => {
         let m; try { m = JSON.parse(e.data); } catch { return; }
         if (m.event !== 'command') return;
         window.__yt.push({ func: m.func, args: m.args });
         const reply = (info) => parent.postMessage(JSON.stringify({ event: 'onStateChange', info, id: m.id, channel: 'widget' }), '*');
         if (m.func === 'playVideo') setTimeout(() => reply(1), 50);
         if (m.func === 'pauseVideo') reply(2);
       });`
    : '';
  ```
  Помічники в самому файлі: `videoclip36(id, clip, muted, accepted, timeLimit)`, `ytLog36(page, id)` — `page.frames().find((f) => f.url().includes(id))!.evaluate(() => window.__yt)`, `frameSrc36(page)`, `covered36(page)` — видимість `.videoclip-cover`, `step36(page, label)`.

**Сценарії** (таймери ≥ 25 с; класичний раунд перед відео — як у 29e, щоб номер у раунді ≠ `state.questionIndex`):
1. `it('part 36: videoclip after a classic round — a YouTube link, a start second and sound off in the editor, chunks start by a tap with the frame covered outside them, points by the longest chunk, no answer before reveal, the video with sound on the stage, 320 px, light theme')`:
   - **Редактор.** Перший раунд — класика з `single` (30 с), другий — класика з `videoclip`:
     - нове запитання показує «Додайте посилання на YouTube»; посилання `https://youtu.be/E2Evideo001?t=42` → «З якої секунди» = 42, далі змінити на 12; «Без звуку» натиснута типово;
     - «▶ 1 с» у редакторі: у `ytLog36` з'являються `seekTo [12, true]`, `mute`, `playVideo`, потім `pauseVideo` (≤ 2,5 с);
     - у бліці й «Головоломках» типу «Відео за фрагментами» в меню немає; загального поля «Відео з YouTube» в цього типу немає;
     - збережене запитання: `clip { id: 'E2Evideo001', start: 12 }`, `muted: true`;
     - кадр `video36-editor`.
   - **Гра на 3 телефонах** (Оля — 320 × 640, Тарас 375, Петро 360):
     - до першого шматка в Олі `.videoclip-cover` видима, поле неактивне, «Спершу перегляньте шматок», «🔇 Без звуку»; `frameSrc36` містить `controls=0`, `rel=0`, `playsinline=1`, `disablekb=1`, `mute=1`, `start=12`;
     - Оля торкається «Дивитись 1 с» → у журналі рамки `seekTo [12, true]`, `mute`, `playVideo`; затулка зникає, потім (≤ 3 с) повертається; сцена — «Оля · 👁 1 с»; Оля відповідає «take on me»;
     - Тарас відкриває 1, 2, 4 с, переглядає 1 с, відповідає «Тейк он мі»; Петро відкриває 1 с, відповідає «Hunting High and Low»;
     - сцена до розкриття: немає `iframe` YouTube; у `socketFrames` телефонів і сцени й у DOM немає «Take On Me»/«Тейк он мі»;
     - `expectNoSideScroll(olya, 'video36-phone-320')`; кадри `video36-phone-320`, `video36-phone-steps`, `video36-stage`, `video36-host`.
   - **Розкриття:** бали з історії — Оля 1000, Тарас 600, Петро 0; сцена — «Це було: «Take On Me»», таблиця, `.videoclip-frame` з `iframe` без `mute=1`, у журналі сцени `unMute`, `playVideo`; «Стоп» пульта → `pauseVideo` у журналі сцени; телефон має «Переглянути ще раз»; кадр `video36-reveal-stage`.
   - **Світла тема** (як `part35-think.e2e.ts` ~287): `localStorage.setItem('quiz:theme', 'light')` на сцені й в Олі, `is-light` на `<html>`; кадри `video36-light-stage-reveal`, `video36-light-phone-320`; маски й затулка видимі (непрозорий колір), `expectNoSideScroll` у світлій темі.
2. `it('part 36: videoclip with sound in teams — unmute on the tap, anyone opens a shared chunk, a teammate sees it without playing, the first answer counts, a restart keeps the chunks, 320 px')`:
   - запитання `E2Evideo002`, «Зі звуком»; 2 команди по 2, `captain`, телефон Б — 320 px;
   - `frameSrc36` без `mute=1`; А (капітан) відкриває 1 с → у журналі А `unMute`, `playVideo`; на телефоні Б — відкрита комірка 1, «А: відкрито 1 с», у журналі Б **немає** `playVideo`;
   - Б (не капітан) відкриває 2 с → журнал Б `playVideo`; на А — «Б: відкрито 2 с»;
   - `restart()` посеред запитання → обидві драбинки з 2 шматками; наступний шматок приймається;
   - Б відповідає «Магучіх» → команда 800 (ціна 1000); поле А неактивне, «Відповідь прийнято на шматку 2 с»;
   - `expectPhoneFit(b, 'video36-teams-phone')`; кадри `video36-teams-phone`, `video36-teams-stage`.
3. `it('part 36: videoclip with 24 players — the stage tiles fit 1600×900')` — 24 сокет-гравці відкривають випадкову кількість шматків через `player:melody`, половина відповідає `player:answer { type: 'videoclip', … }`; `expectNoSideScroll`, кадр `video36-24-stage`.

- [ ] **Step 1: Write the scenarios** за зразком `part 29e` у `part29-memory-melody.e2e.ts` (структура `it(… try/catch snapshot …, 600_000)`, `useE2eServer()`).
- [ ] **Step 2: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 36"` (з `E2E_SHOTS=1` для кадрів). Expected: PASS; кадри в `apps/server/e2e/artifacts`. Контроль, що заглушка не зламала старе: `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 29e"` — PASS.
- [ ] **Step 3: Переглянути кадри.** Перевірити, що:
  - на 320 px рамка 16:9 на всю ширину картки, драбинка в один ряд без горизонтального скролу, «16 с · 25 %» не переноситься посеред слова;
  - затулка й маски не прозорі в обох темах, назва YouTube ніде не видна;
  - поле відповіді не перекрите смугою реакцій;
  - на сцені до розкриття немає відео; на розкритті — назва, таблиця й відео.
- [ ] **Step 4: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 36 videoclip — after a classic round, a YouTube link with a start second and sound off in the editor, chunks by tap with the frame covered outside them at 320 px, points by the longest chunk, no answer before reveal, the video with sound on the stage, light theme, sound on in teams, a restart, 24 tiles"
```
