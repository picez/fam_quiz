# План 75. Гравці голосують, щоб пропустити «Як грати» в іграх із ботом-ведучим

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** у грі з автопілотом на етапі `guide` кожен гравець голосує кнопкою «Пропустити пояснення»; щойно голосів ≥ ⌈людей на зв'язку / 2⌉ — гра робить те саме, що `skipGuide` (перший раунд із заставкою).

**Архітектура:** правило більшості й список виборців — чисті функції рушія (`packages/engine/src/guide-skip.ts`). Самі голоси — **лише в пам'яті кімнати** (`Room.guideVotes: Set<string>`, як `tilts`/`drafts`), не в `GameState` і не в знімку кімнати. Сервер дописує лічильник у зріз гравця й сцени (`view.guide.skip`) у `RoomManager.view()` — тим самим шляхом, що `likes`/`titles`; після голосу — `emit(room, { type: 'changed' })` без commit, `push` у `socket.ts` сам розсилає свіжі зрізи (дублікати відсіює `lastState`). Нова подія сокета `player:guide-skip { skip: boolean }`.

**Стек:** pnpm monorepo — `packages/shared` (zod, типи), `packages/engine`, `apps/server` (Fastify + socket.io, `RoomManager`), `apps/web` (React); vitest; e2e — playwright через `apps/server/e2e`.

**Специфікація:** `docs/superpowers/specs/2026-11-23-guide-skip-vote-design.md`.

> **Версія стану: `GAME_STATE_VERSION` = 22 — БЕЗ змін.** `GameState`, `restore.ts` і знімок кімнати (`rooms/store.ts`) не змінюються. Якщо виконавець дійде висновку, що без підвищення версії не обійтися, — **СТОП, спитати власника**, нічого не комітити.
>
> **Звірка з кодом.** План спирається на `main` 2026-11-23 (`374abbbe`). Номери рядків — орієнтир; перед кожною задачею звірити код.

## Що вже є

- `skipGuide(state, now)` (`packages/engine/src/game.ts`, ~2177): `paused` → `fail('paused')`, не `guide` → `fail('wrong_phase')`, інакше `ok(enterFirstRound(state, now))`. `start` (~2155) ставить `phase: 'guide', guidePage: 0`, коли `newcomersOn(quiz)`.
- Автопілот гортає сторінки: `moveOf` (`packages/engine/src/autopilot.ts`, ~313) → `case 'guide': nextAt(from + AUTOPILOT_MS.guide)` (8000 мс, `packages/shared/src/autopilot.ts`). Після `skipGuide` план автопілота перебудовує `planAutopilot` у `commit`.
- `RoomManager.hostStep` (`apps/server/src/rooms/manager.ts`, ~2884) — `'guide-skip'` → `skipGuide`. `host()` для автопілота повертає `FORBIDDEN`; пульт адміна в кімнаті бота (68) іде через `adminHost` → `hostStep(…, true)`. Автопілот — `room.state.autopilot !== undefined` (бот-ведучий — ще й `isBotUser(room.hostUserId)`; для голосування це не важливо).
- Пам'ять кімнати поза станом: `Room.tilts`, `drafts`, `hidden`, `gaps` (поля в `interface Room`, ~231; ініціалізація в двох місцях створення кімнати, ~925 і ~1008). `commit` (~3126) чистить `tilts` при зміні запитання/паузі.
- Зв'язок людей — у стані: `state.players[].connected` (соло) і `state.teams.members[].connected` (командна гра); `anyonePresent` (`autopilot.ts`, ~62) робить так само. `connect`/`disconnect` викликають `setConnected` через `apply` → `commit`.
- Зріз: `RoomManager.view(room, identity)` (~1776) = `baseView` + серверні ключі (`prizes`, `titles`, `likes`, `answerMark`…). `GuideView { page; pages }` (`packages/shared/src/views.ts`, ~2279) — у `BaseView.guide`.
- Сокет: `on(event, handler)` (`apps/server/src/socket.ts`, ~523; бюджет сокета й `manager.guard` уже всередині), гравцеві дії — як `'player:clue'` (~882). Типи подій — `ClientToServerEvents` у `packages/shared/src/events.ts` (~307–400), схеми поруч (як `duelBetSchema`, ~241).
- Веб: `GuidePageView` (`apps/web/src/live/Guide.tsx`); телефон — `PlayerScreen.tsx` ~1103, сцена — `StageScreen.tsx` ~1126; `useGuardedSend(send, setError)` (`apps/web/src/live/useGuardedSend.ts`).

