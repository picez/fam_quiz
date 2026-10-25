# План 11e: «Ва-банк» — рішення й банки інших

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 11e специфікації `docs/superpowers/specs/2026-10-25-after-formats-design.md` (розділ 9, п. 3 побажань; відповідь власника — розділ 15, п. 1). Слова власника: «ва-банк треба щоб гравці бачили ставки інших». Правило формату: рішення «Далі / Забрати» таємне й одночасне, тож вибір інших відкривається лише після закриття вікна. Решта (банки) видна завжди.
- **Під час запитання.**
  - Телефон: під запитанням компактна смужка «У грі: Оля 600 · Петро 300 · …».
  - Сцена: збоку від запитання колонка з тими, хто в грі, і їхніми банками. Відповідей там немає.
  - Банки — на початок запитання. Поточне запитання до розкриття нічого не змінює, як і зараз.
- **Розкриття.** Сцена (та сама колонка) і телефони (список під своїм вердиктом) бачать, хто з тих, хто грав сходинку, відповів правильно («✓ 100 → 300»), а хто згорів («✗ банк 100 згорів»). Список бачать і ті, хто вже вибув.
- **Вікно рішення** — як зараз:
  - банки всіх на початок вікна;
  - «Вирішили 3 з 5» і позначки «✓ вирішив»;
  - свій вибір — лише собі;
  - пульт бачить вибір наживо.
- **Вікно закрилося** (усі вирішили або сплив час). Сцена, телефони й пульт показують **екран «Рішення»**. Кожен, хто був у грі на початку вікна, має позначку:
  - «Забрано 600» (зелена);
  - «Далі з 600» (смілива);
  - «Без вибору — забрано 600» — не вибрав, банк забрано за замовчуванням.

  Телефон показує той самий список зі своїм рядком, виділеним `is-me`, і свій рядок стану над ним. Екран тримається, поки ведучий не натисне «Далі», але **не менше 3 с** (мінімальний час 11b для цього екрана — 3 с, а не 2).
- **Після раунду** — драбина з групами «Забрали / Донесли / Згоріли», як зараз.
- **Командна гра** — те саме, де рядок — команда (назва команди, банк команди). Вирішує капітан, товариші бачать «Капітан вирішує за команду…», як зараз.

**Стан гри: `GAME_STATE_VERSION` 12 → 13.** Специфікація каже «стан без змін», але один пункт без стану не зробити (див. «Рішення плану», перший пункт):
- новий необов'язковий ключ `WipeoutPlay.auto?: string[]` — хто забрав банк за замовчуванням, коли вікно закрилося;
- `READABLE_STATE_VERSIONS = [2, …, 12, 13]`. Зміна лише адитивна. Кімната версії 12 відновлюється без `auto`: усі, хто забрав у такому вікні, показуються як «Забрано …», без «Без вибору»;
- **пуш не обриває живих ігор,** але перед пушем діє правило 14a підпроєкту 10 (перевірити `live_room`). У звіті власникові треба назвати підняття версії й те, що живі ігри його переживають.

**Архітектура:**
- **Shared.**
  - `packages/shared/src/game.ts`: `PACE_MS.decisions = 3000`.
  - `packages/shared/src/views.ts`:
    - тип `WipeoutChoice`;
    - `WipeoutRow.choice`, `WipeoutRow.prev`;
    - `WipeoutInfo.decisions`.
- **Рушій.**
  - `packages/engine/src/game.ts`: `WipeoutPlay.auto`; вилучення гравця прибирає його й з `auto`.
  - `packages/engine/src/wipeout.ts`:
    - `closeDecision` пише `auto`;
    - нові чисті функції `decisionsShown` і `wipeoutChoiceOf`.
  - `packages/engine/src/pacing.ts`: екран рішень — `PACE_MS.decisions`.
  - `restore.ts`: версія 13.
  - `views.ts`: `choice`, `prev`, `decisions` у `wipeoutInfo`.
- **Сервер.** Без змін. Мітку кроку вже ставить `commit` → `stamp`: закриття вікна змінює `stepKey` (`decisionOpen` у ключі).
- **Веб.**
  - `apps/web/src/screens/WipeoutLadder.tsx`: група «Рішення» в `WipeoutPlayers`, нові `WipeoutStrip`, `WipeoutStepList`, `WipeoutSide`.
  - `WipeoutDecision.tsx`: свій рядок на екрані рішень.
  - `StageScreen.tsx`, `PlayerScreen.tsx`.
  - `i18n.ts`, `styles.css`.
- **Довідка ведучого:** `apps/web/src/help/rounds.ts` (`round.wipeout`), `apps/web/src/help/settings.ts` (`settings.pacing`).
- **Наскрізні тести.** Два сценарії 11e з кадрами `p11e-` і навмисні правки сценарію 10g.

**Технології:** TypeScript, vitest, Fastify + Socket.IO, React 19 + Vite, Testing Library (jsdom), Playwright. Нових залежностей немає.

**Рішення плану там, де специфікація мовчить або суперечить сама собі (координатор може змінити):**

*Чому ключ стану (`WipeoutPlay.auto`)*
- Специфікація вимагає позначки для тих, хто не вибрав (розділ 9, п. 4), і водночас каже «стан без змін» (п. 6).
- `closeDecision` дописує невирішених у кінець `took`, і з журналу вже не видно, хто з `took` забрав сам, а хто за замовчуванням. Порядок не допомагає: невідомо, скільки рішень було добровільних.
- Обхід через пам'ять кімнати (сервер пам'ятає, хто натискав) зламався б після перезапуску. До того ж він вимагав би домішувати дані в три зрізи (сцена, телефони, пульт) поза рушієм.
- Тому один необов'язковий ключ — найменша зміна. Без ключа поведінка стара.
- Ключ пишеться **лише тоді, коли хтось забрав за замовчуванням** (непорожній масив). Тож вікно, де всі вирішили самі, лишає `WipeoutPlay` у старій формі `{ took, stay, end }`, і наявні `toEqual` таких випадків не змінюються.
- Якщо координатор не хоче підняття версії: задача 1 без `auto` і без версії, `choice` не має значення `'auto'`, а «Без вибору» не показується. Решта плану від цього не залежить.

*Вибір (`WipeoutChoice`)*
- `type WipeoutChoice = 'took' | 'stay' | 'auto'`.
- `wipeoutChoiceOf(play, id)`:
  - `stay.includes(id)` → `'stay'`;
  - `(auto ?? []).includes(id)` → `'auto'`;
  - `took.includes(id)` → `'took'`;
  - інакше `null`.
- `decisionsShown(state)` — екран рішень є, коли виконано все:
  - `state.phase === 'leaderboard'`;
  - `inWipeoutRound(state)`;
  - `wipeoutPlayOf(state) !== null`;
  - `!decisionOpen(state)`.

  Відкрите вікно на паузі (`remainingMs`) — це ще вікно, не екран рішень. Кінець раунду посеред вікна (`endRound`) веде одразу на `round_end`, де екрана рішень немає (там групи, як зараз).
- `WipeoutRow.choice` = `decisionsShown(state) ? wipeoutChoiceOf(play, p.id) : null`. Це однаково для сцени, телефонів і пульта. Рядки тих, хто на початку вікна вже не був у грі, мають `null` (їх немає в `took` / `stay` цього запитання).
- `WipeoutInfo.decisions = decisionsShown(state)`.
- `WipeoutRow.decision` не змінюється: `pending` / `decided` / `stay` / `take` лише у відкритому вікні, після закриття — `null`. Отже наявні перевірки «`"decision":"take"` не доходить до сцени» лишаються чинними. Нове поле має іншу назву.
- Банк у позначці — `row.bank`:
  - для `'took'` / `'auto'` статус `took`, банк забрано;
  - для `'stay'` статус `in`, банк поточний.

