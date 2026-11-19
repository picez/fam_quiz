# План 51: «Думай інакше» — мінус життя за відповідь не на тему, позначка ведучого й голосування гравців в автопілоті (41b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** Усе нове — **необов'язкові** поля: `ThinkPlay.off?: string[]` (позначки ведучого), `ThinkPlay.vote?: ThinkVote` (етап голосування автопілота), `ThinkRound.offtopicVote?: boolean` у копії вікторини (немає — голосування ввімкнено). Наявні поля `ThinkPlay` (`words`, `lives`, `revealed`, `watch?`) і `AnswerRecord` не змінюються; вердикти `ThinkVerdict` (`safe | hit | empty`) — ті самі. Знімок до плану посеред запитання think (`question`, `locked`, `reveal`) читається як є: немає `vote` — етапу ще не було, немає `off` — позначок немає. Якщо виконавцю знадобиться обов'язкове поле стану чи зміна наявного — **зупинитися й спитати контролера** (підвищення обриває живі ігри; власника питають перед пушем).

> **Звірка з кодом.** План спирається на `main` 2026-11-19 (`7bc9acdd`, після плану 50 і специфікацій 41b/41c):
> - схема: `thinkRoundSchema` (`packages/shared/src/quiz.ts` ~1487: `lives`, `points`, `questions`), `LIMITS.*Think*` (~280–289), `thinkWordSchema` (~387); події — `thinkWordsEventSchema` (`packages/shared/src/events.ts` ~251), `spyVoteSchema` (~259) як зразок, `'host:think-words'` (~465), `'player:spy-vote'` (~344);
> - зрізи: `ThinkVerdict`, `ThinkRow`, `ThinkInfo`, `HostThink`, `PlayerThink` (`packages/shared/src/views.ts` ~1775–1850); історія — `GameQuestionResult['think']` (`packages/shared/src/history.ts` ~171), `PlayRef['think']` (`apps/server/src/db/schema.ts` ~171: `hit`, `manual?`);
> - рушій: `packages/engine/src/think.ts` (`openThink`, `submitThinkAnswer`, `recordVerdict`, `thinkVerdicts`, `thinkLivesAfter` — тут рахується втрата життя, `thinkPresent`), `ThinkPlay` (`packages/engine/src/game.ts` ~290), `autoLock` (~2051: гілка «Шпигуна» `spyAuto` перед загальним `closes`, гілка think ~2068), `tick` (~2470: `spyAuto` ~2492, загальне закриття в кінці ~2505), `next` з `locked` (~2610), `override` для think (~2904); зразок етапу з власним таймером — `withStage`/`startVote`/`spyAuto` (`packages/engine/src/spy.ts` ~132–183); зрізи — `thinkInfo`/`hostThink`/`playerThink` (`packages/engine/src/views.ts` ~3089–3185); автопілот — `moveOf` (`packages/engine/src/autopilot.ts` ~298: запитання з таймером закриває рушій); коментар версій `restore.ts` ~96 (останній рядок — `50 без нової версії…`); фікстури `think`/`thinkRound` (`testing/fixtures.ts` ~941–948), помічники `drive`/`answerAs`/`commit` (`testing/autopilot.ts`); тести `game.think*.test.ts`, `views.think.test.ts`, `restore.test.ts`;
> - сервер: `manager.spyVote` (`rooms/manager.ts` ~2187, `this.act(room, playerId, 'answerer')` — капітан за команду), дія `'think-words'` (~437, ~2520), `RateKind`/ліміти (~461, ~489), `socket.ts` `player:spy-vote` (~708), `host:think-words` (~1078); запис — `thinkRef` (`recorder.ts` ~238); історія — `thinkResult` (`history.ts` ~421); тест `rooms/manager.think.test.ts`;
> - веб: `screens/ThinkView.tsx` (`ThinkInput` ~53, `ThinkPhoneVerdict` ~145, `HostThinkAnswers` ~274, `ThinkStage` ~341, `RevealRow` ~369, `ThinkReveal` ~394), підключення — `PlayerScreen.tsx` ~1345 і ~1677, `StageScreen.tsx` ~1129, `HostScreen.tsx` ~883; редактор — `editor/RoundSettings.tsx` ~151 (поля think), `editor/draft-storage.ts` ~641 (`...round` — нове поле переживає відновлення); історія — `pages/GameHistory.tsx` ~217 (`ThinkHistory`);
> - тексти: `ADDED_THINK` (`apps/web/src/i18n.test.ts` ~156, перевірка локалей ~376, умова `adds no uk keys beyond the agreed list` ~606), найновіший — `ADDED_SPY_50`; довідка `round.think.*` (`help/help-uk.ts` ~219–231, `help/__fixtures__/help-uk-golden.json`, `help/help-vars.ts`, `locales/*.help.json`);
> - e2e-зразок: `apps/server/e2e/part35-think.e2e.ts` (`thinkGame35` з ведучим, `thinkAutopilot35` — 2 гравці-сокети, без голосування; помічники `writeWord35`, `hostWords35`, `hearts35`, `pilotPlayer`, `frame`, `emitOk`, `socketFrames` у `helpers/common.ts`).
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

**Мета:** у «Думай інакше» відповідь, що взагалі не стосується теми, забирає 1 ❤️ (не більше одного життя за запитання разом зі збігом); ведучий на розкритті ставить і знімає «Не на тему» біля кожної відповіді; в автопілоті після таймера — етап «Чи всі на тему?», де живі гравці (капітани за команди) анонімно позначають чужі відповіді, а більшість вирішує; у редакторі раунду голосування можна вимкнути.