## Рішення будівельника (записати в описі коміту задачі 2)

- **Кого рахуємо:** людей **на зв'язку** (`connected === true`): соло — `state.players`, командна гра — `state.teams.members` (людина, не команда). Автор автопілота — звичайний гравець, рахується. Бот-ведучий і адмін-пульт — не люди гри, не рахуються. Це просто, бо `connected` уже в стані.
- **Поріг:** `need = max(1, ceil(people / 2))`; `people = 0` → голосування неможливе (`reached: false`).
- **Голос того, хто відключився,** лежить у `guideVotes`, але не рахується (`votes ∩ voters`); повернувся — знову рахується. Вилучений (kick/release) випадає сам, бо його немає серед виборців.
- **Перевірка більшості** — і на голосі, і в кінці кожного `commit` (відключення, вилучення, зняття паузи можуть зменшити `people` і дати більшість без нового голосу).
- **Пауза:** голос на паузі — `paused`; кнопка вимкнена. Після зняття паузи наявна більшість спрацьовує одразу.
- **«Керую сам» адміна (68):** голоси працюють так само. Адмінова «До гри» — як зараз; після неї голоси чистяться (вихід з `guide`).
- **Між сторінками** «Як грати» голоси зберігаються (етап той самий). Вихід з `guide` (будь-яким шляхом: голоси, автопілот на останній сторінці, адмін) — `guideVotes.clear()`.
- **Телефон** показує рядок «Хочуть пропустити: N з M» завжди (і з 0); **сцена** — лише коли `votes ≥ 1`. M — люди на зв'язку.

## Глобальні обмеження

- **`GAME_STATE_VERSION` не змінювати**; `GameState`, `restore.ts`, `rooms/store.ts` (знімок кімнати) не чіпати. Голоси — лише `Room.guideVotes`; після перезапуску сервера вони губляться — це прийнятно. Якщо інакше не виходить — СТОП, спитати власника.
- **Гра з живим ведучим — без змін:** у зрізах ключа `guide.skip` немає, `player:guide-skip` → `not_allowed`, кнопка «До гри» ведучого як була.
- Голоси чистяться при виході з етапу `guide`.
- Рахуємо людей (не команди), лише на зв'язку (див. «Рішення будівельника»).
- Нові тексти інтерфейсу — у 7 мовах: uk `apps/web/src/i18n.ts`, решта `apps/web/src/locales/{en,de,pl,es,it,ar}.json`; новий список **`ADDED_75`** у `apps/web/src/i18n.test.ts` (і в загальному фільтрі «adds no uk keys beyond the agreed list»). Якщо до початку роботи в `main` уже є `ADDED_74` — ім'я лишається `ADDED_75`. Перекладені значення ≠ uk; змінні `{votes}`, `{of}` — ті самі; uk — на «ти»/безособово, як сусідні ключі `guide*`.
- **Prettier не запускати.** Коментарі в коді — українською. `python3` тут заглушка — правити лише Edit/node; після коміту — `git show --stat`.
- Тести — `pnpm vitest run --project <web|server|engine|shared> --maxWorkers=2 <шляхи>`, у передньому плані.
- E2E: `pnpm build`, потім `timeout 590 npx vitest run --config apps/server/e2e/vitest.config.ts apps/server/e2e/<файл>` — по одному файлу, у передньому плані.
- Коміти — англійською в стилі репозиторію, наприкінці «(75)», з рядками:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPgRo4NbMXbCQVe4EC6
  ```
- Не комітити нічого поза файлами задачі.

### Нові ключі i18n (uk)

| Ключ | uk |
|---|---|
| `guideSkipVote` | `Пропустити пояснення` |
| `guideSkipCancel` | `Скасувати` |
| `guideSkipCount` | `Хочуть пропустити: {votes} з {of}` |

Перед додаванням — `grep -n "guideSkip" apps/web/src/i18n.ts` (не має бути). Помилки (`err_paused`, `err_wrong_phase`, `err_not_allowed`) — наявні `errorText`, нових не треба.

## Фокус перевірки

1. **Командна гра:** двоє з однієї команди — два голоси з двох людей, а не один голос команди; `M` = люди на зв'язку, не команди. → тест у задачі 2.
2. **Хтось відключився посеред голосування:** 1 з 2 голосує, другий іде → `people = 1`, більшість є — гра переходить до раунду **без нового голосу** (перевірка в `commit`). → тест у задачі 2.
3. **Автопілот сам доходить до кінця сторінок** (чи адмін тисне «До гри») при наявних голосах: голоси чистяться, жодного другого `skipGuide`, наступний голос — `wrong_phase`. → тест у задачі 2.
4. **Пауза й повторні дотики:** голос на паузі — `paused`; більшість, що склалася до паузи (через відключення на паузі), спрацьовує після зняття паузи; той самий `skip` двічі — `ok` без нової розсилки; кнопка вимкнена, поки запит у дорозі (`useGuardedSend`). → тести в задачах 2 і 3.
5. **Перезапуск сервера посеред пояснень:** кімната з знімка має порожній `guideVotes` (не `undefined`), телефон показує «Пропустити пояснення» й «0 з M», голосування працює далі. → тест у задачі 2 (через наявний шлях підняття кімнати, як у `manager.restore.test.ts`).

---

### Задача 1. Рушій і спільне: правило більшості, вид і подія

**Файли:**
- Створити: `packages/engine/src/guide-skip.ts`, `packages/engine/src/guide-skip.test.ts`
- Змінити: `packages/engine/src/index.ts`, `packages/shared/src/views.ts` (~2279, `GuideView`), `packages/shared/src/events.ts` (схема поруч із `duelBetSchema` ~241; подія поруч із `'player:clue'` ~341), `packages/shared/src/events.test.ts`

**Інтерфейси (Produces):**
```ts
// packages/engine/src/guide-skip.ts
/** 75: скільки голосів треба, щоб пропустити «Як грати»: половина людей на зв'язку, округлено вгору, не менше 1. */
export function guideSkipNeed(people: number): number;
/** Люди на зв'язку, що голосують: соло — гравці, командна гра — учасники команд (не команди). */
export function guideVoters(state: GameState): string[];
export interface GuideSkipTally { votes: number; of: number; need: number; reached: boolean }
/** Голоси лише тих, хто серед guideVoters; of = кількість виборців; reached — votes ≥ need і of > 0. */
export function guideSkipTally(state: GameState, votes: ReadonlySet<string>): GuideSkipTally;