*Банк до сходинки (`WipeoutRow.prev`)*
- `prev` — банк гравця на початку поточного запитання, якщо він тоді був у грі (`wipeoutTable(state, roundIndex, questionIndex)[id].status === 'in'`). Лише на етапі `reveal`; на будь-якому іншому етапі й для тих, хто не грав сходинку, — `null`.
- На `question` і `locked` `prev` завжди `null`: так банк після відповіді не просочується до розкриття. Наявне правило `wipeoutTables` (поточне запитання з вердиктом до розкриття не враховується) не змінюється.
- Рядок списку сходинки (`WipeoutStepList`) для `prev !== null`:
  - `status === 'in'` (відповів правильно) → «✓», «{prev} → {bank}»;
  - `status === 'burned' && step === info.current` → «✗», «банк {prev} згорів».

  Ручна оцінка на розкритті (текст «Зарахувати» / «Відхилити») міняє рядок одразу: зріз перебудовується.

*Мінімальний час екрана рішень*
- `PACE_MS.decisions = 3000`.
- `paceWindow`, етап `leaderboard`: `if (decisionsShown(state)) return span(at, PACE_MS.decisions);` — після перевірок `trialOpen` і `decisionOpen || decisionPending`, перед загальним `PACE_MS.step`.
- `at` — `stepAt` закриття вікна:
  - `decideWipeout` → `settleDecision` → `commit` о `now`;
  - `tick` → `commit` о `endsAt`;
  - вилучення гравця, що закрило вікно, → `commit` о `now`.

  Тож 3 с рахуються від миті, коли екран рішень з'явився.
- Без `stepAt` (стан до 11b) мінімального часу немає, як і для решти кроків.
- Кнопка пульта вже заповнюється смужкою за `hostView.pace.next`. На вебі нічого не змінюється.

*Що бачать екрани*
- **Смужка телефону (`WipeoutStrip`)** на `question` і `locked`, для всіх (у грі, вибулих, товаришів у командній грі). Вона стоїть над полем відповіді чи рядком «Ти вже не граєш…».
  - Рядок `p.wipeout-strip-phone`: «У грі:» і пари «ім'я банк» через « · ».
  - Лише `status === 'in'`, за спаданням банку, за рівного — у порядку гравців.
  - Щонайбільше `WIPEOUT_STRIP_MAX = 8` пар. Свій рядок завжди видно: якщо він не в перших восьми, дописується в кінець.
  - Наприкінці «ще {n}», якщо когось не показано.
  - Свій рядок має `span.is-me`.
- **Колонка сцени (`WipeoutSide`)** — `aside.wipeout-side` у `Question` сцени на `question`, `locked` і `reveal`, коли `view.wipeout !== null`. Корінь отримує клас `has-wipeout-side`.
  - На `question` / `locked`:
    - заголовок «У грі · {n}»;
    - рядки «ім'я — банк» тих, хто в грі, за спаданням банку, щонайбільше `WIPEOUT_SIDE_MAX = 12`, далі «ще {n}»;
    - знизу рядок `p.meta` «Забрали: {took} · Згоріли: {burned}», лише коли є хоч один такий гравець.
  - На `reveal` — `WipeoutStepList` (`size="stage"`), щонайбільше 12 рядків, далі «ще {n}». Порядок: спершу правильні за спаданням банку, потім згорілі.
  - Наявний рядок `.wipeout-strip` «Сходинка N з M · ціна» лишається в шапці. Сходинок у колонці немає: місце потрібне банкам.
- **Список сходинки на телефоні** (`WipeoutStepList`, `size="phone"`) на `reveal` у `Result`: під рядком банку (для тих, хто в грі) і під «Ти дивишся» (для тих, хто вибув). Без обмеження кількості (телефон прокручується вниз). Свій рядок має `is-me`. Заголовок «Як пройшли сходинку».
- **Екран рішень.**
  - `WipeoutPlayers` (сцена, телефон, пульт), коли є рядки з `choice !== null`:
    - перша група — `section.wipeout-group.is-choices` з заголовком «Рішення»;
    - у групі рядки з `choice` у порядку гравців: `span.name` і `span.wipeout-choice.is-took|is-stay|is-auto` з текстом позначки (банк — у тексті, окремого `.score` немає);
    - далі звичайні групи **без** цих рядків. Хто вибув раніше, лишається у своїй групі («Забрали» / «Згоріли»), тож банки всіх видно й тут.
  - `WipeoutBetween` сцени: заголовок «Рішення» замість «Драбина», коли `info.decisions`.
  - Телефон: `WipeoutDecision` на екрані рішень показує свій рядок:
    - `'stay'` → «Ти йдеш далі з {bank}»;
    - `'auto'` → «Без вибору — забрано {bank}»;
    - `'took'` → наявне «Забрано {bank}».
  - Пульт: `HostWipeout` без змін у коді. Група «Рішення» приходить через `WipeoutLadder size="host"`.
- **Тексти позначок без роду:** «Забрано 600», «Далі з 600», «Без вибору — забрано 600». Специфікація пише «Забрав» і «час сплив — забрав». Рішення плану:
  - безособові форми, як уже наявне «Забрано {bank}» на телефоні, бо стать гравця невідома;
  - «Без вибору» замість «час сплив», бо вікно закривається раніше й без відсутнього гравця, а він теж «не вибрав».

*Командна гра*
- Рядки драбини — команди (`blitzPlayer` дає назву команди). `choice` — за id команди.
- `highlightId={me.id}`, як зараз (id команди в зрізі команди).
- Нового коду для команд немає. Задача 2 перевіряє зрізи, задача 6 — кадри.

*Пульт 11c*
- «Відповіді наживо» для «Ва-банк» не змінюються (лише ті, хто в грі, на `question`). Вибір наживо ведучий бачить у `HostWipeout`, як і раніше.

*Чого не робимо*
- вибору інших наживо, поки вікно відкрите (ні сцені, ні телефонам);
- зміни правил, балів, тривалості вікна (10 с) чи рішення за замовчуванням;
- екрана рішень після `endRound` посеред вікна й після останнього запитання (там вікна немає — підсумки раунду);
- змін у «Відповідях наживо», історії гри й профілі;
- сходинок у колонці сцени під час запитання;
- нового демо-вмісту (тексти e2e — без тем росії й СРСР).

## Глобальні обмеження

- **Анти-ціль:** чужий вибір не потрапляє на сцену чи чужий телефон, поки вікно відкрите (зокрема на паузі). Банк після відповіді не потрапляє нікуди до розкриття. Перевіряють:
  - задача 2 — зрізи: `choice === null` і JSON без `"choice":"` у відкритому вікні; `prev === null` і JSON без `"prev":` з числом на `question` / `locked`;
  - задача 6 — сокетні кадри.
