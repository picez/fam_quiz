# План 13b: збережені ігри — зберегти й догра́ти пізніше (беклог #8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** уся специфікація `docs/superpowers/specs/2026-11-01-saved-games-design.md`.
- Ведучий (у грі без ведучого — автор) зберігає гру кнопкою «Зберегти й продовжити пізніше».
- Гра, що обірвалась сама, зберігається автоматично.
- В «Історії ігор» така гра має позначку «Не завершена» й кнопки «Продовжити» та «Видалити».
- «Продовжити» відкриває кімнату з новим кодом. Гравці вибирають себе зі списку збережених учасників, з тими самими балами, командами й ролями. Догра́на гра — **одна** гра в історії, статистиці й досягненнях.

**Spec:** `docs/superpowers/specs/2026-11-01-saved-games-design.md`

**Передумова:** план 13a (реакції) злитий у `main` першим. Він займає міграцію `0019_favorite_stickers` і поля `reactRate` / `reactionSeq` у `Room`. Наша міграція — **`0020_saved_games`**. Нові поля `Room` дописуються в ті самі два літерали (`open`, `restore`), поруч із полями 13a.

**Стан гри не змінюється: `GAME_STATE_VERSION` лишається 21.**
- У `GameState` немає жодного нового ключа чи значення:
  - пізній гравець — звичайний `PlayerState` / `TeamMember`;
  - «продовження» — це пауза, яку вже знає рушій;
  - `hold: 'author'` уже існує.
- Усе нове живе на рівні кімнати (`Room.checkpoint`, `Room.continued`). У `live_room` воно йде **необов'язковими** полями конверта `SavedRoom`, а `SAVED_ROOM_VERSION` лишається 1.
  - Старий сервер (відкат) такі поля ігнорує: кімната встає без слотів, але гра живе.