**Архітектура:** позначки живуть у `ThinkPlay` поточного запитання: `off` — id учасників, яких позначив ведучий; `vote` — склад голосувальників на мить старту й їхні позначки ключами відповідей (`thinkKey`), без зв'язку з авторами. Результат голосування не заморожується, а виводиться (`thinkOffOf`) із замороженого складу, тож запитання однаково закривається будь-яким шляхом (таймер, «усі готові», `lock`). Етап голосування — у фазі `question`, як етапи «Шпигуна»: свій `endsAt`, пауза, сімейний час; відповіді на ньому закриті. `thinkLivesAfter` враховує `off` — життя, місця, кінець раунду й історія рахуються наявними шляхами.

**Технології:** TypeScript, zod 4, vitest (проєкти `shared`/`engine`/`server`/`web`), Fastify + Socket.IO, React 19 + Vite + Testing Library, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-19-think-offtopic-design.md` (41b); основа — `docs/superpowers/specs/2026-11-17-think-different-round-design.md` і план `docs/superpowers/plans/2026-11-17-plan-35-think-round.md`.

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22.** У коментар до `READABLE_STATE_VERSIONS` (`restore.ts`, після рядка `50 без нової версії…`) додати: «51 без нової версії: think — необов'язкові Play.think.off (позначки ведучого «не на тему») і Play.think.vote (голосування автопілота), необов'язкове ThinkRound.offtopicVote; старий знімок не містить нічого з цього».
- Усі тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`; довідка — `help/help-uk.ts`, `help/__fixtures__/help-uk-golden.json`, `help/help-vars.ts`, `locales/*.help.json`. Нові uk-ключі — у новому списку `ADDED_THINK_51` (`i18n.test.ts`) — в умову `adds no uk keys beyond the agreed list` і в перевірку наявності в усіх локалях (як `ADDED_THINK`). ru немає.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`).
- **Нічого, пов'язаного з росією**, — у прикладах, фікстурах, довідці, e2e.
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|engine|server|web> --maxWorkers=2 [шляхи]`; типи — у задачах 1–4 `pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine && pnpm exec tsc -p apps/server`, з задачі 6 — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів vitest).
- Файли правити лише Edit/Write чи `sed`; **python3 на цій машині — порожня заглушка, ним нічого не правити й не генерувати**; після коміту перевірити `git show --stat`.
- Робоче дерево — лише в `C:\ClaudeCode\quiz\.superpowers\worktrees\…`; жодних файлів поза `C:\ClaudeCode\quiz`.
- Таймер кожного запитання у фікстурах і e2e ≥ 25 с; етап голосування — `LIMITS.thinkVoteTime` = 25 с.
- e2e: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 51"`; телефон 360 px, світла тема; потім окремо `-t "part 35"`.
- **Анонімність:** до `reveal` жоден кадр телефона чи сцени не пов'язує відповідь з автором: у зрізах голосування — лише `{ key, text }`, порядок — за ключем, не за гравцями чи часом; кількість позначок до кінця етапу не йде нікуди (навіть на пульт — пульта в автопілоті немає, але `HostThink` її теж не несе).

## Рішення плану (там, де специфікація мовчить)

**Схема й події (`packages/shared`)**
- `LIMITS.thinkVoteTime = 25` (с) і `LIMITS.minThinkVoters = 3`.
- `thinkRoundSchema`: `offtopicVote: z.boolean().optional()` (doc «Голосування «не на тему» в автопілоті (51); немає — увімкнено»). Нова `export function thinkOfftopicVoteOn(round: ThinkRound): boolean` → `round.offtopicVote !== false`.
- Події: `thinkVoteSchema = z.object({ keys: z.array(z.string().min(1).max(LIMITS.thinkWord)).max(LIMITS.maxPlayers) })` → `'player:think-vote'` (ack ok чи `wrong_phase` / `think_spectator` / `not_found`); `thinkOffSchema = z.object({ playerId, off: z.boolean() })` (наявний `playerId` з events.ts) → `'host:think-off'` (ack ok чи `wrong_phase` / `not_found` / `not_allowed`). **Нових кодів помилок немає.**

**Стан і рушій (`packages/engine/src/think.ts`, `game.ts`)**
- `ThinkPlay.off?: string[]` — id учасників (соло — гравець, команди — команда), яких ведучий позначив «не на тему»; `ThinkPlay.vote?: ThinkVote`:
  ```ts
  export interface ThinkVote {
    /** Хто голосує: живі присутні учасники запитання на мить старту (thinkPresent), у порядку state.players. */
    voters: string[];
    /** Позначки «не на тему» — ключі thinkKey відповідей; є ключ учасника — він натиснув «Готово» (повторне надсилання замінює). */
    marks: Record<string, string[]>;
  }
  ```