- Бали, правила «Ва-банк», `took` / `stay` / `end`, `hostView(...).responses` і «Відповіді наживо» не змінюються. Новий ключ стану — лише `WipeoutPlay.auto`.
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`, тексти довідки — лише в `apps/web/src/help/*.ts`.
- Сцена 1280 × 720 без прокрутки. Телефон 360–375 px і пульт 375 px без горизонтальної прокрутки.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2`. Якщо PGlite падає з браком пам'яті, запускати окремо:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=1 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- Наскрізні тести: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts`.
  - **Повний прогін триває близько 31 хвилини, і машині може забракнути пам'яті.** Задача 6 запускає свої сценарії (`-t "part 11e"`) і 10g, а повний прогін — **один раз у фоні** наприкінці.
  - Затримка 11b в e2e увімкнена (`pacing: true`). Кнопки пульта чекають, доки стануть активними, без снів.
  - Кадри лежать в `apps/server/e2e/artifacts/shots`, префікс 11e — `p11e-`.
- Новий вміст (тексти e2e, приклади в довідці) — без тем росії й СРСР.
- Після останньої задачі й фінальної рецензії гілку зливають у `main`. Перед пушем — перевірка `live_room` (правило 14a) і рядок у звіті про версію 13.

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/game.ts`, `packages/engine/src/game.ts`, `wipeout.ts`, `pacing.ts`, `restore.ts`, `game.wipeout.test.ts`, `pacing.test.ts`, `restore.test.ts` | `auto`, `decisionsShown`, `wipeoutChoiceOf`, 3 с на екрані рішень, версія 13 | 1 |
| `packages/shared/src/views.ts`, `packages/engine/src/views.ts`, `views.wipeout.test.ts`; фікстури вебу (лише нові поля) | `choice`, `prev`, `decisions` | 2 |
| `apps/web/src/screens/WipeoutLadder.tsx`, `WipeoutLadder.test.tsx`, `WipeoutDecision.tsx`, `WipeoutDecision.test.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css` | група «Рішення», `WipeoutStrip`, `WipeoutStepList`, `WipeoutSide`, свій рядок | 3 |
| `apps/web/src/screens/StageScreen.tsx`, `PlayerScreen.tsx`, `StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `HostWipeout.test.tsx`, `styles.css` | колонка сцени, смужка й список на телефоні, заголовок «Рішення» | 4 |
| `apps/web/src/help/rounds.ts`, `help/settings.ts`, `help/host-help.test.ts` | довідка | 5 |
| `apps/server/e2e/full-game.e2e.ts` | сценарії 11e, навмисні правки 10g | 6 |

## Порядок збирання

- 1 → 2 → 3 → 4 → 6. Задача 5 — будь-коли після 1 (бере `PACE_MS.decisions`).
- **Навмисні зміни наявних очікувань** (лише такі):
  - `game.wipeout.test.ts`: `toEqual` повного `WipeoutPlay` після закриття вікна з невирішеними — плюс `auto` («no choice means take» → `auto: ['p2']`; «an absent player does not hold the window» → `auto: ['p3']`; «ending the round / game mid-window», якщо там `toEqual` повного `WipeoutPlay`) (задача 1);
  - `pacing.test.ts`: ««Ва-банк»: … its end by tick stamps and gives 2 s» → 3 с, назва `… gives 3 s for the decisions screen (11e)` (задача 1);
  - `restore.test.ts`: `READABLE_STATE_VERSIONS` → `[2, …, 13]`, `STATE_SHAPE.WipeoutPlay`, новий `KEYS[13]` (задача 1);
  - фікстури вебу з `WipeoutRow` / `WipeoutInfo` (`WipeoutLadder.test.tsx`, `WipeoutDecision.test.tsx`, `HostWipeout.test.tsx`, `StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `HostScreen.test.tsx`): плюс `choice: null`, `prev: null`, `decisions: false` (задача 2);
  - e2e 10g (задача 6, перелік там).
  - Якщо падає інше, рецензент розбирає причину, а не правку очікування.

## На що дивитися рецензентові

1. **Таємність вікна.** Поки `decisionOpen` (і на паузі), `choice === null` у всіх зрізах і `decisions === false`. Пульт, як і раніше, бачить `decision: 'take' | 'stay'`. Тести: задача 2, кадри задачі 6.
2. **Банк до розкриття.** `prev === null` на `question` / `locked`. Смужка й колонка показують банки на початок запитання. Тести: задача 2, сокетні кадри задачі 6.
3. **«Без вибору».** `auto` пишеться лише в `closeDecision` і лише непорожнім. Вилучення прибирає гравця з `auto`. Стан версії 12 без `auto` дає `'took'`. Тести: задачі 1 і 2.
4. **3 с.** `paceWindow` для екрана рішень — від `stepAt` закриття, 3000 мс. Решта `leaderboard` — 2000. Тести: задача 1, перевірка кнопки в задачі 6.
5. **Стан гри.** Версія 13, читабельні 2–13, новий ключ лише в `WipeoutPlay`. Тести: задача 1.
6. **Вигляд.** Колонка сцени не перекриває запитання й варіанти, сцена 1280 × 720 без прокрутки. Смужка телефону не дає горизонтальної прокрутки на 375 px. Кадри `p11e-*`.

---

### Задача 1. Рушій: хто забрав за замовчуванням, екран рішень, 3 с, версія 13

**Files:**
- Modify: `packages/shared/src/game.ts`, `packages/engine/src/game.ts` (`WipeoutPlay`, вилучення гравця), `packages/engine/src/wipeout.ts`, `packages/engine/src/pacing.ts`, `packages/engine/src/restore.ts`, `packages/engine/src/index.ts` (експорт нових функцій, якщо `wipeout.ts` експортується поіменно)
- Test: `packages/engine/src/game.wipeout.test.ts`, `packages/engine/src/pacing.test.ts`, `packages/engine/src/restore.test.ts`

**Interfaces:**
- `packages/shared/src/game.ts`:
  ```ts
  export const PACE_MS = { step: 2000, row: 1000, intro: 3000, lock: 3000, decisions: 3000 } as const;
  ```
  Коментар над `PACE_MS` доповнити: «decisions — екран рішень «Ва-банк» після закриття вікна (11e)».
- `packages/engine/src/game.ts`, `WipeoutPlay` — після `end`:
  ```ts
  /** Хто забрав банк за замовчуванням, коли вікно закрилося (11e); лише непорожній; немає — усі вирішили самі або стан до 11e. */
  auto?: string[];
  ```
- Вилучення гравця (блок `if (play.wipeout !== undefined)` у `kick`):
  ```ts
  kept.wipeout = { ...play.wipeout, took: without(play.wipeout.took), stay: without(play.wipeout.stay), ...(play.wipeout.auto === undefined ? {} : { auto: without(play.wipeout.auto) }) };
  ```
- `packages/engine/src/wipeout.ts`:
  ```ts
  /** Невирішені в грі → took і auto (11e: auto лише непорожній); startedAt/endsAt/remainingMs null; підсумок — withTotals. */
  export function closeDecision(state: GameState): GameState; // auto: [...(play.wipeout.auto ?? []), ...undecided] лише коли undecided.length > 0
  /** Екран рішень (11e): leaderboard «Ва-банк» із записом поточного запитання після закриття вікна. */
  export function decisionsShown(state: GameState): boolean;
  /** Відкритий вибір гравця в записі запитання (11e): stay → 'stay', auto → 'auto', took → 'took', інакше null. */
  export function wipeoutChoiceOf(play: Play & { wipeout: WipeoutPlay }, playerId: string): WipeoutChoice | null;
  ```
  `WipeoutChoice` — тип із `@quiz/shared` (задача 2 додає його до `views.ts`; у цій задачі оголосити його там одразу, щоб рушій компілювався):
  ```ts
  /** Відкритий вибір у «Ва-банк» після закриття вікна (11e): took — забрав сам; stay — далі; auto — не вибрав, банк забрано за замовчуванням. */
  export type WipeoutChoice = 'took' | 'stay' | 'auto';
  ```
- `packages/engine/src/pacing.ts`, `paceWindow`, `case 'leaderboard'`:
  ```ts
  if (trialOpen(state)) return span(state.startedAt ?? at, PACE_MS.lock);
  if (decisionOpen(state) || decisionPending(state)) return null;
  // Екран рішень «Ва-банк» (11e): усі мають прочитати, хто що вибрав.
  if (decisionsShown(state)) return span(at, PACE_MS.decisions);
  return span(at, PACE_MS.step);
  ```
- `restore.ts`:
  - `GAME_STATE_VERSION = 13`, рядок у переліку: `13 — 11e: WipeoutPlay.auto (хто забрав банк за замовчуванням, коли вікно закрилося).`;
  - `READABLE_STATE_VERSIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, GAME_STATE_VERSION]` з поясненням: «12 → 13 лише додала необов'язкове WipeoutPlay.auto. Без нього екран рішень показує всіх, хто забрав, як «Забрано …», без «Без вибору». Тож кімната, збережена до розгортання 11e, теж відновлюється».

- [ ] **Step 1: Write the failing tests**
  - `game.wipeout.test.ts`, у `describe('decisions (10g)')` новий `describe('decisions screen (11e)')` з тими самими помічниками (`revealed`, `decide`):
    - вікно відкрите (`next(revealed(), 2000)`) → `decisionsShown(s)` → `false`; на паузі (`pause(s, 2500)`) → `false`;
    - на `reveal` (`revealed()`) → `false`;
    - p1 «Далі», p2 «Забрати», p3 нічого, `tick(s, 12_000)`:
      - `s.plays[0].wipeout` → `{ took: ['p2', 'p3'], stay: ['p1'], end: false, auto: ['p3'] }`;
      - `decisionsShown(s)` → `true`;
      - `wipeoutChoiceOf(play, 'p1' | 'p2' | 'p3')` → `'stay'`, `'took'`, `'auto'`;
      - бали p3 → 100 (як і раніше);
    - усі троє вирішили самі (p1 і p2 «Далі», p3 «Забрати») → вікно закрилося через `settleDecision`, `'auto' in s.plays[0].wipeout` → `false`, `decisionsShown(s)` → `true`;
    - p3 поза зв'язком, p1 і p2 вирішили → `auto: ['p3']`;
    - після екрана рішень `next(s, 20_000)` → `question`, `decisionsShown` → `false`;
    - `endRound` посеред вікна → `round_end`, `decisionsShown` → `false`, у записі `auto` — невирішені;
    - вилучення p3 після закриття вікна з `auto: ['p3']` → `auto: []`, `took` без p3;
    - бали й драбина не змінилися: наявні тести `game.wipeout.test.ts`, `game.wipeout-isolation.test.ts`, `game.teams-formats.test.ts` зелені (з навмисними `auto` вище).
  - `pacing.test.ts`:
    - наявний тест ««Ва-банк»: no window while the decision is open; its end by tick stamps and gives 2 s» → `until: endsAt + 3000`, нова назва `«Ва-банк»: no window while the decision is open; its end by tick stamps and gives 3 s for the decisions screen (11e)`;
    - новий тест «the last decision closes the window and the decisions screen waits 3 s from that moment»: обидва гравці вирішили о `T0 + 7000` (`stamp(s, decided, T0 + 7000)`) → `stepAt === T0 + 7000`, `paceWindow(…, 'next')` → `{ from: T0 + 7000, until: T0 + 10_000 }`, `hostView(…).pace.next` — те саме, `tooSoon(…, 'next', T0 + 9999)` → `true`, `T0 + 10_000` → `false`;
    - `PACE_MS.decisions` → 3000;
    - таблиця класичного раунду (`leaderboard: 'each'`) лишається 2 с (наявний тест зелений).
  - `restore.test.ts`:
    - `STATE_SHAPE.WipeoutPlay` → `['took', 'stay', 'end', 'auto']`;
    - `KEYS[13]` — копія `KEYS[12]` з `WipeoutPlay: 'auto,end,stay,took'`;
    - `READABLE_STATE_VERSIONS` → `[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]`;
    - `representative()` + стан «Ва-банк» після вікна, закритого таймером (`auto` є);
    - новий тест «a wipeout play of version 12 (no auto) restores and shows every take as a plain take»: запис `{ took: ['p2', 'p3'], stay: ['p1'], end: false }` на `leaderboard` після закриття переживає `suspend` і JSON. `wipeoutChoiceOf(…, 'p3')` → `'took'`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/game.wipeout.test.ts packages/engine/src/pacing.test.ts packages/engine/src/restore.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src packages/engine/src
  git commit -m "feat(engine): wipeout remembers who took the bank by default when the window closed (state version 13, version 12 still readable), knows when the decisions screen is up and what each player chose, and the host waits 3 s on that screen instead of 2"
  ```

