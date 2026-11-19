# План 60: невеликі правки гри — прийняте оскарження не згорає, курсор одразу в полі відповіді, у блефі можна змінити свою вигадку (45)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** Форма `GameState`, `SavedRoom` і зрізів не змінюється. 45a міняє лише правило підрахунку (`appealCounted`), яке читає наявне `Appeal.outcome`; лічильника «використано апеляцій» у стані немає й не буде. 45c додає подію й функцію рушія, що **видаляє** ключ гравця з наявного `BluffPlay.lies` (`Record`), — нового поля немає. 45b — лише веб. Якщо виконавцю знадобиться нове поле в `GameState`, `Play`, `BluffPlay`, `Appeal` чи `SavedRoom` — **зупинитися й спитати контролера** (підняття версії потребує згоди власника перед пушем).

> **Міграцій немає** (ні БД, ні знімків). Знімок, збережений до розгортання, після нього рахує апеляції за новим правилом сам — див. «Рішення плану», 45a, «Старі знімки».

> **Звірка з кодом.** План спирається на `main` 2026-11-19 (`a08d54d0`, після специфікації 45). План 57 будується в `.superpowers/worktrees/plan57` — **його дерева не торкатися**. Плани 57–59 (адмінка) правлять `apps/web/src/i18n.ts`, `locales/*.json`, `i18n.test.ts`, `styles.css`: якщо вони злиті раніше — додати свої рядки поруч і розв'язати конфлікт, залишивши обидва. Опорні місця:
> - апеляції: `packages/shared/src/appeal.ts` (`APPEALS_PER_GAME = 2`, `appealCounted(outcome)` ~27 — зараз `true` для `null`, `yes`, `no`, `tie`), `packages/shared/src/appeal.test.ts` ~13; `packages/engine/src/appeal.ts` — `appealsLeft` ~78 (раховані + своя в черзі 29k), `appealReasons` ~142 (одна апеляція на учасника на запитання), `openAppeal` ~207 (`appeals_used`), `openQueued` ~246, `decideAppeal` ~290 (`appealDecision` → `yes`/`no`/`tie`; `yes` + `grade` дописує рядок `'appeal'`), `closeAppealByHost` ~340 (`host`), `cancelAppeal` (`cancelled`), `playerAppeal` ~436 (`PlayerAppeal.left`); `autopilot.ts` ~330 (`appealPossible` → вікно `appealWindow`); тести `appeal.test.ts` (`describe('limits')` ~274), `appeal.flow.test.ts`, `appeal.queue.test.ts`, `views.appeal.test.ts`, `autopilot.appeal.test.ts`; веб — `apps/web/src/appeal-text.ts` (`appealResultText`, `appealButtonText`), `screens/PlayerScreen.tsx` ~1760–1775 (кнопка `.appeal-button`, `AppealCard size="phone"`), `screens/AppealSheet.tsx`; `PlayerTeam.teamId` (`packages/shared/src/views.ts` ~1104) — учасник рушія в командній грі;
> - блеф: `packages/engine/src/bluff.ts` — `writeLie` ~50 (`already_answered`, `bluff_truth`, `type_mismatch`, `time_over`, `paused`, `not_started`), `bluffAuto` ~116 (`everyoneWrote` → `startChoice`), `startChoice` ~74; тести `game.bluff.test.ts` (`toChoice()` ~41, `openClassic`, `at(s, ms)`); сервер — `rooms/manager.ts` `lie(room, playerId, text)` ~2224 (`this.act(room, playerId, 'answerer')`), `socket.ts` `on('player:lie')` ~699, зразок події без даних — `on('player:hint')` ~849; `packages/shared/src/events.ts` ~347 (`'player:lie'`), ~309 (`'player:hint': (ack: Ack) => void`); тести `socket.test.ts` ~1310–1360 (`bluffGame()`, `meBluff`), `rooms/manager.drafts.test.ts` ~208; веб — `PlayerScreen.tsx` `BluffPlay` ~253 (`mine.lie === null` → `BluffLieInput`, інакше `bluffLieSent`), `screens/BluffLieInput.tsx`;
> - поля відповіді на телефоні: `screens/AnswerInput.tsx` `TypedInput` ~113 (`autoFocus = true` → атрибут `autoFocus` ~147; text, numeric, clues, melody, videoclip, thinkalike), `CloudInput.tsx`, `SurveyInput.tsx` (`autoFocus && index === 0`), `BluffLieInput.tsx` (`autoFocus`), `SpyPhone.tsx` `SpyTextForm` (`autoFocus`), `ThinkView.tsx` `ThinkInput` ~53 (ранні `return` для `spectator`/`out` — хуки до них), `TimedListView.tsx` `TimedListPlay`, `LetterWordsView.tsx` `LetterWordsPlay`, `WordLadderView.tsx` `WordLadderPlay`, `ChainView.tsx` `ChainPlay`, `DuelView.tsx` поле дуелі ~178 (`disabled={!enabled}`); `PlayerScreen.tsx` ~793–795: `notStarted` (заставка запитання) → `locked` → `<fieldset className="inputs" disabled={locked …}>` навколо `AnswerInput` ~1497 і бліцу ~1411; `SnippetView.tsx` ~140 і `Buffs.tsx` ~578 передають `autoFocus={false}`; `apps/web/src/motion.ts` `reducedMotion()`;
> - знімки: `packages/engine/src/restore.ts` (`GAME_STATE_VERSION = 22`), `restore.test.ts` (`roundTrip` ~199, `suspend`, `backAt`, `HOUR`, список ключів `GameState` ~1260, `describe('52 snapshots')` ~2861 — зразок);
> - довідка: `apps/web/src/help/help-uk.ts` (`setting.appeal.points.1` ~1044, `question.bluff.how.1`/`how.2` ~386–387), `locales/{en,de,es,it,pl,ar}.help.json`, `help/__fixtures__/help-uk-golden.json` (тест `help-golden.test.ts` звіряє кожен запис uk із золотим);
> - e2e: `apps/server/e2e/part12f-i-appeal-resume-captain-powers.e2e.ts` (`appeal12f` ~100–360: крок 5 ~241 чекає «лишилось 1», крок 6 ~280–295 — «Оля got a third appeal» = 0; `appealQueue29k` ~376 — зразок автопілота з сокетом автора: `createAutopilot`, `pilotSocket`, `join`, `afterSplash`, `frame`), `part10f-j-bluff-wipeout-survival-ladder-teams.e2e.ts` (`it('part 10f: …')` ~24, фікстура блефу), `part55-sticky-timer.e2e.ts` (світла тема ~106: `addInitScript(() => localStorage.setItem('quiz:theme', 'light'))`, перевірка `is-light` ~42), `helpers/common.ts` (`open`, `join`, `pilotPlayer`, `emitOk`, `frame`, `expectNoSideScroll`, `POLL`, `exact`).
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

