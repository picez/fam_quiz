# План 12b: Пульт — перемикач «наживо» й живі вибори до «Надіслати»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 12b специфікації `docs/superpowers/specs/2026-10-27-subproject-12-design.md` (розділ 6; обмеження — розділи 2 і 3; рішення автора — розділ 18; відповідь власника — розділ 19, п. 1). Слова власника: «ведучий вмикає «наживо» й бачить, хто що тицяє, ще до «Надіслати»».
- **Пульт.** Перемикач «👁 Наживо» в шапці. Типово увімкнено, вибір пам'ятає пристрій ведучого (`localStorage`). Вимкнена панель «Відповіді наживо» згортається до заголовка й одного рядка «Відповіли 5 з 8» (черга бліцу з кнопками лишається), а живих виборів пульт не отримує взагалі.
- **Живі вибори.** Поки запитання відкрите, телефон шле поточний стан вводу подією `player:draft` (не частіше ніж раз на 250 мс, лише коли щось змінилось, лише до «Надіслати»). Пульт з увімкненим «наживо» бачить у рядку гравця курсивом «позначає Кит, Дельфін», «друкує «Осака»», «порядок: …», «повзунок: 7», міні-мапу точки, виділені плитки стіни, слово ланцюжка, вигадку блефу — з позначкою «ще не надіслав», «змінював 2 рази» й «думає 12 с». Після «Надіслати» рядок показує подану відповідь, як у 11c.
- **Команди.** Чернетка капітана йде товаришам, як і зараз (10j), а пульту — лише з увімкненим «наживо», тим самим шляхом, що й соло-чернетки.
- **Таємність.** Живі вибори бачить лише роль `host`. Сцена й телефони не отримують ні події `host:drafts`, ні тексту чернеток; у збережену кімнату й стан гри вони не потрапляють.
- **Гра без ведучого.** Телефони соло-чернеток не шлють (`view.autopilot`), сервер відповідає `not_allowed`. Чернетки капітана товаришам — як і зараз.
- **Довідка ведучого:** запис `setting.live` доповнюється перемикачем, живими виборами, «змінював N разів» і чесністю.

**Стан гри не змінюється: `GAME_STATE_VERSION` лишається 15, підняття версії не потрібне.**
- Чернетки, лічильник змін, обмеження частоти й прапорець «наживо» живуть лише в пам'яті: у `Room` (`drafts`, `draftRate`) і в даних сокета (`socket.data.watch`), як чернетки команд (10j) і нахил сортування (11d). У `GameState` і в `SavedRoom` нічого не додається, міграції бази немає.
- Поле `LiveRow.draft` зникає зі зрізу пульта (`HostView.live`). Зріз — це повідомлення сокета, а не збережений стан, тож версію це не зачіпає. Старий пульт, відкритий під час деплою, просто не покаже чернеток до оновлення сторінки.
- Деплой живих ігор не обриває: перезапуск і так стирає чернетки (так було й у 10j).

**Архітектура:**
- **Shared.**
  - Новий `packages/shared/src/drafts.ts`: `DraftValue` і `draftValueSchema` (відповідь телефона плюс `wallPick`, `chainWord`, `lie`), `DRAFT_TEXT_MAX`, `DRAFTS_PER_SECOND`, `HOST_DRAFTS_MS`, `draftQuestionType`, `isAnswerDraft`, `clipDraft`, типи `LiveDraft`, `HostDrafts`.
  - `events.ts`: `draftSchema` бере `draftValueSchema`; новий `liveWatchSchema`; подія клієнта `'host:live-watch'`, подія сервера `'host:drafts'`.
  - `views.ts` (задача 6): з `LiveRow` прибирається `draft`.
- **Сервер.**
  - `rooms/manager.ts`: `Draft` з `changes` і `teammates`, `Room.draftRate`; `draft()` приймає соло-гравців, людей в опитуванні й хмарі командної гри та нові види чернеток, відмовляє в автопілоті, обмежує частоту; `liveDrafts(room)` — пакет для пульта; `withLiveDrafts` прибирається; `RoomEvent` `draft` → `{ type: 'draft'; id; by; teammates }`; `answerStamp` бачить поступ ланцюжка, стіни й блефу; вилучення стирає чернетки людей.
  - `socket.ts`: `host:live-watch`, `socket.data.watch`, пакети `host:drafts` не частіше ніж раз на `HOST_DRAFTS_MS` лише пультам із «наживо»; на подію `draft` пульту більше не шлеться весь зріз; нахил сортування пульт отримує лише з «наживо».
- **Веб.**
  - Телефон: `AnswerInput` отримує окремий проп `confirm` (вибір із підтвердженням лишається тільки командним); `PlayerScreen` вмикає чернетки й у соло-грі; `MatchInput` шле й неповні пари; `CloudInput`, `WallInput`, `ChainView`, `BluffLieInput` отримують `onDraft`; `useDraftSender` працює з `DraftValue`, обрізає текст і повторює після `too_soon`.
  - Пульт: `storage.ts` (`loadLiveWatch`, `saveLiveWatch`), новий `live/useLiveWatch.ts`, `useGame` приймає `host:drafts`, `pages/Host.tsx` шле `host:live-watch`, `HostScreen` (перемикач у шапці), новий `live-drafts.ts` (тексти чернеток), `LiveAnswers` (згорнутий вигляд, рядки чернеток, міні-мапа).
- **Довідка ведучого:** `help/settings.ts`, запис `live`.
- **Наскрізні тести.** Один сценарій «part 12b: …»: пульт на телефоні 375 × 812, сцена 1280 × 720, телефони 375 × 812. Кадри з префіксом `p12b-`.

**Технології:** TypeScript, zod, vitest, Fastify + Socket.IO, React 19 + Vite, Testing Library (jsdom), Playwright. Нових залежностей немає.

**Рішення плану там, де специфікація мовчить (координатор може змінити):**

*Що вважається живим вибором*
- Одиночний вибір (варіанти, так/ні, опитування) у соло-грі надсилається одним дотиком, і так лишається: специфікація каже «телефон, сцена: без видимих змін». Тож «вибирає Б» з'являється лише там, де вибір має підтвердження: у капітана командної гри (як зараз, `ConfirmChoice`). У соло-грі дотик одразу дає подану відповідь, і пульт показує її як 11c. Відмежування — новий проп `confirm` в `AnswerInput` замість «`onDraft` вмикає підтвердження».
- Живі вибори соло-гравця: кілька правильних, текст, число, «Хто я?» (поле відповіді), впорядкування, пари (зокрема неповні), повзунок, точка, «100 до 1», «хмара» (надруковані слова), стіна (виділені плитки), ланцюжок (надруковане слово), блеф на етапі вигадок (надрукована вигадка), випробування «Вибування». Сортування не має чернетки: картку й нахил пульт уже бачить (11d), тепер — лише з «наживо».
- Миттєвий бліц чернеток не має (як і в командах зараз): там відповідають дотиком.
- «Хто я?» у власному темпі (12c) ще не існує. Рядок «скільки підказок відкрито» додасть план 12c зі стану гри; 12b його не робить.

*Чернетка на сервері*
- Ключ чернетки — id рядка «Відповідей наживо» (`LiveRow.id`): у соло-грі — гравець; у командній грі на запитанні з балами — команда (автор — той, хто зараз відповідає за неї, як і зараз); в опитуванні й хмарі командної гри — людина (вони йдуть лише пульту, товаришам ні).
- `Draft` тримає `draft: DraftValue | null`, `changes`, `at`, `teammates`. Очищене поле (null) — теж зміна: запис лишається з `draft: null`, щоб лічильник змін не губився; пульт і товариші такий запис не бачать.
- `changes` — скільки разів значення змінилося після першого на цьому запитанні (перше значення — 0, далі +1 на кожне інше, разом з очищенням). Коли чернетка застаріває (інше запитання, змінився відбиток відповіді, автор більше не діє за команду), лічильник починається з нуля.
- «Думає N с» рахує пульт від `at` (час сервера) з поправкою `offsetMs`, раз на секунду, поки є видимі чернетки.
- **Частота.** Сервер зберігає кожну нову чернетку (останню не можна губити, тест 10j «quick drafts are all kept» лишається). Захист від зливи — вікно на людину: понад `DRAFTS_PER_SECOND = 8` подій `player:draft` за 1000 мс → `too_soon`. Чесний телефон шле до 4 на секунду. На `too_soon` `useDraftSender` ставить останнє значення в чергу знову. Пульту сервер шле пакети `host:drafts` не частіше ніж раз на `HOST_DRAFTS_MS = 300` мс.
- **Розмір.** Текст чернетки (`text`, `clues`) — до `DRAFT_TEXT_MAX = 100` символів; телефон обрізає сам (`clipDraft`), сервер відкидає довше (`invalid_payload`). Слова хмари, рядки «100 до 1», слово ланцюжка й вигадка мають свої межі з `LIMITS`. Товариш капітана, що надрукував понад 100 символів, бачить перші 100 — свідома межа.
- **Скидання.** Чернетка не діє з новим запитанням, після подання (відбиток `answerStamp` тепер бачить і поступ ланцюжка, стіни й вигадку та вибір блефу), після вилучення гравця (запис стирається) і коли автор більше не діє за команду. Пакет для пульта (`liveDrafts`) бере лише ключі, що є серед рядків `hostLive(state)` (і `aside`), тож чернетка того, кому зараз не відповідати (не вибрав клітинку, вибув, не учасник «Мільйонера»), не йде нікуди.
- **Автопілот.** Соло-чернетка й чернетка людини в опитуванні чи хмарі → `not_allowed`. Чернетка капітана командної гри приймається, як і зараз: її бачать товариші (пульта немає).