### Задача 2. Зрізи: вибір після вікна, банк до сходинки, екран рішень

**Files:**
- Modify: `packages/shared/src/views.ts`, `packages/engine/src/views.ts`
- Test: `packages/engine/src/views.wipeout.test.ts`; фікстури вебу (лише нові поля, там, де падає `pnpm typecheck`)

**Interfaces:**
- `packages/shared/src/views.ts`:
  - `WipeoutRow` — після `decision`:
    ```ts
    /** Екран рішень (11e): що вибрав гравець, який був у грі на початку вікна; усім однаково. Поки вікно відкрите й поза екраном — null. */
    choice: WipeoutChoice | null;
    /** Розкриття (11e): банк на початку поточного запитання, якщо гравець його грав; інакше null (і завжди null до розкриття). */
    prev: number | null;
    ```
  - `WipeoutInfo` — після `decide`:
    ```ts
    /** Екран рішень після закриття вікна (11e). */
    decisions: boolean;
    ```
- `packages/engine/src/views.ts`, `wipeoutInfo(state, forHost)`:
  ```ts
  const shown = play !== null && decisionsShown(state);
  const before = state.phase === 'reveal' ? wipeoutTable(state, state.roundIndex, state.questionIndex) : null;
  // у rows.map:
  choice: shown ? wipeoutChoiceOf(play, p.id) : null,
  prev: before !== null && before[p.id]?.status === 'in' ? before[p.id].bank : null,
  // у результаті:
  decisions: shown,
  ```
  `playerWipeout` не змінюється.

