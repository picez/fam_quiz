# План 29e: запитання «Мелодія за нотами» (`melody`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> План спирається на `main` після 29f (`781cb6ad`). Звідти беремо:
> - з 10b/16b: `audioSchema`, `AUDIO_LIMITS`, `AUDIO_URL`, `YOUTUBE_ID`, `POST /api/uploads/audio` і `sniffAudio` (`apps/server/src/upload-routes.ts`, `apps/server/src/storage/images.ts`), `AudioField.tsx` (`ACCEPT`, `isAllowed`, `fileSeconds`, `uploadAudio`), `QuestionAudio.tsx` (`<audio>` і прихована рамка YouTube, `YOUTUBE_BLOCK_MS`, кнопка `listen`, `command`), `YouTubePlayer.tsx` (`YOUTUBE_ORIGIN`, `youtubeEmbedUrl`), `parseYouTubeLink`/`videoLink` (`packages/shared/src/youtube.ts`), блок `.player-audio` у `PlayerScreen.tsx` (~1656), `host:audio` + `audioOf` (`views.ts` ~489, `manager.ts` ~1326), `silentMp3(frames)` в e2e (38 кадрів ≈ 1 с);
> - з типу `text` і 12c: `textAccepts` (`packages/engine/src/check.ts`: `answerKey`, описка Дамерау — Левенштейна, перша літера й цифри), `verdictOf`/`paceFactor`/`paysForTime`, `cluesPaid` і `openClue` (`packages/engine/src/clues.ts` — найближчий зразок «гравець сам відкриває, бали за відкритим»), `Rows` у `QuestionEditor.tsx` (~455), `TypedInput` в `AnswerInput.tsx`, командні чернетки (`isAnswerDraft`, `clipDraft`, `live-drafts.ts`);
> - з 28c/29f: `actorOf(…, 'answer')` → команда для будь-кого (`team-act.ts` ~65), `freeForAll` (`answerer.ts`), `questionOff`/`off_*` (`buffs.ts`), `noDebuffQuestion`/`answerersOf` (`debuffs.ts`), `roundQuestionNumber(state)` і перевірка `*_stale`, `optional(…)` у зрізах, `ADDED_29F` у `i18n.test.ts`, e2e `part 29f` (`socketFrames`, `shot`, `restart`, `expectPhoneFit`, `expectNoSideScroll`), `GAME_STATE_VERSION = 22`.
>
> **Перед кожною задачею виконавець звіряє назви й рядки з фактичним кодом** (`git show --stat 781cb6ad^1..781cb6ad` — повний перелік місць, які зачепив 29f; більшість із них треба зачепити й тут, але `melody` — тип із **текстовою відповіддю** через `player:answer`, а не головоломка: де 29f додавав `memory` до «без вердикту / без оцінки ведучого», `melody` туди **не** йде).

**Goal:** новий тип запитання `melody` («Мелодія за нотами»): ведучий заливає аудіофайл або дає посилання YouTube і задає секунду початку фрагмента та прийнятні написання назви. Кожен гравець на **своєму** телефоні натисканням відкриває шматки 1, 2, 4, 8, 16 с (кожен — з початку фрагмента), переслуховує відкрите скільки завгодно й один раз вписує відповідь. Бали — частка ціни за найдовшим відкритим шматком: 100 / 80 / 60 / 40 / 25 %; неправильно чи без відповіді — 0. Сцена бачить, хто відповів і на якому шматку; після часу трек грає на сцені, показуються назва й бали.

**Architecture:**
- **Спільне (`shared/src/melody.ts`, чисте):** сходинки шматків і частки ціни, кліп шматка й кліп розкриття у формі `QuestionAudio` (щоб грати наявним `QuestionAudio`). Схема запитання — у `quiz.ts`.
- **Стан (`engine/src/melody.ts`):** необов'язкове `Play.melody?: MelodyPlay` — скільки шматків відкрив кожен гравець рушія (у командах — команда) і хто з команди відкрив останній. Сервер приймає лише «відкрив шматок n» (`player:melody`), рахує бали за `heard` у мить відповіді. Відповідь іде звичайним `player:answer` (`{ type: 'melody', value }`), перевіряється `textAccepts`, а рушій дописує в запис `heard`. `GAME_STATE_VERSION` лишається 22.
- **Веб:** телефон — «драбинка» з 5 шматків і поле відповіді; звук грає новий хук `useMelodyClip`, який викликає `play()` **синхронно в обробнику дотику** (iOS). Сцена й пульт — рядки «нік · шматок · ✓ відповів»; на розкритті сцена сама вмикає 30 с треку (`QuestionAudio`, кнопки пульта «Ще раз / Стоп» працюють), телефон має «Прослухати ще раз». Редактор — «Файл / YouTube», секунда початку, прослуховування кожного шматка, написання відповіді.

**Tech Stack:** TypeScript, zod 4, vitest, Fastify + Socket.IO, React 19 + Vite + Testing Library, Playwright через vitest (e2e).