- **Бюлетень** `thinkBallot(state, index): { key: string; text: string; authors: string[] }[]` — непорожні відповіді учасників з `lives > 0` і не `watch`, згруповані за `thinkKey(value)`; `text` — відповідь першого автора за `state.players`; порядок — `key.localeCompare(other, 'uk')`. Порожні відповіді в бюлетень не потрапляють.
- **Право голосу за ключ:** `eligible(key) = vote.voters ∩ state.players`, мінус автори цього ключа. Відповідь «не на тему за голосуванням», якщо позначок від `eligible` **строго більше** за `eligible.length / 2`; нічия й `eligible.length === 0` — на тему.
- `thinkOffOf(state, index): Record<string, 'host' | 'vote'>` — ведучий (`off`) має перевагу в джерелі; вилучені з гри не в результаті. Порожня відповідь `off` не отримує (вона й так `empty`).
- `thinkLivesAfter`: `lost = record === undefined || recordVerdict(...) === 'hit' || id ∈ thinkOffOf(...)` — **щонайбільше 1 життя**. `thinkVerdicts`/`ThinkVerdict` — без змін.
- **Коли етап є** — `thinkVoteDue(state): boolean`: `state.autopilot !== undefined`, раунд `thinkOfftopicVoteOn`, `vote === undefined`, `thinkPresent(state).length >= LIMITS.minThinkVoters`, і в бюлетені хоч один ключ з `eligible > 0`. З ведучим етапу ніколи немає.
- `startThinkVote(state, now): GameState` — `vote = { voters: thinkPresent(state), marks: {} }`, таймер `LIMITS.thinkVoteTime` від `now` за зразком `withStage` зі `spy.ts` (прибрати `overtime`, `extraMs = familyExtraMs`, пауза → `remainingMs`).
- `thinkAuto(state, now: number | null): GameState` — лише для запитання think в автопілоті; фаза `question`, не пауза:
  - без `vote`: час сплив (строго `>`, `heldAt === null`) або всі присутні живі відповіли → `thinkVoteDue` і `now !== null` ? `startThinkVote` : `lockNow`;
  - з `vote`: час сплив, або кожен присутній з `voters` має ключ у `marks`, або присутніх голосувальників немає → `lockNow`.
  Виклик — у `autoLock` замість теперішньої гілки think для автопілота **перед** загальним закриттям за `closes` (як `spyAuto`) і в `tick` поруч зі `spyAuto`. З ведучим — поведінка як зараз.
- `submitThinkAnswer`: на етапі голосування (`vote !== undefined`) → `fail('time_over')` (новий `endsAt` не відкриває відповідей).
- `voteThinkOff(state, actorId, keys, now): Result` — `wrong_phase` (не етап голосування / не `question`), `think_spectator` (не в `voters`), `not_found` (ключ не з бюлетеня або власний — автор ключа); дублікати ключів зводяться; `marks[actorId] = keys` (замінює); далі `thinkAuto(…, now)` (рання кінцівка).
- `markThinkOff(state, actorId, off): Result` — лише `phase === 'reveal'` поточного запитання think (`wrong_phase`), не автопілот (`not_allowed`), є непорожній запис учасника (`not_found`); додає/прибирає id в `off` (порожній масив — ключ прибрати); той самий стан, якщо нічого не змінилося; потім `withTotals`. Ведучий знімає позначку голосування? — ні: в автопілоті ведучого немає (див. «Розбіжності»).
- `lock` на етапі голосування — `lockNow` (без змін у `lock`).

**Зрізи**
- `ThinkRow.off: 'host' | 'vote' | null` — лише `reveal`; `lost` уже рахується з життів.
- `ThinkInfo.vote: { entries: { key: string; text: string }[]; voted: string[]; voters: number } | null` — лише етап голосування; `voted` — id учасників, що натиснули «Готово» (сцена пише їхні ніки), без кількості позначок.
- `PlayerThink.off: 'host' | 'vote' | null` (reveal) і `PlayerThink.vote: { entries: { key: string; text: string }[]; marked: string[]; canVote: boolean; done: boolean } | null` — `entries` **без власного ключа** (для учасника-не-голосувальника — повний список, `canVote: false`); `marked` — свої надіслані позначки.
- `HostThink.answers[].off: 'host' | 'vote' | null`.
- Сцена: під час голосування `ThinkInfo.rows[].answered` — як зараз (✓), текстів відповідей у `rows` немає.

**Сервер**
- `manager.thinkVote(room, playerId, keys)` — як `spyVote` (`act(…, 'answerer')` → капітан за команду; не капітан → наявна відмова `act`); частота — новий `RateKind` `'thinkVote'` `{ max: 4, windowMs: 1000 }` на гравця.
- Дія ведучого `{ type: 'think-off'; playerId: string; off: boolean }` → `markThinkOff`; частота — наявний `'think'` (`HOST_RATE_ID`).
- `PlayRef.think.off?: Record<string, 'host' | 'vote'>` (`recorder.thinkRef` — з `thinkOffOf`, порожнє — без ключа); `history.thinkResult`: рядок `off?: 'host' | 'vote'`, `lost = revealed && (verdict !== 'safe' || off !== undefined)`; `GameQuestionResult['think'].rows[].off?` у `packages/shared/src/history.ts`.

**Веб**
- Телефон, етап голосування (`me.think.vote !== null`) — замість `ThinkInput` компонент `ThinkVoteBallot`: заголовок «Чи всі на тему?», підказка, список кнопок-перемикачів (`aria-pressed`, `dir="auto"`) і «Готово» → `player:think-vote { keys }`; після ack — «Голос враховано…», перемикачі лишаються (повторне «Готово» замінює). `canVote: false` — список без кнопок і рядок «Голосує капітан команди» (член команди) чи «Гравці перевіряють, чи всі відповіді на тему» (вибулий, глядач, автор). Порожній список для голосувальника — «Чужих відповідей для перевірки немає».
- Сцена (`ThinkStage`, `view.think.vote !== null`): «Чи всі на тему?», сітка відповідей без імен, «Проголосували: {names}» / «Ще ніхто не проголосував», таймер як зараз.
- Розкриття (`RevealRow`, телефон `ThinkReveal`, `ThinkPhoneVerdict`): тег «не на тему» (`off === 'host'`) чи «не на тему (голосування)» (`'vote'`), клас `is-off`; свій вердикт — «−1 ❤️: відповідь не на тему».
- Пульт (`HostThinkAnswers`), `phase === 'reveal'`, рядок з непорожньою відповіддю: кнопка «Не на тему» / «Зняти «не на тему»» → `host:think-off`; тег як на розкритті.
- Редактор (`RoundSettings`, think): прапорець «Голосування «не на тему» в автопілоті» (`checked={round.offtopicVote !== false}`; зняти → `offtopicVote: false`, поставити → ключ прибрати) і `meta`-пояснення.
- Історія (`ThinkHistory`): тег «не на тему» / «не на тему (голосування)».
- Стилі `apps/web/src/styles.css`: `.think-vote` (перемикачі в 1 колонку на 360 px, без бокового скролу), `.think-answer.is-off`, обидві теми.