*Шлях до пульта*
- Прапорець «наживо» — у даних сокета пульта (`socket.data.watch`), типово `false`. Веб завжди оголошує свій вибір подією `host:live-watch { on }` одразу після першого зрізу після (пере)підключення і при кожній зміні перемикача. Так пульт із вимкненим «наживо» не отримує жодного пакета навіть на мить.
- `host:live-watch` дозволено лише ролі `host` (`forbidden` іншим). `on: true` одразу шле цьому сокету свіжий пакет і нахили, що діють (`liveTilts`).
- Пакет `HostDrafts` — повний знімок усіх чинних чернеток (`{ questionIndex, trial, drafts }`), а не різниця: зниклі чернетки просто відсутні. Пакет іде пультам з «наживо» після кожної події `draft` і після кожної події `changed` (стан змінився — чернетка могла застаріти), не частіше ніж раз на `HOST_DRAFTS_MS` (перший — одразу, далі — у кінці вікна з найсвіжішим знімком).
- На подію `draft` пульт більше не отримує весь зріз (`state`): лише пакет. Товариші капітана отримують зріз, як і зараз.
- Нахил сортування (11d) пульт отримує лише з «наживо» (у `seesTilt` пульт без прапорця — `false`).
- Веб скидає пакет з новим `questionIndex`, при розриві й коли перемикач вимкнено.