**Spec:** `docs/superpowers/specs/2026-11-11-melody-snippets-design.md` (обов'язкова). Зразки: `docs/superpowers/plans/2026-11-12-plan-29f-memory.md` і його код (`git log --oneline 36ccecf1..781cb6ad`), `docs/superpowers/plans/2026-10-24-plan-10b-slider-audio-reveal.md` (аудіо), 12c (власний темп «Хто я?», `game.clues-self.test.ts`, `views.clues-self.test.ts`).

## Global Constraints

- 7 мов без ru. Нові ключі — в uk (`apps/web/src/i18n.ts`) і в `apps/web/src/locales/{en,pl,de,es,it,ar}.json`. Списки `ADDED_29E` і `ADDED_29E_PLURALS` ідуть в `apps/web/src/i18n.test.ts` і додаються до умови `adds no uk keys beyond the agreed list`, як `ADDED_29F`. Довідка: `help-uk.ts`, `__fixtures__/help-uk-golden.json`, `help-vars.ts`, `locales/*.help.json`. **Нічого про росію** — у прикладах треків, фікстурах, довідці й e2e. Приклади: «Щедрик» (Леонтович; написання «Щедрик», «Shchedryk», «Carol of the Bells»), «Червона рута», «Ой у лузі червона калина». Звук у e2e — лише синтетичний `silentMp3`.
- `GAME_STATE_VERSION` не підвищувати, лишається **22**. Лише необов'язкові поля: `Play.melody?`, `BaseView.melody?`, `HostView.melody?`, `PlayerView.me.melody?`, `PublicQuestion.melody?`, `LiveProgress` `{ kind: 'melody' }`. У `restore.ts` біля рядка 29f додати «29e без нової версії: тип melody і необов'язковий Play.melody». Якщо знадобиться обов'язкове поле, **зупинитися й спитати контролера**.
- **Відповідь не йде на телефон і сцену до `reveal`.** До `reveal` ні `PublicQuestion`, ні базовий зріз (сцена, телефони), ні власний зріз телефона не містять `accepted` чи будь-якого з написань. Телефон і сцена отримують лише джерело (`url` файлу з випадковою назвою або YouTube `id`) і `start`. YouTube `id` видно — це прийнятно (специфікація мовчить; довідка радить файл для чесної гри). ID3-теги MP3 (назва, виконавець) **зрізаються при заливці** (задача 5); теги OGG/M4A лишаються — довідка про це каже.
- Шматки: `MELODY_STEPS = [1, 2, 4, 8, 16]` с, частки `MELODY_SHARES = [1, 0.8, 0.6, 0.4, 0.25]`. Шматок `n` відкривається лише після `n − 1` (`melody_step`); повтор уже відкритого — `{ ok: true }` без зміни стану (той самий об'єкт). Переслуховування — локальне, без події.
- Бали: `round(ціна × MELODY_SHARES[heard − 1] × multiplier)`; бонусу швидкості немає (`paysForTime`); неправильна відповідь — **0 навіть за правила раунду `penalty: 'minus'`** (так каже специфікація); без відповіді — запису немає, 0. Відповідь без жодного відкритого шматка — `melody_unheard`. Одна спроба: друга відповідь і відкриття після відповіді — `already_answered`. Серія (streak) працює як на типі `text` (правило раунду).
- Таймер: типово **60 с**, мінімум **25 с** (схема), максимум `LIMITS.maxTime` (120). Усі таймери у фікстурах і e2e ≥ 25 с.
- Тип дозволений **лише** в раундах `classic`. Будь-де ще (поле, бліц, фінал, ставки, аукціон, вибування, виживання і його випробування, мільйонер, «Головоломки») — `melody_place`; запасне — `spare_type`; дуель не приймає.
- Команди: шматки відкриває будь-хто з команди, `heard` — спільне на команду; відповідь дає будь-хто (навіть у режимі відповідача `captain`/`rotate`), фіксується перша, решта — `already_answered`. Звук у товаришів **сам не вмикається** (iOS): їхня драбинка просто показує відкрите й «{name}: відкрито {seconds} с».
- **Номер запитання в `player:melody` — номер у межах раунду** (`roundQuestionNumber(state)` = `view.questionIndex`), **не** `state.questionIndex`; застаріле — `melody_stale`. e2e грає «Мелодію» **після попереднього раунду**.
- Поле на телефоні має ключ за запитанням: `key={`${view.round?.index ?? 0}:${view.questionIndex}:${question.melody.id}`}`.
- iOS: `HTMLMediaElement.play()` і команди YouTube викликаються **синхронно в обробнику дотику** (не в `useEffect`, не після ack). Сервер підтверджує відкриття вже після початку звуку; відмова зупиняє звук.
- Юніт-тести: `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' …`. Prettier ніколи не запускати. Типи — `pnpm typecheck`.
- e2e: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 29e"` на передньому плані, менше ніж за 10 хв, Docker вимкнено. Звук — залитий `silentMp3`, **не YouTube**.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`). Кадри сцени 1600×900, телефон 320 px.

## Рішення плану (там, де специфікація мовчить)

- **Назва й місце.** Тип `'melody'` стоїть у `QUESTION_TYPES` одразу після `'memory'` (перед `'bluff'`), як 29f, щоб не зсувати наявні індекси. `all_types` у досягненнях зростає до 28 (`packages/shared/src/achievements.test.ts`, `apps/server/src/achievements.test.ts`, коментар `29e`).
- **Запитання:**
  ```ts
  type MelodyTrack = { source: 'file'; url: string /* AUDIO_URL */; start: number } | { source: 'youtube'; id: string /* YOUTUBE_ID */; start: number };
  { ...base, type: 'melody',
    timeLimit: int 25…120,              // LIMITS.minMelodyTime … LIMITS.maxTime
    track: MelodyTrack,                 // start: int 0…LIMITS.maxVideoStart
    accepted: spellings }               // той самий spellings, що в 'text'
  ```
  Схема перевіряє: відео, `audio` чи `reveal` → `melody_video` (власне джерело — `track`; загальне аудіо зіграло б сцені на етапі question); `hint` → `melody_hint` (бафи вимкнено). `imageUrl` дозволено (обкладинка — справа ведучого). Тривалість файлу сервер не знає: редактор попереджає, якщо файл коротший за `start + 16` (задача 6).
- **Спільна логіка** (`shared/src/melody.ts`): `melodyShare(heard)` — частка за `heard` 1…5 (менше 1 чи NaN — як 1, для попереднього вердикту); `melodySeconds(heard)` — 0 для 0, далі 1…16; `melodyClip(track, seconds): QuestionAudio`; `melodyRevealClip(track)` — `melodyClip(track, MELODY_REVEAL_SECONDS = 30)`.
- **Стан** (`game.ts`):
  ```ts
  /** «Мелодія за нотами» (29e): скільки шматків відкрито (1…5) гравцем рушія; у командах by — хто з учасників відкрив останній. */
  export interface MelodyPlay { heard: Record<string, number>; by?: Record<string, string> }
  // Play.melody?: MelodyPlay — openQuestion ставить { heard: {} } (у командах ще by: {}); видалення гравця прибирає його ключі.
  ```
- **Подія** `player:melody` `{ questionIndex, step }` → `melodyOpen(state, actorId, memberId, questionIndex, step, now): Result`. Перевірки по черзі: `wrong_phase` (не `question`), `paused` (пауза чи `heldAt`), `not_started`, `not_found` (зокрема учасник не цієї команди), `questionIndex !== roundQuestionNumber(state)` → `melody_stale`, не `melody` → `type_mismatch`, запис уже є → `already_answered`, `time_over` (`timeOverFor`), `step > heard + 1` → `melody_step`; `step ≤ heard` → `ok(state)` той самий об'єкт. Інакше `heard[actor] = step`, у командах `by[actor] = memberId`.
- **Відповідь.** `answerSchema` приймає `{ type: 'melody', value: string ≤ LIMITS.answerText }` (зайві поля, як-от `heard` із телефона, zod відкидає). `submitAnswer` після `asked.type !== answer.type`: `heard = melodyHeard(play, playerId)`; `heard < 1` → `melody_unheard`; `answer = { type: 'melody', value, heard }` (`MelodyAnswer`, як `SurveyAnswer` дописує `rows`). Перевірка — `checkAnswer` → `full(textAccepts(question.accepted, answer.value))`. Плата — `paceFactor(question, …, opened)` → `melodyShare(opened ?? 1)`, а виклики в `submitAnswer` (~2046) і в оцінці ведучого (~2694) передають `cluesPaid(play, id) ?? melodyPaid(play, id)`. `paysForTime` → `true` для `melody` (без бонусу швидкості). `penalty` для `melody` завжди `'none'` (обидва місця). Оцінку ведучого (`override`) і апеляцію тип **має**: «правильно» дає `ціна × частка(heard)`.
- **Бафи й дебафи вимкнено**: `questionOff` → `'off_melody'` (друга спроба суперечить «одній спробі», заміна й підказка — бафи текстового запитання, а тут бали за шматок); `noDebuffQuestion` і `answerersOf` у `debuffs.ts` — також для `melody`. Тип **не** йде в `UNGRADABLE`, `PROGRESS_TYPES`, переліки `gradable` чи `wrong_phase` оцінки ведучого — це звичайний текстовий запис із вердиктом.
- **Хто діє:** `team-act.ts` `'answer'` → команда для `melody` (як `drawing`); `answerer.ts` `freeForAll` і два сусідні вирази — також `melody` (відповідача на цьому запитанні не вибирають).
- **Зрізи:**
  - `PublicQuestion.melody?: PublicMelody = { id: string /* question.id */; track: MelodyTrack; answer: string | null /* accepted[0], лише на reveal */ }`. Для всіх ролей однаковий; `choices`/`right` — `[]`.
  - `BaseView.melody?` і `HostView.melody?`: `MelodyInfo = { rows: MelodyRow[] }`, `MelodyRow = { playerId, nickname, heard: number /* 0…5 */, answered: boolean, correct: boolean | null, points: number | null, timeMs: number | null /* три останні — лише на reveal */ }`. До `reveal` — порядок гравців; на `reveal` — спершу правильні за `heard` зростанням, далі за `timeMs`; далі неправильні; далі без відповіді; за рівності — порядок гравців. Рядки — для всіх гравців (команд), навіть без відкриттів. **Текстів відповідей тут немає** (ні сцені, ні пульту — пульт бачить їх у «Відповідях наживо»).
  - `PlayerView.me.melody?: PlayerMelody = { heard: number; canOpen: boolean; canAnswer: boolean; openedBy: string | null /* лише команди: нік того, хто відкрив останній шматок; соло null */ }`. `canOpen` — `question`, не пауза, не заставка, немає запису, `heard < 5`, не `time_over`. `canAnswer` — те саме, але `heard ≥ 1` замість `heard < 5`.
  - `LiveProgress` — `{ kind: 'melody'; heard: number; total: 5 }` у `progressOf` (`live.ts`), рядок відповіді — звичайний (текст, вердикт, час).
  - `audioOf(state)` на `reveal` запитання `melody` повертає `melodyRevealClip(track)`, тож `host:audio` («Ще раз / Стоп») керує треком на сцені; на `question`/`locked` — `null` (сцена мовчить).
- **Розсилка.** Відкриття — `commit(room, state, now)` одразу (подій щонайбільше 5 на учасника, товариш має бачити шматок без затримки); `step ≤ heard` (той самий стан) — без коміту. Окремого вікна частоти немає.
- **ID3.** `stripMp3Tags(bytes)` (`storage/images.ts`): прибирає ID3v2 на початку (повторювано, з урахуванням прапора footer) і 128-байтний ID3v1 `TAG` у кінці; результат має знову розпізнаватися `sniffAudio` як `audio/mpeg`, інакше `bad_audio`. Діє на всі MP3-заливки (аудіозапитанням це теж корисно).
- **Сцена:** на `question`/`locked` — текст запитання й плитки «нік · 🎧 {seconds} с», у тих, хто відповів, ✓ (без правильності); 24 гравці — сітка `puzzleGrid`/`puzzlePageSize`/`usePage`. Звуку немає. На `reveal` — «Це була «{answer}»», таблиця «місце · нік · шматок · бали» (зменшення шрифту, як у `JigsawResults`) і `QuestionAudio` з `melodyRevealClip`, `ready = phase === 'reveal'`, `command = audioCommand`.
- **Пульт:** ті самі рядки, що й на сцені; на `reveal` — панель `host-audio` («Ще раз / Стоп», а без сцени — грає сам, як 10b). Правильну відповідь пульт бачить завжди (як у `text`).
- **Телефон:** драбинка з 5 комірок «1 с · 100 %» … «16 с · 25 %»: відкриті — «▶» (переслухати), наступна — головна кнопка («Слухати 1 с», далі «Ще: 2 с»), решта неактивні. Під драбинкою — `TypedInput` (`AnswerInput` з типом `melody`), неактивний, поки `canAnswer` false, з рядком `melodyListenFirst`. Рядок частки «Зараз: {share} % ціни». У командах — «{name}: відкрито {seconds} с». Після відповіді — драбинка лишається для переслуховування, нових шматків немає. На `reveal` — звичайне розкриття текстової відповіді й блок `.player-audio` з `QuestionAudio` (`melodyRevealClip`, `listen 'again'`, `autoplay` — як для аудіо: лише автопілот без сцени).
- **Редактор:** перемикач «Файл / YouTube»; файл — та сама заливка й перевірки, що в `AudioField` (`ACCEPT`, `isAllowed`, `AUDIO_LIMITS.maxBytes`, `fileSeconds` експортуються з `AudioField.tsx`); YouTube — поле посилання, `parseYouTubeLink` (секунда з `t=` стає `start`); поле «З якої секунди»; 5 кнопок прослуховування шматків (`useMelodyClip`); `Rows` написань із підказкою. Нове запитання: `track: { source: 'file', url: '', start: 0 }` (чернетка, `problemMelodyTrack`), `accepted: ['']`, текст `melodyDefaultText` («Що це за пісня?»), 60 с, `LIMITS.defaultPoints`.

## Порядок збирання

- Задача 2 додає `melody` у `Question`/`Answer`, і вичерпні `switch` у `apps/web` ламаються. Тому в задачах 2–5 перевіряються лише `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`, а з задачі 6 — `pnpm typecheck`.
- Залежності: 2 ← 1; 3 ← 2; 4 ← 3; 5 ← 3, 4; 6 ← 1, 2; 7 ← 4, 6; 8 ← 4, 6, 7; 9 — остання.

## Review Focus

1. **Відповідь не витікає до розкриття.** На `question`/`locked` у `JSON.stringify` зрізу сцени, `PublicQuestion` і телефонів немає жодного з `accepted` (пульт бачить правильну відповідь, як у `text`, — це нормально); у залитому MP3 немає ID3-назви. Тести: задача 4 `the answer never reaches a phone or the stage before reveal`; задача 5 `mp3 tags are stripped on upload`; задача 9 — кадри сокета телефона й байти `/uploads/…`.
2. **Бали за найдовшим відкритим шматком.** 1000 балів: 1 с → 1000, 2 → 800, 4 → 600, 8 → 400, 16 → 250; ×2 — подвоєно; швидкість не впливає; неправильна — 0 і з `penalty: 'minus'`; поле `heard` із телефона ігнорується. Тести: задача 1 `shares by the chunk`; задача 3 `points by the longest chunk heard`, `a wrong answer gives zero even with a minus rule`, `the phone cannot claim a shorter chunk`.
3. **Шматки по черзі, одна спроба.** `step 3` при `heard 1` → `melody_step`; відповідь без шматка → `melody_unheard`; друга відповідь і відкриття після відповіді → `already_answered`. Тести: задача 3 `opens chunks one by one by the round-local number`, `one try`.
4. **Команди.** Будь-хто відкриває, `heard` спільне, товариш бачить «Оля: відкрито 2 с»; перша відповідь фіксується, у режимі `captain` відповідає й не капітан; суперники мають своє `heard`. Тести: задача 3 `teams share chunks, the first answer counts`; задача 4 `teammates see the shared chunk and who opened it`; задача 9 — сценарій команд.
5. **iOS-жест.** `useMelodyClip.play()` викликає `HTMLMediaElement.play()` синхронно в тому самому виклику, а таймер зупинки стартує з події `playing`; шматок 1 с зупиняється на 1000 мс. Тести: задача 6 `plays inside the tap`, `stops after the chunk from the moment it plays`; задача 9 — `currentTime` у межах шматка на 320 px.
6. **Запитання після попереднього раунду.** Відкриття з номером у раунді приймається, з `state.questionIndex` — `melody_stale`. Тести: задача 3, задача 5 `opens chunks through the socket after a classic round`, задача 9.
7. **Тип лише в класиці.** Тест: задача 2 `a melody plays only in classic rounds`.

---

### Задача 1. Спільне: шматки, частки, кліпи

**Files:**
- Create: `packages/shared/src/melody.ts`, `packages/shared/src/melody.test.ts`
- Modify: `packages/shared/src/index.ts` — `export * from './melody'`.

**Interfaces (Produces):**
```ts
export const MELODY_STEPS = [1, 2, 4, 8, 16] as const;            // секунди шматків
export const MELODY_SHARES = [1, 0.8, 0.6, 0.4, 0.25] as const;   // частка ціни за найдовшим відкритим
export const MELODY_STEP_COUNT = 5;
export const MELODY_REVEAL_SECONDS = 30;
export type MelodyTrack = { source: 'file'; url: string; start: number } | { source: 'youtube'; id: string; start: number };
export function melodyShare(heard: number): number;               // heard 1…5; < 1, NaN — 1; > 5 — 0.25
export function melodySeconds(heard: number): number;             // 0 → 0, 1…5 → MELODY_STEPS, поза — 0 / 16
export function melodyClip(track: MelodyTrack, seconds: number): QuestionAudio;   // { ...track, duration: seconds }
export function melodyRevealClip(track: MelodyTrack): QuestionAudio;
```
`QuestionAudio` — лише `import type` з `./quiz` (`quiz.ts` імпортуватиме цей файл; значень з `quiz.ts` тут не брати).

- [ ] **Step 1: Write the failing tests** (`melody.test.ts`):
  - `steps double and shares fall` — `MELODY_STEPS` дорівнює `[1, 2, 4, 8, 16]`, `MELODY_SHARES` — `[1, 0.8, 0.6, 0.4, 0.25]`, обидва довжини `MELODY_STEP_COUNT`.
  - `shares by the chunk` — `[1, 2, 3, 4, 5].map((n) => Math.round(1000 * melodyShare(n)))` дорівнює `[1000, 800, 600, 400, 250]`; `melodyShare(0) === 1`, `melodyShare(Number.NaN) === 1`, `melodyShare(9) === 0.25`.
  - `seconds of the longest chunk` — `melodySeconds(0) === 0`, `melodySeconds(1) === 1`, `melodySeconds(4) === 8`, `melodySeconds(5) === 16`.
  - `clips keep the source and start` — `melodyClip({ source: 'file', url: '/uploads/' + 'a'.repeat(32) + '.mp3', start: 5 }, 4)` дорівнює `{ source: 'file', url: …, start: 5, duration: 4 }`; YouTube — `{ source: 'youtube', id: 'abcdefghijk', start: 30, duration: 2 }`; `melodyRevealClip(track).duration === 30`; кліп проходить `audioSchema.safeParse` (імпорт у тесті дозволено).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/shared/src/melody.test.ts`. Expected: FAIL (модуля немає).
- [ ] **Step 3: Implement** за Interfaces.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/shared && tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 29e melody logic — chunks of 1, 2, 4, 8 and 16 seconds, shares of the price by the longest chunk, chunk and reveal clips"
```

---

### Задача 2. Спільне: запитання, місця, ліміти, відповідь, подія, помилки, зрізи

**Files:**
- Modify:
  - `packages/shared/src/quiz.ts`:
    - `LIMITS`: `minMelodyTime: 25`, `defaultMelodyTime: 60` (doc-коментарі, як у `memory`);
    - `QUESTION_TYPES`: `'melody'` після `'memory'`;
    - `melodyTrackSchema` (discriminatedUnion за `source`: `file` — `url` за `AUDIO_URL`, `youtube` — `id` за `YOUTUBE_ID`; `start` — той самий `audioStart`) і гілка `questionSchema`;
    - `superRefine` запитання: `melody_video`, `melody_hint`;
    - блок `melody_place` у `quizSchema.superRefine` поряд із `drawingPlace` (той самий вираз: поле — будь-яка клітинка; інакше `round.type !== 'classic'` і питання **разом із** `roundTrials(round)`);
    - перевірку запасних (`spare_type`) — `melody` не простий тип, тож уже відкидається; додати тест.
  - `packages/shared/src/answer.ts` — у `answerSchema` гілка `{ type: z.literal('melody'), value: z.string().max(LIMITS.answerText).refine(isStorable, UNSTORABLE) }`; `MelodyAnswer` в `Answer`; `melodyHeardOf(answer): number | null`.
  - `packages/shared/src/drafts.ts` — `clipDraft` обрізає й `melody`.
  - `packages/shared/src/events.ts` — `melodyOpenSchema`, `'player:melody'` у `ClientToServerEvents` (doc-коментар з переліком помилок).
  - `packages/shared/src/game.ts` — `ErrorCode`: `'melody_stale' | 'melody_step' | 'melody_unheard'`; `BuffWhy`: `'off_melody'`.
  - `packages/shared/src/views.ts` — `PublicMelody`, `MelodyRow`, `MelodyInfo`, `PlayerMelody`; поля `PublicQuestion.melody?`, `BaseView.melody?`, `HostView.melody?`, `PlayerView.me.melody?`; `LiveProgress` `{ kind: 'melody'; heard: number; total: number }`.
  - `packages/shared/src/achievements.test.ts` — `all_types: 28`, коментар `29e`.
- Test: `packages/shared/src/quiz.test.ts`, `packages/shared/src/answer`-тести в `quiz.test.ts` (там, де `answerSchema`), `packages/shared/src/achievements.test.ts`, `packages/shared/src/facts.test.ts` (див. нижче)

**Interfaces (Produces):**
```ts
// quiz.ts
z.object({ ...base, type: z.literal('melody'),
  timeLimit: z.number().int().min(LIMITS.minMelodyTime).max(LIMITS.maxTime),
  track: melodyTrackSchema,
  accepted: spellings })
// answer.ts — складає рушій; з телефона приходить лише { type, value }
export interface MelodyAnswer { type: 'melody'; value: string; /** Скільки шматків відкрито в мить відповіді (1…5). */ heard: number }
export function melodyHeardOf(answer: Answer | null): number | null;   // як surveyHitsOf
// events.ts — questionIndex: номер у раунді, без верхньої межі
export const melodyOpenSchema = z.object({ questionIndex: z.number().int().nonnegative(), step: z.number().int().min(1).max(MELODY_STEP_COUNT) }).strict();
'player:melody': (payload: z.infer<typeof melodyOpenSchema>, ack: Ack) => void;
// views.ts — форми з «Рішень плану»
```

- [ ] **Step 1: Write the failing tests** (`quiz.test.ts`). Помічник `melQ(patch)`: `track: { source: 'file', url: '/uploads/' + 'a'.repeat(32) + '.mp3', start: 5 }`, `accepted: ['Щедрик', 'Shchedryk', 'Carol of the Bells']`, текст «Що це за пісня?», 60 с, 1000 балів, `imageUrl: null`, `video: null`.
  - `accepts a melody` — парситься; YouTube-джерело `{ source: 'youtube', id: 'abcdefghijk', start: 30 }` теж; `imageUrl` з `/uploads/…png` — теж; `timeLimit: 25` і `120` — ок.
  - `refuses a broken melody`:
    - відео, `audio` чи `reveal` → `melody_video`; `hint` → `melody_hint`;
    - `accepted: []`, `url: '/uploads/x.wav'`, `url: 'https://x/y.mp3'`, `id: 'short'`, `start: -1`, `start: 43_201`, `timeLimit: 24`, `timeLimit: 121`, без `track` → помилка парсингу.
  - `a melody plays only in classic rounds`:
    - у `classic` → ок;
    - у `blitz`, `final`, на клітинці `board`, у `bets`, `auction`, `wipeout`, `survival` (і в його trial), `ladder`, `puzzles` → `melody_place`;
    - запасне цього типу → `spare_type`; дуель його не приймає.
  - `the melody event is limited` — `step: 0`, `step: 6`, `step: 1.5`, `questionIndex: -1`, зайве поле → false; `{ questionIndex: 7, step: 5 }` → true.
  - `a melody answer comes from the phone without heard` — `answerSchema.parse({ type: 'melody', value: 'Щедрик', heard: 1 })` дорівнює `{ type: 'melody', value: 'Щедрик' }`; рядок 201 символ → false; `melodyHeardOf({ type: 'melody', value: 'x', heard: 3 }) === 3`, `melodyHeardOf({ type: 'melody', value: 'x' }) === null`, `melodyHeardOf(null) === null`.
  - `QUESTION_TYPES_MATCH_SCHEMA` компілюється; `QUESTION_TYPES.indexOf('melody') === QUESTION_TYPES.indexOf('memory') + 1`; `old quizzes still parse` без змін.
  - `facts.test.ts`: `a melody keeps the answer window` — `melody` не `wholeRowQuestion` і має вікно відповіді, як `text` (`facts.ts` не змінюється; тест фіксує поведінку).
  - `achievements.test.ts`: `all_types: 28`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/shared`. Expected: FAIL.
- [ ] **Step 3: Implement** за Interfaces і «Рішеннями плану».
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/shared && tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 29e melody question — a file or YouTube track with a start second and accepted spellings, only in classic rounds, a chunk event, a text answer, views without the title before reveal"
```

---

### Задача 3. Рушій: шматки, відповідь, бали, команди, оцінка ведучого

**Files:**
- Create: `packages/engine/src/melody.ts`, `packages/engine/src/game.melody.test.ts`
- Modify:
  - `packages/engine/src/game.ts`:
    - `MelodyPlay`, `Play.melody?`;
    - `openQuestion` (~1472): для `melody` — `{ heard: {} }`, у командах `{ heard: {}, by: {} }`;
    - видалення гравця (~1153) прибирає `heard[id]` і `by[id]`; `teams.ts` (~236, вилучення учасника) прибирає `by` записи, що вказують на нього;
    - `submitAnswer` (~2041): гілка `melody` (`melody_unheard`, дописаний `heard`), `cluesPaid(play, playerId) ?? melodyPaid(play, playerId)` у `verdictOf`, `penalty: asked.type === 'melody' ? 'none' : rulesOf(round).penalty`;
    - оцінка ведучого (~2685–2700): той самий `?? melodyPaid` і той самий `penalty`.
  - `packages/engine/src/check.ts` — `checkAnswer` (`textAccepts`), `paceFactor` (`melodyShare(opened ?? 1)`), `paysForTime` (`melody`).
  - `packages/engine/src/team-act.ts` — `'answer'` → команда для `melody`; `packages/engine/src/answerer.ts` — `melody` у `freeForAll` і двох сусідніх виразах.
  - `packages/engine/src/buffs.ts` — `PlaceBlock`/`questionOff` → `'off_melody'`; `packages/engine/src/debuffs.ts` — `noDebuffQuestion` і `answerersOf` також для `melody`.
  - `packages/engine/src/restore.ts` — лише коментар; `packages/engine/src/index.ts` — `export * from './melody'`.
  - `packages/engine/src/testing/fixtures.ts` — `melody` (файл, `start: 5`, написання «Щедрик», «Shchedryk», «Carol of the Bells», 60 с, 1000 балів), `melodyYoutube` («Червона рута», `source: 'youtube'`, `id: 'abcdefghijk'`, `start: 12`, 45 с) і `melodyQuiz(settings)`: раунд `classic` з одним `single` на 30 с; раунд `classic` з `melody` і `melodyYoutube`.
  - `packages/engine/src/testing/autopilot.ts` — `case 'melody'`: бот (у командах — перший учасник) відкриває шматки 1…k (k = 1 для «правильного», 4 для «неправильного»), потім відповідає `accepted[0]` або «Ой у лузі червона калина» через звичайний шлях відповіді, з номером `roundQuestionNumber`.
- Test: `game.melody.test.ts`, `restore.test.ts`, `autopilot.full.test.ts`, `game.buffs.test.ts`, `check.test.ts`

**Interfaces:**
- Consumes: `MELODY_STEP_COUNT`, `melodyShare`, `MelodyAnswer`, `roundQuestionNumber`, `withCurrentPlay`, `recordOf`, `timeOverFor`, `notStarted`, `teamsOn`, `memberOf`, `fail`, `ok`, `textAccepts`.
- Produces:
```ts
export type MelodyQuestion = Extract<Question, { type: 'melody' }>;
export function melodyHeard(play: Play, actorId: string): number;              // 0, якщо не відкривав чи не melody
export function melodyPaid(play: Play, actorId: string): number | undefined;   // heard для melody, інакше undefined
export function melodyOpen(state: GameState, actorId: string, memberId: string, questionIndex: number, step: number, now: number): Result;
```

- [ ] **Step 1: Write the failing tests** (`game.melody.test.ts`). Гравці: Оля, Тарас, Петро. `melodyQuiz()`, помічник `toMelody(state)` проходить перший раунд і відкриває `melody` (тож `roundQuestionNumber = 0`, `state.questionIndex = 1`), `open(state, who, step, t)` — `melodyOpen` з номером 0.
  - `opens chunks one by one by the round-local number`:
    - `step 1` з `questionIndex 0` → `heard[Оля] === 1`; з `questionIndex 1` → `melody_stale`;
    - `step 3` при `heard 1` → `melody_step`; `step 2` → `heard 2`;
    - `step 1` ще раз → `ok`, стан той самий (`toBe`).
  - `refuses chunks out of time` — пауза → `paused`; заставка → `not_started`; у `startedAt + 60_000` → `time_over`; `locked` → `wrong_phase`; невідомий гравець → `not_found`; номер першого раунду на його `single` → `type_mismatch`.
  - `points by the longest chunk heard` — п'ять окремих станів, у кожному Оля відкриває 1…n і відповідає «Щедрик»: бали `[1000, 800, 600, 400, 250]`, `basePoints` ті самі, `grade 'correct'`, `accepted true`, `accuracy` `[1, 0.8, 0.6, 0.4, 0.25]`, `answer` дорівнює `{ type: 'melody', value: 'Щедрик', heard: n }`.
  - `typos and spellings count as in text` — «щедрік» → 1000; «Shchedryk» → 1000; «carol of the bells» → 1000; «Шедрик» (інша перша літера) → `wrong`, 0.
  - `a wrong answer gives zero even with a minus rule` — раунд з `penalty: 'minus'`: «Колядка» → `points 0`, `basePoints 0`, `grade 'wrong'`; той самий раунд, тип `text` (контроль) → від'ємні бали.
  - `no speed bonus` — раунд із `speedBonus: true`: відповідь на 1-й і на 50-й секунді (обидві після `step 2`) — по 800.
  - `a classic ×2 doubles` — `multiplier: 2`, `step 2` → 1600.
  - `one try` — друга відповідь → `already_answered`; `step 3` після відповіді → `already_answered`.
  - `answering needs a chunk` — відповідь без відкриттів → `melody_unheard`.
  - `the phone cannot claim a shorter chunk` — після `step 4` відповідь `{ type: 'melody', value: 'Щедрик', heard: 1 } as Answer` → запис `heard 4`, 400.
  - `the host override pays by the chunk` — «Колядка» після `step 2`, ведучий ставить `correct` → 800, `grade 'correct'`; `partial` за правила 50 % → 400.
  - `teams share chunks, the first answer counts`. Команди «Соняшники» (Оля, Тарас) і «Маки» (Петро, Ганна), режим відповідача `captain` (капітан — Оля):
    - Оля `step 1`, Тарас `step 2` → `heard[Соняшники] === 2`, `by[Соняшники] === Тарас`;
    - Тарас (не капітан) відповідає «Щедрик» → запис команди 800; Оля → `already_answered`;
    - Ганна `step 2` при `heard[Маки] 0` → `melody_step`; «Маки» мають своє `heard`.
  - `buffs and debuffs are off` — будь-який баф → `off_melody`; дебаф на `melody` не ставиться (`answerersOf` порожній).
  - `a removed player leaves no chunks` — після вилучення Олі `heard` не має її ключа.
  - `check.test.ts`: `checkAnswer` для `melody` — `textAccepts`; `paceFactor(melody, 0, 3) === 0.6`; `paysForTime(melody) === true`.
  - `restore.test.ts`: `a restored room keeps the melody chunks` — знімок із `Play.melody` (`heard`, `by`) читається; старий знімок без поля теж; `GAME_STATE_VERSION === 22`.
  - `autopilot.full.test.ts`: `melodyQuiz()` грається ботами до кінця; на обох мелодіях правильні боти (шматок 1) мають по 1000, неправильні (шматок 4 і чужа назва) — 0, у кожного запису є `heard`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/engine/src/game.melody.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» і зразком `openClue`/`cluesPaid` (`clues.ts`) та `memoryFlip` (перевірка `*_stale`). `game.ts` імпортує `melody.ts`, а `melody.ts` — `game.ts` (звертання лише під час виклику, як у `clues.ts`).
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/engine && tsc -p packages/shared && tsc -p packages/engine`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/engine
git commit -m "feat(engine): 29e melody — chunks opened one by one by the round-local number, one text answer checked like text, points by the longest chunk, zero for wrong, shared chunks and the first answer in teams"
```

---

### Задача 4. Рушій: зрізи, наживо, кліп розкриття

**Files:**
- Modify: `packages/engine/src/views.ts`:
  - `publicQuestion`: `...(question.type === 'melody' ? { melody: publicMelody(question, revealed) } : {})` — `track` завжди, `answer` лише на `reveal`, `accepted` ніколи;
  - `melodyInfo(state, reveal)` → `optional('melody', …)` у базовому зрізі (поряд із `memory`, ~2720) і в `hostView`;
  - `playerMelody(state, actorId, now)` → `me.melody` у соло-гілці й командній (`openedBy` — нік за `by[team]`);
  - `audioOf` — кліп розкриття (див. «Рішення плану»).
- Modify: `packages/engine/src/live.ts` — `progressOf` → `{ kind: 'melody', heard, total: MELODY_STEP_COUNT }`.
- Test: Create `packages/engine/src/views.melody.test.ts`; `packages/engine/src/live.test.ts` (або той файл, де тести `progressOf`)

**Interfaces:**
- Consumes: `melodyHeard`, `MelodyPlay`, `melodyRevealClip`, `MELODY_STEP_COUNT`, `timeOverFor`, `notStarted`.
- Produces: `PublicMelody`, `MelodyInfo`, `PlayerMelody` у зрізах (форми — задача 2).

- [ ] **Step 1: Write the failing tests:**
  - `the answer never reaches a phone or the stage before reveal` — на `question` і `locked` `JSON.stringify` зрізу сцени, телефонів Олі й Тараса та `publicQuestion` не містить «Щедрик», «Shchedryk», «Carol of the Bells» і ключа `accepted`; містить `url` треку і `"start":5`; `publicQuestion.melody.answer === null`; на `reveal` — `answer === 'Щедрик'`.
  - `the stage sees who answered and on which chunk` — Оля відкрила 2 і відповіла, Тарас відкрив 1, Петро нічого → `rows` у порядку гравців: `{ heard: 2, answered: true, correct: null, points: null }`, `{ heard: 1, answered: false }`, `{ heard: 0, answered: false }`; у `MelodyRow` немає ключів `answer`/`value`.
  - `reveal ranks by chunk` — Оля правильно на 2, Тарас правильно на 1, Петро неправильно на 1, Ганна без відповіді → порядок Тарас, Оля, Петро, Ганна; `correct` і `points` заповнені (1000, 800, 0, `null` у Ганни — без запису).
  - `the phone can open and answer only while open` — до першого шматка `canOpen true`, `canAnswer false`; після `step 1` обидва true; після `step 5` `canOpen false`; на паузі, у заставці, після відповіді, після `time_over` і на `locked` — обидва false.
  - `teammates see the shared chunk and who opened it` — Тарас відкрив 2 → телефон Олі `heard 2`, `openedBy 'Тарас'`; телефон Петра (Маки) `heard 0`, `openedBy null`; соло `openedBy` завжди `null`.
  - `the host sees the chunk in live answers` — рядок Олі: `progress { kind: 'melody', heard: 2, total: 5 }`, `answer { type: 'melody', value: 'Щедрик', heard: 2 }`, `verdict 'correct'`.
  - `the reveal clip goes to the host controls only on reveal` — `audioOf` на `question` і `locked` → `null`; на `reveal` → `{ source: 'file', url, start: 5, duration: 30 }`; YouTube-мелодія → `{ source: 'youtube', id: 'abcdefghijk', start: 12, duration: 30 }`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/engine/src/views.melody.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за зразком `memoryInfo`/`playerMemory` і `clueOpensOf` у тому ж файлі.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/engine && tsc -p packages/engine`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/engine
git commit -m "feat(engine): 29e melody views — the track without the title before reveal, who answered and on which chunk for the stage and host, the shared chunk on teammate phones, a 30-second reveal clip for the host controls"
```

---

### Задача 5. Сервер: подія, розсилка, ID3, історія, seed-тести

**Files:**
- Modify:
  - `apps/server/src/rooms/manager.ts` — `melodyOpen(room, playerId, payload): AckResult`: `this.act(room, playerId, 'answer')`, далі `melodyOpen` рушія з `who.id` і `playerId`; змінений стан — `this.commit(room, result.state, now)`; той самий — без коміту; `{ ok: true }`. `answerStamp` (~609) — `melodyHeard`, щоб відбиток відкритих шматків враховувався, як поступ інших типів.
  - `apps/server/src/socket.ts` — `on('player:melody')` за зразком `player:memory` (`melodyOpenSchema`).
  - `apps/server/src/storage/images.ts` — `stripMp3Tags(bytes: Uint8Array): Uint8Array`; `apps/server/src/upload-routes.ts` — для `audio/mpeg` зберігається `stripMp3Tags(bytes)`, повторний `sniffAudio` не `audio/mpeg` → 400 `bad_audio`.
  - Вичерпні `switch` за типом відповіді/запитання в `apps/server/src/achievement-games.ts` і `apps/server/src/game-achievements.ts` (якщо `tsc` їх покаже) — `melody` як `text`.
  - `apps/server/src/achievements.test.ts` — `all_types` 28.
  - `apps/server/scripts/{compass,evening,family,family2,fun,grand,halloween,horizon,world}-quiz.test.ts`: у фільтр типів додати `&& t !== 'melody'` з коментарем `29e: новий тип, демо без «Мелодії»`. `mix2-quiz.test.ts` і `showcase-quiz.test.ts` не чіпати. Перевірити `grep -n "'memory'" apps/server/scripts/*.test.ts`.
- Test: Create `apps/server/src/rooms/manager.melody.test.ts`; `apps/server/src/socket.test.ts`, `apps/server/src/uploads.test.ts`, `apps/server/src/storage/images.test.ts`, `apps/server/src/history.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - `opens chunks through the socket after a classic round` — `melodyQuiz()`, після першого раунду `player:melody` `{ questionIndex: view.questionIndex /* 0 */, step: 1 }` → `{ ok: true }`, власний зріз має `me.melody.heard 1`, сцена — рядок `heard 1`; з `questionIndex: 1` → `melody_stale`; `{ step: 7 }` → `invalid`.
  - `a teammate gets the shared chunk at once` — у командах Тарас відкриває 2 → наступний зріз телефона Олі (без очікування вікна) має `heard 2`, `openedBy 'Тарас'`.
  - `a repeated chunk sends nothing` — повтор `step 1` → `{ ok: true }` і жодного нового зрізу.
  - `answers through the socket pay by the chunk` — `player:answer` `{ type: 'melody', value: 'Щедрик' }` після `step 3` → запис 600.
  - `host replay plays the melody on reveal` — `host:audio { action: 'replay' }` на `reveal` → `{ ok: true }` і команда сцені; на `question` → `wrong_phase`.
  - `a restored room keeps the chunks` — після `restart` менеджера перепідключений телефон має той самий `me.melody.heard`, і наступний шматок приймається.
  - `images.test.ts`: `stripMp3Tags drops ID3v2 and ID3v1` — `ID3\x04\x00\x00` + syncsafe розмір + кадр `TIT2` з «Shchedryk» + `silentMp3`-кадри + 128 байтів `TAG…Shchedryk…` → результат починається з `0xff 0xfb`, не містить «Shchedryk», довжина = кадри; два ID3v2 підряд прибираються обидва; MP3 без тегів повертається тим самим вмістом.
  - `uploads.test.ts`: `mp3 tags are stripped on upload` — заливка такого MP3 → 201, `GET /uploads/…` не містить «Shchedryk»; лише ID3-заголовок без кадрів → 400 `bad_audio`; OGG зберігається без змін.
  - `history.test.ts`: `history shows the melody answer and the chunk` — запис `{ type: 'melody', value: 'Щедрик', heard: 2 }` з 800 у збереженій історії читається з тим самим `heard`.
  - Seed-тести: `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/server/scripts` зелені.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/server/src/rooms/manager.melody.test.ts apps/server/src/socket.test.ts apps/server/src/uploads.test.ts apps/server/src/storage/images.test.ts apps/server/src/history.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за зразком `RoomManager.memoryFlip` (без вікна частоти й `watchTimers`) і `registerUpload`.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/server && tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server
git commit -m "feat(server): 29e melody — a chunk event with the round-local number pushed at once to teammates, host replay of the track on reveal, MP3 ID3 tags stripped on upload; seed demos skip the new type"
```

---

### Задача 6. Веб: програвач шматків, редактор, чернетки, тексти, довідка

**Files:**
- Create: `apps/web/src/live/useMelodyClip.ts`, `apps/web/src/live/useMelodyClip.test.tsx`, `apps/web/src/editor/MelodyEditor.tsx`, `apps/web/src/editor/MelodyEditor.test.tsx`
- Modify:
  - `apps/web/src/screens/QuestionAudio.tsx` — лише `export` для `YOUTUBE_BLOCK_MS` (уже є) і, якщо треба, допоміжна `needsTouch`; логіку не змінювати.
  - `apps/web/src/editor/AudioField.tsx` — експорт `ACCEPT`, `isAllowed`, `fileSeconds` (без зміни поведінки).
  - `apps/web/src/editor/draft.ts`:
    - `questionTypesFor`: `melody` лише в `classic` (вилучити з фільтрів решти раундів, ~111/115);
    - `newQuestion('melody')` за «Рішеннями плану»;
    - `minTimeOf` — `LIMITS.minMelodyTime`; `maxTimeOf` — `LIMITS.maxTime` (без змін);
    - `problemKey`: `problemMelodyTrack` (`url === ''` чи недійсне джерело), `problemMelodyAccepted` (порожнє написання), `problemMelodyPlace`, `problemMelodyLimits` (у формулі `min` поряд із `problemMemoryLimits`);
    - перетворення типів (~474): `text`/`clues` → `melody` зберігає `accepted`; `melody` → `text` теж.
  - `apps/web/src/editor/draft-storage.ts` — `reviveMelody`: `track` — `file` лише з `AUDIO_URL`, `youtube` лише з `YOUTUBE_ID`, інакше `{ source: 'file', url: '', start: 0 }`; `start` — ціле `0…LIMITS.maxVideoStart`, інакше 0; `accepted` — рядки, обрізані до `LIMITS.answerText`, не більше `LIMITS.maxAccepted`, порожній список → `['']`; без `hint`/`audio`/`video`/`reveal`.
  - `apps/web/src/editor/QuestionEditor.tsx` — `case 'melody'` → `MelodyEditor`; без загальних `AudioField`, `VideoField`, «перевертання» й підказки (ті самі умови, що для `memory`, ~874–975); `ImageField` лишається.
  - `apps/web/src/format.ts` (`correctText` → `accepted[0]`, `answerText` → `melodyAnswerHeard` «{answer} · {seconds} с», без `heard` — лише значення), `apps/web/src/live-drafts.ts` (`melody` поряд із `text`), `apps/web/src/admin/admin-text.ts` (`melody` як `clues`), `apps/web/src/guide-text.ts` (`TYPE_ICONS.melody = '🎵'`), `apps/web/src/round-summary.ts` (`summaryMelodies_one/_few/_many`).
  - `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts` (`ADDED_29E`, `ADDED_29E_PLURALS`), `apps/web/src/locales/*.json`, `apps/web/src/help/help-uk.ts` (`question.melody.*`: `title`, `what`, `how.0…2`, `points.0…1`, `tip.0…1`, `limits.0…2`), `help-vars.ts` (`minMelodyTime`, `defaultMelodyTime`), `__fixtures__/help-uk-golden.json`, `apps/web/src/locales/*.help.json`. Ключі:
    - тип: `type_melody` («Мелодія за нотами»), `typeShort_melody` («Мелодія»), `typeHow_melody`, `buffWhy_off_melody`;
    - помилки: `err_melody_stale`, `err_melody_step`, `err_melody_unheard`;
    - проблеми чернетки: `problemMelodyTrack`, `problemMelodyAccepted`, `problemMelodyPlace`, `problemMelodyLimits`;
    - редактор: `melodyDefaultText`, `melodySourceLabel`, `melodySourceFile`, `melodySourceYoutube`, `melodyLinkLabel`, `melodyLinkPlaceholder`, `melodyBadLink`, `melodyStart` («З якої секунди»), `melodyShortFile` («Файл коротший за {need} с — останні шматки обріжуться»), `melodyPreview` («▶ {seconds} с»), `melodyAcceptedHint`;
    - телефон, сцена, пульт (задачі 7–8 беруть їх звідси): `melodyListen` («Слухати {seconds} с»), `melodyMore` («Ще: {seconds} с»), `melodyReplay` («Переслухати {seconds} с»), `melodyStep` («{seconds} с · {share} %»), `melodyShareNow` («Зараз: {share} % ціни»), `melodyListenFirst` («Спершу послухайте шматок»), `melodyOpenedBy` («{name}: відкрито {seconds} с»), `melodyAnswered` («Відповідь прийнято на шматку {seconds} с»), `melodyBlocked`, `melodyFailed`, `melodyStageNone` («ще не слухав»), `melodyStageHeard` («🎧 {seconds} с»), `melodyPlayersAnswered` («Відповіли: {count} з {total}»), `melodyRevealTitle` («Це була «{title}»»), `melodyTableChunk`, `melodyTableLabel`, `melodyAnswerHeard`, `summaryMelodies_one`.
    - `ADDED_29E_PLURALS`: `summaryMelodies_few`, `summaryMelodies_many`.
- Test: `apps/web/src/editor/draft.test.ts`, наявний тест `draft-storage`, `apps/web/src/i18n.test.ts`, `apps/web/src/help/*.test.ts`, `apps/web/src/round-summary.test.ts`, `apps/web/src/format.test.ts`

**Interfaces (Produces):**
```ts
// live/useMelodyClip.ts
export type MelodyPlayState = 'idle' | 'playing' | 'blocked' | 'failed';
export function useMelodyClip(track: MelodyTrack, opts: { paused: boolean; live: boolean }): {
  /** Синхронно в обробнику дотику: файл — currentTime = start і element.play(); YouTube — seekTo(start) і playVideo. Новий виклик під час гри — з початку. */
  play(seconds: number): void;
  stop(): void;
  state: MelodyPlayState;
  /** Скільки секунд грає поточний шматок; null — тиша. */
  playing: number | null;
  /** <audio preload="auto"> або прихована рамка YouTube (enablejsapi, controls=0): рендерити один раз. */
  element: JSX.Element;
};
// editor/MelodyEditor.tsx
export type MelodyQuestion = Extract<Question, { type: 'melody' }>;
export function MelodyEditor(props: { question: MelodyQuestion; onChange: (q: Question) => void }): JSX.Element;
```
Правила `useMelodyClip`: таймер зупинки (`seconds × 1000` мс) стартує з події `playing` (файл) або `onStateChange 1` (YouTube), а не з дотику, — буферизація не з'їдає шматок 1 с; додатковий запобіжник — `timeupdate` з `currentTime ≥ start + seconds` → пауза. `paused: true` чи `live: false` зупиняє звук. `NotAllowedError` → `'blocked'`, помилка носія → `'failed'`; YouTube, що не підтвердив гру за `YOUTUBE_BLOCK_MS`, → `'blocked'`. Розмонтування зупиняє звук.

- [ ] **Step 1: Write the failing tests:**
  - `useMelodyClip.test.tsx` (`HTMLMediaElement.prototype.play`/`pause` замокано, як у `QuestionAudio.test.tsx`; фейкові таймери):
    - `plays inside the tap` — у `onClick` тестової кнопки `clip.play(1)`; одразу після `fireEvent.click` (без `await`, без `act`-ефектів) `play` викликано рівно раз, `currentTime === 5`;
    - `stops after the chunk from the moment it plays` — `play(1)`, 300 мс без події `playing` → не на паузі; подія `playing`, далі 999 мс → не на паузі, 1000 мс → `pause` викликано, `state 'idle'`, `playing null`;
    - `a longer chunk restarts from the start` — під час `play(1)` виклик `play(4)` → `currentTime === 5`, зупинка через 4000 мс від `playing`;
    - `pause and the end of the question stop the sound` — `paused: true` або `live: false` → `pause`;
    - `a blocked play is reported` — `play` відхиляє `NotAllowedError` → `state 'blocked'`;
    - `youtube gets seek and play in the tap` — для YouTube-треку `play(2)` синхронно постить у рамку `seekTo [12, true]` і `playVideo` (`postMessage` замокано, рамка вже відгукнулась).
  - `draft.test.ts`:
    - `a melody lives in classic only` — `classic` містить тип; `blitz`/`final`/`board`/`bets`/`puzzles` — ні;
    - `a new melody waits for its track` — нове запитання → `problemMelodyTrack`; з файлом — `problemMelodyAccepted`; з написанням — без проблеми; 60 с;
    - `the timer floor is 25` — `minTimeOf({ type: 'melody' }) === 25`, `maxTimeOf` — 120; 24 с → `problemMelodyLimits`;
    - `text turns into a melody keeping spellings`.
  - `draft-storage`: `a stored melody is revived within limits` — `url: 'https://x/y.mp3'` → порожній файл; `id: 'x'` → порожній файл; `start: 99_999` → 0; написання 300 символів обрізається до 200; `hint` зникає; 12 написань → 10.
  - `MelodyEditor.test.tsx` (`uploadAudio` і `fileSeconds` замокано):
    - `a file upload sets the track` — вибір `song.mp3` → `onChange` з `track { source: 'file', url: '/uploads/…mp3', start: 0 }`; файл на 10 с при `start 0` → видно `melodyShortFile` з `need 16`;
    - `a too large or wrong file is refused` — 6 МБ → `err_audio_too_large`; `song.wav` → `err_bad_audio`;
    - `a YouTube link sets the id and the start` — «https://youtu.be/abcdefghijk?t=42» → `track { source: 'youtube', id: 'abcdefghijk', start: 42 }`; «https://example.com» → `melodyBadLink`, `onChange` не викликано;
    - `the start field moves the chunks` — «З якої секунди» 30 → `start 30`;
    - `five preview buttons` — 5 кнопок «▶ 1 с»…«▶ 16 с»; натискання «▶ 4 с» викликає `play(4)` хука (замокано);
    - `spellings are edited as in text` — «Додати написання» додає рядок, `maxLength` 200.
  - `i18n.test.ts` — `ADDED_29E` в усіх 7 мовах; `ADDED_29E_PLURALS` — там, де ці форми є; сторінка довідки `question.melody` є в усіх `*.help.json`.
  - `round-summary.test.ts` — «2 мелодії» (точні форми — з uk-словника).
  - `format.test.ts` — `correctText` мелодії — «Щедрик»; `answerText({ type: 'melody', value: 'Щедрик', heard: 2 })` — «Щедрик · 2 с».
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web/src/live/useMelodyClip.test.tsx apps/web/src/editor apps/web/src/i18n.test.ts apps/web/src/help apps/web/src/round-summary.test.ts apps/web/src/format.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `useMelodyClip` — за зразком `QuestionAudio.tsx` (рукостискання `listening`, `addEventListener onStateChange/onError`, `YOUTUBE_ORIGIN`, `youtubeEmbedUrl({ id, start }, origin) + '&controls=0'`), але імперативно: без `useEffect` між дотиком і `play()`. Розмітка редактора — за зразком `AudioField.tsx` і `MemoryEditor.tsx`. Довідка: «Звук грає на телефоні кожного гравця», «Файл чесніший за YouTube: назву ролика видно в коді сторінки», «Назва з тегів MP3 прибирається; у OGG і M4A — ні», бали 100/80/60/40/25 %, «Неправильна відповідь — 0».
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 29e melody editor — a file or a YouTube link, a start second, a preview of every chunk, spellings; a chunk player that starts inside the tap; texts and help in seven languages"
```

---

### Задача 7. Веб: телефон — драбинка шматків, відповідь, команди, розкриття

**Files:**
- Create: `apps/web/src/screens/MelodyView.tsx`, `apps/web/src/screens/MelodyView.test.tsx`
- Modify:
  - `apps/web/src/screens/PlayerScreen.tsx` — гілка `me.melody !== undefined && question.melody !== undefined` (поряд із `MemoryPlay`, з ключем із Global Constraints) рендерить `MelodyPlay`; блок `.player-audio` (~1656) на `reveal` мелодії бере `clip = melodyRevealClip(question.melody.track)` (`listen 'again'`, `autoplay = autoAudio`, `ready` для розкриття — `phase === 'reveal'`), на `question`/`locked` для мелодії не рендериться;
  - `apps/web/src/screens/AnswerInput.tsx` — `case 'melody'` → `TypedInput` з типом відповіді `'melody'` (і в чернетці); проп `disabled?: boolean` для `TypedInput` (поле й кнопка неактивні);
  - `apps/web/src/styles.css`.

**Interfaces:**
- Consumes: `PlayerMelody`, `PublicMelody`, `MELODY_STEPS`, `MELODY_SHARES`, `melodySeconds`, `useMelodyClip`, `Send`.
- Produces:
```ts
export function MelodySteps(props: { heard: number; canOpen: boolean; playing: number | null; onPlay: (step: number) => void }): JSX.Element;
export function MelodyPlay(props: { info: PlayerMelody; question: PublicQuestion & { melody: PublicMelody }; questionIndex: number /* view.questionIndex */; paused: boolean; live: boolean; send: Send; onSubmit: (answer: SubmittedAnswer) => void; onDraft?: (answer: SubmittedAnswer | null) => void }): JSX.Element;
```

**Телефон:**
- Драбинка: 5 комірок в один ряд (на 320 px без прокрутки), у кожній «{seconds} с» і «{share} %». Відкрита (`step ≤ heard`) — кнопка `aria-label` `melodyReplay`; наступна (`heard + 1`, лише за `canOpen`) — головна, текст `melodyListen` (для 1) чи `melodyMore`; решта — `disabled`. Та, що грає зараз, — `aria-pressed` і анімація.
- Дотик до наступної: **у тому самому обробнику** `clip.play(MELODY_STEPS[step − 1])`, потім `send('player:melody', { questionIndex, step })`; поки ack немає, комірка вважається відкритою локально (`pendingStep`); відмова (`time_over`, `paused`, `already_answered`, `melody_step`, офлайн) — `clip.stop()`, `pendingStep` знімається, текст помилки — `errorText`. Дотик до відкритої — лише `clip.play(seconds)`.
- Рядок `melodyShareNow` за `max(heard, pendingStep)`; до першого шматка — `melodyListenFirst`.
- Поле відповіді — `AnswerInput` з `disabled = !info.canAnswer && pendingStep === null`; надсилання — звичайний `player:answer`.
- У командах: `info.openedBy !== null` — рядок `melodyOpenedBy` (`seconds = melodySeconds(heard)`); звук на телефоні товариша сам не вмикається.
- Після відповіді — `melodyAnswered` з `seconds` шматка, драбинка лише для переслуховування.
- `blocked`/`failed` — `melodyBlocked`/`melodyFailed` під драбинкою (`role="status"`).

- [ ] **Step 1: Write the failing tests** (`MelodyView.test.tsx`, `useMelodyClip` замокано):
  - `the first tap plays and sends the round-local number` — `info { heard: 0, canOpen: true, canAnswer: false }`, `questionIndex 0`: дотик «Слухати 1 с» → `play(1)` раніше за `send`, `send('player:melody', { questionIndex: 0, step: 1 })`;
  - `only the next chunk can be opened` — `heard 2`: комірки 1–2 — «Переслухати», 3 — «Ще: 4 с», 4–5 — `disabled`; дотик до комірки 1 → `play(1)` без `send`;
  - `a refused chunk stops the sound` — ack `time_over` → `stop()` викликано, комірка знову закрита, видно текст помилки;
  - `the answer waits for a chunk` — до першого шматка поле й кнопка «Відповісти» неактивні, видно «Спершу послухайте шматок»; `heard 1` → активні; надсилання дає `onSubmit({ type: 'melody', value: 'Щедрик' })`;
  - `the share follows the longest chunk` — `heard 3` → «Зараз: 60 % ціни»;
  - `a teammate chunk shows who opened it` — `openedBy 'Тарас'`, `heard 2` → «Тарас: відкрито 2 с», `play` не викликано;
  - `after the answer only replays` — запис є (`canOpen false`, `canAnswer false`) → «Відповідь прийнято на шматку 4 с», немає кнопки «Ще»;
  - `fits 320 px` — 5 комірок на ширині 320: жодна не ширша за `(320 − 2·12 − 4·6) / 5`, ряд не ширший за 320 (з CSS-змінних, як `fits 320 px` у `MemoryView.test.tsx`);
  - `another melody in the same slot starts afresh` — інший `melody.id` під тим самим номером скидає `pendingStep`;
  - `PlayerScreen.test.tsx`: `a melody reveal offers listening again` — на `reveal` є `.player-audio` з кнопкою «Прослухати ще раз» і `<audio src>` треку; на `question` для мелодії `.player-audio` немає.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web/src/screens/MelodyView.test.tsx apps/web/src/screens/PlayerScreen.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за зразком `MemoryPlay`/`useMemory.ts` (ack, офлайн, номер із `view.questionIndex`) і гілки `MemoryPlay` у `PlayerScreen.tsx`.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 29e melody phone — a ladder of five chunks started by a tap, replays of opened chunks, the share of the price, one answer after the first chunk, a teammate's chunk, listening again on reveal, 320 px"
```

---

### Задача 8. Веб: сцена, пульт, розкриття, живі відповіді, історія

**Files:**
- Modify:
  - `apps/web/src/screens/MelodyView.tsx`:
    - `MelodyBoards` — плитки «нік · 🎧 {seconds} с» (або `melodyStageNone`), ✓ у тих, хто відповів, рядок `melodyPlayersAnswered`; сторінки за `puzzleGrid`/`puzzlePageSize`/`usePage` з `PuzzleView.tsx`;
    - `MelodyResults` — `melodyRevealTitle` і таблиця «місце · нік · шматок · бали» (✓/✗) з тим самим зменшенням шрифту, що в `JigsawResults` (`jigsawTablePageSize`);
    - `MelodyStage` — плитки до розкриття, назва й таблиця на розкритті.
  - `apps/web/src/screens/StageScreen.tsx` — гілка поряд із `MemoryStage`; на `reveal` мелодії — `QuestionAudio` з `clip = melodyRevealClip(track)`, `questionKey = '…:melody-reveal'`, `ready = view.phase === 'reveal' && !busy && !view.paused`, `command = audioCommand`. До розкриття сцена звуку не рендерить.
  - `apps/web/src/screens/HostScreen.tsx` — рядки `MelodyBoards` (без `liveHides` для відповідей — пульт бачить тексти в `LiveAnswers`); `clip` панелі `host-audio` на `reveal` мелодії = `melodyRevealClip(track)` (кнопки «Ще раз / Стоп»; без сцени — грає сам, `ready = phase === 'reveal'`).
  - `apps/web/src/screens/LiveAnswers.tsx` — прогрес `melody`: «🎧 {seconds} с» біля рядка, текст відповіді й вердикт як у `text`.
  - `apps/web/src/pages/GameHistory.tsx` — рядок «Щедрик · 2 с» (`answerText`).
- Test: `apps/web/src/screens/MelodyView.test.tsx`, `StageScreen.test.tsx`, `HostScreen.test.tsx`, `LiveAnswers.test.tsx`, `apps/web/src/pages/GameHistory.test.tsx`

- [ ] **Step 1: Write the failing tests:**
  - `the stage shows chunks and no title before reveal` — 3 рядки: Оля «🎧 2 с ✓», Тарас «🎧 1 с», Петро «ще не слухав»; «Відповіли: 1 з 3»; у DOM сцени немає «Щедрик»; немає `.audio-card` і `<audio>`.
  - `the stage plays the track after time` — на `reveal` є `.audio-card` з `<audio src>` треку; `QuestionAudio` отримує `duration 30` і `start 5`; «Це була «Щедрик»»; таблиця в порядку `rows` з балами 1000, 800, 0.
  - `twenty-four players fit the stage` — 24 плитки вміщаються в 1600×900 (як тест мініатюр 29f), 12 рядків таблиці — теж.
  - `the host gets replay and stop on reveal` — `HostScreen` на `reveal` мелодії має «Ще раз» і «Стоп», натискання шле `host:audio`; на `question` панелі `host-audio` немає.
  - `live answers show the chunk and the answer` — рядок «Оля · «Щедрик» · 🎧 2 с · ✓».
  - `history shows the chunk` — «Щедрик · 2 с».
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web/src/screens apps/web/src/pages/GameHistory.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за зразком `MemoryBoards`/`MemoryResults`/`MemoryStage` і блоків `QuestionAudio` у `StageScreen.tsx` (~351) та `HostScreen.tsx` (~834).
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 29e melody stage and host — who answered and on which chunk without sound, the title, a points table and the track after time, host replay and stop"
```

---

### Задача 9. Наскрізні сценарії й кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`. Додати `it('part 29e: …')` після блоку `part 29f` і помічники:
  - `taggedMp3_29e(seconds)` — `ID3`-заголовок з кадром `TIT2` «Shchedryk» + `silentMp3(38 × seconds)` + ID3v1 `TAG` з «Shchedryk» (синтетичний звук, без реальної музики);
  - `melody29e(id, track, accepted, timeLimit)`;
  - `step29e(page, seconds)` — дотик до комірки драбинки за текстом/`aria-label`;
  - `phoneClip29e(page)` — `{ paused, currentTime }` з `.melody-play audio`.

**Сценарії** (таймери ≥ 25 с, трек 20 с, `start 2`):
1. `it('part 29e: melody after a classic round — a tagged mp3 and spellings in the editor, chunks start by a tap on the phone, points by the longest chunk, no title before reveal, the track on the stage, 320 px')`:
   - **Редактор.** Перший раунд класичний з одним `single` (30 с). Другий — класичний з `melody`:
     - нове запитання показує `problemMelodyTrack`; заливка `taggedMp3_29e(20)` через поле файлу; «З якої секунди» = 2; написання «Щедрик», «Shchedryk»; проблема зникає;
     - посилання «https://youtu.be/abcdefghijk?t=42» перемикає на YouTube зі `start 42`, «Файл» повертає залитий файл (заглушка YouTube в `open`, мережі немає);
     - «▶ 1 с» у редакторі грає й зупиняється (`paused` true за ≤ 2,5 с);
     - у бліц-раунді й «Головоломках» типу «Мелодія» в меню немає;
     - збережене запитання має `track.source 'file'`, `start 2`; `GET` залитого файлу не містить «Shchedryk»;
     - кадр `melody29e-editor`.
   - **Гра на 3 телефонах (Оля — 320 px).** Класичне запитання, потім `melody`:
     - Петро до першого шматка: поле відповіді неактивне, видно «Спершу послухайте шматок»;
     - Оля торкається «Слухати 1 с»: `paused` стає false, далі за ≤ 3 с true, `currentTime` у межах `[2.8, 3.6]`; сцена показує «Оля · 🎧 1 с»; Оля відповідає «щедрік» (описка);
     - Тарас відкриває 1, 2, 4 с (кожен дотик — після кінця попереднього), переслуховує 1 с, відповідає «Shchedryk»;
     - Петро відкриває 1 с і відповідає «Колядка»;
     - до розкриття в кадрах сокета телефонів і сцени (`socketFrames`) і в DOM немає «Щедрик» / «Shchedryk»;
     - кадри `melody29e-phone-320`, `melody29e-phone-steps`, `melody29e-stage`, `melody29e-host`.
   - **Розкриття:**
     - бали з історії: Оля 1000, Тарас 600, Петро 0;
     - сцена: «Це була «Щедрик»», таблиця, `.audio-card` сцени з `<audio src>` треку; кнопка пульта «Стоп» зупиняє звук сцени (`data-state 'stopped'`);
     - телефон має «Прослухати ще раз»;
     - кадр `melody29e-reveal-stage`.
2. `it('part 29e: melody in teams — anyone opens a shared chunk, a teammate sees it without sound, the first answer counts, a restart keeps the chunks, 320 px')`:
   - 2 команди по 2 учасники, режим відповідача `captain`, телефон Б — 320 px;
   - А (капітан) відкриває 1 с → на телефоні Б драбинка має відкриту комірку 1, рядок «А: відкрито 1 с», звук Б на паузі;
   - Б (не капітан) відкриває 2 с — звук грає в Б; на телефоні А «Б: відкрито 2 с»;
   - `restart()` посеред запитання → драбинка на обох телефонах із тими самими 2 шматками; наступний шматок приймається;
   - Б відповідає правильно → команда має 800 (ціна 1000); поле А після цього неактивне, «Відповідь прийнято на шматку 2 с»;
   - `expectPhoneFit` для телефона Б;
   - кадри `melody29e-teams-phone`, `melody29e-teams-stage`.
3. `it('part 29e: melody with 24 players — the stage tiles fit 1600×900')` — 24 сокет-гравці відкривають випадкову кількість шматків, половина відповідає; `expectNoSideScroll`, кадр `melody29e-24-stage`.

- [ ] **Step 1: Write the scenarios** за зразком `part 29f` і `part 16b` (звук телефона: `.player-audio audio`, `paused`, `currentTime`) та `part 10b` (заливка аудіо в редакторі).
- [ ] **Step 2: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 29e"`. Expected: PASS; кадри в `artifacts/shots`.
- [ ] **Step 3: Переглянути кадри.** Перевірити, що:
  - драбинка на 320 px в один ряд без горизонтального скролу, «16 с · 25 %» не переноситься посеред слова;
  - поле відповіді не перекрите клавіатурною зоною й смугою реакцій;
  - на сцені до розкриття немає назви, плитки читаються при 24 гравцях;
  - на розкритті є назва, таблиця й картка звуку.
- [ ] **Step 4: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 29e melody — after a classic round, a tagged mp3 in the editor, chunks by tap at 320 px, points by the longest chunk, no title before reveal, the track on the stage, shared chunks in teams, a restart, 24 tiles"
```