- `restore.test.ts` не змінюється. Деплой живих ігор не обриває.
- Поведінка змінюється (див. «Навмисні зміни»): 10 хв без ведучого тепер **зберігають** гру, а не завершують. Автопілот зберігається лише тоді, коли кімната порожня (нікого на зв'язку) 30 хв (`AUTOPILOT_EMPTY_MS`). Перед пушем контролер нічого в власника не питає, бо версія та сама. Правило «Push hold while playing» діє як завжди.

**Архітектура:**
- **Контрольна точка.** `commit` у менеджері після кожної зміни дивиться на `restPoint(state)` (рушій). Якщо гра стоїть на межі між запитаннями, `room.checkpoint = { state, at }`. Збереження бере саме її. Усе з недограного запитання відпадає разом зі станом.
- **Збереження.** `manager.save` (вручну) чи `autosave` (таймери) закриває кімнату подією `{ type: 'closed'; saved: SavedGameData }`.
  - Сокет шле `closed('saved')`.
  - `RoomStore` видаляє рядок `live_room`, як для будь-якої закритої кімнати.
  - Рекордер у своїй черзі пише `saveSavedGame`:
    - рядки гри за контрольною точкою, `game.status = 'saved'`;
    - рядки після точки видаляє;
    - `saved_game` (upsert).
- **Обрив без кімнати в пам'яті** (`RoomStore`):
  - чистка доби (`purge`) і зламаний запис (`adopt` → broken) йдуть через `abandonRooms`: читабельна контрольна точка → точне збереження, інакше `saved` без знімка або `aborted`;
  - старт сервера — через `parkInterrupted` замість `markInterrupted`.
- **Одна гра.**
  - Точне продовження відкриває кімнату з **тим самим** `room.id` (= `game.id`) і тими самими id учасників. Рекордер пише далі той самий рядок `game`, а статус `saved` зберігає, доки гра не `finished`.
  - Фініш видаляє `saved_game`.
- **Шлях 12r** (знімка немає або `stateVersion` не читається):
  - нова кімната-лобі з новими id;
  - збережені учасники стоять у ній слотами поза зв'язком;
  - `room.continued.carry` — стартовий раунд і бали, що застосовуються на «Почати гру».
  - Старий запис видаляється в тій самій транзакції, де нова гра вперше записує закрите запитання (або сама зберігається). Тож і тут лишається одна гра.
- **Слоти.** Слот — людина збереженої гри (соло-гравець або людина команди). «Зайнятий» — має токен у `room.playerTokens`. Прив'язка до акаунта — `room.playerUsers`.
  - `GET …/slots` — що пропонувати формі;
  - `POST …/claim` — зайняти;
  - `host:release` — звільнити;
  - `join` з акаунтом сам займає прив'язаний слот.
- **Веб.**
  - «Історія ігор» (`/history`): розділ «Не завершені».
  - Форма входу (`Play`): «Хто ти?».
  - Пульт: кнопка збереження й панель «Місця збереженої гри».
  - Меню автора: ті самі дві речі.
  - Пульт, сцена й телефони після збереження показують «Гру збережено — продовжимо пізніше.».

**Технології:** TypeScript, zod, vitest, Fastify + Socket.IO, Drizzle + drizzle-kit + PGlite, React 19 + Vite, Testing Library (jsdom), Playwright. Нових залежностей немає.

## Рішення (там, де специфікація лишила місце будівникові)

- **Схема:** окрема таблиця `saved_game` (`game_id` PK → `game.id` `on delete cascade`, `data jsonb` null, `state_version integer` null, `saved_at timestamptz not null`), плюс нове значення `game.status = 'saved'` (`text`, без зміни колонки).
  - `data = null` — знімка немає (старт сервера після краху, сміттєвий запис). Тоді продовження йде шляхом 12r із рядків `participant`.
- **Межа між запитаннями (`restPoint`):** фаза з `REST_PHASES = ['intro', 'reveal', 'board', 'leaderboard', 'round_end']`, і при цьому:
  - `state.duel === null`;
  - `!trialOpen(state)`;
  - немає апеляції з `outcome === null`.
  - `question`, `locked`, `wager`, `duel`, `guide`, `lobby`, `finished` — не межа. Тож ставки фіналу, дуель, випробування «Вибування» й відкрите голосування апеляції належать «недограному запитанню» і відкидаються.
- **Що «дійшла до першого запитання»:**
  - автозбереження — лише якщо `state.plays.length > 0` і є контрольна точка;
  - ручне — якщо є контрольна точка (це й заставка першого раунду `intro`);
  - лобі не зберігається ніколи.
  - Без ведучого з акаунтом (`hostUserId === null`) зберегти не можна. Автотаймери тоді поводяться як досі (`end`).
- **Таймери й пауза.** `continueFrom(checkpoint, at)` = `suspend(checkpoint, at)` (пауза в мить контрольної точки, усі поза зв'язком) + `awaiting: []` (відсутніх не чекають) + для автопілота `hold: 'author'`, `at: null`.
  - Кімната продовження відкривається на **паузі збору**. Ведучий натискає звичайне «Продовжити» (`host:resume`), автор — «Продовжити» з меню (`authorResume`).
  - `resume` зсуває всі дедлайни на тривалість паузи, тож кожен таймер стартує з того місця, де стояв у мить контрольної точки. Запитання ж грається з початку, тож його таймер повний.
  - Пауза оригінальної гри окремо не переноситься: одна пауза збору замість неї.
- **Новенькі.** У лобі шляху 12r — звичайний `addPlayer`.
  - У точному продовженні — `addLatePlayer`, лише поки `restPoint(state)`. Під час запитання — `wrong_phase` (форма каже «гра вже почалась»).
  - Командна гра: новенький іде в команду з найменшою кількістю людей (нічия — перша в `teams.list`), без ролі.
- **Слоти й акаунти** (правила `claim` по черзі):
  1. Кімнати немає → `game_not_found`; на зупинці → `restarting`.
  2. Кімната не продовження → `not_found`.
  3. `slotId` не серед `slotsOf(state)` → `not_found`.
  4. Слот прив'язаний до іншого акаунта (або в гостя) → `not_allowed`.
  5. Гостьовий слот уже має токен → `slot_taken`. Свій прив'язаний слот можна займати й удруге (другий пристрій тієї самої людини).
  6. Гість-акаунт займає гостьовий слот → `playerUsers.set` + `continued.bound.add`. Акаунт, що вже має слот у цій кімнаті, другий гостьовий не займе → `not_allowed`.
  - `join(code, nickname, userId)` у кімнаті продовження: якщо є слот, прив'язаний до `userId`, — це `claim` цього слота (нік з форми ігнорується).
  - `release`: токени слота геть, з'єднання геть, `kicked` з `reason: 'released'`. Прив'язку знімає лише та, що з'явилась у цій кімнаті (`continued.bound`). Бали й рядок у таблиці лишаються.
- **«Мої ігри ведучого»** = сторінка `/history` («Історія ігор», вкладка «Проведені»). Збережені ігри йдуть першими, без ліміту `LIMIT`, найновіше збереження першим. Далі завершені, як досі.
- **Режим продовження (`SavedMode`):**
  - `'blocked'` — знімок вікторини не читається (`snapshotOf === null`), або шлях 12r для автопілота без рядка автора (`participant.user_id = game.host_id`);
  - `'exact'` — `isSavedGameData(data)` і `READABLE_STATE_VERSIONS.includes(state_version)`;
  - інакше `'restart'`.
- **«Відкрите продовження»** = у пам'яті є кімната з `id === gameId` чи `continued.replaces === gameId`, або такий рядок у `live_room` (`room_id` чи `data->'continued'->>'replaces'`). Окремого прапорця в базі немає, тож він не може «зависнути» після краху.
- **Рішення контролера (автопілот), замість буквального «автор не на зв'язку 10 хв»:** поведінку 11g не замінюємо.
  - Гра без ведучого йде без автора так само, як сьогодні. `watchAuthor` не змінюється: пауза автора знімається сама через `HOST_ABSENCE_MS`.
  - Автопілот зберігається лише тоді, коли кімната фактично покинута: **нікого на зв'язку (і автора теж) `AUTOPILOT_EMPTY_MS` (30 хв) поспіль** → `autosave`.
  - Це робить наявний `watchEmpty`: таймер той самий (`AUTOPILOT_EMPTY_MS`), змінюється лише дія на ньому — `autosave` замість `end`. Якщо гру зберегти не можна (`savable` false), таймер так само кличе `end`.
  - Гра з ведучим — правило специфікації: ведучий не на зв'язку 10 хв → збереження й закриття.
- **Рекордер і акаунт слота:** `participant.user_id` тепер оновлюється на кожному записі (`set userId: excluded.user_id`). Тоді гостьовий слот, який зайняв акаунт, потрапляє в його профіль.
- **Нові коди помилок:** `slot_taken`, `continue_open`, `cannot_continue`. **Причини закриття:** `CloseReason` + `'saved'` | `'released'`.

## Глобальні обмеження

- **Анти-ціль:** продовжена гра не рахується двічі. Рядок `game` один (точний шлях) або старий видаляється (шлях 12r). Статистика й досягнення рахують лише `finished` (як і досі).
- **Анти-ціль:** гравець не бачить 0 замість своїх балів. Слот — це той самий `PlayerState` з балами.
- **Анти-ціль:** чужий слот не зайняти. Прив'язаний до акаунта — лише цей акаунт; гостьовий уже зайнятий — `slot_taken`.
- **Анти-ціль:** збереження не ламається після деплою. Нечитабельна версія → `'restart'`, нечитабельна вікторина → `'blocked'` («Не можна продовжити»), без падіння.
- Збереження не перечитує живу вікторину: точний шлях бере `state.quiz` знімка, шлях 12r — `game.quiz_snapshot` (`snapshotOf`).
- Без терміну давності: `saved_game` не чиститься ні `purge`, ні таймером.
- Апеляції, чернетки, нахили, реакції й інше з пам'яті кімнати не зберігаються.
- `GAME_STATE_VERSION` 21 без змін; `restore.test.ts` без змін.
- Жодного контенту про росію (правило власника): e2e-вікторина — про Україну.
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`, тон «ти», коротко. Меню на ігрові екрани не додаємо (наявне меню автора `AuthorMenu` — не навігаційне меню).
- Телефон 375 px без горизонтальної прокрутки; сцена 1280 × 720 без прокрутки.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і тести:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=2 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- e2e: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 13b"`, **лише на передньому плані**. Кадри — `apps/server/e2e/artifacts/shots/p13b-*`.
- Кожен коміт закінчується рядками:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1
  ```
- Після останньої задачі й фінальної рецензії: злити в `main` і запушити (правило «Push after work»).

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/saved.ts` (новий), `history.ts`, `events.ts`, `game.ts`, `views.ts`, `index.ts`; `packages/engine/src/saved.ts` (новий), `saved.test.ts` (новий), `index.ts` | типи; межа, продовження, пізній гравець, слоти | 1 |
| `apps/server/drizzle/0020_saved_games.sql` + `meta`, `src/db/schema.ts`, `src/rooms/continuation.ts` (новий), `src/recorder.ts`, `src/recorder.saved.test.ts` (новий) | таблиця, запис збереження, статус `saved` | 2 |
| `apps/server/src/rooms/manager.ts`, `manager.saved.test.ts` (новий), `socket.ts`, `socket.test.ts`, `recorder.ts`, `recorder.saved.test.ts` | контрольна точка, ручне й автозбереження, закриття `saved` | 3 |
| `apps/server/src/saved-games.ts` (новий), `src/rooms/store.ts`, `src/rooms/store.saved.test.ts` (новий) | чистка, зламаний запис, старт сервера | 4 |
| `apps/server/src/rooms/manager.ts`, `manager.continue.test.ts` (новий), `continuation.ts`, `socket.ts`, `socket.test.ts` | продовження, слоти, новенькі, звільнення, зрізи | 5 |
| `apps/server/src/saved-games.ts`, `saved-games.test.ts` (новий), `account-routes.ts`, `app.ts`, `history.ts`, `history.resume.test.ts`, `profiles.test.ts` | маршрути, список, видалення, `resumeOptions` | 6 |
| `apps/web/src/api.ts`, `pages/History.tsx` (+ тест), `pages/Play.tsx` (+ тест), `pages/Host.tsx`, `pages/Stage.tsx`, `live/useGame.ts`, `i18n.ts`, `styles.css` | історія, «Хто ти?», екрани «Гру збережено» | 7 |
| `apps/web/src/screens/SlotsPanel.tsx` (новий), `SlotsPanel.test.tsx` (новий), `HostScreen.tsx` (+ тест), `AuthorMenu.tsx` (+ тест), `AuthorLobby.tsx` (+ тест), `i18n.ts`, `styles.css` | кнопка збереження, місця, нотатка 12r | 8 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 13b | 9 |

## Порядок збирання

- 1 → 2 → 3 → 4 → 5 → 6 (shared і сервер по черзі: `manager.ts`, `recorder.ts`, `socket.ts` спільні), далі 7 → 8 (веб: спільні `i18n.ts`, `styles.css`), і 9 останньою.
- **Навмисні зміни наявних очікувань** (лише ці; інший червоний старий тест рецензент розбирає як регресію):
  - `manager.test.ts` «ends the game after ten minutes without the host»: якщо кімната має `hostUserId` і дійшла до запитання, тепер очікується закриття з `saved`, а не `finished`. Для кімнат без акаунта поведінка та сама.
  - Тести 11g про автора (`manager.autopilot.test.ts`: «an author pause is lifted when the author stays away for 10 minutes…», «an author who comes back within 10 minutes keeps the pause», «nobody online pauses the game…» до першого повернення) **не змінюються** і мають лишитися зеленими як є.
  - `manager.restore.test.ts` (`pending()` = `[AUTOPILOT_EMPTY_MS]`) і всі очікування таймерів **не змінюються**.
  - Змінюється лише те, що стається в кінці 30 хв, у двох тестах `manager.autopilot.test.ts`: «30 minutes with nobody online end the game; a return before that clears the timer» і «an author pause with nobody online still ends in 30 minutes». Замість `phase === 'finished'` вони очікують закриття кімнати з `saved` (`manager.get(code) === undefined`, подія `closed` з `saved`), якщо гра дійшла до запитання; інакше `finished`, як досі. Таймери, моменти й частина «повернення знімає таймер» ті самі.
  - Тести, що очікували `aborted` від `RoomStore.boot()` для гри із закритими запитаннями, тепер очікують `saved`. `markInterrupted` / `markAborted` як функції не змінюються, і їхні тести в `recorder.test.ts` лишаються.

## На що дивитися рецензентові (Review Focus)

1. **Збереження посеред запитання.** Олена відповіла, хтось купив дебаф, ведучий дав +50, відкрито апеляцію, і тут натиснуто «Зберегти». У базі немає жодного рядка `answer` цього запитання, коригування й апеляції після контрольної точки видалено, а продовження показує запитання без відповіді Олени й без дебафу. Тест — задачі 2, 3.
2. **Деплой між збереженням і продовженням.**
   - `state_version = 999` → `'restart'`, і «Продовжити» відкриває лобі з «Раунд N» і балами.
   - Зламаний `quiz_snapshot` → `'blocked'`, «Продовжити» дає 409 `cannot_continue`, а список не падає.
   - Тест — задача 6.
3. **Два «Продовжити» поспіль** (дві вкладки) → друге 409 `continue_open`. «Видалити» відкритої — 409. Після закриття продовження — знову можна. Тест — задачі 5, 6.
4. **Чужий слот прямим запитом.**
   - Гість шле `POST …/claim` зі слотом акаунта → 403 `not_allowed`.
   - Друга людина — на зайнятий гостьовий → 409 `slot_taken`.
   - Слот акаунта не з'являється в `slots` для інших.
   - Тест — задачі 5, 6.
5. **Продовження обірвалось знову.**
   - Ведучий пішов на 10 хв: на паузі збору чи після кількох запитань.
   - Той самий `saved_game` (upsert), той самий `game.id`, і після фінішу в історії одна гра.
   - Продовження шляхом 12r, закрите з лобі (TTL), лишає старий запис як був.
   - Тест — задачі 2, 5.

---

### Задача 1. Shared-типи й рушій: межа між запитаннями, продовження, пізній гравець, слоти

**Files:**
- Create: `packages/shared/src/saved.ts`, `packages/engine/src/saved.ts`, `packages/engine/src/saved.test.ts`
- Modify: `packages/shared/src/history.ts`, `packages/shared/src/events.ts`, `packages/shared/src/game.ts`, `packages/shared/src/views.ts`, `packages/shared/src/index.ts`, `packages/engine/src/index.ts`

**Interfaces:**
- Produces (`packages/shared/src/saved.ts`):
  ```ts
  export type SavedMode = 'exact' | 'restart' | 'blocked';
  export interface SavedInfo { mode: SavedMode; open: boolean; savedAt: string }
  /** Слот у панелі ведучого/автора. */
  export interface SavedSlot { id: string; nickname: string; team: string | null; taken: boolean; account: boolean }
  /** Слот у формі входу. */
  export interface SlotOption { id: string; nickname: string; team: string | null }
  /** GET …/slots: вільні гостьові слоти й слот акаунта того, хто питає (null — немає чи гість). */
  export interface SlotsResponse { slots: SlotOption[]; mine: SlotOption | null }
  /** Кімната продовження в зрізі пульта й автора. carryRound — 0-базовий стартовий раунд шляху 12r; null — точне продовження. */
  export interface ContinuedView { slots: SavedSlot[]; carryRound: number | null }
  export type ContinueResponse =
    | { gameId: string; code: string; hostToken: string; stageToken: string }
    | { gameId: string; code: string; stageToken: string; token: string; playerId: string };
  export const claimSchema: z.ZodType<{ slotId: string }>; // z.object({ slotId: z.string().uuid() }).strict()
  ```
- `history.ts`: `GameStatus = 'running' | 'finished' | 'aborted' | 'saved'`; `GameSummary.saved?: SavedInfo`.
- `events.ts`:
  - `CloseReason = 'kicked' | 'expired' | 'saved' | 'released'`;
  - `ClientToServerEvents`: `'host:save': (ack: Ack) => void`, `'host:release': (payload: z.infer<typeof kickSchema>, ack: Ack) => void`.
- `game.ts`: `ErrorCode` + `'slot_taken' | 'continue_open' | 'cannot_continue'`.
- `views.ts`: `HostView.continued?: ContinuedView`; `AuthorView.continued?: ContinuedView` (заповнює менеджер у задачі 5; рушій ключа не ставить).
- Produces (`packages/engine/src/saved.ts`):
  ```ts
  export const REST_PHASES: readonly Phase[]; // ['intro', 'reveal', 'board', 'leaderboard', 'round_end']
  /** Межа між запитаннями: REST_PHASES, duel === null, !trialOpen, жодної апеляції з outcome === null. */
  export function restPoint(state: GameState): boolean;
  /** Стан кімнати продовження: suspend(checkpoint, at), awaiting [], автопілот — paused з hold 'author' і at null. */
  export function continueFrom(checkpoint: GameState, at: number): GameState;
  /** Новенький у точному продовженні: лише restPoint (інакше wrong_phase); перевірки ніка й місткості як addPlayer / addMember; команда — найменша. */
  export function addLatePlayer(state: GameState, player: { id: string; nickname: string }): Result;
  /** Люди гри: соло — players; командна гра — members з teamId (team — назва команди); у порядку стану. */
  export function slotsOf(state: GameState): { id: string; nickname: string; team: string | null }[];
  ```

- [ ] **Step 1: Write the failing tests** — `packages/engine/src/saved.test.ts` (помічники `@quiz/engine/testing`: `makeQuiz`, `makeRoundsQuiz`, `classicRound`, `single`; командна гра — як у `game.teams.test.ts`):
  - `restPoint`:
    - стан після `start` (`intro`), `reveal`, `leaderboard`, `round_end` і `board` → `true`;
    - `lobby`, `question`, `locked`, `wager`, `guide`, `finished` → `false`;
    - `reveal` з відкритою апеляцією → `false`; `reveal` з оголошеною дуеллю → `false`; `leaderboard` з відкритим випробуванням «Вибування» → `false`.
  - `continueFrom(cp, T)` для `cp` у `leaderboard` з двома гравцями на зв'язку:
    - `paused === true`, усі `connected === false`, `awaiting` порожній;
    - `phase`, `questionIndex`, `plays.length` і бали ті самі, що в `cp`;
    - `resume(result, T + 60_000)` → `ok`, `paused === false`.
  - Автопілот: `continueFrom` → `autopilot.hold === 'author'` і `autopilot.at === null`; `authorResume(result, T + 1000)` → `ok`, `hold` немає.
  - `addLatePlayer`:
    - на `leaderboard` соло → новий гравець з `score: 0`, решта балів ті самі;
    - «  оля » при наявній «Оля» поза зв'язком → `nickname_taken`;
    - на `question` → `wrong_phase`;
    - понад `LIMITS.maxPlayers` → `room_full`;
    - командна гра з командами на 2 і 1 людину → новенький у другій; рівні команди → у першій з `teams.list`; без капітанства.
  - `slotsOf`: соло → `[{ id, nickname, team: null }]` у порядку `players`; командна гра → лише люди з командою, `team` = назва команди.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/saved.test.ts` → FAIL (модуля немає).
- [ ] **Step 3: Implement** `packages/shared/src/saved.ts` і правки shared, далі `packages/engine/src/saved.ts` (`suspend` з `restore.ts`, `trialOpen`, `teamsOn`, `normalizeText`, `LIMITS`) і експорти з обох `index.ts`. Тексти помилок `err_slot_taken`, `err_continue_open`, `err_cannot_continue` у `apps/web/src/i18n.ts` (див. задачу 7) додати вже тут, якщо є тест «кожен ErrorCode має текст».
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages apps/web/src/i18n.ts
  git commit -m "feat(engine): saved games groundwork — a rest point between questions (intro, reveal, board, leaderboard, round end with no duel, trial or open appeal), a continuation state paused at the checkpoint with nobody awaited, a late newcomer between questions, and the people of a game as slots

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 2. База й рекордер: таблиця `saved_game`, запис збереження, статус `saved`

**Files:**
- Create: `apps/server/drizzle/0020_saved_games.sql` + `meta/0020_snapshot.json`, `_journal.json` (з `apps/server`: `pnpm exec drizzle-kit generate --name saved_games`), `apps/server/src/rooms/continuation.ts`, `apps/server/src/recorder.saved.test.ts`
- Modify: `apps/server/src/db/schema.ts`, `apps/server/src/recorder.ts`

**Interfaces:**
- Consumes: `GAME_STATE_VERSION`, `READABLE_STATE_VERSIONS` (`@quiz/engine`).
- SQL: коментар `-- Збережені ігри (беклог 8): контрольна точка гри; data null — знімка немає, продовження шляхом 12r.` і `CREATE TABLE "saved_game" (…)` з FK `ON DELETE cascade`.
- `schema.ts`:
  ```ts
  export const savedGame = pgTable('saved_game', {
    gameId: uuid('game_id').primaryKey().references(() => game.id, { onDelete: 'cascade' }),
    data: jsonb('data').$type<unknown>(),
    stateVersion: integer('state_version'),
    savedAt: at('saved_at').notNull(),
  });
  ```
- Produces (`apps/server/src/rooms/continuation.ts`):
  ```ts
  export const SAVED_GAME_VERSION = 1;
  /** Що лежить у saved_game.data. */
  export interface SavedGameData {
    v: typeof SAVED_GAME_VERSION;
    stateVersion: number;
    /** Контрольна точка: стан на межі між запитаннями (restPoint). */
    state: GameState;
    /** Мить контрольної точки за годинником менеджера. */
    at: number;
    /** Лише люди контрольної точки (slotsOf і гравці рушія). */
    playerUsers: [string, string][];
    quizId: string | null;
  }
  /** v === 1, stateVersion — число, state — об'єкт із масивом players, at — число, playerUsers — масив. Версію стану НЕ перевіряє. */
  export function isSavedGameData(raw: unknown): raw is SavedGameData;
  /** isSavedGameData і READABLE_STATE_VERSIONS.includes(stateVersion). */
  export function exactSaved(raw: unknown): raw is SavedGameData;
  ```
- Produces (`apps/server/src/recorder.ts`):
  ```ts
  export interface SavedWrite {
    id: string; code: string; hostId: string; quizId: string | null;
    playerUsers: Map<string, string>;
    saved: SavedGameData;
    /** Шлях 12r: старий збережений запис, який ця гра замінює; null — немає. */
    replaces: string | null;
  }
  /** Одна транзакція: рядки гри за saved.state (fromQuestion 0, дебафи — порожня мапа), status 'saved', finishedAt null; trimToCheckpoint; upsert saved_game (data, stateVersion, savedAt now); replaces → видалити той запис, якщо він 'saved'. */
  export async function saveSavedGame(db: Db, write: SavedWrite): Promise<void>;
  /** Видаляє рядки після контрольної точки: answer з question_index ≥ closedQuestions(state), score_adjustment з seq > state.adjustmentSeq, appeal з seq > (state.appeals?.length ?? 0). */
  export async function trimToCheckpoint(db: Db | Tx, gameId: string, state: GameState): Promise<void>;
  ```
- Зміни в наявному `save` рекордера:
  - `onConflictDoUpdate` для `game`: `status: finished ? 'finished' : sql\`case when ${game.status} = 'saved' then 'saved' else 'running' end\``. Тоді гра, яку продовжують, лишається «Не завершена», доки не фінішує.
  - Фініш (`finished`) видаляє рядок `saved_game` цієї гри в тій самій транзакції.
  - `participant` `onConflictDoUpdate`: до `set` додається `userId: sql\`excluded.user_id\`` (і для рядків команд, і для людей).
  - `Snapshot` отримує `replaces: string | null`. Якщо він не null і `closed >= 1`, у транзакції виконується `delete from game where id = replaces and status = 'saved'`. Сам `record` поки передає `null`: значення приходить із `room.continued` у задачі 5.

- [ ] **Step 1: Write the failing tests** — `recorder.saved.test.ts` (`createTestDb`, `RoomManager` + `FakeScheduler`, `attachRecorder`, `recorder.idle()`; гра ведучого `'u1'` з користувачем у базі, як у `recorder.test.ts`):
  - **`saveSavedGame` з контрольною точкою на `leaderboard` після запитання 1, коли в базі вже лежать рядки запитання 2** (записані з `locked`):
    - `game.status === 'saved'`, `questions_played === 1`, `plays.length === 1`;
    - жодного рядка `answer` з `question_index = 1`;
    - коригування з `seq > state.adjustmentSeq` видалено;
    - `saved_game.state_version === GAME_STATE_VERSION`, а `data.state.questionIndex === 0`.
  - **Повторний `saveSavedGame` того самого id:** один рядок `saved_game` (upsert), `saved_at` новіший.
  - **Гра зі статусом `saved`, кімната пише далі:** `record` після зміни стану лишає `status === 'saved'`. Фініш дає `status === 'finished'`, рядка `saved_game` немає, а `awardGame` спрацював один раз.
  - **`userId`:** `room.playerUsers.set(guestId, 'u2')` + будь-яка зміна стану → `participant.user_id === 'u2'`.
  - **`replaces`:**
    - `saveSavedGame({ …, replaces: oldId })` видаляє гру `oldId` (`saved`) разом з її `participant` (каскад);
    - якщо `oldId` має статус `finished`, вона лишається.
  - **`exactSaved`:**
    - `{ …, stateVersion: GAME_STATE_VERSION }` → `true`; `stateVersion: 999` → `false`, а `isSavedGameData` → `true`;
    - `null`, `{}`, `{ v: 2 }` → обидві `false`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/recorder.saved.test.ts` → FAIL.
- [ ] **Step 3: Implement**: згенерувати міграцію, дописати коментар у SQL, `schema.ts`, `continuation.ts`, зміни рекордера.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/server` → PASS (зокрема `recorder.test.ts` без змін очікувань).
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server
  git commit -m "feat(server): saved games in the database — migration 0020 adds saved_game, the recorder writes a checkpoint as status «saved» and drops the rows of the unfinished question, keeps «saved» while the game goes on, removes it at the finish, and updates the account of a participant

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 3. Менеджер: контрольна точка, «Зберегти й продовжити пізніше», автозбереження, закриття `saved`

**Files:**
- Create: `apps/server/src/rooms/manager.saved.test.ts`
- Modify: `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`, `apps/server/src/socket.test.ts`, `apps/server/src/recorder.ts`, `apps/server/src/recorder.saved.test.ts`, тести з «Навмисних змін»

**Interfaces:**
- Consumes: `restPoint`, `slotsOf` (задача 1); `SavedGameData`, `saveSavedGame` (задача 2).
- `manager.ts`:
  - `Room` отримує `checkpoint: { state: GameState; at: number } | null` (обидва літерали: `null`; `restore` — з `saved.checkpoint ?? null`).
  - `SavedRoom` отримує необов'язкове `checkpoint?: { state: GameState; at: number }`. `snapshot` пише його, якщо не null. `isSavedRoom` не змінюється, бо поле необов'язкове. `restore` бере його лише тоді, коли там об'єкт зі `state.players`-масивом і числом `at`.
  - `commit`: після `room.state = planAutopilot(…)` — `if (restPoint(room.state)) room.checkpoint = { state: room.state, at }`.
  - `RoomEvent`: `| { type: 'closed'; saved?: SavedGameData }` (замість `{ type: 'closed' }`).
  - `HostAction` + `{ type: 'save' }`; `AuthorAction` + `'save'`; `AUTHOR_ACTIONS` + `'save'`.
  - Методи:
    ```ts
    /** Ручне збереження (host 'save', author 'save'): hostUserId null → not_allowed; lobby/finished чи checkpoint null → wrong_phase; інакше закрити з saved. */
    save(room: Room): AckResult;
    /** Таймери: savable(room, true) → закрити з saved; інакше end(state) як досі. */
    private autosave(room: Room): void;
    /** hostUserId != null, фаза не lobby/finished, checkpoint != null, і для auto — state.plays.length > 0. */
    private savable(room: Room, auto: boolean): boolean;
    /** SavedGameData з room.checkpoint; playerUsers — лише люди й гравці контрольної точки. */
    private savedData(room: Room): SavedGameData;
    /** clearTimers, live.delete, emit closed з saved. */
    private closeSaved(room: Room): void;
    ```
  - `hostLeft`: таймер `HOST_ABSENCE_MS` кличе `autosave(room)` замість `end`.
  - `watchAuthor` **не змінюється** (11g: пауза автора знімається сама через `HOST_ABSENCE_MS`).
  - `watchEmpty`: таймер той самий (`AUTOPILOT_EMPTY_MS`), на ньому `autosave` замість `end`. Хтось повернувся → таймер геть, як досі.
- `socket.ts`:
  - `'save'` у `SIMPLE_HOST_ACTIONS`;
  - на `closed` кожному сокету кімнати — `socket.emit('closed', event.saved !== undefined ? 'saved' : 'expired')`, як і досі через `disconnect(true)`.
- `recorder.ts` (`attachRecorder`): на `closed` з `saved` — job у тій самій черзі `queues` з тими самими повторами, що в `record`. Job: `saveSavedGame(db, { id: room.id, code: room.code, hostId: room.hostUserId!, quizId: room.quizId, playerUsers: new Map(event.saved.playerUsers), saved: event.saved, replaces: null })`. Пам'ять звільняється після нього (наявна логіка `closedRooms` / `forget`).

- [ ] **Step 1: Write the failing tests**
  - `manager.saved.test.ts` (`FakeScheduler`; ведучий `'u1'`, Олена `'u2'`, Тарас гість; `makeQuiz([single, text, single])`; слухач подій збирає `RoomEvent`):
    - **Контрольна точка.**
      - Після `start` — `room.checkpoint.state.phase === 'intro'`.
      - Після `next` (запитання 1) контрольна точка та сама (`intro`).
      - Після `lock` → `next` (розкриття) — `reveal`. На `leaderboard` — `leaderboard`.
      - На запитанні 2 вона лишається `leaderboard`, `at` — мить того `commit`.
    - **Ручне збереження посеред запитання 2.**
      - Олена відповіла, а ведучий дав Тарасу +50.
      - `manager.host(room, { type: 'save' })` → `{ ok: true }`, `manager.get(room.code) === undefined`, остання подія `closed` з `saved`.
      - `saved.state.phase === 'leaderboard'`, `saved.state.questionIndex === 0`.
      - У `saved.state` немає відповіді Олени на запитання 2, а `adjustments` без +50.
      - `saved.stateVersion === GAME_STATE_VERSION`, `saved.playerUsers` = `[[olenaId, 'u2']]`.
    - **Межі ручного.** У лобі → `wrong_phase`. Кімната без `hostUserId` → `not_allowed`. Після фінішу → `wrong_phase`.
    - **Ведучий пішов на 10 хв** (гра дійшла до запитання) → `closed` з `saved` і жодного `finished`. Те саме без акаунта ведучого → `finished` (як досі). Те саме на `intro` до першого запитання (`plays.length === 0`) → `finished`, а не збереження.
    - **Автопілот.**
      - `it('a bot game keeps running when the author is away for 10 minutes while others stay connected')`:
        - автор відключився, Олена й Тарас на зв'язку, `scheduler.advance(HOST_ABSENCE_MS + 60_000)`;
        - `manager.get(room.code) === room`, жодної події `closed`, гра йде (фаза змінюється кроками автопілота, а не `finished`);
        - пауза автора, поставлена перед відходом, знята (`paused === false`).
      - `it('a bot game with nobody connected for 30 minutes is saved and closed')`:
        - автор і всі гравці відключились посеред запитання 2, `advance(AUTOPILOT_EMPTY_MS − 1)` → кімната жива (на `HOST_ABSENCE_MS` теж);
        - ще `advance(1)` → `closed` з `saved`, і `saved.state.questionIndex` = останнє закрите запитання;
        - хтось повернувся раніше → таймера в `scheduler.pending()` немає.
      - `{ type: 'save' }` через `manager.author` від автора → `ok`; від не автора → `not_allowed`.
    - **Перезапуск.** `viaJson(manager.snapshot(room))` має `checkpoint`. `restore` у новому менеджері дає ту саму `room.checkpoint.state.questionIndex`. Рядок без `checkpoint` (старий формат) піднімається з `checkpoint === null`.
  - `socket.test.ts`: `host:save` пульта → ack `{ ok: true }`, телефон і сцена отримують `closed` з `'saved'`. `host:save` з телефона в грі з ведучим → `forbidden`.
  - `recorder.saved.test.ts`: наскрізно менеджер + рекордер — ручне збереження посеред запитання 2 → `game.status === 'saved'`, `questions_played === 1`, `saved_game` є.
  - Оновити тести з «Навмисних змін» (`manager.test.ts`, `manager.autopilot.test.ts`, `manager.restore.test.ts`).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/rooms/manager.saved.test.ts apps/server/src/socket.test.ts apps/server/src/recorder.saved.test.ts` → FAIL.
- [ ] **Step 3: Implement** правки `manager.ts`, `socket.ts`, `recorder.ts`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server
  git commit -m "feat(server): «save and continue later» — the room keeps a checkpoint at every rest point between questions, the host or the bot's author closes the game as saved, and ten minutes without the host (or thirty minutes with nobody connected in a bot game) save a game that reached a question instead of ending it; phones and the stage get «saved»

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 4. Обрив без кімнати: чистка доби, зламаний запис, старт сервера

**Files:**
- Create: `apps/server/src/saved-games.ts` (тут лише функції бази; маршрути — задача 6), `apps/server/src/rooms/store.saved.test.ts`
- Modify: `apps/server/src/rooms/store.ts`

**Interfaces:**
- Consumes: `isSavedRoom`, `SavedRoom.checkpoint` (задача 3); `saveSavedGame`, `markAborted` (`recorder.ts`); `SavedGameData`, `GAME_STATE_VERSION`.
- Produces (`apps/server/src/saved-games.ts`):
  ```ts
  /**
   * Кімнати, що більше не піднімуться (purge, broken), по одній:
   * 1) isSavedRoom(data), є checkpoint, hostUserId != null, state.plays.length > 0 → saveSavedGame (SavedGameData з stateVersion запису, replaces — data.continued?.replaces ?? null);
   * 2) інакше гра 'running' з questions_played > 0 → status 'saved' + saved_game { data: сирий data.checkpoint як SavedGameData-конверт, якщо це об'єкт зі state; інакше null; stateVersion: data.stateVersion, якщо число, інакше null };
   * 3) решта → markAborted.
   * Збій одного рядка — onError і далі.
   */
  export async function abandonRooms(db: Db, rows: { roomId: string; data: unknown }[], onError: (error: unknown) => void): Promise<void>;
  /** Старт сервера: 'running' поза except з questions_played > 0 → 'saved' + saved_game з data null; решта 'running' поза except → 'aborted'. */
  export async function parkInterrupted(db: Db, except: string[]): Promise<void>;
  ```
- `store.ts`:
  - `boot()`: `parkInterrupted` замість `markInterrupted`;
  - `purge()`: `returning({ roomId, data })` і `abandonRooms` замість `markAborted`;
  - `adopt()`: `broken` → `abandonRooms` замість `markAborted`;
  - журнал — `this.onError`.

- [ ] **Step 1: Write the failing tests** — `store.saved.test.ts` (`createTestDb`, `RoomStore` з тестовим годинником `now`, як у `store.test.ts`; гра записана рекордером до запитання 2):
  - **Чистка доби.** Рядок `live_room` з `updated_at` старшим за `MAX_AGE_MS` і `checkpoint` на `leaderboard` → після `tick()` рядка немає, `game.status === 'saved'`, `saved_game.data.state.phase === 'leaderboard'`, `state_version === GAME_STATE_VERSION`.
  - **Зламаний запис.** Рядок з `stateVersion: 999` і грою з 2 закритими запитаннями → `adopt` (через `boot`) дає `status === 'saved'`, `saved_game.state_version === 999`, а рядка `live_room` немає.
  - **Зламаний запис гри без закритих запитань** → `aborted`, `saved_game` немає.
  - **Старт сервера.**
    - Гра `running` з `questions_played = 2` без рядка `live_room` → `saved`, `saved_game.data === null`.
    - Гра `running` з 0 → `aborted`.
    - Гра, чия кімната є в `live_room`, → `running` (піднімається).
  - **Без терміну давності.** `saved_game` з `saved_at` місячної давності після `tick()` на місці.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/rooms/store.saved.test.ts` → FAIL.
- [ ] **Step 3: Implement** `abandonRooms`, `parkInterrupted`, правки `store.ts`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/server` → PASS (`store.test.ts`, `restart.test.ts`: лише очікування з «Навмисних змін»).
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server
  git commit -m "feat(server): a game that loses its room is saved, not aborted — the day-old purge and an unreadable record keep the checkpoint (or the recorded rows) as «saved», and a server start parks running games with closed questions as «saved»; only games without a closed question are aborted

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 5. Менеджер: продовження, слоти, новенькі, звільнення місця

**Files:**
- Create: `apps/server/src/rooms/manager.continue.test.ts`
- Modify: `apps/server/src/rooms/manager.ts`, `apps/server/src/rooms/continuation.ts`, `apps/server/src/socket.ts`, `apps/server/src/socket.test.ts`, `apps/server/src/recorder.ts`

**Interfaces:**
- Consumes: `continueFrom`, `addLatePlayer`, `slotsOf`, `restPoint` (задача 1); `SavedGameData` (задача 2); `ContinuedView`, `SavedSlot`, `SlotsResponse` (задача 1).
- `continuation.ts` додає:
  ```ts
  /** Учасник старої гри для шляху 12r (рядок participant). */
  export interface RestartParticipant { id: string; nickname: string; userId: string | null; score: number; isTeam: boolean; teamId: string | null }
  export interface RestartInput {
    /** Старий збережений запис: стане continued.replaces. */
    gameId: string;
    quiz: Quiz; quizId: string | null; hostUserId: string;
    autopilot: boolean;
    roundIndex: number;
    participants: RestartParticipant[];
  }
  export type ContinueResult =
    | { ok: true; room: Room; author: { token: string; playerId: string } | null }
    | { ok: false; error: ErrorCode | 'restarting' };
  ```
- `manager.ts`:
  - `Room` отримує `continued: Continued | null` (обидва літерали; `restore` — з `saved.continued`):
    ```ts
    interface Continued {
      /** Прив'язки до акаунта, що з'явились у цій кімнаті (claim гостьового слота акаунтом). */
      bound: Set<string>;
      /** Шлях 12r: старт і бали; на 'start' без resume підставляється це. */
      carry: ResumeSetup | null;
      /** Шлях 12r: id старого збереженого запису. */
      replaces: string | null;
    }
    ```
    `SavedRoom.continued?: { bound: string[]; carry: ResumeSetup | null; replaces: string | null }`.
  - Методи:
    ```ts
    /** Точне продовження: room.id = gameId, новий код і токени, state = continueFrom(saved.state, saved.at), playerUsers з saved, playerTokens порожні, continued { bound ∅, carry null, replaces null }; openFor(gameId) → continue_open; frozen → restarting. Автопілот: токен для autopilot.authorId → author. Як restore: hostLeft (з ведучим) і commit. */
    continueSaved(gameId: string, hostUserId: string, saved: SavedGameData): ContinueResult;
    /** Шлях 12r: create / createAutopilot (автор — учасник з userId === hostUserId), нові id; кожен збережений соло-гравець / людина команди — addPlayer поза зв'язком з прив'язкою userId; людина — assignTeam у команду з тією самою назвою (немає — без команди); carry { roundIndex, points: новий id гравця чи команди → score }; replaces = gameId. */
    restartSaved(input: RestartInput): ContinueResult;
    /** Кімната з id === gameId або continued.replaces === gameId у пам'яті. */
    openFor(gameId: string): boolean;
    /** Правила «Слоти й акаунти» 1–6 з «Рішень»; токен, commit. */
    claim(code: string, slotId: string, userId: string | null): JoinResult;
    /** null — кімнати немає; не продовження → { slots: [], mine: null }; slots — гостьові без прив'язки й без токена; mine — слот, прив'язаний до userId. */
    slots(code: string, userId: string | null): SlotsResponse | null;
    ```
  - `join`: у кімнаті з `continued`:
    - якщо `userId` має прив'язаний слот → `claim(code, thatSlot, userId)`;
    - інакше лобі → `addPlayer` (як досі), а гра → `addLatePlayer`.
    - Поза продовженням без змін.
  - `host` / `author` `'start'` без `resume` у кімнаті з `continued.carry` → `start(state, now, carry)` / `autopilotStart(…, carry)`. Ключі `carry`, яких уже немає серед учасників (гравця вилучили в лобі), відкидаються перед викликом.
  - `HostAction` + `{ type: 'release'; playerId: string }`; `AUTHOR_ACTIONS` + `'release'` (автор себе не звільняє → `not_allowed`). Приватний `release(room, personId)`:
    - не продовження → `not_allowed`;
    - не слот → `not_found`;
    - інакше токени, `connections`, прив'язка з `continued.bound` (і з `playerUsers`) геть, подія `{ type: 'kicked'; playerId; reason: 'released' }`, `setConnected(false)`.
  - `RoomEvent` kicked: `{ type: 'kicked'; playerId: string; reason?: 'released' }`.
  - `view`: для `host` і для автора (`PlayerView.author`) у кімнаті з `continued` додає `continued: ContinuedView`:
    - `slots` — з `slotsOf(state)`: `taken` (є токен), `account` (є `playerUsers`);
    - `carryRound` = `continued.carry?.roundIndex ?? null`.
- `socket.ts`: `host:release` з `kickSchema` → `run({ type: 'release', playerId })`. Для `kicked` з `reason: 'released'` → `closed('released')`, інакше `'kicked'`.
- `recorder.ts`: `record` бере `replaces: room.continued?.replaces ?? null`, а job `closed`/`saved` — так само.

- [ ] **Step 1: Write the failing tests** — `manager.continue.test.ts` (контрольна точка — з ручного збереження задачі 3 через слухач `closed`; `viaJson` для «через базу»):
  - **Точне продовження.**
    - `continueSaved(gameId, 'u1', saved)` → `room.id === gameId`, новий `code` ≠ старого, `state.paused === true`.
    - Бали Олени й Тараса ті самі, `slots(code, null)` → `{ slots: [Тарас], mine: null }` (Олена прив'язана).
    - Друге `continueSaved` того самого `gameId` → `continue_open`. `openFor(gameId) === true`.
  - **Слоти.**
    - `slots(code, 'u2')` → `mine` = Олена. `join(code, 'хтось', 'u2')` → `playerId` Олени (автоматично), а нік не змінився.
    - `claim(code, olenaId, null)` → `not_allowed`; `claim(code, olenaId, 'u9')` → `not_allowed`.
    - `claim(code, tarasId, null)` → `ok`, вдруге `slot_taken`. Тепер `slots(code, null).slots` порожній.
    - `claim(code, tarasId, 'u3')` для вільного гостьового → прив'язка `u3`, `continued.bound` містить Тараса. `claim` ще одного гостьового тим самим `u3` → `not_allowed`.
    - `claim(code, teamId, null)` (id команди, не людини) → `not_found`.
  - **Новенькі.** На паузі збору (`leaderboard`) `join(code, 'Ірина', null)` → новий гравець з 0. Після `resume` і `next` (запитання) → `wrong_phase`.
  - **Гра йде далі.** `resume` → `next` → відповіді → бали додаються до збережених. Відсутній Тарас без токена `connected: false`, а запитання закривається без нього (`awaiting` порожній).
  - **Командна гра** (`recordedTeamGame`-подібна, через менеджер): `claim` людини → її `teamId` і капітанство ті самі, що до збереження.
  - **Автопілот.** `continueSaved` → `author.playerId === authorId`, `state.autopilot.hold === 'author'`. `author('resume')` від автора → гра йде.
  - **Звільнення.**
    - Ведучий `{ type: 'release', playerId: tarasId }` → подія `kicked` з `reason: 'released'`, токен Тараса не діє (`identify` → `null`), а Тарас у `state.players` з тими самими балами.
    - Прив'язка, що з'явилась у кімнаті, знята. Прив'язка Олени зі збереження після `release` лишається.
    - У звичайній кімнаті → `not_allowed`.
  - **Шлях 12r.**
    - `restartSaved` з учасниками `[Оля u2 2000, Петро null 0]`, `roundIndex: 1` → лобі з двома гравцями поза зв'язком, нові id ≠ старих, `continued.replaces === gameId`.
    - `host('start')` без `resume` → заставка «Раунд 2», бали Олі 2000 (рядок `'carry'`).
    - Командна гра: людина з командою «Сови» → `teamId` нової «Сов», `carry.points[newSovyId] === score`.
  - **Знову обрив.** Продовження на паузі збору, ведучий пішов на `HOST_ABSENCE_MS` → `closed` з `saved`, а `saved.state` — контрольна точка продовження з тими самими балами.
  - **Зріз.**
    - `view(room, HOST).continued.slots` — Олена `{ taken: false, account: true }`, Тарас `{ taken: true, account: false }`.
    - `carryRound` — `null` у точному продовженні, `1` у шляху 12r.
    - У звичайній кімнаті ключа `continued` немає.
  - **Перезапуск.** `snapshot` → `restore` зберігає `continued` (`bound` — масив ↔ `Set`).
  - `socket.test.ts`: `host:release` від пульта → телефон Тараса отримує `closed` з `'released'`; від гравця в грі з ведучим → `forbidden`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/rooms/manager.continue.test.ts apps/server/src/socket.test.ts` → FAIL.
- [ ] **Step 3: Implement** правки `manager.ts`, `continuation.ts`, `socket.ts`, `recorder.ts`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server
  git commit -m "feat(server): continue a saved game as the same game — a new code over the same game id paused for gathering, each player claims their own slot (an account's slot is theirs alone and taken automatically), newcomers join between questions with 0, the host can free a wrongly taken slot; an unreadable save restarts from its round with carried points

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 6. Маршрути: список «Не завершені», «Продовжити», «Видалити», слоти для форми

**Files:**
- Create: `apps/server/src/saved-games.test.ts`
- Modify: `apps/server/src/saved-games.ts`, `apps/server/src/account-routes.ts`, `apps/server/src/app.ts`, `apps/server/src/history.ts`, `apps/server/src/history.resume.test.ts`, `apps/server/src/profiles.test.ts`

**Interfaces:**
- Consumes: `exactSaved`, `isSavedGameData`, `RestartParticipant` (задачі 2, 5); `manager.continueSaved`, `restartSaved`, `openFor`, `claim`, `slots` (задача 5); `trimToCheckpoint` (задача 2); `snapshotOf`, `resumeRound` (`history.ts`); `claimSchema`, `SavedInfo`, `ContinueResponse` (задача 1).
- `history.ts`:
  - експортувати `playerCounts`, `teamGameIds`, `questionCountOf` (якщо приватні);
  - `resumeOptions` додає `ne(game.status, 'saved')`.
- `saved-games.ts` додає:
  ```ts
  /** id ігор, продовження яких відкрите: manager.openFor + live_room (room_id і data->'continued'->>'replaces'). */
  export async function openGameIds(db: Db, manager: RoomManager): Promise<Set<string>>;
  export function savedMode(input: { data: unknown; stateVersion: number | null; quizSnapshot: unknown; autopilot: boolean; hasAuthor: boolean }): SavedMode;
  /** Усі 'saved' ведучого (без ліміту), найновіше saved_at першим, як GameSummary + saved. */
  export async function savedSummaries(db: Db, hostId: string, open: Set<string>): Promise<GameSummary[]>;
  /** Рядки participant гри для шляху 12r. */
  export async function restartParticipants(db: Db, gameId: string): Promise<RestartParticipant[]>;
  export async function registerSavedGameRoutes(app: FastifyInstance, deps: { db: Db; manager: RoomManager; locate: (code: string) => Promise<Located>; currentUser: CurrentUser; maxRooms: number }): Promise<void>;
  ```
- Маршрути:
  - `GET /api/games` (у `account-routes.ts`) → `[...savedSummaries(db, user.id, await openGameIds(db, manager)), ...hostGames(db, user.id)]`.
  - `POST /api/games/:id/continue` (`CREATE_LIMIT`):
    - без сесії → 401;
    - не своя, не `saved` чи не UUID → 404 `not_found`;
    - відкрите → 409 `continue_open`;
    - `manager.size >= maxRooms` → 503 `server_busy`; `frozen` → 503 `restarting`;
    - `'blocked'` → 409 `cannot_continue`;
    - `'exact'` → `trimToCheckpoint(db, id, data.state)`, потім `continueSaved`;
    - `'restart'` → `restartSaved({ gameId: id, quiz: snapshotOf(quizSnapshot)!, quizId, hostUserId, autopilot, roundIndex: resumeRound(…), participants })`.
    - Відповідь 201 `ContinueResponse`: з ведучим `{ gameId: room.id, code, hostToken, stageToken }`, автопілот `{ gameId, code, stageToken, token, playerId }`.
  - `DELETE /api/games/:id`: лише своя `saved` (інакше 404); відкрита → 409 `continue_open`; інакше `delete from game` (каскад) → 200 `{}`.
  - `GET /api/games/by-code/:code/slots` (`CODE_LIMIT`): `locate` → `restarting` 503; немає → 404 `game_not_found`; інакше `manager.slots(code, account?.id ?? null)`.
  - `POST /api/games/by-code/:code/claim` (`CODE_LIMIT`): `claimSchema` (погане тіло → 400 `invalid_payload`) → `manager.claim`.
    - 201 `{ token, playerId }`;
    - 404 (`game_not_found`, `not_found`), 403 `not_allowed`, 409 `slot_taken`, 503 `restarting`.
- `app.ts`: `registerSavedGameRoutes` поруч з `registerInviteRoutes`.

- [ ] **Step 1: Write the failing tests** — `saved-games.test.ts` (`buildApp` з `createTestDb`, `signUp`, сокети як у `history.resume.test.ts`; гра з ведучим доведена до запитання 2 і збережена `host:save`):
  - **Список.**
    - `GET /api/games` → перший запис має `status: 'saved'`, `saved: { mode: 'exact', open: false }`, `questionsPlayed: 1`. Завершена гра нижче має `saved` відсутнім.
    - Чужий акаунт збереженої гри не бачить.
  - **Продовження.**
    - `POST /api/games/:id/continue` → 201 з новим `code`, `gameId === id`.
    - Тепер у списку `open: true`. Друге `continue` → 409 `continue_open`; `DELETE` → 409 `continue_open`.
  - **Слоти.**
    - `GET …/slots` гостем → `{ slots: [Петро], mine: null }`; акаунтом Олі → `mine` = Оля.
    - `POST …/claim` гостем зі слотом Олі → 403 `not_allowed`; з Петром → 201; ще раз Петром → 409 `slot_taken`; `{ slotId: 'x' }` → 400.
    - Звичайна кімната → `{ slots: [], mine: null }`.
  - **Одна гра.**
    - Продовження доведено до фінішу через сокети.
    - `GET /api/games` має рівно один запис цієї гри зі `status: 'finished'`.
    - `GET /api/games/:id` показує бали Олі з обох частин.
    - `/api/me/history` Олі має одну гру.
  - **Деплой.**
    - `saved_game.state_version = 999` → `mode: 'restart'`, `continue` → лобі (`checkCode` → `phase: 'lobby'`), старий запис ще `saved`.
    - Після старту й першого закритого запитання нової гри старого запису немає, а у `GET /api/games` одна гра.
  - **Не можна продовжити.**
    - `quiz_snapshot = '{"broken":true}'` → `mode: 'blocked'`, `continue` → 409 `cannot_continue`, а список відповідає 200.
    - Автопілот шляхом 12r без рядка автора → `blocked`.
  - **Видалення.** `DELETE` закритої збереженої → 200, `game`, `participant` і `saved_game` порожні для цього id. Чужа → 404. Завершена гра → 404.
  - `history.resume.test.ts`: гра зі статусом `saved` не потрапляє в `resumeOptions`.
  - `profiles.test.ts`: гра зі статусом `saved` не рахується ні в `/api/me/history`, ні в іграх профілю.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/saved-games.test.ts apps/server/src/history.resume.test.ts apps/server/src/profiles.test.ts` → FAIL.
- [ ] **Step 3: Implement** функції й маршрути.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server
  git commit -m "feat(server): saved games in the host's history — «saved» games come first with their mode and whether a continuation is open, «continue» opens the room (exact or from the round after an update, never for an unreadable quiz), «delete» removes the record, and the join form gets free slots and claims one

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 7. Веб: «Не завершені» в історії, «Хто ти?» на вході, «Гру збережено»

**Files:**
- Modify: `apps/web/src/api.ts`, `apps/web/src/pages/History.tsx`, `History.test.tsx`, `apps/web/src/pages/Play.tsx`, `Play.test.tsx`, `apps/web/src/pages/Host.tsx`, `Host.test.tsx`, `apps/web/src/pages/Stage.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `GameSummary.saved`, `SlotsResponse`, `ContinueResponse`, `CloseReason` (задача 1); маршрути задачі 6.
- `api.ts`:
  ```ts
  export const continueGame = (id: string) => request<ContinueResponse>(`/api/games/${encodeURIComponent(id)}/continue`, { body: {} });
  export const deleteSavedGame = (id: string) => request<object>(`/api/games/${encodeURIComponent(id)}`, { method: 'DELETE' });
  export const gameSlots = (code: string) => fetchData<SlotsResponse>(`${gameUrl(code)}/slots`);
  export const claimSlot = (code: string, slotId: string) => request<{ token: string; playerId: string }>(`${gameUrl(code)}/claim`, { body: { slotId } });
  ```
- `History.tsx`:
  - Ігри з `saved` — окремим `<section aria-labelledby="saved-title">` над рештою, заголовок `h2` `t('savedTitle')`. Кожна — `li.panel.is-saved`:
    - позначка `t('savedMark')`;
    - підпис за режимом: `'restart'` → `t('savedRestartNote')`, `'blocked'` → `t('savedBlocked')`, `open` → `t('savedOpen')`.
  - Кнопки:
    - «Продовжити» (`t('continueGame')`, `btn btn-primary`, `disabled` при `open` чи `'blocked'`):
      - ведучий: `saveHost` + `saveLastGame` + `navigate('/host/<code>')`;
      - автопілот (`'token' in result`): `savePlayer` + `saveAuthor({ stageToken })` + `saveLastGame` + `navigate('/play/<code>')`;
      - помилка → `errorText`.
    - «Видалити» (`t('deleteSaved')`, `btn btn-danger`, `disabled` при `open`): `window.confirm(t('deleteSavedConfirm', { title }))` → `deleteSavedGame` → перечитати список.
  - Завершені — як досі, без змін.
- `Play.tsx` `JoinForm`:
  - На монтуванні `gameSlots(code)`.
    - `mine !== null` → одразу `claimSlot(code, mine.id)` → `onJoined`. Якщо не вдалося — показати список і помилку.
    - `slots.length > 0` → `fieldset` з `legend` `t('slotsTitle')`: радіокнопка на слот (підпис `nickname` або `t('slotTeam', { nickname, team })`) і `t('slotNew')`.
  - Поле ніка — лише з вибраним `t('slotNew')` (або коли слотів немає, як досі).
  - Сабміт: слот → `claimSlot`; новий → `joinGame`.
  - `slot_taken` → `errorText` і перечитати слоти.
- `Play.tsx` `lost`: `game.closed === 'saved'` → `t('gameSaved')`; `'released'` → `t('slotReleased')`; інакше як досі.
- `Host.tsx`, `Stage.tsx`: `game.closed === 'saved'` → `<p className="lead">{t('gameSaved')}</p>` замість `gameGone`. На пульті ще `Link` «До історії ігор» (`t('toHistory')`) на `/history`.
- `i18n.ts`:

  | Ключ | Текст |
  |---|---|
  | `savedTitle` | `Не завершені` |
  | `savedMark` | `Не завершена` |
  | `savedRestartNote` | `Продовжиться з початку раунду (оновлення застосунку)` |
  | `savedBlocked` | `Не можна продовжити` |
  | `savedOpen` | `Продовження вже відкрите` |
  | `continueGame` | `Продовжити` |
  | `deleteSaved` | `Видалити` |
  | `deleteSavedConfirm` | `Видалити збережену гру «{title}»? Повернути її не вийде.` |
  | `status_saved` | `не завершена` |
  | `gameSaved` | `Гру збережено — продовжимо пізніше.` |
  | `slotReleased` | `Ведучий звільнив твоє місце. Вибери себе ще раз.` |
  | `slotsTitle` | `Хто ти?` |
  | `slotNew` | `Я новий гравець` |
  | `slotTeam` | `{nickname} · {team}` |
  | `toHistory` | `До історії ігор` |
  | `err_slot_taken` | `Це місце вже зайняте. Вибери інше.` |
  | `err_continue_open` | `Цю гру вже продовжують.` |
  | `err_cannot_continue` | `Цю гру не можна продовжити.` |

- `styles.css`: `.panel.is-saved` (рамка-акцент), `.slot-list` (радіо в стовпчик, 375 px без прокрутки вбік, довгий нік — `overflow-wrap: anywhere`).

- [ ] **Step 1: Write the failing tests**
  - `History.test.tsx` (мок `fetch`, як наявні тести):
    - збережена гра в розділі «Не завершені» з «Не завершена» і над завершеною;
    - `mode: 'restart'` → «Продовжиться з початку раунду (оновлення застосунку)»; `'blocked'` → «Не можна продовжити» і `disabled` «Продовжити»; `open: true` → обидві кнопки `disabled`;
    - «Продовжити» ведучого → POST `/api/games/<id>/continue`, `localStorage` має токени, перехід на `/host/123456`; автопілот → `/play/123456`;
    - «Видалити» з `confirm` → DELETE і список без гри; без `confirm` запиту немає.
  - `Play.test.tsx`:
    - `slots: [Петро]` → «Хто ти?», радіо «Петро» і «Я новий гравець», а поля ніка немає, доки не вибрано «Я новий гравець»;
    - вибір «Петро» → POST `/claim` з `{ slotId }` → гра;
    - `mine: Оля` → POST `/claim` без жодного кліку;
    - `slot_taken` → «Це місце вже зайняте. Вибери інше.» і повторний GET `/slots`;
    - порожні `slots` → форма як досі;
    - `closed('saved')` → форма з «Гру збережено — продовжимо пізніше.».
  - `Host.test.tsx`: `closed('saved')` → «Гру збережено — продовжимо пізніше.» і посилання «До історії ігор».
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/pages/History.test.tsx apps/web/src/pages/Play.test.tsx apps/web/src/pages/Host.test.tsx` → FAIL.
- [ ] **Step 3: Implement** правки веба.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web
  git commit -m "feat(web): the history lists unfinished games first with «continue» and «delete», the join form asks «who are you?» with the free saved players and «I'm a new player» and takes a signed-in player's own slot at once, and every screen of a saved game says «Гру збережено — продовжимо пізніше»

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 8. Веб: кнопка збереження й «Місця збереженої гри» на пульті та в меню автора

**Files:**
- Create: `apps/web/src/screens/SlotsPanel.tsx`, `apps/web/src/screens/SlotsPanel.test.tsx`
- Modify: `apps/web/src/screens/HostScreen.tsx`, `HostScreen.test.tsx`, `apps/web/src/screens/AuthorMenu.tsx`, `AuthorMenu.test.tsx`, `apps/web/src/screens/AuthorLobby.tsx`, `AuthorLobby.test.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `HostView.continued`, `AuthorView.continued`, `ContinuedView` (задача 1); події `host:save`, `host:release` (задачі 3, 5).
- `SlotsPanel.tsx`:
  ```ts
  /** «Місця збереженої гри»: нік (і команда), «на місці» / «вільне»; «Звільнити» для зайнятих, крім self. */
  export function SlotsPanel(props: { continued: ContinuedView; send: Send; self?: string | null; paused: boolean; phase: Phase }): JSX.Element
  ```
  - `<details className="slots-panel" open>` з `summary` `t('slotsPanel')`. Рядок — `li` з ніком, `t(taken ? 'slotTaken' : 'slotFree')` і кнопкою `t('slotRelease')`. Кнопка питає `window.confirm(t('slotReleaseConfirm', { nickname }))` і шле `send('host:release', { playerId })`.
  - `paused && phase !== 'lobby'` → підказка `t('continuedHint')`.
  - `carryRound !== null` → `t('restartNote', { round: resumeRoundText(…) })` (той самий підпис раунду, що в `ResumePanel`, з `apps/web/src/resume.ts`).
- `HostScreen.tsx`:
  - `view.continued` → `<SlotsPanel>` над `footer.actions`. У лобі з `view.continued` `ResumePanel` не показується (бали переносить сервер).
  - У `footer.actions`, коли `live`, кнопка `t('saveLater')` (`btn`) перед «Завершити»: `window.confirm(t('saveConfirm'))` → `act('host:save')`.
- `AuthorMenu.tsx`:
  - головний екран — пункт `t('saveLater')` (з `confirm`, `runAndClose('host:save')`), коли гра йде;
  - пункт `t('slotsPanel')` відкриває екран `'slots'` із `<SlotsPanel self={view.me.id} …>`, коли є `view.author.continued`;
  - `Screen` + `'slots'`, заголовок `slotsPanel`.
- `AuthorLobby.tsx`: з `author.continued` замість `ResumePanel` — рядок `t('restartNote', …)`.
- `i18n.ts`:

  | Ключ | Текст |
  |---|---|
  | `saveLater` | `Зберегти й продовжити пізніше` |
  | `saveConfirm` | `Зберегти гру й закрити кімнату? Недогране запитання почнеться заново. Продовжиш з «Історії ігор».` |
  | `slotsPanel` | `Місця збереженої гри` |
  | `slotTaken` | `на місці` |
  | `slotFree` | `вільне` |
  | `slotRelease` | `Звільнити` |
  | `slotReleaseConfirm` | `Звільнити місце «{nickname}»? Бали лишаться в таблиці.` |
  | `continuedHint` | `Гравці вибирають себе зі списку. Коли всі зайдуть, натисни «Продовжити».` |
  | `restartNote` | `Почнемо з «{round}» з балами збереженої гри.` |

- [ ] **Step 1: Write the failing tests**
  - `SlotsPanel.test.tsx`:
    - два слоти (Оля `taken`, Петро вільний) → «на місці» / «вільне», «Звільнити» лише в Олі;
    - клік з `confirm` → `send('host:release', { playerId: olyaId })`, без `confirm` — нічого;
    - `self = olyaId` → кнопки немає;
    - `paused` на `leaderboard` → підказка є, у лобі — ні;
    - `carryRound: 1` → «Почнемо з «Раунд 2 · …» з балами збереженої гри.».
  - `HostScreen.test.tsx`:
    - на `question` і `leaderboard` кнопка «Зберегти й продовжити пізніше» є, у лобі й на фініші — немає;
    - клік з `confirm` → `send('host:save')`;
    - `view.continued` → панель «Місця збереженої гри»;
    - лобі з `continued` → `ResumePanel` («Продовжити попередню гру») немає.
  - `AuthorMenu.test.tsx`: пункт «Зберегти й продовжити пізніше» → `host:save`; «Місця збереженої гри» без «Звільнити» біля автора.
  - `AuthorLobby.test.tsx`: `continued.carryRound: 1` → «Почнемо з …», а «Продовжити попередню гру» немає.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/SlotsPanel.test.tsx apps/web/src/screens/HostScreen.test.tsx apps/web/src/screens/AuthorMenu.test.tsx apps/web/src/screens/AuthorLobby.test.tsx` → FAIL.
- [ ] **Step 3: Implement** правки веба.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web
  git commit -m "feat(web): the host console and the bot author's menu get «Зберегти й продовжити пізніше» with a confirmation, and a continued game shows «Місця збереженої гри» — who is back, who is free, «Звільнити» for a wrong seat, and the round a restarted game will begin with

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 9. Наскрізний сценарій 13b

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Помічники беруться як є: `open`, `register`, `join`, `afterSplash`, `pickOption`, `shot`, `snapshot`, `expectNoSideScroll`, `exact`, `problems`, `classicRound`, `makeRoundsQuiz`.
- Вікторина «Збережена гра 13b» — один класичний раунд «Розминка», три запитання `single`, `speedBonus: false`, `shuffleOptions: false`, типовий `leaderboard`. Правильна — `a`:
  1. «Яка річка тече через Київ?» (Дніпро, Дністер, Десна, Південний Буг);
  2. «Яке місто — столиця Буковини?» (Чернівці, Ужгород, Луцьк, Рівне);
  3. «Яка гора — найвища в Україні?» (Говерла, Петрос, Піп Іван, Бребенескул).
- Екрани:
  - пульт 1280 × 800 (`host13b`, акаунт);
  - сцена 1280 × 720 (`stage13b`);
  - Оля (`olya13b`, **акаунт**, 375 × 812), Петро (`petro13b`, гість, 375 × 812);
  - після продовження — Ірина (`iryna13b`, гість, 375 × 812).
- Локатор рядка таблиці: `row(page, name) = page.locator('.standings li', { has: page.locator('.name', { hasText: name }) })`.

- [ ] **Step 1: Add the scenario** у кінець файлу за зразком 13a:
  ```ts
  it('part 13b: saved games — the host saves in the middle of question 2 and every screen says «Гру збережено — продовжимо пізніше»; «Історія ігор» lists it as «Не завершена»; «Продовжити» opens a new code where the signed-in Оля comes back by herself with her 100 points, Петро picks himself from «Хто ти?» and Ірина joins as a new player with 0; question 2 starts afresh, the game finishes, and the history shows one finished game', async () => {
    try {
      await savedGames13b();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Кроки `savedGames13b()`:**
  1. **Перша частина.**
     - Реєстрація ведучого й Олі, вікторина через `POST /api/quizzes`, «Грати», сцена, `join` Олі (з акаунтом) і Петра.
     - «Почати гру» → «Почати раунд» → запитання 1: Оля «Дніпро», Петро «Дністер» → «Показати відповідь» → «Далі» → таблиця: Оля 100, Петро 0.
     - «Наступне запитання» → Оля вибирає «Чернівці» (Петро мовчить).
  2. **Збереження.**
     - `host.once('dialog', (d) => d.accept())`, «Зберегти й продовжити пізніше».
     - Пульт, сцена, Оля й Петро показують «Гру збережено — продовжимо пізніше.».
     - Кадри `p13b-stage-saved`, `p13b-phone-saved`.
  3. **Історія.**
     - Пульт: «До історії ігор» → `/history`.
     - Розділ «Не завершені» має «Збережена гра 13b» з «Не завершена». Кадр `p13b-history`.
     - «Продовжити» → `/host/<новий код>`, де новий код ≠ старого.
     - Сцена — за новим посиланням «Відкрити сцену».
     - `host.request.get('/api/games')` → запис має `saved.open === true`.
  4. **Повернення.**
     - Петро → `/play/<новий код>`: «Хто ти?» має радіо «Петро» і «Я новий гравець», але не «Оля».
     - `expectNoSideScroll(petro, 'p13b-who')`, кадр `p13b-who`. Петро вибирає «Петро» → «Увійти».
     - Оля → `/play/<новий код>` → без жодного кліку бачить таблицю з собою і 100.
     - Ірина → «Я новий гравець» → нік «Ірина» → «Увійти».
     - Пульт: «Місця збереженої гри» — Оля й Петро «на місці». Кадр `p13b-host-slots`.
  5. **Друга частина.**
     - Пульт «Продовжити» → таблиця сцени: Оля 100, Петро 0, Ірина 0.
     - «Наступне запитання» → `afterSplash` → «Яке місто — столиця Буковини?». На телефоні Олі жоден варіант не вибраний (`aria-pressed`/`.is-picked` немає).
     - Відповіді: Оля «Чернівці», Петро «Ужгород», Ірина «Чернівці» → розкриття → «Далі».
     - Запитання 3: усі «Говерла» → розкриття → «Завершити гру» (`confirm`).
  6. **Одна гра.**
     - `/history`: розділу «Не завершені» немає, «Збережена гра 13b» одна, «завершено», «Запитань зіграно: 3 з 3».
     - Деталі: Оля 300, Ірина 200, Петро 100 (за розкриттям 3 і 2).
     - `olya.request.get('/api/me/history')` → одна гра з цим заголовком. Кадр `p13b-history-finished`.
  7. `expect(problems).toEqual([])`. Тихі 404 на `/slots` до продовження вважаються очікуваними, якщо виникають.
- [ ] **Step 2: Run** на передньому плані: `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 13b"` → PASS. Переглянути кадри `p13b-*`:
  - «Хто ти?» на 375 px без прокрутки вбік;
  - позначка «Не завершена» помітна;
  - панель місць не перекриває кнопок пульта.
- [ ] **Step 3: Повний прогін — один раз, на передньому плані:** `npx vitest run --config apps/server/e2e/vitest.config.ts` → усі сценарії PASS. Особливо ті, що чекають 10 хв без ведучого чи 30 хв автопілота (якщо такі є), і перезапуски 9b. Якщо не вистачає пам'яті, прогнати групами за `-t` і сказати про це у звіті.
- [ ] **Step 4: Commit**
  ```bash
  git add apps/server/e2e
  git commit -m "test: part 13b end-to-end — the host saves in the middle of question 2, every screen says the game is saved, the history lists it as unfinished, «continue» opens a new code where the signed-in player comes back by herself with her points, a guest picks himself from «Хто ти?» and a newcomer joins with 0, question 2 starts afresh and the finished game is one game in the history

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```