*Вигляд на пульті*
- Перемикач — `button.btn.btn-small.live-toggle` з `aria-pressed`, `aria-label` «Наживо» і вмістом «👁» + `span.live-toggle-label` « Наживо». Стоїть у `header.bar` між назвою й «↶ Бали», коли `phase` не `lobby` і не `finished`. Шапка лишається в один рядок на 375 px (e2e `HEADER_ONE_LINE`); якщо не вміщається, під 400 px ховається лише `span.live-toggle-label` (ім'я кнопки для читачів екрана не змінюється).
- Вимкнено: `section#live-answers` з `h2` «Відповіді наживо» (і ⓘ), `p.meta.live-count` «Відповіли N з M» і, для бліцу з кнопкою, черга з кнопками оцінки. Чипи «Чекаємо», рядки, `aside` — ні. Решта логіки пульта (`liveHides`) не змінюється.
- Рядок із чернеткою (гравець ще не подав): `span.live-draft` → `<em>` з текстом (`draftText`) + `span.tag` «ще не надіслав» (у рядку команди — «ще не надіслали»), далі `span.meta.live-changes` «змінював 2 рази» (лише коли `changes ≥ 1`) і `span.meta.live-thinking` «думає 12 с». Для точки — `div.live-pin` з `PinBoard` (міні-мапа, як у `TeamWatch`).
- Рядок із чернеткою видно навіть без відповіді й поступу (як зараз рядок із `draft`).

*Чого не робимо*
- підтвердження одиночного вибору в соло-грі (видима зміна телефона);
- чернеток у миттєвому бліці, на вибір варіанта блефу, на «Забрати / Далі», ставки, двері, дуелі;
- рядка «Хто я?» у власному темпі (12c);
- «наживо» для сцени чи автора автопілота;
- збереження чернеток через перезапуск;
- зміни правил балів чи стану гри; нового демо-вмісту (тексти e2e — без тем росії й СРСР).

## Глобальні обмеження

- **Анти-ціль:** «живі вибори до «Надіслати» … потрапляють на сцену або телефон». Перевіряють задача 3 (сокети: ні сцена, ні гравці не отримують `host:drafts` і тексту) і задача 8 (кадри сокетів сцени й двох телефонів).
- **Анти-ціль:** живі ігри не обриваються деплоєм — стан гри без змін, `GAME_STATE_VERSION` 15, `SavedRoom` без змін (задача 2 перевіряє, що знімок кімнати не містить чернеток).
- **Гра без ведучого:** соло-чернетки відкидаються (`not_allowed`, задача 2), телефон їх не шле (задача 5).
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`, тексти довідки — лише в `apps/web/src/help/*.ts`.
- Сцена 1280 × 720 без прокрутки. Телефон і пульт 375 px без горизонтальної прокрутки сторінки; шапка пульта в один рядок.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і тести:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=1 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- Наскрізні тести: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 12b"`.
  - Повний прогін триває понад пів години, і машині може забракнути пам'яті. Задача 8 запускає свій сценарій, а повний прогін — один раз у фоні наприкінці.
  - Затримка 11b в e2e увімкнена. Кнопки пульта чекають, доки стануть активними, без снів.
  - Кадри лежать в `apps/server/e2e/artifacts/shots`, префікс — `p12b-`.
- Новий вміст (тексти e2e, приклади в довідці) — без тем росії й СРСР.
- Кожен коміт закінчується рядками:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  ```
- Після останньої задачі й фінальної рецензії гілку зливають у `main`. Версія стану не змінюється, тож живі ігри деплой переживають (чернетки, як і завжди, стираються перезапуском).

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/drafts.ts` (новий), `drafts.test.ts` (новий), `index.ts`, `events.ts` | значення чернеток, межі, події `host:live-watch` і `host:drafts` | 1 |
| `apps/server/src/rooms/manager.ts`, `rooms/manager.drafts.test.ts` (новий), `rooms/manager.test.ts` | соло-чернетки, нові види, лічильник, частота, автопілот, `liveDrafts`, без `withLiveDrafts` | 2 |
| `apps/server/src/socket.ts`, `socket.test.ts` | `host:live-watch`, пакети `host:drafts`, нахил лише з «наживо» | 3 |
| `apps/web/src/help/settings.ts`, `help/host-help.test.ts` | довідка «Відповіді наживо» | 4 |
| `apps/web/src/screens/AnswerInput.tsx`, `TeamWatch.tsx` (`useDraftSender`), `PlayerScreen.tsx`, `MatchView.tsx`, `CloudInput.tsx`, `WallInput.tsx`, `ChainView.tsx`, `BluffLieInput.tsx`, `SurvivalTrial.tsx` і їхні тести | телефон шле живі вибори | 5 |
| `packages/shared/src/views.ts`, `packages/engine/src/live.ts`, `live.test.ts`; `apps/web/src/storage.ts`, `live/useLiveWatch.ts` (новий), `live/useGame.ts`, `live/useGame.test.tsx`, `pages/Host.tsx`, `pages/Host.test.tsx` (якщо є), фікстури вебу з `LiveRow` | прапорець на пристрої, прийом пакетів, без `LiveRow.draft` | 6 |
| `apps/web/src/live-drafts.ts` (новий), `live-drafts.test.ts` (новий), `screens/LiveAnswers.tsx`, `LiveAnswers.test.tsx`, `screens/HostScreen.tsx`, `HostScreen.test.tsx`, `i18n.ts`, `styles.css` | перемикач, згорнута панель, рядки чернеток, міні-мапа | 7 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 12b; позначка чернетки в сценарії 11c | 8 |

## Порядок збирання

- 1 → 2 → 3; 4 — після 1 (незалежна); 5 — після 1; 6 — після 3; 7 — після 4 і 6; 8 — останньою.
- **Навмисні зміни наявних очікувань** (лише такі):
  - `apps/server/src/rooms/manager.test.ts` (задача 2):
    - подія `{ type: 'draft', teamId, by }` → `{ type: 'draft', id, by, teammates: true }`;
    - перевірки `host.live?.rows…draft` (тести «the captain draft lives in room memory…», «the host sees a team draft until the team answers…») переходять на `manager.liveDrafts(room)`;
    - «a draft clears with null, and is wrong outside a question or in a solo game»: соло-чернетка тепер `{ ok: true }` (назву тесту змінити на «…and is wrong outside a question»);
    - «no drafts on a poll or a word cloud»: чернетка людини в опитуванні тепер `{ ok: true }`, товариші її не бачать, `liveDrafts` має її під id людини (назву змінити на «a poll draft is personal: the host sees it under the person, teammates never do»).
  - `apps/server/src/socket.test.ts` (задача 3): тест «the captain draft reaches the teammates and the host…» — пульт отримує пакет `host:drafts` після `host:live-watch { on: true }`, а не зріз з `row.draft`; лічильник станів пульта на подію `draft` не росте.
  - `apps/web/src/screens/AnswerInput.test.tsx`, `PlayerScreen.test.tsx`, `SurvivalTrial`-тести (задача 5): там, де командна чернетка чекала вибору з підтвердженням, у рендер додається `confirm`.
  - `packages/engine/src/live.test.ts` (задача 6): з очікувань `toMatchObject` прибирається `draft: null` (рядки 117 і 343).
  - фікстури вебу з `LiveRow` (`LiveAnswers.test.tsx`, `HostScreen.test.tsx` та ін., задача 6): поле `draft` прибирається; тести, що показували командну чернетку через `row.draft`, переходять на проп `drafts` у задачі 7.
  - `apps/web/src/screens/LiveAnswers.test.tsx` (задача 7): позначка «чернетка» → «ще не надіслали» / «ще не надіслав».
  - `apps/server/e2e/full-game.e2e.ts` (задача 8): у сценарії «part 11c: team live answers…» `getByText('чернетка', exact)` → `getByText('ще не надіслали', exact)`.
  - Якщо падає інше, рецензент розбирає причину, а не правку очікування.

## На що дивитися рецензентові

1. **Таємність.** Пакет `host:drafts` іде лише сокетам ролі `host` з `watch === true`. Сцена, гравці й автор автопілота — ніколи. Зрізи `state` сцени й гравців чернеток не містять (крім командної `team.draft` товаришам, як у 10j). Тести задач 2, 3, кадри задачі 8.
2. **Стан без змін.** `GameState`, `SavedRoom`, `GAME_STATE_VERSION`, рекордер і база не змінюються. `manager.snapshot(room)` не містить тексту чернеток (задача 2).
3. **Частота й розмір.** Клієнт ≤ 1 / 250 мс, сервер `too_soon` понад 8 / с, пакети пульту ≤ 1 / 300 мс; текст ≤ 100 символів (задачі 1, 2, 3, 5).
4. **Скидання.** Нове запитання, подання (і хід ланцюжка, стіни, блефу), вилучення, зміна автора команди, ключ поза рядками `hostLive` (задача 2).
5. **Без видимих змін на телефоні.** Одиночний вибір у соло-грі — як був, одним дотиком; підтвердження лише з `confirm` (задача 5, кадр `p12b-phone-draft`).
6. **Вигляд.** Шапка пульта з «👁 Наживо» і «↶ Бали» в один рядок на 375 px; згорнута панель; курсивні рядки з «змінював N разів» і «думає N с»; міні-мапа. Кадри `p12b-*`.

---

### Задача 1. Shared: значення чернеток, межі, події `host:live-watch` і `host:drafts`

**Files:**
- Create: `packages/shared/src/drafts.ts`, `packages/shared/src/drafts.test.ts`
- Modify: `packages/shared/src/index.ts` (`export * from './drafts';`), `packages/shared/src/events.ts`
- Test: `packages/shared/src/drafts.test.ts`

**Interfaces:**
- `packages/shared/src/drafts.ts`:
  ```ts
  import { z } from 'zod';
  import { answerSchema, type SubmittedAnswer } from './answer';
  import { LIMITS, type Question } from './quiz';
  import { UNSTORABLE, isStorable } from './text';

  /** Найдовший текст живого вибору (12b): телефон обрізає сам, сервер відкидає довше. */
  export const DRAFT_TEXT_MAX = 100;
  /** Скільки подій player:draft одна людина може надіслати за 1000 мс (12b); понад — too_soon. Чесний телефон шле до 4. */
  export const DRAFTS_PER_SECOND = 8;
  /** Пакети живих виборів пульту — не частіше ніж раз на стільки мс (12b). */
  export const HOST_DRAFTS_MS = 300;

  const storable = (max: number) => z.string().max(max).refine(isStorable, UNSTORABLE);

  /** Живий вибір до «Надіслати» (12b): поле відповіді, виділені плитки стіни, надруковане слово ланцюжка, вигадка блефу. */
  export const draftValueSchema = z
    .union([
      answerSchema,
      z.object({ type: z.literal('wallPick'), tiles: z.array(z.number().int().min(0).max(15)).max(4) }),
      z.object({ type: z.literal('chainWord'), word: storable(LIMITS.chainWord) }),
      z.object({ type: z.literal('lie'), text: storable(LIMITS.bluffLie) }),
    ])
    .refine((value) => !((value.type === 'text' || value.type === 'clues') && value.value.length > DRAFT_TEXT_MAX), 'draft_too_long');
  export type DraftValue = z.infer<typeof draftValueSchema>;

  /** Тип запитання, до якого належить чернетка (wallPick → wall, chainWord → chain, lie → bluff; решта — як відповідь). */
  export function draftQuestionType(draft: DraftValue): Question['type'];
  /** Чернетка — звичайна відповідь поля (її бачать і товариші капітана, 10j). */
  export function isAnswerDraft(draft: DraftValue): draft is SubmittedAnswer;
  /** Телефон: обрізати text / clues до DRAFT_TEXT_MAX; решта без змін. */
  export function clipDraft(draft: DraftValue): DraftValue;

  /** Живий вибір у пакеті для пульта (12b). */
  export interface LiveDraft {
    /** Id рядка «Відповідей наживо» (LiveRow.id): гравець, команда чи людина в опитуванні командної гри. */
    id: string;
    draft: DraftValue;
    /** Скільки разів значення змінилося після першого на цьому запитанні. */
    changes: number;
    /** Мить останньої зміни за часом сервера. */
    at: number;
  }

  /** Пакет host:drafts (12b): усі чинні живі вибори поточного запитання (або питання на виживання, trial). */
  export interface HostDrafts {
    questionIndex: number;
    trial: boolean;
    drafts: LiveDraft[];
  }
  ```
  Для 13 видів відповіді (`single`, `multi`, `boolean`, `text`, `numeric`, `slider`, `clues`, `pin`, `poll`, `wordcloud`, `survey`, `order`, `match`) тип запитання збігається з типом відповіді (звірити з `Question['type']` у `quiz.ts`).
- `packages/shared/src/events.ts`:
  - `draftSchema = z.object({ draft: draftValueSchema.nullable() })` (коментар: «Чернетка: поточний стан вводу до «Надіслати» (10j капітан, 12b будь-хто); null — поле порожнє.»);
  - `export const liveWatchSchema = z.object({ on: z.boolean() });`;
  - у `ClientToServerEvents` коментар `'player:draft'` → «Живий вибір до «Надіслати»: товаришам капітана (10j) і пульту з «наживо» (12b).»; після `'host:undo'`:
    ```ts
      /** Пульт: увімкнути чи вимкнути живі вибори (12b); лише роль host. */
      'host:live-watch': (payload: z.infer<typeof liveWatchSchema>, ack: Ack) => void;
    ```
  - у `ServerToClientEvents` після `'sort:tilt'`:
    ```ts
      /** Живі вибори до «Надіслати» (12b): лише пультам з увімкненим «наживо», не частіше ніж раз на HOST_DRAFTS_MS. */
      'host:drafts': (batch: HostDrafts) => void;
    ```

- [ ] **Step 1: Write the failing tests** (`drafts.test.ts`):
  ```ts
  import { describe, expect, it } from 'vitest';
  import { draftSchema, liveWatchSchema } from './events';
  import { DRAFT_TEXT_MAX, DRAFTS_PER_SECOND, HOST_DRAFTS_MS, clipDraft, draftQuestionType, draftValueSchema, isAnswerDraft } from './drafts';

  describe('live drafts', () => {
    it('takes every answer of the phone plus wall tiles, a chain word and a lie', () => {
      for (const draft of [
        { type: 'single', optionId: 'a' }, { type: 'multi', optionIds: ['a', 'c'] }, { type: 'text', value: 'Оса' },
        { type: 'numeric', value: 7 }, { type: 'slider', value: 3.5 }, { type: 'pin', x: 0.2, y: 0.9 },
        { type: 'order', itemIds: ['b', 'a'] }, { type: 'match', links: [{ left: 'l1', right: 'r2' }] },
        { type: 'survey', values: ['Чай'] }, { type: 'wordcloud', words: ['море'] },
        { type: 'wallPick', tiles: [0, 5] }, { type: 'chainWord', word: 'ліс' }, { type: 'lie', text: 'Вигадка' },
      ]) expect(draftValueSchema.safeParse(draft).data).toEqual(draft);
    });

    it('refuses long text, too many tiles, unknown kinds', () => {
      for (const draft of [
        { type: 'text', value: 'я'.repeat(DRAFT_TEXT_MAX + 1) }, { type: 'clues', value: 'я'.repeat(DRAFT_TEXT_MAX + 1) },
        { type: 'wallPick', tiles: [0, 1, 2, 3, 4] }, { type: 'wallPick', tiles: [16] }, { type: 'chainWord', word: 'я'.repeat(31) },
        { type: 'magic' }, null,
      ]) expect(draftValueSchema.safeParse(draft).success).toBe(false);
      expect(draftSchema.safeParse({ draft: null }).success).toBe(true);
    });

    it('names the question type, tells plain answers and clips text', () => {
      expect(draftQuestionType({ type: 'wallPick', tiles: [] })).toBe('wall');
      expect(draftQuestionType({ type: 'chainWord', word: 'ліс' })).toBe('chain');
      expect(draftQuestionType({ type: 'lie', text: 'x' })).toBe('bluff');
      expect(draftQuestionType({ type: 'boolean', value: true })).toBe('boolean');
      expect(isAnswerDraft({ type: 'text', value: 'x' })).toBe(true);
      expect(isAnswerDraft({ type: 'lie', text: 'x' })).toBe(false);
      expect(clipDraft({ type: 'text', value: 'я'.repeat(150) })).toEqual({ type: 'text', value: 'я'.repeat(DRAFT_TEXT_MAX) });
      expect(clipDraft({ type: 'lie', text: 'abc' })).toEqual({ type: 'lie', text: 'abc' });
    });

    it('limits and the watch payload', () => {
      expect([DRAFTS_PER_SECOND, HOST_DRAFTS_MS, DRAFT_TEXT_MAX]).toEqual([8, 300, 100]);
      expect(liveWatchSchema.safeParse({ on: false }).success).toBe(true);
      expect(liveWatchSchema.safeParse({ on: 'yes' }).success).toBe(false);
    });
  });
  ```
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared/src/drafts.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `draftSchema` тепер ширший: сервер (`manager.draft`) поки приймає `Answer | null` — тип параметра `draft()` змінити на `DraftValue | null` уже тут, а `type_mismatch` рахувати через `draftQuestionType(draft)` замість `draft.type`, щоб пройшов `pnpm typecheck`. Командна чернетка для товаришів (`PlayerView.team.draft: Answer | null`) — у `currentDraft` повертати лише `isAnswerDraft`. Більше на сервері нічого не змінювати.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=1 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src apps/server/src/rooms/manager.ts
  git commit -m "feat(shared): live draft values for every input before «Надіслати» — the phone answer, wall tiles, a chain word and a bluff lie — with a 100-character text cap, 8 drafts a second, 300 ms host batches, and the host:live-watch and host:drafts events

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 2. Сервер, менеджер кімнат: соло-чернетки, лічильник змін, частота, автопілот, пакет для пульта

**Files:**
- Create: `apps/server/src/rooms/manager.drafts.test.ts`
- Modify: `apps/server/src/rooms/manager.ts`
- Test: `apps/server/src/rooms/manager.drafts.test.ts`, `apps/server/src/rooms/manager.test.ts` (навмисні правки — див. «Порядок збирання»)

**Interfaces:**
- `Room` (поруч із `drafts`):
  ```ts
  /**
   * Чернетки (10j, 12b): id рядка «Відповідей наживо» (гравець, команда, людина в опитуванні командної гри) → живий вибір.
   * Лише в пам'яті: не в стані гри, не в збереженій кімнаті; після перезапуску порожньо. Товаришам — лише teammates,
   * пульту — лише через liveDrafts і лише з «наживо» (socket.ts).
   */
  drafts: Map<string, Draft>;
  /** Вікно частоти player:draft (12b): людина → початок вікна й кількість подій у ньому. Лише в пам'яті. */
  draftRate: Map<string, { from: number; count: number }>;
  ```
  Обидва місця створення `Room` (`create`, `createAutopilot` — рядки з `drafts: new Map()`) отримують `draftRate: new Map()`. `snapshot` і `restore` не змінюються.
- `Draft`:
  ```ts
  export interface Draft {
    questionIndex: number;
    trial: boolean;
    /** Автор — людина, що шле. Команда: лише поки вона й далі відповідає за команду; їй самій чернетка не показується. */
    by: string;
    /** Мить останньої зміни (час менеджера). */
    at: number;
    stamp: string;
    /** null — поле очищене (зміна теж рахується); нікому не показується. */
    draft: DraftValue | null;
    /** Скільки разів значення змінилося після першого (12b). */
    changes: number;
    /** Командна чернетка на запитанні з балами: її бачать товариші (10j). Соло й опитування командної гри — false. */
    teammates: boolean;
  }
  ```
- `RoomEvent`: `| { type: 'draft'; id: string; by: string; teammates: boolean }` (коментар: «Чернетка змінилася: стан гри той самий; товаришам (teammates) — свіжий зріз, пульту — пакет host:drafts (socket.ts).»).
- `DraftStage` отримує `unscored: boolean`; `draftStage` більше не повертає `null` для опитування й хмари (`unscored: isUnscored(play.question)`, `act: 'answer'`, `question: () => play.question` для них).
- `answerStamp(state, id)` дописує до масиву: `play?.question.type === 'chain' ? chainOf(state, id) : null`, `play?.question.type === 'wall' ? wallOf(state, id) : null`, `play?.bluff?.lies[id] ?? null`, `play?.bluff?.picks[id] ?? null` (через `Object.hasOwn`, як у `live.ts`).
- `draft(room, playerId, draft: DraftValue | null): AckResult`:
  1. `!alive` → `game_not_found`; `at = draftStage(state)`, `null` → `wrong_phase`.
  2. Ключ:
     - командна гра й `!at.unscored` → `this.act(room, playerId, at.act)` (відмови як зараз), `id = who.id`, `teammates = true`;
     - командна гра й `at.unscored` → людина має бути учасником (`memberOf`), інакше `not_found`; `id = playerId`, `teammates = false`;
     - соло → гравець має бути в `state.players`, інакше `not_found`; `id = playerId`, `teammates = false`.
  3. `state.autopilot !== undefined && !teammates` → `not_allowed`.
  4. `draft !== null`: `draftQuestionType(draft) !== at.question(id).type` → `type_mismatch` (для людини в опитуванні — `play.question`); `draft.type === 'lie'` поза `bluff.stage === 'lies'` → `wrong_phase`.
  5. Частота (`draftRate` за `playerId`): `now − from ≥ 1000` → нове вікно `{ from: now, count: 1 }`; інакше `count + 1 > DRAFTS_PER_SECOND` → `too_soon` (запис не змінюється), інакше `count += 1`. Рахуються й незмінні чернетки.
  6. `live = this.liveDraft(room, id)` (чинний запис або `null`).
     - `draft === null`: `live === null || live.draft === null` → `{ ok: true }` без події; інакше записати `{ ...live, draft: null, at: now, changes: live.changes + 1 }`.
     - `live !== null && live.by === playerId && JSON.stringify(live.draft) === JSON.stringify(draft)` → `{ ok: true }` без події.
     - інакше записати `{ questionIndex, trial: at.trial, by: playerId, at: now, stamp: answerStamp(state, id), draft, changes: live === null ? 0 : live.changes + 1, teammates }`.
  7. `this.emit(room, { type: 'draft', id, by: playerId, teammates })`.
- `liveDraft(room, id)`: як зараз (запитання, `trial`, відбиток), але перевірка автора: `teammates` → `actorOf(…, at.act)` дає `id`; інакше `found.by === id` і людина досі в грі (`state.players` у соло, `memberOf` у командах).
- `currentDraft(room, teamId, viewerId)`: `found === null || !found.teammates || found.by === viewerId || found.draft === null || !isAnswerDraft(found.draft)` → `null`; інакше `found.draft`.
- Новий публічний метод:
  ```ts
  /** Пакет живих виборів для пульта (12b): чинні чернетки з draft !== null, лише для рядків hostLive (і aside), у порядку рядків. */
  liveDrafts(room: Room): HostDrafts;
  ```
  `questionIndex: room.state.questionIndex`, `trial: draftStage(state)?.trial ?? false`; `hostLive(state) === null` або `draftStage(state) === null` → `drafts: []`.
- `view()`: `identity.role === 'host'` → `hostView(room.state)` без змін; `withLiveDrafts` прибрати.
- Вилучення (`kick`, цикл після `removed`, рядок ~1047): стирати й записи `drafts`, чий ключ — не гравець і не людина, що лишилася (`!players.some(id) && !memberOf(state, id)`), і `draftRate` вилученої людини.

- [ ] **Step 1: Write the failing tests** (`manager.drafts.test.ts`; `setup`, `enter`, `playing` скопіювати з `manager.test.ts`, вікторина — `makeQuiz([multi, text, single])`; командні випадки — через `teamRoom`/`teamPlaying`, скопійовані звідти ж або винесені в `apps/server/src/testing/team-room.ts`, якщо так простіше):
  ```ts
  describe('solo live drafts (12b)', () => {
    it('a solo player drafts; the host batch has it with changes and time, nobody else sees it, the saved room neither', () => {
      const { scheduler, manager, room, events, olena, taras } = playing(); // перше запитання — multi
      const before = room.state;
      events.length = 0;
      expect(manager.draft(room, olena.playerId, { type: 'multi', optionIds: ['a'] })).toEqual({ ok: true });
      expect(events).toEqual([{ type: 'draft', id: olena.playerId, by: olena.playerId, teammates: false }]);
      expect(room.state).toBe(before);
      scheduler.advance(300);
      expect(manager.draft(room, olena.playerId, { type: 'multi', optionIds: ['a', 'c'] })).toEqual({ ok: true });
      scheduler.advance(300);
      expect(manager.draft(room, olena.playerId, null)).toEqual({ ok: true });
      scheduler.advance(300);
      expect(manager.draft(room, olena.playerId, { type: 'multi', optionIds: ['c'] })).toEqual({ ok: true });
      const at = manager.now();
      expect(manager.liveDrafts(room)).toEqual({ questionIndex: 0, trial: false, drafts: [{ id: olena.playerId, draft: { type: 'multi', optionIds: ['c'] }, changes: 3, at }] });
      for (const who of [olena.identity, taras.identity, STAGE, HOST]) expect(JSON.stringify(manager.view(room, who))).not.toContain('"optionIds":["c"]');
      expect(JSON.stringify(manager.snapshot(room))).not.toContain('"optionIds":["c"]');
    });
  });
  ```
  Решта тестів у тому самому `describe` (кожен — окремий `it`):
  - **подання скидає:** чернетка Олени (`multi`) → `manager.answer(room, olena.playerId, …)` → `liveDrafts(room).drafts` → `[]` (відбиток змінився). Ще одна чернетка після подання записується з `changes: 0` (лічильник почався наново); пульт її не покаже, бо рядок уже `answered` (це перевіряє веб у задачі 7).
  - **нове запитання скидає:** чернетка на запитанні 0 → обидва відповідають → `next` до запитання 1 → `liveDrafts(room).drafts` → `[]`, `questionIndex: 1`.
  - **тип:** `{ type: 'text', value: 'x' }` на `multi` → `type_mismatch`; `{ type: 'magic' }` сюди не доходить (схема — задача 3).
  - **частота:** дев'ять чернеток за 0 мс (різні значення) → перші вісім `{ ok: true }`, дев'ята `{ ok: false, error: 'too_soon' }`; `scheduler.advance(1000)` → знову `{ ok: true }`; незмінна чернетка теж рахується.
  - **межі етапу:** лобі (`setup()` + `enter`) → `wrong_phase`; `lock` → `wrong_phase`; розкриття → `wrong_phase`.
  - **хто не відповідає — не в пакеті:** вікторина з полем (`boardRound` з `makeRoundsQuiz`, як у `manager.test.ts`): чернетка гравця, який не вибирав клітинку, приймається (`ok`), але `liveDrafts(room).drafts` → `[]`; чернетка того, хто вибрав, — є.
  - **вилучення:** чернетка Олени → `host kick` Олени → `room.drafts.has(olena.playerId)` → `false`, `liveDrafts` → `[]`.
  - **ланцюжок, стіна, блеф:** вікторина `makeQuiz([chain])` → `{ type: 'chainWord', word: 'лі' }` → у пакеті; `manager.guess(...)` правильного слова → чернетка застаріла (`drafts: []`). Так само `makeQuiz([wall])` з `{ type: 'wallPick', tiles: [0, 1] }` і хибною спробою `manager.wall(...)`; `makeQuiz([bluff])` з `{ type: 'lie', text: 'Вигадка' }` на етапі вигадок, `manager.lie(...)` → застаріла; `lie` на етапі вибору → `wrong_phase`. Фікстури `chain`, `wall`, `bluff` — з `@quiz/engine/testing` (назви перевірити в `packages/engine/src/testing/fixtures.ts`).
  - **автопілот:** `autopilot(makeQuiz([multi]))` за зразком `manager.autopilot.test.ts` → автор запускає й відкриває запитання → `manager.draft(room, authorId, { type: 'multi', optionIds: ['a'] })` → `not_allowed`; `liveDrafts(room).drafts` → `[]`.
  - **командна гра:** чернетка капітана → подія `{ type: 'draft', id: red, by: olena.playerId, teammates: true }`; `liveDrafts(room).drafts[0]` → `{ id: red, draft, changes: 0 }`; товариш бачить `team.draft` (як зараз); капітанова `{ type: 'wallPick', … }` на стіні товаришеві не показується (`team.draft` → `null`), а в пакеті є.
  - **опитування командної гри:** `teamPlaying([classicRound('r1', [poll])])` → `manager.draft(room, taras.playerId, { type: 'poll', optionId: 'a' })` → `ok`, подія з `id: taras.playerId, teammates: false`; `liveDrafts(room).drafts` → `[{ id: taras.playerId, … }]`; жоден зріз товаришів не містить `"optionId":"a"` поза запитанням (порівняти `team.draft` → `null`).
  - **стан і версія:** `GAME_STATE_VERSION` з `@quiz/engine` → `15` (страховка від випадкового підняття).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/rooms/manager.drafts.test.ts apps/server/src/rooms/manager.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Навмисні правки `manager.test.ts` — лише ті, що названі в «Порядок збирання». `socket.ts` поки лише перейменовує поля події `draft` (`event.teamId` → `event.id`, фільтр товаришів — `event.teammates && teamOf(...) === event.id`), щоб пройшов typecheck; пульт на подію `draft` поки й далі отримує зріз (задача 3 це змінить).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=1 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/src
  git commit -m "feat(server): solo players, people in a team poll and every input kind keep a live draft in room memory with a change count and time, capped at 8 a second and refused in a game with no host; the host batch holds only drafts of rows that answer now and drops them on a new question, a submission, a chain, wall or bluff move and a kick

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 3. Сервер, сокети: `host:live-watch`, пакети `host:drafts`, нахил лише з «наживо»

**Files:**
- Modify: `apps/server/src/socket.ts`
- Test: `apps/server/src/socket.test.ts`

**Interfaces:**
- `SocketData` + `/** Пульт: увімкнено «наживо» (12b); типово false — веб оголошує свій вибір одразу після підключення. */ watch: boolean;` — у `io.on('connection')` перед `push(socket)`: `socket.data.watch = false`.
- `SocketOptions` + `/** Найкоротша пауза між пакетами host:drafts (12b); типово HOST_DRAFTS_MS. */ draftsGapMs?: number;`.
- Пакети (усередині `attachSockets`):
  ```ts
  /** Пакети живих виборів (12b) за кімнатою: мить останнього й таймер наступного. */
  const batches = new Map<Room, { last: number; timer: ReturnType<typeof setTimeout> | null }>();
  const watchers = (room: Room) => [...io.sockets.sockets.values()].filter((s) => s.data.room === room && s.data.identity.role === 'host' && s.data.watch);
  /** Перший пакет — одразу, далі — не частіше ніж раз на gap: у кінці вікна з найсвіжішим знімком. */
  const scheduleDrafts = (room: Room) => { … };
  const flushDrafts = (room: Room) => { const batch = manager.liveDrafts(room); for (const s of watchers(room)) s.emit('host:drafts', batch); };
  ```
  - `scheduleDrafts`: немає пультів із «наживо» → нічого; таймер уже стоїть → нічого; `Date.now() − last ≥ gap` → `flushDrafts` зараз; інакше таймер на залишок. Таймер у кінці знову перевіряє `watchers`.
  - Події `closed` і `moved` (і `manager.get(room.code) !== room`) прибирають запис `batches` і таймер.
- `manager.onEvent`:
  - `changed`: `members.forEach(push)`, потім `scheduleDrafts(room)`;
  - `draft`: зріз — лише товаришам (`role === 'player' && event.teammates && playerId !== event.by && teamOf(room.state, playerId) === event.id`); пульту — `scheduleDrafts(room)`, без `push`.
- `seesTilt`: `role === 'host'` → лише з `socket.data.watch`; і для `audience: 'all'` теж.
- Обробник:
  ```ts
  on('host:live-watch', (args) => {
    if (!isHost) return FORBIDDEN;
    const payload = liveWatchSchema.safeParse(payloadOf(args));
    if (!payload.success) return INVALID;
    socket.data.watch = payload.data.on;
    if (payload.data.on) {
      socket.emit('host:drafts', manager.liveDrafts(room));
      for (const tilt of manager.liveTilts(room)) if (seesTilt(socket, room, tilt)) socket.emit('sort:tilt', tilt.tilt);
    }
    return { ok: true };
  });
  ```
  На підключенні `liveTilts` уже фільтрує `seesTilt`: пульт без «наживо» нахилів не отримує.

- [ ] **Step 1: Write the failing tests** (`socket.test.ts`):
  ```ts
  /** Збирає пакети живих виборів (12b), що прийшли сокету. */
  function listenDrafts(tracked: Tracked): HostDrafts[] {
    const received: HostDrafts[] = [];
    tracked.socket.on('host:drafts', (batch) => received.push(batch));
    return received;
  }
  ```
  Новий `describe('live drafts (12b)', …)`:
  - **лише пульт із «наживо»:**
    ```ts
    it('a solo draft reaches only a watching host, in a batch; the stage and other phones get nothing', async () => {
      const { host, stage, olena, taras } = await lobby(await startGame(ctx.app, makeQuiz([multi, text])).then((s) => s.game));
      const hostDrafts = listenDrafts(host);
      const others = [stage, taras, olena].map(listenDrafts);
      expect(await send(host, 'host:start')).toEqual({ ok: true });
      expect(await send(host, 'host:next')).toEqual({ ok: true });
      for (const who of [host, stage, olena, taras]) await until(who, inPhase('question'));
      expect(await send(olena, 'player:draft', { draft: { type: 'multi', optionIds: ['a', 'c'] } })).toEqual({ ok: true });
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(hostDrafts).toEqual([]); // ще не ввімкнув «наживо»
      const states = host.states;
      expect(await send(host, 'host:live-watch', { on: true })).toEqual({ ok: true });
      await vi.waitFor(() => expect(hostDrafts.at(-1)?.drafts.map((d) => d.draft)).toEqual([{ type: 'multi', optionIds: ['a', 'c'] }]));
      expect(await send(olena, 'player:draft', { draft: { type: 'multi', optionIds: ['c'] } })).toEqual({ ok: true });
      await vi.waitFor(() => expect(hostDrafts.at(-1)?.drafts[0]).toMatchObject({ draft: { type: 'multi', optionIds: ['c'] }, changes: 1 }));
      expect(host.states).toBe(states); // на чернетку пульт не отримує зрізу
      expect(others.map((list) => list.length)).toEqual([0, 0, 0]);
      for (const who of [stage, taras]) expect(JSON.stringify(who.last)).not.toContain('"optionIds":["c"]');
    });
    ```
  - **вимкнення:** після `host:live-watch { on: false }` нова чернетка Олени → за 500 мс пакетів не додалося.
  - **частота пакетів:** `ctx` з `draftsGapMs: 300` (типове); п'ять чернеток Олени з інтервалом 50 мс (`setTimeout`) → за 400 мс пульт отримав не більше двох пакетів, а останній містить останнє значення.
  - **перевірка й ролі:** `host:live-watch` від `olena` і `stage` → `forbidden`; `{ on: 'yes' }`, `undefined` → `invalid_payload`; `player:draft` з `{ type: 'text', value: 'я'.repeat(101) }` → `invalid_payload`.
  - **подання знімає чернетку з пакета:** пульт дивиться; Олена шле чернетку тексту, потім `player:answer` → наступний пакет без Олени (пакет після `changed`).
  - **нахил:** у наявному тесті сортування з нахилом пульту (`listenTilt(host)`) додати `await send(host, 'host:live-watch', { on: true })` перед першим нахилом; новий тест: без «наживо» пульт нахилів не отримує, а з увімкненням одразу отримує нахил, що діє.
  - Навмисна правка «the captain draft reaches the teammates and the host…» — див. «Порядок збирання»: замість `until(host, …row.draft…)` — `listenDrafts(host)` після `host:live-watch { on: true }`, очікуваний пакет з `{ id: red, draft: { type: 'text', value: 'Чернетка-Львів' } }`; `counts()` доповнити `host.states`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/socket.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Імпорт `HOST_DRAFTS_MS`, `liveWatchSchema`, `HostDrafts` з `@quiz/shared`. Таймери пакетів — справжній `setTimeout` (як і решта сокетного шару), а не `Scheduler` менеджера.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=1 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/src
  git commit -m "feat(server): host:live-watch turns live choices on for one host socket; drafts reach watching hosts only as host:drafts batches at most every 300 ms and after each change of state, never as a full host view, and sort tilts reach the host only while it watches

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 4. Довідка ведучого: «Відповіді наживо» з перемикачем і живими виборами

**Files:**
- Modify: `apps/web/src/help/settings.ts`
- Test: `apps/web/src/help/host-help.test.ts`

**Interfaces:**
- `SETTING_HELP.live`:
  - `what`: «Панель на пульті під запитанням: хто вже відповів і що саме, а з перемикачем «👁 Наживо» — ще й що кожен вибирає, впорядковує чи друкує до «Надіслати». Її бачите лише ви: на сцені й телефонах її немає.»
  - `how` — перед наявними рядками:
    - «Перемикач «👁 Наживо» в шапці пульта вмикає й вимикає живі вибори. Типово увімкнено; вибір запам'ятовує цей пристрій. Вимкнена панель згортається до рядка «Відповіли 5 з 8», і пульт не отримує живих виборів зовсім.»
    - «Поки гравець не надіслав відповідь, його рядок курсивом показує поточний вибір із позначкою «ще не надіслав»: «позначає Кит, Дельфін», «друкує «Осака»», порядок, пари, повзунок, точку на міні-мапі, виділені плитки стіни, слово ланцюжка, вигадку блефу, слова хмари й «100 до 1».»
    - «Поруч — «змінював 3 рази» і «думає 12 с» (від останньої зміни). Після «Надіслати» рядок показує подану відповідь.»
    - «Вибір одного варіанта (і «Так / Ні», опитування) гравець надсилає одним дотиком, тож його видно одразу як відповідь.»
  - наявний рядок про командну гру: «…і, поки відповіді немає, чернетка капітана курсивом.» → «…і, поки відповіді немає, вибір капітана курсивом (лише з увімкненим «наживо»).»
  - `tip` — другий рядок: «Чесність: гравці не знають, що ви бачите їхні вибори до подання. Читати їх уголос чи підказувати за ними — псувати гру.»
  - `limits` (нове поле, якщо його ще немає в записі): «У грі без ведучого живих виборів немає: телефони їх не надсилають.», «Сортування показує картку й нахил (11d), окремої чернетки немає. Миттєвий бліц — лише відповіді.»

- [ ] **Step 1: Write the failing tests** (`host-help.test.ts`):
  ```ts
  it('12b live entry tells the toggle, live choices before «Надіслати», changes and thinking time, and honesty', () => {
    filled('setting.live');
    const body = text('setting.live');
    for (const part of ['👁 Наживо', 'запам', 'Відповіли 5 з 8', 'ще не надіслав', 'змінював 3 рази', 'думає 12 с', 'одним дотиком', 'не знають', 'без ведучого']) expect(body).toContain(part);
    expect(searchHelp('наживо')).toContain('setting.live');
  });
  ```
  Наявні перевірки довідки лишаються зеленими.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/help` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src/help
  git commit -m "feat(web): host help on live answers — the «👁 Наживо» toggle remembered on the device, live choices before «Надіслати» with changes and thinking time, one-tap choices, honesty, and none in a game with no host

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 5. Веб, телефон: живі вибори на кожному типі вводу

**Files:**
- Modify: `apps/web/src/screens/AnswerInput.tsx`, `apps/web/src/screens/TeamWatch.tsx` (`useDraftSender`), `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/screens/MatchView.tsx`, `apps/web/src/screens/CloudInput.tsx`, `apps/web/src/screens/WallInput.tsx`, `apps/web/src/screens/ChainView.tsx`, `apps/web/src/screens/BluffLieInput.tsx`, `apps/web/src/screens/SurvivalTrial.tsx`
- Test: `apps/web/src/screens/AnswerInput.test.tsx`, `apps/web/src/screens/PlayerScreen.test.tsx`, `apps/web/src/screens/TeamWatch.test.tsx`, тести `WallInput`, `ChainView`, `BluffLieInput`, `CloudInput` (наявні файли або нові `*.test.tsx` поруч)

**Interfaces:**
- `AnswerInput`:
  ```ts
  /** Живий вибір (10j, 12b): кожна зміна поля (те саме перетворення, що й надсилання); порожнє поле — null. Вигляду не змінює. */
  onDraft?: (draft: Answer | null) => void;
  /** Командна гра: вибір одного варіанта спершу позначає (чернетка товаришам), потім «Відповісти». Без пропа — одним дотиком. */
  confirm?: boolean;
  ```
  `single` / `boolean`: `ConfirmChoice`, лише коли `confirm` (а не коли є `onDraft`). Решта типів — як зараз, з `onDraft`.
- `MatchInput`: чернетка — вже з'єднані пари (`links` з тих лівих, що мають праву), `null`, коли жодної.
- `CloudInput` + `onDraft?: (draft: Answer | null) => void`: при кожній зміні — `cloudWords(fields, words)`, порожній список → `null`, інакше `{ type: 'wordcloud', words }`.
- `WallInput` + `onDraft?: (draft: DraftValue | null) => void`: при кожній зміні `selected` — `{ type: 'wallPick', tiles: selected }`, порожньо → `null`; після спроби (`check`) — `onDraft(null)` не потрібен (сервер сам бачить зміну відбитка).
- `ChainView` (поле слова) + `onDraft`: `{ type: 'chainWord', word }`, порожньо → `null`.
- `BluffLieInput` + `onDraft`: `{ type: 'lie', text }`, порожньо → `null`.
- `useDraftSender(send, active, key)` (`TeamWatch.tsx`):
  - тип значення — `DraftValue | null` (`DraftSender = ((draft: DraftValue | null) => void) & { cancel: () => void }`);
  - перед відправкою — `clipDraft`;
  - відповідь `{ ok: false, error: 'too_soon' }` → `sent.current = undefined` і те саме значення ще раз через `DRAFT_MS` (якщо за цей час не прийшло нове);
  - решта поведінки без змін.
- `PlayerScreen.tsx` (біля `draftOn`):
  ```ts
  // Живий вибір соло-гравця для пульта (12b): будь-яке поле до «Надіслати», крім миттєвого бліцу; у грі без ведучого — ні.
  const soloDraft =
    team === null && !view.autopilot && !instant &&
    ((phase === 'question' && question !== null) || (phase === 'leaderboard' && me.survival?.canAnswerTrial === true));
  const draftOn = teamDraftOn || soloDraft; // teamDraftOn — нинішній вираз draftOn
  ```
  - `AnswerInput` / `BlitzPlay` / `SurvivalTrial` отримують `onDraft` як і зараз, плюс `confirm={team !== null}`;
  - `WallInput`, `ChainView`, `BluffLieInput` (етап вигадок), `CloudInput` (через `AnswerInput`) отримують `onDraft={draftOn ? sendDraft : undefined}`; для командної гри — так само, коли `team.canAct`;
  - `key` у `useDraftSender` доповнити станом стіни, ланцюжка й блефу (`me.wall?.found.length`, `me.wall?.mistakes`, `me.chain?.solved`, `view.bluff?.stage`), щоб після ходу «вже надіслано» скидалося;
  - `submit` і так скасовує те, що чекає (`sendDraft.cancel()`); те саме — перед `player:guess`, `player:wall`, `player:lie` (передати `cancel` у ці компоненти через `onDraft.cancel` або окремий проп `onSent`).

- [ ] **Step 1: Write the failing tests**
  - `AnswerInput.test.tsx`:
    - соло: `single` з `onDraft` без `confirm` — дотик до «Б» викликає `onSubmit({ type: 'single', optionId: 'b' })` і не викликає `onDraft`; кнопки «Відповісти» немає;
    - `single` з `onDraft` і `confirm` — як зараз (позначає, `onDraft`, потім «Відповісти»);
    - `multi`, `text` (обрізання робить відправник, а не поле), `order`, `slider`, `pin`, `survey`, `wordcloud` з `onDraft` — кожна зміна дає відповідне значення, як у таблиці «Що видно»;
    - `match`: одна з'єднана пара з трьох → `onDraft({ type: 'match', links: [{ left: 'l1', right: 'r1' }] })`.
  - тести `WallInput` / `ChainView` / `BluffLieInput`: дотик до двох плиток → `onDraft({ type: 'wallPick', tiles: [0, 3] })`, зняття обох → `onDraft(null)`; слово «лі» → `{ type: 'chainWord', word: 'лі' }`; вигадка → `{ type: 'lie', text: 'Вигадка' }`.
  - `TeamWatch.test.tsx` (`useDraftSender`, фейковий таймер): текст на 150 символів іде обрізаним до 100; `send` відповідає `too_soon` → через `DRAFT_MS` те саме значення йде вдруге; `cancel()` після `too_soon` — нічого не йде.
  - `PlayerScreen.test.tsx`:
    - соло-гравець на `multi`: дотик до двох варіантів → за `DRAFT_MS` `send('player:draft', { draft: { type: 'multi', optionIds: [...] } })`; «Відповісти» → `player:answer`, і жодного `player:draft` після нього (просунути таймер ще на 500 мс);
    - соло на `single`: дотик → лише `player:answer`, `player:draft` немає;
    - `view.autopilot: true` → на `multi` жодного `player:draft`;
    - миттєвий бліц → жодного `player:draft`;
    - командні тести чернетки капітана лишаються зеленими (з навмисним `confirm`, якщо вони рендерять `AnswerInput` напряму).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens` → FAIL.
- [ ] **Step 3: Implement.** Вигляд телефона не змінюється: ні нових написів, ні кнопок. Перевірити наявні снапшоти/тексти екранів гравця.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): phones send live choices before «Надіслати» on every input — marks, typing, order, pairs so far, slider, pin, survey and cloud words, wall tiles, a chain word and a bluff lie — never after sending, never in a game with no host, with one-tap choices unchanged and confirm-first picks only for a team captain

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 6. Веб, пульт: прапорець на пристрої, `host:live-watch`, прийом пакетів; без `LiveRow.draft`

**Files:**
- Create: `apps/web/src/live/useLiveWatch.ts`, `apps/web/src/live/useLiveWatch.test.tsx`
- Modify: `packages/shared/src/views.ts` (`LiveRow`), `packages/engine/src/live.ts` (`emptyRow`), `apps/web/src/storage.ts`, `apps/web/src/live/useGame.ts`, `apps/web/src/pages/Host.tsx`, `apps/web/src/screens/HostScreen.tsx` (лише нові пропси, без вигляду), `apps/web/src/screens/LiveAnswers.tsx` (тимчасово без чернеток — їх поверне задача 7)
- Test: `packages/engine/src/live.test.ts`, `apps/web/src/live/useGame.test.tsx`, `apps/web/src/live/useLiveWatch.test.tsx`, фікстури вебу з `LiveRow`

**Interfaces:**
- `packages/shared/src/views.ts`: з `LiveRow` прибрати `draft` разом із коментарем. `packages/engine/src/live.ts`: прибрати `draft: null` з `emptyRow`.
- `apps/web/src/storage.ts`:
  ```ts
  const LIVE_WATCH = 'quiz:live-watch';
  /** Перемикач «👁 Наживо» (12b) на цьому пристрої; типово увімкнено. */
  export const loadLiveWatch = (): boolean => read(LIVE_WATCH) !== 'off';
  export const saveLiveWatch = (on: boolean): void => write(LIVE_WATCH, on ? null : 'off');
  ```
- `apps/web/src/live/useLiveWatch.ts`:
  ```ts
  /**
   * Перемикач «наживо» (12b): значення з пристрою; кожна зміна зберігається й іде на сервер (host:live-watch).
   * Після кожного (пере)підключення (status стає 'live') вибір оголошується знову: сервер типово вважає «вимкнено».
   */
  export function useLiveWatch(send: Send, status: Status): [boolean, (on: boolean) => void];
  ```
- `useGame.ts`:
  - `const [drafts, setDrafts] = useState<HostDrafts | null>(null);`
  - `socket.on('host:drafts', (batch) => setDrafts(batch));`
  - скидання: з новим `questionIndex` у `state` (поруч із `tiltsAt`), при `disconnect` і на початку ефекту;
  - повертає ще `drafts`.
- `pages/Host.tsx`: `const [watch, setWatch] = useLiveWatch(game.send, game.status);` → `HostScreen` отримує `watch={watch}`, `onWatch={setWatch}`, `drafts={watch ? game.drafts : null}`, `tilts={watch ? game.tilts : NO_TILTS}`.
- `HostScreen` Props (поки лише прокинути в `LiveAnswers`; перемикач і вигляд — задача 7):
  ```ts
  /** «👁 Наживо» (12b): увімкнено на цьому пристрої; типово так. */
  watch?: boolean;
  onWatch?: (on: boolean) => void;
  /** Останній пакет живих виборів (12b); null — немає чи вимкнено. */
  drafts?: HostDrafts | null;
  ```
- `LiveAnswers.tsx`: рядки без `row.draft` (гілку `draftShown` і фільтри з `row.draft` прибрати); задача 7 поверне чернетки з пропа.

- [ ] **Step 1: Write the failing tests**
  - `useLiveWatch.test.tsx` (`// @vitest-environment jsdom`, `renderHook`):
    - чистий `localStorage` → `true`; `status` `'connecting'` → `send` не викликано; `'live'` → `send('host:live-watch', { on: true })`;
    - `setOn(false)` → `localStorage['quiz:live-watch'] === 'off'`, `send('host:live-watch', { on: false })`; новий `renderHook` → `false`;
    - `status` `'offline'` → `'live'` → `send` ще раз з поточним значенням;
    - `localStorage` кидає виняток → `true`, без падіння.
  - `useGame.test.tsx` (за зразком наявних тестів `sort:tilt` з підробним сокетом): подія `host:drafts` → `result.current.drafts` дорівнює пакету; `state` з іншим `questionIndex` → `null`; `disconnect` → `null`.
  - `live.test.ts`: навмисне — `draft: null` прибрано з двох `toMatchObject`; додати `expect('draft' in row(s, 't1')).toBe(false)`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/live.test.ts apps/web/src/live` → FAIL.
- [ ] **Step 3: Implement.** Фікстури вебу з `LiveRow` — прибрати `draft` там, де падає `pnpm typecheck`. Тести `LiveAnswers.test.tsx` і `HostScreen.test.tsx`, що перевіряли командну чернетку через `row.draft`, тимчасово позначити `it.todo` з посиланням на задачу 7 (задача 7 переписує їх через проп `drafts`) — лише їх.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=1 apps/server && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages apps/web/src
  git commit -m "feat(web): the host device remembers «наживо» (on by default) and declares it after every connect, takes host:drafts batches and drops them on a new question or a lost connection; live rows no longer carry drafts in the host view

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 7. Веб, пульт: перемикач «👁 Наживо», згорнута панель, курсивні живі рядки, міні-мапа

**Files:**
- Create: `apps/web/src/live-drafts.ts`, `apps/web/src/live-drafts.test.ts`
- Modify: `apps/web/src/screens/LiveAnswers.tsx`, `apps/web/src/screens/HostScreen.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/live-drafts.test.ts`, `apps/web/src/screens/LiveAnswers.test.tsx`, `apps/web/src/screens/HostScreen.test.tsx`

**Interfaces:**
- `apps/web/src/live-drafts.ts`:
  ```ts
  import type { DraftValue, HostDrafts, LiveDraft, PublicQuestion, Question } from '@quiz/shared';
  /** Пакет для поточного зрізу: id рядка → живий вибір; інший questionIndex чи trial — порожньо. */
  export function draftsById(batch: HostDrafts | null, questionIndex: number, trial: boolean): Record<string, LiveDraft>;
  /**
   * «вибирає Юпітер», «позначає Кит, Дельфін», «друкує «Осака»», «порядок: …», «з'єднав: …», «повзунок: 7 см»,
   * «ставить точку», «виділено: …», «пише вигадку «…»», «друкує: …» (хмара, «100 до 1»). Тексти варіантів — як answerText.
   */
  export function draftText(draft: DraftValue, correct: Question | null, question: PublicQuestion | null): string;
  /** «змінював 2 рази» (лише changes ≥ 1) і «думає 12 с» (now — час сервера). */
  export function draftMeta(draft: LiveDraft, now: number): string[];
  ```
  `wallPick` — тексти `question.wall.tiles[position]`; `order` — тексти пунктів у порядку `itemIds`; `match` — «ліве → праве» через «, »; `slider` — `sliderValueText` з `format.ts`; `numeric` — `num(value)`.
- `i18n.ts` (нові ключі): `liveToggle: 'Наживо'`, `liveToggleHint: 'Показувати, що гравці вибирають до «Надіслати»'`, `liveNotSent: 'ще не надіслав'`, `liveNotSentTeam: 'ще не надіслали'`, `draftPicks: 'вибирає {text}'`, `draftMarks: 'позначає {list}'`, `draftTypes: 'друкує «{text}»'`, `draftOrder: 'порядок: {list}'`, `draftPairs: 'з’єднав: {list}'`, `draftSlider: 'повзунок: {value}'`, `draftPin: 'ставить точку'`, `draftWall: 'виділено: {list}'`, `draftLie: 'пише вигадку «{text}»'`, `draftWords: 'друкує: {list}'`, `draftChanges_one: 'змінював {count} раз'`, `draftChanges_few: 'змінював {count} рази'`, `draftChanges_many: 'змінював {count} разів'`, `draftThinking: 'думає {seconds} с'`. Ключ `liveDraft` прибрати.
- `LiveAnswers` Props:
  ```ts
  /** Живі вибори за id рядка (12b); {} — немає. */
  drafts?: Record<string, LiveDraft>;
  /** «Наживо» вимкнено (12b): лише заголовок, «Відповіли N з M» і черга бліцу. */
  collapsed?: boolean;
  /** Поправка годинника для «думає N с». */
  offsetMs?: number;
  ```
  - `collapsed`: `body` = `p.meta.live-count` + (`queueShown` ? `blitz` : нічого). Рядки, чипи, `aside` не рендеряться. Розмітка секції, заголовок і ⓘ — як зараз; `section` отримує клас `is-collapsed`.
  - `Row`: `const draft = !row.answered ? drafts[row.id] : undefined;` → з чернеткою:
    ```tsx
    <span className="live-draft">
      <em>{draftText(draft.draft, row.spare ?? view.correct, view.question)}</em>{' '}
      <span className="tag">{t(row.actor !== null ? 'liveNotSentTeam' : 'liveNotSent')}</span>
    </span>
    {draftMeta(draft, now).map((text, i) => <span key={i} className={i === 0 && draft.changes >= 1 ? 'meta live-changes' : 'meta live-thinking'}>{text}</span>)}
    {draft.draft.type === 'pin' && view.question?.pin != null && (
      <div className="live-pin"><PinBoard pin={view.question.pin} imageUrl={view.question.imageUrl} marks={[{ playerId: row.id, nickname: row.nickname, x: draft.draft.x, y: draft.draft.y }]} highlight={row.id} /></div>
    )}
    ```
  - Фільтр видимих рядків: `row.answered || started(row) || drafts[row.id] !== undefined || tilting(row, tilts)`; черга командного бліцу — рядки без відповіді з чернеткою.
  - `now` — `Date.now() + offsetMs`, оновлюється раз на секунду інтервалом лише поки є хоч одна видима чернетка.
- `HostScreen`:
  - шапка:
    ```tsx
    <header className="bar">
      <span>{t('hostTitle')}</span>
      {live && (
        <button type="button" className="btn btn-small live-toggle" aria-pressed={watch} aria-label={t('liveToggle')} title={t('liveToggleHint')} onClick={() => onWatch(!watch)}>
          👁<span className="live-toggle-label"> {t('liveToggle')}</span>
        </button>
      )}
      {view.undo !== null && <UndoButton … />}
      <strong className="code">…</strong>
    </header>
    ```
    (`live` — наявна константа `phase !== 'lobby' && phase !== 'finished'`.)
  - обидва `LiveAnswers` отримують `drafts={draftsById(drafts, view.questionIndex, liveData.kind === 'trial')}`, `collapsed={!watch}`, `offsetMs={offsetMs}`.
- `styles.css`: `.live-toggle` (`white-space: nowrap`; `aria-pressed="false"` — приглушений, `var(--dim)`); `@media (max-width: 400px)` — `.live-toggle-label { display: none; }` **лише якщо** e2e покаже, що шапка не вміщається; `.live-draft em { font-style: italic; }`; `.live-pin { width: min(100%, 10rem); }`; `.live-answers.is-collapsed .live-count { margin: 0; }`.

- [ ] **Step 1: Write the failing tests**
  - `live-drafts.test.ts`:
    - `draftsById` — пакет іншого запитання → `{}`; свого → за `id`;
    - `draftText` — по одному на кожен вид: `single` → «вибирає Б. Юпітер» (або як `answerText` підписує варіант — звірити з `format.ts` і записати фактичний текст), `multi` → «позначає Кит, Дельфін», `text` → «друкує «Осака»», `order`, `match`, `slider` з одиницею, `pin` → «ставить точку», `wallPick` → «виділено: Липа, Клен», `chainWord` → «друкує «лі»», `lie` → «пише вигадку «Вигадка»», `survey` і `wordcloud` → «друкує: чай, кава»;
    - `draftMeta` — `changes: 0`, `at: 10_000`, `now: 22_400` → `['думає 12 с']`; `changes: 2` → `['змінював 2 рази', 'думає 12 с']`; `changes: 5` → «змінював 5 разів»; `changes: 1` → «змінював 1 раз»; `now < at` → «думає 0 с».
  - `LiveAnswers.test.tsx`:
    - рядок Олі без відповіді з чернеткою `multi` → `em` «позначає Київ, Черкаси», тег «ще не надіслав», «змінював 2 рази», «думає 3 с» (фейковий час);
    - командний рядок (`actor: 'Оля'`) → тег «ще не надіслали» (заміна наявного тесту чернетки капітана з задачі 6, `it.todo` прибрати);
    - рядок із відповіддю й старою чернеткою → лише відповідь, без `.live-draft`;
    - чернетка `pin` → `.live-pin .pin-board`;
    - `collapsed` → є `h2` «Відповіді наживо» і «Відповіли 1 з 3», немає `.live-row`, `.live-waiting`, `.live-aside`; для командного бліцу з кнопкою черга (`blitz`) лишається;
    - через 2 с (`vi.advanceTimersByTime(2000)`) «думає 3 с» → «думає 5 с».
  - `HostScreen.test.tsx`:
    - на `question` у шапці є кнопка «Наживо» з `aria-pressed="true"`; дотик → `onWatch(false)`; з `watch={false}` — `aria-pressed="false"` і панель згорнута;
    - у лобі й на `finished` перемикача немає;
    - `drafts` з пакетом іншого `questionIndex` чернетки не показує.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/live-drafts.test.ts apps/web/src/screens/LiveAnswers.test.tsx apps/web/src/screens/HostScreen.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): «👁 Наживо» in the host header — on, live rows show in italics what each player picks, orders or types before «Надіслати» with «ще не надіслав», «змінював N разів» and «думає N с» and a mini map for a pin; off, the panel folds to «Відповіли N з M» and the blitz queue

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 8. Наскрізний сценарій 12b з кадрами

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Помічники поруч зі сценарієм (наявні `socketFrames`, `pickOption`, `field`, `click`, `liveRow`, `expectNoSideScroll`, `expectStageInView`, `HEADER_ONE_LINE`, `POLL`, `afterSplash`, `shot`, `register`, `join`, `exact` — брати як є; `liveRow` і `field` — з 11c, за потреби перенести вище в файлі):
  ```ts
  /** Пакет живих виборів у сокетних кадрах (12b): лише пульт із «наживо». */
  const DRAFTS_EVENT = /\["host:drafts",/;
  /** Скільки пакетів живих виборів отримала сторінка. */
  const draftBatches = (frames: string[]) => frames.filter((frame) => DRAFTS_EVENT.test(frame)).length;
  ```
- Вміст — без тем росії й СРСР. Вікторина `Наживо 12b`, один класичний раунд «Розминка», `leaderboard: 'each'`, `speedBonus: false`, `shuffleOptions: false`, `timeLimit: 60`:
  - `l1` multi «Які з цих тварин — ссавці?» — Кит ✓ / Дельфін ✓ / Акула / Пінгвін, 100 (`id` варіантів `l1-a` … `l1-d`);
  - `l2` text «Столиця Японії?», прийнятні «Токіо», 100;
  - `l3` order «Від найменшого до найбільшого» — Миша / Кіт / Кінь (порядок правильний), 100.
- Гравці: Оля, Петро, Іра. Унікальний рядок, якого ніхто не надсилає: «Осака».

- [ ] **Step 1: Add the scenario** у кінець файлу за зразком 12a:
  ```ts
  it('part 12b: live choices — «👁 Наживо» in a one-line host header on a 375 phone shows in italics what players mark, type and order before «Надіслати» with «ще не надіслав», «змінював N разів» and «думає N с», a one-tap pick shows as an answer, turning it off folds the panel and stops every batch even after a reload, turning it on brings them back, and the stage and other phones never receive a draft', async () => {
    try {
      await live12b();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Підготовка `live12b()`:**
  1. `host = open('host12b', 375, 812)`, `register(host, 'host', 'Ліна Ведуча', 'host12b@example.com')`; `hostFrames = socketFrames(host)`.
  2. Вікторина вище → `POST /api/quizzes`, рядок «Наживо 12b» → «Грати» → `code`, `stageUrl`.
  3. `stage = open('stage12b', 1280, 720)` з `stageFrames`; телефони 375 × 812 `olya`, `petro` (з `petroFrames`), `ira` (з `iraFrames`); `join` «Оля», «Петро», «Іра».
  4. «Почати гру» → `afterSplash` → «Почати раунд» → `afterSplash`.
  5. Локатори: `toggle = host.getByRole('button', { name: 'Наживо', ...exact })`; `panel = host.locator('#live-answers')`; `row(name) = liveRow(host, name)`; `draftOf(name) = row(name).locator('.live-draft em')`.

  **Кроки:**
  1. **Шапка.** На запитанні `l1` `toggle` видно, `aria-pressed="true"`; `host.evaluate(HEADER_ONE_LINE)` → `true` (з «↶ Бали» поруч, якщо вона вже є).
  2. **Позначки до «Надіслати».** Оля торкається «Кит», потім «Дельфін» (не надсилає):
     - `draftOf('Оля')` → «позначає Кит, Дельфін»; `row('Оля').locator('.live-draft .tag')` → «ще не надіслав»; `.live-thinking` має текст `/^думає \d+ с$/`;
     - Петро: «Акула» → дочекатися `draftOf('Петро')` «позначає Акула» → «Кит» → дочекатися «позначає Акула, Кит» → знову «Акула» (зняти) → `draftOf('Петро')` «позначає Кит», `row('Петро').locator('.live-changes')` → «змінював 2 рази»;
     - `expectNoSideScroll(host, 'p12b-host-live')`; кадр `p12b-host-live`;
     - кадр `p12b-phone-draft` (Оля: позначені варіанти й «Відповісти», як і раніше; на екрані немає слів «наживо», «чернетка»).
  3. **Подання.** Оля — «Відповісти» → `row('Оля').locator('.live-answer')` містить «Кит» і «Дельфін», `row('Оля').locator('.live-draft')` → 0.
  4. **Вимкнення.** `toggle` → `aria-pressed="false"`:
     - `panel.locator('.live-row')` → 0; `panel.locator('.live-count')` → «Відповіли 1 з 3»; `panel.locator('.live-waiting')` → 0;
     - `const before = draftBatches(hostFrames)`; Петро торкається «Дельфін»; `host.waitForTimeout(1000)` (вікно пакета ×3 — єдине чекання, бо перевіряємо відсутність); `draftBatches(hostFrames)` → `before`;
     - `host.evaluate(HEADER_ONE_LINE)` → `true`; кадр `p12b-host-off`;
     - `host.reload()` → дочекатися `panel`; `toggle` → `aria-pressed="false"`; Петро торкається «Пінгвін»; `host.waitForTimeout(1000)`; `draftBatches(hostFrames)` → `before` (вибір пам'ятає пристрій, сервер нічого не шле).
  5. **Увімкнення.** `toggle` → `aria-pressed="true"` → `draftOf('Петро')` → «позначає Кит, Дельфін, Пінгвін» (пакет іде одразу після `host:live-watch`). Петро й Іра надсилають (Петро — як є, Іра — «Кит», «Дельфін» → «Відповісти») → «Запитання закрите» → «Показати відповідь» → «Далі» → «Наступне запитання» → `afterSplash`.
  6. **Текст.** `l2`: Іра друкує «Осака» в «Ваша відповідь» (не надсилає) → `draftOf('Іра')` → «друкує «Осака»»; кадр `p12b-host-typing`. Іра стирає й друкує «Токіо» → `draftOf('Іра')` → «друкує «Токіо»», «змінював N разів» є. Іра «Відповісти»; Оля «Токіо», Петро «Кіото» → «Запитання закрите»; `row('Іра').locator('.live-answer')` → «Токіо».
  7. **Сцена без змін.** До розкриття `l2`: `expectStageInView(stage, 'p12b-stage-question')`; кадр `p12b-stage-question`.
  8. **Впорядкування.** «Показати відповідь» → «Далі» → «Наступне запитання» → `afterSplash`; `l3`: Оля переставляє «Кінь» угору (наявний помічник `arrange` чи стрілки поля впорядкування, як у сценаріях з `order`) → `draftOf('Оля')` починається з «порядок: Кінь»; усі надсилають; розкриття; «Далі» до кінця.
  9. **Таємність у кадрах.**
     - `draftBatches(hostFrames) > 0`; `hostFrames.join(NL)` містить «Осака»;
     - для `stageFrames`, `petroFrames`, `iraFrames`: `draftBatches` → 0; `join(NL)` не містить «Осака»; не містить `"optionIds":["l1-a","l1-b"]` (Олині позначки до подання — у Петра й сцени; власні кадри Іри перевіряються лише на `host:drafts`, бо «Осака» друкувала вона сама й сервер їй цього не шле — тож і в її кадрах «Осаки» немає);
     - у кадрах пульта після вимкнення (крок 4) жодного пакета — уже перевірено лічильником.
  10. `expect(problems).toEqual([])`.
- [ ] **Step 2: Run** `pnpm build`, потім у фоні `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 12b"` → PASS. Переглянути кадри `p12b-*`:
  - шапка пульта на 375 px: «Пульт», «👁 Наживо» (або «👁»), «↶ Бали», код — в один рядок, перемикач видно увімкненим і вимкненим;
  - курсивні рядки з «ще не надіслав», «змінював…», «думає…» не налазять одне на одне, сторінка не прокручується вбік;
  - згорнута панель — заголовок і один рядок;
  - сцена 1280 × 720 і телефон — без нових написів.

  Навмисна правка наявного сценарію: «part 11c: team live answers…» — `getByText('чернетка', exact)` → `getByText('ще не надіслали', exact)`. Інші сценарії, що падають через перемикач у шапці (наприклад, `getByRole('button', { name: /Наживо/ })` без `exact` чи рахунок кнопок шапки), лагодити лише звуженням селектора (`exact`, `.player-row`), не сном і не зміною вмісту. Кожну правку назвати в коміті й у звіті задачі.
- [ ] **Step 3: Повний прогін — один раз, у фоні:** `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts` → усі сценарії PASS. Особливо — 10j, 11c, 11d (чернетки капітана й нахил на пульті, тепер через «наживо»). Якщо PGlite чи браузер падає з браком пам'яті, перезапустити лише сценарії, що впали (`-t "<назва>"`), і назвати це в звіті.
- [ ] **Step 4: Commit**
  ```bash
  git add apps/server/e2e
  git commit -m "test: part 12b end-to-end — «👁 Наживо» in a one-line 375 host header shows marks, typing and order before «Надіслати» with «ще не надіслав», «змінював N разів» and «думає N с», a sent answer replaces the draft, off folds the panel and stops every batch across a reload, on brings them back, and the stage and other phones never receive a draft; the 11c team draft tag reads «ще не надіслали»

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```