// packages/shared/src/views.ts
/** 75: голосування «Пропустити пояснення» в грі з автопілотом; ставить сервер, рушій ключа не ставить. mine — лише в зрізі гравця. */
export interface GuideSkipView { votes: number; of: number; mine?: boolean }
export interface GuideView { page: number; pages: GuidePage[]; skip?: GuideSkipView }

// packages/shared/src/events.ts
export const guideSkipSchema = z.object({ skip: z.boolean() }).strict();
// ClientToServerEvents:
/** 75: голос за пропуск «Як грати» (true) чи зняти його (false); лише автопілот, етап guide. Помилки: not_allowed, wrong_phase, paused, not_found. */
'player:guide-skip': (payload: z.infer<typeof guideSkipSchema>, ack: Ack) => void;
```

- [ ] **Крок 1: тести (падають).** `guide-skip.test.ts` (фікстури — `@quiz/engine/testing`: `makeQuiz`, лобі з гравцями, `start`; командна гра — як у `game.family.test.ts`/тестах команд):
  - `'guideSkipNeed: half of the people rounded up, at least one'`: `[0,1,2,3,4,5].map(guideSkipNeed)` → `[1,1,1,2,2,3]`.
  - `'guideVoters: connected solo players only'`: 3 гравці, один `connected: false` → 2 id, у порядку `state.players`.
  - `'guideVoters: people of a team game, not teams'`: 2 команди × 2 людини, усі на зв'язку → 4 id учасників; жоден id команди не входить.
  - `'guideSkipTally counts only voters and decides by majority'`: 4 на зв'язку, голоси `{p1}` → `{ votes: 1, of: 4, need: 2, reached: false }`; `{p1, p2}` → `reached: true`; голос стороннього id і відключеного гравця не рахується; 0 виборців → `{ votes: 0, of: 0, need: 1, reached: false }`.
  - `events.test.ts`: `guideSkipSchema` приймає `{ skip: true }`, `{ skip: false }`; відкидає `{}`, `{ skip: 'yes' }`, `{ skip: true, x: 1 }`.
- [ ] **Крок 2:** `pnpm vitest run --project engine --maxWorkers=2 packages/engine/src/guide-skip.test.ts` і `pnpm vitest run --project shared --maxWorkers=2 packages/shared/src/events.test.ts` — FAIL (немає модуля/експорту).
- [ ] **Крок 3:** реалізувати за інтерфейсами; `teamsOn`/`state.teams.members` з `teams.ts`; `export * from './guide-skip';` в `index.ts`. `GuideView.skip` необов'язковий — рушій (`views.ts` рушія) його не ставить; `views.guide.test.ts` лишається зеленим (`toEqual({ page, pages })`).
- [ ] **Крок 4:** ті самі команди — PASS; `pnpm typecheck` — чисто.
- [ ] **Крок 5: коміт** `feat(engine): guide skip majority rule and voters, guide skip view and player:guide-skip event (75)`.

---

### Задача 2. Сервер: голоси в пам'яті кімнати, пропуск більшістю, зріз і сокет

**Файли:**
- Змінити: `apps/server/src/rooms/manager.ts` (`interface Room`; обидва місця створення кімнати ~925 і ~1008; новий метод; `commit` ~3126; `view` ~1776), `apps/server/src/socket.ts` (обробник поруч із `'player:clue'` ~882)
- Створити: `apps/server/src/rooms/manager.guide-skip.test.ts`
- Тест: `apps/server/src/socket.test.ts` (новий `describe`)

**Інтерфейси:**
- Consumes: `guideSkipTally`, `guideVoters` (задача 1), `GuideSkipView`, `guideSkipSchema`.
- Produces:
```ts
// interface Room
/** 75: хто з людей голосує «Пропустити пояснення» (id людини). Лише в пам'яті: не в стані гри, не в знімку; вихід з guide стирає. */
guideVotes: Set<string>;

