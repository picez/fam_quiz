# План 29h: баф «Прихований напад» (`stealth`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> План спирається на `main` після 29e (`17dff4be`). Звідти беремо:
> - з 8a/8b/12h: `BUFF_KINDS`, `READY_BUFFS`, `allowedBuffs` (`packages/shared/src/game.ts`, `quiz.ts` ~1724), `takeBuff`/`buffBlock`/`fitBlock` (вичерпний `switch` з `never`)/`buffsUsed`/`currentBuffs`/`lastBuff` (`packages/engine/src/buffs.ts`), `playerBuffs` (`views.ts` ~3034), `BUFF_ICONS`/`buffName` (`apps/web/src/buff-meta.ts`), `PowersEditor.tsx`, `guide.ts` (сторінка `buffs` з `allowedBuffs`) і `guide-text.ts` (`buffGuide_*`), довідку `buff.<kind>.*` (`help-uk.ts`, `__fixtures__/help-uk-golden.json`, `locales/*.help.json`, `host-help.ts` — `topic('buff', BUFF_KINDS)`);
> - з 9c: `buyDebuff`/`shopBlock`/`lastPurchase`/`cancelDebuff`/`DebuffState.by` (`packages/engine/src/debuffs.ts`), `addAdjustment(…, 'debuff', { target, debuff })` (`adjust.ts`), `playerDebuff`/`hostDebuff`/`debuffBuyer`/`playerShop` (`views.ts` ~3605–3632), `DebuffNotice` (`shared/src/views.ts` ~1931), `DebuffToast`/`StageDebuffs` (`apps/web/src/live/LiveNotices.tsx`), банер жертви (`screens/Debuffs.tsx` ~365, `DebuffStrip`), `debuffTagText` і `DebuffPanel` пульта (`screens/HostPlayerTools.tsx`), `DebuffShop.tsx` (кнопка «😈», лише капітан — `PlayerScreen.tsx` ~913), `manager.buyDebuff` → `act(…, 'captain')` (`apps/server/src/rooms/manager.ts` ~2029);
> - з 11f/12d: `scoreLines`/`PlayerScoreLine` (`packages/engine/src/breakdown.ts`), `breakdowns` пульта (`views.ts` ~3702), `factInputOf`/`gameCard` (`debuffs: { sent, got }`, лише `finished`), історія `hostGameWithFacts` і `debuffLines` (`apps/server/src/history.ts` ~567/730, `apps/web/src/pages/GameHistory.tsx` ~148), ачівка `prankster` (`apps/server/src/achievements.ts` — `debuffsBought` з рядків коригувань БД);
> - з 15a: «Оберіг» (`wardReady`/`spendWard`, `perks.ts`);
> - розсилку: `commit` → `emit(room, { type: 'changed' })` → `socket.ts` ~304 шле `push` **кожному** сокету кімнати.
>
> **Перед кожною задачею виконавець звіряє назви й рядки з фактичним кодом** (`git show --stat 371ac051` — усі місця, які зачепило додавання п'яти бафів 12h; більшість треба зачепити й тут).

**Goal:** новий баф `stealth` («Прихований напад»). Гравець (у командах — капітан за команду) вмикає його будь-коли під час гри; **ніхто, крім власника, про це не дізнається** — ні ведучий, ні сцена, ні інші гравці, навіть кадром сокета. Власник бачить «🥷 Наступний напад анонімний». Наступний дебаф, який цей учасник **купить**, — анонімний для всіх, включно з ведучим: у сповіщенні, на банері жертви, у тезі пульта, у розбивці балів пульта, в історії незавершеної гри — «Хтось». Справжній автор лишається в стані гри (статистика, ачівки, «Твоя гра», історія після кінця гри). Баф діє до першої покупки, не згоряє в кінці раунду.

**Architecture:**
- **Спільне:** `'stealth'` у кінці `BUFF_KINDS` (індекси наявних не зсуваються). Нових подій і кодів помилок немає: баф вмикається тим самим `player:buff` `{ kind: 'stealth' }`. Зрізи: `DebuffNotice.buyer: BlitzPlayer | null`, `anon?: true` у дебафі пульта й телефона, `PlayerView.me.stealth?`.
- **Рушій:** окремий необов'язковий `GameState.stealth?` (не `Play.buffs`: баф не прив'язаний до запитання й не займає слот «один баф на запитання»). `buyDebuff` позначає анонімну покупку `ScoreAdjustment.anon` і `DebuffState.anon`; усі зрізи, що називають покупця, дивляться на ці позначки. `GAME_STATE_VERSION` лишається **22**.
- **Сервер:** `manager.buff` для `stealth` діє як капітан і розсилає зміну **лише сокетам власника** (`changed` з `only`). Історія незавершеної гри не показує покупок дебафів.
- **Веб:** рядок «Прихований напад» на першому кроці аркуша «😈», позначка «🥷 Наступний напад анонімний» усій команді-власниці, «Хтось» у сповіщенні, на банері, у тезі пульта; попередження в редакторі; тексти 7 мовами й довідка.

