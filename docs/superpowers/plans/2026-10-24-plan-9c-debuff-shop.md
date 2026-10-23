# План 9c: дебафи за бали й помітні дебафи

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 9c специфікації (розділ 5, пункти 1 і 2 власника).
- **Гравці купують дебафи самі.** На телефоні кнопка «😈» (ім'я для читачів екрана — «Дебафи») відкриває аркуш: дозволені дебафи з цінами, далі вибір суперника, далі «Купити за 200». Ціна знімається з балів покупця коригуванням нового джерела `'debuff'`; в історії гри — «Оля купує Туман для гравця Петро: −200». Купити можна лише за наявні бали (у мінус — ні). Діють наявні правила: дебаф спрацьовує в наступному запитанні, де суперник відповідає з телефона; на гравця одночасно один дебаф. Ведучий і далі насилає дебафи безкоштовно.
- **Жертва бачить, хто наслав.** Банер у мить спрацювання: «Оля насилає на вас: Туман». У мить покупки сцена, пульт і телефони показують сповіщення «Оля насилає дебаф на гравця Петро» (без виду дебафу — вид лишається сюрпризом до спрацювання, як і значок «🐞 Петро» на сцені).
- **Ціни задає ведучий у редакторі** в розділі «Бафи й дебафи», біля кожного дозволеного дебафу; за замовчуванням 200.
- **Кожен дебаф добре видно, але відповісти можна.** Туман — сильне розмиття з легким серпанком, а не молочно-біла стіна (зараз світлий шар 78 % непрозорості лежить на світлому тексті темної теми — звідси «просто білий екран»); тремтіння — поштовхи з помітною амплітудою кожні 2,8 с плюс вібрація телефона, між поштовхами — спокій; заморозка, дзеркало, гості й бруд перевірено на кадрах 375 px і підсилено там, де слабко.

**Архітектура:**
- **Shared.** `settings.debuffPrices?: Partial<Record<DebuffKind, number>>` (ціле `LIMITS.minDebuffPrice`…`LIMITS.maxDebuffPrice`, 50…5000), `debuffPrice(quiz, kind)` (немає ціни → `LIMITS.defaultDebuffPrice` = 200). `AdjustmentSource` + `'debuff'`. Коди помилок `points_short`, `debuff_bought`. Подія `player:debuff` (`{ targetId, kind }`). Типи зрізів: `PlayerView.me.shop: PlayerShop | null`, `me.debuff.by`, `HostPlayer.debuff.by`, `BaseView.debuffNotice: DebuffNotice | null`. `GameAdjustment` (історія) отримує необов'язкові `debuff` і `target` лише для рядків покупки.
- **Рушій (`packages/engine/src/debuffs.ts`).** `buyDebuff(state, buyerId, targetId, kind, now)` — перевірки, коригування `−ціна` з `source: 'debuff'`, `target`, `debuff` (через спільний `addAdjustment` у `adjust.ts`, на якому тепер стоїть і `adjustScore`), дебаф з `by: buyerId`. `shopBlock(state, buyerId)` — чому зараз не купити. `DebuffState.by: string | null` (null — від ведучого); `cancelDebuff` купленого → `not_allowed`. Зрізи: `playerShop`, `lastPurchase`, імена `by`. Форма стану змінюється (`DebuffState.by`, `ScoreAdjustment.target/debuff`, `QuizSettings.debuffPrices`) → `GAME_STATE_VERSION = 2` і новий запис `KEYS[2]` у `restore.test.ts`.
- **Сервер.** `manager.buyDebuff(room, buyerId, targetId, kind)`, сокет `player:debuff` (лише роль `player`, власний id — з ідентичності, не з корисного навантаження). Міграція `0011_debuff_purchases`: у `score_adjustment` колонки `debuff text` і `target_nickname text`. Записувач пише їх для покупок; історія віддає рядок покупки з `debuff` і `target`; досягнення не рахують покупки в «виграв бліц-раунд» (як ставки дуелей).
- **Веб.** Редактор: поле «Ціна» біля кожного дозволеного дебафу. Телефон: `DebuffShop` (кнопка в шапці + аркуш, як «Таблиця»), банер жертви з іменем покупця, `DebuffToast` (сцена, пульт, телефони). Пульт: «🌫️ Туман від гравця Оля · чекає», без «Скасувати дебаф» для купленого. Історія: рядки покупок у групі раунду. Помітність — CSS і `Debuffs.tsx` (туман, тремтіння з вібрацією, гості, бруд, лід).

**Технології:** TypeScript, zod 4, vitest, Drizzle ORM + drizzle-kit, PGlite (тести), Fastify + Socket.IO, React + Vite, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-24-after-third-game-design.md` — розділ 1 (критерій «дебафи купують самі гравці, і жертва бачить ефект, але може відповісти»), розділ 2 (анти-ціль «дебаф робить відповідь неможливою»; не-ціль «нові види бафів чи дебафів»), розділ 5 (частина 9c), розділ 7 («джерело коригування «дебаф»», «точна сила ефектів дебафів» — на будівельнику), розділ 8 («купити дебаф можна лише за наявні бали (у мінус не можна); жертва бачить, хто наслав»; «ціна дебафу за замовчуванням — 200»). Відгук власника: «з туманом ніхто ніц не бачив просто білий екран, і трусіння екрану зовсім слабке було». Зразки: `packages/engine/src/debuffs.ts` (`setDebuff`, `fireDebuffs`, `shownDebuff`), `packages/engine/src/adjust.ts` (`adjustScore`, `lastNotice`), `packages/engine/src/buffs.ts` (`lastBuff`), `packages/engine/src/views.ts` (`playerDuel`, `playerDebuff`, `hostDebuff`, `liveTable`, `hiddenPoints`), `packages/engine/src/restore.test.ts` (`STATE_SHAPE`, `KEYS`, `representative`), `apps/server/src/socket.ts` (`player:buff`, `player:duel`), `apps/server/src/recorder.ts` (запис коригувань), `apps/server/src/history.ts`, `apps/server/src/achievements.ts` (`roundPointsWithoutDuels`), `apps/web/src/screens/{Debuffs.tsx, WipeLayers.tsx, HostPlayerTools.tsx, PlayerScreen.tsx, TableSheet.tsx, DuelView.tsx}`, `apps/web/src/live/LiveNotices.tsx`, `apps/web/src/editor/PowersEditor.tsx`, `apps/web/src/pages/GameHistory.tsx` (`duelLines`), наскрізний сценарій 7d (`pranksGame`, `wipeWithMouse`, `expectApart`) у `apps/server/e2e/full-game.e2e.ts`.

**Рішення плану там, де специфікація мовчить:**
- **Коли можна купити.** Етапи `intro`, `question`, `reveal`, `board`, `leaderboard`, `round_end` — і не на паузі. Не можна: `lobby`, `guide`, `finished` (гри ще/вже немає), `locked` (рахунок там ще не показує оцінки, тож успіх чи відмова покупки видали б правильність до розкриття), `duel` (свої ставки, звичайного запитання немає) і весь фінальний раунд (`intro`/`wager`/`question`/`locked`/`reveal` фіналу: ставки залежать від рахунку, а на `reveal` частина балів ще прихована). У дозволених етапах `hiddenPoints` дорівнює 0, тож перевірка балів за `player.score` нічого не видає. Купити перед фіналом (на `round_end` попереднього раунду) можна — дебаф спрацює на запитанні фіналу.
- **Скільки купувати.** Одна покупка на гравця на «цикл запитання»: від закриття попереднього запитання до закриття поточного (заставка раунду й саме запитання — один цикл; розкриття, таблиця й наступне запитання — наступний). Рахується за `afterQuestion` покупки — той самий лічильник «скільки запитань закрито», що й у балів від ведучого, тож нового поля в стані немає. Другу в тому ж циклі — `debuff_bought`. Разом із «на гравця одночасно один дебаф» (`debuff_busy`) і ціною ≥ 50 цього досить проти засипання; окремого таймера охолодження немає.
- **Кому.** Будь-кому з суперників, крім себе (`not_allowed`); і тому, хто зараз поза зв'язком — дебаф чекає, як і від ведучого. Видно, на кому вже є дебаф: такий суперник у списку вимкнений із приміткою «Уже має дебаф» (сцена однаково показує значок «🐞 Петро»).
- **Бали.** Купити, лише якщо `score ≥ ціна` (після покупки ≥ 0). Інакше `points_short`; на телефоні такий дебаф вимкнений з приміткою «Не вистачає балів». Ціна — від'ємне коригування `source: 'debuff'` у журналі гри: рахунок, таблиця, історія й профіль бачать його, як бали від ведучого. У рейтингу 'end' покупець однаково бачить свій рахунок у шапці; сповіщення про покупку не показує ціни.
- **Ведучий.** Насилає безкоштовно, як і раніше (`by: null`). Куплений дебаф ведучий не скасовує: «Скасувати дебаф» біля нього немає, рушій відповідає `not_allowed` (бали вже сплачено; виправити можна «Балами»). Повернень немає й тоді, коли дебаф не встиг спрацювати до кінця гри або ціль вилучено — куплено, отже витрачено.
- **Хто бачить що.** Покупець — у аркуші й сповіщенні. Сцена, пульт і всі телефони — сповіщення 4 с «Оля насилає дебаф на гравця Петро» (без виду). Пульт — вид і покупця в рядку гравця: «🌫️ Туман від гравця Оля · чекає/діє». Жертва — у мить спрацювання банер «Оля насилає на вас: Туман» + наявна порада. Покупця вилучено — `by` у зрізах `null`, банер старий: «На вас наслано: Туман».
- **Тексти без відмінків.** Імена не відмінюються, тож формули нейтральні: «{buyer} купує {debuff} для гравця {target}: −200» (історія), «{buyer} насилає на вас: {debuff}» (банер), «{buyer} насилає дебаф на гравця {target}» (сповіщення), «{icon} {name} від гравця {by} · чекає» (пульт).
- **Ціни в редакторі.** Поле «Ціна, балів» (число, крок 50) біля кожного **дозволеного** дебафу; порожнє або рівне 200 — ключ не пишеться (старі вікторини й «за замовчуванням» однакові). Ціна вимкненого дебафу при знятті прапорця прибирається. Межі 50…5000 перевіряє схема (`debuff_price` у помилках збереження не потрібен — zod уже повертає шлях поля; редактор показує наявну загальну помилку).
- **Історія.** `score_adjustment.debuff` і `target_nickname` (текст, не зовнішній ключ: ціль могли вилучити до запису). Записувач бере нікнейм цілі зі стану в мить запису; ціль уже вилучено — `null`, рядок «Оля купує Туман: −200». Старі ігри — без змін.
- **Досягнення.** «Виграв бліц-раунд» не рахує покупок (`source !== 'duel' && source !== 'debuff'`): купівля — не гра раунду, хоч і лягає в його бали.
- **Формат стану.** `GAME_STATE_VERSION` 1 → 2. Наслідок: пуш 9c ще раз перерве ігри, що йдуть у мить розгортання (збережені кімнати версії 1 не відновлюються — так задумано в 9b).
- **Помітність (сила ефектів).**
  - Туман: серпанок `rgb(150 160 185 / 0.3)` + `backdrop-filter: blur(5px)`; без підтримки `backdrop-filter` — лише серпанок 0.6. Протерте місце — повністю чисте (як зараз). Критерій на кадрі: обриси тексту й варіантів угадуються, екран не однотонний (тест рахує розкид яскравості).
  - Тремтіння: цикл `SHAKE_CYCLE_MS = 2800`; поштовх — перші 30 % циклу (≈0,85 с) зі зсувом до ±14 px і поворотом до ±2,5°, решта 70 % — спокій (у цей час легко натиснути). На початку кожного поштовху `navigator.vibrate([120, 60, 120])`, якщо є (Android; на iOS вібрації з браузера немає). Зменшена анімація — наявний «примарний» варіант без руху й без вібрації.
  - Заморозка: лід непрозоріший (`--ice` 0.55 → 0.72) з інеєм по краях; тривалість та сама (`min(5 с, пів часу)`), потім відповідати можна.
  - Гості: 5 замість 4, розмір 4.5rem → 5.5rem, тінь для контрасту; дотиків не ловлять.
  - Бруд: плями 0.22…0.30 зони замість 0.18…0.26 (≈ третина зони), протирання як зараз.
  - Дзеркало: без змін сили (перевертання + зсув варіантів кожні 4 с); кадр перевіряє, що поле введення читається.
- **Чого не робимо.** Нових видів дебафів; купівлі бафів; повернення балів; цін, що змінюються за ходом гри; окремого перемикача «гравцям купувати не можна» (вимкнути всі дебафи — прибрати прапорці; записано як відкрите питання власникові).

## Глобальні обмеження

- Рушій чистий: `now` — аргумент; `buyDebuff` не читає годинника.
- Анти-ціль «дебаф робить відповідь неможливою»: шари не ловлять дотиків (`.debuff-layer`), заморозка коротша за половину часу, у тремтінні ≥ 60 % циклу спокою, туман і бруд протираються; сценарій 9c відповідає крізь кожен дебаф на 375 px.
- Анти-ціль «правильна відповідь потрапляє раніше розкриття»: купити на `locked` і у фіналі не можна; тест рушія це закріплює.
- Старі вікторини (без `debuffPrices`) працюють з ціною 200; старі ігри в історії — без змін; `GameAdjustment` для рядків не-покупок має ті самі ключі, що й раніше.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`. Нові нижні шари (`.live-notice.is-debuff`) — `position: fixed`, нічого не зсувають.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2` (якщо PGlite падає з браком пам'яті — окремо `pnpm vitest run --maxWorkers=2 packages`, `pnpm vitest run --maxWorkers=1 apps/server`, `pnpm vitest run --maxWorkers=2 apps/web`).
- Наскрізні тести: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Кадри — з `E2E_SHOTS=1` у `apps/server/e2e/artifacts/shots`.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (проєкт тестовий).

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/quiz.ts`, `packages/shared/src/quiz.test.ts` | `debuffPrices`, `LIMITS.*DebuffPrice`, `debuffPrice()` | 1 |
| `packages/shared/src/game.ts` | `AdjustmentSource` + `'debuff'`, `ErrorCode` + `points_short`, `debuff_bought`, `ShopBlock` | 1 |
| `packages/shared/src/events.ts` | `buyDebuffSchema`, `player:debuff` | 1 |
| `packages/shared/src/history.ts` | `GameAdjustment.debuff?`, `target?` | 1 |
| `apps/web/src/i18n.ts` | `err_points_short`, `err_debuff_bought` (решта текстів — у задачах 6–8) | 1 |
| `packages/engine/src/adjust.ts` | `addAdjustment`, `afterQuestionNow`; `adjustScore` на них | 2 |
| `packages/engine/src/game.ts` | `DebuffState.by`, `ScoreAdjustment.target?`, `debuff?` | 2 |
| `packages/engine/src/debuffs.ts` | `buyDebuff`, `shopBlock`, `SHOP_PHASES`, `by` у `setDebuff`, `cancelDebuff` купленого | 2 |
| `packages/engine/src/restore.ts`, `restore.test.ts` | `GAME_STATE_VERSION = 2`, `KEYS[2]`, покупка в `representative()` | 2 |
| `packages/engine/src/game.debuff-shop.test.ts` (новий), `game.debuffs.test.ts` | правила покупки; `by: null` в очікуваннях | 2 |
| `packages/shared/src/views.ts` | `PlayerShop`, `DebuffNotice`, `me.shop`, `me.debuff.by`, `HostPlayer.debuff.by`, `BaseView.debuffNotice` | 3 |
| `packages/engine/src/views.ts`, `packages/engine/src/views.debuff-shop.test.ts` (новий) | `playerShop`, `lastPurchase`, `by` | 3 |
| `apps/server/src/rooms/manager.ts`, `manager.test.ts`, `apps/server/src/socket.ts`, `socket.test.ts` | `buyDebuff`, `player:debuff` | 4 |
| `apps/server/src/db/schema.ts`, `apps/server/drizzle/0011_debuff_purchases.sql` (згенерований), `apps/server/drizzle/meta/*`, `apps/server/src/db/schema.test.ts` | колонки `debuff`, `target_nickname` | 5 |
| `apps/server/src/recorder.ts`, `recorder.test.ts`, `apps/server/src/history.ts`, `history.test.ts`, `apps/server/src/achievements.ts`, `achievements.test.ts` | запис і читання покупок | 5 |
| `apps/web/src/editor/PowersEditor.tsx`, `PowersEditor.test.tsx` (новий), `apps/web/src/pages/GameHistory.tsx`, `apps/web/src/pages/GameHistory.test.tsx` (новий або наявний тест історії) | ціни в редакторі, рядки покупок | 6 |
| `apps/web/src/screens/DebuffShop.tsx` (новий), `DebuffShop.test.tsx` (новий), `PlayerScreen.tsx`, `StageScreen.tsx`, `HostScreen.tsx`, `HostPlayerTools.tsx`, `HostPlayerTools.test.tsx`, `Debuffs.tsx`, `Debuffs.test.tsx`, `apps/web/src/live/LiveNotices.tsx`, `apps/web/src/styles.css` | аркуш покупки, сповіщення, банер з іменем, пульт | 7 |
| `apps/web/src/screens/Debuffs.tsx`, `Debuffs.test.tsx`, `WipeLayers.tsx`, `wipe.ts`, `wipe.test.ts`, `apps/web/src/styles.css` | сила ефектів, вібрація | 8 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 9c | 9 |

## Порядок збирання

- Задача 1 (shared) — перша. Задача 2 — на 1; задача 3 — на 2; задача 4 — на 3; задача 5 — на 2 (рушій) і 1; задача 6 — на 1 (редактор) і 5 (форма історії — лише тип з задачі 1, сервер для веб-тестів не потрібен); задача 7 — на 3 і 4 (подія); задача 8 незалежна від 2–7 (лише веб), але після 7, бо обидві правлять `Debuffs.tsx` і `styles.css`; задача 9 — остання.
- Навмисні зміни наявних очікувань (лише такі): `debuffs.p1` у `game.debuffs.test.ts` тепер з `by: null`; `KEYS[1]` у `restore.test.ts` лишається як є, додається `KEYS[2]`; перелік `missing` у тесті `representative states…` втрачає `ScoreAdjustment`; тести, що порівнюють повний `PlayerView`/`HostView`/`StageView` через `toEqual`, отримують `debuffNotice: null`, `me.shop`, `debuff.by`; тест `SavedRoom` з `stateVersion: 1` (якщо порівнює число буквально) — `GAME_STATE_VERSION`; кадри й тексти сценарію 7d не змінюються (дебафи від ведучого показують ті самі «На вас наслано: …» і «… · чекає»).

## На що дивитися рецензентові

1. **У мінус не можна, правильність не витікає.** Покупка перевіряє `score ≥ ціна` і заборонена на `locked`, у фіналі, на паузі, у дуелі. Тести: задача 2, `refuses when the points are short and allows exactly the price`, `cannot buy while answers are locked, in a duel, in the final round or on pause`.
2. **Одна покупка на цикл запитання і один дебаф на ціль.** Тести: задача 2, `one purchase per buyer per question cycle`, `a target with a debuff is busy whoever sent it`.
3. **Жертва бачить, хто наслав; вид не видно до спрацювання.** `me.debuff.by` лише в мить дії; `debuffNotice` без виду. Тести: задача 3, `the victim learns the buyer when the debuff fires`, `the purchase notice names the buyer and the target but not the kind`.
4. **Історія й формат стану.** Рядок покупки з видом і ціллю; `GAME_STATE_VERSION = 2` з новим записом `KEYS`. Тести: задача 5, `records a purchase with the kind and the target nickname`; задача 2, `the state format is pinned to GAME_STATE_VERSION`.
5. **Видно, але можна відповісти.** Розкид яскравості під туманом — не однотонний і менший, ніж без туману; амплітуда тремтіння ≥ 10 px і ≥ 50 % вибірки в спокої; відповідь крізь кожен із шести дебафів на 375 px. Тест: задача 9.


**Рішення координатора (відповідь на відкрите питання):** додати прапорець `settings.debuffShop?: boolean` (за замовчуванням увімкнено, якщо дебафи дозволені): «Гравці можуть купувати дебафи». Вимкнений — купівлі немає, ведучий насилає як раніше. Задача 1 додає поле в схему, задача 2 відмовляє в `buyDebuff` з `not_allowed`, задача 3 не показує крамницю, задача 6 додає прапорець у редактор поруч із цінами.

---

### Задача 1. Shared: ціни дебафів у налаштуваннях, джерело «дебаф», помилки й подія покупки

**Files:**
- Modify: `packages/shared/src/quiz.ts` (`LIMITS`, `quizSettingsSchema`, `debuffPrice`)
- Modify: `packages/shared/src/game.ts` (`AdjustmentSource`, `ErrorCode`, `ShopBlock`)
- Modify: `packages/shared/src/events.ts` (`buyDebuffSchema`, `ClientToServerEvents['player:debuff']`)
- Modify: `packages/shared/src/history.ts` (`GameAdjustment`)
- Modify: `apps/web/src/i18n.ts` (`err_points_short`, `err_debuff_bought`)
- Test: `packages/shared/src/quiz.test.ts`

**Interfaces:**
- Produces (`quiz.ts`):
  ```ts
  // у LIMITS:
  /** Ціна дебафу для гравців (9c), балів. */
  minDebuffPrice: 50,
  maxDebuffPrice: 5000,
  defaultDebuffPrice: 200,

  // у quizSettingsSchema:
  /** Ціни дебафів для гравців; немає ключа — LIMITS.defaultDebuffPrice. */
  debuffPrices: z.partialRecord(z.enum(DEBUFF_KINDS), z.number().int().min(LIMITS.minDebuffPrice).max(LIMITS.maxDebuffPrice)).optional(),

  /** Ціна дебафу у вікторині для гравців (ведучий насилає безкоштовно). */
  export function debuffPrice(quiz: Pick<Quiz, 'settings'>, kind: DebuffKind): number;
  ```
  (Якщо `z.partialRecord` у встановленій версії zod немає — `z.object(Object.fromEntries(DEBUFF_KINDS.map((k) => [k, price.optional()])))` зі `.strict()`; тип однаковий.)
- Produces (`game.ts`):
  ```ts
  /** Звідки коригування рахунку поза відповідями: бали від ведучого, дуель або купівля дебафу (9c). */
  export type AdjustmentSource = 'host' | 'duel' | 'debuff';
  // ErrorCode + | 'points_short' | 'debuff_bought'
  /** Чому гравцеві зараз не купити дебаф (бали — окремо, на кожному дебафі). */
  export type ShopBlock = 'phase' | 'paused' | 'bought';
  ```
- Produces (`events.ts`):
  ```ts
  /** Купити дебаф для суперника (9c): ціль і вид; покупець — з ідентичності сокета. */
  export const buyDebuffSchema = z.object({ targetId: playerId, kind: z.enum(DEBUFF_KINDS) });
  // ClientToServerEvents:
  /** Купити дебаф для суперника за бали. */
  'player:debuff': (payload: z.infer<typeof buyDebuffSchema>, ack: Ack) => void;
  ```
- Produces (`history.ts`): у `GameAdjustment` — `/** Лише для source 'debuff': куплений вид і ціль (null — ціль вилучили до запису). */ debuff?: DebuffKind; target?: string | null;`
- i18n: `err_points_short: 'Не вистачає балів.'`, `err_debuff_bought: 'Ви вже купили дебаф до наступного запитання.'`.

- [ ] **Step 1: Write the failing tests** у `quiz.test.ts`:
  ```ts
  describe('debuff prices', () => {
    const quiz = (debuffPrices?: unknown) => ({ ...makeQuiz([single]), settings: { leaderboard: 'each', debuffPrices } });

    it('an old quiz without prices charges the default 200 for every debuff', () => {
      const old = quizSchema.parse({ ...makeQuiz([single]), settings: { leaderboard: 'each' } });
      for (const kind of DEBUFF_KINDS) expect(debuffPrice(old, kind)).toBe(200);
    });

    it('a price set by the host wins; the rest stay at the default', () => {
      const parsed = quizSchema.parse(quiz({ fog: 100, shake: 5000 }));
      expect(debuffPrice(parsed, 'fog')).toBe(100);
      expect(debuffPrice(parsed, 'shake')).toBe(5000);
      expect(debuffPrice(parsed, 'mud')).toBe(200);
    });

    it('refuses prices out of 50…5000, fractions and unknown debuffs', () => {
      for (const prices of [{ fog: 0 }, { fog: 49 }, { fog: 5001 }, { fog: 100.5 }, { fog: -200 }, { magic: 100 }]) {
        expect(quizSchema.safeParse(quiz(prices)).success, JSON.stringify(prices)).toBe(false);
      }
    });
  });
  ```
  (Фікстури `makeQuiz`/`single` — ті, якими вже користується `quiz.test.ts`; якщо їх там немає — мінімальна вікторина з наявних тестів цього файлу.)

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared`. Очікується FAIL: немає `debuffPrice`, ключ `debuffPrices` відкидається або ігнорується.

- [ ] **Step 3: Implement** за Interfaces. `debuffPrice`: `quiz.settings.debuffPrices?.[kind] ?? LIMITS.defaultDebuffPrice`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages`. Очікується PASS. (Рушій ще не знає `'debuff'` — це лише ширший тип, тож компіляція проходить; якщо десь є вичерпний `switch` за `AdjustmentSource` — додати гілку з тією самою поведінкою, що й `'host'`, і записати це в коміт.)

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/web/src/i18n.ts
git commit -m "feat(shared): debuff prices in the quiz settings (50…5000, default 200), the 'debuff' adjustment source, points_short and debuff_bought, the player:debuff event"
```

---

### Задача 2. Рушій: купівля дебафу — перевірки, коригування з покупцем і ціллю, `by` у дебафі; версія стану 2

**Files:**
- Modify: `packages/engine/src/adjust.ts`, `packages/engine/src/game.ts` (`DebuffState`, `ScoreAdjustment`), `packages/engine/src/debuffs.ts`
- Modify: `packages/engine/src/restore.ts` (`GAME_STATE_VERSION = 2`), `packages/engine/src/restore.test.ts`
- Create: `packages/engine/src/game.debuff-shop.test.ts`
- Modify: `packages/engine/src/game.debuffs.test.ts` (лише `by: null` в очікуваннях)

**Interfaces:**
- Produces (`game.ts`):
  ```ts
  export interface ScoreAdjustment {
    // …наявні поля…
    /** Лише для source 'debuff': кому куплено дебаф. */
    target?: string;
    /** Лише для source 'debuff': який дебаф куплено. */
    debuff?: DebuffKind;
  }
  export interface DebuffState {
    kind: DebuffKind;
    firedAt: number | null;
    since: number | null;
    /** Хто купив (id гравця); null — наслав ведучий. */
    by: string | null;
  }
  ```
- Produces (`adjust.ts`):
  ```ts
  /** Скільки запитань журналу закрито зараз: відкрите запитання — останнє в журналі. */
  export function afterQuestionNow(state: GameState): number;
  /** Дописати коригування в журнал (без перевірок) і перерахувати бали; adjustScore і buyDebuff стоять на ньому. */
  export function addAdjustment(state: GameState, playerId: string, points: number, now: number, source: AdjustmentSource, extra?: Pick<ScoreAdjustment, 'target' | 'debuff'>): GameState;
  ```
  `adjustScore` після своїх перевірок викликає `addAdjustment(…)` (поведінка й тести 7d без змін; `followWagerLimit` лишається в `addAdjustment`).
- Produces (`debuffs.ts`):
  ```ts
  /** Етапи, у які гравець може купити дебаф (поза фінальним раундом). */
  export const SHOP_PHASES: readonly Phase[] = ['intro', 'question', 'reveal', 'board', 'leaderboard', 'round_end'];
  /** Чому покупцеві зараз не купити: phase (етап поза SHOP_PHASES або фінальний раунд), paused, bought (уже купив у цьому циклі запитання); null — можна. */
  export function shopBlock(state: GameState, buyerId: string): ShopBlock | null;
  /**
   * Гравець купує дебаф для суперника за debuffPrice. Помилки в такому порядку: not_found (немає покупця чи цілі),
   * not_allowed (ціль — сам покупець або дебаф не дозволено), wrong_phase / paused / debuff_bought (shopBlock),
   * debuff_busy (на цілі вже чекає або діє дебаф), points_short (score < ціна).
   * Успіх: коригування −ціна з source 'debuff', target, debuff; дебаф цілі { kind, firedAt: null, since: null, by: buyerId }.
   */
  export function buyDebuff(state: GameState, buyerId: string, targetId: string, kind: DebuffKind, now: number): Result;
  ```
  `bought`: `state.adjustments.some((a) => a.source === 'debuff' && a.playerId === buyerId && a.afterQuestion === afterQuestionNow(state))`. Фінальний раунд: `currentRound(state)?.type === 'final'` (той самий спосіб, що `inFinalRound` у `views.ts`; винести в `game.ts` або повторити одним рядком). `setDebuff` ставить `by: null`. `cancelDebuff`: дебаф з `by !== null` → `not_allowed` (перевірка після `not_found`, до `wrong_phase`).

- [ ] **Step 1: Write the failing tests** у `game.debuff-shop.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { adjustScore } from './adjust';
  import { buyDebuff, cancelDebuff, setDebuff, shopBlock } from './debuffs';
  import { lock, next, pause, start, type GameState } from './game';
  import { finalRound, makeQuiz, makeRoundsQuiz, classicRound, single, text, withId } from './testing/fixtures';
  import { lobbyWith, must } from './testing/helpers';

  const T0 = 1_000_000;
  const rng = () => 0;
  const quiz = (settings = {}) => ({ ...makeQuiz([single, text, withId(single, 's2')]), settings: { leaderboard: 'each' as const, ...settings } });
  /** Заставка першого раунду, у Олени (p1) 500 балів від ведучого. */
  function rich(settings = {}): GameState {
    const started = must(start(lobbyWith(quiz(settings), 'Олена', 'Тарас', 'Віра')));
    return must(adjustScore(started, 'p1', 500, T0));
  }

  describe('buying a debuff', () => {
    it('charges the price as a debuff adjustment with the buyer and the target and arms the debuff from the buyer', () => {
      const s = must(buyDebuff(rich({ debuffPrices: { fog: 150 } }), 'p1', 'p2', 'fog', T0 + 1000));
      expect(s.players.find((p) => p.id === 'p1')?.score).toBe(350);
      expect(s.adjustments.at(-1)).toMatchObject({ playerId: 'p1', points: -150, source: 'debuff', target: 'p2', debuff: 'fog', at: T0 + 1000 });
      expect(s.debuffs.p2).toEqual({ kind: 'fog', firedAt: null, since: null, by: 'p1' });
      // спрацьовує, як від ведучого: у наступному запитанні цілі
      const opened = must(next(s, T0 + 2000, rng));
      expect(opened.debuffs.p2).toMatchObject({ firedAt: opened.questionIndex, since: T0 + 2000, by: 'p1' });
    });

    it('the default price is 200', () => {
      const s = must(buyDebuff(rich(), 'p1', 'p2', 'mud', T0));
      expect(s.players.find((p) => p.id === 'p1')?.score).toBe(300);
    });

    it('refuses when the points are short and allows exactly the price', () => {
      const poor = must(adjustScore(must(start(lobbyWith(quiz(), 'Олена', 'Тарас'))), 'p1', 199, T0));
      expect(buyDebuff(poor, 'p1', 'p2', 'fog', T0)).toEqual({ ok: false, error: 'points_short' });
      const exact = must(adjustScore(poor, 'p1', 1, T0));
      const bought = must(buyDebuff(exact, 'p1', 'p2', 'fog', T0));
      expect(bought.players.find((p) => p.id === 'p1')?.score).toBe(0);
      // від'ємний рахунок (бали від ведучого −300) — теж points_short, і ціна 50 не проходить при 49
      const negative = must(adjustScore(must(start(lobbyWith(quiz({ debuffPrices: { mud: 50 } }), 'Олена', 'Тарас'))), 'p1', -300, T0));
      expect(buyDebuff(negative, 'p1', 'p2', 'mud', T0)).toEqual({ ok: false, error: 'points_short' });
      const almost = must(adjustScore(negative, 'p1', 349, T0));
      expect(buyDebuff(almost, 'p1', 'p2', 'mud', T0)).toEqual({ ok: false, error: 'points_short' });
    });

    it('not for yourself, not a debuff the quiz does not allow, not an unknown player', () => {
      expect(buyDebuff(rich(), 'p1', 'p1', 'fog', T0)).toEqual({ ok: false, error: 'not_allowed' });
      expect(buyDebuff(rich({ debuffs: ['mud'] }), 'p1', 'p2', 'fog', T0)).toEqual({ ok: false, error: 'not_allowed' });
      expect(buyDebuff(rich(), 'p1', 'nobody', 'fog', T0)).toEqual({ ok: false, error: 'not_found' });
      expect(buyDebuff(rich(), 'nobody', 'p2', 'fog', T0)).toEqual({ ok: false, error: 'not_found' });
    });

    it('a target with a debuff is busy whoever sent it', () => {
      const fromHost = must(setDebuff(rich(), 'p2', 'shake'));
      expect(fromHost.debuffs.p2.by).toBeNull();
      expect(buyDebuff(fromHost, 'p1', 'p2', 'fog', T0)).toEqual({ ok: false, error: 'debuff_busy' });
      const bought = must(buyDebuff(rich(), 'p1', 'p2', 'fog', T0));
      expect(setDebuff(bought, 'p2', 'mud')).toEqual({ ok: false, error: 'debuff_busy' });
    });

    it('one purchase per buyer per question cycle', () => {
      // заставка раунду: купив — більше не може; інший покупець — може
      let s = must(buyDebuff(rich(), 'p1', 'p2', 'fog', T0));
      expect(shopBlock(s, 'p1')).toBe('bought');
      expect(buyDebuff(s, 'p1', 'p3', 'mud', T0)).toEqual({ ok: false, error: 'debuff_bought' });
      expect(shopBlock(s, 'p3')).toBeNull();
      // перше запитання відкрито — той самий цикл (ще жодне запитання не закрито)
      s = must(next(s, T0 + 1000, rng));
      expect(s.phase).toBe('question');
      expect(shopBlock(s, 'p1')).toBe('bought');
      // запитання закрито → розкриття: новий цикл
      s = must(lock(s, T0 + 2000));
      s = must(next(s, T0 + 3000, rng));
      expect(s.phase).toBe('reveal');
      expect(shopBlock(s, 'p1')).toBeNull();
      s = must(buyDebuff(s, 'p1', 'p3', 'mud', T0 + 3500));
      // наступне запитання відкрито — той самий цикл, що й розкриття
      while (s.phase !== 'question') s = must(next(s, T0 + 4000, rng));
      expect(shopBlock(s, 'p1')).toBe('bought');
    });

    it('cannot buy while answers are locked, in a duel, in the final round or on pause; can on intro, question, reveal, table and round end', () => {
      // lobby → wrong_phase; intro → ok; question → ok; locked → wrong_phase; reveal → ok; leaderboard → ok; pause на question → paused;
      // фінальний раунд (makeRoundsQuiz([classicRound(…), finalRound(…)])): intro/wager/question фіналу → wrong_phase, round_end класики перед ним → ok;
      // дуель (toDuelQuestion з testing/duel, у гравця бали) → wrong_phase; finished → wrong_phase.
    });

    it('the host cannot cancel a bought debuff but still cancels his own', () => {
      const bought = must(buyDebuff(rich(), 'p1', 'p2', 'fog', T0));
      expect(cancelDebuff(bought, 'p2')).toEqual({ ok: false, error: 'not_allowed' });
      expect(cancelDebuff(must(setDebuff(rich(), 'p2', 'fog')), 'p2').ok).toBe(true);
    });

    it('a kicked buyer leaves the debuff on the target; a kicked target takes it away and the price stays spent', () => {
      // removePlayer(bought, 'p1') → debuffs.p2.by === 'p1' лишається, коригування p1 зникають з гравцем (як у 7d);
      // removePlayer(bought, 'p2') → debuffs.p2 немає, коригування p1 −200 лишається.
    });
  });
  ```
  Чернеткові коментарі (`one purchase per buyer…` після `lock`, фазові й вилучення) розписати повними перевірками; фазовий тест — циклом по станах зі списком очікуваних результатів. У `game.debuffs.test.ts` у всіх `toEqual({ kind, firedAt, since })` додати `by: null` — інших змін там немає.
  У `restore.test.ts`: `DebuffState` → `['kind', 'firedAt', 'since', 'by']`, `ScoreAdjustment` → `[…, 'target', 'debuff']`, `QuizSettings` → `[…, 'debuffPrices']`; `KEYS[2]` — копія `KEYS[1]` з цими трьома рядками (відсортовано); у `representative()` додати стан з покупкою (`buyDebuff` після `adjustScore`, на `debuffs` і `adjustments`), а `missing` тепер `['ChainProgress', 'DiceState', 'SortProgress']`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL: немає `buyDebuff`/`shopBlock`, `by` у стані, `KEYS[2]`.

- [ ] **Step 3: Implement** за Interfaces; `GAME_STATE_VERSION = 2` у `restore.ts` (коментар: «2 — 9c: DebuffState.by, ScoreAdjustment.target/debuff, QuizSettings.debuffPrices»). Експорт нового з `index.ts`, якщо `debuffs.ts`/`adjust.ts` експортуються переліком.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages`. Очікується PASS. Потім `pnpm vitest run --maxWorkers=1 apps/server` — тести `SavedRoom`/сховища мають пройти з версією 2 (якщо десь буквальна `stateVersion: 1` — замінити на `GAME_STATE_VERSION`).

- [ ] **Step 5: Commit**

```bash
git add packages/engine apps/server/src
git commit -m "feat(engine): buyDebuff — a player pays the price from points he has (not into negative) for a rival's debuff, once per question cycle, never while answers are locked, in a duel or in the final; the purchase is a 'debuff' adjustment with the target and the kind; GAME_STATE_VERSION 2"
```

---

### Задача 3. Зрізи: аркуш покупки, хто наслав, сповіщення про покупку

**Files:**
- Modify: `packages/shared/src/views.ts`
- Modify: `packages/engine/src/views.ts`, `packages/engine/src/debuffs.ts` (`lastPurchase`)
- Create: `packages/engine/src/views.debuff-shop.test.ts`
- Modify: тести, що порівнюють повні зрізи через `toEqual` (лише нові поля)

**Interfaces:**
- Produces (`shared/views.ts`):
  ```ts
  /** Аркуш «Дебафи» на телефоні (9c). */
  export interface PlayerShop {
    /** Дозволені дебафи з цінами, у порядку DEBUFF_KINDS. */
    items: { kind: DebuffKind; price: number }[];
    /** Суперники в порядку гравців; busy — на ньому вже чекає або діє дебаф. */
    targets: (BlitzPlayer & { busy: boolean })[];
    /** null — купити можна (бали телефон порівнює з ціною сам); інакше чому ні. */
    block: ShopBlock | null;
  }
  /** Остання покупка дебафу в грі — для сповіщення «Оля насилає дебаф на гравця Петро»; виду немає навмисно. */
  export interface DebuffNotice {
    /** seq коригування покупки. */
    seq: number;
    at: number;
    buyer: BlitzPlayer;
    target: BlitzPlayer;
  }
  // BaseView: /** Остання покупка дебафу; null — не було або покупця чи ціль вилучено. */ debuffNotice: DebuffNotice | null;
  // PlayerView.me.debuff: { kind: DebuffKind; since: number; /** Нікнейм покупця; null — ведучий або покупця вилучено. */ by: string | null } | null;
  // PlayerView.me: /** null — у вікторині немає дебафів, немає суперників або етап lobby/guide/finished. */ shop: PlayerShop | null;
  // HostPlayer.debuff: { kind: DebuffKind; fired: boolean; by: string | null } | null;
  ```
- Produces (`debuffs.ts`): `export function lastPurchase(state: GameState): DebuffNotice | null` — останнє коригування `source === 'debuff'`, якщо покупець і ціль ще в грі; інакше `null` (не шукати старіших: сповіщення про давню покупку не має спливти після вилучення).
- `views.ts`: `playerShop(state, playerId)` — `null` за умов вище; `items` з `debuffPrice`; `targets` — усі, крім себе, `busy: shownDebuff(state, id) !== null`; `block: shopBlock(state, playerId)`. `playerDebuff` і `hostDebuff` додають `by: nicknameOf(state, debuff.by)` (`null`, якщо `by === null` або гравця немає). `base()` додає `debuffNotice: lastPurchase(state)`.

- [ ] **Step 1: Write the failing tests** у `views.debuff-shop.test.ts`:
  ```ts
  describe('the debuff shop in views', () => {
    it('lists allowed debuffs with prices and rivals, marks a busy rival, and says why buying is blocked', () => {
      const s = rich({ debuffs: ['fog', 'mud'], debuffPrices: { fog: 100 } }); // з game.debuff-shop.test.ts — винести в testing/debuffs.ts
      const shop = playerView(s, 'p1').me.shop!;
      expect(shop.items).toEqual([{ kind: 'fog', price: 100 }, { kind: 'mud', price: 200 }]);
      expect(shop.targets.map((t) => [t.nickname, t.busy])).toEqual([['Тарас', false], ['Віра', false]]);
      expect(shop.block).toBeNull();
      const bought = must(buyDebuff(s, 'p1', 'p2', 'fog', T0));
      expect(playerView(bought, 'p1').me.shop!.block).toBe('bought');
      expect(playerView(bought, 'p3').me.shop!.targets.find((t) => t.playerId === 'p2')?.busy).toBe(true);
      expect(playerView(must(pause(bought, T0)), 'p3').me.shop!.block).toBe('paused');
    });

    it('no shop in the lobby, the guide, after the game, without debuffs or without rivals', () => {
      // lobbyWith(...) → shop null; settings.debuffs: [] → null; гра з одним гравцем → null; end(...) → null
    });

    it('the victim learns the buyer when the debuff fires, not before', () => {
      const bought = must(buyDebuff(rich(), 'p1', 'p2', 'fog', T0));
      expect(playerView(bought, 'p2').me.debuff).toBeNull();
      const opened = must(next(bought, T0 + 1000, rng));
      expect(playerView(opened, 'p2').me.debuff).toEqual({ kind: 'fog', since: T0 + 1000, by: 'Олена' });
      // від ведучого — by null
      const host = must(next(must(setDebuff(rich(), 'p2', 'fog')), T0 + 1000, rng));
      expect(playerView(host, 'p2').me.debuff?.by).toBeNull();
    });

    it('the host sees the kind and the buyer', () => {
      const bought = must(buyDebuff(rich(), 'p1', 'p2', 'fog', T0));
      expect(hostView(bought).players.find((p) => p.id === 'p2')?.debuff).toEqual({ kind: 'fog', fired: false, by: 'Олена' });
    });

    it('the purchase notice names the buyer and the target but not the kind, for every role', () => {
      const bought = must(buyDebuff(rich(), 'p1', 'p2', 'fog', T0 + 5));
      const notice = { seq: bought.adjustments.at(-1)!.seq, at: T0 + 5, buyer: { playerId: 'p1', nickname: 'Олена' }, target: { playerId: 'p2', nickname: 'Тарас' } };
      for (const view of [stageView(bought), hostView(bought), playerView(bought, 'p2'), playerView(bought, 'p3')]) expect(view.debuffNotice).toEqual(notice);
      expect(JSON.stringify(stageView(bought).debuffNotice)).not.toContain('fog');
      // бали від ведучого після покупки не змінюють debuffNotice; вилучення покупця → null
    });
  });
  ```
  Спільні `rich`/`quiz`/`T0`/`rng` — винести з задачі 2 у `packages/engine/src/testing/debuffs.ts` (новий) і імпортувати в обох тестах.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine`. Очікується FAIL.

- [ ] **Step 3: Implement** за Interfaces. Потім `pnpm typecheck` покаже веб-місця, що читають `HostPlayer.debuff`/`me.debuff` і тестові зрізи-фікстури (`apps/web/src/**/*.test.tsx` з `me: { … debuff: … }`) — додати `by: null`, `shop: null`, `debuffNotice: null` у фікстури; поведінки вебу не змінювати (це задача 7).

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=2 apps/web`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages apps/web/src
git commit -m "feat(engine): views for the debuff shop — prices, rivals with a busy mark, why buying is blocked; the victim learns the buyer when the debuff fires; a purchase notice for every role without the kind"
```

---

### Задача 4. Сервер: подія `player:debuff`

**Files:**
- Modify: `apps/server/src/rooms/manager.ts` (`buyDebuff`), `apps/server/src/rooms/manager.test.ts`
- Modify: `apps/server/src/socket.ts`, `apps/server/src/socket.test.ts`

**Interfaces:**
- Produces (`manager.ts`):
  ```ts
  /** Гравець купує дебаф для суперника (9c). */
  buyDebuff(room: Room, buyerId: string, targetId: string, kind: DebuffKind): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, buyDebuff(room.state, buyerId, targetId, kind, this.now()));
  }
  ```
  (`alive`/`gone` уже повертають `restarting` у замороженому менеджері — 9b.)
- Produces (`socket.ts`), поруч із `player:buff`:
  ```ts
  on('player:debuff', (args) => {
    if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
    const payload = buyDebuffSchema.safeParse(payloadOf(args));
    return payload.success ? manager.buyDebuff(room, identity.playerId, payload.data.targetId, payload.data.kind) : INVALID;
  });
  ```

- [ ] **Step 1: Write the failing tests.** У `socket.test.ts` за зразком `buff events are role-checked and validated`:
  ```ts
  it('a player buys a debuff for a rival: role-checked, validated, charged, and the rival sees the buyer when it fires', async () => {
    const quiz = makeQuiz([single, text], { debuffs: ['fog'], debuffPrices: { fog: 100 } });
    const created = (await startGame(ctx.app, quiz)).game;
    const { host, stage, olena, taras } = await lobby(created);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    const tarasId = /* id Тараса з першого зрізу olena: view.me.shop.targets[0].playerId */;
    expect(await send(olena, 'player:debuff', { targetId: tarasId, kind: 'fog' })).toEqual({ ok: false, error: 'points_short' });
    // бали від ведучого: host:adjust +150 Олені
    expect(await send(host, 'player:debuff', { targetId: tarasId, kind: 'fog' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'player:debuff', { targetId: tarasId, kind: 'fog' })).toEqual({ ok: false, error: 'forbidden' });
    for (const payload of [undefined, { targetId: tarasId }, { targetId: tarasId, kind: 'magic' }, { targetId: 5, kind: 'fog' }]) {
      expect(await send(olena, 'player:debuff', payload)).toEqual({ ok: false, error: 'invalid_payload' });
    }
    expect(await send(olena, 'player:debuff', { targetId: tarasId, kind: 'fog' })).toEqual({ ok: true });
    expect(await send(olena, 'player:debuff', { targetId: tarasId, kind: 'fog' })).toEqual({ ok: false, error: 'debuff_bought' });
    const mine = await until(olena, (v) => v.role === 'player' && v.me.score === 50);
    expect(mine.debuffNotice?.target.nickname).toBe('Тарас');
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    const hit = await until(taras, (v) => v.role === 'player' && v.me.debuff !== null);
    expect(hit.role === 'player' && hit.me.debuff).toMatchObject({ kind: 'fog', by: 'Олена' });
  });
  ```
  (Назви `lobby`, `until`, `send`, `startGame` — з наявного файлу; якщо `lobby` не повертає другого гравця — розширити за зразком інших тестів файлу.) У `manager.test.ts` — один тест: `buyDebuff` у замороженому менеджері дає `restarting`, у закритій кімнаті — `game_not_found` (за зразком наявних тестів `buff`).

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/socket.test.ts apps/server/src/rooms/manager.test.ts`. Очікується FAIL.

- [ ] **Step 3: Implement** за Interfaces.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=1 apps/server`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src
git commit -m "feat(server): player:debuff — a player buys a rival's debuff; only players, the buyer is the socket's own player"
```

---

### Задача 5. База й історія: покупки в `score_adjustment` (міграція 0011), рядок в історії, досягнення без покупок

**Files:**
- Modify: `apps/server/src/db/schema.ts` (`scoreAdjustment.debuff`, `targetNickname`)
- Create (згенерувати): `apps/server/drizzle/0011_debuff_purchases.sql`, `apps/server/drizzle/meta/0011_snapshot.json`; Modify: `apps/server/drizzle/meta/_journal.json`
- Modify: `apps/server/src/db/schema.test.ts`, `apps/server/src/recorder.ts`, `apps/server/src/recorder.test.ts`, `apps/server/src/history.ts`, `apps/server/src/history.test.ts`, `apps/server/src/achievements.ts`, `apps/server/src/achievements.test.ts`, `apps/server/src/testing/history-rows.ts` (якщо фікстура рядків має перелік полів коригування)

**Interfaces:**
- Produces (`schema.ts`), у `scoreAdjustment`:
  ```ts
  /** Купівля дебафу (9c): вид; null — не покупка (і в старих іграх). */
  debuff: text('debuff').$type<DebuffKind>(),
  /** Купівля дебафу: нікнейм цілі в мить запису; null — не покупка або ціль уже вилучено. */
  targetNickname: text('target_nickname'),
  ```
- `recorder.ts`: у `fresh` — `debuff: a.debuff ?? null, targetNickname: a.target === undefined ? null : (state.players.find((p) => p.id === a.target)?.nickname ?? null)`.
- `history.ts` (рядок ~276): `…(source === 'debuff' ? { debuff: row.debuff ?? undefined, target: row.targetNickname } : {})` — рядки інших джерел мають ті самі ключі, що й до 9c.
- `achievements.ts`: `roundPointsWithoutDuels` → `row.source !== 'duel' && row.source !== 'debuff'` (назву функції — `roundPointsOfPlay`, коментар оновити).

- [ ] **Step 1: Write the failing tests.**
  - `schema.test.ts`: `it('migration 0011 adds the purchase columns and keeps old adjustments', …)` — `createTestDbUpTo('0010_live_rooms')`, вставити гру, учасника й коригування SQL-ом (як тест «an old database migrates to score adjustments»), `migrateRest()`, `select` повертає `debuff: null, targetNickname: null`.
  - `recorder.test.ts`, за зразком `stores host adjustments and keeps the participant score equal to the leaderboard`:
    ```ts
    it('records a purchase with the kind and the target nickname; the participant score includes the price', async () => {
      // host:adjust +300 Олені → manager.buyDebuff(room, olena, taras, 'fog') → дочекатися запису →
      // рядки score_adjustment: [olena, 1, …, 300, 'host', null, null], [olena, 2, …, -200, 'debuff', 'fog', 'Тарас'];
      // participant.score Олени = сума відповідей + 100
    });
    ```
  - `history.test.ts`, у `describe('history: score adjustments')`: гра з рядком `source: 'debuff', debuff: 'fog', targetNickname: 'Тарас'` → `hostGame(...).adjustments` містить `{ seq, roundIndex, afterQuestion, nickname: 'Олена', points: -200, source: 'debuff', debuff: 'fog', target: 'Тарас' }`, а рядок `'host'` — рівно як раніше (без `debuff`/`target`).
  - `achievements.test.ts`: бліц-раунд, де Олена має строгу перевагу, а покупка −200 у тому ж раунді її забрала б — `wonBlitzRound` лишається `true`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/db apps/server/src/recorder.test.ts apps/server/src/history.test.ts apps/server/src/achievements.test.ts`. Очікується FAIL.

- [ ] **Step 3: Implement.** Змінити `schema.ts`, потім з теки `apps/server`: `pnpm exec drizzle-kit generate --name debuff_purchases`. Перевірити назву `0011_debuff_purchases.sql` (два `ALTER TABLE … ADD COLUMN`), дописати першим рядком: `-- Купівля дебафів гравцями (план 9c): вид і ціль у коригуванні. Старі коригування мають null.`. Далі записувач, історія, досягнення.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=1 apps/server`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src apps/server/drizzle
git commit -m "feat(server): debuff purchases in score_adjustment (migration 0011) with the kind and the target nickname; the game history lists them; a purchase does not lose a blitz round win"
```

---

### Задача 6. Веб: ціни в редакторі й рядки покупок в історії

**Files:**
- Modify: `apps/web/src/editor/PowersEditor.tsx`, `apps/web/src/editor/QuizEditor.tsx` (лише тип `onChange`)
- Create: `apps/web/src/editor/PowersEditor.test.tsx`
- Modify: `apps/web/src/pages/GameHistory.tsx`; Test: `apps/web/src/pages/GameHistory.test.tsx` (створити, якщо немає; `duelLines` уже експортується — тест поруч)
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/styles.css`

**Interfaces:**
- `PowersEditor` `onChange: (powers: { debuffs: DebuffKind[]; buffs: BuffKind[]; debuffPrices: Partial<Record<DebuffKind, number>> | undefined }) => void` — `QuizEditor` і далі передає все в `setSettings` (злиття вже є). Біля кожного **увімкненого** дебафу — `<label className="powers-price">{t('powersPrice')}<input type="number" inputMode="numeric" min={50} max={5000} step={50} …/></label>`; значення — `settings.debuffPrices?.[kind] ?? ''` з плейсхолдером `200`. Порожнє або `200` → ключ видаляється; об'єкт без ключів → `undefined`. Знятий прапорець прибирає ціну. Число поза 50…5000 у полі лишається (зберегти не дасть схема — наявна помилка збереження); `aria-invalid` на такому полі.
- `GameHistory.tsx`: `export function debuffLines(adjustments: GameAdjustment[]): string[]` — рядки `source === 'debuff'` за `seq`: `t(target ? 'historyDebuff' : 'historyDebuffNoTarget', { buyer: nickname, debuff: \`${DEBUFF_ICONS[debuff]} ${debuffName(debuff)}\`, target, points: signed(points) })`; у групі раунду — окремим списком після дуелей, класом `round-adjustments` (як дуелі).
- i18n: `powersDebuffs: 'Дебафи — ведучий насилає безкоштовно, гравці купують за бали'`, `powersPrice: 'Ціна, балів'`, `historyDebuff: '{buyer} купує {debuff} для гравця {target}: {points}'`, `historyDebuffNoTarget: '{buyer} купує {debuff}: {points}'`.

- [ ] **Step 1: Write the failing tests.**
  ```ts
  // PowersEditor.test.tsx
  it('shows a price field for every allowed debuff with 200 as the placeholder', () => {
    render(<PowersEditor settings={{ leaderboard: 'each', debuffs: ['fog', 'mud'] }} spares={undefined} onChange={vi.fn()} />);
    expect(screen.getAllByLabelText('Ціна, балів')).toHaveLength(2);
    expect(screen.getAllByLabelText('Ціна, балів')[0]).toHaveAttribute('placeholder', '200');
  });
  it('a typed price goes into debuffPrices; empty or 200 drops the key; unticking drops the price', async () => {
    // ввести 100 у поле Туману → onChange з debuffPrices { fog: 100 }; очистити → debuffPrices undefined;
    // settings з debuffPrices { fog: 100 }, зняти прапорець Туману → debuffs ['mud'], debuffPrices undefined
  });
  // GameHistory.test.tsx
  it('lists purchases as «Оля купує 🌫️ Туман для гравця Петро: −200»', () => {
    expect(debuffLines([
      { seq: 1, roundIndex: 0, afterQuestion: 0, nickname: 'Оля', points: -100, source: 'host' },
      { seq: 2, roundIndex: 0, afterQuestion: 1, nickname: 'Оля', points: -200, source: 'debuff', debuff: 'fog', target: 'Петро' },
      { seq: 3, roundIndex: 0, afterQuestion: 2, nickname: 'Іра', points: -150, source: 'debuff', debuff: 'mud', target: null },
    ])).toEqual(['Оля купує 🌫️ Туман для гравця Петро: −200', 'Іра купує 🟫 Брудний екран: −150']);
  });
  ```
  (Знак мінуса — той, що дає наявний `signed`.)

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/editor apps/web/src/pages`. Очікується FAIL.

- [ ] **Step 3: Implement** за Interfaces; `.powers-price` — у рядку з прапорцем, поле `width: 6rem`, на 375 px переноситься під назву (`flex-wrap`), без горизонтальної прокрутки.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): debuff prices in «Бафи й дебафи» (empty means 200), purchases in the game history — «Оля купує 🌫️ Туман для гравця Петро: −200»"
```

---

### Задача 7. Веб: аркуш «Дебафи» на телефоні, сповіщення про покупку, жертва бачить покупця, пульт

**Files:**
- Create: `apps/web/src/screens/DebuffShop.tsx`, `apps/web/src/screens/DebuffShop.test.tsx`
- Modify: `apps/web/src/screens/PlayerScreen.tsx`, `PlayerScreen.test.tsx`, `StageScreen.tsx`, `HostScreen.tsx`, `HostPlayerTools.tsx`, `HostPlayerTools.test.tsx`, `Debuffs.tsx`, `Debuffs.test.tsx`
- Modify: `apps/web/src/live/LiveNotices.tsx` (`DebuffToast`), `apps/web/src/i18n.ts`, `apps/web/src/styles.css`

**Interfaces:**
- Produces (`DebuffShop.tsx`):
  ```tsx
  /**
   * Кнопка «😈» у шапці телефона (ім'я «Дебафи») і аркуш покупки: крок 1 — дебаф (іконка, назва, опис з debuffGuide_*, ціна;
   * дорожчий за рахунок вимкнений з «Не вистачає балів»), крок 2 — суперник (busy вимкнений з «Уже має дебаф»), «Купити за {price}».
   * block ≠ null — список видно, кнопки вимкнені, над ними причина. Аркуш — як «Таблиця»: портал, role="dialog", Escape і дотик повз картку закривають, фокус повертається на кнопку.
   */
  export function DebuffShop({ shop, score, send, onError }: { shop: PlayerShop; score: number; send: Send; onError: (text: string | null) => void }): JSX.Element;
  ```
  Після `ok` аркуш закривається; помилка — `onError(errorText(…))` і аркуш лишається відкритим на кроці 2. Подвійний дотик не шле двох запитів (той самий захист, що `useGuardedSend` у `HostPlayerTools` — винести його в `apps/web/src/live/useGuardedSend.ts` і користуватися з обох місць).
- `PlayerScreen.tsx`: у шапці між `DuelButton` і `TableButton` — `{me.shop !== null && <DebuffShop shop={me.shop} score={me.score} send={send} onError={setError} />}`; кнопка не вища за рядок шапки (клас `table-button`), лише значок «😈» з `aria-label={t('shopOpen')}` — шапка 375 px з довгим ніком лишається в один рядок (сценарій 7g).
- `LiveNotices.tsx`:
  ```tsx
  /** «Оля насилає дебаф на гравця Петро» — сцена, пульт і телефони; position: fixed, як сповіщення бафу. */
  export function DebuffToast({ notice, offsetMs }: { notice: DebuffNotice | null; offsetMs: number }): JSX.Element | null;
  ```
  клас `live-notice is-debuff` (рамка `--amber`); стос — як `.is-buff`: `.live-notice:has(~ .live-notice.is-debuff) { translate: 0 -3.5rem; }`. Додати в `PlayerScreen`, `StageScreen`, `HostScreen` після `BuffToast`.
- `Debuffs.tsx`: банер — `debuff.by !== null ? t('debuffCastBy', { by: debuff.by, name }) : t('debuffCast', { name })`.
- `HostPlayerTools.tsx`: `debuffTagText` — з `by`: `debuffWaitingBy`/`debuffFiringBy`; `DebuffPanel` не показує «Скасувати дебаф» для `by !== null`, натомість `<p className="meta">{t('debuffBought')}</p>`.
- i18n: `shopOpen: 'Дебафи'`, `shopTitle: 'Дебафи для суперників'`, `shopPick: 'Кому?'`, `shopBuy: 'Купити за {price}'`, `shopShort: 'Не вистачає балів'`, `shopBusy: 'Уже має дебаф'`, `shopBlock_phase: 'Зараз купити не можна'`, `shopBlock_paused: 'Гра на паузі'`, `shopBlock_bought: 'Ви вже купили дебаф до наступного запитання'`, `shopNote: 'Спрацює в наступному запитанні, де суперник відповідає.'`, `debuffCastBy: '{by} насилає на вас: {name}'`, `debuffBoughtNotice: '{buyer} насилає дебаф на гравця {target}'`, `debuffWaitingBy: '{icon} {name} від гравця {by} · чекає'`, `debuffFiringBy: '{icon} {name} від гравця {by} · діє'`, `debuffBought: 'Куплено гравцем — скасувати не можна.'`, `guideDebuffsTitle: 'Дебафи'`, `guideDebuffsLead: 'Ведучий може наслати перешкоду на одне запитання, а ви — купити її суперникові за бали (кнопка 😈). Відповісти все одно можна.'`.

- [ ] **Step 1: Write the failing tests.**
  ```tsx
  // DebuffShop.test.tsx
  const shop: PlayerShop = {
    items: [{ kind: 'fog', price: 100 }, { kind: 'mud', price: 300 }],
    targets: [{ playerId: 'p2', nickname: 'Петро', busy: false }, { playerId: 'p3', nickname: 'Іра', busy: true }],
    block: null,
  };
  it('buys fog for Петро in three taps and closes', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    render(<DebuffShop shop={shop} score={250} send={send} onError={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Дебафи' }));
    expect(screen.getByRole('button', { name: /Брудний екран/ })).toBeDisabled(); // 300 > 250
    expect(screen.getByText('Не вистачає балів')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Туман/ }));
    expect(screen.getByRole('button', { name: /Іра/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Петро/ }));
    await user.click(screen.getByRole('button', { name: 'Купити за 100' }));
    expect(send).toHaveBeenCalledWith('player:debuff', { targetId: 'p2', kind: 'fog' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('shows why buying is blocked and sends nothing', async () => {
    // block 'bought' → текст «Ви вже купили дебаф до наступного запитання», усі кнопки дебафів вимкнені
  });
  it('a refused purchase keeps the sheet open with the error', async () => {
    // send → { ok: false, error: 'debuff_busy' } → onError('На цього гравця вже наслано дебаф.'), діалог лишається
  });
  // Debuffs.test.tsx
  it('the victim banner names the buyer', () => {
    // DebuffZone з debuff { kind: 'fog', since: now, by: 'Оля' } → «Оля насилає на вас: Туман»; by null → «На вас наслано: Туман»
  });
  // HostPlayerTools.test.tsx
  it('a bought debuff shows the buyer and cannot be cancelled', () => {
    // player.debuff { kind: 'fog', fired: false, by: 'Оля' } → «🌫️ Туман від гравця Оля · чекає», кнопки «Скасувати дебаф» немає, є «Куплено гравцем — скасувати не можна.»
  });
  // PlayerScreen.test.tsx
  it('the header has «Дебафи» only when the view has a shop', () => { /* me.shop null → кнопки немає; з shop — є */ });
  // LiveNotices — DebuffToast: «Оля насилає дебаф на гравця Петро» з useNotice (ховається через NOTICE_MS) — тест поруч із наявними тестами сповіщень
  ```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web`. Очікується FAIL.

- [ ] **Step 3: Implement** за Interfaces; стилі аркуша — з `.table-sheet`/`.table-card` (новий клас-модифікатор `.shop-card`: сітка дебафів 2 колонки на 375 px, кнопка покупки на всю ширину внизу картки).

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): «😈 Дебафи» on the phone — pick a debuff with its price, a rival, «Купити за 200»; «Оля насилає дебаф на гравця Петро» on every screen; the victim banner names the buyer; the host sees who bought it and cannot cancel a bought one"
```

---

### Задача 8. Веб: помітні дебафи — туман-розмиття замість білої стіни, відчутне тремтіння, сильніші лід, гості й бруд

**Files:**
- Modify: `apps/web/src/styles.css` (`--fog`, `--ice`, `.debuff-fog`, `.debuff-ice`, `.debuff-guest`, `@keyframes debuff-shake`, `.is-shake`)
- Modify: `apps/web/src/screens/Debuffs.tsx` (`SHAKE_CYCLE_MS`, `useShakeBuzz`, 5 гостей), `apps/web/src/screens/Debuffs.test.tsx`
- Modify: `apps/web/src/screens/wipe.ts` (`splatsFor` розміри), `apps/web/src/screens/wipe.test.ts`

**Interfaces:**
- Produces (`Debuffs.tsx`):
  ```ts
  /** Цикл тремтіння, мс: поштовх — перші SHAKE_BURST частки, решта — спокій. CSS бере те саме число через --shake-cycle. */
  export const SHAKE_CYCLE_MS = 2800;
  export const SHAKE_BURST = 0.3;
  /** Вібрація на початку кожного поштовху (якщо є navigator.vibrate і не зменшена анімація); since — мить спрацювання за годинником сервера. */
  export function useShakeBuzz(active: boolean, since: number | null, offsetMs: number): void;
  ```
  Вібрація `[120, 60, 120]`, перший поштовх — у мить спрацювання, далі за фазою циклу від `since` (щоб CSS-поштовх і вібрація збігалися: `animation-delay: calc(-1 * var(--shake-phase))` на `.debuff-content`, де `--shake-phase` = `(now − since) mod SHAKE_CYCLE_MS` мс на мить рендеру). `useShakeBuzz` викликається в `DebuffZone` для `kind === 'shake'`.
- CSS (точні значення):
  ```css
  --fog: rgb(150 160 185 / 0.3);
  --ice: rgb(190 230 255 / 0.72);
  .debuff-fog { background: var(--fog); -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px); }
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { .debuff-fog { background: rgb(150 160 185 / 0.6); } }
  .debuff-ice { box-shadow: inset 0 0 1.5rem rgb(255 255 255 / 0.8); }
  .debuff-guest { font-size: 5.5rem; filter: drop-shadow(0 0.15rem 0.3rem rgb(0 0 0 / 0.6)); }
  .is-shake:not(.is-calm) .debuff-content { animation: debuff-shake var(--shake-cycle, 2800ms) infinite; animation-delay: calc(-1 * var(--shake-phase, 0ms)); }
  /* поштовх 0–30 %: ±14px / ±2.5°, кроки 3 %, 6 %, 9 %, …, 27 % з поступовим згасанням (14, 12, 10, 8, 6, 4 px); 30–100 % — translate 0 0, rotate 0 */
  ```
  Гостей — 5 (`GUESTS = ['🐞', '🐈', '🐕', '🐞', '🐈']`), біг 4 с замість 5 с. `splatsFor`: `size: 0.22 + rnd() * 0.08`.

- [ ] **Step 1: Write the failing tests.**
  ```ts
  // Debuffs.test.tsx
  it('shake buzzes the phone at the start of every burst and stops with the debuff', () => {
    vi.useFakeTimers();
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    const { rerender } = render(<DebuffZone debuff={{ kind: 'shake', since: Date.now(), by: null }} limitMs={30_000} offsetMs={0} questionIndex={0}>x</DebuffZone>);
    expect(vibrate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(SHAKE_CYCLE_MS * 2);
    expect(vibrate).toHaveBeenCalledTimes(3);
    expect(vibrate).toHaveBeenLastCalledWith([120, 60, 120]);
    rerender(<DebuffZone debuff={null} limitMs={30_000} offsetMs={0} questionIndex={1}>x</DebuffZone>);
    vi.advanceTimersByTime(SHAKE_CYCLE_MS * 2);
    expect(vibrate).toHaveBeenCalledTimes(3);
  });
  it('no buzz with reduced motion', () => { /* matchMedia('(prefers-reduced-motion: reduce)') → true → vibrate не викликається */ });
  it('the burst is at most 30 % of the cycle, so there is always a calm moment to tap', () => {
    expect(SHAKE_BURST).toBeLessThanOrEqual(0.3);
    expect(SHAKE_CYCLE_MS * (1 - SHAKE_BURST)).toBeGreaterThanOrEqual(1900);
  });
  it('five guests walk across the zone and catch no taps', () => {
    // DebuffZone kind 'guests' → 5 елементів .debuff-guest з класом debuff-layer
  });
  // wipe.test.ts
  it('mud splats cover about a third of the zone and every one can be wiped away', () => {
    const splats = splatsFor(7);
    const area = splats.reduce((sum, s) => sum + s.size * s.size, 0);
    expect(area).toBeGreaterThan(0.28);
    expect(area).toBeLessThan(0.55);
    // протирання кожної плями п'ять разів → left 0 у всіх
  });
  ```
  Наявна перевірка «freeze ≤ half the time» (`freezeMs`) лишається без змін і має проходити.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens`. Очікується FAIL.

- [ ] **Step 3: Implement** за Interfaces.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web`. Очікується PASS. Потім `pnpm build` і локальний перегляд за бажанням — остаточна перевірка помітності в задачі 9.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "fix(web): debuffs you can see but still answer through — fog is a strong blur over a light haze instead of a white wall, shake bursts ±14px every 2.8 s with a buzz and calm in between, thicker ice, five bigger guests, bigger mud"
```

---

### Задача 9. Наскрізні: купівля дебафів і кожен дебаф на телефоні 375 px — видно й можна відповісти

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–8.
- Нові допоміжні функції файлу:
  ```ts
  /** Розкид яскравості (стандартне відхилення luma 0…255) знімка елемента: однотонний «білий екран» дає ~0. Декодування — у самій сторінці (createImageBitmap + canvas), без нових залежностей. */
  async function lumaSpread(page: Page, selector: string): Promise<number>;
  /** Зсув .debuff-content по x за ~3 с, вибірка на кожен кадр (requestAnimationFrame у page.evaluate): найбільший |зсув| і частка кадрів у спокої (|зсув| < 0,5 px). */
  async function shakeSamples(page: Page, ms = 3000): Promise<{ max: number; calm: number }>;
  ```
- Наявні: `open`, `register`, `join`, `shot`, `click`, `field`, `afterSplash`, `expectApart`, `expectNoSideScroll`, `wipeWithMouse`, `snapshot`, `exact`.

- [ ] **Step 1: Add the scenario** `it('part 9c: a player buys every debuff for a rival with points — prices from the editor, not enough points, one per question, a busy rival, the buyer named on every screen; each debuff is clearly visible on a 375 px phone and the rival still answers; purchases in the history', …)` з `try/catch` і `snapshot()`. Підготовка:
  1. Ведучий `register(host, 'host', 'Олег Ведучий', 'host9c@example.com')`. Вікторина «Дебафи» через `host.request.post(…/api/quizzes)`: один класичний раунд `shuffleOptions: false`, `speedBonus: false`, `leaderboard: 'each'`, сім запитань single «Запитання N: столиця України?» — «Київ» (правильний), «Львів», «Одеса», «Харків»; 100 балів, 30 с. Усі шість дебафів дозволені, `debuffPrices` немає.
  2. **Редактор.** Ведучий відкриває вікторину в редакторі (1280 × 900), розділ «Бафи й дебафи»: біля Туману «Ціна, балів» = 100, біля Тремтіння = 150, решта порожні (плейсхолдер 200); «Зберегти»; кадр `debuff9c-editor-prices`. Потім `host` 375 × 812 (`setViewportSize`) — кадр `debuff9c-editor-prices-375`, `expectNoSideScroll`; назад 1280 × 900.
  3. Гра: `stage` 1600 × 900, `olya` 375 × 812 (покупець), `petro` 375 × 812 (жертва), `ira` 360 × 740 (без балів). «Почати гру» → `afterSplash`.

- [ ] **Step 2: Assertions and shots** (у такому порядку):
  1. **Без балів.** На заставці раунду Іра відкриває «Дебафи» (`getByRole('button', { name: 'Дебафи' })`): усі шість кнопок вимкнені, «Не вистачає балів» біля кожної, ціни 100 / 150 / 200 видно; кадр `debuff9c-shop-poor-360`; Escape закриває, фокус на кнопці.
  2. **Бали.** Ведучий дає Олі «Своя сума» 2000 (наявна панель «Бали»).
  3. **Покупка й сповіщення.** Оля: «Дебафи» → «🌫️ Туман · 100» → «Петро» → кадр `debuff9c-shop-pick-375` → «Купити за 100». Аркуш закривається; шапка Олі `1 900`; на сцені, пульті, у Петра й Іри — «Оля насилає дебаф на гравця Петро» (`.live-notice`), ніде немає «Туман» у сповіщенні; кадри `debuff9c-notice-stage`, `debuff9c-notice-375` (у Петра), `expectApart(petro, '.live-notice', ['header.bar'], …)`. Пульт: рядок Петра «🌫️ Туман від гравця Оля · чекає», кнопки «Скасувати дебаф» немає; кадр `debuff9c-host-row`.
  4. **Обмеження.** Друга покупка Олі в тому ж циклі: аркуш показує «Ви вже купили дебаф до наступного запитання», кнопки вимкнені. Іра після +300 від ведучого: у списку суперників Петро вимкнений з «Уже має дебаф».
  5. **Туман (Q1).** «Почати раунд» → `afterSplash`. Петро: `.debuff-zone[data-debuff="fog"]`, банер «Оля насилає на вас: Туман». Видимість: `lumaSpread(petro, '.debuff-zone h1')` > `0.15 × lumaSpread(olya, '.debuff-zone h1')` (не білий екран) і < `0.9 × …` (справді розмито); обчислений стиль `.debuff-fog`: альфа фону ≤ 0.4, `backdrop-filter` містить `blur(`; кадр `debuff9c-fog-375`. `wipeWithMouse` через середину — `data-cleared` > 0; кадр `debuff9c-fog-wiped-375`. Петро відповідає «Київ» — «Відповідь прийнято». `expectNoSideScroll(petro, 'debuff9c-fog-375')`.
  6. **Цикл на кожне запитання.** Перед кожним наступним запитанням (на розкритті чи таблиці попереднього) Оля купує Петрові наступний дебаф: Тремтіння (150), Заморозка, Дзеркало, Гості, Бруд (по 200). На кожному: кадр `debuff9c-<kind>-375` і Петро відповідає «Київ» з «Відповідь прийнято» (для заморозки — після того, як `fieldset.debuff-content` перестав бути `disabled`, але до кінця часу). Додатково:
     - тремтіння: `shakeSamples(petro)` → `max ≥ 10`, `calm ≥ 0.5`; кадр посеред поштовху `debuff9c-shake-burst-375` (знімок одразу після спрацювання);
     - заморозка: `.debuff-ice` вкриває ≥ 90 % площі зони (`boundingBox`), кнопка «Київ» вимкнена; через ≤ 5,5 с — увімкнена; кадри `debuff9c-freeze-375`, `debuff9c-freeze-thawed-375`;
     - дзеркало: `.debuff-content` з `transform` `matrix(-1, …)`; кадр;
     - гості: протягом 2 с видно ≥ 1 `.debuff-guest` з висотою ≥ 70 px у межах зони; дотик по «Київ» крізь гостя проходить;
     - бруд: 6 плям, сума площ плям ≥ 25 % зони; після `wipeWithMouse` по плямах — їхня `opacity` менша; кадри `debuff9c-mud-375`, `debuff9c-mud-wiped-375`.
  7. **Стіл і бали.** Таблиця сцени після сьомого запитання: Оля 2000 + свої відповіді − (100 + 150 + 4 × 200) = рахунок, що збігається з шапкою Олі й рядком пульта.
  8. **Історія.** «Завершити гру» → подіум. Історія ведучого, гра «Дебафи»: рядки «Оля купує 🌫️ Туман для гравця Петро: −100», «Оля купує 📳 Тремтіння екрана для гравця Петро: −150» і ще чотири по −200; кадр `debuff9c-history`.
  9. `expect(problems).toEqual([])`.

- [ ] **Step 3: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв (7d не змінюється: дебафи від ведучого — ті самі тексти). Потім той самий запуск з `E2E_SHOTS=1` і перегляд кадрів у `apps/server/e2e/artifacts/shots`: під туманом обриси запитання й варіантів угадуються; поштовх тремтіння помітно зсуває запитання; лід, гості й бруд добре видно; банер з іменем Олі не накриває варіантів; аркуш «Дебафи» на 360/375 px без горизонтальної прокрутки. Якщо кадр показує, що ефект слабкий або закриває все, — виправити значення в задачі 8 (і в цьому плані в розділі «Помітність»), не послаблюючи перевірок.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts
git commit -m "test: part 9c end-to-end — prices from the editor, a player buys all six debuffs for a rival with points (not enough points, one per question, a busy rival), the buyer named on every screen, each debuff visible on 375 px and answered through, purchases in the history"
```

Після фінальної рецензії гілку злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`. У звіті власникові назвати рішення: купити можна на заставці раунду, під час запитання, на розкритті, таблиці, полі й підсумках раунду, але не на паузі, не поки відповіді закриті до розкриття, не під час дуелі й не у фінальному раунді; одна покупка на запитання на гравця, на суперника одночасно один дебаф; ціна 50…5000, за замовчуванням 200, лише за наявні бали; бали не повертаються, навіть якщо дебаф не встиг спрацювати; ведучий насилає безкоштовно, а куплений дебаф скасувати не може; усі бачать «Оля насилає дебаф на гравця Петро» без виду, жертва дізнається вид і покупця в мить спрацювання; тексти без відмінків імен («купує … для гравця Петро»); туман тепер розмиття з легким серпанком (причина білого екрана — світлий непрозорий шар на світлому тексті), тремтіння — сильні поштовхи кожні 2,8 с з вібрацією на Android, між ними спокій; пуш 9c ще раз перерве ігри, що йдуть (змінився формат стану). Відкрите питання власникові: чи потрібен перемикач «гравці не можуть купувати дебафи» окремо від списку дозволених дебафів.