// RoomManager
/** 75: голос за пропуск «Як грати» в грі з автопілотом. Той самий голос удруге — ok без розсилки. Більшість — skipGuide. */
guideVote(room: Room, playerId: string, skip: boolean): AckResult;
/** 75: більшість є (автопілот, guide, не пауза) — apply(skipGuide); інакше нічого. */
private settleGuideVotes(room: Room): void;
```

Порядок у `guideVote`: `!alive` → `gone()`; `state.autopilot === undefined` → `NOT_ALLOWED`; `phase !== 'guide'` → `wrong_phase`; `paused` → `paused`; `playerId` не в `guideVoters(state)` → `not_found`; без змін (`has === skip`) → `{ ok: true }`; інакше add/delete, `emit(room, { type: 'changed' })`, `settleGuideVotes(room)`, `{ ok: true }`.

У `commit`: після `room.state = planAutopilot(…)` — `if (room.state.phase !== 'guide') room.guideVotes.clear();`; після фінального `emit` — `if (room.guideVotes.size > 0) this.settleGuideVotes(room);` (вкладений `apply` → `commit` уже на `intro` чистить голоси, тож рекурсії немає).

У `view`: для `role === 'player'` і `'stage'`, коли `state.autopilot !== undefined`, `phase === 'guide'` і `base.guide !== null` — `guide: { ...base.guide, skip }`, де `skip = { votes, of }` з `guideSkipTally`, а гравцю ще `mine: room.guideVotes.has(identity.playerId)`. Пульт (адмін) ключа не отримує.

Сокет: `on('player:guide-skip', (args) => …)` — не гравець → `FORBIDDEN`; `guideSkipSchema.safeParse(payloadOf(args))` → `INVALID` або `manager.guideVote(room, identity.playerId, payload.data.skip)`.

- [ ] **Крок 1: тести (падають)** — `manager.guide-skip.test.ts`; кімната-автопілот як `autopilot()` у `manager.autopilot.test.ts` (вікторина `makeQuiz([...], { newcomers: true })`, автор + `names`), старт — `act({ type: 'start' })`, далі `room.state.phase === 'guide'`:
  - `'a vote shows on the phone and the stage, a second tap with false takes it back'`: 4 людини; `guideVote(room, tarasId, true)` → ok; `manager.view(room, taras).guide.skip` = `{ votes: 1, of: 4, mine: true }`; у авторки `mine: false`; сцена — `{ votes: 1, of: 4 }` без `mine`; `guideVote(…, false)` → `votes: 0`; фаза досі `guide`.
  - `'the same vote twice is ok and emits nothing new'`: підписка `manager.onEvent`; другий `true` — `ok`, подій `changed` не додалось.
  - `'majority skips to the first round with its splash'`: 4 людини, голоси двох → `phase === 'intro'` (та сама заставка, що після `hostStep 'guide-skip'` — порівняти `splash.kind`), `room.guideVotes.size === 0`; 3 людини — одного голосу мало, двох досить; 1 людина — одразу.
  - `'team game counts people, not teams'` (Фокус 1): 2 команди × 2 людини; голоси двох людей з **однієї** команди → `intro`; до другого голосу `skip.of === 4`.
  - `'a disconnect can complete the majority'` (Фокус 2): 3 людини, голосує одна (`1 з 3`, `need 2`), інша (не голосувальник) `disconnect` → `intro`.
  - `'an offline voter does not count until back'`: 4 людини, 1 голос; голосувальник `disconnect` → `{ votes: 0, of: 3 }`, фаза `guide`; `connect` → `{ votes: 1, of: 4, mine: true }`.
  - `'leaving the guide any way clears votes'` (Фокус 3): (а) голос одного з 4, `scheduler` проганяє всі сторінки (`AUTOPILOT_MS.guide` × сторінки) → `intro`, `guideVotes.size === 0`, наступний `guideVote` → `wrong_phase`; (б) кімната бота (`manager.bot-host.test.ts`-фікстура): голос одного, `adminHost(room, { type: 'guide-skip' })` → ok як і раніше, голоси порожні.
  - `'pause refuses votes and a ready majority fires on resume'` (Фокус 4): голос 1 з 4; автор ставить паузу; `guideVote` → `paused`; двоє інших відключаються (people 2, votes 1 ≥ need 1 — але пауза, тож лишаємось у `guide`); автор знімає паузу → `intro`.
  - `'refusals'`: гра з живим ведучим (`manager.createRoom` + `newcomers`) → `not_allowed`, у її зрізах гравця й сцени `guide.skip` немає; автопілот у лобі й на `question` → `wrong_phase`; невідомий `playerId` → `not_found`.
  - `'a room raised from a snapshot starts with no votes'` (Фокус 5): шлях підняття з `manager.restore.test.ts` посеред `guide` → `room.guideVotes` — порожній `Set`, `guideVote` працює.
  - `socket.test.ts`, `describe('guide skip vote over sockets (75)')`: два гравці автопілота шлють `player:guide-skip { skip: true }` → обидва отримують `state` з `guide.skip.votes` 1, потім фаза `intro`; `{ skip: 'x' }` → `invalid_payload`; сцена бачить `skip` у своєму `state`.
- [ ] **Крок 2:** `pnpm vitest run --project server --maxWorkers=2 apps/server/src/rooms/manager.guide-skip.test.ts apps/server/src/socket.test.ts` — FAIL.
- [ ] **Крок 3:** реалізувати за інтерфейсами вище (`guideVotes: new Set()` в **обох** місцях створення кімнати).
- [ ] **Крок 4:** ті самі команди — PASS; плюс регрес `pnpm vitest run --project server --maxWorkers=2 apps/server/src/rooms/manager.autopilot.test.ts apps/server/src/rooms/manager.bot-host.test.ts apps/server/src/rooms/manager.restore.test.ts apps/server/src/rooms/store.test.ts`; `git diff 374abbbe -- packages/engine/src/restore.ts apps/server/src/rooms/store.ts` — порожньо.
- [ ] **Крок 5: коміт** `feat(server): players of an autopilot game vote to skip the guide — votes in room memory, majority of connected people skips (75)` (у тілі — «Рішення будівельника» коротко).

---

### Задача 3. Веб: кнопка й рядок на телефоні, рядок на сцені, 7 мов

**Файли:**
- Створити: `apps/web/src/live/GuideSkip.tsx`, `apps/web/src/live/GuideSkip.test.tsx`
- Змінити: `apps/web/src/screens/PlayerScreen.tsx` (~1103), `apps/web/src/screens/StageScreen.tsx` (~1126), `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,de,pl,es,it,ar}.json`, `apps/web/src/i18n.test.ts` (`ADDED_75` + перевірки за зразком `ADDED_73` ~925 + загальний фільтр ~1047), `apps/web/src/styles.css` (блок «75»)
- Тест: `apps/web/src/screens/PlayerScreen.test.tsx` (~2860), `apps/web/src/screens/StageScreen.test.tsx` (~1821)

**Інтерфейси:**
- Consumes: `GuideSkipView`, `GuideView.skip`, подія `'player:guide-skip'` (задача 1).
- Produces:
```tsx
/** 75: телефон гравця в автопілоті — кнопка-перемикач і рядок «Хочуть пропустити: N з M» (завжди). */
export function GuideSkipVote(props: { skip: GuideSkipView; paused: boolean; send: Send; onError: (message: string | null) => void }): JSX.Element;
/** 75: сцена — рядок лише з votes ≥ 1; інакше null. */
export function GuideSkipLine(props: { skip: GuideSkipView }): JSX.Element | null;
```
Кнопка: `type="button"`, `className="btn guide-skip-button"`, `aria-pressed={skip.mine === true}`, текст `guideSkipVote` / `guideSkipCancel`, `disabled={paused || busy}`, клік → `run('player:guide-skip', { skip: !skip.mine })` (`useGuardedSend`). Рядок: `<p className="meta guide-skip-count" role="status">`. Обидва компоненти — у `.guide-skip` під `GuidePageView`; рендер лише коли `view.guide.skip !== undefined` (тобто автопілот).

- [ ] **Крок 1: тести (падають):**
  - `GuideSkip.test.tsx`: `'shows the vote button and the count, sends skip true'` — `{ votes: 0, of: 4, mine: false }` → кнопка «Пропустити пояснення», `aria-pressed="false"`, текст «Хочуть пропустити: 0 з 4»; клік → `send` з `('player:guide-skip', { skip: true })`. `'a cast vote turns the button into Скасувати and sends skip false'`. `'disabled while paused'`. `'the error from the server shows through onError'` (`{ ok: false, error: 'paused' }` → `onError(errorText('paused'))`). `'stage line hides with no votes'` — `GuideSkipLine` з `votes: 0` → порожньо, з `votes: 2, of: 4` → «Хочуть пропустити: 2 з 4».
  - `PlayerScreen.test.tsx`: `'autopilot guide shows the skip vote under the page'` — `view({ phase: 'guide', guide: { ...guide, skip: { votes: 1, of: 2, mine: false } }, autopilot: true })` → `.guide.is-phone` і кнопка; `'host game guide has no skip vote'` — без `skip` → кнопки немає.
  - `StageScreen.test.tsx`: `'stage shows who wants to skip once someone voted'` — з `skip: { votes: 1, of: 3 }` → «Хочуть пропустити: 1 з 3»; з `votes: 0` → рядка немає.
  - `i18n.test.ts`: `ADDED_75 = ['guideSkipVote', 'guideSkipCancel', 'guideSkipCount']` — є в uk і в усіх 6 мовах, значення ≠ uk, змінні ті самі (як для `ADDED_73`).
- [ ] **Крок 2:** `pnpm vitest run --project web --maxWorkers=2 apps/web/src/live/GuideSkip.test.tsx apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/screens/StageScreen.test.tsx apps/web/src/i18n.test.ts` — FAIL.
- [ ] **Крок 3:** компоненти, вставки в екрани, ключі в 7 мовах (переклади — природні, напр. en «Skip the intro» / «Cancel» / «Want to skip: {votes} of {of}»), стилі з префіксом `.guide-skip` (кнопка на всю ширину на 360 px, рядок під нею; на сцені — `.guide-skip-count` великим кеглем під сторінкою; без `@media (max-width: …)`).
- [ ] **Крок 4:** ті самі тести + `pnpm vitest run --project web --maxWorkers=2 apps/web/src/locales/checks.test.ts apps/web/src/live/Guide.test.tsx` — PASS; `pnpm typecheck` — чисто.
- [ ] **Крок 5: коміт** `feat(web): Skip the intro vote button and count on phones, count line on the stage, in 7 languages (75)`.

---

### Задача 4. E2E: частина 75

**Файли:** створити `apps/server/e2e/part75-guide-skip.e2e.ts`.

**Відступ від e2e у специфікації («2 гравці, обидва натискають»):** за правилом більшості з двома людьми `need = 1`, тож гра переходить уже після першого натискання. Щоб «обидва натискають» щось перевіряло, кімнати мають **3 людини** (третя — сокет `pilotPlayer`), а голосують двоє.

**Сценарій** (каркас — `part11g-h-autopilot.e2e.ts`: `register`, `launchBot11h`, `joinBy11h`, `.author-stage a` для сцени, `socketFrames`; вікторина — `author.request.post(\`${base}/api/quizzes\`, { data: { ...makeRoundsQuiz([classicRound('r1', [...])], { newcomers: true, leaderboard: 'end' }), title: 'Пропуск 75' } })`; запитання — з таймером ≥ 25 с, без жодного зв'язку з росією):
1. «Марта 75» реєструється, створює вікторину, `launchBot11h(marta, 'Пропуск 75', 'Марта')`; «Віра 75» — `joinBy11h` на **360 × 800**; «Петро 75» — `pilotPlayer(sockets, code, 'Петро 75')` (сокет на зв'язку); сцена — `open(…, 1280, 720)` за посиланням автора. Троє людей → `need = 2`.
2. Марта «Почати гру» → на обох телефонах «Як грати», кнопка «Пропустити пояснення» й рядок «Хочуть пропустити: 0 з 3»; на сцені рядка немає.
3. Віра тисне → у неї «Скасувати» (`aria-pressed="true"`), на обох телефонах і сцені «Хочуть пропустити: 1 з 3»; кадр `75-guide-vote-360`. Віра тисне «Скасувати» → «0 з 3», на сцені рядка немає. Віра голосує знову.
4. Петро відключається (`socket.disconnect()`) → люди 2, голос 1 ≥ 1 → гра переходить до першого раунду **без нового голосу**; на телефонах заставка/назва раунду «r1», кнопки «Пропустити пояснення» немає. (Покриває Фокус 2.)
5. Сценарій специфікації: друга кімната тієї ж вікторини, Марта + Віра + Петро (сокет) — **3 людини**; Марта й Віра тиснуть одна за одною → після другого натискання гра в першому раунді; час від старту до раунду < `AUTOPILOT_MS.guide` × кількість сторінок; на телефонах немає банера помилки.
6. Гра з живим ведучим (`/host`, `newcomers: true`): на телефоні гравця на «Як грати» кнопки немає; `emit('player:guide-skip', { skip: true })` з сокета гравця → `{ ok: false, error: 'not_allowed' }`; «До гри» ведучого працює.
7. Без бічної прокрутки на 360 px (`expectNoSideScroll`); `problems` порожні.

- [ ] **Крок 1:** написати файл.
- [ ] **Крок 2:** `pnpm build`, потім `timeout 590 npx vitest run --config apps/server/e2e/vitest.config.ts apps/server/e2e/part75-guide-skip.e2e.ts` — PASS (кадри — `E2E_SHOTS=1`).
- [ ] **Крок 3: коміт** `test(e2e): part 75 — players vote to skip the guide in an autopilot game, a disconnect completes the majority, host games unchanged (75)`.

---

### Задача 5. Фінальна перевірка

- [ ] `pnpm typecheck`; `pnpm vitest run --project engine --maxWorkers=2`, `--project shared`, `--project server`, `--project web` — усе зелене.
- [ ] E2E по одному: `part75-guide-skip`, `part11g-h-autopilot`, `part08-buffs-hints-guide`, `part68-bot-full-host` (після `pnpm build`).
- [ ] `git diff 374abbbe -- packages/engine/src/restore.ts apps/server/src/rooms/store.ts | head` — порожньо; `git grep -n "GAME_STATE_VERSION = " packages/engine/src/restore.ts` — досі `22`.
- [ ] `git grep -n "guideVotes" -- packages` — порожньо (голоси лише на сервері).
- [ ] Блок «75» у `styles.css`: лише `.guide-skip*`.
- [ ] Переглянути кадри 360 px і сцени.
- [ ] Злити в `main` і запушити (версія стану не змінюється — питати не треба).

**Коміт:** — (лише перевірка; дрібні виправлення — окремими комітами з «(75)»).