**Tech Stack:** TypeScript, zod 4, vitest, Fastify + Socket.IO, React 19 + Vite + Testing Library, Playwright через vitest (e2e).

**Spec:** `docs/superpowers/specs/2026-11-11-stealth-buff-design.md` (обов'язкова). Зразки: 12h (`git show 371ac051`, `game.buffs-12h-peek.test.ts`, `views.buffs-12h.test.ts`), 9c (`game.debuff-shop.test.ts`, `views.debuff-shop.test.ts`), e2e `part 9c` і `part 29f` (`socketFrames`, `shot`, `restart`, `expectPhoneFit`).

## Global Constraints

- 7 мов без ru. Нові ключі — в uk (`apps/web/src/i18n.ts`) і в `apps/web/src/locales/{en,pl,de,es,it,ar}.json`. Список `ADDED_29H` іде в `apps/web/src/i18n.test.ts` і додається до умови `adds no uk keys beyond the agreed list`, як `ADDED_29E`. Довідка: `help-uk.ts`, `__fixtures__/help-uk-golden.json`, `locales/*.help.json`. **Нічого про росію** — у прикладах, фікстурах, довідці й e2e (імена: Оля, Петро, Тарас, Ася).
- `GAME_STATE_VERSION` не підвищувати, лишається **22**. Лише необов'язкові поля: `GameState.stealth?`, `DebuffState.anon?`, `ScoreAdjustment.anon?`, `PlayerScoreLine.anon?`, `PlayerView.me.stealth?`, `anon?` у `me.debuff` і `HostPlayer.debuff`. У `restore.ts` після рядка 29e додати «29h без нової версії: баф stealth, необов'язкові GameState.stealth, DebuffState.anon і ScoreAdjustment.anon». Якщо знадобиться обов'язкове поле стану, **зупинитися й спитати контролера**. Поля зрізів (`DebuffNotice.buyer` стає nullable) — не стан, версії не стосуються.
- **Тиша.** Увімкнення бафа: жодного запису в `play.buffs`, `currentBuffs`, `lastBuff`, `adjustments`; зрізи сцени, пульта й **будь-якого іншого** телефона після увімкнення **глибоко рівні** зрізам до нього (`toEqual`); кадр `state` іде лише сокетам власника (соло — гравцю, у командах — усім учасникам команди).
- **Анонімність.** Після анонімної покупки ні в зрізі сцени, ні пульта, ні цілі, ні третього гравця немає id чи ніка покупця **в полях дебафу**: `debuffNotice.buyer === null`, `me.debuff.by === null`, `HostPlayer.debuff.by === null`, у `breakdowns` пульта немає рядка цієї покупки (до `finished`). Так само до кінця гри (`finished`) — і після неї зрізи покупця не відкривають (відкриває історія).
- Справжній автор: `ScoreAdjustment.playerId` і `DebuffState.by` — як завжди (покупець). Отже `shopBlock`/`debuff_bought`, `cancelDebuff` (`not_allowed` — куплений), `gameCard.debuffs.sent`, ачівка `prankster`, `facts` після гри рахують анонімну покупку як звичайну.
- Юніт-тести: `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' …`. Prettier ніколи не запускати. Типи — `pnpm typecheck`.
- e2e: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 29h"` на передньому плані, менше ніж за 10 хв, Docker вимкнено. Телефон власника — 320 px. Кадри сцени 1600×900.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`).

## Рішення плану (там, де специфікація мовчить)

- **Назва й значок.** `stealth` — у кінці `BUFF_KINDS` (після `peek`); `BUFF_KINDS` має 14 видів (`quiz.test.ts` ~1204). Значок у `BUFF_ICONS` — одноколірний гліф `'◐'` (правило файла: не кольорові емодзі); у тексті позначки власника — «🥷», як у специфікації. Назва — «Прихований напад».
- **Бафи безплатні.** Як і решта бафів, `stealth` не купується за бали, а береться раз за гру (у специфікації «купується, як інші бафи» = «береться, як інші бафи»). Тож списання балів за **сам баф** немає й витоку через рахунок увімкнення не дає.
- **Де вмикається.** Не в ряді бафів запитання (його видно лише на `question`, і там «один баф на запитання»), а на першому кроці аркуша «😈 Дебафи» — там, де він і має сенс. `playerBuffs` (`views.ts`) **викидає** `stealth` зі `slots` (ряд не змінюється, наявні тести рядів не ламаються).
- **Коли.** «Будь-коли» = будь-який етап, крім `lobby`, `guide`, `finished`; пауза й `shopBlock` (`bought`, `phase`) **не** заважають — увімкнути можна навіть тоді, коли купити зараз не можна (діятиме на наступну покупку). Умова доступності: `allowedBuffs(quiz)` має `stealth`, `settings.debuffShop !== false` і `allowedDebuffs(quiz).length > 0` (без купівлі баф нічого не дає). Інакше `me.stealth` відсутнє.
- **Помилки** (`takeStealth`, по черзі): немає учасника → `not_found`; баф не дозволено / купівлю вимкнено / дебафів немає → `not_allowed`; `lobby`/`guide`/`finished` → `wrong_phase`; уже вмикали в цій грі (є ключ у `state.stealth`) → `buff_used`. Нових `ErrorCode` немає.
- **Хто діє в командах.** Капітан, як `buyDebuff` (`act(…, 'captain')`); стан — під id команди. Позначку бачить уся команда (`me.stealth` з id команди).
- **Тривалість.** Діє на **першу успішну** покупку після увімкнення — і в тому ж циклі запитання, і в будь-якому наступному раунді; у кінці раунду не згоряє. Невдала покупка (`points_short`, `debuff_busy`, `target_offline`, …) баф не витрачає. Покупка, яку погасив «Оберіг» цілі (бали списано, дебафу немає), — теж напад: баф витрачено, коригування `anon`. Дебаф від ведучого (`setDebuff`) на баф не впливає.
- **Стан** (`game.ts`):
  ```ts
  /** «Прихований напад» (29h): коли увімкнено й seq коригування анонімної покупки; spent null — чекає покупки. */
  export interface StealthState { at: number; spent: number | null }
  // GameState.stealth?: Record<string, StealthState> — ключ: учасник рушія (у командах — команда). Вилучення гравця прибирає ключ.
  // DebuffState.anon?: true — дебаф куплено анонімно.
  // ScoreAdjustment.anon?: true — лише для source 'debuff': анонімна покупка.
  ```
- **Сповіщення.** Наявне сповіщення навмисно **без виду** дебафу («Оля насилає дебаф на гравця Петро»), тож анонімне — «Хтось насилає дебаф на гравця Петро» (без виду, як і досі; приклад «Хтось наклав «Туман» на Асю» в специфікації — та сама думка в наявній формі). Банер жертви — «Хтось насилає на вас: Туман» (вид жертва бачить і зараз). Тег пульта — «🌫️ Туман від когось · чекає / діє»; кнопки «Скасувати дебаф» немає (куплено гравцем — `debuffBought`).
- **Рахунок.** Ціна дебафа списується одразу, як завжди (`points_short`, ранги, колонки раундів, таблиці мають бути правдою). Тому зменшення рахунку покупця видно в таблицях — це **свідомо не ховаємо**: приховування вимагало б брехливих чисел у рангах, колонках раундів, таблиці пульта й підсумках раунду. Довідка про це чесно каже. Ховаємо лише **підпис**: у `breakdowns` пульта до `finished` рядки `anon` не входять (частина «Дебафи» не з'являється біля покупця); власна розбивка покупця (`myBreakdown`) їх має.
- **Кадр сокета.** Увімкнення бафа — `commit` з `only: <id учасника рушія>`: подія `{ type: 'changed', only }`, `socket.ts` шле `push` лише сокетам ролі `player`, чий `playerId === only` або чия команда `=== only`; `scheduleDrafts` не викликається. Інші слухачі `manager.onEvent` (зокрема запис гри) обробляють подію як звичайну зміну. Решта ролей отримає стан з наступною звичайною зміною — він для них і так не змінився.
- **Історія.** БД, як і досі, зберігає справжнього покупця (`adjustment.participantId`), окремої колонки `anon` **немає** (міграції немає). `hostGameWithFacts`: для гри зі `status !== 'finished'` рядки `source === 'debuff'` не йдуть ні в `detail.adjustments`, ні в `factInput.debuffs` (історію незавершеної гри можна відкрити за id). Після кінця гри історія показує звичайний рядок «Оля купує 🌫️ Туман для гравця Петро» — це і є розкриття «після кінця гри».
- **Редактор.** `stealth` у списку бафів (`BUFF_KINDS`), «Усі» його вмикає (`READY_BUFFS`). Якщо `stealth` вибрано, а купівлю вимкнено чи дебафів немає, — попередження `powersStealthNeedsShop` («Прихований напад працює лише з купівлею дебафів гравцями»), не помилка схеми.
- **Сценарії-скрипти.** `classroom-quiz.ts`/`evening-quiz.ts` беруть `[...BUFF_KINDS]` і отримують `stealth` самі; їхні тести (`evening-quiz.test.ts`, сторінки гіда) лише звірити. `demo-quiz.test.ts` (`PRE_12H_BUFFS`) не змінюється.

## Порядок збирання

- Задача 1 додає `stealth` у `BuffKind` і робить `DebuffNotice.buyer` nullable — вичерпні `Record<BuffKind, …>` і `switch` у рушії й вебі ламаються. Тому в задачах 1–3 перевіряються `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`, а з задачі 4 — `pnpm typecheck`.
- Залежності: 2 ← 1; 3 ← 2; 4 ← 1, 2; 5 ← 3, 4.

## Review Focus

1. **Увімкнення ніхто не бачить.** Зрізи сцени, пульта й іншого телефона до й після `takeStealth` глибоко рівні; кадр `state` дістається лише сокетам власника. Тести: задача 2 `turning stealth on changes no one else's view`; задача 3 `stealth reaches only the owner's sockets`; задача 5 — `socketFrames` сцени, пульта й Петра.
2. **Анонімна покупка анонімна для всіх, включно з ведучим.** `debuffNotice.buyer === null`, `me.debuff.by === null` у цілі (і в її товаришів), `HostPlayer.debuff.by === null` з `anon: true`, у `breakdowns` пульта немає рядка, у кадрах сокетів нікого з ніком покупця в полях дебафу. Тести: задача 2 `an anonymous purchase names no one`; задача 5 — кадри.
3. **Справжній автор живе в стані.** `adjustments` — під покупцем; `debuff_bought` у тому ж циклі; `cancelDebuff` → `not_allowed`; `gameCard.debuffs.sent` і `prankster` рахують покупку; історія після кінця — з ім'ям, до кінця — без покупок. Тести: задача 2 `the real buyer still counts`; задача 3 `history of an unfinished game hides debuff purchases`, `prankster counts an anonymous purchase`.
4. **Тривалість.** Діє на першу успішну покупку в будь-якому наступному запитанні й раунді; невдала покупка баф не витрачає; «Оберіг» витрачає; друга покупка вже з ім'ям; удруге увімкнути — `buff_used`. Тести: задача 2 `lasts until the first purchase, across rounds`, `a failed purchase keeps it`, `a ward spends it`.
5. **Команди.** Вмикає й купує капітан за команду; позначку бачать усі учасники; ціль-команда бачить «Хтось». Тести: задача 2 `teams: the captain hides the team's attack`; задача 3 — сокети команди; задача 5 — сценарій команд.
6. **Ряд бафів не змінився.** `playerBuffs.slots` без `stealth`; `buffBlock` для `stealth` у місцях без бафів дає ту саму `off_*`, що й решта (наявні цикли `for (const kind of BUFF_KINDS)` у `game.votes.test.ts`, `game.wall.test.ts`, `game.buffs-others.test.ts` проходять). Тест: задача 2 `stealth is not in the question buff row`.

---

### Задача 1. Спільне: вид бафа, поля зрізів

**Files:**
- Modify: `packages/shared/src/game.ts` — `'stealth'` у кінці `BUFF_KINDS` (коментар «29h — прихований напад у кінці»).
- Modify: `packages/shared/src/views.ts`:
  - `DebuffNotice.buyer: BlitzPlayer | null` — коментар «null — анонімна покупка («Прихований напад», 29h)»;
  - `PlayerView.me.debuff` (~2069): `{ kind; since; by: string | null; anon?: true }`;
  - `HostPlayer.debuff` (~2220): `{ kind; fired; by: string | null; anon?: true }`;
  - `PlayerView.me.stealth?: StealthMark`, `export type StealthMark = 'ready' | 'armed' | 'used'` — «відсутнє — бафа в грі немає, купівлю вимкнено чи дебафів немає; бачить лише власник (у командах — уся команда)».
- Modify: `packages/shared/src/quiz.test.ts` (~1204) — `BUFF_KINDS` має 14 видів; `READY_BUFFS` дорівнює `BUFF_KINDS`.
- Test: `packages/shared/src/quiz.test.ts`.

**Interfaces (Produces):**
```ts
export const BUFF_KINDS = ['fifty', 'double', 'retry', 'time', 'shield', 'audience', 'hint', 'swap', 'risk', 'letter', 'scope', 'guard', 'peek', 'stealth'] as const;
export type StealthMark = 'ready' | 'armed' | 'used';
export interface DebuffNotice { seq: number; at: number; buyer: BlitzPlayer | null; target: BlitzPlayer }
```

- [ ] **Step 1: Write the failing tests** (`quiz.test.ts`):
  - `stealth is the fourteenth buff` — `BUFF_KINDS.at(-1) === 'stealth'`, довжина 14, `BUFF_KINDS.indexOf('peek') === 12` (індекси наявних не зсунуто);
  - `a quiz may allow stealth` — `quizSchema` приймає `settings.buffs: ['stealth']`, `allowedBuffs` повертає `['stealth']`; вікторина без `settings.buffs` — `[]` (як і досі).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/shared/src/quiz.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за Interfaces.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/shared && tsc -p packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 29h stealth buff kind, an anonymous debuff notice and the owner's stealth mark in the views"
```

---

### Задача 2. Рушій: увімкнення, анонімна покупка, зрізи

**Files:**
- Create: `packages/engine/src/stealth.ts`, `packages/engine/src/game.stealth.test.ts`, `packages/engine/src/views.stealth.test.ts`.
- Modify:
  - `packages/engine/src/game.ts` — `StealthState`, `GameState.stealth?`, `DebuffState.anon?`, `ScoreAdjustment.anon?` (коментарі з «Рішень плану»); `removePlayer` (~1098) прибирає ключ вилученого з `state.stealth`, як із `state.debuffs`.
  - `packages/engine/src/adjust.ts` — `extra` у `addAdjustment` приймає `anon`.
  - `packages/engine/src/buffs.ts` — `takeBuff`: **першим рядком** `if (kind === 'stealth') return takeStealth(state, playerId, now)`; `fitBlock`: `case 'stealth': return 'unfit_type'` (до ряду не доходить, але `switch` вичерпний).
  - `packages/engine/src/debuffs.ts` — `buyDebuff`: після всіх перевірок `const anon = stealthReady(state, buyerId)`; коригування з `anon: true`; гілка «Оберіг» і звичайна — обидві через `spendStealth(charged, buyerId, seq)`; `DebuffState` з `anon: true`. `lastPurchase`: `buyer: last.anon === true ? null : {…}` (перевірка, що покупець є в грі, лишається для обох).
  - `packages/engine/src/breakdown.ts` — у `cached()` рядки коригувань з `anon` мають `anon: true` (`PlayerScoreLine.anon?`).
  - `packages/engine/src/views.ts`:
    - `playerDebuff`/`hostDebuff`: `debuff.anon === true` → `by: null, anon: true`;
    - `playerBuffs`: `allowed` без `stealth`; якщо лишився порожній — `null`, як без бафів;
    - `PlayerView.me.stealth` — `optional('stealth', stealthMark(state, participant))` (`participant` — id учасника рушія, у командах — команда);
    - `breakdowns` пульта: до `finished` — з рядків без `anon` (`groupByPlayer(scoreLines(state).filter((l) => l.anon !== true))`), на `finished` — як є; `myBreakdown` — без змін.
  - `packages/engine/src/restore.ts` — рядок 29h у коментарі версій.
  - `packages/engine/src/index.ts` — `export * from './stealth'`.

**Interfaces (Produces):**
```ts
// stealth.ts
/** Чи може баф діяти в цій грі: дозволений, купівля ввімкнена, є дебафи. */
export function stealthOffered(state: GameState): boolean;
/** Увімкнути (29h). Помилки по черзі: not_found, not_allowed, wrong_phase (lobby/guide/finished), buff_used. Пауза й shopBlock не заважають. */
export function takeStealth(state: GameState, participant: string, now: number): Result;   // stealth[participant] = { at: now, spent: null }
/** Увімкнено й ще не витрачено. */
export function stealthReady(state: GameState, participant: string): boolean;
/** Позначити витраченим анонімною покупкою з коригуванням seq; без готового бафа — той самий стан. */
export function spendStealth(state: GameState, participant: string, seq: number): GameState;
/** Позначка власника; undefined — !stealthOffered або lobby/guide. */
export function stealthMark(state: GameState, participant: string): StealthMark | undefined;
```

- [ ] **Step 1: Write the failing tests** (`game.stealth.test.ts`; фікстури — `makeRoundsQuiz(…, { buffs: ['stealth'], debuffs: ['fog', 'shake'] })`, гравці Оля, Петро, Тарас з балами ≥ ціни):
  - `turns on any time but once` — на `intro`, `question`, `reveal`, `leaderboard`, `round_end` і на паузі — `ok`; на `lobby`/`finished` — `wrong_phase`; удруге — `buff_used`; без `stealth` у `settings.buffs`, з `debuffShop: false` чи `debuffs: []` — `not_allowed`; `play.buffs`, `buffSeq`, `adjustments` не змінилися.
  - `an anonymous purchase names no one` — Оля вмикає, купує «Туман» Петру: коригування −200 під Олею з `anon: true`, `debuffs[Петро].by === Оля.id`, `anon: true`, `stealth[Оля].spent === seq`; `lastPurchase(state).buyer === null`.
  - `lasts until the first purchase, across rounds` — Оля вмикає в раунді 1, купує в раунді 2 — анонімно; наступна покупка Олі (наступний цикл) — без `anon`, з ім'ям.
  - `a failed purchase keeps it` — `points_short`, `debuff_busy`, `target_offline`, `debuff_bought` → `stealthReady` лишається `true`.
  - `a ward spends it` — «Оберіг» Петра гасить покупку: ціну списано, `anon: true`, баф витрачено, дебафу немає.
  - `the real buyer still counts` — після анонімної покупки друга в тому ж циклі — `debuff_bought`; `cancelDebuff(Петро)` → `not_allowed`; `gameCard(factInput, Оля).debuffs.sent === 1`, `Петро.got === 1`.
  - `the host's debuff is untouched` — `setDebuff` при ввімкненому бафі Олі — звичайний, `by: null`, без `anon`; баф Олі не витрачено.
  - `removing a player drops their stealth`.
  - `teams: the captain hides the team's attack` — у командній грі `takeStealth` під id команди; `buyDebuff` від команди — анонімний; ціль-команда.
- [ ] **Step 2: Write the failing tests** (`views.stealth.test.ts`):
  - `turning stealth on changes no one else's view` — `stageView`, `hostView`, `playerView(Петро)` до й після `takeStealth(Оля)` — `toEqual`; `playerView(Оля).me.stealth`: `'ready'` → `'armed'`; після покупки — `'used'`; у грі без бафа — поля немає.
  - `an anonymous purchase names no one` — після покупки Олі для Петра: у `stageView`, `hostView`, `playerView(Петро)`, `playerView(Тарас)` `debuffNotice.buyer === null`; `hostView.players[Петро].debuff` — `{ kind: 'fog', fired: false, by: null, anon: true }`; після `openQuestion` `playerView(Петро).me.debuff.by === null`, `anon: true`; `hostView.breakdowns[Оля].parts` без `debuff`, `playerView(Оля).me.myBreakdown` з `debuff` −200; на `finished` `hostView.breakdowns[Оля]` з `debuff`.
  - `stealth is not in the question buff row` — `buffs: [...BUFF_KINDS]`: `me.buffs.slots.map((s) => s.kind)` без `stealth`, довжина 13; `buffs: ['stealth']` → `me.buffs === null`.
  - `teams: the whole team sees the mark` — капітан вмикає; `me.stealth === 'armed'` в обох учасників команди, у суперників поля немає й зріз не змінився.
- [ ] **Step 3: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/engine/src/game.stealth.test.ts packages/engine/src/views.stealth.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** за Interfaces і «Рішеннями плану».
- [ ] **Step 5: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' packages/engine && tsc -p packages/shared && tsc -p packages/engine`. Expected: PASS (зокрема наявні `game.votes.test.ts`, `game.wall.test.ts`, `game.buffs-others.test.ts`, `views.buffs.test.ts`, `views.debuff-shop.test.ts`, `restore.test.ts`).
- [ ] **Step 6: Commit**
```bash
git add packages/engine
git commit -m "feat(engine): 29h stealth — turned on silently any time, the next debuff purchase is anonymous for the stage, the host and every phone, the real buyer stays in the state for stats"
```

---

### Задача 3. Сервер: капітан, тихий кадр, історія, ачівки

**Files:**
- Modify: `apps/server/src/rooms/manager.ts`:
  - `buff()`: `const who = this.act(room, playerId, kind === 'stealth' ? 'captain' : 'answerer')`; для `stealth` — `this.apply(room, result, { only: who.id })`;
  - `apply(room, result, options?: { only?: string })` → `commit(room, state, this.now(), false, options?.only)`; `commit` передає `only` у `emit(room, { type: 'changed', only })`;
  - `RoomEvent` `changed` має `only?: string` (коментар «29h: зміну бачить лише цей учасник рушія — гравець чи команда»).
- Modify: `apps/server/src/socket.ts` (~304) — `changed` з `only`: `members.filter((s) => s.data.identity.role === 'player' && s.data.identity.playerId !== null && (s.data.identity.playerId === only || teamOf(room.state, s.data.identity.playerId) === only)).forEach(push)`, без `scheduleDrafts`, без `pushedNow`. Інші слухачі `onEvent` перевірити: подія має лишатися для них звичайною зміною (запис гри не пропускає її).
- Modify: `apps/server/src/history.ts` — `hostGameWithFacts`: `const visible = row.status === 'finished' ? adjustments : adjustments.filter((a) => a.source !== 'debuff')`; `visible` — і в `factInputOf`, і в `detail.adjustments`. Якщо `history.facts.test.ts` звіряє `factInput` незавершеної гри з рушієм — звіряти з рушієм без коригувань `debuff` (пояснити в тесті).
- Test: `apps/server/src/socket.test.ts`, `apps/server/src/history.test.ts`, `apps/server/src/achievements.test.ts` (або `recorder.test.ts` — де вже є `debuffsBought`).

- [ ] **Step 1: Write the failing tests:**
  - `socket.test.ts` `stealth reaches only the owner's sockets` — сцена, пульт, Оля, Петро в кімнаті з `buffs: ['stealth']`; Оля шле `player:buff { kind: 'stealth' }` → `{ ok: true }`; за 200 мс нові кадри `state` має лише Оля (`me.stealth === 'armed'`); у Петра, сцени й пульта — нуль нових кадрів.
  - `socket.test.ts` `stealth in teams — the captain only, the whole team hears it` — не капітан → `not_captain`; капітан → кадри обом учасникам команди, жодного — суперникам.
  - `socket.test.ts` `an anonymous purchase over the socket` — після увімкнення Оля купує «Туман» Петру; у кадрах сцени, пульта й Петра `debuffNotice.buyer === null`, у пульта `players[…].debuff.by === null`.
  - `history.test.ts` `history of an unfinished game hides debuff purchases` — гра `active` з анонімною і звичайною покупкою: `hostGame(…).adjustments` без `source 'debuff'`; після `finished` — обидві, з ніком покупця й ціллю.
  - `prankster counts an anonymous purchase` — записана гра з однією анонімною покупкою: `debuffsBought` покупця = 1.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/server/src/socket.test.ts apps/server/src/history.test.ts apps/server/src/achievements.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/server && tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Expected: PASS (зокрема `scripts/evening-quiz.test.ts` і `scripts/demo-quiz.test.ts`).
- [ ] **Step 5: Commit**
```bash
git add apps/server
git commit -m "feat(server): 29h stealth — the captain turns it on for the team, only the owner's phones hear about it, an unfinished game's history shows no debuff purchases"
```

---

### Задача 4. Веб: аркуш «😈», позначка, «Хтось», редактор, тексти, довідка

**Files:**
- Modify:
  - `apps/web/src/buff-meta.ts` — `stealth: '◐'`.
  - `apps/web/src/screens/DebuffShop.tsx` — новий проп `stealth?: StealthMark`; на кроці 1 над списком дебафів рядок `.shop-stealth`: значок, «Прихований напад», опис `buffGuide_stealth` і кнопка: `ready` — «Увімкнути» (`player:buff { kind: 'stealth' }` через `useGuardedSend`, аркуш не закривається); `armed` — чип «🥷 Наступний напад анонімний»; `used` — вимкнена «Використано». Рядок видно й тоді, коли `shop.block !== null` (увімкнути можна завжди). Фокус-цикл аркуша охоплює нову кнопку.
  - `apps/web/src/screens/PlayerScreen.tsx` — `<DebuffShop … stealth={me.stealth} />`; коли `me.stealth === 'armed'` — рядок `.stealth-mark` «🥷 Наступний напад анонімний» у шапці під кнопками (усім учасникам команди, не лише капітану); на 320 px — один рядок з `text-overflow: ellipsis`, без горизонтального скролу.
  - `apps/web/src/live/LiveNotices.tsx` — `DebuffToast`: `buyer === null` → `debuffAnonNotice`; коментар.
  - `apps/web/src/screens/Debuffs.tsx` (~365) і `DebuffStrip` — `anon` → `debuffCastAnon`.
  - `apps/web/src/screens/HostPlayerTools.tsx` — `debuffTagText`: `anon` → `debuffWaitingAnon`/`debuffFiringAnon`; `DebuffPanel`: `anon` — як куплений (`debuffBought`, без «Скасувати»).
  - `apps/web/src/editor/PowersEditor.tsx` — попередження `powersStealthNeedsShop`, якщо `buffs.includes('stealth') && (!shopOn || debuffs.length === 0)`.
  - `apps/web/src/i18n.ts` + `locales/{en,pl,de,es,it,ar}.json` — ключі `ADDED_29H` (нижче).
  - `apps/web/src/i18n.test.ts` — `ADDED_29H`, дві перевірки (uk має, кожна мова має), умова `adds no uk keys beyond the agreed list`.
  - Довідка: `help-uk.ts` — `buff.stealth.title/what/how.0–2/points.0/tip.0/limits.0–2`; `__fixtures__/help-uk-golden.json`; `locales/*.help.json`.
  - Тести, що фіксують `BuffKind` чи `DebuffNotice` (`team-test-view.ts`, `LiveNotices.test.tsx`, `Buffs.test.tsx`, `QuizEditor.test.tsx`, `host-help.test.ts`, `guide`-тести) — оновити.

**Тексти uk** (`ADDED_29H = ['buff_stealth', 'buffTip_stealth', 'buffGuide_stealth', 'buffWhere_stealth', 'stealthTake', 'stealthArmed', 'stealthUsed', 'debuffAnonNotice', 'debuffCastAnon', 'debuffWaitingAnon', 'debuffFiringAnon', 'powersStealthNeedsShop']`):
- `buff_stealth`: «Прихований напад»; `buffTip_stealth`: «наступний куплений дебаф — без імені»; `buffGuide_stealth`: «Наступний ваш дебаф буде анонімним — навіть для ведучого.»; `buffWhere_stealth`: «Де: будь-коли, у кнопці «😈 Дебафи».»;
- `stealthTake`: «Увімкнути»; `stealthArmed`: «🥷 Наступний напад анонімний»; `stealthUsed`: «Використано»;
- `debuffAnonNotice`: «Хтось насилає дебаф на гравця {target}»; `debuffCastAnon`: «Хтось насилає на вас: {name}»; `debuffWaitingAnon`: «{icon} {name} від когось · чекає»; `debuffFiringAnon`: «{icon} {name} від когось · діє»;
- `powersStealthNeedsShop`: «Прихований напад працює лише тоді, коли гравці можуть купувати дебафи.»
- Довідка `buff.stealth`: що — «Наступний дебаф, який купить гравець, буде анонімним для всіх, навіть для ведучого.»; як — «Гравець вмикає баф у кнопці «😈 Дебафи» будь-коли під час гри; ніхто про це не дізнається.», «Телефон гравця показує «🥷 Наступний напад анонімний». Баф діє до першої покупки дебафа й не згоряє в кінці раунду.», «Сцена, пульт і жертва бачать «Хтось насилає дебаф на гравця Петро».»; бали — «Ціна дебафа списується як завжди, тож уважні гравці можуть помітити, що рахунок покупця зменшився.»; порада — «Найкраще — проти лідера, щоб не нажити ворога.»; обмеження — «Лише з купівлею дебафів гравцями.», «Раз за гру. У командній грі вмикає й купує капітан.», «Хто насилав, видно в історії гри після її кінця.».

- [ ] **Step 1: Write the failing tests:**
  - `DebuffShop.test.tsx` `turns stealth on from the sheet` — `stealth: 'ready'` → «Увімкнути» шле `player:buff { kind: 'stealth' }`; `armed` — чип; `used` — вимкнено; рядок видно й при `block: 'bought'`.
  - `PlayerScreen.test.tsx` `the stealth mark for the whole team` — `me.stealth: 'armed'` у не-капітана — `.stealth-mark` є, аркуша немає.
  - `LiveNotices.test.tsx` `an anonymous purchase says someone` — `buyer: null` → «Хтось насилає дебаф на гравця Петро».
  - `Debuffs.test.tsx` `the victim does not learn the buyer` — `anon: true` → «Хтось насилає на вас: Туман».
  - `HostPlayerTools`/`HostScreen.test.tsx` `the host does not learn the buyer` — тег «🌫️ Туман від когось · чекає», кнопки «Скасувати дебаф» немає.
  - `PowersEditor`/`QuizEditor.test.tsx` `stealth warns without the shop` — `stealth` + `debuffShop: false` → попередження.
  - `i18n.test.ts` — `ADDED_29H` у всіх мовах.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web/src/screens/DebuffShop.test.tsx apps/web/src/live/LiveNotices.test.tsx apps/web/src/i18n.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Переклади — природні, без ru; у `ar.json` — арабською.
- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 --exclude '.claude/**' apps/web && pnpm typecheck`. Expected: PASS (зокрема `help-golden.test.ts`, `host-help.test.ts`, `source-scan.test.ts`).
- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): 29h stealth — a toggle in the debuff sheet, the owner's 🥷 mark, «someone» in the notice, the victim's banner and the host's tag, an editor warning, texts in seven languages and help"
```

---

### Задача 5. Наскрізні сценарії й кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`. Додати `it('part 29h: …')` після блоку `part 29e` і помічники `stealthQuiz29h(teams)` (два класичні раунди по 2 запитання ≥ 25 с, `buffs: ['stealth']`, `debuffs: ['fog', 'shake']`, ціни 200) і `noBuyer29h(frames, nickname)` — жоден кадр не має `debuffNotice.buyer`, `me.debuff.by` чи `players[].debuff.by`, рівного ніку/id.

**Сценарії** (таймери ≥ 25 с):
1. `it('part 29h: stealth — turned on silently from the debuff sheet at 320 px, the next purchase is anonymous on the stage, the host and every phone, the second purchase is named, the history shows the buyer after the game')`:
   - Оля (320 px), Петро, Тарас; перше запитання — правильні відповіді, щоб мати бали;
   - на `reveal` Оля відкриває «😈», торкається «Увімкнути»: на її телефоні «🥷 Наступний напад анонімний»; за 1 с у `socketFrames` сцени, пульта, Петра й Тараса — **нуль нових кадрів**; кадр `stealth29h-sheet-320`;
   - на наступному `intro`/`question` Оля купує «Туман» Петру: сцена, пульт і Тарас показують «Хтось насилає дебаф на гравця Петро»; на пульті тег Петра «від когось», кнопки «Скасувати дебаф» немає; у Петра на запитанні — «Хтось насилає на вас: Туман»; `noBuyer29h` для сцени, пульта, Петра й Тараса; у Олі позначки більше немає, у аркуші — «Використано»; кадри `stealth29h-stage-notice`, `stealth29h-host-tag`, `stealth29h-victim-320`;
   - у другому раунді Оля купує «Тремтіння» Тарасу — сповіщення вже «Оля насилає дебаф на гравця Тарас»;
   - `expectPhoneFit` для Олі;
   - кінець гри → історія ведучого: «Оля купує 🌫️ Туман для гравця Петро» і рядок про Тараса; до кінця (`GET` історії за id гри посеред гри) — рядків покупок немає.
2. `it('part 29h: stealth in teams — the captain turns it on, the whole team sees the mark, the rivals see nothing, a restart keeps it, the attack is anonymous, 320 px')`:
   - 2 команди по 2 учасники, телефон не-капітана А — 320 px;
   - капітан А вмикає → «🥷 Наступний напад анонімний» в обох учасників А; у команди Б і сцени — нуль нових кадрів;
   - `restart()` → позначка лишилася;
   - капітан А купує «Туман» команді Б → у Б «Хтось насилає на вас: Туман», на сцені «Хтось насилає дебаф на гравця Б»; `noBuyer29h`;
   - кадри `stealth29h-teams-mark-320`, `stealth29h-teams-stage`.

- [ ] **Step 1: Write the scenarios** за зразком `part 9c` (купівля дебафа, аркуш «😈») і `part 29f` (`socketFrames`, `restart`, `expectPhoneFit`, `shot`).
- [ ] **Step 2: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 29h"`. Expected: PASS; кадри в `artifacts/shots`.
- [ ] **Step 3: Переглянути кадри.** Перевірити, що:
  - рядок «Прихований напад» на 320 px не переносить кнопку «Увімкнути» за край і не ламає список дебафів;
  - позначка «🥷 Наступний напад анонімний» в один рядок, не перекриває таймер і кнопки шапки;
  - сповіщення сцени й тег пульта читаються, ніде немає ніка покупця.
- [ ] **Step 4: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 29h stealth — silent toggle at 320 px, an anonymous purchase on every screen, a named second purchase, history after the game, teams and a restart"
```