- [ ] **Step 1: Write the failing tests** (`views.wipeout.test.ts`, новий `describe('wipeout decisions and banks for everyone (11e)')`, помічники `windowOpen`, `answered`, `RIGHT`, `WRONG` з файлу):
  - **Вікно таємне:** `windowOpen()`, p1 «Забрати» о 3000, p2 «Далі» о 3500:
    - `stage(s).wipeout?.decisions` → `false`;
    - `rows.map((r) => r.choice)` → `[null, null, null]` у `stage(s)`, `phone(s, 'p3')`, `phone(s, 'p1')` і `hostView(s)`;
    - `JSON.stringify(stage(s))`, `JSON.stringify(phone(s, 'p3'))` не містять `"choice":"`;
    - пульт, як і раніше, має `decision: 'take'` у p1;
    - на паузі (`pause(s, 4000)`) — те саме.
  - **Екран рішень:** той самий стан, `tick(s, 12_000)`:
    - `decisions` → `true` у всіх трьох зрізах;
    - `rows.map((r) => [r.playerId, r.status, r.bank, r.choice])` → `[['p1', 'took', 100, 'took'], ['p2', 'in', 100, 'stay'], ['p3', 'took', 100, 'auto']]` однаково в `stage(s)`, `phone(s, 'p2')` і `hostView(s)`;
    - `decision` — `null` у всіх рядках;
    - `decide` → `null`.
  - **Усі вирішили самі** (p1 і p2 «Далі», p3 «Забрати») → p3 `choice: 'took'`.
  - **Хто вибув раніше, вибору не має:** w1 p3 помиляється (`windowOpen({ p1: RIGHT[0], p2: RIGHT[0], p3: WRONG })`), p1 і p2 «Далі» → p3 `status: 'burned'`, `choice: null`.
  - **Наступне запитання** (`next` після екрана) → `choice` усіх `null`, `decisions: false`.
  - **Банк до сходинки:** w1 усі правильно, усі «Далі»; w2 p1 правильно (`RIGHT[1]`), p2 неправильно, p3 не відповів:
    - на `locked`: `rows.map((r) => r.prev)` → `[null, null, null]`; `JSON.stringify(stage(s))` не містить `"prev":1`;
    - на `reveal`: `[r.playerId, r.status, r.prev, r.bank]` → `[['p1', 'in', 100, 300], ['p2', 'burned', 100, 0], ['p3', 'burned', 100, 0]]`;
    - на `question` наступної сходинки (після вікна, де p1 «Далі») → `prev` усіх `null`;
    - гравець, що вибув на w1, на розкритті w2 має `prev: null`.
  - **Стан версії 12:** закрите таймером вікно, з запису вручну прибрано `auto` → у p3 `choice: 'took'`.
  - **Командна гра:** `teamGame(teamQuiz([wipeoutRound('rw', wipeoutLadder)]), [['Оля', 'Петро'], ['Іра', 'Марко']])`, обидві команди правильно, вікно; Оля (капітан `t1`) «Забрати», `tick` на кінці вікна:
    - `playerView(s, 'm2')?.wipeout?.rows.map((r) => [r.playerId, r.choice])` → `[['t1', 'took'], ['t2', 'auto']]`;
    - `playerView(s, 'm4')` — те саме;
    - `nickname` рядків — назви команд з `defaultTeams(2)`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/views.wipeout.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Поля в shared (`WipeoutChoice` уже є з задачі 1), поля в `wipeoutInfo`. Фікстури вебу: лише нові поля (`choice: null`, `prev: null`, `decisions: false`) там, де падає `pnpm typecheck`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src packages/engine/src apps/web/src
  git commit -m "feat(engine): wipeout views — once the window closes the stage, phones and host all get what each player chose (took, stay or by default), the reveal carries each bank before the rung; nothing new while the window is open or before the reveal"
  ```

### Задача 3. Веб: група «Рішення», смужка банків, список сходинки, колонка сцени

**Files:**
- Modify: `apps/web/src/screens/WipeoutLadder.tsx`, `apps/web/src/screens/WipeoutDecision.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/WipeoutLadder.test.tsx`, `apps/web/src/screens/WipeoutDecision.test.tsx`

**Interfaces:**
- `apps/web/src/screens/WipeoutLadder.tsx`:
  ```ts
  /** Скільки пар «ім'я банк» у смужці телефону (11e). */
  export const WIPEOUT_STRIP_MAX = 8;
  /** Скільки рядків у колонці сцени (11e). */
  export const WIPEOUT_SIDE_MAX = 12;
  /** Позначка вибору на екрані рішень (11e): «Забрано 600» / «Далі з 600» / «Без вибору — забрано 600». */
  export function choiceText(row: WipeoutRow): string;
  /** Ті, хто в грі, за спаданням банку (за рівного — у порядку гравців); max і highlightId — свій рядок завжди видно. */
  export function inByBank(info: WipeoutInfo, max: number, highlightId?: string): { rows: WipeoutRow[]; more: number };
  /** Телефон на question / locked (11e): «У грі: Оля 600 · Петро 300 · ще 2». */
  export function WipeoutStrip({ info, highlightId }: { info: WipeoutInfo; highlightId?: string }): JSX.Element | null;
  /** Розкриття (11e): хто грав сходинку — «✓ 100 → 300» або «✗ банк 100 згорів». */
  export function WipeoutStepList({ info, size, highlightId, max }: { info: WipeoutInfo; size: 'stage' | 'phone'; highlightId?: string; max?: number }): JSX.Element | null;
  /** Колонка сцени поруч із запитанням (11e): на question / locked — банки тих, хто в грі; на reveal — список сходинки. */
  export function WipeoutSide({ info, reveal }: { info: WipeoutInfo; reveal: boolean }): JSX.Element;
  ```
  - `WipeoutPlayers`: коли `info.rows.some((r) => r.choice !== null)`, перша секція — `section.wipeout-group.is-choices` з `h3.meta` «Рішення» і `li` (`is-me` для `highlightId`) з `span.name` і `span.wipeout-choice.is-{choice}` (`choiceText`). Решта груп фільтрує `row.choice === null`.
  - `WipeoutStrip`: `null`, коли в грі нікого. Розмітка:
    ```tsx
    <p className="wipeout-strip-phone">
      <span className="meta">{t('wipeoutStripIn')}</span>{' '}
      {rows.map((row, i) => <Fragment key={row.playerId}>{i > 0 && ' · '}<span className={row.playerId === highlightId ? 'is-me' : undefined}>{row.nickname} {num(row.bank)}</span></Fragment>)}
      {more > 0 && <span className="meta"> · {t('wipeoutMore', { n: more })}</span>}
    </p>
    ```
  - `WipeoutStepList`: рядки з `prev !== null`; правильні (`status === 'in'`) за спаданням `bank`, потім згорілі (`status === 'burned' && step === info.current`). `null`, якщо рядків немає. Розмітка:
    - `section.wipeout-step-list.is-{size}` з `h3.meta` «Як пройшли сходинку» (лише `phone`);
    - `ul > li.is-right|is-burned` (+ `is-me`) з `span.wipeout-verdict` («✓» / «✗», `aria-label` «правильно» / «згорів»), `span.name`, `span.wipeout-change` («{prev} → {bank}» / «банк {prev} згорів»);
    - `max` → далі `li.meta` «ще {n}».
  - `WipeoutSide`: `aside.wipeout-side` з `aria-label` «Банки».
    - На `reveal` — `WipeoutStepList size="stage" max={WIPEOUT_SIDE_MAX}`.
    - Інакше:
      - `h2.meta` «У грі · {inCount}»;
      - `ul > li` «`span.name` `span.score`» з `inByBank(info, WIPEOUT_SIDE_MAX)`, далі `li.meta` «ще {n}»;
      - `p.meta.wipeout-side-out` «Забрали: {took} · Згоріли: {burned}» — лише коли `took + burned > 0`.
- `WipeoutDecision.tsx`: коли `view.wipeout?.decisions` і свій рядок (`rows.find((r) => r.playerId === view.me.id)`) має `choice`:
  - `'stay'` → `p.lead.wipeout-state` «Ти йдеш далі з {bank}»;
  - `'auto'` → «Без вибору — забрано {bank}»;
  - `'took'` → наявне «Забрано {bank}».

  Перевірка стоїть **перед** наявними гілками, щоб `'auto'` не потрапив у «Забрано».
- `apps/web/src/i18n.ts`:
  ```ts
  wipeoutGroupChoices: 'Рішення',
  wipeoutDecisionsTitle: 'Рішення',
  wipeoutChoiceTook: 'Забрано {bank}',
  wipeoutChoiceStay: 'Далі з {bank}',
  wipeoutChoiceAuto: 'Без вибору — забрано {bank}',
  wipeoutStayedWith: 'Ти йдеш далі з {bank}',
  wipeoutStripIn: 'У грі:',
  wipeoutMore: 'ще {n}',
  wipeoutSideTitle: 'У грі · {n}',
  wipeoutSideLabel: 'Банки',
  wipeoutSideOut: 'Забрали: {took} · Згоріли: {burned}',
  wipeoutStepTitle: 'Як пройшли сходинку',
  wipeoutStepRight: '{prev} → {bank}',
  wipeoutStepBurned: 'банк {prev} згорів',
  wipeoutVerdictRight: 'правильно',
  wipeoutVerdictBurned: 'згорів',
  ```
- `apps/web/src/styles.css` (поруч із блоком `.wipeout-*`):
  - `.wipeout-choice` — плашка як `.wipeout-mark`;
  - `.is-took` / `.is-auto` — зелений тон (`--ok` чи наявний токен успіху), `.is-auto` ще й курсив;
  - `.is-stay` — акцентний («смілива»);
  - `.wipeout-strip-phone` — дрібний текст, перенос рядків, без горизонтальної прокрутки;
  - `.wipeout-step-list li` — сітка «вердикт · ім'я · зміна»; `.is-right .wipeout-verdict` — зелений, `.is-burned` — червоний;
  - `.wipeout-side` — див. задачу 4 (розміщення); тут лише вигляд рядків.

- [ ] **Step 1: Write the failing tests**
  - `WipeoutLadder.test.tsx` (фікстура `row` + `choice: null, prev: null`, `wipeoutInfo` + `decisions: false`):
    - **група «Рішення»:** рядки `a` (`in`, 600, `choice: 'stay'`), `b` (`took`, 300, `step: 2`, `choice: 'took'`), `c` (`took`, 300, `step: 2`, `choice: 'auto'`), `d` (`burned`, `step: 1`, `choice: null`), `decisions: true`, `size="phone"`, `highlightId="a"`:
      - перша `.wipeout-group` має клас `is-choices` і заголовок «Рішення»;
      - тексти `.wipeout-choice` → `['Далі з 600', 'Забрано 300', 'Без вибору — забрано 300']`;
      - `li` гравця `a` має `is-me`;
      - групи «У грі» й «Забрали» відсутні (усі їхні рядки в «Рішенні»), «Згоріли» з `d` є;
    - без `choice` — розмітка як раніше (наявні тести зелені);
    - на `size="stage"` і `size="host"` — та сама група (вибір після вікна бачать усі);
    - **`WipeoutStrip`:** 10 рядків `in` з банками 100…1000, `highlightId` — рядок з банком 100:
      - текст починається з «У грі:»;
      - перша пара — банк 1000;
      - пар 9 (8 + свій);
      - є «ще 1»;
      - свій `span` має `is-me`;
      - без рядків `in` → нічого не малює;
    - **`WipeoutStepList`:** `current: 1`, рядки `a` (`in`, `prev: 100`, `bank: 300`), `b` (`burned`, `step: 1`, `prev: 100`), `c` (`took`, `prev: null`):
      - два `li`;
      - перший `is-right` з «100 → 300» і `aria-label` «правильно»;
      - другий `is-burned` з «банк 100 згорів»;
      - `c` відсутній;
      - заголовок «Як пройшли сходинку» лише на `phone`;
      - `max: 1` → «ще 1»;
    - **`WipeoutSide`:**
      - `reveal: false`, 14 рядків `in` + 1 `took` + 1 `burned` → заголовок «У грі · 14», 12 рядків з банками, «ще 2», «Забрали: 1 · Згоріли: 1»;
      - `reveal: true` → `.wipeout-step-list.is-stage`;
      - `aside` має `aria-label` «Банки».
  - `WipeoutDecision.test.tsx`:
    - `decisions: true`, свій рядок `choice: 'stay'`, `bank: 600`, `me.wipeout.status: 'in'`, `decision: null` → «Ти йдеш далі з 600»;
    - `choice: 'auto'`, `status: 'took'`, `bank: 300` → «Без вибору — забрано 300» (не «Забрано 300»);
    - `choice: 'took'` → «Забрано 300».
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/WipeoutLadder.test.tsx apps/web/src/screens/WipeoutDecision.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): wipeout pieces — a «Рішення» group with taken, going on and taken by default after the window, a bank strip for phones, a rung list with right and burned banks, a stage side column, and the own decision line on the decisions screen"
  ```

