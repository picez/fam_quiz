# План 40: звуки на сцені (38d)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** Нове в стані — лише необов'язкове `GameState.soundsOff?: true` (ведучий вимкнув звуки сцени); старий знімок поля не має — звуки ввімкнено. Решта — клієнт сцени (що й коли грати, вимикач пристрою в localStorage), стану не торкається.

> **Звірка з кодом.** План спирається на `main` 2026-11-18 (`5afce823`, після плану 39):
> - звук: `apps/web/src/siren.ts` — спільний контекст `shared` (створюється й будиться лише жестом, `unlockSiren`, ~55), `sirenReady` (~50), `audioContextClass`, `quietly`, `playbackSession` (iOS `navigator.audioSession.type = 'playback'`), гучність `VOLUME = 0.2`, краї `EDGE_S = 0.02`; тести — `siren.test.ts` (підмінний `FakeAudioContext`, `vi.resetModules`); розблокування першим жестом — `apps/web/src/live/useSirenUnlock.ts` (`touchend`/`click`/`keydown`, capture), викликається для **всіх ролей** у `pages/Play.tsx` ~201;
> - годинник: `apps/web/src/clock.ts` — `secondsLeft(view, offsetMs, nowMs)` (`Math.ceil`, `remainingMs` має перевагу), `splashLeft`, `freshSplash`; `offsetMs` — з `useGame` (`live/useGame.ts` ~76, «час сервера мінус час пристрою»);
> - сцена: `apps/web/src/screens/StageScreen.tsx` — `StageScreen` (~1066): `useVerdictSuspense(live)` дає показаний `view`, `useSplash`, `useCeremony`; кут сцени — `StageSpeech` (`screens/StageSpeech.tsx`, `.stage-speech-buttons` з `ThemeToggle className="stage-theme"`), на `finished` — окремий `div.stage-speech` лише з `ThemeToggle` (~1095); таймер запитання — `Timer` у `Question` (~359) і `LadderStage` (~768) від `view.endsAt`/`view.remainingMs`;
> - зріз: `BaseView` (`packages/shared/src/views.ts` ~2013: `phase`, `paused`, `round`, `questionIndex`, `endsAt`, `remainingMs`, `held`, `splash: SplashView | null` з `{ kind, at, until }`, `family?: true` — зразок необов'язкового ключа), `StageView.stats: RevealStats | null` (`accepted: number | null`, ~905); рушій — `base()` (`packages/engine/src/views.ts` ~3202, `family` ~3284), `stageViewOf` (~3677: `stats` лише на розкритті поза фіналом, `revealStats` ~3629 — `accepted: null` для запитань без балів і поки «100 до 1» ховає дошку); `truthHeld` прибирає `stats` (~3672);
> - заставки: `SplashKind = 'round' | 'final' | 'question' | 'cell' | 'duel' | 'podium' | 'trial' | 'blitz'` (`packages/shared/src/game.ts` ~115), `SPLASH_MS`; `podium` ставиться на `finished` (`engine/src/game.ts` ~1867, ~2976);
> - вимикачі ведучого: живого вимикача кімнати в стані досі немає (`host:live-watch` — лише `socket.data`, `levelBonuses` — налаштування вікторини). Зразок події з даними — `host:cloud-hide`: `cloudHideSchema` (`events.ts`), `on('host:cloud-hide', …)` → `run({ type: 'cloud-hide', … })` (`apps/server/src/socket.ts` ~955), `HostAction` (`apps/server/src/rooms/manager.ts` ~382), `manager.host` `switch` (~2253), рушій `hideCloudWord` (`engine/src/votes.ts` ~101); `isHost`/`hostSide`/`run` (`socket.ts` ~540); автор автопілота — `AuthorAction` (`manager.ts` ~412);
> - пульт: шапка `header.bar` (`apps/web/src/screens/HostScreen.tsx` ~634: `live-toggle` з `live-toggle-label`, який ховається до 400 px, `styles.css` ~12725);
> - вигляд кнопки звуку: `VideoclipView.tsx` ~133 — `<button className="btn videoclip-sound">` з `t('videoclipSoundTap')` = «🔊 Увімкнути звук»;
> - сховище: `apps/web/src/storage.ts` ~102 (`STAGE_SPEECH`, `loadStageSpeech`/`saveStageSpeech`, `read`/`write(key, null)` — прибрати);
> - відновлення: коментар `READABLE_STATE_VERSIONS` (`packages/engine/src/restore.ts` ~93, останній рядок `39 без нової версії…`);
> - i18n: найновіші `ADDED_DUEL_BETS`/`ADDED_DUEL_BETS_PLURALS` (`apps/web/src/i18n.test.ts` ~188, перевірка локалей ~407, умова `adds no uk keys…` ~455);
> - e2e-зразки: `part39-duel-bets.e2e.ts`, `part38-spy.e2e.ts` (`useE2eServer`, `snapshot`, `shot`, `restart`, `socketFrames`, світла тема через `quiz:theme`), лічильник осциляторів у init-скрипті — `AWAY_PHONE_INIT` (`part12a-e-undo-live-clues-stats-away.e2e.ts` ~1068), автопілот — `pilotPlayer`, `createAutopilot` (`helpers/common.ts` ~650, ~690).
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

**Мета:** сцена (телевізор) грає короткі синтезовані звуки: розкриття (світлий акорд, коли хтось відповів правильно, або низьке «бу-у», коли ніхто), тихе цокання в останні 5 с таймера і гонг на його кінці, короткий акцент на заставках раунду, фіналу, дуелі, випробування й «БЛІЦ!», фанфари на фінальних результатах. Звук розблоковується кнопкою «🔊 Увімкнути звуки» в куті сцени; вимикачі — на пульті (для кімнати) і на сцені (для пристрою).

**Архітектура:** сервер не знає про звуки, крім вимикача ведучого: рушій тримає `GameState.soundsOff?: true`, зріз усіх ролей несе `soundsOff?: true`, подія `host:sounds`. Сцена виводить звуки з показаних зрізів і годинника сервера чистою функцією `stageCues(prev, view, serverNow)`: кожна подія має сталий ключ, хук `useStageSounds` пам'ятає зіграні ключі й грає кожен рівно раз; перший зріз після монтування лише запам'ятовується («що вже було — не грати»). Синтез — `apps/web/src/stage-sound.ts` через спільний контекст, винесений із сирени в `apps/web/src/audio.ts`.

**Технології:** TypeScript, zod 4, vitest (проєкти `shared`/`engine`/`server`/`web`), Fastify + Socket.IO, React 19 + Vite + Testing Library, Web Audio, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-18-stage-sounds-design.md` (38d) — уся.

## Глобальні обмеження

- Усі тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`. Нові uk-ключі — у новому списку `ADDED_STAGE_SOUNDS` у `apps/web/src/i18n.test.ts`; він — в умові `adds no uk keys beyond the agreed list` і в перевірці наявності в усіх локалях (як `ADDED_DUEL_BETS`). Множин немає. ru немає.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`).
- **Нічого, пов'язаного з росією**, — у фікстурах і e2e (запитання — природа, столиці не росії, українські річки).
- Звуки — **лише на сцені**: `useStageSounds` монтується тільки в `StageScreen`; телефони й пульт звуків 38d не грають (наявні мелодія, відео, сирена — як були).
- Звуки синтезуються Web Audio, **без файлів і чужих записів**. Гучність: сума підсилень нот, що звучать одночасно, ≤ 0,2 у будь-яку мить; кожен звук ≤ 1,5 с, фанфари ≤ 3 с; наростання ≥ 0,01 с (без клацань).
- Режим «Легко» (`family`) і світла тема на звуки не впливають.
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|engine|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів): паралельні vitest/e2e на цій машині падають за пам'яттю й портами.
- e2e: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 40"`; кадри — з `E2E_SHOTS=1`.
- Таймери запитань у фікстурах e2e ≥ 25 с (вкорочуємо час кнопкою ведучого «−15 с», а не фікстурою).
- **`GAME_STATE_VERSION` лишається 22.** У коментар до `READABLE_STATE_VERSIONS` (`restore.ts`, після рядка `39 без нової версії…`) додати: «40 без нової версії: необов'язкове GameState.soundsOff (ведучий вимкнув звуки сцени); старий знімок поля не має — звуки ввімкнено». Якщо виконавцю знадобиться обов'язкове поле стану чи зміна наявного — **зупинитися й спитати контролера** (підвищення обриває живі ігри; власника треба питати перед пушем).

## Рішення плану (там, де специфікація мовчить)

**Вимикач ведучого**
- Стан: `GameState.soundsOff?: true` (doc «Ведучий вимкнув звуки сцени (40); немає поля — увімкнено»). Рушій: `setSounds(state, on: boolean): Result` у новому `packages/engine/src/sounds.ts` — на **будь-якому етапі й на паузі** (це налаштування показу, не хід гри); те саме значення — `ok` без змін; `on: true` прибирає ключ.
- Зріз: `BaseView.soundsOff?: true` (doc «Звуки сцени вимкнув ведучий (40); ключ лише тоді») — у `base()` поряд із `family`; **у грі з автопілотом ключа немає ніколи** (`state.autopilot !== undefined` → без ключа), тож «вимикач ведучого вважається ввімкненим».
- Подія `host:sounds` з `soundsSchema = z.object({ on: z.boolean() })`; лише роль `host` (`if (!isHost) return FORBIDDEN`; автор автопілота — `forbidden`, бо вимикача ведучого в автопілоті немає). `HostAction` + `{ type: 'sounds'; on: boolean }`, `manager.host` → `this.apply(room, setSounds(state, action.on))`; у `PACED` не додається.
- Пульт: кнопка в шапці поряд із «👁 Наживо» — `🔔` + `live-toggle-label` «Звуки на сцені», `aria-pressed` = увімкнено, `title` — підказка; клік шле `host:sounds` з протилежним значенням. Пульт без сцени звуків не грає.

**Вимикач і розблокування на сцені**
- Пристрій: `quiz:stage-sounds` у localStorage, `'off'` — вимкнено, немає — увімкнено (`loadStageSounds(): boolean`, `saveStageSounds(on: boolean)`).
- Розблоковано = спільний контекст `running` (`audioReady()`). Розблоковує будь-який жест на сторінці (наявний `useSirenUnlock` у `Play.tsx` уже стоїть для сцени) і клік по кнопці.
- Кут сцени (`.stage-speech-buttons`, після `ThemeToggle`, на всіх етапах, зокрема `finished`) показує рівно одне:
  - Web Audio немає → нічого;
  - `soundsOff` → тихий підпис «Звуки вимкнув ведучий» (без кнопки);
  - пристрій увімкнено, не розблоковано → кнопка «🔊 Увімкнути звуки» (`btn btn-small stage-sounds-unlock`, вигляд як «🔊 Увімкнути звук» відеокліпу, приглушена як `.stage-theme`, повна яскравість на `:hover`/`:focus-visible`; фокусується пультом телевізора); клік → `unlockAudio()`;
  - інакше → перемикач «🔔 Звуки» (`btn btn-small stage-sounds-toggle`, `aria-pressed` = пристрій увімкнено); вимкнути → `saveStageSounds(false)`; увімкнути → `saveStageSounds(true)` і `unlockAudio()` у тому ж кліку.
- Звук грає, лише коли `!view.soundsOff && device && audioReady()`. **Події, що сталися, поки звук вимкнено чи не розблоковано, позначаються зіграними й потім не наздоганяються.**

**Які події й коли** (`stageCues(prev, view, serverNow)`; `q = \`${view.round?.index ?? -1}:${view.questionIndex}\``)
- **Розкриття:** `phase === 'reveal' && stats !== null && stats.accepted !== null` → `accepted > 0` ? `'correct'` : `'wrong'`, ключ `reveal:${q}`. Тож без звуку: опитування й «хмара» (`accepted: null`), фінал (`stats: null`), «Правда про гравця» під замком (`stats: null`); «100 до 1» — коли дошку відкрито. Дуель (етап `duel`) — без звуку розкриття.
- **Цокання:** `phase === 'question' && !paused && !held && remainingMs === null && endsAt !== null`, `s = secondsLeft(view, 0, serverNow)`, `1 ≤ s ≤ 5` → `'tick'`, ключ `tick:${q}:${endsAt}:${s}` (тобто п'ять цокань — на 5, 4, 3, 2, 1 с; «+15 с» чи пауза міняють `endsAt` — відлік знову чесний).
- **Гонг** (ключ `gong:${q}`, раз на запитання) — лише коли час **вичерпано**: (а) ті самі умови, що й для цокання, і `serverNow ≥ endsAt`; або (б) перехід: `prev` — те саме запитання на `question` з тими умовами, `view.phase !== 'question'` і `serverNow ≥ prev.endsAt − GONG_GRACE_MS` (`1000`) — сервер закрив запитання за часом раніше, ніж сцена встигла побачити нуль. Дострокове закриття ведучим чи «всі відповіли» гонгу не дає. Лише головний таймер запитання (класика, поле, бліц, драбина, «Ва-банк», «Вибування»); таймери дуелі, випробування, рішень, апеляції — без цокання й гонгу.
- **Акцент:** `splash !== null && ACCENT_SPLASHES.includes(splash.kind) && serverNow < splash.until && !paused`, `ACCENT_SPLASHES = ['round', 'final', 'duel', 'trial', 'blitz']` (без `question`/`cell` — вони на кожному запитанні, без `podium` — там фанфари), ключ `splash:${kind}:${at}`.
- **Фанфари:** `phase === 'finished'` → `'fanfare'`, ключ `fanfare` (у мить появи фінішу, разом із заставкою «Підсумки»/церемонією).
- **Звук іде за показаним зрізом:** `useStageSounds` отримує `view` після `useVerdictSuspense`, тож звук розкриття збігається з тим, що видно.

**Рівно один раз**
- `useStageSounds` живе в `StageScreen` (не в куті, що перемонтовується на `finished`), тримає `heard: Set<string>` у `useRef` і `prev` — попередній оцінений зріз.
- **Перша оцінка після монтування** лише додає всі поточні ключі в `heard` (сторінку перезавантажили на розкритті, на 3-й секунді відліку чи на фініші — нічого не звучить; відлік далі цокає з наступної секунди).
- Повторний рендер, новий об'єкт зрізу з тим самим змістом (перепідключення сокета), відновлення після перезапуску сервера (той самий етап, гра на паузі) — ключі вже в `heard`, нічого.
- Оцінка — на кожну зміну `view` і щосекундно-точним інтервалом `TICK_POLL_MS = 100`, поки `phase === 'question' && endsAt !== null && !paused`; час — `Date.now() + offsetMs`.

**Звуки** (`SOUND_NOTES: Record<StageSound, Note[]>`, `Note = { hz: number; toHz?: number; at: number; dur: number; wave: OscillatorType; gain: number }`; тембр і ноти — на розсуд виконавця в межах обмежень; орієнтир):
- `correct` — мажорне тризвуччя C5–E5–G5 (523,25 / 659,25 / 783,99 Гц), трикутник, вступи 0 / 0,06 / 0,12 с, ≈0,9 с;
- `wrong` — «бу-у»: два низькі трикутники 220 → 165 Гц і 165 → 123 Гц, ≈1,0 с;
- `tick` — синус 1800 Гц, 0,05 с, тихо (≈0,06);
- `gong` — негармонічні синуси 110 / 220 / 293 / 401 Гц з експоненційним згасанням ≈1,5 с;
- `fanfare` — трикутник G4–C5–E5 по 0,15 с і акорд C5–E5–G5–C6 ≈1,6 с, разом ≤ 2,8 с;
- `accent` — висхідний свіп 400 → 1200 Гц, 0,3 с.
- Кожна нота: `oscillator → gain → destination`, обвідна `0 → gain` за `0.01 с`, далі `exponentialRampToValueAtTime(0.0001)` до кінця, `stop` через 0,02 с після кінця, `onended` від'єднує вузли.
- `playStageSound(sound): boolean` грає **лише через спільний контекст у стані `running`**; немає контексту чи він `suspended` — `quietly(resume)`, тиша, `false` (без власного контексту, на відміну від сирени: запізнілий гонг гірший за тишу). Після розкладу — `window.dispatchEvent(new CustomEvent('quiz:stage-sound', { detail: sound }))` (спостереження для e2e й діагностики), `true`.

**Спільний аудіомодуль**
- Новий `apps/web/src/audio.ts` забирає з `siren.ts` `audioContextClass`, `quietly`, `playbackSession`, спільний контекст і розблокування: `audioSupported()`, `audioReady()`, `unlockAudio()` (тіло нинішнього `unlockSiren`), `sharedAudio(): AudioContext | null`, `subscribeAudio(listener): () => void` (повідомляє після `unlockAudio` і на `onstatechange` спільного контексту — для `useSyncExternalStore`).
- `siren.ts` лишає свій публічний інтерфейс: `sirenSupported = audioSupported`, `sirenReady = audioReady`, `unlockSiren = unlockAudio`; `playSiren` бере `sharedAudio()`. `siren.test.ts` і `useSirenUnlock` не змінюються й проходять.

## Порядок збирання

- Усі нові поля необов'язкові, тож `pnpm typecheck` зелений після кожної задачі.
- Залежності: 2 ← 1; 3 ← 2; 4 — незалежна; 5 ← 1, 4; 6 ← 3, 5; 7 — остання.

## Фокус рев'ю

1. **Жодного повтору.** Новий об'єкт того самого зрізу, перепідключення, `restart()` сервера на розкритті й на фініші, перезавантаження сцени посеред відліку — жодного другого звуку; увімкнення звуку після подій не грає «хвіст». Задачі 5, 7.
2. **Гонг лише за часом.** Ведучий закрив раніше чи всі відповіли — без гонгу й без решти цокань; сервер закрив за часом, а сцена не побачила нуля (зсув годинника, пропущений інтервал) — гонг рівно раз через перехід; пауза й «±15 с» посеред відліку — цокання за новим `endsAt`, гонг один. Задачі 5, 7.
3. **Тиша там, де треба.** Опитування, «хмара», фінал, «Правда про гравця» під замком — без звуку розкриття; автопілот — звуки є без вимикача; телефони не створюють осциляторів 38d і не мають подій `quiz:stage-sound`. Задачі 2, 5, 7.
4. **Вимикачі.** `soundsOff` пульта переживає перезапуск сервера; вимикач пристрою переживає перезавантаження сцени; поки будь-який вимкнено — нічого не звучить, кнопка «Увімкнути звуки» не з'являється під `soundsOff`. Задачі 2, 3, 6, 7.
5. **Вміщення й доступність.** Шапка пульта на 360 px з новою кнопкою без бокового скролу (після виправлення плану 39); кут сцени 1280×720 у темній і світлій темі — кнопка не перекриває вміст і реакції; кнопку видно з фокусом клавіатури/пульта ТВ. Задачі 6, 7.

---

### Задача 1. Спільне: подія `host:sounds` і `BaseView.soundsOff`

**Files:**
- Modify: `packages/shared/src/events.ts` — `soundsSchema` поряд із `liveWatchSchema`; подія в `ClientToServer` поряд із `host:live-watch`; `packages/shared/src/views.ts` — `BaseView.soundsOff?: true` (після `family?`).
- Test: тест подій (де `liveWatchSchema`/`cloudHideSchema`).

**Interfaces (Produces):**
```ts
/** Пульт: увімкнути чи вимкнути звуки сцени для кімнати (40). */
export const soundsSchema = z.object({ on: z.boolean() });
/** Звуки сцени для кімнати (40); лише роль host. */
'host:sounds': (payload: z.infer<typeof soundsSchema>, ack: Ack) => void;
// BaseView
/** Звуки сцени вимкнув ведучий (40); ключ лише тоді. У грі з автопілотом ключа немає. */
soundsOff?: true;
```

- [ ] **Step 1: Write the failing test** `soundsSchema takes only a boolean` — `{ on: true }`, `{ on: false }` — ок; `{}`, `{ on: 'yes' }`, `{ on: 1 }` → помилка.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2`. Expected: FAIL (`soundsSchema` не існує).
- [ ] **Step 3: Implement** за Interfaces.
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 40 stage sounds — a host:sounds event and an optional soundsOff key in every view"
```

---

### Задача 2. Рушій: `setSounds`, ключ у зрізі, відновлення

**Files:**
- Create: `packages/engine/src/sounds.ts`, `packages/engine/src/sounds.test.ts`
- Modify: `packages/engine/src/game.ts` — `GameState.soundsOff?: true` (doc як у «Рішеннях»); `packages/engine/src/views.ts` — у `base()` після `family`: `...(state.soundsOff === true && state.autopilot === undefined ? { soundsOff: true as const } : {})`; `packages/engine/src/index.ts` — `export * from './sounds'`; `packages/engine/src/restore.ts` — рядок коментаря з «Глобальних обмежень».

**Interfaces (Produces):**
```ts
/** Вимикач звуків сцени (40): будь-який етап, і на паузі; on — прибрати ключ. */
export function setSounds(state: GameState, on: boolean): Result;
```

- [ ] **Step 1: Write the failing tests** (`sounds.test.ts`; `lobbyWith(quiz, 'Оля', 'Петро')`, `must`, `startRound`):
  - `the host turns stage sounds off and on` — `setSounds(lobby, false)` → `state.soundsOff === true`; `stageView`, `hostView`, `playerView(…, 'p1')` мають `soundsOff: true`; `setSounds(…, true)` → ключа `soundsOff` немає ні в стані (`'soundsOff' in state === false`), ні в зрізах.
  - `any phase and a pause` — `ok` у `lobby`, `question`, на паузі (`pause`), `reveal`, `finished`.
  - `the same value is a no-op` — `setSounds(on, true)` на стані без ключа → `ok`, стан `toEqual` вихідному.
  - `a fresh game has no key` — `stageView(lobby)` без `soundsOff` (фікстури інших тестів не змінюються).
  - `autopilot ignores it` — стан з `autopilot` і `soundsOff: true` → `stageView` без ключа.
  - `a restore keeps it` — `suspend(withOff, now)` → `soundsOff === true`; знімок без ключа → без ключа.
- [ ] **Step 2: Run** `pnpm test --project engine --maxWorkers=2 packages/engine/src/sounds.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test --project engine --maxWorkers=2 && pnpm typecheck`. Expected: PASS (усі наявні тести зрізів — без змін).
- [ ] **Step 5: Commit**
```bash
git add packages/engine
git commit -m "feat(engine): 40 stage sounds — an optional soundsOff in the game state, any phase and on a pause, in every view but autopilot, kept by a restore"
```

---

### Задача 3. Сервер: `host:sounds`

**Files:**
- Modify: `apps/server/src/rooms/manager.ts` — `HostAction` + `{ type: 'sounds'; on: boolean }`, `case 'sounds': return this.apply(room, setSounds(state, action.on));`; `apps/server/src/socket.ts` — імпорт `soundsSchema`; `on('host:sounds', …)`: `if (!isHost) return FORBIDDEN;` → `safeParse` → `INVALID` чи `run({ type: 'sounds', on })`.
- Test: `apps/server/src/socket.test.ts`.

- [ ] **Step 1: Write the failing tests** (`socket.test.ts`, поряд із `host:cloud-hide`):
  - `host:sounds is host-only, validated and reaches the stage` — гравець → `forbidden`; сцена → `forbidden`; `{}` → `invalid_payload`; ведучий `{ on: false }` → `{ ok: true }`, наступний зріз сцени й пульта має `soundsOff: true`; `{ on: true }` → зріз сцени без ключа.
  - `host:sounds in an autopilot room` — автор (гравець кімнати-автопілота) → `forbidden`; зріз сцени без `soundsOff`.
  - `host:sounds on a pause` — гра на паузі, `{ on: false }` → `{ ok: true }`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/socket.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server
git commit -m "feat(server): 40 stage sounds — host:sounds turns the stage sounds off or on for the room, host only"
```

---

### Задача 4. Веб: спільний аудіомодуль і синтез звуків

**Files:**
- Create: `apps/web/src/audio.ts`, `apps/web/src/stage-sound.ts`, `apps/web/src/stage-sound.test.ts`
- Modify: `apps/web/src/siren.ts` — бере контекст і розблокування з `audio.ts`, публічний інтерфейс той самий (див. «Спільний аудіомодуль»).
- Test: `stage-sound.test.ts`; `siren.test.ts` — **без змін**, має пройти.

**Interfaces (Produces):**
```ts
// audio.ts
export function audioSupported(): boolean;
export function audioReady(): boolean;            // спільний контекст є і running
export function unlockAudio(): void;              // лише в жесті; тіло колишнього unlockSiren
export function sharedAudio(): AudioContext | null;
export function subscribeAudio(listener: () => void): () => void;
export function quietly(run: () => unknown): void;
export function playbackSession(): void;
// stage-sound.ts
export type StageSound = 'correct' | 'wrong' | 'tick' | 'gong' | 'fanfare' | 'accent';
export interface Note { hz: number; toHz?: number; at: number; dur: number; wave: OscillatorType; gain: number }
export const SOUND_NOTES: Record<StageSound, Note[]>;
export const STAGE_SOUND_EVENT = 'quiz:stage-sound';
export function playStageSound(sound: StageSound): boolean;
```

- [ ] **Step 1: Write the failing tests** (`stage-sound.test.ts`; `FakeAudioContext` як у `siren.test.ts`, з `exponentialRampToValueAtTime`, `onstatechange`; `vi.resetModules` перед кожним):
  - `every sound is short and moderate` — для кожного `StageSound`: `max(at + dur) ≤ 1.5` (для `fanfare` ≤ 3); у кожній точці з кроком 0,01 с сума `gain` нот, що звучать, ≤ 0,2; `gain > 0`, `dur > 0.01`.
  - `nothing plays before a gesture` — без `unlockAudio` → `playStageSound('correct') === false`, жодного `FakeAudioContext`, жодної події `quiz:stage-sound`.
  - `after a gesture the chord plays once through the shared context` — `unlockAudio()` (стан `running`) → `playStageSound('correct') === true`, осциляторів стільки, скільки нот `SOUND_NOTES.correct`, один контекст, одна подія з `detail === 'correct'`; кожен осцилятор `start`/`stop` рівно раз; підсилення стартує з 0 і росте за 0,01 с.
  - `a suspended context stays silent and is resumed` — контекст `suspended` → `false`, `resume` викликано, осциляторів немає.
  - `subscribeAudio hears the unlock and a state change` — слухач викликаний після `unlockAudio`; `ctx.onstatechange()` — ще раз; відписка — більше ні.
  - `without Web Audio — silence, no error` — `audioSupported() === false`, `playStageSound('gong') === false`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/stage-sound.test.ts apps/web/src/siren.test.ts`. Expected: FAIL лише `stage-sound.test.ts`.
- [ ] **Step 3: Implement** `audio.ts` (перенесення із `siren.ts` + `subscribeAudio`), `stage-sound.ts` за «Звуками».
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/stage-sound.test.ts apps/web/src/siren.test.ts apps/web/src/live/useSirenUnlock.test.tsx apps/web/src/live/AwayAlarm.test.tsx && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/audio.ts apps/web/src/stage-sound.ts apps/web/src/stage-sound.test.ts apps/web/src/siren.ts
git commit -m "feat(web): 40 stage sounds — a shared audio module out of the siren, synthesized chord, boo, tick, gong, fanfare and accent through the unlocked context only"
```

---

### Задача 5. Веб: події зі зрізів і хук «рівно раз»

**Files:**
- Create: `apps/web/src/live/stage-cues.ts`, `apps/web/src/live/stage-cues.test.ts`, `apps/web/src/live/useStageSounds.ts`, `apps/web/src/live/useStageSounds.test.tsx`
- Modify: `apps/web/src/storage.ts` — `STAGE_SOUNDS = 'quiz:stage-sounds'`, `loadStageSounds`, `saveStageSounds`.

**Interfaces:**
- Consumes: `secondsLeft` (`clock.ts`), `playStageSound`, `StageSound` (задача 4), `audioReady`, `audioSupported`, `unlockAudio`, `subscribeAudio` (задача 4), `StageView.soundsOff` (задача 1).
- Produces:
```ts
// stage-cues.ts
export interface SoundCue { sound: StageSound; key: string }
export const ACCENT_SPLASHES: readonly SplashKind[]; // ['round', 'final', 'duel', 'trial', 'blitz']
export const GONG_GRACE_MS = 1000;
export const TICK_FROM_S = 5;
export function stageCues(prev: StageView | null, view: StageView, serverNow: number): SoundCue[];
// useStageSounds.ts
export const TICK_POLL_MS = 100;
export interface StageSoundsControl { supported: boolean; hostOn: boolean; device: boolean; ready: boolean; unlock(): void; toggle(): void }
export function useStageSounds(view: StageView, offsetMs: number): StageSoundsControl;
// storage.ts
export const loadStageSounds: () => boolean;      // немає запису — true
export const saveStageSounds: (on: boolean) => void; // true — прибрати запис, false — 'off'
```

- [ ] **Step 1: Write the failing tests:**
  - `stage-cues.test.ts` (зріз-заготовка `stageView({ round: { index: 0 }, questionIndex: 1, … })`):
    - `a reveal with a correct answer` — `reveal`, `stats.accepted: 2` → `[{ sound: 'correct', key: 'reveal:0:1' }]`; `accepted: 0` → `wrong` з тим самим ключем; `accepted: null` → `[]`; `stats: null` → `[]`.
    - `ticks in the last five seconds` — `question`, `endsAt: 10_000`: `serverNow 4_999` → `[]`; `5_000` → `tick:0:1:10000:5`; `5_500` → той самий ключ; `6_000` → `…:4`; `9_000` → `…:1`; `paused: true` → `[]`; `remainingMs: 3000` → `[]`; `held: true` → `[]`; `endsAt: null` → `[]`.
    - `a gong when time runs out` — `question`, `serverNow 10_000` → `[{ sound: 'gong', key: 'gong:0:1' }]` (без цокання); `12_000` → той самий ключ.
    - `a gong on a lock the stage did not see coming` — `prev` `question` `endsAt 10_000`, `view` `locked`, `serverNow 9_200` → гонг `gong:0:1`; `serverNow 8_000` → `[]` (ведучий закрив раніше); `prev` — інше запитання (`questionIndex 0`) → `[]`.
    - `an accent on a round splash` — `splash { kind: 'round', at: 0, until: 3500 }`, `serverNow 1000` → `[{ sound: 'accent', key: 'splash:round:0' }]`; `serverNow 3600` → `[]`; `kind: 'question'`, `'cell'`, `'podium'` → `[]`; `paused` → `[]`.
    - `fanfare on the finish` — `finished` → `[{ sound: 'fanfare', key: 'fanfare' }]`.
  - `useStageSounds.test.tsx` (`vi.mock('../stage-sound')` → `playStageSound = vi.fn(() => true)`; `vi.mock('../audio')` → `audioReady` керований, `audioSupported: true`; фальшивий час `vi.useFakeTimers`; `renderHook(({ view }) => useStageSounds(view, 0), …)`):
    - `the first view is only remembered` — монтування на `reveal` з `accepted: 1` → `playStageSound` не викликано; `rerender` з новим об'єктом того самого зрізу → не викликано.
    - `a new reveal plays once` — `question` → `reveal` (accepted 1) → `playStageSound('correct')` рівно раз; ще три `rerender` з копіями (перепідключення) → і далі один виклик.
    - `five ticks and one gong` — `question`, `endsAt = now + 7000`; `vi.advanceTimersByTime(8000)` → виклики по порядку: `tick` × 5, `gong` × 1; потім `locked` → більше нічого.
    - `an early lock has no gong` — `question` з 20 с, на 8 с — `locked` → жодного виклику.
    - `muted events are not replayed` — `soundsOff: true` на розкритті → нічого; `soundsOff` прибрано на тому самому розкритті → нічого; наступне розкриття → один звук. Те саме з `saveStageSounds(false)` (пристрій) і з `audioReady() === false`.
    - `the control` — `hostOn` = `!soundsOff`; `device` з localStorage; `toggle()` при `device` → `quiz:stage-sounds === 'off'`, `device: false`; `toggle()` ще раз → запису немає, `unlockAudio` викликано; `unlock()` → `unlockAudio`.
  - `storage` (у наявному тесті сховища): `loadStageSounds()` без запису → `true`; `saveStageSounds(false)` → `'off'`, `false`; `saveStageSounds(true)` → запис прибрано.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/live/stage-cues.test.ts apps/web/src/live/useStageSounds.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `stageCues` за «Які події й коли»; `useStageSounds` за «Рівно один раз» (`heard`/`prev` у `useRef`, `ready` через `useSyncExternalStore(subscribeAudio, audioReady)`, інтервал лише на відліку, очищення на демонтуванні).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/live apps/web/src/storage.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/live apps/web/src/storage.ts apps/web/src/storage.test.ts
git commit -m "feat(web): 40 stage sound cues — a reveal, five ticks, a gong only when time runs out, splash accents and a fanfare from the shown views and the server clock, each once, nothing on the first view"
```

---

### Задача 6. Веб: кут сцени, вимикач пульта, тексти

**Files:**
- Create: `apps/web/src/screens/StageSounds.tsx`, `apps/web/src/screens/StageSounds.test.tsx`
- Modify:
  - `apps/web/src/screens/StageScreen.tsx` — `const sounds = useStageSounds(view, offsetMs)` на рівні екрана (показаний `view`); `<StageSoundsButton control={sounds} />` дитиною `StageSpeech` і в гілці `finished` поряд із `ThemeToggle`;
  - `apps/web/src/screens/StageSpeech.tsx` — необов'язкові `children`, що стають у `.stage-speech-buttons` після `ThemeToggle`;
  - `apps/web/src/screens/HostScreen.tsx` — кнопка в шапці (див. «Вимикач ведучого»), `send('host:sounds', { on: view.soundsOff === true })`;
  - `apps/web/src/styles.css` — `.stage-sounds-unlock` (приглушена, як `.stage-theme`, яскрава на `:hover`/`:focus-visible`), `.stage-sounds-off` (дрібний `meta`); кольори — змінні теми;
  - `apps/web/src/i18n.ts` + 6 локалей; `apps/web/src/i18n.test.ts` — `ADDED_STAGE_SOUNDS`.
- Test: `StageSounds.test.tsx`, `StageScreen.test.tsx`, `HostScreen.test.tsx`, `i18n.test.ts`.

**Тексти (uk):** `stageSoundsUnlock` «🔊 Увімкнути звуки»; `stageSoundsToggle` «🔔 Звуки»; `stageSoundsOffByHost` «Звуки вимкнув ведучий»; `hostSounds` «Звуки на сцені»; `hostSoundsHint` «Короткі звуки на сцені: розкриття, останні секунди, гонг, фанфари». `ADDED_STAGE_SOUNDS = ['stageSoundsUnlock', 'stageSoundsToggle', 'stageSoundsOffByHost', 'hostSounds', 'hostSoundsHint']`.

**Interfaces:**
- Consumes: `StageSoundsControl`, `useStageSounds` (задача 5).
- Produces: `export function StageSoundsButton({ control }: { control: StageSoundsControl }): JSX.Element | null;`

- [ ] **Step 1: Write the failing tests:**
  - `StageSounds.test.tsx`: `unsupported — nothing` (`supported: false` → порожньо); `host off — a quiet note` (`hostOn: false` → «Звуки вимкнув ведучий», кнопок немає); `locked — the unlock button` (`device: true, ready: false` → кнопка «🔊 Увімкнути звуки», клік → `unlock`); `ready — a pressed toggle` (`ready: true` → «🔔 Звуки» з `aria-pressed="true"`, клік → `toggle`); `device off — an unpressed toggle` (`device: false, ready: false` → «🔔 Звуки» `aria-pressed="false"`, без кнопки розблокування).
  - `StageScreen.test.tsx`: `the stage corner offers sounds in the lobby and at the finish` — `lobby` і `finished` → кнопка «🔊 Увімкнути звуки» в `.stage-speech-buttons`; `soundsOff: true` → «Звуки вимкнув ведучий».
  - `HostScreen.test.tsx`: `the host switches the stage sounds` — кнопка «Звуки на сцені» `aria-pressed="true"`, клік → `send('host:sounds', { on: false })`; з `soundsOff: true` — `aria-pressed="false"`, клік → `{ on: true }`.
  - `i18n.test.ts`: `ADDED_STAGE_SOUNDS` у списку дозволених і в перевірці всіх 6 локалей.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/screens/StageSounds.test.tsx apps/web/src/screens/StageScreen.test.tsx apps/web/src/screens/HostScreen.test.tsx apps/web/src/i18n.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 40 stage sounds on screen — an unlock button and a device switch in the stage corner, a room switch in the host header, texts in 7 languages"
```

---

### Задача 7. Наскрізні сценарії й кадри (`part40-stage-sounds.e2e.ts`)

**Files:**
- Create: `apps/server/e2e/part40-stage-sounds.e2e.ts` (структура `it(… try/catch snapshot …, 600_000)`, `useE2eServer()`, помічники `open`, `join`, `expectNoSideScroll`, `socketFrames`, `shot`, `restart`, `pilotPlayer`, `createAutopilot` з `helpers`).

**Підмінний звук** — `FAKE_AUDIO_INIT` (рядок для `addInitScript`, як `AWAY_PHONE_INIT`), ставиться **до** `goto` на сцену й кожен телефон: замінює `AudioContext` і `webkitAudioContext` класом з `state` (`'suspended'`, `resume()` → `'running'` і `onstatechange`), `currentTime` від `performance.now()`, `destination`, `createOscillator`/`createGain`/`createBuffer`/`createBufferSource` (усі методи розкладу — пусті функції; `start` осцилятора збільшує лічильник), `close`; `window.__audio = { contexts: 0, oscillators: 0, sounds: [] }`; слухач `quiz:stage-sound` дописує `{ sound: detail, at: Date.now() }`. Помічник `sounds40(page): Promise<string[]>` — `__audio.sounds.map(s => s.sound)`.

**Вікторина e2e:** раунд 1 «класика», 3 запитання, таймери 25 с: q1 single «Яка річка тече через Київ?» (Дніпро), q2 boolean «Чи є Ейфелева вежа в Римі?» (правильно «ні»), q3 single «Найбільший океан?» (Тихий); раунд 2 «класика», 1 запитання — опитування (без балів) «Яка пора року вам до вподоби?».

**Сценарії:**
1. `it('part 40: stage sounds — the unlock button, one sound per event, five ticks and a gong on time, splash accents, a fanfare, silence on phones')`:
   - сцена 1280 × 720, пульт 1280, телефони Оля 360, Петро 375 — усі з `FAKE_AUDIO_INIT`; у лобі в куті сцени — «🔊 Увімкнути звуки»; кадр `sounds40-unlock-stage`;
   - старт до кліку: заставка раунду → `sounds40(stage)` порожньо (не розблоковано — і потім не наздоганяє); клік по кнопці → вона зникає, «🔔 Звуки» `aria-pressed="true"`; кадр `sounds40-toggle-stage`;
   - q1: Оля відповідає правильно, Петро мовчить; ведучий «−15 с» → чекаємо кінця часу → рівно `tick` × 5, потім `gong` × 1, інтервали між цоканнями 1 с ± 0,3 с; ведучий «Розкрити» → `correct` × 1;
   - q2: обидва «так» (усі відповіли — запитання закрилося раніше) → жодного `tick`/`gong`; розкриття → `wrong` × 1;
   - q3: ведучий «Закрити» достроково на 15-й секунді → без `gong`; розкриття (Петро правильно) → `correct`;
   - раунд 2: заставка раунду → `accent` × 1; опитування → на розкритті без звуку;
   - фініш → `fanfare` × 1; кадр `sounds40-finished-stage`; `stage.reload()` → після появи фінішу список звуків не виріс;
   - у підсумку на сцені точний список: `['tick'×5, 'gong', 'correct', 'wrong', 'correct', 'accent', 'fanfare']`;
   - телефони: `__audio.oscillators === 0` і `sounds40(phone)` порожньо; пульт — так само.
2. `it('part 40: stage sounds — the host switch and the stage switch mute, a restart and a reconnect repeat nothing, an autopilot room plays')`:
   - розблокована сцена; ведучий тисне «Звуки на сцені» → `aria-pressed="false"`, на сцені «Звуки вимкнув ведучий», кнопок звуку немає; розкриття q1 → нічого; кадр `sounds40-host-off` (пульт 360 px: `expectNoSideScroll(host, …)`);
   - `restart()` сервера → після відновлення вимикач і далі вимкнено (`soundsOff` у кадрах `socketFrames(stage)`); ведучий вмикає → q2 розкриття → `wrong` × 1;
   - сцена: «🔔 Звуки» → `aria-pressed="false"`, `localStorage['quiz:stage-sounds'] === 'off'`; `stage.reload()` — і далі вимкнено; q3 розкриття → нічого; увімкнути (клік) → наступне розкриття звучить;
   - повтор: на розкритті `restart()` → після відновлення (пауза, той самий етап) і після перепідключення сцени (`stage.context().setOffline(true)` → `false`) кількість звуків та сама;
   - автопілот: окрема кімната з автопілотом (`createAutopilot`, гравці через `pilotPlayer`), сцена з `FAKE_AUDIO_INIT`, клік «Увімкнути звуки» → заставка раунду `accent`, розкриття `correct`/`wrong`, фініш `fanfare` — кожен рівно раз; `soundsOff` у кадрах сцени немає.
3. `it('part 40: stage sounds — the corner fits 1280×720 in dark and light theme, the host header fits 360 px')` — сцена 1280 × 720 на `question` з 24 гравцями (через сокети, імена без російського, частина до 24 символів) і реакціями: кнопка звуку всередині вікна, не перетинає `.stage-main`, таймер і смугу реакцій (прямокутники `getBoundingClientRect`); світла тема (`quiz:theme = light`, `is-light` на `<html>`) — кнопка має видимий контраст; фокус клавішею Tab доходить до кнопки (`:focus-visible`); пульт 360 × 740 у лобі й на `question` — `expectNoSideScroll`; кадри `sounds40-24-stage`, `sounds40-light-stage`, `sounds40-host-360`.

- [ ] **Step 1: Write the scenarios.**
- [ ] **Step 2: Run** `pnpm build`, потім (після завершення збирання) `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 40"` з `E2E_SHOTS=1` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 3: Переглянути кадри:** кнопка в куті непомітна, але читається в обох темах; нічого не перекриває; шапка пульта на 360 px без переповнення.
- [ ] **Step 4: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 40 — stage sounds behind an unlock button, one sound per event, five ticks and a gong only on time, accents, a fanfare, host and stage switches, a restart and a reconnect repeat nothing, autopilot, silent phones, 1280×720, 360 px host, light theme"
```