## Порядок збирання

- Порядок: 1 → 2 → 3 → 4 → 5 → 6 → 7. Залежності: 2 ← 1; 3 ← 2; 4 ← 3; 5 — після 1 (тексти); 6 ← 3, 4, 5; 7 — остання.
- Нові обов'язкові поля зрізів (`ThinkRow.off`, `ThinkInfo.vote`, `PlayerThink.off`/`vote`, `HostThink.answers[].off`) ламають фікстури веб-тестів, доки не завершено задачу 6: у задачах 1–5 перевіряються тести й `tsc` пакетів і сервера; `pnpm typecheck` — обов'язково зелений з задачі 6.

## Фокус рев'ю

1. **Анонімність голосування.** На етапі голосування `JSON.stringify` зрізу кожного телефона й сцени не містить пари «нік/id автора ↔ текст відповіді»: `rows[].answer` — `null`, бюлетень — лише `{ key, text }` за ключем; `PlayerThink.vote.entries` не має власного ключа; кількостей позначок немає до `reveal`. Задачі 3, 7.
2. **Більшість і нічия.** 4 голосувальники, автор поза своїм ключем: 2 з 3 — «не на тему», 1 з 3 — ні; 5 голосувальників: 2 з 4 — нічия → на тему; той самий текст двох авторів — обидва не голосують за нього; вилучений голосувальник не рахується ні в чисельнику, ні в знаменнику. Задача 2.
3. **Щонайбільше 1 життя.** Збіг + «не на тему» (ведучий чи голосування) → −1, не −2; порожня відповідь `off` не отримує; позначка/зняття ведучого на розкритті одразу міняє ❤️ у зрізах, а наступне запитання відкривається з правильними життями; останнє життя через «не на тему» — вибування й кінець раунду (≤ 1 живий). Задачі 2, 3.
4. **Без етапу.** 2 живі учасники, вимкнене `offtopicVote`, гра з ведучим, усі відповіді порожні — після таймера одразу `locked`; part 35 (автопілот із 2 гравцями) — без змін. Задачі 2, 7.
5. **Знімок до плану й етап посеред деплою.** Знімок на `question` без `vote` в автопілоті з ≥ 3 гравцями після `restore` доходить до голосування; знімок на `locked`/`reveal` без `off`/`vote` розкривається й рахує життя як раніше; знімок на етапі голосування (з `vote`) після `restore` не приймає нових відповідей і закривається за таймером. Задача 2.

---

### Задача 1. Спільне: налаштування раунду, межі, події, нові зрізи й рядок історії

**Files:**
- Modify: `packages/shared/src/quiz.ts` (`LIMITS.thinkVoteTime`, `LIMITS.minThinkVoters`, `thinkRoundSchema.offtopicVote`, `thinkOfftopicVoteOn`), `packages/shared/src/events.ts` (`thinkVoteSchema`, `thinkOffSchema`, `'player:think-vote'`, `'host:think-off'` з doc-коментарями про ack), `packages/shared/src/views.ts` (типи нижче), `packages/shared/src/history.ts` (`rows[].off?`).
- Test: `packages/shared/src/think.test.ts`, `packages/shared/src/quiz.test.ts`.

**Interfaces (Produces):**
```ts
// quiz.ts
export function thinkOfftopicVoteOn(round: ThinkRound): boolean;
// ThinkRound: { …, offtopicVote?: boolean }
// views.ts
export type ThinkOff = 'host' | 'vote';
export interface ThinkVoteEntry { key: string; text: string }
// ThinkRow: + off: ThinkOff | null
// ThinkInfo: + vote: { entries: ThinkVoteEntry[]; voted: string[]; voters: number } | null
// HostThink.answers[]: + off: ThinkOff | null
// PlayerThink: + off: ThinkOff | null; vote: { entries: ThinkVoteEntry[]; marked: string[]; canVote: boolean; done: boolean } | null
// history.ts — GameQuestionResult['think'].rows[]: + off?: ThinkOff
```