**Мета:** прийняте оскарження (зал сказав «так» чи ведучий сам зарахував) не витрачається, ліміт рахує лише відхилені; поле відповіді на телефоні отримує фокус, щойно стає доступним на новому запитанні (зокрема після заставки); у блефі гравець може натиснути «Змінити» й переписати свою вигадку, доки триває етап письма.

**Архітектура:** 45a — одна зміна правила в `@quiz/shared` (`appealCounted`), яку вже читають `appealsLeft`, `openAppeal`, `openQueued`, `appealPossible`, `playerAppeal` і автопілот; веб показує власнику прийнятої апеляції рядок «Оскарження прийнято — воно лишається у вас». 45b — новий хук `useAnswerFocus` у вебі замість атрибута `autoFocus`: він фокусує поле один раз за монтування, коли поле вперше не вимкнене (атрибут `autoFocus` спрацьовує при монтуванні, коли `fieldset` ще вимкнений заставкою, і фокус губиться — це і є причина скарги). 45c — `editLie` у рушії видаляє вигадку гравця з `lies`; подія `player:lie-edit`; на телефоні — кнопка «Змінити», поле знову відкривається з попереднім текстом.

**Технології:** TypeScript, zod 4, Fastify + socket.io, vitest (проєкти `shared`/`engine`/`server`/`web`), React 19 + Testing Library, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-19-small-game-fixes-design.md` (45); основа апеляцій — план 12f і черга 29k, блеф — план 10f.

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22**; форма `GameState`, `Play`, `BluffPlay`, `Appeal`, `SavedRoom`, зрізів — без змін; список ключів `GameState` у `restore.test.ts` ~1260 не міняється.
- **Міграцій немає**; історія ігор (`GameAppeal` у БД) не змінюється.
- Усі тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`; довідка — `help/help-uk.ts` + `locales/{en,de,es,it,pl,ar}.help.json` + золотий `help/__fixtures__/help-uk-golden.json`. Нові uk-ключі — у новому списку `ADDED_SMALL_FIXES_60` у `i18n.test.ts`: в умову `adds no uk keys beyond the agreed list` і в перевірку наявності й непорожності в усіх локалях (як `ADDED_STICKY_TIMER_55`). ru немає.
- Кириличні літерали в `apps/web/src/` — лише в словниках і тестах (`source-scan.test.ts`).
- **Нічого, пов'язаного з росією**, — у фікстурах, вигадках блефу, ніках, e2e.
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|engine|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm exec tsc -p <пакет>` у задачах 1–2, з задачі 3 — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів vitest).
- Файли правити лише Edit/Write чи `sed`; **python3 на цій машині — порожня заглушка, ним нічого не правити й не генерувати**; після коміту — `git show --stat` (перевірити, що зміни справді в коміті).
- Робоче дерево — лише `C:\ClaudeCode\quiz\.superpowers\worktrees\plan60`; жодних файлів поза `C:\ClaudeCode\quiz` (тимчасові — у `.superpowers` чи scratchpad сесії). Дерева `plan57` не торкатися.
- e2e: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 60"`; телефон 360 × 740, світла тема (`quiz:theme = light`, `is-light` на `<html>`); після — по одному `-t "part 12f"`, `-t "part 29k"`, `-t "part 10f"`, `-t "part 55"`.
- Таймер кожного запитання у фікстурах і e2e ≥ 25 с; у фікстурах «так/ні» — приблизно половина «ні».

## Рішення плану (там, де специфікація мовчить)

**45a. Підрахунок апеляцій (`packages/shared/src/appeal.ts`)**
- `appealCounted(outcome: AppealOutcome | null): boolean` = `outcome === null || outcome === 'no' || outcome === 'tie'`. Отже: **відкрита** (`null`) і **в черзі** (29k, як і зараз через `appealQueued`) тимчасово займають місце — «лишилось N» під час голосування на одну менше, а після прийняття місце повертається; **`yes`** (зал прийняв, підстава `grade` чи `away`) — не рахується; **`host`** (ведучий зарахував) і **`cancelled`** — не рахуються, як і зараз; **`no`** і **`tie`** (нічия = відповідь лишається як була) — відхилені, рахуються.
- Ім'я, сигнатура й місця виклику не змінюються: `appealsLeft`, `openAppeal` (`appeals_used`), `openQueued`, `appealPossible`, `playerAppeal`, автопілот (`appealWindow`) підхоплюють правило самі. Коментарі `APPEALS_PER_GAME` і `appealCounted` — оновити («рахуються відхилені: no і tie; відкрита й у черзі тримають місце до рішення»).
- Обмеження «одна апеляція на учасника на запитання» (`appealReasons` ~152) **лишається**: прийнята апеляція не дає оскаржити те саме запитання вдруге. Нескінченних апеляцій немає — щонайбільше одна на запитання.
- «Так», чиї бали ведучий потім скасував у «↶ Бали» (`appealUndone`), — **не рахується**: рішення залу було «прийнято», правило читає лише `outcome`.
- **Старі знімки.** Лічильника використаних апеляцій у стані немає: `appealsLeft` щоразу рахує з `state.appeals[].outcome`. Кімната, збережена до розгортання, після відновлення рахує за новим правилом: гравець, чию апеляцію зал уже прийняв у цій грі, отримує її назад (наприклад, `[yes, no]` → було 0, стане 1). Ні перетворення, ні версії не треба; це закріплює тест знімка в задачі 1.
- Веб: `appealKeptText(view: AppealView, participantId: string): string | null` у `apps/web/src/appeal-text.ts` — `t('appealKeptMine')`, якщо `view.outcome === 'yes' && !view.undone && view.by.playerId === participantId`, інакше `null`. `participantId` на телефоні = `view.team?.teamId ?? me.id` (у командній грі апеляція належить команді — рядок бачать усі її люди). Рядок — `<p className="meta appeal-kept">` одразу під `AppealCard size="phone"` у `PlayerScreen.tsx`; на сцені й пульті його немає. Лише для `yes`: апеляція `host` і далі показує наявне «⚖️ Зараховано ведучим» (див. «Розбіжності», п. 2).