### Задача 4. Підключення: колонка на сцені, смужка й список на телефоні, екран «Рішення»

**Files:**
- Modify: `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/StageScreen.test.tsx`, `apps/web/src/screens/PlayerScreen.test.tsx`, `apps/web/src/screens/HostWipeout.test.tsx`

**Interfaces:**
- `StageScreen.tsx`, `Question`:
  - корінь: `className={view.wipeout !== null ? 'stage-question has-wipeout-side' : 'stage-question'}`;
  - останнім дочірнім: `{view.wipeout !== null && <WipeoutSide info={view.wipeout} reveal={view.phase === 'reveal'} />}`.
- `StageScreen.tsx`, `WipeoutBetween`: заголовок `t(info.decisions ? 'wipeoutDecisionsTitle' : 'wipeoutLadderTitle')`. Решта (таймер вікна, `WipeoutLadder size="stage"`) як зараз. Група «Рішення» приходить із `WipeoutPlayers`.
- `styles.css`:
  ```css
  .stage-question.has-wipeout-side { position: relative; padding-right: calc(var(--wipeout-side-w, 17rem) + 1.5rem); }
  .stage-question.has-wipeout-side > .wipeout-side { position: absolute; top: 4.5rem; right: 0; bottom: 0; width: var(--wipeout-side-w, 17rem); overflow: hidden; }
  ```
  Точні відступи підбирає будівельник за кадром (шапка `.bar` і `.wipeout-strip` над колонкою не перекриваються).
- `PlayerScreen.tsx`:
  - **смужка:** у розмітці запитання, перед ланцюжком `teamWatching ? … : wipeoutWatching ? …` (тобто для всіх, зокрема товаришів і вибулих): `{view.wipeout !== null && (phase === 'question' || phase === 'locked') && <WipeoutStrip info={view.wipeout} highlightId={me.id} />}`;
  - **розкриття:** у `Result` — `{view.phase === 'reveal' && view.wipeout !== null && <WipeoutStepList info={view.wipeout} size="phone" highlightId={view.me.id} />}`. Двічі: у гілці `watching` під `h2` «Ти дивишся» і в основній гілці під `p.wipeout-bank`;
  - **екран рішень:** без змін розмітки. `WipeoutDecision` (задача 3) показує свій рядок, `WipeoutLadder size="phone"` — групу «Рішення». Гілка `teamCaptainDecides` спрацьовує лише за `canDecide`, тож на екрані рішень товариші бачать той самий список.
- `HostWipeout.tsx` — без змін.