- [ ] **Step 1: Write the failing tests:**
  - `quiz.test.ts`: `a think round may switch the off-topic vote off` — раунд без поля проходить і `thinkOfftopicVoteOn === true`; `offtopicVote: false` проходить і `=== false`; `offtopicVote: 'так'` — помилка.
  - `think.test.ts`: `thinkVoteSchema` — `{ keys: [] }` ок, `{ keys: ['банан'] }` ок, ключ 41 символ — помилка, порожній ключ — помилка, 51 ключ — помилка; `thinkOffSchema` — `{ playerId: 'p1', off: true }` ок, без `off` — помилка.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/think.test.ts packages/shared/src/quiz.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» й Interfaces.
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 && pnpm exec tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 51 think — an optional round switch for the off-topic vote, vote and host off-topic events, view fields for off-topic marks and the anonymous ballot"
```

---

### Задача 2. Рушій: позначки, бюлетень, етап голосування, життя (складна)

**Files:**
- Modify: `packages/engine/src/game.ts` (`ThinkPlay.off?`, `ThinkPlay.vote?`, `ThinkVote`; виклики `thinkAuto` в `autoLock` і `tick`), `packages/engine/src/think.ts` (функції нижче, `thinkLivesAfter`, `submitThinkAnswer`), `packages/engine/src/index.ts` (експорт нових функцій, якщо не через `export *`), `packages/engine/src/restore.ts` (коментар), `packages/engine/src/testing/autopilot.ts` (якщо `drive` чекає `locked` одразу після таймера — дати йому пройти етап голосування: голосувальники надсилають `[]`).
- Create: `packages/engine/src/game.think-offtopic.test.ts`.
- Test: `packages/engine/src/restore.test.ts`, наявні `game.think*.test.ts`.

**Interfaces:**
- Consumes: Задача 1.
- Produces:
```ts
export interface ThinkVote { voters: string[]; marks: Record<string, string[]> }
export function thinkBallot(state: GameState, index: number): { key: string; text: string; authors: string[] }[];
export function thinkOffOf(state: GameState, index: number): Record<string, 'host' | 'vote'>;
export function startThinkVote(state: GameState, now: number): GameState;
export function thinkAuto(state: GameState, now: number | null): GameState;
export function voteThinkOff(state: GameState, actorId: string, keys: string[], now: number): Result;
export function markThinkOff(state: GameState, actorId: string, off: boolean): Result;
```

- [ ] **Step 1: Write the failing tests** (`game.think-offtopic.test.ts`; вікторина `thinkRound('t', [think('q1', [{ word: 'червоний', synonyms: [] }], { timeLimit: 30 }), think('q2', …), think('q3', …)], { lives: 2 })`; автопілот — як у `game.think-round.test.ts` ~227, гравці Оля, Петро, Віра, Ігор; з ведучим — звичайна гра):
  - `host marks an off-topic answer and takes it back` — reveal, Петро «банан»: `markThinkOff(Петро, true)` → `thinkOffOf` `{ Петро: 'host' }`, `thinkLivesAfter(Петро) === 1`; `false` → знову 2; на `question`/`locked` → `wrong_phase`; без запису (мовчав) → `not_found`; в автопілоті → `not_allowed`.
  - `a match and off-topic cost one life` — Оля «червоний» (збіг) + позначка → життя 1, не 0.
  - `off-topic on the last life eliminates and may end the round` — 3 гравці, 1 життя кожному, двоє — збіг і «не на тему» → `thinkOver === true`.
  - `the autopilot opens the vote after the timer` — 4 гравці відповіли (Оля «синій», Петро «банан», Віра «зелений», Ігор пусто) → після «всі відповіли» фаза `question`, `vote.voters` — 4 ids, `endsAt === now + 25_000`; `submitThinkAnswer` → `time_over`; `thinkBallot` — 3 ключі за абеткою, без Ігоря.
  - `the majority marks off-topic, a tie stays on topic` — 4 голосувальники, «банан» позначили Оля й Віра → `{ Петро: 'vote' }`; лише Оля → `{}`; 5 гравців, 2 з 4 → `{}` (нічия), 3 з 4 → `vote`.
  - `voters cannot mark their own answer or a missing one` — Петро `['банан']` → `not_found`; `['кавун']` → `not_found`; вибулий/автор автопілота → `think_spectator`; не етап → `wrong_phase`; повторне надсилання замінює.
  - `the same word by two authors` — Петро й Віра «банан»: за «банан» голосують лише Оля й Ігор, 2 з 2 → обидва `vote`.
  - `the vote ends early when every present voter is done` — усі 4 надіслали → `locked`; один відключений, решта 3 надіслали → `locked`; таймер сплив (`tick(now + 25_001)`) → `locked`.
  - `no vote stage` — 2 живі гравці; `offtopicVote: false`; з ведучим; усі відповіді порожні → після таймера одразу `locked`.
  - `a kicked voter counts nowhere` — вилучення Віри на етапі голосування: знаменник для «банан» — 2.
  - `restore.test.ts`: `an old think snapshot without vote or off restores` — знімок на `question` автопілота (4 гравці) без `vote` → `restore` → таймер → етап голосування; знімок на `reveal` без `off` → ті самі життя; знімок на етапі голосування → `restore` → відповідь `time_over`, `tick` після `endsAt` → `locked`.
- [ ] **Step 2: Run** `pnpm test --project engine --maxWorkers=2 packages/engine/src/game.think-offtopic.test.ts packages/engine/src/restore.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (стан і рушій) і коментар у `restore.ts`.
- [ ] **Step 4: Run** `pnpm test --project engine --maxWorkers=2`, потім `pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine`. Expected: PASS (наявні тести think з ≥ 3 гравцями в автопілоті, якщо такі є, виправити так, щоб вони проходили етап голосування, — не вимикати його).
- [ ] **Step 5: Commit**
```bash
git add packages/engine
git commit -m "feat(engine): 51 think — an off-topic answer costs a life, at most one per question; host marks at reveal; on autopilot an anonymous players' vote after the timer, majority of eligible voters, ties on topic, early end"
```

---

### Задача 3. Рушій: зрізи — сцена, телефони, пульт, без авторів у голосуванні

**Files:**
- Modify: `packages/engine/src/views.ts` (`thinkInfo`, `hostThink`, `playerThink`).
- Test: `packages/engine/src/views.think.test.ts`.

**Interfaces:**
- Consumes: Задачі 1–2.
- Produces: `thinkInfo`/`hostThink`/`playerThink` — ті самі сигнатури, поля Задачі 1.