**45b. Фокус поля відповіді (`apps/web/src/live/useAnswerFocus.ts`)**
- `export function useAnswerFocus(ref: RefObject<HTMLInputElement | HTMLTextAreaElement | null>, allowed = true): void` — `useEffect` **без масиву залежностей** (бере кожен рендер), з `done = useRef(false)`:
  1. `done.current` чи `!allowed` → нічого;
  2. `el = ref.current`; `null` → нічого (поле не показане: глядач, вибув, відповідь надіслана);
  3. `el.disabled || el.closest('fieldset[disabled]') !== null` → нічого (заставка, пауза, «Мелодія» до першого шматка) — **спробує на наступному рендері**;
  4. `active = document.activeElement`; якщо `active !== el` і `active` — інше поле (`input`, `textarea`, `select` чи `[contenteditable="true"]`) → `done.current = true` й нічого (гравець друкує деінде — фокус не крадемо);
  5. `el.focus({ preventScroll: true })`, потім `el.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })`; `done.current = true`.
- «Один раз за запитання» = один раз за монтування: поля телефона монтуються заново на кожному запитанні (фаза `question` розмонтовує все при переході в `locked`/`reveal`; `AnswerInput`, `ThinkInput`, `TimedListPlay`, `LetterWordsPlay`, `WordLadderPlay`, `SpyPhone` мають `key` з `questionIndex`). Нове монтування в межах запитання — це нове поле (бліц-позиція, друга спроба бафа, етап «останній шанс» шпигуна, «Змінити» в блефі) — тоді фокус доречний.
- Де стоїть хук (атрибут `autoFocus` на цих полях **прибрати** — інакше подвійна спроба при монтуванні): `TypedInput` (`allowed = autoFocus`, типово `true`), `CloudInput` (`autoFocus`), `SurveyInput` (перше поле; `allowed = autoFocus`), `BluffLieInput` (`autoFocus`), `SpyTextForm`, `ThinkInput` (виклик **до** ранніх `return`), `TimedListPlay`, `LetterWordsPlay`, `WordLadderPlay`, `ChainPlay`, поле дуелі в `DuelView.tsx` (стає доступним, коли черга дуелянта, — фокус при першій доступності). `SnippetView` (`autoFocus={false}`, «Мелодія»/«Відеокліп») і аркуш голосу в `Buffs.tsx` лишаються без фокуса.
- Без фокуса (не змінюються): «Вгадай слово» (власна клавіатура, поля немає), кросворд і судоку (сітка клітинок), «Квест із кодом» (бічна панель на весь раунд), факт «Правди» в лобі, ставки й аукціон (не поле відповіді), вибір варіантів, мапа, повзунок, порядок, пари. Пульт і сцена хука не імпортують.
- Доступність: фокус на `input` з видимою міткою (`label`/`aria-label`) — читач екрана оголошує мітку сам; живих регіонів не додаємо.

**45c. Блеф: «Змінити»**
- Рушій (`bluff.ts`): `export function editLie(state: GameState, playerId: string, now: number): Result` — перевірки в порядку: `state.phase !== 'question'` чи етап не `lies` → `wrong_phase`; `state.paused` → `paused`; `notStarted(state, now)` → `not_started`; гравця немає → `not_found`; вигадки гравця немає → `not_found`; `state.startedAt === null || timeOver(state, play, now)` → `time_over`. Успіх — `ok(withCurrentPlay(state, { ...play, bluff: { ...play.bluff, lies: <без ключа playerId> } }))`. `bluffAuto` **не** кличе (видалення не може закрити етап). Нова вигадка — звичайний `writeLie` з тими самими перевірками (`bluff_truth`, `type_mismatch`, ліміт `LIMITS.bluffLie` у схемі) і новим `at`; закриття «всі написали» — те саме `bluffAuto` у `writeLie`: гравець після «Змінити» вважається таким, що не написав, доки не надішле знову.
- Коментар `writeLie` («Одна вигадка на гравця: змінити не можна») → «Одна вигадка на гравця; змінити — editLie, потім writeLie». `already_answered` у `writeLie` лишається (повторне надсилання без «Змінити»).
- Спільне: `packages/shared/src/events.ts` — `'player:lie-edit': (ack: Ack) => void;` поруч із `'player:lie'` (без даних, як `player:hint`).
- Сервер: `RoomManager.lieEdit(room: Room, playerId: string): AckResult` — як `lie` (`alive`, `this.act(room, playerId, 'answerer')` — у командній грі змінює вигадку команди відповідач/капітан) → `this.apply(room, editLie(room.state, who.id, this.now()))`; `socket.ts` — `on('player:lie-edit', () => …)` як `player:hint` (лише `role === 'player'`, інакше `FORBIDDEN`).
- Веб (`PlayerScreen.tsx` `BluffPlay`): коли `mine.lie !== null` на етапі `lies` — рядок `bluffLieSent` і кнопка `<button type="button" className="btn btn-small bluff-edit">{t('bluffLieEdit')}</button>` (`disabled={paused || busy}`, через `useGuardedSend(send, …)` → `'player:lie-edit'`). Останню свою вигадку `BluffPlay` тримає в `useRef<string>` (оновлюється, щойно `mine.lie !== null`); коли `mine.lie` стає `null`, `BluffLieInput` монтується з новим пропом `initial={lastLie.current}` (`useState(initial)`; типово `''`) і отримує фокус (45b), курсор — у кінці тексту (`setSelectionRange(len, len)` у хуку не робимо: браузер ставить курсор у кінець при `focus()` на полі з `value` — достатньо). Відмова `player:lie-edit` — `errorText` у `role="alert"` під кнопкою.
- Ведучий і сцена не міняються: лічильник «Вигадали n з m» просто зменшується на час редагування; список вигадок пульта показує нову, коли її надіслано.