- [ ] **Step 1: Write the failing tests**
  - `StageScreen.test.tsx` (фікстура з `round.type: 'wipeout'`, `wipeout` з рядками `in`):
    - `question` → є `.stage-question.has-wipeout-side` і `aside.wipeout-side` з «У грі · 2» та обома іменами й банками;
    - `reveal`, рядки з `prev` → в `aside` `.wipeout-step-list.is-stage` з «100 → 300»;
    - класичне запитання (`wipeout: null`) → ні класу, ні `aside`;
    - `leaderboard` з `decisions: true` → `h1` «Рішення», `.wipeout-group.is-choices`;
    - з `decide` (вікно) → `h1` «Драбина», таймер є.
  - `PlayerScreen.test.tsx`:
    - `question` у «Ва-банк», `me.wipeout.status: 'in'` → `.wipeout-strip-phone` з «У грі:» над полем відповіді;
    - вибулий (`status: 'burned'`) → смужка є, разом із «Ти вже не граєш…»;
    - `reveal`, `me` у грі → `.wipeout-step-list.is-phone` під «Банк: …»;
    - `reveal`, вибулий → «Ти дивишся» і `.wipeout-step-list`;
    - `leaderboard` з `decisions: true`, свій рядок `choice: 'stay'` → «Ти йдеш далі з 600» і `.wipeout-group.is-choices` зі своїм `li.is-me`;
    - командна гра (`team-test-view.ts`, `team.canAct: false`), `decisions: true` → «Капітан вирішує…» **немає**, група «Рішення» є;
    - класичне запитання → `.wipeout-strip-phone` немає.
  - `HostWipeout.test.tsx`: `decisions: true` з `choice` → `.host-wipeout .wipeout-group.is-choices` з «Далі з 600»; у вікні (`decision: 'take'`) — «забирає», як раніше.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/StageScreen.test.tsx apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/screens/HostWipeout.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): wipeout banks and decisions on every screen — the stage keeps a bank column beside the question and lists right and burned banks on the reveal, phones get a bank strip and the rung list (watchers too), after the window the stage, phones and host show «Рішення» with each choice"
  ```

### Задача 5. Довідка ведучого: банки, екран «Рішення», 3 с

**Files:**
- Modify: `apps/web/src/help/rounds.ts`, `apps/web/src/help/settings.ts`
- Test: `apps/web/src/help/host-help.test.ts`

**Interfaces:**
- `ROUND_HELP.wipeout.how`:
  - другий рядок (зараз «Після «Показати відповідь» сцена показує смугу сходинок раунду; драбину з тим, хто вцілів і скільки в банку, вона покаже після «Далі». …») замінити на: «Під час запитання сцена показує збоку банки всіх, хто в грі, а телефони — смужку «У грі: …». Після «Показати відповідь» сцена й телефони бачать, хто відповів правильно і як зріс його банк, а хто згорів. Хто помилився чи не відповів (зокрема випав зі зв'язку), згорає: банк 0, до кінця раунду лише дивиться.»;
  - у третьому рядку після «…а ви бачите їх наживо.» дописати: «Щойно вікно закрилося, сцена, телефони й пульт показують екран «Рішення»: хто забрав банк, хто йде далі, а хто не вибрав і банк забрано сам («Без вибору»). «Далі» на ньому діє не раніше ніж через 3 секунди.»
- `SETTINGS_HELP.pacing.how`, третій рядок: дописати `; екран «Рішення» у «Ва-банк» — ${s(PACE_MS.decisions)} після закриття вікна` перед крапкою.

- [ ] **Step 1: Write the failing tests** (`host-help.test.ts`):
  - `text('round.wipeout')` містить «смужку «У грі», «екран «Рішення»», «Без вибору», «3 секунди»;
  - `text('round.wipeout')` не містить «драбину з тим, хто вцілів і скільки в банку, вона покаже після «Далі»»;
  - `text('settings.pacing')` містить «екран «Рішення»»;
  - `searchHelp('Без вибору')` містить `'round.wipeout'`;
  - наявні перевірки довідки зелені.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/help` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src/help
  git commit -m "feat(web): host help on wipeout banks for everyone, the «Рішення» screen after the window with «Без вибору», and its 3 s minimum"
  ```

### Задача 6. Наскрізні сценарії 11e з кадрами; навмисні правки 10g

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Помічники поруч із `decide` / `ladderGroupOf`:
  ```ts
  /** Текст позначки вибору гравця на екрані «Рішення»; null — його там немає. */
  async function choiceOf(page: Page, nickname: string): Promise<string | null> {
    const li = page.locator('.wipeout-group.is-choices li').filter({ has: page.locator('.name', { hasText: new RegExp(`^${nickname}$`) }) });
    return (await li.count()) === 0 ? null : (await li.locator('.wipeout-choice').textContent())!.trim();
  }
  /** Рядок гравця в колонці сцени чи списку сходинки. */
  const sideRow = (page: Page, nickname: string) => page.locator('.wipeout-side li, .wipeout-step-list li').filter({ has: page.locator('.name', { hasText: new RegExp(`^${nickname}$`) }) });
  /** Сокетні кадри з відкритим вибором (11e). */
  const CHOICE = /"choice":"(took|stay|auto)"/;
  ```
- Вміст — без тем росії й СРСР. Запитання «Ва-банк» 11e (`shuffleOptions: false`, `timeLimit: 20`):
  - `e1` single «Яка планета найближча до Сонця?» — Меркурій ✓ / Венера / Марс, 100;
  - `e2` boolean «Кит — ссавець», `true`, 200;
  - `e3` numeric «Скільки ніг у павука?», 8, допуск 0, 300;
  - `e4` text «Столиця Японії?», `['Токіо']`, 400;
  - `e5` slider «Скільки хвилин у годині?», 0–120, крок 1, правильно 60, допуск 2, 500.

- [ ] **Step 1: Add the scenarios** у кінець файлу за зразком 11d:
  ```ts
  it('part 11e: wipeout decisions — banks of everyone in beside the question on the 1280 × 720 stage and in a phone strip, right and burned banks on the reveal for players and watchers, choices hidden while the 10 s window runs, then «Рішення» on the stage, phones and host with taken, going on and taken by default, the host waits 3 s, the round end groups as before', async () => {
    try {
      await wipeoutDecisions11e();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });

  it('part 11e: team wipeout decisions — teammates see the strip with team banks and «Рішення» with both teams after the captains decide', async () => {
    try {
      await teamWipeout11e();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Підготовка `wipeoutDecisions11e()`:**
  1. `host = open('host11e', 1280, 900)`, `register(host, 'host', 'Марта Ведуча', 'host11e@example.com')`.
  2. `makeRoundsQuiz([wipeoutRound('rw11e', [e1, e2, e3, e4, e5] as never, { title: 'Драбина 11e', shuffleOptions: false })], { leaderboard: 'end' })`, `title: 'Ва-банк 11e'` → `POST /api/quizzes`.
  3. «Грати» → `code`, `stageUrl`. `stage = open('stage11e', 1280, 720)`, `olya`, `petro`, `vira` (375 × 812), `join` («Оля», «Петро», «Віра»). `stageFrames`, `olyaFrames`, `viraFrames` — `socketFrames` до старту.
  4. «Почати гру» → `afterSplash` → «Почати раунд» → `afterSplash`.

  **Кроки:**
  1. **Запитання e1 — банки збоку й смужка.**
     - `stage.getByText('Яка планета найближча до Сонця?', exact).waitFor()`;
     - `stage.locator('aside.wipeout-side')` містить «У грі · 3» і три рядки з «0»;
     - `expectStageFits(stage, 'p11e-stage-question')`;
     - бокс `aside.wipeout-side` не перетинає бокс `.stage-main h1` і кнопок варіантів (`aside.x >= h1.x + h1.width`), низ `aside` ≤ 720;
     - у кожного телефону `.wipeout-strip-phone` починається з «У грі:» і містить «Оля 0», «Петро 0», «Віра 0»; `expectNoSideScroll(olya, 'p11e-phone-strip')`.
     - Кадри `p11e-stage-question`, `p11e-phone-strip`.
  2. **Відповіді e1:** усі троє «Меркурій» → «Запитання закрите» → «Показати відповідь».
     - кадри від позиції, записаної перед «Почати раунд» (`fromE1 = { stage: stageFrames.length, vira: viraFrames.length }`), до першого `"phase":"reveal"` (`framesUntilNextReveal`) у `stageFrames` і `viraFrames` не містять `/"prev":\d/`;
     - на сцені `sideRow(stage, 'Оля')` містить «0 → 100» і «✓»; так само Петро й Віра;
     - на телефонах `.wipeout-step-list` з трьома `li.is-right`;
     - кадри `p11e-stage-reveal`, `p11e-phone-reveal`.
  3. **Вікно рішення e1.** «Далі» → `stage.getByText('Вирішили 0 з 3', exact).waitFor()`. `const from = { stage: stageFrames.length, vira: viraFrames.length }`.
     - Оля — `decide(olya, true)`, Петро — `decide(petro, false)`, Віра нічого не натискає;
     - `stage.getByText('Вирішили 2 з 3', exact).waitFor()`;
     - `stage.locator('.wipeout-group.is-choices').count()` → 0; `vira.locator('.wipeout-group.is-choices').count()` → 0;
     - `bodyText(stage)` і `bodyText(vira)` не містять «Забрано 100» і «Далі з 100»;
     - пульт: `.host-wipeout li` Олі — «забирає», Петра — «іде далі» (наживо, як у 10g);
     - кадр `p11e-stage-window`.
  4. **Екран «Рішення»** (вікно закриває таймер, 10 с):
     - `await stage.locator('.wipeout-group.is-choices').waitFor({ timeout: 15_000 })`; `const shownAt = Date.now()`;
     - кожен кадр `stageFrames.slice(from.stage)` і `viraFrames.slice(from.vira)`, що містить `CHOICE`, містить і `"decide":null`: вибір не приходив, поки вікно було відкрите;
     - на сцені `h1` «Рішення»; `choiceOf(stage, 'Оля')` → «Забрано 100», `choiceOf(stage, 'Петро')` → «Далі з 100», `choiceOf(stage, 'Віра')` → «Без вибору — забрано 100»;
     - те саме на телефоні Олі й на пульті (`host.locator('.host-wipeout')`);
     - у Петра `li.is-me` з «Петро» в `.is-choices` і рядок «Ти йдеш далі з 100»; у Віри — «Без вибору — забрано 100»;
     - `expectStageFits(stage, 'p11e-stage-decisions')`; `expectNoSideScroll(petro, 'p11e-phone-decisions')`;
     - **3 с:** кнопка пульта «Наступне запитання» одразу після появи екрана `isDisabled()` → `true`; `await expect.poll(() => button.isEnabled(), { timeout: 6000 }).toBe(true)`; `Date.now() - shownAt` ≥ 2500 (запас на затримку кадру);
     - кадри `p11e-stage-decisions`, `p11e-phone-decisions` (Петро), `p11e-phone-decisions-auto` (Віра), `p11e-host-decisions`.
  5. **Запитання e2 — грає лише Петро.** «Наступне запитання» → `afterSplash`:
     - `aside.wipeout-side` містить «У грі · 1», рядок Петра «100» і «Забрали: 2 · Згоріли: 0»;
     - смужка в Олі — «У грі: Петро 100»;
     - Петро відповідає «Ні» (`pickOption(petro, '(^|\s)Ні$')`, неправильно) → «Показати відповідь»;
     - на сцені й у Віри `sideRow(…, 'Петро')` містить «банк 100 згорів» і «✗»;
     - кадр `p11e-stage-burned`.
  6. **Кінець раунду.** «Далі» → `round_end` (нікого в грі): на сцені групи «Забрали» (Оля, Віра) і «Згоріли» (Петро), як у 10g; `.wipeout-group.is-choices` немає. Кадр `p11e-stage-round-end`.
  7. `expect(problems).toEqual([])`.

  **Підготовка `teamWipeout11e()`:**
  1. `host11et` 1280 × 900, `register(host, 'host', 'Марта Ведуча', 'host11et@example.com')`.
  2. `makeRoundsQuiz([wipeoutRound('rt11e', [e1, e2, e3, e4, e5] as never, { title: 'Команди 11e', shuffleOptions: false })], { leaderboard: 'end', teams: { count: 2, names: ['Червоні', 'Сині'] } })`, `title: 'Команди 11e'`.
  3. Сцена 1280 × 720, телефони `olya`, `petro`, `ira`, `marko` (375 × 812), `join`, `pickTeamOn`: Оля й Петро — «Червоні», Іра й Марко — «Сині» (капітани — Оля, Іра).
  4. «Почати гру» → `afterSplash` → «Почати раунд» → `afterSplash`.

  **Кроки:**
  1. Смужка в Петра й Марка: «У грі: Червоні 0 · Сині 0». На сцені в `aside.wipeout-side` — обидві команди. Кадр `p11e-team-strip` (Петро).
  2. Оля й Іра (капітани) відповідають «Меркурій» → «Показати відповідь» → у Петра `.wipeout-step-list` з «Червоні» і «Сині» («0 → 100»).
  3. «Далі» → у Петра «Капітан вирішує за команду…». Оля — `decide(olya, true)`, Іра — `decide(ira, false)` → вікно закривається одразу (усі присутні вирішили).
  4. У Петра й Марка `choiceOf(…, 'Червоні')` → «Забрано 100», `choiceOf(…, 'Сині')` → «Далі з 100». У Петра `li.is-me` — «Червоні». «Капітан вирішує» більше немає. Кадр `p11e-team-decisions` (Марко).
  5. «Завершити гру» → «Переможці». `expect(problems).toEqual([])`.
- [ ] **Step 2: Run** `pnpm build`, потім у фоні `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 11e"` → PASS. Переглянути кадри `p11e-*`:
  - колонка банків поруч із запитанням не налазить на варіанти;
  - смужка читається на 375 px;
  - «✓ 0 → 100» і «✗ банк 100 згорів» видно;
  - екран «Рішення» з трьома різними позначками читається на сцені й телефоні;
  - командні назви не обрізані.
- [ ] **Step 3: Навмисні правки сценарію 10g** (`wipeoutGame`), потім `-t "part 10g"` → PASS:
  - після того, як усі троє вирішили «Далі» на w1: `expect(await ladderGroupOf(stage, 'Петро')).toBe('У грі')` → `.toBe('Рішення')` і `expect(await choiceOf(stage, 'Петро')).toBe('Далі з 100')`. Причина: після вікна сцена показує екран «Рішення»;
  - крок 6 (w3, грає лише Віра): перевірку «stage / olya / petro не бачать `Банк: 600`» лишити (вона перевіряє власний рядок «Банк:», якого в чужих немає) і додати позитивну: `sideRow(olya, 'Віра')` містить «300 → 600». Причина: тепер банки інших видно всім (рішення власника);
  - перевірки «`"decision":"(take|stay)"` не доходить до сцени» й «Оля й Віра не отримали `"decision":"take"`» — без змін: поле `decision` не змінювалося, вибір після вікна йде в `choice`;
  - кліки «Наступне запитання» після вікна: помічник `click` чекає на активну кнопку (3 с). Якщо ні — додати очікування `isEnabled`, а не сон.

  Якщо падає інше в 10g, 11a (інтро «Ва-банк») чи 11b, лагодити лише заміною селектора чи очікування на новий вигляд, не сном і не зміною вмісту. Кожну правку назвати в коміті й у звіті задачі.
- [ ] **Step 4: Повний прогін — один раз, у фоні** (≈ 31 хв): `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts` → усі сценарії PASS. Якщо PGlite чи браузер падає з браком пам'яті, перезапустити лише сценарії, що впали (`-t "<назва>"`), і назвати це в звіті.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/e2e
  git commit -m "test: part 11e end-to-end — wipeout banks beside the question on the 1280 × 720 stage and in a phone strip, right and burned banks on the reveal, choices hidden during the window and then «Рішення» with taken, going on and taken by default on the stage, phones and host, the host waits 3 s; teammates see team banks and both teams' choices; 10g now expects «Рішення» after the window and sees the other banks"
  ```