- [ ] **Step 1: Write the failing tests** (`views.think.test.ts`, стан з Задачі 2 на етапі голосування):
  - `the ballot reaches the stage and phones without authors` — `stageView.think.vote.entries` = `[{ key, text: 'банан' }, …]` за абеткою; `rows[].answer` усі `null`; у `JSON.stringify(stageView)` і `playerView(Оля)` немає підрядка, де нік автора стоїть поруч з його текстом (перевірка: жоден об'єкт зрізу не має водночас `nickname`/`id` автора й тексту його відповіді).
  - `a voter does not see their own answer` — `playerView(Петро).me.think.vote.entries` без «банан», `canVote: true`, `done: false`; після `voteThinkOff(['синій'])` → `marked: ['синій'], done: true`; `stageView.think.vote.voted` — `[Петро]`, кількостей позначок ніде немає.
  - `non-voters see the list read-only` — вибулий і автор автопілота: `canVote: false`, повний список; член команди (не капітан) — `canVote: false`.
  - `the reveal shows off-topic marks` — `rows[Петро].off === 'vote'`, `lost: true`; ведучий — `'host'`; `playerView(Петро).me.think.off === 'vote'`, `verdict: 'safe'`; `hostThink.answers[Петро].off`.
  - `no vote outside the stage` — `question` до таймера, `locked`, `reveal`: `vote: null`.
- [ ] **Step 2: Run** `pnpm test --project engine --maxWorkers=2 packages/engine/src/views.think.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (зрізи).
- [ ] **Step 4: Run** `pnpm test --project engine --maxWorkers=2 && pnpm exec tsc -p packages/engine`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/engine
git commit -m "feat(engine): 51 think views — the anonymous ballot for the stage and phones without one's own answer, who has voted without counts, off-topic marks at reveal for everyone and on the host"
```

---

### Задача 4. Сервер: події голосу й позначки, частота, запис, історія

**Files:**
- Modify: `apps/server/src/rooms/manager.ts` (`thinkVote`, дія `'think-off'`, `RateKind` `'thinkVote'`), `apps/server/src/socket.ts` (`player:think-vote`, `host:think-off`), `apps/server/src/db/schema.ts` (`PlayRef.think.off?`), `apps/server/src/recorder.ts` (`thinkRef`), `apps/server/src/history.ts` (`thinkResult`).
- Test: `apps/server/src/rooms/manager.think.test.ts`, `apps/server/src/socket.test.ts`, `apps/server/src/history.test.ts`, `apps/server/src/recorder.test.ts`.

- [ ] **Step 1: Write the failing tests:**
  - `manager.think.test.ts`: `the host marks an answer off-topic and takes it back` — reveal → `think-off` → кадри сцени й телефона Петра: `off: 'host'`, ❤️ менше; `off: false` → як було; на `question` → `wrong_phase`.
  - `the autopilot runs the off-topic vote` — 4 гравці, автор дивиться; після таймера кадри гравців на етапі голосування без ніків авторів поруч з текстами; `thinkVote` трьома голосами за «банан» → `locked` → `reveal` з `off: 'vote'`; гравець 5-м голосом поза бюлетенем → `not_found`; частота — 5 надсилань за секунду → `too_soon`.
  - `captains vote for teams` — 3 команди: капітан — ок, інший член — відмова `act` (той самий код, що в `spyVote`).
  - `socket.test.ts`: `player:think-vote` з поганим тілом → `INVALID`; `host:think-off` від гравця → `FORBIDDEN`.
  - `recorder.test.ts`/`history.test.ts`: розкрите запитання з позначками → `PlayRef.think.off` `{ Петро: 'host' }`; історія — рядок `off: 'host'`, `lost: true`; стара гра без `off` — рядки як раніше.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/rooms/manager.think.test.ts apps/server/src/history.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (сервер).
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/rooms apps/server/src/socket.test.ts apps/server/src/history.test.ts apps/server/src/recorder.test.ts apps/server/src/restart.test.ts`, потім `pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src
git commit -m "feat(server): 51 think — player off-topic vote and host off-topic toggle events with rate limits, captains vote for teams, off-topic marks recorded and shown in game history"
```

---

### Задача 5. Веб: тексти в 7 мовах і довідка

**Files:**
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,de,es,it,pl,ar}.json`, `apps/web/src/i18n.test.ts`, `apps/web/src/help/help-uk.ts`, `apps/web/src/help/__fixtures__/help-uk-golden.json`, `apps/web/src/help/help-vars.ts` (+ `thinkVoteTime: LIMITS.thinkVoteTime`, `minThinkVoters`), `apps/web/src/locales/{en,de,es,it,pl,ar}.help.json`.

**Ключі (uk), `ADDED_THINK_51`:** `thinkOffTag` «не на тему»; `thinkOffVoteTag` «не на тему (голосування)»; `thinkHostMarkOff` «Не на тему»; `thinkHostUnmarkOff` «Зняти «не на тему»»; `thinkVerdictOff` «−1 ❤️: відповідь не на тему»; `thinkVoteTitle` «Чи всі на тему?»; `thinkVoteLead` «Позначте відповіді, що зовсім не стосуються теми. Своєї відповіді тут немає.»; `thinkVoteDone` «Готово»; `thinkVoteSent` «Голос враховано — його можна змінити, поки йде час»; `thinkVoteWatch` «Гравці перевіряють, чи всі відповіді на тему»; `thinkVoteCaptain` «Голосує капітан команди»; `thinkVoteNothing` «Чужих відповідей для перевірки немає»; `thinkVoteVoted` «Проголосували: {names}»; `thinkVoteNobody` «Ще ніхто не проголосував»; `thinkOffVoteSetting` «Голосування «не на тему» в автопілоті»; `thinkOffVoteSettingHint` «Без ведучого після таймера гравці позначають відповіді не на тему (коли живих щонайменше 3). Ведучий позначає сам у будь-якій грі.»; `thinkHistoryOff` «не на тему»; `thinkHistoryOffVote` «не на тему (голосування)». Звертання — «Ви»-форми, як в усіх `think*`.

**Довідка `round.think.*`:** `what` — «…втрачають ❤️ ті, хто збігся зі словом ведучого або написав щось не на тему.»; `how.3` + «Відповідь, що зовсім не стосується теми, теж забирає ❤️ — але за питання щонайбільше одне. На розкритті ведучий позначає й знімає «Не на тему» біля кожної відповіді.»; новий `how.5` — «Без ведучого після таймера — {thinkVoteTime} с «Чи всі на тему?»: живі гравці (у командах — капітани) бачать чужі відповіді без імен і позначають ті, що не на тему. Рішення — більшістю тих, хто міг голосувати за відповідь; нічия — на тему. Голосування буває, коли живих щонайменше {minThinkVoters}; автор може вимкнути його в налаштуваннях раунду.»; `tip.1` (новий) — «Не на тему — це «банан» на «колір веселки», а не просто незвичне слово: незвичне й є суттю раунду.» Інші мови — ті самі ключі тим самим змістом.

- [ ] **Step 1: Write the failing test** — `ADDED_THINK_51` в `i18n.test.ts` (умова `adds no uk keys…` і перевірка локалей); у `help-uk-golden.json` — нові значення й ключі.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/i18n.test.ts apps/web/src/help`. Expected: FAIL.
- [ ] **Step 3: Implement** ключі, 6 локалей і довідку.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/i18n.test.ts apps/web/src/locales apps/web/src/help apps/web/src/source-scan.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/i18n.ts apps/web/src/i18n.test.ts apps/web/src/locales apps/web/src/help
git commit -m "feat(web): 51 think texts in seven languages — off-topic marks, the «is everyone on topic?» vote, the round switch, and the help about off-topic answers"
```

---

### Задача 6. Веб: бюлетень на телефоні, сцена голосування, позначки на розкритті й пульті, налаштування, історія

**Files:**
- Modify: `apps/web/src/screens/ThinkView.tsx` (новий `ThinkVoteBallot`, `ThinkStage` з голосуванням, `RevealRow`, `ThinkPhoneVerdict`, `HostThinkAnswers`), `apps/web/src/screens/PlayerScreen.tsx` (~1345: `me.think.vote !== null` → `ThinkVoteBallot` замість `ThinkInput`), `apps/web/src/screens/StageScreen.tsx` (лише якщо `ThinkStage` потребує нових пропсів), `apps/web/src/editor/RoundSettings.tsx`, `apps/web/src/pages/GameHistory.tsx` (`ThinkHistory`), `apps/web/src/styles.css`.
- Test: `apps/web/src/screens/ThinkView.test.tsx`, `apps/web/src/screens/PlayerScreen.test.tsx`, `apps/web/src/screens/StageScreen.test.tsx`, `apps/web/src/screens/HostScreen.test.tsx`, `apps/web/src/editor/QuizEditor.test.tsx` (чи тест `RoundSettings`, де є поля think), `apps/web/src/pages/GameHistory.test.tsx`; фікстури зрізів — нові поля (`off: null`, `vote: null`).

**Interfaces:**
- Consumes: зрізи Задачі 1/3, ключі Задачі 5.
- Produces: `export function ThinkVoteBallot({ vote, send, onError }: { vote: NonNullable<PlayerThink['vote']>; send: Send; onError?: (text: string | null) => void })`.

- [ ] **Step 1: Write the failing tests:**
  - `ThinkVoteBallot`: список «банан», «синій» — кнопки `aria-pressed="false"`; натиснути «банан» → `true`; «Готово» → `send('player:think-vote', { keys: ['банан'] })`; після ack — «Голос враховано…»; `canVote: false` → без кнопок; член команди — «Голосує капітан команди»; порожній список — «Чужих відповідей для перевірки немає»; `marked: ['синій']` → «синій» натиснутий з початку.
  - `ThinkStage` з `vote` — «Чи всі на тему?», обидва тексти, «Проголосували: Петро»; без голосів — «Ще ніхто не проголосував»; жодного ніку поруч з текстом відповіді.
  - `ThinkReveal`/`RevealRow` — `off: 'vote'` → «не на тему (голосування)» і клас `is-off`; `'host'` → «не на тему»; `ThinkPhoneVerdict` з `off` → «−1 ❤️: відповідь не на тему».
  - `HostThinkAnswers` — на `reveal` біля «банан» кнопка «Не на тему» → `send('host:think-off', { playerId, off: true })`; з `off: 'host'` — «Зняти «не на тему»» → `off: false`; на `question` кнопки немає; для порожньої відповіді — немає.
  - `RoundSettings` (think) — прапорець «Голосування «не на тему» в автопілоті» позначений без поля; зняти → `onChange` з `offtopicVote: false`; поставити → без ключа `offtopicVote`.
  - `ThinkHistory` — рядок з `off: 'vote'` → тег «не на тему (голосування)».
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/screens/ThinkView.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (веб).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/screens apps/web/src/editor apps/web/src/pages && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src
git commit -m "feat(web): 51 think screens — the anonymous «is everyone on topic?» ballot on phones and the stage, off-topic tags at reveal and in history, the host toggle, and the round switch in the editor"
```

---

### Задача 7. Наскрізні сценарії й кадри (`part51-think-offtopic.e2e.ts`), повтор part 35

**Files:**
- Create: `apps/server/e2e/part51-think-offtopic.e2e.ts` (за зразком `part35-think.e2e.ts`: `useE2eServer`, гравці-сокети `pilotPlayer`/`join`, сторінки Playwright, світла тема `quiz:theme = light`, `is-light` на `<html>`, кадри сокета `socketFrames`, `expectNoSideScroll`).

**Вікторини:** раунд `thinkRound('th51', […], { lives: 2, points: 1000 })`, запитання з таймером 30 с: «Напишіть колір веселки» (слово ведучого `червоний`), «Напишіть фрукт» (`яблуко`), «Напишіть пору року» (`зима`). Для автопілоту — ті самі запитання зі словами.

**Сценарії:**
1. `it('part 51: the host marks an off-topic answer and takes it back, the stage and phones update, the match and off-topic cost one life')` — ведучий і 3 гравці; Оля «синій», Петро «банан», Віра «червоний»; розкриття → на пульті «Не на тему» біля «банан» → сцена й телефон Петра: «не на тему», ❤️ гасне; «Зняти «не на тему»» → ❤️ повертається; знову позначити; Вірі (збіг) «Не на тему» → у неї −1, не −2; кадри `think51-host-off-light`, `think51-phone-off-light-360`.
2. `it('part 51: autopilot — the players vote off-topic by majority, the ballot is anonymous, a tie stays on topic, phone 360 px, light theme')` — автор дивиться, 5 гравців-сокетів (Оля, Петро, Віра, Ігор, Марко) + сторінка Петра 360 px; запитання 1: «банан» Петра → «Чи всі на тему?» на сцені й телефонах; у кадрах сокета всіх гравців від старту етапу до `reveal` жоден `think.vote`/`rows` не несе ніку автора поруч з текстом; телефон Петра без «банан» у списку; троє з чотирьох можливих позначили, усі надіслали «Готово» → рання кінцівка → «не на тему (голосування)», ❤️ Петра менше; запитання 2: «кавун» Ігоря позначили 2 з 4 → нічия → на тему, ❤️ Ігоря ціле; кадри `think51-ballot-phone-light-360`, `think51-ballot-stage`, `think51-vote-reveal-light`.
3. `it('part 51: autopilot — two players get no vote, the vote switched off in the editor gets none either')` — 2 гравці: після таймера одразу розкриття (в кадрах немає `think.vote !== null`); вікторина з `offtopicVote: false` (виставлено в редакторі прапорцем, збережено, перевірено через API) і 3 гравцями — теж без етапу.
4. `it('part 51: autopilot in teams — captains vote for teams')` — 3 команди по 2 людини: на телефоні капітана — бюлетень, у члена — «Голосує капітан команди»; голос не-капітана відхилено; два капітани позначили відповідь третьої команди → «не на тему (голосування)», ❤️ команди менше.

- [ ] **Step 1: Write the scenarios.**
- [ ] **Step 2: Run** `pnpm build`, потім (після завершення збирання) `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 51"` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 3: Run** `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 35"` (після part 51, не одночасно). Expected: PASS без змін у part 35 (автопілот там — 2 гравці, голосування немає; сценарії з ведучим — без етапу).
- [ ] **Step 4: Переглянути кадри:** на 360 px перемикачі бюлетеня в одну колонку, без бокового скролу, «Готово» видно; теги «не на тему» читаються в світлій темі; сцена голосування без імен біля відповідей.
- [ ] **Step 5: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 51 — the host off-topic toggle and back, one life for a match plus off-topic, the anonymous autopilot vote by majority with early end and a tie, no vote for two players or when switched off, captains vote for teams, 360 px, light theme"
```

---

## Розбіжності зі специфікацією (рішення плану)

1. **`GAME_STATE_VERSION` не підвищується (22).** Нові поля стану — лише необов'язкові (`Play.think.off`, `Play.think.vote`, `ThinkRound.offtopicVote` у копії вікторини); наявні поля й значення не змінюються. **Живі кімнати посеред «Думай інакше» не обриваються.** Єдиний наслідок деплою: в автопілотній кімнаті з ≥ 3 живими гравцями, де запитання think відкрите саме під час деплою, після таймера з'явиться новий етап голосування (25 с); у кімнаті з ведучим — лише нова кнопка «Не на тему» на розкритті. Пуш не потребує питання власника (правило — питати лише про підвищення версії).
2. **Тривалість етапу — 25 с, не 20 с.** Специфікація каже «типово 20 с» і лишає тривалість будівничому; правило власника — таймери ≥ 25 с, тож стала `LIMITS.thinkVoteTime = 25` (не налаштовується). Рання кінцівка («усі готові») робить етап зазвичай коротшим.
3. **Хто голосує й хто в знаменнику:** живі учасники, **присутні на мить старту** етапу (як `thinkPresent`, що вже чекає лише присутніх). Відключені на старті не голосують і не рахуються — інакше їхня відсутність працювала б як голос «на тему». Вилучені посеред етапу випадають і з чисельника, і зі знаменника. Умова «≥ 3 живих» рахується так само — за присутніми.
4. **Однакові відповіді — одна картка бюлетеня** (за `thinkKey`), і обидва автори не голосують за неї. Так список коротший, а позначка «банан» стосується всіх, хто написав «банан».
5. **Збіги зі словами ведучого теж у бюлетені:** гравці слів ведучого ще не знають, і виключення таких відповідей видало б їх; життя за збіг + «не на тему» однаково одне.
6. **«Готово» = надіслати голос.** Позначки на телефоні збираються локально й ідуть одним `player:think-vote { keys }`; повторне надсилання до кінця етапу замінює голос. «Хто вже проголосував» на сцені — ті, хто надіслав.
7. **Ведучий не змінює результат голосування:** голосування є лише в автопілоті, де ведучого немає; з ведучим етапу немає ніколи, а ручна позначка доступна завжди (і в раунді з вимкненим голосуванням).
8. **Позначка ведучого — лише на розкритті** (специфікація: «на розкритті біля кожної відповіді»), лише для непорожніх відповідей (порожня й так забирає життя). Вердикт `safe | hit | empty` не змінюється: «не на тему» — окрема ознака `off`, тож старі історії й статистика читаються як є.
9. **Розкладка без імен:** бюлетень упорядковано за ключем відповіді, а не за гравцями чи часом відповіді, щоб порядок не видавав авторів; кількості позначок до розкриття не показуються ніде — на розкритті видно лише результат («не на тему (голосування)»), а не скільки голосів.
10. **Сіди не змінюються:** голосування ввімкнене типово, `think-quiz` і `school3` граються з ним без правок.