**Нові тексти (uk; 6 інших мов — переклад за змістом):**
- `appealKeptMine: 'Оскарження прийнято — воно лишається у вас'`;
- `bluffLieEdit: 'Змінити'`;
- довідка `setting.appeal.points.1`: `'Ліміт — {appealsPerGame} відхилені апеляції за гру на гравця чи команду. Апеляція, яку зал прийняв, не витрачається: після неї можна оскаржувати знову (одне запитання — одна апеляція). Нічия — теж відхилена.'`;
- довідка `question.bluff.how.2`: `'Фаза закінчується, коли всі написали, сплив час або ви натиснули «До вибору». Поки фаза триває, гравець може натиснути «Змінити» й написати іншу вигадку; доки не надішле знову, він вважається таким, що ще не написав.'`.

## Порядок збирання

- 1 → 2 → 3 → 4 → 5. Залежності: 4 ← 1, 2, 3 (тексти й UI на готових рушії, події й хуку); 5 — остання. Задачі 1 і 2 незалежні між собою, 3 — від обох.

## Фокус рев'ю

1. **Відкрита й у черзі займають місце, рішення його повертає чи забирає.** Гравець з одною відхиленою: під час голосування за другу — «лишилось 0» і `appeals_used` для третьої в черзі; зал сказав «так» — знову «лишилось 1». Задача 1.
2. **Старий знімок з прийнятою апеляцією** відновлюється без перетворень і рахує за новим правилом (`[yes, no]` → `appealsLeft` 1); автопілот після прийнятої апеляції знову тримає `appealWindow`, бо `appealPossible` тепер `true`. Задача 1.
3. **Фокус не краде й не губиться.** Поле під заставкою не фокусується, після її кінця — фокусується; на паузі не фокусується, після паузи — так; якщо гравець уже друкує в іншому полі (квест) — фокус лишається там; оновлення зрізу (новий рендер) не повертає фокус у поле, з якого гравець пішов. Задача 3.
4. **«Змінити» й закриття етапу.** Троє: двоє написали, третій пише після того, як перший натиснув «Змінити», — етап лишається `lies`; перший надсилає нову — `choice`, і серед варіантів нова вигадка, а старої немає; «Змінити» на паузі, на етапі вибору, після часу — відмова без зміни стану. Задачі 2, 5.
5. **Командна гра.** «Змінити» вигадку команди може лише той, хто за неї відповідає (`act(…, 'answerer')`); рядок «Оскарження прийнято — воно лишається у вас» бачать усі люди команди, чию апеляцію прийнято, і ніхто з інших. Задачі 2, 4.

---

### Задача 1. Спільне й рушій: ліміт рахує лише відхилені апеляції; старі знімки рахують за новим правилом

**Files:**
- Modify: `packages/shared/src/appeal.ts` (`appealCounted`, коментарі `APPEALS_PER_GAME`, `appealCounted`), `packages/engine/src/appeal.ts` (коментар `appealsLeft`).
- Test: `packages/shared/src/appeal.test.ts`, `packages/engine/src/appeal.test.ts`, `packages/engine/src/appeal.queue.test.ts`, `packages/engine/src/views.appeal.test.ts`, `packages/engine/src/autopilot.appeal.test.ts`, `packages/engine/src/restore.test.ts`.

**Interfaces (Produces):** `appealCounted(outcome: AppealOutcome | null): boolean` — `true` лише для `null`, `'no'`, `'tie'`; `appealsLeft(state, participant): number` — та сама сигнатура, нове правило.

- [ ] **Step 1: Write the failing tests:**
  - `shared/appeal.test.ts`: тест `an open appeal and every hall decision count toward the limit; the host and the end do not` перейменувати на `only a rejected appeal (no, tie) uses the limit; an open one holds its place; yes, host and cancelled do not` і очікувати `[null, 'yes', 'no', 'tie'].map(appealCounted)` → `[true, false, true, true]`, `appealCounted('host')` і `appealCounted('cancelled')` → `false`; `[APPEAL_MS.vote, APPEALS_PER_GAME]` → `[30_000, 2]`.
  - `engine/appeal.test.ts`, `describe('limits')`:
    - `an accepted appeal is kept: after yes the player has two again and may appeal the next question` — `reveal` → `openAppeal(p1)` → `appealsLeft` 1 → голоси «так» усіх виборців (`castAppealVote` p2, p3 `true`) → `outcome === 'yes'`, `appealsLeft(s, 'p1') === 2`; наступне запитання з неправильною відповіддю p1 (`answerAndReveal(toNextQuestion(…), [WRONG, RIGHT, RIGHT], …)`) → `appealReasons(s, 'p1')` — `['grade']`, `openAppeal` — `ok`.
    - `two rejected appeals use the limit even after an accepted one` — `yes`, потім `no` (обидва «ні»), потім `tie` (`decideAppeal` без голосів) на трьох запитаннях → `appealsLeft` 2 → 1 → 0; четверте — `appeals_used`, `appealPossible` — `false`.
    - `an undone yes still does not count` — стан з `appeals: [{ …, outcome: 'yes', adjustmentSeq: 1 }]` і скасуванням рядка 1 у `adjustments` (`source: 'undo', undoes: { seq: 1 }`) → `appealsLeft === 2`.
    - наявний `host and cancelled appeals do not count` доповнити третьою апеляцією `outcome: 'yes'` → `appealsLeft` лишається 2.
  - `engine/appeal.queue.test.ts`: у `the queued appeal opens right after the decision; «Далі» waits for both, in turn` після `s.appeals?.[0].outcome === 'yes'` додати `expect(appealsLeft(s, 'p1')).toBe(2)` (Оля отримала апеляцію назад), решта без змін.
  - `engine/views.appeal.test.ts`: новий `the left count comes back after an accepted appeal` — `me(<рішення yes>, 'p1')` → `toMatchObject({ left: 2 })`; наявний `the left count drops after a counted appeal` (нічия) — без змін (1).
  - `engine/autopilot.appeal.test.ts`: новий `after an accepted appeal the window is open again on the next wrong answer` — Петро оскаржує на першому запитанні, `a` голосує «так» → на розкритті другого (Петро знову неправильно) `atOf(s)` = мить розкриття + `AUTOPILOT_MS.appealWindow` (не `AUTOPILOT_MS.reveal`); наявний `no appeals left: the old reveal time` (дві «ні») — без змін.
  - `engine/restore.test.ts`, новий `describe('60 snapshots')`, `it('an old snapshot with an accepted appeal counts by the new rule without a new version')`: `expect(GAME_STATE_VERSION).toBe(22)`; стан на розкритті з `appeals: [{ id: 1, by: 'p1', questionIndex: 0, reason: 'grade', …, outcome: 'yes', yes: 2, no: 0 }, { id: 2, by: 'p1', questionIndex: 1, …, outcome: 'no', yes: 0, no: 2 }]` (як `appealed()` ~1389, без нових ключів) → `back = roundTrip(suspend(roundTrip(s), …))` → `back.appeals` — рівно ті самі, `appealsLeft(back, 'p1') === 1`, `Object.keys(back)` — без нових ключів.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/appeal.test.ts`, потім `pnpm test --project engine --maxWorkers=2 packages/engine/src/appeal.test.ts packages/engine/src/appeal.queue.test.ts packages/engine/src/views.appeal.test.ts packages/engine/src/autopilot.appeal.test.ts packages/engine/src/restore.test.ts`. Expected: FAIL (нові очікування), решта PASS.
- [ ] **Step 3: Implement** `appealCounted` за «Рішеннями плану» (45a) і оновити коментарі. Рушій не міняти.
- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2`, потім `pnpm test --project engine --maxWorkers=2`, потім `pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine`. Expected: PASS. Якщо падає наявний тест, що закріплював старе правило (рахується й прийнята), — змінити очікування на нове й назвати тест у коміті.
- [ ] **Step 5: Commit**
```bash
git add packages/shared packages/engine
git commit -m "feat(engine): 60 appeals (45a) — only a rejected appeal (no or tie) uses the limit; an accepted one (yes) is kept like host and cancelled, an open or queued one holds its place until the decision; an old snapshot counts by the new rule with no new state version"
```

---

### Задача 2. Рушій і сервер: «Змінити» свою вигадку блефу

**Files:**
- Modify: `packages/engine/src/bluff.ts` (`editLie`, коментар `writeLie`), `packages/shared/src/events.ts` (`'player:lie-edit'`), `apps/server/src/rooms/manager.ts` (`lieEdit`, імпорт `editLie`), `apps/server/src/socket.ts` (`on('player:lie-edit')`).
- Test: `packages/engine/src/game.bluff.test.ts`, `packages/engine/src/restore.test.ts`, `apps/server/src/socket.test.ts`, `apps/server/src/rooms/manager.drafts.test.ts`.

**Interfaces:**
- Produces: `editLie(state: GameState, playerId: string, now: number): Result` (експорт з `@quiz/engine` через наявне `export * from './bluff'`); подія `'player:lie-edit': (ack: Ack) => void`; `RoomManager.lieEdit(room: Room, playerId: string): AckResult`.

- [ ] **Step 1: Write the failing tests:**
  - `game.bluff.test.ts`, `describe('bluff: the lies')`:
    - `editLie takes the lie back: the stage waits until the player writes again` — `openClassic([bluff, single])`, p1 «Рим», p2 «Мілан» → `editLie(s, 'p1', at(s, 2500))` → `ok`, `lies` без `p1`, `stage === 'lies'`; p3 «Париж» → `stage === 'lies'` (p1 не написав); p1 «Відень» → `stage === 'choice'`, тексти варіантів-вигадок — «Мілан», «Париж», «Відень», без «Рим».
    - `the new lie has the same checks` — після `editLie` p1: `writeLie(…, ' барселоні ')` → `bluff_truth`, `'   '` → `type_mismatch`; без `editLie` `writeLie` удруге → `already_answered` (як і зараз).
    - `editLie refuses: no lie, the choice, a pause, after the time` — без вигадки → `not_found`; `toChoice()` → `wrong_phase`; `pause` → `paused`; невідомий гравець → `not_found`; мить після `closesAt` → `time_over`; у кожному випадку стан не змінено.
    - `a removed lie of a player who left does not block` — p1 написав, `editLie` p1, `removePlayer(p1)` → решта написала → `choice` (наявна логіка `bluffAuto` з присутніми).
  - `restore.test.ts`, `describe('60 snapshots')`: `it('a bluff snapshot in the lies restores and the player can change the lie')` — `GAME_STATE_VERSION === 22`; стан з вигадкою p1 → `backAt(roundTrip(suspend(roundTrip(s), …)), …)` → `editLie(back, 'p1', …)` → `ok`, потім `writeLie` — `ok`.
  - `socket.test.ts`, поруч із `player:lie …` ~1330: `player:lie-edit lets the player change the lie while the lies are written` — `bluffGame()`: Олена «Рим» → `player:lie-edit` → `{ ok: true }`, кадр `meBluff(v)?.lie === null`; `player:lie` «Париж» → `{ ok: true }`, кадр `lie === 'Париж'`; ведучий і сцена `player:lie-edit` → `forbidden`; Олена вдруге `player:lie-edit` після «Париж» і Тарасової вигадки (етап `choice`) → `wrong_phase`.
  - `manager.drafts.test.ts`: у `a bluff lie is a draft only while lies are written…` після `manager.lie(…)` додати `manager.lieEdit(room, olena.playerId)` → `{ ok: true }`, `manager.draft(room, olena.playerId, { type: 'lie', text: 'Ще' })` → `{ ok: true }` (чернетка знову приймається).
- [ ] **Step 2: Run** `pnpm test --project engine --maxWorkers=2 packages/engine/src/game.bluff.test.ts packages/engine/src/restore.test.ts`, потім `pnpm test --project server --maxWorkers=2 apps/server/src/socket.test.ts apps/server/src/rooms/manager.drafts.test.ts`. Expected: FAIL (`editLie`/`lieEdit` немає).
- [ ] **Step 3: Implement** за «Рішеннями плану» (45c): `editLie` (видалення ключа — деструктуризацією `const { [playerId]: _gone, ...lies } = play.bluff.lies`), подія, `lieEdit`, обробник у `socket.ts` як `player:hint`.
- [ ] **Step 4: Run** `pnpm test --project engine --maxWorkers=2`, потім `pnpm test --project server --maxWorkers=2 apps/server/src/socket.test.ts apps/server/src/rooms`, потім `pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/engine && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/engine packages/shared apps/server/src
git commit -m "feat(engine): 60 bluff (45c) — editLie takes a player's lie back while the lies are written, so the stage does not close until they write again; the new lie has the same checks; player:lie-edit for the player (the answerer in teams), refused on a pause, in the choice and after the time; a restored bluff can be edited"
```

---

### Задача 3. Веб: курсор одразу в полі відповіді, коли поле стає доступним (45b)

**Files:**
- Create: `apps/web/src/live/useAnswerFocus.ts`, `apps/web/src/live/useAnswerFocus.test.tsx`.
- Modify: `apps/web/src/screens/AnswerInput.tsx` (`TypedInput`), `CloudInput.tsx`, `SurveyInput.tsx`, `BluffLieInput.tsx`, `SpyPhone.tsx` (`SpyTextForm`), `ThinkView.tsx` (`ThinkInput`), `TimedListView.tsx`, `LetterWordsView.tsx`, `WordLadderView.tsx`, `ChainView.tsx`, `DuelView.tsx` (поле дуелі).
- Test: `apps/web/src/screens/PlayerScreen.test.tsx`, `apps/web/src/screens/AnswerInput.test.tsx`, `apps/web/src/screens/BluffLieInput.test.tsx`.

**Interfaces (Produces):** `useAnswerFocus(ref: RefObject<HTMLInputElement | HTMLTextAreaElement | null>, allowed?: boolean): void`.

- [ ] **Step 1: Write the failing tests:**
  - `useAnswerFocus.test.tsx` (тестовий компонент `Probe({ disabled, fieldsetDisabled, allowed })` з `<fieldset disabled={fieldsetDisabled}><input aria-label="поле" disabled={disabled} /></fieldset>` і другим полем `aria-label="інше"`):
    - `focuses the field once it is enabled` — монтування з `fieldsetDisabled` → `document.activeElement` не поле; `rerender` без нього → поле у фокусі.
    - `focuses once per mount` — після фокуса `інше.focus()`, потім `blur()` на ньому й `rerender` → фокус не повертається в «поле».
    - `does not steal from another field the player is typing in` — `інше.focus()` до того, як поле стало доступним; `rerender` доступним → фокус лишається на «інше».
    - `allowed false never focuses`.
    - `uses no smooth scroll with reduced motion` — `matchMedia('(prefers-reduced-motion: reduce)')` → `matches: true`; шпигун на `HTMLElement.prototype.scrollIntoView` → викликаний з `{ block: 'nearest', behavior: 'auto' }`; без зменшеного руху — `'smooth'`.
  - `PlayerScreen.test.tsx`, новий `describe('the answer field gets the cursor (45b)')` (фікстури `onQuestion`, `show`, заставка як у `under the question splash the audio is mounted but does not start` ~155, фальшиві таймери):
    - `a text question under the splash focuses the field when the splash ends` — `splash: { kind: 'question', until: now + 3000 }` → поле «Ваша відповідь» не у фокусі; `vi.advanceTimersByTime(3100)` → у фокусі.
    - `a numeric question focuses the field` (без заставки) → у фокусі одразу.
    - `no focus after the answer is sent` — `me.answer` не `null` → поля немає, `document.activeElement === document.body`.
    - `no focus on a pause` — `paused: true` → не у фокусі; той самий зріз без паузи → у фокусі.
    - `a think spectator gets no field and no focus` — `me.think.status: 'spectator'` → `document.activeElement === document.body`.
  - `AnswerInput.test.tsx`: `the vote sheet field (autoFocus false) is not focused` (як у `Buffs.tsx`) і `the text field is focused by default`.
  - `BluffLieInput.test.tsx`: `focuses the lie field` (без `autoFocus={false}`); наявний тест з `autoFocus={false}` — поле не у фокусі.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/live/useAnswerFocus.test.tsx apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/screens/AnswerInput.test.tsx apps/web/src/screens/BluffLieInput.test.tsx`. Expected: FAIL (хука немає; під заставкою фокус губиться).
- [ ] **Step 3: Implement** `useAnswerFocus` за «Рішеннями плану» (45b), потім поставити його в перелічені компоненти: `useRef` на поле, атрибут `autoFocus` прибрати, проп `autoFocus` (де є) передати як `allowed`. У `ThinkInput` хук — до ранніх `return`; у `SurveyInput` — окремий `first` ref, що отримує вузол поля з індексом 0 у наявному колбеку `ref`. Наявні повернення фокуса після надсилання (`ChainView` ~151, `TimedListView` ~188, `LetterWordsView` ~202, `WordLadderView` ~96, `DuelView` ~171) не чіпати.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/live apps/web/src/screens`, потім `pnpm typecheck`. Expected: PASS. Падіння наявних тестів, що чекали фокуса одразу при монтуванні з атрибутом, — розібрати: очікування фокуса лишається, змінюється лише механізм.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/live apps/web/src/screens
git commit -m "feat(web): 60 answer focus (45b) — the phone answer field gets the cursor once per question as soon as it is enabled, so the question splash no longer swallows it: text, number, clues, think alike, word cloud, survey, bluff lie, spy, think different, timed list, letter words, word ladder, chain and duel; never after the answer is sent, for a spectator, on a pause, from another field the player is typing in, or on the stage and host; no smooth scroll with reduced motion"
```

---

### Задача 4. Веб: «Оскарження прийнято — воно лишається у вас», кнопка «Змінити» в блефі, тексти й довідка в 7 мовах

**Files:**
- Modify: `apps/web/src/appeal-text.ts` (`appealKeptText`), `apps/web/src/screens/PlayerScreen.tsx` (рядок під `AppealCard size="phone"`; `BluffPlay` — кнопка «Змінити», `lastLie`), `apps/web/src/screens/BluffLieInput.tsx` (проп `initial?: string`), `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,de,es,it,pl,ar}.json`, `apps/web/src/help/help-uk.ts`, `apps/web/src/locales/{en,de,es,it,pl,ar}.help.json`, `apps/web/src/help/__fixtures__/help-uk-golden.json`, `apps/web/src/i18n.test.ts` (`ADDED_SMALL_FIXES_60`), `apps/web/src/styles.css` (`.appeal-kept`, `.bluff-edit` — лише змінні теми, перенос на 360 px).
- Test: `apps/web/src/appeal-text.test.ts`, `apps/web/src/screens/PlayerScreen.test.tsx`, `apps/web/src/screens/BluffLieInput.test.tsx`, `apps/web/src/i18n.test.ts`, `apps/web/src/help/help-golden.test.ts`, `apps/web/src/help/host-help.test.ts`.

**Interfaces:**
- Consumes: `'player:lie-edit'` (задача 2), `useAnswerFocus` (задача 3), правило 45a (задача 1).
- Produces: `appealKeptText(view: AppealView, participantId: string): string | null`; `BluffLieInput` проп `initial?: string`; ключі `appealKeptMine`, `bluffLieEdit`.

- [ ] **Step 1: Write the failing tests:**
  - `appeal-text.test.ts`: `appealKeptText` — `outcome: 'yes'`, свій учасник → `'Оскарження прийнято — воно лишається у вас'`; чужий учасник, `undone: true`, `'no'`, `'tie'`, `'host'`, `null` → `null`.
  - `PlayerScreen.test.tsx`:
    - `the appellant whose appeal passed reads that it is kept` — `phase: 'reveal'`, `appeal: { …, by: { playerId: 'p1' }, outcome: 'yes' }` → `p.appeal-kept` з текстом; для `by: 'p2'` — немає; командна гра (`team: { teamId: 't1', … }`, `by: 't1'`) — є.
    - `bluff: a sent lie can be changed` — етап `lies`, `me.bluff.lie: 'Рим'` → рядок `Твоя вигадка: «Рим». Чекаємо на інших.` і кнопка «Змінити»; клік → `send('player:lie-edit')`; новий зріз з `lie: null` → поле «Твоя вигадка» зі значенням «Рим» і у фокусі; на паузі кнопка `disabled`; відмова `{ ok: false, error: 'time_over' }` → `role="alert"` з `errorText('time_over')`.
  - `BluffLieInput.test.tsx`: `starts with the initial text` — `initial="Рим"` → значення поля «Рим», кнопка «Надіслати вигадку» активна.
  - `i18n.test.ts`: `ADDED_SMALL_FIXES_60 = ['appealKeptMine', 'bluffLieEdit']` — в умові `adds no uk keys beyond the agreed list` і в перевірці «є й не порожній у кожній локалі».
  - `help-golden.test.ts` — без змін коду: падає, доки золотий файл не оновлено (`setting.appeal.points.1`, `question.bluff.how.2`).
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/appeal-text.test.ts apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/screens/BluffLieInput.test.tsx apps/web/src/i18n.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (45a веб, 45c веб, «Нові тексти»): uk-ключі в `i18n.ts` поруч з `appealResultHost` і `bluffLieSent`; переклади в шести `locales/*.json`; довідка в `help-uk.ts`, шести `*.help.json` і ті самі два записи uk у `help-uk-golden.json` (лише ці записи; плейсхолдер `{appealsPerGame}` — в усіх мовах). Стилі: `.appeal-kept` — як `.meta` під карткою; `.bluff-edit` — під рядком `bluffLieSent`, без бічного скролу на 360 px.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2`, потім `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src
git commit -m "feat(web): 60 appeal kept and bluff change (45a, 45c) — the player (or team) whose appeal the hall accepted reads «Оскарження прийнято — воно лишається у вас» under the phone card; a sent bluff lie has «Змінити» that reopens the field with the old text and the cursor in it until the new one is sent; the help says an accepted appeal is not used up and a lie can be changed while the lies are written; seven languages"
```

---

### Задача 5. Наскрізний сценарій і кадри (`part60-small-fixes.e2e.ts`), повтор part 12f / 29k / 10f / 55

**Files:**
- Create: `apps/server/e2e/part60-small-fixes.e2e.ts` (кімната-автопілот, як `appealQueue29k` ~376: автор Марта — сокет `pilotSocket`, Оля — сторінка 360 × 740 зі світлою темою через `addInitScript` до `goto`, Петро — сокет `pilotPlayer`; сцена 1280 × 720 за `stageToken`).
- Modify: `apps/server/e2e/part12f-i-appeal-resume-captain-powers.e2e.ts` — крок 5 (~241): `'⚖️ Оскаржити (лишилось 2)'` (перша апеляція Олі прийнята й не згоріла); крок 6 (~280–295): у Олі **є** кнопка `'⚖️ Оскаржити (лишилось 1)'` (нічия згоріла), вона її не натискає, в Іри кнопки немає; назва `it('part 12f: …')` — «there is no third button» → «the accepted appeal is kept, so after the tie Оля still has one left» (префікс `part 12f:` той самий).

**Сценарій** (вікторина «Дрібні правки 60»: класичний раунд без бонусу швидкості, `shuffleOptions: false`; q1 текст «Хто написав «Кобзар»?», `accepted: ['Тарас Шевченко']`, 200, 40 с; q2 число «Скільки областей в Україні?», правильне 24, 100, 40 с; q3 текст «Як звали київську княжну, що стала королевою Франції?», `accepted: ['Анна Ярославна', 'Анна']`, 100, 40 с; q4 блеф «Найглибше озеро України — …» (`accepted: ['Світязь']`, запасні `lies: ['Синевир', 'Несамовите']`, вигадки 60 с, вибір 30 с; поля — за фікстурою блефу part 10f); люди — Марта (автор, сокет), Оля (сторінка), Петро (сокет)):
`it('part 60: small game fixes — on a 360 phone in the light theme the answer field has the cursor right after the splash on a text and a number question while the stage has no focus; Оля’s accepted appeal stays («лишилось 2» again) and the rejected one is used («лишилось 1»); in bluff Оля sends a lie, taps «Змінити», the field reopens with it, the stage waits for her and the choice shows only her new lie')`:
1. q1: після заставки на телефоні Олі `document.activeElement` — поле «Ваша відповідь» (`expect.poll`, `POLL`); на сцені `document.activeElement === document.body`. Оля друкує «Шевченко» **без кліку** (`olya.keyboard.type`) і тисне «Відповісти»; Марта й Петро — «Тарас Шевченко» (`emitOk(…, 'player:answer', …)`). Кадр `p60-focus-text-360`.
2. Розкриття q1: кнопка `'⚖️ Оскаржити (лишилось 2)'` → клік → кнопки немає, під час голосування в кадрі Олі `me.appeal.left === 1`; Марта й Петро `player:appeal-vote` «так» → `p.appeal-result` «⚖️ Зараховано! +200», `p.appeal-kept` «Оскарження прийнято — воно лишається у вас». `expectNoSideScroll`; кадр `p60-appeal-kept-360`.
3. q2: після заставки фокус у полі (число); Оля друкує «25» без кліку, Марта й Петро — 24. Розкриття: кнопка `'⚖️ Оскаржити (лишилось 2)'` → клік → Марта й Петро «ні» → «⚖️ Лишається як було · так 0 · ні 2», рядка `.appeal-kept` немає.
4. q3: Оля «Ольга», інші правильно → кнопка `'⚖️ Оскаржити (лишилось 1)'` (не натискати). Кадр `p60-appeal-used-360`.
5. q4 блеф: Оля пише «Тисове» → «Надіслати вигадку» → рядок «Твоя вигадка: «Тисове». Чекаємо на інших.» і кнопка «Змінити»; кадр `p60-bluff-sent-360`. «Змінити» → поле «Твоя вигадка» зі значенням «Тисове» у фокусі; Марта й Петро пишуть свої (`player:lie`); 2 с кадри сокетів лишаються на етапі `lies` («Вигадали 2 з 3»). Оля стирає й пише «Шацьке», надсилає → кадр Марти з `bluff.stage === 'choice'`; серед варіантів у кадрі Петра (порівняння без регістру) є «Шацьке», немає «Тисове». Кадр `p60-bluff-edit-360`, `expectNoSideScroll`.
6. Наприкінці: `is-light` на `<html>` Олі; `problems` (помилки консолі) — `[]`.

- [ ] **Step 1: Write the scenario.** Помічники — з `helpers/common.ts` і локальних у part 12f (`afterSplash`, `squash` — перенести копією, якщо не експортовані); нових спільних помічників не додавати без потреби. Тексти вікторини — лише українські теми без росії.
- [ ] **Step 2: Edit part 12f** за «Files» вище.
- [ ] **Step 3: Run** `pnpm build`, потім (після завершення) `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 60"` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 4: Run** по одному, не одночасно: `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 12f"`, потім `-t "part 29k"`, потім `-t "part 10f"`, потім `-t "part 55"`. Expected: PASS (12f — з новими очікуваннями; 29k — черга не змінилася; 10f — блеф без «Змінити» той самий; 55 — смужка таймера не закриває поле, що тепер отримує фокус саме).
- [ ] **Step 5: Переглянути кадри:** 360 px, світла тема — поле з курсором видно без прокрутки, рядок «Оскарження прийнято…» читається під карткою, кнопка «Змінити» не виходить за край і не налазить на рядок вигадки.
- [ ] **Step 6: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 60 — the answer field has the cursor after the splash on a text and a number question and the stage has none; an accepted appeal stays and a rejected one is used; a bluff lie is changed with «Змінити» while the stage waits; 360 px, light theme; part 12f now expects the accepted appeal to stay"
```

---

## Розбіжності зі специфікацією (рішення плану)

1. **`GAME_STATE_VERSION` не підвищується (22).** Специфікація дозволяє підняття за згоди власника; воно не потрібне: 45a міняє правило над наявним `Appeal.outcome`, 45c видаляє ключ з наявного `BluffPlay.lies`, 45b — лише веб. Питати власника перед пушем **не треба**. Наслідок для живих ігор під час розгортання: у кімнаті, відновленій зі знімка, гравець, чию апеляцію зал уже прийняв у цій грі, отримує її назад — це і є нове правило, перетворення не потрібне.
2. **«Прийняте» — це `yes` залу й `host` ведучого; рядок «лишається у вас» — лише для `yes`.** Ведучий, що сам зарахував під час голосування, і раніше не витрачав апеляції (`host` не рахувався) — там гравець бачить «⚖️ Зараховано ведучим», а нового рядка не додаємо, щоб не міняти наявну картку. Нічия (`tie`) — відхилена: відповідь лишилася як була, апеляція витрачається.
3. **Відкрита й у черзі апеляція тримає місце до рішення.** Під час голосування «лишилось» на одну менше; після «так» — повертається. Інакше гравець з однією відхиленою міг би, поки зал голосує, стати в чергу з наступною й перевищити ліміт, а лічильник стрибав би вгору-вниз. Одна апеляція на запитання — як і раніше; скасоване потім «так» (у «↶ Бали») не повертає витрати — правило читає лише рішення залу.
4. **«Лише коли поле з'являється вперше» = один раз за монтування поля, коли воно вперше доступне.** Причина скарги — атрибут `autoFocus` спрацьовував під заставкою, коли `fieldset` вимкнений, і фокус губився; хук чекає доступності. Нове поле в межах запитання (бліц-позиція, друга спроба бафа, «останній шанс» шпигуна, «Змінити» в блефі) отримує фокус знову — це нова поява поля. На iOS клавіатура без дотику може не відкритися (обмеження браузера); фокус і курсор будуть.
5. **Типи без автофокуса:** «Мелодія» й «Відеокліп» (поле вимкнене до першого шматка, і клавіатура закрила б кнопки програвання — `SnippetView` і далі `autoFocus={false}`), «Вгадай слово» (власна клавіатура, поля немає), кросворд і судоку (сітка), «Квест із кодом» (панель на весь раунд), факт «Правди» в лобі, ставки й аукціон, аркуш голосу бафа. Специфікація перелічує «тощо» — решту полів відповіді охоплено.
6. **«Змінити» — окрема подія `player:lie-edit`, а не повторний `player:lie`.** Так «гравець, що натиснув «Змінити», вважається таким, що ще не надіслав» буквально: вигадку знято з `lies`, «Вигадали n з m» зменшується, етап не закриється, доки він не надішле знову; якщо час сплив — етап іде далі без його вигадки (як у того, хто не писав). Попередній текст тримає телефон, не сервер (у стані нічого не додаємо). У командній грі змінює той, хто за команду відповідає.
7. **e2e — автопілот, а не ведучий.** Так у сценарії менше кроків (автор — сокет, як у part 29k), а правило апеляцій для ведучого перевіряє оновлений part 12f.
